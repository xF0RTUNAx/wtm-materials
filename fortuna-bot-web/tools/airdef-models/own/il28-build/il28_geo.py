# il28_geo.py - геометрия Ил-28 для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z (в glTF: нос -Z, правое крыло +X, верх +Y). Начало - середина длины 17,65 м.
# a - расстояние от носка фюзеляжа назад; z = 0 - ось фюзеляжа; земля на GROUND_Z.
# Размеры: чертёж il28_01 (длина 17,65 м до конца турели, размах 21,45, колея 7,15, размах стабилизатора 7,1) и профили il28_02 (38,07 пикс/м: бок, план, панели),
# детали - фото il28_04…09. Сетки и текстуры чужих моделей не используются.
import math
import types
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 17.65
G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_DUCT = 0, 1, 2, 3, 4, 5, 11
PARTS = {}       # имя -> dict(pivot, axis, range, note[, kind='slide'])


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


GROUND_Z = -2.230                                               # земля под колёсами (il28_01: 1,46 м под низом фюзеляжа; фото 05 - чуть меньше)

# ── фюзеляж: почти круглый, 1,65 м; нос - застеклённая кабина штурмана; к хвосту сужается в плане, по высоте почти нет (il28_02) ──
# (a, верх, низ, полуширина, показатель верха, показатель низа)
FUS = [(0.000, -0.105, -0.160, 0.010, 2.0, 2.0), (0.020, 0.010, -0.250, 0.085, 2.0, 2.0), (0.060, 0.090, -0.320, 0.160, 2.0, 2.0), (0.140, 0.210, -0.405, 0.245, 2.0, 2.0),
       (0.290, 0.341, -0.500, 0.340, 2.0, 2.0), (0.550, 0.473, -0.578, 0.470, 2.0, 2.05), (0.810, 0.551, -0.643, 0.575, 2.0, 2.1), (1.210, 0.630, -0.709, 0.700, 2.0, 2.1),
       (1.600, 0.683, -0.748, 0.775, 2.0, 2.1), (2.000, 0.735, -0.775, 0.815, 2.0, 2.1), (2.400, 0.788, -0.800, 0.835, 2.0, 2.1), (2.800, 0.812, -0.812, 0.840, 2.05, 2.1),
       (4.000, 0.814, -0.814, 0.840, 2.05, 2.1), (12.00, 0.814, -0.814, 0.840, 2.05, 2.1), (12.80, 0.814, -0.810, 0.830, 2.05, 2.1), (13.60, 0.812, -0.800, 0.800, 2.05, 2.1),
       (14.50, 0.808, -0.775, 0.745, 2.1, 2.1), (15.40, 0.800, -0.725, 0.665, 2.15, 2.1), (16.10, 0.775, -0.665, 0.585, 2.2, 2.1), (16.55, 0.722, -0.620, 0.545, 2.2, 2.1)]
FT = tracks(FUS)
NOSE_G = 0.810                                                  # купол остекления штурмана: носок - кольцо 0,81 м (il28_02, 08)
FUS_END = 16.80                                                 # фюзеляж кончается кольцом вокруг шаровой турели


def fus_top(a, x=0.0):
    top, bot, hw, nt = FT[0](a), FT[1](a), FT[2](a), FT[3](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nt); return cy + ht * q ** (1 / nt)


def fus_bot(a, x=0.0):
    top, bot, hw, nb = FT[0](a), FT[1](a), FT[2](a), FT[4](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nb); return cy - ht * q ** (1 / nb)


def fus_hw(a, z):
    top, bot, hw, nt, nb = [t(a) for t in FT]; cy = (top + bot) / 2; ht = (top - bot) / 2; s = (z - cy) / ht; e = nt if s > 0 else nb
    return hw * max(0.0, 1 - min(1.0, abs(s)) ** e) ** (1 / e)


# хвост: конец фюзеляжа сходится к кольцу турели (центр шара TUR, радиус TUR_R; кольцо - сечение шара на FUS_END)
TUR = (17.070, -0.030); TUR_R = 0.580
def _ring_r(): return math.sqrt(TUR_R ** 2 - (TUR[0] - FUS_END) ** 2)


def hull_ring(a, n=96):
    if a <= 16.55: return sup(a, 0.0, *[t(a) for t in FT], n)
    t = smooth_(16.55, FUS_END, a); r0 = sup(16.55, 0.0, *[t_(16.55) for t_ in FT], n); rr = _ring_r() + 0.012
    r1 = [P3(a, rr * math.cos(-math.pi / 2 + 2 * math.pi * k / n), TUR[1] + rr * math.sin(-math.pi / 2 + 2 * math.pi * k / n)) for k in range(n)]
    return [Vector((p.x * (1 - t) + q.x * t, Yb(a), p.z * (1 - t) + q.z * t)) for p, q in zip(r0, r1)]


def hull():
    st = stations(NOSE_G, 2.8, 0.08) + stations(2.9, 12.8, 0.20)[1:] + stations(12.9, 16.5, 0.15)[1:] + [16.60, 16.65, 16.70, 16.75, FUS_END]
    st = sorted(set(round(v, 4) for v in st))
    return loft_obj('s_hull', [hull_ring(a) for a in st], sharp=50)


def nose_glass_ring(a, n=64, off=0.0):
    a = max(a, 0.0)
    top, bot, hw, nt, nb = [t(a) for t in FT]
    return sup(a, 0.0, top + off, bot - off, hw + off, nt, nb, n)


def nose_glass():
    """Купол штурмана: стекло от носка до кольца NOSE_G (il28_02, 08). Рамы - nose_frames()."""
    st = [0.0, 0.006, 0.02, 0.04, 0.07, 0.11, 0.16, 0.22, 0.30, 0.40, 0.50, 0.60, 0.70, NOSE_G + 0.002]
    b = B(); rings = [nose_glass_ring(a) for a in st]; b.loft(rings, G_GLASS, cap0=G_GLASS)
    return b.finish('nose_glass', sharp_deg=70)


def nose_frames():
    """Рамы купола: кольца и продольные планки по стеклу снаружи (il28_02: кольца на 0,22, 0,52, 0,81; планки по 8 направлениям)."""
    b = B(); n = 64
    for a0, w in ((0.11, 0.014), (0.42, 0.014), (NOSE_G - 0.03, 0.030)):
        rr = [nose_glass_ring(a, n, off) for a, off in ((a0 - w, -0.004), (a0 - w, 0.010), (a0 + w, 0.010), (a0 + w, -0.004))]
        b.loft(rr + [rr[0]], G_SKIN)
    for k in range(8):
        th = -math.pi / 2 + 2 * math.pi * (k + 0.5) / 8
        def pt(a, off, dt):
            top, bot, hw, nt, nb = [t(max(a, 0.004)) for t in FT]; cy = (top + bot) / 2; ht = (top - bot) / 2; c, s = math.cos(th + dt), math.sin(th + dt)
            return P3(a, (hw + off) * math.copysign(abs(c) ** (2 / nt), c), cy + (ht + off) * math.copysign(abs(s) ** (2 / nt), s))
        st = [0.11 + (NOSE_G - 0.13) * i / 12 for i in range(13)]
        b.loft([[pt(a, -0.004, -0.012), pt(a, 0.007, -0.012), pt(a, 0.007, 0.012), pt(a, -0.004, 0.012)] for a in st], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('nose_frames', sharp_deg=40)


def nav_cut():
    """Кабина штурмана за куполом: полость в фюзеляже, видна сквозь стекло."""
    st = [NOSE_G - 0.10] + stations(NOSE_G, 2.25, 0.08)
    def rg(a):
        top, bot, hw, nt, nb = [t(max(a, NOSE_G)) for t in FT]; w = 0.045 + 0.04 * smooth_(1.6, 2.2, a)
        return sup(a, 0.0, top - w, max(bot + w, -0.50), hw - w - 0.02, nt, nb, 48)
    return loft_obj('c_nav', [rg(a) for a in st], G_COCK, sharp=25)


# ── кабина лётчика: козырёк, фонарь и обтекатель за ним (il28_02: козырёк 2,50…2,95, фонарь до 3,90, верх 1,245; обтекатель сходит на спину к 5,6) ──
CANOPY = [(2.48, 0.790, 0.300), (2.60, 0.905, 0.335), (2.75, 1.030, 0.368), (2.95, 1.150, 0.390), (3.20, 1.228, 0.400), (3.50, 1.245, 0.400), (3.78, 1.225, 0.392), (3.92, 1.180, 0.385)]
CAN_T = tracks(CANOPY)
ARCH_A = 2.950                                                  # дуга козырька
CAN_A1 = 3.900                                                  # задняя рама фонаря
FAIR = [(3.90, 1.204, 0.408), (4.00, 1.190, 0.402), (4.30, 1.110, 0.365), (4.80, 1.000, 0.315), (5.20, 0.905, 0.230), (5.50, 0.835, 0.120), (5.70, 0.800, 0.040)]
FAIR_T = tracks(FAIR)
def SILL(a): return fus_top(a, CAN_T[1](a))


def can_ring(a, inset=0.0, n=44):
    top, hw = CAN_T[0](a) - inset, CAN_T[1](a) - inset; y0 = SILL(a) - 0.003
    return [P3(a, hw * math.cos(math.pi * k / (n - 1)) ** 0.62 if math.cos(math.pi * k / (n - 1)) >= 0 else -hw * (-math.cos(math.pi * k / (n - 1))) ** 0.62, y0 + (top - y0) * math.sin(math.pi * k / (n - 1)) ** 0.75) for k in range(n)]


def fair_ring(a, n=40):
    """Сечение обтекателя за фонарём: спереди - как наружный край задней рамы фонаря (тот же профиль), назад сходит на спину."""
    top, hw = FAIR_T[0](a), FAIR_T[1](a); z0 = fus_top(a, hw) - 0.003 - 0.05 * smooth_(4.0, 4.6, a); ez = 0.75 - 0.05 * smooth_(4.0, 4.6, a)
    return [P3(a, hw * math.copysign(abs(math.cos(t)) ** 0.62, math.cos(t)), z0 + (top - z0) * math.sin(t) ** ez) for t in (math.pi * k / (n - 1) for k in range(n))] + [P3(a, -hw * 0.9, z0 - 0.15), P3(a, hw * 0.9, z0 - 0.15)]


def fairing():
    return loft_obj('s_fair', [fair_ring(a) for a in [CAN_A1 + 0.004] + stations(3.95, 5.70, 0.10)], sharp=50)


def cock_cut():
    """Кабина лётчика: вырез под фонарём."""
    def sec(a): hw = CAN_T[1](a) - 0.03; return [P3(a, -hw, 0.12), P3(a, hw, 0.12), P3(a, hw, 3.0), P3(a, -hw, 3.0)]
    return loft_obj('c_cock', [sec(a) for a in stations(2.62, CAN_A1 - 0.03, 0.07)], G_COCK, sharp=25)


def glass_shell(name, st):
    b = B(); strip(b, [can_ring(a) for a in st], G_GLASS); return b.finish(name, sharp_deg=60)


def frame_arch(b, a, w, inset=0.008, h=0.022, n=44):
    ri0 = can_ring(a - w, inset, n); ro0 = can_ring(a - w, -h, n); ro1 = can_ring(a + w, -h, n); ri1 = can_ring(a + w, inset, n)
    strip(b, [ri0, ro0, ro1, ri1, ri0], G_SKIN)


CAN_OPEN = 105.0


def canopy():
    """Фонарь лётчика: стекло, передняя и задняя рамы, рельсы по порогу, средняя дуга. Откидывается вправо на петле по правому порогу."""
    a0 = ARCH_A; a1 = CAN_A1; st = stations(a0 + 0.004, a1, 0.08); pivot = P3((a0 + a1) / 2, CAN_T[1]((a0 + a1) / 2) + 0.035, SILL((a0 + a1) / 2) - 0.030)
    gl = glass_shell('canopy_glass', st)
    b = B(); frame_arch(b, a0 + 0.030, 0.030); frame_arch(b, 3.42, 0.014, h=0.016); frame_arch(b, a1 - 0.035, 0.035, h=0.026)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        b.loft([[rail(a, 0.004, 0.003), rail(a, 0.020, 0.003), rail(a, 0.020, 0.040), rail(a, -0.012, 0.055), rail(a, -0.012, 0.022)] for a in stations(a0, a1, 0.07)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    fr = b.finish('canopy', sharp_deg=45)
    for o in (fr, gl):
        for v in o.data.vertices: v.co -= pivot
    fr.location = pivot; gl.parent = fr; gl.location = (0, 0, 0)
    PARTS['canopy'] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(0.0, CAN_OPEN), note='фонарь лётчика: откидывается вправо на петле по правому порогу; плюс - фонарь уходит вправо-вверх; canopy_glass - дочерний')
    return [fr, gl]


def windscreen():
    a1 = ARCH_A - 0.02; st = stations(2.50, a1, 0.06)
    b = B(); strip(b, [can_ring(a) for a in st], G_GLASS); gl = b.finish('screen_glass', sharp_deg=60)
    b2 = B(); frame_arch(b2, ARCH_A - 0.030, 0.030, h=0.026); frame_arch(b2, 2.52, 0.025, h=0.014)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        b2.loft([[rail(a, 0.004, -0.010), rail(a, 0.018, -0.010), rail(a, 0.018, 0.030), rail(a, -0.010, 0.040), rail(a, -0.010, 0.016)] for a in stations(2.52, a1, 0.06)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
        for kk in (0.32, 0.68):                                 # стойки переплёта козырька
            k_ = int(43 * (kk if sg > 0 else 1 - kk)); pts = [can_ring(a, -0.010)[k_] for a in stations(2.52, a1, 0.06)]
            for p0, p1 in zip(pts, pts[1:]): strut(b2, p0, p1, 0.012, G_SKIN, 8)
    fr = b2.finish('screen_frame', sharp_deg=45)
    return [gl, fr]


# ── крыло: передняя кромка прямая, задняя - со стреловидностью вперёд; хорда у оси 3,79, на конце 2,08 (il28_02, план); V 2° ──
WLE = 8.090
def WTE(x): return 11.880 - 0.1606 * x
XTIP = 10.690
WZ0 = 0.380                                                     # плоскость хорд у оси (il28_02 бок, 04 спереди: крыло на верхней трети фюзеляжа)
DIH = math.tan(math.radians(1.0))
def wz(x): return WZ0 + DIH * x
TIPR = 0.38                                                     # скругление носка законцовки в плане
def LE_(x): return WLE + TIPR * (1 - math.sqrt(max(0.0, 1 - (max(0.0, x - (XTIP - TIPR)) / TIPR) ** 2)))
def TE_(x): return WTE(x) - 0.06 * (max(0.0, x - (XTIP - 0.10)) / 0.10) ** 2
def CH_(x): return TE_(x) - LE_(x)
_TC = Lin([(0.0, 0.150), (3.4, 0.135), (XTIP, 0.110)])
def TC(x): return _TC(x)
HINGE = lambda x: WLE + 0.66 * (WTE(x) - WLE)                   # линия навески элеронов и закрылков: 0,66 хорды (il28_02)
FLAP_I = (0.900, 2.480); FLAP_O = (4.330, 6.480); AIL = (6.540, 10.300)
NAC_X, NAC_Z = 3.400, -0.070                                    # ось гондолы (план il28_02 - 3,34; колея 7,15 на чертеже 01)


def wpl(sx, x):
    return lambda a, h: P3(a, sx * x, wz(x) + h)


def _wsec(sx, x):
    c = CH_(x); tc = TC(x); le = LE_(x); u0 = 0.0008; head = cove_wall_f(le, c, tc, u0)
    if _in(x, FLAP_I) or _in(x, FLAP_O) or _in(x, AIL): ue, tail = cove_cut(le, c, tc, HINGE(x))
    else: ue = 1.0; tail = cove_wall(le, c, tc, 1.0)
    return foil_ring(le, c, tc, u0, ue, 22, wpl(sx, x), tail=tail, head=head)


def wing_s(sx):
    k = [0.0, 0.40, 0.84, 1.6, 2.0, 2.6, 3.0, 3.4, 3.8, 4.2, 5.0, 5.6, 6.0, 7.0, 7.6, 8.2, 8.8, 9.4, 9.9] + [XTIP - TIPR * (1 - math.sin(math.pi / 2 * i / 10)) for i in range(11)]
    for sp, n in ((FLAP_I, 5), (FLAP_O, 6), (AIL, 9)):
        k += [sp[0] - 0.003, sp[0], sp[1], sp[1] + 0.003] + [sp[0] + (sp[1] - sp[0]) * i / n for i in range(1, n)]
    xs = sorted(set(round(v, 4) for v in k if v <= XTIP))
    rings = [_wsec(sx, x) for x in xs[:-1]]
    tipc = sum(rings[-1], Vector()) / len(rings[-1]); rings.append([tipc + (p - tipc) * 0.04 + Vector((sx * 0.0, 0, 0)) for p in _wsec(sx, xs[-1] - 0.0005)])
    return loft_obj('s_wing_' + ('r' if sx > 0 else 'l'), rings, sharp=48)


def wing_part(name, spec, sx, HG, note, rng):
    x0, x1 = spec; e_ = 0.015; x0 += e_; x1 -= e_
    pv0 = P3(HG(x0), sx * x0, wz(x0)); pv1 = P3(HG(x1), sx * x1, wz(x1)); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    for i in range(11):
        x = x0 + (x1 - x0) * i / 10; c = CH_(x); ah = HG(x); le = LE_(x); tc = TC(x)
        rings.append([v - pivot for v in foil_ring(le, c, tc, (ah - le) / c, 1.0, 10, wpl(sx, x), head=cove_nose(le, c, tc, ah))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=rng, note=note)
    return ob


def wing_top(x, a):
    c = CH_(x); u = (a - LE_(x)) / c; return wz(x) + TC(x) * c * thk(max(0.0, min(1.0, u)))


def wing_bot(x, a):
    c = CH_(x); u = (a - LE_(x)) / c; return wz(x) - TC(x) * c * thk(max(0.0, min(1.0, u)))


# ── гондолы двигателей: круглые, низко под крылом, нижний обтекатель стойки до 12,2; сопло на 12,66 (il28_02, 04, 06, 08) ──
# (a, верх, низ, полуширина)
# Mark 2026-11-13: «двигатели вышли слишком массивными» - гондола уже и ниже на 12 % (было 1,66 × 1,77 м по профилю 02), передок - цилиндр с узкой губой, а не луковица (фото 08)
_NZ = -0.100
NAC = [(5.100, _NZ + 0.620, _NZ - 0.620, 0.585), (5.120, _NZ + 0.668, _NZ - 0.668, 0.630), (5.180, _NZ + 0.718, _NZ - 0.718, 0.675), (5.300, _NZ + 0.752, _NZ - 0.754, 0.706),
       (5.550, _NZ + 0.778, _NZ - 0.784, 0.728), (6.000, _NZ + 0.790, _NZ - 0.800, 0.738), (7.000, _NZ + 0.790, _NZ - 0.830, 0.740), (8.500, _NZ + 0.790, _NZ - 0.870, 0.740),
       (9.500, _NZ + 0.775, _NZ - 0.890, 0.730), (10.40, _NZ + 0.710, _NZ - 0.870, 0.680), (11.20, _NZ + 0.580, _NZ - 0.800, 0.580), (11.80, _NZ + 0.440, _NZ - 0.660, 0.470),
       (12.25, _NZ + 0.335, _NZ - 0.470, 0.385), (12.66, _NZ + 0.300, _NZ - 0.310, 0.300)]
_K2 = 0.93; NAC = [(a_, -0.070 + (t_ - _NZ) * _K2, -0.070 + (b_ - _NZ) * _K2, w_ * _K2) for a_, t_, b_, w_ in NAC]     # Mark 2026-11-13: «сделай двигатели ещё чуть меньше» - ещё 7 %, ось поднята на 3 см (верх гондолы вровень с крылом)
NT = tracks(NAC)
NAC_A0, NAC_A1 = 5.100, 12.660
INL_R = 0.465                                                   # радиус канала у губы
NOZ_R = 0.237                                                   # радиус среза сопла
def nac_zc(a): return (NT[0](a) + NT[1](a)) / 2


def nacelle(sx):
    st = [5.100, 5.106, 5.115, 5.13, 5.16, 5.20, 5.26, 5.35, 5.48, 5.65, 5.85, 6.1] + stations(6.3, 12.2, 0.25)[1:] + [12.35, 12.48, 12.58, 12.63, NAC_A1]
    return loft_obj('s_nac_' + ('r' if sx > 0 else 'l'), [sup(a, sx * NAC_X, *[t(a) for t in NT], 2.1, 2.1, 64) for a in st], sharp=50)


def nac_cut(sx):
    """Канал заборника (до центробежного компрессора) и труба сопла."""
    cx = sx * NAC_X; zc = nac_zc(5.10); out = []
    prof = [(4.90, INL_R + 0.02, G_SKIN), (NAC_A0 + 0.010, INL_R, G_SKIN), (5.25, INL_R - 0.015, G_DUCT), (5.60, INL_R - 0.010, G_DUCT), (6.00, INL_R - 0.03, G_DARK), (6.20, 0.26, G_DARK)]
    b = B(); b.loft([_circ(a, cx, zc, r) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_SKIN, cap1=G_DARK); out.append(b.finish('c_nin', sharp_deg=30))
    zc = nac_zc(NAC_A1)
    prof = [(NAC_A1 + 0.10, NOZ_R + 0.004, G_METAL), (NAC_A1, NOZ_R, G_METAL), (12.40, NOZ_R - 0.006, G_DUCT), (11.90, NOZ_R - 0.010, G_DARK), (11.60, 0.18, G_DARK)]
    b = B(); b.loft([_circ(a, cx, zc, r) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK); out.append(b.finish('c_nout', sharp_deg=30))
    return out


def intake_core(sx):
    """В канале заборника: кок (на фото 08 красный) на четырёх стойках, за ним тёмный компрессор."""
    cx = sx * NAC_X; zc = nac_zc(5.10); b = B(); n = 32
    cone = [(5.36, 0.010), (5.40, 0.075), (5.48, 0.150), (5.60, 0.215), (5.75, 0.250), (5.95, 0.262), (6.05, 0.262)]
    b.loft([_circ(a, cx, zc, r, n) for a, r in cone], G_METAL, cap0=G_METAL, cap1=G_DARK)
    for k in range(4):
        th = 2 * math.pi * (k + 0.5) / 4; er = Vector((math.sin(th), 0, -math.cos(th))); et = Vector((math.cos(th), 0, math.sin(th))); c0 = Vector((cx, 0, zc))
        b.loft([[c0 + er * r + et * t + Vector((0, Yb(a_), 0)) for a_, t in ((5.70, 0.0), (5.80, 0.018), (5.92, 0.0), (5.80, -0.018))] for r in (0.24, INL_R - 0.02)], G_DUCT, cap0=G_DUCT, cap1=G_DUCT)
    return b.finish('inl_core_' + ('r' if sx > 0 else 'l'), sharp_deg=35)


def jet_cone(sx):
    """В сопле: конус выхода турбины."""
    cx = sx * NAC_X; zc = nac_zc(NAC_A1); b = B(); n = 28
    b.loft([_circ(a, cx, zc, r, n) for a, r in ((11.80, 0.17), (12.05, 0.16), (12.30, 0.10), (12.42, 0.030))], G_DARK, cap0=G_DARK, cap1=G_DARK)
    return b.finish('jet_cone_' + ('r' if sx > 0 else 'l'), sharp_deg=35)


# ── киль и стабилизатор (il28_02 бок и план): киль с форкилем, стабилизатор на киле над фюзеляжем, V 7° ──
FIN_Z0, FIN_Z1 = 0.600, 4.120
def _fle(z):                                                    # передняя кромка: прямая 13,69 (z 1,34) - 16,65 (4,12); ниже - форкиль к 12,6 у спины
    s = 13.69 + (16.65 - 13.69) * (z - 1.34) / (4.12 - 1.34)
    if z >= 1.34: return s
    t = (1.34 - z) / (1.34 - 0.80); return s - 1.10 * t ** 1.6 if z > 0.80 else s - 1.10 - (0.80 - z) * 2.0
def _fte(z):
    if z >= 1.73: return 16.84 + (17.97 - 16.84) * (z - 1.73) / (3.97 - 1.73) - 0.10 * (max(0.0, z - 3.97) / 0.15) ** 2
    if z >= 1.30: return 16.66 + 0.18 * (z - 1.08) / (1.73 - 1.08)
    return 16.72 - (1.30 - z) * 0.25                         # под крышей кабины стрелка кромка уходит вперёд: киль стоит перед её передним стеклом (il28_10)
FIN_TC = 0.095
RUD = (1.500, 3.900)
def RUD_H(z): return 16.00 + (17.44 - 16.00) * (z - 1.08) / (4.05 - 1.08)


def fin():
    zs = [FIN_Z0, 0.70, 0.80, 0.90, 1.02, 1.16, 1.30, 1.40, RUD[0] - 0.004, RUD[0]] + [RUD[0] + (RUD[1] - RUD[0]) * i / 8 for i in range(1, 8)] + [RUD[1], RUD[1] + 0.004, 4.04, 4.08, 4.105, FIN_Z1]
    rings = []
    for z in zs:
        le = _fle(z); te = _fte(z); c = te - le; tc = min(FIN_TC, FIN_TC * 2.2 / c)
        if _in(z, RUD): ue, tail = cove_cut(le, c, tc, RUD_H(z), 0.012)
        else: ue, tail = 1.0, cove_wall(le, c, tc, 1.0)
        top = (max(0.0, z - 4.06) / 0.06)
        rings.append(foil_ring(le, c, tc * (1 - 0.6 * min(1.0, top) ** 2), 0.0008, ue, 20, lambda a, h: P3(a, h, z), tail=tail, head=cove_wall_f(le, c, tc, 0.0008)))
    return loft_obj('s_fin', rings, sharp=48)


def rudder():
    z0, z1 = RUD[0] + 0.018, RUD[1] - 0.018; pv0 = P3(RUD_H(z0), 0.0, z0); pv1 = P3(RUD_H(z1), 0.0, z1); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized(); rings = []
    for i in range(10):
        z = z0 + (z1 - z0) * i / 9; le = _fle(z); c = _fte(z) - le; tc = min(FIN_TC, FIN_TC * 2.2 / c)
        rings.append([v - pivot for v in foil_ring(le, c, tc, (RUD_H(z) - le) / c, 1.0, 10, lambda a, h: P3(a, h, z), head=cove_nose(le, c, tc, RUD_H(z)))])
    ob = loft_obj('rudder', rings, sharp=48); ob.location = pivot
    PARTS['rudder'] = dict(pivot=pivot.copy(), axis=axis, range=(-25.0, 25.0), note='руль направления над стабилизатором; ось по линии навески (наклонена назад); плюс - задняя кромка вправо')
    return ob


ST_Z0 = 1.300; ST_DIH = math.tan(math.radians(7.0)); ST_X1 = 3.550
def st_le(x): return 14.24 + (16.55 - 14.24) * x / ST_X1
def st_te(x): return 16.47 + (17.47 - 16.47) * x / ST_X1
def st_z(x): return ST_Z0 + ST_DIH * x
ST_TC = 0.095
ELEV = (0.420, 3.480)
def ELEV_H(x): return st_le(x) + 0.66 * (st_te(x) - st_le(x))


def stab_s(sx):
    xs = [0.0, 0.06, ELEV[0] - 0.003, ELEV[0]] + [ELEV[0] + (ELEV[1] - ELEV[0]) * i / 7 for i in range(1, 7)] + [ELEV[1], ELEV[1] + 0.003, 3.51, 3.53, ST_X1]; rings = []
    for x in xs:
        le = st_le(x) + 0.12 * (max(0.0, x - 3.30) / 0.25) ** 2; te = st_te(x); c = te - le
        if _in(x, ELEV): ue, tail = cove_cut(le, c, ST_TC, ELEV_H(x))
        else: ue, tail = 1.0, cove_wall(le, c, ST_TC, 1.0)
        f = 1.0 if x < 3.49 else 0.35
        rings.append(foil_ring(le, c, ST_TC * f, 0.0008, ue, 18, lambda a, h: P3(a, sx * x, st_z(x) + h), tail=tail, head=cove_wall_f(le, c, ST_TC * f, 0.0008)))
    return loft_obj('s_stab_' + ('r' if sx > 0 else 'l'), rings, sharp=48)


def elevator(sx):
    name = 'elev_' + ('r' if sx > 0 else 'l'); x0, x1 = ELEV[0] + 0.015, ELEV[1] - 0.015
    pv0 = P3(ELEV_H(x0), sx * x0, st_z(x0)); pv1 = P3(ELEV_H(x1), sx * x1, st_z(x1)); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    for i in range(10):
        x = x0 + (x1 - x0) * i / 9; le = st_le(x); c = st_te(x) - le
        rings.append([v - pivot for v in foil_ring(le, c, ST_TC, (ELEV_H(x) - le) / c, 1.0, 10, lambda a, h: P3(a, sx * x, st_z(x) + h), head=cove_nose(le, c, ST_TC, ELEV_H(x)))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis, range=(-25.0, 20.0), note='руль высоты; ось в центре круглого носа; плюс - задняя кромка вниз')
    return ob


# ── кормовая установка: шаровая турель с двумя пушками в щелях, кабина стрелка с плоскими стёклами над ней (il28_06, 07, 02) ──
GUN_DX = 0.110                                                  # полрасстояния между стволами (il28_06)
TUR_AZ = (-70.0, 70.0); TUR_EL = (-35.0, 30.0)                  # +30°: выше стволы при повороте за ±44° задевают основание кабины стрелка


def turret():
    """Шар с двумя вертикальными щелями, внутри щелей - короба пушек. Поворот по азимуту - весь шар (ось вертикальна через центр)."""
    a0, z0 = TUR; c = P3(a0, 0.0, z0); b = B(); n = 48; m = 32
    rings = []
    for i in range(1, m):                                       # шар, кольца по продольной оси (полюс вперёд и назад)
        ph = math.pi * i / m; r = TUR_R * math.sin(ph); ac = a0 - TUR_R * math.cos(ph)
        rings.append(_circ(ac, 0.0, z0, r, n))
    b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    ob = b.finish('turret', sharp_deg=60)
    for v in ob.data.vertices: v.co -= c
    ob.location = c
    PARTS['turret'] = dict(pivot=c.copy(), axis=Vector((0, 0, 1)), range=TUR_AZ, note='кормовая турель: поворот по азимуту вокруг вертикали через центр шара; плюс - стволы вправо (к правому крылу)')
    return ob


def turret_slots():
    """Резаки щелей шара (вертикальные, по ходу стволов по углу места)."""
    a0, z0 = TUR; out = []
    for sg in (1, -1):
        x = sg * GUN_DX; w = 0.036; rings = []
        for k in range(13):
            th = math.radians(-50 + 100 * k / 12)                # угол от горизонтали назад
            d = Vector((0, -math.cos(th), math.sin(th))); c = P3(a0, x, z0)
            p_in = c + d * 0.30; p_out = c + d * (TUR_R + 0.10)
            rings.append([p_in + Vector((-w, 0, 0)), p_in + Vector((w, 0, 0)), p_out + Vector((w, 0, 0)), p_out + Vector((-w, 0, 0))])
        out.append(loft_obj('c_slot', rings, G_DARK, sharp=20))
    return out


def turret_guns():
    """Две НР-23: казённики внутри шара, стволы с дульными тормозами наружу (il28_06). Ребёнок турели, ось угла места - поперечная через центр."""
    a0, z0 = TUR; c = P3(a0, 0.0, z0); b = B(); n = 14
    for sg in (1, -1):
        x = sg * GUN_DX
        prof = [(a0 + 0.05, 0.045), (a0 + 0.35, 0.045), (a0 + 0.35, 0.030), (a0 + 0.52, 0.026), (a0 + 0.58, 0.020), (a0 + 1.30, 0.017), (a0 + 1.30, 0.024), (a0 + 1.42, 0.024), (a0 + 1.42, 0.010)]
        b.loft([_circ(a, x, z0, r, n) for a, r in prof], G_METAL, cap0=G_METAL, cap1=G_DARK)
        box(b, P3(a0 + 0.12, x, z0), 0.032, 0.16, 0.055, G_METAL)
    ob = b.finish('turret_guns', sharp_deg=35)
    for v in ob.data.vertices: v.co -= c
    ob.location = c
    PARTS['turret_guns'] = dict(pivot=c.copy(), axis=Vector((-1, 0, 0)), range=TUR_EL, parent='turret', note='стволы НР-23 по углу места, ось поперечная через центр шара; плюс - стволы вверх; ребёнок turret')
    return ob


GC = dict(a0=16.50, a1=17.36, z1=1.170, hw0=0.380, hw1=0.330)    # кабина стрелка (il28_02: 16,57…17,42, верх 1,18; ширина 0,8)


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


# Mark 2026-11-13 (фото il28_10, 11): «это не просто куб - крыша меньше дна», «органично внедрена… идёт в продолжение хвостовой части».
# Кабина: основание - продолжение хвоста (борта фюзеляжа поднимаются до порога окон, спереди плавно сходят на спину, над шаром - плоское дно),
# над порогом - усечённая пирамида из стёкол в рамах: крыша уже и короче основания, переднее и заднее стёкла наклонены.
GC_TAIL = 0.160                                                 # длина скругления основания за задним стеклом
GC_HOOD = 0.430                                                 # низ основания над шаром: выше концов щелей (подъём +50° - z 0,41)
TUR_GAP = 0.012                                                 # зазор между шаром турели и основанием кабины
GCB = dict(a0=16.68, a1=17.30, ra0=16.84, ra1=17.15, zs=0.720, zr=1.300, xb0=0.460, xb1=0.420, xt0=0.310, xt1=0.280)   # фото il28_10, 11: стёкла ~0,6 м, металл под ними - узкая полоса над шаром
def _gxb(a): t = min(1.0, max(0.0, (a - GCB['a0']) / (GCB['a1'] - GCB['a0']))); return GCB['xb0'] + (GCB['xb1'] - GCB['xb0']) * t
def _gxt(a): t = min(1.0, max(0.0, (a - GCB['ra0']) / (GCB['ra1'] - GCB['ra0']))); return GCB['xt0'] + (GCB['xt1'] - GCB['xt0']) * t


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


def ball_section(a, xw, zs, rf=0.12):
    """Сечение основания кабины над шаром (Mark: «должно идти продолжением, а не резким переходом»): стенка идёт вниз и у низа расширяется
    галтелью наружу, ложась на шар по касательной (угол между стенкой и шаром заполнен), дальше низ - по шару с зазором TUR_GAP.
    Перед центром шара опора - кольцо, в которое сходится хвост. Начало - левая точка касания, обход как у rpoly."""
    zc = TUR[1]; Rp = TUR_R + TUR_GAP; rs = math.sqrt(max(Rp ** 2 - (a - TUR[0]) ** 2, 0.05 ** 2))
    if a < TUR[0]: rs = max(rs, _ring_r() + 0.012)
    cx = xw + rf; d = rs + rf
    if d <= cx: rf = cx - xw; d = cx + 0.001                         # стенка мимо шара (не бывает над шаром): страховка
    zf = zc + math.sqrt(max(d * d - cx * cx, 1e-6)); zf = min(zf, zs - 0.03)
    Tx = cx * rs / d; Tz = zc + (zf - zc) * rs / d
    phT = math.atan2(Tz - zf, Tx - cx); psi = math.atan2(Tz - zc, Tx)
    if phT < 0: phT += 2 * math.pi
    right = [Vector((cx + rf * math.cos(phT + (math.pi - phT) * i / 12), zf + rf * math.sin(phT + (math.pi - phT) * i / 12))) for i in range(13)]   # от касания с шаром вверх к стенке
    arc = [Vector((rs * math.cos(math.pi - psi - (math.pi - 2 * psi) * i / 30), zc + rs * math.sin(math.pi - psi - (math.pi - 2 * psi) * i / 30))) for i in range(31)]
    return arc + right[1:] + [Vector((xw, zs)), Vector((-xw, zs))] + [Vector((-p.x, p.y)) for p in reversed(right[1:])]


def gcab_ring(a, n=64):
    """Сечение основания кабины: снизу по ширине хвоста, борта прямо вверх-внутрь до порога; спереди сходит в фюзеляж (f -> 0); над шаром - ball_section."""
    zs = GCB['zs']; f = smooth_(15.60, 16.45, a); over = smooth_(16.30, 16.50, a); af = min(a, 16.55)
    zt = (fus_top(af) - 0.03) * (1 - f) + (zs + 0.004) * f
    xt = (fus_hw(af, zt - 0.06) - 0.01) * (1 - f) + _gxb(a) * f
    tc = smooth_(16.55, FUS_END, a); wc = math.sqrt(max(0.0, (_ring_r() + 0.012) ** 2 - (0.30 - TUR[1]) ** 2))     # хвост сходится к кольцу турели: низ основания идёт по нему
    xl = (fus_hw(af, 0.30) - 0.01) * (1 - tc) + (wc - 0.01) * tc
    A = [Vector((p.x, p.z)) for p in rpoly(a, [(-xl, 0.30), (xl, 0.30), (xt, zt), (-xt, zt)], 4 * n, 0.045)]
    A = _resample(A, n)
    if over > 0.0:
        xw, zw = _gxb(a), zs + 0.004
        Bs = _resample(ball_section(a, xw, zw), n)
        A = [p.lerp(q, over) for p, q in zip(A, Bs)]
    return [P3(a, p.x, p.y) for p in A]


def gunner_cab():
    """Основание кабины стрелка (часть обшивки). Над шаром опускается до шапки шара и охватывает её (Mark: «у нижней части нет пустого пространства - она продолжена до шара»):
    снизу вырезан шар турели с зазором TUR_GAP, вращению не мешает; ниже GC_HOOD не идёт - там концы щелей и выход стволов."""
    st = sorted(set(round(v, 4) for v in stations(15.60, 16.50, 0.06) + stations(16.50, GCB['a1'], 0.04)))
    rings = [gcab_ring(a) for a in st]; bb = B(); bb.loft(rings, G_SKIN); bm = bb.bm
    vs = list(bm.verts); nr = len(rings[0])
    for k, r0 in ((0, vs[:nr]), (1, vs[-nr:])):                          # торцы одной плоской гранью (вогнутый низ по шару)
        f = bm.faces.new(r0[::-1] if k == 0 else r0); f.material_index = G_SKIN
    ob = bb.finish('s_gcab', sharp_deg=50)
    me = ob.data; ncap = 2
    for p_ in list(me.polygons)[-ncap:]: p_.use_smooth = False           # торцы плоские: без лучей в тени
    return ob


def sphere_cut(r, n=64, m=40):
    a0, z0 = TUR; rings = [_circ(a0 - r * math.cos(math.pi * i / m), 0.0, z0, r * math.sin(math.pi * i / m), n) for i in range(1, m)]
    b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN); return b.finish('c_ball', sharp_deg=60)


def gcab_cut():
    """Полость кабины стрелка: из основания открыта вверх под стёкла."""
    def rg(a): w = _gxb(a) - 0.05; return rpoly(a, [(-w, 0.62), (w, 0.62), (w, 0.90), (-w, 0.90)], 24, 0.04)
    return loft_obj('c_gcab', [rg(GCB['a0'] + 0.05), rg(GCB['a1'] - 0.05)], G_COCK, sharp=25)


def _gcorners():
    G_ = GCB; zs = G_['zs'] + 0.002; zr = G_['zr']
    base = [P3(G_['a0'], -_gxb(G_['a0']), zs), P3(G_['a0'], _gxb(G_['a0']), zs), P3(G_['a1'], _gxb(G_['a1']), zs), P3(G_['a1'], -_gxb(G_['a1']), zs)]
    roof = [P3(G_['ra0'], -_gxt(G_['ra0']), zr), P3(G_['ra0'], _gxt(G_['ra0']), zr), P3(G_['ra1'], _gxt(G_['ra1']), zr), P3(G_['ra1'], -_gxt(G_['ra1']), zr)]
    return base, roof


def gcab_glass():
    """Стёкла кабины стрелка (усечённая пирамида: перед, зад, бока, крыша) и рамы по всем рёбрам, средняя стойка на боках и спереди."""
    base, roof = _gcorners(); b = B(); bm = b.bm
    vb = [bm.verts.new(p) for p in base]; vr = [bm.verts.new(p) for p in roof]
    for q in ((vb[0], vb[1], vr[1], vr[0]), (vb[1], vb[2], vr[2], vr[1]), (vb[2], vb[3], vr[3], vr[2]), (vb[3], vb[0], vr[0], vr[3]), (vr[0], vr[1], vr[2], vr[3])):
        f = bm.faces.new(q); f.material_index = G_GLASS
    gl = b.finish('gcab_glass', sharp_deg=20)
    b = B(); r = 0.024
    for i in range(4):
        strut(b, base[i], roof[i], r, G_SKIN, 8); strut(b, roof[i], roof[(i + 1) % 4], r, G_SKIN, 8); strut(b, base[i], base[(i + 1) % 4], r * 1.3, G_SKIN, 8)
    for i, j in ((1, 2), (3, 0)):                                   # средние стойки бортов
        strut(b, base[i].lerp(base[j], 0.5), roof[i].lerp(roof[j], 0.5), r * 0.8, G_SKIN, 8)
    strut(b, base[0].lerp(base[1], 0.5), roof[0].lerp(roof[1], 0.5), r * 0.8, G_SKIN, 8)   # средняя стойка переднего стекла
    fr = b.finish('gcab_frame', sharp_deg=40)
    return [gl, fr]


# ── люк стрелка: плита под хвостом перед турелью, петля у задней кромки, откидывается вниз (il28_06, 07) ──
HATCH = dict(a0=15.55, a1=16.45, hw=0.300)
HATCH_OPEN = 82.0


# ── бомбоотсек под центропланом: две створки вбок; 4 ряда держателей по два в ряд (ФАБ-250 ×8), ФАБ-500 ×4 - на рядах 1 и 3 ──
BAY = dict(a0=7.10, a1=14.10, hw=0.640, roof=0.080)              # проём створок и полость: a, полуширина по низу, потолок
BAY_ROWS = (8.40, 10.00, 11.60, 13.20)                           # центры бомб в ряду (a)
BAY_X = 0.310                                                   # бомбы в два ряда: ±0,31 от оси
BAY_TOP = -0.050                                                # точка подвески = низ замка держателя; игра вешает ось бомбы на vis.r + 5 см ниже (main.js)
VIS_R = {'fab500': 0.200, 'fab250': 0.137}                     # vis.r бомб в arsenal.js
BAY_PTS = {'fab500': (8.40, 11.60), 'fab250': BAY_ROWS}         # ряды под каждую загрузку: ФАБ-500 ×4 - ряды 1 и 3, ФАБ-250 ×8 - все четыре
BAY_OPEN = 95.0


def bay_cut():
    a0, a1, hw = BAY['a0'], BAY['a1'], BAY['hw']; r = BAY['roof']
    def sec(a, k=1.0): return [P3(a, -hw * k, -1.40), P3(a, hw * k, -1.40), P3(a, hw * k, r - 0.10), P3(a, hw * k - 0.10, r), P3(a, -hw * k + 0.10, r), P3(a, -hw * k, r - 0.10)]
    return loft_obj('c_bay', [sec(a0), sec(a1)], G_COCK, sharp=25)


# ── пушки НР-23 в носу: две, неподвижные, внизу по бортам (il28_01, 02) ──
NGUN = dict(a0=1.45, a1=2.65, x=0.600, z=-0.500)


def gun_fair(sx):
    G_ = NGUN; b = B(); n = 18; x = sx * G_['x']
    prof = [(G_['a0'], 0.040, 0.040), (G_['a0'] + 0.15, 0.085, 0.075), (G_['a0'] + 0.45, 0.105, 0.090), (G_['a1'] - 0.30, 0.105, 0.090), (G_['a1'], 0.010, 0.010)]
    b.loft([[P3(a, x + rx * math.cos(2 * math.pi * q / n), G_['z'] + rz * math.sin(2 * math.pi * q / n)) for q in range(n)] for a, rx, rz in prof], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('s_ngun_' + ('r' if sx > 0 else 'l'), sharp_deg=30)


def nose_guns():
    b = B(); n = 12
    for sx in (1, -1):
        x = sx * (NGUN['x'] + 0.012); z = NGUN['z'] - 0.005
        b.loft([_circ(a, x, z, r, n) for a, r in ((NGUN['a0'] + 0.30, 0.022), (NGUN['a0'] - 0.20, 0.019), (NGUN['a0'] - 0.20, 0.026), (NGUN['a0'] - 0.30, 0.026), (NGUN['a0'] - 0.30, 0.010))], G_METAL, cap0=G_METAL, cap1=G_DARK)
    return b.finish('nose_guns', sharp_deg=35)


# ── обтекатель антенны РЛС под передним фюзеляжем (il28_02, 05, 08) ──
RADOME = dict(a0=3.90, a1=6.10, hw=0.560, d=0.300)


def radome():
    R_ = RADOME; st = stations(R_['a0'], R_['a1'], 0.10); rings = []
    for a in st:
        t = (a - R_['a0']) / (R_['a1'] - R_['a0'])
        f = max(0.03, (math.sin(math.pi * t)) ** 0.45); hw = R_['hw'] * max(0.05, math.sin(math.pi * min(1.0, t)) ** 0.35)
        zb = fus_bot(a) - R_['d'] * f; zt = fus_bot(a) + 0.25
        rings.append(sup(a, 0.0, zt, zb, hw, 2.2, 2.0, 40))
    return loft_obj('s_radome', rings, sharp=50)


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


def bay_doors():
    """Створки отсека: две, петля по наружной кромке проёма, открываются вниз-наружу (как bay у B-2A)."""
    out = []; a0, a1, hw = BAY['a0'] + 0.008, BAY['a1'] - 0.008, BAY['hw'] - 0.004
    for sx, s_ in ((1, 'r'), (-1, 'l')):
        n_ = 'bay_' + s_
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (0.004 + (hw - 0.004) * u)), 6, 24, dirn=1, lift=0.0, th=0.012, z0=-3.0)
        zh = down(sx * hw, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z; pivot = P3((a0 + a1) / 2, sx * hw, zh); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, -sx, 0)), range=(0.0, BAY_OPEN), note='створка бомбоотсека: петля по наружной кромке проёма; плюс - внутренняя кромка вниз-наружу; 0 - закрыта', side='R' if sx > 0 else 'L')
        out.append(ob)
    return out


def hatch_cut():
    """Проём люка стрелка: шахта вверх в фюзеляж (видна, когда плита откинута)."""
    H = HATCH; w = H['hw'] + 0.006; rg = lambda a: [P3(a, -w, -1.4), P3(a, w, -1.4), P3(a, w, -0.20), P3(a, -w, -0.20)]
    return loft_obj('c_hatch', [rg(H['a0'] - 0.006), rg(H['a1'] + 0.006)], G_COCK, sharp=25)


def hatch():
    """Люк стрелка: плита по низу хвоста, петля у задней кромки поперёк."""
    H = HATCH
    ob = patch('hatch', lambda u, v: (H['a0'] + (H['a1'] - H['a0']) * v, -H['hw'] + 2 * H['hw'] * u), 8, 10, dirn=1, lift=0.0, th=0.014, z0=-3.0)
    zh = down(0.0, Yb(H['a1']), z0=-3.0, dirn=1).z; pivot = P3(H['a1'], 0.0, zh); _rel(ob, pivot)
    PARTS['hatch'] = dict(pivot=pivot.copy(), axis=Vector((-1, 0, 0)), range=(0.0, HATCH_OPEN), note='входной люк стрелка: петля у задней кромки, поперёк; плюс - передняя кромка вниз (плита повисает почти вертикально, как на il28_06/07)')
    return ob


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


def build_skin():
    S = [_tag(hull(), 1), _tag(fin(), 2), _tag(fairing(), 3), _tag(gunner_cab(), 4), _tag(radome(), 5)]
    for sx in (1, -1): S += [_tag(nacelle(sx), 6), _tag(gun_fair(sx), 7)]
    W = [_tag(wing_s(1), 9), _tag(wing_s(-1), 9), _tag(stab_s(1), 10), _tag(stab_s(-1), 10)]
    host = S[0]
    for o in S[1:] + W:
        _apply_bool(host, o, 'UNION'); _drop(o)
    cuts = [nav_cut(), cock_cut(), gcab_cut()]
    for sx in (1, -1): cuts += nac_cut(sx)
    print('скруглено вершин у стыка хвоста и кабины стрелка:', fillet_seam(host, pairs=((1, 4),), band=0.14, iters=16, wfun=lambda a: smooth_(15.4, 15.8, a)))
    for c in cuts:
        _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'IL_skin'; host.data.name = 'IL_skin'
    bvh_ready(host)
    return host


def plane(stage=9, carve=True):
    """Этапы: 1 - обшивка; 2 - рули, турель, двигатели; 3 - кабины, стёкла, створки, люк, детали; 4 - шасси."""
    PARTS.clear()
    skin = build_skin(); out = [skin]
    if stage >= 2:
        tur = turret(); slots = turret_slots()
        for c in slots: _apply_bool(tur, c, 'DIFFERENCE'); _drop(c)
        tg = turret_guns(); tg.parent = tur; tg.location = tg.location - tur.location
        out += [tur, tg, rudder(), elevator(1), elevator(-1)]
        for s, n in ((1, 'r'), (-1, 'l')):
            out += [intake_core(s), jet_cone(s),
                    wing_part('flap_i_' + n, FLAP_I, s, HINGE, 'закрылок между фюзеляжем и гондолой; ось в центре круглого носа; плюс - вниз', (0.0, 40.0)),
                    wing_part('flap_o_' + n, FLAP_O, s, HINGE, 'закрылок за гондолой; ось в центре круглого носа; плюс - вниз', (0.0, 40.0)),
                    wing_part('ail_' + n, AIL, s, HINGE, 'элерон; ось в центре круглого носа; плюс - задняя кромка вниз', (-20.0, 20.0))]
    if stage >= 3:
        out += [nose_glass(), nose_frames()] + canopy() + windscreen() + gcab_glass() + [nose_guns()]
        out += bay_doors() + [hatch()]
        import il28_detail as dt; out += dt.all_details()
    if stage >= 4:
        import il28_gear as gr; out += gr.gear_nose() + gr.gear_main(1) + gr.gear_main(-1) + gr.gear_doors()
    for c in (bay_cut(), hatch_cut()): _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
    return out
