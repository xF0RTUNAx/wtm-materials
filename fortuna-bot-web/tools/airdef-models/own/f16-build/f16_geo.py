# f16_geo.py - геометрия F-16D для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z (в glTF: нос -Z, правое крыло +X, верх +Y). Начало - середина длины 15,03 м.
# a - расстояние от острия щупа, y - высота (y=0: уровень низа носа на фото 06, ось сопла на y=0,17), x - вправо. Бок снят с фото 06 и 07 (0,01077 м/пикс. фото 06 × 2,1), план - с f16_12 (× 0,976), остальное - форма по 01, 03, 05, 10, 11.
# Корпус - одно сечение с плавным наплывом (высоты над x, сглаженный максимум тела и клина наплыва); гаргрот, воздухозаборник, крылья объединяются булевой операцией.
import math
import types
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 15.03
G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_STRAP, G_SCREEN, G_BELT, G_HANDLE, G_SEAM, G_DUCT, G_HUD = 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
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


def stations(a0, a1, da):
    n = max(2, int(round((a1 - a0) / da))); return [a0 + (a1 - a0) * i / n for i in range(n + 1)]


def _sm(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)


def sup(a, cx, top, bot, hw, nt, nb, n):
    """Суперэллипс: начало снизу (шов развёртки), дальше +X, верх, -X."""
    cy = (top + bot) / 2; ht = (top - bot) / 2; pts = []
    for k in range(n):
        th = -math.pi / 2 + 2 * math.pi * k / n; c, s = math.cos(th), math.sin(th); e = nt if s > 0 else nb
        pts.append(P3(a, cx + hw * math.copysign(abs(c) ** (2 / e), c), cy + ht * math.copysign(abs(s) ** (2 / e), s)))
    return pts


def loft_obj(name, rings, mat=G_SKIN, cap0=True, cap1=True, sharp=38):
    b = B(); b.loft(rings, mat, cap0=mat if cap0 else None, cap1=mat if cap1 else None)
    return b.finish(name, sharp_deg=sharp)


def strip(b, rings, mat):
    """Сетка без замыкания по кольцу: стекло и рамы - открытые дуги от порога до порога."""
    bm = b.bm; vs = [[bm.verts.new(p) for p in r] for r in rings]
    for i in range(len(vs) - 1):
        for j in range(len(vs[0]) - 1):
            f = bm.faces.new((vs[i][j], vs[i][j + 1], vs[i + 1][j + 1], vs[i + 1][j])); f.material_index = mat


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


# ── корпус: высоты над x, плавный наплыв ──
# a, верх, низ, центр (ширина наибольшая), полуширина верха, полуширина низа, nверх, nниз
BODY = [
    (0.485, 0.112, 0.108, 0.110, 0.004, 0.004, 2.0, 2.0), (0.550, 0.160, 0.083, 0.120, 0.035, 0.035, 2.0, 2.0), (0.700, 0.235, 0.060, 0.145, 0.095, 0.095, 2.0, 2.0), (1.000, 0.370, 0.035, 0.195, 0.210, 0.210, 2.0, 2.0), (1.240, 0.450, 0.025, 0.232, 0.290, 0.290, 2.0, 2.0),
    (1.600, 0.570, 0.010, 0.285, 0.390, 0.390, 2.05, 2.1), (2.000, 0.690, -0.010, 0.330, 0.470, 0.470, 2.1, 2.2), (2.400, 0.790, -0.015, 0.355, 0.530, 0.530, 2.3, 2.3), (2.900, 0.880, -0.020, 0.360, 0.580, 0.580, 2.6, 2.4), (3.400, 0.970, 0.000, 0.330, 0.620, 0.600, 2.9, 2.4),
    (4.000, 1.030, 0.020, 0.300, 0.640, 0.610, 3.1, 2.5), (5.200, 1.040, 0.030, 0.280, 0.660, 0.640, 3.2, 2.6), (5.800, 1.040, -0.200, 0.280, 0.660, 0.680, 3.2, 2.8), (6.400, 1.020, -0.500, 0.280, 0.760, 0.740, 2.8, 3.2), (7.000, 0.990, -0.600, 0.280, 0.950, 0.850, 2.3, 3.6), (8.000, 0.960, -0.610, 0.280, 1.120, 1.000, 2.0, 4.2),
    (9.000, 0.940, -0.610, 0.280, 1.170, 1.020, 1.95, 4.2), (10.000, 0.930, -0.600, 0.280, 1.160, 0.950, 1.95, 4.0), (11.000, 0.930, -0.600, 0.280, 1.080, 0.880, 2.0, 3.6), (12.000, 0.930, -0.580, 0.240, 0.900, 0.820, 2.1, 2.8), (13.000, 0.900, -0.500, 0.190, 0.740, 0.740, 2.2, 2.3), (13.860, 0.755, -0.415, 0.170, 0.585, 0.585, 2.0, 2.0)]
BT = tracks(BODY)
# край наплыва и полки: a, x края, высота края, полутолщина края (план f16_12, бок 06)
EDGE = [(0.485, 0.004, 0.110, 0.0008), (2.900, 0.580, 0.360, 0.0012), (3.400, 0.690, 0.300, 0.004), (4.350, 0.820 + 0.0, 0.270, 0.005), (5.800, 1.140, 0.270, 0.006), (7.100, 1.440, 0.270, 0.008), (9.000, 1.480, 0.270, 0.010), (10.900, 1.300, 0.270, 0.020), (11.500, 1.170, 0.360, 0.090), (13.220, 1.170, 0.380, 0.100), (13.235, 0.760, 0.170, 0.010), (13.860, 0.585, 0.170, 0.001)]
ET = tracks(EDGE)


def body_par(a):
    top, bot, yc, sw, bw, nt, nb = [t(a) for t in BT]; es, ye, th = [t(a) for t in ET]
    es = max(es, sw, bw)
    grow = _sm((a - 2.9) / 0.7) * (1 - _sm((a - 13.2) / 0.035))
    return top, bot, yc, sw, bw, nt, nb, es, ye, th, grow, a


def _smax(p, q, k):
    if k <= 1e-5: return max(p, q)
    h = max(k - abs(p - q), 0.0) / k; return max(p, q) + h * h * k * 0.25


def _top(par, x):
    top, bot, yc, sw, bw, nt, nb, es, ye, th, grow, a = par
    ex = min(1.0, x / sw); E = yc + (top - yc) * max(0.0, 1 - ex ** nt) ** (1 / nt) if x < sw else yc - 6.0 * (x - sw)
    W = ye + th + 0.085 * grow * (es - x)
    R = _smax(E, W, 0.17 * grow)
    gw = _sm((a - 6.3) / 0.6)
    if gw > 0.0:                                                # гаргрот в одном сечении с корпусом: широкая основа и плавный скат к плечам (f16_10, 11), без ступеньки; к концу корпуса сужается до контейнера
        e_ = _sm((a - 12.3) / 1.5); hg = GT[2](a) * (HUMP_W + (1.02 - HUMP_W) * e_); y0_ = HUMP_Y + (0.74 - HUMP_Y) * e_; tg = y0_ + (GT[0](a) - y0_) * gw
        G = y0_ + (tg - y0_) * math.sqrt(max(0.0, 1 - (x / hg) ** 2)) if x < hg else y0_ - 6.0 * (x - hg)
        R = _smax(R, G, (HUMP_K + (0.16 - HUMP_K) * e_) * gw)
    return R


def _bot(par, x):
    top, bot, yc, sw, bw, nt, nb, es, ye, th, grow, a = par
    ex = min(1.0, x / bw); E = yc - (yc - bot) * max(0.0, 1 - ex ** nb) ** (1 / nb) if x < bw else yc + 6.0 * (x - bw)
    W = ye - th - 0.11 * grow * (es - x)
    return -_smax(-E, -W, 0.26 * grow)


def skin_top(a, x): return _top(body_par(a), abs(x))


def body_ring(a, n1=34, n2=10):
    par = body_par(a); es = par[7]; xs = min(es, max(par[3], par[4]) * 1.14)
    xa = [xs * math.sin(math.pi / 2 * i / n1) for i in range(n1 + 1)] + [xs + (es - xs) * j / n2 for j in range(1, n2 + 1)]
    lo = [(x, _bot(par, x)) for x in xa]; up = [(x, _top(par, x)) for x in xa]
    half = lo + up[::-1]                                        # снизу по центру -> край -> верх по центру
    ring = [P3(a, x, y) for x, y in half] + [P3(a, -x, y) for x, y in up[1:]] + [P3(a, -x, y) for x, y in lo[-1:0:-1]]
    return ring


def body():
    st = [0.485, 0.50, 0.53, 0.57, 0.63, 0.70, 0.80, 0.90] + stations(1.0, 2.9, 0.10)[0:] + stations(3.0, 7.1, 0.14) + stations(7.3, 11.0, 0.25) + [11.2, 11.35, 11.5, 11.7] + stations(11.9, 13.2, 0.20) + [13.22, 13.235, 13.26, 13.34, 13.45, 13.55] + stations(13.65, 13.86, 0.07)
    st = sorted(set(round(a, 3) for a in st))
    return loft_obj('s_body', [body_ring(a) for a in st], sharp=52)


# ── гаргрот от фонаря до киля ──
HUMP_W, HUMP_Y, HUMP_K = 1.32, 0.84, 0.40                       # основа шире трубы, уровень основы, радиус слияния
GAR = [(5.950, 0.960, 0.60, 0.400), (6.300, 1.250, 0.60, 0.400), (6.400, 1.300, 0.60, 0.415), (6.900, 1.300, 0.60, 0.440), (9.000, 1.340, 0.60, 0.420), (10.200, 1.345, 0.60, 0.400), (11.600, 1.400, 0.62, 0.370), (13.000, 1.330, 0.74, 0.330), (13.900, 1.285, 0.76, 0.285), (14.000, 1.270, 0.77, 0.270), (14.050, 1.230, 0.80, 0.220)]
GT = tracks(GAR)


def gar_top(a): return GT[0](a)


def pod_hole():
    """Отверстие в торце контейнера над соплом (f16_10): выемка внутрь, стенки от резака."""
    n = 40; rg = lambda a, top, bot, hw: sup(a, 0.0, top, bot, hw, 2.6, 2.6, n)
    return loft_obj('c_podhole', [rg(14.20, 1.165, 0.865, 0.160), rg(14.03, 1.165, 0.865, 0.160), rg(13.96, 1.150, 0.880, 0.145), rg(13.78, 1.120, 0.905, 0.120), rg(13.70, 1.050, 0.970, 0.040)], G_DUCT, sharp=30)


def gargrot():
    # передняя часть за фонарём и контейнер у сопла; средняя часть спины - в сечении корпуса (body_ring)
    b = B(); e = 0.006; rg = lambda a: sup(a, 0.0, GT[0](a) - e, GT[1](a), GT[2](a) - e, 3.4, 2.4, 64)
    b.loft([rg(a) for a in [5.95, 6.02, 6.10, 6.20, 6.32, 6.45, 6.70, 6.95, 7.20]], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    b.loft([rg(a) for a in [13.70, 13.80, 13.90, 13.97, 14.02, 14.05]], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('s_gar', sharp_deg=40)


# ── воздухозаборник: косой срез устья, короб уходит в брюхо ──
INL = [(4.400, -0.045, -0.620, 0.560, 2.7), (4.700, -0.040, -0.640, 0.575, 2.7), (5.000, -0.020, -0.650, 0.590, 2.8), (5.600, 0.120, -0.660, 0.610, 3.0), (6.400, 0.250, -0.660, 0.650, 3.2), (7.200, 0.300, -0.650, 0.690, 3.4), (8.000, 0.300, -0.630, 0.720, 3.6), (8.700, 0.300, -0.600, 0.720, 3.6)]
IT = tracks(INL)
LIP_A, LIP_RAKE = 4.400, 0.190                                  # кромка сверху (вперёд) и снос низа назад


def lip_a(y, top=-0.045, bot=-0.62):
    return LIP_A + LIP_RAKE * (top - y) / (top - bot)


def inl_ring(a, inset, n=72, rake=True):
    top, bot, hw, ne = [t(a) for t in IT]
    pts = sup(a, 0.0, top - inset, bot + inset, hw - inset, ne, ne, n)
    if not rake: return pts
    d = a - 4.40
    return [Vector((p.x, Yb(lip_a(p.z) + d), p.z)) for p in pts]


def inlet_body():
    """Кольца устья: кромка скруглена, дальше плавно назад."""
    rings = [inl_ring(4.400, 0.046), inl_ring(4.402, 0.030), inl_ring(4.412, 0.016), inl_ring(4.432, 0.006), inl_ring(4.470, 0.0)] + [inl_ring(a, 0.0, rake=a < 5.2) for a in stations(4.6, 5.0, 0.2)]
    rings = rings[:5] + [inl_ring(a, 0.0) for a in (4.60, 4.75, 4.90, 5.05, 5.20)]
    tail = []
    for a in stations(5.4, 8.7, 0.3):
        k = _sm((a - 5.2) / 1.0); r0 = inl_ring(a, 0.0); r1 = inl_ring(a, 0.0, rake=False); tail.append([p.lerp(q, k) for p, q in zip(r0, r1)])
    return loft_obj('s_inlet', rings + tail, sharp=46)


def duct_cut():
    """Режущий канал: устье -> круг у двигателя; цвет стенок от резака (светлое нутро)."""
    rings = [inl_ring(4.20, 0.046), inl_ring(4.400, 0.046), inl_ring(4.46, 0.052)]
    a_end = 7.80
    for a in stations(4.55, a_end, 0.25):
        t = _sm((a - 4.46) / (a_end - 4.46)); r1 = inl_ring(a, 0.056); n = len(r1); cy, rr = 0.10, 0.36
        r2 = [P3(a, rr * math.sin(2 * math.pi * k / n), cy - rr * math.cos(2 * math.pi * k / n)) for k in range(n)]
        rings.append([p.lerp(q, t) for p, q in zip(r1, r2)])
    return loft_obj('c_duct', rings, G_DUCT)


# ── крылья: сетка рядов, носок и флаперон отдельно ──
def thk(u):
    return 5 * (0.2969 * math.sqrt(max(u, 0)) - 0.1260 * u - 0.3516 * u ** 2 + 0.2843 * u ** 3 - 0.1015 * u ** 4) * 0.5 * 2


def foil_ring(a_le, chord, tc, u0, u1, nu, place, tail=None, head=None):
    """Замкнутый контур хорды от u0 до u1: place(a, h) -> Vector. tail - точки (a, h) сзади, сверху вниз; head - точки спереди, снизу вверх."""
    us = [u0 + (u1 - u0) * (1 - math.cos(math.pi * i / (nu - 1))) / 2 for i in range(nu)]
    up = [place(a_le + chord * u, +tc * chord * thk(u)) for u in us]
    lo = [place(a_le + chord * u, -tc * chord * thk(u)) for u in reversed(us)]
    return up + [place(a_, h_) for a_, h_ in (tail or [])] + lo + [place(a_, h_) for a_, h_ in (head or [])]


# Рули: круглый нос ходит в круглом вырезе неподвижной части. Верх и низ обшивки доходят до оси вплотную, поэтому в любом положении щель одна и та же, тонкая, ступеньки нет, насквозь не видно.
COVE_K, COVE_R = 7, 0.008
def cove_cut(a_le, chord, tc, a_h, clr=COVE_R):
    """Задняя кромка неподвижной части: конец верхней поверхности (u) и точки выреза (a, h) сверху вперёд и вниз."""
    uh = (a_h - a_le) / chord; t = tc * chord * thk(uh); rc = t + clr; a_e = a_h - math.sqrt(max(rc * rc - t * t, 1e-9)); te = tc * chord * thk((a_e - a_le) / chord); rc = math.hypot(a_e - a_h, te); al = math.atan2(te, a_e - a_h)
    return (a_e - a_le) / chord, [(a_h + rc * math.cos(al + (2 * math.pi - 2 * al) * (i + 1) / (COVE_K + 1)), rc * math.sin(al + (2 * math.pi - 2 * al) * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_wall(a_le, chord, tc, u1):
    """Те же точки на плоском заднем торце: счёт точек в кольцах один."""
    a_ = a_le + chord * u1; t = tc * chord * thk(u1); return [(a_, t * (1 - 2 * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_nose(a_le, chord, tc, a_h):
    """Нос подвижной части: полукруг вокруг оси, снизу вперёд и вверх; радиус - полутолщина профиля на оси."""
    t = tc * chord * thk((a_h - a_le) / chord); return [(a_h - t * math.sin(math.pi * (i + 1) / (COVE_K + 1)), -t * math.cos(math.pi * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_cut_f(a_le, chord, tc, a_h, clr=COVE_R):
    """Передняя кромка неподвижной части за носком: начало поверхности (u) и точки выреза (a, h) снизу назад и вверх."""
    uh = (a_h - a_le) / chord; t = tc * chord * thk(uh); rc = t + clr; a_e = a_h + math.sqrt(max(rc * rc - t * t, 1e-9)); te = tc * chord * thk((a_e - a_le) / chord); rc = math.hypot(a_e - a_h, te); al = math.atan2(te, a_e - a_h)
    return (a_e - a_le) / chord, [(a_h + rc * math.cos(-al + 2 * al * (i + 1) / (COVE_K + 1)), rc * math.sin(-al + 2 * al * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_wall_f(a_le, chord, tc, u0):
    a_ = a_le + chord * u0; t = tc * chord * thk(u0); return [(a_, t * (-1 + 2 * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_tail(a_le, chord, tc, a_h):
    """Задняя часть носка: полукруг вокруг оси, сверху назад и вниз."""
    t = tc * chord * thk((a_h - a_le) / chord); return [(a_h + t * math.sin(math.pi * (i + 1) / (COVE_K + 1)), t * math.cos(math.pi * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]


WING_Y = 0.270; WING_X1 = 4.600; GAP = 0.012
A_LE = Track([(0.700, 6.470), (1.440, 7.100), (WING_X1, 9.780)])
A_TE = Track([(0.700, 10.900), (WING_X1, 10.900)])
TC = Track([(0.700, 0.046), (WING_X1, 0.034)])
FLAP = (1.480, 3.780, 0.640)                                    # флаперон: от x, до x, хорда
LEF = Track([(1.640, 0.360), (4.560, 0.215)])                   # носок: ширина по хорде
LEF_X = (1.640, 4.560)


def wy(x): return WING_Y


def on_lef(x): return LEF_X[0] - 1e-6 <= x <= LEF_X[1] + 1e-6


def on_flap(x): return FLAP[0] - 1e-6 <= x <= FLAP[1] + 1e-6


def wing_rings(sx):
    xs = [0.70, 1.00, 1.30, 1.44, 1.476, 1.48] + [1.48 + (1.636 - 1.48) * i / 2 for i in range(1, 3)] + [1.64] + [1.64 + (3.78 - 1.64) * i / 9 for i in range(1, 10)] + [3.784, 3.84] + [3.84 + (4.56 - 3.84) * i / 3 for i in range(1, 4)] + [4.565, 4.60]
    xs = sorted(set(round(x, 4) for x in xs)); rings = []
    for x in xs:
        c = A_TE(x) - A_LE(x)
        if on_flap(x): ue, tail = cove_cut(A_LE(x), c, TC(x), A_TE(x) - FLAP[2])
        else: ue, tail = 1.0, cove_wall(A_LE(x), c, TC(x), 1.0)
        if on_lef(x): u0, head = cove_cut_f(A_LE(x), c, TC(x), A_LE(x) + LEF(x))
        else: u0 = 0.0008; head = cove_wall_f(A_LE(x), c, TC(x), u0)
        rings.append(foil_ring(A_LE(x), c, TC(x), u0, ue, 18, lambda a, h: P3(a, sx * x, WING_Y + h), tail=tail, head=head))
    return rings


def wing_s(sx):
    return loft_obj('s_wing_' + ('r' if sx > 0 else 'l'), wing_rings(sx), sharp=48)


def flaperon(sx):
    name = 'flap_' + ('r' if sx > 0 else 'l'); x0, x1, cd = FLAP; x0 += 0.012; x1 -= 0.012
    pv0 = P3(A_TE(x0) - cd, sx * x0, WING_Y); pv1 = P3(A_TE(x1) - cd, sx * x1, WING_Y); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    for i in range(9):
        x = x0 + (x1 - x0) * i / 8; c = A_TE(x) - A_LE(x); ah = A_TE(x) - cd
        rings.append([v - pivot for v in foil_ring(A_LE(x), c, TC(x), (ah - A_LE(x)) / c, 1.0, 9, lambda a, h: P3(a, sx * x, WING_Y + h), head=cove_nose(A_LE(x), c, TC(x), ah))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-22.0, 22.0), note='ось в центре круглого носа; плюс - задняя кромка вниз')
    return ob


def lef_part(sx):
    name = 'lef_' + ('r' if sx > 0 else 'l'); x0, x1 = LEF_X; x0 += 0.016; x1 -= 0.016
    # ось на нижней поверхности у задней кромки носка
    def pv(x):
        return P3(A_LE(x) + LEF(x), sx * x, WING_Y)
    p0, p1 = pv(x0), pv(x1); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    for i in range(10):
        x = x0 + (x1 - x0) * i / 9; c = A_TE(x) - A_LE(x); u1 = LEF(x) / c
        e_ = 0.018 * (1 if i == 0 else -1 if i == 9 else 0)      # торец со скосом: нос отступает, при повороте по косой оси не задевает
        def pl(a_, h, x=x, e_=e_, a_le=A_LE(x), w=LEF(x)):
            return P3(a_, sx * (x + e_ * max(0.0, 1 - (a_ - a_le) / w)), WING_Y + h)
        rings.append([v - pivot for v in foil_ring(A_LE(x), c, TC(x), 0.0008, u1, 9, pl, tail=cove_tail(A_LE(x), c, TC(x), A_LE(x) + LEF(x)), head=cove_wall_f(A_LE(x), c, TC(x), 0.0008))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    # ось наклонена по кромке; плюс - передняя кромка вниз
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-2.0, 20.0), note='ось в центре круглой задней части носка; плюс - передняя кромка вниз')
    return ob


def tip_rail(sx):
    """Постоянная направляющая на конце крыла, без ракеты: брусок с заострённым носом и хвостом (f16_08, 09)."""
    x = sx * 4.660; y = WING_Y - 0.005; a0, a1 = 9.640, 11.020; b = B()
    sec = lambda a, hw, h: [P3(a, x - hw, y - h), P3(a, x + hw, y - h), P3(a, x + hw, y + h), P3(a, x - hw, y + h)]
    st = [(a0, 0.008, 0.008), (a0 + 0.12, 0.040, 0.030), (a0 + 0.34, 0.060, 0.045), (a1 - 0.30, 0.060, 0.045), (a1 - 0.08, 0.040, 0.030), (a1, 0.010, 0.010)]
    b.loft([sec(a, hw, h) for a, hw, h in st], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    # башмаки ракеты снизу
    for am in (9.98, 10.72):
        b.loft([[P3(am + d, x - 0.024, y - 0.046 - e), P3(am + d, x + 0.024, y - 0.046 - e), P3(am + d, x + 0.024, y - 0.040), P3(am + d, x - 0.024, y - 0.040)] for d, e in ((-0.07, 0.008), (0.07, 0.018))], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('pylon_tip_' + ('r' if sx > 0 else 'l'), sharp_deg=35)


# ── стабилизатор цельноповоротный, полка у сопла ──
SHELF_X = 1.170; STAB_GAP = 0.014
STAB_Y, STAB_DY = 0.385, -0.120
S_LE = Track([(1.184, 12.192), (2.900, 13.640)])
S_TE = Track([(1.184, 14.520), (2.900, 14.440)])
STAB_A = 13.200


def stab(sx):
    name = 'stab_' + ('r' if sx > 0 else 'l'); x0 = SHELF_X + STAB_GAP; pivot = P3(STAB_A, sx * x0, STAB_Y)
    xs = [x0 + (2.90 - x0) * i / 12 for i in range(13)]
    rings = []
    for x in xs:
        c = S_TE(x) - S_LE(x)
        rings.append([v - pivot for v in foil_ring(S_LE(x), c, 0.032, 0.0, 1.0, 20, lambda a, h: P3(a, sx * x, STAB_Y + STAB_DY * (x - x0) + h))])
    b = B(); r0 = rings[0]; nr = len(r0); inner = [(r0[k] + r0[nr - 1 - k]) / 2 for k in range(nr)]
    r1 = rings[-1]; outer = [(r1[k] + r1[nr - 1 - k]) / 2 for k in range(nr)]
    b.loft([inner] + rings + [outer], G_SKIN)
    bmesh.ops.remove_doubles(b.bm, verts=b.bm.verts[:], dist=1e-5)
    n = 14; rg = lambda x_, r: [P3(STAB_A + r * math.cos(2 * math.pi * k / n), sx * x_, STAB_Y + r * math.sin(2 * math.pi * k / n)) - pivot for k in range(n)]
    b.loft([rg(SHELF_X - 0.004, 0.050), rg(x0 + 0.05, 0.050)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    ob = b.finish(name, sharp_deg=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(-21.0, 21.0), note='ось поперёк по корню; плюс - носок вверх')
    return ob


# ── тормозные щитки у сопла: на сторону два лепестка, вверх и вниз, петля спереди ──
SB_A0, SB_A1 = 13.216, 14.300; SB_XI, SB_XO = 0.700, SHELF_X; SB_Y = 0.380; SB_TH = 0.100


def sb_inner(a):
    """Внутренняя кромка щитка: не заходит в корпус и сопло при закрытом положении."""
    return 0.716 - 0.016 * (a - SB_A0) / (SB_A1 - SB_A0)      # f16_12: полка и щитки идут ровно, сзади между ними и соплом видна щель


def sb_web(sx):
    """Неподвижная тонкая перепонка на плоскости разъёма щитков: от полки до щитка и вдоль внутренней кромки к соплу. Сверху и снизу не видно щели насквозь, щитки её не задевают."""
    def xin(a):
        if a >= NOZ_A0:
            r = NOZ_R0 + (NOZ_R - NOZ_R0) * (a - NOZ_A0) / (NOZ_A1 - NOZ_A0); return math.sqrt(max(r * r - (SB_Y - NOZ_Y) ** 2, 0.0)) + 0.030
        par = body_par(a); top, yc, sw, nt = par[0], par[2], par[3], par[5]; t = min(0.999, max(0.0, (SB_Y - yc) / (top - yc))); return sw * (1 - t ** nt) ** (1 / nt) - 0.02
    e = 0.009; sec = lambda a, x0, x1: [P3(a, sx * x0, SB_Y - e), P3(a, sx * x1, SB_Y - e), P3(a, sx * x1, SB_Y + e), P3(a, sx * x0, SB_Y + e)]
    b = B(); st = [13.19, 13.40, 13.60, 13.80, 13.90, 14.05, 14.20, 14.285]
    b.loft([sec(a, xin(a), sb_inner(a) - 0.010) for a in st], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    x_0 = xin(13.19); b.loft([sec(13.19, 0.60, SHELF_X - 0.004), sec(13.268, 0.60, SHELF_X - 0.004)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('s_sbweb_' + ('r' if sx > 0 else 'l'), sharp_deg=30)


def speedbrakes(sx):
    out = []
    for up, tag in ((1, 'u'), (-1, 'd')):
        name = f'sb_{tag}_' + ('r' if sx > 0 else 'l'); st = [SB_A0 + (SB_A1 - SB_A0) * i / 8 for i in range(9)]; rings = []
        for a in st:
            k = (a - SB_A0) / (SB_A1 - SB_A0); hth = SB_TH * (1 - 0.72 * k ** 1.4); xi = sb_inner(a)
            xo = SB_XO
            yo = SB_Y + up * (0.0015 + (0.070 if a == st[0] else 0.0))
            yt = SB_Y + up * hth
            ring = [P3(a, sx * xi, yo), P3(a, sx * xo, yo), P3(a, sx * xo, yt - up * 0.012), P3(a, sx * (xo - 0.025), yt), P3(a, sx * (xi + 0.02), yt + up * 0.012), P3(a, sx * (xi - 0.012 * (up > 0)), yt)]
            rings.append(ring)
        pivot = P3(SB_A0, sx * (SB_XI + SB_XO) / 2, SB_Y + up * (SB_TH + 0.012))
        b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN); ob = b.finish(name, sharp_deg=32); _rel(ob, pivot)
        # плюс - задняя кромка от оси: верхний вверх, нижний вниз. Поворот вокруг X: задняя кромка (-Y) идёт вверх при минусе
        PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((-1 if up > 0 else 1, 0, 0)), range=(0.0, 60.0), note='петля спереди; плюс - открыт: задняя кромка ' + ('вверх' if up > 0 else 'вниз'))
        out.append(ob)
    return out


# ── киль и руль ──
FIN_Y0, FIN_Y1 = 1.180, 3.390
F_LE = Track([(FIN_Y0, 11.380), (FIN_Y1, 13.840)])
F_TE = Track([(FIN_Y0, 13.910), (FIN_Y1, 14.980)])
RUD = (1.560, 3.200, 0.700)


def fin_tc(y): return 0.042 - 0.012 * (y - FIN_Y0) / (FIN_Y1 - FIN_Y0)


def fin():
    ys = [FIN_Y0, 1.30, 1.45, 1.556, 1.56] + [1.56 + (3.2 - 1.56) * i / 8 for i in range(1, 9)] + [3.204, 3.32, FIN_Y1]
    rings = []
    for y in ys:
        c = F_TE(y) - F_LE(y)
        if RUD[0] - 1e-6 <= y <= RUD[1] + 1e-6: ue, tail = cove_cut(F_LE(y), c, fin_tc(y), F_TE(y) - RUD[2], 0.006)
        else: ue, tail = 1.0, cove_wall(F_LE(y), c, fin_tc(y), 1.0)
        rings.append(foil_ring(F_LE(y), c, fin_tc(y), 0.0008, ue, 18, lambda a, h: P3(a, h, y), tail=tail, head=cove_wall_f(F_LE(y), c, fin_tc(y), 0.0008)))
    b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    # колпак на вершине: узкая полка и каплевидный огонь (f16_01, 03)
    a0, a1 = F_LE(FIN_Y1) + 0.02, F_TE(FIN_Y1) + 0.02; yt = FIN_Y1 + 0.03
    cap = lambda a, hw, h: [P3(a, -hw, yt - h), P3(a, hw, yt - h), P3(a, hw, yt + h), P3(a, -hw, yt + h)]
    b.loft([cap(a0, 0.006, 0.012), cap(a0 + 0.12, 0.032, 0.032), cap(a1 - 0.10, 0.036, 0.034), cap(a1, 0.018, 0.022)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('fin_c', sharp_deg=48)


def rudder():
    name = 'rudder'; y0, y1, cd = RUD
    p0 = P3(F_TE(y0) - cd, 0.0, y0); p1 = P3(F_TE(y1) - cd, 0.0, y1); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized()
    rings = []
    for i in range(9):
        y = y0 + 0.006 + (y1 - y0 - 0.012) * i / 8; c = F_TE(y) - F_LE(y); ah = F_TE(y) - cd
        rings.append([v - pivot for v in foil_ring(F_LE(y), c, fin_tc(y), (ah - F_LE(y)) / c, 1.0, 9, lambda a, h: P3(a, h, y), head=cove_nose(F_LE(y), c, fin_tc(y), ah))])
    b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for yy in (2.75, 2.15): strut(b, P3(F_TE(yy) - 0.02, 0.0, yy) - pivot, P3(F_TE(yy) + 0.13, 0.0, yy) - pivot, 0.008, G_METAL)   # штыри антенн (f16_03)
    ob = b.finish(name, sharp_deg=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-28.0, 28.0), note='ось в центре круглого носа, снизу вверх')
    return ob


# ── наклонные подфюзеляжные гребни (f16_03, 06): без шарнира ──
def ventral(sx):
    cant = 0.27; x0, y0 = 0.640, -0.480
    pl = [(10.480, y0), (11.780, y0), (11.800, -0.780), (10.800, -1.130)]
    X = lambda y: sx * (x0 + cant * (y0 - y))
    b = B(); t = 0.020
    ring = lambda d: [P3(a, X(y) + d, y) for a, y in pl]
    # передняя кромка острая: срез толщины к кромке
    def ring2(d):
        out = []
        for i, (a, y) in enumerate(pl): out.append(P3(a, X(y) + d * (0.35 if i in (0, 3) else 1.0), y))
        return out
    b.loft([ring2(t), ring2(-t)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('s_ventral_' + ('r' if sx > 0 else 'l'), sharp_deg=30)


# ── сопло ──
NOZ_Y, NOZ_A0, NOZ_A1, NOZ_R0, NOZ_R = 0.170, 13.860, 14.630, 0.578, 0.465


def bore_cut():
    a1 = NOZ_A0; n = 56
    ring = lambda a, r: [P3(a, r * math.sin(2 * math.pi * k / n), NOZ_Y - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    prof = [(a1 + 0.25, 0.500, G_METAL), (a1 - 0.18, 0.500, G_METAL), (a1 - 0.22, 0.470, G_METAL), (a1 - 0.30, 0.470, G_METAL), (a1 - 0.34, 0.500, G_METAL), (a1 - 0.80, 0.490, G_COCK), (a1 - 1.10, 0.480, G_DARK), (a1 - 1.50, 0.300, G_DARK), (a1 - 1.62, 0.040, G_DARK)]
    b = B(); b.loft([ring(a, r) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK)
    return b.finish('c_bore', sharp_deg=30)


def strut(b, p0, p1, r, mat=G_METAL, n=12):
    d = (p1 - p0).normalized(); u = d.orthogonal().normalized(); v = d.cross(u)
    rg = lambda c: [c + (u * math.cos(2 * math.pi * q / n) + v * math.sin(2 * math.pi * q / n)) * r for q in range(n)]
    b.loft([rg(p0), rg(p1)], mat, cap0=mat, cap1=mat)


def nozzle():
    """Сопло с лепестками: силовое кольцо, пояс механики, 15 наружных тёмных лепестков внахлёст, внутренние створки, тяги (f16_03, 04, 11)."""
    b = B(); N = 15; a0 = NOZ_A0 + 0.002; a1 = NOZ_A1; aM = a0 + 0.13; aP = a0 + 0.30
    def ptp(a, r, ang): return P3(a, r * math.sin(ang), NOZ_Y - r * math.cos(ang))
    ring = lambda a, r, nn=60: [ptp(a, r, 2 * math.pi * k / nn) for k in range(nn)]
    def box_sect(a, r, ang, hw_ang, th): return [ptp(a, r, ang - hw_ang), ptp(a, r, ang + hw_ang), ptp(a, r + th, ang + hw_ang), ptp(a, r + th, ang - hw_ang)]
    sec = [ring(a0 - 0.02, NOZ_R0 - 0.03), ring(a0 + 0.012, NOZ_R0), ring(a0 + 0.10, NOZ_R0 - 0.002), ring(aM, NOZ_R0 - 0.022), ring(aM, NOZ_R0 - 0.07), ring(a0 - 0.02, NOZ_R0 - 0.08)]
    b.loft(sec + [sec[0]], G_METAL)
    b.loft([ring(aM - 0.01, NOZ_R0 - 0.07), ring(aP + 0.06, NOZ_R0 - 0.085)], G_DARK)
    for a_h, r_h in ((a0 + 0.185, NOZ_R0 - 0.05), (a0 + 0.255, NOZ_R0 - 0.05)):
        rh = [ring(a_h - 0.010, r_h), ring(a_h + 0.010, r_h), ring(a_h + 0.010, r_h + 0.014), ring(a_h - 0.010, r_h + 0.014)]
        b.loft(rh + [rh[0]], G_METAL)
    Rp = lambda a: (NOZ_R0 - 0.022) + (NOZ_R - (NOZ_R0 - 0.022)) * (a - aP) / (a1 - aP)
    hwo = math.pi / N * 1.03; th = 0.013
    for j in range(N):
        am = 2 * math.pi * j / N
        def petal(a):
            r = Rp(a); o = []; i_ = []
            for q in range(5):
                t_ = q / 4; ang = am - hwo + 2 * hwo * t_; lift = 0.007 * (1 - t_)
                o.append(ptp(a, r + lift, ang)); i_.append(ptp(a, r + lift - th, ang))
            return o + i_[::-1]
        b.loft([petal(aP), petal(aP + (a1 - aP) * 0.5), petal(a1)], G_METAL, cap0=G_METAL, cap1=G_METAL)
        ang_h = 0.022
        b.loft([box_sect(aP + 0.04, Rp(aP + 0.04) + 0.005, am, ang_h, 0.012), box_sect(a1 - 0.08, Rp(a1 - 0.08) + 0.005, am, ang_h, 0.012)], G_METAL, cap0=G_METAL, cap1=G_METAL)
        b.loft([box_sect(a1 - 0.06, NOZ_R + 0.006, am + math.pi / N, 0.040, 0.010), box_sect(a1, NOZ_R + 0.006, am + math.pi / N, 0.040, 0.010)], G_METAL, cap0=G_METAL, cap1=G_METAL)
        hwi = math.pi / N * 0.97
        b.loft([box_sect(a1 - 0.002, NOZ_R - th - 0.003, am, hwi, -0.006), box_sect(a1 - 0.40, 0.385, am, hwi, -0.006), box_sect(a0 + 0.03, 0.490, am, hwi, -0.006)], G_METAL, cap0=G_METAL, cap1=G_METAL)
        ang_k = 0.030 if j % 2 else 0.018
        b.loft([box_sect(aM + 0.005, NOZ_R0 - 0.07, am + math.pi / N, ang_k, 0.040), box_sect(aP + 0.02, NOZ_R0 - 0.075, am + math.pi / N, ang_k, 0.040)], G_METAL, cap0=G_METAL, cap1=G_METAL)
        p0 = ptp(a0 + 0.11, NOZ_R0 + 0.006, am); p1 = ptp(aP + 0.24, Rp(aP + 0.24) + 0.022, am)
        strut(b, p0, p1, 0.010, G_METAL)
    return b.finish('nozzle', sharp_deg=30)


# ── кабина: выемка, фонарь цельный с аркой ──
CK_A0, CK_A1 = 3.020, 6.260
CK_HW = Track([(3.02, 0.230), (3.40, 0.360), (4.20, 0.430), (5.70, 0.430), (6.26, 0.380)])


def cock_cut():
    def sec(a, y0, y1, hw):
        return [P3(a, -hw, y0), P3(a, hw, y0), P3(a, hw, y1), P3(a, -hw, y1)]
    st = stations(CK_A0, CK_A1, 0.27)
    rings = [sec(a, 0.09, 1.80, CK_HW(a)) for a in st]
    return loft_obj('c_cock', rings, G_COCK, sharp=25)


CANOPY = [(2.860, 0.905, 0.095), (3.000, 1.030, 0.240), (3.200, 1.180, 0.345), (3.390, 1.290, 0.405), (3.660, 1.375, 0.445), (3.930, 1.435, 0.470), (4.580, 1.505, 0.490), (5.000, 1.515, 0.492), (5.440, 1.505, 0.490), (5.900, 1.440, 0.470), (6.150, 1.385, 0.445), (6.300, 1.340, 0.420), (6.380, 1.300, 0.400)]
CAN_T = tracks(CANOPY)
CAN_HINGE = (6.620, 1.200)
ARCH_A = 4.730


def SILL(a): return skin_top(a, CAN_T[1](a))


def can_ring(a, inset=0.0, n=44):
    """Дуга стекла от порога до порога."""
    top, hw = CAN_T[0](a) - inset, CAN_T[1](a) - inset; y0 = SILL(a) + 0.002
    out = []
    for k in range(n):
        c = math.cos(math.pi * k / (n - 1)); s = math.sin(math.pi * k / (n - 1))
        out.append(P3(a, math.copysign(hw * abs(c) ** 0.84, c), y0 + (top - y0) * s ** 0.92))
    return out


def frame_arch(b, a, w, inset=0.008, h=0.020, n=44):
    ri0 = can_ring(a - w, inset, n); ro0 = can_ring(a - w, -h, n); ro1 = can_ring(a + w, -h, n); ri1 = can_ring(a + w, inset, n)
    strip(b, [ri0, ro0, ro1, ri1, ri0], G_SKIN)


def canopy():
    """Весь фонарь с аркой и рамой откидывается на петле сзади: стекло - дочерний объект, рама - на оси."""
    a0 = 2.875; a1 = 6.360; st = [a0, 2.91, 2.96, 3.02, 3.09] + stations(3.17, a1, 0.13); pivot = P3(CAN_HINGE[0], 0.0, CAN_HINGE[1])
    bg = B(); strip(bg, [can_ring(a) for a in st], G_GLASS); gl = bg.finish('canopy_glass', sharp_deg=60)
    for v in gl.data.vertices: v.co -= pivot
    gl.location = pivot
    b = B(); frame_arch(b, ARCH_A, 0.030)
    frame_arch(b, a1 - 0.02, 0.028, inset=0.006, h=0.022)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        st2 = stations(2.92, a1, 0.16)
        b.loft([[rail(a, 0.006, 0.006) for a in st2], [rail(a, 0.020, 0.006) for a in st2], [rail(a, 0.016, 0.028) for a in st2], [rail(a, -0.014, 0.046) for a in st2], [rail(a, -0.014, 0.018) for a in st2]], G_SKIN)
        for a in (3.45, 4.05, 4.65, 5.25, 5.85):
            y = SILL(a); x = sg * (CAN_T[1](a) - 0.028)
            b.loft([[P3(a, x - 0.009, y + 0.006), P3(a + 0.05, x - 0.009, y + 0.006), P3(a + 0.05, x + 0.009, y + 0.006), P3(a, x + 0.009, y + 0.006)], [P3(a, x - 0.009, y + 0.018), P3(a + 0.05, x - 0.009, y + 0.018), P3(a + 0.05, x + 0.009, y + 0.018), P3(a, x + 0.009, y + 0.018)]], G_METAL, cap0=G_METAL, cap1=G_METAL)
    # зеркала на арке (f16_03)
    for x_, y_ in ((0.0, CAN_T[0](ARCH_A) - 0.034), (0.22, CAN_T[0](ARCH_A) - 0.110), (-0.22, CAN_T[0](ARCH_A) - 0.110)):
        if x_: strut(b, P3(ARCH_A - 0.03, x_, y_), P3(ARCH_A, x_ * 1.03, y_ + 0.05), 0.008, G_METAL)
        q = lambda d: [P3(ARCH_A - d, x_ - 0.055, y_ - 0.022), P3(ARCH_A - d, x_ + 0.055, y_ - 0.022), P3(ARCH_A - d, x_ + 0.055, y_ + 0.022), P3(ARCH_A - d, x_ - 0.055, y_ + 0.022)]
        b.loft([q(0.052), q(0.020)], G_COCK, cap0=G_COCK, cap1=G_COCK)
    fr = b.finish('canopy', sharp_deg=45)
    for v in fr.data.vertices: v.co -= pivot
    fr.location = pivot; gl.parent = fr; gl.location = (0, 0, 0)
    PARTS['canopy'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, 40.0), note='петля сзади за фонарём; плюс - передняя кромка вверх; canopy_glass - дочерний объект')
    return [fr, gl]


# ── пилоны и точки подвески ──
PYLONS = (  # имя, x, a0 низа, a1 низа, a0 верха, a1 верха, высота низа над... от крыла, полутолщина
    ('in', 2.040, 8.090, 9.820, 8.060, 10.000, 0.520, 0.045),
    ('mid', 3.100, 8.920, 10.060, 8.900, 10.200, 0.460, 0.040),
    ('out', 4.120, 9.680, 10.600, 9.660, 10.720, 0.240, 0.034))
CHEEK = (0.720, 7.150, -0.690)                                  # x, a, y низа точки на борту под воздухозаборником
POD = (0.500, 5.720, -0.640)                                    # контейнер справа под устьем: x, a, y обшивки
PYLON_PTS = {}


def pylon(name, x, a0b, a1b, a0t, a1t, h, hw, sx):
    yb = WING_Y - h; yt = WING_Y - 0.002; b = B()
    poly = [(a0b + 0.10, yb), (a1b - 0.06, yb), (a1b, yb + 0.05), (a1t, yt), (a0t, yt), (a0b, yb + 0.05)]
    ac = sum(p[0] for p in poly) / len(poly); yc_ = sum(p[1] for p in poly) / len(poly)
    def ring(k, ins):
        out = []
        for a, y in poly:
            da, dy = ac - a, yc_ - y; ln = math.hypot(da, dy); out.append(P3(a + da / ln * ins, sx * x + k, y + dy / ln * ins))
        return out
    rs = [ring(-hw, 0.016), ring(-hw * 0.72, 0.0), ring(hw * 0.72, 0.0), ring(hw, 0.016)]
    b.loft(rs, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    nm = f'pylon_{name}_' + ('r' if sx > 0 else 'l'); PYLON_PTS[nm] = P3((a0b + a1b) / 2, sx * x, yb)
    return b.finish(nm, sharp_deg=30)


def cheek(sx):
    x, am, y0 = CHEEK; b = B(); hl = 0.34; yt = -0.20
    sec = lambda a, f: [P3(a, sx * x - 0.040 * f, y0), P3(a, sx * x + 0.040 * f, y0), P3(a, sx * x + 0.055 * f, yt), P3(a, sx * x - 0.055 * f, yt)]
    st = [am - hl, am - hl + 0.08, am + hl - 0.08, am + hl]; fs = [0.25, 1.0, 1.0, 0.25]
    b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    nm = 'stub_' + ('r' if sx > 0 else 'l'); PYLON_PTS[nm] = P3(am, sx * x, y0)
    return b.finish(nm, sharp_deg=30)


# ── обшивка ──
BVH = {}


def bvh_ready(host):
    me = host.data; BVH['t'] = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons]); BVH['host'] = host


def build_skin():
    S = [body(), gargrot(), inlet_body(), wing_s(1), wing_s(-1), ventral(1), ventral(-1), sb_web(1), sb_web(-1)]
    host = S[0]
    for o in S[1:]:
        _apply_bool(host, o, 'UNION'); _drop(o)
    c = duct_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = pod_hole(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = bore_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = cock_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'F16_skin'; host.data.name = 'F16_skin'
    bvh_ready(host)
    return host


def down(x, y_world, z0=3.0, dirn=-1):
    hit = BVH['t'].ray_cast(Vector((x, y_world, z0)), Vector((0, 0, dirn)))
    return hit[0]


def patch(name, outline, nu, nv, dirn=-1, lift=0.006, th=0.018, mat=G_SKIN, z0=3.0):
    """Плита по обшивке: outline(u, v) -> (a, x); вершины кладутся лучом на обшивку (щиток, створки, люк). Начало - в нуле мира."""
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


# ── люк дозаправки на гаргроте ──
REFUEL = (9.380, 10.020, 0.150)


def refuel_door():
    a0, a1, hw = REFUEL
    ob = patch('door_refuel', lambda u, v: (a0 + (a1 - a0) * v, (u - 0.5) * 2 * hw), 6, 8, lift=0.002, th=0.014)
    h = down(0.0, Yb(a0)); pivot = Vector((0.0, Yb(a1), down(0.0, Yb(a1)).z - 0.004)); _rel(ob, pivot)
    PARTS['door_refuel'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, 70.0), note='петля сзади; плюс - передняя кромка вверх')
    return ob


# ── шасси ──
GROUND_Y = -1.620
NG = dict(a=5.170, hinge=(5.520, -0.545), rw=0.225, ww=0.145)
MG_A, MG_X = 9.030, 1.300
NOSE_BAY = (5.250, 6.450, 0.285)
MAIN_BAY = (7.660, 9.280, 0.720, 1.320)


def doors():
    """Створки: плиты по обшивке снизу, при углах 0 закрыты (файл игры). Большая носовая справа (f16_01, 03), узкая слева; основные с петлёй у внешней кромки."""
    out = []
    a0, a1, hw = NOSE_BAY
    for sx, x0, x1, nm in ((1, 0.003, hw, 'door_n_r'), (-1, 0.003, hw, 'door_n_l')):
        ob = patch(nm, lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + (x1 - x0) * u)), 6, 8, dirn=1, lift=0.003, th=0.016, z0=-3.0)
        am = (a0 + a1) / 2; pivot = P3(am, sx * x1, down(sx * x1, Yb(am), z0=-3.0, dirn=1).z - 0.003); _rel(ob, pivot)
        PARTS[nm] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(-88.0 * sx, 0.0) if sx > 0 else (0.0, 88.0), note='0 - закрыта (файл игры), открытие наружу на 88°')
        out.append(ob)
    a0, a1, x0, x1 = MAIN_BAY
    for sx in (1, -1):
        nm = 'door_m_' + ('r' if sx > 0 else 'l')
        ob = patch(nm, lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + (x1 - x0) * u)), 8, 8, dirn=1, lift=0.003, th=0.018, z0=-3.0)
        am = (a0 + a1) / 2; pivot = P3(am, sx * x1, down(sx * x1, Yb(am), z0=-3.0, dirn=1).z - 0.003); _rel(ob, pivot)
        PARTS[nm] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(-56.0, 0.0) if sx > 0 else (0.0, 56.0), note='0 - закрыта, петля у наружной кромки; 56 - открыта, висит чуть наружу (f16_03)')
        out.append(ob)
    return out


def plane(stage=9, carve=True):
    """Этапы: 1 обшивка с крыльями; 2 рули, оперение, сопло; 3 кабина, фонарь, пилоны, детали; 4 шасси и створки."""
    import f16_detail as d
    PARTS.clear(); PYLON_PTS.clear()
    skin = build_skin(); out = [skin]
    ref_me = skin.data.copy(); d.resharp(types.SimpleNamespace(data=ref_me))   # гладкая обшивка до резки: с неё берутся нормали
    if stage >= 2:
        out += [fin(), rudder(), stab(1), stab(-1), nozzle(), flaperon(1), flaperon(-1), lef_part(1), lef_part(-1), tip_rail(1), tip_rail(-1), d.burner(), d.fan_face(), d.splitter()]
        out += speedbrakes(1) + speedbrakes(-1)
    if stage >= 3:
        out += [d.cockpit_detail()] + canopy()
        for sx in (1, -1):
            for p in PYLONS: out.append(pylon(*p, sx))
            out.append(cheek(sx))
        out += [d.details(), d.hinges(), refuel_door()] + d.hardpoints() + [d.plates()]
    if stage >= 4:
        out += doors()
        import f16_gear as gr; out += gr.gear_nose() + gr.gear_main(1) + gr.gear_main(-1)
    if carve:
        print('канавок и выемок:', d.carve(skin))
    if stage >= 4: d.bays(skin)
    d.resharp(skin); print('нормали обшивки:', d.smooth_normals(skin, ref_me)); bpy.data.meshes.remove(ref_me)
    return out
