"""Build the 3D prop library for the site and export it as one binary glTF.

    blender -b --python tools/blender/build_props.py

Everything is generated procedurally from an empty scene (Blender 4.0.x).

Conventions
  * metres, Blender Z-up, exported with the glTF "+Y up" conversion
  * an object's FRONT faces Blender -Y (three.js +Z)
  * one joined mesh per model, origin at the world origin, resting on z=0
  * no textures; Principled BSDF materials shared by name between models
"""
import bpy
import bmesh
import math
import os
import random
from math import sin, cos, pi, radians, sqrt, tan
from mathutils import Vector, Matrix, noise

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "src", "assets", "models", "props.glb"))

# --------------------------------------------------------------------------
# materials
# --------------------------------------------------------------------------
M = {}


def _lin(c):
    return ((c / 12.92) if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)


def hexcol(h):
    h = h.lstrip("#")
    return tuple(_lin(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


def make_material(name, colour, rough=0.5, metal=0.0, emit=None, strength=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    col = hexcol(colour)
    b.inputs["Base Color"].default_value = (*col, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        key = "Emission Color" if "Emission Color" in b.inputs else "Emission"
        b.inputs[key].default_value = (*hexcol(emit), 1.0)
        b.inputs["Emission Strength"].default_value = strength
    m.use_backface_culling = True  # -> glTF doubleSided:false (all meshes are closed)
    m.diffuse_color = (*col, 1.0)
    m.roughness = rough
    m.metallic = metal
    M[name] = m
    return m


def make_materials():
    make_material("tele_body", "#D8A850", 0.28)
    make_material("tele_guard", "#0B0B0C", 0.18)
    make_material("tele_neck", "#E3C48E", 0.38)
    make_material("tele_fretboard", "#CFA76C", 0.42)
    make_material("chrome", "#D9DADD", 0.14, 1.0)
    make_material("black_plastic", "#121212", 0.4)
    make_material("fabric", "#808080", 0.92)
    make_material("wood", "#4A2E1C", 0.5)
    make_material("cat_fur", "#0D0D0F", 0.75)
    make_material("cat_eyes", "#B9E23C", 0.3, 0.0, emit="#B9E23C", strength=1.0)
    make_material("pot", "#EEEAE0", 0.22)
    make_material("stem", "#5A3F28", 0.85)
    make_material("leaves", "#1E5A2B", 0.32)
    make_material("shrub", "#A8B83A", 0.85)
    make_material("bark", "#4C3B2D", 0.92)
    make_material("leaves_tree", "#2B5A27", 0.85)
    make_material("iron", "#111113", 0.38, 0.2)
    make_material("lamp_glass", "#FFF0CF", 0.25, 0.0, emit="#FFD9A0", strength=2.5)
    make_material("terracotta", "#B4583A", 0.85)


# --------------------------------------------------------------------------
# generic mesh helpers.  Every helper returns an object with an identity
# transform whose mesh data is already in its final (world) position.
# --------------------------------------------------------------------------
RX90 = Matrix.Rotation(pi / 2, 4, "X")  # local (u, v, w) -> world (u, -w, v)


def obj_from_bm(bm, name, mat, angle=40.0):
    """angle: edges sharper than this stay sharp; None = fully smooth."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = True
    if angle is not None:
        lim = radians(angle)
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > lim:
                e.smooth = False
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(M[mat])
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def xf(o, *mats):
    """Bake matrices into the mesh (applied right-to-left like a product)."""
    m = Matrix.Identity(4)
    for a in mats:
        m = m @ a
    o.data.transform(m)
    if m.determinant() < 0:
        o.data.flip_normals()
    return o


def T(x, y, z):
    return Matrix.Translation((x, y, z))


def R(deg, axis):
    return Matrix.Rotation(radians(deg), 4, axis)


def S(x, y=None, z=None):
    if y is None:
        y = z = x
    return Matrix.Diagonal((x, y, z, 1.0))


def align_z(direction):
    return Vector((0, 0, 1)).rotation_difference(Vector(direction).normalized()).to_matrix().to_4x4()


def apply_mods(o):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    old = o.data
    o.modifiers.clear()
    o.data = me
    bpy.data.meshes.remove(old)
    return o


def catmull(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                  + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)


def spline(pts, sub=6, closed=False):
    P = [Vector(p) for p in pts]
    n = len(P)
    out = []
    if closed:
        for i in range(n):
            for s in range(sub):
                out.append(catmull(P[(i - 1) % n], P[i], P[(i + 1) % n], P[(i + 2) % n], s / sub))
    else:
        for i in range(n - 1):
            for s in range(sub):
                out.append(catmull(P[max(i - 1, 0)], P[i], P[i + 1], P[min(i + 2, n - 1)], s / sub))
        out.append(P[-1])
    return out


def lathe(profile, segs=24, mat="chrome", name="lathe", angle=40.0, rfunc=None, phase=0.0):
    """Revolve (r, z) profile points round Z.  r == 0 closes with a pole."""
    bm = bmesh.new()
    rings = []
    for k, (r, z) in enumerate(profile):
        if r <= 1e-9:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            ring = []
            for i in range(segs):
                a = phase + 2 * pi * i / segs
                rr = rfunc(i, k, r) if rfunc else r
                ring.append(bm.verts.new((rr * cos(a), rr * sin(a), z)))
            rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        for i in range(segs):
            j = (i + 1) % segs
            if len(a) == 1:
                bm.faces.new((a[0], b[j], b[i]))
            elif len(b) == 1:
                bm.faces.new((a[i], a[j], b[0]))
            else:
                bm.faces.new((a[i], a[j], b[j], b[i]))
    return obj_from_bm(bm, name, mat, angle)


def prism(pts, depth, bevel=0.0, bsegs=2, mat="chrome", name="prism", angle=40.0):
    """Extrude a 2D outline (local XY) along local Z, centred, bevelled rims."""
    bm = bmesh.new()
    lo = [bm.verts.new((p[0], p[1], -depth / 2)) for p in pts]
    hi = [bm.verts.new((p[0], p[1], depth / 2)) for p in pts]
    n = len(pts)
    bm.faces.new(lo[::-1])
    bm.faces.new(hi)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0:
        edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-9]
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=bsegs, profile=0.5,
                        affect="EDGES", clamp_overlap=True)
    return obj_from_bm(bm, name, mat, angle)


def rbox(size, r, inner=(1, 1, 1), corner=2, puff=(0, 0, 0), mat="fabric", name="rbox", angle=None):
    """Rounded box with clean grid topology; `puff` bulges faces like a cushion."""
    h = [s / 2 for s in size]
    rr = [min(r, hh * 0.999) for hh in h] if not isinstance(r, (tuple, list)) else \
        [min(a, hh * 0.999) for a, hh in zip(r, h)]
    axes = []
    for ax in range(3):
        a = h[ax] - rr[ax]
        band = [a + rr[ax] * tan(radians(45.0 * k / corner)) for k in range(1, corner + 1)]
        n = inner[ax]
        mid = [-a + 2 * a * i / n for i in range(n + 1)]
        axes.append([-b for b in band[::-1]] + mid + band)
    xs, ys, zs = axes
    bm = bmesh.new()
    V = {}

    def v(i, j, k):
        key = (i, j, k)
        if key not in V:
            V[key] = bm.verts.new((xs[i], ys[j], zs[k]))
        return V[key]

    nx, ny, nz = len(xs) - 1, len(ys) - 1, len(zs) - 1
    for k in (0, nz):
        for i in range(nx):
            for j in range(ny):
                bm.faces.new((v(i, j, k), v(i + 1, j, k), v(i + 1, j + 1, k), v(i, j + 1, k)))
    for j in (0, ny):
        for i in range(nx):
            for k in range(nz):
                bm.faces.new((v(i, j, k), v(i + 1, j, k), v(i + 1, j, k + 1), v(i, j, k + 1)))
    for i in (0, nx):
        for j in range(ny):
            for k in range(nz):
                bm.faces.new((v(i, j, k), v(i, j + 1, k), v(i, j + 1, k + 1), v(i, j, k + 1)))
    for vert in bm.verts:
        p = vert.co
        inn = Vector([max(-(h[a] - rr[a]), min(h[a] - rr[a], p[a])) for a in range(3)])
        d = Vector([(p[a] - inn[a]) / rr[a] for a in range(3)])
        if d.length > 1e-9:
            d.normalize()
            p = Vector([inn[a] + d[a] * rr[a] for a in range(3)])
        q = p.copy()
        for a in range(3):
            if puff[a]:
                f = 1.0
                for b in range(3):
                    if b != a:
                        f *= 1 - (p[b] / h[b]) ** 2
                q[a] += (p[a] / h[a]) * puff[a] * f
        vert.co = q
    return obj_from_bm(bm, name, mat, angle)


def ball(centre, radii, sub=3, mat="fabric", name="ball", angle=None):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    if isinstance(radii, (int, float)):
        radii = (radii,) * 3
    o = obj_from_bm(bm, name, mat, angle)
    return xf(o, T(*centre), S(*radii))


def box(size, mat="chrome", name="box"):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    o = obj_from_bm(bm, name, mat, 30)
    return xf(o, S(*size))


def bar(p0, p1, w, d, mat="iron", name="bar"):
    """Square-section bar between two points."""
    p0, p1 = Vector(p0), Vector(p1)
    o = box((w, d, (p1 - p0).length), mat, name)
    return xf(o, Matrix.Translation((p0 + p1) / 2), align_z(p1 - p0))


def tube(pts, radii, segs=8, sub=5, smooth=True, caps=True, mat="chrome", name="tube", angle=40.0):
    P = [Vector(p) for p in pts]
    if isinstance(radii, (int, float)):
        radii = [radii] * len(P)
    if smooth and len(P) > 2:
        C, RR = [], []
        n = len(P)
        for i in range(n - 1):
            for s in range(sub):
                t = s / sub
                C.append(catmull(P[max(i - 1, 0)], P[i], P[i + 1], P[min(i + 2, n - 1)], t))
                RR.append(radii[i] * (1 - t) + radii[i + 1] * t)
        C.append(P[-1])
        RR.append(radii[-1])
    else:
        C, RR = P, list(radii)
    m = len(C)
    tang = [(C[min(i + 1, m - 1)] - C[max(i - 1, 0)]).normalized() for i in range(m)]
    nrm = tang[0].orthogonal().normalized()
    bm = bmesh.new()
    rings = []
    for i in range(m):
        if i:
            nrm = tang[i - 1].rotation_difference(tang[i]) @ nrm
            nrm = (nrm - tang[i] * nrm.dot(tang[i])).normalized()
        bn = tang[i].cross(nrm)
        rings.append([bm.verts.new(C[i] + (nrm * cos(2 * pi * k / segs) + bn * sin(2 * pi * k / segs)) * RR[i])
                      for k in range(segs)])
    for a, b in zip(rings, rings[1:]):
        for k in range(segs):
            j = (k + 1) % segs
            bm.faces.new((a[k], a[j], b[j], b[k]))
    if caps:
        for ring, c in ((rings[0], C[0]), (rings[-1], C[-1])):
            cv = bm.verts.new(c)
            for k in range(segs):
                bm.faces.new((ring[k], ring[(k + 1) % segs], cv))
    return obj_from_bm(bm, name, mat, angle)


def blob(centre, radii, sub=4, amp=0.15, freq=1.0, seed=0.0, mat="leaves_tree", name="blob"):
    """Noise-displaced icosphere (lumpy foliage mass)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    for v in bm.verts:
        d = v.co.normalized()
        n = noise.noise(d * freq + off) + 0.5 * noise.noise(d * freq * 2.3 + off * 2)
        v.co = d * (1 + amp * n)
    o = obj_from_bm(bm, name, mat, None)
    return xf(o, T(*centre), S(*radii))


DEBUG_PARTS = bool(os.environ.get("PROPS_DEBUG"))
PART_TRIS = {}


def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def finish(name, parts, weighted=True, height=None):
    """Join the parts into one mesh object called `name`, origin at world 0."""
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
        key = p.name.split(".")[0]
        PART_TRIS[key] = PART_TRIS.get(key, 0) + tri_count(p)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    me = o.data
    if hasattr(me, "use_auto_smooth"):  # Blender < 4.1
        me.use_auto_smooth = True
        me.auto_smooth_angle = pi
    if weighted:
        mod = o.modifiers.new("wn", "WEIGHTED_NORMAL")
        mod.keep_sharp = True
        mod.weight = 60
        bpy.ops.object.modifier_apply(modifier=mod.name)
    o.location = (0, 0, 0)
    if height:
        o.data.transform(S(height / max(v.co.z for v in o.data.vertices)))
        for v in o.data.vertices:
            v.co.z = max(0.0, v.co.z)
    if DEBUG_PARTS:
        print("   parts:", ", ".join("%s=%d" % kv for kv in sorted(PART_TRIS.items(), key=lambda kv: -kv[1])))
    PART_TRIS.clear()
    lo = min(v.co.z for v in o.data.vertices)
    hi = max(v.co.z for v in o.data.vertices)
    xs = [v.co.x for v in o.data.vertices]
    ys = [v.co.y for v in o.data.vertices]
    print("MODEL %-12s tris=%6d  size=(%.3f, %.3f, %.3f)  zmin=%.4f" %
          (name, tri_count(o), max(xs) - min(xs), max(ys) - min(ys), hi - lo, lo))
    return o


# --------------------------------------------------------------------------
# 1. telecaster
# --------------------------------------------------------------------------
def build_telecaster():
    parts = []
    TH = 0.045                 # body thickness
    YF = -TH / 2               # body front plane (front faces -Y)
    SCALE = 0.648              # 25.5" scale length
    Z_SADDLE = 0.150
    Z_NUT = Z_SADDLE + SCALE   # 0.798
    Z_FB_END = 0.333           # body end of the fretboard
    Y_FB = YF - 0.0095         # fretboard playing surface (centre line)
    FB_T = 0.004               # fretboard slab thickness
    R_FB = 0.24                # 9.5" fretboard radius

    def neck_w(z):             # full neck width at height z
        return 0.056 + (0.042 - 0.056) * (z - Z_FB_END) / (Z_NUT - Z_FB_END)

    def arc(x):                # fretboard camber (how far the surface drops back at x)
        return R_FB - sqrt(R_FB * R_FB - x * x)

    def front(o, x, z, lift=0.0, rot=0.0):
        """Place a part authored in local XY (thickness +Z) onto the body front."""
        return xf(o, T(x, YF - lift, z), RX90, R(rot, "Z"))

    # ---- body ----------------------------------------------------------
    ctrl = [
        (0.000, 0.000), (0.060, 0.002), (0.110, 0.014), (0.143, 0.042), (0.158, 0.080),
        (0.160, 0.118), (0.151, 0.160), (0.136, 0.200), (0.126, 0.240), (0.127, 0.280),
        (0.132, 0.315), (0.131, 0.345), (0.119, 0.364), (0.101, 0.366), (0.086, 0.352),
        (0.074, 0.333), (0.058, 0.323), (0.041, 0.328), (0.030, 0.345), (0.0265, 0.370),
        (0.020, 0.392), (0.000, 0.398), (-0.030, 0.400), (-0.062, 0.399), (-0.096, 0.388),
        (-0.122, 0.362), (-0.134, 0.325), (-0.135, 0.285), (-0.128, 0.245), (-0.129, 0.205),
        (-0.142, 0.165), (-0.157, 0.122), (-0.159, 0.080), (-0.144, 0.042), (-0.110, 0.014),
        (-0.060, 0.002),
    ]
    SUB = 3
    outline = [Vector((p.x, p.y)) for p in spline([(x, z, 0) for x, z in ctrl], SUB, closed=True)]
    zmin = min(p.y for p in outline)
    outline = [Vector((p.x, p.y - zmin)) for p in outline]
    body = prism(outline, TH, bevel=0.0045, bsegs=2, mat="tele_body", name="body", angle=35)
    parts.append(xf(body, RX90))

    def inset(pts, d):
        out = []
        n = len(pts)
        for i in range(n):
            t = (pts[(i + 1) % n] - pts[i - 1]).normalized()
            out.append(pts[i] + Vector((-t.y, t.x)) * d)
        return out

    # ---- pickguard -----------------------------------------------------
    ins = inset(outline, 0.007)
    i0, i1 = 9 * SUB + 1, 29 * SUB          # treble upper bout ... bass waist
    follow = ins[i0:i1 + 1]
    lower = spline([
        (ins[i1].x, ins[i1].y, 0), (-0.112, 0.186, 0), (-0.090, 0.176, 0), (-0.064, 0.184, 0),
        (-0.048, 0.204, 0), (-0.045, 0.2275, 0)], 4)
    notch = spline([(0.045, 0.2275, 0), (0.057, 0.2285, 0), (0.0640, 0.236, 0), (0.0685, 0.2465, 0),
                    (0.0790, 0.2545, 0), (0.0930, 0.2550, 0), (0.1060, 0.2610, 0), (0.1170, 0.2740, 0)], 3)
    guard_pts = follow + [Vector((p.x, p.y)) for p in lower[1:]] + [Vector((p.x, p.y)) for p in notch]
    guard = prism(guard_pts, 0.0022, mat="tele_guard", name="guard", angle=30)
    parts.append(xf(guard, T(0, YF - 0.0011, 0), RX90))
    for (sx, sz) in [(-0.105, 0.365), (-0.122, 0.29), (-0.110, 0.20), (-0.052, 0.20), (0.110, 0.345),
                     (0.112, 0.285), (0.045, 0.265), (-0.045, 0.345)]:
        scr = lathe([(0.0024, 0), (0.0018, 0.0007), (0, 0.0008)], 6, "chrome", "screw")
        parts.append(front(scr, sx, sz, 0.0022))

    # ---- neck pickup (chrome cover) --------------------------------------
    Z_NPU = 0.298
    npu = rbox((0.072, 0.0195, 0.022), 0.0055, mat="chrome", name="neck_pu")
    parts.append(front(npu, 0, Z_NPU, 0.0))
    for sx in (-0.041, 0.041):
        scr = lathe([(0.0026, 0), (0.002, 0.0008), (0, 0.0009)], 8, "chrome", "screw")
        parts.append(front(scr, sx, Z_NPU, 0.0022))

    # ---- bridge plate, saddles, bridge pickup ------------------------------
    BW, BZ0, BZ1 = 0.086, 0.122, 0.2275
    PT = 0.0018
    rr = 0.003
    plate_pts = []
    for cx, cz, a0 in ((BW / 2 - rr, BZ0 + rr, -90), (BW / 2 - rr, BZ1 - rr, 0),
                       (-BW / 2 + rr, BZ1 - rr, 90), (-BW / 2 + rr, BZ0 + rr, 180)):
        for k in range(4):
            a = radians(a0 + 30 * k)
            plate_pts.append((cx + rr * cos(a), cz + rr * sin(a)))
    plate = prism(plate_pts, PT, bevel=0.0004, bsegs=1, mat="chrome", name="bridge_plate")
    parts.append(xf(plate, T(0, YF - PT / 2, 0), RX90))
    WALL = 0.0105
    for (cx, cz, sx, sz) in ((-BW / 2 + PT / 2, (BZ0 + 0.172) / 2, PT, 0.172 - BZ0),
                             (BW / 2 - PT / 2, (BZ0 + 0.172) / 2, PT, 0.172 - BZ0),
                             (0, BZ0 + PT / 2, BW, PT)):
        w = box((sx, sz, WALL), "chrome", "wall")
        parts.append(front(w, cx, cz, WALL / 2))
    STR_X_BRIDGE = [(i - 2.5) * 0.0108 for i in range(6)]
    STR_X_NUT = [(i - 2.5) * 0.0070 for i in range(6)]
    Y_STR_SADDLE = Y_FB - 0.0034
    Y_STR_NUT = Y_FB - 0.0013
    SAD_R = 0.0042
    y_sad = Y_STR_SADDLE + SAD_R * 0.92
    for s in range(3):
        cx = (s - 1) * 0.0216
        zz = Z_SADDLE + (0.0012 if s == 0 else (-0.0012 if s == 2 else 0))
        sad = lathe([(0, -0.0098), (SAD_R * 0.8, -0.0098), (SAD_R, -0.009), (SAD_R, 0.009),
                     (SAD_R * 0.8, 0.0098), (0, 0.0098)], 10, "chrome", "saddle")
        parts.append(xf(sad, T(cx, y_sad, zz), R(90, "Y"), R(4, "X")))
        parts.append(tube([(cx, y_sad, zz), (cx, y_sad, BZ0 + 0.001)], 0.0013, 6, smooth=False,
                          mat="chrome", name="sad_screw"))
        hd = lathe([(0.0026, 0), (0.0026, 0.002), (0, 0.0022)], 8, "chrome", "sad_head")
        parts.append(xf(hd, T(cx, y_sad, BZ0), R(90, "X")))
        for dx in (-0.006, 0.006):
            parts.append(tube([(cx + dx, y_sad - SAD_R - 0.0006, zz), (cx + dx, YF - PT, zz)], 0.001, 5,
                              smooth=False, mat="chrome", name="grub"))
    Z_BPU, BPU_ROT = 0.193, -11.0
    bpu = rbox((0.068, 0.0185, 0.012), 0.004, mat="black_plastic", name="bridge_pu")
    parts.append(front(bpu, 0, Z_BPU, PT, BPU_ROT))
    for i in range(6):
        x = STR_X_BRIDGE[i]
        z = Z_BPU + x * tan(radians(BPU_ROT))
        pole = lathe([(0.0023, 0), (0.0023, 0.0009), (0, 0.001)], 8, "chrome", "pole")
        parts.append(front(pole, x, z, PT + 0.006))

    # ---- control plate, knobs, switch --------------------------------------
    CP0, CP1, CPR = Vector((0.109, 0.082)), Vector((0.085, 0.236)), 0.0165
    cp_len = (CP1 - CP0).length
    cp_rot = math.degrees(math.atan2(-(CP1.x - CP0.x), CP1.y - CP0.y))
    cp_c = (CP0 + CP1) / 2
    cp_pts = []
    for k in range(13):
        a = radians(180 + 15 * k)
        cp_pts.append((CPR * cos(a), -cp_len / 2 + CPR * sin(a)))
    for k in range(13):
        a = radians(15 * k)
        cp_pts.append((CPR * cos(a), cp_len / 2 + CPR * sin(a)))
    cplate = prism(cp_pts, PT, bevel=0.0005, bsegs=1, mat="chrome", name="control_plate")
    parts.append(xf(cplate, T(cp_c.x, YF - PT / 2, cp_c.y), RX90, R(cp_rot, "Z")))

    def on_plate(o, v, lift=PT, extra=None):
        d = (CP1 - CP0).normalized()
        p = cp_c + d * v
        m = [T(p.x, YF - lift, p.y), RX90, R(cp_rot, "Z")]
        if extra is not None:
            m.append(extra)
        return xf(o, *m)

    def knurl(i, k, r):
        return r * (0.93 if (i % 2 and k in (1, 2)) else 1.0)

    for v in (-0.058, -0.012):
        knob = lathe([(0.0086, 0.0), (0.0097, 0.0012), (0.0097, 0.0108), (0.0089, 0.0126),
                      (0.0068, 0.0132), (0, 0.0136)], 24, "chrome", "knob", angle=28, rfunc=knurl)
        parts.append(on_plate(knob, v))
    slot = rbox((0.0034, 0.026, 0.0012), 0.0005, corner=1, mat="black_plastic", name="slot", angle=30)
    parts.append(on_plate(slot, 0.043, PT - 0.0003))
    tip = lathe([(0.0012, 0), (0.0012, 0.006), (0.0034, 0.0066), (0.0044, 0.010), (0.0044, 0.0135),
                 (0.0032, 0.015), (0, 0.0153)], 12, "black_plastic", "switch_tip", angle=35)
    parts.append(on_plate(tip, 0.051, PT, R(-24, "X")))
    for v in (-cp_len / 2 - 0.006, cp_len / 2 + 0.006):
        scr = lathe([(0.0024, 0), (0.0018, 0.0007), (0, 0.0008)], 6, "chrome", "screw")
        parts.append(on_plate(scr, v))

    # ---- output jack cup and strap buttons (on the body rim) ---------------
    def rim_frame(idx):
        p = outline[idx]
        t = (outline[(idx + 1) % len(outline)] - outline[idx - 1]).normalized()
        return Vector((p.x, 0, p.y)), Vector((t.y, 0, -t.x))  # point, outward normal

    p, nrm = rim_frame(3 * SUB + 1)
    cup = lathe([(0.0125, -0.004), (0.0125, 0.0012), (0.0112, 0.0022), (0.0092, 0.0022), (0.0086, -0.005),
                 (0.0050, -0.005), (0.0050, -0.0005), (0.0030, -0.0005), (0.0030, -0.005), (0, -0.005)],
                12, "chrome", "jack", angle=30)
    parts.append(xf(cup, Matrix.Translation(p), align_z(nrm)))
    for idx in (0, 24 * SUB + 1):
        p, nrm = rim_frame(idx)
        btn = lathe([(0.0042, -0.002), (0.0042, 0.0045), (0.0068, 0.0068), (0.0068, 0.0092),
                     (0.0045, 0.0112), (0, 0.0116)], 10, "chrome", "strap_button", angle=35)
        parts.append(xf(btn, Matrix.Translation(p), align_z(nrm)))

    # ---- neck ------------------------------------------------------------
    Y_NT = Y_FB + FB_T          # top of the neck wood (under the fretboard)
    HS_T = 0.0145               # headstock thickness
    Y_HS = Y_NT                 # headstock face (stepped down from the fretboard)
    NSEG = 12

    def neck_section(z, w, depth, top, p):
        pts = [Vector((-w / 2, top, z)), Vector((w / 2, top, z))]
        for k in range(1, NSEG):
            a = pi * k / NSEG
            c, s = cos(a), sin(a)
            pts.append(Vector((w / 2 * math.copysign(abs(c) ** p, c), top + depth * abs(s) ** p, z)))
        return pts

    secs = [
        neck_section(Z_FB_END, neck_w(Z_FB_END), 0.0215, Y_NT, 0.55),
        neck_section(0.42, neck_w(0.42), 0.0215, Y_NT, 0.62),
        neck_section(0.76, neck_w(0.76), 0.0185, Y_NT, 0.7),
        neck_section(Z_NUT, 0.042, 0.018, Y_NT, 0.7),
        neck_section(Z_NUT + 0.016, 0.042, 0.016, Y_NT + 0.0004, 0.6),
        neck_section(Z_NUT + 0.040, 0.043, HS_T - 0.0006, Y_NT + 0.0004, 0.35),
    ]
    bm = bmesh.new()
    rings = [[bm.verts.new(p) for p in sec] for sec in secs]
    for a, b in zip(rings, rings[1:]):
        for k in range(len(a)):
            j = (k + 1) % len(a)
            bm.faces.new((a[k], a[j], b[j], b[k]))
    bm.faces.new(rings[0])
    bm.faces.new(rings[-1][::-1])
    parts.append(obj_from_bm(bm, "neck", "tele_neck", 50))

    plate = rbox((0.051, 0.064, 0.0016), 0.0006, corner=1, mat="chrome", name="neck_plate", angle=30)
    parts.append(xf(plate, T(0, -YF + 0.0006, 0.360)))
    for sx in (-0.018, 0.018):
        for sz in (-0.024, 0.024):
            scr = lathe([(0.0034, 0), (0.0026, 0.0009), (0, 0.0011)], 8, "chrome", "screw")
            parts.append(xf(scr, T(sx, -YF + 0.0013, 0.360 + sz), R(-90, "X")))

    # fretboard: cambered slab
    NX = 8
    bm = bmesh.new()
    rings = []
    for z in (Z_FB_END, Z_NUT):
        w = neck_w(z)
        ring = [bm.verts.new((-w / 2 + w * k / NX, Y_FB + arc(-w / 2 + w * k / NX), z)) for k in range(NX + 1)]
        ring += [bm.verts.new((w / 2, Y_NT + 0.0002, z)), bm.verts.new((-w / 2, Y_NT + 0.0002, z))]
        rings.append(ring)
    a, b = rings
    for k in range(len(a)):
        j = (k + 1) % len(a)
        bm.faces.new((a[k], a[j], b[j], b[k]))
    bm.faces.new(a)
    bm.faces.new(b[::-1])
    parts.append(obj_from_bm(bm, "fretboard", "tele_fretboard", 30))

    # frets
    def fret_z(n):
        return Z_NUT - SCALE * (1 - 2 ** (-n / 12.0))

    for n in range(1, 22):
        z = fret_z(n)
        w = neck_w(z) - 0.0006
        bm = bmesh.new()
        rows = []
        for k in range(4):
            x = -w / 2 + w * k / 3
            y = Y_FB + arc(x)
            end = 0.0006 if k in (0, 3) else 0.0
            rows.append([bm.verts.new((x, y + 0.0002, z - 0.0011)),
                         bm.verts.new((x, y - 0.0011 + end, z - 0.0004)),
                         bm.verts.new((x, y - 0.0011 + end, z + 0.0004)),
                         bm.verts.new((x, y + 0.0002, z + 0.0011))])
        for ra, rb in zip(rows, rows[1:]):
            for k in range(3):
                bm.faces.new((ra[k], ra[k + 1], rb[k + 1], rb[k]))
        bm.faces.new(rows[0])
        bm.faces.new(rows[-1][::-1])
        parts.append(obj_from_bm(bm, "fret", "chrome", None))

    # dot inlays
    for n in (3, 5, 7, 9, 12, 15, 17, 19, 21):
        z = (fret_z(n) + fret_z(n - 1)) / 2
        for x in ((-0.0105, 0.0105) if n == 12 else (0.0,)):
            dot = lathe([(0.0031, -0.0005), (0.0031, 0.00035), (0, 0.00035)], 8, "black_plastic", "dot", angle=30)
            parts.append(xf(dot, T(x, Y_FB + arc(x), z), RX90))

    # nut
    nut = rbox((0.042, 0.0038, 0.0058), 0.0008, corner=1, mat="black_plastic", name="nut", angle=30)
    parts.append(xf(nut, T(0, Y_NT - 0.0058 / 2 + 0.0004, Z_NUT + 0.0019)))

    # ---- headstock -------------------------------------------------------
    hs_ctrl = [
        (0.0205, 0.004), (0.0208, 0.030), (0.0210, 0.070), (0.0208, 0.108), (0.0195, 0.130),
        (0.0150, 0.143), (0.0118, 0.151), (0.0135, 0.159), (0.0195, 0.163), (0.0245, 0.169),
        (0.0262, 0.178), (0.0225, 0.187), (0.0130, 0.192), (0.0000, 0.191), (-0.0170, 0.186),
        (-0.0320, 0.180), (-0.0425, 0.172), (-0.0465, 0.158), (-0.0460, 0.110), (-0.0450, 0.070), (-0.0415, 0.044),
        (-0.0330, 0.024), (-0.0240, 0.011), (-0.0205, 0.004),
    ]
    hs_pts = [Vector((p.x, p.y)) for p in spline([(x, z, 0) for x, z in hs_ctrl], 3, closed=True)]
    top = max(p.y for p in hs_pts)
    hs_scale = (0.990 - Z_NUT) / top          # overall length 0.99 m
    hs_pts = [Vector((p.x, p.y * hs_scale)) for p in hs_pts]
    head = prism(hs_pts, HS_T, bevel=0.0014, bsegs=1, mat="tele_neck", name="headstock", angle=35)
    parts.append(xf(head, T(0, Y_HS + HS_T / 2, Z_NUT), RX90))

    # tuners: six in line on the bass side
    POST_X = -0.0295
    post_z = [Z_NUT + (0.040 + 0.0242 * i) * hs_scale for i in range(6)]
    Y_HS_BACK = Y_HS + HS_T
    for z in post_z:
        post = lathe([(0.0052, 0), (0.0052, 0.0012), (0.0030, 0.0020), (0.0033, 0.0096),
                      (0, 0.0102)], 8, "chrome", "post", angle=35)
        parts.append(xf(post, T(POST_X, Y_HS, z), RX90))
        hous = box((0.0165, 0.0195, 0.0085), "chrome", "tuner_housing")
        parts.append(xf(hous, T(POST_X - 0.001, Y_HS_BACK + 0.0085 / 2 - 0.0005, z), RX90))
        ys = Y_HS_BACK + 0.0045
        parts.append(tube([(POST_X - 0.008, ys, z), (-0.056, ys, z)], 0.0017, 6, smooth=False,
                          mat="chrome", name="tuner_shaft"))
        key = ball((-0.0625, ys, z), (0.0085, 0.0036, 0.0076), sub=2, mat="chrome", name="tuner_key")
        parts.append(key)
    tree = lathe([(0.0035, 0), (0.0035, 0.0028), (0.0045, 0.0032), (0.0045, 0.0042), (0, 0.0044)], 10, "chrome", "tree")
    parts.append(xf(tree, T(0.003, Y_HS, Z_NUT + 0.088 * hs_scale), RX90))

    # ---- strings ---------------------------------------------------------
    gauges = [0.00062, 0.00054, 0.00046, 0.00038, 0.00033, 0.0003]
    for i in range(6):
        xb, xn = STR_X_BRIDGE[i], STR_X_NUT[i]
        pz = post_z[i]
        pts = [(xb, YF - PT, BZ0 + 0.012), (xb, Y_STR_SADDLE + arc(xb) * 0.3, Z_SADDLE),
               (xn, Y_STR_NUT + arc(xn), Z_NUT + 0.002), (POST_X + 0.0028, Y_HS - 0.0055, pz)]
        parts.append(tube(pts, gauges[i], 5, smooth=False, caps=False, mat="chrome", name="string", angle=None))

    return finish("telecaster", parts)


# --------------------------------------------------------------------------
# 2/3. armchair and sofa
# --------------------------------------------------------------------------
def build_seating(name, width, seats, height):
    parts = []
    hw = width / 2
    # rolled arms: keyhole profile (panel + roll) extruded front to back
    def arm(side):
        cx, cz, r = 0.022, 0.515, 0.095
        pts = [(-0.068, 0.105), (0.068, 0.105)]
        a0 = math.atan2(-sqrt(r * r - (0.068 - cx) ** 2), 0.068 - cx)
        a1 = pi + math.asin(sqrt(r * r - (0.068 + cx) ** 2) / r)
        pts.append((0.068, cz + r * sin(a0) - 0.03))
        n = 20
        for k in range(n + 1):
            a = a0 + (a1 - a0) * k / n
            pts.append((cx + r * cos(a), cz + r * sin(a)))
        pts.append((-0.068, cz + r * sin(a1) - 0.03))
        o = prism(pts, 0.76, bevel=0.028, bsegs=4, mat="fabric", name="arm", angle=60)
        m = [T(side * (hw - 0.118), -0.065, 0), RX90]
        if side < 0:
            m.insert(1, S(-1, 1, 1))
        return xf(o, *m)

    parts += [arm(1), arm(-1)]
    inner = hw - 0.118 - 0.068           # inner face of each arm
    sw = 2 * inner                        # clear seat width
    # seat platform
    base = rbox((sw + 0.05, 0.78, 0.17), 0.03, inner=(2, 2, 1), mat="fabric", name="base")
    parts.append(xf(base, T(0, -0.03, 0.105 + 0.085)))
    # back frame, leaning back a little, with a soft rounded top
    back = rbox((width - 0.04, 0.17, height - 0.105), (0.06, 0.07, 0.07), inner=(3, 1, 3),
                puff=(0, 0.012, 0), mat="fabric", name="back")
    parts.append(xf(back, T(0, 0.365 - 0.012, 0.105), R(-5, "X"), T(0, 0, (height - 0.105) / 2)))
    # loose cushions
    gap = 0.008
    cw = (sw - gap * (seats + 1)) / seats
    for s in range(seats):
        x = -sw / 2 + gap + cw / 2 + s * (cw + gap)
        seat = rbox((cw, 0.63, 0.15), 0.05, inner=(4, 4, 1), corner=3, puff=(0.004, 0.006, 0.022),
                    mat="fabric", name="seat_cushion")
        parts.append(xf(seat, T(x, -0.105, 0.327), R(-1.5, "X")))
        bc = rbox((cw, 0.17, 0.44), (0.06, 0.07, 0.07), inner=(4, 1, 4), corner=3,
                  puff=(0.004, 0.035, 0.006), mat="fabric", name="back_cushion")
        parts.append(xf(bc, T(x, 0.185, 0.395), R(-13, "X"), T(0, 0, 0.22)))
    # turned legs
    leg_prof = [(0, 0), (0.017, 0), (0.021, 0.006), (0.021, 0.014), (0.017, 0.024), (0.022, 0.05),
                (0.031, 0.078), (0.031, 0.086), (0.026, 0.092), (0.036, 0.098), (0.036, 0.112), (0, 0.112)]
    for sx in (-1, 1):
        for y in (-0.37, 0.37):
            leg = lathe(leg_prof, 14, "wood", "leg", angle=50)
            parts.append(xf(leg, T(sx * (hw - 0.085), y, 0)))
    return finish(name, parts)


# --------------------------------------------------------------------------
# 4. beanbag
# --------------------------------------------------------------------------
def build_beanbag():
    prof = spline([(0.0, 0, 0), (0.20, 0, 0), (0.345, 0.004, 0), (0.445, 0.060, 0), (0.475, 0.170, 0),
                   (0.445, 0.300, 0), (0.360, 0.430, 0), (0.230, 0.535, 0), (0.095, 0.590, 0), (0, 0.602, 0)], 3)
    prof = [(max(0.0, q.x), max(0.0, q.y)) for q in prof]
    prof[0] = (0.0, 0.0)
    prof[-1] = (0.0, prof[-1][1])
    o = lathe(prof, 96, "fabric", "beanbag", angle=None)
    me = o.data
    C, RC = Vector((0.0, -0.20, 0.585)), 0.30       # the hollow someone left when they got up
    for v in me.vertices:
        p = v.co.copy()
        th = math.atan2(p.y, p.x)
        rad = Vector((p.x, p.y, 0))
        hmask = sin(pi * min(1.0, p.z / 0.602)) ** 0.5 if p.z > 0 else 0.0
        # six sewn panels: pinched seams, slightly bulging panels
        d = ((th + pi / 6) % (pi / 3)) - pi / 6
        k = 1 - 0.035 * math.exp(-(d / 0.07) ** 2) * hmask + 0.012 * cos(6 * th) * hmask
        # soft diagonal sag folds round the lower half
        low = max(0.0, 1 - p.z / 0.34) * min(1.0, p.z / 0.04)
        fold = max(0.0, sin(th * 7 + p.z * 16 + 2.5 * noise.noise(Vector((p.x * 3, p.y * 3, p.z * 3))))) ** 2
        k -= 0.035 * fold * low
        k += 0.03 * noise.noise(p * 2.6 + Vector((3, 1, 7))) * hmask
        p.x, p.y = p.x * k, p.y * k
        # slump: the top leans back
        p.y += 0.10 * (p.z / 0.6) ** 1.6
        # dented seat
        w = p - C
        dist = w.length
        if dist < RC:
            p = C + w / dist * (dist + (RC - dist) * 0.92)
        # wrinkles radiating from the dent
        wr = noise.noise(Vector((th * 2.2, p.z * 9, 1.7)))
        p -= rad.normalized() * 0.010 * (1 - min(1.0, abs(wr) * 4)) ** 2 * hmask if rad.length > 1e-6 else Vector()
        v.co = p
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    xs = [v.co.x for v in bm.verts]
    ys = [v.co.y for v in bm.verts]
    zs = [v.co.z for v in bm.verts]
    sx = 0.95 / (max(xs) - min(xs))
    sz = 0.60 / (max(zs) - min(zs))
    yc = (max(ys) + min(ys)) / 2
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, (v.co.y - yc) * sx, max(0.0, (v.co.z - min(zs)) * sz - 0.003)))
    bm.to_mesh(me)
    bm.free()
    return finish("beanbag", [o], weighted=False)


# --------------------------------------------------------------------------
# 5. cat
# --------------------------------------------------------------------------
def build_cat():
    fur = []
    b = lambda c, r: fur.append(ball(c, r, 3, "cat_fur"))
    # torso: pear shaped, leaning slightly forward
    b((0, 0.035, 0.115), (0.098, 0.125, 0.115))
    b((0, 0.020, 0.185), (0.084, 0.100, 0.110))
    b((0, -0.010, 0.250), (0.068, 0.076, 0.085))
    b((0, -0.030, 0.295), (0.052, 0.056, 0.050))      # neck
    b((0, -0.055, 0.215), (0.055, 0.045, 0.075))      # chest
    # haunches and hind feet
    for s in (-1, 1):
        b((s * 0.082, 0.030, 0.085), (0.058, 0.105, 0.085))
        b((s * 0.090, -0.075, 0.017), (0.026, 0.048, 0.017))
        # front legs and paws (together, in front)
        fur.append(tube([(s * 0.034, -0.050, 0.235), (s * 0.031, -0.082, 0.12), (s * 0.028, -0.090, 0.02)],
                        [0.030, 0.023, 0.020], 10, mat="cat_fur", name="leg"))
        b((s * 0.028, -0.108, 0.015), (0.024, 0.034, 0.015))
        # cheeks
        b((s * 0.030, -0.078, 0.322), (0.034, 0.034, 0.028))
        # ears
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.042, radius2=0.004, depth=0.092)
        ear = obj_from_bm(bm, "ear", "cat_fur", None)
        fur.append(xf(ear, T(s * 0.044, -0.040, 0.402), R(s * 17, "Y"), R(8, "X"), S(1, 0.55, 1)))
    # head and muzzle
    b((0, -0.048, 0.347), (0.070, 0.062, 0.058))
    b((0, -0.100, 0.325), (0.027, 0.020, 0.019))
    b((0, -0.112, 0.333), (0.008, 0.007, 0.006))      # nose
    # tail curled round to the cat's left (viewer's right)
    fur.append(tube([(0.0, 0.140, 0.035), (0.085, 0.160, 0.030), (0.155, 0.110, 0.028), (0.180, 0.020, 0.027),
                     (0.160, -0.070, 0.026), (0.105, -0.125, 0.024), (0.040, -0.150, 0.022)],
                    [0.028, 0.027, 0.026, 0.025, 0.023, 0.021, 0.016], 10, mat="cat_fur", name="tail"))
    b((0.036, -0.151, 0.022), (0.018, 0.016, 0.016))
    bpy.ops.object.select_all(action="DESELECT")
    for p in fur:
        p.select_set(True)
    bpy.context.view_layer.objects.active = fur[0]
    bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    # fuse the blobs into one skin, relax, then reduce
    m = body.modifiers.new("remesh", "REMESH")
    m.mode = "VOXEL"
    m.voxel_size = 0.0055
    m.use_smooth_shade = True
    m = body.modifiers.new("smooth", "SMOOTH")
    m.factor = 0.6
    m.iterations = 6
    apply_mods(body)
    target = 6000
    m = body.modifiers.new("dec", "DECIMATE")
    m.ratio = min(1.0, target / max(1, tri_count(body)))
    apply_mods(body)
    lo = min(v.co.z for v in body.data.vertices)
    hi = max(v.co.z for v in body.data.vertices)
    body.data.transform(T(0, 0, -lo))
    sc = 0.42 / (hi - lo)
    body.data.transform(S(sc))
    for p in body.data.polygons:
        p.use_smooth = True
    for e in body.data.edges:
        e.use_edge_sharp = False
    parts = [body]
    for s in (-1, 1):
        eye = ball((0, 0, 0), (0.0125, 0.007, 0.0085), 3, "cat_eyes", "eye")
        parts.append(xf(eye, S(sc), T(s * 0.028, -0.0975, 0.353 - lo), R(s * 12, "Y"), R(s * -18, "Z")))
        pupil = ball((0, 0, 0), (0.0028, 0.003, 0.0075), 2, "cat_fur", "pupil")
        parts.append(xf(pupil, S(sc), T(s * 0.0285, -0.1035, 0.353 - lo), R(s * -18, "Z")))
    return finish("cat", parts, weighted=False)


# --------------------------------------------------------------------------
# 6. plant
# --------------------------------------------------------------------------
def make_leaf(length, half_w, fold=0.32, droop=0.25, nu=4, nv=9):
    bm = bmesh.new()
    rows = []
    for j in range(nv + 1):
        t = j / nv
        w = half_w * (sin(pi * t ** 0.85) ** 0.62) * (1.0 - 0.25 * (1 - t)) if 0 < t < 1 else 0.0
        if j == nv:
            rows.append([bm.verts.new((0, length, -droop * length))])
            continue
        if j == 0:
            w = half_w * 0.10
        row = []
        for i in range(nu + 1):
            u = -1 + 2 * i / nu
            wave = 0.012 * sin(t * 9 + i) * abs(u)
            z = fold * abs(u) * w - droop * length * t * t + wave
            row.append(bm.verts.new((u * w, t * length, z)))
        rows.append(row)
    for a, b in zip(rows, rows[1:]):
        if len(b) == 1:
            for i in range(nu):
                bm.faces.new((a[i], a[i + 1], b[0]))
        else:
            for i in range(nu):
                bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    o = obj_from_bm(bm, "leaf", "leaves", None)
    m = o.modifiers.new("sol", "SOLIDIFY")
    m.thickness = 0.004
    m.offset = 0.0
    apply_mods(o)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def build_plant():
    rnd = random.Random(7)
    parts = []
    pot = lathe([(0, 0), (0.105, 0), (0.116, 0.008), (0.160, 0.262), (0.172, 0.268), (0.172, 0.296),
                 (0.166, 0.304), (0.156, 0.304), (0.151, 0.296), (0.148, 0.262)], 32, "pot", "pot", angle=35)
    parts.append(pot)
    parts.append(lathe([(0.149, 0.270), (0.10, 0.276), (0, 0.279)], 32, "stem", "soil", angle=None))
    stems = [
        ([(0.00, 0.01, 0.25), (0.015, 0.02, 0.55), (-0.02, 0.0, 0.85), (0.01, -0.01, 1.14)], [0.017, 0.015, 0.012, 0.007], 9),
        ([(0.05, -0.03, 0.25), (0.11, -0.07, 0.50), (0.16, -0.10, 0.74), (0.17, -0.12, 0.92)], [0.013, 0.012, 0.009, 0.006], 6),
        ([(-0.05, 0.03, 0.25), (-0.12, 0.07, 0.46), (-0.17, 0.11, 0.66), (-0.19, 0.13, 0.80)], [0.012, 0.011, 0.008, 0.006], 5),
    ]
    phi = rnd.uniform(0, 360)
    for pts, radii, nleaf in stems:
        parts.append(tube(pts, radii, 8, sub=5, mat="stem", name="stem", angle=None))
        path = spline(pts, 12)
        for k in range(nleaf):
            f = 0.22 + 0.78 * (k + 0.5) / nleaf if k < nleaf - 1 else 1.0
            p = path[min(len(path) - 1, int(f * (len(path) - 1)))]
            phi += 137.5
            top = (k == nleaf - 1)
            elev = 68 if top else rnd.uniform(18, 40) + 14 * f
            L = (0.24 if top else rnd.uniform(0.32, 0.39)) * (1.0 - 0.15 * f)
            W = L * rnd.uniform(0.29, 0.33)
            leaf = make_leaf(L, W, fold=rnd.uniform(0.25, 0.38), droop=0.08 if top else rnd.uniform(0.16, 0.28))
            pet = 0.045
            m = Matrix.Translation(p) @ R(phi - 90, "Z") @ R(elev, "X")
            parts.append(xf(leaf, m, T(0, pet, 0), R(rnd.uniform(-12, 12), "Y")))
            a = m @ Vector((0, 0, 0))
            bpt = m @ Vector((0, pet + 0.02, 0.002))
            parts.append(tube([a, bpt], [0.004, 0.003], 5, smooth=False, mat="leaves", name="petiole", angle=None))
    return finish("plant", parts)


# --------------------------------------------------------------------------
# 7. shrub
# --------------------------------------------------------------------------
def build_shrub():
    rnd = random.Random(3)
    parts = []
    H = 1.56

    def radius(h):                      # h: 0 bottom .. 1 top
        return 0.46 * (1 - h) ** 0.62 * (1 - 0.40 * math.exp(-h / 0.07)) + 0.01

    # dense core: a lumpy cone with upward-sweeping billows
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=5, radius=1.0)
    for v in bm.verts:
        d = v.co.normalized()
        h = ((d.z + 1) / 2) ** 0.9
        th = math.atan2(d.y, d.x)
        c, sn = cos(th), sin(th)
        big = noise.noise(Vector((c * 1.5, sn * 1.5, h * 4.0)))
        # billows: cells sheared upwards so they read as sprays of foliage
        q = Vector((c * 4.2, sn * 4.2, h * 9.0 - 1.6 * radius(h)))
        cell = 1 - min(1.0, noise.cell_vector(q * 1.0).length) if False else abs(noise.noise(q))
        lump = (1 - cell * 2.0)
        lump = max(-1.0, lump)
        r = radius(h) * (1 + 0.16 * big + 0.13 * lump)
        v.co = Vector((r * c, r * sn, H * h))
    parts.append(obj_from_bm(bm, "core", "shrub", None))
    # softer, rounder sprays breaking up the silhouette
    N = 34
    for i in range(N):
        h = 0.03 + 0.87 * ((i + 0.5) / N) ** 0.9
        th = i * 2.39996 + rnd.uniform(-0.3, 0.3)
        r = radius(h) * rnd.uniform(0.62, 0.78)
        size = (0.20 - 0.10 * h) * rnd.uniform(0.9, 1.2)
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        for v in bm.verts:                 # teardrop: fat low down, soft tip
            d = v.co.normalized()
            t = (d.z + 1) / 2
            w = (sin(pi * t ** 0.62) ** 0.75) if 0 < t < 1 else 0.0
            hxy = max(1e-6, sqrt(d.x * d.x + d.y * d.y))
            v.co = Vector((d.x / hxy * w * 0.62, d.y / hxy * w * 0.62, t * 1.7 - 0.5))
        tuft = obj_from_bm(bm, "tuft", "shrub", None)
        tilt = rnd.uniform(6, 16) + 10 * (1 - h)
        parts.append(xf(tuft, T(r * cos(th), r * sin(th), H * h), R(math.degrees(th) - 90, "Z"),
                        R(-tilt, "X"), S(size, size * 0.9, size * 1.25)))
    parts.append(ball((0.01, 0.0, 1.50), (0.04, 0.04, 0.10), 2, "shrub", "tip"))
    return finish("shrub", parts, weighted=False, height=1.6)


# --------------------------------------------------------------------------
# 8. tree
# --------------------------------------------------------------------------
def build_tree():
    parts = []
    trunk = tube([(0, 0, 0.0), (0.01, 0.0, 0.14), (0.03, 0.01, 0.7), (-0.02, 0.02, 1.3), (0.02, -0.01, 1.85)],
                 [0.34, 0.235, 0.185, 0.165, 0.150], 12, sub=5, mat="bark", name="trunk", angle=None)
    for v in trunk.data.vertices:      # root flare with a little irregularity
        if v.co.z < 0.5:
            a = math.atan2(v.co.y, v.co.x)
            k = 1 + 0.16 * (1 - v.co.z / 0.5) * cos(5 * a + 0.6)
            v.co.x *= k
            v.co.y *= k
        v.co.z = max(v.co.z, 0.0)
    parts.append(trunk)
    fork = Vector((0.02, -0.01, 1.80))
    branches = [
        ([(0.30, 0.10, 2.35), (0.90, 0.28, 3.05), (1.35, 0.40, 3.75)], [0.125, 0.10, 0.07, 0.035]),
        ([(-0.34, 0.05, 2.30), (-0.95, 0.15, 3.00), (-1.40, 0.10, 3.80)], [0.125, 0.10, 0.07, 0.035]),
        ([(0.05, -0.32, 2.30), (0.22, -0.85, 2.95), (0.32, -1.20, 3.65)], [0.115, 0.09, 0.065, 0.03]),
        ([(-0.05, 0.32, 2.35), (-0.22, 0.85, 3.00), (-0.15, 1.20, 3.75)], [0.115, 0.09, 0.065, 0.03]),
        ([(0.03, 0.02, 2.60), (-0.05, 0.0, 3.50), (0.05, 0.05, 4.50)], [0.135, 0.11, 0.08, 0.04]),
    ]
    for pts, radii in branches:
        parts.append(tube([fork - Vector((0, 0, 0.12))] + [Vector(p) for p in pts], radii, 8, sub=4,
                          mat="bark", name="branch", angle=None))
    crown = [
        ((0.05, 0.05, 4.50), (1.40, 1.35, 1.05), 4, 1.0),
        ((1.25, 0.40, 4.05), (1.05, 1.00, 0.80), 4, 2.0),
        ((-1.30, 0.10, 4.10), (1.05, 1.05, 0.82), 4, 3.0),
        ((0.30, -1.20, 3.95), (1.00, 0.95, 0.76), 4, 4.0),
        ((-0.20, 1.20, 4.05), (1.00, 0.95, 0.78), 4, 5.0),
        ((0.15, 0.00, 5.20), (0.95, 0.92, 0.62), 3, 6.0),
        ((-0.75, -0.80, 4.60), (0.80, 0.80, 0.62), 3, 7.0),
        ((0.85, 0.85, 4.65), (0.80, 0.78, 0.60), 3, 8.0),
    ]
    for c, r, sub, seed in crown:
        parts.append(blob(c, r, sub, amp=0.22, freq=1.7, seed=seed, mat="leaves_tree"))
    return finish("tree", parts, weighted=False, height=5.5)


# --------------------------------------------------------------------------
# 9. street lamp
# --------------------------------------------------------------------------
def build_street_lamp():
    parts = []
    SEG = 48
    prof = [(0, 0), (0.205, 0), (0.205, 0.05), (0.19, 0.07), (0.165, 0.08), (0.165, 0.13), (0.15, 0.15),
            (0.125, 0.165), (0.118, 0.19), (0.118, 0.70), (0.128, 0.72), (0.14, 0.735), (0.14, 0.775),
            (0.12, 0.79), (0.095, 0.82), (0.078, 0.87), (0.090, 0.885), (0.090, 0.915), (0.072, 0.93),
            (0.066, 0.96), (0.047, 2.50), (0.060, 2.515), (0.066, 2.535), (0.066, 2.565), (0.052, 2.585),
            (0.043, 2.62), (0.040, 2.90), (0.046, 2.93), (0.070, 2.975), (0.085, 2.99), (0.085, 3.005), (0, 3.005)]
    flute_rows = (19, 20)                 # the long slender shaft
    panel_rows = (8, 9)                   # pedestal

    def flutes(i, k, r):
        if k in flute_rows:
            return r * (1 - 0.13 * (0.5 + 0.5 * cos(2 * pi * i / SEG * 12)) ** 1.5)
        if k in panel_rows:
            return r * (1 - 0.06 * (0.5 + 0.5 * cos(2 * pi * i / SEG * 8)) ** 3)
        return r

    parts.append(lathe(prof, SEG, "iron", "column", angle=32, rfunc=flutes))
    # ladder bar
    zb = 2.76
    ladder = lathe([(0, -0.31), (0.022, -0.305), (0.028, -0.285), (0.022, -0.265), (0.013, -0.255),
                    (0.013, 0.255), (0.022, 0.265), (0.028, 0.285), (0.022, 0.305), (0, 0.31)],
                   12, "iron", "ladder_bar", angle=40)
    parts.append(xf(ladder, T(0, 0, zb), R(90, "Y")))
    parts.append(lathe([(0.043, zb - 0.045), (0.06, zb - 0.03), (0.06, zb + 0.03), (0.043, zb + 0.045)],
                       24, "iron", "bar_collar", angle=35))
    # lantern: four-sided, wider at the top
    z0, z1 = 3.005, 3.36
    a0, a1 = 0.085, 0.175                 # half widths at bottom / top
    d = sqrt(2)
    glass = lathe([(0, z0 + 0.01), (a0 * d - 0.006, z0 + 0.01), (a1 * d - 0.006, z1), (0, z1)], 4, "lamp_glass",
                  "glass", angle=30, phase=pi / 4)
    parts.append(glass)
    parts.append(xf(box((2 * a0 + 0.02, 2 * a0 + 0.02, 0.022), "iron", "lantern_base"), T(0, 0, z0 + 0.008)))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(bar((sx * a0, sy * a0, z0), (sx * a1, sy * a1, z1), 0.02, 0.02, "iron", "corner"))
    for (sx, sy) in ((1, 0), (-1, 0), (0, 1), (0, -1)):   # glazing bar in the middle of each pane
        parts.append(bar((sx * a0, sy * a0, z0), (sx * a1, sy * a1, z1), 0.008, 0.008, "iron", "glazing"))
    parts.append(xf(box((2 * a1 + 0.035, 2 * a1 + 0.035, 0.026), "iron", "lantern_top"), T(0, 0, z1 + 0.006)))
    # roof (ogee pyramid), vent and finial
    ar = a1 + 0.035
    roof = lathe([(0, z1 + 0.015), (ar * d, z1 + 0.015), (ar * d, z1 + 0.027), (0.150 * d, z1 + 0.060),
                  (0.100 * d, z1 + 0.105), (0.066 * d, z1 + 0.135), (0.052 * d, z1 + 0.150), (0, z1 + 0.150)],
                 4, "iron", "roof", angle=25, phase=pi / 4)
    parts.append(roof)
    zt = z1 + 0.148
    parts.append(lathe([(0.062, zt), (0.070, zt + 0.006), (0.070, zt + 0.022), (0.050, zt + 0.032),
                        (0.030, zt + 0.040), (0.018, zt + 0.052), (0.030, zt + 0.064), (0.032, zt + 0.074),
                        (0.022, zt + 0.086), (0.010, zt + 0.094), (0.006, zt + 0.110), (0, zt + 0.118)],
                       16, "iron", "finial", angle=40))
    return finish("street_lamp", parts, height=3.6)


# --------------------------------------------------------------------------
# 10. chimney pot
# --------------------------------------------------------------------------
def build_chimney_pot():
    prof = [(0, 0), (0.130, 0), (0.130, 0.045), (0.124, 0.055), (0.119, 0.060), (0.110, 0.200),
            (0.113, 0.206), (0.116, 0.214), (0.113, 0.222), (0.108, 0.228),
            (0.097, 0.440), (0.101, 0.447), (0.110, 0.456), (0.115, 0.468), (0.115, 0.482), (0.110, 0.493),
            (0.101, 0.500), (0.092, 0.500), (0.085, 0.494), (0.082, 0.482), (0.084, 0.200), (0, 0.200)]
    o = lathe(prof, 36, "terracotta", "chimney_pot", angle=50)
    return finish("chimney_pot", [o])


# --------------------------------------------------------------------------
def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    make_materials()
    objs = [
        build_telecaster(),
        build_seating("armchair", 0.90, 1, 0.85),
        build_seating("sofa", 1.90, 2, 0.82),
        build_beanbag(),
        build_cat(),
        build_plant(),
        build_shrub(),
        build_tree(),
        build_street_lamp(),
        build_chimney_pot(),
    ]
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)
    print("-" * 60)
    total = 0
    for o in objs:
        n = tri_count(o)
        total += n
        print("TRIS %-12s %6d   materials: %s" % (o.name, n, ", ".join(s.material.name for s in o.material_slots)))
    print("TRIS %-12s %6d" % ("total", total))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=OUT, export_format="GLB", use_selection=False, export_apply=True, export_yup=True,
        export_normals=True, export_texcoords=False, export_tangents=False, export_materials="EXPORT",
        export_cameras=False, export_lights=False, export_animations=False, export_extras=False)
    print("WROTE %s  (%.1f kB)" % (OUT, os.path.getsize(OUT) / 1024.0))


if __name__ == "__main__":
    main()
