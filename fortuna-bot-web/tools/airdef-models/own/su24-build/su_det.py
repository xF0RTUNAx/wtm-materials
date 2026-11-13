# su_det.py - детали Су-24М (единицы чертежа 03, см. su_geo): вырез и нутро кабины (два кресла рядом: лётчик слева, штурман справа), рамы козырька и двух створок,
# тормозной щиток под фюзеляжем, пилоны (под наплывами, четыре под фюзеляжем парами, поворотные под консолями), гондола пушки ГШ-6-23, антенны, огни, воздухозаборники охлаждения.
import math
from mathutils import Vector, Matrix
from modelkit import B
import su_geo as g
from _su_base import P3, Yb, G_SKIN, G_METAL, G_DARK, G_GLASS, G_COCK, BVH, PARTS, STATIONS, patch, loft_obj, stations, strut, sup, foil_ring, cove_wall, cove_wall_f, thk
from _su_base import _rel, _sm, _apply_bool, _drop

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


def g_under(x, a):
    p, n = hit(P3(a, x, -6.0), UP); return p.z


# ── кабина: два кресла К-36ДМ рядом (лётчик слева, штурман справа), общая приборная доска с козырьком, пульты по бортам ──
CAB = (5.40, 7.55)
SEATS = (-0.34, 0.34)
def cock_cavity():
    rs = []
    for a in stations(CAB[0], CAB[1], 0.10):
        k = _sm((a - CAB[0]) / 0.30) * _sm((CAB[1] - a) / 0.20); hw = max(0.06, 0.66 * (0.45 + 0.55 * k))
        rs.append(sup(a, 0.0, 1.60, 0.05, hw, 3.0, 2.6, 44))
    return loft_obj('c_cab', rs, G_COCK, sharp=30)


def cockpit():
    b = B(); fl = 0.10
    bx(b, P3(6.55, 0.0, fl), 0.64, 1.10, 0.02)                                                                  # пол
    bx(b, P3(5.82, 0.0, 0.66), 0.50, 0.10, 0.20); bx(b, P3(5.78, 0.0, 0.88), 0.48, 0.14, 0.02)                 # доска и козырёк (уже фюзеляжа у козырька фонаря)
    for sx_ in SEATS:
        bx(b, P3(5.885, sx_, 0.78), 0.10, 0.005, 0.08, G_SCREEN)                                                  # экран
        for dx, dz in ((-0.20, 0.82), (0.20, 0.82), (-0.20, 0.62), (0.20, 0.62)): bx(b, P3(5.885, sx_ + dx * 0.8, dz), 0.045, 0.005, 0.045, G_DARK)
        bx(b, P3(6.95, sx_, fl + 0.22), 0.24, 0.24, 0.06, 6); bx(b, P3(7.20, sx_, fl + 0.62), 0.24, 0.06, 0.42, 6)   # кресло К-36ДМ: чаша и спинка
        bx(b, P3(7.24, sx_, fl + 0.97), 0.16, 0.08, 0.10, G_COCK); bx(b, P3(7.20, sx_, fl + 1.02), 0.05, 0.03, 0.03, G_HANDLE)
        for d_ in (-1, 1): bx(b, P3(6.98, sx_ + d_ * 0.27, fl + 0.38), 0.03, 0.28, 0.16, G_COCK)
        strut(b, P3(6.50, sx_, fl + 0.05), P3(6.44, sx_, fl + 0.55), 0.016, G_DARK, 8); bx(b, P3(6.44, sx_, fl + 0.58), 0.022, 0.022, 0.04, G_DARK)
    bx(b, P3(6.55, 0.0, fl + 0.30), 0.10, 0.70, 0.18, G_COCK)                                                     # средний пульт
    for i in range(3): bx(b, P3(6.20 + 0.30 * i, 0.0, fl + 0.485), 0.07, 0.10, 0.004, G_SCREEN if i == 1 else G_DARK)
    strut(b, P3(6.60, -0.62, fl + 0.30), P3(6.50, -0.62, fl + 0.50), 0.012, G_DARK, 8)                          # РУД у лётчика
    for d_ in (-1, 1): bx(b, P3(6.65, d_ * 0.58, fl + 0.30), 0.05, 0.70, 0.11, G_COCK)                          # боковые пульты
    bx(b, P3(7.42, 0.0, 0.55), 0.58, 0.03, 0.30, G_COCK)                                                       # задняя стенка ниже хода створок
    return b.finish('det_cockpit', sharp_deg=30)


def canopy_frames(cans):
    fb = B(); r = 0.018
    arch = lambda a, sink=0.06, t0=0.0, t1=math.pi: [p + Vector((0, 0, 0.005)) for p in g.can_ring(a, n=20, inset=-0.006, sink=sink, t0=t0, t1=t1)]
    tube(fb, arch(g.CAN_W - 0.005), r * 1.3, G_SKIN, 8)
    for k in (0, -1): tube(fb, [g.can_ring(a, n=20)[k] + Vector((0.004 if k == 0 else -0.004, 0, 0.004)) for a in stations(g.CAN_A0 + 0.02, g.CAN_W, 0.10)], r, G_SKIN, 8)
    for k in (6, 14):                                                                   # стойки козырька между лобовым и боковыми стёклами (05, 07): по стеклу
        tube(fb, [g.can_ring(a, n=20)[k] + (g.can_ring(a, n=20)[k] - Vector((0, g.can_ring(a, n=20)[k].y, g.can_ring(a, n=20)[10].z - 0.30))).normalized() * 0.004 for a in stations(g.CAN_A0 + 0.04, g.CAN_W, 0.05)], 0.012, G_SKIN, 8)
    frames = []
    for sx, can in zip((1, -1), cans):                                                # рамы створок: передняя и задняя дуги, борт, шов посередине, поперечина
        cb = B(); t0, t1 = (0.0, math.pi / 2 - 0.03) if sx > 0 else (math.pi / 2 + 0.03, math.pi)
        for a in (g.CAN_W + 0.050, 6.95, g.CAN_A1 - 0.04): tube(cb, arch(a, 0.004, t0, t1), r, G_SKIN, 8)
        kk = (0, -1) if sx > 0 else (0, -1)
        for k in kk: tube(cb, [g.can_ring(a, n=20, sink=0.004, t0=t0, t1=t1)[k] + Vector((0, 0, 0.004)) for a in stations(g.CAN_W + 0.050, g.CAN_A1 - 0.04, 0.12)], r, G_SKIN, 8)
        cfr = cb.finish('canopy_frame_' + ('r' if sx > 0 else 'l'), sharp_deg=40); frames.append(cfr)
    return fb.finish('det_wsframe', sharp_deg=40), frames


# ── тормозной щиток под фюзеляжем за нишей носовой стойки (09, 11): шарнир спереди, открывается вниз ──
BRK = dict(a0=7.40, a1=8.25, hw=0.34)                                   # перед гондолой пушки, за нишей носовой стойки
def airbrake():
    a0, a1, hw = BRK['a0'], BRK['a1'], BRK['hw']
    ob = patch('brake', lambda u, v: (a0 + (a1 - a0) * v, -hw + 2 * hw * u), 8, 6, dirn=1, lift=0.006, th=0.016, z0=-8.0)
    p0, _ = hit(P3(a0 + 0.02, 0.0, -6.0), UP); pivot = p0 + Vector((0, 0, -0.02)); _rel(ob, pivot)
    PARTS['brake'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, 50.0), note='тормозной щиток под фюзеляжем: шарнир у передней кромки поперёк; плюс - задняя кромка вниз')
    return [ob]


# ── подвеска: под каждым наплывом (st0), под фюзеляжем две пары друг за другом (st1 - передняя, st2 - задняя), контейнер по оси между ними; поворотные пилоны под консолями ──
GL_PYL = (1.90, 12.85, 1.60, 0.24)                                    # x, середина, длина, высота: под наплывом (02: 2,3 м от оси; 09: баки под наплывами)
FU_PYL = [(0.95, 9.41, 1.40, 0.14), (0.50, 13.55, 1.40, 0.14)]                    # передняя пара - под заборниками (справа под фюзеляжем пушка), задняя - под фюзеляжем; 4,3 м между ними (_collide)
POD = (0.0, 16.91, 1.10, 0.12)                                       # контейнер по оси сзади, между подфюзеляжными гребнями (впереди мешают подвеска и пушка)
def _pyl(b, x, am, ln, hh, sx, st_name):
    zb = g_under(sx * x, am); zl = zb - hh; rs = []
    for t in (0.0, 0.5, 1.0):
        af = am - ln / 2 + 0.10 * t; c = ln - 0.15 * t
        if t == 0.0: place = lambda a, h, x=x, sx=sx: P3(a, sx * x + h, g_under(sx * x + h, a) + 0.012)
        else: zz = (zb + 0.012) * (1 - t) + zl * t; place = lambda a, h, zz=zz, x=x, sx=sx: P3(a, sx * x + h, zz)
        rs.append(foil_ring(af, c, 0.10, 0.001, 1.0, 12, place, tail=cove_wall(af, c, 0.10, 1.0), head=cove_wall_f(af, c, 0.10, 0.001)))
    b.loft(rs, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for da in (-0.25, 0.25): bx(b, P3(am + da, sx * x, zl - 0.015), 0.025, 0.03, 0.02, G_METAL)
    STATIONS[st_name] = P3(am, sx * x, zl - 0.03)
def pylons():
    out = []
    for sx in (1, -1):
        s = 'r' if sx > 0 else 'l'; b = B()
        _pyl(b, *GL_PYL, sx, f'st0_{s}')
        for i, p_ in enumerate(FU_PYL): _pyl(b, *p_, sx, f'st{i + 1}_{s}')
        out.append(b.finish('pylon_' + s, sharp_deg=40))
    b = B(); x, am, ln, hh = POD; zb = g_under(0.0, am); zl = zb - hh; rs = []
    for t in (0.0, 0.5, 1.0):
        af = am - ln / 2 + 0.10 * t; c = ln - 0.15 * t; zz = (zb + 0.03) * (1 - t) + zl * t
        rs.append(foil_ring(af, c, 0.09, 0.001, 1.0, 12, lambda a, h, zz=zz: P3(a, h, zz), tail=cove_wall(af, c, 0.09, 1.0), head=cove_wall_f(af, c, 0.09, 0.001)))
    b.loft(rs, G_SKIN, cap0=G_SKIN, cap1=G_SKIN); STATIONS['center'] = P3(am, 0.0, zl - 0.03)
    out.append(b.finish('pylon_c', sharp_deg=40))
    return out


SW_PYL = (1.75, 1.10, 0.28)                                           # короче: между носком и закрылком (_collide)                                           # s от шарнира, длина, высота: поворотный пилон под консолью (02, 09)
def swing_pylon(sx):
    """Поворотный пилон под консолью: строится при 16° по потоку; в игре ходит вместе с консолью и разворачивается обратно (стоит по потоку). Точкой подвески игры не служит."""
    s, ln, hh = SW_PYL; le = g.w_le(s); te = g.w_te(s); c = te - le; dm = le + c * 0.42; tc = g.w_tc(s)
    zb = g.WZ - s * g.ANH - tc * c * thk(0.42) * 0.98; zl = zb - hh; b = B(); rs = []
    for t in (0.0, 0.5, 1.0):
        af = dm - ln / 2 + 0.10 * t; cc = ln - 0.15 * t; zz = (zb + 0.02) * (1 - t) + zl * t
        rs.append(foil_ring(g.PIV[0] + af, cc, 0.09, 0.001, 1.0, 12, lambda a, h, zz=zz: P3(a, sx * (g.PIV[1] + s) + h, zz), tail=cove_wall(g.PIV[0] + af, cc, 0.09, 1.0), head=cove_wall_f(g.PIV[0] + af, cc, 0.09, 0.001)))
    b.loft(rs, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for da in (-0.25, 0.25): bx(b, P3(g.PIV[0] + dm + da, sx * (g.PIV[1] + s), zl - 0.015), 0.025, 0.03, 0.02, G_METAL)
    nm = 'pyl_w_' + ('r' if sx > 0 else 'l'); ob = b.finish(nm, sharp_deg=40); piv = P3(g.PIV[0] + dm, sx * (g.PIV[1] + s), zb); _rel(ob, piv)
    PARTS[nm] = dict(pivot=piv.copy(), axis=Vector((0, 0, -sx)), range=(-g.D_FILE, 0.0), parent='wing_' + ('r' if sx > 0 else 'l'),
                     note='поворотный пилон: вертикальная ось; при стреловидности консоли на угол k разворачивается на -k (стоит по потоку); в файле развёрнут на -' + f'{g.D_FILE:.0f}°')
    return ob


def details():
    """Гондола пушки ГШ-6-23 под фюзеляжем справа (07, 11), антенны, огни, заборники охлаждения, проблесковый маяк."""
    b = B()
    ag0, ag1, xg = 8.30, 10.60, 0.42; zg = g_under(xg, 9.4)                       # гондола пушки справа под фюзеляжем
    prof = [(ag0, 0.03), (ag0 + 0.18, 0.15), (ag0 + 0.50, 0.19), (ag1 - 0.40, 0.19), (ag1, 0.08)]
    b.loft([[P3(a, xg + r * 1.10 * math.sin(2 * math.pi * q / 24), zg - 0.02 + r * 0.9 * math.cos(2 * math.pi * q / 24) * (0.35 if math.cos(2 * math.pi * q / 24) > 0 else 1.0)) for q in range(24)] for a, r in prof], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for k in range(6):                                                            # блок из шести стволов
        ph = 2 * math.pi * k / 6; p = P3(ag0 + 0.12, xg + 0.045 * math.cos(ph), zg - 0.13 + 0.045 * math.sin(ph))
        tube(b, [p + AFT * 0.5, p, p - AFT * 0.36], [0.018, 0.017, 0.015], G_DARK, 8)
    p, n = hit(P3(10.40, 0.0, 6.0), Vector((0, 0, -1))); blade(b, p, n, 0.32, 0.45, 0.20, 0.25, 0.020)             # антенна на спине
    p, n = hit(P3(6.20, 0.0, -6.0), Vector((0, 0, 1))); blade(b, p, n, 0.16, 0.24, 0.12, 0.08, 0.014)             # антенны снизу
    p, n = hit(P3(15.60, 0.0, -6.0), Vector((0, 0, 1))); blade(b, p, n, 0.18, 0.26, 0.12, 0.10, 0.016)
    p, n = hit(P3(11.20, 0.0, 6.0), Vector((0, 0, -1))); b.loft([ring_around(p - n * 0.02, n, 0.07, 14), ring_around(p + n * 0.01, n, 0.07, 14)], G_METAL, cap0=G_METAL)
    b.loft([ring_around(p + n * (0.01 + 0.06 * math.sin(t)), n, max(0.002, 0.06 * math.cos(t)), 14) for t in (0.0, 0.5, 1.0, 1.4, 1.57)], G_LENS_R, cap0=G_LENS_R, cap1=G_LENS_R)   # проблесковый
    zt = g.FZ1 - 0.12; drop(b, P3(g.FTE(zt) - 0.02, 0.0, zt), -AFT, 0.032, 0.15, G_LENS_W, 12)
    for sx in (1, -1): drop(b, P3(g.g_le(g.GLOVE['tip'][1] - 0.15) + 0.06, sx * (g.GLOVE['tip'][1] - 0.15), g.WZ), AFT, 0.028, 0.18, G_LENS_G if sx > 0 else G_LENS_R)     # огни на кромке наплыва
    for sx in (1, -1):                                                            # заборники охлаждения на спине за фонарём (03)
        p, n = hit(P3(9.6, sx * 0.45, 6.0), Vector((0, 0, -1))); bx(b, p + n * 0.04, 0.08, 0.20, 0.04, G_SKIN); bx(b, p + n * 0.04 + Vector((0, 0.20, 0)), 0.07, 0.005, 0.03, G_DARK)
    return b.finish('det_ext', sharp_deg=38)


def all_details(skin, cans):
    c = cock_cavity(); _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
    out = [cockpit()]
    fr, cfrs = canopy_frames(cans); out.append(fr)
    import bpy; bpy.context.view_layer.update()
    for cfr, can in zip(cfrs, cans): mw = cfr.matrix_world.copy(); cfr.parent = can; cfr.matrix_world = mw; out.append(cfr)
    out += airbrake() + pylons() + [details()]
    return out
