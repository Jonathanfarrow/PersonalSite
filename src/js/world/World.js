// Renderer, post-processing, camera moves and picking for the 3D house.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { DIM, buildHouse } from './house.js';

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
        vignette: { value: 0.3 },
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
                    sum += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * r / resolution).rgb;
                    total += 1.0;
                }
            }
            vec3 color = sum / total;
            vec2 q = vUv - 0.5;
            color *= 1.0 - vignette * smoothstep(0.25, 0.95, dot(q, q) * 2.0);
            gl_FragColor = vec4(color, 1.0);
        }`,
};

export class World {
    /** Loads the model, then starts rendering. */
    static async create(canvas, site, handlers = {}) {
        const world = new World(canvas, handlers);
        const built = await buildHouse(world.scene, site);
        world.tick = built.tick;
        world.rooms = built.rooms.map((room) => ({
            ...room,
            bounds: new THREE.Box3(
                new THREE.Vector3(-DIM.W / 2, room.y, -DIM.D / 2),
                new THREE.Vector3(DIM.W / 2, room.y + room.height, DIM.D / 2)
            ),
        }));
        world.start();
        return world;
    }

    constructor(canvas, handlers) {
        this.canvas = canvas;
        this.handlers = handlers;
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        // ?quality=high|lite pins the effects level; otherwise it adapts to the device.
        const pinned = new URLSearchParams(location.search).get('quality');
        this.lite = pinned ? pinned === 'lite'
            : window.matchMedia('(max-width: 899px), (pointer: coarse)').matches || (navigator.hardwareConcurrency ?? 8) <= 4;
        this.governor = pinned ? null : { level: 0, frames: 0, time: 0 };
        this.current = null;      // room id, or null for the whole house
        this.insets = { left: 0, right: 0, top: 0, bottom: 0 };
        this.pointer = new THREE.Vector2(0, 0);
        this.parallax = new THREE.Vector2(0, 0);
        this.hovered = null;
        this.hoveredRoom = null;
        this.rooms = [];

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.lite ? 1.5 : 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.NoToneMapping;   // the bake is already graded

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0xb9a48f, 90, 420);
        this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 800);
        this.raycaster = new THREE.Raycaster();

        const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.lite ? 2 : 4 });
        this.composer = new EffectComposer(this.renderer, target);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.7, 0.88);
        this.composer.addPass(this.bloom);
        this.focus = new ShaderPass(FocusShader);
        this.composer.addPass(this.focus);
        this.composer.addPass(new OutputPass());
    }

    start() {
        this.resize();
        this.cam = this.viewFor(null);
        this.tween = null;
        this.applyCamera(this.cam);
        this.bind();
        this.clock = new THREE.Clock();
        this.renderer.setAnimationLoop(() => this.frame());
    }

    // ---- camera -----------------------------------------------------------

    /** Camera pose that frames a room (or the whole house) in the free part of the viewport. */
    viewFor(roomId) {
        const { w, h } = this.size;
        const { left, right, top, bottom } = this.insets;
        const fw = Math.max(w - left - right, 160);
        const fh = Math.max(h - top - bottom, 160);
        const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
        const room = this.rooms.find((r) => r.id === roomId);

        let target, boxW, boxH, az, el, depth;
        if (room) {
            target = new THREE.Vector3(0, room.y + room.height / 2 - 0.05, -0.2);
            boxW = DIM.W + 1.3; boxH = room.height + 0.4; az = -0.22; el = 0.11; depth = DIM.D / 2 + 0.2;
        } else {
            const wide = fw / fh > 1.05;
            target = new THREE.Vector3(wide ? 1.0 : 0.3, 6.0, 0);
            boxW = wide ? 15 : 10.2; boxH = 13.6; az = -0.3; el = 0.1; depth = DIM.D / 2;
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
     * Fly to a room (null = the whole house). `insets` are the parts of the
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

    /** First view: the camera drifts down from above the rooftops and settles on the house. */
    opening(roomId) {
        const view = this.viewFor(roomId);
        if (this.reducedMotion || roomId) {
            this.cam = view;
            return;
        }
        const offset = view.pos.clone().sub(view.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.45).multiplyScalar(1.25);
        offset.y += 6;
        this.cam = { pos: view.target.clone().add(offset), target: view.target.clone().add(new THREE.Vector3(0, 1.0, 0)), ox: view.ox, oy: view.oy };
        this.moveTo(view, 3.2, easeOut);
    }

    /** Screen position (CSS px) of a room's label anchor: the left edge of that floor. */
    labelPosition(roomId) {
        const room = this.rooms.find((r) => r.id === roomId);
        const p = new THREE.Vector3(-DIM.W / 2 - DIM.WALL, room.y + Math.min(room.height, 2.9) / 2, DIM.D / 2).project(this.camera);
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
        const hits = this.raycaster.intersectObjects(room.spots, false);
        this.setHover(hits.length ? hits[0].object : null, e);
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
        const lo = toUv(room ? room.y - 0.15 : 0.2);
        const hi = toUv(room ? room.y + room.height + 0.1 : 12.5);
        const half = (hi - lo) / 2 + (room ? 0.02 : 0.08);
        const strength = (room ? 5 : 2.5) * this.renderer.getPixelRatio();
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
        if (g.level === 2) this.bloom.enabled = false;
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

        for (const room of this.rooms) {
            const showPips = room.id === this.current && !this.tween;
            for (const spot of room.spots) {
                const pip = spot.userData.pip;
                pip.visible = showPips;
                if (!showPips) continue;
                const hot = spot === this.hovered;
                const phase = (time * 0.8 + pip.userData.pip.phase) % 1;
                pip.position.y = pip.userData.pip.baseY + (this.reducedMotion ? 0 : Math.sin(time * 2.2 + pip.userData.pip.phase) * 0.03);
                pip.scale.setScalar(hot ? 1.5 : 1);
                // the pip sits inside rotated groups, so face it to the camera in world space
                pip.quaternion.copy(this.camera.quaternion);
                pip.children[0].scale.setScalar(1 + (this.reducedMotion ? 0.3 : phase));
                pip.children[0].material.opacity = this.reducedMotion ? 0.6 : 0.8 * (1 - phase);
            }
        }

        if (!this.reducedMotion) this.tick?.(time, dt);

        this.composer.render(dt);
        this.handlers.onFrame?.();
        this.govern(raw);
    }
}
