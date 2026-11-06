# viggen_detail.py - кабина, сопла изнутри, детали, перегородки в щелях, канавки для Saab Viggen.
import math
import bmesh
import bpy
from mathutils import Vector
from modelkit import B
import viggen_geo as g
from viggen_geo import P3, Yb, strut, _apply_bool, _drop, G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK
from mathutils.bvhtree import BVHTree

G_STRAP, G_SCREEN, G_BELT, G_HANDLE, G_SEAM = 6, 7, 8, 9, 10
G_HUD = G_GLASS


def ray(a, x, side, z=None):
    """Точка обшивки: side 'top'/'bot' - луч сверху/снизу над (a, x); 'r'/'l' - сбоку на уровне z."""
    t = g.BVH['t']; y = Yb(a)
    if side == 'top': h = t.ray_cast(Vector((x, y, 5.0)), Vector((0, 0, -1)))
    elif side == 'bot': h = t.ray_cast(Vector((x, y, -4.0)), Vector((0, 0, 1)))
    elif side == 'r': h = t.ray_cast(Vector((6.0, y, z)), Vector((-1, 0, 0)))
    else: h = t.ray_cast(Vector((-6.0, y, z)), Vector((1, 0, 0)))
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


def resharp(host, deg=38):
    bm = bmesh.new(); bm.from_mesh(host.data); lim = math.radians(deg)
    for f in bm.faces: f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2: e.smooth = e.calc_face_angle(0.0) < lim
        else: e.smooth = False
    bm.to_mesh(host.data); bm.free()


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
    """Катапультное кресло: рама, чаша, подушки, заголовник, рельсы, ремни с пряжкой, рукоятки."""
    X = Vector((1, 0, 0)); F = Vector((0, -1, 0)); UP = Vector((0, 0, 1)); tilt = math.radians(26)      # у F-16 спинка заметно отклонена
    W = Vector((0, -math.sin(tilt), math.cos(tilt))); N = Vector((0, -math.cos(tilt), -math.sin(tilt)))
    hw = 0.225; base = P3(aS + 0.50, 0, floor + 0.26)
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
        h0 = P3(aS + 0.08, sg * (hw - 0.002), floor + 0.27); h1 = P3(aS + 0.26, sg * (hw - 0.002), floor + 0.30)
        strut(b, h0, h1, 0.011, G_HANDLE); strut(b, h0, P3(aS + 0.08, sg * (hw - 0.002), floor + 0.13), 0.009, G_HANDLE)
        strut(b, base + W * 0.18 + N * 0.04 + X * (sg * (hw + 0.022)), base + W * 0.44 + N * 0.04 + X * (sg * (hw + 0.022)), 0.022, G_METAL)
    _tbox(b, buck, X, UP, F, 0.032, 0.006, 0.030, G_METAL, ch=0)
    belt(P3(aS + 0.015, 0, floor + 0.35), buck, 0.016)
    r0 = P3(aS - 0.005, -0.055, floor + 0.235); r1 = P3(aS - 0.005, 0.055, floor + 0.235)
    strut(b, r0, r1, 0.011, G_HANDLE); strut(b, r0, P3(aS + 0.03, -0.045, floor + 0.15), 0.008, G_HANDLE); strut(b, r1, P3(aS + 0.03, 0.045, floor + 0.15), 0.008, G_HANDLE)


def _panel(b, aF, floor, wide=0.33, screens=3, hud=False):
    """Приборная доска с экранами, козырёк, тумба; у передней кабины коллиматор с зелёным стеклом (f16_01)."""
    top = floor + 0.70
    u = Vector((1, 0, 0)); tl = math.radians(18); v = Vector((0, math.sin(tl), math.cos(tl))); w = Vector((0, -math.cos(tl), math.sin(tl)))
    c = P3(aF, 0, top - 0.26); _tbox(b, c, u, v, w, wide, 0.27, 0.05, G_COCK)
    def scr(cx, cy, s, mat=G_SCREEN):
        p = c + u * cx + v * cy + w * 0.052
        _tbox(b, p, u, v, w, s + 0.016, s + 0.016, 0.010, G_COCK); _tbox(b, p + w * 0.011, u, v, w, s, s, 0.002, mat)
        for sg in (1, -1):
            for j in range(5):
                q = p + u * (sg * (s + 0.010)) + v * (-s * 0.8 + j * s * 0.4) + w * 0.012
                _tbox(b, q, u, v, w, 0.004, 0.006, 0.004, G_METAL)
    if screens == 3: scr(0.0, 0.07, 0.085); scr(-0.21, 0.05, 0.075); scr(0.21, 0.05, 0.075); scr(0.0, -0.13, 0.055)
    else: scr(-0.15, 0.06, 0.092); scr(0.15, 0.06, 0.092); scr(0.0, -0.14, 0.065); scr(-0.25, -0.10, 0.045); scr(0.25, -0.10, 0.045)
    # у задней кабины крупный экран светится зелёным, как на f16_01
    if not hud: scr(0.0, 0.205, 0.075, G_HUD)
    if not hud: _box(b, aF - 0.12, aF + 0.03, -wide - 0.02, wide + 0.02, top, top + 0.045, G_DARK, ch=0.015)
    _box(b, aF - 0.52, aF + 0.0, -0.09, 0.09, floor, top - 0.52, G_COCK, ch=0.02)
    for sg in (1, -1):
        _tbox(b, P3(aF - 0.10, sg * 0.14, floor + 0.14), u, Vector((0, 0.5, 0.86)).normalized(), Vector((0, -0.86, 0.5)).normalized(), 0.055, 0.09, 0.012, G_METAL)
    if hud:
        hy = top - 0.012
        _box(b, aF - 0.14, aF + 0.08, -wide - 0.02, wide + 0.02, top - 0.03, top + 0.012, G_DARK, ch=0.012)
        _box(b, aF - 0.10, aF + 0.06, -0.085, 0.085, hy, hy + 0.055, G_DARK, ch=0.01)
        for sg in (1, -1): strut(b, P3(aF + 0.01, sg * 0.075, hy + 0.055), P3(aF + 0.06, sg * 0.075, hy + 0.16), 0.007, G_DARK)
        _tbox(b, P3(aF + 0.055, 0, hy + 0.125), u, Vector((0, 0.25, 1)).normalized(), Vector((0, -1, 0.25)).normalized(), 0.082, 0.072, 0.002, G_HUD, ch=0)


def _consoles(b, aS, floor):
    """Боковые пульты, РУД слева, боковая ручка справа (у F-16 она на правом пульте)."""
    x0 = 0.270; y = floor + 0.40
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
            for i in range(3):
                xk = xl + 0.02 + w_ * (i + 0.5) / 3
                for rw in range(2 if ln > 0.11 else 1):
                    ak = pos + (ln / (2 if ln > 0.11 else 1)) * (rw + 0.5)
                    if (i + j + rw) % 3 == 0: strut(b, P3(ak, xk, y + hh), P3(ak - 0.006, xk, y + hh + 0.020), 0.0028, G_METAL)
                    elif (i + j + rw) % 3 == 1: strut(b, P3(ak, xk, y + hh), P3(ak, xk, y + hh + 0.012), 0.0085, G_DARK)
                    else: _box(b, ak - 0.007, ak + 0.007, xk - 0.010, xk + 0.010, y + hh, y + hh + 0.003, G_SCREEN)
            pos += ln; j += 1
    xt = -x0 - 0.052
    _box(b, aS - 0.36, aS - 0.10, xt - 0.040, xt + 0.040, y, y + 0.020, G_DARK, ch=0.005)
    strut(b, P3(aS - 0.21, xt, y + 0.015), P3(aS - 0.25, xt, y + 0.135), 0.010, G_METAL)
    _pad(b, P3(aS - 0.30, xt, y + 0.165), Vector((0, -1, 0)), Vector((1, 0, 0)), Vector((0, 0, 1)), [(0.0, 0.026, 0.020, 0), (0.02, 0.040, 0.034, 0), (0.09, 0.042, 0.038, 0), (0.12, 0.030, 0.022, 0)], G_COCK)
    xs = x0 + 0.056                                             # боковая ручка на правом пульте
    strut(b, P3(aS - 0.12, xs, y), P3(aS - 0.14, xs, y + 0.05), 0.020, G_DARK)
    _pad(b, P3(aS - 0.14, xs, y + 0.05), Vector((0, 0, 1)), Vector((1, 0, 0)), Vector((0, 1, 0)), [(0.0, 0.015, 0.018, 0), (0.03, 0.021, 0.026, 0), (0.12, 0.020, 0.024, 0.004), (0.155, 0.012, 0.015, 0.004)], G_COCK)


def _deck(b):
    """Антибликовый гребень перед передней кабиной."""
    st = g.stations(2.92, 3.34, 0.06); rs = []
    for a in st:
        hw = g.CAN_T[1](a) - 0.004; ring = []
        for k in range(17):
            x = hw * (-1 + 2 * k / 16); ring.append(P3(a, x, g.skin_top(a, abs(x)) + 0.004))
        for k in range(17):
            x = hw * (1 - 2 * k / 16); ring.append(P3(a, x, g.skin_top(a, abs(x)) - 0.030))
        rs.append(ring)
    b.loft(rs, G_DARK, cap0=G_DARK, cap1=G_DARK)


def _blade(b, a0, a1, x, z, h, sweep=0.5, up=1, t=0.009, mat=G_METAL):
    pl = [P3(a0, x, z), P3(a1, x, z), P3(a1 + sweep * h, x, z + up * h), P3(a0 + sweep * h + (a1 - a0) * 0.4, x, z + up * h)]
    b.loft([[p + Vector((t, 0, 0)) for p in pl], [p + Vector((-t, 0, 0)) for p in pl]], mat, cap0=mat, cap1=mat)


def _bump(b, a, hit, nrm, hl, hw, h, mat=G_SKIN):
    """Каплевидная накладка на обшивке вдоль потока: длина 2hl."""
    n_ = nrm.normalized(); side = Vector((0, 1, 0)).cross(n_).normalized(); fwd = n_.cross(side).normalized()
    if fwd.y < 0: fwd = -fwd
    prof = [(-1.0, 0.04), (-0.82, 0.48), (-0.45, 0.88), (0.0, 1.0), (0.5, 0.82), (0.85, 0.38), (1.0, 0.04)]
    rings = []
    for t, k in prof:
        c = hit + fwd * (t * hl); rings.append([c + side * (hw * k * math.cos(2 * math.pi * q / 12)) + n_ * (h * k * max(0.0, math.sin(2 * math.pi * q / 12)) - 0.012) for q in range(12)])
    b.loft(rings, mat, cap0=mat, cap1=mat)


def _cigar(b, a0, a1, c_x, c_z, r, mat=G_SKIN, lens=None):
    """Продольный цилиндр с закруглением: контейнер помех, антенна."""
    n = 14; rg = lambda a, rr: [P3(a, c_x + rr * math.cos(2 * math.pi * q / n), c_z + rr * math.sin(2 * math.pi * q / n)) for q in range(n)]
    st = [(a0, r * 0.1), (a0 + r * 0.6, r * 0.72), (a0 + r * 1.5, r), (a1 - r * 1.2, r), (a1 - r * 0.4, r * 0.65), (a1, r * 0.08)]
    b.loft([rg(a, rr) for a, rr in st], mat, cap0=mat, cap1=mat)



def cockpit_detail():
    b = B()
    for aS, F1, aP, hud_ in ((3.36, 0.02, 2.94, True),):       # одно кресло
        _seat(b, aS, F1); _consoles(b, aS, F1); _panel(b, aP, F1, wide=0.30, screens=3, hud=hud_)
    return b.finish('cockpit_int', sharp_deg=40)


def burner(sx):
    b = B(); K = g.NOZ_K; cx = sx * g.NOZ_X; a0 = g.NAC_A1 - 0.50; F = Vector((0, 1, 0)); X, Z = Vector((1, 0, 0)), Vector((0, 0, 1)); n = 28; c = P3(a0, cx, g.NOZ_Y)
    rg = lambda r, d: [c + (X * math.cos(2 * math.pi * k / n) + Z * math.sin(2 * math.pi * k / n)) * r + F * d for k in range(n)]
    for r_ in (0.270 * K, 0.160 * K): b.loft([rg(r_ - 0.018, -0.03), rg(r_ + 0.018, -0.03), rg(r_ + 0.018, 0.03), rg(r_ - 0.018, 0.03), rg(r_ - 0.018, -0.03)], G_DARK)
    for j in range(20):
        ang = 2 * math.pi * j / 20; u = X * math.cos(ang) + Z * math.sin(ang); v = X * -math.sin(ang) + Z * math.cos(ang)
        s = lambda r_, d: [c + u * r_ + v * 0.006 + F * (d - 0.014), c + u * r_ - v * 0.006 + F * (d - 0.014), c + u * r_ - v * 0.006 + F * (d + 0.014), c + u * r_ + v * 0.006 + F * (d + 0.014)]
        b.loft([s(0.08 * K, 0.10), s(0.36 * K, 0.10)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    a1 = g.NAC_A1 - 1.2; c1 = P3(a1, cx, g.NOZ_Y); rg1 = lambda r, d: [c1 + (X * math.cos(2 * math.pi * k / 16) + Z * math.sin(2 * math.pi * k / 16)) * r + F * d for k in range(16)]
    b.loft([rg1(0.120 * K, 0.0), rg1(0.120 * K, -0.10), rg1(0.075 * K, -0.32), rg1(0.015 * K, -0.44)], G_DARK, cap0=G_DARK, cap1=G_DARK)
    return b.finish('det_burner', sharp_deg=30)


def details():
    b = B(); V = Vector
    # длинный тонкий щуп на острие, с ползунком (01, 03, 05)
    strut(b, P3(0.03, 0.0, 0.0), P3(-0.30, 0.0, 0.0), 0.012, G_METAL); strut(b, P3(-0.30, 0.0, 0.0), P3(-0.79, 0.0, 0.0), 0.006, G_METAL)
    # щупы на носу
    for sg in (1, -1):
        hit, nrm = ray(1.95, 0, 'r' if sg > 0 else 'l', z=0.10); n_ = (nrm + V((0, 0.5, 0))).normalized(); strut(b, hit - n_ * 0.02, hit + n_ * 0.15, 0.010, G_METAL)
    # воздушные совки на плечах гребня и на борту (02, 05, 09): тёмное устье
    for sg in (1, -1):
        sd = 'r' if sg > 0 else 'l'
        hit, _ = ray(7.60, sg * 0.60, 'top'); _cigar(b, 7.25, 7.95, sg * 0.60, hit.z + 0.022, 0.052, G_SKIN); _cigar(b, 7.25, 7.34, sg * 0.60, hit.z + 0.024, 0.040, G_DARK)
        hit, nrm = ray(9.60, 0, sd, z=-0.08); _cigar(b, 9.15, 10.05, hit.x + sg * 0.035, -0.08, 0.070, G_SKIN); _cigar(b, 10.02, 10.08, hit.x + sg * 0.035, -0.08, 0.052, G_DARK)
    # антенны и огни
    hit, _ = ray(5.70, 0.0, 'top'); _blade(b, 5.60, 5.78, 0.0, hit.z - 0.01, 0.075, 0.25, 1, 0.009); strut(b, hit + V((0, -0.42, 0.0)), hit + V((0, -0.42, 0.075)), 0.030, G_HANDLE)
    hit, _ = ray(4.90, 0.0, 'bot'); strut(b, hit + V((0, 0, 0.02)), hit - V((0, 0, 0.075)), 0.036, G_HANDLE)
    hit, _ = ray(6.20, 0.0, 'bot'); _blade(b, 6.10, 6.32, 0.0, hit.z + 0.02, -0.13, 0.3, 1)
    # антенна на передней кромке киля (11)
    strut(b, P3(g.F_LE(2.05) + 0.03, 0.0, 2.05), P3(g.F_LE(2.05) - 0.32, 0.0, 2.08), 0.008, G_METAL)
    return b.finish('det_bits', sharp_deg=45)


def seals():
    """Тёмные перегородки по средней плоскости щелей крыла, уток и руля: сквозь щель не видно неба."""
    b = B(); T = 0.0015
    def plate(F, s0, s1, n, up):
        rings = []
        for i in range(n + 1):
            s_ = s0 + (s1 - s0) * i / n; p0, p1 = F(s_); rings.append([p0 + up * T, p1 + up * T, p1 - up * T, p0 - up * T])
        b.loft(rings, G_DARK, cap0=G_DARK, cap1=G_DARK)
    Z = Vector((0, 0, 1)); W = g.GAP + 0.05
    for sg in (1, -1):
        for R in g.ELEVS:
            plate(lambda x: (P3(g.HING(x) - 0.02, sg * x, g.wz(x, g.HING(x))), P3(g.HING(x) + W, sg * x, g.wz(x, g.HING(x)))), R[0] - 0.02, R[1] + 0.02, 8, Z)
            for X_ in R: plate(lambda da: (P3(g.HING(X_) - 0.02 + da, sg * (X_ - 0.02), g.wz(X_, g.HING(X_) + da)), P3(g.HING(X_) - 0.02 + da, sg * (X_ + 0.02), g.wz(X_, g.HING(X_) + da))), 0.0, g.WTE(X_) - g.HING(X_) - 0.02, 4, Z)
        R = g.CFLAP
        plate(lambda x: (P3(g.CHG(x) - 0.02, sg * x, g.cz(x)), P3(g.CHG(x) + W, sg * x, g.cz(x))), R[0] - 0.02, R[1] + 0.02, 8, Z)
        for X_ in R: plate(lambda da: (P3(g.CHG(X_) - 0.02 + da, sg * (X_ - 0.02), g.cz(X_)), P3(g.CHG(X_) - 0.02 + da, sg * (X_ + 0.02), g.cz(X_))), 0.0, g.CTE(X_) - g.CHG(X_) - 0.02, 2, Z)
    y0, y1 = g.RUD; cut = lambda y: g.F_TE(y) - g.RUD_C(y); X = Vector((1, 0, 0))
    plate(lambda y: (P3(cut(y) - 0.02, 0.0, y), P3(cut(y) + 0.06, 0.0, y)), y0 - 0.01, y1 + 0.01, 8, X)
    for Y_ in (y0, y1): plate(lambda da: (P3(cut(Y_) - 0.02 + da, 0.0, Y_ - 0.022), P3(cut(Y_) - 0.02 + da, 0.0, Y_ + 0.022)), 0.0, g.F_TE(Y_) - cut(Y_) - 0.01, 2, X)
    return b.finish('det_seal', sharp_deg=30)


def hardpoints():
    """Замки на пилонах."""
    out = []
    for sx in (1, -1):
        b = B()
        for tag, x, a0, a1, y0 in g.PYLON_DEF:
            xb = sx * x; f0, f1 = g.PYL_FLAT(a0, a1); am = (f0 + f1) / 2; hl = (f1 - f0) / 2 - 0.01; _box(b, am - hl, am + hl, xb - 0.040, xb + 0.040, y0 - 0.012, y0 + 0.012, G_METAL)
            for da in (-hl + 0.05, hl - 0.05):
                for ss in (-1, 1):
                    strut(b, P3(am + da, xb + ss * 0.045, y0 + 0.05), P3(am + da, xb + ss * 0.08, y0 + 0.002), 0.008, G_METAL)
        out.append(b.finish('det_hard_' + ('r' if sx > 0 else 'l'), sharp_deg=40))
    return out


def rrect_line(a0, a1, q0, q1, r=0.035):
    """Контур лючка со срезанными углами: (a, q)."""
    return [(a0 + r, q0), (a1 - r, q0), (a1, q0 + r), (a1, q1 - r), (a1 - r, q1), (a0 + r, q1), (a0, q1 - r), (a0, q0 + r), (a0 + r, q0)]


# разделка по фото 01, 03, 05, 07: (a, q), q - |x| или высота z. Длинные швы - V-канавки, замкнутые контуры - плиты-крышки
def _HG(x): return 13.82 + (x - 1.00) * -0.09639
TOP_LINES = [
    rrect_line(5.10, 5.46, 0.80, 1.02, 0.025), rrect_line(5.62, 5.98, 0.76, 0.98, 0.025), rrect_line(6.14, 6.50, 0.72, 0.94, 0.025),                    # три крышки на заборнике (01, 05)
]
BOT_LINES = [
    [(4.60, 0.0), (8.40, 0.0)], [(11.00, 0.0), (13.00, 0.0)], [(6.20, 0.30), (8.40, 0.30)],                                                            # брюхо
]
SIDE_PANELS = [
    [(2.30, -0.30), (2.30, 0.46)],                                                                         # нос
    [(11.0, -0.55), (11.0, 0.45)], [(12.40, -0.60), (12.40, 0.45)], rrect_line(10.1, 10.8, 0.10, 0.42, 0.025),   # борт
]
RINGS_BODY = (1.52,)
RINGS_FORE_END = None


def ring_body(a, w=0.0055, d=0.0055):
    """Кольцевой шов по сечению носа: V-канавка в цвет обшивки."""
    top, bot, hw, nt, nb = [t(a) for t in g.HT]; yc = (top + bot) / 2; sc = max(hw, (top - bot) / 2); k0 = 1 - d / max(sc, 0.2); kk = 1.06; ww = w * (1 + (kk - 1) * sc / d)
    def scaled(a_, k):
        return [Vector((p.x * k, Yb(a_), yc + (p.z - yc) * k)) for p in g.hull_ring(a)]
    rs = [scaled(a, k0), scaled(a + ww, kk), scaled(a - ww, kk)]; rs.append(rs[0])
    b = B(); b.loft(rs, G_SKIN); bmesh.ops.remove_doubles(b.bm, verts=b.bm.verts[:], dist=1e-6)
    return b.finish('c_ring', sharp_deg=20)


def carve(host):
    n = 0
    def apply(c):
        nonlocal n
        if c is None: return
        _apply_bool(host, c, 'DIFFERENCE'); _drop(c); n += 1
    for sg in (1, -1):
        sd = 'r' if sg > 0 else 'l'
        for L_ in TOP_LINES:
            if not (len(L_) >= 5 and L_[0] == L_[-1]): apply(groove_obj([(a, sg * x) for a, x in L_], 'top'))
        for L_ in BOT_LINES:
            if not (len(L_) >= 5 and L_[0] == L_[-1]): apply(groove_obj([(a, sg * x) for a, x in L_], 'bot'))
        for L_ in SIDE_PANELS:
            if not (len(L_) >= 5 and L_[0] == L_[-1]): apply(groove_obj(L_, sd))
    for a in RINGS_BODY: apply(ring_body(a))
    return n


def plates():
    """Крышки люков: настоящие плиты на обшивке, 7 мм над ней, с фаской 14 мм. Объект считается обшивкой (та же краска)."""
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
    return b.finish('VG_skin_plates', sharp_deg=28)


def smooth_normals(host, ref_me):
    """Обшивка освещается как гладкая: нормаль каждого угла берётся с поверхности до резки; грани, что от неё отклонились (стенки канавок, ниш, каналов), остаются плоскими и резкими."""
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
