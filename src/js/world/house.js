// The house itself comes from Blender with its lighting baked in (tools/blender/).
// This file loads it and adds everything that moves or can be clicked.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { plane, liveScreen, dawPainter, codePainter, attractPainter, marqueeTexture, scopePainter, puffTexture } from './screens.js';

// Layout shared with tools/blender/build_cutaway.py (metres, y up, z toward the viewer).
export const DIM = { W: 8, D: 5, FLOOR: 3.2, SLAB: 0.25, WALL: 0.25, KNEE: 1.0, APEX: 4.09 };
const FLOORS = [0.3, 3.5, 6.7];
export const ROOMS = [
    { id: 'games', y: FLOORS[0] + 0.04, height: 2.95 },
    { id: 'office', y: FLOORS[1] + 0.04, height: 2.95 },
    { id: 'studio', y: FLOORS[2] + 0.04, height: DIM.APEX },
];
const RECORD_SLOTS = [[0.04, 3.05], [-0.48, 2.3], [0.48, 2.3], [-0.95, 1.55], [0, 1.55], [0.95, 1.55]];

const MODELS = 'src/assets/models/';

function group(parent, at = [0, 0, 0], ry = 0, rx = 0) {
    const g = new THREE.Group();
    g.position.set(...at);
    g.rotation.set(rx, ry, 0);
    parent.add(g);
    return g;
}

/** An invisible box you can click, with a floating dot above it. */
function hotspot(parent, id, label, at, size, pipAt) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ visible: false }));
    mesh.position.set(...at);
    mesh.userData.hotspot = { id, label };
    const pip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.4) }));
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.085, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
    pip.add(halo);
    pip.position.set(...(pipAt ?? [0, size[1] / 2 + 0.22, size[2] / 2]));
    pip.userData.pip = { baseY: pip.position.y, phase: Math.random() * 6 };
    pip.visible = false;
    mesh.add(pip);
    mesh.userData.pip = pip;
    parent.add(mesh);
    return mesh;
}

async function loadModel() {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const [gltf, layout] = await Promise.all([
        loader.loadAsync(MODELS + 'house.glb'),
        fetch(MODELS + 'scene.json').then((r) => r.json()),
    ]);
    return { gltf, layout };
}

/**
 * Builds the scene. Returns { rooms: [{ id, y, height, spots }], tick(time, dt) }.
 */
export async function buildHouse(scene, site) {
    const { gltf, layout } = await loadModel();
    const tickers = [];

    // ---- baked geometry: lighting is already in the texture / vertex colours, so draw it unlit
    const named = {};
    gltf.scene.traverse((node) => {
        if (!node.isMesh) return;
        const map = node.material.map;
        if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; }
        node.material = new THREE.MeshBasicMaterial({ map: map ?? null, vertexColors: !map, side: THREE.DoubleSide });
        named[node.name.split('.')[0]] = node;
    });
    scene.add(named.house, named.outside);
    for (const [kind, items] of Object.entries(layout.instances ?? {})) {
        const source = named[kind];
        if (!source) continue;
        const mesh = new THREE.InstancedMesh(source.geometry, source.material, items.length);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
        items.forEach((it, i) => {
            q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.ry);
            m.compose(new THREE.Vector3(...it.at), q, s.setScalar(it.scale));
            mesh.setMatrixAt(i, m);
        });
        mesh.frustumCulled = false;
        scene.add(mesh);
    }

    // ---- sky rendered from the same Blender world
    new THREE.TextureLoader().load(MODELS + 'sky.jpg', (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = tex;
        scene.backgroundRotation.y = Math.PI / 2;
    });
    scene.background = new THREE.Color(0x8a8378);

    // ---- chimney smoke
    const smokeTex = puffTexture('rgba(235,225,215,0.55)', 'rgba(235,225,215,0)');
    const [sx, sy, sz] = layout.smoke?.[0] ?? [4.6, 11.3, 0.9];
    const puffs = Array.from({ length: 18 }, (_, i) => {
        const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false }));
        p.userData = { offset: i / 18, wobble: Math.random() * 6 };
        scene.add(p);
        return p;
    });
    tickers.push((time) => {
        for (const p of puffs) {
            const t = (time * 0.07 + p.userData.offset) % 1;
            p.position.set(
                sx + t * t * 4.2 + Math.sin(time * 0.6 + p.userData.wobble) * 0.12 * (0.3 + t),
                sy - 0.2 + t * 3.4 + Math.sin(t * 6 + p.userData.wobble) * 0.1,
                sz - t * 0.5
            );
            p.scale.setScalar(0.45 + t * 1.9);
            p.material.opacity = Math.min(t * 6, 1) * (1 - t) * 0.9;
        }
    });

    // ---- firelight in the two fireplaces
    const flameTex = puffTexture('rgba(255,235,170,1)', 'rgba(255,110,30,0)');
    const flames = [];
    for (const floor of [ROOMS[0], ROOMS[1]]) {
        for (let i = 0; i < 4; i++) {
            const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
            f.position.set(3.5, floor.y + 0.3, 0.5 - 0.15 + i * 0.1);
            f.userData = { phase: i * 2.1 + floor.y, baseY: floor.y + 0.3 };
            scene.add(f);
            flames.push(f);
        }
    }
    tickers.push((time) => {
        for (const f of flames) {
            const k = 0.85 + Math.sin(time * 11 + f.userData.phase) * 0.18 + Math.sin(time * 23.7 + f.userData.phase * 2) * 0.1;
            f.scale.set(0.3 * k, 0.42 * k, 1);
            f.position.y = f.userData.baseY + (k - 0.85) * 0.12;
            f.material.opacity = 0.75 + (k - 0.85);
        }
    });

    const rooms = ROOMS.map((r) => ({ ...r, spots: [], root: group(scene, [0, r.y, 0]) }));
    const [games, office, studio] = rooms;
    const live = [];
    const add = (parent, mesh, at, ry = 0, rx = 0) => { mesh.position.set(...at); mesh.rotation.set(rx, ry, 0); parent.add(mesh); return mesh; };

    // ---- studio: live arrangement screen, records you can click
    {
        const desk = group(studio.root, [-1.7, 0, -1.75]);
        live.push(add(desk, liveScreen(1.04, 0.6, 512, 300, dawPainter(), { interval: 0.08 }), [0, 1.31, -0.225]));
        studio.spots.push(hotspot(studio.root, 'tracks', 'The desk · all tracks', [-1.7, 0.95, -1.7], [2.6, 1.9, 1.2]));
        (site.studio.tracks ?? []).slice(0, RECORD_SLOTS.length).forEach((track, i) => {
            const [x, y] = RECORD_SLOTS[i];
            const label = track.artist ? `${track.title} · ${track.artist}` : track.title;
            studio.spots.push(hotspot(studio.root, `track:${i}`, label, [x + (i === 0 ? 0.04 : 0), y, -2.38], [0.8, 0.8, 0.14], [0, 0.5, 0.1]));
        });
    }

    // ---- office: typing editor, oscilloscope, portrait, three clickable things
    {
        const desk = group(office.root, [-1.55, 0, -1.7]);
        const monitor = group(desk, [-0.5, 0.8, -0.28], 0.22);
        live.push(add(monitor, liveScreen(0.88, 0.52, 512, 300, codePainter('code-a'), { interval: 0.07 }), [0, 0.46, 0.056]));
        const bench = group(office.root, [-2.7, 0, 1.25], 0.3);
        live.push(add(bench, liveScreen(0.26, 0.2, 128, 96, scopePainter(), { interval: 0.05 }), [0.42, 1.02, 0.116]));
        if (site.about?.photo) {
            new THREE.TextureLoader().load(site.about.photo, (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                add(office.root, plane(0.56, 0.56, tex, { brightness: 0.8 }), [-3.0, 2.06, -2.408]);
            });
        }
        office.spots.push(hotspot(office.root, 'work', 'The desk · work', [-1.55, 0.85, -1.65], [2.7, 1.7, 1.2]));
        office.spots.push(hotspot(office.root, 'about', 'About me', [-3.0, 2.06, -2.38], [0.7, 0.7, 0.14], [0, 0.48, 0.1]));
        office.spots.push(hotspot(office.root, 'writing', 'The bookshelf · writing', [2.9, 1.2, -2.15], [1.8, 2.4, 0.6]));
    }

    // ---- games room: each cabinet is a game
    (site.games.games ?? []).slice(0, 3).forEach((game, i) => {
        const cab = group(games.root, [-3.3 + i * 1.02, 0, -1.95]);
        const screen = add(cab, liveScreen(0.66, 0.54, 256, 208, attractPainter(game, i), { interval: 0.1 }), [0, 1.33, 0.452], 0, -0.14);
        if (game.image) {
            new THREE.TextureLoader().load(game.image, (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                screen.material.map = tex;
                screen.material.needsUpdate = true;
                screen.userData.repaint = () => {};
            });
        }
        live.push(screen);
        add(cab, plane(0.78, 0.2, marqueeTexture(game, i)), [0, 1.81, 0.476]);
        games.spots.push(hotspot(games.root, `game:${i}`, game.title, [-3.3 + i * 1.02, 1.0, -1.9], [0.92, 2.0, 0.95]));
    });

    tickers.push((time) => live.forEach((m) => m.userData.repaint(time)));

    return {
        rooms,
        tick(time, dt) { for (const t of tickers) t(time, dt); },
    };
}
