# se_detail.py - детали Super Étendard поверх формы se_geo.py: разделка обшивки геометрией (канавки), жалюзи, ниши шасси и щитков, кабина, нутро сопла, антенны, навески рулей, замки пилонов.
# Мелочь (префикс det_) - отдельные объекты.
import math
import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from modelkit import B
import se_geo as g
from se_geo import P3, Yb, Track, strut, _drop, _apply_bool, loft_obj, sup, G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_DUCT

G_STRAP, G_SCREEN = 6, 7
G_SEAM = 10


def ray(a, x, side, z=None):
    """Точка обшивки: side 'top'/'bot' - луч сверху/снизу над (a, x); 'r'/'l' - сбоку на уровне z (x - игнор)."""
    t = g.BVH['t']; y = Yb(a)
    if side == 'top': h = t.ray_cast(Vector((x, y, 4.0)), Vector((0, 0, -1)))
    elif side == 'bot': h = t.ray_cast(Vector((x, y, -4.0)), Vector((0, 0, 1)))
    elif side == 'r': h = t.ray_cast(Vector((5.0, y, z)), Vector((-1, 0, 0)))
    else: h = t.ray_cast(Vector((-5.0, y, z)), Vector((1, 0, 0)))
    return h[0], h[1]


def groove_obj(points, side, w=0.0055, d=0.0055, step=0.09, name='c_gr'):
    """Режущая V-канавка вдоль линии на обшивке: две наклонные стенки в цвет обшивки, одна ловит свет, другая в тени; чёрного дна нет. Точки в (a, x) для top/bot, в (a, z) для r/l. Торцы плавно выходят на поверхность."""
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
        s = s.normalized(); k = min(1.0, min(i, N - 1 - i) / 1.0 + 0.25)     # у концов мельче
        rings.append([hit - n_ * d * k, hit + n_ * 0.02 + s * (w + 0.02 * w / d), hit + n_ * 0.02 - s * (w + 0.02 * w / d)])
    if len(rings) < 2: return None
    b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish(name, sharp_deg=20)


def box_cut(a0, a1, q0, q1, side, depth=0.025, name='c_box'):
    """Выемка: вентрешётка, лючок. Прямоугольник по лучам на обшивку."""
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


def ring_groove(a, kind='fore', w=0.0055, d=0.0055):
    """Кольцевой шов на носовой части: V-канавка в цвет обшивки."""
    T = g.FT; top, bot, hw, nt, nb = [t(a) for t in T]; cy = (top + bot) / 2
    def scaled(a_, k): return sup(a_, 0.0, cy + (top - cy) * k, cy + (bot - cy) * k, hw * k, nt, nb, 72)
    k0 = 1 - d / max(hw, 0.2); k1 = 1.05; ww = w * (1 + (k1 - 1) * hw / d)
    rs = [scaled(a, k0), scaled(a + ww, k1), scaled(a - ww, k1)]; rs.append(rs[0])
    b = B(); b.loft(rs, G_SKIN); bmesh.ops.remove_doubles(b.bm, verts=b.bm.verts[:], dist=1e-6)
    return b.finish('c_ring', sharp_deg=20)

def rrect_line(a0, a1, q0, q1, r=0.025):
    """Контур крышки со срезанными углами: (a, q)."""
    return [(a0 + r, q0), (a1 - r, q0), (a1, q0 + r), (a1, q1 - r), (a1 - r, q1), (a0 + r, q1), (a0, q1 - r), (a0, q0 + r), (a0 + r, q0)]


# линии разделки по se_01, 02, 04, 09: длинные швы V-канавкой, крышки плитами (plates). (a, x) или (a, z). Вдоль кромок, не сеткой.
_WLE = lambda x: float(g.LE_I(x))
_HG = lambda x: float(g.HINGE_I(x))
TOP_LINES = [
    [(_WLE(1.10) + 0.62, 1.10), (_WLE(3.70) + 0.48, 3.70)], [(_HG(1.00) - 0.20, 1.00), (_HG(2.40) - 0.20, 2.40)],     # крыло: лонжерон вдоль кромки, задний лонжерон
    [(4.30, 0.34), (8.40, 0.36)], [(8.60, 0.0), (8.60, 0.34)], [(10.60, 0.0), (10.60, 0.30)], [(9.20, 0.30), (11.50, 0.26)],     # спина
    rrect_line(5.00, 5.36, 0.16, 0.36), rrect_line(6.40, 6.78, 0.18, 0.40), rrect_line(9.05, 9.36, 0.14, 0.30),
]
BOT_LINES = [
    [(7.00, 0.42), (9.20, 0.44)], [(9.60, 0.48), (12.10, 0.32)], [(1.05, 0.22), (2.45, 0.24)], [(3.90, 0.30), (5.40, 0.34)],     # низ фюзеляжа
    [(_WLE(1.90) + 0.60, 1.90), (_WLE(3.70) + 0.48, 3.70)],     # низ крыла
    rrect_line(4.20, 4.60, 0.06, 0.24), rrect_line(11.30, 11.62, 0.10, 0.26),
]
SIDE_PANELS = [
    [(1.00, 0.46), (2.35, 0.52)], [(1.75, 0.14), (1.75, 0.46)],
    rrect_line(0.98, 1.56, 0.26, 0.42),
    [(9.70, -0.30), (9.70, 0.10)], [(10.60, -0.32), (10.60, 0.34)], [(11.60, -0.30), (11.60, 0.34)], [(9.90, 0.12), (12.10, 0.20)],     # хвост
    rrect_line(10.75, 11.42, -0.22, 0.06),
]
RINGS_FORE = (0.800, 1.750, 8.600, 10.600, 11.600)
RAD_RING = 0.800


def carve(host):
    """Длинные швы V-канавками; жалюзи на хвосте. Крышки ставит plates()."""
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
        for i_ in range(5):                                     # жалюзи на борту у хвоста
            z_ = -0.20 + i_ * 0.048; apply(box_cut(9.98, 10.36, z_, z_ + 0.026, sd, 0.016))
    for a in RINGS_FORE: apply(ring_groove(a))
    return n


def plates():
    """Крышки люков: настоящие плиты на обшивке, 7 мм над ней, с фаской 12 мм. Все закрытые контуры из таблиц, на обеих сторонах; объект считается обшивкой (та же краска)."""
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
        o, m, t = [], [], []
        for a, q in pts:
            da, dq = ac - a, qc - q; ln = math.hypot(da, dq)
            h0, n0 = at(a, q); h1, n1 = at(a + da / ln * ch, q + dq / ln * ch)
            if h0 is None or h1 is None: return False
            o.append(h0 - n0.normalized() * 0.004); m.append(h1 + n1.normalized() * lift)
        # средняя часть: кольца к центру, плита повторяет обшивку
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
    return b.finish('SE_skin_plates', sharp_deg=28)


def smooth_normals(host, ref_me):
    """Обшивка освещается как гладкая: после резки канавок вершины на длинных тонких треугольниках дают мятый свет. Нормаль каждого угла берётся с поверхности до резки; грани, что от неё отклонились (стенки канавок, ниш, каналов), остаются плоскими и резкими."""
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
    rings = [[P3(a, -hw, 0.14), P3(a, hw, 0.14), P3(a, hw, -1.0), P3(a, -hw, -1.0)] for a in (a0, a1)]
    c = loft_obj('c_bay', rings, G_DUCT, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    for sx in (1, -1):
        a0, a1, x0, x1 = g.MAIN_BAY
        rings = [[P3(a, sx * x0, 0.30), P3(a, sx * x1, 0.30), P3(a, sx * x1, -1.2), P3(a, sx * x0, -1.2)] for a in (a0, a1)]
        c = loft_obj('c_bay', rings, G_DUCT, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
        a0, a1, x0, x1 = g.BRK                                  # ниша щитка: сквозь отверстия видно нутро
        rings = [[P3(a, sx * (x0 - 0.012), -0.20), P3(a, sx * (x1 + 0.012), -0.20), P3(a, sx * (x1 + 0.012), -1.2), P3(a, sx * (x0 - 0.012), -1.2)] for a in (a0 - 0.012, a1 + 0.012)]
        c = loft_obj('c_bay', rings, G_DUCT, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)


def resharp(host, deg=38):
    bm = bmesh.new(); bm.from_mesh(host.data); lim = math.radians(deg)
    for f in bm.faces: f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2: e.smooth = e.calc_face_angle(0.0) < lim
        else: e.smooth = False
    bm.to_mesh(host.data); bm.free()


# ── кабина ──
def _box(b, a0, a1, x0, x1, y0, y1, mat=G_COCK, ta=0.0, ch=0.0):
    """Брусок с фаской ch по верху."""
    p = lambda a, x, y: P3(a, x, y)
    bot0 = [p(a0, x0, y0), p(a0, x1, y0), p(a0, x1, y1 - ch), p(a0, x1 - ch, y1), p(a0, x0 + ch, y1), p(a0, x0, y1 - ch)] if ch > 0 else [p(a0, x0, y0), p(a0, x1, y0), p(a0, x1, y1), p(a0, x0, y1)]
    bot1 = [q + Vector((0, Yb(a1) - Yb(a0), 0)) for q in bot0]
    if ta:
        bot0 = [q + Vector((0, 0, 0)) for q in bot0]
    b.loft([bot0, bot1], mat, cap0=mat, cap1=mat)


def _tbox(b, c, u, v, w, hu, hv, hw_, mat=G_COCK, ch=0.25):
    """Наклонный брусок с фаской: центр c, оси u, v, w, полуразмеры; ch - доля меньшего размера."""
    e = min(hu, hv, abs(hw_)) * ch
    def ring(s, k):
        ku, kv = hu - k, hv - k
        return [c + w * s + u * (su * ku) + v * (sv * kv) for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    if e <= 0.0015: rs = [ring(-hw_, 0), ring(hw_, 0)]
    else: rs = [ring(-hw_, e), ring(-hw_ + e, 0), ring(hw_ - e, 0), ring(hw_, e)]
    b.loft(rs, mat, cap0=mat, cap1=mat)


def _rr(c, u, v, hu, hv, p=4.0, n=24):
    """Кольцо скруглённого прямоугольника: суперэллипс."""
    out = []
    for k in range(n):
        t = 2 * math.pi * k / n; ct, st = math.cos(t), math.sin(t)
        out.append(c + u * (hu * math.copysign(abs(ct) ** (2 / p), ct)) + v * (hv * math.copysign(abs(st) ** (2 / p), st)))
    return out


def _pad(b, c0, w, u, v, st, mat, p=4.0):
    """Мягкая деталь: станции (d по оси w, hu, hv, смещение по v)."""
    b.loft([_rr(c0 + w * d_ + v * o_, u, v, hu, hv, p) for d_, hu, hv, o_ in st], mat, cap0=mat, cap1=mat)


G_BELT, G_HANDLE = G_SCREEN + 1, G_SCREEN + 2


def _seat(b, aS, floor):
    """Катапультное кресло (рендеры 04, 06): рама, чаша, мягкие подушки, заголовник с парашютом, рельсы, ремни с пряжкой, рукоятки."""
    X = Vector((1, 0, 0)); F = Vector((0, -1, 0)); UP = Vector((0, 0, 1)); tilt = math.radians(17)
    W = Vector((0, -math.sin(tilt), math.cos(tilt)))            # вдоль спинки: вверх и назад
    N = Vector((0, -math.cos(tilt), -math.sin(tilt)))           # за спинку
    hw = 0.235; base = P3(aS + 0.50, 0, floor + 0.26)
    # чаша с контейнером НАЗ
    _pad(b, P3(aS, 0, floor + 0.16), F, X, UP, [(0.0, hw - 0.03, 0.10, 0), (0.04, hw - 0.01, 0.14, 0), (0.46, hw, 0.15, 0), (0.50, hw - 0.02, 0.12, 0)], G_COCK)
    _pad(b, P3(aS, 0, floor + 0.325), F, X, UP, [(0.015, 0.165, 0.008, 0), (0.05, 0.195, 0.038, 0), (0.25, 0.205, 0.050, 0), (0.44, 0.200, 0.042, 0), (0.48, 0.170, 0.008, 0)], G_STRAP)       # подушка сиденья
    # спинка: рама и подушка с боковинами
    _pad(b, base + N * 0.075, W, X, N, [(-0.08, hw - 0.02, 0.060, 0), (0.0, hw, 0.074, 0), (0.62, hw - 0.01, 0.074, 0), (0.68, hw - 0.03, 0.058, 0)], G_COCK)
    _pad(b, base - N * 0.020, W, X, N, [(0.03, 0.145, 0.006, 0), (0.07, 0.178, 0.034, 0), (0.30, 0.185, 0.044, 0), (0.54, 0.170, 0.036, 0), (0.60, 0.130, 0.006, 0)], G_STRAP)
    # заголовник: блок парашюта, подушка, боковые щёки
    _pad(b, base + N * 0.060, W, X, N, [(0.64, 0.170, 0.085, 0), (0.70, 0.195, 0.115, 0), (0.92, 0.180, 0.115, 0), (0.99, 0.135, 0.075, 0)], G_COCK)
    _pad(b, base - N * 0.065, W, X, N, [(0.72, 0.070, 0.004, 0), (0.75, 0.098, 0.022, 0), (0.88, 0.098, 0.024, 0), (0.91, 0.068, 0.004, 0)], G_STRAP)
    # рельсы катапульты и ракетная труба
    for sg in (1, -1):
        strut(b, base + N * 0.165 + X * (sg * 0.135) - W * 0.20, base + N * 0.165 + X * (sg * 0.135) + W * 0.92, 0.021, G_METAL)
    strut(b, base + N * 0.150 - W * 0.14, base + N * 0.150 + W * 0.60, 0.038, G_COCK)
    # ремни: плечевые от заголовника к пряжке, поясной, между ног
    buck = P3(aS + 0.19, 0, floor + 0.392)
    def belt(p0, p1, wd=0.020):
        d_ = p1 - p0; t_ = d_.normalized(); side = t_.cross(N if abs(t_.dot(N)) < 0.8 else X).normalized(); nor = side.cross(t_).normalized()
        if nor.dot(-N) < 0 and abs(nor.dot(N)) > 0.2: nor = -nor
        _tbox(b, (p0 + p1) / 2, side, nor, t_, wd, 0.0035, d_.length / 2, G_BELT, ch=0)
    for sg in (1, -1):
        sh = base + W * 0.64 - N * 0.058 + X * (sg * 0.080); ch_ = base + W * 0.30 - N * 0.085 + X * (sg * 0.086); wst = P3(aS + 0.36, sg * 0.060, floor + 0.415)
        belt(sh, ch_); belt(ch_, wst); belt(wst, buck + Vector((sg * 0.01, 0, 0)))
        belt(P3(aS + 0.43, sg * 0.195, floor + 0.36), buck + Vector((sg * 0.02, 0, 0)), 0.018)
        # рукоятка катапультирования сбоку и тросик (жёлто-чёрная в окраске)
        h0 = P3(aS + 0.08, sg * (hw - 0.002), floor + 0.27); h1 = P3(aS + 0.26, sg * (hw - 0.002), floor + 0.30)
        strut(b, h0, h1, 0.011, G_HANDLE); strut(b, h0, P3(aS + 0.08, sg * (hw - 0.002), floor + 0.13), 0.009, G_HANDLE)
        # баллончик и коробка на боковине спинки
        strut(b, base + W * 0.18 + N * 0.04 + X * (sg * (hw + 0.022)), base + W * 0.44 + N * 0.04 + X * (sg * (hw + 0.022)), 0.022, G_METAL)
    _tbox(b, buck, X, UP, F, 0.032, 0.006, 0.030, G_METAL, ch=0)
    belt(P3(aS + 0.015, 0, floor + 0.35), buck, 0.016)
    # кольцо катапультирования между ног
    r0 = P3(aS - 0.005, -0.055, floor + 0.235); r1 = P3(aS - 0.005, 0.055, floor + 0.235)
    strut(b, r0, r1, 0.011, G_HANDLE); strut(b, r0, P3(aS + 0.03, -0.045, floor + 0.15), 0.008, G_HANDLE); strut(b, r1, P3(aS + 0.03, 0.045, floor + 0.15), 0.008, G_HANDLE)


def _panel(b, aF, floor, wide=0.40, screens=3, hud=False):
    """Приборная доска: наклонная плита с экранами в рамках, козырёк над ней, тумба управления."""
    top = floor + 0.72
    u = Vector((1, 0, 0)); tl = math.radians(18); v = Vector((0, math.sin(tl), math.cos(tl))); w = Vector((0, -math.cos(tl), math.sin(tl)))    # v вверх и вперёд, w - к лётчику
    c = P3(aF, 0, top - 0.26); _tbox(b, c, u, v, w, wide, 0.27, 0.05, G_COCK)
    # экраны: большой в центре и боковые (ширина по рендеру 06)
    def scr(cx, cy, s):
        p = c + u * cx + v * cy + w * 0.046
        _tbox(b, p, u, v, w, s + 0.016, s + 0.016, 0.010, G_COCK); _tbox(b, p + w * 0.011, u, v, w, s, s, 0.002, G_SCREEN)
        for sg in (1, -1):
            for j in range(5):
                q = p + u * (sg * (s + 0.010)) + v * (-s * 0.8 + j * s * 0.4) + w * 0.012
                _tbox(b, q, u, v, w, 0.004, 0.006, 0.004, G_METAL)
    if screens == 3: scr(0.0, 0.07, 0.095); scr(-0.235, 0.05, 0.085); scr(0.235, 0.05, 0.085); scr(0.0, -0.13, 0.060)
    else: scr(-0.16, 0.06, 0.098); scr(0.16, 0.06, 0.098); scr(0.0, -0.14, 0.070); scr(-0.27, -0.10, 0.050); scr(0.27, -0.10, 0.050)
    # козырёк над доской: у передней кабины его заменяет гребень _deck
    if not hud: _box(b, aF - 0.12, aF + 0.03, -wide - 0.02, wide + 0.02, top, top + 0.045, G_DARK, ch=0.015)
    # тумба ног, педали
    _box(b, aF - 0.52, aF + 0.0, -0.09, 0.09, floor, top - 0.52, G_COCK, ch=0.02)
    for sg in (1, -1):
        _tbox(b, P3(aF - 0.10, sg * 0.20, floor + 0.14), u, Vector((0, 0.5, 0.86)).normalized(), Vector((0, -0.86, 0.5)).normalized(), 0.055, 0.09, 0.012, G_METAL)
        strut(b, P3(aF - 0.10, sg * 0.20, floor + 0.10), P3(aF - 0.10, sg * 0.20, floor - 0.03), 0.012, G_METAL)
    if hud:                                                     # коллиматор: две стойки и стекло
        hy = g.fore_y(aF, 0.0) + 0.006
        _box(b, aF - 0.10, aF + 0.03, -0.085, 0.085, hy, hy + 0.05, G_DARK, ch=0.01)                                                  # блок коллиматора
        for sg in (1, -1): strut(b, P3(aF - 0.02, sg * 0.075, hy + 0.05), P3(aF + 0.03, sg * 0.075, hy + 0.20), 0.007, G_DARK)
        _tbox(b, P3(aF + 0.025, 0, hy + 0.16), u, Vector((0, 0.25, 1)).normalized(), Vector((0, -1, 0.25)).normalized(), 0.082, 0.070, 0.002, G_GLASS, ch=0)


def _consoles(b, aS, floor):
    """Боковые пульты: основание, блоки разной высоты со щелями, мелкие ручки и тумблеры; РУД слева, ручка управления посередине."""
    x0 = 0.285; y = floor + 0.40; UP = Vector((0, 0, 1))
    for sg in (1, -1):
        x1 = g.CK_HW(aS + 0.1) - 0.014
        xl, xr = min(sg * x0, sg * x1), max(sg * x0, sg * x1)
        _box(b, aS - 0.56, aS + 0.50, xl, xr, floor, y, G_DARK, ch=0.008)
        pos = aS - 0.54; j = 0
        for ln in (0.15, 0.10, 0.17, 0.12, 0.15, 0.10, 0.20):
            if pos + ln > aS + 0.50: break
            hh = 0.008 + 0.005 * (j % 3)
            _box(b, pos + 0.004, pos + ln - 0.004, xl + 0.006, xr - 0.006, y, y + hh, G_COCK, ch=0.002)
            w_ = xr - xl - 0.04
            for i in range(4):
                xk = xl + 0.02 + w_ * (i + 0.5) / 4
                for rw in range(2 if ln > 0.11 else 1):
                    ak = pos + (ln / (2 if ln > 0.11 else 1)) * (rw + 0.5)
                    if (i + j + rw) % 3 == 0:   # тумблер
                        strut(b, P3(ak, xk, y + hh), P3(ak - 0.006, xk, y + hh + 0.020), 0.0028, G_METAL)
                    elif (i + j + rw) % 3 == 1: # круглая ручка
                        strut(b, P3(ak, xk, y + hh), P3(ak, xk, y + hh + 0.012), 0.0085, G_DARK)
                    else:                       # светящаяся кнопка-табло
                        _box(b, ak - 0.007, ak + 0.007, xk - 0.010, xk + 0.010, y + hh, y + hh + 0.003, G_SCREEN)
            pos += ln; j += 1
    # РУД: кулиса, две рукоятки (рендер 06)
    xt = -x0 - 0.052
    _box(b, aS - 0.36, aS - 0.10, xt - 0.040, xt + 0.040, y, y + 0.020, G_DARK, ch=0.005)
    for dx in (-0.018, 0.018):
        strut(b, P3(aS - 0.21, xt + dx, y + 0.015), P3(aS - 0.25, xt + dx, y + 0.135), 0.009, G_METAL)
    _pad(b, P3(aS - 0.30, xt, y + 0.165), Vector((0, -1, 0)), Vector((1, 0, 0)), Vector((0, 0, 1)), [(0.0, 0.026, 0.020, 0), (0.02, 0.040, 0.034, 0), (0.09, 0.042, 0.038, 0), (0.12, 0.030, 0.022, 0)], G_COCK)
    # ручка управления с чехлом и рукояткой
    strut(b, P3(aS - 0.20, 0, floor + 0.02), P3(aS - 0.20, 0, floor + 0.09), 0.044, G_DARK)
    strut(b, P3(aS - 0.20, 0, floor + 0.09), P3(aS - 0.235, 0, floor + 0.44), 0.012, G_METAL)
    _pad(b, P3(aS - 0.237, 0, floor + 0.44), Vector((0, 0, 1)), Vector((1, 0, 0)), Vector((0, 1, 0)), [(0.0, 0.015, 0.018, 0), (0.03, 0.021, 0.026, 0), (0.12, 0.020, 0.024, 0.004), (0.155, 0.012, 0.015, 0.004)], G_COCK)
    strut(b, P3(aS - 0.262, 0, floor + 0.50), P3(aS - 0.262, 0, floor + 0.535), 0.005, G_METAL)   # спуск
    # вентиляционные короба и жгуты по стенке
    for sg in (1, -1):
        xw = sg * (g.CK_HW(aS) - 0.016)
        strut(b, P3(aS - 0.52, xw, floor + 0.53), P3(aS + 0.48, xw, floor + 0.55), 0.012, G_DARK)
        strut(b, P3(aS - 0.52, xw, floor + 0.47), P3(aS + 0.48, xw, floor + 0.49), 0.008, G_METAL)


def _deck(b):
    """Антибликовый гребень под козырьком: тёмная плита по форме спины."""
    st = g.stations(1.88, 2.44, 0.06); rs = []
    for a in st:
        hw = g.CAN_T[1](a) - 0.004; ring = []
        for k in range(17):
            x = hw * (-1 + 2 * k / 16); ring.append(P3(a, x, g.fore_y(a, abs(x)) + 0.014))
        for k in range(17):
            x = hw * (1 - 2 * k / 16); ring.append(P3(a, x, g.fore_y(a, abs(x)) - 0.030))
        rs.append(ring)
    b.loft(rs, G_DARK, cap0=G_DARK, cap1=G_DARK)


def cockpit_detail():
    """Одна кабина: кресло с ремнями, доска с приборами, коллиматор, пульты, ручки, кромки выреза. Экипажа нет."""
    b = B(); F1 = g.FLOOR; aS = 2.980
    _seat(b, aS, F1); _consoles(b, aS, F1); _panel(b, 2.420, F1, wide=0.33, screens=5, hud=True)
    _deck(b)
    top = lambda a: g.SILL(a) - 0.035
    b.loft([[P3(a, -g.CK_HW(a) + 0.003, F1), P3(a, g.CK_HW(a) - 0.003, F1), P3(a, g.CK_HW(a) - 0.003, top(a)), P3(a, -g.CK_HW(a) + 0.003, top(a))] for a in g.stations(3.56, 3.88, 0.08)], G_COCK, cap0=G_COCK, cap1=G_COCK)
    _box(b, 3.62, 3.82, -0.14, 0.14, top(3.72) - 0.04, top(3.72) + 0.035, G_DARK, ch=0.012)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (g.CK_HW(a) + d), g.fore_y(a, g.CK_HW(a) + 0.01) + h)
        b.loft([[rail(a, -0.040, -0.05), rail(a, 0.003, -0.05), rail(a, 0.003, 0.012), rail(a, -0.040, 0.012)] for a in g.stations(2.40, 3.86, 0.07)], G_COCK, cap0=G_COCK, cap1=G_COCK)
    return b.finish('cockpit_int', sharp_deg=40)


def burner():
    """Нутро сопла: кольцо и малый конус в глубине, тёмное."""
    b = B(); a0 = 12.10; c = P3(a0, 0.0, g.NOZ_Y); F = Vector((0, 1, 0)); X, Z = Vector((1, 0, 0)), Vector((0, 0, 1)); n = 28
    rg = lambda r, d: [c + (X * math.cos(2 * math.pi * k / n) + Z * math.sin(2 * math.pi * k / n)) * r + F * d for k in range(n)]
    b.loft([rg(0.262, -0.03), rg(0.298, -0.03), rg(0.298, 0.03), rg(0.262, 0.03), rg(0.262, -0.03)], G_DARK)
    for j in range(12):
        ang = 2 * math.pi * j / 12; u = X * math.cos(ang) + Z * math.sin(ang); strut(b, c + u * 0.09, c + u * 0.39, 0.012, G_DARK)
    a1 = 11.55; c1 = P3(a1, 0.0, g.NOZ_Y); rg1 = lambda r, d: [c1 + (X * math.cos(2 * math.pi * k / 16) + Z * math.sin(2 * math.pi * k / 16)) * r + F * d for k in range(16)]
    b.loft([rg1(0.130, 0.0), rg1(0.130, -0.10), rg1(0.080, -0.34), rg1(0.015, -0.46)], G_DARK, cap0=G_DARK, cap1=G_DARK)
    strut(b, c, c1, 0.085, G_DARK)
    return b.finish('det_burner', sharp_deg=30)


def _blade(b, a0, a1, x, z, h, sweep=0.5, up=1, t=0.009, mat=G_METAL):
    pl = [P3(a0, x, z), P3(a1, x, z), P3(a1 + sweep * h, x, z + up * h), P3(a0 + sweep * h + (a1 - a0) * 0.4, x, z + up * h)]
    b.loft([[p + Vector((t, 0, 0)) for p in pl], [p + Vector((-t, 0, 0)) for p in pl]], mat, cap0=mat, cap1=mat)


def details():
    b = B()
    # щупы под носом (se_12)
    for sg, a, zz, l in ((1, 1.05, 0.22, 0.17), (-1, 1.05, 0.22, 0.17), (1, 1.72, 0.14, 0.15), (-1, 1.72, 0.14, 0.15)):
        hit, nrm = ray(a, 0, 'r' if sg > 0 else 'l', z=zz); n_ = (nrm + Vector((0, 0.5, -0.6))).normalized()
        strut(b, hit - n_ * 0.02, hit + n_ * l * 0.75, 0.012, G_METAL); strut(b, hit + n_ * l * 0.75, hit + n_ * l, 0.005, G_METAL)
    # антенны на спине и снизу (se_09, 12)
    hit, _ = ray(4.65, 0.0, 'top'); _blade(b, 4.45, 4.72, 0.0, hit.z - 0.02, 0.20, 0.45, 1, 0.010)
    hit, _ = ray(7.90, 0.0, 'top'); _blade(b, 7.75, 7.98, 0.0, hit.z - 0.02, 0.15, 0.45, 1, 0.009)
    for a, x in ((3.92, 0.0), (11.20, 0.20), (5.10, -0.22)):
        hit, _ = ray(a, x, 'bot'); _blade(b, a, a + 0.20, x, hit.z + 0.02, -0.14, 0.3, 1)
    # огонь на конце киля, огни на законцовках
    a = g.F_TE(2.50); strut(b, P3(a - 0.05, 0.0, 2.50), P3(a + 0.06, 0.0, 2.50), 0.016, G_METAL)
    return b.finish('det_bits', sharp_deg=45)


def seals():
    """Тёмная полоса в щели складывания консоли: насквозь не видно неба."""
    b = B(); T = 0.0015
    for sg in (1, -1):
        rows = []; a0 = g.LE_I(g.FOLD_X) + g.SLAT_I(g.FOLD_X) + 0.08; a1 = g.TE_I(g.FOLD_X) - 0.03
        for i in range(7):
            a_ = a0 + (a1 - a0) * i / 6; y_ = g.wy(g.FOLD_X); rows.append([P3(a_, sg * (g.FOLD_X - 0.030), y_ + T), P3(a_, sg * (g.FOLD_X + 0.030), y_ + T), P3(a_, sg * (g.FOLD_X + 0.030), y_ - T), P3(a_, sg * (g.FOLD_X - 0.030), y_ - T)])
        b.loft(rows, G_DARK, cap0=G_DARK, cap1=G_DARK)
    return b.finish('det_seal', sharp_deg=30)


def hinges():
    b = B()
    for sg in (1, -1):
        for x, HG in ((1.20, g.HINGE_I), (2.15, g.HINGE_I), (3.15, g.HINGE_O)):
            a_h = HG(x); y = g.wy(x); rg = lambda a, r: [P3(a, sg * x + r * 0.55 * math.cos(2 * math.pi * q / 10), y - 0.05 + r * math.sin(2 * math.pi * q / 10) * 0.9) for q in range(10)]
            prof = [(a_h - 0.52, 0.006), (a_h - 0.36, 0.042), (a_h - 0.16, 0.052), (a_h - 0.07, 0.026)]
            b.loft([rg(a, r) for a, r in prof], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
        for t_ in (0.30, 0.55, 0.80):                           # шарниры складывания снизу (se_04)
            a = g.LE_I(g.FOLD_X) + (g.TE_I(g.FOLD_X) - g.LE_I(g.FOLD_X)) * t_; x = sg * g.FOLD_X; y = g.wy(g.FOLD_X) - 0.040; rg = lambda dx, r: [P3(a + r * math.cos(2 * math.pi * q / 8), x + dx, y + r * math.sin(2 * math.pi * q / 8)) for q in range(8)]
            b.loft([rg(-0.05, 0.022), rg(0.05, 0.022)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('det_hinges', sharp_deg=45)


def hardpoints():
    """Замки: на пилонах площадка и упоры; под фюзеляжем только низкие проушины заподлицо."""
    out = []
    for sx in (1, -1):
        b = B(); n_ = 'r' if sx > 0 else 'l'
        for _, x, a0, a1, y0 in g.PYLON_DEF:
            am = (a0 + a1) / 2; xb = sx * x; _box(b, am - 0.30, am + 0.30, xb - 0.040, xb + 0.040, y0 - 0.012, y0 + 0.012, G_METAL)
            for da in (-0.20, 0.20):
                for ss in (-1, 1): strut(b, P3(am + da, xb + ss * 0.045, y0 + 0.05), P3(am + da, xb + ss * 0.08, y0 + 0.002), 0.008, G_METAL)
        for tag, x, am in g.FUSE_DEF:
            for da in (-0.17, 0.17):
                y_ = g.down(sx * x, Yb(am + da), z0=-3.0, dirn=1).z; _box(b, am + da - 0.018, am + da + 0.018, sx * x - 0.016, sx * x + 0.016, y_ - 0.012, y_ + 0.006, G_METAL)
        out.append(b.finish('det_hard_' + n_, sharp_deg=40))
    return out
