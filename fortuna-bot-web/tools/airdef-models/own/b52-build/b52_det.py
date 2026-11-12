# b52_det.py - мелкие детали B-52H (Mark 2026-11-11: «давай попробуем, кроме 13 пункта»): антенны-клинки и мачты, ПВД и флюгер угла атаки, огни (проблесковые красные,
# навигационные на концах крыла, белый хвостовой), заборники и дренажные мачты, коробки антенн и щели на хвостовом конусе (b52_10), дворники, верхние окна кабины,
# трубки и жгуты в бомбоотсеке. Все объекты - det_*: свой участок атласа (группа bits), в игре неподвижны; что на крыле - дочерние wing_r / wing_l.
# Ставятся лучами по обшивке до вырезов (BVH из b52_geo.bvh_ready), поэтому вызываются на этапе 3 сразу после bvh_ready.
import math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from modelkit import B
import b52_geo as g
from b52_geo import P3, Z, Yb, G_SKIN, G_METAL, G_DARK, G_COCK, BVH

G_SCREEN, G_BELT, G_HANDLE = 7, 8, 9
G_LENS_R, G_LENS_G, G_LENS_W = 12, 13, 14
AFT = Vector((0, -1, 0)); UP = Vector((0, 0, 1))


def hit(o, d, tree=None):
    h = (tree or BVH['t']).ray_cast(o, d)
    if h[0] is None: raise RuntimeError(f'луч мимо: {tuple(round(v, 2) for v in o)}')
    n = h[1].normalized()
    if n.dot(d) > 0: n = -n
    return h[0], n


def on_top(a, x=0.0, tree=None): return hit(Vector((x, Yb(a), 15.0)), Vector((0, 0, -1)), tree)
def on_bot(a, x=0.0, tree=None): return hit(Vector((x, Yb(a), -15.0)), Vector((0, 0, 1)), tree)
def on_side(a, zg, sx, tree=None): return hit(Vector((sx * 15.0, Yb(a), Z(zg))), Vector((-sx, 0, 0)), tree)


def basis(n, fwd=AFT):
    """Нормаль n, w - по потоку (назад) вдоль обшивки, s = n × w."""
    w = (fwd - n * fwd.dot(n)).normalized(); return n, w, n.cross(w)


def ring_around(c, n, r, k=16, rz=None):
    u = n.orthogonal().normalized(); v = n.cross(u)
    return [c + (u * math.cos(2 * math.pi * q / k) + v * math.sin(2 * math.pi * q / k)) * r for q in range(k)]


def blade(b, p, n, h, c0, c1, sweep, t, mat=G_SKIN, sink=0.035):
    """Антенна-клинок: тонкий профиль, стреловидная передняя кромка, основание утоплено в обшивку."""
    up, w, s = basis(n); m = 7; rings = []
    for k in (-sink / h, 0.0, 0.45, 1.0):
        c = c0 + (c1 - c0) * max(k, 0.0); le = -c0 / 2 + sweep * max(k, 0.0); th = t * (1 - 0.45 * max(k, 0.0))
        side = [(i / m, max(0.0015, th / 2 * math.sin(math.pi * i / m) ** 0.55)) for i in range(m + 1)]
        pts = [(u, y) for u, y in side] + [(u, -y) for u, y in reversed(side[1:-1])]
        rings.append([p + up * (h * k) + w * (le + c * u) + s * y for u, y in pts])
    b.loft(rings, mat, cap0=mat, cap1=mat)


def mast(b, p, n, h, r, top=0.0):
    """Мачта-штырь (b52_05: две тонкие мачты на спине): основание-шайба, штырь, на конце поперечная перекладина."""
    up = n; b.loft([ring_around(p - up * 0.03, up, r * 2.6, 12), ring_around(p + up * 0.015, up, r * 2.6, 12), ring_around(p + up * 0.03, up, r * 1.4, 12)], G_SKIN, cap0=G_SKIN)
    tube(b, [p + up * 0.02, p + up * h], [r, r * 0.65], G_DARK, 8)
    if top:
        q = p + up * h; s_ = UP.cross(AFT).normalized() if abs(up.dot(UP)) > 0.5 else AFT
        tube(b, [q - AFT * top * 0.5, q + AFT * top * 0.5], r * 0.8, G_DARK, 8)


def tube(b, pts, r, mat=G_METAL, n=10, caps=True):
    rs = r if isinstance(r, (list, tuple)) else [r] * len(pts)
    if len(rs) != len(pts): rs = [rs[0] + (rs[-1] - rs[0]) * i / (len(pts) - 1) for i in range(len(pts))]
    t0 = (pts[1] - pts[0]).normalized(); u = t0.orthogonal().normalized(); rings = []
    for i, p in enumerate(pts):
        a_ = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized(); u = (u - a_ * u.dot(a_)).normalized(); v = a_.cross(u)
        rings.append([p + (u * math.cos(2 * math.pi * q / n) + v * math.sin(2 * math.pi * q / n)) * rs[i] for q in range(n)])
    b.loft(rings, mat, cap0=mat if caps else None, cap1=mat if caps else None)


def dome(b, p, n, r, h, lens, k=18):
    """Огонь: металлическое основание и линза-купол."""
    up = n
    b.loft([ring_around(p - up * 0.03, up, r * 1.25, k), ring_around(p + up * 0.012, up, r * 1.25, k), ring_around(p + up * 0.02, up, r * 1.08, k)], G_METAL, cap0=G_METAL)
    rs = [ring_around(p + up * (0.02 + h * math.sin(t)), up, max(0.002, r * math.cos(t)), k) for t in (0.0, 0.35, 0.75, 1.1, 1.4, 1.57)]
    b.loft(rs, lens, cap0=lens, cap1=lens)


def drop(b, c, ax, r, ln, mat, k=14):
    """Капля вдоль ax: тупой нос, острый хвост (навигационные огни, обтекатели)."""
    ax = ax.normalized(); prof = [(0.0, 0.002), (0.04, 0.55), (0.12, 0.85), (0.30, 1.0), (0.60, 0.80), (0.85, 0.40), (1.0, 0.002)]
    b.loft([ring_around(c + ax * (ln * (s - 0.3)), ax, max(0.0015, r * q), k) for s, q in prof], mat, cap0=mat, cap1=mat)


def scoop(b, p, n, wd, ht, ln, opening=-1, mat=G_SKIN):
    """Заборник-ковш: открытый конец тёмный. opening=-1 - открыт вперёд (забор), +1 - назад (выход, жалюзи)."""
    up, w, s = basis(n); d = w * (-opening)                                             # d - от открытого конца к закрытому
    def rg(t, hk, wk):
        c = p + d * (ln * (t - 0.5)); hh = ht * hk; ww_ = wd * wk / 2
        return [c - up * 0.03 - s * ww_, c - up * 0.03 + s * ww_, c + up * hh + s * ww_ * 0.85, c + up * hh - s * ww_ * 0.85]
    b.loft([rg(0.0, 1.0, 1.0), rg(0.15, 0.95, 1.0), rg(0.6, 0.55, 0.9), rg(1.0, 0.03, 0.7)], mat, cap0=G_DARK, cap1=mat)


def boxon(b, p, n, l, wd, ht, mat=G_SKIN, front_dark=False):
    """Коробка на обшивке: длина l по потоку, ширина wd, высота ht; спереди тёмное окно (b52_10: коробки антенн с тёмными окнами)."""
    up, w, s = basis(n); e = min(wd, ht) * 0.18
    def rg(t, k):
        c = p + w * (l * t) ; return [c - up * 0.03 - s * (wd / 2 - k), c - up * 0.03 + s * (wd / 2 - k), c + up * (ht - k) + s * (wd / 2 - k), c + up * (ht - k) - s * (wd / 2 - k)]
    b.loft([rg(-0.5, e), rg(-0.5 + e / l, 0.0), rg(0.5 - e / l, 0.0), rg(0.5, e)], mat, cap0=G_DARK if front_dark else mat, cap1=mat)


def obj_tree(ob):
    M = ob.matrix_world; V = [M @ v.co for v in ob.data.vertices]; F = [tuple(p.vertices) for p in ob.data.polygons]
    return BVHTree.FromPolygons(V, F)


def fuselage_details():
    """Антенны, мачты, ПВД, огни на фюзеляже, заборники, дренажи, коробки и щели хвостового конуса."""
    b = B()
    # клинки сверху: (a, x, высота, хорда у корня, у конца, стреловидность, толщина)
    for a, x, h, c0, c1, sw, t in ((8.30, 0.0, 0.30, 0.42, 0.20, 0.18, 0.028), (11.40, 0.0, 0.20, 0.30, 0.15, 0.12, 0.022), (16.60, 0.45, 0.16, 0.26, 0.14, 0.10, 0.020),
                                   (16.60, -0.45, 0.16, 0.26, 0.14, 0.10, 0.020), (33.20, 0.0, 0.36, 0.48, 0.22, 0.22, 0.030), (36.30, 0.0, 0.22, 0.32, 0.16, 0.14, 0.024)):
        p, n = on_top(a, x); blade(b, p, n, h, c0, c1, sw, t)
    # клинки снизу (между нишами по оси и за отсеком)
    for a, x, h, c0, c1, sw, t in ((6.20, 0.30, 0.26, 0.36, 0.18, 0.16, 0.026), (9.10, -0.30, 0.22, 0.32, 0.16, 0.14, 0.024), (11.00, 0.0, 0.30, 0.42, 0.20, 0.20, 0.028),
                                   (15.80, 0.0, 0.18, 0.28, 0.14, 0.12, 0.022), (32.00, 0.0, 0.30, 0.42, 0.20, 0.18, 0.028), (35.00, 0.40, 0.20, 0.30, 0.15, 0.12, 0.022),
                                   (35.00, -0.40, 0.20, 0.30, 0.15, 0.12, 0.022), (39.80, 0.0, 0.24, 0.34, 0.16, 0.14, 0.024)):
        p, n = on_bot(a, x); blade(b, p, n, h, c0, c1, sw, t)
    for a in (30.60, 34.60):                                                        # две мачты на спине (b52_05)
        p, n = on_top(a, 0.0); mast(b, p, n, 0.62, 0.016, top=0.16)
    for a, x in ((16.60, 0.0), (40.60, 0.0)):                                        # дренажные мачты снизу
        p, n = on_bot(a, x); blade(b, p, n, 0.11, 0.12, 0.06, 0.08, 0.014, G_METAL, 0.02)
    # ПВД на носу (b52_05, 06: «рожок» на борту под окнами) и флюгер угла атаки
    for sx in (1, -1):
        zc = (g.FT[0](3.15) + g.FT[1](3.15)) / 2 + ZA_ - 0.18
        p, n = on_side(3.15, zc, sx)
        drop(b, p + n * 0.02 + AFT * 0.10, AFT, 0.075, 0.55, G_SKIN)                 # обтекатель-основание
        q0 = p + n * 0.09 - AFT * 0.10; q1 = q0 - AFT * 0.42
        tube(b, [q0 + AFT * 0.20, q0, q1], [0.024, 0.020, 0.013], G_METAL, 10)        # трубка вперёд
        tube(b, [q1, q1 - AFT * 0.012], 0.006, G_DARK, 8)
        p2, n2 = on_side(4.30, zc - 0.55, sx)                                         # флюгер угла атаки
        tube(b, [p2 - n2 * 0.02, p2 + n2 * 0.012], 0.045, G_METAL, 12)
        blade(b, p2 + n2 * 0.01, n2, 0.10, 0.10, 0.06, 0.03, 0.010, G_METAL, 0.005)
    # огни: красные проблесковые сверху и снизу, белый хвостовой на законцовке киля
    p, n = on_top(14.20, 0.0); dome(b, p, n, 0.085, 0.075, G_LENS_R)
    p, n = on_bot(31.20, 0.0); dome(b, p, n, 0.085, 0.075, G_LENS_R)
    zt = g.FZ1 - 0.12; pt = P3(g.FTE(zt) - 0.02, 0.0, Z(zt)); drop(b, pt, -AFT, 0.035, 0.16, G_LENS_W, 12)
    # заборники и выходы: кондиционирование на бортах за кабиной, снизу у отсека, на хвосте
    for sx in (1, -1):
        for a, zg, wd, ht, ln, op in ((9.60, 2.45, 0.22, 0.07, 0.42, -1), (12.20, 1.95, 0.16, 0.05, 0.30, -1), (40.80, 3.30, 0.14, 0.05, 0.26, 1), (34.50, 2.40, 0.12, 0.04, 0.22, 1)):
            p, n = on_side(a, zg, sx); scoop(b, p, n, wd, ht, ln, op)
        p, n = on_bot(16.10, sx * 0.55); scoop(b, p, n, 0.18, 0.06, 0.34, -1)
    # хвостовой конус (b52_10): коробки антенн с тёмными окнами на бортах, щели-жалюзи на нижнем обтекателе, штырь снизу
    for sx in (1, -1):
        p, n = on_side(44.70, 4.95, sx); boxon(b, p, n, 0.30, 0.20, 0.13, G_SKIN, True)
        p, n = on_side(45.40, 4.05, sx); boxon(b, p, n, 0.20, 0.14, 0.07, G_SKIN, True)
        for i in range(3):
            p, n = on_side(47.10 + 0.20 * i, 3.62, sx); scoop(b, p, n, 0.10, 0.030, 0.16, 1)
        p, n = on_side(46.60, 3.80, sx); scoop(b, p, n, 0.10, 0.04, 0.18, -1)
    p, n = on_bot(46.40, 0.0); blade(b, p, n, 0.16, 0.22, 0.10, 0.08, 0.018)
    return b.finish('det_ant', sharp_deg=38)


ZA_ = g.ZA


def wing_details(sx, wing):
    """Навигационные огни на концах крыла (правый зелёный, левый красный, сзади белые), дренажи топлива на законцовке, мачты-дренажи под гондолами, заборники на пилонах."""
    b = B(); X = g.XTIP; lens = G_LENS_G if sx > 0 else G_LENS_R
    c = P3(g.LE(X - 0.06) + 0.12, sx * (X - 0.06), g.wz(X)); drop(b, c, AFT, 0.045, 0.30, lens)
    c2 = P3(g.TE(X - 0.25) - 0.12, sx * (X - 0.10), g.wz(X)); drop(b, c2, AFT, 0.028, 0.16, G_LENS_W, 12)
    tree = obj_tree(wing)
    for xx in (X - 1.20,):                                                          # дренаж топлива: трубка под законцовкой назад
        p, n = hit(Vector((sx * xx, Yb(g.TE(xx) - 0.9), -15.0)), UP, tree); tube(b, [p + n * -0.02, p + n * 0.05, p + n * 0.07 + AFT * 0.10], [0.018, 0.016, 0.012], G_METAL, 8)
    ob = b.finish('det_wing_' + ('r' if sx > 0 else 'l'), sharp_deg=38)
    return ob


def pod_details(pod, xc, sx):
    """Гондола: дренажная мачта снизу между двигателями, два заборника охлаждения на бортах пилона, замки капотов - в краске."""
    b = B(); tree = obj_tree(pod); pf = g.pod_front(xc)
    p, n = hit(Vector((sx * xc, Yb(pf + 3.70), -15.0)), UP, tree); blade(b, p, n, 0.13, 0.12, 0.06, 0.09, 0.014, G_METAL, 0.02)
    for k in (-1, 1):                                                               # ковши на наружных боках двигателей вверху
        p, n = hit(Vector((sx * xc + k * 15.0, Yb(pf + 1.10), g.pod_z(xc) + 0.32)), Vector((-k, 0, 0)), tree)     # k=+1 - двигатель с большим x, луч справа
        scoop(b, p, n, 0.16, 0.06, 0.30, -1)
    return b.finish(f'det_{pod.name}', sharp_deg=38)


def wipers():
    """Дворники на двух передних стёклах каждого борта: ось внизу стекла, щётка вдоль стекла."""
    b = B()
    for sx in (1, -1):
        for a0, a1, f0, f1 in (g.WIN[0], g.WIN[2]):                                # два передних стекла (WIN[1] - верхнее окно)
            cast = g._win_cast(a0, a1, f0, f1, sx)
            o0, d0 = cast(0.5, 0.06); o1, d1 = cast(0.40, 0.88)
            p0, n0 = hit(o0, d0); p1, n1 = hit(o1, d1)
            p0 = p0 + n0 * 0.018; p1 = p1 + n1 * 0.014
            tube(b, [p0 - n0 * 0.03, p0 + n0 * 0.008], 0.020, G_DARK, 10)
            tube(b, [p0 + n0 * 0.004, p0.lerp(p1, 0.25) + n0 * 0.008, p1], [0.007, 0.006, 0.005], G_DARK, 6)
            q0 = p0.lerp(p1, 0.18); q1 = p1 + (p1 - p0).normalized() * 0.04
            tube(b, [q0, q1], 0.006, G_DARK, 6)
    return b.finish('det_wipers', sharp_deg=38)


def bay_lines():
    """Нутро отсека: гидравлические трубки и жгуты по стенкам и потолку с хомутами на шпангоутах, коробки разъёмов."""
    b = B(); a0, a1, x = g.BAY['a0'], g.BAY['a1'], g.BAY['x']; top = Z(g.BAY['top']); fr = g.stations(a0 + 0.25, a1 - 0.25, 0.62)
    for sx in (1, -1):
        for dz, r, m in ((0.24, 0.014, G_METAL), (0.31, 0.011, G_METAL), (0.38, 0.016, G_METAL), (0.50, 0.026, G_DARK)):
            xx = sx * (x - 0.085); pts = [P3(a0 + 0.22, xx, top - dz), P3(a1 - 0.22, xx, top - dz)]; tube(b, pts, r, m, 8)
            for a_ in fr: tube(b, [P3(a_ - 0.03, xx, top - dz), P3(a_ + 0.03, xx, top - dz)], r * 1.7, G_BELT, 8)
        for dz, r in ((0.10, 0.020),):                                              # жгут у потолка
            xx = sx * 0.62; tube(b, [P3(a0 + 0.22, xx, top - dz), P3(a1 - 0.22, xx, top - dz)], r, G_DARK, 8)
            for a_ in fr: tube(b, [P3(a_ - 0.025, xx, top - dz), P3(a_ + 0.025, xx, top - dz)], r * 1.6, G_BELT, 8)
        for a_ in (a0 + 0.80, (a0 + a1) / 2, a1 - 0.80):                              # коробки разъёмов на стенке
            c_ = P3(a_, sx * (x - 0.09), top - 0.68)
            rg = lambda dy: [c_ + Vector((-0.05, dy, -0.08)), c_ + Vector((0.05, dy, -0.08)), c_ + Vector((0.05, dy, 0.08)), c_ + Vector((-0.05, dy, 0.08))]
            b.loft([rg(-0.12), rg(0.12)], G_COCK, cap0=G_COCK, cap1=G_COCK)
    return b.finish('det_bay_lines', sharp_deg=30)
