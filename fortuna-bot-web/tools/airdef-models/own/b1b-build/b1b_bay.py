# b1b_bay.py - три отсека вооружения B-1B по низу фюзеляжа (передний, средний, задний): вырез, нутро (потолок со шпангоутами, стенки, балки с замками),
# створки на продольных петлях у наружных кромок (по две на отсек), съёмная перегородка между передним и средним отсеком (на B-1B она переставляется:
# без неё два отсека дают один длинный - для крылатых ракет). Точки подвески - низ замков; порядок для mirror(): индекс 3 заполняется первым.
import math
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B
import b1b_geo as g

BAYS = [(11.00, 15.70), (15.92, 20.62), (26.00, 30.70)]         # передний, средний, задний (a)
BW = 1.20                                                       # полуширина
CEIL = -1.55                                                    # потолок
RACK_Z = -1.80                                                  # низ замков: точка подвески
RACK_X = 0.45
ST = {3: (18.27, 0.45), 2: (13.35, 0.45), 1: (28.35, 0.42), 0: (28.35, 0.92)}   # индекс mirror() -> (a, |x|): 3 - середина среднего отсека (заполняется первым); в заднем - один ряд из четырёх
ST_A = {k: v[0] for k, v in ST.items()}
RACKS = {0: (0.45,), 1: (0.45,), 2: (0.42, 0.92)}               # балки-держатели по отсекам (|x|)
SK = {}


def ready(host):
    me = host.data; SK['t'] = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])


def belly(a, x):
    """Точка низа обшивки (луч снизу вверх)."""
    h = SK['t'].ray_cast(Vector((x, g.Yb(a), -8.0)), Vector((0, 0, 1)))
    return h[0] if h[0] is not None else Vector((x, g.Yb(a), -3.1))


def cuts():
    out = []
    for a0, a1 in ((BAYS[0][0], BAYS[1][1]), BAYS[2]):                # передний и средний - одна полость, между ними съёмная перегородка
        r = 0.06; pts = [(-BW + r, -3.9), (BW - r, -3.9), (BW, -3.9 + r), (BW, CEIL - r), (BW - r, CEIL), (-BW + r, CEIL), (-BW, CEIL - r), (-BW, -3.9 + r)]
        b = B(); b.loft([[g.P3(a, x, z) for x, z in pts] for a in (a0, a1)], g.G_COCK, cap0=g.G_COCK, cap1=g.G_COCK); out.append(b.finish('c_bay', sharp_deg=30))
    return out


def _box(b, a0, a1, x0, x1, z0, z1, mat=g.G_COCK):
    rg = lambda a: [g.P3(a, x0, z0), g.P3(a, x1, z0), g.P3(a, x1, z1), g.P3(a, x0, z1)]
    b.loft([rg(a0), rg(a1)], mat, cap0=mat, cap1=mat)


def _strut(b, p0, p1, r, mat=g.G_METAL, n=10):
    d = (p1 - p0).normalized(); u = d.orthogonal().normalized(); v = d.cross(u)
    rg = lambda c: [c + (u * math.cos(2 * math.pi * q / n) + v * math.sin(2 * math.pi * q / n)) * r for q in range(n)]
    b.loft([rg(p0), rg(p1)], mat, cap0=mat, cap1=mat)


def inner():
    """Нутро всех отсеков: шпангоуты потолка и стенок, стрингеры, торцевые стенки, по две балки-держателя с замками, гидроцилиндры створок."""
    b = B()
    for bi, (a0, a1) in enumerate(BAYS):
        zw = lambda a_, x_: belly(a_, x_).z + 0.04                # низ стенки - на 4 см выше местной обшивки
        for a_ in g.stations(a0 + 0.12, a1 - 0.12, 0.58):
            _box(b, a_ - 0.035, a_ + 0.035, -BW + 0.005, BW - 0.005, CEIL - 0.10, CEIL - 0.005)
            for sg in (1, -1):
                xs = sorted((sg * (BW - 0.10), sg * (BW - 0.005))); _box(b, a_ - 0.035, a_ + 0.035, xs[0], xs[1], zw(a_, sg * BW), CEIL - 0.05)
        for z_ in (-2.70, -2.20):
            for sg in (1, -1):
                xs = sorted((sg * (BW - 0.065), sg * (BW - 0.005))); _box(b, a0 + 0.05, a1 - 0.05, xs[0], xs[1], z_ - 0.03, z_ + 0.03)
        for x_ in (-0.85, -0.20, 0.20, 0.85): _box(b, a0 + 0.05, a1 - 0.05, x_ - 0.025, x_ + 0.025, CEIL - 0.13, CEIL - 0.06)
        for k in range(8):                                         # торцевые стенки полосами: низ каждой - по обшивке у её наружного края; между передним и средним - перегородка
            x0_, x1_ = -BW + 0.005 + (2 * BW - 0.01) * k / 8, -BW + 0.005 + (2 * BW - 0.01) * (k + 1) / 8; xo = x0_ if abs(x0_) > abs(x1_) else x1_
            if bi != 1: _box(b, a0 + 0.005, a0 + 0.06, x0_, x1_, zw(a0 + 0.03, xo), CEIL - 0.005)
            if bi != 0: _box(b, a1 - 0.06, a1 - 0.005, x0_, x1_, zw(a1 - 0.03, xo), CEIL - 0.005)
        for sg, rx in [(sg_, rx_) for sg_ in (1, -1) for rx_ in RACKS[bi]]:
            xb = sg * rx
            _box(b, a0 + 0.20, a1 - 0.20, xb - 0.07, xb + 0.07, RACK_Z + 0.075, CEIL - 0.13, g.G_METAL)          # балка
            _box(b, a0 + 0.20, a1 - 0.20, xb - 0.09, xb + 0.09, RACK_Z + 0.050, RACK_Z + 0.075, g.G_DARK)        # полка
            for ia, (ac, sx_) in ST.items():
                if not a0 < ac < a1 or abs(sx_ - rx) > 0.01: continue
                for da in (-0.178, 0.178): _box(b, ac + da - 0.05, ac + da + 0.05, xb - 0.035, xb + 0.035, RACK_Z, RACK_Z + 0.05, g.G_METAL)   # замки парами (14 дюймов)
                for da in (-0.62, 0.62): _box(b, ac + da - 0.022, ac + da + 0.022, xb - 0.08, xb + 0.08, RACK_Z - 0.05, RACK_Z + 0.05, g.G_DARK)   # упоры-качалки
            if rx != RACKS[bi][-1]: continue
            for a_ in (a0 + 0.8, (a0 + a1) / 2, a1 - 0.8):           # гидроцилиндры створок
                p0 = g.P3(a_, sg * (BW - 0.055), CEIL - 0.20); p1 = g.P3(a_, sg * (BW - 0.055), -2.55); _strut(b, p0, p1, 0.035); _strut(b, p1, p1 + Vector((0, 0, -0.30)), 0.020)   # у стенки: путь бомб свободен
    return b.finish('det_bay', sharp_deg=30)


def bulkhead():
    """Съёмная перегородка между передним и средним отсеком (для длинного груза её переставляют/снимают)."""
    a0 = BAYS[0][1]; a1 = BAYS[1][0]; b = B()
    for k in range(8):
        x0_, x1_ = -BW + 0.01 + (2 * BW - 0.02) * k / 8, -BW + 0.01 + (2 * BW - 0.02) * (k + 1) / 8; xo = x0_ if abs(x0_) > abs(x1_) else x1_
        _box(b, a0 - 0.01, a1 + 0.01, x0_, x1_, belly((a0 + a1) / 2, xo).z + 0.05, CEIL - 0.005, g.G_COCK)
    for x_ in (-0.8, 0.0, 0.8): _box(b, a0 - 0.05, a1 + 0.05, x_ - 0.03, x_ + 0.03, belly((a0 + a1) / 2, x_ + 0.04 * (1 if x_ >= 0 else -1)).z + 0.07, CEIL - 0.02, g.G_METAL)
    return b.finish('bay_bulkhead', sharp_deg=30)


def _patch(name, outline, nu, nv, th=0.030):
    """Плита по низу обшивки: outline(u, v) -> (a, x), точки лучом на обшивку."""
    grid = [[belly(*outline(i / nu, j / nv)) for i in range(nu + 1)] for j in range(nv + 1)]
    b = B(); bm = b.bm; n_ = Vector((0, 0, -1))
    tv = [[bm.verts.new(p + n_ * 0.002) for p in row] for row in grid]; lv = [[bm.verts.new(p - n_ * th) for p in row] for row in grid]
    def f(vs, m=g.G_SKIN): q = bm.faces.new(vs); q.material_index = m
    for j in range(nv):
        for i in range(nu): f((tv[j][i], tv[j + 1][i], tv[j + 1][i + 1], tv[j][i + 1])); f((lv[j][i], lv[j][i + 1], lv[j + 1][i + 1], lv[j + 1][i]), g.G_COCK)
    for i in range(nu):
        f((tv[0][i], tv[0][i + 1], lv[0][i + 1], lv[0][i])); f((tv[nv][i + 1], tv[nv][i], lv[nv][i], lv[nv][i + 1]))
    for j in range(nv):
        f((tv[j + 1][0], tv[j][0], lv[j][0], lv[j + 1][0])); f((tv[j][nu], tv[j + 1][nu], lv[j + 1][nu], lv[j][nu]))
    import bmesh
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return b.finish(name, sharp_deg=30)


def doors():
    """Створки: по две на отсек, петля у наружной кромки (ось вдоль низа обшивки), плюс - внутренняя кромка вниз. Рёбра изнутри - дочерние."""
    out = []
    for bi, (a0, a1) in enumerate(BAYS):
        for sx in (1, -1):
            nm = f'bay{bi + 1}_{"r" if sx > 0 else "l"}'
            ob = _patch(nm, lambda u, v: (a0 + 0.010 + (a1 - a0 - 0.020) * v, sx * (0.006 + (BW - 0.012) * u)), 10, 20)
            e0 = belly(a0 + 0.02, sx * BW); e1 = belly(a1 - 0.02, sx * BW); dd = (e1 - e0).normalized(); sag = 0.0
            for a_ in g.stations(a0 + 0.02, a1 - 0.02, 0.25):           # провис кромки под хордой e0-e1: ось ниже самой низкой точки кромки
                p_ = belly(a_, sx * BW); q_ = e0 + dd * (p_ - e0).dot(dd); sag = min(sag, p_.z - q_.z)
            pivot = (e0 + e1) / 2 + Vector((-sx * 0.004, 0, sag - 0.006)); ax = dd.copy()   # ось у нижнего наружного угла: створка уходит вниз и внутрь, толщиной в обшивку не заходит
            test = belly((a0 + a1) / 2, sx * 0.3) - pivot; rot = Matrix.Rotation(math.radians(60), 3, ax) @ test
            if rot.z > test.z: ax = -ax                                         # знак по числу: при плюсе свободная кромка идёт вниз
            g._rel(ob, pivot)
            rb = B()
            for a_ in g.stations(a0 + 0.35, a1 - 0.35, 0.80):
                zb = belly(a_, sx * 0.6).z + 0.03
                rb.loft([[g.P3(a_ + da, sx * 0.06, zb) - pivot, g.P3(a_ + da, sx * (BW - 0.12), zb) - pivot, g.P3(a_ + da, sx * (BW - 0.12), zb + 0.05) - pivot, g.P3(a_ + da, sx * 0.06, zb + 0.05) - pivot] for da in (-0.018, 0.018)],
                        g.G_COCK, cap0=g.G_COCK, cap1=g.G_COCK)
            rib = rb.finish(nm + '_ribs', sharp_deg=30); rib.parent = ob; rib.matrix_parent_inverse = Matrix.Identity(4); rib.location = (0, 0, 0)
            g.PARTS[nm] = dict(pivot=pivot.copy(), axis=ax.copy(), range=(0.0, 92.0), note=f'створка отсека {bi + 1}: петля у наружной кромки, ось вдоль низа обшивки; плюс - внутренняя кромка вниз; рёбра {nm}_ribs - дочерний объект')
            out += [ob, rib]
    return out


def stations_fill():
    for i, (a, x_) in ST.items():
        for sg, n in ((1, 'r'), (-1, 'l')):
            g.STATIONS['st%d_%s' % (i, n)] = g.P3(a, sg * x_, RACK_Z)
