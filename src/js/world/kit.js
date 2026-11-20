// Small modelling kit: everything in the building is made from these primitives.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const DISPLAY_FONT = '"Bricolage Grotesque", "Trebuchet MS", system-ui, sans-serif';

const matCache = new Map();

/** Cached standard material. opts: rough, metal, emissive, glow, flat */
export function mat(color, opts = {}) {
    const key = `${color}|${opts.rough ?? ''}|${opts.metal ?? ''}|${opts.emissive ?? ''}|${opts.glow ?? ''}|${opts.flat ? 1 : 0}`;
    if (!matCache.has(key)) {
        matCache.set(key, new THREE.MeshStandardMaterial({
            color,
            roughness: opts.rough ?? 0.85,
            metalness: opts.metal ?? 0,
            emissive: opts.emissive ?? 0x000000,
            emissiveIntensity: opts.glow ?? 1,
            flatShading: !!opts.flat,
        }));
    }
    return matCache.get(key);
}

function place(mesh, h, o) {
    const [x, y, z] = o.at ?? [0, 0, 0];
    // `at` is the bottom-centre of the object, so furniture sits on y.
    mesh.position.set(x, y + h / 2, z);
    if (o.rx) mesh.rotation.x = o.rx;
    if (o.ry) mesh.rotation.y = o.ry;
    if (o.rz) mesh.rotation.z = o.rz;
    const glowing = o.emissive !== undefined;
    mesh.castShadow = o.shadow ?? !glowing;
    mesh.receiveShadow = !glowing;
    if (o.parent) o.parent.add(mesh);
    return mesh;
}

/** Box whose bottom-centre sits at opts.at. opts.r rounds the edges. */
export function box(w, h, d, color, o = {}) {
    const r = o.r ?? 0;
    const geo = r > 0
        ? new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2))
        : new THREE.BoxGeometry(w, h, d);
    return place(new THREE.Mesh(geo, o.material ?? mat(color, o)), h, o);
}

/** Cylinder (rTop, rBottom) whose bottom-centre sits at opts.at. */
export function cyl(rTop, rBottom, h, color, o = {}) {
    const geo = new THREE.CylinderGeometry(rTop, rBottom, h, o.seg ?? 24);
    return place(new THREE.Mesh(geo, o.material ?? mat(color, o)), h, o);
}

export function ball(r, color, o = {}) {
    const geo = o.flat ? new THREE.IcosahedronGeometry(r, o.detail ?? 1) : new THREE.SphereGeometry(r, 20, 14);
    const m = place(new THREE.Mesh(geo, o.material ?? mat(color, o)), 0, o);
    if (o.scale) m.scale.set(...o.scale);
    return m;
}

export function group(parent, at = [0, 0, 0], ry = 0) {
    const g = new THREE.Group();
    g.position.set(...at);
    g.rotation.y = ry;
    if (parent) parent.add(g);
    return g;
}

/** Canvas-backed texture. draw(ctx, w, h) paints it. */
export function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
}

/** Unlit plane showing a texture: screens, signs, posters. Centre at opts.at. */
export function screen(w, h, texture, o = {}) {
    const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, transparent: !!o.transparent })
    );
    m.material.color.setScalar(o.brightness ?? 1);
    const [x, y, z] = o.at ?? [0, 0, 0];
    m.position.set(x, y, z);
    if (o.rx) m.rotation.x = o.rx;
    if (o.ry) m.rotation.y = o.ry;
    if (o.parent) o.parent.add(m);
    return m;
}

/** Glowing text sign painted on a transparent canvas. */
export function neonText(text, color, o = {}) {
    const h = o.px ?? 128;
    const font = `700 ${h * 0.62}px ${DISPLAY_FONT}`;
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = font;
    const w = Math.ceil(probe.measureText(text).width + h * 0.8);
    const tex = canvasTex(w, h, (ctx) => {
        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = color;
        for (const blur of [h * 0.3, h * 0.14, h * 0.05]) {
            ctx.shadowBlur = blur;
            ctx.fillStyle = color;
            ctx.fillText(text, w / 2, h / 2);
        }
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(text, w / 2, h / 2);
    });
    const height = o.height ?? 0.4;
    return screen(height * (w / h), height, tex, { ...o, transparent: true });
}

/** Deterministic random numbers from a string, so each item keeps its look. */
export function rng(seed) {
    let h = 1779033703 ^ String(seed).length;
    for (const ch of String(seed)) {
        h = Math.imul(h ^ ch.charCodeAt(0), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return () => {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
}

export function pick(rand, list) {
    return list[Math.floor(rand() * list.length)];
}

/** Marks an object as clickable. `label` shows in the tooltip. */
export function hotspot(object, id, label, pipAt) {
    object.userData.hotspot = { id, label };
    const pip = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
    );
    const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.07, 0.085, 24),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, toneMapped: false })
    );
    pip.add(halo);
    pip.position.set(...pipAt);
    pip.userData.pip = { baseY: pipAt[1], phase: Math.random() * 6 };
    pip.visible = false;
    object.add(pip);
    object.userData.pip = pip;
    return object;
}

/** Loads an image as a texture, falling back silently if it is missing. */
export function imageTex(url, onLoad) {
    new THREE.TextureLoader().load(url, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        onLoad(t);
    }, undefined, () => {});
}
