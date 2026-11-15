# build.py - ракета Х-59МК2 (гранёный вариант МАКС-2015), своя модель по картинкам Mark (Свои/Х-59МК2/референсы 02-07) и найденным фото 10-13, 2026-11-15.
# Чертежа с линейкой нет: длина 5,70 м - как у прежней модели в игре (5,69); пропорции - с фото: витринная модель 05 (вид сверху: ось крыла 0,49 длины,
# размах крыла 0,5 длины), профиль 11, нос 10, хвост 12, 13. 01 и 14, 15 - ранний круглый вариант МК2 с гондолой (как Х-59М), для формы не берутся.
# Оси: метры, нос +Y (glTF −Z), верх +Z, начало - на оси посередине длины. a - расстояние от носа.
# Узлы: body (гранёный корпус: нос «клюв» с козырьком и окном ГСН снизу, ступенька за крылом, хвост со скруглённым квадратом, сопло с центральным телом,
#   бугели, ось крыла с обтекателем), wing (одно крыло на оси сверху; в файле - СЛОЖЕНО вдоль корпуса, раскрытие - поворот на −90° вокруг вертикали через WING['piv']),
#   fin1…fin4 (рули крестом «×», цельноповоротные ±15° вокруг радиальной оси). Окно ГСН - материал X59K_window на гранях корпуса.
# Запуск: Blender -b --factory-startup --python build.py   (MK2_POSE="kf,kw": рули (доли от 15°), крыло 0 сложено … 1 раскрыто)
import os, math
import bpy, bmesh
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Х-59МК2'
exec(compile(open(os.path.join(HERE, 'mk2kit.py'), encoding='utf-8').read(), os.path.join(HERE, 'mk2kit.py'), 'exec'))

L = 5.70
def YA(a): return L / 2 - a
# сечение корпуса: полуширина, верх, низ (z), показатель суперэллипса (4,5 - плоские борта и днище со скруглёнными рёбрами)
BODY = dict(w=0.215, top=0.185, bot=-0.195, n=6.0)
AFT = dict(a0=4.60, a1=4.66, w=0.205, top=0.160)                  # ступенька вниз - за концом сложенного крыла (Mark 2026-11-15: крыло лежит на спине плотно; на фото 11, 13 она у оси)
NOSE = dict(zl=-0.065, zl1=-0.010, an_u=0.30, an_l=0.42, an_p=0.70, pp=2.0, ov=0.045, a_ov=1.05)   # «клюв»: козырёк на высоте zl, спина ровная до лба 0,30 м (фото 10, 11), низ 0,42 м, в плане - «U» на 0,70 м
TAIL = dict(a0=4.70, a1=5.62, w=0.152, top=0.137, bot=-0.167, n=3.6)  # хвост: к скруглённому квадрату вокруг сопла (фото 12, 13)
NOZ = dict(a_face=5.62, a_end=5.70, r_out=0.128, r_in=0.112, a_duct=5.30, cone=(5.38, 5.64, 0.062))
WING = dict(a=2.79, span=2.84, c_root=0.30, c_tip=0.22, t=0.030, z_gap=0.0005)   # ось крыла 0,49 длины; размах 0,5 длины (фото 05)
FIN = dict(rle=4.86, rte=5.42, tle=5.22, tte=5.48, s=0.36, t0=0.028, t1=0.010)   # рули: корень a 4,92…5,40, законцовка 5,20…5,46, вылет 0,30 м от поверхности
LUGS = [1.08, 4.56]                                                  # бугели - вне сложенного крыла (1,37…4,21)
WIN = dict(z_top=-0.024, z_bot=-0.085, x_top=0.080, x_bot=0.062, ch=0.018)   # окно ГСН (вид спереди, от уровня козырька): трапеция со срезанными углами, фото 03, 10                   # окно ГСН снизу под козырьком (фото 03, 10)
ANG = [45.0, 135.0, 225.0, 315.0]


def V(x, y, z): return Vector((x, y, z))
def ss(t0, t1, t):
    t = min(max((t - t0) / (t1 - t0), 0.0), 1.0); return t * t * (3 - 2 * t)
def ell(a, an, p=2.0): return max(0.0, 1.0 - (1.0 - min(a / an, 1.0)) ** p) ** (1.0 / p)


def prof(a):
    """параметры сечения на расстоянии a от носа: w_u, w_l (полуширина верха и низа), top, bot, zl (уровень козырька), n"""
    w, top, bot, n = BODY['w'], BODY['top'], BODY['bot'], BODY['n']
    k = ss(AFT['a0'], AFT['a1'], a); w += (AFT['w'] - w) * k; top += (AFT['top'] - top) * k
    k = ss(TAIL['a0'], TAIL['a1'], a); w += (TAIL['w'] - w) * k; top += (TAIL['top'] - top) * k; bot += (TAIL['bot'] - bot) * k; n += (TAIL['n'] - n) * k
    N = NOSE; zl = N['zl'] + (N['zl1'] - N['zl']) * ss(0.0, N['a_ov'], a)
    if a > N['a_ov']: zl = N['zl1'] * (1 - ss(N['a_ov'], 1.6, a))
    top = zl + (top - zl) * ell(a, N['an_u']); bot = zl + (bot - zl) * ell(a, N['an_l'])
    w_u = w * ell(a, N['an_p'], N['pp']); ov = N['ov'] * (1 - ss(0.05, N['a_ov'], a)) * min(1.0, a / 0.02)
    return w_u, w_u - ov * w_u / w, top, bot, zl, n                      # низ уже верха на долю козырька: у кончика сходятся вместе (без «киля»)


NU = 36                                                              # точек на верхнюю и нижнюю половину сечения


def ring(a):
    w_u, w_l, top, bot, zl, n = prof(a); e = 2.0 / n; y = YA(a); pts = []
    for k in range(NU + 1):                                          # верх: от правого края козырька через спину к левому
        t = math.pi * k / NU; c, s = math.cos(t), math.sin(t)
        pts.append(V(w_u * math.copysign(abs(c) ** e, c), y, zl + (top - zl) * abs(s) ** e))
    for k in range(NU + 1):                                          # низ: от левого края (под козырьком) через днище к правому
        t = math.pi + math.pi * k / NU; c, s = math.cos(t), math.sin(t)
        zo = 0.0015 * min(1.0, (w_u - w_l) / 0.004)                  # ступенька под козырьком; где козырька нет - точки совпадают и сливаются
        pts.append(V(w_l * math.copysign(abs(c) ** e, c), y, zl - zo - (zl - zo - bot) * abs(s) ** e))
    return pts


def surf(a, phi):
    """точка поверхности корпуса на луче из оси сечения под углом φ (от +X к +Z) - для корней рулей"""
    w_u, w_l, top, bot, zl, n = prof(a); d = (math.cos(math.radians(phi)), math.sin(math.radians(phi)))
    cz = 0.0
    def f(r):
        x, z = d[0] * r, cz + d[1] * r
        if z >= zl: return (abs(x) / w_u) ** n + (abs(z - zl) / (top - zl)) ** n - 1
        return (abs(x) / w_l) ** n + (abs(zl - z) / (zl - bot)) ** n - 1
    lo, hi = 0.0, 0.5
    for _ in range(40):
        m = (lo + hi) / 2
        if f(m) > 0: hi = m
        else: lo = m
    return lo


def scene():
    sc = bpy.data.scenes.get('MK2') or bpy.data.scenes.new('MK2')
    if bpy.context.window: bpy.context.window.scene = sc
    col = bpy.data.collections.get('MK2') or bpy.data.collections.new('MK2')
    if col.name not in sc.collection.children: sc.collection.children.link(col)
    for o in list(col.objects): bpy.data.objects.remove(o, do_unlink=True)
    return sc, col


sc, COL = scene(); make_mats()
for o in list(bpy.data.objects):
    if o.name in ('Cube', 'Light', 'Camera'): bpy.data.objects.remove(o, do_unlink=True)


def mk(b, pivot=(0, 0, 0), sharp=32):
    pv = Vector(pivot); bmesh.ops.translate(b.bm, verts=b.bm.verts, vec=-pv)
    o = b.finish(COL, sharp=sharp); o.location = pv; return o


def body():
    b = B('body'); bm = b.bm
    st = [0.0025, 0.006, 0.012, 0.02, 0.03, 0.042, 0.056, 0.072, 0.09, 0.105, 0.125, 0.15, 0.18, 0.22, 0.27, 0.33, 0.40, 0.48, 0.57, 0.66, 0.76, 0.86, 0.95, 1.05]
    a = 1.05
    while a < AFT['a0'] - 0.1: a += 0.15; st.append(round(a, 3))
    st += [AFT['a0'] - 0.02, AFT['a0'], AFT['a0'] + 0.015, (AFT['a0'] + AFT['a1']) / 2, AFT['a1'] - 0.015, AFT['a1'], AFT['a1'] + 0.02]
    a = AFT['a1'] + 0.02
    while a < TAIL['a0']: a += 0.15; st.append(round(a, 3))
    a = st[-1]
    while a < TAIL['a1'] - 0.06: a += 0.06; st.append(round(a, 3))
    st += [TAIL['a1'] - 0.03, TAIL['a1'] - 0.012, TAIL['a1']]
    st = sorted(set(x for x in st if x <= TAIL['a1']))
    rings = [ring(x) for x in st]
    vs = [[bm.verts.new(p) for p in r] for r in rings]; n = len(vs[0])
    for i in range(len(vs) - 1):
        for j in range(n):
            f = bm.faces.new((vs[i][j], vs[i][(j + 1) % n], vs[i + 1][(j + 1) % n], vs[i + 1][j]))
            p = (rings[i][j] + rings[i + 1][(j + 1) % n]) / 2; am = (st[i] + st[i + 1]) / 2
            f.material_index = M_BODY
    tip = bm.verts.new(V(0, YA(0.0), NOSE['zl']));
    for j in range(n): bm.faces.new((tip, vs[0][(j + 1) % n], vs[0][j])).material_index = M_BODY
    # задний торец со скруглением к соплу: кольца от края хвоста к срезу сопла (центр сопла - середина хвостового сечения)
    w_u, w_l, top, bot, zl, nn = prof(TAIL['a1']); cz = (top + bot) / 2
    def face_ring(k_in, dy):
        out = []
        for p in rings[-1]:
            d = V(p.x, 0, p.z - cz); r_o = d.length; u = d / max(r_o, 1e-6)
            r = r_o + (NOZ['r_out'] - r_o) * k_in; out.append(V(u.x * r, YA(TAIL['a1']) - dy, cz + u.z * r))
        return out
    prev = vs[-1]
    for k_in, dy in ((0.12, 0.006), (0.35, 0.010), (0.70, 0.012), (1.0, 0.012)):
        cur = [bm.verts.new(p) for p in face_ring(k_in, dy)]
        for j in range(n): bm.faces.new((prev[j], prev[(j + 1) % n], cur[(j + 1) % n], cur[j])).material_index = M_BODY
        prev = cur
    # сопло: обечайка (выступает до конца ракеты), тёмный канал, центральное тело
    o = V(0, YA(TAIL['a1']) - 0.012, cz); ax = V(0, -1, 0); nl = NOZ['a_end'] - TAIL['a1'] + 0.012
    lathe(b, o, ax, [(0.0, NOZ['r_out']), (nl - 0.012, NOZ['r_out']), (nl, NOZ['r_out'] - 0.006), (nl, NOZ['r_in'] + 0.004), (nl - 0.008, NOZ['r_in'])], M_HEAT, n=48, cap0=False, cap1=False)
    lathe(b, o + ax * (nl - 0.008), ax, [(0.0, NOZ['r_in']), (-(nl - 0.008) - (TAIL['a1'] - NOZ['a_duct']), NOZ['r_in'] * 0.96)], M_DARK, n=48, cap0=False, cap1=True)
    c0, c1, rc = NOZ['cone']
    lathe(b, V(0, YA(c0), cz), ax, [(0.0, rc * 0.85), (0.05, rc), (0.12, rc * 0.8), (c1 - c0 - 0.02, 0.012), (c1 - c0, 0.001)], M_CONE, n=32, cap0=True, cap1=False)
    for k in range(4):                                               # стойки центрального тела
        th = math.radians(45 + 90 * k); d = V(math.cos(th), 0, math.sin(th))
        b.bar(V(0, YA(c0 + 0.06), cz) + d * (rc * 0.9), V(0, YA(c0 + 0.06), cz) + d * (NOZ['r_in'] * 0.97), 0.008, 0.05, M_DARK, up=(0, 1, 0))
    # ось крыла: низкий обтекатель на спине и шайба оси
    a, top = WING['a'], prof(WING['a'])[2]
    zg = WING['z_gap']                                                   # крыло лежит на спине вплотную (зазор 3 мм под осью)
    lathe(b, V(0, YA(a), top - 0.01), V(0, 0, 1), [(0.0, 0.085), (0.006, 0.085), (0.009, 0.080), (0.010 + zg - 0.0015, 0.074), (0.010 + zg - 0.0015, 0.0005)], M_BODY, n=40, cap0=False, cap1=True)
    lathe(b, V(0, YA(a), top - 0.002), V(0, 0, 1), [(0.0, 0.045), (0.002 + zg, 0.045)], M_STEEL, n=24, cap0=False, cap1=True)
    # бугели подвески (выше сложенного крыла)
    for la in LUGS:
        tp = prof(la)[2]
        for dy in (-0.04, 0.04):
            b.box((0, YA(la) + dy, tp + 0.028), (0.026, 0.022, 0.066), M_STEEL)
        b.box((0, YA(la), tp + 0.006), (0.07, 0.13, 0.016), M_STEEL)
    return mk(b, sharp=40)


def zlow(a, x):
    """высота нижней поверхности корпуса под козырьком в точке (a, x)"""
    w_u, w_l, top, bot, zl, n = prof(a); q = min(abs(x) / w_l, 0.999999)
    return zl - 0.0015 - (zl - 0.0015 - bot) * (1 - q ** n) ** (1 / n)


def window():
    """окно ГСН: пластина по нижней лобовой грани «клюва» (вид спереди - трапеция со срезанными углами), на 1,5 мм над поверхностью"""
    W = WIN; b = B('window'); zl0 = prof(0.003)[4]
    def half(z):
        t = (z - (zl0 + W['z_top'])) / (W['z_bot'] - W['z_top']); x = W['x_top'] + (W['x_bot'] - W['x_top']) * t
        cut = W['ch'] * max(0.0, 1 - min(t, 1 - t) * (W['z_top'] - W['z_bot']) / W['ch'])  # срез углов
        return x - cut
    def pt(x, z):
        lo, hi = 0.002, 0.45
        for _ in range(50):
            m = (lo + hi) / 2
            if zlow(m, x) > z: lo = m
            else: hi = m
        a = (lo + hi) / 2; e = 0.003
        n_ = Vector((0, YA(a - e) - YA(a + e), 0)).cross(Vector((0.01, 0, zlow(a, x + 0.005) - zlow(a, x - 0.005)))) if False else None
        dz = (zlow(a + e, x) - zlow(a - e, x)) / (2 * e); nrm = Vector((0, 1.0, dz)).normalized() if dz < 0 else Vector((0, 1, 0))
        return V(x, YA(a), z) + nrm * 0.0015
    zs = [zl0 + W['z_top'] + (W['z_bot'] - W['z_top']) * i / 14 for i in range(15)]
    rows = [[pt(-half(z) + 2 * half(z) * k / 16, z) for k in range(17)] for z in zs]
    b.loft(rows, M_WINDOW, cap0=False, cap1=False, closed=False)
    return mk(b, sharp=60)


def wing():
    """крыло: прямая трапеция с закруглёнными концами, профиль - чечевица; строится раскрытым, потом поворачивается вдоль корпуса (+90° вокруг Z)"""
    W = WING; b = B('wing'); a, top = W['a'], prof(W['a'])[2]; zc = top + W['z_gap'] + W['t'] / 2; piv = V(0, YA(a), top + W['z_gap'])
    def sec(x):
        k = abs(x) / (W['span'] / 2); c = W['c_root'] + (W['c_tip'] - W['c_root']) * k
        rnd = 1.0 - 0.55 * ss(0.94, 1.0, k)                          # закругление законцовки
        c *= rnd; le = YA(a) + 0.42 * W['c_root'] - (0.42 * W['c_root'] - 0.42 * c) * 0.6; t = W['t'] * (1 - 0.45 * k) * rnd
        pts = []
        for j in range(12):
            u = j / 11; yy = le - c * u; th = t / 2 * (math.sin(math.pi * u ** 0.75)) + 0.0006
            pts.append(V(x, yy, zc + th))
        for j in range(10, 0, -1):
            u = j / 11; yy = le - c * u; th = W['t'] / 2 * rnd * (math.sin(math.pi * u ** 0.75)) * 0.8 + 0.0006   # низ ровный по размаху: сложенное крыло лежит на спине по всей длине
            pts.append(V(x, yy, zc - th))
        return pts
    xs = [-W['span'] / 2 + W['span'] * i / 40 for i in range(41)]
    b.loft([sec(x) for x in xs], M_BODY)
    o = mk(b, pivot=piv, sharp=40)
    me = o.data; R = Matrix.Rotation(math.radians(90.0), 4, 'Z')         # сложено: передняя кромка смотрит в −X, размах вдоль корпуса
    for v in me.vertices: v.co = R @ v.co
    me.update(); return o


def fin_frame(phi):
    d = V(math.cos(math.radians(phi)), 0, math.sin(math.radians(phi))); tv = V(-math.sin(math.radians(phi)), 0, math.cos(math.radians(phi)))
    def P(a, s, t=0.0): return V(0, YA(a), 0.0) + d * s + tv * t
    return d, tv, P


BOOT_R = 0.020
def boot_prof():
    """профиль корневого обтекателя руля: (a от носа, радиус); полный радиус - на всей хорде корня, сходит на нет за задней кромкой"""
    F = FIN; r = BOOT_R; a0 = F['rle'] - 0.03
    return [(a0, 0.002), (a0 + 0.03, r * 0.8), (a0 + 0.08, r)] + [(a0 + 0.08 + (F['rte'] + 0.01 - a0 - 0.08) * i / 16, r) for i in range(1, 17)] + [(F['rte'] + 0.05, r * 0.5), (F['rte'] + 0.08, 0.002)]


def rb(a):
    pr = boot_prof()
    if a <= pr[0][0]: return pr[0][1]
    for (a0, r0), (a1, r1) in zip(pr, pr[1:]):
        if a <= a1: return r0 + (r1 - r0) * (a - a0) / (a1 - a0)
    return pr[-1][1]


def boots():
    """корневые обтекатели рулей (фото 12, 13: «сапог» вдоль корня) - неподвижная часть корпуса, кольца по поверхности хвоста; руль поворачивается над ним"""
    b = B('boots')
    for phi in ANG:
        d, tv, P = fin_frame(phi); rings = []
        for a_, r_ in boot_prof():
            c_ = P(a_, surf(a_, phi) + 0.006)
            rings.append([c_ + d * (r_ * math.cos(2 * math.pi * j / 16)) + tv * (r_ * math.sin(2 * math.pi * j / 16)) for j in range(16)])
        b.loft(rings, M_BODY)
    return mk(b, sharp=40)


def fin(k, phi):
    """руль: корень лежит на гребне своего обтекателя (утоплен на 6 мм по всей хорде), цельноповоротный вокруг радиальной оси посередине корня"""
    F = FIN; b = B(f'fin{k}'); d, tv, P = fin_frame(phi)
    def ds0(a_): return 0.006 + rb(a_) - 0.006
    def sec(ale, ate, s, th):
        c = ate - ale
        return [P(ale, s), P(ale + c * 0.25, s, th / 2), P(ate - c * 0.25, s, th / 2), P(ate, s, th * 0.1), P(ate, s, -th * 0.1), P(ate - c * 0.25, s, -th / 2), P(ale + c * 0.25, s, -th / 2)]
    def secr(ale, ate, dd, th):
        c = ate - ale
        pts = [(ale, 0.0), (ale + c * 0.25, th / 2), (ate - c * 0.25, th / 2), (ate, th * 0.1), (ate, -th * 0.1), (ate - c * 0.25, -th / 2), (ale + c * 0.25, -th / 2)]
        return [P(a_, surf(a_, phi) + ds0(a_) + dd, t_) for a_, t_ in pts]
    r0 = max(surf(F['rle'], phi), surf(F['rte'], phi)) - 0.006
    r1 = r0 + F['s']
    b.loft([secr(F['rle'], F['rte'], 0.0, F['t0']), secr(F['rle'] + 0.01, F['rte'], 0.03, F['t0'] * 0.95), sec(F['tle'], F['tte'], r1, F['t1'])], M_BODY)
    ac = (F['rle'] + F['rte']) / 2
    piv = P(ac, surf(ac, phi) + 0.006 + rb(ac))
    return mk(b, pivot=piv, sharp=40), d


BODYO = body()
WINDOWO = window()
WINGO = wing()
BOOTSO = boots()
FINS = [fin(i + 1, a) for i, a in enumerate(ANG)]
MOVE = {o.name: dict(axis=d, lim=(-15.0, 15.0), kind='fin') for o, d in FINS}
MOVE['wing'] = dict(axis=V(0, 0, 1), lim=(-90.0, 0.0), kind='wing')
bpy.context.view_layer.update()
BASEM = {n: bpy.data.objects[n].matrix_world.copy() for n in MOVE}


def pose(kf=0.0, kw=0.0):
    """kf: рули, доли от 15° (1 и 3 против 2 и 4, как при крене); kw: крыло 0 - сложено (как в файле) … 1 - раскрыто (поворот на −90°)"""
    for n, W in MOVE.items():
        o = bpy.data.objects[n]; p = BASEM[n].translation.copy()
        ang = -90.0 * kw if W['kind'] == 'wing' else 15.0 * kf * (1 if n in ('fin1', 'fin3') else -1)
        o.matrix_world = Matrix.Translation(p) @ Matrix.Rotation(math.radians(ang), 4, W['axis']) @ Matrix.Translation(-p) @ BASEM[n]
    bpy.context.view_layer.update()


_ps = os.environ.get('MK2_POSE')
if _ps: pose(*[float(v) for v in _ps.split(',')])
TRIS = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in COL.objects if o.type == 'MESH')
print('MK2 build: объектов', len(COL.objects), 'треугольников', TRIS, {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in COL.objects if o.type == 'MESH'})
