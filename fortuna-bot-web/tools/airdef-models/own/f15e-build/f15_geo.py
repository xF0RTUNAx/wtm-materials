# f15_geo.py - геометрия F-15E для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z (в glTF: нос -Z, правое крыло +X, верх +Y). Начало - середина длины 19,43 м по оси сопел.
# a - расстояние от острия носа, y - высота над осью сопел. Вид сбоку снят с фото 10 (0,01842 м/пикс. по длине), остальное - фото 01-03 и рендеры 04-09 только как образец формы; ни сетка, ни текстуры чужой модели не используются.
# Сетка: замкнутые оболочки объединяются булевой операцией в одну обшивку без внутренних стенок; кили, стабилизаторы, рули - отдельные детали с толщиной.
import math
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 19.43
G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK = 0, 1, 2, 3, 4, 5     # обшивка; титан и механика; нутро; стекло; резина; кабина
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


# ── носовая часть и спина: от острия до задней кромки тормозного щитка ──
FORE = [  # a, верх, низ, полуширина, nверх, nниз
    (0.000, 0.012, -0.012, 0.012, 2.0, 2.0), (0.120, 0.075, -0.052, 0.058, 2.0, 2.0), (0.400, 0.205, -0.098, 0.138, 2.0, 2.0), (0.800, 0.355, -0.150, 0.250, 2.0, 2.0), (1.230, 0.510, -0.195, 0.360, 2.0, 2.0),
    (1.800, 0.690, -0.245, 0.480, 2.0, 2.1), (2.390, 0.840, -0.280, 0.565, 2.05, 2.2), (3.170, 1.090, -0.320, 0.640, 2.15, 2.4), (3.700, 1.280, -0.340, 0.680, 2.3, 2.5), (4.400, 1.420, -0.360, 0.725, 2.5, 2.6), (5.400, 1.480, -0.380, 0.760, 2.5, 2.8), (6.900, 1.470, -0.400, 0.770, 2.4, 3.0), (8.000, 1.290, -0.410, 0.740, 2.4, 3.0), (8.560, 1.190, -0.410, 0.700, 2.5, 3.0), (9.700, 1.050, -0.410, 0.610, 3.0, 3.0), (11.300, 0.990, -0.300, 0.580, 3.2, 3.0), (12.200, 0.950, -0.100, 0.540, 3.2, 2.6), (12.900, 0.780, 0.200, 0.300, 2.6, 2.2)]


def fore_y(a, x):
    """Высота верхней поверхности носовой части над |x|: для порога фонаря."""
    top, bot, hw, nt = FT[0](a), FT[1](a), FT[2](a), FT[3](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (abs(x) / hw) ** nt)
    return cy + ht * q ** (1 / nt)


FT = tracks(FORE)


def fore():
    T = FT
    st = [0.0, 0.03, 0.07, 0.12, 0.2] + stations(0.3, 3.2, 0.10)[0:] + stations(3.3, 12.9, 0.20)
    return loft_obj('s_fore', [sup(a, 0.0, *[t(a) for t in T], 72) for a in st])


# ── средняя часть: короб воздушных каналов и моторный отсек ──
MID = [(8.560, 0.860, -0.760, 1.430, 7.0, 4.0), (9.500, 0.890, -0.860, 1.560, 7.0, 4.0), (11.000, 0.890, -0.860, 1.720, 7.0, 4.0), (12.500, 0.830, -0.800, 1.820, 7.0, 4.0), (14.500, 0.740, -0.620, 1.880, 7.0, 3.6), (15.600, 0.640, -0.480, 1.840, 6.0, 3.4), (16.300, 0.520, -0.380, 1.790, 6.0, 3.2), (17.050, 0.420, -0.180, 1.700, 5.0, 3.0)]


def mid():
    T = tracks(MID)
    return loft_obj('s_mid', [sup(a, 0.0, *[t(a) for t in T], 96) for a in stations(8.56, 17.05, 0.25)])


# ── мотогондолы: снаружи гладкие, сзади труба уходит внутрь (сопло полое); срез трубы поверхности перпендикулярен оси ──
NOZ_X, NOZ_Y, NOZ_A, NOZ_R = 0.690, 0.000, 18.350, 0.480       # центр и радиус среза створок сопла
NAC_A1 = 17.420                                                 # конец гладкой гондолы: дальше кольцо и створки
NAC = [(10.800, 0.040, 0.420), (11.500, 0.110, 0.590), (12.300, 0.200, 0.660), (14.500, 0.205, 0.665), (16.200, 0.110, 0.635), (16.900, 0.045, 0.600), (17.420, 0.012, 0.565)]


def nacelle(sx):
    Tc, Tr = tracks(NAC); n = 56
    def ring(a, r=None, cy=None, nn=n):
        cy = Tc(a) if cy is None else cy; r = Tr(a) if r is None else r
        return [P3(a, sx * NOZ_X + r * math.sin(2 * math.pi * k / nn), cy - r * math.cos(2 * math.pi * k / nn)) for k in range(nn)]
    rings = [ring(a) for a in stations(10.8, NAC_A1, 0.20)]
    # торец гондолы; труба сопла режется из готового корпуса (bore_cut), иначе средняя часть перекрыла бы её
    a1 = NAC_A1
    rings += [ring(a1 + 0.008, 0.545, 0.008), ring(a1 + 0.012, 0.500, 0.006)]
    return loft_obj('s_nac_' + ('r' if sx > 0 else 'l'), rings, G_SKIN, sharp=40)


def bore_cut(sx):
    """Режущая труба сопла от среза гондолы вглубь: кольцо форсажной камеры, тёмный конец. Материал стенок берётся от резака."""
    a1 = NAC_A1; cx = sx * NOZ_X; n = 56
    ring = lambda a, r: [P3(a, cx + r * math.sin(2 * math.pi * k / n), NOZ_Y - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    prof = [(a1 + 0.25, 0.470, G_METAL), (a1 - 0.18, 0.470, G_METAL), (a1 - 0.22, 0.440, G_METAL), (a1 - 0.30, 0.440, G_METAL), (a1 - 0.34, 0.470, G_METAL), (a1 - 0.80, 0.475, G_COCK), (a1 - 1.10, 0.475, G_DARK), (a1 - 1.50, 0.300, G_DARK), (a1 - 1.62, 0.040, G_DARK)]
    b = B(); b.loft([ring(a, r) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK)
    return b.finish('c_bore', sharp_deg=30)


# ── балки хвоста под килями и стабилизаторами (фото 03, рендер 09) ──
BOOM_X = 1.620
BOOM = [(13.500, 0.540, -0.380, 0.360), (15.000, 0.560, -0.360, 0.360), (16.400, 0.560, -0.280, 0.320), (17.300, 0.550, -0.060, 0.230), (18.100, 0.530, 0.180, 0.135), (18.800, 0.500, 0.330, 0.070), (19.180, 0.460, 0.400, 0.020)]


def boom(sx):
    T = tracks(BOOM)
    return loft_obj('s_boom_' + ('r' if sx > 0 else 'l'), [sup(a, sx * BOOM_X, T[0](a), T[1](a), T[2](a), 2.6, 2.2, 32) for a in stations(13.5, 19.18, 0.20)])


# ── конформные баки: длинные коробы снаружи-снизу каналов (фото 10, рендеры 07, 08) ──
CFT_CX = Track([(7.100, 1.660), (7.330, 1.650), (7.550, 1.640), (8.000, 1.640), (8.540, 1.680), (8.650, 1.640), (9.100, 1.600), (9.900, 1.620), (13.300, 1.640), (15.000, 1.640), (17.300, 1.620)])
CFT = [(7.100, 0.310, 0.290, 0.012, 2.0, 2.0), (7.130, 0.420, 0.180, 0.034, 2.0, 2.0), (7.200, 0.560, 0.040, 0.060, 2.0, 2.0), (7.330, 0.650, -0.120, 0.090, 2.1, 2.1), (7.550, 0.695, -0.330, 0.130, 2.4, 2.4), (8.000, 0.715, -0.560, 0.170, 2.8, 2.8), (8.540, 0.712, -0.720, 0.240, 3.0, 3.2), (8.650, 0.710, -0.760, 0.340, 3.0, 3.2), (9.100, 0.700, -0.840, 0.490, 3.2, 3.3), (9.900, 0.690, -0.880, 0.520, 3.2, 3.4), (11.000, 0.680, -0.900, 0.580, 3.4, 3.4), (13.300, 0.640, -0.880, 0.580, 3.4, 3.4), (15.000, 0.560, -0.760, 0.420, 3.0, 3.0), (16.300, 0.480, -0.520, 0.320, 2.6, 2.6), (17.300, 0.380, -0.140, 0.160, 2.2, 2.2)]
CFT_BOT = Track([(r[0], r[2]) for r in CFT])


def cft(sx):
    T = tracks(CFT)
    return loft_obj('s_cft_' + ('r' if sx > 0 else 'l'), [sup(a, sx * CFT_CX(a), *[t(a) for t in T], 48) for a in [7.10, 7.115, 7.13, 7.165, 7.20, 7.26, 7.33, 7.43, 7.55, 7.75, 8.0, 8.25, 8.54, 8.65, 8.85] + stations(9.1, 17.3, 0.25)])


# ── крылья и оперение: сетка поперечных рядов, верх и низ отдельными поверхностями ──
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


WING_Y0, WING_DY = 0.760, -0.038                                # высота хорды у корня и наклон на метр размаха (лёгкое обратное V)
A_LE = Track([(1.100, 8.520), (2.100, 9.520), (6.420, 13.960), (6.525, 14.100)])
A_TE = Track([(1.100, 15.350), (2.000, 15.350), (5.620, 15.550), (5.700, 15.430), (6.525, 14.400)])
TC = Track([(1.100, 0.052), (6.525, 0.028)])
GAP = 0.020                                                     # щель между крылом или килём и секцией управления
FLAP = (2.100, 3.880, 1.000)                                    # от x, до x, хорда (фото 03)
AIL = (3.960, 5.540, 0.750)


def wy(x): return WING_Y0 + WING_DY * (x - 1.9) - 0.30 * max(0.0, 1.75 - x)     # внутри корпуса корень ныряет под обшивку: на виде сверху нет ступеньки


def wing_rings(sx):
    xs = [1.10, 1.50, 1.80, 2.00, 2.08, 2.10] + [2.10 + (3.88 - 2.10) * i / 7 for i in range(1, 8)] + [3.90, 3.94, 3.96] + [3.96 + (5.54 - 3.96) * i / 7 for i in range(1, 8)] + [5.56, 5.60, 5.62, 5.70, 5.82, 5.95, 6.10, 6.25, 6.40, 6.525]
    rings = []
    for i, x in enumerate(xs):
        c = A_TE(x) - A_LE(x); ue = 1.0
        if FLAP[0] <= x <= FLAP[1]: ue = 1 - FLAP[2] / c
        if AIL[0] <= x <= AIL[1]: ue = 1 - AIL[2] / c
        rings.append(foil_ring(A_LE(x), c, TC(x), 0.0, ue, 18, lambda a, h: P3(a, sx * x, wy(x) + h)))
    return rings


def wing_s(sx):
    return loft_obj('s_wing_' + ('r' if sx > 0 else 'l'), wing_rings(sx), sharp=48)


def surface(name, x0, x1, n, chord_d, sx, y_of, mat=G_SKIN):
    """Зализанная секция задней кромки (закрылок, элерон): замкнутый кусок той же дужки."""
    rings = []
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n; c = A_TE(x) - A_LE(x); us = 1 - chord_d / c + GAP / c
        rings.append(foil_ring(A_LE(x), c, TC(x), us, 1.0, 9, lambda a, h: P3(a, sx * x, y_of(x) + h), nose=0.11))
    return rings


def wing_part(name, spec, sx, axis_note, rng):
    x0, x1, cd = spec; x0 += 0.025; x1 -= 0.025; xm = (x0 + x1) / 2
    pv0 = P3(A_TE(x0) - cd + GAP + 0.04, sx * x0, wy(x0)); pv1 = P3(A_TE(x1) - cd + GAP + 0.04, sx * x1, wy(x1)); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis                                 # ось к +X: плюс - задняя кромка вниз (у обоих крыльев)
    rings = [[v - pivot for v in r] for r in surface(name, x0, x1, 6, cd, sx, wy)]
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=rng, note=axis_note)
    return ob


# стабилизатор цельноповоротный: ось поперёк по корню, зуб на передней кромке (фото 03, рендер 06)
STAB_Y, STAB_DY = 0.465, -0.012
STAB_A = 18.000; STAB_X0 = 1.950
S_LE = Track([(1.950, 16.620), (2.620, 17.300), (2.660, 17.120), (3.950, 18.440), (4.120, 18.700), (4.200, 18.950)])
S_TE = Track([(1.950, 19.300), (3.200, 19.430), (3.950, 19.400), (4.200, 19.180)])


def boom_out(a_):
    """Наружная кромка балки хвоста, x (фото 03): по ней идёт внутренняя кромка стабилизатора."""
    return BOOM_X + tracks(BOOM)[2](min(max(a_, 13.5), 19.18))


STAB_GAP = 0.025


def stab(sx):
    """Цельноповоротный: внутренняя кромка повторяет балку с зазором, в зазор входит ось (рендер 09, фото 03). Концы консолей и передняя кромка по виду сверху."""
    name = 'stab_' + ('r' if sx > 0 else 'l'); pivot = P3(STAB_A, sx * STAB_X0, STAB_Y)
    xs = [1.95, 2.10, 2.26, 2.46, 2.62, 2.66] + [2.66 + (4.20 - 2.66) * i / 10 for i in range(1, 11)]
    XT = 4.20
    def warp(a_, xn):
        xi = max(boom_out(a_), 1.70) + STAB_GAP; return xi + (xn - 1.95) / (XT - 1.95) * (XT - xi)
    rings = []
    for x in xs:
        c = S_TE(x) - S_LE(x)
        def place(a_, h, x=x):
            xw = warp(a_, x); return P3(a_, sx * xw, STAB_Y + STAB_DY * (xw - 1.95) + h)
        rings.append([v - pivot for v in foil_ring(S_LE(x), c, 0.042, 0.0, 1.0, 22, place)])
    b = B(); r0 = rings[0]; nr = len(r0); inner = [(r0[k] + r0[nr - 1 - k]) / 2 for k in range(nr)]     # внутреннее кольцо: стянуто к средней линии профиля
    b.loft([inner] + rings, G_SKIN, cap1=G_SKIN)
    # ось: выходит из корня к бобышке на балке
    xr = boom_out(STAB_A) + STAB_GAP
    n = 14; rg = lambda x_, r: [P3(STAB_A + r * math.cos(2 * math.pi * k / n), sx * x_, STAB_Y + r * math.sin(2 * math.pi * k / n)) - pivot for k in range(n)]
    b.loft([rg(xr - 0.008, 0.055), rg(xr + 0.03, 0.055)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    ob = b.finish(name, sharp_deg=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(-25.0, 25.0), note='ось поперёк по корню; плюс - носок вверх')
    return ob


def stab_boss(sx):
    """Бобышка оси на балке: неподвижная, стабилизатор поворачивается перед её торцом."""
    x0 = boom_out(STAB_A) - 0.05; x1 = boom_out(STAB_A) + 0.006; n = 20
    rg = lambda x_, r: [P3(STAB_A + r * 1.1 * math.cos(2 * math.pi * k / n), sx * x_, STAB_Y - 0.02 + r * math.sin(2 * math.pi * k / n)) for k in range(n)]
    return loft_obj('s_boss_' + ('r' if sx > 0 else 'l'), [rg(x0, 0.10), rg(x1 - 0.004, 0.095), rg(x1, 0.08)], G_SKIN, sharp=40)


# киль: толщина, сверху обтекатель-лезвие (фото 10), руль направления отдельно
FIN_X, FIN_CANT = 1.620, 0.035                                  # у корня; наклон наружу на метр высоты
FIN_Y0, FIN_Y1 = 0.560, 3.700
F_LE = Track([(FIN_Y0, 14.000), (FIN_Y1, 16.300)])
F_TE = Track([(FIN_Y0, 17.400), (FIN_Y1, 17.150)])
RUD = (1.150, 3.000, 0.560)                                     # низ, верх (высота над осью), хорда


def fx(y): return FIN_X + FIN_CANT * (y - FIN_Y0)


def fin(sx):
    ys = [0.40, 0.56, 0.80, 1.00, 1.13, 1.15] + [1.15 + (3.0 - 1.15) * i / 8 for i in range(1, 9)] + [3.02, 3.20, 3.40, 3.55, 3.70]
    rings = []
    for y in ys:
        c = F_TE(y) - F_LE(y); ue = 1 - RUD[2] / c if RUD[0] <= y <= RUD[1] else 1.0; tc = 0.050 - 0.020 * (y - 0.4) / 3.42
        rings.append(foil_ring(F_LE(y), c, tc, 0.0, ue, 16, lambda a, h: P3(a, sx * (fx(y) + h), y)))
    b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    # концевой контейнер: на левом киле толстый (РЭБ), на правом узкий (фото 10); рендеры 04, 06
    if sx < 0:
        yc = FIN_Y1 - 0.012; kx, ky = 1.0, 1.0; bl = [(16.080, 0.006), (16.150, 0.042), (16.340, 0.070), (16.900, 0.078), (17.340, 0.070), (17.500, 0.044), (17.560, 0.006)]
    else:
        yc = FIN_Y1 + 0.012; kx, ky = 0.70, 0.85; bl = [(16.080, 0.006), (16.220, 0.032), (16.420, 0.050), (16.900, 0.055), (17.280, 0.048), (17.550, 0.012)]
    rg = lambda a, r: [P3(a, sx * (fx(FIN_Y1) + r * kx * math.cos(2 * math.pi * k / 16)), yc + r * ky * math.sin(2 * math.pi * k / 16)) for k in range(16)]
    b.loft([rg(a, r) for a, r in bl], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('fin_' + ('r' if sx > 0 else 'l'), sharp_deg=48)


def rudder(sx):
    name = 'rudder_' + ('r' if sx > 0 else 'l'); y0, y1, cd = RUD
    p0 = P3(F_TE(y0) - cd + GAP + 0.03, sx * fx(y0), y0); p1 = P3(F_TE(y1) - cd + GAP + 0.03, sx * fx(y1), y1); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized()
    rings = []
    for i in range(9):
        y = y0 + 0.012 + (y1 - y0 - 0.024) * i / 8; c = F_TE(y) - F_LE(y); tc = 0.050 - 0.020 * (y - 0.4) / 3.42
        rings.append([v - pivot for v in foil_ring(F_LE(y), c, tc, 1 - (cd - GAP) / c, 1.0, 9, lambda a, h: P3(a, sx * (fx(y) + h), y), nose=0.10)])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-30.0, 30.0), note='ось по передней кромке руля, снизу вверх')
    return ob


# ── воздухозаборник: поворотная носовая часть (полая), канал в коробе ──
INL_HINGE_A = 8.540
FAN_X, FAN_Y = 1.000, 0.150
CAP = [(4.900, 0.840, 1.600, 0.330, -0.700), (5.450, 0.840, 1.600, 0.440, -0.700), (7.000, 0.840, 1.600, 0.700, -0.700), (7.600, 0.840, 1.490, 0.780, -0.720), (8.000, 0.840, 1.450, 0.820, -0.730), (8.540, 0.840, 1.420, 0.860, -0.760)]
CAP_T = tracks(CAP)


def _inl_sec(a, sx, inset):
    x0, x1, top, bot = [t(a) for t in CAP_T]; x0 += inset; x1 -= inset
    return rrect(a, sx * (x0 + x1) / 2, top - inset, bot + inset, (x1 - x0) / 2, 0.045 if inset == 0 else 0.03, 60)


LIP = [(0.900, 5.150), (0.440, 5.450), (-0.070, 7.620), (-0.450, 8.020), (-0.900, 8.120)]     # кромка в профиле: высота, a (вид сбоку фото 10 + низ вид сверху: верхняя плита впереди, нижняя губа сзади)
LIP_K = 0.0                                                     # в плане кромка поперёк оси (вид сверху из фото 03)


def inlet(sx):
    """Полая поворотная часть с косым срезом: наружная стенка, верхняя плита-клин, нижняя кромка; срез - булева разность по плоскости кромки."""
    name = 'inlet_' + ('r' if sx > 0 else 'l'); w = 0.050
    ax = [8.520, 8.100, 7.700, 7.300, 6.900, 6.500, 6.100, 5.700, 5.300, 5.000]
    def rear_rake(ring):                                        # задняя кромка внизу отступает: при поднятии носка низ не входит в короб
        return [Vector((v.x, Yb(8.520 - 0.05 - 0.11 * (0.86 - v.z) / 1.56), v.z)) for v in ring]
    rings = [rear_rake(_inl_sec(ax[0], sx, 0.0))] + [_inl_sec(a, sx, 0.0) for a in ax[1:]] + [_inl_sec(a, sx, w) for a in reversed(ax[1:])] + [rear_rake(_inl_sec(ax[0], sx, w))]
    n_o = len(ax)
    mats = [G_SKIN] * (n_o - 1) + [G_SKIN] + [G_COCK] * (n_o - 1)
    b = B(); b.loft(rings + [rings[0]], mats + [G_SKIN])
    bmesh.ops.remove_doubles(b.bm, verts=b.bm.verts[:], dist=1e-5)
    ob = b.finish(name, sharp_deg=46)
    # косой срез: режем всё, что впереди кромки
    xs = [0.70, 1.75]; cutr = []
    for x in xs:
        d = LIP_K * (x - 0.84)
        front = [(a + d, y) for y, a in LIP]
        ring = [(a_, y_) for a_, y_ in front] + [(3.0, -0.90), (3.0, 0.90)]
        cutr.append([P3(a_, sx * x, y_) for a_, y_ in ring])
    c = loft_obj('c_lip', cutr, G_SKIN); _apply_bool(ob, c, 'DIFFERENCE'); _drop(c)
    pivot = P3(INL_HINGE_A - 0.02, sx * 1.220, 0.200)
    for v in ob.data.vertices: v.co -= pivot
    ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((-1, 0, 0)), range=(-4.0, 11.0), note='поперечная ось в задней части на середине высоты; плюс - передняя кромка вниз')
    return ob


def diverter(sx):
    """Клин слива пограничного слоя между борт-обшивкой и коробом: закрывает зазор сзади, поворотной части не мешает (x < 0.832)."""
    def sec(a, x0, x1, y0, y1): return [P3(a, sx * x0, y0), P3(a, sx * x1, y0), P3(a, sx * x1, y1), P3(a, sx * x0, y1)]
    return loft_obj('s_div_' + ('r' if sx > 0 else 'l'), [sec(7.75, 0.60, 0.70, -0.42, 0.62), sec(8.20, 0.60, 0.800, -0.62, 0.72), sec(8.60, 0.60, 0.832, -0.74, 0.80)], G_SKIN, sharp=30)


def inlet_collar(sx):
    """Неподвижный обод вокруг задней части поворотного короба: закрывает щель шарнира и подрез снизу; короб ходит внутри него."""
    def sec(a, gx, gt, gb):
        x0, x1, top, bot = [t(a) for t in CAP_T]; x0 -= gx; x1 += gx
        return rrect(a, sx * (x0 + x1) / 2, top + gt, bot - gb, (x1 - x0) / 2, 0.05, 60)
    a0, a1 = 8.30, 8.60; rs = [sec(a0, 0.030, 0.042, 0.075), sec(a1, 0.030, 0.042, 0.075), sec(a1, 0.012, 0.024, 0.055), sec(a0, 0.012, 0.024, 0.055)]
    b = B(); b.loft(rs + [rs[0]], G_SKIN); bmesh.ops.remove_doubles(b.bm, verts=b.bm.verts[:], dist=1e-6)
    return b.finish('s_collar_' + ('r' if sx > 0 else 'l'), sharp_deg=30)


def duct_cut(sx):
    """Режущий канал в коробе: от оси поворота до лица двигателя, сечение плавно становится кругом."""
    a0, a1 = 8.40, 10.700; rings = []
    for i in range(10):
        a = a0 + (a1 - a0) * i / 9; t = _sm(i / 9)
        r1 = _inl_sec(a, sx, 0.095)
        cx = sx * FAN_X; cy = FAN_Y; rr = 0.480
        r2 = [P3(a, cx + rr * math.sin(2 * math.pi * k / 48), cy - rr * math.cos(2 * math.pi * k / 48)) for k in range(48)]
        rings.append([p.lerp(q, t) for p, q in zip(r1, r2)])
    return loft_obj('c_duct_' + ('r' if sx > 0 else 'l'), rings, G_COCK)


def _sm(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)


def fan(sx):
    """Лицо двигателя: обтекатель и лопатки (рендер 07), тёмное."""
    b = B(); a0 = 10.68; c = P3(a0, sx * FAN_X, FAN_Y); F = Vector((0, 1, 0)); X, Z = Vector((1, 0, 0)), Vector((0, 0, 1)); n = 16
    rg = lambda r, d: [c + (X * math.cos(2 * math.pi * k / n) + Z * math.sin(2 * math.pi * k / n)) * r + F * d for k in range(n)]
    b.loft([rg(0.480, -0.02), rg(0.480, 0.0), rg(0.150, 0.0), rg(0.150, 0.030), rg(0.100, 0.130), rg(0.012, 0.200)], G_COCK, cap1=G_COCK)
    for j in range(22):
        ang = 2 * math.pi * j / 22; u = X * math.cos(ang) + Z * math.sin(ang); v = X * -math.sin(ang) + Z * math.cos(ang)
        b.loft([[c + u * 0.150 + v * 0.040 + F * 0.012, c + u * 0.150 - v * 0.040 + F * 0.048, c + u * 0.150 - v * 0.040 + F * 0.052, c + u * 0.150 + v * 0.040 + F * 0.016], [c + u * 0.470 + v * 0.052 + F * 0.012, c + u * 0.470 - v * 0.052 + F * 0.048, c + u * 0.470 - v * 0.052 + F * 0.052, c + u * 0.470 + v * 0.052 + F * 0.016]], G_METAL)
    return b.finish('fan_' + ('r' if sx > 0 else 'l'), sharp_deg=30)


# ── сопла: кольцо и створки с тягами снаружи (рендер 09, фото 03), срез перпендикулярен оси ──
def nozzle(sx):
    """Сопло: силовое кольцо, пояс механики (обручи, кронштейны, тяги), 16 наружных лепестков внахлёст, 16 внутренних створок до горла (рендер 09, фото 03). Срез ровно по плоскости a = NOZ_A."""
    b = B(); cx = sx * NOZ_X; N = 16; a0 = NAC_A1 + 0.002; a1 = NOZ_A; aM = a0 + 0.145; aP = a0 + 0.40
    def ptp(a, r, ang): return P3(a, cx + r * math.sin(ang), NOZ_Y - r * math.cos(ang))
    ring = lambda a, r, nn=56: [ptp(a, r, 2 * math.pi * k / nn) for k in range(nn)]
    def box_sect(a, r, ang, hw_ang, th): return [ptp(a, r, ang - hw_ang), ptp(a, r, ang + hw_ang), ptp(a, r + th, ang + hw_ang), ptp(a, r + th, ang - hw_ang)]
    sec = [ring(a0 - 0.02, 0.555), ring(a0 + 0.015, 0.585), ring(a0 + 0.12, 0.585), ring(aM, 0.560), ring(aM, 0.515), ring(a0 - 0.02, 0.500)]
    b.loft(sec + [sec[0]], G_METAL)
    b.loft([ring(aM - 0.01, 0.512), ring(aP + 0.06, 0.502)], G_DARK)   # сердечник механики
    for a_h, r_h in ((a0 + 0.235, 0.532), (a0 + 0.335, 0.536)):        # два обруча
        rh = [ring(a_h - 0.011, r_h), ring(a_h + 0.011, r_h), ring(a_h + 0.011, r_h + 0.016), ring(a_h - 0.011, r_h + 0.016)]
        b.loft(rh + [rh[0]], G_METAL)
    Rp = lambda a: 0.552 + (NOZ_R - 0.552) * (a - aP) / (a1 - aP)
    hwo = math.pi / N * 1.03; th = 0.014
    for j in range(N):
        am = 2 * math.pi * j / N
        # наружный лепесток внахлёст: одна кромка поднята на соседний
        def petal(a):
            r = Rp(a); o = []; i_ = []
            for q in range(5):
                t_ = q / 4; ang = am - hwo + 2 * hwo * t_; lift = 0.007 * (1 - t_)
                o.append(ptp(a, r + lift, ang)); i_.append(ptp(a, r + lift - th, ang))
            return o + i_[::-1]
        b.loft([petal(aP), petal(aP + (a1 - aP) * 0.5), petal(a1)], G_METAL, cap0=G_METAL, cap1=G_METAL)
        # продольное ребро и зубец на кромке (рендер 09)
        ang_h = 0.022
        b.loft([box_sect(aP + 0.04, Rp(aP + 0.04) + 0.005, am, ang_h, 0.012), box_sect(a1 - 0.10, Rp(a1 - 0.10) + 0.005, am, ang_h, 0.012)], G_METAL, cap0=G_METAL, cap1=G_METAL)
        b.loft([box_sect(a1 - 0.075, NOZ_R + 0.006, am + math.pi / N, 0.038, 0.010), box_sect(a1, NOZ_R + 0.006, am + math.pi / N, 0.038, 0.010)], G_METAL, cap0=G_METAL, cap1=G_METAL)
        # внутренняя створка до горла: плоская грань, швы видны
        hwi = math.pi / N * 0.97
        b.loft([box_sect(a1 - 0.002, NOZ_R - th - 0.003, am, hwi, -0.006), box_sect(a1 - 0.50, 0.415, am, hwi, -0.006), box_sect(a0 + 0.03, 0.468, am, hwi, -0.006)], G_METAL, cap0=G_METAL, cap1=G_METAL)
        # кронштейн на поясе механики и тяга поверх лепестка (рендер 09)
        ang_k = 0.030 if j % 2 else 0.018
        b.loft([box_sect(aM + 0.005, 0.508, am + math.pi / N, ang_k, 0.046), box_sect(aP + 0.02, 0.503, am + math.pi / N, ang_k, 0.046)], G_METAL, cap0=G_METAL, cap1=G_METAL)
        p0 = ptp(a0 + 0.125, 0.592, am); p1 = ptp(aP + 0.30, Rp(aP + 0.30) + 0.024, am)
        strut(b, p0, p1, 0.011, G_METAL)
        for pc, h_ in ((p0, 0.024), (p1, 0.030)):
            tang = Vector((math.cos(am), 0, math.sin(am))); nor = Vector((math.sin(am), 0, -math.cos(am))); F = Vector((0, 1, 0))
            pts = [pc + tang * (sa * 0.017) + nor * (sb * 0.014) for sa, sb in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            b.loft([[q + F * h_ for q in pts], [q - F * h_ for q in pts]], G_METAL, cap0=G_METAL, cap1=G_METAL)
        # короткое звено от обруча к тяге
        strut(b, ptp(a0 + 0.335, 0.552, am), ptp(a0 + 0.335, 0.590, am), 0.007, G_METAL)
    return b.finish('nozzle_' + ('r' if sx > 0 else 'l'), sharp_deg=30)


# ── кабина: выемка, сиденья, панели; фонарь (рама и стекло) и козырёк ──
CK_A0, CK_A1 = 3.430, 6.700
CK_HW = Track([(3.43, 0.300), (3.90, 0.440), (5.20, 0.505), (6.30, 0.515), (6.70, 0.430)])


def cock_cut():
    def sec(a, y0, y1, hw):
        return [P3(a, -hw, y0), P3(a, hw, y0), P3(a, hw, y1), P3(a, -hw, y1)]
    st = stations(CK_A0, CK_A1, 0.30)
    rings = [sec(a, 0.38 - 0.02 * (a - 3.4), 1.90, CK_HW(a)) for a in st]
    return loft_obj('c_cock', rings, G_COCK, sharp=25)


CANOPY = [  # a, верх стекла (фото 10), полуширина у порога (рендер 07, фото 01)
    (3.170, 1.100, 0.200), (3.450, 1.430, 0.400), (3.800, 1.700, 0.495), (4.200, 1.860, 0.540), (4.800, 1.970, 0.565), (5.400, 2.000, 0.578), (6.000, 1.940, 0.585), (6.500, 1.780, 0.565), (6.850, 1.610, 0.500), (7.050, 1.510, 0.400)]
CAN_T = tracks(CANOPY)


def SILL(a):
    return fore_y(a, CAN_T[1](a))


def can_ring(a, inset=0.0, n=44):
    """Половина-верх дуги стекла от порога до порога."""
    top, hw = CAN_T[0](a) - inset, CAN_T[1](a) - inset; y0 = SILL(a) + 0.002
    return [P3(a, hw * math.cos(math.pi * k / (n - 1)) ** 0.86 if math.cos(math.pi * k / (n - 1)) >= 0 else -hw * (-math.cos(math.pi * k / (n - 1))) ** 0.86, y0 + (top - y0) * math.sin(math.pi * k / (n - 1)) ** 0.90) for k in range(n)]


CAN_HINGE = (7.100, 1.360)                                      # ось фонаря у задней кромки (a, y)
ARCH_A = 3.900                                                  # дуга между козырьком и фонарём (фото 01, 10)
ARCH2_A = 5.300                                                 # дуга между кабинами (фото 01, 02)


def glass_shell(name, st, pivot=None):
    b = B(); strip(b, [can_ring(a) for a in st], G_GLASS)
    ob = b.finish(name, sharp_deg=60)
    return ob


def frame_arch(b, a, w, inset=0.008, h=0.020, n=44):
    """Дуга: коробчатый профиль поперёк по стеклу, открытая снизу."""
    ri0 = can_ring(a - w, inset, n); ro0 = can_ring(a - w, -h, n); ro1 = can_ring(a + w, -h, n); ri1 = can_ring(a + w, inset, n)
    for j in range(n - 1):
        pass
    strip(b, [ri0, ro0, ro1, ri1, ri0], G_SKIN)


def canopy():
    """Подвижный фонарь: стекло отдельным объектом-ребёнком, рама и дуги - ось на шарнире сзади."""
    a0 = ARCH_A; a1 = 7.040; st = stations(a0 + 0.004, a1, 0.16)
    pivot = P3(CAN_HINGE[0], 0.0, CAN_HINGE[1])
    gl = glass_shell('canopy_glass', st); gl_me = gl.data
    for v in gl_me.vertices: v.co -= pivot
    gl.location = pivot
    b = B(); frame_arch(b, a0 + 0.024, 0.022); frame_arch(b, ARCH2_A, 0.032)
    # рельсы порога (рама понизу) и задний край
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        st2 = stations(a0, a1, 0.25)
        b.loft([[rail(a, 0.004, 0.014) for a in st2], [rail(a, 0.018, 0.012) for a in st2], [rail(a, 0.018, 0.030) for a in st2], [rail(a, -0.012, 0.046) for a in st2], [rail(a, -0.012, 0.024) for a in st2]], G_SKIN)
    strip(b, [can_ring(a1 - 0.03, 0.006), can_ring(a1 - 0.03, -0.020), can_ring(a1 + 0.02, -0.020), can_ring(a1 + 0.02, 0.006), can_ring(a1 - 0.03, 0.006)], G_SKIN)
    # замки на раме (рендер 04): штыри вдоль порога
    for sg in (1, -1):
        for a in (4.20, 4.80, 5.40, 6.00, 6.45):
            y = SILL(a); x = sg * (CAN_T[1](a) - 0.022)
            b.loft([[P3(a, x - 0.009, y + 0.004), P3(a + 0.05, x - 0.009, y + 0.004), P3(a + 0.05, x + 0.009, y + 0.004), P3(a, x + 0.009, y + 0.004)], [P3(a, x - 0.009, y + 0.015), P3(a + 0.05, x - 0.009, y + 0.015), P3(a + 0.05, x + 0.009, y + 0.015), P3(a, x + 0.009, y + 0.015)]], G_METAL, cap0=G_METAL, cap1=G_METAL)
    # зеркала на дуге между кабинами (рендер 06, фото 01)
    for x_, y_ in ((0.0, CAN_T[0](ARCH2_A) - 0.055), (0.24, CAN_T[0](ARCH2_A) - 0.105), (-0.24, CAN_T[0](ARCH2_A) - 0.105)):
        b.loft([[P3(ARCH2_A - 0.05, x_ - 0.055, y_ - 0.022), P3(ARCH2_A - 0.05, x_ + 0.055, y_ - 0.022), P3(ARCH2_A - 0.05, x_ + 0.055, y_ + 0.022), P3(ARCH2_A - 0.05, x_ - 0.055, y_ + 0.022)], [P3(ARCH2_A - 0.03, x_ - 0.055, y_ - 0.022), P3(ARCH2_A - 0.03, x_ + 0.055, y_ - 0.022), P3(ARCH2_A - 0.03, x_ + 0.055, y_ + 0.022), P3(ARCH2_A - 0.03, x_ - 0.055, y_ + 0.022)]], G_COCK, cap0=G_COCK, cap1=G_COCK)
    fr = b.finish('canopy', sharp_deg=45)
    for v in fr.data.vertices: v.co -= pivot
    fr.location = pivot; gl.parent = fr; gl.location = (0, 0, 0)
    PARTS['canopy'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, 40.0), note='поперечная ось у задней кромки; плюс - передняя кромка вверх; canopy_glass - дочерний объект')
    return [fr, gl]


def windscreen():
    a1 = ARCH_A - 0.05; st = stations(3.190, a1, 0.08)
    b = B(); strip(b, [can_ring(a) for a in st], G_GLASS); gl = b.finish('screen_glass', sharp_deg=60)
    b2 = B(); frame_arch(b2, ARCH_A - 0.052, 0.022); fr = b2.finish('screen_frame', sharp_deg=45)
    return [gl, fr]


def cockpit_inside():
    """Два кресла, приборные доски, пульты, ручки. Стоят в выемке."""
    b = B(); C = G_COCK
    def box(a0, a1, x0, x1, y0, y1, ta=0.0, mat=C):
        b.loft([[P3(a0, x0, y0), P3(a0, x1, y0), P3(a0 + ta, x1, y1), P3(a0 + ta, x0, y1)], [P3(a1, x0, y0), P3(a1, x1, y0), P3(a1 + ta, x1, y1), P3(a1 + ta, x0, y1)]], mat, cap0=mat, cap1=mat)
    for aS in (4.200, 5.650):
        w = 0.245
        box(aS, aS + 0.56, -w, w, 0.42, 0.72)                  # чаша сиденья
        box(aS + 0.24, aS + 0.56, -w * 0.92, w * 0.92, 0.70, 1.28, 0.20)   # спинка
        box(aS + 0.36, aS + 0.60, -w * 0.56, w * 0.56, 1.24, 1.60, 0.20)   # подголовник
        box(aS + 0.60, aS + 0.78, -w * 0.72, w * 0.72, 0.42, 1.28, 0.14, G_COCK)  # рельс
        box(aS - 0.30, aS - 0.26, -0.022, 0.022, 0.45, 0.88)   # ручка
        # подушка и лямки
        box(aS + 0.02, aS + 0.42, -w * 0.82, w * 0.82, 0.72, 0.78)
        # доски пульта с боков
        for sg in (1, -1):
            box(aS - 0.58, aS + 0.42, min(sg * 0.29, sg * (CK_HW(aS) - 0.01)), max(sg * 0.29, sg * (CK_HW(aS) - 0.01)), 0.46, 0.95)
        # приборная доска и козырёк
        box(aS - 0.74, aS - 0.60, -0.36, 0.36, 0.48, 1.16, -0.06)
        box(aS - 0.90, aS - 0.60, -0.38, 0.38, 1.16, 1.21, -0.02)
    return b.finish('cockpit_int', sharp_deg=28)


# ── пилоны под крылом и точки на конформных баках (низ пилонов ровный) ──
PYLON_W = (3.550, 12.300, 14.200, -0.480)                      # x, a0, a1, высота низа (фото 10, рендер 08)
STUBS = ((1.780, 9.400), (1.800, 11.300), (1.800, 13.200))     # x, a посередине: балки на конформном баке
PYLON_PTS = {}


def pylon(sx):
    x, a0, a1, y0 = PYLON_W; b = B(); name = 'pylon_w_' + ('r' if sx > 0 else 'l')
    yw = wy(x) - 0.08; hw = 0.055
    def sec(a, f=1.0):
        return [P3(a, sx * x - hw * f, y0), P3(a, sx * x + hw * f, y0), P3(a, sx * x + hw * f * 0.75, yw), P3(a, sx * x - hw * f * 0.75, yw)]
    st = [a0, a0 + 0.10, a0 + 0.40, a1 - 0.45, a1 - 0.10, a1]; fs = [0.12, 0.72, 1.0, 1.0, 0.72, 0.12]
    b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    # направляющие ракет по обе стороны (рендер 08)
    for ss in (1, -1):
        for k in range(1):
            cx = sx * x + ss * 0.175; cy = y0 + 0.070
            brk = lambda f: [P3(12.95 + f, sx * x, cy - 0.020), P3(12.95 + f, cx - ss * 0.0, cy - 0.020), P3(12.95 + f, cx, cy + 0.020), P3(12.95 + f, sx * x, cy + 0.020)]
            b.loft([brk(0.0), brk(0.42)], G_METAL, cap0=G_METAL, cap1=G_METAL)
            rl = lambda a: [P3(a, cx + 0.045 * math.cos(2 * math.pi * q / 10), cy + 0.045 * math.sin(2 * math.pi * q / 10)) for q in range(10)]
            b.loft([rl(12.50), rl(12.60), rl(13.90), rl(14.05)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    PYLON_PTS[name] = P3((a0 + a1) / 2, sx * x, y0)
    return b.finish(name, sharp_deg=40)


def stub(sx, i):
    x, am = STUBS[i]; b = B(); name = f'stub_{i}_' + ('r' if sx > 0 else 'l'); y0 = CFT_BOT(am) - 0.135; yt = CFT_BOT(am) + 0.050; hl, hw = 0.350, 0.045
    def sec(a, f): return [P3(a, sx * x - hw * f, y0), P3(a, sx * x + hw * f, y0), P3(a, sx * x + hw * f * 1.5, yt), P3(a, sx * x - hw * f * 1.5, yt)]
    st = [am - hl, am - hl + 0.06, am + hl - 0.06, am + hl]; fs = [0.2, 1.0, 1.0, 0.2]
    b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    PYLON_PTS[name] = P3(am, sx * x, y0)
    return b.finish(name, sharp_deg=40)


# ── мелочь по форме: антенны, щупы, навигационные огни на концах крыла ──
def bits():
    b = B()
    # щупы под носом (фото 10)
    for sg in (1, -1):
        for a, x, l in ((3.38, 0.46, 0.21),):
            c = P3(a, sg * x, -0.230); rg = lambda d, r: [c + Vector((sg * d * 0.5 + r * math.cos(2 * math.pi * q / 8), 0, -d + r * math.sin(2 * math.pi * q / 8))) for q in range(8)]
            b.loft([rg(0.0, 0.016), rg(l * 0.7, 0.013), rg(l, 0.004)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    # антенна на спине (фото 01)
    a0, a1, y = 7.25, 7.72, 1.35
    def sec(t):
        return [P3(a0 + (a1 - a0) * t, -0.011, y - 0.03), P3(a0 + (a1 - a0) * t, 0.011, y - 0.03)]
    plate = [P3(a0, 0.0, y + 0.0), P3(a1, 0.0, y - 0.08), P3(a1 + 0.13, 0.0, y + 0.16), P3(a0 + 0.35, 0.0, y + 0.17)]
    b.loft([[p + Vector((0.011, 0, 0)) for p in plate], [p + Vector((-0.011, 0, 0)) for p in plate]], G_METAL, cap0=G_METAL, cap1=G_METAL)
    # огни на концах крыльев (рендер 04)
    for sg in (1, -1):
        a = 14.72; c = P3(a, sg * 6.530, wy(6.52)); rg = lambda d, r: [c + Vector((r * math.cos(2 * math.pi * q / 10), -d, r * math.sin(2 * math.pi * q / 10))) for q in range(10)]
        b.loft([rg(-0.04, 0.004), rg(0.05, 0.030), rg(0.28, 0.030), rg(0.42, 0.004)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('bits', sharp_deg=45)


# ── обшивка: объединение оболочек ──
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


def build_skin():
    S = [fore(), mid(), nacelle(1), nacelle(-1), boom(1), boom(-1), cft(1), cft(-1), wing_s(1), wing_s(-1), diverter(1), diverter(-1), inlet_collar(1), inlet_collar(-1), stab_boss(1), stab_boss(-1)]
    host = S[0]
    for o in S[1:]:
        _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        c = duct_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
        c = bore_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = cock_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'F15_skin'; host.data.name = 'F15_skin'
    bvh_ready(host)
    return host


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


def speedbrake():
    """Тормозной щиток на спине: большая плита, шарнир спереди (рендеры 04, 06), цилиндр привода."""
    a0, a1 = 8.90, 12.05; W = Track([(8.90, 0.40), (9.6, 0.48), (11.5, 0.50), (12.05, 0.40)])
    ob = patch('speedbrake', lambda u, v: (a0 + (a1 - a0) * v, (u - 0.5) * 2 * W(a0 + (a1 - a0) * v)), 14, 16, lift=0.013, th=0.030)
    h = down(0.0, Yb(a0)); pivot = Vector((0.0, Yb(a0), h.z + 0.02))
    _rel(ob, pivot)
    PARTS['speedbrake'] = dict(pivot=pivot.copy(), axis=Vector((-1, 0, 0)), range=(0.0, 45.0), note='шарнир спереди, плюс - задняя кромка вверх')
    # цилиндр: от точки на щитке к точке в спине; при 0 лежит под щитком (спрятан), при 45° виден
    h2 = down(0.0, Yb(11.10)); p_top = Vector((0.0, Yb(11.10), h2.z - 0.01)) - pivot
    pc0 = P3(10.45, 0.0, h2.z - 0.24)
    b = B(); rg = lambda c, u, v, r: [c + (u * math.cos(2 * math.pi * q / 10) + v * math.sin(2 * math.pi * q / 10)) * r for q in range(10)]
    d = (p_top + pivot - pc0); dd = d.normalized(); U = Vector((1, 0, 0)); V = dd.cross(U).normalized()
    pm = pc0 + dd * (d.length * 0.55)
    b.loft([rg(pc0, U, V, 0.050), rg(pm, U, V, 0.050)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    cyl = b.finish('speedbrake_cyl', sharp_deg=45); _rel(cyl, pc0)
    b2 = B(); pe = p_top + pivot
    b2.loft([rg(pm - dd * 0.05, U, V, 0.026), rg(pe, U, V, 0.026)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    rod = b2.finish('speedbrake_rod', sharp_deg=45); _rel(rod, pe)
    PARTS['speedbrake_cyl'] = dict(pivot=pc0.copy(), axis=Vector((1, 0, 0)), range=None, note='корпус цилиндра: нижняя цапфа; угол и шток считаются из угла щитка, игра пока не двигает')
    PARTS['speedbrake_rod'] = dict(pivot=pe.copy(), axis=Vector((1, 0, 0)), range=None, note='шток: шарнир на щитке')
    return [ob, cyl, rod]


# ── шасси: стойки в выпущенном положении в исходнике; поза задаётся углом ──
GROUND_Y = -1.860
NG = dict(a=6.15, hinge=(6.42, -0.20), rw=0.295, ww=0.170)     # носовая стойка: ось шарнира (a, y), колесо (фото 10, рендер 07)
MG_A, MG_X = 11.05, 1.46                                       # основные: положение колеса на земле


def wheel(b, c, rw, ww, axis='x'):
    """Колесо с шиной и диском."""
    X = Vector((1, 0, 0)); F = Vector((0, 1, 0)); Z = Vector((0, 0, 1)); n = 28
    rg = lambda dx, r: [c + X * dx + (F * math.cos(2 * math.pi * q / n) + Z * math.sin(2 * math.pi * q / n)) * r for q in range(n)]
    prof = [(-ww * 0.5, rw * 0.52), (-ww * 0.5, rw * 0.72), (-ww * 0.42, rw * 0.90), (-ww * 0.24, rw * 0.985), (0, rw), (ww * 0.24, rw * 0.985), (ww * 0.42, rw * 0.90), (ww * 0.5, rw * 0.72), (ww * 0.5, rw * 0.52)]
    b.loft([rg(d, r) for d, r in prof], G_TYRE)
    hub = [(ww * 0.5, rw * 0.52), (ww * 0.28, rw * 0.46), (ww * 0.28, rw * 0.14), (ww * 0.44, rw * 0.11), (ww * 0.44, rw * 0.02)]
    b.loft([rg(d, r) for d, r in hub], G_METAL, cap1=G_METAL)
    hub2 = [(-ww * 0.5, rw * 0.52), (-ww * 0.28, rw * 0.46), (-ww * 0.28, rw * 0.14), (-ww * 0.44, rw * 0.11), (-ww * 0.44, rw * 0.02)]
    b.loft([rg(d, r) for d, r in hub2], G_METAL, cap1=G_METAL)


def strut(b, p0, p1, r, mat=G_METAL, n=12):
    d = (p1 - p0).normalized(); u = d.orthogonal().normalized(); v = d.cross(u)
    rg = lambda c: [c + (u * math.cos(2 * math.pi * q / n) + v * math.sin(2 * math.pi * q / n)) * r for q in range(n)]
    b.loft([rg(p0), rg(p1)], mat, cap0=mat, cap1=mat)


def gear_nose():
    a_h, y_h = NG['hinge']; rw = NG['rw']
    pivot = P3(a_h, 0.0, y_h); wy_ = GROUND_Y + rw; wc = P3(NG['a'], 0.0, wy_)
    b = B()
    wheel(b, wc, rw, NG['ww'])
    top = pivot; low = P3(NG['a'], 0.0, wy_ + 0.14)
    strut(b, top, low + Vector((0, 0, 0.42)), 0.058); strut(b, low + Vector((0, 0, 0.50)), low, 0.036)
    for sg in (1, -1):
        strut(b, low + Vector((sg * 0.105, 0, 0.0)), wc + Vector((sg * 0.105, 0, 0.0)), 0.028)
    strut(b, low + Vector((-0.105, 0, 0.0)), low + Vector((0.105, 0, 0.0)), 0.030)
    # ножницы и фара (рендер 07)
    strut(b, low + Vector((0, -0.08, 0.40)), low + Vector((0, -0.17, 0.22)), 0.016); strut(b, low + Vector((0, -0.17, 0.22)), low + Vector((0, -0.05, 0.03)), 0.016)
    strut(b, low + Vector((0, 0.08, 0.48)), low + Vector((0, 0.13, 0.56)), 0.040)
    ob = b.finish('gear_n', sharp_deg=40); _rel(ob, pivot)
    # подкос отдельно
    b2 = B(); sp = P3(a_h - 0.75, 0.0, y_h + 0.02); strut(b2, sp, low + Vector((0, 0, 0.56)), 0.026); br = b2.finish('gear_n_brace', sharp_deg=45); _rel(br, sp)
    PARTS['gear_n'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, 95.0), note='0 - выпущено; 95 - убрано колесом вперёд', retracted=95.0)
    PARTS['gear_n_brace'] = dict(pivot=sp.copy(), axis=Vector((1, 0, 0)), range=None, note='подкос: движется вместе со стойкой')
    return [ob, br]


def gear_main(sx):
    n_ = 'r' if sx > 0 else 'l'; rw, ww = 0.410, 0.225
    a_w = MG_A; wc = P3(a_w, sx * MG_X, GROUND_Y + rw)
    pivot = P3(a_w + 0.08, sx * 1.34, -0.46)                  # ось верхнего шарнира: под брюхом канала
    b = B(); wheel(b, wc, rw, ww)
    low = wc + Vector((-sx * 0.165, 0, 0.0))
    strut(b, pivot, low + Vector((0, 0, 0.46)), 0.070); strut(b, low + Vector((0, 0, 0.52)), low + Vector((0, 0, 0.02)), 0.046)
    strut(b, low, wc + Vector((-sx * ww * 0.3, 0, 0.0)), 0.044)
    strut(b, low + Vector((0, -0.09, 0.48)), low + Vector((0, -0.21, 0.26)), 0.018); strut(b, low + Vector((0, -0.21, 0.26)), low + Vector((0, -0.06, 0.03)), 0.018)
    ob = b.finish('gear_m_' + n_, sharp_deg=40); _rel(ob, pivot)
    b2 = B(); sp = P3(a_w - 0.72, sx * 1.56, -0.52); strut(b2, sp, low + Vector((0, 0, 0.52)), 0.030); br = b2.finish('gear_m_brace_' + n_, sharp_deg=45); _rel(br, sp)
    PARTS['gear_m_' + n_] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, 95.0), note='0 - выпущено; 95 - убрано колесом вперёд', retracted=95.0)
    PARTS['gear_m_brace_' + n_] = dict(pivot=sp.copy(), axis=Vector((1, 0, 0)), range=None, note='подкос: движется вместе со стойкой')
    return [ob, br]


def doors():
    """Створки: плиты по обшивке снизу; при углах 0 в файле закрыты (игра). Оси - по кромке, открытие задано в паспорте."""
    out = []
    # носовая: две створки, ось вдоль борта
    a0, a1, hw = 4.95, 6.55, 0.230
    for sx in (1, -1):
        n_ = 'door_n_' + ('r' if sx > 0 else 'l')
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * hw * u), 6, 8, dirn=1, lift=0.004, th=0.018, z0=-3.0)
        pivot = P3((a0 + a1) / 2, sx * hw, down(sx * hw, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z - 0.005); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(-80.0 * sx, 0.0) if sx > 0 else (0.0, 80.0), note='0 - закрыта (файл игры), открытие наружу на 80°')
        out.append(ob)
    # основные: большая створка по борту канала и щиток на стойке
    for sx in (1, -1):
        n_ = 'door_m_' + ('r' if sx > 0 else 'l'); a0, a1, x0, x1 = 9.55, 11.75, 1.02, 1.74
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + (x1 - x0) * u)), 8, 8, dirn=1, lift=0.004, th=0.020, z0=-3.0)
        pivot = P3((a0 + a1) / 2, sx * x1, down(sx * x1, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z - 0.005); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(-85.0 * sx, 0.0) if sx > 0 else (0.0, 85.0), note='0 - закрыта, ось у наружной кромки')
        out.append(ob)
    return out


def plane(stage=9, carve=True):
    """Этапы: 1 - обшивка с крыльями; 2 - рули, оперение, сопла; 3 - кабина, фонарь, щиток, пилоны; 4 - шасси и створки. carve - разделка обшивки."""
    import f15_detail as d
    PARTS.clear(); PYLON_PTS.clear()
    skin = build_skin(); out = [skin]
    if stage >= 2:
        il = [inlet(1), inlet(-1)]
        out += [fin(1), fin(-1), rudder(1), rudder(-1), stab(1), stab(-1), nozzle(1), nozzle(-1)] + il + [fan(1), fan(-1), d.burner(1), d.burner(-1), d.inlet_ramps(1, il[0]), d.inlet_ramps(-1, il[1])]
        out += [wing_part('flap_r', FLAP, 1, 'ось по передней кромке; плюс - вниз', (0.0, 30.0)), wing_part('flap_l', FLAP, -1, 'ось по передней кромке; плюс - вниз', (0.0, 30.0)), wing_part('aileron_r', AIL, 1, 'ось по передней кромке; плюс - вниз', (-20.0, 20.0)), wing_part('aileron_l', AIL, -1, 'ось по передней кромке; плюс - вниз', (-20.0, 20.0))]
    if stage >= 3:
        out += [d.cockpit_detail()]
        out += canopy() + windscreen()
        out += speedbrake() + [pylon(1), pylon(-1)] + [stub(sx, i) for sx in (1, -1) for i in range(3)] + [d.details(), d.hinges()] + d.hardpoints()
    if stage >= 4:
        out += doors()                                          # створки ложатся на целую обшивку, ниши режутся после
        import f15_gear as gr; out += gr.gear_nose() + gr.gear_main(1) + gr.gear_main(-1)
    if carve:
        print('канавок и выемок:', d.carve(skin))
    if stage >= 4: d.bays(skin)
    d.resharp(skin)
    return out
