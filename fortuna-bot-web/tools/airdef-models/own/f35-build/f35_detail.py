# f35_detail.py - детали F-35A поверх формы f35_geo.py. Кресло, пульты и резаки перенесены с F-15E (свой код), остальное своё. Префикс det_ - мелочь, которую игра может убирать на дальней копии.
import math
import bmesh
import bpy
from mathutils import Vector
from modelkit import B
import f35_geo as g
from f35_geo import P3, Yb, Track, strut, _drop, _apply_bool, loft_obj, strip, stations, G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_STRAP, G_SCREEN, G_BELT, G_HANDLE, G_SEAM, G_PRIMER


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
    b = B(); aS, floor = 2.98, g.FLOOR
    _seat(b, aS, floor); _consoles(b, aS, floor); _panel(b, 2.44, floor)
    _box(b, 4.30, 4.72, -0.20, 0.20, floor, 0.98, G_COCK, ch=0.02)   # стенка за креслом
    # кромка выреза
    for sg in (1, -1):
        st = stations(2.3, 4.75, 0.15)
        rail = lambda a, d, h: P3(a, sg * (g.CK_HW(a) + d), g.body_y(a, g.CK_HW(a) + 0.01) + h)
        rr = [[rail(a, -0.035, -0.05), rail(a, 0.004, -0.05), rail(a, 0.004, 0.010), rail(a, -0.035, 0.010)] for a in st]
        b.loft(rr if sg > 0 else [r[::-1] for r in rr], G_COCK)
    return b.finish('cockpit_int', sharp_deg=40)


def fan(sx):
    """Лицо двигателя в глубине канала: тёмное, видно только снаружи как тень."""
    b = B(); a0 = 7.72; cx, cy = sx * 0.95, -0.22; c = P3(a0, cx, cy); F = Vector((0, 1, 0)); X_, Z = Vector((1, 0, 0)), Vector((0, 0, 1)); n = 14
    rg = lambda r, d: [c + (X_ * math.cos(2 * math.pi * k / n) + Z * math.sin(2 * math.pi * k / n)) * r + F * d for k in range(n)]
    b.loft([rg(0.33, -0.02), rg(0.33, 0.0), rg(0.10, 0.0), rg(0.08, 0.10), rg(0.01, 0.16)], G_COCK, cap1=G_COCK)
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


def eots():
    """Граненое окно под носом: тумба, рамка с восемью гранями, тёмное стекло, линза внутри (f35_08, f35_03)."""
    b = B(); a0, a1 = 1.22, 1.90; yb = lambda a: g.body_y(a, 0.0, top=False)
    # тумба: сужается вперёд, грани плоские
    def sec(a, hw, dp):
        y = yb(a) + 0.03; return [P3(a, -hw, y), P3(a, hw, y), P3(a, hw * 0.74, y - dp * 0.72), P3(a, hw * 0.32, y - dp), P3(a, -hw * 0.32, y - dp), P3(a, -hw * 0.74, y - dp * 0.72)]
    prof = [(1.22, 0.015, 0.002), (1.32, 0.070, 0.022), (1.45, 0.125, 0.065), (1.62, 0.165, 0.105), (1.78, 0.175, 0.118), (1.86, 0.170, 0.100), (1.91, 0.130, 0.012)]
    b.loft([sec(*p) for p in prof], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    # окно спереди-снизу: стекло поверх чёрной ниши, рамка
    c = P3(1.56, 0, yb(1.56) - 0.052); nrm = Vector((0, 0.62, -0.78)).normalized(); u = Vector((1, 0, 0)); v = nrm.cross(u).normalized()
    b.loft([_hex(c - nrm * 0.01, u, v, 0.105, 6, math.pi / 6), _hex(c + nrm * 0.014, u, v, 0.105, 6, math.pi / 6), _hex(c + nrm * 0.016, u, v, 0.092, 6, math.pi / 6)], G_COCK, cap1=G_DARK)
    gl = B(); gl.loft([_hex(c + nrm * 0.020, u, v, 0.092, 6, math.pi / 6), _hex(c + nrm * 0.024, u, v, 0.086, 6, math.pi / 6)], G_GLASS, cap1=G_GLASS)
    b.loft([[c + nrm * 0.016 + (u * math.cos(2 * math.pi * k / 16) + v * math.sin(2 * math.pi * k / 16)) * 0.040 for k in range(16)], [c + nrm * 0.021 + (u * math.cos(2 * math.pi * k / 16) + v * math.sin(2 * math.pi * k / 16)) * 0.026 for k in range(16)]], G_METAL, cap1=G_DARK)
    return [b.finish('eots', sharp_deg=22), gl.finish('eots_glass', sharp_deg=60)]


def small(skin):
    out = eots()
    b = B()
    # окна: у фонаря сверху, два на бортах, снизу, сзади (f35_08, f35_09)
    das(b, 1.72, 0.0, 'top', 0.058)
    for sg, sd in ((1, 'r'), (-1, 'l')):
        das(b, 1.85, 0, sd, 0.052, z=-0.10); das(b, 5.30, sg * 0.52, 'top', 0.058)
    das(b, 5.45, 0.34, 'bot', 0.055); das(b, 5.45, -0.34, 'bot', 0.055)
    # щупы на бортах носа (f35_08)
    for sg, sd in ((1, 'r'), (-1, 'l')):
        hit, nrm = ray(2.22, 0, sd, z=-0.20); n_ = nrm.normalized()
        p0 = hit - n_ * 0.01; p1 = hit + n_ * 0.03 + Vector((0, 0.13, 0)); p2 = p1 + Vector((0, 0.09, -0.004))
        strut(b, p0, p1, 0.012, G_METAL, 8); strut(b, p1, p2, 0.005, G_METAL, 8)
    # огни на концах крыла и килей
    for sg in (1, -1):
        for a, x, y in ((10.25, sg * 5.43, g.wy(5.43)), (11.25, sg * 5.43, g.wy(5.43))):
            strut(b, P3(a - 0.05, x, y), P3(a + 0.05, x, y), 0.012, G_GLASS, 8)
        strut(b, P3(13.4, sg * g.fx(2.18), 2.20), P3(13.5, sg * g.fx(2.18), 2.205), 0.012, G_GLASS, 8)
    out.append(b.finish('det_bits', sharp_deg=45))
    return out


# ── нутро отсеков вооружения: рёбра и трубки, грунт песочного цвета (f35_05, f35_06); створки закрыты в файле игры ──
def bay_inner(sx):
    b = B(); B_ = g.BAY_W; c = G_PRIMER; xa, xb = B_['x0'] + 0.05, B_['x1'] - 0.05; yt = -0.13
    for i in range(10):
        a = B_['a0'] + 0.32 + i * (B_['a1'] - B_['a0'] - 0.64) / 9
        _box(b, a - 0.022, a + 0.022, min(sx * xa, sx * xb), max(sx * xa, sx * xb), yt - 0.10, yt, c, ch=0.005)
        for sd, x_ in ((0, xa + 0.01), (1, xb - 0.01)):
            _box(b, a - 0.018, a + 0.018, sx * x_ - 0.018, sx * x_ + 0.018, yt - 0.42, yt, c)
    for q, y_, r_, mat in ((0.20, 0.12, 0.022, c), (0.32, 0.07, 0.017, G_METAL), (0.47, 0.11, 0.026, c), (0.60, 0.08, 0.014, G_METAL), (0.74, 0.13, 0.020, c), (0.86, 0.06, 0.016, G_METAL)):
        x_ = sx * (xa + (xb - xa) * q); pts = [P3(B_['a0'] + 0.30 + k * (B_['a1'] - B_['a0'] - 0.60) / 8, x_ + 0.03 * math.sin(k * 1.7 + q * 9), yt - y_ - 0.012 * math.cos(k * 2.3)) for k in range(9)]
        for p0, p1 in zip(pts, pts[1:]): strut(b, p0, p1, r_, mat, 8)
    # блоки и замки катапультных устройств
    for a, wd in ((7.2, 0.32), (9.6, 0.34)):
        xm = sx * (xa + xb) / 2
        _box(b, a - 0.32, a + 0.32, xm - wd, xm + wd, yt - 0.22, yt - 0.10, c, ch=0.02)
        _box(b, a - 0.10, a + 0.10, xm - 0.04, xm + 0.04, yt - 0.34, yt - 0.22, G_METAL, ch=0.01)
    return b.finish('det_bay_' + ('r' if sx > 0 else 'l'), sharp_deg=35)


# ── люк дозаправки на спине: в файле закрыт ──
FUEL = (7.60, 8.16, 0.145)   # по f35_10 с поправкой на высоту над плоскостью крыла


def fuel_door():
    a0, a1, hw = FUEL
    ob = g.patch('door_fuel', lambda u, v: (a0 + (a1 - a0) * v, -hw + 2 * hw * u), 6, 6, dirn=-1, lift=0.003, th=0.012, back=G_COCK, z0=3.0)
    h = g.down(0.0, Yb(a0), z0=3.0, dirn=-1); pv = Vector((0.0, Yb(a0), h.z + 0.006)); g._rel(ob, pv)
    g.PARTS['door_fuel'] = dict(pivot=pv.copy(), axis=Vector((-1, 0, 0)), range=(0.0, 80.0), note='0 - закрыт (в игре), шарнир спереди; плюс - задняя кромка вверх')
    return ob


def fuel_bay(host):
    a0, a1, hw = FUEL; y = 0.76
    rs = [[P3(a, -hw - 0.006, y), P3(a, hw + 0.006, y), P3(a, hw + 0.006, 1.6), P3(a, -hw - 0.006, 1.6)] for a in (a0 - 0.006, a1 + 0.006)]
    c = loft_obj('c_fuel', rs, G_COCK, sharp=20); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)


# ── разделка: линии вдоль кромок и навесок, немного лючков. a, x ──
TOP_LINES = [
    [(8.30, 2.55), (9.92, 5.05)], [(8.85, 2.50), (10.45, 5.05)],                                                    # за носком: вдоль кромки
    [(11.05, 2.30), (10.95, 4.60)],                                                                                  # перед флапероном
    [(9.90, 2.80), (11.00, 2.80)], [(10.45, 3.80), (11.00, 3.80)],
    [(10.60, 4.90), (11.35, 4.90)],                                                                                  # неподвижный конец
    [(5.55, 1.40), (7.70, 1.55)], [(7.70, 1.55), (10.60, 1.30)], [(7.90, 0.62), (11.90, 0.62)], [(6.60, 0.62), (7.90, 0.62)],
    [(6.60, 0.20), (6.60, 0.62)], [(9.40, 0.20), (9.40, 0.62)], [(11.90, 0.20), (11.90, 0.62)],
    [(12.60, 0.10), (12.60, 0.55)],
]
BOT_LINES = [
    [(8.30, 2.60), (9.92, 5.05)], [(8.85, 2.55), (10.45, 5.05)], [(11.05, 2.50), (10.95, 4.60)], [(10.60, 4.90), (11.35, 4.90)],
    [(5.60, 0.30), (5.60, 0.90)], [(11.40, 0.30), (11.40, 1.40)], [(12.40, 0.20), (12.40, 0.90)], [(7.00, 1.56), (8.10, 1.56)], [(10.45, 1.56), (11.30, 1.56)],
]
SIDE_PANELS = [
    [(1.30, -0.20), (1.30, 0.14)], [(2.40, -0.36), (3.60, -0.36), (3.75, -0.14), (3.60, 0.00), (2.40, 0.00), (2.25, -0.18), (2.40, -0.36)],
    [(7.20, -0.72), (9.60, -0.72)], [(7.20, -0.20), (7.20, -0.72)], [(9.60, -0.20), (9.60, -0.72)],
]
RINGS = (1.32, )


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
