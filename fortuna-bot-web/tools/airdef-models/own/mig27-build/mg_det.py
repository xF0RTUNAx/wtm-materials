# mg_det.py - детали МиГ-23БН: вырез и нутро кабины, рамы фонаря (козырёк неподвижен, фонарь на заднем шарнире вверх), четыре тормозных щитка на хвостовой части
# (два сверху, два снизу, 05), пилоны под наплывами и под фюзеляжем, подфюзеляжный бак tank_c, гондола пушки ГШ-23Л, антенны, огни, бронеплиты кабины, окно дальномера в носу.
import math
from mathutils import Vector, Matrix
from modelkit import B
import mg_geo as g
from _mg_base import P3, Yb, G_SKIN, G_METAL, G_DARK, G_GLASS, G_COCK, BVH, PARTS, STATIONS, patch, loft_obj, stations, strut, sup, foil_ring, cove_wall, cove_wall_f
from _mg_base import _rel, _sm, _apply_bool, _drop

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
CAB = (4.25, 6.25)
def cock_cavity():
    rs = []
    for a in stations(CAB[0], CAB[1], 0.10):
        k = _sm((a - CAB[0]) / 0.25) * _sm((CAB[1] - a) / 0.20); hw = max(0.05, 0.33 * (0.4 + 0.6 * k))
        rs.append(sup(a, 0.0, 1.40, -0.25, hw, 2.6, 2.6, 40))
    return loft_obj('c_cab', rs, G_COCK, sharp=30)


def cockpit():
    b = B(); fl = -0.22
    bx(b, P3(5.20, 0.0, fl), 0.32, 1.00, 0.02)
    bx(b, P3(4.48, 0.0, 0.32), 0.30, 0.10, 0.18); bx(b, P3(4.42, 0.0, 0.52), 0.31, 0.14, 0.02)                 # доска и козырёк
    bx(b, P3(4.585, 0.0, 0.38), 0.07, 0.005, 0.06, G_SCREEN)                                                  # индикатор прицела
    for dx, dz in ((-0.18, 0.40), (0.18, 0.40), (-0.18, 0.24), (0.18, 0.24), (0.0, 0.22)): bx(b, P3(4.585, dx, dz), 0.045, 0.005, 0.045, G_DARK)
    bx(b, P3(4.45, 0.0, 0.62), 0.05, 0.05, 0.06, G_GLASS)                                                     # стекло прицела
    bx(b, P3(5.65, 0.0, fl + 0.20), 0.22, 0.22, 0.05, 6); bx(b, P3(5.88, 0.0, fl + 0.56), 0.22, 0.05, 0.38, 6)   # кресло К-36
    bx(b, P3(5.92, 0.0, fl + 0.88), 0.15, 0.07, 0.09, G_COCK); bx(b, P3(5.88, 0.0, fl + 0.93), 0.05, 0.03, 0.03, G_HANDLE)
    for d_ in (-1, 1):
        bx(b, P3(5.68, d_ * 0.25, fl + 0.34), 0.03, 0.26, 0.15, G_COCK)
        bx(b, P3(5.20, d_ * 0.29, fl + 0.30), 0.04, 0.45, 0.10, G_COCK)
        for i in range(3): bx(b, P3(4.95 + 0.25 * i, d_ * 0.29, fl + 0.405), 0.03, 0.08, 0.004, G_SCREEN if i == 1 else G_DARK)
        bx(b, P3(4.75, d_ * 0.12, fl + 0.08), 0.04, 0.07, 0.01, G_METAL)
    strut(b, P3(5.20, 0.0, fl + 0.05), P3(5.15, 0.0, fl + 0.55), 0.016, G_DARK, 8); bx(b, P3(5.15, 0.0, fl + 0.58), 0.022, 0.022, 0.04, G_DARK)
    strut(b, P3(5.15, -0.22, fl + 0.30), P3(5.05, -0.22, fl + 0.48), 0.012, G_DARK, 8)                        # РУД
    bx(b, P3(6.18, 0.0, 0.10), 0.26, 0.03, 0.34, G_COCK)
    return b.finish('det_cockpit', sharp_deg=30)


def canopy_frames():
    fb = B(); cb = B(); r = 0.018
    arch = lambda a, sink=0.06: [p + Vector((0, 0, 0.005)) for p in g.can_ring(a, n=20, inset=-0.006, sink=sink)]
    tube(fb, arch(g.CAN_W - 0.005), r * 1.2, G_SKIN, 8)
    for k in (0, -1): tube(fb, [g.can_ring(a, n=20)[k] + Vector((0.004 if k == 0 else -0.004, 0, 0.004)) for a in stations(g.CAN_A0 + 0.02, g.CAN_W, 0.10)], r, G_SKIN, 8)
    for k in (7, 13):                                                                   # стойки между лобовым и боковыми стёклами: идут по стеклу (средней стойки нет, фото 03)
        tube(fb, [g.can_ring(a, n=20)[k] + (g.can_ring(a, n=20)[k] - Vector((0, g.can_ring(a, n=20)[k].y, g.can_ring(a, n=20)[10].z - 0.25))).normalized() * 0.004 for a in stations(g.CAN_A0 + 0.04, g.CAN_W, 0.05)], 0.011, G_SKIN, 8)
    for a in (g.CAN_W + 0.056, 5.45, g.CAN_A1 - 0.04): tube(cb, arch(a, 0.004), r, G_SKIN, 8)
    for k in (0, -1): tube(cb, [g.can_ring(a, n=20, sink=0.004)[k] + Vector((0.004 if k == 0 else -0.004, 0, 0.004)) for a in stations(g.CAN_W + 0.056, g.CAN_A1 - 0.04, 0.12)], r, G_SKIN, 8)
    def wpt(a, k, sx):                                                                  # точка края окна колпака (hood_ring: 2 - низ окна, 8 - верх), чуть наружу от стекла
        pts, _ = g.hood_ring(a); q = pts[k] if sx > 0 else pts[len(pts) - 1 - k]; c = g.P3(a, 0.0, g.fus_top(a, 0.0) - 0.30)
        return q + (q - c).normalized() * 0.005
    for sx in (1, -1):                                                                  # рамка окон откидной части: край стекла читается, металл над окном не выглядит листом в кабине
        a0, a1 = g.WIN_A; st = stations(a0, a1, 0.05)
        tube(cb, [wpt(a0, 2, sx)] + [wpt(a, 8, sx) for a in st] + [wpt(a1, 2, sx)], 0.009, G_SKIN, 8)
        tube(cb, [wpt(a, 2, sx) for a in st], 0.009, G_SKIN, 8)
        for a in (a0, a1): tube(cb, [wpt(a, k, sx) for k in range(2, 9)], 0.009, G_SKIN, 8)
    p = g.can_ring(5.45, n=20)[10] + Vector((0, 0, 0.02)); tube(cb, [p, p + Vector((0, 0, 0.07))], 0.010, G_DARK, 8); bx(cb, p + Vector((0, 0.03, 0.09)), 0.05, 0.03, 0.025, G_METAL)   # перископ
    return fb.finish('det_wsframe', sharp_deg=40), cb.finish('canopy_frame', sharp_deg=40)


def canopy_part(can):
    piv = P3(g.CAN_A1 + 0.02, 0.0, g.CAN(g.CAN_A1) + 0.02); _rel(can, piv)                              # шарнир на верху заднего сечения: задняя кромка уходит вперёд-вверх, не в обтекатель
    PARTS['canopy'] = dict(pivot=piv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 50.0), note='фонарь откидывается вверх на заднем шарнире (07); плюс - передняя кромка вверх; рама canopy_frame - дочерняя')


# ── тормозные щитки: четыре на хвостовой части - два сверху, два снизу (05) ──
BRAKES = [('u', 30.0, 62.0), ('d', 118.0, 150.0)]
BR_A = (12.75, 13.65)                                                 # впереди корня стабилизатора
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
            oc, dc = cast(0.5, 0.0); pc, nc = hit(oc, dc); pivot = pc + nc * 0.012; ax = (p1 - p0).normalized()
            om, dm = cast(0.5, 1.0); pm, nm_ = hit(om, dm)
            q = Matrix.Rotation(math.radians(10), 3, ax) @ (pm - pivot)
            if q.dot(nm_) < (pm - pivot).dot(nm_): ax = -ax
            _rel(ob, pivot)
            PARTS[name] = dict(pivot=pivot.copy(), axis=ax.copy(), range=(0.0, 50.0), note='тормозной щиток: шарнир у передней кромки; плюс - задняя кромка наружу')
            out.append(ob)
    return out


# ── подвеска: пилон под каждым наплывом, два под фюзеляжем рядом, центральный под бак (03) ──
GL_PYL = (1.55, 8.45)                                                 # x, середина пилона: под наплывом
VN_PYL = (0.78, 8.10)                                                 # подфюзеляжные, рядом: снаружи от створок основных ниш                                                 # подфюзеляжные, рядом
PYL_C = 1.30
def pylons():
    out = []
    for sx in (1, -1):
        s = 'r' if sx > 0 else 'l'; b = B()
        for i, (x, am, hh) in enumerate(((GL_PYL[0], GL_PYL[1], 0.22), (VN_PYL[0], VN_PYL[1], 0.16))):
            zb = g_under(sx * x, am); zl = zb - hh; rs = []
            for t in (0.0, 0.5, 1.0):
                af = am - PYL_C / 2 + 0.10 * t; c = PYL_C - 0.15 * t
                if t == 0.0: place = lambda a, h, x=x, sx=sx: P3(a, sx * x + h, g_under(sx * x + h, a) + 0.012)          # верх по низу наплыва (не заходит в щель консоли)
                else: zz = (zb + 0.012) * (1 - t) + zl * t; place = lambda a, h, zz=zz, x=x, sx=sx: P3(a, sx * x + h, zz)
                rs.append(foil_ring(af, c, 0.10, 0.001, 1.0, 12, place, tail=cove_wall(af, c, 0.10, 1.0), head=cove_wall_f(af, c, 0.10, 0.001)))
            b.loft(rs, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
            for da in (-0.25, 0.25): bx(b, P3(am + da, sx * x, zl - 0.015), 0.025, 0.03, 0.02, G_METAL)
            STATIONS[f'st{i}_{s}'] = P3(am, sx * x, zl - 0.03)
        out.append(b.finish('pylon_' + s, sharp_deg=40))
    b = B(); am = 10.55; x = 0.0; zb = g_under(0.0, am); zl = zb - 0.14; rs = []
    for t in (0.0, 0.5, 1.0):
        af = am - 0.80 + 0.10 * t; c = 1.60 - 0.15 * t; zz = (zb + 0.05) * (1 - t) + zl * t
        rs.append(foil_ring(af, c, 0.09, 0.001, 1.0, 12, lambda a, h, zz=zz: P3(a, h, zz), tail=cove_wall(af, c, 0.09, 1.0), head=cove_wall_f(af, c, 0.09, 0.001)))
    b.loft(rs, G_SKIN, cap0=G_SKIN, cap1=G_SKIN); STATIONS['center'] = P3(am, 0.0, zl - 0.03)
    out.append(b.finish('pylon_c', sharp_deg=40))
    return out


def g_under(x, a):
    p, n = hit(P3(a, x, -6.0), UP); return p.z


TANK = dict(a0=8.70, ln=3.80, r=0.28); TANK_ON = False                       # Mark 2026-11-13: «убери бак снизу» (пилон и точка center остаются)
def tank_c():
    """Подфюзеляжный бак 800 л на центральном пилоне (06, 07) - отдельная часть, Mark может попросить снять."""
    a0, ln, R = TANK['a0'], TANK['ln'], TANK['r']; zc = STATIONS['center'].z + 0.035 - R; n = 28     # бак прижат к замкам пилона
    from _mg_base import Track
    rr = Track([(0.0, 0.0), (0.06, 0.08), (0.35, 0.19), (0.90, 0.26), (1.40, R), (2.60, R), (3.20, 0.22), (3.60, 0.12), (3.76, 0.04), (ln, 0.0)])
    ss = [0.0, 0.01, 0.04, 0.09, 0.17, 0.28, 0.45, 0.65, 0.90, 1.20] + stations(1.45, 3.3, 0.30) + [3.45, 3.58, 3.68, 3.74, 3.78, ln]
    rs = [[P3(a0 + s, max(rr(s), 0.003) * math.sin(2 * math.pi * q / n), zc - max(rr(s), 0.003) * math.cos(2 * math.pi * q / n)) for q in range(n)] for s in ss]
    b = B(); b.loft(rs, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for k in range(3):                                                           # стабилизаторы бака
        ph = 2 * math.pi * k / 3 + math.pi; d = Vector((math.sin(ph), 0, -math.cos(ph)))
        c0 = P3(a0 + 3.05, 0, zc) + d * 0.20; c1 = P3(a0 + 3.70, 0, zc) + d * 0.05
        b.loft([[c0 - Vector((0.006, 0, 0)), c0 + Vector((0.006, 0, 0)), c0 + d * 0.16 + Vector((0.006, 0, 0)), c0 + d * 0.16 - Vector((0.006, 0, 0))],
                [c1 - Vector((0.006, 0, 0)), c1 + Vector((0.006, 0, 0)), c1 + d * 0.14 + Vector((0.006, 0, 0)), c1 + d * 0.14 - Vector((0.006, 0, 0))]], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('tank_c', sharp_deg=50)


def details():
    """Гондола пушки ГШ-23Л под фюзеляжем, бронеплиты кабины, окно дальномера, антенны, огни."""
    b = B()
    ag0, ag1 = 6.55, 8.70; xg = 0.24; zg = g_under(xg, 7.6)                         # гондола пушки ГШ-6-30 справа снизу (02, 03): шесть стволов блоком
    prof = [(ag0, 0.05), (ag0 + 0.10, 0.15), (ag0 + 0.40, 0.19), (ag1 - 0.35, 0.19), (ag1, 0.08)]
    b.loft([[P3(a, xg + r * 1.10 * math.sin(2 * math.pi * q / 24), zg - 0.05 + r * 0.95 * math.cos(2 * math.pi * q / 24) * (0.45 if math.cos(2 * math.pi * q / 24) > 0 else 1.0)) for q in range(24)] for a, r in prof], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    cg = P3(ag0 + 0.06, xg, zg - 0.13)
    tube(b, [cg + AFT * 0.10, cg - AFT * 0.05], 0.095, G_DARK, 18)                              # передний обод блока
    for k in range(6):
        t = 2 * math.pi * k / 6; off = Vector((0.062 * math.cos(t), 0, 0.062 * math.sin(t)))
        tube(b, [cg + off + AFT * 0.05, cg + off - AFT * 0.36], 0.017, G_DARK, 10)
    for k in (0.0, 0.18, 0.34):
        ring = cg - AFT * k; tube(b, [ring + AFT * 0.008, ring - AFT * 0.008], 0.088, G_METAL, 18)   # бандажи стволов
    for sx in (1, -1):                                                           # бронеплиты по бортам кабины (02: прямоугольники)
        for a0, a1 in ((4.30, 5.20), (5.25, 6.10)):
            rg = lambda a: [P3(a, sx * (g.fus_hw(a) - 0.01), 0.08), P3(a, sx * (g.fus_hw(a) + 0.012), 0.08), P3(a, sx * (g.fus_hw(a) + 0.012), 0.42), P3(a, sx * (g.fus_hw(a) - 0.01), 0.42)]
            b.loft([rg(a0), rg(a1)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    p, n = hit(P3(8.80, 0.0, 5.0), Vector((0, 0, -1))); blade(b, p, n, 0.30, 0.40, 0.18, 0.25, 0.020)             # антенна на гребне (02)
    p, n = hit(P3(3.20, 0.0, -5.0), Vector((0, 0, 1))); blade(b, p, n, 0.14, 0.22, 0.10, 0.08, 0.014)
    p, n = hit(P3(12.40, 0.0, -5.0), Vector((0, 0, 1))); blade(b, p, n, 0.16, 0.24, 0.12, 0.10, 0.016)
    p, n = hit(P3(7.40, 0.0, 5.0), Vector((0, 0, -1))); b.loft([ring_around(p - n * 0.02, n, 0.06, 14), ring_around(p + n * 0.01, n, 0.06, 14)], G_METAL, cap0=G_METAL)
    b.loft([ring_around(p + n * (0.01 + 0.05 * math.sin(t)), n, max(0.002, 0.05 * math.cos(t)), 14) for t in (0.0, 0.5, 1.0, 1.4, 1.57)], G_LENS_R, cap0=G_LENS_R, cap1=G_LENS_R)   # проблесковый
    zt = g.FZ1 - 0.10; drop(b, P3(g.FTE(zt) - 0.02, 0.0, zt), -AFT, 0.030, 0.14, G_LENS_W, 12)
    for sx in (1, -1): drop(b, P3(g.g_le(1.62) + 0.05, sx * 1.62, g.WZ), AFT, 0.025, 0.16, G_LENS_G if sx > 0 else G_LENS_R)     # огни на кромке наплыва (вне хода консоли)
    # «Кайра» (04): на тупом носу большое окно лазерного канала (рамка, тёмная линза), над ним колпак, ниже - прямоугольное окно ТВ-канала коробом
    zc = -0.215; cK = P3(g.NOSE_A0 - 0.005 + g.rake_at(zc), 0.0, zc)                                         # окно на скошенном торце
    ell = lambda c, rx, rz, k=28: [c + Vector((rx * math.cos(2 * math.pi * q / k), 0, rz * math.sin(2 * math.pi * q / k))) for q in range(k)]
    b.loft([ell(cK + AFT * 0.020, 0.150, 0.092), ell(cK - AFT * 0.006, 0.150, 0.092), ell(cK - AFT * 0.012, 0.136, 0.080), ell(cK - AFT * 0.004, 0.124, 0.070)], G_METAL, cap1=G_SCREEN)   # окно широкое овальное (фото Mark спереди)   # рамка на торце, внутри тёмное
    b.loft([ell(cK - AFT * 0.002, 0.060, 0.060, 20), ell(cK - AFT * 0.026, 0.044, 0.044, 20), ell(cK - AFT * 0.032, 0.015, 0.015, 20)], G_GLASS, cap0=G_GLASS, cap1=G_GLASS)   # линза выпуклая
    # небольшой наплыв над окном (фото Mark спереди): гладкий купол на верхней кромке рамки окна, наполовину в обшивке, спереди чуть нависает над окном
    zc_ = cK.z + 0.105; ac_ = g.NOSE_A0 + g.rake_at(zc_) + 0.045; rows = []
    for i_ in range(13):
        th = -math.pi / 2 + math.pi * i_ / 12; ca, sa = math.cos(th), math.sin(th)
        rows.append([P3(ac_ + 0.085 * sa, 0.100 * ca * math.cos(2 * math.pi * q / 24), zc_ + 0.062 * ca * math.sin(2 * math.pi * q / 24)) for q in range(24)])
    b.loft([rows[0]] + rows[1:-1] + [rows[-1]], G_SKIN)
    for sx in (1, -1):                                                              # короткие датчики по бокам окна (фото Mark спереди)
        p0 = P3(g.NOSE_A0 + g.rake_at(cK.z - 0.05) + 0.06, sx * 0.170, cK.z - 0.050); tube(b, [p0, p0 - AFT * 0.10], 0.026, G_SKIN, 12); tube(b, [p0 - AFT * 0.10, p0 - AFT * 0.16], 0.010, G_METAL, 8)
    cT = P3(g.NOSE_A0 + 0.05 + g.rake_at(-0.405) - 0.03, 0.0, -0.405); bx(b, cT + AFT * 0.06, 0.135, 0.09, 0.055, G_SKIN)                  # короб ТВ-окна
    bx(b, cT - AFT * 0.035, 0.115, 0.004, 0.040, G_SCREEN)
    for sx in (-1,):                                                                                 # датчик угла атаки слева (04)
        p0 = P3(g.NOSE_A0 + 0.47, sx * 0.24, -0.20); tube(b, [p0, p0 + Vector((sx * 0.06, 0.04, 0.0))], 0.012, G_METAL, 8); blade(b, p0 + Vector((sx * 0.06, 0.06, 0.0)), Vector((sx, 0, 0)), 0.05, 0.06, 0.03, 0.02, 0.004, G_METAL, 0.0)
    for sx in (1, -1):                                                                               # выпуклые обтекатели над нишами основных колёс (02, 03: широкие колёса)
        a0, a1 = 9.75, 11.25; xb = 0.66
        rs = []
        for a in stations(a0, a1, 0.15):
            t = (a - a0) / (a1 - a0); k = math.sin(math.pi * t) ** 0.6; zb = g.fus_bot(a, xb)
            rs.append([P3(a, sx * (xb + 0.17 * k * math.cos(math.pi * q / 12)), zb + 0.04 - 0.11 * k * math.sin(math.pi * q / 12)) for q in range(13)])
        b.loft([r if sx > 0 else r[::-1] for r in rs], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('det_ext', sharp_deg=38)


def all_details(skin, can):
    c = cock_cavity(); _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
    out = [cockpit()]
    fr, cfr = canopy_frames(); out.append(fr); canopy_part(can)
    import bpy; bpy.context.view_layer.update(); mw = cfr.matrix_world.copy(); cfr.parent = can; cfr.matrix_world = mw; out.append(cfr)
    out += airbrakes() + pylons() + ([tank_c()] if TANK_ON else []) + [details()]
    return out
