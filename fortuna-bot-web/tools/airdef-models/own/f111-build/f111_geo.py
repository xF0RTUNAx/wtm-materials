# f111_geo.py - геометрия F-111F для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z.
# a - расстояние от кончика ПВД (полная длина L = 22,40, как у прежней модели игры), z - высота над осью сопел.
# Размеры: чертёж f111_06 (22,4 пикс/м: сверху a = (507 - x) / 22,4, сбоку a = (x - 233) / 22,3); фото 01-05 - детали. Крыло строится в положении 16° (как на чертеже) и поворачивается вокруг шарнира.
import math, os
import bpy, bmesh
from mathutils import Vector, Matrix
from modelkit import B
import f111_base as fb
from f111_base import *
from f111_base import _apply_bool, _drop, _rel

PARTS = fb.PARTS; L = fb.L
SW_FILE, SW_MIN, SW_MAX = 26.0, 16.0, 72.5
SWEEP = float(os.environ.get('F111_SWEEP', SW_FILE))

# ── центральное тело: нос с обтекателем РЛС, кабина-капсула, гаргрот, хвостовая балка между соплами ──
TIP = 0.76
FORE = [  # a, верх, низ, полуширина, n верха, n низа
    (0.76, 0.095, 0.065, 0.015, 2.0, 2.0), (0.82, 0.140, 0.030, 0.055, 2.0, 2.0), (0.95, 0.190, -0.010, 0.100, 2.0, 2.0), (1.25, 0.260, -0.050, 0.170, 2.0, 2.0), (1.70, 0.335, -0.095, 0.255, 2.0, 2.0),
    (2.20, 0.425, -0.135, 0.345, 2.0, 2.0), (2.80, 0.525, -0.180, 0.440, 2.0, 2.0), (3.54, 0.640, -0.230, 0.530, 2.0, 2.1), (4.20, 0.800, -0.250, 0.640, 2.1, 2.3), (4.60, 0.900, -0.250, 0.690, 2.2, 2.4),
    (5.20, 0.990, -0.255, 0.750, 2.4, 2.5), (6.50, 1.070, -0.280, 0.800, 2.6, 2.6), (7.20, 1.090, -0.300, 0.800, 2.6, 2.6), (7.45, 1.700, -0.310, 0.800, 2.2, 2.6), (9.30, 1.720, -0.450, 0.820, 2.2, 2.8),
    (11.00, 1.440, -0.520, 0.850, 2.4, 3.0), (12.00, 1.310, -0.560, 0.850, 2.6, 3.0), (13.00, 1.275, -0.580, 0.800, 2.6, 3.0), (16.50, 1.200, -0.550, 0.550, 2.6, 2.6), (19.00, 0.950, -0.400, 0.300, 2.4, 2.2),
    (19.90, 0.800, -0.300, 0.240, 2.2, 2.0), (21.20, 0.600, -0.150, 0.200, 2.0, 2.0), (22.00, 0.420, 0.050, 0.120, 2.0, 2.0), (22.36, 0.300, 0.180, 0.035, 2.0, 2.0)]
FT = tracks(FORE)
RAD_A = 3.54; TAIL_A = 22.36; NAC_A1 = 19.90


def fore_y(a, x):
    top, bot, hw, nt = FT[0](a), FT[1](a), FT[2](a), FT[3](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nt); return cy + ht * q ** (1 / nt)


def side_x(a, z):
    top, bot, hw, nt, nb = [t(a) for t in FT]; cy = (top + bot) / 2; ht = (top - bot) / 2; s = max(-0.999, min(0.999, (z - cy) / ht)); e = nt if s > 0 else nb
    return hw * max(0.0, 1 - abs(s) ** e) ** (1 / e)


def fore():
    st = [TIP + v for v in (0.0, 0.012, 0.03, 0.06, 0.10, 0.16, 0.24)] + stations(TIP + 0.34, 3.5, 0.12) + stations(3.6, 7.20, 0.18) + [7.24, 7.28, 7.32, 7.36, 7.40, 7.45] + stations(7.65, 22.0, 0.22) + [22.15, 22.28, TAIL_A]
    return loft_obj('s_fore', [sup(a, 0.0, *[t(a) for t in FT], 80) for a in st])


# ── задняя часть: широкий плоский короб с двумя двигателями ──
AFT = tracks([(11.20, 0.860, -0.450, 1.300, 5.0, 3.2), (12.00, 0.860, -0.540, 1.500, 6.0, 3.2), (13.00, 0.860, -0.580, 1.560, 6.0, 3.2), (17.00, 0.820, -0.580, 1.560, 6.0, 3.2), (18.20, 0.790, -0.575, 1.560, 5.0, 3.0), (18.80, 0.770, -0.470, 1.545, 4.5, 2.8), (19.40, 0.720, -0.100, 1.510, 3.5, 2.4), (19.90, 0.640, 0.300, 1.450, 2.6, 2.2)])


def aft():
    return loft_obj('s_aft', [sup(a, 0.0, *[t(a) for t in AFT], 96) for a in stations(11.20, NAC_A1, 0.22)], sharp=40)


NTAIL = tracks([(17.80, 0.790, -0.575, 0.760, 4.5), (18.50, 0.765, -0.578, 0.720, 3.4), (19.10, 0.690, -0.580, 0.655, 2.6), (19.55, 0.615, -0.580, 0.600, 2.15), (19.92, 0.578, -0.578, 0.578, 2.0)])


def ntail(sx):
    """Хвост гондолы: короб плавно сходит в круг обечайки сопла (Mark: корпус естественно переходит в сопла)."""
    return loft_obj('s_ntail', [sup(a, sx * NOZ_X, NTAIL[0](a), NTAIL[1](a), NTAIL[2](a), NTAIL[3](a), NTAIL[3](a), 64) for a in stations(17.80, 19.92, 0.12)], sharp=40)


def boom(sx):
    """Обтекатель у борта рядом с соплом: на нём сидит стабилизатор (f111_07)."""
    T = tracks([(16.55, 0.800, 0.420, 0.060), (17.00, 0.800, 0.340, 0.165), (18.60, 0.800, 0.280, 0.170), (19.90, 0.790, 0.240, 0.180), (20.35, 0.720, 0.340, 0.110), (20.75, 0.580, 0.500, 0.020)])
    return loft_obj('s_boom', [sup(a, sx * 1.415, T[0](a), T[1](a), T[2](a), 3.6, 3.6, 28) for a in stations(16.55, 20.75, 0.16)], sharp=40)


# ── воздухозаборники: четверть круга под наплывом у борта, дальше гондола переходит в короб ──
INL_A, TR_A1 = 9.45, 12.60
TR_X0, TR_Z1, TR_RX, TR_RZ = 0.800, 0.870, 0.720, 0.940
TR_C = (TR_X0 + 0.52 * TR_RX, TR_Z1 - 0.52 * TR_RZ)
TR_NOTCH = 0.46                                                 # Mark: в верхнем прямом углу вырезан сектор-четверть, выпуклости нет


def _inq(px, pz, k=1.0):
    c = TR_C; px = c[0] + (px - c[0]) / k; pz = c[1] + (pz - c[1]) / k
    q = ((px - TR_X0) / TR_RX) ** 2 + ((TR_Z1 - pz) / TR_RZ) ** 2
    return px >= TR_X0 and pz <= TR_Z1 and TR_NOTCH ** 2 <= q <= 1


def _inbox(px, pz): return (abs(px - 1.02) / 0.54) ** 3.2 + (abs(pz - 0.145) / 0.715) ** 3.2 <= 1


def _ray(fn, c, th):
    lo, hi = 0.0, 3.0
    for _ in range(26):
        m = (lo + hi) / 2
        if fn(c[0] + m * math.cos(th), c[1] + m * math.sin(th)): lo = m
        else: hi = m
    return c[0] + lo * math.cos(th), c[1] + lo * math.sin(th)


def trunk_ring(a, sx, t, k=1.0, n=96, dx=0.0):
    pts = []
    for i in range(n):
        th = -math.pi / 2 + 2 * math.pi * i / n; q = _ray(lambda x, z: _inq(x, z, k), TR_C, th)
        if t > 0: b_ = _ray(_inbox, (1.02, 0.145), th); q = (q[0] + (b_[0] - q[0]) * t, q[1] + (b_[1] - q[1]) * t)
        pts.append(P3(a, sx * (q[0] + dx), q[1]))
    return pts if sx > 0 else pts[::-1]


def trunk(sx):
    rings = []
    for a in stations(INL_A, TR_A1, 0.18):
        t = (a - INL_A - 0.35) / (TR_A1 - INL_A - 0.35); t = max(0.0, min(1.0, t)); rings.append(trunk_ring(a, sx, t * t * (3 - 2 * t)))
    return loft_obj('s_trunk', rings, G_SKIN, sharp=40)


def duct_cut(sx):
    rings = []; a0, a1 = INL_A - 0.25, INL_A + 2.50
    for i in range(12):
        a = a0 + (a1 - a0) * i / 11; t = max(0.0, (a - INL_A - 0.4) / (a1 - INL_A - 0.4)); t = t * t * (3 - 2 * t)
        rings.append(trunk_ring(a, sx, 0.0, k=0.90 - 0.45 * t, n=96, dx=0.10 * t))
    return loft_obj('c_duct', rings, G_DUCT, sharp=25)


SPIKE = (8.62, 10.35, 0.56)                                     # остриё, основание, радиус у основания


def spike(sx):
    """Подвижный конус воздухозаборника: четверть конуса в углу между бортом и наплывом; ходит вдоль оси."""
    a0, a1, r1 = SPIKE; n = 16; cx, cz = TR_X0 - 0.05, TR_Z1 + 0.05; A0, A1 = math.radians(-30), math.radians(115); name = 'spike_' + ('r' if sx > 0 else 'l'); pivot = P3(a1, sx * cx, cz)
    prof = [(a0, 0.045), (a0 + 0.10, 0.100), (a0 + 0.45, 0.250), (a0 + 0.83, 0.400), (a0 + 1.20, 0.500), (a1, r1 + 0.04), (a1 + 0.60, r1), (a1 + 1.10, r1 * 0.74)]
    def ring(a, r):
        pts = [P3(a, sx * cx, cz) - pivot] + [P3(a, sx * (cx + r * math.sin(A0 + (A1 - A0) * q / n)), cz - r * math.cos(A0 + (A1 - A0) * q / n)) - pivot for q in range(n + 1)]
        return pts if sx > 0 else pts[::-1]
    ob = loft_obj(name, [ring(a, r) for a, r in prof], G_SKIN, sharp=30); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(0.0, 0.45), kind='slide', note='конус воздухозаборника: сдвиг вдоль оси самолёта, метры; плюс - вперёд')
    return ob


# ── наплыв: треугольная плита от кабины до шарнира крыла, дальше крыша над корнем крыла ──
GL_LE = Lin([(7.70, 0.780), (12.05, 2.330)])
GL_AFT = Track([(12.05, 2.330), (12.30, 2.345), (12.70, 2.270), (13.20, 2.100), (13.70, 1.970), (15.30, 1.870), (16.20, 1.720), (17.00, 1.600), (17.60, 1.560)])
GL_TOP = Lin([(7.70, 1.100), (9.40, 1.200), (12.05, 1.265), (15.30, 1.265), (16.20, 1.200), (17.60, 0.840)])
GL_BOT = Lin([(7.70, 1.030), (9.40, 0.920), (12.05, 0.855), (17.60, 0.800)])
GL_W = Lin([(7.70, 0.55), (10.80, 0.55), (11.85, 0.13), (12.05, 0.10)])
def gl_xe(a): return GL_LE(a) if a <= 12.05 else GL_AFT(a)


def glove(sx):
    rings = []; n = 14; x_in = 0.30
    for a in stations(7.70, 12.05, 0.15) + stations(12.05, 17.60, 0.15)[1:]:
        xe = gl_xe(a); zm = (GL_TOP(a) + GL_BOT(a)) / 2; h = (GL_TOP(a) - GL_BOT(a)) / 2; w_ = min(GL_W(a), 0.7 * (xe - x_in)); lo = []; up = []
        kb = max(0.0, min(1.0, (a - 11.25) / 0.70)); kb = kb * kb * (3 - 2 * kb)              # позади угла кромка тупая: в ней щель крыла
        for i in range(n + 1):
            u = 1 - (1 - i / n) ** 1.8; x = x_in + (xe - x_in) * u; f = max(0.07, min(1.0, (xe - x) / w_) ** 0.6); f = f + (max(f, 0.985 if i < n else 0.93) - f) * kb
            lo.append(P3(a, sx * x, zm - h * f)); up.append(P3(a, sx * x, zm + h * f))
        ring = lo + up[::-1]; rings.append(ring if sx > 0 else ring[::-1])
    return loft_obj('s_glove', rings, G_SKIN, sharp=40)


# ── крыло изменяемой стреловидности: строится при 16°, шарнир вертикальный ──
PIV_A, PIV_X, WZ = 13.26, 2.14, 1.06
XRW, XTW = 1.25, 9.45
def LE_W(x): return 12.05 + 0.287 * (x - 2.33)
def TE_W(x): return 15.13 + 0.035 * (x - 2.33)
TCW = Track([(1.25, 0.094), (2.33, 0.094), (5.00, 0.086), (9.45, 0.076)])
SLAT_C = lambda x: 0.135 * (TE_W(x) - LE_W(x))
HINGE = lambda x: TE_W(x) - 0.255 * (TE_W(x) - LE_W(x))
SLATS = (('slat_i', (2.80, 6.00)), ('slat_o', (6.03, 9.30)))
FLAPS = (('flap_i', (2.85, 6.00)), ('flap_o', (6.03, 9.20)))
TRIM = 0.022
def _cut(r, t=TRIM): return (r[0] + t, r[1] - t)
def in_(x, r): return r[0] - 1e-6 <= x <= r[1] + 1e-6
def pivot_v(sx): return P3(PIV_A, sx * PIV_X, WZ)
def wrot(sx, sweep): return Matrix.Translation(pivot_v(sx)) @ Matrix.Rotation(math.radians(-sx * (sweep - SW_MIN)), 4, 'Z') @ Matrix.Translation(-pivot_v(sx))


def _wsec(sx, x):
    c = TE_W(x) - LE_W(x); tc = TCW(x); le = LE_W(x)
    if any(in_(x, _cut(r)) for _, r in SLATS): us, head = cove_cut_f(le, c, tc, le + SLAT_C(x))
    else: us = 0.0008; head = cove_wall_f(le, c, tc, us)
    if any(in_(x, _cut(r)) for _, r in FLAPS): ue, tail = cove_cut(le, c, tc, HINGE(x))
    else: ue = 1.0; tail = cove_wall(le, c, tc, 1.0)
    return foil_ring(le, c, tc, us, ue, 18, lambda a, h: P3(a, sx * x, WZ + h), tail=tail, head=head)


def _clip(ob, co, no):
    """Срез плоскостью с заглушкой: остаётся сторона нормали."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    r = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-5, plane_co=co, plane_no=no, clear_inner=True)
    ed = [e for e in r['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    if ed: bmesh.ops.edgeloop_fill(bm, edges=ed)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(ob.data); bm.free(); ob.data.update()


def root_plane(sx, d=0.0):
    """Корень крыла срезан так, чтобы при полной стреловидности ничего не заходило ближе 0,95 м к оси самолёта."""
    th = math.radians(SW_MAX - SW_MIN); n = Vector((sx * math.cos(th), sx * 0 + math.sin(th) * -1 * -1 * 0, 0))
    n = Vector((sx * math.cos(th), -math.sin(th), 0))           # нос +Y: «назад» = -Y
    return pivot_v(sx) + n * (0.95 - PIV_X - d), n


def wing_fixed(sx):
    xs = {XRW, 1.6, 2.0, 2.33, 2.6, XTW - 0.05, XTW}
    for _, r in SLATS + FLAPS:
        r = _cut(r); xs |= {r[0] - 0.004, r[0], r[1], r[1] + 0.004}
        for i in range(1, 7): xs.add(round(r[0] + (r[1] - r[0]) * i / 7, 4))
    ob = loft_obj('wing_' + ('r' if sx > 0 else 'l'), [_wsec(sx, x) for x in sorted(xs)], sharp=48)
    co, no = root_plane(sx); _clip(ob, co, no)
    return ob


def wing_part(name, spec, sx, rng, note):
    x0, x1 = _cut(spec); x0 += 0.012; x1 -= 0.012
    pv0 = P3(HINGE(x0), sx * x0, WZ); pv1 = P3(HINGE(x1), sx * x1, WZ); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    for i in range(11):
        x = x0 + (x1 - x0) * i / 10; c = TE_W(x) - LE_W(x); ah = HINGE(x)
        rings.append([v - pivot for v in foil_ring(LE_W(x), c, TCW(x), (ah - LE_W(x)) / c, 1.0, 9, lambda a, h: P3(a, sx * x, WZ + h), head=cove_nose(LE_W(x), c, TCW(x), ah))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=rng, note=note)
    return ob


def slat(name, spec, sx):
    xa, xb = _cut(spec); xa += 0.012; xb -= 0.012
    p0 = P3(LE_W(xa) + SLAT_C(xa), sx * xa, WZ); p1 = P3(LE_W(xb) + SLAT_C(xb), sx * xb, WZ); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized()
    if axis.x > 0: axis = -axis
    def sec(x):
        c = TE_W(x) - LE_W(x); le = LE_W(x); sl = SLAT_C(x)
        return [v - pivot for v in foil_ring(le, c, TCW(x), 0.0008, sl / c, 12, lambda a, h: P3(a, sx * x, WZ + h), tail=cove_tail(le, c, TCW(x), le + sl), head=cove_wall_f(le, c, TCW(x), 0.0008))]
    ob = loft_obj(name, [sec(xa + (xb - xa) * i / 9) for i in range(10)], sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(0.0, 22.0), note='предкрылок: ось в центре круглой задней части; плюс - носок вниз')
    return ob


def slot_cutter(sx):
    """Объём, который корень крыла проходит от 16° до 72,5°: им вырезается щель в наплыве."""
    def sec(x):
        c = TE_W(x) - LE_W(x) + 0.07; le = LE_W(x) - 0.035; tc = TCW(x) * (TE_W(x) - LE_W(x)) / c + 0.034 / c
        return foil_ring(le, c, tc, 0.0, 1.0, 16, lambda a, h: P3(a, sx * x, WZ + h))
    base = loft_obj('c_slot0', [sec(x) for x in (1.10, 1.6, 2.0, 2.5, 3.2, 4.0, 5.0, 6.2)], G_DARK, sharp=40)
    co, no = root_plane(sx, 0.035); _clip(base, co, no)
    host = None; n = 32
    for i in range(n + 1):
        s = SW_MIN + (SW_MAX - SW_MIN) * i / n; o = base.copy(); o.data = base.data.copy(); bpy.context.scene.collection.objects.link(o); o.data.transform(wrot(sx, s))
        if host is None: host = o
        else: _apply_bool(host, o, 'UNION'); _drop(o)
    _drop(base); host.name = 'c_slot'
    return host


def wing(sx):
    """Консоль с предкрылками и закрылками; строится при 16°, потом поворачивается в положение файла."""
    tag = 'r' if sx > 0 else 'l'; w = wing_fixed(sx); pv = pivot_v(sx); _rel(w, pv); out = [w]
    for nm, r in SLATS: out.append(slat(nm + '_' + tag, r, sx))
    for nm, r in FLAPS: out.append(wing_part(nm + '_' + tag, r, sx, (0.0, 35.0), 'закрылок: ось в центре круглого носа; плюс - вниз'))
    bpy.context.view_layer.update()
    for c in out[1:]: c.parent = w; c.matrix_parent_inverse = w.matrix_world.inverted()
    M = wrot(sx, SWEEP); w.matrix_world = M @ w.matrix_world; bpy.context.view_layer.update()
    for c in out[1:]:
        D = PARTS[c.name]; D['pivot'] = M @ D['pivot']; D['axis'] = (M.to_3x3() @ D['axis']).normalized(); D['parent'] = w.name
    PARTS[w.name] = dict(pivot=pv.copy(), axis=Vector((0, 0, 1)), range=((SW_MIN - SWEEP) * -sx, (SW_MAX - SWEEP) * -sx) if sx > 0 else ((SW_MAX - SWEEP) * -sx * -1 * -1, (SW_MIN - SWEEP) * -sx * -1 * -1),
                         note=f'консоль на вертикальном шарнире; в файле стреловидность {SWEEP:g}°, вперёд {SW_MIN:g}°, сложено {SW_MAX:g}°; поворот на градус стреловидности = {-sx:+d}° вокруг +Z')
    return out


# ── киль и руль ──
FIN_T = 0.045
F_LE = Lin([(0.50, 16.34), (0.65, 16.55), (3.30, 20.20)])
F_TE = Lin([(0.20, 20.90), (3.44, 22.40)])
FIN_TOP = 3.36
RUD = (1.25, 3.15)
RUD_C = Track([(1.25, 0.620), (3.15, 0.500)])


def fin():
    ys = [0.60, 0.80, 1.00, 1.15, RUD[0] - 0.004, RUD[0]] + [RUD[0] + (RUD[1] - RUD[0]) * i / 8 for i in range(1, 9)] + [RUD[1] + 0.004, 3.26, FIN_TOP]
    rings = []
    for y in sorted(set(round(v, 4) for v in ys)):
        c = F_TE(y) - F_LE(y)
        if RUD[0] - 1e-6 <= y <= RUD[1] + 1e-6: ue, tail = cove_cut(F_LE(y), c, FIN_T, F_TE(y) - RUD_C(y), 0.006)
        else: ue, tail = 1.0, cove_wall(F_LE(y), c, FIN_T, 1.0)
        rings.append(foil_ring(F_LE(y), c, FIN_T, 0.0008, ue, 16, lambda a, h: P3(a, h, y), tail=tail, head=cove_wall_f(F_LE(y), c, FIN_T, 0.0008)))
    b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    # обтекатель на вершине киля (f111_07)
    T = tracks([(20.05, 0.010), (20.30, 0.060), (20.90, 0.085), (21.80, 0.085), (22.25, 0.060), (22.44, 0.012)])
    b.loft([[P3(a, T[0](a) * math.cos(2 * math.pi * q / 20), FIN_TOP + 0.02 + T[0](a) * 1.15 * math.sin(2 * math.pi * q / 20)) for q in range(20)] for a in stations(20.05, 22.44, 0.12)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('fin_c', sharp_deg=48)


def rudder():
    y0, y1 = RUD; h0 = F_TE(y0) - RUD_C(y0); h1 = F_TE(y1) - RUD_C(y1); p0 = P3(h0, 0.0, y0); p1 = P3(h1, 0.0, y1); pivot = (p0 + p1) / 2; axis = (p1 - p0).normalized(); rings = []
    for i in range(11):
        y = y0 + 0.006 + (y1 - y0 - 0.012) * i / 10; c = F_TE(y) - F_LE(y); ah = F_TE(y) - RUD_C(y)
        rings.append([v - pivot for v in foil_ring(F_LE(y), c, FIN_T, (ah - F_LE(y)) / c, 1.0, 9, lambda a, h: P3(a, h, y), head=cove_nose(F_LE(y), c, FIN_T, ah))])
    ob = loft_obj('rudder', rings, sharp=48); ob.location = pivot
    PARTS['rudder'] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-22.0, 22.0), note='ось в центре круглого носа, снизу вверх')
    return ob


# ── цельноповоротный стабилизатор у борта, рядом с соплом ──
STAB_Z, STAB_A, SXR, SXT, STAB_GAP = 0.680, 19.75, 1.612, 4.20, 0.025
S_LE = Lin([(SXR, 17.05), (SXT, 21.335)])
S_TE = Lin([(SXR, 21.75), (3.30, 22.05), (SXT, 21.50)])


def stab(sx):
    name = 'stab_' + ('r' if sx > 0 else 'l'); pivot = P3(STAB_A, sx * SXR, STAB_Z); rings = []
    for s in (0.0, 0.04, 0.10, 0.20, 0.32, 0.46, 0.58, 0.66, 0.74, 0.84, 0.92, 0.97, 1.0):
        xn = SXR + (SXT - SXR) * s; c = S_TE(xn) - S_LE(xn)
        rings.append([p - pivot for p in foil_ring(S_LE(xn), c, 0.045 - 0.010 * s, 0.0, 1.0, 22, lambda a, h: P3(a, sx * xn, STAB_Z + h))])
    b = B(); r0 = rings[0]; nr = len(r0); inner = [(r0[k] + r0[nr - 1 - k]) / 2 for k in range(nr)]
    b.loft([inner] + rings, G_SKIN, cap1=G_SKIN)
    n = 14; rg = lambda x_, r: [P3(STAB_A + r * math.cos(2 * math.pi * k / n), sx * x_, STAB_Z + r * math.sin(2 * math.pi * k / n)) - pivot for k in range(n)]
    b.loft([rg(SXR - 0.10, 0.060), rg(SXR + 0.03, 0.060)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    ob = b.finish(name, sharp_deg=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(-25.0, 12.0), note='цельноповоротный; ось поперёк у борта; плюс - задняя кромка вниз')
    return ob


# ── сопла: обечайка и длинные лепестки (f111_07, 08) ──
NOZ_X, NOZ_Z, NOZ_R0, NOZ_R, NOZ_A = 0.800, 0.000, 0.560, 0.440, 21.65


def nozzle(sx):
    b = B(); cx = sx * NOZ_X; N = 18; a0 = NAC_A1 + 0.002; a1 = NOZ_A; aM = a0 + 0.30; aP = a0 + 0.31
    def ptp(a, r, ang): return P3(a, cx + r * math.sin(ang), NOZ_Z - r * math.cos(ang))
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
        b.loft([box_sect(a1 - 0.002, NOZ_R - th - 0.003, am, hwi, -0.006), box_sect(a1 - 0.45, 0.44, am, hwi, -0.006), box_sect(a0 + 0.03, 0.50, am, hwi, -0.006)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('nozzle_' + ('r' if sx > 0 else 'l'), sharp_deg=30)


def bore_cut(sx):
    a1 = NAC_A1; n = 64; cx = sx * NOZ_X; ring = lambda a, r: [P3(a, cx + r * math.sin(2 * math.pi * k / n), NOZ_Z - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    prof = [(a1 + 0.25, 0.520, G_METAL), (a1 - 0.18, 0.520, G_METAL), (a1 - 0.22, 0.495, G_METAL), (a1 - 0.30, 0.495, G_METAL), (a1 - 0.34, 0.520, G_METAL), (a1 - 0.80, 0.520, G_COCK), (a1 - 1.10, 0.520, G_DARK), (a1 - 1.50, 0.340, G_DARK), (a1 - 1.62, 0.050, G_DARK)]
    b = B(); b.loft([ring(a, r) for a, r, _ in prof], [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK)
    return b.finish('c_bore', sharp_deg=30)


def burner(sx):
    b = B(); cx = sx * NOZ_X; n = 32; a = NAC_A1 - 1.05
    ring = lambda a_, r: [P3(a_, cx + r * math.sin(2 * math.pi * k / n), NOZ_Z - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    for r in (0.40, 0.26, 0.12):
        b.loft([ring(a, r + 0.016), ring(a + 0.05, r + 0.016), ring(a + 0.05, r - 0.016), ring(a, r - 0.016), ring(a, r + 0.016)], G_DARK)
    for k in range(8):
        ang = 2 * math.pi * k / 8; u = Vector((math.sin(ang), 0, -math.cos(ang))); c0 = P3(a + 0.02, cx, NOZ_Z)
        strut(b, c0 + u * 0.05, c0 + u * 0.50, 0.012, G_DARK, 6)
    b.loft([ring(a + 0.10, 0.09), ring(a - 0.25, 0.012)], G_DARK, cap0=G_DARK, cap1=G_DARK)
    return b.finish('burner_' + ('r' if sx > 0 else 'l'), sharp_deg=35)


# ── кабина-капсула: места рядом, козырёк и две створки фонаря на центральной балке ──
CK_A0, CK_A1 = 4.70, 7.22
CAN_A0, CAN_A1, ARCH_A = 4.20, 7.35, 5.35
CAN_T = tracks([(4.20, 0.820, 0.300), (4.60, 1.110, 0.500), (5.00, 1.320, 0.600), (5.35, 1.465, 0.650), (6.00, 1.600, 0.680), (6.60, 1.670, 0.690), (7.10, 1.710, 0.680), (7.35, 1.720, 0.660)])
def SILL(a): return fore_y(a, CAN_T[1](a))


def can_ring(a, inset=0.0, n=44):
    top, hw = CAN_T[0](a) - inset, CAN_T[1](a) - inset; y0 = SILL(a) + 0.002; top = max(top, y0 + 0.004); out = []
    for k in range(n):
        c = math.cos(math.pi * k / (n - 1)); s = math.sin(math.pi * k / (n - 1))
        out.append(P3(a, math.copysign(hw * abs(c) ** 0.62, c), y0 + (top - y0) * s ** 0.74))
    return out


def cock_cut():
    def sec(a, y0, y1, hw): return [P3(a, -hw, y0), P3(a, hw, y0), P3(a, hw, y1), P3(a, -hw, y1)]
    return loft_obj('c_cock', [sec(a, 0.34, 2.40, min(CAN_T[1](a), side_x(a, 0.36)) - 0.045) for a in stations(CK_A0, CK_A1, 0.07)], G_COCK, sharp=25)


def frame_arch(b, a, w, inset=0.008, h=0.022, n=44):
    ri0 = can_ring(a - w, inset, n); ro0 = can_ring(a - w, -h, n); ro1 = can_ring(a + w, -h, n); ri1 = can_ring(a + w, inset, n)
    strip(b, [ri0, ro0, ro1, ri1, ri0], G_SKIN)


def canopy_stage_a():
    """Пока единое стекло с рамами; створки и петли - на следующем шаге."""
    b = B(); strip(b, [can_ring(a) for a in stations(CAN_A0 + 0.01, CAN_A1 - 0.004, 0.09)], G_GLASS); gl = b.finish('canopy_glass', sharp_deg=60)
    b = B(); frame_arch(b, ARCH_A, 0.035); frame_arch(b, CAN_A1 - 0.04, 0.04); frame_arch(b, 6.25, 0.022)
    top = lambda a, d, h: P3(a, d, CAN_T[0](a) + h)
    b.loft([[top(a, -0.055, -0.010), top(a, 0.055, -0.010), top(a, 0.050, 0.024), top(a, -0.050, 0.024)] for a in stations(CAN_A0 + 0.25, CAN_A1, 0.08)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        b.loft([[rail(a, 0.004, 0.010), rail(a, 0.018, 0.010), rail(a, 0.018, 0.034), rail(a, -0.012, 0.050), rail(a, -0.012, 0.022)] for a in stations(CAN_A0 + 0.04, CAN_A1, 0.07)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return [gl, b.finish('canopy_frame', sharp_deg=45)]


def probe():
    b = B(); strut(b, P3(0.0, 0, 0.080), P3(0.45, 0, 0.080), 0.012, G_METAL, 10); strut(b, P3(0.45, 0, 0.080), P3(0.80, 0, 0.080), 0.020, G_METAL, 10)
    return b.finish('det_probe', sharp_deg=40)


# ── подкрыльевые поворотные пилоны (по два на консоль): дети консоли, своя вертикальная ось ──
PYL = (('i', 3.55), ('o', 5.00))                                 # размах в положении 16°
PYLON_PTS = {}


def pylons(sx, w):
    out = []; M = wrot(sx, SWEEP)
    for tag, xs in PYL:
        name = f'pylon_{tag}_' + ('r' if sx > 0 else 'l'); c = TE_W(xs) - LE_W(xs); am = LE_W(xs) + 0.46 * c; lnf, lnr = 0.29 * c, 0.26 * c; pm = M @ P3(am, sx * xs, WZ); zt = WZ - TCW(xs) * c * 0.5 + 0.03; zb = zt - 0.40; hw = 0.065; ln = 1.15
        b = B()
        def sec(dy, f=1.0, dz=0.0): return [Vector((-hw * f, dy, zb + dz - pm.z)), Vector((hw * f, dy, zb + dz - pm.z)), Vector((hw * f * 0.8, dy, zt - pm.z)), Vector((-hw * f * 0.8, dy, zt - pm.z))]
        b.loft([sec(lnf, 0.10, 0.20), sec(lnf - 0.16, 0.7, 0.06), sec(lnf - 0.4, 1.0), sec(-lnr + 0.4, 1.0), sec(-lnr + 0.16, 0.65, 0.05), sec(-lnr, 0.10, 0.14)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
        ob = b.finish(name, sharp_deg=40); ob.location = pm; bpy.context.view_layer.update(); ob.parent = w; ob.matrix_parent_inverse = w.matrix_world.inverted()
        PARTS[name] = dict(pivot=pm.copy(), axis=Vector((0, 0, 1)), range=(-(SW_MAX - SWEEP), SWEEP - SW_MIN) if sx > 0 else (-(SWEEP - SW_MIN), SW_MAX - SWEEP), parent=w.name,
                           note='поворотный пилон: вертикальная ось; чтобы смотрел вперёд, угол пилона = минус угол консоли (в файле оба 0)')
        PYLON_PTS[name] = Vector((pm.x, pm.y, zb)); out.append(ob)
    return out


VFIN = (15.55, 17.75, 16.35, 17.65, 1.22, -0.50, 0.56, 22.0)     # корень a0..a1, конец a0..a1, x, z корня, высота, развал


def vfin(sx):
    """Подфюзеляжный киль под хвостом, развален наружу (f111_03, 06)."""
    r0, r1, t0, t1, x0, z0, hgt, cant = VFIN; cc, sc_ = math.cos(math.radians(cant)), math.sin(math.radians(cant)); rings = []
    for s_ in (-0.25, 0.0, 0.35, 0.7, 0.93, 1.0):
        le = r0 + (t0 - r0) * max(s_, 0); te = r1 + (t1 - r1) * max(s_, 0); d = hgt * s_
        ring = foil_ring(le, te - le, 0.035, 0.0, 1.0, 12, lambda a, h: P3(a, sx * (x0 + d * sc_ + h * cc), z0 - d * cc + h * sc_ * 1.0))
        rings.append(ring if sx > 0 else ring[::-1])
    return loft_obj('det_vfin_' + ('r' if sx > 0 else 'l'), rings, G_SKIN, sharp=48)


def build_skin():
    S = [fore(), aft(), trunk(1), trunk(-1), glove(1), glove(-1), boom(1), boom(-1), ntail(1), ntail(-1)]
    host = S[0]
    for o in S[1:]:
        _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        for c in (duct_cut(sx), bore_cut(sx), slot_cutter(sx)): _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    import f111_parts as pt
    for c in [cock_cut()] + pt.bay_cuts(): _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'F111_skin'; host.data.name = 'F111_skin'; bvh_ready(host)
    return host


def plane(stage=9):
    """Этапы: 1 - обшивка; 2 - оперение, сопла, крыло; 3 - кабина, фонарь, щиток, люлька, интерцепторы, держатели; 4 - шасси."""
    import f111_parts as pt
    PARTS.clear(); PYLON_PTS.clear()
    skin = build_skin(); out = [skin]
    if stage >= 2:
        out += [fin(), rudder(), stab(1), stab(-1), nozzle(1), nozzle(-1), burner(1), burner(-1), probe(), vfin(1), vfin(-1)]
        out += (canopy_stage_a() if stage < 3 else pt.windscreen() + pt.hatch(1) + pt.hatch(-1) + [pt.cockpit(), pt.brake(), pt.cradle()])
        for sx in (1, -1):
            w = wing(sx); py = pylons(sx, w[0]); out += w + py
            if stage >= 3: out += pt.spoilers(sx, w[0], wrot(sx, SWEEP)) + [pt.rack(p_) for p_ in py]
    if stage >= 4: out += pt.gear_nose() + pt.gear_main()
    return out
