# su_gear.py - шасси Су-24М (единицы чертежа 03; только файл стоек для ангара): носовая стойка с двумя колёсами под большим грязевым щитком (06, 07, 12),
# основные - по два колеса рядом на рычажной стойке с подкосом вперёд (03 спереди и сбоку, 07, 10), открытые створки ниш. Вспомогательные tube, collar, box, link, hose, wheel - как у B-52H.
import math
from mathutils import Vector
from modelkit import B
import su_geo as g
from _su_base import P3, Yb, G_SKIN, G_METAL, G_DARK, G_TYRE, G_COCK, PARTS, patch, down
from _su_base import _rel

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
NOSE = dict(a=6.02, rw=0.318, ww=0.19, trk=0.165)                    # 03 сбоку: колесо под передней частью кабины
MAIN = dict(a=14.10, x=1.40, rw=0.440, ww=0.24, trk=0.155, xt=1.02)  # 03 сбоку и спереди: два колеса рядом, 1,40 м от оси
WELL_N = (5.45, 7.25, 0.24)
WELL_M = dict(a0=12.10, a1=14.05, x0=0.66, x1=1.12)


def nose_gear():
    b = B(); a = NOSE['a']; rw, ww, trk = NOSE['rw'], NOSE['ww'], NOSE['trk']; top = g.fus_bot(a, 0.0) + 0.10; yax = GROUND + rw; ax = P3(a, 0.0, yax)
    for s in (1, -1): wheel(b, ax + X * s * trk, rw, ww, holes=5)
    tube(b, [ax - X * (trk - ww * 0.5), ax + X * (trk - ww * 0.5)], 0.040, G_BELT, 12)
    tube(b, [P3(a, 0.0, yax + 0.05), P3(a - 0.04, 0.0, yax + 0.80)], 0.062, G_METAL, 14)
    tube(b, [P3(a - 0.03, 0.0, yax + 0.72), P3(a - 0.08, 0.0, top)], 0.090, G_SKIN, 16); collar(b, P3(a - 0.035, 0.0, yax + 0.74), U, 0.10, 0.06, G_SKIN)
    tube(b, [P3(a - 0.06, 0.0, yax + 0.85), P3(a + 0.70, 0.0, top + 0.02)], 0.036, G_SKIN, 10)
    link(b, P3(a + 0.05, 0.0, yax + 0.62), P3(a + 0.06, 0.0, yax + 0.34), 0.034, 0.018); link(b, P3(a + 0.06, 0.0, yax + 0.34), P3(a + 0.02, 0.0, yax + 0.12), 0.034, 0.018)
    n_ = 11; rows = []                                                          # большой грязевой щиток над обоими колёсами (06, 12)
    for i in range(n_):
        th = -1.05 + 2.10 * i / (n_ - 1); dr = rw + 0.07
        c = ax + F * (dr * math.sin(th)) + U * (dr * math.cos(th))
        rows.append([c - X * (trk + ww * 0.62), c + X * (trk + ww * 0.62), c + X * (trk + ww * 0.62) + U * 0.014, c - X * (trk + ww * 0.62) + U * 0.014])
    b.loft(rows, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for th in (-0.7, 0.7): tube(b, [ax + F * ((rw + 0.07) * math.sin(th)) + U * ((rw + 0.07) * math.cos(th)), P3(a - 0.02, 0.0, yax + 0.55)], 0.020, G_SKIN, 8)
    hose(b, [P3(a - 0.08, 0.07, top - 0.05), P3(a - 0.04, 0.08, yax + 0.6), P3(a, 0.09, yax + 0.18)], 0.009, (0.4,))
    tube(b, [P3(a + 0.12, 0.0, yax + 0.20), P3(a + 0.22, 0.0, yax + 0.20)], 0.05, G_METAL, 14)                 # фара
    return b.finish('gear_n', sharp_deg=35)


def main_gear(sx):
    """Основная стойка: два колеса рядом на оси рычага; стойка с амортизатором от ниши вниз-наружу, подкос вперёд к борту, гидроцилиндр."""
    b = B(); a = MAIN['a']; rw, ww, trk = MAIN['rw'], MAIN['ww'], MAIN['trk']; xw = sx * MAIN['x']; yax = GROUND + rw; axl = P3(a, xw, yax)
    for s in (1, -1): wheel(b, axl + X * s * trk, rw, ww, holes=6)
    tube(b, [axl - X * (trk - ww * 0.5), axl + X * (trk - ww * 0.5)], 0.055, G_BELT, 12)
    piv = P3(a + 0.40, xw, yax + 0.18)                                         # рычаг: от оси колёс вперёд-вверх
    link(b, axl, piv, 0.07, 0.030)
    top = P3(a - 0.30, sx * MAIN['xt'], g.fus_bot(a - 0.3, MAIN['xt']) + 0.12)
    knee = piv + U * 0.05
    tube(b, [knee, knee.lerp(top, 0.45)], 0.075, G_METAL, 14); tube(b, [knee.lerp(top, 0.40), top], 0.110, G_SKIN, 16)
    collar(b, knee.lerp(top, 0.42), (top - knee).normalized(), 0.12, 0.06, G_SKIN)
    sh = axl.lerp(piv, 0.55) + U * 0.05; tube(b, [sh, knee.lerp(top, 0.30)], 0.050, G_SKIN, 12); tube(b, [sh, sh.lerp(knee.lerp(top, 0.30), 0.45)], 0.034, G_METAL, 10)   # амортизатор рычага
    br = P3(a + 1.20, sx * 0.80, g.fus_bot(a + 1.20, 0.80) + 0.05); tube(b, [knee.lerp(top, 0.55), br], 0.045, G_SKIN, 10)                  # подкос вперёд
    link(b, knee.lerp(top, 0.70), knee.lerp(top, 0.70).lerp(br, 0.5) + U * 0.10, 0.04, 0.02)
    hose(b, [top + F * 0.07, knee.lerp(top, 0.6) + F * 0.08, knee + F * 0.07, axl + F * 0.09], 0.010, (0.3, 0.7))
    return b.finish('gear_m_' + ('r' if sx > 0 else 'l'), sharp_deg=35)


def doors():
    out = []; a0, a1, hw = WELL_N
    for sx in (1, -1):
        s = 'r' if sx > 0 else 'l'; n_ = 'door_n_' + s
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (0.01 + (hw - 0.01) * u)), 4, 8, dirn=1, lift=0.0, th=0.018, z0=-8.0)
        e = down(sx * hw, Yb((a0 + a1) / 2), z0=-8.0, dirn=1); pivot = e + Vector((sx * 0.020, 0, 0.025)); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, -sx, 0)), range=(0.0, 95.0), note='створка ниши носовой стойки: шарнир у наружной кромки; плюс - внутренняя кромка вниз')
        out.append(ob)
    W = WELL_M
    for sx in (1, -1):
        s = 'r' if sx > 0 else 'l'; n_ = 'door_m_' + s
        ob = patch(n_, lambda u, v: (W['a0'] + (W['a1'] - W['a0']) * v, sx * (W['x0'] + (W['x1'] - W['x0']) * u)), 6, 10, dirn=1, lift=0.0, th=0.020, z0=-8.0)
        e = down(sx * W['x1'], Yb((W['a0'] + W['a1']) / 2), z0=-8.0, dirn=1); pivot = e + Vector((sx * 0.020, 0, 0.025)); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, -sx, 0)), range=(0.0, 95.0), note='створка ниши основной стойки: шарнир у наружной кромки; плюс - внутренняя кромка вниз')
        out.append(ob)
    return out


POSE = {'door_n_r': 90, 'door_n_l': 90, 'door_m_r': 95, 'door_m_l': 95}


def gear_all():
    return [nose_gear(), main_gear(1), main_gear(-1)] + doors()
