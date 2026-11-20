// Top floor: the music studio. Each record on the wall is one track.
import * as THREE from 'three';
import { box, cyl, ball, group, mat, canvasTex, screen, neonText, rng, pick, hotspot, imageTex } from './kit.js';

export const STUDIO_LOOK = { wall: 0x3a2147, floor: 0x5b3a2c, trim: 0x24132e, light: 0xff9d6c, accent: 0xc77dff };

const SLEEVE_PALETTES = [
    ['#ff7a59', '#2b1b3d', '#ffd166'],
    ['#7b5cff', '#10122b', '#5ef2d6'],
    ['#f25f8b', '#2a1030', '#ffe3a3'],
    ['#2ec4b6', '#0e2233', '#ff9f1c'],
    ['#ffbe3b', '#3a1630', '#ff5d73'],
    ['#8ecae6', '#1b2040', '#ffb703'],
];

/** Generated cover art, unique per track title. */
function sleeveTexture(track, index) {
    const rand = rng(track.title + index);
    const [a, b, c] = SLEEVE_PALETTES[index % SLEEVE_PALETTES.length];
    return canvasTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = b;
        ctx.fillRect(0, 0, w, h);
        const style = Math.floor(rand() * 3);
        if (style === 0) {
            for (let i = 7; i > 0; i--) {
                ctx.fillStyle = i % 2 ? a : c;
                ctx.beginPath();
                ctx.arc(w * (0.3 + rand() * 0.4), h * 0.62, i * 22, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (style === 1) {
            for (let i = 0; i < 9; i++) {
                ctx.fillStyle = pick(rand, [a, c, b]);
                ctx.fillRect(i * (w / 9), h * (0.2 + rand() * 0.5), w / 9 + 1, h);
            }
        } else {
            ctx.strokeStyle = a;
            ctx.lineWidth = 7;
            for (let i = 0; i < 6; i++) {
                ctx.beginPath();
                for (let x = 0; x <= w; x += 8) {
                    const y = h * (0.25 + i * 0.11) + Math.sin(x * 0.04 + i + rand() * 0.2) * (10 + i * 4);
                    x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
                }
                ctx.stroke();
            }
            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.arc(w * 0.74, h * 0.24, 26, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

function dawTexture() {
    const rand = rng('daw');
    return canvasTex(512, 300, (ctx, w, h) => {
        ctx.fillStyle = '#14131f';
        ctx.fillRect(0, 0, w, h);
        const colors = ['#ff7a59', '#c77dff', '#5ef2d6', '#ffd166', '#f25f8b', '#8ecae6'];
        for (let row = 0; row < 6; row++) {
            const y = 22 + row * 44;
            ctx.fillStyle = '#1f1d2e';
            ctx.fillRect(0, y, w, 38);
            ctx.fillStyle = '#2b2940';
            ctx.fillRect(0, y, 56, 38);
            let x = 62 + rand() * 30;
            while (x < w - 30) {
                const len = 40 + rand() * 120;
                ctx.fillStyle = colors[row];
                ctx.globalAlpha = 0.85;
                ctx.fillRect(x, y + 3, Math.min(len, w - x - 6), 32);
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = '#14131f';
                for (let i = 2; i < len - 2 && x + i < w - 8; i += 3) {
                    const amp = 3 + rand() * 12;
                    ctx.fillRect(x + i, y + 19 - amp, 1.5, amp * 2);
                }
                ctx.globalAlpha = 1;
                x += len + 6 + rand() * 40;
            }
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(w * 0.42, 14, 2, h);
    });
}

function speaker(parent, at, ry) {
    const g = group(parent, at, ry);
    box(0.34, 0.52, 0.3, 0x1c1a24, { at: [0, 0, 0], parent: g, r: 0.03 });
    cyl(0.11, 0.11, 0.02, 0x3a3846, { at: [0, 0.2, 0.16], parent: g, rx: Math.PI / 2 }).position.y = 0.19;
    cyl(0.045, 0.045, 0.02, 0xffb45e, { at: [0, 0, 0.165], parent: g, rx: Math.PI / 2 }).position.y = 0.19;
    cyl(0.05, 0.05, 0.02, 0x3a3846, { at: [0, 0, 0.16], parent: g, rx: Math.PI / 2 }).position.y = 0.4;
    return g;
}

export function buildStudio(parent, data) {
    const g = group(parent);
    const spots = [];
    const tracks = data.tracks ?? [];

    // Rug
    cyl(1.7, 1.7, 0.02, 0x8d3b4a, { at: [0.4, 0, 0.5], parent: g, shadow: false, seg: 48 }).receiveShadow = true;
    cyl(1.25, 1.25, 0.022, 0xb5544f, { at: [0.4, 0, 0.5], parent: g, shadow: false, seg: 48 });

    // Acoustic foam above the desk
    for (let c = 0; c < 5; c++) {
        for (let r = 0; r < 2; r++) {
            box(0.46, 0.46, 0.07, (c + r) % 2 ? 0x2a1836 : 0x54306a, { at: [-2.75 + c * 0.5, 1.72 + r * 0.5, -2.44], parent: g, r: 0.02, shadow: false });
        }
    }

    // Production desk: mixer, screen, monitors
    const desk = group(g, [-1.75, 0, -1.75]);
    box(2.7, 0.07, 1.0, 0x2b1d1a, { at: [0, 0.74, 0], parent: desk, r: 0.02 });
    for (const x of [-1.2, 1.2]) box(0.07, 0.74, 0.9, 0x1b1416, { at: [x, 0, 0], parent: desk });
    box(2.4, 0.3, 0.04, 0x1b1416, { at: [0, 0.4, -0.42], parent: desk });
    // screen
    cyl(0.14, 0.16, 0.02, 0x111118, { at: [0, 0.81, -0.28], parent: desk });
    box(0.05, 0.2, 0.04, 0x111118, { at: [0, 0.83, -0.28], parent: desk });
    box(1.1, 0.66, 0.045, 0x111118, { at: [0, 0.98, -0.26], parent: desk, r: 0.015 });
    screen(1.04, 0.6, dawTexture(), { at: [0, 1.31, -0.235], parent: desk });
    // mixer
    const mixer = group(desk, [0, 0.81, 0.18]);
    mixer.rotation.x = 0.16;
    box(1.25, 0.07, 0.5, 0x23212e, { at: [0, 0, 0], parent: mixer, r: 0.015 });
    const knobColors = [0xff7a59, 0xc77dff, 0x5ef2d6, 0xffd166];
    for (let i = 0; i < 12; i++) {
        const x = -0.55 + i * 0.1;
        box(0.012, 0.004, 0.22, 0x0c0b12, { at: [x, 0.07, 0.1], parent: mixer, shadow: false });
        box(0.04, 0.025, 0.05, 0xe9dfcf, { at: [x, 0.07, 0.02 + ((i * 37) % 17) / 100], parent: mixer, shadow: false });
        for (let k = 0; k < 2; k++) {
            cyl(0.016, 0.016, 0.025, knobColors[(i + k) % 4], { at: [x, 0.07, -0.1 - k * 0.07], parent: mixer, seg: 10, shadow: false });
        }
    }
    speaker(desk, [-1.05, 0.81, -0.2], 0.3);
    speaker(desk, [1.05, 0.81, -0.2], -0.3);
    // chair
    const chair = group(g, [-1.6, 0, -0.55], 0.25);
    cyl(0.3, 0.3, 0.03, 0x15141b, { at: [0, 0, 0], parent: chair, seg: 5 });
    cyl(0.03, 0.03, 0.42, 0x8d92a6, { at: [0, 0.03, 0], parent: chair, seg: 8, metal: 0.6, rough: 0.4 });
    box(0.5, 0.09, 0.48, 0x3b3550, { at: [0, 0.45, 0], parent: chair, r: 0.04 });
    box(0.46, 0.55, 0.08, 0x3b3550, { at: [0, 0.62, 0.22], parent: chair, r: 0.04 });
    spots.push(hotspot(desk, 'tracks', 'The desk · all tracks', [0, 1.85, -0.2]));

    // Records on the wall: one per track
    const cols = 3;
    tracks.slice(0, 6).forEach((track, i) => {
        const rec = group(g, [1.05 + (i % cols) * 0.95, 2.15 - Math.floor(i / cols) * 0.85, -2.43]);
        const disc = cyl(0.27, 0.27, 0.012, 0x0d0c12, { at: [0.2, 0, 0], parent: rec, rx: Math.PI / 2, seg: 32, rough: 0.35 });
        disc.position.y = 0;
        const label = cyl(0.09, 0.09, 0.014, 0xffb45e, { at: [0.2, 0, 0.002], parent: rec, rx: Math.PI / 2, shadow: false });
        label.position.y = 0;
        const sleeve = box(0.62, 0.62, 0.03, 0xffffff, {
            at: [0, -0.31, 0.02], parent: rec,
            material: new THREE.MeshStandardMaterial({ map: sleeveTexture(track, i), roughness: 0.7 }),
        });
        if (track.cover) imageTex(track.cover, (t) => { sleeve.material.map = t; sleeve.material.needsUpdate = true; });
        spots.push(hotspot(rec, `track:${i}`, track.title, [0, 0.42, 0.1]));
    });

    // Record cabinet with turntable
    const cab = group(g, [2.05, 0, -2.15]);
    box(2.7, 0.62, 0.5, 0x3a2622, { at: [0, 0.1, 0], parent: cab, r: 0.02 });
    for (const x of [-1.2, 1.2]) cyl(0.03, 0.02, 0.1, 0x1b1416, { at: [x, 0, 0.15], parent: cab, seg: 8 });
    const rand = rng('spines');
    for (let x = -1.25; x < 0.2; x += 0.035 + rand() * 0.02) {
        box(0.028, 0.42 + rand() * 0.06, 0.02, pick(rand, [0xff7a59, 0xc77dff, 0x5ef2d6, 0xffd166, 0xf25f8b, 0xe9dfcf, 0x2b1b3d]), { at: [x, 0.18, 0.25], parent: cab, shadow: false });
    }
    box(0.62, 0.08, 0.44, 0x15141b, { at: [0.75, 0.72, 0], parent: cab, r: 0.02 });
    cyl(0.19, 0.19, 0.02, 0x0d0c12, { at: [0.68, 0.8, 0], parent: cab, seg: 32, rough: 0.3 });
    cyl(0.06, 0.06, 0.022, 0xff7a59, { at: [0.68, 0.8, 0], parent: cab, shadow: false });
    box(0.02, 0.02, 0.26, 0xcfd3e0, { at: [0.95, 0.83, 0.02], parent: cab, ry: 0.35, metal: 0.7, rough: 0.3 });
    // little plant
    cyl(0.09, 0.07, 0.14, 0xd98b5f, { at: [-0.2, 0.72, 0], parent: cab });
    ball(0.16, 0x4c9a73, { at: [-0.2, 0.98, 0], parent: cab, flat: true });

    // Synth on a stand, against the left wall
    const synth = group(g, [-3.35, 0, 0.35], Math.PI / 2);
    for (const x of [-0.5, 0.5]) {
        box(0.04, 1.0, 0.04, 0x15141b, { at: [x, 0, 0], parent: synth, rx: 0.5 }).position.y = 0.42;
        box(0.04, 1.0, 0.04, 0x15141b, { at: [x, 0, 0], parent: synth, rx: -0.5 }).position.y = 0.42;
    }
    box(1.6, 0.09, 0.48, 0x23212e, { at: [0, 0.86, 0], parent: synth, r: 0.02 });
    box(1.5, 0.02, 0.22, 0xf4efe6, { at: [0, 0.95, 0.1], parent: synth, shadow: false });
    for (let i = 0; i < 21; i++) {
        if ([2, 6].includes(i % 7)) continue;
        box(0.035, 0.025, 0.13, 0x0d0c12, { at: [-0.7 + i * 0.07, 0.96, 0.05], parent: synth, shadow: false });
    }
    for (let i = 0; i < 8; i++) {
        cyl(0.02, 0.02, 0.03, knobColors[i % 4], { at: [-0.6 + i * 0.12, 0.95, -0.14], parent: synth, seg: 10, shadow: false });
    }
    screen(0.3, 0.07, canvasTex(64, 16, (ctx) => { ctx.fillStyle = '#5ef2d6'; ctx.fillRect(0, 0, 64, 16); }), { at: [0.5, 0.955, -0.14], rx: -Math.PI / 2, parent: synth });

    // Guitar on a stand
    const guitar = group(g, [3.3, 0, 0.9], -0.5);
    const gt = group(guitar, [0, 0.12, 0]);
    gt.rotation.x = -0.14;
    const bodyMat = mat(0xc8763a, { rough: 0.45 });
    cyl(0.27, 0.27, 0.1, 0, { at: [0, 0, 0], parent: gt, rx: Math.PI / 2, material: bodyMat }).position.y = 0.27;
    cyl(0.2, 0.2, 0.1, 0, { at: [0, 0, 0], parent: gt, rx: Math.PI / 2, material: bodyMat }).position.y = 0.6;
    cyl(0.07, 0.07, 0.105, 0x1b1416, { at: [0, 0, 0], parent: gt, rx: Math.PI / 2, shadow: false }).position.y = 0.5;
    box(0.065, 0.75, 0.035, 0x3a2622, { at: [0, 0.72, 0.045], parent: gt });
    box(0.1, 0.2, 0.035, 0x1b1416, { at: [0, 1.47, 0.045], parent: gt, r: 0.01 });
    box(0.12, 0.03, 0.02, 0x1b1416, { at: [0, 0.2, 0.06], parent: gt });
    for (const x of [-0.22, 0.22]) box(0.025, 0.5, 0.025, 0x15141b, { at: [x, 0, 0.1], parent: guitar, rz: x * 1.2 });
    box(0.025, 0.9, 0.025, 0x15141b, { at: [0, 0, -0.1], parent: guitar });

    // Mic on a stand with a pop filter
    const mic = group(g, [0.35, 0, -0.75], -0.3);
    cyl(0.22, 0.24, 0.03, 0x15141b, { at: [0, 0, 0], parent: mic });
    cyl(0.018, 0.018, 1.35, 0x8d92a6, { at: [0, 0.03, 0], parent: mic, seg: 8, metal: 0.6, rough: 0.4 });
    cyl(0.05, 0.05, 0.2, 0x23212e, { at: [0, 1.36, 0], parent: mic, metal: 0.4, rough: 0.5 });
    ball(0.055, 0xcfd3e0, { at: [0, 1.58, 0], parent: mic, metal: 0.7, rough: 0.35 });
    const pop = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 8, 28), mat(0x15141b));
    pop.position.set(0, 1.52, 0.14);
    mic.add(pop);

    // Floor lamp and wall sign
    const lamp = group(g, [-3.55, 0, -2.05]);
    cyl(0.16, 0.18, 0.03, 0x15141b, { at: [0, 0, 0], parent: lamp });
    cyl(0.015, 0.015, 1.55, 0x15141b, { at: [0, 0.03, 0], parent: lamp, seg: 8 });
    cyl(0.14, 0.2, 0.28, 0xffd9a0, { at: [0, 1.55, 0], parent: lamp, emissive: 0xffb45e, glow: 1.6 });
    neonText('ON AIR', '#ff5d73', { height: 0.3, at: [0.15, 2.6, -2.4], parent: g });

    return { group: g, spots };
}
