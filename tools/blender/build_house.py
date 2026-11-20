"""English town house (a semi-detached Victorian pair), modelled procedurally.

Run:  blender -b --python tools/blender/build_house.py -- [--render out.png] [--samples N] [--size WxH]
"""
import bpy, bmesh, math, random, sys, addon_utils
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default

random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable('cycles')
scene = bpy.context.scene
col = bpy.context.collection

# ---------------------------------------------------------------- dimensions
HALF_W = 6.4          # one house
W = HALF_W * 2
D = 7.0               # front (y = 0) to back (y = D)
G_H = 2.95            # ground storey
F_H = 2.75            # first storey
EAVES = G_H + F_H
PITCH = math.radians(41)
RIDGE_Y = D / 2
RIDGE_Z = EAVES + math.tan(PITCH) * (D / 2)
WALL = 0.3

# ---------------------------------------------------------------- materials
def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs[0], nt.nodes['Material Output'].inputs[0])
    return m, nt, bsdf

def flat(name, color, rough=0.6, metal=0.0, emit=None, strength=0.0):
    m, nt, b = new_mat(name)
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    return m

def wall_coords(nt, scale=1.0):
    """Texture vector that runs along a vertical wall whichever way it faces: (x + y, z)."""
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    add = nt.nodes.new('ShaderNodeMath'); add.operation = 'ADD'
    comb = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    nt.links.new(sep.outputs['X'], add.inputs[0])
    nt.links.new(sep.outputs['Y'], add.inputs[1])
    nt.links.new(add.outputs[0], comb.inputs['X'])
    nt.links.new(sep.outputs['Z'], comb.inputs['Y'])
    return comb.outputs[0]

def brick_mat(name, c1, c2, mortar, brick_w=0.225, brick_h=0.075, flat_coords=False, bump=0.5, rough=0.85, mortar_size=0.008, scale=1.0):
    m, nt, b = new_mat(name)
    if flat_coords:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        vec = tc.outputs['Object']
    else:
        vec = wall_coords(nt)
    tex = nt.nodes.new('ShaderNodeTexBrick')
    tex.offset = 0.5
    tex.inputs['Scale'].default_value = scale
    tex.offset_frequency = 2
    tex.inputs['Brick Width'].default_value = brick_w
    tex.inputs['Row Height'].default_value = brick_h
    tex.inputs['Mortar Size'].default_value = mortar_size
    tex.inputs['Mortar Smooth'].default_value = 0.2
    tex.inputs['Bias'].default_value = 0.0
    tex.inputs['Color1'].default_value = (*c1, 1)
    tex.inputs['Color2'].default_value = (*c2, 1)
    tex.inputs['Mortar'].default_value = (*mortar, 1)
    nt.links.new(vec, tex.inputs['Vector'])
    # weathering: large soft noise darkens patches
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 1.3
    noise.inputs['Detail'].default_value = 6
    nt.links.new(vec, noise.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.3; ramp.color_ramp.elements[0].color = (0.55, 0.5, 0.5, 1)
    ramp.color_ramp.elements[1].position = 0.7; ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(noise.outputs['Fac'], ramp.inputs[0])
    mix.inputs[0].default_value = 1.0
    nt.links.new(tex.outputs['Color'], mix.inputs[6])
    nt.links.new(ramp.outputs[0], mix.inputs[7])
    nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    bmp = nt.nodes.new('ShaderNodeBump')
    bmp.inputs['Strength'].default_value = bump
    bmp.inputs['Distance'].default_value = 0.02
    inv = nt.nodes.new('ShaderNodeInvert')
    nt.links.new(tex.outputs['Fac'], inv.inputs['Color'])
    nt.links.new(inv.outputs[0], bmp.inputs['Height'])
    nt.links.new(bmp.outputs[0], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = rough
    return m

def noise_mat(name, c1, c2, scale=20, bump=0.3, rough=0.9, detail=8):
    m, nt, b = new_mat(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = detail
    nt.links.new(tc.outputs['Object'], noise.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.35; ramp.color_ramp.elements[0].color = (*c1, 1)
    ramp.color_ramp.elements[1].position = 0.65; ramp.color_ramp.elements[1].color = (*c2, 1)
    nt.links.new(noise.outputs['Fac'], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], b.inputs['Base Color'])
    bmp = nt.nodes.new('ShaderNodeBump'); bmp.inputs['Strength'].default_value = bump; bmp.inputs['Distance'].default_value = 0.02
    nt.links.new(noise.outputs['Fac'], bmp.inputs['Height'])
    nt.links.new(bmp.outputs[0], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = rough
    return m

def srgb(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

M = {
    'brick': brick_mat('brick', srgb(0xa9553a), srgb(0x8a4230), srgb(0xb0a089), scale=1.35),
    'brick_dark': brick_mat('brick_dark', srgb(0x8e4632), srgb(0x70352a), srgb(0xa09078), scale=1.35),
    'render': noise_mat('render', srgb(0xe8dfc9), srgb(0xf2ead8), scale=6, bump=0.08, rough=0.9, detail=10),
    'slate': brick_mat('slate', srgb(0x424a58), srgb(0x353b47), srgb(0x1c1f26), brick_w=0.28, brick_h=0.2, flat_coords=True, bump=1.0, rough=0.55, mortar_size=0.008),
    'stone': noise_mat('stone', srgb(0xcfc6b3), srgb(0xddd5c4), scale=14, bump=0.15),
    'paint': flat('paint', srgb(0xf3efe6), rough=0.35),
    'door': flat('door', srgb(0x1c2b3a), rough=0.3),
    'iron': flat('iron', srgb(0x15171a), rough=0.4, metal=0.6),
    'lead': flat('lead', srgb(0x6a6f78), rough=0.5, metal=0.3),
    'brass': flat('brass', srgb(0xc9a25a), rough=0.3, metal=1.0),
    'terracotta': noise_mat('terracotta', srgb(0xb5633f), srgb(0xc9754c), scale=30, bump=0.1, rough=0.8),
    'gravel': noise_mat('gravel', srgb(0x7d705c), srgb(0xa89a80), scale=260, bump=1.0, rough=0.95, detail=2),
    'grass': noise_mat('grass', srgb(0x3a5a30), srgb(0x55733c), scale=3.5, bump=0.3, rough=0.95),
    'hedge': noise_mat('hedge', srgb(0x1f4526), srgb(0x356b34), scale=40, bump=0.9, rough=0.9),
    'conifer': noise_mat('conifer', srgb(0x7f9a2a), srgb(0xb5c04a), scale=40, bump=0.9, rough=0.9),
    'leaf': noise_mat('leaf', srgb(0x244d2a), srgb(0x3f7a3c), scale=25, bump=0.8, rough=0.85),
    'bark': noise_mat('bark', srgb(0x3a2a20), srgb(0x57402f), scale=30, bump=0.8),
    'wood': noise_mat('wood', srgb(0x6b4a32), srgb(0x8a6444), scale=18, bump=0.3, rough=0.7),
    'flag': brick_mat('flag', srgb(0x8f8a80), srgb(0xa39d92), srgb(0x55524c), brick_w=0.9, brick_h=0.6, flat_coords=True, bump=0.4, rough=0.85, mortar_size=0.015),
    'tarmac': noise_mat('tarmac', srgb(0x2b2d31), srgb(0x3a3c40), scale=300, bump=0.5, rough=0.8, detail=2),
    'glass_lit': flat('glass_lit', srgb(0xffd9a0), rough=0.2, emit=srgb(0xffc47a), strength=6.0),
    'glass_dim': flat('glass_dim', srgb(0xffd9a0), rough=0.2, emit=srgb(0xffb86a), strength=1.6),
    'glass_dark': flat('glass_dark', srgb(0x1a2638), rough=0.05, metal=0.6),
    'curtain': flat('curtain', srgb(0xcfa98a), rough=0.9, emit=srgb(0xffb070), strength=0.25),
    'flower_a': flat('flower_a', srgb(0xd96a8a), rough=0.7),
    'flower_b': flat('flower_b', srgb(0xe9d9f2), rough=0.7),
    'flower_c': flat('flower_c', srgb(0xf2c84a), rough=0.7),
    'wallpaper_a': flat('wallpaper_a', srgb(0xb8573f), rough=0.9),
    'wallpaper_b': flat('wallpaper_b', srgb(0x5f8a72), rough=0.9),
    'wallpaper_c': flat('wallpaper_c', srgb(0xc99a4a), rough=0.9),
    'shade': flat('shade', srgb(0xffe6c0), emit=srgb(0xffc98a), strength=12.0),
    'curtain_dark': flat('curtain_dark', srgb(0x8a8f9a), rough=0.9),
    'sofa': flat('sofa', srgb(0x2f5d62), rough=0.95),
    'cushion': flat('cushion', srgb(0xe2b04a), rough=0.95),
    'leaf2': noise_mat('leaf2', srgb(0x3d6b2c), srgb(0x6a9440), scale=25, bump=0.5, rough=0.8),
    'field': noise_mat('field', srgb(0x4a6638), srgb(0x7d8a4a), scale=0.6, bump=0.05, rough=0.95),
    'flower_d': flat('flower_d', srgb(0x9a7fd9), rough=0.7),
    'flower_e': flat('flower_e', srgb(0xf4f0e6), rough=0.7),
    'hedge_dark': flat('hedge_dark', srgb(0x16301c), rough=0.95),
    'lamp': flat('lamp', srgb(0xffe2b0), emit=srgb(0xffc98a), strength=25.0),
}

# ---------------------------------------------------------------- mesh helpers
def obj_from_bm(name, bm, mat=None, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    col.objects.link(o)
    if mat: me.materials.append(M[mat] if isinstance(mat, str) else mat)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    return o

def box(name, size, loc, mat, bevel=0.0, rot=(0, 0, 0)):
    """Box by size with its CENTRE at loc."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
    o = obj_from_bm(name, bm, mat)
    o.location = loc
    o.rotation_euler = rot
    if bevel:
        mod = o.modifiers.new('bevel', 'BEVEL'); mod.width = bevel; mod.segments = 2; mod.limit_method = 'ANGLE'
    return o

def cyl(name, r1, r2, h, loc, mat, seg=20, rot=(0, 0, 0), smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=h)
    o = obj_from_bm(name, bm, mat, smooth)
    o.location = (loc[0], loc[1], loc[2] + h / 2) if rot == (0, 0, 0) else loc
    o.rotation_euler = rot
    if smooth:
        o.data.use_auto_smooth = True; o.data.auto_smooth_angle = math.radians(50)
    return o

def cut(target, size, loc, rot=(0, 0, 0)):
    c = box('cutter', size, loc, None, rot=rot)
    mod = target.modifiers.new('cut', 'BOOLEAN'); mod.object = c; mod.operation = 'DIFFERENCE'; mod.solver = 'EXACT'
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(c)

def prism(name, pts, depth, loc, mat, axis='X'):
    """Extrude a 2D outline (list of (a, b)) by depth along an axis."""
    bm = bmesh.new()
    vs = [bm.verts.new((0, a, b) if axis == 'X' else (a, 0, b)) for a, b in pts]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    vec = Vector((depth, 0, 0)) if axis == 'X' else Vector((0, depth, 0))
    bmesh.ops.translate(bm, vec=vec, verts=[e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = obj_from_bm(name, bm, mat)
    o.location = loc
    return o

def blob(name, radius, loc, mat, scale=(1, 1, 1), strength=0.35, noise_scale=1.2, sub=3):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=radius)
    o = obj_from_bm(name, bm, mat, smooth=True)
    o.location = loc; o.scale = scale
    tex = bpy.data.textures.new(name + '_n', 'CLOUDS'); tex.noise_scale = noise_scale * radius
    mod = o.modifiers.new('d', 'DISPLACE'); mod.texture = tex; mod.strength = strength * radius; mod.texture_coords = 'GLOBAL'
    return o

def leafy(name, radius, loc, mat, leaf=0.16, count=260, scale=(1, 1, 1), core=True):
    """A clump of foliage: many small tilted leaves scattered over a lumpy volume."""
    bm = bmesh.new()
    for _ in range(count):
        # point on a noisy ellipsoid shell, biased outward
        u = random.uniform(-1, 1); a = random.uniform(0, math.tau)
        rr = math.sqrt(1 - u * u)
        d = radius * random.uniform(0.72, 1.05)
        p = Vector((math.cos(a) * rr * d * scale[0], math.sin(a) * rr * d * scale[1], u * d * scale[2]))
        n = p.normalized()
        t = n.cross(Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1)))).normalized()
        b2 = n.cross(t)
        tilt = (n * random.uniform(-0.5, 0.5))
        s = leaf * random.uniform(0.7, 1.3)
        vs = [bm.verts.new(p + t * s * dx + (b2 + tilt) * s * dy) for dx, dy in ((0, -0.6), (0.5, 0), (0, 0.6), (-0.5, 0))]
        bm.faces.new(vs)
    o = obj_from_bm(name, bm, mat)
    o.location = loc
    if core:
        c = blob(name + '_core', radius * 0.8, loc, mat, scale=scale, strength=0.25, sub=2)
    return o

# ---------------------------------------------------------------- windows & doors
def room_behind(x, z, w, h, y, paper, energy=40, depth=2.2):
    """A shallow lit room behind an opening, so windows glow like real ones."""
    box('rm_back', (w + 0.5, 0.03, h + 0.6), (x, y + depth, z), paper)
    for sx in (-1, 1): box('rm_side', (0.03, depth, h + 0.6), (x + sx * (w / 2 + 0.24), y + depth / 2 + 0.2, z), paper)
    box('rm_ceil', (w + 0.5, depth, 0.03), (x, y + depth / 2 + 0.2, z + h / 2 + 0.28), 'paint')
    box('rm_floor', (w + 0.5, depth, 0.03), (x, y + depth / 2 + 0.2, z - h / 2 - 0.28), 'wood')
    box('rm_pic', (0.5, 0.03, 0.38), (x - w * 0.18, y + depth - 0.03, z + 0.2), 'paint', bevel=0.01)
    box('rm_pic_in', (0.4, 0.03, 0.28), (x - w * 0.18, y + depth - 0.045, z + 0.2), 'door')
    # table lamp
    lx = x + w * 0.22
    cyl('rm_lamp_base', 0.05, 0.035, 0.3, (lx, y + depth - 0.5, z - h / 2 + 0.25), 'brass', seg=10)
    cyl('rm_lamp_shade', 0.15, 0.1, 0.2, (lx, y + depth - 0.5, z - h / 2 + 0.55), 'shade', seg=16)
    box('rm_table', (0.5, 0.4, 0.5), (lx, y + depth - 0.5, z - h / 2 - 0.02), 'wood', bevel=0.01)
    light = bpy.data.lights.new('room', 'POINT'); light.energy = energy; light.color = (1.0, 0.74, 0.46); light.shadow_soft_size = 0.25
    lo = bpy.data.objects.new('room', light); lo.location = (x, y + depth * 0.55, z + h / 2 - 0.05); col.objects.link(lo)

def sash(x, z, w=1.1, h=1.75, lit='glass_lit', y=0.0, panes=2, curtains=True, arch=True, paper='wallpaper_a', energy=40):
    """Sash window set into the front wall (wall face at y). (x, z) is the centre of the opening."""
    rv = 0.11  # reveal depth
    fy = y + rv
    t = 0.07
    # box frame
    box('wf', (w, 0.06, t), (x, fy, z + h / 2 - t / 2), 'paint')
    box('wf', (w, 0.06, t), (x, fy, z - h / 2 + t / 2), 'paint')
    for sx in (-1, 1): box('wf', (t, 0.06, h), (x + sx * (w / 2 - t / 2), fy, z), 'paint')
    # two sashes, the upper one sitting proud of the lower
    for i, (zc, yo) in enumerate(((z + h / 4 - 0.01, 0.0), (z - h / 4 + 0.01, 0.035))):
        sh = h / 2 - 0.05
        sw = w - 2 * t
        for sz in (-1, 1): box('ws', (sw, 0.035, 0.05), (x, fy + yo, zc + sz * (sh / 2 - 0.025)), 'paint')
        for sx in (-1, 1): box('ws', (0.05, 0.035, sh), (x + sx * (sw / 2 - 0.025), fy + yo, zc), 'paint')
        for p in range(1, panes): box('wb', (0.025, 0.03, sh), (x - sw / 2 + p * sw / panes, fy + yo, zc), 'paint')
        box('wg', (sw - 0.06, 0.008, sh - 0.06), (x, fy + yo + 0.012, zc), 'glass_dark' if lit is None else 'glass_dark_clear')
    if lit is None: box('wblind', (w - 0.12, 0.02, h - 0.12), (x, fy + 0.1, z), 'curtain_dark')
    # the room behind: a glowing card, with curtains in front of it
    if lit:
        room_behind(x, z, w, h, y, paper, energy)
        if curtains:
            for sx in (-1, 1): box('wc', (w * 0.2, 0.03, h - 0.14), (x + sx * w * 0.36, fy + 0.14, z), 'curtain')
    # stone sill and a gauged-brick flat arch above
    box('sill', (w + 0.3, 0.2, 0.08), (x, y + 0.03, z - h / 2 - 0.04), 'stone', bevel=0.012)
    n = 9
    for i in range(n if arch else 0):
        f = (i - (n - 1) / 2) / ((n - 1) / 2)
        box('arch', ((w + 0.24) / n - 0.012, 0.04, 0.26), (x + f * (w + 0.12) / 2 * 0.93, y - 0.012, z + h / 2 + 0.14), 'brick_trim', rot=(0, -f * 0.28, 0))

def front_door(x, z0, y=0.0):
    w, h = 0.95, 2.05
    box('df', (w + 0.2, 0.1, 0.1), (x, y + 0.08, z0 + h + 0.05), 'paint')
    for sx in (-1, 1): box('df', (0.1, 0.1, h), (x + sx * (w / 2 + 0.05), y + 0.08, z0 + h / 2), 'paint')
    box('door', (w, 0.05, h), (x, y + 0.13, z0 + h / 2), 'door', bevel=0.004)
    for px, pz, ph in ((-0.22, 0.48, 0.62), (0.22, 0.48, 0.62), (-0.22, 1.42, 0.92), (0.22, 1.42, 0.92)):
        box('dp', (0.3, 0.012, ph), (x + px, y + 0.103, z0 + pz), 'door', bevel=0.012)
        box('dp', (0.22, 0.012, ph - 0.1), (x + px, y + 0.096, z0 + pz), 'door', bevel=0.008)
    cyl('knob', 0.035, 0.03, 0.05, (x + 0.34, y + 0.075, z0 + 1.0), 'brass', rot=(math.pi / 2, 0, 0))
    box('letter', (0.24, 0.012, 0.05), (x, y + 0.1, z0 + 0.98), 'brass', bevel=0.004)
    box('step', (1.5, 0.5, 0.16), (x, y - 0.2, z0 - 0.08), 'stone', bevel=0.02)
    # semicircular fanlight with radiating bars, under a brick arch
    r = w / 2 + 0.1
    zc = z0 + h + 0.1
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=32, radius=r - 0.06)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(0, -1, 0), clear_outer=True)
    o = obj_from_bm('fan', bm, 'glass_lit'); o.rotation_euler = (math.pi / 2, 0, 0); o.location = (x, y + 0.14, zc)
    for i in range(13):
        a = math.pi * i / 12
        box('fr', (0.07, 0.1, 0.07), (x + math.cos(a) * (r - 0.03), y + 0.08, zc + math.sin(a) * (r - 0.03)), 'paint', rot=(0, -(a - math.pi / 2), 0))
    for a in (math.pi / 4, math.pi / 2, 3 * math.pi / 4):
        box('fb', (0.025, 0.03, r - 0.08), (x + math.cos(a) * (r - 0.08) / 2, y + 0.125, zc + math.sin(a) * (r - 0.08) / 2), 'paint', rot=(0, -(a - math.pi / 2), 0))
    for i in range(15):
        a = math.pi * i / 14
        box('da', (0.11, 0.05, 0.24), (x + math.cos(a) * (r + 0.13), y - 0.012, zc + math.sin(a) * (r + 0.13)), 'brick_trim', rot=(0, -(a - math.pi / 2), 0))

def bay(x, z0, y=0.0):
    """Canted bay window with a brick base."""
    proj, cw, sw = 0.75, 1.5, 0.95
    base_h, win_h = 0.8, 1.55
    ang = math.atan2(proj, sw * 0.72)
    faces = [((x, y - proj), 0, cw)]
    for s in (-1, 1):
        cx = x + s * (cw / 2 + sw * 0.72 / 2)
        faces.append(((cx, y - proj / 2), s * ang, math.hypot(proj, sw * 0.72)))
    for (cx, cy), a, w in faces:
        rot = (0, 0, -a)
        box('bay_base', (w + 0.02, 0.24, base_h), (cx, cy, z0 + base_h / 2), 'brick', rot=rot)
        box('bay_sill', (w + 0.12, 0.34, 0.07), (cx, cy - 0.0, z0 + base_h + 0.035), 'stone', rot=rot, bevel=0.01)
        zc = z0 + base_h + 0.07 + win_h / 2
        # frame, mullion-less sash pair, glass
        for sz in (-1, 1): box('bf', (w, 0.14, 0.08), (cx, cy, zc + sz * (win_h / 2 - 0.04)), 'paint', rot=rot)
        for sx in (-1, 1):
            off = Vector((sx * (w / 2 - 0.045), 0, 0)); off.rotate(__import__('mathutils').Euler(rot))
            box('bf', (0.09, 0.16, win_h), (cx + off.x, cy + off.y, zc), 'paint', rot=rot)
        box('bm', (w - 0.16, 0.05, 0.05), (cx, cy, zc), 'paint', rot=rot)
        box('bg', (w - 0.16, 0.01, win_h - 0.14), (cx, cy, zc), 'glass_dark_clear', rot=rot)
        box('bhead', (w + 0.06, 0.2, 0.2), (cx, cy, zc + win_h / 2 + 0.1), 'paint', rot=rot, bevel=0.01)
    # glowing room and curtains inside the bay
    room_behind(x, z0 + base_h + 0.07 + win_h / 2, cw + sw * 1.2, win_h, y + 0.1, 'wallpaper_b', energy=70, depth=2.6)
    box('bay_sofa', (1.9, 0.5, 0.75), (x, y + 1.2, z0 + 0.5), 'sofa', bevel=0.08)
    for cx_ in (-0.5, 0.45): box('bay_cushion', (0.42, 0.14, 0.36), (x + cx_, y + 0.98, z0 + 0.95), 'cushion', bevel=0.06, rot=(0.25, 0, 0.1))
    for s in (-1, 1): box('bay_curt', (0.3, 0.05, win_h), (x + s * (cw / 2 + 0.25), y - 0.1, z0 + base_h + 0.07 + win_h / 2), 'curtain')
    box('bay_floor', (cw + sw * 1.5, proj, 0.05), (x, y - proj / 2 + 0.1, z0 + base_h + 0.03), 'paint')
    return proj, cw + 2 * sw * 0.72

# glass that shows the lit room behind while still catching a little sky
m, nt, b = new_mat('glass_dark_clear')
b.inputs['Base Color'].default_value = (0.5, 0.6, 0.7, 1)
b.inputs['Roughness'].default_value = 0.05
b.inputs['Transmission Weight'].default_value = 1.0
b.inputs['IOR'].default_value = 1.05
M['glass_dark_clear'] = m
M['brick_trim'] = brick_mat('brick_trim', srgb(0xb8603f), srgb(0xa9553a), srgb(0xcdbfa8), brick_w=0.5, brick_h=0.5, bump=0.1)

# ---------------------------------------------------------------- the house
def build_house():
    # Ground storey in brick, first storey rendered: solid masses with window openings cut in
    ground = box('ground_storey', (W, D, G_H), (0, D / 2, G_H / 2), 'brick')
    first = box('first_storey', (W, D, F_H), (0, D / 2, G_H + F_H / 2), 'render')
    box('plinth', (W + 0.08, D + 0.08, 0.35), (0, D / 2, 0.175), 'brick_dark', bevel=0.01)
    box('string', (W + 0.06, 0.1, 0.14), (0, 0.0, G_H), 'stone', bevel=0.015)

    for side in (-1, 1):                     # the two houses mirror each other about x = 0
        bay_x = side * 2.25
        door_x = side * 5.0
        win_z = G_H + 0.82 + 1.6 / 2
        for wx in (side * 2.25, side * 5.0):
            is_lit = wx > 0
            cut(first, (1.1, 5.2, 1.6), (wx, 0.2, win_z))
            sash(wx, win_z, h=1.6, lit='glass_lit' if is_lit else None, arch=False, paper='wallpaper_c' if abs(wx) > 3 else 'wallpaper_a', energy=44)
            box('surround', (1.34, 0.06, 0.1), (wx, -0.01, win_z + 0.8 + 0.07), 'paint', bevel=0.01)
            for sx in (-1, 1): box('surround', (0.1, 0.06, 1.6), (wx + sx * 0.62, -0.01, win_z), 'paint', bevel=0.01)
        cut(ground, (0.95, 0.8, 2.05), (door_x, 0.2, 0.35 + 2.05 / 2))
        cut(ground, (2.5, 6.0, 1.75), (bay_x, 0.2, 0.35 + 0.8 + 0.85))
        front_door(door_x, 0.35)
        proj, bay_w = bay(bay_x, 0.35)

        # Lean-to slate canopy running over the bay and the door, on timber brackets
        cz = 0.35 + 0.8 + 0.07 + 1.55 + 0.2
        x_in, x_out = side * 0.55, side * 5.95
        cw_ = abs(x_out - x_in)
        cxm = (x_in + x_out) / 2
        depth = proj + 0.45
        rise = 0.62
        slope = math.hypot(depth, rise)
        a = math.atan2(rise, depth)
        can = box('canopy', (cw_, slope, 0.06), (cxm, -depth / 2 + 0.02, cz + rise / 2 + 0.05), 'slate', rot=(a, 0, 0))
        box('canopy_fascia', (cw_, 0.05, 0.16), (cxm, -depth + 0.02, cz + 0.02), 'paint', bevel=0.008)
        box('canopy_soffit', (cw_, depth, 0.04), (cxm, -depth / 2, cz - 0.02), 'paint')
        box('canopy_lead', (cw_, 0.12, 0.05), (cxm, 0.02, cz + rise + 0.07), 'lead')
        for ex in (x_in, x_out):
            prism('canopy_end', [(0, 0), (-depth, 0), (0, rise)], 0.05, (ex - 0.025, 0.02, cz + 0.02), 'paint')
        for bx in (door_x - 0.75, door_x + 0.75):
            box('bracket', (0.07, 0.07, 0.75), (bx, -0.03, cz - 0.4), 'paint')
            box('bracket', (0.07, depth - 0.25, 0.07), (bx, -(depth - 0.25) / 2, cz - 0.06), 'paint')
            box('bracket', (0.06, 0.06, 0.8), (bx, -0.33, cz - 0.36), 'paint', rot=(math.radians(-42), 0, 0))
        # lantern by the door
        lx = door_x + side * 0.85
        box('lantern_arm', (0.03, 0.2, 0.03), (lx, -0.1, 2.05), 'iron')
        box('lantern', (0.14, 0.14, 0.22), (lx, -0.2, 1.93), 'lamp', bevel=0.01)
        box('lantern_cap', (0.2, 0.2, 0.03), (lx, -0.2, 2.06), 'iron')
        light = bpy.data.lights.new('door_light', 'POINT'); light.energy = 60; light.color = (1.0, 0.72, 0.42); light.shadow_soft_size = 0.08
        lo = bpy.data.objects.new('door_light', light); lo.location = (lx, -0.45, 1.9); col.objects.link(lo)
        # downpipe at the outer corner
        cyl('downpipe', 0.045, 0.045, EAVES - 0.3, (side * (HALF_W - 0.22), -0.07, 0.2), 'iron', seg=12)

    # Diamond date plaque between the two houses
    box('plaque', (0.62, 0.05, 0.62), (0, -0.02, G_H + 1.45), 'stone', rot=(0, math.pi / 4, 0), bevel=0.01)
    box('plaque_in', (0.4, 0.05, 0.4), (0, -0.035, G_H + 1.45), 'brick_trim', rot=(0, math.pi / 4, 0))

    # Dentil course and gutter under the eaves
    for i in range(int(W / 0.24)):
        box('dentil', (0.11, 0.08, 0.1), (-W / 2 + 0.12 + i * 0.24, -0.03, EAVES - 0.22), 'paint')
    box('fascia', (W + 0.3, 0.05, 0.2), (0, -0.28, EAVES - 0.06), 'paint')
    box('soffit', (W + 0.3, 0.32, 0.04), (0, -0.13, EAVES - 0.15), 'paint')
    cyl('gutter', 0.075, 0.075, W + 0.4, (0, -0.36, EAVES - 0.0), 'iron', seg=12, rot=(0, math.pi / 2, 0))

    # Roof: two slate slopes with gable ends, ridge tiles, rooflights
    over = 0.35
    run = D / 2 + over
    length = run / math.cos(PITCH)
    for sgn in (-1, 1):
        cy = RIDGE_Y + sgn * (run / 2)
        cz = RIDGE_Z - math.tan(PITCH) * (run / 2)
        box('roof', (W + 0.5, length, 0.09), (0, cy, cz + 0.05), 'slate', rot=(sgn * -PITCH if sgn > 0 else PITCH, 0, 0))
    for gx in (-W / 2, W / 2 - WALL):
        prism('gable', [(0, 0), (D, 0), (D / 2, RIDGE_Z - EAVES)], WALL, (gx, 0, EAVES), 'render')
    for sx in (-1, 1):                       # painted bargeboards
        for sgn in (-1, 1):
            cy = RIDGE_Y + sgn * (run / 2)
            cz = RIDGE_Z - math.tan(PITCH) * (run / 2)
            box('barge', (0.05, length, 0.2), (sx * (W / 2 + 0.24), cy, cz - 0.07), 'paint', rot=(PITCH if sgn < 0 else -PITCH, 0, 0))
    for i in range(int((W + 0.5) / 0.45)):
        cyl('ridge', 0.11, 0.11, 0.43, (-(W + 0.5) / 2 + 0.22 + i * 0.45, RIDGE_Y, RIDGE_Z + 0.1), 'terracotta', seg=10, rot=(0, math.pi / 2, 0))
    for vx, lit in ((-4.6, 'glass_dim'), (-1.9, None), (1.9, 'glass_lit'), (4.6, None)):
        t = 0.52
        cy = RIDGE_Y - run * t
        cz = RIDGE_Z - math.tan(PITCH) * run * t
        box('velux_frame', (0.9, 1.25, 0.1), (vx, cy, cz + 0.13), 'lead', rot=(PITCH, 0, 0), bevel=0.01)
        box('velux_glass', (0.74, 1.08, 0.02), (vx, cy - 0.02, cz + 0.19), lit or 'glass_dark', rot=(PITCH, 0, 0))

    # Central chimney stack shared by both houses
    cb = RIDGE_Z - 0.9
    box('chimney', (1.5, 0.85, 2.6), (0, RIDGE_Y, cb + 1.3), 'brick')
    box('chimney_band', (1.62, 0.97, 0.12), (0, RIDGE_Y, cb + 2.15), 'brick_dark', bevel=0.01)
    box('chimney_cap', (1.7, 1.05, 0.12), (0, RIDGE_Y, cb + 2.6), 'stone', bevel=0.02)
    box('flashing', (1.62, 0.97, 0.3), (0, RIDGE_Y, RIDGE_Z + 0.05), 'lead')
    for i, px in enumerate((-0.52, -0.17, 0.17, 0.52)):
        h = 0.5 + (i % 2) * 0.12
        cyl('pot', 0.13, 0.1, h, (px, RIDGE_Y, cb + 2.66), 'terracotta', seg=16)
        cyl('pot_rim', 0.125, 0.125, 0.05, (px, RIDGE_Y, cb + 2.66 + h - 0.03), 'terracotta', seg=16)

# ---------------------------------------------------------------- garden & street
def build_garden():
    box('lawn', (90, 90, 0.2), (0, 8, -0.1), 'grass')
    box('drive', (9.0, 6.4, 0.06), (4.0, -3.4, 0.03), 'gravel')
    box('front_lawn', (6.0, 4.6, 0.09), (-4.0, -4.3, 0.045), 'grass')
    # stone path from the gate to the door, flags set a little unevenly
    for i in range(9):
        box('path', (1.05, 0.62, 0.05), (5.0 + random.uniform(-0.04, 0.04), -0.75 - i * 0.68, 0.075), 'stone', bevel=0.02, rot=(0, 0, random.uniform(-0.05, 0.05)))
    box('pavement', (70, 2.0, 0.12), (0, -8.3, 0.06), 'flag')
    box('kerb', (70, 0.18, 0.16), (0, -9.35, 0.08), 'stone', bevel=0.02)
    box('road', (70, 7, 0.04), (0, -12.9, 0.02), 'tarmac')

    # low brick garden wall with stone coping; piers and a little gate at the path
    for x0, x1 in ((-14, 4.25), (5.75, 8.6)):
        w = x1 - x0
        box('wall', (w, 0.24, 0.72), ((x0 + x1) / 2, -7.1, 0.36), 'brick')
        box('coping', (w + 0.04, 0.32, 0.07), ((x0 + x1) / 2, -7.1, 0.755), 'stone', bevel=0.015)
    for px in (4.25, 5.75):
        box('pier', (0.46, 0.46, 1.1), (px, -7.1, 0.55), 'brick')
        box('pier_cap', (0.6, 0.6, 0.1), (px, -7.1, 1.15), 'stone', bevel=0.03)
        blob('pier_ball', 0.15, (px, -7.1, 1.34), 'stone', strength=0.0, sub=3)
    for i in range(7):                                    # picket gate, standing ajar
        gx = 4.55 + i * 0.15
        box('gate', (0.09, 0.03, 0.85 + 0.12 * math.sin(i / 6 * math.pi)), (gx, -7.02 - (gx - 4.55) * 0.22, 0.5), 'paint', bevel=0.008)
    for gz in (0.25, 0.7): box('gate_rail', (1.0, 0.03, 0.06), (5.0, -7.14, gz), 'paint', rot=(0, 0, -0.22))

    # cottage border under the bay: mounds of foliage with drifts of flowers
    def border(x0, x1, y, depth=1.0):
        box('bed', (x1 - x0, depth, 0.1), ((x0 + x1) / 2, y, 0.05), 'bark')
        n = int((x1 - x0) / 0.32)
        for i in range(n):
            px = x0 + 0.2 + i * (x1 - x0 - 0.4) / max(n - 1, 1) + random.uniform(-0.06, 0.06)
            py = y + random.uniform(-depth * 0.3, depth * 0.3)
            r = random.uniform(0.2, 0.36)
            leafy('bush', r, (px, py, r * 0.9), random.choice(['leaf', 'hedge', 'leaf2']), leaf=0.07, count=140, scale=(1, 1, random.uniform(0.8, 1.2)))
            kind = random.random()
            if kind < 0.45:                                 # lavender / foxglove spikes
                colr = random.choice(['flower_b', 'flower_d', 'flower_a'])
                for k in range(6):
                    cyl('spike', 0.03, 0.012, random.uniform(0.3, 0.55), (px + random.uniform(-0.2, 0.2), py + random.uniform(-0.2, 0.2), r * 1.2), colr, seg=6)
            elif kind < 0.8:                                # daisies / roses
                colr = random.choice(['flower_a', 'flower_c', 'flower_e'])
                for k in range(10):
                    blob('bloom', random.uniform(0.035, 0.06), (px + random.uniform(-0.25, 0.25), py + random.uniform(-0.25, 0.1), r * random.uniform(1.2, 1.9)), colr, strength=0.0, sub=1)
    border(0.75, 3.75, -1.55, 1.0)
    border(-13, 3.9, -6.55, 0.7)
    border(6.1, 8.3, -6.55, 0.7)

    # wisteria trained over the door and along the canopy
    for i in range(60):
        t = i / 59
        if t < 0.3:   px, pz = 5.95 + random.uniform(-0.1, 0.1), 0.4 + t / 0.3 * 2.5
        else:         px, pz = 5.95 - (t - 0.3) / 0.7 * 5.2, 2.95 + random.uniform(-0.12, 0.12)
        leafy('wisteria', random.uniform(0.16, 0.26), (px, -0.12 - (0.5 if t >= 0.3 else 0), pz), 'leaf2', leaf=0.07, count=70, core=False)
        if random.random() < 0.6:
            for k in range(5):
                blob('wist_fl', 0.05 - k * 0.006, (px + random.uniform(-0.1, 0.1), -0.22 - (0.55 if t >= 0.3 else 0), pz - 0.12 - k * 0.07), 'flower_d', strength=0.0, sub=1)
    cyl('wist_stem', 0.035, 0.025, 2.9, (5.95, -0.1, 0.1), 'bark', seg=8)

    # pots by the door, and two clipped balls by the gate
    for px, r in ((4.2, 0.24), (5.85, 0.3)):
        cyl('pot_p', 0.2, 0.15, 0.36, (px, -0.55, 0.06), 'terracotta', seg=18)
        leafy('pot_plant', r, (px, -0.55, 0.42 + r), 'leaf', leaf=0.06, count=160)
    # the golden conifer from the photograph, beside the drive
    for i in range(7):
        t = i / 6
        leafy('conifer', 0.62 * (1 - t * 0.8), (0.2 + random.uniform(-0.03, 0.03), -3.4, 0.45 + t * 1.75), 'conifer', leaf=0.09, count=260, scale=(1, 1, 1.3))

    # clipped hedge down the right boundary: a dark core dressed in small leaves
    hx, hw, hl, hh = 9.2, 1.0, 13.0, 1.7
    box('hedge_core', (hw - 0.12, hl - 0.12, hh - 0.06), (hx, -0.8, hh / 2 - 0.03), 'hedge_dark', bevel=0.12)
    bm = bmesh.new()
    for _ in range(9000):
        f = random.random()
        if f < 0.4:   p = Vector((random.choice((-1, 1)) * hw / 2, random.uniform(-hl / 2, hl / 2), random.uniform(0, hh))); n = Vector((1 if p.x > 0 else -1, 0, 0))
        elif f < 0.9: p = Vector((random.uniform(-hw / 2, hw / 2), random.uniform(-hl / 2, hl / 2), hh)); n = Vector((0, 0, 1))
        else:         p = Vector((random.uniform(-hw / 2, hw / 2), random.choice((-1, 1)) * hl / 2, random.uniform(0, hh))); n = Vector((0, 1 if p.y > 0 else -1, 0))
        p += n * random.uniform(-0.05, 0.04)
        t = n.cross(Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1)))).normalized(); b2 = n.cross(t) + n * random.uniform(-0.6, 0.6)
        sz = random.uniform(0.05, 0.09)
        bm.faces.new([bm.verts.new(p + t * sz * dx + b2 * sz * dy) for dx, dy in ((0, -0.6), (0.5, 0), (0, 0.6), (-0.5, 0))])
    o = obj_from_bm('hedge_leaves', bm, 'hedge'); o.location = (hx, -0.8, 0)

    # trees: a forked trunk and a crown of leafy clumps. One stands in front of the neighbour's half.
    def tree(tx, ty, sc, clumps=22):
        cyl('trunk', 0.26 * sc, 0.16 * sc, 3.1 * sc, (tx, ty, 0), 'bark', seg=12)
        for k in range(5):
            a = k * 1.3 + 0.4
            cyl('branch', 0.1 * sc, 0.04 * sc, 2.6 * sc, (tx + math.cos(a) * 0.6 * sc, ty + math.sin(a) * 0.6 * sc, 3.9 * sc), 'bark', seg=8, rot=(math.sin(a) * -0.6, math.cos(a) * 0.6, 0))
        for k in range(clumps):
            a = random.uniform(0, math.tau); u = random.uniform(-0.3, 1)
            rr = math.sqrt(max(0.0, 1 - u * u)) * random.uniform(0.5, 1.0)
            r = random.uniform(0.7, 1.15) * sc
            leafy('crown', r, (tx + math.cos(a) * rr * 2.2 * sc, ty + math.sin(a) * rr * 2.2 * sc, (5.1 + u * 2.1) * sc), random.choice(['leaf', 'leaf2', 'hedge']), leaf=0.2 * sc, count=330)
    tree(-2.6, -5.2, 1.0, clumps=26)
    tree(13.5, 3.0, 1.2)
    tree(4.0, 14.0, 1.35)
    tree(-9.0, 13.0, 1.25)
    tree(19.0, -4.0, 1.0)

    # rolling fields beyond, with hedgerow trees
    for hy, hz, hx in ((60, -9, -20), (85, -8, 30), (120, -6, -40)):
        blob('hill', 30, (hx, hy, hz), 'field', scale=(3.4, 1.2, 0.42), strength=0.03, sub=4)
    for i in range(60):
        px = random.uniform(-90, 90); py = random.uniform(30, 90)
        r = random.uniform(1.3, 2.8)
        blob('far_tree', r, (px, py, r * 0.8 + max(0, py - 45) * 0.05), 'hedge', strength=0.4, noise_scale=0.4, sub=2)

def build_world():
    w = bpy.data.worlds.new('evening'); scene.world = w; w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes['Background']
    sky = nt.nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'NISHITA'
    sky.sun_elevation = math.radians(9)
    sky.sun_rotation = math.radians(float(arg('--sun', '212')))        # low in the front-left, so the façade is lit and modelled
    sky.sun_intensity = 0.55
    sky.sun_size = math.radians(4)              # a soft sun: gentle shadow edges
    sky.air_density = 1.8; sky.dust_density = 3.5; sky.ozone_density = 2.5
    nt.links.new(sky.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = 0.16

def setup_camera():
    cam = bpy.data.cameras.new('cam'); cam.lens = 37; cam.sensor_width = 36
    co = bpy.data.objects.new('cam', cam); col.objects.link(co)
    co.location = (9.6, -16.5, 3.4)
    target = Vector((2.6, 1.0, 4.0))
    co.rotation_euler = (target - co.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = co
    cam.dof.use_dof = True; cam.dof.focus_distance = (target - co.location).length; cam.dof.aperture_fstop = 4.0

def setup_grade():
    """Bloom on the lamps and windows, a touch of vignette."""
    scene.use_nodes = True
    nt = scene.node_tree
    rl = nt.nodes['Render Layers']; comp = nt.nodes['Composite']
    glare = nt.nodes.new('CompositorNodeGlare'); glare.glare_type = 'FOG_GLOW'; glare.quality = 'HIGH'; glare.threshold = 1.2; glare.size = 8; glare.mix = -0.6
    bpy.context.view_layer.use_pass_mist = True
    scene.world.mist_settings.start = 22; scene.world.mist_settings.depth = 110; scene.world.mist_settings.falloff = 'QUADRATIC'
    haze = nt.nodes.new('CompositorNodeMixRGB'); haze.blend_type = 'MIX'
    haze.inputs[2].default_value = (1.0, 0.72, 0.5, 1)
    scale = nt.nodes.new('CompositorNodeMath'); scale.operation = 'MULTIPLY'; scale.inputs[1].default_value = 0.6
    nt.links.new(rl.outputs['Mist'], scale.inputs[0])
    nt.links.new(scale.outputs[0], haze.inputs[0])
    nt.links.new(rl.outputs['Image'], haze.inputs[1])
    nt.links.new(haze.outputs[0], glare.inputs[0])
    nt.links.new(glare.outputs[0], comp.inputs[0])

build_house()
build_garden()
build_world()
setup_camera()
setup_grade()

# bevel-friendly shading on the hard-surface pieces
for o in col.objects:
    if o.type == 'MESH' and o.modifiers and any(m.type == 'BEVEL' for m in o.modifiers):
        o.data.use_auto_smooth = True; o.data.auto_smooth_angle = math.radians(40)
        for p in o.data.polygons: p.use_smooth = True

out = arg('--render')
if out:
    w, h = (int(v) for v in arg('--size', '1280x800').split('x'))
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = int(arg('--samples', '96'))
    scene.cycles.use_denoising = False
    scene.cycles.sample_clamp_indirect = 4.0
    scene.cycles.max_bounces = 5
    scene.cycles.caustics_reflective = False; scene.cycles.caustics_refractive = False
    scene.render.resolution_x = w; scene.render.resolution_y = h
    scene.view_settings.view_transform = 'Filmic'
    scene.view_settings.look = 'Medium High Contrast'
    scene.view_settings.exposure = float(arg('--exposure', '0.2'))
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('RENDERED', out)
