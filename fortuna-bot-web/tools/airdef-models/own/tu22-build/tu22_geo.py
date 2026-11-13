# tu22_geo.py - геометрия Ту-22 для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z (в glTF: нос -Z). Начало - середина длины L = 41,6 м.
# a - расстояние от носка фюзеляжа назад (до конца ствола кормовой пушки - 41,6); z = 0 - ось средней части фюзеляжа; земля на GROUND_Z.
# Размеры: чертёж tu22_05 (бок, план, спереди) - по размаху 23,17 м (0,0515 м/пикс), по длине растянут до 41,6 м (0,05403 м/пикс; чертёж короче на 5 %);
# детали - фото tu22_01…10. Сетки и текстуры чужих моделей не используются.
import math
import bmesh
import bpy
from mathutils import Vector, Matrix
from modelkit import B
import tu22_base as tb
from tu22_base import *
from tu22_base import _circ, _in, _apply_bool, _drop, _tag, _rel, _resample

L = 41.6; tb.set_len(L)
PARTS = tb.PARTS
KA, KS = 41.6 / 770.0, 0.0515                                       # м/пикс чертежа 05: вдоль и поперёк
GROUND_Z = -3.890                                                   # земля (чертёж 05 бок: 75,5 пикс под осью)


# ── фюзеляж: (a, верх, низ, полуширина, показатель верха, показатель низа) - бок и план чертежа 05 ──
FUS = [(0.000, -0.574, -0.612, 0.016, 2.0, 2.0), (0.120, -0.556, -0.632, 0.036, 2.0, 2.0), (0.540, -0.500, -0.700, 0.098, 2.0, 2.0), (1.620, -0.300, -0.862, 0.278, 2.0, 2.0),
       (2.970, -0.128, -1.005, 0.432, 2.0, 2.0), (4.320, 0.050, -1.160, 0.590, 2.0, 2.0), (5.670, 0.225, -1.240, 0.712, 2.0, 2.0), (7.020, 0.420, -1.330, 0.810, 2.05, 2.0),
       (8.370, 0.700, -1.378, 0.900, 2.1, 2.05), (9.730, 0.960, -1.400, 0.985, 2.15, 2.05), (11.35, 1.180, -1.412, 1.065, 2.2, 2.1), (12.97, 1.320, -1.416, 1.135, 2.25, 2.1),
       (15.13, 1.395, -1.416, 1.212, 2.3, 2.1), (17.83, 1.430, -1.416, 1.285, 2.3, 2.1), (20.53, 1.445, -1.412, 1.330, 2.3, 2.1), (23.23, 1.385, -1.395, 1.318, 2.3, 2.1),
       (25.93, 1.230, -1.300, 1.290, 2.3, 2.15), (29.17, 1.020, -1.090, 1.240, 2.3, 2.2), (31.33, 0.920, -0.985, 1.180, 2.3, 2.2), (34.04, 0.815, -0.880, 1.150, 2.3, 2.2),
       (36.74, 0.715, -0.790, 1.165, 2.3, 2.2), (38.60, 0.640, -0.690, 1.080, 2.3, 2.2), (39.50, 0.600, -0.610, 0.860, 2.2, 2.1), (39.80, 0.560, -0.610, 0.690, 2.1, 2.1), (40.00, 0.500, -0.585, 0.540, 2.05, 2.1)]
FT = tracks(FUS)
FUS_END = 40.06                                                   # конец фюзеляжа - плоскость оси турели


def fus_top(a, x=0.0):
    top, bot, hw, nt = FT[0](a), FT[1](a), FT[2](a), FT[3](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nt); return cy + ht * q ** (1 / nt)


def fus_bot(a, x=0.0):
    top, bot, hw, nb = FT[0](a), FT[1](a), FT[2](a), FT[4](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nb); return cy - ht * q ** (1 / nb)


def fus_hw(a, z):
    top, bot, hw, nt, nb = [t(a) for t in FT]; cy = (top + bot) / 2; ht = (top - bot) / 2; s = (z - cy) / ht; e = nt if s > 0 else nb
    return hw * max(0.0, 1 - min(1.0, abs(s)) ** e) ** (1 / e)


def socket_ring(a, n, roll=0.0):
    """Сечение гнезда турели (Mark 2026-11-13: «конец плавно интегрирован в пушку»): скруглённый прямоугольник вокруг корпуса установки
    с кромкой 3 см и зазором; сверху шейка к шару прицела. Начало - низ по оси, дальше +X, как у sup."""
    w = TUR_R + TUR_GAP + 0.030 - roll; zb = TUR_Z[0] - TUR_GAP - 0.030 + roll; zt = SPH[1] - 0.20
    P = [Vector(p) for p in ((0.0, zb), (w, zb), (w, zt), (-w, zt), (-w, zb))]
    Q = [Vector((p.x, p.z)) for p in rpoly(a, [(q.x, q.y) for q in P], 4 * n, 0.11)]
    return [P3(a, q.x, q.y) for q in _resample(Q, n)]


def hull_ring(a, n=96):
    """Сечение: суперэллипс; за крылом (фото 07, 09) верх уже низа - корма грушей, сверху на неё садятся гондолы; последние 0,9 м сходится к гнезду турели."""
    top, bot, hw, nt, nb = [t(a) for t in FT]; r = sup(a, 0.0, top, bot, hw, nt, nb, n)
    k = 0.30 * smooth_(26.0, 33.0, a) + 0.12 * smooth_(33.0, 37.0, a); cy = (top + bot) / 2
    if k > 0:
        r = [Vector((p.x * (1 - k * smooth_(0.0, 1.0, (p.z - cy) / max(top - cy, 1e-3))), p.y, p.z)) for p in r]
    s = smooth_(39.15, FUS_END, a)
    if s > 0:
        e = max(0.0, a - (FUS_END - 0.03)) / 0.03; roll = 0.026 * (1 - math.sqrt(max(0.0, 1 - e * e)))     # кромка гнезда закатана внутрь к корпусу установки
        r = [p.lerp(q, s) for p, q in zip(r, socket_ring(a, n, roll))]
    return r


def hull():
    st = [0.0, 0.03, 0.08, 0.15, 0.25, 0.40, 0.60, 0.85] + stations(1.1, 12.0, 0.18) + stations(12.2, 36.0, 0.35)[1:] + stations(36.2, 39.0, 0.12)[1:] + stations(39.06, FUS_END - 0.04, 0.06)[1:] + [FUS_END - 0.03, FUS_END - 0.02, FUS_END - 0.012, FUS_END - 0.005, FUS_END]
    st = sorted(set(round(v, 4) for v in st))
    return loft_obj('s_hull', [hull_ring(a) for a in st], sharp=50)


# ── фонарь лётчика: горб над фюзеляжем, переходит в гаргрот (чертёж 05 бок: козырёк с 6,55, верх 1,26 на 8,1; 1,42 на 10,5; план - полуширина 0,5) ──
CANOPY = [(6.38, 0.330, 0.30), (6.80, 0.560, 0.44), (7.30, 0.860, 0.50), (7.90, 1.110, 0.52), (8.50, 1.235, 0.52), (9.20, 1.300, 0.52), (9.90, 1.360, 0.52), (10.6, 1.410, 0.52),
          (11.6, 1.445, 0.52), (13.0, 1.455, 0.50), (15.5, 1.455, 0.42), (18.0, 1.452, 0.20)]
CAN_T = tracks(CANOPY)
CAN_A0, CAN_A1 = 6.38, 18.0


def can_ring(a, inset=0.0, n=48):
    """Сечение горба: от боков фюзеляжа (на 0,15 ниже порога) дугой вверх; inset - внутрь."""
    top, hw = CAN_T[0](a) - inset, CAN_T[1](a) - inset; y0 = fus_top(a, hw) - 0.15
    pts = []
    for k in range(n):
        t = math.pi * k / (n - 1); c = math.cos(t)
        pts.append(P3(a, math.copysign(abs(c) ** 0.7, c) * hw, y0 + (top - y0) * max(0.0, math.sin(t)) ** 0.6))
    return pts + [P3(a, -hw * 0.8, y0 - 0.2), P3(a, hw * 0.8, y0 - 0.2)]


def canopy_hump():
    st = [CAN_A0 + 0.002] + stations(6.45, 9.0, 0.08) + stations(9.1, CAN_A1 - 0.4, 0.25) + [CAN_A1 - 0.2, CAN_A1 - 0.05]
    return loft_obj('s_can', [can_ring(a) for a in sorted(set(round(v, 4) for v in st))], sharp=50)


# ── крыло: стреловидность по передней кромке 55° (план 05), у корня наплыв к фюзеляжу; задняя кромка у корня прямая, дальше 35°; поперечное V -3° ──
WZ0 = -0.450
ANH = math.tan(math.radians(3.0))
def wz(x): return WZ0 - ANH * x
XTIP = 11.300
LE_K = (1.98, 18.63, 1.4257)                                       # излом наплыва (x, a), наклон кромки da/dx
def LE_(x):
    x0, a0, s = LE_K
    if x >= x0: return a0 + (x - x0) * s
    if x <= 1.05: return 15.50 - (1.05 - x) * 4.0                   # внутри фюзеляжа
    t = (x - 1.05) / (x0 - 1.05); h00, h10, h01, h11 = 2 * t ** 3 - 3 * t ** 2 + 1, t ** 3 - 2 * t ** 2 + t, -2 * t ** 3 + 3 * t ** 2, t ** 3 - t ** 2
    return h00 * 15.50 + h10 * (x0 - 1.05) * 6.0 + h01 * a0 + h11 * (x0 - 1.05) * s
def TE_(x):
    if x >= 3.79: return 30.08 + (x - 3.79) * 0.7035
    return 29.50 + (x - 1.20) * 0.224
def CH_(x): return TE_(x) - LE_(x)
_TC = Lin([(0.0, 0.080), (2.0, 0.072), (5.0, 0.065), (XTIP, 0.055)])
def TC(x): return _TC(x)
FLAP_I = (1.650, 3.450); FLAP_O = (5.050, 7.250); AIL = (7.350, 10.850)
def _h0(x): return LE_(x) + 0.77 * CH_(x)
def HINGE(x):
    """Линия навески - прямая на каждом руле (концы на 0,77 хорды): у корня передняя кромка - кривая наплыва, а ось вращения прямая."""
    for sp in (FLAP_I, FLAP_O, AIL):
        if sp[0] - 0.01 <= x <= sp[1] + 0.01:
            t_ = (x - sp[0]) / (sp[1] - sp[0]); return _h0(sp[0]) + (_h0(sp[1]) - _h0(sp[0])) * t_
    return _h0(x)


def cove_cut_k(a_le, chord, tc, a_h, clr=0.008, ka=1.0):
    """Выемка под носок руля при скошенной оси: в сечении по потоку ось наклонена, носок при повороте заметает эллипс, вытянутый вдоль потока в ka = 1/cos(скоса) раз."""
    K = tb.COVE_K; uh = (a_h - a_le) / chord; t = tc * chord * thk(uh); R = (t + clr) / math.cos(math.pi / (2 * (K + 1))); lo, hi = 0.0, R * ka
    for _ in range(40):
        d_ = (lo + hi) / 2
        if math.hypot(d_ / ka, tc * chord * thk((a_h - d_ - a_le) / chord)) < R: lo = d_
        else: hi = d_
    a_e = a_h - hi; te = tc * chord * thk((a_e - a_le) / chord); xe = (a_e - a_h) / ka; rc = math.hypot(xe, te); al = math.atan2(te, xe)
    return (a_e - a_le) / chord, [(a_h + ka * rc * math.cos(al + (2 * math.pi - 2 * al) * (i + 1) / (K + 1)), rc * math.sin(al + (2 * math.pi - 2 * al) * (i + 1) / (K + 1))) for i in range(K)]


def cove_nose_k(a_le, chord, tc, a_h, ka=1.0):
    """Носок руля при скошенной оси: по потоку вытянут в ka раз - поперёк оси это круг, при повороте он не выходит из выемки."""
    K = tb.COVE_K; t = tc * chord * thk((a_h - a_le) / chord)
    return [(a_h - ka * t * math.sin(math.pi * (i + 1) / (K + 1)), -t * math.cos(math.pi * (i + 1) / (K + 1))) for i in range(K)]


def _ka(sp):
    s = (_h0(sp[1]) - _h0(sp[0])) / (sp[1] - sp[0]); return math.sqrt(1 + s * s)


def wpl(sx, x):
    return lambda a, h: P3(a, sx * x, wz(x) + h)


def _wsec(sx, x):
    c = CH_(x); tc = TC(x); le = LE_(x); u0 = 0.0008; head = cove_wall_f(le, c, tc, u0)
    sp = next((s for s in (FLAP_I, FLAP_O, AIL) if _in(x, s)), None)
    if sp: ue, tail = cove_cut_k(le, c, tc, HINGE(x), 0.010, _ka(sp))
    else: ue = 1.0; tail = cove_wall(le, c, tc, 1.0)
    return foil_ring(le, c, tc, u0, ue, 26, wpl(sx, x), tail=tail, head=head)


def wing_xs():
    k = [0.30, 0.70, 1.05, 1.25, 1.45, 1.65, 1.85, 1.98, 2.3, 2.8, 3.3, 3.79, 4.25, 4.6, 5.5, 6.5, 7.5, 8.5, 9.5, 10.3, 10.9, 11.1, XTIP]
    for sp, n in ((FLAP_I, 6), (FLAP_O, 6), (AIL, 8)):
        k += [sp[0] - 0.003, sp[0], sp[1], sp[1] + 0.003] + [sp[0] + (sp[1] - sp[0]) * i / n for i in range(1, n)]
    return sorted(set(round(v, 4) for v in k if v <= XTIP))


def wing_s(sx):
    xs = wing_xs(); rings = [_wsec(sx, x) for x in xs]
    return loft_obj('s_wing_' + ('r' if sx > 0 else 'l'), rings, sharp=48)


def wing_part(name, spec, sx, HG, note, rng, e0=0.012, e1=0.012):
    """e0, e1 - зазоры на концах: у скошенной оси задняя кромка при отклонении уходит к внешнему концу, там зазор больше."""
    x0, x1 = spec; x0 += e0; x1 -= e1
    pv0 = P3(HG(x0), sx * x0, wz(x0)); pv1 = P3(HG(x1), sx * x1, wz(x1)); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    xs = [x0, x0 + 0.010, x0 + 0.025, x0 + 0.05] + [v for v in wing_xs() if x0 + 0.06 < v < x1 - 0.06] + [x1 - 0.05, x1 - 0.025, x1 - 0.010, x1]
    for x in xs:
        c = CH_(x); ah = HG(x); le = LE_(x); tc = TC(x); hp = P3(ah, sx * x, wz(x))
        d_ = min(x - x0, x1 - x); k = 0.25 + 0.75 * min(1.0, d_ / 0.05) ** 0.6     # носок у торцов скруглён внутрь: при скошенной оси он уходит вбок
        ring = foil_ring(le, c, tc, (ah - le) / c, 1.0, 12, wpl(sx, x), head=cove_nose_k(le, c, tc, ah, _ka(spec)))
        zc = wz(x); ring = [Vector((hp.x + (v.x - hp.x) * (k if v.y > hp.y else 1.0), hp.y + (v.y - hp.y) * (k if v.y > hp.y else 1.0), zc + (v.z - zc) * k)) for v in ring]   # торец - скруглённая кромка: тоньше и носок короче
        rings.append([v - pivot for v in ring])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=rng, note=note)
    return ob


def wing_top(x, a):
    c = CH_(x); u = (a - LE_(x)) / c; return wz(x) + TC(x) * c * thk(max(0.0, min(1.0, u)))


def wing_bot(x, a):
    c = CH_(x); u = (a - LE_(x)) / c; return wz(x) - TC(x) * c * thk(max(0.0, min(1.0, u)))


def tip_pod(sx):
    """Законцовка: узкий обтекатель на конце крыла (план 05: 31,2…35,6)."""
    x = sx * (XTIP + 0.02); st = stations(31.15, 35.70, 0.15); rings = []
    for a in st:
        t = (a - 31.15) / (35.70 - 31.15); r = 0.105 * max(0.04, math.sin(math.pi * min(1.0, t * 1.25 if t < 0.4 else 0.5 + (t - 0.4) / 1.2))) ** 0.6
        rings.append(_circ(a, x, wz(XTIP), r, 20))
    return loft_obj('s_tip_' + ('r' if sx > 0 else 'l'), rings, sharp=50)


# ── гондолы шасси на крыле (план 05: 23…32 по ширине 4,4; спереди 05 - 4,1; фото 04, 09: сзади длинный обтекатель за кромкой) ──
POD_X = 4.250
POD = [(21.30, 0.000, 0.000), (21.45, 0.090, 0.100), (21.80, 0.210, 0.230), (22.40, 0.340, 0.380), (23.20, 0.450, 0.505), (24.20, 0.520, 0.585), (25.20, 0.545, 0.615),
       (27.70, 0.545, 0.615), (29.00, 0.520, 0.585), (30.20, 0.430, 0.480), (31.40, 0.280, 0.310), (32.40, 0.090, 0.100), (32.65, 0.000, 0.000)]
POD_T = tracks(POD)
def pod_zc(a): return wz(POD_X) - 0.330 - 0.06 * smooth_(21.2, 24.2, a)


def gear_pod(sx):
    st = [21.30, 21.33, 21.40, 21.55, 21.75, 22.0] + stations(22.3, 32.1, 0.22) + [32.3, 32.5, 32.65]
    rings = []
    for a in sorted(set(round(v, 4) for v in st)):
        hw, hh = max(POD_T[0](a), 0.012), max(POD_T[1](a), 0.012)
        rings.append(sup(a, sx * POD_X, pod_zc(a) + hh, pod_zc(a) - hh * 1.04, hw, 2.0, 2.15, 48))
    return loft_obj('s_pod_' + ('r' if sx > 0 else 'l'), rings, sharp=50)


# ── мотогондолы над кормой (план 05: 29,5…40,2; фото 07: оси на ±0,95, диаметр 1,6; фото 10: передняя губа выдвигается на земле) ──
NAC_X, NAC_Z = 0.950, 1.550
NAC_A0, LIP_A1, NAC_A1 = 29.50, 30.25, 40.20
NAC = [(29.50, 0.700), (29.56, 0.722), (29.70, 0.738), (30.25, 0.748), (30.80, 0.775), (31.60, 0.795), (32.60, 0.800), (37.00, 0.800), (38.40, 0.786), (39.40, 0.765), (40.20, 0.742)]
NR = tracks(NAC)[0]
INL_R = 0.610                                                      # радиус канала у губы
NOZ_R = 0.640                                                      # радиус среза створок сопла
LIP_SLIDE = 0.350                                                  # ход губы вперёд на земле


def nac_ring(a, sx, n=64, dr=0.0): return _circ(a, sx * NAC_X, NAC_Z, NR(a) + dr, n)


def nacelle(sx):
    st = [LIP_A1 + 0.004] + stations(30.30, 39.9, 0.20) + [40.05, NAC_A1]
    return loft_obj('s_nac_' + ('r' if sx > 0 else 'l'), [nac_ring(a, sx) for a in st], sharp=50)


def saddle_ring(a, n=64):
    """Седло под гондолами: от спины фюзеляжа до осей гондол, по ширине - до 0,55 радиуса гондолы снаружи (фото 07, 10: гондолы лежат на широком обтекателе)."""
    w = smooth_(30.2, 31.6, a) * (1 - smooth_(39.2, 39.96, a))
    zt = fus_top(a) - 0.25 + (NAC_Z + 0.05 - fus_top(a) + 0.25) * w
    zb = fus_top(a) - 0.45
    hw = (fus_hw(a, fus_top(a) - 0.35) * 0.9) * (1 - w) + (NAC_X + 0.55 * NR(a)) * w
    return sup(a, 0.0, zt, zb, hw, 3.2, 2.0, n)


def saddle():
    st = stations(30.0, 39.96, 0.15)
    return loft_obj('s_saddle', [saddle_ring(a) for a in st], sharp=50)


def nac_cut(sx):
    """Канал заборника (за губой) и труба сопла."""
    cx = sx * NAC_X; out = []
    prof = [(LIP_A1 - 0.05, INL_R + 0.03, G_SKIN), (LIP_A1 - 0.004, INL_R + 0.03, G_DUCT), (31.0, INL_R - 0.01, G_DUCT), (32.2, INL_R - 0.04, G_DARK), (32.6, 0.30, G_DARK)]
    b = B(); b.loft([_circ(a, cx, NAC_Z, r) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_SKIN, cap1=G_DARK); out.append(b.finish('c_nin', sharp_deg=30))
    prof = [(NAC_A1 + 0.10, NOZ_R + 0.03, G_METAL), (NAC_A1 - 0.004, NOZ_R + 0.03, G_METAL), (39.6, NOZ_R - 0.02, G_DUCT), (38.8, NOZ_R - 0.05, G_DARK), (38.4, 0.40, G_DARK)]
    b = B(); b.loft([_circ(a, cx, NAC_Z, r) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK); out.append(b.finish('c_nout', sharp_deg=30))
    return out


def intake_lip(sx):
    """Губа заборника: кольцо 29,50…30,25, выдвигается вперёд на земле (фото 10: щель между губой и гондолой - дополнительный вход воздуха)."""
    cx = sx * NAC_X; n = 64; b = B()
    outer = [(29.50, 0.690), (29.52, 0.712), (29.56, 0.725), (29.66, 0.737), (29.85, 0.742), (30.25, 0.744)]
    inner = [(30.25, INL_R + 0.020), (29.90, INL_R + 0.005), (29.62, INL_R), (29.53, INL_R + 0.015), (29.50, INL_R + 0.040)]
    prof = outer + inner + [outer[0]]
    rings = [_circ(a, cx, NAC_Z, r, n) for a, r in prof]
    b.loft(rings, G_SKIN); ob = b.finish('intake_' + ('r' if sx > 0 else 'l'), sharp_deg=50)
    pivot = P3(29.875, cx, NAC_Z); _rel(ob, pivot)
    PARTS[ob.name] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(0.0, LIP_SLIDE), kind='slide', note='губа заборника: на земле выдвигается вперёд по оси гондолы на 0,35 м (открывает кольцевую щель подпитки); в полёте 0')
    return ob


def lip_sleeve(sx):
    """Внутренняя обечайка под губой: видна в щели, когда губа выдвинута (тёмные створки подпитки)."""
    cx = sx * NAC_X; b = B()
    b.loft([_circ(a, cx, NAC_Z, r, 48) for a, r in ((29.95, 0.590), (30.70, 0.590), (30.70, 0.604), (29.95, 0.604))] + [_circ(29.95, cx, NAC_Z, 0.590, 48)], G_DUCT)
    return b.finish('lip_sleeve_' + ('r' if sx > 0 else 'l'), sharp_deg=40)


def engine_face(sx):
    """В канале: кок и лопатки компрессора (тёмные)."""
    cx = sx * NAC_X; b = B(); n = 32
    b.loft([_circ(a, cx, NAC_Z, r, n) for a, r in ((31.55, 0.010), (31.62, 0.10), (31.75, 0.17), (31.95, 0.22), (32.25, 0.23))], G_METAL, cap0=G_METAL, cap1=G_DARK)
    for k in range(12):
        th = 2 * math.pi * k / 12; er = Vector((math.sin(th), 0, -math.cos(th))); et = Vector((math.cos(th), 0, math.sin(th))); c0 = Vector((cx, 0, NAC_Z))
        b.loft([[c0 + er * r + et * t + Vector((0, Yb(a_), 0)) for a_, t in ((32.10, -0.05), (32.18, 0.0), (32.26, 0.05), (32.18, 0.012))] for r in (0.22, INL_R - 0.03)], G_DUCT, cap0=G_DUCT, cap1=G_DUCT)
    return b.finish('eng_face_' + ('r' if sx > 0 else 'l'), sharp_deg=35)


def nozzle(sx):
    """Сопло форсажа: венец створок за гондолой (фото 07, 10) и конус турбины внутри."""
    cx = sx * NAC_X; b = B(); n = 64; c = Vector((cx, 0, NAC_Z)); m = 28
    for k in range(m):
        th0 = 2 * math.pi * (k + 0.06) / m; th1 = 2 * math.pi * (k + 0.94) / m
        def q(th, r, a): return P3(a, cx + r * math.sin(th), NAC_Z - r * math.cos(th))
        rows = []
        for a, ro, ri in ((40.17, 0.744, 0.700), (40.30, 0.716, 0.672), (40.42, 0.684, NOZ_R)):
            rows.append([q(th0, ri, a), q(th0, ro, a), q(th1, ro, a), q(th1, ri, a)])
        b.loft(rows, G_METAL, cap0=G_METAL, cap1=G_METAL)
    b.loft([_circ(a, cx, NAC_Z, r, 32) for a, r in ((39.10, 0.36), (39.50, 0.33), (39.85, 0.20), (40.00, 0.05))], G_DARK, cap0=G_DARK, cap1=G_DARK)
    b.loft([_circ(a, cx, NAC_Z, r, n) for a, r in ((40.16, 0.700), (40.16, NOZ_R + 0.03), (39.80, NOZ_R + 0.02))], G_DUCT)
    return b.finish('nozzle_' + ('r' if sx > 0 else 'l'), sharp_deg=40)


# ── киль (бок 05: передняя кромка 32,5 у верха гондол -> 38,5 на высоте 6,29; задняя 39,4 -> 41,0); руль - задние 38 % хорды по всей высоте (фото 10) ──
FIN_Z0, FIN_Z1 = 0.70, 6.290
def _fle(z):
    if z >= 2.35: return 32.54 + (38.48 - 32.54) * (z - 2.35) / (6.29 - 2.35)
    return 32.54 - (2.35 - z) * 1.20                               # между гондолами - форкиль вперёд по седлу
def _fte0(z):
    if z >= 2.35: return 39.42 + (40.99 - 39.42) * (z - 2.35) / (6.29 - 2.35)
    return 39.42 + (2.35 - z) * 0.30
def _fte(z):
    if z >= RUD[0] - 0.002: return _fte0(z)
    hz = _fle(RUD[0]) + 0.62 * (_fte0(RUD[0]) - _fle(RUD[0])) - 0.03     # под рулём неподвижная часть кончается у оси руля, ниже 1,9 - снова полная хорда
    return hz + (_fte0(z) - hz) * smooth_(2.20, 1.90, z)
FIN_TC = 0.060
RUD = (2.520, FIN_Z1)
def RUD_H(z): c = _fte0(z) - _fle(z); return _fle(z) + 0.62 * c
RUD_KA = math.sqrt(1 + ((RUD_H(RUD[1]) - RUD_H(RUD[0])) / (RUD[1] - RUD[0])) ** 2)


def outward(ob):
    """Нормали наружу по знаку объёма: у тонкого киля recalc_face_normals ошибается и выворачивает оболочку (надписи ложились зеркально)."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    if bm.calc_volume(signed=True) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:]); bm.to_mesh(ob.data)
    bm.free(); return ob


def fin():
    zs = [FIN_Z0, 1.0, 1.4, 1.7, 1.85, 1.95, 2.05, 2.15, 2.25, 2.35, 2.45, RUD[0] - 0.004, RUD[0]] + [RUD[0] + (6.10 - RUD[0]) * i / 8 for i in range(1, 9)] + [6.15, 6.20, 6.235, 6.26, 6.278, FIN_Z1 - 0.002]
    rings = []
    for z in zs:
        le = _fle(z); te = _fte(z); c = te - le; tc = min(FIN_TC * (1 + 0.6 * smooth_(2.4, 1.0, z)), 0.40 / c)
        if _in(z, RUD): ue, tail = cove_cut_k(le, c, tc, RUD_H(z), 0.010, RUD_KA)
        else: ue, tail = 1.0, cove_wall(le, c, tc, 1.0)
        if z < RUD[0]: tc = min(tc, 0.40 / (_fte0(z) - le))
        top = max(0.0, z - 6.20) / 0.09
        rings.append(foil_ring(le, c, tc * (1 - 0.6 * min(1.0, top) ** 2), 0.0008, ue, 22, lambda a, h: P3(a, h, z), tail=tail, head=cove_wall_f(le, c, tc, 0.0008)))
    return outward(loft_obj('s_fin', rings, sharp=48))


def rudder():
    """Руль направления от верха гондол до верхушки киля; торцы скруглены (ось скошена назад на 39°)."""
    z0, z1 = RUD[0] + 0.012, FIN_Z1 - 0.002; pv0 = P3(RUD_H(z0), 0.0, z0); pv1 = P3(RUD_H(6.0), 0.0, 6.0); axis = (pv1 - pv0).normalized(); pivot = pv0.lerp(pv1, 0.5); rings = []
    zs = [z0, z0 + 0.010, z0 + 0.025, z0 + 0.05] + [z0 + 0.05 + (6.10 - z0 - 0.05) * i / 9 for i in range(1, 10)] + [6.15, 6.20, 6.235, 6.26, 6.278, z1]
    for z in zs:
        le = _fle(z); c = _fte(z) - le; tc = min(FIN_TC, 0.40 / c); top = max(0.0, z - 6.20) / 0.09; tc = tc * (1 - 0.6 * min(1.0, top) ** 2)
        hp = P3(RUD_H(z), 0.0, z); k = 0.25 + 0.75 * min(1.0, (z - z0) / 0.05) ** 0.6
        ring = foil_ring(le, c, tc, (RUD_H(z) - le) / c, 1.0, 12, lambda a, h: P3(a, h, z), head=cove_nose_k(le, c, tc, RUD_H(z), RUD_KA))
        ring = [Vector((hp.x + (v.x - hp.x) * k, hp.y + (v.y - hp.y) * (k if v.y > hp.y else 1.0), v.z)) for v in ring]
        rings.append([v - pivot for v in ring])
    ob = loft_obj('rudder', rings, sharp=48); ob.location = pivot
    PARTS['rudder'] = dict(pivot=pivot.copy(), axis=axis, range=(-20.0, 20.0), note='руль направления; ось по линии навески (наклонена назад); плюс - задняя кромка вправо')
    return ob


def fin_rod():
    """Штанга на верхушке киля вперёд (фото 10) и диэлектрический наконечник."""
    b = B(); z = FIN_Z1 - 0.06; a0 = _fle(z)
    b.loft([_circ(a, 0.0, z, r, 14) for a, r in ((a0 + 0.9, 0.050), (a0 - 0.10, 0.045), (a0 - 0.80, 0.030), (a0 - 1.55, 0.018), (a0 - 1.70, 0.004))], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('s_finrod', sharp_deg=40)


# ── цельноповоротный стабилизатор (план 05: кромка 53°, острый скошенный конец; бок 05 - на 0,49 ниже оси; фото 07 - чуть вниз) ──
ST_Z0 = -0.490; ST_DIH = math.tan(math.radians(-2.0)); ST_X0 = 1.170; ST_XT = 4.970
def st_z(x): return ST_Z0 + ST_DIH * (x - ST_X0)
def st_le(x): return 35.00 + (x - 1.0) * 1.3224
def st_te(x):
    if x <= 3.79: return 39.20 + (x - 1.0) * 0.8423
    return 41.55 - (x - 3.79) * (41.55 - st_le(ST_XT)) / (ST_XT - 3.79)
ST_TC = 0.050
ST_PIV = 37.600                                                    # ось поворота: поперечная, на 0,58 корневой хорды


def stab(sx):
    name = 'stab_' + ('r' if sx > 0 else 'l')
    xs = [ST_X0, ST_X0 + 0.02, 1.4, 1.8, 2.2, 2.6, 3.0, 3.4, 3.79, 4.1, 4.4, 4.65, 4.82, 4.92, ST_XT - 0.012]
    rings = []
    for x in xs:
        le = st_le(x); te = max(st_te(x), le + 0.05); c = te - le
        rings.append(foil_ring(le, c, ST_TC, 0.0008, 1.0, 16, lambda a, h, x=x: P3(a, sx * x, st_z(x) + h), tail=cove_wall(le, c, ST_TC, 1.0), head=cove_wall_f(le, c, ST_TC, 0.0008)))
    ob = loft_obj(name, rings, sharp=48)
    pivot = P3(ST_PIV, sx * ST_X0, st_z(ST_X0)); _rel(ob, pivot)
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(-22.0, 12.0), note='цельноповоротный стабилизатор: поворот вокруг поперечной оси через корень; плюс - передняя кромка вверх')
    return ob


def stab_fair(sx):
    """Обтекатель корня стабилизатора на борту кормы (фото 07, 09): продолговатое тело, наружная грань почти плоская на x = 1,15 у корня."""
    x1 = ST_X0 - 0.020; rings = []
    for a in stations(33.4, 40.15, 0.12):
        f = smooth_(33.4, 35.2, a) * (1 - smooth_(39.3, 40.15, a)); hw = 0.04 + 0.30 * f; hz = 0.05 + 0.24 * f
        xc = sx * (x1 - hw - (1 - f) * 0.35)
        rings.append(sup(a, xc, ST_Z0 + hz, ST_Z0 - hz, hw, 3.2, 3.2, 40))
    return loft_obj('s_stfair_' + ('r' if sx > 0 else 'l'), rings, sharp=40)


# ── корма: шар прицела над пушкой, под ним турель с пушкой (фото 07; бок 05: шар 40,1, 0,59) ──
SPH = (40.10, 0.560); SPH_R = 0.430
TUR = (40.06, -0.120); TUR_R = 0.230; TUR_Z = (-0.500, 0.120); TUR_GAP = 0.012
TUR_AZ = (-40.0, 40.0); TUR_EL = (-20.0, 30.0)


def tail_sphere():
    a0, z0 = SPH; b = B(); m = 30
    rings = [_circ(a0 - SPH_R * math.cos(math.pi * i / m), 0.0, z0, SPH_R * math.sin(math.pi * i / m), 48) for i in range(1, m)]
    b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN); return b.finish('s_sphere', sharp_deg=60)


def tail_cone():
    """Хвост за концом фюзеляжа: сходится к гнезду турели и шару (фото 07)."""
    rings = []
    for a in stations(39.70, 40.05, 0.05):
        t = (a - 39.70) / 0.35; top, bot, hw = FT[0](39.95), FT[1](39.95), FT[2](39.95)
        rings.append(sup(a, 0.0, top - 0.10 * t, bot + 0.02 * t, hw * (1 - 0.15 * t), 2.0, 2.0, 64))
    return loft_obj('s_tcone', rings, sharp=50)


def turret_well():
    """Гнездо турели: вертикальный цилиндр с зазором 1,5 см."""
    b = B(); n = 48; r = TUR_R + TUR_GAP
    rings = [[P3(TUR[0] + r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n), z) for k in range(n)] for z in (TUR_Z[0] - 0.015, TUR_Z[1] + 0.015)]
    b.loft(rings, G_COCK, cap0=G_COCK, cap1=G_COCK); return b.finish('c_turwell', sharp_deg=30)


def turret():
    """Корпус кормовой установки: вертикальный цилиндр со скруглёнными торцами, сзади щель под ствол (фото 07). Поворот по азимуту вокруг своей оси."""
    b = B(); n = 48; r = TUR_R
    zs = [TUR_Z[0], TUR_Z[0] + 0.01, TUR_Z[0] + 0.035, TUR_Z[0] + 0.07, TUR_Z[1] - 0.07, TUR_Z[1] - 0.035, TUR_Z[1] - 0.01, TUR_Z[1]]
    rr = [r * 0.90, r * 0.965, r * 0.992, r, r, r * 0.992, r * 0.965, r * 0.90]
    rings = [[P3(TUR[0] + q * math.cos(2 * math.pi * k / n), q * math.sin(2 * math.pi * k / n), z) for k in range(n)] for z, q in zip(zs, rr)]
    b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN); ob = b.finish('turret', sharp_deg=50)
    sl = B(); w = 0.045
    sl.loft([[P3(a, -w, z0), P3(a, w, z0), P3(a, w, z1), P3(a, -w, z1)] for a, z0, z1 in ((TUR[0] + 0.05, -0.38, 0.05), (TUR[0] + 0.40, -0.38, 0.05))], G_DARK, cap0=G_DARK, cap1=G_DARK)
    c = sl.finish('c_tslot', sharp_deg=20); _apply_bool(ob, c, 'DIFFERENCE'); _drop(c)
    pivot = P3(TUR[0], 0.0, TUR[1]); _rel(ob, pivot)
    PARTS['turret'] = dict(pivot=pivot.copy(), axis=Vector((0, 0, 1)), range=TUR_AZ, note='кормовая установка: поворот по азимуту вокруг вертикальной оси корпуса; плюс - ствол вправо')
    return ob


def turret_gun():
    """Пушка АМ-23 (одна, фото 07): казённик в корпусе, ствол назад. Ребёнок turret, ось угла места - поперечная через центр корпуса."""
    b = B(); n = 16; a0, z0 = TUR
    prof = [(a0 - 0.10, 0.050), (a0 + 0.18, 0.050), (a0 + 0.18, 0.038), (a0 + 0.30, 0.034), (a0 + 0.30, 0.026), (41.45, 0.024), (41.45, 0.032), (41.60, 0.032), (41.60, 0.012)]
    b.loft([_circ(a, 0.0, z0, r, n) for a, r in prof], G_METAL, cap0=G_METAL, cap1=G_DARK)
    box(b, P3(a0 + 0.04, 0.0, z0), 0.040, 0.16, 0.070, G_METAL)
    ob = b.finish('turret_gun', sharp_deg=35); pivot = P3(a0, 0.0, z0); _rel(ob, pivot)
    PARTS['turret_gun'] = dict(pivot=pivot.copy(), axis=Vector((-1, 0, 0)), range=TUR_EL, parent='turret', note='ствол АМ-23 по углу места, ось поперечная через центр корпуса; плюс - ствол вверх; ребёнок turret')
    return ob


# ── штанга дозаправки над носом (фото 02, 01) ──
PRB = dict(tip=1.55, f0=2.95, f1=6.30)                             # штанга: наконечник, начало и конец обтекателя


def probe_z(): return fus_top(3.6) + 0.13


def probe():
    """Штанга дозаправки (фото 01, 02, Mark 2026-11-13: «в какой-то момент просто выходит из корпуса»): обтекатель вырастает из верха носа
    (низ утоплен в обшивку, к кабине сходит на нет), спереди из него выходит короткая труба с головкой и лопаткой снизу."""
    b = B(); n = 20; TZ = probe_z(); tr = 0.050
    prof = [(PRB['tip'], 0.012), (PRB['tip'] + 0.02, 0.040), (PRB['tip'] + 0.06, 0.066), (PRB['tip'] + 0.16, 0.068), (PRB['tip'] + 0.22, 0.044), (PRB['tip'] + 0.26, tr * 0.9),
            (PRB['tip'] + 0.30, tr), (PRB['f0'] + 0.60, tr)]
    b.loft([_circ(a, 0.0, TZ, r, n) for a, r in prof], G_METAL, cap0=G_METAL, cap1=G_METAL)
    bl = PRB['tip'] + 0.12                                             # лопатка антенны под головкой (фото 01)
    b.loft([[P3(bl + da, -0.006, TZ - 0.04), P3(bl + da, 0.006, TZ - 0.04), P3(bl + da + 0.03, 0.006, TZ - 0.22), P3(bl + da + 0.03, -0.006, TZ - 0.22)] for da in (-0.03, 0.05)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    rings = []
    for a in [PRB['f0'], PRB['f0'] + 0.008, PRB['f0'] + 0.025, PRB['f0'] + 0.06, PRB['f0'] + 0.11, PRB['f0'] + 0.18, PRB['f0'] + 0.27, PRB['f0'] + 0.38, PRB['f0'] + 0.52] + stations(PRB['f0'] + 0.68, PRB['f1'], 0.15):
        t_ = (a - PRB['f0']) / (PRB['f1'] - PRB['f0']); s = smooth_(PRB['f0'], PRB['f0'] + 0.55, a); e = math.sqrt(max(0.0, 1 - (1 - min(1.0, (a - PRB['f0']) / 0.06)) ** 2))
        hw = (0.016 + (0.046 + 0.055 * s) * e) * (1 - smooth_(0.55, 1.0, t_) * 0.75)                  # носок обтекателя: обжимает трубу, назад раздаётся вширь и вниз
        top = TZ + (0.012 + 0.048 * e + 0.012 * s)
        top = top * (1 - smooth_(0.35, 1.0, t_)) + (fus_top(a) + 0.004) * smooth_(0.35, 1.0, t_)
        bot = (TZ - 0.012 - 0.048 * e) * (1 - s) + (fus_top(a, hw) - 0.08) * s
        top = max(top, fus_top(a) + 0.004)
        rings.append(sup(a, 0.0, top, bot, hw, 2.2, 2.0, 36))
    b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('s_probe', sharp_deg=35)


# ── бомбоотсек под центропланом: две створки вбок; ФАБ-1000 ×4 - два ряда по два ──
BAY = dict(a0=16.70, a1=24.30, hw=0.800, roof=-0.060)
BAY_ROWS = (18.55, 22.35)
BAY_X = 0.400
BAY_TOP = -0.200
VIS_R = {'fab1000': 0.230}
BAY_PTS = {'fab1000': BAY_ROWS}
BAY_OPEN = 95.0


def bay_cut():
    a0, a1, hw = BAY['a0'], BAY['a1'], BAY['hw']; r = BAY['roof']
    def sec(a): return [P3(a, -hw, -2.4), P3(a, hw, -2.4), P3(a, hw, r - 0.12), P3(a, hw - 0.12, r), P3(a, -hw + 0.12, r), P3(a, -hw, r - 0.12)]
    return loft_obj('c_bay', [sec(a0), sec(a1)], G_COCK, sharp=25)


def bay_doors():
    out = []; a0, a1, hw = BAY['a0'] + 0.008, BAY['a1'] - 0.008, BAY['hw'] - 0.004
    for sx, s_ in ((1, 'r'), (-1, 'l')):
        n_ = 'bay_' + s_
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (0.004 + (hw - 0.004) * u)), 8, 30, dirn=1, lift=0.0, th=0.012, z0=-3.0)
        zh = down(sx * hw, Yb((a0 + a1) / 2), z0=-3.0, dirn=1).z; pivot = P3((a0 + a1) / 2, sx * hw, zh); _rel(ob, pivot)
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, -sx, 0)), range=(0.0, BAY_OPEN), note='створка бомбоотсека: петля по наружной кромке проёма; плюс - внутренняя кромка вниз-наружу; 0 - закрыта', side='R' if sx > 0 else 'L')
        out.append(ob)
    return out


# ── люки экипажа: штурман и оператор - снизу (катапульта вниз, кресла опускаются), лётчик - сверху, крышка фонаря назад-вверх ──
HATCHES = [('hatch_nav', 4.70, 5.95, 0.300, 'низ'), ('hatch_op', 13.10, 14.30, 0.320, 'низ')]
HATCH_OPEN = 80.0
PH = dict(a0=8.15, a1=9.35, hw=0.300)                              # крышка лётчика в крыше фонаря
PH_OPEN = 55.0


def hatch_cut(nm, a0, a1, hw):
    w = hw + 0.006; rg = lambda a: [P3(a, -w, -2.4), P3(a, w, -2.4), P3(a, w, -0.75), P3(a, -w, -0.75)]
    return loft_obj('c_' + nm, [rg(a0 - 0.006), rg(a1 + 0.006)], G_COCK, sharp=25)


def low_hatch(nm, a0, a1, hw):
    ob = patch(nm, lambda u, v: (a0 + (a1 - a0) * v, -hw + 2 * hw * u), 8, 10, dirn=1, lift=0.0, th=0.014, z0=-3.0)
    zh = down(0.0, Yb(a0), z0=-3.0, dirn=1).z; pivot = P3(a0, 0.0, zh); _rel(ob, pivot)
    PARTS[nm] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, HATCH_OPEN), note='нижний люк экипажа: петля у передней кромки, поперёк; плюс - задняя кромка вниз')
    return ob


def ph_cut():
    H = PH; w = H['hw'] + 0.006; rg = lambda a: [P3(a, -w, 0.70), P3(a, w, 0.70), P3(a, w, 2.0), P3(a, -w, 2.0)]
    return loft_obj('c_ph', [rg(H['a0'] - 0.006), rg(H['a1'] + 0.006)], G_COCK, sharp=25)


def pilot_hatch():
    H = PH
    ob = patch('hatch_pilot', lambda u, v: (H['a0'] + (H['a1'] - H['a0']) * v, -H['hw'] + 2 * H['hw'] * u), 10, 12, dirn=-1, lift=0.0, th=0.014, z0=3.0)
    zh = down(0.0, Yb(H['a1']), z0=3.0, dirn=-1).z; pivot = P3(H['a1'], 0.0, zh); _rel(ob, pivot)
    PARTS['hatch_pilot'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, PH_OPEN), note='крышка лётчика в крыше фонаря: петля у задней кромки; плюс - передняя кромка вверх')
    return ob


# ── контейнер тормозных парашютов под кормой, крышка откидывается вниз (бок 05: 35,5…36,6) ──
CHUTE = dict(a0=34.90, a1=36.70, hw=0.360)
CHUTE_OPEN = 85.0


def chute_box():
    C = CHUTE; rings = []
    for a in stations(C['a0'] - 0.5, C['a1'] + 0.35, 0.10):
        f = smooth_(C['a0'] - 0.5, C['a0'], a) * (1 - smooth_(C['a1'], C['a1'] + 0.35, a)); zb = fus_bot(a) - 0.16 * f
        rings.append(sup(a, 0.0, fus_bot(a) + 0.35, zb, C['hw'] + 0.06 * f, 2.0, 3.0, 40))
    return loft_obj('s_chute', rings, sharp=45)


def chute_lid():
    C = CHUTE
    ob = patch('chute_lid', lambda u, v: (C['a0'] + 0.05 + (C['a1'] - C['a0'] - 0.10) * v, -C['hw'] + 2 * C['hw'] * u), 8, 10, dirn=1, lift=0.0, th=0.012, z0=-3.0)
    zh = down(0.0, Yb(C['a0'] + 0.05), z0=-3.0, dirn=1).z; pivot = P3(C['a0'] + 0.05, 0.0, zh); _rel(ob, pivot)
    PARTS['chute_lid'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, CHUTE_OPEN), note='крышка контейнера тормозных парашютов: петля у передней кромки; плюс - задняя кромка вниз')
    return ob


def chute_cut():
    C = CHUTE; w = C['hw'] + 0.006; rg = lambda a: [P3(a, -w, -2.4), P3(a, w, -2.4), P3(a, w, fus_bot((C['a0'] + C['a1']) / 2) + 0.10), P3(a, -w, fus_bot((C['a0'] + C['a1']) / 2) + 0.10)]
    return loft_obj('c_chute', [rg(C['a0'] + 0.044), rg(C['a1'] - 0.044)], G_COCK, sharp=25)


# ── окна: козырёк и боковые стёкла лётчика, окна штурмана по бокам носа, окна оператора сверху (фото 02) ──
def _can_pt(a, th, dr):
    """Точка на горбе фонаря: th - угол от верха (рад, плюс вправо), dr - смещение по нормали наружу."""
    top, hw = CAN_T[0](a), CAN_T[1](a); y0 = fus_top(a, hw) - 0.15
    t = math.pi / 2 - th; c = math.cos(t); x = math.copysign(abs(c) ** 0.7, c) * hw; z = y0 + (top - y0) * max(0.0, math.sin(t)) ** 0.6
    cz = y0 + 0.35 * (top - y0); n = Vector((x / max(hw, 1e-3), 0, (z - cz) / max(top - cz, 1e-3))).normalized()
    return P3(a, x, z) + n * dr


def _win(nm, a0, a1, th0, th1, f_pt, na=8, nt=8, out=0.06, inn=0.25):
    rings = []
    for i in range(na + 1):
        a = a0 + (a1 - a0) * i / na
        ths = [th0 + (th1 - th0) * j / nt for j in range(nt + 1)]
        rings.append([f_pt(a, t, -inn) for t in ths] + [f_pt(a, t, out) for t in reversed(ths)])
    return loft_obj(nm, rings, G_COCK, sharp=30)


CAN_WIN = [(6.52, 7.88, -0.95, 0.95), (7.98, 9.40, 0.62, 1.30), (7.98, 9.40, -1.30, -0.62)]


def glass_patch(nm, a0, a1, th0, th1, f_pt, na=10, nt=10, dr=-0.006):
    b = B(); strip(b, [[f_pt(a0 + (a1 - a0) * i / na, th0 + (th1 - th0) * j / nt, dr) for j in range(nt + 1)] for i in range(na + 1)], G_GLASS)
    return b.finish(nm, sharp_deg=60)


def cock_cut():
    """Кабина лётчика: полость под горбом фонаря."""
    def sec(a): return [p for p in can_ring(a, 0.05, 32)[:32]] + [P3(a, CAN_T[1](a) - 0.05, fus_top(a) - 0.75), P3(a, -(CAN_T[1](a) - 0.05), fus_top(a) - 0.75)]
    return loft_obj('c_cock', [sec(a) for a in stations(6.60, 9.70, 0.10)], G_COCK, sharp=25)


def _fus_pt(a, th, dr):
    """Точка на боку фюзеляжа: th - угол от верха (рад), dr - по нормали наружу."""
    top, bot, hw, nt, nb = [t(a) for t in FT]; cy = (top + bot) / 2; ht = (top - bot) / 2; t = math.pi / 2 - th; c, s = math.cos(t), math.sin(t); e = nt if s > 0 else nb
    x = hw * math.copysign(abs(c) ** (2 / e), c); z = cy + ht * math.copysign(abs(s) ** (2 / e), s)
    n = Vector((x / hw ** 2, 0, (z - cy) / ht ** 2)).normalized(); return P3(a, x, z) + n * dr


NAV_WIN = [(5.05, 5.70, 1.10, 1.45), (5.05, 5.70, -1.45, -1.10)]
OP_WIN = [(11.25, 11.80, 0.30, 0.62), (11.25, 11.80, -0.62, -0.30)]


def nav_cut():
    def rg(a):
        top, bot, hw = FT[0](a), FT[1](a), FT[2](a); w = 0.10
        return sup(a, 0.0, top - w, bot + 0.35, hw - w, 2.0, 2.0, 40)
    return loft_obj('c_nav', [rg(a) for a in stations(4.40, 6.60, 0.10)], G_COCK, sharp=25)


# ── сборка обшивки ──
def build_skin():
    S = [_tag(hull(), 1), _tag(canopy_hump(), 2), _tag(saddle(), 3), _tag(fin(), 4), _tag(tail_sphere(), 5), _tag(probe(), 6), _tag(chute_box(), 7)]
    for sx in (1, -1): S += [_tag(nacelle(sx), 8), _tag(gear_pod(sx), 11), _tag(tip_pod(sx), 12)]
    W = [_tag(wing_s(1), 9), _tag(wing_s(-1), 9)]
    host = S[0]
    for o in S[1:] + W:
        _apply_bool(host, o, 'UNION'); _drop(o)
    print('скруглено у стыка крыла и фюзеляжа:', fillet_seam(host, pairs=((1, 9),), band=0.22, iters=12))
    print('скруглено у седла:', fillet_seam(host, pairs=((1, 3),), band=0.12, iters=6, wfun=lambda a: 1 - smooth_(37.5, 39.0, a)))
    print('скруглено у гондол шасси:', fillet_seam(host, pairs=((9, 11),), band=0.14, iters=10))
    print('скруглено у горба фонаря:', fillet_seam(host, pairs=((1, 2),), band=0.12, iters=10))
    print('скруглено у обтекателя штанги:', fillet_seam(host, pairs=((1, 6),), band=0.06, iters=6, wfun=lambda a: smooth_(3.05, 3.4, a)))
    cuts = [turret_well(), cock_cut(), nav_cut()]
    for sx in (1, -1): cuts += nac_cut(sx)
    cuts += [_win('c_win', *w, _can_pt) for w in CAN_WIN] + [_win('c_win', *w, _fus_pt, out=0.05, inn=0.20) for w in NAV_WIN + OP_WIN]
    for c in cuts:
        _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'TU_skin'; host.data.name = 'TU_skin'
    bvh_ready(host)
    return host


def windows():
    out = [glass_patch('can_glass', w[0] - 0.02, w[1] + 0.02, w[2] - 0.03, w[3] + 0.03, _can_pt) for w in CAN_WIN[:1]]
    out += [glass_patch('can_glass_s', w[0] - 0.02, w[1] + 0.02, w[2] - 0.03, w[3] + 0.03, _can_pt) for w in CAN_WIN[1:]]
    out += [glass_patch('win_glass', w[0] - 0.02, w[1] + 0.02, w[2] - 0.03, w[3] + 0.03, _fus_pt) for w in NAV_WIN + OP_WIN]
    return out


def plane(stage=9, carve=True):
    """Этапы: 1 - обшивка; 2 - рули, стабилизатор, турель, двигатели; 3 - стёкла, створки, люки, детали; 4 - шасси."""
    PARTS.clear()
    skin = build_skin(); out = [skin]
    if stage >= 2:
        tur = turret(); tg = turret_gun(); tg.parent = tur; tg.location = tg.location - tur.location
        out += [tur, tg, rudder(), stab(1), stab(-1), fin_rod()]
        for s, n in ((1, 'r'), (-1, 'l')):
            out += [intake_lip(s), lip_sleeve(s), engine_face(s), nozzle(s),
                    wing_part('flap_i_' + n, FLAP_I, s, HINGE, 'закрылок у фюзеляжа; ось в центре круглого носа; плюс - вниз', (0.0, 28.0), 0.015, 0.016),
                    wing_part('flap_o_' + n, FLAP_O, s, HINGE, 'закрылок за гондолой шасси; ось в центре круглого носа; плюс - вниз', (0.0, 28.0), 0.015, 0.016),
                    wing_part('ail_' + n, AIL, s, HINGE, 'элерон; ось в центре круглого носа; плюс - задняя кромка вниз', (-20.0, 20.0))]
    if stage >= 3:
        out += windows() + bay_doors() + [low_hatch(n, a0, a1, hw) for n, a0, a1, hw, _ in HATCHES] + [pilot_hatch(), chute_lid()]
        try:
            import tu22_detail as dt; out += dt.all_details()
        except ImportError: pass
    if stage >= 4:
        try:
            import tu22_gear as gr; out += gr.all_gear()
        except ImportError: pass
    cuts = [bay_cut(), ph_cut(), chute_cut()] + [hatch_cut(n, a0, a1, hw) for n, a0, a1, hw, _ in HATCHES]
    for c in cuts: _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
    return out
