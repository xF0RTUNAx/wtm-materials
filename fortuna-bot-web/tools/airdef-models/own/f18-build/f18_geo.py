# f18_geo.py - геометрия F/A-18E Super Hornet для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z (в glTF: нос -Z, правое крыло +X, верх +Y). Начало - середина длины 18,07 м по оси сопел.
# a - расстояние от острия носа, y - высота над осью сопел. План снят с выпрямленного снимка снизу fa18_06, вид сбоку - fa18_07 и fa18_14 (сетка в _снимки). Старые Hornet (fa18_08...12) - только детали, кадры игр - только планка качества. Сетка и текстуры чужих моделей не используются.
# Сетка: замкнутые оболочки объединяются булевой операцией в одну обшивку без внутренних стенок; кили, стабилизаторы, рули, консоли - отдельные детали с толщиной.
import math
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 18.07
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
FORE = [  # a, верх, низ, полуширина, nверх, nниз
    (0.000, 0.012, -0.012, 0.012, 2.0, 2.0), (0.120, 0.052, -0.050, 0.062, 2.0, 2.0), (0.400, 0.128, -0.112, 0.152, 2.0, 2.0), (0.800, 0.250, -0.172, 0.268, 2.0, 2.0), (1.200, 0.365, -0.222, 0.362, 2.0, 2.0), (1.800, 0.515, -0.292, 0.448, 2.05, 2.1), (2.400, 0.650, -0.350, 0.490, 2.1, 2.2),
    (3.000, 0.770, -0.400, 0.505, 2.2, 2.4), (3.600, 0.885, -0.425, 0.522, 2.4, 2.6), (4.200, 0.965, -0.445, 0.542, 2.8, 2.8), (5.000, 1.010, -0.465, 0.570, 3.0, 3.0), (6.000, 1.030, -0.500, 0.580, 3.0, 3.2), (7.000, 1.080, -0.540, 0.580, 2.8, 3.2), (7.800, 1.190, -0.555, 0.580, 2.5, 3.2), (8.600, 1.240, -0.555, 0.580, 2.5, 3.0), (9.600, 1.210, -0.500, 0.555, 2.5, 3.0), (11.000, 1.120, -0.400, 0.520, 2.5, 3.0), (12.500, 1.020, -0.300, 0.480, 2.5, 2.8), (14.000, 0.880, -0.200, 0.410, 2.4, 2.6), (15.000, 0.750, -0.050, 0.280, 2.2, 2.2), (15.700, 0.620, 0.150, 0.100, 2.0, 2.0)]
FT = tracks(FORE)


def fore_y(a, x):
    """Высота верхней поверхности носовой части над |x|: для порога фонаря."""
    top, bot, hw, nt = FT[0](a), FT[1](a), FT[2](a), FT[3](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nt)
    return cy + ht * q ** (1 / nt)


def fore():
    st = [0.0, 0.03, 0.07, 0.12, 0.2] + stations(0.3, 3.2, 0.10) + stations(3.3, 15.7, 0.20)
    return loft_obj('s_fore', [sup(a, 0.0, *[t(a) for t in FT], 72) for a in st])


# ── средняя часть: широкая палуба от наплыва до хвоста, единая плоскость сверху, между гондолами киль ──
MID = [(9.300, 0.430, -0.480, 0.700, 7.0, 4.0), (10.000, 0.445, -0.520, 1.160, 7.0, 4.0), (11.000, 0.510, -0.520, 1.330, 7.0, 4.0), (12.000, 0.600, -0.500, 1.370, 7.0, 4.0), (13.000, 0.670, -0.470, 1.380, 7.0, 4.0), (14.500, 0.680, -0.380, 1.340, 7.0, 3.6), (15.500, 0.610, -0.280, 1.200, 6.0, 3.2), (16.400, 0.530, -0.180, 0.960, 5.0, 3.0), (16.850, 0.380, -0.120, 0.620, 3.0, 3.0), (17.100, 0.250, -0.080, 0.300, 2.4, 2.4), (17.280, 0.170, -0.020, 0.050, 2.0, 2.0)]


MID_HW = tracks(MID)[2]


def mid():
    T = tracks(MID)
    return loft_obj('s_mid', [sup(a, 0.0, *[t(a) for t in T], 96) for a in stations(9.3, 17.28, 0.22)])


# ── наплыв (LEX): план снят с fa18_06; пластина с острой кромкой, сверху плавно в обшивку ──
LEXX = Track([(4.950, 0.300), (5.250, 0.530), (5.750, 0.750), (6.250, 1.030), (6.880, 1.310), (7.500, 1.560), (8.120, 1.720), (8.870, 1.880), (9.690, 1.940), (10.700, 1.960)])
LEXY = Track([(4.950, 0.660), (6.000, 0.570), (7.000, 0.490), (8.000, 0.430), (9.000, 0.385), (10.000, 0.355), (10.700, 0.340)])
LEXT = Track([(4.950, 0.018), (6.000, 0.052), (7.500, 0.075), (9.000, 0.090), (10.700, 0.090)])


def lex():
    st = [4.95, 5.02, 5.1, 5.25, 5.45] + stations(5.7, 10.7, 0.20); rs = []
    for a in st:
        y = LEXY(a); t = LEXT(a); rs.append(sup(a, 0.0, y + t, y - t, LEXX(a), 1.32, 1.32, 64))
    return loft_obj('s_lex', rs, sharp=50)


# ── гондолы ──
NOZ_X, NOZ_Y, NOZ_A, NOZ_R = 0.490, 0.020, 18.070, 0.385       # центр и радиус среза створок сопла
NAC_A1 = 17.080                                                 # конец гладкой гондолы: дальше кольцо и створки
NAC = [(10.250, 0.820, 0.430, -0.760, 0.590, 3.6), (11.500, 0.790, 0.440, -0.790, 0.585, 3.0), (13.000, 0.750, 0.450, -0.770, 0.600, 2.6), (14.500, 0.700, 0.470, -0.700, 0.580, 2.4), (15.500, 0.650, 0.470, -0.610, 0.540, 2.2), (16.300, 0.580, 0.470, -0.500, 0.505, 2.05), (17.080, 0.490, 0.465, -0.425, 0.445, 2.0)]
NT = tracks(NAC)
NAC_OUT = lambda a_: NT[0](a_) + NT[3](a_)


def nacelle(sx):
    n = 64
    def ring(a):
        cx, top, bot, hw, e = [t(a) for t in NT]; return sup(a, sx * cx, top, bot, hw, e, e, n)
    rs = [ring(a) for a in stations(10.25, NAC_A1, 0.20)]
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
    T = tracks([(14.8, 0.20, -0.40, 0.20), (16.0, 0.20, -0.36, 0.17), (17.0, 0.18, -0.26, 0.11), (17.6, 0.16, -0.14, 0.06)])
    return loft_obj('s_keel', [sup(a, 0.0, T[0](a), T[1](a), T[2](a), 3.0, 2.6, 24) for a in stations(14.8, 17.6, 0.25)])


# ── воздухозаборник: косой срез, прямоугольный, верх наклонён наружу вниз, низ со скосом (fa18_03, 05, 07) ──
INL_A0, INL_A1 = 8.90, 11.50
FAN_X, FAN_Y, FAN_A, FAN_R = 1.03, -0.22, 10.63, 0.335      # вентилятор по центру проёма: спереди виден целиком, стенка канала его не заслоняет
def inl_pts(a, inset=0.0, sx=1):
    k = min(1.0, max(0.0, (a - 9.0) / 2.5)); x0 = 0.645 + 0.02 * k; x1 = 1.430 - 0.03 * k; t0 = 0.300 + 0.08 * k; t1 = 0.150 + 0.20 * k; yb = -0.800 - 0.01 * k; cx_ = x1 - 0.20
    return [(sx * (x0 + inset), yb + inset), (sx * (cx_ - inset * 0.3), yb + inset), (sx * (x1 - inset), yb + 0.26 + inset * 0.3), (sx * (x1 - inset), t1 - inset), (sx * (x0 + inset), t0 - inset)]


def inlet_box(sx):
    return loft_obj('s_inl_' + ('r' if sx > 0 else 'l'), [poly_ring(a, inl_pts(a, 0.0, sx), 60, 0.035) for a in stations(INL_A0, INL_A1, 0.30)], sharp=46)


def lip_cut(sx):
    """Косой срез: впереди кромки всё убирается. Верх впереди, низ сзади; наружная сторона чуть впереди внутренней (fa18_05, 07)."""
    rs = []
    for x, da in ((0.40, 0.10), (1.70, -0.14)):
        rs.append([P3(a_ + da, sx * x, y_) for a_, y_ in ((9.20, 0.70), (9.42, 0.26), (10.14, -0.90), (10.2, -1.2), (7.0, -1.2), (7.0, 0.70))])
    return loft_obj('c_lip', rs, G_SKIN)


def duct_cut(sx):
    a0, a1 = 8.80, FAN_A + 0.02; n = 60; rings = []
    for i in range(11):
        a = a0 + (a1 - a0) * i / 10; t = _sm((a - 9.35) / (10.35 - 9.35))
        r1 = poly_ring(a, inl_pts(max(a, 9.0), 0.055, sx), n, 0.03); c = Vector((sx * FAN_X, Yb(a), FAN_Y)); rr = FAN_R
        r2 = [c + Vector((sx * rr * math.cos(math.radians(-90 * 0) + 2 * math.pi * k / n), 0, rr * math.sin(2 * math.pi * k / n))) for k in range(n)]
        # точки круга подводим к ближайшему началу: поворот на тот же старт
        d0 = (r1[0] - c); st = math.atan2(d0.z, d0.x * sx); r2 = [c + Vector((sx * rr * math.cos(st + 2 * math.pi * k / n * (1 if sx > 0 else 1) * _spin(r1)), 0, rr * math.sin(st + 2 * math.pi * k / n * _spin(r1)))) for k in range(n)]
        rings.append([p.lerp(q, t) for p, q in zip(r1, r2)])
    return loft_obj('c_duct_' + ('r' if sx > 0 else 'l'), rings, G_COCK)


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
    """Отсекающая плита между бортом и каналом: закрывает зазор, спереди клином (fa18_03, 05)."""
    def sec(a, x0, x1, y0, y1): return [P3(a, sx * x0, y0), P3(a, sx * x1, y0), P3(a, sx * x1, y1), P3(a, sx * x0, y1)]
    return loft_obj('s_split_' + ('r' if sx > 0 else 'l'), [sec(8.95, 0.50, 0.60, -0.46, 0.44), sec(9.60, 0.50, 0.670, -0.76, 0.42), sec(10.50, 0.50, 0.70, -0.78, 0.42)], G_SKIN, sharp=30)


# ── крыло ──
FOLD_X = 4.850; FOLD_GAP = 0.006
WING_Y0, WING_DY = 0.350, -0.036
def wy(x): return WING_Y0 + WING_DY * (x - 1.9) - 0.20 * max(0.0, 1.70 - x)
LE_I = lambda x: 9.730 + 0.4948 * (x - 1.94)                    # передняя кромка внутренней части
LE_O = lambda x: 11.000 + 0.5556 * (x - 4.85)                   # внешней: зуб на линии складывания
TE_I = lambda x: 14.000
TE_O = lambda x: 13.960 - 0.2802 * (x - 4.85)
SLAT_I = lambda x: 0.640 - 0.0619 * (x - 1.98)                  # хорда носка
SLAT_O = lambda x: 0.500 - 0.0778 * (x - 4.85)
HINGE_I = lambda x: 12.810 + 0.128 * (x - 1.69)                 # линия навески закрылка (fa18_06)
HINGE_O = lambda x: 13.300 + 0.050 * (x - 4.85)                 # элерона
FLAP = (1.480, 4.800); AIL = (4.900, 6.300); SLAT_X = (2.040, 6.620)
GAP = 0.012
TC = Track([(1.100, 0.050), (6.800, 0.030)])


def _wsec(sx, x, side):
    """Кольцо дужки неподвижной части: side 'i' внутренняя, 'o' консоль; cut_s, cut_e - срезать носок и заднюю секцию."""
    LE, TE, SL, HG, X0, X1 = (LE_I, TE_I, SLAT_I, HINGE_I, FLAP[0], FLAP[1]) if side == 'i' else (LE_O, TE_O, SLAT_O, HINGE_O, AIL[0], AIL[1])
    c = TE(x) - LE(x); us = SL(x) / c if (SLAT_X[0] <= x <= SLAT_X[1]) else 0.0; ue = (HG(x) - LE(x)) / c if X0 <= x <= X1 else 1.0
    return foil_ring(LE(x), c, TC(x), us, ue, 18, lambda a, h: P3(a, sx * x, wy(x) + h))


def wing_s(sx):
    xs = [1.10, 1.30, 1.475, 1.48] + [1.48 + (2.035 - 1.48) * i / 3 for i in range(1, 4)] + [2.04] + [2.04 + (FOLD_X - FOLD_GAP - 2.04) * i / 10 for i in range(1, 11)]
    xs = sorted(set(round(v, 4) for v in xs + [4.79, 4.80, 4.805]))
    return loft_obj('s_wing_' + ('r' if sx > 0 else 'l'), [_wsec(sx, x, 'i') for x in xs if x <= FOLD_X - FOLD_GAP + 1e-6], sharp=48)


def fold(sx):
    """Складная консоль: разрез настоящий, шарнир по линии складывания; вместе с рельсом на конце. В игре не двигается."""
    name = 'fold_' + ('r' if sx > 0 else 'l'); xe = 6.760; xs = [FOLD_X + FOLD_GAP] + [4.895, 4.90] + [4.90 + (AIL[1] - 4.90) * i / 8 for i in range(1, 9)] + [6.305, 6.40, 6.50, 6.60, 6.62, 6.625, 6.70, xe]
    xs = sorted(set(round(v, 4) for v in xs)); pivot = P3(12.45, sx * FOLD_X, wy(FOLD_X) + 0.085)
    rs = [[v - pivot for v in _wsec(sx, x, 'o')] for x in xs]
    b = B(); b.loft(rs, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    # рельс на конце: постоянный, с носком и хвостовиком (fa18_02, 06, 07)
    xr = 6.805; yr = wy(6.75) - 0.006; rg = lambda a, hw, hh: [P3(a, sx * xr + hw * math.cos(2 * math.pi * q / 12) * 1.0, yr + hh * math.sin(2 * math.pi * q / 12)) - pivot for q in range(12)]
    prof = [(11.02, 0.006, 0.006), (11.12, 0.030, 0.034), (11.40, 0.046, 0.052), (13.50, 0.046, 0.052), (13.88, 0.028, 0.034), (13.95, 0.006, 0.006)]
    b.loft([rg(a, h, v) for a, h, v in prof], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    # перемычка консоль - рельс
    sec = lambda a: [P3(a, sx * (xe - 0.01), yr - 0.018) - pivot, P3(a, sx * (xr - 0.01), yr - 0.022) - pivot, P3(a, sx * (xr - 0.01), yr + 0.022) - pivot, P3(a, sx * (xe - 0.01), yr + 0.018) - pivot]
    b.loft([sec(12.15), sec(13.35)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    ob = b.finish(name, sharp_deg=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(0.0, -sx * 90.0) if False else ((-90.0, 0.0) if sx > 0 else (0.0, 90.0)), note='складывание вверх; в игре не двигается', sign=-sx)
    return ob


def surface_rings(x0, x1, n, LE, TE, HG, sx, mat_y):
    rings = []
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n; c = TE(x) - LE(x); us = (HG(x) - LE(x) + GAP) / c
        rings.append(foil_ring(LE(x), c, TC(x), us, 1.0, 9, lambda a, h: P3(a, sx * x, wy(x) + h), nose=0.11))
    return rings


def wing_part(name, spec, sx, LE, TE, HG, note, rng):
    x0, x1 = spec; x0 += 0.006; x1 -= 0.006
    pv0 = P3(HG(x0) + GAP + 0.04, sx * x0, wy(x0)); pv1 = P3(HG(x1) + GAP + 0.04, sx * x1, wy(x1)); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = [[v - pivot for v in r] for r in surface_rings(x0, x1, 8, LE, TE, HG, sx, wy)]
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=rng, note=note)
    return ob


def slat(sx):
    """Носок крыла: внутренняя и внешняя секции одной детали, ось по нижней кромке внутренней секции."""
    name = 'slat_' + ('r' if sx > 0 else 'l'); b = B()
    xa, xb = SLAT_X[0] + 0.012, FOLD_X - 0.024
    lo_ = lambda x_: wy(x_) - TC(x_) * (TE_I(x_) - LE_I(x_)) * thk(SLAT_I(x_) / (TE_I(x_) - LE_I(x_))) - 0.003
    p0 = P3(LE_I(xa) + SLAT_I(xa) - GAP, sx * xa, lo_(xa)); p1 = P3(LE_I(xb) + SLAT_I(xb) - GAP, sx * xb, lo_(xb)); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized()
    if axis.x > 0: axis = -axis                                 # к оси самолёта: плюс - носок вниз
    def sec(x, LE, TE, SL):
        c = TE(x) - LE(x); return [v - pivot for v in foil_ring(LE(x), c, TC(x), 0.0, (SL(x) - GAP) / c, 12, lambda a, h: P3(a, sx * x, wy(x) + h))]
    b.loft([sec(xa + (xb - xa) * i / 8, LE_I, TE_I, SLAT_I) for i in range(9)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    xa2, xb2 = FOLD_X + FOLD_GAP + 0.012, SLAT_X[1] - 0.014
    b.loft([sec(xa2 + (xb2 - xa2) * i / 6, LE_O, TE_O, SLAT_O) for i in range(7)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    ob = b.finish(name, sharp_deg=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(0.0, 34.0), note='две секции одной детали, ось по нижней кромке внутренней; плюс - носок вниз')
    return ob


# ── стабилизатор: план fa18_06; внутренняя кромка вдоль гондолы с зазором, цельноповоротный ──
STAB_Y, STAB_DY = 0.150, -0.055
STAB_A = 16.350
class Lin:
    def __init__(self, pts): self.p = pts
    def __call__(self, t):
        p = self.p
        if t <= p[0][0]: return p[0][1]
        for (x0, y0), (x1, y1) in zip(p, p[1:]):
            if t <= x1: return y0 + (y1 - y0) * (t - x0) / max(x1 - x0, 1e-6)
        return p[-1][1]


S_LE = Lin([(1.000, 14.280), (3.790, 17.250), (3.810, 17.300)])
S_TE = Lin([(1.000, 17.100), (3.310, 18.540), (3.810, 18.190)])
STAB_GAP = 0.014
XT = 3.81


def _sup_x(cx, top, bot, hw, nt, nb, y):
    """Наибольшая ширина сечения sup на высотах y ± 6 см: стабилизатор толщиной около 10 см не должен входить в корпус."""
    cy = (top + bot) / 2; ht = (top - bot) / 2; yy = min(max(cy, y - 0.06), y + 0.06); e = nt if yy >= cy else nb; u = min(0.999, abs((yy - cy) / ht) ** e) if ht else 0.999
    return cx + hw * (1 - u) ** (1 / e)


def stab_in(a_):
    """Внутренняя кромка стабилизатора: настоящая ширина корпуса на его высоте, а не наибольшая; за гондолой - по соплу."""
    y = STAB_Y; a_ = max(a_, 10.25)
    if a_ > NAC_A1:
        t_ = min(1.0, (a_ - NAC_A1) / 0.12); nac = NAC_OUT(NAC_A1) + (NOZ_X + 0.43 - NAC_OUT(NAC_A1)) * t_
    else:
        cx, top, bot, hw, e = [t(a_) for t in NT]; nac = _sup_x(cx, top, bot, hw, e, e, y)
    M = tracks(MID); a_m = min(a_, 17.28); mid_ = _sup_x(0.0, M[0](a_m), M[1](a_m), M[2](a_m), M[3](a_m), M[4](a_m), y)
    return max(nac, mid_)


def stab(sx):
    name = 'stab_' + ('r' if sx > 0 else 'l'); xr_ = stab_in(STAB_A) + STAB_GAP; pivot = P3(STAB_A, sx * xr_, STAB_Y)
    xs = [1.00, 1.08, 1.20, 1.36, 1.55] + [1.55 + (3.31 - 1.55) * i / 8 for i in range(1, 9)] + [3.40, 3.55, 3.70, 3.79, 3.81]
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
FIN_X, FIN_CANT = 0.900, 0.3640
FIN_Y0, FIN_Y1 = 0.520, 3.000
F_LE = Lin([(0.350, 13.650), (FIN_Y0, 13.830), (FIN_Y1, 16.350)])
F_TE = Lin([(0.350, 16.700), (FIN_Y0, 16.760), (FIN_Y1, 17.450)])
RUD = (0.700, 2.300)
RUD_C = Track([(0.700, 0.780), (2.300, 0.700)])
def fx(y): return FIN_X + FIN_CANT * (y - FIN_Y0)
def ftc(y): return 0.040 - 0.014 * (y - 0.35) / 2.65


def fin(sx):
    ys = [0.35, 0.52, 0.66, 0.695, 0.70] + [0.70 + (2.30 - 0.70) * i / 7 for i in range(1, 8)] + [2.305, 2.34, 2.5, 2.7, 2.9, 3.0]
    rings = []
    for y in ys:
        c = F_TE(y) - F_LE(y); ue = 1 - RUD_C(y) / c if RUD[0] <= y <= RUD[1] else 1.0
        rings.append(foil_ring(F_LE(y), c, ftc(y), 0.0, ue, 16, lambda a, h: P3(a, sx * (fx(y) + h), y)))
    b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    # планки на верхней задней части: снаружи ступеньками (fa18_02, 05, 07)
    for i, y in enumerate((2.40, 2.53, 2.66, 2.79)):
        a1 = F_TE(y) + 0.05; a0 = a1 - 0.62 + 0.03 * i; x_ = fx(y); th = 0.022; o = 0.040
        sec = lambda a: [P3(a, sx * (x_ - 0.005), y - th), P3(a, sx * (x_ + ftc(y) * 0.9 * 0 + o), y - th * 0.6), P3(a, sx * (x_ + o), y + th * 0.6), P3(a, sx * (x_ - 0.005), y + th)]
        b.loft([sec(a0), sec(a0 + 0.06), sec(a1 - 0.03), sec(a1)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    # бобышки на внешней стороне
    for y, a_c, l_ in ((1.05, 15.20, 0.52), (1.90, 15.85, 0.44)):
        x_ = fx(y); rg = lambda a, r: [P3(a, sx * (x_ + 0.012 + r * 0.8 * math.cos(2 * math.pi * q / 12)), y + r * math.sin(2 * math.pi * q / 12)) for q in range(12)]
        b.loft([rg(a_c - l_, 0.004), rg(a_c - l_ * 0.6, 0.036), rg(a_c, 0.044), rg(a_c + l_ * 0.6, 0.036), rg(a_c + l_, 0.004)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('fin_' + ('r' if sx > 0 else 'l'), sharp_deg=48)


def rudder(sx):
    name = 'rudder_' + ('r' if sx > 0 else 'l'); y0, y1 = RUD
    h0 = F_TE(y0) - RUD_C(y0) + GAP + 0.03; h1 = F_TE(y1) - RUD_C(y1) + GAP + 0.03; p0 = P3(h0, sx * fx(y0), y0); p1 = P3(h1, sx * fx(y1), y1); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized()
    rings = []
    for i in range(9):
        y = y0 + 0.024 + (y1 - y0 - 0.038) * i / 8; c = F_TE(y) - F_LE(y)
        rings.append([v - pivot for v in foil_ring(F_LE(y), c, ftc(y), 1 - (RUD_C(y) - 0.022) / c, 1.0, 9, lambda a, h: P3(a, sx * (fx(y) + h), y), nose=0.14)])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-30.0, 30.0), note='ось по передней кромке руля, снизу вверх')
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
CK_A0, CK_A1 = 3.980, 7.380
CK_HW = Track([(3.98, 0.300), (4.50, 0.440), (5.50, 0.490), (6.70, 0.470), (7.38, 0.300)])


def cock_cut():
    def sec(a, y0, y1, hw): return [P3(a, -hw, y0), P3(a, hw, y0), P3(a, hw, y1), P3(a, -hw, y1)]
    st = stations(CK_A0, CK_A1, 0.30)
    return loft_obj('c_cock', [sec(a, 0.24, 1.90, CK_HW(a)) for a in st], G_COCK, sharp=25)


CANOPY = [(3.600, fore_y(3.600, 0.0) + 0.004, 0.300), (3.950, 1.190, 0.405), (4.400, 1.395, 0.480), (4.900, 1.535, 0.525), (5.400, 1.615, 0.545), (6.000, 1.625, 0.548), (6.600, 1.530, 0.520), (7.100, 1.400, 0.450), (7.450, 1.290, 0.320), (7.650, 1.235, 0.200)]
CAN_T = tracks(CANOPY)


def SILL(a): return fore_y(a, CAN_T[1](a))


def can_ring(a, inset=0.0, n=44):
    top, hw = CAN_T[0](a) - inset, CAN_T[1](a) - inset; y0 = SILL(a) + 0.002
    return [P3(a, hw * math.cos(math.pi * k / (n - 1)) ** 0.70 if math.cos(math.pi * k / (n - 1)) >= 0 else -hw * (-math.cos(math.pi * k / (n - 1))) ** 0.70, y0 + (top - y0) * math.sin(math.pi * k / (n - 1)) ** 0.82) for k in range(n)]


CAN_HINGE = (7.640, 1.150)
ARCH_A = 4.880


def glass_shell(name, st):
    b = B(); strip(b, [can_ring(a) for a in st], G_GLASS)
    return b.finish(name, sharp_deg=60)


def frame_arch(b, a, w, inset=0.008, h=0.020, n=44, drop=0.0):
    ri0 = can_ring(a - w, inset, n); ro0 = can_ring(a - w, -h, n); ro1 = can_ring(a + w, -h, n); ri1 = can_ring(a + w, inset, n)
    if drop: ri0 = [p - Vector((0, 0, drop)) for p in ri0]; ri1 = [p - Vector((0, 0, drop)) for p in ri1]     # низ рамы уходит в обшивку: без зазора
    strip(b, [ri0, ro0, ro1, ri1, ri0], G_SKIN)


def canopy():
    a0 = ARCH_A; a1 = 7.60; st = stations(a0 + 0.004, a1, 0.16); pivot = P3(CAN_HINGE[0], 0.0, CAN_HINGE[1])
    gl = glass_shell('canopy_glass', st)
    for v in gl.data.vertices: v.co -= pivot
    gl.location = pivot
    b = B(); frame_arch(b, a0 + 0.030, 0.030, h=0.024)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        st2 = stations(a0, a1, 0.25)
        b.loft([[rail(a, 0.004, 0.014) for a in st2], [rail(a, 0.018, 0.012) for a in st2], [rail(a, 0.018, 0.030) for a in st2], [rail(a, -0.012, 0.046) for a in st2], [rail(a, -0.012, 0.024) for a in st2]], G_SKIN)
    strip(b, [can_ring(a1 - 0.03, 0.006), can_ring(a1 - 0.03, -0.020), can_ring(a1 + 0.02, -0.020), can_ring(a1 + 0.02, 0.006), can_ring(a1 - 0.03, 0.006)], G_SKIN)
    for sg in (1, -1):
        for a in (5.20, 5.80, 6.40, 7.00):
            y = SILL(a); x = sg * (CAN_T[1](a) - 0.022)
            b.loft([[P3(a, x - 0.009, y + 0.004), P3(a + 0.05, x - 0.009, y + 0.004), P3(a + 0.05, x + 0.009, y + 0.004), P3(a, x + 0.009, y + 0.004)], [P3(a, x - 0.009, y + 0.015), P3(a + 0.05, x - 0.009, y + 0.015), P3(a + 0.05, x + 0.009, y + 0.015), P3(a, x + 0.009, y + 0.015)]], G_METAL, cap0=G_METAL, cap1=G_METAL)
    # зеркала на дуге (fa18_08, 12)
    for x_, y_ in ((0.0, CAN_T[0](ARCH_A) - 0.055), (0.26, CAN_T[0](ARCH_A) - 0.115), (-0.26, CAN_T[0](ARCH_A) - 0.115)):
        A_ = ARCH_A + 0.06
        b.loft([[P3(A_ + 0.02, x_ - 0.055, y_ - 0.022), P3(A_ + 0.02, x_ + 0.055, y_ - 0.022), P3(A_ + 0.02, x_ + 0.055, y_ + 0.022), P3(A_ + 0.02, x_ - 0.055, y_ + 0.022)], [P3(A_, x_ - 0.055, y_ - 0.022), P3(A_, x_ + 0.055, y_ - 0.022), P3(A_, x_ + 0.055, y_ + 0.022), P3(A_, x_ - 0.055, y_ + 0.022)]], G_COCK, cap0=G_COCK, cap1=G_COCK)
    fr = b.finish('canopy', sharp_deg=45)
    for v in fr.data.vertices: v.co -= pivot
    fr.location = pivot; gl.parent = fr; gl.location = (0, 0, 0)
    PARTS['canopy'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, 40.0), note='петля сзади; плюс - передняя кромка вверх; canopy_glass - дочерний объект')
    return [fr, gl]


def windscreen():
    a1 = ARCH_A - 0.05; st = stations(3.620, a1, 0.08)
    b = B(); strip(b, [can_ring(a) for a in st], G_GLASS); gl = b.finish('screen_glass', sharp_deg=60)
    b2 = B(); frame_arch(b2, ARCH_A - 0.056, 0.024, h=0.022); frame_arch(b2, 3.655, 0.030, inset=0.035, h=0.012, drop=0.07); fr = b2.finish('screen_frame', sharp_deg=45)
    return [gl, fr]


# ── пилоны с наклоном наружу (fa18_05), станция под воздухозаборником; точки для паспорта ──
PYLON_DEF = (('o', 4.300, 11.620, 13.000, -0.420), ('m', 3.300, 11.280, 12.850, -0.470), ('i', 2.320, 10.950, 12.720, -0.520))
CANT = 0.087                                                    # наклон наружу: 5°, вниз наружу
PYLON_PTS = {}


def pylon(sx, tag, x, a0, a1, y0):
    b = B(); name = f'pylon_{tag}_' + ('r' if sx > 0 else 'l'); yw = wy(x) - 0.03; hw = 0.058; xb = x + CANT * (wy(x) - y0)
    def sec(a, f=1.0):
        return [P3(a, sx * xb - hw * f, y0), P3(a, sx * xb + hw * f, y0), P3(a, sx * x + hw * f * 0.85, yw), P3(a, sx * x - hw * f * 0.85, yw)]
    st = [a0, a0 + 0.12, a0 + 0.42, a1 - 0.50, a1 - 0.12, a1]; fs = [0.10, 0.70, 1.0, 1.0, 0.65, 0.10]
    b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    PYLON_PTS[name] = P3((a0 + a1) / 2, sx * xb, y0)
    return b.finish(name, sharp_deg=40)


def cheek(sx):
    """Станция на борту под воздухозаборником: балка на гондоле."""
    am = 12.900; x = 1.180; b = B(); name = 'pylon_c_' + ('r' if sx > 0 else 'l'); y0 = -0.900; yt = -0.640; hl, hw = 0.520, 0.042
    def sec(a, f): return [P3(a, sx * x - hw * f, y0), P3(a, sx * x + hw * f, y0), P3(a, sx * x + hw * f * 1.6, yt), P3(a, sx * x - hw * f * 1.6, yt)]
    st = [am - hl, am - hl + 0.10, am + hl - 0.10, am + hl]; fs = [0.2, 1.0, 1.0, 0.2]
    b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    PYLON_PTS[name] = P3(am, sx * x, y0)
    return b.finish(name, sharp_deg=40)


def pod_mount():
    """Точка контейнера по центру снизу."""
    am = 11.400; b = B(); y0 = -0.660; yt = -0.430; hl, hw = 0.650, 0.060
    def sec(a, f): return [P3(a, -hw * f, y0), P3(a, hw * f, y0), P3(a, hw * f * 1.5, yt), P3(a, -hw * f * 1.5, yt)]
    st = [am - hl, am - hl + 0.12, am + hl - 0.12, am + hl]; fs = [0.2, 1.0, 1.0, 0.2]
    b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    PYLON_PTS['pod'] = P3(am, 0.0, y0)
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


# ── подвижные плиты: интерцепторы на наплыве, гак, штанга дозаправки ──
def lex_spoiler(sx):
    a0, a1 = 8.55, 9.45; X0 = Track([(8.55, 0.98), (9.45, 1.06)]); X1 = Track([(8.55, 1.60), (9.45, 1.80)])
    name = 'spoiler_' + ('r' if sx > 0 else 'l')
    ob = patch(name, lambda u, v: (a0 + (a1 - a0) * v, sx * (X0(a0 + (a1 - a0) * v) + (X1(a0 + (a1 - a0) * v) - X0(a0 + (a1 - a0) * v)) * u)), 8, 6, lift=0.003, th=0.012)
    p0 = down(sx * X0(a0), Yb(a0)); p1 = down(sx * X1(a0), Yb(a0)); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized()
    if axis.x < 0: axis = -axis
    _rel(ob, pivot)
    PARTS[name] = dict(pivot=pivot.copy(), axis=-axis, range=(0.0, 60.0), note='интерцептор на наплыве, шарнир спереди; плюс - задняя кромка вверх')
    return ob


def lex_fence():
    """Выступ на верхней стороне наплыва (fa18_02, 03): низкое ребро клином."""
    b = B()
    for sx in (1, -1):
        x = 1.22; a0, a1 = 7.80, 8.42
        for a_, h in ((a0, 0.0),):
            pass
        y0 = down(sx * x, Yb(a0)).z; y1 = down(sx * x, Yb(a1)).z
        pl = [P3(a0, sx * x, y0 - 0.02), P3(a1, sx * x, y1 - 0.02), P3(a1, sx * x, y1 + 0.075), P3(a1 - 0.10, sx * x, y1 + 0.085)]
        b.loft([[p + Vector((0.010, 0, 0)) for p in pl], [p + Vector((-0.010, 0, 0)) for p in pl]], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('s_fence', sharp_deg=40)


def hook():
    """Гак: балка между соплами, шарнир спереди, опускается (fa18_06)."""
    a0, a1 = 15.20, 17.72; y0 = -0.40; pivot = P3(a0, 0.0, y0 + 0.02); b = B()
    def sec(a, h, w): return [P3(a, -w, y0 - h), P3(a, w, y0 - h), P3(a, w, y0 + h), P3(a, -w, y0 + h)]
    # балка повторяет низ киля: сзади выше
    yy = Track([(15.20, -0.415), (16.0, -0.385), (17.0, -0.290), (17.72, -0.180)])
    rg = lambda a, r: [P3(a, r * math.cos(2 * math.pi * q / 10), yy(a) + r * math.sin(2 * math.pi * q / 10)) - pivot for q in range(10)]
    b.loft([rg(a0, 0.035), rg(a0 + 0.2, 0.042), rg(16.6, 0.030), rg(17.0, 0.018), rg(17.45, 0.016)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    # лапа гака
    p = P3(17.45, 0.0, yy(17.45)) - pivot; q = P3(17.72, 0.0, yy(17.72) - 0.05) - pivot; strut(b, p, q, 0.016, G_METAL); strut(b, q, q + Vector((0, 0.08, -0.03)), 0.018, G_METAL)
    # амортизатор и кронштейн в середине (fa18_06)
    m = P3(16.3, 0.0, yy(16.3)) - pivot; strut(b, m + Vector((0.05, 0, 0)), m + Vector((0.05, 0.42, 0.02)), 0.018, G_METAL)
    ob = b.finish('hook', sharp_deg=40); ob.location = pivot
    PARTS['hook'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(-30.0, 0.0), note='0 - убран; минус - лапа вниз')
    return ob


PROBE = dict(a0=2.78, a1=3.42, x0=0.15, x1=0.34, ytop=1.25, ybot=0.40)


def probe_cut():
    P = PROBE; rings = [[P3(a, P['x0'], P['ybot']), P3(a, P['x1'], P['ybot']), P3(a, P['x1'], P['ytop']), P3(a, P['x0'], P['ytop'])] for a in (P['a0'], P['a1'])]
    return loft_obj('c_probe', rings, G_DARK, sharp=20)


def probe():
    """Штанга дозаправки: в нише справа от носа, шарнир сзади, конец поднимается наружу (fa18_01, 02, 03)."""
    x = 0.245; y = 0.520; a_h = 3.380; L_ = 0.580; b = B(); n = 12; pivot = P3(a_h, x, y)
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
    p0 = down(x1, Yb(a0)); p1 = down(x1, Yb(a1)); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized()
    _rel(ob, pivot)
    PARTS['probe_door'] = dict(pivot=pivot.copy(), axis=axis, range=(0.0, 110.0), note='крышка люка штанги; открывается наружу')
    return ob


# ── шасси: размеры ──
GROUND_Y = -1.900
NG = dict(a=4.900, hinge=(5.080, -0.280), rw=0.270, ww=0.150, track=0.190)
MG_A, MG_X = 10.650, 1.580
MAIN_T = (11.650, 1.340, -0.560)                                 # шарнир стойки: a, x, y


def _quiet(*a, **k): pass


def doors():
    out = []
    a0, a1, hw = 4.25, 5.95, 0.215
    for sx in (1, -1):
        n_ = 'door_n_' + ('r' if sx > 0 else 'l')
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * hw * u), 6, 8, dirn=1, lift=0.004, th=0.018, z0=-3.0)
        pivot = P3((a0 + a1) / 2, sx * hw, down(sx * hw, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z - 0.005); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(-80.0 * sx, 0.0) if sx > 0 else (0.0, 80.0), note='0 - закрыта, открытие наружу на 80°')
        out.append(ob)
    for sx in (1, -1):
        n_ = 'door_m_' + ('r' if sx > 0 else 'l'); a0, a1, x0, x1 = 10.75, 12.05, 0.86, 1.36
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + (x1 - x0) * u)), 8, 8, dirn=1, lift=0.004, th=0.020, z0=-3.0)
        pivot = P3((a0 + a1) / 2, sx * x0, down(sx * x0, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z - 0.005); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(0.0, 85.0) if sx > 0 else (-85.0, 0.0), note='0 - закрыта, ось у внутренней кромки')
        out.append(ob)
    return out


def build_skin():
    ib = [inlet_box(1), inlet_box(-1)]
    for o, sx in zip(ib, (1, -1)):
        c = lip_cut(sx); _apply_bool(o, c, 'DIFFERENCE'); _drop(c)
    S = [fore(), mid(), lex(), nacelle(1), nacelle(-1), keel(), ib[0], ib[1], splitter(1), splitter(-1), wing_s(1), wing_s(-1), stab_boss(1), stab_boss(-1)]
    host = S[0]
    for o in S[1:]:
        _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        c = duct_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
        c = bore_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = cock_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'F18_skin'; host.data.name = 'F18_skin'
    bvh_ready(host)
    return host


def plane(stage=9, carve=True):
    """Этапы: 1 - обшивка с крыльями; 2 - рули, оперение, сопла, консоли; 3 - кабина, фонарь, плиты, пилоны; 4 - шасси и створки."""
    import f18_detail as d
    PARTS.clear(); PYLON_PTS.clear()
    skin = build_skin(); out = [skin]
    if stage >= 2:
        out += [fin(1), fin(-1), rudder(1), rudder(-1), stab(1), stab(-1), nozzle(1), nozzle(-1), fan(1), fan(-1), d.burner(1), d.burner(-1)]
        out += [fold(1), fold(-1), slat(1), slat(-1)]
        out += [wing_part('flap_' + n, FLAP, s, LE_I, TE_I, HINGE_I, 'ось по передней кромке; плюс - вниз', (0.0, 45.0)) for s, n in ((1, 'r'), (-1, 'l'))]
        out += [wing_part('aileron_' + n, AIL, s, LE_O, TE_O, HINGE_O, 'ось по передней кромке; плюс - вниз', (-30.0, 45.0)) for s, n in ((1, 'r'), (-1, 'l'))]
    if stage >= 3:
        out += [d.cockpit_detail()]
        out += canopy() + windscreen()
        out += [lex_spoiler(1), lex_spoiler(-1), lex_fence(), hook(), probe(), probe_door()]
        c = probe_cut(); _apply_bool(skin, c, 'DIFFERENCE'); _drop(c); bvh_ready(skin)
        for sx in (1, -1):
            for tag, x, a0, a1, y0 in PYLON_DEF: out.append(pylon(sx, tag, x, a0, a1, y0))
            out.append(cheek(sx))
        out += [pod_mount(), d.details(), d.hinges(), d.seals(), d.inlet_inner(1), d.inlet_inner(-1)] + d.hardpoints()
    if stage >= 4:
        out += doors()
        import f18_gear as gr; out += gr.gear_nose() + gr.gear_main(1) + gr.gear_main(-1)
    if carve:
        print('канавок и выемок:', d.carve(skin))
    if stage >= 4: d.bays(skin)
    d.resharp(skin)
    return out
