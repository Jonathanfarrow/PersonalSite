// The building shell (cut open at the front) and the street around it.
import * as THREE from 'three';
import { box, cyl, ball, group, mat, canvasTex, neonText, rng } from './kit.js';

export const DIM = { W: 8, D: 5, FLOOR: 3.2, SLAB: 0.25, WALL: 0.25, BASE: 0.3 };

/** Y of the floor surface for storey i (0 = ground). */
export const floorY = (i) => DIM.BASE + i * DIM.FLOOR;

const BRICK = 0x2a2f4a;
const CUT = 0xe9dfcf; // the sliced edge of walls and slabs

export function buildShell(scene, rooms) {
    const { W, D, FLOOR, SLAB, WALL, BASE } = DIM;
    const g = group(scene);
    const H = FLOOR * rooms.length;
    const outerW = W + WALL * 2;

    box(outerW + 0.8, BASE, D + 1.2, 0x55586b, { at: [0, 0, 0.1], parent: g, r: 0.04 });

    // Outer walls. The front and the right-hand side are cut away so you can see in.
    box(WALL, H, D + WALL, BRICK, { at: [-(W / 2 + WALL / 2), BASE, -WALL / 2], parent: g });
    box(WALL, H, 0.05, CUT, { at: [-(W / 2 + WALL / 2), BASE, D / 2 + 0.025], parent: g, rough: 0.95 });
    box(outerW, H, WALL, BRICK, { at: [0, BASE, -(D / 2 + WALL / 2)], parent: g });
    box(0.05, H, WALL, CUT, { at: [outerW / 2 + 0.025, BASE, -(D / 2 + WALL / 2)], parent: g, rough: 0.95 });

    // Slabs between storeys, plus the roof
    for (let i = 1; i <= rooms.length; i++) {
        box(outerW, SLAB, D + WALL, 0x3a3d52, { at: [0, floorY(i) - SLAB, -WALL / 2], parent: g });
        box(outerW, SLAB, 0.05, CUT, { at: [0, floorY(i) - SLAB, D / 2 + 0.025], parent: g, rough: 0.95 });
        box(0.05, SLAB, D + WALL, CUT, { at: [outerW / 2 + 0.025, floorY(i) - SLAB, -WALL / 2], parent: g, rough: 0.95 });
    }

    // Interior finishes per room
    rooms.forEach((room, i) => {
        const y = floorY(i);
        const inner = FLOOR - SLAB;
        const wall = mat(room.wall, { rough: 0.95 });
        box(W, inner, 0.03, 0, { at: [0, y, -D / 2 + 0.015], parent: g, material: wall, shadow: false });
        box(0.03, inner, D, 0, { at: [-(W / 2 - 0.015), y, 0], parent: g, material: wall, shadow: false });
        const floor = box(W + WALL, 0.04, D, room.floor, { at: [WALL / 2, y, 0], parent: g, shadow: false, material: room.floorMaterial });
        floor.receiveShadow = true;
        // Skirting board
        box(W, 0.1, 0.03, room.trim, { at: [0, y + 0.04, -D / 2 + 0.045], parent: g, shadow: false });
    });

    buildRoof(g, floorY(rooms.length), outerW);
    return g;
}

function buildRoof(g, y, outerW) {
    const { D, WALL } = DIM;
    // Parapet
    for (const side of [-1, 1]) {
        box(WALL, 0.45, D + WALL, BRICK, { at: [side * (outerW / 2 - WALL / 2), y, -WALL / 2], parent: g });
    }
    box(outerW, 0.45, WALL, BRICK, { at: [0, y, -(D / 2 + WALL / 2)], parent: g });
    box(outerW, 0.2, 0.12, BRICK, { at: [0, y, D / 2 - 0.06], parent: g });

    // Water tank
    const tank = group(g, [2.6, y, -1.2]);
    for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
        cyl(0.04, 0.04, 0.7, 0x22242f, { at: [x, 0, z], parent: tank, seg: 8 });
    }
    cyl(0.62, 0.62, 0.95, 0x7a5a45, { at: [0, 0.7, 0], parent: tank });
    cyl(0.05, 0.66, 0.4, 0x4a3a35, { at: [0, 1.65, 0], parent: tank });

    // Aerial and vent
    cyl(0.025, 0.025, 1.8, 0x9aa0b5, { at: [-3.2, y, -1.6], parent: g, seg: 8 });
    for (const [h, w] of [[1.2, 0.7], [1.45, 0.5], [1.7, 0.3]]) {
        box(w, 0.025, 0.025, 0x9aa0b5, { at: [-3.2, y + h, -1.6], parent: g });
    }
    box(0.8, 0.5, 0.6, 0x8d92a6, { at: [-1.6, y, -1.5], parent: g, r: 0.04 });

    // Rooftop sign
    for (const x of [-1.7, 1.7]) cyl(0.035, 0.035, 0.75, 0x22242f, { at: [x, y, 1.6], parent: g, seg: 8 });
    box(4.3, 0.04, 0.04, 0x22242f, { at: [0, y + 0.72, 1.6], parent: g });
    neonText('FARROW', '#ffb45e', { height: 0.95, at: [0, y + 1.22, 1.6], parent: g, px: 256 });

    // String lights along the parapet
    const bulbs = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false });
    for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const sag = Math.sin(t * Math.PI * 4) * 0.06;
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), bulbs);
        b.position.set(-outerW / 2 + 0.2 + t * (outerW - 0.4), y + 0.32 - Math.abs(sag), D / 2 - 0.02);
        g.add(b);
    }
}

export function buildStreet(scene) {
    const g = group(scene);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), mat(0x161a2e, { rough: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    g.add(ground);

    // Pavement and kerb
    box(22, 0.08, 6, 0x3b3f55, { at: [0, 0, 4.2], parent: g, shadow: false }).receiveShadow = true;
    box(22, 0.1, 0.18, 0x6c7087, { at: [0, 0, 7.2], parent: g, shadow: false });

    // Street lamp
    const lamp = group(g, [8.3, 0.08, 4.2], Math.PI);
    cyl(0.12, 0.16, 0.25, 0x1b1d28, { at: [0, 0, 0], parent: lamp, seg: 12 });
    cyl(0.045, 0.06, 4.2, 0x1b1d28, { at: [0, 0.25, 0], parent: lamp, seg: 10 });
    box(0.9, 0.05, 0.05, 0x1b1d28, { at: [0.4, 4.4, 0], parent: lamp });
    cyl(0.2, 0.12, 0.16, 0x1b1d28, { at: [0.8, 4.22, 0], parent: lamp, seg: 12 });
    ball(0.11, 0xffe2b0, { at: [0.8, 4.18, 0], parent: lamp, emissive: 0xffc878, glow: 3 });
    const glow = new THREE.PointLight(0xffc27a, 18, 12, 2);
    glow.position.set(0.8, 4.0, 0);
    lamp.add(glow);

    // Tree
    const tree = group(g, [7.4, 0, -3.2]);
    cyl(0.12, 0.2, 2.0, 0x4a352b, { at: [0, 0, 0], parent: tree, seg: 8 });
    for (const [x, y, z, r] of [[0, 2.6, 0, 1.15], [0.7, 2.2, 0.3, 0.75], [-0.65, 2.3, -0.2, 0.8], [0.1, 3.5, 0.1, 0.8]]) {
        ball(r, 0x2f6b55, { at: [x, y, z], parent: tree, flat: true });
    }

    // Bench and planters
    const bench = group(g, [4.6, 0.08, 5.4], -0.2);
    box(1.6, 0.07, 0.45, 0x8b5e3c, { at: [0, 0.42, 0], parent: bench, r: 0.02 });
    box(1.6, 0.4, 0.06, 0x8b5e3c, { at: [0, 0.6, -0.22], parent: bench, r: 0.02 });
    for (const x of [-0.65, 0.65]) box(0.07, 0.42, 0.42, 0x1b1d28, { at: [x, 0, 0], parent: bench });
    for (const [x, z] of [[-5.0, 3.0], [-5.7, 2.4], [5.6, 2.6]]) {
        box(0.5, 0.45, 0.5, 0x6b4a3a, { at: [x, 0.08, z], parent: g, r: 0.03 });
        ball(0.34, 0x3d8a66, { at: [x, 0.75, z], parent: g, flat: true });
    }

    buildSkyline(g);
    return g;
}

function buildSkyline(g) {
    const rand = rng('skyline');
    for (let i = 0; i < 17; i++) {
        const w = 4 + rand() * 5;
        const h = 5 + rand() * 13;
        const x = -62 + i * 8 + rand() * 3;
        const z = -38 - rand() * 16;
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
    scene.add(dome);

    const rand = rng('stars');
    const pts = [];
    for (let i = 0; i < 500; i++) {
        const a = rand() * Math.PI * 2;
        const r = 70 + rand() * 20;
        pts.push(Math.cos(a) * r, 14 + rand() * 60, -Math.abs(Math.sin(a) * r) - 10);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0xdfe6ff, size: 0.22, sizeAttenuation: true, transparent: true, opacity: 0.85, fog: false,
    }));
    scene.add(stars);

    const moon = new THREE.Mesh(
        new THREE.CircleGeometry(2.6, 40),
        new THREE.MeshBasicMaterial({ color: 0xfff1d6, fog: false, toneMapped: false })
    );
    moon.position.set(-26, 30, -60);
    scene.add(moon);
    return { stars };
}

