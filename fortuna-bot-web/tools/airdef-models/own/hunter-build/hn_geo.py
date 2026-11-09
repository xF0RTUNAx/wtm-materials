# hn_geo.py - геометрия Hawker Hunter FGA.9 для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z (в glTF: нос -Z, правое крыло +X, верх +Y). Начало - середина длины 14,0 м по оси сопла.
# a - расстояние от острия носа; таблицы записаны высотой z над землёй (стоянка на своих колёсах), в сетку идёт y = z - ZA (ось сопла).
# Размеры сняты с фото hunter_01 (бок, 102 пикс/м по длине) и согласованы с длиной 14,0 и размахом 10,3 м. Сетки и текстуры чужих моделей не используются.
# Сетка: замкнутые оболочки объединяются булевой операцией в одну обшивку; киль, стабилизаторы, рули - отдельные детали с толщиной.
import math
import types
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 14.0
ZA = 1.650                                                      # высота оси сопла над землёй
G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_DUCT = 0, 1, 2, 3, 4, 5, 11
PARTS = {}       # имя -> dict(pivot, axis, range, note[, kind='slide'])


def Yb(a): return L / 2 - a
def Z(z): return z - ZA
def P3(a, x, y): return Vector((x, Yb(a), y))


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
    return 5 * (0.2969 * math.sqrt(max(u, 0)) - 0.1260 * u - 0.3516 * u ** 2 + 0.2843 * u ** 3 - 0.1015 * u ** 4)


def foil_ring(a_le, chord, tc, u0, u1, nu, place, tail=None, head=None):
    """Замкнутый контур хорды от u0 до u1: place(a, h) -> Vector. tail - точки (a, h) сзади, сверху вниз; head - точки спереди, снизу вверх."""
    us = [u0 + (u1 - u0) * (1 - math.cos(math.pi * i / (nu - 1))) / 2 for i in range(nu)]
    up = [place(a_le + chord * u, +tc * chord * thk(u)) for u in us]
    lo = [place(a_le + chord * u, -tc * chord * thk(u)) for u in reversed(us)]
    return up + [place(a_, h_) for a_, h_ in (tail or [])] + lo + [place(a_, h_) for a_, h_ in (head or [])]


# Рули: круглый нос ходит в круглом вырезе неподвижной части: щель одна при любом угле, ступеньки нет, насквозь не видно.
COVE_K, COVE_R = 7, 0.008
def cove_cut(a_le, chord, tc, a_h, clr=COVE_R):
    uh = (a_h - a_le) / chord; t = tc * chord * thk(uh); rc = t + clr; a_e = a_h - math.sqrt(max(rc * rc - t * t, 1e-9)); te = tc * chord * thk((a_e - a_le) / chord); rc = math.hypot(a_e - a_h, te); al = math.atan2(te, a_e - a_h)
    return (a_e - a_le) / chord, [(a_h + rc * math.cos(al + (2 * math.pi - 2 * al) * (i + 1) / (COVE_K + 1)), rc * math.sin(al + (2 * math.pi - 2 * al) * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_wall(a_le, chord, tc, u1):
    a_ = a_le + chord * u1; t = tc * chord * thk(u1); return [(a_, t * (1 - 2 * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_nose(a_le, chord, tc, a_h):
    t = tc * chord * thk((a_h - a_le) / chord); return [(a_h - t * math.sin(math.pi * (i + 1) / (COVE_K + 1)), -t * math.cos(math.pi * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_wall_f(a_le, chord, tc, u0):
    a_ = a_le + chord * u0; t = tc * chord * thk(u0); return [(a_, t * (-1 + 2 * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]


def poly_ring(a, pts, n, r=0.03):
    """Многоугольник со скруглёнными углами, равномерно n точек; начало - первая точка. pts: (x, y)."""
    P = [Vector((x, y)) for x, y in pts]; m = len(P); dense = []
    for i in range(m):
        p0, p1, p2 = P[i - 1], P[i], P[(i + 1) % m]; d0 = (p0 - p1).normalized(); d1 = (p2 - p1).normalized(); rr = min(r, (p0 - p1).length * 0.4, (p2 - p1).length * 0.4); q0 = p1 + d0 * rr; q1 = p1 + d1 * rr
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


def _sm(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)


# ── фюзеляж: круглый нос с колпачком дальномера, глубокая средняя часть, хвост сходится к соплу (hunter_01, 05, 08) ──
# (a, верх z, низ z, полуширина, показатель верха, показатель низа)
FUS = [(0.000, 1.505, 1.385, 0.012, 2.0, 2.0), (0.030, 1.540, 1.345, 0.075, 2.0, 2.0), (0.100, 1.585, 1.300, 0.135, 2.0, 2.0), (0.300, 1.665, 1.225, 0.225, 2.0, 2.1),
       (0.700, 1.810, 1.115, 0.340, 2.05, 2.2), (1.300, 1.955, 1.025, 0.455, 2.1, 2.3), (1.900, 2.050, 0.970, 0.530, 2.15, 2.5), (2.600, 2.120, 0.935, 0.585, 2.2, 2.6),
       (3.500, 2.165, 0.920, 0.630, 2.2, 2.6), (4.500, 2.185, 0.915, 0.660, 2.2, 2.5), (6.000, 2.190, 0.915, 0.670, 2.2, 2.4), (7.500, 2.190, 0.920, 0.665, 2.2, 2.3),
       (8.500, 2.185, 0.930, 0.645, 2.2, 2.2), (9.500, 2.170, 0.945, 0.610, 2.15, 2.15), (10.500, 2.150, 0.975, 0.565, 2.1, 2.1), (11.500, 2.125, 1.010, 0.520, 2.05, 2.05),
       (12.500, 2.095, 1.070, 0.480, 2.0, 2.0), (13.300, 2.060, 1.160, 0.440, 2.0, 2.0), (13.860, 2.035, 1.255, 0.405, 2.0, 2.0)]
FT = tracks([(r[0], Z(r[1]), Z(r[2]), r[3], r[4], r[5]) for r in FUS])
FUS_END = 13.860
RAD_A = 0.300                                                   # колпачок дальномера на носу


def fore_y(a, x):
    """Высота верхней поверхности фюзеляжа над |x| (y)."""
    top, bot, hw, nt = FT[0](a), FT[1](a), FT[2](a), FT[3](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nt)
    return cy + ht * q ** (1 / nt)


def fore_bot(a, x):
    top, bot, hw, nb = FT[0](a), FT[1](a), FT[2](a), FT[4](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nb)
    return cy - ht * q ** (1 / nb)


def fore():
    st = [0.0, 0.012, 0.03, 0.06, 0.10, 0.16, 0.23, 0.30] + stations(0.40, 2.0, 0.10) + stations(2.1, FUS_END, 0.20)
    return loft_obj('s_fore', [sup(a, 0.0, *[t(a) for t in FT], 80) for a in st])


# ── горб за фонарём: фонарь уезжает по нему назад (hunter_01, 06) ──
SPINE = [(3.45, 2.330, 0.255), (3.80, 2.300, 0.245), (4.10, 2.262, 0.228), (4.40, 2.238, 0.200), (4.70, 2.210, 0.150), (5.00, 2.192, 0.090)]
SPT = tracks([(r[0], Z(r[1]), r[2]) for r in SPINE])


def spine():
    return loft_obj('s_spine', [sup(a, 0.0, SPT[0](a), Z(1.95), SPT[1](a), 2.4, 2.0, 40) for a in stations(3.45, 5.00, 0.10)], sharp=45)


# ── «Сабрины»: два обтекателя сборников звеньев под фюзеляжем за пушками (hunter_01, 05, 07) ──
SAB = dict(a0=3.70, a1=5.75, x=0.300)
def sabrina(sx):
    a0, a1 = SAB['a0'], SAB['a1']; dz = Track([(a0, 0.0), (a0 + 0.35, 0.115), (a0 + 1.0, 0.150), (a1 - 0.45, 0.130), (a1, 0.0)]); hw = Track([(a0, 0.02), (a0 + 0.35, 0.115), (a0 + 1.0, 0.135), (a1 - 0.45, 0.120), (a1, 0.02)])
    rs = []
    for a in stations(a0, a1, 0.12):
        zb = fore_bot(a, SAB['x']); rs.append(sup(a, sx * SAB['x'], zb + 0.20, zb - dz(a), hw(a), 2.0, 2.2, 28))
    return loft_obj('s_sab_' + ('r' if sx > 0 else 'l'), rs, sharp=50)


# ── крыло: стреловидность по передней кромке 45°, слабое обратное V, «собачий зуб» на внешней части (hunter_03, 06, 07) ──
XTIP = 5.150
def wy(x): return Z(1.400) - 0.0175 * (x - 0.6)
def _rt(x): return ((max(x, 4.95) - 4.95) / (XTIP - 4.95)) ** 2
DT_X = 3.050                                                    # начало «зуба»
def _ext(x): return 0.0 if x < DT_X else 0.170 - 0.060 * (x - DT_X) / (XTIP - DT_X)
LE0 = lambda x: 2.890 + 1.009 * x                               # кромка без «зуба»
LE_I = lambda x: LE0(x) - _ext(x) + 0.12 * _rt(x)
TE_I = lambda x: 7.790 + 0.330 * x - 0.06 * _rt(x)
CH0 = lambda x: TE_I(x) - LE0(x)
HINGE_I = lambda x: TE_I(x) - 0.250 * CH0(x)                    # закрылок
HINGE_O = lambda x: TE_I(x) - 0.260 * CH0(x)                    # элерон
FLAP = (0.760, 2.950); AIL = (3.140, 4.930)
TC = Track([(0.45, 0.090), (1.60, 0.085), (XTIP, 0.070)])


def _wsec(sx, x):
    c = TE_I(x) - LE_I(x); tc = TC(x); le = LE_I(x); us = 0.0008; head = cove_wall_f(le, c, tc, us)
    if FLAP[0] - 1e-6 <= x <= FLAP[1] + 1e-6: ue, tail = cove_cut(le, c, tc, HINGE_I(x))
    elif AIL[0] - 1e-6 <= x <= AIL[1] + 1e-6: ue, tail = cove_cut(le, c, tc, HINGE_O(x))
    else: ue = 1.0; tail = cove_wall(le, c, tc, 1.0)
    return foil_ring(le, c, tc, us, ue, 20, lambda a, h: P3(a, sx * x, wy(x) + h), tail=tail, head=head)


def wing_s(sx):
    k = [0.45, 0.60, 0.72, FLAP[0] - 0.003, FLAP[0], FLAP[1], FLAP[1] + 0.003, DT_X - 0.002, DT_X + 0.002, AIL[0] - 0.003, AIL[0], AIL[1], AIL[1] + 0.003, 4.98, 5.03, 5.07, 5.10, 5.125, 5.14, XTIP]
    k += [FLAP[0] + (FLAP[1] - FLAP[0]) * i / 7 for i in range(1, 7)] + [AIL[0] + (AIL[1] - AIL[0]) * i / 6 for i in range(1, 6)]
    xs = sorted(set(round(v, 4) for v in k))
    return loft_obj('s_wing_' + ('r' if sx > 0 else 'l'), [_wsec(sx, x) for x in xs], sharp=48)


def wing_part(name, spec, sx, HG, note, rng):
    x0, x1 = spec; x0 += 0.005; x1 -= 0.005
    pv0 = P3(HG(x0), sx * x0, wy(x0)); pv1 = P3(HG(x1), sx * x1, wy(x1)); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    for i in range(11):
        x = x0 + (x1 - x0) * i / 10; c = TE_I(x) - LE_I(x); ah = HG(x)
        rings.append([v - pivot for v in foil_ring(LE_I(x), c, TC(x), (ah - LE_I(x)) / c, 1.0, 9, lambda a, h: P3(a, sx * x, wy(x) + h), head=cove_nose(LE_I(x), c, TC(x), ah))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=rng, note=note)
    return ob


# ── заборники в корне крыла: длинная щель, высокая у фюзеляжа и сходящаяся клином к крылу; кромка по передней кромке крыла (hunter_05, 07) ──
INL_XI, INL_XO = 0.380, 1.640
INL_ZT = lambda x: 1.760 - 0.300 * (x - 0.40) / 1.24             # верх у фюзеляжа - к крылу
INL_ZB = lambda x: 1.250 + 0.150 * (x - 0.40) / 1.24
LIP_A = lambda x: LE0(x)                                        # кромка - по передней кромке крыла
INL_A1 = 6.80


def inl_pts(k_h, k_x, inset=0.0, sx=1, xi=INL_XI, xo=INL_XO):
    """Сечение заборника в плоскости a: клин из двух прямых (верх, низ), внешний конец скруглён. k_h - доля высоты (сжатие к середине), k_x - доля длины."""
    xo_ = xi + (xo - xi) * k_x; pts = []
    for i in range(10):
        x = xi + (xo_ - xi) * i / 9; zm = (INL_ZT(x) + INL_ZB(x)) / 2; h = (INL_ZT(x) - INL_ZB(x)) / 2 * k_h; pts.append((x, zm - h + inset))
    zm = (INL_ZT(xo_) + INL_ZB(xo_)) / 2; pts.append((xo_ + 0.05 - inset, zm))
    for i in range(9, -1, -1):
        x = xi + (xo_ - xi) * i / 9; zm = (INL_ZT(x) + INL_ZB(x)) / 2; h = (INL_ZT(x) - INL_ZB(x)) / 2 * k_h; pts.append((x, zm + h - inset))
    if inset: pts = [(x + (inset if x <= xi + 1e-6 else 0.0), z) for x, z in pts]
    return [(sx * x, Z(z)) for x, z in pts]


def _inl_k(a):
    """Сжатие заборника за кромкой: до 4,9 полный, к 6,8 уходит в корень крыла."""
    t = _sm((a - 4.70) / (INL_A1 - 4.70)); return 1.0 - 0.62 * t, 1.0 - 0.45 * t


def inlet_box(sx):
    rs = []
    for a in stations(3.20, INL_A1, 0.20):
        kh, kx = _inl_k(a); rs.append(poly_ring(a, inl_pts(kh, kx, 0.0, sx), 72, 0.05))
    return loft_obj('s_inl_' + ('r' if sx > 0 else 'l'), rs, sharp=50)


def lip_cut(sx, da=0.0):
    """Срез по передней кромке крыла: всё, что впереди, убирается. da - сдвиг вперёд."""
    rs = [[P3(LIP_A(x) - da, sx * x, Z(2.0)), P3(LIP_A(x) - da, sx * x, Z(0.8)), P3(2.0, sx * x, Z(0.8)), P3(2.0, sx * x, Z(2.0))] for x in (0.30, 1.85)]
    return loft_obj('c_lip', rs, G_SKIN)


DUCT_END = 5.30
def duct_cut(sx):
    """Канал: тёмный, сходится к фюзеляжу и сужается. Кромка острая: стенка 2,5 см."""
    n = 72; rings = []
    for i in range(12):
        a = 3.20 + (DUCT_END - 3.20) * i / 11; r1 = poly_ring(a, inl_pts(1.0, 1.0, 0.025, sx), n, 0.04); ct = sum(r1, Vector()) / n; k = 1.0 - 0.50 * _sm((a - 4.0) / (DUCT_END - 4.0))
        sh = Vector((-sx * 0.30 * _sm((a - 3.9) / (DUCT_END - 3.9)), 0, 0)); rings.append([ct + (p - ct) * k + sh for p in r1])
    return loft_obj('c_duct_' + ('r' if sx > 0 else 'l'), rings, G_DUCT)


# ── киль: стреловидный, со скруглённой верхушкой и гребнем к спине (hunter_01, 06, 08); руль выше стабилизатора ──
FIN_T = 0.075
FZ0, FZ1 = 2.020, 4.030                                         # корень (внутри фюзеляжа) и верх, z
F_LE = Lin([(FZ0, 9.960), (FZ1, 12.890)])
F_TE = Lin([(FZ0, 13.800), (2.556, 13.620), (2.600, 13.270), (FZ1, 13.680)])
RUD = (2.640, 3.910)
RUD_C = Lin([(2.640, 0.760), (3.910, 0.640)])
def _fin_top(z): return ((max(z, 3.86) - 3.86) / (FZ1 - 3.86)) ** 2


def fin():
    zs = [FZ0, 2.20, 2.40, 2.556, 2.604, 2.638, 2.6395] + [2.64 + (3.91 - 2.64) * i / 6 for i in range(1, 7)] + [3.914, 3.95, 3.99, 4.01, FZ1]
    rings = []
    for z in zs:
        le = F_LE(z) + 0.25 * _fin_top(z); te = F_TE(z) - 0.05 * _fin_top(z); c = te - le; tc = FIN_T if z > 2.6 else FIN_T * 3.1 / c
        if RUD[0] - 1e-6 <= z <= RUD[1] + 1e-6: ue, tail = cove_cut(le, c, tc, te - RUD_C(z), 0.006)
        else: ue, tail = 1.0, cove_wall(le, c, tc, 1.0)
        rings.append(foil_ring(le, c, tc, 0.0008, ue, 18, lambda a, h: P3(a, h, Z(z)), tail=tail, head=cove_wall_f(le, c, tc, 0.0008)))
    b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('fin_c', sharp_deg=48)


def fore_y_z(a): return fore_y(a, 0.0) + ZA


def rudder():
    z0, z1 = RUD; h0 = F_TE(z0) - RUD_C(z0); h1 = F_TE(z1) - RUD_C(z1); p0 = P3(h0, 0.0, Z(z0)); p1 = P3(h1, 0.0, Z(z1)); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized(); rings = []
    for i in range(9):
        z = z0 + 0.008 + (z1 - z0 - 0.012) * i / 8; le = F_LE(z); c = F_TE(z) - le; ah = F_TE(z) - RUD_C(z)
        rings.append([v - pivot for v in foil_ring(le, c, FIN_T, (ah - le) / c, 1.0, 9, lambda a, h: P3(a, h, Z(z)), head=cove_nose(le, c, FIN_T, ah))])
    ob = loft_obj('rudder', rings, sharp=48); ob.location = pivot
    PARTS['rudder'] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-25.0, 25.0), note='ось в центре круглого носа, снизу вверх')
    return ob


# ── контейнер тормозного парашюта над соплом у основания руля (FGA.9): в нём ось стабилизатора (hunter_01, 08) ──
CHUTE_Z = 2.470
CHR = Track([(11.30, 0.010), (11.50, 0.120), (12.00, 0.150), (12.60, 0.155), (13.20, 0.160), (13.80, 0.156), (14.00, 0.128), (14.06, 0.070), (14.08, 0.010)])


def chute():
    n = 28; return loft_obj('s_chute', [[P3(a, CHR(a) * math.sin(2 * math.pi * k / n), Z(CHUTE_Z) - CHR(a) * math.cos(2 * math.pi * k / n)) for k in range(n)] for a in [11.30, 11.34, 11.40, 11.50, 11.65, 11.85, 12.10, 12.40, 12.60, 12.90, 13.20, 13.50, 13.80, 13.92, 14.00, 14.04, 14.06, 14.08]], G_SKIN, sharp=45)


# ── стабилизатор: подвижный (переставной) с рулём высоты, на киле над фюзеляжем, в обтекателе парашюта (hunter_01, 06, 08) ──
ST_XR, ST_XT = 0.140, 1.800
S_LE = Lin([(ST_XR, 11.400), (ST_XT, 13.000)])
S_TE = Lin([(ST_XR, 13.250), (ST_XT, 13.640)])
ST_TC = 0.075
ST_Z = lambda x: Z(CHUTE_Z) + 0.035 * (x - ST_XR)               # лёгкое V
EL_H = lambda x: S_TE(x) - 0.300 * (S_TE(x) - S_LE(x))           # ось руля высоты
EL_X = (0.200, 1.780)
ST_PIV = 12.150


def stab(sx):
    name = 'stab_' + ('r' if sx > 0 else 'l'); pivot = P3(ST_PIV, sx * ST_XR, ST_Z(ST_XR))
    xs = sorted(set([ST_XR, 0.16, EL_X[0] - 0.003, EL_X[0]] + [EL_X[0] + (EL_X[1] - EL_X[0]) * i / 7 for i in range(1, 7)] + [EL_X[1], EL_X[1] + 0.003, 1.795, ST_XT]))
    rings = []
    for x in xs:
        le = S_LE(x); c = S_TE(x) - le
        if EL_X[0] - 1e-6 <= x <= EL_X[1] + 1e-6: ue, tail = cove_cut(le, c, ST_TC, EL_H(x), 0.006)
        else: ue, tail = 1.0, cove_wall(le, c, ST_TC, 1.0)
        rings.append([v - pivot for v in foil_ring(le, c, ST_TC, 0.0008, ue, 18, lambda a, h: P3(a, sx * x, ST_Z(x) + h), tail=tail, head=cove_wall_f(le, c, ST_TC, 0.0008))])
    b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    n = 14; rg = lambda x_, r: [P3(ST_PIV + r * math.cos(2 * math.pi * k / n), sx * x_, ST_Z(ST_XR) + r * math.sin(2 * math.pi * k / n)) - pivot for k in range(n)]
    b.loft([rg(0.02, 0.045), rg(ST_XR + 0.04, 0.045)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    ob = b.finish(name, sharp_deg=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(-10.0, 5.0), note='переставной (весь стабилизатор), ось поперёк в контейнере парашюта; плюс - задняя кромка вниз; руль высоты elev_* - отдельно')
    return ob


def elevator(sx):
    name = 'elev_' + ('r' if sx > 0 else 'l'); x0, x1 = EL_X[0] + 0.005, EL_X[1] - 0.005
    pv0 = P3(EL_H(x0), sx * x0, ST_Z(x0)); pv1 = P3(EL_H(x1), sx * x1, ST_Z(x1)); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    for i in range(9):
        x = x0 + (x1 - x0) * i / 8; le = S_LE(x); c = S_TE(x) - le; ah = EL_H(x)
        rings.append([v - pivot for v in foil_ring(le, c, ST_TC, (ah - le) / c, 1.0, 9, lambda a, h: P3(a, sx * x, ST_Z(x) + h), head=cove_nose(le, c, ST_TC, ah))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-25.0, 25.0), note='ось в центре круглого носа; плюс - вниз; ходит вместе со стабилизатором (дочерний по смыслу)')
    return ob


# ── сопло: одна круглая труба, выступает из хвоста (hunter_08) ──
NOZ_A0, NOZ_A, NOZ_R = 13.700, 13.960, 0.355
NOZ_Y = 0.0


def nozzle():
    b = B(); n = 64; ring = lambda a, r: [P3(a, r * math.sin(2 * math.pi * k / n), -r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    sec = [ring(NOZ_A0, 0.392), ring(NOZ_A0 + 0.05, 0.386), ring(NOZ_A - 0.08, 0.378), ring(NOZ_A - 0.02, 0.372), ring(NOZ_A, 0.366), ring(NOZ_A, NOZ_R), ring(NOZ_A - 0.25, 0.352), ring(NOZ_A0 - 0.02, 0.350)]
    b.loft(sec + [sec[0]], G_METAL)
    return b.finish('nozzle', sharp_deg=30)


def bore_cut():
    n = 56; ring = lambda a, r: [P3(a, r * math.sin(2 * math.pi * k / n), -r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    prof = [(14.00, 0.352, G_METAL), (13.40, 0.350, G_METAL), (12.90, 0.345, G_COCK), (12.50, 0.335, G_DARK), (12.20, 0.200, G_DARK), (12.10, 0.030, G_DARK)]
    b = B(); b.loft([ring(a, r) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK)
    return b.finish('c_bore', sharp_deg=30)


# ── кабина: выемка, одно кресло; козырёк с рамой, фонарь-пузырь сдвигается назад по горбу (hunter_01, 05) ──
CK_A0, CK_A1 = 1.950, 3.620
CK_HW = Track([(1.95, 0.230), (2.20, 0.320), (2.50, 0.355), (2.90, 0.370), (3.30, 0.350), (3.62, 0.270)])
FLOOR = Z(1.080)


def cock_cut():
    def sec(a, y0, y1, hw): return [P3(a, -hw, y0), P3(a, hw, y0), P3(a, hw, y1), P3(a, -hw, y1)]
    return loft_obj('c_cock', [sec(a, FLOOR - 0.004, Z(3.0), CK_HW(a)) for a in stations(CK_A0, CK_A1, 0.07)], G_COCK, sharp=25)


CANOPY = [(1.840, 0.0, 0.215), (2.000, Z(2.215), 0.300), (2.270, Z(2.400), 0.352), (2.550, Z(2.460), 0.385), (2.850, Z(2.480), 0.395), (3.150, Z(2.470), 0.385), (3.400, Z(2.430), 0.355), (3.600, Z(2.370), 0.300), (3.700, Z(2.335), 0.262)]
CANOPY[0] = (1.840, fore_y(1.840, 0.0) + 0.004, 0.215)
CAN_T = tracks(CANOPY)
ARCH_A = 2.270
CAN_A1 = 3.680
SLIDE = Vector((0.0, -1.0, 0.100)).normalized()                  # назад и чуть вверх, по порогу
SLIDE_M = 0.700
def SILL(a): return fore_y(a, CAN_T[1](a))


def can_ring(a, inset=0.0, n=44):
    top, hw = CAN_T[0](a) - inset, CAN_T[1](a) - inset; y0 = SILL(a) + 0.002
    return [P3(a, hw * math.cos(math.pi * k / (n - 1)) ** 0.70 if math.cos(math.pi * k / (n - 1)) >= 0 else -hw * (-math.cos(math.pi * k / (n - 1))) ** 0.70, y0 + (top - y0) * math.sin(math.pi * k / (n - 1)) ** 0.82) for k in range(n)]


def glass_shell(name, st):
    b = B(); strip(b, [can_ring(a) for a in st], G_GLASS)
    return b.finish(name, sharp_deg=60)


def frame_arch(b, a, w, inset=0.008, h=0.020, n=44, drop=0.0):
    ri0 = can_ring(a - w, inset, n); ro0 = can_ring(a - w, -h, n); ro1 = can_ring(a + w, -h, n); ri1 = can_ring(a + w, inset, n)
    if drop: ri0 = [p - Vector((0, 0, drop)) for p in ri0]; ri1 = [p - Vector((0, 0, drop)) for p in ri1]
    strip(b, [ri0, ro0, ro1, ri1, ri0], G_SKIN)


def canopy():
    """Фонарь-пузырь почти без переплётов: передняя дуга, рельсы по порогу, задняя рама. Сдвигается назад по горбу."""
    a0 = ARCH_A; a1 = CAN_A1; st = stations(a0 + 0.004, a1, 0.10); pivot = P3(a0, 0.0, SILL(a0))
    gl = glass_shell('canopy_glass', st)
    for v in gl.data.vertices: v.co -= pivot
    gl.location = pivot
    b = B(); frame_arch(b, a0 + 0.028, 0.028, h=0.022)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        b.loft([[rail(a, 0.004, 0.012), rail(a, 0.016, 0.010), rail(a, 0.016, 0.028), rail(a, -0.010, 0.040), rail(a, -0.010, 0.022)] for a in stations(a0, a1, 0.07)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    strip(b, [can_ring(a1 - 0.05, 0.006), can_ring(a1 - 0.05, -0.020), can_ring(a1 + 0.01, -0.020), can_ring(a1 + 0.01, 0.006), can_ring(a1 - 0.05, 0.006)], G_SKIN)
    fr = b.finish('canopy', sharp_deg=45)
    for v in fr.data.vertices: v.co -= pivot
    fr.location = pivot; gl.parent = fr; gl.location = (0, 0, 0)
    PARTS['canopy'] = dict(pivot=pivot.copy(), axis=SLIDE.copy(), range=(0.0, SLIDE_M), kind='slide', note='сдвиг назад по рельсам порога (метры, не градусы); canopy_glass - дочерний объект')
    return [fr, gl]


def windscreen():
    a1 = ARCH_A - 0.05; st = stations(1.860, a1, 0.07)
    b = B(); strip(b, [can_ring(a) for a in st], G_GLASS); gl = b.finish('screen_glass', sharp_deg=60)
    b2 = B(); frame_arch(b2, ARCH_A - 0.030, 0.028, h=0.022); frame_arch(b2, 1.885, 0.028, inset=0.035, h=0.012, drop=0.07)
    for sg in (1, -1):                                          # стойки козырька: плоское лобовое стекло и боковые
        for a_, s_ in ((1.89, 0.42), (2.24, 0.52)):
            pass
    fr = b2.finish('screen_frame', sharp_deg=45)
    return [gl, fr]


# ── пилоны: по два под крылом и пара рельсов НУРС снаружи (как у FGA.9) ──
# (тег, x, a начала, a конца, глубина под нижней поверхностью)
PYLON_DEF = (('i', 2.750, 6.050, 7.750, 0.260), ('o', 3.450, 6.650, 8.050, 0.240), ('r1', 4.000, 7.250, 8.250, 0.120), ('r2', 4.500, 7.650, 8.550, 0.110))
PYLON_PTS = {}


def wing_bot(x, a):
    c = TE_I(x) - LE_I(x); u = (a - LE_I(x)) / c; return wy(x) - TC(x) * c * thk(max(0.0, min(1.0, u)))


def pylon(sx, tag, x, a0, a1, dep):
    b = B(); name = f'pylon_{tag}_' + ('r' if sx > 0 else 'l'); am = (a0 + a1) / 2; y0 = wing_bot(x, am) - dep; hw = 0.050 if dep > 0.2 else 0.035
    def sec(a, f=1.0): yw = wing_bot(x, a) + 0.04; return [P3(a, sx * x - hw * f, y0), P3(a, sx * x + hw * f, y0), P3(a, sx * x + hw * f * 0.85, yw), P3(a, sx * x - hw * f * 0.85, yw)]
    st = [a0, a0 + 0.10, a0 + 0.35, a1 - 0.35, a1 - 0.10, a1]; fs = [0.10, 0.70, 1.0, 1.0, 0.65, 0.10]
    b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    PYLON_PTS[name] = P3(am, sx * x, y0)
    return b.finish(name, sharp_deg=40)


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


BVH = {}
def bvh_ready(host):
    me = host.data; BVH['t'] = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons]); BVH['host'] = host


def down(x, y_world, z0=3.0, dirn=-1):
    hit = BVH['t'].ray_cast(Vector((x, y_world, z0)), Vector((0, 0, dirn)))
    return hit[0]


def patch(name, outline, nu, nv, dirn=-1, lift=0.006, th=0.018, mat=G_SKIN, z0=3.0):
    """Плита по обшивке: outline(u, v) -> (a, x); вершины кладутся лучом на обшивку (щиток, створки). Начало - в нуле мира."""
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


def _rel(ob, pivot):
    for v in ob.data.vertices: v.co -= pivot
    ob.location = pivot
    return ob


# ── тормозной щиток: одна плита под хвостовой частью, петля спереди (hunter_01) ──
BRK = (9.300, 10.550, 0.300)


def brake():
    a0, a1, hw = BRK; n_ = 'brake'
    ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, hw * (2 * u - 1)), 12, 12, dirn=1, lift=0.005, th=0.022, z0=-3.0)
    pivot = P3(a0 + 0.030, 0.0, down(0.0, Yb(a0), z0=-3.0, dirn=1).z - 0.032); _rel(ob, pivot)
    PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, 67.0), note='петля спереди под плитой (кронштейны); плюс - задняя кромка вниз; цилиндр - det_brk_cyl')
    h_pl = down(0.0, Yb(a0 + 0.80), z0=-3.0, dirn=1); pe = Vector((0.0, Yb(a0 + 0.80), h_pl.z + 0.03)); pc0 = P3(a0 + 0.05, 0.0, h_pl.z + 0.24)
    bc = B(); rg = lambda c_, u, v, r: [c_ + (u * math.cos(2 * math.pi * q / 10) + v * math.sin(2 * math.pi * q / 10)) * r for q in range(10)]
    d = pe - pc0; dd = d.normalized(); U_ = Vector((1, 0, 0)); V_ = dd.cross(U_).normalized(); pm = pc0 + dd * (d.length * 0.55)
    bc.loft([rg(pc0, U_, V_, 0.036), rg(pm, U_, V_, 0.036)], G_METAL, cap0=G_METAL, cap1=G_METAL); bc.loft([rg(pm - dd * 0.04, U_, V_, 0.019), rg(pe, U_, V_, 0.019)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return [ob, bc.finish('det_brk_cyl', sharp_deg=45)]


# ── шасси: размеры ──
GROUND_Y = Z(0.0)
NG = dict(a=1.800, hinge=(2.000, Z(1.040)), rw=0.230, ww=0.150)
MG_A, MG_X = 6.400, 2.250
MAIN_T = (6.420, 2.330, Z(1.310))                               # шарнир стойки: a, x, y
NOSE_BAY = (0.600, 2.120, 0.210)
MAIN_BAY = (5.980, 6.880, 1.000, 1.700, 2.400)                  # a0, a1, x внутр., x раздела: колесо / щель ноги (её закрывает щиток на ноге), x наружн.


def doors():
    out = []; a0, a1, hw = NOSE_BAY
    n_ = 'door_n'
    ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, hw * (1 - 2 * u)), 8, 10, dirn=1, lift=0.004, th=0.016, z0=-3.0)
    pivot = P3((a0 + a1) / 2, hw, down(hw, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z - 0.005); _rel(ob, pivot)
    PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, -1, 0)), range=(0.0, 95.0), note='одна створка на всю нишу, петля по правой кромке; 0 - закрыта, плюс - висит вниз (hunter_05, 07)')
    out.append(ob)
    a0, a1, x0, xm, x1 = MAIN_BAY
    for sx in (1, -1):
        n_ = 'door_m_' + ('r' if sx > 0 else 'l')
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + (xm - 0.004 - x0) * u)), 10, 8, dirn=1, lift=0.004, th=0.016, z0=-3.0)
        pivot = P3((a0 + a1) / 2, sx * x0, down(sx * x0, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z - 0.005); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(0.0, 88.0) if sx > 0 else (-88.0, 0.0), note='0 - закрыта, ось у внутренней кромки, колодец колеса')
        out.append(ob)
        n_ = 'door_o_' + ('r' if sx > 0 else 'l')
        ob = patch(n_, lambda u, v: (a0 + 0.02 + (a1 - a0 - 0.04) * v, sx * (xm + 0.004 + (x1 - xm - 0.004) * u)), 6, 8, dirn=1, lift=0.004, th=0.016, z0=-3.0)
        pivot = P3(MAIN_T[0], sx * MAIN_T[1], MAIN_T[2]); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(-88.0, 0.0) if sx > 0 else (0.0, 88.0), note='щиток ноги: 0 - закрыт (стойка убрана); ось и ход как у gear_m, при выпуске уходит вместе с ногой на ' + ('-88' if sx > 0 else '+88'))
        out.append(ob)
    return out


def build_skin():
    ib = [inlet_box(1), inlet_box(-1)]
    for o, sx in zip(ib, (1, -1)):
        c = lip_cut(sx); _apply_bool(o, c, 'DIFFERENCE'); _drop(c)
    S = [fore(), spine(), ib[0], ib[1], wing_s(1), wing_s(-1), sabrina(1), sabrina(-1), chute()]
    host = S[0]
    for o in S[1:]:
        _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        c = duct_cut(sx); l_ = lip_cut(sx, 0.012); _apply_bool(c, l_, 'DIFFERENCE'); _drop(l_); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = bore_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = cock_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'HN_skin'; host.data.name = 'HN_skin'
    bvh_ready(host)
    return host


def plane(stage=9, carve=True):
    """Этапы: 1 - обшивка с крыльями; 2 - рули, оперение, сопло; 3 - кабина, фонарь, плиты, пилоны, щиток; 4 - шасси и створки."""
    import hn_detail as d
    PARTS.clear(); PYLON_PTS.clear()
    skin = build_skin(); out = [skin]
    ref_me = skin.data.copy(); d.resharp(types.SimpleNamespace(data=ref_me))
    if stage >= 2:
        out += [fin(), rudder(), stab(1), stab(-1), elevator(1), elevator(-1), nozzle(), d.burner()]
        out += [wing_part('flap_' + n, FLAP, s, HINGE_I, 'ось в центре круглого носа; плюс - вниз', (0.0, 60.0)) for s, n in ((1, 'r'), (-1, 'l'))]
        out += [wing_part('aileron_' + n, AIL, s, HINGE_O, 'ось в центре круглого носа; плюс - вниз', (-18.0, 18.0)) for s, n in ((1, 'r'), (-1, 'l'))]
    if stage >= 3:
        out += [d.cockpit_detail()]
        out += canopy() + windscreen()
        out += brake()
        for sx in (1, -1):
            for tag, x, a0, a1, dep in PYLON_DEF: out.append(pylon(sx, tag, x, a0, a1, dep))
        out += [d.details(), d.guns()] + d.hardpoints() + [d.plates()]
    if stage >= 4:
        out += doors()
        import hn_gear as gr; out += gr.gear_nose() + gr.gear_main(1) + gr.gear_main(-1)
    if carve:
        print('канавок и выемок:', d.carve(skin))
    if stage >= 3: d.bays(skin)
    d.resharp(skin); print('нормали обшивки:', d.smooth_normals(skin, ref_me)); bpy.data.meshes.remove(ref_me)
    return out
