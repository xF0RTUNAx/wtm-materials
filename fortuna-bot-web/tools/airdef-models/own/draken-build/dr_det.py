# dr_det.py - детали Saab J 35F Draken: вырез и нутро кабины, рамы фонаря (козырёк неподвижен, фонарь откидывается на заднем шарнире), четыре тормозных щитка
# по бокам хвостовой части (04, 07: жёлто-чёрная окантовка), пилоны и точки подвески, пушка в корне правого крыла, антенны, огни, обтекатели приводов элевонов
# и пластины под консолями (01, 07, 08). Вызывать после bvh_ready (лучи по обшивке до вырезов).
import math
from mathutils import Vector
from modelkit import B
import dr_geo as g
from dr_geo import P3, Yb, G_SKIN, G_METAL, G_DARK, G_GLASS, G_COCK, BVH, PARTS, STATIONS, patch, _rel, loft_obj, stations, strut

G_SCREEN, G_BELT, G_HANDLE = 7, 8, 9
G_LENS_R, G_LENS_G, G_LENS_W = 12, 13, 14
AFT = Vector((0, -1, 0)); UP = Vector((0, 0, 1))


def hit(o, d):
    h = BVH['t'].ray_cast(o, d)
    if h[0] is None: raise RuntimeError(f'луч мимо: {tuple(round(v, 2) for v in o)}')
    n = h[1].normalized()
    if n.dot(d) > 0: n = -n
    return h[0], n


def tube(b, pts, r, mat=G_METAL, n=10, caps=True):
    rs = r if isinstance(r, (list, tuple)) else [r] * len(pts)
    t0 = (pts[1] - pts[0]).normalized(); u = t0.orthogonal().normalized(); rings = []
    for i, p in enumerate(pts):
        a_ = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized(); u = (u - a_ * u.dot(a_)).normalized(); v = a_.cross(u)
        rings.append([p + (u * math.cos(2 * math.pi * q / n) + v * math.sin(2 * math.pi * q / n)) * rs[i] for q in range(n)])
    b.loft(rings, mat, cap0=mat if caps else None, cap1=mat if caps else None)


def ring_around(c, n, r, k=16):
    u = n.orthogonal().normalized(); v = n.cross(u)
    return [c + (u * math.cos(2 * math.pi * q / k) + v * math.sin(2 * math.pi * q / k)) * r for q in range(k)]


def bx(b, c, hx, hy, hz, mat=G_COCK):
    rg = lambda y: [c + Vector((-hx, y, -hz)), c + Vector((hx, y, -hz)), c + Vector((hx, y, hz)), c + Vector((-hx, y, hz))]
    b.loft([rg(-hy), rg(hy)], mat, cap0=mat, cap1=mat)


def blade(b, p, n, h, c0, c1, sweep, t, mat=G_SKIN, sink=0.03):
    w = (AFT - n * AFT.dot(n)).normalized(); s = n.cross(w); m = 7; rings = []
    for k in (-sink / h, 0.0, 0.5, 1.0):
        kk = max(k, 0.0); c = c0 + (c1 - c0) * kk; le = -c0 / 2 + sweep * kk; th = t * (1 - 0.4 * kk)
        side = [(i / m, max(0.0012, th / 2 * math.sin(math.pi * i / m) ** 0.55)) for i in range(m + 1)]
        pts = [(u, y) for u, y in side] + [(u, -y) for u, y in reversed(side[1:-1])]
        rings.append([p + n * (h * k) + w * (le + c * u) + s * y for u, y in pts])
    b.loft(rings, mat, cap0=mat, cap1=mat)


def drop(b, c, ax, r, ln, mat, k=14):
    ax = ax.normalized(); prof = [(0.0, 0.002), (0.04, 0.55), (0.12, 0.85), (0.30, 1.0), (0.60, 0.80), (0.85, 0.40), (1.0, 0.002)]
    b.loft([ring_around(c + ax * (ln * (s - 0.3)), ax, max(0.0015, r * q), k) for s, q in prof], mat, cap0=mat, cap1=mat)


# ── кабина ──
CAB = (3.30, 5.62)
def cock_cavity():
    rs = []
    for a in stations(CAB[0], CAB[1], 0.10):
        k = g._sm((a - CAB[0]) / 0.25) * g._sm((CAB[1] - a) / 0.20); hw = max(0.05, 0.29 * (0.4 + 0.6 * k))
        rs.append(g.sup(a, 0.0, 1.30, -0.22, hw, 2.6, 2.6, 40))
    return loft_obj('c_cab', rs, G_COCK, sharp=30)


def cockpit():
    """Катапультное кресло с заголовником, приборная доска под козырьком с экраном РЛС, ручка, боковые пульты, педали, задняя переборка."""
    b = B(); fl = -0.20
    bx(b, P3(4.45, 0.0, fl), 0.28, 1.15, 0.02)
    bx(b, P3(3.62, 0.0, 0.30), 0.27, 0.10, 0.17); bx(b, P3(3.58, 0.0, 0.47), 0.28, 0.14, 0.02)                # доска и козырёк
    bx(b, P3(3.725, 0.0, 0.32), 0.075, 0.005, 0.065, G_SCREEN)                                                # индикатор РЛС
    for dx, dz in ((-0.17, 0.36), (0.17, 0.36), (-0.17, 0.22), (0.17, 0.22)): bx(b, P3(3.725, dx, dz), 0.045, 0.005, 0.045, G_DARK)
    bx(b, P3(4.92, 0.0, fl + 0.20), 0.21, 0.22, 0.05, 6); bx(b, P3(5.14, 0.0, fl + 0.52), 0.21, 0.05, 0.36, 6)  # кресло: подушка, спинка
    bx(b, P3(5.17, 0.0, fl + 0.88), 0.15, 0.07, 0.08, G_COCK); bx(b, P3(5.13, 0.0, fl + 0.93), 0.05, 0.03, 0.03, G_HANDLE)   # заголовник ниже стекла и ручка катапульты
    for d_ in (-1, 1):
        bx(b, P3(4.95, d_ * 0.24, fl + 0.34), 0.03, 0.26, 0.15, G_COCK)                                       # боковины кресла
        bx(b, P3(4.55, d_ * 0.26, fl + 0.30), 0.04, 0.45, 0.10, G_COCK)                                       # боковые пульты
        for i in range(3): bx(b, P3(4.30 + 0.25 * i, d_ * 0.26, fl + 0.405), 0.03, 0.08, 0.004, G_SCREEN if i == 1 else G_DARK)
        bx(b, P3(3.95, d_ * 0.12, fl + 0.08), 0.04, 0.07, 0.01, G_METAL)                                      # педали
    strut(b, P3(4.55, 0.0, fl + 0.05), P3(4.50, 0.0, fl + 0.55), 0.016, G_DARK, 8); bx(b, P3(4.50, 0.0, fl + 0.58), 0.022, 0.022, 0.04, G_DARK)   # ручка
    bx(b, P3(5.55, 0.0, 0.14), 0.21, 0.03, 0.36, G_COCK)                                                      # переборка (ниже стекла)
    return b.finish('det_cockpit', sharp_deg=30)


def canopy_frames():
    """Рама козырька (неподвижна) и рама фонаря (дочерняя к canopy): дуги и продольные полозья по нижней кромке стекла."""
    fb = B(); cb = B(); r = 0.016
    arch = lambda a, ins=0.0: [p + Vector((0, 0, 0.005)) for p in g.can_ring(a, n=20, inset=-0.006)]
    tube(fb, arch(g.CAN_W - 0.005), r * 1.2, G_SKIN, 8)
    tube(fb, [g.can_ring(a, n=20)[0] + Vector((0.004, 0, 0.004)) for a in stations(g.CAN_A0 + 0.02, g.CAN_W, 0.10)], r, G_SKIN, 8)
    tube(fb, [g.can_ring(a, n=20)[-1] + Vector((-0.004, 0, 0.004)) for a in stations(g.CAN_A0 + 0.02, g.CAN_W, 0.10)], r, G_SKIN, 8)
    mid = g.CAN_A0 + 0.30; tube(fb, [g.can_ring(a, n=20)[10] + Vector((0, 0, 0.006)) for a in (g.CAN_A0 + 0.05, mid)], 0.010, G_SKIN, 8)   # средняя стойка козырька
    arch2 = lambda a: [p + Vector((0, 0, 0.005)) for p in g.can_ring(a, n=20, inset=-0.006, sink=0.004)]
    for a in (g.CAN_W + 0.056, g.CAN_A1 - 0.04): tube(cb, arch2(a), r, G_SKIN, 8)
    for k in (0, -1): tube(cb, [g.can_ring(a, n=20, sink=0.004)[k] + Vector((0.004 if k == 0 else -0.004, 0, 0.004)) for a in stations(g.CAN_W + 0.056, g.CAN_A1 - 0.04, 0.12)], r, G_SKIN, 8)
    return fb.finish('det_wsframe', sharp_deg=40), cb.finish('canopy_frame', sharp_deg=40)


def canopy_part(can):
    piv = P3(g.CAN_A1 + 0.04, 0.0, g.CAN(g.CAN_A1) - 0.10); _rel(can, piv)                               # шарнир выше задней кромки: она не уходит в обшивку
    PARTS['canopy'] = dict(pivot=piv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 45.0), note='фонарь откидывается вверх на заднем шарнире; плюс - передняя кромка вверх; рама canopy_frame - дочерняя')


# ── тормозные щитки: по два на борт в хвостовой части, сверху и снизу ──
BRAKES = [('u', 42.0, 68.0), ('d', 126.0, 152.0)]
BR_A = (12.30, 13.05)
def airbrakes():
    out = []
    for sx in (1, -1):
        for nm, f0, f1 in BRAKES:
            name = f'brake_{nm}_' + ('r' if sx > 0 else 'l')
            def cast(u, v, f0=f0, f1=f1, sx=sx):
                a = BR_A[0] + (BR_A[1] - BR_A[0]) * v; ph = math.radians(f0 + (f1 - f0) * u); cy = (g.FT[0](a) + g.FT[1](a)) / 2
                d = Vector((sx * math.sin(ph), 0.0, math.cos(ph))); return P3(a, 0.0, cy) + d * 4.0, -d
            ob = patch(name, None, 8, 6, lift=0.010, th=0.010, cast=cast)
            o0, d0 = cast(0.0, 0.0); o1, d1 = cast(1.0, 0.0); p0, _ = hit(o0, d0); p1, _ = hit(o1, d1)
            oc, dc = cast(0.5, 0.0); pc, nc = hit(oc, dc); pivot = pc + nc * 0.012; ax = (p1 - p0).normalized()          # ось на гребне: хорда шарнира не уходит в выпуклую обшивку
            om, dm = cast(0.5, 1.0); pm, nm_ = hit(om, dm)                                               # задняя кромка должна уходить наружу при плюсе
            from mathutils import Matrix
            q = Matrix.Rotation(math.radians(10), 3, ax) @ (pm - pivot)
            if q.dot(nm_) < (pm - pivot).dot(nm_): ax = -ax
            _rel(ob, pivot)
            PARTS[name] = dict(pivot=pivot.copy(), axis=ax.copy(), range=(0.0, 55.0), note='тормозной щиток: шарнир у передней кромки; плюс - задняя кромка наружу')
            out.append(ob)
    return out


# ── пилоны и точки подвески ──
PYL = [(3.50, 12.55), (2.85, 11.85), (2.20, 11.35)]                 # x, середина пилона по длине: наружный, средний, внутренний
CENTER = (0.30, 11.60)                                              # подфюзеляжная пара за баками
PYL_H, PYL_C = 0.17, 1.30
def pylons():
    out = []
    for sx in (1, -1):
        s = 'r' if sx > 0 else 'l'; b = B()
        for i, (x, am) in enumerate(PYL):
            zb = g.wing_bot(x, am); zl = zb - PYL_H; rs = []
            for t in (0.0, 0.5, 1.0):
                af = am - PYL_C / 2 + 0.10 * t; c = PYL_C - 0.15 * t; zz = (zb + 0.04) * (1 - t) + zl * t
                rs.append(g.foil_ring(af, c, 0.10, 0.001, 1.0, 12, lambda a, h, zz=zz: P3(a, sx * x + h, zz), tail=g.cove_wall(af, c, 0.10, 1.0), head=g.cove_wall_f(af, c, 0.10, 0.001)))
            b.loft(rs, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
            for da in (-0.25, 0.25): bx(b, P3(am + da, sx * x, zl - 0.015), 0.025, 0.03, 0.02, G_METAL)
            STATIONS[f'st{i}_{s}'] = P3(am, sx * x, zl - 0.03)
        x, am = CENTER; zl = g.fus_bot(am, x) - 0.10
        for da in (-0.25, 0.25): bx(b, P3(am + da, sx * x, zl + 0.05), 0.03, 0.04, 0.06, G_METAL)
        bx(b, P3(am, sx * x, zl + 0.08), 0.05, 0.42, 0.04, G_SKIN)
        STATIONS[f'st3_{s}'] = P3(am, sx * x, zl - 0.03)
        out.append(b.finish('pylon_' + s, sharp_deg=40))
    return out


def details():
    """Пушка (правый корень крыла), антенны, огни, обтекатели приводов элевонов, пластины под консолями."""
    b = B()
    xg = 1.72; ag = g.LE(xg); pg = P3(ag + 0.25, xg, g.wz(xg) - 0.02)                                       # пушка ADEN в правом крыле: ствол из кромки
    tube(b, [pg, pg - AFT * 0.55], 0.052, G_DARK, 12); tube(b, [pg - AFT * 0.50, pg - AFT * 0.80], 0.030, G_METAL, 10); tube(b, [pg - AFT * 0.80, pg - AFT * 0.81], 0.012, G_DARK, 8)
    p, n = hit(P3(7.90, 0.0, 5.0), Vector((0, 0, -1))); blade(b, p, n, 0.34, 0.50, 0.20, 0.30, 0.022)           # антенна на гребне (03)
    p, n = hit(P3(3.40, 0.0, -5.0), Vector((0, 0, 1))); blade(b, p, n, 0.16, 0.24, 0.12, 0.10, 0.016)          # под носом
    p, n = hit(P3(12.80, 0.0, -5.0), Vector((0, 0, 1))); blade(b, p, n, 0.14, 0.22, 0.10, 0.08, 0.016)
    p, n = hit(P3(6.60, 0.0, 5.0), Vector((0, 0, -1))); b.loft([ring_around(p - n * 0.02, n, 0.07, 14), ring_around(p + n * 0.01, n, 0.07, 14)], G_METAL, cap0=G_METAL)
    b.loft([ring_around(p + n * (0.01 + 0.06 * math.sin(t)), n, max(0.002, 0.06 * math.cos(t)), 14) for t in (0.0, 0.5, 1.0, 1.4, 1.57)], G_LENS_R, cap0=G_LENS_R, cap1=G_LENS_R)   # проблесковый
    zt = g.FZ1 - 0.10; drop(b, P3(g.FTE(zt) - 0.02, 0.0, zt), -AFT, 0.030, 0.14, G_LENS_W, 12)               # белый на киле
    for sx in (1, -1):
        X = g.XTIP; drop(b, P3(g.LE(X - 0.10) + 0.08, sx * (X - 0.06), g.wz(X)), AFT, 0.032, 0.22, G_LENS_G if sx > 0 else G_LENS_R)   # навигационные
        for x in (2.86, 3.98):                                                                                  # обтекатели приводов элевонов
            pts = [P3(a, sx * x, g.wing_bot(x, a) - 0.025) for a in stations(11.9, g.EH(x) - 0.02, 0.10)]
            tube(b, pts, [0.004] + [0.050] * (len(pts) - 2) + [0.030], G_SKIN, 12)
        for x in (2.55, 3.05, 3.55, 4.05):                                                                      # пластины под консолью у передней кромки (07, 08)
            a0 = g.LE(x) + 0.08; a1 = a0 + 0.55
            rg = lambda a, d: [P3(a, sx * x + d * 0.006, g.wing_bot(x, a) + 0.02), P3(a, sx * x + d * 0.006, g.wing_bot(x, a) - 0.065)]
            b.loft([[*rg(a0, -1), *rg(a0, 1)[::-1]], [*rg(a1, -1), *rg(a1, 1)[::-1]]], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('det_ext', sharp_deg=38)
