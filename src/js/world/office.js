// Middle floor: the office. Desk = work, bookshelf = writing, photo = about.
import * as THREE from 'three';
import { box, cyl, ball, group, mat, canvasTex, screen, rng, pick, hotspot, imageTex } from './kit.js';

export const OFFICE_LOOK = { wall: 0x25474d, floor: 0xa9825a, trim: 0xe9dfcf, light: 0xffe2bd, accent: 0x5ef2d6 };

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

function windowTexture() {
    const rand = rng('window');
    return canvasTex(256, 192, (ctx, w, h) => {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#11183f');
        grad.addColorStop(0.7, '#4a2f6b');
        grad.addColorStop(1, '#d9805f');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#fff1d6';
        ctx.beginPath();
        ctx.arc(60, 44, 14, 0, Math.PI * 2);
        ctx.fill();
        for (let x = 0; x < w; x += 22 + rand() * 14) {
            const bh = 40 + rand() * 80;
            ctx.fillStyle = '#0c1030';
            ctx.fillRect(x, h - bh, 26, bh);
            for (let yy = h - bh + 6; yy < h - 4; yy += 9) {
                for (let xx = x + 4; xx < x + 22; xx += 7) {
                    if (rand() < 0.35) {
                        ctx.fillStyle = '#f6c177';
                        ctx.fillRect(xx, yy, 3, 4);
                    }
                }
            }
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
    box(3.6, 0.02, 2.2, 0xe2d5bf, { at: [0.2, 0, 0.2], parent: g, r: 0.01, shadow: false }).receiveShadow = true;
    box(3.2, 0.022, 1.8, 0xc9694f, { at: [0.2, 0, 0.2], parent: g, r: 0.01, shadow: false });
    box(2.8, 0.024, 1.4, 0xe2d5bf, { at: [0.2, 0, 0.2], parent: g, r: 0.01, shadow: false });

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
    [[-0.5, 0.22, 'code-a'], [0.48, -0.22, 'code-b']].forEach(([x, ry, seed]) => {
        const m = group(desk, [x, 0.8, -0.28], ry);
        cyl(0.13, 0.15, 0.02, 0x15171f, { at: [0, 0, 0], parent: m });
        box(0.05, 0.2, 0.04, 0x15171f, { at: [0, 0.02, 0], parent: m });
        box(0.94, 0.58, 0.04, 0x15171f, { at: [0, 0.17, 0.02], parent: m, r: 0.015 });
        screen(0.88, 0.52, codeTexture(seed), { at: [0, 0.46, 0.045], parent: m });
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
    ball(0.045, 0xfff1d6, { at: [0.42, 0.44, 0], parent: lamp, emissive: 0xffd9a0, glow: 3 });
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

    // Reading corner
    const arm = group(g, [2.5, 0, 0.55], -0.75);
    box(0.95, 0.3, 0.9, 0x3d6f73, { at: [0, 0.12, 0], parent: arm, r: 0.08 });
    box(0.95, 0.6, 0.22, 0x3d6f73, { at: [0, 0.3, -0.36], parent: arm, r: 0.08 });
    for (const x of [-0.42, 0.42]) box(0.16, 0.34, 0.85, 0x356267, { at: [x, 0.28, 0], parent: arm, r: 0.07 });
    for (const [x, z] of [[-0.38, -0.36], [0.38, -0.36], [-0.38, 0.36], [0.38, 0.36]]) cyl(0.03, 0.02, 0.12, 0x1b1d28, { at: [x, 0, z], parent: arm, seg: 8 });
    box(0.36, 0.3, 0.1, 0xffd166, { at: [0.05, 0.45, -0.2], parent: arm, r: 0.05, rx: -0.25 });
    const fl = group(g, [3.55, 0, -0.6]);
    cyl(0.17, 0.19, 0.03, 0x1b1d28, { at: [0, 0, 0], parent: fl });
    cyl(0.015, 0.015, 1.6, 0x1b1d28, { at: [0, 0.03, 0], parent: fl, seg: 8 });
    cyl(0.16, 0.24, 0.3, 0xfff1d6, { at: [0, 1.6, 0], parent: fl, emissive: 0xffd9a0, glow: 1.5 });

    // Big plant
    const plant = group(g, [-3.45, 0, -1.9]);
    cyl(0.26, 0.2, 0.42, 0xe9dfcf, { at: [0, 0, 0], parent: plant });
    cyl(0.02, 0.03, 0.9, 0x4a352b, { at: [0, 0.4, 0], parent: plant, seg: 6 });
    for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const leaf = ball(0.3, 0x3d8a66, { at: [Math.cos(a) * 0.28, 1.0 + (i % 3) * 0.22, Math.sin(a) * 0.28], parent: plant, flat: true, scale: [1, 0.35, 0.6] });
        leaf.rotation.set(0.5 * Math.sin(a), -a, 0.6);
    }

    return { group: g, spots };
}
