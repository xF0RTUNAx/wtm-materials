# f5_detail.py - детали F-5E (этап 3): каплевидный фонарь с козырьком и рамами, кабина с креслом, ПВД, тормозные щитки снизу (фото 09),
# створки подпитки над крылом на коробе заборника (фото 01), пилоны (два под крылом, один под фюзеляжем), подфюзеляжный бак (фото 07), точки подвески.
import math
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B
import f5_geo as g
from f5kit import Track, stations, _sm, loft_obj, _rel, _apply_bool, _drop, thk

P3 = g.P3
SK = {}


def ready(skin):
    me = skin.data; SK['t'] = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])


def top_z(a, x):
    h = SK['t'].ray_cast(Vector((x, g.Yb(a), 3.0)), Vector((0, 0, -1))); return h[0].z if h[0] is not None else g.FT[0](a)


def bot_pt(a, x):
    h = SK['t'].ray_cast(Vector((x, g.Yb(a), -4.0)), Vector((0, 0, 1))); return h[0] if h[0] is not None else P3(a, x, g.FT[1](a))


# ── фонарь: козырёк (неподвижный, 4,40…5,12) и откидная капля (5,12…7,05), петли сзади ──
CN_A0, CN_A1, CN_AW = 4.40, 7.05, 5.12
CN_TOP = Track([(a, z + g.DZ(a)) for a, z in ((4.40, -0.485), (4.62, -0.37), (4.85, -0.20), (5.12, -0.05), (5.70, 0.045), (6.20, 0.055), (6.70, 0.000), (7.05, -0.080))])   # верх поднят вместе с фюзеляжем (g.DZ)
CN_HW = Track([(4.40, 0.30), (4.80, 0.37), (5.12, 0.40), (5.90, 0.415), (6.60, 0.37), (7.05, 0.28)])


def sill(a):
    """Порог фонаря - на самой обшивке у края стекла (луч сверху), чуть ниже: стекло прилегает без щели."""
    return top_z(a, CN_HW(a) * 0.98) - 0.008


def cn_ring(a, inset=0.0, n=40):
    top, hw = CN_TOP(a) - inset, CN_HW(a) - inset; z0 = min(sill(a), top - 0.05) + 0.002
    out = []
    for k in range(n):
        t = k / (n - 1); c = math.cos(math.pi * t); s = math.sin(math.pi * t)
        out.append(P3(a, hw * math.copysign(abs(c) ** 0.7, c), z0 + (top - z0) * s ** 0.8))
    return out


def _strip(b, rings, mat):
    bm = b.bm; vs = [[bm.verts.new(p) for p in r] for r in rings]
    for i in range(len(vs) - 1):
        for j in range(len(vs[0]) - 1):
            f = bm.faces.new((vs[i][j], vs[i][j + 1], vs[i + 1][j + 1], vs[i + 1][j])); f.material_index = mat


def _arch(bb, a, w, h=0.026):
    ri0 = cn_ring(a - w, 0.010); ro0 = cn_ring(a - w, -h); ro1 = cn_ring(a + w, -h); ri1 = cn_ring(a + w, 0.010); _strip(bb, [ri0, ro0, ro1, ri1, ri0], g.G_SKIN)


def canopy():
    b3 = B(); _strip(b3, [cn_ring(a) for a in stations(CN_A0 + 0.01, CN_AW - 0.01, 0.05)], g.G_GLASS); gl = b3.finish('canopy_glass', sharp_deg=60)
    bw = B(); _arch(bw, CN_A0 + 0.03, 0.03); _arch(bw, CN_AW - 0.02, 0.022); n = 40
    rs = []
    for a in stations(CN_A0 + 0.02, CN_AW - 0.02, 0.05):              # средняя стойка козырька
        p = cn_ring(a, 0.0, n)[n // 2]; rs.append([p + Vector((-0.016, 0, -0.01)), p + Vector((0.016, 0, -0.01)), p + Vector((0.016, 0, 0.018)), p + Vector((-0.016, 0, 0.018))])
    bw.loft(rs, g.G_SKIN, cap0=g.G_SKIN, cap1=g.G_SKIN); wf = bw.finish('windscreen_frame', sharp_deg=45)
    bc = B(); _arch(bc, CN_AW + 0.02, 0.022); _arch(bc, CN_A1 - 0.03, 0.03)
    for sg in (1, -1):                                              # пороги откидной части
        rail = lambda a, d, h: P3(a, sg * (CN_HW(a) + d), min(sill(a), CN_TOP(a) - 0.05) + h)
        bc.loft([[rail(a, 0.004, 0.006), rail(a, 0.022, 0.006), rail(a, 0.022, 0.034), rail(a, -0.012, 0.040)] for a in stations(CN_AW + 0.02, CN_A1 - 0.02, 0.06)], g.G_SKIN, cap0=g.G_SKIN, cap1=g.G_SKIN)
    cf = bc.finish('canopy_frame', sharp_deg=45)
    piv = P3(CN_A1 + 0.12, 0.0, CN_TOP(CN_A1) - 0.02); _rel(cf, piv)                     # петля сверху у задней дуги: при открытии дуга не уходит в гаргрот
    b2 = B(); _strip(b2, [cn_ring(a) for a in stations(CN_AW + 0.03, CN_A1 - 0.03, 0.05)], g.G_GLASS); cg = b2.finish('canopy_glass_open', sharp_deg=60)
    for v in cg.data.vertices: v.co -= piv
    cg.parent = cf; cg.matrix_parent_inverse = Matrix.Identity(4); cg.location = (0, 0, 0)
    g.PARTS['canopy_frame'] = dict(pivot=piv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 55.0), note='откидная часть фонаря: петли сзади, ось поперёк; плюс - передняя кромка вверх; стекло canopy_glass_open - ребёнок рамы; в файле закрыто')
    return [gl, wf, cf, cg]


def cock_cut():
    rs = []
    for a in stations(CN_A0 + 0.05, CN_A1 - 0.05, 0.08):
        hw = CN_HW(a) - 0.035; top = 0.3; floor = CN_TOP(6.25) - 1.34       # вырез - только под стеклом
        rs.append([P3(a, -hw, floor), P3(a, hw, floor), P3(a, hw, top), P3(a, -hw, top)])
    return loft_obj('c_cock', rs, g.G_COCK, sharp=25)


def _box(b, c, hx, ha, hz, mat=g.G_COCK):
    rg = lambda y: [c + Vector((-hx, y, -hz)), c + Vector((hx, y, -hz)), c + Vector((hx, y, hz)), c + Vector((-hx, y, hz))]
    b.loft([rg(-ha), rg(ha)], mat, cap0=mat, cap1=mat)


# ── кабина (узлы с образца Gripen, оси те же): кресло, доска со стрелочными приборами, прицел, пульты, РУД, центральная ручка ──
G_STRAP, G_HANDLE = g.G_RADOME, g.G_DUCT          # в кабине: подушки и рукоятки (их отличает paint.py по детали 11)
G_SCREEN = G_GLASS = g.G_GLASS


def strut(b, p0, p1, r, mat, n=10):
    d = (p1 - p0).normalized(); u = d.orthogonal().normalized(); v = d.cross(u)
    ring = lambda p: [p + (u * math.cos(2 * math.pi * k / n) + v * math.sin(2 * math.pi * k / n)) * r for k in range(n)]
    b.loft([ring(p0), ring(p1)], mat, cap0=mat, cap1=mat)


def _box6(b, a0, a1, x0, x1, y0, y1, mat=g.G_COCK, ch=0.0):
    p = lambda a, x, y: P3(a, x, y)
    bot0 = [p(a0, x0, y0), p(a0, x1, y0), p(a0, x1, y1 - ch), p(a0, x1 - ch, y1), p(a0, x0 + ch, y1), p(a0, x0, y1 - ch)] if ch > 0 else [p(a0, x0, y0), p(a0, x1, y0), p(a0, x1, y1), p(a0, x0, y1)]
    bot1 = [q + Vector((0, g.Yb(a1) - g.Yb(a0), 0)) for q in bot0]
    b.loft([bot0, bot1], mat, cap0=mat, cap1=mat)


G_COCK, G_METAL, G_DARK, G_BELT = g.G_COCK, g.G_METAL, g.G_DARK, g.G_BELT
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
    X = Vector((1, 0, 0)); F = Vector((0, -1, 0)); UP = Vector((0, 0, 1)); tilt = math.radians(15)      # у F-5 спинка круче, чем у F-16
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




def _panel5(b, aF, top):
    """Приборная доска F-5E: стрелочные приборы в круглых обечайках, козырёк, прицел со стеклом, тумба."""
    u = Vector((1, 0, 0)); tl = math.radians(14); v = Vector((0, math.sin(tl), math.cos(tl))); w = Vector((0, -math.cos(tl), math.sin(tl)))
    c = P3(aF, 0, top - 0.20); _tbox(b, c, u, v, w, 0.30, 0.20, 0.04, G_COCK)
    def gauge(cx, cy, r):
        p = c + u * cx + v * cy + w * 0.042
        _pad(b, p, w, u, v, [(0.0, r + 0.010, r + 0.010, 0), (0.012, r + 0.010, r + 0.010, 0)], G_COCK, p=2.0)       # обечайка
        _pad(b, p + w * 0.004, w, u, v, [(0.0, r, r, 0), (0.010, r, r, 0)], G_DARK, p=2.0)                          # циферблат
        _tbox(b, p + w * 0.0145 + u * (r * 0.35) + v * (r * 0.15), u, v, w, r * 0.45, 0.0025, 0.0012, G_METAL, ch=0)   # стрелка
    for cx, cy, r in ((-0.20, 0.08, 0.040), (-0.10, 0.08, 0.040), (0.0, 0.10, 0.046), (0.10, 0.08, 0.040), (0.20, 0.08, 0.040),
                      (-0.20, -0.02, 0.034), (-0.10, -0.03, 0.040), (0.0, -0.02, 0.046), (0.10, -0.03, 0.040), (0.20, -0.02, 0.034),
                      (-0.15, -0.12, 0.030), (-0.05, -0.12, 0.030), (0.05, -0.12, 0.030), (0.15, -0.12, 0.030)): gauge(cx, cy, r)
    _box6(b, aF - 0.16, aF + 0.06, -0.31, 0.31, top - 0.02, top + 0.025, G_DARK, ch=0.012)                          # козырёк
    _box6(b, aF - 0.10, aF + 0.05, -0.07, 0.07, top + 0.02, top + 0.09, G_DARK, ch=0.01)                            # прицел
    for sg in (1, -1): strut(b, P3(aF - 0.02, sg * 0.06, top + 0.09), P3(aF + 0.02, sg * 0.06, top + 0.19), 0.006, G_DARK)
    _tbox(b, P3(aF + 0.01, 0, top + 0.155), u, Vector((0, 0.35, 1)).normalized(), Vector((0, -1, 0.35)).normalized(), 0.065, 0.055, 0.002, G_SCREEN, ch=0)   # стекло прицела
    _box6(b, aF + 0.0, aF + 0.40, -0.09, 0.09, top - 0.62, top - 0.36, G_COCK, ch=0.02)                              # тумба


def _consoles(b, aS, floor):
    """Боковые пульты с тумблерами, РУД слева; ручка управления у F-5 по центру (отдельно, в cockpit)."""
    x0 = 0.270; y = floor + 0.40
    for sg in (1, -1):
        x1 = CN_HW(aS + 0.1) - 0.050
        xl, xr = min(sg * x0, sg * x1), max(sg * x0, sg * x1)
        _box6(b, aS - 0.56, aS + 0.50, xl, xr, floor, y, G_DARK, ch=0.008)
        pos = aS - 0.54; j = 0
        for ln in (0.15, 0.10, 0.17, 0.12, 0.15, 0.10, 0.20):
            if pos + ln > aS + 0.50: break
            hh = 0.008 + 0.005 * (j % 3)
            _box6(b, pos + 0.004, pos + ln - 0.004, xl + 0.006, xr - 0.006, y, y + hh, G_COCK, ch=0.002)
            w_ = xr - xl - 0.04
            for i in range(3):
                xk = xl + 0.02 + w_ * (i + 0.5) / 3
                for rw in range(2 if ln > 0.11 else 1):
                    ak = pos + (ln / (2 if ln > 0.11 else 1)) * (rw + 0.5)
                    if (i + j + rw) % 3 == 0: strut(b, P3(ak, xk, y + hh), P3(ak - 0.006, xk, y + hh + 0.020), 0.0028, G_METAL)
                    elif (i + j + rw) % 3 == 1: strut(b, P3(ak, xk, y + hh), P3(ak, xk, y + hh + 0.012), 0.0085, G_DARK)
                    else: _box6(b, ak - 0.007, ak + 0.007, xk - 0.010, xk + 0.010, y + hh, y + hh + 0.003, G_GLASS)
            pos += ln; j += 1
    xt = -x0 - 0.052
    _box6(b, aS - 0.36, aS - 0.10, xt - 0.040, xt + 0.040, y, y + 0.020, G_DARK, ch=0.005)
    strut(b, P3(aS - 0.21, xt, y + 0.015), P3(aS - 0.25, xt, y + 0.135), 0.010, G_METAL)
    _pad(b, P3(aS - 0.30, xt, y + 0.165), Vector((0, -1, 0)), Vector((1, 0, 0)), Vector((0, 0, 1)), [(0.0, 0.026, 0.020, 0), (0.02, 0.040, 0.034, 0), (0.09, 0.042, 0.038, 0), (0.12, 0.030, 0.022, 0)], G_COCK)


def cockpit():
    """Кабина F-5E: катапультное кресло, приборная доска, пульты, РУД, центральная ручка. Подголовник под стеклом фонаря."""
    b = B(); floor = CN_TOP(6.25) - 1.30; aS = 5.86
    _seat(b, aS, floor); _consoles(b, aS, floor); _panel5(b, 5.30, floor + 0.86)
    st0 = P3(aS - 0.30, 0, floor + 0.02); st1 = P3(aS - 0.33, 0, floor + 0.52)                                      # ручка по центру
    _box6(b, aS - 0.38, aS - 0.22, -0.07, 0.07, floor, floor + 0.04, G_DARK, ch=0.01); strut(b, st0, st1, 0.014, G_DARK)
    _pad(b, st1, Vector((0, 0, 1)), Vector((1, 0, 0)), Vector((0, 1, 0)), [(0.0, 0.016, 0.019, 0), (0.03, 0.021, 0.026, 0), (0.12, 0.020, 0.024, 0.004), (0.15, 0.012, 0.015, 0.004)], G_COCK)
    _box6(b, 5.20, 7.00, -0.30, 0.30, floor - 0.02, floor, G_DARK)                                                  # пол
    return b.finish('cockpit_int', sharp_deg=40)


def pitot():
    b = B(); n = 10
    rg = lambda a, r: [P3(a, r * math.sin(2 * math.pi * k / n), -1.105 - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    b.loft([rg(0.0, 0.004), rg(0.02, 0.008), rg(0.30, 0.009), rg(0.32, 0.015), rg(0.48, 0.016)], g.G_METAL, cap0=g.G_METAL, cap1=g.G_METAL)
    return b.finish('det_pitot', sharp_deg=30)


# ── тормозные щитки: две плиты под фюзеляжем впереди ниш шасси, петля спереди (фото 09) ──
SB_A0, SB_A1, SB_X0, SB_X1 = 7.30, 8.45, 0.10, 0.46


def _bottom_plate(name, a0, a1, x0, x1, nu=6, nv=10, th=0.022, mat=g.G_SKIN):
    b = B(); bm = b.bm
    grid = [[bot_pt(a0 + (a1 - a0) * j / nv, x0 + (x1 - x0) * i / nu) for i in range(nu + 1)] for j in range(nv + 1)]
    tv = [[bm.verts.new(p + Vector((0, 0, -0.002))) for p in r] for r in grid]; lv = [[bm.verts.new(p + Vector((0, 0, th))) for p in r] for r in grid]
    def q(vs, m=mat): f = bm.faces.new(vs); f.material_index = m
    for j in range(nv):
        for i in range(nu): q((tv[j][i], tv[j + 1][i], tv[j + 1][i + 1], tv[j][i + 1])); q((lv[j][i], lv[j][i + 1], lv[j + 1][i + 1], lv[j + 1][i]), g.G_COCK)
    for i in range(nu): q((tv[0][i], tv[0][i + 1], lv[0][i + 1], lv[0][i])); q((tv[nv][i + 1], tv[nv][i], lv[nv][i], lv[nv][i + 1]))
    for j in range(nv): q((tv[j + 1][0], tv[j][0], lv[j][0], lv[j + 1][0])); q((tv[j][nu], tv[j + 1][nu], lv[j + 1][nu], lv[j][nu]))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return b.finish(name, sharp_deg=30)


def speedbrakes():
    out = []
    for sx in (1, -1):
        nm = 'sbrake_' + ('r' if sx > 0 else 'l'); x0, x1 = sorted((sx * SB_X0, sx * SB_X1))
        ob = _bottom_plate(nm, SB_A0, SB_A1, x0, x1)
        e0 = bot_pt(SB_A0, sx * SB_X0); e1 = bot_pt(SB_A0, sx * SB_X1); piv = (e0 + e1) / 2; piv.z = min(e0.z, e1.z) - 0.004; ax = Vector(((e1 - e0).x, 0, 0)).normalized()      # ось строго поперёк и ниже всей передней кромки: при выпуске кромка уходит назад, не в стенку выреза
        test = bot_pt(SB_A1, sx * 0.28) - piv
        if (Matrix.Rotation(math.radians(40), 3, ax) @ test).z > test.z: ax = -ax
        _rel(ob, piv); g.PARTS[nm] = dict(pivot=piv.copy(), axis=ax.copy(), range=(0.0, 45.0), note='тормозной щиток: петля у передней кромки; плюс - задняя кромка вниз')
        out.append(ob)
    return out


def sbrake_cuts():
    out = []
    for sx in (1, -1):
        x0, x1 = sorted((sx * (SB_X0 - 0.004), sx * (SB_X1 + 0.004)))
        out.append(loft_obj('c_sb', [[P3(a, x0, -1.8), P3(a, x1, -1.8), P3(a, x1, -1.18), P3(a, x0, -1.18)] for a in (SB_A0 - 0.004, SB_A1 + 0.004)], g.G_COCK, sharp=20))
    return out


# ── створки подпитки над крылом на коробе заборника (фото 01): утоплены в обшивку, шов 4 мм вокруг, петля спереди ──
AUX = ((7.55, 7.95), (8.05, 8.45)); AUX_X = (g.IN_XC - 0.05, g.IN_XC + 0.10); AUX_GAP, AUX_TH = 0.004, 0.010


def _top_plate(name, a0, a1, x0, x1, nu=6, nv=8, th=AUX_TH):
    b = B(); bm = b.bm
    grid = [[P3(a0 + (a1 - a0) * j / nv, x0 + (x1 - x0) * i / nu, 0) for i in range(nu + 1)] for j in range(nv + 1)]
    for r in grid:
        for p in r: p.z = top_z(g.L / 2 - p.y, p.x)
    tv = [[bm.verts.new(p + Vector((0, 0, -0.0008))) for p in r] for r in grid]; lv = [[bm.verts.new(p + Vector((0, 0, -th))) for p in r] for r in grid]
    def q(vs, m=g.G_SKIN): f = bm.faces.new(vs); f.material_index = m
    for j in range(nv):
        for i in range(nu): q((tv[j][i], tv[j][i + 1], tv[j + 1][i + 1], tv[j + 1][i])); q((lv[j][i], lv[j + 1][i], lv[j + 1][i + 1], lv[j][i + 1]), g.G_DARK)
    for i in range(nu): q((tv[0][i + 1], tv[0][i], lv[0][i], lv[0][i + 1])); q((tv[nv][i], tv[nv][i + 1], lv[nv][i + 1], lv[nv][i]))
    for j in range(nv): q((tv[j][0], tv[j + 1][0], lv[j + 1][0], lv[j][0])); q((tv[j + 1][nu], tv[j][nu], lv[j][nu], lv[j + 1][nu]))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return b.finish(name, sharp_deg=30)


def aux_doors():
    out = []
    for sx in (1, -1):
        for i, (a0, a1) in enumerate(AUX):
            x0, x1 = sorted((sx * AUX_X[0], sx * AUX_X[1]))
            ob = _top_plate(f'auxdoor{i + 1}_{"r" if sx > 0 else "l"}', a0, a1, x0, x1)
            e0 = P3(a0, sx * AUX_X[0], top_z(a0, sx * AUX_X[0])); e1 = P3(a0, sx * AUX_X[1], top_z(a0, sx * AUX_X[1])); piv = (e0 + e1) / 2
            nm = ob.name; _rel(ob, piv)
            # неподвижная: открывается внутрь канала, а канал под ней закрыт стенкой - в PARTS не вносим
            out.append(ob)
    return out


def aux_cuts():
    """Ниша под створку: на 4 мм шире со всех сторон и на 1,6 см ниже обшивки - шов виден тёмной линией."""
    out = []
    for sx in (1, -1):
        for a0, a1 in AUX:
            x0, x1 = sorted((sx * (AUX_X[0] - AUX_GAP), sx * (AUX_X[1] + AUX_GAP)))
            zf = min(top_z(a, x) for a in (a0, (a0 + a1) / 2, a1) for x in (x0, x1)) - 0.016
            out.append(loft_obj('c_aux', [[P3(a, x0, zf), P3(a, x1, zf), P3(a, x1, zf + 0.6), P3(a, x0, zf + 0.6)] for a in (a0 - AUX_GAP, a1 + AUX_GAP)], g.G_DARK, sharp=20))
    return out


# ── пилоны и подфюзеляжный бак (фото 07, 09) ──
PYL = {'i': (2.28, 8.90, 9.85), 'o': (2.96, 9.25, 9.88)}   # x, a0, a1; по чертежу f5e_15 (2,38 и 3,09 м, приведено к нашему размаху), кончаются перед осью элерона
PYL_H = 0.26
TANK = dict(a0=6.55, a1=10.60, r=0.300, z=-1.90)


def _wing_bot(a, x):
    h = SK['t'].ray_cast(Vector((x, g.Yb(a), -4.0)), Vector((0, 0, 1))); return h[0].z if h[0] is not None else g.W_ZC - 0.03


def pylons():
    out = []
    for sx in (1, -1):
        for k, (x, a0, a1) in PYL.items():
            b = B(); xx = sx * x; am = (a0 + a1) / 2; z0 = _wing_bot(am, xx) - PYL_H; hw = 0.045
            def sec(a, f): zw = _wing_bot(a, xx) + 0.03; return [P3(a, xx - hw * f, z0), P3(a, xx + hw * f, z0), P3(a, xx + hw * f * 0.8, zw), P3(a, xx - hw * f * 0.8, zw)]
            st = [a0, a0 + 0.10, a0 + 0.35, a1 - 0.30, a1 - 0.08, a1]; fs = [0.10, 0.70, 1.0, 1.0, 0.65, 0.10]
            b.loft([sec(a, f) for a, f in zip(st, fs)], g.G_SKIN, cap0=g.G_SKIN, cap1=g.G_SKIN)
            out.append(b.finish(f'pylon_{k}_{"r" if sx > 0 else "l"}', sharp_deg=40))
            g.STATIONS[f'{k}_{"r" if sx > 0 else "l"}'] = P3(am, xx, z0)
    return out


def tank():
    n = 28; a0, a1, r = TANK['a0'], TANK['a1'], TANK['r']; L_ = a1 - a0
    def prof(a):
        u = (a - a0) / L_
        if u < 0.32: return r * (u / 0.32) ** 0.5
        if u > 0.62: return r * max(0.0, 1 - ((u - 0.62) / 0.38) ** 2) ** 0.5
        return r
    rs = [[P3(a, max(prof(a), 0.004) * math.sin(2 * math.pi * k / n), TANK['z'] - max(prof(a), 0.004) * math.cos(2 * math.pi * k / n)) for k in range(n)] for a in stations(a0, a1, 0.06)]
    return [loft_obj('tank_c', rs, g.G_SKIN, sharp=50)]


def details(skin):
    ready(skin)
    out = canopy() + [cockpit(), pitot()] + speedbrakes() + aux_doors() + pylons()      # бак снизу убран (Mark)
    for c in [cock_cut()] + sbrake_cuts() + aux_cuts(): _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
    return out
