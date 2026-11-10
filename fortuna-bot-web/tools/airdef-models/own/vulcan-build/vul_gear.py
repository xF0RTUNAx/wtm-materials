# vul_gear.py - шасси Vulcan B.2: передняя стойка на два колеса за носом, основные стойки с тележками на восемь колёс под крылом снаружи от двигателей, створки ниш (vulcan_04, 05, 06).
# Цвета задаёт материал: G_SKIN светло-серая краска стоек, G_METAL хром штока, G_BELT тёмная сталь, G_DARK шланги и нутро, G_COCK серые щитки, G_TYRE резина.
# Вспомогательные tube, collar, box, link, hose, wheel - как у Hunter FGA.9 (Свои/Hunter FGA.9/hn_gear.py).
import math
from mathutils import Vector
from modelkit import B
import vul_geo as g
from vul_geo import P3, Z, Yb, G_SKIN, G_METAL, G_DARK, G_TYRE, G_COCK, PARTS, patch, down, _rel

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


def wheel(b, c, rw, ww, holes=6):
    """Колесо: шина с беговой дорожкой, канавками и поясками на боковине; обод с закраиной и болтами; глубокий диск с отверстиями, ступица с крышкой, вентиль."""
    n = 36
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
            rs_ = [ring(rw * 0.072, 0.0), ring(rw * 0.080, 0.008), ring(rw * 0.098, 0.008), ring(rw * 0.112, 0.0), ring(rw * 0.072, 0.0)]; b.loft(rs_, G_SKIN)       # кромка отверстия
        for i in range(8):
            ang = 2 * math.pi * (i + 0.5) / 8; p = ph(ang, 0.155, 0.47); tube(b, [p, p + X * s * 0.012], rw * 0.017, G_BELT, 6)       # болты ступицы
        for i in range(10):
            ang = 2 * math.pi * (i + 0.25) / 10; p = ph(ang, 0.625, 0.56); tube(b, [p, p + X * s * 0.006], rw * 0.012, G_BELT, 6)       # болты обода
        cp = c + X * (s * ww * 0.50); tube(b, [cp, cp + X * s * 0.012, cp + X * s * 0.02], [rw * 0.075, rw * 0.070, rw * 0.04], G_BELT, 12)    # крышка ступицы
    vp = c + X * (ww * 0.20) + U * rw * 0.56; tube(b, [vp, vp + X * 0.018 - U * 0.012, vp + X * 0.035 - U * 0.018], 0.0055, G_BELT, 6)         # вентиль
    for ang_ in (0.7, 3.4):
        p = c + X * (ww * 0.47) + (F * math.cos(ang_) + U * math.sin(ang_)) * rw * 0.595; box(b, p, X, F * math.cos(ang_ + 1.57) + U * math.sin(ang_ + 1.57), F * math.cos(ang_) + U * math.sin(ang_), 0.006, 0.022, 0.006, G_BELT)   # грузики балансировки



GROUND = Z(0.0)
NOSE = dict(a=9.80, top=2.235, rw=0.430, ww=0.200, trk=0.250)          # передняя стойка: место, низ фюзеляжа над ней, колесо, полуколея
MAIN = dict(a=19.00, x=4.75, rw=0.395, ww=0.225, trk=0.300, dax=0.72)  # основная: место, x, колесо, полуколея пары, шаг осей тележки
NOSE_BAY = (8.90, 11.20, 0.40)                                          # a0, a1, полуширина ниши
MAIN_BAY = (17.80, 20.30, 4.05, 5.45)                                   # a0, a1, x внутр., x наружн.


def gear_nose():
    b = B(); a = NOSE['a']; rw, ww, trk = NOSE['rw'], NOSE['ww'], NOSE['trk']
    yax = GROUND + rw; ytop = Z(NOSE['top']) + 0.10; axle = P3(a + 0.18, 0.0, yax)
    for s in (1, -1): wheel(b, axle + X * s * (trk), rw, ww)
    tube(b, [axle - X * (trk - ww * 0.5), axle + X * (trk - ww * 0.5)], 0.045, G_BELT, 12)                  # ось
    pv = P3(a, 0.0, yax + 0.32); tube(b, [P3(a, 0.0, ytop), P3(a, 0.0, yax + 0.75)], 0.115, G_SKIN, 18)     # цилиндр
    tube(b, [P3(a, 0.0, yax + 0.80), pv], 0.080, G_METAL, 16)                                               # шток
    collar(b, P3(a, 0.0, yax + 0.77), U, 0.128, 0.05, G_SKIN)
    box(b, (pv + axle) / 2 + Vector((0, 0, 0.02)), X, F, U, 0.07, 0.10, 0.16, G_SKIN)                       # вилка
    link(b, P3(a - 0.15, 0.0, yax + 0.82), P3(a - 0.15, 0.0, yax + 0.55), 0.035, 0.018); link(b, P3(a - 0.15, 0.0, yax + 0.55), P3(a, 0.0, yax + 0.36), 0.035, 0.018)
    tube(b, [P3(a, 0.0, ytop - 0.30), P3(a - 1.00, 0.0, Z(NOSE['top']) + 0.05)], 0.060, G_SKIN, 12)          # подкос вперёд
    hose(b, [P3(a + 0.12, 0.0, ytop - 0.1), P3(a + 0.14, 0.0, yax + 0.9), P3(a + 0.17, 0.02, yax + 0.5), P3(a + 0.18, 0.08, yax + 0.10)], 0.010, (0.3, 0.7))
    tube(b, [P3(a - 0.20, 0.0, yax + 0.95), P3(a - 0.32, 0.0, yax + 0.95)], 0.075, G_METAL, 14)            # фара рулёжки
    return [b.finish('gear_n', sharp_deg=35)]


def gear_main(sx):
    b = B(); a, x = MAIN['a'], sx * MAIN['x']; rw, ww, trk, dax = MAIN['rw'], MAIN['ww'], MAIN['trk'], MAIN['dax']
    yax = GROUND + rw; ytop = g.wing_bot(MAIN['x'], a) + 0.12; piv = P3(a, x, yax + 0.20)
    for k in range(4):                                                                                       # тележка: 4 оси по 2 колеса
        ax = P3(a + (k - 1.5) * dax, x, yax)
        for s in (1, -1): wheel(b, ax + X * s * trk, rw, ww)
        tube(b, [ax - X * (trk - ww * 0.5), ax + X * (trk - ww * 0.5)], 0.042, G_BELT, 12)
    box(b, P3(a, x, yax + 0.05), X, U, F, 0.06, 0.07, 2.0 * dax + 0.18, G_SKIN)                             # балка тележки
    tube(b, [piv - X * 0.12, piv + X * 0.12], 0.07, G_BELT, 14)                                              # шарнир тележки
    tube(b, [P3(a, x, ytop), P3(a, x, yax + 1.05)], 0.150, G_SKIN, 20)                                       # цилиндр
    tube(b, [P3(a, x, yax + 1.10), piv], 0.105, G_METAL, 18)                                                 # шток
    collar(b, P3(a, x, yax + 1.07), U, 0.165, 0.06, G_SKIN)
    link(b, P3(a - 0.20, x, yax + 1.10), P3(a - 0.20, x, yax + 0.70), 0.040, 0.020); link(b, P3(a - 0.20, x, yax + 0.70), P3(a - 0.05, x, yax + 0.28), 0.040, 0.020)
    tube(b, [P3(a, x, ytop - 0.45), P3(a - 1.30, x, ytop + 0.02)], 0.070, G_SKIN, 12)                        # подкос вперёд
    tube(b, [P3(a, x, ytop - 0.65), P3(a, x + sx * 0.75, ytop + 0.02)], 0.055, G_SKIN, 12)                  # боковой подкос
    tube(b, [P3(a + 0.35, x, yax + 0.32), P3(a + 0.35, x, ytop - 0.6)], 0.035, G_METAL, 10)                  # демпфер тележки
    hose(b, [P3(a + 0.15, x + sx * 0.12, ytop - 0.1), P3(a + 0.17, x + sx * 0.14, yax + 1.0), P3(a + 0.10, x + sx * 0.16, yax + 0.5), P3(a + 0.30, x + sx * 0.20, yax + 0.12)], 0.011, (0.3, 0.7))
    return [b.finish('gear_m_' + ('r' if sx > 0 else 'l'), sharp_deg=35)]


def doors():
    """Створки: передняя ниша - две продольные; основная - большая наружная створка (висит у стойки, vulcan_05) и внутренняя."""
    out = []; a0, a1, hw = NOSE_BAY
    for sx in (1, -1):
        n_ = 'door_n_' + ('r' if sx > 0 else 'l')
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (0.005 + (hw - 0.010) * u)), 6, 12, dirn=1, lift=0.0, th=0.025, z0=-6.0)
        pivot = P3((a0 + a1) / 2, sx * (hw + 0.010), down(sx * hw, Yb((a0 + a1) / 2), z0=-6.0, dirn=1).z - 0.045); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, -sx, 0)), range=(0.0, 92.0), note='шарнир у наружной кромки; плюс - внутренняя кромка вниз')
        out.append(ob)
    a0, a1, x0, x1 = MAIN_BAY
    for sx in (1, -1):
        s = 'r' if sx > 0 else 'l'
        n_ = 'door_mo_' + s; xm = (x0 + x1) / 2
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (xm + 0.004 + (x1 - xm - 0.008) * u)), 6, 12, dirn=1, lift=0.0, th=0.025, z0=-6.0)
        pivot = P3((a0 + a1) / 2, sx * (x1 + 0.010), down(sx * x1, Yb((a0 + a1) / 2), z0=-6.0, dirn=1).z - 0.045); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, -sx, 0)), range=(0.0, 95.0), note='наружная створка основной ниши: шарнир у наружной кромки; плюс - внутренняя кромка вниз (висит вертикально, vulcan_05)')
        out.append(ob)
        n_ = 'door_mi_' + s
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + 0.004 + (xm - x0 - 0.008) * u)), 6, 12, dirn=1, lift=0.0, th=0.025, z0=-6.0)
        pivot = P3((a0 + a1) / 2, sx * (x0 - 0.010), down(sx * x0, Yb((a0 + a1) / 2), z0=-6.0, dirn=1).z - 0.045); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, sx, 0)), range=(0.0, 95.0), note='внутренняя створка основной ниши: шарнир у внутренней кромки; закрывается после выпуска')
        out.append(ob)
    return out


POSE = {'door_n_r': 92, 'door_n_l': 92, 'door_mo_r': 95, 'door_mo_l': 95, 'door_mi_r': 0, 'door_mi_l': 0}


def gear_all():
    return gear_nose() + gear_main(1) + gear_main(-1) + doors()
