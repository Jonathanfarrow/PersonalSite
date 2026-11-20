"""A countryside house cut open like a doll's house: games room, office, loft studio.

Run:  blender -b --python tools/blender/build_cutaway.py -- --render out.png [--samples N] [--size WxH]

Scene code uses the website's coordinates (x right, y up, z toward the viewer, metres);
the kit converts to Blender's z-up.
"""
import bpy, bmesh, math, random, sys, os, addon_utils
from mathutils import Vector, Euler

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
random.seed(11)
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable('cycles')
scene = bpy.context.scene
col = bpy.context.collection

# ============================================================== materials
def srgb(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

def new_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs[0], nt.nodes['Material Output'].inputs[0])
    return m, nt, b

_flat = {}
def flat(color, rough=0.7, metal=0.0, emit=None, glow=0.0):
    key = (color, rough, metal, emit, glow)
    if key not in _flat:
        m, nt, b = new_mat('c%06x' % color)
        b.inputs['Base Color'].default_value = (*srgb(color), 1)
        b.inputs['Roughness'].default_value = rough
        b.inputs['Metallic'].default_value = metal
        if emit is not None:
            b.inputs['Emission Color'].default_value = (*srgb(emit), 1)
            b.inputs['Emission Strength'].default_value = glow
        _flat[key] = m
    return _flat[key]

def tiles(name, c1, c2, mortar, w, h, wall=True, bump=0.5, rough=0.85, gap=0.008, scale=1.0, stagger=0.5):
    """Brick-pattern material: bricks, slates, floorboards, flagstones."""
    m, nt, b = new_mat(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    if wall:   # run along a vertical wall whichever way it faces: (x + y, z)
        sep = nt.nodes.new('ShaderNodeSeparateXYZ'); add = nt.nodes.new('ShaderNodeMath'); comb = nt.nodes.new('ShaderNodeCombineXYZ')
        nt.links.new(tc.outputs['Object'], sep.inputs[0]); nt.links.new(sep.outputs['X'], add.inputs[0]); nt.links.new(sep.outputs['Y'], add.inputs[1])
        nt.links.new(add.outputs[0], comb.inputs['X']); nt.links.new(sep.outputs['Z'], comb.inputs['Y'])
        vec = comb.outputs[0]
    else:
        vec = tc.outputs['Object']
    tex = nt.nodes.new('ShaderNodeTexBrick'); tex.offset = stagger
    for k, v in (('Scale', scale), ('Brick Width', w), ('Row Height', h), ('Mortar Size', gap), ('Mortar Smooth', 0.2), ('Bias', 0.0)):
        tex.inputs[k].default_value = v
    tex.inputs['Color1'].default_value = (*srgb(c1), 1); tex.inputs['Color2'].default_value = (*srgb(c2), 1); tex.inputs['Mortar'].default_value = (*srgb(mortar), 1)
    nt.links.new(vec, tex.inputs['Vector'])
    noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 1.2; noise.inputs['Detail'].default_value = 6
    nt.links.new(vec, noise.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.3; ramp.color_ramp.elements[0].color = (0.62, 0.58, 0.58, 1)
    ramp.color_ramp.elements[1].position = 0.7; ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(noise.outputs['Fac'], ramp.inputs[0])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = 1.0
    nt.links.new(tex.outputs['Color'], mix.inputs[6]); nt.links.new(ramp.outputs[0], mix.inputs[7]); nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    inv = nt.nodes.new('ShaderNodeInvert'); bmp = nt.nodes.new('ShaderNodeBump'); bmp.inputs['Strength'].default_value = bump; bmp.inputs['Distance'].default_value = 0.02
    nt.links.new(tex.outputs['Fac'], inv.inputs['Color']); nt.links.new(inv.outputs[0], bmp.inputs['Height']); nt.links.new(bmp.outputs[0], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = rough
    return m

def mottled(name, c1, c2, scale=20, bump=0.3, rough=0.9, detail=8):
    m, nt, b = new_mat(name)
    tc = nt.nodes.new('ShaderNodeTexCoord'); noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale; noise.inputs['Detail'].default_value = detail
    nt.links.new(tc.outputs['Object'], noise.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.35; ramp.color_ramp.elements[0].color = (*srgb(c1), 1)
    ramp.color_ramp.elements[1].position = 0.65; ramp.color_ramp.elements[1].color = (*srgb(c2), 1)
    nt.links.new(noise.outputs['Fac'], ramp.inputs[0]); nt.links.new(ramp.outputs[0], b.inputs['Base Color'])
    bmp = nt.nodes.new('ShaderNodeBump'); bmp.inputs['Strength'].default_value = bump; bmp.inputs['Distance'].default_value = 0.02
    nt.links.new(noise.outputs['Fac'], bmp.inputs['Height']); nt.links.new(bmp.outputs[0], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = rough
    return m

def smoke_mat():
    m = bpy.data.materials.new('smoke'); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); vol = nt.nodes.new('ShaderNodeVolumePrincipled')
    vol.inputs['Color'].default_value = (0.9, 0.86, 0.82, 1); vol.inputs['Density'].default_value = 7.0
    nt.links.new(vol.outputs[0], out.inputs['Volume'])
    return m

MAT = {
    'brick': tiles('brick', 0xa9553a, 0x8a4230, 0xb0a089, 0.225, 0.075, scale=1.3),
    'render': mottled('render', 0xe8dfc9, 0xf2ead8, scale=6, bump=0.08),
    'slate': tiles('slate', 0x4a5262, 0x3a414e, 0x20232b, 0.3, 0.2, wall=False, bump=1.0, rough=0.55),
    'boards_dark': tiles('boards_dark', 0x7a5238, 0x5e3d2a, 0x2e1d14, 1.6, 0.14, wall=False, bump=0.25, rough=0.5, gap=0.004, stagger=0.37),
    'boards_oak': tiles('boards_oak', 0xc79b6b, 0xa67c50, 0x5a4028, 1.6, 0.14, wall=False, bump=0.25, rough=0.5, gap=0.004, stagger=0.37),
    'boards_walnut': tiles('boards_walnut', 0x8a6444, 0x6b4a34, 0x33221a, 1.6, 0.14, wall=False, bump=0.25, rough=0.5, gap=0.004, stagger=0.37),
    'stone': mottled('stone', 0xcfc6b3, 0xddd5c4, scale=14, bump=0.15),
    'grass': mottled('grass', 0x3f5f33, 0x5a7840, scale=3.5, bump=0.3, rough=0.95),
    'field': mottled('field', 0x526c3c, 0x86904e, scale=0.5, bump=0.05, rough=0.95),
    'leaf': mottled('leaf', 0x244d2a, 0x3f7a3c, scale=25, bump=0.6, rough=0.85),
    'leaf2': mottled('leaf2', 0x3d6b2c, 0x6a9440, scale=25, bump=0.5, rough=0.8),
    'hedge': mottled('hedge', 0x1f4526, 0x356b34, scale=40, bump=0.8, rough=0.9),
    'bark': mottled('bark', 0x3a2a20, 0x57402f, scale=30, bump=0.8),
    'soil': mottled('soil', 0x33261e, 0x4a382c, scale=60, bump=0.6),
    'flag': tiles('flag', 0x8f8a80, 0xa39d92, 0x55524c, 0.9, 0.6, wall=False, bump=0.4, gap=0.015),
    'smoke': smoke_mat(),
    'church': mottled('church', 0xa89a82, 0xc9bca4, scale=1.5, bump=0.3, rough=0.9),
    'yew': mottled('yew', 0x16301c, 0x24482a, scale=20, bump=0.5, rough=0.9),
}
CUT = 0xeee4d2      # the sliced edge of walls and floors
WHITE = 0xf3efe6
DARK = 0x1b1d22

def M(c, **k):
    if isinstance(c, str): return MAT[c]
    return flat(c, **k)

# ============================================================== kit (website coordinates)
def T(p): return (p[0], -p[2], p[1])

class Node:
    def __init__(self, obj): self.obj = obj

def _link(o, parent):
    col.objects.link(o)
    if parent: o.parent = parent.obj
    return o

def group(parent=None, at=(0, 0, 0), ry=0.0):
    e = bpy.data.objects.new('g', None); e.location = T(at); e.rotation_euler = (0, 0, ry)
    return Node(_link(e, parent))

def _mesh(name, bm, material, smooth=True, angle=40):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    if material: me.materials.append(material)
    if smooth:
        for p in me.polygons: p.use_smooth = True
        me.use_auto_smooth = True; me.auto_smooth_angle = math.radians(angle)
    return bpy.data.objects.new(name, me)

def box(w, h, d, color, at=(0, 0, 0), r=None, rx=0.0, ry=0.0, rz=0.0, parent=None, emit=None, glow=1.0, rough=0.7, metal=0.0, centre=False):
    """Box whose bottom-centre sits at `at` (or its centre, with centre=True). r rounds the edges."""
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts: v.co.x *= w; v.co.y *= d; v.co.z *= h
    o = _mesh('box', bm, M(color, rough=rough, metal=metal, emit=emit, glow=glow) if not isinstance(color, str) else MAT[color])
    o.location = T((at[0], at[1] + (0 if centre else h / 2), at[2])); o.rotation_euler = (rx, -rz, ry)
    bevel = r if r is not None else min(0.012, min(w, h, d) * 0.25)
    if bevel > 0.0015:
        mod = o.modifiers.new('bevel', 'BEVEL'); mod.width = min(bevel, min(w, h, d) * 0.49); mod.segments = 3; mod.limit_method = 'ANGLE'
    return _link(o, parent)

def cyl(rt, rb, h, color, at=(0, 0, 0), seg=24, rx=0.0, ry=0.0, rz=0.0, parent=None, emit=None, glow=1.0, rough=0.7, metal=0.0, centre=False):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=rb, radius2=rt, depth=h)
    o = _mesh('cyl', bm, M(color, rough=rough, metal=metal, emit=emit, glow=glow) if not isinstance(color, str) else MAT[color], angle=50)
    o.location = T((at[0], at[1] + (0 if centre else h / 2), at[2])); o.rotation_euler = (rx, -rz, ry)
    return _link(o, parent)

def ball(r, color, at=(0, 0, 0), scale=(1, 1, 1), parent=None, emit=None, glow=1.0, rough=0.7, metal=0.0, sub=3):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    o = _mesh('ball', bm, M(color, rough=rough, metal=metal, emit=emit, glow=glow) if not isinstance(color, str) else MAT[color], angle=180)
    o.location = T(at); o.scale = (scale[0], scale[2], scale[1])
    return _link(o, parent)

def light(kind, energy, color, at, parent=None, size=0.15, spot=None, aim=None):
    l = bpy.data.lights.new('l', kind); l.energy = energy; l.color = color
    if kind == 'AREA': l.size = size
    else: l.shadow_soft_size = size
    if spot: l.spot_size = spot; l.spot_blend = 0.6
    o = bpy.data.objects.new('l', l); o.location = T(at)
    if aim: o.rotation_euler = (Vector(T(aim)) - Vector(T(at))).to_track_quat('-Z', 'Y').to_euler()
    return _link(o, parent)

def prism(pts, depth, color, at=(0, 0, 0), parent=None):
    """Extrude an outline drawn in the x-y plane (website coords) back along -z by depth."""
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new(T((x, y, 0))) for x, y in pts])
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, vec=Vector((0, depth, 0)), verts=[e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _mesh('prism', bm, M(color), smooth=False); o.location = T(at)
    return _link(o, parent)

def leafy(radius, at, mat='leaf', leaf=0.16, count=260, scale=(1, 1, 1), parent=None, core=True):
    """A clump of foliage: small tilted leaves scattered over a lumpy volume."""
    bm = bmesh.new()
    for _ in range(count):
        u = random.uniform(-1, 1); a = random.uniform(0, math.tau); rr = math.sqrt(1 - u * u); d = radius * random.uniform(0.72, 1.05)
        p = Vector((math.cos(a) * rr * d * scale[0], math.sin(a) * rr * d * scale[2], u * d * scale[1]))
        n = p.normalized(); t = n.cross(Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1)))).normalized(); b2 = n.cross(t) + n * random.uniform(-0.5, 0.5)
        s = leaf * random.uniform(0.7, 1.3)
        bm.faces.new([bm.verts.new(p + t * s * dx + b2 * s * dy) for dx, dy in ((0, -0.6), (0.5, 0), (0, 0.6), (-0.5, 0))])
    o = _mesh('leafy', bm, MAT[mat], smooth=False); o.location = T(at); _link(o, parent)
    if core: ball(radius * 0.78, mat, at=at, scale=scale, parent=parent, sub=2)
    return o

# Blender-built props (tools/blender/build_props.py)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'src/assets/models/props.glb'))
LIB = {o.name: o for o in bpy.data.objects if o.type == 'MESH' and o.name in ('armchair', 'beanbag', 'cat', 'chimney_pot', 'plant', 'shrub', 'sofa', 'street_lamp', 'telecaster', 'tree')}
for o in LIB.values(): o.hide_render = True; o.hide_viewport = True

def prop(name, at=(0, 0, 0), ry=0.0, scale=1.0, colors=None, parent=None, rx=0.0):
    o = LIB[name].copy(); o.data = LIB[name].data.copy(); o.hide_render = False; o.hide_viewport = False
    for i, m in enumerate(o.data.materials):
        if colors and m.name.split('.')[0] in colors:
            c = m.copy(); c.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*srgb(colors[m.name.split('.')[0]]), 1)
            o.data.materials[i] = c
    o.location = T(at); o.rotation_euler = (rx, 0, ry); o.scale = (scale,) * 3
    return _link(o, parent)

# ============================================================== house shell
W, D, FLOOR, SLAB, WALL, BASE = 8.0, 5.0, 3.2, 0.25, 0.25, 0.3
Y0 = [BASE, BASE + FLOOR, BASE + 2 * FLOOR]       # floor levels: games, office, studio
KNEE = 1.0                                         # loft side-wall height
PITCH = math.radians(36)
APEX = KNEE + math.tan(PITCH) * (W / 2 + WALL)     # loft ceiling height at the ridge
ZB = -(D / 2 + WALL)                               # outside face of the back wall

def roof_h(x): return KNEE + math.tan(PITCH) * (W / 2 + WALL - abs(x))   # loft ceiling height at x

def shell():
    g = group()
    box(W + 1.1, BASE, D + 1.1, 'stone', at=(0, 0, 0), r=0.03, parent=g)
    for i, wall_mat in enumerate(('brick', 'render')):
        y = Y0[i]
        box(W + 2 * WALL, FLOOR, WALL, wall_mat, at=(0, y, -D / 2 - WALL / 2), r=0, parent=g)
        for s in (-1, 1): box(WALL, FLOOR, D + WALL, wall_mat, at=(s * (W / 2 + WALL / 2), y, -WALL / 2), r=0, parent=g)
        for s in (-1, 1): box(WALL, FLOOR, 0.04, CUT, at=(s * (W / 2 + WALL / 2), y, D / 2 + 0.02), r=0, parent=g)
    box(W + 2 * WALL + 0.06, 0.14, D + WALL - 0.04, 'stone', at=(0, Y0[1] - 0.07, -WALL / 2 - 0.05), r=0.015, parent=g)     # string course
    # floors / ceilings
    for i in (1, 2):
        box(W, SLAB, D, 0x4a3a30, at=(0, Y0[i] - SLAB, 0), r=0, parent=g)
        box(W, SLAB, 0.04, CUT, at=(0, Y0[i] - SLAB, D / 2 + 0.02), r=0, parent=g)
    # loft: knee walls, gable end wall, roof
    y2 = Y0[2]
    for s in (-1, 1):
        box(WALL, KNEE, D + WALL, 'render', at=(s * (W / 2 + WALL / 2), y2, -WALL / 2), r=0, parent=g)
        box(WALL, KNEE, 0.04, CUT, at=(s * (W / 2 + WALL / 2), y2, D / 2 + 0.02), r=0, parent=g)
    half = W / 2 + WALL
    prism([(-half, 0), (half, 0), (half, KNEE), (0, APEX), (-half, KNEE)], WALL, 'render', at=(0, y2, -D / 2), parent=g)
    over = 0.45
    length = (half + over) / math.cos(PITCH)
    for s in (-1, 1):
        mx = s * (half - over) / 2 + s * 0  # midpoint between eaves (half + over) and ridge (0)
        mx = s * (half + over) / 2
        my = y2 + KNEE + math.tan(PITCH) * (half - (half + over) / 2)
        rz = -s * PITCH
        n = Vector((s * math.sin(PITCH), math.cos(PITCH)))            # outward normal of the slope
        box(length, 0.2, D + WALL + 0.5, 'slate', at=(mx + n.x * 0.1, my + n.y * 0.1, -WALL / 2 - 0.25 + 0.0), rz=rz, r=0.01, parent=g, centre=True)
        box(length - 0.3, 0.02, D, 0xf1ece2, at=(mx - n.x * 0.01, my - n.y * 0.01, 0), rz=rz, r=0, parent=g, centre=True)            # ceiling lining
        box(length, 0.2, 0.04, CUT, at=(mx + n.x * 0.1, my + n.y * 0.1, D / 2 + 0.02), rz=rz, r=0, parent=g, centre=True)             # cut edge
        for k in range(5):                                                                                                            # rafters
            box(length - 0.5, 0.13, 0.09, 0x5e3d2a, at=(mx - n.x * 0.08, my - n.y * 0.08, -2.1 + k * 1.05), rz=rz, parent=g, centre=True)
        box(length + 0.1, 0.18, 0.05, WHITE, at=(mx + n.x * 0.1, my + n.y * 0.1, -D / 2 - WALL - 0.5), rz=rz, parent=g, centre=True)   # bargeboard at the back
    box(0.14, 0.2, D, 0x5e3d2a, at=(0, y2 + APEX - 0.32, 0), parent=g)                                                               # ridge beam
    for k in range(13): cyl(0.11, 0.11, 0.42, 0xb5633f, at=(0, y2 + APEX + 0.27, 2.3 - k * 0.44), rx=math.pi / 2, seg=12, parent=g, centre=True)
    # rooflight in the left slope (seen from outside) and one in the right slope (seen from inside)
    n = Vector((-math.sin(PITCH), math.cos(PITCH)))
    vx = -2.3; vy = y2 + roof_h(vx)
    box(1.0, 0.1, 1.3, 0x3a3f4a, at=(vx + n.x * 0.24, vy + n.y * 0.24, -0.6), rz=PITCH, parent=g, centre=True, metal=0.3)
    box(0.82, 0.03, 1.12, 0xffd9a0, at=(vx + n.x * 0.29, vy + n.y * 0.29, -0.6), rz=PITCH, r=0, parent=g, centre=True, emit=0xffc47a, glow=3.0)
    n = Vector((math.sin(PITCH), math.cos(PITCH)))
    vx = 2.2; vy = y2 + roof_h(vx)
    box(1.0, 0.06, 1.3, WHITE, at=(vx - n.x * 0.03, vy - n.y * 0.03, -0.9), rz=-PITCH, parent=g, centre=True)
    box(0.84, 0.03, 1.14, 0x2a3a6a, at=(vx - n.x * 0.05, vy - n.y * 0.05, -0.9), rz=-PITCH, r=0, parent=g, centre=True, emit=0x4a5fa8, glow=1.2)

    # chimney: an outside stack on the right-hand wall, up past the roof, with pots and smoke
    cx = W / 2 + WALL + 0.3
    top = y2 + 3.9
    box(0.65, top - BASE, 1.5, 'brick', at=(cx, BASE, 0.5), r=0, parent=g)
    box(0.78, 0.12, 1.63, 'stone', at=(cx, top - 0.5, 0.5), r=0.015, parent=g)
    box(0.72, 0.38, 1.57, 'brick', at=(cx, top - 0.38, 0.5), r=0, parent=g)
    box(0.84, 0.1, 1.7, 'stone', at=(cx, top, 0.5), r=0.02, parent=g)
    for pz in (0.1, 0.9): prop('chimney_pot', at=(cx, top + 0.1, pz), parent=g)
    for k in range(16):                               # smoke curling up and drifting off on the breeze
        t = k / 15
        ball(0.18 + t * 0.6, 'smoke', at=(cx + 0.1 + t * t * 3.4 + random.uniform(-0.12, 0.12), top + 0.7 + t * 2.3 + math.sin(t * 5) * 0.12, 0.9 + random.uniform(-0.15, 0.15) - t * 0.4), scale=(1.25, 0.85, 1.0), parent=g, sub=2)

    # the left-hand outside wall, which the camera does see: two windows and a climber
    for i, wy in enumerate((Y0[0] + 1.6, Y0[1] + 1.55)):
        wg = group(g, at=(-W / 2 - WALL, wy, -0.4), ry=-math.pi / 2)
        box(1.3, 1.75, 0.1, WHITE, at=(0, -0.875, 0.0), parent=wg)
        box(1.1, 1.55, 0.02, 0xffd9a0, at=(0, -0.775, 0.045), r=0, parent=wg, emit=0xffc47a, glow=2.4)
        box(1.1, 0.06, 0.03, WHITE, at=(0, -0.03, 0.07), parent=wg); box(0.04, 1.55, 0.03, WHITE, at=(0, -0.775, 0.07), parent=wg)
        for s in (-1, 1): box(0.22, 1.5, 0.02, 0xc9a384, at=(s * 0.42, -0.75, 0.06), r=0, parent=wg)
        box(1.5, 0.07, 0.2, 'stone', at=(0, -0.96, 0.06), parent=wg)
    for k in range(34):
        t = k / 33
        leafy(random.uniform(0.22, 0.4), (-W / 2 - WALL - 0.12, BASE + 0.3 + t * 5.6 + random.uniform(-0.2, 0.2), 1.6 + math.sin(t * 5) * 0.5 + random.uniform(-0.25, 0.25)), mat=random.choice(['leaf', 'leaf2']), leaf=0.09, count=90, parent=g, core=False)
    return g

def finishes(g, i, wall, dado, trim, floor_mat, fireplace=False, mantel=0x6f482c):
    """Plaster, skirting, rails and floorboards for one of the two full-height rooms."""
    y = Y0[i]; inner = FLOOR - SLAB
    box(W, inner, 0.03, wall, at=(0, y, -D / 2 + 0.015), r=0, parent=g, rough=0.9)
    for s in (-1, 1): box(0.03, inner, D, wall, at=(s * (W / 2 - 0.015), y, 0), r=0, parent=g, rough=0.9)
    if dado: box(W, 0.95, 0.036, dado, at=(0, y, -D / 2 + 0.018), r=0, parent=g, rough=0.9)
    box(W, 0.05, 0.05, trim, at=(0, y + 0.95, -D / 2 + 0.03), parent=g)
    box(W, 0.04, D, floor_mat, at=(0, y, 0), r=0, parent=g)
    box(W, 0.14, 0.04, trim, at=(0, y + 0.04, -D / 2 + 0.05), parent=g)
    for s in (-1, 1): box(0.04, 0.14, D, trim, at=(s * (W / 2 - 0.05), y + 0.04, 0), parent=g)
    box(W, 0.05, 0.05, trim, at=(0, y + inner - 0.5, -D / 2 + 0.045), parent=g)
    box(W, 0.1, 0.1, trim, at=(0, y + inner - 0.1, -D / 2 + 0.05), parent=g)
    box(W, 0.02, D, 0xf1ece2, at=(0, y + inner - 0.02, 0), r=0, parent=g)
    # chimney breast
    box(0.34, inner, 1.7, wall, at=(W / 2 - 0.2, y, 0.5), r=0.01, parent=g, rough=0.9)
    if fireplace:
        f = group(g, at=(W / 2 - 0.37, y + 0.04, 0.5), ry=-math.pi / 2)
        box(1.25, 1.15, 0.07, trim, at=(0, 0, 0), r=0.02, parent=f)
        box(1.5, 0.07, 0.26, mantel, at=(0, 1.15, 0.07), r=0.02, parent=f)
        box(0.8, 0.84, 0.08, 0x17171b, at=(0, 0, 0.01), parent=f, metal=0.5, rough=0.5)
        box(0.56, 0.6, 0.1, 0x050505, at=(0, 0.05, 0.02), r=0, parent=f)
        box(1.35, 0.04, 0.55, 0x3a3a40, at=(0, 0, 0.28), parent=f)
        for k in range(3): cyl(0.045, 0.045, 0.4, 0x2a1810, at=(-0.12 + k * 0.12, 0.13 + (k % 2) * 0.06, 0.08), rz=math.pi / 2, seg=10, parent=f, centre=True)
        for k in range(5): ball(0.07 + (k % 2) * 0.03, 0xff9a3c, at=(-0.16 + k * 0.08, 0.26 + (k % 3) * 0.05, 0.08), scale=(0.8, 1.6, 0.5), parent=f, emit=0xff7a20, glow=40)
        light('POINT', 60, (1.0, 0.5, 0.2), (0, 0.4, 0.5), parent=f, size=0.12)
        cyl(0.05, 0.07, 0.2, 0xc9694f, at=(-0.52, 1.22, 0.07), parent=f)
        box(0.3, 0.36, 0.03, DARK, at=(0.1, 1.22, 0.03), rx=-0.08, parent=f); box(0.24, 0.3, 0.012, 0xe9dfcf, at=(0.1, 1.25, 0.045), rx=-0.08, r=0, parent=f)
        cyl(0.03, 0.03, 0.16, WHITE, at=(0.52, 1.22, 0.07), seg=12, parent=f)
    # pendant lamp
    p = group(g, at=(-1.3, y + inner - 0.02, 0.9))
    cyl(0.14, 0.14, 0.03, WHITE, at=(0, -0.03, 0), parent=p); cyl(0.006, 0.006, 0.42, DARK, at=(0, -0.45, 0), seg=6, parent=p)
    cyl(0.13, 0.27, 0.26, 0xf2d9b0, at=(0, -0.7, 0), parent=p, emit=0xffc98a, glow=5)
    light('POINT', 360, (1.0, 0.78, 0.52), (0, -0.78, 0), parent=p, size=0.2)

def screen(w, h, at, parent, color=0x10171c, lines=None, ry=0.0, rx=0.0, glow=2.2):
    """A glowing display: a dark panel with bright bars of 'content'."""
    s = group(parent, at=at, ry=ry); s.obj.rotation_euler.x = rx
    box(w, h, 0.006, color, at=(0, -h / 2, 0), r=0, parent=s, emit=color, glow=glow * 0.6)
    for (lx, ly, lw, lh, c) in (lines or []):
        box(lw, lh, 0.004, c, at=(lx, ly - lh / 2, 0.004), r=0, parent=s, emit=c, glow=glow * 2.2)
    return s

def code_lines(w, h, rows=11):
    out = []; ind = 0
    for r in range(rows):
        ind = max(0, min(3, ind + random.choice((-1, 0, 1)))); x = -w / 2 + 0.08 + ind * 0.05
        for k in range(random.randint(1, 4)):
            lw = random.uniform(0.05, 0.16)
            if x + lw > w / 2 - 0.04: break
            out.append((x + lw / 2, h / 2 - 0.06 - r * (h - 0.1) / rows, lw, 0.016, random.choice((0x5ef2d6, 0xffd166, 0xf6a6c1, 0x8ecae6, 0xcdd6e0))))
            x += lw + 0.02
    return out

# ============================================================== rooms
def games(g):
    y = Y0[0] + 0.04
    r = group(g, at=(0, y, 0))
    finishes(g, 0, 0x34466a, 0x26344f, 0xe9dfcf, 'boards_walnut', fireplace=True, mantel=0x4a3324)
    # arcade cabinets
    looks = ((0x2b2a6b, 0xff5db1, 0x5ef2d6), (0x8a2a4a, 0xffd166, 0xff9f6b), (0x1f5f5a, 0x5ef2d6, 0xffd166))
    for i, (body, side, glowc) in enumerate(looks):
        c = group(r, at=(-3.3 + i * 1.02, 0, -1.95))
        box(0.86, 1.95, 0.8, body, at=(0, 0, 0), r=0.035, parent=c, rough=0.5)
        box(0.9, 0.12, 0.84, 0x0d0c18, at=(0, 0, 0), parent=c)
        for sx in (-0.435, 0.435): box(0.012, 1.5, 0.06, side, at=(sx, 0.3, 0.2), r=0, parent=c, emit=side, glow=4)
        box(0.86, 0.3, 0.12, 0x0d0c18, at=(0, 1.66, 0.4), r=0.02, parent=c)
        box(0.78, 0.2, 0.01, side, at=(0, 1.71, 0.465), r=0, parent=c, emit=side, glow=3)
        box(0.8, 0.66, 0.06, 0x0d0c18, at=(0, 1.0, 0.39), rx=-0.14, parent=c)
        pix = []
        for py in range(6):
            for px in range(3):
                if random.random() < 0.6:
                    for sx in (-1, 1): pix.append((sx * (0.03 + px * 0.05), 0.2 - py * 0.05, 0.05, 0.05, glowc))
        pix += [(-0.2 + k * 0.13, -0.16, 0.06, 0.05, side) for k in range(4)]
        screen(0.66, 0.54, (0, 1.33, 0.44), c, color=0x080714, lines=pix, rx=-0.14, glow=2.5)
        box(0.86, 0.1, 0.42, 0x0d0c18, at=(0, 0.88, 0.5), r=0.02, rx=0.18, parent=c)
        cyl(0.012, 0.012, 0.11, 0xcfd3e0, at=(-0.2, 0.98, 0.52), seg=8, parent=c, metal=0.8, rough=0.3); ball(0.04, 0xff3b5c, at=(-0.2, 1.11, 0.52), parent=c, rough=0.3)
        for k, bc in enumerate((0x5ef2d6, 0xffd166, 0xff5db1)): cyl(0.03, 0.03, 0.02, bc, at=(0.05 + k * 0.1, 0.975, 0.55 - (k % 2) * 0.05), seg=14, parent=c, emit=bc, glow=2)
        light('POINT', 12, tuple(srgb(glowc)), (0, 1.4, 0.9), parent=c, size=0.2)
    # TV wall and unit
    box(1.9, 1.08, 0.06, 0x0d0c18, at=(2.55, 1.15, -2.42), r=0.02, parent=r)
    tv = [(0, -0.2 + k * 0.0, 1.8, 0.3, 0x2b1b6b) for k in range(1)] + [(0, -0.05, 1.8, 0.3, 0xff5db1), (0, -0.36, 1.8, 0.28, 0x3a1f7a), (0.5, 0.3, 0.16, 0.16, 0xfff1d6)]
    screen(1.8, 0.98, (2.55, 1.69, -2.385), r, color=0x3a2a8a, lines=[(0, 0.1, 1.8, 0.3, 0xff5db1), (0, -0.2, 1.8, 0.3, 0xffb36b), (0, -0.35, 1.8, 0.26, 0x2a1f6a), (0.5, 0.36, 0.16, 0.16, 0xfff1d6)], glow=1.4)
    u = group(r, at=(2.55, 0, -2.15))
    box(2.2, 0.42, 0.5, 0x5a3826, at=(0, 0.1, 0), r=0.02, parent=u)
    for sx in (-1.0, 1.0): cyl(0.02, 0.03, 0.1, DARK, at=(sx, 0, 0.15), seg=8, parent=u)
    box(0.5, 0.07, 0.34, 0xe9dfcf, at=(-0.55, 0.52, 0), r=0.02, parent=u)
    for k, bc in enumerate((0xff5db1, 0x5ef2d6, 0xffd166, 0xff9f6b)): box(0.34, 0.055, 0.28, bc, at=(0.15, 0.52 + k * 0.056, 0), ry=random.uniform(-0.15, 0.15), parent=u)
    ball(0.11, 0xffd166, at=(0.78, 0.63, 0.02), parent=u, sub=1)
    # lounge: rug, sofa, beanbag, table
    for (rw, rd, c, h) in ((3.0, 2.3, 0x7a2f2a, 0.012), (2.6, 1.9, 0xe2c08a, 0.016), (2.3, 1.6, 0x2f4a6a, 0.02)):
        box(rw, h, rd, c, at=(1.6, 0, 0.4), r=0.004, parent=r, rough=0.95)
    prop('sofa', at=(1.6, 0, 1.45), ry=math.pi, parent=r, colors={'fabric': 0xc98f3a})
    prop('beanbag', at=(3.0, 0, -0.75), ry=0.6, parent=r, colors={'fabric': 0xb5543a})
    box(1.1, 0.05, 0.6, 0x6f482c, at=(1.6, 0.31, 0.15), r=0.02, parent=r)
    for (lx, lz) in ((1.12, -0.08), (2.08, -0.08), (1.12, 0.38), (2.08, 0.38)): cyl(0.02, 0.025, 0.31, 0x3a2418, at=(lx, 0, lz), seg=10, parent=r)
    cyl(0.045, 0.04, 0.12, 0xc9694f, at=(2.0, 0.36, 0.3), parent=r)
    for (px, pz, pry, pc) in ((1.75, 0.2, 0.4, 0xe9dfcf), (1.35, 0.05, -0.7, 0x15141b)):
        pad = group(r, at=(px, 0.36, pz), ry=pry); box(0.26, 0.05, 0.13, pc, r=0.025, parent=pad)
        for sx in (-0.1, 0.1): box(0.07, 0.05, 0.14, pc, at=(sx, 0, 0.05), r=0.025, parent=pad)
    # shelf of collectibles and a framed pixel creature
    box(1.5, 0.04, 0.2, 0x6f482c, at=(0.55, 1.75, -2.38), parent=r)
    for k in range(6):
        c = random.choice((0xff5db1, 0x5ef2d6, 0xffd166, 0xff9f6b, 0xc4b5ff)); x = -0.05 + k * 0.24
        if k % 3 == 0: ball(0.07, c, at=(x, 1.86, -2.38), parent=r, sub=1)
        elif k % 3 == 1: box(0.09, 0.13, 0.07, c, at=(x, 1.79, -2.38), r=0.02, parent=r); ball(0.045, c, at=(x, 1.96, -2.38), parent=r)
        else: cyl(0.005, 0.06, 0.14, c, at=(x, 1.79, -2.38), seg=4, parent=r)
    box(0.5, 0.5, 0.03, 0x0d0c18, at=(0.55, 0.95, -2.43), parent=r)
    pix = [(sx * (0.025 + px * 0.045), 0.12 - py * 0.045, 0.045, 0.045, 0xffd166) for py in range(6) for px in range(3) for sx in (-1, 1) if random.random() < 0.6]
    screen(0.44, 0.44, (0.55, 1.2, -2.41), r, color=0x12102a, lines=pix, glow=0.8)
    # neon sign
    for k in range(11): box(0.09, 0.2, 0.02, 0xff5db1, at=(-2.5 + k * 0.14, 2.25, -2.44), r=0.008, parent=r, emit=0xff5db1, glow=6) if k != 6 else None
    light('POINT', 18, (1.0, 0.36, 0.69), (-1.8, 2.3, -2.0), parent=r, size=0.3)

def office(g):
    y = Y0[1] + 0.04
    r = group(g, at=(0, y, 0))
    finishes(g, 1, 0x6f8a72, 0xdcd2bc, 0xf1ece2, 'boards_oak', fireplace=True, mantel=0xf1ece2)
    for (rw, rd, c, h) in ((3.6, 2.2, 0xe2d5bf, 0.012), (3.2, 1.8, 0xc9694f, 0.016), (2.8, 1.4, 0xe2d5bf, 0.02)):
        box(rw, h, rd, c, at=(0.6, 0, 0.3), r=0.004, parent=r, rough=0.95)
    # desk with two monitors
    d = group(r, at=(-1.55, 0, -1.7))
    box(2.6, 0.06, 1.05, 0xd9b98c, at=(0, 0.74, 0), r=0.02, parent=d)
    for sx in (-1.15, 1.15):
        for sz in (-0.42, 0.42): box(0.05, 0.74, 0.05, DARK, at=(sx, 0, sz), rz=-sx * 0.06, parent=d)
    box(0.5, 0.56, 0.7, 0xe9dfcf, at=(0.85, 0.12, 0), r=0.02, parent=d)
    for k in range(3): box(0.18, 0.02, 0.02, DARK, at=(0.85, 0.22 + k * 0.17, 0.36), parent=d)
    for (mx, mry) in ((-0.5, 0.22), (0.48, -0.22)):
        m = group(d, at=(mx, 0.8, -0.28), ry=mry)
        cyl(0.13, 0.15, 0.02, 0x15171f, parent=m); box(0.05, 0.2, 0.04, 0x15171f, at=(0, 0.02, 0), parent=m)
        box(0.94, 0.58, 0.04, 0x15171f, at=(0, 0.17, 0.02), r=0.015, parent=m)
        screen(0.88, 0.52, (0, 0.46, 0.045), m, lines=code_lines(0.88, 0.52), glow=2.0)
    box(0.6, 0.025, 0.2, 0x2a2d3a, at=(-0.05, 0.8, 0.22), r=0.008, parent=d); box(0.08, 0.025, 0.12, 0xe9dfcf, at=(0.42, 0.8, 0.24), r=0.01, parent=d)
    cyl(0.055, 0.045, 0.11, 0xc9694f, at=(-0.75, 0.8, 0.2), parent=d); box(0.3, 0.02, 0.22, 0x25474d, at=(0.9, 0.8, 0.22), ry=0.2, parent=d)
    l = group(d, at=(-1.05, 0.8, -0.15))
    cyl(0.1, 0.11, 0.025, 0xc9694f, parent=l); box(0.025, 0.45, 0.025, 0xc9694f, at=(0.06, 0, 0), rz=-0.28, parent=l); box(0.025, 0.36, 0.025, 0xc9694f, at=(0.25, 0.36, 0), rz=-1.0, parent=l)
    cyl(0.05, 0.12, 0.14, 0xc9694f, at=(0.4, 0.42, 0), rz=0.5, parent=l); ball(0.04, 0xfff1d6, at=(0.42, 0.44, 0), parent=l, emit=0xffd9a0, glow=30)
    light('POINT', 22, (1.0, 0.8, 0.55), (0.42, 0.36, 0.05), parent=l, size=0.05)
    ch = group(r, at=(-1.5, 0, -0.5), ry=-0.2)
    cyl(0.32, 0.32, 0.03, 0x15171f, seg=5, parent=ch); cyl(0.03, 0.03, 0.4, 0x8d92a6, at=(0, 0.03, 0), seg=10, parent=ch, metal=0.8, rough=0.4)
    box(0.52, 0.09, 0.5, 0xc9694f, at=(0, 0.43, 0), r=0.04, parent=ch, rough=0.9); box(0.5, 0.62, 0.08, 0xc9694f, at=(0, 0.6, 0.23), r=0.04, parent=ch, rough=0.9)
    # frames, shelf
    for (fx, fy, fw, fh, c1, c2) in ((-3.0, 2.38, 0.56, 0.56, 0xd9805f, 0xffd166), (-2.3, 2.42, 0.4, 0.5, 0xe9dfcf, 0x25474d), (-2.3, 1.8, 0.4, 0.5, 0x1b2040, 0x5ef2d6)):
        box(fw + 0.08, fh + 0.08, 0.035, DARK, at=(fx, fy - fh - 0.08, -2.44), r=0.008, parent=r); box(fw, fh, 0.01, c1, at=(fx, fy - fh - 0.04, -2.42), r=0, parent=r)
        ball(fw * 0.22, c2, at=(fx + 0.04, fy - fh * 0.55, -2.415), scale=(1, 1, 0.05), parent=r)
    box(1.5, 0.04, 0.2, 0xd9b98c, at=(-1.0, 2.0, -2.38), r=0.01, parent=r); cyl(0.07, 0.055, 0.12, 0xe9dfcf, at=(-1.5, 2.04, -2.38), parent=r)
    leafy(0.13, (-1.5, 2.27, -2.38), leaf=0.05, count=60, parent=r)
    for k in range(5): box(0.05, 0.24 - (k % 2) * 0.04, 0.15, (0xc9694f, 0xffd166, 0x5ef2d6, 0xe9dfcf, 0x3b2a63)[k], at=(-0.9 + k * 0.06, 2.04, -2.38), parent=r)
    # window onto the garden
    wn = group(r, at=(0.95, 1.7, -2.45))
    box(1.7, 1.4, 0.06, WHITE, at=(0, -0.7, 0), parent=wn); box(1.56, 1.26, 0.01, 0x2a3a6a, at=(0, -0.63, 0.035), r=0, parent=wn, emit=0x55609a, glow=1.4)
    box(1.56, 0.4, 0.012, 0xe8ad88, at=(0, -0.63, 0.037), r=0, parent=wn, emit=0xe8ad88, glow=1.2)
    box(0.04, 1.26, 0.03, WHITE, at=(0, -0.63, 0.04), parent=wn); box(1.56, 0.04, 0.03, WHITE, at=(0, -0.02, 0.04), parent=wn); box(1.8, 0.05, 0.16, WHITE, at=(0, -0.75, 0.07), parent=wn)
    # bookshelf
    s = group(r, at=(2.9, 0, -2.2))
    box(1.7, 2.4, 0.03, 0x6f482c, at=(0, 0, -0.2), parent=s)
    for sx in (-0.85, 0.85): box(0.05, 2.4, 0.42, 0x8b5e3c, at=(sx, 0, 0), parent=s)
    cols = (0xc9694f, 0xffd166, 0x5ef2d6, 0xe9dfcf, 0x3b2a63, 0x25474d, 0xf25f8b, 0x8ecae6, 0x1b2040)
    for k in range(5):
        sy = k * 0.59; box(1.7, 0.05, 0.42, 0x8b5e3c, at=(0, sy, 0), parent=s)
        if k == 4: break
        x = -0.78; gap = random.uniform(0.2, 1.0)
        while x < 0.72:
            bw = random.uniform(0.04, 0.09); bh = random.uniform(0.32, 0.48)
            if gap < x + 0.78 < gap + 0.26: x += 0.28; continue
            lean = 0.12 if random.random() < 0.08 else 0
            box(bw, bh, 0.26, random.choice(cols), at=(x + bw / 2, sy + 0.05, 0.04), rz=lean, r=0.006, parent=s, rough=0.6); x += bw + 0.008
    fl = group(r, at=(3.5, 0, -1.2))
    cyl(0.17, 0.19, 0.03, DARK, parent=fl); cyl(0.015, 0.015, 1.6, DARK, at=(0, 0.03, 0), seg=8, parent=fl)
    cyl(0.16, 0.24, 0.3, 0xfff1d6, at=(0, 1.6, 0), parent=fl, emit=0xffd9a0, glow=6); light('POINT', 90, (1.0, 0.8, 0.55), (0, 1.55, 0), parent=fl, size=0.15)
    # reading chair by the fire, plant, electronics bench
    prop('armchair', at=(2.3, 0, 1.3), ry=1.05, parent=r, colors={'fabric': 0x3d7a78})
    cyl(0.22, 0.22, 0.03, 0x6f482c, at=(2.75, 0.48, 2.0), parent=r); cyl(0.02, 0.12, 0.48, 0x6f482c, at=(2.75, 0, 2.0), seg=12, parent=r); box(0.2, 0.03, 0.14, 0x7a2f2a, at=(2.75, 0.51, 2.0), ry=0.4, parent=r)
    prop('plant', at=(-3.4, 0, -1.8), ry=0.4, parent=r)
    b = group(r, at=(-2.7, 0, 1.25), ry=0.3)
    box(1.7, 0.06, 0.6, 0x8b5e3c, at=(0, 0.8, 0), r=0.015, parent=b)
    for sx in (-0.78, 0.78): box(0.05, 0.8, 0.52, DARK, at=(sx, 0, 0), parent=b)
    box(1.5, 0.04, 0.5, 0x8b5e3c, at=(0, 0.25, 0), parent=b); box(0.5, 0.3, 0.36, 0xd9d4c7, at=(0.5, 0.86, -0.08), r=0.025, parent=b)
    wave = [(-0.11 + k * 0.02, 0.0 + math.sin(k * 0.9) * 0.05 + 0.006, 0.018, 0.012, 0x7dffe3) for k in range(12)]
    screen(0.26, 0.2, (0.42, 1.02, 0.105), b, color=0x04140f, lines=wave, glow=3)
    box(0.36, 0.012, 0.24, 0x1f7a55, at=(-0.25, 0.86, 0.05), ry=0.2, parent=b)
    for (cx_, cz_, cw) in ((-0.3, 0.05, 0.08), (-0.18, 0.1, 0.05), (-0.33, -0.02, 0.04)): box(cw, 0.02, cw, 0x15171f, at=(cx_, 0.872, cz_), ry=0.2, parent=b)
    ball(0.012, 0xff3b3b, at=(-0.14, 0.885, 0.0), parent=b, emit=0xff3b3b, glow=30)
    cyl(0.06, 0.06, 0.07, 0xcfd3e0, at=(-0.6, 0.86, -0.15), parent=b, metal=0.9, rough=0.3)
    for k in range(4): box(0.14, 0.1, 0.2, (0xffd166, 0x5ef2d6, 0xc9694f, 0xe9dfcf)[k], at=(-0.55 + k * 0.36, 0.29, 0.05), r=0.012, parent=b)
    cyl(0.17, 0.17, 0.05, 0xc9694f, at=(-2.3, 0.55, 1.95), parent=r)
    for k in range(3): cyl(0.015, 0.015, 0.58, DARK, at=(-2.3 + math.cos(k * 2.09) * 0.12, 0, 1.95 + math.sin(k * 2.09) * 0.12), seg=6, parent=r)

def record(parent, radius, label, at):
    d = group(parent, at=at)
    cyl(radius, radius, 0.014, 0x0c0c0f, rx=math.pi / 2, seg=64, parent=d, centre=True, rough=0.25, metal=0.4)
    for k in range(3): cyl(radius * (0.9 - k * 0.17), radius * (0.9 - k * 0.17), 0.016, 0x18181c, rx=math.pi / 2, seg=64, parent=d, centre=True, rough=0.2 + k * 0.05, metal=0.5)
    cyl(radius * 0.36, radius * 0.36, 0.02, label, rx=math.pi / 2, seg=32, parent=d, centre=True)
    cyl(0.012, 0.012, 0.024, 0x0c0c0f, rx=math.pi / 2, seg=10, parent=d, centre=True)

def studio(g):
    y = Y0[2] + 0.04
    r = group(g, at=(0, y, 0))
    wall = 0x8a5446
    # plaster on the gable wall and knee walls, floorboards, skirting
    half = W / 2
    prism([(-half, 0), (half, 0), (half, KNEE - 0.04), (0.0, roof_h(0) - 0.14), (-half, KNEE - 0.04)], 0.03, wall, at=(0, y - 0.04, -D / 2 + 0.03), parent=g)
    for s in (-1, 1): box(0.03, KNEE - 0.04, D, wall, at=(s * (half - 0.015), y - 0.04, 0), r=0, parent=g)
    box(W, 0.04, D, 'boards_dark', at=(0, Y0[2], 0), r=0, parent=g)
    box(W, 0.14, 0.04, 0xe9dfcf, at=(0, y, -D / 2 + 0.06), parent=g)
    box(0.34, roof_h(half - 0.2) - 0.1, 1.7, wall, at=(half - 0.2, y - 0.04, 0.5), r=0.01, parent=g)
    # hanging lamps from the ridge beam
    for lz in (0.9, -0.8):
        cyl(0.006, 0.006, 0.9, DARK, at=(0, roof_h(0) - 1.25, lz), seg=6, parent=r)
        cyl(0.1, 0.22, 0.2, 0xd98b5f, at=(0, roof_h(0) - 1.45, lz), parent=r, emit=0xffb070, glow=4)
        light('POINT', 300, (1.0, 0.74, 0.48), (0, roof_h(0) - 1.55, lz), parent=r, size=0.18)
    # rug
    for (rad, c, h) in ((1.7, 0x7a2f2a, 0.012), (1.3, 0xb5543a, 0.016), (0.7, 0xe2c08a, 0.02)): cyl(rad, rad, h, c, at=(0.2, 0, 0.6), seg=64, parent=r, rough=0.95)
    # production desk under the left slope
    d = group(r, at=(-1.7, 0, -1.75))
    box(2.5, 0.07, 1.0, 0x3a2622, at=(0, 0.74, 0), r=0.02, parent=d)
    for sx in (-1.1, 1.1): box(0.07, 0.74, 0.9, 0x241816, at=(sx, 0, 0), parent=d)
    cyl(0.14, 0.16, 0.02, 0x111118, at=(0, 0.81, -0.28), parent=d); box(0.05, 0.2, 0.04, 0x111118, at=(0, 0.83, -0.28), parent=d)
    box(1.1, 0.66, 0.045, 0x111118, at=(0, 0.98, -0.26), r=0.015, parent=d)
    clips = []
    for row, c in enumerate((0xff7a59, 0xc77dff, 0x5ef2d6, 0xffd166, 0xf25f8b, 0x8ecae6)):
        x = -0.42
        while x < 0.44:
            lw = random.uniform(0.08, 0.26); lw = min(lw, 0.5 - x)
            clips.append((x + lw / 2, 0.24 - row * 0.085, lw - 0.012, 0.06, c)); x += lw + random.uniform(0.0, 0.08)
    screen(1.04, 0.6, (0, 1.31, -0.235), d, color=0x14131f, lines=clips, glow=1.8)
    mx = group(d, at=(0, 0.81, 0.18)); mx.obj.rotation_euler.x = 0.16
    box(1.25, 0.07, 0.5, 0x23212e, r=0.015, parent=mx)
    for k in range(12):
        x = -0.55 + k * 0.1
        box(0.012, 0.004, 0.22, 0x0c0b12, at=(x, 0.07, 0.1), r=0, parent=mx); box(0.04, 0.025, 0.05, 0xe9dfcf, at=(x, 0.07, 0.02 + ((k * 37) % 17) / 100), r=0.006, parent=mx)
        for j in range(2): cyl(0.016, 0.016, 0.025, (0xff7a59, 0xc77dff, 0x5ef2d6, 0xffd166)[(k + j) % 4], at=(x, 0.07, -0.1 - j * 0.07), seg=12, parent=mx)
    for (sx, sry) in ((-1.0, 0.3), (1.0, -0.3)):
        sp = group(d, at=(sx, 0.81, -0.2), ry=sry)
        box(0.34, 0.52, 0.3, 0x1c1a24, r=0.03, parent=sp)
        cyl(0.11, 0.11, 0.02, 0x3a3846, at=(0, 0.19, 0.155), rx=math.pi / 2, parent=sp, centre=True); cyl(0.045, 0.045, 0.03, 0xffb45e, at=(0, 0.19, 0.16), rx=math.pi / 2, parent=sp, centre=True)
        cyl(0.05, 0.05, 0.02, 0x3a3846, at=(0, 0.4, 0.155), rx=math.pi / 2, parent=sp, centre=True)
    ch = group(r, at=(-1.55, 0, -0.55), ry=0.25)
    cyl(0.3, 0.3, 0.03, 0x15141b, seg=5, parent=ch); cyl(0.03, 0.03, 0.42, 0x8d92a6, at=(0, 0.03, 0), seg=10, parent=ch, metal=0.8, rough=0.4)
    box(0.5, 0.09, 0.48, 0x3b3550, at=(0, 0.45, 0), r=0.04, parent=ch, rough=0.9); box(0.46, 0.55, 0.08, 0x3b3550, at=(0, 0.62, 0.22), r=0.04, parent=ch, rough=0.9)
    # the record wall, stacked up under the peak of the roof
    labels = (0x0b0b0d, 0xc7654f, 0xe2c08a, 0x3f6f73, 0xb5543a, 0xd9b36a)
    slots = ((0.0, 3.05), (-0.48, 2.3), (0.48, 2.3), (-0.95, 1.55), (0.0, 1.55), (0.95, 1.55))
    for k, (rx_, ry_) in enumerate(slots):
        if k == 0:
            box(0.72, 0.72, 0.03, 0x0b0b0d, at=(rx_ - 0.14, ry_ - 0.36, -2.43), r=0.004, parent=r)
            for j in range(4): box(0.012, 0.3 + j * 0.05, 0.004, 0xf1ece2, at=(rx_ - 0.34 + j * 0.1, ry_ - 0.25, -2.412), r=0, parent=r)
            record(r, 0.34, labels[0], (rx_ + 0.18, ry_, -2.39))
        else:
            record(r, 0.3, labels[k], (rx_, ry_, -2.42))
    # record cabinet and turntable
    cb = group(r, at=(0.9, 0, -2.15))
    box(2.7, 0.52, 0.5, 0x5a3826, at=(0, 0.1, 0), r=0.02, parent=cb)
    for sx in (-1.2, 1.2): cyl(0.02, 0.03, 0.1, 0x1b1416, at=(sx, 0, 0.15), seg=8, parent=cb)
    x = -1.25
    while x < 0.2:
        box(0.028, random.uniform(0.34, 0.4), 0.02, random.choice((0xc7654f, 0xe2c08a, 0x3f6f73, 0xd9b36a, 0xe9dfcf, 0x2b1b1d, 0x7a2f2a)), at=(x, 0.16, 0.25), r=0.003, parent=cb); x += random.uniform(0.035, 0.055)
    box(0.62, 0.08, 0.44, 0x15141b, at=(0.75, 0.62, 0), r=0.02, parent=cb)
    cyl(0.19, 0.19, 0.016, 0x0c0c0f, at=(0.68, 0.7, 0), seg=48, parent=cb, rough=0.25, metal=0.4); cyl(0.06, 0.06, 0.02, 0xff7a59, at=(0.68, 0.7, 0), parent=cb)
    box(0.02, 0.02, 0.26, 0xcfd3e0, at=(0.95, 0.73, 0.02), ry=0.35, parent=cb, metal=0.9, rough=0.3)
    cyl(0.09, 0.07, 0.14, 0xd98b5f, at=(-0.2, 0.62, 0), parent=cb); leafy(0.16, (-0.2, 0.9, 0), leaf=0.06, count=80, parent=cb)
    # synth, mic, guitar and amp, pedals, lamp, poster
    sy = group(r, at=(-2.6, 0, 0.7), ry=0.55)
    for sx in (-0.5, 0.5):
        for a in (0.5, -0.5): box(0.04, 1.0, 0.04, 0x15141b, at=(sx, 0.42, 0), rx=a, parent=sy, centre=True)
    box(1.6, 0.09, 0.48, 0x23212e, at=(0, 0.86, 0), r=0.02, parent=sy); box(1.5, 0.02, 0.22, 0xf4efe6, at=(0, 0.95, 0.1), r=0.004, parent=sy)
    for k in range(21):
        if k % 7 not in (2, 6): box(0.035, 0.025, 0.13, 0x0d0c12, at=(-0.7 + k * 0.07, 0.96, 0.05), r=0.004, parent=sy)
    for k in range(8): cyl(0.02, 0.02, 0.03, (0xff7a59, 0xc77dff, 0x5ef2d6, 0xffd166)[k % 4], at=(-0.6 + k * 0.12, 0.95, -0.14), seg=12, parent=sy)
    mc = group(r, at=(0.35, 0, -0.75), ry=-0.3)
    cyl(0.22, 0.24, 0.03, 0x15141b, parent=mc); cyl(0.018, 0.018, 1.35, 0x8d92a6, at=(0, 0.03, 0), seg=10, parent=mc, metal=0.8, rough=0.4)
    cyl(0.05, 0.05, 0.2, 0x23212e, at=(0, 1.36, 0), parent=mc, metal=0.5, rough=0.5); ball(0.055, 0xcfd3e0, at=(0, 1.58, 0), parent=mc, metal=0.9, rough=0.35)
    gt = group(r, at=(2.85, 0, 1.0), ry=-0.75)
    prop('telecaster', at=(0, 0.1, 0.02), parent=gt, rx=-0.16)
    for sx in (-0.2, 0.2): box(0.022, 0.42, 0.022, 0x15141b, at=(sx, 0, 0.14), rz=sx * 1.1, parent=gt)
    box(0.022, 0.95, 0.022, 0x15141b, at=(0, 0, -0.13), rx=-0.12, parent=gt); box(0.3, 0.02, 0.1, 0x15141b, at=(0, 0.09, 0.05), parent=gt)
    am = group(r, at=(1.9, 0, 1.3), ry=-0.5)
    box(0.78, 0.66, 0.36, 0x1b1416, r=0.03, parent=am); box(0.68, 0.42, 0.02, 0x8a6a4a, at=(0, 0.05, 0.18), r=0.004, parent=am, rough=0.95)
    box(0.7, 0.1, 0.02, 0xd9b98c, at=(0, 0.52, 0.18), parent=am, metal=0.7, rough=0.4)
    for k in range(6): cyl(0.018, 0.018, 0.02, 0x15141b, at=(-0.25 + k * 0.09, 0.57, 0.2), rx=math.pi / 2, seg=12, parent=am, centre=True)
    ball(0.014, 0xff3020, at=(0.3, 0.57, 0.2), parent=am, emit=0xff3020, glow=40)
    pb = group(r, at=(0.9, 0, 1.6), ry=-0.15)
    box(0.7, 0.04, 0.3, 0x15141b, rx=0.08, parent=pb)
    for k, c in enumerate((0xff7a59, 0x5ef2d6, 0xffd166, 0xc77dff)): box(0.12, 0.05, 0.2, c, at=(-0.24 + k * 0.16, 0.04, 0), r=0.012, parent=pb, metal=0.4, rough=0.4)
    tl = group(r, at=(-3.45, 0, -1.9))
    box(0.5, 0.5, 0.5, 0x5a3826, r=0.02, parent=tl); cyl(0.07, 0.09, 0.2, 0xc9694f, at=(0, 0.5, 0), parent=tl)
    cyl(0.1, 0.17, 0.2, 0xffd9a0, at=(0, 0.72, 0), parent=tl, emit=0xffb45e, glow=6); light('POINT', 45, (1.0, 0.72, 0.42), (0, 0.8, 0.1), parent=tl, size=0.1)
    box(0.5, 0.68, 0.02, 0x15141b, at=(-2.55, 0.95, -2.44), parent=r); box(0.46, 0.64, 0.01, 0xf0b36a, at=(-2.55, 0.97, -2.425), r=0, parent=r)
    ball(0.15, 0xc7654f, at=(-2.55, 1.2, -2.418), scale=(1, 1, 0.05), parent=r)
    for k in range(6): box(0.09, 0.14, 0.02, 0xff5d73, at=(1.6 + k * 0.11, 2.42, -2.42), r=0.006, parent=r, emit=0xff5d73, glow=5) if k != 2 else None

# ============================================================== garden & countryside
def garden():
    g = group()
    box(160, 0.2, 160, 'grass', at=(0, -0.2, -20), r=0, parent=g)
    # flagstone terrace in front, a winding path to the gate
    box(9.6, 0.06, 2.0, 'flag', at=(0, 0, 3.7), r=0.01, parent=g)
    for k in range(9):
        box(1.0, 0.05, 0.6, 'stone', at=(math.sin(k * 0.7) * 0.5, 0.0, 5.1 + k * 0.72), ry=random.uniform(-0.15, 0.15), r=0.02, parent=g)
    # picket fence with a gate, across the front
    for k in range(70):
        x = -14 + k * 0.4
        if -0.9 < x < 0.9: continue
        box(0.09, 0.95 + 0.08 * math.sin(k * 1.3), 0.03, WHITE, at=(x, 0, 11.4), r=0.01, parent=g)
    for (x0, x1) in ((-14, -0.9), (0.9, 14)):
        for fy in (0.25, 0.7): box(x1 - x0, 0.06, 0.03, WHITE, at=((x0 + x1) / 2, fy, 11.36), parent=g)
    for px in (-0.9, 0.9): box(0.14, 1.2, 0.14, WHITE, at=(px, 0, 11.4), r=0.02, parent=g); ball(0.09, WHITE, at=(px, 1.27, 11.4), parent=g)
    # cottage borders along the terrace and the fence
    def border(x0, x1, z, depth=0.9):
        box(x1 - x0, 0.1, depth, 'soil', at=((x0 + x1) / 2, 0, z), r=0.03, parent=g)
        n = int((x1 - x0) / 0.36)
        for k in range(n):
            px = x0 + 0.2 + k * (x1 - x0 - 0.4) / max(n - 1, 1) + random.uniform(-0.06, 0.06); pz = z + random.uniform(-depth * 0.3, depth * 0.3)
            rr = random.uniform(0.2, 0.38)
            leafy(rr, (px, rr * 0.9, pz), mat=random.choice(('leaf', 'leaf2', 'hedge')), leaf=0.07, count=130, parent=g)
            kind = random.random()
            if kind < 0.45:
                c = random.choice((0x9a7fd9, 0xd96a8a, 0xe9d9f2))
                for j in range(6): cyl(0.012, 0.03, random.uniform(0.3, 0.6), c, at=(px + random.uniform(-0.2, 0.2), rr * 1.2, pz + random.uniform(-0.2, 0.2)), seg=6, parent=g)
            elif kind < 0.85:
                c = random.choice((0xd96a8a, 0xf2c84a, 0xf4f0e6, 0xe07a5f))
                for j in range(10): ball(random.uniform(0.035, 0.06), c, at=(px + random.uniform(-0.25, 0.25), rr * random.uniform(1.2, 1.9), pz + random.uniform(-0.2, 0.25)), parent=g, sub=1)
    border(-12, -5.2, 4.0, 1.2); border(5.6, 12, 4.0, 1.2)
    border(-13.5, -1.4, 10.8, 0.8); border(1.4, 13.5, 10.8, 0.8)
    # trees, shrubs, a hedge of leaves on the right
    for (tx, tz, sc, ry) in ((-9.0, -1.5, 1.15, 0.3), (13.0, 1.5, 1.2, 2.0), (-13, 7, 0.9, 4.0), (13.5, 6.5, 1.0, 1.2), (-2, -13, 1.4, 5.0), (7, -15, 1.25, 0.8)):
        prop('tree', at=(tx, 0, tz), ry=ry, scale=sc, parent=g)
    prop('shrub', at=(-5.6, 0, 2.6), parent=g); prop('shrub', at=(6.6, 0, 1.2), scale=0.8, ry=1.0, parent=g)
    for k in range(3): cyl(0.2 - k * 0.0, 0.15, 0.34, 0xb5633f, at=(-4.9 + k * 0.0 + (9.6 if k == 1 else 0) - (0.9 if k == 2 else 0), 0.06, 3.0 + (0.6 if k == 2 else 0)), seg=18, parent=g)
    for (px, pz) in ((-4.9, 3.0), (4.7, 3.0), (-5.8, 3.6)): leafy(0.28, (px, 0.66, pz), leaf=0.06, count=150, parent=g)
    # bicycle leaning on the terrace wall, a bench under the tree
    b = group(g, at=(-7.6, 0, 0.6), ry=0.3)
    for k in range(3): box(1.6, 0.04, 0.13, 0x8b5e3c, at=(0, 0.42, -0.15 + k * 0.15), r=0.012, parent=b)
    for k in range(2): box(1.6, 0.13, 0.04, 0x8b5e3c, at=(0, 0.6 + k * 0.17, -0.24), r=0.012, parent=b)
    for sx in (-0.65, 0.65): box(0.06, 0.42, 0.42, DARK, at=(sx, 0, 0), parent=b); box(0.06, 0.5, 0.05, DARK, at=(sx, 0.42, -0.24), parent=b)
    prop('cat', at=(-7.3, 0.46, 0.65), ry=0.9, parent=g)
    # fields rolling away, hedgerows, distant trees
    for (hx, hz, hy, sx_) in ((-25, -70, -9, 3.6), (35, -95, -8, 3.4), (-45, -130, -6, 4.2)):
        ball(30, 'field', at=(hx, hy, hz), scale=(sx_, 0.42, 1.3), parent=g, sub=4)
    for k in range(26):
        px = random.uniform(-80, 80); pz = random.uniform(-70, -24)
        if 18 < px < 70 and -92 < pz < -26: continue          # keep the churchyard clear
        prop('tree', at=(px, max(0, -pz - 50) * 0.03, pz), ry=random.uniform(0, 6.28), scale=random.uniform(1.1, 1.9), parent=g)
    for k in range(60):
        px = random.uniform(-130, 130); pz = random.uniform(-150, -80); rr = random.uniform(2.5, 4.5)
        leafy(rr, (px, rr * 0.8 + (-pz - 60) * 0.05, pz), mat='hedge', leaf=0.7, count=120, scale=(1, 1.1, 1), parent=g)
    for k in range(60):   # hedgerows dividing the fields
        leafy(1.0, (-60 + k * 2.0, 0.8, -22 + math.sin(k * 0.3) * 2), mat='hedge', leaf=0.22, count=110, scale=(1.3, 0.9, 0.9), parent=g)
        leafy(1.0, (-22 + math.sin(k * 0.2) * 3, 0.8 + k * 0.03, -24 - k * 1.6), mat='hedge', leaf=0.25, count=90, scale=(0.9, 0.9, 1.3), parent=g)

def church(at=(44, 0, -68), ry=2.2):
    """A village church across the fields: nave, chancel, and a square tower with a short spire."""
    c = group(None, at=at, ry=ry)
    stone = 'church'
    # nave and chancel with slate roofs
    for (w, h, d, z, rise) in ((8, 6.5, 17, 0, 3.6), (6, 5, 7, -12, 2.8)):
        box(w, h, d, stone, at=(0, 0, z), r=0.03, parent=c)
        prism([(-w / 2 - 0.3, 0), (w / 2 + 0.3, 0), (0, rise)], d + 0.5, 'slate', at=(0, h, z + d / 2 + 0.25), parent=c)
        prism([(-w / 2, 0), (w / 2, 0), (0, rise - 0.2)], 0.3, stone, at=(0, h, z + d / 2), parent=c)
    # buttresses and lancet windows glowing along both sides
    for s_ in (-1, 1):
        for k in range(5):
            z = -6.2 + k * 3.1
            box(0.5, 4.6, 0.8, stone, at=(s_ * 4.2, 0, z + 1.55), r=0.03, parent=c)
            box(0.06, 2.6, 0.9, 0xffd08a, at=(s_ * 4.02, 2.0, z), r=0, parent=c, emit=0xffb860, glow=5)
            cyl(0.001, 0.45, 0.8, 0xffd08a, at=(s_ * 4.02, 4.6, z), seg=4, rz=0, ry=math.pi / 4, parent=c, emit=0xffb860, glow=5)
    # tower
    t = group(c, at=(0, 0, 11))
    box(5.6, 15, 5.6, stone, at=(0, 0, 0), r=0.04, parent=t)
    for sx in (-1, 1):
        for sz in (-1, 1):
            box(1.0, 11, 1.0, stone, at=(sx * 2.7, 0, sz * 2.7), r=0.04, parent=t)
            box(0.6, 1.6, 0.6, stone, at=(sx * 2.6, 15, sz * 2.6), r=0.03, parent=t); cyl(0.001, 0.42, 1.0, stone, at=(sx * 2.6, 16.6, sz * 2.6), seg=4, ry=math.pi / 4, parent=t)
    for k in range(5):
        for (ax, az) in ((1, 0), (0, 1)):
            for sgn in (-1, 1):
                off = -2.0 + k * 1.0
                box(0.55 if ax == 0 else 0.3, 0.7, 0.3 if ax == 0 else 0.55, stone, at=(sgn * 2.75 if ax else off, 15, off if ax else sgn * 2.75), r=0.02, parent=t)
    cyl(0.001, 2.6, 5.5, 'slate', at=(0, 15, 0), seg=4, ry=math.pi / 4, parent=t)
    cyl(0.03, 0.03, 1.2, 0xc9a25a, at=(0, 20.5, 0), seg=6, parent=t, metal=1.0, rough=0.3)
    for (ax, sgn) in ((0, 1), (1, 1), (1, -1)):
        px, pz = (0, sgn * 2.83) if ax == 0 else (sgn * 2.83, 0)
        box(1.0 if ax == 0 else 0.06, 2.4, 0.06 if ax == 0 else 1.0, 0x1a1c22, at=(px, 11.6, pz), r=0, parent=t)          # belfry louvres
        cyl(0.95, 0.95, 0.08, 0xf1ece2, at=(px, 9.2, pz), rx=math.pi / 2 if ax == 0 else 0, rz=0 if ax == 0 else math.pi / 2, seg=32, parent=t, centre=True, emit=0xffe2b0, glow=1.5)
        box(1.1 if ax == 0 else 0.06, 3.0, 0.06 if ax == 0 else 1.1, 0xffd08a, at=(px, 3.6, pz), r=0, parent=t, emit=0xffb860, glow=5)
    box(1.7, 2.8, 0.2, 0x3a2418, at=(0, 0, 2.85), r=0.04, parent=t)
    # churchyard: wall, yews, a few headstones
    for (w, x, z, r_) in ((26, 0, 17, 0), (26, 0, -19, 0), (36, -13, -1, math.pi / 2), (36, 13, -1, math.pi / 2)):
        box(w, 1.0, 0.4, stone, at=(x, 0, z), ry=r_, r=0.05, parent=c)
    for (yx, yz, ys) in ((-9, 12, 1.0), (9, 9, 1.2), (-10, -8, 0.9), (10, -12, 1.1), (7, 15, 0.8)):
        for k in range(5):
            tt = k / 4
            leafy(2.0 * ys * (1 - tt * 0.7), (yx, (1.2 + tt * 4.2) * ys, yz), mat='yew', leaf=0.3, count=160, scale=(1, 1.2, 1), parent=c)
    for k in range(14):
        box(0.6, random.uniform(0.8, 1.2), 0.14, stone, at=(random.uniform(-11, 11), 0, random.uniform(3, 15)), ry=random.uniform(-0.2, 0.2), rz=random.uniform(-0.06, 0.06), r=0.06, parent=c)

def world():
    w = bpy.data.worlds.new('evening'); scene.world = w; w.use_nodes = True
    nt = w.node_tree; bg = nt.nodes['Background']
    sky = nt.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'NISHITA'
    sky.sun_elevation = math.radians(6); sky.sun_rotation = math.radians(float(arg('--sun', '140')))
    sky.sun_intensity = 0.5; sky.sun_size = math.radians(5)
    sky.air_density = 1.8; sky.dust_density = 3.0; sky.ozone_density = 2.5
    # streaks of cloud catching the last light, strongest low in the sky
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1.2, 1.2, 7.0)
    noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 2.2; noise.inputs['Detail'].default_value = 8; noise.inputs['Roughness'].default_value = 0.6
    ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].position = 0.52; ramp.color_ramp.elements[1].position = 0.74
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); band = nt.nodes.new('ShaderNodeMapRange')
    band.inputs[1].default_value = 0.02; band.inputs[2].default_value = 0.3; band.inputs[3].default_value = 1.0; band.inputs[4].default_value = 0.0
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.inputs[7].default_value = (2.2, 1.25, 0.8, 1)
    nt.links.new(tc.outputs['Generated'], mp.inputs[0]); nt.links.new(mp.outputs[0], noise.inputs['Vector']); nt.links.new(noise.outputs['Fac'], ramp.inputs[0])
    nt.links.new(tc.outputs['Generated'], sep.inputs[0]); nt.links.new(sep.outputs['Z'], band.inputs[0])
    nt.links.new(ramp.outputs[0], mul.inputs[0]); nt.links.new(band.outputs[0], mul.inputs[1])
    nt.links.new(mul.outputs[0], mix.inputs[0]); nt.links.new(sky.outputs[0], mix.inputs[6])
    nt.links.new(mix.outputs[2], bg.inputs[0]); bg.inputs[1].default_value = 0.16

def camera():
    cam = bpy.data.cameras.new('cam'); cam.lens = 50; cam.sensor_width = 36
    co = bpy.data.objects.new('cam', cam); col.objects.link(co)
    target = Vector(T((0.9, 5.9, 0)))
    az, el, dist = float(arg('--az', '-0.3')), 0.1, float(arg('--dist', '31'))
    pos = (target.x + math.sin(az) * math.cos(el) * dist, 0, 0)
    eye = Vector(T((0.9 + math.sin(az) * math.cos(el) * dist, 5.9 + math.sin(el) * dist, math.cos(az) * math.cos(el) * dist)))
    co.location = eye; co.rotation_euler = (target - eye).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = co

def grade():
    scene.use_nodes = True; nt = scene.node_tree
    rl = nt.nodes['Render Layers']; comp = nt.nodes['Composite']
    bpy.context.view_layer.use_pass_mist = True
    scene.world.mist_settings.start = 45; scene.world.mist_settings.depth = 160; scene.world.mist_settings.falloff = 'QUADRATIC'
    haze = nt.nodes.new('CompositorNodeMixRGB'); haze.inputs[2].default_value = (1.0, 0.74, 0.55, 1)
    k = nt.nodes.new('CompositorNodeMath'); k.operation = 'MULTIPLY'; k.inputs[1].default_value = 0.28
    nt.links.new(rl.outputs['Mist'], k.inputs[0]); nt.links.new(k.outputs[0], haze.inputs[0]); nt.links.new(rl.outputs['Image'], haze.inputs[1])
    glare = nt.nodes.new('CompositorNodeGlare'); glare.glare_type = 'FOG_GLOW'; glare.quality = 'HIGH'; glare.threshold = 1.5; glare.size = 7; glare.mix = -0.7
    nt.links.new(haze.outputs[0], glare.inputs[0]); nt.links.new(glare.outputs[0], comp.inputs[0])

church()
house = shell()
games(house); office(house); studio(house)
garden(); world(); camera(); grade()

out = arg('--render')
if out:
    w, h = (int(v) for v in arg('--size', '1280x800').split('x'))
    scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'
    scene.cycles.samples = int(arg('--samples', '96')); scene.cycles.use_denoising = False
    scene.cycles.sample_clamp_indirect = 3.0; scene.cycles.sample_clamp_direct = 12.0; scene.cycles.max_bounces = 5
    scene.cycles.caustics_reflective = False; scene.cycles.caustics_refractive = False
    scene.render.resolution_x = w; scene.render.resolution_y = h
    scene.view_settings.view_transform = 'Filmic'; scene.view_settings.look = 'Medium High Contrast'
    scene.view_settings.exposure = float(arg('--exposure', '0.45'))
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('RENDERED', out)
