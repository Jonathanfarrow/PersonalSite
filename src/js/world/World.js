// Renderer, lights, camera moves and picking for the 3D building.
import * as THREE from 'three';
import { DIM, floorY, buildShell, buildStreet, buildSky } from './building.js';
import { buildStudio, STUDIO_LOOK } from './studio.js';
import { buildOffice, OFFICE_LOOK } from './office.js';
import { buildGames, GAMES_LOOK, checkerFloorMaterial } from './games.js';

// Bottom storey first.
const ROOMS = [
    { id: 'games', build: buildGames, look: GAMES_LOOK },
    { id: 'office', build: buildOffice, look: OFFICE_LOOK },
    { id: 'studio', build: buildStudio, look: STUDIO_LOOK },
];

const FOV = 30;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class World {
    constructor(canvas, data, handlers = {}) {
        this.canvas = canvas;
        this.handlers = handlers;
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.current = null;      // room id or null for the whole building
        this.insets = { left: 0, right: 0, top: 0, bottom: 0 };
        this.pointer = new THREE.Vector2(0, 0);
        this.parallax = new THREE.Vector2(0, 0);
        this.hovered = null;
        this.hoveredRoom = null;

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x2a2350, 40, 110);
        this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 400);
        this.raycaster = new THREE.Raycaster();

        this.build(data);
        this.resize();
        this.cam = this.viewFor(null);
        this.tween = null;
        this.applyCamera(this.cam);

        this.bind();
        this.clock = new THREE.Clock();
        this.renderer.setAnimationLoop(() => this.frame());
    }

    build(data) {
        buildSky(this.scene);
        buildStreet(this.scene);
        const looks = ROOMS.map((r) => ({ ...r.look }));
        looks[0].floorMaterial = checkerFloorMaterial();
        buildShell(this.scene, looks);

        this.scene.add(new THREE.HemisphereLight(0x8f95ff, 0x1c1526, 0.7));
        const key = new THREE.DirectionalLight(0xffead6, 1.25);
        key.position.set(6, 15, 16);
        key.target.position.set(0, 4.5, 0);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        Object.assign(key.shadow.camera, { left: -10, right: 10, top: 9, bottom: -8, near: 1, far: 50 });
        key.shadow.bias = -0.0005;
        key.shadow.normalBias = 0.03;
        key.shadow.radius = 4;
        this.scene.add(key, key.target);

        this.rooms = ROOMS.map((def, i) => {
            const y = floorY(i) + 0.04;
            const built = def.build(this.scene, data[def.id] ?? {});
            built.group.position.y = y;

            const main = new THREE.PointLight(def.look.light, 26, 11, 1.6);
            main.position.set(0, y + 2.45, 0.9);
            const accent = new THREE.PointLight(def.look.accent, 10, 7, 1.6);
            accent.position.set(i % 2 ? 2.8 : -2.8, y + 1.3, 0.2);
            this.scene.add(main, accent);

            const bounds = new THREE.Box3(
                new THREE.Vector3(-DIM.W / 2, y, -DIM.D / 2),
                new THREE.Vector3(DIM.W / 2, y + DIM.FLOOR - DIM.SLAB, DIM.D / 2)
            );
            return { id: def.id, index: i, y, spots: built.spots, main, accent, bounds, lift: 0 };
        });
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

    moveTo(view, seconds = 1.25) {
        if (this.reducedMotion || seconds === 0) {
            this.cam = view;
            this.tween = null;
            return;
        }
        const from = { pos: this.cam.pos.clone(), target: this.cam.target.clone(), ox: this.cam.ox, oy: this.cam.oy };
        this.tween = { from, to: view, t: 0, seconds };
    }

    /**
     * Fly to a room (null = the whole building). `insets` are the parts of the
     * viewport covered by UI, so the scene is framed in what is left.
     */
    goTo(roomId, insets = {}) {
        const next = { left: 0, right: 0, top: 0, bottom: 0, ...insets };
        const sameInsets = Object.keys(next).every((k) => next[k] === this.insets[k]);
        const sameRoom = roomId === this.current;
        if (sameRoom && sameInsets) return;
        this.insets = next;
        if (!sameRoom) {
            this.current = roomId;
            this.hoveredRoom = null;
            this.setHover(null);
        }
        this.moveTo(this.viewFor(roomId), sameRoom ? 0.8 : 1.25);
    }

    /** Screen position (CSS px) of a room's label anchor. */
    labelPosition(roomId) {
        const room = this.rooms.find((r) => r.id === roomId);
        const p = new THREE.Vector3(-DIM.W / 2 - DIM.WALL, room.y + 1.45, DIM.D / 2).project(this.camera);
        return { x: (p.x * 0.5 + 0.5) * this.size.w, y: (-p.y * 0.5 + 0.5) * this.size.h, behind: p.z > 1 };
    }

    // ---- interaction ------------------------------------------------------

    bind() {
        const c = this.canvas;
        this.resizeObserver = new ResizeObserver(() => {
            this.resize();
            this.moveTo(this.viewFor(this.current), 0);
        });
        this.resizeObserver.observe(c.parentElement);

        c.addEventListener('pointermove', (e) => {
            const r = c.getBoundingClientRect();
            this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
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
            const r = c.getBoundingClientRect();
            this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
            this.pick(e);
            if (this.current === null && this.hoveredRoom) {
                this.handlers.onRoom?.(this.hoveredRoom.id);
            } else if (this.hovered) {
                this.handlers.onSpot?.(this.current, this.hovered.userData.hotspot.id);
            }
            if (e.pointerType === 'touch') { this.setHover(null); this.hoveredRoom = null; }
        });
    }

    pick(e) {
        if (this.tween) return;
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
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    frame() {
        if (document.hidden) return;
        const raw = this.clock.getDelta();
        const dt = Math.min(raw, 0.05);
        const time = this.clock.elapsedTime;

        if (this.tween) {
            const tw = this.tween;
            tw.t = Math.min(tw.t + Math.min(raw, 0.25) / tw.seconds, 1); // real time, so slow devices are not slow-motion
            const k = ease(tw.t);
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

        for (const room of this.rooms) {
            // The room you point at (or stand in) glows a little brighter.
            const lit = room === this.hoveredRoom || room.id === this.current ? 1 : 0;
            room.lift += (lit - room.lift) * (1 - Math.exp(-dt * 8));
            room.main.intensity = 26 * (1 + room.lift * 0.45);
            room.accent.intensity = 10 * (1 + room.lift * 0.6);

            const showPips = room.id === this.current && !this.tween;
            for (const spot of room.spots) {
                const s = spot.userData;
                s.hover = (s.hover ?? 0) + ((spot === this.hovered ? 1 : 0) - (s.hover ?? 0)) * (1 - Math.exp(-dt * 12));
                spot.scale.setScalar(1 + s.hover * 0.035);
                const pip = s.pip;
                pip.visible = showPips;
                if (showPips) {
                    const bob = this.reducedMotion ? 0 : Math.sin(time * 2.2 + pip.userData.pip.phase) * 0.03;
                    pip.position.y = pip.userData.pip.baseY + bob;
                    pip.lookAt(this.camera.position);
                    pip.children[0].scale.setScalar(1 + (this.reducedMotion ? 0.3 : (time * 0.8 + pip.userData.pip.phase) % 1));
                    pip.children[0].material.opacity = this.reducedMotion ? 0.6 : 0.8 * (1 - ((time * 0.8 + pip.userData.pip.phase) % 1));
                }
            }
        }

        this.renderer.render(this.scene, this.camera);
        this.handlers.onFrame?.();
    }
}
