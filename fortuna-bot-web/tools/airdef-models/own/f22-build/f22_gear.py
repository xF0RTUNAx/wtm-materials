# f22_gear.py - шасси F-22A: носовая и две основные стойки в выпущенном положении, код перенесён с F-15E, положения свои (f22_01, f22_03, f22_08). Оси и имена частей те же, что в f15_geo.
# Цвета задаёт материал: G_SKIN белая краска, G_METAL хром штока и светлый металл, G_BELT тёмная сталь тормоза и пальцев, G_DARK шланги и нутро, G_COCK серые щитки, G_HANDLE стекло фар, G_TYRE резина.
import math
from mathutils import Vector
from modelkit import B
import f22_geo as g
from f22_geo import P3, G_SKIN, G_METAL, G_DARK, G_TYRE, G_COCK

G_BELT, G_HANDLE = 8, 9
X = Vector((1, 0, 0)); F = Vector((0, 1, 0)); U = Vector((0, 0, 1)); R_ = Vector((0, -1, 0))     # F к носу, R_ к хвосту


def tube(b, pts, r, mat=G_SKIN, n=12, caps=True):
    """Труба по ломаной: r - число или список по точкам; кольца с переносом базиса, без перекручивания."""
    rs = r if isinstance(r, (list, tuple)) else [r] * len(pts)
    t0 = (pts[1] - pts[0]).normalized(); u = t0.orthogonal().normalized(); rings = []
    for i, p in enumerate(pts):
        a_ = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized(); u = (u - a_ * u.dot(a_)).normalized(); v = a_.cross(u)
        rings.append([p + (u * math.cos(2 * math.pi * q / n) + v * math.sin(2 * math.pi * q / n)) * rs[i] for q in range(n)])
    b.loft(rings, mat, cap0=mat if caps else None, cap1=mat if caps else None)


def collar(b, c, d, r, h, mat=G_SKIN, n=16):
    e = min(h * 0.25, r * 0.15); tube(b, [c - d * h / 2, c - d * (h / 2 - e), c + d * (h / 2 - e), c + d * h / 2], [r - e, r, r, r - e], mat, n)


def box(b, c, u, v, w, hu, hv, hw, mat=G_SKIN, taper=1.0):
    e = min(hu, hv) * 0.25
    ring = lambda s, k, tp: [c + w * s + u * (su * (hu * tp - k)) + v * (sv * (hv * tp - k)) for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    b.loft([ring(-hw, e, 1.0), ring(-hw + e, 0, 1.0), ring(hw - e, 0, taper), ring(hw, e, taper)], mat, cap0=mat, cap1=mat)


def link(b, p0, p1, wd, th, mat=G_SKIN, side=X):
    """Рычаг-пластина с утолщением на пальцах."""
    d = (p1 - p0); L = d.length; w = d.normalized(); n_ = w.cross(side).normalized(); box(b, (p0 + p1) / 2, side, n_, w, th, wd, L / 2, mat, 0.85)
    for p in (p0, p1): tube(b, [p - side * (th + 0.006), p + side * (th + 0.006)], wd * 1.05, G_BELT, 10)


def hose(b, pts, r=0.0065, clamps=(), mat=G_DARK):
    # сглаженная ломаная: промежуточные точки по Катмулл-Рому
    P = [pts[0]] + list(pts) + [pts[-1]]; out = []
    for i in range(1, len(P) - 2):
        for k in range(5):
            t = k / 5; p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
            out.append((p1 * 2 + (p2 - p0) * t + (p0 * 2 - p1 * 5 + p2 * 4 - p3) * t * t + (p1 * 3 - p0 - p2 * 3 + p3) * t * t * t) * 0.5)
    out.append(pts[-1]); tube(b, out, r, mat, 7)
    for c_ in clamps:
        i = int(c_ * (len(out) - 1)); d = (out[min(i + 1, len(out) - 1)] - out[max(i - 1, 0)]).normalized(); collar(b, out[i], d, r * 1.9, 0.016, G_BELT, 8)


def wheel(b, c, rw, ww, holes=8):
    """Колесо: шина с беговой дорожкой, канавками и поясками на боковине; обод с закраиной и болтами; глубокий диск с отверстиями, ступица с крышкой, вентиль."""
    n = 56
    rg = lambda dx, r: [c + X * dx + (F * math.cos(2 * math.pi * q / n) + U * math.sin(2 * math.pi * q / n)) * r for q in range(n)]
    tr = [(-0.50, 0.655), (-0.525, 0.70), (-0.535, 0.745), (-0.542, 0.752), (-0.535, 0.76), (-0.525, 0.82), (-0.532, 0.828), (-0.522, 0.836), (-0.49, 0.89), (-0.43, 0.945), (-0.35, 0.985), (-0.27, 0.995), (-0.262, 0.962), (-0.222, 0.962), (-0.214, 0.998), (-0.09, 1.0), (-0.082, 0.962), (-0.042, 0.962), (-0.034, 1.0)]
    tr = tr + [(-d_, r_) for d_, r_ in reversed(tr)]
    b.loft([rg(ww * d, rw * r) for d, r in tr], G_TYRE)
    for s in (1, -1):
        hub = [(0.50, 0.655), (0.56, 0.650), (0.575, 0.635), (0.56, 0.612), (0.47, 0.60), (0.40, 0.585), (0.20, 0.55), (0.16, 0.50), (0.15, 0.27), (0.20, 0.235), (0.34, 0.205), (0.44, 0.19), (0.47, 0.165), (0.47, 0.105), (0.50, 0.09), (0.50, 0.02)]
        b.loft([rg(s * ww * d, rw * r) for d, r in hub], G_SKIN, cap1=G_SKIN)
        ph = lambda ang, rr, dx: c + X * (s * ww * dx) + (F * math.cos(ang) + U * math.sin(ang)) * rw * rr
        for i in range(holes):
            ang = 2 * math.pi * i / holes; p = ph(ang, 0.385, 0.155)
            tube(b, [p - X * s * 0.006, p + X * s * 0.003], rw * 0.070, G_DARK, 14)                                                   # отверстие
            q_ = p + X * s * 0.003; d0 = (F * math.cos(ang) + U * math.sin(ang)); e0 = X.cross(d0)
            ring = lambda r_, h_: [q_ + X * s * h_ + (d0 * math.cos(2 * math.pi * k / 16) + e0 * math.sin(2 * math.pi * k / 16)) * r_ for k in range(16)]
            rs_ = [ring(rw * 0.072, 0.0), ring(rw * 0.080, 0.008), ring(rw * 0.098, 0.008), ring(rw * 0.112, 0.0), ring(rw * 0.072, 0.0)]; b.loft(rs_, G_SKIN)       # кромка отверстия
        for i in range(14):
            ang = 2 * math.pi * (i + 0.5) / 14; p = ph(ang, 0.155, 0.47); tube(b, [p, p + X * s * 0.012], rw * 0.017, G_BELT, 6)       # болты ступицы
        for i in range(20):
            ang = 2 * math.pi * (i + 0.25) / 20; p = ph(ang, 0.625, 0.56); tube(b, [p, p + X * s * 0.006], rw * 0.012, G_BELT, 6)       # болты обода
        cp = c + X * (s * ww * 0.50); tube(b, [cp, cp + X * s * 0.012, cp + X * s * 0.02], [rw * 0.075, rw * 0.070, rw * 0.04], G_BELT, 12)    # крышка ступицы
    vp = c + X * (ww * 0.20) + U * rw * 0.56; tube(b, [vp, vp + X * 0.018 - U * 0.012, vp + X * 0.035 - U * 0.018], 0.0055, G_BELT, 6)         # вентиль
    for ang_ in (0.7, 3.4):
        p = c + X * (ww * 0.47) + (F * math.cos(ang_) + U * math.sin(ang_)) * rw * 0.595; box(b, p, X, F * math.cos(ang_ + 1.57) + U * math.sin(ang_ + 1.57), F * math.cos(ang_) + U * math.sin(ang_), 0.006, 0.022, 0.006, G_BELT)   # грузики балансировки


def details(b, at, d, r0, s0, s1, side):
    """Приливы, болты и коробка разъёма на цилиндре."""
    u_ = d.orthogonal().normalized(); v_ = d.cross(u_)
    for k, sk in enumerate((s0, s0 + (s1 - s0) * 0.5, s1)):
        for i in range(10):
            ang = 2 * math.pi * i / 10; p = at(sk) + (u_ * math.cos(ang) + v_ * math.sin(ang)) * (r0 + 0.006); nn = (u_ * math.cos(ang) + v_ * math.sin(ang)); tube(b, [p, p + nn * 0.008], 0.0065, G_BELT, 6)
    c_ = at((s0 + s1) / 2) + side * (r0 + 0.018); w_ = side.cross(d).normalized(); box(b, c_, w_, side, d, 0.028, 0.018, 0.045, G_COCK)
    for sg in (1, -1): tube(b, [c_ + w_ * sg * 0.014 + side * 0.018 + d * 0.03, c_ + w_ * sg * 0.014 + side * 0.03 + d * 0.03], 0.007, G_BELT, 6)
    for sg in (1, -1):                                                                                                              # приливы-проушины
        p = at(s0 + 0.04) + side.cross(d).normalized() * sg * (r0 + 0.010); box(b, p, side, side.cross(d).normalized(), d, 0.022, 0.016, 0.032, G_SKIN)


def trunnion(b, p, x_half, r):
    tube(b, [p - X * x_half, p + X * x_half], r, G_SKIN, 14)


def gear_nose():
    a_h, y_h = g.NG['hinge']; rw, ww = g.NG['rw'], g.NG['ww']
    T = P3(a_h, 0.0, y_h); wy = g.GROUND_Y + rw; wc = P3(g.NG['a'], 0.0, wy); low = wc + U * 0.205
    d = (low - T); L = d.length; d = d.normalized(); at = lambda s: T + d * s
    sd = -1                                                    # вилка с левой стороны колеса (фото 10)
    b = B(); wheel(b, wc, rw, ww, 8)
    trunnion(b, T, 0.20, 0.046); collar(b, at(0.03), d, 0.078, 0.10)
    tube(b, [at(0.02), at(0.70)], 0.058, G_SKIN, 18)            # цилиндр
    for s, r_, h_ in ((0.22, 0.070, 0.035), (0.40, 0.074, 0.075), (0.70, 0.070, 0.05)): collar(b, at(s), d, r_, h_)
    for i in range(12):                                        # зубья поворотного кольца
        ang = 2 * math.pi * i / 12; u_ = d.orthogonal().normalized(); v_ = d.cross(u_); p = at(0.40) + (u_ * math.cos(ang) + v_ * math.sin(ang)) * 0.078; box(b, p, u_, v_, d, 0.006, 0.006, 0.026, G_BELT)
    tube(b, [at(0.70), at(L - 0.03)], 0.036, G_METAL, 18)       # хромовый шток
    collar(b, at(L - 0.02), d, 0.052, 0.06)
    details(b, at, d, 0.058, 0.08, 0.34, -X)
    # вилка: изогнутый рычаг сбоку колеса, ось
    xa = sd * (ww * 0.5 + 0.038)
    tube(b, [low, low + X * sd * 0.05 + U * 0.004, low + X * xa * 0.8 + U * 0.0, wc + X * xa + U * 0.13, wc + X * xa + U * 0.04, wc + X * xa], [0.040, 0.038, 0.034, 0.030, 0.030, 0.034], G_SKIN, 12)
    tube(b, [wc + X * sd * (ww * 0.5 + 0.060), wc - X * sd * (ww * 0.46)], 0.021, G_BELT, 12); collar(b, wc + X * xa, X, 0.040, 0.030)
    # ножницы сзади штока
    p0 = at(0.68) + R_ * 0.070; k_ = at(0.86) + R_ * 0.155; p1 = low + R_ * 0.060 + U * 0.02
    link(b, p0, k_, 0.024, 0.016); link(b, k_, p1, 0.024, 0.016); box(b, at(0.68) + R_ * 0.045, X, U, R_, 0.018, 0.022, 0.03, G_SKIN); box(b, low + R_ * 0.040 + U * 0.02, X, U, R_, 0.018, 0.022, 0.03, G_SKIN)
    # две фары спереди стойки (фото 10): кронштейн, корпус, стекло
    br = at(0.54) + F * 0.075; box(b, br, X, U, F, 0.085, 0.022, 0.018, G_SKIN)
    for sg, s_, r_ in ((1, 0.50, 0.050), (-1, 0.585, 0.042)):
        c_ = at(s_) + F * 0.10 + X * (sg * 0.060); tube(b, [c_ - F * 0.035, c_, c_ + F * 0.045], [r_ * 0.7, r_, r_], G_METAL, 16); tube(b, [c_ + F * 0.046, c_ + F * 0.052], [r_ * 0.9, r_ * 0.75], G_HANDLE, 16)
    # щиток с номером сзади стойки: плита со стрингерами
    xd = 0.098; A0 = g.NG['a']; pts = [(A0 + 0.37, y_h - 0.08), (A0 + 0.67, y_h - 0.12), (A0 + 0.55, y_h - 0.86), (A0 + 0.21, y_h - 0.84)]
    pl = lambda dx: [P3(a_, xd + dx, y_) for a_, y_ in pts]; b.loft([pl(-0.008), pl(0.008)], G_COCK, cap0=G_COCK, cap1=G_COCK)
    for t in (0.22, 0.5, 0.78):
        p_a = P3(A0 + 0.37 - 0.16 * t, xd + 0.012, y_h - 0.08 + (-0.76) * t); p_b = P3(A0 + 0.67 - 0.12 * t, xd + 0.012, y_h - 0.12 + (-0.74) * t); tube(b, [p_a, p_b], 0.007, G_COCK, 6)
    for t in (0.15, 0.85):
        link(b, at(0.15 + 0.5 * t) + X * 0.04, P3(A0 + 0.35 - 0.10 * t, xd - 0.004, y_h - 0.10 - 0.66 * t), 0.012, 0.007, G_SKIN, F)
    # гидравлика и жгуты с хомутами
    off1 = X * 0.068 + F * 0.012; hose(b, [at(0.05) + off1, at(0.30) + off1 * 1.02, at(0.55) + off1 * 1.05, at(0.72) + off1 * 0.9, at(0.76) + X * 0.03 + F * 0.08], 0.0065, (0.2, 0.55, 0.85))
    off2 = -X * 0.068 + R_ * 0.010; hose(b, [at(0.05) + off2, at(0.35) + off2, at(0.60) + off2, at(0.70) + off2 * 0.9], 0.0055, (0.3, 0.7), G_BELT)
    hose(b, [at(0.42) + X * 0.058 + F * 0.05, at(0.47) + X * 0.05 + F * 0.09, at(0.50) + X * 0.06 + F * 0.075], 0.0045)
    ob = b.finish('gear_n', sharp_deg=40); g._rel(ob, T)
    # складной подкос (двойной), гидроцилиндр уборки: отдельный объект
    b2 = B(); sp = P3(a_h - 0.75, 0.0, y_h + 0.02); e_ = at(0.60) + F * 0.066; kn = sp.lerp(e_, 0.52) + U * 0.075 + F * 0.03
    for sg in (1, -1):
        tube(b2, [sp + X * sg * 0.036, kn + X * sg * 0.034], [0.018, 0.030], G_SKIN, 8); tube(b2, [kn + X * sg * 0.034, e_ + X * sg * 0.030], [0.030, 0.018], G_SKIN, 8)
    tube(b2, [sp - X * 0.08, sp + X * 0.08], 0.024, G_SKIN, 12); tube(b2, [kn - X * 0.052, kn + X * 0.052], 0.024, G_BELT, 12); tube(b2, [e_ - X * 0.05, e_ + X * 0.05], 0.018, G_BELT, 10)
    cy0 = sp + U * 0.055 + F * 0.02; tube(b2, [cy0, cy0.lerp(kn, 0.55)], 0.026, G_SKIN, 12); tube(b2, [cy0.lerp(kn, 0.55), kn + U * 0.01], 0.012, G_METAL, 10)
    hose(b2, [cy0 + X * 0.03, cy0.lerp(kn, 0.3) + X * 0.042 + U * 0.015, cy0.lerp(kn, 0.5) + X * 0.03], 0.005)
    br_ = b2.finish('gear_n_brace', sharp_deg=45); g._rel(br_, sp)
    g.PARTS['gear_n'] = dict(pivot=T.copy(), axis=Vector((1, 0, 0)), range=(0.0, 95.0), note='0 - выпущено; 95 - убрано колесом вперёд', retracted=95.0)
    g.PARTS['gear_n_brace'] = dict(pivot=sp.copy(), axis=Vector((1, 0, 0)), range=None, note='подкос: движется вместе со стойкой')
    return [ob, br_]


def gear_main(sx):
    n_ = 'r' if sx > 0 else 'l'; rw, ww = 0.430, 0.240
    wc = P3(g.MG_A, sx * g.MG_X, g.GROUND_Y + rw); low = wc + X * (-sx * 0.165) + U * 0.045
    T = P3(g.MG_A + 0.10, sx * 1.74, -0.58); d = (low - T); L = d.length; d = d.normalized(); at = lambda s: T + d * s
    IN = X * (-sx)                                             # к оси самолёта
    b = B(); wheel(b, wc, rw, ww, 8)
    trunnion(b, T, 0.24, 0.056); collar(b, at(0.03), d, 0.092, 0.12)
    tube(b, [at(0.02), at(0.56)], 0.072, G_SKIN, 20)
    for s, r_, h_ in ((0.18, 0.082, 0.04), (0.38, 0.082, 0.04), (0.56, 0.084, 0.06)): collar(b, at(s), d, r_, h_)
    tube(b, [at(0.56), at(L - 0.02)], 0.048, G_METAL, 20)       # хромовый шток
    collar(b, at(L - 0.01), d, 0.070, 0.08)
    details(b, at, d, 0.072, 0.08, 0.36, -IN)
    # колено оси и ось
    tube(b, [low, low - IN * 0.09, wc - IN * 0.0 + IN * (ww * 0.42)], [0.058, 0.050, 0.042], G_SKIN, 14); tube(b, [wc + IN * (ww * 0.5), wc - IN * (ww * 0.5 + 0.018)], 0.028, G_BELT, 12)
    # тормоз: пакет дисков, цилиндры, тяга к стойке
    bc = wc + IN * (ww * 0.20)
    for i in range(5):
        dxx = (i - 2) * 0.013; tube(b, [bc + IN * (dxx - 0.005), bc + IN * (dxx + 0.005)], rw * 0.50, G_BELT, 28)
    tube(b, [bc + IN * 0.04, bc + IN * 0.075], [rw * 0.42, rw * 0.30], G_SKIN, 24)
    for i in range(6):
        ang = 2 * math.pi * i / 6; p = bc + IN * 0.058 + (F * math.cos(ang) + U * math.sin(ang)) * rw * 0.32; tube(b, [p - IN * 0.014, p + IN * 0.026], 0.018, G_METAL, 8)
    tq = bc + IN * 0.05 + R_ * rw * 0.28; link(b, tq, low + R_ * 0.09 + U * 0.03, 0.022, 0.012, G_SKIN, IN)
    # ножницы спереди штока
    p0 = at(0.54) + F * 0.085; k_ = at(0.54) + d * 0.22 + F * 0.19; p1 = low + F * 0.075 + U * 0.03
    link(b, p0, k_, 0.030, 0.018); link(b, k_, p1, 0.030, 0.018); box(b, at(0.54) + F * 0.055, X, U, F, 0.022, 0.026, 0.036, G_SKIN); box(b, low + F * 0.05 + U * 0.03, X, U, F, 0.022, 0.026, 0.036, G_SKIN)
    # щиток снаружи стойки
    xd = sx * (g.MG_X + 0.03 + 0.0); yt, yb = T.z - 0.10, T.z - 0.62; pts = [(g.MG_A - 0.30, yt), (g.MG_A + 0.34, yt - 0.02), (g.MG_A + 0.22, yb), (g.MG_A - 0.20, yb)]
    pl = lambda dx: [P3(a_, xd + sx * dx, y_) for a_, y_ in pts]; b.loft([pl(-0.008), pl(0.008)], G_COCK, cap0=G_COCK, cap1=G_COCK)
    for t in (0.25, 0.6, 0.9): tube(b, [P3(g.MG_A - 0.30 + 0.10 * t, xd + sx * 0.012, yt - 0.52 * t), P3(g.MG_A + 0.34 - 0.12 * t, xd + sx * 0.012, yt - 0.02 - 0.50 * t)], 0.007, G_COCK, 6)
    for t in (0.2, 0.75): link(b, at(0.08 + 0.42 * t) - IN * 0.05, P3(g.MG_A + 0.03, xd - sx * 0.004, yt - 0.48 * t - 0.02), 0.014, 0.008, G_SKIN, F)
    # гидравлика: тормозная линия вниз до тормоза, вторая по цилиндру
    o1 = F * 0.078 + IN * 0.018; hose(b, [at(0.06) + o1, at(0.30) + o1, at(0.54) + o1 * 1.05, at(0.64) + o1 * 1.4, at(0.86) + o1 * 1.3 + IN * 0.02, bc + IN * 0.08 + F * rw * 0.22 + U * 0.03], 0.0075, (0.15, 0.4, 0.6, 0.82))
    o2 = R_ * 0.078 - IN * 0.016; hose(b, [at(0.06) + o2, at(0.32) + o2, at(0.54) + o2 * 1.05], 0.006, (0.3, 0.75), G_BELT)
    hose(b, [at(0.10) - IN * 0.078, at(0.28) - IN * 0.080, at(0.46) - IN * 0.078], 0.0055, (0.5,))
    ob = b.finish('gear_m_' + n_, sharp_deg=40); g._rel(ob, T)
    # подкос складной и цилиндр уборки
    b2 = B(); sp = P3(g.MG_A - 0.72, sx * 1.72, -0.42); e_ = at(0.46) + F * 0.086; kn = sp.lerp(e_, 0.5) + U * 0.095 + X * sx * 0.03
    for sg in (1, -1):
        tube(b2, [sp + X * sg * 0.04, kn + X * sg * 0.038], [0.022, 0.036], G_SKIN, 8); tube(b2, [kn + X * sg * 0.038, e_ + X * sg * 0.034], [0.036, 0.022], G_SKIN, 8)
    tube(b2, [sp - X * 0.09, sp + X * 0.09], 0.028, G_SKIN, 12); tube(b2, [kn - X * 0.058, kn + X * 0.058], 0.028, G_BELT, 12); tube(b2, [e_ - X * 0.055, e_ + X * 0.055], 0.021, G_BELT, 10)
    cy0 = sp + U * 0.06 + F * 0.02; cmid = cy0.lerp(kn, 0.55); tube(b2, [cy0, cmid], 0.031, G_SKIN, 12); tube(b2, [cmid, kn + U * 0.012], 0.015, G_METAL, 10)
    hose(b2, [cy0 + X * 0.036, cy0.lerp(kn, 0.3) + X * 0.05 + U * 0.015, cmid + X * 0.036], 0.006)
    br_ = b2.finish('gear_m_brace_' + n_, sharp_deg=45); g._rel(br_, sp)
    g.PARTS['gear_m_' + n_] = dict(pivot=T.copy(), axis=Vector((1, 0, 0)), range=(0.0, 76.0), note='0 - выпущено; 76 - убрано колесом вперёд: дальше упирается в открытую створку', retracted=76.0)
    g.PARTS['gear_m_brace_' + n_] = dict(pivot=sp.copy(), axis=Vector((1, 0, 0)), range=None, note='подкос: движется вместе со стойкой')
    return [ob, br_]
