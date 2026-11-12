# b1b_geo.py - геометрия B-1B Lancer для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z (в glTF: нос -Z, правое крыло +X, верх +Y).
# a - расстояние от острия носа назад (0 ... 44,5, концы стабилизатора). z - высота от средней плоскости прежней модели игры (низ гондол -4,4, верх киля +4,4).
# Длина и габариты - по прежней модели игры (44,5 м, размах при сложенном крыле 24,1 м); форма - по фото Mark (референсы/b1b_01…13).
# Сетки и текстуры чужих моделей не используются: прежняя модель только снята в ортопроекциях для сверки габаритов (_снимки/игра_*.png).
#
# Корпус с наплывом - одно тело: каждое сечение строится лучами из центра по неявной функции (фюзеляж-суперэллипс, гладко объединённый с наплывом-профилем),
# поэтому переход фюзеляжа в наплыв без ступеньки. Гондолы - свои тела: спереди прямоугольный короб с двумя каналами, сзади две трубы двигателей.
import math
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 44.50
G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_RADOME, G_DUCT = 0, 1, 2, 3, 4, 5, 6, 7
PARTS = {}       # имя -> dict(pivot, axis, range, note[, kind])
STATIONS = {}
NOZ = []         # (центр среза, радиус)


def Yb(a): return L / 2 - a
def P3(a, x, z): return Vector((x, Yb(a), z))


class Track:
    """Гладкая интерполяция таблицы (монотонный кубический Эрмит)."""
    def __init__(self, pts):
        self.x = [p[0] for p in pts]; self.y = [p[1] for p in pts]; n = len(pts)
        d = [(self.y[i + 1] - self.y[i]) / (self.x[i + 1] - self.x[i]) for i in range(n - 1)]
        m = [d[0]] + [0.0 if d[i - 1] * d[i] <= 0 else 3 * (self.x[i + 1] - self.x[i - 1]) / ((2 * self.x[i + 1] - self.x[i] - self.x[i - 1]) / d[i - 1] + (self.x[i + 1] + self.x[i] - 2 * self.x[i - 1]) / d[i]) for i in range(1, n - 1)] + [d[-1]]
        self.m = m

    def __call__(self, t):
        x, y, m = self.x, self.y, self.m
        if t <= x[0]: return y[0]
        if t >= x[-1]: return y[-1]
        i = next(k for k in range(len(x) - 1) if x[k] <= t <= x[k + 1]); h = x[i + 1] - x[i]; s = (t - x[i]) / h
        return (2 * s ** 3 - 3 * s ** 2 + 1) * y[i] + (s ** 3 - 2 * s ** 2 + s) * h * m[i] + (-2 * s ** 3 + 3 * s ** 2) * y[i + 1] + (s ** 3 - s ** 2) * h * m[i + 1]


def tracks(table):
    return [Track([(r[0], r[i + 1]) for r in table]) for i in range(len(table[0]) - 1)]


def stations(a0, a1, da):
    n = max(2, int(round((a1 - a0) / da))); return [a0 + (a1 - a0) * i / n for i in range(n + 1)]


def _sm(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)


def smin(a, b, k):
    if k <= 0: return min(a, b)
    h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25


def thk(u):
    u = max(0.0, min(1.0, u)); return 5 * (0.2969 * math.sqrt(u) - 0.1260 * u - 0.3516 * u ** 2 + 0.2843 * u ** 3 - 0.1015 * u ** 4)


def loft_obj(name, rings, mat=G_SKIN, cap0=True, cap1=True, sharp=38):
    b = B(); b.loft(rings, mat, cap0=mat if cap0 else None, cap1=mat if cap1 else None)
    return b.finish(name, sharp_deg=sharp)


def _rel(ob, pivot):
    for v in ob.data.vertices: v.co -= pivot
    ob.location = pivot
    return ob


# ── сечение по неявной функции: f(x, z) < 0 внутри; луч из центра, дальняя граница; равный шаг по длине с загущением на остром ──
def ring_from_field(a, f, cx, cz, rmax, n, nray=900, sharp_w=6.0, start=-math.pi / 2):
    pts = []
    for k in range(nray):
        th = start + 2 * math.pi * k / nray; dx, dz = math.cos(th), math.sin(th)
        lo, hi = 0.0, rmax
        if f(cx + dx * hi, cz + dz * hi) < 0: r = hi
        else:
            # шаг снаружи внутрь до первого «внутри», потом деление пополам
            st = rmax / 120.0; r_ = rmax
            while r_ > 0 and f(cx + dx * r_, cz + dz * r_) >= 0: r_ -= st
            lo, hi = max(r_, 0.0), r_ + st
            for _ in range(22):
                mid = (lo + hi) / 2
                if f(cx + dx * mid, cz + dz * mid) < 0: lo = mid
                else: hi = mid
            r = (lo + hi) / 2
        pts.append((cx + dx * r, cz + dz * r))
    m = len(pts); w = [0.0]
    for i in range(m):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % m]
        e0 = (p1[0] - p0[0], p1[1] - p0[1]); e1 = (p2[0] - p1[0], p2[1] - p1[1]); l1 = math.hypot(*e1)
        t0 = math.atan2(e0[1], e0[0]); t1 = math.atan2(e1[1], e1[0]); dt = abs((t1 - t0 + math.pi) % (2 * math.pi) - math.pi)
        w.append(w[-1] + l1 * (1.0 + sharp_w * min(dt, 1.0) / max(l1, 1e-4) * 0.02))
    out = []; j = 0; tot = w[-1]
    for k in range(n):
        s = tot * k / n
        while w[j + 1] < s: j += 1
        t = (s - w[j]) / max(w[j + 1] - w[j], 1e-12); p, q = pts[j], pts[(j + 1) % m]
        out.append(P3(a, p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
    return out


# ── фюзеляж: (a, верх, низ, полуширина, показатель верха, показатель низа) по оси; профиль - фото 05, 13 и прежняя модель ──
FUS = [(0.00, -2.42, -2.48, 0.010, 2.0, 2.0), (0.25, -2.26, -2.66, 0.140, 2.0, 2.0), (0.70, -2.08, -2.84, 0.290, 2.0, 2.1), (1.50, -1.82, -3.00, 0.470, 2.0, 2.3),
       (3.00, -1.42, -3.08, 0.780, 2.05, 2.6), (4.50, -1.00, -3.10, 1.020, 2.1, 2.9), (5.50, -0.60, -3.10, 1.130, 2.15, 3.0), (6.30, -0.22, -3.10, 1.220, 2.2, 3.0),
       (7.20, -0.02, -3.10, 1.310, 2.25, 3.0), (8.40, 0.06, -3.09, 1.390, 2.3, 3.0), (9.80, 0.04, -3.08, 1.450, 2.35, 3.0), (11.50, -0.10, -3.08, 1.520, 2.4, 3.0),
       (13.50, -0.30, -3.08, 1.600, 2.45, 3.1), (16.00, -0.52, -3.09, 1.700, 2.5, 3.2), (18.50, -0.60, -3.10, 1.760, 2.5, 3.2), (22.00, -0.58, -3.12, 1.780, 2.5, 3.2),
       (25.00, -0.54, -3.16, 1.780, 2.5, 3.2), (28.00, -0.42, -3.20, 1.700, 2.45, 3.1), (31.00, -0.24, -3.12, 1.520, 2.4, 3.0), (33.50, -0.04, -3.02, 1.300, 2.35, 2.8),
       (35.50, 0.06, -2.96, 1.100, 2.3, 2.6), (37.50, -0.05, -2.88, 0.930, 2.25, 2.4), (39.50, -0.20, -2.76, 0.820, 2.2, 2.3), (41.00, -0.45, -2.64, 0.745, 2.1, 2.2),
       # хвостовой конус: круглый, тупой скруглённый нос (фото 19, 20, 21); верх опускается сразу за кромкой киля
       (42.00, -0.74, -2.56, 0.705, 2.05, 2.1), (42.80, -0.99, -2.48, 0.665, 2.0, 2.05), (43.40, -1.14, -2.38, 0.605, 2.0, 2.0), (43.90, -1.27, -2.22, 0.480, 2.0, 2.0),
       (44.22, -1.39, -2.04, 0.330, 2.0, 2.0), (44.42, -1.52, -1.88, 0.180, 2.0, 2.0), (44.50, -1.63, -1.77, 0.060, 2.0, 2.0), (44.52, -1.69, -1.71, 0.010, 2.0, 2.0)]
FT = tracks(FUS)
A_TAIL = 44.52

# ── наплыв (неподвижная часть крыла): передняя кромка в плане от борта у кабины к шарниру; плоскость хорд - низко, над днищем ──
GL_LE = Track([(10.5, 1.47), (12.0, 1.70), (13.5, 2.07), (15.0, 2.62), (16.2, 3.22), (17.2, 3.85), (17.9, 4.30), (18.35, 4.57), (18.70, 4.69), (19.20, 4.70)])   # угол наплыва впереди передней кромки консоли при 15°: консоль выходит из боковой стенки
GL_X = 4.70                                                     # торец наплыва (вдоль него выходит консоль)
GL_A1 = 28.4                                                    # торец наплыва кончается, дальше к хвосту сходится к фюзеляжу
GL_TE = 36.0                                                    # условная задняя кромка профиля наплыва
GL_AE, GL_XE = 36.2, 0.85                                       # косая кромка за корнем консоли кончается у основания киля
GL_ZC = -2.58                                                   # плоскость хорд наплыва и крыла у корня
def gl_x(a):
    """Полуразмах наплыва в сечении a (0 - нет наплыва)."""
    if a < 10.5: return 0.0
    if a <= 19.2: return GL_LE(a)
    if a <= GL_A1: return GL_X
    # за корнем консоли - прямая косая кромка к основанию киля (фото 23, вид сверху): плоская накладка над гондолами, без скругления
    t = (a - GL_A1) / (GL_AE - GL_A1)
    if t >= 1.0: return 0.0
    k = 0.6 / (GL_AE - GL_A1); xl = GL_X + (GL_XE - GL_X) * t
    if a < GL_A1 + k: xl = GL_X - (GL_X - GL_XE) / (GL_AE - GL_A1) * (a - GL_A1) ** 2 / (2 * 0.6) if a > GL_A1 else GL_X   # мягкий излом в начале кромки
    return max(0.0, xl)
_LE_INV = [(GL_LE(10.5 + i * 0.05), 10.5 + i * 0.05) for i in range(175)]
def gl_a_le(x):
    """Обратная функция передней кромки: a передней кромки на полуразмахе x."""
    if x <= _LE_INV[0][0]: return 10.5
    for (x0, a0), (x1, a1) in zip(_LE_INV, _LE_INV[1:]):
        if x0 <= x <= x1: return a0 + (a1 - a0) * (x - x0) / max(x1 - x0, 1e-9)
    return 19.2


def gl_half(a, x):
    """Полутолщина наплыва в точке (a, x)."""
    ale = gl_a_le(min(x, GL_X)); c = GL_TE - ale; u = (a - ale) / c
    if u <= 0: return -0.02 * (-u * c)                          # впереди кромки - снаружи
    tmax = 0.30 + 0.45 * (1 - _sm((x - 1.2) / 3.4))             # у корня толще, к торцу 0,30 (в торце щель консоли)
    h = tmax * thk(u) / thk(0.30)
    hmin = 0.27 * _sm((x - 3.0) / 0.9) * (1 - _sm((a - 28.4) / 0.8))   # у торца (щель консоли) - не тоньше консоли, передний край скруглён
    if hmin > 0: h = max(h, hmin * math.sqrt(min(1.0, max(0.0, a - ale) / 0.45)))
    xe = gl_x(a)
    if xe < x: h -= (x - xe) * 3.0                              # за торцом - снаружи
    return h


def gl_up(a, x, h):
    """Верхняя полутолщина: за корнем консоли к косой кромке верх тонкий - кромка острая, без валика (низ остаётся и сходится с гондолами)."""
    xe = gl_x(a); w = _sm((a - 28.0) / 1.6) * _sm((x - (xe - 1.6)) / 1.4)
    return h * (1 - 0.82 * w)


def body_field(a):
    zt, zb, hw, nt, nb = [t(a) for t in FT]; cz = (zt + zb) / 2; h = (zt - zb) / 2; ge = gl_x(a)
    def f(x, z):
        ax = abs(x); e = nt if z > cz else nb
        fb = ((ax / hw) ** e + (abs(z - cz) / h) ** e) ** (1.0 / e) - 1.0
        fb *= min(hw, h)
        if ge <= 0: return fb
        hg = gl_half(a, ax); hu = gl_up(a, ax, hg)
        fg = (z - GL_ZC) - hu if z > GL_ZC else (GL_ZC - z) - hg
        return smin(fb, fg, 0.55)
    return f, cz


N_BODY = 160
def body():
    st = [0.0, 0.03, 0.08, 0.15, 0.25, 0.40, 0.58, 0.80, 1.05, 1.35, 1.70] + stations(2.0, 43.8, 0.20) + [43.95, 44.08, 44.20, 44.30, 44.38, 44.44, 44.48, 44.505, A_TAIL]
    rings = []
    for a in st:
        f, cz = body_field(a); cz_ = min(cz, GL_ZC + 0.25) if gl_x(a) > 0 else cz
        rings.append(ring_from_field(a, f, 0.0, cz_, 6.0, N_BODY))
    return loft_obj('s_body', rings, sharp=50)


# ── гондолы: по две двигательных трубы в каждой; спереди короб с двумя каналами (фото 08, 09, 10), сзади две выпуклые трубы (фото 03, 04, 06) ──
NAC_XC = 3.75                                                   # середина гондолы по размаху
NAC_A0, NAC_A1 = 20.80, 32.20                                   # кромка заборника (по верху) и срез сопел
NAC_ZB, NAC_ZT = -4.38, -2.88                                   # низ гондолы, верх (уходит под наплыв)
ENG_DX, ENG_R, ENG_Z = 0.62, 0.71, -3.66                        # двигатели: x = NAC_XC ± ENG_DX
ENG_RE, NAC_BT = 0.555, 29.2                                    # радиус трубы у среза и начало кормового сужения
NAC_HW = Track([(NAC_A0 - 0.3, 1.32), (22.0, 1.42), (26.0, 1.48), (NAC_A1, 1.48)])
LIP_RAKE = 0.40                                                 # низ кромки заборника позади верха (м)


def eng_r(a):
    """Радиус трубы двигателя: постоянный, к срезу плавно сходится (кормовой конус, фото 15, 03, 11)."""
    t = max(0.0, min(1.0, (a - NAC_BT) / (NAC_A1 - NAC_BT))); return ENG_R - (ENG_R - ENG_RE) * (1 - math.cos(math.pi * t / 2))


def nac_field(a):
    hw = NAC_HW(a); t = _sm((a - 24.6) / (28.2 - 24.6))          # 0 - короб, 1 - две трубы
    rr = eng_r(a)
    ztop = NAC_ZT - (NAC_ZT - (ENG_Z + rr * 0.30)) * _sm((a - 28.4) / (NAC_A1 - 1.05 - 28.4))   # верхний обтекатель к корме опускается на трубы
    we = _sm((a - 29.0) / (NAC_A1 - 1.05 - 29.0))
    def f(x, z):
        dx = abs(x - NAC_XC); r = 0.16 + 0.38 * t
        zb = NAC_ZB
        qx = max(dx - (hw - r), 0.0); qz = max(abs(z - (NAC_ZT + zb) / 2) - ((NAC_ZT - zb) / 2 - r), 0.0)
        fbox = math.hypot(qx, qz) - r if (qx > 0 or qz > 0) else max(dx - hw, abs(z - (NAC_ZT + zb) / 2) - (NAC_ZT - zb) / 2)
        if t <= 0: return fbox
        fp = min(math.hypot(dx - ENG_DX, z - ENG_Z), math.hypot(dx + ENG_DX, z - ENG_Z)) - rr       # две трубы
        fe = smin(fp, max(dx - ENG_DX, abs(z - ENG_Z) - rr * 0.78), 0.12)          # перемычка между трубами: неглубокая ложбина сверху и снизу
        fe = smin(fe, max(dx - (ENG_DX + rr), z - ztop, ENG_Z - z), 0.30)   # верх уходит под наплыв
        hb = rr * 0.35 * (1 - _sm((a - (NAC_A1 - 2.6)) / 1.55)); fe = fe * (1 - we) + smin(fp, max(dx - ENG_DX, abs(z - ENG_Z) - hb), 0.10) * we   # к срезу остаются круглые трубы с узкой перемычкой
        return fbox * (1 - t) + fe * t
    return f


NAC_SPLIT = NAC_A1 - 0.95                                       # дальше - две отдельные трубы до среза


def nacelle(sx):
    st = [NAC_A0 - 0.6 + i * 0.1 for i in range(7)] + stations(NAC_A0 + 0.1, NAC_SPLIT, 0.20)
    rings = []
    for a in st:
        f = nac_field(a); rings.append(ring_from_field(a, f, NAC_XC, ENG_Z + 0.05, 2.6, 96, nray=720, sharp_w=0.0))
        if sx < 0: rings[-1] = [Vector((-v.x, v.y, v.z)) for v in rings[-1]][::-1]
    out = [loft_obj('s_nac_' + ('r' if sx > 0 else 'l'), rings, sharp=50)]
    for dx in (-ENG_DX, ENG_DX):                                  # кормовые трубы: продолжают сужение до среза
        x = sx * (NAC_XC + dx); n = 64
        rs = [[P3(a, x + (eng_r(a) + 0.003) * math.sin(2 * math.pi * k / n), ENG_Z - (eng_r(a) + 0.003) * math.cos(2 * math.pi * k / n)) for k in range(n)] for a in stations(NAC_SPLIT - 0.25, NAC_A1, 0.08)]
        if sx < 0: rs = [r_[::-1] for r_ in rs]
        out.append(loft_obj('s_pod', rs, sharp=50))
    return out


def nac_front_cut(sx):
    """Срез носа гондолы по кромке заборника: верх кромки впереди низа на LIP_RAKE (фото 05, 13)."""
    x0, x1 = sx * (NAC_XC - 2.0), sx * (NAC_XC + 2.0)
    pts = lambda a_top: [P3(a_top - 2.0, x0, NAC_ZT + 0.6), P3(a_top - 2.0, x1, NAC_ZT + 0.6), P3(a_top - 2.0, x1, NAC_ZB - 0.6), P3(a_top - 2.0, x0, NAC_ZB - 0.6)]
    # клин: задняя грань наклонная
    ra = [P3(NAC_A0, x0, NAC_ZT + 0.6), P3(NAC_A0, x1, NAC_ZT + 0.6), P3(NAC_A0 + LIP_RAKE * 1.36, x1, NAC_ZB - 0.6), P3(NAC_A0 + LIP_RAKE * 1.36, x0, NAC_ZB - 0.6)]
    rs = [pts(NAC_A0), ra]
    if sx < 0: rs = [r[::-1] for r in rs]
    return loft_obj('c_nfront', rs, G_SKIN, sharp=20)


def duct_cut(sx, half):
    """Канал одного двигателя: прямоугольный в устье, к двигателю круглый; тёмный."""
    xc = NAC_XC + (-1 if half == 0 else 1) * 0.66; xw = 0.56; z0, z1 = NAC_ZB + 0.16, NAC_ZT - 0.16
    rings = []; n = 48
    for i in range(12):
        a = NAC_A0 - 0.5 + (NAC_A0 + 3.9 - NAC_A0 + 0.5) * i / 11; t = _sm((a - NAC_A0 - 0.6) / 3.0)
        cz = (z0 + z1) / 2 + (ENG_Z - (z0 + z1) / 2) * t; cx = xc + (NAC_XC + (-1 if half == 0 else 1) * ENG_DX - xc) * t
        hx = xw * (1 - t) + 0.50 * t; hz = (z1 - z0) / 2 * (1 - t) + 0.50 * t; e = 8.0 * (1 - t) + 2.0 * t
        rg = []
        for k in range(n):
            th = -math.pi / 2 + 2 * math.pi * k / n; c, s = math.cos(th), math.sin(th)
            rg.append(P3(a, sx * (cx + hx * math.copysign(abs(c) ** (2 / e), c)), cz + hz * math.copysign(abs(s) ** (2 / e), s)))
        rings.append(rg if sx > 0 else rg[::-1])
    b = B(); b.loft(rings, [G_DUCT] * 3 + [G_DARK] * 8, cap0=G_DUCT, cap1=G_DARK)
    return b.finish('c_duct', sharp_deg=38)


NOZ_L = 0.95                                                    # длина сопла за срезом гондолы


def noz_r(d):
    """Наружный радиус сопла на расстоянии d за срезом гондолы: продолжает наклон кормы и чуть сходится."""
    k = (ENG_R - ENG_RE) * math.pi / 2 / (NAC_A1 - NAC_BT)          # наклон кормы у среза
    return ENG_RE - 0.003 - k * d * (1 - 0.3 * d / NOZ_L)


def bore_cut(sx):
    out = []
    for dx in (-ENG_DX, ENG_DX):
        n = 48; x = sx * (NAC_XC + dx)
        ring = lambda a, r: [P3(a, x + r * math.sin(2 * math.pi * k / n), ENG_Z - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
        prof = [(NAC_A1 + 1.4, ENG_RE - 0.03, G_METAL), (NAC_A1 - 0.3, ENG_RE - 0.03, G_METAL), (NAC_A1 - 2.2, ENG_RE - 0.05, G_DARK), (NAC_A1 - 2.4, 0.05, G_DARK)]
        b = B(); rs = [ring(a, r) for a, r, _ in prof]
        if sx < 0: rs = [r_[::-1] for r_ in rs]
        b.loft(rs, [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK)
        out.append(b.finish('c_bore', sharp_deg=30))
    return out


def nozzles():
    """Сопла: наружная обечайка продолжает корму гондолы, 16 лепестков с тягами по кругу, тонкая кромка среза; внутри стенка форсажной камеры
    с кольцами и стабилизатор пламени (фото 03, 04, 11, 15). Центры и радиус среза - в NOZ."""
    b = B(); n = 64; NOZ.clear()
    for sx in (1, -1):
        for dx in (-ENG_DX, ENG_DX):
            x = sx * (NAC_XC + dx)
            def ring(a, r, wav=0.0):
                pts = []
                for k in range(n):
                    th = 2 * math.pi * k / n; q = max(-1.0, min(1.0, 2.5 * math.cos(16 * th + math.pi / 16)))   # 16 лепестков (выпуклые) и уплотнения между ними
                    rr_ = r + wav * (0.5 + 0.5 * q); pts.append(P3(a, x + rr_ * math.sin(th), ENG_Z - rr_ * math.cos(th)))
                return pts
            ds = [-0.10, 0.0, 0.035, 0.045, 0.085, 0.095, 0.18, 0.35, 0.55, 0.75, NOZ_L - 0.04, NOZ_L]
            band = {0.035: 0.016, 0.045: 0.016, 0.085: 0.016, 0.095: 0.0}                       # стяжное кольцо привода у начала лепестков
            outer = [ring(NAC_A1 + d, noz_r(max(d, 0.0)) + band.get(d, 0.0), 0.012 if d >= 0.18 else 0.0) for d in ds]
            re = noz_r(NOZ_L)
            lip = [ring(NAC_A1 + NOZ_L + 0.012, re - 0.012), ring(NAC_A1 + NOZ_L, re - 0.028)]
            inner = [ring(NAC_A1 + d, noz_r(d) - 0.03) for d in (0.70, 0.30, 0.0, -0.20)]
            sec = outer + lip + inner
            b.loft(sec + [sec[0]], G_METAL)
            # форсажная камера: тёмная стенка, кольца, стабилизатор пламени
            cham = [ring(NAC_A1 - 0.20, ENG_RE - 0.035), ring(NAC_A1 - 1.6, ENG_RE - 0.045), ring(NAC_A1 - 2.2, ENG_RE - 0.06)]
            b.loft(cham, G_DARK)
            for d in (-0.6, -1.1):
                b.loft([ring(NAC_A1 + d - 0.025, ENG_RE - 0.04), ring(NAC_A1 + d, ENG_RE - 0.075), ring(NAC_A1 + d + 0.025, ENG_RE - 0.04)], G_METAL)
            for rr_ in (0.16, 0.32):
                b.loft([ring(NAC_A1 - 1.95, rr_ - 0.02), ring(NAC_A1 - 1.85, rr_), ring(NAC_A1 - 1.95, rr_ + 0.02), ring(NAC_A1 - 1.95, rr_ - 0.02)], G_METAL)
            cone = [ring(NAC_A1 - 2.25, 0.20), ring(NAC_A1 - 1.95, 0.10), ring(NAC_A1 - 1.75, 0.01)]
            b.loft(cone, G_METAL)
            NOZ.append((P3(NAC_A1 + NOZ_L, x, ENG_Z), round(re, 3)))
    return b.finish('nozzles', sharp_deg=35)


# ── консоли крыла: изменяемая стреловидность, шарнир внутри наплыва; построены при 15°, в файле - сложены (67,5°) ──
PIV_X, PIV_A = 3.90, 20.50
SW_MIN, SW_MAX = 15.0, 67.5                                     # стреловидность передней кромки
W_LE0, W_TE0 = -1.60, 3.60                                      # кромки на станции шарнира при 15° (a - PIV_A)
W_SPAN = 16.90                                                  # от шарнира до конца при 15°
W_TIPC = 1.75
W_ZC = GL_ZC - 0.02; W_DIH = -1.0                               # плоскость хорд и поперечное V (°)
W_TC0, W_TC1 = 0.105, 0.080
W_ROOT_R = 1.05                                                 # внутренняя кромка консоли - дуга вокруг шарнира (уходит в щель наплыва)


def w_le(s): return W_LE0 + s * math.tan(math.radians(SW_MIN))
def w_te(s): return W_TE0 + (W_TIPC + W_LE0 + W_SPAN * math.tan(math.radians(SW_MIN)) - W_TE0) * s / W_SPAN


def wing_panel(sx, sweep=SW_MAX):
    """Консоль в своей системе (s - вдоль размаха от шарнира, при 15°), начало объекта на шарнире; поворот к sweep вокруг вертикали."""
    rings = []
    ss = [-W_ROOT_R + 0.002] + stations(-W_ROOT_R + 0.05, W_SPAN - 0.6, 0.30) + [W_SPAN - 0.35, W_SPAN - 0.18, W_SPAN - 0.07, W_SPAN]
    for s in ss:
        le, te = w_le(max(s, 0.0)), w_te(max(s, 0.0))
        if s < 0:                                                # корень: хорда обрезана дугой радиуса W_ROOT_R вокруг шарнира
            hcut = math.sqrt(max(W_ROOT_R ** 2 - s * s, 0.0)); le, te = max(le, -hcut), min(te, hcut)
            if te - le < 0.05: le, te = -0.025, 0.025
        c = te - le; tc = W_TC0 + (W_TC1 - W_TC0) * max(s, 0.0) / W_SPAN; z0 = math.tan(math.radians(W_DIH)) * max(s, 0.0)
        us = [(1 - math.cos(math.pi * i / 23)) / 2 for i in range(24)]
        up = [Vector((sx * s, -(le + c * u), z0 + tc * c * thk(u) / 2 * 1.0)) for u in us]
        lo = [Vector((sx * s, -(le + c * u), z0 - tc * c * thk(u) / 2 * 0.85)) for u in reversed(us[1:-1])]
        rg = up + lo
        rings.append(rg if sx > 0 else rg[::-1])
    name = 'wing_' + ('r' if sx > 0 else 'l')
    ob = loft_obj(name, rings, sharp=48)
    pivot = P3(PIV_A, sx * PIV_X, W_ZC); ob.location = pivot
    ang = math.radians(sweep - SW_MIN) * (-sx)                  # правое: конец назад = поворот по часовой (вид сверху)
    ob.rotation_euler = (0, 0, ang)
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((0, 0, -sx)), range=(0.0, SW_MAX - SW_MIN), rest=SW_MAX - SW_MIN,
                       note=f'консоль крыла: вертикальная ось в шарнире наплыва; 0 - стреловидность {SW_MIN}° (крыло вперёд), {SW_MAX - SW_MIN}° - сложено ({SW_MAX}°, положение в файле); плюс - конец назад')
    return ob


# ── киль с форкилем и стабилизатор: цельноповоротный, низко на киле (фото 05, 11, 12) ──
FIN_Z0, FIN_Z1 = 0.0, 4.40
F_LE = Track([(FIN_Z0, 34.6), (0.30, 35.9), (0.70, 36.75), (1.20, 37.35), (FIN_Z1, 40.55)])
F_TE = Track([(FIN_Z0, 43.0), (1.0, 42.85), (FIN_Z1, 42.70)])
def FTC(z): return 0.072 - 0.018 * z / FIN_Z1
RUD = [(0.62, 1.82), (1.88, 3.08), (3.14, 4.28)]                # три секции руля направления (фото 05, 20, 21)
RUD_C = 0.27


RUD_W = 1.30                                                    # ширина руля по потоку (постоянная: линия навески каждой секции прямая)
def _fin_hinge(z):
    for z0, z1 in RUD:
        if z0 - 0.01 <= z <= z1 + 0.01:
            h0, h1 = F_TE(z0) - RUD_W, F_TE(z1) - RUD_W; return h0 + (h1 - h0) * (z - z0) / (z1 - z0)
    return F_TE(z) - RUD_W


def fin():
    import b1b_wing as wg
    zs = [FIN_Z0 - 1.45, FIN_Z0 - 0.7] + stations(FIN_Z0, FIN_Z1, 0.15)
    for z0, z1 in RUD: zs += [z0 - 0.004, z0, z1, z1 + 0.004] + [z0 + (z1 - z0) * i / 6 for i in range(1, 6)]
    zs = sorted(set(round(z, 4) for z in zs if z <= FIN_Z1))
    rings = []
    for z in zs:
        z_ = max(z, FIN_Z0); le = F_LE(z_); te = F_TE(z_); c = te - le; tc = FTC(z_); place = lambda d, h: P3(d, h, z)
        if wg._in(z, RUD) is not None: ue, tail = wg.cove_cut(le, c, tc, _fin_hinge(z_), 0.015)
        else: ue, tail = 1.0, wg.cove_wall(le, c, tc, 1.0)
        rings.append(wg.foil_ring(le, c, tc, 0.0006, ue, 22, place, tail, wg.cove_wall_f(le, c, tc, 0.0006)))
    return loft_obj('fin', rings, sharp=48)


def rudders():
    import b1b_wing as wg
    out = []
    for i, (z0, z1) in enumerate(RUD):
        p0 = P3(_fin_hinge(z0), 0.0, z0); p1 = P3(_fin_hinge(z1), 0.0, z1); pivot = (p0 + p1) / 2; rings = []
        for j in range(9):
            z = z0 + 0.006 + (z1 - z0 - 0.012) * j / 8; le = F_LE(z); c = F_TE(z) - le; ah = _fin_hinge(z); tc = FTC(z)
            rings.append(wg.foil_ring(le, c, tc, (ah - le) / c, 1.0, 12, lambda d, h: P3(d, h, z), [], wg.cove_nose(le, c, tc, ah)))
        ob = loft_obj(f'rudder{i + 1}', rings, sharp=48); _rel(ob, pivot)
        PARTS[f'rudder{i + 1}'] = dict(pivot=pivot.copy(), axis=(p1 - p0).normalized(), range=(-25.0, 25.0), note='секция руля направления: ось в центре круглого носа, снизу вверх; плюс - задняя кромка влево')
        out.append(ob)
    return out


ST_PIV_A, ST_Z = 40.80, 0.42                                    # ось стабилизатора
ST_ROOT_X, ST_TIP_X = 0.44, 6.70
ST_LE = Track([(ST_ROOT_X, 37.90), (ST_TIP_X, 42.55)])
ST_TE = Track([(ST_ROOT_X, 42.95), (ST_TIP_X, 44.50)])


def stab_fair():
    """Неподвижные обтекатели у корня стабилизатора по бокам киля: веретено вдоль a, под стабилизатором (фото 20, 21)."""
    out = []
    for sx in (1, -1):
        n = 32; rr = Track([(37.6, 0.02), (38.3, 0.12), (39.5, 0.17), (41.6, 0.17), (42.7, 0.11), (43.2, 0.03)])
        rs = [[P3(a, sx * (0.14 + rr(a) * 0.85 * math.sin(2 * math.pi * k / n)), ST_Z - 0.55 - rr(a) * math.cos(2 * math.pi * k / n)) for k in range(n)] for a in stations(37.6, 43.2, 0.15)]
        if sx < 0: rs = [r_[::-1] for r_ in rs]
        out.append(loft_obj('s_stfair', rs, sharp=50))
    return out


def stab(sx):
    rings = []
    for x in stations(ST_ROOT_X, ST_TIP_X, 0.25):
        le, te = ST_LE(x), ST_TE(x); c = te - le; tc = 0.045
        us = [(1 - math.cos(math.pi * i / 19)) / 2 for i in range(20)]
        rg = [P3(le + c * u, sx * x, ST_Z + tc * c * thk(u)) for u in us] + [P3(le + c * u, sx * x, ST_Z - tc * c * thk(u)) for u in reversed(us[1:-1])]
        rings.append(rg if sx > 0 else rg[::-1])
    name = 'stab_' + ('r' if sx > 0 else 'l'); ob = loft_obj(name, rings, sharp=48)
    pivot = P3(ST_PIV_A, sx * 0.0, ST_Z); _rel(ob, pivot)
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((sx, 0, 0)), range=(-12.0, 8.0), note='цельноповоротный стабилизатор: ось поперёк; плюс - носок вверх; ход ограничен хвостовым конусом под ним')
    return ob


# ── «лопатки» гашения колебаний на носу (фото 01, 02, 11): маленькие стреловидные с отрицательным V ──
def vanes():
    out = []
    for sx in (1, -1):
        a0, z0 = 4.55, -2.30; x0 = 1.24
        rings = []
        for i in range(6):
            s = i / 5; x = x0 + 0.95 * s; z = z0 - 0.95 * s * math.tan(math.radians(30)); le = a0 + 0.62 * s; c = 0.95 - 0.55 * s
            us = [(1 - math.cos(math.pi * j / 11)) / 2 for j in range(12)]
            rg = [P3(le + c * u, sx * x, z + 0.07 * c * thk(u) / 2) for u in us] + [P3(le + c * u, sx * x, z - 0.07 * c * thk(u) / 2) for u in reversed(us[1:-1])]
            rings.append(rg if sx > 0 else rg[::-1])
        name = 'vane_' + ('r' if sx > 0 else 'l'); ob = loft_obj(name, rings, sharp=48)
        pivot = P3(a0 + 0.40, sx * x0, z0); _rel(ob, pivot)
        PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((sx * math.cos(math.radians(30)), 0, -math.sin(math.radians(30)))), range=(-30.0, 30.0), note='лопатка системы гашения колебаний: ось вдоль размаха лопатки')
        out.append(ob)
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


def build_skin():
    host = body()
    for sx in (1, -1):
        ns = nacelle(sx); n = ns[0]
        for q in ns[1:]: _apply_bool(n, q, 'UNION'); _drop(q)
        c = nac_front_cut(sx); _apply_bool(n, c, 'DIFFERENCE'); _drop(c)
        _apply_bool(host, n, 'UNION'); _drop(n)
    for q in stab_fair(): _apply_bool(host, q, 'UNION'); _drop(q)
    for sx in (1, -1):
        for half in (0, 1):
            c = duct_cut(sx, half); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
        for c in bore_cut(sx): _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'B1_skin'; host.data.name = 'B1_skin'
    return host


def slot_seals(skin):
    """Уплотнение щели наплыва: резиновые кромки по верхнему и нижнему краю устья (толщина 1,2 см, запас щели 3 см - консоль не задевает)."""
    me = skin.data; t = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons]); out = []
    for sx in (1, -1):
        top, bot = [], []
        for i in range(97):
            a = 19.30 + (28.70 - 19.30) * i / 96; x = sx * (GL_X - 0.06); o = Vector((x, Yb(a), 1.0)); zs = []
            for _ in range(8):
                h = t.ray_cast(o, Vector((0, 0, -1)))
                if h[0] is None: break
                zs.append(h[0].z); o = h[0] + Vector((0, 0, -1e-4))
            zs = [z for z in zs if -3.2 < z < -2.0]
            if len(zs) >= 4: top.append((a, zs[1])); bot.append((a, zs[2]))      # верх наплыва, потолок щели, пол щели, низ наплыва
        if len(top) < 4: continue
        for name, rows, dz in (('seal_u', top, -1), ('seal_d', bot, 1)):
            b = B(); rings = []
            for a, z in rows:
                x0, x1 = sx * (GL_X - 0.20), sx * (GL_X + 0.005)
                rings.append([P3(a, x0, z + dz * 0.004), P3(a, x1, z + dz * 0.004), P3(a, x1, z - dz * 0.008 * -1 if False else z + dz * 0.012), P3(a, x0, z + dz * 0.012)])
            if sx < 0: rings = [r[::-1] for r in rings]
            b.loft(rings, G_TYRE, cap0=G_TYRE, cap1=G_TYRE); out.append(b.finish(f'{name}_{"r" if sx > 0 else "l"}', sharp_deg=30))
    return out


def plane(stage=9, sweep=SW_MAX):
    PARTS.clear(); STATIONS.clear()
    skin = build_skin(); out = [skin]
    import importlib, b1b_wing as wg; importlib.reload(wg)
    if stage >= 2:
        cs = wg.slot_cutter_smooth()
        for i in range(0, len(cs), 2): _apply_bool(cs[i], cs[i + 1], 'UNION'); _drop(cs[i + 1])      # веер и диск у шарнира - одним телом, без внутренних граней
        for c in cs[0::2]: _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
        out += slot_seals(skin)
    out += wg.wing_panel(1, sweep) + wg.wing_panel(-1, sweep) + [fin(), stab(1), stab(-1), nozzles()] + rudders() + vanes()
    if stage >= 3:
        import importlib, b1b_cock as ck; importlib.reload(ck)
        ck.skin_ready(skin)
        out += [ck.glass(), ck.frames(), ck.interior()] + ck.hatches()
        import b1b_bay as bay; importlib.reload(bay)
        bay.ready(skin); bay.stations_fill()
        out += bay.doors() + [bay.inner(), bay.bulkhead()]
        if stage >= 4:
            import b1b_gear as gr; importlib.reload(gr); out += gr.gear_all()
        cuts = [ck.cock_cut()] + ck.window_cuts() + bay.cuts()
        for c in cuts: _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
    resharp(skin)
    return out


def resharp(host, deg=38):
    bm = bmesh.new(); bm.from_mesh(host.data); lim = math.radians(deg)
    for f in bm.faces: f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2: e.smooth = e.calc_face_angle(0.0) < lim
        else: e.smooth = False
    bm.to_mesh(host.data); bm.free()
