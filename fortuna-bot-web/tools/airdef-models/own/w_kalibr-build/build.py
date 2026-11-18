# build.py — крылатая ракета 3М14 «Калибр» (наземная, для «Искандера-К»), своя модель по фото Mark (Искандер-К/фото 02-06: 3М-14Э и 3М-54Э на выставке).
# Заменяет чужую w_kalibr (тот же ключ). Строим 3М14: без отделяемой ступени 3М54 и без стартового ускорителя (в игре летит).
# Размеры: длина 6,20 м, Ø 0,533 м (задание главного чата). Остальное - пропорции фото 03, 05, 06: тупой серый нос ~1,2 Ø, крылья в середине-сзади
#   (прямые, слегка стреловидные, из щелей на верхних боках), хвостовой отсек с 4 рулями «+» (фото 03: верх, низ, бока), пары чёрных колец разметки.
# В игре летит: крылья, рули и воздухозаборник РАСКРЫТЫ - так и в файле (походное сложенное положение и оси - в ПАСПОРТ).
# Оси: метры, нос +Y (glTF −Z), верх +Z, X - вправо; начало - на оси посередине длины.
# Узлы: body (корпус, хвостовой отсек, щели крыльев, лючки), radome (серый нос), wing_l / wing_r (поворот вокруг вертикали у корня: 0° раскрыто, 90° - сложено назад вдоль корпуса),
#   fin_1…fin_4 (руль: 1 - верх, 2 - справа, 3 - низ, 4 - слева; поворот рулём ±20° вокруг радиальной оси; складывание - в ПАСПОРТ), intake (воздухозаборник снизу, шарнир у заднего края).
import os, math
import bpy, bmesh
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Искандер-К/3М14'
exec(compile(open(os.path.join(HERE, 'k14kit.py'), encoding='utf-8').read(), os.path.join(HERE, 'k14kit.py'), 'exec'))

L = 6.20; R = 0.2665
def A(a): return a                                      # расстояние от носа (совместимость с окраской AIM-260)
def YA(a): return L / 2 - a
ANG = [90.0, 0.0, 270.0, 180.0]                         # рули «+»: верх, справа, низ, слева
def D(phi): r = math.radians(phi); return V(math.cos(r), 0, math.sin(r))
def T(phi): r = math.radians(phi); return V(-math.sin(r), 0, math.cos(r))
def P(a, s, phi, t=0.0): return D(phi) * s + T(phi) * t + V(0, YA(a), 0)
RAD_A = 0.64                                            # стык носа (фото 05, 06: ~1,2 Ø)
BODY_END = 6.08                                         # торец корпуса (дальше - тёмное кольцо и крышка сопла)
WING = dict(le=3.55, c0=0.34, c1=0.25, span=1.30, sweep=0.10, z=0.085, t=0.024)   # корень передней кромки от носа, хорды, вылет консоли, снос законцовки назад
FIN = dict(rle=5.80, te=6.07, tle=5.98, s0=R + 0.001, s1=R + 0.30, t=0.018)
FIN['piv'] = FIN['rle'] + 0.45 * (FIN['te'] - FIN['rle'])
LUGS = [2.3, 4.2]                                       # места захвата руками (окраска)
JOINTS = [RAD_A, 1.18, 2.78, 3.50, 4.45, 5.62, 5.80]
BANDS = [(1.08, 1.11), (1.16, 1.19), (2.68, 2.71), (2.76, 2.79), (5.20, 5.23), (5.28, 5.31)]   # пары чёрных колец (фото 03, 05, 06)
INTAKE = dict(a0=4.70, a1=5.30, w=0.20, h=0.11)


def scene():
    sc = bpy.data.scenes.get('K14') or bpy.data.scenes.new('K14')
    if bpy.context.window: bpy.context.window.scene = sc
    col = bpy.data.collections.get('K14') or bpy.data.collections.new('K14')
    if col.name not in sc.collection.children: sc.collection.children.link(col)
    for o in list(col.objects): bpy.data.objects.remove(o, do_unlink=True)
    return sc, col


sc, COL = scene(); make_mats()
for o in list(bpy.data.objects):
    if o.name in ('Cube', 'Light', 'Camera'): bpy.data.objects.remove(o, do_unlink=True)
NOSE = V(0, L / 2, 0); AFT = V(0, -1, 0)


def mk(b, pivot=(0, 0, 0), sharp=32):
    pv = Vector(pivot); bmesh.ops.translate(b.bm, verts=b.bm.verts, vec=-pv)
    o = b.finish(COL, sharp=sharp); o.location = pv; return o


def radome():
    """тупой нос (фото 05, 06): почти полусфера, переходящая в цилиндр - эллипсоид вращения с полуосями RAD_A × R"""
    b = B('radome'); pts = []
    for i in range(0, 25):
        t = (i / 24) ** 1.6; a = RAD_A * t
        r = R * math.sqrt(max(0.0, 1 - ((RAD_A - a) / RAD_A) ** 2)) ** 0.92 if i else 0.0006
        pts.append((a, max(min(r, R - 0.0015), 0.0006)))
    pts.append((RAD_A + 0.004, R - 0.0015))
    lathe(b, NOSE, AFT, pts, M_RADOME, n=56, cap0=True, cap1=True)
    return mk(b, sharp=60)


def body():
    b = B('body')
    p = [(RAD_A + 0.002, 0.0006, M_BODY), (RAD_A + 0.002, R - 0.0015, M_BODY), (RAD_A + 0.004, R, M_BODY)]
    for a in (1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5):
        p.append((a, R, M_BODY))
    p += [(BODY_END - 0.020, R, M_BODY), (BODY_END - 0.010, R, M_BODY), (BODY_END, R - 0.004, M_BODY), (BODY_END + 0.004, R - 0.010, M_STEEL),
          (BODY_END + 0.010, R - 0.010, M_DARK), (L - 0.04, R - 0.012, M_DARK), (L - 0.02, R - 0.035, M_DARK), (L, R - 0.045, M_NOZZLE),
          (L, 0.12, M_NOZZLE), (L - 0.10, 0.10, M_NOZZLE), (L - 0.10, 0.0006, M_NOZZLE)]   # тёмное хвостовое кольцо и сопло (фото 03, 06)
    lathe(b, NOSE, AFT, [(a, r) for a, r, _ in p], [m for _, _, m in p[:-1]], n=64, cap0=True, cap1=True)
    # щели крыльев (на верхних боках) - тёмные утопленные пазы
    for s in (-1, 1):
        x = s * math.sqrt(R * R - WING['z'] ** 2)
        b.box((x * 0.995, YA(WING['le'] + 0.5), WING['z']), (0.012, 1.05, 0.03), M_DARK)
    # опоры рулей и обтекатели механизма складывания (фото 03: кольцо с механизмами у хвоста)
    for phi in ANG:
        lathe(b, P(FIN['piv'], R - 0.004, phi), D(phi), [(0.0, 0.030), (0.006, 0.030), (0.008, 0.024)], M_BODY, n=16, cap0=False, cap1=True)
        b.loft([[P(a, R - 0.004, phi, tt) for a, tt in ((5.62, -0.03), (5.62, 0.03), (5.78, 0.03), (5.78, -0.03))],
                [P(a, R + 0.018, phi, tt) for a, tt in ((5.65, -0.025), (5.65, 0.025), (5.78, 0.025), (5.78, -0.025))]], M_BODY)
    # продольный обтекатель кабелей снизу-сбоку (фото 06: полоса с прорезями от крыла назад)
    def ring(a, k):
        w = 0.035; z0 = -(R - 0.008); z1 = -(R + 0.016 * k); c = 0.005 * k + 0.001
        return [V(0.17 - w, YA(a), z0 * 0.78), V(0.17 + w, YA(a), z0 * 0.70), V(0.17 + w, YA(a), z1 * 0.72 + c), V(0.17 - w, YA(a), z1 * 0.80)]
    b.loft([ring(3.95, 0.1), ring(4.00, 1.0), ring(5.55, 1.0), ring(5.60, 0.1)], M_BODY)
    for s in (-1, 1):                                                                     # такелажные гнёзда (закрыты пробками)
        for a in (2.0, 4.6):
            lathe(b, V(s * (R - 0.003) * 0.7071, YA(a), (R - 0.003) * 0.7071), V(s, 0, 1), [(0, 0.022), (0.004, 0.022), (0.005, 0.018)], M_STEEL, n=12, cap0=False, cap1=True)
    return mk(b, sharp=40)


def inset(poly, d):
    n = len(poly); out = []
    cx = sum(p[0] for p in poly) / n; cy = sum(p[1] for p in poly) / n
    for i in range(n):
        p0, p1, p2 = Vector(poly[i - 1]), Vector(poly[i]), Vector(poly[(i + 1) % n])
        e1 = (p1 - p0).normalized(); e2 = (p2 - p1).normalized()
        n1 = Vector((-e1.y, e1.x)); n2 = Vector((-e2.y, e2.x)); bis = (n1 + n2)
        if bis.length < 1e-6: bis = n1
        bis.normalize(); k = d / max(bis.dot(n1), 0.3)
        q = p1 + bis * k
        if (q - Vector((cx, cy))).length > (p1 - Vector((cx, cy))).length: q = p1 - bis * k
        out.append((q.x, q.y))
    return out


def wing(s):
    """консоль крыла: из щели на боку, прямая с небольшим сносом назад, закруглённая законцовка; начало - на оси складывания у корня передней кромки"""
    W = WING; b = B('wing_r' if s > 0 else 'wing_l'); x0 = math.sqrt(R * R - W['z'] ** 2) - 0.01
    poly = [(W['le'], x0), (W['le'] + W['sweep'], x0 + W['span']), (W['le'] + W['sweep'] + W['c1'], x0 + W['span']), (W['le'] + W['c0'], x0)]   # (a, x)
    e = inset(poly, 0.008); e = [(a, x0) if px == x0 else (a, x) for (a, x), (pa, px) in zip(e, poly)]
    ring = lambda pl, dz: [V(s * x, YA(a), W['z'] + dz) for a, x in pl]
    b.loft([ring(e, -W['t'] / 2), ring(poly, 0.0), ring(e, W['t'] / 2)], M_FIN, cap0=True, cap1=True)
    b.cyl(V(s * (x0 - 0.04), YA(W['le'] + 0.05), W['z']), V(s * (x0 + 0.01), YA(W['le'] + 0.05), W['z']), 0.010, 0.010, M_STEEL, n=8)   # ось складывания
    return mk(b, pivot=(s * x0, YA(W['le'] + 0.05), W['z']), sharp=40)


def fin(k, phi):
    F = FIN; b = B(f'fin_{k}')
    poly = [(F['rle'], F['s0']), (F['tle'], F['s1']), (F['te'], F['s1']), (F['te'], F['s0'])]
    def ring(pl, t): return [P(a, s, phi, t) for a, s in pl]
    th = F['t']; e = inset(poly, 0.006)
    e = [(a, F['s0']) if ps == F['s0'] else (a, s) for (a, s), (pa, ps) in zip(e, poly)]
    b.loft([ring(e, -th / 2), ring(poly, 0.0), ring(e, th / 2)], M_FIN, cap0=True, cap1=True)
    b.cyl(P(F['piv'], R + 0.0006, phi), P(F['piv'], F['s0'] + 0.006, phi), 0.008, 0.008, M_STEEL, n=10)
    return mk(b, pivot=P(F['piv'], R + 0.0015, phi), sharp=40)


def intake():
    """воздухозаборник снизу у хвоста (в полёте выдвинут): плавный совок с прямоугольным входом спереди; начало - на шарнире у заднего края"""
    I = INTAKE; b = B('intake'); w = I['w'] / 2
    def sec(a, h, ww):
        z0 = -(R - 0.02); z1 = -(R + h)
        return [V(-ww, YA(a), z0), V(ww, YA(a), z0), V(ww, YA(a), z1 + 0.02), V(ww - 0.02, YA(a), z1), V(-ww + 0.02, YA(a), z1), V(-ww, YA(a), z1 + 0.02)]
    rings = [sec(I['a0'], I['h'], w), sec(I['a0'] + 0.05, I['h'], w), sec(I['a0'] + 0.30, I['h'] * 0.85, w * 0.95), sec(I['a1'] - 0.05, I['h'] * 0.30, w * 0.80), sec(I['a1'], 0.01, w * 0.75)]
    b.loft(rings, M_BODY, cap0=False, cap1=True)
    inner = [V(p.x * 0.80, p.y - 0.002, (p.z + (R - 0.02)) * 0.80 - (R - 0.02)) for p in rings[0]]
    b.loft([rings[0], inner], M_BODY, cap0=False, cap1=False)                            # кромка входа
    b.loft([inner, [V(p.x, p.y - 0.12, p.z) for p in inner]], M_NOZZLE, cap0=False, cap1=True)   # тёмный канал
    return mk(b, pivot=(0, YA(I['a1']), -(R - 0.01)), sharp=40)


RADO = radome(); BODY = body(); WINGS = [wing(1), wing(-1)]; FINS = [fin(i + 1, a) for i, a in enumerate(ANG)]; INT = intake()
bpy.context.view_layer.update()
MOVE = {o.name: dict(axis=D(a), lim=(-20.0, 20.0)) for o, a in zip(FINS, ANG)}
BASEM = {o.name: o.matrix_world.copy() for o in COL.objects if o.type == 'MESH'}


def pose(k=0.0, alt=False, fold=0.0):
    """k - отклонение рулей, доля от 20°; fold - доля складывания крыльев (0 - раскрыты, 1 - вдоль корпуса назад)"""
    for i, (n, W) in enumerate(MOVE.items()):
        o = bpy.data.objects[n]; p = BASEM[n].translation.copy(); ang = 20.0 * k * (-1 if (alt and i % 2) else 1)
        o.matrix_world = Matrix.Translation(p) @ Matrix.Rotation(math.radians(ang), 4, W['axis']) @ Matrix.Translation(-p) @ BASEM[n]
    for o, s in zip(WINGS, (1, -1)):
        p = BASEM[o.name].translation.copy()
        o.matrix_world = Matrix.Translation(p) @ Matrix.Rotation(math.radians(-90 * fold * s), 4, V(0, 0, 1)) @ Matrix.Translation(-p) @ BASEM[o.name]
    bpy.context.view_layer.update()


TRIS = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in COL.objects if o.type == 'MESH'}
print('K14 build: треугольников', sum(TRIS.values()), TRIS)
