# b1b_gear.py - шасси B-1B для файла стоек: передняя стойка на два колеса (белая ферма с подкосом вперёд, фото 08, 09, 10), две основные стойки
# с тележками 2×2 между гондолами и фюзеляжем (фото 02, 05, 06, 09), створки ниш открыты. В файле самолёта ниш нет: контур створок - шов.
# Помощники tube, collar, box, link, hose, wheel - как у Vulcan B.2 (Свои/Vulcan B.2/vul_gear.py).
import math
from mathutils import Vector
from modelkit import B
import b1b_geo as g
import b1b_bay as bay
from b1b_geo import P3, Yb, G_SKIN, G_METAL, G_DARK, G_TYRE, G_COCK, PARTS, _rel
G_BELT = 8
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



GROUND = -5.95                                                  # земля: верх киля 4,4 м над средней плоскостью, высота на стоянке около 10,35 м
NOSE = dict(a=9.55, rw=0.445, ww=0.215, trk=0.270)
MAIN = dict(a=23.20, x=2.05, rw=0.560, ww=0.300, trk=0.330, dax=1.18)
NOSE_BAY = (8.15, 10.80, 0.46)
MAIN_BAY = (21.10, 25.60, 1.30, 2.18)                           # a0, a1, x внутр., x наружн.


def skin_z(a, x): return bay.belly(a, x).z


def gear_nose():
    b = B(); a = NOSE['a']; rw, ww, trk = NOSE['rw'], NOSE['ww'], NOSE['trk']
    yax = GROUND + rw; ytop = skin_z(a, 0.0) + 0.25; axle = P3(a + 0.22, 0.0, yax)
    for s in (1, -1): wheel(b, axle + X * s * trk, rw, ww)
    tube(b, [axle - X * (trk - ww * 0.5), axle + X * (trk - ww * 0.5)], 0.050, G_BELT, 12)                   # ось
    pv = P3(a, 0.0, yax + 0.40)
    tube(b, [P3(a, 0.0, ytop), P3(a, 0.0, yax + 1.25)], 0.135, G_SKIN, 18)                                    # цилиндр
    tube(b, [P3(a, 0.0, yax + 1.30), pv], 0.095, G_METAL, 16)                                                 # шток
    collar(b, P3(a, 0.0, yax + 1.27), U, 0.150, 0.06, G_SKIN)
    box(b, (pv + axle) / 2 + Vector((0, 0, 0.02)), X, F, U, 0.08, 0.12, 0.20, G_SKIN)                         # вилка
    link(b, P3(a - 0.18, 0.0, yax + 1.32), P3(a - 0.18, 0.0, yax + 0.90), 0.040, 0.020); link(b, P3(a - 0.18, 0.0, yax + 0.90), P3(a, 0.0, yax + 0.45), 0.040, 0.020)
    # ферма: два подкоса вперёд-вбок и поперечины (белая решётка на фото 08)
    for s in (1, -1):
        tube(b, [P3(a, s * 0.10, yax + 1.6), P3(a - 1.35, s * 0.40, skin_z(a - 1.35, 0.4) + 0.05)], 0.055, G_SKIN, 12)
        tube(b, [P3(a, s * 0.10, yax + 1.1), P3(a - 0.70, s * 0.30, yax + 1.95)], 0.040, G_SKIN, 10)
    tube(b, [P3(a - 0.70, -0.30, yax + 1.95), P3(a - 0.70, 0.30, yax + 1.95)], 0.035, G_SKIN, 10)
    hose(b, [P3(a + 0.14, 0.0, ytop - 0.1), P3(a + 0.16, 0.0, yax + 1.2), P3(a + 0.19, 0.03, yax + 0.6), P3(a + 0.22, 0.10, yax + 0.12)], 0.011, (0.3, 0.7))
    for s in (1, -1): tube(b, [P3(a - 0.22, s * 0.16, yax + 1.10), P3(a - 0.36, s * 0.16, yax + 1.10)], 0.070, G_METAL, 14)   # фары рулёжки
    return [b.finish('gear_n', sharp_deg=35)]


def gear_main(sx):
    b = B(); a, x = MAIN['a'], sx * MAIN['x']; rw, ww, trk, dax = MAIN['rw'], MAIN['ww'], MAIN['trk'], MAIN['dax']
    yax = GROUND + rw; ytop = skin_z(a, x) + 0.30; piv = P3(a, x, yax + 0.24)
    for k in range(2):                                                                                       # тележка 2×2
        ax = P3(a + (k - 0.5) * dax, x, yax)
        for s in (1, -1): wheel(b, ax + X * s * trk, rw, ww)
        tube(b, [ax - X * (trk - ww * 0.5), ax + X * (trk - ww * 0.5)], 0.055, G_BELT, 12)
    box(b, P3(a, x, yax + 0.06), X, U, F, 0.075, 0.09, dax / 2 + 0.22, G_SKIN)                              # балка тележки
    tube(b, [piv - X * 0.14, piv + X * 0.14], 0.085, G_BELT, 14)                                             # шарнир тележки
    tube(b, [P3(a, x, ytop), P3(a, x, yax + 1.35)], 0.175, G_SKIN, 20)                                       # цилиндр
    tube(b, [P3(a, x, yax + 1.40), piv], 0.125, G_METAL, 18)                                                 # шток
    collar(b, P3(a, x, yax + 1.37), U, 0.195, 0.07, G_SKIN)
    link(b, P3(a - 0.24, x, yax + 1.42), P3(a - 0.24, x, yax + 0.92), 0.045, 0.022); link(b, P3(a - 0.24, x, yax + 0.92), P3(a - 0.06, x, yax + 0.34), 0.045, 0.022)
    tube(b, [P3(a, x, ytop - 0.55), P3(a - 1.40, x - sx * 0.35, skin_z(a - 1.4, x) + 0.05)], 0.080, G_SKIN, 12)   # подкос вперёд (фото 02: косой)
    tube(b, [P3(a, x, ytop - 0.80), P3(a + 0.2, x - sx * 0.95, skin_z(a, x - sx * 0.95) + 0.05)], 0.065, G_SKIN, 12)   # боковой подкос
    tube(b, [P3(a + 0.42, x, yax + 0.36), P3(a + 0.42, x, ytop - 0.75)], 0.040, G_METAL, 10)                 # демпфер тележки
    hose(b, [P3(a + 0.18, x + sx * 0.14, ytop - 0.1), P3(a + 0.20, x + sx * 0.16, yax + 1.3), P3(a + 0.12, x + sx * 0.18, yax + 0.6), P3(a + 0.36, x + sx * 0.24, yax + 0.12)], 0.012, (0.3, 0.7))
    return [b.finish('gear_m_' + ('r' if sx > 0 else 'l'), sharp_deg=35)]


def _door(name, outline, nu, nv, hinge, ax, rng, note):
    from mathutils import Matrix
    ob = bay._patch(name, outline, nu, nv, th=0.028)
    a_, x_ = outline(0.0, 0.5); free = bay.belly(a_, x_) - hinge; ax = ax.normalized()
    if (Matrix.Rotation(math.radians(60), 3, ax) @ free).z > free.z: ax = -ax          # знак по числу: при плюсе свободная кромка идёт вниз
    _rel(ob, hinge)
    PARTS[name] = dict(pivot=hinge.copy(), axis=ax.normalized(), range=rng, note=note); return ob


def doors():
    """Створки ниш (только в файле стоек, открытые): передняя ниша - две продольные; основные - одна большая, висит вертикально у стойки (фото 02, 09)."""
    out = []; a0, a1, hw = NOSE_BAY
    for sx in (1, -1):
        e0 = bay.belly(a0, sx * hw); e1 = bay.belly(a1, sx * hw); hinge = (e0 + e1) / 2; ax = (e1 - e0) * (-sx)
        out.append(_door('door_n_' + ('r' if sx > 0 else 'l'), lambda u, v: (a0 + (a1 - a0) * v, sx * (0.005 + (hw - 0.010) * u)), 6, 12, hinge, ax, (0.0, 90.0), 'створка передней ниши: петля у наружной кромки; плюс - внутренняя кромка вниз'))
    a0, a1, x0, x1 = MAIN_BAY
    for sx in (1, -1):
        e0 = bay.belly(a0, sx * x1); e1 = bay.belly(a1, sx * x1); hinge = (e0 + e1) / 2; ax = (e1 - e0) * (-sx)
        out.append(_door('door_m_' + ('r' if sx > 0 else 'l'), lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + 0.005 + (x1 - x0 - 0.010) * u)), 6, 14, hinge, ax, (0.0, 92.0), 'створка основной ниши: петля у наружной кромки (у гондолы); плюс - внутренняя кромка вниз'))
    return out


POSE = {'door_n_r': 90, 'door_n_l': 90, 'door_m_r': 92, 'door_m_l': 92}


def pose_doors():
    import bpy
    from mathutils import Matrix
    bpy.context.view_layer.update()
    for n_, d_ in POSE.items():
        o = bpy.data.objects[n_]; D = PARTS[n_]; T = D['pivot']
        test = o.matrix_world @ o.data.vertices[0].co
        o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(d_), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world
    bpy.context.view_layer.update()


def gear_all():
    return gear_nose() + gear_main(1) + gear_main(-1) + doors()
