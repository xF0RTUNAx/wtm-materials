# kab_geo.py - геометрия КАБ-500Л для build.py. Метры: ось корпуса - Y, нос +Y (в glTF -Z), верх (проушины) +Z (в glTF +Y), начало - на оси посередине длины 3,05 м (как фигура в игре).
# a - расстояние от торца головки. Размеры сняты с референс_1.png (чертёжный вид сбоку на голубом фоне, 6,89 мм/пикс. вдоль оси, x 515 … 73), детали - референс_2 и референс_3 (фото; подставки и соседние изделия не берём).
import math
import bmesh
from mathutils import Vector, Matrix
import modelkit as mk
from modelkit import B

L = 3.05
R = 0.205
NSEG = 40
G_BODY, G_STEEL, G_DARK = 0, 1, 2                   # серый корпус; сталь (планки, накладки, головка); тёмное (короб, нутро кольца)
A_PIV = 0.300                                        # шарнир головки у вершины конуса
XPHI = (45.0, 135.0, 225.0, 315.0)                   # рули и крылья «×», проушины сверху между ними
CAN_A, CAN_A0, CAN_A1, CAN_R1 = 0.745, 0.625, 0.825, 0.295    # ось руля (от носа), корень от … до, конец руля от оси
CAN_RANGE = 20.0
PLANK0, PLANK1 = 2.445, 2.985                        # планка хвостового крыла
WING_TIP0, WING_TIP1, WING_R = 2.640, 2.985, 0.378   # конец крыла: передняя и задняя кромка, вылет от оси (при угле 0 верх × = 0,27 - ниже проушин 0,275, задание Mark)
HINGE_R = 0.1755                                     # ось крыла от оси бомбы: вдоль корня
WING_RANGE = 25.0
LUGS = (1.495, 1.745)                                # проушины (референс_1: x 298 и 262)
LUG_H = 0.070
HATCH_A = 0.845                                      # крышка люка сверху (референс_1, 2, 3)
BOX0, BOX1 = 0.930, 2.440                            # короб вдоль низа
BANDS = ((1.215, 1.345), (1.860, 2.000), (2.240, 2.340))    # тёмные пояса (референс_2: перед передней проушиной, за задней, на воротнике)
RIV_A = (1.205, 1.300, 1.445, 1.530, 1.920, 1.990, 2.035, 2.245)    # кольца заклёпок у стыков
CONE_A = 0.86                                        # носовой отсек темнее цилиндра (референс_2)


def Yb(a): return L / 2 - a


def _axes(phi):
    ph = math.radians(phi); return Vector((math.cos(ph), 0.0, math.sin(ph))), Vector((-math.sin(ph), 0.0, math.cos(ph)))


def ringpts(a, r, n=NSEG):
    a0 = -math.pi / 2                                # шов развёртки - снизу, под коробом
    return [Vector((r * math.cos(a0 + 2 * math.pi * k / n), Yb(a), r * math.sin(a0 + 2 * math.pi * k / n))) for k in range(n)]


# ── профиль: носовой конус, плечо, цилиндр, стыки секций, сужение кормы, воротник, хвостовая труба ──
RAW = [(0.306, 0.0207), (0.600, 0.168), (0.660, 0.180), (0.750, 0.192), (0.860, 0.199), (1.000, 0.2035), (1.180, R), (2.020, R), (2.100, 0.1965), (2.170, 0.1885), (2.250, 0.1825), (2.300, 0.179),
       (2.355, 0.152), (2.700, 0.146), (2.960, 0.139), (3.020, 0.126), (3.050, 0.096)]


def R_at(a):
    for (a0, r0), (a1, r1) in zip(RAW, RAW[1:]):
        if a0 <= a <= a1: return r0 + (r1 - r0) * (a - a0) / max(a1 - a0, 1e-9)
    return RAW[-1][1] if a > 1 else RAW[0][1]


def body():
    Bd = G_BODY
    p = [(0.325, 0.004), (0.325, 0.0198), (0.306, 0.0207)]         # гнездо шара головки на вершине конуса
    p += [(0.375, 0.057), (0.450, 0.094), (0.525, 0.131)]        # промежуточные станции конуса: без веера на тонких гранях
    for a, r in RAW[1:7]: p.append((a, r))
    s = 0.0028                                       # стыки: выступающие пояса секций (референс_2: кольца с заклёпками)
    def belt(a0, a1, r):
        return [(a0 - 0.003, r), (a0, r + s), (a1, r + s), (a1 + 0.003, r)]
    p += belt(1.22, 1.285, R) + belt(1.455, 1.515, R)
    p += [(1.60, R), (1.602, R - 0.002), (1.606, R - 0.002), (1.608, R)]       # шов
    p += belt(1.93, 1.975, R)
    for a, r in RAW[7:11]: p.append((a, r))
    p += belt(2.255, 2.300, 0.1805)                    # воротник перед хвостовой трубой (референс_1: x 178-183)
    p += [(2.304, 0.178), (2.355, 0.152), (2.360, 0.1505), (2.700, 0.146), (2.960, 0.139), (3.020, 0.126), (3.050, 0.096), (3.050, 0.004)]
    b = B(); b.loft([ringpts(a, r) for a, r in p], Bd, cap0=Bd, cap1=Bd)
    return b.finish('K5L_body')


# ── головка на шарнире: цилиндр с торцом-линзой, кольцо-стабилизатор на четырёх лопатках, шейка к конусу; начало - на оси в шарнире ──
def seeker():
    b = B(); ax = lambda a: Vector((0, A_PIV - a, 0))        # локальные координаты от шарнира; +Y к носу
    ring = lambda a, r, n=28: [Vector((r * math.cos(2 * math.pi * k / n), A_PIV - a, r * math.sin(2 * math.pi * k / n))) for k in range(n)]
    prof = [(0.000, 0.002), (0.002, 0.020), (0.004, 0.030), (0.0045, 0.040), (0.012, 0.049), (0.032, 0.056), (0.040, 0.0565), (0.044, 0.053), (0.050, 0.0535), (0.165, 0.0505), (0.175, 0.042), (0.210, 0.040),
            (0.225, 0.026), (0.278, 0.020), (0.290, 0.0167), (0.296, 0.0190), (0.300, 0.0195), (0.306, 0.0185), (0.312, 0.0152), (0.317, 0.0100), (0.3190, 0.0040)]   # шейка кончается шаром r 19,5 мм с центром в шарнире
    b.loft([ring(a, r) for a, r in prof], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    # кольцо: полая обечайка с торцами
    rr = [(0.135, 0.098), (0.245, 0.098), (0.250, 0.094), (0.250, 0.086), (0.135, 0.082), (0.130, 0.088)]
    rings = [ring(a, r, 36) for a, r in rr]; rings.append(rings[0])
    b.loft(rings, G_STEEL); bm = b.bm; bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    # лопатки между цилиндром и кольцом (референс_3: четыре тонкие, «×»)
    for phi in XPHI:
        er, et = _axes(phi); P = lambda a, r, s: er * r + et * s + Vector((0, A_PIV - a, 0))
        poly = [(0.150, 0.048), (0.215, 0.044), (0.240, 0.086), (0.150, 0.086)]
        b.loft([[P(a, r, 0.003) for a, r in poly], [P(a, r, -0.003) for a, r in poly]], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    ob = b.finish('seeker'); ob.location = (0.0, Yb(A_PIV), 0.0)
    return ob


# ── накладки рулей и рули: плита с болтами на конусе, руль со ступицей; начало руля - на оси у плиты, ось радиальная ──
CAN_PIVOTS = {}


def _ang_plate(b, er, et, a0, a1, hw_, h, mat, n=7):
    """Плита по образующей: верх идёт вдоль профиля корпуса на высоте h (станции через (a1-a0)/n, иначе хорда уходит внутрь конуса), низ утоплен."""
    P = lambda a, s, dr: Vector((0, Yb(a), 0)) + er * (R_at(a) + dr) + et * s
    st = [a0 + (a1 - a0) * j / n for j in range(n + 1)]
    b.loft([[P(a, -hw_, -0.012), P(a, hw_, -0.012), P(a, hw_, h), P(a, -hw_, h)] for a in st], mat, cap0=mat, cap1=mat)


def can_plates():
    b = B()
    for phi in XPHI:
        er, et = _axes(phi)
        _ang_plate(b, er, et, CAN_A0 - 0.030, CAN_A1 + 0.030, 0.052, 0.007, G_STEEL)
        n = er; ring = lambda p, r, h: [p + (Vector((0, 1, 0)) * math.cos(2 * math.pi * j / 6) + et * math.sin(2 * math.pi * j / 6)) * r + n * h for j in range(6)]
        for a in [CAN_A0 - 0.012 + k * 0.042 for k in range(6)]:          # болты в два ряда (референс_3)
            for s_ in (-0.038, 0.038):
                p = Vector((0, Yb(a), 0)) + er * (R_at(a) + 0.007) + et * s_
                b.loft([ring(p, 0.008, -0.002), ring(p, 0.007, 0.006)], G_STEEL, cap1=G_STEEL)
    return b.finish('K5L_plates')


def canard(k):
    phi = XPHI[k]; er, et = _axes(phi)
    r0 = R_at(CAN_A) + 0.013; o = Vector((0, Yb(CAN_A), 0)) + er * r0
    b = B(); t = 0.006
    def rroot(a): return R_at(a) + 0.0165                       # корень идёт вдоль образующей конуса, над болтами плиты (верх болта +0,013)
    poly = [(CAN_A0, rroot(CAN_A0)), (CAN_A0 + 0.05, rroot(CAN_A0 + 0.05)), (CAN_A, rroot(CAN_A)), (CAN_A1, rroot(CAN_A1)), (CAN_A1 - 0.015, CAN_R1), (CAN_A1 - 0.052, CAN_R1)]   # передняя кромка острая и длинная, задняя - почти поперёк
    P = lambda a, r, s: Vector((0, Yb(a), 0)) + er * r + et * s - o
    b.loft([[P(a, r, t / 2) for a, r in poly], [P(a, r, -t / 2) for a, r in poly]], G_BODY, cap0=G_BODY, cap1=G_BODY)
    n = 12; X = Vector((0, 1, 0)); ring = lambda rr, ro: [er * rr + (X * math.cos(2 * math.pi * j / n) + et * math.sin(2 * math.pi * j / n)) * ro for j in range(n)]
    b.loft([ring(-0.004, 0.017), ring(0.002, 0.017), ring(0.010, 0.009)], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    ob = b.finish(f'canard_{k}'); ob.location = o
    CAN_PIVOTS[k] = dict(o=o.copy(), axis=er.copy())
    return ob


# ── хвост: планки с рядами проушин-шарниров (неподвижно), крылья на оси вдоль корня (начало - на оси посередине) ──
WING_PIVOTS = {}


def planks():
    b = B()
    for phi in XPHI:
        er, et = _axes(phi); P = lambda a, r, s: Vector((0, Yb(a), 0)) + er * r + et * s
        for a0, a1 in ((PLANK0, PLANK1),):
            sec = lambda a: [P(a, R_at(a) - 0.006, -0.034), P(a, R_at(a) - 0.006, 0.034), P(a, HINGE_R - 0.019, 0.030), P(a, HINGE_R - 0.019, -0.030)]
            b.loft([sec(a0), sec(a1)], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
        # ряд проушин (референс_3: «гребёнка» у передней части корня): под осью крыла, зазор 1 мм
        for j in range(9):
            a = PLANK0 + 0.030 + j * 0.034; h0, h1 = HINGE_R - 0.020, HINGE_R - 0.0085
            b.loft([[P(a - 0.011, h0, -0.024), P(a + 0.011, h0, -0.024), P(a + 0.011, h0, 0.024), P(a - 0.011, h0, 0.024)],
                    [P(a - 0.011, h1, -0.012), P(a + 0.011, h1, -0.012), P(a + 0.011, h1, 0.012), P(a - 0.011, h1, 0.012)]], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    return b.finish('K5L_planks')


def wing(k):
    phi = XPHI[k]; er, et = _axes(phi); am = (PLANK0 + PLANK1) / 2
    o = Vector((0, Yb(am), 0)) + er * HINGE_R
    b = B(); t = 0.007
    P = lambda a, r, s: Vector((0, Yb(a), 0)) + er * r + et * s - o
    poly = [(PLANK0 + 0.020, HINGE_R), (WING_TIP0, WING_R), (WING_TIP1, WING_R), (PLANK1 - 0.012, HINGE_R)]
    def face(s):
        return [P(a, r, s) for a, r in poly]
    b.loft([face(t / 2), face(-t / 2)], G_BODY, cap0=G_BODY, cap1=G_BODY)
    # ось вдоль корня, ребро-накладка у задней кромки (референс_1: линия x 100) и косынка-табличка на углу (референс_3)
    n = 8; ring = lambda a, r: [P(a, HINGE_R, 0) + (er * math.cos(2 * math.pi * j / n) + et * math.sin(2 * math.pi * j / n)) * r for j in range(n)]
    b.loft([ring(PLANK0 + 0.018, 0.0072), ring(PLANK1 - 0.010, 0.0072)], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    aR = WING_TIP1 - 0.135
    b.loft([[P(aR - 0.006, HINGE_R + 0.008, 0.0065), P(aR + 0.006, HINGE_R + 0.008, 0.0065), P(aR + 0.006, WING_R, 0.0065), P(aR - 0.006, WING_R, 0.0065)],
            [P(aR - 0.006, HINGE_R + 0.008, -0.0065), P(aR + 0.006, HINGE_R + 0.008, -0.0065), P(aR + 0.006, WING_R, -0.0065), P(aR - 0.006, WING_R, -0.0065)]], G_BODY, cap0=G_BODY, cap1=G_BODY)
    a0, a1, r0, r1 = WING_TIP1 - 0.090, WING_TIP1 - 0.012, WING_R - 0.070, WING_R - 0.010
    b.loft([[P(a0, r0, 0.0052), P(a1, r0, 0.0052), P(a1, r1, 0.0052), P(a0, r1, 0.0052)], [P(a0, r0, -0.0052), P(a1, r0, -0.0052), P(a1, r1, -0.0052), P(a0, r1, -0.0052)]], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    ob = b.finish(f'wing_{k}'); ob.location = o
    WING_PIVOTS[k] = dict(o=o.copy(), axis=Vector((0, 1, 0)))
    return ob


# ── проушины: основание-бобышка, скоба (две стойки и перекладина, референс_3) ──
def lugs():
    b = B()
    for a in LUGS:
        z0 = R - 0.006; y = Yb(a)
        ring_ = lambda h, rx, ry: [Vector((rx * math.cos(2 * math.pi * j / 16), y + ry * math.sin(2 * math.pi * j / 16), z0 + h)) for j in range(16)]
        b.loft([ring_(0.0, 0.040, 0.066), ring_(0.012, 0.036, 0.062), ring_(0.019, 0.024, 0.050)], G_BODY, cap0=G_BODY, cap1=G_BODY)
        hx, zt = 0.011, R + LUG_H                    # скоба - дуга вдоль оси (референс_2, 3): прямые стойки и полукруглый верх, сечение 22 × 13 мм
        hy, rb = 0.032, 0.0065; zs = zt - hy - rb
        path = [(hy, z0 + 0.012), (hy, zs)] + [(hy * math.cos(math.pi * j / 8), zs + hy * math.sin(math.pi * j / 8)) for j in range(1, 8)] + [(-hy, zs), (-hy, z0 + 0.012)]
        rings = []
        for j, (py, pz) in enumerate(path):
            p0 = path[max(j - 1, 0)]; p1 = path[min(j + 1, len(path) - 1)]
            ty, tz = p1[0] - p0[0], p1[1] - p0[1]; tl = math.hypot(ty, tz); ny, nz = -tz / tl, ty / tl
            rings.append([Vector((sx * hx, y + py + sy * rb * ny, pz + sy * rb * nz)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
        b.loft(rings, G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    return b.finish('K5L_lugs')


# ── крышка люка, короб вдоль низа, мелочь хвоста и бортов ──
def hatch():
    b = B(); a = HATCH_A; r = R_at(a); k = (R_at(a - 0.05) - R_at(a + 0.05)) / 0.10
    n_ = Vector((0, k, 1)).normalized(); c = Vector((0, Yb(a), r))
    X, F = Vector((1, 0, 0)), n_.cross(Vector((1, 0, 0))).normalized()
    ring = lambda rr, h: [c + (X * math.cos(2 * math.pi * j / 24) + F * math.sin(2 * math.pi * j / 24)) * rr + n_ * h for j in range(24)]
    b.loft([ring(0.078, -0.012), ring(0.078, 0.006), ring(0.072, 0.012), ring(0.056, 0.012), ring(0.052, 0.018), ring(0.048, 0.024), ring(0.0, 0.024)], G_STEEL, cap0=G_STEEL)
    return b.finish('K5L_hatch')


def box_under():
    b = B(); st = [BOX0, BOX0 + 0.06, 1.10, 1.5, 2.02, 2.10, 2.17, 2.25, 2.30, 2.36, BOX1 - 0.03, BOX1]
    def sec(a, f=1.0):
        r = R_at(a); hw_ = 0.046; h = 0.030 * f
        return [Vector((-hw_, Yb(a), -r + 0.012)), Vector((hw_, Yb(a), -r + 0.012)), Vector((hw_ * 0.92, Yb(a), -r - h + 0.004)), Vector((hw_ * 0.70, Yb(a), -r - h)), Vector((-hw_ * 0.70, Yb(a), -r - h)), Vector((-hw_ * 0.92, Yb(a), -r - h + 0.004))]
    rings = [sec(a, 0.25 if (a == BOX0 or a == BOX1) else 1.0) for a in st]
    b.loft(rings, G_DARK, cap0=G_DARK, cap1=G_DARK)
    return b.finish('K5L_box')


def bits():
    """Хвост: хомуты между воротником и трубой, круглые крышки на бортах, пробка на борту (референс_1: x 298, 118, 135; референс_3)."""
    b = B()
    for sx in (1, -1):
        for z in (0.040, -0.040):                               # стяжки у воротника
            b.loft([[Vector((sx * (R_at(2.30) - 0.004), Yb(2.285), z - 0.016)), Vector((sx * (R_at(2.30) + 0.008), Yb(2.285), z - 0.016)), Vector((sx * (R_at(2.30) + 0.008), Yb(2.285), z + 0.016)), Vector((sx * (R_at(2.30) - 0.004), Yb(2.285), z + 0.016))],
                    [Vector((sx * (R_at(2.41) - 0.006), Yb(2.41), z - 0.016)), Vector((sx * (R_at(2.41) + 0.007), Yb(2.41), z - 0.016)), Vector((sx * (R_at(2.41) + 0.007), Yb(2.41), z + 0.016)), Vector((sx * (R_at(2.41) - 0.006), Yb(2.41), z + 0.016))]], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
        for a, zc, rc in ((2.62, 0.020, 0.030), (2.76, -0.012, 0.030)):
            c = Vector((sx * R_at(a), Yb(a), zc)); ring = lambda rr, h: [c + Vector((sx * h, rr * math.cos(2 * math.pi * j / 14), rr * math.sin(2 * math.pi * j / 14))) for j in range(14)]
            b.loft([ring(rc, -0.006), ring(rc, 0.002), ring(rc - 0.004, 0.004)], G_STEEL, cap1=G_STEEL)
        c = Vector((sx * R, Yb(1.49), -0.012)); ring = lambda rr, h: [c + Vector((sx * h, rr * math.cos(2 * math.pi * j / 6), rr * math.sin(2 * math.pi * j / 6))) for j in range(6)]
        b.loft([ring(0.022, -0.004), ring(0.022, 0.006), ring(0.016, 0.010)], G_STEEL, cap1=G_STEEL)
    return b.finish('K5L_bits')


def bomb(stage=9):
    """Этапы: 1 - корпус; 2 - проушины, люк, короб, мелочь; 3 - накладки и рули, планки и крылья; 4 - головка с кольцом."""
    out = [body()]
    if stage >= 2: out += [lugs(), hatch(), box_under(), bits()]
    if stage >= 3: out += [can_plates(), planks()] + [canard(k) for k in range(4)] + [wing(k) for k in range(4)]
    if stage >= 4: out += [seeker()]
    return out
