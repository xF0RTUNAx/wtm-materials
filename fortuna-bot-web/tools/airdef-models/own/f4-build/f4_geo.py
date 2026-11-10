# f4_geo.py - геометрия F-4E Phantom II (ВВС США, длинный нос с обтекателем пушки, двухместный) для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z.
# a - расстояние от острия носа, z - высота над осью сопел. Длина L = 19,20 от острия носа до концов стабилизатора (прежняя модель игры 19,39 вместе со штангой).
# Размеры: профиль с f4_03 (F-4D сбоку, 88,6 пикс/м; нос у E длиннее на 1,44 м: a = (x - 5) / 88,6 + 1,44), план - с f4_04 (от хвоста, 42,1 пикс/м), ракурсы f4_01, 05, 06 - сверка глазами.
# Сетка: замкнутые оболочки объединяются булевой операцией в одну обшивку; киль, стабилизаторы, рули, предкрылки, фонари - отдельные детали.
import math
import types
import bpy
from mathutils import Vector, Matrix
from modelkit import B
import f4_base as fb
from f4_base import *
from f4_base import _apply_bool, _drop, _rel

G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_DUCT = 0, 1, 2, 3, 4, 5, 11
PARTS = fb.PARTS
L = fb.L

# ── фюзеляж: центральное тело от острия носа до хвостового конуса; за крылом оно поднимается над соплами хвостовой балкой (f4_03, 06) ──
FORE = [  # a, верх, низ, полуширина, n верха, n низа. Нос короткий, по боковой проекции f4_10 (48,7 пикс/м, совмещение по хвосту): остриё на a = 1,44
    (1.44, -0.150, -0.170, 0.008, 2.0, 2.0), (1.47, -0.115, -0.205, 0.045, 2.0, 2.0), (1.54, -0.080, -0.250, 0.085, 2.0, 2.0), (1.69, -0.010, -0.300, 0.155, 2.0, 2.0), (1.94, 0.100, -0.350, 0.250, 2.0, 2.0),
    (2.34, 0.290, -0.420, 0.350, 2.0, 2.1), (2.84, 0.480, -0.450, 0.425, 2.1, 2.2), (3.32, 0.660, -0.450, 0.470, 2.2, 2.4), (3.81, 0.750, -0.440, 0.500, 2.3, 2.5), (4.30, 0.950, -0.420, 0.525, 2.4, 2.6),
    (4.77, 1.080, -0.410, 0.545, 2.5, 2.6), (5.20, 1.100, -0.405, 0.580, 2.5, 2.6), (6.30, 1.100, -0.400, 0.670, 2.5, 2.6), (7.40, 1.100, -0.400, 0.680, 2.5, 2.6), (7.62, 1.540, -0.405, 0.660, 1.7, 2.6),
    (8.50, 1.490, -0.430, 0.600, 1.6, 2.6), (10.00, 1.450, -0.450, 0.550, 1.6, 2.6), (12.00, 1.450, -0.450, 0.530, 1.6, 2.6), (13.40, 1.450, -0.440, 0.500, 1.7, 2.4), (14.20, 1.440, -0.150, 0.460, 1.9, 2.2),
    (14.87, 1.390, 0.280, 0.420, 2.0, 2.0), (15.50, 1.300, 0.430, 0.385, 2.0, 2.0), (16.45, 1.170, 0.580, 0.335, 2.0, 2.0), (18.00, 1.050, 0.790, 0.225, 2.0, 2.0), (18.70, 1.030, 0.850, 0.150, 2.0, 2.0),
    (19.05, 1.000, 0.910, 0.045, 2.0, 2.0)]
TIP = 1.44
def NA(a): return a
FT = tracks(FORE)
RAD_A = 3.32                                                    # конец чёрного обтекателя РЛС
NAC_A1 = 14.87                                                  # конец обшивки гондол, дальше сопла
TAIL_A = 19.05


def fore_y(a, x):
    """Высота верхней поверхности над |x|: для порога фонаря."""
    top, bot, hw, nt = FT[0](a), FT[1](a), FT[2](a), FT[3](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nt)
    return cy + ht * q ** (1 / nt)


def side_x(a, z):
    """Полуширина центрального тела на высоте z: для корня стабилизатора."""
    top, bot, hw, nt, nb = [t(a) for t in FT]; cy = (top + bot) / 2; ht = (top - bot) / 2; s = max(-0.999, min(0.999, (z - cy) / ht)); e = nt if s > 0 else nb
    return hw * max(0.0, 1 - abs(s) ** e) ** (1 / e)


def fore():
    st = [TIP + v for v in (0.0, 0.012, 0.027, 0.05, 0.08, 0.12, 0.17, 0.23)] + stations(TIP + 0.3, 3.3, 0.10) + stations(3.4, 7.40, 0.18) + [7.44, 7.48, 7.52, 7.56, 7.62] + stations(7.8, 18.6, 0.20) + [18.8, 18.95, TAIL_A]
    return loft_obj('s_fore', [sup(a, 0.0, *[t(a) for t in FT], 80) for a in st])


# ── обтекатель пушки под носом (f4_01, 06): длинный, с тупым передом ──
GUN = tracks([(0.95, -0.200, -0.270, 0.040), (1.12, -0.150, -0.430, 0.115), (1.35, -0.150, -0.520, 0.160), (2.00, -0.150, -0.585, 0.200), (2.80, -0.150, -0.580, 0.215), (3.35, -0.150, -0.500, 0.190), (3.80, -0.150, -0.385, 0.120), (4.05, -0.150, -0.315, 0.040)])


GUN_A0, GUN_A1 = 1.58, 4.02                                      # обтекатель пушки под коротким носом (Mark: «оставь как есть, но верни пушку»)
GUN = tracks([(1.58, -0.250, -0.360, 0.040), (1.72, -0.250, -0.560, 0.120), (1.95, -0.280, -0.660, 0.165), (2.50, -0.350, -0.710, 0.200), (3.20, -0.380, -0.690, 0.210), (3.70, -0.400, -0.580, 0.170), (4.02, -0.400, -0.470, 0.070)])


def gun_fairing():
    return loft_obj('s_gun', [sup(a, 0.0, GUN[0](a), GUN[1](a), GUN[2](a), 2.2, 2.4, 40) for a in stations(GUN_A0, GUN_A1, 0.10)], sharp=40)


# ── гондолы: прямоугольные заборники с отстоящей пластиной у борта, дальше широкие плечи, к соплу круглые (f4_01, 02, 03) ──
INL_A = 6.12
TRUNK = [  # a, центр x, верх, низ, полуширина, n верха, n низа
    (6.12, 1.090, 0.920, -0.360, 0.280, 2.8, 2.8), (6.80, 1.005, 0.920, -0.385, 0.355, 3.3, 3.3), (7.60, 0.900, 0.920, -0.410, 0.460, 3.8, 3.8), (9.00, 0.800, 0.910, -0.460, 0.570, 4.0, 4.0),
    (10.50, 0.760, 0.880, -0.480, 0.610, 3.5, 4.0), (12.00, 0.700, 0.800, -0.500, 0.620, 3.0, 3.5), (13.40, 0.630, 0.660, -0.530, 0.600, 2.4, 2.6), (14.30, 0.570, 0.575, -0.560, 0.568, 2.0, 2.1), (14.87, 0.550, 0.545, -0.565, 0.555, 2.0, 2.0)]
TR = tracks(TRUNK)
NOZ_X, NOZ_Z, NOZ_R0, NOZ_R, NOZ_A = 0.550, -0.010, 0.555, 0.445, 15.45


def dsup(a, sx, cx, top, bot, hw, no, ni, n):
    """Сечение заборника буквой D (f4_11, 12): у борта прямая стенка с малыми скруглениями (показатель ni), наружу - выпуклая со скруглёнными углами (no)."""
    cy = (top + bot) / 2; ht = (top - bot) / 2; pts = []
    for k in range(n):
        th = -math.pi / 2 + 2 * math.pi * k / n; c, s_ = math.cos(th), math.sin(th); e = no if c * sx > 0 else ni
        pts.append(P3(a, sx * cx + hw * math.copysign(abs(c) ** (2 / e), c), cy + ht * math.copysign(abs(s_) ** (2 / e), s_)))
    return pts
def _ni(a, nt): return 9.0 - (9.0 - nt) * max(0.0, min(1.0, (a - INL_A) / 1.4))


def trunk(sx):
    def ring(a):
        cx, top, bot, hw, nt, nb = [t(a) for t in TR]; return dsup(a, sx, cx, top, bot, hw, nt, _ni(a, nt), 72)
    return loft_obj('s_trunk_' + ('r' if sx > 0 else 'l'), [ring(a) for a in stations(INL_A, NAC_A1, 0.22)], G_SKIN, sharp=40)


def duct_cut(sx):
    """Канал заборника вглубь, глухой торец: плавно темнеет."""
    a0, a1 = INL_A - 0.20, INL_A + 2.60; rings = []
    for i in range(12):
        a = a0 + (a1 - a0) * i / 11; t = max(0.0, min(1.0, (a - (INL_A + 0.5)) / (a1 - INL_A - 0.5))); t = t * t * (3 - 2 * t)
        cx, top, bot, hw = [TR[k](max(a, INL_A)) for k in range(4)]; cxl, hwl = TR[0](INL_A), TR[3](INL_A) - 0.040
        cxd = cxl + (cx - cxl) * 0.35 + 0.012; rings.append(dsup(a, sx, cxd, top - 0.040 - 0.36 * t, bot + 0.040 + 0.36 * t, hwl * (1 - 0.62 * t), 2.8, 9.0 - 5.0 * t, 48))
    return loft_obj('c_duct', rings, G_DUCT, sharp=25)


RAMP = (5.31, 6.60, 0.795, 0.835, -0.360, 0.940)                # a0, a1, x внутр., x наруж., низ, верх


def ramp(sx):
    """Неподвижная пластина перед заборником, отстоит от борта: щель для пограничного слоя (f4_02, 03)."""
    a0, a1, x0, x1, z0, z1 = RAMP; zm = (z0 + z1) / 2; b = B()
    def ring(a, k, t=1.0): return [P3(a, sx * (x1 - (x1 - x0) * t), zm - (zm - z0) * k), P3(a, sx * x1, zm - (zm - z0) * k), P3(a, sx * x1, zm + (z1 - zm) * k), P3(a, sx * (x1 - (x1 - x0) * t), zm + (z1 - zm) * k)]
    b.loft([ring(a0, 0.90, 0.25), ring(a0 + 0.10, 0.97), ring(a0 + 0.30, 1.0), ring(a1, 1.0)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); return b.finish('s_ramp', sharp_deg=30)


def fillet(sx):
    """Скат от хребта к плечу гондолы, слегка вогнутый: сверху фюзеляж читается единым широким телом, а не трубами (f4_01)."""
    rings = []
    for a in stations(7.62, 14.50, 0.22):
        sh = TR[1](a); top = FT[0](a); k = min(1.0, (a - 7.40) / 0.5, (14.75 - a) / 1.6); dz = (top - sh) * 0.66 * k
        zs = sh + dz; xs = side_x(a, zs) - 0.012; xt = max(xs + 0.10, TR[0](a) + TR[3](a) * (0.10 + 0.38 * k)); zt = sh - 0.014; ring = []
        for i in range(11):
            u = i / 10; ring.append(P3(a, sx * (xs + (xt - xs) * u), zt + (zs - zt) * (1 - u) ** 1.55))
        ring += [P3(a, sx * xt, zt - 0.22), P3(a, sx * (xs - 0.22), zt - 0.22), P3(a, sx * (xs - 0.22), zs)]
        rings.append(ring if sx > 0 else ring[::-1])
    return loft_obj('s_fil', rings, G_SKIN, sharp=40)


def bulge(sx):
    """Выпуклость на верхней обшивке крыла над нишей колеса (толстые колёса не помещаются в профиль)."""
    a0, x0 = MAIN_RET[0], MAIN_RET[1]; zb = wy(x0) + TC(x0) * (TE_I(x0) - LE_I(x0)) * thk((a0 - LE_I(x0)) / (TE_I(x0) - LE_I(x0))); n = 28; rings = []
    for th in (0.0, 0.25, 0.5, 0.75, 1.0, 1.2, 1.4):
        r = math.cos(th); z = zb - 0.06 + 0.105 * math.sin(th)
        rings.append([P3(a0 + 0.62 * r * math.cos(2 * math.pi * q / n), sx * (x0 + 0.47 * r * math.sin(2 * math.pi * q / n)), z) for q in range(n)])
    if sx < 0: rings = [r_[::-1] for r_ in rings]
    return loft_obj('s_bulge', rings, G_SKIN, sharp=40)


def well_cut(sx, x, a0, a1):
    """Полуутопленная ниша ракеты под фюзеляжем: жёлоб по дну гондолы."""
    rings = []; n = 20
    for a in stations(a0, a1, 0.25):
        k = min(1.0, (a - a0) / 0.35 + 0.15, (a1 - a) / 0.35 + 0.15); r = 0.088 * k; zc = TR[2](a) - 0.036 + 0.088 * (1 - k)
        rings.append([P3(a, sx * x + r * math.cos(2 * math.pi * q / n), zc + r * math.sin(2 * math.pi * q / n)) for q in range(n)])
    return loft_obj('c_well', rings, G_SKIN, sharp=30)


# ── крыло: низкое, стреловидность 51° по передней кромке; внешние консоли с V 12° и уступом передней кромки (f4_01, 04) ──
XR, XF, XTIP = 0.90, 4.02, 5.85
ZW = -0.090; DIH = math.tan(math.radians(12.0)); DOG = 0.360
def wy(x): return ZW if x <= XF else ZW + (x - XF) * DIH
def LE_I(x): return 11.20 - 1.28 * (XF - x) if x <= XF else 11.20 - DOG + 1.30 * (x - XF)
def TE_I(x): return 13.48 + 0.225 * x
SLAT_I = lambda x: 0.42 - 0.045 * (x - 2.3) if x <= XF else 0.36 - 0.060 * (x - XF)     # хорда отклоняемого носка
HINGE_I = lambda x: TE_I(x) - 1.00                              # линия навески закрылка
HINGE_O = lambda x: TE_I(x) - 0.80                              # элерона
FLAP = (1.420, 2.760); AIL = (2.820, 3.960); SLAT_A = (2.300, 3.960); SLAT_B = (4.080, 5.740)
TRIM_S, TRIM_F = 0.025, 0.020
def _cut(r, t): return (r[0] + t, r[1] - t)
TC = Track([(XR, 0.052), (2.0, 0.048), (XF, 0.040), (XTIP, 0.030)])


def in_(x, r): return r[0] - 1e-6 <= x <= r[1] + 1e-6


def _wsec(sx, x):
    """Кольцо неподвижной части: круглые вырезы под носок спереди и под закрылок или элерон сзади."""
    c = TE_I(x) - LE_I(x); tc = TC(x); le = LE_I(x)
    if in_(x, _cut(SLAT_A, TRIM_S)) or in_(x, _cut(SLAT_B, TRIM_S)): us, head = cove_cut_f(le, c, tc, le + SLAT_I(x))
    else: us = 0.0008; head = cove_wall_f(le, c, tc, us)
    if in_(x, _cut(FLAP, TRIM_F)): ue, tail = cove_cut(le, c, tc, HINGE_I(x))
    elif in_(x, _cut(AIL, TRIM_F)): ue, tail = cove_cut(le, c, tc, HINGE_O(x))
    else: ue = 1.0; tail = cove_wall(le, c, tc, 1.0)
    return foil_ring(le, c, tc, us, ue, 18, lambda a, h: P3(a, sx * x, wy(x) + h), tail=tail, head=head)


def wing_s(sx):
    xs = {XR, 1.10, 1.30, XF - 0.004, XF + 0.004, 4.6, 5.3, XTIP - 0.06, XTIP}
    for r in (_cut(FLAP, TRIM_F), _cut(AIL, TRIM_F), _cut(SLAT_A, TRIM_S), _cut(SLAT_B, TRIM_S)):
        xs |= {r[0] - 0.004, r[0], r[1], r[1] + 0.004}
        for i in range(1, 6): xs.add(round(r[0] + (r[1] - r[0]) * i / 6, 4))
    xs = sorted(v for v in xs if XR <= v <= XTIP)
    return loft_obj('s_wing_' + ('r' if sx > 0 else 'l'), [_wsec(sx, x) for x in xs], sharp=48)


def wing_part(name, spec, sx, HG, note, rng):
    x0, x1 = _cut(spec, TRIM_F); x0 += 0.012; x1 -= 0.012
    pv0 = P3(HG(x0), sx * x0, wy(x0)); pv1 = P3(HG(x1), sx * x1, wy(x1)); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    for i in range(9):
        x = x0 + (x1 - x0) * i / 8; c = TE_I(x) - LE_I(x); ah = HG(x)
        rings.append([v - pivot for v in foil_ring(LE_I(x), c, TC(x), (ah - LE_I(x)) / c, 1.0, 9, lambda a, h: P3(a, sx * x, wy(x) + h), head=cove_nose(LE_I(x), c, TC(x), ah))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=rng, note=note)
    return ob


def slat(name, spec, sx):
    """Отклоняемый носок крыла; ось в центре круглой задней части."""
    xa, xb = _cut(spec, TRIM_S); xa += 0.012; xb -= 0.012
    p0 = P3(LE_I(xa) + SLAT_I(xa), sx * xa, wy(xa)); p1 = P3(LE_I(xb) + SLAT_I(xb), sx * xb, wy(xb)); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized()
    if axis.x > 0: axis = -axis                                 # плюс - носок вниз
    def sec(x):
        c = TE_I(x) - LE_I(x); le = LE_I(x); sl = SLAT_I(x)
        return [v - pivot for v in foil_ring(le, c, TC(x), 0.0008, sl / c, 12, lambda a, h: P3(a, sx * x, wy(x) + h), tail=cove_tail(le, c, TC(x), le + sl), head=cove_wall_f(le, c, TC(x), 0.0008))]
    ob = loft_obj(name, [sec(xa + (xb - xa) * i / 7) for i in range(8)], sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(0.0, 10.0 if spec is SLAT_A else 17.0), note='носок крыла, ось в центре круглой задней части; плюс - носок вниз')
    return ob


# ── киль: стреловидный, с наплывом у основания; руль в нижней половине (f4_03, 06, 07) ──
FIN_T = 0.040
F_LE = Lin([(1.00, 13.45), (1.42, 14.20), (3.04, 17.13)])
F_TE = Lin([(1.00, 18.90), (3.04, 19.02)])
FIN_TOP = 3.04
RUD = (1.36, 2.44)
RUD_C = Track([(1.36, 0.640), (2.44, 0.520)])


def fin():
    ys = [0.92, 1.00, 1.10, 1.22, RUD[0] - 0.004, RUD[0]] + [RUD[0] + (RUD[1] - RUD[0]) * i / 6 for i in range(1, 7)] + [RUD[1] + 0.004, 2.60, 2.80, 2.95, FIN_TOP]
    rings = []
    for y in sorted(set(round(v, 4) for v in ys)):
        c = F_TE(y) - F_LE(y)
        if RUD[0] - 1e-6 <= y <= RUD[1] + 1e-6: ue, tail = cove_cut(F_LE(y), c, FIN_T, F_TE(y) - RUD_C(y), 0.006)
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
    PARTS['rudder'] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-30.0, 30.0), note='ось в центре круглого носа, снизу вверх')
    return ob


# ── цельноповоротный стабилизатор на бортах хвостовой балки, концы вниз на 23° (f4_03, 05, 06) ──
STAB_Z, STAB_A = 0.930, 17.70
STAB_DY = -math.tan(math.radians(25.0))
SXR, SXT = 0.360, 2.650
S_LE = Lin([(SXR, 16.50), (SXT, 18.08)])
S_TE = Lin([(SXR, 18.52), (SXT, 19.20)])
STAB_GAP = 0.022


def stab(sx):
    """Корень повторяет борт балки (зазор 2,2 см), к концу стабилизатор прямой."""
    name = 'stab_' + ('r' if sx > 0 else 'l'); pivot = P3(STAB_A, sx * (side_x(STAB_A, STAB_Z) + STAB_GAP), STAB_Z)
    ss = [0.0, 0.03, 0.08, 0.16, 0.28, 0.42, 0.56, 0.70, 0.82, 0.92, 0.97, 1.0]; rings = []
    for s in ss:
        xn = SXR + (SXT - SXR) * s; c = S_TE(xn) - S_LE(xn); r_ = foil_ring(S_LE(xn), c, 0.045 - 0.012 * s, 0.0, 1.0, 22, lambda a, h: P3(a, sx * xn, STAB_Z + STAB_DY * (xn - SXR) + h))
        out = []
        for p in r_:
            a_ = L / 2 - p.y; xr = side_x(min(a_, TAIL_A - 0.02), p.z) + STAB_GAP; out.append(Vector((sx * (abs(p.x) + (1 - s) ** 2 * (xr - SXR)), p.y, p.z)) - pivot)
        rings.append(out)
    b = B(); r0 = rings[0]; nr = len(r0); inner = [(r0[k] + r0[nr - 1 - k]) / 2 for k in range(nr)]
    b.loft([inner] + rings, G_SKIN, cap1=G_SKIN)
    n = 14; xr0 = side_x(STAB_A, STAB_Z); rg = lambda x_, r: [P3(STAB_A + r * math.cos(2 * math.pi * k / n), sx * x_, STAB_Z + r * math.sin(2 * math.pi * k / n)) - pivot for k in range(n)]
    b.loft([rg(xr0 + 0.004, 0.055), rg(xr0 + STAB_GAP + 0.03, 0.055)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    ob = b.finish(name, sharp_deg=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(-21.0, 9.0), note='цельноповоротный, обе половины вместе; ось поперёк у борта балки; плюс - задняя кромка вниз')
    return ob


# ── сопла: два, обечайка и длинные лепестки (f4_03, 05, 06) ──
def nozzle(sx):
    b = B(); cx = sx * NOZ_X; N = 18; a0 = NAC_A1 + 0.002; a1 = NOZ_A; aM = a0 + 0.160; aP = a0 + 0.17
    def ptp(a, r, ang): return P3(a, cx + r * math.sin(ang), NOZ_Z - 0.035 * (a - a0) - r * math.cos(ang))
    ring = lambda a, r, nn=64: [ptp(a, r, 2 * math.pi * k / nn) for k in range(nn)]
    def box_sect(a, r, ang, hw_ang, th): return [ptp(a, r, ang - hw_ang), ptp(a, r, ang + hw_ang), ptp(a, r + th, ang + hw_ang), ptp(a, r + th, ang - hw_ang)]
    R0 = NOZ_R0
    sec = [ring(a0 - 0.02, R0 - 0.012), ring(a0 + 0.015, R0 + 0.004), ring(aM - 0.03, R0 - 0.002), ring(aM, R0 - 0.014), ring(aM, R0 - 0.050), ring(a0 - 0.02, R0 - 0.060)]
    b.loft(sec + [sec[0]], G_METAL)
    b.loft([ring(aM - 0.01, R0 - 0.052), ring(aP + 0.06, R0 - 0.064)], G_DARK)
    Rp = lambda a: (R0 - 0.022) + (NOZ_R - (R0 - 0.022)) * ((a - aP) / (a1 - aP)) ** 1.25
    hwo = math.pi / N * 1.03; th = 0.012
    for j in range(N):
        am = 2 * math.pi * j / N
        def petal(a):
            r = Rp(a); o = []; i_ = []
            for q in range(5):
                t_ = q / 4; ang = am - hwo + 2 * hwo * t_; lift = 0.006 * (1 - t_)
                o.append(ptp(a, r + lift, ang)); i_.append(ptp(a, r + lift - th, ang))
            return o + i_[::-1]
        b.loft([petal(aP), petal(aP + (a1 - aP) * 0.35), petal(aP + (a1 - aP) * 0.7), petal(a1)], G_METAL, cap0=G_METAL, cap1=G_METAL)
        hwi = math.pi / N * 0.97
        b.loft([box_sect(a1 - 0.002, NOZ_R - th - 0.003, am, hwi, -0.006), box_sect(a1 - 0.25, 0.44, am, hwi, -0.006), box_sect(a0 + 0.03, 0.50, am, hwi, -0.006)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('nozzle_' + ('r' if sx > 0 else 'l'), sharp_deg=30)


def bore_cut(sx):
    a1 = NAC_A1; n = 64; cx = sx * NOZ_X; ring = lambda a, r: [P3(a, cx + r * math.sin(2 * math.pi * k / n), NOZ_Z - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    prof = [(a1 + 0.25, 0.520, G_METAL), (a1 - 0.18, 0.520, G_METAL), (a1 - 0.22, 0.495, G_METAL), (a1 - 0.30, 0.495, G_METAL), (a1 - 0.34, 0.520, G_METAL), (a1 - 0.80, 0.520, G_COCK), (a1 - 1.10, 0.520, G_DARK), (a1 - 1.50, 0.340, G_DARK), (a1 - 1.62, 0.050, G_DARK)]
    b = B(); b.loft([ring(a, r) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK)
    return b.finish('c_bore', sharp_deg=30)


def burner(sx):
    """Нутро сопла: форсажная камера с кольцами стабилизаторов пламени, тёмная."""
    b = B(); cx = sx * NOZ_X; n = 32; a = NAC_A1 - 1.05
    ring = lambda a_, r: [P3(a_, cx + r * math.sin(2 * math.pi * k / n), NOZ_Z - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    for r in (0.40, 0.26, 0.12):
        b.loft([ring(a, r + 0.016), ring(a + 0.05, r + 0.016), ring(a + 0.05, r - 0.016), ring(a, r - 0.016), ring(a, r + 0.016)], G_DARK)
    for k in range(8):
        ang = 2 * math.pi * k / 8; u = Vector((math.sin(ang), 0, -math.cos(ang))); c0 = P3(a + 0.02, cx, NOZ_Z)
        strut(b, c0 + u * 0.05, c0 + u * 0.50, 0.012, G_DARK, 6)
    b.loft([ring(a + 0.10, 0.09), ring(a - 0.25, 0.012)], G_DARK, cap0=G_DARK, cap1=G_DARK)
    return b.finish('burner_' + ('r' if sx > 0 else 'l'), sharp_deg=35)


# ── кабина: две кабины друг за другом; козырёк, передний и задний фонари с петлями сзади, между ними неподвижная дуга (f4_01, 02, 03) ──
CK_A0, CK_A1 = 4.12, 7.40
CK_HW = Track([(4.12, 0.250), (4.50, 0.350), (5.00, 0.385), (7.00, 0.385), (7.40, 0.330)])
FLOOR = 0.220; SEAT_F, SEAT_R = 5.05, 6.42


def cock_cut():
    def sec(a, y0, y1, hw): return [P3(a, -hw, y0), P3(a, hw, y0), P3(a, hw, y1), P3(a, -hw, y1)]
    def fl(a):
        z = FLOOR
        while side_x(a, z) < CK_HW(a) + 0.025 and z < 0.7: z += 0.005
        return z
    return loft_obj('c_cock', [sec(a, fl(a) - 0.004, 2.20, CK_HW(a)) for a in stations(CK_A0, CK_A1, 0.07)], G_COCK, sharp=25)


CAN_A0, CAN_A1 = 3.83, 7.57
CANOPY = [(3.83, 0.745, 0.250), (4.25, 1.040, 0.360), (4.77, 1.285, 0.405), (5.30, 1.450, 0.420), (5.84, 1.545, 0.425), (6.50, 1.600, 0.425), (7.00, 1.605, 0.410), (7.35, 1.585, 0.385), (7.57, 1.550, 0.350)]
CAN_T = tracks(CANOPY)
ARCH_A, BOW_A, BOW_W = 4.770, 5.900, 0.055                       # дуга козырька; середина неподвижной дуги между фонарями и её полуширина
def SILL(a): return fore_y(a, CAN_T[1](a))


def can_ring(a, inset=0.0, n=44):
    top, hw = CAN_T[0](a) - inset, CAN_T[1](a) - inset; y0 = SILL(a) + 0.002
    top = max(top, y0 + 0.004)
    return [P3(a, hw * math.cos(math.pi * k / (n - 1)) ** 0.70 if math.cos(math.pi * k / (n - 1)) >= 0 else -hw * (-math.cos(math.pi * k / (n - 1))) ** 0.70, y0 + (top - y0) * math.sin(math.pi * k / (n - 1)) ** 0.82) for k in range(n)]


def frame_arch(b, a, w, inset=0.008, h=0.020, n=44, drop=0.0):
    ri0 = can_ring(a - w, inset, n); ro0 = can_ring(a - w, -h, n); ro1 = can_ring(a + w, -h, n); ri1 = can_ring(a + w, inset, n)
    if drop: ri0 = [p - Vector((0, 0, drop)) for p in ri0]; ri1 = [p - Vector((0, 0, drop)) for p in ri1]
    strip(b, [ri0, ro0, ro1, ri1, ri0], G_SKIN)


def canopy(name, a0, a1, ang):
    """Фонарь: стекло, дуги спереди и сзади, боковые рельсы; петля у задней кромки сверху."""
    st = stations(a0 + 0.004, a1 - 0.004, 0.10); pivot = P3(a1 + 0.004, 0.0, CAN_T[0](a1) + 0.024)
    b = B(); strip(b, [can_ring(a) for a in st], G_GLASS); gl = b.finish(name + '_glass', sharp_deg=60)
    for v in gl.data.vertices: v.co -= pivot
    gl.location = pivot
    b = B(); frame_arch(b, a0 + 0.030, 0.030, h=0.022); frame_arch(b, a1 - 0.030, 0.030, h=0.022)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        b.loft([[rail(a, 0.004, 0.012), rail(a, 0.018, 0.010), rail(a, 0.018, 0.034), rail(a, -0.012, 0.050), rail(a, -0.012, 0.022)] for a in stations(a0, a1, 0.07)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    fr = b.finish(name, sharp_deg=45)
    for v in fr.data.vertices: v.co -= pivot
    fr.location = pivot; gl.parent = fr; gl.location = (0, 0, 0)
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, ang), note='петля у задней кромки; плюс - передняя кромка вверх; ' + name + '_glass - дочерний объект')
    return [fr, gl]


def windscreen():
    a1 = ARCH_A - 0.030; st = stations(CAN_A0 + 0.01, a1, 0.08)
    b = B(); strip(b, [can_ring(a) for a in st], G_GLASS); gl = b.finish('screen_glass', sharp_deg=60)
    b2 = B(); frame_arch(b2, ARCH_A - 0.029, 0.027, h=0.022)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        b2.loft([[rail(a, 0.004, 0.010), rail(a, 0.016, 0.010), rail(a, 0.016, 0.026), rail(a, -0.010, 0.040), rail(a, -0.010, 0.020)] for a in stations(CAN_A0 + 0.03, a1, 0.08)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    frame_arch(b2, BOW_A, BOW_W, inset=0.030, h=0.022)        # неподвижная дуга между фонарями
    frame_arch(b2, CAN_A1 + 0.012, 0.030, inset=0.060, h=0.012, drop=0.03)   # порог за задним фонарём
    fr = b2.finish('screen_frame', sharp_deg=45)
    return [gl, fr]


# ── интерцепторы сверху перед элеронами и тормозные щитки снизу за нишами основных стоек (f4_01, 05) ──
SPOIL = (2.86, 3.92)
BRK = (12.05, 12.72, 1.45, 2.30)


def spoiler(sx):
    n_ = 'spoil_' + ('r' if sx > 0 else 'l'); x0, x1 = SPOIL
    aF = lambda x: HINGE_O(x) - 0.85; aR = lambda x: HINGE_O(x) - 0.10
    ob = patch(n_, lambda u, v: (aF(x0 + (x1 - x0) * u) + (aR(x0 + (x1 - x0) * u) - aF(x0 + (x1 - x0) * u)) * v, sx * (x0 + (x1 - x0) * u)), 8, 6, dirn=-1, lift=0.004, th=0.014, z0=3.0)
    p0 = down(sx * x0, Yb(aF(x0)), z0=3.0, dirn=-1); p1 = down(sx * x1, Yb(aF(x1)), z0=3.0, dirn=-1); ax = (p1 - p0).normalized(); ax = ax if ax.x > 0 else -ax
    pivot = (p0 + p1) / 2 + Vector((0, 0, 0.004)); _rel(ob, pivot)
    PARTS[n_] = dict(pivot=pivot.copy(), axis=ax, range=(-45.0, 0.0), note='интерцептор: петля по передней кромке; минус - задняя кромка вверх')
    return ob


def brake(sx):
    n_ = 'brake_' + ('r' if sx > 0 else 'l'); a0, a1, x0, x1 = BRK
    ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + (x1 - x0) * u)), 8, 8, dirn=1, lift=0.005, th=0.018, z0=-3.0)
    pi_ = down(sx * x0, Yb(a0), z0=-3.0, dirn=1); po_ = down(sx * x1, Yb(a0), z0=-3.0, dirn=1)
    ax = (po_ - pi_).normalized(); ax = ax if ax.x > 0 else -ax
    pivot = (pi_ + po_) / 2 + Vector((0, 0, -0.005)); _rel(ob, pivot)
    PARTS[n_] = dict(pivot=pivot.copy(), axis=ax, range=(0.0, 55.0), note='тормозной щиток снизу крыла: петля по передней кромке; плюс - задняя кромка вниз')
    return ob


# ── пилоны: два под крылом на сторону; четыре ниши под фюзеляжем; точка контейнера по оси (f4_04, 05) ──
def _wlow(x, a):
    c = TE_I(x) - LE_I(x); return wy(x) - TC(x) * c * thk((a - LE_I(x)) / c)
PYLON_DEF = (('o', 3.370, 10.88, 12.70, _wlow(3.370, 11.79) - 0.270), ('i', 2.060, 8.89, 10.85, _wlow(2.060, 9.87) - 0.320))
FUSE_DEF = (('f', 0.740, 7.30, 10.40), ('a', 0.620, 11.10, 14.60))
POD = (10.40, 0.000)
PYLON_PTS = {}


def pylon(sx, tag, x, a0, a1, y0):
    b = B(); name = f'pylon_{tag}_' + ('r' if sx > 0 else 'l'); yw = wy(x) - 0.01; hw = 0.058
    def sec(a, f=1.0, dz=0.0): return [P3(a, sx * x - hw * f, y0 + dz), P3(a, sx * x + hw * f, y0 + dz), P3(a, sx * x + hw * f * 0.85, yw), P3(a, sx * x - hw * f * 0.85, yw)]
    st = [a0, a0 + 0.14, a0 + 0.45, a1 - 0.50, a1 - 0.14, a1]; fs = [0.10, 0.70, 1.0, 1.0, 0.65, 0.10]; dz = [0.16, 0.05, 0.0, 0.0, 0.04, 0.12]
    b.loft([sec(a, f, d_) for a, f, d_ in zip(st, fs, dz)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    PYLON_PTS[name] = P3((a0 + a1) / 2, sx * x, y0)
    return b.finish(name, sharp_deg=40)


def flush_points():
    """Точки в нишах под фюзеляжем и контейнера: на обшивке, выступающих плит нет."""
    for sx in (1, -1):
        for tag, x, a0, a1 in FUSE_DEF: am = (a0 + a1) / 2; PYLON_PTS[f'pylon_{tag}_' + ('r' if sx > 0 else 'l')] = P3(am, sx * x, down(sx * x, Yb(am), z0=-3.0, dirn=1).z - 0.012)
    am, x = POD; PYLON_PTS['pod'] = P3(am, x, down(x, Yb(am), z0=-3.0, dirn=1).z - 0.012)


# ── посадочный гак под хвостовой балкой, прижат (f4_04, 05, 06) ──
HOOK = (15.80, 0.445, 18.35, 0.775)                             # ось: a, z; носок: a, z


def hook():
    a0, z0, a1, z1 = HOOK; pivot = P3(a0, 0.0, z0); tip = P3(a1, 0.0, z1); d = (tip - pivot).normalized(); b = B(); n = 12; X_ = Vector((1, 0, 0)); v_ = d.cross(X_).normalized()
    rg = lambda p, rx, rz: [p - pivot + X_ * rx * math.cos(2 * math.pi * q / n) + v_ * rz * math.sin(2 * math.pi * q / n) for q in range(n)]
    Ln = (tip - pivot).length
    b.loft([rg(pivot - d * 0.05, 0.050, 0.045), rg(pivot + d * 0.15, 0.040, 0.036), rg(pivot + d * (Ln - 0.30), 0.032, 0.030), rg(pivot + d * (Ln - 0.12), 0.050, 0.034), rg(pivot + d * Ln, 0.056, 0.040), rg(pivot + d * (Ln + 0.07) - v_ * 0.035, 0.040, 0.022)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    b.loft([[P3(a0 + 0.06 * math.cos(2 * math.pi * q / n), sgn * 0.085, z0 + 0.06 * math.sin(2 * math.pi * q / n)) - pivot for q in range(n)] for sgn in (-1, 1)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    ob = b.finish('hook', sharp_deg=40); ob.location = pivot
    PARTS['hook'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, 62.0), note='гак: ось спереди под балкой; 0 - прижат, плюс - носок вниз')
    return ob


# ── шасси: размеры (f4_02, 03) ──
GROUND_Y = -1.810
NG = dict(a=4.29, hinge=(4.25, -0.120), rw=0.230, ww=0.120, track=0.115)
MG_A, MG_X, MG_RW, MG_WW = 11.50, 2.780, 0.385, 0.220
MAIN_T = (11.50, 2.960, -0.235)                                 # шарнир стойки: a, x, z
NOSE_BAY = (4.10, 5.98, 0.240, 0.170)                           # a0, a1, полуширина, потолок
MAIN_BAY = (11.05, 11.95, 1.360, 2.220, -0.035)                  # ниша колеса: a0, a1, x0, x1, потолок (в выпуклости)
LEG_BAY = (11.36, 11.64, 2.220, 3.130, -0.125)                  # жёлоб ноги
MAIN_RET = (11.50, 1.770, -0.140)                               # куда уходит колесо при уборке: к оси самолёта, плашмя
BRK_TOP = -0.130


def main_axis(sx):
    """Ось и угол уборки основной стойки: колесо уходит из выпущенного положения в MAIN_RET."""
    T = P3(MAIN_T[0], sx * MAIN_T[1], MAIN_T[2]); wc = P3(MG_A, sx * MG_X, GROUND_Y + MG_RW); tgt = P3(MAIN_RET[0], sx * MAIN_RET[1], MAIN_RET[2]) - T; dv = wc - T
    return dv.cross(tgt).normalized(), round(math.degrees(dv.angle(tgt)), 1)


def doors():
    out = []; a0, a1, hw = NOSE_BAY[:3]
    for sx in (1, -1):
        n_ = 'door_n_' + ('r' if sx > 0 else 'l')
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (0.003 + (hw - 0.003) * u)), 6, 10, dirn=1, lift=0.004, th=0.016, z0=-3.0)
        pivot = P3((a0 + a1) / 2, sx * hw, down(sx * hw, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z - 0.014); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(-80.0, 0.0) if sx > 0 else (0.0, 80.0), note='0 - закрыта, открытие наружу-вниз на 80°')
        out.append(ob)
    for sx in (1, -1):
        a0, a1, x0, x1 = MAIN_BAY[:4]
        n_ = 'door_m_' + ('r' if sx > 0 else 'l')
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + (x1 - 0.004 - x0) * u)), 8, 10, dirn=1, lift=0.004, th=0.018, z0=-3.0)
        pivot = P3((a0 + a1) / 2, sx * x0, down(sx * x0, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z - 0.014); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(0.0, 88.0) if sx > 0 else (-88.0, 0.0), note='створка ниши колеса: 0 - закрыта, ось у внутренней кромки, открывается вниз')
        out.append(ob)
        a0, a1, x0, x1 = LEG_BAY[:4]
        n_ = 'door_o_' + ('r' if sx > 0 else 'l')
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (x0 + 0.004 + (x1 - x0 - 0.004) * u)), 8, 4, dirn=1, lift=0.004, th=0.018, z0=-3.0)
        pivot = P3((a0 + a1) / 2, sx * x1, down(sx * x1, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z - 0.012); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(-96.0, 0.0) if sx > 0 else (0.0, 96.0), note='створка ноги: 0 - закрыта, ось у внешней кромки, открывается наружу-вниз')
        out.append(ob)
    return out


def build_skin():
    S = [fore(), gun_fairing(), trunk(1), trunk(-1), fillet(1), fillet(-1), ramp(1), ramp(-1), wing_s(1), wing_s(-1), bulge(1), bulge(-1)]
    host = S[0]
    for o in S[1:]:
        _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        c = duct_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
        c = bore_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
        for tag, x, a0, a1 in FUSE_DEF:
            c = well_cut(sx, x, a0, a1); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = cock_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'F4_skin'; host.data.name = 'F4_skin'
    bvh_ready(host)
    return host


def plane(stage=9, carve=True):
    """Этапы: 1 - обшивка с крыльями; 2 - рули, оперение, сопла; 3 - кабины, фонари, интерцепторы, щитки, пилоны, гак, мелочь; 4 - шасси и створки."""
    import f4_detail as d
    PARTS.clear(); PYLON_PTS.clear()
    skin = build_skin(); out = [skin]
    ref_me = skin.data.copy(); d.resharp(types.SimpleNamespace(data=ref_me))   # гладкая обшивка до резки
    if stage >= 2:
        out += [fin(), rudder(), stab(1), stab(-1), nozzle(1), nozzle(-1), burner(1), burner(-1)]
        for s, n in ((1, 'r'), (-1, 'l')):
            out += [slat('slat_i_' + n, SLAT_A, s), slat('slat_o_' + n, SLAT_B, s)]
            out += [wing_part('flap_' + n, FLAP, s, HINGE_I, 'закрылок, ось в центре круглого носа; плюс - вниз', (0.0, 55.0))]
            out += [wing_part('ail_' + n, AIL, s, HINGE_O, 'элерон, ось в центре круглого носа; плюс - вниз (вверх всего на 1°)', (-1.0, 30.0))]
    if stage >= 3:
        out += [d.cockpit_detail()]
        out += canopy('canopy_f', ARCH_A + 0.002, BOW_A - BOW_W - 0.014, 55.0) + canopy('canopy_r', BOW_A + BOW_W + 0.006, CAN_A1 - 0.030, 55.0) + windscreen()
        out += [spoiler(1), spoiler(-1), brake(1), brake(-1), hook()]
        for sx in (1, -1):
            for tag, x, a0, a1, y0 in PYLON_DEF: out.append(pylon(sx, tag, x, a0, a1, y0))
        flush_points()
        out += [d.details()] + d.hardpoints() + [d.plates()]
    if stage >= 4:
        out += doors()
        import f4_gear as gr; out += gr.gear_nose() + gr.gear_main(1) + gr.gear_main(-1)
    if carve:
        print('канавок и выемок:', d.carve(skin))
    if stage >= 3: d.bays(skin)
    d.resharp(skin); print('нормали обшивки:', d.smooth_normals(skin, ref_me)); bpy.data.meshes.remove(ref_me)
    return out
