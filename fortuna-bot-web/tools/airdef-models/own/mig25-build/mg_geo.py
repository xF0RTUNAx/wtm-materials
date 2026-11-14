# mg_geo.py - геометрия МиГ-25БМ для build.py (своя, по чертежу 01 Mark: 33,4 пикс/м, масштаб по размаху 14,02 м). Метры. Blender: нос +Y, правое крыло +X, верх +Z.
# a - от острия ПВД назад; z - от оси сопел вверх, земля на z = -AX. Нос - как у РБ/БМ: длинный конус с тёмным диэлектрическим наконечником и ПВД (ЗАДАНИЕ.md).
# Чужие сетки и текстуры не используются.
import math
import bpy
from mathutils import Vector, Matrix
from modelkit import B
from _mg_base import *
from _mg_base import _sm, _apply_bool, _drop, _rel
import _mg_base as base

PARTS = base.PARTS; STATIONS = base.STATIONS

# ── фюзеляж: длинный нос-конус, кабина, узкая средняя часть между заборниками, широкая хвостовая часть с двумя двигателями (01 сбоку и сверху) ──
# (a, верх z, низ z, полуширина, показатель верха, показатель низа)
FUS = [(0.97, -0.455, -0.505, 0.020, 2.0, 2.0), (1.30, -0.370, -0.585, 0.095, 2.0, 2.0), (2.00, -0.215, -0.680, 0.205, 2.0, 2.1), (3.00, 0.010, -0.780, 0.320, 2.1, 2.2),
       (4.00, 0.215, -0.850, 0.410, 2.2, 2.4), (5.00, 0.420, -0.900, 0.475, 2.3, 2.6), (6.00, 0.610, -0.935, 0.520, 2.4, 2.8), (7.00, 0.780, -0.955, 0.550, 2.5, 3.0),
       (8.00, 0.900, -0.960, 0.560, 2.6, 3.2), (9.50, 0.965, -0.960, 0.565, 2.8, 3.4), (12.00, 0.970, -0.960, 0.580, 3.0, 3.5), (14.00, 0.950, -0.950, 0.700, 3.2, 3.5),
       (15.50, 0.930, -0.930, 1.200, 3.6, 3.6), (16.50, 0.905, -0.915, 1.600, 4.0, 3.8), (18.00, 0.860, -0.895, 1.660, 4.0, 3.8), (19.50, 0.800, -0.860, 1.620, 3.8, 3.6),
       (20.40, 0.740, -0.800, 1.560, 3.4, 3.3), (20.60, 0.720, -0.780, 1.540, 3.2, 3.2)]
FT = tracks(FUS); A_TAIL = 20.60; A_TIP = 0.97
NOZ_R = 0.70; NOZ_X = 0.80; NOZ_Z = -0.04
def fus_top(a, x=0.0):
    top, bot, hw, nt = FT[0](a), FT[1](a), FT[2](a), FT[3](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = min(0.999, abs(x) / max(hw, 1e-6)); return cy + ht * (1 - q ** nt) ** (1 / nt)
def fus_bot(a, x=0.0):
    top, bot, hw, nb = FT[0](a), FT[1](a), FT[2](a), FT[4](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = min(0.999, abs(x) / max(hw, 1e-6)); return cy - ht * (1 - q ** nb) ** (1 / nb)
def fus_hw(a): return FT[2](a)
A_BLEND = 19.40                                                     # отсюда хвост перетекает в обвод двух сопел (Mark: без резкого обрыва)
def noz_hull(th, R):
    """Обвод двух сопел: окружности радиуса R вокруг осей сопел, сверху и снизу ровные полки; точка - по лучу из центра (0, NOZ_Z) под углом th."""
    c, s_ = math.cos(th), math.sin(th)
    if abs(s_) > 1e-6:
        t = R / abs(s_)
        if abs(t * c) <= NOZ_X: return Vector((t * c, NOZ_Z + t * s_))
    cx = math.copysign(NOZ_X, c); dc = c * cx; t = dc + math.sqrt(max(0.0, dc * dc - cx * cx + R * R))
    return Vector((t * c, NOZ_Z + t * s_))
def fuselage():
    n = 72; rs = []
    for a in [0.975, 1.00, 1.05, 1.12, 1.20] + stations(1.30, A_BLEND, 0.16) + stations(A_BLEND + 0.06, A_TAIL, 0.06):
        top, bot, hw, nt, nb = FT[0](a), FT[1](a), FT[2](a), FT[3](a), FT[4](a); r = sup(a, 0.0, top, bot, hw, nt, nb, n)
        if a > A_BLEND:
            w = _sm((a - A_BLEND) / (A_TAIL - A_BLEND)); cy = (top + bot) / 2; r2 = []
            for v in r:
                q = noz_hull(math.atan2(v.z - cy, v.x), NOZ_R + 0.035); r2.append(Vector((v.x + (q.x - v.x) * w, v.y, v.z + (q.y - v.z) * w)))
            r = r2
        rs.append(r)
    return loft_obj('s_fus', rs, sharp=50)
def pitot():
    """ПВД: длинная штанга вперёд от острия конуса, с флюгерами и приёмником (03, 07, 09)."""
    b = B(); n = 12; z0 = -0.48
    pr = [(0.00, 0.004), (0.03, 0.012), (0.40, 0.014), (0.44, 0.022), (0.75, 0.024), (0.95, 0.030), (1.02, 0.036)]
    b.loft([[P3(a, r * math.sin(2 * math.pi * q / n), z0 - r * math.cos(2 * math.pi * q / n)) for q in range(n)] for a, r in pr], G_METAL, cap0=G_METAL, cap1=G_METAL)
    for ph in range(4):
        u = Vector((math.sin(ph * math.pi / 2), 0, math.cos(ph * math.pi / 2))); p0 = P3(0.30, 0, z0)
        b.loft([[p0 + u * 0.012 + Vector((0, dy, 0)) + Vector((0.002, 0, 0)), p0 + u * 0.012 + Vector((0, dy, 0)) - Vector((0.002, 0, 0)), p0 + u * 0.07 + Vector((0, dy - 0.03, 0)) - Vector((0.002, 0, 0)), p0 + u * 0.07 + Vector((0, dy - 0.03, 0)) + Vector((0.002, 0, 0))] for dy in (0.0, -0.06)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('det_pitot', sharp_deg=40)


# ── воздухозаборники: высокие прямоугольные коробки по бокам, срез сильно наклонён (верх у задней части фонаря, низ на 2,1 м позади, 01 сбоку) ──
INT_TOP0, INT_TOP1 = 0.63, 0.86; INT_BOT = -0.96; INT_XI = 0.56; INT_XO0, INT_XO1 = 1.41, 1.71
A_LIP_T, A_LIP_B = 7.26, 9.40; A_INT_END = 16.6
def a_lip(z): return A_LIP_T + (INT_TOP0 - z) / (INT_TOP0 - INT_BOT) * (A_LIP_B - A_LIP_T)
def int_xi(a): return 0.58 + 0.085 * (1 - _sm((a - 10.0) / 3.0))       # Mark: щель между заборником и фюзеляжем, около 10 см у среза (сливается к 13 м)
def int_sec(a, k=1.0, n=40, e=8.0):
    t = _sm((a - A_LIP_T) / 4.5); INT_XI = int_xi(a); xo = INT_XO0 + (INT_XO1 - INT_XO0) * t; zt = INT_TOP0 + (INT_TOP1 - INT_TOP0) * t
    cx, hw = (INT_XI + xo) / 2, (xo - INT_XI) / 2 * k; cz, hz = (zt + INT_BOT) / 2, (zt - INT_BOT) / 2 * k; pts = []
    for q in range(n):
        th = -math.pi / 2 + 2 * math.pi * q / n; c, s_ = math.cos(th), math.sin(th)
        pts.append((cx + hw * math.copysign(abs(c) ** (2 / e), c), cz + hz * math.copysign(abs(s_) ** (2 / e), s_)))
    return pts
def intake(sx):
    """Коробка заборника: у каждой точки сечения своя длина от наклонного среза до конца (сечение по середине длины - как у ровной коробки)."""
    rs = []
    for u in [0.0, 0.004] + [0.015 + 0.985 * k / 34 for k in range(35)]:
        an = A_LIP_T + u * (A_INT_END - A_LIP_T); sec = int_sec(an)
        r = [P3(a_lip(z) + u * (A_INT_END - a_lip(z)), sx * x, z) for x, z in sec]
        rs.append(r if sx > 0 else r[::-1])
    return loft_obj('s_int', rs, sharp=40)
def intake_cut(sx):
    """Проём заборника: срез наклонный, внутри канал уходит к двигателю (тёмный в глубине)."""
    b = B(); prof = [(-0.30, 0.86, G_DUCT), (0.05, 0.86, G_DUCT), (1.20, 0.80, G_DUCT), (3.20, 0.70, G_DARK), (3.30, 0.10, G_DARK)]
    rings = []
    for da, k, _ in prof:
        sec = int_sec(A_LIP_T + 0.5, k)
        r = [P3(a_lip(z) + da, sx * x, z) for x, z in sec]; rings.append(r if sx > 0 else r[::-1])
    b.loft(rings, [m for _, _, m in prof[1:]], cap0=G_DUCT, cap1=G_DARK); return b.finish('c_inl', sharp_deg=30)
def lip(sx):
    """Нижняя губа заборника: передняя часть дна канала, отклоняется вниз на шарнире у задней кромки (08)."""
    b = B(); a1 = A_LIP_B + 0.75; sec = int_sec(A_LIP_T + 0.5); xs = [x for x, z in sec]; x0, x1 = min(xs) + 0.03, max(xs) - 0.03
    rg = lambda a, d=0.0: [P3(a, sx * x0, INT_BOT + 0.004 - d), P3(a, sx * x1, INT_BOT + 0.004 - d), P3(a, sx * x1, INT_BOT + 0.045), P3(a, sx * x0, INT_BOT + 0.045)]
    b.loft([rg(A_LIP_B - 0.005), rg(A_LIP_B + 0.06), rg(a1)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    nm = 'lip_' + ('r' if sx > 0 else 'l'); ob = b.finish(nm, sharp_deg=40); piv = P3(a1, sx * (x0 + x1) / 2, INT_BOT + 0.02); _rel(ob, piv)
    PARTS[nm] = dict(pivot=piv.copy(), axis=Vector((-1, 0, 0)), range=(0.0, 20.0), note='нижняя губа заборника: шарнир у задней кромки; плюс - передняя кромка вниз (взлёт, 08)')
    return ob
def lip_cut(sx):
    b = B(); a1 = A_LIP_B + 0.75; sec = int_sec(A_LIP_T + 0.5); xs = [x for x, z in sec]; x0, x1 = min(xs) + 0.025, max(xs) - 0.025
    rg = lambda a: [P3(a, sx * x0, INT_BOT - 0.04), P3(a, sx * x1, INT_BOT - 0.04), P3(a, sx * x1, INT_BOT + 0.065), P3(a, sx * x0, INT_BOT + 0.065)]
    b.loft([rg(A_LIP_B - 0.40), rg(a1 + 0.008)], G_DUCT, cap0=G_DUCT, cap1=G_DUCT); return b.finish('c_lip', sharp_deg=30)
def ramp(sx):
    """Регулируемый клин сверху внутри канала (здесь неподвижный): наклонная плита с боковыми щёками, не плоская стенка."""
    b = B(); sec = int_sec(A_LIP_T + 0.5); xs = [x for x, z in sec]; x0, x1 = min(xs) + 0.05, max(xs) - 0.05
    pts = [(A_LIP_T + 0.25, INT_TOP0 - 0.04), (A_LIP_T + 1.40, INT_TOP0 - 0.30), (A_LIP_T + 2.60, INT_TOP0 - 0.38)]
    for (a0, z0_), (a1, z1_) in zip(pts, pts[1:]):
        b.loft([[P3(a, sx * x0, z), P3(a, sx * x1, z), P3(a, sx * x1, z + 0.03), P3(a, sx * x0, z + 0.03)] for a, z in ((a0, z0_), (a1, z1_))], G_DUCT, cap0=G_DUCT, cap1=G_DUCT)
    return b.finish('det_ramp_' + ('r' if sx > 0 else 'l'), sharp_deg=30)


# ── крыло: трапеция на верху заборников, поперечное V -5°, элероны и закрылки по задней кромке, на концах противофлаттерные гондолы (01 сверху и спереди) ──
WX0, WX1 = 1.30, 6.95; WZ0 = 0.82; ANH = math.tan(math.radians(5.0))
def w_le(x): return 11.90 + (x - 1.71) * (16.39 - 11.90) / (6.95 - 1.71)
def w_te(x): return 17.42 + (x - 1.71) * (18.34 - 17.42) / (6.95 - 1.71)
def w_z(x): return WZ0 - max(0.0, x - 1.71) * ANH
def w_tc(x): return 0.050 - 0.012 * min(1.0, max(0.0, (x - 1.71) / 5.24))
FLAP = (1.95, 4.45); AIL = (4.55, 6.70); F_C = 0.26
def wl(sx, x, a, h): return P3(a, sx * x, w_z(x) + h)
def w_hinge(x): return w_te(x) - F_C * (w_te(x) - w_le(x))
def wing(sx):
    k = []
    for e0, e1 in (FLAP, AIL): k += [e0 - 0.004, e0, e1, e1 + 0.004]
    xs = sorted(set(round(v, 4) for v in [WX0, 1.50, 1.71] + stations(1.80, WX1 - 0.06, 0.25) + k + [WX1 - 0.03, WX1]))
    rs = []
    for x in xs:
        le, te = w_le(x), w_te(x); c = te - le; tc = w_tc(x)
        if any(e0 - 1e-6 <= x <= e1 + 1e-6 for e0, e1 in (FLAP, AIL)): ue, tail = cove_cut(le, c, tc, w_hinge(x))
        else: ue, tail = 1.0, cove_wall(le, c, tc, 1.0)
        f = 1.0 if x < WX1 - 0.05 else 0.35
        r = foil_ring(le, c, tc * f, 0.0006, ue, 30, lambda a, h, x=x: wl(sx, x, a, h), tail=tail, head=cove_wall_f(le, c, tc * f, 0.0006))
        rs.append(r if sx > 0 else r[::-1])
    return loft_obj('wing_' + ('r' if sx > 0 else 'l'), rs, sharp=50)
def surf(sx, nm, e0, e1, rng, note):
    e0 += 0.012; e1 -= 0.012
    p0 = wl(sx, e0, w_hinge(e0), 0.0); p1 = wl(sx, e1, w_hinge(e1), 0.0); piv = (p0 + p1) / 2; ax = (p1 - p0).normalized()
    if ax.x < 0: ax = -ax
    rs = []
    for j in range(7):
        x = e0 + (e1 - e0) * j / 6; le = w_le(x); c = w_te(x) - le; ah = w_hinge(x)
        r = [v - piv for v in foil_ring(le, c, w_tc(x), (ah - le) / c, 1.0, 10, lambda a, h, x=x: wl(sx, x, a, h), head=cove_nose(le, c, w_tc(x), ah))]
        rs.append(r if sx > 0 else r[::-1])
    name = nm + '_' + ('r' if sx > 0 else 'l'); ob = loft_obj(name, rs, sharp=48); ob.location = piv
    PARTS[name] = dict(pivot=piv.copy(), axis=ax.copy(), range=rng, note=note)
    return ob
def tip_pod(sx):
    """Противофлаттерная гондола на конце крыла (01 сверху): веретено с острым носком."""
    b = B(); n = 16; x = WX1 + 0.04; z = w_z(WX1)
    pr = [(14.86, 0.004), (15.10, 0.045), (15.60, 0.085), (16.20, 0.095), (17.80, 0.090), (18.50, 0.060), (18.66, 0.010)]
    b.loft([[P3(a, sx * (x + r * math.sin(2 * math.pi * q / n)), z + r * math.cos(2 * math.pi * q / n)) for q in range(n)] for a, r in pr], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('det_tip_' + ('r' if sx > 0 else 'l'), sharp_deg=40)


# ── два киля (развал 8° наружу) с рулями, два подфюзеляжных гребня, цельноповоротные стабилизаторы ──
FX0, FZ0, FZ1 = 1.45, 0.80, 3.53; CANT = math.radians(8.0)
def FLE(z): return 15.80 + (z - FZ0) * (20.40 - 15.80) / (FZ1 - FZ0)
def FTE(z): return 20.90 + (z - FZ0) * (21.00 - 20.90) / (FZ1 - FZ0)
RUD = (1.25, 3.30); RUD_C = 0.70
def fin_pt(sx, a, h, z): return P3(a, sx * (FX0 + (z - FZ0) * math.tan(CANT)) + h * math.cos(CANT), z - sx * h * math.sin(CANT) * 0.0)
def fin(sx):
    zs = sorted(set(stations(0.55, FZ1 - 0.06, 0.15) + [RUD[0] - 0.004, RUD[0], RUD[1], RUD[1] + 0.004] + [FZ1 - 0.03, FZ1]))
    rs = []
    for z in zs:
        le, te = FLE(z), FTE(z); c = te - le; tc = 0.045 - 0.012 * (z - FZ0) / (FZ1 - FZ0)
        if RUD[0] - 1e-6 <= z <= RUD[1] + 1e-6: ue, tail = cove_cut(le, c, tc, te - RUD_C, 0.006)
        else: ue, tail = 1.0, cove_wall(le, c, tc, 1.0)
        f = 1.0 if z < FZ1 - 0.04 else 0.35
        rs.append(foil_ring(le, c, tc * f, 0.0006, ue, 24, lambda a, h, z=z: fin_pt(sx, a, h, z), tail=tail, head=cove_wall_f(le, c, tc * f, 0.0006)))
    return loft_obj('fin_' + ('r' if sx > 0 else 'l'), rs, sharp=50)
def rudder(sx):
    z0, z1 = RUD[0] + 0.006, RUD[1] - 0.006; pv0 = fin_pt(sx, FTE(z0) - RUD_C, 0.0, z0); pv1 = fin_pt(sx, FTE(z1) - RUD_C, 0.0, z1); piv = (pv0 + pv1) / 2; ax = (pv1 - pv0).normalized(); axc = Vector((ax.x, 0.0, ax.z)).normalized()
    rs = []
    for j in range(9):
        z = z0 + (z1 - z0) * j / 8; le, te = FLE(z), FTE(z); c = te - le; ah = te - RUD_C; tc = 0.045 - 0.012 * (z - FZ0) / (FZ1 - FZ0)
        cj = fin_pt(sx, ah, 0.0, z)                                                               # сечения поперёк развала оси (без стреловидности): торцы не заметают киль
        rs.append([v - axc * (v - cj).dot(axc) - piv for v in foil_ring(le, c, tc, (ah - le) / c, 1.0, 10, lambda a, h, z=z: fin_pt(sx, a, h, z), head=cove_nose(le, c, tc, ah))])
    nm = 'rudder_' + ('r' if sx > 0 else 'l'); ob = loft_obj(nm, rs, sharp=48); ob.location = piv
    PARTS[nm] = dict(pivot=piv.copy(), axis=ax.copy(), range=(-25.0, 25.0), note='руль направления на киле: ось в носке руля')
    return ob
def ventral(sx):
    rs = []
    for z in (-0.60, -0.86, -1.10, -1.30, -1.41):
        t = (-0.60 - z) / 0.81; le = 17.40 + 0.85 * t; te = 20.55 - 0.15 * t; c = te - le          # чертёж 01 сбоку: гребень начинается раньше
        rs.append(foil_ring(le, c, 0.05, 0.0006, 1.0, 16, lambda a, h, z=z: P3(a, sx * (1.20 + (-0.86 - z) * math.tan(math.radians(10))) + h, z), tail=cove_wall(le, c, 0.05, 1.0), head=cove_wall_f(le, c, 0.05, 0.0006)))
    return loft_obj('ventral_' + ('r' if sx > 0 else 'l'), rs, sharp=50)
STZ = -0.42; ST_PIV = 20.00
def SLE(x): return 18.40 + (x - 1.62) * (21.55 - 18.40) / (4.25 - 1.62)
def STE(x): return 20.90 + (x - 1.62) * (22.25 - 20.90) / (4.25 - 1.62)
def side_x(a, z):
    top, bot, hw, nt, nb = FT[0](a), FT[1](a), FT[2](a), FT[3](a), FT[4](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = min(0.999, abs(z - cy) / max(ht, 1e-6)); n_ = nt if z >= cy else nb; return hw * (1 - q ** n_) ** (1 / n_)
def root_x(a, z, gap=0.015):
    """Корень стабилизатора: ближе всего к борту, но без касания на всём ходе ±25° (как у Су-24М и МиГ-27К)."""
    best = 0.0
    for k in range(-10, 11):
        t = math.radians(2.5 * k); da, dz = a - ST_PIV, z - STZ
        a2 = ST_PIV + da * math.cos(t) - dz * math.sin(t); z2 = STZ + da * math.sin(t) + dz * math.cos(t)
        if a2 <= A_TAIL + 0.03: best = max(best, side_x(min(a2, A_TAIL), z2))
        if A_TAIL - 0.15 <= a2 <= A_TAIL + 0.56 and abs(z2 - NOZ_Z) < NOZ_R + 0.025:            # сопло за срезом фюзеляжа
            best = max(best, NOZ_X + math.sqrt((NOZ_R + 0.025) ** 2 - (z2 - NOZ_Z) ** 2))
        if z2 < -0.58:                                                                            # подфюзеляжный гребень
            t_ = (-0.60 - z2) / 0.81; le_, te_ = 17.40 + 0.85 * t_, 20.55 - 0.15 * t_
            if le_ - 0.05 <= a2 <= te_ + 0.05: best = max(best, 1.20 + (-0.86 - z2) * math.tan(math.radians(10)) + 0.025 * (te_ - le_) + 0.01)
    return best + gap
def stab(sx):
    rs = []
    for x in ['cap', None] + stations(1.80, 4.15, 0.20) + [4.21, 4.25]:
        xr = 1.62 if x in ('cap', None) else x; le, te = SLE(xr), STE(xr); c = te - le; k = max(0.0, (xr - 4.15) / 0.10); f = math.sqrt(max(0.0, 1 - k * k)) * 0.97 + 0.03
        if x == 'cap': place = lambda a, h: P3(a, sx * root_x(a, STZ), STZ)
        elif x is None: place = lambda a, h: P3(a, sx * root_x(a, STZ + h), STZ + h)
        else: place = lambda a, h, x=x, f=f: P3(a, sx * x, STZ + h * f)
        r = foil_ring(le, c, 0.045, 0.0006, 1.0, 22, place, tail=cove_wall(le, c, 0.045, 1.0), head=cove_wall_f(le, c, 0.045, 0.0006))
        rs.append(r if sx > 0 else r[::-1])
    nm = 'stab_' + ('r' if sx > 0 else 'l'); ob = loft_obj(nm, rs, cap0=False, sharp=50); piv = P3(ST_PIV, sx * 1.62, STZ); _rel(ob, piv)
    PARTS[nm] = dict(pivot=piv.copy(), axis=Vector((-1, 0, 0)), range=(-25.0, 25.0), note='половина цельноповоротного стабилизатора: ось поперёк; плюс - передняя кромка вниз; корень по борту без касания на всём ходе')
    return ob


# ── сопла: два больших, контейнер парашюта между ними (05) ──
def nozzle(sx):
    b = B(); n = 56; a0 = A_TAIL
    pr = [(-0.10, NOZ_R + 0.006), (0.10, NOZ_R), (0.48, NOZ_R - 0.06), (0.52, NOZ_R - 0.09), (0.35, NOZ_R - 0.12), (-0.40, NOZ_R - 0.16)]
    rings = [[P3(a0 + da, sx * NOZ_X + (r + 0.010 * (q % 4 == 0)) * math.sin(2 * math.pi * q / n), NOZ_Z + (r + 0.010 * (q % 4 == 0)) * math.cos(2 * math.pi * q / n)) for q in range(n)] for da, r in pr]
    b.loft(rings, [G_METAL, G_METAL, G_METAL, G_DARK, G_DARK], cap1=G_DARK)
    nm = 'nozzle_' + ('r' if sx > 0 else 'l'); ob = b.finish(nm, sharp_deg=30); piv = P3(a0, sx * NOZ_X, NOZ_Z); _rel(ob, piv)
    PARTS[nm] = dict(pivot=piv.copy(), axis=Vector((0, -1, 0)), range=(0.85, 1.0), kind='scale', note='сопло: масштаб створок поперёк оси (0,85 - бесфорсажный, 1,0 - форсаж)')
    return ob
def nozzle_cut(sx):
    n = 48; b = B(); a0 = A_TAIL
    rings = [[P3(a0 + da, sx * NOZ_X + r * math.sin(2 * math.pi * q / n), NOZ_Z + r * math.cos(2 * math.pi * q / n)) for q in range(n)] for da, r in ((0.2, NOZ_R - 0.12), (-0.7, NOZ_R - 0.12), (-0.75, 0.05))]
    b.loft(rings, G_DARK, cap0=G_DARK, cap1=G_DARK); return b.finish('c_noz', sharp_deg=30)
def chute():
    b = B(); n = 20; zc = 0.42
    pr = [(19.60, 0.05), (19.80, 0.17), (21.05, 0.18), (21.15, 0.16)]
    b.loft([[P3(a, r * math.sin(2 * math.pi * q / n), zc + r * math.cos(2 * math.pi * q / n)) for q in range(n)] for a, r in pr], G_SKIN, cap0=G_SKIN, cap1=G_DARK)
    return b.finish('det_chute', sharp_deg=40)
def airbrake():
    """Тормозной щиток под фюзеляжем сзади между гребнями: шарнир спереди, плюс - задняя кромка вниз."""
    a0, a1, hw = 17.40, 18.60, 0.42; zb = lambda a, x: fus_bot(a, x) - 0.012
    ob = patch('brake', lambda u, v: (a0 + (a1 - a0) * v, -hw + 2 * hw * u), 6, 6, dirn=1, lift=0.010, th=0.010, z0=-8.0)
    piv = P3(a0, 0.0, zb(a0, 0.0) - 0.002); _rel(ob, piv)
    PARTS['brake'] = dict(pivot=piv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 45.0), note='тормозной щиток: шарнир у передней кромки; плюс - задняя кромка вниз')
    return ob


# ── фонарь: козырёк неподвижен, откидная часть вправо на продольной оси по правому борту (ЗАДАНИЕ) ──
CAN_A0, CAN_W, CAN_A1 = 5.70, 6.30, 7.75
CAN = Track([(5.70, 0.62), (6.00, 0.86), (6.30, 1.00), (6.80, 1.06), (7.30, 1.05), (7.75, 0.98)])
CAN_HW = Track([(5.70, 0.40), (6.30, 0.44), (7.00, 0.46), (7.75, 0.44)])
def can_ring(a, n=24, inset=0.0, sink=0.06):
    top = CAN(a) - inset; hw = CAN_HW(a) - inset; base = fus_top(a, hw) - sink
    return [P3(a, hw * math.cos(math.pi * k / n), base + (top - base) * abs(math.sin(math.pi * k / n)) ** 0.85) for k in range(n + 1)]
def canopy_part(a0, a1, name, mat, th=0.010):
    rs = []
    for a in stations(a0, a1, 0.06):
        o = can_ring(a); i_ = can_ring(a, inset=th); rs.append(o + i_[::-1])
    return loft_obj(name, rs, mat, sharp=60)
WIN_A = (CAN_W + 0.18, CAN_A1 - 0.22); WIN_TH = (0.30, 1.05)                  # окна откидной части: по длине и по углу от борта (02, 08: колпак металлический, окна по бокам)
def canopy():
    """Козырёк - стекло; откидная часть - металлический колпак с боковыми окнами (02, 03, 08); открывается вправо на оси по правому борту."""
    ws = canopy_part(CAN_A0, CAN_W, 'canopy_glass', G_GLASS)
    rs = []; n = 24
    for a in stations(CAN_W + 0.033, CAN_A1, 0.05):                                        # колпак вплотную к дуге переплёта (Mark: щель)
        o = can_ring(a, n, sink=0.035); i_ = can_ring(a, n, inset=0.012, sink=0.035); rs.append(o + i_[::-1])          # кромка колпака в проёме неглубоко: при открытии не задевает стенку проёма
    mid = lambda r: [(r[k] + r[len(r) - 1 - k]) / 2 for k in range(n + 1)]
    rs = [mid(rs[0]) + mid(rs[0])[::-1]] + rs + [mid(rs[-1]) + mid(rs[-1])[::-1]]      # торцы - кольца, сжатые к середине толщины (без n-угольников)
    b = B(); b.loft(rs, G_SKIN); hood = b.finish('canopy', sharp_deg=60); me = hood.data; m = 2 * (n + 1)
    for p in me.polygons:
        if len(p.vertices) != 4: continue
        a = L / 2 - p.center.y
        js = sorted(v % m for v in p.vertices); j = js[0] if js[-1] - js[0] == 1 else js[-1]
        if j > n: p.material_index = G_COCK; continue                                  # изнанка тёмная
        th = math.pi * (j + 0.5) / n; ang = min(th, math.pi - th)
        if WIN_A[0] < a < WIN_A[1] and WIN_TH[0] < ang < WIN_TH[1]: p.material_index = G_GLASS
    hx = max(CAN_HW(a) for a in stations(CAN_W, CAN_A1, 0.05)) + 0.012                      # шарнир снаружи колпака на уровне обшивки: колпак уходит вверх-вправо, не в борт
    piv = P3((CAN_W + CAN_A1) / 2, hx, max(fus_top(a, hx - 0.03) for a in stations(CAN_W, CAN_A1, 0.05)) + 0.010); _rel(hood, piv)
    PARTS['canopy'] = dict(pivot=piv.copy(), axis=Vector((0, 1, 0)), range=(0.0, 70.0), note='откидная часть фонаря: продольная ось по правому борту; плюс - открывается вправо')
    return [ws, hood]
def ws_frame():
    """Переплёт козырька: дуга у основания колпака и две стойки (03, 08)."""
    b = B()
    def tube(pts, r):
        n = 8; rings = []
        for k, p in enumerate(pts):
            d = (pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]).normalized(); u = d.cross(Vector((0, 0, 1))); u = u.normalized() if u.length > 1e-6 else Vector((1, 0, 0)); v = d.cross(u)
            rings.append([p + (u * math.cos(2 * math.pi * q / n) + v * math.sin(2 * math.pi * q / n)) * r for q in range(n)])
        b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    tube(can_ring(CAN_W + 0.01, 24, inset=-0.006), 0.020)
    for x in (-0.22, 0.22):
        pts = []
        for k in range(8):
            a = CAN_A0 + 0.04 + (CAN_W - CAN_A0 - 0.04) * k / 7; r = can_ring(a, 24, inset=-0.004); idx = int(round(math.acos(max(-1, min(1, x / CAN_HW(a)))) / math.pi * 24)); pts.append(r[idx])
        tube(pts, 0.014)
    return b.finish('det_wsframe', sharp_deg=40)
def cock_cut():
    b = B(); n = 20; rs = []
    for a in sorted(stations(CAN_A0 + 0.15, CAN_A1 + 0.012, 0.10) + [CAN_W + 0.02, CAN_W + 0.03]):
        hw = CAN_HW(a) + (0.012 if a > CAN_W + 0.025 else -0.06); zt = fus_top(a) + 0.30; zb = 0.05
        rs.append([P3(a, hw * math.cos(math.pi * k / n), zb + (zt - zb) * math.sin(math.pi * k / n) ** 0.4) for k in range(n + 1)] + [P3(a, -hw, zb - 0.02), P3(a, hw, zb - 0.02)])
    b.loft(rs, G_COCK, cap0=G_COCK, cap1=G_COCK); return b.finish('c_cock', sharp_deg=30)
def canopy_fairing():
    a0, a1 = CAN_A1 + 0.02, 11.0; rs = []
    for a in stations(a0, a1, 0.12):
        t = _sm((a - a0) / (a1 - a0)); top = CAN(CAN_A1) * (1 - t) + (fus_top(a1) + 0.002) * t; hw = CAN_HW(CAN_A1) * (1 - t) + 0.22 * t
        base = fus_top(a, hw) - 0.08; n = 24; pts = [P3(a, hw * math.cos(math.pi * k / n), base + (top - base) * abs(math.sin(math.pi * k / n)) ** 0.9) for k in range(n + 1)]
        pts.append(P3(a, 0.0, base - 0.10)); rs.append(pts)
    return loft_obj('s_cfair', rs, sharp=50)


def build_skin():
    S = [fuselage(), intake(1), intake(-1), canopy_fairing()]
    host = S[0]
    for o in S[1:]: _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        c = intake_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
        c = nozzle_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
        c = lip_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)              # место под подвижную нижнюю губу
    c = cock_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)                      # кабина: выемка под фонарём
    host.name = 'MG_skin'; host.data.name = 'MG_skin'
    return host


def plane(stage=9, sweep=None):
    """Этапы: 1 - обшивка, кили, стабилизаторы, сопла, фонарь; 2 - крыло с механизацией, рули, губы, щиток; 3 - детали, пилоны; 4 - шасси."""
    PARTS.clear(); STATIONS.clear()
    skin = build_skin(); ref_me = skin.data.copy()
    out = [skin, pitot(), fin(1), fin(-1), ventral(1), ventral(-1), stab(1), stab(-1), nozzle(1), nozzle(-1), chute(), ramp(1), ramp(-1), ws_frame()] + canopy()
    if stage >= 2:
        for sx in (1, -1):
            out += [wing(sx), tip_pod(sx), rudder(sx), lip(sx),
                    surf(sx, 'flap', FLAP[0], FLAP[1], (0.0, 25.0), 'закрылок: ось у носка; плюс - задняя кромка вниз'),
                    surf(sx, 'aileron', AIL[0], AIL[1], (-20.0, 20.0), 'элерон: ось у носка; плюс - задняя кромка вниз')]
        bvh_ready(skin); out.append(airbrake())
    if stage >= 3:
        import mg_det as dt
        out += dt.all_details(skin)
    if stage >= 4:
        import mg_gear as gr; out += gr.gear_all()
    resharp(skin); print('нормали обшивки:', smooth_normals(skin, ref_me)); bpy.data.meshes.remove(ref_me)
    return out
