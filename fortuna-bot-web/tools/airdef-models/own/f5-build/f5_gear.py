# f5_gear.py - шасси F-5E Tiger II (фото f5e_07 спереди, f5e_10 и f5e_04 сбоку, чертёж f5e_15): длинная носовая стойка с одним колесом, убирается вперёд;
# основные - косые ноги от корня крыла наружу, колесо снаружи ноги, большой щиток на ноге, боковой складной подкос; убираются внутрь в фюзеляж.
# Помощники (труба, хомуты, рычаги, колесо с диском и болтами) - с образца JAS 39 Gripen.
# Цвета задаёт материал: G_SKIN краска, G_METAL хром штока, G_BELT тёмная сталь, G_DARK шланги и нутро, G_COCK серые щитки, G_GLASS фара, G_TYRE резина.
import math
from mathutils import Vector, Matrix
from modelkit import B
import f5_geo as g
from f5_geo import P3, G_SKIN, G_METAL, G_DARK, G_TYRE, G_COCK, G_BELT, G_GLASS
G_HANDLE = G_GLASS
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


# ── размеры (фото f5e_07, f5e_10; чертёж f5e_15: колёса на 4,15 и 9,25 м от ПВД, колея ~3,7 м; высота по килю 4,11 м) ──
GROUND_Z = g.FIN_Z1 - 4.11
NG = dict(a=4.15, hinge=(4.42, -1.26), rw=0.230, ww=0.150)          # носовая: колесо, шарнир у задней стенки ниши
NBAY = dict(a0=3.18, a1=4.50, hw=0.165)                              # ниша носовой стойки (впереди шарнира, стойка уходит вперёд)
MG_A, MG_X = 9.25, 1.80; MAIN_T = (9.25, 1.66, -1.205)                # фото f5e_07: нога почти вертикально из-под крыла, колесо снаружи
MRW, MWW = 0.305, 0.200


def _bot(a, x):
    import f5_detail as dt
    return dt.bot_pt(a, x)


def gear_nose():
    a_h, z_h = NG['hinge']; rw, ww = NG['rw'], NG['ww']
    T = P3(a_h, 0.0, z_h); wc = P3(NG['a'], 0.0, GROUND_Z + rw); low = wc + U * (rw + 0.10)
    d = (low - T); L = d.length; d = d.normalized(); at = lambda s: T + d * s
    b = B()
    wheel(b, wc, rw, ww, 6)
    tube(b, [wc - X * (ww * 0.5 + 0.045), wc + X * (ww * 0.5 + 0.045)], 0.022, G_BELT, 12)                    # ось
    for sg in (1, -1):                                                                                      # вилка: щёки по бокам колеса
        p0 = low + X * sg * (ww * 0.5 + 0.030); p1 = wc + X * sg * (ww * 0.5 + 0.030)
        box(b, (p0 + p1) / 2, X, F, (p0 - p1).normalized(), 0.012, 0.042, (p0 - p1).length / 2 + 0.03, G_SKIN, 0.75)
    box(b, low + U * 0.01, X, F, U, ww * 0.5 + 0.045, 0.050, 0.035, G_SKIN)                                  # перемычка вилки
    trunnion(b, T, 0.17, 0.042); collar(b, at(0.03), d, 0.070, 0.09)
    tube(b, [at(0.02), at(0.58)], 0.055, G_SKIN, 18)                                                        # цилиндр
    for s, r_, h_ in ((0.18, 0.066, 0.03), (0.36, 0.068, 0.06), (0.58, 0.066, 0.05)): collar(b, at(s), d, r_, h_)
    for i in range(10):
        ang = 2 * math.pi * i / 10; u_ = d.orthogonal().normalized(); v_ = d.cross(u_); p = at(0.36) + (u_ * math.cos(ang) + v_ * math.sin(ang)) * 0.072; box(b, p, u_, v_, d, 0.005, 0.005, 0.022, G_BELT)
    tube(b, [at(0.58), at(L - 0.02)], 0.036, G_METAL, 18)                                                   # хромовый шток (длинный: стойка выдвижная)
    collar(b, at(L - 0.01), d, 0.052, 0.05)
    details(b, at, d, 0.055, 0.08, 0.30, -X)
    # ножницы спереди штока
    p0 = at(0.56) + F * 0.066; k_ = at(0.56) + d * 0.18 + F * 0.15; p1 = low + F * 0.058 + U * 0.02
    link(b, p0, k_, 0.020, 0.014); link(b, k_, p1, 0.020, 0.014); box(b, at(0.56) + F * 0.042, X, U, F, 0.016, 0.020, 0.028, G_SKIN); box(b, low + F * 0.038 + U * 0.02, X, U, F, 0.016, 0.020, 0.028, G_SKIN)
    # фара рулёжки на цилиндре спереди
    c_ = at(0.30) + F * 0.085; tube(b, [c_ - F * 0.03, c_, c_ + F * 0.04], [0.026, 0.042, 0.042], G_METAL, 16); tube(b, [c_ + F * 0.041, c_ + F * 0.047], [0.038, 0.030], G_HANDLE, 16)
    box(b, at(0.30) + F * 0.055, X, U, F, 0.020, 0.030, 0.020, G_SKIN)
    # гидравлика и проводка
    off1 = X * 0.064 + F * 0.010; hose(b, [at(0.04) + off1, at(0.30) + off1 * 1.02, at(0.52) + off1 * 1.05, at(0.66) + off1 * 0.95, at(0.70) + X * 0.03 + F * 0.07], 0.006, (0.2, 0.55, 0.85))
    off2 = -X * 0.064 + R_ * 0.010; hose(b, [at(0.04) + off2, at(0.32) + off2, at(0.55) + off2], 0.005, (0.3, 0.7), G_BELT)
    ob = b.finish('gear_n', sharp_deg=40); g._rel(ob, T)
    # складной подкос вперёд к передней стенке ниши: отдельный объект
    b2 = B(); sp = P3(NBAY['a0'] + 0.18, 0.0, z_h + 0.10); e_ = at(0.50) + F * 0.060; kn = sp.lerp(e_, 0.52) + U * 0.10 + R_ * 0.02
    for sg in (1, -1):
        tube(b2, [sp + X * sg * 0.036, kn + X * sg * 0.032], [0.018, 0.028], G_SKIN, 8); tube(b2, [kn + X * sg * 0.032, e_ + X * sg * 0.028], [0.028, 0.018], G_SKIN, 8)
    tube(b2, [sp - X * 0.07, sp + X * 0.07], 0.022, G_SKIN, 12); tube(b2, [kn - X * 0.046, kn + X * 0.046], 0.022, G_BELT, 12); tube(b2, [e_ - X * 0.045, e_ + X * 0.045], 0.016, G_BELT, 10)
    cy0 = sp + U * 0.050 + R_ * 0.02; cmid = cy0.lerp(kn, 0.55); tube(b2, [cy0, cmid], 0.025, G_SKIN, 12); tube(b2, [cmid, kn + U * 0.01], 0.012, G_METAL, 10)
    hose(b2, [cy0 + X * 0.028, cy0.lerp(kn, 0.3) + X * 0.04 + U * 0.012, cmid + X * 0.028], 0.0048)
    br_ = b2.finish('gear_n_brace', sharp_deg=45); g._rel(br_, sp)
    g.PARTS['gear_n'] = dict(pivot=T.copy(), axis=Vector((1, 0, 0)), range=(0.0, 95.0), note='0 - выпущено; 95 - убрано вперёд в нишу под кабиной', retracted=95.0)
    g.PARTS['gear_n_brace'] = dict(pivot=sp.copy(), axis=Vector((1, 0, 0)), range=None, note='подкос складывается вместе со стойкой')
    return [ob, br_]


def gear_main(sx):
    """Основная (фото f5e_07, f5e_10): нога почти вертикально из-под крыла, колесо снаружи, ножницы сзади, складной подкос к корню крыла,
    большой щиток на ноге снаружи (внизу отходит наружу). Убирается внутрь: колесо ложится в нишу под коробом заборника."""
    n_ = 'r' if sx > 0 else 'l'; rw, ww = MRW, MWW; OUT = X * sx; IN = -OUT
    wc = P3(MG_A, sx * MG_X, GROUND_Z + rw); T = P3(MAIN_T[0], sx * MAIN_T[1], MAIN_T[2])
    axle_in = wc + IN * (ww * 0.5 + 0.050); low = axle_in + U * 0.12
    d = (low - T); L = d.length; d = d.normalized(); at = lambda s: T + d * s
    side = OUT
    b = B()
    tube(b, [T - F * 0.20, T + F * 0.20], 0.052, G_SKIN, 14)                                                # цапфа вдоль потока
    collar(b, at(0.03), d, 0.086, 0.11)
    tube(b, [at(0.02), at(0.56)], 0.070, G_SKIN, 20)
    for s_, r_, h_ in ((0.16, 0.080, 0.04), (0.36, 0.080, 0.04), (0.56, 0.082, 0.06)): collar(b, at(s_), d, r_, h_)
    tube(b, [at(0.56), at(L - 0.02)], 0.048, G_METAL, 20)
    collar(b, at(L - 0.01), d, 0.068, 0.07)
    details(b, at, d, 0.070, 0.08, 0.34, R_)
    tube(b, [low, axle_in + U * 0.02], [0.056, 0.050], G_SKIN, 14); box(b, axle_in + U * 0.03, F, U, OUT, 0.060, 0.050, 0.035, G_SKIN)
    # ножницы сзади штока
    p0 = at(0.54) + R_ * 0.084; k_ = at(0.54) + d * 0.20 + R_ * 0.185; p1 = low + R_ * 0.075 + U * 0.03
    link(b, p0, k_, 0.028, 0.017, G_SKIN, X); link(b, k_, p1, 0.028, 0.017, G_SKIN, X)
    box(b, at(0.54) + R_ * 0.052, X, U, R_, 0.020, 0.024, 0.034, G_SKIN); box(b, low + R_ * 0.048 + U * 0.03, X, U, R_, 0.020, 0.024, 0.034, G_SKIN)
    # щиток на ноге: снаружи колеса, сверху у цапфы, внизу отходит наружу (фото f5e_07, f5e_10)
    top0 = T + OUT * 0.14 + U * 0.01; bot0 = wc + OUT * (ww * 0.5 + 0.10) + U * 0.02
    pts = [top0 + F * 0.30, top0 + R_ * 0.28, bot0 + R_ * 0.20, bot0 + F * 0.22]
    nrm = (pts[1] - pts[0]).cross(pts[3] - pts[0]).normalized()
    b.loft([[p - nrm * 0.008 for p in pts], [p + nrm * 0.008 for p in pts]], G_COCK, cap0=G_COCK, cap1=G_COCK)
    for t_ in (0.22, 0.55):                                                                                  # кронштейны щитка к ноге
        q_ = at(t_ * L); e_ = top0.lerp(bot0, t_) ; tube(b, [q_ + OUT * 0.06, e_ - OUT * 0.008], 0.014, G_BELT, 8)
    o1 = F * 0.076 + IN * 0.015; hose(b, [at(0.06) + o1, at(0.30) + o1, at(0.52) + o1 * 1.05, at(0.62) + o1 * 1.3, at(0.80) + o1 * 1.2, axle_in + F * rw * 0.22 + U * 0.03], 0.007, (0.15, 0.4, 0.6, 0.82))
    o2 = R_ * 0.076 + IN * 0.014; hose(b, [at(0.06) + o2, at(0.30) + o2, at(0.52) + o2 * 1.05], 0.0055, (0.3, 0.75), G_BELT)
    ob = b.finish('gear_m_' + n_, sharp_deg=40); g._rel(ob, T)
    # колесо с тормозом снаружи ноги
    b3 = B(); wheel(b3, wc, rw, ww, 8)
    tube(b3, [wc + IN * (ww * 0.5 + 0.055), wc - IN * (ww * 0.5 + 0.016)], 0.026, G_BELT, 12)
    bc = wc + IN * (ww * 0.20)
    for i in range(5):
        dxx = (i - 2) * 0.012; tube(b3, [bc + IN * (dxx - 0.005), bc + IN * (dxx + 0.005)], rw * 0.50, G_BELT, 28)
    tube(b3, [bc + IN * 0.04, bc + IN * 0.072], [rw * 0.42, rw * 0.30], G_SKIN, 24)
    for i in range(6):
        ang = 2 * math.pi * i / 6; p = bc + IN * 0.056 + (F * math.cos(ang) + U * math.sin(ang)) * rw * 0.32; tube(b3, [p - IN * 0.014, p + IN * 0.024], 0.016, G_METAL, 8)
    wh = b3.finish('gear_w_' + n_, sharp_deg=40); g._rel(wh, axle_in)
    # складной подкос от середины ноги к корню крыла (фото f5e_07) и цилиндр уборки
    b2 = B(); sp = P3(MAIN_T[0] + 0.05, sx * 1.05, -1.235); e_ = at(0.36 * L) + IN * 0.075; kn = sp.lerp(e_, 0.45) + U * 0.06 + R_ * 0.03
    for sg in (1, -1):
        tube(b2, [sp + F * sg * 0.04, kn + F * sg * 0.036], [0.020, 0.032], G_SKIN, 8); tube(b2, [kn + F * sg * 0.036, e_ + F * sg * 0.032], [0.032, 0.020], G_SKIN, 8)
    tube(b2, [sp - F * 0.08, sp + F * 0.08], 0.026, G_SKIN, 12); tube(b2, [kn - F * 0.052, kn + F * 0.052], 0.026, G_BELT, 12); tube(b2, [e_ - F * 0.05, e_ + F * 0.05], 0.019, G_BELT, 10)
    cy0 = sp + R_ * 0.14 + U * 0.02; cmid = cy0.lerp(kn + R_ * 0.05, 0.55); tube(b2, [cy0, cmid], 0.028, G_SKIN, 12); tube(b2, [cmid, kn + R_ * 0.05], 0.014, G_METAL, 10)
    hose(b2, [cy0 + R_ * 0.03, cy0.lerp(kn, 0.3) + R_ * 0.05 + U * 0.012, cmid + R_ * 0.03], 0.0055)
    br_ = b2.finish('gear_m_brace_' + n_, sharp_deg=45); g._rel(br_, sp)
    g.PARTS['gear_m_' + n_] = dict(pivot=T.copy(), axis=F * sx, range=(0.0, 92.0), note='0 - выпущено; 92 - убрано внутрь, колесо ложится в нишу под коробом заборника, щиток закрывает прорезь в крыле', retracted=92.0)
    g.PARTS['gear_w_' + n_] = dict(pivot=axle_in.copy(), axis=OUT.copy(), range=None, note='колесо, дочерняя часть gear_m')
    g.PARTS['gear_m_brace_' + n_] = dict(pivot=sp.copy(), axis=F * sx, range=None, note='подкос складывается вместе со стойкой')
    return [ob, wh, br_]


def nose_doors():
    """Створки ниши носовой стойки: две, шарнир у наружной кромки, открыты вниз на 85°. Только в файле стоек (обшивка самолёта цела, контур - швом)."""
    import f5_detail as dt
    out = []; D = NBAY
    for sx in (1, -1):
        x0, x1 = sorted((sx * 0.006, sx * D['hw']))
        ob = dt._bottom_plate('gear_door_n_' + ('r' if sx > 0 else 'l'), D['a0'], D['a1'], x0, x1, nu=4, nv=10, th=0.012)
        e0 = _bot(D['a0'], sx * D['hw']); e1 = _bot(D['a1'], sx * D['hw']); piv = (e0 + e1) / 2; ax = (e1 - e0).normalized() * sx
        _rel_open(ob, piv, ax, 85.0)
        g.PARTS[ob.name] = dict(pivot=piv.copy(), axis=ax.copy(), range=(0.0, 85.0), note='створка носовой ниши: шарнир у наружной кромки, плюс - внутренняя кромка вниз; в файле стоек открыта на 85°', open=85.0)
        out.append(ob)
    return out


def _rel_open(ob, piv, ax, deg):
    g._rel(ob, piv); ob.rotation_mode = 'AXIS_ANGLE'; ob.rotation_axis_angle = (math.radians(deg), ax.x, ax.y, ax.z)


def gear_all():
    return gear_nose() + gear_main(1) + gear_main(-1) + nose_doors()
