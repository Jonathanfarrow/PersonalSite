// The building shell (cut open at the front and right) and the street around it.
import * as THREE from 'three';
import { box, cyl, ball, group, mat, canvasTex, screen, neonText, rng, plaster, brick } from './kit.js';

export const DIM = { W: 8, D: 5, FLOOR: 3.2, SLAB: 0.25, WALL: 0.25, BASE: 0.3 };

/** Y of the floor surface for storey i (0 = ground). */
export const floorY = (i) => DIM.BASE + i * DIM.FLOOR;

const CUT = 0xeadfce; // the sliced edge of walls and slabs
const DARK = 0x1b1d28;

function nightWindowTexture(seed) {
    const rand = rng(seed);
    return canvasTex(128, 160, (ctx, w, h) => {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#1a2362');
        grad.addColorStop(0.75, '#5b3a86');
        grad.addColorStop(1, '#e08a66');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 14; i++) {
            ctx.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.6})`;
            ctx.fillRect(rand() * w, rand() * h * 0.6, 1.5, 1.5);
        }
        for (let x = 0; x < w; x += 16 + rand() * 12) {
            const bh = 20 + rand() * 46;
            ctx.fillStyle = '#0d1136';
            ctx.fillRect(x, h - bh, 20, bh);
            ctx.fillStyle = '#f6c177';
            for (let yy = h - bh + 5; yy < h - 3; yy += 8) if (rand() < 0.5) ctx.fillRect(x + 4 + rand() * 10, yy, 3, 3);
        }
    });
}

export function buildShell(scene, rooms) {
    const { W, D, FLOOR, SLAB, WALL, BASE } = DIM;
    const g = group(scene);
    const H = FLOOR * rooms.length;
    const outerW = W + WALL * 2;
    const bricks = brick(0x3a3552, '#1c1a2c', 2, 5);
    const bricksWide = brick(0x3a3552, '#1c1a2c', 4, 5);
    const cut = mat(CUT, { rough: 0.9 });

    // Plinth and front step
    box(outerW + 0.8, BASE, D + 1.2, 0x5d6076, { at: [0, 0, 0.1], parent: g, r: 0.04 });
    box(outerW + 0.3, 0.12, 0.5, 0x6d7088, { at: [0, 0.02, D / 2 + 0.8], parent: g, r: 0.03 });

    // Outer walls. The front and the right-hand side are cut away so you can see in.
    box(WALL, H, D + WALL, 0, { at: [-(W / 2 + WALL / 2), BASE, -WALL / 2], parent: g, material: bricks });
    box(WALL, H, 0.05, 0, { at: [-(W / 2 + WALL / 2), BASE, D / 2 + 0.025], parent: g, material: cut });
    box(outerW, H, WALL, 0, { at: [0, BASE, -(D / 2 + WALL / 2)], parent: g, material: bricksWide });
    box(0.05, H, WALL, 0, { at: [outerW / 2 + 0.025, BASE, -(D / 2 + WALL / 2)], parent: g, material: cut });

    // Slabs between storeys, plus the roof
    for (let i = 1; i <= rooms.length; i++) {
        box(outerW, SLAB, D + WALL, 0x34364a, { at: [0, floorY(i) - SLAB, -WALL / 2], parent: g });
        box(outerW, SLAB, 0.05, 0, { at: [0, floorY(i) - SLAB, D / 2 + 0.025], parent: g, material: cut });
        box(0.05, SLAB, D + WALL, 0, { at: [outerW / 2 + 0.025, floorY(i) - SLAB, -WALL / 2], parent: g, material: cut });
    }

    // Interior finishes per room
    rooms.forEach((room, i) => {
        const y = floorY(i);
        const inner = FLOOR - SLAB;
        box(W, inner, 0.03, 0, { at: [0, y, -D / 2 + 0.015], parent: g, material: plaster(room.wall, 5, 2), shadow: false });
        box(0.03, inner, D, 0, { at: [-(W / 2 - 0.015), y, 0], parent: g, material: plaster(room.wall, 3, 2), shadow: false });
        // Painted lower band on the back wall
        if (room.dado) box(W, 0.95, 0.036, room.dado, { at: [0, y + 0.04, -D / 2 + 0.018], parent: g, shadow: false, rough: 0.9 });
        const floor = box(W + WALL, 0.04, D, room.floor, { at: [WALL / 2, y, 0], parent: g, shadow: false, material: room.floorMaterial?.() });
        floor.receiveShadow = true;
        box(W, 0.11, 0.04, room.trim, { at: [0, y + 0.04, -D / 2 + 0.05], parent: g, shadow: false });
        box(0.04, 0.11, D, room.trim, { at: [-(W / 2 - 0.05), y + 0.04, 0], parent: g, shadow: false });
        box(W, 0.08, 0.05, room.trim, { at: [0, y + inner - 0.08, -D / 2 + 0.05], parent: g, shadow: false });

        // Window in the left wall looking out over the city
        const win = group(g, [-(W / 2 - 0.04), y + 1.62, 1.0], Math.PI / 2);
        box(1.3, 1.5, 0.07, room.trim, { at: [0, -0.75, 0], parent: win, shadow: false });
        screen(1.16, 1.36, nightWindowTexture('w' + i), { at: [0, 0, 0.04], parent: win, brightness: 1.0 });
        box(0.04, 1.36, 0.03, room.trim, { at: [0, -0.68, 0.045], parent: win, shadow: false });
        box(1.16, 0.04, 0.03, room.trim, { at: [0, -0.02, 0.045], parent: win, shadow: false });
        box(1.4, 0.05, 0.16, room.trim, { at: [0, -0.8, 0.07], parent: win });

        // Track lighting on the ceiling
        const rail = group(g, [0.3, y + inner, 1.5]);
        box(3.4, 0.04, 0.05, DARK, { at: [0, -0.04, 0], parent: rail, shadow: false });
        for (const x of [-1.3, 0, 1.3]) {
            const head = cyl(0.07, 0.09, 0.16, DARK, { at: [x, -0.2, 0], parent: rail, shadow: false, rx: 0.35 });
            const lens = new THREE.Mesh(new THREE.CircleGeometry(0.075, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(room.light).multiplyScalar(2.2), toneMapped: false }));
            lens.rotation.x = Math.PI / 2;
            lens.position.y = -0.081;
            head.add(lens);
        }
    });

    const roof = buildRoof(g, floorY(rooms.length), outerW, bricks, bricksWide);
    return {
        tick(time) {
            roof.tick(time);
        },
    };
}

function buildRoof(g, y, outerW, bricks, bricksWide) {
    const { D, WALL } = DIM;
    // Deck and parapet
    box(outerW - WALL * 2, 0.03, D - 0.2, 0x4a3f4f, { at: [0, y, 0], parent: g, shadow: false }).receiveShadow = true;
    for (const side of [-1, 1]) {
        box(WALL, 0.45, D + WALL, 0, { at: [side * (outerW / 2 - WALL / 2), y, -WALL / 2], parent: g, material: bricks });
    }
    box(outerW, 0.45, WALL, 0, { at: [0, y, -(D / 2 + WALL / 2)], parent: g, material: bricksWide });
    box(outerW, 0.2, 0.12, 0x3a3552, { at: [0, y, D / 2 - 0.06], parent: g });

    // Water tank
    const tank = group(g, [2.6, y, -1.2]);
    for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
        cyl(0.04, 0.04, 0.7, 0x22242f, { at: [x, 0, z], parent: tank, seg: 8 });
    }
    cyl(0.62, 0.62, 0.95, 0x8a5f45, { at: [0, 0.7, 0], parent: tank, rough: 0.7 });
    for (const h of [0.85, 1.5]) cyl(0.635, 0.635, 0.05, 0x3a2c28, { at: [0, h, 0], parent: tank, metal: 0.5, rough: 0.5 });
    cyl(0.05, 0.68, 0.42, 0x4a3a35, { at: [0, 1.65, 0], parent: tank });

    // Aerial with a warning light, and a vent
    cyl(0.025, 0.025, 1.9, 0x9aa0b5, { at: [-3.2, y, -1.6], parent: g, seg: 8, metal: 0.6, rough: 0.4 });
    for (const [h, w] of [[1.2, 0.7], [1.45, 0.5], [1.7, 0.3]]) {
        box(w, 0.025, 0.025, 0x9aa0b5, { at: [-3.2, y + h, -1.6], parent: g });
    }
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3b3b, toneMapped: false }));
    beacon.position.set(-3.2, y + 1.95, -1.6);
    g.add(beacon);
    box(0.8, 0.5, 0.6, 0x8d92a6, { at: [-1.6, y, -1.5], parent: g, r: 0.04, metal: 0.3, rough: 0.6 });
    cyl(0.2, 0.2, 0.03, 0x22242f, { at: [-1.6, y + 0.5, -1.5], parent: g });

    // Roof garden: planters and a deck chair
    for (const [x, z, s] of [[-2.9, 0.9, 1], [-2.3, 1.3, 0.75], [3.2, 0.9, 0.9]]) {
        cyl(0.24 * s, 0.19 * s, 0.34 * s, 0xc9694f, { at: [x, y, z], parent: g });
        ball(0.3 * s, 0x3f8f69, { at: [x, y + 0.52 * s, z], parent: g, flat: true });
        ball(0.2 * s, 0x4fa57b, { at: [x + 0.12 * s, y + 0.74 * s, z - 0.05], parent: g, flat: true });
    }
    const chair = group(g, [1.2, y, -0.9], 0.5);
    box(0.55, 0.05, 1.0, 0xe9dfcf, { at: [0, 0.3, 0], parent: chair, rx: 0.12 });
    box(0.55, 0.6, 0.05, 0xe9dfcf, { at: [0, 0.34, -0.55], parent: chair, rx: -0.5 });
    for (const [x, z] of [[-0.25, -0.4], [0.25, -0.4], [-0.25, 0.4], [0.25, 0.4]]) cyl(0.02, 0.02, 0.32, 0x8b5e3c, { at: [x, 0, z], parent: chair, seg: 6 });

    // The cat on the parapet
    const cat = group(g, [-2.0, y + 0.2, D / 2 - 0.06], 0.35);
    const fur = mat(0x1a1a22, { rough: 0.8 });
    ball(0.17, 0, { at: [0, 0.15, 0], parent: cat, material: fur, scale: [0.9, 1, 1.25] });
    ball(0.12, 0, { at: [0, 0.37, 0.13], parent: cat, material: fur });
    for (const x of [-0.07, 0.07]) cyl(0.001, 0.045, 0.09, 0, { at: [x, 0.44, 0.13], parent: cat, material: fur, seg: 4 });
    for (const x of [-0.045, 0.045]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: 0xbfff7a, toneMapped: false }));
        eye.position.set(x, 0.39, 0.235);
        cat.add(eye);
    }
    const tail = [];
    let joint = group(cat, [0, 0.06, -0.2]);
    for (let i = 0; i < 5; i++) {
        cyl(0.028, 0.03, 0.12, 0, { at: [0, 0, 0], parent: joint, material: fur, seg: 6 });
        tail.push(joint);
        joint = group(joint, [0, 0.11, 0]);
    }
    tail[0].rotation.x = -1.9;

    // Rooftop sign
    for (const x of [-1.7, 1.7]) cyl(0.035, 0.035, 0.75, 0x22242f, { at: [x, y, 1.6], parent: g, seg: 8 });
    box(4.3, 0.04, 0.04, 0x22242f, { at: [0, y + 0.72, 1.6], parent: g });
    for (const x of [-1.7, 0, 1.7]) box(0.03, 0.9, 0.03, 0x22242f, { at: [x, y + 0.74, 1.57], parent: g });
    const sign = neonText('FARROW', '#ffb45e', { height: 0.95, at: [0, y + 1.22, 1.6], parent: g, px: 256 });
    const signGlow = new THREE.PointLight(0xffb45e, 6, 7, 1.6);
    signGlow.position.set(0, y + 1.2, 2.0);
    g.add(signGlow);

    // String lights swagged between poles
    const bulbs = [];
    const posts = [[-outerW / 2 + 0.2, D / 2 - 0.1], [0, D / 2 - 0.1], [outerW / 2 - 0.2, D / 2 - 0.1]];
    for (const [x, z] of posts) cyl(0.02, 0.02, 1.0, 0x22242f, { at: [x, y + 0.2, z], parent: g, seg: 6 });
    for (let s = 0; s < 2; s++) {
        for (let i = 1; i < 12; i++) {
            const t = i / 12;
            const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }));
            b.position.set(posts[s][0] + (posts[s + 1][0] - posts[s][0]) * t, y + 1.18 - Math.sin(t * Math.PI) * 0.3, D / 2 - 0.1);
            g.add(b);
            bulbs.push(b);
        }
    }

    return {
        tick(time) {
            // The sign buzzes now and then.
            const buzz = Math.sin(time * 0.7) > 0.96 && Math.sin(time * 47) > 0 ? 0.35 : 1;
            sign.material.color.setScalar(1.7 * buzz);
            signGlow.intensity = 6 * buzz;
            beacon.material.color.setScalar(Math.sin(time * 2.5) > 0.3 ? 3 : 0.25).multiply(new THREE.Color(1, 0.2, 0.2));
            bulbs.forEach((b, i) => b.material.color.setRGB(1, 0.85, 0.63).multiplyScalar(1.7 + Math.sin(time * 2 + i * 1.7) * 0.4));
            tail.forEach((j, i) => { if (i) j.rotation.z = Math.sin(time * 1.6 - i * 0.6) * 0.22; });
        },
    };
}

export function buildStreet(scene) {
    const g = group(scene);
    // Wet tarmac: glossy enough to hold the glow of the building
    const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 48), mat(0x14172b, { rough: 0.38, metal: 0.15 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    g.add(ground);

    // Pavement, kerb and lane markings
    box(26, 0.08, 6.4, 0x40445c, { at: [0, 0, 4.0], parent: g, shadow: false, rough: 0.7 }).receiveShadow = true;
    for (let x = -12; x <= 12; x += 2) box(0.03, 0.082, 6.4, 0x2c3046, { at: [x, 0, 4.0], parent: g, shadow: false });
    box(26, 0.12, 0.2, 0x767a93, { at: [0, 0, 7.3], parent: g, shadow: false });
    for (let x = -18; x <= 18; x += 4) box(1.6, 0.012, 0.14, 0xb9bdd6, { at: [x, 0, 10.6], parent: g, shadow: false, rough: 0.5 });

    // Street lamp
    const lamp = group(g, [8.3, 0.08, 4.2], Math.PI);
    cyl(0.12, 0.16, 0.25, DARK, { at: [0, 0, 0], parent: lamp, seg: 12 });
    cyl(0.045, 0.06, 4.2, DARK, { at: [0, 0.25, 0], parent: lamp, seg: 10 });
    box(0.9, 0.05, 0.05, DARK, { at: [0.4, 4.4, 0], parent: lamp });
    cyl(0.2, 0.12, 0.16, DARK, { at: [0.8, 4.22, 0], parent: lamp, seg: 12 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.3, 1.4), toneMapped: false }));
    bulb.position.set(0.8, 4.2, 0);
    lamp.add(bulb);
    const glow = new THREE.SpotLight(0xffc27a, 60, 12, 0.9, 1, 1.4);
    glow.position.set(0.8, 4.15, 0);
    glow.target.position.set(0.8, 0, 0);
    lamp.add(glow, glow.target);

    // Tree
    const tree = group(g, [7.6, 0, -3.2]);
    cyl(0.12, 0.2, 2.0, 0x4a352b, { at: [0, 0, 0], parent: tree, seg: 8 });
    const crown = [];
    for (const [x, y, z, r] of [[0, 2.6, 0, 1.15], [0.7, 2.2, 0.3, 0.75], [-0.65, 2.3, -0.2, 0.8], [0.1, 3.5, 0.1, 0.8], [0.4, 3.0, -0.5, 0.7]]) {
        crown.push(ball(r, 0x2f6b55, { at: [x, y, z], parent: tree, flat: true, shadow: false }));
    }

    // Bench, planters, bicycle
    const bench = group(g, [4.6, 0.08, 5.4], -0.2);
    for (let i = 0; i < 3; i++) box(1.6, 0.04, 0.13, 0x8b5e3c, { at: [0, 0.42, -0.15 + i * 0.15], parent: bench, r: 0.01 });
    for (let i = 0; i < 2; i++) box(1.6, 0.13, 0.04, 0x8b5e3c, { at: [0, 0.6 + i * 0.17, -0.24], parent: bench, r: 0.01 });
    for (const x of [-0.65, 0.65]) {
        box(0.06, 0.42, 0.42, DARK, { at: [x, 0, 0], parent: bench });
        box(0.06, 0.5, 0.05, DARK, { at: [x, 0.42, -0.24], parent: bench });
    }
    for (const [x, z] of [[-5.0, 3.0], [-5.7, 2.4], [5.6, 2.6]]) {
        box(0.55, 0.45, 0.55, 0x6b4a3a, { at: [x, 0.08, z], parent: g, r: 0.03 });
        ball(0.36, 0x3d8a66, { at: [x, 0.78, z], parent: g, flat: true });
        ball(0.22, 0x4fa57b, { at: [x + 0.15, 0.98, z + 0.1], parent: g, flat: true });
    }
    const bike = group(g, [-5.6, 0.08, 4.3], 0.25);
    bike.rotation.z = 0.12;
    const steel = mat(0xe07a5f, { metal: 0.4, rough: 0.4 });
    for (const x of [-0.5, 0.5]) {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.022, 8, 28), mat(0x15161d));
        wheel.position.set(x, 0.34, 0);
        wheel.castShadow = true;
        bike.add(wheel);
    }
    box(0.03, 0.62, 0.03, 0, { at: [-0.22, 0.32, 0], parent: bike, material: steel, rz: -0.75 });
    box(0.03, 0.6, 0.03, 0, { at: [0.2, 0.32, 0], parent: bike, material: steel, rz: 0.55 });
    box(0.62, 0.03, 0.03, 0, { at: [0.02, 0.78, 0], parent: bike, material: steel });
    box(0.03, 0.42, 0.03, 0, { at: [0.42, 0.5, 0], parent: bike, material: steel, rz: -0.3 });
    box(0.2, 0.04, 0.09, 0x15161d, { at: [-0.3, 0.86, 0], parent: bike, r: 0.015 });
    box(0.03, 0.03, 0.4, 0x15161d, { at: [0.36, 0.95, 0], parent: bike });

    buildSkyline(g);
    return {
        tick(time) {
            crown.forEach((c, i) => { c.rotation.z = Math.sin(time * 0.6 + i) * 0.025; });
        },
    };
}

function buildSkyline(g) {
    const rand = rng('skyline');
    for (let i = 0; i < 22; i++) {
        const w = 4 + rand() * 5;
        const h = 4 + rand() * 11;
        const x = -84 + i * 8 + rand() * 3;
        const z = -50 - rand() * 22;
        const tex = canvasTex(64, 128, (ctx, cw, ch) => {
            ctx.fillStyle = '#10132c';
            ctx.fillRect(0, 0, cw, ch);
            for (let yy = 6; yy < ch - 6; yy += 10) {
                for (let xx = 6; xx < cw - 6; xx += 10) {
                    if (rand() < 0.22) {
                        ctx.fillStyle = rand() < 0.75 ? '#f6c177' : '#8fd3ff';
                        ctx.globalAlpha = 0.3 + rand() * 0.45;
                        ctx.fillRect(xx, yy, 4, 5);
                    }
                }
            }
        });
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshBasicMaterial({ map: tex, fog: true }));
        m.position.set(x, h / 2, z);
        m.userData.noAO = true;
        g.add(m);
    }
}

export function buildSky(scene) {
    scene.background = new THREE.Color(0x070a1f);
    const tex = canvasTex(16, 1024, (ctx, w, h) => {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#070a1f');
        grad.addColorStop(0.3, '#10153a');
        grad.addColorStop(0.41, '#2c2460');
        grad.addColorStop(0.465, '#6d3a6c');
        grad.addColorStop(0.493, '#c46c62');
        grad.addColorStop(0.5, '#e39a62');
        grad.addColorStop(0.505, '#2a2350');
        grad.addColorStop(1, '#2a2350');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    });
    const dome = new THREE.Mesh(
        new THREE.SphereGeometry(150, 32, 32),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    dome.userData.noAO = true;
    scene.add(dome);

    const rand = rng('stars');
    const layers = [0, 1].map((layer) => {
        const pts = [];
        for (let i = 0; i < 280; i++) {
            const a = rand() * Math.PI * 2;
            const r = 70 + rand() * 20;
            pts.push(Math.cos(a) * r, 14 + rand() * 60, -Math.abs(Math.sin(a) * r) - 10);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const stars = new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0xdfe6ff, size: layer ? 0.32 : 0.2, sizeAttenuation: true, transparent: true, opacity: 0.85, fog: false,
        }));
        scene.add(stars);
        return stars;
    });

    const moon = new THREE.Mesh(
        new THREE.CircleGeometry(2.6, 40),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.4, 1.2), fog: false, toneMapped: false })
    );
    moon.position.set(-26, 30, -60);
    moon.userData.noAO = true;
    scene.add(moon);

    // Slow clouds catching the last of the sunset
    const cloudTex = canvasTex(256, 96, (ctx, w, h) => {
        for (let i = 0; i < 26; i++) {
            const x = 40 + rand() * (w - 80), y = h * 0.5 + (rand() - 0.5) * 26, r = 14 + rand() * 26;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, 'rgba(255,190,170,0.22)');
            grad.addColorStop(1, 'rgba(255,190,170,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
    });
    const clouds = [];
    for (let i = 0; i < 6; i++) {
        const c = screen(26 + rand() * 20, 7 + rand() * 4, cloudTex, { transparent: true, brightness: 0.9, at: [-70 + i * 28, 10 + rand() * 16, -70 - rand() * 12] });
        c.material.fog = false;
        scene.add(c);
        clouds.push(c);
    }

    return {
        tick(time, dt) {
            layers[0].material.opacity = 0.65 + Math.sin(time * 1.3) * 0.2;
            layers[1].material.opacity = 0.65 + Math.sin(time * 0.9 + 2) * 0.25;
            for (const c of clouds) {
                c.position.x += dt * 0.35;
                if (c.position.x > 95) c.position.x = -95;
            }
        },
    };
}
