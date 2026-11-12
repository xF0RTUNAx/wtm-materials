# a10_detail.py - детали A-10A поверх формы a10_geo.py: разделка обшивки геометрией (канавки), крышки люков, ниши шасси и щитка, кабина, нутро сопла, пушки, штанги, антенны, замки пилонов.
# Мелочь (префикс det_) - отдельные объекты.
import math
import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from modelkit import B
import a10_geo as g
from a10_geo import P3, Yb, Z, Track, strut, _drop, _apply_bool, loft_obj, sup, G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_DUCT

G_STRAP, G_SCREEN = 6, 7
G_BELT, G_HANDLE = G_SCREEN + 1, G_SCREEN + 2
G_SEAM = 10


def ray(a, x, side, z=None):
    """Точка обшивки: side 'top'/'bot' - луч сверху/снизу над (a, x); 'r'/'l' - сбоку на уровне z (y мира)."""
    t = g.BVH['t']; y = Yb(a)
    if side == 'top': h = t.ray_cast(Vector((x, y, 4.0)), Vector((0, 0, -1)))
    elif side == 'bot': h = t.ray_cast(Vector((x, y, -4.0)), Vector((0, 0, 1)))
    elif side == 'r': h = t.ray_cast(Vector((1.25, y, z)), Vector((-1, 0, 0)))
    else: h = t.ray_cast(Vector((-1.25, y, z)), Vector((1, 0, 0)))
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


# линии разделки по a10_01, 02: длинные швы V-канавкой вдоль лонжеронов, крышки плитами. (a, x) или (a, z). Не сеткой.
_LE = lambda x: float(g.LE0(x)); _HF = lambda x: float(g.HINGE_F(x)); _HA = lambda x: float(g.HINGE_A(x))
TOP_LINES = [
    [(_LE(0.80) + 0.62, 0.80), (_LE(2.20) + 0.62, 2.20)], [(_LE(3.05) + 0.50, 3.05), (_LE(8.20) + 0.36, 8.20)],     # передний лонжерон
    [(_HF(3.05) - 0.16, 3.05), (_HF(5.05) - 0.16, 5.05)], [(_HA(5.20) - 0.14, 5.20), (_HA(8.00) - 0.14, 8.00)],     # перед закрылком и элероном
    [(_LE(5.11), 5.115), (_HF(5.11) - 0.20, 5.115)],                                                                  # стык секций консоли
    [(14.42, 0.55), (14.42, 2.78)],                                                                                   # лонжерон стабилизатора
    rrect_line(_LE(1.5) + 0.95, _LE(1.5) + 1.40, 1.25, 1.65), rrect_line(_LE(4.2) + 0.75, _LE(4.2) + 1.15, 4.00, 4.40), rrect_line(_LE(6.6) + 0.62, _LE(6.6) + 0.95, 6.45, 6.80),
]
BOT_LINES = [
    [(2.00, 0.62), (6.20, 0.62)], [(10.20, 0.26), (13.60, 0.22)],                                                     # низ фюзеляжа
    [(_LE(3.05) + 0.50, 3.05), (_LE(8.20) + 0.36, 8.20)], [(_HF(3.05) - 0.16, 3.05), (_HF(5.05) - 0.16, 5.05)],     # низ крыла
    rrect_line(4.30, 4.95, 0.06, 0.40), rrect_line(5.30, 5.90, 0.06, 0.40), rrect_line(_LE(4.2) + 0.75, _LE(4.2) + 1.15, 4.00, 4.40),
]
SIDE_PANELS = [
    [(0.55, -0.060), (1.45, 0.050)], [(1.50, -0.200), (6.40, -0.200)],
    rrect_line(1.62, 2.28, -0.500, -0.060), rrect_line(2.42, 2.98, -0.480, 0.160), rrect_line(3.20, 3.80, -0.060, 0.330),      # люки пушки и приборных отсеков
    rrect_line(4.25, 5.05, -0.560, -0.260), rrect_line(5.30, 6.10, 0.020, 0.480),
    [(13.00, 0.300), (15.20, 0.290)], rrect_line(12.95, 13.45, -0.200, 0.060),
]
RINGS_FORE = (1.480, 13.050, 15.300)


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
    for a in RINGS_FORE: apply(ring_groove(a))
    return n


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
    return b.finish('A10_skin_plates', sharp_deg=28)


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
    """Ниши шасси: передняя под кабиной справа от оси, щели ног в обтекателях. В файле самолёта закрыты створками door_*."""
    a0, a1, x0, x1 = g.NOSE_BAY
    rings = [[P3(a, x0, g.FLOOR - 0.07), P3(a, x1, g.FLOOR - 0.07), P3(a, x1, -1.5), P3(a, x0, -1.5)] for a in (a0, a1)]
    c = loft_obj('c_bay', rings, G_DUCT, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    a0, a1, hw = g.LEGSLOT
    for sx in (1, -1):
        xc = sx * (g.POD_X - g.LEG_OFF)
        rings = [[P3(a, xc - hw, -0.66), P3(a, xc + hw, -0.66), P3(a, xc + hw, -1.6), P3(a, xc - hw, -1.6)] for a in (a0, a1)]
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
    """Антибликовый гребень под козырьком: тёмная плита по форме носа."""
    st = g.stations(1.56, g.CK_A0 + 0.02, 0.06); rs = []
    for a in st:
        hw = g.CAN_T[1](a) - 0.004; ring = []
        for k in range(17):
            x = hw * (-1 + 2 * k / 16); ring.append(P3(a, x, g.fore_y(a, abs(x)) + 0.014))
        for k in range(17):
            x = hw * (1 - 2 * k / 16); ring.append(P3(a, x, g.fore_y(a, abs(x)) - 0.030))
        rs.append(ring)
    b.loft(rs, G_DARK, cap0=G_DARK, cap1=G_DARK)


def cockpit_detail():
    """Кабина: кресло с ремнями, доска с круглыми приборами, стекло прицела, пульты, ручки, задняя переборка, кромки выреза. Лётчика нет."""
    b = B(); F1 = g.FLOOR; aS = 2.980; aF = aS - 0.50; A1 = g.CK_A1
    _seat(b, aS, F1); _consoles(b, aS, F1); _panel(b, aF, F1 + 0.10, wide=0.28)
    _deck(b)
    _box(b, aF - 0.52, aF + 0.02, -0.29, 0.29, F1 - 0.002, F1 + 0.10, G_COCK, ch=0.01)                                  # ступень пола под педалями и доской
    tl_ = math.radians(17); W_ = Vector((0, -math.sin(tl_), math.cos(tl_))); N_ = Vector((0, -math.cos(tl_), -math.sin(tl_))); bs_ = P3(aS + 0.50, 0, F1 + 0.26)
    for sg in (1, -1): strut(b, bs_ + W_ * 0.93 + N_ * 0.04 + Vector((sg * 0.075, 0, 0)), bs_ + W_ * 1.00 - N_ * 0.02 + Vector((sg * 0.075, 0, 0)), 0.010, G_METAL)   # стойки рукоятки над заголовником
    _box(b, g.CK_A0 + 0.01, aF - 0.09, -0.26, 0.26, F1 + 0.78, F1 + 0.84, G_DARK, ch=0.012)                # козырёк доски до переднего края выреза
    top = lambda a: g.SILL(min(a, g.CAN_A1)) - 0.035
    b.loft([[P3(a, -g.CK_HW(a) + 0.003, F1), P3(a, g.CK_HW(a) - 0.003, F1), P3(a, g.CK_HW(a) - 0.003, top(a)), P3(a, -g.CK_HW(a) + 0.003, top(a))] for a in g.stations(A1 - 0.20, A1 - 0.01, 0.05)], G_COCK, cap0=G_COCK, cap1=G_COCK)
    _box(b, A1 - 0.17, A1 - 0.03, -0.14, 0.14, top(A1 - 0.10) - 0.04, top(A1 - 0.10) + 0.035, G_DARK, ch=0.012)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (g.CK_HW(a) + d), g.fore_y(a, g.CK_HW(a) + 0.01) + h)
        b.loft([[rail(a, -0.040, -0.075), rail(a, -0.012, -0.075), rail(a, -0.012, -0.028), rail(a, -0.040, -0.028)] for a in g.stations(g.ARCH_A + 0.05, A1 - 0.03, 0.07)], G_COCK, cap0=G_COCK, cap1=G_COCK)
    return b.finish('cockpit_int', sharp_deg=40)


def _blade(b, a0, a1, x, z, h, sweep=0.5, up=1, t=0.009, mat=G_METAL):
    pl = [P3(a0, x, z), P3(a1, x, z), P3(a1 + sweep * h, x, z + up * h), P3(a0 + sweep * h + (a1 - a0) * 0.4, x, z + up * h)]
    b.loft([[p + Vector((t, 0, 0)) for p in pl], [p + Vector((-t, 0, 0)) for p in pl]], mat, cap0=mat, cap1=mat)


def _pipe(b, pts, rs, mat=G_METAL, n=12):
    for (p0, p1), (r0, r1) in zip(zip(pts, pts[1:]), zip(rs, rs[1:])):
        d = (p1 - p0).normalized(); u = d.orthogonal().normalized(); v = d.cross(u)
        rg = lambda c, r: [c + (u * math.cos(2 * math.pi * q / n) + v * math.sin(2 * math.pi * q / n)) * r for q in range(n)]
        b.loft([rg(p0, r0), rg(p1, r1)], mat, cap0=mat, cap1=mat)


PP = dict(a0=1.750, a1=2.600, x=0.600, pod=(2.150, 0.840, -0.960))          # пилон контейнера Pave Penny под кабиной справа: низ пилона - точка контейнера игры
PITOT_X = 8.250


def details():
    b = B()
    # приёмник воздушного давления: штанга на передней кромке правой консоли у законцовки (a10_03)
    x = PITOT_X; a0 = g.LE_I(x); z = g.wy(x)
    _pipe(b, [P3(a0 + 0.30, x, z), P3(a0 - 0.10, x, z), P3(a0 - 0.55, x, z), P3(a0 - 0.56, x, z), P3(a0 - 0.80, x, z)], [0.030, 0.026, 0.020, 0.011, 0.007], G_METAL)
    # антенны: два ножа на спине за кабиной, три под хвостовой балкой, штырь на носу (a10_01)
    hit, _ = ray(5.70, 0.0, 'top'); _blade(b, 5.60, 5.86, 0.0, hit.z - 0.02, 0.20, 0.35, 1, 0.010)
    hit, _ = ray(6.75, 0.0, 'top'); _blade(b, 6.66, 6.92, 0.0, hit.z - 0.02, 0.26, 0.30, 1, 0.010)
    for a_ in (12.95, 13.40, 13.95):
        hit, _ = ray(a_, 0.0, 'bot'); _blade(b, a_, a_ + 0.22, 0.0, hit.z + 0.02, -0.26, 0.55, 1, 0.010)
    hit, _ = ray(3.90, 0.0, 'bot'); _blade(b, 3.86, 4.10, -0.20, ray(3.90, -0.20, 'bot')[0].z + 0.02, -0.16, 0.35, 1, 0.009)
    # пилон Pave Penny: наклонная стойка от правого борта вниз-наружу (a10_02)
    pa, px, pz = PP['pod']; rs = []
    for a_, f in ((PP['a0'], 0.25), (PP['a0'] + 0.12, 0.85), (PP['a0'] + 0.30, 1.0), (PP['a1'] - 0.28, 1.0), (PP['a1'] - 0.10, 0.8), (PP['a1'], 0.25)):
        zt = g.fore_bot(a_, PP['x']) + 0.06; t = 0.040 * f
        rs.append([P3(a_, px - t, pz + 0.085), P3(a_, px + t, pz + 0.085), P3(a_, PP['x'] + t, zt), P3(a_, PP['x'] - t, zt)])
    b.loft(rs, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    _box(b, pa - 0.22, pa + 0.22, px - 0.035, px + 0.035, pz + 0.070, pz + 0.092, G_METAL)
    # огни: законцовки, верх килей, хвостовой
    for sg in (1, -1):
        xt = g.XTIP - 0.10; a_ = g.LE_I(xt) + 0.22; zt = g.wing_top(xt, a_)
        strut(b, P3(a_ - 0.07, sg * xt, zt + 0.004), P3(a_ + 0.09, sg * xt, zt + 0.004), 0.022, G_HANDLE)
        strut(b, P3(g.RUD_H - 0.30, sg * g.FIN_X, g.FZ1 - 0.012), P3(g.RUD_H - 0.14, sg * g.FIN_X, g.FZ1 - 0.012), 0.024, G_HANDLE)
    # торец хвоста (a10_08): огонь в оправе по центру, два круглых датчика по бокам, короб снизу
    zc_ = 0.100; strut(b, P3(g.L - 0.03, 0.0, zc_ + 0.10), P3(g.L + 0.03, 0.0, zc_ + 0.10), 0.062, G_METAL, 16); strut(b, P3(g.L + 0.02, 0.0, zc_ + 0.10), P3(g.L + 0.045, 0.0, zc_ + 0.10), 0.042, G_HANDLE, 16)
    for sg in (1, -1): strut(b, P3(g.L - 0.11, sg * 0.20, zc_ + 0.02), P3(g.L - 0.035, sg * 0.20, zc_ + 0.02), 0.045, G_DARK, 14)
    _box(b, g.L - 0.06, g.L + 0.05, -0.075, 0.075, zc_ - 0.24, zc_ - 0.07, G_SKIN, ch=0.02)
    # приёмник дозаправки на носу: обтекатель-гребень вокруг гнезда (a10_01, 03)
    hit, _ = ray(1.05, 0.0, 'top'); _box(b, 0.86, 1.24, -0.045, 0.045, hit.z - 0.03, hit.z + 0.022, G_DARK, ch=0.012)
    for sg in (1, -1):
        # кассеты ловушек: решётчатые плиты под законцовкой и в хвосте обтекателя стойки
        for a0_, x_, na, nx_ in ((float(g.LE_I(8.25)) + 0.85, 8.25, 5, 3), (9.05, g.POD_X, 4, 3)):
            hit, _ = ray(a0_ + 0.15, sg * x_, 'bot'); z_ = hit.z
            _box(b, a0_, a0_ + 0.07 * na + 0.02, sg * x_ - 0.035 * nx_ - 0.01, sg * x_ + 0.035 * nx_ + 0.01, z_ - 0.012, z_ + 0.02, G_SKIN, ch=0.004)
            for i in range(na):
                for j in range(nx_): _box(b, a0_ + 0.015 + 0.07 * i, a0_ + 0.015 + 0.07 * i + 0.052, sg * x_ + 0.07 * (j - nx_ / 2) + 0.009, sg * x_ + 0.07 * (j - nx_ / 2) + 0.061, z_ - 0.016, z_ - 0.010, G_DARK)
    return b.finish('det_bits', sharp_deg=45)


def hardpoints():
    """Замки на пилонах: площадка снизу и упоры."""
    out = []
    for sx in (1, -1):
        b = B(); n_ = 'r' if sx > 0 else 'l'
        for tag, x, a0, a1, dep in g.PYLON_DEF:
            am = (a0 + a1) / 2; xb = sx * x; y0 = g.wing_bot(x, am) - dep
            _box(b, am - 0.38, am + 0.38, xb - 0.040, xb + 0.040, y0 - 0.012, y0 + 0.012, G_METAL)
            for da in (-0.26, 0.26):
                for ss in (-1, 1): strut(b, P3(am + da, xb + ss * 0.044, y0 + 0.06), P3(am + da, xb + ss * 0.090, y0 + 0.002), 0.009, G_METAL)
        out.append(b.finish('det_hard_' + n_, sharp_deg=40))
    b = B()
    for nm in ('pylon_fc', 'pylon_fr', 'pylon_fl'):
        p = g.PYLON_PTS[nm]
        b.loft([[p + Vector((sx_ * 0.038, da, dz)) for sx_, dz in ((-1, -0.012), (1, -0.012), (1, 0.012), (-1, 0.012))] for da in (0.36, -0.36)], G_METAL, cap0=G_METAL, cap1=G_METAL)
        for da in (-0.24, 0.24):
            for ss in (-1, 1): strut(b, p + Vector((ss * 0.042, da, 0.06)), p + Vector((ss * 0.085, da, 0.002)), 0.009, G_METAL)
    out.append(b.finish('det_hard_f', sharp_deg=40))
    return out


def pave_penny():
    """Контейнер Pave Penny на пилоне под кабиной справа (a10_02): только для Sketchfab, в файл игры не идёт - туда контейнер вешает игра."""
    b = B(); pa, px, pz = PP['pod']; r = 0.098; zc = pz + 0.070 - r - 0.012; n = 20
    rg = lambda a_, rr: [P3(a_, px + rr * math.sin(2 * math.pi * k / n), zc - rr * math.cos(2 * math.pi * k / n)) for k in range(n)]
    b.loft([rg(pa - 0.40, r * 0.80), rg(pa - 0.36, r), rg(pa + 0.30, r), rg(pa + 0.40, r * 0.72), rg(pa + 0.45, r * 0.30)], G_SKIN, cap0=G_DARK, cap1=G_SKIN)
    b.loft([rg(pa - 0.49, r * 0.20), rg(pa - 0.46, r * 0.55), rg(pa - 0.40, r * 0.80)], G_DARK, cap0=G_DARK)          # стеклянный нос
    b.loft([rg(pa - 0.10, r + 0.006), rg(pa - 0.06, r + 0.006)], G_METAL, cap0=G_METAL, cap1=G_METAL); b.loft([rg(pa + 0.14, r + 0.006), rg(pa + 0.18, r + 0.006)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('sk_pave_penny', sharp_deg=40)


a10_ready = True


def all_details():
    out = [cockpit_detail(), details()]
    out += [g.fus_pylon('c', 0.0, 7.30, 9.10, 0.200), g.fus_pylon('r', 0.50, 7.40, 9.00, 0.180), g.fus_pylon('l', -0.50, 7.40, 9.00, 0.180)]
    return out + hardpoints() + [plates(), pave_penny()]
