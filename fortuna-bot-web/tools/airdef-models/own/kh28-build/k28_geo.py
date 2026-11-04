# k28_geo.py - геометрия Х-28 для build.py. Метры: ось корпуса - Y, нос +Y (в glTF -Z), верх (подвесные узлы) +Z (в glTF +Y), начало - на оси посередине длины 5,97 м (как фигура в игре).
# a - расстояние от острия носа. референс_1.png - вид сбоку на белом фоне (основной: x 348 - острие, x 2 - концы стабилизаторов, 17,25 мм/пикс., ось y 97,5); референс_2.png - фото: окраска, обтекатель, швы, форма крыльев.
# Вида сверху и сзади нет: размах крыльев и стабилизаторов, правая сторона и низ - додуманы симметрично (см. ОТЧЁТ).
import math
from mathutils import Vector
from modelkit import B

L = 5.97
R = 0.215
NSEG = 48
G_BODY, G_STEEL, G_DARK = 0, 1, 2                            # корпус, крылья и оперение; узлы, кромки сопла; нутро сопла и воздухозаборов
RADOME_A = 1.43                                              # стык обтекателя (референс_1: x 265)
TAIL_A = 5.735                                               # срез корпуса (референс_1: x 15,5); дальше - только концы стабилизаторов
WING_Z = -0.055                                              # плоскость крыльев (референс_1: y 100,5)
WING = dict(a0=2.690, tip0=4.865, tip1=4.905, a1=4.590, x0=0.190, xt=0.965)   # низкое крыло большой стреловидности (референс_1: x 192 … 64; размах по чертежу не виден, додуман)
RUD_RANGE = 15.0
LUGS = (2.100, 2.930)                                        # подвесные узлы сверху (референс_1: x 226 и x 178)
LUG_H = 0.052
RIV_A = (1.462, 2.048, 2.092, 3.180, 3.222, 4.180, 4.222, 4.918, 4.962)      # ряды мелких заклёпок у нахлёстов
LAPS = (2.070, 3.200, 4.200, 4.940)                          # нахлёсты листов обшивки
SLITS = ((2.130, 10, 0.2),)                                  # дуга прорезей за передним узлом (референс_1: x 224-232)
PANELS = ((2.28, 2.60, 0.02, 0.135), (3.26, 3.56, -0.02, 0.11), (3.95, 4.12, 0.03, 0.14), (4.98, 5.20, 0.00, 0.10))    # лючки на бортах: a0, a1, z0, z1
DOTS = [(a, z) for a0, a1, z0, z1 in PANELS for a in (a0 + 0.012, a1 - 0.012) for z in (z0 + 0.012, z1 - 0.012)]         # винты лючков
BELLY_LINE = 2.06                                            # линия стыка подбрюшья с корпусом, рад от верха


def Yb(a): return L / 2 - a


def _axes(phi):
    ph = math.radians(phi); return Vector((math.cos(ph), 0.0, math.sin(ph))), Vector((-math.sin(ph), 0.0, math.cos(ph)))


def _ring(c, u, v, n, r, shift=None):
    return [c + (u * math.cos(2 * math.pi * q / n) + v * math.sin(2 * math.pi * q / n)) * r + (shift if shift is not None else Vector()) for q in range(n)]


def _bolt(b, c, n_, u, v, r=0.0065, h=0.0035, mat=None):
    m = G_STEEL if mat is None else mat
    b.loft([_ring(c, u, v, 6, r * 0.90, n_ * -0.002), _ring(c, u, v, 6, r * 0.90, n_ * h), _ring(c, u, v, 6, r * 0.64, n_ * (h + 0.0009))], m, cap1=m)


# ── профиль корпуса: оживальный обтекатель, цилиндр, сужение кормы, закруглённый срез; подбрюшье - часть тех же колец ──
RAW = [(0.0, 0.003), (0.050, 0.020), (0.150, 0.051), (0.310, 0.088), (0.480, 0.119), (0.656, 0.149), (0.830, 0.174), (1.000, 0.194), (1.250, 0.211), (1.430, R), (4.900, R), (5.200, 0.205), (5.400, 0.188), (5.550, 0.166), (5.640, 0.146), (5.700, 0.122), (TAIL_A, 0.094)]


def R_at(a):
    for (a0, r0), (a1, r1) in zip(RAW, RAW[1:]):
        if a0 <= a <= a1: return r0 + (r1 - r0) * (a - a0) / max(a1 - a0, 1e-9)
    return RAW[-1][1] if a > 1 else RAW[0][1]


def _sm(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)


BELLY = [(1.950, 0.0), (2.170, 0.112), (3.415, 0.112), (3.760, 0.069), (4.100, 0.052), (4.450, 0.022), (4.800, 0.0)]    # глубина подбрюшья (референс_1: нижняя кромка y 116 … 110)


def belly(a):
    for (a0, d0), (a1, d1) in zip(BELLY, BELLY[1:]):
        if a0 <= a <= a1:
            t = (a - a0) / (a1 - a0); return d0 + (d1 - d0) * (_sm(t) if a0 == 1.950 else t)
    return 0.0


def ringpts(a, r, n=NSEG):
    d = belly(a); pts = []
    for k in range(n):
        th = 2 * math.pi * k / n; fold = min(th, 2 * math.pi - th)                       # угол от низа
        rr = r + d * _sm((math.radians(60.0) - fold) / math.radians(38.0))                # подбрюшье: плоско под низом, плавно уходит в корпус к бокам
        ang = -math.pi / 2 + th                                                           # шов развёртки - снизу
        pts.append(Vector((rr * math.cos(ang), Yb(a), rr * math.sin(ang))))
    return pts


def body():
    lip = 0.0014
    p = [(0.0, 0.0012), (0.006, 0.0050), (0.020, 0.0108), (0.050, 0.020), (0.150, 0.051), (0.310, 0.088), (0.480, 0.119), (0.656, 0.149), (0.830, 0.174), (1.000, 0.194), (1.125, 0.2045), (1.250, 0.211), (1.4265, 0.2148)]
    p += [(1.428, 0.2130), (1.436, 0.2130), (1.438, R)]                                    # стык обтекателя: тонкая канавка
    st = [1.85, 1.95, 2.0, 2.04, 2.10, 2.17, 2.9, 3.415, 3.76, 4.10, 4.45, 4.80, 4.90, 5.20, 5.40, 5.55, 5.64, 5.70, 5.72]
    last = 1.438
    for a in st:
        for x in LAPS:
            if last < x <= a:
                rx = R_at(x); p += [(x - 0.0015, rx), (x, rx - 0.0012), (x + 0.0015, rx + lip), (x + 0.012, rx + lip * 0.8), (x + 0.030, rx + lip * 0.25)]
        last = a; p.append((a, R_at(a)))
    # срез и полое сопло: скруглённая кромка, вогнутый конус внутрь, горло (референс_1 среза не показывает: додумано)
    mats_from = len(p)
    p += [(TAIL_A - 0.006, 0.0990), (TAIL_A, 0.0935), (TAIL_A + 0.0015, 0.0885), (TAIL_A, 0.0830), (TAIL_A - 0.030, 0.0765), (TAIL_A - 0.120, 0.0640), (TAIL_A - 0.260, 0.0460), (TAIL_A - 0.300, 0.0040)]
    mats = [G_BODY] * mats_from + [G_STEEL] * 4 + [G_DARK] * 3
    b = B(); b.loft([ringpts(a, r) if a < TAIL_A - 0.0065 or i < mats_from else [Vector((r * math.cos(-math.pi / 2 + 2 * math.pi * k / NSEG), Yb(a), r * math.sin(-math.pi / 2 + 2 * math.pi * k / NSEG))) for k in range(NSEG)] for i, (a, r) in enumerate(p)], mats, cap0=G_BODY, cap1=G_DARK)
    return b.finish('K28_body', sharp_deg=40)


def _inset(poly, d):
    n = len(poly); area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n)); sg = 1.0 if area > 0 else -1.0
    out = []
    for i in range(n):
        p0, p1, p2 = poly[i - 1], poly[i], poly[(i + 1) % n]
        e1 = (p1[0] - p0[0], p1[1] - p0[1]); e2 = (p2[0] - p1[0], p2[1] - p1[1]); l1 = math.hypot(*e1); l2 = math.hypot(*e2)
        n1 = (-e1[1] / l1 * sg, e1[0] / l1 * sg); n2 = (-e2[1] / l2 * sg, e2[0] / l2 * sg)
        bx, by = n1[0] + n2[0], n1[1] + n2[1]; bl = max(1e-9, math.hypot(bx, by)); bx, by = bx / bl, by / bl
        k = d / max(0.30, bx * n1[0] + by * n1[1])
        out.append((p1[0] + bx * k, p1[1] + by * k))
    return out


def _foil(b, poly, P, tof, cham, mat):
    """Пластина с острыми кромками: посередине кромка, толщина tof(r) у внутренних контуров, грани сходятся к кромке."""
    ins = _inset(poly, cham); ins2 = _inset(poly, cham * 0.35)
    b.loft([[P(a, r, tof(r) * 0.5) for a, r in ins], [P(a, r, tof(r) * 0.20) for a, r in ins2], [P(a, r, 0.0) for a, r in poly], [P(a, r, -tof(r) * 0.20) for a, r in ins2], [P(a, r, -tof(r) * 0.5) for a, r in ins]], mat, cap0=mat, cap1=mat)


# ── крылья: неподвижные, низко на корпусе; наплыв у корня с двух сторон ──
def wings():
    b = B(); W = WING
    for sg in (1, -1):
        P = lambda a, x, s: Vector((sg * x, Yb(a), WING_Z + s))
        poly = [(W['a0'], W['x0']), (W['tip0'], W['xt']), (W['tip1'], W['xt']), (W['a1'], W['x0'])]
        tof = lambda x: 0.046 + (0.008 - 0.046) * (x - W['x0']) / (W['xt'] - W['x0'])
        _foil(b, poly, P, tof, 0.014, G_BODY)
        # наплыв: длинная ложка вдоль корня
        st = [W['a0'] - 0.34, W['a0'] - 0.20, W['a0'], W['a0'] + 0.5, W['a1'] - 0.3, W['a1'] - 0.05, W['a1'] + 0.16]
        def sec(a, i):
            f = [0.05, 0.42, 0.82, 1.0, 0.90, 0.55, 0.05][i]; xr = 0.204; xo = xr + 0.052 * f; h = 0.026 * f + 0.002
            return [Vector((sg * (xr - 0.02), Yb(a), WING_Z + h * 1.1)), Vector((sg * xo, Yb(a), WING_Z + h * 0.32)), Vector((sg * (xo + 0.012 * f), Yb(a), WING_Z)), Vector((sg * xo, Yb(a), WING_Z - h * 0.32)), Vector((sg * (xr - 0.02), Yb(a), WING_Z - h * 1.1))]
        b.loft([sec(a, i) for i, a in enumerate(st)], G_BODY, cap0=G_BODY, cap1=G_BODY)
    return b.finish('K28_wings', sharp_deg=45)


# ── рули: 2 стабилизатора и 2 киля; у каждого своя ось, радиальная к плоскости (додумано, поворот на картинках не виден) ──
RUD = {
    'rudder_top': dict(er=Vector((0, 0, 1)), et=Vector((1, 0, 0)), o=Vector((0, 0, 0)), piv=5.240, root=(4.970, 5.555), tip=(5.385, 5.490), r0=0.165, r1=0.490, t0=0.030, t1=0.007),
    'rudder_bot': dict(er=Vector((0, 0, -1)), et=Vector((1, 0, 0)), o=Vector((0, 0, 0)), piv=5.170, root=(4.880, 5.450), tip=(5.040, 5.450), r0=0.190, r1=0.320, t0=0.030, t1=0.010),
    'rudder_l': dict(er=Vector((-1, 0, 0)), et=Vector((0, 0, 1)), o=Vector((0, 0, -0.025)), piv=5.320, root=(5.130, 5.560), tip=(5.850, 5.968), r0=0.160, r1=0.580, t0=0.026, t1=0.006),
    'rudder_r': dict(er=Vector((1, 0, 0)), et=Vector((0, 0, 1)), o=Vector((0, 0, -0.025)), piv=5.320, root=(5.130, 5.560), tip=(5.850, 5.968), r0=0.160, r1=0.580, t0=0.026, t1=0.006),
}
RUD_PIVOTS = {}


def _hull_clear(er, o, a):
    """Расстояние от оси ракеты до обшивки вдоль er при сдвиге o (с запасом на нахлёст)."""
    r = R_at(a); s = o.dot(er); perp = (o - er * s).length
    return math.sqrt(max(0.0, r * r - perp * perp)) - s + 0.006


def rudder(name):
    D = RUD[name]; er, et, o0 = D['er'], D['et'], D['o']
    rp = _hull_clear(er, o0, D['piv'])
    pivot = o0 + Vector((0, Yb(D['piv']), 0)) + er * rp
    root0, root1 = D['root']; tip0, tip1 = D['tip']; rt = D['r1']
    rb = lambda a: _hull_clear(er, o0, a)
    stn = [root0 + (root1 - root0) * j / 4 for j in range(5)]
    poly = [(a, rb(a)) for a in stn] + [(tip1, rt), (tip0, rt)]
    tof = lambda r: D['t0'] + (D['t1'] - D['t0']) * (r - rp) / max(rt - rp, 1e-6)
    P = lambda a, r, s: o0 + Vector((0, Yb(a), 0)) + er * r + et * s - pivot
    b = B(); _foil(b, poly, P, lambda r: max(0.006, tof(r)), 0.010, G_BODY)
    # ступица на оси: низ втулки с зазором над обшивкой
    F = Vector((0, 1, 0)); ring = lambda h, ro: [er * h + (F * math.cos(2 * math.pi * j / 14) + et * math.sin(2 * math.pi * j / 14)) * ro for j in range(14)]
    b.loft([ring(-0.0030, 0.020), ring(0.0015, 0.020), ring(0.006, 0.016), ring(0.014, 0.010)], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    ob = b.finish(name); ob.location = pivot
    RUD_PIVOTS[name] = dict(o=pivot.copy(), axis=er.copy())
    return ob


# ── подвесные узлы: основание на болтах и скоба (референс_1: x 178 с наклоном, x 226) ──
def lugs():
    b = B(); X, Yv, Zv = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
    for a in LUGS:
        z0 = R - 0.005; y = Yb(a)
        ring_ = lambda h, rx, ry: [Vector((rx * math.cos(2 * math.pi * j / 24), y + ry * math.sin(2 * math.pi * j / 24), z0 + h)) for j in range(24)]
        b.loft([ring_(0.0, 0.034, 0.058), ring_(0.0065, 0.034, 0.058), ring_(0.0085, 0.031, 0.055), ring_(0.0115, 0.027, 0.048), ring_(0.016, 0.018, 0.037)], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
        for dx, dy in ((-0.020, -0.038), (0.020, -0.038), (-0.020, 0.038), (0.020, 0.038)):
            _bolt(b, Vector((dx, y + dy, z0 + 0.0085)), Zv, X, Yv, r=0.0046, h=0.0026)
        zt = R + LUG_H; hy, rb, hx = 0.024, 0.0055, 0.009; zs = zt - hy - rb
        path = [(hy, z0 + 0.010), (hy, zs)] + [(hy * math.cos(math.pi * j / 10), zs + hy * math.sin(math.pi * j / 10)) for j in range(1, 10)] + [(-hy, zs), (-hy, z0 + 0.010)]
        rings = []
        for j, (py, pz) in enumerate(path):
            p0 = path[max(j - 1, 0)]; p1 = path[min(j + 1, len(path) - 1)]
            ty, tz = p1[0] - p0[0], p1[1] - p0[1]; tl = math.hypot(ty, tz); ny, nz = -tz / tl, ty / tl
            sect = [(-1, -0.55), (-0.62, -1), (0.62, -1), (1, -0.55), (1, 0.55), (0.62, 1), (-0.62, 1), (-1, 0.55)]
            rings.append([Vector((sx * hx, y + py + sy * rb * ny, pz + sy * rb * nz)) for sx, sy in sect])
        b.loft(rings, G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    return b.finish('K28_lugs', sharp_deg=50)


# ── мелочь сверху и на бортах: продолговатые обтекатели за крылом, воздухозаборы на бортах (референс_1: x 66, 88-102) ──
def _pod(b, a, phi, hl, hw_, h, mat):
    """Обтекатель-капля на обшивке вдоль оси."""
    er, et = _axes(phi); fr = [(-1.0, 0.0), (-0.72, 0.62), (-0.30, 0.95), (0.25, 1.0), (0.70, 0.66), (1.0, 0.0)]
    rings = []
    for t, f in fr:
        ac = a + t * hl; r0 = R_at(ac)
        c = Vector((0, Yb(ac), 0)) + er * r0
        w_ = max(hw_ * f, 0.002); hh = h * f + 0.0008
        rings.append([c + et * (-w_) + er * -0.006, c + et * (-w_ * 0.88) + er * (hh * 0.55), c + et * (-w_ * 0.45) + er * hh, c + et * (w_ * 0.45) + er * hh, c + et * (w_ * 0.88) + er * (hh * 0.55), c + et * w_ + er * -0.006])
    b.loft(rings, mat, cap0=mat, cap1=mat)


def bits():
    b = B()
    _pod(b, 4.260, 90.0, 0.070, 0.026, 0.024, G_STEEL); _pod(b, 4.395, 90.0, 0.055, 0.022, 0.030, G_STEEL); _pod(b, 4.505, 90.0, 0.045, 0.020, 0.020, G_STEEL); _pod(b, 4.810, 90.0, 0.050, 0.020, 0.016, G_STEEL)
    for phi in (22.0, 158.0):                                  # воздухозаборы на бортах (референс_1: x 84-92, референс_2)
        _pod(b, 4.555, phi, 0.085, 0.030, 0.026, G_STEEL)
        er, et = _axes(phi); ac = 4.490; c = Vector((0, Yb(ac), 0)) + er * (R_at(ac) + 0.0135)
        F = Vector((0, 1, 0)); b.loft([_ring(c, et, er, 12, 0.014, F * 0.0025), _ring(c, et, er, 12, 0.012, F * -0.006)], G_DARK, cap1=G_DARK)
    return b.finish('K28_bits', sharp_deg=50)


def missile(stage=9):
    """Этапы: 1 - корпус с подбрюшьем; 2 - крылья с наплывами; 3 - узлы и мелочь; 4 - рули."""
    out = [body()]
    if stage >= 2: out += [wings()]
    if stage >= 3: out += [lugs(), bits()]
    if stage >= 4: out += [rudder(n) for n in RUD]
    return out
