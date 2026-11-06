# se_geo.py - геометрия Super Étendard для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z (в glTF: нос -Z, правое крыло +X, верх +Y). Начало - середина длины 14,31 м по оси сопла.
# a - расстояние от острия носа, y - высота над осью сопла. Размеры с фото se_01...12 и габарита нынешней модели игры (длина 14,31, размах 9,61). Сетка и текстуры чужих моделей не используются.
# Сетка: замкнутые оболочки объединяются булевой операцией в одну обшивку без внутренних стенок; киль, стабилизаторы, рули, консоли - отдельные детали с толщиной.
import math
import types
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 14.31
G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_DUCT = 0, 1, 2, 3, 4, 5, 11     # обшивка; металл и механика; нутро; стекло; резина; кабина; канал и ниши
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


class Lin:
    def __init__(self, pts): self.p = pts
    def __call__(self, t):
        p = self.p
        if t <= p[0][0]: return p[0][1]
        for (x0, y0), (x1, y1) in zip(p, p[1:]):
            if t <= x1: return y0 + (y1 - y0) * (t - x0) / max(x1 - x0, 1e-6)
        return p[-1][1]


# ── фюзеляж: узкий и длинный, нос опущен, спина плавно сходит к соплу (se_02, 12) ──
FORE = [(0.000, 0.482, 0.458, 0.012, 2.0, 2.0), (0.100, 0.555, 0.395, 0.085, 2.0, 2.0), (0.350, 0.665, 0.300, 0.205, 2.0, 2.0), (0.750, 0.770, 0.205, 0.325, 2.0, 2.0), (1.300, 0.885, 0.115, 0.425, 2.0, 2.05), (1.800, 0.985, 0.055, 0.490, 2.1, 2.2), (2.500, 1.045, -0.045, 0.540, 2.3, 2.5),
        (3.400, 1.100, -0.170, 0.580, 2.5, 2.6), (3.900, 1.240, -0.230, 0.600, 2.3, 2.6), (4.600, 1.290, -0.300, 0.620, 2.2, 2.6), (5.500, 1.260, -0.400, 0.640, 2.2, 2.6), (6.500, 1.210, -0.500, 0.660, 2.2, 2.6), (7.500, 1.130, -0.540, 0.670, 2.2, 2.5), (8.600, 1.010, -0.550, 0.660, 2.2, 2.4), (9.600, 0.860, -0.550, 0.630, 2.2, 2.3), (10.600, 0.730, -0.530, 0.585, 2.1, 2.2), (11.500, 0.580, -0.490, 0.530, 2.05, 2.1), (12.200, 0.470, -0.440, 0.475, 2.0, 2.0), (12.550, 0.430, -0.420, 0.445, 2.0, 2.0)]
FT = tracks(FORE)
RAD_A = 0.800                                                   # конец чёрного конуса носа


def fore_y(a, x):
    """Высота верхней поверхности над |x|: для порога фонаря."""
    top, bot, hw, nt = FT[0](a), FT[1](a), FT[2](a), FT[3](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nt)
    return cy + ht * q ** (1 / nt)


def fore():
    st = [0.0, 0.03, 0.07, 0.12, 0.2] + stations(0.3, 2.0, 0.10) + stations(2.1, 12.55, 0.20)
    return loft_obj('s_fore', [sup(a, 0.0, *[t(a) for t in FT], 80) for a in st])


# ── заборник: полумесяц на борту сразу за кабиной, плоская сторона к фюзеляжу, косая острая кромка (se_01, 07, 12) ──
INL_A0, INL_A1 = 2.45, 6.60
INL_XI = 0.520
INL_XO = Track([(2.70, 1.020), (3.60, 1.040), (4.60, 1.000), (5.60, 0.920), (6.60, 0.760)])
INL_YT = Track([(2.70, 1.000), (3.60, 0.980), (4.60, 0.900), (5.60, 0.800), (6.60, 0.720)])
INL_YB = Track([(2.70, 0.140), (3.60, 0.060), (4.60, 0.040), (5.60, 0.060), (6.60, 0.240)])
LIP = lambda y: 2.70 + (1.10 - y) * 0.35 / 1.05                 # кромка: верх впереди, низ сзади
DUCT_END = 4.75


def inl_pts(a, inset=0.0, sx=1, xi=None):
    """Полумесяц: снаружи дуга, изнутри прямая стенка. 28 точек."""
    xi = INL_XI if xi is None else xi; xo = INL_XO(a) - inset; yt = INL_YT(a) - inset; yb = INL_YB(a) + inset; xi_ = xi + inset; cy = (yt + yb) / 2; ht = (yt - yb) / 2; out = []
    for i in range(20):
        th = -math.pi / 2 + math.pi * i / 19; c, s_ = math.cos(th), math.sin(th); out.append((xi_ + (xo - xi_) * abs(c) ** (2 / 2.5), cy + ht * math.copysign(abs(s_) ** (2 / 2.5), s_)))
    for i in range(1, 9): out.append((xi_, yt + (yb - yt) * i / 9))
    return [(sx * x, y) for x, y in out] if sx > 0 else [(sx * x, y) for x, y in out]


def inlet_box(sx):
    return loft_obj('s_inl_' + ('r' if sx > 0 else 'l'), [poly_ring(a, inl_pts(max(a, 2.70), 0.0, sx, xi=0.40), 72, 0.03) for a in stations(INL_A0, INL_A1, 0.24)], sharp=46)


def lip_cut(sx, da=0.0):
    """Косой срез: всё, что впереди кромки, убирается. da - сдвиг вперёд: резак канала не должен лежать в той же плоскости."""
    rs = [[P3(a_ - da, sx * x, y_) for a_, y_ in ((LIP(1.30), 1.30), (LIP(-0.10), -0.10), (1.8, -0.10), (1.8, 1.30))] for x in (0.40, 1.30)]
    return loft_obj('c_lip', rs, G_SKIN)


def lip_wall(sx):
    """Плоская щека заборника у фюзеляжа: выступает вперёд кромки сверху и снизу (se_07)."""
    return None


def duct_cut(sx):
    """Канал: тёмный и глухой, стенка без колец и полос в глубине (задание). Кромка острая: стенка 2,8 см."""
    n = 72; rings = []
    for i in range(12):
        a = 2.45 + (DUCT_END - 2.45) * i / 11; r1 = poly_ring(a, inl_pts(max(a, 2.70), 0.028, sx, xi=0.47), n, 0.03); ct = sum(r1, Vector()) / n; k = 1.0 - 0.42 * _sm((a - 3.2) / (DUCT_END - 3.2)); rings.append([ct + (p - ct) * k for p in r1])
    return loft_obj('c_duct_' + ('r' if sx > 0 else 'l'), rings, G_DUCT)


def _sm(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)


# ── крыло: стреловидное, среднее, слабая обратная поперечная V (se_07, 11); складывание по линии шарнира (se_04) ──
FOLD_X = 3.850; FOLD_GAP = 0.003
XTIP = 4.803
def wy(x): return 0.420 - 0.055 * (x - 0.9)
def _rt(x): return ((max(x, 4.35) - 4.35) / (XTIP - 4.35)) ** 2       # скругление законцовки (se_08, 11)
LE_I = lambda x: 5.050 + 1.000 * (x - 0.60) + 0.42 * _rt(x)
TE_I = lambda x: 9.000 + 0.420 * (x - 0.60) - 0.30 * _rt(x)
LE_O, TE_O = LE_I, TE_I
SLAT_I = lambda x: 0.360 - 0.0300 * (x - 1.05)                  # хорда предкрылка
SLAT_O = SLAT_I
HINGE_I = lambda x: TE_I(x) - 1.020                             # линия навески закрылка
HINGE_O = lambda x: TE_I(x) - 0.580                             # элерона
FLAP = (0.750, 2.500); AIL = (2.550, 3.800); SLAT_X = (1.050, 4.300)
GAP = 0.012
TC = Track([(0.550, 0.050), (4.300, 0.040), (XTIP, 0.022)])


def _wsec(sx, x):
    """Кольцо неподвижной части: круглые вырезы под предкрылок спереди и под закрылок или элерон сзади."""
    c = TE_I(x) - LE_I(x); tc = TC(x); le = LE_I(x)
    if SLAT_X[0] - 1e-6 <= x <= SLAT_X[1] + 1e-6: us, head = cove_cut_f(le, c, tc, le + SLAT_I(x))
    else: us = 0.0008; head = cove_wall_f(le, c, tc, us)
    if FLAP[0] - 1e-6 <= x <= FLAP[1] + 1e-6: ue, tail = cove_cut(le, c, tc, HINGE_I(x))
    elif AIL[0] - 1e-6 <= x <= AIL[1] + 1e-6: ue, tail = cove_cut(le, c, tc, HINGE_O(x))
    else: ue = 1.0; tail = cove_wall(le, c, tc, 1.0)
    return foil_ring(le, c, tc, us, ue, 18, lambda a, h: P3(a, sx * x, wy(x) + h), tail=tail, head=head)


def wing_s(sx):
    k = [0.55, 0.65, 0.745, 0.75, 1.045, 1.05, 2.50, 2.505, 2.545, 2.55, 3.80, 3.805, FOLD_X - FOLD_GAP]
    xs = sorted(set(round(v, 4) for v in k + [1.05 + (2.50 - 1.05) * i / 6 for i in range(1, 6)] + [2.55 + (3.80 - 2.55) * i / 5 for i in range(1, 5)]))
    return loft_obj('s_wing_' + ('r' if sx > 0 else 'l'), [_wsec(sx, x) for x in xs], sharp=48)


def fold(sx):
    """Складная консоль: разрез настоящий, шарнир по линии складывания, законцовка округлая. В игре не двигается."""
    name = 'fold_' + ('r' if sx > 0 else 'l'); k = [FOLD_X + FOLD_GAP, 4.00, 4.15, 4.30, 4.305, 4.40, 4.50, 4.60, 4.68, 4.74, 4.78, XTIP]
    pivot = P3((LE_I(FOLD_X) + TE_I(FOLD_X)) / 2, sx * FOLD_X, wy(FOLD_X) + 0.05)
    b = B(); b.loft([[v - pivot for v in _wsec(sx, x)] for x in k], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    ob = b.finish(name, sharp_deg=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=((-90.0, 0.0) if sx > 0 else (0.0, 90.0)), note='складывание вверх; в игре не двигается')
    return ob


def wing_part(name, spec, sx, HG, note, rng):
    x0, x1 = spec; x0 += 0.006; x1 -= 0.006
    pv0 = P3(HG(x0), sx * x0, wy(x0)); pv1 = P3(HG(x1), sx * x1, wy(x1)); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    for i in range(9):
        x = x0 + (x1 - x0) * i / 8; c = TE_I(x) - LE_I(x); ah = HG(x)
        rings.append([v - pivot for v in foil_ring(LE_I(x), c, TC(x), (ah - LE_I(x)) / c, 1.0, 9, lambda a, h: P3(a, sx * x, wy(x) + h), head=cove_nose(LE_I(x), c, TC(x), ah))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=rng, note=note)
    return ob


def slat(sx):
    """Предкрылок: внутренняя и внешняя секции одной детали; ось в центре круглой задней части (se_09)."""
    name = 'slat_' + ('r' if sx > 0 else 'l'); b = B()
    xa, xb = SLAT_X[0] + 0.016, FOLD_X - 0.020
    p0 = P3(LE_I(xa) + SLAT_I(xa), sx * xa, wy(xa)); p1 = P3(LE_I(xb) + SLAT_I(xb), sx * xb, wy(xb)); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized()
    if axis.x > 0: axis = -axis                                 # плюс - носок вниз
    def sec(x):
        c = TE_I(x) - LE_I(x); le = LE_I(x); sl = SLAT_I(x)
        return [v - pivot for v in foil_ring(le, c, TC(x), 0.0008, sl / c, 12, lambda a, h: P3(a, sx * x, wy(x) + h), tail=cove_tail(le, c, TC(x), le + sl), head=cove_wall_f(le, c, TC(x), 0.0008))]
    b.loft([sec(xa + (xb - xa) * i / 7) for i in range(8)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    xa2, xb2 = FOLD_X + FOLD_GAP + 0.012, SLAT_X[1] - 0.016
    b.loft([sec(xa2 + (xb2 - xa2) * i / 3) for i in range(4)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    ob = b.finish(name, sharp_deg=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(0.0, 20.0), note='две секции одной детали, ось в центре круглой задней части; плюс - носок вниз')
    return ob


# ── киль: большой, стреловидный (se_04, 09, 12); стабилизатор высоко на его основании, у основания контейнер и шар ──
FIN_T = 0.030
F_LE = Lin([(0.300, 7.380), (2.550, 12.950)])
F_TE = Lin([(0.300, 12.000), (2.550, 13.620)])
RUD = (1.280, 2.300)
RUD_C = Track([(1.280, 0.620), (2.300, 0.480)])
STAB_Y, STAB_DY, STAB_A = 1.040, -0.020, 12.100
STAB_XR = 0.165
S_LE = Lin([(STAB_XR, 10.960), (2.620, 13.950)])
S_TE = Lin([(STAB_XR, 12.860), (2.350, 14.050), (2.620, 14.310)])


def fin():
    ys = [0.30, 0.60, 0.90, 1.20, 1.275, 1.28] + [1.28 + (2.30 - 1.28) * i / 6 for i in range(1, 7)] + [2.304, 2.40, 2.50, 2.55]
    rings = []
    for y in ys:
        c = F_TE(y) - F_LE(y)
        if RUD[0] - 1e-6 <= y <= RUD[1] + 1e-6: ue, tail = cove_cut(F_LE(y), c, FIN_T, F_TE(y) - RUD_C(y), 0.006)
        else: ue, tail = 1.0, cove_wall(F_LE(y), c, FIN_T, 1.0)
        rings.append(foil_ring(F_LE(y), c, FIN_T, 0.0008, ue, 16, lambda a, h: P3(a, h, y), tail=tail, head=cove_wall_f(F_LE(y), c, FIN_T, 0.0008)))
    b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    # наплыв у стабилизатора: стабилизатор примыкает к нему, сзади стекает на нет
    tr = Track([(10.70, 0.012), (11.10, 0.105), (12.00, 0.150), (12.80, 0.120), (13.05, 0.012)]); hh = Track([(10.70, 0.012), (11.10, 0.085), (12.00, 0.110), (12.80, 0.090), (13.05, 0.012)])
    b.loft([sup(a, 0.0, STAB_Y + hh(a), STAB_Y - hh(a), tr(a), 2.2, 2.2, 20) for a in stations(10.70, 13.05, 0.20)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    # длинный антенный контейнер на борту киля (se_04, 09, 12), обе стороны
    for sx in (1, -1):
        hx = Track([(11.95, 0.004), (12.10, 0.030), (13.40, 0.040), (13.75, 0.006)]); hz = Track([(11.95, 0.006), (12.10, 0.040), (13.40, 0.044), (13.75, 0.006)])
        y_ = 2.05
        rg = lambda a: [P3(a, sx * (0.020 + hx(a) * (1 + math.cos(2 * math.pi * q / 10))), y_ + hz(a) * math.sin(2 * math.pi * q / 10)) for q in range(10)]
        b.loft([rg(a) for a in (11.95, 12.03, 12.10, 12.40, 13.00, 13.40, 13.60, 13.75)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('fin_c', sharp_deg=48)


def rudder():
    y0, y1 = RUD; h0 = F_TE(y0) - RUD_C(y0); h1 = F_TE(y1) - RUD_C(y1); p0 = P3(h0, 0.0, y0); p1 = P3(h1, 0.0, y1); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized(); rings = []
    for i in range(9):
        y = y0 + 0.004 + (y1 - y0 - 0.008) * i / 8; c = F_TE(y) - F_LE(y); ah = F_TE(y) - RUD_C(y)
        rings.append([v - pivot for v in foil_ring(F_LE(y), c, FIN_T, (ah - F_LE(y)) / c, 1.0, 9, lambda a, h: P3(a, h, y), head=cove_nose(F_LE(y), c, FIN_T, ah))])
    ob = loft_obj('rudder', rings, sharp=48); ob.location = pivot
    PARTS['rudder'] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-28.0, 28.0), note='ось в центре круглого носа, снизу вверх')
    return ob


def stab(sx):
    name = 'stab_' + ('r' if sx > 0 else 'l'); pivot = P3(STAB_A, sx * STAB_XR, STAB_Y)
    xs = [STAB_XR, 0.24, 0.36, 0.55] + [0.55 + (2.35 - 0.55) * i / 7 for i in range(1, 8)] + [2.45, 2.55, 2.60, 2.62]
    rings = []
    for x in xs:
        c = S_TE(x) - S_LE(x); rings.append([v - pivot for v in foil_ring(S_LE(x), c, 0.036, 0.0, 1.0, 22, lambda a, h: P3(a, sx * x, STAB_Y + STAB_DY * (x - STAB_XR) + h))])
    b = B(); r0 = rings[0]; nr = len(r0); inner = [(r0[k] + r0[nr - 1 - k]) / 2 for k in range(nr)]
    b.loft([inner] + rings, G_SKIN, cap1=G_SKIN)
    n = 14; rg = lambda x_, r: [P3(STAB_A + r * math.cos(2 * math.pi * k / n), sx * x_, STAB_Y + r * math.sin(2 * math.pi * k / n)) - pivot for k in range(n)]
    b.loft([rg(STAB_XR - 0.03, 0.050), rg(STAB_XR + 0.03, 0.050)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    ob = b.finish(name, sharp_deg=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(-20.0, 20.0), note='цельноповоротный; ось поперёк у киля; плюс - задняя кромка вниз')
    return ob


# ── сопло: одно, короткое, круглое, без форсажных лепестков (se_04, 09, 10) ──
NOZ_Y, NOZ_A0, NOZ_A, NOZ_R = 0.000, 12.500, 12.860, 0.405


def nozzle():
    b = B(); n = 64; ring = lambda a, r: [P3(a, r * math.sin(2 * math.pi * k / n), NOZ_Y - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    sec = [ring(NOZ_A0 - 0.02, 0.452), ring(NOZ_A0 + 0.04, 0.456), ring(NOZ_A - 0.12, 0.445), ring(NOZ_A - 0.03, 0.436), ring(NOZ_A, 0.428), ring(NOZ_A, NOZ_R), ring(NOZ_A - 0.30, 0.400), ring(NOZ_A0 - 0.02, 0.396)]
    b.loft(sec + [sec[0]], G_METAL)
    return b.finish('nozzle', sharp_deg=30)


def bore_cut():
    n = 56; ring = lambda a, r: [P3(a, r * math.sin(2 * math.pi * k / n), NOZ_Y - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    prof = [(12.70, 0.398, G_METAL), (12.20, 0.395, G_METAL), (11.70, 0.385, G_COCK), (11.30, 0.375, G_DARK), (11.00, 0.230, G_DARK), (10.90, 0.030, G_DARK)]
    b = B(); b.loft([ring(a, r) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK)
    return b.finish('c_bore', sharp_deg=30)


# ── кабина: выемка, одно кресло; фонарь со сплошной рамой, козырёк (se_02, 07) ──
CK_A0, CK_A1 = 2.120, 3.900
CK_HW = Track([(2.12, 0.240), (2.40, 0.360), (2.62, 0.390), (3.00, 0.410), (3.40, 0.400), (3.70, 0.340), (3.90, 0.260)])
FLOOR = 0.220


def cock_cut():
    def sec(a, y0, y1, hw): return [P3(a, -hw, y0), P3(a, hw, y0), P3(a, hw, y1), P3(a, -hw, y1)]
    return loft_obj('c_cock', [sec(a, FLOOR - 0.004, 1.90, CK_HW(a)) for a in stations(CK_A0, CK_A1, 0.07)], G_COCK, sharp=25)


CANOPY = [(1.820, fore_y(1.820, 0.0) + 0.004, 0.260), (2.100, 1.200, 0.360), (2.450, 1.400, 0.410), (2.800, 1.500, 0.430), (3.100, 1.520, 0.440), (3.400, 1.470, 0.420), (3.700, 1.360, 0.360), (3.900, 1.280, 0.280), (4.020, 1.240, 0.190)]
CAN_T = tracks(CANOPY)
CAN_HINGE = (4.060, 1.215)
ARCH_A = 2.620
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
    a0 = ARCH_A; a1 = 3.970; st = stations(a0 + 0.004, a1, 0.12); pivot = P3(CAN_HINGE[0], 0.0, CAN_HINGE[1])
    gl = glass_shell('canopy_glass', st)
    for v in gl.data.vertices: v.co -= pivot
    gl.location = pivot
    b = B(); frame_arch(b, a0 + 0.030, 0.030, h=0.024)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        b.loft([[rail(a, 0.004, 0.014), rail(a, 0.018, 0.012), rail(a, 0.018, 0.030), rail(a, -0.012, 0.046), rail(a, -0.012, 0.024)] for a in stations(a0, a1, 0.07)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    strip(b, [can_ring(a1 - 0.03, 0.006), can_ring(a1 - 0.03, -0.020), can_ring(a1 + 0.02, -0.020), can_ring(a1 + 0.02, 0.006), can_ring(a1 - 0.03, 0.006)], G_SKIN)
    for sg in (1, -1):
        for a in (2.85, 3.15, 3.45, 3.72):
            y = SILL(a); x = sg * (CAN_T[1](a) - 0.022)
            b.loft([[P3(a, x - 0.009, y + 0.004), P3(a + 0.05, x - 0.009, y + 0.004), P3(a + 0.05, x + 0.009, y + 0.004), P3(a, x + 0.009, y + 0.004)], [P3(a, x - 0.009, y + 0.015), P3(a + 0.05, x - 0.009, y + 0.015), P3(a + 0.05, x + 0.009, y + 0.015), P3(a, x + 0.009, y + 0.015)]], G_METAL, cap0=G_METAL, cap1=G_METAL)
    fr = b.finish('canopy', sharp_deg=45)
    for v in fr.data.vertices: v.co -= pivot
    fr.location = pivot; gl.parent = fr; gl.location = (0, 0, 0)
    PARTS['canopy'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, 40.0), note='петля сзади; плюс - передняя кромка вверх; canopy_glass - дочерний объект')
    return [fr, gl]


def windscreen():
    a1 = ARCH_A - 0.05; st = stations(1.840, a1, 0.08)
    b = B(); strip(b, [can_ring(a) for a in st], G_GLASS); gl = b.finish('screen_glass', sharp_deg=60)
    b2 = B(); frame_arch(b2, ARCH_A - 0.030, 0.028, h=0.022); frame_arch(b2, 1.870, 0.030, inset=0.035, h=0.012, drop=0.07); fr = b2.finish('screen_frame', sharp_deg=45)
    return [gl, fr]



# ── пилоны: два под крылом, две точки под фюзеляжем (как у нынешней модели в игре), крепление контейнера ──
PYLON_DEF = (('o', 3.050, 8.200, 9.350, -0.150), ('i', 2.050, 7.180, 8.430, -0.100))
FUSE_DEF = (('f', 0.380, 9.350), ('a', 0.380, 10.550))
POD = (7.300, 0.000)
PYLON_PTS = {}


def pylon(sx, tag, x, a0, a1, y0):
    b = B(); name = f'pylon_{tag}_' + ('r' if sx > 0 else 'l'); yw = wy(x) - 0.03; hw = 0.055
    def sec(a, f=1.0): return [P3(a, sx * x - hw * f, y0), P3(a, sx * x + hw * f, y0), P3(a, sx * x + hw * f * 0.85, yw), P3(a, sx * x - hw * f * 0.85, yw)]
    st = [a0, a0 + 0.12, a0 + 0.40, a1 - 0.45, a1 - 0.12, a1]; fs = [0.10, 0.70, 1.0, 1.0, 0.65, 0.10]
    b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    PYLON_PTS[name] = P3((a0 + a1) / 2, sx * x, y0)
    return b.finish(name, sharp_deg=40)


def flush_points():
    """Точки под фюзеляжем и контейнера: заподлицо с обшивкой, выступающих плит нет (на фото их нет)."""
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

# ── щитки с рядами круглых отверстий под фюзеляжем, петля спереди, цилиндр (se_01, 05, 06): главный признак снизу ──
BRK = (5.620, 6.820, 0.110, 0.590)


def brake(sx):
    n_ = 'brake_' + ('r' if sx > 0 else 'l'); a0, a1, x0, x1 = BRK
    ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + (x1 - x0) * u)), 12, 14, dirn=1, lift=0.006, th=0.022, z0=-3.0)
    # отверстия настоящей геометрией: один резак из цилиндров
    b = B(); bm = None
    for i in range(5):
        for j in range(7):
            x_ = x0 + (x1 - x0) * (i + 0.5) / 5; a_ = a0 + (a1 - a0) * (j + 0.5) / 7
            if (i + j) % 2 and False: continue
            h = down(sx * x_, Yb(a_), z0=-3.0, dirn=1); r_ = 0.034; n = 14
            rg = lambda z_: [P3(a_ + r_ * math.cos(2 * math.pi * q / n), sx * x_ + r_ * math.sin(2 * math.pi * q / n), z_) for q in range(n)]
            b.loft([rg(h.z - 0.12), rg(h.z + 0.09)], G_DARK, cap0=G_DARK, cap1=G_DARK)
    c = b.finish('c_brk', sharp_deg=20); _apply_bool(ob, c, 'DIFFERENCE'); _drop(c)
    xm = sx * (x0 + x1) / 2; pivot = P3(a0, xm, down(xm, Yb(a0), z0=-3.0, dirn=1).z + 0.012); _rel(ob, pivot)
    PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, 62.0), note='петля спереди; плюс - задняя кромка вниз; цилиндр - det_brk_cyl')
    h_pl = down(xm, Yb(a0 + 0.72), z0=-3.0, dirn=1); pe = Vector((xm, Yb(a0 + 0.72), h_pl.z + 0.03)); pc0 = P3(a0 + 0.10, xm, h_pl.z + 0.20)
    bc = B(); rg = lambda c_, u, v, r: [c_ + (u * math.cos(2 * math.pi * q / 10) + v * math.sin(2 * math.pi * q / 10)) * r for q in range(10)]
    d = pe - pc0; dd = d.normalized(); U_ = Vector((1, 0, 0)); V_ = dd.cross(U_).normalized(); pm = pc0 + dd * (d.length * 0.55)
    bc.loft([rg(pc0, U_, V_, 0.034), rg(pm, U_, V_, 0.034)], G_METAL, cap0=G_METAL, cap1=G_METAL); bc.loft([rg(pm - dd * 0.04, U_, V_, 0.018), rg(pe, U_, V_, 0.018)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return [ob, bc.finish('det_brk_cyl_' + ('r' if sx > 0 else 'l'), sharp_deg=45)]


# ── гак: длинный, раздвоенный у основания, под хвостом (se_04, 05, 06) ──
def hook():
    a0 = 9.620; y0 = -0.540; pivot = P3(a0, 0.0, y0 + 0.02); b = B(); yy = Track([(9.62, -0.545), (10.60, -0.545), (11.60, -0.505), (12.40, -0.452), (12.92, -0.430)]); apex = 11.10
    for sg in (1, -1):
        A = P3(a0, sg * 0.235, yy(a0) + 0.004) - pivot; Q = P3(apex, 0.0, yy(apex)) - pivot; strut(b, A, Q, 0.024, G_METAL)
        strut(b, A + Vector((-sg * 0.04, 0, 0)), A + Vector((sg * 0.04, 0, 0)), 0.034, G_METAL)
    n = 12; rg = lambda a, r: [P3(a, r * math.cos(2 * math.pi * q / n), yy(a) + r * math.sin(2 * math.pi * q / n)) - pivot for q in range(n)]
    b.loft([rg(apex - 0.05, 0.030), rg(apex + 0.25, 0.030), rg(12.30, 0.024), rg(12.72, 0.022)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    p = P3(12.72, 0.0, yy(12.72)) - pivot; q = P3(12.92, 0.0, yy(12.92) - 0.055) - pivot; strut(b, p, q, 0.026, G_METAL); strut(b, q, q + Vector((0, 0.10, -0.022)), 0.022, G_METAL)
    ob = b.finish('hook', sharp_deg=40); ob.location = pivot
    PARTS['hook'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, 38.0), note='0 - убран под хвост; плюс - лапа вниз')
    return ob


# ── штанга дозаправки: обтекатель сверху справа перед козырьком, штанга поднимается из него (se_05, 07) ──
PROBE = dict(a0=1.060, a1=1.900)
def _prb_x(a): return 0.220 + 0.145 * (a - 1.06)                 # обтекатель идёт по плечу носа к борту козырька
def _prb_y(a): return fore_y(a, _prb_x(a)) + 0.035


def probe_fairing():
    a0, a1 = PROBE['a0'] - 0.02, PROBE['a1'] + 0.30; rr = Track([(a0, 0.012), (a0 + 0.12, 0.060), (a0 + 0.60, 0.072), (a1 - 0.25, 0.072), (a1, 0.010)]); n = 14
    return loft_obj('s_prb', [[P3(a, _prb_x(a) + rr(a) * math.cos(2 * math.pi * q / n), _prb_y(a) + rr(a) * math.sin(2 * math.pi * q / n)) for q in range(n)] for a in stations(a0, a1, 0.10)], G_SKIN, sharp=45)


def probe():
    """0 - убрана в обтекатель; конец виден шаром спереди (se_07); плюс - конец вверх и вперёд (se_05)."""
    a_h = PROBE['a1']; y_h = _prb_y(a_h) + 0.012; pivot = P3(a_h, _prb_x(a_h), y_h); b = B(); n = 12; L_ = a_h - PROBE['a0'] + 0.10; y1 = _prb_y(PROBE['a0']) + 0.012
    rg = lambda d, r: [P3(a_h - d, _prb_x(a_h - d) + r * math.cos(2 * math.pi * q / n), y_h + (y1 - y_h) * d / L_ + r * math.sin(2 * math.pi * q / n)) - pivot for q in range(n)]
    b.loft([rg(d, r) for d, r in ((0.0, 0.034), (0.20, 0.030), (L_ - 0.20, 0.028), (L_ - 0.16, 0.050), (L_ - 0.08, 0.058), (L_ - 0.02, 0.040), (L_, 0.012))], G_METAL, cap0=G_METAL, cap1=G_METAL)
    ob = b.finish('probe', sharp_deg=40); ob.location = pivot
    PARTS['probe'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, 38.0), note='шарнир сзади в обтекателе; 0 - убрана; плюс - конец вверх')
    return ob


# ── шасси: размеры ──
GROUND_Y = -1.310
NG = dict(a=3.420, hinge=(3.060, -0.060), rw=0.215, ww=0.120)
MG_A, MG_X = 7.750, 1.660
MAIN_T = (7.720, 1.540, 0.240)                                  # шарнир стойки: a, x, y
NOSE_BAY = (2.640, 3.640, 0.190)
MAIN_BAY = (7.000, 7.950, 0.400, 1.760)


def doors():
    out = []; a0, a1, hw = NOSE_BAY
    for sx in (1, -1):
        n_ = 'door_n_' + ('r' if sx > 0 else 'l')
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * hw * u), 6, 8, dirn=1, lift=0.004, th=0.016, z0=-3.0)
        pivot = P3((a0 + a1) / 2, sx * hw, down(sx * hw, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z - 0.005); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(-80.0, 0.0) if sx > 0 else (0.0, 80.0), note='0 - закрыта, открытие наружу на 80°')
        out.append(ob)
    a0, a1, x0, x1 = MAIN_BAY; xm = 1.280
    for sx in (1, -1):
        n_ = 'door_m_' + ('r' if sx > 0 else 'l')
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + (xm - 0.004 - x0) * u)), 8, 8, dirn=1, lift=0.004, th=0.018, z0=-3.0)
        pivot = P3((a0 + a1) / 2, sx * x0, down(sx * x0, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z - 0.005); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(0.0, 85.0) if sx > 0 else (-85.0, 0.0), note='0 - закрыта, ось у внутренней кромки')
        out.append(ob)
        n_ = 'door_o_' + ('r' if sx > 0 else 'l')
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (xm + 0.004 + (x1 - xm - 0.004) * u)), 8, 8, dirn=1, lift=0.004, th=0.018, z0=-3.0)
        pivot = P3((a0 + a1) / 2, sx * x1, down(sx * x1, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z - 0.005); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(-85.0, 0.0) if sx > 0 else (0.0, 85.0), note='0 - закрыта, ось у внешней кромки')
        out.append(ob)
    return out


def build_skin():
    ib = [inlet_box(1), inlet_box(-1)]
    for o, sx in zip(ib, (1, -1)):
        c = lip_cut(sx); _apply_bool(o, c, 'DIFFERENCE'); _drop(c)
    S = [fore(), ib[0], ib[1], wing_s(1), wing_s(-1), probe_fairing()]
    host = S[0]
    for o in S[1:]:
        _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        c = duct_cut(sx); l_ = lip_cut(sx, 0.012); _apply_bool(c, l_, 'DIFFERENCE'); _drop(l_); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)     # канал начинается ровно у кромки: иначе режет борт впереди неё
    c = bore_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = cock_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'SE_skin'; host.data.name = 'SE_skin'
    bvh_ready(host)
    return host


def plane(stage=9, carve=True):
    """Этапы: 1 - обшивка с крыльями; 2 - рули, оперение, сопло, консоли; 3 - кабина, фонарь, плиты, пилоны; 4 - шасси и створки."""
    import se_detail as d
    PARTS.clear(); PYLON_PTS.clear()
    skin = build_skin(); out = [skin]
    ref_me = skin.data.copy(); d.resharp(types.SimpleNamespace(data=ref_me))   # гладкая обшивка до резки
    if stage >= 2:
        out += [fin(), rudder(), stab(1), stab(-1), nozzle(), d.burner()]
        out += [fold(1), fold(-1), slat(1), slat(-1)]
        out += [wing_part('flap_' + n, FLAP, s, HINGE_I, 'ось в центре круглого носа; плюс - вниз (se_09, 10, 11)', (0.0, 45.0)) for s, n in ((1, 'r'), (-1, 'l'))]
        out += [wing_part('aileron_' + n, AIL, s, HINGE_O, 'ось в центре круглого носа; плюс - вниз', (-25.0, 25.0)) for s, n in ((1, 'r'), (-1, 'l'))]
    if stage >= 3:
        out += [d.cockpit_detail()]
        out += canopy() + windscreen()
        out += brake(1) + brake(-1) + [hook(), probe()]
        for sx in (1, -1):
            for tag, x, a0, a1, y0 in PYLON_DEF: out.append(pylon(sx, tag, x, a0, a1, y0))
        flush_points()
        out += [d.details(), d.hinges(), d.seals()] + d.hardpoints() + [d.plates()]
    if stage >= 4:
        out += doors()
        import se_gear as gr; out += gr.gear_nose() + gr.gear_main(1) + gr.gear_main(-1)
    if carve:
        print('канавок и выемок:', d.carve(skin))
    if stage >= 3: d.bays(skin)
    d.resharp(skin); print('нормали обшивки:', d.smooth_normals(skin, ref_me)); bpy.data.meshes.remove(ref_me)
    return out
