# patkit.py — кирпичи модели HIMARS (из patkit.py PAC-3) (исполняется внутри build.py): материалы P3_*, построитель объекта B (bmesh → объект), простые тела.
# Метры, нос машины +Y, вверх +Z, начало — на земле посередине длины.
import bpy, bmesh, math
from mathutils import Vector, Matrix

PFX = 'HIM'
(M_BODY, M_DARK, M_STEEL, M_GLASS, M_RUBBER, M_TUBE, M_RED, M_WHITE, M_LAMP, M_BLACK, M_YELLOW, M_CANVAS, M_BLUE, M_LID) = range(14)
# HIMARS: вся машина однотонно-зелёная (фото 3-5), трубы контейнера внутри тёмные, крышки труб - светло-песочные (фото 6), фары, катафоты, номера
_SPEC = [('body', (0.12, 0.15, 0.085), 0.78, 0.0),       # зелёная: средний цвет фото 03 - кабина sRGB 147·157·128, клетка 116·133·103 (линейно 0,18…0,29) - уточнить пробой
         ('dark', (0.022, 0.024, 0.021), 0.9, 0.0),      # проёмы, решётки, внутренности
         ('steel', (0.12, 0.12, 0.115), 0.4, 0.75),      # штоки, ступицы, металл без краски
         ('glass', (0.035, 0.045, 0.05), 0.04, 0.35),
         ('rubber', (0.018, 0.018, 0.017), 0.95, 0.0),
         ('tube', (0.05, 0.055, 0.045), 0.85, 0.0),      # трубы контейнера изнутри
         ('red', (0.35, 0.03, 0.02), 0.5, 0.0),          # задние фонари, катафоты
         ('white', (0.70, 0.70, 0.66), 0.7, 0.0),        # таблички, номера
         ('lamp', (0.60, 0.33, 0.06), 0.2, 0.0),         # жёлтые габаритные огни на крыше, поворотники
         ('black', (0.012, 0.012, 0.012), 0.8, 0.0),
         ('yellow', (0.55, 0.42, 0.06), 0.6, 0.0),
         ('canvas', (0.09, 0.10, 0.06), 0.95, 0.0),
         ('blue', (0.05, 0.22, 0.45), 0.5, 0.0),
         ('lid', (0.42, 0.34, 0.20), 0.75, 0.0)]         # крышки труб: светло-песочные (фото 6)
MATS = []


def make_mats():
    MATS.clear()
    for n, c, r, mt in _SPEC:
        nm = f'{PFX}_{n}'; m = bpy.data.materials.get(nm) or bpy.data.materials.new(nm); m.use_nodes = True
        b = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
        b.inputs['Base Color'].default_value = (*c, 1); b.inputs['Roughness'].default_value = r; b.inputs['Metallic'].default_value = mt
        if n == 'glass':
            try: b.inputs['Specular IOR Level'].default_value = 0.9; b.inputs['Coat Weight'].default_value = 0.6; b.inputs['Coat Roughness'].default_value = 0.02
            except Exception: pass
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


def wheel(b, c, r=0.625, w=0.45, side=1, n=32):
    """колесо (фото 11): шина со скруглённым профилем, стальной диск-тарелка с ободом, 10 гаек, ступица с колпаком и шлангом подкачки"""
    cx, cy, cz = c; prof = [(0.0, 0.60), (0.04, 0.80), (0.10, 0.93), (0.20, 0.99), (0.30, 1.0), (0.70, 1.0), (0.80, 0.99), (0.90, 0.93), (0.96, 0.80), (1.0, 0.60)]
    rings = []
    for t, rr in prof:
        x = cx + side * (t - 0.5) * w
        rings.append([V(x, cy + r * rr * math.cos(2 * math.pi * k / n), cz + r * rr * math.sin(2 * math.pi * k / n)) for k in range(n)])
    b.loft(rings, M_RUBBER, cap0=False, cap1=False)                       # шина открыта внутрь: диск виден
    lathe(b, V(cx - side * w * 0.5, cy, cz), V(side, 0, 0), [(0, r * 0.60), (0.02, r * 0.55), (0.04, 0.001)], M_DARK, n=24, cap0=False, cap1=False)   # внутренняя сторона
    o = V(cx + side * w * 0.40, cy, cz); ax = V(side, 0, 0)
    lathe(b, o, ax, [(-0.06, r * 0.62), (0.04, r * 0.62), (0.05, r * 0.57), (0.03, r * 0.52), (0.02, r * 0.36), (0.07, r * 0.30), (0.08, r * 0.20), (0.13, r * 0.16), (0.15, r * 0.10), (0.16, 0.001)], [M_BODY, M_BODY, M_BODY, M_BODY, M_BODY, M_DARK, M_DARK, M_STEEL, M_STEEL], n=24, cap0=True, cap1=False)
    for k in range(10):                                                    # гайки
        a = 2 * math.pi * k / 10; q = o + ax * 0.065 + V(0, r * 0.25 * math.cos(a), r * 0.25 * math.sin(a)); b.cyl(q, q + ax * 0.03, 0.022, 0.018, M_STEEL, n=6)
    for k in range(6):                                                     # отверстия-вырезы диска
        a = 2 * math.pi * (k + 0.5) / 6; q = o + ax * 0.035 + V(0, r * 0.44 * math.cos(a), r * 0.44 * math.sin(a)); b.cyl(q, q + ax * 0.008, 0.045, 0.045, M_DARK, n=10)
    tube_path(b, [o + ax * 0.15 + V(0, 0.0, r * 0.10), o + ax * 0.16 + V(0, r * 0.20, r * 0.30), o + ax * 0.05 + V(0, r * 0.25, r * 0.55)], 0.012, M_BLACK, n=6)   # шланг подкачки


def railing(b, pts, h=1.1, post_step=1.6, r=0.025, mat=None, closed=True):
    """перила по ломаной pts (на одной высоте): стойки с шагом, поручень и средняя перекладина"""
    mat = M_BODY if mat is None else mat
    seq = list(pts) + ([pts[0]] if closed else [])
    for p0, p1 in zip(seq, seq[1:]):
        p0, p1 = Vector(p0), Vector(p1); L = (p1 - p0).length; n = max(1, int(L / post_step))
        for k in range(n + (0 if closed else 1)):
            q = p0 + (p1 - p0) * (k / n); b.cyl(q, q + V(0, 0, h), r, r, mat, n=6)
        for z in (h, h * 0.5): b.cyl(p0 + V(0, 0, z), p1 + V(0, 0, z), r * 0.9, r * 0.9, mat, n=6)


def plate(b, c, nrm, w, h, mat, t=0.015):
    """табличка/накладка на стене: центр c, наружу nrm (горизонтальный), ширина w, высота h"""
    n = Vector(nrm).normalized(); u = V(-n.y, n.x, 0)
    ring = lambda d: [Vector(c) + n * d + u * (sx * w / 2) + V(0, 0, sz * h / 2) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    b.loft([ring(-0.005), ring(t)], mat)


def _clip(poly, a, b, c):
    """отсечь многоугольник [(u, v)] полуплоскостью a·u + b·v ≤ c"""
    out = []
    for k in range(len(poly)):
        p, q = poly[k], poly[(k + 1) % len(poly)]; fp, fq = a * p[0] + b * p[1] - c, a * q[0] + b * q[1] - c
        if fp <= 0: out.append(p)
        if fp * fq < 0: t = fp / (fp - fq); out.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
    return out


def stripes(b, c, nrm, w, h, n=3, t=0.015, slope=1, mats=None):
    """щиток с косыми полосами (фото 07, 01): полосы встык в ОДНОЙ плоскости (без наложения — не мерцают); mats — пара цветов (белый, красный)"""
    m0, m1 = mats or (M_WHITE, M_RED)
    nn = Vector(nrm).normalized(); u = V(-nn.y, nn.x, 0) if abs(nn.z) < 0.9 else V(1, 0, 0); vv = nn.cross(u); c = Vector(c)
    if vv.z < 0: vv = -vv
    sw = w / (2 * n + 1); sh = sw * 0.9 * slope; rect = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    k0 = -n - 3
    for k in range(k0, n + 4):
        x0 = -w / 2 + sw * k; x1 = x0 + sw                                                             # полоса между линиями u = x + (v/h)·sh
        poly = _clip(rect, -1.0, sh / h, -x0); poly = _clip(poly, 1.0, -sh / h, x1)
        if len(poly) < 3: continue
        mat = m1 if (k % 2 == 1 and 0 < k < 2 * n + 1) else m0
        back = [c - nn * 0.005 + u * pu + vv * pv for pu, pv in poly]; front = [p + nn * (t + 0.005) for p in back]
        b.loft([back, front], mat)


def framed_glass(b, corners, nrm, rim=0.04, depth=0.03, mat_rim=None):
    """окно: кант-рамка по контуру (кольцо, выступает на 4,5 см) и стекло внутри неё — на 1,2…2 см перед стенкой корпуса (не прячется в сплошной корпус и не мерцает); corners — 4 точки по кругу на стенке"""
    mat_rim = M_DARK if mat_rim is None else mat_rim; nn = Vector(nrm).normalized(); cs = [Vector(p) for p in corners]; cen = sum(cs, Vector()) / 4
    inner = [p + (cen - p).normalized() * rim * 1.414 for p in cs]
    for k in range(4):
        a, bq, ci, di = cs[k], cs[(k + 1) % 4], inner[(k + 1) % 4], inner[k]
        q = [a, bq, ci, di]; b.loft([[p - nn * 0.01 for p in q], [p + nn * 0.045 for p in q]], mat_rim)
    g0 = [p + nn * 0.012 for p in inner]; b.loft([g0, [p + nn * max(0.02, 0.045 - depth) for p in g0]], M_GLASS)   # стекло: 1,2…2 см перед стенкой, утоплено в рамку


def ladder(b, a, c, w=0.45, rungs=6, r=0.022, mat=None):
    """лестница от точки a (низ) до c (верх): две тетивы и ступени"""
    mat = M_BODY if mat is None else mat; a, c = Vector(a), Vector(c); d = c - a
    side = d.cross(V(0, 0, 1)) if abs(d.normalized().z) < 0.99 else V(1, 0, 0)
    side = side.normalized() if side.length > 1e-6 else V(1, 0, 0)
    for s in (-1, 1): b.bar(a + side * (s * w / 2), c + side * (s * w / 2), 0.05, 0.02, mat)
    for k in range(1, rungs + 1):
        p = a + d * (k / (rungs + 1)); b.bar(p - side * (w / 2), p + side * (w / 2), 0.06, 0.025, mat)


def lathe(b, o, axis, prof, mat, n=24, cap0=True, cap1=True):
    """тело вращения: профиль [(t, r)] вдоль оси axis от точки o (t — расстояние по оси, r — радиус); mat — номер или функция от i"""
    o, ax = Vector(o), Vector(axis).normalized(); u = ax.orthogonal().normalized(); w = ax.cross(u)
    rings = [[o + ax * t + (u * math.cos(2 * math.pi * k / n) + w * math.sin(2 * math.pi * k / n)) * max(r, 1e-4) for k in range(n)] for t, r in prof]
    ms = [mat(i) if callable(mat) else (mat[min(i, len(mat) - 1)] if isinstance(mat, (list, tuple)) else mat) for i in range(len(prof) - 1)]
    b.loft(rings, ms, cap0, cap1)


def tube_path(b, pts, r, mat, n=8):
    """труба по ломаной с гладкими стыками (шар-узлы на изломах)"""
    pts = [Vector(p) for p in pts]
    for p, q in zip(pts, pts[1:]): b.cyl(p, q, r, r, mat, n=n, caps=False)
    for p in pts[1:-1]: lathe(b, p - V(0, 0, r), V(0, 0, 1), [(0, 0.001), (r * 0.3, r * 0.95), (r, r), (r * 1.7, r * 0.95), (2 * r, 0.001)], mat, n=n)
    for p, q in ((pts[0], pts[1]), (pts[-1], pts[-2])): lathe(b, p, (p - q), [(0, r), (r * 0.5, r * 0.6), (r * 0.6, 0.001)], mat, n=n, cap0=False)


def tread(b, c, r, w, side=1, n=24, h=0.032):
    """грунтозацепы шины (фото 03-05: крупные ёлочкой): на каждом шаге два бруска со сдвигом, от середины к краям"""
    cx, cy, cz = c
    for k in range(n):
        for half in (-1, 1):
            a0 = 2 * math.pi * k / n + (math.pi / n if half > 0 else 0.0); da = 2 * math.pi / n * 0.42
            x0, x1 = cx + half * w * 0.04, cx + half * w * 0.47
            ring = []
            for x, a in ((x0, a0), (x1, a0 + da * 0.55), (x1, a0 + da * 1.55), (x0, a0 + da)):
                ring.append((x, a))
            lo = [V(x, cy + (r - 0.004) * math.cos(a), cz + (r - 0.004) * math.sin(a)) for x, a in ring]
            hi = [V(x, cy + (r + h) * math.cos(a), cz + (r + h) * math.sin(a)) for x, a in ring]
            b.loft([lo, hi], M_RUBBER)
