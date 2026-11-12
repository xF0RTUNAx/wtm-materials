# b1b_cock.py - кабина B-1B: стёкла по обшивке (фото 05, 08, 09, 11), рамы, вырез, кресла и приборные доски, люки катапульт сверху (фото 01, 04).
# Окна задаются в координатах (a, phi): phi - угол луча в сечении от верха (0) к правому борту (90°) из центра сечения; точка - пересечение луча с обшивкой.
import math
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from modelkit import B
import b1b_geo as g

SK = {}


def skin_ready(host):
    me = host.data; SK['t'] = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])


def cz(a):
    zt, zb = g.FT[0](a), g.FT[1](a); return zb + (zt - zb) * 0.42


def hit(a, phi):
    """Точка обшивки и нормаль по лучу из центра сечения (a), угол phi в градусах (0 - вверх, 90 - вправо, -90 - влево)."""
    c = g.P3(a, 0.0, cz(a)); d = Vector((math.sin(math.radians(phi)), 0.0, math.cos(math.radians(phi))))
    o = c + d * 6.0; h = SK['t'].ray_cast(o, -d)
    if h[0] is None: return c, d
    return h[0], h[1]


def _round_uv(u, v, r=0.18):
    """Квадрат [0,1]² -> скруглённый (суперэллипс): точки края подтягиваются в углах."""
    x, y = 2 * u - 1, 2 * v - 1; n = 2 + 10 * (1 - r)
    m = max(abs(x), abs(y))
    if m < 1e-9: return u, v
    k = (abs(x) ** n + abs(y) ** n) ** (1 / n) / m
    return (x / k + 1) / 2, (y / k + 1) / 2


def window_grid(quad, nu=10, nv=8, r=0.25):
    """quad - четыре угла (a, phi): низ-перёд, низ-зад, верх-зад, верх-перёд; билинейно, края скруглены."""
    (a0, p0), (a1, p1), (a2, p2), (a3, p3) = quad; rows = []
    for j in range(nv + 1):
        row = []
        for i in range(nu + 1):
            u, v = _round_uv(i / nu, j / nv, r)
            a = (a0 * (1 - u) + a1 * u) * (1 - v) + (a3 * (1 - u) + a2 * u) * v
            ph = (p0 * (1 - u) + p1 * u) * (1 - v) + (p3 * (1 - u) + p2 * u) * v
            row.append(hit(a, ph))
        rows.append(row)
    return rows


def _slab(b, rows, d_out, d_in, mat):
    """Плита из сетки точек обшивки: наружу d_out, внутрь d_in вдоль нормали."""
    bm = b.bm; nv = len(rows) - 1; nu = len(rows[0]) - 1
    tv = [[bm.verts.new(p + n * d_out) for p, n in row] for row in rows]; lv = [[bm.verts.new(p - n * d_in) for p, n in row] for row in rows]
    for j in range(nv):
        for i in range(nu):
            f = bm.faces.new((tv[j][i], tv[j][i + 1], tv[j + 1][i + 1], tv[j + 1][i])); f.material_index = mat
            f = bm.faces.new((lv[j][i], lv[j + 1][i], lv[j + 1][i + 1], lv[j][i + 1])); f.material_index = mat
    ring = [(0, i) for i in range(nu)] + [(j, nu) for j in range(nv)] + [(nv, i) for i in range(nu, 0, -1)] + [(j, 0) for j in range(nv, 0, -1)]
    for k in range(len(ring)):
        (j0, i0), (j1, i1) = ring[k], ring[(k + 1) % len(ring)]
        f = bm.faces.new((tv[j0][i0], lv[j0][i0], lv[j1][i1], tv[j1][i1])); f.material_index = mat


# Окна правого борта (левый - зеркально): (a, phi) по фото 05 и 11; передние стёкла сходятся к средней стойке.
WINDOWS = {
    'front':  [(5.62, 4.0), (5.62, 44.0), (6.52, 40.0), (6.62, 4.5)],          # лобовое: низ впереди, верх сзади
    'side1':  [(5.95, 47.0), (6.10, 76.0), (6.95, 74.0), (6.72, 43.5)],         # боковое переднее
    'side2':  [(7.20, 50.0), (7.25, 74.0), (7.98, 74.0), (7.95, 50.0)],         # боковое окно за ним
}
HATCH = [(9.05, 7.0), (9.05, 30.0), (10.05, 30.0), (10.05, 7.0)]                # люк катапульты задних членов экипажа
HATCH_F = [(6.95, 5.0), (6.95, 28.0), (7.85, 27.0), (7.85, 5.0)]                # люки лётчиков (над стеклом, крыша кабины)


def _mir(q): return [(a, -p) for a, p in reversed(q)]


def glass():
    b = B()
    for nm, q in WINDOWS.items():
        for qq in (q, _mir(q)):
            rows = window_grid(qq, 12, 9, 0.22 if nm != 'front' else 0.10)
            _slab(b, [[(p - n * 0.020, n) for p, n in row] for row in rows], 0.004, 0.004, g.G_GLASS)
    return b.finish('canopy_glass', sharp_deg=60)


def window_cuts():
    out = []
    for nm, q in WINDOWS.items():
        for qq in (q, _mir(q)):
            b = B(); rows = window_grid(qq, 12, 9, 0.22 if nm != 'front' else 0.10); _slab(b, rows, 0.25, 0.05, g.G_COCK); out.append(b.finish('c_win', sharp_deg=30))
    return out


def frames():
    """Рамы окон: кольцо 3 см над обшивкой вокруг каждого стекла (замкнутое), средняя стойка лобового."""
    b = B()
    for nm, q in WINDOWS.items():
        for qq in (q, _mir(q)):
            rows = window_grid(qq, 12, 9, 0.22 if nm != 'front' else 0.10)
            edge = [rows[0][i] for i in range(len(rows[0]))] + [rows[j][-1] for j in range(1, len(rows))] + [rows[-1][i] for i in range(len(rows[0]) - 2, -1, -1)] + [rows[j][0] for j in range(len(rows) - 2, 0, -1)]
            ctr = sum((p for p, _ in edge), Vector()) / len(edge)
            ring = []
            for p, n in edge:
                o = (p - ctr); o = (o - n * o.dot(n)).normalized()
                ring.append([p - n * 0.03 - o * 0.002, p + n * 0.010 - o * 0.002, p + n * 0.010 + o * 0.045, p - n * 0.01 + o * 0.060])
            rs = [[r[k] for r in ring] for k in range(4)]
            b.bm.verts.ensure_lookup_table()
            bm = b.bm; vs = [[bm.verts.new(p) for p in r] for r in rs]; m = len(ring)
            for k in range(4):
                for i in range(m):
                    f = bm.faces.new((vs[k][i], vs[k][(i + 1) % m], vs[(k + 1) % 4][(i + 1) % m], vs[(k + 1) % 4][i])); f.material_index = g.G_SKIN
    return b.finish('canopy_frame', sharp_deg=40)


def hatches():
    """Крышки люков катапульт: плиты 6 мм над обшивкой с фаской (на будущее - отдельные объекты hatch_*)."""
    out = []
    for i, q in enumerate((HATCH_F, HATCH)):
        for s, qq in (('r', q), ('l', _mir(q))):
            b = B(); rows = window_grid(qq, 10, 8, 0.12); _slab(b, rows, 0.008, 0.012, g.G_SKIN)
            ob = b.finish(f'hatch_{"f" if i == 0 else "a"}_{s}', sharp_deg=30); out.append(ob)
    return out


COCK_A0, COCK_A1 = 5.40, 10.40


def cock_cut():
    """Вырез кабины внутри фюзеляжа: сечение фюзеляжа, ужатое на 10 см внутрь, пол срезан плоско."""
    rs = []; n = 64
    for a in g.stations(COCK_A0, COCK_A1, 0.10):
        zt, zb, hw, nt, nb = [t(a) for t in g.FT]; cz_ = (zt + zb) / 2; h = (zt - zb) / 2 - 0.10; w = hw - 0.10
        floor = max(zb + 0.55, zt - 0.08 - 1.75); rg = []
        for k in range(n):
            th = -math.pi / 2 + 2 * math.pi * k / n; c, s_ = math.cos(th), math.sin(th); e = nt if s_ > 0 else nb
            x = w * math.copysign(abs(c) ** (2 / e), c); z = cz_ + h * math.copysign(abs(s_) ** (2 / e), s_)
            rg.append(g.P3(a, x, max(z, floor)))
        rs.append(rg)
    b = B(); b.loft(rs, g.G_COCK, cap0=g.G_COCK, cap1=g.G_COCK); return b.finish('c_cock', sharp_deg=25)


def _box(b, c, hx, ha, hz, mat=g.G_COCK):
    rg = lambda y: [c + Vector((-hx, y, -hz)), c + Vector((hx, y, -hz)), c + Vector((hx, y, hz)), c + Vector((-hx, y, hz))]
    b.loft([rg(-ha), rg(ha)], mat, cap0=mat, cap1=mat)


def interior():
    """Четыре кресла (два лётчика, два оператора), приборные доски с экранами, ручки."""
    b = B()
    for a_seat, x_seat in ((6.95, 0.48), (6.95, -0.48), (9.55, 0.52), (9.55, -0.52)):
        floor = max(g.FT[1](a_seat) + 0.55, g.FT[0](a_seat) - 0.08 - 1.75)
        c = g.P3(a_seat, x_seat, floor)
        _box(b, c + Vector((0, 0, 0.32)), 0.25, 0.25, 0.06)                       # сиденье
        _box(b, c + Vector((0, -0.24, 0.80)), 0.26, 0.07, 0.50)                   # спинка
        _box(b, c + Vector((0, -0.20, 1.36)), 0.15, 0.10, 0.14)                   # заголовник
        _box(b, c + Vector((0.18, -0.12, 0.52)), 0.03, 0.10, 0.12, g.G_DARK)      # ручки катапульты
        _box(b, c + Vector((-0.18, -0.12, 0.52)), 0.03, 0.10, 0.12, g.G_DARK)
        for dx in (-0.09, 0.09): _box(b, c + Vector((dx, -0.16, 0.95)), 0.03, 0.012, 0.42, g.G_RADOME)   # ремни
    for a_p, z_up in ((5.95, 0.72), (8.85, 0.85)):
        floor = max(g.FT[1](a_p) + 0.55, g.FT[0](a_p) - 0.08 - 1.75); w = g.FT[2](a_p) - 0.16
        _box(b, g.P3(a_p, 0.0, floor + z_up), w, 0.10, 0.24)                      # приборная доска
        for xs in (-0.75, -0.25, 0.25, 0.75):
            if abs(xs) < w - 0.1: _box(b, g.P3(a_p - 0.11, xs, floor + z_up + 0.04), 0.17, 0.008, 0.13, g.G_DARK)   # экраны
    return b.finish('cockpit_int', sharp_deg=30)
