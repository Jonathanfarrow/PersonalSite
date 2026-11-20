// Renderer, lights, post-processing, camera moves and picking for the 3D building.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { DIM, floorY, buildShell, buildStreet, buildSky } from './building.js';
import { buildStudio, STUDIO_LOOK } from './studio.js';
import { buildOffice, OFFICE_LOOK } from './office.js';
import { buildGames, GAMES_LOOK } from './games.js';

// Bottom storey first.
const ROOMS = [
    { id: 'games', build: buildGames, look: GAMES_LOOK },
    { id: 'office', build: buildOffice, look: OFFICE_LOOK },
    { id: 'studio', build: buildStudio, look: STUDIO_LOOK },
];

const FOV = 30;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 4);

// Miniature-style focus: sharp across a horizontal band, soft above and below, plus a vignette.
const FocusShader = {
    uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        focusY: { value: 0.5 },
        focusHalf: { value: 0.5 },
        strength: { value: 0 },
        vignette: { value: 0.35 },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        uniform float focusY, focusHalf, strength, vignette;
        varying vec2 vUv;
        void main() {
            float away = smoothstep(focusHalf, focusHalf + 0.3, abs(vUv.y - focusY));
            float radius = away * strength;
            vec3 sum = texture2D(tDiffuse, vUv).rgb;
            float total = 1.0;
            if (radius > 0.3) {
                for (int i = 1; i <= 20; i++) {
                    float f = float(i);
                    float r = sqrt(f / 20.0) * radius;
                    float a = f * 2.39996;
                    vec3 s = texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * r / resolution).rgb;
                    float w = 1.0 + dot(s, vec3(0.3333)) * 0.6;
                    sum += s * w;
                    total += w;
                }
            }
            vec3 color = sum / total;
            vec2 q = vUv - 0.5;
            color *= 1.0 - vignette * smoothstep(0.25, 0.95, dot(q, q) * 2.0);
            gl_FragColor = vec4(color, 1.0);
        }`,
};

export class World {
    constructor(canvas, data, handlers = {}) {
        this.canvas = canvas;
        this.handlers = handlers;
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        // Phones and low-power machines skip the most expensive effect. ?quality=high|lite pins it.
        const pinned = new URLSearchParams(location.search).get('quality');
        this.lite = pinned ? pinned === 'lite'
            : window.matchMedia('(max-width: 899px), (pointer: coarse)').matches || (navigator.hardwareConcurrency ?? 8) <= 4;
        this.governor = pinned ? null : { level: 0, frames: 0, time: 0 };
        this.current = null;      // room id or null for the whole building
        this.insets = { left: 0, right: 0, top: 0, bottom: 0 };
        this.pointer = new THREE.Vector2(0, 0);
        this.parallax = new THREE.Vector2(0, 0);
        this.hovered = null;
        this.hoveredRoom = null;
        this.tickers = [];

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.lite ? 1.5 : 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x2a2350, 40, 110);
        this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 400);
        this.raycaster = new THREE.Raycaster();

        this.build(data);
        this.setupPost();
        this.resize();
        this.cam = this.viewFor(null);
        this.tween = null;
        this.applyCamera(this.cam);

        // Nothing that casts a shadow moves, so the shadow maps are drawn once.
        this.renderer.shadowMap.autoUpdate = false;
        this.renderer.shadowMap.needsUpdate = true;

        this.bind();
        this.clock = new THREE.Clock();
        this.renderer.setAnimationLoop(() => this.frame());
    }

    build(data) {
        this.tickers.push(buildSky(this.scene).tick);
        this.tickers.push(buildStreet(this.scene).tick);
        this.tickers.push(buildShell(this.scene, ROOMS.map((r) => r.look)).tick);

        this.scene.add(new THREE.HemisphereLight(0x7f88e8, 0x1c1526, 0.42));
        // Cool moonlight from the front-left; the rooms' own lamps are warm against it.
        const moon = new THREE.DirectionalLight(0x9db2ff, 0.85);
        moon.position.set(-9, 15, 15);
        moon.target.position.set(0, 4.5, 0);
        moon.castShadow = true;
        moon.shadow.mapSize.set(2048, 2048);
        Object.assign(moon.shadow.camera, { left: -12, right: 12, top: 10, bottom: -9, near: 1, far: 55 });
        moon.shadow.bias = -0.0005;
        moon.shadow.normalBias = 0.03;
        moon.shadow.radius = 5;
        this.scene.add(moon, moon.target);

        this.rooms = ROOMS.map((def, i) => {
            const y = floorY(i) + 0.04;
            const built = def.build(this.scene, data[def.id] ?? {});
            built.group.position.y = y;
            if (built.tick) this.tickers.push(built.tick);

            // Ceiling spot: the pool of light everything in the room sits in.
            const spot = new THREE.SpotLight(def.look.light, 0, 12, 1.2, 1, 1.2);
            spot.position.set(0.4, y + 2.86, 1.9);
            spot.target.position.set(0, y + 0.6, -1.6);
            spot.castShadow = true;
            spot.shadow.mapSize.set(1024, 1024);
            spot.shadow.bias = -0.0015;
            spot.shadow.normalBias = 0.02;
            spot.shadow.radius = 6;
            spot.shadow.camera.near = 0.3;
            spot.shadow.camera.far = 9;
            const fill = new THREE.PointLight(def.look.light, 0, 9, 1.5);
            fill.position.set(0, y + 2.2, 0.2);
            const accent = new THREE.PointLight(def.look.accent, 0, 7.5, 1.5);
            accent.position.set(...(def.look.accentAt ?? [-2.8, 1.2, 0.4]));
            accent.position.y += y;
            this.scene.add(spot, spot.target, fill, accent);

            const bounds = new THREE.Box3(
                new THREE.Vector3(-DIM.W / 2, y, -DIM.D / 2),
                new THREE.Vector3(DIM.W / 2, y + DIM.FLOOR - DIM.SLAB, DIM.D / 2)
            );
            return { id: def.id, index: i, y, look: def.look, spots: built.spots, spot, fill, accent, bounds, lift: 0, power: 0 };
        });
    }

    setupPost() {
        const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.lite ? 2 : 4 });
        this.composer = new EffectComposer(this.renderer, target);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        if (!this.lite) {
            this.ao = new GTAOPass(this.scene, this.camera, 1, 1);
            this.ao.blendIntensity = 0.9;
            this.ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.15, samples: 12, screenSpaceRadius: false });
            this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
            this.composer.addPass(this.ao);
        }
        this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.26, 0.6, 1.0);
        this.composer.addPass(this.bloom);
        this.focus = new ShaderPass(FocusShader);
        this.composer.addPass(this.focus);
        this.composer.addPass(new OutputPass());
    }

    // ---- camera -----------------------------------------------------------

    /** Camera pose that frames a room (or the whole building) in the free part of the viewport. */
    viewFor(roomId) {
        const { w, h } = this.size;
        const { left, right, top, bottom } = this.insets;
        const fw = Math.max(w - left - right, 160);
        const fh = Math.max(h - top - bottom, 160);
        const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
        const room = this.rooms.find((r) => r.id === roomId);

        let target, boxW, boxH, az, el, depth;
        if (room) {
            target = new THREE.Vector3(0, room.y + 1.38, -0.2);
            boxW = DIM.W + 1.3; boxH = DIM.FLOOR + 0.25; az = 0.2; el = 0.12; depth = DIM.D / 2 + 0.2;
        } else {
            const topY = floorY(this.rooms.length) + 1.9;
            target = new THREE.Vector3(0, topY / 2 - 0.3, 0);
            boxW = DIM.W + 4.6; boxH = topY + 2.2; az = 0.46; el = 0.16; depth = DIM.D / 2;
        }
        const dist = Math.max((boxH / 2) / (tan * (fh / h)), (boxW / 2) / (tan * (w / h) * (fw / w))) + depth;
        const pos = new THREE.Vector3(
            Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)
        ).multiplyScalar(dist).add(target);
        return { pos, target, ox: (right - left) / 2, oy: (bottom - top) / 2 };
    }

    applyCamera(v) {
        const { w, h } = this.size;
        this.camera.position.copy(v.pos);
        if (!this.reducedMotion) {
            // gentle pointer parallax
            const amount = this.current ? 0.22 : 0.5;
            this.camera.position.x += this.parallax.x * amount;
            this.camera.position.y += this.parallax.y * amount * 0.5;
        }
        this.camera.lookAt(v.target);
        this.camera.setViewOffset(w, h, v.ox, v.oy, w, h);
    }

    moveTo(view, seconds = 1.25, curve = ease) {
        if (this.reducedMotion || seconds === 0) {
            this.cam = view;
            this.tween = null;
            return;
        }
        const from = { pos: this.cam.pos.clone(), target: this.cam.target.clone(), ox: this.cam.ox, oy: this.cam.oy };
        this.tween = { from, to: view, t: 0, seconds, curve };
    }

    /**
     * Fly to a room (null = the whole building). `insets` are the parts of the
     * viewport covered by UI, so the scene is framed in what is left.
     */
    goTo(roomId, insets = {}) {
        const next = { left: 0, right: 0, top: 0, bottom: 0, ...insets };
        const sameInsets = Object.keys(next).every((k) => next[k] === this.insets[k]);
        const sameRoom = roomId === this.current;
        if (sameRoom && sameInsets && this.started) return;
        this.insets = next;
        if (!sameRoom) {
            this.current = roomId;
            this.hoveredRoom = null;
            this.setHover(null);
        }
        if (!this.started) {
            this.started = true;
            this.opening(roomId);
            return;
        }
        this.moveTo(this.viewFor(roomId), sameRoom ? 0.8 : 1.25);
    }

    /** First view: the building sits dark, the camera cranes down and the floors light up one by one. */
    opening(roomId) {
        const view = this.viewFor(roomId);
        if (this.reducedMotion || roomId) {
            this.cam = view;
            this.rooms.forEach((r) => { r.powerAt = 0; });
            return;
        }
        const offset = view.pos.clone().sub(view.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.55).multiplyScalar(1.3);
        offset.y += 7;
        this.cam = { pos: view.target.clone().add(offset), target: view.target.clone().add(new THREE.Vector3(0, 1.2, 0)), ox: view.ox, oy: view.oy };
        this.moveTo(view, 3.4, easeOut);
        this.rooms.forEach((r, i) => { r.powerAt = 0.55 + i * 0.45; });
    }

    /** Screen position (CSS px) of a room's label anchor. */
    labelPosition(roomId) {
        const room = this.rooms.find((r) => r.id === roomId);
        const p = new THREE.Vector3(-DIM.W / 2 - DIM.WALL, room.y + 1.45, DIM.D / 2).project(this.camera);
        return { x: (p.x * 0.5 + 0.5) * this.size.w, y: (-p.y * 0.5 + 0.5) * this.size.h };
    }

    // ---- interaction ------------------------------------------------------

    bind() {
        const c = this.canvas;
        this.resizeObserver = new ResizeObserver(() => {
            this.resize();
            if (this.tween) this.tween.to = this.viewFor(this.current);
            else if (this.started) this.cam = this.viewFor(this.current);
        });
        this.resizeObserver.observe(c.parentElement);

        const aim = (e) => {
            const r = c.getBoundingClientRect();
            this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        };
        c.addEventListener('pointermove', (e) => {
            aim(e);
            if (e.pointerType !== 'touch') this.pick(e);
        });
        c.addEventListener('pointerleave', () => {
            this.pointer.set(0, 0);
            this.setHover(null);
            this.hoveredRoom = null;
        });
        c.addEventListener('pointerdown', (e) => { this.down = { x: e.clientX, y: e.clientY }; });
        c.addEventListener('pointerup', (e) => {
            if (!this.down || Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 8) return;
            aim(e);
            this.pick(e, true);
            if (this.current === null && this.hoveredRoom) {
                this.handlers.onRoom?.(this.hoveredRoom.id);
            } else if (this.hovered) {
                this.handlers.onSpot?.(this.current, this.hovered.userData.hotspot.id);
            }
            if (e.pointerType === 'touch') { this.setHover(null); this.hoveredRoom = null; }
        });
    }

    pick(e, force = false) {
        // Mid-flight the picture is moving; only a deliberate click picks then.
        if (this.tween && !force) return;
        this.raycaster.setFromCamera(this.pointer, this.camera);
        if (this.current === null) {
            let best = null;
            let bestDist = Infinity;
            const hit = new THREE.Vector3();
            for (const room of this.rooms) {
                if (this.raycaster.ray.intersectBox(room.bounds, hit)) {
                    const d = hit.distanceTo(this.camera.position);
                    if (d < bestDist) { best = room; bestDist = d; }
                }
            }
            this.hoveredRoom = best;
            this.canvas.style.cursor = best ? 'pointer' : '';
            this.handlers.onRoomHover?.(best?.id ?? null);
            return;
        }
        const room = this.rooms.find((r) => r.id === this.current);
        const hits = this.raycaster.intersectObjects(room.spots, true);
        let spot = null;
        for (const h of hits) {
            let o = h.object;
            if (o.userData.pip) continue;
            while (o && !o.userData.hotspot) o = o.parent;
            if (o) { spot = o; break; }
        }
        this.setHover(spot, e);
    }

    setHover(spot, e) {
        this.hovered = spot;
        this.canvas.style.cursor = spot ? 'pointer' : '';
        this.handlers.onHover?.(spot ? { label: spot.userData.hotspot.label, x: e.clientX, y: e.clientY } : null);
    }

    // ---- loop -------------------------------------------------------------

    get size() {
        return this._size ?? { w: 1, h: 1 };
    }

    resize() {
        const el = this.canvas.parentElement;
        const w = Math.max(el.clientWidth, 1);
        const h = Math.max(el.clientHeight, 1);
        this._size = { w, h };
        this.renderer.setSize(w, h, false);
        this.composer.setSize(w, h);
        const ratio = this.renderer.getPixelRatio();
        this.focus.uniforms.resolution.value.set(w * ratio, h * ratio);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    /** Keeps the room you are in sharp and lets the floors above and below fall soft. */
    updateFocus(dt) {
        const u = this.focus.uniforms;
        const room = this.rooms.find((r) => r.id === this.current);
        const toUv = (worldY) => new THREE.Vector3(0, worldY, DIM.D / 2).project(this.camera).y * 0.5 + 0.5;
        const lo = toUv(room ? room.y - 0.1 : 0.2);
        const hi = toUv(room ? room.y + DIM.FLOOR - 0.1 : floorY(this.rooms.length) + 1.6);
        const half = (hi - lo) / 2 + (room ? 0.02 : 0.06);
        const strength = (room ? 6 : 3) * this.renderer.getPixelRatio();
        const k = 1 - Math.exp(-dt * 5);
        u.focusY.value += ((lo + hi) / 2 - u.focusY.value) * k;
        u.focusHalf.value += (half - u.focusHalf.value) * k;
        u.strength.value += (strength - u.strength.value) * k;
    }

    /** Sheds effects, cheapest loss first, if the machine cannot hold a smooth frame rate. */
    govern(raw) {
        const g = this.governor;
        if (!g || g.level >= 3 || raw > 0.5) return;
        g.frames++;
        g.time += raw;
        if (g.frames < 50) return;
        const slow = g.time / g.frames > 1 / 36;
        g.frames = 0;
        g.time = 0;
        if (!slow) return;
        g.level++;
        if (g.level === 1) this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
        if (g.level === 2 && this.ao) this.ao.enabled = false;
        if (g.level === 3) { this.renderer.setPixelRatio(1); this.focus.enabled = false; }
        this.composer.setPixelRatio(this.renderer.getPixelRatio());
        this.resize();
    }

    frame() {
        if (document.hidden) { this.clock.getDelta(); return; }
        const raw = this.clock.getDelta();
        const dt = Math.min(raw, 0.05);
        const time = this.clock.elapsedTime;

        if (this.tween) {
            const tw = this.tween;
            tw.t = Math.min(tw.t + raw / tw.seconds, 1); // real time, so slow devices are not slow-motion
            const k = tw.curve(tw.t);
            this.cam = {
                pos: tw.from.pos.clone().lerp(tw.to.pos, k),
                target: tw.from.target.clone().lerp(tw.to.target, k),
                ox: THREE.MathUtils.lerp(tw.from.ox, tw.to.ox, k),
                oy: THREE.MathUtils.lerp(tw.from.oy, tw.to.oy, k),
            };
            if (tw.t === 1) this.tween = null;
        }
        this.parallax.lerp(this.pointer, 1 - Math.exp(-dt * 3));
        this.applyCamera(this.cam);
        this.updateFocus(dt);

        if (this.started) this.sinceStart = (this.sinceStart ?? 0) + raw;
        for (const room of this.rooms) {
            // Lights come on floor by floor, with a flicker as they catch.
            if (room.powerAt !== undefined && this.sinceStart >= room.powerAt) {
                const age = this.sinceStart - room.powerAt;
                const flicker = age < 0.35 && !this.reducedMotion ? (Math.sin(age * 90) > 0 ? 1 : 0.25) : 1;
                room.power = Math.min(age / 0.12, 1) * flicker;
            }
            // The room you point at (or stand in) glows a little brighter.
            const lit = room === this.hoveredRoom || room.id === this.current ? 1 : 0;
            room.lift += (lit - room.lift) * (1 - Math.exp(-dt * 8));
            const level = room.power * (1 + room.lift * 0.3);
            room.spot.intensity = (room.look.spot ?? 36) * level;
            room.fill.intensity = (room.look.fill ?? 5) * level;
            room.accent.intensity = (room.look.accentPower ?? 10) * room.power * (1 + room.lift * 0.5);

            const showPips = room.id === this.current && !this.tween;
            for (const spot of room.spots) {
                const s = spot.userData;
                s.hover = (s.hover ?? 0) + ((spot === this.hovered ? 1 : 0) - (s.hover ?? 0)) * (1 - Math.exp(-dt * 12));
                spot.scale.setScalar(1 + s.hover * 0.035);
                const pip = s.pip;
                pip.visible = showPips;
                if (showPips) {
                    const phase = (time * 0.8 + pip.userData.pip.phase) % 1;
                    pip.position.y = pip.userData.pip.baseY + (this.reducedMotion ? 0 : Math.sin(time * 2.2 + pip.userData.pip.phase) * 0.03);
                    pip.lookAt(this.camera.position);
                    pip.children[0].scale.setScalar(1 + (this.reducedMotion ? 0.3 : phase));
                    pip.children[0].material.opacity = this.reducedMotion ? 0.6 : 0.8 * (1 - phase);
                }
            }
        }

        if (!this.reducedMotion) for (const tick of this.tickers) tick?.(time, dt);

        this.composer.render(dt);
        this.handlers.onFrame?.();
        this.govern(raw);
    }
}
