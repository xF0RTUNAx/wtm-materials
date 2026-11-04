# jsm_geo.py - геометрия AGM-158 JASSM для build.py. Метры: ось корпуса - Y, нос +Y (в glTF -Z), верх (упоры) +Z (в glTF +Y), начало - на оси посередине длины 4,27 м (как прежняя модель в игре).
# a - расстояние от острия носа. Все четыре картинки - перспектива; положения вдоль оси пересчитаны с поправкой на перспективу по референс_1, форма сечения и хвоста - референс_2, окраска и детали - референс_3 и 4.
# Сечение: плоский низ с острой гранью-скулой на боках, скруглённый верх; у хвоста переходит в круг вокруг сопла ниже оси. Размах, толщины и углы раскрытия прямо не сняты: см. ОТЧЁТ.
# Крылья и киль в файле сложены: wing1 / wing2 лежат под плоским низом хвостом назад, fin лежит плашмя на верхе хвоста. Раскрытие - только в паспорте.
import math
from mathutils import Vector, Matrix
from modelkit import B

L = 4.27
R = 0.24                                                     # средний радиус для развёртки
RG = 9.0                                                     # у этой модели маски не обрезаются по радиусу: крылья и киль - отдельный материал
NSEG = 56
G_BODY, G_WING, G_STEEL, G_DARK = 0, 1, 2, 3                 # корпус; крылья и киль; упоры, кромка сопла, люк; нутро сопла
SEAMS = (1.74, 2.39)                                         # тёмные швы (референс_1, 3, 4)
SEAM_W = 0.018
YELLOW = (1.00, 1.055)                                       # жёлтый поясок (референс_3, 4)
LUGS = (1.66, 2.50)                                          # упоры: передний перед швом, задний за швом (референс_1, 2)
LUG_H = 0.055
HATCH_A = 2.86                                               # люк сверху (референс_1, 2)
NOZ_Z, NOZ_R, NOZ_A = -0.105, 0.098, 4.245                   # сопло ниже оси (референс_2)
WING_PIV_A, WING_PIV_X = 1.600, 0.255                        # ось крыла: под скулой, у передней кромки корня (референс_1, 4)
WING_Z = -0.2535                                             # средняя плоскость сложенных крыльев: ниже плоского низа
WING_L, WING_C = 1.060, 0.222                                # длина и хорда консоли
WING_OPEN = 65.0                                             # раскрытие: остаётся стреловидность 25° (додумано, картинки в перспективе)
FIN_A0, FIN_A1, FIN_H = 3.700, 4.190, 0.500                  # киль: корень от … до, высота
FIN_OPEN = 90.0
PANELS = ((3.10, 3.40, 0.02, 0.12), (2.62, 2.80, -0.06, 0.03))              # лючки на бортах: a0, a1, z0, z1
DOTS = [(a, z) for a0, a1, z0, z1 in PANELS for a in (a0 + 0.012, a1 - 0.012) for z in (z0 + 0.012, z1 - 0.012)]
RIV_A = (1.722, 1.758, 2.372, 2.408)                         # редкие винты у швов
RIV_N = 22


def Yb(a): return L / 2 - a


# станции сечения: a, полуширина W, верх T, скула zc, низ B, показатель верха p
ST = [(0.000, 0.004, -0.136, -0.140, -0.144), (0.060, 0.056, -0.094, -0.160, -0.176), (0.150, 0.102, -0.045, -0.176, -0.200), (0.300, 0.156, 0.020, -0.190, -0.220), (0.500, 0.206, 0.085, -0.200, -0.230),
      (0.750, 0.246, 0.145, -0.205, -0.235), (1.000, 0.268, 0.185, -0.205, -0.235), (1.300, 0.278, 0.203, -0.205, -0.235), (3.000, 0.278, 0.205, -0.205, -0.235), (3.300, 0.272, 0.195, -0.205, -0.235),
      (3.600, 0.232, 0.158, -0.200, -0.232), (3.850, 0.192, 0.118, -0.195, -0.228), (4.050, 0.156, 0.078, -0.190, -0.222), (4.200, 0.126, 0.040, -0.180, -0.215), (4.270, 0.110, 0.020, -0.170, -0.210)]


def sect(a):
    for s0, s1 in zip(ST, ST[1:]):
        if s0[0] <= a <= s1[0]:
            t = (a - s0[0]) / max(s1[0] - s0[0], 1e-9); return tuple(s0[i] + (s1[i] - s0[i]) * t for i in range(1, 5))
    return ST[-1][1:] if a > 1 else ST[0][1:]


def _sm(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)


def T_at(a): return sect(a)[1]


def ring(a, inset=0.0, n=NSEG):
    """Кольцо сечения: начинается снизу по центру (шов развёртки), идёт на +X, скула, верх, -X. У хвоста смешивается с кругом вокруг сопла."""
    W, T, zc, Bt = sect(a); W -= inset; T -= inset; Bt += inset; zc += inset * 0.3
    rnd = _sm((a - 3.45) / 0.75); p = 0.82 + 0.18 * rnd
    Rc = NOZ_R + 0.012 - inset; pts = []
    nl = n // 4                                               # точек на низе от центра до скулы
    def half(k):
        """k от 0 (низ) до n/2 (верх) на стороне +X."""
        if k <= nl:
            t = k / nl; x = W * t; z = zc + (Bt - zc) * (1 - t * t)
            ang = -math.pi / 2 + (math.pi / 2) * t * 0.92
        else:
            t = (k - nl) / (n / 2 - nl) * (math.pi / 2); x = W * max(math.cos(t), 0.0) ** p; z = zc + (T - zc) * math.sin(t) ** p
            ang = -math.pi / 2 + (math.pi / 2) * 0.92 + (k - nl) / (n / 2 - nl) * (math.pi - (math.pi / 2) * 0.92)
        cx, cz = Rc * math.cos(ang), NOZ_Z + Rc * math.sin(ang)
        return (x + (cx - x) * rnd, z + (cz - z) * rnd)
    for k in range(n):
        if k <= n // 2: x, z = half(k)
        else:
            x, z = half(n - k); x = -x
        pts.append(Vector((x, Yb(a), z)))
    return pts


def _cring(a, r, n=NSEG):
    return [Vector((r * math.sin(2 * math.pi * k / n), Yb(a), NOZ_Z - r * math.cos(2 * math.pi * k / n))) for k in range(n)]


def body():
    d = 0.003; h = SEAM_W / 2
    st = [0.0, 0.015, 0.040, 0.060, 0.100, 0.150, 0.220, 0.300, 0.400, 0.500, 0.620, 0.750, 0.870, 1.000, 1.150, 1.300, 1.500]
    for s in SEAMS: st += [s - h - 0.002, ('g', s - h), ('g', s + h), s + h + 0.002]
    st += [2.70, 3.000, 3.150, 3.300, 3.450, 3.600, 3.725, 3.850, 3.925, 4.000, 4.060, 4.110, 4.150, 4.180]
    rings, mats = [], []
    for s in st:
        if isinstance(s, tuple): rings.append(ring(s[1], d))
        else: rings.append(ring(s))
        mats.append(G_BODY)
    # кромка сопла и полое нутро: круг с центром ниже оси (референс_2)
    for a, r, m in ((4.205, NOZ_R + 0.011, G_BODY), (NOZ_A - 0.008, NOZ_R + 0.003, G_STEEL), (NOZ_A, NOZ_R - 0.002, G_STEEL), (NOZ_A + 0.002, NOZ_R - 0.007, G_STEEL), (NOZ_A, NOZ_R - 0.013, G_DARK), (NOZ_A - 0.050, NOZ_R - 0.021, G_DARK), (NOZ_A - 0.180, NOZ_R - 0.036, G_DARK), (NOZ_A - 0.300, NOZ_R - 0.060, G_DARK)):
        rings.append(_cring(a, r)); mats.append(m)
    rings.append(_cring(NOZ_A - 0.300, 0.004)); mats.append(G_DARK)
    b = B(); b.loft(rings, mats[:-1], cap0=G_BODY, cap1=G_DARK)
    return b.finish('JSM_body', sharp_deg=36)


# ── наплывы по бокам: плоские скулы, расходятся к хвосту (референс_2, 3) ──
def strakes():
    """Плоские наплывы: внешняя кромка почти прямая от скулы до среза (референс_2, 3), плита сидит ниже оси и уходит внутрь обшивки."""
    b = B(); st = [(2.90, 0.2780), (3.20, 0.2840), (3.50, 0.2860), (3.80, 0.2800), (4.05, 0.2660), (4.20, 0.2540), (4.27, 0.2480)]
    for sg in (1, -1):
        rings = []
        for a, xo in st:
            W, T, zc, Bt = sect(a); rn = _sm((a - 3.45) / 0.75)
            zo = zc + (-0.158 - zc) * rn; xi = max(0.094, W * 0.70); f = min(1.0, (xo - W + 0.001) / 0.02) if a < 3.3 else 1.0
            th = 0.0055 * f + 0.0007
            rings.append([Vector((sg * xi, Yb(a), zo + 0.012)), Vector((sg * (xo - 0.030 * f), Yb(a), zo + th)), Vector((sg * xo, Yb(a), zo + 0.0005)), Vector((sg * xo, Yb(a), zo - 0.0005)), Vector((sg * (xo - 0.030 * f), Yb(a), zo - th * 0.7)), Vector((sg * xi, Yb(a), zo - 0.012))])
        b.loft(rings, G_BODY, cap0=G_BODY, cap1=G_BODY)
    return b.finish('JSM_strakes', sharp_deg=40)


def _inset(poly, d):
    n = len(poly); area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n)); sg = 1.0 if area > 0 else -1.0
    out = []
    for i in range(n):
        p0, p1, p2 = poly[i - 1], poly[i], poly[(i + 1) % n]
        e1 = (p1[0] - p0[0], p1[1] - p0[1]); e2 = (p2[0] - p1[0], p2[1] - p1[1]); l1 = math.hypot(*e1); l2 = math.hypot(*e2)
        n1 = (-e1[1] / l1 * sg, e1[0] / l1 * sg); n2 = (-e2[1] / l2 * sg, e2[0] / l2 * sg)
        bx, by = n1[0] + n2[0], n1[1] + n2[1]; bl = max(1e-9, math.hypot(bx, by)); bx, by = bx / bl, by / bl
        k = d / max(0.35, bx * n1[0] + by * n1[1])
        out.append((p1[0] + bx * k, p1[1] + by * k))
    return out


def _foil(b, poly, P, th, cham, mat):
    ins = _inset(poly, cham); ins2 = _inset(poly, cham * 0.35)
    b.loft([[P(u, v, th * 0.5) for u, v in ins], [P(u, v, th * 0.22) for u, v in ins2], [P(u, v, 0.0) for u, v in poly], [P(u, v, -th * 0.22) for u, v in ins2], [P(u, v, -th * 0.5) for u, v in ins]], mat, cap0=mat, cap1=mat)


# ── крылья: сложены назад под плоским низом; начало на вертикальной оси у корня ──
WING_PIVOTS = {}


def wing(name, sg):
    ds, dd = 0.045, 0.040                                      # ось внутри консоли: от передней кромки и корня
    pivot = Vector((sg * (WING_PIV_X - dd), Yb(WING_PIV_A + ds), WING_Z))
    # в сложенном виде: s - назад вдоль корпуса (-Y), d - к оси ракеты; передняя кромка снаружи
    P = lambda s, d, t: Vector((-sg * (d - dd), -(s - ds), t))
    poly = [(0.0, 0.0), (WING_L, 0.0), (WING_L - 0.125, WING_C), (0.085, WING_C), (0.0, WING_C - 0.045)]
    b = B(); _foil(b, poly, P, 0.021, 0.012, G_WING)
    # ступица на оси: шайба между консолью и низом корпуса
    n = 18; rg = lambda h, r: [Vector((r * math.cos(2 * math.pi * j / n), r * math.sin(2 * math.pi * j / n), h)) for j in range(n)]
    b.loft([rg(-0.0120, 0.028), rg(-0.0105, 0.031), rg(0.0105, 0.031), rg(0.0150, 0.026)], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    # полоса управления у конца (референс_1, 3: линия вдоль консоли): задняя часть конца чуть утолщена
    ob = b.finish(name); ob.location = pivot
    WING_PIVOTS[name] = dict(o=pivot.copy(), open_deg=sg * WING_OPEN)
    return ob


# ── киль: лежит плашмя на верхе хвоста (+X); начало на шарнире посередине корня; ось вдоль корня, раскрытие +90° ──
FIN_PIVOT = {}


def _hinge_z(a): return T_at(a) + 0.030


def fin():
    a0, a1 = FIN_A0, FIN_A1; z0, z1 = _hinge_z(a0), _hinge_z(a1)
    p0 = Vector((0, Yb(a0), z0)); p1 = Vector((0, Yb(a1), z1)); u = (p1 - p0).normalized()   # к хвосту и вниз
    am = (a0 + a1) / 2; pivot = (p0 + p1) / 2
    X = Vector((1, 0, 0)); nrm = X.cross(u).normalized()                                    # нормаль сложенной плоскости
    if nrm.z < 0: nrm = -nrm
    P = lambda s, h, t: u * s + X * h + nrm * t
    c = (a1 - a0) / 2
    poly = [(-c, 0.012), (c - 0.015, 0.012), (c + 0.040, FIN_H), (-c + 0.170, FIN_H)]    # s вдоль оси, h от шарнира; конец отклонён назад (референс_1, 2)
    b = B(); _foil(b, poly, P, 0.024, 0.012, G_WING)
    # трубка шарнира на самом киле, ниже - неподвижный гребень
    n = 10; rg = lambda s, r: [u * s + (X * math.cos(2 * math.pi * j / n) + nrm * math.sin(2 * math.pi * j / n)) * r for j in range(n)]
    b.loft([rg(-c + 0.02, 0.0075), rg(-c + 0.025, 0.0100), rg(c - 0.025, 0.0100), rg(c - 0.02, 0.0075)], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    ob = b.finish('fin'); ob.location = pivot
    FIN_PIVOT.update(o=pivot.copy(), axis=u.copy(), open_deg=FIN_OPEN)
    return ob


def spine():
    """Неподвижный гребень под шарниром киля и площадка (референс_1, 2, 4)."""
    b = B(); st = [FIN_A0 - 0.16, FIN_A0 - 0.05, FIN_A0, (FIN_A0 + FIN_A1) / 2, FIN_A1, FIN_A1 + 0.040]
    fac = [0.05, 0.7, 1.0, 1.0, 1.0, 0.25]
    z0, z1 = _hinge_z(FIN_A0), _hinge_z(FIN_A1)
    def line(a): return z0 + (z1 - z0) * (a - FIN_A0) / (FIN_A1 - FIN_A0)
    rings = []
    for a, f in zip(st, fac):
        y = Yb(a); T = T_at(a); h = max(0.002, (line(a) - T - 0.0125) * f); w = 0.030 * f + 0.004
        rings.append([Vector((-w * 1.9, y, T - 0.022)), Vector((-w, y, T + h * 0.72)), Vector((-w * 0.45, y, T + h)), Vector((w * 0.45, y, T + h)), Vector((w, y, T + h * 0.72)), Vector((w * 1.9, y, T - 0.022))])
    b.loft(rings, G_BODY, cap0=G_BODY, cap1=G_BODY)
    return b.finish('JSM_spine', sharp_deg=50)


# ── упоры: плита с болтами и скоба (референс_1, 2, 3); люк с линзой сверху ──
def _bolt(b, c, n_, u, v, r=0.0046, h=0.0026):
    rg = lambda rr, hh: [c + (u * math.cos(2 * math.pi * q / 6) + v * math.sin(2 * math.pi * q / 6)) * rr + n_ * hh for q in range(6)]
    b.loft([rg(r * 0.9, -0.002), rg(r * 0.9, h), rg(r * 0.64, h + 0.0009)], G_STEEL, cap1=G_STEEL)


def lugs():
    b = B(); X, Yv, Zv = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
    for a in LUGS:
        T = T_at(a); y = Yb(a); pw, pl = 0.042, 0.062
        def rr(w, l, h): return [Vector((-w, y - l, T + h)), Vector((w, y - l, T + h)), Vector((w, y + l, T + h)), Vector((-w, y + l, T + h))]
        b.loft([rr(pw, pl, -0.008), rr(pw, pl, 0.0035), rr(pw - 0.003, pl - 0.003, 0.0060)], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
        for dx, dy in ((-0.030, -0.048), (0.030, -0.048), (-0.030, 0.048), (0.030, 0.048)): _bolt(b, Vector((dx, y + dy, T + 0.006)), Zv, X, Yv)
        zt = T + LUG_H; hy, rb, hx = 0.026, 0.0055, 0.011; zs = zt - rb - 0.010
        path = [(hy, T + 0.002), (hy, zs), (hy * 0.86, zs + 0.0065), (hy * 0.55, zs + 0.0095), (0.0, zs + 0.0100), (-hy * 0.55, zs + 0.0095), (-hy * 0.86, zs + 0.0065), (-hy, zs), (-hy, T + 0.002)]
        rings = []
        for j, (py, pz) in enumerate(path):
            p0 = path[max(j - 1, 0)]; p1 = path[min(j + 1, len(path) - 1)]
            ty, tz = p1[0] - p0[0], p1[1] - p0[1]; tl = math.hypot(ty, tz); ny, nz = -tz / tl, ty / tl
            rings.append([Vector((sx * hx, y + py + sy * rb * ny, pz + sy * rb * nz)) for sx, sy in ((-1, -0.6), (-0.65, -1), (0.65, -1), (1, -0.6), (1, 0.6), (0.65, 1), (-0.65, 1), (-1, 0.6))])
        b.loft(rings, G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    # люк
    a = HATCH_A; c = Vector((0, Yb(a), T_at(a))); n_ = Zv; rg = lambda r, h, m=24: [c + (X * math.cos(2 * math.pi * q / m) + Yv * math.sin(2 * math.pi * q / m)) * r + n_ * h for q in range(m)]
    b.loft([rg(0.046, -0.008), rg(0.046, 0.0020), rg(0.042, 0.0040), rg(0.032, 0.0042), rg(0.026, 0.0065), rg(0.014, 0.0095), rg(0.0, 0.0105)], G_STEEL, cap0=G_STEEL)
    for j in range(6):
        ang = 2 * math.pi * (j + 0.5) / 6; _bolt(b, c + (X * math.cos(ang) + Yv * math.sin(ang)) * 0.0375 + n_ * 0.0040, n_, X, Yv, r=0.0030, h=0.0016)
    return b.finish('JSM_lugs', sharp_deg=50)


def missile(stage=9):
    """Этапы: 1 - корпус; 2 - наплывы, гребень, упоры, люк; 3 - сложенные крылья и киль."""
    out = [body()]
    if stage >= 2: out += [strakes(), spine(), lugs()]
    if stage >= 3: out += [wing('wing1', 1), wing('wing2', -1), fin()]
    return out
