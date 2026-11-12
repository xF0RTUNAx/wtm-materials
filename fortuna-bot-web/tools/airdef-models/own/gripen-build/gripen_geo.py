# gripen_geo.py - геометрия JAS 39 Gripen C для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z.
# a - расстояние от острия обтекателя РЛС (без ПВД), y - высота над острием. Бок снят с gripen_11 (ортопрофиль), план - с нынешней модели игры и gripen_01; длина 14,69 как у нынешней модели.
import math, os
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 14.69
G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK = 0, 1, 2, 3, 4, 5
PARTS = {}
PYLON_PTS = {}
BVH = {}


def Yb(a): return L / 2 - a


def P3(a, x, y): return Vector((x, Yb(a), y))


class Lin:
    def __init__(self, pts): self.p = pts
    def __call__(self, t):
        p = self.p
        if t <= p[0][0]: return p[0][1]
        for (a0, b0), (a1, b1) in zip(p, p[1:]):
            if t <= a1: return b0 + (b1 - b0) * (t - a0) / (a1 - a0)
        return p[-1][1]


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
        p0, p1, p2 = P[i - 1], P[i], P[(i + 1) % m]; d0 = (p0 - p1).normalized(); d1 = (p2 - p1).normalized(); rr = min(r[i] if isinstance(r, (list, tuple)) else r, (p0 - p1).length * 0.45, (p2 - p1).length * 0.45); q0 = p1 + d0 * rr; q1 = p1 + d1 * rr
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


def bvh_ready(host):
    me = host.data; BVH['t'] = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons]); BVH['host'] = host



# ── сопло: одно, по оси; канал внутри (gripen_11, 12) ──
NAC_A1 = 13.82; NOZ_X = 0.0; NOZ_Y = 0.54; NOZ_A = 14.69; NOZ_R = 0.355; NOZ_R0 = 0.465


def bore_cut(sx=1):
    a1 = NAC_A1; n = 64
    ring = lambda a, r: [P3(a, r * math.sin(2 * math.pi * k / n), NOZ_Y - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    prof = [(a1 + 0.25, 0.440, G_METAL), (a1 - 0.18, 0.440, G_METAL), (a1 - 0.22, 0.415, G_METAL), (a1 - 0.30, 0.415, G_METAL), (a1 - 0.34, 0.440, G_METAL), (a1 - 0.60, 0.430, G_COCK), (a1 - 0.95, 0.380, G_DARK), (a1 - 1.25, 0.260, G_DARK), (a1 - 1.35, 0.040, G_DARK)]
    b = B(); b.loft([ring(a, r) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK)
    return b.finish('c_bore', sharp_deg=30)


def nozzle(sx=1):
    """Сопло: обечайка, 14 лепестков с перекрытием, тяги, нутро (gripen_12)."""
    b = B(); N = 14; a0 = NAC_A1 + 0.002; a1 = NOZ_A; aM = a0 + 0.120; aP = a0 + 0.125
    def ptp(a, r, ang): return P3(a, r * math.sin(ang), NOZ_Y - r * math.cos(ang))
    ring = lambda a, r, nn=64: [ptp(a, r, 2 * math.pi * k / nn) for k in range(nn)]
    def box_sect(a, r, ang, hw_ang, th): return [ptp(a, r, ang - hw_ang), ptp(a, r, ang + hw_ang), ptp(a, r + th, ang + hw_ang), ptp(a, r + th, ang - hw_ang)]
    R0 = NOZ_R0
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
        b.loft([box_sect(a1 - 0.002, NOZ_R - th - 0.003, am, hwi, -0.006), box_sect(a1 - 0.55, 0.360, am, hwi, -0.006), box_sect(a0 + 0.03, 0.438, am, hwi, -0.006)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('nozzle', sharp_deg=30)


# ── корпус: одно тело от носа до сопла (gripen_11 - бок, план - нынешняя модель и gripen_01) ──
HULL = [  # a, верх, низ, полуширина, nверх, nниз
    (0.00, 0.000, -0.012, 0.006, 2.0, 2.0), (0.30, 0.160, -0.085, 0.100, 2.0, 2.0), (0.70, 0.320, -0.160, 0.215, 2.0, 2.0), (1.20, 0.475, -0.215, 0.300, 2.1, 2.1),
    (1.80, 0.630, -0.248, 0.375, 2.4, 2.3), (2.40, 0.780, -0.262, 0.435, 2.8, 2.5), (3.00, 0.890, -0.275, 0.475, 3.2, 2.7), (3.80, 0.950, -0.282, 0.500, 3.5, 2.9),
    (4.60, 0.985, -0.290, 0.520, 3.5, 3.0), (5.40, 1.000, -0.305, 0.545, 3.2, 3.0), (6.40, 0.920, -0.325, 0.630, 2.8, 3.0), (7.40, 0.830, -0.330, 0.830, 2.6, 3.0),
    (8.40, 0.790, -0.322, 0.960, 2.5, 3.0), (9.40, 0.780, -0.315, 0.990, 2.5, 3.0), (10.40, 0.780, -0.305, 0.980, 2.5, 3.0), (11.40, 0.785, -0.272, 0.950, 2.5, 2.9),
    (12.20, 0.810, -0.200, 0.870, 2.4, 2.7), (12.90, 0.905, -0.090, 0.720, 2.3, 2.4), (13.40, 0.975, 0.020, 0.580, 2.1, 2.15), (13.65, 1.000, 0.055, 0.505, 2.0, 2.05), (13.82, 1.005, 0.075, 0.465, 2.0, 2.0)]
# гребень посередине и «щёки» каналов по бокам: корпус за кабиной не полный, а с узким гребнем и пологими скатами к крылу (gripen_15, 16, 18; слова Mark: «сосиска»)
SPZ = Track([(4.55, 0.990), (4.85, 1.200), (5.15, 1.375), (5.35, 1.380), (5.60, 1.360), (6.30, 1.315), (7.20, 1.280), (8.40, 1.252), (9.6, 1.245), (12.90, 1.245), (13.30, 1.235), (13.60, 1.175), (13.82, 1.050)])     # горб плавно опускается к полосе
SPW = Track([(4.55, 0.250), (5.15, 0.325), (6.0, 0.315), (7.0, 0.270), (8.0, 0.210), (9.0, 0.155), (10.0, 0.118), (12.4, 0.100), (13.0, 0.092), (13.5, 0.085), (13.82, 0.070)])     # горб за кабиной долго сужается в узкую полосу (Mark: без резкого наплыва)
CHZ = Track([(5.60, 1.000), (6.40, 0.990), (7.60, 0.960), (10.0, 0.930), (12.0, 0.900), (12.9, 0.880), (13.4, 0.900)])
CHX = Track([(5.60, 0.660), (8.0, 0.700), (12.0, 0.660), (13.4, 0.520)])
# пологий скат вместо щёк (Mark: «на референсах плавнее сходит, нет вмятого и высокого по бокам»): купол от гребня к крылу без впадины
DKZ = Track([(5.70, 1.040), (6.60, 1.010), (7.60, 0.980), (10.0, 0.965), (12.0, 0.950), (12.9, 0.980), (13.5, 1.000)])
DKW = Track([(5.70, 0.620), (6.60, 0.660), (7.60, 0.660), (10.6, 0.640), (11.4, 0.660), (12.2, 0.780), (12.9, 0.720), (13.5, 0.580)])     # высокая часть узкая, быстро к уровню крыла (Mark); к соплу снова круглая
TLO = Track([(7.0, 0.830), (8.0, 0.720), (9.4, 0.705), (11.4, 0.710), (12.2, 0.745), (12.9, 0.840), (13.5, 0.985)])     # верх корпуса по бокам от высокой части: почти на уровне крыла (Mark: «резко переходит с высоты на уровень крыла»)
# «крыша»: от полосы посередине прямой, чуть выпуклый скат до самого корня крыла / кромки заборника (образец модели Mark, фото 17, 19, 20)
ROOF_ZR = Track([(4.75, 1.020), (5.0, 1.060), (5.8, 1.120), (6.6, 1.160), (7.4, 1.170), (8.4, 1.170), (11.4, 1.165), (12.4, 1.140), (12.9, 1.085), (13.3, 1.035), (13.6, 1.008), (13.82, 1.005)])     # верх ската у полосы; к соплу - верх круга сопла
ROOF_ZE = Track([(4.75, 0.740), (6.6, 0.740), (7.4, 0.660), (8.4, 0.600), (11.0, 0.600), (11.6, 0.525), (12.2, 0.505), (12.9, 0.580), (13.3, 0.700), (13.6, 0.850)])     # низ ската: у кромки заборника, над крылом; за крылом не задирается, а плавно скругляется к соплу
ROOF_P, ROOF_R = 1.2, 0.07     # скат почти прямой, у борта небольшое скругление
TAIL_R = Track([(12.2, 0.0), (12.6, 0.16), (13.0, 0.25), (13.4, 0.33), (13.82, 0.40)])     # за крылом край ската всё круглее: «крыша» сама переходит в круг сопла (Mark: естественный переход)
HT = tracks(HULL)


def _smax(a_, b_, k=0.14):
    h = max(0.0, min(1.0, 0.5 + 0.5 * (a_ - b_) / k)); return b_ + (a_ - b_) * h + k * h * (1 - h)


def top_z(a, ax_, z, top, deck=True):
    lw_ = smooth_(7.0, 8.0, a) * smooth_(12.6, 11.6, a) if deck else 0.0
    if lw_ > 0:
        cy_ = (top + HT[1](a)) / 2; z = cy_ + (z - cy_) * (1 + lw_ * ((TLO(a) - cy_) / (top - cy_) - 1))     # верхняя половина ниже по высоте, низ не трогаем
    """Верх корпуса над |x|: пологий скат к крылу (купол) и гребень с мягкой галтелью поверх обычного сечения z."""
    dk_ = smooth_(5.70, 6.70, a) * smooth_(13.75, 13.25, a) if deck else 0.0
    if dk_ > 0:
        q3 = ax_ / min(DKW(a), hull_wt(a) * 0.985)
        if q3 < 1.0: z = z + dk_ * (_smax(z, 0.42 + (DKZ(a) - 0.42) * (1 - q3 ** 2.4) ** (1 / 2.4), 0.14) - z)     # высокая часть посередине, спуск к уровню крыла с галтелью внизу
    if 4.55 <= a <= 13.82:
        t_ = smooth_(5.30, 6.30, a); w_ = SPW(a) * (1 + 0.30 * t_); q = ax_ / w_
        if q < 1.0:
            c_ = q ** ((1 / 0.70) * (1 - t_) + t_); ex_ = 0.41 * (1 - t_) + 2.2 * t_; y0_ = min(top - 0.06, z)     # у фонаря сечение как у фонаря, дальше - гребень колоколом: подножие вогнутое, сходит в скат
            z = _smax(z, y0_ + (SPZ(a) - y0_) * max(0.0, 1 - c_ * c_) ** ex_, max(1e-4, (0.06 + 0.10 * smooth_(4.85, 5.25, a) + 0.04 * t_) * (1 - q * q)))     # за кабиной галтель шире: горб с крутыми боками не врезается в скат углом     # мягкая галтель гребня, к краю гребня сходит в ноль: без ступеньки
    return z


def hull_wt(a):
    """Полуширина ВЕРХНЕЙ половины корпуса: над заборниками верх расширен до их наружной кромки и круглым скатом сходит к ним (без отдельного «плеча» и складок)."""
    hw = HT[2](a); return hw + max(0.0, INL_XO(a) - 0.16 - hw) * smooth_(4.70, 5.10, a) * smooth_(8.6, 7.8, a)


def roof_half(a, W, cy, m):
    """Правая половина верха: борт вверх от cy, скругление, скат к середине. m+1 точек по длине дуги от (W, cy) до (0, верх)."""
    ze, zr, r = roof_edge(a), ROOF_ZR(a), max(0.004, (ROOF_R + 0.10 * smooth_(11.97, 12.45, a)) * (1 - root_env(a)) * (1 - 0.8 * smooth_(7.6, 7.0, a)))     # за крылом край ската круглый: без перепада над щитком
    if a > 12.2: rt = TAIL_R(a) if a < 13.82 else 0.40; r = max(r, rt); ze = max(ze, cy + r)
    P_ = ROOF_P + 0.8 * smooth_(12.6, 13.82, a)     # над наплывом угол почти острый: его закрывает крыло
    roof = lambda x: ze + (zr - ze) * (1 - (x / W) ** P_)
    P = [Vector((W, cy + (ze - r - cy) * i / 6)) for i in range(7)]
    A_, B_, C_ = Vector((W, ze - r)), Vector((W, ze)), Vector((W - r, roof(W - r)))
    P += [A_ * (1 - t) ** 2 + B_ * 2 * t * (1 - t) + C_ * t * t for t in (k / 10 for k in range(1, 11))]
    P += [Vector((x, roof(x))) for x in ((W - r) * (1 - k / 40) for k in range(1, 41))]
    L_ = [0.0]
    for i in range(1, len(P)): L_.append(L_[-1] + (P[i] - P[i - 1]).length)
    out = []; j = 0
    for k in range(m + 1):
        t = L_[-1] * k / m
        while j < len(P) - 2 and L_[j + 1] < t: j += 1
        f = (t - L_[j]) / max(1e-9, L_[j + 1] - L_[j]); out.append(P[j] + (P[j + 1] - P[j]) * f)
    return out


def hull_ring(a, n=96):
    top, bot, hw, nt, nb = [t(a) for t in HT]; pts = sup(a, 0.0, top, bot, hw, nt, nb, n); cy = (top + bot) / 2
    if not (4.55 <= a <= 13.82): return pts
    k_ = hull_wt(a) / hw     # ступенька на высоте cy при k_ > 1 спрятана внутри коробов заборников
    out = [Vector((p.x * k_, p.y, top_z(a, abs(p.x) * k_, p.z, top))) if p.z > cy else p for p in pts]
    wr = smooth_(4.75, 5.15, a)     # скат сразу за фонарём (без мятого перехода) и до самого сопла: к соплу он сам скругляется в круг
    if wr > 0 and n % 4 == 0:
        q4 = n // 4; H_ = roof_half(a, hull_wt(a), cy, q4); y_ = pts[0].y
        for k in range(q4 + 1, 3 * q4):
            j = k - q4 if k <= 2 * q4 else 3 * q4 - k; hp = H_[j]; sx = 1 if k <= 2 * q4 else -1
            zr = top_z(a, hp.x, hp.y, top, deck=False)     # полоса посередине поверх ската
            b = out[k]; out[k] = Vector((b.x + (sx * hp.x - b.x) * wr, y_, b.z + (zr - b.z) * wr))
    return out


def smooth_(e0, e1, v):
    t = max(0.0, min(1.0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t)

def hull():
    st = stations(0.0, 0.6, 0.10)[:-1] + stations(0.6, 2.4, 0.15)[:-1] + stations(2.4, 4.5, 0.18)[:-1] + stations(4.5, 13.82, 0.10)
    return loft_obj('s_hull', [hull_ring(a, 192) for a in st], G_SKIN, sharp=38)


def top_y(a, x):
    """Высота верха корпуса над |x| (порог фонаря), без спины."""
    top, bot, hw, nt, nb = [t(a) for t in HT]; cy = (top + bot) / 2; ht = (top - bot) / 2; q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nt); return cy + ht * q ** (1 / nt)


def skin_top(a, x): return top_y(a, x)


def spine():
    """Гаргрот за фонарём: высокий у фонаря, ровный до киля, к соплу сходит на нет (gripen_02, 07, 11, 14)."""
    Z = Track([(5.05, 1.415), (5.60, 1.360), (6.30, 1.290), (7.20, 1.236)])
    W_ = Track([(5.05, 0.330), (5.80, 0.420), (6.60, 0.520), (7.20, 0.600)])
    H_ = Track([(5.05, 0.40), (6.0, 0.34), (7.2, 0.30)])
    NS = lambda a: 3.0 - 0.8 * min(1.0, max(0.0, (a - 5.05) / 1.0))
    return loft_obj('s_spine', [sup(a, 0.0, Z(a), Z(a) - 2 * H_(a), W_(a), NS(a), 2.3, 48) for a in stations(5.05, 7.20, 0.15)], G_SKIN, sharp=40)


def tail_fair():
    """Под килем корпус не опускается: высокий верх до задней кромки киля, дальше плавно сходит к соплу, без наплывов (gripen_11, 12; слова Mark)."""
    Z = Track([(10.40, 1.243), (12.0, 1.248), (13.30, 1.248), (13.62, 1.236), (13.76, 1.180), (13.84, 1.060)])
    W_ = Track([(10.40, 0.62), (11.5, 0.56), (12.5, 0.46), (13.3, 0.34), (13.62, 0.26), (13.76, 0.17), (13.84, 0.07)])
    H_ = Track([(10.40, 0.26), (12.5, 0.24), (13.30, 0.18), (13.62, 0.14), (13.76, 0.10), (13.84, 0.03)])
    st = stations(10.40, 13.76, 0.20) + [13.80, 13.84]
    return loft_obj('s_tailf', [sup(a, 0.0, Z(a), Z(a) - 2 * H_(a), W_(a), 2.6 - 0.4 * max(0.0, (a - 13.3) / 0.54), 2.0, 48) for a in st], G_SKIN, sharp=40)

# ── воздухозаборники: D-образные по бортам, отсекатель погранслоя, канал (gripen_04, 05, 06, 11) ──
LIP_A = 4.15; LIP_RAKE = 0.13          # верх кромки впереди, низ сзади на 0,13 м
INL_XI = 0.605                          # внутренняя стенка (щель до борта - отсекатель)
INL_XO = Track([(3.90, 1.035), (6.0, 1.035), (7.0, 1.010), (8.2, 0.960), (9.0, 0.930)])
INL_ZT = Track([(3.90, 0.660), (5.0, 0.680), (6.2, 0.690), (7.4, 0.600), (8.0, 0.420), (8.6, 0.300), (9.0, 0.280)])     # за 7,4 верх короба уходит под крыло: не в одной плоскости с ним (зубцы)
INL_ZB = Track([(3.90, -0.150), (5.0, -0.190), (6.2, -0.240), (7.4, -0.290), (8.6, -0.300), (9.0, -0.300)])
INL_R = (0.035, 0.150, 0.075, 0.035)    # скругления: внутр. низ, наруж. низ, наруж. верх, внутр. верх


def lip_a(z): return LIP_A + LIP_RAKE * (INL_ZT(LIP_A) - z) / (INL_ZT(LIP_A) - INL_ZB(LIP_A))


def inl_poly(a, sx, inset=0.0):
    xi, xo, zt, zb = INL_XI + inset, INL_XO(a) - inset, INL_ZT(a) - inset, INL_ZB(a) + inset
    return [(sx * xi, zb), (sx * xo, zb), (sx * xo, zt), (sx * xi, zt)]


def inl_ring(a, sx, inset=0.0, n=72):
    pts = inl_poly(a, sx, inset); r = [max(0.01, q - inset * 0.8) for q in INL_R]
    if sx < 0: pts = pts[::-1]; r = r[::-1]
    return poly_ring(a, pts, n, list(r))


def inlet_box(sx):
    st = stations(3.90, 9.0, 0.05)     # частые сечения: скруглённый угол короба не даёт ряда вмятин на стыке с обшивкой
    return loft_obj('s_inl_' + ('r' if sx > 0 else 'l'), [inl_ring(a, sx) for a in st], G_SKIN, sharp=30)


def hull_x_at(a, z):
    """Полуширина корпуса на высоте z (верхняя половина суперэллипса)."""
    top, bot, hw, nt, nb = [t(a) for t in HT]; cy = (top + bot) / 2; ht = (top - bot) / 2; q = min(1.0, max(0.0, (z - cy) / ht)); return hw * max(0.0, 1 - q ** nt) ** (1 / nt)


def shoulder(sx):
    """Скат от наружного верха заборника вверх к борту под фонарём (gripen_04, 05): заборник не стоит коробкой."""
    rings = []
    for a in stations(3.95, 5.15, 0.04):     # дальше верх корпуса сам расширен над заборниками (hull_wt); частые сечения - без полос в бликах
        zt = INL_ZT(a); xo = INL_XO(a) - 0.17; zu = zt + 0.30 * max(0.0, min(1.0, (5.15 - a) / 0.6)); zu = max(zu, zt + 0.02); xu = hull_x_at(a, zu) - 0.08
        xl = hull_x_at(a, zt - 0.10) - 0.04
        top_ = [P3(a, sx * (xo + (xu - xo) * t), zt - 0.004 + (zu - zt + 0.004) * t + 0.022 * math.sin(math.pi * t)) for t in (k / 10 for k in range(11))]     # верх плеча плавной выпуклой кривой
        rings.append([P3(a, sx * xl, zt - 0.10), P3(a, sx * xo, zt - 0.10)] + top_)
    if sx < 0: rings = [r[::-1] for r in rings]
    return loft_obj('s_sh_' + ('r' if sx > 0 else 'l'), rings, G_SKIN, sharp=30)


def cheek(sx):
    """Щека канала: гладкое тело вдоль борта от плеча заборника до хвоста, верх ниже гребня (gripen_15, 16, 18)."""
    R_ = Track([(5.70, 0.05), (6.30, 0.26), (7.0, 0.33), (11.5, 0.31), (12.8, 0.24), (13.40, 0.06)])
    rings = []
    for a in stations(5.70, 13.40, 0.10):
        r = R_(a); zt = CHZ(a) if a >= 6.3 else INL_ZT(a) + (CHZ(6.3) - INL_ZT(6.3)) * smooth_(5.7, 6.3, a); cx = sx * CHX(a)
        rings.append(sup(a, cx, zt, zt - 2.2 * r, r * 1.05, 2.3, 2.0, 40))
    return loft_obj('s_cheek_' + ('r' if sx > 0 else 'l'), rings, G_SKIN, sharp=40)


def lip_cut(sx):
    """Косой срез кромки: всё впереди наклонной плоскости уходит."""
    zt, zb = 1.2, -0.7; ra = lambda z: lip_a(z)
    rg = lambda da: [P3(ra(zb) + da, sx * 0.40, zb), P3(ra(zb) + da, sx * 1.30, zb), P3(ra(zt) + da, sx * 1.30, zt), P3(ra(zt) + da, sx * 0.40, zt)]
    b = B(); b.loft([rg(-1.0), rg(0.0)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); return b.finish('c_lip', sharp_deg=30)


def duct_cut(sx):
    """Канал вглубь: стенки толщиной 3 см, к концу сужается и уходит к оси, глухой тёмный торец."""
    rings = []; a0 = lip_a(INL_ZB(LIP_A)) + 0.002 - 0.25; a1 = 7.6
    for i in range(13):
        a = a0 + (a1 - a0) * i / 12; t = max(0.0, min(1.0, (a - 4.6) / (a1 - 4.6))); t = t * t * (3 - 2 * t)
        ins = 0.030 + 0.10 * t; ring = inl_ring(min(a, 6.0), sx, inset=ins)
        cx = sx * (INL_XI + INL_XO(4.2)) / 2; cz = (INL_ZT(4.2) + INL_ZB(4.2)) / 2; k = 1 - 0.35 * t
        rings.append([P3(a, cx + (p.x - cx) * k - sx * 0.20 * t, cz + (p.z - cz) * k) for p in ring])
    return loft_obj('c_duct', rings, G_COCK, sharp=25)


def diverter(sx):
    """Клин в щели между стенкой заборника и бортом: начинается за кромкой, закрывает щель к стыку с корпусом."""
    a0 = LIP_A + 0.28; a1 = 5.60; b = B()
    def sec(a, f):
        z0 = INL_ZB(a) + 0.04; z1 = INL_ZT(a) - 0.04; xo = INL_XI + 0.01; xi = top_hw(a) - 0.03; xm = xi + (xo - xi) * (1 - f)
        return [P3(a, sx * xi, z0), P3(a, sx * xo, z0), P3(a, sx * xo, z1), P3(a, sx * xi, z1)] if f >= 1 else [P3(a, sx * xi, z0), P3(a, sx * xi + sx * (xo - xi) * f, (z0 + z1) / 2 - 0.001), P3(a, sx * xi + sx * (xo - xi) * f, (z0 + z1) / 2 + 0.001), P3(a, sx * xi, z1)]
    b.loft([sec(a0, 0.02), sec(a0 + 0.5, 0.75), sec(a0 + 0.9, 1.0), sec(a1, 1.0)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('s_div_' + ('r' if sx > 0 else 'l'), sharp_deg=30)


def top_hw(a): return HT[2](a)


def splitter_plate(sx):
    """Отсекатель: внутренняя стенка заборника вынесена вперёд тонкой пластиной с острой кромкой (gripen_04, 05)."""
    b = B(); x0 = INL_XI; th = 0.012; a0 = lip_a(INL_ZT(LIP_A)) - 0.10; a1 = LIP_A + 0.60
    def sec(a):
        z0 = INL_ZB(a) + 0.01; z1 = INL_ZT(a) - 0.01; k = min(1.0, max(0.15, (a - a0) / 0.12)); t = th * k
        return [P3(a, sx * (x0 - t), z0), P3(a, sx * (x0 + 0.002), z0), P3(a, sx * (x0 + 0.002), z1), P3(a, sx * (x0 - t), z1)]
    b.loft([sec(a0), sec(a0 + 0.12), sec(a1)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('s_spl_' + ('r' if sx > 0 else 'l'), sharp_deg=30)


# ── крыло: дельта с «зубом» передней кромки, прямая задняя кромка (нынешняя модель, gripen_01, 02, 08) ──
X_ROOT = 0.98; X_DOG = 2.95; X_TIP = 4.15
WLE_I = Lin([(X_ROOT, 6.55), (X_DOG, 9.30)]); WLE_O = Lin([(X_DOG, 9.16), (X_TIP, 10.45)])
def WLE(x): return WLE_I(x) if x < X_DOG else WLE_O(x)
WTE = Lin([(X_ROOT, 11.95), (X_TIP, 11.86)])
def wy(x): return 0.355 - 0.018 * max(0.0, x - X_ROOT)
TC = Lin([(X_ROOT, 0.050), (X_TIP, 0.034)])
FLAP_I = (1.30, 2.66); FLAP_O = (2.72, 3.98); SLAT_I = (1.55, 2.88); SLAT_O = (3.02, 4.02); GAP = 0.012
HING = Lin([(1.30, 11.28), (3.98, 11.30)])
SLC = Lin([(1.55, 0.36), (2.88, 0.30), (3.02, 0.30), (4.02, 0.24)])


def in_(x, r): return r[0] <= x <= r[1]


def root_env(a): return smooth_(6.9, 7.6, a) * smooth_(11.75, 11.0, a)     # где по хорде у корня есть наплыв


def wing_top_root(a):
    u = min(1.0, max(0.0, (a - WLE(X_ROOT)) / (WTE(X_ROOT) - WLE(X_ROOT)))); return wy(X_ROOT) + TC(X_ROOT) * (WTE(X_ROOT) - WLE(X_ROOT)) * thk(u)


def root_fill(a):
    """Высота наплыва над крылом у борта и его ширина: касательно к скату корпуса и до элевонов (x 1,30) не доходит."""
    W = hull_wt(a); ze, zr = roof_ze(a), ROOF_ZR(a); sl = (zr - ze) * ROOF_P / W
    d = min(max(0.0, ze - wing_top_root(a)), sl * (1.27 - W) / 2); return d, sl, W


def roof_ze(a):
    """Низ ската у заборника: чуть ниже верха короба, скат входит в кромку заборника прямо, без «подушки» (Mark)."""
    z = ROOF_ZE(a); return z + (min(z, INL_ZT(a) - 0.006) - z) * smooth_(7.6, 7.0, a)


def roof_edge(a):
    e = root_env(a)
    if e <= 0: return roof_ze(a)
    d, sl, W = root_fill(a); return roof_ze(a) * (1 - e) + (wing_top_root(a) + d) * e


def root_rise(a, x, h):
    """Наплыв у корня (фото 17, 19, 20; Mark: «плавный переход в крылья»): верх крыла у борта поднят до низа ската корпуса и вогнутой дугой касательно уходит в крыло."""
    e = root_env(a)
    if e <= 0 or h <= 0: return 0.0
    d, sl, W = root_fill(a); d = d - 0.012 + max(0.0, wing_top_root(a) - (wy(W) + h)); rf = max(0.04, 2 * d / sl); t = (x - W) / rf
    return e * d * (1.0 if t <= 0 else (1 - t) ** 2 if t < 1 else 0.0)


def _wsec(sx, x):
    c = WTE(x) - WLE(x); us = SLC(x) / c if (in_(x, SLAT_I) or in_(x, SLAT_O)) else 0.0; ue = (HING(x) - WLE(x)) / c if (in_(x, FLAP_I) or in_(x, FLAP_O)) else 1.0
    return foil_ring(WLE(x), c, TC(x), us, ue, 64, lambda a, h: P3(a, sx * x, wy(x) + h + root_rise(a, x, h)))


def wing_s(sx):
    xs = {0.40, 0.70, 0.90, X_ROOT, 1.02, 1.06, 1.10, 1.14, 1.18, 1.20, 1.24, 1.28, 1.295, 1.30, 1.545, 1.55, 2.66, 2.665, 2.715, 2.72, 2.88, 2.885, X_DOG - 0.002, X_DOG + 0.002, 3.015, 3.02, 3.98, 3.985, 4.02, 4.025, X_TIP}
    for r in (FLAP_I, FLAP_O, SLAT_I, SLAT_O):
        for i in range(1, 6): xs.add(round(r[0] + (r[1] - r[0]) * i / 6, 4))
    return loft_obj('s_wing_' + ('r' if sx > 0 else 'l'), [_wsec(sx, x) for x in sorted(xs)], sharp=48)


def wing_part(name, spec, sx, note, rng):
    x0, x1 = spec[0] + 0.006, spec[1] - 0.006; HG = HING
    pv0 = P3(HG(x0) + GAP + 0.04, sx * x0, wy(x0)); pv1 = P3(HG(x1) + GAP + 0.04, sx * x1, wy(x1)); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    for i in range(9):
        x = x0 + (x1 - x0) * i / 8; c = WTE(x) - WLE(x); rings.append([v - pivot for v in foil_ring(WLE(x), c, TC(x), (HG(x) - WLE(x) + GAP) / c, 1.0, 9, lambda a, h: P3(a, sx * x, wy(x) + h), nose=0.11)])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot; PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=rng, note=note); return ob


def slat(name, spec, sx):
    xa, xb = spec[0] + 0.012, spec[1] - 0.012
    lo_ = lambda x_: wy(x_) - TC(x_) * (WTE(x_) - WLE(x_)) * thk(SLC(x_) / (WTE(x_) - WLE(x_))) - 0.003
    p0 = P3(WLE(xa) + SLC(xa) - GAP, sx * xa, lo_(xa)); p1 = P3(WLE(xb) + SLC(xb) - GAP, sx * xb, lo_(xb)); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized()
    if axis.x > 0: axis = -axis
    def sec(x):
        c = WTE(x) - WLE(x); return [v - pivot for v in foil_ring(WLE(x), c, TC(x), 0.0, (SLC(x) - GAP) / c, 12, lambda a, h: P3(a, sx * x, wy(x) + h))]
    ob = loft_obj(name, [sec(xa + (xb - xa) * i / 6) for i in range(7)], sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(0.0, 20.0), note='отклоняемый носок: ось по нижней кромке; плюс - носок вниз'); return ob


def tip_rail(sx):
    """Пусковой рельс на законцовке: всегда на крыле, ракету вешает игра (gripen_02, 05)."""
    x = X_TIP + 0.055; y = wy(X_TIP); b = B(); a0, a1 = 9.62, 12.55; hw, hh = 0.050, 0.060
    def sec(a, k):
        return [P3(a, sx * (x - hw * k), y - hh), P3(a, sx * (x + hw * k), y - hh), P3(a, sx * (x + hw * k), y + hh * 0.55), P3(a, sx * (x - hw * k), y + hh * 0.55)]
    b.loft([sec(a0, 0.25), sec(a0 + 0.18, 1.0), sec(a1 - 0.25, 1.0), sec(a1, 0.35)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    sec2 = lambda a: [P3(a, sx * (X_TIP - 0.05), y - 0.012), P3(a, sx * (x - 0.02), y - 0.03), P3(a, sx * (x - 0.02), y + 0.03), P3(a, sx * (X_TIP - 0.05), y + 0.012)]
    b.loft([sec2(10.50), sec2(11.80)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    PYLON_PTS['tip_' + ('r' if sx > 0 else 'l')] = P3(11.05, sx * x, y - hh)
    return b.finish('tip_rail_' + ('r' if sx > 0 else 'l'), sharp_deg=40)


# ── утки: цельноповоротные, на наружном плече заборника (gripen_02, 04, 05, 06) ──
CAN = dict(x0=1.050, y0=0.585, a_le=4.62, a_te=6.42, a_tle=6.20, a_tte=7.00, span=1.30, th0=0.075, th1=0.020); CAN_U = Vector((1.0, 0.0, 0.03)).normalized(); CAN_GAP = 0.010
CAN_AP = 5.62


def can_pt(a, s, h, sx):
    U = CAN_U; n = Vector((-U.z, 0, U.x)); p = Vector((CAN['x0'], 0, CAN['y0'])) + U * s + n * h; return P3(a, sx * p.x, p.z)


def canard(sx):
    name = 'canard_' + ('r' if sx > 0 else 'l'); T = CAN; s0 = CAN_GAP; rings = []
    for i in range(7):
        k = i / 6; s = s0 + (T['span'] - s0) * k; a0 = T['a_le'] + (T['a_tle'] - T['a_le']) * k; a1 = T['a_te'] + (T['a_tte'] - T['a_te']) * k; c = a1 - a0; th = T['th0'] + (T['th1'] - T['th0']) * k
        rings.append([can_pt(a0, s, 0, sx), can_pt(a0 + c * 0.12, s, th * 0.30, sx), can_pt(a0 + c * 0.35, s, th / 2, sx), can_pt(a0 + c * 0.65, s, th * 0.42, sx), can_pt(a0 + c * 0.88, s, th * 0.18, sx), can_pt(a1, s, 0, sx),
                      can_pt(a0 + c * 0.88, s, -th * 0.18, sx), can_pt(a0 + c * 0.65, s, -th * 0.42, sx), can_pt(a0 + c * 0.35, s, -th / 2, sx), can_pt(a0 + c * 0.12, s, -th * 0.30, sx)])
    pivot = can_pt(CAN_AP, 0, 0, sx); axis = (can_pt(CAN_AP, 1, 0, sx) - pivot).normalized(); b = B(); b.loft([[v - pivot for v in r] for r in rings], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); ob = b.finish(name, sharp_deg=22); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-30.0, 75.0), note='цельноповоротная утка, ось вдоль размаха у 40 % корневой хорды; плюс - передняя кромка вниз (на посадке почти поперёк потока)'); return ob


def canard_boss(sx):
    """Накладка у корня утки на стенке заборника: вытянута по корневой хорде, торец в плоскости корня; сверху не видно щели между уткой и стенкой."""
    T = CAN; c0 = (T['a_le'] + T['a_te']) / 2; ra = (T['a_te'] - T['a_le']) / 2 + 0.06; rz = 0.065; n = 32; b = B()
    rg = lambda s, k: [can_pt(c0 + k * ra * math.cos(2 * math.pi * q / n), s, k * rz * math.sin(2 * math.pi * q / n), sx) for q in range(n)]
    b.loft([rg(-0.06, 1.05), rg(-0.01, 1.0), rg(0.0, 0.97)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); return b.finish('s_cb_' + ('r' if sx > 0 else 'l'), sharp_deg=25)


# ── киль, руль, обтекатель на вершине (gripen_11, 12, 14) ──
FIN_Z0, FIN_Z1 = 0.99, 3.40
F_LE = Lin([(FIN_Z0, 10.40), (1.25, 10.50), (FIN_Z1, 12.78)]); F_TE = Lin([(FIN_Z0, 13.52), (FIN_Z1, 13.36)])     # задняя кромка киля раньше сопла (слова Mark)
RUD = (1.45, 2.70); RUD_C = Lin([(1.45, 0.46), (2.70, 0.40)])     # руль ниже обтекателя у вершины (gripen_11)
def ftc(y): return 0.055 - 0.022 * (y - FIN_Z0) / (FIN_Z1 - FIN_Z0)


def fin():
    ys = [FIN_Z0, 1.25, 1.40, 1.445, 1.45] + [1.45 + (2.70 - 1.45) * i / 6 for i in range(1, 7)] + [2.705, 2.85, 3.00, 3.20, 3.32, FIN_Z1]; rings = []
    for y in ys:
        c = F_TE(y) - F_LE(y); ue = 1 - RUD_C(y) / c if RUD[0] <= y <= RUD[1] else 1.0
        rings.append(foil_ring(F_LE(y), c, ftc(y), 0.0, ue, 16, lambda a, h: P3(a, h, y)))
    return loft_obj('fin', rings, sharp=48)


def rudder():
    y0, y1 = RUD; h0 = F_TE(y0) - RUD_C(y0) + GAP + 0.03; h1 = F_TE(y1) - RUD_C(y1) + GAP + 0.03; p0 = P3(h0, 0, y0); p1 = P3(h1, 0, y1); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized(); rings = []
    for i in range(9):
        y = y0 + 0.024 + (y1 - y0 - 0.048) * i / 8; c = F_TE(y) - F_LE(y); rings.append([v - pivot for v in foil_ring(F_LE(y), c, ftc(y), 1 - (RUD_C(y) - 0.022) / c, 1.0, 9, lambda a, h: P3(a, h, y), nose=0.14)])
    ob = loft_obj('rudder', rings, sharp=48); ob.location = pivot
    PARTS['rudder'] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-30.0, 30.0), note='ось по передней кромке руля, снизу вверх'); return ob


def fin_fair():
    """Форкиль от гаргрота, обтекатель антенн у вершины киля (длинный, выступает вперёд), малый обтекатель на передней кромке."""
    b = B(); n = 14
    def cig(prof, cy, kx=1.0, ky=1.0):
        b.loft([[P3(a, r * kx * math.cos(2 * math.pi * q / n), cy + r * ky * math.sin(2 * math.pi * q / n)) for q in range(n)] for a, r in prof], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    cig([(11.82, 0.010), (11.95, 0.050), (12.2, 0.078), (13.15, 0.080), (13.46, 0.055), (13.54, 0.015)], 2.86, 0.80, 1.0)            # обтекатель у вершины (gripen_11)
    cig([(11.86, 0.008), (11.95, 0.030), (12.25, 0.040), (12.45, 0.030), (12.55, 0.008)], 2.10, 0.9, 0.9)                            # малый на передней кромке
    rg = lambda a, w, h: [P3(a, -w, 1.18), P3(a, w, 1.18), P3(a, w * 0.6, 1.18 + h), P3(a, 0.0, 1.20 + h * 1.04), P3(a, -w * 0.6, 1.18 + h)]
    b.loft([rg(9.50, 0.006, 0.075), rg(9.9, 0.040, 0.10), rg(10.4, 0.055, 0.13), rg(10.9, 0.055, 0.22), rg(11.3, 0.050, 0.30)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)   # форкиль
    return b.finish('fin_fair', sharp_deg=30)


# ── фонарь: каплевидный, рама одним кольцом, петля сзади (gripen_02, 04, 05, 11) ──
CANOPY = [(2.38, 0.0, 0.170), (2.85, 1.120, 0.330), (3.25, 1.335, 0.395), (3.75, 1.475, 0.415), (4.25, 1.510, 0.415), (4.75, 1.470, 0.395), (5.15, 1.395, 0.340)]
CANOPY[0] = (2.38, top_y(2.38, 0.0) + 0.004, 0.170); CAN_T = tracks(CANOPY)
ARCH_A = 3.18; CAN_A1 = 5.15; CAN_H = (5.30, 1.30)
def SILL(a): return top_y(a, CAN_T[1](a))
def CK_HW(a): return CAN_T[1](a) - 0.022


def can_ring(a, inset=0.0, n=44):
    top, hw = CAN_T[0](a) - inset, CAN_T[1](a) - inset; y0 = SILL(a) + 0.002; out = []
    for k in range(n):
        c = math.cos(math.pi * k / (n - 1)); s = math.sin(math.pi * k / (n - 1)); out.append(P3(a, math.copysign(hw * abs(c) ** 0.70, c), y0 + (top - y0) * s ** 0.82))
    return out


def frame_arch(b, a, w, inset=0.008, h=0.020, n=44, drop=0.0):
    ri0 = can_ring(a - w, inset, n); ro0 = can_ring(a - w, -h, n); ro1 = can_ring(a + w, -h, n); ri1 = can_ring(a + w, inset, n)
    if drop: ri0 = [p - Vector((0, 0, drop)) for p in ri0]; ri1 = [p - Vector((0, 0, drop)) for p in ri1]
    strip(b, [ri0, ro0, ro1, ri1, ri0], G_SKIN)


def _rail(b, sg, a0, a1, d0=0.004, d1=0.020):
    st = stations(a0, a1, 0.12); rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
    b.loft([[rail(a, d0 - 0.018, -0.004), rail(a, d1, -0.004), rail(a, d1, 0.020), rail(a, d0 - 0.016, 0.042)] for a in st], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)


def canopy():
    a0 = ARCH_A; a1 = CAN_A1; st = stations(a0 + 0.004, a1, 0.12); pv = P3(CAN_H[0], 0.0, CAN_H[1])
    gb = B(); strip(gb, [can_ring(a) for a in st], G_GLASS); gl = gb.finish('canopy_glass', sharp_deg=60)
    for v in gl.data.vertices: v.co -= pv
    gl.location = pv
    b = B(); frame_arch(b, a0 + 0.034, 0.034, inset=-0.010, h=0.030)
    for sg in (1, -1): _rail(b, sg, a0 + 0.075, a1 - 0.05)
    strip(b, [can_ring(a1 - 0.05, 0.016), can_ring(a1 - 0.05, -0.006), can_ring(a1, -0.006), can_ring(a1, 0.016), can_ring(a1 - 0.05, 0.016)], G_SKIN)
    fr = b.finish('canopy', sharp_deg=45)
    for v in fr.data.vertices: v.co -= pv
    fr.location = pv; gl.parent = fr; gl.location = (0, 0, 0)
    PARTS['canopy'] = dict(pivot=pv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 40.0), note='петля сзади; плюс - передняя кромка вверх; canopy_glass - дочерний объект')
    return [fr, gl]


def windscreen():
    a1 = ARCH_A - 0.02; st = stations(2.40, a1, 0.08); bg = B(); strip(bg, [can_ring(a) for a in st], G_GLASS); gl = bg.finish('screen_glass', sharp_deg=60)
    b = B(); frame_arch(b, ARCH_A - 0.028, 0.026, inset=0.030, h=0.004, drop=0.012); frame_arch(b, 2.42, 0.030, inset=0.035, h=0.010, drop=0.06)
    for sg in (1, -1): _rail(b, sg, 2.42, a1)
    return [gl, b.finish('screen_frame', sharp_deg=45)]


def cock_cut():
    st = stations(3.10, CAN_A1 - 0.04, 0.07); rg = lambda a: [P3(a, -CK_HW(a), 0.20), P3(a, CK_HW(a), 0.20), P3(a, CK_HW(a), 1.9), P3(a, -CK_HW(a), 1.9)]
    return loft_obj('c_cock', [rg(a) for a in st], G_COCK, sharp=25)


# ── пилоны: два под крылом, два под брюхом, контейнер под правым заборником (нынешняя модель, gripen_03, 06) ──
PYLON_DEF = (('o', 2.92, 9.60, 11.30, -0.10), ('i', 1.95, 8.30, 10.30, -0.10)); CANT = 0.0
def pylon(sx, tag, x, a0, a1, y0):
    b = B(); name = f'pylon_{tag}_' + ('r' if sx > 0 else 'l'); yw = wy(x) - 0.02; hw = 0.052
    def sec(a, f=1.0): return [P3(a, sx * x - hw * f, y0), P3(a, sx * x + hw * f, y0), P3(a, sx * x + hw * f * 0.85, yw), P3(a, sx * x - hw * f * 0.85, yw)]
    st = [a0, a0 + 0.14, a0 + 0.40, a1 - 0.45, a1 - 0.14, a1]; fs = [0.10, 0.70, 1.0, 1.0, 0.65, 0.10]
    b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); PYLON_PTS[name] = P3((a0 + a1) / 2, sx * x, y0); PYLON_PTS[name + '_root'] = P3((a0 + a1) / 2, sx * x, yw)
    return b.finish(name, sharp_deg=40)


def belly_pylon(sx):
    """Точки под брюхом (центр игры): короткие пилоны у низа корпуса."""
    a0, a1, x, y0 = 7.80, 9.40, 0.45, -0.50; b = B(); hw = 0.050; yt = -0.30; name = 'pylon_c_' + ('r' if sx > 0 else 'l')
    sec = lambda a, f: [P3(a, sx * x - hw * f, y0), P3(a, sx * x + hw * f, y0), P3(a, sx * x + hw * f * 1.4, yt), P3(a, sx * x - hw * f * 1.4, yt)]
    st = [a0, a0 + 0.18, a1 - 0.18, a1]; fs = [0.15, 1.0, 1.0, 0.15]; b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); PYLON_PTS[name] = P3((a0 + a1) / 2, sx * x, y0); return b.finish(name, sharp_deg=40)


TANK = dict(a0=7.85, a1=12.55, r=0.330, z=-0.760)


def tank():
    """Подфюзеляжный бак на центральном пилоне (gripen_07, 14): оживальный нос, длинный цилиндр, конус сзади."""
    T = TANK; n = 32; b = B(); L_ = T['a1'] - T['a0']
    prof = [(0.0, 0.02), (0.04, 0.30), (0.10, 0.55), (0.18, 0.78), (0.27, 0.93), (0.36, 0.99), (0.42, 1.0), (0.70, 1.0), (0.80, 0.96), (0.90, 0.80), (0.97, 0.52), (1.0, 0.20)]
    b.loft([[P3(T['a0'] + L_ * t, T['r'] * k * math.cos(2 * math.pi * q / n), T['z'] + T['r'] * k * math.sin(2 * math.pi * q / n)) for q in range(n)] for t, k in prof], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    yt = T['z'] + T['r'] - 0.02; yb = -0.30; hw = 0.045
    sec = lambda a, f: [P3(a, -hw * f, yt), P3(a, hw * f, yt), P3(a, hw * f * 1.3, yb), P3(a, -hw * f * 1.3, yb)]
    st = [9.10, 9.30, 11.10, 11.40]; fs = [0.15, 1.0, 1.0, 0.15]; b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('tank', sharp_deg=30)


def pod_mount():
    """Пилон контейнера под правым заборником (gripen_03, 06)."""
    am, hl, x, y0 = 5.30, 0.55, 0.80, -0.40; yt = -0.18; b = B(); hw = 0.045
    sec = lambda a, f: [P3(a, x - hw * f, y0), P3(a, x + hw * f, y0), P3(a, x + hw * f * 1.4, yt), P3(a, x - hw * f * 1.4, yt)]
    st = [am - hl, am - hl + 0.14, am + hl - 0.14, am + hl]; fs = [0.2, 1.0, 1.0, 0.2]; b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); PYLON_PTS['pod'] = P3(am, x, y0); return b.finish('pylon_pod', sharp_deg=40)


# ── тормозные щитки на бортах хвоста (gripen_12) ──
SB = dict(a0=12.05, a1=12.90, z0=0.28, z1=0.66)     # на отвесном борту хвоста (gripen_12)


def side_hit(a, z, sx):
    h = BVH['t'].ray_cast(Vector((sx * 3.0, Yb(a), z)), Vector((-sx, 0, 0))); return h[0]


def side_hitn(a, z, sx):
    h = BVH['t'].ray_cast(Vector((sx * 3.0, Yb(a), z)), Vector((-sx, 0, 0)))
    if h[0] is None: return None, None
    n = h[1].normalized(); return h[0], (n if n.x * sx > 0 else -n)


def side_patch(name, sx, a0, a1, z0, z1, nu=16, nv=12, lift=0.0010, th=0.010):
    """Панель на борту по форме обшивки: точки - лучом сбоку, толщина - по нормали к обшивке (на скруглении борта кромка не отходит)."""
    b = B(); bm = b.bm; grid = []; nrm = []
    for j in range(nv + 1):
        row = []; nr = []
        for i in range(nu + 1):
            a = a0 + (a1 - a0) * i / nu; z = z0 + (z1 - z0) * j / nv; h, n = side_hitn(a, z, sx)
            if h is None: h, n = P3(a, sx * 0.8, z), Vector((sx, 0, 0))
            row.append(h + n * lift); nr.append(n)
        grid.append(row); nrm.append(nr)
    tv = [[bm.verts.new(p + nrm[j][i] * th * 0.6) for i, p in enumerate(r)] for j, r in enumerate(grid)]; lv = [[bm.verts.new(p - nrm[j][i] * th * 0.4) for i, p in enumerate(r)] for j, r in enumerate(grid)]
    for j in range(nv):
        for i in range(nu):
            f = bm.faces.new((tv[j][i], tv[j][i + 1], tv[j + 1][i + 1], tv[j + 1][i]) if sx > 0 else (tv[j][i], tv[j + 1][i], tv[j + 1][i + 1], tv[j][i + 1])); f.material_index = G_SKIN
            f = bm.faces.new((lv[j][i], lv[j + 1][i], lv[j + 1][i + 1], lv[j][i + 1]) if sx > 0 else (lv[j][i], lv[j][i + 1], lv[j + 1][i + 1], lv[j + 1][i])); f.material_index = G_SKIN
    ed = [[(tv[0][i], tv[0][i + 1], lv[0][i + 1], lv[0][i]) for i in range(nu)], [(tv[nv][i + 1], tv[nv][i], lv[nv][i], lv[nv][i + 1]) for i in range(nu)],
          [(tv[j + 1][0], tv[j][0], lv[j][0], lv[j + 1][0]) for j in range(nv)], [(tv[j][nu], tv[j + 1][nu], lv[j + 1][nu], lv[j][nu]) for j in range(nv)]]
    for quads in ed:
        for q in quads:
            f = bm.faces.new(q if sx > 0 else q[::-1]); f.material_index = G_SKIN
    return b.finish(name, sharp_deg=30)


def sb_cut(sx):
    S = SB; d = 0.06
    rg = lambda a: [P3(a, sx * 0.30, S['z0'] - 0.008), P3(a, sx * 1.6, S['z0'] - 0.008), P3(a, sx * 1.6, S['z1'] + 0.008), P3(a, sx * 0.30, S['z1'] + 0.008)]
    ob = loft_obj('c_sb', [rg(S['a0'] - 0.008), rg(S['a1'] + 0.008)], G_DARK, sharp=20)
    # срез только неглубоко: вырез на 6 см внутрь от обшивки
    return ob


def speedbrakes():
    out = []; S = SB
    for sx, n in ((1, 'r'), (-1, 'l')):
        ob = side_patch('airbrake_' + n, sx, S['a0'] + 0.006, S['a1'] - 0.006, S['z0'] + 0.006, S['z1'] - 0.006)
        p0 = side_hit(S['a0'] + 0.01, S['z0'] + 0.02, sx); p1 = side_hit(S['a0'] + 0.01, S['z1'] - 0.02, sx)
        p0 = p0 if p0 is not None else P3(S['a0'], sx * 0.8, S['z0']); p1 = p1 if p1 is not None else P3(S['a0'], sx * 0.8, S['z1'])
        pv = (p0 + p1) / 2; axis = (p1 - p0).normalized()
        test = Matrix.Rotation(math.radians(20), 3, axis) @ (P3(S['a1'], sx * 0.8, (S['z0'] + S['z1']) / 2) - pv)
        if test.x * sx < (P3(S['a1'], sx * 0.8, 0) - pv).x * sx: axis = -axis
        _rel(ob, pv); PARTS['airbrake_' + n] = dict(pivot=pv.copy(), axis=axis, range=(0.0, 50.0), note='тормозной щиток на борту у сопла: петля спереди, плюс - задняя кромка наружу'); out.append(ob)
    return out


# ── ПВД, пушка ──
def pitot():
    b = B(); n = 10; pts = [(-0.74, 0.004), (-0.70, 0.009), (-0.60, 0.011), (-0.34, 0.013), (-0.30, 0.020), (-0.05, 0.026), (0.02, 0.030)]
    b.loft([[P3(a, r * math.cos(2 * math.pi * q / n), 0.0 + r * math.sin(2 * math.pi * q / n)) for q in range(n)] for a, r in pts], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('pitot', sharp_deg=40)


GUN = dict(a0=6.30, a1=8.20, x=-0.585, z=-0.300)


def gun_fair():
    """Обтекатель пушки под левым бортом: капля по низу корпуса, срез ствола спереди (gripen_11)."""
    G_ = GUN; b = B(); n = 18
    prof = [(G_['a0'], 0.02, 0.02), (G_['a0'] + 0.25, 0.10, 0.085), (G_['a0'] + 0.70, 0.13, 0.11), (G_['a1'] - 0.55, 0.13, 0.11), (G_['a1'] - 0.15, 0.07, 0.06), (G_['a1'], 0.012, 0.012)]
    b.loft([[P3(a, G_['x'] + rx * math.cos(2 * math.pi * q / n), G_['z'] + rz * math.sin(2 * math.pi * q / n)) for q in range(n)] for a, rx, rz in prof], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('s_gun', sharp_deg=30)


def gun_cut():
    G_ = GUN; n = 14; r = 0.035; c = (G_['x'] - 0.01, G_['z'] - 0.02)
    rg = lambda a: [P3(a, c[0] + r * math.cos(2 * math.pi * q / n), c[1] + r * math.sin(2 * math.pi * q / n)) for q in range(n)]
    return loft_obj('c_gun', [rg(G_['a0'] - 0.3), rg(G_['a0'] + 0.45)], G_DARK, sharp=30)


# ── шасси: размеры (gripen_06, 07, 09) ──
GROUND_Y = -1.62                     # gripen_07: земля на 1,62 м ниже острия обтекателя
NG = dict(a=4.03, hinge=(4.28, -0.24), rw=0.210, ww=0.130, track=0.130)
MG_A, MG_X = 8.45, 1.12; MAIN_T = (8.25, 0.86, -0.18)
NDOOR = dict(a0=3.62, a1=5.05, hw=0.175); MDOOR = dict(a0=6.95, a1=8.55, x0=0.56, x1=0.90)

def doors():
    out = []; D = NDOOR
    for sx in (1, -1):
        n_ = 'door_n_' + ('r' if sx > 0 else 'l'); ob = patch(n_, lambda u, v: (D['a0'] + (D['a1'] - D['a0']) * v, sx * (0.004 + (D['hw'] - 0.004) * u)), 4, 12, dirn=1, lift=0.002, th=0.012, z0=-4.0)
        pv = P3((D['a0'] + D['a1']) / 2, sx * D['hw'], down(sx * D['hw'], Yb((D['a0'] + D['a1']) / 2), z0=-4.0, dirn=1).z - 0.002); _rel(ob, pv)
        PARTS[n_] = dict(pivot=pv.copy(), axis=Vector((0, -sx, 0)), range=(0.0, 88.0), note='створка передней стойки: шарнир у края, плюс - внутренняя кромка вниз'); out.append(ob)
    D = MDOOR
    for sx in (1, -1):
        n_ = 'door_m_' + ('r' if sx > 0 else 'l'); ob = patch(n_, lambda u, v: (D['a0'] + (D['a1'] - D['a0']) * v, sx * (D['x0'] + (D['x1'] - D['x0']) * u)), 6, 10, dirn=1, lift=0.002, th=0.014, z0=-4.0)
        pv = P3((D['a0'] + D['a1']) / 2, sx * D['x1'], down(sx * D['x1'], Yb((D['a0'] + D['a1']) / 2), z0=-4.0, dirn=1).z - 0.002); _rel(ob, pv)
        PARTS[n_] = dict(pivot=pv.copy(), axis=Vector((0, sx, 0)) * -1, range=(0.0, 95.0), note='створка основной стойки: шарнир у наружной кромки, плюс - внутренняя кромка вниз'); out.append(ob)
    return out


def gear_bays(host):
    D = NDOOR; rg = lambda a: [P3(a, -D['hw'] - 0.004, -1.4), P3(a, D['hw'] + 0.004, -1.4), P3(a, D['hw'] + 0.004, 0.10), P3(a, -D['hw'] - 0.004, 0.10)]
    c = loft_obj('c_bay', [rg(D['a0'] - 0.005), rg(D['a1'] + 0.005)], G_DARK, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    D = MDOOR
    for sx in (1, -1):
        rg = lambda a: [P3(a, sx * (D['x0'] - 0.004), -1.4), P3(a, sx * (D['x1'] + 0.004), -1.4), P3(a, sx * (D['x1'] + 0.004), 0.05), P3(a, sx * (D['x0'] - 0.004), 0.05)]
        c = loft_obj('c_bay', [rg(D['a0'] - 0.005), rg(D['a1'] + 0.005)], G_DARK, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)


def _tag(o, v):
    """Метка тела на гранях: после объединений видно, где стык двух тел (там тень должна ломаться резко, а не зубцами)."""
    a_ = o.data.attributes.get('src') or o.data.attributes.new('src', 'INT', 'FACE'); a_.data.foreach_set('value', [v] * len(o.data.polygons)); return o


def seam_sharp(me, deg=5.0):
    """Рёбра между гранями разных тел (купол корпуса и короб заборника, крыло и борт) - резкие, если излом больше deg."""
    a_ = me.attributes.get('src')
    if a_ is None: return 0
    src = [0] * len(me.polygons); a_.data.foreach_get('value', src)
    bm = bmesh.new(); bm.from_mesh(me); lim = math.radians(deg); k = 0
    for e in bm.edges:
        if len(e.link_faces) == 2:
            f0, f1 = e.link_faces
            if src[f0.index] != src[f1.index] and src[f0.index] and src[f1.index] and e.calc_face_angle(0.0) > lim: e.smooth = False; k += 1
    bm.to_mesh(me); bm.free(); return k


def fillet_seam(host, pairs=((1, 9),), band=0.16, iters=14, sharp_deg=50.0):
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
        if d < band: W[v] = (1 - d / band) ** 2 * smooth_(11.92, 11.6, L / 2 - v.co.y)     # у задней кромки крыла линия стыка обрывается: там не сглаживать
    for _ in range(iters):
        new = {}
        for v, w in W.items():
            nb = [e.other_vert(v).co for e in v.link_edges]
            if nb: new[v] = v.co + (sum(nb, Vector()) / len(nb) - v.co) * 0.5 * w
        for v, c in new.items(): v.co = c
    bm.to_mesh(me); bm.free(); return len(W)


def smooth_zone(host, a0, a1, x0, x1, z0, iters=12, sharp_deg=45.0):
    """Сглаживание участка обшивки (излом у основания горба за фонарём): вершины в рамке по a, |x|, z, вес спадает к краям рамки; острые кромки не трогаются."""
    bm = bmesh.new(); bm.from_mesh(host.data); lim = math.radians(sharp_deg); sharp = set()
    for e in bm.edges:
        if len(e.link_faces) != 2 or e.calc_face_angle(0.0) > lim: sharp.update(v.index for v in e.verts)
    W = {}
    for v in bm.verts:
        if v.index in sharp: continue
        a = L / 2 - v.co.y; ax_ = abs(v.co.x)
        w = smooth_(a0, a0 + 0.15, a) * smooth_(a1, a1 - 0.15, a) * smooth_(x0, x0 + 0.08, ax_) * smooth_(x1, x1 - 0.08, ax_) * smooth_(z0, z0 + 0.06, v.co.z)
        if w > 0: W[v] = w
    for _ in range(iters):
        new = {v: v.co + (sum((e.other_vert(v).co for e in v.link_edges), Vector()) / len(v.link_edges) - v.co) * 0.5 * w for v, w in W.items() if v.link_edges}
        for v, c in new.items(): v.co = c
    bm.to_mesh(host.data); bm.free(); return len(W)


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
    import os as _o
    _F = (inlet_box,) if _o.environ.get('GR_NOSH') else (inlet_box, shoulder)
    S = [_tag(hull(), 1), _tag(fin(), 2), _tag(fin_fair(), 3), _tag(gun_fair(), 4)] + [_tag(f(sx), 5 + i) for sx in (1, -1) for i, f in enumerate(_F)]
    WING = [_tag(o_, 9) for o_ in (wing_s(1), wing_s(-1))] + [_tag(o_, 10) for o_ in (tip_rail(1), tip_rail(-1))] + [_tag(o_, 11) for o_ in (canard_boss(1), canard_boss(-1))]
    host = S[0]
    for o in S[4:]:
        c = lip_cut(1 if o.name.endswith('_r') else -1); _apply_bool(o, c, 'DIFFERENCE'); _drop(c)
    for o in S[1:] + WING:
        _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        c = duct_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    for sx in (1, -1):
        for f in (diverter, splitter_plate):
            o = _tag(f(sx), 12); _apply_bool(host, o, 'UNION'); _drop(o)
    print('скруглено вершин у стыка корпуса и крыла:', fillet_seam(host))
    print('сглажено вершин за фонарём:', smooth_zone(host, 4.92, 6.60, 0.18, 0.95, 0.80, iters=16))
    c = bore_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = cock_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = gun_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'GR_skin'; host.data.name = 'GR_skin'; bvh_ready(host); return host


def plane(stage=9, carve=True):
    """Этапы: 1 - обшивка; 2 - рули, сопло, утки; 3 - кабина, фонарь, пилоны, щитки, детали; 4 - шасси и створки."""
    import gripen_detail as d, types
    PARTS.clear(); PYLON_PTS.clear()
    skin = build_skin(); out = [skin]; ref_me = skin.data.copy(); d.resharp(types.SimpleNamespace(data=ref_me), deg=float(os.environ.get("GR_REFSHARP", "38"))); print('резких стыков тел:', seam_sharp(ref_me, float(os.environ.get('GR_SEAMDEG', '180'))))     # пологие стыки тел (купол и короб заборника) - резкие: без зубцов в тени
    if stage >= 2:
        out += [rudder(), canard(1), canard(-1), nozzle(), d.burner()]
        for sx, n in ((1, 'r'), (-1, 'l')):
            out += [wing_part('elevon_i_' + n, FLAP_I, sx, 'внутренний элевон, ось по передней кромке; плюс - вниз', (-30.0, 30.0)), wing_part('elevon_o_' + n, FLAP_O, sx, 'наружный элевон, ось по передней кромке; плюс - вниз', (-30.0, 30.0)),
                    slat('lef_i_' + n, SLAT_I, sx), slat('lef_o_' + n, SLAT_O, sx)]
    if stage >= 3:
        out += [d.cockpit_detail()] + canopy() + windscreen() + [pitot()]
        out += speedbrakes()
        for sx in (1, -1):
            for tag, x, a0, a1, y0 in PYLON_DEF: out.append(pylon(sx, tag, x, a0, a1, y0))
            out.append(belly_pylon(sx))
        out.append(pod_mount())
        out += [d.details(), d.seals()] + d.hardpoints() + [d.plates()]
    if stage >= 4:
        out += doors()
        import gripen_gear as gr; out += gr.gear_nose() + gr.gear_main(1) + gr.gear_main(-1)
    if carve and stage >= 3: print('канавок и выемок:', d.carve(skin))
    if stage >= 4: gear_bays(skin)
    d.resharp(skin)
    if os.environ.get('GR_SMOOTH'): print('нормали обшивки:', d.smooth_normals(skin, ref_me))
    elif not os.environ.get('GR_NOBLUR'): print('мягкие нормали обшивки:', blur_normals(skin, float(os.environ.get('GR_BLUR', '0.06'))))
    bpy.data.meshes.remove(ref_me)
    return out
