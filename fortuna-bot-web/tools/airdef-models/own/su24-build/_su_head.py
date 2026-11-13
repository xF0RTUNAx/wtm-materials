# su_geo.py - геометрия Су-24М для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z (в glTF: нос -Z).
# a - от острия ПВД назад (0 ... 22,67); z - от базовой линии чертежа 03 (около оси сопел) вверх, земля на z = -AX.
# Масштаб и формы - чертёж 03 (линейка 0-5 м = 48 пикс/м): профиль - нижний вид сбоку (нос вправо), план - вид сверху (69°) и снизу (16°), сечения - виды спереди и сзади.
# Длина планера по 03 - 20,98 м, ПВД на чертеже короткий: штанга 1,69 м до 22,67 м общей длины. Чужие сетки и текстуры не используются.
# Консоли поворачиваются на вертикальных шарнирах (PIV): строятся при 16°, в файле - 69° (задание главного чата).
import math
import bpy
from mathutils import Vector, Matrix
from modelkit import B
from _su_base import *
from _su_base import _sm, _apply_bool, _drop, _rel
import _su_base as base

PARTS = base.PARTS; STATIONS = base.STATIONS
A_NOSE = 1.69                                                       # острие обтекателя РЛС (дальше вперёд - штанга ПВД)


# ── фюзеляж: круглый нос, кабина рядом сидящих лётчиков, средняя часть между заборниками, широкая плоская хвостовая часть с двумя двигателями ──
# (a, верх z, низ z, полуширина, показатель верха, показатель низа) - 03: профиль снизу, ширины сверху
FUS = [(1.70, 0.060, 0.030, 0.012, 2.0, 2.0), (1.80, 0.100, 0.000, 0.055, 2.0, 2.0), (2.00, 0.150, -0.050, 0.110, 2.0, 2.0), (2.50, 0.270, -0.170, 0.220, 2.0, 2.0),
       (3.00, 0.400, -0.290, 0.330, 2.0, 2.0), (3.50, 0.520, -0.380, 0.420, 2.05, 2.1), (4.00, 0.650, -0.450, 0.510, 2.1, 2.2), (4.60, 0.800, -0.520, 0.600, 2.2, 2.4),
       (5.20, 0.960, -0.580, 0.690, 2.3, 2.6), (5.80, 1.040, -0.620, 0.760, 2.5, 2.9), (6.50, 1.080, -0.620, 0.790, 2.6, 3.0), (7.50, 1.100, -0.620, 0.790, 2.6, 3.0),
       (8.50, 1.150, -0.600, 0.760, 2.6, 3.0), (10.00, 1.250, -0.580, 0.760, 2.6, 3.0), (12.00, 1.300, -0.550, 0.800, 2.7, 3.0), (13.50, 1.250, -0.520, 1.050, 3.2, 3.2),
       (14.50, 1.150, -0.500, 1.300, 4.0, 3.5), (16.00, 1.080, -0.480, 1.320, 4.0, 3.5), (18.00, 1.020, -0.460, 1.320, 4.0, 3.5), (20.00, 0.980, -0.450, 1.300, 4.0, 3.5),
       (21.00, 0.850, -0.450, 1.220, 3.6, 3.3), (21.60, 0.700, -0.450, 1.100, 3.2, 3.0)]
FT = tracks(FUS); A_TAIL = 21.60


def fus_top(a, x=0.0):
    top, bot, hw, nt = FT[0](a), FT[1](a), FT[2](a), FT[3](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = min(0.999, abs(x) / max(hw, 1e-6)); return cy + ht * (1 - q ** nt) ** (1 / nt)


def fus_bot(a, x=0.0):
    top, bot, hw, nb = FT[0](a), FT[1](a), FT[2](a), FT[4](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = min(0.999, abs(x) / max(hw, 1e-6)); return cy - ht * (1 - q ** nb) ** (1 / nb)
def fus_hw(a): return FT[2](a)


def fuselage():
    n = 72; rs = []
    for a in [1.705, 1.72, 1.76, 1.82, 1.90] + stations(2.0, A_TAIL, 0.16):
        top, bot, hw, nt, nb = FT[0](a), FT[1](a), FT[2](a), FT[3](a), FT[4](a); rs.append(sup(a, 0.0, top, bot, hw, nt, nb, n))
    return loft_obj('s_fus', rs, sharp=50)


def pitot():
    """ПВД: длинная штанга с флюгерами на конце (06, 07)."""
    b = B(); n = 12; pr = [(0.0, 0.004), (0.03, 0.012), (0.70, 0.016), (0.74, 0.024), (1.30, 0.028), (1.60, 0.040), (1.72, 0.050)]
    b.loft([[P3(a, r * math.sin(2 * math.pi * q / n), 0.05 - r * math.cos(2 * math.pi * q / n)) for q in range(n)] for a, r in pr], G_METAL, cap0=G_METAL, cap1=G_METAL)
    for ph in (0, 1, 2, 3):                                                        # флюгеры ДУА
        u = Vector((math.sin(ph * math.pi / 2), 0, math.cos(ph * math.pi / 2))); p0 = P3(0.55, 0, 0.05)
        b.loft([[p0 + u * 0.012 + Vector((0, dy, 0)) + Vector((0.002, 0, 0)), p0 + u * 0.012 + Vector((0, dy, 0)) - Vector((0.002, 0, 0)), p0 + u * 0.075 + Vector((0, dy - 0.03, 0)) - Vector((0.002, 0, 0)), p0 + u * 0.075 + Vector((0, dy - 0.03, 0)) + Vector((0.002, 0, 0))] for dy in (0.0, -0.06)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('det_pitot', sharp_deg=40)


# ── воздухозаборники: высокие прямоугольные коробки по бокам, внутренняя стенка ровная, отбойник плитой (03, 07, 12) ──
A_INT = 8.10; INT_X = (0.82, 1.32); INT_Z = (-0.42, 0.95); INT_RAKE = 0.12
def dsec(a, cx, zc, hw, hz, n=48, e_in=12.0, e_out=4.0):
    pts = []
    for q in range(n):
        th = -math.pi / 2 + 2 * math.pi * q / n; c, s_ = math.cos(th), math.sin(th); e = e_out if c > 0 else e_in
        pts.append(P3(a, cx + hw * math.copysign(abs(c) ** (2 / e), c), zc + hz * math.copysign(abs(s_) ** (2 / e), s_)))
    return pts
def duct_ring(sx, a, k=1.0, n=48):
    t = max(0.0, a - A_INT); fo = _sm(t / 6.0)
    xi = INT_X[0] - 0.08 * fo; xo = INT_X[1]; zt = INT_Z[1] + 0.05 * fo; zb = INT_Z[0] - 0.02 * fo
    cx = (xi + xo) / 2; hw = (xo - xi) / 2 * k
    return [Vector((sx * v.x, v.y, v.z)) for v in dsec(a, cx, (zt + zb) / 2, hw, (zt - zb) / 2 * k, n)]
def intake(sx):
    rs = []
    for a in [A_INT - 0.04, A_INT - 0.02, A_INT] + stations(A_INT + 0.12, 14.6, 0.25):
        k = 0.95 + 0.05 * _sm((a - (A_INT - 0.04)) / 0.04)
        r = duct_ring(sx, a, k)
        r = [Vector((v.x, v.y + INT_RAKE * (v.z - INT_Z[0]) / (INT_Z[1] - INT_Z[0]) * (1 - _sm((a - A_INT) / 0.5)), v.z)) for v in r]
        rs.append(r if sx > 0 else r[::-1])
    return loft_obj('s_duct', rs, sharp=40)
def intake_cut(sx):
    b = B(); n = 40
    prof = [(-0.40, 1.00, G_DUCT), (0.02, 1.00, G_DUCT), (0.70, 0.92, G_DUCT), (2.0, 0.82, G_DARK), (2.1, 0.10, G_DARK)]
    rings = []
    for da, k, _ in prof:
        cx, hw, zc, hz = (INT_X[0] + INT_X[1]) / 2, (INT_X[1] - INT_X[0]) / 2 - 0.05, (INT_Z[0] + INT_Z[1]) / 2, (INT_Z[1] - INT_Z[0]) / 2 - 0.05
        r = dsec(A_INT + da, cx, zc, hw * k, hz * k, n)
        r = [Vector((sx * v.x, v.y + INT_RAKE * (v.z - INT_Z[0]) / (INT_Z[1] - INT_Z[0]), v.z)) for v in r]
        rings.append(r if sx > 0 else r[::-1])
    b.loft(rings, [m for _, _, m in prof[1:]], cap0=G_DUCT, cap1=G_DARK); return b.finish('c_inl', sharp_deg=30)
def splitter(sx):
    """Отбойник пограничного слоя: высокая плита у внутренней стенки заборника на тягах (07, 12)."""
    b = B(); x = sx * (INT_X[0] - 0.045); a0, a1 = A_INT - 0.50, A_INT + 1.30; zb, zt = INT_Z[0] - 0.02, INT_Z[1] + 0.02
    rg = lambda a, h: [P3(a, x - 0.012, zb + h * 0.2), P3(a, x + 0.012, zb + h * 0.2), P3(a, x + 0.012, zt - h), P3(a, x - 0.012, zt - h)]
    b.loft([rg(a0, 0.10), rg(a0 + 0.30, 0.0), rg(a1, 0.0)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for a in (A_INT + 0.3, A_INT + 1.0):
        for zz in (zb + 0.25, (zb + zt) / 2, zt - 0.25): strut(b, P3(a, x, zz), P3(a, sx * (fus_hw(a) - 0.02), zz), 0.015, G_SKIN, 8)
    return b.finish('det_split_' + ('r' if sx > 0 else 'l'), sharp_deg=40)


# ── наплыв (неподвижная часть крыла) и поворотные консоли ──
WZ = 0.95                                                           # плоскость хорд наплыва и крыла (высокоплан: верх заборников, 03)
PIV = (13.80, 1.90)                                                 # шарнир консоли: a, x (кружки на видах сверху и снизу 03)
SW0, SW1 = 16.0, 69.0                                               # стреловидность передней кромки: вперёд и сложено (в файле)
D_FILE = SW1 - SW0                                                  # поворот консоли в файле от положения 16°
GLOVE = dict(le0=(8.40, 1.25), tip=(13.35, 2.98), te0=(15.10, 1.30))
def g_le(x): (a0, x0), (a1, x1) = GLOVE['le0'], GLOVE['tip']; return a0 + (x - x0) * (a1 - a0) / (x1 - x0)
def g_te(x): (a0, x0), (a1, x1) = GLOVE['te0'], GLOVE['tip']; return a0 + (x - x0) * (a1 - a0) / (x1 - x0) + 0.06
def glove(sx):
    """Наплыв толстым профилем (у шарнира толще консоли: она ходит внутри щели), к углу сходит на нет."""
    rs = []
    for x in [0.70, 1.00, 1.25, 1.50, 1.80, 2.10, 2.40, 2.65, 2.85, 2.95, 2.98]:
        le = g_le(max(x, 1.25)) if x >= 1.25 else g_le(1.25) - (1.25 - x) * 0.6; te = g_te(max(x, 1.30)); c = te - le
        t = (0.20 * (1 - _sm((x - 2.86) / 0.12)) + 0.012)
        rs.append(foil_ring(le, c, t / c / 0.6, 0.0006, 1.0, 30, lambda a, h, x=x: P3(a, sx * x, WZ + h), tail=cove_wall(le, c, t / c / 0.6, 1.0), head=cove_wall_f(le, c, t / c / 0.6, 0.0006)))
    rs = [[_over_slot(v) for v in r] for r in rs]
    if sx < 0: rs = [r[::-1] for r in rs]
    return loft_obj('s_glove', rs, sharp=50)


