# f117_detail.py - кабина, окна сенсоров, щупы, перегородки в щелях для F-117A.
import math
import bmesh
import bpy
from mathutils import Vector
from modelkit import B
import f117_geo as g
from f117_geo import P3, Yb, strut, G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK

G_STRAP, G_SCREEN, G_BELT, G_HANDLE, G_SEAM = 6, 7, 8, 9, 10


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
    """Антибликовый гребень под козырьком: тёмная плита по форме спины."""
    st = g.stations(3.66, 4.60, 0.06); rs = []
    for a in st:
        hw = g.CAN_T[1](a) - 0.004; ring = []
        for k in range(17):
            x = hw * (-1 + 2 * k / 16); ring.append(P3(a, x, g.fore_y(a, abs(x)) + 0.005))
        for k in range(17):
            x = hw * (1 - 2 * k / 16); ring.append(P3(a, x, g.fore_y(a, abs(x)) - 0.030))
        rs.append(ring)
    b.loft(rs, G_DARK, cap0=G_DARK, cap1=G_DARK)


def cockpit_detail():
    """Одна кабина: кресло с ремнями, доска с экранами, пульты, ручки. Экипажа нет."""
    b = B(); F1 = 0.62; aS = 5.10
    _seat(b, aS - 0.15, 0.30); _consoles(b, aS + 0.22, F1); _panel(b, 4.72, 0.58, wide=0.36, screens=3, hud=False)
    _box(b, 6.78, 6.96, -0.46, 0.46, 0.62, 1.20, G_COCK, ch=0.02)
    return b.finish('cockpit_int', sharp_deg=40)


# ── щупы на носу: четыре граненых острия (f117_01, 07) ──
def probes():
    b = B()
    for a0, x, z, L_ in ((0.20, 0.0, 0.06, 0.52), (0.62, 0.20, 0.12, 0.55), (0.62, -0.20, 0.12, 0.55), (0.62, 0.0, -0.05, 0.60)):
        r = 0.024; rg = lambda a, k: [P3(a, x + k * r * math.cos(2 * math.pi * q / 4 + 0.785), z + k * r * math.sin(2 * math.pi * q / 4 + 0.785)) for q in range(4)]
        tipr = [P3(a0 - L_, x, z)] * 4
        b.loft([rg(a0 + 0.3, 1.5), rg(a0 - 0.1, 1.0), rg(a0 - L_ + 0.1, 0.6), [p + Vector((0.0005 * i, 0, 0)) for i, p in enumerate(tipr)]], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('det_probes', sharp_deg=20)


# ── окна сенсоров: выемка с пилой, в ней решётка ──
WIN_TOP = dict(ac=3.02, xc=0.0, ra=0.22, rx=0.27)
WIN_BOT = dict(ac=3.05, xc=0.30, ra=0.20, rx=0.22)


def windows():
    Wt, Wb = WIN_TOP, WIN_BOT
    return [g.window_grid('det_win_t', None, Wt['ac'], Wt['xc'], Wt['ra'], Wt['rx'], g.top), g.window_grid('det_win_b', None, Wb['ac'], Wb['xc'], Wb['ra'], Wb['rx'], lambda a, x: g.bot(a, x) + 0.036)]


def window_cuts(skin):
    Wt, Wb = WIN_TOP, WIN_BOT
    h = g.top(Wt['ac'], 0.0); g.cut(skin, g.prism('c_w', g.hex_poly(Wt['ac'], Wt['xc'], Wt['ra'], Wt['rx']), h - 0.10, 3.0, G_DARK))
    g.cut(skin, g.prism('c_w', g.hex_poly(Wb['ac'], Wb['xc'], Wb['ra'], Wb['rx']), -0.8, -0.16 + 0.05, G_DARK))


# ── перегородки в щелях элевонов ──
def seals():
    """Тонкие тёмные плиты по средней плоскости щелей: сквозь щель не видно неба."""
    b = B(); T = 0.0015; d, pr = g._elev_dirs()
    def plate(p0, p1, q0, q1, zf):
        ring = lambda p, q: [g._w3((p.x, p.y, zf(p) + T), sg), g._w3((q.x, q.y, zf(q) + T), sg), g._w3((q.x, q.y, zf(q) - T), sg), g._w3((p.x, p.y, zf(p) - T), sg)]
        b.loft([ring(p0, q0), ring(p1, q1)], G_DARK, cap0=G_DARK, cap1=G_DARK)
    for sg in (1, -1):
        for tag in ('i', 'o'):
            t0, t1 = g.ELEV[tag]; H = lambda t: g._te(t) - pr * g.ELEV_H; zf = lambda p: (g.top(p.x, p.y - 0.0) + g.bot(p.x, p.y)) / 2 if False else 0.0
            def mid(p):
                q = p - pr * 0.03; return (g.top(q.x, q.y) + g.bot(q.x, q.y)) / 2
            plate(H(t0 - 0.004) - pr * 0.02, H(t1 + 0.004) - pr * 0.02, H(t0 - 0.004) + pr * 0.05, H(t1 + 0.004) + pr * 0.05, mid)
            for t_ in (t0, t1):
                q0 = g._te(t_) - pr * g.ELEV_H; q1 = g._te(t_) - pr * 0.02; dd = d * 0.012
                plate(q0 - dd, q1 - dd, q0 + dd, q1 + dd, mid)
    return b.finish('det_seal', sharp_deg=30)
