"""Bake the cut-open house's lighting and export it for the website.

Run:  blender -b --python tools/blender/bake_export.py -- [--res 4096] [--samples 48] [--out src/assets/models]

Produces house.glb: `house` carries a baked texture atlas, `outside` and the instanced
`tree`/`shrub` carry baked vertex colours. Also writes scene.json (instances) and sky.png.
"""
import bpy, bmesh, sys, os, json, math, time
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None): return argv[argv.index(name) + 1] if name in argv else default
RES = int(arg('--res', '4096')); SAMPLES = int(arg('--samples', '48')); VSAMPLES = int(arg('--vsamples', '24'))
OUT = os.path.join(ROOT, arg('--out', 'src/assets/models')); os.makedirs(OUT, exist_ok=True)
EXPOSURE = float(arg('--exposure', '0.45'))

saved = sys.argv; sys.argv = [a for a in sys.argv[:sys.argv.index('--')]] if '--' in sys.argv else sys.argv
ns = {'__file__': os.path.join(HERE, 'build_cutaway.py'), '__name__': 'build'}
exec(compile(open(ns['__file__']).read(), ns['__file__'], 'exec'), ns)
sys.argv = saved
scene = bpy.context.scene; vl = bpy.context.view_layer
t0 = time.time()
def log(*a): print('BAKE', round(time.time() - t0), *a, flush=True)

def descendants(o):
    out = []
    for c in o.children: out.append(c); out += descendants(c)
    return out

house_objs = [o for o in descendants(ns['house'].obj) if o.type == 'MESH']
garden_objs = [o for o in descendants(ns['garden_root'].obj) if o.type == 'MESH']
church_objs = [o for o in descendants(ns['church_root'].obj) if o.type == 'MESH']
smoke = [o for o in house_objs if o.get('smoke')]
house_objs = [o for o in house_objs if not o.get('smoke')]
atlas_extra = [o for o in garden_objs if o.get('atlas')]
instanced = {}
for o in garden_objs:
    if o.get('prop') in ('tree', 'shrub'): instanced.setdefault(o['prop'], []).append(o)
outside_objs = [o for o in garden_objs + church_objs if not o.get('atlas') and o.get('prop') not in ('tree', 'shrub')]

# smoke start point, for the animated version on the site
vl.update()
smoke_at = [list(o.matrix_world.translation) for o in smoke[:1]]
for o in smoke: bpy.data.objects.remove(o)

def flatten(objs, name):
    """Apply modifiers and transforms, then join into one mesh object."""
    dg = bpy.context.evaluated_depsgraph_get()
    made = []
    for o in objs:
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        me.transform(o.matrix_world)
        n = bpy.data.objects.new(name, me); scene.collection.objects.link(n); made.append(n)
    for o in objs: bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action='DESELECT')
    for n in made: n.select_set(True)
    vl.objects.active = made[0]
    bpy.ops.object.join()
    j = vl.objects.active; j.name = name
    j.data.use_auto_smooth = True; j.data.auto_smooth_angle = math.radians(40)
    return j

def tonemap(x):
    """Scene-linear -> display-linear, close to the Filmic look of the stills."""
    x = np.maximum(x * (2.0 ** EXPOSURE), 0.0)
    y = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)
    return np.clip(y, 0.0, 1.0)

def srgb_encode(y):
    return np.where(y <= 0.0031308, y * 12.92, 1.055 * np.power(np.maximum(y, 1e-9), 1 / 2.4) - 0.055)

scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.use_denoising = False
scene.cycles.sample_clamp_indirect = 3.0; scene.cycles.sample_clamp_direct = 12.0; scene.cycles.max_bounces = 5
scene.cycles.caustics_reflective = False; scene.cycles.caustics_refractive = False
bk = scene.render.bake
bk.use_pass_direct = True; bk.use_pass_indirect = True; bk.use_pass_diffuse = True; bk.use_pass_emit = True
bk.use_pass_glossy = False; bk.use_pass_transmission = False; bk.margin = 6; bk.use_clear = True

# ---------------------------------------------------------------- house: texture atlas
house = flatten(house_objs + atlas_extra, 'house')
log('house joined', len(house.data.polygons), 'faces')
bpy.ops.object.select_all(action='DESELECT'); house.select_set(True); vl.objects.active = house
for uv in list(house.data.uv_layers): house.data.uv_layers.remove(uv)
house.data.uv_layers.new(name='UVMap')
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0012, area_weight=0.0)
bpy.ops.object.mode_set(mode='OBJECT')
log('unwrapped')
img = bpy.data.images.new('house_bake', RES, RES, alpha=False, float_buffer=True)
for m in {s.material for s in house.material_slots if s.material}:
    nt = m.node_tree; node = nt.nodes.new('ShaderNodeTexImage'); node.image = img
    for n in nt.nodes: n.select = False
    node.select = True; nt.nodes.active = node
scene.cycles.samples = SAMPLES; bk.target = 'IMAGE_TEXTURES'
bpy.ops.object.bake(type='COMBINED')
log('house baked')
px = np.empty(RES * RES * 4, dtype=np.float32); img.pixels.foreach_get(px)
rgb = srgb_encode(tonemap(px.reshape(RES, RES, 4)[:, :, :3]))
import subprocess
np.save(os.path.join(OUT, 'house_bake.npy'), rgb.astype(np.float32))
subprocess.run(['python3', os.path.join(HERE, 'encode_bake.py'), os.path.join(OUT, 'house_bake.npy'), os.path.join(OUT, 'house_bake'), arg('--denoise', '3')], check=True)
os.remove(os.path.join(OUT, 'house_bake.npy'))
log('texture saved')

# ---------------------------------------------------------------- outside, trees: vertex colours
def bake_vertex(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); vl.objects.active = o
    ca = o.data.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); o.data.color_attributes.active_color = ca
    o.data.attributes.active_color = ca
    bpy.ops.object.bake(type='COMBINED')
    n = len(ca.data); c = np.empty(n * 4, dtype=np.float32); ca.data.foreach_get('color', c)
    c = c.reshape(n, 4); c[:, :3] = tonemap(c[:, :3]); c[:, 3] = 1.0
    ca.data.foreach_set('color', c.ravel())

scene.cycles.samples = VSAMPLES; bk.target = 'VERTEX_COLORS'
outside = flatten(outside_objs, 'outside')
log('outside joined', len(outside.data.polygons), 'faces')
bake_vertex(outside); log('outside baked')
instances = {}
keep = {}
for kind, objs in instanced.items():
    instances[kind] = []
    for o in objs:
        m = o.matrix_world; loc, rot, sc = m.decompose(); e = rot.to_euler()
        instances[kind].append({'at': [round(loc.x, 3), round(loc.z, 3), round(-loc.y, 3)], 'ry': round(e.z, 3), 'scale': round(sc.x, 3)})
    rep = objs[0]                      # bake one where it stands, reuse its colours for the rest
    bake_vertex(rep); keep[kind] = rep
    log(kind, 'baked')
for kind, objs in instanced.items():
    for o in objs[1:]: bpy.data.objects.remove(o)
    rep = keep[kind]; rep.parent = None; rep.matrix_world = __import__('mathutils').Matrix.Identity(4); rep.name = kind

# ---------------------------------------------------------------- materials for export
def baked_material(name, image=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes['Principled BSDF']; b.inputs['Roughness'].default_value = 1.0
    if image:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = image; nt.links.new(t.outputs[0], b.inputs['Base Color'])
    else:
        c = nt.nodes.new('ShaderNodeVertexColor'); c.layer_name = 'Col'; nt.links.new(c.outputs[0], b.inputs['Base Color'])
    return m

def one_material(o, m):
    o.data.materials.clear(); o.data.materials.append(m)
    for p in o.data.polygons: p.material_index = 0

final = bpy.data.images.load(os.path.join(OUT, 'house_bake.png'))
one_material(house, baked_material('house_baked', final))
vc = baked_material('vertex_baked')
for o in [outside] + list(keep.values()): one_material(o, vc)

bpy.ops.object.select_all(action='DESELECT')
for o in [house, outside] + list(keep.values()): o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'house.glb'), export_format='GLB', use_selection=True, export_apply=True,
                          export_colors=True, export_normals=True, export_image_format='WEBP', export_yup=True, export_lights=False, export_cameras=False)
json.dump({'instances': instances, 'smoke': [[round(p[0], 3), round(p[2], 3), round(-p[1], 3)] for p in smoke_at]}, open(os.path.join(OUT, 'scene.json'), 'w'))
log('exported', os.path.getsize(os.path.join(OUT, 'house.glb')) // 1024, 'KB')

# ---------------------------------------------------------------- sky panorama
for o in list(scene.objects):
    if o.type == 'MESH': o.hide_render = True
cam = scene.camera; cam.data.type = 'PANO'
try: cam.data.panorama_type = 'EQUIRECTANGULAR'
except Exception: cam.data.cycles.panorama_type = 'EQUIRECTANGULAR'
cam.rotation_euler = (math.pi / 2, 0, 0); cam.location = (0, 0, 2)
scene.use_nodes = False
scene.cycles.samples = 16; scene.render.resolution_x = 2048; scene.render.resolution_y = 1024
scene.view_settings.view_transform = 'Filmic'; scene.view_settings.look = 'Medium High Contrast'; scene.view_settings.exposure = EXPOSURE
scene.render.image_settings.file_format = 'JPEG'; scene.render.image_settings.quality = 90
scene.render.filepath = os.path.join(OUT, 'sky.jpg'); bpy.ops.render.render(write_still=True)
log('sky done')
