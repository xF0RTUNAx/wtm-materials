# f100_detail.py - детали F-100D поверх формы f100_geo.py: разделка обшивки геометрией (канавки), крышки люков, ниши шасси и щитка, кабина, нутро сопла, пушки, штанги, антенны, замки пилонов.
# Мелочь (префикс det_) - отдельные объекты.
import math
import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from modelkit import B
import f100_geo as g
from f100_geo import P3, Yb, Z, Track, strut, _drop, _apply_bool, loft_obj, sup, G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_DUCT

G_STRAP, G_SCREEN = 6, 7
G_BELT, G_HANDLE = G_SCREEN + 1, G_SCREEN + 2
G_SEAM = 10


def ray(a, x, side, z=None):
    """Точка обшивки: side 'top'/'bot' - луч сверху/снизу над (a, x); 'r'/'l' - сбоку на уровне z (y мира)."""
    t = g.BVH['t']; y = Yb(a)
    if side == 'top': h = t.ray_cast(Vector((x, y, 4.0)), Vector((0, 0, -1)))
    elif side == 'bot': h = t.ray_cast(Vector((x, y, -4.0)), Vector((0, 0, 1)))
    elif side == 'r': h = t.ray_cast(Vector((1.2, y, z)), Vector((-1, 0, 0)))
    else: h = t.ray_cast(Vector((-1.2, y, z)), Vector((1, 0, 0)))
    return h[0], h[1]


def groove_obj(points, side, w=0.0055, d=0.0055, step=0.09, name='c_gr'):
    """Режущая V-канавка вдоль линии на обшивке: стенки в цвет обшивки, чёрного дна нет. Точки (a, x) для top/bot, (a, y) для r/l."""
    samples = []
    for (p0, p1) in zip(points, points[1:]):
        L_ = math.hypot(p1[0] - p0[0], p1[1] - p0[1]); n = max(1, int(L_ / step))
        for i in range(n): samples.append((p0[0] + (p1[0] - p0[0]) * i / n, p0[1] + (p1[1] - p0[1]) * i / n))
    samples.append(points[-1])
    rings = []; N = len(samples)
    for i, (a, q) in enumerate(samples):
        hit, nrm = ray(a, q, side, z=q) if side in ('r', 'l') else ray(a, q, side)
        if hit is None: continue
        a0, q0 = samples[max(i - 1, 0)]; a1, q1 = samples[min(i + 1, N - 1)]
        if side in ('top', 'bot'): tang = Vector((q1 - q0, -(a1 - a0), 0.0))
        else: tang = Vector((0.0, -(a1 - a0), q1 - q0))
        if tang.length < 1e-6: continue
        tang.normalize(); n_ = nrm.normalized(); s = tang.cross(n_)
        if s.length < 1e-4: continue
        s = s.normalized(); k = min(1.0, min(i, N - 1 - i) / 1.0 + 0.25)
        rings.append([hit - n_ * d * k, hit + n_ * 0.02 + s * (w + 0.02 * w / d), hit + n_ * 0.02 - s * (w + 0.02 * w / d)])
    if len(rings) < 2: return None
    b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish(name, sharp_deg=20)


def box_cut(a0, a1, q0, q1, side, depth=0.025, name='c_box'):
    """Выемка: решётка, лючок. Прямоугольник по лучам на обшивку."""
    rings = []
    for a in (a0, a1):
        ring = []
        for q in (q0, q1):
            hit, nrm = ray(a, q, side, z=q) if side in ('r', 'l') else ray(a, q, side)
            if hit is None: return None
            ring.append((hit, nrm.normalized()))
        rings.append(ring)
    pts = [rings[0][0], rings[0][1], rings[1][1], rings[1][0]]; n_ = (pts[0][1] + pts[2][1]).normalized()
    b = B(); b.loft([[p - n_ * depth for p, _ in pts], [p + n_ * 0.03 for p, _ in pts]], G_DARK, cap0=G_DARK, cap1=G_DARK)
    return b.finish(name, sharp_deg=20)


def ring_groove(a, w=0.0055, d=0.0055):
    """Кольцевой шов на фюзеляже: V-канавка в цвет обшивки."""
    top, bot, hw, nt, nb = [t(a) for t in g.FT]; cy = (top + bot) / 2
    def scaled(a_, k): return sup(a_, 0.0, cy + (top - cy) * k, cy + (bot - cy) * k, hw * k, nt, nb, 72)
    k0 = 1 - d / max(hw, 0.2); k1 = 1.05; ww = w * (1 + (k1 - 1) * hw / d)
    rs = [scaled(a, k0), scaled(a + ww, k1), scaled(a - ww, k1)]; rs.append(rs[0])
    b = B(); b.loft(rs, G_SKIN); bmesh.ops.remove_doubles(b.bm, verts=b.bm.verts[:], dist=1e-6)
    return b.finish('c_ring', sharp_deg=20)


def rrect_line(a0, a1, q0, q1, r=0.025):
    return [(a0 + r, q0), (a1 - r, q0), (a1, q0 + r), (a1, q1 - r), (a1 - r, q1), (a0 + r, q1), (a0, q1 - r), (a0, q0 + r), (a0 + r, q0)]


# линии разделки по f100_04, 06, 07: длинные швы V-канавкой вдоль кромок и лонжеронов, крышки плитами. (a, x) или (a, z). Не сеткой.
_LE = lambda x: float(g.LE0(x))
TOP_LINES = [
    [(_LE(1.30) + 0.80, 1.30), (_LE(5.30) + 0.32, 5.30)],                                   # передний лонжерон, за предкрылком
    [(float(g.HINGE_I(1.10)) - 0.14, 1.10), (float(g.HINGE_I(2.35)) - 0.14, 2.35)],         # перед закрылком
    [(float(g.HINGE_O(2.60)) - 0.12, 2.60), (float(g.HINGE_O(4.00)) - 0.12, 4.00)],         # перед элероном
    [(5.30, 0.56), (9.00, 0.56)],                                                           # вдоль гаргрота
    rrect_line(5.90, 6.50, 0.44, 0.70), rrect_line(_LE(2.2) + 1.15, _LE(2.2) + 1.55, 2.05, 2.40),
]
BOT_LINES = [
    [(1.30, 0.30), (2.90, 0.34)], [(8.60, 0.40), (10.00, 0.36)],                            # низ фюзеляжа
    [(_LE(2.20) + 0.70, 2.20), (_LE(5.30) + 0.32, 5.30)],                                   # низ крыла
    rrect_line(8.75, 9.15, 0.10, 0.32), rrect_line(9.45, 9.80, 0.08, 0.26),
]
SIDE_PANELS = [
    [(0.60, 0.050), (1.95, 0.250)],
    rrect_line(1.15, 1.75, 0.020, 0.260),                                                    # люк пушечного отсека
    [(5.30, 0.450), (9.20, 0.450)], rrect_line(6.20, 6.80, 0.050, 0.300),
    [(9.60, 0.600), (11.20, 0.450)],
    rrect_line(10.45, 11.05, 0.000, 0.300),
]
RINGS_FORE = (0.550, 2.050, 10.150, 11.750, 12.600)


def carve(host):
    """Длинные швы V-канавками, кольцевые швы, решётки на хвосте, пушечные жёлоба. Крышки ставит plates()."""
    n = 0
    def apply(c):
        nonlocal n
        if c is None: return
        _apply_bool(host, c, 'DIFFERENCE'); _drop(c); n += 1
    closed = lambda L_: len(L_) >= 5 and L_[0] == L_[-1]
    for sg in (1, -1):
        sd = 'r' if sg > 0 else 'l'
        for L_ in TOP_LINES:
            if not closed(L_): apply(groove_obj([(a, sg * x) for a, x in L_], 'top'))
        for L_ in BOT_LINES:
            if not closed(L_): apply(groove_obj([(a, sg * x) for a, x in L_], 'bot'))
        for L_ in SIDE_PANELS:
            if not closed(L_): apply(groove_obj(L_, sd))
        for i_ in range(4):                                     # решётка охлаждения на борту хвоста
            z_ = 0.12 + i_ * 0.045; apply(box_cut(11.86, 12.18, z_, z_ + 0.024, sd, 0.016))
        apply(gun_cut(sg))
    for a in RINGS_FORE: apply(ring_groove(a))
    return n


# ── пушки: по две с борта под кабиной, жёлоба выходят вперёд (f100_04, 01) ──
GUNS = ((1.600, 0.445, -0.500), (1.850, 0.580, -0.400))         # (a дульного среза, x, z)


def gun_cut(sg):
    b = B(); n = 14
    for a_m, x, y in GUNS:
        rg = lambda a, r: [P3(a, sg * x + r * math.cos(2 * math.pi * q / n), y + r * 0.9 * math.sin(2 * math.pi * q / n)) for q in range(n)]
        b.loft([rg(a_m - 0.55, 0.045), rg(a_m - 0.25, 0.045), rg(a_m + 0.05, 0.042), rg(a_m + 0.10, 0.036)], G_DARK, cap0=G_DARK, cap1=G_DARK)
    return b.finish('c_gun', sharp_deg=30)


def guns():
    b = B(); n = 12
    for sg in (1, -1):
        for a_m, x, y in GUNS:
            c0 = P3(a_m + 0.07, sg * (x - 0.02), y); c1 = P3(a_m - 0.02, sg * (x - 0.02), y)
            strut(b, c0, c1, 0.018, G_DARK, n); strut(b, c0, c0 + Vector((0, -0.10, 0)), 0.026, G_METAL, n)
    return b.finish('det_guns', sharp_deg=40)



def plates():
    """Крышки люков: плиты на обшивке, 7 мм над ней, с фаской. Закрытые контуры из таблиц, на обеих сторонах."""
    b = B(); lift, ch = 0.007, 0.014
    def plate(L_, side, sg):
        pts = []
        for p0, p1 in zip(L_, L_[1:]):
            n = max(1, int(math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 0.05))
            for i in range(n): pts.append((p0[0] + (p1[0] - p0[0]) * i / n, p0[1] + (p1[1] - p0[1]) * i / n))
        ac = sum(p[0] for p in pts) / len(pts); qc = sum(p[1] for p in pts) / len(pts)
        def at(a, q):
            if side in ('r', 'l'): return ray(a, q, side, z=q)
            return ray(a, sg * q, side)
        o, m = [], []
        for a, q in pts:
            da, dq = ac - a, qc - q; ln = math.hypot(da, dq)
            h0, n0 = at(a, q); h1, n1 = at(a + da / ln * ch, q + dq / ln * ch)
            if h0 is None or h1 is None: return False
            o.append(h0 - n0.normalized() * 0.004); m.append(h1 + n1.normalized() * lift)
        rings = [o, m]
        for k in (0.45, 0.85):
            r_ = []
            for a, q in pts:
                ai, qi = a + (ac - a) * k, q + (qc - q) * k; h_, n_ = at(ai, qi)
                if h_ is None: return False
                r_.append(h_ + n_.normalized() * lift)
            rings.append(r_)
        b.loft(rings, G_SKIN, cap1=G_SKIN, cap0=G_SKIN); return True
    n = 0
    for sg in (1, -1):
        sd = 'r' if sg > 0 else 'l'
        for lst, side in ((TOP_LINES, 'top'), (BOT_LINES, 'bot'), (SIDE_PANELS, sd)):
            for L_ in lst:
                if len(L_) >= 5 and L_[0] == L_[-1]: n += 1 if plate(L_, side, sg) else 0
    print('плит-крышек', n)
    return b.finish('F100_skin_plates', sharp_deg=28)


def smooth_normals(host, ref_me):
    """Обшивка освещается как гладкая: нормаль угла берётся с поверхности до резки; стенки канавок, ниш, каналов остаются резкими."""
    ref_me.calc_loop_triangles(); tris = ref_me.loop_triangles; V = ref_me.vertices; CN = ref_me.corner_normals; me = host.data
    tv = [t.vertices[:] for t in tris]; tn = [[CN[l].vector.copy() for l in t.loops] for t in tris]
    bvh = BVHTree.FromPolygons([v.co.copy() for v in V], tv)
    def src(p):
        h = bvh.find_nearest(p)
        if h[0] is None: return None, 9.0
        i = h[2]; a_, b_, c_ = [V[k].co for k in tv[i]]; q = h[0]; v0, v1, v2 = b_ - a_, c_ - a_, q - a_
        d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1); den = d00 * d11 - d01 * d01
        if abs(den) < 1e-14: return tn[i][0], h[3]
        w1 = (d11 * d20 - d01 * d21) / den; w2 = (d00 * d21 - d01 * d20) / den; w0 = 1 - w1 - w2
        return (tn[i][0] * w0 + tn[i][1] * w1 + tn[i][2] * w2).normalized(), h[3]
    out = [Vector((0, 0, 1))] * len(me.loops); walls = 0; lim = math.cos(math.radians(28)); M = me.vertices; L = me.loops
    for p in me.polygons:
        pn = p.normal.copy(); n0, dist = src(p.center)
        if n0 is None or dist > 0.0035 or pn.dot(n0) < lim:
            walls += 1
            for li in p.loop_indices: out[li] = pn
            continue
        for li in p.loop_indices:
            n_, d_ = src(M[L[li].vertex_index].co)
            out[li] = n_ if (n_ is not None and d_ < 0.006 and n_.dot(pn) > 0.55) else n0
    for p in me.polygons: p.use_smooth = True
    me.normals_split_custom_set([n[:] for n in out])
    return f'граней {len(me.polygons)}, резких стенок {walls}'


def bays(host):
    a0, a1, hw = g.NOSE_BAY
    rings = [[P3(a, -hw, g.FLOOR - 0.06), P3(a, hw, g.FLOOR - 0.06), P3(a, hw, -1.5), P3(a, -hw, -1.5)] for a in (a0, a1)]
    c = loft_obj('c_bay', rings, G_DUCT, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    a0, a1, x0, xm, x1 = g.MAIN_BAY
    for sx in (1, -1):
        rings = [[P3(a, sx * x0, g.wy(x0) + 0.05), P3(a, sx * x1, g.wy(x1) + 0.05), P3(a, sx * x1, -1.5), P3(a, sx * x0, -1.5)] for a in (a0, a1)]
        c = loft_obj('c_bay', rings, G_DUCT, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    a0, a1, hw = g.BRK
    yb = g.fore_bot(a0, 0.0)
    rings = [[P3(a, -(hw + 0.012), yb + 0.13), P3(a, hw + 0.012, yb + 0.13), P3(a, hw + 0.012, -1.5), P3(a, -(hw + 0.012), -1.5)] for a in (a0 - 0.012, a1 + 0.012)]
    c = loft_obj('c_bay', rings, G_DUCT, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)



def resharp(host, deg=38):
    bm = bmesh.new(); bm.from_mesh(host.data); lim = math.radians(deg)
    for f in bm.faces: f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2: e.smooth = e.calc_face_angle(0.0) < lim
        else: e.smooth = False
    bm.to_mesh(host.data); bm.free()


# ── кабина ──
def _box(b, a0, a1, x0, x1, y0, y1, mat=G_COCK, ch=0.0):
    p = lambda a, x, y: P3(a, x, y)
    bot0 = [p(a0, x0, y0), p(a0, x1, y0), p(a0, x1, y1 - ch), p(a0, x1 - ch, y1), p(a0, x0 + ch, y1), p(a0, x0, y1 - ch)] if ch > 0 else [p(a0, x0, y0), p(a0, x1, y0), p(a0, x1, y1), p(a0, x0, y1)]
    bot1 = [q + Vector((0, Yb(a1) - Yb(a0), 0)) for q in bot0]
    b.loft([bot0, bot1], mat, cap0=mat, cap1=mat)


def _tbox(b, c, u, v, w, hu, hv, hw_, mat=G_COCK, ch=0.25):
    e = min(hu, hv, abs(hw_)) * ch
    def ring(s, k):
        ku, kv = hu - k, hv - k
        return [c + w * s + u * (su * ku) + v * (sv * kv) for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    if e <= 0.0015: rs = [ring(-hw_, 0), ring(hw_, 0)]
    else: rs = [ring(-hw_, e), ring(-hw_ + e, 0), ring(hw_ - e, 0), ring(hw_, e)]
    b.loft(rs, mat, cap0=mat, cap1=mat)


def _rr(c, u, v, hu, hv, p=4.0, n=24):
    out = []
    for k in range(n):
        t = 2 * math.pi * k / n; ct, st = math.cos(t), math.sin(t)
        out.append(c + u * (hu * math.copysign(abs(ct) ** (2 / p), ct)) + v * (hv * math.copysign(abs(st) ** (2 / p), st)))
    return out


def _pad(b, c0, w, u, v, st, mat, p=4.0):
    b.loft([_rr(c0 + w * d_ + v * o_, u, v, hu, hv, p) for d_, hu, hv, o_ in st], mat, cap0=mat, cap1=mat)


def _seat(b, aS, floor):
    """Катапультное кресло: чаша, подушки, заголовник с парашютом, рельсы, ремни с пряжкой, рукоятка шторки над головой и кольцо."""
    X = Vector((1, 0, 0)); F = Vector((0, -1, 0)); UP = Vector((0, 0, 1)); tilt = math.radians(17)
    W = Vector((0, -math.sin(tilt), math.cos(tilt))); N = Vector((0, -math.cos(tilt), -math.sin(tilt)))
    hw = 0.235; base = P3(aS + 0.50, 0, floor + 0.26)
    _box(b, aS + 0.02, aS + 0.46, -0.17, 0.17, floor - 0.01, floor + 0.08, G_DARK, ch=0.01)          # опора кресла на полу
    _pad(b, P3(aS, 0, floor + 0.16), F, X, UP, [(0.0, hw - 0.03, 0.10, 0), (0.04, hw - 0.01, 0.14, 0), (0.46, hw, 0.15, 0), (0.50, hw - 0.02, 0.12, 0)], G_COCK)
    _pad(b, P3(aS, 0, floor + 0.325), F, X, UP, [(0.015, 0.165, 0.008, 0), (0.05, 0.195, 0.038, 0), (0.25, 0.205, 0.050, 0), (0.44, 0.200, 0.042, 0), (0.48, 0.170, 0.008, 0)], G_STRAP)
    _pad(b, base + N * 0.075, W, X, N, [(-0.08, hw - 0.02, 0.060, 0), (0.0, hw, 0.074, 0), (0.62, hw - 0.01, 0.074, 0), (0.68, hw - 0.03, 0.058, 0)], G_COCK)
    _pad(b, base - N * 0.020, W, X, N, [(0.03, 0.145, 0.006, 0), (0.07, 0.178, 0.034, 0), (0.30, 0.185, 0.044, 0), (0.54, 0.170, 0.036, 0), (0.60, 0.130, 0.006, 0)], G_STRAP)
    _pad(b, base + N * 0.060, W, X, N, [(0.64, 0.170, 0.085, 0), (0.70, 0.195, 0.115, 0), (0.92, 0.180, 0.115, 0), (0.99, 0.135, 0.075, 0)], G_COCK)
    _pad(b, base - N * 0.065, W, X, N, [(0.72, 0.070, 0.004, 0), (0.75, 0.098, 0.022, 0), (0.88, 0.098, 0.024, 0), (0.91, 0.068, 0.004, 0)], G_STRAP)
    for sg in (1, -1):
        strut(b, base + N * 0.165 + X * (sg * 0.135) - W * 0.20, base + N * 0.165 + X * (sg * 0.135) + W * 0.92, 0.021, G_METAL)
    strut(b, base + N * 0.150 - W * 0.14, base + N * 0.150 + W * 0.60, 0.038, G_COCK)
    buck = P3(aS + 0.19, 0, floor + 0.392)
    def belt(p0, p1, wd=0.020):
        d_ = p1 - p0; t_ = d_.normalized(); side = t_.cross(N if abs(t_.dot(N)) < 0.8 else X).normalized(); nor = side.cross(t_).normalized()
        if nor.dot(-N) < 0 and abs(nor.dot(N)) > 0.2: nor = -nor
        _tbox(b, (p0 + p1) / 2, side, nor, t_, wd, 0.0035, d_.length / 2, G_BELT, ch=0)
    for sg in (1, -1):
        sh = base + W * 0.64 - N * 0.058 + X * (sg * 0.080); ch_ = base + W * 0.30 - N * 0.085 + X * (sg * 0.086); wst = P3(aS + 0.36, sg * 0.060, floor + 0.415)
        belt(sh, ch_); belt(ch_, wst); belt(wst, buck + Vector((sg * 0.01, 0, 0)))
        belt(P3(aS + 0.43, sg * 0.195, floor + 0.36), buck + Vector((sg * 0.02, 0, 0)), 0.018)
        strut(b, base + W * 0.18 + N * 0.04 + X * (sg * (hw + 0.022)), base + W * 0.44 + N * 0.04 + X * (sg * (hw + 0.022)), 0.022, G_METAL)
    _tbox(b, buck, X, UP, F, 0.032, 0.006, 0.030, G_METAL, ch=0)
    belt(P3(aS + 0.015, 0, floor + 0.35), buck, 0.016)
    hp = base + W * 1.00 - N * 0.02
    for sg in (1, -1): strut(b, hp + X * (sg * 0.075), hp + X * (sg * 0.075) - N * 0.07 + W * 0.03, 0.010, G_HANDLE)
    strut(b, hp + X * 0.075 - N * 0.07 + W * 0.03, hp - X * 0.075 - N * 0.07 + W * 0.03, 0.010, G_HANDLE)
    r0 = P3(aS - 0.005, -0.055, floor + 0.235); r1 = P3(aS - 0.005, 0.055, floor + 0.235)
    strut(b, r0, r1, 0.011, G_HANDLE); strut(b, r0, P3(aS + 0.03, -0.045, floor + 0.15), 0.008, G_HANDLE); strut(b, r1, P3(aS + 0.03, 0.045, floor + 0.15), 0.008, G_HANDLE)


def _dial(b, c, u, v, w, r):
    """Круглый прибор: ободок, тёмное лицо, стрелка."""
    n = 18
    ring = lambda rr, d: [c + w * d + (u * math.cos(2 * math.pi * k / n) + v * math.sin(2 * math.pi * k / n)) * rr for k in range(n)]
    b.loft([ring(r + 0.006, 0.0), ring(r + 0.006, 0.010), ring(r, 0.010), ring(r, 0.004)], G_METAL, cap0=G_METAL, cap1=G_SCREEN)
    _tbox(b, c + w * 0.006 + u * (r * 0.35), u, v, w, r * 0.38, 0.0025, 0.0015, G_HANDLE, ch=0)


def _panel(b, aF, floor, wide=0.34):
    """Приборная доска 1950-х: наклонная плита с круглыми приборами, прицел на козырьке, тумба и педали."""
    top = floor + 0.70
    u = Vector((1, 0, 0)); tl = math.radians(14); v = Vector((0, math.sin(tl), math.cos(tl))); w = Vector((0, -math.cos(tl), math.sin(tl)))
    c = P3(aF, 0, top - 0.24); _tbox(b, c, u, v, w, wide, 0.25, 0.04, G_COCK)
    for cx, cy, r in ((-0.20, 0.10, 0.042), (-0.10, 0.10, 0.042), (0.0, 0.11, 0.050), (0.10, 0.10, 0.042), (0.20, 0.10, 0.042),
                      (-0.20, 0.00, 0.038), (-0.10, 0.00, 0.042), (0.0, -0.01, 0.050), (0.10, 0.00, 0.042), (0.20, 0.00, 0.038),
                      (-0.26, -0.10, 0.030), (-0.17, -0.10, 0.034), (0.17, -0.10, 0.034), (0.26, -0.10, 0.030), (-0.06, -0.11, 0.030), (0.06, -0.11, 0.030)):
        _dial(b, c + u * cx + v * cy + w * 0.040, u, v, w, r)
    for cx in (-0.28, -0.22, 0.22, 0.28):
        for cy in (0.18, -0.18):
            strut(b, c + u * cx + v * cy + w * 0.04, c + u * cx + v * cy + w * 0.058, 0.006, G_METAL)
    _box(b, aF - 0.10, aF + 0.03, -wide - 0.02, wide + 0.02, top, top + 0.040, G_DARK, ch=0.012)
    _box(b, aF - 0.50, aF + 0.0, -0.09, 0.09, floor, top - 0.50, G_COCK, ch=0.02)
    for sg in (1, -1):
        _tbox(b, P3(aF - 0.10, sg * 0.18, floor + 0.14), u, Vector((0, 0.5, 0.86)).normalized(), Vector((0, -0.86, 0.5)).normalized(), 0.050, 0.08, 0.012, G_METAL)
        strut(b, P3(aF - 0.10, sg * 0.18, floor + 0.10), P3(aF - 0.10, sg * 0.18, floor - 0.03), 0.012, G_METAL)
    hy = top + 0.04
    _box(b, aF - 0.06, aF + 0.12, -0.075, 0.075, hy, hy + 0.11, G_DARK, ch=0.012)
    _tbox(b, P3(aF + 0.10, 0, hy + 0.17), u, Vector((0, 0.35, 1)).normalized(), Vector((0, -1, 0.35)).normalized(), 0.070, 0.055, 0.002, G_GLASS, ch=0)
    for sg in (1, -1): strut(b, P3(aF + 0.08, sg * 0.068, hy + 0.10), P3(aF + 0.11, sg * 0.068, hy + 0.21), 0.005, G_DARK)


def _consoles(b, aS, floor):
    """Боковые пульты с тумблерами и ручками, РУД слева, ручка управления посередине, жгуты по стенкам."""
    x0 = 0.270; y = floor + 0.40
    for sg in (1, -1):
        x1 = g.CK_HW(aS + 0.1) - 0.014
        xl, xr = min(sg * x0, sg * x1), max(sg * x0, sg * x1)
        _box(b, aS - 0.52, aS + 0.46, xl, xr, floor, y, G_DARK, ch=0.008)
        pos = aS - 0.50; j = 0
        for ln in (0.15, 0.10, 0.17, 0.12, 0.15, 0.10, 0.20):
            if pos + ln > aS + 0.46: break
            hh = 0.008 + 0.005 * (j % 3)
            _box(b, pos + 0.004, pos + ln - 0.004, xl + 0.006, xr - 0.006, y, y + hh, G_COCK, ch=0.002)
            w_ = xr - xl - 0.03
            for i in range(3):
                xk = xl + 0.015 + w_ * (i + 0.5) / 3
                for rw in range(2 if ln > 0.11 else 1):
                    ak = pos + (ln / (2 if ln > 0.11 else 1)) * (rw + 0.5)
                    if (i + j + rw) % 2 == 0: strut(b, P3(ak, xk, y + hh), P3(ak - 0.006, xk, y + hh + 0.020), 0.0028, G_METAL)
                    else: strut(b, P3(ak, xk, y + hh), P3(ak, xk, y + hh + 0.012), 0.0085, G_DARK)
            pos += ln; j += 1
    xt = -x0 - 0.045
    _box(b, aS - 0.34, aS - 0.10, xt - 0.035, xt + 0.035, y, y + 0.020, G_DARK, ch=0.005)
    strut(b, P3(aS - 0.21, xt, y + 0.015), P3(aS - 0.25, xt, y + 0.13), 0.010, G_METAL)
    _pad(b, P3(aS - 0.29, xt, y + 0.155), Vector((0, -1, 0)), Vector((1, 0, 0)), Vector((0, 0, 1)), [(0.0, 0.024, 0.020, 0), (0.02, 0.036, 0.032, 0), (0.08, 0.038, 0.034, 0), (0.11, 0.028, 0.022, 0)], G_COCK)
    strut(b, P3(aS - 0.20, 0, floor + 0.02), P3(aS - 0.20, 0, floor + 0.09), 0.044, G_DARK)
    strut(b, P3(aS - 0.20, 0, floor + 0.09), P3(aS - 0.235, 0, floor + 0.44), 0.012, G_METAL)
    _pad(b, P3(aS - 0.237, 0, floor + 0.44), Vector((0, 0, 1)), Vector((1, 0, 0)), Vector((0, 1, 0)), [(0.0, 0.015, 0.018, 0), (0.03, 0.021, 0.026, 0), (0.12, 0.020, 0.024, 0.004), (0.155, 0.012, 0.015, 0.004)], G_COCK)
    strut(b, P3(aS - 0.262, 0, floor + 0.50), P3(aS - 0.262, 0, floor + 0.535), 0.005, G_METAL)
    for sg in (1, -1):
        xw = sg * (g.CK_HW(aS) - 0.016)
        strut(b, P3(aS - 0.50, xw, floor + 0.53), P3(aS + 0.44, xw, floor + 0.55), 0.012, G_DARK)
        strut(b, P3(aS - 0.50, xw, floor + 0.47), P3(aS + 0.44, xw, floor + 0.49), 0.008, G_METAL)


def _deck(b):
    """Антибликовый гребень под козырьком: тёмная плита по форме спины."""
    st = g.stations(2.18, 2.44, 0.06); rs = []
    for a in st:
        hw = g.CAN_T[1](a) - 0.004; ring = []
        for k in range(17):
            x = hw * (-1 + 2 * k / 16); ring.append(P3(a, x, g.fore_y(a, abs(x)) + 0.014))
        for k in range(17):
            x = hw * (1 - 2 * k / 16); ring.append(P3(a, x, g.fore_y(a, abs(x)) - 0.030))
        rs.append(ring)
    b.loft(rs, G_DARK, cap0=G_DARK, cap1=G_DARK)


def cockpit_detail():
    """Одна кабина: кресло с ремнями, доска с круглыми приборами, прицел, пульты, ручки, задняя переборка, кромки выреза. Лётчика нет."""
    b = B(); F1 = g.FLOOR; aS = 3.400; aF = aS - 0.50
    _seat(b, aS, F1); _consoles(b, aS, F1); _panel(b, aF, F1 + 0.16, wide=0.29)
    _deck(b)
    _box(b, aF - 0.52, aF + 0.02, -0.31, 0.31, F1 - 0.002, F1 + 0.16, G_COCK, ch=0.01)                                  # ступень пола под педалями и доской
    tl_ = math.radians(17); W_ = Vector((0, -math.sin(tl_), math.cos(tl_))); N_ = Vector((0, -math.cos(tl_), -math.sin(tl_))); bs_ = P3(aS + 0.50, 0, F1 + 0.26)
    for sg in (1, -1): strut(b, bs_ + W_ * 0.93 + N_ * 0.04 + Vector((sg * 0.075, 0, 0)), bs_ + W_ * 1.00 - N_ * 0.02 + Vector((sg * 0.075, 0, 0)), 0.010, G_METAL)   # стойки рукоятки над заголовником
    _box(b, g.CK_A0 + 0.01, aF - 0.09, -0.30, 0.30, F1 + 0.84, F1 + 0.90, G_DARK, ch=0.012)                # козырёк доски до переднего края выреза
    top = lambda a: g.SILL(a) - 0.035
    b.loft([[P3(a, -g.CK_HW(a) + 0.003, F1), P3(a, g.CK_HW(a) - 0.003, F1), P3(a, g.CK_HW(a) - 0.003, top(a)), P3(a, -g.CK_HW(a) + 0.003, top(a))] for a in g.stations(4.55, 4.74, 0.05)], G_COCK, cap0=G_COCK, cap1=G_COCK)
    _box(b, 4.58, 4.72, -0.14, 0.14, top(4.65) - 0.04, top(4.65) + 0.035, G_DARK, ch=0.012)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (g.CK_HW(a) + d), g.fore_y(a, g.CK_HW(a) + 0.01) + h)
        b.loft([[rail(a, -0.040, -0.075), rail(a, -0.012, -0.075), rail(a, -0.012, -0.028), rail(a, -0.040, -0.028)] for a in g.stations(2.95, 4.72, 0.07)], G_COCK, cap0=G_COCK, cap1=G_COCK)
    return b.finish('cockpit_int', sharp_deg=40)


def burner():
    """Нутро сопла: кольцо и стойки задней опоры, конус в глубине, тёмное."""
    b = B(); a0 = 12.35; c = P3(a0, 0.0, 0.0); F = Vector((0, 1, 0)); X, Zz = Vector((1, 0, 0)), Vector((0, 0, 1)); n = 28
    rg = lambda r, d: [c + (X * math.cos(2 * math.pi * k / n) + Zz * math.sin(2 * math.pi * k / n)) * r + F * d for k in range(n)]
    b.loft([rg(0.315, -0.03), rg(0.392, -0.03), rg(0.392, 0.03), rg(0.315, 0.03), rg(0.315, -0.03)], G_DARK)
    for j in range(10):
        ang = 2 * math.pi * j / 10; u = X * math.cos(ang) + Zz * math.sin(ang); strut(b, c + u * 0.08, c + u * 0.37, 0.013, G_DARK)
    a1 = 11.85; c1 = P3(a1, 0.0, 0.0); rg1 = lambda r, d: [c1 + (X * math.cos(2 * math.pi * k / 16) + Zz * math.sin(2 * math.pi * k / 16)) * r + F * d for k in range(16)]
    b.loft([rg1(0.165, 0.0), rg1(0.165, -0.10), rg1(0.100, -0.36), rg1(0.015, -0.50)], G_DARK, cap0=G_DARK, cap1=G_DARK)
    strut(b, c, c1, 0.100, G_DARK)
    return b.finish('det_burner', sharp_deg=30)



def _blade(b, a0, a1, x, z, h, sweep=0.5, up=1, t=0.009, mat=G_METAL):
    pl = [P3(a0, x, z), P3(a1, x, z), P3(a1 + sweep * h, x, z + up * h), P3(a0 + sweep * h + (a1 - a0) * 0.4, x, z + up * h)]
    b.loft([[p + Vector((t, 0, 0)) for p in pl], [p + Vector((-t, 0, 0)) for p in pl]], mat, cap0=mat, cap1=mat)


def _pipe(b, pts, rs, mat=G_METAL, n=12):
    for (p0, p1), (r0, r1) in zip(zip(pts, pts[1:]), zip(rs, rs[1:])):
        d = (p1 - p0).normalized(); u = d.orthogonal().normalized(); v = d.cross(u)
        rg = lambda c, r: [c + (u * math.cos(2 * math.pi * q / n) + v * math.sin(2 * math.pi * q / n)) * r for q in range(n)]
        b.loft([rg(p0, r0), rg(p1, r1)], mat, cap0=mat, cap1=mat)


PITOT = dict(root=0.800, tip=-2.000, z0=-0.500, z1=-0.680)
PROBE = dict(x=2.100, a_root=6.900, a_kink=5.360, a_tip=2.600, z_tip=0.140)
FENCE_X = 3.335


def details():
    b = B()
    # приёмник воздушного давления: длинная штанга под нижней губой заборника, вперёд и чуть вниз (f100_04, 01, 05)
    zr = g.fore_bot(PITOT['root'] + 0.45, 0.0)
    _pipe(b, [P3(PITOT['root'] + 0.55, 0, zr + 0.03), P3(PITOT['root'], 0, PITOT['z0']), P3(PITOT['root'] - 0.25, 0, PITOT['z0'] - 0.016)], [0.030, 0.045, 0.026], G_SKIN)   # обтекатель корня
    k = lambda t: PITOT['z0'] + (PITOT['z1'] - PITOT['z0']) * t; A = lambda t: PITOT['root'] + (PITOT['tip'] - PITOT['root']) * t
    _pipe(b, [P3(A(t), 0, k(t)) for t in (0.0, 0.55, 0.86, 0.87, 1.0)], [0.026, 0.024, 0.020, 0.011, 0.007], G_METAL)
    # штанга дозаправки под правым крылом: вдоль крыла вперёд, излом вверх к уровню кабины (f100_04)
    px = PROBE['x']; zw = g.wing_bot(px, PROBE['a_root']) - 0.110
    pts = [P3(PROBE['a_root'], px, zw), P3(PROBE['a_kink'] + 0.25, px, zw - 0.03), P3(PROBE['a_kink'], px, zw - 0.02), P3(PROBE['a_kink'] - 0.25, px, zw + 0.035)]
    tip = P3(PROBE['a_tip'], px, PROBE['z_tip']); d_ = (tip - pts[-1]).normalized()
    _pipe(b, pts + [tip - d_ * 0.22, tip - d_ * 0.20, tip - d_ * 0.05, tip], [0.036, 0.036, 0.036, 0.036, 0.034, 0.046, 0.046, 0.030], G_SKIN)
    for a_ in (PROBE['a_root'] - 0.03, PROBE['a_root'] - 0.16):   # кронштейны к крылу
        strut(b, P3(a_, px, zw), P3(a_, px, g.wing_bot(px, a_) + 0.01), 0.022, G_SKIN)
    # перегородка на верхней поверхности крыла между секциями предкрылка (f100_03)
    for sg in (1, -1):
        x = FENCE_X; c = g.TE_I(x) - g.LE_I(x); a0 = g.LE_I(x) + 0.004 * c; a1 = g.LE_I(x) + 0.50 * c; t = 0.008; rs = []
        for i in range(15):
            a = a0 + (a1 - a0) * i / 14; zt = g.wing_top(x, a); h = 0.115 * min(1.0, i / 2.0, (14 - i) / 3.0) + 0.004
            rs.append([P3(a, sg * x - t, zt - 0.012), P3(a, sg * x + t, zt - 0.012), P3(a, sg * x + t * 0.5, zt + h), P3(a, sg * x - t * 0.5, zt + h)])
        b.loft(rs, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    # дренаж на задней кромке киля (f100_04), антенны-лопатки, хвостовая пята
    strut(b, P3(float(g.F_TE(2.27)) - 0.32, 0.0, 2.27), P3(float(g.F_TE(2.27)) + 0.16, 0.0, 2.27), 0.030, G_SKIN)
    hit, _ = ray(8.90, 0.0, 'top'); _blade(b, 8.78, 9.00, 0.0, hit.z - 0.02, 0.18, 0.40, 1, 0.009)
    hit, _ = ray(4.90, 0.0, 'bot'); _blade(b, 4.96, 5.16, 0.0, hit.z + 0.02, -0.15, 0.35, 1, 0.009)
    hit, _ = ray(11.35, 0.0, 'bot'); _blade(b, 11.20, 11.55, 0.0, hit.z + 0.03, -0.10, -0.30, 1, 0.022)
    # огни на законцовках
    for sg in (1, -1):
        a_ = g.LE_I(g.XTIP) + 0.35; strut(b, P3(a_ - 0.06, sg * (g.XTIP - 0.01), g.wy(g.XTIP)), P3(a_ + 0.08, sg * (g.XTIP - 0.01), g.wy(g.XTIP)), 0.014, G_METAL)
    return b.finish('det_bits', sharp_deg=45)


def hardpoints():
    """Замки на пилонах: площадка снизу и упоры."""
    out = []
    for sx in (1, -1):
        b = B(); n_ = 'r' if sx > 0 else 'l'
        for tag, x, a0, a1, dep in g.PYLON_DEF:
            am = (a0 + a1) / 2; xb = sx * x; y0 = g.wing_bot(x, am) - dep
            _box(b, am - 0.30, am + 0.30, xb - 0.038, xb + 0.038, y0 - 0.012, y0 + 0.012, G_METAL)
            for da in (-0.20, 0.20):
                for ss in (-1, 1): strut(b, P3(am + da, xb + ss * 0.042, y0 + 0.05), P3(am + da, xb + ss * 0.078, y0 + 0.002), 0.008, G_METAL)
        out.append(b.finish('det_hard_' + n_, sharp_deg=40))
    return out
