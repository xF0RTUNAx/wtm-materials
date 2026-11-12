# dr_gear.py - шасси Saab J 35F Draken (только файл стоек для ангара): носовая стойка с одним колесом, основные с одним колесом уходят наружу в крыло, хвостовые
# опорные колёса под задней частью фюзеляжа (03, 05, 09); створки открыты. Вспомогательные tube, collar, box, link, hose, wheel - как у B-52H (b52_gear.py).
import math
from mathutils import Vector
from modelkit import B
import dr_geo as g
from dr_geo import P3, Yb, G_SKIN, G_METAL, G_DARK, G_TYRE, G_COCK, PARTS, patch, down, _rel

G_BELT, G_HANDLE = 8, 9
X = Vector((1, 0, 0)); F = Vector((0, 1, 0)); U = Vector((0, 0, 1)); R_ = Vector((0, -1, 0))


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






GROUND = -g.AX
NOSE = dict(a=5.53, rw=0.255, ww=0.150)                             # носовая стойка (03, 09)
MAIN = dict(a=9.92, x=1.36, rw=0.330, ww=0.180, xt=1.92)            # основные: колесо, верх стойки у крыла (уходят наружу в крыло, 05, 09)
TAILW = dict(a=14.20, rw=0.100, ww=0.060, trk=0.085)                # хвостовые опорные колёса (03, 09)
WELL_N = (4.95, 6.05, 0.20)                                         # ниша носовой стойки: a от-до, полуширина
WELL_M = dict(a0=9.85, a1=10.80, x0=1.62, x1=2.40, xl=1.12)         # ниша основной стойки в крыле: створка на шарнире (x0-x1), внутренняя часть - щиток на стойке


def nose_gear():
    b = B(); a = NOSE['a']; rw, ww = NOSE['rw'], NOSE['ww']; top = g.fus_bot(a, 0.0) + 0.10; yax = GROUND + rw; ax = P3(a + 0.06, 0.0, yax)
    wheel(b, ax, rw, ww, holes=5)
    for s in (1, -1): tube(b, [ax + X * s * (ww * 0.62), P3(a - 0.03, s * ww * 0.62, yax + 0.32)], 0.024, G_SKIN, 10)        # вилка
    box(b, P3(a - 0.03, 0.0, yax + 0.34), X, F, U, ww * 0.66, 0.06, 0.03, G_SKIN)
    tube(b, [P3(a - 0.03, 0.0, yax + 0.32), P3(a - 0.03, 0.0, yax + 0.80)], 0.050, G_METAL, 14)                              # шток
    tube(b, [P3(a - 0.03, 0.0, yax + 0.74), P3(a - 0.03, 0.0, top)], 0.072, G_SKIN, 16)                                       # цилиндр
    collar(b, P3(a - 0.03, 0.0, yax + 0.76), U, 0.082, 0.05, G_SKIN)
    tube(b, [P3(a - 0.03, 0.0, yax + 0.60), P3(a - 0.55, 0.0, top + 0.02)], 0.030, G_SKIN, 10)                               # подкос вперёд (уходит вперёд)
    link(b, P3(a + 0.02, 0.0, yax + 0.70), P3(a + 0.04, 0.0, yax + 0.45), 0.030, 0.016); link(b, P3(a + 0.04, 0.0, yax + 0.45), P3(a + 0.02, 0.0, yax + 0.33), 0.030, 0.016)
    hose(b, [P3(a + 0.05, 0.05, top - 0.05), P3(a + 0.06, 0.06, yax + 0.6), P3(a + 0.08, 0.05, yax + 0.35)], 0.008, (0.4,))
    tube(b, [P3(a - 0.12, 0.0, yax + 0.55), P3(a - 0.20, 0.0, yax + 0.55)], 0.055, G_METAL, 14)                              # фара
    tube(b, [P3(a - 0.205, 0.0, yax + 0.55), P3(a - 0.195, 0.0, yax + 0.55)], 0.046, 14, 14)
    return b.finish('gear_n', sharp_deg=35)


def main_gear(sx):
    """Стойка наклонена: верх у крыла снаружи, колесо внутри (09 спереди); подкос назад к лонжерону, шланг тормоза, фара (05)."""
    b = B(); a = MAIN['a']; rw, ww = MAIN['rw'], MAIN['ww']; xw = sx * MAIN['x']; xt = sx * MAIN['xt']; yax = GROUND + rw
    top = P3(a, xt, g.wing_bot(MAIN['xt'], a) + 0.06); axl = P3(a, xw + sx * 0.10, yax)
    wheel(b, axl - X * sx * 0.0 + X * 0.0, rw, ww, holes=6)
    tube(b, [axl + X * sx * (ww * 0.55), axl + X * sx * (ww * 0.55 + 0.10)], 0.040, G_BELT, 12)                                # ось
    knee = axl + X * sx * (ww * 0.55 + 0.10) + U * 0.10
    tube(b, [knee, knee.lerp(top, 0.45)], 0.055, G_METAL, 14)                                                                  # шток
    tube(b, [knee.lerp(top, 0.40), top], 0.080, G_SKIN, 16)                                                                    # цилиндр
    collar(b, knee.lerp(top, 0.42), (top - knee).normalized(), 0.090, 0.05, G_SKIN)
    br = P3(a + 0.70, sx * (MAIN['xt'] - 0.25), g.wing_bot(MAIN['xt'] - 0.25, a + 0.70) + 0.05)                                 # подкос назад
    tube(b, [knee.lerp(top, 0.55), br], 0.035, G_SKIN, 10)
    hose(b, [top + F * 0.06, knee.lerp(top, 0.6) + F * 0.07, knee + F * 0.06 + U * 0.05, axl + F * 0.08 + X * sx * (ww * 0.45)], 0.008, (0.3, 0.7))
    W = WELL_M; dv = (top - knee).normalized(); out_ = X * sx                                                                     # щиток на стойке (закрывает внутреннюю часть ниши)
    q0 = knee + dv * 0.12 + out_ * 0.085; q1 = top - dv * 0.05 + out_ * 0.085
    b.loft([[q + F * d + out_ * t for d, t in ((-0.22, 0.0), (0.22, 0.0), (0.22, 0.016), (-0.22, 0.016))] for q in (q0, q1)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    lp = knee.lerp(top, 0.70) + F * 0.12; tube(b, [lp, lp + F * 0.10], 0.055, G_METAL, 14); tube(b, [lp + F * 0.105, lp + F * 0.115], 0.046, 14, 14)   # посадочная фара (05)
    return b.finish('gear_m_' + ('r' if sx > 0 else 'l'), sharp_deg=35)


def tail_wheels():
    b = B(); a = TAILW['a']; rw = TAILW['rw']; top = g.fus_bot(a, 0.0) + 0.05; yax = top - 0.38
    for s in (1, -1):                                                                                          # колёсики простые: шина, диск, ступица
        c = P3(a + 0.12, s * TAILW['trk'], yax); n = 20; ww = TAILW['ww']
        rg = lambda dx, r: [c + X * dx + (F * math.cos(2 * math.pi * q / n) + U * math.sin(2 * math.pi * q / n)) * r for q in range(n)]
        b.loft([rg(d * ww, rw * r) for d, r in ((-0.5, 0.62), (-0.48, 0.85), (-0.38, 1.0), (0.38, 1.0), (0.48, 0.85), (0.5, 0.62))], G_TYRE)
        b.loft([rg(d * ww, rw * r) for d, r in ((0.5, 0.62), (0.42, 0.30), (0.42, 0.02))], G_SKIN, cap1=G_SKIN); b.loft([rg(d * ww, rw * r) for d, r in ((-0.5, 0.62), (-0.42, 0.30), (-0.42, 0.02))][::-1], G_SKIN, cap0=G_SKIN)
    tube(b, [P3(a + 0.12, -TAILW['trk'] + 0.03, yax), P3(a + 0.12, TAILW['trk'] - 0.03, yax)], 0.018, G_BELT, 8)
    tube(b, [P3(a + 0.12, 0.0, yax), P3(a - 0.10, 0.0, top)], 0.035, G_SKIN, 12)
    tube(b, [P3(a + 0.05, 0.0, yax + 0.12), P3(a + 0.35, 0.0, top)], 0.022, G_METAL, 10)
    return b.finish('gear_t', sharp_deg=35)


def doors():
    """Створки: у носовой две боковые (вниз), у основной большая наружная на шарнире у наружной кромки ниши (висит почти вертикально, 05)."""
    out = []
    a0, a1, hw = WELL_N
    for sx in (1, -1):
        s = 'r' if sx > 0 else 'l'; n_ = 'door_n_' + s
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (0.01 + (hw - 0.01) * u)), 4, 8, dirn=1, lift=0.0, th=0.018, z0=-8.0)
        e = down(sx * hw, Yb((a0 + a1) / 2), z0=-8.0, dirn=1); pivot = e + Vector((sx * 0.020, 0, 0.025)); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, -sx, 0)), range=(0.0, 95.0), note='створка ниши носовой стойки: шарнир у наружной кромки, вдоль фюзеляжа; плюс - внутренняя кромка вниз')
        out.append(ob)
    W = WELL_M
    for sx in (1, -1):
        s = 'r' if sx > 0 else 'l'; n_ = 'door_m_' + s
        ob = patch(n_, lambda u, v: (W['a0'] + (W['a1'] - W['a0']) * v, sx * (W['x0'] + (W['x1'] - W['x0']) * u)), 8, 6, dirn=1, lift=0.0, th=0.020, z0=-8.0)
        e = down(sx * W['x1'], Yb((W['a0'] + W['a1']) / 2), z0=-8.0, dirn=1); pivot = e + Vector((sx * 0.020, 0, 0.025)); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, -sx, 0)), range=(0.0, 95.0), note='створка ниши основной стойки: шарнир у наружной кромки ниши; плюс - внутренняя кромка вниз')
        out.append(ob)
    return out


POSE = {'door_n_r': 90, 'door_n_l': 90, 'door_m_r': 88, 'door_m_l': 88}


def gear_all():
    return [nose_gear(), main_gear(1), main_gear(-1), tail_wheels()] + doors()
