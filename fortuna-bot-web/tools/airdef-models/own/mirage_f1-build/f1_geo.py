# f1_geo.py - геометрия Mirage F1 (F1CT/C, одноместный, неподвижная штанга справа) для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z (в glTF: нос -Z, правое крыло +X, верх +Y).
# a - расстояние от острия носового конуса, y/z - высота над осью сопла. Длина L = 15,0 от острия конуса до среза сопла; со щупом и концом киля 15,3 (задание).
# Размеры: профиль с f1_07 (почти сбоку, 100,8 пикс/м по длине; высоты ×0,915: снимок чуть спереди, по высоте 4,5 м на колёсах), заборник с f1_09, шасси с f1_06, 07,
# план крыла и оперения - по f1_01, 05, 10 и пропорциям хорд. Сетка и текстуры чужих моделей не используются.
# Сетка: замкнутые оболочки объединяются булевой операцией в одну обшивку; киль, стабилизаторы, рули, предкрылки - отдельные детали с толщиной.
import math
import types
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 15.00
G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_DUCT = 0, 1, 2, 3, 4, 5, 11     # обшивка; металл и механика; нутро; стекло; резина; кабина; канал и ниши
PARTS = {}       # имя -> dict(pivot, axis, range, note): для паспорта
KZ = 0.915       # высоты с фото 07 ×0,915


def Yb(a): return L / 2 - a


def P3(a, x, y): return Vector((x, Yb(a), y))


# ── гладкая интерполяция таблиц (монотонный кубический Эрмит) ──
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
    return 5 * (0.2969 * math.sqrt(max(u, 0)) - 0.1260 * u - 0.3516 * u ** 2 + 0.2843 * u ** 3 - 0.1015 * u ** 4) * 0.5 * 2


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
def cove_cut_f(a_le, chord, tc, a_h, clr=COVE_R):
    uh = (a_h - a_le) / chord; t = tc * chord * thk(uh); rc = t + clr; a_e = a_h + math.sqrt(max(rc * rc - t * t, 1e-9)); te = tc * chord * thk((a_e - a_le) / chord); rc = math.hypot(a_e - a_h, te); al = math.atan2(te, a_e - a_h)
    return (a_e - a_le) / chord, [(a_h + rc * math.cos(-al + 2 * al * (i + 1) / (COVE_K + 1)), rc * math.sin(-al + 2 * al * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_wall_f(a_le, chord, tc, u0):
    a_ = a_le + chord * u0; t = tc * chord * thk(u0); return [(a_, t * (-1 + 2 * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_tail(a_le, chord, tc, a_h):
    t = tc * chord * thk((a_h - a_le) / chord); return [(a_h + t * math.sin(math.pi * (i + 1) / (COVE_K + 1)), t * math.cos(math.pi * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]


# ── фюзеляж: острый конус носа (верх круче низа), фонарь, высокая спина к килю, круглая хвостовая часть (f1_07) ──
_FORE_RAW = [  # a, верх, низ (с фото, до ×KZ), полуширина, n верха, n низа
    (0.00, 0.010, -0.010, 0.010, 2.0, 2.0), (0.30, 0.068, -0.046, 0.058, 2.0, 2.0), (0.70, 0.152, -0.100, 0.128, 2.0, 2.0), (1.20, 0.258, -0.170, 0.218, 2.0, 2.0), (1.90, 0.400, -0.270, 0.330, 2.0, 2.05),
    (2.60, 0.530, -0.370, 0.420, 2.3, 2.6), (3.30, 0.660, -0.440, 0.470, 2.6, 3.0), (4.00, 0.720, -0.500, 0.495, 2.6, 3.0), (4.45, 0.800, -0.535, 0.515, 2.3, 2.8), (4.80, 0.970, -0.560, 0.530, 1.75, 2.5),
    (5.40, 1.010, -0.590, 0.540, 1.65, 2.6), (6.50, 1.010, -0.620, 0.560, 1.65, 2.6), (8.00, 0.960, -0.650, 0.600, 1.7, 2.6), (9.50, 0.910, -0.690, 0.650, 1.8, 2.5), (10.70, 0.870, -0.710, 0.675, 1.9, 2.4),
    (12.00, 0.800, -0.710, 0.670, 2.0, 2.3), (13.20, 0.700, -0.690, 0.640, 2.0, 2.2), (14.40, 0.610, -0.640, 0.580, 2.0, 2.0)]
FORE = [(a, t * KZ, b * KZ, hw, nt, nb) for a, t, b, hw, nt, nb in _FORE_RAW]
FT = tracks(FORE)
RAD_A = 1.880                                                   # конец чёрного конуса носа
NAC_A1 = 14.40                                                  # конец обшивки, дальше сопло


def fore_y(a, x):
    """Высота верхней поверхности над |x|: для порога фонаря."""
    top, bot, hw, nt = FT[0](a), FT[1](a), FT[2](a), FT[3](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nt)
    return cy + ht * q ** (1 / nt)


def side_x(a, z):
    """Полуширина корпуса на высоте z: для корня стабилизатора."""
    top, bot, hw, nt, nb = [t(a) for t in FT]; cy = (top + bot) / 2; ht = (top - bot) / 2; s = max(-0.999, min(0.999, (z - cy) / ht)); e = nt if s > 0 else nb
    return hw * max(0.0, 1 - abs(s) ** e) ** (1 / e)


def fore():
    st = [0.0, 0.03, 0.07, 0.12, 0.2] + stations(0.3, 2.0, 0.10) + stations(2.1, NAC_A1, 0.20)
    return loft_obj('s_fore', [sup(a, 0.0, *[t(a) for t in FT], 80) for a in st])


# ── заборники: полукруглые на бортах, плоская стенка у фюзеляжа, неподвижный полуконус (f1_07, 09); труба уходит назад под крыло ──
INL_A = 4.62; DUCT_X = 0.545; DUCT_Z = 0.26; DUCT_R = (0.340, 0.405)     # плоская сторона у корпуса, полукруг наружу; радиусы канала у кромки
CH = tracks([(4.62, 0.545, 0.260, 0.370, 0.435), (5.40, 0.545, 0.250, 0.385, 0.445), (6.40, 0.545, 0.225, 0.380, 0.445), (7.60, 0.545, 0.170, 0.345, 0.425), (9.00, 0.545, 0.080, 0.270, 0.370), (10.40, 0.545, -0.020, 0.130, 0.240), (11.20, 0.545, -0.060, 0.020, 0.050)])


def cheek(sx):
    def ring(a):
        cx, cz, rx, rz = [t(a) for t in CH]; return sup(a, sx * cx, cz + rz, cz - rz, rx, 2.3, 2.3, 72)
    return loft_obj('s_cheek_' + ('r' if sx > 0 else 'l'), [ring(a) for a in stations(INL_A, 11.2, 0.22)], G_SKIN, sharp=40)


def half_ring(a, sx, xi, zc, rx, rz, n=40):
    """Полукруг наружу от плоской стороны у корпуса."""
    pts = [P3(a, sx * (xi + rx * math.sin(math.pi * k / n)), zc - rz * math.cos(math.pi * k / n)) for k in range(n + 1)]
    return pts + [P3(a, sx * xi, zc + rz * (1 - 2 * j / 8)) for j in range(1, 8)]


def duct_cut(sx):
    """Канал вглубь, глухой торец: плавно темнеет, колец и полос нет."""
    a0, a1 = INL_A - 0.18, INL_A + 2.70; rings = []
    for i in range(11):
        a = a0 + (a1 - a0) * i / 10; t = max(0.0, min(1.0, (a - (INL_A + 0.6)) / (a1 - INL_A - 0.6))); t = t * t * (3 - 2 * t); rings.append(half_ring(a, sx, DUCT_X, DUCT_Z - 0.04 * t, DUCT_R[0] - 0.09 * t, DUCT_R[1] - 0.07 * t))
    return loft_obj('c_duct', rings, G_DUCT, sharp=25)


def diverter(sx):
    """Плоская стенка заборника у корпуса с острой передней кромкой, отстоит от борта: щель для пограничного слоя (f1_09)."""
    b = B(); x0 = sx * (DUCT_X - 0.028); x1 = sx * (DUCT_X - 0.004); z0, z1 = DUCT_Z - DUCT_R[1] - 0.02, DUCT_Z + DUCT_R[1] + 0.02
    ring = lambda a, k: [P3(a, x0, DUCT_Z - (DUCT_Z - z0) * k), P3(a, x1, DUCT_Z - (DUCT_Z - z0) * k), P3(a, x1, DUCT_Z + (z1 - DUCT_Z) * k), P3(a, x0, DUCT_Z + (z1 - DUCT_Z) * k)]
    b.loft([ring(INL_A - 0.07, 0.96), ring(INL_A + 0.80, 1.0)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); return b.finish('s_div', sharp_deg=30)


CONE = [(4.25, 0.004), (4.40, 0.072), (4.55, 0.140), (4.70, 0.198), (4.95, 0.243), (5.30, 0.262)]


def cone(sx):
    """Неподвижный полуконус в устье (задание: подвижный не нужен)."""
    name = 'cone_' + ('r' if sx > 0 else 'l'); pv = P3(4.85, sx * DUCT_X, DUCT_Z); b = B(); xi = DUCT_X + 0.003
    b.loft([[v - pv for v in half_ring(a, sx, xi, DUCT_Z, r * 1.02, r, n=24)] for a, r in CONE], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); ob = b.finish(name, sharp_deg=40); ob.location = pv
    return ob


# ── крыло: стреловидное (47° по передней кромке), высокое, лёгкая обратная поперечная V; предкрылки в две секции, закрылок, элерон; направляющая на законцовке ──
XR, XTIP = 0.40, 4.06
def wy(x): return 0.62 * KZ - 0.052 * (x - 0.5)
LE_I = lambda x: 6.20 + 1.072 * (x - 0.50)
TE_I = lambda x: 10.15 + 0.320 * (x - 0.50)
SLAT_I = lambda x: 0.300 - 0.022 * (x - 0.95)                  # хорда предкрылка
HINGE_I = lambda x: TE_I(x) - (0.80 - 0.055 * (x - 0.74))       # линия навески закрылка
HINGE_O = lambda x: TE_I(x) - 0.50                              # элерона
FLAP = (0.740, 2.600); AIL = (2.660, 3.900); SLAT_A = (1.020, 2.440); SLAT_B = (2.480, 4.050); SLAT_X = (SLAT_A[0], SLAT_B[1])
GAP = 0.012
TRIM_S, TRIM_F = 0.025, 0.020                                  # запас на торцах предкрылков и закрылков/элеронов: ось наклонная
def _cut(r, t): return (r[0] + t, r[1] - t)                     # вырез в крыле ровно по длине подвижной части: на торцах глухая стенка, насквозь не видно
TC = Track([(XR, 0.050), (2.0, 0.045), (XTIP, 0.036)])


def in_(x, r): return r[0] - 1e-6 <= x <= r[1] + 1e-6


def _wsec(sx, x):
    """Кольцо неподвижной части: круглые вырезы под предкрылок спереди и под закрылок или элерон сзади."""
    c = TE_I(x) - LE_I(x); tc = TC(x); le = LE_I(x)
    if in_(x, _cut(SLAT_A, TRIM_S)) or in_(x, _cut(SLAT_B, TRIM_S)): us, head = cove_cut_f(le, c, tc, le + SLAT_I(x))
    else: us = 0.0008; head = cove_wall_f(le, c, tc, us)
    if in_(x, _cut(FLAP, TRIM_F)): ue, tail = cove_cut(le, c, tc, HINGE_I(x))
    elif in_(x, _cut(AIL, TRIM_F)): ue, tail = cove_cut(le, c, tc, HINGE_O(x))
    else: ue = 1.0; tail = cove_wall(le, c, tc, 1.0)
    return foil_ring(le, c, tc, us, ue, 18, lambda a, h: P3(a, sx * x, wy(x) + h), tail=tail, head=head)


def wing_s(sx):
    xs = {XR, 0.50, XTIP}
    for r in (_cut(FLAP, TRIM_F), _cut(AIL, TRIM_F), _cut(SLAT_A, TRIM_S), _cut(SLAT_B, TRIM_S)):
        xs |= {r[0] - 0.004, r[0], r[1], r[1] + 0.004}
        for i in range(1, 6): xs.add(round(r[0] + (r[1] - r[0]) * i / 6, 4))
    xs = sorted(v for v in xs if XR <= v <= XTIP)
    return loft_obj('s_wing_' + ('r' if sx > 0 else 'l'), [_wsec(sx, x) for x in xs], sharp=48)


def wing_part(name, spec, sx, HG, note, rng):
    x0, x1 = _cut(spec, TRIM_F); x0 += 0.012; x1 -= 0.012       # торцы с запасом 1,2 см до глухой стенки
    pv0 = P3(HG(x0), sx * x0, wy(x0)); pv1 = P3(HG(x1), sx * x1, wy(x1)); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    for i in range(9):
        x = x0 + (x1 - x0) * i / 8; c = TE_I(x) - LE_I(x); ah = HG(x)
        rings.append([v - pivot for v in foil_ring(LE_I(x), c, TC(x), (ah - LE_I(x)) / c, 1.0, 9, lambda a, h: P3(a, sx * x, wy(x) + h), head=cove_nose(LE_I(x), c, TC(x), ah))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=rng, note=note)
    return ob


def slat(name, spec, sx):
    """Секция предкрылка; ось в центре круглой задней части."""
    xa, xb = _cut(spec, TRIM_S); xa += 0.012; xb -= 0.012
    p0 = P3(LE_I(xa) + SLAT_I(xa), sx * xa, wy(xa)); p1 = P3(LE_I(xb) + SLAT_I(xb), sx * xb, wy(xb)); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized()
    if axis.x > 0: axis = -axis                                 # плюс - носок вниз
    def sec(x):
        c = TE_I(x) - LE_I(x); le = LE_I(x); sl = SLAT_I(x)
        return [v - pivot for v in foil_ring(le, c, TC(x), 0.0008, sl / c, 12, lambda a, h: P3(a, sx * x, wy(x) + h), tail=cove_tail(le, c, TC(x), le + sl), head=cove_wall_f(le, c, TC(x), 0.0008))]
    ob = loft_obj(name, [sec(xa + (xb - xa) * i / 7) for i in range(8)], sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(0.0, 15.0), note='предкрылок, ось в центре круглой задней части; плюс - носок вниз')
    return ob


def tip_rail(sx):
    """Направляющая на законцовке без ракеты (f1_01, 02, 04): балка с обтекателями спереди и сзади, полоз снизу."""
    x = XTIP + 0.030; y = wy(XTIP); b = B(); a0, a1 = LE_I(XTIP) - 0.36, TE_I(XTIP) + 0.30
    def rg(a, hw, ht, dz=0.0): return [P3(a, sx * x - hw, y - ht + dz), P3(a, sx * x + hw, y - ht + dz), P3(a, sx * x + hw, y + ht * 0.6 + dz), P3(a, sx * x - hw, y + ht * 0.6 + dz)]
    b.loft([rg(a0, 0.012, 0.012), rg(a0 + 0.20, 0.034, 0.050), rg(a1 - 0.18, 0.034, 0.050), rg(a1, 0.010, 0.018)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    b.loft([rg(a0 + 0.30, 0.020, 0.010, -0.058), rg(a1 - 0.25, 0.020, 0.010, -0.058)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('pylon_t_' + ('r' if sx > 0 else 'l'), sharp_deg=40)


# ── киль: стреловидный, сзади нависает над соплом; руль в средней части; наверху обтекатель антенн, у основания сзади контейнер (f1_06, 07) ──
FIN_T = 0.032
F_LE = Lin([(0.50 * KZ, 10.10), (0.86 * KZ, 10.45), (1.60 * KZ, 11.51), (3.10 * KZ, 14.18)])
F_TE = Lin([(0.50 * KZ, 13.92), (3.08 * KZ, 15.08)])
FIN_TOP = 3.10 * KZ
RUD = (1.18 * KZ, 2.62 * KZ)
RUD_C = Track([(1.18 * KZ, 0.580), (2.62 * KZ, 0.470)])


def fin():
    y0 = 0.50 * KZ
    ys = [y0, 0.62, 0.72, 0.85, 0.95, RUD[0] - 0.004, RUD[0]] + [RUD[0] + (RUD[1] - RUD[0]) * i / 6 for i in range(1, 7)] + [RUD[1] + 0.004, 2.55, 2.70, FIN_TOP]
    rings = []
    for y in sorted(set(round(v, 4) for v in ys)):
        c = F_TE(y) - F_LE(y)
        if RUD[0] - 1e-6 <= y <= RUD[1] + 1e-6: ue, tail = cove_cut(F_LE(y), c, FIN_T, F_TE(y) - RUD_C(y), 0.006)
        else: ue, tail = 1.0, cove_wall(F_LE(y), c, FIN_T, 1.0)
        rings.append(foil_ring(F_LE(y), c, FIN_T, 0.0008, ue, 16, lambda a, h: P3(a, h, y), tail=tail, head=cove_wall_f(F_LE(y), c, FIN_T, 0.0008)))
    b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    n = 16
    def cig(prof, cy, kx=1.0, kz=1.0):
        b.loft([[P3(a, r * kx * math.cos(2 * math.pi * q / n), cy + r * kz * math.sin(2 * math.pi * q / n)) for q in range(n)] for a, r in prof], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    cig([(12.70, 0.010), (13.05, 0.070), (13.50, 0.098), (14.25, 0.100), (14.42, 0.080), (14.50, 0.030)], 0.68)       # контейнер у основания киля сзади (f1_07)
    cig([(13.90, 0.008), (14.15, 0.045), (14.60, 0.060), (15.02, 0.058), (15.14, 0.040), (15.18, 0.010)], FIN_TOP - 0.02, 0.85, 1.0)   # обтекатель антенн наверху
    return b.finish('fin_c', sharp_deg=48)


def rudder():
    y0, y1 = RUD; h0 = F_TE(y0) - RUD_C(y0); h1 = F_TE(y1) - RUD_C(y1); p0 = P3(h0, 0.0, y0); p1 = P3(h1, 0.0, y1); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized(); rings = []
    for i in range(9):
        y = y0 + 0.014 + (y1 - y0 - 0.028) * i / 8; c = F_TE(y) - F_LE(y); ah = F_TE(y) - RUD_C(y)
        rings.append([v - pivot for v in foil_ring(F_LE(y), c, FIN_T, (ah - F_LE(y)) / c, 1.0, 9, lambda a, h: P3(a, h, y), head=cove_nose(F_LE(y), c, FIN_T, ah))])
    ob = loft_obj('rudder', rings, sharp=48); ob.location = pivot
    PARTS['rudder'] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-25.0, 25.0), note='ось в центре круглого носа, снизу вверх')
    return ob


# ── цельноповоротный стабилизатор: низко на борту хвостовой части (f1_06, 07) ──
STAB_Y, STAB_DY, STAB_A = -0.10, -0.030, 12.95
SXR, SXT = 0.660, 2.350
S_LE = Lin([(SXR, 12.00), (SXT, 13.86)])
S_TE = Lin([(SXR, 14.20), (SXT, 14.66)])
STAB_GAP = 0.022


def stab(sx):
    """Корень повторяет борт (зазор 2,2 см), к концу стабилизатор прямой."""
    name = 'stab_' + ('r' if sx > 0 else 'l'); pivot = P3(STAB_A, sx * (side_x(STAB_A, STAB_Y) + STAB_GAP), STAB_Y)
    ss = [0.0, 0.03, 0.08, 0.16, 0.28, 0.42, 0.56, 0.70, 0.82, 0.92, 0.97, 1.0]; rings = []
    for s in ss:
        xn = SXR + (SXT - SXR) * s; c = S_TE(xn) - S_LE(xn); r_ = foil_ring(S_LE(xn), c, 0.040 - 0.008 * s, 0.0, 1.0, 22, lambda a, h: P3(a, sx * xn, STAB_Y + STAB_DY * (xn - SXR) + h))
        out = []
        for p in r_:
            a_ = L / 2 - p.y; xr = side_x(a_, p.z) + STAB_GAP; out.append(Vector((sx * (abs(p.x) + (1 - s) * (xr - SXR)), p.y, p.z)) - pivot)
        rings.append(out)
    b = B(); r0 = rings[0]; nr = len(r0); inner = [(r0[k] + r0[nr - 1 - k]) / 2 for k in range(nr)]
    b.loft([inner] + rings, G_SKIN, cap1=G_SKIN)
    n = 14; xr0 = side_x(STAB_A, STAB_Y); rg = lambda x_, r: [P3(STAB_A + r * math.cos(2 * math.pi * k / n), sx * x_, STAB_Y + r * math.sin(2 * math.pi * k / n)) - pivot for k in range(n)]
    b.loft([rg(xr0 + 0.014, 0.040), rg(xr0 + STAB_GAP + 0.01, 0.040)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    ob = b.finish(name, sharp_deg=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(-20.0, 20.0), note='цельноповоротный; ось поперёк у борта; плюс - задняя кромка вниз')
    return ob


def ventral(sx):
    """Подфюзеляжный гребень (f1_04, 06, 07): наклонён наружу, неподвижен."""
    xr, zr = 0.30, FT[1](12.5) + 0.06; xt, zt = 0.46, -1.06 * KZ; t = 0.016
    root = [(11.55, 0.0), (13.45, 0.0)]; tip = [(12.05, 1.0), (13.30, 1.0)]
    def pt(a, k, s): return P3(a, sx * (xr + (xt - xr) * k) + s * t, zr + (zt - zr) * k)
    rings = [[pt(a, k, -1) for a, k in (root[0], root[1], tip[1], tip[0])], [pt(a, k, 1) for a, k in (root[0], root[1], tip[1], tip[0])]]
    return loft_obj('s_vent_' + ('r' if sx > 0 else 'l'), rings, G_SKIN, sharp=40)


# ── сопло: светлая обечайка и лепестки (f1_06, 07) ──
NOZ_X, NOZ_Y, NOZ_A, NOZ_R = 0.0, -0.015, 15.00, 0.500
NOZ_K = 0.555 / 0.405


def nozzle():
    b = B(); cx = NOZ_X; N = 16; a0 = NAC_A1 + 0.002; a1 = NOZ_A; aM = a0 + 0.300; aP = a0 + 0.31
    def ptp(a, r, ang): return P3(a, cx + r * math.sin(ang), NOZ_Y - r * math.cos(ang))
    ring = lambda a, r, nn=64: [ptp(a, r, 2 * math.pi * k / nn) for k in range(nn)]
    def box_sect(a, r, ang, hw_ang, th): return [ptp(a, r, ang - hw_ang), ptp(a, r, ang + hw_ang), ptp(a, r + th, ang + hw_ang), ptp(a, r + th, ang - hw_ang)]
    R0 = 0.575
    sec = [ring(a0 - 0.02, R0 - 0.01), ring(a0 + 0.015, R0 + 0.008), ring(aM - 0.03, R0 + 0.002), ring(aM, R0 - 0.012), ring(aM, R0 - 0.050), ring(a0 - 0.02, R0 - 0.060)]
    b.loft(sec + [sec[0]], G_METAL)
    b.loft([ring(aM - 0.01, R0 - 0.052), ring(aP + 0.06, R0 - 0.064)], G_DARK)
    Rp = lambda a: (R0 - 0.020) + (NOZ_R - (R0 - 0.020)) * (a - aP) / (a1 - aP)
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
        b.loft([box_sect(aP + 0.04, Rp(aP + 0.04) + 0.005, am, 0.024, 0.012), box_sect(a1 - 0.08, Rp(a1 - 0.08) + 0.005, am, 0.024, 0.012)], G_METAL, cap0=G_METAL, cap1=G_METAL)
        hwi = math.pi / N * 0.97
        b.loft([box_sect(a1 - 0.002, NOZ_R - th - 0.003, am, hwi, -0.006), box_sect(a1 - 0.22, 0.47, am, hwi, -0.006), box_sect(a0 + 0.03, 0.535, am, hwi, -0.006)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('nozzle', sharp_deg=30)


def bore_cut():
    a1 = NAC_A1; n = 64; ring = lambda a, r: [P3(a, NOZ_X + r * math.sin(2 * math.pi * k / n), NOZ_Y - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    prof = [(a1 + 0.25, 0.545, G_METAL), (a1 - 0.18, 0.545, G_METAL), (a1 - 0.22, 0.520, G_METAL), (a1 - 0.30, 0.520, G_METAL), (a1 - 0.34, 0.545, G_METAL), (a1 - 0.80, 0.550, G_COCK), (a1 - 1.10, 0.550, G_DARK), (a1 - 1.50, 0.360, G_DARK), (a1 - 1.62, 0.050, G_DARK)]
    b = B(); b.loft([ring(a, r) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK)
    return b.finish('c_bore', sharp_deg=30)


# ── кабина: выемка, одно кресло; длинный козырёк, фонарь с петлёй сзади (f1_02, 07, 09) ──
CK_A0, CK_A1 = 2.80, 4.66
CK_HW = Track([(2.80, 0.250), (3.05, 0.310), (3.40, 0.330), (4.00, 0.335), (4.40, 0.310), (4.66, 0.260)])
FLOOR = -0.310


def cock_cut():
    def sec(a, y0, y1, hw): return [P3(a, -hw, y0), P3(a, hw, y0), P3(a, hw, y1), P3(a, -hw, y1)]
    def fl(a):                                                 # пол выреза: не ниже FLOOR и так, чтобы борт снаружи оставался не тоньше 2,5 см
        z = FLOOR
        while side_x(a, z) < CK_HW(a) + 0.025 and z < 0.4: z += 0.005
        return z
    return loft_obj('c_cock', [sec(a, fl(a) - 0.004, 1.90, CK_HW(a)) for a in stations(CK_A0, CK_A1, 0.07)], G_COCK, sharp=25)


CAN_A1 = 4.80
CANOPY = [(2.630, fore_y(2.630, 0.0) + 0.004, 0.300), (2.900, 0.650, 0.350), (3.300, 0.830, 0.385), (3.620, 0.915, 0.392), (3.950, 0.940, 0.390), (4.300, 0.925, 0.372), (4.600, 0.890, 0.330), (CAN_A1, fore_y(CAN_A1, 0.0) + 0.004, 0.270)]
CAN_T = tracks(CANOPY)
CAN_HINGE = (CAN_A1 + 0.060, fore_y(CAN_A1 + 0.06, 0.0) + 0.030)
ARCH_A = 3.620
def SILL(a): return fore_y(a, CAN_T[1](a))


def can_ring(a, inset=0.0, n=44):
    top, hw = CAN_T[0](a) - inset, CAN_T[1](a) - inset; y0 = SILL(a) + 0.002
    return [P3(a, hw * math.cos(math.pi * k / (n - 1)) ** 0.70 if math.cos(math.pi * k / (n - 1)) >= 0 else -hw * (-math.cos(math.pi * k / (n - 1))) ** 0.70, y0 + (top - y0) * math.sin(math.pi * k / (n - 1)) ** 0.82) for k in range(n)]


def glass_shell(name, st):
    b = B(); strip(b, [can_ring(a) for a in st], G_GLASS)
    return b.finish(name, sharp_deg=60)


def frame_arch(b, a, w, inset=0.008, h=0.020, n=44, drop=0.0):
    ri0 = can_ring(a - w, inset, n); ro0 = can_ring(a - w, -h, n); ro1 = can_ring(a + w, -h, n); ri1 = can_ring(a + w, inset, n)
    if drop: ri0 = [p - Vector((0, 0, drop)) for p in ri0]; ri1 = [p - Vector((0, 0, drop)) for p in ri1]     # низ рамы уходит в обшивку: без зазора
    strip(b, [ri0, ro0, ro1, ri1, ri0], G_SKIN)


def canopy():
    a0 = ARCH_A; a1 = CAN_A1 - 0.03; st = stations(a0 + 0.004, a1, 0.10); pivot = P3(CAN_HINGE[0], 0.0, CAN_HINGE[1])
    gl = glass_shell('canopy_glass', st)
    for v in gl.data.vertices: v.co -= pivot
    gl.location = pivot
    b = B(); frame_arch(b, a0 + 0.030, 0.030, h=0.024)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        b.loft([[rail(a, 0.004, 0.014), rail(a, 0.018, 0.012), rail(a, 0.018, 0.030), rail(a, -0.012, 0.046), rail(a, -0.012, 0.024)] for a in stations(a0, a1, 0.07)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    strip(b, [can_ring(a1 - 0.03, 0.006), can_ring(a1 - 0.03, -0.020), can_ring(a1 + 0.02, -0.020), can_ring(a1 + 0.02, 0.006), can_ring(a1 - 0.03, 0.006)], G_SKIN)
    for sg in (1, -1):
        for a in (3.85, 4.15, 4.45, 4.70):
            y = SILL(a); x = sg * (CAN_T[1](a) - 0.022)
            b.loft([[P3(a, x - 0.009, y + 0.004), P3(a + 0.05, x - 0.009, y + 0.004), P3(a + 0.05, x + 0.009, y + 0.004), P3(a, x + 0.009, y + 0.004)], [P3(a, x - 0.009, y + 0.015), P3(a + 0.05, x - 0.009, y + 0.015), P3(a + 0.05, x + 0.009, y + 0.015), P3(a, x + 0.009, y + 0.015)]], G_METAL, cap0=G_METAL, cap1=G_METAL)
    fr = b.finish('canopy', sharp_deg=45)
    for v in fr.data.vertices: v.co -= pivot
    fr.location = pivot; gl.parent = fr; gl.location = (0, 0, 0)
    PARTS['canopy'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, 40.0), note='петля сзади; плюс - передняя кромка вверх (открывается назад-вверх); canopy_glass - дочерний объект')
    return [fr, gl]


def windscreen():
    a1 = ARCH_A - 0.030; st = stations(2.650, a1, 0.08)
    b = B(); strip(b, [can_ring(a) for a in st], G_GLASS); gl = b.finish('screen_glass', sharp_deg=60)
    b2 = B(); frame_arch(b2, ARCH_A - 0.029, 0.027, h=0.022)          # вплотную к дуге фонаря: зазора между дугами нет (рецепт, F/A-18C); frame_arch(b2, 2.680, 0.030, inset=0.035, h=0.012, drop=0.06)
    for sg in (1, -1):                                         # боковые стойки козырька (f1_07)
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        b2.loft([[rail(a, 0.004, 0.010), rail(a, 0.016, 0.010), rail(a, 0.016, 0.026), rail(a, -0.010, 0.040), rail(a, -0.010, 0.020)] for a in stations(2.66, a1, 0.08)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    fr = b2.finish('screen_frame', sharp_deg=45)
    return [gl, fr]


# ── пилоны: два под крылом на сторону, две точки под фюзеляжем на сторону (8 точек), крепление контейнера по оси ──
def _pyl(x, f0, f1):
    a0 = LE_I(x) + (TE_I(x) - LE_I(x)) * f0; a1 = LE_I(x) + (TE_I(x) - LE_I(x)) * f1; return a0, a1
PYLON_DEF = (('o', 3.000) + _pyl(3.000, 0.22, 0.62) + (wy(3.000) - 0.270,), ('i', 1.800) + _pyl(1.800, 0.20, 0.64) + (wy(1.800) - 0.300,))
FUSE_DEF = (('f', 0.330, 7.25), ('a', 0.330, 10.80))
POD = (8.80, 0.000)
PYLON_PTS = {}


def pylon(sx, tag, x, a0, a1, y0):
    b = B(); name = f'pylon_{tag}_' + ('r' if sx > 0 else 'l'); yw = wy(x) - 0.01; hw = 0.055
    def sec(a, f=1.0): return [P3(a, sx * x - hw * f, y0), P3(a, sx * x + hw * f, y0), P3(a, sx * x + hw * f * 0.85, yw), P3(a, sx * x - hw * f * 0.85, yw)]
    st = [a0, a0 + 0.12, a0 + 0.40, a1 - 0.45, a1 - 0.12, a1]; fs = [0.10, 0.70, 1.0, 1.0, 0.65, 0.10]
    b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    PYLON_PTS[name] = P3((a0 + a1) / 2, sx * x, y0)
    return b.finish(name, sharp_deg=40)


def flush_points():
    """Точки под фюзеляжем и контейнера: заподлицо с обшивкой, выступающих плит нет."""
    for sx in (1, -1):
        for tag, x, am in FUSE_DEF: PYLON_PTS[f'pylon_{tag}_' + ('r' if sx > 0 else 'l')] = P3(am, sx * x, down(sx * x, Yb(am), z0=-3.0, dirn=1).z - 0.012)
    am, x = POD; PYLON_PTS['pod'] = P3(am, x, down(x, Yb(am), z0=-3.0, dirn=1).z - 0.012)


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


# ── воздушные тормоза снизу на трубах заборников, перед основными стойками (f1_04, 05): петля спереди, цилиндр ──
BRK = (5.45, 6.30, 0.300, 0.600)
BRK_TOP = -0.17


def brake(sx):
    n_ = 'brake_' + ('r' if sx > 0 else 'l'); a0, a1, x0, x1 = BRK
    ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + (x1 - x0) * u)), 10, 10, dirn=1, lift=0.006, th=0.020, z0=-3.0)
    xm = sx * (x0 + x1) / 2; pi_ = down(sx * x0, Yb(a0), z0=-3.0, dirn=1); po_ = down(sx * x1, Yb(a0), z0=-3.0, dirn=1)
    ax = (po_ - pi_).normalized(); ax = ax if ax.x > 0 else -ax                 # ось вдоль передней кромки щитка, по наклонной обшивке
    pivot = (pi_ + po_) / 2 + Vector((0, 0, -0.006)); _rel(ob, pivot)
    PARTS[n_] = dict(pivot=pivot.copy(), axis=ax, range=(0.0, 55.0), note='петля по передней кромке; плюс - задняя кромка вниз; цилиндр - det_brk_cyl')
    h_pl = down(xm, Yb(a0 + 0.62), z0=-3.0, dirn=1); pe = Vector((xm, Yb(a0 + 0.62), h_pl.z + 0.03)); pc0 = P3(a0 + 0.10, xm, h_pl.z + 0.20)
    bc = B(); rg = lambda c_, u, v, r: [c_ + (u * math.cos(2 * math.pi * q / 10) + v * math.sin(2 * math.pi * q / 10)) * r for q in range(10)]
    d = pe - pc0; dd = d.normalized(); U_ = Vector((1, 0, 0)); V_ = dd.cross(U_).normalized(); pm = pc0 + dd * (d.length * 0.55)
    bc.loft([rg(pc0, U_, V_, 0.030), rg(pm, U_, V_, 0.030)], G_METAL, cap0=G_METAL, cap1=G_METAL); bc.loft([rg(pm - dd * 0.04, U_, V_, 0.016), rg(pe, U_, V_, 0.016)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return [ob, bc.finish('det_brk_cyl_' + ('r' if sx > 0 else 'l'), sharp_deg=45)]


# ── неподвижная штанга дозаправки справа перед козырьком (f1_03, 06, 07, 09): изогнута вверх и вперёд ──
def probe():
    b = B(); x = 0.300; n = 14; X_ = Vector((1, 0, 0))
    z0 = fore_y(2.55, x) - 0.02
    p0 = P3(2.55, x, z0); p1 = P3(1.88, x, 0.98 * KZ); p2 = P3(1.60, x, 0.99 * KZ); p3 = P3(1.40, x, 0.975 * KZ)
    def rg(p, k, rx, ry):
        v_ = k.cross(X_).normalized(); return [p + X_ * rx * math.cos(2 * math.pi * q / n) + v_ * ry * math.sin(2 * math.pi * q / n) for q in range(n)]
    k = (p1 - p0).normalized(); k2 = (p2 - p1).normalized(); kb = (k + k2).normalized()
    b.loft([rg(p0 - k * 0.20, k, 0.060, 0.090), rg(p0 + k * 0.02, k, 0.054, 0.072), rg(p0.lerp(p1, 0.5), k, 0.044, 0.050), rg(p1, kb, 0.038, 0.042), rg(p2, k2, 0.038, 0.040)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    d = (p3 - p2).normalized(); q = lambda s_, r_: rg(p2 + d * s_, d, r_, r_)
    b.loft([q(0.0, 0.040), q(0.05, 0.058), q(0.13, 0.060), q(0.15, 0.044), q(0.19, 0.030), q(0.21, 0.010)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('det_probe', sharp_deg=40)


# ── шасси: размеры (f1_04, 06, 07) ──
GROUND_Y = -1.82 * KZ
NG = dict(a=4.40, hinge=(4.02, -0.430), rw=0.200, ww=0.115, track=0.110)
MG_A, MG_X = 9.25, 1.200                                        # середина пары колёс основной стойки
MAIN_T = (9.55, 0.700, -0.40)                              # шарнир стойки: a, x, y
NOSE_BAY = (3.85, 5.10, 0.260, -0.370)                          # a0, a1, полуширина, потолок
MAIN_BAY = (8.00, 9.70, 0.160, 0.740, -0.080)                  # a0, a1, x0, x1, потолок
MAIN_RET = (8.55, 0.470, -0.300)                                # куда уходит пара колёс при уборке: вперёд и внутрь, в нишу


def main_axis(sx):
    """Ось и угол уборки основной стойки: пара колёс уходит из выпущенного положения в MAIN_RET."""
    T = P3(MAIN_T[0], sx * MAIN_T[1], MAIN_T[2]); wc = P3(MG_A, sx * MG_X, GROUND_Y + 0.290); tgt = P3(MAIN_RET[0], sx * MAIN_RET[1], MAIN_RET[2]) - T; dv = wc - T
    return dv.cross(tgt).normalized(), round(math.degrees(dv.angle(tgt)), 1)


def doors():
    out = []; a0, a1, hw = NOSE_BAY[:3]
    for sx in (1, -1):
        n_ = 'door_n_' + ('r' if sx > 0 else 'l')
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * hw * u), 6, 8, dirn=1, lift=0.004, th=0.016, z0=-3.0)
        pivot = P3((a0 + a1) / 2, sx * hw, down(sx * hw, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z - 0.014); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(-65.0, 0.0) if sx > 0 else (0.0, 65.0), note='0 - закрыта, открытие наружу на 65°')
        out.append(ob)
    a0, a1, x0, x1 = MAIN_BAY[:4]; xm = 0.460
    for sx in (1, -1):
        n_ = 'door_m_' + ('r' if sx > 0 else 'l')
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + (xm - 0.004 - x0) * u)), 8, 10, dirn=1, lift=0.004, th=0.018, z0=-3.0)
        pivot = P3((a0 + a1) / 2, sx * x0, down(sx * x0, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z - 0.014); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(0.0, 55.0) if sx > 0 else (-55.0, 0.0), note='0 - закрыта, ось у внутренней кромки; открывается только на время уборки')
        out.append(ob)
        n_ = 'door_o_' + ('r' if sx > 0 else 'l')
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (xm + 0.004 + (x1 - xm - 0.004) * u)), 8, 10, dirn=1, lift=0.004, th=0.018, z0=-3.0)
        pivot = P3((a0 + a1) / 2, sx * x1, down(sx * x1, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z - 0.012); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(-120.0, 0.0) if sx > 0 else (0.0, 120.0), note='0 - закрыта, ось у внешней кромки; открыта на 120° - наружу и выше ноги стойки')
        out.append(ob)
    return out


def build_skin():
    S = [fore(), cheek(1), cheek(-1), diverter(1), diverter(-1), wing_s(1), wing_s(-1), ventral(1), ventral(-1)]
    host = S[0]
    for o in S[1:]:
        _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        c = duct_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = bore_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = cock_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'F1_skin'; host.data.name = 'F1_skin'
    bvh_ready(host)
    return host


def plane(stage=9, carve=True):
    """Этапы: 1 - обшивка с крыльями; 2 - рули, оперение, сопло, конусы; 3 - кабина, фонарь, плиты, пилоны, тормоза; 4 - шасси и створки."""
    import f1_detail as d
    PARTS.clear(); PYLON_PTS.clear()
    skin = build_skin(); out = [skin]
    ref_me = skin.data.copy(); d.resharp(types.SimpleNamespace(data=ref_me))   # гладкая обшивка до резки
    if stage >= 2:
        out += [fin(), rudder(), stab(1), stab(-1), nozzle(), d.burner(), cone(1), cone(-1)]
        for s, n in ((1, 'r'), (-1, 'l')):
            out += [slat('slat_i_' + n, SLAT_A, s), slat('slat_o_' + n, SLAT_B, s)]
            out += [wing_part('flap_' + n, FLAP, s, HINGE_I, 'закрылок, ось в центре круглого носа; плюс - вниз', (0.0, 35.0))]
            out += [wing_part('aileron_' + n, AIL, s, HINGE_O, 'элерон, ось в центре круглого носа; плюс - вниз', (-25.0, 25.0))]
            out += [tip_rail(s)]
    if stage >= 3:
        out += [d.cockpit_detail()]
        out += canopy() + windscreen()
        out += brake(1) + brake(-1)                               # штанги дозаправки нет: Mark 2026-11-08 попросил убрать
        for sx in (1, -1):
            for tag, x, a0, a1, y0 in PYLON_DEF: out.append(pylon(sx, tag, x, a0, a1, y0))
        flush_points()
        out += [d.details(), d.hinges()] + d.hardpoints() + [d.plates()]
    if stage >= 4:
        out += doors()
        import f1_gear as gr; out += gr.gear_nose() + gr.gear_main(1) + gr.gear_main(-1)
    if carve:
        print('канавок и выемок:', d.carve(skin))
    if stage >= 3: d.bays(skin)
    d.resharp(skin); print('нормали обшивки:', d.smooth_normals(skin, ref_me)); bpy.data.meshes.remove(ref_me)
    return out
