# mg_geo.py - геометрия МиГ-27К для build.py (основа - МиГ-23БН, Свои/МиГ-23БН; Mark 2026-11-13). Метры. Blender: нос +Y, правое крыло +X, верх +Z (в glTF: нос -Z).
# a - от острия ПВД назад (0 ... 16,80 - концы стабилизатора); z - от оси сопла вверх, земля на z = -AX.
# Положения по длине и высоты - профиль чертежа 02 (33,8 пикс/м, согласован с фото 03, 07: заборник под задней частью фонаря); ширины и план - вид сверху 01
# (поперёк 27 пикс/м: чертёж 01 по размаху короче на 10 %, размах взят настоящий 13,97 м при 16° и 7,78 м при 72°). Нос БН «утиный», без РЛС (02, 06, 07).
# Консоли поворачиваются на вертикальных шарнирах (PIV): строятся при 16°, в файле - 72°. Чужие сетки и текстуры не используются.
import math
import bpy
from mathutils import Vector, Matrix
from modelkit import B
from _mg_base import *
from _mg_base import _sm, _apply_bool, _drop, _rel
import _mg_base as base

PARTS = base.PARTS; STATIONS = base.STATIONS


# ── фюзеляж: утиный нос (верх круто вниз к острию), кабина, гребень, хвост к соплу ──
# (a, верх z, низ z, полуширина, показатель верха, показатель низа)
FUS = [(1.530, -0.060, -0.420, 0.165, 2.3, 2.3), (1.573, -0.051, -0.470, 0.205, 2.3, 2.3), (1.800, -0.005, -0.474, 0.250, 2.3, 2.3), (2.300, 0.096, -0.481, 0.300, 2.2, 2.3), (2.900, 0.217, -0.491, 0.405, 2.3, 2.5), (3.600, 0.358, -0.502, 0.470, 2.4, 2.6), (4.400, 0.520, -0.514, 0.530, 2.5, 2.8),   # ревизия 2 (Mark): нос ещё короче (торец 1,53), верх - ровная прямая от торца до козырька, низ - прямая
       (5.40, 0.600, -0.530, 0.570, 2.6, 3.0), (6.40, 0.720, -0.530, 0.600, 2.6, 3.0),
       (8.00, 0.820, -0.530, 0.640, 2.6, 3.0), (9.50, 0.870, -0.520, 0.680, 2.6, 3.0), (10.80, 0.860, -0.510, 0.690, 2.6, 3.0), (12.20, 0.800, -0.490, 0.660, 2.5, 2.9),
       (13.60, 0.700, -0.480, 0.610, 4.0, 2.9), (14.80, 0.600, -0.475, 0.555, 4.0, 2.6), (15.60, 0.590, -0.470, 0.505, 3.8, 2.2), (15.97, 0.575, -0.470, 0.485, 3.0, 2.0)]   # борта у стабилизатора ровнее: корень прилегает (Mark)
FT = tracks(FUS); A_TAIL = 15.97


def fus_top(a, x=0.0):
    top, bot, hw, nt = FT[0](a), FT[1](a), FT[2](a), FT[3](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = min(0.999, abs(x) / max(hw, 1e-6)); return cy + ht * (1 - q ** nt) ** (1 / nt)


def fus_bot(a, x=0.0):
    top, bot, hw, nb = FT[0](a), FT[1](a), FT[2](a), FT[4](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = min(0.999, abs(x) / max(hw, 1e-6)); return cy - ht * (1 - q ** nb) ** (1 / nb)


NOSE_A0, NOSE_RAKE = 1.53, 0.20                                     # ревизия 2 (Mark): торец носа скошен - верх впереди, низ у ПВД на 0,20 м назад (рисунок 09)
def nose_rake(v):
    """Сдвиг точки носа назад: тем больше, чем ниже точка (от верха торца к низу), и сходит на нет к 0,40 м за торцом."""
    a = L / 2 - v.y; w = max(0.0, 1.0 - (a - NOSE_A0) / 0.40); top, bot = FT[0](NOSE_A0), FT[1](NOSE_A0)
    t = min(1.0, max(0.0, (top - v.z) / (top - bot))); return Vector((v.x, v.y - NOSE_RAKE * t * w, v.z))
def rake_at(z):
    top, bot = FT[0](NOSE_A0), FT[1](NOSE_A0); return NOSE_RAKE * min(1.0, max(0.0, (top - z) / (top - bot)))
def fuselage():
    n = 64; rs = []
    for a in [NOSE_A0 + d for d in (0.0, 0.005, 0.015, 0.04, 0.12, 0.22, 0.32)] + stations(NOSE_A0 + 0.42, A_TAIL, 0.16):
        top, bot, hw, nt, nb = FT[0](a), FT[1](a), FT[2](a), FT[3](a), FT[4](a); r = sup(a, 0.0, top, bot, hw, nt, nb, n)
        if a < NOSE_A0 + 0.40: r = [nose_rake(v) for v in r]
        rs.append(r)
    return loft_obj('s_fus', rs, sharp=50)


def pitot():
    """ПВД МиГ-27К (Mark: на правом борту, вросший в корпус): длинная тонкая штанга у нижнего края окна «Кайры», вперёд и на 7° наружу;
    основание - обтекатель, который начинается внутри обшивки и плавно сужается в штангу (без стакана «на клею»)."""
    b = B(); n = 16; zb = -0.245; a_b = NOSE_A0 + rake_at(zb) + 0.30
    p0 = P3(a_b, 0.0, zb); p0.x = side_x_nose(a_b, zb) - 0.045                       # ось начинается в обшивке
    d = Vector((math.sin(math.radians(7.0)), 1.0, -0.02)).normalized(); u = d.cross(Vector((0, 0, 1))).normalized(); v = d.cross(u)
    ring = lambda t, r: [p0 + d * t + (u * math.sin(2 * math.pi * q / n) + v * math.cos(2 * math.pi * q / n)) * r for q in range(n)]
    fair = [(0.0, 0.034), (0.12, 0.036), (0.24, 0.031), (0.34, 0.024), (0.42, 0.018), (0.48, 0.0145)]          # обтекатель - обшивка (крашеный), сходит в штангу
    b.loft([ring(t, r) for t, r in fair], G_SKIN, cap0=G_SKIN)
    pr = [(0.47, 0.0145), (0.60, 0.013), (1.30, 0.012), (1.33, 0.018), (1.44, 0.018), (1.48, 0.009), (1.52, 0.003)]   # штанга и приёмник - металл
    b.loft([ring(t, r) for t, r in pr], G_METAL, cap1=G_METAL)
    ob = b.finish('det_pitot', sharp_deg=40)
    for p in ob.data.polygons: p.use_smooth = True
    return ob
def side_x_nose(a, z):
    top, bot, hw, nt, nb = FT[0](a), FT[1](a), FT[2](a), FT[3](a), FT[4](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = min(0.999, abs(z - cy) / max(ht, 1e-6)); n_ = nt if z >= cy else nb; return hw * (1 - q ** n_) ** (1 / n_)


# ── воздухозаборники: прямоугольные со скруглёнными углами, срез с наклоном (верх впереди), отбойник отдельно (03, 07) ──
A_INT = 5.56; INT_X = (0.68, 1.20); INT_Z = (-0.30, 0.64)
def dsec(a, cx, zc, hw, hz, n=48, e_in=12.0, e_out=2.4):
    """Сечение «как у F-4»: внутренняя сторона (меньший x) - ровная стенка с малыми скруглениями, наружная половина скруглена. Начало снизу, против часовой при виде спереди справа."""
    pts = []
    for q in range(n):
        th = -math.pi / 2 + 2 * math.pi * q / n; c, s_ = math.cos(th), math.sin(th); e = e_out if c > 0 else e_in
        pts.append(P3(a, cx + hw * math.copysign(abs(c) ** (2 / e), c), zc + hz * math.copysign(abs(s_) ** (2 / e), s_)))
    return pts
def duct_ring(sx, a, k=1.0, n=48):
    t = max(0.0, a - A_INT); fo = _sm(t / 5.5)
    xi = INT_X[0]; xo = INT_X[1] - 0.48 * fo; zt = INT_Z[1] - 0.10 * fo; zb = INT_Z[0] + 0.12 * fo
    cx = (xi + xo) / 2 - 0.10 * fo; hw = (xo - xi) / 2 * k + 0.10 * fo
    return [Vector((sx * v.x, v.y, v.z)) for v in dsec(a, cx, (zt + zb) / 2, hw, (zt - zb) / 2 * k, n)]
def intake(sx):
    rs = []
    for a in [A_INT - 0.04, A_INT - 0.02, A_INT] + stations(A_INT + 0.12, 11.8, 0.25):
        k = 0.94 + 0.06 * _sm((a - (A_INT - 0.04)) / 0.04)
        r = duct_ring(sx, a, k); rake = 0.30                                           # срез наклонён: верх на 0,30 м впереди низа
        r = [Vector((v.x, v.y + rake * (v.z - INT_Z[0]) / (INT_Z[1] - INT_Z[0]) * (1 - _sm((a - A_INT) / 0.5)), v.z)) for v in r]
        rs.append(r if sx > 0 else r[::-1])
    return loft_obj('s_duct', rs, sharp=40)
def intake_cut(sx):
    b = B(); n = 40
    prof = [(-0.40, 1.00, G_DUCT), (0.02, 1.00, G_DUCT), (0.60, 0.92, G_DUCT), (1.60, 0.80, G_DARK), (1.70, 0.10, G_DARK)]
    rings = []
    for da, k, _ in prof:
        cx, hw, zc, hz = (INT_X[0] + INT_X[1]) / 2, (INT_X[1] - INT_X[0]) / 2 - 0.05, (INT_Z[0] + INT_Z[1]) / 2, (INT_Z[1] - INT_Z[0]) / 2 - 0.05
        r = dsec(A_INT + da, cx, zc, hw * k, hz * k, n)
        r = [Vector((sx * v.x, v.y + 0.30 * (v.z - INT_Z[0]) / (INT_Z[1] - INT_Z[0]), v.z)) for v in r]
        rings.append(r if sx > 0 else r[::-1])
    b.loft(rings, [m for _, _, m in prof[1:]], cap0=G_DUCT, cap1=G_DARK); return b.finish('c_inl', sharp_deg=30)
def splitter(sx):
    """Отбойник пограничного слоя: плита у внутренней кромки заборника, выступает вперёд (03, 07)."""
    b = B(); x = sx * (INT_X[0] - 0.035); a0, a1 = A_INT - 0.55, A_INT + 1.20; zb, zt = INT_Z[0] - 0.02, INT_Z[1] + 0.03
    rg = lambda a, h: [P3(a, x - 0.012, zb), P3(a, x + 0.012, zb), P3(a, x + 0.012, zt + h), P3(a, x - 0.012, zt + h)]
    b.loft([rg(a0, -0.25), rg(a0 + 0.30, 0.0), rg(a1, 0.0)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for a in (A_INT + 0.3, A_INT + 0.9):
        for zz in (zb + 0.2, zt - 0.2): strut(b, P3(a, x, zz), P3(a, sx * (fus_hw(a) - 0.02), zz * 0.8), 0.015, G_SKIN, 8)
    return b.finish('det_split_' + ('r' if sx > 0 else 'l'), sharp_deg=40)
def fus_hw(a): return FT[2](a)


# ── наплыв (неподвижная часть крыла) и поворотные консоли ──
WZ = 0.56                                                           # плоскость хорд наплыва и крыла (высокоплан, 02)
PIV = (9.55, 1.70)                                                  # шарнир консоли: a, x
SW0, SW1 = 16.0, 72.0                                               # стреловидность передней кромки: вперёд и сложено (в файле)
D_FILE = SW1 - SW0                                                  # поворот консоли в файле от положения 16°
GLOVE = dict(le0=(5.80, 1.12), tip=(8.95, 2.05), te0=(11.40, 0.95))          # МиГ-27К: наплыв у корня больше (01 сверху)
def g_le(x): (a0, x0), (a1, x1) = GLOVE['le0'], GLOVE['tip']; return a0 + (x - x0) * (a1 - a0) / (x1 - x0)
def g_te(x): (a0, x0), (a1, x1) = GLOVE['te0'], GLOVE['tip']; return a0 + (x - x0) * (a1 - a0) / (x1 - x0) + 0.06
def glove(sx):
    """Наплыв толстым профилем (у шарнира толще консоли: она ходит внутри щели), к углу сходит на нет."""
    rs = []
    for x in [0.50, 0.80, 1.00, 1.20, 1.40, 1.60, 1.80, 1.92, 2.00, 2.03]:
        le = g_le(max(x, 1.20)) if x >= 1.2 else g_le(1.2) - (1.2 - x) * 0.6; te = g_te(max(x, 0.95)); c = te - le
        t = (0.135 * (1 - _sm((x - 1.93) / 0.11)) + 0.012)                           # у шарнира толще консоли: она ходит внутри щели, щель выходит в кромку наплыва
        rs.append(foil_ring(le, c, t / c / 0.6, 0.0006, 1.0, 30, lambda a, h, x=x: P3(a, sx * x, WZ + h), tail=cove_wall(le, c, t / c / 0.6, 1.0), head=cove_wall_f(le, c, t / c / 0.6, 0.0006)))
    rs = [[_over_slot(v) for v in r] for r in rs]                                  # наплыв не тоньше щели: щель внутри, сверху и снизу обшивка (иначе сквозная дыра у корня)
    if sx < 0: rs = [r[::-1] for r in rs]
    return loft_obj('s_glove', rs, sharp=50)


def slot_half(a, lat):
    """Половина толщины, которую консоль занимает в точке (a, lat) за весь ход 16…72°, плюс зазор щели и обшивка; с плавным спадом 0,15 м за краем."""
    best = 0.0
    for k in range(0, int(D_FILE) + 1, 2):
        r = math.radians(k); dx = lat - PIV[1]; da = a - PIV[0]
        s = dx * math.cos(r) + da * math.sin(r); d = -dx * math.sin(r) + da * math.cos(r)    # точку поворачиваем назад к положению 16°
        sc = min(max(s, -0.52), 2.60); le = w_le(sc); te = w_te(sc); dc = min(max(d, le), te)
        e = math.hypot(s - sc, d - dc); w = 1 - _sm(e / 0.15)
        if w <= 0: continue
        c = te - le; h = (w_tc(sc) * c * thk((dc - le) / c) + 0.015 + 0.008) * w
        best = max(best, h)
    return best
def _over_slot(v):
    dz = v.z - WZ; h = slot_half(L / 2 - v.y, abs(v.x))
    if h <= abs(dz): return v
    return Vector((v.x, v.y, WZ + math.copysign(h, dz if abs(dz) > 1e-9 else 1.0)))


# консоль в своей системе при 16°: s - вдоль размаха от шарнира, d - назад от шарнира
S_TIP = 5.29; LE_D0 = -0.59; TE_D0 = 1.93; TE_DT = 1.900; X_MIN = 0.42            # внешняя часть задней кромки почти прямая поперёк (чертёж 08, Mark: консоль уже), хорда на конце 0,97 м
TE_IN = (1.664, 0.1115)                                             # внутренняя часть кромки к корню уходит вперёд (чертёж 08): d = TE_IN[0] + TE_IN[1] * s
R_LE, R_TE = 0.34, 0.22                                             # скругление углов законцовки в плане (реф. Mark)
def _round(s, r): q = s - (S_TIP - r); return r - math.sqrt(max(0.0, r * r - q * q)) if q > 0 else 0.0
def _smin(a, b, k): h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25
def w_le(s): return LE_D0 + s * math.tan(math.radians(SW0)) + _round(s, R_LE)
def w_te_raw(s): return _smin(TE_D0 + (TE_DT - TE_D0) * s / S_TIP, TE_IN[0] + TE_IN[1] * s, 0.06) - _round(s, R_TE)
def w_te(s):
    """Задняя кромка с подрезкой у корня: при 72° консоль не заходит к оси ближе X_MIN (дальше - щель в борту), угол подрезки скруглён."""
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
def w_tc(s): return 0.062 - 0.016 * min(1.0, max(0.0, s) / S_TIP)
def wl(sx, s, d, z): return Vector((sx * (PIV[1] + s), Yb(PIV[0] + d), z))        # точка консоли при 16° в осях мира
FLAPS = [(2.62, 3.70), (3.76, 4.92)]; FL_C = 0.28
SLAT = (2.05, 4.90); SL_C = 0.16                                      # носок кончается до скругления законцовки
SPOIL = [(1.50, 2.80), (2.90, 4.10)]
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
    ss = sorted(set(round(v, 4) for v in [-0.45, -0.30, -0.10, 0.10, 0.40, 0.80, 1.20] + stations(1.4, S_TIP - 0.40, 0.30) + stations(S_TIP - 0.40, S_TIP - 0.04, 0.04) + k + [S_TIP - 0.02, S_TIP]))
    rs = []
    for s in ss:
        r = wsec(sx, s)
        if s > S_TIP - 0.13:                                                           # законцовка: толщина к нулю
            q = (s - (S_TIP - 0.13)) / 0.13; f = math.sqrt(max(0.0, 1 - q * q)) * 0.97 + 0.03
            r = [Vector((v.x, v.y, WZ + (v.z - WZ) * f)) for v in r]
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


def slot_cutter(sx, wing=None, cell=0.06):
    """Щель в наплыве и борту - один замкнутый объём по сетке 6 см: в плане - всё, что корень консоли заметает за ход 16…72°, по высоте - наибольшая толщина консоли в этой точке плюс 1,5 см.
    Раньше - объединение 29 копий профиля: обшивка росла с 20 до 94 тыс. треугольников. Стенки щели внутри наплыва и борта, снаружи видно только отверстие."""
    import bmesh
    a0, a1 = PIV[0] - 1.05, PIV[0] + 2.70; l0, l1 = X_MIN - 0.08, PIV[1] + 2.75
    na = int(math.ceil((a1 - a0) / cell)) + 1; nl = int(math.ceil((l1 - l0) / cell)) + 1
    H = [[None] * nl for _ in range(na)]; IN = [[False] * nl for _ in range(na)]
    for i in range(na):
        for j in range(nl):
            a = a0 + i * cell; lat = l0 + j * cell; best = -1.0; ins = False
            for k in range(0, int(D_FILE) + 1, 2):
                r = math.radians(k); dx = lat - PIV[1]; da = a - PIV[0]
                s = dx * math.cos(r) + da * math.sin(r); d = -dx * math.sin(r) + da * math.cos(r)
                sc = min(max(s, -0.52), 2.60); le = w_le(sc) - 0.012; te = w_te(sc) + 0.012; dc = min(max(d, le), te)
                c = te - le; h = w_tc(sc) * c * thk(min(max((dc - le) / c, 0.0), 1.0)) + 0.015
                e = math.hypot(s - sc, d - dc)
                if e < 1e-9: ins = True
                if e < cell * 1.6: best = max(best, h)
            IN[i][j] = ins; H[i][j] = best
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
                            if H[pi][pj] <= 0: H[pi][pj] = 0.02
                        C[ii][jj] = True
                    ch = True
        if not ch: break
    bm = bmesh.new(); VT = {}; VB = {}
    def vt(i, j):
        if (i, j) not in VT:
            a = a0 + i * cell; lat = l0 + j * cell; h = max(H[i][j], 0.02)
            VT[(i, j)] = bm.verts.new(P3(a, sx * lat, WZ + h)); VB[(i, j)] = bm.verts.new(P3(a, sx * lat, WZ - h))
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


# ── киль, руль, гребень у основания, подфюзеляжный гребень (складной), стабилизатор цельноповоротный ──
FZ0, FZ1 = 0.55, 2.57
def FLE(z): return 11.62 + (15.47 - 11.62) * (z - 0.78) / (FZ1 - 0.78)
def FTE(z): return 15.86 + (16.06 - 15.86) * (z - 0.78) / (FZ1 - 0.78)
RUD = (0.95, 2.30); RUD_C = 0.55
def FTC(z): return 0.060 - 0.018 * (z - FZ0) / (FZ1 - FZ0)
def fin():
    zs = sorted(set(stations(FZ0, FZ1 - 0.06, 0.14) + [RUD[0] - 0.003, RUD[0], RUD[1], RUD[1] + 0.003] + [RUD[0] + (RUD[1] - RUD[0]) * i / 8 for i in range(1, 8)] + [FZ1 - 0.03, FZ1]))
    rings = []
    for z in zs:
        le, te = FLE(z), FTE(z); c = te - le; tc = FTC(z)
        if RUD[0] - 1e-6 <= z <= RUD[1] + 1e-6: ue, tail = cove_cut(le, c, tc, te - RUD_C, 0.006)
        else: ue, tail = 1.0, cove_wall(le, c, tc, 1.0)
        rings.append(foil_ring(le, c, tc, 0.0006, ue, 26, lambda a, h, z=z: P3(a, h, z), tail=tail, head=cove_wall_f(le, c, tc, 0.0006)))
    return loft_obj('fin_c', rings, sharp=50)
def dorsal():
    rs = []
    for z, a0 in ((0.70, 9.40), (0.86, 9.80), (0.98, 10.60), (1.10, 11.40), (1.20, 11.90)):
        a1 = FLE(1.25) + 1.5; c = a1 - a0; rs.append(foil_ring(a0, c, 0.10 / c, 0.0006, 1.0, 18, lambda a, h, z=z: P3(a, h, z), tail=cove_wall(a0, c, 0.10 / c, 1.0), head=cove_wall_f(a0, c, 0.10 / c, 0.0006)))
    return loft_obj('s_dors', rs, sharp=50)
def rudder():
    z0, z1 = RUD[0] + 0.006, RUD[1] - 0.006; pv0 = P3(FTE(z0) - RUD_C, 0.0, z0); pv1 = P3(FTE(z1) - RUD_C, 0.0, z1); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    rings = []
    for j in range(9):
        z = z0 + (z1 - z0) * j / 8; le, te = FLE(z), FTE(z); c = te - le; ah = te - RUD_C
        rings.append([v - pivot for v in foil_ring(le, c, FTC(z), (ah - le) / c, 1.0, 10, lambda a, h, z=z: P3(a, h, z), head=cove_nose(le, c, FTC(z), ah))])
    ob = loft_obj('rudder', rings, sharp=48); ob.location = pivot
    PARTS['rudder'] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-25.0, 25.0), note='руль направления: ось в центре круглого носа')
    return ob
VF = dict(a0=13.55, a1=15.00, zb=-1.36, tip=0.00)                   # подфюзеляжный гребень: передняя кромка у корня, задняя, низ
def ventral():
    rs = []
    for z in (-0.485, -0.50, -0.80, -1.10, VF['zb']):
        t = (-0.485 - z) / (-0.485 - VF['zb']); le = VF['a0'] + 0.55 * t ** 0.9; te = VF['a1'] + 0.05 * (1 - t); c = te - le
        rs.append(foil_ring(le, c, 0.05, 0.0006, 1.0, 18, lambda a, h, z=z: P3(a, h, z), tail=cove_wall(le, c, 0.05, 1.0), head=cove_wall_f(le, c, 0.05, 0.0006)))
    ob = loft_obj('ventral', rs, sharp=50); hz = -0.497; piv = P3((VF['a0'] + VF['a1']) / 2, 0.034, hz)                  # ось у правой кромки корня, чуть ниже обшивки; _rel(ob, piv)
    PARTS['ventral'] = dict(pivot=piv.copy(), axis=Vector((0, -1, 0)), range=(0.0, 90.0), gear=90.0, note='подфюзеляжный гребень: ось вдоль корня; плюс - складывается вправо (низ уходит к правому борту); в файле шасси сложен на 90°, в основном стоит')
    return ob
STZ = 0.42; ST_PIV = 15.20; NOZ_R = 0.47
def SLE(x): return 13.80 + (15.95 - 13.80) * (x - 0.60) / (2.94 - 0.60)
def STE(x): return 16.30 + (16.80 - 16.30) * (x - 0.60) / (2.94 - 0.60)
def side_x(a, z):
    """Полуширина фюзеляжа на высоте z в сечении a (суперэллипс FUS)."""
    top, bot, hw, nt, nb = FT[0](a), FT[1](a), FT[2](a), FT[3](a), FT[4](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = min(0.999, abs(z - cy) / max(ht, 1e-6)); n_ = nt if z >= cy else nb; return hw * (1 - q ** n_) ** (1 / n_)
def root_x(a, z, gap=0.012):
    """Корень стабилизатора: ближе всего к борту (и соплу), но без касания при отклонении -15...+15° вокруг шарнира (как у Су-24М)."""
    best = 0.0
    for k in range(-10, 11):
        t = math.radians(1.5 * k); da, dz = a - ST_PIV, z - STZ
        a2 = ST_PIV + da * math.cos(t) - dz * math.sin(t); z2 = STZ + da * math.sin(t) + dz * math.cos(t)
        xs = side_x(min(a2, A_TAIL), z2) if a2 <= A_TAIL + 0.05 else 0.0
        if a2 > A_TAIL - 0.12 and abs(z2) < NOZ_R + 0.02: xs = max(xs, math.sqrt(max(0.0, (NOZ_R + 0.02) ** 2 - z2 * z2)))
        best = max(best, xs)
    return best + gap
def stab(sx):
    """Mark: стабилизатор не висит в воздухе - корень идёт по огибающей борта на всём ходе ±15°, торец сходится на среднюю линию (без плоской крышки)."""
    rs = []
    for x in ['cap', None] + stations(0.72, 2.84, 0.18) + [2.90, 2.94]:                    # у корня задняя кромка не свисает за срез хвоста (min с A_TAIL)
        xr = 0.52 if x in ('cap', None) else x; le, te = SLE(xr), min(STE(xr), A_TAIL - 0.02 + max(0.0, xr - 0.60) * 1.2); c = te - le; k = max(0.0, (xr - 2.84) / 0.10); f = math.sqrt(max(0.0, 1 - k * k)) * 0.97 + 0.03
        if x == 'cap': place = lambda a, h: P3(a, sx * root_x(a, STZ), STZ)
        elif x is None: place = lambda a, h: P3(a, sx * root_x(a, STZ + h), STZ + h)
        else: place = lambda a, h, x=x, f=f: P3(a, sx * x, STZ + h * f)
        r = foil_ring(le, c, 0.045, 0.0006, 1.0, 22, place, tail=cove_wall(le, c, 0.045, 1.0), head=cove_wall_f(le, c, 0.045, 0.0006))
        rs.append(r if sx > 0 else r[::-1])
    nm = 'stab_' + ('r' if sx > 0 else 'l'); ob = loft_obj(nm, rs, cap0=False, sharp=50); piv = P3(ST_PIV, sx * 0.30, STZ); _rel(ob, piv)
    PARTS[nm] = dict(pivot=piv.copy(), axis=Vector((-1, 0, 0)), range=(-15.0, 15.0), note='половина цельноповоротного стабилизатора: ось поперёк; плюс - передняя кромка вниз; половины ходят вместе (тангаж) и врозь (крен)')
    return ob


# ── сопло регулируемое, контейнер парашюта ──
def nozzle():
    """Створки сопла: кольцо из 16 лепестков за срезом фюзеляжа, внутри тёмный канал (05)."""
    b = B(); n = 64; a0 = A_TAIL
    pr = [(-0.10, NOZ_R + 0.005), (0.04, NOZ_R), (0.15, NOZ_R - 0.035), (0.17, NOZ_R - 0.055), (0.10, NOZ_R - 0.075), (-0.40, NOZ_R - 0.12)]   # МиГ-27К: сопло короткое, упрощённое (08)
    rings = []
    for da, r in pr:
        rings.append([P3(a0 + da, (r + 0.008 * (q % 4 == 0)) * math.sin(2 * math.pi * q / n), (r + 0.008 * (q % 4 == 0)) * math.cos(2 * math.pi * q / n)) for q in range(n)])
    b.loft(rings, [G_METAL, G_METAL, G_METAL, G_DARK, G_DARK], cap1=G_DARK)
    ob = b.finish('nozzle', sharp_deg=30); piv = P3(a0, 0.0, 0.0); _rel(ob, piv)
    PARTS['nozzle'] = dict(pivot=piv.copy(), axis=Vector((0, -1, 0)), range=(0.85, 1.0), kind='scale', note='регулируемое сопло: масштаб створок поперёк оси (0,85 - бесфорсажный, 1,0 - форсаж); центр - срез сопла')
    return ob
def chute_box():
    """Контейнер тормозного парашюта под рулём над соплом (05): цилиндр с крышкой (крышка - отдельная часть)."""
    b = B(); n = 24; zc = 0.62
    pr = [(15.30, 0.05), (15.45, 0.15), (15.70, 0.17), (16.55, 0.16), (16.62, 0.15)]
    b.loft([[P3(a, r * math.sin(2 * math.pi * q / n), zc + r * math.cos(2 * math.pi * q / n)) for q in range(n)] for a, r in pr], G_SKIN, cap0=G_SKIN, cap1=G_DARK)
    box = b.finish('det_chute', sharp_deg=40)
    c = B(); c.loft([[P3(a, r * math.sin(2 * math.pi * q / n), zc + r * math.cos(2 * math.pi * q / n)) for q in range(n)] for a, r in ((16.63, 0.15), (16.70, 0.12), (16.73, 0.05))], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    cap = c.finish('chute_cap', sharp_deg=40); piv = P3(16.63, 0.0, zc + 0.15); _rel(cap, piv)
    PARTS['chute_cap'] = dict(pivot=piv.copy(), axis=Vector((-1, 0, 0)), range=(0.0, 100.0), note='крышка контейнера парашюта: шарнир сверху; плюс - откидывается вверх')
    return [box, cap]


def nozzle_cut():
    n = 48; b = B(); a0 = A_TAIL
    rings = [[P3(a0 + da, r * math.sin(2 * math.pi * q / n), r * math.cos(2 * math.pi * q / n)) for q in range(n)] for da, r in ((0.2, NOZ_R - 0.10), (-0.6, NOZ_R - 0.10), (-0.65, 0.05))]
    b.loft(rings, G_DARK, cap0=G_DARK, cap1=G_DARK); return b.finish('c_noz', sharp_deg=30)


# ── фонарь: козырёк неподвижен, фонарь на заднем шарнире вверх (07) ──
CAN_A0, CAN_W, CAN_A1 = 4.02, 4.62, 6.30
CAN = Track([(4.02, 0.50), (4.30, 0.68), (4.62, 0.82), (5.10, 0.88), (5.70, 0.86), (6.30, 0.80)])
CAN_HW = Track([(4.02, 0.36), (4.62, 0.40), (5.50, 0.42), (6.30, 0.40)])
def can_ring(a, n=24, inset=0.0, sink=0.06):
    top = CAN(a) - inset; hw = CAN_HW(a) - inset; base = fus_top(a, hw) - sink; pts = []
    for k in range(n + 1):
        th = math.pi * k / n; pts.append(P3(a, hw * math.cos(th), base + (top - base) * abs(math.sin(th)) ** 0.9))
    return pts
def canopy_shell(a0, a1, name, mat, th=0.010, sink=0.06):
    rs = []
    for a in stations(a0, a1, 0.06):
        o = can_ring(a, sink=sink); i_ = can_ring(a, inset=th, sink=sink); rs.append(o + i_[::-1])
    return loft_obj(name, rs, mat, sharp=60)
WIN_A = (CAN_W + 0.10, 5.95)                                          # боковые окна откидной части: от-до по длине
WIN_TH = (1.32, 0.40)                                                 # верхний край окна: угол от борта спереди и сзади (опускается к хвосту)
WIN_B = 0.16                                                          # нижний край окна: ровный, угол от борта
def win_top(a):
    t = min(1.0, max(0.0, (a - WIN_A[0]) / (WIN_A[1] - WIN_A[0]))); return WIN_TH[0] + (WIN_TH[1] - WIN_TH[0]) * t
def hood_ring(a, inset=0.0, sink=0.004):
    """Сечение колпака: вершины ровно на нижнем и верхнем крае окна (край не ступенчатый)."""
    top = CAN(a) - inset; hw = CAN_HW(a) - inset; base = fus_top(a, hw) - sink; tb, tt = WIN_B, win_top(a)
    lin = lambda u, v, k: [u + (v - u) * i / k for i in range(1, k + 1)]
    th = [0.0, tb * 0.5, tb] + lin(tb, tt, 6) + lin(tt, math.pi / 2, 5); th = th + [math.pi - t for t in reversed(th[:-1])]
    return [P3(a, hw * math.cos(t), base + (top - base) * abs(math.sin(t)) ** 0.9) for t in th], th
def canopy_hood(a0, a1, name, sink=0.004, th=0.010):
    """Откидная часть фонаря (07, реф. Mark): металлический колпак, по бокам стёкла - низ прямой, верх к хвосту опускается."""
    st = sorted(set([round(v, 4) for v in stations(a0, a1, 0.05) + list(WIN_A)])); rs = []
    for a in st:
        o, _ = hood_ring(a, sink=sink); i_, _ = hood_ring(a, inset=th, sink=sink); rs.append(o + i_[::-1])
    b = B(); b.loft(rs, G_SKIN, cap0=G_SKIN, cap1=G_SKIN); m = len(rs[0]); h = m // 2
    ob = b.finish(name, sharp_deg=60); me = ob.data
    _, ths = hood_ring(a0); gl = {j for j in range(len(ths) - 1) if ths[j] >= WIN_B - 1e-6 and ths[j + 1] <= ths[8] + 1e-6}            # полосы окна справа (индексы 2..8)
    gl |= {len(ths) - 2 - j for j in gl}                                                                                         # и слева
    gl |= {m - 2 - j for j in list(gl)}                                                                                          # внутренняя сторона
    # грани окна - по номерам полос кольца (номер полосы = индекс первой вершины в кольце)
    for p in me.polygons:
        c = p.center; a = L / 2 - c.y
        if not (WIN_A[0] + 1e-4 < a < WIN_A[1] - 1e-4) or len(p.vertices) != 4: continue
        js = sorted(v % m for v in p.vertices); j = js[0] if js[-1] - js[0] == 1 else js[-1]
        if j in gl: p.material_index = G_GLASS
    for p in me.polygons:                                                                                                         # изнутри колпак тёмный, как кабина (светлая изнанка видна в окно листом поперёк кабины)
        if p.material_index != G_GLASS and len(p.vertices) == 4 and all(v % m >= h for v in p.vertices): p.material_index = G_COCK
    return ob


def canopy_fairing():
    a0, a1 = CAN_A1 + 0.025, 8.6; rs = []
    for a in stations(a0, a1, 0.10):
        t = _sm((a - a0) / (a1 - a0)); top = CAN(CAN_A1) * (1 - t) + (fus_top(a1) + 0.002) * t; hw = CAN_HW(CAN_A1) * (1 - t) + 0.20 * t
        base = fus_top(a, hw) - 0.08; n = 24; pts = [P3(a, hw * math.cos(math.pi * k / n), base + (top - base) * abs(math.sin(math.pi * k / n)) ** 0.9) for k in range(n + 1)]
        pts.append(P3(a, 0.0, base - 0.10)); rs.append(pts)
    return loft_obj('s_cfair', rs, sharp=50)


def build_skin():
    S = [fuselage(), intake(1), intake(-1), glove(1), glove(-1), dorsal(), canopy_fairing()]
    host = S[0]
    for o in S[1:]: _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        c = intake_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = nozzle_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'MG_skin'; host.data.name = 'MG_skin'
    return host


def pose_wing(ob, deg, sx):
    """Повернуть консоль (с детьми) на deg от положения 16° (плюс - конец назад)."""
    D = PARTS[ob.name]; T = D['pivot']; ob.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, D['axis']) @ Matrix.Translation(-T) @ ob.matrix_world


def plane(stage=9, sweep=None):
    """Этапы: 1 - обшивка, наплыв, киль, стабилизатор, фонарь; 2 - консоли с механизацией, рули, щитки; 3 - кабина, детали, подвеска; 4 - шасси. sweep - поворот консолей от 16° (по умолчанию как в файле, 56°)."""
    PARTS.clear(); STATIONS.clear()
    skin = build_skin(); ref_me = skin.data.copy()
    out = [skin, fin(), pitot(), splitter(1), splitter(-1), stab(1), stab(-1), ventral(), nozzle()] + chute_box()
    out.append(canopy_shell(CAN_A0, CAN_W, 'canopy_glass', G_GLASS))
    can = canopy_hood(CAN_W + 0.034, CAN_A1, 'canopy'); out.append(can)
    vl = bpy.context.view_layer; WG = {}
    if stage >= 2:
        out.append(rudder())
        for sx in (1, -1):
            w_ = wing_panel(sx); WG[sx] = w_; out.append(w_)
            c = slot_cutter(sx, w_); _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
            kids = [flap(sx, 0), flap(sx, 1), slat(sx)] + spoilers(sx)
            vl.update()
            for k_ in kids: mw = k_.matrix_world.copy(); k_.parent = w_; k_.matrix_world = mw
            out += kids
        dl = D_FILE if sweep is None else sweep
        vl.update()
        for sx in (1, -1): pose_wing(WG[sx], dl, sx)
        vl.update()
    if stage >= 3:
        import mg_det as dt
        bvh_ready(skin); out += dt.all_details(skin, can)
    if stage >= 4:
        import mg_gear as gr; out += gr.gear_all()
    resharp(skin); print('нормали обшивки:', smooth_normals(skin, ref_me)); bpy.data.meshes.remove(ref_me)
    to_true(out)
    return out


# ── масштаб: длина как у прежней модели игры (17,08 м с ПВД), форма строится в размерах МиГ-23БН ──
SCL = 17.08 / L
def TM(): return Matrix.Diagonal((SCL, SCL, SCL, 1.0))
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
def A_TRUE(a): return a * SCL
