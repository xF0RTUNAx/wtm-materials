# rafale_geo.py - геометрия Rafale C (одноместный) для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z.
# a - расстояние от острия носа, y - высота над остриём носа. План с rafale_10 (длина 15,27 и размах как у нынешней модели в игре), высоты с rafale_01 (почти прямо спереди), бок с 07, 08.
import math
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 15.27
import os as _os
REF_GLB = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '_образец', 'cloudhub_rafale_ccby.glb'); A_CUT = 7.60     # перед корпуса из модели CloudHub (CC BY 4.0)
REF_K = 15.27 / 15.189; REF_YC = 5.577; REF_TZ = 8.339


def _sm(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)
G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK = 0, 1, 2, 3, 4, 5
PARTS = {}
PYLON_PTS = {}
EXTRA = []
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
    bm_ = bmesh.new(); bm_.from_mesh(cutter.data); bm_.normal_update()
    if bm_.calc_volume(signed=True) < 0: cutter.data.flip_normals(); cutter.data.update()      # вывернутое тело: вырез оставлял крышки (сужение заборника)
    bm_.free()
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


def bore_cut(sx):
    a1 = NAC_A1; cx = sx * NOZ_X; n = 56
    ring = lambda a, r: [P3(a, cx + r * math.sin(2 * math.pi * k / n), NOZ_Y - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    prof = [(a1 + 0.25, 0.400, G_METAL), (a1 - 0.18, 0.400, G_METAL), (a1 - 0.22, 0.375, G_METAL), (a1 - 0.30, 0.375, G_METAL), (a1 - 0.34, 0.400, G_METAL), (a1 - 0.80, 0.405, G_COCK), (a1 - 1.10, 0.405, G_DARK), (a1 - 1.50, 0.260, G_DARK), (a1 - 1.62, 0.040, G_DARK)]
    F = NOZ_R0 / 0.425; b = B(); b.loft([ring(a, r * F) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK)
    return b.finish('c_bore', sharp_deg=30)


def nozzle(sx):
    b = B(); cx = sx * NOZ_X; N = 14; a0 = NAC_A1 + 0.002; a1 = NOZ_A; aM = a0 + 0.120; aP = a0 + 0.125
    def ptp(a, r, ang): return P3(a, cx + r * math.sin(ang), NOZ_Y - r * math.cos(ang))
    ring = lambda a, r, nn=56: [ptp(a, r, 2 * math.pi * k / nn) for k in range(nn)]
    def box_sect(a, r, ang, hw_ang, th): return [ptp(a, r, ang - hw_ang), ptp(a, r, ang + hw_ang), ptp(a, r + th, ang + hw_ang), ptp(a, r + th, ang - hw_ang)]
    R0 = NOZ_R0; F = NOZ_R0 / 0.425
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
        b.loft([box_sect(a1 - 0.002, NOZ_R - th - 0.003, am, hwi, -0.006), box_sect(a1 - 0.50, 0.330 * F, am, hwi, -0.006), box_sect(a0 + 0.03, 0.398 * F, am, hwi, -0.006)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('nozzle_' + ('r' if sx > 0 else 'l'), sharp_deg=30)



# ── корпус: одно тело от носа до сопел; горб за фонарём отдельным телом, сглаженным максимумом не нужен ──
HULL = [  # a, верх (плечи), низ, полуширина, nверх, nниз
    (0.00, 0.018, -0.018, 0.008, 2.0, 2.0), (0.40, 0.140, -0.120, 0.125, 2.0, 2.0), (1.20, 0.330, -0.270, 0.330, 2.0, 2.0), (2.05, 0.490, -0.390, 0.480, 2.1, 2.1),
    (2.90, 0.640, -0.500, 0.630, 2.2, 2.3), (3.70, 0.660, -0.600, 0.770, 2.4, 2.5), (4.40, 0.640, -0.700, 0.860, 2.5, 2.7), (5.20, 0.620, -0.780, 0.900, 2.6, 2.9),
    (6.20, 0.600, -0.820, 0.900, 2.7, 3.0), (7.40, 0.560, -0.840, 0.900, 2.8, 3.2), (8.60, 0.500, -0.840, 0.930, 2.9, 3.4), (9.70, 0.450, -0.830, 0.990, 3.0, 3.4),
    (11.00, 0.420, -0.800, 0.980, 3.0, 3.2), (12.30, 0.400, -0.760, 1.060, 3.0, 3.0), (13.40, 0.380, -0.700, 1.220, 2.9, 2.8), (14.10, 0.340, -0.640, 1.150, 2.7, 2.6)]
HT = tracks(HULL)
SP_TOP = Lin([(0.0, 0.0), (20.0, 0.0)])
SP_HW = Lin([(0.0, 0.3), (20.0, 0.3)])


def _smax(a_, b_, k=0.14):
    h = max(0.0, min(1.0, 0.5 + 0.5 * (a_ - b_) / k)); return b_ + (a_ - b_) * h + k * h * (1 - h)


LOW_K = Track([(2.6, 0.0), (4.2, 0.40), (8.6, 0.40), (10.6, 0.20), (12.4, 0.0), (15.0, 0.0)])     # низ фюзеляжа уже плеч: сверху широко, к брюху сужается (rafale_01)


def hull_ring(a, n=96):
    top, bot, hw, nt, nb = [t(a) for t in HT]; k = LOW_K(a); pts = sup(a, 0.0, top, bot, hw, nt, nb, n)
    return [Vector((p.x * (1 - k * max(0.0, min(1.0, (top - 0.10 - p.z) / (top - bot - 0.10))) ** 1.3), p.y, p.z)) for p in pts]


# сечения корпуса по модели CloudHub «Dassault Rafale» (CC BY 4.0): a, верх (без горба), низ, полуширина вверху, высота самой широкой части, полуширина внизу
HULL2 = [(0.00, 0.012, -0.012, 0.010, 0.000, 0.010), (0.25, 0.10, -0.04, 0.070, 0.03, 0.062), (0.75, 0.29, -0.11, 0.170, 0.09, 0.168), (1.25, 0.47, -0.16, 0.280, 0.16, 0.272),
         (2.00, 0.70, -0.23, 0.440, 0.25, 0.380), (2.75, 0.80, -0.25, 0.580, 0.40, 0.385), (3.50, 0.84, -0.27, 0.750, 0.55, 0.385), (4.25, 0.87, -0.30, 0.960, 0.60, 0.390),
         (5.00, 0.88, -0.32, 1.200, 0.62, 0.400), (5.60, 0.88, -0.34, 1.260, 0.62, 0.450), (6.50, 0.895, -0.36, 1.280, 0.60, 0.500), (8.00, 0.875, -0.36, 1.270, 0.60, 0.550),
         (9.50, 0.85, -0.33, 1.240, 0.60, 0.620), (11.0, 0.86, -0.27, 1.250, 0.62, 0.660), (12.3, 0.88, -0.20, 1.200, 0.60, 0.720), (13.0, 0.88, -0.14, 1.160, 0.55, 0.820), (13.67, 0.87, -0.10, 1.100, 0.45, 0.860)]
H2 = tracks(HULL2)
ENV_END = 13.67


def hull_ring(a, n=96):
    """Кольцо корпуса: сверху широкие плечи, к низу уже (как у образца)."""
    top, bot, hwh, zh, hwl = [t(a) for t in H2]; zh = min(max(zh, bot + 0.02), top - 0.02); out = []
    s = 1.0 - (HULL_NARROW * (1 - _sm((a - (A_CUT - 1.9)) / 0.9)) * _sm((a - 3.6) / 1.0) if HULL_NARROW else 0.0); hwh *= s; s = 1.0;     # под заборниками образца корпус уже: щель открыта zc = (top + bot) / 2; top, bot = zc + (top - zc) * s, zc + (bot - zc) * s; hwh *= s; hwl *= s     # спереди под обшивкой образца
    for k_ in range(n):
        th = -math.pi / 2 + 2 * math.pi * k_ / n; c, s = math.cos(th), math.sin(th)
        if s >= 0: z = zh + (top - zh) * abs(s) ** (2 / 2.4) * (1 if s >= 0 else -1); w = hwh * abs(c) ** (2 / 2.6)
        else:
            z = zh - (zh - bot) * abs(s) ** (2 / 2.2); f = (zh - z) / max(zh - bot, 1e-6); hw_ = hwh + (hwl - hwh) * (f * f * (3 - 2 * f)); w = hw_ * abs(c) ** (2 / 2.2)
        out.append(P3(a, math.copysign(w, c), z))
    return out


HULL_NARROW = 0.0
def hull():
    global HULL_NARROW
    st = stations(0.0, 2.0, 0.125)[:-1] + stations(2.0, ENV_END, 0.18)
    HULL_NARROW = 0.16; ob = loft_obj('s_hull', [hull_ring(a) for a in st], G_SKIN, sharp=38); HULL_NARROW = 0.0     # только для сетки корпуса: порог фонаря не меняется
    return ob


def top_y(a, x):
    """Высота верха корпуса над |x| (для порога фонаря)."""
    R = hull_ring(a, 96); up = [(abs(q.x), q.z) for q in R[24:49]]; x = abs(x)
    for (x0, y0), (x1, y1) in zip(up, up[1:]):
        if x1 <= x <= x0: t = (x - x0) / (x1 - x0) if x1 != x0 else 0; return y0 + (y1 - y0) * t
    return up[0][1] if x > up[0][0] else up[-1][1]


def skin_top(a, x): return top_y(a, x)


# ── гондолы двигателей, сопла рядом ──
NAC_A1 = 13.67; NOZ_X = 0.635; NOZ_Y = 0.380; NOZ_A = 14.21; NOZ_R = 0.390; NOZ_R0 = 0.500     # по модели CloudHub
NAC = [(12.4, 0.86, -0.08, 0.50, 2.2), (13.0, 0.89, -0.12, 0.52, 2.1), (13.67, 0.885, -0.125, 0.51, 2.0)]; NT = tracks(NAC)


def nacelle(sx):
    n = 64
    def ring(a):
        top, bot, hw, e = [t(a) for t in NT]; return sup(a, sx * NOZ_X, top, bot, hw, e, e, n)
    rs = [ring(a) for a in stations(12.4, NAC_A1, 0.20)]; a1 = NAC_A1; rb = NOZ_R0 * 0.405 / 0.425
    rs.append([P3(a1 + 0.012, sx * NOZ_X + rb * math.sin(2 * math.pi * k / n), NOZ_Y - rb * math.cos(2 * math.pi * k / n)) for k in range(n)])
    return loft_obj('s_nac_' + ('r' if sx > 0 else 'l'), rs, G_SKIN, sharp=40)


def spine():
    """Горб за фонарём: высокий у фонаря, к килю ниже и уже (rafale_07, 08)."""
    Z = Track([(6.176, 1.285), (6.50, 1.245), (7.00, 1.19), (8.00, 1.10), (9.0, 1.065), (11.0, 1.07), (13.5, 1.08), (14.3, 1.05)])     # по модели CloudHub
    W_ = Track([(6.176, 0.320), (6.60, 0.44), (8.0, 0.44), (10.0, 0.42), (12.0, 0.36), (13.9, 0.30), (14.3, 0.26)])     # ширина как у образца: шире - бок встаёт ступенькой (слова Mark)
    H_ = Track([(6.20, 0.40), (6.5, 0.40), (9.0, 0.26), (12.0, 0.24), (14.3, 0.22)])
    return loft_obj('s_spine', [sup(a, 0.0, Z(a), Z(a) - 2 * H_(a), W_(a), 2.6, 2.3, 48) for a in stations(6.176, 14.30, 0.24)], G_SKIN, sharp=40)     # начало вровень с концом фонаря (слова Mark: зазор сзади кабины)


def tail_cone():
    """Утолщение у основания киля сзади, над соплами (rafale_03, 07, 10)."""
    prof = [(12.80, 0.06), (13.3, 0.17), (14.0, 0.20), (14.8, 0.17), (15.18, 0.11), (15.27, 0.02)]; n = 20
    return loft_obj('s_cone', [[P3(a, r * 1.05 * math.cos(2 * math.pi * q / n), 1.00 + r * math.sin(2 * math.pi * q / n)) for q in range(n)] for a, r in prof])


def keel():
    """Перемычка между соплами снизу."""
    T = tracks([(12.6, 0.10, -0.66, 0.14), (13.8, 0.10, -0.66, 0.12), (14.30, 0.05, -0.60, 0.08), (14.55, -0.05, -0.40, 0.03)])
    return loft_obj('s_keel', [sup(a, 0.0, T[0](a), T[1](a), T[2](a), 2.6, 2.6, 24) for a in stations(12.6, 14.55, 0.25)])


# ── воздухозаборники: по бокам под утками, плоская стенка к фюзеляжу, полукруг наружу, косой срез (rafale_01, 02) ──
INL_A0, INL_A1 = 5.05, 11.2
INL_XI = 0.560
INL_XO = Track([(5.30, 1.450), (6.20, 1.450), (7.6, 1.380), (9.0, 1.260), (10.3, 1.040), (11.2, 0.900)])
INL_YT = Track([(5.30, 0.090), (6.20, 0.080), (7.6, 0.020), (9.0, -0.060), (10.3, -0.160), (11.2, -0.220)])
INL_YB = Track([(5.30, -0.740), (6.20, -0.750), (7.6, -0.760), (9.0, -0.760), (10.3, -0.740), (11.2, -0.720)])
LIP = lambda y, x=1.0: LIP_A     # срез заборника почти вертикальный (модель CloudHub)
DUCT_END = 8.20


INL_YTO = Track([(5.30, -0.160), (6.20, -0.170), (7.6, -0.190), (9.0, -0.230), (10.3, -0.270), (11.2, -0.300)])     # верх снаружи
INL_XI = 0.560


# проём заборника по кромке модели CloudHub (CC BY 4.0): правая сторона, (x, y) от острия носа, срез на a = LIP_A
INL_POLY = [(0.40, 0.05), (0.377, -0.063), (0.42, -0.167), (0.446, -0.304), (0.568, -0.352), (0.688, -0.368), (0.80, -0.359), (0.902, -0.331), (0.997, -0.290), (1.098, -0.234), (1.165, -0.161), (1.236, -0.067), (1.286, 0.05),
            (1.306, 0.186), (1.25, 0.31), (1.16, 0.41), (1.04, 0.46), (0.885, 0.368), (0.75, 0.238), (0.71, 0.20), (0.665, 0.18), (0.627, 0.15), (0.58, 0.11)]
INL_TOP = (13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 0, 1)     # верхняя кромка от наружного угла к фюзеляжу: вдоль неё щель
LIP_A = 5.15; INL_SQ = 0.85; INL_ZB = -0.368     # заборники приплюснуты по высоте на 10% к нижней кромке (слова Mark: заборник ниже - щель явнее)
INL_SX = 0.75; INL_XI0 = 0.38     # и уже на 25% к внутренней стенке (слова Mark: «большие рты»)
HEX_C = (INL_XI0 + (1.27 - INL_XI0) * INL_SX, INL_ZB + (-0.22 - INL_ZB) * INL_SQ)
def _nx(x): return INL_XI0 + (x - INL_XI0) * INL_SX
def _unx(x): return INL_XI0 + (x - INL_XI0) / INL_SX
def _sq(y): return INL_ZB + (y - INL_ZB) * INL_SQ
def _usq(y): return INL_ZB + (y - INL_ZB) / INL_SQ
_ICX = sum(p[0] for p in INL_POLY) / len(INL_POLY); _ICY = sum(p[1] for p in INL_POLY) / len(INL_POLY)


def inl_pts(a, inset=0.0, sx=1, xi=None, sq=True, nx=True):
    """Проём: контур образца; inset > 0 - внутрь, < 0 - наружу; к хвосту канал сужается. Возвращает (точки, радиусы)."""
    k = 1.0 - 0.40 * _sm((a - 5.6) / (DUCT_END - 5.6)); out = []
    for x, y in INL_POLY:
        dx, dy = x - _ICX, y - _ICY; d = math.hypot(dx, dy); f = max(0.05, (d * k - inset) / d) if d > 1e-6 else 1.0
        out.append((sx * (_nx(_ICX + dx * f) if nx else _ICX + dx * f), _sq(_ICY + dy * f) if sq else _ICY + dy * f))
    return out, [0.004] * len(out)


def box_pts(a):
    """Обечайка заборника: контур проёма наружу на толщину кромки; за 8 м сходит в корпус."""
    f = _sm((a - 8.0) / 2.6); pts, _ = inl_pts(min(a, 5.6), -0.060, 1)     # наружная стенка как у образца: на 6 см шире проёма
    up = 0.0      # верх за планкой не поднимается: там щель до борта (gap_wall / gap_cut)
    sw = lambda x, y: _sm(((x - 0.40) * -0.539 + (y - 0.05) * 0.842 + 0.10) / 0.10)     # плавно: у косой планки полностью, ниже - нет
    pts = [(x + (-0.539) * up * sw(x, y), y + 0.842 * up * sw(x, y)) for x, y in pts]
    return [(x * (1 - 0.32 * f), y + 0.25 * f * (y - _ICY) * -1) for x, y in pts]


def inlet_box(sx, a0=LIP_A):
    st = stations(a0, 10.6, 0.25); rs = [[(sx * x, y) for x, y in box_pts(a)] for a in st]
    return loft_obj('s_inl_' + ('r' if sx > 0 else 'l'), [poly_ring(a, r, 96, 0.004) for a, r in zip(st, rs)], sharp=46)


def _ip(a, inset, sx, xi):
    pts, r = inl_pts(max(a, 5.30), inset, sx, xi); return pts, r


def hood(sx):
    """Корпус над заборником: плечо плавно загибается вниз и обтекает верх проёма (rafale_01, слова Mark). Верх - выпуклая кривая от плеча к наружному углу, низ - верх обечайки."""
    rings = []
    for a in stations(5.02, 10.2, 0.20):
        pts, _ = inl_pts(max(a, 5.30), -0.022, 1, INL_XI); P = [Vector(q) for q in pts]
        Po = P[16]; top = P[16:] + [P[0]]; f = _sm((a - 5.05) / 1.6); S1 = Vector((0.46, top_y(a, 0.46) - 0.02)); S0 = Vector((0.46, max(q.y for q in top) + 0.01))
        S = S0.lerp(S1, f); C = (Po + S0) / 2 + Vector((0, 0.02)); C = C.lerp(Vector((Po.x + 0.02, S1.y - 0.34)), f)     # спереди капот сходит на нет, дальше назад растёт до плеча
        curve = [S * (1 - t) ** 2 + C * 2 * t * (1 - t) + Po * t * t for t in (k / 14 for k in range(15))]
        ring2 = curve + [Po + Vector((0.004, -0.004))] + [q + Vector((0, -0.006)) for q in top[1:]] + [Vector((0.46, P[0].y - 0.006))]
        rings.append([P3(a, sx * q.x, q.y) for q in ring2])
    return loft_obj('s_hood_' + ('r' if sx > 0 else 'l'), rings, G_SKIN, sharp=50)


def slot_cut(sx):
    """Щель между верхней кромкой заборника и корпусом (rafale_01, слова Mark): полоса снаружи верхней кромки, сходит на нет к хвосту."""
    rings = []
    for da, wk in ((-0.30, 1.0), (0.10, 1.0), (0.40, 0.75), (0.65, 0.35), (0.85, 0.0)):
        a = LIP_A + da; A_, _ = inl_pts(min(a, 5.6), -0.028, 1); B_, _ = inl_pts(min(a, 5.6), -0.028 - 0.10 * max(wk, 0.03), 1)
        ring = [Vector(A_[i]) for i in INL_TOP] + [Vector(B_[i]) for i in reversed(INL_TOP)]
        rings.append([P3(a, sx * q.x, q.y) for q in ring])
    return loft_obj('c_slot', rings, G_COCK, sharp=25)


def lip_cut(sx, da=0.0):
    """Косой срез: всё, что впереди кромки, убирается."""
    rs = [[P3(LIP(y_, x) - da + d, sx * x, y_) for d, y_ in ((0.0, 0.40), (0.0, -1.10), (-1.6, -1.10), (-1.6, 0.40))] for x in (0.40, 1.45, 2.30)]
    return loft_obj('c_lip', rs, G_SKIN)


def mouth_cut(sx):
    """Перед проёмом - воздух: корпус внутри контура проёма (чуть шире) до носа кромки убирается, иначе он закрывает кромку у внутреннего угла (брусок)."""
    rings = [poly_ring(a, inl_pts(5.20, -0.02, sx, sq=False)[0], 96, 0.004) for a in (5.02, 5.08, 5.14, 5.24)]      # по прежнему (высокому) контуру: корпус над опущенным верхом кромки тоже уходит
    return loft_obj('c_mouth', rings, G_SKIN)


def duct_cut(sx):
    """Канал: тёмный и глухой; спереди - контур проёма образца, к хвосту сужается."""
    rings = []
    r0 = poly_ring(5.20, inl_pts(5.20, 0.0, sx)[0], 96, inl_pts(5.20, 0.0, sx)[1])      # начало выреза по скосу кромки, на 1 см за её краем (иначе выемки в корпусе перед кольцом)
    rings.append([Vector((v.x, L / 2 - (lip_a(v.x, v.z) + 0.01), v.z)) for v in r0])
    for i in range(1, 40):      # плавно: ступени были видны в проёме
        a = 5.22 + (DUCT_END - 5.22) * (i - 1) / 38; pts, r = inl_pts(a, 0.0, sx); rings.append(poly_ring(a, pts, 96, r))
    return loft_obj('c_duct_' + ('r' if sx > 0 else 'l'), rings, G_COCK)



# ── крыло: дельта, прямая задняя кромка ──
WLE = Lin([(0.80, 6.61), (1.55, 7.36), (5.17, 10.98)]); WTE = Lin([(0.80, 12.95), (5.17, 12.60)])     # по модели CloudHub: стреловидность 45°
WY = Lin([(0.80, 0.36), (5.17, 0.02)])     # прямая, без перегиба (слова Mark: крыло гнутое)
def wy(x): return WY(x)     # по модели CloudHub: у корня выше, к концу почти ровно
TC = Lin([(0.8, 0.052), (1.6, 0.050), (5.17, 0.034)])
FLAP_I = (1.82, 3.30); FLAP_O = (3.35, 5.06); SLAT_I = (2.10, 3.50); SLAT_O = (3.55, 5.00); GAP = 0.012
HING = Lin([(1.75, 12.24), (3.30, 12.12), (3.35, 12.20), (5.06, 12.03)])
SLC = Lin([(2.10, 0.42), (3.50, 0.36), (5.00, 0.28)])
TIP_X = 5.170


def in_(x, r): return r[0] <= x <= r[1]


def _wsec(sx, x):
    c = WTE(x) - WLE(x); us = SLC(x) / c if (in_(x, SLAT_I) or in_(x, SLAT_O)) else 0.0; ue = (HING(x) - WLE(x)) / c if (in_(x, FLAP_I) or in_(x, FLAP_O)) else 1.0
    return foil_ring(WLE(x), c, TC(x), us, ue, 18, lambda a, h: P3(a, sx * x, wy(x) + h))


def wing_s(sx):
    xs = {0.80, 1.10, 1.40, TIP_X}
    for r in (FLAP_I, FLAP_O, SLAT_I, SLAT_O): xs |= {round(r[0] - 0.005, 4), r[0], r[1], round(r[1] + 0.005, 4)}
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
    xa, xb = spec[0] + 0.012, spec[1] - 0.028
    lo_ = lambda x_: wy(x_) - TC(x_) * (WTE(x_) - WLE(x_)) * thk(SLC(x_) / (WTE(x_) - WLE(x_))) - 0.003
    p0 = P3(WLE(xa) + SLC(xa) - GAP, sx * xa, lo_(xa)); p1 = P3(WLE(xb) + SLC(xb) - GAP, sx * xb, lo_(xb)); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized()
    if axis.x > 0: axis = -axis
    def sec(x):
        c = WTE(x) - WLE(x); return [v - pivot for v in foil_ring(WLE(x), c, TC(x), 0.0, (SLC(x) - GAP) / c, 12, lambda a, h: P3(a, sx * x, wy(x) + h))]
    ob = loft_obj(name, [sec(xa + (xb - xa) * i / 6) for i in range(7)], sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(0.0, 14.0), note='предкрылок: ось по нижней кромке; плюс - носок вниз'); return ob


def strake(sx):
    """Наплыв вдоль борта перед крылом: тонкий нож, сходит в переднюю кромку (модель CloudHub)."""
    T = [(6.05, 1.24, -0.06), (6.50, 1.55, -0.09), (7.20, 1.76, -0.11), (7.75, 1.98, 0.02)]
    rs = []
    for a, xo, z in T:
        xi = 1.00; t = 0.022 if a < 7.7 else 0.035
        rs.append([P3(a, sx * xi, z - 0.08), P3(a, sx * (xo - 0.06), z - t), P3(a, sx * xo, z), P3(a, sx * (xo - 0.06), z + t), P3(a, sx * xi, z + 0.10)])
    return loft_obj('s_strake_' + ('r' if sx > 0 else 'l'), rs, G_SKIN, sharp=40)


def tip_rail(sx):
    """Пусковая на конце крыла: постоянная, без ракеты (rafale_03, 04, 05)."""
    x = TIP_X + 0.075; y = wy(TIP_X); b = B(); hw, hh = 0.052, 0.072
    sec = lambda a, k: [P3(a, sx * x - hw * k, y - hh * k), P3(a, sx * x + hw * k, y - hh * k), P3(a, sx * x + hw * k, y + hh * k * 0.7), P3(a, sx * x - hw * k, y + hh * k * 0.7)]
    prof = [(10.05, 0.25), (10.20, 0.80), (10.45, 1.0), (12.75, 1.0), (12.90, 0.6), (12.95, 0.2)]
    b.loft([sec(a, k) for a, k in prof], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    sh = lambda a: [P3(a, sx * x - 0.016, y - hh - 0.040), P3(a, sx * x + 0.016, y - hh - 0.040), P3(a, sx * x + 0.016, y - hh + 0.01), P3(a, sx * x - 0.016, y - hh + 0.01)]
    b.loft([sh(10.55), sh(12.55)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    sec2 = lambda a: [P3(a, sx * (TIP_X - 0.06), y - 0.02), P3(a, sx * (x - 0.02), y - 0.03), P3(a, sx * (x - 0.02), y + 0.03), P3(a, sx * (TIP_X - 0.06), y + 0.02)]
    b.loft([sec2(11.20), sec2(12.55)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('tip_rail_' + ('r' if sx > 0 else 'l'), sharp_deg=40)


# ── утки: цельноповоротные, высоко на плечах у кабины (rafale_01, 05, 10) ──
CAN = dict(x0=1.270, y0=0.640, a_le=5.20, a_te=6.70, a_tle=6.34, a_tte=6.86, span=1.66, th0=0.080, th1=0.018); CAN_U = Vector((1.0, 0.0, 0.17)).normalized(); CAN_GAP = 0.015     # концы чуть выше корня (модель CloudHub)     # по модели CloudHub


def can_pt(a, s, h, sx):
    U = CAN_U; n = Vector((-U.z, 0, U.x)); p = Vector((CAN['x0'], 0, CAN['y0'])) + U * s + n * h; return P3(a, sx * p.x, p.z)


def canard(sx):
    name = 'canard_' + ('r' if sx > 0 else 'l'); T = CAN; s0 = CAN_GAP; rings = []
    for i in range(6):
        k = i / 5; s = s0 + (T['span'] - s0) * k; a0 = T['a_le'] + (T['a_tle'] - T['a_le']) * k; a1 = T['a_te'] + (T['a_tte'] - T['a_te']) * k; c = a1 - a0; th = T['th0'] + (T['th1'] - T['th0']) * k
        rings.append([can_pt(a0, s, 0, sx), can_pt(a0 + c * 0.25, s, th * 0.34, sx), can_pt(a0 + c * 0.55, s, th / 2, sx), can_pt(a0 + c * 0.82, s, th * 0.28, sx), can_pt(a1, s, 0, sx), can_pt(a0 + c * 0.82, s, -th * 0.28, sx), can_pt(a0 + c * 0.55, s, -th / 2, sx), can_pt(a0 + c * 0.25, s, -th * 0.34, sx)])
    aP = 6.10; pivot = can_pt(aP, 0, 0, sx); axis = (can_pt(aP, 1, 0, sx) - pivot).normalized(); b = B(); b.loft([[v - pivot for v in r] for r in rings], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); ob = b.finish(name, sharp_deg=22); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-10.0, 10.0), note='цельноповоротная утка (больше 10° корень задевает плечо), ось вдоль размаха в обтекателе на плече'); return ob


def canard_boss(sx):
    """Обтекатель оси на плече: верх поперечен оси вращения."""
    T = CAN; a0, a1 = T['a_le'] - 0.08, T['a_te'] + 0.12; c = a1 - a0; h = 0.070      # по длине корня утки
    ring = lambda s, k: [can_pt(a0 + c * t, s, f * (h + k), sx) for t, f in ((0.0, 0.0), (0.18, 0.75), (0.5, 1.0), (0.8, 0.8), (1.0, 0.0), (0.8, -0.8), (0.5, -1.0), (0.18, -0.75))]
    b = B(); b.loft([ring(-0.34, 0.04), ring(-0.03, 0.01), ring(CAN_GAP - 0.003, 0.0)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); return b.finish('c_cb', sharp_deg=25)     # до корня утки с зазором 5 мм (слова Mark: утки висят в воздухе)


# ── киль и руль; контейнер на вершине ──
FIN_Y0, FIN_Y1 = 1.10, 3.30
F_LE = Lin([(0.85, 9.80), (1.20, 10.38), (3.00, 13.33), (FIN_Y1, 13.80)]); F_TE = Lin([(0.85, 13.95), (1.20, 14.04), (3.00, 14.88), (FIN_Y1, 15.02)])     # по модели CloudHub
RUD = (1.45, 3.00); RUD_C = Lin([(1.45, 0.58), (3.00, 0.42)])
def ftc(y): return 0.048 - 0.018 * (y - 0.85) / 2.45


def fin():
    ys = [0.85, 1.00, 1.20, RUD[0] - 0.005, RUD[0]] + [RUD[0] + (RUD[1] - RUD[0]) * i / 6 for i in range(1, 7)] + [RUD[1] + 0.005, (RUD[1] + FIN_Y1) / 2, FIN_Y1]; rings = []
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
    """Контейнер на вершине киля: спереди окно датчика, сзади огонь (rafale_01, 07, 08)."""
    b = B()
    y0, y1 = FIN_Y1 - 0.03, FIN_Y1 + 0.38; a0, a1 = 13.85, 15.20; hw = 0.072
    def sec(a, k, kh):
        yc = (y0 + y1) / 2; hh = (y1 - y0) / 2 * kh; w = hw * k; return [P3(a, -w, yc - hh), P3(a, w, yc - hh), P3(a, w * 0.92, yc + hh), P3(a, -w * 0.92, yc + hh)]
    b.loft([sec(a0, 0.55, 0.60), sec(a0 + 0.06, 0.95, 0.95), sec(a0 + 0.14, 1.0, 1.0), sec(a1 - 0.12, 1.0, 1.0), sec(a1 - 0.03, 0.85, 0.85), sec(a1, 0.5, 0.6)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('fin_fair', sharp_deg=30)


# ── фонарь: одним куском, высоко; рама одним кольцом ──
CANOPY = [(2.40, top_y(2.40, 0.0) + 0.004, 0.150), (2.90, 1.085, 0.340), (3.40, 1.330, 0.400), (3.90, 1.460, 0.420), (4.40, 1.480, 0.425), (4.90, 1.440, 0.425), (5.40, 1.375, 0.415), (5.90, 1.305, 0.395), (6.20, 1.270, 0.300)]; CAN_T = tracks(CANOPY)     # по модели CloudHub     # ниже: по сверке с образцом
ARCH_A = 3.05; CAN_A1 = 6.17; CAN_H = (5.30, 0.0)
def SILL(a): return top_y(a, CAN_T[1](a))
def CK_HW(a): return CAN_T[1](a) - 0.022


def can_ring(a, inset=0.0, n=44):
    top, hw = CAN_T[0](a) - inset, CAN_T[1](a) - inset; y0 = SILL(a) + 0.002; out = []
    for k in range(n):
        c = math.cos(math.pi * k / (n - 1)); s = math.sin(math.pi * k / (n - 1)); out.append(P3(a, math.copysign(hw * abs(c) ** 0.70, c), y0 + (top - y0) * s ** 0.95))     # ниже и площе (слова Mark: слишком выпуклый)
    return out


def frame_arch(b, a, w, inset=0.008, h=0.020, n=44, drop=0.0):
    ri0 = can_ring(a - w, inset, n); ro0 = can_ring(a - w, -h, n); ro1 = can_ring(a + w, -h, n); ri1 = can_ring(a + w, inset, n)
    if drop: ri0 = [p - Vector((0, 0, drop)) for p in ri0]; ri1 = [p - Vector((0, 0, drop)) for p in ri1]
    strip(b, [ri0, ro0, ro1, ri1, ri0], G_SKIN)


def _rail(b, sg, a0, a1, d0=0.004, d1=0.020, z0=-0.004):
    st = stations(a0, a1, 0.07); rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
    b.loft([[rail(a, d0 - 0.018, z0), rail(a, d1, z0), rail(a, d1, 0.020), rail(a, d0 - 0.016, 0.042)] for a in st], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)


def canopy():
    """Фонарь откидывается вбок направо: ось вдоль правого порога (на фото закрыт, сторона открытия - как у настоящего)."""
    a0 = ARCH_A; a1 = CAN_A1; st = stations(a0 + 0.004, a1, 0.12)
    _hx = max(CAN_T[1](a) for a in st) + 0.024; pa, pb = P3(a0 + 0.08, _hx, SILL(a0 + 0.08) + 0.044), P3(a1 - 0.10, _hx, SILL(a1 - 0.10) + 0.044); pv = (pa + pb) / 2; ax = (pa - pb).normalized()     # ось по наружному нижнему углу правого рельса: рельс поднимается и уходит наружу, в кабину не входит     # ось по верху наружного рельса, вдоль порога: при открытии кромка не уходит вниз в порог
    gb = B(); strip(gb, [can_ring(a) for a in st], G_GLASS); gl = gb.finish('canopy_glass', sharp_deg=60)
    for v in gl.data.vertices: v.co -= pv
    gl.location = pv
    b = B(); frame_arch(b, a0 + 0.030, 0.030, inset=-0.010, h=0.028, drop=0.0)
    for sg in (1, -1): _rail(b, sg, a0 + 0.06, a1 - 0.05, z0=0.003)     # подвижный рельс над порогом: при открытии не трёт
    strip(b, [can_ring(a1 - 0.05, 0.016), can_ring(a1 - 0.05, -0.006), can_ring(a1, -0.006), can_ring(a1, 0.016), can_ring(a1 - 0.05, 0.016)], G_SKIN)
    fr = b.finish('canopy', sharp_deg=45)
    for v in fr.data.vertices: v.co -= pv
    fr.location = pv; gl.parent = fr; gl.location = (0, 0, 0)
    PARTS['canopy'] = dict(pivot=pv.copy(), axis=ax.copy(), range=(0.0, 26.0), note='ход 26°: дальше левая кромка ложится на правое плечо; ось вдоль правого порога, от хвоста к носу; плюс - левая кромка вверх, фонарь ложится вправо; canopy_glass - дочерний объект')
    return [fr, gl]


def windscreen():
    a1 = ARCH_A - 0.02; st = stations(2.46, a1, 0.08); bg = B(); strip(bg, [can_ring(a) for a in st], G_GLASS); gl = bg.finish('screen_glass', sharp_deg=60)
    b = B(); frame_arch(b, ARCH_A - 0.036, 0.026, inset=0.030, h=0.004, drop=0.012); frame_arch(b, 2.48, 0.030, inset=0.035, h=0.010, drop=0.07)
    for sg in (1, -1): _rail(b, sg, 2.48, a1)
    return [gl, b.finish('screen_frame', sharp_deg=45)]


def cock_cut():
    st = stations(3.10, 6.19, 0.07); rg = lambda a: [P3(a, -CK_HW(a), 0.28), P3(a, CK_HW(a), 0.28), P3(a, CK_HW(a), 2.2), P3(a, -CK_HW(a), 2.2)]
    return loft_obj('c_cock', [rg(a) for a in st], G_COCK, sharp=25)


# ── пилоны: три под крылом и один под фюзеляжем на сторону ──
PYLON_DEF = (('o', 3.80, 10.05, 11.85, wy(3.80) - 0.48), ('m', 2.95, 9.25, 11.90, wy(2.95) - 0.50), ('i', 2.10, 8.42, 11.50, wy(2.10) - 0.55))
def pylon(sx, tag, x, a0, a1, y0):
    b = B(); name = f'pylon_{tag}_' + ('r' if sx > 0 else 'l'); yw = wy(x) - 0.02; hw = 0.058
    def sec(a, f=1.0): return [P3(a, sx * x - hw * f, y0), P3(a, sx * x + hw * f, y0), P3(a, sx * x + hw * f * 0.85, yw), P3(a, sx * x - hw * f * 0.85, yw)]
    st = [a0, a0 + 0.14, a0 + 0.45, a1 - 0.50, a1 - 0.14, a1]; fs = [0.10, 0.70, 1.0, 1.0, 0.65, 0.10]
    b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); PYLON_PTS[name] = P3((a0 + a1) / 2, sx * x, y0); PYLON_PTS[name + '_root'] = P3((a0 + a1) / 2, sx * x, yw)
    return b.finish(name, sharp_deg=40)


FUSE_ST = dict(a0=9.70, a1=11.70, x=0.520, y0=-0.640)
def side_rail(sx):
    """Точка под фюзеляжем сбоку (rafale_05): короткий пилон."""
    F_ = FUSE_ST; a0, a1, x, y0 = F_['a0'], F_['a1'], F_['x'], F_['y0']; b = B(); hw = 0.052; yt = -0.20; name = 'pylon_c_' + ('r' if sx > 0 else 'l')
    sec = lambda a, f: [P3(a, sx * x - hw * f, y0), P3(a, sx * x + hw * f, y0), P3(a, sx * x + hw * f * 1.5, yt), P3(a, sx * x - hw * f * 1.5, yt)]
    st = [a0, a0 + 0.2, a1 - 0.2, a1]; fs = [0.15, 1.0, 1.0, 0.15]; b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); PYLON_PTS[name] = P3((a0 + a1) / 2, sx * x, y0); return b.finish(name, sharp_deg=40)


POD = dict(a=6.75, x=0.98, y0=-0.62, hl=0.55)
def pod_mount():
    """Крепление контейнера прицела под правым заборником (rafale_02)."""
    P_ = POD; am, hl, y0, yt = P_['a'], P_['hl'], P_['y0'], -0.35; b = B(); hw = 0.055; x = P_['x']
    sec = lambda a, f: [P3(a, x - hw * f, y0), P3(a, x + hw * f, y0), P3(a, x + hw * f * 1.4, yt), P3(a, x - hw * f * 1.4, yt)]
    st = [am - hl, am - hl + 0.12, am + hl - 0.12, am + hl]; fs = [0.2, 1.0, 1.0, 0.2]; b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); PYLON_PTS['pod'] = P3(am, x, y0); return b.finish('pylon_pod', sharp_deg=40)


# ── штанга дозаправки: неподвижная, справа перед фонарём (rafale_01, 07, 08) ──
def probe():
    b = B(); n = 12
    pts = [P3(2.72, 0.33, 0.70), P3(2.66, 0.36, 0.84), P3(2.56, 0.38, 1.00), P3(2.30, 0.39, 1.16), P3(1.90, 0.39, 1.24), P3(1.55, 0.39, 1.26)]
    rs = [0.050, 0.046, 0.040, 0.034, 0.030, 0.030]
    t0 = (pts[1] - pts[0]).normalized(); u = t0.orthogonal().normalized(); rings = []
    for i, p in enumerate(pts):
        a_ = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized(); u = (u - a_ * u.dot(a_)).normalized(); v = a_.cross(u)
        rings.append([p + (u * math.cos(2 * math.pi * q / n) + v * math.sin(2 * math.pi * q / n)) * rs[i] for q in range(n)])
    tip = pts[-1]; d = Vector((0, 1, 0))
    rings.append([tip + d * 0.05 + (Vector((math.cos(2 * math.pi * q / n), 0, math.sin(2 * math.pi * q / n)))) * 0.040 for q in range(n)])
    rings.append([tip + d * 0.11 + (Vector((math.cos(2 * math.pi * q / n), 0, math.sin(2 * math.pi * q / n)))) * 0.020 for q in range(n)])
    b.loft(rings, G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('det_probe', sharp_deg=40)


# ── шасси: размеры ──
GROUND_Y = -1.64     # высота 5,34 м до верха киля 3,70 (модель CloudHub)
NG = dict(a=4.05, hinge=(4.25, -0.20), rw=0.235, ww=0.13, track=0.125)
MG_A, MG_X = 9.95, 1.42; MAIN_T = (10.75, 1.30, 0.06)
NDOOR = dict(a0=3.90, a1=5.95, hw=0.220); MDOOR = dict(a0=8.95, a1=10.95, x0=0.95, x1=1.62)


def doors():
    out = []; D = NDOOR
    for sx in (1, -1):
        n_ = 'door_n_' + ('r' if sx > 0 else 'l'); ob = patch(n_, lambda u, v: (D['a0'] + (D['a1'] - D['a0']) * v, sx * (0.004 + (D['hw'] - 0.004) * u)), 4, 12, dirn=1, lift=0.002, th=0.012, z0=-4.0)
        pv = P3((D['a0'] + D['a1']) / 2, sx * D['hw'], down(sx * D['hw'], Yb((D['a0'] + D['a1']) / 2), z0=-4.0, dirn=1).z - 0.004); _rel(ob, pv)
        PARTS[n_] = dict(pivot=pv.copy(), axis=Vector((0, -sx, 0)), range=(0.0, 88.0), note='створка передней стойки: шарнир у края, плюс - внутренняя кромка вниз'); out.append(ob)
    D = MDOOR
    for sx in (1, -1):
        n_ = 'door_m_' + ('r' if sx > 0 else 'l'); ob = patch(n_, lambda u, v: (D['a0'] + (D['a1'] - D['a0']) * v, sx * (D['x0'] + (D['x1'] - D['x0']) * u)), 10, 10, dirn=1, lift=0.002, th=0.014, z0=-4.0)
        pv = P3((D['a0'] + D['a1']) / 2, sx * D['x1'], down(sx * D['x1'], Yb((D['a0'] + D['a1']) / 2), z0=-4.0, dirn=1).z - 0.004); _rel(ob, pv)
        PARTS[n_] = dict(pivot=pv.copy(), axis=Vector((0, -sx, 0)), range=(0.0, 95.0), note='створка основной стойки: шарнир у наружной кромки, плюс - внутренняя кромка вниз'); out.append(ob)
    return out


def gear_bays(host):
    D = NDOOR; rg = lambda a: [P3(a, -D['hw'] - 0.004, -1.4), P3(a, D['hw'] + 0.004, -1.4), P3(a, D['hw'] + 0.004, 0.05), P3(a, -D['hw'] - 0.004, 0.05)]
    c = loft_obj('c_bay', [rg(D['a0'] - 0.005), rg(D['a1'] + 0.005)], G_DARK, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    D = MDOOR
    for sx in (1, -1):
        rg = lambda a: [P3(a, sx * (D['x0'] - 0.006), -1.4), P3(a, sx * (D['x1'] + 0.004), -1.4), P3(a, sx * (D['x1'] + 0.004), 0.02), P3(a, sx * (D['x0'] - 0.006), 0.02)]
        c = loft_obj('c_bay', [rg(D['a0'] - 0.005), rg(D['a1'] + 0.005)], G_DARK, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)


# ── перед корпуса с заборниками - прямо из модели CloudHub «Dassault Rafale» (CC BY 4.0, автор указан в паспорте) ──


def _pip(px, py, poly):
    ins = False; n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        if (y1 > py) != (y2 > py) and px < x1 + (py - y1) * (x2 - x1) / (y2 - y1): ins = not ins
    return ins


def _in_duct(a, x, z):
    """Грань образца внутри канала заборника глубже кромки: контур проёма чуть внутрь."""
    if a < LIP_A + 0.06 or a > DUCT_END: return False
    pts, _ = inl_pts(a, -0.03, 1)
    return _pip(abs(x), z, pts)


def _duct_wall(a, x, z, nrm):
    """Стенка канала образца: внутри контура проёма и смотрит к его оси (наружная обшивка смотрит от оси)."""
    if not _in_duct(a, x, z): return False
    k = 1.0 - 0.40 * _sm((a - 5.6) / (DUCT_END - 5.6)); cx = math.copysign(_ICX, x); d = Vector((x - cx, 0.0, z - _ICY))
    return d.length > 1e-6 and nrm.dot(d.normalized()) > 0.2


def snap_under_ref(host, refs, off=0.020, reach=0.16, blend=0.9, extra=(), extra_in=None):
    """Наш корпус под обшивкой образца: точки, вышедшие наружу, прижимаются под неё на off; у границы A_CUT -
    вплотную, за ней сдвиг гаснет на длине blend (стык без ступеньки)."""
    bm_r = bmesh.new()
    for o in refs:
        t = o.data.copy(); bm_r.from_mesh(t); bpy.data.meshes.remove(t)
    tree0 = BVHTree.FromBMesh(bm_r)
    for o in extra:
        t = o.data.copy(); bm_r.from_mesh(t); bpy.data.meshes.remove(t)
    tree1 = BVHTree.FromBMesh(bm_r) if extra else tree0
    bm = bmesh.new(); bm.from_mesh(host.data); bm.normal_update(); moved = 0; band = []
    for v in bm.verts:
        a = L / 2 - v.co.y
        if a > A_CUT - 0.02: continue
        if any(f.material_index != G_SKIN for f in v.link_faces): continue      # стенки канала и щели не трогаем
        tree = tree1 if (extra_in and extra_in(a, v.co.x, v.co.z)) else tree0      # к своему плечу - только в его зоне (иначе корпус за ним тянется к его краю)
        if 6.10 < a < A_CUT and v.co.z > 0.66 and abs(v.co.x) < 0.62: continue      # верх за фонарём - свой, не мнётся о край выреза образца
        if a > SH_A1 - 0.02 and v.co.z > 0.40 and abs(v.co.x) > 0.55: continue      # за своим плечом верх и бок свои: образца там нет
        if a > ROOT_CUT_A - 0.05 and abs(v.co.x) > ROOT_CUT_X - 0.04 and v.co.z > ROOT_CUT_Z - 0.04: continue      # корень крыла - свой
        if a > 4.90 and 0.25 < abs(v.co.x) < 1.45 and -0.55 < v.co.z < 0.70 and a > 5.12: continue      # зона своего заборника (над планкой - только за кромкой)
        if a > 5.00 and abs(v.co.x) < 0.62 and v.co.z < -0.06: continue      # днище между заборниками - своё (перед кромкой - щека образца, без полки)
        if a > FAIR_A - 0.10 and abs(v.co.x) > FAIR_X - 0.06 and v.co.z < (0.62 if (a < 6.20 and abs(v.co.x) > 1.10) else FAIR_Z) + 0.04: continue      # обечайка заборника - своя
        if 6.10 < a < SH_A1 and v.co.z > 0.66 and abs(v.co.x) < 0.80:      # у края выреза - вплотную к образцу с обеих сторон: без щели и ступени
            hit = tree.find_nearest(v.co, 0.25)
            if hit[0] is not None:
                w_ = _sm((abs(v.co.x) - 0.62) / 0.13); v.co += (hit[0] - v.co) * w_; moved += 1
            continue
        hit = tree.find_nearest(v.co, reach)
        if hit[0] is None: continue
        p_, n_ = hit[0], v.normal
        k = _sm((a - (A_CUT - 0.45)) / 0.43)        # 0 спереди, 1 у границы
        o_ = off * (1 - k)
        if (v.co - p_).dot(n_) > -o_ or k > 0.0:
            d = p_ - n_ * o_ - v.co
            if k > 0.0 or d.dot(n_) < 0: v.co += d; moved += 1
            if a > A_CUT - 0.15: band.append((v.co.copy(), d))
    if band:
        from mathutils.kdtree import KDTree
        kd = KDTree(len(band))
        for i, (c, _) in enumerate(band): kd.insert(Vector((c.x, 0.0, c.z)), i)
        kd.balance()
        for v in bm.verts:
            a = L / 2 - v.co.y
            if not (A_CUT - 0.02 < a < A_CUT + blend): continue
            _, i, dd = kd.find(Vector((v.co.x, 0.0, v.co.z)))
            if dd > 0.12: continue
            v.co += band[i][1] * (1 - _sm((a - A_CUT) / blend)); moved += 1
    bm.to_mesh(host.data); bm.free(); bm_r.free(); host.data.update(); print('прижим к образцу: точек', moved)


TUBE_END = 6.80     # дальше канал выходил наружу сквозь борт за передом образца
def duct_tube(sx):
    """Тёмный глухой канал за кромкой заборника образца (стенки образца глубже кромки удалены); нормали внутрь."""
    rings = []
    for i in range(14):
        a = 5.34 + (TUBE_END - 5.34) * i / 13; pts, r = inl_pts(a, 0.006, sx); rings.append(poly_ring(a, pts, 96, r))
    ob = loft_obj('RF_duct_' + ('r' if sx > 0 else 'l'), rings, G_COCK, cap0=False, cap1=True, sharp=60)
    for f in ob.data.polygons: f.material_index = G_COCK
    ob.data.flip_normals(); return ob


def hide_under_ref(host, refs, reach=0.30):
    """Грани нашей обшивки в передней зоне, которые снаружи закрыты обшивкой образца, удаляются (иначе проступают клиньями);
    остаются только те, что закрывают дыры образца."""
    bm_r = bmesh.new()
    for o in refs:
        if not o.name.startswith('RF_front') and not o.name.startswith('RF_nose'): continue
        t = o.data.copy(); bm_r.from_mesh(t); bpy.data.meshes.remove(t)
    tree = BVHTree.FromBMesh(bm_r)
    bm = bmesh.new(); bm.from_mesh(host.data); bm.normal_update(); kill = []
    for f in bm.faces:
        c = f.calc_center_median(); a = L / 2 - c.y
        if a > A_CUT - 0.15 or f.material_index != G_SKIN: continue
        if 6.10 < a and abs(c.x) < 0.78 and c.z > 0.66: continue
        if a > 5.00 and abs(c.x) < 0.62 and c.z < -0.06: continue
        if 4.85 < a < 5.45 and 0.22 < abs(c.x) < 0.52 and -0.25 < c.z < 0.22: continue      # у внутреннего угла проёма корпус не прятать: сбоку снизу его ничто не закрывает (дыра в нишу стойки)
        if a > FAIR_A - 0.10 and abs(c.x) > FAIR_X - 0.06 and c.z < (0.62 if (a < 6.20 and abs(c.x) > 1.10) else FAIR_Z) + 0.04: continue
        ok = True
        for p_ in [c] + [v.co for v in f.verts]:
            hit = tree.ray_cast(p_ + f.normal * 0.001, f.normal, reach)
            if hit[0] is None: ok = False; break
        if not ok:      # торчит наружу: обшивка образца под гранью, совсем рядом
            hit = tree.ray_cast(c - f.normal * 0.001, -f.normal, 0.12); ok = hit[0] is not None
        if ok: kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(host.data); bm.free(); bm_r.free(); host.data.update(); print('скрыто под образцом граней:', len(kill))


_GP0 = (0.40, 0.05); _GU = Vector((0.842, 0.539)); _GN = Vector((-0.539, 0.842))
def _inner_mask(a, x, z, nrm):
    """Внутренняя часть кромки у борта и обрывки граней между кольцом и косой стенкой корпуса."""
    if not (5.11 < a < 5.95) or abs(nrm.y) > 0.6: return False      # перед кромкой щека не затемняется
    s = (abs(x) - _GP0[0]) * _GN.x + (z - _GP0[1]) * _GN.y; t = (abs(x) - _GP0[0]) * _GU.x + (z - _GP0[1]) * _GU.y
    if -0.04 < s < 0.14 and -0.08 < t < 0.80: return True
    pts, _ = inl_pts(max(a, LIP_A), -0.03, 1)
    return abs(x) < 0.72 and _pip(abs(x), z, pts)


def side_cover(sx, objs):
    """Гладкая накладка на борт за заборником (слова Mark): форма снимается лучами с борта (образец + своя обечайка),
    сглаживается и выводится наружу на 6 мм - складки и щели образца под ней не видны."""
    bm_r = bmesh.new()
    for o in objs:
        t = o.data.copy(); t.transform(o.matrix_world); bm_r.from_mesh(t); bpy.data.meshes.remove(t)
    tree = BVHTree.FromBMesh(bm_r)
    A = [5.40 + (8.40 - 5.40) * i / 30 for i in range(31)]; Z = [-0.26 + (0.56 + 0.26) * j / 16 for j in range(17)]     # вперёд почти до кромки и вверх на плечо (слова Mark: рвано у заборника)
    G = [[None] * len(Z) for _ in A]
    for i, a in enumerate(A):
        for j, z in enumerate(Z):
            hit = tree.ray_cast(Vector((sx * 2.4, L / 2 - a, z)), Vector((-sx, 0, 0)), 3.0)
            G[i][j] = abs(hit[0].x) if hit[0] is not None and abs(hit[0].x) < 1.75 else None
    for i in range(len(A)):      # дыры - по соседям
        for j in range(len(Z)):
            if G[i][j] is None:
                nb = [G[i2][j2] for i2, j2 in ((i - 1, j), (i + 1, j), (i, j - 1), (i, j + 1)) if 0 <= i2 < len(A) and 0 <= j2 < len(Z) and G[i2][j2] is not None]
                G[i][j] = max(nb) if nb else 0.9
    for i in range(len(A)):      # кили и провалы в дыры отсекаются: в сечении - не дальше 6 см от средней ширины борта
        srt = sorted(G[i]); med = srt[len(srt) // 2]
        G[i] = [min(max(v, med - 0.06), med + 0.10) for v in G[i]]
    CAP = [max(r) for r in G]
    for _ in range(3):           # впадины поднимаются до соседей (не выше потолка сечения)
        G = [[min(CAP[i], max([G[i][j]] + [G[i2][j2] for i2 in (i - 1, i, i + 1) for j2 in (j - 1, j, j + 1) if 0 <= i2 < len(A) and 0 <= j2 < len(Z)])) for j in range(len(Z))] for i in range(len(A))]
    for _ in range(6):           # сглаживание; накладка не уходит внутрь борта
        H = [[0.0] * len(Z) for _ in A]
        for i in range(len(A)):
            for j in range(len(Z)):
                nb = [G[i2][j2] for i2, j2 in ((i - 1, j), (i + 1, j), (i, j - 1), (i, j + 1)) if 0 <= i2 < len(A) and 0 <= j2 < len(Z)]
                H[i][j] = max(G[i][j], 0.5 * G[i][j] + 0.5 * sum(nb) / len(nb))
        G = H
    b = B(); rs = []
    for i, a in enumerate(A):
        e = lambda j: min(i, len(A) - 1 - i, j, len(Z) - 1 - j)     # края утоплены под обшивку - без полки
        fi = (-0.080, -0.035, -0.008)[i] if i < 3 else 0.006      # спереди накладка постепенно уходит под обшивку
        rs.append([P3(a, sx * (G[i][j] + min(fi, (0.006, -0.025, -0.012, -0.002)[0] if e(j) >= 3 else (-0.060, -0.022, -0.004)[e(j)])), Z[j]) for j in range(len(Z))])     # края глубже под обшивку
    strip(b, rs if sx < 0 else [list(reversed(r)) for r in rs], G_SKIN)
    bm_r.free(); return b.finish('RF_cover_' + ('r' if sx > 0 else 'l'), sharp_deg=70)


def sill_fill(sx, front):
    """Полоса обшивки вдоль порога фонаря: от среза образца до порога (иначе под рельсом тёмная щель)."""
    bm_r = bmesh.new(); t = front.data.copy(); bm_r.from_mesh(t); bpy.data.meshes.remove(t); tree = BVHTree.FromBMesh(bm_r); rs = []
    for a in stations(2.46, 6.24, 0.05):
        ac = min(a, 6.19); hw = CAN_T[1](ac); y0 = SILL(ac); xo = hw + 0.085
        hit = tree.ray_cast(Vector((sx * xo, L / 2 - a, 3.0)), Vector((0, 0, -1)), 3.0)
        zo = hit[0].z + 0.004 if hit[0] is not None and hit[0].z < y0 + 0.02 else y0 - 0.05
        rs.append([P3(a, sx * (hw - 0.004), y0 - 0.002), P3(a, sx * (hw + 0.030), y0 - 0.006 + (zo - y0) * 0.25), P3(a, sx * xo, zo)])
    b = B(); strip(b, rs if sx > 0 else [list(reversed(r)) for r in rs], G_SKIN); bm_r.free()
    return b.finish('RF_sill_' + ('r' if sx > 0 else 'l'), sharp_deg=60)


FAIR_A = 5.24; FAIR_X = 0.90; FAIR_Z = 0.75     # за кромкой наружная стенка заборника своя (обечайка), стенка образца срезана
ROOT_CUT_X = 1.20; ROOT_CUT_A = 5.90; ROOT_CUT_Z = 0.24     # крыло и пластины образца у корня крыла убраны: остаются своё крыло и борт (слова Mark: заломы у корня)
TOPCUT_X = Lin([(6.10, 0.75), (7.60, 0.75)])     # верх образца за фонарём убран до плеч: остаётся свой гладкий корпус (слова Mark: заломы)


def lip_a(x, z):
    """Скос кромки по образцу: нижняя половина 5.19, косая верхняя планка 5.13."""
    s_ = (_unx(abs(x)) - 0.40) * -0.539 + (_usq(z) - 0.05) * 0.842      # по исходному контуру: скос как был
    return 5.19 - 0.06 * _sm((s_ + 0.10) / 0.08)


def lip_ring(sx):
    """Своё кольцо кромки заборника по контуру образца: скруглённый край, внутри переходит в канал, снаружи в обечайку."""
    prof = [(0.006, 0.20), (0.008, 0.08), (-0.004, 0.015), (-0.024, 0.0), (-0.044, 0.015), (-0.058, 0.08), (-0.060, 0.14)]     # (отступ внутрь контура, отступ назад от кромки)
    rings = []
    for ins, da in prof:
        base = poly_ring(LIP_A, inl_pts(LIP_A, ins, sx)[0], 96, 0.004)
        rings.append([Vector((v.x, L / 2 - (lip_a(v.x, v.z) + da), v.z)) for v in base])
    b = B(); strip(b, [r + r[:1] for r in rings] if sx > 0 else [list(reversed(r + r[:1])) for r in rings], G_SKIN)
    return b.finish('RF_lip_' + ('r' if sx > 0 else 'l'), sharp_deg=70)


GAP_S0, GAP_S1 = 0.06, 0.14     # щель 8 см остаётся (слова Mark: щель оставь, дырку заделай)     # щель между верхней косой кромкой и бортом: от наружной стенки обечайки до стенки борта, 8 см (фото 01, слова Mark)
def _gp(a, s, t, sx):
    x = 0.40 + 0.842 * t - 0.539 * s; z = 0.05 + 0.539 * t + 0.842 * s; return P3(a, sx * x, z)


def gap_wall(sx):
    """Стенка борта параллельно косой кромке, за щелью: сплошная, сливается с корпусом."""
    rs = [[_gp(a, s, t, sx) for s, t in ((GAP_S1, -0.10), (GAP_S1, 0.84), (GAP_S1 + w, 0.84), (GAP_S1 + w, -0.10))] for a, w in ((5.00, 0.004), (5.10, 0.10), (5.25, 0.16), (5.5, 0.16), (6.2, 0.16), (6.7, 0.16))]     # спереди узкая, назад шире: без плоского торца
    return loft_obj('s_gapwall_' + ('r' if sx > 0 else 'l'), rs, G_SKIN, sharp=30)


def gap_cut(sx):
    """Сама щель: ровно 8 см, к хвосту сходит на нет."""
    rs = []
    for a, k in ((4.90, 1.0), (5.80, 1.0), (6.25, 0.55), (6.50, 0.05)):
        s1 = GAP_S0 + (GAP_S1 - GAP_S0) * k
        rs.append([_gp(a, s, t, sx) for s, t in ((GAP_S0 - 0.002, -0.08), (GAP_S0 - 0.002, 0.82), (s1, 0.82), (s1, -0.08))])
    return loft_obj('c_gap', rs, G_COCK, sharp=30)


# ── своё плечо над заборником (слова Mark: корпус над заборниками сломан): верх и ребро по замеру образца, под ребром - потолок, дальше стенка щели ──
SH_A0, SH_A1 = 4.55, 7.00; SH_BL = 6.60     # плечо до 7.0 (за задней кромкой утки), сведение к корпусу с 6.6 - шов ушёл из зоны утки (слова Mark)
RAW = {}
def raw_tree():
    """BVH исходной обшивки образца (Object_30) в наших осях - для замеров плеча."""
    if 't' in RAW: return RAW['t']
    before = set(bpy.data.objects); mats0 = set(bpy.data.materials); imgs0 = set(bpy.data.images)
    bpy.ops.import_scene.gltf(filepath=REF_GLB); new = [o for o in bpy.data.objects if o not in before]
    src = next(o for o in new if o.type == 'MESH' and o.name.startswith('Object_30'))
    bm = bmesh.new(); bm.from_mesh(src.data); bm.transform(src.matrix_world)
    for v in bm.verts: v.co = Vector(((v.co.y - REF_YC) * REF_K, L / 2 - v.co.x * REF_K, (v.co.z - REF_TZ) * REF_K))
    RAW['t'] = BVHTree.FromBMesh(bm); RAW['bm'] = bm
    for o in new:
        me = o.data if o.type == 'MESH' else None; bpy.data.objects.remove(o)
        if me is not None and me.users == 0: bpy.data.meshes.remove(me)
    for m in [m for m in bpy.data.materials if m not in mats0]: bpy.data.materials.remove(m)
    for i in [i for i in bpy.data.images if i not in imgs0]: bpy.data.images.remove(i)
    return RAW['t']


def _st(x, z):
    ax = abs(x); return (ax - 0.40) * -0.539 + (z - 0.05) * 0.842, (ax - 0.40) * 0.842 + (z - 0.05) * 0.539


def _xz(s, t): return 0.40 + 0.842 * t - 0.539 * s, 0.05 + 0.539 * t + 0.842 * s


_GK = Lin([(5.80, 1.0), (6.25, 0.55), (6.50, 0.05)])
def slot_top(a):
    """Верх щели (стенка борта): 0.14, к хвосту щель сходит на нет."""
    return GAP_S0 + (GAP_S1 - GAP_S0) * _GK(a)


def _sh_w(a): return _sm((a - 5.03) / 0.11)      # 0 - щека как у образца (до самой кромки), 1 - своя щель: утоплена только у кромки (слова Mark: оторванный кусок перед заборником)


def _raw_side(tr, a, z, sx):
    h = tr.ray_cast(Vector((sx * 2.5, L / 2 - a, z)), Vector((-sx, 0, 0)), 3.0); return abs(h[0].x) if h[0] is not None else None


def _raw_top(tr, a, x, sx):
    h = tr.ray_cast(Vector((sx * x, L / 2 - a, 2.5)), Vector((0, 0, -1)), 3.0); return h[0].z if h[0] is not None else None


def _raw_band(tr, a, t, sx):
    """s обшивки образца над кромкой: луч снаружи (из проёма) вдоль нормали к косой кромке."""
    x, z = _xz(-0.40, t); h = tr.ray_cast(Vector((sx * x, L / 2 - a, z)), Vector((sx * -0.539, 0, 0.842)), 1.2)
    return _st(h[0].x, h[0].z)[0] if h[0] is not None else None


_SEC = {}
def _raw_sec(a):
    """Точное сечение обшивки образца плоскостью a (отрезки в (|x|, z), правый борт; образец симметричен)."""
    k = round(a, 4)
    if k in _SEC: return _SEC[k]
    raw_tree(); bm = RAW['bm']
    if 'fy' not in RAW: RAW['fy'] = [(min(v.co.y for v in f.verts), max(v.co.y for v in f.verts), [v.co.copy() for v in f.verts]) for f in bm.faces]
    y0 = L / 2 - a; out = []
    for y_lo, y_hi, vs in RAW['fy']:
        if not (y_lo <= y0 <= y_hi): continue
        pts = []
        for i in range(len(vs)):
            p0, p1 = vs[i], vs[(i + 1) % len(vs)]; d0, d1 = p0.y - y0, p1.y - y0
            if (d0 > 0) != (d1 > 0):
                u = d0 / (d0 - d1); q = p0 + (p1 - p0) * u; pts.append((q.x, q.z))
        if len(pts) >= 2 and pts[0][0] > 0: out.append((pts[0], pts[1]))
    _SEC[k] = out; return out


def _raw_band2(a, t, smin=-0.15, smax=0.30):
    """s обшивки образца на линии t (по точному сечению): самая наружная точка в полосе."""
    best = None
    for (x0, z0), (x1, z1) in _raw_sec(a):
        s0, t0 = _st(x0, z0); s1, t1 = _st(x1, z1)
        if (t0 - t) * (t1 - t) > 0 or t0 == t1: continue
        u = (t - t0) / (t1 - t0); s = s0 + (s1 - s0) * u
        if smin < s < smax and (best is None or s < best): best = s
    return best


def _resample(pts, n):
    d = [0.0]
    for p, q in zip(pts, pts[1:]): d.append(d[-1] + math.hypot(q[0] - p[0], q[1] - p[1]))
    out = []; j = 0
    for i in range(n):
        u = d[-1] * i / (n - 1)
        while j < len(d) - 2 and d[j + 1] < u: j += 1
        k = (u - d[j]) / max(d[j + 1] - d[j], 1e-9); p, q = pts[j], pts[j + 1]; out.append((p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k))
    return out


SH_WALL_T = (0.78, -0.10); SH_TRM = -0.04     # стенка щели: от потолка до внутреннего конца; образец обрезан по t = SH_TRM
def sh_tin(a): return 0.0      # щель кончается у внутреннего угла кромки (глубже - карман, читался дырой)      # перед кромкой щель кончается у угла проёма, за ней - как была
def _hull_sec(a):
    """Сечение своего корпуса справа: верх z(|x|) и бок |x|(z) (с тем же сужением, что у сетки)."""
    global HULL_NARROW
    o_ = HULL_NARROW; HULL_NARROW = 0.16; R = hull_ring(a, 384); HULL_NARROW = o_
    n = len(R); rh = [(R[k].x, R[k].z) for k in range(0, n // 2 + 1)]      # снизу через правый бок к верху
    tq = sorted([(x, z) for x, z in rh[n // 4:]]); bz = sorted([(z, x) for x, z in rh])
    def zt(x):
        for (x0, z0), (x1, z1) in zip(tq, tq[1:]):
            if x0 <= x <= x1: return z0 + (z1 - z0) * (x - x0) / max(x1 - x0, 1e-9)
        return tq[0][1] if x < tq[0][0] else tq[-1][1]
    def xs_(z):
        for (z0, x0), (z1, x1) in zip(bz, bz[1:]):
            if z0 <= z <= z1: return x0 + (x1 - x0) * (z - z0) / max(z1 - z0, 1e-9)
        return bz[0][1] if z < bz[0][0] else bz[-1][1]
    return zt, xs_, rh


def _boss_sec(a):
    """Сечение обтекателя оси утки плоскостью a (справа): полоса вдоль оси с толщиной по профилю."""
    T = CAN; a0, a1 = T['a_le'] - 0.08, T['a_te'] + 0.12
    if not (a0 < a < a1): return []
    t = (a - a0) / (a1 - a0); prof = [(0.0, 0.0), (0.18, 0.75), (0.5, 1.0), (0.8, 0.8), (1.0, 0.0)]
    f = next(f0 + (f1 - f0) * (t - t0) / (t1 - t0) for (t0, f0), (t1, f1) in zip(prof, prof[1:]) if t0 <= t <= t1); hh = f * 0.07
    U = (CAN_U.x, CAN_U.z); Nn = (-CAN_U.z, CAN_U.x); P = lambda s, h: (CAN['x0'] + U[0] * s + Nn[0] * h, CAN['y0'] + U[1] * s + Nn[1] * h)
    se = CAN_GAP - 0.003
    return [P(-0.34, hh), P(se, hh), P(se, -hh), P(-0.34, -hh)] if hh > 0.002 else []


def sh_ring(a, sx, tr=None, hb=None):
    """Кольцо плеча (|x|, z) от выреза фонаря (|x| = 0.75) через ребро, потолок над выходом щели, стенку щели и уход в корпус."""
    tr = tr or raw_tree(); w = _sh_w(a)
    zs = [0.50 + 0.005 * k for k in range(67)]; xs = [_raw_side(tr, a, z, sx) for z in zs]
    zc = max((z for z, x in zip(zs, xs) if x is not None and 0.58 <= z <= 0.78), key=lambda z: xs[zs.index(z)]); xc = xs[zs.index(zc)]
    xd = xc - 0.06; deck = []
    for k in range(25):
        x = 0.75 + (xd - 0.75) * k / 24; z = _raw_top(tr, a, x, sx); deck.append((x, z if z is not None else deck[-1][1]))
    side = []
    for z, x in sorted(zip(zs, xs), reverse=True):
        if x is None or z >= deck[-1][1] - 0.004 or x < xd: continue
        if z < zc and (x < xc - 0.035 or x > xc + 0.006): break
        side.append((x, z))
    up = _resample(deck, 14); sd = _resample([deck[-1]] + side, 15)[1:]
    if a > SH_BL:      # к заднему краю верх и ребро сходятся к своему корпусу (сечение без обтекателя): лучами из одной точки, профиль не складывается
        wh = _sm((a - SH_BL) / (SH_A1 - SH_BL)); hp = _hull_sec(a)[2]; C = (0.80, 0.45); bl = []
        hp = list(zip(hp, hp[1:]))
        for x, z in up + sd:
            dx, dz = x - C[0], z - C[1]; r = math.hypot(dx, dz); ux, uz = dx / r, dz / r; best = None
            for (x0, z0), (x1, z1) in hp:
                ex, ez = x1 - x0, z1 - z0; den = ux * ez - uz * ex
                if abs(den) < 1e-9: continue
                tt = ((x0 - C[0]) * ez - (z0 - C[1]) * ex) / den; uu = ((x0 - C[0]) * uz - (z0 - C[1]) * ux) / den
                if tt > 0 and 0 <= uu <= 1 and (best is None or tt > best): best = tt
            if best is not None and abs(best - r) < 0.12: r = r + (best - r) * wh
            bl.append((C[0] + ux * r, C[1] + uz * r))
        up, sd = bl[:len(up)], bl[len(up):]
    if CAN['a_le'] - 0.20 < a < CAN['a_tte'] + 0.10:      # под корнем утки ребро не выходит за плоскость её корня (утка ходит ±10° без касаний)
        Ux, Uz = CAN_U.x, CAN_U.z; smax = CAN_GAP - 0.006; cl_ = []
        for x, z in up + sd:
            sp = (x - CAN['x0']) * Ux + (z - CAN['y0']) * Uz; hp_ = abs(-(x - CAN['x0']) * Uz + (z - CAN['y0']) * Ux)
            if sp > smax and hp_ < 0.20: x, z = x - (sp - smax) * Ux, z - (sp - smax) * Uz
            cl_.append((x, z))
        up, sd = cl_[:len(up)], cl_[len(up):]
    B_ = sd[-1]; tw0 = SH_WALL_T[0]; tw1 = sh_tin(a); sw = lambda t: slot_top(a) + 0.003
    W = _xz(sw(tw0), tw0); U2 = (0.842, 0.539)
    bpc = (box_pts(a) if a >= 5.27 else inl_pts(LIP_A, -0.060, 1)[0])[15]      # наружный верхний угол обечайки
    dxc, dzc = bpc[0] - _ICX, bpc[1] - _ICY; dc = math.hypot(dxc, dzc); C_ = (bpc[0] + dxc / dc * 0.010, bpc[1] + dzc / dc * 0.010)
    if C_[1] < W[1] - 0.06 and C_[0] < B_[0]:      # плечо продлено: наружная сторона ребра плавно сходит к углу обечайки, оттуда - торец щели вверх к её стенке (слова Mark: продлить естественно, без листов)
        P1 = (B_[0], B_[1] - 0.09); P2 = (C_[0] + 0.07, C_[1] + 0.05); cl = []
        for k in range(1, 7):
            u = k / 6; c = [(1 - u) ** 3, 3 * (1 - u) ** 2 * u, 3 * (1 - u) * u * u, u ** 3]
            cl.append((c[0] * B_[0] + c[1] * P1[0] + c[2] * P2[0] + c[3] * C_[0], c[0] * B_[1] + c[1] * P1[1] + c[2] * P2[1] + c[3] * C_[1]))
        cl += [(C_[0] + (W[0] - C_[0]) * 0.5, C_[1] + (W[1] - C_[1]) * 0.5), W]
    else:
        P1 = (B_[0] - 0.07, B_[1] - 0.005); P2 = (W[0] + U2[0] * 0.07, W[1] + U2[1] * 0.07); cl = []
        for k in range(1, 9):
            u = k / 8; c = [(1 - u) ** 3, 3 * (1 - u) ** 2 * u, 3 * (1 - u) * u * u, u ** 3]
            cl.append((c[0] * B_[0] + c[1] * P1[0] + c[2] * P2[0] + c[3] * W[0], c[0] * B_[1] + c[1] * P1[1] + c[2] * P2[1] + c[3] * W[1]))
    wl = [_xz(sw(tw0 + (tw1 - tw0) * k / 13), tw0 + (tw1 - tw0) * k / 13) for k in range(1, 14)]
    low = cl + wl
    if w < 0.999:      # спереди нижняя часть сходится к обшивке образца: стык без ступени
        s3 = _raw_band2(a, 0.30); se = _raw_band2(a, SH_TRM); lo2 = []
        se = se if (se is not None and -0.10 < se < 0.10) else -0.02; s3 = s3 if s3 is not None else se
        for x, z in low:
            s_, t_ = _st(x, z)
            sr = _raw_band2(a, t_)      # точно по сечению образца: стык без прорези
            if sr is None: sr = s_ if t_ >= 0.30 else se + (s3 - se) * max(0.0, (t_ - SH_TRM) / (0.30 - SH_TRM))
            lo2.append(_xz(sr + (s_ - sr) * w, t_))
        low = lo2
    if a > SH_BL:      # и низ плеча к заднему краю сходится к корпусу с обечайкой: шов за корнем утки без вмятин (слова Mark)
        wh = _sm((a - SH_BL) / (SH_A1 - SH_BL)); hp = _hull_sec(a)[2]; bx = box_pts(a); segs = list(zip(hp, hp[1:])) + list(zip(bx, bx[1:] + bx[:1])); C = (0.80, 0.45); bl = []
        for x, z in low:
            dx, dz = x - C[0], z - C[1]; r = math.hypot(dx, dz)
            if r < 1e-6: bl.append((x, z)); continue
            ux, uz = dx / r, dz / r; best = None
            for (x0, z0), (x1, z1) in segs:
                ex, ez = x1 - x0, z1 - z0; den = ux * ez - uz * ex
                if abs(den) < 1e-9: continue
                tt = ((x0 - C[0]) * ez - (z0 - C[1]) * ex) / den; uu = ((x0 - C[0]) * uz - (z0 - C[1]) * ux) / den
                if tt > 0 and 0 <= uu <= 1 and (best is None or tt > best): best = tt
            if best is not None and abs(best - r) < 0.15: r = r + (best - r) * wh
            bl.append((C[0] + ux * r, C[1] + uz * r))
        low = bl
    s_e, t_e = _st(*low[-1]); sr = _raw_band2(a, SH_TRM)
    ramp = _xz(sr if (sr is not None and -0.10 < sr < 0.10) else -0.02, SH_TRM)      # перед кромкой - скат к щеке образца (закрытый конец щели)
    bury = _xz(s_e + 0.08, t_e - 0.04); u = _sm((a - 5.00) / 0.15)
    end = (ramp[0] + (bury[0] - ramp[0]) * u, ramp[1] + (bury[1] - ramp[1]) * u)
    return up + sd + low + [end]


def sh_rings(sx, host=None):
    tr = raw_tree(); st = stations(SH_A0, SH_A1, 0.04); R = [sh_ring(a, sx, tr) for a in st]
    for _ in range(2):      # сглаживание вдоль: без ряби замеров; края (стыки) на месте
        R = [R[0]] + [[((R[i - 1][j][0] + 2 * R[i][j][0] + R[i + 1][j][0]) / 4, (R[i - 1][j][1] + 2 * R[i][j][1] + R[i + 1][j][1]) / 4) for j in range(len(R[i]))] for i in range(1, len(R) - 1)] + [R[-1]]
    for r in R: r[0] = (0.75, r[0][1])
    return st, R


def shoulder(sx, host=None):
    st, R = sh_rings(sx, host)
    C_ = (0.55, 0.45); r0 = []; r1 = []
    for x, z in R[0]:      # передний край: заход под образец на 3 см (4 мм внутрь) и сам край на 2 мм под образцом - тени и щёлочек шва нет
        dx, dz = C_[0] - x, C_[1] - z; d = max(math.hypot(dx, dz), 1e-6)
        r0.append((x + dx / d * 0.004, z + dz / d * 0.004)); r1.append((x + dx / d * 0.002, z + dz / d * 0.002))
    st = [st[0] - 0.03] + st; R = [r0, r1] + R[1:]
    rs = [[P3(a, sx * x, z) for x, z in r] for a, r in zip(st, R)]
    b = B(); strip(b, rs, G_SKIN); ob = b.finish('RF_front_sh_' + ('r' if sx > 0 else 'l'), sharp_deg=75)
    me = ob.data; me.update(); c = me.polygons[len(me.polygons) // 2]      # нормали наружу: грань верха смотрит вверх
    if me.polygons[0].normal.z < 0: me.flip_normals()
    for f in me.polygons: f.use_smooth = True
    return ob


def skirt(sx):
    """Юбка под ребром плеча: от низа ребра до верхнего наружного угла обечайки - корпус под ребром не торчит языками (слова Mark: куски в тени над заборником)."""
    st, R = sh_rings(sx); rs = []
    for a, r in zip(st, R):
        if a < 5.14: continue
        B_ = r[27]; bp = box_pts(a) if a >= 5.27 else inl_pts(LIP_A, -0.060, 1)[0]
        C = bp[15]; dx, dz = C[0] - _ICX, C[1] - _ICY; d = math.hypot(dx, dz); Co = (C[0] + dx / d * 0.012, C[1] + dz / d * 0.012); Ci = (C[0] - dx / d * 0.03, C[1] - dz / d * 0.03)
        M = (max(B_[0], Co[0]) + 0.01, (B_[1] + Co[1]) / 2)
        pts = [B_] + [((1 - u) ** 2 * B_[0] + 2 * u * (1 - u) * M[0] + u * u * Co[0], (1 - u) ** 2 * B_[1] + 2 * u * (1 - u) * M[1] + u * u * Co[1]) for u in (0.25, 0.5, 0.75, 1.0)] + [Ci]
        rs.append([P3(a, sx * x, z) for x, z in pts])
    b = B(); strip(b, rs, G_SKIN); ob = b.finish('RF_front_sk_' + ('r' if sx > 0 else 'l'), sharp_deg=75)
    me = ob.data; me.update()
    c = me.polygons[0]; out = Vector((sx, 0, -0.3))
    if c.normal.dot(out) < 0: me.flip_normals()
    for f in me.polygons: f.use_smooth = True
    return ob


def crest_cut(sx):
    """Под ребром плеча - воздух до обечайки: языки корпуса срезаются ровной стенкой |x| = 1.00, сверху - по низу ребра (слова Mark: обрезать и сгладить, пространство не перекрывать)."""
    st, R = sh_rings(sx); rs = []
    bp = box_pts(5.6); q = []
    for i in (13, 14, 15):
        x, z = bp[i]; dx, dz = x - _ICX, z - _ICY; d = math.hypot(dx, dz); q.append((x + dx / d * 0.015, z + dz / d * 0.015))
    for a, r in zip(st, R):
        if a < 5.14 or a > 6.30: continue      # у заднего края плеча корпус не режется: там плечо сходится к нему
        B_ = r[27]; W_ = r[35]
        poly = [(1.00, W_[1] + 0.012), (1.65, B_[1] + 0.012), (1.65, q[0][1]), q[0], q[1], (max(q[2][0], 1.005), q[2][1])]
        rs.append([P3(a, sx * x, z) for x, z in poly])
    return loft_obj('c_crest', rs, G_SKIN, sharp=30)


def shoulder_cut(sx):
    """Вырез корпуса под своим плечом: щель 8 см, перед кромкой до самой обшивки, под ребром - выход щели. Чуть глубже плеча - срезы корпуса под ним не видны."""
    tr = raw_tree(); rs = []
    for a in sorted(set([round(q, 4) for q in stations(5.00, 6.50, 0.05)] + [5.115, 5.124, 5.126, 5.135, 5.16, 5.19])):
        sw = slot_top(a) + 0.014 if a < SH_A1 else slot_top(a)
        r = sh_ring(min(a, SH_A1), sx, tr) if a <= SH_A1 + 1e-6 else None
        sB, tB = _st(*r[27]) if r else (0.06, 0.80)
        k = 0.0 if a < 5.125 else 1.0      # перед кромкой - всё под стенкой (там воздух перед проёмом), за передним краем кромки - щель над обечайкой
        fl = -0.02 if a < 5.125 else 0.016 + 0.040 * _sm((a - 5.13) / 0.10)      # перед кромкой неглубоко (глубже вскрывался корпус у угла проёма - тёмный клин), за носом кромки - под ней
        fo = -0.40 + 0.42 * k; t0 = (SH_TRM - 0.012) if a < 5.0 else sh_tin(a) + (SH_TRM - 0.012 - sh_tin(a)) * (1 - _sm((a - 5.0) / 0.125))      # стенка выреза за скатом у фюзеляжа - не видна
        tb = max(0.86, min(tB, 1.10)) if a < 6.20 else 0.86
        dS = lambda t: ((_sq(0.05 + 0.539 * t) - (0.05 + 0.539 * t)) * 0.842 - (_nx(0.40 + 0.842 * t) - (0.40 + 0.842 * t)) * 0.539) if k > 0 else 0.0      # пол щели идёт за верхом кромки (ниже и уже)
        f8 = fl + dS(0.78); poly = [(fl + dS(t0), t0), (f8, 0.78), (f8 + 0.002, 0.80), (f8 + 0.004, 0.805), (sw - 0.004, 0.805), (sw, 0.80), (sw, t0)]      # щель кончается у наружного угла кромки: под ребром корпус не режется (зубцы)
        rs.append([P3(a, sx * _xz(s, t)[0], _xz(s, t)[1]) for s, t in poly])
    return loft_obj('c_gap', rs, G_SKIN, sharp=30)      # грани щели цвета обшивки: углубление в корпусе, а не чёрный провал (слова Mark: дырка над заборником)


def ref_front():
    """Нос, заборники с кромками и передний корпус из образца: обрезка, перевод в наши оси, свой материал. Возвращает список объектов."""
    import modelkit as mk
    before = set(bpy.data.objects); mats0 = set(bpy.data.materials); imgs0 = set(bpy.data.images)
    bpy.ops.import_scene.gltf(filepath=REF_GLB)
    new = [o for o in bpy.data.objects if o not in before]; out = []
    for nm, keep in (('Object_30', lambda a, x, z: a < A_CUT and abs(x) < 1.78 and z > -0.56 and not (2.50 < a < 6.45 and abs(x) < CAN_T[1](min(a, 6.20)) + 0.07 and z > SILL(min(a, 6.20)) - 0.035) and not (2.95 < a < 6.25 and abs(x) < CK_HW(min(a, 6.19)) + 0.012 and z > 0.20) and not (6.10 < a < A_CUT and abs(x) < TOPCUT_X(a) and z > 0.70) and not (NDOOR['a0'] - 0.01 < a < NDOOR['a1'] + 0.01 and abs(x) < NDOOR['hw'] + 0.008 and z < 0.05) and not (a > ROOT_CUT_A and abs(x) > ROOT_CUT_X and z > ROOT_CUT_Z) and not (a > 5.05 and abs(x) < 0.60 and z < -0.10) and not (a > FAIR_A and abs(x) > FAIR_X and z < (0.62 if (a < 6.20 and abs(x) > 1.10) else FAIR_Z)) and not (SH_A0 < a < A_CUT and abs(x) > 0.75 and z > 0.40) and not (SH_A0 < a < SH_A1 and ( (-0.15 < _st(x, z)[0] < 0.28 and SH_TRM < _st(x, z)[1] < 1.25)))),
                     ('Object_31', lambda a, x, z: a < 2.15 and abs(x) < 0.5 and z < 0.72)):
        src = next((o for o in new if o.type == 'MESH' and o.name.startswith(nm)), None)
        if src is None: print('нет', nm); continue
        sme = src.data; cn = [Vector(c.vector) for c in sme.corner_normals]
        att = sme.attributes.new('cn_tmp', 'FLOAT_VECTOR', 'CORNER')
        R3 = src.matrix_world.to_3x3()
        for i, c in enumerate(cn): att.data[i].vector = (R3 @ c).normalized()
        bm = bmesh.new(); bm.from_mesh(sme); bm.transform(src.matrix_world); lay = bm.loops.layers.float_vector['cn_tmp']
        for v in bm.verts: v.co = Vector(((v.co.y - REF_YC) * REF_K, L / 2 - v.co.x * REF_K, (v.co.z - REF_TZ) * REF_K))
        for f in bm.faces:
            for lp in f.loops: c = lp[lay]; lp[lay] = Vector((c.y, -c.x, c.z))       # родные нормали образца в наших осях
        if nm == 'Object_30':      # ровный край выреза: режем плоскостями до удаления граней (иначе край зубцами)
            for co, no in (((0.75, 0, 0), (1, 0, 0)), ((-0.75, 0, 0), (1, 0, 0)), ((0, L / 2 - A_CUT, 0), (0, 1, 0)), ((ROOT_CUT_X, 0, 0), (1, 0, 0)), ((-ROOT_CUT_X, 0, 0), (1, 0, 0)), ((0, L / 2 - ROOT_CUT_A, 0), (0, 1, 0)), ((0, 0, ROOT_CUT_Z), (0, 0, 1)), ((FAIR_X, 0, 0), (1, 0, 0)), ((-FAIR_X, 0, 0), (1, 0, 0)), ((0, L / 2 - FAIR_A, 0), (0, 1, 0)), ((0, 0, FAIR_Z), (0, 0, 1)), ((0, L / 2 - 4.98, 0), (0, 1, 0)), ((0, L / 2 - 5.10, 0), (0, 1, 0)), ((0.30, 0, 0), (1, 0, 0)), ((-0.30, 0, 0), (1, 0, 0)),      # ровный край низа у внутренней стенки заборника (слова Mark: лист зубцами)
                ((NDOOR['hw'] + 0.008, 0, 0), (1, 0, 0)), ((-(NDOOR['hw'] + 0.008), 0, 0), (1, 0, 0)), ((0, L / 2 - (NDOOR['a0'] - 0.01), 0), (0, 1, 0)), ((0, L / 2 - (NDOOR['a1'] + 0.01), 0), (0, 1, 0)),      # ровный край проёма створок носовой стойки (зубцы)
                ((0.40 - 0.539 * 0.16, 0, 0.05 + 0.842 * 0.16), (-0.539, 0, 0.842)), ((-(0.40 - 0.539 * 0.16), 0, 0.05 + 0.842 * 0.16), (0.539, 0, 0.842)), ((0, L / 2 - 5.08, 0), (0, 1, 0)), ((0, L / 2 - 5.10, 0), (0, 1, 0)), ((0, 0, -0.10), (0, 0, 1)), ((0, L / 2 - 5.05, 0), (0, 1, 0)), ((0.60, 0, 0), (1, 0, 0)), ((-0.60, 0, 0), (1, 0, 0)), ((0, 0, 0.62), (0, 0, 1)), ((0, L / 2 - 6.20, 0), (0, 1, 0)), ((1.10, 0, 0), (1, 0, 0)), ((-1.10, 0, 0), (1, 0, 0)), ((0, L / 2 - SH_A0, 0), (0, 1, 0)), ((0, L / 2 - SH_A1, 0), (0, 1, 0)), ((0, 0, 0.40), (0, 0, 1))) + tuple(((sx * _xz(s0, t0)[0], 0, _xz(s0, t0)[1]), (sx * nx, 0, nz)) for sx in (1, -1) for s0, t0, nx, nz in ((-0.15, 0.3, -0.539, 0.842), (0.28, 0.3, -0.539, 0.842), (0.0, SH_TRM, 0.842, 0.539))):
                bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)
        kill = []; dark = set()
        for f in bm.faces:
            c = f.calc_center_median(); nrm = sum((lp[lay] for lp in f.loops), Vector()).normalized()
            if not keep(L / 2 - c.y, c.x, c.z): kill.append(f)
            elif nm == 'Object_30' and _duct_wall(L / 2 - c.y, c.x, c.z, nrm): dark.add(f)
            elif nm == 'Object_30' and _inner_mask(L / 2 - c.y, c.x, c.z, nrm): dark.add(f)      # лист кромки у борта и осколки за ним - тёмные, читаются щелью (слова Mark)      # стенки канала не режем (рваный край), а красим тёмным
        bmesh.ops.delete(bm, geom=kill, context='FACES')
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0006)
        bm.normal_update(); n0 = {f: f.normal.copy() for f in bm.faces}
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.normal_update(); nfl = 0     # у образца часть обшивки смотрит внутрь (материал двусторонний)
        for f in bm.faces:
            f.material_index = G_COCK if f in dark else G_SKIN; f.smooth = True
            if f.normal.dot(n0[f]) < 0:
                nfl += 1
                for lp in f.loops: lp[lay] = -lp[lay]
        print(nm, 'развёрнуто наружу граней:', nfl, 'из', len(bm.faces))
        if nm == 'Object_30':      # осколки у кромки заборника и в начале канала - тёмные; тонкое кольцо кромки остаётся цветом обшивки (слова Mark)
            bm.normal_update(); tr_ = BVHTree.FromBMesh(bm); nd = 0
            for f in bm.faces:
                c = f.calc_center_median(); a_ = L / 2 - c.y
                if not (4.95 < a_ < 6.0): continue
                if f.material_index == G_COCK:      # тонкое кольцо кромки у входа - всегда цветом обшивки (иначе светлая кромка обрывается у борта)
                    if a_ < LIP_A + 0.12:
                        hit = tr_.ray_cast(c - f.normal * 0.002, -f.normal, 0.035)
                        if hit[0] is not None and hit[1].dot(f.normal) < -0.3: f.material_index = G_SKIN
                    continue
                s_ = (abs(c.x) - _GP0[0]) * _GN.x + (c.z - _GP0[1]) * _GN.y; t_ = (abs(c.x) - _GP0[0]) * _GU.x + (c.z - _GP0[1]) * _GU.y
                band = -0.04 < s_ < 0.16 and -0.08 < t_ < 0.85
                inside = a_ > LIP_A - 0.02 and _pip(abs(c.x), c.z, inl_pts(max(a_, LIP_A), 0.012, 1)[0])
                if not (band or inside): continue
                hit = tr_.ray_cast(c - f.normal * 0.002, -f.normal, 0.035)
                thin = hit[0] is not None and hit[1].dot(f.normal) < -0.3
                if thin and (not inside or a_ < LIP_A + 0.12): continue
                f.material_index = G_COCK; nd += 1
            print('осколков у кромки затемнено:', nd)
            kill3 = []      # только верхний конец косой планки над обечайкой укорачивается (слова Mark)
            for f in bm.faces:
                c = f.calc_center_median(); a_ = L / 2 - c.y
                if not (4.85 < a_ < 5.45) or abs(c.x) < 0.95 or c.z < 0.38 or c.z > 0.75: continue
                if _pip(abs(c.x), c.z, inl_pts(LIP_A, -0.065, 1)[0]): continue
                hit = tr_.ray_cast(c - f.normal * 0.002, -f.normal, 0.035)
                if hit[0] is not None and hit[1].dot(f.normal) < -0.3: kill3.append(f)
            bmesh.ops.delete(bm, geom=kill3, context='FACES'); print('конец планки укорочен, граней:', len(kill3))
            big = inl_pts(LIP_A, -0.12, 1, sq=False, nx=False)[0];      # заборник образца - в исходном размере
            mo = inl_pts(5.20, -0.02, 1, sq=False)[0]; kill4 = []      # весь заборник образца убран: кромка, стенки, планки - свои (слова Mark)
            for f in bm.faces:
                c = f.calc_center_median(); a_ = L / 2 - c.y
                if 5.085 < a_ < 5.10 and _pip(abs(c.x), c.z, mo): kill4.append(f); continue      # перед проёмом - воздух (как у корпуса, mouth_cut)
                if a_ < 5.10 or abs(c.x) < 0.30 or c.z > 0.66: continue      # перед носом кромки щека образца остаётся (иначе виден свой корпус - брусок у угла)
                s_ = (abs(c.x) - _GP0[0]) * _GN.x + (c.z - _GP0[1]) * _GN.y; t_ = (abs(c.x) - _GP0[0]) * _GU.x + (c.z - _GP0[1]) * _GU.y
                if _pip(abs(c.x), c.z, big) or (a_ > 5.08 and -0.05 < s_ < 0.16 and -0.12 < t_ < 0.95): kill4.append(f)     # над планкой - только за кромкой
            bmesh.ops.delete(bm, geom=kill4, context='FACES'); print('заборник образца убран, граней:', len(kill4))
            seen = set(); isl = []      # мелкие оторванные островки образца у заборника (лоскутки у угла проёма) - целиком
            for f0 in bm.faces:
                if f0 in seen: continue
                grp = [f0]; seen.add(f0); i_ = 0
                while i_ < len(grp):
                    for e in grp[i_].edges:
                        for f1 in e.link_faces:
                            if f1 not in seen: seen.add(f1); grp.append(f1)
                    i_ += 1
                ar = sum(f.calc_area() for f in grp); c_ = sum((f.calc_center_median() for f in grp), Vector()) / len(grp)
                if ar < 0.006 and 4.6 < L / 2 - c_.y < 6.6: isl += grp
            bmesh.ops.delete(bm, geom=isl, context='FACES'); print('островков образца убрано, граней:', len(isl))
        for e in bm.edges: e.smooth = True
        if nm == 'Object_30':      # плечо и борт за заборником: крупные треугольники образца - нормали сглаживаются по геометрии (рваность в тени)
            bm.normal_update(); ns = 0
            for v in bm.verts:
                a_ = L / 2 - v.co.y
                if (5.15 < a_ < A_CUT + 0.1 and abs(v.co.x) > 0.90 and v.co.z > -0.05) or (SH_A0 - 0.10 < a_ < SH_A0 + 0.01 and abs(v.co.x) > 0.30 and -0.15 < v.co.z < 0.80):      # и у переднего шва плеча (тёмные полоски)
                    for lp in v.link_loops: lp[lay] = v.normal.copy()
                    ns += 1
            print('сглажено вершин на плече:', ns)
        name = 'RF_front' if nm == 'Object_30' else 'RF_nose'
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        cl = [Vector(d.vector) for d in me.attributes['cn_tmp'].data]; me.attributes.remove(me.attributes['cn_tmp'])
        me.normals_split_custom_set(cl)
        for m in mk.MATS: me.materials.append(m)
        ob = bpy.data.objects.new(name, me); mk.col.objects.link(ob); out.append(ob)
    for o in new:
        me = o.data if o.type == 'MESH' else None; bpy.data.objects.remove(o)
        if me is not None and me.users == 0: bpy.data.meshes.remove(me)
    for m in [m for m in bpy.data.materials if m not in mats0]: bpy.data.materials.remove(m)
    for i in [i for i in bpy.data.images if i not in imgs0]: bpy.data.images.remove(i)
    return out


def build_skin():
    S = [hull(), spine(), tail_cone(), fin(), fin_fair(), nacelle(1), nacelle(-1), wing_s(1), wing_s(-1), tip_rail(1), tip_rail(-1), canard_boss(1), canard_boss(-1), inlet_box(1, 5.27), inlet_box(-1, 5.27)]     # стенка щели gap_wall убрана: верх щели - своё плечо (её торец торчал пластиной у угла проёма)     # заборники и наплыв - из образца; обечайка только за ним
    host = S[0]
    for o in S[1:]:
        _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        c = duct_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    for sx in (1, -1):
        c = bore_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = cock_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    S2 = ref_front(); SH = [shoulder(1), shoulder(-1)]
    snap_under_ref(host, S2, extra=SH, extra_in=lambda a, x, z: SH_A0 - 0.05 < a < SH_A1 and (abs(x) > 0.62 or -0.10 < _st(x, z)[0] < 0.40)); S2 += SH
    for sx in (1, -1):      # вырез под плечом - после прижима: срезы ложатся на уже прижатый корпус, без растянутых граней
        c = shoulder_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
        c = mouth_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
        c = crest_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    S2 += [duct_tube(1), duct_tube(-1), lip_ring(1), lip_ring(-1)]
    host.name = 'RF_skin'; host.data.name = 'RF_skin'; bvh_ready(host); EXTRA[:] = S2; return host


def plane(stage=9, carve=True):
    """Этапы: 1 - обшивка; 2 - рули, сопла, утки; 3 - кабина, фонарь, пилоны, детали; 4 - шасси и створки."""
    import rafale_detail as d
    PARTS.clear(); PYLON_PTS.clear()
    import types
    skin = build_skin(); out = [skin] + EXTRA; ref_me = skin.data.copy(); d.resharp(types.SimpleNamespace(data=ref_me))
    if stage >= 2:
        out += [rudder(), canard(1), canard(-1), nozzle(1), nozzle(-1), d.burner(1), d.burner(-1)]
        for sx, n in ((1, 'r'), (-1, 'l')):
            out += [wing_part('elevon_i_' + n, FLAP_I, sx, 'внутренний элевон, ось по передней кромке; плюс - вниз', (-25.0, 22.0)), wing_part('elevon_o_' + n, FLAP_O, sx, 'внешний элевон, ось по передней кромке; плюс - вниз', (-25.0, 25.0)), slat('slat_i_' + n, SLAT_I, sx), slat('slat_o_' + n, SLAT_O, sx)]
    if stage >= 3:
        out += [d.cockpit_detail()] + canopy() + windscreen()
        _fr = next(o for o in EXTRA if o.name.startswith('RF_front')); out += [sill_fill(1, _fr), sill_fill(-1, _fr)]
        # штанга дозаправки убрана (слова Mark 2026-11-08)
        bvh_ready(skin)
        for sx in (1, -1):
            for tag, x, a0, a1, y0 in PYLON_DEF: out.append(pylon(sx, tag, x, a0, a1, y0))
            out.append(side_rail(sx))
        out += [pod_mount(), d.details(), d.seals()] + d.hardpoints() + [d.plates()]
    if stage >= 4:
        out += doors()
        import rafale_gear as gr; out += gr.gear_nose() + gr.gear_main(1) + gr.gear_main(-1)
    if carve: print('канавок и выемок:', d.carve(skin))
    if stage >= 4: gear_bays(skin)
    d.resharp(skin); print('нормали обшивки:', d.smooth_normals(skin, ref_me)); bpy.data.meshes.remove(ref_me)
    hide_under_ref(skin, EXTRA)
    fr = [o for o in EXTRA if o.name.startswith('RF_front')] + [skin]
    # накладка на борту больше не нужна: стенка заборника своя
    return out
