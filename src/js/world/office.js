// Middle floor: the office. Desk = work, bookshelf = writing, photo = about.
import * as THREE from 'three';
import { box, cyl, ball, group, mat, canvasTex, screen, rng, pick, hotspot, imageTex, planks, fabric, liveScreen } from './kit.js';
import { prop } from './props.js';

export const OFFICE_LOOK = {
    wall: 0x6f8a72, dado: 0xdcd2bc, floor: 0xa9825a, trim: 0xf1ece2, light: 0xffd9a8, accent: 0xffb36b, shade: 0xe9dfcf,
    accentAt: [2.6, 1.2, 0.6], spot: 40, fill: 6, accentPower: 6, fireplace: true, mantel: 0xf1ece2,
    floorMaterial: () => planks(0xc79b6b, 0x9a7148, 2, 2),
};

/** An editor that keeps typing. */
function codePainter(seed) {
    const rand = rng(seed);
    const colors = ['#5ef2d6', '#ffd166', '#f6a6c1', '#8ecae6', '#cdd6e0', '#cdd6e0'];
    const lines = [];
    let indent = 0;
    for (let i = 0; i < 60; i++) {
        indent = Math.max(0, Math.min(4, indent + Math.floor(rand() * 3) - 1));
        const words = [];
        const n = 1 + Math.floor(rand() * 5);
        for (let k = 0; k < n; k++) words.push({ len: 16 + rand() * 70, color: pick(rand, colors) });
        lines.push({ indent, words });
    }
    return (ctx, w, h, time) => {
        ctx.fillStyle = '#10171c';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#18232a';
        ctx.fillRect(0, 0, 70, h);
        ctx.fillStyle = '#22323b';
        ctx.fillRect(0, 0, w, 14);
        const typed = time * 2.2;            // lines per second
        const first = Math.max(0, Math.floor(typed) - 16);
        for (let row = 0; row < 18; row++) {
            const index = first + row;
            if (index > typed) break;
            const line = lines[index % lines.length];
            const y = 26 + row * 15;
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#cdd6e0';
            ctx.fillRect(40, y, 14, 6);
            ctx.globalAlpha = 0.92;
            let x = 86 + line.indent * 22;
            const partial = index === Math.floor(typed) ? typed % 1 : 1;
            const total = line.words.reduce((a, b) => a + b.len + 8, 0) * partial;
            let used = 0;
            for (const word of line.words) {
                const len = Math.min(word.len, total - used);
                if (len <= 0) break;
                ctx.fillStyle = word.color;
                ctx.fillRect(x, y, len, 6);
                x += len + 8;
                used += word.len + 8;
            }
            if (index === Math.floor(typed) && Math.sin(time * 9) > 0) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(x - 6, y - 3, 3, 12);
            }
        }
        ctx.globalAlpha = 1;
    };
}

function codeTexture(seed) {
    const rand = rng(seed);
    return canvasTex(512, 300, (ctx, w, h) => {
        ctx.fillStyle = '#10171c';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#18232a';
        ctx.fillRect(0, 0, 70, h);
        const colors = ['#5ef2d6', '#ffd166', '#f6a6c1', '#8ecae6', '#cdd6e0', '#cdd6e0'];
        let indent = 0;
        for (let y = 16; y < h - 10; y += 15) {
            indent = Math.max(0, Math.min(4, indent + Math.floor(rand() * 3) - 1));
            let x = 86 + indent * 22;
            const words = 1 + Math.floor(rand() * 5);
            for (let i = 0; i < words && x < w - 40; i++) {
                const len = 16 + rand() * 70;
                ctx.fillStyle = pick(rand, colors);
                ctx.globalAlpha = 0.9;
                ctx.fillRect(x, y, len, 6);
                x += len + 8;
            }
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#cdd6e0';
            ctx.fillRect(40, y, 14, 6);
            ctx.globalAlpha = 1;
        }
    });
}

/** The view out the back: garden trees and rooftops at dusk. */
function windowTexture() {
    const rand = rng('window');
    return canvasTex(256, 192, (ctx, w, h) => {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#16224f');
        grad.addColorStop(0.7, '#5a5c94');
        grad.addColorStop(1, '#e8ad88');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#fff1d6';
        ctx.beginPath();
        ctx.arc(196, 40, 11, 0, Math.PI * 2);
        ctx.fill();
        // rooftops with chimneys
        ctx.fillStyle = '#141a33';
        for (let x = -20; x < w; x += 70) {
            const top = h - 62 - rand() * 14;
            ctx.beginPath();
            ctx.moveTo(x, h - 30);
            ctx.lineTo(x + 35, top);
            ctx.lineTo(x + 70, h - 30);
            ctx.fill();
            ctx.fillRect(x + 44, top - 4, 9, 22);
            ctx.fillRect(x, h - 30, 70, 30);
            if (rand() < 0.7) { ctx.fillStyle = '#f2b66f'; ctx.fillRect(x + 14, h - 22, 8, 10); ctx.fillStyle = '#141a33'; }
        }
        // garden trees
        ctx.fillStyle = '#0f2a22';
        for (const [x, r] of [[30, 34], [88, 26], [232, 38]]) {
            ctx.beginPath();
            ctx.arc(x, h - 10, r, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

function artTexture(seed, colors) {
    const rand = rng(seed);
    return canvasTex(128, 160, (ctx, w, h) => {
        ctx.fillStyle = colors[0];
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 4; i++) {
            ctx.fillStyle = colors[1 + (i % (colors.length - 1))];
            ctx.beginPath();
            ctx.arc(rand() * w, rand() * h, 18 + rand() * 40, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

function frame(parent, w, h, tex, at) {
    const f = group(parent, at);
    box(w + 0.08, h + 0.08, 0.035, 0x1b1d28, { at: [0, -(h + 0.08) / 2, 0], parent: f, r: 0.008 });
    const pic = screen(w, h, tex, { at: [0, 0, 0.02], parent: f, brightness: 0.82 });
    return { f, pic };
}

export function buildOffice(parent, data) {
    const g = group(parent);
    const spots = [];

    // Rug
    box(3.6, 0.02, 2.2, 0, { at: [0.6, 0, 0.3], parent: g, shadow: false, material: fabric(0xe2d5bf) }).receiveShadow = true;
    box(3.2, 0.022, 1.8, 0, { at: [0.6, 0, 0.3], parent: g, shadow: false, material: fabric(0xc9694f) }).receiveShadow = true;
    box(2.8, 0.024, 1.4, 0, { at: [0.6, 0, 0.3], parent: g, shadow: false, material: fabric(0xe2d5bf) }).receiveShadow = true;

    // Desk
    const desk = group(g, [-1.55, 0, -1.7]);
    box(2.6, 0.06, 1.05, 0xd9b98c, { at: [0, 0.74, 0], parent: desk, r: 0.02 });
    for (const x of [-1.15, 1.15]) {
        box(0.05, 0.74, 0.05, 0x1b1d28, { at: [x, 0, 0.42], parent: desk, rz: -x * 0.06 });
        box(0.05, 0.74, 0.05, 0x1b1d28, { at: [x, 0, -0.42], parent: desk, rz: -x * 0.06 });
    }
    // drawers
    box(0.5, 0.56, 0.7, 0xe9dfcf, { at: [0.85, 0.12, 0], parent: desk, r: 0.02 });
    for (let i = 0; i < 3; i++) box(0.18, 0.02, 0.02, 0x1b1d28, { at: [0.85, 0.22 + i * 0.17, 0.36], parent: desk, shadow: false });
    // monitors
    const live = [];
    [[-0.5, 0.22, 'code-a'], [0.48, -0.22, 'code-b']].forEach(([x, ry, seed], n) => {
        const m = group(desk, [x, 0.8, -0.28], ry);
        cyl(0.13, 0.15, 0.02, 0x15171f, { at: [0, 0, 0], parent: m });
        box(0.05, 0.2, 0.04, 0x15171f, { at: [0, 0.02, 0], parent: m });
        box(0.94, 0.58, 0.04, 0x15171f, { at: [0, 0.17, 0.02], parent: m, r: 0.015 });
        if (n === 0) live.push(liveScreen(0.88, 0.52, 512, 300, codePainter(seed), { at: [0, 0.46, 0.045], parent: m, interval: 0.07 }));
        else screen(0.88, 0.52, codeTexture(seed), { at: [0, 0.46, 0.045], parent: m });
    });
    box(0.6, 0.025, 0.2, 0x2a2d3a, { at: [-0.05, 0.8, 0.22], parent: desk, r: 0.008 });
    box(0.08, 0.025, 0.12, 0xe9dfcf, { at: [0.42, 0.8, 0.24], parent: desk, r: 0.01 });
    cyl(0.055, 0.045, 0.11, 0xc9694f, { at: [-0.75, 0.8, 0.2], parent: desk });
    // notebook + desk lamp
    box(0.3, 0.02, 0.22, 0x25474d, { at: [0.9, 0.8, 0.22], parent: desk, ry: 0.2 });
    const lamp = group(desk, [-1.05, 0.8, -0.15]);
    cyl(0.1, 0.11, 0.025, 0xc9694f, { at: [0, 0, 0], parent: lamp });
    box(0.025, 0.45, 0.025, 0xc9694f, { at: [0.06, 0, 0], parent: lamp, rz: -0.28 });
    box(0.025, 0.36, 0.025, 0xc9694f, { at: [0.25, 0.36, 0], parent: lamp, rz: -1.0 });
    cyl(0.05, 0.12, 0.14, 0xc9694f, { at: [0.4, 0.42, 0], parent: lamp, rz: 0.5 });
    ball(0.045, 0xfff1d6, { at: [0.42, 0.44, 0], parent: lamp, emissive: 0xffd9a0, glow: 6 });
    // chair
    const chair = group(g, [-1.5, 0, -0.5], -0.2);
    cyl(0.32, 0.32, 0.03, 0x15171f, { at: [0, 0, 0], parent: chair, seg: 5 });
    cyl(0.03, 0.03, 0.4, 0x8d92a6, { at: [0, 0.03, 0], parent: chair, seg: 8, metal: 0.6, rough: 0.4 });
    box(0.52, 0.09, 0.5, 0xc9694f, { at: [0, 0.43, 0], parent: chair, r: 0.04 });
    box(0.5, 0.62, 0.08, 0xc9694f, { at: [0, 0.6, 0.23], parent: chair, r: 0.04 });
    spots.push(hotspot(desk, 'work', 'The desk · work', [0, 1.6, -0.2]));

    // Frames above the desk; the photo opens About
    const photo = frame(g, 0.56, 0.56, artTexture('me', ['#d9805f', '#ffd166', '#3b2a63']), [-3.0, 2.38, -2.44]);
    if (data.about?.photo) imageTex(data.about.photo, (t) => { photo.pic.material.map = t; photo.pic.material.needsUpdate = true; });
    spots.push(hotspot(photo.f, 'about', 'About me', [0, 0.16, 0.1]));
    frame(g, 0.4, 0.5, artTexture('a1', ['#e9dfcf', '#25474d', '#c9694f']), [-2.3, 2.42, -2.44]);
    frame(g, 0.4, 0.5, artTexture('a2', ['#1b2040', '#5ef2d6', '#ffd166']), [-2.3, 1.8, -2.44]);
    box(1.5, 0.04, 0.2, 0xd9b98c, { at: [-1.0, 2.0, -2.38], parent: g, r: 0.01 });
    cyl(0.07, 0.055, 0.12, 0xe9dfcf, { at: [-1.5, 2.04, -2.38], parent: g });
    ball(0.13, 0x4c9a73, { at: [-1.5, 2.27, -2.38], parent: g, flat: true });
    for (let i = 0; i < 5; i++) {
        box(0.05, 0.24 - (i % 2) * 0.04, 0.15, [0xc9694f, 0xffd166, 0x5ef2d6, 0xe9dfcf, 0x3b2a63][i], { at: [-0.9 + i * 0.06, 2.04, -2.38], parent: g, shadow: false });
    }

    // Window onto the city
    const win = group(g, [0.95, 1.7, -2.45]);
    box(1.7, 1.4, 0.06, 0xe9dfcf, { at: [0, -0.7, 0], parent: win });
    screen(1.56, 1.26, windowTexture(), { at: [0, 0, 0.035], parent: win, brightness: 0.9 });
    box(0.04, 1.26, 0.03, 0xe9dfcf, { at: [0, -0.63, 0.04], parent: win, shadow: false });
    box(1.56, 0.04, 0.03, 0xe9dfcf, { at: [0, -0.02, 0.04], parent: win, shadow: false });
    box(1.8, 0.05, 0.16, 0xe9dfcf, { at: [0, -0.75, 0.07], parent: win });

    // Bookshelf
    const shelf = group(g, [2.9, 0, -2.2]);
    const wood = 0x8b5e3c;
    box(1.7, 2.4, 0.03, 0x6f482c, { at: [0, 0, -0.2], parent: shelf });
    for (const x of [-0.85, 0.85]) box(0.05, 2.4, 0.42, wood, { at: [x, 0, 0], parent: shelf });
    const rand = rng('books');
    const bookColors = [0xc9694f, 0xffd166, 0x5ef2d6, 0xe9dfcf, 0x3b2a63, 0x25474d, 0xf25f8b, 0x8ecae6, 0x1b2040];
    for (let s = 0; s < 5; s++) {
        const y = s * 0.59;
        box(1.7, 0.05, 0.42, wood, { at: [0, y, 0], parent: shelf });
        if (s === 4) break;
        let x = -0.78;
        const gapAt = 0.2 + rand() * 0.9;
        while (x < 0.74) {
            const w = 0.04 + rand() * 0.05;
            const h = 0.32 + rand() * 0.16;
            if (x > -0.78 + gapAt && x < -0.78 + gapAt + 0.28) {
                if (s === 1 && x < -0.78 + gapAt + 0.05) {
                    cyl(0.07, 0.055, 0.12, 0xe9dfcf, { at: [x + 0.12, y + 0.05, 0.05], parent: shelf });
                    ball(0.12, 0x4c9a73, { at: [x + 0.12, y + 0.27, 0.05], parent: shelf, flat: true });
                }
                x += 0.3;
                continue;
            }
            box(w, h, 0.26, pick(rand, bookColors), { at: [x + w / 2, y + 0.05, 0.04], parent: shelf, shadow: false });
            x += w + 0.006;
        }
    }
    spots.push(hotspot(shelf, 'writing', 'The bookshelf · writing', [0, 2.62, 0.1]));

    // Reading chair by the fire
    if (!prop('armchair', { at: [2.3, 0, 1.3], ry: 1.05, parent: g, colors: { fabric: 0x3d7a78 } })) {
        box(0.95, 0.5, 0.9, 0, { at: [2.3, 0.1, 1.3], parent: g, r: 0.1, material: fabric(0x3d7a78) });
    }
    box(0.36, 0.3, 0.1, 0xe2b04a, { at: [2.22, 0.5, 1.28], parent: g, r: 0.05, ry: 1.05 });
    cyl(0.22, 0.22, 0.03, 0x6f482c, { at: [2.75, 0.48, 2.0], parent: g });
    cyl(0.02, 0.12, 0.48, 0x6f482c, { at: [2.75, 0, 2.0], parent: g, seg: 10 });
    box(0.2, 0.03, 0.14, 0x7a2f2a, { at: [2.75, 0.51, 2.0], parent: g, ry: 0.4 });
    const fl = group(g, [3.5, 0, -1.2]);
    cyl(0.17, 0.19, 0.03, 0x1b1d28, { at: [0, 0, 0], parent: fl });
    cyl(0.015, 0.015, 1.6, 0x1b1d28, { at: [0, 0.03, 0], parent: fl, seg: 8 });
    cyl(0.16, 0.24, 0.3, 0xfff1d6, { at: [0, 1.6, 0], parent: fl, emissive: 0xffd9a0, glow: 3.5 });

    // Big plant
    if (!prop('plant', { at: [-3.4, 0, -1.8], ry: 0.4, parent: g })) {
        cyl(0.26, 0.2, 0.42, 0xe9dfcf, { at: [-3.4, 0, -1.8], parent: g });
        ball(0.5, 0x3d8a66, { at: [-3.4, 1.0, -1.8], parent: g, flat: true });
    }

    // Electronics bench under the window: scope, soldering iron, a board with a blinking LED
    const bench = group(g, [-2.7, 0, 1.25], 0.3);
    box(1.7, 0.06, 0.6, 0x8b5e3c, { at: [0, 0.8, 0], parent: bench, r: 0.015 });
    for (const x of [-0.78, 0.78]) box(0.05, 0.8, 0.52, 0x1b1d28, { at: [x, 0, 0], parent: bench });
    box(1.5, 0.04, 0.5, 0x8b5e3c, { at: [0, 0.25, 0], parent: bench });
    box(0.5, 0.3, 0.36, 0xd9d4c7, { at: [0.5, 0.86, -0.08], parent: bench, r: 0.02 });
    const trace = liveScreen(0.26, 0.2, 128, 96, (ctx, w, h, time) => {
        ctx.fillStyle = '#04140f';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(94,242,214,0.18)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(i * w / 6, 0); ctx.lineTo(i * w / 6, h); ctx.moveTo(0, i * h / 6); ctx.lineTo(w, i * h / 6); ctx.stroke(); }
        ctx.strokeStyle = '#7dffe3';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) {
            const y = h / 2 + Math.sin(x * 0.12 + time * 6) * h * 0.26 * (0.7 + 0.3 * Math.sin(x * 0.03 + time));
            x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
    }, { at: [0.42, 1.02, 0.105], parent: bench, interval: 0.05, brightness: 1.6 });
    for (let i = 0; i < 3; i++) cyl(0.018, 0.018, 0.02, 0x2a2d3a, { at: [0.66, 0.93 + i * 0.07, 0.11], parent: bench, rx: Math.PI / 2, seg: 10, shadow: false });
    box(0.36, 0.012, 0.24, 0x1f7a55, { at: [-0.25, 0.86, 0.05], parent: bench, ry: 0.2 });
    for (const [x, z, w] of [[-0.3, 0.05, 0.08], [-0.18, 0.1, 0.05], [-0.33, -0.02, 0.04]]) box(w, 0.02, w, 0x15171f, { at: [x, 0.872, z], parent: bench, ry: 0.2, shadow: false });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b3b, toneMapped: false }));
    led.position.set(-0.14, 0.885, 0.0);
    bench.add(led);
    cyl(0.05, 0.06, 0.03, 0x2a2d3a, { at: [-0.65, 0.86, 0.1], parent: bench });
    box(0.02, 0.02, 0.26, 0xe07a5f, { at: [-0.65, 0.93, 0.06], parent: bench, rx: 0.6 });
    cyl(0.06, 0.06, 0.07, 0xcfd3e0, { at: [-0.6, 0.86, -0.15], parent: bench, metal: 0.8, rough: 0.3 });
    for (let i = 0; i < 4; i++) box(0.14, 0.1, 0.2, [0xffd166, 0x5ef2d6, 0xc9694f, 0xe9dfcf][i], { at: [-0.55 + i * 0.36, 0.29, 0.05], parent: bench, r: 0.01 });
    // stool
    cyl(0.17, 0.17, 0.05, 0xc9694f, { at: [-2.3, 0.55, 1.95], parent: g });
    for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        cyl(0.015, 0.015, 0.58, 0x1b1d28, { at: [-2.3 + Math.cos(a) * 0.12, 0, 1.95 + Math.sin(a) * 0.12], parent: g, seg: 6 });
    }

    // Steam off the mug
    const steamTex = canvasTex(32, 32, (ctx) => {
        const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        grad.addColorStop(0, 'rgba(255,255,255,0.5)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 32, 32);
    });
    const steam = [0, 1, 2].map((i) => {
        const puff = screen(0.09, 0.09, steamTex, { transparent: true, brightness: 1, at: [-0.75, 0.95, 0.2], parent: desk });
        puff.userData.offset = i / 3;
        return puff;
    });

    return {
        group: g,
        spots,
        tick(time) {
            live.forEach((m) => m.userData.repaint(time));
            trace.userData.repaint(time);
            led.material.color.setScalar(Math.sin(time * 5) > 0 ? 3 : 0.2).multiply(new THREE.Color(1, 0.25, 0.25));
            for (const puff of steam) {
                const t = (time * 0.35 + puff.userData.offset) % 1;
                puff.position.set(-0.75 + Math.sin(t * 5 + puff.userData.offset * 9) * 0.02, 0.93 + t * 0.3, 0.2);
                puff.scale.setScalar(0.6 + t * 1.2);
                puff.material.opacity = Math.sin(t * Math.PI) * 0.5;
            }
        },
    };
}
