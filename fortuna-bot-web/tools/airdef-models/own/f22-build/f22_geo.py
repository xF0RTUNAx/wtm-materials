# f22_geo.py - геометрия F-22A для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z (в glTF: нос -Z, правое крыло +X, верх +Y). Начало - середина длины 18,91 м на уровне острия носа.
# a - расстояние от острия, y - высота над острием. План снят с выпрямленного фото f22_04, высоты с f22_03, f22_11, f22_13. Пиксели фото нигде не используются, чужих сеток нет.
import math
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 18.912
G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK = 0, 1, 2, 3, 4, 5     # обшивка; металл и механика; нутро; стекло; резина; кабина
G_STRAP, G_SCREEN, G_BELT, G_HANDLE, G_SEAM, G_PRIMER = 6, 7, 8, 9, 10, 11   # ткань кресла; экран; ремни; ручки; дно шва; грунт отсеков
PARTS = {}


def Yb(a): return L / 2 - a
def P3(a, x, y): return Vector((x, Yb(a), y))


class Track:
    """Монотонный кубический Эрмит."""
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


def loft_obj(name, rings, mat=G_SKIN, cap0=True, cap1=True, sharp=38):
    b = B(); b.loft(rings, mat, cap0=mat if cap0 else None, cap1=mat if cap1 else None)
    return b.finish(name, sharp_deg=sharp)


def strip(b, rings, mat):
    bm = b.bm; vs = [[bm.verts.new(p) for p in r] for r in rings]
    for i in range(len(vs) - 1):
        for j in range(len(vs[0]) - 1):
            f = bm.faces.new((vs[i][j], vs[i][j + 1], vs[i + 1][j + 1], vs[i + 1][j])); f.material_index = mat


def strut(b, p0, p1, r, mat=G_METAL, n=12):
    d = (p1 - p0).normalized(); u = d.orthogonal().normalized(); v = d.cross(u)
    rg = lambda c: [c + (u * math.cos(2 * math.pi * q / n) + v * math.sin(2 * math.pi * q / n)) * r for q in range(n)]
    b.loft([rg(p0), rg(p1)], mat, cap0=mat, cap1=mat)


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


# ── единый корпус: сечение - верхняя и нижняя дуги через контрольные точки, между ними острая скула ──
class Lin:
    """Ломаная: острые углы плана, без сглаживания."""
    def __init__(self, pts): self.x = [p[0] for p in pts]; self.y = [p[1] for p in pts]
    def __call__(self, t):
        x, y = self.x, self.y
        if t <= x[0]: return y[0] + (y[1] - y[0]) * (t - x[0]) / (x[1] - x[0])
        if t >= x[-1]: return y[-1] + (y[-1] - y[-2]) * (t - x[-1]) / (x[-1] - x[-2])
        i = next(k for k in range(len(x) - 1) if x[k] <= t <= x[k + 1]); return y[i] + (y[i + 1] - y[i]) * (t - x[i]) / (x[i + 1] - x[i])


# a, верх, U1x, U1y, U2x, U2y, U3x, U3y, скула x, скула y, L1x, L1y, L2x, L2y, низ. Широкий плоский верх, скула от носа до устья, дальше вдоль плеча к крылу
BODY = [
    (0.00, 0.012, 0.004, 0.012, 0.008, 0.009, 0.012, 0.005, 0.016, 0.000, 0.012, -0.004, 0.006, -0.009, -0.012),
    (0.20, 0.075, 0.020, 0.074, 0.050, 0.065, 0.085, 0.035, 0.115, 0.000, 0.085, -0.035, 0.045, -0.063, -0.075),
    (0.50, 0.165, 0.050, 0.160, 0.120, 0.135, 0.200, 0.075, 0.255, 0.000, 0.190, -0.070, 0.100, -0.140, -0.165),
    (1.20, 0.335, 0.110, 0.330, 0.260, 0.280, 0.410, 0.140, 0.500, 0.020, 0.400, -0.100, 0.200, -0.270, -0.330),
    (2.20, 0.500, 0.160, 0.490, 0.380, 0.420, 0.570, 0.200, 0.660, 0.050, 0.540, -0.140, 0.280, -0.420, -0.500),
    (3.20, 0.660, 0.200, 0.650, 0.460, 0.560, 0.660, 0.280, 0.740, 0.080, 0.620, -0.200, 0.340, -0.560, -0.660),
    (4.20, 0.820, 0.240, 0.810, 0.500, 0.700, 0.700, 0.360, 0.780, 0.100, 0.660, -0.260, 0.360, -0.680, -0.800),
    (4.95, 0.900, 0.260, 0.890, 0.560, 0.770, 0.760, 0.430, 0.900, 0.190, 0.700, -0.300, 0.420, -0.760, -0.880),
    (5.50, 0.960, 0.300, 0.950, 0.720, 0.780, 1.000, 0.400, 1.300, 0.000, 0.720, -0.300, 0.480, -0.800, -0.920),
    (6.00, 0.990, 0.320, 0.980, 0.820, 0.800, 1.220, 0.320, 1.720, -0.100, 0.720, -0.300, 0.420, -0.880, -0.960),
    (6.40, 1.005, 0.320, 0.995, 0.870, 0.800, 1.300, 0.290, 1.850, -0.080, 0.800, -0.300, 0.340, -0.920, -0.990),
    (7.50, 1.020, 0.340, 1.010, 0.950, 0.800, 1.400, 0.260, 1.900, -0.050, 0.950, -0.300, 0.250, -0.980, -1.020),
    (9.00, 0.980, 0.360, 0.970, 1.000, 0.760, 1.480, 0.240, 1.960, 0.000, 0.950, -0.300, 0.250, -0.990, -1.020),
    (11.00, 0.880, 0.380, 0.870, 1.000, 0.660, 1.480, 0.200, 2.000, 0.010, 0.950, -0.300, 0.250, -0.990, -1.020),
    (13.00, 0.740, 0.400, 0.730, 0.950, 0.520, 1.380, 0.140, 1.940, 0.020, 0.950, -0.300, 0.250, -0.900, -0.940),
    (14.50, 0.600, 0.400, 0.590, 0.850, 0.450, 1.300, 0.260, 1.700, -0.020, 1.300, -0.520, 0.500, -0.620, -0.660),
    (15.60, 0.410, 0.220, 0.440, 0.720, 0.460, 1.250, 0.385, 1.580, -0.060, 1.300, -0.440, 0.600, -0.470, -0.460),
    (16.33, 0.290, 0.200, 0.330, 0.720, 0.350, 1.250, 0.335, 1.560, -0.080, 1.300, -0.390, 0.720, -0.405, -0.370)]   # к соплам корпус расходится на две гондолы с ложбиной посередине (f22_17, f22_24, f22_25)
BT = tracks(BODY)


def _catmull(pts, n, m0=None, m1=None):
    """Кривая через точки: n отрезков на всю дугу по длине. m0, m1 - касательные на концах."""
    P = [Vector((p[0], p[1])) for p in pts]; k = len(P)
    T = []
    for i in range(k):
        if i == 0: T.append(Vector(m0) if m0 else (P[1] - P[0]))
        elif i == k - 1: T.append(Vector(m1) if m1 else (P[-1] - P[-2]))
        else: T.append((P[i + 1] - P[i - 1]) * 0.5)
    seg = [(P[i + 1] - P[i]).length for i in range(k - 1)]; tot = sum(seg); out = []
    for q in range(n):
        s = tot * q / n; i = 0
        while i < k - 2 and s > seg[i]: s -= seg[i]; i += 1
        t = s / seg[i]; p0, p1, t0, t1 = P[i], P[i + 1], T[i], T[i + 1]
        h00 = 2 * t ** 3 - 3 * t ** 2 + 1; h10 = t ** 3 - 2 * t ** 2 + t; h01 = -2 * t ** 3 + 3 * t ** 2; h11 = t ** 3 - t ** 2
        out.append(p0 * h00 + t0 * h10 + p1 * h01 + t1 * h11)
    return out


def body_half(a, nl=24, nu=32):
    """Половина сечения от низа по оси через скулу до верха: список (x, y). Скула острая."""
    c = [t(a) for t in BT]
    top = (0.0, c[0]); U1, U2, U3 = (c[1], c[2]), (c[3], c[4]), (c[5], c[6]); ch = (c[7], c[8]); L1, L2 = (c[9], c[10]), (c[11], c[12]); bot = (0.0, c[13])
    w = max(ch[0], 0.02)
    lo = _catmull([bot, L2, L1, ch], nl, m0=(w * 0.8, 0.0))
    up = _catmull([ch, U3, U2, U1, top], nu, m1=(-w * 0.8, 0.0))
    return lo + up + [Vector(top)]


def body_ring(a):
    h = body_half(a); r = [P3(a, p[0], p[1]) for p in h]
    r += [P3(a, -p[0], p[1]) for p in reversed(h[1:-1])]
    return r


def body_y(a, x, top=True):
    """Высота поверхности над |x|."""
    h = body_half(a); i0 = 24; pts = h[i0:] if top else h[:i0 + 1]; x = abs(x)
    for p, q in zip(pts, pts[1:]):
        if min(p[0], q[0]) <= x <= max(p[0], q[0]) and abs(p[0] - q[0]) > 1e-9:
            return p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0])
    return pts[-1][1] if top else pts[0][1]


def core():
    st = [0.0, 0.05, 0.20, 0.35, 0.50, 0.8] + stations(1.2, 4.8, 0.2) + stations(4.95, 6.5, 0.1) + stations(6.7, 16.33, 0.25)
    b = B(); b.loft([body_ring(a) for a in st], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('s_core', sharp_deg=30)


# ── воздухозаборник: косое ромбовидное устье под скулой, короб и гондола одной оболочкой до хвоста (f22_02, f22_11) ──
INL = [  # a, x внутр., y верх внутр., x нар. верх, y нар. верх, x нар. низ, y нар. низ, x низ внутр., y низ внутр.
    (4.70, 0.92, 0.20, 1.93, -0.04, 1.25, -1.02, 0.52, -0.92), (5.50, 0.92, 0.20, 1.93, -0.04, 1.25, -1.02, 0.52, -0.92), (6.30, 0.92, 0.20, 1.94, -0.04, 1.25, -1.03, 0.50, -0.94),
    (7.00, 0.90, 0.18, 1.97, -0.03, 1.30, -1.03, 0.25, -1.03), (9.00, 0.90, 0.14, 2.02, -0.02, 1.38, -1.03, 0.25, -1.03), (11.00, 0.90, 0.10, 2.06, -0.01, 1.42, -1.03, 0.25, -1.03),
    (13.00, 0.90, 0.06, 2.00, 0.01, 1.40, -0.95, 0.18, -0.96), (14.40, 0.90, 0.00, 1.72, -0.02, 1.10, -0.62, 0.28, -0.66)]   # нижняя кромка внутрь: заходит на плоское брюхо, иначе между ними канавка
IT = tracks(INL)
LIP_A0, LIP_KX, LIP_KY = 4.95, 0.90, 0.80


def _lip_a(x, y):
    """Плоскость устья: кольца короба упираются в неё. Снаружи и снизу кромка отнесена назад."""
    return LIP_A0 + LIP_KX * (x - 0.92) + LIP_KY * (0.20 - y)


def _inl_shell_ring(a, sx, inner):
    w = 0.045; t_ = 0.030; out = []
    def side_pts(a_):
        c_ = [t(a_) for t in IT]; xi, yi, xo, yo, xb, yb, xn, yn = c_
        e = 0.002 * (a - 4.7)       # лёгкий сдвиг по станции: упёртые кольца не совпадают, сетка без вырожденных граней
        return [(xi - 0.2, yi - t_), (xo - w + e, yo - t_), (xb - w + e, yb + w), (xn - 0.2, yn + w)] if inner else [(xi, yi), (xo + e, yo), (xb + e, yb), (xn, yn)]
    for s_ in range(4):
        for k in range(6):
            t2 = k / 6; a_ = a
            for _ in range(6):      # точка упирается в плоскость устья там, где на этой станции проходит её стенка: кромка ровная
                pts = side_pts(a_); p, q = pts[s_], pts[(s_ + 1) % 4]; x_, y_ = p[0] + (q[0] - p[0]) * t2, p[1] + (q[1] - p[1]) * t2; a_ = max(a, _lip_a(x_, y_))
            out.append(P3(a_, sx * x_, y_))
    return out


def intake(sx):
    """Короб и гондола одной оболочкой: снаружи от хвоста к устью, через кромку, внутри до горла, без булевых резов."""
    outer = [_inl_shell_ring(a, sx, False) for a in reversed(stations(4.7, 14.4, 0.2))]
    inner = [_inl_shell_ring(a, sx, True) for a in stations(4.7, 6.55, 0.15)]   # полость кончается перед отсеком, дальше горло над ним
    rings = outer + inner
    if sx < 0: rings = [r[::-1] for r in rings]
    mats = [G_SKIN] * (len(outer) - 1) + [G_SKIN] + [G_COCK] * (len(inner) - 1)
    b = B(); b.loft(rings, mats, cap0=G_SKIN, cap1=G_COCK)
    return b.finish('s_inl', sharp_deg=24)


def mouth_cut(sx):
    """Чистит полость за устьем: всё, что от корпуса попало внутрь, режется по стенкам оболочки; спереди упирается в плоскость устья."""
    w = 0.047; t_ = 0.032; rings = []
    for a in stations(4.7, 6.60, 0.15):
        out = []
        for s_ in range(4):
            for k in range(6):
                t2 = k / 6; a_ = a
                for _ in range(6):
                    c_ = [t(a_) for t in IT]; xi, yi, xo, yo, xb, yb, xn, yn = c_; e = 0.002 * (a - 4.7)
                    pts = [(xi + 0.03, yi - t_), (xo - w + e, yo - t_), (xb - w + e, yb + w), (xn + 0.03, yn + w)]; p, q = pts[s_], pts[(s_ + 1) % 4]; x_, y_ = p[0] + (q[0] - p[0]) * t2, p[1] + (q[1] - p[1]) * t2; a_ = max(a, _lip_a(x_, y_) + 0.004)
                out.append(P3(a_, sx * x_, y_))
        rings.append(out)
    return loft_obj('c_mouth', rings if sx > 0 else [r[::-1] for r in rings], G_COCK, sharp=24)


def duct_cut(sx):
    """Горло канала: от полости вверх и внутрь, над отсеками."""
    n = 28; cs = [(6.30, 1.15, -0.50, 0.46, 0.42), (6.70, 1.05, -0.05, 0.40, 0.26), (7.60, 0.90, 0.10, 0.34, 0.20), (8.60, 0.80, 0.16, 0.28, 0.18)]
    rs = []
    for a, x, y, rx, ry in cs:
        r = [P3(a, sx * x + rx * math.sin(2 * math.pi * k / n), y - ry * math.cos(2 * math.pi * k / n)) for k in range(n)]
        rs.append(r if sx > 0 else r[::-1])
    return loft_obj('c_duct', rs, G_COCK, sharp=25)


# ── балки: от плеч назад, сверху кили, сбоку ось стабилизатора ──
BOOM = [(12.60, 1.550, 0.300, -0.200, 0.300), (13.50, 1.600, 0.420, -0.360, 0.360), (14.60, 1.620, 0.420, -0.360, 0.400), (15.80, 1.600, 0.360, -0.340, 0.400), (16.80, 1.580, 0.250, -0.250, 0.300), (17.60, 1.550, 0.120, -0.120, 0.160), (18.10, 1.520, 0.030, -0.020, 0.030)]
BMT = tracks(BOOM)


def boom(sx):
    rs = []
    for a in stations(12.6, 18.1, 0.2):
        cx, top, bot, hw = [t(a) for t in BMT]; cy = (top + bot) / 2; ht = (top - bot) / 2; n = 28; ring = []
        for k in range(n):
            th = -math.pi / 2 + 2 * math.pi * k / n; c, s_ = math.cos(th), math.sin(th); e = 3.0
            ring.append(P3(a, sx * cx + hw * math.copysign(abs(c) ** (2 / e), c), cy + ht * math.copysign(abs(s_) ** (2 / e), s_)))
        rs.append(ring)
    return loft_obj('s_boom', rs, G_SKIN, sharp=35)


def boom_out(a_):
    a_ = max(min(a_, 18.1), 12.6); return BMT[0](a_) + BMT[3](a_)


def teeth(sx):
    """Зубчатый лист обшивки над соплом: два зуба назад на сопло, тонкая кромка лежит над створкой (f22_24)."""
    rs = []; L_ = 0.30; x0_, x1_ = NOZ_X - NOZ_HW - 0.07, NOZ_X + NOZ_HW + 0.11
    for i in range(57):
        x_ = x0_ + (x1_ - x0_) * i / 56; t_ = max(0.0, min(1.0, (x_ - (NOZ_X - NOZ_HW)) / (2 * NOZ_HW))); tri = 1 - abs(((t_ * 2.0) % 1.0) * 2 - 1)
        edge = 1 - _sm(min(t_, 1 - t_) / 0.10); a1 = 16.335 + max(L_ * tri, 0.14 * edge)   # у щёк и перегородки лист накрывает их верх: зазора и тёмного выреза нет
        y1 = body_y(16.33, x_) - 0.004 - 0.05 * L_ * tri; y0_ = body_y(16.05, x_) - 0.006
        rs.append([P3(16.05, sx * x_, y0_), P3(a1, sx * x_, y1), P3(a1, sx * x_, y1 - 0.010), P3(16.05, sx * x_, y0_ - 0.08)])
    return loft_obj('s_teeth', rs if sx > 0 else [r[::-1] for r in rs], G_SKIN, sharp=28)


def keel():
    """Перегородка между соплами."""
    rs = []
    for a, hw, h in ((15.9, 0.19, 0.24), (16.33, 0.17, 0.25), (16.9, 0.085, 0.20), (17.40, 0.065, 0.13), (17.70, 0.055, 0.09), (17.78, 0.02, 0.03)):
        rs.append([P3(a, -hw, -h), P3(a, hw, -h), P3(a, hw, h), P3(a, -hw, h)])
    return loft_obj('s_keel', rs, G_SKIN, sharp=30)


# ── крыло: носок, кессон, флаперон; у законцовки неподвижная часть ──
def thk(u):
    return 5 * (0.2969 * math.sqrt(max(u, 0)) - 0.1260 * u - 0.3516 * u ** 2 + 0.2843 * u ** 3 - 0.1015 * u ** 4) * 0.5 * 2


def foil_ring(a_le, chord, tc, u0, u1, nu, place, nose=0.0, tail=None, head=None):
    """tail - точки (a, h) между верхом и низом в задней части, head - после низа, перед замыканием."""
    us = [u0 + (u1 - u0) * (1 - math.cos(math.pi * i / (nu - 1))) / 2 for i in range(nu)]
    def f(u):
        if nose <= 0: return 1.0
        t = min(1.0, (u - u0) * chord / nose); return 0.35 + 0.65 * math.sqrt(t)
    up = [place(a_le + chord * u, +tc * chord * thk(u) * f(u)) for u in us]
    lo = [place(a_le + chord * u, -tc * chord * thk(u) * f(u)) for u in reversed(us)]
    return up + [place(a_, h_) for a_, h_ in (tail or [])] + lo + [place(a_, h_) for a_, h_ in (head or [])]


# Рули: круглый нос ходит в круглом вырезе неподвижной части. Верх и низ обшивки доходят до оси вплотную, поэтому в любом положении щель одна и та же, тонкая, а ступеньки нет.
COVE_K, COVE_R = 7, 0.008
def cove_cut(a_le, chord, tc, a_h, clr=COVE_R):
    """Конец верхней поверхности (u) и точки выреза (a, h) сверху вперёд и вниз."""
    uh = (a_h - a_le) / chord; t = tc * chord * thk(uh); rc = t + clr; a_e = a_h - math.sqrt(max(rc * rc - t * t, 1e-9)); te = tc * chord * thk((a_e - a_le) / chord); rc = math.hypot(a_e - a_h, te); al = math.atan2(te, a_e - a_h)
    return (a_e - a_le) / chord, [(a_h + rc * math.cos(al + (2 * math.pi - 2 * al) * (i + 1) / (COVE_K + 1)), rc * math.sin(al + (2 * math.pi - 2 * al) * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_wall(a_le, chord, tc, u1):
    """Те же точки на плоском торце, где выреза нет: счёт точек в кольцах один."""
    a_ = a_le + chord * u1; t = tc * chord * thk(u1); return [(a_, t * (1 - 2 * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_nose(a_le, chord, tc, a_h, k=1.0):
    """Нос подвижной части: полукруг вокруг оси, снизу вперёд и вверх; радиус - полутолщина профиля на оси."""
    t = tc * chord * thk((a_h - a_le) / chord); return [(a_h - k * t * math.sin(math.pi * (i + 1) / (COVE_K + 1)), -t * math.cos(math.pi * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]


# Ромб: передняя кромка, стабилизатор и кили идут под одними углами (f22_01, f22_04)
X_TIP = 6.864
A_LE = Lin([(1.20, 7.990), (2.15, 8.820), (6.72, 12.820), (X_TIP, 13.250)])
A_TE = Lin([(1.20, 15.200), (2.00, 15.000), (6.05, 14.050), (X_TIP, 13.720)])
TC = Track([(1.200, 0.055), (X_TIP, 0.028)])
GAP = 0.016
SLAT = (2.62, 6.30, 0.65)                                        # от x, до x, ширина по a
FLAPERON = (2.35, 4.75, 1.35, 0.95)                              # от x, до x, хорда у корня и у конца
AILERON = (4.85, 6.00, 0.92, 0.70)


def wy(x): return 0.030 - 0.045 * max(0.0, x - 2.0)


def _ctrl(x):
    """Хорда руля на этом сечении или None."""
    for T_ in (FLAPERON, AILERON):
        if T_[0] - 1e-6 <= x <= T_[1] + 1e-6: return T_[2] + (T_[3] - T_[2]) * (x - T_[0]) / (T_[1] - T_[0])
    return None


def wing_s(sx):
    xs = sorted(set([1.20, 1.60, 1.95, 2.15, 2.344, 2.35, 2.48, 2.614, 2.62] + [2.62 + (4.75 - 2.62) * i / 7 for i in range(1, 8)] + [4.756, 4.844, 4.85] + [4.85 + 1.15 * i / 4 for i in range(1, 5)] + [6.006, 6.15, 6.30, 6.306, 6.50, 6.72, 6.80, X_TIP]))
    rings = []
    for x in xs:
        c = A_TE(x) - A_LE(x); u0 = 0.0; u1 = 1.0
        if SLAT[0] - 1e-6 <= x <= SLAT[1] + 1e-6: u0 = SLAT[2] / c
        ch = _ctrl(x)
        if ch is not None: u1, tail = cove_cut(A_LE(x), c, TC(x), A_TE(x) - ch)
        else: tail = cove_wall(A_LE(x), c, TC(x), u1)
        rings.append(foil_ring(A_LE(x), c, TC(x), u0, u1, 20, lambda a, h: P3(a, sx * x, wy(x) + h), tail=tail))
    return loft_obj('s_wing', rings, sharp=48)


def _wing_ctrl(name, x0, x1, n, u0f, u1f, sx, note, rng, nu=9, hinge=None, nose=0.0, headf=None):
    rs = []
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n; c = A_TE(x) - A_LE(x)
        rs.append(foil_ring(A_LE(x), c, TC(x), u0f(x, c), u1f(x, c), nu, lambda a, h: P3(a, sx * x, wy(x) + h), nose=nose, head=headf(x, c) if headf else None))
    p0, p1 = hinge(x0), hinge(x1); pivot = (p0 + p1) / 2
    if sx < 0: p0, p1 = Vector((-p0.x, p0.y, p0.z)), Vector((-p1.x, p1.y, p1.z)); pivot = (p0 + p1) / 2
    axis = (p1 - p0).normalized()
    if axis.x < 0: axis = -axis
    ob = loft_obj(name, [[v - pivot for v in r] for r in rs], sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=rng, note=note)
    return ob


def _te_ctrl(base, T_, sx, note):
    n = base + ('r' if sx > 0 else 'l'); x0, x1 = T_[0] + 0.008, T_[1] - 0.008; chf = lambda x: T_[2] + (T_[3] - T_[2]) * (x - T_[0]) / (T_[1] - T_[0]); ah = lambda x: A_TE(x) - chf(x)
    return _wing_ctrl(n, x0, x1, 8, lambda x, c: (ah(x) - A_LE(x)) / c, lambda x, c: 1.0, sx, note, (-25.0, 25.0), hinge=lambda x: P3(ah(x), x, wy(x)), headf=lambda x, c: cove_nose(A_LE(x), c, TC(x), ah(x)))


def flaperon(sx): return _te_ctrl('flaperon_', FLAPERON, sx, 'ось в центре круглого носа; плюс - вниз')
def aileron(sx): return _te_ctrl('aileron_', AILERON, sx, 'ось в центре круглого носа; плюс - вниз')


def slat_seal(sx):
    """Тёмная полоса в щели за носком: насквозь не видно неба, носок её не задевает."""
    rs = []
    for i in range(12):
        x = SLAT[0] + 0.01 + (SLAT[1] - SLAT[0] - 0.02) * i / 11; c = A_TE(x) - A_LE(x); ac = A_LE(x) + SLAT[2] - GAP / 2; t = TC(x) * c * thk(SLAT[2] / c) * 0.7
        r = [P3(ac - 0.003, sx * x, wy(x) - t), P3(ac + 0.003, sx * x, wy(x) - t), P3(ac + 0.003, sx * x, wy(x) + t), P3(ac - 0.003, sx * x, wy(x) + t)]
        rs.append(r if sx > 0 else r[::-1])
    return loft_obj('det_seal_' + ('r' if sx > 0 else 'l'), rs, G_DARK, sharp=30)


def slat(sx):
    n = 'slat_' + ('r' if sx > 0 else 'l'); x0, x1 = SLAT[0] + 0.012, SLAT[1] - 0.018
    return _wing_ctrl(n, x0, x1, 10, lambda x, c: 0.0, lambda x, c: (SLAT[2] - GAP) / c, sx, 'носок: ось у задней кромки снизу; минус - вниз', (-18.0, 0.0), nu=12, hinge=lambda x: P3(A_LE(x) + SLAT[2] - GAP - 0.012, x, wy(x) - TC(x) * (A_TE(x) - A_LE(x)) * thk(SLAT[2] / (A_TE(x) - A_LE(x))) - 0.012))


# ── стабилизатор: большой, цельноповоротный, шестиугольник; передняя кромка параллельна крылу, задняя - уступом (f22_01, f22_04) ──
STAB_A, STAB_Y, STAB_DY = 16.20, -0.020, -0.004
S_LE = Lin([(1.950, 15.030), (4.450, 17.050)])
S_TE = Lin([(1.950, 18.300), (3.050, 18.912), (4.450, 17.850)])
STAB_GAP = 0.018


def stab(sx):
    name = 'stab_' + ('r' if sx > 0 else 'l'); X0, XT = 1.95, 4.45; pivot = P3(STAB_A, sx * (boom_out(STAB_A) + 0.0), STAB_Y)
    xs = sorted(set([X0 + (XT - X0) * i / 14 for i in range(15)] + [3.05]))
    def warp(a_, xn):
        xi = max(boom_out(a_), boom_out(STAB_A) + 0.010 if abs(a_ - STAB_A) < 0.20 else 0.0) + STAB_GAP
        return xi + (xn - X0) / (XT - X0) * (XT - xi)
    rings = []
    for x in xs:
        c = S_TE(x) - S_LE(x)
        def place(a_, h, x=x):
            xw = warp(a_, x); return P3(a_, sx * xw, STAB_Y + STAB_DY * (xw - X0) + h)
        rings.append([v - pivot for v in foil_ring(S_LE(x), c, 0.030, 0.0, 1.0, 22, place)])
    b = B(); r0 = rings[0]; nr = len(r0); inner = [(r0[k] + r0[nr - 1 - k]) / 2 for k in range(nr)]
    b.loft([inner] + rings, G_SKIN, cap1=G_SKIN)
    xr = boom_out(STAB_A) + STAB_GAP; n = 14
    rg = lambda x_, r: [P3(STAB_A + r * math.cos(2 * math.pi * k / n), sx * x_, STAB_Y + r * math.sin(2 * math.pi * k / n)) - pivot for k in range(n)]
    b.loft([rg(xr - 0.008, 0.050), rg(xr + 0.03, 0.050)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    ob = b.finish(name, sharp_deg=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(-25.0, 25.0), note='ось поперёк по корню; плюс - носок вверх')
    return ob


def stab_boss(sx):
    x0 = boom_out(STAB_A) - 0.06; x1 = boom_out(STAB_A) + 0.008; n = 20
    rg = lambda x_, r: [P3(STAB_A + r * 1.2 * math.cos(2 * math.pi * k / n), sx * x_, STAB_Y - 0.01 + r * math.sin(2 * math.pi * k / n)) for k in range(n)]
    rs = [rg(x0, 0.115), rg(x1 - 0.004, 0.105), rg(x1, 0.085)]
    return loft_obj('s_boss', rs if sx > 0 else [r[::-1] for r in rs], G_SKIN, sharp=40)


# ── киль: большой, разведён наружу, руль отдельно ──
FIN_X0, FIN_Y0, FIN_CANT = 1.460, 0.300, 0.585                  # x и y у корня; наклон наружу на метр высоты
FIN_Y1 = 3.000
F_LE = Lin([(FIN_Y0, 13.750), (FIN_Y1, 15.600)])
F_TE = Lin([(FIN_Y0, 17.350), (FIN_Y1, 16.700)])
RUD = (0.620, 2.350, 0.850, 0.620)                               # низ, верх, хорда снизу и сверху


def fx(y): return FIN_X0 + FIN_CANT * (y - FIN_Y0)


def _rud_c(y): return RUD[2] + (RUD[3] - RUD[2]) * (y - RUD[0]) / (RUD[1] - RUD[0])


def fin(sx):
    ys = [0.05, 0.30, 0.50, 0.615, 0.62] + [0.62 + (2.35 - 0.62) * i / 8 for i in range(1, 9)] + [2.355, 2.60, 2.85, 3.00]
    rings = []
    for y in ys:
        c = F_TE(y) - F_LE(y); tc = 0.040 - 0.016 * (y - 0.05) / 2.95
        if RUD[0] - 1e-6 <= y <= RUD[1] + 1e-6: ue, tail = cove_cut(F_LE(y), c, tc, F_TE(y) - _rud_c(y), 0.006)
        else: ue = 1.0; tail = cove_wall(F_LE(y), c, tc, 1.0)
        r = foil_ring(F_LE(y), c, tc, 0.0, ue, 16, lambda a, h: P3(a, sx * (fx(y) + h), y), tail=tail)
        rings.append(r if sx > 0 else r[::-1])
    return loft_obj('fin_' + ('r' if sx > 0 else 'l'), rings, sharp=48)


def rudder(sx):
    name = 'rudder_' + ('r' if sx > 0 else 'l'); y0, y1 = RUD[0], RUD[1]
    h0 = P3(F_TE(y0) - _rud_c(y0), sx * fx(y0), y0); h1 = P3(F_TE(y1) - _rud_c(y1), sx * fx(y1), y1); pivot = (h0 + h1) / 2; axis = (h1 - h0).normalized(); rs = []
    for i in range(9):
        y = y0 + 0.020 + (y1 - y0 - 0.040) * i / 8; c = F_TE(y) - F_LE(y); tc = 0.040 - 0.016 * (y - 0.05) / 2.95; ah = F_TE(y) - _rud_c(y)
        r = [v - pivot for v in foil_ring(F_LE(y), c, tc, (ah - F_LE(y)) / c, 1.0, 9, lambda a, h: P3(a, sx * (fx(y) + h), y), head=cove_nose(F_LE(y), c, tc, ah, 1.0))]
        rs.append(r if sx > 0 else r[::-1])
    ob = loft_obj(name, rs, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-11.0, 11.0), note='ось в центре круглого носа руля; ось сильно наклонена, больший ход упирает руль в киль')
    return ob


# ── сборка обшивки ──
BVH = {}
def bvh_ready(host):
    me = host.data; BVH['t'] = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons]); BVH['host'] = host


# ── плоские сопла: неподвижные боковины и нутро, верхняя и нижняя створки на своих осях, пилообразный срез (f22_14, f22_17) ──
NOZ_X, NOZ_HW = 0.720, 0.500                                     # ось сопла, полуширина
NOZ_A0, NOZ_A1 = 16.33, 17.36                                    # ось створок, срез
NOZ_UP, NOZ_LO = 0.300, -0.360                                   # внешняя поверхность у оси
NOZ_R = 0.060


def bore_cut(sx):
    """Прямоугольный канал в корпусе за соплом."""
    x0, x1 = sx * (NOZ_X - NOZ_HW), sx * (NOZ_X + NOZ_HW); y0, y1 = NOZ_LO - 0.012, NOZ_UP + 0.012
    sec = lambda a, k: [P3(a, x0 * 1 + (x1 - x0) * (0.5 - 0.5 * k), y0 + (y1 - y0) * (0.5 - 0.5 * k)), P3(a, x1 - (x1 - x0) * (0.5 - 0.5 * k), y0 + (y1 - y0) * (0.5 - 0.5 * k)), P3(a, x1 - (x1 - x0) * (0.5 - 0.5 * k), y1 - (y1 - y0) * (0.5 - 0.5 * k)), P3(a, x0 + (x1 - x0) * (0.5 - 0.5 * k), y1 - (y1 - y0) * (0.5 - 0.5 * k))]
    prof = [(16.70, 1.0, G_METAL), (15.70, 1.0, G_METAL), (15.20, 0.95, G_DARK), (14.90, 0.6, G_DARK), (14.70, 0.1, G_DARK)]
    rs = [sec(a, k) for a, k, _ in prof]
    b = B(); b.loft(rs if sx > 0 else [r[::-1] for r in rs], [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK)
    return b.finish('c_bore', sharp_deg=30)


def _nhw(a):
    """Полуширина сопла: сужается к срезу (f22_24)."""
    return NOZ_HW - 0.10 * max(0.0, a - NOZ_A0)


def nozzle(sx):
    """Щёки и лопатки: неподвижно. Щёки идут по сужению сопла и кончаются острым клином (f22_25)."""
    b = B(); n_ = 'r' if sx > 0 else 'l'
    for xs in (-1, 1):
        def ring(a, yb, yt, th):
            xi = NOZ_X + xs * (_nhw(a) + 0.002); xo = xi + xs * th
            return [P3(a, sx * xi, yb), P3(a, sx * xo, yb), P3(a, sx * xo, yt), P3(a, sx * xi, yt)]
        th_ = 1.0 if xs > 0 else 0.6; rs = [ring(16.10, NOZ_LO + 0.005, NOZ_UP + 0.002, 0.03), ring(16.33, NOZ_LO + 0.005, NOZ_UP + 0.002, 0.05 * th_), ring(16.80, -0.285, 0.235, 0.10 * th_), ring(17.12, -0.205, 0.165, 0.09 * th_), ring(17.42, -0.09, 0.06, 0.008)]
        b.loft(rs if xs * sx < 0 else [r[::-1] for r in rs], G_METAL, cap0=G_METAL, cap1=G_METAL)
    # лопатки в горле
    for k in range(5):
        x_ = NOZ_X - NOZ_HW + 0.14 + k * 0.18
        rs = [[P3(15.65, sx * (x_ - 0.012), -0.27), P3(15.75, sx * (x_ - 0.012), -0.27), P3(15.75, sx * (x_ - 0.012), 0.24), P3(15.65, sx * (x_ - 0.012), 0.24)], [P3(15.65, sx * (x_ + 0.012), -0.27), P3(15.75, sx * (x_ + 0.012), -0.27), P3(15.75, sx * (x_ + 0.012), 0.24), P3(15.65, sx * (x_ + 0.012), 0.24)]]
        b.loft(rs if sx > 0 else rs[::-1], G_DARK, cap0=G_DARK, cap1=G_DARK)
    return b.finish('nozzle_' + n_, sharp_deg=30)


def _flap(sx, up):
    """Створка: выпуклая сводом, продолжает гондолу без ступеньки, сужается к срезу, срез дугой (f22_24, f22_25)."""
    n_ = 'r' if sx > 0 else 'l'; name = ('noz_up_' if up else 'noz_lo_') + n_; sg = 1 if up else -1
    y0 = NOZ_UP if up else NOZ_LO; pivot = P3(NOZ_A0, sx * NOZ_X, y0 - sg * NOZ_R); rs = []; N = 20
    for i in range(N + 1):
        t_ = i / N; u_ = 2 * t_ - 1; arch = 1 - u_ * u_
        a1 = (NOZ_A1 - 0.42 * abs(u_) ** 1.15) if up else (NOZ_A1 + 0.05 - 0.26 * abs(u_) ** 1.3)   # сверху клин к середине, нижняя створка длиннее (f22_24)
        crest = y0 + sg * 0.045 * arch                            # свод вровень с гондолой
        ytip = (0.150 + 0.035 * arch) if up else (-0.175 - 0.030 * arch)
        def px(a_): return NOZ_X + u_ * (_nhw(a_) - 0.004)
        eu = abs(u_) ** 3; top_ = [(NOZ_A0, y0), (NOZ_A0 + 0.16, y0 - 0.032 - 0.02 * eu), (NOZ_A0 + 0.33, y0 - 0.066 + 0.012 * arch - 0.035 * eu), (NOZ_A0 + 0.50, y0 - 0.082 + 0.030 * arch - 0.03 * eu)] if up else [(NOZ_A0, y0), (NOZ_A0 + 0.09, crest - sg * 0.002), (NOZ_A0 + 0.42, crest - sg * 0.055)]   # сверху створка уходит под зубцы листа с запасом на ход
        loop = top_ + [(a1, ytip), (a1, ytip - sg * 0.008), (NOZ_A0 + 0.44, y0 - sg * (0.125 if up else 0.095)), (NOZ_A0, y0 - sg * 2 * NOZ_R)] + [(NOZ_A0 - NOZ_R * math.sin(math.pi * q / 4), y0 - sg * NOZ_R * (1 + math.cos(math.pi * q / 4))) for q in range(1, 4)]
        rs.append([P3(a_, sx * px(a_), y_) - pivot for a_, y_ in loop])
    if sx * sg < 0: rs = rs[::-1]
    b = B(); b.loft(rs, G_METAL, cap0=G_METAL, cap1=G_METAL)
    ob = b.finish(name, sharp_deg=42); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(-12.0, 20.0) if up else (-20.0, 15.0), note='створка плоского сопла: ось поперёк; плюс - срез вниз; верхняя вверх до 12° под зубцы листа')
    return ob


def burner(sx):
    b = B(); n_ = 'r' if sx > 0 else 'l'; a0 = 15.25; cx = sx * NOZ_X
    for y_ in (-0.17, 0.0, 0.17):
        rs = [[P3(a0 - 0.03, cx - 0.46, y_ - 0.012), P3(a0 + 0.03, cx - 0.46, y_ - 0.012), P3(a0 + 0.03, cx - 0.46, y_ + 0.012), P3(a0 - 0.03, cx - 0.46, y_ + 0.012)], [P3(a0 - 0.03, cx + 0.46, y_ - 0.012), P3(a0 + 0.03, cx + 0.46, y_ - 0.012), P3(a0 + 0.03, cx + 0.46, y_ + 0.012), P3(a0 - 0.03, cx + 0.46, y_ + 0.012)]]
        b.loft(rs, G_DARK, cap0=G_DARK, cap1=G_DARK)
    return b.finish('det_burner_' + n_, sharp_deg=30)


# ── кабина и фонарь: цельное стекло без перемычки, рама кольцом с пилообразным носком, петля сзади ──
CANOPY = [  # a, верх стекла, полуширина у порога, высота порога (f22_01, f22_02, f22_03, f22_13)
    (2.72, 0.625, 0.040, 0.610), (3.00, 0.860, 0.250, 0.665), (3.40, 1.100, 0.410, 0.705), (3.90, 1.270, 0.500, 0.745), (4.30, 1.295, 0.520, 0.790), (4.80, 1.240, 0.470, 0.880), (5.30, 1.150, 0.330, 0.975), (5.70, 1.060, 0.180, 1.005), (5.95, 1.016, 0.001, 1.012)]
CAN_T = tracks(CANOPY)
CAN_A0, CAN_A1 = 2.72, 5.95
CK_HW = Track([(3.10, 0.200), (3.60, 0.360), (4.30, 0.430), (5.10, 0.340), (5.60, 0.160)])
FLOOR = 0.020


def can_ring(a, inset=0.0, n=44):
    top, hw, sill = CAN_T[0](a) - inset, CAN_T[1](a) - inset, CAN_T[2](a); top = max(top, sill + 0.003)
    return [P3(a, (1 if math.cos(math.pi * k / (n - 1)) >= 0 else -1) * hw * abs(math.cos(math.pi * k / (n - 1))) ** 0.82, sill + (top - sill) * math.sin(math.pi * k / (n - 1)) ** 0.82) for k in range(n)]


CAN_HINGE = (6.30, 0.980)   # сзади, в корпусе, ниже рамы: фонарь поднимается передней частью вверх


def canopy():
    """Цельный фонарь с рамой: стекло - дочерний объект, петля сзади, передняя часть поднимается."""
    pivot = P3(CAN_HINGE[0], 0.0, CAN_HINGE[1]); st = [CAN_A0 + 0.006, 2.76, 2.82, 2.9, 3.0, 3.1] + stations(3.2, CAN_A1 - 0.004, 0.14)
    bg = B(); strip(bg, [can_ring(a) for a in st], G_GLASS); gl = bg.finish('canopy_glass', sharp_deg=70)
    for v in gl.data.vertices: v.co -= pivot
    gl.location = pivot
    b = B()
    def outn(a):
        if a >= CAN_A1 - 0.03: return (1.0, 0.0)
        d = (CAN_T[1](a + 0.015) - CAN_T[1](a - 0.015)) / 0.03; L_ = math.hypot(d, 1.0); return (-d / L_, 1.0 / L_)
    def sect(a, sg):
        na, nx = outn(a); hw = CAN_T[1](a); sill = CAN_T[2](a)
        def low(d):
            x_ = sg * (hw + nx * d); a_ = a + na * d; h = down(x_, Yb(a_)); z = h.z if h is not None else body_y(a_, abs(x_)); return P3(a_, x_, z + 0.006)
        def rail(dx, dy): return P3(a + na * dx, sg * (hw + nx * dx), sill + dy)
        tooth = 0.0
        if 2.85 <= a <= 3.65: tooth = 0.085 * abs((((a - 2.85) / 0.40) % 1.0) * 2 - 1) * _sm((3.65 - a) / 0.1) * _sm((a - 2.85) / 0.1)   # пилообразный носок рамы (f22_02)
        d = (0.030 + 0.025 * _sm((a - 2.75) / 0.5)) * (1.0 - 0.35 * _sm((a - 5.1) / 0.7)) + tooth
        return [low(d), low(d * 0.45), rail(0.022, 0.018), rail(-0.008, 0.024), rail(-0.008, -0.03), low(d * 0.62) + Vector((0, 0, -0.002))]
    st_f = [2.75, 2.80] + stations(2.85, 3.65, 0.05) + stations(3.75, 5.65, 0.14) + [5.72, 5.80, 5.86, 5.91, 5.95]
    b.loft([sect(a, 1) for a in st_f] + [sect(a, -1) for a in reversed(st_f[:-1])], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for sg in (1, -1):
        for a in (3.60, 4.10, 4.60, 5.10):      # замки по порогу изнутри
            x_ = sg * (CAN_T[1](a) - 0.03); y_ = CAN_T[2](a) - 0.015
            b.loft([[P3(a, x_ - 0.008, y_), P3(a + 0.05, x_ - 0.008, y_), P3(a + 0.05, x_ + 0.008, y_), P3(a, x_ + 0.008, y_)], [P3(a, x_ - 0.008, y_ - 0.02), P3(a + 0.05, x_ - 0.008, y_ - 0.02), P3(a + 0.05, x_ + 0.008, y_ - 0.02), P3(a, x_ + 0.008, y_ - 0.02)]], G_METAL, cap0=G_METAL, cap1=G_METAL)
    fr = b.finish('canopy', sharp_deg=45)
    for v in fr.data.vertices: v.co -= pivot
    fr.location = pivot; gl.parent = fr; gl.location = (0, 0, 0)
    PARTS['canopy'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, 42.0), note='петля сзади; плюс - передняя часть вверх; canopy_glass - дочерний объект')
    return [fr, gl]


def deck():
    """Плечи под порогом фонаря: обшивка плавно поднимается к раме, рама становится тонким кантом."""
    rs = []
    for a in [3.05, 3.15, 3.30, 3.50, 3.70, 3.90, 4.10, 4.30, 4.50, 4.70, 4.90, 5.10, 5.30, 5.50, 5.70, 5.85, 5.95, 6.05, 6.20, 6.40, 6.55]:
        a_ = min(a, CAN_A1); hw = CAN_T[1](a_); sill = CAN_T[2](a_); top = sill - 0.012
        if a > CAN_A1: t_ = _sm((a - CAN_A1) / 0.60); top = top + (body_y(a, 0.0) - 0.004 - top) * t_
        wd = 0.30 * _sm((a - 3.05) / 0.55) * (1.0 - 0.75 * _sm((a - 5.3) / 0.45)); inn = hw + 0.02; out = min(inn + max(wd, 0.001), max(BT[7](a) - 0.03, inn + 0.001))
        side = []
        for k in range(7):
            q = k / 6; x_ = out + (inn - out) * q; yb = body_y(a, min(x_, 1.2)); side.append((x_, yb + (max(top, yb) - yb) * _sm(q) - 0.030 * (1 - q) ** 2))
        base = min(p[1] for p in side) - 0.22
        r = [P3(a, x_, y_) for x_, y_ in side] + [P3(a, inn * q_, top) for q_ in (0.6, 0.2, -0.2, -0.6)] + [P3(a, -x_, y_) for x_, y_ in reversed(side)] + [P3(a, -out * 0.5, base), P3(a, out * 0.5, base)]
        rs.append(r)
    return loft_obj('s_deck', rs, G_SKIN, sharp=50)


def cock_cut():
    def sec(a, y0, y1, hw): return [P3(a, -hw, y0), P3(a, hw, y0), P3(a, hw, y1), P3(a, -hw, y1)]
    st = stations(3.10, 5.60, 0.20)
    rs = [sec(a, FLOOR + 0.12 * max(0.0, 3.6 - a), 2.2, CK_HW(a)) for a in st]
    return loft_obj('c_cock', rs, G_COCK, sharp=25)


def build_skin():
    S = [core(), deck(), keel()]
    for sx in (1, -1): S += [intake(sx), boom(sx), wing_s(sx), stab_boss(sx), teeth(sx)]
    host = S[0]
    for o in S[1:]:
        _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        c = mouth_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
        c = bore_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = cock_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'F22_skin'; host.data.name = 'F22_skin'
    bvh_ready(host)
    return host


def down(x, y_world, z0=3.0, dirn=-1):
    hit = BVH['t'].ray_cast(Vector((x, y_world, z0)), Vector((0, 0, dirn)))
    return hit[0]


def patch(name, outline, nu, nv, dirn=-1, lift=0.006, th=0.018, mat=G_SKIN, z0=3.0, back=None):
    """Плита по обшивке: outline(u, v) -> (a, x); вершины лучом на обшивку (створки). back - материал изнанки."""
    grid = []
    for j in range(nv + 1):
        row = []
        for i in range(nu + 1):
            a, x = outline(i / nu, j / nv); h = down(x, Yb(a), z0=z0, dirn=dirn)
            row.append((h if h is not None else Vector((x, Yb(a), -0.9 if dirn > 0 else 0.5))) + Vector((0, 0, -dirn * lift)))
        grid.append(row)
    b = B(); bm = b.bm; n_ = Vector((0, 0, -dirn)); bk = mat if back is None else back
    tv = [[bm.verts.new(p + n_ * th * 0.1) for p in row] for row in grid]; lv = [[bm.verts.new(p - n_ * th) for p in row] for row in grid]
    for j in range(nv):
        for i in range(nu):
            f = bm.faces.new((tv[j][i], tv[j][i + 1], tv[j + 1][i + 1], tv[j + 1][i])); f.material_index = mat
            f = bm.faces.new((lv[j][i], lv[j + 1][i], lv[j + 1][i + 1], lv[j][i + 1])); f.material_index = bk
    for i in range(nu):
        for (ta, tb, la, lb) in ((tv[0][i], tv[0][i + 1], lv[0][i], lv[0][i + 1]), (tv[nv][i + 1], tv[nv][i], lv[nv][i + 1], lv[nv][i])):
            f = bm.faces.new((ta, la, lb, tb)); f.material_index = bk
    for j in range(nv):
        for (ta, tb, la, lb) in ((tv[j + 1][0], tv[j][0], lv[j + 1][0], lv[j][0]), (tv[j][nu], tv[j + 1][nu], lv[j][nu], lv[j + 1][nu])):
            f = bm.faces.new((ta, la, lb, tb)); f.material_index = bk
    return b.finish(name, sharp_deg=30)


# ── шасси и створки ──
GROUND_Y = -2.050
NG = dict(a=5.35, hinge=(5.62, -0.60), rw=0.300, ww=0.170)
MG_A, MG_X = 11.80, 1.78
BAY_N = dict(a0=4.05, a1=5.76, hw=0.300)
BAY_M = dict(a0=10.55, a1=12.25, x0=1.46, x1=1.92, roof=-0.10)   # потолок ниже верха крыла и плеча: иначе ниша прорезает самолёт насквозь
BAY_C = dict(a0=6.70, a1=11.20, xc=1.12, ym=8.95, ch=0.30, roof=-0.35)    # центральный отсек: длина, полуширина, стык половин створки, срез углов, потолок (f22_20)
BAY_S = dict(a0=7.30, a1=10.20, x0=1.42, x1=1.80)                        # боковой отсек под воздухозаборником


def _hinge(hx, a0, a1, dz=-0.004, dirn=1, z0=-3.0):
    """Ось по линии петли: прямая между точками обшивки у концов; центр посередине."""
    def fnd(a, st):
        for k in range(12):
            h = down(hx, Yb(a + st * k * 0.05), z0=z0, dirn=dirn)
            if h is not None: return h
        raise RuntimeError(f'нет обшивки под петлёй x={hx} a={a}')
    p0 = fnd(a0 + 0.02, 1); p1 = fnd(a1 - 0.02, -1)
    # ось ниже всех точек кромки: при открытии кромка уходит внутрь, а не в стенку ниши
    off = 0.0
    for k in range(1, 12):
        t_ = k / 12; h = down(hx, p0.y + (p1.y - p0.y) * t_, z0=z0, dirn=dirn)
        if h is not None: off = min(off, h.z - (p0.z + (p1.z - p0.z) * t_))
    dz += off
    p0 = p0 + Vector((0, 0, dz)); p1 = p1 + Vector((0, 0, dz)); ax = (p0 - p1).normalized()   # к носу
    return (p0 + p1) / 2, ax


def _c_x(a, x):
    """Срез углов центрального отсека: наружная граница сжимается у торцов."""
    B_ = BAY_C; k = min(1.0, (a - B_['a0']) / B_['ch'], (B_['a1'] - a) / B_['ch']); return x * (0.70 + 0.30 * max(0.0, k))


def doors():
    out = []
    C = BAY_C; S_ = BAY_S; M_ = BAY_M
    for sx in (1, -1):
        n_ = 'r' if sx > 0 else 'l'
        # центральный отсек: большая створка из двух половин, общая ось у наружной кромки (f22_20)
        for tag, a0, a1 in (('f', C['a0'] + 0.01, C['ym'] - 0.004), ('a', C['ym'] + 0.004, C['a1'] - 0.01)):
            nm = 'bay_c' + tag + '_' + n_
            ob = patch(nm, lambda u, v: (a0 + (a1 - a0) * v, sx * (0.006 + (_c_x(a0 + (a1 - a0) * v, C['xc']) - 0.012) * u)), 8, 14, dirn=1, lift=0.003, th=0.022, z0=-3.0, back=G_PRIMER)
            hx = sx * (C['xc'] - 0.004); pv, ax_ = _hinge(hx, max(a0, C['a0'] + C['ch']), min(a1, C['a1'] - C['ch']), dz=-0.028); _rel(ob, pv)
            PARTS[nm] = dict(pivot=pv.copy(), axis=ax_, range=(-95.0, 0.0) if sx > 0 else (0.0, 95.0), note='0 - закрыта; половина большой створки центрального отсека, ось у наружной кромки')
            out.append(ob)
        # боковой отсек на скосе борта: одна створка, ось сверху
        nm = 'bay_s_' + n_; a0, a1 = S_['a0'] + 0.01, S_['a1'] - 0.01
        ob = patch(nm, lambda u, v: (a0 + (a1 - a0) * v, sx * (S_['x0'] + 0.006 + (S_['x1'] - S_['x0'] - 0.012) * u)), 6, 14, dirn=1, lift=0.002, th=0.018, z0=-3.0, back=G_PRIMER)
        hx = sx * (S_['x1'] - 0.006); pv, ax_ = _hinge(hx, a0, a1, dz=-0.020); _rel(ob, pv)
        PARTS[nm] = dict(pivot=pv.copy(), axis=ax_, range=(-105.0, 0.0) if sx > 0 else (0.0, 105.0), note='0 - закрыта; створка бокового отсека, ось сверху')
        out.append(ob)
        # основная стойка: большая створка, ось у наружной кромки
        a0, a1, x0, x1 = M_['a0'] + 0.006, M_['a1'] - 0.006, M_['x0'] + 0.006, M_['x1'] - 0.006; nm = 'door_m_' + n_
        o3 = patch(nm, lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + (x1 - x0) * u)), 6, 8, dirn=1, lift=0.003, th=0.022, z0=-3.0, back=G_COCK)
        hx = sx * x1; pv, ax_ = _hinge(hx, a0, a1, dz=-0.035); _rel(o3, pv)
        PARTS[nm] = dict(pivot=pv.copy(), axis=ax_, range=(-80.0, 0.0) if sx > 0 else (0.0, 80.0), note='0 - закрыта, ось у наружной кромки')
        out.append(o3)
        # носовая стойка: две длинные створки
        a0, a1, x0, x1 = BAY_N['a0'] + 0.006, BAY_N['a1'] - 0.006, 0.006, BAY_N['hw'] - 0.004; nm = 'door_n_' + n_
        o4 = patch(nm, lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + (x1 - x0) * u)), 4, 8, dirn=1, lift=0.003, th=0.018, z0=-3.0, back=G_COCK)
        hx = sx * x1; pv, ax_ = _hinge(hx, a0, a1, dz=-0.035); _rel(o4, pv)
        PARTS[nm] = dict(pivot=pv.copy(), axis=ax_, range=(-70.0, 0.0) if sx > 0 else (0.0, 70.0), note='0 - закрыта, ось у наружной кромки')
        out.append(o4)
    return out


def bays(host):
    """Ниши: отсеки с грунтовыми стенками, ниши шасси. Створки лежат на целой обшивке, ниши режутся после."""
    C = BAY_C; S_ = BAY_S; M_ = BAY_M
    st = [C['a0'], C['a0'] + C['ch'] * 0.5, C['a0'] + C['ch']] + stations(C['a0'] + 0.6, C['a1'] - 0.6, 0.6) + [C['a1'] - C['ch'], C['a1'] - C['ch'] * 0.5, C['a1']]
    rs = [[P3(a, -_c_x(a, C['xc']) - 0.002, C['roof']), P3(a, _c_x(a, C['xc']) + 0.002, C['roof']), P3(a, _c_x(a, C['xc']) + 0.002, -1.6), P3(a, -_c_x(a, C['xc']) - 0.002, -1.6)] for a in st]
    c = loft_obj('c_bay', rs, G_PRIMER, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    for sx in (1, -1):
        # боковой: сечение идёт вдоль скоса, наружу выходит только окно створки
        def yfl(a, x):
            c_ = [t(a) for t in IT]; xo, yo, xb, yb = c_[2], c_[3], c_[4], c_[5]; return yo + (x - xo) * (yb - yo) / (xb - xo)
        def sec(a):
            yt, yb_ = yfl(a, S_['x1']), yfl(a, S_['x0'])
            yf = max(-0.975, yb_ + 0.012)    # дно выреза выше обшивки: спереди скос поднимается, ровное дно прорезало щель у кромки створки
            # у рычага дно низкое (x до 1.33), к кромке створки поднимается вдоль скоса: иначе рычаг задевает его при выходе
            return [P3(a, sx * x_, y_) for x_, y_ in ((1.16, -0.975), (1.33, -0.975), (S_['x0'] - 0.002, yf), (S_['x0'] - 0.002, yb_), (S_['x0'] + 0.30, yb_ - 0.40), (S_['x1'] + 0.35, yt - 0.10), (S_['x1'] + 0.002, yt), (1.16, yt))]
        rs = [sec(a) for a in stations(S_['a0'], S_['a1'], 0.5)]
        c = loft_obj('c_bay', rs if sx > 0 else [r[::-1] for r in rs], G_PRIMER, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
        r0 = [P3(M_['a0'], sx * M_['x0'], M_['roof']), P3(M_['a0'], sx * M_['x1'], M_['roof']), P3(M_['a0'], sx * M_['x1'], -1.3), P3(M_['a0'], sx * M_['x0'], -1.3)]; r1 = [P3(M_['a1'], sx * M_['x0'], M_['roof']), P3(M_['a1'], sx * M_['x1'], M_['roof']), P3(M_['a1'], sx * M_['x1'], -1.3), P3(M_['a1'], sx * M_['x0'], -1.3)]
        c = loft_obj('c_bay', [r0, r1] if sx > 0 else [r0[::-1], r1[::-1]], G_COCK, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    a0, a1, hw = BAY_N['a0'], BAY_N['a1'], BAY_N['hw']; rs = [[P3(a, -hw, -0.10), P3(a, hw, -0.10), P3(a, hw, -1.2), P3(a, -hw, -1.2)] for a in (a0, a1)]
    c = loft_obj('c_bay', rs, G_COCK, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)


def plane(stage=9, carve=True):
    import f22_detail as d
    PARTS.clear()
    skin = build_skin(); out = [skin]
    if stage >= 2:
        for sx in (1, -1): out += [fin(sx), rudder(sx), stab(sx), flaperon(sx), aileron(sx), slat(sx), slat_seal(sx), nozzle(sx), _flap(sx, True), _flap(sx, False), burner(sx)]
    if stage >= 3:
        out += [d.cockpit_detail()] + canopy()
        out += d.small(skin)
    if stage >= 4:
        out += doors()
        import f22_gear as gr; out += gr.gear_nose() + gr.gear_main(1) + gr.gear_main(-1)
        out += [d.bay_c_inner(), d.bay_s_inner(1), d.bay_s_inner(-1), d.arm(1), d.arm(-1), d.fuel_door()]
    if carve:
        print('канавок:', d.carve(skin))
    if stage >= 4: bays(skin); d.fuel_bay(skin)
    d.resharp(skin)
    return out
