# su7_geo.py - геометрия Су-7БМК для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z.
# a - расстояние вдоль оси; кромка воздухозаборника a = 0,50, острие конуса 0,12, срез сопла 14,77, конец киля около 16,0; штанга ПВД выступает вперёд до a = -0,68. z - высота над осью фюзеляжа (ось прямая).
# Размеры: фото su7_01 (вид сбоку в полёте, 0,0214 м/пикс при длине со штангой 16,8 м: a = 0,5 + (x - 65)·0,0214), размах 9,31 м, высота 4,99 м. Крыло, оперение, стойки - от Су-17М4 (сдвиг по a на -2,03, по z на -0,29), сверены с фото 03, 04, 05.
# Общие узлы (фюзеляж-труба, конус, киль, руль, стабилизатор, сопло, кабина, стойки) взяты из su7_core.py - копии mig21_geo.py; здесь таблицы Су-7 и своё неподвижное крыло.
import math, os, inspect
import bpy, bmesh
from mathutils import Vector, Matrix
from modelkit import B
import su7_base as fb
from su7_base import *
from su7_base import _apply_bool, _drop, _rel
import su7_core as c
from su7_gk import tube, collar, box, link, hose, wheel, X, F, U, R_, G_BELT, G_HANDLE

PARTS = fb.PARTS; L = fb.L; PYLON_PTS = c.PYLON_PTS
TANKS = os.environ.get('SU7_TANKS', '0') == '1'


def patchf(name, reps):
    """Функция из su7_core с заменой чисел в исходнике (ниши, станции)."""
    if not hasattr(c, '_SRC'): c._SRC = {}
    if name not in c._SRC: c._SRC[name] = inspect.getsource(getattr(c, name))      # исходник берётся один раз: у подменённой функции его уже не достать
    src = c._SRC[name]
    for a_, b_ in reps:
        if a_ not in src: print('НЕТ В', name, ':', a_[:50])
        src = src.replace(a_, b_)
    exec(compile(src, 'su7_core:' + name, 'exec'), c.__dict__)


# ── таблицы Су-7 ──
c.GROUND_Z = GROUND_Z = -1.900
c.LIP_A = LIP_A = 0.50; c.NOZ_A0 = NOZ_A0 = 14.22
_R = [(0.50, 0.480), (0.56, 0.500), (1.25, 0.575), (2.20, 0.620), (3.40, 0.665), (5.00, 0.720), (6.50, 0.760), (8.00, 0.775), (12.00, 0.775), (13.20, 0.730), (14.22, 0.640)]
c.FORE = FORE = [(a_, r_, -r_, r_) for a_, r_ in _R]
c.FT = FT = tracks(FORE)
fz, fr, side_x, top_z = c.fz, c.fr, c.side_x, c.top_z
c.NOZ_Z = NOZ_Z = 0.0; c.NOZ_R0 = 0.648; c.NOZ_R = NOZ_R = 0.575; c.NOZ_A = NOZ_A = 14.77
c.F_LE = Lin([(0.25, 9.80), (0.75, 10.45), (1.05, 11.05), (1.55, 11.95), (3.09, 14.75)]); c.F_TE = Lin([(0.25, 14.17), (0.61, 14.39), (0.91, 14.80), (3.09, 15.85)]); c.FIN_TOP = FIN_TOP = 3.09
c.RUD = (1.26, 2.71); c.RUD_C = Track([(1.26, 0.620), (2.71, 0.500)])
c.CHUTE = (13.85, 15.63, 0.940, 0.190)                         # контейнер тормозных парашютов в основании киля (su7_01, 03)
c.STAB_Z = STAB_Z = -0.250; c.STAB_A = 14.17; c.SXR = 0.540; c.SXT = 2.400
c.S_LE = Lin([(0.540, 12.26), (2.400, 14.77)]); c.S_TE = Lin([(0.540, 14.80), (2.400, 15.92)])
c.CAN_A0, c.ARCH_A, c.CAN_A1 = 1.85, 2.60, 4.20
c.CAN_T = tracks([(1.85, 0.640, 0.200), (2.20, 0.900, 0.300), (2.60, 1.080, 0.360), (3.05, 1.160, 0.375), (3.50, 1.150, 0.370), (3.90, 1.050, 0.335), (4.20, 0.935, 0.300)])
c.NG = dict(a=3.00, hinge=(3.15, -0.560), rw=0.330, ww=0.160)
c.MG = dict(a=8.20, x=1.950, rw=0.420, ww=0.230, T=(8.15, 1.720))
WZ = -0.480
c.wy = lambda x: WZ

patchf('fin', [("ys = [0.55, 0.75, 0.95, RUD[0] - 0.004, RUD[0]]", "ys = [0.25, 0.45, 0.65, 0.85, 1.05, RUD[0] - 0.004, RUD[0]]"), ("[RUD[1] + 0.004, 2.18, 2.35, 2.42, 2.50, 2.56, FIN_TOP]", "[RUD[1] + 0.004, 2.83, 2.95, 3.03, FIN_TOP]")])
patchf('stab', [("xr0 = side_x(13.2, STAB_Z)", "xr0 = side_x(13.57, STAB_Z)"), ("+ 0.022; out.append", "+ 0.012; out.append"), ("side_x(min(max(a_, 12.0), NOZ_A0), p.z)", "max(0.50, side_x(min(max(a_, 12.0), NOZ_A0), p.z))"), ("range=(-18.0, 8.0)", "range=(-16.0, 8.0)")])
patchf('cock_cut', [("[P3(a, -hw, 0.02), P3(a, hw, 0.02), P3(a, hw, 2.2), P3(a, -hw, 2.2)]", "[P3(a, -hw, -0.06), P3(a, hw, -0.06), P3(a, hw, 2.2), P3(a, -hw, 2.2)]"), ("stations(3.30, 4.96, 0.07)", "stations(2.24, 4.12, 0.07)")])
patchf('gear_nose', [("stations(1.55, 2.85, 0.18)", "stations(1.95, 3.30, 0.18)")])
patchf('gear_main', [("tgt = P3(MG['T'][0] + 0.25, sx * 0.34, -0.25) - T", "tgt = P3(MG['T'][0] + 0.10, sx * 0.55, -0.38) - T")])
patchf('bore_cut', [("(a1 + 0.25, 0.490, G_METAL), (a1 - 0.30, 0.490, G_METAL), (a1 - 0.80, 0.480, G_COCK), (a1 - 1.10, 0.470, G_DARK)", "(a1 + 0.25, 0.585, G_METAL), (a1 - 0.30, 0.585, G_METAL), (a1 - 0.80, 0.560, G_COCK), (a1 - 1.10, 0.520, G_DARK)")])
patchf('nozzle', [("ring(a1 - 0.60, 0.40, 48), ring(a0 - 0.9, 0.44, 48)", "ring(a1 - 0.60, 0.50, 48), ring(a0 - 0.9, 0.53, 48)")])
patchf('burner', [("for r in (0.36, 0.22, 0.10)", "for r in (0.44, 0.28, 0.12)"), ("c0 + u * 0.46", "c0 + u * 0.54")])


def fore():
    st = [0.50, 0.512, 0.53, 0.56, 0.62] + stations(0.75, 14.05, 0.18) + [NOZ_A0]
    return loft_obj('s_fore', [sup(a, 0.0, FT[0](a), FT[1](a), FT[2](a), 2.0, 2.0, 72) for a in st])


SPINE = tracks([(4.16, 0.940, 0.300), (4.60, 0.860, 0.290), (5.50, 0.805, 0.270), (8.00, 0.825, 0.250), (10.30, 0.850, 0.200), (11.60, 0.870, 0.110)])     # низкий гаргрот от фонаря до киля


def spine():
    rings = []
    for a in stations(4.16, 11.60, 0.18):
        top, hw = SPINE[0](a), SPINE[1](a); n = 28; ring = []; zb = FT[0](a) - 0.30
        for i in range(n):
            th = -math.pi / 2 + 2 * math.pi * i / n; cs, sn = math.cos(th), math.sin(th)
            x = hw * math.copysign(abs(cs) ** (2 / 2.8), cs); z = zb + (top - zb) * abs(sn) ** (2 / 2.8) if sn > 0 else zb + 0.4 * sn
            ring.append(P3(a, x * (1.0 if sn > 0 else 1.3), z))
        rings.append(ring)
    return loft_obj('s_spine', rings, sharp=40)


def duct_cut():
    prof = [(0.25, 0.456), (0.51, 0.456), (0.70, 0.450), (1.55, 0.400), (2.08, 0.200), (2.13, 0.020)]; n = 56
    return loft_obj('c_duct', [[P3(a, r * math.sin(2 * math.pi * q / n), fz(max(a, LIP_A)) - r * math.cos(2 * math.pi * q / n)) for q in range(n)] for a, r in prof], G_DUCT, sharp=25)


def cone():
    n = 40; cz = 0.0; pivot = P3(1.05, 0.0, cz); prof = [(0.12, 0.006), (0.17, 0.034), (0.45, 0.135), (0.75, 0.210), (1.05, 0.255), (1.35, 0.250), (1.75, 0.180), (2.05, 0.080)]
    ob = loft_obj('cone', [[P3(a, r * math.sin(2 * math.pi * q / n), cz - r * math.cos(2 * math.pi * q / n)) - pivot for q in range(n)] for a, r in prof], G_SKIN, sharp=30); ob.location = pivot
    PARTS['cone'] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(0.0, 0.20), kind='slide', note='конус воздухозаборника: сдвиг вдоль оси, метры; плюс - вперёд (в файле убран)')
    return ob


# ── крыло: неподвижное, стреловидность передней кромки 63° (60° по четверти хорд), два гребня ──
XR, XT = 0.40, 4.655                                            # корень крыла внутри фюзеляжа по всей длине (Mark: крыло не должно висеть рядом с бортом)
def _tip(x): return max(0.0, (x - 4.50) / 0.155) ** 2
def LE(x): return 4.16 + 2.03 * (x - 0.82) + 0.10 * _tip(x)      # чертёж su7_10: 0,02948 м/пикс вдоль, 0,0304 поперёк
def TE(x): return (9.87 if x < 1.34 else 9.87 + 1.09 * (x - 1.34)) - 0.22 * _tip(x)      # у фюзеляжа задняя кромка идёт поперёк потока до x 1,34, дальше стреловидная до законцовки (su7_10)
TC = Track([(0.70, 0.045), (2.00, 0.058), (4.655, 0.050)])
FLAP = (0.72, 2.58); AIL = (2.68, 4.30)
def HF(x): return 8.95 + (TE(2.58) - 0.78 - 8.95) * (x - 0.72) / (2.58 - 0.72)      # ось закрылка прямая, хорда меняется
def HA(x): return TE(x) - 0.50
FENCES = ((2.67, 0.24, 0.66), (4.60, 0.13, 0.86))               # гребень над внутренним пилоном и шайба у законцовки (su7_10, 08)               # x, высота, доля хорды
TRIM = 0.020
def _cut(r, t=TRIM): return (r[0] + t, r[1] - t)
def in_(x, r): return r[0] - 1e-6 <= x <= r[1] + 1e-6


def wing_s(sx):
    def sec(x):
        cc = TE(x) - LE(x); tc = TC(x); le = LE(x)
        if in_(x, _cut(FLAP)): ue, tail = cove_cut(le, cc, tc, HF(x))
        elif in_(x, _cut(AIL)): ue, tail = cove_cut(le, cc, tc, HA(x))
        else: ue = 1.0; tail = cove_wall(le, cc, tc, 1.0)
        return foil_ring(le, cc, tc, 0.0008, ue, 18, lambda a, h: P3(a, sx * x, WZ + h), tail=tail, head=cove_wall_f(le, cc, tc, 0.0008))
    xs = {XR, 0.55, 0.85, 1.30, 1.34, 1.38, 4.50, 4.55, 4.59, 4.62, 4.64, XT}
    for r in (_cut(FLAP), _cut(AIL)):
        xs |= {r[0] - 0.004, r[0], r[1], r[1] + 0.004}
        for i in range(1, 7): xs.add(round(r[0] + (r[1] - r[0]) * i / 7, 4))
    return loft_obj('s_wing', [sec(x) for x in sorted(xs)], sharp=48)


def wing_part(name, spec, HG, sx, rng, note):
    x0, x1 = _cut(spec); x0 += 0.012; x1 -= 0.012
    pv0 = P3(HG(x0), sx * x0, WZ); pv1 = P3(HG(x1), sx * x1, WZ); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    xs = sorted({round(x0 + (x1 - x0) * i / 8, 4) for i in range(9)} | ({1.30, 1.34, 1.38} if x0 < 1.3 < x1 else set()))
    for x in xs:
        cc = TE(x) - LE(x); ah = HG(x)
        rings.append([v - pivot for v in foil_ring(LE(x), cc, TC(x), (ah - LE(x)) / cc, 1.0, 9, lambda a, h: P3(a, sx * x, WZ + h), head=cove_nose(LE(x), cc, TC(x), ah))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot; PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=rng, note=note)
    return ob


def fence(sx):
    """Два аэродинамических гребня на крыло (su7_02, 05) и ствол пушки НР-30 в корне крыла."""
    b = B()
    for x, hh, kc in FENCES:
        cc = TE(x) - LE(x); a0 = LE(x) - 0.03; a1 = LE(x) + kc * cc; zt = lambda a: WZ + TC(x) * cc * thk(max(0.0, (a - LE(x)) / cc)); zl = lambda a: WZ - TC(x) * cc * thk(max(0.0, (a - LE(x)) / cc))
        b.loft([[P3(a, sx * x - 0.008, zt(a) - 0.004), P3(a, sx * x + 0.008, zt(a) - 0.004), P3(a, sx * x + 0.005, zt(a) + h_), P3(a, sx * x - 0.005, zt(a) + h_)] for a, h_ in ((a0 + 0.03, 0.02), (a0 + 0.22, hh * 0.85), (a0 + 0.60, hh), (a1 - 0.30, hh * 0.8), (a1, 0.02))], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
        b.loft([[P3(a, sx * x - 0.007, zl(a) - h_), P3(a, sx * x + 0.007, zl(a) - h_), P3(a, sx * x + 0.007, zt(a) + h_), P3(a, sx * x - 0.007, zt(a) + h_)] for a, h_ in ((a0, 0.004), (a0 + 0.04, 0.035), (a0 + 0.16, 0.05), (a0 + 0.24, 0.02))], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)      # гребень огибает носок
    xg = 1.02; ag = LE(xg)
    strut(b, P3(ag - 0.62, sx * xg, WZ - 0.01), P3(ag + 0.30, sx * xg, WZ - 0.01), 0.026, G_METAL, 12); strut(b, P3(ag - 0.20, sx * xg, WZ - 0.01), P3(ag + 0.45, sx * xg, WZ - 0.01), 0.055, G_SKIN, 14)       # ствол и обтекатель
    return b.finish('det_fence_' + ('r' if sx > 0 else 'l'), sharp_deg=40)


def canopy():
    """Фонарь сдвигается назад по рельсам (su7_04, 05)."""
    a0, a1 = c.ARCH_A + 0.034, c.CAN_A1 - 0.004; st = stations(a0 + 0.004, a1 - 0.004, 0.09); pivot = P3(a0, 0.0, c.SILL(a0))
    b = B(); strip(b, [c.can_ring(a) for a in st], G_GLASS); gl = b.finish('canopy_glass', sharp_deg=60)
    b = B(); c.frame_arch(b, a0 + 0.028, 0.028, h=0.022); c.frame_arch(b, a1 - 0.030, 0.030, h=0.022)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (c.CAN_T[1](a) + d), c.SILL(a) + h)
        b.loft([[rail(a, 0.004, 0.012), rail(a, 0.018, 0.010), rail(a, 0.018, 0.034), rail(a, -0.012, 0.050), rail(a, -0.012, 0.022)] for a in stations(a0, a1, 0.07)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    fr_ = b.finish('canopy', sharp_deg=45)
    for o in (gl, fr_):
        for v in o.data.vertices: v.co -= pivot
    fr_.location = pivot; gl.parent = fr_; gl.location = (0, 0, 0)
    PARTS['canopy'] = dict(pivot=pivot.copy(), axis=Vector((0, -1, CAN_UP)).normalized(), range=(0.0, 0.75), kind='slide', note='фонарь: сдвиг назад по рельсам, метры (ось чуть вверх, поверх гаргрота); canopy_glass - дочерний объект')
    return [fr_, gl]


CAN_UP = 0.10


def windscreen():
    """Козырёк: стекло, дуга, цельная окантовка основания (борта и носок одним контуром) и две стойки лобового стекла от окантовки до дуги (Mark: рамки связаны между собой)."""
    a0 = c.CAN_A0 + 0.012; a1 = c.ARCH_A; b = B(); strip(b, [c.can_ring(a) for a in stations(c.CAN_A0 + 0.01, a1, 0.07)], G_GLASS); gl = b.finish('screen_glass', sharp_deg=60)
    b = B(); c.frame_arch(b, c.ARCH_A + 0.002, 0.030, h=0.022)
    hw = c.CAN_T[1]; rc = 0.075; path = []                         # (a, x, наружу по x, наружу вперёд)
    for a in stations(a0 + rc, a1 + 0.02, 0.05)[::-1]: path.append((a, hw(a), 1.0, 0.0))
    xc = hw(a0 + rc) - rc
    for q in range(1, 6): th = math.pi / 2 * q / 6; path.append((a0 + rc - rc * math.sin(th), xc + rc * math.cos(th), math.cos(th), math.sin(th)))
    for q in range(0, 9): path.append((a0, xc * (1 - 2 * q / 8), 0.0, 1.0))
    for q in range(5, 0, -1): th = math.pi / 2 * q / 6; path.append((a0 + rc - rc * math.sin(th), -(xc + rc * math.cos(th)), -math.cos(th), math.sin(th)))
    for a in stations(a0 + rc, a1 + 0.02, 0.05): path.append((a, -hw(a), -1.0, 0.0))
    def sec(a, x, ox, of):
        pt = lambda d, h: P3(a - of * d, x + ox * d, top_z(a - of * d, x + ox * d) + h)
        return [pt(-0.020, 0.012), pt(0.022, 0.000), pt(0.022, 0.026), pt(-0.020, 0.046)]
    b.loft([sec(*p) for p in path], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for q in (13, 26):                                              # стойки плоского лобового стекла: верхний конец кончается внутри дуги, нижний продолжен по прямой внутрь окантовки (Mark: не торчит и не закручен)
        rs_ = [[c.can_ring(a, -0.003)[q] + Vector((dx, 0, 0)) for dx in (-0.012, 0.012)] + [c.can_ring(a, -0.015)[q] + Vector((dx, 0, 0)) for dx in (0.012, -0.012)] for a in stations(a0 + 0.060, a1 - 0.012, 0.04)]
        c0 = sum(rs_[0], Vector()) / 4; c1 = sum(rs_[1], Vector()) / 4; xe = c0.x + (c0.x - c1.x) * 1.4; ae = a0 + 0.004      # конец стойки: то же сечение без поворота, центр внутри тела окантовки
        tg = P3(ae, xe, top_z(ae, xe) + 0.016); r0 = [v + (tg - c0) for v in rs_[0]]
        b.loft([r0] + rs_, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return [gl, b.finish('screen_frame', sharp_deg=45)]


def cockpit():
    ob = c.cockpit(); dy, dz = 0.88, -0.06      # приборная доска и прицел за дугой козырька, ниже стекла (Mark: прибор упирался в стекло)
    for v in ob.data.vertices: v.co.y += dy; v.co.z += dz
    return ob


def details():
    b = B(); xp = 0.39; z0 = 0.36
    strut(b, P3(-0.68, xp, z0 + 0.03), P3(0.30, xp, z0 + 0.03), 0.014, G_METAL, 10); strut(b, P3(0.30, xp, z0 + 0.03), P3(1.75, xp, z0), 0.026, G_SKIN, 10)       # штанга ПВД над заборником, смещена вправо (su7_05)
    for a_ in (0.75, 1.35): b.loft([[P3(a_ + da, xp - 0.010, top_z(a_, xp) - 0.02), P3(a_ + da, xp + 0.010, top_z(a_, xp) - 0.02), P3(a_ + da, xp + 0.008, z0 + 0.02), P3(a_ + da, xp - 0.008, z0 + 0.02)] for da in (-0.06, 0.06)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for sg in (1, -1): b.loft([[P3(-0.30 + da, xp + sg * 0.012, z0 + 0.03 + dz) for da, dz in ((0, -0.004), (0.10, -0.004), (0.10, 0.004), (0, 0.004))], [P3(-0.25 + da * 0.4, xp + sg * 0.10, z0 + 0.03 + dz * 0.5) for da, dz in ((0, -0.004), (0.10, -0.004), (0.10, 0.004), (0, 0.004))]], G_METAL, cap0=G_METAL, cap1=G_METAL)
    b.loft([[P3(6.2 + da, -0.006, SPINE[0](6.2) - 0.01), P3(6.2 + da, 0.006, SPINE[0](6.2) - 0.01), P3(6.3 + da * 0.5, 0.004, SPINE[0](6.2) + h_), P3(6.3 + da * 0.5, -0.004, SPINE[0](6.2) + h_)] for da, h_ in ((0.0, 0.26), (0.22, 0.26))], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)   # антенна на гаргроте
    b.loft([[P3(15.85 + da, -0.02 * f_, FIN_TOP - 0.05 * f_), P3(15.85 + da, 0.02 * f_, FIN_TOP - 0.05 * f_), P3(15.85 + da, 0.02 * f_, FIN_TOP - 0.004), P3(15.85 + da, -0.02 * f_, FIN_TOP - 0.004)] for da, f_ in ((-0.25, 1.0), (0.10, 0.9), (0.28, 0.25))], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)   # обтекатель на вершине киля
    # два длинных обтекателя проводки по верху фюзеляжа (su7_01, 03)
    for sx in (1, -1):
        th = math.radians(40); rings = []
        for a, f_ in [(4.70, 0.05), (4.90, 0.7)] + [(a_, 1.0) for a_ in stations(5.10, 10.20, 0.30)] + [(10.40, 0.7), (10.60, 0.05)]:
            R = fr(a); p = Vector((sx * R * math.sin(th), 0, fz(a) + R * math.cos(th))); n_ = Vector((sx * math.sin(th), 0, math.cos(th))); t_ = Vector((sx * math.cos(th), 0, -math.sin(th))); w = 0.060 * f_; h = 0.055 * f_
            ring = [P3(a, 0, 0) + p + t_ * (w * math.cos(u)) + n_ * (h * math.sin(u) - 0.006) for u in [math.pi * q / 6 for q in range(7)]]
            rings.append(ring if sx > 0 else ring[::-1])
        b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('det_probe', sharp_deg=40)


def brake(name, sx, t0d, t1d, a0=10.87, a1=11.87):
    """Тормозной щиток на хвостовой части: петля по передней кромке, открывается наружу."""
    t0, t1 = math.radians(t0d), math.radians(t1d); pt = lambda a, th, dr: P3(a, sx * (fr(a) + dr) * math.sin(th), fz(a) - (fr(a) + dr) * math.cos(th)); b = B(); rings = []
    for i in range(7):
        a = a0 + (a1 - a0) * i / 6; r = [pt(a, t0 + (t1 - t0) * j / 6, 0.018) for j in range(7)] + [pt(a, t1 - (t1 - t0) * j / 6, 0.003) for j in range(7)]; rings.append(r if sx < 0 else r[::-1])
    b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN); ob = b.finish(name, sharp_deg=40)
    p0, p1 = pt(a0, t0, 0.0), pt(a0, t1, 0.0); pivot = (p0 + p1) / 2; ax = (p1 - p0).normalized(); rear = pt(a1, (t0 + t1) / 2, 0.0); q = Matrix.Rotation(math.radians(10), 4, ax) @ (rear - pivot) + pivot
    if math.hypot(q.x, q.z - fz(a1)) < math.hypot(rear.x, rear.z - fz(a1)): ax = -ax
    _rel(ob, pivot); PARTS[name] = dict(pivot=pivot.copy(), axis=ax, range=(0.0, 50.0), note='тормозной щиток на хвостовой части фюзеляжа: петля по передней кромке; плюс - задняя кромка от фюзеляжа')
    return ob


# ── пилоны: по два под крылом (снаружи основных стоек) и два под фюзеляжем рядом ──
PYL_W = (('i', 2.600, 8.30, 10.00), ('o', 3.400, 9.75, 11.15))
PYL_F = (('f', 0.400, 5.30, 6.70),)


def pylon_w(sx, tag, x, a0, a1):
    b = B(); name = f'pylon_{tag}_' + ('r' if sx > 0 else 'l'); hw = 0.050; am = (a0 + a1) / 2; cc = TE(x) - LE(x)
    zt = lambda a: WZ - TC(x) * cc * thk((a - LE(x)) / cc) + 0.012; zb = zt(am) - 0.30
    def sec(a, f=1.0, dz=0.0): return [P3(a, sx * x - hw * f, zb + dz), P3(a, sx * x + hw * f, zb + dz), P3(a, sx * x + hw * f * 0.8, zt(a)), P3(a, sx * x - hw * f * 0.8, zt(a))]
    st = [a0, a0 + 0.12, a0 + 0.35, a1 - 0.35, a1 - 0.12, a1]; fs = [0.10, 0.7, 1.0, 1.0, 0.7, 0.10]; dz = [0.18, 0.05, 0.0, 0.0, 0.04, 0.14]
    b.loft([sec(a, f, d_) for a, f, d_ in zip(st, fs, dz)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); PYLON_PTS[name] = P3(am, sx * x, zb)
    return b.finish(name, sharp_deg=40)


def pylon_f(sx, tag, x, a0, a1):
    b = B(); name = f'pylon_{tag}_' + ('r' if sx > 0 else 'l'); hw = 0.050; am = (a0 + a1) / 2; zs = lambda a: fz(a) - fr(a) * math.sqrt(max(0.0, 1 - (x / FT[2](a)) ** 2)) + 0.02; zb = zs(am) - 0.16
    def sec(a, f=1.0, dz=0.0): return [P3(a, sx * x - hw * f, zb + dz), P3(a, sx * x + hw * f, zb + dz), P3(a, sx * x + hw * f, zs(a)), P3(a, sx * x - hw * f, zs(a))]
    st = [a0, a0 + 0.12, a0 + 0.35, a1 - 0.35, a1 - 0.12, a1]; fs = [0.10, 0.7, 1.0, 1.0, 0.7, 0.10]; dz = [0.10, 0.03, 0.0, 0.0, 0.03, 0.09]
    b.loft([sec(a, f, d_) for a, f, d_ in zip(st, fs, dz)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); PYLON_PTS[name] = P3(am, sx * x, zb)
    return b.finish(name, sharp_deg=40)


def tank(name, top, ln, r):
    """Подвесной бак: отдельная часть, верх бака в точке пилона; в файле игры не выгружается."""
    n = 28; a0 = -ln * 0.52; a1 = ln * 0.48; T = Track([(a0, 0.01), (a0 + 0.10, r * 0.28), (a0 + 0.50, r * 0.72), (a0 + 1.20, r), (a1 - 1.50, r), (a1 - 0.60, r * 0.66), (a1 - 0.08, r * 0.2), (a1, 0.01)]); b = B()
    b.loft([[Vector((T(a) * math.sin(2 * math.pi * q / n), -a, -r - T(a) * math.cos(2 * math.pi * q / n))) for q in range(n)] for a in stations(a0, a1, 0.14)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for sg in (1, -1): b.loft([[Vector((sg * (T(a1 - 0.7) * 0.7 + d_), -(a1 - 0.85 + da), -r + dz)) for da, dz in ((0, -0.006), (0.50 - d_ * 1.2, -0.006), (0.50 - d_ * 1.2, 0.006), (0, 0.006))] for d_ in (0.0, 0.22)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    ob = b.finish(name, sharp_deg=40); ob.location = top
    PARTS[name] = dict(pivot=top.copy(), axis=Vector((0, 0, 1)), range=None, note='подвесной бак: отдельная часть, начало - верх бака под пилоном; в файле игры его нет (su7_sketchfab.glb - есть)')
    return ob


def build_skin():
    S = [fore(), spine(), wing_s(1), wing_s(-1)]; host = S[0]
    for o in S[1:]: _apply_bool(host, o, 'UNION'); _drop(o)
    for cu in (duct_cut(), c.bore_cut(), c.cock_cut()): _apply_bool(host, cu, 'DIFFERENCE'); _drop(cu)
    host.name = 'SU7_skin'; host.data.name = 'SU7_skin'; bvh_ready(host)
    return host


def plane(stage=9):
    """Этапы: 1 - обшивка; 2 - оперение, сопло, механизация; 3 - кабина, фонарь, щитки, пилоны, баки; 4 - шасси."""
    PARTS.clear(); PYLON_PTS.clear(); skin = build_skin(); out = [skin]
    if stage >= 2:
        out += [c.fin(), c.rudder(), c.stab(1), c.stab(-1), c.nozzle(), c.burner(), cone(), details()] + c.chute()
        for sx, t in ((1, 'r'), (-1, 'l')):
            out += [wing_part('flap_' + t, FLAP, HF, sx, (0.0, 24.0), 'закрылок: ось в центре круглого носа; плюс - вниз'), wing_part('ail_' + t, AIL, HA, sx, (-18.0, 18.0), 'элерон: плюс - вниз'), fence(sx)]
    if stage >= 3:
        out += canopy() + windscreen() + [cockpit()]
        for sx, t in ((1, 'r'), (-1, 'l')):
            out += [brake('brake_u_' + t, sx, 112, 150), brake('brake_d_' + t, sx, 30, 68)]
            for tag, x, a0, a1 in PYL_W: out.append(pylon_w(sx, tag, x, a0, a1))
            for tag, x, a0, a1 in PYL_F: out.append(pylon_f(sx, tag, x, a0, a1))
            if TANKS: out += [tank('tank_f_' + t, PYLON_PTS['pylon_f_' + t] + Vector((0, 0.20, 0)), 4.20, 0.235), tank('tank_w_' + t, PYLON_PTS['pylon_i_' + t], 3.60, 0.235)]
        PYLON_PTS['center'] = P3(8.80, 0.0, FT[1](8.80) - 0.02)      # контейнер по оси за подфюзеляжными пилонами, между основными стойками
    if stage >= 4: out += c.gear_nose() + c.gear_main(1) + c.gear_main(-1)
    return out
