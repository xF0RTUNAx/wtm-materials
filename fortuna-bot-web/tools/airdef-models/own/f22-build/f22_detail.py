# f22_detail.py - детали F-22A поверх формы f22_geo.py. Кресло, пульты и резаки перенесены с F-15E (свой код), остальное своё. Префикс det_ - мелочь, которую игра может убирать на дальней копии.
import math
import bmesh
import bpy
from mathutils import Vector
from modelkit import B
import f22_geo as g
from f22_geo import P3, Yb, Track, strut, _drop, _apply_bool, loft_obj, strip, stations, G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_STRAP, G_SCREEN, G_BELT, G_HANDLE, G_SEAM, G_PRIMER


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

def resharp(host, deg=24):
    bm = bmesh.new(); bm.from_mesh(host.data); lim = math.radians(deg)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces: f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2: e.smooth = e.calc_face_angle(0.0) < lim and e.link_faces[0].material_index == e.link_faces[1].material_index
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



def _panel(b, aF, floor):
    """Широкий экран на всю панель, разделён посередине; козырька и коллиматора нет."""
    top = floor + 0.62; u = Vector((1, 0, 0)); tl = math.radians(16); v = Vector((0, math.sin(tl), math.cos(tl))); w = Vector((0, -math.cos(tl), math.sin(tl)))
    c = P3(aF, 0, top - 0.24); _tbox(b, c, u, v, w, 0.30, 0.22, 0.05, G_COCK)
    p = c + v * 0.03 + w * 0.052
    _tbox(b, p, u, v, w, 0.275, 0.125, 0.010, G_COCK)
    for sg in (1, -1):
        _tbox(b, p + u * (sg * 0.134) + w * 0.011, u, v, w, 0.128, 0.113, 0.002, G_SCREEN)
    for i in range(9):
        q = p + u * (-0.24 + i * 0.06) + v * (-0.125) + w * 0.012; _tbox(b, q, u, v, w, 0.012, 0.007, 0.004, G_METAL)
    _box(b, aF - 0.52, aF + 0.0, -0.09, 0.09, floor, top - 0.50, G_COCK, ch=0.02)
    for sg in (1, -1):
        _tbox(b, P3(aF - 0.10, sg * 0.20, floor + 0.14), u, Vector((0, 0.5, 0.86)).normalized(), Vector((0, -0.86, 0.5)).normalized(), 0.055, 0.09, 0.012, G_METAL)


def cockpit_detail():
    b = B(); aS, floor = 4.10, g.FLOOR
    _seat(b, aS, floor); _consoles(b, aS, floor); _panel(b, 3.42, floor)
    _box(b, 5.05, 5.50, -0.22, 0.22, floor, 0.92, G_COCK, ch=0.02)   # стенка за креслом
    for sg in (1, -1):        # кромка выреза
        st = stations(3.25, 5.50, 0.15)
        rail = lambda a, d, h: P3(a, sg * (g.CK_HW(a) + d), g.body_y(a, g.CK_HW(a) + 0.01) + h)
        rr = [[rail(a, -0.035, -0.05), rail(a, 0.004, -0.05), rail(a, 0.004, 0.010), rail(a, -0.035, 0.010)] for a in st]
        b.loft(rr if sg > 0 else [r[::-1] for r in rr], G_COCK)
    return b.finish('cockpit_int', sharp_deg=40)


def fan(sx):
    """Лицо двигателя в глубине канала: тёмное, видно только снаружи как тень."""
    b = B(); a0 = 8.45; cx, cy = sx * 0.82, 0.15; c = P3(a0, cx, cy); F = Vector((0, 1, 0)); X_, Z = Vector((1, 0, 0)), Vector((0, 0, 1)); n = 14
    rg = lambda r, d: [c + (X_ * math.cos(2 * math.pi * k / n) + Z * math.sin(2 * math.pi * k / n)) * r + F * d for k in range(n)]
    b.loft([rg(0.27, -0.02), rg(0.27, 0.0), rg(0.10, 0.0), rg(0.08, 0.10), rg(0.01, 0.16)], G_COCK, cap1=G_COCK)
    return b.finish('det_fan_' + ('r' if sx > 0 else 'l'), sharp_deg=30)


# ── система под носом, окна, щупы, огни ──
def _hex(c, u, v, r, n=6, rot=0.0):
    return [c + (u * math.cos(rot + 2 * math.pi * k / n) + v * math.sin(rot + 2 * math.pi * k / n)) * r for k in range(n)]


def das(b, a, q, side, r=0.075, n=6, z=None):
    """Окно датчика: рамка заподлицо и тёмное стекло чуть внутри."""
    hit, nrm = ray(a, q, side, z=z) if side in ('r', 'l') else ray(a, q, side)
    if hit is None: return
    n_ = nrm.normalized(); u = n_.cross(Vector((0, 1, 0))).normalized(); v = n_.cross(u)
    c = hit + n_ * 0.004
    b.loft([_hex(c - n_ * 0.02, u, v, r * 1.22, n), _hex(c, u, v, r * 1.22, n), _hex(c + n_ * 0.003, u, v, r * 1.12, n), _hex(c + n_ * 0.003, u, v, r, n), _hex(c, u, v, r, n)], G_COCK, cap1=G_DARK)


def small(skin):
    b = B()
    # щупы по бокам носа и огни на концах крыла и килей
    for sg, sd in ((1, 'r'), (-1, 'l')):
        hit, nrm = ray(1.55, 0, sd, z=-0.08); n_ = nrm.normalized()
        p0 = hit - n_ * 0.01; p1 = hit + n_ * 0.03 + Vector((0, 0.10, 0)); strut(b, p0, p1, 0.008, G_METAL, 8)
    for sg in (1, -1):
        for a in (13.32, 13.62):
            x = sg * (g.X_TIP - 0.01); strut(b, P3(a - 0.04, x, g.wy(g.X_TIP)), P3(a + 0.04, x, g.wy(g.X_TIP)), 0.011, G_GLASS, 8)
        strut(b, P3(16.0, sg * g.fx(2.96), 2.98), P3(16.1, sg * g.fx(2.96), 2.98), 0.012, G_GLASS, 8)
    return [b.finish('det_bits', sharp_deg=45)]


# ── нутро отсеков: потолок, рёбра, трубки, балочные держатели в грунте песочного цвета (f22_20, устройство по f22_06); створки закрыты в файле игры ──
HOLD_C = ((7.75, 0.56), (8.95, 0.56), (10.15, 0.56))    # держатели центрального отсека: a, |x|; ровно под ними точки подвески
HOLD_Y = -0.47                                           # низ держателя


def _tubes(b, a0, a1, xa, xb, yt, sg, rows):
    c = G_PRIMER
    for q, y_, r_, mat in rows:
        x_ = sg * (xa + (xb - xa) * q); pts = [P3(a0 + k * (a1 - a0) / 8, x_ + 0.03 * math.sin(k * 1.7 + q * 9), yt - y_ - 0.012 * math.cos(k * 2.3)) for k in range(9)]
        for p0, p1 in zip(pts, pts[1:]): strut(b, p0, p1, r_, mat, 8)


def bay_c_inner():
    b = B(); C = g.BAY_C; c = G_PRIMER; yt = C['roof'] - 0.005; xc = C['xc'] - 0.04
    # потолок с рёбрами поперёк и балкой посередине
    for i in range(13):
        a = C['a0'] + 0.35 + i * (C['a1'] - C['a0'] - 0.70) / 12; xw = g._c_x(a, xc)
        _box(b, a - 0.022, a + 0.022, -xw, xw, yt - 0.09, yt, c, ch=0.005)
    _box(b, C['a0'] + 0.25, C['a1'] - 0.25, -0.05, 0.05, yt - 0.14, yt, c, ch=0.01)
    for sg in (1, -1):
        _box(b, C['a0'] + 0.35, C['a1'] - 0.35, sg * 0.56 - 0.03, sg * 0.56 + 0.03, yt - 0.05, yt, c)
        _tubes(b, C['a0'] + 0.35, C['a1'] - 0.35, 0.08, 1.02, yt, sg, ((0.12, 0.10, 0.020, c), (0.30, 0.06, 0.015, G_METAL), (0.74, 0.11, 0.022, c), (0.88, 0.06, 0.015, G_METAL)))
        # балочные держатели: корпус, замки, упоры
        for a, x_ in HOLD_C:
            xm = sg * x_
            _box(b, a - 0.36, a + 0.36, xm - 0.055, xm + 0.055, HOLD_Y + 0.02, yt, c, ch=0.015)
            for da in (-0.25, 0.25):
                _box(b, a + da - 0.03, a + da + 0.03, xm - 0.03, xm + 0.03, HOLD_Y, HOLD_Y + 0.03, G_METAL, ch=0.006)
            for dq in (-1, 1):
                strut(b, P3(a + dq * 0.20, xm, yt), P3(a + dq * 0.20, xm + sg * 0.20, HOLD_Y + 0.06), 0.012, G_METAL, 8)
    return b.finish('det_bay_c', sharp_deg=35)


def bay_s_inner(sx):
    b = B(); S_ = g.BAY_S; c = G_PRIMER; yt = -0.40
    for i in range(7):
        a = S_['a0'] + 0.30 + i * (S_['a1'] - S_['a0'] - 0.60) / 6
        _box(b, a - 0.02, a + 0.02, min(sx * 1.18, sx * 1.62), max(sx * 1.18, sx * 1.62), yt - 0.03, yt + 0.02, c, ch=0.005)
    _tubes(b, S_['a0'] + 0.25, S_['a1'] - 0.25, 1.20, 1.60, yt, sx, ((0.2, 0.03, 0.012, c), (0.55, 0.02, 0.010, G_METAL), (0.85, 0.03, 0.012, c)))
    return b.finish('det_bay_s_' + ('r' if sx > 0 else 'l'), sharp_deg=35)


ARM_P = (1.28, -0.50)                                    # ось рычага в боковом отсеке: |x|, y
ARM_A = 8.75; ARM_L = 0.35


def arm(sx):
    """Рычаг ракеты: выдвигается наружу и вниз при открытой створке; на конце балка с пусковой направляющей."""
    b = B(); n_ = 'r' if sx > 0 else 'l'; px, py = ARM_P; T_ = P3(ARM_A, sx * px, py); e_ = P3(ARM_A, sx * px, py - ARM_L)
    for da in (-0.34, 0.34):
        strut(b, T_ + Vector((0, -da, 0)), e_ + Vector((0, -da, 0)), 0.024, G_PRIMER, 10)
    strut(b, T_ + Vector((0, 0.42, 0)), T_ + Vector((0, -0.42, 0)), 0.022, G_METAL, 10)
    _box(b, ARM_A - 0.62, ARM_A + 0.62, sx * px - 0.035, sx * px + 0.035, py - ARM_L - 0.06, py - ARM_L + 0.02, G_PRIMER, ch=0.012)
    _box(b, ARM_A - 0.55, ARM_A + 0.55, sx * px - 0.018, sx * px + 0.018, py - ARM_L - 0.085, py - ARM_L - 0.06, G_METAL, ch=0.005)
    ob = b.finish('arm_s_' + n_, sharp_deg=35); g._rel(ob, T_)
    g.PARTS['arm_s_' + n_] = dict(pivot=T_.copy(), axis=Vector((0, 1, 0)), range=(-58.0, 0.0) if sx > 0 else (0.0, 58.0), note='рычаг ракеты в боковом отсеке: 0 - внутри, крайнее положение - наружу и вниз; только при открытой створке')
    return ob


# ── люк дозаправки на спине: в файле закрыт ──
FUEL = (9.00, 9.76, 0.165)   # по f22_01, f22_04


def fuel_door():
    a0, a1, hw = FUEL
    ob = g.patch('door_fuel', lambda u, v: (a0 + (a1 - a0) * v, -hw + 2 * hw * u), 6, 6, dirn=-1, lift=0.003, th=0.012, back=G_COCK, z0=3.0)
    h = g.down(0.0, Yb(a0), z0=3.0, dirn=-1); pv = Vector((0.0, Yb(a0), h.z + 0.006)); g._rel(ob, pv)
    g.PARTS['door_fuel'] = dict(pivot=pv.copy(), axis=Vector((-1, 0, 0)), range=(0.0, 80.0), note='0 - закрыт (в игре), шарнир спереди; плюс - задняя кромка вверх')
    return ob


def fuel_bay(host):
    a0, a1, hw = FUEL; y = 0.74
    rs = [[P3(a, -hw - 0.006, y), P3(a, hw + 0.006, y), P3(a, hw + 0.006, 1.6), P3(a, -hw - 0.006, 1.6)] for a in (a0 - 0.006, a1 + 0.006)]
    c = loft_obj('c_fuel', rs, G_COCK, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)


# ── разделка: линии вдоль кромок и навесок, немного лючков. a, x ──
TOP_LINES = [
    [(6.60, 0.45), (13.60, 0.45)], [(7.00, 1.15), (13.00, 1.15)], [(8.20, 0.45), (8.20, 1.15)], [(10.70, 0.45), (10.70, 1.15)], [(13.00, 0.45), (13.00, 1.15)],
    [(14.20, 0.10), (14.20, 0.45)], [(10.90, 2.45), (13.10, 2.45)],
    [(13.30, 2.70), (13.05, 4.60)],                                                                                  # перед флапероном
    [(11.20, 3.50), (12.90, 3.50)], [(12.40, 4.80), (13.00, 4.80)],
]
BOT_LINES = [
    [(13.30, 2.70), (13.05, 4.60)], [(11.20, 3.50), (12.90, 3.50)], [(12.60, 0.30), (12.60, 1.30)], [(6.30, 0.20), (6.30, 0.60)], [(13.60, 0.30), (13.60, 1.20)],
]
SIDE_PANELS = [
    [(1.80, -0.16), (1.80, 0.12)], [(2.80, -0.30), (4.40, -0.34)], [(2.80, -0.30), (2.80, -0.02)], [(4.40, -0.34), (4.40, -0.04)],
    [(10.40, -0.70), (10.40, -0.20)],
]
RINGS = (1.75, )


def ring_groove(a, w=0.0032, d=0.004):
    def sc(a_, k):
        cy = (g.BT[0](a) + g.BT[13](a)) / 2; return [Vector((v.x * k, v.y, cy + (v.z - cy) * k)) for v in g.body_ring(a_)]
    hw = max(g.BT[7](a), 0.2); k0 = 1 - d / hw; k1 = 1.06
    rs = [sc(a - w, k0), sc(a + w, k0), sc(a + w, k1), sc(a - w, k1)]; rs.append(rs[0])
    b = B(); b.loft(rs, G_SEAM); bmesh.ops.remove_doubles(b.bm, verts=b.bm.verts[:], dist=1e-6)
    return b.finish('c_ring', sharp_deg=20)


def carve(host):
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
    for a in RINGS: apply(ring_groove(a))
    return n
