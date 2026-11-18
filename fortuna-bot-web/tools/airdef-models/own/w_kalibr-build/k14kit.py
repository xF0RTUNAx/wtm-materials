# k14kit.py — кирпичи ракеты 3М14 (из aimkit.py AIM-260): материалы K14_*, построитель B, тела вращения. Метры, нос +Y (glTF −Z), вверх +Z, начало на оси посередине длины.
# Метры, нос +Y (glTF −Z), вверх +Z, начало — на оси посередине длины.
import bpy, bmesh, math
from mathutils import Vector, Matrix

PFX = 'K14'
(M_BODY, M_RADOME, M_FIN, M_DARK, M_STEEL, M_NOZZLE) = range(6)
# основа для кадров формы; окраска - _paint.py (светло-серый корпус, обтекатель слоновой кости, тёмно-серые перья, пояса)
_SPEC = [('body', (0.62, 0.63, 0.62), 0.50, 0.0),          # корпус белый/светло-серый (фото 02-06)
         ('radome', (0.20, 0.21, 0.22), 0.45, 0.0),        # нос серый (фото 02, 03, 05, 06)
         ('fin', (0.60, 0.61, 0.60), 0.50, 0.0),
         ('dark', (0.03, 0.03, 0.03), 0.60, 0.0),
         ('steel', (0.40, 0.40, 0.41), 0.35, 0.85),
         ('nozzle', (0.04, 0.035, 0.03), 0.70, 0.5)]
MATS = []


def make_mats():
    MATS.clear()
    for n, c, r, mt in _SPEC:
        nm = f'{PFX}_{n}'; m = bpy.data.materials.get(nm) or bpy.data.materials.new(nm); m.use_nodes = True
        b = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
        b.inputs['Base Color'].default_value = (*c, 1); b.inputs['Roughness'].default_value = r; b.inputs['Metallic'].default_value = mt
        if n == 'glass':
            b.inputs['Alpha'].default_value = 0.14                     # прозрачнее и без сильного лака: на пробе с небом блик засвечивал сетку и оптику (фото 01 - видно насквозь)
            try: b.inputs['Specular IOR Level'].default_value = 0.5; b.inputs['Coat Weight'].default_value = 0.15; b.inputs['Coat Roughness'].default_value = 0.03
            except Exception: pass
            try: m.surface_render_method = 'BLENDED'; m.use_backface_culling = False
            except Exception: m.blend_method = 'BLEND'
        m.diffuse_color = (*c, 1); MATS.append(m)


def V(x, y, z): return Vector((x, y, z))


class B:
    """Построитель одного объекта (bmesh); finish(col) — объект с нормалями наружу и резкими рёбрами круче sharp°."""
    def __init__(s, name): s.name = name; s.bm = bmesh.new()

    def loft(s, rings, mat, cap0=True, cap1=True, closed=True):
        bm = s.bm; vs = [[bm.verts.new(p) for p in r] for r in rings]; n = len(vs[0])
        for i in range(len(vs) - 1):
            mi = mat[i] if isinstance(mat, (list, tuple)) else mat
            for j in range(n if closed else n - 1): bm.faces.new((vs[i][j], vs[i][(j + 1) % n], vs[i + 1][(j + 1) % n], vs[i + 1][j])).material_index = mi
        m0 = mat[0] if isinstance(mat, (list, tuple)) else mat; m1 = mat[-1] if isinstance(mat, (list, tuple)) else mat
        if cap0: bm.faces.new(vs[0][::-1]).material_index = m0
        if cap1: bm.faces.new(vs[-1]).material_index = m1
        return vs

    def box(s, c, size, mat, rot=0.0):
        """Брусок: центр c, размеры (sx, sy, sz), поворот вокруг Z (рад)."""
        c = Vector(c); hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2; ca, sa = math.cos(rot), math.sin(rot)
        ring = lambda z: [c + V(x * ca - y * sa, x * sa + y * ca, z) for x, y in ((-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy))]
        s.loft([ring(-hz), ring(hz)], mat)

    def cyl(s, p0, p1, r0, r1, mat, n=12, caps=True):
        a, c = Vector(p0), Vector(p1); d = (c - a).normalized(); h = V(0, 0, 1) if abs(d.z) < 0.9 else V(1, 0, 0)
        u = d.cross(h).normalized(); w = d.cross(u)
        ring = lambda o, r: [o + u * (r * math.cos(2 * math.pi * k / n)) + w * (r * math.sin(2 * math.pi * k / n)) for k in range(n)]
        s.loft([ring(a, r0), ring(c, r1)], mat, caps, caps)

    def beam(s, pts, side, w, h, mat, caps=True):
        """Брус прямоугольного сечения w × h вдоль ломаной pts; side — направление ширины (постоянное)."""
        side = Vector(side).normalized(); rings = []
        for i, p in enumerate(pts):
            p = Vector(p); t = (Vector(pts[min(i + 1, len(pts) - 1)]) - Vector(pts[max(i - 1, 0)])).normalized(); n = side.cross(t).normalized()
            rings.append([p + side * (sx * w / 2) + n * (sz * h / 2) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
        s.loft(rings, mat, caps, caps)

    def bar(s, a, c, w, h, mat, up=None):
        """Брус w × h от точки a до c (ширина — поперёк в плоскости с up)."""
        a, c = Vector(a), Vector(c); d = (c - a).normalized(); up = Vector(up) if up else (V(0, 0, 1) if abs(d.z) < 0.9 else V(0, 1, 0))
        side = d.cross(up).normalized(); s.beam([a, c], side, w, h, mat)

    def finish(s, col, sharp=32, loc=(0, 0, 0), parent=None):
        bm = s.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        lim = math.radians(sharp)
        for f in bm.faces: f.smooth = True
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > lim: e.smooth = False
        me = bpy.data.meshes.new(s.name); bm.to_mesh(me); bm.free()
        for m in MATS: me.materials.append(m)
        o = bpy.data.objects.new(s.name, me); col.objects.link(o); o.location = loc
        if parent: o.parent = parent
        return o



def lathe(b, o, axis, prof, mat, n=24, cap0=True, cap1=True):
    o, ax = Vector(o), Vector(axis).normalized(); u = ax.orthogonal().normalized(); w = ax.cross(u)
    rings = [[o + ax * t + (u * math.cos(2 * math.pi * k / n) + w * math.sin(2 * math.pi * k / n)) * max(r, 1e-4) for k in range(n)] for t, r in prof]
    ms = [mat(i) if callable(mat) else (mat[min(i, len(mat) - 1)] if isinstance(mat, (list, tuple)) else mat) for i in range(len(prof) - 1)]
    b.loft(rings, ms, cap0, cap1)
