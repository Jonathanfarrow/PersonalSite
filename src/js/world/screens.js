// Things drawn live on top of the baked model: moving screens, marquees, the portrait.
import * as THREE from 'three';

export const DISPLAY_FONT = '"Bricolage Grotesque", "Trebuchet MS", system-ui, sans-serif';

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

const pick = (rand, list) => list[Math.floor(rand() * list.length)];

export function canvasTexture(w, h, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    draw(ctx, w, h, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return { tex, ctx, canvas };
}

/** A flat unlit picture. */
export function plane(w, h, texture, opts = {}) {
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: texture, transparent: !!opts.transparent, depthWrite: !opts.transparent })
    );
    mesh.material.color.setScalar(opts.brightness ?? 1);
    return mesh;
}

/** A screen that keeps repainting itself. */
export function liveScreen(w, h, pxW, pxH, paint, opts = {}) {
    const { tex, ctx } = canvasTexture(pxW, pxH, paint);
    const mesh = plane(w, h, tex, opts);
    let last = -1;
    mesh.userData.repaint = (time) => {
        if (time - last < (opts.interval ?? 0.1)) return;
        last = time;
        paint(ctx, pxW, pxH, time);
        tex.needsUpdate = true;
    };
    return mesh;
}

/** The arrangement view on the studio monitor, with a playhead that keeps moving. */
export function dawPainter() {
    const rand = rng('daw');
    const colors = ['#ff7a59', '#c77dff', '#5ef2d6', '#ffd166', '#f25f8b', '#8ecae6'];
    const clips = [];
    for (let row = 0; row < 6; row++) {
        let x = 62 + rand() * 30;
        while (x < 500) {
            const len = 40 + rand() * 120;
            clips.push({ row, x, len: Math.min(len, 506 - x), wave: Array.from({ length: Math.floor(len / 3) }, () => 3 + rand() * 12) });
            x += len + 6 + rand() * 40;
        }
    }
    return (ctx, w, h, time) => {
        ctx.fillStyle = '#14131f';
        ctx.fillRect(0, 0, w, h);
        for (let row = 0; row < 6; row++) {
            const y = 22 + row * 40;
            ctx.fillStyle = '#1f1d2e';
            ctx.fillRect(0, y, w, 34);
            ctx.fillStyle = '#2b2940';
            ctx.fillRect(0, y, 56, 34);
            const level = 0.35 + 0.6 * Math.abs(Math.sin(time * (3 + row) + row * 1.7));
            ctx.fillStyle = level > 0.85 ? '#ff5d73' : '#5ef2d6';
            ctx.fillRect(6, y + 26, 44 * level, 4);
        }
        for (const c of clips) {
            const y = 22 + c.row * 40;
            ctx.fillStyle = colors[c.row];
            ctx.globalAlpha = 0.88;
            ctx.fillRect(c.x, y + 3, c.len, 28);
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = '#14131f';
            c.wave.forEach((amp, i) => { if (i * 3 < c.len - 2) ctx.fillRect(c.x + 2 + i * 3, y + 17 - amp, 1.5, amp * 2); });
            ctx.globalAlpha = 1;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(62 + ((time * 26) % (w - 62)), 14, 2, h);
    };
}

/** An editor that keeps typing. */
export function codePainter(seed) {
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
        const typed = 17 + time * 2.2;
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

const CABINET_LOOKS = [
    { side: '#ff5db1', glow: '#5ef2d6' },
    { side: '#ffd166', glow: '#ff9f6b' },
    { side: '#5ef2d6', glow: '#ffd166' },
];

/** Attract mode: the game's creature marches about while PRESS START blinks. */
export function attractPainter(game, index) {
    const look = CABINET_LOOKS[index % CABINET_LOOKS.length];
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
        for (let i = 0; i < 4; i++) sprite(ctx, minion, w * (0.14 + i * 0.24) + ((step + i) % 2) * 6, h * 0.66, 5, look.side);
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

export function marqueeTexture(game, index) {
    const look = CABINET_LOOKS[index % CABINET_LOOKS.length];
    return canvasTexture(384, 96, (ctx, w, h) => {
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
    }).tex;
}

/** The oscilloscope on the electronics bench. */
export function scopePainter() {
    return (ctx, w, h, time) => {
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
    };
}

/** A soft round puff: smoke, steam, flame. */
export function puffTexture(inner, outer) {
    return canvasTexture(64, 64, (ctx) => {
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, inner);
        grad.addColorStop(1, outer);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
    }).tex;
}
