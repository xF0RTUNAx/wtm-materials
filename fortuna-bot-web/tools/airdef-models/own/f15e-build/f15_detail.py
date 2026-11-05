# f15_detail.py - детали F-15E поверх формы f15_geo.py: разделка обшивки геометрией (канавки), вентрешётки, ниши шасси, кабина, нутро сопел и воздухозаборников, антенны, навески рулей, замки пилонов.
# Мелочь (префикс det_) - отдельные объекты: игра может убирать их на дальней копии.
import math
import bmesh
import bpy
from mathutils import Vector
from modelkit import B
import f15_geo as g
from f15_geo import P3, Yb, Track, strut, wheel, _drop, _apply_bool, loft_obj, sup, G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK

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


def groove_obj(points, side, w=0.0032, d=0.004, step=0.11, name='c_gr'):
    """Режущая лента вдоль линии на обшивке: точки в (a, x) для top/bot, в (a, z) для r/l. Глубина d, ширина 2w. Торцы закрыты."""
    samples = []
    for (p0, p1) in zip(points, points[1:]):
        L_ = math.hypot(p1[0] - p0[0], p1[1] - p0[1]); n = max(1, int(L_ / step))
        for i in range(n): samples.append((p0[0] + (p1[0] - p0[0]) * i / n, p0[1] + (p1[1] - p0[1]) * i / n))
    samples.append(points[-1])
    rings = []
    for i, (a, q) in enumerate(samples):
        hit, nrm = ray(a, q, side, z=q) if side in ('r', 'l') else ray(a, q, side)
        if hit is None: continue
        a0, q0 = samples[max(i - 1, 0)]; a1, q1 = samples[min(i + 1, len(samples) - 1)]
        if side in ('top', 'bot'): tang = Vector((q1 - q0, -(a1 - a0), 0.0))
        else: tang = Vector((0.0, -(a1 - a0), q1 - q0))
        tang.normalize(); n_ = nrm.normalized(); s = tang.cross(n_).normalized() * w
        rings.append([hit - n_ * d - s, hit - n_ * d + s, hit + n_ * 0.03 + s, hit + n_ * 0.03 - s])
    if len(rings) < 2: return None
    b = B(); b.loft(rings, G_SEAM, cap0=G_SEAM, cap1=G_SEAM)
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


def ring_groove(a, kind='fore', w=0.0032, d=0.004):
    """Кольцевой шов на носовой части: разрез по сечению."""
    T = g.FT; top, bot, hw, nt, nb = [t(a) for t in T]; cy = (top + bot) / 2
    def scaled(a_, k):
        return sup(a_, 0.0, cy + (top - cy) * k, cy + (bot - cy) * k, hw * k, nt, nb, 72)
    k0 = 1 - d / max(hw, 0.2); k1 = 1.05
    rs = [scaled(a - w, k0), scaled(a + w, k0), scaled(a + w, k1), scaled(a - w, k1)]
    rs.append(rs[0])
    b = B(); b.loft(rs, G_SEAM); bmesh.ops.remove_doubles(b.bm, verts=b.bm.verts[:], dist=1e-6)
    return b.finish('c_ring', sharp_deg=20)


def nac_groove(a, sx, w=0.0032, d=0.004):
    Tc, Tr = g.tracks(g.NAC); r = Tr(a); cy = Tc(a); n = 56; cx = sx * g.NOZ_X
    rg = lambda a_, rr: [P3(a_, cx + rr * math.sin(2 * math.pi * k / n), cy - rr * math.cos(2 * math.pi * k / n)) for k in range(n)]
    rs = [rg(a - w, r - d), rg(a + w, r - d), rg(a + w, r + 0.03), rg(a - w, r + 0.03)]; rs.append(rs[0])
    b = B(); b.loft(rs, G_SEAM); bmesh.ops.remove_doubles(b.bm, verts=b.bm.verts[:], dist=1e-6)
    return b.finish('c_ring', sharp_deg=20)


# разделка обшивки: линии по виду сверху из фото 03, рендерам 05, 06, 08; на обоих бортах. (a, x)
TOP_LINES = [
    [(8.70, 0.80), (8.70, 1.38)], [(9.60, 0.70), (9.60, 1.60)], [(10.70, 0.66), (10.70, 1.62)], [(11.90, 0.62), (11.90, 1.75)], [(13.60, 0.62), (13.60, 1.20)], [(15.00, 0.60), (15.00, 1.20)], [(16.10, 1.25), (16.10, 1.75)],
    [(8.70, 1.38), (10.70, 1.62), (15.10, 1.95)],                                                       # вдоль корня крыла
    [(9.65, 2.14), (15.20, 2.14)],                                                                      # разъём консоли
    [(9.70, 2.14), (13.55, 5.87)], [(10.45, 2.14), (14.08, 5.70)],                                      # носок и передний лонжерон: идут вдоль кромки, не сеткой
    [(14.32, 2.14), (14.45, 5.50)],                                                                     # задний лонжерон: линия навески
    [(11.55, 3.20), (14.33, 3.20)], [(12.75, 4.40), (14.40, 4.40)],                                     # две нервюры
    [(8.05, 1.60), (8.05, 1.76), (8.22, 1.76), (8.22, 1.60), (8.05, 1.60)], [(9.10, 1.72), (9.10, 1.92), (9.32, 1.92), (9.32, 1.72), (9.10, 1.72)],     # лючки сверху на баке (фото 03)
]
BOT_LINES = [
    [(8.30, 1.02), (8.30, 1.62)], [(11.00, 1.16), (11.00, 2.10)], [(13.60, 1.16), (13.60, 2.10)], [(15.00, 1.26), (15.00, 1.96)], [(8.60, 1.16), (15.60, 1.16)],     # баки
    [(8.70, 0.42), (15.70, 0.42)], [(9.80, 0.42), (9.80, 1.00)], [(12.00, 0.42), (12.00, 1.00)], [(13.80, 0.42), (13.80, 1.00)], [(15.20, 0.20), (15.20, 0.95)],
    [(9.70, 2.14), (13.55, 5.87)], [(10.45, 2.14), (14.08, 5.70)], [(14.32, 2.30), (14.45, 5.50)], [(11.55, 3.20), (14.33, 3.20)],     # низ крыла
]
SIDE_PANELS = [  # (a, z) швы бортов по фото 10, 01 и рендерам 05, 07: один продольный лонжерон и немного лючков, без сетки
    [(3.62, 0.66), (4.88, 0.66), (4.88, 0.92), (3.62, 0.92), (3.62, 0.66)],
    [(5.32, 0.02), (5.85, 0.02), (5.85, 0.60), (5.32, 0.60), (5.32, 0.02)],
    [(3.06, -0.10), (7.05, -0.10)], [(6.60, -0.10), (6.60, 0.62)],
    [(8.90, -0.05), (15.00, -0.05)], [(10.40, -0.72), (10.40, -0.05)], [(13.00, -0.75), (13.00, -0.05)],
    [(11.20, -0.50), (11.90, -0.50), (11.90, -0.20), (11.20, -0.20), (11.20, -0.50)],
]
RINGS_FORE = (2.390, 3.060, 5.150)
RINGS_NAC = (13.900, 15.500, 16.650)


def carve(host):
    """Канавки разделки и вентрешётки: каждая режется отдельно, поперечные ряды крыла сохраняются."""
    n = 0
    def apply(c):
        nonlocal n
        if c is None: return
        _apply_bool(host, c, 'DIFFERENCE'); _drop(c); n += 1
    for sg in (1, -1):
        for L_ in TOP_LINES: apply(groove_obj([(a, sg * x) for a, x in L_], 'top'))
        for L_ in BOT_LINES: apply(groove_obj([(a, sg * x) for a, x in L_], 'bot'))
        sd = 'r' if sg > 0 else 'l'
        for L_ in SIDE_PANELS: apply(groove_obj(L_, sd))
        # лесенка-люк только на левом борту (рендер 07)
        if sg < 0: apply(groove_obj([(5.95, -0.08), (6.45, -0.08), (6.45, 0.40), (5.95, 0.40), (5.95, -0.08)], 'l'))
        # вентрешётки: сверху на плите и над баком (фото 03, рендер 06)
        for a0_, a1_, q0_, q1_, n_ in ((8.80, 9.02, 0.88, 1.26, 6), (9.70, 9.92, 1.12, 1.34, 5), (7.02, 7.14, 0.05, 0.24, 4)):       # решётки жалюзи: планки, а не чёрный вырез (рендер 06)
            for i_ in range(n_):
                s_ = a0_ + (a1_ - a0_) * i_ / n_
                apply(box_cut(s_, s_ + (a1_ - a0_) / n_ * 0.55, sg * q0_, sg * q1_, 'top', 0.022))
        # титановая часть гондолы: продольные швы над и под (рендер 09)
        for dx in (-0.30, -0.10, 0.10, 0.30):
            for sd_ in ('top', 'bot'):
                apply(groove_obj([(16.65, sg * (g.NOZ_X + dx)), (17.36, sg * (g.NOZ_X + dx))], sd_))
    for a in RINGS_FORE: apply(ring_groove(a))
    for sx in (1, -1):
        for a in RINGS_NAC: apply(nac_groove(a, sx))
    return n


# ниши шасси: режутся из обшивки, створки закрывают их; в игровом файле стойки скрыты
NOSE_BAY = (4.95, 6.55, 0.22)
MAIN_BAY = (9.55, 11.75, 1.02, 1.74)


def bays(host):
    a0, a1, hw = NOSE_BAY
    rings = [[P3(a, -hw, 0.32), P3(a, hw, 0.32), P3(a, hw, -1.0), P3(a, -hw, -1.0)] for a in (a0, a1)]
    c = loft_obj('c_bay', rings, G_DARK, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    for sx in (1, -1):
        a0, a1, x0, x1 = MAIN_BAY
        rings = [[P3(a, sx * x0, 0.28), P3(a, sx * x1, 0.28), P3(a, sx * x1, -1.4), P3(a, sx * x0, -1.4)] for a in (a0, a1)]
        c = loft_obj('c_bay', rings, G_DARK, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)


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
        h0 = P3(aS + 0.08, sg * (hw + 0.010), floor + 0.27); h1 = P3(aS + 0.26, sg * (hw + 0.010), floor + 0.30)
        strut(b, h0, h1, 0.011, G_HANDLE); strut(b, h0, P3(aS + 0.08, sg * (hw + 0.010), floor + 0.13), 0.009, G_HANDLE)
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
        p = c + u * cx + v * cy + w * 0.052
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
    """Антибликовый гребень передней кабины: тёмная плита под козырьком по форме спины, на всю ширину стекла."""
    st = g.stations(3.20, 4.03, 0.06); rs = []
    for a in st:
        hw = g.CAN_T[1](a) - 0.004; ring = []
        for k in range(17):
            x = hw * (-1 + 2 * k / 16); ring.append(P3(a, x, g.fore_y(a, abs(x)) + 0.005))
        for k in range(17):
            x = hw * (1 - 2 * k / 16); ring.append(P3(a, x, g.fore_y(a, abs(x)) - 0.030))
        rs.append(ring)
    b.loft(rs, G_DARK, cap0=G_DARK, cap1=G_DARK)


def cockpit_detail():
    """Кабина: два кресла, доски с экранами, пульты, ручки, дуга между кабинами, кромки выреза. Экипажа нет."""
    b = B()
    F1, F2 = 0.40, 0.34                                         # пол: передняя и задняя кабины
    for aS, floor, sc, hud in ((4.480, F1, 3, True), (5.800, F2, 5, False)):
        _seat(b, aS, floor); _consoles(b, aS, floor); _panel(b, aS - 0.72, floor, wide=0.36 if sc == 3 else 0.43, screens=sc, hud=hud)
    _deck(b)
    # задняя стенка между кабинами и за задней кабиной: панели с разделкой
    _box(b, 5.05, 5.16, -0.50, 0.50, 0.34, 1.00, G_COCK, ch=0.02)
    _box(b, 6.56, 6.72, -0.45, 0.45, 0.34, 1.12, G_COCK, ch=0.02)
    # кромка выреза кабины с замками (рендер 04)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (g.CK_HW(a) + d), g.fore_y(a, g.CK_HW(a) + 0.01) + h)
        st = g.stations(3.9, 6.6, 0.18)
        b.loft([[rail(a, -0.040, -0.05) for a in st], [rail(a, 0.003, -0.05) for a in st], [rail(a, 0.003, 0.012) for a in st], [rail(a, -0.040, 0.012) for a in st]], G_COCK)
        for a in (4.15, 4.75, 5.35, 5.95, 6.40):
            y = g.fore_y(a, g.CK_HW(a)); _box(b, a, a + 0.09, min(sg * (g.CK_HW(a) - 0.05), sg * (g.CK_HW(a) + 0.004)), max(sg * (g.CK_HW(a) - 0.05), sg * (g.CK_HW(a) + 0.004)), y + 0.004, y + 0.014, G_COCK)
    ob = b.finish('cockpit_int', sharp_deg=40)
    return ob


# ── нутро сопел: кольцо стабилизатора, форсунки, малый конус в глубине; труба открытая ──
def burner(sx):
    b = B(); cx = sx * g.NOZ_X; a0 = g.NAC_A1 - 0.50; F = Vector((0, 1, 0)); X, Z = Vector((1, 0, 0)), Vector((0, 0, 1)); n = 28
    c = P3(a0, cx, g.NOZ_Y)
    rg = lambda r, d: [c + (X * math.cos(2 * math.pi * k / n) + Z * math.sin(2 * math.pi * k / n)) * r + F * d for k in range(n)]
    for r_ in (0.355, 0.215):                                   # кольца стабилизатора пламени
        b.loft([rg(r_ - 0.018, -0.03), rg(r_ + 0.018, -0.03), rg(r_ + 0.018, 0.03), rg(r_ - 0.018, 0.03), rg(r_ - 0.018, -0.03)], G_DARK)
    for j in range(20):                                         # форсунки: лучи
        ang = 2 * math.pi * j / 20; u = X * math.cos(ang) + Z * math.sin(ang); v = X * -math.sin(ang) + Z * math.cos(ang)
        s = lambda r_, d: [c + u * r_ + v * 0.006 + F * (d - 0.014), c + u * r_ - v * 0.006 + F * (d - 0.014), c + u * r_ - v * 0.006 + F * (d + 0.014), c + u * r_ + v * 0.006 + F * (d + 0.014)]
        b.loft([s(0.100, 0.10), s(0.462, 0.10)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    # малый задний конус турбины глубоко внутри, труба вокруг него открыта
    a1 = g.NAC_A1 - 1.38; c1 = P3(a1, cx, g.NOZ_Y); rg1 = lambda r, d: [c1 + (X * math.cos(2 * math.pi * k / 16) + Z * math.sin(2 * math.pi * k / 16)) * r + F * d for k in range(16)]
    b.loft([rg1(0.150, 0.0), rg1(0.150, -0.10), rg1(0.090, -0.34), rg1(0.015, -0.46)], G_DARK, cap0=G_DARK, cap1=G_DARK)
    return b.finish('det_burner_' + ('r' if sx > 0 else 'l'), sharp_deg=30)


# ── воздухозаборник: две рампы под верхней плитой, тяги; дочерний объект поворотной части ──
def inlet_ramps(sx, parent):
    b = B(); pv = g.PARTS[parent.name]['pivot']
    def plate(a0, a1, dy0, dy1, t=0.016):
        y_ = lambda a, dy: g.CAP_T[2](a) - dy
        xa = lambda a: g.CAP_T[1](a) - 0.058; xb = lambda a: g.CAP_T[0](a) + 0.058
        sec = lambda d_: [P3(a0, sx * xb(a0), y_(a0, dy0) + d_), P3(a0, sx * xa(a0), y_(a0, dy0) + d_), P3(a1, sx * xa(a1), y_(a1, dy1) + d_), P3(a1, sx * xb(a1), y_(a1, dy1) + d_)]
        b.loft([sec(0.0), sec(-t)], G_COCK, cap0=G_COCK, cap1=G_COCK)
    plate(6.20, 7.05, 0.075, 0.150); plate(7.09, 8.00, 0.165, 0.270)  # две рампы с щелью перепуска между ними
    for a, x_ in ((6.75, 1.05), (6.75, 1.35), (7.55, 1.05), (7.55, 1.30)):
        y_ = g.CAP_T[2](a) - (0.11 if a < 7 else 0.22); strut(b, P3(a, sx * x_, y_ - 0.01), P3(a + 0.20, sx * x_, g.CAP_T[2](a + 0.20) - 0.056), 0.011, G_METAL)
    ob = b.finish('det_ramp_' + ('r' if sx > 0 else 'l'), sharp_deg=30)
    for v in ob.data.vertices: v.co -= pv
    ob.parent = parent; ob.location = (0, 0, 0)
    return ob


# ── антенны, щупы, огни (рендеры 05, 07, 08, фото 01, 10) ──
def _blade(b, a0, a1, x, z, h, sweep=0.5, up=1, t=0.009, mat=G_METAL):
    pl = [P3(a0, x, z), P3(a1, x, z), P3(a1 + sweep * h, x, z + up * h), P3(a0 + sweep * h + (a1 - a0) * 0.4, x, z + up * h)]
    b.loft([[p + Vector((t, 0, 0)) for p in pl], [p + Vector((-t, 0, 0)) for p in pl]], mat, cap0=mat, cap1=mat)


def details():
    b = B()
    # щуп давления на левом борту носа и датчики угла атаки (фото 10, рендер 07)
    for sg, a, zz, l in ((1, 3.34, 0.02, 0.26), (-1, 3.34, 0.02, 0.26), (1, 3.34, 0.50, 0.20), (-1, 3.34, 0.50, 0.20)):
        hit, nrm = ray(a, 0, 'r' if sg > 0 else 'l', z=zz); n_ = (nrm + Vector((0, 0.42, 0))).normalized()
        strut(b, hit - n_ * 0.02, hit + n_ * l * 0.75, 0.016, G_METAL); strut(b, hit + n_ * l * 0.75, hit + n_ * l, 0.007, G_METAL)
    # штанга на нижней стороне и лопатка датчика
    for a, x in ((3.70, 0.28), (3.70, -0.28)):
        hit, nrm = ray(a, x, 'bot'); strut(b, hit, hit + Vector((0, 0, -0.17)), 0.018, G_METAL); _blade(b, a - 0.05, a + 0.10, x, hit.z - 0.13, -0.10, 0.2, 1, mat=G_METAL)
    # клинки антенн: спина, низ, за кабиной (фото 01)
    hit, _ = ray(7.32, 0.0, 'top'); _blade(b, 7.28, 7.60, 0.0, hit.z - 0.02, 0.34, 0.45)
    for a, x in ((5.05, 0.0), (7.15, 0.0), (7.60, 0.24)):
        hit, _ = ray(a, x, 'bot'); _blade(b, a, a + 0.26, x, hit.z + 0.02, -0.20, 0.35, 1)
    for a, x in ((12.60, 0.18), (13.50, -0.18), (8.50, 0.30)):
        hit, _ = ray(a, x, 'bot'); _blade(b, a, a + 0.22, x, hit.z + 0.02, -0.17, 0.3, 1)
    # огни на концах крыла (рендер 04): обтекатель сзади-снаружи с плафоном
    for sg in (1, -1):
        a = 14.58; x = sg * 6.32; y = g.wy(6.32); strut(b, P3(a, x, y), P3(a + 0.46, x, y), 0.028, G_METAL)
        strut(b, P3(a + 0.46, x, y), P3(a + 0.56, x, y), 0.014, G_GLASS)
    # огни и антенны на законцовках килей, боковые антенны балок (фото 10, 01)
    for sg in (1, -1):
        a = 17.05; x = sg * g.fx(3.4)
        for dy in (3.20, 3.42):
            strut(b, P3(a - 0.02, x, dy), P3(a + 0.12, x, dy), 0.018, G_METAL)
        cb = lambda a, r: [P3(a, sg * g.BOOM_X + r * math.cos(2 * math.pi * q / 12), 0.430 + r * math.sin(2 * math.pi * q / 12)) for q in range(12)]
        b.loft([cb(a, r) for a, r in ((19.06, 0.014), (19.12, 0.030), (19.19, 0.052), (19.26, 0.050), (19.32, 0.028), (19.345, 0.006))], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('det_bits', sharp_deg=45)


# навески закрылков и элеронов снизу (фото 03, рендер 08): обтекатели
def hinges():
    b = B()
    for sg in (1, -1):
        for x, cd in ((2.60, 1.00), (3.40, 1.00), (4.35, 0.75), (5.15, 0.75)):
            a_h = g.A_TE(x) - cd; y = g.wy(x); rg = lambda a, r: [P3(a, sg * x + r * 0.55 * math.cos(2 * math.pi * q / 10), y - 0.08 + r * math.sin(2 * math.pi * q / 10) * 0.9) for q in range(10)]
            prof = [(a_h - 0.52, 0.006), (a_h - 0.36, 0.050), (a_h - 0.14, 0.066), (a_h - 0.04, 0.040)]
            b.loft([rg(a, r) for a, r in prof], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('det_hinges', sharp_deg=45)


def _lock(b, a, x, y, sg=1):
    """Замок подвески: корпус с двумя опорами-скобами (рендер 08)."""
    _box(b, a - 0.18, a + 0.18, x - 0.040, x + 0.040, y - 0.045, y + 0.01, G_METAL, ch=0.008)
    for da in (-0.14, 0.14):
        for ss in (-1, 1):
            strut(b, P3(a + da, x + ss * 0.036, y - 0.012), P3(a + da, x + ss * 0.082, y - 0.070), 0.008, G_METAL)
            _box(b, a + da - 0.018, a + da + 0.018, x + ss * 0.082 - 0.012, x + ss * 0.082 + 0.012, y - 0.082, y - 0.066, G_METAL)
    strut(b, P3(a, x - 0.05, y - 0.04), P3(a, x + 0.05, y - 0.04), 0.010, G_METAL)


def hardpoints():
    """Замки на пилонах и балках баков, тяги и кабельный короб: низ пилона остаётся ровным за счёт полки."""
    out = []
    for sx in (1, -1):
        b = B()
        x, a0, a1, y0 = g.PYLON_W
        # вырез направляющих: башмаки по обе стороны рендер 08; пилон с кромками
        for am in (a0 + 0.45, a1 - 0.45):
            for ss in (1, -1):
                strut(b, P3(am, sx * x + ss * 0.05, y0 + 0.08), P3(am, sx * x + ss * 0.13, y0 + 0.08), 0.014, G_METAL)
        # кабельный короб над пилоном
        _box(b, a0 + 0.2, a1 - 0.25, sx * x - 0.03, sx * x + 0.03, g.wy(x) - 0.13, g.wy(x) - 0.08, G_METAL, ch=0.01)
        for i in range(3):
            xs, am = g.STUBS[i]; y = g.CFT_BOT(am) - 0.135; _box(b, am - 0.30, am + 0.30, sx * xs - 0.052, sx * xs + 0.052, y - 0.004, y + 0.012, G_METAL)
            for da in (-0.20, 0.20):
                for ss in (-1, 1):
                    strut(b, P3(am + da, sx * xs + ss * 0.04, y + 0.040), P3(am + da, sx * xs + ss * 0.075, y + 0.09), 0.008, G_METAL)
        out.append(b.finish('det_hard_' + ('r' if sx > 0 else 'l'), sharp_deg=40))
    return out
