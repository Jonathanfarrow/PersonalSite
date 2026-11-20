// The house (a Victorian terrace, cut open at the front and the left), its attached
// neighbour, and the street around them.
import * as THREE from 'three';
import { box, cyl, ball, group, mat, canvasTex, screen, rng, plaster, brick, fabric } from './kit.js';

export const DIM = { W: 8, D: 5, FLOOR: 3.2, SLAB: 0.25, WALL: 0.25, BASE: 0.3 };

/** Y of the floor surface for storey i (0 = ground). */
export const floorY = (i) => DIM.BASE + i * DIM.FLOOR;

const CUT = 0xeadfce;      // the sliced edge of walls and slabs
const IRON = 0x1b1d22;
const WHITE = 0xf1ece2;    // painted joinery
const STONE = 0xd9d2c2;
const BRICK = 0xa4553c;
const MORTAR = '#d8c9b4';
const RENDER = 0xe6dcc6;   // the cream-rendered upper storey
const EAVES = DIM.BASE + DIM.FLOOR * 2;   // where the neighbour's roof starts
const RIDGE = { y: EAVES + 3.3, z: -0.1 };

function tiled(size, draw, rx, ry) {
    const t = canvasTex(size, size, draw);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;
}

function slate(rx = 6, ry = 5) {
    const tex = tiled(256, (ctx, w, h) => {
        const rand = rng('slate');
        ctx.fillStyle = '#2c313c';
        ctx.fillRect(0, 0, w, h);
        const rows = 8, th = h / rows, tw = w / 6;
        for (let r = 0; r < rows; r++) {
            for (let c = -1; c < 7; c++) {
                const v = 62 + rand() * 26;
                ctx.fillStyle = `rgb(${v},${v + 6},${v + 18})`;
                ctx.fillRect(c * tw + (r % 2 ? tw / 2 : 0) + 1, r * th + 2, tw - 2, th - 2);
            }
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(0, r * th, w, 2);
        }
    }, rx, ry);
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, bumpMap: tex, bumpScale: 0.6 });
}

function speckled(seed, base, specks, rx, ry, rough = 0.95) {
    const tex = tiled(256, (ctx, w, h) => {
        const rand = rng(seed);
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 2600; i++) {
            ctx.fillStyle = specks[Math.floor(rand() * specks.length)];
            const s = 1.5 + rand() * 3;
            ctx.fillRect(rand() * w, rand() * h, s, s);
        }
    }, rx, ry);
    return new THREE.MeshStandardMaterial({ map: tex, roughness: rough, bumpMap: tex, bumpScale: 0.5 });
}

function flagstones(rx, ry) {
    const tex = tiled(256, (ctx, w, h) => {
        const rand = rng('flags');
        ctx.fillStyle = '#3d3f48';
        ctx.fillRect(0, 0, w, h);
        for (let r = 0; r < 4; r++) {
            let x = r % 2 ? -40 : 0;
            while (x < w) {
                const len = 70 + rand() * 40;
                const v = 118 + rand() * 22;
                ctx.fillStyle = `rgb(${v},${v},${v + 6})`;
                ctx.fillRect(x + 2, r * 64 + 2, len - 4, 60);
                x += len;
            }
        }
    }, rx, ry);
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, bumpMap: tex, bumpScale: 0.4 });
}

/** A lit window as seen from the street: warm glow, curtains, a hint of a room. */
function litWindowTexture(seed) {
    const rand = rng(seed);
    return canvasTex(96, 144, (ctx, w, h) => {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#ffd9a0');
        grad.addColorStop(1, '#f2a65f');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(120,60,30,0.35)';
        ctx.fillRect(w * (0.3 + rand() * 0.3), h * 0.55, w * 0.25, h * 0.45);   // furniture shadow
        ctx.beginPath();
        ctx.arc(w * (0.3 + rand() * 0.4), h * 0.4, 9, 0, Math.PI * 2);           // a lamp
        ctx.fillStyle = '#fff6dc';
        ctx.fill();
        ctx.fillStyle = 'rgba(214,160,120,0.9)';                                  // curtains
        ctx.fillRect(0, 0, w * 0.2, h);
        ctx.fillRect(w * 0.8, 0, w * 0.2, h);
    });
}

function darkWindowTexture() {
    return canvasTex(32, 48, (ctx, w, h) => {
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, '#1c2a4a');
        grad.addColorStop(1, '#0f1730');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(160,190,255,0.12)';
        ctx.fillRect(4, 4, 6, h - 8);
    });
}

/** Sash window on a wall facing +z. `at` is the centre of the opening. */
function sash(parent, w, h, at, lit, ry = 0) {
    const g = group(parent, at, ry);
    box(w + 0.16, h + 0.16, 0.1, WHITE, { at: [0, -(h + 0.16) / 2, 0], parent: g });
    screen(w, h, lit ? litWindowTexture('win' + at.join()) : darkWindowTexture(), { at: [0, 0, 0.055], parent: g, brightness: lit ? 1.35 : 1 });
    box(w, 0.06, 0.04, WHITE, { at: [0, -0.03, 0.06], parent: g, shadow: false });      // meeting rail
    box(0.035, h, 0.03, WHITE, { at: [0, -h / 2, 0.06], parent: g, shadow: false });     // glazing bar
    box(w + 0.3, 0.07, 0.2, STONE, { at: [0, -h / 2 - 0.15, 0.05], parent: g });         // sill
    return g;
}

/** Fireplace set into a chimney breast on the right-hand wall. Returns the flames to animate. */
function fireplace(parent, y, look) {
    const g = group(parent, [DIM.W / 2 - 0.36, y, 0.5], -Math.PI / 2);   // local +z points into the room
    box(1.25, 1.15, 0.06, look.trim, { at: [0, 0, 0], parent: g, r: 0.015 });
    box(1.45, 0.07, 0.24, look.mantel ?? 0x6f482c, { at: [0, 1.15, 0.06], parent: g, r: 0.015 });
    box(0.78, 0.82, 0.08, 0x17171b, { at: [0, 0, 0.005], parent: g, shadow: false, metal: 0.4, rough: 0.6 });
    box(0.56, 0.6, 0.1, 0x070708, { at: [0, 0.05, 0.0], parent: g, shadow: false });
    box(1.3, 0.04, 0.5, 0x3a3a40, { at: [0, 0, 0.26], parent: g, shadow: false }).receiveShadow = true;
    for (let i = 0; i < 3; i++) cyl(0.045, 0.045, 0.4, 0x3a2418, { at: [-0.12 + i * 0.12, 0.09 + (i % 2) * 0.06, 0.07], parent: g, rz: Math.PI / 2, seg: 8, shadow: false });
    // On the mantel
    cyl(0.05, 0.07, 0.2, 0xc9694f, { at: [-0.5, 1.22, 0.06], parent: g });
    box(0.3, 0.36, 0.03, 0x1b1d22, { at: [0.1, 1.22, 0.02], parent: g, rx: -0.08 });
    box(0.24, 0.3, 0.01, 0xe9dfcf, { at: [0.1, 1.25, 0.04], parent: g, rx: -0.08, shadow: false });
    cyl(0.03, 0.03, 0.16, 0xf1ece2, { at: [0.5, 1.22, 0.06], parent: g, seg: 10 });

    const flames = [];
    const flameTex = canvasTex(48, 64, (ctx, w, h) => {
        const grad = ctx.createRadialGradient(w / 2, h * 0.8, 2, w / 2, h * 0.7, w * 0.6);
        grad.addColorStop(0, 'rgba(255,240,190,1)');
        grad.addColorStop(0.4, 'rgba(255,150,50,0.85)');
        grad.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    });
    for (let i = 0; i < 4; i++) {
        const f = screen(0.22, 0.34, flameTex, { transparent: true, brightness: 2.4, at: [-0.15 + i * 0.1, 0.3, 0.08 + (i % 2) * 0.015], parent: g });
        flames.push(f);
    }
    const glow = new THREE.PointLight(0xff8a3c, 0, 5, 1.6);
    glow.position.set(0, 0.35, 0.45);
    g.add(glow);
    return { flames, glow };
}

export function buildShell(scene, rooms) {
    const { W, D, FLOOR, SLAB, WALL, BASE } = DIM;
    const g = group(scene);
    const H = FLOOR * rooms.length;
    const outerW = W + WALL * 2;
    const bricksWide = brick(BRICK, MORTAR, 5, 9);
    const bricksSide = brick(BRICK, MORTAR, 3, 9);
    const cut = mat(CUT, { rough: 0.9 });

    // Plinth
    box(outerW + 0.3, BASE, D + 0.8, 0x77736c, { at: [0, 0, 0.1], parent: g, r: 0.03 });

    // Back wall and the party wall on the right. The front and the left side are cut away.
    box(outerW, H, WALL, 0, { at: [0, BASE, -(D / 2 + WALL / 2)], parent: g, material: bricksWide });
    box(0.05, H, WALL, 0, { at: [-(outerW / 2 + 0.025), BASE, -(D / 2 + WALL / 2)], parent: g, material: cut });
    box(WALL, H, D + WALL, 0, { at: [W / 2 + WALL / 2, BASE, -WALL / 2], parent: g, material: bricksSide });
    box(WALL, H, 0.05, 0, { at: [W / 2 + WALL / 2, BASE, D / 2 + 0.025], parent: g, material: cut });

    // Floors between storeys and the flat roof of the loft room
    for (let i = 1; i <= rooms.length; i++) {
        box(outerW, SLAB, D + WALL, 0x4a3a30, { at: [0, floorY(i) - SLAB, -WALL / 2], parent: g });
        box(outerW, SLAB, 0.05, 0, { at: [0, floorY(i) - SLAB, D / 2 + 0.025], parent: g, material: cut });
        box(0.05, SLAB, D + WALL, 0, { at: [-(outerW / 2 + 0.025), floorY(i) - SLAB, -WALL / 2], parent: g, material: cut });
    }

    // The low front wall of the bay window and the doorstep, left standing where the front was cut
    const bay = group(g, [1.9, BASE, D / 2]);
    box(2.2, 0.5, 0.22, 0, { at: [0, 0, 0.5], parent: bay, material: brick(BRICK, MORTAR, 2, 0.6) });
    for (const side of [-1, 1]) box(0.75, 0.5, 0.22, 0, { at: [side * 1.33, 0, 0.26], parent: bay, ry: side * -0.75, material: brick(BRICK, MORTAR, 0.8, 0.6) });
    box(2.3, 0.06, 0.3, STONE, { at: [0, 0.5, 0.5], parent: bay });
    box(1.3, 0.14, 0.5, STONE, { at: [-2.2, 0, D / 2 + 0.35], parent: g, r: 0.02 });

    // Interior finishes per room
    const fires = [];
    const bulbs = [];
    rooms.forEach((room, i) => {
        const y = floorY(i);
        const inner = FLOOR - SLAB;
        box(W, inner, 0.03, 0, { at: [0, y, -D / 2 + 0.015], parent: g, material: plaster(room.wall, 5, 2), shadow: false });
        box(0.03, inner, D, 0, { at: [W / 2 - 0.015, y, 0], parent: g, material: plaster(room.wall, 3, 2), shadow: false });
        if (room.dado) {
            box(W, 0.95, 0.036, room.dado, { at: [0, y + 0.04, -D / 2 + 0.018], parent: g, shadow: false, rough: 0.9 });
            box(W, 0.05, 0.05, room.trim, { at: [0, y + 0.99, -D / 2 + 0.03], parent: g, shadow: false });
        }
        const floor = box(W + WALL, 0.04, D, room.floor, { at: [-WALL / 2, y, 0], parent: g, shadow: false, material: room.floorMaterial?.() });
        floor.receiveShadow = true;
        // Skirting, picture rail, ceiling
        box(W, 0.14, 0.04, room.trim, { at: [0, y + 0.04, -D / 2 + 0.05], parent: g, shadow: false });
        box(0.04, 0.14, D, room.trim, { at: [W / 2 - 0.05, y + 0.04, 0], parent: g, shadow: false });
        box(W, 0.05, 0.05, room.trim, { at: [0, y + inner - 0.5, -D / 2 + 0.045], parent: g, shadow: false });
        box(W, 0.1, 0.1, room.trim, { at: [0, y + inner - 0.1, -D / 2 + 0.05], parent: g, shadow: false });
        box(W + WALL, 0.02, D, 0xf1ece2, { at: [-WALL / 2, y + inner - 0.02, 0], parent: g, shadow: false });

        // Chimney breast on the party wall, with a fireplace where the room has one
        box(0.34, inner, 1.7, 0, { at: [W / 2 - 0.2, y, 0.5], parent: g, material: plaster(room.wall, 1, 2) });
        box(0.36, 0.14, 1.72, room.trim, { at: [W / 2 - 0.2, y + 0.04, 0.5], parent: g, shadow: false });
        if (room.fireplace) fires.push(fireplace(g, y + 0.04, room));

        // Pendant lamp
        const lamp = group(g, [-1.3, y + inner - 0.02, 0.9]);
        cyl(0.14, 0.14, 0.03, 0xf1ece2, { at: [0, -0.03, 0], parent: lamp, shadow: false });
        cyl(0.006, 0.006, 0.42, IRON, { at: [0, -0.45, 0], parent: lamp, seg: 6, shadow: false });
        cyl(0.13, 0.26, 0.24, 0, { at: [0, -0.68, 0], parent: lamp, shadow: false, material: new THREE.MeshStandardMaterial({ color: room.shade ?? 0xe9c9a0, emissive: room.light, emissiveIntensity: 0.9, roughness: 0.9, side: THREE.DoubleSide }) });
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(room.light).multiplyScalar(3), toneMapped: false }));
        bulb.position.y = -0.62;
        lamp.add(bulb);
        bulbs.push(bulb);
    });

    const roof = buildLoftRoof(g, floorY(rooms.length), outerW);
    const twin = buildNeighbour(g);
    return {
        group: g,
        tick(time) {
            for (const [i, fire] of fires.entries()) {
                const flick = 0.75 + Math.sin(time * 11 + i) * 0.12 + Math.sin(time * 23.7 + i * 2) * 0.1;
                fire.glow.intensity = 9 * flick;
                fire.flames.forEach((f, k) => {
                    f.scale.set(1 + Math.sin(time * 9 + k * 2.1) * 0.15, 0.85 + Math.sin(time * 13 + k * 1.3) * 0.25, 1);
                    f.position.y = 0.26 + f.scale.y * 0.06;
                });
            }
            roof.tick?.(time);
            twin.tick?.(time);
        },
    };
}

/** The flat top of the loft room, and the chimney the two houses share. */
function buildLoftRoof(g, y, outerW) {
    const { W, D, WALL } = DIM;
    box(outerW + 0.16, 0.08, D + WALL + 0.16, 0x3b3f48, { at: [0, y, -WALL / 2], parent: g, rough: 0.6, metal: 0.2 });
    box(outerW + 0.2, 0.1, 0.1, 0x2c2f36, { at: [0, y - 0.02, D / 2 + 0.08], parent: g });

    // Chimney stack on the party wall
    const stack = group(g, [W / 2 + WALL / 2, y - 0.4, RIDGE.z]);
    box(1.3, 2.0, 0.75, 0, { at: [0, 0, 0], parent: stack, material: brick(BRICK, MORTAR, 1.2, 3) });
    box(1.42, 0.1, 0.87, STONE, { at: [0, 1.7, 0], parent: stack });
    box(1.36, 0.12, 0.81, 0, { at: [0, 2.0, 0], parent: stack, material: brick(0x8c4733, MORTAR, 1.2, 0.2) });
    const pots = [];
    for (const [x, z] of [[-0.4, -0.14], [-0.13, 0.14], [0.13, -0.14], [0.4, 0.14]]) {
        const pot = cyl(0.09, 0.12, 0.45, 0xb5633f, { at: [x, 2.12, z], parent: stack, seg: 14 });
        pots.push(pot);
    }
    // TV aerial
    cyl(0.015, 0.015, 1.3, 0x9aa0a8, { at: [0.55, 1.5, -0.3], parent: stack, seg: 6, metal: 0.6, rough: 0.4 });
    for (let i = 0; i < 5; i++) box(0.02, 0.02, 0.5 - i * 0.05, 0x9aa0a8, { at: [0.55 - 0.3 + i * 0.15, 2.7, -0.3], parent: stack, shadow: false });
    box(0.7, 0.02, 0.02, 0x9aa0a8, { at: [0.55, 2.7, -0.3], parent: stack, shadow: false });

    g.userData.chimneyPots = pots;
    g.userData.catSpot = [-2.6, y + 0.08, DIM.D / 2 - 0.25];
    return {};
}

/** The house next door, left whole: this is what the cut-open one looks like from the street. */
function buildNeighbour(g) {
    const { W, D, WALL, BASE, FLOOR } = DIM;
    const x0 = W / 2 + WALL;          // party line
    const width = 8.2;
    const cx = x0 + width / 2;
    const front = D / 2;
    const n = group(g);

    // Brick ground floor, rendered first floor, stone band between
    box(width, FLOOR + BASE, D + WALL, 0, { at: [cx, 0, -WALL / 2], parent: n, material: brick(BRICK, MORTAR, 5, 4.5) });
    box(width, FLOOR, D + WALL, 0, { at: [cx, BASE + FLOOR, -WALL / 2], parent: n, material: plaster(RENDER, 4, 2) });
    box(width + 0.04, 0.12, 0.08, STONE, { at: [cx, BASE + FLOOR - 0.06, front + 0.03], parent: n });
    box(width, 0.2, 0.1, WHITE, { at: [cx, EAVES - 0.2, front + 0.05], parent: n });           // fascia
    cyl(0.07, 0.07, width, IRON, { at: [cx, EAVES - 0.07, front + 0.16], parent: n, rz: Math.PI / 2, seg: 10 }).position.y = EAVES - 0.02;
    cyl(0.04, 0.04, EAVES - 0.4, IRON, { at: [x0 + width - 0.25, 0.3, front + 0.08], parent: n, seg: 8 });

    // First-floor sash windows and the diamond plaque between the two houses
    sash(n, 1.15, 1.75, [x0 + 2.3, BASE + FLOOR + 1.75, front + 0.02], true);
    sash(n, 1.15, 1.75, [x0 + 6.1, BASE + FLOOR + 1.75, front + 0.02], false);
    const plaque = box(0.5, 0.5, 0.05, STONE, { at: [x0 + 0.05, BASE + FLOOR + 1.5, front + 0.02], parent: n });
    plaque.rotation.z = Math.PI / 4;
    box(0.26, 0.26, 0.06, 0x8c4733, { at: [x0 + 0.05, BASE + FLOOR + 1.62, front + 0.02], parent: n, shadow: false }).rotation.z = Math.PI / 4;

    // Bay window
    const bay = group(n, [x0 + 2.3, BASE, front]);
    const baySide = 0.82, bayDepth = 0.58;
    const panel = (w, at, ry, lit) => {
        const p = group(bay, at, ry);
        box(w, 0.75, 0.2, 0, { at: [0, 0, 0], parent: p, material: brick(BRICK, MORTAR, w * 0.6, 1) });
        box(w + 0.06, 0.07, 0.3, STONE, { at: [0, 0.75, 0.02], parent: p });
        box(w, 1.6, 0.14, WHITE, { at: [0, 0.82, 0], parent: p });
        screen(w - 0.2, 1.4, lit ? litWindowTexture('bay' + ry) : darkWindowTexture(), { at: [0, 1.62, 0.075], parent: p, brightness: 1.35 });
        box(w - 0.2, 0.05, 0.03, WHITE, { at: [0, 1.6, 0.08], parent: p, shadow: false });
        box(w, 0.22, 0.2, WHITE, { at: [0, 2.42, 0], parent: p });
    };
    panel(1.7, [0, 0, bayDepth], 0, true);
    panel(baySide, [-0.85 - 0.29, 0, bayDepth / 2], -Math.PI / 4, true);
    panel(baySide, [0.85 + 0.29, 0, bayDepth / 2], Math.PI / 4, true);
    const bayGlow = new THREE.PointLight(0xffc27a, 5, 6, 1.6);
    bayGlow.position.set(0, 1.6, bayDepth + 0.8);
    bay.add(bayGlow);

    // Front door with an arched fanlight
    const door = group(n, [x0 + 6.1, BASE, front]);
    box(1.3, 2.25, 0.1, WHITE, { at: [0, 0, 0.02], parent: door });
    box(0.98, 2.05, 0.08, 0x1d2a3a, { at: [0, 0, 0.06], parent: door, rough: 0.45 });
    for (const [px, py, ph] of [[-0.23, 0.25, 0.7], [0.23, 0.25, 0.7], [-0.23, 1.1, 0.75], [0.23, 1.1, 0.75]]) {
        box(0.34, ph, 0.02, 0x172230, { at: [px, py, 0.105], parent: door, shadow: false, rough: 0.5 });
    }
    ball(0.035, 0xd9b36a, { at: [0.36, 1.05, 0.13], parent: door, metal: 0.9, rough: 0.3 });
    box(0.22, 0.04, 0.02, 0xd9b36a, { at: [0, 1.0, 0.11], parent: door, metal: 0.9, rough: 0.3, shadow: false });
    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.49, 24, 0, Math.PI), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.05, 0.6), toneMapped: false }));
    fan.position.set(0, 2.08, 0.11);
    door.add(fan);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 8, 24, Math.PI), mat(WHITE));
    arch.position.set(0, 2.08, 0.08);
    door.add(arch);
    for (const a of [Math.PI / 3, Math.PI / 2, (2 * Math.PI) / 3]) {
        box(0.03, 0.48, 0.02, WHITE, { at: [Math.cos(a) * 0.24, 2.08 + Math.sin(a) * 0.24 - 0.24, 0.115], parent: door, rz: a - Math.PI / 2, shadow: false });
    }
    box(1.5, 0.14, 0.5, STONE, { at: [0, -0.02, 0.3], parent: door, r: 0.02 });

    // Slate canopy over the bay and the door
    const slates = slate(5, 1);
    const canopy = box(width - 0.5, 0.07, 1.25, 0, { at: [cx, BASE + 2.78, front + 0.5], parent: n, material: slates });
    canopy.rotation.x = 0.42;
    box(width - 0.5, 0.12, 0.08, WHITE, { at: [cx, BASE + 2.5, front + 1.06], parent: n });
    for (const bx of [x0 + 0.5, x0 + 4.4, x0 + 7.7]) box(0.07, 0.07, 0.9, WHITE, { at: [bx, BASE + 2.5, front + 0.55], parent: n });

    // Pitched slate roof with two rooflights
    const roofMat = slate(6, 5);
    const run = front + 0.3 - RIDGE.z;
    const rise = RIDGE.y - EAVES;
    const len = Math.hypot(run, rise);
    const pitch = Math.atan2(rise, run);
    const frontSlope = box(width + 0.3, 0.1, len, 0, { at: [cx + 0.15, 0, 0], parent: n, material: roofMat });
    frontSlope.position.set(cx + 0.15, EAVES + rise / 2, RIDGE.z + run / 2);
    frontSlope.rotation.x = pitch;
    const backRun = RIDGE.z + D / 2 + WALL + 0.3;
    const backSlope = box(width + 0.3, 0.1, Math.hypot(backRun, rise), 0, { at: [0, 0, 0], parent: n, material: roofMat });
    backSlope.position.set(cx + 0.15, EAVES + rise / 2, RIDGE.z - backRun / 2);
    backSlope.rotation.x = -Math.atan2(rise, backRun);
    cyl(0.09, 0.09, width + 0.3, 0x3a3f4a, { at: [0, 0, 0], parent: n, rz: Math.PI / 2, seg: 10 }).position.set(cx + 0.15, RIDGE.y + 0.04, RIDGE.z);
    // gable end
    const gable = new THREE.Shape();
    gable.moveTo(-(D / 2 + WALL), 0);
    gable.lineTo(front, 0);
    gable.lineTo(RIDGE.z, rise);
    gable.closePath();
    const gableMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(gable, { depth: 0.2, bevelEnabled: false }), plaster(RENDER, 2, 1));
    gableMesh.rotation.y = -Math.PI / 2;
    gableMesh.position.set(x0 + width, EAVES, 0);
    gableMesh.castShadow = true;
    n.add(gableMesh);
    const lights = [];
    for (const [vx, lit] of [[x0 + 2.3, true], [x0 + 6.1, false]]) {
        const v = group(n, [vx, EAVES + rise * 0.52, RIDGE.z + run * 0.48]);
        v.rotation.x = pitch - Math.PI / 2;
        box(0.95, 1.25, 0.1, 0x2a2d33, { at: [0, -0.625, 0.06], parent: v });
        const glass = screen(0.8, 1.1, lit ? litWindowTexture('velux') : darkWindowTexture(), { at: [0, 0, 0.12], parent: v, brightness: lit ? 1.2 : 1 });
        if (lit) lights.push(glass);
    }

    // The next house along, set back a little, and a fence between
    const far = group(n, [x0 + width + 5.4, 0, -0.6]);
    box(7.5, EAVES, D, 0, { at: [0, 0, 0], parent: far, material: brick(0x96503a, MORTAR, 4, 6) });
    const farRoof = box(7.9, 0.1, 4.3, 0, { at: [0, 0, 0], parent: far, material: roofMat });
    farRoof.position.set(0, EAVES + 1.5, 1.0);
    farRoof.rotation.x = 0.82;
    sash(far, 1.0, 1.6, [-1.6, BASE + FLOOR + 1.7, D / 2 + 0.02], true);
    sash(far, 1.0, 1.6, [1.6, BASE + FLOOR + 1.7, D / 2 + 0.02], false);
    sash(far, 1.0, 1.6, [-1.6, BASE + 1.6, D / 2 + 0.02], false);
    for (let i = 0; i < 9; i++) box(0.24, 1.3 + (i % 2) * 0.04, 0.04, 0x7a5a40, { at: [x0 + width + 0.2 + i * 0.26, 0.05, front + 0.6], parent: n });

    return {};
}

export function buildStreet(scene) {
    const g = group(scene);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 48), mat(0x1c2a26, { rough: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    g.add(ground);

    // Gravel drive in front of the houses, lawn at the side
    const drive = box(34, 0.06, 4.4, 0, { at: [4, 0, 5.0], parent: g, shadow: false, material: speckled('gravel', '#b8a88c', ['#cdbfa5', '#9c8d74', '#d9cdb6', '#8a7c66'], 12, 2) });
    drive.receiveShadow = true;
    const lawn = box(14, 0.07, 9.5, 0, { at: [-11.3, 0, 0.8], parent: g, shadow: false, material: speckled('lawn', '#35603a', ['#3f7044', '#2c5231', '#4a7d4c'], 6, 4) });
    lawn.receiveShadow = true;
    box(0.12, 0.12, 9.5, 0x77736c, { at: [-4.35, 0, 0.8], parent: g, shadow: false });

    // Pavement, kerb and a quiet road
    const pave = box(60, 0.1, 2.0, 0, { at: [0, 0, 8.2], parent: g, shadow: false, material: flagstones(30, 1) });
    pave.receiveShadow = true;
    box(60, 0.13, 0.2, 0x8d8a84, { at: [0, 0, 9.3], parent: g, shadow: false });
    const road = box(60, 0.04, 7, 0x24262d, { at: [0, 0, 12.9], parent: g, shadow: false, rough: 0.8 });
    road.receiveShadow = true;
    // Low brick wall along the pavement, with a gap for each drive
    const wallMat = brick(BRICK, MORTAR, 3, 0.7);
    for (const [x, w] of [[-12.5, 12], [-1.2, 5.6], [8.5, 6.5], [19, 9]]) {
        box(w, 0.6, 0.24, 0, { at: [x, 0.06, 7.05], parent: g, material: wallMat });
        box(w + 0.06, 0.06, 0.3, STONE, { at: [x, 0.66, 7.05], parent: g });
    }
    for (const x of [-6.6, 1.7, 5.1, 11.9, 14.4]) {
        box(0.42, 0.85, 0.42, 0, { at: [x, 0.06, 7.05], parent: g, material: brick(BRICK, MORTAR, 0.5, 1) });
        box(0.5, 0.07, 0.5, STONE, { at: [x, 0.91, 7.05], parent: g });
    }

    // Hedge and fence round the side garden
    for (let i = 0; i < 10; i++) {
        ball(0.62, 0x2f5a3a, { at: [-17.5 + i * 1.12, 0.62, 6.2], parent: g, flat: true, scale: [1, 0.95, 0.8] });
    }
    for (let i = 0; i < 26; i++) box(0.3, 1.5 + (i % 3) * 0.03, 0.04, 0x6b4e38, { at: [-18 + i * 0.33, 0.05, -3.9], parent: g });

    // Places for the Blender-built props (lamp post, tree, shrub), filled in by World
    g.userData.props = {
        street_lamp: { at: [7.4, 0.1, 8.0], ry: 0 },
        tree: { at: [-9.6, 0.05, -1.4], ry: 0.6 },
        shrub: { at: [-5.6, 0.07, 3.6], ry: 0 },
    };
    const lampGlow = new THREE.SpotLight(0xffc98a, 70, 14, 1.0, 1, 1.3);
    lampGlow.position.set(7.4, 3.55, 8.0);
    lampGlow.target.position.set(7.4, 0, 7.2);
    g.add(lampGlow, lampGlow.target);

    // Bicycle against the garden wall
    const bike = group(g, [-2.6, 0.06, 6.55], 0.06);
    bike.rotation.x = -0.14;
    const steel = mat(0x2f6f73, { metal: 0.4, rough: 0.4 });
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
    box(0.2, 0.04, 0.09, 0x6b4e38, { at: [-0.3, 0.86, 0], parent: bike, r: 0.015 });
    box(0.03, 0.03, 0.4, 0x15161d, { at: [0.36, 0.95, 0], parent: bike });

    // Doormat and a couple of pots by the step
    box(0.8, 0.02, 0.5, 0, { at: [-2.2, 0.06, 3.4], parent: g, shadow: false, material: fabric(0x7a5a40) });
    for (const [x, s] of [[-3.2, 1], [-1.2, 0.8]]) {
        cyl(0.2 * s, 0.15 * s, 0.32 * s, 0xb5633f, { at: [x, 0.06, 3.1], parent: g });
        ball(0.26 * s, 0x3f7a50, { at: [x, 0.5 * s, 3.1], parent: g, flat: true });
    }

    buildBackdrop(g);
    return { group: g };
}

/** Rooftops and trees across the way, so the house sits in a town rather than a void. */
function buildBackdrop(g) {
    const rand = rng('town');
    const wallColors = [0x3a2c30, 0x40343a, 0x2f2a36];
    for (let i = 0; i < 26; i++) {
        const w = 6 + rand() * 4;
        const h = 5 + rand() * 2.5;
        const x = -95 + i * 7.6 + rand() * 2;
        const z = -30 - rand() * 26;
        const tex = canvasTex(64, 64, (ctx, cw, ch) => {
            ctx.fillStyle = '#' + new THREE.Color(wallColors[i % 3]).getHexString();
            ctx.fillRect(0, 0, cw, ch);
            for (let r = 0; r < 2; r++) {
                for (let c = 0; c < 3; c++) {
                    ctx.fillStyle = rand() < 0.4 ? '#f2b66f' : '#1a2238';
                    ctx.fillRect(8 + c * 19, 10 + r * 26, 9, 14);
                }
            }
        });
        const house = new THREE.Mesh(new THREE.BoxGeometry(w, h, 6), new THREE.MeshBasicMaterial({ map: tex }));
        house.position.set(x, h / 2, z);
        house.userData.noAO = true;
        g.add(house);
        const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 3.9, 2.6, 4, 1), new THREE.MeshBasicMaterial({ color: 0x1c2233 }));
        roof.scale.set(w / 5.2, 1, 1);
        roof.rotation.y = Math.PI / 4;
        roof.position.set(x, h + 1.3, z);
        roof.userData.noAO = true;
        g.add(roof);
        const stack = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 0.8), new THREE.MeshBasicMaterial({ color: 0x2a2026 }));
        stack.position.set(x + w * 0.3, h + 1.6, z);
        stack.userData.noAO = true;
        g.add(stack);
        if (rand() < 0.6) {
            const tree = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4 + rand() * 1.6, 1), new THREE.MeshBasicMaterial({ color: 0x15261f }));
            tree.position.set(x + 4 + rand() * 2, 3 + rand() * 2, z + 6 + rand() * 4);
            tree.userData.noAO = true;
            g.add(tree);
        }
    }
    // A church spire on the skyline
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.6, 9, 4), new THREE.MeshBasicMaterial({ color: 0x1a2032 }));
    spire.position.set(-34, 16, -62);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(3, 12, 3), new THREE.MeshBasicMaterial({ color: 0x1f2538 }));
    tower.position.set(-34, 6, -62);
    spire.userData.noAO = tower.userData.noAO = true;
    g.add(spire, tower);
}

export function buildSky(scene) {
    scene.background = new THREE.Color(0x0a1230);
    const tex = canvasTex(16, 1024, (ctx, w, h) => {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#081028');
        grad.addColorStop(0.28, '#12204a');
        grad.addColorStop(0.42, '#2b3f78');
        grad.addColorStop(0.475, '#6a6a9c');
        grad.addColorStop(0.495, '#e2a987');
        grad.addColorStop(0.5, '#f4c08e');
        grad.addColorStop(0.505, '#1c2748');
        grad.addColorStop(1, '#1c2748');
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
        for (let i = 0; i < 160; i++) {
            const a = rand() * Math.PI * 2;
            const r = 70 + rand() * 20;
            pts.push(Math.cos(a) * r, 22 + rand() * 60, -Math.abs(Math.sin(a) * r) - 10);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const stars = new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0xdfe6ff, size: layer ? 0.3 : 0.2, sizeAttenuation: true, transparent: true, opacity: 0.8, fog: false,
        }));
        scene.add(stars);
        return stars;
    });

    const moon = new THREE.Mesh(
        new THREE.CircleGeometry(2.2, 40),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.45, 1.3), fog: false, toneMapped: false })
    );
    moon.position.set(30, 34, -70);
    moon.userData.noAO = true;
    scene.add(moon);

    // Slow evening clouds
    const cloudTex = canvasTex(256, 96, (ctx, w, h) => {
        for (let i = 0; i < 26; i++) {
            const x = 40 + rand() * (w - 80), y = h * 0.5 + (rand() - 0.5) * 26, r = 14 + rand() * 26;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, 'rgba(230,190,190,0.11)');
            grad.addColorStop(1, 'rgba(255,200,180,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
    });
    const clouds = [];
    for (let i = 0; i < 6; i++) {
        const c = screen(26 + rand() * 20, 7 + rand() * 4, cloudTex, { transparent: true, brightness: 0.7, at: [-70 + i * 28, 12 + rand() * 14, -70 - rand() * 12] });
        c.material.fog = false;
        scene.add(c);
        clouds.push(c);
    }

    return {
        tick(time, dt) {
            layers[0].material.opacity = 0.6 + Math.sin(time * 1.3) * 0.2;
            layers[1].material.opacity = 0.6 + Math.sin(time * 0.9 + 2) * 0.25;
            for (const c of clouds) {
                c.position.x += dt * 0.3;
                if (c.position.x > 95) c.position.x = -95;
            }
        },
    };
}
