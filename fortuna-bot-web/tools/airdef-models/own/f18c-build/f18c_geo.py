# f18c_geo.py - геометрия F/A-18C Hornet для build.py, основа - своя модель F/A-18E, таблицы и заборник заново по фото f18c_01...10. Метры. Blender: нос +Y, правое крыло +X, верх +Z (в glTF: нос -Z, правое крыло +X, верх +Y). Начало - середина длины 17,07 м по оси сопел.
# a - расстояние от острия носа, y - высота над осью сопел. План снят с выпрямленного снимка снизу f18c_10 (_rectify.py), вид сбоку - f18c_08 с поправкой тангажа (_grid.py). f18c_09, 10 двухместные: кабину с них не брать. Сетка и текстуры чужих моделей не используются.
# Сетка: замкнутые оболочки объединяются булевой операцией в одну обшивку без внутренних стенок; кили, стабилизаторы, рули, консоли - отдельные детали с толщиной.
import math
import types
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 17.07
G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_DUCT = 0, 1, 2, 3, 4, 5, 11     # обшивка; титан и механика; нутро; стекло; резина; кабина; канал и ниши
PARTS = {}       # имя -> dict(pivot, axis, range, note): для паспорта


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


def sup(a, cx, top, bot, hw, nt, nb, n):
    """Суперэллипс: начало снизу (шов развёртки), дальше +X, верх, -X."""
    cy = (top + bot) / 2; ht = (top - bot) / 2; pts = []
    for k in range(n):
        th = -math.pi / 2 + 2 * math.pi * k / n; c, s = math.cos(th), math.sin(th); e = nt if s > 0 else nb
        pts.append(P3(a, cx + hw * math.copysign(abs(c) ** (2 / e), c), cy + ht * math.copysign(abs(s) ** (2 / e), s)))
    return pts


def rrect(a, cx, top, bot, hw, r, n):
    """Прямоугольник с малым скруглением углов (воздухозаборник): острые прямые грани. Начало снизу по центру."""
    cy = (top + bot) / 2; ht = (top - bot) / 2; r = min(r, hw * 0.9, ht * 0.9); nc = 3; seg = []
    corners = [(hw - r, -ht + r, -90), (hw - r, ht - r, 0), (-hw + r, ht - r, 90), (-hw + r, -ht + r, 180)]
    pts = []
    for cxx, cyy, a0 in corners:
        for k in range(nc + 1):
            t = math.radians(a0 + 90 * k / nc); pts.append((cxx + r * math.cos(t), cyy + r * math.sin(t)))
    # равномерное число точек на сторонах: всего n
    per = n // 4 - nc - 1; out = []
    for i in range(4):
        cc = pts[i * (nc + 1):(i + 1) * (nc + 1)]; out += cc
        p0 = cc[-1]; p1 = pts[((i + 1) * (nc + 1)) % len(pts)]
        for j in range(1, per + 1):
            t = j / (per + 1); out.append((p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t))
    k0 = len(out) - (per + 1) // 2 - 0
    out = out[k0:] + out[:k0]
    return [P3(a, cx + x, cy + y) for x, y in out]


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


def mirror_obj(src, name):
    me = src.data.copy(); me.name = name; ob = bpy.data.objects.new(name, me)
    for c in src.users_collection: c.objects.link(ob)
    bm = bmesh.new(); bm.from_mesh(me)
    for v in bm.verts: v.co.x = -v.co.x
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    return ob


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


# ── носовая часть и спина ──
FORE = [  # a, верх, низ, полуширина, nверх, nниз: бок f18c_08, спина ниже и короче, чем у E
    (0.000, 0.012, -0.012, 0.012, 2.0, 2.0), (0.120, 0.052, -0.050, 0.062, 2.0, 2.0), (0.400, 0.130, -0.112, 0.152, 2.0, 2.0), (0.800, 0.255, -0.172, 0.268, 2.0, 2.0), (1.200, 0.375, -0.222, 0.362, 2.0, 2.0), (1.750, 0.550, -0.285, 0.450, 2.05, 2.1), (2.400, 0.705, -0.350, 0.490, 2.1, 2.2),
    (3.000, 0.825, -0.400, 0.505, 2.2, 2.4), (3.500, 0.925, -0.420, 0.520, 2.4, 2.6), (4.200, 0.995, -0.440, 0.545, 2.8, 2.8), (5.000, 1.030, -0.465, 0.570, 3.0, 3.0), (6.000, 1.060, -0.500, 0.580, 3.0, 3.2), (6.600, 1.160, -0.540, 0.580, 2.8, 3.2), (7.200, 1.215, -0.550, 0.580, 2.5, 3.2), (8.000, 1.150, -0.540, 0.560, 2.5, 3.0), (9.000, 1.070, -0.480, 0.540, 2.5, 3.0), (10.000, 0.970, -0.400, 0.515, 2.5, 3.0), (11.200, 0.870, -0.300, 0.475, 2.5, 2.8), (12.400, 0.760, -0.200, 0.415, 2.4, 2.6), (13.400, 0.680, -0.050, 0.300, 2.2, 2.2), (14.200, 0.580, 0.120, 0.110, 2.0, 2.0)]
FT = tracks(FORE)


def fore_y(a, x):
    """Высота верхней поверхности носовой части над |x|: для порога фонаря."""
    top, bot, hw, nt = FT[0](a), FT[1](a), FT[2](a), FT[3](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nt)
    return cy + ht * q ** (1 / nt)


def fore():
    st = [0.0, 0.03, 0.07, 0.12, 0.2] + stations(0.3, 3.2, 0.10) + stations(3.3, 14.2, 0.20)
    return loft_obj('s_fore', [sup(a, 0.0, *[t(a) for t in FT], 72) for a in st])


# ── средняя часть: широкая палуба от наплыва до хвоста, единая плоскость сверху, между гондолами киль ──
MID = [(8.450, 0.430, -0.480, 0.620, 7.0, 4.0), (9.150, 0.445, -0.520, 1.000, 7.0, 4.0), (10.100, 0.510, -0.520, 1.120, 7.0, 4.0), (11.000, 0.585, -0.500, 1.160, 7.0, 4.0), (12.000, 0.640, -0.470, 1.165, 7.0, 4.0), (13.500, 0.640, -0.380, 1.125, 7.0, 3.6), (14.500, 0.580, -0.280, 1.020, 6.0, 3.2), (15.400, 0.500, -0.180, 0.820, 5.0, 3.0), (15.850, 0.370, -0.120, 0.540, 3.0, 3.0), (16.100, 0.250, -0.080, 0.280, 2.4, 2.4), (16.280, 0.170, -0.020, 0.050, 2.0, 2.0)]


MID_HW = tracks(MID)[2]


def mid():
    T = tracks(MID)
    return loft_obj('s_mid', [sup(a, 0.0, *[t(a) for t in T], 96) for a in stations(8.45, 16.28, 0.22)])


# ── наплыв (LEX): план снят с fa18_06; пластина с острой кромкой, сверху плавно в обшивку ──
LEXX = Track([(3.500, 0.200), (3.800, 0.420), (4.350, 0.760), (5.100, 0.960), (5.750, 1.150), (6.500, 1.270), (7.300, 1.350), (8.100, 1.390), (9.000, 1.420), (9.800, 1.440)])
LEXY = Track([(3.500, 0.640), (4.500, 0.575), (6.000, 0.495), (7.500, 0.430), (9.000, 0.380), (9.800, 0.355)])
LEXT = Track([(3.500, 0.016), (4.500, 0.046), (6.000, 0.068), (7.500, 0.082), (9.800, 0.090)])


def lex():
    st = [3.50, 3.56, 3.64, 3.78, 3.96] + stations(4.2, 9.8, 0.20); rs = []
    for a in st:
        y = LEXY(a); t = LEXT(a); rs.append(sup(a, 0.0, y + t, y - t, LEXX(a), 1.32, 1.32, 64))
    return loft_obj('s_lex', rs, sharp=50)


# ── гондолы ──
NOZ_X, NOZ_Y, NOZ_A, NOZ_R = 0.490, 0.020, 17.070, 0.385       # центр и радиус среза створок сопла
NAC_A1 = 16.080                                                 # конец гладкой гондолы: дальше кольцо и створки
NAC = [(9.250, 0.780, 0.430, -0.760, 0.550, 3.6), (10.500, 0.750, 0.440, -0.790, 0.545, 3.0), (12.000, 0.715, 0.450, -0.770, 0.560, 2.6), (13.500, 0.680, 0.470, -0.700, 0.545, 2.4), (14.500, 0.640, 0.470, -0.610, 0.515, 2.2), (15.300, 0.570, 0.470, -0.500, 0.490, 2.05), (16.080, 0.490, 0.465, -0.425, 0.445, 2.0)]
NT = tracks(NAC)
NAC_OUT = lambda a_: NT[0](a_) + NT[3](a_)


def nacelle(sx):
    n = 64
    def ring(a):
        cx, top, bot, hw, e = [t(a) for t in NT]; return sup(a, sx * cx, top, bot, hw, e, e, n)
    rs = [ring(a) for a in stations(9.25, NAC_A1, 0.20)]
    a1 = NAC_A1; rg = lambda r: [P3(a1 + 0.012, sx * NOZ_X + r * math.sin(2 * math.pi * k / n), NOZ_Y - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    rs.append(rg(0.42))
    return loft_obj('s_nac_' + ('r' if sx > 0 else 'l'), rs, G_SKIN, sharp=40)


def bore_cut(sx):
    a1 = NAC_A1; cx = sx * NOZ_X; n = 56
    ring = lambda a, r: [P3(a, cx + r * math.sin(2 * math.pi * k / n), NOZ_Y - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    prof = [(a1 + 0.25, 0.400, G_METAL), (a1 - 0.18, 0.400, G_METAL), (a1 - 0.22, 0.375, G_METAL), (a1 - 0.30, 0.375, G_METAL), (a1 - 0.34, 0.400, G_METAL), (a1 - 0.80, 0.405, G_COCK), (a1 - 1.10, 0.405, G_DARK), (a1 - 1.50, 0.260, G_DARK), (a1 - 1.62, 0.040, G_DARK)]
    b = B(); b.loft([ring(a, r) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK)
    return b.finish('c_bore', sharp_deg=30)


def keel():
    """Киль между гондолами с балкой гака (fa18_06)."""
    T = tracks([(13.8, 0.20, -0.40, 0.20), (15.0, 0.20, -0.36, 0.17), (16.0, 0.18, -0.26, 0.11), (16.6, 0.16, -0.14, 0.06)])
    return loft_obj('s_keel', [sup(a, 0.0, T[0](a), T[1](a), T[2](a), 3.0, 2.6, 24) for a in stations(13.8, 16.6, 0.25)])


# ── воздухозаборник C: овальный с острой кромкой, поворот канала к двигателю, косой срез (f18c_06, 07 слева, 01, 10) ──
INL_A0, INL_A1 = 6.20, 10.20
FAN_X, FAN_Y, FAN_A, FAN_R = 0.670, -0.090, 9.30, 0.310
def inl_pts(a, inset=0.0, sx=1):
    """Овал: снаружи круглее, у отсекающей плиты прямее. Вперёд от 7 м точные размеры устья, дальше короб сливается с гондолой."""
    k = min(1.0, max(0.0, (a - 7.0) / 2.5)); cx = 1.020 - 0.100 * k; cy = -0.200 + 0.080 * k; hw = 0.440 + 0.020 * k - inset; ht = 0.500 + 0.060 * k - inset; out = []
    for i in range(24):
        th = 2 * math.pi * i / 24; c, s_ = math.cos(th), math.sin(th); e = 2.5 if c > 0 else 3.4
        out.append((sx * (cx + hw * math.copysign(abs(c) ** (2 / e), c)), cy + ht * math.copysign(abs(s_) ** (2 / e), s_)))
    return out if sx > 0 else out


def inlet_box(sx):
    return loft_obj('s_inl_' + ('r' if sx > 0 else 'l'), [poly_ring(a, inl_pts(a, 0.0, sx), 72, 0.04) for a in stations(INL_A0, INL_A1, 0.25)], sharp=46)


def lip_cut(sx):
    """Косой срез: верх впереди, низ сзади (f18c_01, 10): всё, что впереди кромки, убирается."""
    rs = []
    for x, da in ((0.30, 0.06), (1.80, -0.10)):
        rs.append([P3(a_ + da, sx * x, y_) for a_, y_ in ((6.35, 0.72), (6.72, 0.30), (7.76, -0.90), (7.82, -1.2), (5.0, -1.2), (5.0, 0.72))])
    return loft_obj('c_lip', rs, G_SKIN)


def duct_cut(sx):
    """Канал: от устья плавно поворачивает к двигателю, сечение становится кругом. Кромка губы острая: стенка 2,8 см."""
    a0, a1 = 6.10, FAN_A + 0.02; n = 72; rings = []
    for i in range(15):
        a = a0 + (a1 - a0) * i / 14; t = _sm((a - 7.6) / (FAN_A - 0.2 - 7.6))
        r1 = poly_ring(a, inl_pts(max(a, 6.2), 0.028, sx), n, 0.03); c = Vector((sx * FAN_X, Yb(a), FAN_Y)); rr = FAN_R
        d0 = (r1[0] - c); st = math.atan2(d0.z, d0.x * sx); r2 = [c + Vector((sx * rr * math.cos(st + 2 * math.pi * k / n * _spin(r1)), 0, rr * math.sin(st + 2 * math.pi * k / n * _spin(r1)))) for k in range(n)]
        rings.append([p.lerp(q, t) for p, q in zip(r1, r2)])
    return loft_obj('c_duct_' + ('r' if sx > 0 else 'l'), rings, G_DUCT)


def duct_sleeve(sx):
    """Стенка канала со стороны фюзеляжа: канал не пробивает щель между заборником и бортом."""
    a0, a1 = 6.10, FAN_A + 0.02; n = 72; rings = []
    for i in range(15):
        a = a0 + (a1 - a0) * i / 14
        if a < 7.15 or a > 8.75: continue
        t = _sm((a - 7.6) / (FAN_A - 0.2 - 7.6)); r1 = poly_ring(a, inl_pts(max(a, 6.2), 0.028, sx), n, 0.03); c = Vector((sx * FAN_X, Yb(a), FAN_Y)); d0 = (r1[0] - c); st = math.atan2(d0.z, d0.x * sx)
        r2 = [c + Vector((sx * FAN_R * math.cos(st + 2 * math.pi * k / n * _spin(r1)), 0, FAN_R * math.sin(st + 2 * math.pi * k / n * _spin(r1)))) for k in range(n)]
        rg = [p.lerp(q, t) for p, q in zip(r1, r2)]; ct = sum(rg, Vector()) / n
        # впереди - только верх: низ губы острый, стенка на нём вылезла бы за кромку
        rings.append([p + (p - ct).normalized() * (0.07 * max(0.0, -sx * (p - ct).normalized().x)) if (a > 7.9 or p.z > -0.05) else p.lerp(ct, 0.02) for p in rg])
    return loft_obj('c_sleeve_' + ('r' if sx > 0 else 'l'), rings, G_SKIN)


def _duct_mat(host, c):
    """Вся поверхность внутри канала - краска канала: осколки обшивки в стенке не светятся."""
    from mathutils.bvhtree import BVHTree
    bvh = BVHTree.FromPolygons([v.co.copy() for v in c.data.vertices], [p.vertices[:] for p in c.data.polygons]); M = host.matrix_world; n = 0
    for p in host.data.polygons:
        if p.material_index != G_SKIN: continue
        q = M @ p.center; a = L / 2 - q.y
        if a < 7.10 or a > FAN_A or a < 6.72 + (0.30 - q.z) * 0.867 + 0.12: continue
        h = bvh.find_nearest(q)
        if h[0] is not None and h[3] < 0.012: p.material_index = G_DUCT; n += 1
    return n


def _spin(r1):
    """Направление обхода кольца для круга: как у многоугольника, если смотреть в осях (|x|, z)."""
    s = 0.0
    for i in range(len(r1)):
        p, q = r1[i], r1[(i + 1) % len(r1)]; s += abs(p.x) * q.z - abs(q.x) * p.z
    return 1 if s > 0 else -1


def _sm(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)


def fan(sx):
    b = B(); a0 = FAN_A; c = P3(a0, sx * FAN_X, FAN_Y); F = Vector((0, 1, 0)); X, Z = Vector((1, 0, 0)), Vector((0, 0, 1)); n = 18
    rg = lambda r, d: [c + (X * math.cos(2 * math.pi * k / n) + Z * math.sin(2 * math.pi * k / n)) * r + F * d for k in range(n)]
    b.loft([rg(0.365, -0.03), rg(0.365, 0.0), rg(0.115, 0.0), rg(0.115, 0.030), rg(0.080, 0.120), rg(0.010, 0.190)], G_COCK, cap1=G_COCK)
    for j in range(22):
        ang = 2 * math.pi * j / 22; u = X * math.cos(ang) + Z * math.sin(ang); v = X * -math.sin(ang) + Z * math.cos(ang)
        b.loft([[c + u * 0.125 + v * 0.034 + F * 0.012, c + u * 0.125 - v * 0.034 + F * 0.048, c + u * 0.125 - v * 0.034 + F * 0.052, c + u * 0.125 + v * 0.034 + F * 0.016], [c + u * 0.358 + v * 0.044 + F * 0.012, c + u * 0.358 - v * 0.044 + F * 0.048, c + u * 0.358 - v * 0.044 + F * 0.052, c + u * 0.358 + v * 0.044 + F * 0.016]], G_METAL)
    ob = b.finish('fan_' + ('r' if sx > 0 else 'l'), sharp_deg=30); k_ = FAN_R / 0.36
    for v in ob.data.vertices:
        w_ = ob.matrix_world @ v.co; w_.x = c.x + (w_.x - c.x) * k_; w_.z = c.z + (w_.z - c.z) * k_; v.co = ob.matrix_world.inverted() @ w_
    return ob


def splitter(sx):
    """Отсекающая плита между бортом и каналом: спереди клином (f18c_01, 10)."""
    def sec(a, x0, x1, y0, y1): return [P3(a, sx * x0, y0), P3(a, sx * x1, y0), P3(a, sx * x1, y1), P3(a, sx * x0, y1)]
    return loft_obj('s_split_' + ('r' if sx > 0 else 'l'), [sec(6.45, 0.50, 0.54, -0.42, 0.36), sec(7.10, 0.50, 0.590, -0.60, 0.44), sec(8.10, 0.50, 0.620, -0.68, 0.44)], G_SKIN, sharp=30)


# ── крыло ──
FOLD_X = 3.850; FOLD_GAP = 0.006
WING_Y0, WING_DY = 0.350, -0.036
def wy(x): return WING_Y0 + WING_DY * (x - 1.9) - 0.20 * max(0.0, 1.70 - x)
LE_I = lambda x: 8.060 + 0.5950 * (x - 1.75)                    # кромка прямая, без зуба (f18c_10)
LE_O = LE_I
TE_I = lambda x: 12.000
TE_O = lambda x: 11.750 - 0.1027 * (x - 3.85)
SLAT_I = lambda x: 0.470 - 0.0400 * (x - 1.90)                  # хорда носка
SLAT_O = SLAT_I
HINGE_I = lambda x: 11.100 + 0.030 * (x - 1.42)                 # линия навески закрылка
HINGE_O = lambda x: 11.300 - 0.033 * (x - 3.85)                 # элерона
FLAP = (1.450, 3.800); AIL = (3.900, 5.350); SLAT_X = (1.900, 5.600)
GAP = 0.012
TC = Track([(1.100, 0.050), (5.720, 0.032)])


def _wsec(sx, x, side):
    """Кольцо неподвижной части: круглые вырезы под носок спереди и под закрылок или элерон сзади; side 'i' внутренняя, 'o' консоль."""
    LE, TE, SL, HG, X0, X1 = (LE_I, TE_I, SLAT_I, HINGE_I, FLAP[0], FLAP[1]) if side == 'i' else (LE_O, TE_O, SLAT_O, HINGE_O, AIL[0], AIL[1])
    c = TE(x) - LE(x); tc = TC(x)
    if SLAT_X[0] - 1e-6 <= x <= SLAT_X[1] + 1e-6: us, head = cove_cut_f(LE(x), c, tc, LE(x) + SL(x))
    else: us = 0.0008; head = cove_wall_f(LE(x), c, tc, us)
    if X0 - 1e-6 <= x <= X1 + 1e-6: ue, tail = cove_cut(LE(x), c, tc, HG(x))
    else: ue = 1.0; tail = cove_wall(LE(x), c, tc, 1.0)
    return foil_ring(LE(x), c, tc, us, ue, 18, lambda a, h: P3(a, sx * x, wy(x) + h), tail=tail, head=head)


def wing_s(sx):
    xs = [1.10, 1.30, 1.445, 1.45] + [1.45 + (1.896 - 1.45) * i / 3 for i in range(1, 4)] + [1.90] + [1.90 + (FOLD_X - FOLD_GAP - 1.90) * i / 8 for i in range(1, 9)]
    xs = sorted(set(round(v, 4) for v in xs + [3.75, 3.80, 3.804]))
    return loft_obj('s_wing_' + ('r' if sx > 0 else 'l'), [_wsec(sx, x, 'i') for x in xs if x <= FOLD_X - FOLD_GAP + 1e-6], sharp=48)


def fold(sx):
    """Складная консоль: разрез настоящий, шарнир по линии складывания; вместе с постоянным рельсом на конце. В игре не двигается."""
    name = 'fold_' + ('r' if sx > 0 else 'l'); xe = 5.720; xs = [FOLD_X + FOLD_GAP] + [3.895, 3.90] + [3.90 + (AIL[1] - 3.90) * i / 7 for i in range(1, 8)] + [5.355, 5.45, 5.55, 5.60, 5.604, 5.66, xe]
    xs = sorted(set(round(v, 4) for v in xs)); pivot = P3(10.90, sx * FOLD_X, wy(FOLD_X) + 0.075)
    rs = [[v - pivot for v in _wsec(sx, x, 'o')] for x in xs]
    b = B(); b.loft(rs, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    xr = 5.800; yr = wy(5.70) - 0.006; rg = lambda a, hw, hh: [P3(a, sx * xr + hw * math.cos(2 * math.pi * q / 12), yr + hh * math.sin(2 * math.pi * q / 12)) - pivot for q in range(12)]
    prof = [(9.90, 0.006, 0.006), (10.00, 0.030, 0.034), (10.26, 0.046, 0.052), (11.46, 0.046, 0.052), (11.72, 0.028, 0.034), (11.80, 0.006, 0.006)]
    b.loft([rg(a, h, v) for a, h, v in prof], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    sec = lambda a: [P3(a, sx * (xe - 0.01), yr - 0.018) - pivot, P3(a, sx * (xr - 0.01), yr - 0.022) - pivot, P3(a, sx * (xr - 0.01), yr + 0.022) - pivot, P3(a, sx * (xe - 0.01), yr + 0.018) - pivot]
    b.loft([sec(10.55), sec(11.42)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    ob = b.finish(name, sharp_deg=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=((-90.0, 0.0) if sx > 0 else (0.0, 90.0)), note='складывание вверх; в игре не двигается', sign=-sx)
    return ob


def wing_part(name, spec, sx, LE, TE, HG, note, rng):
    x0, x1 = spec; x0 += 0.006; x1 -= 0.006
    pv0 = P3(HG(x0), sx * x0, wy(x0)); pv1 = P3(HG(x1), sx * x1, wy(x1)); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    for i in range(9):
        x = x0 + (x1 - x0) * i / 8; c = TE(x) - LE(x); ah = HG(x)
        rings.append([v - pivot for v in foil_ring(LE(x), c, TC(x), (ah - LE(x)) / c, 1.0, 9, lambda a, h: P3(a, sx * x, wy(x) + h), head=cove_nose(LE(x), c, TC(x), ah))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=rng, note=note)
    return ob


def slat(sx):
    """Носок крыла: внутренняя и внешняя секции одной детали, кромка прямая; ось в центре круглой задней части."""
    name = 'slat_' + ('r' if sx > 0 else 'l'); b = B()
    xa, xb = SLAT_X[0] + 0.016, FOLD_X - 0.020
    p0 = P3(LE_I(xa) + SLAT_I(xa), sx * xa, wy(xa)); p1 = P3(LE_I(xb) + SLAT_I(xb), sx * xb, wy(xb)); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized()
    if axis.x > 0: axis = -axis                                 # к оси самолёта: плюс - носок вниз
    def sec(x):
        c = TE_I(x) - LE_I(x) if x < FOLD_X else TE_O(x) - LE_O(x); le = LE_I(x); sl = SLAT_I(x)
        return [v - pivot for v in foil_ring(le, c, TC(x), 0.0008, sl / c, 12, lambda a, h: P3(a, sx * x, wy(x) + h), tail=cove_tail(le, c, TC(x), le + sl), head=cove_wall_f(le, c, TC(x), 0.0008))]
    b.loft([sec(xa + (xb - xa) * i / 7) for i in range(8)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    xa2, xb2 = FOLD_X + FOLD_GAP + 0.012, SLAT_X[1] - 0.016
    b.loft([sec(xa2 + (xb2 - xa2) * i / 5) for i in range(6)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    ob = b.finish(name, sharp_deg=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(0.0, 25.0), note='две секции одной детали, ось в центре круглой задней части; плюс - носок вниз')
    return ob


# ── стабилизатор: план fa18_06; внутренняя кромка вдоль гондолы с зазором, цельноповоротный ──
STAB_Y, STAB_DY = 0.150, -0.055
STAB_A = 15.150
class Lin:
    def __init__(self, pts): self.p = pts
    def __call__(self, t):
        p = self.p
        if t <= p[0][0]: return p[0][1]
        for (x0, y0), (x1, y1) in zip(p, p[1:]):
            if t <= x1: return y0 + (y1 - y0) * (t - x0) / max(x1 - x0, 1e-6)
        return p[-1][1]


S_LE = Lin([(1.000, 13.300), (3.180, 15.720), (3.200, 15.760)])
S_TE = Lin([(1.000, 15.550), (2.880, 16.480), (3.200, 16.200)])
STAB_GAP = 0.020
XT = 3.20


def _sup_x(cx, top, bot, hw, nt, nb, y):
    """Наибольшая ширина сечения sup на высотах y ± 6 см: стабилизатор толщиной около 10 см не должен входить в корпус."""
    cy = (top + bot) / 2; ht = (top - bot) / 2; yy = min(max(cy, y - 0.06), y + 0.06); e = nt if yy >= cy else nb; u = min(0.999, abs((yy - cy) / ht) ** e) if ht else 0.999
    return cx + hw * (1 - u) ** (1 / e)


def stab_in(a_):
    """Внутренняя кромка стабилизатора: настоящая ширина корпуса на его высоте, а не наибольшая; за гондолой - по соплу."""
    y = STAB_Y; a_ = max(a_, 9.25)
    if a_ > NAC_A1:
        t_ = min(1.0, (a_ - NAC_A1) / 0.12); nac = NAC_OUT(NAC_A1) + (NOZ_X + 0.43 - NAC_OUT(NAC_A1)) * t_
    else:
        cx, top, bot, hw, e = [t(a_) for t in NT]; nac = _sup_x(cx, top, bot, hw, e, e, y)
    M = tracks(MID); a_m = min(a_, 16.28); mid_ = _sup_x(0.0, M[0](a_m), M[1](a_m), M[2](a_m), M[3](a_m), M[4](a_m), y)
    return max(nac, mid_)


def stab(sx):
    name = 'stab_' + ('r' if sx > 0 else 'l'); xr_ = stab_in(STAB_A) + STAB_GAP; pivot = P3(STAB_A, sx * xr_, STAB_Y)
    xs = [1.00, 1.08, 1.20, 1.36, 1.55] + [1.55 + (2.88 - 1.55) * i / 7 for i in range(1, 8)] + [2.95, 3.05, 3.15, 3.19, 3.20]
    def warp(a_, xn):
        xi = stab_in(a_) + STAB_GAP
        if abs(a_ - STAB_A) < 0.38: xi = max(xi, stab_in(STAB_A) + 0.006 + 0.008)      # у оси кромка не заходит за торец бобышки
        return xi + (xn - 1.0) / (XT - 1.0) * (XT - xi)
    rings = []
    for x in xs:
        c = S_TE(x) - S_LE(x)
        def place(a_, h, x=x):
            xw = warp(a_, x); return P3(a_, sx * xw, STAB_Y + STAB_DY * (xw - 1.0) + h)
        rings.append([v - pivot for v in foil_ring(S_LE(x), c, 0.040, 0.0, 1.0, 22, place)])
    b = B(); r0 = rings[0]; nr = len(r0); inner = [(r0[k] + r0[nr - 1 - k]) / 2 for k in range(nr)]
    b.loft([inner] + rings, G_SKIN, cap1=G_SKIN)
    n = 14; rg = lambda x_, r: [P3(STAB_A + r * math.cos(2 * math.pi * k / n), sx * x_, STAB_Y + r * math.sin(2 * math.pi * k / n)) - pivot for k in range(n)]
    b.loft([rg(xr_ - 0.003, 0.055), rg(xr_ + 0.03, 0.055)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    ob = b.finish(name, sharp_deg=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(-24.0, 24.0), note='ось поперёк у гондолы; плюс - носок вверх')
    return ob


def stab_boss(sx):
    x1 = stab_in(STAB_A) + 0.006; x0 = x1 - 0.10; n = 20
    rg = lambda x_, r: [P3(STAB_A + r * 1.1 * math.cos(2 * math.pi * k / n), sx * x_, STAB_Y - 0.01 + r * math.sin(2 * math.pi * k / n)) for k in range(n)]
    return loft_obj('s_boss_' + ('r' if sx > 0 else 'l'), [rg(x0, 0.11), rg(x1 - 0.004, 0.10), rg(x1, 0.08)], G_SKIN, sharp=40)


# ── киль: разведён наружу (fa18_05), вид сбоку fa18_07, 14; руль снизу, сверху планки ──
FIN_X, FIN_CANT = 0.840, 0.3640
FIN_Y0, FIN_Y1 = 0.520, 2.770
F_LE = Lin([(0.350, 11.840), (FIN_Y0, 12.020), (FIN_Y1, 14.000)])
F_TE = Lin([(0.350, 14.500), (FIN_Y0, 14.600), (FIN_Y1, 15.180)])
RUD = (0.700, 2.150)
RUD_C = Track([(0.700, 0.720), (2.150, 0.620)])
def fx(y): return FIN_X + FIN_CANT * (y - FIN_Y0)
def ftc(y): return 0.040 - 0.014 * (y - 0.35) / 2.42


def fin(sx):
    ys = [0.35, 0.52, 0.66, 0.696, 0.70] + [0.70 + (2.15 - 0.70) * i / 7 for i in range(1, 8)] + [2.154, 2.20, 2.35, 2.55, 2.72, 2.77]
    rings = []
    for y in ys:
        c = F_TE(y) - F_LE(y)
        if RUD[0] - 1e-6 <= y <= RUD[1] + 1e-6: ue, tail = cove_cut(F_LE(y), c, ftc(y), F_TE(y) - RUD_C(y), 0.006)
        else: ue, tail = 1.0, cove_wall(F_LE(y), c, ftc(y), 1.0)
        rings.append(foil_ring(F_LE(y), c, ftc(y), 0.0008, ue, 16, lambda a, h: P3(a, sx * (fx(y) + h), y), tail=tail, head=cove_wall_f(F_LE(y), c, ftc(y), 0.0008)))
    b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    # планки на верхней задней части: снаружи ступеньками (fa18_02, 05, 07)
    for i, y in enumerate((2.24, 2.36, 2.48, 2.60)):
        a1 = F_TE(y) + 0.05; a0 = a1 - 0.62 + 0.03 * i; x_ = fx(y); th = 0.022; o = 0.040
        sec = lambda a: [P3(a, sx * (x_ - 0.005), y - th), P3(a, sx * (x_ + ftc(y) * 0.9 * 0 + o), y - th * 0.6), P3(a, sx * (x_ + o), y + th * 0.6), P3(a, sx * (x_ - 0.005), y + th)]
        b.loft([sec(a0), sec(a0 + 0.06), sec(a1 - 0.03), sec(a1)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    # бобышки на внешней стороне
    for y, a_c, l_ in ((1.05, 13.20, 0.34), (1.75, 13.60, 0.30)):
        x_ = fx(y); rg = lambda a, r: [P3(a, sx * (x_ + 0.012 + r * 0.8 * math.cos(2 * math.pi * q / 12)), y + r * math.sin(2 * math.pi * q / 12)) for q in range(12)]
        b.loft([rg(a_c - l_, 0.004), rg(a_c - l_ * 0.6, 0.036), rg(a_c, 0.044), rg(a_c + l_ * 0.6, 0.036), rg(a_c + l_, 0.004)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('fin_' + ('r' if sx > 0 else 'l'), sharp_deg=48)


def rudder(sx):
    name = 'rudder_' + ('r' if sx > 0 else 'l'); y0, y1 = RUD
    h0 = F_TE(y0) - RUD_C(y0); h1 = F_TE(y1) - RUD_C(y1); p0 = P3(h0, sx * fx(y0), y0); p1 = P3(h1, sx * fx(y1), y1); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized()
    rings = []
    for i in range(9):
        y = y0 + 0.016 + (y1 - y0 - 0.032) * i / 8; c = F_TE(y) - F_LE(y); ah = F_TE(y) - RUD_C(y)
        rings.append([v - pivot for v in foil_ring(F_LE(y), c, ftc(y), (ah - F_LE(y)) / c, 1.0, 9, lambda a, h: P3(a, sx * (fx(y) + h), y), head=cove_nose(F_LE(y), c, ftc(y), ah))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-28.0, 28.0), note='ось в центре круглого носа, снизу вверх')
    return ob


# ── сопла: кольцо, пояс механики, лепестки и створки (fa18_06, 08, 12); срез по плоскости a = NOZ_A ──
SKN = 0.855


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


# ── кабина: выемка, одно кресло; фонарь выпуклый, передний козырёк ──
CK_A0, CK_A1 = 3.820, 6.420
CK_HW = Track([(3.82, 0.300), (4.25, 0.440), (4.60, 0.490), (5.00, 0.505), (5.50, 0.505), (5.95, 0.475), (6.30, 0.405), (6.42, 0.350)])   # вырез по раме фонаря: порог закрывает край


def cock_cut():
    def sec(a, y0, y1, hw): return [P3(a, -hw, y0), P3(a, hw, y0), P3(a, hw, y1), P3(a, -hw, y1)]
    st = stations(CK_A0, CK_A1, 0.07)
    return loft_obj('c_cock', [sec(a, 0.12, 1.90, CK_HW(a)) for a in st], G_COCK, sharp=25)


CANOPY = [(3.480, fore_y(3.480, 0.0) + 0.004, 0.280), (3.750, 1.125, 0.390), (4.150, 1.315, 0.470), (4.600, 1.435, 0.515), (5.000, 1.475, 0.530), (5.500, 1.465, 0.530), (5.950, 1.380, 0.500), (6.300, 1.280, 0.430), (6.550, 1.200, 0.300), (6.680, 1.160, 0.190)]
CAN_T = tracks(CANOPY)


def SILL(a): return fore_y(a, CAN_T[1](a))


def can_ring(a, inset=0.0, n=44):
    top, hw = CAN_T[0](a) - inset, CAN_T[1](a) - inset; y0 = SILL(a) + 0.002
    return [P3(a, hw * math.cos(math.pi * k / (n - 1)) ** 0.70 if math.cos(math.pi * k / (n - 1)) >= 0 else -hw * (-math.cos(math.pi * k / (n - 1))) ** 0.70, y0 + (top - y0) * math.sin(math.pi * k / (n - 1)) ** 0.82) for k in range(n)]


CAN_HINGE = (6.720, 1.170)
ARCH_A = 4.560


def glass_shell(name, st):
    b = B(); strip(b, [can_ring(a) for a in st], G_GLASS)
    return b.finish(name, sharp_deg=60)


def frame_arch(b, a, w, inset=0.008, h=0.020, n=44, drop=0.0):
    ri0 = can_ring(a - w, inset, n); ro0 = can_ring(a - w, -h, n); ro1 = can_ring(a + w, -h, n); ri1 = can_ring(a + w, inset, n)
    if drop: ri0 = [p - Vector((0, 0, drop)) for p in ri0]; ri1 = [p - Vector((0, 0, drop)) for p in ri1]     # низ рамы уходит в обшивку: без зазора
    strip(b, [ri0, ro0, ro1, ri1, ri0], G_SKIN)


def canopy():
    a0 = ARCH_A; a1 = 6.63; st = stations(a0 + 0.004, a1, 0.16); pivot = P3(CAN_HINGE[0], 0.0, CAN_HINGE[1])
    gl = glass_shell('canopy_glass', st)
    for v in gl.data.vertices: v.co -= pivot
    gl.location = pivot
    b = B(); frame_arch(b, a0 + 0.030, 0.030, h=0.024)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        st2 = stations(a0, a1, 0.07)
        b.loft([[rail(a, 0.004, 0.014), rail(a, 0.018, 0.012), rail(a, 0.018, 0.030), rail(a, -0.012, 0.046), rail(a, -0.012, 0.024)] for a in st2], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    strip(b, [can_ring(a1 - 0.03, 0.006), can_ring(a1 - 0.03, -0.020), can_ring(a1 + 0.02, -0.020), can_ring(a1 + 0.02, 0.006), can_ring(a1 - 0.03, 0.006)], G_SKIN)
    for sg in (1, -1):
        for a in (4.85, 5.35, 5.85, 6.25):
            y = SILL(a); x = sg * (CAN_T[1](a) - 0.022)
            b.loft([[P3(a, x - 0.009, y + 0.004), P3(a + 0.05, x - 0.009, y + 0.004), P3(a + 0.05, x + 0.009, y + 0.004), P3(a, x + 0.009, y + 0.004)], [P3(a, x - 0.009, y + 0.015), P3(a + 0.05, x - 0.009, y + 0.015), P3(a + 0.05, x + 0.009, y + 0.015), P3(a, x + 0.009, y + 0.015)]], G_METAL, cap0=G_METAL, cap1=G_METAL)
    # зеркала на дуге (fa18_08, 12)
    for x_, y_ in ((0.0, CAN_T[0](ARCH_A) - 0.034), (0.26, CAN_T[0](ARCH_A) - 0.115), (-0.26, CAN_T[0](ARCH_A) - 0.115)):
        A_ = ARCH_A + 0.04
        if x_: strut(b, P3(A_ + 0.01, x_, y_), P3(ARCH_A + 0.02, x_ * 1.03, y_ + 0.05), 0.008, G_METAL)
        b.loft([[P3(A_ + 0.02, x_ - 0.055, y_ - 0.022), P3(A_ + 0.02, x_ + 0.055, y_ - 0.022), P3(A_ + 0.02, x_ + 0.055, y_ + 0.022), P3(A_ + 0.02, x_ - 0.055, y_ + 0.022)], [P3(A_, x_ - 0.055, y_ - 0.022), P3(A_, x_ + 0.055, y_ - 0.022), P3(A_, x_ + 0.055, y_ + 0.022), P3(A_, x_ - 0.055, y_ + 0.022)]], G_COCK, cap0=G_COCK, cap1=G_COCK)
    fr = b.finish('canopy', sharp_deg=45)
    for v in fr.data.vertices: v.co -= pivot
    fr.location = pivot; gl.parent = fr; gl.location = (0, 0, 0)
    PARTS['canopy'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, 40.0), note='петля сзади; плюс - передняя кромка вверх; canopy_glass - дочерний объект')
    return [fr, gl]


def windscreen():
    a1 = ARCH_A - 0.05; st = stations(3.500, a1, 0.08)
    b = B(); strip(b, [can_ring(a) for a in st], G_GLASS); gl = b.finish('screen_glass', sharp_deg=60)
    b2 = B(); frame_arch(b2, ARCH_A - 0.030, 0.028, h=0.022); frame_arch(b2, 3.535, 0.030, inset=0.035, h=0.012, drop=0.07); fr = b2.finish('screen_frame', sharp_deg=45)
    return [gl, fr]


# ── пилоны с наклоном наружу (fa18_05), станция под воздухозаборником; точки для паспорта ──
PYLON_DEF = (('o', 3.500, 9.620, 11.020, -0.430), ('i', 2.250, 9.020, 11.020, -0.480))
CANT = 0.0                                                      # у C без наклона
DUAL_DX = 0.250                                                 # второй держатель на внешнем пилоне: балка поперёк, точки по бокам
PYLON_PTS = {}


def pylon(sx, tag, x, a0, a1, y0):
    b = B(); name = f'pylon_{tag}_' + ('r' if sx > 0 else 'l'); yw = wy(x) - 0.03; hw = 0.058
    def sec(a, f=1.0):
        return [P3(a, sx * x - hw * f, y0), P3(a, sx * x + hw * f, y0), P3(a, sx * x + hw * f * 0.85, yw), P3(a, sx * x - hw * f * 0.85, yw)]
    st = [a0, a0 + 0.12, a0 + 0.42, a1 - 0.50, a1 - 0.12, a1]; fs = [0.10, 0.70, 1.0, 1.0, 0.65, 0.10]
    b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    am = (a0 + a1) / 2
    if tag == 'o':                                              # поперечная балка с двумя держателями (f18c_04, 09, 10)
        sb_ = lambda a, f: [P3(a, sx * x - (DUAL_DX + 0.06) * f, y0 + 0.002), P3(a, sx * x + (DUAL_DX + 0.06) * f, y0 + 0.002), P3(a, sx * x + (DUAL_DX + 0.06) * f, y0 + 0.060), P3(a, sx * x - (DUAL_DX + 0.06) * f, y0 + 0.060)]
        b.loft([sb_(am - 0.52, 0.6), sb_(am - 0.40, 1.0), sb_(am + 0.40, 1.0), sb_(am + 0.52, 0.6)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
        PYLON_PTS['pylon_o1_' + ('r' if sx > 0 else 'l')] = P3(am, sx * (x + DUAL_DX), y0); PYLON_PTS['pylon_o2_' + ('r' if sx > 0 else 'l')] = P3(am, sx * (x - DUAL_DX), y0)
    else: PYLON_PTS[name] = P3(am, sx * x, y0)
    return b.finish(name, sharp_deg=40)


CHEEK = (11.750, 1.080, -0.900)


def cheek(sx):
    """Точка на борту под воздухозаборником: балка на гондоле."""
    am, x, y0 = CHEEK; b = B(); name = 'pylon_c_' + ('r' if sx > 0 else 'l'); yt = -0.640; hl, hw = 0.480, 0.042
    def sec(a, f): return [P3(a, sx * x - hw * f, y0), P3(a, sx * x + hw * f, y0), P3(a, sx * x + hw * f * 1.6, yt), P3(a, sx * x - hw * f * 1.6, yt)]
    st = [am - hl, am - hl + 0.10, am + hl - 0.10, am + hl]; fs = [0.2, 1.0, 1.0, 0.2]
    b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    PYLON_PTS[name] = P3(am, sx * x, y0)
    return b.finish(name, sharp_deg=40)


POD = (8.950, 0.720, -0.930)


def pod_mount():
    """Крепление контейнера на правом борту (f18c_10)."""
    am, x, y0 = POD; b = B(); yt = -0.500; hl, hw = 0.420, 0.055
    def sec(a, f): return [P3(a, x - hw * f, y0), P3(a, x + hw * f, y0), P3(a, x + hw * f * 1.5, yt), P3(a, x - hw * f * 1.5, yt)]
    st = [am - hl, am - hl + 0.12, am + hl - 0.12, am + hl]; fs = [0.2, 1.0, 1.0, 0.2]
    b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    PYLON_PTS['pod'] = P3(am, x, y0)
    return b.finish('pylon_pod', sharp_deg=40)


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


# ── подвижные плиты: интерцепторы на наплыве, гак, штанга дозаправки ──
def speedbrake():
    """Тормозной щиток на спине за кабиной: плита, петля спереди, цилиндр (f18c_02, 04, 08)."""
    a0, a1 = 7.780, 8.980; W = Track([(7.78, 0.27), (8.2, 0.40), (8.8, 0.42), (8.98, 0.36)])
    ob = patch('speedbrake', lambda u, v: (a0 + (a1 - a0) * v, (u - 0.5) * 2 * W(a0 + (a1 - a0) * v)), 12, 12, lift=0.010, th=0.024)
    h = down(0.0, Yb(a0)); pivot = Vector((0.0, Yb(a0), h.z + 0.015)); _rel(ob, pivot)
    PARTS['speedbrake'] = dict(pivot=pivot.copy(), axis=Vector((-1, 0, 0)), range=(0.0, 58.0), note='петля спереди, плюс - задняя кромка вверх')
    h2 = down(0.0, Yb(8.55)); p_top = Vector((0.0, Yb(8.55), h2.z - 0.01)) - pivot; pc0 = P3(8.10, 0.0, h2.z - 0.22)
    b = B(); rg = lambda c, u, v, r: [c + (u * math.cos(2 * math.pi * q / 10) + v * math.sin(2 * math.pi * q / 10)) * r for q in range(10)]
    d = (p_top + pivot - pc0); dd = d.normalized(); U = Vector((1, 0, 0)); V = dd.cross(U).normalized(); pm = pc0 + dd * (d.length * 0.55)
    b.loft([rg(pc0, U, V, 0.042), rg(pm, U, V, 0.042)], G_METAL, cap0=G_METAL, cap1=G_METAL); cyl = b.finish('det_sb_cyl', sharp_deg=45)
    b2 = B(); pe = p_top + pivot; b2.loft([rg(pm - dd * 0.05, U, V, 0.022), rg(pe, U, V, 0.022)], G_METAL, cap0=G_METAL, cap1=G_METAL); rod = b2.finish('det_sb_rod', sharp_deg=45)
    return [ob, cyl, rod]


def lex_fence():
    """Выступ на верхней стороне наплыва (fa18_02, 03): низкое ребро клином."""
    b = B()
    for sx in (1, -1):
        x = 1.02; a0, a1 = 6.55, 7.15
        for a_, h in ((a0, 0.0),):
            pass
        y0 = down(sx * x, Yb(a0)).z; y1 = down(sx * x, Yb(a1)).z
        pl = [P3(a0, sx * x, y0 - 0.02), P3(a1, sx * x, y1 - 0.02), P3(a1, sx * x, y1 + 0.075), P3(a1 - 0.10, sx * x, y1 + 0.085)]
        b.loft([[p + Vector((0.010, 0, 0)) for p in pl], [p + Vector((-0.010, 0, 0)) for p in pl]], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('s_fence', sharp_deg=40)


def hook():
    """Гак: балка между соплами, шарнир спереди, опускается (fa18_06)."""
    a0, a1 = 14.00, 16.50; y0 = -0.40; pivot = P3(a0, 0.0, y0 + 0.02); b = B()
    def sec(a, h, w): return [P3(a, -w, y0 - h), P3(a, w, y0 - h), P3(a, w, y0 + h), P3(a, -w, y0 + h)]
    # балка повторяет низ киля: сзади выше
    yy = Track([(14.00, -0.415), (14.8, -0.385), (15.8, -0.290), (16.50, -0.180)])
    rg = lambda a, r: [P3(a, r * math.cos(2 * math.pi * q / 10), yy(a) + r * math.sin(2 * math.pi * q / 10)) - pivot for q in range(10)]
    b.loft([rg(a0, 0.035), rg(a0 + 0.2, 0.042), rg(15.4, 0.030), rg(15.8, 0.018), rg(16.23, 0.016)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    # лапа гака
    p = P3(16.23, 0.0, yy(16.23)) - pivot; q = P3(16.50, 0.0, yy(16.50) - 0.05) - pivot; strut(b, p, q, 0.016, G_METAL); strut(b, q, q + Vector((0, 0.08, -0.03)), 0.018, G_METAL)
    # амортизатор и кронштейн в середине (fa18_06)
    m = P3(15.1, 0.0, yy(15.1)) - pivot; strut(b, m + Vector((0.05, 0, 0)), m + Vector((0.05, 0.42, 0.02)), 0.018, G_METAL)
    ob = b.finish('hook', sharp_deg=40); ob.location = pivot
    PARTS['hook'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(-30.0, 0.0), note='0 - убран; минус - лапа вниз')
    return ob


PROBE = dict(a0=2.42, a1=3.02, x0=0.15, x1=0.33, ytop=1.20, ybot=0.36)


def probe_cut():
    P = PROBE; rings = [[P3(a, P['x0'], P['ybot']), P3(a, P['x1'], P['ybot']), P3(a, P['x1'], P['ytop']), P3(a, P['x0'], P['ytop'])] for a in (P['a0'], P['a1'])]
    return loft_obj('c_probe', rings, G_DARK, sharp=20)


def probe():
    """Штанга дозаправки: в нише справа от носа, шарнир сзади, конец поднимается наружу (fa18_01, 02, 03)."""
    x = 0.240; y = 0.470; a_h = 2.990; L_ = 0.540; b = B(); n = 12; pivot = P3(a_h, x, y)
    pts = [(0.0, 0.040), (0.30, 0.036), (L_ - 0.12, 0.032), (L_ - 0.08, 0.050), (L_ - 0.02, 0.040), (L_, 0.012)]
    rg = lambda d, r: [P3(a_h - d, x + r * math.cos(2 * math.pi * q / n), y + r * math.sin(2 * math.pi * q / n)) - pivot for q in range(n)]
    b.loft([rg(d, r) for d, r in pts], G_METAL, cap0=G_METAL, cap1=G_METAL)
    ob = b.finish('probe', sharp_deg=40); ob.location = pivot
    PARTS['probe'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, 32.0), note='шарнир сзади в нише справа; 0 - убрана; плюс - конец вверх и вперёд')
    return ob


def probe_door():
    """Крышка люка штанги: плита по обшивке, шарнир по внешней кромке."""
    P = PROBE; a0, a1, x0, x1 = P['a0'], P['a1'], P['x0'], P['x1']
    ob = patch('probe_door', lambda u, v: (a0 + (a1 - a0) * v, x0 + (x1 - x0) * u), 6, 8, lift=0.0006, th=0.004)
    p0 = down(x1, Yb(a0)); p1 = down(x1, Yb(a1)); pivot = (p0 + p1) / 2; axis = (p0 - p1).normalized()     # плюс - наружу
    _rel(ob, pivot)
    PARTS['probe_door'] = dict(pivot=pivot.copy(), axis=axis, range=(0.0, 110.0), note='крышка люка штанги; открывается наружу')
    return ob


# ── шасси: размеры ──
GROUND_Y = -1.860
NG = dict(a=5.420, hinge=(5.620, -0.300), rw=0.260, ww=0.145, track=0.185)
MG_A, MG_X = 10.360, 1.550
MAIN_T = (11.300, 1.240, -0.560)                                 # шарнир стойки: a, x, y


def _quiet(*a, **k): pass


def doors():
    out = []
    a0, a1, hw = 4.80, 6.42, 0.215
    for sx in (1, -1):
        n_ = 'door_n_' + ('r' if sx > 0 else 'l')
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * hw * u), 6, 8, dirn=1, lift=0.004, th=0.018, z0=-3.0)
        pivot = P3((a0 + a1) / 2, sx * hw, down(sx * hw, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z - 0.005); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(-80.0 * sx, 0.0) if sx > 0 else (0.0, 80.0), note='0 - закрыта, открытие наружу на 80°')
        out.append(ob)
    for sx in (1, -1):
        n_ = 'door_m_' + ('r' if sx > 0 else 'l'); a0, a1, x0, x1 = 9.75, 10.98, 0.80, 1.28
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + (x1 - x0) * u)), 8, 8, dirn=1, lift=0.004, th=0.020, z0=-3.0)
        pivot = P3((a0 + a1) / 2, sx * x0, down(sx * x0, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z - 0.005); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(0.0, 85.0) if sx > 0 else (-85.0, 0.0), note='0 - закрыта, ось у внутренней кромки')
        out.append(ob)
    return out


def build_skin():
    ib = [inlet_box(1), inlet_box(-1)]
    for o, sx in zip(ib, (1, -1)):
        c = lip_cut(sx); _apply_bool(o, c, 'DIFFERENCE'); _drop(c)
    S = [fore(), mid(), lex(), nacelle(1), nacelle(-1), keel(), ib[0], ib[1], splitter(1), splitter(-1), duct_sleeve(1), duct_sleeve(-1), wing_s(1), wing_s(-1), stab_boss(1), stab_boss(-1)]
    host = S[0]
    for o in S[1:]:
        _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        c = duct_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _duct_mat(host, c); _drop(c)
        c = bore_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = cock_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'F18C_skin'; host.data.name = 'F18C_skin'
    bvh_ready(host)
    return host


def plane(stage=9, carve=True):
    """Этапы: 1 - обшивка с крыльями; 2 - рули, оперение, сопла, консоли; 3 - кабина, фонарь, плиты, пилоны; 4 - шасси и створки."""
    import f18c_detail as d
    PARTS.clear(); PYLON_PTS.clear()
    skin = build_skin(); out = [skin]
    ref_me = skin.data.copy(); d.resharp(types.SimpleNamespace(data=ref_me))   # гладкая обшивка до резки
    if stage >= 2:
        out += [fin(1), fin(-1), rudder(1), rudder(-1), stab(1), stab(-1), nozzle(1), nozzle(-1), fan(1), fan(-1), d.burner(1), d.burner(-1)]
        out += [fold(1), fold(-1), slat(1), slat(-1)]
        out += [wing_part('flap_' + n, FLAP, s, LE_I, TE_I, HINGE_I, 'ось в центре круглого носа; плюс - вниз', (0.0, 40.0)) for s, n in ((1, 'r'), (-1, 'l'))]
        out += [wing_part('aileron_' + n, AIL, s, LE_O, TE_O, HINGE_O, 'ось в центре круглого носа; плюс - вниз', (-30.0, 45.0)) for s, n in ((1, 'r'), (-1, 'l'))]
    if stage >= 3:
        out += [d.cockpit_detail()]
        out += canopy() + windscreen()
        out += speedbrake() + [lex_fence(), hook(), probe(), probe_door()]
        c = probe_cut(); _apply_bool(skin, c, 'DIFFERENCE'); _drop(c); bvh_ready(skin)
        for sx in (1, -1):
            for tag, x, a0, a1, y0 in PYLON_DEF: out.append(pylon(sx, tag, x, a0, a1, y0))
            out.append(cheek(sx))
        out += [pod_mount(), d.details(), d.hinges(), d.seals()] + d.hardpoints() + [d.plates()]
    if stage >= 4:
        out += doors()
        import f18c_gear as gr; out += gr.gear_nose() + gr.gear_main(1) + gr.gear_main(-1)
    if carve:
        print('канавок и выемок:', d.carve(skin))
    if stage >= 4: d.bays(skin)
    d.resharp(skin); print('нормали обшивки:', d.smooth_normals(skin, ref_me)); bpy.data.meshes.remove(ref_me)
    return out
