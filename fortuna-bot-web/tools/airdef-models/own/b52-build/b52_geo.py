# b52_geo.py - геометрия Boeing B-52H для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z (в glTF: нос -Z, правое крыло +X, верх +Y).
# a - расстояние от острия носа назад (0 ... 48,78 - конец хвоста); высоты в таблицах - z над землёй (стоянка), в сетку идёт y = z - ZA.
# Длина и размах - по прежней модели игры (48,78 и 55,98 м). Высоты и положения по длине - с вида сбоку b52_07 (20,48 пикс/м, поправка перспективы по двум одинаковым
# гондолам: камера в 109 м от плоскости фюзеляжа), положения вбок - с вида спереди b52_14 (поправка по ширине носа и размаху), план крыла и стабилизатора - выпрямленный
# снимок сверху b52_15 (_rectify.py). Игровая форма - полётная: концы крыла подняты (b52_02, 03). Чужие сетки и текстуры не используются.
import math
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 48.78
ZA = 4.000
G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_DUCT = 0, 1, 2, 3, 4, 5, 11
PARTS = {}; STATIONS = {}; PYLON_PTS = {}


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


def sup(a, cx, top, bot, hw, nt, nb, n, cz_shift=0.0):
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


def strut(b, p0, p1, r, mat=G_METAL, n=12):
    d = (p1 - p0).normalized(); u = d.orthogonal().normalized(); v = d.cross(u)
    rg = lambda c: [c + (u * math.cos(2 * math.pi * q / n) + v * math.sin(2 * math.pi * q / n)) * r for q in range(n)]
    b.loft([rg(p0), rg(p1)], mat, cap0=mat, cap1=mat)


def thk(u):
    return 5 * (0.2969 * math.sqrt(max(u, 0)) - 0.1260 * u - 0.3516 * u ** 2 + 0.2843 * u ** 3 - 0.1015 * u ** 4)


def foil_ring(a_le, chord, tc, u0, u1, nu, place, tail=None, head=None):
    us = [u0 + (u1 - u0) * (1 - math.cos(math.pi * i / (nu - 1))) / 2 for i in range(nu)]
    up = [place(a_le + chord * u, +tc * chord * thk(u)) for u in us]
    lo = [place(a_le + chord * u, -tc * chord * thk(u)) for u in reversed(us)]
    return up + [place(a_, h_) for a_, h_ in (tail or [])] + lo + [place(a_, h_) for a_, h_ in (head or [])]


COVE_K, COVE_R = 7, 0.010
def cove_cut(a_le, chord, tc, a_h, clr=COVE_R):
    uh = (a_h - a_le) / chord; t = tc * chord * thk(uh); rc = t + clr; a_e = a_h - math.sqrt(max(rc * rc - t * t, 1e-9)); te = tc * chord * thk((a_e - a_le) / chord); rc = math.hypot(a_e - a_h, te); al = math.atan2(te, a_e - a_h)
    return (a_e - a_le) / chord, [(a_h + rc * math.cos(al + (2 * math.pi - 2 * al) * (i + 1) / (COVE_K + 1)), rc * math.sin(al + (2 * math.pi - 2 * al) * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_wall(a_le, chord, tc, u1):
    a_ = a_le + chord * u1; t = tc * chord * thk(u1); return [(a_, t * (1 - 2 * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_nose(a_le, chord, tc, a_h):
    t = tc * chord * thk((a_h - a_le) / chord); return [(a_h - t * math.sin(math.pi * (i + 1) / (COVE_K + 1)), -t * math.cos(math.pi * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_wall_f(a_le, chord, tc, u0):
    a_ = a_le + chord * u0; t = tc * chord * thk(u0); return [(a_, t * (-1 + 2 * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]


def _sm(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)


# ── фюзеляж: тупой скруглённый нос, почти прямоугольное сечение со скруглениями, ровный верх, хвост поднимается снизу к концу (b52_07, 10, 14) ──
# (a, верх z, низ z, полуширина, показатель верха, показатель низа)
FUS = [(0.00, 3.700, 3.620, 0.020, 2.0, 2.0), (0.06, 3.880, 3.440, 0.240, 2.0, 2.0), (0.18, 4.040, 3.280, 0.420, 2.0, 2.0), (0.44, 4.250, 3.080, 0.620, 2.1, 2.1),
       (0.95, 4.540, 2.760, 0.870, 2.2, 2.2), (1.42, 4.740, 2.490, 1.020, 2.3, 2.3), (2.39, 5.080, 2.100, 1.200, 2.5, 2.5), (3.37, 5.320, 1.860, 1.320, 2.7, 2.7),
       (4.35, 5.470, 1.760, 1.400, 2.9, 2.9), (5.80, 5.520, 1.710, 1.450, 3.0, 3.0), (30.00, 5.520, 1.710, 1.450, 3.0, 3.0), (33.60, 5.500, 1.820, 1.420, 3.0, 2.9),
       (37.50, 5.460, 2.340, 1.320, 2.9, 2.7), (40.00, 5.420, 2.730, 1.200, 2.8, 2.5), (42.40, 5.360, 3.080, 1.050, 2.6, 2.4), (44.90, 5.270, 3.320, 0.880, 2.4, 2.3),
       (46.80, 5.080, 3.340, 0.800, 3.0, 3.0), (47.40, 5.030, 3.360, 0.660, 2.8, 2.8), (47.80, 4.980, 3.420, 0.480, 2.5, 2.5), (47.98, 4.880, 3.520, 0.330, 2.3, 2.3),
       (48.05, 4.700, 3.700, 0.160, 2.1, 2.1), (48.08, 4.400, 4.000, 0.020, 2.0, 2.0)]     # корпус плавно сужается, из него выходят капли хвоста (b52_09, 10)
WIDEN = 1.30                                                      # Mark 2026-11-11: «корпус должен быть шире» - по b52_16 ширина 3,1-3,5 м
FUS = [(r[0], r[1], r[2], r[3] * WIDEN if r[3] > 0.05 else r[3], r[4], r[5]) for r in FUS]
FT = tracks([(r[0], Z(r[1]), Z(r[2]), r[3], r[4], r[5]) for r in FUS])


def fus_top(a, x):
    top, bot, hw, nt = FT[0](a), FT[1](a), FT[2](a), FT[3](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nt); return cy + ht * q ** (1 / nt)


def fus_bot(a, x):
    top, bot, hw, nb = FT[0](a), FT[1](a), FT[2](a), FT[4](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nb); return cy - ht * q ** (1 / nb)


# хвост (Mark 2026-11-11: «плавно переходит в капли и пузырьки, а не резко обрывается», b52_09, 10): корпус сужается, капли начинаются внутри и выходят из него
# капля: (центр z, полуширина, полувысота, a начала внутри корпуса, a начала скругления, a конца)
LOBES = [(4.680, 0.50, 0.34, 46.60, 48.10, 48.78), (4.200, 0.40, 0.25, 46.80, 47.95, 48.56), (3.720, 0.55, 0.40, 46.60, 47.70, 48.32), (3.330, 0.20, 0.15, 47.20, 48.00, 48.47)]


def lobe(cz, w, h, a0, am, ae, n=40):
    rs = []
    for a in [a0] + stations(a0 + 0.2, am, 0.15) + [am + (ae - am) * math.sin(math.pi / 2 * i / 12) for i in range(1, 13)]:
        f = 1.0 if a <= am else math.sqrt(max(0.0, 1 - ((a - am) / (ae - am)) ** 2)); f = max(f, 0.012)
        f0 = _sm((a - a0) / 0.5) * 0.25 + 0.75                                              # начало внутри корпуса чуть уже
        rs.append([P3(a, w * f * f0 * math.sin(2 * math.pi * q / n), Z(cz) - h * f * f0 * math.cos(2 * math.pi * q / n)) for q in range(n)])
    return loft_obj('s_lobe', rs, sharp=60)


def fuselage():
    st = [0.0, 0.02, 0.06, 0.11, 0.18, 0.28, 0.44, 0.65, 0.95, 1.20, 1.42, 1.75, 2.05, 2.39, 2.85, 3.37, 3.85, 4.35, 5.05, 5.80] + stations(6.3, 46.6, 0.35) + stations(46.8, 47.9, 0.10) + [47.95, 48.00, 48.03, 48.05, 48.065, 48.075, 48.08]
    return loft_obj('s_fus', [sup(a, 0.0, *[t(a) for t in FT], 96) for a in sorted(set(round(v, 4) for v in st))])


# ── крыло: высокое, стреловидное, тонкое; в полёте концы подняты (b52_02, 03, 11) ──
XTIP = 27.99
def LE(x): return 11.50 + 0.780 * (x - 1.45)
def TE(x): return 20.95 + 0.529 * x                               # по наложению на b52_15: на 0,65 м вперёд
def CH(x): return TE(x) - LE(x)
def TC(x): return 0.120 - 0.030 * min(1.0, x / XTIP)
FLEX = 1.30                                                       # подъём конца крыла в полёте, м
def wz(x): return Z(5.000) + FLEX * x / XTIP                      # плоскость хорд: прямое поперечное V 2,7° (изгиб дугой давал провис оси закрылков)


def wing_up(x, a):
    c = CH(x); u = (a - LE(x)) / c; return wz(x) + TC(x) * c * thk(max(0.0, min(1.0, u)))


def wing_bot(x, a):
    c = CH(x); u = (a - LE(x)) / c; return wz(x) - TC(x) * c * thk(max(0.0, min(1.0, u)))


FLAPS = [(2.06, 10.15), (11.85, 19.20)]                           # внутренний от шарнира крыла                           # закрылки: внутренний и внешний, x от-до (b52_14: на земле опущены)
def FC(x): return 0.24 * CH(x)
def FHINGE(x): return TE(x) - FC(x)


def _wsec(sx, x, place=None):
    c = CH(x); tc = TC(x); le = LE(x); us = 0.0006
    place = place or (lambda a, h: P3(a, sx * x, wz(x) + h))
    for e0, e1 in FLAPS:
        if e0 - 1e-6 <= x <= e1 + 1e-6:
            ue, tail = cove_cut(le, c, tc, FHINGE(x)); break
    else:
        ue = 1.0; tail = cove_wall(le, c, tc, 1.0)
    return foil_ring(le, c, tc, us, ue, 34, place, tail=tail, head=cove_wall_f(le, c, tc, us))


def flap(sx, i):
    x0, x1 = FLAPS[i]; x0 += 0.016; x1 -= 0.016; name = f'flap{i + 1}_' + ('r' if sx > 0 else 'l')
    pv0 = P3(FHINGE(x0), sx * x0, wz(x0)); pv1 = P3(FHINGE(x1), sx * x1, wz(x1)); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    for j in range(13):
        x = x0 + (x1 - x0) * j / 12; c = CH(x); ah = FHINGE(x)
        rings.append([v - pivot for v in foil_ring(LE(x), c, TC(x), (ah - LE(x)) / c, 1.0, 12, lambda a, h, x=x: P3(a, sx * x, wz(x) + h), head=cove_nose(LE(x), c, TC(x), ah))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((0.0, -0.970, -0.243)), range=(0.0, 0.90), kind='slide', note='закрылок выдвижной (Fowler): сдвиг назад и чуть вниз по направляющим, метры вдоль axis_gltf; торцы остаются в своих плоскостях, щель у носа открывается как настоящая. Ось hinge_gltf - поворот, если игре нужен угол (тогда не больше 8°)')
    PARTS[name]['hinge_axis'] = axis.copy()
    return ob


JOINTS = (2.00,)                                                   # шарнир крыла у борта (Mark 2026-11-11: «крыло остаётся ровным и просто меняется угол»)
DROOP = (-8.5,)                                               # углы на стоянке, градусы: средняя часть от корня, внешняя ещё от средней
def wing_s(sx, x0=0.0, x1=XTIP, name=None):
    k = []
    for e0, e1 in FLAPS: k += [e0 - 0.003, e0, e1, e1 + 0.003] + [e0 + (e1 - e0) * i / 12 for i in range(1, 12)]
    xs = sorted(set([round(v, 4) for v in [0.0, 0.6, 1.2] + stations(1.45, XTIP - 0.40, 0.45) + k + list(JOINTS) + [XTIP - 0.25, XTIP - 0.14, XTIP - 0.07, XTIP - 0.03, XTIP]]))
    xs = [x for x in xs if x0 - 1e-6 <= x <= x1 + 1e-6]
    rings = []
    for x in xs:
        if x <= XTIP - 0.40: rings.append(_wsec(sx, x)); continue
        k = (x - (XTIP - 0.40)) / 0.40; sh = math.sqrt(max(0.0, 1 - k * k))             # скруглённая законцовка: толщина сходит к нулю
        rings.append(_wsec(sx, x, lambda a, h, x=x: P3(a, sx * x, wz(x) + h * max(0.03, sh))))
    return loft_obj(name or ('s_wing_' + ('r' if sx > 0 else 'l')), rings, sharp=50)


def joint_axis(sx, xj):
    """Шарнир изгиба по верхней поверхности в сечении xj: при опускании верх остаётся сомкнутым, низ уходит внутрь крыла."""
    c = CH(xj); zt = wz(xj) + 0.5 * TC(xj) * c * thk(0.30)
    p0 = P3(LE(xj) + 0.05 * c, sx * xj, zt); p1 = P3(TE(xj) - 0.05 * c, sx * xj, zt)
    ax = (p1 - p0).normalized() * sx                               # от передней кромки к задней у правого: плюс - конец вверх, минус - вниз
    return (p0 + p1) / 2, ax


def wing_panels(sx):
    s = 'r' if sx > 0 else 'l'; nm = 'wing_' + s
    ob = wing_s(sx, JOINTS[0], XTIP, nm); piv, ax = joint_axis(sx, JOINTS[0]); _rel(ob, piv)
    PARTS[nm] = dict(pivot=piv.copy(), axis=ax.copy(), range=(DROOP[0], 0.0), ground=DROOP[0],
                     note=f'крыло целиком (прямое): шарнир по верхней поверхности у борта, x {JOINTS[0]} м; 0 - полёт (поперечное V 2,7°, концы подняты), на стоянке {DROOP[0]}° - всё крыло ровно опущено; гондолы, баки, пилоны, закрылки, интерцепторы - дочерние')
    return ob


# ── стабилизатор: низко на хвостовом конусе, стреловидный (b52_07, 09, 15) ──
SZ = 4.350
STAB_X1 = 8.40
def SLE(x): return 36.80 + (42.60 - 36.80) * x / STAB_X1         # b52_09: задняя кромка у корня почти на линии задней кромки киля, b52_15: почти прямая
def STE(x): return 44.60 + (45.30 - 44.60) * x / STAB_X1
ELEV_X = (1.60, STAB_X1 - 0.30)                                    # руль высоты по размаху
def EH(x): return STE(x) - 0.30 * (STE(x) - SLE(x))              # ось руля высоты
STAB_PIV_A = 42.40                                                # ось перестановки стабилизатора (поперёк, у заднего лонжерона)
def stab(sx):
    xs = sorted(set([0.0] + stations(0.4, STAB_X1 - 0.20, 0.40) + [ELEV_X[0] - 0.003, ELEV_X[0], ELEV_X[1], ELEV_X[1] + 0.003] + [ELEV_X[0] + (ELEV_X[1] - ELEV_X[0]) * i / 10 for i in range(1, 10)] + [STAB_X1 - 0.10, STAB_X1 - 0.04, STAB_X1]))
    rings = []; tc = 0.090
    for x in xs:
        c = STE(x) - SLE(x); le = SLE(x); k = max(0.0, (x - (STAB_X1 - 0.20)) / 0.20); sh = max(0.03, math.sqrt(max(0.0, 1 - k * k)))
        if ELEV_X[0] - 1e-6 <= x <= ELEV_X[1] + 1e-6: ue, tail = cove_cut(le, c, tc, EH(x))
        else: ue, tail = 1.0, cove_wall(le, c, tc, 1.0)
        rings.append(foil_ring(le, c, tc, 0.0006, ue, 24, lambda a, h, x=x, sh=sh: P3(a, sx * x, Z(SZ) + h * sh), tail=tail, head=cove_wall_f(le, c, tc, 0.0006)))
    name = 'stab_' + ('r' if sx > 0 else 'l'); ob = loft_obj(name, rings, sharp=50)
    piv = P3(STAB_PIV_A, 0.0, Z(SZ)); _rel(ob, piv)
    # руль высоты: дочерний, своя ось
    x0, x1 = ELEV_X[0] + 0.014, ELEV_X[1] - 0.014; pv0 = P3(EH(x0), sx * x0, Z(SZ)); pv1 = P3(EH(x1), sx * x1, Z(SZ)); pe = (pv0 + pv1) / 2; ax = (pv1 - pv0).normalized()
    if ax.x < 0: ax = -ax
    rr = []
    for j in range(9):
        x = x0 + (x1 - x0) * j / 8; c = STE(x) - SLE(x); ah = EH(x)
        rr.append([v - pe for v in foil_ring(SLE(x), c, tc, (ah - SLE(x)) / c, 1.0, 10, lambda a, h, x=x: P3(a, sx * x, Z(SZ) + h), head=cove_nose(SLE(x), c, tc, ah))])
    en = 'elev_' + ('r' if sx > 0 else 'l'); el = loft_obj(en, rr, sharp=48); el.location = pe
    PARTS[en] = dict(pivot=pe.copy(), axis=ax.copy(), range=(-13.0, 13.0), note='руль высоты: ось в центре круглого носа, дочерний к stab_*; плюс - задняя кромка вниз')
    return [ob, el]


# ── киль: высокий, руль направления узкой полосой по задней кромке (b52_07, 09) ──
FZ0, FZ1 = 5.000, 12.060
def FLE(z): return 37.50 + (43.20 - 37.50) * (z - 5.40) / (FZ1 - 5.40)
def FTE(z): return 44.90 + (46.00 - 44.90) * (z - 5.40) / (FZ1 - 5.40)
RUD = (5.90, 11.80); RUD_C = 0.95                                 # руль направления: узкая полоса по задней кромке (b52_09)
def FTC(z): return 0.085 - 0.015 * (z - FZ0) / (FZ1 - FZ0)
def fin():
    zs = sorted(set(stations(FZ0, FZ1 - 0.10, 0.35) + [RUD[0] - 0.003, RUD[0], RUD[1], RUD[1] + 0.003] + [RUD[0] + (RUD[1] - RUD[0]) * i / 12 for i in range(1, 12)] + [FZ1 - 0.05, FZ1]))
    rings = []
    for z in zs:
        le, te = FLE(z), FTE(z); c = te - le; tc = FTC(z)
        if RUD[0] - 1e-6 <= z <= RUD[1] + 1e-6: ue, tail = cove_cut(le, c, tc, te - RUD_C, 0.008)
        else: ue, tail = 1.0, cove_wall(le, c, tc, 1.0)
        rings.append(foil_ring(le, c, tc, 0.0006, ue, 26, lambda a, h, z=z: P3(a, h, Z(z)), tail=tail, head=cove_wall_f(le, c, tc, 0.0006)))
    return loft_obj('fin_c', rings, sharp=50)


def rudder():
    z0, z1 = RUD[0] + 0.006, RUD[1] - 0.006; pv0 = P3(FTE(z0) - RUD_C, 0.0, Z(z0)); pv1 = P3(FTE(z1) - RUD_C, 0.0, Z(z1)); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    rings = []
    for j in range(13):
        z = z0 + (z1 - z0) * j / 12; le, te = FLE(z), FTE(z); c = te - le; ah = te - RUD_C
        rings.append([v - pivot for v in foil_ring(le, c, FTC(z), (ah - le) / c, 1.0, 10, lambda a, h, z=z: P3(a, h, Z(z)), head=cove_nose(le, c, FTC(z), ah))])
    ob = loft_obj('rudder', rings, sharp=48); ob.location = pivot
    PARTS['rudder'] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-22.0, 22.0), note='руль направления: ось в центре круглого носа, снизу вверх')
    return ob


# ── гондолы: четыре сдвоенные на пилонах впереди крыла; кок, кольцо выхода вентилятора, сопло (b52_06, 07, 13, 14) ──
PODS = (11.00, 19.00)                                             # x середины гондолы
POD_DX = 0.700                                                    # полурасстояние осей двух двигателей
POD_LEN = 5.50
def pod_front(xc): return LE(xc) - 3.60 + 0.15 * (xc - 11.0) / 8.0
def pod_z(xc): return wz(xc) - 1.38
# профиль одного двигателя: (s от губы, r)
NAC = [(0.00, 0.640), (0.06, 0.680), (0.20, 0.705), (0.60, 0.720), (1.40, 0.720), (2.10, 0.708), (2.32, 0.698), (2.34, 0.600), (2.60, 0.588),
       (3.60, 0.560), (4.40, 0.505), (4.95, 0.450), (5.20, 0.425), (POD_LEN, 0.405)]
def nacelle(xc, sx, k):
    ax_ = sx * xc + POD_DX * k; a0 = pod_front(xc); zc = pod_z(xc); n = 48
    rr = Track(NAC); ss = sorted(set([p[0] for p in NAC] + stations(0.0, POD_LEN, 0.25)))
    return loft_obj('s_nac', [[P3(a0 + s, ax_ + rr(s) * math.sin(2 * math.pi * q / n), zc - rr(s) * math.cos(2 * math.pi * q / n)) for q in range(n)] for s in ss], sharp=40)


def pod_web(xc, sx):
    """Перемычка между двумя двигателями (сверху и снизу), чтобы пара читалась одной гондолой (b52_14)."""
    a0 = pod_front(xc); zc = pod_z(xc); rs = []
    for s in stations(0.35, 4.6, 0.3):
        hz = 0.42 - 0.10 * max(0.0, (s - 2.4) / 2.2); w = POD_DX
        rs.append([P3(a0 + s, sx * xc + q[0], zc + q[1]) for q in ((-w, -hz * 0.7), (w, -hz * 0.7), (w, hz), (-w, hz))])
    return loft_obj('s_web', rs, sharp=30)


def pod_pylon(xc, sx):
    """Пилон гондолы: тонкий профиль от верха гондолы к нижней поверхности крыла, передняя кромка наклонена назад (b52_07, 14)."""
    a0 = pod_front(xc); zc = pod_z(xc); ztop_pod = zc + 0.50; rs = []
    for i in range(9):
        t = i / 8; zz = ztop_pod + t * (wing_bot(xc, LE(xc) + 1.0) + 0.25 - ztop_pod)
        af = a0 + 0.80 + t * (LE(xc) + 0.10 - (a0 + 0.80)); ab = a0 + 4.30 + t * (LE(xc) + 2.80 - (a0 + 4.30)); c = ab - af
        rs.append(foil_ring(af, c, 0.32 / c, 0.001, 1.0, 16, lambda a, h, zz=zz: P3(a, sx * xc + h, zz), tail=cove_wall(af, c, 0.32 / c, 1.0), head=cove_wall_f(af, c, 0.32 / c, 0.001)))
    return loft_obj('s_pyl', rs, sharp=40)


# ── баки под концами крыла на коротком пилоне (b52_04, 07, 14) ──
TANK_X, TANK_LEN, TANK_R = 23.80, 3.80, 0.380
def tank_front(): return LE(TANK_X) - 1.00
def tank_z(): return wz(TANK_X) - 0.95
def tank(sx):
    a0 = tank_front(); zc = tank_z(); n = 32
    rr = Track([(0.0, 0.0), (0.04, 0.10), (0.20, 0.22), (0.55, 0.33), (1.10, TANK_R), (2.60, TANK_R), (3.20, 0.30), (3.62, 0.15), (3.76, 0.05), (TANK_LEN, 0.0)])
    ss = [0.0, 0.01, 0.04, 0.09, 0.15, 0.22, 0.32, 0.45, 0.60, 0.80, 1.10] + stations(1.35, 3.3, 0.25) + [3.45, 3.58, 3.68, 3.74, 3.77, TANK_LEN]
    rs = [[P3(a0 + s, sx * TANK_X + max(rr(s), 0.004) * math.sin(2 * math.pi * q / n), zc - max(rr(s), 0.004) * math.cos(2 * math.pi * q / n)) for q in range(n)] for s in ss]
    o = loft_obj('s_tank', rs, sharp=50)
    b = B(); rs2 = []
    for i in range(5):
        t = i / 4; zz = zc + 0.30 + t * (wing_bot(TANK_X, LE(TANK_X) + 1.2) + 0.15 - zc - 0.30)
        af = a0 + 1.0 + t * (LE(TANK_X) + 0.15 - a0 - 1.0); c = 1.7 - 0.2 * t
        rs2.append(foil_ring(af, c, 0.10, 0.001, 1.0, 14, lambda a, h, zz=zz: P3(a, sx * TANK_X + h, zz), tail=cove_wall(af, c, 0.10, 1.0), head=cove_wall_f(af, c, 0.10, 0.001)))
    py = loft_obj('s_tpyl', rs2, sharp=40)
    return [o, py]


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


def _rel(ob, pivot):
    for v in ob.data.vertices: v.co -= pivot
    ob.location = pivot
    return ob


# ── воздухозаборники и сопла: канал с коком и тёмным вентилятором, сзади срез внутреннего контура (b52_06, 13, 14, 11) ──
def intake_cut(xc, sx, k):
    ax_ = sx * xc + POD_DX * k; a0 = pod_front(xc); zc = pod_z(xc); n = 48
    prof = [(-0.20, 0.585, G_DUCT), (0.02, 0.585, G_DUCT), (0.40, 0.575, G_DUCT), (0.95, 0.560, G_DARK), (1.00, 0.30, G_DARK), (1.02, 0.02, G_DARK)]
    ring = lambda s_, r: [P3(a0 + s_, ax_ + r * math.sin(2 * math.pi * q / n), zc - r * math.cos(2 * math.pi * q / n)) for q in range(n)]
    b = B(); b.loft([ring(s_, r) for s_, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_DUCT, cap1=G_DARK); return b.finish('c_inl', sharp_deg=30)


def spinner(xc, sx, k):
    ax_ = sx * xc + POD_DX * k; a0 = pod_front(xc); zc = pod_z(xc); n = 32
    pr = [(0.42, 0.0), (0.44, 0.06), (0.52, 0.13), (0.66, 0.19), (0.84, 0.225), (1.02, 0.235)]
    return loft_obj('s_spin', [[P3(a0 + s_, ax_ + max(r, 0.003) * math.sin(2 * math.pi * q / n), zc - max(r, 0.003) * math.cos(2 * math.pi * q / n)) for q in range(n)] for s_, r in pr], mat=G_METAL, sharp=60)


def nozzle_cut(xc, sx, k):
    ax_ = sx * xc + POD_DX * k; a0 = pod_front(xc) + POD_LEN; zc = pod_z(xc); n = 48
    prof = [(0.20, 0.355, G_METAL), (-0.10, 0.355, G_METAL), (-0.45, 0.33, G_DARK), (-0.75, 0.20, G_DARK), (-0.78, 0.02, G_DARK)]
    ring = lambda s_, r: [P3(a0 + s_, ax_ + r * math.sin(2 * math.pi * q / n), zc - r * math.cos(2 * math.pi * q / n)) for q in range(n)]
    b = B(); b.loft([ring(s_, r) for s_, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK); return b.finish('c_noz', sharp_deg=30)


def exhaust_cone(xc, sx, k):
    """Конус выхода горячего контура в глубине сопла (TF33): основание в стенке дна, острие у среза."""
    ax_ = sx * xc + POD_DX * k; a0 = pod_front(xc) + POD_LEN; zc = pod_z(xc); n = 32
    pr = [(-0.84, 0.165), (-0.62, 0.165), (-0.40, 0.135), (-0.20, 0.085), (-0.06, 0.030), (0.00, 0.004)]
    return loft_obj('s_cone', [[P3(a0 + s_, ax_ + r * math.sin(2 * math.pi * q / n), zc - r * math.cos(2 * math.pi * q / n)) for q in range(n)] for s_, r in pr], mat=G_METAL, sharp=60)


def fan_ring_cut(xc, sx, k):
    """Кольцевой срез вентиляторного контура на ступеньке кожуха: неглубокая тёмная канавка (b52_07: тёмное кольцо посередине гондолы)."""
    ax_ = sx * xc + POD_DX * k; a0 = pod_front(xc) + 2.33; zc = pod_z(xc); n = 48
    rg = lambda s_, r: [P3(a0 + s_, ax_ + r * math.sin(2 * math.pi * q / n), zc - r * math.cos(2 * math.pi * q / n)) for q in range(n)]
    b = B(); b.loft([rg(-0.40, 0.69), rg(0.06, 0.69), rg(0.06, 0.61), rg(-0.40, 0.61), rg(-0.40, 0.69)], G_DARK); return b.finish('c_fan', sharp_deg=30)


# ── нос: два блистера обзорной системы под носом (b52_05, 06), обтекатели на хвосте (b52_10) ──
def ellipsoid(name, c, rx, ry, rz, n=32, m=16, mat=G_SKIN):
    rs = []
    for i in range(m + 1):
        t = -math.pi / 2 + math.pi * i / m; ca, sa = math.cos(t), math.sin(t)
        rs.append([c + Vector((rx * ca * math.sin(2 * math.pi * q / n), ry * sa, -rz * ca * math.cos(2 * math.pi * q / n))) for q in range(n)])
    rs[0] = [c + Vector((0, -ry, 0))] * n; rs[-1] = [c + Vector((0, ry, 0))] * n
    rs = [r if i in (0, m) else r for i, r in enumerate(rs)]
    return loft_obj(name, rs[1:-1], mat=mat, sharp=60)


def blisters():
    out = []
    for sx in (1, -1):
        out.append(ellipsoid('s_evs', P3(3.95, sx * 0.80, Z(2.05)), 0.38, 1.05, 0.32))
    return out


def tail_bumps():
    """Хвостовая установка без пушки (b52_10): большой купол сверху на конце, круглый обтекатель снизу, боковые наплывы."""
    # b52_09: на тупом торце столбиком - верхний и второй обтекатели (вытянуты назад), купол установки с кольцом посередине, маленький нижний обтекатель; на борту овальный наплыв
    out = [lobe(*L_) for L_ in LOBES]
    for sx in (1, -1): out.append(ellipsoid('s_tside', P3(46.90, sx * 0.98, Z(4.25)), 0.16, 0.55, 0.13))
    n = 48; rs = []                                                                  # кольцо установки (b52_09: рифлёное кольцо вокруг купола), пушки нет
    for da, r in ((-0.06, 0.92), (0.0, 1.0), (0.07, 1.02), (0.12, 0.97), (0.14, 0.86)):         # эллиптическое кольцо у основания купола установки
        rs.append([P3(48.02 + da, 0.47 * r * math.sin(2 * math.pi * q / n), Z(3.72) - 0.35 * r * math.cos(2 * math.pi * q / n)) for q in range(n)])
    out.append(loft_obj('s_tring', rs, sharp=40))
    return out


# ── бомбоотсек: под центропланом между передними и задними тележками; GBU-31 ×8 в один ряд по высоте, четыре поперёк, две вдоль ──
BAY = dict(a0=17.40, a1=26.80, x=1.50, top=3.50)
BOMB_X = (0.33, 0.92)                                             # внутренний и наружный ряд
BOMB_A = {0.33: (19.55, 24.15), 0.92: (20.25, 24.85)}             # внутренние и наружные сдвинуты по длине: хвостовое оперение не на одной линии
BOMB_R, RACK_Z = 0.228, 2.850
BOMB_Z = RACK_Z - 0.05 - BOMB_R


def bay_cut():
    a0, a1, x = BAY['a0'], BAY['a1'], BAY['x']; z1 = Z(BAY['top']); z0 = Z(0.5)
    rs = [[P3(a, -x, z0), P3(a, x, z0), P3(a, x, z1), P3(a, -x, z1)] for a in (a0, a1)]
    return loft_obj('c_bay', rs, G_COCK, sharp=30)


def bay_inner():
    """Нутро: шпангоуты по стенкам и потолку, четыре продольные балки с замками, раскосы (G_COCK стенки, G_METAL балки и замки)."""
    b = B(); a0, a1, x = BAY['a0'], BAY['a1'], BAY['x']; top = Z(BAY['top'])
    def bx(c, hx, hy, hz, mat=G_COCK):
        rg = lambda y: [c + Vector((-hx, y, -hz)), c + Vector((hx, y, -hz)), c + Vector((hx, y, hz)), c + Vector((-hx, y, hz))]
        b.loft([rg(-hy), rg(hy)], mat, cap0=mat, cap1=mat)
    for a_ in stations(a0 + 0.25, a1 - 0.25, 0.62):                                 # шпангоуты: по стенкам и поперёк потолка
        for sx in (1, -1):
            zb = fus_bot(a_, x - 0.02) + 0.17
            bx(P3(a_, sx * (x - 0.03), (zb + top) / 2), 0.03, 0.035, (top - zb) / 2)
        bx(P3(a_, 0.0, top - 0.03), x - 0.02, 0.035, 0.03)
    for xb in BOMB_X:
        for sx in (1, -1):
            xx = sx * xb; aa = BOMB_A[xb]
            bx(P3((a0 + a1) / 2, xx, Z(RACK_Z) + 0.17), 0.05, (a1 - a0) / 2 - 0.30, 0.06, G_METAL)          # продольная балка
            bx(P3((a0 + a1) / 2, xx, (Z(RACK_Z) + 0.23 + top) / 2), 0.025, (a1 - a0) / 2 - 0.40, (top - Z(RACK_Z) - 0.23) / 2, G_COCK)   # стенка до потолка
            for ac in aa:
                for da in (-0.36, 0.36):                                         # замки 30-дюймовой пары (проушины бомбы)
                    bx(P3(ac + da, xx, Z(RACK_Z) + 0.06), 0.035, 0.05, 0.06, G_METAL)
                for da in (-0.60, 0.60):                                         # упоры-раскосы
                    strut(b, P3(ac + da, xx, Z(RACK_Z) + 0.11), P3(ac + da * 1.15, xx + 0.17 * (1 if xb > 0.5 else -1) * sx * 0 + 0.13 * (1 if da > 0 else -1) * 0, Z(RACK_Z) - 0.01), 0.016, G_METAL, 8)
    return b.finish('det_bay', sharp_deg=30)


def stations_fill():
    # порядок для mirror(): индекс 3 заполняется первым - внутренний ряд спереди, потом внутренний сзади, наружный спереди, наружный сзади
    order = ((BOMB_X[1], 1), (BOMB_X[1], 0), (BOMB_X[0], 1), (BOMB_X[0], 0))
    for i, (xb, k) in enumerate(order):
        for sg, n in ((1, 'r'), (-1, 'l')):
            STATIONS['st%d_%s' % (i, n)] = P3(BOMB_A[xb][k], sg * xb, Z(RACK_Z))


BVH = {}
def bvh_ready(host, extra=()):
    V = []; F = []
    for o in (host,) + tuple(extra):
        M = o.matrix_world; b0 = len(V); V += [M @ v.co for v in o.data.vertices]; F += [tuple(b0 + i for i in p.vertices) for p in o.data.polygons]
    BVH['t'] = BVHTree.FromPolygons(V, F); BVH['host'] = host


def ray(o, d):
    h = BVH['t'].ray_cast(o, d); return h[0]


def down(x, y_world, z0=12.0, dirn=-1):
    return ray(Vector((x, y_world, z0)), Vector((0, 0, dirn)))


def patch(name, outline, nu, nv, dirn=-1, lift=0.006, th=0.018, mat=G_SKIN, z0=12.0, cast=None):
    """Плита по обшивке: outline(u, v) -> (a, x) для вертикальных лучей или cast(u, v) -> (точка снаружи, направление). Начало - в нуле мира."""
    grid = []
    for j in range(nv + 1):
        row = []
        for i in range(nu + 1):
            if cast: o_, d_ = cast(i / nu, j / nv); h = ray(o_, d_); nrm = -d_
            else: a, x = outline(i / nu, j / nv); h = down(x, Yb(a), z0=z0, dirn=dirn); nrm = Vector((0, 0, -dirn))
            if h is None: print('ЛУЧ МИМО', name, i, j); h = Vector((0, 0, 0))
            row.append((h + nrm * lift, nrm))
        grid.append(row)
    b = B(); bm = b.bm
    tv = [[bm.verts.new(p + n_ * th * 0.7) for p, n_ in row] for row in grid]; lv = [[bm.verts.new(p - n_ * th * 0.3) for p, n_ in row] for row in grid]
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


def bay_doors():
    out = []; a0, a1, x = BAY['a0'], BAY['a1'], BAY['x']
    for sx in (1, -1):
        name = 'bay_' + ('r' if sx > 0 else 'l')
        ob = patch(name, lambda u, v: (a0 + 0.012 + (a1 - a0 - 0.024) * v, sx * (0.008 + (x - 0.014) * u)), 12, 30, dirn=1, lift=0.0, th=0.040, z0=-8.0)
        e0 = down(sx * x, Yb(a0 + 0.02), z0=-8.0, dirn=1); e1 = down(sx * x, Yb(a1 - 0.02), z0=-8.0, dirn=1)
        hax = (e1 - e0).normalized() * sx; dd = (e1 - e0).normalized(); sag = 0.0
        for a_ in stations(a0 + 0.02, a1 - 0.02, 0.25):
            p_ = down(sx * x, Yb(a_), z0=-8.0, dirn=1); q_ = e0 + dd * (p_ - e0).dot(dd); sag = min(sag, p_.z - q_.z)
        pivot = (e0 + e1) / 2 + Vector((sx * 0.060, 0, sag - 0.120)); _rel(ob, pivot)   # петля снаружи и ниже кромки: у скругления борта створка уходит от обшивки
        bb = B()
        for a_ in stations(a0 + 0.35, a1 - 0.35, 0.94):                             # рёбра жёсткости изнутри створки
            yb = down(sx * 0.6, Yb(a_), z0=-8.0, dirn=1).z + 0.04
            bb.loft([[P3(a_ - 0.02, sx * 0.05, yb) - pivot, P3(a_ - 0.02, sx * (x - 0.42), yb) - pivot, P3(a_ - 0.02, sx * (x - 0.42), yb + 0.06) - pivot, P3(a_ - 0.02, sx * 0.05, yb + 0.06) - pivot],
                     [P3(a_ + 0.02, sx * 0.05, yb) - pivot, P3(a_ + 0.02, sx * (x - 0.42), yb) - pivot, P3(a_ + 0.02, sx * (x - 0.42), yb + 0.06) - pivot, P3(a_ + 0.02, sx * 0.05, yb + 0.06) - pivot]], G_COCK, cap0=G_COCK, cap1=G_COCK)
        rib = bb.finish(name + '_ribs', sharp_deg=30); rib.parent = ob; rib.location = (0, 0, 0)
        PARTS[name] = dict(pivot=pivot.copy(), axis=hax.copy(), range=(0.0, 95.0), note='створка отсека: шарнир у наружной кромки, ось вдоль кромки; плюс - внутренняя кромка вниз и в сторону; рёбра ' + name + '_ribs - дочерний объект')
        out += [ob, rib]
    return out


# ── пилоны под крылом между фюзеляжем и внутренней гондолой с балкой-адаптером на две подвески (b52_05, 06, 13) ──
WPY_X = 5.60
def weapon_pylons():
    out = []
    for sx in (1, -1):
        s = 'r' if sx > 0 else 'l'; x = WPY_X; le = LE(x); zb = wing_bot(x, le + 1.4)
        b = B(); rs = []
        zlow = zb + 0.12 - 0.78
        for i in range(7):
            t = i / 6
            af = le + 0.03 - 1.30 * t; c = 3.00 + 0.55 * t                         # наверху от передней кромки крыла, книзу вынос вперёд (b52_05)
            zf = lambda a, t=t: (1 - t) * (wing_bot(x, min(a, TE(x) - 0.2)) + 0.06) + t * zlow       # верх кольца повторяет низ крыла
            rs.append(foil_ring(af, c, 0.30 / c, 0.001, 1.0, 16, lambda a, h, zf=zf: P3(a, sx * x + h, zf(a)), tail=cove_wall(af, c, 0.30 / c, 1.0), head=cove_wall_f(af, c, 0.30 / c, 0.001)))
        b.loft(rs, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
        ob = b.finish('pylon_' + s, sharp_deg=40)
        # балка-адаптер: продольный двутавр, поперечины с двумя замками (внутренний и наружный)
        zbeam = zb + 0.12 - 0.78 - 0.10; ac = le + 0.45; b2 = B()
        def bx(c, hx, hy, hz, mat=G_METAL):
            rg = lambda y: [c + Vector((-hx, y, -hz)), c + Vector((hx, y, -hz)), c + Vector((hx, y, hz)), c + Vector((-hx, y, hz))]
            b2.loft([rg(-hy), rg(hy)], mat, cap0=mat, cap1=mat)
        bx(P3(ac, sx * x, zbeam), 0.11, 2.70, 0.10, G_SKIN)
        for da in (-1.55, 1.55):
            bx(P3(ac + da, sx * x, zbeam - 0.08), 0.60, 0.16, 0.06, G_SKIN)
            for d in (-0.50, 0.50):
                bx(P3(ac + da, sx * x + d, zbeam - 0.17), 0.05, 0.07, 0.05)
        rk = b2.finish('rack_' + s, sharp_deg=40)
        for d in (-0.50, 0.50):
            PYLON_PTS[s + ('o' if d * sx > 0 else 'i')] = P3(ac, sx * x + d, zbeam - 0.22)
        out += [ob, rk]
    return out


# ── интерцепторы по верху крыла: 7 секций на крыло перед закрылками, крен ими (b52_02, 16) ──
SPOIL = [(5.00, 6.90), (7.00, 8.90), (9.00, 10.05), (12.00, 13.70), (13.80, 15.50), (15.60, 17.30), (17.40, 19.10)]
def spoilers():
    out = []
    for sx in (1, -1):
        for i, (x0, x1) in enumerate(SPOIL):
            name = f'spoil{i + 1}_' + ('r' if sx > 0 else 'l')
            fa = lambda x: FHINGE(x) - 1.20
            ob = patch(name, lambda u, v: (fa(x0 + (x1 - x0) * u) + 0.95 * v, sx * (x0 + (x1 - x0) * u)), 8, 4, dirn=-1, lift=0.006, th=0.014)
            p0 = down(sx * x0, Yb(fa(x0)) - 0.0, dirn=-1); p1 = down(sx * x1, Yb(fa(x1)), dirn=-1)
            ax = (p1 - p0).normalized()
            if ax.x < 0: ax = -ax
            pivot = (p0 + p1) / 2 + Vector((0, 0, 0.0018)); _rel(ob, pivot)
            PARTS[name] = dict(pivot=pivot.copy(), axis=-ax if sx > 0 else -ax, range=(0.0, 60.0), note='интерцептор: ось у передней кромки; плюс - задняя кромка вверх')
            out.append(ob)
    return out


# ── окна кабины: стёкла плитами по обшивке, лучи от оси сечения наружу (b52_05, 06, 13) ──
WIN = [(2.64, 3.12, 3.5, 17.0), (3.32, 3.64, 5.0, 15.5), (2.72, 3.22, 20.5, 36.0), (2.86, 3.42, 39.5, 54.0), (3.62, 4.18, 57.5, 69.0), (4.36, 4.92, 57.5, 69.0)]   # мелкие стёкла с широкими рамами (b52_05, 06)
def _win_cast(a0, a1, f0, f1, sx):
    def cast(u, v):
        a = a0 + (a1 - a0) * v; ph = math.radians(f0 + (f1 - f0) * u); cy = (FT[0](a) + FT[1](a)) / 2
        d = Vector((sx * math.sin(ph), 0.0, math.cos(ph))); c = Vector((0.0, Yb(a), cy)); return c + d * 6.0, -d
    return cast


CAB = (1.85, 6.60, 3.55)                                           # полость кабины: a от-до, пол (z над землёй)
def cock_cavity():
    rs = []
    for a in stations(CAB[0], CAB[1], 0.20):
        top, bot, hw, nt = FT[0](a), FT[1](a), FT[2](a), FT[3](a); k = _sm((a - CAB[0]) / 0.5) * _sm((CAB[1] - a) / 0.4)
        t_ = top - 0.14; b_ = Z(CAB[2]); w_ = max(0.05, (hw - 0.14) * 0.84 * (0.35 + 0.65 * k))     # уже обшивки на всей высоте: иначе борт прорезается щелью
        rs.append([P3(a, w_ * math.copysign(abs(math.cos(th)) ** (2 / nt), math.cos(th)), (t_ + b_) / 2 + (t_ - b_) / 2 * math.copysign(abs(math.sin(th)) ** (2 / nt), math.sin(th))) for th in [-math.pi / 2 + 2 * math.pi * q / 96 for q in range(96)]])
    return loft_obj('c_cab', rs, G_COCK, sharp=30)


def window_cuts():
    out = []
    for a0, a1, f0, f1 in WIN:
        for sx in (1, -1): out.append(patch('c_win', None, 6, 6, lift=-0.10, th=0.42, mat=G_DARK, cast=_win_cast(a0, a1, f0, f1, sx)))
    return out


def cockpit():
    """Нутро кабины: пол, приборная доска с экранами и козырьком, два кресла с подголовниками и подлокотниками, штурвальные колонки с рогами, центральный пульт с восемью РУД,
    боковые пульты, верхний щиток, педали, задняя переборка (тёмное; экраны - G_SCREEN, ручки - G_HANDLE)."""
    b = B(); fl = Z(CAB[2])
    def bx(c, hx, hy, hz, mat=G_COCK):
        rg = lambda y: [c + Vector((-hx, y, -hz)), c + Vector((hx, y, -hz)), c + Vector((hx, y, hz)), c + Vector((-hx, y, hz))]
        b.loft([rg(-hy), rg(hy)], mat, cap0=mat, cap1=mat)
    bx(P3(4.20, 0.0, fl + 0.02), 1.10, 2.10, 0.02)
    bx(P3(2.95, 0.0, fl + 0.85), 0.95, 0.18, 0.32); bx(P3(3.05, 0.0, fl + 1.20), 0.98, 0.25, 0.03)          # доска и козырёк
    for sx in (1, -1):
        for dx, dz, w_, h_ in ((0.30, 0.10, 0.11, 0.10), (0.55, 0.10, 0.11, 0.10), (0.80, 0.10, 0.09, 0.09), (0.42, -0.16, 0.10, 0.08), (0.68, -0.16, 0.08, 0.07)):
            bx(P3(3.135, sx * dx, fl + 0.85 + dz), w_, 0.006, h_, 7)                 # экраны на задней грани доски
        bx(P3(4.25, sx * 0.55, fl + 0.40), 0.26, 0.24, 0.06, 6); bx(P3(4.50, sx * 0.55, fl + 0.85), 0.25, 0.06, 0.40, 6)   # кресла: подушка, спинка
        bx(P3(4.53, sx * 0.55, fl + 1.36), 0.14, 0.07, 0.11, 6)                                           # подголовник
        for d_ in (-1, 1): bx(P3(4.22, sx * 0.55 + d_ * 0.29, fl + 0.62), 0.03, 0.18, 0.025, 8)           # подлокотники
        bx(P3(4.25, sx * 0.55, fl + 0.18), 0.22, 0.20, 0.16, 8)
        strut(b, P3(3.62, sx * 0.55, fl + 0.04), P3(3.66, sx * 0.55, fl + 0.70), 0.030, 9 * 0 + G_METAL, 10)   # колонка штурвала
        bx(P3(3.68, sx * 0.55, fl + 0.72), 0.17, 0.02, 0.018, G_DARK)                                     # поперечина штурвала
        for d_ in (-1, 1): bx(P3(3.68, sx * 0.55 + d_ * 0.165, fl + 0.80), 0.022, 0.022, 0.075, G_DARK)  # рога
        for d_ in (-0.12, 0.12): bx(P3(3.25, sx * 0.55 + d_, fl + 0.12), 0.05, 0.10, 0.012, G_METAL)      # педали
        bx(P3(4.30, sx * 0.97, fl + 0.38), 0.10, 0.95, 0.30)                                               # боковой пульт
        for i in range(5): bx(P3(3.70 + 0.30 * i, sx * 0.97, fl + 0.69), 0.07, 0.10, 0.006, 7 if i % 2 else G_DARK)
    bx(P3(3.55, 0.0, fl + 0.30), 0.16, 0.40, 0.30, 8)                                                      # пульт с РУД
    for i in range(8):                                                                                     # восемь рычагов двигателей
        xx = -0.12 + 0.24 * i / 7; strut(b, P3(3.50, xx, fl + 0.60), P3(3.62, xx, fl + 0.80), 0.008, G_METAL, 6)
        bx(P3(3.625, xx, fl + 0.81), 0.012, 0.018, 0.012, 9)
    for a_ in (3.75, 4.20, 4.65):                                                                          # верхний щиток
        bx(P3(a_, 0.0, FT[0](a_) - 0.24), 0.26, 0.20, 0.03, G_COCK); bx(P3(a_, 0.0, FT[0](a_) - 0.272), 0.20, 0.15, 0.003, G_DARK)
    bx(P3(5.95, 0.0, fl + 0.80), 1.05, 0.04, 0.80)
    return b.finish('det_cockpit', sharp_deg=30)


def windows():
    b_objs = []
    for a0, a1, f0, f1 in WIN:
        for sx in (1, -1):
            b_objs.append(patch('win', None, 6, 6, lift=-0.012, th=0.012, mat=G_GLASS, cast=_win_cast(a0, a1, f0, f1, sx)))
    host = b_objs[0]; vl = bpy.context.view_layer
    for o in list(vl.objects):
        if o is not None: o.select_set(False)
    for o in b_objs: o.select_set(True)
    vl.objects.active = host; bpy.ops.object.join(); host.name = 'canopy_glass'; host.data.name = 'canopy_glass'
    return host


def chute_door():
    """Дверца отсека тормозного парашюта сверху за килем (b52_05): шарнир спереди, открывается вверх."""
    a0, a1 = 45.35, 46.30
    ob = patch('chute_door', lambda u, v: (a0 + (a1 - a0) * v, -0.36 + 0.72 * u), 16, 14, dirn=-1, lift=0.014, th=0.025)     # выпуклая обшивка: хорды плиты не должны уходить под неё
    pivot = down(0.0, Yb(a0)) + Vector((0, 0, 0.012)); _rel(ob, pivot)          # ось на гребне: середина передней кромки не уходит вперёд в обшивку
    PARTS['chute_door'] = dict(pivot=pivot.copy(), axis=Vector((-1, 0, 0)), range=(0.0, 110.0), note='дверца парашюта: шарнир у передней кромки поперёк; плюс - задняя кромка вверх')
    return ob


def build_skin():
    S = [fuselage(), wing_s(1, 0.0, JOINTS[0]), wing_s(-1, 0.0, JOINTS[0])] + blisters() + tail_bumps()
    host = S[0]
    for o in S[1:]:
        _apply_bool(host, o, 'UNION'); _drop(o)
    host.name = 'B52_skin'; host.data.name = 'B52_skin'
    return host


def build_pods():
    """Гондолы, пилоны, баки - отдельные тела (в игре неподвижны), каждая пара - один объект на сторону."""
    out = []
    for sx in (1, -1):
        s = 'r' if sx > 0 else 'l'
        for i, xc in enumerate(PODS):
            parts = [nacelle(xc, sx, -1), nacelle(xc, sx, 1), pod_web(xc, sx), pod_pylon(xc, sx)]
            host = parts[0]
            for o in parts[1:]: _apply_bool(host, o, 'UNION'); _drop(o)
            for k in (-1, 1):
                for c in (intake_cut(xc, sx, k), nozzle_cut(xc, sx, k), fan_ring_cut(xc, sx, k)): _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
                sp = spinner(xc, sx, k); _apply_bool(host, sp, 'UNION'); _drop(sp)
                cn = exhaust_cone(xc, sx, k); _apply_bool(host, cn, 'UNION'); _drop(cn)
            host.name = f'pod{i + 1}_{s}'; out.append(host)
        tk, tp = tank(sx); _apply_bool(tk, tp, 'UNION'); _drop(tp); tk.name = 'tank_' + s; out.append(tk)
    return out


def plane(stage=9):
    """Этапы: 1 - обшивка, оперение, гондолы; 2 - рули, закрылки; 3 - отсек, пилоны, окна, интерцепторы, дверца парашюта; 4 - шасси и створки."""
    PARTS.clear(); STATIONS.clear(); PYLON_PTS.clear()
    skin = build_skin(); out = [skin]; stations_fill()
    ref_me = skin.data.copy()                                   # гладкая поверхность до вырезов: с неё нормали углов
    sr, er = stab(1); sl, el = stab(-1)
    vl = bpy.context.view_layer
    for o in list(vl.objects):
        if o is not None: o.select_set(False)
    sl.select_set(True); sr.select_set(True); vl.objects.active = sr; bpy.ops.object.join(); sr.name = 'stab'; sr.data.name = 'stab'
    piv = P3(STAB_PIV_A, 0.0, Z(SZ))
    for e_ in (er, el): mw = e_.matrix_world.copy(); e_.parent = sr; e_.matrix_world = mw
    PARTS['stab'] = dict(pivot=piv.copy(), axis=Vector((-1, 0, 0)), range=(-4.0, 4.0), note='стабилизатор переставной целиком (обе половины одной деталью, корень проходит в фюзеляж): ось поперёк у заднего лонжерона; плюс - передняя кромка вниз; рули высоты elev_r, elev_l - дочерние объекты')
    out += [fin(), sr, er, el]
    WP = {}
    for sx in (1, -1):
        w_ = wing_panels(sx); WP[sx] = w_; out.append(w_)
    def adopt(ch, sx, x):
        par = WP[sx]
        bpy.context.view_layer.update()                          # иначе matrix_world родителя и детали ещё старые и деталь съезжает на сдвиг оси
        mw = ch.matrix_world.copy(); ch.parent = par; ch.matrix_world = mw
    pods = build_pods(); out += pods
    for ob in pods:
        sx = 1 if ob.name.endswith('_r') else -1; xx = TANK_X if ob.name.startswith('tank') else PODS[int(ob.name[3]) - 1]; adopt(ob, sx, xx)
    if stage >= 2:
        out.append(rudder())
        for sx in (1, -1):
            for i in range(len(FLAPS)):
                f_ = flap(sx, i); out.append(f_)
                if FLAPS[i][0] >= JOINTS[0] - 0.01: adopt(f_, sx, FLAPS[i][0])
    if stage >= 3:
        bvh_ready(skin, [WP[1], WP[-1]])     # лучи створок, окон, интерцепторов - по обшивке до вырезов
        c = bay_cut(); _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
        cuts = window_cuts(); c = cock_cavity(); _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
        for c in cuts: _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
        out.append(cockpit())
        sp_ = spoilers()
        for ob in sp_:
            sx = 1 if ob.name.endswith('_r') else -1; x0 = SPOIL[int(ob.name[5]) - 1][0]
            if x0 >= JOINTS[0] - 0.01: adopt(ob, sx, x0)
        wp_ = weapon_pylons()
        for ob in wp_: adopt(ob, 1 if ob.name.endswith('_r') else -1, WPY_X)
        out += [bay_inner()] + bay_doors() + wp_ + sp_ + [windows(), chute_door()]
        import b52_det as dt
        out += [dt.fuselage_details(), dt.bay_lines()]                  # дворники убраны (Mark 2026-11-11: «дворники лучше убрать»)
        for sx in (1, -1):
            w_ = dt.wing_details(sx, WP[sx]); adopt(w_, sx, XTIP); out.append(w_)
        for ob in pods:
            if ob.name.startswith('pod'):
                sx = 1 if ob.name.endswith('_r') else -1; d_ = dt.pod_details(ob, PODS[int(ob.name[3]) - 1], sx); adopt(d_, sx, 0.0); out.append(d_)
    if stage >= 4:
        import b52_gear as gr; out += gr.gear_all()
    resharp(skin); print('нормали обшивки:', smooth_normals(skin, ref_me)); bpy.data.meshes.remove(ref_me)
    return out


def resharp(host, deg=38):
    bm = bmesh.new(); bm.from_mesh(host.data); lim = math.radians(deg)
    for f in bm.faces: f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2: e.smooth = e.calc_face_angle(0.0) < lim
        else: e.smooth = False
    bm.to_mesh(host.data); bm.free()


def smooth_normals(host, ref_me):
    """Обшивка освещается как гладкая: нормаль угла берётся с поверхности до резки (как у Hunter FGA.9); стенки вырезов остаются резкими."""
    ref_me.calc_loop_triangles(); tris = ref_me.loop_triangles; V = ref_me.vertices; CN = ref_me.corner_normals; me = host.data
    tv = [t.vertices[:] for t in tris]; tn = [[CN[l].vector.copy() for l in t.loops] for t in tris]
    bvh = BVHTree.FromPolygons([v.co.copy() for v in V], tv)
    def src(p):
        h = bvh.find_nearest(p)
        if h[0] is None: return None, 9.0
        i = h[2]; a_, b_, c_ = [V[k].co for k in tv[i]]; q = h[0]; v0, v1, v2 = b_ - a_, c_ - a_, q - a_
        d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1); den = d00 * d11 - d01 * d01
        if abs(den) < 1e-14: return tn[i][0], h[3]
        w1 = (d11 * d20 - d01 * d21) / den; w2 = (d00 * d21 - d01 * d20) / den; w0 = 1 - w1 - w2
        return (tn[i][0] * w0 + tn[i][1] * w1 + tn[i][2] * w2).normalized(), h[3]
    out = [Vector((0, 0, 1))] * len(me.loops); walls = 0; lim = math.cos(math.radians(28)); M = me.vertices; L = me.loops
    for p in me.polygons:
        pn = p.normal.copy(); n0, dist = src(p.center)
        if n0 is None or dist > 0.0035 or pn.dot(n0) < lim:
            walls += 1
            for li in p.loop_indices: out[li] = pn
            continue
        for li in p.loop_indices:
            n_, d_ = src(M[L[li].vertex_index].co)
            out[li] = n_ if (n_ is not None and d_ < 0.006 and n_.dot(pn) > 0.55) else n0
    for p in me.polygons: p.use_smooth = True
    me.normals_split_custom_set([n[:] for n in out])
    return f'граней {len(me.polygons)}, резких стенок {walls}'
