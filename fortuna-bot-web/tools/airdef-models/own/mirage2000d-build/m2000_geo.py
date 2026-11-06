# m2000_geo.py - геометрия Mirage 2000D для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z.
# a - расстояние от острия носа, y - высота над осью корпуса. Профиль снят с m2000_08, план с m2000_04, кабина на двоих с m2000_05, 07.
import math
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 14.36
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


NAC_A1 = 13.80; NOZ_X = 0.0; NOZ_Y = 0.02; NOZ_A = 14.36; NOZ_R = 0.50; NOZ_K = 0.585 / 0.425


def bore_cut(sx):
    a1 = NAC_A1; cx = sx * NOZ_X; n = 56
    ring = lambda a, r: [P3(a, cx + NOZ_K * r * math.sin(2 * math.pi * k / n), NOZ_Y - NOZ_K * r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    prof = [(a1 + 0.25, 0.400, G_METAL), (a1 - 0.18, 0.400, G_METAL), (a1 - 0.22, 0.375, G_METAL), (a1 - 0.30, 0.375, G_METAL), (a1 - 0.34, 0.400, G_METAL), (a1 - 0.80, 0.405, G_COCK), (a1 - 1.10, 0.405, G_DARK), (a1 - 1.50, 0.260, G_DARK), (a1 - 1.62, 0.040, G_DARK)]
    b = B(); b.loft([ring(a, r) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK)
    return b.finish('c_bore', sharp_deg=30)


def nozzle(sx):
    b = B(); cx = sx * NOZ_X; N = 16; a0 = NAC_A1 + 0.002; a1 = NOZ_A; aM = a0 + 0.120; aP = a0 + 0.125
    def ptp(a, r, ang): return P3(a, cx + r * math.sin(ang), NOZ_Y - r * math.cos(ang))
    ring = lambda a, r, nn=56: [ptp(a, r, 2 * math.pi * k / nn) for k in range(nn)]
    def box_sect(a, r, ang, hw_ang, th): return [ptp(a, r, ang - hw_ang), ptp(a, r, ang + hw_ang), ptp(a, r + th, ang + hw_ang), ptp(a, r + th, ang - hw_ang)]
    R0 = 0.585
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
        b.loft([box_sect(a1 - 0.002, NOZ_R - th - 0.003, am, hwi, -0.006), box_sect(a1 - 0.30, 0.46, am, hwi, -0.006), box_sect(a0 + 0.03, 0.548, am, hwi, -0.006)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('nozzle', sharp_deg=30)



# ── корпус: одно тело от носа до сопла ──
HULL = [  # a, верх, низ, полуширина, nверх, nниз. Профиль снят с m2000_08 (самолёт стоит ровно), ширина с m2000_04
    (0.00, 0.006, -0.006, 0.006, 2.0, 2.0), (0.40, 0.085, -0.065, 0.085, 2.0, 2.0), (1.00, 0.235, -0.147, 0.205, 2.0, 2.0), (1.40, 0.330, -0.200, 0.275, 2.0, 2.0), (1.95, 0.450, -0.275, 0.365, 2.0, 2.0), (2.65, 0.600, -0.370, 0.470, 2.0, 2.0),
    (3.70, 0.820, -0.430, 0.580, 2.2, 2.2), (4.70, 0.920, -0.460, 0.620, 2.2, 2.3), (5.60, 0.970, -0.520, 0.700, 2.2, 2.5), (6.20, 0.980, -0.555, 0.740, 2.2, 2.7), (6.90, 0.900, -0.585, 0.770, 2.3, 2.9), (8.00, 0.840, -0.620, 0.820, 2.4, 3.0), (9.50, 0.790, -0.640, 0.900, 2.6, 3.0), (11.00, 0.740, -0.650, 0.940, 2.6, 3.0), (12.00, 0.700, -0.640, 0.900, 2.5, 2.8), (13.00, 0.660, -0.610, 0.740, 2.2, 2.4), (13.80, 0.622, -0.582, 0.602, 2.0, 2.0)]
HT = tracks(HULL)


def hull_ring(a, n=96):
    top, bot, hw, nt, nb = [t(a) for t in HT]; return sup(a, 0.0, top, bot, hw, nt, nb, n)


def hull(): return loft_obj('s_hull', [hull_ring(a) for a in stations(0.0, 2.65, 0.15)[:-1] + stations(2.65, NAC_A1, 0.22)], G_SKIN, sharp=38)


def top_y(a, x):
    """Высота верха корпуса над |x| (для порога фонаря)."""
    top, bot, hw, nt, nb = [t(a) for t in HT]; cy = (top + bot) / 2; ht = (top - bot) / 2; q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nt); return cy + ht * q ** (1 / nt)


def spine():
    """Спина за фонарём: верх идёт прямой от конца фонаря к килю (m2000_05, 07, 08)."""
    Z = lambda a: 1.03 - 0.071 * (a - 6.72)
    W_ = Track([(6.76, 0.340), (7.6, 0.380), (9.0, 0.320), (10.0, 0.240), (10.8, 0.080)]); H_ = Track([(6.76, 0.48), (9.0, 0.40), (10.8, 0.24)])
    NS = lambda a: 3.0 - 0.8 * min(1.0, max(0.0, (a - 6.76) / 1.0))
    return loft_obj('s_spine', [sup(a, 0.0, Z(a), Z(a) - 2 * H_(a), W_(a), NS(a), 2.3, 48) for a in stations(6.76, 10.8, 0.24)], G_SKIN, sharp=40)


# ── заборники: полукруглые на бортах, утолщение идёт назад и уходит в корпус ──
INL_A = 4.72; DUCT_X = 0.62; DUCT_Z = 0.10; DUCT_R = (0.34, 0.33)    # плоская сторона у корпуса, полукруг наружу
CH = tracks([(4.72, 0.66, 0.10, 0.33, 0.37), (5.4, 0.66, 0.09, 0.37, 0.41), (6.4, 0.64, 0.05, 0.41, 0.47), (7.6, 0.60, 0.00, 0.43, 0.52), (9.0, 0.56, -0.06, 0.41, 0.50), (10.5, 0.50, -0.10, 0.36, 0.42), (11.8, 0.44, -0.12, 0.24, 0.30), (12.6, 0.36, -0.12, 0.03, 0.05)])


def cheek(sx):
    def ring(a):
        cx, cz, rx, rz = [t(a) for t in CH]; return sup(a, sx * cx, cz + rz, cz - rz, rx, 2.3, 2.3, 72)
    return loft_obj('s_cheek_' + ('r' if sx > 0 else 'l'), [ring(a) for a in stations(4.72, 12.6, 0.24)], G_SKIN, sharp=40)


def half_ring(a, sx, xi, zc, rx, rz, n=40):
    """Полукруг наружу от плоской стороны у корпуса."""
    pts = [P3(a, sx * (xi + rx * math.sin(math.pi * k / n)), zc - rz * math.cos(math.pi * k / n)) for k in range(n + 1)]
    return pts + [P3(a, sx * xi, zc + rz * (1 - 2 * j / 8)) for j in range(1, 8)]


def duct_cut(sx):
    """Канал вглубь, глухой торец: плавно темнеет, колец и полос нет."""
    a0, a1 = 4.50, 7.40; rings = []
    for i in range(11):
        a = a0 + (a1 - a0) * i / 10; t = max(0.0, min(1.0, (a - 5.2) / (a1 - 5.2))); t = t * t * (3 - 2 * t); rings.append(half_ring(a, sx, DUCT_X, DUCT_Z - 0.04 * t, DUCT_R[0] - 0.08 * t, DUCT_R[1] - 0.06 * t))
    return loft_obj('c_duct', rings, G_COCK, sharp=25)


def diverter(sx):
    """Плоская стенка у корпуса с острой передней кромкой (m2000_05, 06)."""
    b = B(); x0 = sx * (DUCT_X - 0.03); x1 = sx * (DUCT_X - 0.002); z0, z1 = DUCT_Z - 0.37, DUCT_Z + 0.37
    ring = lambda a, k: [P3(a, x0, DUCT_Z - (DUCT_Z - z0) * k), P3(a, x1, DUCT_Z - (DUCT_Z - z0) * k), P3(a, x1, DUCT_Z + (z1 - DUCT_Z) * k), P3(a, x0, DUCT_Z + (z1 - DUCT_Z) * k)]
    b.loft([ring(4.56, 1.0), ring(5.4, 1.0)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); return b.finish('s_div', sharp_deg=30)


CONE = dict(prof=[(4.34, 0.004), (4.60, 0.085), (4.85, 0.150), (5.20, 0.205), (5.65, 0.235)])


def cone(sx):
    """Подвижный полуконус в устье: сдвиг вперёд и назад вдоль оси."""
    name = 'cone_' + ('r' if sx > 0 else 'l'); pv = P3(4.85, sx * DUCT_X, DUCT_Z); b = B(); xi = DUCT_X + 0.003
    b.loft([[v - pv for v in half_ring(a, sx, xi, DUCT_Z, r * 1.02, r, n=24)] for a, r in CONE['prof']], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); ob = b.finish(name, sharp_deg=40); ob.location = pv
    PARTS[name] = dict(pivot=pv.copy(), axis=Vector((0, 1, 0)), range=(-0.12, 0.10), slide=True, note='конус заборника: сдвиг вдоль оси в метрах, плюс - вперёд к носу'); return ob


# ── крыло: дельта, задняя кромка прямая ──
WLE = Lin([(0.90, 5.20), (4.515, 10.90)]); WTE = Lin([(0.90, 12.45), (4.515, 12.45)])
def wy(x): return -0.38 - 0.030 * max(0.0, x - 1.0)
def wz(x, a):
    """Высота крыла: спереди, где щека выше крыла, корень поднят и уходит под щеку (m2000_05, 06, 08); от a 8.4 крыло ровное, над шасси запас толщины."""
    t = min(1.0, max(0.0, (1.20 - x) / 0.25)); t = t * t * (3 - 2 * t); f = min(1.0, max(0.0, (8.4 - a) / 1.4)); f = f * f * (3 - 2 * f); return wy(x) + (-0.225 - wy(x)) * t * f
TC = Lin([(0.9, 0.030), (4.515, 0.028)])
FLAP_I = (1.02, 2.70); FLAP_O = (2.80, 4.38); SLAT_I = (1.55, 2.985); SLAT_O = (2.995, 4.40); GAP = 0.012
HING = Lin([(1.02, 11.62), (4.38, 11.72)])
SLC = Lin([(1.55, 0.46), (4.40, 0.26)])


def in_(x, r): return r[0] <= x <= r[1]


def _wsec(sx, x):
    c = WTE(x) - WLE(x); us = SLC(x) / c if (in_(x, SLAT_I) or in_(x, SLAT_O)) else 0.0; ue = (HING(x) - WLE(x)) / c if (in_(x, FLAP_I) or in_(x, FLAP_O)) else 1.0
    return foil_ring(WLE(x), c, TC(x), us, ue, 26, lambda a, h: P3(a, sx * x, wz(x, a) + h))


def wing_s(sx):
    xs = {0.60, 0.80, 0.95, 1.00, 1.015, 1.02, 1.05, 1.10, 1.15, 1.20, 1.545, 1.55, 2.70, 2.705, 2.795, 2.80, 2.985, 2.99, 2.995, 3.00, 4.38, 4.385, 4.40, 4.405, 4.515}
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
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(0.0, 16.0), note='предкрылок: ось по нижней кромке; плюс - носок вниз'); return ob


def tip_pod(sx):
    """Узкий обтекатель на конце крыла (m2000_01, 04)."""
    x = 4.515; y = wy(4.515); b = B(); n = 12; rg = lambda a, r: [P3(a, sx * x + r * math.cos(2 * math.pi * q / n), y + r * math.sin(2 * math.pi * q / n)) for q in range(n)]
    b.loft([rg(a, r) for a, r in ((10.72, 0.004), (10.95, 0.030), (12.3, 0.036), (12.62, 0.006))], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); return b.finish('tip_pod_' + ('r' if sx > 0 else 'l'), sharp_deg=48)


# ── воздушные тормоза на крыле, сверху и снизу (m2000_04 снизу, m2000_01 сверху) ──
BRK = dict(a0=8.10, a1=8.85, x0=1.85, x1=2.26)


def brake_cut(sx, up):
    B_ = BRK; z0, z1 = (wy(2.05) + 0.020, 0.2) if up else (-1.0, wy(2.05) - 0.020)
    rg = lambda a: [P3(a, sx * (B_['x0'] - 0.006), z0), P3(a, sx * (B_['x1'] + 0.006), z0), P3(a, sx * (B_['x1'] + 0.006), z1), P3(a, sx * (B_['x0'] - 0.006), z1)]
    return loft_obj('c_brk', [rg(B_['a0'] - 0.014), rg(B_['a1'] + 0.006)], G_DARK, sharp=20)


def brake(sx, up):
    B_ = BRK; n_ = ('brake_t_' if up else 'brake_b_') + ('r' if sx > 0 else 'l'); xc = (B_['x0'] + B_['x1']) / 2
    ob = patch(n_, lambda u, v: (B_['a0'] + (B_['a1'] - B_['a0']) * v, sx * (B_['x0'] + (B_['x1'] - B_['x0']) * u)), 6, 6, dirn=(-1 if up else 1), lift=0.0015, th=0.012, z0=(3.0 if up else -4.0))
    hz = down(sx * xc, Yb(B_['a0'] + 0.01), z0=(3.0 if up else -4.0), dirn=(-1 if up else 1)).z; pv = P3(B_['a0'] + 0.01, sx * xc, hz); _rel(ob, pv); ax = Vector((1, 0, 0))
    PARTS[n_] = dict(pivot=pv.copy(), axis=ax, range=((-40.0, 0.0) if up else (0.0, 40.0)), note='воздушный тормоз: ось спереди; ' + ('минус - задняя кромка вверх' if up else 'плюс - задняя кромка вниз')); return ob


# ── киль и руль ──
FIN_Y0, FIN_Y1 = 0.72, 3.06
F_LE = Lin([(0.62, 9.30), (0.80, 9.85), (1.10, 10.60), (2.18, 11.96), (2.57, 12.75), (3.01, 13.38), (3.06, 13.46)]); F_TE = Lin([(0.62, 13.52), (0.88, 13.58), (2.42, 14.17), (3.06, 14.05)])
RUD = (1.05, 2.25); RUD_C = Lin([(1.05, 0.80), (2.25, 0.55)])
def ftc(y): return 0.030 - 0.010 * (y - 0.62) / 2.4


def fin():
    ys = [0.62, 0.72, 0.80, 0.90, 1.045, 1.05] + [1.05 + (2.25 - 1.05) * i / 6 for i in range(1, 7)] + [2.255, 2.42, 2.57, 2.80, 3.01, 3.06]; rings = []
    for y in ys:
        c = F_TE(y) - F_LE(y); ue = 1 - RUD_C(y) / c if RUD[0] <= y <= RUD[1] else 1.0
        rings.append(foil_ring(F_LE(y), c, ftc(y), 0.0, ue, 16, lambda a, h: P3(a, h, y)))
    return loft_obj('fin', rings, sharp=48)


def rudder():
    y0, y1 = RUD; h0 = F_TE(y0) - RUD_C(y0) + GAP + 0.03; h1 = F_TE(y1) - RUD_C(y1) + GAP + 0.03; p0 = P3(h0, 0, y0); p1 = P3(h1, 0, y1); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized(); rings = []
    for i in range(9):
        y = y0 + 0.006 + (y1 - y0 - 0.012) * i / 8; c = F_TE(y) - F_LE(y); rings.append([v - pivot for v in foil_ring(F_LE(y), c, ftc(y), 1 - (RUD_C(y) - 0.005) / c, 1.0, 9, lambda a, h: P3(a, h, y), nose=0.14)])
    ob = loft_obj('rudder', rings, sharp=48); ob.location = pivot
    PARTS['rudder'] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-30.0, 30.0), note='ось по передней кромке руля, снизу вверх'); return ob


def fin_fair():
    """Контейнер у основания киля и утолщение у вершины с антеннами (m2000_03, 05, 06, 08)."""
    b = B(); n = 16
    def cig(prof, cx, cy, kx=1.0, kz=1.0):
        b.loft([[P3(a, cx + r * kx * math.cos(2 * math.pi * q / n), cy + r * kz * math.sin(2 * math.pi * q / n)) for q in range(n)] for a, r in prof], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    cig([(10.30, 0.012), (10.70, 0.070), (11.4, 0.120), (12.4, 0.140), (13.9, 0.140), (14.12, 0.110), (14.20, 0.040)], 0.0, 0.74)    # контейнер вдоль основания киля
    cig([(12.30, 0.008), (12.55, 0.045), (13.0, 0.075), (14.0, 0.080), (14.20, 0.060), (14.26, 0.012)], 0.0, 2.45, 0.85, 1.0)       # утолщение у вершины
    return b.finish('fin_fair', sharp_deg=30)


# ── фонарь: длинный на двоих, рама между сиденьями, петля сзади ──
CANOPY = [(2.70, top_y(2.70, 0.0) + 0.004, 0.170), (3.15, 0.860, 0.340), (3.60, 1.060, 0.430), (4.00, 1.180, 0.480), (4.70, 1.240, 0.490), (5.40, 1.220, 0.470), (6.10, 1.140, 0.420), (6.55, 1.070, 0.340), (6.75, 1.030, 0.290)]; CAN_T = tracks(CANOPY)
ARCH_A = 3.72; CAN_A1 = 6.72; CAN_H = (6.84, 1.14); MID_A = 5.36; RAKE = (5.02, 4.72)
SILL_Z = Track([(2.70, 0.565), (4.70, 0.735), (5.60, 0.805), (6.20, 0.845), (6.75, 0.875)])
def SILL(a): return SILL_Z(a)
def HW_C(a):
    """Полуширина фонаря: там, где линия порога выходит на корпус; порог идёт ровной линией, без волны."""
    top, bot, hw, nt, nb = [t(a) for t in HT]; cy = (top + bot) / 2; ht = (top - bot) / 2; q = min(0.999, max(0.0, (SILL_Z(a) - cy) / ht)); return hw * (1 - q ** nt) ** (1 / nt)
def CK_HW(a): return HW_C(a) - 0.022


def can_ring(a, inset=0.0, n=44):
    top, hw = CAN_T[0](a) - inset, HW_C(a) - inset; y0 = SILL(a) + 0.002; out = []
    for k in range(n):
        c = math.cos(math.pi * k / (n - 1)); s = math.sin(math.pi * k / (n - 1)); out.append(P3(a, math.copysign(hw * abs(c) ** 0.70, c), y0 + (top - y0) * s ** 0.82))
    return out


def frame_arch(b, a, w, inset=0.008, h=0.020, n=44, drop=0.0, mat=G_SKIN):
    ri0 = can_ring(a - w, inset, n); ro0 = can_ring(a - w, -h, n); ro1 = can_ring(a + w, -h, n); ri1 = can_ring(a + w, inset, n)
    if drop: ri0 = [p - Vector((0, 0, drop)) for p in ri0]; ri1 = [p - Vector((0, 0, drop)) for p in ri1]
    strip(b, [ri0, ro0, ro1, ri1, ri0], mat)


def frame_raked(b, a_top, a_bot, w, inset=0.012, h=0.014, n=44, mat=G_SKIN):
    def r(da, ins): return [can_ring(a_bot + (a_top - a_bot) * math.sin(math.pi * k / (n - 1)) + da, ins, n)[k] for k in range(n)]
    strip(b, [r(-w, inset), r(-w, -h), r(w, -h), r(w, inset), r(-w, inset)], mat)


def _rail(b, sg, a0, a1, d0=0.004, d1=0.020):
    st = stations(a0, a1, 0.12); rail = lambda a, d, h: P3(a, sg * (HW_C(a) + d), SILL(a) + h)
    b.loft([[rail(a, d0 - 0.018, 0.002), rail(a, d1, 0.002), rail(a, d1, 0.022), rail(a, d0 - 0.016, 0.042)] for a in st], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)


def canopy():
    a0 = ARCH_A; a1 = CAN_A1; st = stations(a0 + 0.004, a1, 0.14); pv = P3(CAN_H[0], 0.0, CAN_H[1])
    gb = B(); strip(gb, [can_ring(a) for a in st], G_GLASS); gl = gb.finish('canopy_glass', sharp_deg=60)
    for v in gl.data.vertices: v.co -= pv
    gl.location = pv
    b = B(); frame_arch(b, a0 + 0.034, 0.034, inset=-0.006, h=0.018, drop=0.0); frame_arch(b, MID_A, 0.036, inset=0.012, h=0.012, drop=0.0); frame_raked(b, RAKE[0], RAKE[1], 0.030)
    for sg in (1, -1): _rail(b, sg, a0 + 0.075, 6.20)
    strip(b, [can_ring(a1 - 0.05, 0.016), can_ring(a1 - 0.05, -0.006), can_ring(a1, -0.006), can_ring(a1, 0.016), can_ring(a1 - 0.05, 0.016)], G_SKIN)
    fr = b.finish('canopy', sharp_deg=45)
    for v in fr.data.vertices: v.co -= pv
    fr.location = pv; gl.parent = fr; gl.location = (0, 0, 0)
    PARTS['canopy'] = dict(pivot=pv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 38.0), note='один фонарь на двоих, петля сзади, рама между сиденьями; плюс - передняя кромка вверх; canopy_glass - дочерний объект')
    return [fr, gl]


def windscreen():
    a1 = ARCH_A - 0.02; st = stations(2.78, a1, 0.09); bg = B(); strip(bg, [can_ring(a) for a in st], G_GLASS); gl = bg.finish('screen_glass', sharp_deg=60)
    b = B(); frame_arch(b, ARCH_A - 0.030, 0.028, inset=0.030, h=0.004, drop=0.012)
    for sg in (1, -1): _rail(b, sg, 3.05, a1)
    return [gl, b.finish('screen_frame', sharp_deg=45)]


def cock_cut():
    st = stations(3.12, 6.74, 0.07); rg = lambda a: [P3(a, -CK_HW(a), -0.06), P3(a, CK_HW(a), -0.06), P3(a, CK_HW(a), 1.9), P3(a, -CK_HW(a), 1.9)]
    return loft_obj('c_cock', [rg(a) for a in st], G_COCK, sharp=25)


# ── пилоны: два под крылом, два под фюзеляжем ──
PYLON_DEF = (('o', 3.45, 10.05, 11.45, -0.72), ('i', 2.35, 8.95, 11.15, -0.86), ('r', 0.60, 10.05, 11.45, -0.84), ('f', 0.55, 6.00, 7.55, -0.82))
def PYL_FLAT(a0, a1): return a0 + 0.50, a1 - 0.36     # ровный низ пилона: на нём замки и точка подвески; CANT = 0.0
def pylon(sx, tag, x, a0, a1, y0):
    b = B(); name = f'pylon_{tag}_' + ('r' if sx > 0 else 'l'); yw = wy(x); hw = 0.058; f0, f1 = PYL_FLAT(a0, a1)
    def sec(a, f, k):
        y_ = yw + (y0 - yw) * k; return [P3(a, sx * x - hw * f, y_), P3(a, sx * x + hw * f, y_), P3(a, sx * x + hw * f * 0.85, yw), P3(a, sx * x - hw * f * 0.85, yw)]
    st = [a0, a0 + 0.26, f0, f1, a1 - 0.10, a1]; fs = [0.12, 0.80, 1.0, 1.0, 0.70, 0.15]; ks = [0.14, 0.60, 1.0, 1.0, 0.72, 0.40]
    b.loft([sec(a, f, k) for a, f, k in zip(st, fs, ks)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); PYLON_PTS[name] = P3((f0 + f1) / 2, sx * x, y0); PYLON_PTS[name + '_root'] = P3((f0 + f1) / 2, sx * x, yw)
    return b.finish(name, sharp_deg=40)


def pod_mount():
    am, hl, y0, yt = 7.50, 0.72, -0.82, -0.50; b = B(); hw = 0.060
    sec = lambda a, f: [P3(a, -hw * f, y0), P3(a, hw * f, y0), P3(a, hw * f * 1.5, yt), P3(a, -hw * f * 1.5, yt)]
    st = [am - hl, am - hl + 0.15, am + hl - 0.15, am + hl]; fs = [0.2, 1.0, 1.0, 0.2]; b.loft([sec(a, f) for a, f in zip(st, fs)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); PYLON_PTS['pod'] = P3(am, 0.0, y0); return b.finish('pylon_pod', sharp_deg=40)


def probe():
    """Изогнутая неподвижная штанга дозаправки справа перед козырьком (m2000_05, 06, 07): плоская на сбеге, круглая у наконечника."""
    b = B(); x = 0.30; n = 14; p0 = P3(2.62, x, 0.52); p1 = P3(1.68, x, 1.08); p2 = P3(1.42, x, 1.10); p3 = P3(1.26, x, 1.07); X_ = Vector((1, 0, 0))
    def rg(p, k, rx, ry):
        v_ = k.cross(X_).normalized(); return [p + X_ * rx * math.cos(2 * math.pi * q / n) + v_ * ry * math.sin(2 * math.pi * q / n) for q in range(n)]
    k = (p1 - p0).normalized(); k2 = (p2 - p1).normalized(); kb = (k + k2).normalized()
    b.loft([rg(p0 - k * 0.16, k, 0.054, 0.072), rg(p0, k, 0.050, 0.064), rg(p0.lerp(p1, 0.5), k, 0.044, 0.050), rg(p1, kb, 0.038, 0.042), rg(p2, k2, 0.038, 0.040)], G_DARK, cap0=G_DARK, cap1=G_DARK)
    d = (p3 - p2).normalized(); q = lambda s_, r_: rg(p2 + d * s_, d, r_, r_)
    b.loft([q(0.0, 0.040), q(0.05, 0.060), q(0.13, 0.062), q(0.15, 0.044), q(0.19, 0.030), q(0.21, 0.010)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('det_probe', sharp_deg=40)


# ── шасси: размеры ──
GROUND_Y = -2.10
NG = dict(a=4.32, hinge=(4.40, -0.375), rw=0.225, ww=0.115, track=0.120)
MG_A, MG_X = 9.22, 1.72; MAIN_T = (9.10, 1.72, -0.395)
NDOOR = dict(a0=4.30, am=5.05, a1=6.32, hw=0.21); MDOOR = dict(a0=8.86, a1=9.58, x0=0.04, xm=1.12, x1=1.75)


def doors():
    out = []; D = NDOOR
    for sx in (1, -1):
        for tag, a0_, a1_, nt_ in (('door_f_', D['a0'], D['am'] - 0.006, 'передняя створка передней стойки: при выпущенной стойке открыта'), ('door_n_', D['am'] + 0.006, D['a1'], 'задняя створка передней стойки: при выпущенной стойке снова закрыта, открывается только на время уборки')):
            n_ = tag + ('r' if sx > 0 else 'l'); ob = patch(n_, lambda u, v: (a0_ + (a1_ - a0_) * v, sx * (0.004 + (D['hw'] - 0.004) * u)), 4, 8, dirn=1, lift=0.002, th=0.012, z0=-4.0)
            pv = P3((a0_ + a1_) / 2, sx * D['hw'], down(sx * D['hw'], Yb((a0_ + a1_) / 2), z0=-4.0, dirn=1).z - 0.004); _rel(ob, pv)
            PARTS[n_] = dict(pivot=pv.copy(), axis=Vector((0, -sx, 0)), range=(0.0, 88.0), note=nt_ + '; шарнир у края, плюс - внутренняя кромка вниз'); out.append(ob)
    D = MDOOR
    for sx in (1, -1):
        n_ = 'door_m_' + ('r' if sx > 0 else 'l'); ob = patch(n_, lambda u, v: (D['a0'] + (D['a1'] - D['a0']) * v, sx * (D['x0'] + (D['xm'] - 0.006 - D['x0']) * u)), 18, 8, dirn=1, lift=0.002, th=0.014, z0=-4.0)
        pv = P3((D['a0'] + D['a1']) / 2, sx * D['x0'], down(sx * D['x0'], Yb((D['a0'] + D['a1']) / 2), z0=-4.0, dirn=1).z - 0.004); _rel(ob, pv)
        PARTS[n_] = dict(pivot=pv.copy(), axis=Vector((0, sx, 0)), range=(0.0, 92.0), note='внутренняя створка основной стойки: при выпущенной стойке снова закрыта, открывается только на время уборки; шарнир у оси самолёта, плюс - наружная кромка вниз'); out.append(ob)
        n_ = 'door_o_' + ('r' if sx > 0 else 'l'); ob = patch(n_, lambda u, v: (D['a0'] + (D['a1'] - D['a0']) * v, sx * (D['xm'] + (D['x1'] - D['xm']) * u)), 10, 8, dirn=1, lift=0.002, th=0.014, z0=-4.0)
        pv = P3(MAIN_T[0], sx * MAIN_T[1], MAIN_T[2]); _rel(ob, pv)
        PARTS[n_] = dict(pivot=pv.copy(), axis=Vector((0, -sx, 0)), range=(0.0, 94.0), note='наружная створка основной стойки: на оси стойки и ходит вместе с ней; плюс - открыта, висит вдоль ноги'); out.append(ob)
    return out


def gear_bays(host):
    D = NDOOR; rg = lambda a: [P3(a, -D['hw'] - 0.004, -1.4), P3(a, D['hw'] + 0.004, -1.4), P3(a, D['hw'] + 0.004, -0.075), P3(a, -D['hw'] - 0.004, -0.075)]
    c = loft_obj('c_bay', [rg(D['a0'] - 0.005), rg(D['a1'] + 0.005)], G_DARK, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    D = MDOOR
    for sx in (1, -1):
        rg = lambda a: [P3(a, sx * (D['x0'] - 0.004), -1.4), P3(a, sx * (D['x1'] + 0.006), -1.4), P3(a, sx * (D['x1'] + 0.003), -0.345), P3(a, sx * 0.97, -0.33), P3(a, sx * 0.85, -0.33), P3(a, sx * 0.72, -0.10), P3(a, sx * (D['x0'] - 0.004), -0.08)]
        c = loft_obj('c_bay', [rg(D['a0'] - 0.005), rg(D['a1'] + 0.005)], G_DARK, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)


def build_skin():
    S = [hull(), spine(), fin(), fin_fair(), cheek(1), cheek(-1), wing_s(1), wing_s(-1), tip_pod(1), tip_pod(-1), diverter(1), diverter(-1)]
    host = S[0]
    for o in S[1:]:
        _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        c = duct_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = bore_cut(0); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = cock_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'M2_skin'; host.data.name = 'M2_skin'; bvh_ready(host); return host


def plane(stage=9, carve=True):
    """Этапы: 1 - обшивка; 2 - рули, сопло, конусы; 3 - кабина, фонарь, пилоны, детали; 4 - шасси и створки."""
    import m2000_detail as d
    PARTS.clear(); PYLON_PTS.clear()
    import types
    skin = build_skin(); out = [skin]; ref_me = skin.data.copy(); d.resharp(types.SimpleNamespace(data=ref_me))   # гладкая обшивка до резки: с неё берутся нормали
    if stage >= 2:
        out += [rudder(), cone(1), cone(-1), nozzle(0), d.burner(0)]
        for sx, n in ((1, 'r'), (-1, 'l')):
            out += [wing_part('elevon_i_' + n, FLAP_I, sx, 'внутренний элевон, ось по передней кромке; плюс - вниз', (-25.0, 25.0)), wing_part('elevon_o_' + n, FLAP_O, sx, 'внешний элевон, ось по передней кромке; плюс - вниз', (-25.0, 25.0)), slat('slat_i_' + n, SLAT_I, sx), slat('slat_o_' + n, SLAT_O, sx)]
    if stage >= 3:
        out += [d.cockpit_detail()] + canopy() + windscreen()
        for sx in (1, -1): out += [brake(sx, True), brake(sx, False)]      # плиты кладутся лучом на целое крыло, вырез после
        for sx in (1, -1):
            for up in (True, False):
                c = brake_cut(sx, up); _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
        bvh_ready(skin)
        for sx in (1, -1):
            for tag, x, a0, a1, y0 in PYLON_DEF: out.append(pylon(sx, tag, x, a0, a1, y0))
        out += [pod_mount(), d.details(), d.seals()]      # штанги дозаправки нет: Mark 2026-11-06 попросил убрать + d.hardpoints() + [d.plates()]
    if stage >= 4:
        out += doors()
        import m2000_gear as gr; out += gr.gear_nose() + gr.gear_main(1) + gr.gear_main(-1)
    if carve: print('канавок и выемок:', d.carve(skin))
    if stage >= 4: gear_bays(skin)
    d.resharp(skin); print('нормали обшивки:', d.smooth_normals(skin, ref_me)); bpy.data.meshes.remove(ref_me)
    return out
