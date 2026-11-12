# f111_parts.py - детали F-111F поверх обшивки: отсеки, тормозной щиток, люлька контейнера, створки фонаря, кабина, интерцепторы, держатели, шасси.
import math
import bpy
from mathutils import Vector, Matrix
from modelkit import B
import f111_geo as g
from f111_geo import *
from f111_base import _rel
import f111_gk as k
from f111_gk import tube, collar, box, link, hose, wheel, X, F, U, R_, G_BELT, G_HANDLE

GROUND_Z = -1.750
MAIN_BAY = (11.76, 13.56, 0.90, -0.02)                           # a0, a1, полуширина, потолок
PT_BAY = (8.35, 10.85, 0.37, 0.22)                               # отсек «Пэйв Тэк»
BRK = (11.72, 13.60, 0.96)                                       # тормозной щиток = передняя створка основной ниши


def _boxcut(name, a0, a1, hw, z0, z1, mat=G_COCK):
    return loft_obj(name, [[P3(a, -hw, z0), P3(a, hw, z0), P3(a, hw, z1), P3(a, -hw, z1)] for a in (a0, a1)], mat, sharp=25)


def bay_cuts():
    return [_boxcut('c_mbay', MAIN_BAY[0], MAIN_BAY[1], MAIN_BAY[2], -1.2, MAIN_BAY[3]), _boxcut('c_pbay', PT_BAY[0], PT_BAY[1], PT_BAY[2], -1.2, PT_BAY[3])]


def belly(a, x): return down(x, Yb(a), z0=-3.0, dirn=1)


def brake():
    """Тормозной щиток: большая створка основной ниши под фюзеляжем, петля по передней кромке (f111_01, 03)."""
    a0, a1, hw = BRK; n_ = 'brake'
    ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, -hw + 2 * hw * u), 12, 12, dirn=1, lift=0.004, th=0.026, z0=-3.0)
    def aft_bot(a_, x):
        if a_ < 11.2: return 9.0
        top, bot, hw_, nb = g.AFT[0](a_), g.AFT[1](a_), g.AFT[2](a_), g.AFT[4](a_); cy = (top + bot) / 2; ht = (top - bot) / 2
        return cy - ht * max(0.0, 1 - (min(abs(x), hw_) / hw_) ** nb) ** (1 / nb)
    zb = lambda a_, x=0.0: min(fore_y_bot(a_, x) if abs(x) < FT[2](a_) else 9.0, aft_bot(a_, x))
    for v in ob.data.vertices:                                  # над проёмом ниши луч попал в потолок: плита идёт по линии днища
        a_ = L / 2 - v.co.y; h = down(v.co.x, v.co.y, z0=-3.0, dirn=1)
        if h is not None and h.z > zb(a_, v.co.x) + 0.05: v.co.z = zb(a_, v.co.x) + (v.co.z - h.z)
    pivot = P3(a0, 0.0, zb(a0) - 0.004); _rel(ob, pivot)
    PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, 60.0), note='тормозной щиток - передняя створка основной ниши: петля по передней кромке; плюс - задняя кромка вниз; при выпущенном шасси открыт на 35°')
    return ob


def cradle():
    """Поворотная люлька контейнера в отсеке: продольная ось; в файле контейнерной стороной вниз (выпущено), 180° - убрано, наружу гладкая створка."""
    a0, a1, hw = PT_BAY[0] + 0.012, PT_BAY[1] - 0.012, PT_BAY[2] - 0.012; am = (a0 + a1) / 2; zc = FT[1](am) + 0.075; pivot = P3(am, 0.0, zc); b = B(); rings = []
    for a in stations(a0, a1, 0.25):
        zb = lambda x: fore_y_bot(a, x); r = []
        for i in range(9): x = -hw + 2 * hw * i / 8; r.append(P3(a, x, 2 * zc - zb(x)) - pivot)          # гладкая сторона (в файле сверху, внутри отсека)
        for i in range(9): x = hw - 2 * hw * i / 8; r.append(P3(a, x, zc - 0.050) - pivot)               # плоская сторона с балкой (в файле вниз)
        rings.append(r[::-1])
    b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    zs = zc - 0.050
    def sec(a, f, dz): return [P3(a, -0.075 * f, zs - 0.20 + dz) - pivot, P3(a, 0.075 * f, zs - 0.20 + dz) - pivot, P3(a, 0.095 * f, zs + 0.01) - pivot, P3(a, -0.095 * f, zs + 0.01) - pivot]
    b.loft([sec(am - 0.95, 0.15, 0.14), sec(am - 0.80, 0.8, 0.04), sec(am - 0.45, 1.0, 0.0), sec(am + 0.55, 1.0, 0.0), sec(am + 0.85, 0.7, 0.05), sec(am + 0.98, 0.15, 0.13)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for da in (-0.25, 0.25): tube(b, [P3(am + da, -0.11, zs - 0.215) - pivot, P3(am + da, 0.11, zs - 0.215) - pivot], 0.018, G_METAL, 8)
    for a_ in (a0 - 0.01, a1 + 0.01): tube(b, [P3(a_ - 0.02, 0, zc) - pivot, P3(a_ + 0.02, 0, zc) - pivot], 0.045, G_METAL, 12)
    ob = b.finish('cradle', sharp_deg=40); ob.location = pivot
    PARTS['cradle'] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(0.0, 180.0), note='люлька контейнера: продольная ось; 0 - контейнер выпущен (как в файле), 180 - убран, наружу гладкая створка')
    g.PYLON_PTS['pod'] = P3(am + 0.05, 0.0, zs - 0.235)
    return ob


def fore_y_bot(a, x):
    top, bot, hw, nb = FT[0](a), FT[1](a), FT[2](a), FT[4](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nb); return cy - ht * q ** (1 / nb)


# ── фонарь: неподвижный козырёк с центральной балкой и две створки «крыло чайки» ──
def hatch(sx):
    name = 'canopy_' + ('r' if sx > 0 else 'l'); a0, a1 = g.ARCH_A + 0.048, g.CAN_A1 - 0.097; n = 44; half = n // 2; xb = 0.062
    pivot = P3((a0 + a1) / 2, sx * xb, (g.CAN_T[0](a0) + g.CAN_T[0](a1)) / 2 + 0.022)
    def hr(a, inset=0.0):
        r = g.can_ring(a, inset, n); r = r[:half] if sx > 0 else r[half:][::-1]
        return [p for p in r if abs(p.x) > xb] + [Vector((sx * xb, r[-1].y, max(p.z for p in r) + 0.001))]
    st = stations(a0 + 0.004, a1 - 0.004, 0.10)
    b = B(); strip(b, [hr(a) for a in st], G_GLASS); gl = b.finish(name + '_glass', sharp_deg=60)
    b = B()
    for a, w in ((a0 + 0.028, 0.028), (a1 - 0.028, 0.028), ((a0 + a1) / 2, 0.020)):
        strip(b, [hr(a - w, 0.008), hr(a - w, -0.022), hr(a + w, -0.022), hr(a + w, 0.008), hr(a - w, 0.008)], G_SKIN)
    rail = lambda a, d, h: P3(a, sx * (g.CAN_T[1](a) + d), g.SILL(a) + h)
    b.loft([[rail(a, 0.004, 0.012), rail(a, 0.018, 0.010), rail(a, 0.018, 0.034), rail(a, -0.012, 0.050), rail(a, -0.012, 0.022)] for a in stations(a0, a1, 0.07)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    top = lambda a, d, h: P3(a, sx * d, g.CAN_T[0](a) + h)
    b.loft([[top(a, 0.058, -0.016), top(a, 0.092, -0.020), top(a, 0.092, 0.016), top(a, 0.030, 0.026), top(a, 0.030, 0.016), top(a, 0.058, 0.012)] for a in stations(a0, a1, 0.08)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    fr = b.finish(name, sharp_deg=45)
    for o in (gl, fr):
        for v in o.data.vertices: v.co -= pivot
    fr.location = pivot; gl.parent = fr; gl.location = (0, 0, 0)
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(0.0, 62.0) if sx < 0 else (-62.0, 0.0), note='створка фонаря: петля на центральной балке; открывается вверх; ' + name + '_glass - дочерний объект')
    return [fr, gl]


def windscreen():
    a1 = g.ARCH_A; b = B(); strip(b, [g.can_ring(a) for a in stations(g.CAN_A0 + 0.01, a1, 0.08)], G_GLASS); gl = b.finish('screen_glass', sharp_deg=60)
    b = B(); g.frame_arch(b, g.ARCH_A + 0.004, 0.034); g.frame_arch(b, g.CAN_A1 - 0.045, 0.040, inset=0.012)
    top = lambda a, d, h: P3(a, d, g.CAN_T[0](a) + h)
    b.loft([[top(a, -0.026, -0.014), top(a, 0.026, -0.014), top(a, 0.026, 0.012), top(a, -0.026, 0.012)] for a in stations(g.CAN_A0 + 0.20, g.CAN_A1, 0.08)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)   # центральная балка
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (g.CAN_T[1](a) + d), g.SILL(a) + h)
        b.loft([[rail(a, 0.004, 0.010), rail(a, 0.016, 0.010), rail(a, 0.016, 0.026), rail(a, -0.010, 0.040), rail(a, -0.010, 0.020)] for a in stations(g.CAN_A0 + 0.03, a1, 0.08)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return [gl, b.finish('screen_frame', sharp_deg=45)]


# ── кабина: два кресла рядом, приборная доска, центральный пульт, ручки ──
def cockpit():
    b = B(); fl = 0.345; aS = 6.45
    def bx(a0, a1, x0, x1, z0, z1, mat=G_COCK): b.loft([[P3(a, x0, z0), P3(a, x1, z0), P3(a, x1, z1), P3(a, x0, z1)] for a in (a0, a1)], mat, cap0=mat, cap1=mat)
    for sx in (1, -1):
        cx = sx * 0.33
        bx(aS - 0.25, aS + 0.20, cx - 0.21, cx + 0.21, fl, fl + 0.30, G_DARK); bx(aS - 0.26, aS + 0.16, cx - 0.19, cx + 0.19, fl + 0.30, fl + 0.38, 6)              # чаша и подушка
        b.loft([[P3(aS + 0.14 + 0.16 * t, cx - 0.20, fl + 0.34 + 0.72 * t), P3(aS + 0.14 + 0.16 * t, cx + 0.20, fl + 0.34 + 0.72 * t), P3(aS + 0.26 + 0.16 * t, cx + 0.20, fl + 0.34 + 0.72 * t), P3(aS + 0.26 + 0.16 * t, cx - 0.20, fl + 0.34 + 0.72 * t)] for t in (0, 0.5, 1)], 6, cap0=6, cap1=6)   # спинка
        bx(aS + 0.30, aS + 0.42, cx - 0.12, cx + 0.12, fl + 1.02, fl + 1.24, G_DARK)                                                                         # подголовник
        for d in (-0.07, 0.07): b.loft([[P3(aS + 0.13 + 0.16 * t, cx + d - 0.022, fl + 0.40 + 0.66 * t), P3(aS + 0.13 + 0.16 * t, cx + d + 0.022, fl + 0.40 + 0.66 * t), P3(aS + 0.125 + 0.16 * t, cx + d + 0.022, fl + 0.40 + 0.66 * t), P3(aS + 0.125 + 0.16 * t, cx + d - 0.022, fl + 0.40 + 0.66 * t)] for t in (0, 1)], 8, cap0=8, cap1=8)   # ремни
        tube(b, [P3(aS - 0.42, cx, fl), P3(aS - 0.44, cx, fl + 0.36), P3(aS - 0.44, cx, fl + 0.46)], [0.016, 0.014, 0.024], G_DARK, 8)                        # ручка управления
        bx(5.42, 5.50, cx - 0.27, cx + 0.27, fl + 0.42, fl + 0.86, G_DARK)                                                                                   # приборная доска
        for i, (dx, dz) in enumerate(((-0.13, 0.70), (0.10, 0.70), (-0.13, 0.54), (0.10, 0.54))): bx(5.50, 5.506, cx + dx - 0.085, cx + dx + 0.085, fl + dz - 0.06, fl + dz + 0.06, 7)
        b.loft([[P3(5.20, cx - 0.26, fl + 0.90), P3(5.20, cx + 0.26, fl + 0.90), P3(5.20, cx + 0.24, fl + 0.94), P3(5.20, cx - 0.24, fl + 0.94)], [P3(5.56, cx - 0.26, fl + 0.87), P3(5.56, cx + 0.26, fl + 0.87), P3(5.56, cx + 0.24, fl + 0.91), P3(5.56, cx - 0.24, fl + 0.91)]], G_DARK, cap0=G_DARK, cap1=G_DARK)   # козырёк доски
    bx(5.50, 6.75, -0.085, 0.085, fl, fl + 0.34, G_DARK)                                                                                                     # центральный пульт
    for i in range(4): bx(5.70 + 0.22 * i, 5.86 + 0.22 * i, -0.07, 0.07, fl + 0.34, fl + 0.346, 7)
    tube(b, [P3(6.30, 0, fl + 0.34), P3(6.28, 0, fl + 0.48)], 0.014, G_DARK, 8); bx(6.24, 6.32, -0.03, 0.03, fl + 0.47, fl + 0.52, 9)
    bx(6.88, 6.95, -0.50, 0.50, fl, fl + 0.95, G_COCK)                                                                                                       # задняя стенка
    return b.finish('cockpit', sharp_deg=40)


# ── интерцепторы на верхней поверхности крыла перед закрылками: дети консоли ──
SPOIL = (('spoil_i', (3.55, 5.10)), ('spoil_o', (5.16, 6.90)))


def spoiler(name, spec, sx):
    x0, x1 = spec; uF, uR = 0.62, 0.735; pts = lambda x, u, dz: P3(g.LE_W(x) + u * (g.TE_W(x) - g.LE_W(x)), sx * x, g.WZ + g.TCW(x) * (g.TE_W(x) - g.LE_W(x)) * thk(u) + dz)
    p0, p1 = pts(x0, uF, 0.004), pts(x1, uF, 0.004); pivot = (p0 + p1) / 2; ax = (p1 - p0).normalized(); ax = ax if ax.x > 0 else -ax; rings = []
    for i in range(7):
        x = x0 + (x1 - x0) * i / 6; r = [pts(x, uF + (uR - uF) * j / 4, 0.009) - pivot for j in range(5)] + [pts(x, uR - (uR - uF) * j / 4, 0.002) - pivot for j in range(5)]
        rings.append(r if sx > 0 else r[::-1])
    ob = loft_obj(name, rings, sharp=40); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=ax, range=(-45.0, 0.0), note='интерцептор: петля по передней кромке; минус - задняя кромка вверх')
    return ob


def spoilers(sx, w, M):
    out = []
    for nm, r in SPOIL:
        ob = spoiler(nm + '_' + ('r' if sx > 0 else 'l'), r, sx); bpy.context.view_layer.update(); ob.matrix_world = M @ ob.matrix_world; bpy.context.view_layer.update()
        ob.parent = w; ob.matrix_parent_inverse = w.matrix_world.inverted(); D = PARTS[ob.name]; D['pivot'] = M @ D['pivot']; D['axis'] = (M.to_3x3() @ D['axis']).normalized(); D['parent'] = w.name; out.append(ob)
    return out


# ── шасси (f111_01, 02, 03): передняя стойка с двумя колёсами, основные - два больших колеса на общей балке под фюзеляжем ──
NG = dict(a=6.90, hinge=(7.02, -0.180), rw=0.310, ww=0.160, track=0.175)
MG = dict(a=14.00, x=1.380, rw=0.580, ww=0.400, T=(14.30, -0.300))


def gear_nose():
    a_h, y_h = NG['hinge']; rw, ww, trk = NG['rw'], NG['ww'], NG['track']
    T = P3(a_h, 0.0, y_h); wc = P3(NG['a'], 0.0, GROUND_Z + rw); low = wc + U * 0.260; d = (low - T); Ln = d.length; d = d.normalized(); at = lambda s: T + d * s
    b = B()
    for sg in (1, -1): wheel(b, wc + X * sg * trk, rw, ww, 6)
    tube(b, [T - X * 0.22, T + X * 0.22], 0.055, G_SKIN, 14); collar(b, at(0.03), d, 0.092, 0.10)
    tube(b, [at(0.02), at(Ln * 0.62)], 0.070, G_SKIN, 18)
    for s, r_, h_ in ((0.20, 0.082, 0.035), (Ln * 0.40, 0.086, 0.07), (Ln * 0.62, 0.082, 0.05)): collar(b, at(s), d, r_, h_)
    tube(b, [at(Ln * 0.62), at(Ln - 0.03)], 0.044, G_METAL, 18); collar(b, at(Ln - 0.02), d, 0.062, 0.06)
    k.details(b, at, d, 0.070, 0.08, 0.36, -X)
    tube(b, [wc - X * (trk + ww * 0.5 + 0.015), wc + X * (trk + ww * 0.5 + 0.015)], 0.030, G_BELT, 12)
    tube(b, [low + U * 0.03, wc], [0.055, 0.050], G_SKIN, 14); box(b, wc, X, U, F, 0.066, 0.042, 0.046, G_SKIN)
    p0 = at(Ln * 0.60) + R_ * 0.082; k_ = at(Ln * 0.80) + R_ * 0.20; p1 = low + R_ * 0.070 + U * 0.02
    link(b, p0, k_, 0.028, 0.017); link(b, k_, p1, 0.028, 0.017)
    for sg in (1, -1):
        c_ = at(Ln * 0.45) + F * 0.115 + X * (sg * 0.075); tube(b, [c_ - F * 0.035, c_, c_ + F * 0.045], [0.035, 0.05, 0.05], G_METAL, 16); tube(b, [c_ + F * 0.046, c_ + F * 0.052], [0.045, 0.038], G_HANDLE, 16)
    off1 = X * 0.080 + F * 0.012; hose(b, [at(0.05) + off1, at(0.30) + off1 * 1.02, at(Ln * 0.6) + off1 * 1.05, at(Ln * 0.75) + off1 * 0.9], 0.0065, (0.2, 0.55, 0.85))
    ob = b.finish('gear_n', sharp_deg=40); _rel(ob, T)
    b2 = B(); sp = P3(a_h + 0.85, 0.0, 0.02); e_ = at(Ln * 0.42) + R_ * 0.076; kn = sp.lerp(e_, 0.50) + U * 0.05 + R_ * 0.05
    for sg in (1, -1):
        tube(b2, [sp + X * sg * 0.045, kn + X * sg * 0.040], [0.022, 0.034], G_SKIN, 8); tube(b2, [kn + X * sg * 0.040, e_ + X * sg * 0.036], [0.034, 0.022], G_SKIN, 8)
    tube(b2, [kn - X * 0.056, kn + X * 0.056], 0.026, G_BELT, 12); tube(b2, [e_ - X * 0.055, e_ + X * 0.055], 0.020, G_BELT, 10)
    br_ = b2.finish('gear_n_brace', sharp_deg=45); _rel(br_, sp)
    PARTS['gear_n'] = dict(pivot=T.copy(), axis=Vector((1, 0, 0)), range=(0.0, 95.0), note='0 - выпущено; уборка вперёд', retracted=95.0)
    PARTS['gear_n_brace'] = dict(pivot=sp.copy(), axis=Vector((1, 0, 0)), range=None, note='подкос складывается вместе со стойкой')
    # створки передней ниши: только в файле стоек, открыты
    out = [ob, br_]
    for sx in (1, -1):
        b3 = B(); a0, a1 = 6.05, 7.45; zt = lambda a: belly(a, sx * 0.27).z
        b3.loft([[P3(a, sx * 0.27, zt(a) + 0.01), P3(a, sx * 0.292, zt(a) + 0.01), P3(a, sx * 0.34, zt(a) - 0.50), P3(a, sx * 0.318, zt(a) - 0.50)] for a in stations(a0, a1, 0.2)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
        out.append(b3.finish('gear_door_n_' + ('r' if sx > 0 else 'l'), sharp_deg=40))
    return out


def gear_main():
    rw, ww = MG['rw'], MG['ww']; T = P3(MG['T'][0], 0.0, MG['T'][1]); zc = GROUND_Z + rw; b = B(); out = []
    tube(b, [T - X * 0.80, T + X * 0.80], 0.085, G_SKIN, 16)                                                # общая балка поперёк ниши
    for sx in (1, -1):
        top = T + X * sx * 0.62; ax = P3(MG['a'], sx * 0.98, zc + 0.02); wc = P3(MG['a'], sx * MG['x'], zc); d = (ax - top).normalized(); Ln = (ax - top).length; at = lambda s: top + d * s
        tube(b, [at(0.0), at(Ln * 0.55)], 0.092, G_SKIN, 18); tube(b, [at(Ln * 0.55), at(Ln - 0.04)], 0.062, G_METAL, 18)
        for s, r_ in ((0.06, 0.106), (Ln * 0.30, 0.104), (Ln * 0.55, 0.106)): collar(b, at(s), d, r_, 0.06)
        collar(b, at(Ln - 0.02), d, 0.090, 0.10); k.details(b, at, d, 0.092, 0.10, Ln * 0.45, X * sx)
        tube(b, [ax + U * 0.02, ax, wc - X * sx * (ww * 0.5 + 0.02)], [0.082, 0.076, 0.060], G_SKIN, 14)   # полуось
        fw = P3(MG['a'] - 1.25, sx * 0.55, MG['T'][1] + 0.12); mid = at(Ln * 0.50) + F * 0.09
        tube(b, [fw, mid], [0.040, 0.048], G_SKIN, 10); collar(b, fw.lerp(mid, 0.5), (mid - fw).normalized(), 0.056, 0.08)   # подкос вперёд
        tube(b, [T + X * sx * 0.10 + U * 0.02, at(Ln * 0.62) - X * sx * 0.09], [0.050, 0.030], G_METAL, 10)                  # цилиндр к балке
        p0 = at(Ln * 0.52) + R_ * 0.11; k_ = at(Ln * 0.74) + R_ * 0.26; p1 = ax + R_ * 0.095 + U * 0.05
        link(b, p0, k_, 0.034, 0.020); link(b, k_, p1, 0.034, 0.020)
        o1 = F * 0.10 + X * sx * 0.02; hose(b, [at(0.06) + o1, at(Ln * 0.3) + o1, at(Ln * 0.55) + o1 * 1.05, at(Ln * 0.8) + o1 * 1.2, wc + F * rw * 0.2 + U * 0.08 - X * sx * (ww * 0.5 + 0.03)], 0.008, (0.15, 0.4, 0.6, 0.82))
        b3 = B(); wheel(b3, wc, rw, ww, 10); dw = X * (-sx); bc = wc + dw * (ww * 0.25)
        for i in range(5): dxx = (i - 2) * 0.014; tube(b3, [bc - dw * (dxx - 0.006), bc - dw * (dxx + 0.006)], rw * 0.44, G_BELT, 28)
        wh = b3.finish('gear_w_' + ('r' if sx > 0 else 'l'), sharp_deg=40); _rel(wh, wc); out.append(wh)
        PARTS[wh.name] = dict(pivot=wc.copy(), axis=Vector((1, 0, 0)), range=None, note='колесо с тормозом: дочерняя часть gear_m')
    ob = b.finish('gear_m', sharp_deg=40); _rel(ob, T)
    PARTS['gear_m'] = dict(pivot=T.copy(), axis=Vector((1, 0, 0)), range=(0.0, 100.0), note='обе основные стойки на общей балке; 0 - выпущено; уборка вперёд-вверх в нишу под фюзеляжем', retracted=100.0)
    return [ob] + out


# ── держатели на пилонах: балка с двумя замками, по две точки на пилон ──
RACK_DX = 0.300


def rack(py):
    """Двухзамковая балка под пилоном: ребёнок пилона, поворачивается вместе с ним."""
    name = py.name.replace('pylon', 'rack'); p = g.PYLON_PTS.pop(py.name); b = B(); z0 = p.z
    def sec(dy, f, dz=0.0): return [Vector((p.x - RACK_DX * f - 0.07, p.y + dy, z0 - 0.105 + dz)), Vector((p.x + RACK_DX * f + 0.07, p.y + dy, z0 - 0.105 + dz)), Vector((p.x + 0.10, p.y + dy, z0 + 0.012)), Vector((p.x - 0.10, p.y + dy, z0 + 0.012))]
    b.loft([sec(0.66, 0.25, 0.07), sec(0.50, 0.9, 0.01), sec(0.28, 1.0), sec(-0.30, 1.0), sec(-0.50, 0.85, 0.01), sec(-0.64, 0.25, 0.06)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for sg in (1, -1):
        for dy in (0.26, -0.26): tube(b, [Vector((p.x + sg * (RACK_DX - 0.07), p.y + dy, z0 - 0.118)), Vector((p.x + sg * (RACK_DX + 0.07), p.y + dy, z0 - 0.118))], 0.016, G_METAL, 8)
        g.PYLON_PTS[py.name + ('_o' if sg * (1 if p.x > 0 else -1) > 0 else '_i')] = Vector((p.x + sg * RACK_DX, p.y, z0 - 0.135))
    ob = b.finish(name, sharp_deg=40); _rel(ob, PARTS[py.name]['pivot'].copy()); bpy.context.view_layer.update(); ob.parent = py; ob.matrix_parent_inverse = py.matrix_world.inverted()
    return ob
