# f100_geo.py - геометрия F-100D Super Sabre для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z (в glTF: нос -Z, правое крыло +X, верх +Y). Начало - середина длины 13,94 м на оси сопла.
# a - расстояние от кромки воздухозаборника назад; высоты в таблицах - от оси сопла (z = 0), земля на GROUND_Y.
# Размеры сняты с фото f100_04 (бок, 90,75 пикс/м: кромка заборника - законцовка стабилизатора 13,94 м, как длина прежней модели игры), стоянка - с f100_07. Сетки и текстуры чужих моделей не используются.
# Сетка: замкнутые оболочки объединяются булевой операцией в одну обшивку; киль, стабилизаторы, рули, предкрылки - отдельные детали с толщиной.
import math
import types
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 13.94
ZA = 0.0                                                        # таблицы уже от оси сопла
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



GROUND_Y = -1.720                                               # земля под колёсами: высота оси сопла над бетоном 1,72 м (f100_07)

# ── фюзеляж: овальный заборник в носу, глубокий овал в середине, круглый хвост у сопла (f100_04, 01, 06) ──
# (a, верх, низ, полуширина, показатель верха, показатель низа)
FUS = [(0.000, 0.105, -0.335, 0.440, 2.3, 2.3), (0.030, 0.128, -0.358, 0.462, 2.3, 2.3), (0.250, 0.200, -0.410, 0.520, 2.3, 2.4), (0.670, 0.320, -0.470, 0.585, 2.3, 2.5),
       (1.110, 0.440, -0.530, 0.640, 2.3, 2.6), (1.550, 0.555, -0.565, 0.690, 2.3, 2.7), (2.000, 0.660, -0.600, 0.730, 2.3, 2.8), (2.600, 0.760, -0.625, 0.770, 2.3, 2.8),
       (3.200, 0.840, -0.640, 0.800, 2.3, 2.8), (3.800, 0.900, -0.655, 0.815, 2.3, 2.8), (4.400, 0.940, -0.665, 0.825, 2.3, 2.8), (5.000, 0.980, -0.680, 0.830, 2.3, 2.8),
       (5.500, 1.010, -0.690, 0.830, 2.3, 2.8), (6.600, 1.020, -0.690, 0.830, 2.3, 2.8), (8.000, 1.000, -0.690, 0.825, 2.3, 2.8), (9.000, 0.970, -0.680, 0.810, 2.3, 2.8),
       (10.000, 0.880, -0.630, 0.770, 2.2, 2.9), (11.000, 0.720, -0.560, 0.690, 2.1, 3.0), (11.750, 0.620, -0.520, 0.600, 2.0, 2.8), (12.300, 0.560, -0.490, 0.530, 2.0, 2.4),
       (12.800, 0.470, -0.455, 0.465, 2.0, 2.0), (12.950, 0.450, -0.445, 0.448, 2.0, 2.0)]
FT = tracks(FUS)
FUS_END = 12.950


def fore_y(a, x):
    """Высота верхней поверхности фюзеляжа над |x|."""
    top, bot, hw, nt = FT[0](a), FT[1](a), FT[2](a), FT[3](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nt)
    return cy + ht * q ** (1 / nt)


def fore_bot(a, x):
    top, bot, hw, nb = FT[0](a), FT[1](a), FT[2](a), FT[4](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nb)
    return cy - ht * q ** (1 / nb)


def fus_hw(a, z):
    """Полуширина фюзеляжа на высоте z."""
    top, bot, hw, nt, nb = [t(a) for t in FT]; cy = (top + bot) / 2; ht = (top - bot) / 2; s = (z - cy) / ht; e = nt if s > 0 else nb
    return hw * max(0.0, 1 - abs(s) ** e) ** (1 / e)


def fore():
    st = [0.0, 0.012, 0.03, 0.07, 0.13, 0.25] + stations(0.40, 2.0, 0.10) + stations(2.2, FUS_END, 0.20)
    return loft_obj('s_fore', [sup(a, 0.0, *[t(a) for t in FT], 88) for a in st])


# ── гаргрот за фонарём: продолжает фонарь и сходит на спину (f100_04) ──
SPINE = [(4.860, 1.185, 0.360), (5.200, 1.168, 0.360), (5.600, 1.135, 0.340), (6.200, 1.090, 0.300), (7.000, 1.050, 0.235), (7.800, 1.018, 0.150), (8.400, 0.995, 0.060)]
SPT = tracks(SPINE)


def spine():
    return loft_obj('s_spine', [sup(a, 0.0, SPT[0](a), fore_y(a, 0.0) - 0.30, SPT[1](a), 2.4, 2.0, 40) for a in stations(4.86, 8.40, 0.12)], sharp=45)


# ── наплывы у корня стабилизатора: плоская полка по низу хвоста, к ней прилегает корневая кромка (f100_06, 07) ──
SF = dict(a0=10.20, a1=13.02, x=0.300, hw=0.235, zt=-0.300, zb=-0.505)


def stab_fair(sx):
    a0, a1 = SF['a0'], SF['a1']; k = Track([(a0, 0.04), (a0 + 0.35, 0.72), (a0 + 0.62, 1.0), (a1 - 0.25, 1.0), (a1 - 0.08, 0.80), (a1, 0.35)])
    return loft_obj('s_sfair_' + ('r' if sx > 0 else 'l'), [sup(a, sx * SF['x'], SF['zt'], SF['zb'], SF['hw'] * k(a), 4.0, 4.0, 28) for a in stations(a0, a1, 0.10)], sharp=50)


# ── крыло: стреловидность по передней кромке 47,5°, без поперечного V, излом задней кромки у конца закрылка (f100_04, 06, 01) ──
XTIP = 5.775
WZ = -0.300
def wy(x): return WZ
def _rt(x): return ((max(x, XTIP - 0.22) - (XTIP - 0.22)) / 0.22) ** 2
LE0 = lambda x: 4.800 + 1.090 * (x - 0.800)
TE0 = Lin([(0.0, 8.710), (2.450, 9.450), (XTIP, 11.500)])
LE_I = lambda x: LE0(x) + 0.14 * _rt(x)
TE_I = lambda x: TE0(x) - 0.06 * _rt(x)
CH0 = lambda x: TE0(x) - LE0(x)
HINGE_I = lambda x: TE0(x) - 0.200 * CH0(x)                     # закрылок
HINGE_O = lambda x: TE0(x) - 0.240 * CH0(x)                     # элерон
FLAP = (0.950, 2.400); AIL = (2.500, 4.100)
SLAT_I = (1.200, 3.300); SLAT_O = (3.370, 5.480)
SLAT_U = 0.140                                                  # доля хорды под предкрылком
SLAT_A = lambda x: LE0(x) + SLAT_U * CH0(x)
TC = Track([(0.45, 0.070), (2.50, 0.065), (XTIP, 0.060)])
def _in(x, sp): return sp[0] - 1e-6 <= x <= sp[1] + 1e-6


def _wsec(sx, x):
    c = TE_I(x) - LE_I(x); tc = TC(x); le = LE_I(x)
    if _in(x, SLAT_I) or _in(x, SLAT_O): u0 = (SLAT_A(x) - le) / c; head = cove_nose(le, c, tc, SLAT_A(x))
    else: u0 = 0.0008; head = cove_wall_f(le, c, tc, u0)
    if _in(x, FLAP): ue, tail = cove_cut(le, c, tc, HINGE_I(x))
    elif _in(x, AIL): ue, tail = cove_cut(le, c, tc, HINGE_O(x))
    else: ue = 1.0; tail = cove_wall(le, c, tc, 1.0)
    return foil_ring(le, c, tc, u0, ue, 20, lambda a, h: P3(a, sx * x, wy(x) + h), tail=tail, head=head)


def wing_s(sx):
    k = [0.45, 0.60, 0.75, 4.60, 5.56, 5.62, 5.67, 5.71, 5.74, 5.76, XTIP]
    for sp, n in ((FLAP, 7), (AIL, 7), (SLAT_I, 8), (SLAT_O, 8)):
        k += [sp[0] - 0.003, sp[0], sp[1], sp[1] + 0.003] + [sp[0] + (sp[1] - sp[0]) * i / n for i in range(1, n)]
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


SLAT_DIR = Vector((0.0, math.cos(math.radians(24)), -math.sin(math.radians(24))))   # вперёд и вниз
SLAT_M = 0.150


def slat(name, spec, sx):
    """Предкрылок: носок профиля с вогнутым тылом, сидит на круглом носке крыла; выдвигается вперёд-вниз."""
    x0, x1 = spec; x0 += 0.005; x1 -= 0.005; pivot = P3(LE_I((x0 + x1) / 2), sx * (x0 + x1) / 2, wy(x0)); rings = []
    for i in range(11):
        x = x0 + (x1 - x0) * i / 10; c = TE_I(x) - LE_I(x); le = LE_I(x); ue, tail = cove_cut(le, c, TC(x), SLAT_A(x))
        rings.append([v - pivot for v in foil_ring(le, c, TC(x), 0.0008, ue, 9, lambda a, h: P3(a, sx * x, wy(x) + h), tail=tail, head=cove_wall_f(le, c, TC(x), 0.0008))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=SLAT_DIR.copy(), range=(0.0, SLAT_M), kind='slide', note='предкрылок: сдвиг вперёд-вниз (метры, не градусы); 0 - прижат')
    return ob


# ── воздухозаборник: овальный канал от кромки носа под кабину, темнеет в глубине (f100_01, 05) ──
DUCT = [(-0.150, -0.115, 0.215, 0.434), (0.030, -0.115, 0.215, 0.434), (0.500, -0.140, 0.213, 0.440), (1.200, -0.200, 0.200, 0.430), (2.000, -0.290, 0.180, 0.390), (2.600, -0.330, 0.165, 0.360)]
DT = tracks(DUCT)
DUCT_END = 2.750


def duct_cut():
    st = [-0.15, 0.03, 0.25, 0.5, 0.8, 1.2, 1.6, 2.0, 2.3, 2.6]; mats = [G_DUCT] * 5 + [G_DARK] * 5
    rs = [sup(a, 0.0, DT[0](a) + DT[1](a), DT[0](a) - DT[1](a), DT[2](a), 2.3, 2.3, 64) for a in st] + [sup(DUCT_END, 0.0, -0.31, -0.35, 0.05, 2.0, 2.0, 64)]
    b = B(); b.loft(rs, mats, cap0=G_DUCT, cap1=G_DARK)
    return b.finish('c_duct', sharp_deg=40)


# ── киль: высокий, стреловидный, с форкилем к спине; руль в нижней половине (f100_04, 07) ──
FIN_T = 0.050
FZ0, FZ1 = 0.450, 3.240                                         # корень (внутри фюзеляжа) и верх
F_LE = Lin([(FZ0, 8.600), (0.900, 9.200), (1.100, 9.950), (1.370, 10.700), (FZ1, 12.820)])
F_TE = Lin([(FZ0, 12.200), (0.870, 12.520), (FZ1, 13.600)])
RUD = (0.990, 2.100)
RUD_H = lambda z: 11.820 + 0.783 * (z - 1.040)                  # ось руля
RUD_C = lambda z: F_TE(z) - RUD_H(z)
def _fin_top(z): return ((max(z, FZ1 - 0.15) - (FZ1 - 0.15)) / 0.15) ** 2


def _fin_tc(c): return min(FIN_T, FIN_T * 2.3 / c)


def fin():
    zs = [FZ0, 0.60, 0.75, 0.90, 0.96, RUD[0] - 0.004, RUD[0] - 0.0005, 1.10, 1.20, 1.37] + [RUD[0] + (RUD[1] - RUD[0]) * i / 7 for i in range(0, 7)] + [RUD[1], RUD[1] + 0.004, 2.40, 2.75, 3.05, 3.13, 3.19, 3.22, FZ1]
    rings = []
    for z in sorted(set(zs)):
        le = F_LE(z) + 0.22 * _fin_top(z); te = F_TE(z) - 0.05 * _fin_top(z); c = te - le; tc = _fin_tc(c)
        if _in(z, RUD) and z > RUD[0] - 0.0001: ue, tail = cove_cut(le, c, tc, RUD_H(z), 0.006)
        else: ue, tail = 1.0, cove_wall(le, c, tc, 1.0)
        rings.append(foil_ring(le, c, tc, 0.0008, ue, 18, lambda a, h: P3(a, h, z), tail=tail, head=cove_wall_f(le, c, tc, 0.0008)))
    b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('fin_c', sharp_deg=48)


def rudder():
    z0, z1 = RUD; p0 = P3(RUD_H(z0), 0.0, z0); p1 = P3(RUD_H(z1), 0.0, z1); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized(); rings = []
    for i in range(9):
        z = z0 + 0.008 + (z1 - z0 - 0.014) * i / 8; le = F_LE(z); c = F_TE(z) - le; ah = RUD_H(z); tc = _fin_tc(c)
        rings.append([v - pivot for v in foil_ring(le, c, tc, (ah - le) / c, 1.0, 9, lambda a, h: P3(a, h, z), head=cove_nose(le, c, tc, ah))])
    ob = loft_obj('rudder', rings, sharp=48); ob.location = pivot
    PARTS['rudder'] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-25.0, 25.0), note='ось в центре круглого носа, снизу вверх')
    return ob


# ── стабилизатор: цельноповоротный, низко, у нижней кромки хвоста; корень идёт вдоль наплыва (f100_04, 06, 07) ──
ST_XR, ST_XT = 0.560, 2.850
S_LE = Lin([(ST_XR, 10.850), (ST_XT, 13.170)])
S_TE = Lin([(ST_XR, 13.000), (ST_XT, 13.920)])
ST_TC = 0.050
ST_ZC = -0.420
ST_PIV = 12.100
def _st_rt(x): return ((max(x, ST_XT - 0.12) - (ST_XT - 0.12)) / 0.12) ** 2


def stab(sx):
    name = 'stab_' + ('r' if sx > 0 else 'l'); pivot = P3(ST_PIV, sx * ST_XR, ST_ZC)
    xs = [ST_XR, 0.60, 0.80, 1.10, 1.40, 1.70, 2.00, 2.30, 2.55, 2.73, 2.78, 2.81, 2.83, 2.842, ST_XT]; rings = []
    for x in xs:
        le = S_LE(x) + 0.10 * _st_rt(x); c = S_TE(x) - 0.04 * _st_rt(x) - le
        rings.append([v - pivot for v in foil_ring(le, c, ST_TC, 0.0008, 1.0, 18, lambda a, h: P3(a, sx * x, ST_ZC + h), tail=cove_wall(le, c, ST_TC, 1.0), head=cove_wall_f(le, c, ST_TC, 0.0008))])
    b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    n = 14; rg = lambda x_, r: [P3(ST_PIV + r * math.cos(2 * math.pi * k / n), sx * x_, ST_ZC + r * math.sin(2 * math.pi * k / n)) - pivot for k in range(n)]
    b.loft([rg(0.30, 0.040), rg(ST_XR + 0.04, 0.040)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    ob = b.finish(name, sharp_deg=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(-20.0, 8.0), note='цельноповоротный; ось поперёк в наплыве хвоста; плюс - задняя кромка вниз')
    return ob


# ── сопло: одно, с лепестками, выступает из хвоста (f100_04, 06, 07) ──
NOZ_A0, NOZ_A, NOZ_R = 12.880, 13.160, 0.385
NOZ_Y = 0.0
NOZ_N = 24                                                      # лепестков


def nozzle():
    b = B(); n = NOZ_N * 4
    def ring(a, r, notch=0.0): return [P3(a - (notch if k % 4 == 0 else 0.0), r * math.sin(2 * math.pi * k / n), -r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    sec = [ring(NOZ_A0, 0.452), ring(NOZ_A0 + 0.04, 0.450), ring(NOZ_A - 0.10, 0.428), ring(NOZ_A - 0.02, 0.414, 0.03), ring(NOZ_A, 0.408, 0.045), ring(NOZ_A, NOZ_R, 0.045), ring(NOZ_A - 0.25, 0.396), ring(NOZ_A0 - 0.02, 0.399)]
    b.loft(sec + [sec[0]], G_METAL)
    return b.finish('nozzle', sharp_deg=30)


def bore_cut():
    n = 56; ring = lambda a, r: [P3(a, r * math.sin(2 * math.pi * k / n), -r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    prof = [(13.25, 0.400, G_METAL), (12.60, 0.400, G_METAL), (12.20, 0.392, G_COCK), (11.80, 0.370, G_DARK), (11.50, 0.200, G_DARK), (11.40, 0.030, G_DARK)]
    b = B(); b.loft([ring(a, r) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK)
    return b.finish('c_bore', sharp_deg=30)


# ── кабина: выемка, одно кресло; козырёк и фонарь одним куском, фонарь откидывается вверх на задней петле (f100_04, 07) ──
CK_A0, CK_A1 = 2.420, 4.750
CK_HW = Track([(2.42, 0.250), (2.75, 0.320), (3.20, 0.350), (4.20, 0.350), (4.75, 0.320)])
FLOOR = -0.100


def cock_cut():
    def sec(a, y0, y1, hw): return [P3(a, -hw, y0), P3(a, hw, y0), P3(a, hw, y1), P3(a, -hw, y1)]
    return loft_obj('c_cock', [sec(a, FLOOR - 0.004, 3.0, CK_HW(a)) for a in stations(CK_A0, CK_A1, 0.07)], G_COCK, sharp=25)


CANOPY = [(2.130, 0.0, 0.215), (2.400, 0.860, 0.305), (2.700, 0.985, 0.350), (2.990, 1.072, 0.372), (3.400, 1.170, 0.386), (3.760, 1.208, 0.390), (4.200, 1.214, 0.385), (4.600, 1.200, 0.375), (4.950, 1.186, 0.362)]
CANOPY[0] = (2.130, fore_y(2.130, 0.0) + 0.004, 0.215)
CAN_T = tracks(CANOPY)
ARCH_A = 2.990
CAN_A1 = 4.930
CAN_OPEN = 42.0
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
    """Фонарь: передняя дуга, рельсы по порогу, задняя рама - одно кольцо вокруг стекла. Откидывается вверх вокруг задней петли."""
    a0 = ARCH_A; a1 = CAN_A1; st = stations(a0 + 0.004, a1, 0.10); pivot = P3(a1 + 0.02, 0.0, SILL(a1))
    gl = glass_shell('canopy_glass', st)
    for v in gl.data.vertices: v.co -= pivot
    gl.location = pivot
    b = B(); frame_arch(b, a0 + 0.028, 0.028, h=0.022)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        b.loft([[rail(a, 0.004, 0.012), rail(a, 0.016, 0.010), rail(a, 0.016, 0.028), rail(a, -0.010, 0.040), rail(a, -0.010, 0.022)] for a in stations(a0, a1, 0.07)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    strip(b, [can_ring(a1 - 0.06, 0.006), can_ring(a1 - 0.06, -0.020), can_ring(a1 + 0.0, -0.020), can_ring(a1 + 0.0, 0.006), can_ring(a1 - 0.06, 0.006)], G_SKIN)
    fr = b.finish('canopy', sharp_deg=45)
    for v in fr.data.vertices: v.co -= pivot
    fr.location = pivot; gl.parent = fr; gl.location = (0, 0, 0)
    PARTS['canopy'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, CAN_OPEN), note='откидывается вверх на задней петле; canopy_glass - дочерний объект')
    return [fr, gl]


def windscreen():
    a1 = ARCH_A - 0.05; st = stations(2.150, a1, 0.07)
    b = B(); strip(b, [can_ring(a) for a in st], G_GLASS); gl = b.finish('screen_glass', sharp_deg=60)
    b2 = B(); frame_arch(b2, ARCH_A - 0.030, 0.028, h=0.022); frame_arch(b2, 2.175, 0.028, inset=0.035, h=0.012, drop=0.07)
    for sg in (1, -1):                                          # пороги козырька
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        b2.loft([[rail(a, 0.004, -0.004), rail(a, 0.014, -0.004), rail(a, 0.014, 0.024), rail(a, -0.010, 0.034), rail(a, -0.010, 0.016)] for a in stations(2.20, a1, 0.07)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    fr = b2.finish('screen_frame', sharp_deg=45)
    return [gl, fr]


# ── пилоны: по три под крылом; внутренний вынесен вперёд, перед нишей основной стойки (f100_01, 07) ──
# (тег, x, a начала, a конца, глубина под нижней поверхностью)
PYLON_DEF = (('i', 1.400, 6.020, 7.100, 0.300), ('m', 2.700, 7.300, 8.600, 0.300), ('o', 3.850, 8.470, 9.550, 0.260))
PYLON_PTS = {}


def wing_bot(x, a):
    c = TE_I(x) - LE_I(x); u = (a - LE_I(x)) / c; return wy(x) - TC(x) * c * thk(max(0.0, min(1.0, u)))


def wing_top(x, a):
    c = TE_I(x) - LE_I(x); u = (a - LE_I(x)) / c; return wy(x) + TC(x) * c * thk(max(0.0, min(1.0, u)))


def pylon(sx, tag, x, a0, a1, dep):
    b = B(); name = f'pylon_{tag}_' + ('r' if sx > 0 else 'l'); am = (a0 + a1) / 2; y0 = wing_bot(x, am) - dep; hw = 0.050
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


# ── тормозной щиток: одна большая плита под фюзеляжем между нишами, петля спереди (f100_01) ──
BRK = (5.300, 7.150, 0.460)
BRK_OPEN = 50.0


def brake():
    a0, a1, hw = BRK; n_ = 'brake'
    ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, hw * (2 * u - 1)), 12, 14, dirn=1, lift=0.005, th=0.022, z0=-3.0)
    pivot = P3(a0 + 0.030, 0.0, down(0.0, Yb(a0), z0=-3.0, dirn=1).z - 0.032); _rel(ob, pivot)
    PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, BRK_OPEN), note='петля спереди под плитой; плюс - задняя кромка вниз; цилиндр - det_brk_cyl')
    h_pl = down(0.0, Yb(a0 + 1.00), z0=-3.0, dirn=1); pe = Vector((0.0, Yb(a0 + 1.00), h_pl.z + 0.03)); pc0 = P3(a0 + 0.08, 0.0, h_pl.z + 0.26)
    bc = B(); rg = lambda c_, u, v, r: [c_ + (u * math.cos(2 * math.pi * q / 10) + v * math.sin(2 * math.pi * q / 10)) * r for q in range(10)]
    d = pe - pc0; dd = d.normalized(); U_ = Vector((1, 0, 0)); V_ = dd.cross(U_).normalized(); pm = pc0 + dd * (d.length * 0.55)
    bc.loft([rg(pc0, U_, V_, 0.040), rg(pm, U_, V_, 0.040)], G_METAL, cap0=G_METAL, cap1=G_METAL); bc.loft([rg(pm - dd * 0.04, U_, V_, 0.021), rg(pe, U_, V_, 0.021)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return [ob, bc.finish('det_brk_cyl', sharp_deg=45)]


# ── шасси: размеры (f100_07, 05, 02) ──
NG = dict(a=3.570, hinge=(3.520, -0.300), rw=0.210, ww=0.115, trk=0.140)
MG_A, MG_X = 7.800, 1.880
MAIN_T = (7.800, 1.700, -0.340)                                 # шарнир стойки: a, x, y
MG_RW, MG_WW = 0.310, 0.200
NOSE_BAY = (3.350, 4.950, 0.270)
MAIN_BAY = (7.440, 8.130, 0.280, 1.050, 1.960)                  # a0, a1, x внутр., x раздела: колодец колеса / щель ноги (её закрывает щиток на ноге), x наружн.


def doors():
    out = []; a0, a1, hw = NOSE_BAY
    for sx in (1, -1):
        n_ = 'door_n_' + ('r' if sx > 0 else 'l')
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (0.004 + (hw - 0.004) * u)), 5, 12, dirn=1, lift=0.004, th=0.016, z0=-3.0)
        pivot = P3((a0 + a1) / 2, sx * hw, down(sx * hw, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z - 0.005); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(-92.0, 0.0) if sx > 0 else (0.0, 92.0), note='створка передней ниши, петля по наружной кромке; 0 - закрыта, висит вниз на ' + ('-92' if sx > 0 else '+92'))
        out.append(ob)
    a0, a1, x0, xm, x1 = MAIN_BAY
    for sx in (1, -1):
        n_ = 'door_m_' + ('r' if sx > 0 else 'l')
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + (xm - 0.004 - x0) * u)), 10, 8, dirn=1, lift=0.004, th=0.016, z0=-3.0)
        pivot = P3((a0 + a1) / 2, sx * x0, down(sx * x0, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z - 0.005); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(0.0, 88.0) if sx > 0 else (-88.0, 0.0), note='0 - закрыта, ось у внутренней кромки, колодец колеса')
        out.append(ob)
        n_ = 'door_o_' + ('r' if sx > 0 else 'l')
        ob = patch(n_, lambda u, v: (a0 + 0.20 + (a1 - a0 - 0.40) * v, sx * (xm + 0.004 + (x1 - xm - 0.004) * u)), 8, 6, dirn=1, lift=0.004, th=0.016, z0=-3.0)
        pivot = P3(MAIN_T[0], sx * MAIN_T[1], MAIN_T[2]); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(-80.0, 0.0) if sx > 0 else (0.0, 80.0), note='щиток ноги: 0 - закрыт (стойка убрана); ось как у gear_m, при выпуске уходит вместе с ногой на ' + ('-80' if sx > 0 else '+80'))
        out.append(ob)
    return out


def build_skin():
    S = [fore(), spine(), wing_s(1), wing_s(-1), stab_fair(1), stab_fair(-1)]
    host = S[0]
    for o in S[1:]:
        _apply_bool(host, o, 'UNION'); _drop(o)
    for c in (duct_cut(), bore_cut(), cock_cut()):
        _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'F100_skin'; host.data.name = 'F100_skin'
    bvh_ready(host)
    return host


def plane(stage=9, carve=True):
    """Этапы: 1 - обшивка с крыльями; 2 - рули, оперение, сопло; 3 - кабина, фонарь, плиты, пилоны, щиток; 4 - шасси и створки."""
    import f100_detail as d
    PARTS.clear(); PYLON_PTS.clear()
    skin = build_skin(); out = [skin]
    ref_me = skin.data.copy(); d.resharp(types.SimpleNamespace(data=ref_me))
    if stage >= 2:
        out += [fin(), rudder(), stab(1), stab(-1), nozzle(), d.burner()]
        for s, n in ((1, 'r'), (-1, 'l')):
            out += [wing_part('flap_' + n, FLAP, s, HINGE_I, 'ось в центре круглого носа; плюс - вниз', (0.0, 45.0)), wing_part('ail_' + n, AIL, s, HINGE_O, 'ось в центре круглого носа; плюс - вниз', (-18.0, 18.0)),
                    slat('slat_i_' + n, SLAT_I, s), slat('slat_o_' + n, SLAT_O, s)]
    if stage >= 3:
        out += [d.cockpit_detail()]
        out += canopy() + windscreen()
        out += brake()
        for sx in (1, -1):
            for tag, x, a0, a1, dep in PYLON_DEF: out.append(pylon(sx, tag, x, a0, a1, dep))
        out += [d.details(), d.guns()] + d.hardpoints() + [d.plates()]
    if stage >= 4:
        out += doors()
        import f100_gear as gr; out += gr.gear_nose() + gr.gear_main(1) + gr.gear_main(-1)
    if carve:
        print('канавок и выемок:', d.carve(skin))
    if stage >= 3: d.bays(skin)
    d.resharp(skin); print('нормали обшивки:', d.smooth_normals(skin, ref_me)); bpy.data.meshes.remove(ref_me)
    return out
