# su_detail.py - детали Су-25 (этап 3): фонарь с козырьком, откидная часть на петлях по правому порогу; кабина (узлы Gripen и F-5E); пушка ГШ-30-2 снизу слева;
# кассеты ложных целей; десять пилонов (по пять на сторону, внешние - под Р-60); точки подвески игры и место контейнера.
import math
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B
import su_geo as g
from su25kit import Track, stations, _sm, loft_obj, _rel, _apply_bool, _drop, thk

P3 = g.P3
SK = {}


def ready(skin):
    me = skin.data; SK['t'] = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])


def top_z(a, x):
    h = SK['t'].ray_cast(Vector((x, g.Yb(a), 3.0)), Vector((0, 0, -1))); return h[0].z if h[0] is not None else g.FT[0](a)


def bot_pt(a, x):
    h = SK['t'].ray_cast(Vector((x, g.Yb(a), -4.0)), Vector((0, 0, 1))); return h[0] if h[0] is not None else P3(a, x, g.FT[1](a))


# ── фонарь: неподвижный козырёк 2,95…3,70 и откидная часть 3,70…5,05; петли по правому порогу, открывается вбок вправо (фото 03, 05).
#    Верх вровень с гаргротом 1,15 (Mark: «кабина ниже - не выше корпуса»; чертёж 01, фото 255); козырёк ~31° от 0,63 ──
CN_A0, CN_A1, CN_AW = 2.95, 5.05, 3.70
CN_TOP = Track([(2.95, 0.630), (3.15, 0.790), (3.40, 0.950), (3.70, 1.075), (4.00, 1.130), (4.40, 1.155), (4.80, 1.155), (5.05, 1.145)])
CN_HW = Track([(2.95, 0.280), (3.30, 0.365), (3.70, 0.415), (4.40, 0.435), (5.05, 0.425)])        # фонарь уже корпуса (фото 04 спереди), борта кабины прямее (FUS nt 3,3) - порог ~0,6 м, а не внизу борта


def sill(a):
    """Порог фонаря - на самой обшивке у края стекла (луч сверху), чуть ниже: стекло прилегает без щели."""
    return top_z(a, CN_HW(a) * 0.98) - 0.008


def cn_ring(a, inset=0.0, n=40, gap=-0.006):
    """Кольцо фонаря. inset > 0 - внутрь, < 0 - наружу (дуги); наружный выступ сходит на нет к порогу - концы дуг не торчат ножками."""
    hw0 = CN_HW(a); top = CN_TOP(a) - inset; z0 = min(top_z(a, hw0) + gap, CN_TOP(a) - 0.05)
    out = []
    for k in range(n):
        t = k / (n - 1); c = math.cos(math.pi * t); s = math.sin(math.pi * t)
        hw = hw0 - inset * (s ** 0.5 if inset < 0 else 1.0)
        x = hw * math.copysign(abs(c) ** 0.7, c); z = z0 + (top - z0) * s ** 0.8
        out.append(P3(a, x, max(z, top_z(a, x) + min(gap, 0.0) * 0.67 + max(gap, 0.0))))          # не ниже обшивки: у козырька фонарь выходит из носа без щели (Mark, снимок 27)
    return out


def _strip(b, rings, mat):
    bm = b.bm; vs = [[bm.verts.new(p) for p in r] for r in rings]
    for i in range(len(vs) - 1):
        for j in range(len(vs[0]) - 1):
            f = bm.faces.new((vs[i][j], vs[i][j + 1], vs[i + 1][j + 1], vs[i + 1][j])); f.material_index = mat


def _arch(bb, a, w, h=0.026, gap=-0.006):
    ri0 = cn_ring(a - w, 0.010, gap=gap); ro0 = cn_ring(a - w, -h, gap=gap); ro1 = cn_ring(a + w, -h, gap=gap); ri1 = cn_ring(a + w, 0.010, gap=gap); _strip(bb, [ri0, ro0, ro1, ri1, ri0], g.G_SKIN)


def canopy():
    b3 = B(); _strip(b3, [cn_ring(a) for a in stations(CN_A0 + 0.01, CN_AW - 0.01, 0.05)], g.G_GLASS); gl = b3.finish('canopy_glass', sharp_deg=60)
    bw = B(); a0 = CN_A0 + 0.002                                     # передняя дуга: спереди заподлицо с носом, выступ только сзади (Mark: козырёк неплотно прилегал)
    _strip(bw, [cn_ring(a0, 0.010), cn_ring(a0, -0.001), cn_ring(a0 + 0.035, -0.020), cn_ring(a0 + 0.07, -0.022), cn_ring(a0 + 0.07, 0.010), cn_ring(a0, 0.010)], g.G_SKIN)
    _arch(bw, CN_AW - 0.02, 0.022); n = 40
    for sg in (1, -1):                                              # пороги козырька: оправа идёт от передней дуги до откидной части без разрыва (Mark)
        rail = lambda a, d, h: P3(a, sg * (CN_HW(a) + d), min(sill(a), CN_TOP(a) - 0.05) + h)
        ks = lambda a: min(1.0, (a - CN_A0) / 0.12)
        bw.loft([[rail(a, 0.004, 0.006), rail(a, 0.004 + 0.018 * ks(a), 0.006), rail(a, 0.004 + 0.018 * ks(a), 0.006 + 0.028 * ks(a)), rail(a, -0.012, 0.010 + 0.030 * ks(a))]
                 for a in stations(CN_A0 + 0.01, CN_AW + 0.005, 0.05)], g.G_SKIN, cap0=g.G_SKIN, cap1=g.G_SKIN)
    rs = []
    for a in stations(CN_A0 + 0.02, CN_AW - 0.02, 0.05):              # средняя стойка козырька
        p = cn_ring(a, 0.0, n)[n // 2]; rs.append([p + Vector((-0.016, 0, -0.01)), p + Vector((0.016, 0, -0.01)), p + Vector((0.016, 0, 0.018)), p + Vector((-0.016, 0, 0.018))])
    bw.loft(rs, g.G_SKIN, cap0=g.G_SKIN, cap1=g.G_SKIN); wf = bw.finish('windscreen_frame', sharp_deg=45)
    bc = B(); OG = 0.003; _arch(bc, CN_AW + 0.03, 0.022, gap=OG); _arch(bc, CN_A1 - 0.03, 0.03, gap=OG); _arch(bc, 4.35, 0.016, 0.020, gap=OG)      # откидная часть - на 3 мм над обшивкой      # дуга на 6 мм за дугой козырька
    for sg in (1, -1):                                              # пороги откидной части: от стыка с козырьком (3 мм) до задней дуги
        rail = lambda a, d, h: P3(a, sg * (CN_HW(a) + d), min(sill(a), CN_TOP(a) - 0.05) + h)
        bc.loft([[rail(a, 0.004, 0.006), rail(a, 0.022, 0.006), rail(a, 0.022, 0.034), rail(a, -0.012, 0.040)] for a in stations(CN_AW + 0.008, CN_A1 - 0.02, 0.06)], g.G_SKIN, cap0=g.G_SKIN, cap1=g.G_SKIN)
    pc = cn_ring(4.55, -0.026)[20]                                  # перископ обзора назад на верху фонаря (низкий, фото 255)
    bc.loft([[pc + Vector((sx_ * 0.032, dy, dz)) for sx_, dz in ((-1, -0.01), (1, -0.01), (1, 0.03), (-1, 0.03))] for dy in (-0.06, 0.06)], g.G_SKIN, cap0=g.G_SKIN, cap1=g.G_SKIN)
    cf = bc.finish('canopy_frame', sharp_deg=45)
    af = CN_AW + 0.03; am = (CN_AW + CN_A1) / 2                        # ось петель горизонтальная, на высоте переднего (самого низкого) порога: вся кромка выше оси - уходит вверх и наружу
    piv = P3(am, max(CN_HW(a_) for a_ in (af, am, CN_A1 - 0.03)) + 0.02, sill(af) + 0.015); HAX = Vector((0, 1, 0)); _rel(cf, piv)
    b2 = B(); _strip(b2, [cn_ring(a, gap=OG) for a in stations(CN_AW + 0.03, CN_A1 - 0.03, 0.05)], g.G_GLASS); cg = b2.finish('canopy_glass_open', sharp_deg=60)
    for v in cg.data.vertices: v.co -= piv
    cg.parent = cf; cg.matrix_parent_inverse = Matrix.Identity(4); cg.location = (0, 0, 0)
    g.PARTS['canopy_frame'] = dict(pivot=piv.copy(), axis=HAX, range=(0.0, 95.0), note='откидная часть фонаря: петли по правому порогу, ось вдоль самолёта на высоте переднего порога; плюс - левый край вверх, фонарь ложится вправо; стекло canopy_glass_open - ребёнок рамы; в файле закрыт')
    return [gl, wf, cf, cg]


def cock_cut():
    rs = []
    for a in stations(CN_A0 + 0.05, CN_A1 - 0.05, 0.08):
        hw = CN_HW(a) - 0.035; top = 1.6; floor = CN_TOP(4.6) - 1.49
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
    b = B(); floor = CN_TOP(4.6) - 1.45; aS = 4.08                   # ниже: откидной вбок фонарь проходит над подголовником
    _seat(b, aS, floor); _consoles(b, aS, floor); _panel5(b, 3.52, floor + 0.86)
    st0 = P3(aS - 0.30, 0, floor + 0.02); st1 = P3(aS - 0.33, 0, floor + 0.52)                                      # ручка по центру
    _box6(b, aS - 0.38, aS - 0.22, -0.07, 0.07, floor, floor + 0.04, G_DARK, ch=0.01); strut(b, st0, st1, 0.014, G_DARK)
    _pad(b, st1, Vector((0, 0, 1)), Vector((1, 0, 0)), Vector((0, 1, 0)), [(0.0, 0.016, 0.019, 0), (0.03, 0.021, 0.026, 0), (0.12, 0.020, 0.024, 0.004), (0.15, 0.012, 0.015, 0.004)], G_COCK)
    _box6(b, 3.40, 5.00, -0.30, 0.30, floor - 0.02, floor, G_DARK)                                                  # пол
    return b.finish('cockpit_int', sharp_deg=40)


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


# ── пушка ГШ-30-2: обтекатель снизу слева в носу, два ствола из выреза (фото 06, 08) ──
GUN = dict(a0=2.20, a1=3.90, x=-0.235, z=-0.43)


def gun_fair():
    G_ = GUN; b = B(); n = 18
    prof = [(G_['a0'], 0.03, 0.03), (G_['a0'] + 0.20, 0.10, 0.085), (G_['a0'] + 0.55, 0.13, 0.11), (G_['a1'] - 0.50, 0.13, 0.11), (G_['a1'] - 0.15, 0.06, 0.05), (G_['a1'], 0.012, 0.012)]
    b.loft([[P3(a, G_['x'] + rx * math.cos(2 * math.pi * q / n), G_['z'] + rz * math.sin(2 * math.pi * q / n)) for q in range(n)] for a, rx, rz in prof], g.G_SKIN, cap0=g.G_SKIN, cap1=g.G_SKIN)
    return b.finish('s_gun', sharp_deg=30)


# ── окно лазерного дальномера (фото Mark 34, 35): нос спереди срезан плоско (плоскость вперёд-вниз 15°), в срезе - утопленное шестиугольное окно, вытянутое по горизонтали ──
LZ = dict(a=1.355, z=-0.075, tilt=math.radians(15), hw=0.185, hh=0.120, d=0.014)
def _lz_frame():
    n_ = Vector((0, math.cos(LZ['tilt']), -math.sin(LZ['tilt']))); u_ = Vector((1, 0, 0)); v_ = n_.cross(u_).normalized()
    if v_.z < 0: v_ = -v_
    return P3(LZ['a'], 0.0, LZ['z']), n_, u_, v_
def laser_cuts():
    C, n_, u_, v_ = _lz_frame()
    big = [C + u_ * x + v_ * y for x, y in ((-0.6, -0.6), (0.6, -0.6), (0.6, 0.6), (-0.6, 0.6))]
    c1 = loft_obj('c_lz_face', [[p + n_ * 0.0 for p in big], [p + n_ * 0.5 for p in big]], g.G_SKIN, sharp=30)
    hx = [(LZ['hw'], 0.0), (LZ['hw'] * 0.62, LZ['hh']), (-LZ['hw'] * 0.62, LZ['hh']), (-LZ['hw'], 0.0), (-LZ['hw'] * 0.62, -LZ['hh']), (LZ['hw'] * 0.62, -LZ['hh'])]
    b = B(); b.loft([[C + u_ * x + v_ * y + n_ * dd for x, y in hx] for dd in (-LZ['d'], 0.3)], g.G_SKIN, cap0=g.G_DARK, cap1=g.G_SKIN); c2 = b.finish('c_lz_win', sharp_deg=30)
    return [c1, c2]
def laser_glass():
    C, n_, u_, v_ = _lz_frame(); k = 0.985
    hx = [(LZ['hw'] * k, 0.0), (LZ['hw'] * 0.62 * k, LZ['hh'] * k), (-LZ['hw'] * 0.62 * k, LZ['hh'] * k), (-LZ['hw'] * k, 0.0), (-LZ['hw'] * 0.62 * k, -LZ['hh'] * k), (LZ['hw'] * 0.62 * k, -LZ['hh'] * k)]
    b = B(); b.loft([[C + u_ * x + v_ * y - n_ * dd for x, y in hx] for dd in (LZ['d'] * 0.55, LZ['d'] * 0.45)], g.G_GLASS, cap0=g.G_GLASS, cap1=g.G_GLASS); return b.finish('canopy_glass_lz', sharp_deg=30)


def gun_cut():
    G_ = GUN; n = 14; r = 0.055; c = (G_['x'] - 0.01, G_['z'] - 0.03)
    rg = lambda a: [P3(a, c[0] + r * 1.2 * math.cos(2 * math.pi * q / n), c[1] + r * math.sin(2 * math.pi * q / n)) for q in range(n)]
    return loft_obj('c_gun', [rg(G_['a0'] - 0.3), rg(G_['a0'] + 0.40)], g.G_DARK, sharp=30)


def gun_barrels():
    G_ = GUN; b = B(); n = 12
    for dx in (-0.022, 0.022):
        x, z = G_['x'] - 0.01 + dx, G_['z'] - 0.03
        rg = lambda a, r: [P3(a, x + r * math.cos(2 * math.pi * q / n), z + r * math.sin(2 * math.pi * q / n)) for q in range(n)]
        b.loft([rg(G_['a0'] - 0.08, 0.016), rg(G_['a0'] - 0.05, 0.019), rg(G_['a0'] + 0.38, 0.019)], g.G_BELT, cap0=g.G_DARK, cap1=g.G_BELT)
    return b.finish('det_gun', sharp_deg=30)


# ── кассеты ложных целей: на хвостовом конусе сверху по бортам и на мотогондолах сверху сзади (фото 10, 11) ──
def chaff():
    b = B()
    def blk(a0, a1, x, z, hw, hh):
        rg = lambda a: [P3(a, x - hw, z - hh), P3(a, x + hw, z - hh), P3(a, x + hw, z + hh), P3(a, x - hw, z + hh)]
        b.loft([rg(a0), rg(a0 + 0.02), rg(a1 - 0.02), rg(a1)], g.G_SKIN, cap0=g.G_SKIN, cap1=g.G_SKIN)
    for sx in (1, -1):
        blk(14.05, 14.85, sx * 0.13, g.FT[0](14.4) - 0.06, 0.055, 0.07)
        x_ = g.NT[0](10.9) - 0.08; z_ = g.NT[1](10.9) + g.NT[3](10.9) - 0.02
        blk(10.40, 11.10, sx * x_, z_, 0.08, 0.05)
    return b.finish('det_chaff', sharp_deg=30)


# ── пилоны: пять на сторону (четыре основных, внешний - под Р-60), узкие; передний обтекатель кончается за осью предкрылка ──
PYL_X = (2.02, 2.80, 3.60, 4.36, 5.10)
PYL_H = (0.30, 0.30, 0.30, 0.30, 0.20)


def _wing_bot(a, x):
    h = SK['t'].ray_cast(Vector((x, g.Yb(a), -4.0)), Vector((0, 0, 1))); return h[0].z if h[0] is not None else g.w_zc(x) - 0.12


def pylons():
    out = []
    for sx in (1, -1):
        for i, x in enumerate(PYL_X):
            c = g.w_te(x) - g.w_le(x); a0 = g.w_le(x) + g.SLAT_C * c + 0.03; a1 = min(a0 + (1.20 if i < 4 else 0.85), g.w_te(x) - max(g.FLAP_C, g.AIL_C) * c - 0.08); hw = 0.040 if i < 4 else 0.030; xx = sx * x
            am = (a0 + a1) / 2; z0 = _wing_bot(am, xx) - PYL_H[i]
            def sec(a, f): zw = _wing_bot(a, xx) + 0.03; return [P3(a, xx - hw * f, z0), P3(a, xx + hw * f, z0), P3(a, xx + hw * f * 0.8, zw), P3(a, xx - hw * f * 0.8, zw)]
            st = [a0, a0 + 0.10, a0 + 0.35, a1 - 0.30, a1 - 0.08, a1]; fs = [0.10, 0.70, 1.0, 1.0, 0.65, 0.10]
            b = B(); b.loft([sec(a, f) for a, f in zip(st, fs)], g.G_SKIN, cap0=g.G_SKIN, cap1=g.G_SKIN)
            nm = f'pylon{i + 1}_{"r" if sx > 0 else "l"}'; out.append(b.finish(nm, sharp_deg=40))
            g.STATIONS[f'p{i + 1}_{"r" if sx > 0 else "l"}'] = P3(am, xx, z0)
    return out


POD_PT = dict(a=8.20, x=0.0)                                         # контейнер на оси под фюзеляжем между гондолами


def details(skin):
    ready(skin)
    out = canopy() + [cockpit(), gun_barrels(), chaff(), laser_glass()] + pylons()
    for c in [cock_cut(), gun_cut()] + laser_cuts(): _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
    gf = gun_fair(); _apply_bool(skin, gf, 'UNION'); _drop(gf)
    zb = min(bot_pt(a, x).z for a in (POD_PT['a'] - 0.6, POD_PT['a'], POD_PT['a'] + 0.6) for x in (-0.24, 0.0, 0.24)); zp = zb - 0.07
    b = B(); hw = 0.035; a0, a1 = POD_PT['a'] - 0.55, POD_PT['a'] + 0.55
    def sec_(a, f): return [P3(a, -hw * f, zp), P3(a, hw * f, zp), P3(a, hw * f * 0.8, bot_pt(a, 0.0).z + 0.03), P3(a, -hw * f * 0.8, bot_pt(a, 0.0).z + 0.03)]
    b.loft([sec_(a, f) for a, f in zip((a0, a0 + 0.08, a0 + 0.3, a1 - 0.25, a1 - 0.06, a1), (0.1, 0.7, 1, 1, 0.65, 0.1))], g.G_SKIN, cap0=g.G_SKIN, cap1=g.G_SKIN)
    out.append(b.finish('pylon_c', sharp_deg=40))
    g.STATIONS['pod'] = P3(POD_PT['a'], 0.0, zp)
    return out
