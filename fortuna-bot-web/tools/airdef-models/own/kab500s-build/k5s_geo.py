# k5s_geo.py - геометрия КАБ-500С для build.py. Метры: ось корпуса - Y, нос +Y (в glTF -Z), верх (проушины) +Z (в glTF +Y), начало - на оси посередине длины 3,0 м (как фигура в игре).
# a - расстояние от острия носа. референс_1.png - вид на белом фоне в перспективе (основной: силуэт и расположение); положения вдоль оси пересчитаны с поправкой на перспективу, опора - длина 3,0 и Ø 0,40 у фигуры в игре.
# референс_2 и 3 - выставочные фото: швы, накладки, табличка, крышка сверху. Хвост, планки, проушины и короб - мои наработки с КАБ-500Л, сверены с этими картинками.
# Ревизия после замечания Mark «просто и пластиково»: нахлёсты листов обшивки вместо гладких поясов, фаски на всех тонких кромках, крепёж на накладках, крышке, колпаке, проушинах, планках и торце, короб с полками и хомутами, трубка у короба.
import math
from mathutils import Vector
from modelkit import B

L = 3.00
R = 0.200
NSEG = 56
G_BODY, G_STEEL, G_DARK, G_WHITE, G_CAP = 0, 1, 2, 3, 4      # корпус; накладки, планки; сетка крышки; табличка; колпак (красный или серый - по окраске)
XPHI = (45.0, 135.0, 225.0, 315.0)                           # рули и крылья «×», проушины сверху между ними
CAN_A, CAN_A0, CAN_A1 = 0.880, 0.660, 0.985                  # ось руля, корень от … до
CAN_TIP0, CAN_TIP1, CAN_R1 = 0.835, 0.965, 0.296             # конец руля: передняя и задняя кромка, вылет от оси (референс_1, 2)
CAN_RANGE = 20.0
PLANK0, PLANK1 = 2.400, 2.935                                # планка хвостового крыла
WING_TIP0, WING_TIP1, WING_R = 2.590, 2.935, 0.372           # конец крыла; при угле 0 верх × ниже проушин (задание Mark)
HINGE_R = 0.1715                                             # ось крыла от оси бомбы: вдоль корня
WING_RANGE = 25.0
LUGS = (1.650, 1.900)                                        # проушины (референс_1: x 302 и 337 с поправкой на перспективу)
LUG_H = 0.070
HATCH_A = 0.925                                              # круглая крышка с сеткой (референс_2, 3)
CAP_A = 1.125                                                # колпак за крышкой (референс_2, 3)
PLAQUE_A, PLAQUE_W, PLAQUE_H, PLAQUE_Z = 1.420, 0.150, 0.110, -0.012    # белая табличка на обоих бортах
BOX0, BOX1 = 0.985, 2.385                                    # короб вдоль низа (референс_1: x 195 … 400)
SLITS = ((1.030, 6, 0.4), (1.690, 8, 0.2), (1.870, 8, 0.7), (2.250, 8, 0.4), (2.350, 8, 0.0))    # дуги из тёмных прорезей: a, число прорезей, сдвиг (референс_1, 2, 3)
DOTS = [(a, z) for a in (1.070, 1.150, 1.230) for z in (0.035, 0.085, 0.135)]                     # отверстия панели на обоих бортах (референс_1: x 205-235, референс_3)
RIV_A = (0.748, 1.012, 1.048, 1.672, 1.708, 1.852, 1.888, 2.238, 2.262, 2.338, 2.362)      # ряды мелких заклёпок у нахлёстов
LAPS = (1.030, 1.690, 1.870, 2.250, 2.350)            # нахлёсты листов обшивки: следующий лист садится на предыдущий
RED_EDGE = 0.016                                             # ширина красной метки на задней кромке крыла (референс_2, 3)


def Yb(a): return L / 2 - a


def _axes(phi):
    ph = math.radians(phi); return Vector((math.cos(ph), 0.0, math.sin(ph))), Vector((-math.sin(ph), 0.0, math.cos(ph)))


def ringpts(a, r, n=NSEG):
    a0 = -math.pi / 2                                        # шов развёртки - снизу, под коробом
    return [Vector((r * math.cos(a0 + 2 * math.pi * k / n), Yb(a), r * math.sin(a0 + 2 * math.pi * k / n))) for k in range(n)]


def _ring(c, u, v, n, r, shift=None):
    """Кольцо из n точек вокруг c в плоскости (u, v); shift - сдвиг вдоль нормали."""
    return [c + (u * math.cos(2 * math.pi * q / n) + v * math.sin(2 * math.pi * q / n)) * r + (shift if shift is not None else Vector()) for q in range(n)]


def _bolt(b, c, n_, u, v, r=0.0065, h=0.0035, mat=None):
    """Головка болта: шестигранник с фаской, основание утоплено (шайба - в окраске и нормалях)."""
    m = G_STEEL if mat is None else mat
    b.loft([_ring(c, u, v, 6, r * 0.90, n_ * -0.002), _ring(c, u, v, 6, r * 0.90, n_ * h), _ring(c, u, v, 6, r * 0.64, n_ * (h + 0.0009))], m, cap1=m)


def _rivet(b, c, n_, u, v, r=0.0052, h=0.0024, mat=None):
    """Заклёпка-купол: низкая шестигранная пирамидка, при гладких нормалях выглядит круглой."""
    m = G_STEEL if mat is None else mat
    b.loft([_ring(c, u, v, 6, r, n_ * -0.002), _ring(c, u, v, 6, r * 0.82, n_ * (h * 0.6)), _ring(c, u, v, 6, r * 0.25, n_ * h)], m, cap1=m)


def _inset(poly, d):
    """Сдвиг многоугольника (a, r) внутрь на d: для фаски на кромках."""
    n = len(poly); area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n)); sg = 1.0 if area > 0 else -1.0
    out = []
    for i in range(n):
        p0, p1, p2 = poly[i - 1], poly[i], poly[(i + 1) % n]
        e1 = (p1[0] - p0[0], p1[1] - p0[1]); e2 = (p2[0] - p1[0], p2[1] - p1[1]); l1 = math.hypot(*e1); l2 = math.hypot(*e2)
        n1 = (-e1[1] / l1 * sg, e1[0] / l1 * sg); n2 = (-e2[1] / l2 * sg, e2[0] / l2 * sg)
        bx, by = n1[0] + n2[0], n1[1] + n2[1]; bl = max(1e-9, math.hypot(bx, by)); bx, by = bx / bl, by / bl
        k = d / max(0.45, bx * n1[0] + by * n1[1])
        out.append((p1[0] + bx * k, p1[1] + by * k))
    return out


def _plate_loft(b, P, poly, t, cham, mat):
    """Лист с фаской по всем кромкам: тонкая кромка посередине, грани смещены внутрь."""
    ins = _inset(poly, cham)
    b.loft([[P(a, r, t / 2) for a, r in ins], [P(a, r, 0.0) for a, r in poly], [P(a, r, -t / 2) for a, r in ins]], mat, cap0=mat, cap1=mat)


# ── профиль: прямой конус, поясок, плечо, цилиндр, сужение кормы, хвостовая труба с закруглённым торцом ──
RAW = [(0.000, 0.0015), (0.160, 0.0465), (0.725, 0.1870), (0.800, 0.1905), (0.900, 0.1950), (1.000, 0.1985), (1.120, R), (2.050, R), (2.130, 0.1945), (2.220, 0.1860), (2.300, 0.1740), (2.385, 0.1560),
       (2.440, 0.1500), (2.700, 0.1445), (2.900, 0.1385), (2.965, 0.1260), (2.9925, 0.0960)]


def R_at(a):
    for (a0, r0), (a1, r1) in zip(RAW, RAW[1:]):
        if a0 <= a <= a1: return r0 + (r1 - r0) * (a - a0) / max(a1 - a0, 1e-9)
    return RAW[-1][1] if a > 1 else RAW[0][1]


def body():
    Bd = G_BODY; lip = 0.0014
    # острие и наконечник, конус, поясок за конусом
    p = [(0.0, 0.0008), (0.006, 0.0022), (0.040, 0.0127), (0.100, 0.0296), (0.155, 0.0451), (0.157, 0.0444), (0.163, 0.0456), (0.165, 0.0474)]
    p += [(0.300, 0.0820), (0.450, 0.1195), (0.600, 0.1558), (0.722, 0.1868), (0.725, 0.1848), (0.732, 0.1848), (0.735, 0.1885)]
    a_prev = [(0.800, 0.1905), (0.900, 0.1950), (1.000, 0.1985), (1.060, 0.1995), (1.120, R), (1.300, R), (1.500, R), (2.050, R), (2.090, 0.1975), (2.130, 0.1945), (2.180, 0.1898), (2.220, 0.1860), (2.260, 0.1802), (2.300, 0.1740), (2.345, 0.1658), (2.385, 0.1560)]
    def laps_in(a0, a1):
        return [x for x in LAPS if a0 < x <= a1]
    last = 0.735
    for a, r in a_prev:
        for x in laps_in(last, a):                          # нахлёст: уступ листа и узкая тёмная щель
            rx = R_at(x)
            p += [(x - 0.0015, rx), (x, rx - 0.0012), (x + 0.0015, rx + lip), (x + 0.012, rx + lip * 0.8), (x + 0.030, rx + lip * 0.25)]
        last = a
        p.append((a, r))
    p += [(2.392, 0.1566), (2.406, 0.1548), (2.440, 0.1500), (2.700, 0.1445), (2.900, 0.1385), (2.935, 0.1345), (2.962, 0.1262), (2.980, 0.1140), (2.9925, 0.0960), (2.9935, 0.0900), (2.9935, 0.004)]
    b = B(); b.loft([ringpts(a, r) for a, r in p], Bd, cap0=Bd, cap1=Bd)
    return b.finish('K5S_body', sharp_deg=38)


# ── накладки рулей: клин с покатыми боками, шире к корме (референс_2, 3); рули с фаской; начало руля - на оси у накладки, ось радиальная ──
CAN_PIVOTS = {}
PLATE_H = 0.008


def can_plates():
    b = B(); a0, a1 = CAN_A0 - 0.045, CAN_A1 + 0.020; n = 12
    hw_ = lambda a: 0.030 + 0.030 * (a - a0) / (a1 - a0)
    for phi in XPHI:
        er, et = _axes(phi); P = lambda a, s, dr: Vector((0, Yb(a), 0)) + er * (R_at(a) + dr) + et * s
        st = [a0 + (a1 - a0) * j / n for j in range(n + 1)]
        def sec(a):
            w = hw_(a); return [P(a, -w, -0.012), P(a, w, -0.012), P(a, w, 0.0005), P(a, w * 0.94, PLATE_H - 0.0015), P(a, w * 0.89, PLATE_H), P(a, -w * 0.89, PLATE_H), P(a, -w * 0.94, PLATE_H - 0.0015), P(a, -w, 0.0005)]
        b.loft([sec(a) for a in st], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
        F = Vector((0, 1, 0))
        for j in range(5):                                       # заклёпки в ряд по обе стороны руля (референс_1: пять точек)
            a = CAN_A0 + 0.005 + j * 0.072
            for sg in (-1, 1):
                _rivet(b, P(a, sg * hw_(a) * 0.70, PLATE_H), er, F, et)
    return b.finish('K5S_plates')


def canard(k):
    phi = XPHI[k]; er, et = _axes(phi); r0 = R_at(CAN_A) + PLATE_H + 0.004
    o = Vector((0, Yb(CAN_A), 0)) + er * r0
    b = B()
    rroot = lambda a: R_at(a) + PLATE_H + 0.0040                # над куполами заклёпок нет: корень уже накладки, зазор 4 мм
    poly = [(CAN_A0, rroot(CAN_A0)), (CAN_A0 + 0.08, rroot(CAN_A0 + 0.08)), (CAN_A, rroot(CAN_A)), (CAN_A1, rroot(CAN_A1)), (CAN_TIP1, CAN_R1), (CAN_TIP0, CAN_R1)]
    P = lambda a, r, s: Vector((0, Yb(a), 0)) + er * r + et * s - o
    _plate_loft(b, P, poly, 0.0085, 0.006, G_BODY)
    # ступица: втулка с гайкой на оси и утолщение корня
    n = 16; X = Vector((0, 1, 0)); ring = lambda rr, ro: [er * rr + (X * math.cos(2 * math.pi * j / n) + et * math.sin(2 * math.pi * j / n)) * ro for j in range(n)]
    b.loft([ring(-0.0020, 0.019), ring(0.0015, 0.019), ring(0.0035, 0.016), ring(0.012, 0.010), ring(0.018, 0.007)], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    ob = b.finish(f'canard_{k}'); ob.location = o
    CAN_PIVOTS[k] = dict(o=o.copy(), axis=er.copy())
    return ob


# ── хвост: планки с рядами болтов (неподвижно), крылья на оси вдоль корня (начало - на оси посередине) ──
WING_PIVOTS = {}


def planks():
    b = B()
    for phi in XPHI:
        er, et = _axes(phi); P = lambda a, r, s: Vector((0, Yb(a), 0)) + er * r + et * s
        def sec(a):
            r0, r1 = R_at(a) - 0.006, HINGE_R - 0.019
            return [P(a, r0, -0.036), P(a, r0, 0.036), P(a, r1 - 0.002, 0.035), P(a, r1, 0.032), P(a, r1, -0.032), P(a, r1 - 0.002, -0.035)]
        b.loft([sec(PLANK0 + (PLANK1 - PLANK0) * j / 6) for j in range(7)], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
        F = Vector((0, 1, 0))
        for j in range(5):                                       # ряды болтов вдоль планки (референс_3)
            a = PLANK0 + 0.055 + j * 0.105
            for sg in (-1, 1):
                _bolt(b, P(a, HINGE_R - 0.019, sg * 0.0245), er, F, et, r=0.0062, h=0.0035)
        for a0_ in (PLANK0 + 0.012, PLANK1 - 0.030):            # проушины оси крыла на концах планки
            b.loft([[P(a0_, HINGE_R - 0.020, -0.011), P(a0_ + 0.018, HINGE_R - 0.020, -0.011), P(a0_ + 0.018, HINGE_R - 0.020, 0.011), P(a0_, HINGE_R - 0.020, 0.011)],
                    [P(a0_, HINGE_R - 0.0085, -0.009), P(a0_ + 0.018, HINGE_R - 0.0085, -0.009), P(a0_ + 0.018, HINGE_R - 0.0085, 0.009), P(a0_, HINGE_R - 0.0085, 0.009)]], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    return b.finish('K5S_planks')


def wing(k):
    phi = XPHI[k]; er, et = _axes(phi); am = (PLANK0 + PLANK1) / 2
    o = Vector((0, Yb(am), 0)) + er * HINGE_R
    b = B(); F = Vector((0, 1, 0))
    P = lambda a, r, s: Vector((0, Yb(a), 0)) + er * r + et * s - o
    poly = [(PLANK0 + 0.020, HINGE_R), (WING_TIP0, WING_R), (WING_TIP1, WING_R), (PLANK1 - 0.012, HINGE_R)]
    _plate_loft(b, P, poly, 0.0085, 0.008, G_BODY)
    # ось вдоль корня
    n = 10; ring = lambda a, r: [P(a, HINGE_R, 0) + (er * math.cos(2 * math.pi * j / n) + et * math.sin(2 * math.pi * j / n)) * r for j in range(n)]
    b.loft([ring(PLANK0 + 0.018, 0.0060), ring(PLANK0 + 0.020, 0.0072), ring(PLANK1 - 0.012, 0.0072), ring(PLANK1 - 0.010, 0.0060)], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    # ребро жёсткости с покатыми боками с двух сторон и заклёпками (референс_2)
    aR = WING_TIP1 - 0.135
    for sg in (1, -1):
        Ps = lambda a, r, h: P(a, r, sg * h)
        sec = lambda r: [Ps(aR - 0.011, r, 0.0035), Ps(aR - 0.006, r, 0.0066), Ps(aR + 0.006, r, 0.0066), Ps(aR + 0.011, r, 0.0035)]
        b.loft([sec(HINGE_R + 0.010), sec(WING_R - 0.006)], G_BODY, cap0=G_BODY, cap1=G_BODY)
        for j in range(5):
            r_ = HINGE_R + 0.030 + j * (WING_R - HINGE_R - 0.060) / 4
            _rivet(b, P(aR, r_, sg * 0.0066), et * sg, F, er, r=0.0034, h=0.0016, mat=G_BODY)
        # косынка на углу с заклёпками (референс_2, 3)
        a0, a1, r0, r1 = WING_TIP1 - 0.092, WING_TIP1 - 0.024, WING_R - 0.074, WING_R - 0.014
        b.loft([[P(a0, r0, sg * 0.0035), P(a1, r0, sg * 0.0035), P(a1, r1, sg * 0.0035), P(a0, r1, sg * 0.0035)], [P(a0 + 0.002, r0 + 0.002, sg * 0.0056), P(a1 - 0.002, r0 + 0.002, sg * 0.0056), P(a1 - 0.002, r1 - 0.002, sg * 0.0056), P(a0 + 0.002, r1 - 0.002, sg * 0.0056)]], G_STEEL, cap1=G_STEEL)
        for aa, rr in ((a0 + 0.009, r0 + 0.009), (a1 - 0.009, r0 + 0.009), (a1 - 0.009, r1 - 0.009), (a0 + 0.009, r1 - 0.009)):
            _rivet(b, P(aa, rr, sg * 0.0056), et * sg, F, er, r=0.0034, h=0.0016)
    ob = b.finish(f'wing_{k}'); ob.location = o
    WING_PIVOTS[k] = dict(o=o.copy(), axis=Vector((0, 1, 0)))
    return ob


# ── проушины: основание-капля на четырёх болтах, скоба-дуга вдоль оси со скруглённым сечением ──
def lugs():
    b = B(); X, Yv, Zv = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
    for a in LUGS:
        z0 = R - 0.006; y = Yb(a)
        ring_ = lambda h, rx, ry: [Vector((rx * math.cos(2 * math.pi * j / 28), y + ry * math.sin(2 * math.pi * j / 28), z0 + h)) for j in range(28)]
        b.loft([ring_(0.0, 0.041, 0.070), ring_(0.0075, 0.041, 0.070), ring_(0.0095, 0.038, 0.067), ring_(0.0125, 0.0345, 0.060), ring_(0.019, 0.022, 0.046)], G_BODY, cap0=G_BODY, cap1=G_BODY)
        for dx, dy in ((-0.024, -0.046), (0.024, -0.046), (-0.024, 0.046), (0.024, 0.046)):
            _bolt(b, Vector((dx, y + dy, z0 + 0.0095)), Zv, X, Yv, r=0.0056, h=0.003)
        zt = R + LUG_H; hy, rb, hx = 0.032, 0.0065, 0.011; zs = zt - hy - rb
        path = [(hy, z0 + 0.012), (hy, z0 + 0.025), (hy, zs)] + [(hy * math.cos(math.pi * j / 12), zs + hy * math.sin(math.pi * j / 12)) for j in range(1, 12)] + [(-hy, zs), (-hy, z0 + 0.025), (-hy, z0 + 0.012)]
        rings = []
        for j, (py, pz) in enumerate(path):
            p0 = path[max(j - 1, 0)]; p1 = path[min(j + 1, len(path) - 1)]
            ty, tz = p1[0] - p0[0], p1[1] - p0[1]; tl = math.hypot(ty, tz); ny, nz = -tz / tl, ty / tl
            sect = [(-1, -0.55), (-0.62, -1), (0.62, -1), (1, -0.55), (1, 0.55), (0.62, 1), (-0.62, 1), (-1, 0.55)]     # скруглённый прямоугольник
            rings.append([Vector((sx * hx, y + py + sy * rb * ny, pz + sy * rb * nz)) for sx, sy in sect])
        b.loft(rings, G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    return b.finish('K5S_lugs', sharp_deg=50)


def _top_frame(a):
    k = (R_at(a - 0.05) - R_at(a + 0.05)) / 0.10; n_ = Vector((0, k, 1)).normalized(); c = Vector((0, Yb(a), R_at(a)))
    return c, n_, Vector((1, 0, 0)), n_.cross(Vector((1, 0, 0))).normalized()


# ── круглая крышка: фланец на восьми болтах, кольцо, вдавленная сетка (референс_2, 3) ──
def hatch():
    b = B(); c, n_, X, F = _top_frame(HATCH_A)
    ring = lambda rr, h, m=48: [c + (X * math.cos(2 * math.pi * j / m) + F * math.sin(2 * math.pi * j / m)) * rr + n_ * h for j in range(m)]
    b.loft([ring(0.082, -0.012), ring(0.082, 0.0035), ring(0.080, 0.0055), ring(0.066, 0.0060), ring(0.064, 0.0125), ring(0.062, 0.0145), ring(0.054, 0.0145), ring(0.051, 0.0120), ring(0.049, 0.0060)], G_STEEL, cap0=G_STEEL)
    b.loft([ring(0.049, 0.0062, 48)], G_DARK, cap1=G_DARK)
    for j in range(8):
        ang = 2 * math.pi * (j + 0.5) / 8; p = c + (X * math.cos(ang) + F * math.sin(ang)) * 0.0735 + n_ * 0.0058
        _bolt(b, p, n_, X, F, r=0.0050, h=0.0028)
    return b.finish('K5S_hatch')


# ── колпак: восьмигранный с закраиной и ребром, на круглом основании с болтами (референс_2, 3: гранёный, с широким низом) ──
def cap():
    b = B(); c, n_, X, F = _top_frame(CAP_A)
    ring = lambda rr, h, m=32: [c + (X * math.cos(2 * math.pi * j / m) + F * math.sin(2 * math.pi * j / m)) * rr + n_ * h for j in range(m)]
    b.loft([ring(0.066, -0.012), ring(0.066, 0.0035), ring(0.064, 0.0055), ring(0.054, 0.0065)], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    for j in range(6):
        ang = 2 * math.pi * (j + 0.5) / 6; p = c + (X * math.cos(ang) + F * math.sin(ang)) * 0.0585 + n_ * 0.0058
        _bolt(b, p, n_, X, F, r=0.0040, h=0.0024)
    oct_ = lambda rr, h: [c + (X * math.cos(math.pi / 8 + 2 * math.pi * j / 8) + F * math.sin(math.pi / 8 + 2 * math.pi * j / 8)) * rr + n_ * h for j in range(8)]
    b.loft([oct_(0.052, 0.006), oct_(0.052, 0.012), oct_(0.0485, 0.0145), oct_(0.0465, 0.0165), oct_(0.0465, 0.042), oct_(0.0435, 0.0465), oct_(0.030, 0.0480), oct_(0.028, 0.0505), oct_(0.0, 0.0505)], G_CAP, cap0=G_CAP)
    return b.finish('K5S_cap', sharp_deg=30)


def box_under():
    """Короб вдоль низа: полки к обшивке, скос спереди, хомуты; трубка у передней кромки (референс_1)."""
    b = B(); st = [BOX0, BOX0 + 0.012, BOX0 + 0.035, BOX0 + 0.075, 1.25, 1.5, 1.75, 2.05, 2.13, 2.22, 2.30, BOX1 - 0.05, BOX1 - 0.015, BOX1]
    def fac(a):
        if a <= BOX0 + 0.075: return 0.25 + 0.75 * math.sin(min(1.0, (a - BOX0) / 0.075) * math.pi / 2)
        if a >= BOX1 - 0.05: return 0.25 + 0.75 * math.sin(min(1.0, (BOX1 - a) / 0.05) * math.pi / 2)
        return 1.0
    def sec(a):
        r = R_at(a); f = fac(a); w = 0.040; h = 0.030 * f; fl = 0.048       # полки шириной 8 мм
        zb = lambda x: -math.sqrt(max(0.0001, r * r - x * x))              # низ листа по обшивке
        return [Vector((-fl, Yb(a), zb(fl) + 0.003)), Vector((fl, Yb(a), zb(fl) + 0.003)), Vector((fl, Yb(a), zb(fl) - 0.0030)), Vector((w, Yb(a), zb(w) - 0.0032)),
                Vector((w * 0.94, Yb(a), zb(w) - h * 0.72)), Vector((w * 0.74, Yb(a), zb(w) - h)), Vector((-w * 0.74, Yb(a), zb(w) - h)), Vector((-w * 0.94, Yb(a), zb(w) - h * 0.72)), Vector((-w, Yb(a), zb(w) - 0.0032)), Vector((-fl, Yb(a), zb(fl) - 0.0030))]
    b.loft([sec(a) for a in st], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    for a in (1.20, 1.60, 2.00):                                   # хомуты поперёк короба
        for da in (-0.016, 0.016):
            pass
        rows = []
        for da in (-0.018, -0.016, 0.016, 0.018):
            q = sec(a + da); dh = 0.0 if abs(da) > 0.017 else 0.0028
            rows.append([p + Vector((0, 0, -dh)) + Vector((math.copysign(dh, p.x), 0, 0)) * 0.3 for p in q])
        b.loft(rows, G_STEEL)
    # трубка: выходит из передней кромки и уходит в обшивку
    pts = [(BOX0 + 0.020, 0.026, -0.010), (BOX0 - 0.012, 0.026, -0.008), (BOX0 - 0.040, 0.026, -0.001), (BOX0 - 0.062, 0.026, 0.006)]
    rings = []
    for a, x, dz in pts:
        z = -math.sqrt(R_at(a) ** 2 - x ** 2) + dz - 0.006
        rings.append([Vector((x + 0.0075 * math.cos(2 * math.pi * j / 10), Yb(a), z + 0.0075 * math.sin(2 * math.pi * j / 10))) for j in range(10)])
    b.loft(rings, G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    return b.finish('K5S_box')


def plaque():
    """Белая табличка на бортах: лист 2 мм с завальцованной кромкой по кривизне корпуса, четыре винта."""
    b = B(); N = 8
    for sx in (1, -1):
        zs = [PLAQUE_Z - PLAQUE_H / 2 + PLAQUE_H * j / N for j in range(N + 1)]
        P = lambda s_, z, dr: Vector((sx * (math.sqrt(R ** 2 - z ** 2) + dr), Yb(PLAQUE_A) + s_, z))
        W = PLAQUE_W / 2
        def sec(s_, dtop):
            return [P(s_, z, dtop) for z in zs] + [P(s_, z, -0.003) for z in reversed(zs)]
        b.loft([sec(-W, 0.0008), sec(-W + 0.002, 0.0022), sec(W - 0.002, 0.0022), sec(W, 0.0008)], G_WHITE, cap0=G_WHITE, cap1=G_WHITE)
        for s_ in (-W + 0.009, W - 0.009):
            for z in (PLAQUE_Z - PLAQUE_H / 2 + 0.009, PLAQUE_Z + PLAQUE_H / 2 - 0.009):
                c = P(s_, z, 0.0022); n_ = Vector((c.x, 0, c.z)).normalized(); u = Vector((0, 1, 0)); v = n_.cross(u)
                b.loft([_ring(c, u, v, 10, 0.0042, n_ * -0.0008), _ring(c, u, v, 10, 0.0042, n_ * 0.0008), _ring(c, u, v, 10, 0.0030, n_ * 0.0014)], G_STEEL, cap1=G_STEEL)
    return b.finish('K5S_plaque')


def bits():
    """Круглые крышки на хвостовой трубе с винтами, кольцо с болтами на торце."""
    b = B()
    for sx in (1, -1):
        for a, zc, rc in ((2.56, 0.018, 0.028), (2.71, -0.012, 0.028)):
            c = Vector((sx * R_at(a), Yb(a), zc)); n_ = Vector((sx * math.sqrt(1 - (zc / R_at(a)) ** 2), 0, zc / R_at(a))).normalized(); u = Vector((0, 1, 0)); v = n_.cross(u)
            b.loft([_ring(c, u, v, 24, rc, n_ * -0.006), _ring(c, u, v, 24, rc, n_ * 0.0018), _ring(c, u, v, 24, rc - 0.0025, n_ * 0.0034), _ring(c, u, v, 24, rc - 0.008, n_ * 0.0034)], G_STEEL, cap1=G_STEEL)
            for j in range(4):
                ang = math.pi / 4 + j * math.pi / 2; p = c + (u * math.cos(ang) + v * math.sin(ang)) * (rc - 0.0065) + n_ * 0.0034
                _rivet(b, p, n_, u, v, r=0.0028, h=0.0014)
    c = Vector((0, Yb(2.9935), 0)); n_ = Vector((0, -1, 0)); u = Vector((1, 0, 0)); v = Vector((0, 0, 1))
    b.loft([_ring(c, u, v, 32, 0.068, n_ * -0.001), _ring(c, u, v, 32, 0.068, n_ * 0.003), _ring(c, u, v, 32, 0.065, n_ * 0.005), _ring(c, u, v, 32, 0.040, n_ * 0.005), _ring(c, u, v, 32, 0.037, n_ * 0.002)], G_STEEL, cap1=G_STEEL)
    for j in range(8):
        ang = 2 * math.pi * j / 8; _bolt(b, c + (u * math.cos(ang) + v * math.sin(ang)) * 0.0525 + n_ * 0.005, n_, u, v, r=0.0045, h=0.0026)
    return b.finish('K5S_bits')


def bomb(stage=9):
    """Этапы: 1 - корпус; 2 - проушины, крышка, колпак, короб, табличка, мелочь; 3 - накладки и рули, планки и крылья."""
    out = [body()]
    if stage >= 2: out += [lugs(), hatch(), cap(), box_under(), plaque(), bits()]
    if stage >= 3: out += [can_plates(), planks()] + [canard(k) for k in range(4)] + [wing(k) for k in range(4)]
    return out
