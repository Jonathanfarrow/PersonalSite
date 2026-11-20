// Models built in Blender (tools/blender/build_props.py), loaded once and cloned where needed.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const library = new Map();

export async function loadProps(url = 'src/assets/models/props.glb') {
    try {
        const gltf = await new GLTFLoader().loadAsync(url);
        gltf.scene.updateMatrixWorld(true);
        for (const child of [...gltf.scene.children]) library.set(child.name, child);
    } catch (err) {
        console.warn('Prop models could not be loaded; simple stand-ins will be used.', err);
    }
}

/**
 * A copy of a named model, or null if it is not available.
 * `colors` recolours materials by name, e.g. { fabric: 0xc98f3a }.
 */
export function prop(name, { at = [0, 0, 0], ry = 0, scale = 1, colors = {}, parent, shadow = true } = {}) {
    const source = library.get(name);
    if (!source) return null;
    const object = source.clone(true);
    object.position.set(...at);
    object.rotation.set(0, ry, 0);
    object.scale.setScalar(scale);
    object.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = shadow;
        node.receiveShadow = true;
        const swap = (m) => {
            if (colors[m.name] === undefined) return m;
            const copy = m.clone();
            copy.color.set(colors[m.name]);
            return copy;
        };
        node.material = Array.isArray(node.material) ? node.material.map(swap) : swap(node.material);
    });
    if (parent) parent.add(object);
    return object;
}
