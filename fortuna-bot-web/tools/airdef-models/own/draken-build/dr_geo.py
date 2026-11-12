# dr_geo.py - геометрия Saab J 35F Draken для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z (в glTF: нос -Z, правое крыло +X, верх +Y).
# a - расстояние от острия ПВД назад (0 ... 15,35 - срез сопла); z - высота над осью фюзеляжа (ось - от острия обтекателя к центру сопла), земля на z = -AX.
# Длина и размах - как у нынешней модели игры и J 35F (15,35 и 9,42 м). Чертёж draken_09 по длине искажён (нос короче, хвост длиннее, чем на фото): положения по
# длине и план крыла - по фото 07 (строго снизу) и 03 (сбоку), сечения и вид спереди - по чертежу 09 и фото 05. Чужие сетки и текстуры не используются.
import math
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 15.35
AX = 1.57                                                          # высота оси над землёй на стоянке (киль 3,89 м)
G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_STRAP, G_SCREEN, G_BELT, G_HANDLE, G_SEAM, G_DUCT = range(12)
PARTS = {}; STATIONS = {}


def Yb(a): return L / 2 - a
def P3(a, x, z): return Vector((x, Yb(a), z))


class Track:
    """Гладкая интерполяция таблицы (монотонный кубический Эрмит)."""
    def __init__(self, pts):
        self.x = [p[0] for p in pts]; self.y = [p[1] for p in pts]; n = len(pts)
        d = [(self.y[i + 1] - self.y[i]) / (self.x[i + 1] - self.x[i]) for i in range(n - 1)]
        m = [d[0]] + [0.0 if d[i - 1] * d[i] <= 0 else 3 * (self.x[i + 1] - self.x[i - 1]) / ((2 * self.x[i + 1] - self.x[i] - self.x[i - 1]) / d[i - 1] + (self.x[i + 1] + self.x[i] - 2 * self.x[i - 1]) / d[i]) for i in range(1, n - 1)] + [d[-1]]
        self.d, self.m = d, m

    def __call__(self, t):
        x, y, m = self.x, self.y, self.m
        if t <= x[0]: return y[0]
        if t >= x[-1]: return y[-1]
        i = next(k for k in range(len(x) - 1) if x[k] <= t <= x[k + 1]); h = x[i + 1] - x[i]; s = (t - x[i]) / h
        return (2 * s ** 3 - 3 * s ** 2 + 1) * y[i] + (s ** 3 - 2 * s ** 2 + s) * h * m[i] + (-2 * s ** 3 + 3 * s ** 2) * y[i + 1] + (s ** 3 - s ** 2) * h * m[i + 1]


def tracks(table):
    n = len(table[0]) - 1
    return [Track([(r[0], r[i + 1]) for r in table]) for i in range(n)]


def sup(a, cx, top, bot, hw, nt, nb, n):
    """Суперэллипс: начало снизу (шов развёртки), дальше +X, верх, -X."""
    cy = (top + bot) / 2; ht = (top - bot) / 2; pts = []
    for k in range(n):
        th = -math.pi / 2 + 2 * math.pi * k / n; c, s = math.cos(th), math.sin(th); e = nt if s > 0 else nb
        pts.append(P3(a, cx + hw * math.copysign(abs(c) ** (2 / e), c), cy + ht * math.copysign(abs(s) ** (2 / e), s)))
    return pts


def stations(a0, a1, da):
    n = max(2, int(round((a1 - a0) / da))); return [a0 + (a1 - a0) * i / n for i in range(n + 1)]


def loft_obj(name, rings, mat=G_SKIN, cap0=True, cap1=True, sharp=38):
    b = B(); b.loft(rings, mat, cap0=mat if cap0 else None, cap1=mat if cap1 else None)
    return b.finish(name, sharp_deg=sharp)


def strut(b, p0, p1, r, mat=G_METAL, n=12):
    d = (p1 - p0).normalized(); u = d.orthogonal().normalized(); v = d.cross(u)
    rg = lambda c: [c + (u * math.cos(2 * math.pi * q / n) + v * math.sin(2 * math.pi * q / n)) * r for q in range(n)]
    b.loft([rg(p0), rg(p1)], mat, cap0=mat, cap1=mat)


def thk(u):
    return 5 * (0.2969 * math.sqrt(max(u, 0)) - 0.1260 * u - 0.3516 * u ** 2 + 0.2843 * u ** 3 - 0.1015 * u ** 4)


def foil_ring(a_le, chord, tc, u0, u1, nu, place, tail=None, head=None):
    us = [u0 + (u1 - u0) * (1 - math.cos(math.pi * i / (nu - 1))) / 2 for i in range(nu)]
    up = [place(a_le + chord * u, +tc * chord * thk(u)) for u in us]
    lo = [place(a_le + chord * u, -tc * chord * thk(u)) for u in reversed(us)]
    return up + [place(a_, h_) for a_, h_ in (tail or [])] + lo + [place(a_, h_) for a_, h_ in (head or [])]


COVE_K, COVE_R = 7, 0.008
def cove_cut(a_le, chord, tc, a_h, clr=COVE_R):
    uh = (a_h - a_le) / chord; t = tc * chord * thk(uh); rc = t + clr; a_e = a_h - math.sqrt(max(rc * rc - t * t, 1e-9)); te = tc * chord * thk((a_e - a_le) / chord); rc = math.hypot(a_e - a_h, te); al = math.atan2(te, a_e - a_h)
    return (a_e - a_le) / chord, [(a_h + rc * math.cos(al + (2 * math.pi - 2 * al) * (i + 1) / (COVE_K + 1)), rc * math.sin(al + (2 * math.pi - 2 * al) * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_wall(a_le, chord, tc, u1):
    a_ = a_le + chord * u1; t = tc * chord * thk(u1); return [(a_, t * (1 - 2 * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_nose(a_le, chord, tc, a_h):
    t = tc * chord * thk((a_h - a_le) / chord); return [(a_h - t * math.sin(math.pi * (i + 1) / (COVE_K + 1)), -t * math.cos(math.pi * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_wall_f(a_le, chord, tc, u0):
    a_ = a_le + chord * u0; t = tc * chord * thk(u0); return [(a_, t * (-1 + 2 * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]


def _sm(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)


def _apply_bool(host, cutter, op, solver='MANIFOLD'):
    vl = bpy.context.view_layer
    for o in list(vl.objects):
        if o is not None: o.select_set(False)
    vl.objects.active = host; host.select_set(True)
    md = host.modifiers.new('b', 'BOOLEAN'); md.operation = op; md.object = cutter
    try: md.solver = solver
    except Exception: md.solver = 'EXACT'
    bpy.ops.object.modifier_apply(modifier=md.name)


def _drop(o):
    me = o.data; bpy.data.objects.remove(o); bpy.data.meshes.remove(me)


def _rel(ob, pivot):
    for v in ob.data.vertices: v.co -= pivot
    ob.location = pivot
    return ob


# ── фюзеляж: конус обтекателя РЛС, сечение почти круглое, плоский низ, гребень за фонарём к килю, хвост сходится к соплу (03, 07, 09) ──
RAD_A0, RAD_A1, RAD_R = 0.77, 2.26, 0.31                          # обтекатель: от острия до стыка (чёрный), радиус у стыка
# (a, верх z, низ z, полуширина, показатель верха, показатель низа)
FUS = [(2.26, 0.320, -0.300, 0.310, 2.0, 2.0), (3.00, 0.440, -0.400, 0.370, 2.1, 2.2), (4.00, 0.520, -0.520, 0.430, 2.2, 2.4), (5.00, 0.590, -0.620, 0.520, 2.3, 2.6),
       (6.00, 0.660, -0.665, 0.600, 2.3, 2.8), (7.50, 0.760, -0.680, 0.620, 2.2, 2.9), (9.00, 0.780, -0.680, 0.620, 2.2, 2.9), (10.50, 0.760, -0.640, 0.600, 2.2, 2.8),
       (12.00, 0.700, -0.580, 0.570, 2.2, 2.6), (13.50, 0.600, -0.520, 0.520, 2.2, 2.4), (14.60, 0.500, -0.470, 0.470, 2.1, 2.2), (15.20, 0.430, -0.430, 0.430, 2.0, 2.0),
       (15.35, 0.415, -0.415, 0.415, 2.0, 2.0)]
FT = tracks(FUS)


def fus_top(a, x=0.0):
    top, bot, hw, nt = FT[0](a), FT[1](a), FT[2](a), FT[3](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = min(0.999, abs(x) / max(hw, 1e-6)); return cy + ht * (1 - q ** nt) ** (1 / nt)


def fus_bot(a, x=0.0):
    top, bot, hw, nb = FT[0](a), FT[1](a), FT[2](a), FT[4](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = min(0.999, abs(x) / max(hw, 1e-6)); return cy - ht * (1 - q ** nb) ** (1 / nb)


def fuselage():
    n = 64; rs = []
    for a in [RAD_A0 + 0.004, RAD_A0 + 0.03, RAD_A0 + 0.08] + stations(RAD_A0 + 0.15, RAD_A1, 0.12):
        t = (a - RAD_A0) / (RAD_A1 - RAD_A0); r = RAD_R * t ** 0.92
        rs.append([P3(a, r * math.sin(2 * math.pi * q / n), -r * math.cos(2 * math.pi * q / n)) for q in range(n)])
    for a in stations(RAD_A1 + 0.15, 15.35, 0.16):
        top, bot, hw, nt, nb = FT[0](a), FT[1](a), FT[2](a), FT[3](a), FT[4](a); rs.append(sup(a, 0.0, top, bot, hw, nt, nb, n))
    return loft_obj('s_fus', rs, sharp=50)


def pitot():
    b = B(); n = 12
    pr = [(0.0, 0.004), (0.02, 0.010), (0.30, 0.012), (0.32, 0.020), (0.60, 0.022), (0.79, 0.030)]
    b.loft([[P3(a, r * math.sin(2 * math.pi * q / n), -r * math.cos(2 * math.pi * q / n)) for q in range(n)] for a, r in pr], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('det_pitot', sharp_deg=40)


# ── крыло: двойная дельта (80° у корня, около 60° на консоли), задняя кромка прямая, у корня скошена к хвосту; два элевона на консоль (07, 09) ──
A_INT, X_INT_O, X_INT_I = 4.42, 1.365, 0.62                        # срез заборника, наружная и внутренняя кромка
A_KINK, X_KINK = 9.36, 2.23                                        # излом передней кромки
A_TIP, XTIP = 13.78, 4.71                                          # передняя кромка на конце; полуразмах
A_TE, X_TEK = 13.94, 2.16                                          # прямая задняя кромка и её внутренний конец
A_TER, X_TER = 14.62, 0.60                                         # задняя кромка у фюзеляжа
WZ = -0.10                                                         # плоскость хорд (ниже оси)
def LE(x):
    if x <= X_INT_O: return A_INT
    if x <= X_KINK: return A_INT + (x - X_INT_O) * (A_KINK - A_INT) / (X_KINK - X_INT_O)
    return A_KINK + (x - X_KINK) * (A_TIP - A_KINK) / (XTIP - X_KINK)
def TE(x):
    if x >= X_TEK: return A_TE
    return A_TE + (X_TEK - x) / (X_TEK - X_TER) * (A_TER - A_TE)
def CH(x): return TE(x) - LE(x)
def TC(x): return 0.056 - 0.012 * _sm((x - 0.6) / 3.5)
def wz(x): return WZ
def wing_up(x, a):
    c = CH(x); u = (a - LE(x)) / c; return wz(x) + TC(x) * c * thk(max(0.0, min(1.0, u)))
def wing_bot(x, a):
    c = CH(x); u = (a - LE(x)) / c; return wz(x) - TC(x) * c * thk(max(0.0, min(1.0, u)))

ELEV = [(2.30, 3.30), (3.36, 4.22)]                                 # элевоны: внутренний и внешний, x от-до (у конца крыла хорда меньше хорды элевона)
EC = 0.62                                                          # хорда элевона
def EH(x): return A_TE - EC


def _wsec(sx, x):
    c = CH(x); tc = TC(x); le = LE(x); us = 0.0006
    place = lambda a, h: P3(a, sx * x, wz(x) + h)
    for e0, e1 in ELEV:
        if e0 - 1e-6 <= x <= e1 + 1e-6:
            ue, tail = cove_cut(le, c, tc, EH(x)); break
    else:
        ue = 1.0; tail = cove_wall(le, c, tc, 1.0)
    return foil_ring(le, c, tc, us, ue, 34, place, tail=tail, head=cove_wall_f(le, c, tc, us))


def wing(sx):
    k = []
    for e0, e1 in ELEV: k += [e0 - 0.003, e0, e1, e1 + 0.003] + [e0 + (e1 - e0) * i / 6 for i in range(1, 6)]
    xs = sorted(set(round(v, 4) for v in [0.30, 0.60, 0.95, X_INT_O, 1.70, 2.0, X_TEK, X_KINK] + stations(2.4, XTIP - 0.12, 0.30) + k + [XTIP - 0.06, XTIP - 0.02, XTIP]))
    rings = [_wsec(sx, x) for x in xs]
    return loft_obj('s_wing_' + ('r' if sx > 0 else 'l'), rings, sharp=50)


def elevon(sx, i):
    x0, x1 = ELEV[i]; x0 += 0.010; x1 -= 0.010; s = 'r' if sx > 0 else 'l'; name = f'elev{i + 1}_{s}'
    pv0 = P3(EH(x0), sx * x0, wz(x0)); pv1 = P3(EH(x1), sx * x1, wz(x1)); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    for j in range(9):
        x = x0 + (x1 - x0) * j / 8; c = CH(x); ah = EH(x)
        rings.append([v - pivot for v in foil_ring(LE(x), c, TC(x), (ah - LE(x)) / c, 1.0, 10, lambda a, h, x=x: P3(a, sx * x, wz(x) + h), head=cove_nose(LE(x), c, TC(x), ah))])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-30.0, 25.0), note='элевон (1 - внутренний, 2 - внешний): ось в центре круглого носа поперёк; плюс - задняя кромка вниз')
    return ob


# ── заборники: овальный срез в корне крыла, наплыв с толстой скруглённой кромкой уходит назад вдоль внутренней передней кромки (05, 07, 09) ──
def nac_x(a):                                                      # наружный край наплыва = внутренняя передняя кромка крыла
    return min(X_KINK, X_INT_O + max(0.0, a - A_INT) * (X_KINK - X_INT_O) / (A_KINK - A_INT))
NAC_H = Track([(A_INT, 0.500), (5.0, 0.510), (6.0, 0.470), (7.2, 0.360), (8.4, 0.220), (9.4, 0.110)])
def nac_ring(sx, a, n=48, shrink=1.0):
    """Сечение наплыва: у среза овал, дальше наружный край сходит клином в переднюю кромку крыла (вид спереди 09: овал в линзе крыла)."""
    xi, xo = 0.40, nac_x(a); H = NAC_H(a) * shrink; cx = (xi + xo) / 2; hw = (xo - xi) / 2 * (0.96 + 0.04 * shrink); cz = wz(0) + 0.03
    kt = 0.80 * _sm((a - A_INT - 0.20) / 2.2); e = 2.4; pts = []
    for q in range(n):
        th = -math.pi / 2 + 2 * math.pi * q / n; c, s_ = math.cos(th), math.sin(th)
        x = cx + hw * math.copysign(abs(c) ** (2 / e), c); z = cz + H / 2 * math.copysign(abs(s_) ** (2 / e), s_) * (1 - kt * max(0.0, c) ** 1.4)
        pts.append(Vector((sx * x, Yb(a), z)))
    return pts if sx > 0 else pts[::-1]
def nacelle(sx):
    rs = []
    for a in [A_INT - 0.06, A_INT - 0.03, A_INT] + stations(A_INT + 0.15, A_KINK + 0.05, 0.25):
        k = _sm((a - (A_INT - 0.06)) / 0.06) if a < A_INT else 1.0
        rs.append(nac_ring(sx, a, shrink=0.86 + 0.14 * k))
    return loft_obj('s_nac', rs, sharp=40)


def intake_cut(sx):
    """Канал заборника: овал с отсекателем (внутренняя кромка отодвинута от фюзеляжа), стенки - G_DUCT, в глубине тёмно."""
    n = 40; b = B()
    prof = [(-0.30, 1.00, G_DUCT), (0.02, 1.00, G_DUCT), (0.50, 0.94, G_DUCT), (1.30, 0.80, G_DARK), (1.40, 0.10, G_DARK)]
    rings = []
    for da, k, _ in prof:
        cx, hw, h = 1.010, 0.330 * k, 0.185 * k
        r = sup(A_INT + da, cx, wz(0) + 0.03 + h, wz(0) + 0.03 - h, hw, 2.6, 2.6, n)
        rings.append([Vector((sx * v.x, v.y, v.z)) for v in r])
    if sx < 0: rings = [r[::-1] for r in rings]
    b.loft(rings, [m for _, _, m in prof[1:]], cap0=G_DUCT, cap1=G_DARK); return b.finish('c_inl', sharp_deg=30)


# ── киль и руль направления (03, 04, 09) ──
FZ0, FZ1 = 0.45, 2.32
def FLE(z): return 9.98 + (13.70 - 9.98) * (z - 0.75) / (FZ1 - 0.75)
def FTE(z): return 14.85 + (15.02 - 14.85) * (z - 0.75) / (FZ1 - 0.75)
RUD = (0.95, 2.12); RUD_C = 0.62
def FTC(z): return 0.060 - 0.015 * (z - FZ0) / (FZ1 - FZ0)
def fin():
    zs = sorted(set(stations(FZ0, FZ1 - 0.06, 0.14) + [RUD[0] - 0.003, RUD[0], RUD[1], RUD[1] + 0.003] + [RUD[0] + (RUD[1] - RUD[0]) * i / 8 for i in range(1, 8)] + [FZ1 - 0.03, FZ1]))
    rings = []
    for z in zs:
        le, te = FLE(z), FTE(z); c = te - le; tc = FTC(z)
        if RUD[0] - 1e-6 <= z <= RUD[1] + 1e-6: ue, tail = cove_cut(le, c, tc, te - RUD_C, 0.006)
        else: ue, tail = 1.0, cove_wall(le, c, tc, 1.0)
        rings.append(foil_ring(le, c, tc, 0.0006, ue, 26, lambda a, h, z=z: P3(a, h, z), tail=tail, head=cove_wall_f(le, c, tc, 0.0006)))
    return loft_obj('fin_c', rings, sharp=50)


def rudder():
    z0, z1 = RUD[0] + 0.006, RUD[1] - 0.006; pv0 = P3(FTE(z0) - RUD_C, 0.0, z0); pv1 = P3(FTE(z1) - RUD_C, 0.0, z1); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    rings = []
    for j in range(9):
        z = z0 + (z1 - z0) * j / 8; le, te = FLE(z), FTE(z); c = te - le; ah = te - RUD_C
        rings.append([v - pivot for v in foil_ring(le, c, FTC(z), (ah - le) / c, 1.0, 10, lambda a, h, z=z: P3(a, h, z), head=cove_nose(le, c, FTC(z), ah))])
    ob = loft_obj('rudder', rings, sharp=48); ob.location = pivot
    PARTS['rudder'] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-25.0, 25.0), note='руль направления: ось в центре круглого носа, снизу вверх')
    return ob


# ── сопло с форсажной камерой: срез на конце, внутри тёмный канал и кольцо стабилизатора пламени (02, 08) ──
NOZ_R = 0.385
def nozzle_cut():
    n = 48; b = B(); a0 = 15.35
    prof = [(0.20, NOZ_R, G_METAL), (-0.06, NOZ_R, G_METAL), (-0.45, NOZ_R - 0.02, G_DARK), (-1.20, NOZ_R - 0.05, G_DARK), (-1.25, 0.02, G_DARK)]
    rings = [[P3(a0 + da, r * math.sin(2 * math.pi * q / n), -r * math.cos(2 * math.pi * q / n)) for q in range(n)] for da, r, _ in prof]
    b.loft(rings, [m for _, _, m in prof[1:]], cap0=G_METAL, cap1=G_DARK); return b.finish('c_noz', sharp_deg=30)


# ── фонарь: козырёк с рамой, сдвижная назад-вверх часть на заднем шарнире (05, 09) ──
CAN_A0, CAN_W, CAN_A1 = 3.10, 3.72, 5.64                           # начало козырька, рама козырька, конец фонаря
CAN = Track([(3.10, 0.42), (3.40, 0.62), (3.72, 0.80), (4.20, 0.89), (4.70, 0.90), (5.20, 0.84), (5.70, 0.72)])
CAN_HW = Track([(3.10, 0.30), (3.72, 0.33), (4.70, 0.34), (5.70, 0.30)])
def can_ring(a, n=24, inset=0.0, sink=0.06):
    """Сечение фонаря: верх полуэллипса над линией фюзеляжа на высоте его бортов; sink - насколько нижняя кромка утоплена (у откидной части - только до порога)."""
    top = CAN(a) - inset; hw = CAN_HW(a) - inset; base = fus_top(a, hw) - sink; pts = []
    for k in range(n + 1):
        th = math.pi * k / n; c, s = math.cos(th), math.sin(th)
        pts.append(P3(a, hw * c, base + (top - base) * abs(s) ** 0.9))
    return pts


def canopy_shell(a0, a1, name, mat, th=0.010, sink=0.06):
    """Стекло тонкой оболочкой: снаружи и внутри, нижние кромки замкнуты (внутри кабины видно нутро, а не дно стекла)."""
    rs = []
    for a in stations(a0, a1, 0.06):
        o = can_ring(a, sink=sink); i_ = can_ring(a, inset=th, sink=sink); rs.append(o + i_[::-1])
    return loft_obj(name, rs, mat, sharp=60)


def canopy_fairing():
    """Неподвижный обтекатель за фонарём: от его заднего сечения плавно в гребень фюзеляжа (03, 09)."""
    a0, a1 = CAN_A1 + 0.025, 7.40; rs = []
    for a in stations(a0, a1, 0.08):
        t = _sm((a - a0) / (a1 - a0)); top = CAN(min(a, 5.70)) * (1 - t) + (fus_top(a1) + 0.002) * t; hw = CAN_HW(CAN_A1) * (1 - t) + 0.10 * t
        base = fus_top(a, hw) - 0.08; n = 24; pts = []
        for k in range(n + 1):
            th = math.pi * k / n; pts.append(P3(a, hw * math.cos(th), base + (top - base) * abs(math.sin(th)) ** 0.9))
        pts.append(P3(a, 0.0, base - 0.10)); rs.append(pts)
    return loft_obj('s_cfair', rs, sharp=50)


# ── подфюзеляжные баки (05): два рядом на коротких пилонах ──
TANK_X, TANK_A0, TANK_LEN, TANK_R = 0.34, 6.45, 3.80, 0.245
def tank_z(): return FT[1](8.3) - 0.07 - TANK_R
def tank(sx):
    a0 = TANK_A0; zc = tank_z(); n = 28
    rr = Track([(0.0, 0.0), (0.05, 0.07), (0.30, 0.16), (0.80, 0.23), (1.30, TANK_R), (2.60, TANK_R), (3.20, 0.20), (3.60, 0.10), (3.76, 0.03), (TANK_LEN, 0.0)])
    ss = [0.0, 0.01, 0.04, 0.09, 0.17, 0.28, 0.45, 0.65, 0.90, 1.20] + stations(1.45, 3.3, 0.30) + [3.45, 3.58, 3.68, 3.74, 3.78, TANK_LEN]
    rs = [[P3(a0 + s, sx * TANK_X + max(rr(s), 0.003) * math.sin(2 * math.pi * q / n), zc - max(rr(s), 0.003) * math.cos(2 * math.pi * q / n)) for q in range(n)] for s in ss]
    o = loft_obj('s_tank', rs, sharp=50)
    py = []; zt = zc + TANK_R - 0.02
    for i in range(5):
        t = i / 4; zz = zt + t * (fus_bot(8.3, TANK_X) + 0.05 - zt); af = a0 + 1.0; c = 1.8
        py.append(foil_ring(af, c, 0.07, 0.001, 1.0, 12, lambda a, h, zz=zz: P3(a, sx * TANK_X + h, zz), tail=cove_wall(af, c, 0.07, 1.0), head=cove_wall_f(af, c, 0.07, 0.001)))
    p = loft_obj('s_tpyl', py, sharp=40)
    return [o, p]


BVH = {}
def bvh_ready(host, extra=()):
    V = []; F = []
    for o in (host,) + tuple(extra):
        M = o.matrix_world; b0 = len(V); V += [M @ v.co for v in o.data.vertices]; F += [tuple(b0 + i for i in p.vertices) for p in o.data.polygons]
    BVH['t'] = BVHTree.FromPolygons(V, F); BVH['host'] = host


def ray(o, d):
    h = BVH['t'].ray_cast(o, d); return h[0]


def down(x, y_world, z0=12.0, dirn=-1):
    return ray(Vector((x, y_world, z0)), Vector((0, 0, dirn)))


def patch(name, outline, nu, nv, dirn=-1, lift=0.006, th=0.018, mat=G_SKIN, z0=12.0, cast=None):
    """Плита по обшивке: outline(u, v) -> (a, x) для вертикальных лучей или cast(u, v) -> (точка снаружи, направление). Начало - в нуле мира."""
    grid = []
    for j in range(nv + 1):
        row = []
        for i in range(nu + 1):
            if cast: o_, d_ = cast(i / nu, j / nv); h = ray(o_, d_); nrm = -d_
            else: a, x = outline(i / nu, j / nv); h = down(x, Yb(a), z0=z0, dirn=dirn); nrm = Vector((0, 0, -dirn))
            if h is None: print('ЛУЧ МИМО', name, i, j); h = Vector((0, 0, 0))
            row.append((h + nrm * lift, nrm))
        grid.append(row)
    b = B(); bm = b.bm
    tv = [[bm.verts.new(p + n_ * th * 0.7) for p, n_ in row] for row in grid]; lv = [[bm.verts.new(p - n_ * th * 0.3) for p, n_ in row] for row in grid]
    for j in range(nv):
        for i in range(nu):
            f = bm.faces.new((tv[j][i], tv[j][i + 1], tv[j + 1][i + 1], tv[j + 1][i])); f.material_index = mat
            f = bm.faces.new((lv[j][i], lv[j + 1][i], lv[j + 1][i + 1], lv[j][i + 1])); f.material_index = mat
    for i in range(nu):
        for (ta, tb, la, lb) in ((tv[0][i], tv[0][i + 1], lv[0][i], lv[0][i + 1]), (tv[nv][i + 1], tv[nv][i], lv[nv][i + 1], lv[nv][i])):
            f = bm.faces.new((ta, la, lb, tb)); f.material_index = mat
    for j in range(nv):
        for (ta, tb, la, lb) in ((tv[j + 1][0], tv[j][0], lv[j + 1][0], lv[j][0]), (tv[j][nu], tv[j + 1][nu], lv[j][nu], lv[j + 1][nu])):
            f = bm.faces.new((ta, la, lb, tb)); f.material_index = mat
    return b.finish(name, sharp_deg=30)




def build_skin():
    S = [fuselage(), wing(1), wing(-1), nacelle(1), nacelle(-1), canopy_fairing()]
    host = S[0]
    for o in S[1:]:
        _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        c = intake_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    c = nozzle_cut(); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'DR_skin'; host.data.name = 'DR_skin'
    return host


def plane(stage=9):
    """Этапы: 1 - обшивка, киль, фонарь, баки; 2 - элевоны, руль; 3 - кабина, рамы, щитки, пилоны, детали; 4 - шасси."""
    PARTS.clear(); STATIONS.clear()
    skin = build_skin(); ref_me = skin.data.copy(); out = [skin, fin(), pitot()]
    out.append(canopy_shell(CAN_A0, CAN_W, 'canopy_glass', G_GLASS))
    can = canopy_shell(CAN_W + 0.034, CAN_A1, 'canopy', G_GLASS, sink=0.004); out.append(can)
    for sx in (1, -1):
        tk, tp = tank(sx); _apply_bool(tk, tp, 'UNION'); _drop(tp); tk.name = 'tank_' + ('r' if sx > 0 else 'l'); out.append(tk)
    if stage >= 2:
        out.append(rudder())
        for sx in (1, -1):
            for i in range(len(ELEV)): out.append(elevon(sx, i))
    if stage >= 3:
        import dr_det as dt
        bvh_ready(skin)
        c = dt.cock_cavity(); _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
        out.append(dt.cockpit())
        fr, cfr = dt.canopy_frames(); out.append(fr); dt.canopy_part(can)
        bpy.context.view_layer.update(); mw = cfr.matrix_world.copy(); cfr.parent = can; cfr.matrix_world = mw; out.append(cfr)
        out += dt.airbrakes() + dt.pylons() + [dt.details()]
    if stage >= 4:
        import dr_gear as gr; out += gr.gear_all()
    resharp(skin); print('нормали обшивки:', smooth_normals(skin, ref_me)); bpy.data.meshes.remove(ref_me)
    return out


def resharp(host, deg=38):
    bm = bmesh.new(); bm.from_mesh(host.data); lim = math.radians(deg)
    for f in bm.faces: f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2: e.smooth = e.calc_face_angle(0.0) < lim
        else: e.smooth = False
    bm.to_mesh(host.data); bm.free()


def smooth_normals(host, ref_me):
    """Обшивка освещается как гладкая: нормаль угла берётся с поверхности до резки (как у Hunter FGA.9); стенки вырезов остаются резкими."""
    ref_me.calc_loop_triangles(); tris = ref_me.loop_triangles; V = ref_me.vertices; CN = ref_me.corner_normals; me = host.data
    tv = [t.vertices[:] for t in tris]; tn = [[CN[l].vector.copy() for l in t.loops] for t in tris]
    bvh = BVHTree.FromPolygons([v.co.copy() for v in V], tv)
    def src(p):
        h = bvh.find_nearest(p)
        if h[0] is None: return None, 9.0
        i = h[2]; a_, b_, c_ = [V[k].co for k in tv[i]]; q = h[0]; v0, v1, v2 = b_ - a_, c_ - a_, q - a_
        d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1); den = d00 * d11 - d01 * d01
        if abs(den) < 1e-14: return tn[i][0], h[3]
        w1 = (d11 * d20 - d01 * d21) / den; w2 = (d00 * d21 - d01 * d20) / den; w0 = 1 - w1 - w2
        return (tn[i][0] * w0 + tn[i][1] * w1 + tn[i][2] * w2).normalized(), h[3]
    out = [Vector((0, 0, 1))] * len(me.loops); walls = 0; lim = math.cos(math.radians(28)); M = me.vertices; L = me.loops
    for p in me.polygons:
        pn = p.normal.copy(); n0, dist = src(p.center)
        if n0 is None or dist > 0.0035 or pn.dot(n0) < lim:
            walls += 1
            for li in p.loop_indices: out[li] = pn
            continue
        for li in p.loop_indices:
            n_, d_ = src(M[L[li].vertex_index].co)
            out[li] = n_ if (n_ is not None and d_ < 0.006 and n_.dot(pn) > 0.55) else n0
    for p in me.polygons: p.use_smooth = True
    me.normals_split_custom_set([n[:] for n in out])
    return f'граней {len(me.polygons)}, резких стенок {walls}'
