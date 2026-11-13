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
FUS = [(1.70, 0.060, 0.030, 0.012, 2.0, 2.0), (1.80, 0.110, -0.010, 0.070, 2.0, 2.0), (2.00, 0.170, -0.070, 0.130, 2.0, 2.0), (2.25, 0.240, -0.140, 0.220, 2.0, 2.0),
       (2.78, 0.420, -0.320, 0.430, 2.0, 2.0), (3.33, 0.555, -0.425, 0.580, 2.05, 2.1), (4.05, 0.710, -0.510, 0.710, 2.1, 2.2), (4.60, 0.820, -0.550, 0.735, 2.2, 2.4),   # нос - оживало, у основания конуса шире, чем выше (Mark, чертёж 79)
       (5.20, 0.960, -0.590, 0.750, 2.3, 2.6), (5.80, 1.040, -0.620, 0.760, 2.5, 2.9), (6.50, 1.080, -0.620, 0.790, 2.6, 3.0), (7.50, 1.100, -0.620, 0.790, 2.6, 3.0),
       (8.50, 1.150, -0.600, 0.760, 2.6, 3.0), (10.00, 1.250, -0.580, 0.760, 2.6, 3.0), (12.00, 1.300, -0.550, 0.800, 2.7, 3.0), (13.50, 1.250, -0.520, 1.050, 3.2, 3.2),
       (14.50, 1.150, -0.500, 1.300, 4.0, 3.5), (16.00, 1.080, -0.480, 1.280, 5.5, 4.6), (17.10, 1.050, -0.470, 1.190, 6.0, 4.8), (18.00, 1.020, -0.460, 1.185, 6.5, 5.0), (19.40, 0.960, -0.455, 1.180, 6.0, 4.8),   # чертёж 79: сзади уже (1,23 м)
       (20.10, 0.900, -0.462, 1.150, 6.5, 4.6), (20.55, 0.820, -0.466, 1.110, 6.5, 4.4), (20.87, 0.680, -0.470, 1.075, 3.0, 2.8)]   # хвост сходится овалом, обжимающим оба сопла (Mark: плавно в сопла); борта у стабилизатора почти плоские и высокие до задней кромки - корень прилегает на всём ходе (Mark: часть висела в воздухе)
FT = tracks(FUS); A_TAIL = 20.87
HOOD_RI, HOOD_RO = 0.48 + 0.025, 0.48 + 0.048                      # плиты у сопел: внутри / снаружи (NOZ_R + зазор)


def fus_top(a, x=0.0):
    top, bot, hw, nt = FT[0](a), FT[1](a), FT[2](a), FT[3](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = min(0.999, abs(x) / max(hw, 1e-6)); return cy + ht * (1 - q ** nt) ** (1 / nt)


def fus_bot(a, x=0.0):
    top, bot, hw, nb = FT[0](a), FT[1](a), FT[2](a), FT[4](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = min(0.999, abs(x) / max(hw, 1e-6)); return cy - ht * (1 - q ** nb) ** (1 / nb)
def fus_hw(a): return FT[2](a)
def side_x(a, z):
    """Полуширина фюзеляжа на высоте z в сечении a (суперэллипс таблицы FUS)."""
    top, bot, hw, nt, nb = FT[0](a), FT[1](a), FT[2](a), FT[3](a), FT[4](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = min(0.999, abs(z - cy) / max(ht, 1e-6)); n_ = nt if z >= cy else nb; return hw * (1 - q ** n_) ** (1 / n_)


A_BLEND = 20.55                                                     # отсюда хвост перетекает в обвод плит над и под соплами (Mark: листы - продолжение корпуса)
def stadium(th, R):
    """Обвод двух сопел: две окружности радиуса R вокруг осей сопел, сверху и снизу ровные полки. Точка - по лучу из центра под углом th."""
    c, s_ = math.cos(th), math.sin(th)
    if abs(s_) > 1e-6:
        t = R / abs(s_)
        if abs(t * c) <= NOZ_X: return Vector((t * c, NOZ_Z + t * s_))
    cx = math.copysign(NOZ_X, c); dc = c * cx; t = dc + math.sqrt(max(0.0, dc * dc - cx * cx + R * R))
    return Vector((t * c, NOZ_Z + t * s_))
def fuselage():
    n = 72; rs = []
    for a in sorted(set([1.705, 1.72, 1.76, 1.82, 1.90] + stations(2.0, A_BLEND, 0.16) + stations(A_BLEND, A_TAIL, 0.035))):
        top, bot, hw, nt, nb = FT[0](a), FT[1](a), FT[2](a), FT[3](a), FT[4](a); r = sup(a, 0.0, top, bot, hw, nt, nb, n)
        if a > A_BLEND:
            w = _sm((a - A_BLEND) / (A_TAIL - A_BLEND)); cy = (top + bot) / 2; r2 = []
            for v in r:
                q = stadium(math.atan2(v.z - cy, v.x), HOOD_RO); r2.append(Vector((v.x + (q.x - v.x) * w, v.y, v.z + (q.y - v.z) * w)))
            r = r2
        rs.append(r)
    return loft_obj('s_fus', rs, sharp=50)


def pitot():
    """ПВД: длинная штанга с флюгерами на конце (06, 07)."""
    b = B(); n = 12; pr = [(0.84, 0.004), (0.87, 0.012), (1.20, 0.016), (1.23, 0.024), (1.50, 0.028), (1.64, 0.040), (1.72, 0.050)]
    b.loft([[P3(a, r * math.sin(2 * math.pi * q / n), 0.05 - r * math.cos(2 * math.pi * q / n)) for q in range(n)] for a, r in pr], G_METAL, cap0=G_METAL, cap1=G_METAL)
    for ph in (0, 1, 2, 3):                                                        # флюгеры ДУА
        u = Vector((math.sin(ph * math.pi / 2), 0, math.cos(ph * math.pi / 2))); p0 = P3(1.10, 0, 0.05)
        b.loft([[p0 + u * 0.012 + Vector((0, dy, 0)) + Vector((0.002, 0, 0)), p0 + u * 0.012 + Vector((0, dy, 0)) - Vector((0.002, 0, 0)), p0 + u * 0.075 + Vector((0, dy - 0.03, 0)) - Vector((0.002, 0, 0)), p0 + u * 0.075 + Vector((0, dy - 0.03, 0)) + Vector((0.002, 0, 0))] for dy in (0.0, -0.06)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('det_pitot', sharp_deg=40)


# ── воздухозаборники: высокие прямоугольные коробки по бокам, внутренняя стенка ровная, отбойник плитой (03, 07, 12) ──
A_INT = 8.10; INT_X = (0.80, 1.22); INT_Z = (-0.42, 0.95); INT_RAKE = 0.12            # 03 спереди: снаружи 1,20 м от оси
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
    for a in sorted(set([A_INT - 0.04, A_INT - 0.02, A_INT] + stations(A_INT + 0.12, 14.6, 0.25))):
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
GLOVE = dict(le0=(9.50, 1.25), tip=(13.05, 2.25), te0=(15.10, 1.28))          # Mark: зона от заборников до крыла длинновата; по чертежу и фото сверху консоль выходит из наплыва в 2,3 м от оси (было 3,1)
def g_le(x): (a0, x0), (a1, x1) = GLOVE['le0'], GLOVE['tip']; return a0 + (x - x0) * (a1 - a0) / (x1 - x0)
def g_te(x): (a0, x0), (a1, x1) = GLOVE['te0'], GLOVE['tip']; return a0 + (x - x0) * (a1 - a0) / (x1 - x0) + 0.06
def glove(sx):
    """Наплыв толстым профилем (у шарнира толще консоли: она ходит внутри щели), к углу сходит на нет."""
    rs = []
    TX = GLOVE['tip'][1]
    for x in sorted(set([round(v, 3) for v in stations(0.70, TX - 0.18, 0.07)] + [round(TX - d, 3) for d in (0.13, 0.08, 0.04, 0.01, 0.0)])):            # часто: между сечениями наплыв не проседает ниже щели (иначе дыры сверху, Mark)
        le = g_le(max(x, 1.25)) if x >= 1.25 else g_le(1.25) - (1.25 - x) * 0.6; te = g_te(max(x, 1.30)); c = te - le
        t = (0.20 * (1 - _sm((x - (TX - 0.12)) / 0.12)) + 0.012)
        rs.append(foil_ring(le, c, t / c / 0.6, 0.0006, 1.0, 44, lambda a, h, x=x: P3(a, sx * x, WZ + h), tail=cove_wall(le, c, t / c / 0.6, 1.0), head=cove_wall_f(le, c, t / c / 0.6, 0.0006)))
    NU, K = 44, COVE_K
    def fix(r):                                                                    # верх и низ - над и под щелью; стенки кромок - ровно между ними (не схлопываются в складки)
        up = [_over_slot(v) for v in r[:NU]]; lo = [_over_slot(v) for v in r[NU + K:2 * NU + K]]
        tail = [up[-1].lerp(lo[0], (i + 1) / (K + 1)) for i in range(K)]; head = [lo[-1].lerp(up[0], (i + 1) / (K + 1)) for i in range(K)]
        return up + tail + lo + head
    fx = [fix(r) for r in rs]
    D = [[q.z - v.z for q, v in zip(f, r)] for f, r in zip(fx, rs)]              # подъём (+) и опускание (-) каждой точки
    out = []
    for j, r in enumerate(rs):                                                   # подъём сглажен по соседним сечениям и точкам: наибольший в окне - без пилы по задней кромке
        row = []
        for i, v in enumerate(r):
            win = [D[jj][(i + di) % len(r)] for jj in range(max(0, j - 2), min(len(rs), j + 3)) for di in (-2, -1, 0, 1, 2)]
            up_, dn_ = max(0.0, max(win)), min(0.0, min(win)); d0 = D[j][i]
            row.append(Vector((v.x, v.y, v.z + (up_ if d0 >= 0 and (v.z - WZ) >= 0 else dn_ if (v.z - WZ) < 0 else d0))))
        out.append(row)
    rs = out
    if sx < 0: rs = [r[::-1] for r in rs]
    return loft_obj('s_glove', rs, sharp=50)


def slot_rng(a, lat):
    """Низ и верх (от WZ), которые консоль занимает в точке (a, lat) за весь ход 16…69°, плюс зазор щели и обшивка; консоль с поперечным V, поэтому середина у каждого положения своя. None - консоль сюда не заходит."""
    lo, hi = None, None
    for k in range(0, int(D_FILE) + 1, 2):
        r = math.radians(k); dx = lat - PIV[1]; da = a - PIV[0]
        s = dx * math.cos(r) + da * math.sin(r); d = -dx * math.sin(r) + da * math.cos(r)    # точку поворачиваем назад к положению 16°
        sc = min(max(s, S_SLOT[0]), S_SLOT[1]); le = w_le(sc) - 0.012; te = w_te(sc) + 0.012; dc = min(max(d, le), te)
        e = math.hypot(s - sc, d - dc); w = 1 - _sm((e - 0.10) / 0.20)                # как у вырезателя щели (он берёт точки до 8 см от консоли): полная высота до 10 см, спад до 30 см
        if w <= 0: continue
        c = te - le; h = (w_tc(sc) * c * thk(min(max((dc - le) / c, 0.0), 1.0)) + 0.015 + 0.008) * w; zc = -sc * ANH
        lo = zc - h if lo is None else min(lo, zc - h); hi = zc + h if hi is None else max(hi, zc + h)
    return None if lo is None else (lo, hi)
def _up_slot(v):
    """Для борта и коробов заборников: только вверх, если обшивка попадает в полосу щели (обтекатель над корнем консоли при 69°, без складок)."""
    rg = slot_rng(L / 2 - v.y, abs(v.x))
    if rg is None: return v
    lo, hi = rg; dz = v.z - WZ
    if dz < lo or dz >= hi + 0.010: return v
    return Vector((v.x, v.y, WZ + hi + 0.010))
def _over_slot(v):
    rg = slot_rng(L / 2 - v.y, abs(v.x))
    if rg is None: return v
    lo, hi = rg; dz = v.z - WZ
    if dz >= (lo + hi) / 2: return Vector((v.x, v.y, WZ + max(dz, hi + 0.030)))              # запас 3 см: почти совпадающие поверхности дают осколки при вырезании
    return Vector((v.x, v.y, WZ + min(dz, lo - 0.030)))


# консоль в своей системе при 16°: s - вдоль размаха от шарнира, d - назад от шарнира (03, вид снизу: корень передней кромки (13,05; 2,95), конец 8,82 м от оси при размахе 17,64)
S_TIP = 6.54; LE_D0 = -0.813; TE_D0 = 1.89; TE_DT = 1.86; X_MIN = 0.95           # единицы чертежа: передняя кромка 16° через середину кромки 03, задняя почти поперёк, хорда на конце 0,8 м
TE_IN = (2.00, 0.0)                                                 # излома задней кромки у корня нет: внутренняя линия выше внешней
R_LE, R_TE = 0.16, 0.10                                             # скругление углов законцовки в плане
S_SLOT = (-0.55, 1.90)                                              # часть консоли, которая ходит внутри наплыва и борта
SLOT_CUT = False                                                    # щель не вырезается: консоль уходит в наплыв (он над ней толще на всём ходе) и в борт, как под уплотнение;
                                                                    # вырезанная щель давала дыры и осколки на верху наплыва у борта (Mark 2026-11-13)
def _round(s, r): q = s - (S_TIP - r); return r - math.sqrt(max(0.0, r * r - q * q)) if q > 0 else 0.0
def _smin(a, b, k): h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25
def w_le(s): return LE_D0 + s * math.tan(math.radians(SW0)) + _round(s, R_LE)
def w_te_raw(s): return _smin(TE_D0 + (TE_DT - TE_D0) * s / S_TIP, TE_IN[0] + TE_IN[1] * s, 0.06) - _round(s, R_TE)
def w_te(s):
    """Задняя кромка с подрезкой у корня: при 69° консоль не заходит к оси ближе X_MIN (дальше - щель в борту), угол подрезки скруглён."""
    return _smin(w_te_raw(s), te_lim(s), 0.16)
def te_lim(s): dlt = math.radians(D_FILE); return (PIV[1] - X_MIN + s * math.cos(dlt)) / math.sin(dlt)
def s_corner():
    lo, hi = -0.5, S_TIP - 0.5
    for _ in range(60):
        m = (lo + hi) / 2
        if te_lim(m) < w_te_raw(m): lo = m
        else: hi = m
    return (lo + hi) / 2
def s_crank(): return (TE_D0 - TE_IN[0]) / (TE_IN[1] + (TE_D0 - TE_DT) / S_TIP)
def w_tc(s): return 0.070 - 0.022 * min(1.0, max(0.0, s) / S_TIP)
ANH = math.tan(math.radians(3.0))                                 # поперечное V консолей -3° (03 спереди: концы ниже корня)
def wl(sx, s, d, z): return Vector((sx * (PIV[1] + s), Yb(PIV[0] + d), z - s * ANH))        # точка консоли при 16° в осях мира
FLAPS = [(1.25, 3.95), (4.02, 6.15)]; FL_C = 0.30                  # двухщелевые закрылки почти во весь размах (03)
SLAT = (1.20, 6.60); SL_C = 0.15                                      # предкрылок во весь размах, до скругления законцовки
SPOIL = [(1.60, 3.60), (3.70, 5.40)]
def f_hinge(s): return w_te(s) - FL_C * (w_te(s) - w_le(s))
def wsec(sx, s, z0=WZ):
    le = w_le(s); te = w_te(s); c = te - le; tc = w_tc(s); us = 0.0006
    place = lambda a, h: wl(sx, s, a, z0 + h)
    for e0, e1 in FLAPS:
        if e0 - 1e-6 <= s <= e1 + 1e-6: ue, tail = cove_cut(le, c, tc, f_hinge(s)); break
    else: ue, tail = 1.0, cove_wall(le, c, tc, 1.0)
    u0 = us; head = cove_wall_f(le, c, tc, us)
    if SLAT[0] - 1e-6 <= s <= SLAT[1] + 1e-6:
        u0 = SL_C + 0.004; head = [(le + c * SL_C, tc * c * thk(SL_C) * (-1 + 2 * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
    r = foil_ring(le, c, tc, u0, ue, 30, place, tail=tail, head=head)
    return r if sx > 0 else r[::-1]
def wing_panel(sx):
    k = []
    for e0, e1 in FLAPS + [SLAT]: k += [e0 - 0.003, e0, e1, e1 + 0.003]
    sc = s_corner(); sk = s_crank(); k += [sc - 0.10, sc - 0.05, sc, sc + 0.05, sc + 0.10, sk - 0.05, sk, sk + 0.05]
    ss = sorted(set(round(v, 4) for v in [S_SLOT[0] + 0.07, -0.30, -0.10, 0.10, 0.40, 0.80, 1.20] + stations(1.4, S_TIP - 0.40, 0.30) + stations(S_TIP - 0.40, S_TIP - 0.04, 0.04) + k + [S_TIP - 0.02, S_TIP] if S_SLOT[0] + 0.06 <= v <= S_TIP))
    rs = []
    for s in ss:
        r = wsec(sx, s)
        if s > S_TIP - 0.13:                                                           # законцовка: толщина к нулю
            q = (s - (S_TIP - 0.13)) / 0.13; f = math.sqrt(max(0.0, 1 - q * q)) * 0.97 + 0.03
            zc = WZ - s * ANH; r = [Vector((v.x, v.y, zc + (v.z - zc) * f)) for v in r]
        rs.append(r)
    nm = 'wing_' + ('r' if sx > 0 else 'l'); ob = loft_obj(nm, rs, sharp=50); piv = P3(PIV[0], sx * PIV[1], WZ); _rel(ob, piv)
    PARTS[nm] = dict(pivot=piv.copy(), axis=Vector((0, 0, -sx)), range=(0.0, D_FILE), file=D_FILE, sweep=(SW0, SW1),
                     note=f'консоль: вертикальная ось шарнира; 0 - стреловидность {SW0:.0f}° (вперёд), {D_FILE:.0f}° - сложено ({SW1:.0f}°, положение в файле), {45 - SW0:.0f}° - 45°; плюс - конец назад; дети - закрылки, носок, интерцепторы')
    return ob


def flap(sx, i):
    s0, s1 = FLAPS[i]; s0 += 0.012; s1 -= 0.012; nm = f'flap{i + 1}_' + ('r' if sx > 0 else 'l')
    p0 = wl(sx, s0, f_hinge(s0), WZ); p1 = wl(sx, s1, f_hinge(s1), WZ); piv = (p0 + p1) / 2; ax = (p1 - p0).normalized()
    if ax.x < 0: ax = -ax
    rs = []
    for j in range(7):
        s = s0 + (s1 - s0) * j / 6; le = w_le(s); c = w_te(s) - le; ah = f_hinge(s)
        r = [v - piv for v in foil_ring(le, c, w_tc(s), (ah - le) / c, 1.0, 10, lambda a, h, s=s: wl(sx, s, a, WZ + h), head=cove_nose(le, c, w_tc(s), ah))]
        rs.append(r if sx > 0 else r[::-1])
    ob = loft_obj(nm, rs, sharp=48); ob.location = piv
    PARTS[nm] = dict(pivot=piv.copy(), axis=ax.copy(), range=(0.0, 50.0), parent='wing_' + ('r' if sx > 0 else 'l'), note='закрылок: ось в центре круглого носа; плюс - задняя кромка вниз; ребёнок консоли (выпускать при 16°)')
    return ob


def slat(sx):
    """Отклоняемый носок по внешней части консоли: ось у нижней поверхности на 16 % хорды, плюс - носок вниз."""
    s0, s1 = SLAT; s0 += 0.012; s1 -= 0.012; nm = 'slat_' + ('r' if sx > 0 else 'l')
    hp = lambda s: wl(sx, s, w_le(s) + SL_C * (w_te(s) - w_le(s)), WZ - w_tc(s) * (w_te(s) - w_le(s)) * thk(SL_C))
    p0, p1 = hp(s0), hp(s1); piv = (p0 + p1) / 2; ax = (p1 - p0).normalized()
    if ax.x < 0: ax = -ax
    rs = []
    for j in range(9):
        s = s0 + (s1 - s0) * j / 8; le = w_le(s); c = w_te(s) - le; tc = w_tc(s)
        r = foil_ring(le, c, tc, 0.0006, SL_C - 0.006 / c, 10, lambda a, h, s=s: wl(sx, s, a, WZ + h), tail=[(le + c * SL_C - 0.006, tc * c * thk(SL_C - 0.006 / c) * (1 - 2 * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)], head=cove_wall_f(le, c, tc, 0.0006))
        r = [v - piv for v in r]; rs.append(r if sx > 0 else r[::-1])
    ob = loft_obj(nm, rs, sharp=50); ob.location = piv
    PARTS[nm] = dict(pivot=piv.copy(), axis=ax.copy(), range=(0.0, 20.0), parent='wing_' + ('r' if sx > 0 else 'l'), note='отклоняемый носок: ось у нижней поверхности; плюс - носок вниз; ребёнок консоли')
    return ob


def spoilers(sx):
    out = []
    for i, (s0, s1) in enumerate(SPOIL):
        nm = f'spoil{i + 1}_' + ('r' if sx > 0 else 'l'); b = B(); rs = []
        for j in range(5):
            s = s0 + (s1 - s0) * j / 4; c = w_te(s) - w_le(s); u0 = 0.50; u1 = 0.66; tc = w_tc(s)
            pts = [wl(sx, s, w_le(s) + c * (u0 + (u1 - u0) * k / 6), WZ + tc * c * thk(u0 + (u1 - u0) * k / 6) + 0.004) for k in range(7)]
            rs.append([p + Vector((0, 0, dz)) for p in pts for dz in ()] or pts)
        top = [[p + Vector((0, 0, 0.012)) for p in r] for r in rs]; bot = [[p + Vector((0, 0, 0.003)) for p in r] for r in rs]
        ring = [t + bb[::-1] for t, bb in zip(top, bot)]
        if sx < 0: ring = [r[::-1] for r in ring]
        b.loft(ring, G_SKIN, cap0=G_SKIN, cap1=G_SKIN); ob = b.finish(nm, sharp_deg=40)
        s = (s0 + s1) / 2; c = w_te(s) - w_le(s); p0 = wl(sx, s0, w_le(s0) + 0.50 * (w_te(s0) - w_le(s0)), WZ + 0.012); p1 = wl(sx, s1, w_le(s1) + 0.50 * (w_te(s1) - w_le(s1)), WZ + 0.012)
        piv = (p0 + p1) / 2; ax = (p1 - p0).normalized() * (-1 if sx > 0 else 1); _rel(ob, piv)
        PARTS[nm] = dict(pivot=piv.copy(), axis=ax.copy(), range=(0.0, 25.0), parent='wing_' + ('r' if sx > 0 else 'l'), note='интерцептор (элеронов нет): ось у передней кромки; плюс - задняя кромка вверх; ребёнок консоли')
        out.append(ob)
    return out


def slot_cutter(sx, wing=None, cell=0.05):
    """Щель в наплыве и борту - один замкнутый объём по сетке 6 см: в плане - всё, что корень консоли заметает за ход 16…69°, по высоте - наибольшая толщина консоли в этой точке плюс 1,5 см.
    Раньше - объединение 29 копий профиля: обшивка росла с 20 до 94 тыс. треугольников. Стенки щели внутри наплыва и борта, снаружи видно только отверстие."""
    import bmesh
    a0, a1 = PIV[0] - 1.40, PIV[0] + 3.00; l0, l1 = X_MIN - 0.08, PIV[1] + S_SLOT[1] + 0.20
    na = int(math.ceil((a1 - a0) / cell)) + 1; nl = int(math.ceil((l1 - l0) / cell)) + 1
    H = [[None] * nl for _ in range(na)]; IN = [[False] * nl for _ in range(na)]; TB = {}
    for i in range(na):
        for j in range(nl):
            a = a0 + i * cell; lat = l0 + j * cell; best = -1.0; ins = False; tp, bt = -9.0, 9.0
            for k in range(0, int(D_FILE) + 1, 2):
                r = math.radians(k); dx = lat - PIV[1]; da = a - PIV[0]
                s = dx * math.cos(r) + da * math.sin(r); d = -dx * math.sin(r) + da * math.cos(r)
                sc = min(max(s, S_SLOT[0]), S_SLOT[1]); le = w_le(sc) - 0.012; te = w_te(sc) + 0.012; dc = min(max(d, le), te)
                c = te - le; h = w_tc(sc) * c * thk(min(max((dc - le) / c, 0.0), 1.0)) + 0.015
                e = math.hypot(s - sc, d - dc)
                if e < 1e-9: ins = True
                if e < cell * 1.6: best = max(best, h); zc = -sc * ANH; tp = max(tp, zc + h); bt = min(bt, zc - h)
            IN[i][j] = ins; H[i][j] = best; TB[(i, j)] = (bt, tp)
    use = [[H[i][j] > 0 for j in range(nl)] for i in range(na)]
    C = [[use[i][j] and use[i + 1][j] and use[i][j + 1] and use[i + 1][j + 1] for j in range(nl - 1)] for i in range(na - 1)]
    for _ in range(20):                                         # углы только по диагонали дают не-многообразную вершину: закрываем
        ch = False
        for i in range(na - 2):
            for j in range(nl - 2):
                q = (C[i][j], C[i + 1][j], C[i][j + 1], C[i + 1][j + 1])
                if q in ((True, False, False, True), (False, True, True, False)):
                    for ii, jj in ((i, j), (i + 1, j), (i, j + 1), (i + 1, j + 1)):
                        for pi, pj in ((ii, jj), (ii + 1, jj), (ii, jj + 1), (ii + 1, jj + 1)):
                            if H[pi][pj] <= 0: H[pi][pj] = 0.02; TB[(pi, pj)] = (-0.02, 0.02)
                        C[ii][jj] = True
                    ch = True
        if not ch: break
    bm = bmesh.new(); VT = {}; VB = {}
    def vt(i, j):
        if (i, j) not in VT:
            a = a0 + i * cell; lat = l0 + j * cell; bt, tp = TB.get((i, j), (-0.02, 0.02))
            if tp - bt < 0.04: m_ = (tp + bt) / 2; bt, tp = m_ - 0.02, m_ + 0.02
            VT[(i, j)] = bm.verts.new(P3(a, sx * lat, WZ + tp)); VB[(i, j)] = bm.verts.new(P3(a, sx * lat, WZ + bt))
        return VT[(i, j)], VB[(i, j)]
    for i in range(na - 1):
        for j in range(nl - 1):
            if not C[i][j]: continue
            q = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
            T = [vt(*p)[0] for p in q]; Bv = [vt(*p)[1] for p in q]
            bm.faces.new(T); bm.faces.new(Bv[::-1])
            for (p0, p1), (ni, nj) in zip(zip(q, q[1:] + q[:1]), ((i, j - 1), (i + 1, j), (i, j + 1), (i - 1, j))):
                if 0 <= ni < na - 1 and 0 <= nj < nl - 1 and C[ni][nj]: continue
                t0, b0 = vt(*p0); t1, b1 = vt(*p1); bm.faces.new((t1, t0, b0, b1))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('c_slot'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('c_slot', me); bpy.context.scene.collection.objects.link(ob)
    return ob




# ── киль с гребнем, руль, два подфюзеляжных гребня, стабилизатор цельноповоротный ──
FZ0, FZ1 = 0.70, 3.92                                               # корень киля уходит в спину (сзади она ниже 1,0)
def FLE(z): return 18.10 + (z - 1.66) * 1.571
def FTE(z): return 21.30 + (z - 1.00) * 0.452
RUD = (1.30, 3.70); RUD_C = 0.85
def FTC(z): return 0.055 - 0.015 * (z - FZ0) / (FZ1 - FZ0)
def fin():
    zs = sorted(set(stations(FZ0, FZ1 - 0.06, 0.16) + [RUD[0] - 0.003, RUD[0], RUD[1], RUD[1] + 0.003] + [RUD[0] + (RUD[1] - RUD[0]) * i / 10 for i in range(1, 10)] + [FZ1 - 0.03, FZ1]))
    rings = []
    for z in zs:
        le, te = FLE(z), FTE(z); c = te - le; tc = FTC(z)
        if RUD[0] - 1e-6 <= z <= RUD[1] + 1e-6: ue, tail = cove_cut(le, c, tc, te - RUD_C, 0.006)
        else: ue, tail = 1.0, cove_wall(le, c, tc, 1.0)
        rings.append(foil_ring(le, c, tc, 0.0006, ue, 26, lambda a, h, z=z: P3(a, h, z), tail=tail, head=cove_wall_f(le, c, tc, 0.0006)))
    return loft_obj('fin_c', rings, sharp=50)
def dorsal():
    """Гребень перед килём: от спины (a 16,3) к передней кромке киля (03)."""
    rs = []
    for z, a0 in ((0.95, 15.80), (1.10, 16.30), (1.30, 16.95), (1.50, 17.55), (1.66, 18.05)):
        a1 = FLE(1.66) + 1.2; c = a1 - a0; rs.append(foil_ring(a0, c, 0.14 / c, 0.0006, 1.0, 18, lambda a, h, z=z: P3(a, h, z), tail=cove_wall(a0, c, 0.14 / c, 1.0), head=cove_wall_f(a0, c, 0.14 / c, 0.0006)))
    return loft_obj('s_dors', rs, sharp=50)
def rudder():
    z0, z1 = RUD[0] + 0.006, RUD[1] - 0.006; pv0 = P3(FTE(z0) - RUD_C, 0.0, z0); pv1 = P3(FTE(z1) - RUD_C, 0.0, z1); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    rings = []
    for j in range(11):
        z = z0 + (z1 - z0) * j / 10; le, te = FLE(z), FTE(z); c = te - le; ah = te - RUD_C
        rings.append([v - pivot for v in foil_ring(le, c, FTC(z), (ah - le) / c, 1.0, 10, lambda a, h, z=z: P3(a, h, z), head=cove_nose(le, c, FTC(z), ah))])
    ob = loft_obj('rudder', rings, sharp=48); ob.location = pivot
    PARTS['rudder'] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-25.0, 25.0), note='руль направления: ось в центре круглого носа')
    return ob
VF = dict(a0=15.90, a1=19.10, zb=-1.23, x=0.90, cant=15.0)            # подфюзеляжные гребни: передняя кромка у корня, задняя, низ, от оси, развал наружу
def vfins():
    out = []
    for sx in (1, -1):
        rs = []; ca = math.radians(VF['cant'])
        for z in (-0.40, -0.47, -0.70, -0.95, VF['zb']):
            t = (-0.47 - z) / (-0.47 - VF['zb']) if z < -0.47 else 0.0; le = VF['a0'] + 0.75 * t ** 0.8; te = VF['a1'] - 0.05 * t; c = te - le
            xo = VF['x'] + (-0.47 - z) * math.tan(ca)
            r = foil_ring(le, c, 0.05, 0.0006, 1.0, 18, lambda a, h, z=z, xo=xo: P3(a, sx * (xo + h), z), tail=cove_wall(le, c, 0.05, 1.0), head=cove_wall_f(le, c, 0.05, 0.0006))
            rs.append(r if sx > 0 else r[::-1])
        out.append(loft_obj('vfin_' + ('r' if sx > 0 else 'l'), rs, sharp=50))
    return out
STZ = 0.62; ST_PIV = 19.20
def SLE(x): return 16.672 + (x - 1.06) * 1.269                    # Mark, чертёж 79: корень передней кромки на 0,4 м впереди (52° вместо 48°), конец как на 03 (20,23; 3,88)
ST_RND = 0.15
def SLE_R(x): d = max(0.0, x - (ST_TIP - ST_RND)); return SLE(x) + ST_RND - math.sqrt(max(0.0, ST_RND * ST_RND - d * d))   # скруглённый угол законцовки (79)
def STE(x):                                                          # чертёж 79: задняя кромка стреловиднее, законцовка срезана наискось от угла (20,99; 3,35) к носку у передней кромки
    t = 20.54 + (x - 1.18) * 0.207
    return t if x <= ST_TC else min(t, 20.99 - (x - ST_TC) * 1.6)
ST_TC = 3.35
ST_TIP = 3.75
def stab(sx):
    rs = []
    for x in ['cap', None, 1.45] + stations(1.60, ST_TC, 0.20) + [3.45, 3.55, 3.62, 3.68, ST_TIP - 0.03, ST_TIP]:
        xr = 1.33 if x in (None, 'cap') else x; le, te = SLE_R(xr), STE(xr); c = te - le; k = max(0.0, (xr - (ST_TIP - 0.10)) / 0.10); f = math.sqrt(max(0.0, 1 - k * k)) * 0.97 + 0.03
        if x == 'cap': place = lambda a, h: P3(a, sx * root_x(a, STZ), STZ)          # торец корня сходится на среднюю линию профиля по борту: без плоской крышки, она провалилась бы в борт
        elif x is None: place = lambda a, h: P3(a, sx * root_x(a, STZ + h), STZ + h)          # корень по огибающей борта на всём ходе ±15° (Mark: стабилизатор висел в воздухе)
        else: place = lambda a, h, x=x, f=f: P3(a, sx * x, STZ + h * f)
        r = foil_ring(le, c, 0.045, 0.0006, 1.0, 22, place, tail=cove_wall(le, c, 0.045, 1.0), head=cove_wall_f(le, c, 0.045, 0.0006))
        rs.append(r if sx > 0 else r[::-1])
    if ST_RMAX: print('корень стабилизатора x: %.3f ... %.3f' % (min(ST_RMAX), max(ST_RMAX))); ST_RMAX.clear()
    nm = 'stab_' + ('r' if sx > 0 else 'l'); ob = loft_obj(nm, rs, cap0=False, sharp=50); piv = P3(ST_PIV, sx * 1.33, STZ); _rel(ob, piv)
    PARTS[nm] = dict(pivot=piv.copy(), axis=Vector((-1, 0, 0)), range=(-15.0, 15.0), note='половина цельноповоротного стабилизатора: ось поперёк; плюс - передняя кромка вниз; половины ходят вместе (тангаж) и врозь (крен)')
    return ob


# ── два регулируемых сопла, контейнер тормозного парашюта над ними ──
NOZ_R = 0.48; NOZ_X = 0.53; NOZ_Z = 0.08; A_NOZ = 20.87
ST_RMAX = []
def root_x(a, z, gap=0.012):
    """Корень стабилизатора: ближе всего к борту (и соплу), но без касания при отклонении -15...+15° вокруг шарнира."""
    best = 0.0
    for k in range(-10, 11):
        t = math.radians(1.5 * k); da, dz = a - ST_PIV, z - STZ
        a2 = ST_PIV + da * math.cos(t) - dz * math.sin(t); z2 = STZ + da * math.sin(t) + dz * math.cos(t)
        xs = side_x(min(a2, A_TAIL), z2) if a2 <= A_TAIL else 0.0
        dzn = z2 - NOZ_Z
        if a2 > A_NOZ - 0.12 and abs(dzn) < NOZ_R + 0.02: xs = max(xs, NOZ_X + math.sqrt(max(0.0, (NOZ_R + 0.02) ** 2 - dzn * dzn)))
        best = max(best, xs)
    ST_RMAX.append(best + gap); return best + gap
def nozzle(sx):
    b = B(); n = 56; a0 = A_NOZ
    pr = [(-0.10, NOZ_R + 0.005), (0.05, NOZ_R), (0.25, NOZ_R - 0.05), (0.28, NOZ_R - 0.07), (0.15, NOZ_R - 0.09), (-0.40, NOZ_R - 0.12)]
    rings = [[P3(a0 + da, sx * NOZ_X + (r + 0.008 * (q % 4 == 0)) * math.sin(2 * math.pi * q / n), NOZ_Z + (r + 0.008 * (q % 4 == 0)) * math.cos(2 * math.pi * q / n)) for q in range(n)] for da, r in pr]
    b.loft(rings, [G_METAL, G_METAL, G_METAL, G_DARK, G_DARK], cap1=G_DARK)
    nm = 'nozzle_' + ('r' if sx > 0 else 'l'); ob = b.finish(nm, sharp_deg=30); piv = P3(a0, sx * NOZ_X, NOZ_Z); _rel(ob, piv)
    PARTS[nm] = dict(pivot=piv.copy(), axis=Vector((0, -1, 0)), range=(0.85, 1.0), kind='scale', note='регулируемое сопло: масштаб створок поперёк оси (0,85 - бесфорсажный, 1,0 - форсаж); центр - срез сопла')
    return ob
def nozzle_hood():
    """Плиты над и под соплами (фото сверху-сзади) - продолжение обшивки: хвост на срезе A_TAIL сходится ровно в обвод stadium(HOOD_RO), дальше этот обвод
    тонкой обечайкой ложится на сопла. Сверху и снизу ровные полки до среза сопел, на наружных боках короче. Изнутри 1,2 см до сопла на полном форсаже."""
    b = B(); n = 96; ri, ro = HOOD_RI, HOOD_RO; rm = (ri + ro) / 2; L = A_NOZ + 0.28 - A_TAIL; a0 = A_TAIL - 0.03
    ths = [-math.pi / 2 + 2 * math.pi * k / n for k in range(n)]
    def le(th):
        p = stadium(th, ro); w = min(1.0, abs(p.y - NOZ_Z) / ro) ** 1.5; return A_TAIL + L * (0.15 + 0.85 * w)
    prof = [lambda e: (a0, ro - 0.006), lambda e: (A_TAIL + 0.01, ro), lambda e: (e - 0.014, ro), lambda e: (e - 0.004, ro - 0.006), lambda e: (e, rm),
            lambda e: (e - 0.004, ri + 0.006), lambda e: (e - 0.014, ri), lambda e: (a0, ri)]
    rings = []
    for f in prof:
        rg = []
        for th in ths:
            a, R = f(le(th)); p = stadium(th, R); rg.append(P3(a, p.x, p.y))
        rings.append(rg)
    b.loft(rings, G_SKIN)
    return b.finish('det_nozhood', sharp_deg=40)
def nozzle_cut(sx):
    n = 48; b = B(); a0 = A_NOZ
    rings = [[P3(a0 + da, sx * NOZ_X + r * math.sin(2 * math.pi * q / n), NOZ_Z + r * math.cos(2 * math.pi * q / n)) for q in range(n)] for da, r in ((0.2, NOZ_R - 0.10), (-0.6, NOZ_R - 0.10), (-0.65, 0.05))]
    b.loft(rings, G_DARK, cap0=G_DARK, cap1=G_DARK); return b.finish('c_noz', sharp_deg=30)
def chute_box():
    """Контейнер тормозного парашюта в основании руля над соплами (03): цилиндр с острым концом; крышка - отдельная часть."""
    b = B(); n = 24; zc = 0.86
    pr = [(20.00, 0.05), (20.20, 0.14), (20.50, 0.16), (21.35, 0.16), (21.42, 0.15)]
    b.loft([[P3(a, r * math.sin(2 * math.pi * q / n), zc + r * math.cos(2 * math.pi * q / n)) for q in range(n)] for a, r in pr], G_SKIN, cap0=G_SKIN, cap1=G_DARK)
    box = b.finish('det_chute', sharp_deg=40)
    c = B(); c.loft([[P3(a, r * math.sin(2 * math.pi * q / n), zc + r * math.cos(2 * math.pi * q / n)) for q in range(n)] for a, r in ((21.43, 0.15), (21.60, 0.11), (21.72, 0.03))], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    cap = c.finish('chute_cap', sharp_deg=40); piv = P3(21.43, 0.0, zc + 0.15); _rel(cap, piv)
    PARTS['chute_cap'] = dict(pivot=piv.copy(), axis=Vector((-1, 0, 0)), range=(0.0, 100.0), note='крышка контейнера парашюта: шарнир сверху; плюс - откидывается вверх')
    return [box, cap]


# ── фонарь: козырёк неподвижен, две створки (лётчик и штурман) на задних шарнирах вверх (03, 05, 07) ──
CAN_A0, CAN_W, CAN_A1 = 5.27, 6.45, 7.60                          # 03 сбоку: фонарь почти вровень со спиной
CAN = Track([(5.27, 0.96), (5.80, 1.15), (6.45, 1.30), (7.00, 1.34), (7.46, 1.33), (7.60, 1.30)])
CAN_HW = Track([(5.27, 0.64), (6.45, 0.75), (7.00, 0.77), (7.60, 0.74)])
def can_ring(a, n=24, inset=0.0, sink=0.06, t0=0.0, t1=math.pi):
    top = CAN(a) - inset; hw = CAN_HW(a) - inset; base = fus_top(a, hw) - sink; pts = []
    for k in range(n + 1):
        th = t0 + (t1 - t0) * k / n; pts.append(P3(a, hw * math.cos(th), base + (top - base) * abs(math.sin(th)) ** 0.9))
    return pts
def canopy_shell(a0, a1, name, mat, th=0.010, sink=0.06, t0=0.0, t1=math.pi, step=0.06):
    rs = []
    for a in stations(a0, a1, step):
        o = can_ring(a, sink=sink, t0=t0, t1=t1); i_ = can_ring(a, inset=th, sink=sink, t0=t0, t1=t1); rs.append(o + i_[::-1])
    return loft_obj(name, rs, mat, sharp=60)
def hatches():
    """Две створки: правая (лётчик) и левая (штурман), каждая на своём заднем шарнире, открываются вверх. Стекло, рама - в деталях."""
    out = []
    for sx, t0, t1 in ((1, 0.0, math.pi / 2 - 0.03), (-1, math.pi / 2 + 0.03, math.pi)):                 # шов посередине 4 см
        nm = 'canopy_' + ('r' if sx > 0 else 'l'); ob = canopy_shell(CAN_W + 0.034, CAN_A1, nm, G_GLASS, sink=0.004, t0=t0, t1=t1, step=0.05)
        piv = P3(CAN_A1 + 0.08, sx * 0.40, CAN(CAN_A1) + 0.10); _rel(ob, piv)                       # шарнир выше и дальше: нижний задний угол не уходит в кабину и порог
        PARTS[nm] = dict(pivot=piv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 60.0), note='створка фонаря: задний шарнир поперёк; плюс - передний край вверх; рама canopy_frame_* - дочерняя')
        out.append(ob)
    return out
def canopy_fairing():
    a0, a1 = CAN_A1 + 0.025, 10.5; rs = []
    for a in stations(a0, a1, 0.12):
        t = _sm((a - a0) / (a1 - a0)); top = CAN(CAN_A1) * (1 - t) + (fus_top(a1) + 0.002) * t; hw = CAN_HW(CAN_A1) * (1 - t) + 0.30 * t
        base = fus_top(a, hw) - 0.08; n = 24; pts = [P3(a, hw * math.cos(math.pi * k / n), base + (top - base) * abs(math.sin(math.pi * k / n)) ** 0.9) for k in range(n + 1)]
        pts.append(P3(a, 0.0, base - 0.10)); rs.append(pts)
    return loft_obj('s_cfair', rs, sharp=50)


def build_skin():
    S = [fuselage(), intake(1), intake(-1), glove(1), glove(-1), dorsal(), canopy_fairing()]
    host = S[0]
    for o in S[1:]: _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        c = intake_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
        c = nozzle_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'SU_skin'; host.data.name = 'SU_skin'
    return host


def pose_wing(ob, deg, sx):
    """Повернуть консоль (с детьми) на deg от положения 16° (плюс - конец назад)."""
    D = PARTS[ob.name]; T = D['pivot']; ob.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, D['axis']) @ Matrix.Translation(-T) @ ob.matrix_world


def plane(stage=9, sweep=None):
    """Этапы: 1 - обшивка, наплыв, киль, стабилизатор, фонарь; 2 - консоли с механизацией, рули; 3 - кабина, детали, подвеска; 4 - шасси. sweep - поворот консолей от 16° (по умолчанию как в файле, 53°)."""
    PARTS.clear(); STATIONS.clear()
    skin = build_skin(); ref_me = skin.data.copy()
    out = [skin, fin(), pitot(), splitter(1), splitter(-1), stab(1), stab(-1), nozzle(1), nozzle(-1), nozzle_hood()] + vfins() + chute_box()
    out.append(canopy_shell(CAN_A0, CAN_W, 'canopy_glass', G_GLASS))
    cans = hatches(); out += cans
    vl = bpy.context.view_layer; WG = {}
    if stage >= 2:
        out.append(rudder())
        for sx in (1, -1):
            w_ = wing_panel(sx); WG[sx] = w_; out.append(w_)
            if SLOT_CUT: c = slot_cutter(sx, w_); _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
            import su_det as dt_
            kids = [flap(sx, 0), flap(sx, 1), slat(sx)] + spoilers(sx) + [dt_.swing_pylon(sx)]
            vl.update()
            for k_ in kids: mw = k_.matrix_world.copy(); k_.parent = w_; k_.matrix_world = mw
            out += kids
        dl = D_FILE if sweep is None else sweep
        vl.update()
        for sx in (1, -1): pose_wing(WG[sx], dl, sx)
        vl.update()
        for sx in (1, -1):                                                            # поворотные пилоны разворачиваются обратно - стоят по потоку
            p_ = bpy.data.objects['pyl_w_' + ('r' if sx > 0 else 'l')]; T = p_.matrix_world.translation.copy()
            p_.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(-dl), 4, Vector((0, 0, -sx))) @ Matrix.Translation(-T) @ p_.matrix_world
        vl.update()
    if stage >= 3:
        import su_det as dt
        bvh_ready(skin); out += dt.all_details(skin, cans)
    if stage >= 4:
        import su_gear as gr; out += gr.gear_all()
    resharp(skin); print('нормали обшивки:', smooth_normals(skin, ref_me)); bpy.data.meshes.remove(ref_me)
    to_true(out)
    return out


# ── единицы чертежа -> настоящие размеры. Линейка 03 даёт 48 пикс/м, но тогда длина, размах и высота на 4 % меньше настоящих (22,67; 17,64; 6,19);
# при 46,2 пикс/м совпадают все три и штанга ПВД чертежа. Форма строится в единицах чертежа (48 пикс/м, a от острия ПВД при штанге 1,69 м), затем
# всё равномерно масштабируется: a' = (a - SH_A) * SCL, x' = SCL x, z' = SCL z (штанга 0,87 м, общая длина 22,67 м).
SCL = 48.0 / 46.2; SH_A = 0.84
def TM():
    return Matrix.Translation(Vector((0.0, L / 2 * (1 - SCL) + SH_A * SCL, 0.0))) @ Matrix.Diagonal((SCL, SCL, SCL, 1.0))
def to_true(objs):
    M = TM(); vl = bpy.context.view_layer; vl.update()
    order = sorted(objs, key=lambda o: (0 if o.parent is None else 1 if o.parent.parent is None else 2))
    W0 = {o.name: o.matrix_world.copy() for o in objs}
    for o in order:
        mw = W0[o.name]; loc, rot, _ = mw.decompose(); nw = Matrix.Translation(M @ loc) @ rot.to_matrix().to_4x4()
        D = nw.inverted() @ M @ mw; o.data.transform(D); o.data.update()
    for o in order:
        mw = W0[o.name]; loc, rot, _ = mw.decompose(); nw = Matrix.Translation(M @ loc) @ rot.to_matrix().to_4x4(); o.matrix_world = nw; vl.update()
    for D in PARTS.values():
        D['pivot'] = M @ D['pivot']
    for k in list(STATIONS): STATIONS[k] = M @ STATIONS[k]
def A_TRUE(a): return (a - SH_A) * SCL

