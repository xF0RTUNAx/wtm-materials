# su17_geo.py - геометрия Су-17М4 для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z.
# a - расстояние от острия конуса воздухозаборника (L = 18,20 до конца киля; штанга ПВД выступает вперёд ещё на 1,6 м), z - высота над осью кромки заборника.
# Размеры: чертёж su17_01 (26,65 пикс/м по размаху 10,02 м при сложенных консолях: a = (x - 51) / 26,65; сбоку z = (92 - y) / 26,65, сверху x = (427 - y) / 26,65).
# Общие узлы (фюзеляж-труба, конус, киль, руль, стабилизатор, сопло, кабина, стойки) взяты из su17_core.py - копии mig21_geo.py; здесь таблицы Су-17 и своё крыло с поворотными консолями.
import math, os, inspect
import bpy, bmesh
from mathutils import Vector, Matrix
from modelkit import B
import su17_base as fb
from su17_base import *
from su17_base import _apply_bool, _drop, _rel
import su17_core as c
from su17_gk import tube, collar, box, link, hose, wheel, X, F, U, R_, G_BELT, G_HANDLE

PARTS = fb.PARTS; L = fb.L; PYLON_PTS = c.PYLON_PTS
SW_FILE, SW_MIN, SW_MAX = 63.0, 30.0, 63.0
SWEEP = float(os.environ.get('SU17_SWEEP', SW_FILE))


def patchf(name, reps):
    """Функция из su17_core с заменой чисел в исходнике (ниши, станции)."""
    if not hasattr(c, '_SRC'): c._SRC = {}
    if name not in c._SRC: c._SRC[name] = inspect.getsource(getattr(c, name))      # исходник берётся один раз: у подменённой функции его уже не достать
    src = c._SRC[name]
    for a_, b_ in reps:
        if a_ not in src: print('НЕТ В', name, ':', a_[:50])
        src = src.replace(a_, b_)
    exec(compile(src, 'su17_core:' + name, 'exec'), c.__dict__)


# ── таблицы Су-17 ──
c.GROUND_Z = GROUND_Z = -2.030
c.LIP_A = LIP_A = 0.50; c.NOZ_A0 = NOZ_A0 = 16.25
c.FORE = FORE = [(0.50, 0.440, -0.420, 0.450), (0.56, 0.462, -0.442, 0.472), (1.00, 0.550, -0.460, 0.560), (1.85, 0.720, -0.470, 0.700), (3.00, 0.880, -0.480, 0.760), (4.30, 0.980, -0.490, 0.790),
                 (6.00, 1.060, -0.500, 0.800), (11.00, 1.080, -0.500, 0.800), (13.50, 1.020, -0.450, 0.760), (15.20, 0.900, -0.360, 0.680), (16.25, 0.800, -0.280, 0.600)]
c.FT = FT = tracks(FORE)
fz, fr, side_x, top_z = c.fz, c.fr, c.side_x, c.top_z
c.NOZ_Z = NOZ_Z = 0.260; c.NOZ_R0 = 0.548; c.NOZ_R = NOZ_R = 0.480; c.NOZ_A = NOZ_A = 16.80
c.F_LE = Lin([(0.50, 11.80), (0.90, 12.55), (1.30, 13.30), (3.38, 17.20)]); c.F_TE = Lin([(0.50, 16.20), (0.90, 16.42), (1.20, 16.85), (3.38, 18.15)]); c.FIN_TOP = FIN_TOP = 3.38   # Mark: киль прилегает к корпусу - основание уходит в фюзеляж, задняя кромка у корня не висит за ним
c.RUD = (1.55, 3.00); c.RUD_C = Track([(1.55, 0.620), (3.00, 0.500)])
c.CHUTE = (15.10, 17.12, 0.985, 0.120)   # Mark: контейнер парашюта не торчит трубой, а утоплен в основание киля, наружу только короткий конус (su17_10, 11)
c.STAB_Z = STAB_Z = -0.100; c.STAB_A = 16.20; c.SXR = 0.540; c.SXT = 2.400
c.S_LE = Lin([(0.540, 14.29), (2.400, 16.80)]); c.S_TE = Lin([(0.540, 16.83), (2.400, 17.95)])
c.CAN_A0, c.ARCH_A, c.CAN_A1 = 2.35, 3.05, 4.32
c.CAN_T = tracks([(2.35, 0.800, 0.200), (2.65, 1.050, 0.300), (3.05, 1.280, 0.360), (3.50, 1.370, 0.375), (3.90, 1.385, 0.370), (4.32, 1.365, 0.340)])
c.NG = dict(a=4.30, hinge=(4.45, -0.400), rw=0.330, ww=0.160)
c.MG = dict(a=9.65, x=1.950, rw=0.410, ww=0.230, T=(9.60, 1.720))
WZ = -0.220
c.wy = lambda x: WZ

patchf('fin', [("ys = [0.55, 0.75, 0.95, RUD[0] - 0.004, RUD[0]]", "ys = [0.50, 0.70, 0.90, 1.10, 1.30, RUD[0] - 0.004, RUD[0]]"), ("[RUD[1] + 0.004, 2.18, 2.35, 2.42, 2.50, 2.56, FIN_TOP]", "[RUD[1] + 0.004, 3.12, 3.24, 3.32, FIN_TOP]")])
patchf('stab', [("xr0 = side_x(13.2, STAB_Z)", "xr0 = side_x(15.6, STAB_Z)"), ("+ 0.022; out.append", "+ 0.012; out.append"), ("side_x(min(max(a_, 12.0), NOZ_A0), p.z)", "max(0.44, side_x(min(max(a_, 14.0), NOZ_A0), p.z))"), ("range=(-18.0, 8.0)", "range=(-16.0, 8.0)")])
patchf('cock_cut', [("[P3(a, -hw, 0.02), P3(a, hw, 0.02), P3(a, hw, 2.2), P3(a, -hw, 2.2)]", "[P3(a, -hw, 0.30), P3(a, hw, 0.30), P3(a, hw, 2.4), P3(a, -hw, 2.4)]"), ("stations(3.30, 4.96, 0.07)", "stations(2.74, 4.24, 0.07)")])
patchf('chute', [("prof = [(a0, 0.02), (a0 + 0.12, r * 0.8), (a0 + 0.35, r), (a1 - 0.22, r), (a1 - 0.2, r * 0.98)]", "prof = [(a0, 0.02), (a0 + 0.70, r * 0.45), (a0 + 1.25, r * 0.88), (a0 + 1.50, r), (a1 - 0.22, r), (a1 - 0.2, r * 0.98)]")])      # каплей: спереди сходит в киль
patchf('gear_nose', [("stations(1.55, 2.85, 0.18)", "stations(3.25, 4.60, 0.18)")])
patchf('gear_main', [("tgt = P3(MG['T'][0] + 0.25, sx * 0.34, -0.25) - T", "tgt = P3(MG['T'][0] + 0.10, sx * 0.55, -0.10) - T")])


def fore():
    st = [0.50, 0.512, 0.53, 0.56, 0.62] + stations(0.75, 16.10, 0.18) + [NOZ_A0]
    return loft_obj('s_fore', [sup(a, 0.0, FT[0](a), FT[1](a), FT[2](a), 2.0, 2.0, 72) for a in st])


SPINE = tracks([(4.34, 1.405, 0.340), (5.00, 1.400, 0.340), (7.50, 1.390, 0.330), (9.40, 1.230, 0.300), (11.50, 1.240, 0.270), (13.30, 1.250, 0.200), (14.60, 1.200, 0.080)])


def spine():
    rings = []
    for a in stations(4.34, 14.60, 0.18):
        top, hw = SPINE[0](a), SPINE[1](a); n = 28; ring = []; zb = FT[0](a) - 0.30
        for i in range(n):
            th = -math.pi / 2 + 2 * math.pi * i / n; cs, sn = math.cos(th), math.sin(th)
            x = hw * math.copysign(abs(cs) ** (2 / 2.8), cs); z = zb + (top - zb) * abs(sn) ** (2 / 2.8) if sn > 0 else zb + 0.4 * sn
            ring.append(P3(a, x * (1.0 if sn > 0 else 1.3), z))
        rings.append(ring)
    return loft_obj('s_spine', rings, sharp=40)


def duct_cut():
    prof = [(0.25, 0.405), (0.51, 0.405), (0.70, 0.400), (2.00, 0.380), (2.60, 0.200), (2.65, 0.020)]; n = 56
    return loft_obj('c_duct', [[P3(a, r * math.sin(2 * math.pi * q / n), fz(max(a, LIP_A)) - r * math.cos(2 * math.pi * q / n)) for q in range(n)] for a, r in prof], G_DUCT, sharp=25)


def cone():
    n = 40; cz = fz(LIP_A); pivot = P3(1.30, 0.0, cz); prof = [(0.0, 0.006), (0.05, 0.040), (0.30, 0.150), (0.50, 0.225), (0.90, 0.315), (1.30, 0.345), (1.90, 0.300), (2.50, 0.160)]
    ob = loft_obj('cone', [[P3(a, r * math.sin(2 * math.pi * q / n), cz - r * math.cos(2 * math.pi * q / n)) - pivot for q in range(n)] for a, r in prof], G_SKIN, sharp=30); ob.location = pivot
    PARTS['cone'] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(0.0, 0.20), kind='slide', note='конус воздухозаборника: сдвиг вдоль оси, метры; плюс - вперёд (в файле убран)')
    return ob


# ── крыло: неподвижная часть со стреловидностью 63° и поворотная консоль (в файле сложена, 63°) ──
XR, XF = 0.70, 2.70
def LE_F(x): return 5.37 + 1.964 * (x - 0.79)
TE_F = 11.85
def TE_U(x): return 11.52 + 0.78 * (x - 0.80)                    # задняя кромка единого крыла: наискось от борта до законцовки (su17_08)
TC_U = Track([(0.70, 0.040), (1.95, 0.064), (2.70, 0.060), (5.00, 0.050)])
TCF = Track([(0.70, 0.040), (2.00, 0.085), (2.70, 0.100)])
FLAP_F = (1.000, 1.550); FLAP_FC = 0.55
DJ = ((9.12, 2.70), (12.42, 1.95))                                # стык неподвижной части и консоли идёт наискось: от гребня на передней кромке к излому задней (su17_01, 07)
PIV_A = 9.95; PIV_X = DJ[0][1] + (PIV_A - DJ[0][0]) * (DJ[1][1] - DJ[0][1]) / (DJ[1][0] - DJ[0][0])
XPR, XPT = 1.85, 4.97
def _tip(x): return max(0.0, (x - 4.82) / 0.15) ** 2                    # законцовка скруглена, как на чертеже su17_01
def LE_P(x): return LE_F(x) + 0.10 * _tip(x)
def _fl(x): return 1.0                                           # Mark: срез задней кромки начинается на поворотной части и идёт до самого конца крыла
def TE_P(x): return TE_U(x) - 0.22 * _tip(x) - 0.13 * _fl(x)
def TCP(x): return TC_U(x)
SLAT = (2.95, 4.80); SLAT_K = 0.13; FLAP_P = (2.82, 3.58); AIL = (3.88, 4.74); FLAP_PC, AIL_C = 0.50, 0.36
TRIM = 0.020
def _cut(r, t=TRIM): return (r[0] + t, r[1] - t)
def in_(x, r): return r[0] - 1e-6 <= x <= r[1] + 1e-6
def pivot_v(sx): return P3(PIV_A, sx * PIV_X, WZ)
def wrot(sx, sweep): return Matrix.Translation(pivot_v(sx)) @ Matrix.Rotation(math.radians(-sx * (sweep - SW_FILE)), 4, 'Z') @ Matrix.Translation(-pivot_v(sx))


def _dj_dir(sx): return Vector((sx * (DJ[1][1] - DJ[0][1]), -(DJ[1][0] - DJ[0][0]), 0)).normalized()      # вдоль стыка назад, к излому задней кромки
def _dj_n(sx): d = _dj_dir(sx); n = Vector((-d.y, d.x, 0)); return n if n.x * sx < 0 else -n               # нормаль стыка к фюзеляжу


def wedge(sx, grow=0.0):
    """Резак корня консоли: всё, что лежит за стыком со стороны фюзеляжа и не нужно, чтобы закрыть щель при 30°."""
    P = pivot_v(sx) + _dj_n(sx) * grow; d1 = _dj_dir(sx); d0 = Matrix.Rotation(math.radians(-sx * (SW_MAX - SW_MIN)), 3, 'Z') @ (-d1); nn = _dj_n(sx); R = 7.0
    poly = [P, P + d1 * R, P + (d1 + nn).normalized() * R, P + nn * R, P + (d0 + nn).normalized() * R, P + d0 * R]
    if sx < 0: poly = poly[::-1]
    return loft_obj('c_wedge', [[p + Vector((0, 0, z_)) for p in poly] for z_ in (-1.2, 1.2)], G_DARK, sharp=30)


def wing_fixed(sx):
    def sec(x):
        cc = TE_U(x) - LE_F(x); tc = TC_U(x); le = LE_F(x)
        if in_(x, _cut(FLAP_F)): ue, tail = cove_cut(le, cc, tc, TE_U(x) - FLAP_FC)
        else: ue = 1.0; tail = cove_wall(le, cc, tc, 1.0)
        return foil_ring(le, cc, tc, 0.0008, ue, 18, lambda a, h: P3(a, sx * x, WZ + h), tail=tail, head=cove_wall_f(le, cc, tc, 0.0008))
    xs = {XR, 0.85, 1.70, 1.85, 1.95, 2.05, 2.20, 2.40, 2.60, 2.75}; r = _cut(FLAP_F); xs |= {r[0] - 0.004, r[0], r[1], r[1] + 0.004}
    for i in range(1, 7): xs.add(round(r[0] + (r[1] - r[0]) * i / 7, 4))
    ob = loft_obj('s_wing', [sec(x) for x in sorted(xs)], sharp=48); _clip(ob, P3(DJ[0][0], sx * DJ[0][1], WZ), _dj_n(sx))
    return ob


def _clip(ob, co, no):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    r = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-5, plane_co=co, plane_no=no, clear_inner=True)
    ed = [e for e in r['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    if ed: bmesh.ops.edgeloop_fill(bm, edges=ed)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(ob.data); bm.free(); ob.data.update()


def root_plane(sx, d=0.0):
    """Корень консоли срезан так, чтобы в положении «вперёд» (30°) ничего не выходило ближе 2,05 м к оси самолёта."""
    th = math.radians(SW_MAX - SW_MIN); n = Vector((sx * math.cos(th), math.sin(th), 0))        # нормаль плоскости x = const положения 30°, перенесённая в положение 63°
    return pivot_v(sx) + n * (2.05 - PIV_X - d), n


def _psec(sx, x, grow=0.0):
    cc = TE_P(x) - LE_P(x) + 2 * grow; le = LE_P(x) - grow; tc = TCP(x) * (TE_P(x) - LE_P(x)) / cc + (2.2 * grow) / cc
    if grow: return foil_ring(le, cc, max(tc, 0.004), 0.0, 1.0, 16, lambda a, h: P3(a, sx * x, WZ + h))      # резак щели тоньше крыла: над карманом остаются верхняя и нижняя обшивки
    if in_(x, _cut(SLAT)): us, head = cove_cut_f(le, cc, tc, le + SLAT_K * cc)
    else: us = 0.0008; head = cove_wall_f(le, cc, tc, us)
    if in_(x, _cut(FLAP_P)): ue, tail = cove_cut(le, cc, tc, TE_P(x) - FLAP_PC)
    elif in_(x, _cut(AIL)): ue, tail = cove_cut(le, cc, tc, TE_P(x) - AIL_C)
    else: ue = 1.0; tail = cove_wall(le, cc, tc, 1.0)
    return foil_ring(le, cc, tc, us, ue, 18, lambda a, h: P3(a, sx * x, WZ + h), tail=tail, head=head)


def panel_fixed(sx):
    xs = {XPR, 1.95, 2.05, 2.20, 2.40, 2.60, 2.75, 3.62, 3.68, 3.74, 3.80, 3.84, 4.82, 4.87, 4.91, 4.94, 4.96, XPT}
    for r in (_cut(SLAT), _cut(FLAP_P), _cut(AIL)):
        xs |= {r[0] - 0.004, r[0], r[1], r[1] + 0.004}
        for i in range(1, 6): xs.add(round(r[0] + (r[1] - r[0]) * i / 6, 4))
    ob = loft_obj('wing_' + ('r' if sx > 0 else 'l'), [_psec(sx, x) for x in sorted(xs)], sharp=48); _clip(ob, P3(DJ[0][0], sx * DJ[0][1], WZ) - _dj_n(sx) * 0.004, -_dj_n(sx))      # корень консоли - ровно по стыку, зазор 4 мм
    return ob


def slot_cutter(sx):
    base = loft_obj('c_slot0', [_psec(sx, x, -0.012) for x in (XPR, 1.95, 2.05, 2.20, 2.40, 2.60, 2.75, 3.2, 3.8)], G_DARK, sharp=40); _clip(base, P3(DJ[0][0], sx * DJ[0][1], WZ) + _dj_n(sx) * 0.006, -_dj_n(sx))
    host = None; n = 22
    for i in range(n + 1):
        s = SW_MIN + (SW_MAX - SW_MIN) * i / n; o = base.copy(); o.data = base.data.copy(); bpy.context.scene.collection.objects.link(o); o.data.transform(wrot(sx, s))
        if host is None: host = o
        else: _apply_bool(host, o, 'UNION'); _drop(o)
    _drop(base); host.name = 'c_slot'
    return host


def _part(name, spec, chord, sx, rng, note):
    x0, x1 = _cut(spec); x0 += 0.012; x1 -= 0.012
    pv0 = P3(TE_P(x0) - chord, sx * x0, WZ); pv1 = P3(TE_P(x1) - chord, sx * x1, WZ); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    for i in range(9):
        x = x0 + (x1 - x0) * i / 8; cc = TE_P(x) - LE_P(x); ah = TE_P(x) - chord
        rings.append([v - pivot for v in foil_ring(LE_P(x), cc, TCP(x), (ah - LE_P(x)) / cc, 1.0, 9, lambda a, h: P3(a, sx * x, WZ + h), head=cove_nose(LE_P(x), cc, TCP(x), ah))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot; PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=rng, note=note)
    return ob


def slat(name, sx):
    xa, xb = _cut(SLAT); xa += 0.012; xb -= 0.012; hg = lambda x: LE_P(x) + SLAT_K * (TE_P(x) - LE_P(x))
    p0 = P3(hg(xa), sx * xa, WZ); p1 = P3(hg(xb), sx * xb, WZ); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized()
    if axis.x > 0: axis = -axis
    def sec(x):
        cc = TE_P(x) - LE_P(x); le = LE_P(x)
        return [v - pivot for v in foil_ring(le, cc, TCP(x), 0.0008, SLAT_K, 12, lambda a, h: P3(a, sx * x, WZ + h), tail=cove_tail(le, cc, TCP(x), hg(x)), head=cove_wall_f(le, cc, TCP(x), 0.0008))]
    ob = loft_obj(name, [sec(xa + (xb - xa) * i / 9) for i in range(10)], sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(0.0, 20.0), note='предкрылок консоли: ось в центре круглой задней части; плюс - носок вниз')
    return ob


def wing(sx):
    tag = 'r' if sx > 0 else 'l'; w = panel_fixed(sx); pv = pivot_v(sx); _rel(w, pv)
    out = [w, slat('slat_' + tag, sx), _part('flap_o_' + tag, FLAP_P, FLAP_PC, sx, (0.0, 30.0), 'закрылок консоли: плюс - вниз'), _part('ail_' + tag, AIL, AIL_C, sx, (-18.0, 18.0), 'элерон: плюс - вниз')]
    bpy.context.view_layer.update()
    for ch in out[1:]: ch.parent = w; ch.matrix_parent_inverse = w.matrix_world.inverted()
    M = wrot(sx, SWEEP); w.matrix_world = M @ w.matrix_world; bpy.context.view_layer.update()
    for ch in out[1:]:
        D = PARTS[ch.name]; D['pivot'] = M @ D['pivot']; D['axis'] = (M.to_3x3() @ D['axis']).normalized(); D['parent'] = w.name
    fwd = -sx * (SW_MIN - SWEEP)
    PARTS[w.name] = dict(pivot=pv.copy(), axis=Vector((0, 0, 1)), range=(min(0.0, fwd), max(0.0, fwd)), note=f'поворотная консоль на вертикальном шарнире у гребня; в файле сложена ({SWEEP:g}°), вперёд {SW_MIN:g}° = поворот на {fwd:+g}° вокруг +Z')
    return out


def flap_f(sx):
    name = 'flap_i_' + ('r' if sx > 0 else 'l'); x0, x1 = _cut(FLAP_F); x0 += 0.012; x1 -= 0.012
    pv0 = P3(TE_U(x0) - FLAP_FC, sx * x0, WZ); pv1 = P3(TE_U(x1) - FLAP_FC, sx * x1, WZ); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized(); axis = axis if axis.x > 0 else -axis; rings = []
    for i in range(9):
        x = x0 + (x1 - x0) * i / 8; cc = TE_U(x) - LE_F(x); ah = TE_U(x) - FLAP_FC
        rings.append([v - pivot for v in foil_ring(LE_F(x), cc, TC_U(x), (ah - LE_F(x)) / cc, 1.0, 9, lambda a, h: P3(a, sx * x, WZ + h), head=cove_nose(LE_F(x), cc, TC_U(x), ah))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot; PARTS[name] = dict(pivot=pivot.copy(), axis=axis, range=(0.0, 30.0), note='закрылок неподвижной части: плюс - вниз')
    return ob


def fence(sx):
    """Большой гребень на стыке неподвижной части и консоли (su17_01, 03)."""
    x = 2.50; b = B(); a0 = LE_F(x) + 0.02; a1 = 9.98; zt = lambda a: WZ + TC_U(x) * (TE_U(x) - LE_F(x)) * thk(max(0.0, (a - LE_F(x)) / (TE_U(x) - LE_F(x))))
    b.loft([[P3(a, sx * x - 0.008, zt(a) - 0.003), P3(a, sx * x + 0.008, zt(a) - 0.003), P3(a, sx * x + 0.005, zt(a) + h_), P3(a, sx * x - 0.005, zt(a) + h_)] for a, h_ in ((a0, 0.02), (a0 + 0.20, 0.20), (a0 + 0.60, 0.24), (a1 - 0.25, 0.20), (a1, 0.03))], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for a_, x_ in ((6.9, 1.42), (8.2, 2.02)):                      # малые гребни на неподвижной части
        zt2 = lambda a: WZ + TC_U(x_) * (TE_U(x_) - LE_F(x_)) * thk(max(0.0, (a - LE_F(x_)) / (TE_U(x_) - LE_F(x_))))
        b.loft([[P3(a, sx * x_ - 0.006, zt2(a) - 0.01), P3(a, sx * x_ + 0.006, zt2(a) - 0.01), P3(a, sx * x_ + 0.004, zt2(a) + h_), P3(a, sx * x_ - 0.004, zt2(a) + h_)] for a, h_ in ((LE_F(x_) + 0.05, 0.01), (LE_F(x_) + 0.25, 0.10), (LE_F(x_) + 1.5, 0.10), (LE_F(x_) + 1.8, 0.012))], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    strut(b, P3(4.70, sx * 0.98, WZ + 0.02), P3(LE_F(0.98) + 0.25, sx * 0.98, WZ + 0.02), 0.030, G_METAL, 10)     # ствол пушки в корне крыла
    return b.finish('det_fence_' + ('r' if sx > 0 else 'l'), sharp_deg=40)


def canopy():
    """Фонарь откидывается вверх-назад на заднем шарнире (su17_03)."""
    a0, a1 = c.ARCH_A + 0.060, c.CAN_A1 - 0.004; st = stations(a0 + 0.004, a1 - 0.004, 0.09); pivot = P3(a1 + 0.004, 0.0, c.CAN_T[0](a1) + 0.026)
    b = B(); strip(b, [c.can_ring(a) for a in st], G_GLASS); gl = b.finish('canopy_glass', sharp_deg=60)
    b = B(); c.frame_arch(b, a0 + 0.028, 0.028, h=0.022); c.frame_arch(b, a1 - 0.030, 0.030, h=0.022)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (c.CAN_T[1](a) + d), c.SILL(a) + h)
        b.loft([[rail(a, 0.004, 0.012), rail(a, 0.018, 0.010), rail(a, 0.018, 0.034), rail(a, -0.012, 0.050), rail(a, -0.012, 0.022)] for a in stations(a0, a1, 0.07)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    fr_ = b.finish('canopy', sharp_deg=45)
    for o in (gl, fr_):
        for v in o.data.vertices: v.co -= pivot
    fr_.location = pivot; gl.parent = fr_; gl.location = (0, 0, 0)
    PARTS['canopy'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, 50.0), note='фонарь: петля у задней кромки сверху; плюс - передняя кромка вверх; canopy_glass - дочерний объект')
    return [fr_, gl]


def cockpit():
    ob = c.cockpit(); dy, dz = 4.35 - 3.72, 0.30
    for v in ob.data.vertices: v.co.y += dy; v.co.z += dz
    return ob


def details():
    b = B(); z0 = top_z(1.0, 0.30) + 0.02
    strut(b, P3(-1.60, -0.30, z0 + 0.06), P3(-0.20, -0.30, z0 + 0.06), 0.016, G_METAL, 10); strut(b, P3(-0.20, -0.30, z0 + 0.06), P3(1.60, -0.30, z0 + 0.03), 0.028, G_SKIN, 10)       # главная штанга ПВД
    strut(b, P3(-0.45, 0.42, 0.02), P3(0.40, 0.42, 0.02), 0.012, G_METAL, 8); strut(b, P3(0.40, 0.42, 0.02), P3(1.30, 0.44, 0.02), 0.020, G_SKIN, 8)                            # вторая штанга на правом борту
    for sg in (1, -1): b.loft([[P3(-0.95 + da, -0.30 + sg * 0.014, z0 + 0.06 + dz) for da, dz in ((0, -0.004), (0.10, -0.004), (0.10, 0.004), (0, 0.004))], [P3(-0.90 + da * 0.4, -0.30 + sg * 0.11, z0 + 0.06 + dz * 0.5) for da, dz in ((0, -0.004), (0.10, -0.004), (0.10, 0.004), (0, 0.004))]], G_METAL, cap0=G_METAL, cap1=G_METAL)
    b.loft([[P3(8.2 + da, -0.006, 1.36), P3(8.2 + da, 0.006, 1.36), P3(8.3 + da * 0.5, 0.004, 1.36 + h_), P3(8.3 + da * 0.5, -0.004, 1.36 + h_)] for da, h_ in ((0.0, 0.30), (0.22, 0.30))], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('det_probe', sharp_deg=40)


def brake(name, sx, t0d, t1d, a0=12.90, a1=13.90):
    """Тормозной щиток на хвостовой части: петля по передней кромке, открывается наружу."""
    t0, t1 = math.radians(t0d), math.radians(t1d); pt = lambda a, th, dr: P3(a, sx * (fr(a) + dr) * math.sin(th), fz(a) - (fr(a) + dr) * math.cos(th)); b = B(); rings = []
    for i in range(7):
        a = a0 + (a1 - a0) * i / 6; r = [pt(a, t0 + (t1 - t0) * j / 6, 0.018) for j in range(7)] + [pt(a, t1 - (t1 - t0) * j / 6, 0.003) for j in range(7)]; rings.append(r if sx < 0 else r[::-1])
    b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN); ob = b.finish(name, sharp_deg=40)
    p0, p1 = pt(a0, t0, 0.0), pt(a0, t1, 0.0); pivot = (p0 + p1) / 2; ax = (p1 - p0).normalized(); rear = pt(a1, (t0 + t1) / 2, 0.0); q = Matrix.Rotation(math.radians(10), 4, ax) @ (rear - pivot) + pivot
    if math.hypot(q.x, q.z - fz(a1)) < math.hypot(rear.x, rear.z - fz(a1)): ax = -ax
    _rel(ob, pivot); PARTS[name] = dict(pivot=pivot.copy(), axis=ax, range=(0.0, 50.0), note='тормозной щиток на хвостовой части фюзеляжа: петля по передней кромке; плюс - задняя кромка от фюзеляжа')
    return ob


# ── пилоны: по два под неподвижной частью крыла и четыре под фюзеляжем (тандем по бокам) ──
PYL_W = (('o', 2.050, 9.00, 10.60), ('i', 1.120, 7.40, 9.40))
PYL_F = (('f', 0.420, 6.60, 8.50), ('a', 0.420, 9.70, 11.40))


def pylon_w(sx, tag, x, a0, a1):
    b = B(); name = f'pylon_{tag}_' + ('r' if sx > 0 else 'l'); hw = 0.050; am = (a0 + a1) / 2; cc = TE_U(x) - LE_F(x)
    zt = lambda a: WZ - TC_U(x) * cc * thk((a - LE_F(x)) / cc) + 0.012; zb = zt(am) - 0.30
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


def build_skin():
    S = [fore(), spine(), wing_fixed(1), wing_fixed(-1)]; host = S[0]
    for o in S[1:]: _apply_bool(host, o, 'UNION'); _drop(o)
    for cu in (duct_cut(), c.bore_cut(), c.cock_cut(), slot_cutter(1), slot_cutter(-1)): _apply_bool(host, cu, 'DIFFERENCE'); _drop(cu)
    host.name = 'SU17_skin'; host.data.name = 'SU17_skin'; bvh_ready(host)
    return host


def plane(stage=9):
    """Этапы: 1 - обшивка; 2 - оперение, сопло, консоли; 3 - кабина, фонарь, щитки, пилоны; 4 - шасси."""
    PARTS.clear(); PYLON_PTS.clear(); skin = build_skin(); out = [skin]
    if stage >= 2:
        out += [c.fin(), c.rudder(), c.stab(1), c.stab(-1), c.nozzle(), c.burner(), cone(), details()] + c.chute()
        for sx in (1, -1): out += wing(sx) + [flap_f(sx), fence(sx)]
    if stage >= 3:
        out += canopy() + c.windscreen() + [cockpit()]
        for sx, t in ((1, 'r'), (-1, 'l')):
            out += [brake('brake_u_' + t, sx, 112, 150), brake('brake_d_' + t, sx, 30, 68)]
            for tag, x, a0, a1 in PYL_W: out.append(pylon_w(sx, tag, x, a0, a1))
            for tag, x, a0, a1 in PYL_F: out.append(pylon_f(sx, tag, x, a0, a1))
        PYLON_PTS['center'] = P3(5.30, 0.0, FT[1](5.30) - 0.02)
    if stage >= 4: out += c.gear_nose() + c.gear_main(1) + c.gear_main(-1)
    return out
