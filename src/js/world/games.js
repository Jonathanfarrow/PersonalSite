// Ground floor: the games room. Each arcade cabinet is one game.
import * as THREE from 'three';
import { box, cyl, ball, group, canvasTex, screen, neonText, rng, pick, hotspot, imageTex, fabric, liveScreen, DISPLAY_FONT } from './kit.js';

export const GAMES_LOOK = {
    wall: 0x2c2568, dado: 0x1b1746, floor: 0x1a1730, trim: 0x14112e, light: 0xc4b5ff, accent: 0xff5db1,
    accentAt: [-2.2, 1.6, 0.2], spot: 44, fill: 7, accentPower: 14,
    floorMaterial: checkerFloorMaterial,
};

const CAB_COLORS = [
    { body: 0x2b2a6b, side: '#ff5db1', glow: '#5ef2d6' },
    { body: 0x6b1f4a, side: '#ffd166', glow: '#ff9f6b' },
    { body: 0x14504f, side: '#5ef2d6', glow: '#ffd166' },
    { body: 0x4a2a7a, side: '#ff9f6b', glow: '#ff5db1' },
];

function checkerFloorMaterial() {
    const tex = canvasTex(256, 256, (ctx, w) => {
        const n = 8;
        const s = w / n;
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                ctx.fillStyle = (x + y) % 2 ? '#2a2550' : '#181530';
                ctx.fillRect(x * s, y * s, s, s);
            }
        }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 1.25);
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.28, metalness: 0.1 });
}

/** A little mirrored pixel creature, unique per game title. */
function drawSprite(ctx, rand, cx, cy, cell, color) {
    ctx.fillStyle = color;
    for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 4; x++) {
            if (rand() < 0.55 - Math.abs(y - 3) * 0.05) {
                ctx.fillRect(cx + (x - 4) * cell, cy + (y - 3.5) * cell, cell, cell);
                ctx.fillRect(cx + (3 - x) * cell, cy + (y - 3.5) * cell, cell, cell);
            }
        }
    }
}

/** Attract mode: the game's creature marches about while PRESS START blinks. */
function attractPainter(game, look) {
    const seed = rng(game.title);
    const cells = (n) => Array.from({ length: n }, () => seed());
    const hero = cells(28), minion = cells(28);
    const stars = Array.from({ length: 40 }, () => [seed(), seed(), 0.2 + seed() * 0.6]);
    const sprite = (ctx, bits, cx, cy, cell, color) => {
        ctx.fillStyle = color;
        for (let y = 0; y < 7; y++) {
            for (let x = 0; x < 4; x++) {
                if (bits[y * 4 + x] < 0.55 - Math.abs(y - 3) * 0.05) {
                    ctx.fillRect(cx + (x - 4) * cell, cy + (y - 3.5) * cell, cell, cell);
                    ctx.fillRect(cx + (3 - x) * cell, cy + (y - 3.5) * cell, cell, cell);
                }
            }
        }
    };
    return (ctx, w, h, time) => {
        ctx.fillStyle = '#080714';
        ctx.fillRect(0, 0, w, h);
        for (const [x, y, a] of stars) {
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            ctx.fillRect(Math.floor(x * w), Math.floor((y * h * 0.7 + time * 14 * a) % (h * 0.72)), 2, 2);
        }
        const step = Math.floor(time * 3);
        sprite(ctx, hero, w / 2 + Math.round(Math.sin(time * 1.4) * 4) * 12, h * 0.36 + (step % 2) * 4, 12, look.glow);
        for (let i = 0; i < 4; i++) {
            sprite(ctx, minion, w * (0.14 + i * 0.24) + ((step + i) % 2) * 6, h * 0.66, 5, look.side);
        }
        ctx.fillStyle = look.side;
        ctx.fillRect(0, h - 26, w, 4);
        if (step % 2) {
            ctx.fillStyle = '#ffffff';
            ctx.font = '700 15px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('PRESS START', w / 2, h - 6);
        }
    };
}

function marqueeTexture(game, look) {
    return canvasTex(384, 96, (ctx, w, h) => {
        ctx.fillStyle = look.side;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#12102a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let size = 54;
        do {
            ctx.font = `800 ${size}px ${DISPLAY_FONT}`;
            size -= 3;
        } while (ctx.measureText(game.title.toUpperCase()).width > w - 28 && size > 16);
        ctx.fillText(game.title.toUpperCase(), w / 2, h / 2 + 2);
    });
}

function tvTexture() {
    const rand = rng('tv');
    return canvasTex(320, 180, (ctx, w, h) => {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#2b1b6b');
        grad.addColorStop(0.6, '#ff5db1');
        grad.addColorStop(1, '#ffd166');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#fff1d6';
        ctx.fillRect(220, 30, 32, 32);
        for (const [base, color, step] of [[0.62, '#3a1f7a', 20], [0.76, '#1d1250', 10]]) {
            let y = h * base;
            ctx.fillStyle = color;
            for (let x = 0; x < w; x += step) {
                y += (Math.floor(rand() * 3) - 1) * 10;
                y = Math.max(h * (base - 0.14), Math.min(h * (base + 0.08), y));
                ctx.fillRect(x, y, step, h - y);
            }
        }
        ctx.fillStyle = '#5ef2d6';
        ctx.fillRect(70, h * 0.7, 10, 16);
    });
}

function cabinet(parent, game, index, at) {
    const look = CAB_COLORS[index % CAB_COLORS.length];
    const c = group(parent, at);
    const sideMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(look.side).multiplyScalar(2.2), toneMapped: false });
    box(0.86, 1.95, 0.8, look.body, { at: [0, 0, 0], parent: c, r: 0.03 });
    box(0.9, 0.12, 0.84, 0x0d0c18, { at: [0, 0, 0], parent: c });
    // glowing side stripes
    for (const x of [-0.435, 0.435]) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.01, 1.5, 0.06), sideMat);
        stripe.position.set(x, 1.05, 0.2);
        c.add(stripe);
    }
    // marquee
    box(0.86, 0.3, 0.12, 0x0d0c18, { at: [0, 1.66, 0.4], parent: c, r: 0.02 });
    screen(0.78, 0.2, marqueeTexture(game, look), { at: [0, 1.81, 0.465], parent: c });
    // screen in a recess
    box(0.8, 0.66, 0.06, 0x0d0c18, { at: [0, 1.0, 0.39], parent: c, rx: -0.14 });
    const scr = liveScreen(0.66, 0.54, 256, 208, attractPainter(game, look), { at: [0, 1.33, 0.432], rx: -0.14, parent: c, interval: 0.1, brightness: 1.5 });
    c.userData.screen = scr;
    if (game.image) imageTex(game.image, (t) => { scr.material.map = t; scr.material.needsUpdate = true; scr.userData.repaint = () => {}; });
    // control deck
    box(0.86, 0.1, 0.42, 0x0d0c18, { at: [0, 0.88, 0.5], parent: c, r: 0.02, rx: 0.18 });
    cyl(0.012, 0.012, 0.11, 0xcfd3e0, { at: [-0.2, 0.98, 0.52], parent: c, seg: 8, metal: 0.6, rough: 0.3 });
    ball(0.04, 0xff3b5c, { at: [-0.2, 1.11, 0.52], parent: c, rough: 0.3 });
    [0x5ef2d6, 0xffd166, 0xff5db1].forEach((col, i) => {
        cyl(0.03, 0.03, 0.02, col, { at: [0.05 + i * 0.1, 0.975 - i * 0.004, 0.55 - (i % 2) * 0.05], parent: c, seg: 12, emissive: col, glow: 0.6 });
    });
    box(0.3, 0.2, 0.01, 0x0d0c18, { at: [0, 0.42, 0.405], parent: c, shadow: false });
    box(0.03, 0.08, 0.012, 0xffd166, { at: [0, 0.48, 0.41], parent: c, emissive: 0xffd166, glow: 0.8 });
    return c;
}

export function buildGames(parent, data) {
    const g = group(parent);
    const spots = [];
    const games = data.games ?? [];

    // LED strips
    const pink = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5db1).multiplyScalar(2.4), toneMapped: false });
    const cyan = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ef2d6).multiplyScalar(2.2), toneMapped: false });
    const top = new THREE.Mesh(new THREE.BoxGeometry(7.9, 0.035, 0.035), pink);
    top.position.set(0, 2.86, -2.44);
    g.add(top);
    for (const x of [-3.96, 3.96]) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 4.9), cyan);
        s.position.set(x, 0.06, 0);
        g.add(s);
    }

    // Arcade row
    const shown = games.slice(0, 4);
    const screens = [];
    shown.forEach((game, i) => {
        const cab = cabinet(g, game, i, [-3.3 + i * 1.02, 0, -1.95]);
        screens.push(cab.userData.screen);
        spots.push(hotspot(cab, `game:${i}`, game.title, [0, 2.15, 0.3]));
    });
    const coin = neonText('INSERT COIN', '#ff5db1', { height: 0.34, at: [-1.8, 2.32, -2.4], parent: g });

    // TV wall with console
    const tvX = 2.55;
    box(1.9, 1.08, 0.06, 0x0d0c18, { at: [tvX, 1.15, -2.42], parent: g, r: 0.02 });
    screen(1.8, 0.98, tvTexture(), { at: [tvX, 1.69, -2.385], parent: g, brightness: 1.5 });
    const unit = group(g, [tvX, 0, -2.15]);
    box(2.2, 0.42, 0.5, 0x2b2a6b, { at: [0, 0.1, 0], parent: unit, r: 0.02 });
    for (const x of [-1.0, 1.0]) cyl(0.03, 0.02, 0.1, 0x0d0c18, { at: [x, 0, 0.15], parent: unit, seg: 8 });
    box(0.5, 0.07, 0.34, 0xe9dfcf, { at: [-0.55, 0.52, 0], parent: unit, r: 0.015 });
    box(0.06, 0.01, 0.01, 0x5ef2d6, { at: [-0.55, 0.545, 0.172], parent: unit, emissive: 0x5ef2d6, glow: 2 });
    ball(0.12, 0xffd166, { at: [0.75, 0.64, 0.02], parent: unit, flat: true, detail: 0 });
    const rand = rng('boxes');
    for (let i = 0; i < 4; i++) {
        box(0.3 + rand() * 0.1, 0.055, 0.28, pick(rand, [0xff5db1, 0x5ef2d6, 0xffd166, 0xff9f6b]), { at: [0.15, 0.52 + i * 0.056, 0], parent: unit, ry: (rand() - 0.5) * 0.3 });
    }

    // Sofa, beanbag, controllers
    const sofa = group(g, [3.35, 0, 0.35], -Math.PI / 2);
    box(2.0, 0.34, 0.85, 0, { at: [0, 0.1, 0], parent: sofa, r: 0.08, material: fabric(0x6a3fb0) });
    box(2.0, 0.62, 0.24, 0, { at: [0, 0.3, -0.33], parent: sofa, r: 0.08, material: fabric(0x6a3fb0) });
    for (const x of [-0.94, 0.94]) box(0.2, 0.4, 0.85, 0, { at: [x, 0.26, 0], parent: sofa, r: 0.08, material: fabric(0x5a349a) });
    box(0.4, 0.34, 0.12, 0xff5db1, { at: [-0.5, 0.48, -0.15], parent: sofa, r: 0.05, rx: -0.3 });
    box(0.4, 0.34, 0.12, 0x5ef2d6, { at: [0.45, 0.48, -0.15], parent: sofa, r: 0.05, rx: -0.3 });
    ball(0.5, 0xff9f6b, { at: [1.55, 0.3, 0.75], parent: g, scale: [1, 0.62, 1] });
    ball(0.3, 0xff9f6b, { at: [1.55, 0.56, 0.6], parent: g, scale: [1, 0.6, 1] });
    for (const [x, z, ry, col] of [[2.2, 0.9, 0.4, 0xe9dfcf], [2.6, 1.3, -0.7, 0x15141b]]) {
        const pad = group(g, [x, 0, z], ry);
        box(0.26, 0.05, 0.13, col, { at: [0, 0, 0], parent: pad, r: 0.025 });
        for (const px of [-0.1, 0.1]) box(0.07, 0.05, 0.14, col, { at: [px, 0, 0.05], parent: pad, r: 0.025 });
    }
    // low table
    cyl(0.45, 0.45, 0.04, 0x0d0c18, { at: [2.1, 0.32, -0.6], parent: g, seg: 32 });
    cyl(0.04, 0.2, 0.32, 0x0d0c18, { at: [2.1, 0, -0.6], parent: g });
    cyl(0.045, 0.04, 0.12, 0xff5db1, { at: [2.0, 0.36, -0.55], parent: g });
    cyl(0.045, 0.04, 0.12, 0x5ef2d6, { at: [2.25, 0.36, -0.7], parent: g });

    // Rug under the lounge, shelf of collectibles, framed pixel art
    cyl(1.35, 1.35, 0.02, 0, { at: [2.0, 0, 0.2], parent: g, shadow: false, seg: 48, material: fabric(0x3a2f8a) }).receiveShadow = true;
    cyl(1.0, 1.0, 0.022, 0, { at: [2.0, 0, 0.2], parent: g, shadow: false, seg: 48, material: fabric(0xff5db1) }).receiveShadow = true;
    cyl(0.62, 0.62, 0.024, 0, { at: [2.0, 0, 0.2], parent: g, shadow: false, seg: 48, material: fabric(0x3a2f8a) }).receiveShadow = true;
    box(1.5, 0.04, 0.2, 0x14112e, { at: [0.55, 1.75, -2.38], parent: g });
    const toys = rng('toys');
    for (let i = 0; i < 6; i++) {
        const col = pick(toys, [0xff5db1, 0x5ef2d6, 0xffd166, 0xff9f6b, 0xc4b5ff]);
        const x = -0.05 + i * 0.24;
        if (i % 3 === 0) ball(0.07, col, { at: [x, 1.86, -2.38], parent: g, flat: true, detail: 0 });
        else if (i % 3 === 1) { box(0.09, 0.13, 0.07, col, { at: [x, 1.79, -2.38], parent: g, r: 0.015 }); ball(0.045, col, { at: [x, 1.96, -2.38], parent: g }); }
        else cyl(0.01, 0.06, 0.14, col, { at: [x, 1.79, -2.38], parent: g, seg: 4 });
    }
    const art = canvasTex(96, 96, (ctx) => {
        ctx.fillStyle = '#12102a';
        ctx.fillRect(0, 0, 96, 96);
        drawSprite(ctx, rng('art'), 48, 48, 10, '#ffd166');
    });
    box(0.5, 0.5, 0.03, 0x0d0c18, { at: [0.55, 0.95, -2.43], parent: g, shadow: false });
    screen(0.44, 0.44, art, { at: [0.55, 1.2, -2.41], parent: g, brightness: 0.9 });

    return {
        group: g,
        spots,
        tick(time) {
            screens.forEach((scr) => scr.userData.repaint?.(time));
            coin.material.color.setScalar(1.9 * (Math.sin(time * 1.1 + 2) > 0.95 && Math.sin(time * 55) > 0 ? 0.3 : 1));
        },
    };
}
