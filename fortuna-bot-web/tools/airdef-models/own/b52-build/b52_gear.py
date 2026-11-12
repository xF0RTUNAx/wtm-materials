# b52_gear.py - шасси B-52H: велосипедная схема - четыре тележки по два колеса под фюзеляжем (две передние, две задние), опорные стойки под крылом у баков,
# створки ниш (в файле стоек - открыты, в файле самолёта их нет: контур нарисован швом). b52_05, 06, 07, 12, 14.
# Вспомогательные tube, collar, box, link, hose, wheel - как у Vulcan B.2 (Свои/Vulcan B.2/vul_gear.py).
import math
from mathutils import Vector
from modelkit import B
import b52_geo as g
from b52_geo import P3, Z, Yb, G_SKIN, G_METAL, G_DARK, G_TYRE, G_COCK, PARTS, patch, down, _rel

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
TRUCKS = dict(af=13.60, ar=29.00, x=1.25, rw=0.725, ww=0.400, trk=0.270)   # места тележек по длине, полуколея тележек, колесо, полуколея колёс на оси
WELL_F = (12.30, 14.90); WELL_R = (27.70, 30.30); WELL_X = (0.28, 1.80)
OUTR = dict(x=22.50, rw=0.330, ww=0.170, trk=0.200)


def truck(a, sx, nm):
    b = B(); x = sx * TRUCKS['x']; rw, ww, trk = TRUCKS['rw'], TRUCKS['ww'], TRUCKS['trk']
    yax = GROUND + rw; ytop = g.fus_bot(a, abs(x)) + 0.20; axle = P3(a, x, yax)
    for s in (1, -1): wheel(b, axle + X * s * trk, rw, ww)
    tube(b, [axle - X * (trk - ww * 0.5), axle + X * (trk - ww * 0.5)], 0.075, G_BELT, 14)                 # ось
    tube(b, [P3(a, x, ytop), P3(a, x, yax + 1.20)], 0.165, G_SKIN, 22)                                      # цилиндр
    tube(b, [P3(a, x, yax + 1.25), P3(a, x, yax + 0.20)], 0.115, G_METAL, 18)                               # шток
    collar(b, P3(a, x, yax + 1.22), U, 0.180, 0.07, G_SKIN)
    box(b, P3(a, x, yax + 0.10), X, F, U, 0.20, 0.14, 0.12, G_SKIN)                                         # траверса оси
    link(b, P3(a - 0.24, x, yax + 1.25), P3(a - 0.24, x, yax + 0.80), 0.045, 0.022); link(b, P3(a - 0.24, x, yax + 0.80), P3(a - 0.06, x, yax + 0.30), 0.045, 0.022)
    tube(b, [P3(a, x, ytop - 0.30), P3(a + 1.10, x, ytop + 0.02)], 0.080, G_SKIN, 14)                       # подкос
    tube(b, [P3(a, x, ytop - 0.45), P3(a, x - sx * 0.65, ytop + 0.02)], 0.060, G_SKIN, 12)                  # боковой подкос
    hose(b, [P3(a + 0.15, x + sx * 0.12, ytop - 0.1), P3(a + 0.17, x + sx * 0.14, yax + 1.1), P3(a + 0.10, x + sx * 0.16, yax + 0.5), P3(a + 0.05, x + sx * 0.20, yax + 0.12)], 0.012, (0.3, 0.7))
    for dz in (1.40, 1.62):                                                                                 # две фары рулёжки и посадки (b52_05: горят на передних тележках)
        tube(b, [P3(a - 0.30, x, yax + dz), P3(a - 0.17, x, yax + dz)], 0.072, G_METAL, 14)
        tube(b, [P3(a - 0.312, x, yax + dz), P3(a - 0.298, x, yax + dz)], 0.060, 14, 14)                     # стекло фары
        tube(b, [P3(a - 0.17, x, yax + dz), P3(a - 0.04, x, yax + dz)], 0.022, G_METAL, 8)                  # кронштейн к стойке
    for s in (1, -1):                                                                                       # тормозные шланги к каждому колесу с хомутами
        hose(b, [P3(a - 0.12, x + sx * 0.05, ytop - 0.15), P3(a - 0.14, x + sx * 0.07, yax + 1.05), P3(a - 0.12, x + s * 0.10, yax + 0.42),
                 P3(a - 0.10, x + s * (trk - ww * 0.62), yax + 0.10), P3(a - 0.10, x + s * (trk - ww * 0.55), yax + 0.02)], 0.010, (0.25, 0.5, 0.75))
    for s in (1, -1):                                                                                       # цилиндры поворота тележки: от хомута на цилиндре к траверсе
        p0 = P3(a + 0.20, x + s * 0.17, yax + 1.02); p1 = P3(a + 0.16, x + s * 0.20, yax + 0.24)
        tube(b, [p0, p0.lerp(p1, 0.55)], 0.040, G_SKIN, 12); tube(b, [p0.lerp(p1, 0.50), p1], 0.020, G_METAL, 10)
        for q in (p0, p1): tube(b, [q - X * 0.03, q + X * 0.03], 0.028, G_BELT, 10)
    collar(b, P3(a, x, yax + 1.05), U, 0.172, 0.05, G_SKIN)
    return b.finish(nm, sharp_deg=35)


def ground_mat(sx):
    """Положение крыла на стоянке: всё крыло опущено на DROOP[0] вокруг шарнира у борта (b52_geo.wing_panels)."""
    from mathutils import Matrix
    D = PARTS['wing_' + ('r' if sx > 0 else 'l')]; T = D['pivot']
    return Matrix.Translation(T) @ Matrix.Rotation(math.radians(D['ground']), 4, D['axis']) @ Matrix.Translation(-T)


def outrigger(sx):
    b = B(); rw, ww, trk = OUTR['rw'], OUTR['ww'], OUTR['trk']; a0 = g.LE(OUTR['x']) + 2.10
    top = ground_mat(sx) @ P3(a0, sx * OUTR['x'], g.wing_bot(OUTR['x'], a0) + 0.10)     # опора стоит под опущенным на стоянке крылом
    x = top.x; a = g.L / 2 - top.y
    yax = GROUND + rw; ytop = top.z
    for s in (1, -1): wheel(b, P3(a + 0.12, x, yax) + X * s * trk, rw, ww, holes=5)
    tube(b, [P3(a + 0.12, x - trk + ww * 0.5, yax), P3(a + 0.12, x + trk - ww * 0.5, yax)], 0.040, G_BELT, 12)
    tube(b, [P3(a, x, ytop), P3(a, x, yax + 0.80)], 0.110, G_SKIN, 18)
    tube(b, [P3(a, x, yax + 0.85), P3(a + 0.12, x, yax + 0.10)], 0.075, G_METAL, 16)
    collar(b, P3(a, x, yax + 0.82), U, 0.122, 0.05, G_SKIN)
    tube(b, [P3(a, x, ytop - 0.6), P3(a - 0.90, x, ytop + 0.02)], 0.050, G_SKIN, 12)                        # подкос
    hose(b, [P3(a + 0.10, x + 0.08, ytop - 0.1), P3(a + 0.12, x + 0.09, yax + 0.9), P3(a + 0.15, x + 0.10, yax + 0.25)], 0.010, (0.4,))
    return b.finish('gear_o_' + ('r' if sx > 0 else 'l'), sharp_deg=35)


def doors():
    """Створки ниш: у каждой тележки большая наружная створка с шарниром у борта (b52_06: висит выпуклым щитком снаружи колёс)."""
    out = []
    for nm_, (a0, a1) in (('f', WELL_F), ('r', WELL_R)):
        for sx in (1, -1):
            s = 'r' if sx > 0 else 'l'; n_ = f'door_{nm_}_{s}'; x0, x1 = WELL_X
            ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + (x1 - x0) * u)), 8, 12, dirn=1, lift=0.0, th=0.030, z0=-8.0)
            e = down(sx * x1, Yb((a0 + a1) / 2), z0=-8.0, dirn=1); pivot = e + Vector((sx * 0.012, 0, 0.040)); _rel(ob, pivot)
            bb = B()                                                                                      # рёбра и петли изнутри створки (внутрь ниши), дочерний объект
            for v_ in (0.10, 0.30, 0.50, 0.70, 0.90):
                a_ = a0 + (a1 - a0) * v_; z_ = down(sx * (x0 + x1) / 2, Yb(a_), z0=-8.0, dirn=1).z + 0.010
                rg = lambda d_: [P3(a_ + d_, sx * (x0 + 0.06), z_) - pivot, P3(a_ + d_, sx * (x1 - 0.10), z_) - pivot, P3(a_ + d_, sx * (x1 - 0.10), z_ + 0.07) - pivot, P3(a_ + d_, sx * (x0 + 0.06), z_ + 0.05) - pivot]
                bb.loft([rg(-0.018), rg(0.018)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
            for v_ in (0.15, 0.85):
                a_ = a0 + (a1 - a0) * v_; e_ = down(sx * (x1 - 0.06), Yb(a_), z0=-8.0, dirn=1)
                bb.loft([[P3(a_ + d_, sx * (x1 - 0.14), e_.z + 0.01) - pivot, P3(a_ + d_, sx * (x1 + 0.005), e_.z + 0.01) - pivot, P3(a_ + d_, sx * (x1 + 0.005), e_.z + 0.07) - pivot, P3(a_ + d_, sx * (x1 - 0.14), e_.z + 0.06) - pivot] for d_ in (-0.05, 0.05)], G_METAL, cap0=G_METAL, cap1=G_METAL)
            rib = bb.finish(n_ + '_ribs', sharp_deg=30); rib.parent = ob; rib.location = (0, 0, 0)
            PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, -sx, 0)), range=(0.0, 100.0), note='створка ниши тележки: шарнир у наружной кромки, ось вдоль фюзеляжа; плюс - внутренняя кромка вниз и наружу; рёбра ' + n_ + '_ribs - дочерний объект')
            out += [ob, rib]
    return out


POSE = {'door_f_r': 100, 'door_f_l': 100, 'door_r_r': 100, 'door_r_l': 100}
GROUND_POSE = lambda: {n: D['ground'] for n, D in PARTS.items() if 'ground' in D}      # крыло на стоянке


def gear_all():
    out = []
    for a, k in ((TRUCKS['af'], 'f'), (TRUCKS['ar'], 'r')):
        for sx in (1, -1): out.append(truck(a, sx, f'gear_{k}_' + ('r' if sx > 0 else 'l')))
    for sx in (1, -1): out.append(outrigger(sx))
    return out + doors()
