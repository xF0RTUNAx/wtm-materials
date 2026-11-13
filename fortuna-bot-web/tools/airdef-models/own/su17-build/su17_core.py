# su17_core.py - копия mig21_geo.py (общие узлы для su17_geo.py); исходное описание: геометрия МиГ-21бис для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z.
# a - расстояние от острия конуса воздухозаборника (L = 15,40 до конца киля; ПВД выступает вперёд ещё на 0,45), z - высота над осью фюзеляжа.
# Размеры: чертёж mig21_04 (сверху 18,04 пикс/м: a = (y - 20) / 18,04; сбоку 19,1 пикс/м: a = (x - 193) / 19,1, z = (258 - y) / 19,1), чертёж 12 и фото 01, 08, 09 - детали.
import math, os
import bpy, bmesh
from mathutils import Vector, Matrix
from modelkit import B
import su17_base as fb
from su17_base import *
from su17_base import _apply_bool, _drop, _rel
import su17_gk as k
from su17_gk import tube, collar, box, link, hose, wheel, X, F, U, R_, G_BELT, G_HANDLE

PARTS = fb.PARTS; L = fb.L
PYLON_PTS = {}
GROUND_Z = -1.600

# ── фюзеляж: труба от кромки воздухозаборника до сопла; хвост чуть поднимается ──
LIP_A, NOZ_A0 = 0.85, 13.62
FORE = [  # a, верх, низ, полуширина
    (0.85, 0.430, -0.490, 0.455), (0.90, 0.448, -0.508, 0.474), (1.20, 0.480, -0.545, 0.505), (2.00, 0.545, -0.610, 0.560), (3.00, 0.610, -0.665, 0.600), (4.50, 0.635, -0.680, 0.618),
    (7.00, 0.640, -0.680, 0.622), (10.00, 0.640, -0.665, 0.612), (11.50, 0.655, -0.575, 0.595), (12.60, 0.675, -0.455, 0.565), (13.62, 0.690, -0.385, 0.540)]
FT = tracks(FORE)
def fz(a): return (FT[0](a) + FT[1](a)) / 2
def fr(a): return (FT[0](a) - FT[1](a)) / 2


def side_x(a, z):
    cy = fz(a); ht = fr(a); s = max(-0.999, min(0.999, (z - cy) / ht)); return FT[2](a) * math.sqrt(max(0.0, 1 - s * s))


def top_z(a, x):
    hw = FT[2](a); return fz(a) + fr(a) * math.sqrt(max(0.0, 1 - (min(abs(x), hw) / hw) ** 2))


def fore():
    st = [0.85, 0.862, 0.88, 0.90, 0.95] + stations(1.05, 13.50, 0.16) + [NOZ_A0]
    return loft_obj('s_fore', [sup(a, 0.0, FT[0](a), FT[1](a), FT[2](a), 2.0, 2.0, 72) for a in st])


# ── гаргрот: у «бис» широкий, от фонаря до киля ──
SPINE = tracks([(5.06, 1.195, 0.345), (5.20, 1.185, 0.345), (6.00, 1.150, 0.340), (8.00, 1.135, 0.330), (10.30, 1.125, 0.300), (11.60, 1.060, 0.220), (12.80, 0.960, 0.130), (13.40, 0.900, 0.060)])


def spine():
    rings = []
    for a in stations(5.06, 13.40, 0.16):
        top, hw = SPINE[0](a), SPINE[1](a); n = 28; ring = []
        for i in range(n):
            th = -math.pi / 2 + 2 * math.pi * i / n; c, s = math.cos(th), math.sin(th)
            x = hw * math.copysign(abs(c) ** (2 / 2.8), c); z = 0.42 + (top - 0.42) * math.copysign(abs(s) ** (2 / 2.8), s) if s > 0 else 0.42 + 0.5 * s
            ring.append(P3(a, x * (1.0 if s > 0 else 1.25), z))
        rings.append(ring)
    return loft_obj('s_spine', rings, sharp=40)


# ── гондола пушки ГШ-23Л под фюзеляжем и подфюзеляжный гребень ──
def gun():
    T = tracks([(5.55, -0.600, -0.640, 0.040), (5.75, -0.560, -0.760, 0.130), (6.20, -0.540, -0.830, 0.175), (7.10, -0.540, -0.830, 0.175), (7.50, -0.560, -0.770, 0.130), (7.75, -0.600, -0.680, 0.040)])
    b = B(); b.loft([sup(a, 0.0, T[0](a), T[1](a), T[2](a), 2.4, 2.6, 28) for a in stations(5.55, 7.75, 0.12)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for sx in (1, -1): strut(b, P3(5.05, sx * 0.055, -0.800), P3(5.95, sx * 0.055, -0.790), 0.022, G_METAL, 10)        # два ствола
    return b.finish('s_gun', sharp_deg=40)


VFIN = (10.55, 12.95, -1.130)


def vfin():
    a0, a1, zb = VFIN; b = B(); rings = []
    for s_ in (0.0, 0.35, 0.7, 0.92, 1.0):
        z = -0.50 + (zb + 0.50) * s_; le = a0 + 0.42 * s_; te = a1 - 0.85 * s_
        rings.append(foil_ring(le, te - le, 0.030, 0.0, 1.0, 12, lambda a, h: P3(a, h, z)))
    b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN); return b.finish('s_vfin', sharp_deg=48)


# ── воздухозаборник: канал и подвижный конус ──
def duct_cut():
    prof = [(0.60, 0.415), (0.86, 0.415), (1.00, 0.410), (2.20, 0.380), (2.80, 0.200), (2.85, 0.020)]; n = 56
    return loft_obj('c_duct', [[P3(a, r * math.sin(2 * math.pi * q / n), fz(max(a, LIP_A)) - r * math.cos(2 * math.pi * q / n)) for q in range(n)] for a, r in prof], G_DUCT, sharp=25)


def cone():
    n = 40; cz = fz(LIP_A); pivot = P3(1.60, 0.0, cz); prof = [(0.0, 0.006), (0.06, 0.040), (0.40, 0.140), (0.85, 0.262), (1.25, 0.335), (1.60, 0.352), (2.20, 0.300), (2.70, 0.160)]
    ob = loft_obj('cone', [[P3(a, r * math.sin(2 * math.pi * q / n), cz - r * math.cos(2 * math.pi * q / n)) - pivot for q in range(n)] for a, r in prof], G_SKIN, sharp=30); ob.location = pivot
    PARTS['cone'] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(0.0, 0.20), kind='slide', note='конус воздухозаборника: сдвиг вдоль оси, метры; плюс - вперёд (в файле убран)')
    return ob


# ── крыло: треугольное, среднее, с небольшим отрицательным V ──
XR, XTIP, WZ, WDIH = 0.50, 3.575, -0.200, -math.tan(math.radians(2.0))
def wy(x): return WZ + (x - XR) * WDIH
def LE_W(x): return 5.99 + 1.465 * (x - 0.61)
def TE_W(x): return 10.70
TC = Track([(0.50, 0.042), (3.575, 0.050)])
FLAP = (0.700, 1.950); AIL = (2.010, 3.380); FLAP_C, AIL_C = 0.56, 0.40
TRIM = 0.020
def _cut(r, t=TRIM): return (r[0] + t, r[1] - t)
def in_(x, r): return r[0] - 1e-6 <= x <= r[1] + 1e-6


def _wsec(sx, x):
    c = TE_W(x) - LE_W(x); tc = TC(x); le = LE_W(x)
    if in_(x, _cut(FLAP)): ue, tail = cove_cut(le, c, tc, TE_W(x) - FLAP_C)
    elif in_(x, _cut(AIL)): ue, tail = cove_cut(le, c, tc, TE_W(x) - AIL_C)
    else: ue = 1.0; tail = cove_wall(le, c, tc, 1.0)
    return foil_ring(le, c, tc, 0.0008, ue, 18, lambda a, h: P3(a, sx * x, wy(x) + h), tail=tail, head=cove_wall_f(le, c, tc, 0.0008))


def wing_s(sx):
    xs = {XR, 0.62, 2.6, 3.0, XTIP - 0.05, XTIP}
    for r in (_cut(FLAP), _cut(AIL)):
        xs |= {r[0] - 0.004, r[0], r[1], r[1] + 0.004}
        for i in range(1, 6): xs.add(round(r[0] + (r[1] - r[0]) * i / 6, 4))
    return loft_obj('s_wing', [_wsec(sx, x) for x in sorted(xs)], sharp=48)


def wing_part(name, spec, chord, sx, rng, note):
    x0, x1 = _cut(spec); x0 += 0.012; x1 -= 0.012
    pv0 = P3(TE_W(x0) - chord, sx * x0, wy(x0)); pv1 = P3(TE_W(x1) - chord, sx * x1, wy(x1)); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    for i in range(9):
        x = x0 + (x1 - x0) * i / 8; c = TE_W(x) - LE_W(x); ah = TE_W(x) - chord
        rings.append([v - pivot for v in foil_ring(LE_W(x), c, TC(x), (ah - LE_W(x)) / c, 1.0, 9, lambda a, h: P3(a, sx * x, wy(x) + h), head=cove_nose(LE_W(x), c, TC(x), ah))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=rng, note=note)
    return ob


def fence(sx):
    """Аэродинамический гребень на верхней поверхности у конца крыла (mig21_04, 12)."""
    x = 2.92; b = B(); a0 = LE_W(x) + 0.05; a1 = a0 + 0.78; zt = lambda a: wy(x) + TC(x) * (TE_W(x) - LE_W(x)) * thk((a - LE_W(x)) / (TE_W(x) - LE_W(x)))
    b.loft([[P3(a, sx * x - 0.006, zt(a) - 0.01), P3(a, sx * x + 0.006, zt(a) - 0.01), P3(a, sx * x + 0.004, zt(a) + h_), P3(a, sx * x - 0.004, zt(a) + h_)] for a, h_ in ((a0, 0.01), (a0 + 0.10, 0.07), (a1 - 0.2, 0.07), (a1, 0.012))], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('det_fence_' + ('r' if sx > 0 else 'l'), sharp_deg=40)


# ── киль (у «бис» широкий), руль, контейнер тормозного парашюта под рулём ──
FIN_T = 0.050
F_LE = Lin([(0.55, 9.00), (1.10, 10.30), (2.35, 13.30), (2.60, 14.75)])
F_TE = Lin([(0.55, 13.60), (0.85, 13.90), (2.35, 15.33), (2.60, 15.45)])
FIN_TOP = 2.60
RUD = (1.12, 2.02)
RUD_C = Track([(1.12, 0.560), (2.02, 0.500)])


def fin():
    ys = [0.55, 0.75, 0.95, RUD[0] - 0.004, RUD[0]] + [RUD[0] + (RUD[1] - RUD[0]) * i / 6 for i in range(1, 7)] + [RUD[1] + 0.004, 2.18, 2.35, 2.42, 2.50, 2.56, FIN_TOP]; rings = []
    for y in sorted(set(round(v, 4) for v in ys)):
        c = F_TE(y) - F_LE(y)
        if RUD[0] - 1e-6 <= y <= RUD[1] + 1e-6: ue, tail = cove_cut(F_LE(y), c, FIN_T, F_TE(y) - RUD_C(y), 0.014)
        else: ue, tail = 1.0, cove_wall(F_LE(y), c, FIN_T, 1.0)
        rings.append(foil_ring(F_LE(y), c, FIN_T, 0.0008, ue, 16, lambda a, h: P3(a, h, y), tail=tail, head=cove_wall_f(F_LE(y), c, FIN_T, 0.0008)))
    b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('fin_c', sharp_deg=48)


def rudder():
    y0, y1 = RUD; h0 = F_TE(y0) - RUD_C(y0); h1 = F_TE(y1) - RUD_C(y1); p0 = P3(h0, 0.0, y0); p1 = P3(h1, 0.0, y1); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized(); rings = []
    for i in range(9):
        y = y0 + 0.006 + (y1 - y0 - 0.012) * i / 8; c = F_TE(y) - F_LE(y); ah = F_TE(y) - RUD_C(y)
        rings.append([v - pivot for v in foil_ring(F_LE(y), c, FIN_T, (ah - F_LE(y)) / c, 1.0, 9, lambda a, h: P3(a, h, y), head=cove_nose(F_LE(y), c, FIN_T, ah))])
    ob = loft_obj('rudder', rings, sharp=48); ob.location = pivot
    PARTS['rudder'] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-20.0, 20.0), note='ось в центре круглого носа, снизу вверх')
    return ob


CHUTE = (13.45, 14.42, 0.900, 0.115)                             # контейнер тормозного парашюта: a0, a1, z, радиус


def chute():
    a0, a1, z, r = CHUTE; n = 24; prof = [(a0, 0.02), (a0 + 0.12, r * 0.8), (a0 + 0.35, r), (a1 - 0.22, r), (a1 - 0.2, r * 0.98)]
    b = B(); b.loft([[P3(a, rr * math.sin(2 * math.pi * q / n), z - rr * math.cos(2 * math.pi * q / n)) for q in range(n)] for a, rr in prof], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); body = b.finish('det_chute', sharp_deg=35)
    pivot = P3(a1 - 0.20, 0.0, z + r); b = B()
    b.loft([[P3(a, rr * math.sin(2 * math.pi * q / n), z - rr * math.cos(2 * math.pi * q / n)) - pivot for q in range(n)] for a, rr in ((a1 - 0.195, r), (a1 - 0.08, r * 0.80), (a1, r * 0.25))], G_METAL, cap0=G_METAL, cap1=G_METAL)
    cap = b.finish('chute_cap', sharp_deg=35); cap.location = pivot
    PARTS['chute_cap'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(-95.0, 0.0), note='крышка контейнера тормозного парашюта под рулём: петля сверху; минус - откидывается вверх')
    return [body, cap]


# ── цельноповоротный стабилизатор: две половины ──
STAB_Z, STAB_A, SXR, SXT = 0.470, 13.45, 0.585, 1.870
S_LE = Lin([(SXR, 12.47), (SXT, 14.60)])
S_TE = Lin([(SXR, 13.75), (SXT, 14.95)])


def stab(sx):
    name = 'stab_' + ('r' if sx > 0 else 'l'); xr0 = side_x(13.2, STAB_Z); pivot = P3(STAB_A, sx * (xr0 + 0.02), STAB_Z); rings = []
    for s in (0.0, 0.04, 0.10, 0.20, 0.34, 0.50, 0.66, 0.80, 0.92, 0.97, 1.0):
        xn = SXR + (SXT - SXR) * s; c = S_TE(xn) - S_LE(xn); r_ = foil_ring(S_LE(xn), c, 0.050 - 0.010 * s, 0.0, 1.0, 20, lambda a, h: P3(a, sx * xn, STAB_Z + h)); out = []
        for p in r_:
            a_ = L / 2 - p.y; xr = side_x(min(max(a_, 12.0), NOZ_A0), p.z) + 0.022; out.append(Vector((sx * (abs(p.x) + (1 - s) ** 2 * (xr - SXR)), p.y, p.z)) - pivot)
        rings.append(out)
    b = B(); r0 = rings[0]; nr = len(r0); inner = [(r0[q] + r0[nr - 1 - q]) / 2 for q in range(nr)]; b.loft([inner] + rings, G_SKIN, cap1=G_SKIN)
    n = 14; rg = lambda x_, r: [P3(STAB_A + r * math.cos(2 * math.pi * q / n), sx * x_, STAB_Z + r * math.sin(2 * math.pi * q / n)) - pivot for q in range(n)]
    b.loft([rg(xr0 - 0.06, 0.050), rg(xr0 + 0.05, 0.050)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    strut(b, P3(S_LE(SXT) - 0.42, sx * (SXT - 0.02), STAB_Z) - pivot, P3(S_LE(SXT) + 0.10, sx * (SXT - 0.02), STAB_Z) - pivot, 0.022, G_SKIN, 10)     # противофлаттерный груз
    ob = b.finish(name, sharp_deg=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(-18.0, 8.0), note='цельноповоротный, половины отдельно; ось поперёк у борта; плюс - задняя кромка вниз')
    return ob


# ── сопло: обечайка и створки (mig21_09) ──
NOZ_Z, NOZ_R0, NOZ_R, NOZ_A = 0.152, 0.532, 0.470, 14.15


def nozzle():
    b = B(); N = 24; a0 = NOZ_A0 + 0.002; a1 = NOZ_A; aP = a0 + 0.10
    def ptp(a, r, ang): return P3(a, r * math.sin(ang), NOZ_Z - r * math.cos(ang))
    ring = lambda a, r, nn=64: [ptp(a, r, 2 * math.pi * q / nn) for q in range(nn)]
    R0 = NOZ_R0
    sec = [ring(a0 - 0.02, R0 - 0.010), ring(a0 + 0.015, R0 + 0.004), ring(aP, R0 - 0.004), ring(aP, R0 - 0.040), ring(a0 - 0.02, R0 - 0.050)]; b.loft(sec + [sec[0]], G_METAL)
    Rp = lambda a: (R0 - 0.020) + (NOZ_R - (R0 - 0.020)) * ((a - aP) / (a1 - aP)) ** 1.2; hwo = math.pi / N * 1.03; th = 0.010
    for j in range(N):
        am = 2 * math.pi * j / N
        def petal(a):
            r = Rp(a); o = []; i_ = []
            for q in range(4):
                t_ = q / 3; ang = am - hwo + 2 * hwo * t_; lift = 0.005 * (1 - t_); o.append(ptp(a, r + lift, ang)); i_.append(ptp(a, r + lift - th, ang))
            return o + i_[::-1]
        b.loft([petal(aP), petal((aP + a1) / 2), petal(a1)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    # внутренние створки форсажной камеры и стабилизатор пламени
    b.loft([ring(a1 - 0.06, NOZ_R - 0.05, 48), ring(a1 - 0.60, 0.40, 48), ring(a0 - 0.9, 0.44, 48)], G_DARK)
    ob = b.finish('nozzle', sharp_deg=30)
    PARTS['nozzle'] = dict(pivot=P3(NOZ_A0, 0.0, NOZ_Z), axis=Vector((0, 1, 0)), range=None, note='створки регулируемого сопла одним объектом; раскрытие игрой - масштабом по радиусу вокруг оси (pivot на оси сопла)')
    return ob


def bore_cut():
    a1 = NOZ_A0; n = 64; ring = lambda a, r: [P3(a, r * math.sin(2 * math.pi * q / n), NOZ_Z - r * math.cos(2 * math.pi * q / n)) for q in range(n)]
    prof = [(a1 + 0.25, 0.490, G_METAL), (a1 - 0.30, 0.490, G_METAL), (a1 - 0.80, 0.480, G_COCK), (a1 - 1.10, 0.470, G_DARK), (a1 - 1.50, 0.300, G_DARK), (a1 - 1.62, 0.050, G_DARK)]
    b = B(); b.loft([ring(a, r) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK); return b.finish('c_bore', sharp_deg=30)


def burner():
    b = B(); n = 32; a = NOZ_A0 - 1.00; ring = lambda a_, r: [P3(a_, r * math.sin(2 * math.pi * q / n), NOZ_Z - r * math.cos(2 * math.pi * q / n)) for q in range(n)]
    for r in (0.36, 0.22, 0.10): b.loft([ring(a, r + 0.016), ring(a + 0.05, r + 0.016), ring(a + 0.05, r - 0.016), ring(a, r - 0.016), ring(a, r + 0.016)], G_DARK)
    for q in range(8):
        ang = 2 * math.pi * q / 8; u = Vector((math.sin(ang), 0, -math.cos(ang))); c0 = P3(a + 0.02, 0.0, NOZ_Z); strut(b, c0 + u * 0.05, c0 + u * 0.46, 0.012, G_DARK, 6)
    b.loft([ring(a + 0.10, 0.08), ring(a - 0.25, 0.012)], G_DARK, cap0=G_DARK, cap1=G_DARK); return b.finish('burner', sharp_deg=35)


# ── кабина: неподвижный козырёк, фонарь откидывается вправо на продольной петле ──
CAN_A0, ARCH_A, CAN_A1 = 2.92, 3.72, 5.04
CAN_T = tracks([(2.92, 0.640, 0.200), (3.20, 0.900, 0.310), (3.72, 1.180, 0.370), (4.20, 1.290, 0.385), (4.60, 1.300, 0.385), (5.04, 1.210, 0.350)])
CK_HW = 0.300
def SILL(a): return top_z(a, CAN_T[1](a))


def can_ring(a, inset=0.0, n=40):
    top, hw = CAN_T[0](a) - inset, CAN_T[1](a) - inset; y0 = SILL(a) + 0.002; top = max(top, y0 + 0.004); out = []
    for q in range(n):
        c = math.cos(math.pi * q / (n - 1)); s = math.sin(math.pi * q / (n - 1)); out.append(P3(a, math.copysign(hw * abs(c) ** 0.72, c), y0 + (top - y0) * s ** 0.80))
    return out


def cock_cut():
    def sec(a, hw): return [P3(a, -hw, 0.02), P3(a, hw, 0.02), P3(a, hw, 2.2), P3(a, -hw, 2.2)]
    return loft_obj('c_cock', [sec(a, min(CK_HW, CAN_T[1](a) - 0.035)) for a in stations(3.30, 4.96, 0.07)], G_COCK, sharp=25)


def frame_arch(b, a, w, inset=0.008, h=0.020, n=40):
    ri0 = can_ring(a - w, inset, n); ro0 = can_ring(a - w, -h, n); ro1 = can_ring(a + w, -h, n); ri1 = can_ring(a + w, inset, n); strip(b, [ri0, ro0, ro1, ri1, ri0], G_SKIN)


def canopy():
    a0, a1 = ARCH_A + 0.034, CAN_A1 - 0.004; st = stations(a0 + 0.004, a1 - 0.004, 0.09); am = (a0 + a1) / 2; pivot = P3(am, CAN_T[1](am) + 0.026, SILL(am) - 0.002)
    b = B(); strip(b, [can_ring(a) for a in st], G_GLASS); gl = b.finish('canopy_glass', sharp_deg=60)
    b = B(); frame_arch(b, a0 + 0.028, 0.028, h=0.022); frame_arch(b, a1 - 0.030, 0.030, h=0.022)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        b.loft([[rail(a, 0.004, 0.012), rail(a, 0.018, 0.010), rail(a, 0.018, 0.034), rail(a, -0.012, 0.050), rail(a, -0.012, 0.022)] for a in stations(a0, a1, 0.07)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    fr_ = b.finish('canopy', sharp_deg=45)
    for o in (gl, fr_):
        for v in o.data.vertices: v.co -= pivot
    fr_.location = pivot; gl.parent = fr_; gl.location = (0, 0, 0)
    PARTS['canopy'] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(0.0, 95.0), note='фонарь откидывается вправо: продольная петля по правому борту; плюс - открытие; canopy_glass - дочерний объект')
    return [fr_, gl]


def windscreen():
    a1 = ARCH_A; b = B(); strip(b, [can_ring(a) for a in stations(CAN_A0 + 0.01, a1, 0.07)], G_GLASS); gl = b.finish('screen_glass', sharp_deg=60)
    b = B(); frame_arch(b, ARCH_A + 0.002, 0.030, h=0.022)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        b.loft([[rail(a, 0.004, 0.010), rail(a, 0.016, 0.010), rail(a, 0.016, 0.026), rail(a, -0.010, 0.040), rail(a, -0.010, 0.020)] for a in stations(CAN_A0 + 0.03, a1, 0.07)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
        q = 13 if sg > 0 else 26                                  # стойки плоского лобового стекла
        b.loft([[can_ring(a, -0.004)[q] + Vector((dx, 0, 0)) for dx in (-0.012, 0.012)] + [can_ring(a, -0.020)[q] + Vector((dx, 0, 0)) for dx in (0.012, -0.012)] for a in stations(CAN_A0 + 0.06, a1 - 0.02, 0.07)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return [gl, b.finish('screen_frame', sharp_deg=45)]


def cockpit():
    b = B(); fl = 0.03; aS = 4.35
    def bx(a0, a1, x0, x1, z0, z1, mat=G_COCK): b.loft([[P3(a, x0, z0), P3(a, x1, z0), P3(a, x1, z1), P3(a, x0, z1)] for a in (a0, a1)], mat, cap0=mat, cap1=mat)
    bx(aS - 0.25, aS + 0.20, -0.20, 0.20, fl, fl + 0.30, G_DARK); bx(aS - 0.26, aS + 0.16, -0.18, 0.18, fl + 0.30, fl + 0.38, 6)
    b.loft([[P3(aS + 0.14 + 0.16 * t, -0.19, fl + 0.34 + 0.74 * t), P3(aS + 0.14 + 0.16 * t, 0.19, fl + 0.34 + 0.74 * t), P3(aS + 0.26 + 0.16 * t, 0.19, fl + 0.34 + 0.74 * t), P3(aS + 0.26 + 0.16 * t, -0.19, fl + 0.34 + 0.74 * t)] for t in (0, 0.5, 0.80)], 6, cap0=6, cap1=6)
    bx(aS + 0.30, aS + 0.42, -0.12, 0.12, fl + 0.84, fl + 0.98, G_DARK)
    for d in (-0.07, 0.07): b.loft([[P3(aS + 0.13 + 0.16 * t, d - 0.022, fl + 0.40 + 0.66 * t), P3(aS + 0.13 + 0.16 * t, d + 0.022, fl + 0.40 + 0.66 * t), P3(aS + 0.125 + 0.16 * t, d + 0.022, fl + 0.40 + 0.66 * t), P3(aS + 0.125 + 0.16 * t, d - 0.022, fl + 0.40 + 0.66 * t)] for t in (0, 1)], 8, cap0=8, cap1=8)
    for d in (-0.05, 0.05): tube(b, [P3(aS + 0.32, d, fl + 0.98), P3(aS + 0.30, d, fl + 1.02), P3(aS + 0.24, d, fl + 1.04)], 0.012, 9, 6)                    # рукоятки катапульты
    tube(b, [P3(aS - 0.42, 0, fl), P3(aS - 0.44, 0, fl + 0.36), P3(aS - 0.44, 0, fl + 0.46)], [0.016, 0.014, 0.024], G_DARK, 8)
    bx(3.50, 3.58, -0.27, 0.27, fl + 0.36, fl + 0.82, G_DARK)
    for dx, dz in ((-0.14, 0.68), (0.0, 0.68), (0.14, 0.68), (-0.14, 0.52), (0.0, 0.52), (0.14, 0.52)): bx(3.58, 3.586, dx - 0.055, dx + 0.055, fl + dz - 0.055, fl + dz + 0.055, 7)
    bx(3.40, 3.62, -0.10, 0.10, fl + 0.84, fl + 0.90, G_DARK); bx(3.52, 3.53, -0.07, 0.07, fl + 0.90, fl + 1.02, 7)                                             # прицел
    for sx in (1, -1): bx(3.62, 4.75, sx * 0.22 - 0.06, sx * 0.22 + 0.06, fl, fl + 0.42, G_DARK)
    return b.finish('cockpit', sharp_deg=40)


# ── ПВД над носом, антенны ──
def details():
    b = B(); z0 = top_z(1.3, 0.12) + 0.05
    strut(b, P3(-0.45, 0.12, z0 + 0.03), P3(0.60, 0.12, z0 + 0.03), 0.014, G_METAL, 10); strut(b, P3(0.60, 0.12, z0 + 0.03), P3(2.10, 0.12, z0 + 0.02), 0.024, G_SKIN, 10)
    for a_ in (1.5, 2.0): b.loft([[P3(a_ + da, 0.12 - 0.012, top_z(a_, 0.12) - 0.02), P3(a_ + da, 0.12 + 0.012, top_z(a_, 0.12) - 0.02), P3(a_ + da, 0.12 + 0.010, z0 + 0.03), P3(a_ + da, 0.12 - 0.010, z0 + 0.03)] for da in (-0.05, 0.05)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for sg in (1, -1): b.loft([[P3(-0.05 + da, 0.12 + sg * 0.012, z0 + 0.03 + dz) for da, dz in ((0, -0.004), (0.10, -0.004), (0.10, 0.004), (0, 0.004))], [P3(0.02 + da * 0.4, 0.12 + sg * 0.10, z0 + 0.03 + dz * 0.5) for da, dz in ((0, -0.004), (0.10, -0.004), (0.10, 0.004), (0, 0.004))]], G_METAL, cap0=G_METAL, cap1=G_METAL)   # флюгарки
    b.loft([[P3(6.9 + da, -0.006, 1.13), P3(6.9 + da, 0.006, 1.13), P3(7.0 + da * 0.5, 0.004, 1.13 + h_), P3(7.0 + da * 0.5, -0.004, 1.13 + h_)] for da, h_ in ((0.0, 0.30), (0.22, 0.30))], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)   # антенна на гаргроте
    for a_ in (15.05, 15.25): strut(b, P3(a_, 0.0, FIN_TOP - 0.02), P3(a_, 0.0, FIN_TOP + 0.10), 0.006, G_METAL, 6)
    return b.finish('det_probe', sharp_deg=40)


# ── тормозные щитки: два передних под фюзеляжем, один задний перед гребнем ──
def belly(a, x): return down(x, Yb(a), z0=-3.0, dirn=1)


def brake_f(sx):
    n_ = 'brake_f_' + ('r' if sx > 0 else 'l'); a0, a1 = 4.55, 5.45; t0, t1 = math.radians(22), math.radians(62)
    ang = lambda u: t0 + (t1 - t0) * u; pt = lambda a, th, dr: P3(a, sx * (fr(a) + dr) * math.sin(th), fz(a) - (fr(a) + dr) * math.cos(th)); b = B(); rings = []
    for i in range(7):
        a = a0 + (a1 - a0) * i / 6; r = [pt(a, ang(j / 6), 0.018) for j in range(7)] + [pt(a, ang(1 - j / 6), 0.003) for j in range(7)]; rings.append(r if sx < 0 else r[::-1])
    b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN); ob = b.finish(n_, sharp_deg=40)
    p0, p1 = pt(a0, t0, 0.0), pt(a0, t1, 0.0); pivot = (p0 + p1) / 2; ax = (p1 - p0).normalized(); rear = pt(a1, (t0 + t1) / 2, 0.0); q = Matrix.Rotation(math.radians(10), 4, ax) @ (rear - pivot) + pivot
    if math.hypot(q.x, q.z - fz(a1)) < math.hypot(rear.x, rear.z - fz(a1)): ax = -ax          # плюс - задняя кромка от фюзеляжа
    _rel(ob, pivot)
    PARTS[n_] = dict(pivot=pivot.copy(), axis=ax, range=(0.0, 25.0), note='передний тормозной щиток: петля по передней кромке; плюс - задняя кромка от фюзеляжа (знак проверен _collide)')
    return ob


def brake_r():
    a0, a1 = 9.55, 10.45; t1 = math.radians(24); pt = lambda a, th, dr: P3(a, (fr(a) + dr) * math.sin(th), fz(a) - (fr(a) + dr) * math.cos(th)); b = B(); rings = []
    for i in range(7):
        a = a0 + (a1 - a0) * i / 6; r = [pt(a, -t1 + 2 * t1 * j / 8, 0.018) for j in range(9)] + [pt(a, t1 - 2 * t1 * j / 8, 0.003) for j in range(9)]; rings.append(r[::-1])
    b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN); ob = b.finish('brake_r', sharp_deg=40); pivot = P3(a0, 0.0, fz(a0) - fr(a0) - 0.003); _rel(ob, pivot)
    PARTS['brake_r'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, 40.0), note='задний тормозной щиток перед гребнем: петля по передней кромке; плюс - задняя кромка вниз')
    return ob


# ── пилоны: четыре под крылом и подфюзеляжный узел с баком ──
PYL = (('o', 2.780, 9.05, 10.20), ('i', 1.900, 7.95, 9.60))


def pylon(sx, tag, x, a0, a1):
    b = B(); name = f'pylon_{tag}_' + ('r' if sx > 0 else 'l'); hw = 0.045; am = (a0 + a1) / 2; c = TE_W(x) - LE_W(x)
    zt = lambda a: wy(x) - TC(x) * c * thk((a - LE_W(x)) / c) + 0.012; zb = zt(am) - 0.26
    def sec(a, f=1.0, dz=0.0): return [P3(a, sx * x - hw * f, zb + dz), P3(a, sx * x + hw * f, zb + dz), P3(a, sx * x + hw * f * 0.8, zt(a)), P3(a, sx * x - hw * f * 0.8, zt(a))]
    st = [a0, a0 + 0.12, a0 + 0.35, a1 - 0.35, a1 - 0.12, a1]; fs = [0.10, 0.7, 1.0, 1.0, 0.7, 0.10]; dz = [0.16, 0.05, 0.0, 0.0, 0.04, 0.12]
    b.loft([sec(a, f, d_) for a, f, d_ in zip(st, fs, dz)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); PYLON_PTS[name] = P3(am, sx * x, zb)
    return b.finish(name, sharp_deg=40)


TANK_ON = False                                                  # Mark 2026-11-12: «убери бак снизу»
TANK = (5.60, 10.10, 0.270)                                      # подфюзеляжный бак: a0, a1, радиус (mig21_12)


def tank():
    a0, a1, r = TANK; zc = FT[1](7.8) - 0.14 - r; n = 28; am = (a0 + a1) / 2; b = B()
    zl = (zc + r * 0.6) if TANK_ON else FT[1](am) - 0.115
    def sec(a, f): return [P3(a, -0.05 * f, zl), P3(a, 0.05 * f, zl), P3(a, 0.05 * f, FT[1](a) + 0.03), P3(a, -0.05 * f, FT[1](a) + 0.03)]
    b.loft([sec(am - 0.70, 0.2), sec(am - 0.50, 1.0), sec(am + 0.50, 1.0), sec(am + 0.75, 0.2)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); py = b.finish('pylon_c', sharp_deg=40)
    T = Track([(a0, 0.01), (a0 + 0.10, 0.07), (a0 + 0.55, 0.19), (a0 + 1.30, r), (a1 - 1.60, r), (a1 - 0.60, 0.17), (a1 - 0.08, 0.05), (a1, 0.01)])
    b = B(); pv = P3(am, 0.0, zc + r); b.loft([[P3(a, T(a) * math.sin(2 * math.pi * q / n), zc - T(a) * math.cos(2 * math.pi * q / n)) - pv for q in range(n)] for a in stations(a0, a1, 0.14)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for sg in (1, -1):                                             # стабилизаторы бака
        b.loft([[P3(a1 - 0.95 + da, sg * (T(a1 - 0.8) * 0.7 + d_), zc + dz) - pv for da, dz in ((0, -0.006), (0.55 - d_ * 1.2, -0.006), (0.55 - d_ * 1.2, 0.006), (0, 0.006))] for d_ in (0.0, 0.26)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    tk = b.finish('tank_c', sharp_deg=40); tk.location = pv
    if not TANK_ON:
        me_ = tk.data; bpy.data.objects.remove(tk); bpy.data.meshes.remove(me_); PYLON_PTS['center'] = P3(am, 0.0, FT[1](am) - 0.115); return [py]
    PARTS['tank_c'] = dict(pivot=pv.copy(), axis=Vector((0, 0, 1)), range=None, note='подфюзеляжный бак: отдельная часть, игра может снять; начало - верх бака под узлом')
    PYLON_PTS['center'] = pv.copy()
    return [py, tk]


# ── шасси (mig21_08, 09, 12): передняя стойка убирается вперёд, основные - к фюзеляжу, колесо в нише встаёт вертикально ──
NG = dict(a=2.55, hinge=(2.72, -0.560), rw=0.250, ww=0.130)
MG = dict(a=7.45, x=1.395, rw=0.400, ww=0.200, T=(7.40, 1.050))


def gear_nose():
    a_h, z_h = NG['hinge']; rw, ww = NG['rw'], NG['ww']; T = P3(a_h, 0.0, z_h); wc = P3(NG['a'], 0.0, GROUND_Z + rw); low = wc + U * 0.03 + X * 0.0; d = (wc + U * 0.20 - T); Ln = d.length; d = d.normalized(); at = lambda s: T + d * s
    b = B(); wheel(b, wc, rw, ww, 5)
    tube(b, [T - X * 0.16, T + X * 0.16], 0.040, G_SKIN, 12); tube(b, [at(0.0), at(Ln * 0.60)], 0.052, G_SKIN, 16); tube(b, [at(Ln * 0.60), at(Ln - 0.02)], 0.034, G_METAL, 16)
    for s, r_ in ((0.05, 0.064), (Ln * 0.35, 0.062), (Ln * 0.60, 0.064)): collar(b, at(s), d, r_, 0.05)
    for sg in (1, -1): tube(b, [at(Ln - 0.02) + X * sg * 0.02, at(Ln) + X * sg * (ww * 0.5 + 0.035), wc + X * sg * (ww * 0.5 + 0.035)], [0.030, 0.026, 0.024], G_SKIN, 10)      # вилка
    tube(b, [wc - X * (ww * 0.5 + 0.05), wc + X * (ww * 0.5 + 0.05)], 0.018, G_BELT, 10)
    p0 = at(Ln * 0.58) + R_ * 0.062; k_ = at(Ln * 0.78) + R_ * 0.16; p1 = at(Ln - 0.03) + R_ * 0.05; link(b, p0, k_, 0.022, 0.014); link(b, k_, p1, 0.022, 0.014)
    hose(b, [at(0.05) + X * 0.06, at(Ln * 0.4) + X * 0.062, at(Ln * 0.62) + X * 0.058], 0.006, (0.3, 0.7))
    ob = b.finish('gear_n', sharp_deg=40); _rel(ob, T)
    PARTS['gear_n'] = dict(pivot=T.copy(), axis=Vector((1, 0, 0)), range=(0.0, 95.0), note='0 - выпущено; уборка вперёд', retracted=95.0)
    out = [ob]
    for sx in (1, -1):                                             # створки передней ниши, открыты (только в файле стоек)
        b3 = B(); zt = lambda a: belly(a, sx * 0.16).z
        b3.loft([[P3(a, sx * 0.16, zt(a) + 0.01), P3(a, sx * 0.176, zt(a) + 0.01), P3(a, sx * 0.30, zt(a) - 0.36), P3(a, sx * 0.284, zt(a) - 0.36)] for a in stations(1.55, 2.85, 0.18)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
        out.append(b3.finish('gear_door_n_' + ('r' if sx > 0 else 'l'), sharp_deg=40))
    return out


def gear_main(sx):
    n_ = 'r' if sx > 0 else 'l'; rw, ww = MG['rw'], MG['ww']; IN = X * (-sx); xT = MG['T'][1]; T = P3(MG['T'][0], sx * xT, wy(xT) - 0.06); wc = P3(MG['a'], sx * MG['x'], GROUND_Z + rw)
    low = wc + IN * (ww * 0.5 + 0.10) + U * 0.02; d = (low - T); Ln = d.length; d = d.normalized(); at = lambda s: T + d * s; b = B()
    tube(b, [T - F * 0.14, T + F * 0.14], 0.050, G_SKIN, 12); tube(b, [at(0.0), at(Ln * 0.58)], 0.062, G_SKIN, 18); tube(b, [at(Ln * 0.58), at(Ln - 0.03)], 0.042, G_METAL, 18)
    for s, r_ in ((0.05, 0.076), (Ln * 0.30, 0.074), (Ln * 0.58, 0.076)): collar(b, at(s), d, r_, 0.05)
    collar(b, at(Ln - 0.02), d, 0.062, 0.08); tube(b, [low, wc - IN * (ww * 0.5 + 0.02)], [0.050, 0.040], G_SKIN, 12)
    p0 = at(Ln * 0.56) + R_ * 0.074; k_ = at(Ln * 0.76) + R_ * 0.19; p1 = low + R_ * 0.06 + U * 0.04; link(b, p0, k_, 0.026, 0.016); link(b, k_, p1, 0.026, 0.016)
    cy0 = T + IN * 0.45 + U * 0.03; tube(b, [cy0, cy0.lerp(at(Ln * 0.40), 0.6)], 0.030, G_SKIN, 10); tube(b, [cy0.lerp(at(Ln * 0.40), 0.6), at(Ln * 0.40)], 0.016, G_METAL, 10)        # цилиндр уборки к фюзеляжу
    o1 = F * 0.07 + IN * 0.015; hose(b, [at(0.06) + o1, at(Ln * 0.3) + o1, at(Ln * 0.58) + o1 * 1.05, at(Ln * 0.82) + o1 * 1.2, wc + F * rw * 0.2 + U * 0.06 + IN * (ww * 0.5 + 0.03)], 0.007, (0.15, 0.4, 0.6, 0.82))
    # щиток на стойке (mig21_08, 09): плита снаружи ноги
    OUT_ = -IN; pl = lambda s, w_: [at(s) + OUT_ * 0.085 + F * w_, at(s) + OUT_ * 0.085 - F * w_, at(s) + OUT_ * 0.097 - F * w_, at(s) + OUT_ * 0.097 + F * w_]
    b.loft([pl(0.06, 0.20), pl(Ln * 0.45, 0.19), pl(Ln * 0.90, 0.13)], G_COCK, cap0=G_COCK, cap1=G_COCK)
    ob = b.finish('gear_m_' + n_, sharp_deg=40); _rel(ob, T)
    b3 = B(); wheel(b3, wc, rw, ww, 8); wh = b3.finish('gear_w_' + n_, sharp_deg=40); _rel(wh, wc)
    tgt = P3(MG['T'][0] + 0.25, sx * 0.34, -0.25) - T; dv = wc - T; ax = dv.cross(tgt).normalized(); ang = round(math.degrees(dv.angle(tgt)), 1)
    PARTS['gear_m_' + n_] = dict(pivot=T.copy(), axis=ax, range=(0.0, ang), note='0 - выпущено; плюс - уборка к фюзеляжу; колесо gear_w при уборке доворачивается на своей оси и встаёт в нише фюзеляжа вертикально', retracted=ang)
    PARTS['gear_w_' + n_] = dict(pivot=wc.copy(), axis=Vector((0, 1, 0)), range=(0.0, 87.0) if sx > 0 else (-87.0, 0.0), note='колесо: дочерняя часть стойки; доворот вокруг продольной оси при уборке, чтобы встать вертикально в нише')
    return [ob, wh]


def build_skin():
    S = [fore(), spine(), gun(), vfin(), wing_s(1), wing_s(-1)]; host = S[0]
    for o in S[1:]: _apply_bool(host, o, 'UNION'); _drop(o)
    for c in (duct_cut(), bore_cut(), cock_cut()): _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'SU17_skin'; host.data.name = 'SU17_skin'; bvh_ready(host)
    return host


def plane(stage=9):
    """Этапы: 1 - обшивка; 2 - оперение, сопло, механизация; 3 - кабина, фонарь, щитки, пилоны, бак; 4 - шасси."""
    PARTS.clear(); PYLON_PTS.clear(); skin = build_skin(); out = [skin]
    if stage >= 2:
        out += [fin(), rudder(), stab(1), stab(-1), nozzle(), burner(), cone(), details()] + chute()
        for s, n in ((1, 'r'), (-1, 'l')):
            out += [wing_part('flap_' + n, FLAP, FLAP_C, s, (0.0, 45.0), 'закрылок: ось в центре круглого носа; плюс - вниз'), wing_part('ail_' + n, AIL, AIL_C, s, (-20.0, 20.0), 'элерон: ось в центре круглого носа; плюс - вниз'), fence(s)]
    if stage >= 3:
        out += canopy() + windscreen() + [cockpit(), brake_f(1), brake_f(-1), brake_r()] + tank()
        for sx in (1, -1):
            for tag, x, a0, a1 in PYL: out.append(pylon(sx, tag, x, a0, a1))
    if stage >= 4: out += gear_nose() + gear_main(1) + gear_main(-1)
    return out
