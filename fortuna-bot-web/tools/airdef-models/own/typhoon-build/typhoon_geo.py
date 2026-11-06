# typhoon_geo.py - геометрия Eurofighter Typhoon для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z.
# a - расстояние от острия носа, y - высота над осью корпуса. План снят с typhoon_13 (длина и размах по нынешней модели 15,96 и 11,07), бок с typhoon_01.
import math
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 15.96
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


def bore_cut(sx):
    a1 = NAC_A1; cx = sx * NOZ_X; n = 56
    ring = lambda a, r: [P3(a, cx + r * math.sin(2 * math.pi * k / n), NOZ_Y - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    prof = [(a1 + 0.25, 0.400, G_METAL), (a1 - 0.18, 0.400, G_METAL), (a1 - 0.22, 0.375, G_METAL), (a1 - 0.30, 0.375, G_METAL), (a1 - 0.34, 0.400, G_METAL), (a1 - 0.80, 0.405, G_COCK), (a1 - 1.10, 0.405, G_DARK), (a1 - 1.50, 0.260, G_DARK), (a1 - 1.62, 0.040, G_DARK)]
    b = B(); b.loft([ring(a, r) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK)
    return b.finish('c_bore', sharp_deg=30)


def nozzle(sx):
    b = B(); cx = sx * NOZ_X; N = 14; a0 = NAC_A1 + 0.002; a1 = NOZ_A; aM = a0 + 0.120; aP = a0 + 0.125
    def ptp(a, r, ang): return P3(a, cx + r * math.sin(ang), NOZ_Y - r * math.cos(ang))
    ring = lambda a, r, nn=56: [ptp(a, r, 2 * math.pi * k / nn) for k in range(nn)]
    def box_sect(a, r, ang, hw_ang, th): return [ptp(a, r, ang - hw_ang), ptp(a, r, ang + hw_ang), ptp(a, r + th, ang + hw_ang), ptp(a, r + th, ang - hw_ang)]
    R0 = 0.425
    sec = [ring(a0 - 0.02, R0 - 0.01), ring(a0 + 0.015, R0 + 0.015), ring(a0 + 0.12, R0 + 0.015), ring(aM, R0 - 0.01), ring(aM, R0 - 0.055), ring(a0 - 0.02, R0 - 0.065)]
    b.loft(sec + [sec[0]], G_METAL)
    b.loft([ring(aM - 0.01, R0 - 0.058), ring(aP + 0.06, R0 - 0.068)], G_DARK)
    Rp = lambda a: (R0 - 0.015) + (NOZ_R - (R0 - 0.015)) * (a - aP) / (a1 - aP)
    hwo = math.pi / N * 1.03; th = 0.014
    for j in range(N):
        am = 2 * math.pi * j / N
        def petal(a):
            r = Rp(a); o = []; i_ = []
            for q in range(5):
                t_ = q / 4; ang = am - hwo + 2 * hwo * t_; lift = 0.007 * (1 - t_)
                o.append(ptp(a, r + lift, ang)); i_.append(ptp(a, r + lift - th, ang))
            return o + i_[::-1]
        b.loft([petal(aP), petal(aP + (a1 - aP) * 0.5), petal(a1)], G_METAL, cap0=G_METAL, cap1=G_METAL)
        ang_h = 0.024
        b.loft([box_sect(aP + 0.04, Rp(aP + 0.04) + 0.005, am, ang_h, 0.012), box_sect(a1 - 0.10, Rp(a1 - 0.10) + 0.005, am, ang_h, 0.012)], G_METAL, cap0=G_METAL, cap1=G_METAL)
        b.loft([box_sect(a1 - 0.075, NOZ_R + 0.006, am + math.pi / N, 0.040, 0.010), box_sect(a1, NOZ_R + 0.006, am + math.pi / N, 0.040, 0.010)], G_METAL, cap0=G_METAL, cap1=G_METAL)
        hwi = math.pi / N * 0.97
        b.loft([box_sect(a1 - 0.002, NOZ_R - th - 0.003, am, hwi, -0.006), box_sect(a1 - 0.50, 0.330, am, hwi, -0.006), box_sect(a0 + 0.03, 0.398, am, hwi, -0.006)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('nozzle_' + ('r' if sx > 0 else 'l'), sharp_deg=30)



# ── корпус: одно тело от носа до сопел, спина сглаженным максимумом ──
HULL = [  # a, верх, низ, полуширина, nверх, nниз
    (0.00, -0.055, -0.065, 0.006, 2.0, 2.0), (0.40, 0.100, -0.130, 0.110, 2.0, 2.0), (1.20, 0.390, -0.280, 0.290, 2.0, 2.0), (2.25, 0.730, -0.400, 0.470, 2.0, 2.0),
    (3.00, 0.970, -0.460, 0.580, 2.0, 2.1), (3.60, 1.120, -0.470, 0.640, 1.9, 2.2), (4.40, 1.250, -0.490, 0.720, 1.9, 2.4), (5.00, 1.215, -0.500, 0.770, 1.9, 2.5), (5.40, 1.180, -0.560, 0.800, 1.9, 2.6),
    (6.00, 1.040, -0.605, 0.850, 1.9, 2.7), (7.00, 0.800, -0.610, 0.930, 2.1, 2.8), (8.00, 0.660, -0.620, 1.000, 2.4, 3.0), (9.00, 0.570, -0.620, 1.030, 2.7, 3.0), (10.00, 0.500, -0.620, 1.040, 3.0, 3.0), (11.00, 0.450, -0.620, 1.020, 3.0, 3.0), (12.00, 0.400, -0.620, 0.960, 3.0, 3.0), (13.00, 0.330, -0.620, 0.900, 3.0, 3.0), (14.00, 0.230, -0.600, 0.800, 2.8, 2.8), (14.40, 0.180, -0.560, 0.720, 2.6, 2.6)]
HT = tracks(HULL)
SP_TOP = Lin([(0.0, 0.0), (20.0, 0.0)])     # спина - отдельная деталь, см. spine()
SP_HW = Lin([(0.0, 0.3), (20.0, 0.3)])


def _smax(a_, b_, k=0.14):
    h = max(0.0, min(1.0, 0.5 + 0.5 * (a_ - b_) / k)); return b_ + (a_ - b_) * h + k * h * (1 - h)


def hull_ring(a, n=96):
    top, bot, hw, nt, nb = [t(a) for t in HT]; pts = sup(a, 0.0, top, bot, hw, nt, nb, n); h_ = SP_TOP(a); w_ = SP_HW(a); out = []
    if h_ < 1e-4: return pts
    t0 = top
    for p in pts:
        if p.z > (top + bot) / 2:
            q = abs(p.x) / w_; zs = t0 + h_ * max(0.0, 1 - q * q) ** 1.1 - 0.02 if q < 1 else -9.0; p = Vector((p.x, p.y, _smax(p.z, zs)))
        out.append(p)
    return out


def hull(): return loft_obj('s_hull', [hull_ring(a) for a in stations(0.0, 2.25, 0.20)[:-1] + stations(2.25, 14.40, 0.22)], G_SKIN, sharp=38)


def top_y(a, x):
    """Высота верха корпуса над |x| (для порога фонаря): без спины."""
    top, bot, hw, nt, nb = [t(a) for t in HT]; cy = (top + bot) / 2; ht = (top - bot) / 2; q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nt); return cy + ht * q ** (1 / nt)


# ── гондолы и балка ──
NAC_A1 = 14.40; NOZ_X = 0.475; NOZ_Y = -0.30; NOZ_A = 15.28; NOZ_R = 0.355
NAC = [(10.4, -0.10, -0.60, 0.34, 2.2), (11.2, 0.08, -0.72, 0.43, 2.1), (11.8, 0.15, -0.75, 0.46, 2.0), (14.22, 0.16, -0.76, 0.46, 2.0), (14.40, 0.145, -0.745, 0.445, 2.0)]; NT = tracks(NAC)


def nacelle(sx):
    n = 64
    def ring(a):
        top, bot, hw, e = [t(a) for t in NT]; return sup(a, sx * NOZ_X, top, bot, hw, e, e, n)
    rs = [ring(a) for a in stations(10.4, NAC_A1, 0.20)]; a1 = NAC_A1
    rs.append([P3(a1 + 0.012, sx * NOZ_X + 0.405 * math.sin(2 * math.pi * k / n), NOZ_Y - 0.405 * math.cos(2 * math.pi * k / n)) for k in range(n)])
    return loft_obj('s_nac_' + ('r' if sx > 0 else 'l'), rs, G_SKIN, sharp=40)


def spine():
    """Спина отдельной деталью: одна прямая от конца фонаря назад; у кабины высокая и широкая, к хвосту узкая балка, за соплами - контейнер (снимки 02, 03, 05, 07)."""
    Z = lambda a: 1.22 - 0.0779 * (a - 5.75)
    W_ = Track([(5.74, 0.370), (7.0, 0.420), (9.0, 0.400), (11.0, 0.300), (12.5, 0.210), (14.0, 0.140), (15.4, 0.125), (15.62, 0.050)]); H_ = Track([(5.74, 0.50), (9.0, 0.44), (12.0, 0.33), (13.2, 0.22), (14.0, 0.14), (15.4, 0.125), (15.62, 0.05)])
    NS = lambda a: 3.2 - 0.9 * min(1.0, max(0.0, (a - 5.74) / 1.2))     # у фонаря сечение полнее: закрывает кольцо рамы без щели
    return loft_obj('s_spine', [sup(a, 0.0, Z(a), Z(a) - 2 * H_(a), W_(a), NS(a), 2.3, 48) for a in stations(5.74, 15.40, 0.24) + [15.52, 15.62]], G_SKIN, sharp=40)


def keel():
    """Балка между соплами (typhoon_03, 05, 09)."""
    T = tracks([(12.6, 0.50, -0.60, 0.16), (13.1, 0.50, -0.76, 0.16), (13.8, 0.46, -0.76, 0.14), (14.40, 0.30, -0.72, 0.10), (14.85, -0.05, -0.50, 0.04)])
    return loft_obj('s_keel', [sup(a, 0.0, T[0](a), T[1](a), T[2](a), 2.6, 2.6, 24) for a in stations(12.6, 14.85, 0.25)])


# ── воздухозаборник: широкий короб под носом, косой срез, перегородка ──
INL_A0 = 4.70; INL_A1 = 9.70; INL_LIP = (4.95, 5.55)   # верх среза, низ среза (нижняя кромка отдельной деталью)
IB = tracks([(4.40, -0.40, -0.98, 0.90), (5.60, -0.34, -1.06, 0.98), (7.5, -0.30, -1.02, 1.02), (9.0, -0.30, -0.88, 1.04), (9.70, -0.30, -0.70, 1.04)])


SMILE = 0.06
def smile(x): return SMILE * (abs(x) / 0.96) ** 2


def rr_ring(a, n=128, sx0=0.0):
    top, bot, hw = [t(a) for t in IB]; fs = (0.2, 0.35, 0.5, 0.65, 0.8, 0.92)
    R_ = [(f * hw, bot + SMILE * f * f) for f in fs]
    return poly_ring(a, [(0.0, bot)] + R_ + [(hw, bot + SMILE), (hw, top), (-hw, top), (-hw, bot + SMILE)] + [(-x_, y_) for x_, y_ in reversed(R_)], n, [0.0] + [0.02] * 6 + [0.05, 0.08, 0.08, 0.05] + [0.02] * 6)


def inlet_box(): return loft_obj('s_inl', [rr_ring(a) for a in stations(INL_A0 - 0.3, INL_A1, 0.30)], G_SKIN, sharp=25)


def lip_cut():
    """Косой срез короба: верх впереди, низ сзади."""
    aT, aB = INL_LIP; P = lambda da, y, x: P3(aT + (aB - aT) * (-0.38 - y) / 0.68 + da, x, y)
    rg = lambda da: [P(da, -1.3, -1.4), P(da, -1.3, 1.4), P(da, -0.36, 1.4), P(da, -0.36, -1.4)]
    b = B(); b.loft([rg(-1.2), rg(0.0)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); return b.finish('c_lip', sharp_deg=30)


DUCT_XI = 0.235


def duct_cut(sx):
    """Канал вглубь и вверх, глухой торец: плавно темнеет, колец и полос нет."""
    a0, a1 = 4.98, 7.9; rings = []
    for i in range(11):
        a = a0 + (a1 - a0) * i / 10; t = max(0.0, min(1.0, (a - 5.5) / (a1 - 5.5))); t = t * t * (3 - 2 * t); xi = 0.055 + (DUCT_XI - 0.055) * min(1.0, max(0.0, (a - 5.0) / 0.7)); xo = 0.91 - 0.28 * t; y0 = -0.97 + 0.30 * t; y1 = -0.54 + 0.02 * t; yo = -0.50 - 0.02 * t; fl = lambda q: y0 + smile(q) * (1 - t); fs = (0.15, 0.3, 0.45, 0.6, 0.75, 0.88); xf = lambda f: xi + (xo - xi) * f; tp = lambda f: y1 + (yo - y1) * f
        rings.append(poly_ring(a, [(sx * xi, fl(xi))] + [(sx * xf(f), fl(xf(f))) for f in fs] + [(sx * xo, fl(xo)), (sx * xo, yo)] + [(sx * xf(f), tp(f)) for f in reversed(fs)] + [(sx * xi, y1)], 112, [0.05] + [0.015] * 6 + [0.035, 0.035] + [0.015] * 6 + [0.05]))
    return loft_obj('c_duct', rings, G_COCK, sharp=25)


def splitter():
    """Перегородка посередине: тонкая плита вперёд от канала."""
    a0, a1 = 4.98, 6.0; b = B(); hw = 0.052; ring = lambda a, y0, y1, w: [P3(a, -w, y0), P3(a, w, y0), P3(a, w, y1), P3(a, -w, y1)]
    y0 = lambda a: -0.50 - 0.455 * min(1.0, max(0.0, (a - 4.98) / 0.32))
    b.loft([ring(a0, -0.50, -0.36, 0.010), ring(a0 + 0.06, y0(a0 + 0.06), -0.36, 0.028), ring(a0 + 0.32, y0(a0 + 0.32), -0.36, hw), ring(5.62, -0.955, -0.36, hw), ring(a1, -0.985, -0.36, hw)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('s_split', sharp_deg=30)


LIP = dict(aF=5.10, aR=5.60, hw=0.900, y=-1.06, top=-0.965)
def lip_dy(x): return smile(x)      # и верх, и низ кромки повторяют изгиб проёма


def lip_bay():
    """Выемка под кромку в полу короба: повторяет загиб кромки вверх у стенок, стенки остаются."""
    L_ = LIP; W = L_['hw'] + 0.006; xs = [W * (-1 + 2 * i / 36) for i in range(37)]
    rg = lambda a: [P3(a, -W, -1.3), P3(a, W, -1.3)] + [P3(a, x, L_['top'] + 0.004 + lip_dy(x)) for x in reversed(xs)]
    return loft_obj('c_lipbay', [rg(4.85), rg(L_['aR'] + 0.008)], G_COCK, sharp=30)


def inlet_lip():
    """Подвижная нижняя кромка: ось у задней стенки, минус - передняя кромка вниз. В плане скруглена к стенкам, концы загнуты вверх и переходят в скругление угла."""
    L_ = LIP; b = B(); aR = L_['aR']; hw = L_['hw']; yb = L_['y']; pv = P3(aR - 0.035, 0.0, (yb + L_['top']) / 2); n = 36
    def ring(x):
        q = abs(x) / hw; aF = L_['aF'] + 0.16 * q ** 5; y = yb + lip_dy(x); top = L_['top'] + lip_dy(x); h = top - y; m = (y + top) / 2
        return [P3(aR - 0.035, x, y) - pv, P3(aF + 0.20, x, y + 0.002) - pv, P3(aF + 0.05, x, y + 0.012) - pv, P3(aF + 0.005, x, y + 0.45 * h) - pv, P3(aF + 0.03, x, y + 0.86 * h) - pv, P3(aF + 0.16, x, top) - pv, P3(aR - 0.035, x, top) - pv, P3(aR - 0.002, x, m) - pv]
    st = [-hw + 2 * hw * i / n for i in range(n + 1)]; b.loft([ring(x) for x in st], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); ob = b.finish('inlet_lip', sharp_deg=50); ob.location = pv
    PARTS['inlet_lip'] = dict(pivot=pv.copy(), axis=Vector((1, 0, 0)), range=(-24.0, 0.0), note='нижняя кромка воздухозаборника: ось сзади; минус - передняя кромка вниз')
    return ob


# ── крыло: дельта со сломанной задней кромкой ──
WLE = Lin([(0.70, 5.23), (5.40, 11.27)]); WTE = Lin([(0.70, 12.72), (3.30, 13.10), (5.40, 12.80)])
def wy(x): return -0.28 - 0.030 * max(0.0, x - 1.2)
TC = Lin([(0.7, 0.045), (5.4, 0.030)])
FLAP_I = (1.36, 3.24); FLAP_O = (3.34, 5.20); SLAT_I = (1.95, 3.58); SLAT_O = (3.62, 5.20); GAP = 0.012
HING = Lin([(1.36, 11.92), (3.24, 12.22), (3.34, 12.40), (5.20, 12.22)])
SLC = Lin([(1.95, 0.56), (3.60, 0.38), (5.20, 0.24)])


def in_(x, r): return r[0] <= x <= r[1]


def _wsec(sx, x):
    c = WTE(x) - WLE(x); us = SLC(x) / c if (in_(x, SLAT_I) or in_(x, SLAT_O)) else 0.0; ue = (HING(x) - WLE(x)) / c if (in_(x, FLAP_I) or in_(x, FLAP_O)) else 1.0
    return foil_ring(WLE(x), c, TC(x), us, ue, 18, lambda a, h: P3(a, sx * x, wy(x) + h))


def wing_s(sx):
    xs = {0.70, 1.00, 1.355, 1.36, 1.945, 1.95, 3.24, 3.245, 3.335, 3.34, 3.58, 3.585, 3.615, 3.62, 5.20, 5.205, 5.40}
    for r in (FLAP_I, FLAP_O, SLAT_I, SLAT_O):
        for i in range(1, 6): xs.add(round(r[0] + (r[1] - r[0]) * i / 6, 4))
    return loft_obj('s_wing_' + ('r' if sx > 0 else 'l'), [_wsec(sx, x) for x in sorted(xs)], sharp=48)


def wing_part(name, spec, sx, note, rng):
    x0, x1 = spec[0] + 0.006, spec[1] - 0.006; HG = HING
    pv0 = P3(HG(x0) + GAP + 0.04, sx * x0, wy(x0)); pv1 = P3(HG(x1) + GAP + 0.04, sx * x1, wy(x1)); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    for i in range(9):
        x = x0 + (x1 - x0) * i / 8; c = WTE(x) - WLE(x); rings.append([v - pivot for v in foil_ring(WLE(x), c, TC(x), (HG(x) - WLE(x) + GAP) / c, 1.0, 9, lambda a, h: P3(a, sx * x, wy(x) + h), nose=0.11)])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot; PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=rng, note=note); return ob


def slat(name, spec, sx):
    xa, xb = spec[0] + 0.012, spec[1] - 0.028
    lo_ = lambda x_: wy(x_) - TC(x_) * (WTE(x_) - WLE(x_)) * thk(SLC(x_) / (WTE(x_) - WLE(x_))) - 0.003
    p0 = P3(WLE(xa) + SLC(xa) - GAP, sx * xa, lo_(xa)); p1 = P3(WLE(xb) + SLC(xb) - GAP, sx * xb, lo_(xb)); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized()
    if axis.x > 0: axis = -axis
    def sec(x):
        c = WTE(x) - WLE(x); return [v - pivot for v in foil_ring(WLE(x), c, TC(x), 0.0, (SLC(x) - GAP) / c, 12, lambda a, h: P3(a, sx * x, wy(x) + h))]
    ob = loft_obj(name, [sec(xa + (xb - xa) * i / 6) for i in range(7)], sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(0.0, 16.0), note='предкрылок: ось по нижней кромке; плюс - носок вниз'); return ob


def tip_pod(sx):
    """Контейнер на законцовке: постоянный, спереди антенна, сзади огонь и антенны (typhoon_01, 03, 11)."""
    x = 5.47; y = wy(5.40) - 0.01; b = B(); n = 14; hw = 0.082
    rg = lambda a, k, dy=0.0: [P3(a, sx * x + k * hw * math.cos(2 * math.pi * q / n), y + dy + k * 0.098 * math.sin(2 * math.pi * q / n)) for q in range(n)]
    prof = ([(10.28, 0.03), (10.38, 0.34), (10.56, 0.66), (10.86, 0.92), (11.3, 1.0), (13.0, 1.0), (13.25, 0.92)] + ([(13.45, 0.72), (13.52, 0.30), (13.54, 0.04)] if sx > 0 else [(13.42, 0.78), (13.46, 0.62), (13.62, 0.40), (13.66, 0.05)]))
    b.loft([rg(a, k) for a, k in prof], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    # перемычка крыло - контейнер
    sec = lambda a: [P3(a, sx * 5.38, y - 0.012), P3(a, sx * (x - 0.03), y - 0.03), P3(a, sx * (x - 0.03), y + 0.03), P3(a, sx * 5.38, y + 0.012)]
    b.loft([sec(11.35), sec(12.75)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('tip_pod_' + ('r' if sx > 0 else 'l'), sharp_deg=48)


# ── утки: цельноповоротные, ось в обтекателе на борту, наклон вниз ──
CAN = dict(x0=0.640, y0=-0.030, a_le=2.72, a_te=3.98, a_tle=3.86, a_tte=4.28, span=1.20, th0=0.095, th1=0.018); CAN_U = Vector((0.985, 0.0, -0.17)).normalized(); CAN_GAP = 0.012


def can_pt(a, s, h, sx):
    U = CAN_U; n = Vector((-U.z, 0, U.x)); p = Vector((CAN['x0'], 0, CAN['y0'])) + U * s + n * h; return P3(a, sx * p.x, p.z)


def canard(sx):
    name = 'canard_' + ('r' if sx > 0 else 'l'); T = CAN; s0 = CAN_GAP; rings = []
    for i in range(6):
        k = i / 5; s = s0 + (T['span'] - s0) * k; a0 = T['a_le'] + (T['a_tle'] - T['a_le']) * k; a1 = T['a_te'] + (T['a_tte'] - T['a_te']) * k; c = a1 - a0; th = T['th0'] + (T['th1'] - T['th0']) * k
        rings.append([can_pt(a0, s, 0, sx), can_pt(a0 + c * 0.25, s, th * 0.34, sx), can_pt(a0 + c * 0.55, s, th / 2, sx), can_pt(a0 + c * 0.82, s, th * 0.28, sx), can_pt(a1, s, 0, sx), can_pt(a0 + c * 0.82, s, -th * 0.28, sx), can_pt(a0 + c * 0.55, s, -th / 2, sx), can_pt(a0 + c * 0.25, s, -th * 0.34, sx)])
    aP = 3.52; pivot = can_pt(aP, 0, 0, sx); axis = (can_pt(aP, 1, 0, sx) - pivot).normalized(); b = B(); b.loft([[v - pivot for v in r] for r in rings], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); ob = b.finish(name, sharp_deg=22); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-28.0, 28.0), note='цельноповоротная утка, ось вдоль размаха в обтекателе'); return ob


def canard_boss(sx):
    """Обтекатель оси на борту: верх поперечен оси вращения."""
    T = CAN; a0, a1 = T['a_le'] - 0.34, T['a_te'] + 0.46; c = a1 - a0; h = 0.075
    ring = lambda s, k: [can_pt(a0 + c * t, s, f * (h + k), sx) for t, f in ((0.0, 0.0), (0.18, 0.75), (0.5, 1.0), (0.8, 0.8), (1.0, 0.0), (0.8, -0.8), (0.5, -1.0), (0.18, -0.75))]
    b = B(); b.loft([ring(-0.34, 0.03), ring(-0.03, 0.01), ring(0.0, 0.0)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); return b.finish('c_cb', sharp_deg=25)


# ── киль и руль ──
FIN_Y0, FIN_Y1 = 0.62, 3.05
F_LE = Lin([(0.45, 11.72), (FIN_Y0, 11.96), (FIN_Y1, 15.09)]); F_TE = Lin([(0.45, 14.85), (FIN_Y0, 14.96), (FIN_Y1, 15.96)])
RUD = (0.98, 2.62); RUD_C = Lin([(0.98, 0.78), (2.62, 0.40)])
def ftc(y): return 0.050 - 0.020 * (y - 0.45) / 2.6


def fin():
    ys = [0.45, 0.62, 0.80, 0.975, 0.98] + [0.98 + (2.62 - 0.98) * i / 6 for i in range(1, 7)] + [2.625, 2.80, 2.95, 3.05]; rings = []
    for y in ys:
        c = F_TE(y) - F_LE(y); ue = 1 - RUD_C(y) / c if RUD[0] <= y <= RUD[1] else 1.0
        rings.append(foil_ring(F_LE(y), c, ftc(y), 0.0, ue, 16, lambda a, h: P3(a, h, y)))
    return loft_obj('fin', rings, sharp=48)


def rudder():
    y0, y1 = RUD; h0 = F_TE(y0) - RUD_C(y0) + GAP + 0.03; h1 = F_TE(y1) - RUD_C(y1) + GAP + 0.03; p0 = P3(h0, 0, y0); p1 = P3(h1, 0, y1); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized(); rings = []
    for i in range(9):
        y = y0 + 0.024 + (y1 - y0 - 0.048) * i / 8; c = F_TE(y) - F_LE(y); rings.append([v - pivot for v in foil_ring(F_LE(y), c, ftc(y), 1 - (RUD_C(y) - 0.022) / c, 1.0, 9, lambda a, h: P3(a, h, y), nose=0.14)])
    ob = loft_obj('rudder', rings, sharp=48); ob.location = pivot
    PARTS['rudder'] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-30.0, 30.0), note='ось по передней кромке руля, снизу вверх'); return ob


def fin_fair():
    """Утолщение у основания киля, контейнер сзади, обтекатель на вершине (typhoon_01, 03, 05)."""
    b = B(); n = 12
    def cig(prof, cx, cy, kx=1.0):
        b.loft([[P3(a, cx + r * kx * math.cos(2 * math.pi * q / n), cy + r * math.sin(2 * math.pi * q / n)) for q in range(n)] for a, r in prof], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for sg in (1, -1):
        cig([(11.55, 0.012), (11.85, 0.070), (12.4, 0.095), (13.4, 0.095), (13.75, 0.05), (13.95, 0.012)], sg * 0.20, 0.66, 1.0)         # боковые обтекатели у корня
    pass                                   # контейнер сзади у основания
    rg = lambda y, f: foil_ring(F_LE(y) - 0.012, F_TE(y) - F_LE(y) + 0.02, ftc(y) * 1.2 * f, 0.0, 1.0, 16, lambda a, h: P3(a, h, y))
    b.loft([rg(2.75, 0.2), rg(2.80, 1.0), rg(3.03, 1.0), rg(3.06, 0.3)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)                             # темная вершина
    return b.finish('fin_fair', sharp_deg=30)


# ── фонарь: рама одним кольцом, петля сзади ──
CANOPY = [(2.50, top_y(2.50, 0.0) + 0.004, 0.160), (3.06, 1.060, 0.360), (3.49, 1.270, 0.460), (3.84, 1.430, 0.510), (4.37, 1.530, 0.530), (5.00, 1.490, 0.500), (5.40, 1.380, 0.430), (5.75, 1.220, 0.300)]; CAN_T = tracks(CANOPY)
ARCH_A = 3.95; CAN_A1 = 5.75; CAN_H = (5.87, 1.30)
def SILL(a): return top_y(a, CAN_T[1](a))
def CK_HW(a): return CAN_T[1](a) - 0.022


def can_ring(a, inset=0.0, n=44):
    top, hw = CAN_T[0](a) - inset, CAN_T[1](a) - inset; y0 = SILL(a) + 0.002; out = []
    for k in range(n):
        c = math.cos(math.pi * k / (n - 1)); s = math.sin(math.pi * k / (n - 1)); out.append(P3(a, math.copysign(hw * abs(c) ** 0.70, c), y0 + (top - y0) * s ** 0.82))
    return out


def frame_arch(b, a, w, inset=0.008, h=0.020, n=44, drop=0.0):
    ri0 = can_ring(a - w, inset, n); ro0 = can_ring(a - w, -h, n); ro1 = can_ring(a + w, -h, n); ri1 = can_ring(a + w, inset, n)
    if drop: ri0 = [p - Vector((0, 0, drop)) for p in ri0]; ri1 = [p - Vector((0, 0, drop)) for p in ri1]
    strip(b, [ri0, ro0, ro1, ri1, ri0], G_SKIN)


def _rail(b, sg, a0, a1, d0=0.004, d1=0.020):
    st = stations(a0, a1, 0.12); rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
    b.loft([[rail(a, d0 - 0.018, -0.004), rail(a, d1, -0.004), rail(a, d1, 0.020), rail(a, d0 - 0.016, 0.042)] for a in st], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)


def canopy():
    a0 = ARCH_A; a1 = CAN_A1; st = stations(a0 + 0.004, a1, 0.14); pv = P3(CAN_H[0], 0.0, CAN_H[1])
    gb = B(); strip(gb, [can_ring(a) for a in st], G_GLASS); gl = gb.finish('canopy_glass', sharp_deg=60)
    for v in gl.data.vertices: v.co -= pv
    gl.location = pv
    b = B(); frame_arch(b, a0 + 0.034, 0.034, inset=-0.010, h=0.030, drop=0.0)
    for sg in (1, -1): _rail(b, sg, a0 + 0.075, 5.30)
    strip(b, [can_ring(a1 - 0.05, 0.016), can_ring(a1 - 0.05, -0.006), can_ring(a1, -0.006), can_ring(a1, 0.016), can_ring(a1 - 0.05, 0.016)], G_SKIN)
    for x_, y_ in ((0.0, CAN_T[0](ARCH_A) - 0.015),):
        A_ = ARCH_A + 0.05; b.loft([[P3(A_ + 0.02, x_ - 0.05, y_ - 0.02), P3(A_ + 0.02, x_ + 0.05, y_ - 0.02), P3(A_ + 0.02, x_ + 0.05, y_ + 0.02), P3(A_ + 0.02, x_ - 0.05, y_ + 0.02)], [P3(A_, x_ - 0.05, y_ - 0.02), P3(A_, x_ + 0.05, y_ - 0.02), P3(A_, x_ + 0.05, y_ + 0.02), P3(A_, x_ - 0.05, y_ + 0.02)]], G_DARK, cap0=G_DARK, cap1=G_DARK)
    fr = b.finish('canopy', sharp_deg=45)
    for v in fr.data.vertices: v.co -= pv
    fr.location = pv; gl.parent = fr; gl.location = (0, 0, 0)
    PARTS['canopy'] = dict(pivot=pv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 42.0), note='петля сзади; плюс - передняя кромка вверх; canopy_glass - дочерний объект')
    return [fr, gl]


def windscreen():
    a1 = ARCH_A - 0.02; st = stations(2.58, a1, 0.09); bg = B(); strip(bg, [can_ring(a) for a in st], G_GLASS); gl = bg.finish('screen_glass', sharp_deg=60)
    b = B(); frame_arch(b, ARCH_A - 0.028, 0.026, inset=0.030, h=0.004, drop=0.012); frame_arch(b, 2.60, 0.030, inset=0.035, h=0.010, drop=0.07)
    for sg in (1, -1): _rail(b, sg, 2.60, a1)
    return [gl, b.finish('screen_frame', sharp_deg=45)]


def cock_cut():
    st = stations(3.20, 5.77, 0.07); rg = lambda a: [P3(a, -CK_HW(a), 0.22), P3(a, CK_HW(a), 0.22), P3(a, CK_HW(a), 1.9), P3(a, -CK_HW(a), 1.9)]
    return loft_obj('c_cock', [rg(a) for a in st], G_COCK, sharp=25)


# ── пилоны: три под крылом и балка под бортом ──
PYLON_DEF = (('o', 4.35, 10.75, 12.05, -0.66), ('m', 3.35, 9.85, 11.65, -0.74), ('i', 2.35, 8.55, 11.05, -0.82)); CANT = 0.0
def pylon(sx, tag, x, a0, a1, y0):
    b = B(); name = f'pylon_{tag}_' + ('r' if sx > 0 else 'l'); yw = wy(x) - 0.02; hw = 0.058
    def sec(a, f=1.0): return [P3(a, sx * x - hw * f, y0), P3(a, sx * x + hw * f, y0), P3(a, sx * x + hw * f * 0.85, yw), P3(a, sx * x - hw * f * 0.85, yw)]
    st = [a0, a0 + 0.14, a0 + 0.45, a1 - 0.50, a1 - 0.14, a1]; fs = [0.10, 0.70, 1.0, 1.0, 0.65, 0.10]
    b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); PYLON_PTS[name] = P3((a0 + a1) / 2, sx * x, y0); PYLON_PTS[name + '_root'] = P3((a0 + a1) / 2, sx * x, yw)
    return b.finish(name, sharp_deg=40)


def side_rail(sx):
    """Точка под бортом: балка вдоль низа корпуса (typhoon_08, 09, 13)."""
    a0, a1, x, y0 = 8.20, 12.60, 0.70, -0.84; b = B(); hw = 0.052; yt = -0.30; name = 'pylon_c_' + ('r' if sx > 0 else 'l')
    sec = lambda a, f: [P3(a, sx * x - hw * f, y0), P3(a, sx * x + hw * f, y0), P3(a, sx * x + hw * f * 1.5, yt), P3(a, sx * x - hw * f * 1.5, yt)]
    st = [a0, a0 + 0.2, a1 - 0.2, a1]; fs = [0.15, 1.0, 1.0, 0.15]; b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); PYLON_PTS[name] = P3(10.4, sx * x, y0); return b.finish(name, sharp_deg=40)


def pod_mount():
    am, hl, y0, yt = 9.45, 1.0, -0.90, -0.60; b = B(); hw = 0.060
    sec = lambda a, f: [P3(a, -hw * f, y0), P3(a, hw * f, y0), P3(a, hw * f * 1.5, yt), P3(a, -hw * f * 1.5, yt)]
    st = [am - hl, am - hl + 0.15, am + hl - 0.15, am + hl]; fs = [0.2, 1.0, 1.0, 0.2]; b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); PYLON_PTS['pod'] = P3(am, 0.0, y0); return b.finish('pylon_pod', sharp_deg=40)


# ── щиток, штанга, гак ──
SB = dict(a0=7.15, a1=8.55, hw=0.30)


def sb_cut():
    S = SB; st = stations(S['a0'], S['a1'], 0.3)
    rg = lambda a: [P3(a, -S['hw'] - 0.008, 0.58), P3(a, S['hw'] + 0.008, 0.58), P3(a, S['hw'] + 0.008, 1.2), P3(a, -S['hw'] - 0.008, 1.2)]
    return loft_obj('c_sb', [rg(a) for a in st], G_DARK, sharp=20)


def speedbrake():
    """Тормозной щиток на спине: ось спереди, плита по спине; цилиндр отдельно не ходит, в паспорте."""
    S = SB; a0, a1 = S['a0'], S['a1']; ob = patch('speedbrake', lambda u, v: (a0 + 0.006 + (a1 - a0 - 0.012) * v, -S['hw'] + 2 * S['hw'] * u), 10, 12, lift=0.0015, th=0.018)
    pv = P3(a0 + 0.002, 0.0, down(0.0, Yb(a0 + 0.1)).z + 0.012); _rel(ob, pv)
    PARTS['speedbrake'] = dict(pivot=pv.copy(), axis=Vector((1, 0, 0)), range=(-46.0, 0.0), note='ось спереди; минус - задняя кромка вверх'); return ob


PROBE = dict(a0=2.26, a1=2.74, x0=0.26, x1=0.37, y0=0.50, y1=1.2)


def probe_cut():
    P = PROBE; rg = lambda a: [P3(a, P['x0'], P['y0']), P3(a, P['x1'], P['y0']), P3(a, P['x1'], P['y1']), P3(a, P['x0'], P['y1'])]
    return loft_obj('c_probe', [rg(P['a0']), rg(P['a1'])], G_DARK, sharp=20)


def probe():
    """Штанга дозаправки у правого борта носа, люк сверху."""
    x = 0.315; y = 0.575; a_h = 2.70; L_ = 0.40; b = B(); n = 12; pv = P3(a_h, x, y)
    pts = [(0.0, 0.032), (0.22, 0.028), (L_ - 0.10, 0.026), (L_ - 0.07, 0.036), (L_ - 0.02, 0.030), (L_, 0.010)]
    rg = lambda d, r: [P3(a_h - d, x + r * math.cos(2 * math.pi * q / n), y + r * math.sin(2 * math.pi * q / n)) - pv for q in range(n)]
    b.loft([rg(d, r) for d, r in pts], G_METAL, cap0=G_METAL, cap1=G_METAL); ob = b.finish('probe', sharp_deg=40); ob.location = pv
    PARTS['probe'] = dict(pivot=pv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 34.0), note='шарнир сзади; 0 - убрана; плюс - конец вверх и вперёд'); return ob


def probe_door():
    P = PROBE; a0, a1, x0, x1 = P['a0'], P['a1'], P['x0'], P['x1']; ob = patch('probe_door', lambda u, v: (a0 + 0.006 + (a1 - a0 - 0.012) * v, x0 + 0.006 + (x1 - x0 - 0.012) * u), 6, 8, lift=0.0006, th=0.006)
    p0 = down(x1, Yb(a0)); p1 = down(x1, Yb(a1)); pv = (p0 + p1) / 2; axis = (p1 - p0).normalized()
    if axis.y < 0: axis = -axis       # от хвоста к носу: плюс поднимает внутреннюю кромку вверх и наружу
    _rel(ob, pv); PARTS['probe_door'] = dict(pivot=pv.copy(), axis=axis, range=(0.0, 105.0), note='крышка люка штанги; шарнир у наружной кромки'); return ob


def hook():
    a0, a1 = 13.10, 14.75; y0 = -0.78; pv = P3(a0, 0.0, y0 + 0.02); b = B(); yy = Lin([(13.10, -0.78), (14.0, -0.76), (14.75, -0.58)])
    rg = lambda a, r: [P3(a, r * math.cos(2 * math.pi * q / 10), yy(a) + r * math.sin(2 * math.pi * q / 10)) - pv for q in range(10)]
    b.loft([rg(a0, 0.032), rg(a0 + 0.2, 0.040), rg(14.1, 0.028), rg(14.5, 0.018), rg(14.70, 0.016)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    p = P3(14.70, 0.0, yy(14.70)) - pv; q = P3(14.75, 0.0, yy(14.75) - 0.05) - pv; strut(b, p, q, 0.016, G_METAL); strut(b, q, q + Vector((0, 0.08, -0.03)), 0.018, G_METAL); ob = b.finish('hook', sharp_deg=40); ob.location = pv
    PARTS['hook'] = dict(pivot=pv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 28.0), note='0 - убран; плюс - лапа вниз'); return ob


# ── шасси: размеры ──
GROUND_Y = -2.20
NG = dict(a=6.42, hinge=(6.62, -0.62), rw=0.285, ww=0.15, track=0.0)
MG_A, MG_X = 9.05, 1.30; MAIN_T = (9.95, 1.20, -0.42)
NDOOR = dict(a0=5.62, a1=8.30, hw=0.195); MDOOR = dict(a0=8.08, a1=10.05, x0=0.80, x1=1.56)


def doors():
    out = []; D = NDOOR
    for sx in (1, -1):
        n_ = 'door_n_' + ('r' if sx > 0 else 'l'); ob = patch(n_, lambda u, v: (D['a0'] + (D['a1'] - D['a0']) * v, sx * (0.004 + (D['hw'] - 0.004) * u)), 4, 12, dirn=1, lift=0.002, th=0.012, z0=-4.0)
        pv = P3((D['a0'] + D['a1']) / 2, sx * D['hw'], down(sx * D['hw'], Yb((D['a0'] + D['a1']) / 2), z0=-4.0, dirn=1).z - 0.004); _rel(ob, pv)
        PARTS[n_] = dict(pivot=pv.copy(), axis=Vector((0, -sx, 0)), range=(0.0, 88.0), note='створка передней стойки: шарнир у края, плюс - внутренняя кромка вниз'); out.append(ob)
    D = MDOOR
    for sx in (1, -1):
        n_ = 'door_m_' + ('r' if sx > 0 else 'l'); ob = patch(n_, lambda u, v: (D['a0'] + (D['a1'] - D['a0']) * v, sx * (D['x0'] + (D['x1'] - D['x0']) * u)), 10, 10, dirn=1, lift=0.002, th=0.014, z0=-4.0)
        pv = P3((D['a0'] + D['a1']) / 2, sx * D['x0'], down(sx * D['x0'], Yb((D['a0'] + D['a1']) / 2), z0=-4.0, dirn=1).z - 0.004); _rel(ob, pv)
        PARTS[n_] = dict(pivot=pv.copy(), axis=Vector((0, sx, 0)), range=(0.0, 122.0), note='створка основной стойки: шарнир у внутренней кромки, плюс - наружная кромка вниз; низ короба наклонён, поэтому открытая створка висит отвесно при 122 градусах'); out.append(ob)
    return out


def gear_bays(host):
    D = NDOOR; rg = lambda a: [P3(a, -D['hw'] - 0.004, -1.4), P3(a, D['hw'] + 0.004, -1.4), P3(a, D['hw'] + 0.004, -0.13), P3(a, -D['hw'] - 0.004, -0.13)]
    c = loft_obj('c_bay', [rg(D['a0'] - 0.005), rg(D['a1'] + 0.005)], G_DARK, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    D = MDOOR
    for sx in (1, -1):
        rg = lambda a: [P3(a, sx * (D['x0'] - 0.004), -1.4), P3(a, sx * (D['x1'] + 0.006), -1.4), P3(a, sx * (D['x1'] + 0.006), -0.25), P3(a, sx * (D['x0'] - 0.004), -0.13)]
        c = loft_obj('c_bay', [rg(D['a0'] - 0.005), rg(D['a1'] + 0.005)], G_DARK, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)


def build_skin():
    S = [hull(), inlet_box(), keel(), splitter(), spine(), fin(), fin_fair(), nacelle(1), nacelle(-1), wing_s(1), wing_s(-1), tip_pod(1), tip_pod(-1), canard_boss(1), canard_boss(-1)]
    host = S[0]
    box = S[1]; c = lip_cut(); _apply_bool(box, c, 'DIFFERENCE'); _drop(c)
    spl = S[3]
    for o in S[1:]:
        if o is spl: continue
        _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        c = duct_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = lip_bay(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    _apply_bool(host, spl, 'UNION'); _drop(spl)
    for sx in (1, -1):
        c = bore_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = cock_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'TY_skin'; host.data.name = 'TY_skin'; bvh_ready(host); return host


def plane(stage=9, carve=True):
    """Этапы: 1 - обшивка; 2 - рули, сопла, утки; 3 - кабина, фонарь, пилоны, детали; 4 - шасси и створки."""
    import typhoon_detail as d
    PARTS.clear(); PYLON_PTS.clear()
    import types
    skin = build_skin(); out = [skin]; ref_me = skin.data.copy(); d.resharp(types.SimpleNamespace(data=ref_me))   # гладкая обшивка до резки: с неё берутся нормали
    if stage >= 2:
        out += [rudder(), canard(1), canard(-1), inlet_lip(), nozzle(1), nozzle(-1), d.burner(1), d.burner(-1)]
        for sx, n in ((1, 'r'), (-1, 'l')):
            out += [wing_part('flap_i_' + n, FLAP_I, sx, 'внутренняя секция, ось по передней кромке; плюс - вниз', (-25.0, 35.0)), wing_part('flap_o_' + n, FLAP_O, sx, 'внешняя секция, ось по передней кромке; плюс - вниз', (-25.0, 35.0)), slat('slat_i_' + n, SLAT_I, sx), slat('slat_o_' + n, SLAT_O, sx)]
    if stage >= 3:
        out += [d.cockpit_detail()] + canopy() + windscreen()
        out += [speedbrake(), hook(), probe(), probe_door()]
        for fn in (sb_cut, probe_cut):
            c = fn(); _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
        bvh_ready(skin)
        for sx in (1, -1):
            for tag, x, a0, a1, y0 in PYLON_DEF: out.append(pylon(sx, tag, x, a0, a1, y0))
            out.append(side_rail(sx))
        out += [pod_mount(), d.details(), d.seals()] + d.hardpoints() + [d.plates()]
    if stage >= 4:
        out += doors()
        import typhoon_gear as gr; out += gr.gear_nose() + gr.gear_main(1) + gr.gear_main(-1)
    if carve: print('канавок и выемок:', d.carve(skin))
    if stage >= 4: gear_bays(skin)
    d.resharp(skin); print('нормали обшивки:', d.smooth_normals(skin, ref_me)); bpy.data.meshes.remove(ref_me)
    return out
