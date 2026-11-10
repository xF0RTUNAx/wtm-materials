# b2_geo.py - геометрия B-2A для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z.
# a - расстояние от острия носа назад, x - вправо, z - высота над плоскостью передней кромки.
# План снят с b2_14 (снизу) и b2_12 (сверху) в приближении параллельной проекции (_plan.py), масштаб - прежняя модель игры: размах 52,22, длина 21,0.
# Все кромки параллельны двум направлениям: a = c + k*x или a = c - k*x (видно на обоих снимках, расхождение пар меньше 0,3 м).
# Профиль сбоку и высоты - с b2_05 (вид сбоку на земле), ширина горбов - с b2_07 (спереди) и b2_03 (кабина крупно).
# Обшивка - один лофт вдоль размаха: кольцо на каждую станцию x (хорда от передней кромки к задней, верх и низ), ряды вдоль размаха.
import math
import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 21.0                       # от носа до концов задней кромки
HS = 26.111                    # полуразмах
AT = 18.28                     # a концевой точки передней кромки
K = AT / HS                    # наклон всех кромок: стреловидность 35°
C1, C2, C3, C4 = 5.42, 24.35, 14.35, 20.40     # задняя кромка: a - kx = C1 (внешняя), a + kx = C2, a - kx = C3, a + kx = C4 (к центру)
X_N1 = (C2 - C1) / (2 * K)     # выемка у внешней кромки
X_A1 = (C2 - C3) / (2 * K)     # зубец
X_N2 = (C4 - C3) / (2 * K)     # выемка у выхлопа
X_TT = (2 * AT - C1) / (2 * K)  # конец крыла, задний угол
G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_HOT = 0, 1, 2, 3, 4, 5, 6
PARTS = {}
STATIONS = {}
BVH = {}


def Yb(a): return L / 2 - a
def P3(a, x, z): return Vector((x, Yb(a), z))


def a_le(x): return K * abs(x)


def a_te(x):
    x = abs(x)
    if x <= X_N2: return C4 - K * x
    if x <= X_A1: return C3 + K * x
    if x <= X_N1: return C2 - K * x
    if x <= X_TT: return C1 + K * x
    return 2 * AT - K * x


# ── профили: монотонный кубический сплайн по точкам (s от 0 до 1) ──
def pchip(pts):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]; n = len(pts)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]; d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [d[0]] + [0.0] * (n - 2) + [d[-1]]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0: m[i] = 0.0
        else:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    def f(x):
        if x <= xs[0]: return ys[0]
        if x >= xs[-1]: return ys[-1]
        i = 0
        while xs[i + 1] < x: i += 1
        t = (x - xs[i]) / h[i]; t2, t3 = t * t, t * t * t
        return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1]
    return f


# центроплан: тупой «клюв» спереди, верх быстро спадает к выхлопу (b2_05); крыло - обычный профиль
U_C = pchip([(0, 0), (0.015, 0.26), (0.05, 0.52), (0.11, 0.76), (0.19, 0.93), (0.28, 1.0), (0.38, 0.97), (0.5, 0.84), (0.62, 0.62), (0.74, 0.38), (0.86, 0.17), (1.0, 0.0)])
L_C = pchip([(0, 0), (0.015, 0.33), (0.05, 0.66), (0.11, 0.88), (0.2, 0.98), (0.3, 1.0), (0.42, 0.95), (0.55, 0.80), (0.7, 0.52), (0.85, 0.22), (1.0, 0.0)])
U_W = pchip([(0, 0), (0.015, 0.25), (0.05, 0.50), (0.11, 0.75), (0.2, 0.93), (0.3, 1.0), (0.42, 0.96), (0.55, 0.83), (0.7, 0.60), (0.85, 0.32), (1.0, 0.0)])
L_W = pchip([(0, 0), (0.015, 0.26), (0.05, 0.52), (0.11, 0.77), (0.2, 0.94), (0.3, 1.0), (0.42, 0.95), (0.55, 0.80), (0.7, 0.55), (0.85, 0.26), (1.0, 0.0)])
HU = pchip([(0, 0.066), (4.3, 0.062), (7.1, 0.058), (13.5, 0.060), (22.2, 0.052), (HS, 0.045)])     # верх: доля хорды
HL = pchip([(0, 0.044), (4.3, 0.040), (7.1, 0.040), (13.5, 0.040), (22.2, 0.035), (HS, 0.030)])     # низ
TE_T = 0.012                    # толщина задней кромки


def smoothstep(e0, e1, v):
    t = min(1.0, max(0.0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t)


def cos2(d, w):
    return math.cos(math.pi / 2 * d / w) ** 2 if abs(d) < w else 0.0


CREW_H = pchip([(1.0, 0.0), (1.9, 0.15), (3.0, 0.47), (4.1, 0.58), (5.0, 0.53), (6.3, 0.40), (8.5, 0.24), (10.7, 0.13), (12.5, 0.04), (14.0, 0.0)])
CREW_W = pchip([(1.0, 1.2), (2.5, 2.1), (4.0, 2.7), (8.0, 2.8), (14.0, 2.6)])
A_LIP = 6.0                     # губа воздухозаборника по оси горба
NAC_X, NAC_W = 4.35, 2.05


LIP_TEETH, LIP_AMP = 3, 0.24


def lip_a(xa):
    """Губа в плане: выпуклая вперёд, края загнуты назад, по кромке капюшона - пила из трёх зубцов остриём вперёд (b2_01, 02, 03; слово Mark 2026-11-10)."""
    u = (xa - NAC_X) / (NAC_W * 0.78)                          # -1…1 по ширине устья
    base = A_LIP + 0.55 * ((xa - NAC_X) / NAC_W) ** 2
    if abs(u) >= 1: return base
    t = ((u + 1) / 2 * LIP_TEETH) % 1.0; tooth = abs(2 * t - 1)    # 1 у впадины, 0 у острия
    return base + LIP_AMP * tooth * (1 - abs(u) ** 6)
NAC_K = 0.70                    # Mark 2026-11-10: заборники ниже (на фото сбоку горб до низа лобового стекла)
NAC_H = pchip([(A_LIP - 0.05, 0.0), (A_LIP + 0.12, 0.42 * NAC_K), (A_LIP + 0.4, 0.60 * NAC_K), (A_LIP + 1.0, 0.68 * NAC_K), (10.0, 0.66 * NAC_K), (12.5, 0.58 * NAC_K), (14.0, 0.46 * NAC_K), (15.0, 0.18 * NAC_K), (16.0, 0.0)])     # горб двигателя: высокий капюшон у губы (b2_01, b2_02), обрывается к жёлобу
BELLY = pchip([(1.0, 0.0), (2.5, 0.16), (4.0, 0.34), (6.5, 0.52), (10.5, 0.54), (12.6, 0.40), (14.0, 0.22), (16.5, 0.0)])


def env(s): return smoothstep(0.0, 0.05, s) * (1 - smoothstep(0.86, 1.0, s))


def wmix(x): return 1 - smoothstep(3.0, 9.0, abs(x))


def plateau(d, w, core=0.42):
    """Поперечный профиль горба: плоская середина, края по cos²."""
    d = abs(d)
    if d <= core * w: return 1.0
    return cos2(d - core * w, w * (1 - core))


RAMP = pchip([(A_LIP - 1.8, 0.0), (A_LIP - 0.9, 0.07), (A_LIP - 0.2, 0.13), (A_LIP + 0.6, 0.14), (A_LIP + 2.2, 0.0)])


def bump_top(a, x, nac=True):
    xa = abs(x); h = CREW_H(a) * cos2(xa, CREW_W(a))
    da = a - (lip_a(xa) - A_LIP)
    h -= RAMP(da) * plateau(xa - NAC_X, NAC_W * 0.85, 0.35)            # рампа перед губой ниже обшивки (b2_03)
    if nac and da > A_LIP - 0.05: h += (NAC_H(da) + RAMP(da)) * plateau(xa - NAC_X, NAC_W)
    return h


def bump_bot(a, x): return BELLY(a) * cos2(abs(x), 5.6)


def surf(a, x, nac=True):
    """Верх и низ обшивки в точке плана (без вырезов)."""
    a0, a1 = a_le(x), a_te(x); c = max(1e-6, a1 - a0); s = min(1.0, max(0.0, (a - a0) / c)); w = wmix(x)
    u = w * U_C(s) + (1 - w) * U_W(s); l_ = w * L_C(s) + (1 - w) * L_W(s); xa = abs(x)
    zt = HU(xa) * c * u + TE_T / 2 * s; zb = -HL(xa) * c * l_ - TE_T / 2 * s
    e = env(s); return zt + bump_top(a, x, nac) * e, zb - bump_bot(a, x) * e


def s_dist(n):
    """Хорда: сгущение к передней кромке и к задней."""
    return [0.5 - 0.5 * math.cos(math.pi * (i / n) ** 0.9) for i in range(n + 1)]


def stations_x():
    xs = set([0.0, X_N2, X_A1, X_N1, X_TT, HS - 0.02])
    def run(x0, x1, dx):
        n = max(1, int(math.ceil((x1 - x0) / dx)))
        for i in range(n + 1): xs.add(round(x0 + (x1 - x0) * i / n, 5))
    run(0.0, 2.0, 0.12); run(2.0, 6.8, 0.06); run(6.8, 7.2, 0.12); run(7.2, X_N1, 0.3); run(X_N1, X_TT, 0.35); run(X_TT, HS - 0.02, 0.25)
    xs = sorted(xs); return [-x for x in reversed(xs) if x > 0] + xs


def s_grid(x, n):
    """Доли хорды для станции x: базовая плотность (сгущение к кромкам) плюс сгущение у губы воздухозаборника и у стенки выхлопа.
    Плотность меняется с x плавно, точки сдвигаются, связи между станциями не перескакивают."""
    a0, a1 = a_le(x), a_te(x); c = a1 - a0; M = 2000; xa = abs(x)
    wl = 1 - smoothstep(6.0, 7.2, xa); wt = cos2(xa - TR['x'], 2.2)
    sl = (lip_a(xa) - a0) / c; st = (TR['a0'] - a0) / c; sg = 0.30 / c
    def rho(u):
        r = 1.0 / max(0.12, math.sin(math.pi * max(0.0005, min(0.9995, u))) ** 0.55)
        r += wl * 16.0 * math.exp(-((u - sl) / sg) ** 2) + wt * 8.0 * math.exp(-((u - st) / (0.5 * sg)) ** 2)
        return r
    us = [i / M for i in range(M + 1)]; cum = [0.0]
    for i in range(M): cum.append(cum[-1] + 0.5 * (rho(us[i]) + rho(us[i + 1])) / M)
    out = []; j = 0
    for k in range(n + 1):
        t = cum[-1] * k / n
        while j < M - 1 and cum[j + 1] < t: j += 1
        f = (t - cum[j]) / max(1e-12, cum[j + 1] - cum[j]); out.append(min(1.0, max(0.0, us[j] + f / M)))
    out[0], out[-1] = 0.0, 1.0; return out


def skin_shell(ns=76):
    rings = []
    for x in stations_x():
        a0, a1 = a_le(x), a_te(x); c = a1 - a0; up = []; lo = []
        for s in s_grid(x, ns):
            a = a0 + c * s; zt, zb = surf(a, x); up.append(P3(a, x, zt)); lo.append(P3(a, x, zb))
        rings.append(list(reversed(up)) + lo[1:-1] + [lo[-1]])
    b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN); return b.finish('B2_skin', sharp_deg=40)


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


def cut(host, ob):
    _apply_bool(host, ob, 'DIFFERENCE'); _drop(ob)


def bvh_ready(host):
    me = host.data; BVH['t'] = BVHTree.FromPolygons([host.matrix_world @ v.co for v in me.vertices], [tuple(p.vertices) for p in me.polygons])


def top(a, x):
    h = BVH['t'].ray_cast(P3(a, x, 6.0), Vector((0, 0, -1))); return h[0].z if h[0] is not None else 0.0


def bot(a, x):
    h = BVH['t'].ray_cast(P3(a, x, -6.0), Vector((0, 0, 1))); return h[0].z if h[0] is not None else 0.0


def prism(name, poly, z0, z1, mat=G_DARK, sx=1):
    pts0 = [P3(a, sx * x, z0) for a, x in poly]; pts1 = [P3(a, sx * x, z1) for a, x in poly]
    b = B(); b.loft([pts0, pts1], mat, cap0=mat, cap1=mat); return b.finish(name, sharp_deg=20)


def _w3(v, sx=1): return P3(v[0], sx * v[1], v[2])


# ── органы управления по задней кромке: ось у кромки выреза, нос круглый в круглой выемке (рецепт, раздел «Проверка стыков») ──
# Отрезок задней кромки p0 -> p1 (a, x), доли t0..t1 вдоль него, хорда ch. pr - от оси к кромке (назад).
TE_SEG = dict(outer=((2 * AT - K * X_TT - 0.0, X_TT), (C1 + K * X_N1, X_N1)), mid=((C2 - K * X_N1, X_N1), (C2 - K * X_A1, X_A1)))
CTRL = dict(split=('outer', 0.035, 0.47, 1.40), elev_o=('outer', 0.495, 0.955, 1.40), elev_m=('mid', 0.035, 0.49, 1.30), elev_i=('mid', 0.515, 0.94, 1.30))
CTRL_GAP = 0.005


def _seg(name):
    p0, p1 = TE_SEG[name]; P0 = Vector((p0[0], p0[1], 0)); P1 = Vector((p1[0], p1[1], 0)); d = (P1 - P0); d.z = 0; d = d.normalized()
    pr = Vector((d.y, -d.x, 0))          # от оси к кромке - назад (a растёт)
    if pr.x < 0: pr = -pr
    return P0, P1, d, pr


def TE_SEG_LEN(name):
    P0, P1, d, pr = _seg(name); return (P1 - P0).length


def _te_pt(name, t):
    P0, P1, d, pr = _seg(name); return P0 + (P1 - P0) * t


def ctrl_cut(tag, sx):
    """Вырез под орган управления: от оси назад, и круглая выемка радиусом носа + зазор (нос в круглой выемке, щель одна при любом угле)."""
    seg, t0, t1, ch = CTRL[tag]; P0, P1, d, pr = _seg(seg); out = []; n_st = 6
    sts = [t0 + (t1 - t0) * i / n_st for i in range(n_st + 1)]; rr = []
    for t in sts:
        H = _te_pt(seg, t) - pr * ch; zt = top(H.x, H.y); zb = bot(H.x, H.y); r = max(0.012, (zt - zb) / 2); rr.append((H + pr * (r + CTRL_GAP), (zt + zb) / 2, r))
    # прямоугольник от оси назад
    poly = [rr[0][0], rr[-1][0], _te_pt(seg, t1) + pr * 0.4, _te_pt(seg, t0) + pr * 0.4]
    out.append(prism('c_ct', [(p.x, p.y) for p in poly], -1.5, 2.0, G_DARK, sx))
    # выемка: труба вдоль оси
    rings = []; N = 16
    for c0, zc, r in rr:
        R = (r + CTRL_GAP) / math.cos(math.pi / N); rings.append([_w3((c0.x + pr.x * R * math.cos(2 * math.pi * k / N), c0.y + pr.y * R * math.cos(2 * math.pi * k / N), zc + R * math.sin(2 * math.pi * k / N)), sx) for k in range(N)])
    e = (rr[-1][0] - rr[0][0]).normalized() * 0.002
    rings[0] = [v - _w3((e.x, e.y, 0), sx) + _w3((0, 0, 0), sx) for v in rings[0]]
    b = B(); b.loft(rings, G_DARK, cap0=G_DARK, cap1=G_DARK); out.append(b.finish('c_cv', sharp_deg=30))
    return out


def _ctrl_rings(seg, t0, t1, ch, sx, half=None, n_st=6):
    """Кольца органа управления: нос - полукруг на оси, дальше верх и низ по обшивке до кромки. half: None - целиком, 'u' - верхняя половина, 'd' - нижняя."""
    P0, P1, d, pr = _seg(seg); rings = []; C = []; N = 8
    e_ = 0.006 / (TE_SEG_LEN(seg)); sts = [t0 + e_ + (t1 - t0 - 2 * e_) * i / n_st for i in range(n_st + 1)]
    for t in sts:
        H = _te_pt(seg, t) - pr * ch; zt = top(H.x, H.y); zb = bot(H.x, H.y); r = max(0.012, (zt - zb) / 2); zc = (zt + zb) / 2; c0 = H + pr * (r + CTRL_GAP); C.append((c0, zc)); ring = []
        mid = lambda q: (top(q.x, q.y) + bot(q.x, q.y)) / 2
        ring = []
        if half is None:
            for k in range(N + 1):
                ang = math.pi / 2 + math.pi * k / N; q = c0 + pr * (r * math.cos(ang)); ring.append(_w3((q.x, q.y, zc + r * math.sin(ang)), sx))
            for fr in (0.3, 0.6, 0.85, 1.0):
                q = H + pr * (ch * fr); ring.append(_w3((q.x, q.y, bot(q.x, q.y) - 0.0015), sx))
            for fr in (1.0, 0.85, 0.6, 0.3):
                q = H + pr * (ch * fr); ring.append(_w3((q.x, q.y, top(q.x, q.y) + 0.0015), sx))
        elif half == 'u':
            for k in range(N // 2 + 1):           # от середины до верха носа: угол от 180° к 90°
                ang = math.pi - math.pi / 2 * k / (N // 2); q = c0 + pr * (r * math.cos(ang)); ring.append(_w3((q.x, q.y, zc + r * math.sin(ang)), sx))
            for fr in (0.3, 0.6, 0.85, 1.0):
                q = H + pr * (ch * fr); ring.append(_w3((q.x, q.y, top(q.x, q.y) + 0.0015), sx))
            for fr in (1.0, 0.85, 0.6, 0.3):
                q = H + pr * (ch * fr); ring.append(_w3((q.x, q.y, mid(q) + 0.002), sx))
        else:
            for k in range(N // 2 + 1):           # от середины до низа носа: 180° к 270°
                ang = math.pi + math.pi / 2 * k / (N // 2); q = c0 + pr * (r * math.cos(ang)); ring.append(_w3((q.x, q.y, zc + r * math.sin(ang)), sx))
            for fr in (0.3, 0.6, 0.85, 1.0):
                q = H + pr * (ch * fr); ring.append(_w3((q.x, q.y, bot(q.x, q.y) - 0.0015), sx))
            for fr in (1.0, 0.85, 0.6, 0.3):
                q = H + pr * (ch * fr); ring.append(_w3((q.x, q.y, mid(q) - 0.002), sx))
        rings.append(ring)
    A0 = _w3((C[0][0].x, C[0][0].y, C[0][1]), sx); A1 = _w3((C[-1][0].x, C[-1][0].y, C[-1][1]), sx)
    return rings, A0, A1


def ctrl_surface(tag, sx):
    seg, t0, t1, ch = CTRL[tag]; side = 'r' if sx > 0 else 'l'; out = []
    halves = (('u', 'split_u'), ('d', 'split_d')) if tag == 'split' else ((None, tag),)
    for half, base in halves:
        name = '%s_%s' % (base, side); rings, A0, A1 = _ctrl_rings(seg, t0, t1, ch, sx, half)
        pivot = (A0 + A1) / 2; axis = (A1 - A0).normalized()
        if axis.x < 0: axis = -axis
        b = B(); b.loft([[v - pivot for v in r] for r in rings], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); ob = b.finish(name, sharp_deg=12); ob.location = pivot
        if half == 'u': rng, note = (0.0, 45.0), 'верхняя половина расщепляющегося щитка: плюс - кромка вверх (знак проверить по оси)'
        elif half == 'd': rng, note = (0.0, 45.0), 'нижняя половина: плюс - кромка вниз (знак проверить по оси)'
        else: rng, note = (-30.0, 30.0), 'ось у передней кромки; знак - по правилу правой руки вокруг оси'
        PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=rng, note=note); out.append(ob)
    return out


# ── «бобровый хвост»: треугольник у центрального зубца, ось поперёк ──
TAIL_A = 18.30


def tail_x(): return (C4 - TAIL_A) / K


def tail_cut():
    """Вырез под «бобровый хвост» как у рулей: от оси назад и круглая выемка радиусом носа + зазор (раньше - прямая щель 2,5 см, снизу было видно небо)."""
    xh = tail_x() + 0.02; n = 14; rr = []
    for i in range(n + 1):
        x = -xh + 2 * xh * i / n; zt = top(TAIL_A, x); zb = bot(TAIL_A, x); r = max(0.01, (zt - zb) / 2); rr.append((TAIL_A + r + CTRL_GAP, x, (zt + zb) / 2, r))
    out = [prism('c_tail', [(c, x) for c, x, _, _ in rr] + [(C4 + 0.6, xh), (C4 + 0.6, -xh)], -1.5, 2.0, G_DARK)]
    rings = []; N = 16
    for c, x, zc, r in rr:
        R = (r + CTRL_GAP) / math.cos(math.pi / N); rings.append([P3(c + R * math.cos(2 * math.pi * k / N), x, zc + R * math.sin(2 * math.pi * k / N)) for k in range(N)])
    b = B(); b.loft(rings, G_DARK, cap0=G_DARK, cap1=G_DARK); out.append(b.finish('c_tcv', sharp_deg=30))
    return out


def tail_part():
    xh = tail_x() - 0.03; n = 14; rings = []; N = 8
    zt0 = top(TAIL_A, 0.0); zb0 = bot(TAIL_A, 0.0)
    for i in range(n + 1):
        x = -xh + 2 * xh * i / n; zt = top(TAIL_A, x); zb = bot(TAIL_A, x); r = max(0.01, (zt - zb) / 2); zc = (zt + zb) / 2; ac = TAIL_A + r + CTRL_GAP; ring = []
        ring = []
        for k in range(N + 1):
            ang = math.pi / 2 + math.pi * k / N; ring.append(P3(ac + r * math.cos(ang), x, zc + r * math.sin(ang)))
        ae = a_te(x) - 0.004; ch = max(0.05, ae - TAIL_A)
        for fr in (0.3, 0.6, 0.85, 1.0):
            a = TAIL_A + ch * fr; ring.append(P3(a, x, bot(min(a, ae - 0.01), x) - 0.0015))
        for fr in (1.0, 0.85, 0.6, 0.3):
            a = TAIL_A + ch * fr; ring.append(P3(a, x, top(min(a, ae - 0.01), x) + 0.0015))
        rings.append(ring)
    pivot = P3(TAIL_A + 0.05, 0.0, (zt0 + zb0) / 2); b = B(); b.loft([[v - pivot for v in r] for r in rings], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); ob = b.finish('tail', sharp_deg=12); ob.location = pivot
    PARTS['tail'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(-30.0, 30.0), note='«бобровый хвост»: ось поперёк, плюс - кромка вверх (правило правой руки вокруг +X)')
    return ob


# ── воздухозаборники: под капюшоном горба двигателей ──
def inlet_cut(sx):
    """Резак: сечения поперёк (по x); на каждом - профиль в (a, z): впереди над рампой, под капюшоном (толщина 0,09) - назад и вниз (канал)."""
    HOOD = 0.09; rings = []; n = LIP_TEETH * 2 * 4; W = NAC_W * 0.78 - 0.002
    for j in range(n + 1):
        x = NAC_X - W + 2 * W * j / n; al = lip_a(x); ring = []           # n кратно зубцам: острия и впадины - на сечениях
        hood = lambda a: surf(a, x)[0] - HOOD
        base = lambda a: surf(a, x, nac=False)[0]
        A = [al - 0.30, al - 0.02, al + 0.35, al + 0.9, al + 1.6, al + 2.4, al + 3.2]
        tops = []; bots = []
        for a in A:
            dive = smoothstep(al + 0.2, al + 3.2, a) * 0.85; ah = max(a, al + 0.30)
            zb = base(a) + 0.006 - dive; zt = hood(ah) - dive * 0.45
            tops.append((a, max(zt, zb + 0.006))); bots.append((a, zb))
        ring = [P3(a, sx * x, z) for a, z in tops] + [P3(a, sx * x, z) for a, z in reversed(bots)]
        rings.append(ring)
    b = B(); b.loft(rings, G_DARK, cap0=G_DARK, cap1=G_DARK); return b.finish('c_inl', sharp_deg=25)


# ── выхлоп: жёлоб на верхней поверхности от стенки с соплами до кромки ──
TR = dict(a0=14.20, x=4.30, w0=0.70, w1=1.00, depth=0.26, wall=0.30)


def trough_cut(sx):
    """Жёлоб выхлопа: пологие стенки, дно поднимается к кромке; передняя стенка - с соплами."""
    T = TR; rings = []; n = 14; A_END = a_te(T['x']) + 0.8
    for a in [T['a0'] - 0.03, T['a0'] + 0.02, T['a0'] + 0.5, T['a0'] + 1.2, T['a0'] + 2.0, T['a0'] + 2.8, T['a0'] + 3.4, A_END]:
        k = smoothstep(T['a0'], T['a0'] + 3.4, a); hw = T['w0'] + (T['w1'] - T['w0']) * k; dep = T['depth'] * (1 - 0.82 * k); wall = T['wall'] * (1 - 0.4 * k)
        pts = []
        for j in range(n + 1):
            u = -1 + 2 * j / n; x = T['x'] + (hw + wall) * u; aa = min(a, a_te(x) - 0.03); zs = surf(aa, x)[0]
            zt_, zb_ = surf(aa, x); dd = min(dep, 0.45 * (zt_ - zb_))
            fl = zs - dd * (1 - smoothstep(hw / (hw + wall), 1.0, abs(u))) + 0.02 * smoothstep(hw / (hw + wall), 1.0, abs(u))
            pts.append(P3(a, sx * x, fl))
        top_ = [P3(a, sx * (T['x'] + (hw + wall) * (1 - 2 * j / n)), surf(min(a, a_te(T['x']) - 0.03), T['x'])[0] + 1.6) for j in range(n + 1)]
        rings.append(pts + top_)
    b = B(); b.loft(rings, G_HOT, cap0=G_HOT, cap1=G_HOT); return b.finish('c_tr', sharp_deg=25)


def nozzle_cut(sx):
    """Два выхлопа в передней стенке жёлоба: тёмные проёмы вглубь стенки."""
    T = TR; b = B(); out = []
    for dx in (-0.42, 0.42):
        x = T['x'] + dx * 0.72; zs = surf(T['a0'] + 0.05, x)[0]; zc = zs - T['depth'] * 0.5; hw, hh = 0.24, 0.10
        ring = lambda a, k: [P3(a, sx * (x - hw * k), zc - hh * k), P3(a, sx * (x + hw * k), zc - hh * k), P3(a, sx * (x + hw * k), zc + hh * k), P3(a, sx * (x - hw * k), zc + hh * k)]
        b.loft([ring(T['a0'] + 0.3, 1.0), ring(T['a0'] - 0.9, 0.9)], G_DARK, cap0=G_DARK, cap1=G_DARK)
        STATIONS.setdefault('nozzles', []).append(P3(T['a0'] + 0.02, sx * x, zc))
    return b.finish('c_noz', sharp_deg=25)


# ── кабина: полость, окна, стекло, кресла ──
def _arc(p0, p1, bulge, n):
    """Дуга от p0 к p1 (a, x) с прогибом bulge вперёд (минус по a)."""
    out = []
    for i in range(n):
        t = i / n; a = p0[0] + (p1[0] - p0[0]) * t - bulge * math.sin(math.pi * t); x = p0[1] + (p1[1] - p0[1]) * t; out.append((a, x))
    return out


def _line(p0, p1, n):
    return [(p0[0] + (p1[0] - p0[0]) * i / n, p0[1] + (p1[1] - p0[1]) * i / n) for i in range(n)]


# окна правой стороны (a, x), обход против часовой в осях (a, x); нижняя кромка лобовых - дуга (b2_03)
POST = 0.07
WIN = dict(
    fl=_line((3.98, POST), (2.78, POST), 6) + _arc((2.78, POST), (2.92, 1.12), 0.10, 8) + _line((2.92, 1.12), (3.86, 1.05), 6) + _line((3.86, 1.05), (3.98, POST), 6),
    sd=_line((3.08, 1.26), (3.96, 1.19), 6) + _line((3.96, 1.19), (4.28, 1.52), 4) + _line((4.28, 1.52), (3.42, 1.70), 6) + _line((3.42, 1.70), (3.08, 1.26), 4))
FRAME = 0.08


def cock_cavity():
    """Полость кабины под окнами: стенки 12 см под обшивкой, частая сетка, чтобы не прорезать купол между точками."""
    rings = []; n = 28
    for i in range(15):
        a = 2.7 + 3.0 * i / 14; ring_t = []; ring_b = []
        for j in range(n + 1):
            x = -1.95 + 3.9 * j / n; zt = top(a, x) - 0.12; zb = max(0.36, bot(a, x) + 0.25)
            zt = max(zt, zb + 0.01); ring_t.append(P3(a, x, zt)); ring_b.append(P3(a, x, zb))
        rings.append(ring_t + list(reversed(ring_b)))
    b = B(); b.loft(rings, G_COCK, cap0=G_COCK, cap1=G_COCK); return b.finish('c_cock', sharp_deg=25)


def window_cuts():
    out = []
    for nm, poly in WIN.items():
        for sx in (1, -1):
            pts = [(a, sx * x) for a, x in poly]
            if sx < 0: pts = list(reversed(pts))
            out.append(_win_prism(pts))
    return out


def _win_prism(pts):
    b = B(); r0 = [P3(a, x, top(a, x) - 0.40) for a, x in pts]; r1 = [P3(a, x, top(a, x) + 0.4) for a, x in pts]
    b.loft([r0, r1], G_COCK, cap0=G_COCK, cap1=G_COCK); return b.finish('c_win', sharp_deg=20)


def glass():
    """Стёкла: на 1,5 см ниже обшивки, веер от центра с кольцами - повторяет купол."""
    bg = B(); bm = bg.bm
    for nm, poly in WIN.items():
        for sx in (1, -1):
            pts = [(a, sx * x) for a, x in poly]; ca = sum(p[0] for p in pts) / len(pts); cx = sum(p[1] for p in pts) / len(pts)
            vc = bm.verts.new(P3(ca, cx, top(ca, cx) - 0.015)); rings = []
            for k in (0.5, 1.0):
                rings.append([bm.verts.new(P3(ca + (a - ca) * k, cx + (x - cx) * k, top(ca + (a - ca) * k, cx + (x - cx) * k) - 0.015)) for a, x in pts])
            n = len(pts)
            for i in range(n):
                j = (i + 1) % n; f = bm.faces.new((vc, rings[0][i], rings[0][j])); f.material_index = G_GLASS
                f = bm.faces.new((rings[0][i], rings[1][i], rings[1][j], rings[0][j])); f.material_index = G_GLASS
    return bg.finish('B2_glass', sharp_deg=60)


def _offset_poly(pts, d):
    n = len(pts); area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n)); sg = 1 if area > 0 else -1; out = []
    for i in range(n):
        p, c, q = pts[i - 1], pts[i], pts[(i + 1) % n]
        e0 = (c[0] - p[0], c[1] - p[1]); e1 = (q[0] - c[0], q[1] - c[1]); l0 = math.hypot(*e0) or 1; l1 = math.hypot(*e1) or 1
        n0 = (e0[1] / l0 * sg, -e0[0] / l0 * sg); n1 = (e1[1] / l1 * sg, -e1[0] / l1 * sg); m = (n0[0] + n1[0], n0[1] + n1[1]); lm = math.hypot(*m) or 1; m = (m[0] / lm, m[1] / lm)
        kk = 1.0 / max(0.5, m[0] * n0[0] + m[1] * n0[1]); out.append((c[0] + m[0] * d * kk, c[1] + m[1] * d * kk))
    return out


def frames():
    """Рама: одно кольцо вокруг всей группы окон (b2_03) плюс стойки между окнами; на 1,2 см над обшивкой, борт вниз под обшивку."""
    b = B()
    for nm, poly in WIN.items():
        for sx in (1, -1):
            pts = [(a, sx * x) for a, x in poly]
            if sx < 0: pts = list(reversed(pts))
            outer = _offset_poly(pts, FRAME)
            inn = [P3(a, x, top(a, x) + 0.012) for a, x in pts]; out_ = [P3(a, x, top(a, x) + 0.012) for a, x in outer]
            inl = [P3(a, x, top(a, x) - 0.05) for a, x in pts]; outl = [P3(a, x, top(a, x) - 0.03) for a, x in outer]
            b.loft([inl, inn, out_, outl, inl], G_SKIN)
    return b.finish('det_frame', sharp_deg=30)


def seats():
    b = B()
    def box(a0, a1, x0, x1, z0, z1, mat=G_COCK):
        rg = lambda a: [P3(a, x0, z0), P3(a, x1, z0), P3(a, x1, z1), P3(a, x0, z1)]
        b.loft([rg(a0), rg(a1)], mat, cap0=mat, cap1=mat)
    for sx in (1, -1):
        xc = sx * 0.62; z0 = 0.38
        box(4.05, 4.65, xc - 0.27, xc + 0.27, z0, z0 + 0.40)          # сиденье
        box(4.55, 4.75, xc - 0.27, xc + 0.27, z0 + 0.40, z0 + 0.98)   # спинка
        box(4.50, 4.62, xc - 0.12, xc + 0.12, z0 + 0.98, z0 + 1.12, G_DARK)   # заголовник
    box(3.10, 3.55, -1.10, 1.10, 0.70, 1.06, G_COCK)                   # приборная доска
    box(3.10, 3.20, -1.05, 1.05, 1.06, 1.16, G_DARK)                   # козырёк
    return b.finish('det_cock', sharp_deg=30)


# ── бомбоотсеки: два рядом по оси, у каждого две створки на продольных петлях (внутренняя и наружная), пилообразные торцы ──
BAY = dict(a0=4.90, a1=11.75, xi=0.18, xo=2.42, ceil=1.00, rack=0.80, teeth=3, amp=0.16)    # GBU-57 6,31 м, оперение крестом 1,76 м: середина отсека на a 8,33, бомба входит при закрытых и выходит при открытых на 95° (_bomb.py)


def _tooth(xa):
    """Пила торцов отсека: сдвиг по a как функция |x| (зубцы поперёк)."""
    B_ = BAY; w = (B_['xo'] - B_['xi']) / B_['teeth']; t = ((xa - B_['xi']) / w) % 1.0
    return B_['amp'] * (1 - abs(2 * t - 1))


def bay_poly(sx, d=0.0):
    """План отсека (a, x) с пилой спереди и сзади; d - сдвиг внутрь."""
    B_ = BAY; n = B_['teeth'] * 2; xs = [B_['xi'] + d + (B_['xo'] - B_['xi'] - 2 * d) * i / n for i in range(n + 1)]
    fr = [(B_['a0'] + d + _tooth(x), sx * x) for x in xs]; bk = [(B_['a1'] - d + _tooth(x), sx * x) for x in reversed(xs)]
    return fr + bk


def bay_ceil(a, x):
    """Потолок отсека: не выше 1,00, обшивка над ним 0,10; под кабиной - ниже её пола."""
    c = min(BAY['ceil'], top(a, x) - 0.10)
    return min(c, 0.32) if a < 5.85 else c


def bay_cut(sx):
    """Резак отсека: сечения поперёк по вершинам пилы; в каждом - профиль вдоль a: снизу под обшивкой, сверху потолок по обшивке (bay_ceil)."""
    B_ = BAY; w2 = (B_['xo'] - B_['xi']) / B_['teeth'] / 2; xs = [B_['xi'] + k * w2 for k in range(B_['teeth'] * 2 + 1)]
    xs = sorted(set(xs + [B_['xi'] + (B_['xo'] - B_['xi']) * i / 24 for i in range(25)])); nv = 28; rings = []
    for xa in xs:
        af = B_['a0'] + _tooth(xa); ab = B_['a1'] + _tooth(xa); A = [af + (ab - af) * j / nv for j in range(nv + 1)]; x = sx * xa
        rings.append([P3(a, x, bot(a, x) - 0.5) for a in A] + [P3(a, x, bay_ceil(a, x)) for a in reversed(A)])
    b = B(); b.loft(rings, G_COCK, cap0=G_COCK, cap1=G_COCK); return b.finish('c_bay', sharp_deg=20)


def bay_door(sx, which):
    """Створка: сетка по низу обшивки (повторяет выпуклость), толщина 3 см; петля - продольная кромка (внутренняя у оси или наружная)."""
    B_ = BAY; xm = (B_['xi'] + B_['xo']) / 2; G = 0.006
    xa0, xa1 = (B_['xi'] + G, xm - G / 2) if which == 'i' else (xm + G / 2, B_['xo'] - G)
    nv = 18; rings = []; w2 = (B_['xo'] - B_['xi']) / B_['teeth'] / 2
    xs = sorted(set([xa0, xa1] + [B_['xi'] + k * w2 for k in range(B_['teeth'] * 2 + 1) if xa0 < B_['xi'] + k * w2 < xa1] + [xa0 + (xa1 - xa0) * i / 8 for i in range(1, 8)]))
    for xa in xs:
        af = B_['a0'] + G + _tooth(xa); ab = B_['a1'] - G + _tooth(xa)
        lo = [P3(af + (ab - af) * j / nv, sx * xa, bot(af + (ab - af) * j / nv, sx * xa) + 0.0005) for j in range(nv + 1)]
        hi = [P3(af + (ab - af) * j / nv, sx * xa, bot(af + (ab - af) * j / nv, sx * xa) + 0.032) for j in range(nv, -1, -1)]
        rings.append(lo + hi)
    xh = xa0 if which == 'i' else xa1; ah = (B_['a0'] + B_['a1']) / 2; pivot = P3(ah, sx * xh, bot(ah, sx * xh) - 0.004)
    b = B(); b.loft([[v - pivot for v in r] for r in rings], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    # рёбра изнутри
    for k in range(1, 6):
        af = B_['a0'] + (B_['a1'] - B_['a0']) * k / 6
        rg = lambda aa: [P3(aa, sx * (xa0 + 0.05), bot(aa, sx * (xa0 + 0.05)) + 0.032) - pivot, P3(aa, sx * (xa1 - 0.05), bot(aa, sx * (xa1 - 0.05)) + 0.032) - pivot,
                         P3(aa, sx * (xa1 - 0.05), bot(aa, sx * (xa1 - 0.05)) + 0.08) - pivot, P3(aa, sx * (xa0 + 0.05), bot(aa, sx * (xa0 + 0.05)) + 0.08) - pivot]
        b.loft([rg(af - 0.02), rg(af + 0.02)], G_COCK, cap0=G_COCK, cap1=G_COCK)
    name = 'bay_%s_%s' % ('r' if sx > 0 else 'l', which); ob = b.finish(name, sharp_deg=20); ob.location = pivot
    # плюс по правилу правой руки: свободная кромка вниз. Внутренняя створка правого отсека: петля у оси, свободная кромка снаружи - вращение вокруг -Y... считаем знак по центру
    ax = Vector((0, 1, 0)); c = P3(ah, sx * (xa0 + xa1) / 2, bot(ah, sx * (xa0 + xa1) / 2)) - pivot
    from mathutils import Matrix
    if (Matrix.Rotation(math.radians(20), 3, ax) @ c).z > c.z: ax = -ax
    PARTS[name] = dict(pivot=pivot.copy(), axis=ax, range=(0.0, 100.0), note='створка отсека: петля на %s кромке, плюс - свободная кромка вниз' % ('внутренней' if which == 'i' else 'наружной'))
    return ob


def bay_inner():
    """Нутро: потолок с поперечными балками и продольными рёбрами, шпангоуты по стенкам, держатель с замками, цилиндры створок."""
    b = B(); B_ = BAY
    def box(a0, a1, x0, x1, z0, z1, mat=G_COCK):
        rg = lambda a: [P3(a, x0, z0), P3(a, x1, z0), P3(a, x1, z1), P3(a, x0, z1)]
        b.loft([rg(a0), rg(a1)], mat, cap0=mat, cap1=mat)
    for sx in (1, -1):
        xi, xo = sx * B_['xi'], sx * B_['xo']; lo_, hi_ = min(xi, xo) + 0.01, max(xi, xo) - 0.01
        zc_ = lambda a_, x0_, x1_: min(bay_ceil(a_, x0_ + (x1_ - x0_) * q / 6) for q in range(7)) + 0.01      # потолок под деталью: ниже обшивки везде
        for k in range(10):
            a_ = B_['a0'] + 0.45 + (B_['a1'] - B_['a0'] - 0.9) * k / 9; z_ = zc_(a_, lo_, hi_); box(a_ - 0.035, a_ + 0.035, lo_, hi_, z_ - 0.10, z_, G_COCK)
        for f in (0.2, 0.5, 0.8):
            xf = lo_ + (hi_ - lo_) * f
            for k in range(9):
                a0_ = B_['a0'] + 0.3 + (B_['a1'] - B_['a0'] - 0.6) * k / 9; a1_ = a0_ + (B_['a1'] - B_['a0'] - 0.6) / 9; z_ = min(zc_(a0_, xf - 0.02, xf + 0.02), zc_(a1_, xf - 0.02, xf + 0.02))
                box(a0_, a1_, xf - 0.02, xf + 0.02, z_ - 0.06, z_, G_COCK)
        for xw in (xi, xo):                      # шпангоуты по стенкам
            k_ = -0.06 if abs(xw) > abs((xi + xo) / 2) else 0.06; k_ *= sx
            for kk in range(8):
                a_ = B_['a0'] + 0.5 + (B_['a1'] - B_['a0'] - 1.0) * kk / 7; z_lo = bot(a_, xw) + 0.06
                box(a_ - 0.03, a_ + 0.03, min(xw, xw + k_ * -1), max(xw, xw + k_ * -1), z_lo, bay_ceil(a_, xw) - 0.02, G_COCK)
        xc = sx * (B_['xi'] + B_['xo']) / 2; zr = B_['rack']; am = (B_['a0'] + B_['a1']) / 2       # zr - низ замков = верх бомбы
        box(am - 2.2, am + 2.2, xc - 0.07, xc + 0.07, zr + 0.09, zr + 0.22, G_METAL)               # держатель
        box(am - 2.2, am + 2.2, xc - 0.10, xc + 0.10, zr + 0.06, zr + 0.09, G_DARK)
        for da in (-0.76, 0.76):                                                                       # замки парой
            box(am + da - 0.06, am + da + 0.06, xc - 0.04, xc + 0.04, zr + 0.002, zr + 0.06, G_METAL)
        for da in (-1.6, -1.25, 1.25, 1.6):                                                            # упоры
            box(am + da - 0.025, am + da + 0.025, xc - 0.16, xc + 0.16, zr + 0.002, zr + 0.06, G_DARK)
        for da in (-1.9, 0.0, 1.9):                                                                    # подвески держателя к потолку
            box(am + da - 0.04, am + da + 0.04, xc - 0.05, xc + 0.05, zr + 0.22, max(zr + 0.23, bay_ceil(am + da, xc) - 0.01), G_METAL)
        for a_ in (B_['a0'] + 1.2, B_['a1'] - 1.2):                                                    # цилиндры створок
            for xw in (xi * 1.0 + sx * 0.12, xo - sx * 0.12):
                p0 = P3(a_, xw, B_['ceil'] - 0.12); p1 = P3(a_, xw, bot(a_, xw) + 0.15)
                rg = lambda c, r: [c + Vector((r * math.cos(2 * math.pi * q / 10), r * math.sin(2 * math.pi * q / 10), 0)) for q in range(10)]
                b.loft([rg(p0, 0.035), rg(p1, 0.022)], G_METAL, cap0=G_METAL, cap1=G_METAL)
        STATIONS['bay_' + ('r' if sx > 0 else 'l')] = [P3(am + da, xc, zr) for da in (-1.6, 1.6, -0.8, 0.0)]
    return b.finish('det_bay', sharp_deg=30)


# ── шасси: ниши и створки (в файле игры закрыты), стойки - в b2_gear.py ──
NOSE_W = dict(a0=2.05, a1=4.15, x=0.62)
MAIN_W = dict(a0=7.55, a1=12.45, xi=5.15, xm=6.05, xo=7.45)


def _nose_poly():
    D = NOSE_W; return [(D['a0'], -D['x']), (D['a0'], D['x']), (D['a1'] - 0.35, D['x']), (D['a1'], 0.0), (D['a1'] - 0.35, -D['x'])]


def _main_poly(sx, x0, x1):
    D = MAIN_W; sk = 0.42           # торцы скошены (параллельно кромкам)
    return [(D['a0'] + sk * (x1 - x0) / 1.4, sx * x0), (D['a0'], sx * x1), (D['a1'], sx * x1), (D['a1'] - sk * (x1 - x0) / 1.4, sx * x0)]


def _well_cut(name, poly_x, a_of, top_of, n=16):
    """Ниша по сечениям поперёк: в каждом профиль вдоль a, потолок - не выше обшивки минус 0,15 (частая сетка, чтобы не прорезать вогнутый бок горба)."""
    rings = []; nv = 20
    for x in poly_x:
        af, ab = a_of(x); A = [af + (ab - af) * j / nv for j in range(nv + 1)]
        rings.append([P3(a, x, bot(a, x) - 0.5) for a in A] + [P3(a, x, max(bot(a, x) + 0.05, min(top(a, x) - 0.15, top_of(a, x)))) for a in reversed(A)])
    b = B(); b.loft(rings, G_DARK, cap0=G_DARK, cap1=G_DARK); return b.finish(name, sharp_deg=20)


def gear_cuts(host):
    D = NOSE_W; xs = [-D['x'] + 2 * D['x'] * i / 16 for i in range(17)]
    nose_a = lambda x: (D['a0'], D['a1'] - 0.35 * abs(x) / D['x'] if abs(x) > 0 else D['a1'])
    cut(host, _well_cut('c_nw', xs, lambda x: (D['a0'], D['a1'] - 0.35 * abs(x) / D['x']), lambda a, x: 0.30))
    M_ = MAIN_W; sk = 0.42
    for sx in (1, -1):
        xs = sorted(set([M_['xi'] + (M_['xm'] - M_['xi']) * i / 8 for i in range(9)] + [M_['xm'] + 0.0005] + [M_['xm'] + (M_['xo'] - M_['xm']) * i / 8 for i in range(1, 9)])); xs = [sx * v for v in xs]
        if sx < 0: xs = list(reversed(xs))
        def a_of(x):
            xa = abs(x); x1 = M_['xm'] if xa <= M_['xm'] else M_['xo']          # торцы скошены у каждой створки свои (как _main_poly)
            k = sk * (x1 - xa) / 1.4; return (M_['a0'] + k, M_['a1'] - k)
        cut(host, _well_cut('c_mw', xs, a_of, lambda a, x: bot(a, x) + 1.15))


def _plate_door(name, poly, sx_hinge_edge, pivot, nseg=10):
    """Створка по низу обшивки: многоугольник плана, толщина 3 см, сетка через веер от центра."""
    b = B(); bm = b.bm; n = len(poly); ca = sum(p[0] for p in poly) / n; cx = sum(p[1] for p in poly) / n
    def ring(k, dz):
        return [bm.verts.new(P3(ca + (a - ca) * k, cx + (x - cx) * k, bot(ca + (a - ca) * k, cx + (x - cx) * k) + dz) - pivot) for a, x in poly]
    for dz, flip in ((0.0005, False), (0.032, True)):
        c = bm.verts.new(P3(ca, cx, bot(ca, cx) + dz) - pivot); r1 = ring(0.5, dz); r2 = ring(1.0, dz)
        for i in range(n):
            j = (i + 1) % n; fs = [(c, r1[i], r1[j]), (r1[i], r2[i], r2[j], r1[j])]
            for f in fs:
                q = bm.faces.new(tuple(reversed(f)) if flip else f); q.material_index = G_SKIN
        if not flip: low = r2
        else: high = r2
    for i in range(n):
        j = (i + 1) % n; q = bm.faces.new((low[j], low[i], high[i], high[j])); q.material_index = G_SKIN
    ob = b.finish(name, sharp_deg=25); ob.location = pivot; return ob


def doors():
    out = []; D = NOSE_W; G = 0.006
    poly = [(a + (G if a < 3 else -G), x * (1 - G / max(0.1, abs(x)) if x else 1)) for a, x in _nose_poly()]
    pv = P3(D['a0'] + G, 0.0, bot(D['a0'], 0.0) - 0.004); out.append(_plate_door('door_n', poly, None, pv))
    PARTS['door_n'] = dict(pivot=pv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 95.0), note='створка носовой стойки: петля поперёк у передней кромки, плюс - задняя кромка вниз; открытая висит перед колёсами (b2_03)')
    M_ = MAIN_W
    for sx, sd in ((1, 'r'), (-1, 'l')):
        for which, x0, x1 in (('i', M_['xi'] + G, M_['xm'] - G / 2), ('o', M_['xm'] + G / 2, M_['xo'] - G)):
            poly = _main_poly(sx, x0, x1); xh = x0 if which == 'i' else x1; ah = (M_['a0'] + M_['a1']) / 2; pv = P3(ah, sx * xh, bot(ah, sx * xh) - 0.004)
            name = 'door_m%s_%s' % (which, sd); out.append(_plate_door(name, poly, None, pv))
            ax = Vector((0, 1, 0)); c = P3(ah, sx * (x0 + x1) / 2, bot(ah, sx * (x0 + x1) / 2)) - pv
            from mathutils import Matrix
            if (Matrix.Rotation(math.radians(20), 3, ax) @ c).z > c.z: ax = -ax
            PARTS[name] = dict(pivot=pv.copy(), axis=ax, range=(0.0, 92.0 if which == 'o' else 95.0), note='створка основной стойки (%s): продольная петля, плюс - свободная кромка вниз' % ('наружная, большая' if which == 'o' else 'внутренняя'))
    return out


def plane(stage=9):
    """Этапы: 1 - обшивка; 2 - органы управления; 3 - воздухозаборники, выхлоп, кабина; 4 - отсеки, ниши и створки шасси, стойки."""
    PARTS.clear(); STATIONS.clear()
    skin = skin_shell(); bvh_ready(skin); out = [skin]
    if stage >= 2:
        out.append(tail_part())
        for sx in (1, -1):
            for tag in ('split', 'elev_o', 'elev_m', 'elev_i'): out += ctrl_surface(tag, sx)
    if stage >= 3:
        out += [glass(), frames(), seats()]
    if stage >= 4:
        out += [bay_inner(), bay_door(1, 'i'), bay_door(1, 'o'), bay_door(-1, 'i'), bay_door(-1, 'o')] + doors()
        import b2_gear as gr; out += gr.gear_nose() + gr.gear_main(1) + gr.gear_main(-1)
    # вырезы - после всего, что ложится лучами на обшивку
    if stage >= 2:
        for c_ in tail_cut(): cut(skin, c_)
        for sx in (1, -1):
            for tag in ('split', 'elev_o', 'elev_m', 'elev_i'):
                for c_ in ctrl_cut(tag, sx): cut(skin, c_)
    if stage >= 3:
        cut(skin, cock_cavity())
        for w in window_cuts(): cut(skin, w)
        for sx in (1, -1): cut(skin, inlet_cut(sx)); cut(skin, trough_cut(sx)); cut(skin, nozzle_cut(sx))
    if stage >= 4:
        for sx in (1, -1): cut(skin, bay_cut(sx))
        gear_cuts(skin)
    return out
