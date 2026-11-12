# a10_geo.py - геометрия A-10A Thunderbolt II для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z (в glTF: нос -Z, правое крыло +X, верх +Y). Начало - середина длины 16,12 м.
# a - расстояние от носка фюзеляжа назад; z = 0 - уровень носка; земля на GROUND_Y.
# Размеры сняты с чертежа a10_01 (три проекции, 42 пикс/м: длина по планеру 16,12 м, размах 17,56 м - как у прежней модели игры), детали - с a10_02…10. Сетки и текстуры чужих моделей не используются.
# Сетка: замкнутые оболочки объединяются булевой операцией в одну обшивку; киль, стабилизаторы, рули, предкрылки - отдельные детали с толщиной.
import math
import types
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 16.12
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
    uh = (a_h - a_le) / chord; t = tc * chord * thk(uh); R = t + clr; lo, hi = 0.0, R          # кромка выреза на расстоянии R от оси: подбор, профиль у оси может быть и толще, и тоньше
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


GROUND_Y = -2.260                                               # земля под колёсами (a10_01, бок: 95 пикс. ниже носка при 42 пикс/м)

# ── фюзеляж: плоские борта, скруглённый верх, носок тупой; за крылом сужается в балку (a10_01, 04) ──
# (a, верх, низ, полуширина, показатель верха, показатель низа)
# Mark 2026-11-12: «сделай корпус чуть толще» - ширина и высота фюзеляжа увеличены на 11 % и 7 % против чертежа (KW, KH)
KW, KH = 1.11, 1.07
_FUS0 = [(0.000, 0.050, -0.070, 0.050, 2.0, 2.0), (0.050, 0.110, -0.170, 0.130, 2.0, 2.0), (0.140, 0.150, -0.260, 0.210, 2.1, 2.1), (0.300, 0.190, -0.370, 0.320, 2.2, 2.3), (0.620, 0.270, -0.540, 0.480, 2.4, 2.7),
       (1.100, 0.430, -0.660, 0.600, 2.6, 3.2), (1.500, 0.580, -0.690, 0.645, 2.8, 3.6), (2.050, 0.700, -0.690, 0.667, 3.0, 4.0), (2.600, 0.760, -0.690, 0.667, 3.0, 4.0), (3.500, 0.800, -0.690, 0.667, 3.0, 4.0),
       (6.000, 0.800, -0.690, 0.667, 3.0, 4.0), (9.500, 0.800, -0.690, 0.667, 3.0, 4.0), (10.300, 0.770, -0.650, 0.640, 2.9, 3.6), (11.500, 0.690, -0.500, 0.540, 2.6, 3.0), (12.900, 0.600, -0.385, 0.440, 2.4, 2.6), (13.600, 0.585, -0.380, 0.425, 2.3, 2.4), (14.800, 0.560, -0.360, 0.420, 2.2, 2.2), (15.620, 0.545, -0.345, 0.415, 2.1, 2.1), (15.745, 0.531, -0.331, 0.402, 2.0, 2.0), (15.845, 0.497, -0.297, 0.371, 2.0, 2.0), (15.930, 0.449, -0.249, 0.326, 2.0, 2.0), (16.000, 0.389, -0.189, 0.270, 2.0, 2.0), (16.055, 0.319, -0.119, 0.205, 2.0, 2.0), (16.090, 0.252, -0.052, 0.142, 2.0, 2.0), (16.110, 0.189, 0.011, 0.083, 2.0, 2.0), (16.120, 0.127, 0.073, 0.025, 2.0, 2.0)]
# хвост по фото a10_08, 03 (слова Mark «хвост странно смотрится», «как сосиска»): балка толстая до конца и кончается тупым куполом сразу за рулями высоты, острого конуса нет; утолщение KW, KH к хвосту сходит на нет
_ZC = 0.055                                                     # высота растёт от этой линии: верх и низ расходятся поровну
def _kf(a_, k): return 1 + (k - 1) * _sm((12.6 - a_) / 2.2)
FUS = [(a_, _ZC + (t_ - _ZC) * _kf(a_, KH), _ZC + (b_ - _ZC) * _kf(a_, KH), w_ * _kf(a_, KW), nt_, nb_) for a_, t_, b_, w_, nt_, nb_ in _FUS0]
FT = tracks(FUS)
FUS_END = 16.120


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
    st = [0.0, 0.012, 0.03, 0.05, 0.09, 0.14, 0.20, 0.30] + stations(0.40, 2.2, 0.10) + stations(2.4, 15.6, 0.20) + [15.62 + 0.50 * t for t in (0.12, 0.25, 0.36, 0.45, 0.54, 0.62, 0.70, 0.76, 0.82, 0.87, 0.91, 0.94, 0.965, 0.98, 0.992, 1.0)]
    return loft_obj('s_fore', [sup(a, 0.0, *[t(a) for t in FT], 88) for a in st])


# ── гаргрот: продолжает фонарь назад и сходит на спину между гондолами (a10_01, 04) ──
_DT = (0.800 - _ZC) * (KH - 1)                                  # на столько поднялся верх фюзеляжа: фонарь и гаргрот идут следом
SPINE = [(4.500, 1.276 + _DT, 0.422 * 1.04), (4.600, 1.250 + _DT, 0.430 * 1.04), (5.000, 1.170 + _DT, 0.452 * 1.04), (6.000, 1.085 + _DT, 0.500 * KW), (7.500, 0.985 + _DT, 0.560 * KW), (9.000, 0.880 + _DT, 0.600 * KW), (10.200, 0.800 + _DT, 0.560 * KW), (11.200, 0.730 + _DT * 0.8, 0.440 * KW)]
SPT = tracks(SPINE)


def spine():
    return loft_obj('s_spine', [sup(a, 0.0, SPT[0](a), fore_y(a, 0.0) - 0.35, SPT[1](a), 2.5, 2.0, 44) for a in stations(4.50, 11.20, 0.15)], sharp=45)


# ── несущие поверхности: общий расчёт сечений ──
def _in(x, sp): return sp[0] - 1e-6 <= x <= sp[1] + 1e-6


# ── крыло: прямое; центроплан без V до обтекателя стойки, консоль с V 6°, законцовка загнута вниз (a10_01) ──
XK = 2.600                                                      # излом: ось обтекателя стойки
XTIP = 8.780
WZ = -0.300
DIH = math.tan(math.radians(6.0))
TIPW, TIPD = 0.450, 0.470
def _rt(x): return (max(0.0, x - (XTIP - TIPW)) / TIPW) ** 2
def _rt2(x): return (max(0.0, x - (XTIP - 0.20)) / 0.20) ** 2
def wy(x): return WZ + DIH * max(0.0, x - XK) - TIPD * _rt(x)
_DN = 1 / math.sqrt(1 + DIH * DIH)
def wpl(sx, x):
    """Точка сечения крыла: толщина откладывается по нормали к плоскости консоли."""
    k = _sm((x - XK) / 0.30) if x > XK else 0.0; nx, nz = -DIH * _DN * k, 1 - (1 - _DN) * k
    return lambda a, h: P3(a, sx * (x + h * nx), wy(x) + h * nz)
LE0 = Lin([(0.0, 6.760), (XK, 6.760), (XTIP, 7.240)])
TE0 = Lin([(0.0, 9.900), (XK, 9.840), (XTIP, 9.330)])
LE_I = lambda x: LE0(x) + 0.30 * _rt2(x)
TE_I = lambda x: TE0(x) - 0.14 * _rt2(x)
CH0 = lambda x: TE0(x) - LE0(x)
HINGE_F = lambda x: TE0(x) - 0.300 * CH0(x)                     # закрылки
HINGE_A = lambda x: TE0(x) - 0.380 * CH0(x)                     # элероны-тормоза
FLAP_I = (0.740, 2.240); FLAP_O = (2.960, 5.100); AIL = (5.130, 8.050)
SLAT = (0.800, 2.200)
SLAT_U = 0.120
SLAT_A = lambda x: LE0(x) + SLAT_U * CH0(x)
_TC = Track([(0.30, 0.160), (XK, 0.160), (XTIP, 0.130)])
def TC(x): return _TC(x) * (1 - 0.55 * _rt(x))


def _wsec(sx, x):
    c = TE_I(x) - LE_I(x); tc = TC(x); le = LE_I(x)
    if _in(x, SLAT): u0 = (SLAT_A(x) - le) / c; head = cove_nose(le, c, tc, SLAT_A(x))
    else: u0 = 0.0008; head = cove_wall_f(le, c, tc, u0)
    if _in(x, FLAP_I) or _in(x, FLAP_O): ue, tail = cove_cut(le, c, tc, HINGE_F(x))
    elif _in(x, AIL): ue, tail = cove_cut(le, c, tc, HINGE_A(x))
    else: ue = 1.0; tail = cove_wall(le, c, tc, 1.0)
    return foil_ring(le, c, tc, u0, ue, 20, wpl(sx, x), tail=tail, head=head)


def wing_s(sx):
    k = [0.30, 0.50, 0.70, XK - 0.30, XK, XK + 0.30, 5.6, 6.2, 6.8, 7.4, 7.8] + [XTIP - TIPW * (1 - i / 12) for i in range(13)]
    for sp, n in ((FLAP_I, 5), (FLAP_O, 6), (AIL, 8), (SLAT, 5)):
        k += [sp[0] - 0.003, sp[0], sp[1], sp[1] + 0.003] + [sp[0] + (sp[1] - sp[0]) * i / n for i in range(1, n)]
    xs = sorted(set(round(v, 4) for v in k))
    return loft_obj('s_wing_' + ('r' if sx > 0 else 'l'), [_wsec(sx, x) for x in xs], sharp=48)


def wing_part(name, spec, sx, HG, note, rng, half=0):
    """Руль крыла. half = +1 / -1: верхняя / нижняя половина расщепляющегося элерона (плоскость раздела - хорда)."""
    x0, x1 = spec; e_ = 0.012 if half else 0.006; x0 += e_; x1 -= e_
    pv0 = P3(HG(x0), sx * x0, wy(x0)); pv1 = P3(HG(x1), sx * x1, wy(x1)); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    for i in range(11):
        x = x0 + (x1 - x0) * i / 10; c = TE_I(x) - LE_I(x); ah = HG(x); le = LE_I(x); tc = TC(x); pl = wpl(sx, x)
        if not half: ring = foil_ring(le, c, tc, (ah - le) / c, 1.0, 9, pl, head=cove_nose(le, c, tc, ah))
        else:
            u0 = (ah - le) / c; us = [u0 + (1.0 - u0) * (1 - math.cos(math.pi * q / 8)) / 2 for q in range(9)]; t0 = tc * c * thk(u0); g_ = 0.003
            arc = [pl(ah - t0 * math.sin(math.pi / 2 * (q + 1) / 5), half * max(g_, t0 * math.cos(math.pi / 2 * (q + 1) / 5))) for q in range(5)]          # четверть круга: от поверхности к хорде
            surf = [pl(le + c * u, half * max(g_ + 0.002, tc * c * thk(u))) for u in us]; flat = [pl(le + c * u, half * g_) for u in reversed(us[1:-1])]
            ring = surf + [pl(le + c, half * g_)] + flat + list(reversed(arc))
            if half < 0: ring = list(reversed(ring))
        rings.append([v - pivot for v in ring])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=rng, note=note)
    return ob


SLAT_DIR = Vector((0.0, 1.0, 0.0))                              # вперёд: при сдвиге вниз верхняя кромка упирается в круглый носок
SLAT_M = 0.120


def slat(name, spec, sx):
    """Предкрылок центроплана: носок профиля с вогнутым тылом, сидит на круглом носке крыла; выдвигается вперёд-вниз."""
    x0, x1 = spec; x0 += 0.005; x1 -= 0.005; pivot = P3(LE_I((x0 + x1) / 2), sx * (x0 + x1) / 2, wy(x0)); rings = []
    for i in range(9):
        x = x0 + (x1 - x0) * i / 8; c = TE_I(x) - LE_I(x); le = LE_I(x); ue, tail = cove_cut(le, c, TC(x), SLAT_A(x))
        rings.append([v - pivot for v in foil_ring(le, c, TC(x), 0.0008, ue, 9, lambda a, h: P3(a, sx * x, wy(x) + h), tail=tail, head=cove_wall_f(le, c, TC(x), 0.0008))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=SLAT_DIR.copy(), range=(0.0, SLAT_M), kind='slide', note='предкрылок центроплана: сдвиг вперёд (метры, не градусы); 0 - прижат')
    return ob


# ── обтекатели основных стоек под крылом на изломе: колесо убрано вперёд и наполовину торчит снизу (a10_01, 02, 05) ──
POD_X = XK
POD = [(5.760, -0.700, -0.800, 0.040), (5.830, -0.640, -0.860, 0.095), (5.950, -0.560, -0.930, 0.160), (6.200, -0.430, -1.030, 0.240), (6.600, -0.290, -1.080, 0.300), (7.000, -0.170, -1.090, 0.310), (7.500, -0.120, -1.090, 0.310),
       (8.200, -0.200, -1.070, 0.310), (8.800, -0.330, -0.980, 0.280), (9.300, -0.440, -0.830, 0.200), (9.700, -0.500, -0.680, 0.080), (9.780, -0.540, -0.640, 0.030)]
PDT = tracks(POD)
MG = dict(a=8.600, x=POD_X, rw=0.410, ww=0.250, piv=(8.450, -0.770), stow=(7.370, -0.920))     # колесо на земле / ось стойки (a, z) / колесо в убранном положении (a, z)
WELL = (6.900, 7.850, 0.150)                                    # колодец колеса: a0, a1, полуширина
LEGSLOT = (7.300, 8.720, 0.068)                                 # щель ноги сбоку от колодца (к оси самолёта на LEG_OFF), закрыта створкой door_m
LEG_OFF = 0.250 * 0.5 + 0.05


def pod(sx):
    st = [5.76, 5.79, 5.83, 5.89, 5.95, 6.05] + stations(6.2, 9.3, 0.155) + [9.45, 9.6, 9.7, 9.75, 9.78]
    return loft_obj('s_pod_' + ('r' if sx > 0 else 'l'), [sup(a, sx * POD_X, PDT[0](a), PDT[1](a), PDT[2](a), 2.3, 2.3, 40) for a in st], sharp=45)


def well_cut(sx):
    a0, a1, hw = WELL; zt = -0.50
    def sec(a, w, z0): return [P3(a, sx * POD_X - w, z0), P3(a, sx * POD_X + w, z0), P3(a, sx * POD_X + w, -1.6), P3(a, sx * POD_X - w, -1.6)]
    return loft_obj('c_well', [sec(a0, hw * 0.6, zt), sec(a0 + 0.12, hw, zt), sec(a1 - 0.10, hw, zt), sec(a1, hw * 0.75, zt)], G_DARK, sharp=25)


# ── гондолы двигателей: высоко по бокам задней части фюзеляжа, на коротких пилонах (a10_01, 03, 08) ──
NAC_X, NAC_Z = 1.450, 0.830
NAC = [(9.600, 0.600), (9.630, 0.632), (9.700, 0.668), (9.850, 0.700), (10.100, 0.722), (10.500, 0.730), (11.500, 0.730), (12.000, 0.705), (12.350, 0.650), (12.600, 0.585), (12.780, 0.530)]
NCT = Track(NAC)
NAC_IN = 0.560                                                  # радиус канала у кромки
FAN_A = 10.080
NOZ_A, NOZ_R = 12.780, 0.495                                    # срез и радиус наружного контура (вентиляторный)
CORE_A, CORE_R = 13.020, 0.270                                  # срез и радиус внутреннего сопла


def _circ(a, cx, cz, r, n=56): return [P3(a, cx + r * math.sin(2 * math.pi * k / n), cz - r * math.cos(2 * math.pi * k / n)) for k in range(n)]


def nacelle(sx):
    st = [9.60, 9.612, 9.63, 9.66, 9.70, 9.77, 9.85, 9.97, 10.1, 10.3, 10.5, 10.8, 11.1, 11.5, 11.8, 12.0, 12.2, 12.35, 12.5, 12.6, 12.7, NOZ_A]
    b = B(); b.loft([_circ(a, sx * NAC_X, NAC_Z, NCT(a)) for a in st], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('s_nac_' + ('r' if sx > 0 else 'l'), sharp_deg=40)


def nac_cut(sx):
    """Каналы гондолы: спереди до вентилятора, сзади кольцевой выход."""
    cx = sx * NAC_X; out = []
    prof = [(9.50, NAC_IN + 0.012, G_SKIN), (9.612, NAC_IN, G_SKIN), (9.70, NAC_IN - 0.012, G_DUCT), (9.95, NAC_IN - 0.006, G_DUCT), (FAN_A, NAC_IN, G_DUCT), (FAN_A + 0.20, NAC_IN, G_DARK), (FAN_A + 0.45, 0.30, G_DARK)]
    b = B(); b.loft([_circ(a, cx, NAC_Z, r) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_SKIN, cap1=G_DARK); out.append(b.finish('c_nin', sharp_deg=30))
    prof = [(NOZ_A + 0.10, NOZ_R + 0.004, G_METAL), (NOZ_A, NOZ_R, G_METAL), (12.45, 0.575, G_DUCT), (12.10, 0.590, G_DARK), (11.80, 0.40, G_DARK)]
    b = B(); b.loft([_circ(a, cx, NAC_Z, r) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK); out.append(b.finish('c_nout', sharp_deg=30))
    return out


def nac_pylon(sx):
    """Пилон гондолы: толстый обтекатель от борта вверх-наружу к гондоле, у бортa и у гондолы шире (a10_03, 08)."""
    rings = []
    for x in (0.25, 0.45, 0.65, 0.85, 1.05, 1.25, 1.45, 1.60):
        t = min(1.0, max(0.0, (x - 0.45) / 0.85)); le = 9.95 - 0.12 * t; c = 12.55 - le; z = 0.42 + (NAC_Z - 0.06 - 0.42) * _sm(t); tc = (0.30 - 0.07 * math.sin(math.pi * t)) * 0.9
        rings.append(foil_ring(le, c, tc, 0.0008, 1.0, 14, lambda a, h: P3(a, sx * x, z + h), tail=cove_wall(le, c, tc, 1.0), head=cove_wall_f(le, c, tc, 0.0008)))
    return loft_obj('s_npyl_' + ('r' if sx > 0 else 'l'), rings, sharp=48)


def core(sx):
    """Внутренний контур: кожух с соплом и конус, виден в кольцевом выходе (a10_08)."""
    cx = sx * NAC_X; n = 40; b = B()
    prof = [(11.85, 0.30), (12.20, 0.375), (12.60, 0.365), (12.90, 0.300), (CORE_A, CORE_R), (CORE_A, CORE_R - 0.022), (12.70, 0.300), (12.30, 0.300)]
    rs = [_circ(a, cx, NAC_Z, r, n) for a, r in prof]; b.loft(rs + [rs[0]], G_METAL)
    cone = [(12.32, 0.302), (12.36, 0.240), (12.60, 0.215), (12.95, 0.120), (13.12, 0.020)]
    b.loft([_circ(a, cx, NAC_Z, r, n) for a, r in cone], G_METAL, cap0=G_DARK, cap1=G_METAL)
    for k in range(8):                                          # стойки в кольцевом канале
        th = 2 * math.pi * (k + 0.5) / 8; er = Vector((math.sin(th), 0, -math.cos(th))); et = Vector((math.cos(th), 0, math.sin(th))); c0 = Vector((cx, Yb(12.22), NAC_Z))
        b.loft([[c0 + er * r + et * t + Vector((0, -da, 0)) for da, t in ((-0.10, 0.0), (0.0, 0.012), (0.12, 0.0), (0.0, -0.012))] for r in (0.36, 0.60)], G_DUCT, cap0=G_DUCT, cap1=G_DUCT)
    return b.finish('core_' + ('r' if sx > 0 else 'l'), sharp_deg=35)


def fan(sx):
    """Вентилятор: кок и лопатки в канале."""
    cx = sx * NAC_X; b = B(); n = 32
    cone = [(FAN_A - 0.30, 0.012), (FAN_A - 0.24, 0.085), (FAN_A - 0.14, 0.165), (FAN_A - 0.04, 0.215), (FAN_A + 0.06, 0.235)]
    b.loft([_circ(a, cx, NAC_Z, r, n) for a, r in cone], G_METAL, cap0=G_METAL, cap1=G_DARK)
    NB = 28
    for k in range(NB):
        th = 2 * math.pi * k / NB; er = Vector((math.sin(th), 0, -math.cos(th))); et = Vector((math.cos(th), 0, math.sin(th))); c0 = Vector((cx, 0, NAC_Z)); rings = []
        for q in range(5):
            r = 0.215 + (NAC_IN - 0.012 - 0.215) * q / 4; tw = math.radians(28 + 30 * q / 4); ch = 0.075 + 0.045 * q / 4; d = et * math.sin(tw) + Vector((0, -1, 0)) * math.cos(tw); o = c0 + er * r + Vector((0, Yb(FAN_A), 0))
            rings.append([o - d * ch + et * 0.0, o + d * 0.0 + et * 0.004, o + d * ch, o - et * 0.004])
        b.loft(rings, G_METAL, cap0=G_METAL, cap1=G_METAL)
    b.loft([_circ(FAN_A + 0.10, cx, NAC_Z, NAC_IN + 0.004, n), _circ(FAN_A + 0.11, cx, NAC_Z, 0.20, n)], G_DARK)
    return b.finish('fan_' + ('r' if sx > 0 else 'l'), sharp_deg=35)


# ── хвост: прямой стабилизатор на балке, кили шайбами на концах (a10_01, 08) ──
FIN_X = 2.930
ST_LE, ST_TE, ST_Z, ST_TC = 14.000, 15.810, -0.080, 0.110
ELEV = (0.500, 2.855); ELEV_H = 15.050
def ELEV_TE(x): return min(ST_TE, RUD_H + (FIN_X - 0.075 - x) / 0.44)        # срез наружного угла: руль направления при ±25° его не задевает
FZ0, FZ1 = -0.740, 2.330
def _fb(z): return (max(0.0, -0.42 - z) / 0.32) ** 2
def _ftop(z): return (max(0.0, z - (FZ1 - 0.10)) / 0.10) ** 2
F_LE = lambda z: 13.660 + 0.194 * (z + 0.40) + 0.62 * _fb(z) + 0.10 * _ftop(z)
F_TE = lambda z: 15.860 - 0.123 * (z + 0.43) - 0.50 * _fb(z) - 0.04 * _ftop(z)
RUD = (-0.480, 2.230); RUD_H = 15.130
FIN_TC = 0.100


def stab_s(sx):
    xs = [0.12, 0.30, ELEV[0] - 0.003, ELEV[0]] + [ELEV[0] + (ELEV[1] - ELEV[0]) * i / 6 for i in range(1, 6)] + [ELEV[1], ELEV[1] + 0.003, FIN_X + 0.02]; c = ST_TE - ST_LE; rings = []
    for x in xs:
        if _in(x, ELEV): ue, tail = cove_cut(ST_LE, c, ST_TC, ELEV_H)
        elif x > ELEV[1]: ue = (ELEV_H - 0.02 - ST_LE) / c; tail = cove_wall(ST_LE, c, ST_TC, ue)
        else: ue, tail = 1.0, cove_wall(ST_LE, c, ST_TC, 1.0)
        rings.append(foil_ring(ST_LE, c, ST_TC, 0.0008, ue, 18, lambda a, h: P3(a, sx * x, ST_Z + h), tail=tail, head=cove_wall_f(ST_LE, c, ST_TC, 0.0008)))
    return loft_obj('s_stab_' + ('r' if sx > 0 else 'l'), rings, sharp=48)


def elevator(sx):
    name = 'elev_' + ('r' if sx > 0 else 'l'); x0, x1 = ELEV[0] + 0.005, ELEV[1] - 0.005; c = ST_TE - ST_LE; pivot = P3(ELEV_H, sx * (x0 + x1) / 2, ST_Z); rings = []
    xs = [x0 + (2.52 - x0) * i / 5 for i in range(6)] + [2.52 + (x1 - 2.52) * i / 6 for i in range(1, 7)]
    for x in xs:
        u1 = (ELEV_TE(x) - ST_LE) / c
        rings.append([v - pivot for v in foil_ring(ST_LE, c, ST_TC, (ELEV_H - ST_LE) / c, u1, 9, lambda a, h: P3(a, sx * x, ST_Z + h), tail=cove_wall(ST_LE, c, ST_TC, u1), head=cove_nose(ST_LE, c, ST_TC, ELEV_H))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(-25.0, 15.0), note='руль высоты; ось в центре круглого носа; плюс - задняя кромка вниз; наружный угол срезан под ход руля направления')
    return ob


def _fin_tc(c): return min(FIN_TC, FIN_TC * 1.9 / c)


def fin_s(sx):
    zs = [FZ0, -0.735, -0.72, -0.69, -0.65, -0.60, -0.54, RUD[0] - 0.004, RUD[0], -0.42, -0.30, -0.15, 0.0, 0.3, 0.7, 1.1, 1.5, 1.9, RUD[1], RUD[1] + 0.004, FZ1 - 0.07, FZ1 - 0.04, FZ1 - 0.02, FZ1]; rings = []
    for z in zs:
        le = F_LE(z); te = F_TE(z); c = te - le; tc = _fin_tc(c) * (1 - 0.5 * _fb(z)) * (1 - 0.4 * _ftop(z))
        if _in(z, RUD): ue, tail = cove_cut(le, c, tc, RUD_H, 0.006)
        else: ue, tail = 1.0, cove_wall(le, c, tc, 1.0)
        rings.append(foil_ring(le, c, tc, 0.0008, ue, 18, lambda a, h: P3(a, sx * FIN_X + h, z), tail=tail, head=cove_wall_f(le, c, tc, 0.0008)))
    return loft_obj('s_fin_' + ('r' if sx > 0 else 'l'), rings, sharp=48)


def rudder(sx):
    name = 'rudder_' + ('r' if sx > 0 else 'l'); z0, z1 = RUD; pivot = P3(RUD_H, sx * FIN_X, (z0 + z1) / 2); rings = []
    for i in range(9):
        z = z0 + 0.006 + (z1 - z0 - 0.012) * i / 8; le = F_LE(z); c = F_TE(z) - le; tc = _fin_tc(c)
        rings.append([v - pivot for v in foil_ring(le, c, tc, (RUD_H - le) / c, 1.0, 9, lambda a, h: P3(a, sx * FIN_X + h, z), head=cove_nose(le, c, tc, RUD_H))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((0, 0, 1)), range=(-25.0, 25.0), note='руль направления; ось вертикальна, в центре круглого носа')
    return ob


# ── пушка: семь стволов в нише под носом, ось смещена влево (a10_01, 03, 05) ──
GUN = dict(x=-0.130, z=-0.500, a0=-0.090, a1=0.900, r=0.118, rb=0.026, hole=0.172)


def gun_cut():
    return loft_obj('c_gun', [_circ(a, GUN['x'], GUN['z'], GUN['hole'], 40) for a in (0.22, 0.75, 1.05)], G_DARK, sharp=30)


def gun():
    b = B(); cx, cz = GUN['x'], GUN['z']; n = 14; pivot = P3(0.40, cx, cz)
    for k in range(7):
        th = 2 * math.pi * k / 7; x = cx + GUN['r'] * 0.70 * math.sin(th); z = cz + GUN['r'] * 0.70 * math.cos(th)
        prof = [(GUN['a0'], GUN['rb'] * 0.62), (GUN['a0'], GUN['rb']), (GUN['a0'] + 0.05, GUN['rb']), (GUN['a0'] + 0.05, GUN['rb'] * 0.9), (GUN['a1'], GUN['rb'] * 0.9)]
        b.loft([_circ(a, x, z, r, n) for a, r in prof], G_METAL, cap0=G_DARK, cap1=G_METAL)
    for a0, a1, r in ((0.02, 0.075, GUN['r'] + 0.012), (0.42, 0.48, GUN['r'] + 0.012), (0.80, 0.90, GUN['hole'] - 0.012)):
        b.loft([_circ(a0, cx, cz, r, 28), _circ(a1, cx, cz, r, 28)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    b.loft([_circ(0.02, cx, cz, 0.030, 12), _circ(0.90, cx, cz, 0.030, 12)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    ob = b.finish('gun', sharp_deg=35); _rel(ob, pivot)
    PARTS['gun'] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(0.0, 360.0), note='блок стволов: вращение вокруг продольной оси при стрельбе')
    return ob


# ── кабина: выемка, одно кресло; козырёк и каплевидный фонарь, фонарь откидывается вверх на задней петле (a10_01, 04, 05) ──
CK_A0, CK_A1 = 1.900, 4.150
CK_HW = Track([(1.90, 0.250), (2.30, 0.345), (2.80, 0.385), (3.80, 0.385), (4.15, 0.355)])
FLOOR = -0.060


def cock_cut():
    def sec(a, y0, y1, hw): return [P3(a, -hw, y0), P3(a, hw, y0), P3(a, hw, y1), P3(a, -hw, y1)]
    return loft_obj('c_cock', [sec(a, FLOOR - 0.004, 3.0, CK_HW(a)) for a in stations(CK_A0, CK_A1, 0.07)], G_COCK, sharp=25)


CANOPY = [(a_, t_ + _DT, w_ * 1.04) for a_, t_, w_ in [(1.500, 0.0, 0.200), (1.800, 0.880, 0.300), (2.150, 1.130, 0.375), (2.550, 1.345, 0.425), (2.900, 1.465, 0.450), (3.300, 1.520, 0.462), (3.700, 1.490, 0.462), (4.100, 1.400, 0.455), (4.500, 1.275, 0.445)]]
CANOPY[0] = (1.500, fore_y(1.500, 0.0) + 0.004, 0.200)
CAN_T = tracks(CANOPY)
ARCH_A = 2.550
CAN_A1 = 4.480
CAN_OPEN = 40.0
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
    a0 = ARCH_A; a1 = CAN_A1; st = stations(a0 + 0.004, a1, 0.10); pivot = P3(a1 + 0.60, 0.0, SILL(a1) - 0.10)
    gl = glass_shell('canopy_glass', st)
    for v in gl.data.vertices: v.co -= pivot
    gl.location = pivot
    b = B(); frame_arch(b, a0 + 0.030, 0.030, h=0.024)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        b.loft([[rail(a, 0.004, 0.017), rail(a, 0.018, 0.015), rail(a, 0.018, 0.044), rail(a, -0.012, 0.059), rail(a, -0.012, 0.027)] for a in stations(a0, a1, 0.07)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    strip(b, [can_ring(a1 - 0.07, 0.006), can_ring(a1 - 0.07, -0.022), can_ring(a1 + 0.0, -0.022), can_ring(a1 + 0.0, 0.006), can_ring(a1 - 0.07, 0.006)], G_SKIN)
    fr = b.finish('canopy', sharp_deg=45)
    for v in fr.data.vertices: v.co -= pivot
    fr.location = pivot; gl.parent = fr; gl.location = (0, 0, 0)
    PARTS['canopy'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, CAN_OPEN), note='откидывается вверх на рычагах: ось в гаргроте, 0,6 м за задней рамой на уровне порога; canopy_glass - дочерний объект')
    return [fr, gl]


def windscreen():
    a1 = ARCH_A - 0.05; st = stations(1.520, a1, 0.07)
    b = B(); strip(b, [can_ring(a) for a in st], G_GLASS); gl = b.finish('screen_glass', sharp_deg=60)
    b2 = B(); frame_arch(b2, ARCH_A - 0.032, 0.030, h=0.024); frame_arch(b2, 1.545, 0.028, inset=0.035, h=0.012, drop=0.07)
    for sg in (1, -1):                                          # пороги козырька
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        b2.loft([[rail(a, 0.004, -0.004), rail(a, 0.016, -0.004), rail(a, 0.016, 0.030), rail(a, -0.010, 0.040), rail(a, -0.010, 0.016)] for a in stations(1.57, a1, 0.07)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    fr = b2.finish('screen_frame', sharp_deg=45)
    return [gl, fr]


# ── пилоны: по четыре под крылом (один между бортом и обтекателем стойки, три на консоли) и три под фюзеляжем (a10_01, 02, 10) ──
# (тег, x, a начала, a конца, глубина под нижней поверхностью)
PYLON_DEF = (('1', 1.800, 7.300, 8.600, 0.330), ('2', 3.620, 7.100, 8.580, 0.320), ('3', 4.800, 7.150, 8.540, 0.310), ('4', 5.980, 7.150, 8.300, 0.300))
PYLON_PTS = {}


def wing_bot(x, a):
    c = TE_I(x) - LE_I(x); u = (a - LE_I(x)) / c; return wy(x) - TC(x) * c * thk(max(0.0, min(1.0, u)))


def wing_top(x, a):
    c = TE_I(x) - LE_I(x); u = (a - LE_I(x)) / c; return wy(x) + TC(x) * c * thk(max(0.0, min(1.0, u)))


def pylon(sx, tag, x, a0, a1, dep):
    b = B(); name = f'pylon_{tag}_' + ('r' if sx > 0 else 'l'); am = (a0 + a1) / 2; y0 = wing_bot(x, am) - dep; hw = 0.055
    def sec(a, f=1.0): yw = wing_bot(x, a) + 0.05; return [P3(a, sx * x - hw * f, y0), P3(a, sx * x + hw * f, y0), P3(a, sx * x + hw * f * 0.85, yw), P3(a, sx * x - hw * f * 0.85, yw)]
    st = [a0, a0 + 0.10, a0 + 0.35, a1 - 0.35, a1 - 0.10, a1]; fs = [0.10, 0.70, 1.0, 1.0, 0.65, 0.10]
    b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    PYLON_PTS[name] = P3(am, sx * x, y0)
    return b.finish(name, sharp_deg=40)


def fus_pylon(tag, x, a0, a1, dep, tilt=0.0):
    """Пилон под фюзеляжем (точки игры нет)."""
    b = B(); name = 'pylon_f' + tag; hw = 0.050; zb = fore_bot((a0 + a1) / 2, x) - dep
    def sec(a, f=1.0): yw = fore_bot(a, x) + 0.05; return [P3(a, x - hw * f + tilt * dep, zb), P3(a, x + hw * f + tilt * dep, zb), P3(a, x + hw * f * 0.85, yw), P3(a, x - hw * f * 0.85, yw)]
    st = [a0, a0 + 0.10, a0 + 0.30, a1 - 0.30, a1 - 0.10, a1]; fs = [0.10, 0.70, 1.0, 1.0, 0.65, 0.10]
    b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    PYLON_PTS[name] = P3((a0 + a1) / 2, x + tilt * dep, zb)
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


def wheel(b, c, r, w, mat=G_TYRE, n=36):
    """Колесо вокруг поперечной оси X: шина и диск."""
    prof = [(-w * 0.5, r * 0.50), (-w * 0.5, r * 0.80), (-w * 0.40, r * 0.94), (-w * 0.22, r), (w * 0.22, r), (w * 0.40, r * 0.94), (w * 0.5, r * 0.80), (w * 0.5, r * 0.50)]
    rg = lambda dx, rr: [c + Vector((dx, rr * math.cos(2 * math.pi * k / n), rr * math.sin(2 * math.pi * k / n))) for k in range(n)]
    b.loft([rg(dx, rr) for dx, rr in prof], mat)
    hub = [(-w * 0.5, r * 0.50), (-w * 0.36, r * 0.46), (-w * 0.30, r * 0.18), (-w * 0.42, r * 0.12)]
    for sg in (1, -1): b.loft([rg(sg * dx, rr) for dx, rr in hub], G_METAL, cap1=G_METAL)


def stow_wheel(sx):
    """Основное колесо в убранном положении: наполовину торчит из обтекателя. В файле шасси его нет, там стойка выпущена."""
    b = B(); wheel(b, P3(MG['stow'][0], sx * POD_X, MG['stow'][1]), MG['rw'], MG['ww'])
    return b.finish('stow_m_' + ('r' if sx > 0 else 'l'), sharp_deg=35)


# ── шасси: размеры (a10_01, 02, 05) ──
NG = dict(a=3.070, x=0.310, rw=0.265, ww=0.180, piv=(3.250, -0.420))          # переднее колесо смещено вправо; стойка убирается вперёд
NOSE_BAY = (1.360, 3.420, 0.060, 0.520)                         # a0, a1, x внутр., x наружн.


def doors():
    out = []; a0, a1, x0, x1 = NOSE_BAY; xm = (x0 + x1) / 2
    for sg, n_, xa, xb in ((1, 'door_n_r', xm + 0.003, x1), (-1, 'door_n_l', xm - 0.003, x0)):
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, xa + (xb - xa) * u), 5, 12, dirn=1, lift=0.004, th=0.016, z0=-3.0)
        pivot = P3((a0 + a1) / 2, xb, down(xb, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z - 0.005); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(-92.0, 0.0) if sg > 0 else (0.0, 92.0), open=-92.0 if sg > 0 else 92.0, note='створка передней ниши, петля по наружной кромке; 0 - закрыта, висит вниз на ' + ('-92' if sg > 0 else '+92'))
        out.append(ob)
    a0, a1, hw = LEGSLOT
    for sx in (1, -1):
        n_ = 'door_m_' + ('r' if sx > 0 else 'l')
        xc = sx * (POD_X - LEG_OFF); ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, xc + hw * (2 * u - 1)), 4, 10, dirn=1, lift=0.004, th=0.014, z0=-3.0)
        pivot = P3(MG['piv'][0], xc, MG['piv'][1]); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(-90.0, 0.0), open=-90.0, note='щиток на ноге: 0 - закрыт (стойка убрана вперёд); ось как у стойки, при выпуске уходит вместе с ногой на -90')
        out.append(ob)
    return out


def build_skin():
    S = [fore(), spine()]
    for s in (1, -1): S += [wing_s(s), pod(s), nacelle(s), nac_pylon(s), stab_s(s), fin_s(s)]
    host = S[0]
    for o in S[1:]:
        _apply_bool(host, o, 'UNION'); _drop(o)
    cuts = [cock_cut(), gun_cut()]
    for s in (1, -1): cuts += nac_cut(s) + [well_cut(s)]
    for c in cuts:
        _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'A10_skin'; host.data.name = 'A10_skin'
    bvh_ready(host)
    return host


def plane(stage=9, carve=True):
    """Этапы: 1 - обшивка; 2 - рули, двигатели, пушка; 3 - кабина, фонарь, пилоны, детали; 4 - шасси и створки."""
    import a10_detail as d
    PARTS.clear(); PYLON_PTS.clear()
    skin = build_skin(); out = [skin]
    ref_me = skin.data.copy(); d.resharp(types.SimpleNamespace(data=ref_me))
    if stage >= 2:
        out += [gun()]
        for s, n in ((1, 'r'), (-1, 'l')):
            out += [core(s), fan(s), elevator(s), rudder(s), stow_wheel(s), slat('slat_' + n, SLAT, s),
                    wing_part('flap_i_' + n, FLAP_I, s, HINGE_F, 'закрылок центроплана; ось в центре круглого носа; плюс - вниз', (0.0, 30.0)),
                    wing_part('flap_o_' + n, FLAP_O, s, HINGE_F, 'закрылок консоли; ось в центре круглого носа; плюс - вниз', (0.0, 30.0)),
                    wing_part('ail_u_' + n, AIL, s, HINGE_A, 'верхняя половина элерона-тормоза; плюс - задняя кромка вниз. Элерон: обе половины вместе на -20…+20; тормоз: верхняя уходит вверх (до -40 от положения элерона)', (-45.0, 20.0), half=1),
                    wing_part('ail_d_' + n, AIL, s, HINGE_A, 'нижняя половина элерона-тормоза; плюс - задняя кромка вниз. Элерон: обе половины вместе на -20…+20; тормоз: нижняя уходит вниз (до +40 от положения элерона)', (-20.0, 45.0), half=-1)]
    if stage >= 3:
        out += canopy() + windscreen()
        for sx in (1, -1):
            for tag, x, a0, a1, dep in PYLON_DEF: out.append(pylon(sx, tag, x, a0, a1, dep))
        out += d.all_details()
    if stage >= 4:
        out += doors()
        import a10_gear as gr; out += gr.gear_nose() + gr.gear_main(1) + gr.gear_main(-1)
    if carve:
        print('канавок и выемок:', d.carve(skin))
    if stage >= 3: d.bays(skin)
    d.resharp(skin); print('нормали обшивки:', d.smooth_normals(skin, ref_me)); bpy.data.meshes.remove(ref_me)
    return out
