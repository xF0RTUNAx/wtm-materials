# yak_base.py - общие построители (из сборок Ил-28 и Ту-22): таблицы, суперэллипс, профиль крыла с выемками рулей, плиты по обшивке, объединение, скругление стыков, мягкие нормали.
# Координаты: Blender нос +Y, правое крыло +X, верх +Z; a - от носка фюзеляжа назад. L задаёт модуль самолёта через set_len().
import math
import types
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 16.13
G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_DUCT = 0, 1, 2, 3, 4, 5, 11
PARTS = {}

def set_len(v):
    global L
    L = v

def Yb(a): return L / 2 - a
def P3(a, x, z): return Vector((x, Yb(a), z))


class Track:
    """Гладкая интерполяция таблицы (монотонный кубический Эрмит)."""
    def __init__(self, pts):
        self.x = [p[0] for p in pts]; self.y = [p[1] for p in pts]; n = len(pts)
        d = [(self.y[i + 1] - self.y[i]) / (self.x[i + 1] - self.x[i]) for i in range(n - 1)]
        m = [d[0]] + [0.0 if d[i - 1] * d[i] <= 0 else 3 * (self.x[i + 1] - self.x[i - 1]) / ((2 * self.x[i + 1] - self.x[i] - self.x[i - 1]) / d[i - 1] + (self.x[i + 1] + self.x[i] - 2 * self.x[i - 1]) / d[i]) for i in range(1, n - 1)] + [d[-1]]
        self.d, self.m = d, m

    def __call__(self, t):
        x, y, m = self.x, self.y, self.m
        if t <= x[0]: return y[0]
        if t >= x[-1]: return y[-1]
        i = next(k for k in range(len(x) - 1) if x[k] <= t <= x[k + 1]); h = x[i + 1] - x[i]; s = (t - x[i]) / h
        return (2 * s ** 3 - 3 * s ** 2 + 1) * y[i] + (s ** 3 - 2 * s ** 2 + s) * h * m[i] + (-2 * s ** 3 + 3 * s ** 2) * y[i + 1] + (s ** 3 - s ** 2) * h * m[i + 1]


def tracks(table):
    n = len(table[0]) - 1
    return [Track([(r[0], r[i + 1]) for r in table]) for i in range(n)]


class Lin:
    def __init__(self, pts): self.p = pts
    def __call__(self, t):
        p = self.p
        if t <= p[0][0]: return p[0][1]
        for (x0, y0), (x1, y1) in zip(p, p[1:]):
            if t <= x1: return y0 + (y1 - y0) * (t - x0) / max(x1 - x0, 1e-6)
        return p[-1][1]


def _sm(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)


def smooth_(e0, e1, v):
    if e1 == e0: return 1.0 if v >= e0 else 0.0
    return _sm((v - e0) / (e1 - e0))


def sup(a, cx, top, bot, hw, nt, nb, n, cz=None):
    """Суперэллипс: начало снизу (шов развёртки), дальше +X, верх, -X."""
    cy = (top + bot) / 2; ht = (top - bot) / 2; pts = []
    for k in range(n):
        th = -math.pi / 2 + 2 * math.pi * k / n; c, s = math.cos(th), math.sin(th); e = nt if s > 0 else nb
        pts.append(P3(a, cx + hw * math.copysign(abs(c) ** (2 / e), c), cy + ht * math.copysign(abs(s) ** (2 / e), s)))
    return pts


def stations(a0, a1, da):
    n = max(2, int(round((a1 - a0) / da))); return [a0 + (a1 - a0) * i / n for i in range(n + 1)]


def loft_obj(name, rings, mat=G_SKIN, cap0=True, cap1=True, sharp=38):
    b = B(); b.loft(rings, mat, cap0=mat if cap0 else None, cap1=mat if cap1 else None)
    return b.finish(name, sharp_deg=sharp)


def strip(b, rings, mat):
    """Сетка без замыкания по кольцу: стекло и рамы - открытые дуги."""
    bm = b.bm; vs = [[bm.verts.new(p) for p in r] for r in rings]
    for i in range(len(vs) - 1):
        for j in range(len(vs[0]) - 1):
            f = bm.faces.new((vs[i][j], vs[i][j + 1], vs[i + 1][j + 1], vs[i + 1][j])); f.material_index = mat


def strut(b, p0, p1, r, mat=G_METAL, n=12):
    d = (p1 - p0).normalized(); u = d.orthogonal().normalized(); v = d.cross(u)
    rg = lambda c: [c + (u * math.cos(2 * math.pi * q / n) + v * math.sin(2 * math.pi * q / n)) * r for q in range(n)]
    b.loft([rg(p0), rg(p1)], mat, cap0=mat, cap1=mat)


def box(b, c, hx, hy, hz, mat=G_METAL):
    """Брусок по осям мира: c - центр (Vector), полуразмеры."""
    rg = lambda dy: [c + Vector((sx * hx, dy, sz * hz)) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    b.loft([rg(-hy), rg(hy)], mat, cap0=mat, cap1=mat)


def _circ(a, cx, cz, r, n=56): return [P3(a, cx + r * math.sin(2 * math.pi * k / n), cz - r * math.cos(2 * math.pi * k / n)) for k in range(n)]


def thk(u):
    return 5 * (0.2969 * math.sqrt(max(u, 0)) - 0.1260 * u - 0.3516 * u ** 2 + 0.2843 * u ** 3 - 0.1015 * u ** 4)


def foil_ring(a_le, chord, tc, u0, u1, nu, place, tail=None, head=None):
    """Замкнутый контур хорды от u0 до u1: place(a, h) -> Vector. tail - точки (a, h) сзади, сверху вниз; head - точки спереди, снизу вверх."""
    us = [u0 + (u1 - u0) * (1 - math.cos(math.pi * i / (nu - 1))) / 2 for i in range(nu)]
    up = [place(a_le + chord * u, +tc * chord * thk(u)) for u in us]
    lo = [place(a_le + chord * u, -tc * chord * thk(u)) for u in reversed(us)]
    return up + [place(a_, h_) for a_, h_ in (tail or [])] + lo + [place(a_, h_) for a_, h_ in (head or [])]


# Рули: круглый нос ходит в круглом вырезе неподвижной части (уроки A-10A, B-2A: многоугольник выемки описан снаружи окружности).
COVE_K, COVE_R = 7, 0.008
def cove_cut(a_le, chord, tc, a_h, clr=COVE_R):
    uh = (a_h - a_le) / chord; t = tc * chord * thk(uh); R = (t + clr) / math.cos(math.pi / (2 * (COVE_K + 1))); lo, hi = 0.0, R
    if tc * chord * thk(uh - 1e-4) >= R: lo = hi = 0.0
    for _ in range(40):
        d_ = (lo + hi) / 2
        if math.hypot(d_, tc * chord * thk((a_h - d_ - a_le) / chord)) < R: lo = d_
        else: hi = d_
    a_e = a_h - hi; te = tc * chord * thk((a_e - a_le) / chord); rc = math.hypot(a_e - a_h, te); al = math.atan2(te, a_e - a_h)
    return (a_e - a_le) / chord, [(a_h + rc * math.cos(al + (2 * math.pi - 2 * al) * (i + 1) / (COVE_K + 1)), rc * math.sin(al + (2 * math.pi - 2 * al) * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_wall(a_le, chord, tc, u1):
    a_ = a_le + chord * u1; t = tc * chord * thk(u1); return [(a_, t * (1 - 2 * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_nose(a_le, chord, tc, a_h):
    t = tc * chord * thk((a_h - a_le) / chord); return [(a_h - t * math.sin(math.pi * (i + 1) / (COVE_K + 1)), -t * math.cos(math.pi * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_wall_f(a_le, chord, tc, u0):
    a_ = a_le + chord * u0; t = tc * chord * thk(u0); return [(a_, t * (-1 + 2 * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]


def _in(x, sp): return sp[0] - 1e-6 <= x <= sp[1] + 1e-6

def rpoly(a, pts, n, r=0.03):
    """Многоугольник со скруглёнными углами (x, z), равномерно n точек по длине; начало - первая точка."""
    P = [Vector((x, y)) for x, y in pts]; m = len(P); dense = []
    for i in range(m):
        p0, p1, p2 = P[i - 1], P[i], P[(i + 1) % m]; d0 = (p0 - p1).normalized(); d1 = (p2 - p1).normalized(); rr = min(r, (p0 - p1).length * 0.45, (p2 - p1).length * 0.45); q0 = p1 + d0 * rr; q1 = p1 + d1 * rr
        for k in range(7):
            t = k / 6; dense.append(q0 * (1 - t) ** 2 + p1 * 2 * t * (1 - t) + q1 * t * t)
    cum = [0.0]
    for i in range(len(dense)): cum.append(cum[-1] + (dense[(i + 1) % len(dense)] - dense[i]).length)
    out = []; j = 0
    for k in range(n):
        s_ = cum[-1] * k / n
        while cum[j + 1] < s_: j += 1
        t = (s_ - cum[j]) / max(cum[j + 1] - cum[j], 1e-9); q = dense[j].lerp(dense[(j + 1) % len(dense)], t); out.append(P3(a, q.x, q.y))
    return out



def _resample(P, n):
    """Замкнутый контур (список Vector 2D) - n точек равномерно по длине, начало - первая точка."""
    cum = [0.0]
    for i in range(len(P)): cum.append(cum[-1] + (P[(i + 1) % len(P)] - P[i]).length)
    out = []; j = 0
    for k in range(n):
        s_ = cum[-1] * k / n
        while cum[j + 1] < s_: j += 1
        t = (s_ - cum[j]) / max(cum[j + 1] - cum[j], 1e-9); out.append(P[j].lerp(P[(j + 1) % len(P)], t))
    return out


def _apply_bool(host, cutter, op, solver='MANIFOLD'):
    vl = bpy.context.view_layer
    for o in list(vl.objects):
        if o is not None: o.select_set(False)
    vl.objects.active = host; host.select_set(True)
    md = host.modifiers.new('b', 'BOOLEAN'); md.operation = op; md.object = cutter
    try: md.solver = solver
    except Exception: md.solver = 'EXACT'
    bpy.ops.object.modifier_apply(modifier=md.name)


def _drop(o):
    me = o.data; bpy.data.objects.remove(o); bpy.data.meshes.remove(me)


def _tag(o, v):
    a_ = o.data.attributes.get('src') or o.data.attributes.new('src', 'INT', 'FACE'); a_.data.foreach_set('value', [v] * len(o.data.polygons)); return o


def _rel(ob, pivot):
    for v in ob.data.vertices: v.co -= pivot
    ob.location = pivot
    return ob


BVH = {}
def bvh_ready(host):
    me = host.data; BVH['t'] = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons]); BVH['host'] = host


def down(x, y_world, z0=3.0, dirn=-1):
    hit = BVH['t'].ray_cast(Vector((x, y_world, z0)), Vector((0, 0, dirn)))
    return hit[0]


def patch(name, outline, nu, nv, dirn=-1, lift=0.006, th=0.018, mat=G_SKIN, z0=3.0):
    """Плита по обшивке: outline(u, v) -> (a, x); вершины кладутся лучом на обшивку (створки, люки)."""
    grid = []
    for j in range(nv + 1):
        row = []
        for i in range(nu + 1):
            a, x = outline(i / nu, j / nv); h = down(x, Yb(a), z0=z0, dirn=dirn)
            if h is None: print('ЛУЧ МИМО', name, round(a, 3), round(x, 3)); h = Vector((x, Yb(a), z0))
            row.append(h + Vector((0, 0, -dirn * lift)))
        grid.append(row)
    b = B(); bm = b.bm; n_ = Vector((0, 0, -dirn))
    tv = [[bm.verts.new(p + n_ * th * 0.8) for p in row] for row in grid]; lv = [[bm.verts.new(p - n_ * th * 0.3) for p in row] for row in grid]
    for j in range(nv):
        for i in range(nu):
            f = bm.faces.new((tv[j][i], tv[j][i + 1], tv[j + 1][i + 1], tv[j + 1][i])); f.material_index = mat
            f = bm.faces.new((lv[j][i], lv[j + 1][i], lv[j + 1][i + 1], lv[j][i + 1])); f.material_index = mat
    for i in range(nu):
        for (ta, tb, la, lb) in ((tv[0][i], tv[0][i + 1], lv[0][i], lv[0][i + 1]), (tv[nv][i + 1], tv[nv][i], lv[nv][i + 1], lv[nv][i])):
            f = bm.faces.new((ta, la, lb, tb)); f.material_index = mat
    for j in range(nv):
        for (ta, tb, la, lb) in ((tv[j + 1][0], tv[j][0], lv[j + 1][0], lv[j][0]), (tv[j][nu], tv[j + 1][nu], lv[j][nu], lv[j + 1][nu])):
            f = bm.faces.new((ta, la, lb, tb)); f.material_index = mat
    return b.finish(name, sharp_deg=30)


# ── из сборки JAS 39 Gripen: скругление стыка тел после объединения и мягкие нормали ──
def fillet_seam(host, pairs=((1, 9),), band=0.16, iters=14, sharp_deg=50.0, wfun=None):
    """Скругление стыка тел после объединения (Mark: «плавно скруглить область стыка верхнего брюшка и крыла»): вершины в полосе band от линии стыка
    сглаживаются к соседям с весом, спадающим от линии; острые кромки (передняя, задняя) не трогаются."""
    from mathutils.kdtree import KDTree
    me = host.data; a_ = me.attributes.get('src')
    if a_ is None: return 0
    src = [0] * len(me.polygons); a_.data.foreach_get('value', src)
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    want = {frozenset(p) for p in pairs}; seam = set(); lim = math.radians(sharp_deg); sharp = set()
    for e in bm.edges:
        if len(e.link_faces) != 2: continue
        f0, f1 = e.link_faces
        if frozenset((src[f0.index], src[f1.index])) in want: seam.update(v.index for v in e.verts)
        elif e.calc_face_angle(0.0) > lim: sharp.update(v.index for v in e.verts)
    if not seam: bm.free(); return 0
    kd = KDTree(len(seam))
    for i in seam: kd.insert(bm.verts[i].co, i)
    kd.balance(); W = {}
    for v in bm.verts:
        if v.index in sharp and v.index not in seam: continue
        _, _, d = kd.find(v.co)
        if d < band: W[v] = (1 - d / band) ** 2 * (wfun(L / 2 - v.co.y) if wfun else 1.0)
    for _ in range(iters):
        new = {}
        for v, w in W.items():
            nb = [e.other_vert(v).co for e in v.link_edges]
            if nb: new[v] = v.co + (sum(nb, Vector()) / len(nb) - v.co) * 0.5 * w
        for v, c in new.items(): v.co = c
    bm.to_mesh(me); bm.free(); return len(W)


def blur_normals(host, r=0.06, keep_deg=35.0, crease_deg=40.0):
    """Мягкие нормали: у каждой вершины - среднее направление граней в радиусе r (по площади), кроме граней с другим наклоном (кромки, стенки канавок).
    Тонкие треугольники после объединения тел больше не дают полос в тени; острые кромки остаются острыми."""
    from mathutils.kdtree import KDTree
    me = host.data; me.calc_loop_triangles(); P_ = me.polygons; n = len(P_)
    C = [p.center.copy() for p in P_]; N = [p.normal.copy() for p in P_]; A = [p.area for p in P_]
    kd = KDTree(n)
    for i, c in enumerate(C): kd.insert(c, i)
    kd.balance(); ck = math.cos(math.radians(keep_deg)); cc = math.cos(math.radians(crease_deg))
    V = me.vertices; vn = {}
    lf = [[] for _ in range(len(V))]
    for p in P_:
        for vi in p.vertices: lf[vi].append(p.index)
    out = [None] * len(me.loops)
    for p in P_:
        pn = N[p.index]
        for li in p.loop_indices:
            vi = me.loops[li].vertex_index; key = (vi, p.index)
            acc = Vector(); 
            for (_, j, _) in kd.find_range(V[vi].co, r):
                if N[j].dot(pn) > ck: acc += N[j] * A[j]
            acc = acc.normalized() if acc.length > 1e-9 else pn
            out[li] = acc if acc.dot(pn) > cc else pn
    for p in P_: p.use_smooth = True
    me.normals_split_custom_set([v[:] for v in out]); return n
