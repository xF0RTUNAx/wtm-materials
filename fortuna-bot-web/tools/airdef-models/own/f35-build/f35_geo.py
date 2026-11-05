# f35_geo.py - геометрия F-35A для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z (в glTF: нос -Z, правое крыло +X, верх +Y). Начало - середина длины 15,67 м на уровне острия носа.
# a - расстояние от острия, y - высота над острием. План снят с выпрямленных фото f35_05 и f35_10, высоты с f35_03 и f35_08. Пиксели фото нигде не используются, чужих сеток нет.
import math
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 15.67
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
# a, верх, U1x, U1y, U2x, U2y, U3x, U3y, скула x, скула y, L1x, L1y, L2x, L2y, низ
BODY = [
    (0.00, 0.012, 0.004, 0.012, 0.008, 0.009, 0.012, 0.005, 0.016, 0.000, 0.012, -0.004, 0.006, -0.009, -0.012),
    (0.15, 0.076, 0.020, 0.075, 0.050, 0.066, 0.080, 0.040, 0.105, 0.000, 0.080, -0.035, 0.040, -0.066, -0.078),
    (0.40, 0.185, 0.050, 0.180, 0.120, 0.155, 0.190, 0.090, 0.245, 0.010, 0.190, -0.070, 0.100, -0.140, -0.170),
    (1.00, 0.385, 0.110, 0.380, 0.250, 0.330, 0.380, 0.210, 0.470, 0.090, 0.400, -0.060, 0.220, -0.250, -0.330),
    (1.90, 0.560, 0.160, 0.550, 0.360, 0.470, 0.530, 0.300, 0.680, 0.170, 0.560, -0.120, 0.300, -0.390, -0.460),
    (3.00, 0.740, 0.200, 0.730, 0.440, 0.620, 0.680, 0.440, 0.900, 0.260, 0.760, -0.180, 0.440, -0.580, -0.700),
    (4.00, 0.950, 0.220, 0.940, 0.500, 0.800, 0.780, 0.560, 1.020, 0.350, 0.900, -0.120, 0.600, -0.660, -0.820),
    (4.60, 1.050, 0.240, 1.040, 0.560, 0.880, 0.860, 0.640, 1.080, 0.410, 0.900, -0.080, 0.680, -0.680, -0.860),
    (5.20, 1.100, 0.260, 1.090, 0.640, 0.920, 1.020, 0.660, 1.400, 0.440, 0.900, -0.030, 0.760, -0.720, -0.880),
    (6.00, 1.120, 0.280, 1.100, 0.700, 0.960, 1.180, 0.700, 1.720, 0.460, 0.960, -0.030, 0.840, -0.760, -0.920),
    (7.00, 1.110, 0.300, 1.090, 0.760, 0.950, 1.260, 0.700, 1.800, 0.460, 1.100, -0.080, 0.240, -0.900, -0.960),
    (8.00, 1.060, 0.320, 1.045, 0.800, 0.910, 1.300, 0.680, 1.900, 0.440, 1.100, -0.080, 0.220, -0.930, -0.980),
    (10.00, 0.950, 0.340, 0.935, 0.820, 0.810, 1.300, 0.600, 1.850, 0.380, 1.100, -0.080, 0.220, -0.930, -0.980),
    (11.50, 0.820, 0.360, 0.805, 0.800, 0.690, 1.220, 0.500, 1.680, 0.300, 1.250, -0.100, 0.700, -0.860, -0.920),
    (12.50, 0.640, 0.340, 0.620, 0.660, 0.510, 0.960, 0.360, 1.220, 0.180, 1.120, -0.130, 0.880, -0.620, -0.730),
    (13.20, 0.530, 0.320, 0.480, 0.530, 0.320, 0.640, 0.060, 0.670, -0.120, 0.620, -0.340, 0.350, -0.700, -0.790)]
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
    st = [0.0, 0.05, 0.15, 0.28, 0.40, 0.6, 0.8] + stations(1.0, 3.8, 0.2) + stations(4.0, 5.4, 0.1)[0:] + stations(5.6, 13.2, 0.2)
    b = B(); b.loft([body_ring(a) for a in st], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('s_core', sharp_deg=30)


# ── короб воздухозаборника: стенки снаружи, верхняя плита с козырьком, косое устье без расщепителя ──
INL = [  # a, x внутр., y верх внутр., x нар. верх, y нар. верх, x нар. низ, y нар. низ, x низ внутр., y низ внутр.: короб и гондола одним телом до хвоста, корпус внутри него
    (3.90, 0.55, 0.270, 1.65, 0.260, 1.30, -0.74, 0.56, -0.86), (4.40, 0.60, 0.310, 1.68, 0.300, 1.34, -0.78, 0.58, -0.90), (4.75, 0.60, 0.370, 1.72, 0.360, 1.38, -0.80, 0.60, -0.92),
    (5.40, 0.65, 0.420, 1.78, 0.410, 1.44, -0.86, 0.60, -0.905), (6.00, 0.68, 0.435, 1.78, 0.425, 1.50, -0.885, 0.55, -0.905), (6.40, 0.70, 0.435, 1.78, 0.430, 1.52, -0.895, 0.45, -0.905), (7.00, 0.70, 0.430, 1.80, 0.430, 1.54, -0.90, 0.25, -0.905),
    (8.00, 0.70, 0.410, 1.87, 0.410, 1.56, -0.90, 0.24, -0.905), (10.00, 0.70, 0.350, 1.82, 0.350, 1.54, -0.90, 0.24, -0.905), (11.50, 0.70, 0.270, 1.65, 0.270, 1.30, -0.76, 0.30, -0.85), (12.40, 0.70, 0.150, 1.18, 0.150, 0.95, -0.55, 0.40, -0.62)]
IT = tracks(INL)
LIP_A0, LIP_KX, LIP_KY = 4.29, 0.80, 0.45


def _inl_ring(a, sx, ins=0.0, up=0.0):
    c = [t(a) for t in IT]; xi, yi, xo, yo, xb, yb, xn, yn = c
    pts = [(xi, yi + up), (xo - ins, yo - ins + up), (xb - ins, yb + ins), (xn, yn + ins)]
    # по шагам вдоль сторон: 6 на каждую сторону, скруглённые нижние углы задаются сглаживанием
    out = []
    for p, q in zip(pts, pts[1:] + pts[:1]):
        for k in range(6):
            t_ = k / 6; out.append(P3(a, sx * (p[0] + (q[0] - p[0]) * t_), p[1] + (q[1] - p[1]) * t_))
    return out if sx > 0 else out[::-1]


def _lip_a(x, y):
    """Плоскость устья: кольца короба упираются в неё, булевых резов нет."""
    return LIP_A0 + LIP_KX * (1.5 - x) + LIP_KY * (0.28 - y)


def _inl_shell_ring(a, sx, inner):
    w = 0.045; t_ = 0.030; out = []
    def side_pts(a_):
        c_ = [t(a_) for t in IT]; xi, yi, xo, yo, xb, yb, xn, yn = c_
        e = 0.002 * (a - 4.0)       # лёгкий сдвиг по станции: упёртые кольца не совпадают, сетка без вырожденных граней
        return [(xi - 0.2, yi - t_), (xo - w + e, yo - t_), (xb - w + e, yb + w), (xn - 0.2, yn + w)] if inner else [(xi, yi), (xo + e, yo), (xb + e, yb), (xn, yn)]
    for s_ in range(4):
        for k in range(6):
            t2 = k / 6; a_ = a
            for _ in range(5):      # точка упирается в плоскость устья там, где на этой станции проходит её стенка: кромка ровная, без зубцов
                pts = side_pts(a_); p, q = pts[s_], pts[(s_ + 1) % 4]; x_, y_ = p[0] + (q[0] - p[0]) * t2, p[1] + (q[1] - p[1]) * t2; a_ = max(a, _lip_a(x_, y_))
            out.append(P3(a_, sx * x_, y_))
    return out


def intake(sx):
    """Короб и гондола одной оболочкой: снаружи от хвоста к устью, через кромку, внутри до горла. Без булевых резов: от них на тонких стенках оставались лоскуты."""
    outer = [_inl_shell_ring(a, sx, False) for a in reversed(stations(4.0, 12.4, 0.2))]
    inner = [_inl_shell_ring(a, sx, True) for a in stations(4.0, 5.9, 0.2)]   # полость кончается перед отсеком вооружения, дальше горло над ним
    rings = outer + inner
    if sx < 0: rings = [r[::-1] for r in rings]
    mats = [G_SKIN] * (len(outer) - 1) + [G_SKIN] + [G_COCK] * (len(inner) - 1)
    b = B(); b.loft(rings, mats, cap0=G_SKIN, cap1=G_COCK)
    return b.finish('s_inl', sharp_deg=24)


def duct_cut(sx):
    """Тёмное горло канала за выпуклостью: уходит в глубину корпуса."""
    n = 28; cs = [(5.70, 1.20, -0.14, 0.40, 0.34), (6.00, 1.16, 0.10, 0.36, 0.20), (7.00, 1.02, 0.16, 0.30, 0.20), (8.00, 0.90, 0.20, 0.24, 0.18)]
    rs = []
    for a, x, y, rx, ry in cs:
        r = [P3(a, sx * x + rx * math.sin(2 * math.pi * k / n), y - ry * math.cos(2 * math.pi * k / n)) for k in range(n)]
        rs.append(r if sx > 0 else r[::-1])
    return loft_obj('c_duct', rs, G_COCK, sharp=25)   # не чёрная заплатка: стенки горла продолжают плавный переход от кромки


# ── балки: от плеч назад, по ним идут кили и внутренняя кромка стабилизатора ──
BOOM = [(10.60, 1.300, 0.300, -0.200, 0.300), (11.50, 1.300, 0.420, -0.320, 0.460), (12.50, 1.260, 0.420, -0.300, 0.500), (13.40, 1.200, 0.380, -0.260, 0.500), (14.20, 1.180, 0.280, -0.180, 0.340), (15.00, 1.120, 0.160, -0.060, 0.150), (15.55, 1.040, 0.060, 0.000, 0.020)]
BMT = tracks(BOOM)


def boom(sx):
    rs = []
    for a in stations(10.6, 15.55, 0.2):
        cx, top, bot, hw = [t(a) for t in BMT]; cy = (top + bot) / 2; ht = (top - bot) / 2; n = 28; ring = []
        for k in range(n):
            th = -math.pi / 2 + 2 * math.pi * k / n; c, s = math.cos(th), math.sin(th); e = 3.0
            ring.append(P3(a, sx * cx + hw * math.copysign(abs(c) ** (2 / e), c), cy + ht * math.copysign(abs(s) ** (2 / e), s)))
        rs.append(ring)
    return loft_obj('s_boom', rs, G_SKIN, sharp=35)


def boom_out(a_):
    a_ = max(min(a_, 15.55), 10.6); return BMT[0](a_) + BMT[3](a_)


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


X_TIP = 5.435
A_LE = Track([(1.200, 7.300), (2.400, 8.050), (5.435, 10.020)])
A_TE = Track([(1.200, 12.440), (1.780, 12.330), (5.435, 11.590)])
TC = Track([(1.200, 0.062), (5.435, 0.028)])
GAP = 0.016
SLAT = (2.42, 5.28, 0.62)                                       # от x, до x, ширина по a
FLAPERON = (1.86, 4.76, 0.84, 0.70)                             # от x, до x, хорда у корня и у конца


def wy(x): return 0.400 - 0.074 * (x - 1.9) - 0.20 * max(0.0, 1.70 - x)


def _flap_chord(x): return FLAPERON[2] + (FLAPERON[3] - FLAPERON[2]) * (x - FLAPERON[0]) / (FLAPERON[1] - FLAPERON[0])


def wing_s(sx):
    xs = [1.20, 1.50, 1.70, 1.854, 1.86, 2.05, 2.24, 2.414, 2.42] + [2.42 + (4.76 - 2.42) * i / 10 for i in range(1, 11)] + [4.766, 4.90, 5.10, 5.28, 5.286, 5.33, 5.40, 5.435]
    rings = []
    for x in xs:
        c = A_TE(x) - A_LE(x); u0 = 0.0; u1 = 1.0
        if SLAT[0] - 1e-6 <= x <= SLAT[1] + 1e-6: u0 = SLAT[2] / c
        if FLAPERON[0] - 1e-6 <= x <= FLAPERON[1] + 1e-6: u1, tail = cove_cut(A_LE(x), c, TC(x), A_TE(x) - _flap_chord(x))
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


def flaperon(sx):
    n = 'flaperon_' + ('r' if sx > 0 else 'l'); x0, x1 = FLAPERON[0] + 0.008, FLAPERON[1] - 0.008; ah = lambda x: A_TE(x) - _flap_chord(x)
    return _wing_ctrl(n, x0, x1, 8, lambda x, c: (ah(x) - A_LE(x)) / c, lambda x, c: 1.0, sx, 'ось в центре круглого носа; плюс - вниз', (-25.0, 25.0), hinge=lambda x: P3(ah(x), x, wy(x)), headf=lambda x, c: cove_nose(A_LE(x), c, TC(x), ah(x)))


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


# ── стабилизатор: цельноповоротный, корень вдоль балки с зазором, ось на бобышке ──
STAB_A, STAB_Y, STAB_DY = 13.72, 0.060, -0.006
S_LE = Track([(1.700, 12.280), (1.820, 12.380), (3.480, 13.720)])
S_TE = Track([(1.700, 15.670), (3.480, 15.080)])
STAB_GAP = 0.018


def stab(sx):
    name = 'stab_' + ('r' if sx > 0 else 'l'); X0, XT = 1.70, 3.48; pivot = P3(STAB_A, sx * (boom_out(STAB_A) + 0.0), STAB_Y)
    xs = [X0 + (XT - X0) * i / 14 for i in range(15)]
    def warp(a_, xn):
        xi = max(boom_out(a_), boom_out(STAB_A) + 0.010 if abs(a_ - STAB_A) < 0.20 else 0.0) + STAB_GAP
        return xi + (xn - X0) / (XT - X0) * (XT - xi)
    rings = []
    for x in xs:
        c = S_TE(x) - S_LE(x)
        def place(a_, h, x=x):
            xw = warp(a_, x); return P3(a_, sx * xw, STAB_Y + STAB_DY * (xw - X0) + h)
        rings.append([v - pivot for v in foil_ring(S_LE(x), c, 0.032, 0.0, 1.0, 22, place)])
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


# ── киль: разведён наружу, руль отдельно ──
FIN_X0, FIN_Y0, FIN_CANT = 1.470, 0.500, 0.400                  # x и y у корня; наклон наружу на метр высоты
FIN_Y1 = 2.220
F_LE = Track([(FIN_Y0, 11.350), (FIN_Y1, 13.250)])
F_TE = Track([(FIN_Y0, 13.550), (FIN_Y1, 14.250)])
RUD = (0.750, 2.060, 0.560, 0.420)                               # низ, верх, хорда снизу и сверху


def fx(y): return FIN_X0 + FIN_CANT * (y - FIN_Y0)


def _rud_c(y): return RUD[2] + (RUD[3] - RUD[2]) * (y - RUD[0]) / (RUD[1] - RUD[0])


def fin(sx):
    ys = [0.25, 0.50, 0.66, 0.745, 0.75] + [0.75 + (2.06 - 0.75) * i / 8 for i in range(1, 9)] + [2.065, 2.16, 2.22]
    rings = []
    for y in ys:
        c = F_TE(y) - F_LE(y); tc = 0.045 - 0.018 * (y - 0.25) / 2.0
        if RUD[0] - 1e-6 <= y <= RUD[1] + 1e-6: ue, tail = cove_cut(F_LE(y), c, tc, F_TE(y) - _rud_c(y), 0.006)
        else: ue = 1.0; tail = cove_wall(F_LE(y), c, tc, 1.0)
        r = foil_ring(F_LE(y), c, tc, 0.0, ue, 16, lambda a, h: P3(a, sx * (fx(y) + h), y), tail=tail)
        rings.append(r if sx > 0 else r[::-1])
    return loft_obj('fin_' + ('r' if sx > 0 else 'l'), rings, sharp=48)


def rudder(sx):
    name = 'rudder_' + ('r' if sx > 0 else 'l'); y0, y1 = RUD[0], RUD[1]
    h0 = P3(F_TE(y0) - _rud_c(y0), sx * fx(y0), y0); h1 = P3(F_TE(y1) - _rud_c(y1), sx * fx(y1), y1); pivot = (h0 + h1) / 2; axis = (h1 - h0).normalized(); rs = []
    for i in range(9):
        y = y0 + 0.013 + (y1 - y0 - 0.026) * i / 8; c = F_TE(y) - F_LE(y); tc = 0.045 - 0.018 * (y - 0.25) / 2.0; ah = F_TE(y) - _rud_c(y)
        r = [v - pivot for v in foil_ring(F_LE(y), c, tc, (ah - F_LE(y)) / c, 1.0, 9, lambda a, h: P3(a, sx * (fx(y) + h), y), head=cove_nose(F_LE(y), c, tc, ah, 1.0))]
        rs.append(r if sx > 0 else r[::-1])
    ob = loft_obj(name, rs, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-24.0, 24.0), note='ось в центре круглого носа руля, снизу вверх')
    return ob


# ── сборка обшивки ──
BVH = {}
def bvh_ready(host):
    me = host.data; BVH['t'] = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons]); BVH['host'] = host


# ── сопло одно, по оси: кольцо с пилообразной кромкой, тёмные лепестки, тяги, внутренние створки, нутро ──
NOZ_Y, NOZ_A0, NOZ_A1, NOZ_R0, NOZ_R1 = -0.120, 13.20, 14.02, 0.640, 0.405
N_PET = 16


def bore_cut():
    n = 64; a1 = NOZ_A0
    ring = lambda a, r: [P3(a, r * math.sin(2 * math.pi * k / n), NOZ_Y - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    prof = [(a1 + 0.20, 0.585, G_METAL), (a1 - 0.25, 0.585, G_METAL), (a1 - 0.30, 0.545, G_METAL), (a1 - 0.40, 0.545, G_METAL), (a1 - 0.45, 0.585, G_METAL), (a1 - 0.95, 0.590, G_COCK), (a1 - 1.25, 0.590, G_DARK), (a1 - 1.65, 0.380, G_DARK), (a1 - 1.80, 0.050, G_DARK)]
    b = B(); b.loft([ring(a, r) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK)
    return b.finish('c_bore', sharp_deg=30)


def nozzle():
    b = B(); N = N_PET; a0 = NOZ_A0; a1 = NOZ_A1; aS = a0 + 0.10; aP = a0 + 0.22
    def ptp(a, r, ang): return P3(a, r * math.sin(ang), NOZ_Y - r * math.cos(ang))
    ring = lambda a, r, nn=64: [ptp(a, r, 2 * math.pi * k / nn) for k in range(nn)]
    Rp = lambda a: NOZ_R0 + (NOZ_R1 - NOZ_R0) * (max(a - aP, 0.0) / (a1 - aP)) ** 0.9
    # силовое кольцо
    sec = [ring(a0 - 0.02, 0.625), ring(a0 + 0.01, NOZ_R0 + 0.022), ring(aS, NOZ_R0 + 0.022), ring(aS + 0.02, NOZ_R0 - 0.01), ring(aS + 0.02, 0.585), ring(a0 - 0.02, 0.585)]
    b.loft(sec + [sec[0]], G_METAL)
    # зубья кольца: пилообразная кромка наружу на лепестки (f35_04, f35_06)
    M = 2 * N
    for j in range(M):
        am = 2 * math.pi * j / M; hw = math.pi / M * 0.92
        for r_o, r_i in ((NOZ_R0 + 0.022, NOZ_R0 - 0.004),):
            tri = lambda rr: [ptp(aS, rr, am - hw), ptp(aS, rr, am + hw), ptp(aS + 0.115, rr - 0.018, am)]
            b.bm.normal_update()
            v_o = [b.bm.verts.new(p) for p in tri(r_o)]; v_i = [b.bm.verts.new(p) for p in tri(r_i)]
            for q in ((v_o[0], v_o[1], v_o[2]), (v_i[2], v_i[1], v_i[0]), (v_o[0], v_i[0], v_i[1], v_o[1]), (v_o[1], v_i[1], v_i[2], v_o[2]), (v_o[2], v_i[2], v_i[0], v_o[0])):
                f = b.bm.faces.new(q); f.material_index = G_METAL
    # лепестки внахлёст и ребро, зубец на срезе
    hwo = math.pi / N * 1.04; th = 0.012
    for j in range(N):
        am = 2 * math.pi * j / N
        def petal(a):
            r = Rp(a); o = []; i_ = []
            for q in range(5):
                t_ = q / 4; ang = am - hwo + 2 * hwo * t_; lift = 0.006 * (1 - t_)
                o.append(ptp(a, r + lift, ang)); i_.append(ptp(a, r + lift - th, ang))
            return o + i_[::-1]
        b.loft([petal(aP - 0.08), petal((aP + a1) / 2), petal(a1 - 0.05)], G_METAL, cap0=G_METAL, cap1=G_METAL)
        # пилообразный срез: каждый лепесток заканчивается зубом (f35_05)
        def tooth(a, k):
            r = Rp(a); o = []; i_ = []
            for q in range(5):
                t_ = q / 4; ang = am + (-hwo + 2 * hwo * t_) * k; lift = 0.006 * (1 - t_)
                o.append(ptp(a, r + lift, ang)); i_.append(ptp(a, r + lift - th, ang))
            return o + i_[::-1]
        b.loft([tooth(a1 - 0.05, 1.0), tooth(a1 + 0.035, 0.08)], G_METAL, cap0=G_METAL, cap1=G_METAL)
        def rib(a, h=0.010, w=0.020): return [ptp(a, Rp(a) + 0.002, am - w), ptp(a, Rp(a) + 0.002, am + w), ptp(a, Rp(a) + 0.002 + h, am + w), ptp(a, Rp(a) + 0.002 + h, am - w)]
        b.loft([rib(aP), rib(a1 - 0.10)], G_METAL, cap0=G_METAL, cap1=G_METAL)
        # внутренняя створка до горла
        hwi = math.pi / N * 0.96
        bs = lambda a, r: [ptp(a, r, am - hwi), ptp(a, r, am + hwi), ptp(a, r - 0.006, am + hwi), ptp(a, r - 0.006, am - hwi)]
        b.loft([bs(a1 - 0.005, NOZ_R1 - th - 0.003), bs(a1 - 0.42, 0.340), bs(a0 + 0.12, 0.470), bs(a0 - 0.05, 0.570)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('nozzle', sharp_deg=30)


def burner():
    b = B(); a0 = NOZ_A0 - 0.62; F = Vector((0, 1, 0)); X_, Z = Vector((1, 0, 0)), Vector((0, 0, 1)); n = 32; c = P3(a0, 0, NOZ_Y)
    rg = lambda r, d: [c + (X_ * math.cos(2 * math.pi * k / n) + Z * math.sin(2 * math.pi * k / n)) * r + F * d for k in range(n)]
    for r_ in (0.430, 0.260):
        b.loft([rg(r_ - 0.02, -0.03), rg(r_ + 0.02, -0.03), rg(r_ + 0.02, 0.03), rg(r_ - 0.02, 0.03), rg(r_ - 0.02, -0.03)], G_DARK)
    for j in range(24):
        ang = 2 * math.pi * j / 24; u = X_ * math.cos(ang) + Z * math.sin(ang); v = X_ * -math.sin(ang) + Z * math.cos(ang)
        s = lambda r_, d: [c + u * r_ + v * 0.007 + F * (d - 0.016), c + u * r_ - v * 0.007 + F * (d - 0.016), c + u * r_ - v * 0.007 + F * (d + 0.016), c + u * r_ + v * 0.007 + F * (d + 0.016)]
        b.loft([s(0.12, 0.10), s(0.56, 0.10)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    a1 = NOZ_A0 - 1.50; c1 = P3(a1, 0, NOZ_Y); rg1 = lambda r, d: [c1 + (X_ * math.cos(2 * math.pi * k / 18) + Z * math.sin(2 * math.pi * k / 18)) * r + F * d for k in range(18)]
    b.loft([rg1(0.180, 0.0), rg1(0.180, -0.10), rg1(0.110, -0.36), rg1(0.015, -0.48)], G_DARK, cap0=G_DARK, cap1=G_DARK)
    return b.finish('det_burner', sharp_deg=30)


# ── кабина и фонарь: цельное стекло без перемычки, рама с уступом, петля у передней кромки ──
CANOPY = [  # a, верх стекла, полуширина у порога, высота порога: узкий и вытянутый (f35_03, f35_09, f35_10, f35_16)
    (1.85, 0.668, 0.060, 0.660), (2.15, 0.830, 0.240, 0.715), (2.50, 1.040, 0.390, 0.725), (2.90, 1.215, 0.470, 0.745), (3.40, 1.360, 0.500, 0.830), (3.90, 1.405, 0.480, 0.955), (4.40, 1.350, 0.400, 1.055), (4.80, 1.250, 0.270, 1.120), (5.15, 1.165, 0.090, 1.145), (5.32, 1.152, 0.001, 1.150)]
CAN_T = tracks(CANOPY)
CAN_A0, CAN_A1 = 1.85, 5.32
CK_HW = Track([(2.15, 0.210), (2.60, 0.370), (3.20, 0.430), (4.20, 0.370), (4.85, 0.180)])
FLOOR = 0.050


def can_ring(a, inset=0.0, n=44):
    top, hw, sill = CAN_T[0](a) - inset, CAN_T[1](a) - inset, CAN_T[2](a); top = max(top, sill + 0.003)
    return [P3(a, (1 if math.cos(math.pi * k / (n - 1)) >= 0 else -1) * hw * abs(math.cos(math.pi * k / (n - 1))) ** 0.82, sill + (top - sill) * math.sin(math.pi * k / (n - 1)) ** 0.82) for k in range(n)]


CAN_HINGE = (1.80, 0.560)   # внутри основания, ниже всех точек рамы: при открытии рама идёт вверх и вперёд, а не в основание


def canopy():
    """Цельный фонарь с рамой: стекло - дочерний объект, петля у передней кромки, задняя часть поднимается."""
    pivot = P3(CAN_HINGE[0], 0.0, CAN_HINGE[1]); st = [CAN_A0 + 0.006, 1.92, 2.0, 2.1, 2.2] + stations(2.3, CAN_A1 - 0.004, 0.14); st2 = stations(2.3, CAN_A1 - 0.004, 0.14); st3 = [1.92, 2.0, 2.06, 2.12, 2.2, 2.3]
    bg = B(); strip(bg, [can_ring(a) for a in st], G_GLASS); gl = bg.finish('canopy_glass', sharp_deg=70)
    for v in gl.data.vertices: v.co -= pivot
    gl.location = pivot
    b = B()
    # рама: одно кольцо от передней кромки вдоль борта, вокруг задней вершины и обратно; от обшивки к порогу стекла широким уступом (f35_01, f35_08)
    def outn(a):
        if a >= CAN_A1 - 0.03: return (1.0, 0.0)
        d = (CAN_T[1](a + 0.015) - CAN_T[1](a - 0.015)) / 0.03; L_ = math.hypot(d, 1.0); return (-d / L_, 1.0 / L_)
    def sect(a, sg):
        na, nx = outn(a); hw = CAN_T[1](a); sill = CAN_T[2](a)
        def low(d):
            x_ = sg * (hw + nx * d); a_ = a + na * d; h = down(x_, Yb(a_)); z = h.z if h is not None else body_y(a_, abs(x_)); return P3(a_, x_, z + 0.004 + 0.014 * (1 - _sm((a - 2.2) / 0.5)))
        def rail(dx, dy): return P3(a + na * dx, sg * (hw + nx * dx), sill + dy)
        d = (0.025 + 0.030 * _sm((a - 1.92) / 0.5)) * (1.0 - 0.35 * _sm((a - 4.5) / 0.7))
        return [low(d), low(d * 0.45), rail(0.022, 0.018), rail(-0.008, 0.024), rail(-0.008, -0.03), low(d * 0.62) + Vector((0, 0, -0.002))]
    st_f = [1.90, 1.95, 2.0, 2.1, 2.2] + stations(2.3, 5.10, 0.14) + [5.15, 5.20, 5.25, 5.29, 5.32]
    b.loft([sect(a, 1) for a in st_f] + [sect(a, -1) for a in reversed(st_f[:-1])], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for sg in (1, -1):
        # замки по порогу изнутри
        for a in (2.70, 3.20, 3.70, 4.20):
            x_ = sg * (CAN_T[1](a) - 0.03); y_ = CAN_T[2](a) - 0.015
            b.loft([[P3(a, x_ - 0.008, y_), P3(a + 0.05, x_ - 0.008, y_), P3(a + 0.05, x_ + 0.008, y_), P3(a, x_ + 0.008, y_)], [P3(a, x_ - 0.008, y_ - 0.02), P3(a + 0.05, x_ - 0.008, y_ - 0.02), P3(a + 0.05, x_ + 0.008, y_ - 0.02), P3(a, x_ + 0.008, y_ - 0.02)]], G_METAL, cap0=G_METAL, cap1=G_METAL)
    fr = b.finish('canopy', sharp_deg=45)
    for v in fr.data.vertices: v.co -= pivot
    fr.location = pivot; gl.parent = fr; gl.location = (0, 0, 0)
    PARTS['canopy'] = dict(pivot=pivot.copy(), axis=Vector((-1, 0, 0)), range=(0.0, 62.0), note='петля у передней кромки; плюс - задняя кромка вверх; canopy_glass - дочерний объект')
    return [fr, gl]


def hump():
    """Основание фонаря перед стеклом: неподвижный бугор, на нём окно датчика (f35_08, f35_09)."""
    # спереди граненое основание рамы (f35_01, f35_09): стекло стоит на нём без щели
    T = tracks([(1.42, 0.470, 0.012), (1.60, 0.565, 0.060), (1.85, 0.655, 0.090), (2.00, 0.698, 0.180), (2.15, 0.711, 0.270), (2.29, 0.716, 0.345), (2.38, 0.718, 0.370), (2.45, 0.690, 0.380), (2.62, 0.660, 0.380)]); rs = []   # дальше плечи: основание уходит под них круто, без почти совпадающих поверхностей
    for a in [1.42, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1, 2.2, 2.29, 2.38, 2.45, 2.54, 2.62]:
        top, hw = T[0](a), T[1](a); y0 = top - 0.34; n = 28; r = []
        for k in range(n):
            th = 2 * math.pi * k / n; c_, s_ = math.cos(th), math.sin(th); e_ = 0.42 if a > 1.9 else 0.72; r.append(P3(a, hw * math.copysign(abs(c_) ** e_, c_), (top + y0) / 2 + (top - y0) / 2 * math.copysign(abs(s_) ** e_, s_)))
        rs.append(r)
    return loft_obj('s_hump', rs, G_SKIN, sharp=30)


def deck():
    """Плечи под порогом фонаря: обшивка плавно поднимается к раме, рама становится тонким кантом, а не стенкой над корпусом (f35_08, f35_09)."""
    rs = []
    for a in [2.30, 2.40, 2.50, 2.65, 2.85, 3.05, 3.25, 3.45, 3.70, 3.95, 4.20, 4.45, 4.70, 4.90, 5.10, 5.25, 5.32, 5.42, 5.55, 5.68, 5.80]:
        a_ = min(a, CAN_A1); hw = CAN_T[1](a_); sill = CAN_T[2](a_); top = sill - 0.012
        if a > CAN_A1: t_ = _sm((a - CAN_A1) / 0.48); top = top + (body_y(a, 0.0) - 0.004 - top) * t_
        wd = 0.26 * _sm((a - 2.30) / 0.5) * (1.0 - 0.75 * _sm((a - 4.9) / 0.45)); inn = hw + 0.02; out = inn + max(wd, 0.001)
        side = []
        for k in range(7):
            q = k / 6; x_ = out + (inn - out) * q; yb = body_y(a, min(x_, 1.2)); side.append((x_, yb + (max(top, yb) - yb) * _sm(q) - 0.030 * (1 - q) ** 2))   # край плеча входит в корпус под углом, а не вдоль него
        base = min(p[1] for p in side) - 0.22
        r = [P3(a, x_, y_) for x_, y_ in side] + [P3(a, inn * q_, top) for q_ in (0.6, 0.2, -0.2, -0.6)] + [P3(a, -x_, y_) for x_, y_ in reversed(side)] + [P3(a, -out, base), P3(a, out, base)]
        rs.append(r)
    return loft_obj('s_deck', rs, G_SKIN, sharp=50)


def cock_cut():
    def sec(a, y0, y1, hw): return [P3(a, -hw, y0), P3(a, hw, y0), P3(a, hw, y1), P3(a, -hw, y1)]
    st = stations(2.15, 4.85, 0.20)
    rs = [sec(a, FLOOR + 0.10 * max(0.0, 2.6 - a), 2.2, CK_HW(a)) for a in st]
    return loft_obj('c_cock', rs, G_COCK, sharp=25)


def build_skin():
    S = [core(), hump(), deck()]
    for sx in (1, -1): S += [intake(sx), boom(sx), wing_s(sx), stab_boss(sx)]
    host = S[0]
    for o in S[1:]:
        _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        c = duct_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = bore_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = cock_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'F35_skin'; host.data.name = 'F35_skin'
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
GROUND_Y = -2.200
NG = dict(a=4.05, hinge=(4.30, -0.42), rw=0.285, ww=0.165)
MG_A, MG_X = 9.30, 2.10
BAY_W = dict(a0=6.00, a1=11.05, x0=0.30, xm=0.92, x1=1.48, ch=0.22)   # отсек вооружения: от a, до a, x от оси, стык створок, x снаружи, срез углов


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


def _bay_x(a, x):
    """Срез углов плана отсека: x сжимается к середине у торцов."""
    B_ = BAY_W; k = min(1.0, (a - B_['a0']) / B_['ch'], (B_['a1'] - a) / B_['ch']); xc = (B_['x0'] + B_['x1']) / 2
    return xc + (x - xc) * (0.72 + 0.28 * max(0.0, k))


def doors():
    out = []
    B_ = BAY_W
    for sx in (1, -1):
        n_ = 'r' if sx > 0 else 'l'
        # отсек: внешняя створка, ось у наружной кромки; внутренняя, ось у внутренней кромки
        o1 = patch('bay_out_' + n_, lambda u, v: (B_['a0'] + 0.01 + (B_['a1'] - B_['a0'] - 0.02) * v, sx * (lambda a, xx: _bay_x(a, xx))(B_['a0'] + 0.01 + (B_['a1'] - B_['a0'] - 0.02) * v, B_['xm'] + 0.006 + (B_['x1'] - B_['xm'] - 0.012) * u)), 6, 24, dirn=1, lift=0.003, th=0.022, z0=-3.0, back=G_PRIMER)
        hx = sx * (B_['x1'] - 0.006); pv, ax_ = _hinge(hx, B_['a0'] + B_['ch'], B_['a1'] - B_['ch'], dz=-0.025); _rel(o1, pv)
        PARTS['bay_out_' + n_] = dict(pivot=pv.copy(), axis=ax_, range=(-86.0, 0.0) if sx > 0 else (0.0, 86.0), note='0 - закрыта (файл игры), открытие вниз на 86°, ось у наружной кромки')
        o2 = patch('bay_in_' + n_, lambda u, v: (B_['a0'] + 0.01 + (B_['a1'] - B_['a0'] - 0.02) * v, sx * _bay_x(B_['a0'] + 0.01 + (B_['a1'] - B_['a0'] - 0.02) * v, B_['x0'] + 0.006 + (B_['xm'] - B_['x0'] - 0.012) * u)), 6, 24, dirn=1, lift=0.003, th=0.022, z0=-3.0, back=G_PRIMER)
        hx = sx * (B_['x0'] + 0.006); pv, ax_ = _hinge(hx, B_['a0'] + B_['ch'], B_['a1'] - B_['ch'], dz=-0.025); _rel(o2, pv)
        PARTS['bay_in_' + n_] = dict(pivot=pv.copy(), axis=ax_, range=(0.0, 92.0) if sx > 0 else (-92.0, 0.0), note='0 - закрыта, открытие вниз на 92°, ось у внутренней кромки')
        out += [o1, o2]
        # основная стойка: большая створка, ось у наружной кромки (f35_01, f35_03)
        a0, a1, x0, x1 = 8.256, 10.294, 1.666, 2.408; nm = 'door_m_' + n_
        o3 = patch(nm, lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + (x1 - x0) * u)), 6, 8, dirn=1, lift=0.003, th=0.022, z0=-3.0, back=G_COCK)
        hx = sx * x1; pv, ax_ = _hinge(hx, a0, a1, dz=-0.035); _rel(o3, pv)
        PARTS[nm] = dict(pivot=pv.copy(), axis=ax_, range=(-76.0, 0.0) if sx > 0 else (0.0, 76.0), note='0 - закрыта, ось у наружной кромки')
        out.append(o3)
        # носовая: большая боковая панель и малая впереди
        a0, a1, x0, x1 = 2.030, 4.314, 0.196, 0.438; nm = 'door_n_' + n_
        o4 = patch(nm, lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + (x1 - x0) * u)), 4, 12, dirn=1, lift=0.003, th=0.020, z0=-3.0, back=G_COCK)
        hx = sx * x1; pv, ax_ = _hinge(hx, a0, a1, dz=-0.045); _rel(o4, pv)
        PARTS[nm] = dict(pivot=pv.copy(), axis=ax_, range=(-85.0, 0.0) if sx > 0 else (0.0, 85.0), note='большая панель: 0 - закрыта, ось у наружной кромки')
        out.append(o4)
        for nm, a0, a1, note in (('door_nf_' + n_, 2.030, 2.75, 'малая передняя'), ('door_nr_' + n_, 2.756, 4.314, 'малая задняя')):
            x0, x1 = 0.006, 0.190
            o5 = patch(nm, lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + (x1 - x0) * u)), 3, 6, dirn=1, lift=0.003, th=0.016, z0=-3.0, back=G_COCK)
            hx = sx * x1; pv, ax_ = _hinge(hx, a0, a1); _rel(o5, pv)
            PARTS[nm] = dict(pivot=pv.copy(), axis=ax_, range=(-92.0, 0.0) if sx > 0 else (0.0, 92.0), note=note + ': 0 - закрыта, ось у наружной кромки')
            out.append(o5)
    return out


def bays(host):
    """Ниши: отсеки вооружения с грунтовыми стенками, ниши шасси. Створки лежат на целой обшивке, ниши режутся после."""
    B_ = BAY_W; G = G_PRIMER
    for sx in (1, -1):
        st = [B_['a0'], B_['a0'] + 0.11, B_['a0'] + B_['ch']] + stations(B_['a0'] + 0.4, B_['a1'] - 0.4, 0.6) + [B_['a1'] - B_['ch'], B_['a1'] - 0.11, B_['a1']]
        rs = []
        for a in st:
            x0 = _bay_x(a, B_['x0']) - 0.002; x1 = _bay_x(a, B_['x1']) + 0.002; r = [P3(a, sx * x0, -0.12), P3(a, sx * x1, -0.12), P3(a, sx * x1, -1.6), P3(a, sx * x0, -1.6)]
            rs.append(r if sx > 0 else r[::-1])
        c = loft_obj('c_bay', rs, G, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
        a0, a1, x0, x1 = 8.25, 10.30, 1.66, 2.415; r0 = [P3(a0, sx * x0, 0.33), P3(a0, sx * x1, 0.33), P3(a0, sx * x1, -1.2), P3(a0, sx * x0, -1.2)]; r1 = [P3(a1, sx * x0, 0.33), P3(a1, sx * x1, 0.33), P3(a1, sx * x1, -1.2), P3(a1, sx * x0, -1.2)]
        c = loft_obj('c_bay', [r0, r1] if sx > 0 else [r0[::-1], r1[::-1]], G_COCK, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    a0, a1, hw = 2.0, 4.32, 0.445; rs = [[P3(a, -hw, -0.02), P3(a, hw, -0.02), P3(a, hw, -1.2), P3(a, -hw, -1.2)] for a in (a0, a1)]
    c = loft_obj('c_bay', rs, G_COCK, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)


def plane(stage=9, carve=True):
    import f35_detail as d
    PARTS.clear()
    skin = build_skin(); out = [skin]
    if stage >= 2:
        for sx in (1, -1): out += [fin(sx), rudder(sx), stab(sx), flaperon(sx), slat(sx), slat_seal(sx)]
        out += [nozzle(), burner()]
    if stage >= 3:
        out += [d.cockpit_detail()] + canopy()
        out += d.small(skin) + [d.fan(1), d.fan(-1)]
    if stage >= 4:
        out += doors()
        import f35_gear as gr; out += gr.gear_nose() + gr.gear_main(1) + gr.gear_main(-1)
        out += [d.bay_inner(1), d.bay_inner(-1), d.fuel_door()]
    if carve:
        print('канавок:', d.carve(skin))
    if stage >= 4: bays(skin); d.fuel_bay(skin)
    d.resharp(skin)
    return out
