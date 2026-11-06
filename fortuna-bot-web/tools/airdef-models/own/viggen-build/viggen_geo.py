# viggen_geo.py - геометрия Saab Viggen для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z.
# a - расстояние от острия носа (без щупа), y - высота над осью корпуса. Профиль снят с viggen_11 (двухместный, строго сбоку: снаружи тот же), план с viggen_07, кабина одноместная с viggen_01, 02, 05, 12.
import math
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 15.27
G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK = 0, 1, 2, 3, 4, 5
PARTS = {}
PYLON_PTS = {}
BVH = {}


def Yb(a): return L / 2 - a


def P3(a, x, y): return Vector((x, Yb(a), y))


class Lin:
    def __init__(self, pts): self.p = pts
    def __call__(self, t):
        p = self.p
        if t <= p[0][0]: return p[0][1]
        for (a0, b0), (a1, b1) in zip(p, p[1:]):
            if t <= a1: return b0 + (b1 - b0) * (t - a0) / (a1 - a0)
        return p[-1][1]


class Track:
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


def sup(a, cx, top, bot, hw, nt, nb, n):
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
    """Сетка без замыкания по кольцу: стекло и рамы - открытые дуги от порога до порога."""
    bm = b.bm; vs = [[bm.verts.new(p) for p in r] for r in rings]
    for i in range(len(vs) - 1):
        for j in range(len(vs[0]) - 1):
            f = bm.faces.new((vs[i][j], vs[i][j + 1], vs[i + 1][j + 1], vs[i + 1][j])); f.material_index = mat


def strut(b, p0, p1, r, mat=G_METAL, n=12):
    d = (p1 - p0).normalized(); u = d.orthogonal().normalized(); v = d.cross(u)
    rg = lambda c: [c + (u * math.cos(2 * math.pi * q / n) + v * math.sin(2 * math.pi * q / n)) * r for q in range(n)]
    b.loft([rg(p0), rg(p1)], mat, cap0=mat, cap1=mat)


def thk(u):
    return 5 * (0.2969 * math.sqrt(max(u, 0)) - 0.1260 * u - 0.3516 * u ** 2 + 0.2843 * u ** 3 - 0.1015 * u ** 4) * 0.5 * 2


def foil_ring(a_le, chord, tc, u0, u1, nu, place, nose=0.0):
    """Замкнутый контур хорды от u0 до u1: place(a, h) -> Vector; h - смещение по толщине. nose - длина (м) скругления носка у секции управления: толщина у её начала меньше, при отклонении угол не входит в крыло."""
    us = [u0 + (u1 - u0) * (1 - math.cos(math.pi * i / (nu - 1))) / 2 for i in range(nu)]
    def f(u):
        if nose <= 0: return 1.0
        t = min(1.0, (u - u0) * chord / nose); return 0.35 + 0.65 * math.sqrt(t)
    up = [place(a_le + chord * u, +tc * chord * thk(u) * f(u)) for u in us]
    lo = [place(a_le + chord * u, -tc * chord * thk(u) * f(u)) for u in reversed(us)]
    return up + lo


def poly_ring(a, pts, n, r=0.03):
    """Многоугольник со скруглёнными углами, равномерно n точек; начало - первая точка. pts: (x, y)."""
    P = [Vector((x, y)) for x, y in pts]; m = len(P); dense = []
    for i in range(m):
        p0, p1, p2 = P[i - 1], P[i], P[(i + 1) % m]; d0 = (p0 - p1).normalized(); d1 = (p2 - p1).normalized(); rr = min(r[i] if isinstance(r, (list, tuple)) else r, (p0 - p1).length * 0.45, (p2 - p1).length * 0.45); q0 = p1 + d0 * rr; q1 = p1 + d1 * rr
        for k in range(5):
            t = k / 4; dense.append(q0 * (1 - t) ** 2 + p1 * 2 * t * (1 - t) + q1 * t * t)
    cum = [0.0]
    for i in range(len(dense)): cum.append(cum[-1] + (dense[(i + 1) % len(dense)] - dense[i]).length)
    out = []; j = 0
    for k in range(n):
        s = cum[-1] * k / n
        while cum[j + 1] < s: j += 1
        t = (s - cum[j]) / max(cum[j + 1] - cum[j], 1e-9); q = dense[j].lerp(dense[(j + 1) % len(dense)], t); out.append(P3(a, q.x, q.y))
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


def down(x, y_world, z0=3.0, dirn=-1):
    """Точка обшивки под/над (x, Y): луч вертикально вниз (dirn=-1) или вверх."""
    hit = BVH['t'].ray_cast(Vector((x, y_world, z0)), Vector((0, 0, dirn)))
    return hit[0]


def patch(name, outline, nu, nv, dirn=-1, lift=0.006, th=0.018, mat=G_SKIN, z0=3.0):
    """Плита по обшивке: outline(u, v) -> (a, x); вершины кладутся лучом на обшивку (щиток, створки). Бортик внизу. Начало - в нуле мира."""
    grid = []
    for j in range(nv + 1):
        row = []
        for i in range(nu + 1):
            a, x = outline(i / nu, j / nv); h = down(x, Yb(a), z0=z0, dirn=dirn)
            row.append((h if h is not None else Vector((x, Yb(a), z0))) + Vector((0, 0, -dirn * lift)))
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


def _rel(ob, pivot):
    for v in ob.data.vertices: v.co -= pivot
    ob.location = pivot
    return ob


def bvh_ready(host):
    me = host.data; BVH['t'] = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons]); BVH['host'] = host


NAC_A1 = 14.30; NOZ_X = 0.0; NOZ_Y = -0.30; NOZ_A = 14.70; NOZ_R = 0.60; NOZ_K = 1.42     # одно сопло: ось ниже оси носа; обод у задней кромки крыла


def _rv(a, r, cz=NOZ_Y, n=64): return [P3(a, r * math.sin(2 * math.pi * k / n), cz - r * math.cos(2 * math.pi * k / n)) for k in range(n)]


def bore_cut(sx=0):
    return loft_obj('c_bore', [_rv(13.44, 0.615), _rv(15.60, 0.615)], G_DARK, sharp=30)


def nozzle(sx=0):
    """Сопло выходит из корпуса: узкая кольцевая щель вместо ступени, дальше горячая часть почти того же диаметра и широкий обод (02, 05, 06, 11). Внутри чёрное глубокое нутро. Створки реверса не различимы: без шарнира."""
    b = B()
    prof = [(13.28, 0.52), (13.43, 0.585), (13.49, 0.600), (13.62, 0.622), (14.02, 0.655), (14.62, 0.665), (14.68, 0.660), (14.70, 0.645), (14.70, 0.615)]
    b.loft([_rv(a, r) for a, r in prof], G_METAL, cap0=G_METAL, cap1=None)
    inn = [(14.70, 0.615), (14.66, 0.600), (14.20, 0.600), (13.92, 0.560), (13.76, 0.44), (13.70, 0.05)]
    b.loft([_rv(a, r) for a, r in inn], G_DARK, cap0=None, cap1=G_DARK)
    return b.finish('nozzle', sharp_deg=30)


# ── корпус: одно тело от носа до шейки сопла ──
HULL = [  # a, верх, низ, полуширина, nверх, nниз. Профиль снят с viggen_11 (строго сбоку, 112 пикс/м), ширина с viggen_07
    (0.00, 0.006, -0.006, 0.006, 2.0, 2.0), (0.40, 0.100, -0.075, 0.125, 2.0, 2.0), (0.98, 0.300, -0.235, 0.335, 2.0, 2.0), (1.50, 0.500, -0.385, 0.465, 2.0, 2.0), (2.03, 0.630, -0.445, 0.530, 2.1, 2.1), (2.60, 0.700, -0.490, 0.550, 2.5, 2.2), (3.10, 0.745, -0.525, 0.555, 3.0, 2.2),
    (4.10, 0.800, -0.600, 0.585, 3.2, 2.3), (5.00, 0.830, -0.680, 0.660, 3.1, 2.4), (5.66, 0.840, -0.740, 0.720, 2.9, 2.5), (7.00, 0.840, -0.840, 0.780, 2.8, 2.7), (7.90, 0.840, -0.890, 0.800, 2.7, 2.8), (9.50, 0.840, -0.930, 0.840, 2.6, 3.0), (11.70, 0.800, -0.960, 0.840, 2.5, 3.0), (12.60, 0.740, -0.960, 0.780, 2.3, 2.6), (13.00, 0.600, -0.955, 0.715, 2.15, 2.25), (13.42, 0.345, -0.945, 0.645, 2.0, 2.0)]
HT = tracks(HULL)
HULL_END = 13.42


def hull_ring(a, n=96):
    top, bot, hw, nt, nb = [t(a) for t in HT]; return sup(a, 0.0, top, bot, hw, nt, nb, n)


def hull():
    b = B(); b.loft([hull_ring(a) for a in stations(0.0, 2.60, 0.15)[:-1] + stations(2.60, HULL_END, 0.22)], G_SKIN, cap0=G_SKIN, cap1=G_DARK); return b.finish('s_hull', sharp_deg=38)    # корпус сужается к соплу; тонкая задняя стенка чёрная: только кольцевая щель (02, 05)


def top_y(a, x):
    top, bot, hw, nt, nb = [t(a) for t in HT]; cy = (top + bot) / 2; ht = (top - bot) / 2; q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nt); return cy + ht * q ** (1 / nt)


SP_Z = Track([(4.88, 1.235), (5.60, 1.225), (7.70, 1.170), (10.00, 1.040), (11.30, 0.930)]); SP_W = Track([(4.88, 0.470), (6.00, 0.470), (8.00, 0.430), (10.00, 0.300), (11.30, 0.100)])


def spine():
    """Высокий широкий гребень спины: верх начинается вровень с концом фонаря (01, 02, 05, 11)."""
    return loft_obj('s_spine', [sup(a, 0.0, SP_Z(a), 0.40, SP_W(a), 2.9, 2.0, 56) for a in stations(4.88, 11.30, 0.24)], G_SKIN, sharp=40)


def shroud():
    """Кожух сверху сопла: продолжает верх корпуса, с боков охватывает верх сопла, сужается к концу, торец чёрный (02, 05, 09, 11)."""
    T_ = Track([(12.30, 0.745), (13.05, 0.74), (13.25, 0.73), (14.00, 0.650), (14.70, 0.565), (15.27, 0.510)]); B_ = Track([(12.30, 0.10), (13.05, 0.00), (13.60, -0.06), (14.00, 0.05), (14.40, 0.20), (14.70, 0.30), (15.27, 0.335)]); W_ = Track([(12.30, 0.58), (13.05, 0.70), (13.60, 0.70), (14.00, 0.665), (14.40, 0.50), (14.70, 0.34), (15.27, 0.16)])
    b = B(); st = stations(12.30, 15.27, 0.14); b.loft([sup(a, 0.0, T_(a), B_(a), W_(a), 2.4, 1.7, 64) for a in st], G_SKIN, cap0=G_SKIN, cap1=G_DARK); return b.finish('s_shroud', sharp_deg=40)


# ── заборники: овальные, спереди отстоят от корпуса (04, 12, 13) ──
INL_A = 4.06
CH = tracks([(4.06, 0.950, 0.02, 0.308, 0.550), (4.60, 0.925, 0.00, 0.335, 0.570), (5.66, 0.860, -0.05, 0.390, 0.620), (7.00, 0.720, -0.12, 0.450, 0.660), (8.40, 0.560, -0.18, 0.420, 0.620), (10.00, 0.420, -0.22, 0.250, 0.450)])


LIP_E = 0.052


def cheek(sx):
    def ring(a):
        cx, cz, rx, rz = [t(a) for t in CH]; return sup(a, sx * cx, cz + rz, cz - rz, rx, 2.35, 2.35, 72)
    def lip(t_):      # скруглённая кромка устья: четверть круга, чтобы не было граней и мятого блика
        a = INL_A - LIP_E * math.cos(t_); off = LIP_E * (1 - math.sin(t_)); cx, cz, rx, rz = [t(INL_A) for t in CH]; return sup(a, sx * cx, cz + rz - off, cz - rz + off, rx - off, 2.35, 2.35, 72)
    return loft_obj('s_cheek_' + ('r' if sx > 0 else 'l'), [lip(math.pi / 2 * i / 6) for i in range(7)] + [ring(a) for a in [4.14, 4.24] + stations(4.36, 10.0, 0.24)], G_SKIN, sharp=60)


def duct_cut(sx):
    """Канал: овальное устье, плавно сужается, глухой торец; нутро без колец и полос."""
    def ring(a, k):
        cx, cz, rx, rz = [t(max(a, INL_A)) for t in CH]; e_ = LIP_E + 0.004; return sup(a, sx * cx, cz + (rz - e_) * (1 - 0.25 * k), cz - (rz - e_) * (1 - 0.25 * k), (rx - e_) * (1 - 0.30 * k), 2.35, 2.35, 72)
    st = [3.90, 4.06, 4.30, 4.70, 5.10, 5.50, 5.90, 6.30]; return loft_obj('c_duct', [ring(a, max(0.0, (a - 4.3) / 2.0)) for a in st], G_COCK, sharp=25)


# ── крыло: двойная дельта; задняя кромка почти прямая, к концу вперёд (07, 11) ──
WLE = Lin([(0.90, 7.62), (1.12, 7.89), (2.75, 9.65), (5.30, 13.55)]); WTE = Lin([(0.90, 14.62), (5.30, 14.18)])
HING = Lin([(1.00, 13.82), (5.15, 13.42)]); TC = Lin([(0.9, 0.032), (5.3, 0.028)])
def wz(x, a): return -0.60 - 0.040 * (a - 7.9) - 0.020 * max(0.0, x - 1.0)      # к задней кромке ниже, небольшая обратная поперечная V
def wy(x): return wz(x, HING(x))
ELEVS = ((1.02, 2.90), (3.02, 4.09), (4.21, 5.10)); ELN = ('i', 'm', 'o'); GAP = 0.012
FAIR = ((1.40, 12.50, 13.78), (2.96, 10.05, 14.42), (4.15, 12.30, 14.26))    # x, начало, конец обтекателей


def in_(x, r): return r[0] <= x <= r[1]


def _wsec(sx, x):
    c = WTE(x) - WLE(x); ue = max(0.06, (HING(x) - WLE(x)) / c) if any(in_(x, r) for r in ELEVS) else 1.0
    return foil_ring(WLE(x), c, TC(x), 0.0, ue, 26, lambda a, h: P3(a, sx * x, wz(x, a) + h))


def wing_s(sx):
    xs = {0.60, 0.90, 1.12, 2.75, 5.30, 5.15, 5.25}
    for r in ELEVS:
        xs |= {r[0] - 0.005, r[0], r[1], r[1] + 0.005}
        for i in range(1, 6): xs.add(round(r[0] + (r[1] - r[0]) * i / 6, 4))
    return loft_obj('s_wing_' + ('r' if sx > 0 else 'l'), [_wsec(sx, x) for x in sorted(xs)], sharp=48)


def ctrl_part(name, spec, sx, note, rng, HG, LE, TE, tc, zf):
    """Подвижная часть за линией навески: начало на оси, нос скруглён."""
    x0, x1 = spec[0] + 0.006, spec[1] - 0.006
    pv0 = P3(HG(x0) + GAP + 0.04, sx * x0, zf(x0, HG(x0))); pv1 = P3(HG(x1) + GAP + 0.04, sx * x1, zf(x1, HG(x1))); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    for i in range(9):
        x = x0 + (x1 - x0) * i / 8; c = TE(x) - LE(x); t_ = tc(x) if callable(tc) else tc; rings.append([v - pivot for v in foil_ring(LE(x), c, t_, min(0.9, (HG(x) - LE(x) + GAP) / c), 1.0, 9, lambda a, h: P3(a, sx * x, zf(x, a) + h), nose=0.11)])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot; PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=rng, note=note); return ob


def elevon(i, sx):
    return ctrl_part(f'elevon_{ELN[i]}_' + ('r' if sx > 0 else 'l'), ELEVS[i], sx, 'элевон, ось по передней кромке; плюс - вниз', (-25.0, 25.0), HING, WLE, WTE, TC, wz)


# ── утки: большие, неподвижные, ступенью выше крыла, сразу за заборниками; закрылок (01, 07, 10, 13) ──
CLE = Lin([(0.85, 4.45), (1.24, 4.87), (2.70, 7.38)]); CTE = Lin([(0.85, 7.92), (2.70, 7.89)]); CHG = Lin([(1.18, 7.08), (2.70, 7.38)]); CTC = 0.036
def cz(x, a=0.0): return 0.14 - 0.11 * max(0.0, x - 1.0)
CFLAP = (1.18, 2.66)


def _csec(sx, x):
    c = CTE(x) - CLE(x); ue = max(0.08, (CHG(x) - CLE(x)) / c) if in_(x, CFLAP) else 1.0
    return foil_ring(CLE(x), c, CTC, 0.0, ue, 20, lambda a, h: P3(a, sx * x, cz(x) + h))


def canard_s(sx):
    xs = {0.85, 1.00, CFLAP[0] - 0.005, CFLAP[0], CFLAP[1], CFLAP[1] + 0.005, 2.70}
    for i in range(1, 6): xs.add(round(CFLAP[0] + (CFLAP[1] - CFLAP[0]) * i / 6, 4))
    return loft_obj('s_canard_' + ('r' if sx > 0 else 'l'), [_csec(sx, x) for x in sorted(xs)], sharp=48)


def canard_flap(sx):
    return ctrl_part('canflap_' + ('r' if sx > 0 else 'l'), CFLAP, sx, 'закрылок утки, ось по передней кромке; плюс - вниз', (-5.0, 35.0), CHG, CLE, CTE, CTC, cz)


def fairings(sx):
    """Длинные узкие обтекатели на нижней стороне крыла и контейнер с чёрным носом (03, 04, 07, 10): неподвижны."""
    b = B(); n = 14
    for x, a0, a1 in FAIR:
        am = (a0 + a1) / 2; y_ = wz(x, am) - TC(x) * (WTE(x) - WLE(x)) * 0.45
        def rg(a, r): zc = wz(x, a) - TC(x) * (WTE(x) - WLE(x)) * thk(max(0.0, min(1.0, (a - WLE(x)) / (WTE(x) - WLE(x))))) - r * 0.10; return [P3(a, sx * x + r * 0.68 * math.cos(2 * math.pi * q / n), zc + r * math.sin(2 * math.pi * q / n)) for q in range(n)]
        L_ = a1 - a0; prof = [(a0, 0.006), (a0 + 0.10 * L_, 0.058), (a0 + 0.30 * L_, 0.086), (a1 - 0.25 * L_, 0.086), (a1 - 0.08 * L_, 0.052), (a1, 0.008)]
        b.loft([rg(a, r) for a, r in prof], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    # контейнер на кромке: острый нос вперёд крыла, хвост уходит в обтекатель
    x = FAIR[2][0]; z0 = wz(x, 11.6) - 0.02; pr = [(10.80, 0.004), (10.95, 0.045), (11.25, 0.078), (11.70, 0.085), (12.35, 0.070), (12.70, 0.012)]
    b.loft([[P3(a, sx * x + r * math.cos(2 * math.pi * q / n), z0 + r * math.sin(2 * math.pi * q / n)) for q in range(n)] for a, r in pr], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('s_fair_' + ('r' if sx > 0 else 'l'), sharp_deg=48)


# ── киль и руль ──
FIN_Y0, FIN_Y1 = 0.62, 3.29
F_LE = Lin([(0.62, 10.25), (0.95, 10.74), (3.29, 13.72)]); F_TE = Lin([(0.62, 14.30), (3.29, 14.24)])
RUD = (0.82, 2.78); RUD_C = Lin([(0.82, 0.75), (2.78, 0.69)])
def ftc(y): return 0.034 - 0.012 * (y - 0.62) / 2.67


def fin():
    ys = [0.62, 0.72, 0.815, 0.82] + [0.82 + (2.78 - 0.82) * i / 8 for i in range(1, 9)] + [2.785, 2.95, 3.15, 3.29]; rings = []
    for y in ys:
        c = F_TE(y) - F_LE(y); ue = 1 - RUD_C(y) / c if RUD[0] <= y <= RUD[1] else 1.0
        rings.append(foil_ring(F_LE(y), c, ftc(y), 0.0, ue, 16, lambda a, h: P3(a, h, y)))
    return loft_obj('fin', rings, sharp=48)


def rudder():
    y0, y1 = RUD; h0 = F_TE(y0) - RUD_C(y0) + GAP + 0.03; h1 = F_TE(y1) - RUD_C(y1) + GAP + 0.03; p0 = P3(h0, 0, y0); p1 = P3(h1, 0, y1); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized(); rings = []
    for i in range(9):
        y = y0 + 0.006 + (y1 - y0 - 0.012) * i / 8; c = F_TE(y) - F_LE(y); rings.append([v - pivot for v in foil_ring(F_LE(y), c, ftc(y), 1 - (RUD_C(y) - 0.005) / c, 1.0, 9, lambda a, h: P3(a, h, y), nose=0.14)])
    b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN); n = 14
    for sg in (1, -1):      # хвост обтекателя киля ходит с рулём
        def rg(a, r): y_ = 1.36 - 0.03 * (a - 11.9); xc = sg * (ftc(y_) * (F_TE(y_) - F_LE(y_)) * 0.20 + r * 0.45); return [P3(a, xc + r * 0.8 * math.cos(2 * math.pi * q / n), y_ + r * math.sin(2 * math.pi * q / n)) - pivot for q in range(n)]
        b.loft([rg(a, r) for a, r in ((13.58, 0.010), (13.62, 0.050), (13.72, 0.066), (14.02, 0.010))], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    ob = b.finish('rudder', sharp_deg=48); ob.location = pivot
    PARTS['rudder'] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-30.0, 30.0), note='ось по передней кромке руля, снизу вверх'); return ob


def fin_fair():
    """Длинный обтекатель на борту киля (02, 05, 06, 09)."""
    b = B(); n = 14
    for sg in (1, -1):
        def rg(a, r): y_ = 1.36 - 0.03 * (a - 11.9); xc = sg * (ftc(y_) * (F_TE(y_) - F_LE(y_)) * 0.45 + r * 0.45); return [P3(a, xc + r * 0.8 * math.cos(2 * math.pi * q / n), y_ + r * math.sin(2 * math.pi * q / n)) for q in range(n)]
        b.loft([rg(a, r) for a, r in ((11.90, 0.004), (12.15, 0.035), (12.70, 0.070), (13.35, 0.075), (13.50, 0.045), (13.54, 0.008))], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('fin_fair', sharp_deg=30)


def ventral():
    """Киль под хвостом с обрезанным концом (02, 05)."""
    b = B(); P_ = [(10.76, -0.80), (12.04, -0.80), (12.36, -1.74), (11.86, -1.74)]; t0 = 0.040
    b.loft([[P3(a, s_ * (t0 if z_ > -1.0 else 0.022), z_) for a, z_ in P_] for s_ in (1, -1)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); return b.finish('s_vent', sharp_deg=30)


def tail_plate(sx):
    """Плита у обода сопла под задней кромкой крыла (02)."""
    b = B(); rg = lambda a, w_: [P3(a, sx * 0.58, -0.70), P3(a, sx * (0.58 + w_), -0.74), P3(a, sx * (0.58 + w_), -0.92), P3(a, sx * 0.58, -1.01)]
    b.loft([rg(14.0, 0.20), rg(14.45, 0.14), rg(14.72, 0.02)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); return b.finish('s_plate', sharp_deg=35)


# ── фонарь: большой козырёк и крышка с петлёй сзади (01, 02, 05, 12) ──
CANOPY = [(2.55, top_y(2.55, 0.0) + 0.004, 0.0), (2.90, 0.905, 0.0), (3.30, 1.075, 0.0), (3.70, 1.195, 0.0), (4.10, 1.260, 0.0), (4.50, 1.275, 0.0), (4.88, 1.240, 0.0)]; CAN_T = tracks(CANOPY)
ARCH_A = 3.50; CAN_A1 = 4.86; CAN_H = (5.02, 1.30)
SILL_Z = Track([(2.55, 0.62), (3.50, 0.66), (4.88, 0.70)])
def SILL(a): return SILL_Z(a)
def HW_C(a):
    top, bot, hw, nt, nb = [t(a) for t in HT]; cy = (top + bot) / 2; ht = (top - bot) / 2; q = min(0.999, max(0.0, (SILL_Z(a) - cy) / ht)); return hw * (1 - q ** nt) ** (1 / nt)
def CK_HW(a): return HW_C(a) - 0.022


def can_ring(a, inset=0.0, n=44):
    top, hw = CAN_T[0](a) - inset, HW_C(a) - inset; y0 = SILL(a) + 0.002; out = []
    for k in range(n):
        c = math.cos(math.pi * k / (n - 1)); s = math.sin(math.pi * k / (n - 1)); out.append(P3(a, math.copysign(hw * abs(c) ** 0.62, c), y0 + (top - y0) * s ** 0.75))
    return out


def frame_arch(b, a, w, inset=0.008, h=0.020, n=44, drop=0.0, mat=G_SKIN):
    ri0 = can_ring(a - w, inset, n); ro0 = can_ring(a - w, -h, n); ro1 = can_ring(a + w, -h, n); ri1 = can_ring(a + w, inset, n)
    if drop: ri0 = [p - Vector((0, 0, drop)) for p in ri0]; ri1 = [p - Vector((0, 0, drop)) for p in ri1]
    strip(b, [ri0, ro0, ro1, ri1, ri0], mat)


def _rail(b, sg, a0, a1, d0=0.004, d1=0.020):
    st = stations(a0, a1, 0.12); rail = lambda a, d, h: P3(a, sg * (HW_C(a) + d), SILL(a) + h)
    b.loft([[rail(a, d0 - 0.018, 0.002), rail(a, d1, 0.002), rail(a, d1, 0.022), rail(a, d0 - 0.016, 0.042)] for a in st], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)


def canopy():
    a0 = ARCH_A; a1 = CAN_A1; st = stations(a0 + 0.004, a1, 0.12); pv = P3(CAN_H[0], 0.0, CAN_H[1])
    gb = B(); strip(gb, [can_ring(a) for a in st], G_GLASS); gl = gb.finish('canopy_glass', sharp_deg=60)
    for v in gl.data.vertices: v.co -= pv
    gl.location = pv
    b = B(); frame_arch(b, a0 + 0.034, 0.034, inset=-0.006, h=0.018)
    for sg in (1, -1): _rail(b, sg, a0 + 0.075, 4.55)
    strip(b, [can_ring(a1 - 0.05, 0.016), can_ring(a1 - 0.05, -0.006), can_ring(a1, -0.006), can_ring(a1, 0.016), can_ring(a1 - 0.05, 0.016)], G_SKIN)
    fr = b.finish('canopy', sharp_deg=45)
    for v in fr.data.vertices: v.co -= pv
    fr.location = pv; gl.parent = fr; gl.location = (0, 0, 0)
    PARTS['canopy'] = dict(pivot=pv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 40.0), note='крышка фонаря, петля сзади; плюс - передняя кромка вверх; canopy_glass - дочерний объект')
    return [fr, gl]


def windscreen():
    a1 = ARCH_A - 0.02; st = stations(2.60, a1, 0.09); bg = B(); strip(bg, [can_ring(a) for a in st], G_GLASS); gl = bg.finish('screen_glass', sharp_deg=60)
    b = B(); frame_arch(b, ARCH_A - 0.030, 0.028, inset=0.030, h=0.004, drop=0.012)
    for sg in (1, -1): _rail(b, sg, 2.95, a1)
    return [gl, b.finish('screen_frame', sharp_deg=45)]


def cock_cut():
    st = stations(2.80, 4.88, 0.07); rg = lambda a: [P3(a, -CK_HW(a), -0.06), P3(a, CK_HW(a), -0.06), P3(a, CK_HW(a), 1.9), P3(a, -CK_HW(a), 1.9)]
    return loft_obj('c_cock', [rg(a) for a in st], G_COCK, sharp=25)


# ── пилоны. Порядок для mirror(): задний фюзеляжный, внешний крыла, средний крыла, под заборником ──
PYLON_DEF = (('r', 0.60, 11.15, 12.65, -1.20), ('o', 4.15, 11.00, 12.40, -1.04), ('w', 2.96, 10.15, 11.65, -1.10), ('f', 0.90, 5.60, 7.60, -1.02)); CANT = 0.0
def PYL_FLAT(a0, a1): return a0 + 0.50, a1 - 0.36


def pylon(sx, tag, x, a0, a1, y0):
    b = B(); name = f'pylon_{tag}_' + ('r' if sx > 0 else 'l'); f0, f1 = PYL_FLAT(a0, a1); yw = max(wz(x, (a0 + a1) / 2), -0.70) + (0.05 if tag == 'f' else 0.0); hw = 0.058
    def sec(a, f, k):
        y_ = yw + (y0 - yw) * k; return [P3(a, sx * x - hw * f, y_), P3(a, sx * x + hw * f, y_), P3(a, sx * x + hw * f * 0.85, yw), P3(a, sx * x - hw * f * 0.85, yw)]
    st = [a0, a0 + 0.26, f0, f1, a1 - 0.10, a1]; fs = [0.12, 0.80, 1.0, 1.0, 0.70, 0.15]; ks = [0.14, 0.60, 1.0, 1.0, 0.72, 0.40]
    b.loft([sec(a, f, k) for a, f, k in zip(st, fs, ks)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); PYLON_PTS[name] = P3((f0 + f1) / 2, sx * x, y0); PYLON_PTS[name + '_root'] = P3((f0 + f1) / 2, sx * x, yw)
    return b.finish(name, sharp_deg=40)


# ── шасси: размеры ──
GROUND_Y = -2.55
NG = dict(a=3.90, hinge=(3.95, -0.40), rw=0.27, ww=0.14, track=0.150)
MG_A, MG_X = 10.27, 2.40; MG_DA = 0.415; MAIN_T = (10.27, 2.55, -0.71)
NDOOR = dict(a0=1.80, am=3.02, a1=4.07, hw=0.44); MDOOR = dict(a0=9.56, a1=11.05, x0=0.62, x1=2.62, xi=1.40, xo=2.22, ca0=9.90, ca1=10.68)
def X_DM(a):
    """Граница внутренней створки и створки на стойке: посередине створка на стойке доходит до xi, к краям уходит наружу до xo: створка на стойке сужается книзу (02, 10)."""
    D = MDOOR
    if D['ca0'] <= a <= D['ca1']: return D['xi']
    t = (D['ca0'] - a) / (D['ca0'] - D['a0']) if a < D['ca0'] else (a - D['ca1']) / (D['a1'] - D['ca1']); return D['xi'] + (D['xo'] - D['xi']) * t


def doors():
    out = []; D = NDOOR
    for sx in (1, -1):
        for tag, a0_, a1_, nt_ in (('door_f_', D['am'] + 0.006, D['a1'], 'задняя створка передней стойки, у самой ноги: при выпущенной стойке открыта (12, 13)'), ('door_n_', D['a0'], D['am'] - 0.006, 'передняя створка передней стойки: при выпущенной стойке снова закрыта, открывается только на время уборки')):
            n_ = tag + ('r' if sx > 0 else 'l'); ob = patch(n_, lambda u, v: (a0_ + (a1_ - a0_) * v, sx * (0.004 + (D['hw'] - 0.004) * u)), 8, 10, dirn=1, lift=0.002, th=0.012, z0=-4.0)
            pv = P3((a0_ + a1_) / 2, sx * D['hw'], down(sx * D['hw'], Yb((a0_ + a1_) / 2), z0=-4.0, dirn=1).z - 0.004); _rel(ob, pv)
            PARTS[n_] = dict(pivot=pv.copy(), axis=Vector((0, -sx, 0)), range=(0.0, 72.0), note=nt_ + '; шарнир у края, плюс - внутренняя кромка вниз'); out.append(ob)
    D = MDOOR
    for sx in (1, -1):
        n_ = 'door_m_' + ('r' if sx > 0 else 'l'); ob = patch(n_, lambda u, v: (D['a0'] + (D['a1'] - D['a0']) * v, sx * (D['x0'] + (X_DM(D['a0'] + (D['a1'] - D['a0']) * v) - 0.006 - D['x0']) * u)), 18, 16, dirn=1, lift=0.002, th=0.014, z0=-4.0)
        pv = P3((D['a0'] + D['a1']) / 2, sx * D['x0'], down(sx * D['x0'], Yb((D['a0'] + D['a1']) / 2), z0=-4.0, dirn=1).z - 0.004); _rel(ob, pv)
        PARTS[n_] = dict(pivot=pv.copy(), axis=Vector((0, sx, 0)), range=(0.0, 92.0), note='внутренняя створка основной стойки: при выпущенной стойке снова закрыта, открывается только на время уборки; шарнир у оси самолёта, плюс - наружная кромка вниз'); out.append(ob)
        n_ = 'door_o_' + ('r' if sx > 0 else 'l'); ob = patch(n_, lambda u, v: (D['a0'] + (D['a1'] - D['a0']) * v, sx * (X_DM(D['a0'] + (D['a1'] - D['a0']) * v) + (D['x1'] - X_DM(D['a0'] + (D['a1'] - D['a0']) * v)) * u)), 12, 16, dirn=1, lift=0.002, th=0.014, z0=-4.0)
        pv = P3(MAIN_T[0], sx * MAIN_T[1], MAIN_T[2]); _rel(ob, pv)
        PARTS[n_] = dict(pivot=pv.copy(), axis=Vector((0, -sx, 0)), range=(0.0, 90.0), note='большая створка на основной стойке: на оси стойки и ходит вместе с ней; плюс - открыта, висит вдоль ноги, сужается книзу'); out.append(ob)
    return out


def gear_bays(host):
    D = NDOOR; rg = lambda a: [P3(a, -D['hw'] - 0.004, -1.4), P3(a, D['hw'] + 0.004, -1.4), P3(a, D['hw'] + 0.004, -0.10), P3(a, -D['hw'] - 0.004, -0.10)]
    c = loft_obj('c_bay', [rg(D['a0'] - 0.005), rg(D['a1'] + 0.005)], G_DARK, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    D = MDOOR
    for sx in (1, -1):
        rg = lambda a: [P3(a, sx * (D['x0'] - 0.004), -1.4), P3(a, sx * (D['x1'] + 0.003), -1.4), P3(a, sx * (D['x1'] + 0.003), -0.69), P3(a, sx * 1.60, -0.655), P3(a, sx * 1.05, -0.635), P3(a, sx * 0.78, -0.62), P3(a, sx * 0.70, -0.40), P3(a, sx * (D['x0'] - 0.004), -0.25)]
        c = loft_obj('c_bay', [rg(D['a0'] - 0.005), rg(D['a1'] + 0.005)], G_DARK, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)


def build_skin():
    S = [hull(), spine(), shroud(), fin(), fin_fair(), ventral(), cheek(1), cheek(-1), wing_s(1), wing_s(-1), canard_s(1), canard_s(-1), fairings(1), fairings(-1), tail_plate(1), tail_plate(-1)]
    host = S[0]
    for o in S[1:]:
        _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        c = duct_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = bore_cut(0); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = cock_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'VG_skin'; host.data.name = 'VG_skin'; bvh_ready(host); return host


def plane(stage=9, carve=True):
    """Этапы: 1 - обшивка; 2 - рули, сопло; 3 - кабина, фонарь, пилоны, детали; 4 - шасси и створки."""
    import viggen_detail as d
    PARTS.clear(); PYLON_PTS.clear()
    import types
    skin = build_skin(); out = [skin]; ref_me = skin.data.copy(); d.resharp(types.SimpleNamespace(data=ref_me))   # гладкая обшивка до резки: с неё берутся нормали
    if stage >= 2:
        out += [rudder(), nozzle(0), d.burner(0)]
        for sx in (1, -1):
            out.append(canard_flap(sx)); out += [elevon(i, sx) for i in range(3)]
    if stage >= 3:
        out += [d.cockpit_detail()] + canopy() + windscreen()
        bvh_ready(skin)
        for sx in (1, -1):
            for tag, x, a0, a1, y0 in PYLON_DEF: out.append(pylon(sx, tag, x, a0, a1, y0))
        out += [d.details(), d.seals()] + d.hardpoints() + [d.plates()]
    if stage >= 4:
        out += doors()
        import viggen_gear as gr; out += gr.gear_nose() + gr.gear_main(1) + gr.gear_main(-1)
    if carve: print('канавок и выемок:', d.carve(skin))
    if stage >= 4: gear_bays(skin)
    d.resharp(skin); print('нормали обшивки:', d.smooth_normals(skin, ref_me)); bpy.data.meshes.remove(ref_me)
    return out
