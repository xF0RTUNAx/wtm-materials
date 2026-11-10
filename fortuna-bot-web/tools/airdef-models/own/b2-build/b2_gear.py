# b2_gear.py - шасси B-2A: носовая стойка с двумя колёсами и створкой спереди (b2_03, 04), две основные с тележкой на четыре колеса и большими створками (b2_04, 05, 06, 09).
# Земля - z = GROUND (по b2_05: от плоскости кромки до земли 2,85 м). Колёса: носовые 0,92 м, основные 1,24 м. Помощники (труба, колесо, рычаг, шланг) - с F-117A.
import math
from mathutils import Vector
from modelkit import B
import b2_geo as g
from b2_geo import P3, G_SKIN, G_METAL, G_DARK, G_TYRE, G_COCK

G_BELT, G_HANDLE = 2, 3          # тёмная сталь - чёрный, стекло фар - стекло
GROUND = -2.85
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
    n = 36                                                                                                  # было 56: 10 колёс, вес файла шасси
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
            tube(b, [p - X * s * 0.006, p + X * s * 0.003], rw * 0.070, G_DARK, 10)                                                   # отверстие
            q_ = p + X * s * 0.003; d0 = (F * math.cos(ang) + U * math.sin(ang)); e0 = X.cross(d0)
            ring = lambda r_, h_: [q_ + X * s * h_ + (d0 * math.cos(2 * math.pi * k / 10) + e0 * math.sin(2 * math.pi * k / 10)) * r_ for k in range(10)]
            rs_ = [ring(rw * 0.072, 0.0), ring(rw * 0.085, 0.008), ring(rw * 0.112, 0.0), ring(rw * 0.072, 0.0)]; b.loft(rs_, G_SKIN)       # кромка отверстия
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



def _rel(ob, T):
    me = ob.data
    for v in me.vertices: v.co -= T
    ob.location = T


def gear_nose():
    rw, ww, trk = 0.46, 0.24, 0.30
    T = P3(2.62, 0.0, -0.36); wc = P3(2.48, 0.0, GROUND + rw); low = wc + U * 0.30
    d = (low - T); L = d.length; d = d.normalized(); at = lambda s: T + d * s
    b = B()
    for sg in (1, -1): wheel(b, wc + X * sg * trk, rw, ww, 8)
    trunnion(b, T, 0.26, 0.060); collar(b, at(0.03), d, 0.10, 0.12)
    tube(b, [at(0.02), at(0.62)], 0.085, G_SKIN, 20)
    for s, r_, h_ in ((0.2, 0.098, 0.05), (0.42, 0.098, 0.08), (0.62, 0.096, 0.06)): collar(b, at(s), d, r_, h_)
    tube(b, [at(0.62), at(L - 0.03)], 0.058, G_METAL, 20); collar(b, at(L - 0.02), d, 0.08, 0.07)
    details(b, at, d, 0.085, 0.08, 0.34, -X)
    tube(b, [wc - X * (trk + ww * 0.5 + 0.02), wc + X * (trk + ww * 0.5 + 0.02)], 0.036, G_BELT, 12)
    tube(b, [low + U * 0.03, wc], [0.07, 0.06], G_SKIN, 14); box(b, wc, X, U, F, 0.13, 0.05, 0.05, G_SKIN)
    p0 = at(0.60) + R_ * 0.10; k_ = at(0.80) + R_ * 0.22; p1 = low + R_ * 0.085 + U * 0.02
    link(b, p0, k_, 0.032, 0.020); link(b, k_, p1, 0.032, 0.020)
    for sg in (1, -1):                                                                               # фары спереди (b2_03)
        c_ = at(0.70) + F * 0.14 + X * sg * 0.09; tube(b, [c_ - F * 0.04, c_, c_ + F * 0.05], [0.04, 0.06, 0.06], G_METAL, 16); tube(b, [c_ + F * 0.051, c_ + F * 0.056], [0.055, 0.045], G_HANDLE, 16)
    off1 = X * 0.09 + F * 0.015; hose(b, [at(0.05) + off1, at(0.30) + off1, at(0.58) + off1 * 1.05, at(0.70) + off1 * 0.9], 0.008, (0.2, 0.55, 0.85))
    ob = b.finish('gear_n', sharp_deg=40); _rel(ob, T)
    b2 = B(); sp = P3(3.75, 0.0, -0.40); e_ = at(0.52) + R_ * 0.09; kn = sp.lerp(e_, 0.5) + U * 0.12
    for sg in (1, -1):
        tube(b2, [sp + X * sg * 0.05, kn + X * sg * 0.045], [0.026, 0.040], G_SKIN, 8); tube(b2, [kn + X * sg * 0.045, e_ + X * sg * 0.04], [0.040, 0.026], G_SKIN, 8)
    tube(b2, [sp - X * 0.10, sp + X * 0.10], 0.03, G_SKIN, 12); tube(b2, [kn - X * 0.065, kn + X * 0.065], 0.032, G_BELT, 12); tube(b2, [e_ - X * 0.06, e_ + X * 0.06], 0.026, G_BELT, 10)
    br_ = b2.finish('gear_n_brace', sharp_deg=45); _rel(br_, sp)
    g.PARTS['gear_n'] = dict(pivot=T.copy(), axis=Vector((1, 0, 0)), range=(0.0, 95.0), note='0 - выпущено; 95 - убрано колёсами назад', retracted=95.0)
    g.PARTS['gear_n_brace'] = dict(pivot=sp.copy(), axis=Vector((1, 0, 0)), range=None, note='подкос складывается вместе со стойкой')
    return [ob, br_]


def gear_main(sx):
    """Основная: прямая нога, тележка на два ряда по два колеса, ножницы, боковой и задний подкосы."""
    n_ = 'r' if sx > 0 else 'l'; rw, ww = 0.62, 0.30; xc = 6.25; IN = X * (-sx)
    T = P3(9.55, sx * xc, -0.45); bp = P3(10.0, sx * xc, GROUND + rw + 0.20)
    d = (bp - T); L = d.length; d = d.normalized(); at = lambda s: T + d * s
    b = B()
    trunnion(b, T, 0.34, 0.08); collar(b, at(0.03), d, 0.15, 0.16)
    tube(b, [at(0.02), at(0.60)], 0.125, G_SKIN, 22)
    for s, r_, h_ in ((0.18, 0.14, 0.05), (0.40, 0.14, 0.06), (0.60, 0.142, 0.08)): collar(b, at(s), d, r_, h_)
    tube(b, [at(0.60), at(L - 0.06)], 0.085, G_METAL, 22); collar(b, at(L - 0.05), d, 0.12, 0.09)
    details(b, at, d, 0.125, 0.08, 0.36, -IN)
    # тележка: балка вдоль a, две оси поперёк
    a1, a2 = 9.30, 10.70; B1 = P3(a1, sx * xc, GROUND + rw); B2 = P3(a2, sx * xc, GROUND + rw)
    tube(b, [B1 + R_ * -0.12, B1, bp - U * 0.20, B2, B2 + R_ * 0.12], [0.07, 0.085, 0.10, 0.085, 0.07], G_SKIN, 16)
    tube(b, [bp + U * 0.02, bp - U * 0.22], 0.09, G_SKIN, 14)
    for Bc in (B1, B2): tube(b, [Bc - X * 0.52, Bc + X * 0.52], 0.05, G_BELT, 12)
    p0 = at(0.58) + F * 0.15; k_ = at(0.78) + F * 0.30; p1 = bp + F * 0.13 + U * 0.05
    link(b, p0, k_, 0.042, 0.024); link(b, k_, p1, 0.042, 0.024)
    tube(b, [at(0.70) + R_ * 0.12, B2 + U * 0.15], [0.04, 0.03], G_SKIN, 10)                     # тяга наклона тележки
    o1 = F * 0.13 + IN * 0.02; hose(b, [at(0.06) + o1, at(0.30) + o1, at(0.58) + o1 * 1.05, at(0.85) + o1 * 1.2, B1 + U * 0.25 + o1], 0.009, (0.15, 0.4, 0.6, 0.82))
    ob = b.finish('gear_m_' + n_, sharp_deg=40); _rel(ob, T)
    b3 = B()
    for Bc in (B1, B2):
        for sg in (1, -1):
            wcc = Bc + X * sg * 0.33; wheel(b3, wcc, rw, ww, 10)
            bc = wcc - X * sg * (ww * 0.20)
            for i in range(5):
                dxx = (i - 2) * 0.016; tube(b3, [bc + X * sg * (dxx - 0.006), bc + X * sg * (dxx + 0.006)], rw * 0.50, G_BELT, 28)
    wh = b3.finish('gear_w_' + n_, sharp_deg=40); _rel(wh, bp)
    b2 = B(); sp = P3(9.0, sx * (xc - 0.9), -0.30); e_ = at(0.46) + IN * 0.13; kn = sp.lerp(e_, 0.5) + U * 0.14
    for sg in (1, -1):
        tube(b2, [sp + F * sg * 0.06, kn + F * sg * 0.055], [0.032, 0.05], G_SKIN, 8); tube(b2, [kn + F * sg * 0.055, e_ + F * sg * 0.05], [0.05, 0.032], G_SKIN, 8)
    tube(b2, [sp - F * 0.12, sp + F * 0.12], 0.036, G_SKIN, 12); tube(b2, [kn - F * 0.08, kn + F * 0.08], 0.038, G_BELT, 12)
    sp2 = P3(11.4, sx * xc, -0.40); e2 = at(0.40) + R_ * 0.13
    tube(b2, [sp2, sp2.lerp(e2, 0.55)], 0.06, G_SKIN, 12); tube(b2, [sp2.lerp(e2, 0.55), e2], 0.035, G_METAL, 12)    # задний подкос-цилиндр
    br_ = b2.finish('gear_m_brace_' + n_, sharp_deg=45); _rel(br_, sp)
    g.PARTS['gear_m_' + n_] = dict(pivot=T.copy(), axis=Vector((-sx, 0, 0)) if False else Vector((1, 0, 0)), range=(0.0, 92.0), note='0 - выпущено; ход уборки - вперёд-вверх (проверить по нише)', retracted=92.0)
    g.PARTS['gear_w_' + n_] = dict(pivot=bp.copy(), axis=X.copy(), range=(-12.0, 12.0), note='тележка качается на оси низа ноги')
    g.PARTS['gear_m_brace_' + n_] = dict(pivot=sp.copy(), axis=Vector((0, 1, 0)), range=None, note='подкосы складываются вместе со стойкой')
    return [ob, wh, br_]
