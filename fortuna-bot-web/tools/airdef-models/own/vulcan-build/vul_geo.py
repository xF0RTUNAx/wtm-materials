# vul_geo.py - геометрия Avro Vulcan B.2 для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z (в glTF: нос -Z, правое крыло +X, верх +Y).
# a - расстояние от острия штанги дозаправки назад (0 ... 30,72 - конец хвостового конуса); таблицы записаны высотой z над землёй (стоянка на своих колёсах),
# в сетку идёт y = z - ZA (плоскость хорд корня крыла). План крыла снят с фото vulcan_03 (вид снизу, _rectify.py: аффинное выпрямление по острию штанги,
# хвостовому конусу и концам крыла), длина и размах - по прежней модели игры (30,72 и 33,67 м), высоты - с фото vulcan_04, 05, 06.
# Сетки и текстуры чужих моделей не используются.
import math
import types
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 30.72
ZA = 3.000                                                      # плоскость хорд корня над землёй
G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_DUCT = 0, 1, 2, 3, 4, 5, 11
PARTS = {}       # имя -> dict(pivot, axis, range, note[, kind='slide'])
STATIONS = {}    # точки подвески в отсеке
SHRIKE = {}      # точки Shrike под крылом


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


def box3(b, c, hx, hy, hz, mat=G_COCK):
    """Брусок по осям мира: центр c (Vector), полуразмеры."""
    rg = lambda y: [c + Vector((-hx, y, -hz)), c + Vector((hx, y, -hz)), c + Vector((hx, y, hz)), c + Vector((-hx, y, hz))]
    b.loft([rg(-hy), rg(hy)], mat, cap0=mat, cap1=mat)


def thk(u):
    return 5 * (0.2969 * math.sqrt(max(u, 0)) - 0.1260 * u - 0.3516 * u ** 2 + 0.2843 * u ** 3 - 0.1015 * u ** 4)


def foil_ring(a_le, chord, tc, u0, u1, nu, place, tail=None, head=None, hfun=None):
    """Замкнутый контур хорды от u0 до u1: place(a, h) -> Vector. tail - точки (a, h) сзади, сверху вниз; head - точки спереди, снизу вверх. hfun(u) - своя полутолщина."""
    us = [u0 + (u1 - u0) * (1 - math.cos(math.pi * i / (nu - 1))) / 2 for i in range(nu)]
    if nu == 40 and chord > 6.0:                                    # крыло: гуще в первых 4 м хорды (тупой корень с заборником)
        d_ = [0.0, 0.004, 0.015, 0.035, 0.07, 0.12, 0.20, 0.30, 0.42, 0.56, 0.72, 0.90, 1.10, 1.32, 1.56, 1.82, 2.10, 2.40, 2.72, 3.06, 3.42, 3.80, 4.20]
        us = [u0 + (d / chord) * (u1 - u0) for d in d_]; n2 = nu - len(us); ua = us[-1]
        us += [ua + (u1 - ua) * (1 - math.cos(math.pi * (i + 1) / n2)) / 2 for i in range(n2)]
    hf = hfun or (lambda u: tc * chord * thk(u))
    up = [place(a_le + chord * u, +hf(u)) for u in us]
    lo = [place(a_le + chord * u, -hf(u)) for u in reversed(us)]
    return up + [place(a_, h_) for a_, h_ in (tail or [])] + lo + [place(a_, h_) for a_, h_ in (head or [])]


# Рули: круглый нос ходит в круглом вырезе неподвижной части: щель одна при любом угле, ступеньки нет, насквозь не видно.
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


# ── фюзеляж: штанга, круглый нос-обтекатель локатора, кабина, горб-хребет до киля, хвостовой конус аппаратуры (vulcan_04, 05, 06) ──
# (a, верх z, низ z, полуширина, показатель верха, показатель низа)
FUS = [(2.30, 3.565, 3.495, 0.020, 2.0, 2.0), (2.40, 3.660, 3.400, 0.130, 2.0, 2.0), (2.60, 3.800, 3.250, 0.270, 2.0, 2.0), (3.00, 3.990, 3.050, 0.470, 2.0, 2.0),
       (3.60, 4.200, 2.840, 0.680, 2.0, 2.05), (4.40, 4.420, 2.620, 0.890, 2.0, 2.1), (5.30, 4.620, 2.460, 1.060, 2.05, 2.2), (6.30, 4.780, 2.350, 1.200, 2.1, 2.3),
       (7.40, 4.900, 2.280, 1.310, 2.1, 2.4), (8.80, 4.950, 2.240, 1.390, 2.15, 2.5), (10.30, 4.900, 2.210, 1.410, 2.2, 2.6), (12.00, 4.760, 2.230, 1.380, 2.2, 2.6),
       (14.00, 4.560, 2.300, 1.260, 2.2, 2.5), (16.50, 4.390, 2.400, 1.230, 2.2, 2.4), (19.50, 4.230, 2.450, 1.180, 2.2, 2.3), (22.50, 4.110, 2.480, 1.100, 2.2, 2.4),
       (25.50, 3.990, 2.450, 0.900, 2.15, 2.8), (27.40, 3.960, 2.420, 0.840, 2.1, 3.2), (28.60, 3.950, 2.410, 0.840, 2.1, 3.4), (29.00, 3.930, 2.415, 0.835, 2.1, 3.3),
       (29.40, 3.860, 2.450, 0.790, 2.05, 3.0), (29.75, 3.720, 2.540, 0.660, 2.0, 2.6), (30.00, 3.560, 2.620, 0.530, 2.0, 2.3), (30.20, 3.470, 2.610, 0.440, 2.0, 2.1),
       # конус без ступеньки переходит в купол локатора (Mark 2026-11-10: «хвост должен продолжаться в этот кругляшок»)
       (30.40, 3.400, 2.660, 0.370, 2.0, 2.0), (30.55, 3.330, 2.730, 0.300, 2.0, 2.0), (30.64, 3.250, 2.810, 0.220, 2.0, 2.0), (30.69, 3.170, 2.890, 0.140, 2.0, 2.0),
       (30.71, 3.100, 2.960, 0.070, 2.0, 2.0), (30.72, 3.035, 3.025, 0.005, 2.0, 2.0)]
FT = tracks([(r[0], Z(r[1]), Z(r[2]), r[3], r[4], r[5]) for r in FUS])
NOSE_A = 2.30


def fore_y(a, x):
    """Высота верхней поверхности фюзеляжа над |x| (y)."""
    top, bot, hw, nt = FT[0](a), FT[1](a), FT[2](a), FT[3](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nt)
    return cy + ht * q ** (1 / nt)


def fore_bot(a, x):
    top, bot, hw, nb = FT[0](a), FT[1](a), FT[2](a), FT[4](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nb)
    return cy - ht * q ** (1 / nb)


def fuselage():
    st = [NOSE_A, 2.31, 2.33, 2.36, 2.40, 2.46, 2.55, 2.68, 2.85, 3.05, 3.30] + stations(3.45, 29.4, 0.20) + stations(29.5, 30.6, 0.05) + [30.64, 30.67, 30.69, 30.70, 30.71, 30.715, 30.72]
    return loft_obj('s_fus', [sup(a, 0.0, *[t(a) for t in FT], 96) for a in st])


# ── купол локатора на торце хвостового конуса (фото 06, сзади): полусфера меньше торца, торец плоский кольцом ──
DOME = dict(a=30.25, z=3.030, r=0.330, d=0.42)
def tail_dome():
    n = 48; rs = []
    for i in range(12):
        ang = i / 11 * math.pi / 2; a = DOME['a'] + DOME['d'] * math.sin(ang)
        r = max(0.012, DOME['r'] * math.cos(ang))
        if i == 0:                                              # заход внутрь конуса, чтобы объединение было без щели
            rs.append([P3(DOME['a'] - 0.20, DOME['r'] * 0.97 * math.sin(2 * math.pi * k / n), Z(DOME['z']) - DOME['r'] * 0.97 * math.cos(2 * math.pi * k / n)) for k in range(n)])
        rs.append([P3(a, r * math.sin(2 * math.pi * k / n), Z(DOME['z']) - r * math.cos(2 * math.pi * k / n)) for k in range(n)])
    return loft_obj('s_dome', rs, sharp=50)


def tail_vents():
    """Решётки охлаждения аппаратуры по бортам конуса: неглубокие тёмные выемки."""
    out = []
    for sx in (1, -1):
        for a0, z0 in ((28.25, 3.30), (28.25, 3.05), (29.05, 3.30)):
            out.append(loft_obj('c_vent', [[P3(a, sx * x_, Z(z_)) for x_, z_ in ((fore_y_side(a, z0) - 0.025, z0 - 0.045), (1.2, z0 - 0.045), (1.2, z0 + 0.045), (fore_y_side(a, z0) - 0.025, z0 + 0.045))] for a in (a0, a0 + 0.42)], G_DARK, sharp=20))
    return out


def fore_y_side(a, z):
    """Полуширина фюзеляжа на высоте z (над землёй) в сечении a."""
    top, bot, hw, nt, nb = [t(a) for t in FT]; cy = (top + bot) / 2; ht = (top - bot) / 2; zz = Z(z)
    e = nt if zz > cy else nb; q = max(0.0, 1 - (abs(zz - cy) / ht) ** e)
    return hw * q ** (1 / e)


# ── прицельный блистер под носом (vulcan_05): плоское окно спереди ──
BLIS = dict(a0=3.55, a1=6.10, hw=0.42, dz=0.26)
def blister():
    a0, a1 = BLIS['a0'], BLIS['a1']; dz = Track([(a0, 0.0), (a0 + 0.30, 0.17), (a0 + 0.85, 0.25), (a1 - 0.55, 0.24), (a1, 0.0)]); hw = Track([(a0, 0.05), (a0 + 0.30, 0.33), (a0 + 0.85, 0.42), (a1 - 0.55, 0.40), (a1, 0.10)])
    rs = []
    for a in stations(a0, a1, 0.10):
        zb = fore_bot(a, 0.0); rs.append(sup(a, 0.0, zb + 0.30, zb - dz(a), hw(a), 2.2, 3.2, 40))
    return loft_obj('s_blis', rs, sharp=45)


# ── крыло: треугольное, передняя кромка с переломами (B.2), задняя кромка почти прямая; план с vulcan_03 ──
XTIP = 16.834
LE = Track([(0.0, 9.20), (1.40, 9.85), (2.40, 10.70), (3.20, 11.55), (4.00, 12.45), (4.80, 13.30), (6.00, 14.50), (7.50, 15.90), (10.00, 18.00), (12.50, 20.20),
            (14.80, 22.30), (15.80, 23.30), (16.40, 24.25), (XTIP, 25.30)])
def TE(x): return 27.000 + 0.035 * x
def CH(x): return TE(x) - LE(x)
TC = Track([(0.0, 0.100), (3.0, 0.100), (6.0, 0.095), (10.0, 0.085), (XTIP, 0.075)])
def wy(x): return Z(3.000) - 0.006 * max(0.0, x - 4.0)       # лёгкое опускание к концу
ELEV = [(4.15, 7.35), (7.45, 10.55), (10.65, 13.60), (13.70, 16.45)]   # четыре секции на сторону, изнутри наружу (vulcan_01, 03)
def EC(x): return 1.30 - 0.024 * (x - 4.0)                      # хорда элевона
def HINGE(x): return TE(x) - EC(x)


def wing_up(x, a):
    c = CH(x); u = (a - LE(x)) / c; return wy(x) + TC(x) * c * thk(max(0.0, min(1.0, u)))


def wing_bot(x, a):
    c = CH(x); u = (a - LE(x)) / c; return wy(x) - TC(x) * c * thk(max(0.0, min(1.0, u)))


def _blunt(x):
    """Полувысота тупого носа корня в зоне заборника над плоскостью хорд: 0 вне зоны; у наружного конца - по кругу."""
    if x < 0.70 or x > INL_XO + 0.02: return 0.0
    hs = slot_h(min(x, INL_XO)) + 0.090
    xe = INL_XO - slot_h(INL_XO)
    if x > xe: r = slot_h(INL_XO) + 0.090; hs = math.sqrt(max(0.0, r * r - (x - xe) ** 2))
    return hs * _sm((x - 0.70) / 0.70)


def _hfun(x, c, tc):
    hb = _blunt(x); base = lambda u: tc * c * thk(u)
    if hb <= 0: return None
    dz = INL_ZM - 3.0                                           # середина щели чуть выше плоскости хорд
    def f(u):
        d = c * u; nose = (hb + dz) * math.sqrt(min(1.0, d / 0.12)) * (1.0 - _sm((d - 1.2) / 2.6))
        h0 = base(u); k = 6.0
        return math.log(math.exp(k * h0) + math.exp(k * nose)) / k if nose > 0 else h0
    return f


def _wsec(sx, x):
    c = CH(x); tc = TC(x); le = LE(x); us = 0.0006; head = cove_wall_f(le, c, tc, us); hf = _hfun(x, c, tc)
    if hf: head = [(le + c * us, hf(us) * (-1 + 2 * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
    for e0, e1 in ELEV:
        if e0 - 1e-6 <= x <= e1 + 1e-6:
            ue, tail = cove_cut(le, c, tc, HINGE(x)); break
    else:
        ue = 1.0; tail = cove_wall(le, c, tc, 1.0)
    return foil_ring(le, c, tc, us, ue, 40, lambda a, h: P3(a, sx * x, wy(x) + h), tail=tail, head=head, hfun=hf)


def wing_s(sx):
    k = [0.0, 0.6, 1.2, 1.8, 2.4, 3.0, 3.6, 16.20, 16.45 + 0.003, 16.55, 16.65, 16.72, 16.78, 16.81, XTIP]
    for e0, e1 in ELEV: k += [e0 - 0.003, e0, e1, e1 + 0.003] + [e0 + (e1 - e0) * i / 6 for i in range(1, 6)]
    k += [3.9, 15.2, 15.6, 16.0] + stations(0.60, 5.40, 0.09)
    xs = sorted(set(round(v, 4) for v in k))
    return loft_obj('s_wing_' + ('r' if sx > 0 else 'l'), [_wsec(sx, x) for x in xs], sharp=48)


def elevon(sx, i):
    x0, x1 = ELEV[i]; x0 += 0.006; x1 -= 0.006; name = f'elev{i + 1}_' + ('r' if sx > 0 else 'l')
    pv0 = P3(HINGE(x0), sx * x0, wy(x0)); pv1 = P3(HINGE(x1), sx * x1, wy(x1)); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    for j in range(9):
        x = x0 + (x1 - x0) * j / 8; c = CH(x); ah = HINGE(x)
        rings.append([v - pivot for v in foil_ring(LE(x), c, TC(x), (ah - LE(x)) / c, 1.0, 10, lambda a, h: P3(a, sx * x, wy(x) + h), head=cove_nose(LE(x), c, TC(x), ah))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-25.0, 25.0), note='элевон: ось в центре круглого носа; плюс - задняя кромка вниз (ось направлена наружу по правилу правой руки у правого крыла)')
    return ob


# ── заборники в корне крыла: широкая щель с перегородкой посередине, кромка по передней кромке крыла (vulcan_04, 05) ──
INL_XI, INL_XO, INL_XM = 1.42, 4.95, 3.17                       # у фюзеляжа, наружный конец, перегородка
INL_H0, INL_H1, INL_ZM = 1.080, 0.640, 3.040                    # высота щели у фюзеляжа и у наружного конца, середина (над землёй)
def slot_h(x): return (INL_H0 + (INL_H1 - INL_H0) * max(0.0, min(1.0, (x - INL_XI) / (INL_XO - INL_XI))) ** 1.3) / 2


def slot_outline(x0, x1, inset=0.0, kh=1.0, cap=True, sx=1, n=12):
    """Контур щели в плоскости a (x, y): низ от x0 к x1, при cap - полукруглый наружный конец, верх обратно. inset - внутрь (минус - наружу)."""
    hh = lambda x: slot_h(x) * kh - inset
    xe = x1 - (hh(x1) if cap else 0.0); pts = []
    for i in range(n + 1):
        x = x0 + (xe - x0) * i / n; pts.append((x, INL_ZM - hh(x)))
    if cap:
        r = hh(xe)
        for i in range(1, 12): t = -math.pi / 2 + math.pi * i / 12; pts.append((xe + r * math.cos(t), INL_ZM + r * math.sin(t)))
    for i in range(n, -1, -1):
        x = x0 + (xe - x0) * i / n; pts.append((x, INL_ZM + hh(x)))
    out = [(sx * x, Z(z)) for x, z in pts]
    return out[::-1] if sx < 0 else out


def _inl_k(a):
    """За губой коробка уходит в толщину корня: к 16 м заметно сжата."""
    t = _sm((a - 12.6) / (16.2 - 12.6)); return 1.0 - 0.45 * t, 1.0 - 0.30 * t


def inlet_box(sx):
    rs = []
    for a in stations(9.0, 16.2, 0.20):
        kh, kx = _inl_k(a); xo = INL_XI + (INL_XO - INL_XI) * kx
        rs.append(poly_ring(a, slot_outline(INL_XI - 0.10, xo + 0.10, -0.085, kh, True, sx), 96, 0.04))
    return loft_obj('s_inl_' + ('r' if sx > 0 else 'l'), rs, sharp=50)


def lip_cut(sx, da=0.0):
    """Срез по передней кромке крыла: всё, что впереди, убирается. da - сдвиг вперёд."""
    rs = [[P3(LE(x) - da, sx * x, Z(4.6)), P3(LE(x) - da, sx * x, Z(1.6)), P3(4.0, sx * x, Z(1.6)), P3(4.0, sx * x, Z(4.6))] for x in stations(1.20, 5.30, 0.05)]
    if sx < 0: rs = rs[::-1]
    return loft_obj('c_lip', rs, G_SKIN)


DUCT_END = 17.20
def duct_cut(sx, half):
    """Канал одного двигателя: половина щели (у фюзеляжа или наружная); тёмный, к двигателю сходится в круг."""
    x0, x1, cap = (INL_XI + 0.035, INL_XM - 0.045, False) if half == 0 else (INL_XM + 0.045, INL_XO, True)
    n = 72; rings = []
    for i in range(14):
        a = 9.0 + (DUCT_END - 9.0) * i / 13; t = _sm((a - 11.5) / (DUCT_END - 11.5))
        r1 = poly_ring(a, slot_outline(x0, x1, 0.035, 1.0, cap, sx, 8), n, 0.07 + 0.30 * t); ct = sum(r1, Vector()) / n; k = 1.0 - 0.15 * t
        rings.append([ct + (p - ct) * k for p in r1])
    b = B(); b.loft(rings, [G_DUCT] * 4 + [G_DARK] * 9, cap0=G_DUCT, cap1=G_DARK)
    return b.finish('c_duct_' + ('r' if sx > 0 else 'l') + str(half), sharp_deg=38)


def splitter(sx):
    """Перегородка между каналами: тонкая пластина с округлой кромкой в устье."""
    b = B(); a0 = LE(INL_XM) + 0.06; xm = sx * INL_XM
    sec = lambda a, w: [P3(a, xm - w, Z(INL_ZB - 0.05)), P3(a, xm + w, Z(INL_ZB - 0.05)), P3(a, xm + w, Z(INL_ZT + 0.05)), P3(a, xm - w, Z(INL_ZT + 0.05))]
    b.loft([sec(a0 - 0.04, 0.010), sec(a0, 0.030), sec(a0 + 0.20, 0.045), sec(DUCT_END - 1.0, 0.045)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('splitter_' + ('r' if sx > 0 else 'l'), sharp_deg=40)


# ── трубы двигателей: по две на сторону, выступают за заднюю кромку; снизу обтекатели вдоль крыла (vulcan_02, 03, 06) ──
PIPES = (1.78, 3.08)
PIPE_Z = 2.980; PIPE_R = 0.560; PIPE_A1 = 27.85
def pipe_fair(sx):
    out = []
    for x in PIPES:
        n = 48; rr = Track([(18.6, 0.20), (19.6, 0.46), (21.0, 0.57), (PIPE_A1 - 0.30, 0.585), (PIPE_A1, 0.578)])
        zz = Track([(18.6, 2.80), (21.0, 2.96), (PIPE_A1, PIPE_Z)])
        rs = [[P3(a, sx * x + rr(a) * math.sin(2 * math.pi * k / n), Z(zz(a)) - rr(a) * math.cos(2 * math.pi * k / n)) for k in range(n)] for a in stations(18.6, PIPE_A1, 0.30)]
        out.append(loft_obj('s_pipe', rs, sharp=50))
    return out


def nozzles():
    """Кольца срезов сопел (металл): кромка трубы."""
    b = B(); n = 56
    for sx in (1, -1):
        for x in PIPES:
            ring = lambda a, r: [P3(a, sx * x + r * math.sin(2 * math.pi * k / n), Z(PIPE_Z) - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
            sec = [ring(PIPE_A1 - 0.62, 0.588), ring(PIPE_A1 - 0.30, 0.590), ring(PIPE_A1 - 0.06, 0.598), ring(PIPE_A1 + 0.03, 0.596), ring(PIPE_A1 + 0.05, 0.575), ring(PIPE_A1 + 0.03, 0.548), ring(PIPE_A1 - 0.10, 0.534), ring(PIPE_A1 - 0.66, 0.528)]
            b.loft(sec + [sec[0]], G_METAL)
            band = [ring(PIPE_A1 - 1.02, 0.582), ring(PIPE_A1 - 1.00, 0.600), ring(PIPE_A1 - 0.94, 0.600), ring(PIPE_A1 - 0.92, 0.582), ring(PIPE_A1 - 0.97, 0.570)]
            b.loft(band + [band[0]], G_METAL)                 # стяжной пояс на кожухе
    return b.finish('nozzles', sharp_deg=30)


def bore_cut(sx):
    out = []
    for x in PIPES:
        n = 48; ring = lambda a, r: [P3(a, sx * x + r * math.sin(2 * math.pi * k / n), Z(PIPE_Z) - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
        prof = [(PIPE_A1 + 0.30, 0.530, G_METAL), (PIPE_A1 - 0.60, 0.528, G_METAL), (PIPE_A1 - 1.40, 0.520, G_COCK), (PIPE_A1 - 2.10, 0.505, G_DARK), (PIPE_A1 - 2.40, 0.25, G_DARK), (PIPE_A1 - 2.45, 0.03, G_DARK)]
        b = B(); b.loft([ring(a, r) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK)
        out.append(b.finish('c_bore', sharp_deg=30))
    return out


# ── киль: сильно стреловидный, прямая верхушка с колпаком (vulcan_04, 06); руль направления на задней кромке ──
FIN_T0, FIN_T1 = 0.072, 0.060
FZ0, FZ1 = 3.700, 8.050                                         # корень (внутри хребта) и верх, z
F_LE = Lin([(FZ0, 19.10), (FZ1, 25.95)])
F_TE = Lin([(FZ0, 27.95), (FZ1, 28.45)])
RUD = (4.40, 7.80)
RUD_C = Lin([(4.40, 1.05), (7.80, 0.82)])
def FTC(z): return FIN_T0 + (FIN_T1 - FIN_T0) * (z - FZ0) / (FZ1 - FZ0)


def fin():
    zs = sorted(set([FZ0, 3.95, 4.20, RUD[0] - 0.004, RUD[0]] + [RUD[0] + (RUD[1] - RUD[0]) * i / 8 for i in range(1, 8)] + [RUD[1], RUD[1] + 0.004, 7.95, 8.02, FZ1]))
    rings = []
    for z in zs:
        le = F_LE(z); te = F_TE(z); c = te - le; tc = FTC(z)
        if RUD[0] - 1e-6 <= z <= RUD[1] + 1e-6: ue, tail = cove_cut(le, c, tc, te - RUD_C(z), 0.008)
        else: ue, tail = 1.0, cove_wall(le, c, tc, 1.0)
        rings.append(foil_ring(le, c, tc, 0.0006, ue, 22, lambda a, h: P3(a, h, Z(z)), tail=tail, head=cove_wall_f(le, c, tc, 0.0006)))
    b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('fin_c', sharp_deg=48)


def fin_cap():
    """Колпак на верхушке киля (тёмный на фото 06): невысокий обтекатель по хорде."""
    n = 20; a0, a1 = F_LE(FZ1) - 0.02, F_TE(FZ1) - 0.05; rr = Track([(a0, 0.01), (a0 + 0.35, 0.075), (a1 - 0.6, 0.075), (a1, 0.03)])
    rs = [[P3(a, rr(a) * 0.9 * math.sin(2 * math.pi * k / n), Z(FZ1) - 0.02 + rr(a) * 0.55 * (1 - math.cos(2 * math.pi * k / n))) for k in range(n)] for a in stations(a0, a1, 0.12)]
    return loft_obj('fin_cap', rs, sharp=45)


def rudder():
    z0, z1 = RUD; h0 = F_TE(z0) - RUD_C(z0); h1 = F_TE(z1) - RUD_C(z1); p0 = P3(h0, 0.0, Z(z0)); p1 = P3(h1, 0.0, Z(z1)); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized(); rings = []
    for i in range(11):
        z = z0 + 0.010 + (z1 - z0 - 0.020) * i / 10; le = F_LE(z); c = F_TE(z) - le; ah = F_TE(z) - RUD_C(z)
        rings.append([v - pivot for v in foil_ring(le, c, FTC(z), (ah - le) / c, 1.0, 10, lambda a, h: P3(a, h, Z(z)), head=cove_nose(le, c, FTC(z), ah))])
    ob = loft_obj('rudder', rings, sharp=48); ob.location = pivot
    PARTS['rudder'] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-25.0, 25.0), note='руль направления: ось в центре круглого носа, снизу вверх')
    return ob


# ── кабина: фонарь-колпак с переплётом над рабочими местами лётчиков, два кресла рядом (vulcan_05) ──
CK_A0, CK_A1 = 6.05, 8.55
CK_HW = Track([(6.05, 0.38), (6.40, 0.56), (7.00, 0.64), (7.80, 0.64), (8.55, 0.48)])
FLOOR = Z(3.300)


def cock_cut():
    def sec(a, y0, y1, hw): return [P3(a, -hw, y0), P3(a, hw, y0), P3(a, hw, y1), P3(a, -hw, y1)]
    return loft_obj('c_cock', [sec(a, FLOOR - 0.004, Z(6.5), CK_HW(a)) for a in stations(CK_A0, CK_A1, 0.06)], G_COCK, sharp=25)


CANOPY = [(5.950, 0.0, 0.45), (6.250, Z(5.150), 0.62), (6.650, Z(5.340), 0.70), (7.150, Z(5.420), 0.72), (7.750, Z(5.430), 0.72), (8.250, Z(5.360), 0.66), (8.600, Z(5.220), 0.52), (8.820, Z(5.080), 0.32)]
CANOPY[0] = (5.950, fore_y(5.950, 0.0) + 0.004, 0.45)
CAN_T = tracks(CANOPY)
def SILL(a): return fore_y(a, CAN_T[1](a))


def can_ring(a, inset=0.0, n=44):
    top, hw = CAN_T[0](a) - inset, CAN_T[1](a) - inset; y0 = SILL(a) + 0.002
    return [P3(a, hw * math.cos(math.pi * k / (n - 1)) ** 0.62 if math.cos(math.pi * k / (n - 1)) >= 0 else -hw * (-math.cos(math.pi * k / (n - 1))) ** 0.62, y0 + (top - y0) * math.sin(math.pi * k / (n - 1)) ** 0.75) for k in range(n)]


def frame_arch(b, a, w, inset=0.010, h=0.024, n=44):
    ri0 = can_ring(a - w, inset, n); ro0 = can_ring(a - w, -h, n); ro1 = can_ring(a + w, -h, n); ri1 = can_ring(a + w, inset, n)
    strip(b, [ri0, ro0, ro1, ri1, ri0], G_SKIN)


def canopy():
    """Колпак не открывается: стекло одной оболочкой, переплёт - дуги поперёк и рёбра вдоль (передние стёкла узкие, как на фото 05)."""
    st = stations(5.97, 8.80, 0.08)
    b = B(); strip(b, [can_ring(a) for a in st], G_GLASS); gl = b.finish('canopy_glass', sharp_deg=60)
    b2 = B()
    for a in (5.99, 6.45, 7.05, 7.70, 8.25, 8.76): frame_arch(b2, a, 0.030 if a < 6.1 or a > 8.7 else 0.022)
    n = 44
    for k in (9, 22, 34):                                       # продольные рёбра переплёта
        rail = lambda a, d: (lambda r: r[k] + (r[k] - P3(a, 0.0, SILL(a) + 0.1)).normalized() * d)(can_ring(a, 0.0, n))
        rs = []
        for a in stations(6.00, 8.75, 0.10):
            c0 = rail(a, -0.010); c1 = rail(a, 0.022); r_ = can_ring(a, 0.0, n); tg = (r_[min(k + 1, n - 1)] - r_[max(k - 1, 0)]).normalized() * 0.022
            rs.append([c0 - tg, c0 + tg, c1 + tg, c1 - tg])
        b2.loft(rs, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for sg in (1, -1):                                          # порог
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        b2.loft([[rail(a, 0.004, 0.010), rail(a, 0.026, 0.008), rail(a, 0.026, 0.040), rail(a, -0.014, 0.050), rail(a, -0.014, 0.020)] for a in stations(6.00, 8.78, 0.08)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    fr = b2.finish('canopy_frame', sharp_deg=45)
    return [gl, fr]


# ── бомбоотсек: один длинный по оси под центропланом; две створки на продольных петлях у наружных кромок (vulcan_03, 07) ──
BAY = dict(a0=13.70, a1=22.40, x=0.960, top=3.560, z=2.000)
BOMB_A = (14.95, 17.00, 19.05, 21.10)                           # центры бомб по длине, два ряда
BOMB_X = 0.400
BOMB_R, BOMB_LUG = 0.242, 0.289                                 # своя AN-M65A1: радиус по стабилизатору, высота проушин над осью
RACK_Z = 3.160                                                  # низ замков: на этой высоте точка подвески (проушины 0,289 над осью - зазор 2 см)
BOMB_Z = RACK_Z - 0.05 - BOMB_R                                 # ось бомбы так, как её повесит игра (p.y - r - 0.05)


def bay_cut():
    a0, a1, x = BAY['a0'], BAY['a1'], BAY['x']; r = 0.08
    pts = [(-x + r, Z(1.0)), (x - r, Z(1.0)), (x, Z(1.0) + r), (x, Z(BAY['top']) - r), (x - r, Z(BAY['top'])), (-x + r, Z(BAY['top'])), (-x, Z(BAY['top']) - r), (-x, Z(1.0) + r)]
    rs = [[P3(a, p[0], p[1]) for p in pts] for a in (a0, a1)]
    return loft_obj('c_bay', rs, G_COCK, sharp=30)


def bay_inner():
    """Нутро: потолок со шпангоутами, стенки со стрингерами, две балки-держателя с замками на четыре бомбы каждая, гидроцилиндры створок."""
    b = B(); a0, a1, x, top = BAY['a0'], BAY['a1'], BAY['x'], BAY['top']
    def box(aa0, aa1, x0, x1, z0, z1, mat=G_COCK):
        rg = lambda a: [P3(a, x0, Z(z0)), P3(a, x1, Z(z0)), P3(a, x1, Z(z1)), P3(a, x0, Z(z1))]
        b.loft([rg(aa0), rg(aa1)], mat, cap0=mat, cap1=mat)
    zs = lambda a_: (down(x - 0.05, Yb(a_), z0=-6.0, dirn=1).z + ZA) + 0.045   # низ стенки: на 4,5 см выше местной обшивки (над землёй)
    for a_ in stations(a0 + 0.10, a1 - 0.10, 0.62):             # шпангоуты: потолок и стенки
        box(a_ - 0.035, a_ + 0.035, -x + 0.005, x - 0.005, top - 0.10, top - 0.005)
        zb = zs(a_); box(a_ - 0.035, a_ + 0.035, x - 0.10, x - 0.005, zb, top - 0.05); box(a_ - 0.035, a_ + 0.035, -x + 0.005, -x + 0.10, zb, top - 0.05)
    for z_ in (2.85, 3.25):                                     # продольные стрингеры стенок
        box(a0 + 0.05, a1 - 0.05, x - 0.065, x - 0.005, z_ - 0.03, z_ + 0.03); box(a0 + 0.05, a1 - 0.05, -x + 0.005, -x + 0.065, z_ - 0.03, z_ + 0.03)
    for x_ in (-0.62, -0.20, 0.20, 0.62): box(a0 + 0.05, a1 - 0.05, x_ - 0.025, x_ + 0.025, top - 0.13, top - 0.06)
    box(a0 + 0.005, a0 + 0.06, -x + 0.005, x - 0.005, zs(a0 + 0.03), top - 0.005); box(a1 - 0.06, a1 - 0.005, -x + 0.005, x - 0.005, zs(a1 - 0.03), top - 0.005)   # торцевые стенки
    for sg in (1, -1):
        xb = sg * BOMB_X
        box(a0 + 0.25, a1 - 0.25, xb - 0.06, xb + 0.06, RACK_Z + 0.075, top - 0.13, G_METAL)        # балка
        box(a0 + 0.25, a1 - 0.25, xb - 0.08, xb + 0.08, RACK_Z + 0.050, RACK_Z + 0.075, G_DARK)     # полка
        for ac in BOMB_A:
            for da in (-0.178, 0.178):                                                                     # замки парами
                box(ac + da - 0.05, ac + da + 0.05, xb - 0.035, xb + 0.035, RACK_Z, RACK_Z + 0.05, G_METAL)
            for da in (-0.55, 0.55):                                                                       # упоры: над корпусом бомбы, с зазором
                box(ac + da - 0.022, ac + da + 0.022, xb - 0.07, xb + 0.07, BOMB_Z + BOMB_R + 0.012, RACK_Z + 0.05, G_DARK)
        for a_ in (15.2, 18.05, 20.9):                                                                     # гидроцилиндры створок
            zl = zs(a_) + 0.03; p0 = P3(a_, sg * (x - 0.16), Z(top - 0.20)); p1 = P3(a_, sg * (x - 0.16), Z(zl + 0.25))
            strut(b, p0, p1, 0.035, G_METAL, 10); strut(b, p1 + Vector((0, 0, 0.05)), P3(a_, sg * (x - 0.16), Z(zl)), 0.020, G_METAL, 10)
    return b.finish('det_bay', sharp_deg=30)


def stations_fill():
    # порядок для mirror(): индекс 3 заполняется первым - середина отсека, дальше 2, 1, 0
    order = (BOMB_A[3], BOMB_A[0], BOMB_A[2], BOMB_A[1])
    for i, a in enumerate(order):
        for sg, n in ((1, 'r'), (-1, 'l')):
            STATIONS['st%d_%s' % (i, n)] = P3(a, sg * BOMB_X, Z(RACK_Z))


# ── тормозные щитки: вертикальные плиты, выдвигаются из щелей вверх над крылом и вниз под ним (vulcan_05) ──
BRK_U = ((2.15, 3.05), (3.30, 4.20))                            # над крылом: две плиты на сторону, x от-до
BRK_D = ((2.55, 3.75),)                                         # под крылом: одна
BRK_A, BRK_H, BRK_T = 18.00, 0.46, 0.022
BRK_AD = 18.80                                                  # нижние: дальше назад, чтобы щели верхних и нижних не сходились


def _brk(name, sx, x0, x1, up):
    b = B(); xa, xb = sx * x0, sx * x1; BRK_A = globals()['BRK_A'] if up else BRK_AD
    xs = stations(x0, x1, 0.10); surf = wing_up if up else wing_bot; sg = 1 if up else -1
    top = [P3(BRK_A, sx * x, surf(x, BRK_A) + sg * 0.004) for x in xs]
    sec = lambda p: [p + Vector((0, BRK_T, 0)), p + Vector((0, -BRK_T, 0)), p + Vector((0, -BRK_T, -sg * BRK_H)), p + Vector((0, BRK_T, -sg * BRK_H))]
    b.loft([sec(p) for p in top], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)   # лист плиты: сечения поперёк, вдоль размаха
    for x_ in (x0 + 0.18, x1 - 0.18):                          # стойки толкателей
        p0 = P3(BRK_A, sx * x_, surf(x_, BRK_A) - sg * (BRK_H - 0.02)); strut(b, p0, p0 - Vector((0, 0, sg * 0.24)), 0.025, G_METAL, 10)
    ob = b.finish(name, sharp_deg=30); pivot = P3(BRK_A, sx * (x0 + x1) / 2, surf((x0 + x1) / 2, BRK_A)); _rel(ob, pivot)
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((0, 0, sg)), range=(0.0, 0.44), kind='slide', note=('выдвижение вверх' if up else 'выдвижение вниз') + ' из щели (метры): в файле убран, верх листа заподлицо с обшивкой')
    return ob


def brakes():
    out = []
    for sx in (1, -1):
        s = 'r' if sx > 0 else 'l'
        for i, (x0, x1) in enumerate(BRK_U): out.append(_brk(f'brake_u{i + 1}_{s}', sx, x0, x1, True))
        for i, (x0, x1) in enumerate(BRK_D): out.append(_brk(f'brake_d{i + 1}_{s}', sx, x0, x1, False))
    return out


def brake_cuts():
    out = []
    for sx in (1, -1):
        for (x0, x1), up in [(r, True) for r in BRK_U] + [(r, False) for r in BRK_D]:
            surf = wing_up if up else wing_bot; A_ = BRK_A if up else BRK_AD; zs = [surf(x, A_) for x in stations(x0, x1, 0.10)]
            if up: zl, zh = min(zs) - 0.76, max(zs) + 0.10
            else: zl, zh = min(zs) - 0.10, max(zs) + 0.76
            xa, xb = sx * (x0 - 0.010), sx * (x1 + 0.010)
            rg = lambda a: [P3(a, xa, zl), P3(a, xb, zl), P3(a, xb, zh), P3(a, xa, zh)]
            out.append(loft_obj('c_brk', [rg(A_ - BRK_T - 0.008), rg(A_ + BRK_T + 0.008)], G_DARK, sharp=30))
    return out


# ── пилоны под Shrike («Black Buck»): по одному под крылом, сдвоенная балка на две ракеты (vulcan_03: место под крылом) ──
PYL_X, PYL_A0, PYL_A1 = 9.60, 18.30, 20.90
SHR_DX, SHR_DROP = 0.31, 0.40                                   # полуразнос ракет на балке, низ балки ниже пилона


def pylons():
    out = []
    for sx in (1, -1):
        b = B(); x = sx * PYL_X; am = (PYL_A0 + PYL_A1) / 2; y0 = wing_bot(PYL_X, am) - 0.32; hw = 0.07
        def sec(a, f=1.0): yw = wing_bot(PYL_X, a) + 0.05; return [P3(a, x - hw * f, y0), P3(a, x + hw * f, y0), P3(a, x + hw * f * 0.85, yw), P3(a, x - hw * f * 0.85, yw)]
        st = [PYL_A0, PYL_A0 + 0.12, PYL_A0 + 0.45, PYL_A1 - 0.45, PYL_A1 - 0.12, PYL_A1]; fs = [0.10, 0.70, 1.0, 1.0, 0.65, 0.10]
        b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
        ob = b.finish('pylon_' + ('r' if sx > 0 else 'l'), sharp_deg=40)
        # сдвоенная балка: поперечина и две направляющие
        b2 = B(); ac = am + 0.05; yb = y0 - 0.06
        box3(b2, P3(ac, x, yb), SHR_DX + 0.06, 0.16, 0.06, G_SKIN)
        for d in (-SHR_DX, SHR_DX):
            box3(b2, P3(ac + 0.05, x + d, yb - 0.10), 0.05, 0.95, 0.045, G_METAL)
            SHRIKE[('r' if sx > 0 else 'l') + ('o' if d * sx > 0 else 'i')] = P3(ac + 0.05, x + d, yb - 0.145)
        out += [ob, b2.finish('rack_' + ('r' if sx > 0 else 'l'), sharp_deg=40)]
    return out


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


BVH = {}
def bvh_ready(host):
    me = host.data; BVH['t'] = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons]); BVH['host'] = host


def down(x, y_world, z0=6.0, dirn=-1):
    hit = BVH['t'].ray_cast(Vector((x, y_world, z0)), Vector((0, 0, dirn)))
    return hit[0]


def patch(name, outline, nu, nv, dirn=-1, lift=0.006, th=0.018, mat=G_SKIN, z0=6.0):
    """Плита по обшивке: outline(u, v) -> (a, x); вершины кладутся лучом на обшивку (створки). Начало - в нуле мира."""
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
    out = []; a0, a1, x = BAY['a0'], BAY['a1'], BAY['x']
    for sx in (1, -1):
        name = 'bay_' + ('r' if sx > 0 else 'l')
        ob = patch(name, lambda u, v: (a0 + 0.010 + (a1 - a0 - 0.020) * v, sx * (0.006 + (x - 0.012) * u)), 10, 24, dirn=1, lift=0.0, th=0.035, z0=-6.0)
        e0 = down(sx * x, Yb(a0 + 0.02), z0=-6.0, dirn=1); e1 = down(sx * x, Yb(a1 - 0.02), z0=-6.0, dirn=1)   # петля вдоль настоящей кромки (низ поднимается к хвосту)
        dd = (e1 - e0).normalized(); sag = 0.0
        for a_ in stations(a0 + 0.02, a1 - 0.02, 0.25):            # провис кромки под хордой e0-e1: ось ниже самой низкой точки
            p_ = down(sx * x, Yb(a_), z0=-6.0, dirn=1); q_ = e0 + dd * (p_ - e0).dot(dd); sag = min(sag, p_.z - q_.z)
        hax = dd * sx; pivot = (e0 + e1) / 2 + Vector((sx * 0.015, 0, sag - 0.045)); _rel(ob, pivot)
        # рёбра жёсткости изнутри створки
        bb = B()
        for a_ in stations(a0 + 0.35, a1 - 0.35, 0.95):
            yb = down(sx * 0.45, Yb(a_), z0=-6.0, dirn=1).z + 0.035
            bb.loft([[P3(a_ - 0.018, sx * 0.05, yb) - pivot, P3(a_ - 0.018, sx * (x - 0.13), yb) - pivot, P3(a_ - 0.018, sx * (x - 0.13), yb + 0.05) - pivot, P3(a_ - 0.018, sx * 0.05, yb + 0.05) - pivot],
                     [P3(a_ + 0.018, sx * 0.05, yb) - pivot, P3(a_ + 0.018, sx * (x - 0.13), yb) - pivot, P3(a_ + 0.018, sx * (x - 0.13), yb + 0.05) - pivot, P3(a_ + 0.018, sx * 0.05, yb + 0.05) - pivot]], G_COCK, cap0=G_COCK, cap1=G_COCK)
        rib = bb.finish(name + '_ribs', sharp_deg=30); rib.parent = ob; rib.location = (0, 0, 0)
        PARTS[name] = dict(pivot=pivot.copy(), axis=hax.copy(), range=(0.0, 95.0), note='шарнир у наружной кромки отсека, ось вдоль кромки (низ поднимается к хвосту); плюс - внутренняя кромка вниз и в сторону; рёбра ' + name + '_ribs - дочерний объект')
        out += [ob, rib]
    return out


def build_skin():
    S = [fuselage(), blister(), wing_s(1), wing_s(-1)] + pipe_fair(1) + pipe_fair(-1)
    host = S[0]
    for o in S[1:]:
        _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        for half in (0, 1):
            c = duct_cut(sx, half); l_ = lip_cut(sx, 0.015); _apply_bool(c, l_, 'DIFFERENCE'); _drop(l_); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
        for c in bore_cut(sx): _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'VUL_skin'; host.data.name = 'VUL_skin'
    bvh_ready(host)
    return host


def plane(stage=9, carve=True):
    """Этапы: 1 - обшивка; 2 - киль, рули, элевоны, сопла; 3 - кабина, фонарь, отсек, тормоза, пилоны; 4 - шасси и створки."""
    PARTS.clear(); STATIONS.clear(); SHRIKE.clear()
    skin = build_skin(); out = [skin]; stations_fill()
    ref_me = skin.data.copy()                                   # гладкая поверхность до вырезов: с неё нормали углов
    for c in tail_vents(): _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
    if stage >= 2:
        out += [fin(), fin_cap(), rudder(), nozzles()]
        for sx in (1, -1):
            for i in range(4): out.append(elevon(sx, i))
    if stage >= 3:
        import vul_detail as d
        out += canopy() + brakes() + pylons() + [bay_inner()]
        out += bay_doors() + d.details()
    if stage >= 3:
        c = cock_cut(); _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
        c = bay_cut(); _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
        for c in brake_cuts(): _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
    if stage >= 4:
        import vul_gear as gr; out += gr.gear_all()
    if stage >= 3: d.cuts(skin)
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
