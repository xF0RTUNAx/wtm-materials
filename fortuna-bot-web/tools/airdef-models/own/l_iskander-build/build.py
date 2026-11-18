# build.py — пусковая 9П78-1 «Искандер-М» (шасси МЗКТ-7930, 8×8) с двумя ракетами 9М723: своя модель по фото Mark (Искандер-М/фото, 01-08).
# Фото: 01 спереди-слева, ракета на стреле вертикально, крышки крыши, опоры; 02 спереди-справа, решётка-ограждение кабины, опоры; 03 стрела ~35°, крышка открыта
#   наружу; 04 сзади-слева, две ракеты подняты ~70°, кольца-бандажи стрелы, хвосты; 05 сверху, пятнистая окраска; 06 сбоку, стрела ~50° (стрела под ракетой);
#   07 строго сбоку, ракета вертикально в корме - ГЛАВНОЕ для размеров; 08 сзади, обе ракеты вертикально, задние стойки с лестницами, рули хвоста крестом.
# Масштаб: длина 13,0 м (бампер - задний торец) - как у прежней модели игры l_iskander (13,02); остальное - пропорции фото 07 (13,0 м = 477 пикс.):
#   колесо Ø 1,53, оси 2,89 / 5,23 / 9,18 / 11,42 м от бампера, крыша отсека 3,4 м (с крышками), низ ракеты в боевом 2,0 м, ракета 7,2 × 0,94 м (L/D 7,2 по фото 07, 08).
# Оси: метры, нос машины +Y (glTF −Z), вверх +Z, земля Z = 0, X = 0 - ось машины, Y = 0 - середина длины (бампер +6,35, задний торец −6,50).
# Подвижные части (имена - для игры; оси и пределы - в ПАСПОРТ; в файле - походное положение, игровой файл - боевое):
#   boom_r / boom_l    - стрелы-ложементы (ракета лежит на них сверху), шарнир у кормы вдоль X: 0° лёжа → 90° вертикально, каждая отдельно;
#   tbm / tbm2         - ракеты 9М723 (дети стрел; tbm - справа, X > 0, как у прежней модели), пуск из центра вдоль оси;
#   cyl_r_body / cyl_r_rod, cyl_l_* - цилиндры подъёма (корпус - на полу, шток - на стреле; наводятся друг на друга);
#   lid_l / lid_r      - крышки крыши ракетного отсека на продольных петлях у наружных кромок бортов, открываются наружу 0…150°;
#   jack_fl/fr/rl/rr   - гидроопоры (выдвигаются вниз 0…0,45 м до грунта); wheel_<ось><l|r> - колёса (вращение вокруг X).
# Запуск: Blender -b --factory-startup --python build.py   (ISK_POSE=combat - боевое положение для показа)
import sys, os, math
import bpy, bmesh
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Искандер-М'
exec(compile(open(os.path.join(HERE, 'iskkit.py'), encoding='utf-8').read(), os.path.join(HERE, 'iskkit.py'), 'exec'))

# ---------------- размеры ----------------
Y_BUMP, Y_REAR = 6.35, -6.50          # бампер, задний торец
HW = 1.50                              # полуширина кузова
AXY = [3.61, 1.27, -2.68, -4.92]       # оси (фото 07)
RW, WW, WX = 0.765, 0.52, 1.22         # колесо: радиус, ширина, центр по X
Y_CAB0, Y_CAB1 = 3.20, 6.22            # кабина: зад, перёд (низ лобового листа)
Y_EQ = 2.30                            # стык приборного отсека и ракетного
Z_BOT, Z_TOP = 1.60, 3.15              # низ и верх бортов отсека (крышки - выше)
Z_FLOOR = 1.28                         # пол ракетного отсека
MS = dict(L=7.20, R=0.47)              # ракета 9М723
X_M = 0.58                             # оси ракет ±X (прежняя модель: ±0,58)
PIVY, PIVZ = -6.32, 1.55               # шарнир стрел - у заднего торца (фото 07: поднятая стрела у кормы, ракета за ней, за задним торцом)
AX_Z = 2.30                            # ось лежащей ракеты (на 0,75 м выше шарнира: в боевом ось ракеты в 0,75 м за шарниром)
Y_TAIL = -5.83                         # торец лежащей ракеты (нос - Y_TAIL + L); в боевом низ ракеты на 2,04 м (фото 07)
RAIL_DX, CYL_X = 0.22, 0.15            # рельсы стрелы ±0,27 от оси ракеты; цилиндры - между ракетами на ±0,15
CYL_BASE = (-5.32, 1.38)               # опора корпуса цилиндра (Y, Z)
CYL_EYE = 3.00                         # проушина штока - на стреле, в 3,0 м от шарнира
JACKS = {'fr': (HW - 0.16, 2.44), 'fl': (-(HW - 0.16), 2.44), 'rr': (HW - 0.16, -3.80), 'rl': (-(HW - 0.16), -3.80)}   # f/r - передняя/задняя пара, l/r - борт (X > 0 - правый)
JACK_TRAVEL = 0.45
VAR = os.environ.get('ISK_VAR', 'M')                  # M - «Искандер-М» (ракеты 9М723), K - «Искандер-К» (два контейнера 3М14 на тех же стрелах)
TPK = dict(L=7.35, R=0.355)                           # контейнер 3М14 (Искандер-К, фото К-01)
LID_OPEN = 205.0                       # крышки в боевом: наружу и вниз на 25° (фото 04, 03)

PIV = {}


def scene():
    sc = bpy.data.scenes.get('ISK') or bpy.data.scenes.new('ISK')
    if bpy.context.window: bpy.context.window.scene = sc
    col = bpy.data.collections.get('ISK') or bpy.data.collections.new('ISK')
    if col.name not in sc.collection.children: sc.collection.children.link(col)
    for o in list(col.objects): bpy.data.objects.remove(o, do_unlink=True)
    return sc, col


sc, COL = scene(); make_mats()
for o in list(bpy.data.objects):
    if o.name in ('Cube', 'Light', 'Camera'): bpy.data.objects.remove(o, do_unlink=True)


def mk(b, pivot=(0, 0, 0), parent=None, sharp=32):
    pv = Vector(pivot)
    bmesh.ops.translate(b.bm, verts=b.bm.verts, vec=-pv)
    o = b.finish(COL, sharp=sharp)
    o.location = pv - (PIV[parent.name] if parent else Vector())
    if parent: o.parent = parent
    PIV[o.name] = pv.copy()
    return o


def inset(poly, d):
    """сдвиг многоугольника [(a, b)] внутрь на d (по биссектрисам)"""
    n = len(poly); out = []
    cx = sum(p[0] for p in poly) / n; cy = sum(p[1] for p in poly) / n
    for i in range(n):
        p0, p1, p2 = Vector(poly[i - 1]), Vector(poly[i]), Vector(poly[(i + 1) % n])
        e1 = (p1 - p0).normalized(); e2 = (p2 - p1).normalized()
        n1 = Vector((-e1.y, e1.x)); n2 = Vector((-e2.y, e2.x)); bis = n1 + n2
        if bis.length < 1e-6: bis = n1
        bis.normalize(); k = d / max(bis.dot(n1), 0.3); q = p1 + bis * k
        if (q - Vector((cx, cy))).length > (p1 - Vector((cx, cy))).length: q = p1 - bis * k
        out.append((q.x, q.y))
    return out


def xprism(b, prof, x0, x1, mat, ch=0.0):
    """тело из профиля [(Y, Z)] вдоль X от x0 до x1; ch - фаска боковых кромок"""
    if ch > 0:
        e = inset(prof, ch)
        rings = [[V(x0, y, z) for y, z in e], [V(x0 + ch, y, z) for y, z in prof], [V(x1 - ch, y, z) for y, z in prof], [V(x1, y, z) for y, z in e]]
    else:
        rings = [[V(x0, y, z) for y, z in prof], [V(x1, y, z) for y, z in prof]]
    b.loft(rings, mat)


def yprism(b, prof, y0, y1, mat):
    """тело из профиля [(X, Z)] вдоль Y"""
    b.loft([[V(x, y0, z) for x, z in prof], [V(x, y1, z) for x, z in prof]], mat)


def cbox(b, lo, hi, mat, ch=0.03):
    """брусок с фасками вертикальных и верхних кромок (по X-профилю)"""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    c = min(ch, (y1 - y0) / 3, (z1 - z0) / 3, (x1 - x0) / 3)
    prof = [(y0, z0), (y1, z0), (y1, z1 - c), (y1 - c, z1), (y0 + c, z1), (y0, z1 - c)]
    xprism(b, prof, x0, x1, mat, ch=c)


def hatch(b, x, y0, y1, z0, z1, side, mat=None, hinge=True, handle=True):
    """лючок на борту: рамка-кант 2 см, петли, ручка (side ±1 - наружу +X/−X)"""
    mat = M_BODY if mat is None else mat; t = 0.012
    for k, (ya, za, yb, zb) in enumerate(((y0 + 0.025, z0, y1 - 0.025, z0 + 0.025), (y0 + 0.025, z1 - 0.025, y1 - 0.025, z1), (y0, z0, y0 + 0.025, z1), (y1 - 0.025, z0, y1, z1))):
        tt = t * (1.0 if k < 2 else 1.25)                                                 # стойки рамки чуть толще перекладин - углы без мерцания
        xa, xb = (x, x + side * tt) if side > 0 else (x + side * tt, x)
        b.box(((xa + xb) / 2, (ya + yb) / 2, (za + zb) / 2), (abs(xb - xa), yb - ya, zb - za), mat)
    if hinge:
        for zz in (z0 + 0.12, z1 - 0.12):
            b.cyl(V(x + side * 0.02, y0 + 0.01, zz - 0.04), V(x + side * 0.02, y0 + 0.01, zz + 0.04), 0.014, 0.014, M_STEEL, n=6)
    if handle:
        yh = y1 - 0.09; zc = (z0 + z1) / 2
        b.bar(V(x + side * 0.045, yh, zc - 0.07), V(x + side * 0.045, yh, zc + 0.07), 0.02, 0.02, M_STEEL)
        for zz in (zc - 0.07, zc + 0.07): b.bar(V(x, yh, zz), V(x + side * 0.05, yh, zz), 0.018, 0.018, M_STEEL)


def bolts_ring(b, o, ax, r, n, mat=M_STEEL, h=0.025, rb=0.018):
    o, ax = Vector(o), Vector(ax).normalized(); u = ax.orthogonal().normalized(); w = ax.cross(u)
    for k in range(n):
        a = 2 * math.pi * k / n; d = u * math.cos(a) + w * math.sin(a); p = o + d * r
        b.cyl(p - d * 0.005, p + d * h, rb, rb * 0.9, mat, n=6)


# ---------------- кузов ----------------
def chassis():
    b = B('body_chassis')
    for s in (-1, 1):                                                                  # рама: два лонжерона
        b.box((s * 0.47, -0.05, 1.03), (0.12, 12.6, 0.30), M_DARK)
    for y in (5.6, 3.0, 0.4, -1.4, -3.6, -6.1):                                          # поперечины
        b.box((0, y, 1.03), (0.82, 0.12, 0.22), M_DARK)
    for y in AXY:                                                                         # мосты: балка, картер, ступицы
        b.cyl(V(-WX + 0.20, y, RW), V(WX - 0.20, y, RW), 0.085, 0.085, M_DARK, n=12)
        lathe(b, V(0, y - 0.28, RW), V(0, 1, 0), [(0, 0.10), (0.06, 0.20), (0.30, 0.24), (0.50, 0.18), (0.56, 0.08)], M_DARK, n=14)
        for s in (-1, 1):
            b.box((s * 0.47, y, 0.88), (0.18, 0.95, 0.12), M_DARK)                    # рессора-балансир
            b.cyl(V(s * 0.47, y + 0.40, 0.90), V(s * 0.47, y + 0.40, 0.80), 0.04, 0.04, M_STEEL, n=8)
            b.cyl(V(s * 0.70, y - 0.15, RW + 0.10), V(s * 0.47, y - 0.15, 1.02), 0.045, 0.045, M_STEEL, n=8)   # амортизатор
    for y0, y1 in ((AXY[0], AXY[1]), (AXY[1], AXY[2]), (AXY[2], AXY[3])):             # карданы
        b.cyl(V(0, y0 - 0.28, RW + 0.02), V(0, y1 + 0.28, RW + 0.02), 0.045, 0.045, M_STEEL, n=10)
    cbox(b, (-0.55, 2.0, 0.70), (0.55, 4.9, 1.45), M_DARK, 0.06)                     # двигатель и коробка
    cbox(b, (-0.40, 0.2, 0.68), (0.40, 1.0, 1.05), M_DARK, 0.04)                     # раздаточная коробка
    for s in (-1, 1):                                                                     # бак, ящик АКБ между 2-й и 3-й осью
        prof = []
        for k in range(16):                                                               # бак (фото 01: короб со скруглёнными углами)
            a = 2 * math.pi * k / 16; cx_, cz_ = 0.20 * (1 if math.cos(a) >= 0 else -1), 0.20 * (1 if math.sin(a) >= 0 else -1)
            prof.append((s * 1.15 + cx_ + 0.08 * math.cos(a), 1.18 + cz_ + 0.08 * math.sin(a)))
        b.loft([[V(x, 0.30, z) for x, z in prof], [V(x, -1.05, z) for x, z in prof]], M_BODY)
        for yy in (0.10, -0.85):                                                          # хомуты бака
            b.loft([[V(s * 1.15 + (x - s * 1.15) * 1.04, yy + 0.03, 1.18 + (z - 1.18) * 1.04) for x, z in prof], [V(s * 1.15 + (x - s * 1.15) * 1.04, yy - 0.03, 1.18 + (z - 1.18) * 1.04) for x, z in prof]], M_STEEL)
        b.cyl(V(s * 1.15, -0.30, 1.46), V(s * 1.15, -0.30, 1.50), 0.06, 0.06, M_STEEL, n=10)   # пробка
        for k in range(2):                                                                # ресиверы пневмосистемы
            b.cyl(V(s * 0.72, -2.95 - k * 0.0, 0.92 + k * 0.26), V(s * 0.72, -3.95, 0.92 + k * 0.26), 0.11, 0.11, M_BODY, n=16)
            for yy in (-3.10, -3.80): b.cyl(V(s * 0.72, yy + 0.02, 0.92 + k * 0.26), V(s * 0.72, yy - 0.02, 0.92 + k * 0.26), 0.12, 0.12, M_STEEL, n=16)
        for yw in AXY:                                                                    # тормозные камеры у колёс
            b.cyl(V(s * 0.80, yw + 0.25, RW + 0.05), V(s * 0.62, yw + 0.25, RW + 0.05), 0.08, 0.08, M_DARK, n=12)
            tube_path(b, [V(s * 0.62, yw + 0.25, RW + 0.05), V(s * 0.52, yw + 0.35, RW + 0.20), V(s * 0.50, yw + 0.40, 1.02)], 0.012, M_BLACK, n=6)
        cbox(b, (s * 1.48 if s < 0 else 0.95, -1.88, 0.92), (-0.95 if s < 0 else 1.48, -1.18, 1.56), M_BODY, 0.03)
        hatch(b, s * 1.48, -1.82, -1.24, 0.98, 1.50, s)
        for y in (2.44, -3.80): pass
    return mk(b)


def bolt_row(b, p0, p1, n, nrm, rb=0.011, h=0.010, mat=M_BODY):
    """ряд болтов (шестигранные головки) от p0 до p1 наружу nrm"""
    p0, p1, nn = Vector(p0), Vector(p1), Vector(nrm).normalized()
    for k in range(n):
        p = p0 + (p1 - p0) * (k / max(1, n - 1)); b.cyl(p - nn * 0.004, p + nn * h, rb, rb * 0.85, mat, n=6)


def sweep(b, pts, rad, mat, ns=5, caps=True):
    """труба по гладкой ломаной: кольца перпендикулярно касательной (рамка переносится без скручивания)"""
    pts = [Vector(p) for p in pts]; rings = []; nrm = None
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        if nrm is None: nrm = t.orthogonal().normalized()
        nrm = (nrm - t * nrm.dot(t)).normalized(); w = t.cross(nrm)
        rings.append([p + (nrm * math.cos(2 * math.pi * k / ns) + w * math.sin(2 * math.pi * k / ns)) * rad for k in range(ns)])
    b.loft(rings, mat, caps, caps)


def rope(b, path, r=0.020, mat=None, pitch=0.09, per=5, strands=3):
    """витой трос (Mark 2026-11-18: «тросы - из материала, похожего на верёвки»): 3 пряди винтом вокруг оси пути"""
    mat = M_CANVAS if mat is None else mat
    P = [Vector(p) for p in path]; L_ = sum((q - p).length for p, q in zip(P, P[1:])); n = max(8, int(L_ / pitch * per))
    seg = []; acc = [0.0]
    for p, q in zip(P, P[1:]): acc.append(acc[-1] + (q - p).length)
    def at(d):
        for k in range(len(P) - 1):
            if d <= acc[k + 1] or k == len(P) - 2:
                f = (d - acc[k]) / max(1e-9, acc[k + 1] - acc[k]); return P[k] + (P[k + 1] - P[k]) * f, (P[k + 1] - P[k]).normalized()
    nrm = None; axis = []
    for i in range(n + 1):
        p, t = at(L_ * i / n)
        if nrm is None: nrm = t.orthogonal().normalized()
        nrm = (nrm - t * nrm.dot(t)).normalized(); axis.append((p, t, nrm, t.cross(nrm), L_ * i / n))
    for j in range(strands):
        sp = [p + (nn * math.cos(2 * math.pi * (d / pitch) + 2 * math.pi * j / strands) + ww * math.sin(2 * math.pi * (d / pitch) + 2 * math.pi * j / strands)) * r * 0.45 for p, t, nn, ww, d in axis]
        sweep(b, sp, r * 0.58, mat, ns=5)


def catenary(x0, x1, y, z, sag, n=14, wob=0.0):
    return [V(x0 + (x1 - x0) * k / n, y + wob * math.sin(k * 1.3), z - sag * (1 - (2 * k / n - 1) ** 2)) for k in range(n + 1)]


def arc_pts(cy, cz, r, a0, a1, n):
    return [(cy + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)), cz + r * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]


ZWS = lambda z: 6.21 - (z - 1.94) * (0.11 / 0.84)                                   # Y лобового листа кабины на высоте z (1,94…2,78)
WS_N = Vector((0, 0.84, 0.11)).normalized()


def cab():
    """кабина МЗКТ (фото 01, 02 крупно): верх со скруглённой кромкой крыши, борта с аркой над передним колесом, дверь с небольшим окном,
    задний отсек с окном над колесом, лоб - 3 стекла, под ними узкие жалюзи, ниша бампера с буксирными тросами, фонари по углам, болты"""
    b = B('body_cab'); xo = HW - 0.02
    up = [(Y_CAB0, 1.62), (6.24, 1.62), (6.24, 1.82), (6.21, 1.94)] + arc_pts(5.88, 2.78, 0.22, 0, 90, 6)[0:] + [(Y_CAB0 + 0.08, 3.0), (Y_CAB0, 2.92)]
    up = [up[0], up[1], up[2], up[3]] + [(6.10, 2.78)] + arc_pts(5.88, 2.78, 0.22, 15, 90, 5) + [(Y_CAB0 + 0.08, 3.0), (Y_CAB0, 2.92)]
    xprism(b, up, -xo, xo, M_BODY, ch=0.07)
    xprism(b, [(4.52, 0.95), (6.18, 0.95), (6.26, 1.05), (6.26, 1.62), (4.52, 1.62)], -1.20, 1.20, M_BODY, ch=0.03)   # низ кабины (середина)
    b.box((0, 3.86, 1.28), (1.84, 1.32, 0.66), M_BODY)                                     # пол заднего отсека между колёсами
    arch = arc_pts(AXY[0], RW, 0.93, 14, 168, 14)                                         # арка над передним колесом
    for s in (-1, 1):
        skirt = [(6.18, 0.95), (4.52, 0.95)] + [p for p in arch if p[0] <= 4.52 and p[0] >= Y_CAB0] + [(Y_CAB0, 1.62), (6.18, 1.62)]
        xprism(b, skirt, 1.20 if s > 0 else -xo, xo if s > 0 else -1.20, M_BODY)          # борт-фартук с вырезом арки (вогнутый, без фаски)
        lip = [V(s * (xo + 0.01), y, z) for y, z in arch if Y_CAB0 - 0.02 <= y <= 4.54]
        b.beam(lip, V(1, 0, 0), 0.06, 0.035, M_BODY)                                       # отбортовка арки
        b.box((s * 0.93, 3.86, 1.28), (0.03, 1.32, 0.66), M_DARK)                          # стенка ниши колеса
        # двери и окна
        xs = s * xo
        hatch(b, xs, 5.02, 6.02, 0.99, 2.86, s, hinge=True, handle=True)
        framed_glass(b, [V(xs, 5.16, 2.12), V(xs, 5.86, 2.12), V(xs, 5.86, 2.72), V(xs, 5.16, 2.72)], V(s, 0, 0), rim=0.04)
        framed_glass(b, [V(xs, 3.48, 2.06), V(xs, 4.72, 2.06), V(xs, 4.72, 2.74), V(xs, 3.48, 2.74)], V(s, 0, 0), rim=0.045)
        hatch(b, xs, 3.55, 4.35, 1.74, 1.98, s, hinge=False, handle=False)
        b.box((s * (xo + 0.006), 4.98, 1.85), (0.012, 0.03, 1.70), M_BODY)                # шов между дверью и задним отсеком
        bolt_row(b, V(s * (xo + 0.002), 3.30, 2.90), V(s * (xo + 0.002), 6.00, 2.90), 18, V(s, 0, 0))
        bolt_row(b, V(s * (xo + 0.002), 3.30, 1.70), V(s * (xo + 0.002), 4.90, 1.70), 9, V(s, 0, 0))
        for zz in (1.30, 2.45):
            bolt_row(b, V(s * (xo + 0.012), 5.07, zz - 0.15), V(s * (xo + 0.012), 5.07, zz + 0.15), 3, V(s, 0, 0))
        # подножка под дверью (фото 01: ступени в рамке, приварены к низу кабины)
        for yy in (5.30, 5.82):
            b.box((s * 1.33, yy, 0.665), (0.28, 0.014, 0.60), M_BODY)
        for zz in (0.42, 0.69):
            b.box((s * 1.33, 5.56, zz), (0.30, 0.52, 0.03), M_STEEL)
            for k in range(6): b.box((s * 1.33, 5.33 + k * 0.09, zz + 0.018), (0.29, 0.012, 0.008), M_STEEL)     # рифление ступени
        b.box((s * 1.33, 5.56, 0.955), (0.30, 0.56, 0.02), M_BODY)                        # плита крепления к низу кабины
        # зеркало на кронштейне от стойки двери
        b.bar(V(xs, 6.00, 2.74), V(s * 1.78, 6.08, 2.68), 0.03, 0.03, M_DARK)
        b.bar(V(xs, 6.00, 2.20), V(s * 1.78, 6.08, 2.40), 0.025, 0.025, M_DARK)
        cbox(b, (s * 1.80 - 0.04, 6.00, 2.22), (s * 1.80 + 0.04, 6.18, 2.72), M_DARK, 0.02)
        b.box((s * 1.80, 6.185, 2.47), (0.07, 0.008, 0.44), M_GLASS)
        # фонари по углам (фото 01, 02): белая фара внизу, оранжевый и красный над ней; ниша бампера
        b.box((s * 1.18, 6.27, 1.06), (0.22, 0.03, 0.11), M_DARK); b.box((s * 1.18, 6.287, 1.06), (0.19, 0.01, 0.08), M_LENS)
        b.box((s * 1.24, 6.27, 1.24), (0.10, 0.03, 0.08), M_DARK); b.box((s * 1.24, 6.287, 1.24), (0.08, 0.01, 0.06), M_LAMP)
        b.box((s * 1.10, 6.27, 1.24), (0.10, 0.03, 0.08), M_DARK); b.box((s * 1.10, 6.287, 1.24), (0.08, 0.01, 0.06), M_RED)
        b.cyl(V(s * 0.95, 6.03, 3.00), V(s * 0.95, 6.03, 3.08), 0.05, 0.04, M_LAMP, n=10)   # маячки на крыше
        b.box((s * 1.40, 6.30, 0.92), (0.10, 0.10, 0.10), M_DARK)                          # буксирные проушины
        b.cyl(V(s * 1.40, 6.32, 0.92), V(s * 1.40, 6.42, 0.92), 0.05, 0.05, M_STEEL, n=8)
        b.box((s * xo, 4.0, 2.97), (0.03, 2.4, 0.02), M_BODY)                              # водосток над окнами
    zf = ZWS
    for x0, x1 in ((-1.30, -0.47), (-0.42, 0.42), (0.47, 1.30)):                          # лобовые стёкла (3)
        z0, z1 = 2.00, 2.74
        framed_glass(b, [V(x0, zf(z0), z0), V(x1, zf(z0), z0), V(x1, zf(z1), z1), V(x0, zf(z1), z1)], WS_N, rim=0.05)
    for x in (-0.86, 0.0, 0.86):                                                          # дворники
        b.bar(V(x - 0.05, zf(2.04) + 0.05, 2.04), V(x + 0.25, zf(2.55) + 0.05, 2.55), 0.018, 0.012, M_BLACK)
        b.cyl(V(x - 0.05, zf(2.0), 2.0), V(x - 0.05, zf(2.0) + 0.05, 2.0), 0.02, 0.02, M_BLACK, n=6)
    b.box((0, 6.195, 1.27), (2.14, 0.03, 0.40), M_TUBE)                                   # сердцевина радиатора за решёткой (мелкие соты в шейдере)
    for k in range(35):                                                                   # решётка радиатора во всю нишу (Mark 2026-11-18: «полноценная решётка за тросами»): частые прутья
        x = -1.02 + k * 0.06; b.box((x, 6.235, 1.27), (0.012, 0.045, 0.40), M_BODY)
    for z in (1.10, 1.17, 1.24, 1.31, 1.38, 1.45): b.box((0, 6.240, z), (2.06, 0.035, 0.012), M_BODY)
    for x in (-1.06, 1.06): b.box((x, 6.24, 1.27), (0.05, 0.06, 0.44), M_BODY)             # рамка
    b.box((0, 6.24, 1.49), (2.17, 0.06, 0.05), M_BODY); b.box((0, 6.24, 1.055), (2.17, 0.06, 0.05), M_BODY)
    bolt_row(b, V(-1.0, 6.272, 1.49), V(1.0, 6.272, 1.49), 9, V(0, 1, 0), rb=0.009)
    for x in (-0.98, 0.0, 0.98):                                                          # крюки-держатели тросов
        b.box((x, 6.29, 1.47), (0.05, 0.08, 0.04), M_STEEL); b.bar(V(x, 6.33, 1.47), V(x, 6.34, 1.40), 0.03, 0.02, M_STEEL)
    RB_ = B('body_ropes')                                                                  # тросы - отдельный объект (для игры облегчаются в deliver.py)
    for k, (sag, dz) in enumerate(((0.20, 0.0), (0.27, -0.015), (0.33, -0.03))):        # тросы петлями поверх решётки (фото 01, 02): висят с крюков
        yy = 6.315 + k * 0.035
        rope(RB_, catenary(-0.98, 0.0, yy, 1.43 + dz, sag), r=0.020)
        rope(RB_, catenary(0.0, 0.98, yy, 1.43 + dz, sag * 0.9), r=0.020)
    for x in (-0.98, 0.98): lathe(RB_, V(x, 6.33, 1.44), V(0, 1, 0), [(-0.03, 0.001), (-0.03, 0.035), (0.03, 0.035), (0.03, 0.001)], M_CANVAS, n=8)   # огоны тросов на крюках
    mk(RB_)
    b.box((0, 6.31, 0.96), (2.90, 0.12, 0.13), M_BODY)                                    # бампер
    b.box((0.10, 6.255, 1.68), (0.74, 0.03, 0.26), M_DARK)                                # жалюзи под лобовыми стёклами
    for k in range(8): b.box((0.10, 6.27, 1.58 + k * 0.03), (0.70, 0.02, 0.012), M_BODY)
    bolt_row(b, V(-1.30, 6.245, 1.86), V(1.30, 6.245, 1.86), 16, V(0, 1, 0))
    b.bar(V(-0.55, 6.32, 0.90), V(-0.55, 6.44, 0.56), 0.04, 0.03, M_STEEL)                 # откидная ступенька под бампером (фото 01)
    b.box((-0.55, 6.50, 0.55), (0.34, 0.16, 0.025), M_STEEL)
    cbox(b, (-0.45, 4.55, 3.0), (0.45, 5.45, 3.06), M_BODY, 0.02)                        # люк на крыше
    bolt_row(b, V(-0.40, 4.60, 3.062), V(0.40, 4.60, 3.062), 6, V(0, 0, 1))
    b.cyl(V(-0.95, 5.80, 3.0), V(-0.95, 5.80, 3.12), 0.035, 0.035, M_DARK, n=8)            # прожектор
    lathe(b, V(-0.95, 5.80, 3.18), V(0, 1, 0), [(-0.08, 0.001), (-0.08, 0.06), (0.06, 0.09), (0.08, 0.09)], M_DARK, n=14, cap1=False)
    b.cyl(V(-0.95, 5.885, 3.18), V(-0.95, 5.89, 3.18), 0.085, 0.085, M_LENS, n=14)
    b.cyl(V(-1.05, 3.55, 3.0), V(-1.05, 3.55, 3.10), 0.05, 0.05, M_DARK, n=8)              # антенна
    b.cyl(V(-1.05, 3.55, 3.10), V(-1.05, 2.70, 4.55), 0.008, 0.005, M_BLACK, n=5)
    return mk(b)


def guard():
    """решётка-ограждение кабины (фото 01, 02 крупно): стойки по углам от низа бампера до верха над крышей, перекладины на 1,53 и 2,21 м,
    лестница справа от середины, верхние поручни назад по крыше, боковые перекладины к лобовому листу"""
    b = B('body_guard'); r = 0.028; yf = 6.62; zt = 3.30; zb = 0.62
    for s in (-1, 1):
        x = s * 1.42
        b.cyl(V(x, yf, zb), V(x, yf, zt), r, r, M_BODY, n=8)
        b.cyl(V(x, yf, zt), V(x, 3.40, zt), r, r, M_BODY, n=8)
        for y in (3.40, 4.95): b.cyl(V(x, y, 3.0), V(x, y, zt), r, r, M_BODY, n=8)
        for z in (1.53, 2.21): b.cyl(V(x, yf, z), V(x, ZWS(min(max(z, 1.94), 2.78)) + 0.01 if z > 1.94 else 6.25, z), r * 0.9, r * 0.9, M_BODY, n=8)
        b.cyl(V(x, yf, zb), V(x, 6.30, zb + 0.30), r, r, M_BODY, n=8)                     # нижняя - к раме под бампером
        b.cyl(V(x, yf, zt), V(x, 5.90, 3.0), r * 0.9, r * 0.9, M_BODY, n=8)               # раскос на крышу
        for z in (zb, zt): lathe(b, V(x, yf, z - 0.04), V(0, 0, 1), [(0, 0.001), (0.01, r * 1.25), (0.07, r * 1.25), (0.08, 0.001)], M_BODY, n=8)   # узлы-муфты
    for z in (zb, 1.53, 2.21, zt): b.cyl(V(-1.42, yf, z), V(1.42, yf, z), r, r, M_BODY, n=8)
    b.cyl(V(-1.42, 3.40, zt), V(1.42, 3.40, zt), r, r, M_BODY, n=8)
    xa, xb = 0.18, 0.62
    for x in (xa, xb): b.cyl(V(x, yf + 0.03, zb), V(x, yf + 0.03, zt), r * 0.8, r * 0.8, M_BODY, n=6)
    for k in range(1, 9):
        z = zb + (zt - zb) * k / 9; b.cyl(V(xa, yf + 0.03, z), V(xb, yf + 0.03, z), 0.017, 0.017, M_BODY, n=6)
    return mk(b)


def equip():
    """приборный отсек за кабиной (Y 2,30…3,20): короб, жалюзи воздухозаборника слева сверху, лючки"""
    b = B('body_equip')
    cbox(b, (-HW, Y_EQ, Z_BOT - 0.05), (HW, Y_CAB0, Z_TOP), M_BODY, 0.05)
    cbox(b, (-HW + 0.05, 2.38, Z_TOP), (-0.45, 3.12, Z_TOP + 0.30), M_BODY, 0.06)     # кожух воздухозаборника
    for k in range(9):
        y = 2.45 + k * 0.075; b.box((-0.97, y, Z_TOP + 0.31), (0.95, 0.035, 0.02), M_DARK)
        b.box((-HW + 0.03, y, Z_TOP + 0.15), (0.02, 0.035, 0.22), M_DARK)
    for s in (-1, 1):
        hatch(b, s * HW, 2.40, 3.10, 1.75, 2.95, s)
        b.box((s * (HW + 0.004), 2.75, 2.35), (0.012, 0.60, 0.012), M_DARK)
    return mk(b)


def bay():
    """ракетный отсек (Y −6,50…2,30): борта с рёбрами и лючками, пол, передняя стенка, задние стойки с лестницами, низкая задняя стенка, задний бампер"""
    b = B('body_bay')
    for s in (-1, 1):
        x0, x1 = (HW - 0.04, HW) if s > 0 else (-HW, -HW + 0.04)
        b.box(((x0 + x1) / 2, (Y_REAR + 0.20 + Y_EQ) / 2, (Z_BOT + Z_TOP) / 2), (0.04, Y_EQ - Y_REAR - 0.20, Z_TOP - Z_BOT), M_BODY)
        xo = s * HW
        b.box((s * (HW + 0.016), (Y_REAR + Y_EQ) / 2, Z_BOT + 0.03), (0.032, Y_EQ - Y_REAR, 0.06), M_BODY)     # нижний кант
        b.box((s * (HW + 0.043), (Y_REAR + 0.22 + Y_EQ) / 2, 2.295), (0.086, Y_EQ - Y_REAR - 0.22, 0.03), M_BODY)   # полка-пояс (фото 01 крупно)
        y = Y_EQ - 0.20
        while y > Y_REAR + 0.40:                                                          # косынки под полкой - ряд треугольников (фото 01)
            tri = [(s * HW, 2.28), (s * (HW + 0.082), 2.28), (s * HW, 2.07)]
            b.loft([[V(x, y - 0.006, z) for x, z in tri], [V(x, y + 0.006, z) for x, z in tri]], M_BODY); y -= 0.33
        bolt_row(b, V(s * (HW + 0.032), Y_REAR + 0.35, Z_BOT + 0.03), V(s * (HW + 0.032), Y_EQ - 0.10, Z_BOT + 0.03), 34, V(s, 0, 0))
        for yl in (1.90, -1.00, -4.00, -6.10):                                            # боковые габаритные фонари
            b.box((s * (HW + 0.03), yl, 1.70), (0.03, 0.10, 0.05), M_DARK); b.box((s * (HW + 0.047), yl, 1.70), (0.006, 0.08, 0.035), M_LAMP)
        ya, yb_ = 1.82, 2.20                                                              # утопленная лестница у передней кромки отсека (фото 01)
        b.box((s * (HW + 0.004), (ya + yb_) / 2, 2.40), (0.008, yb_ - ya + 0.06, 1.42), M_DARK)
        for yy in (ya, yb_): b.box((s * (HW + 0.02), yy, 2.40), (0.04, 0.03, 1.42), M_BODY)
        for k in range(7): b.cyl(V(s * (HW + 0.03), ya, 1.82 + k * 0.19), V(s * (HW + 0.03), yb_, 1.82 + k * 0.19), 0.014, 0.014, M_STEEL, n=6)
        cbox(b, (s * HW if s < 0 else HW, -2.78, 1.68) if s > 0 else (-HW - 0.06, -2.78, 1.68), (HW + 0.06, -1.70, 2.04) if s > 0 else (-HW, -1.70, 2.04), M_BODY, 0.015)   # короб жалюзи (фото 01)
        for k in range(9): b.box((s * (HW + 0.068), -2.70 + k * 0.115, 1.86), (0.02, 0.025, 0.30), M_DARK if k in (0, 8) else M_BODY)
        for k in range(8): b.box((s * (HW + 0.055), -2.64 + k * 0.115, 1.86), (0.012, 0.09, 0.30), M_DARK)
        b.box((s * (HW + 0.010), (Y_REAR + Y_EQ) / 2, Z_TOP - 0.07), (0.03, Y_EQ - Y_REAR, 0.04), M_BODY)     # верхний кант
        y = Y_EQ - 0.05
        while y > Y_REAR + 0.4:                                                           # вертикальные рёбра
            b.box((s * (HW + 0.012), y, (Z_BOT + Z_TOP - 0.07) / 2), (0.025, 0.05, Z_TOP - 0.07 - Z_BOT), M_BODY); y -= 0.98
        for y0, y1, z0, z1 in ((0.95, 1.70, 2.42, 3.02), (-0.70, 0.20, 2.42, 3.02), (-2.66, -1.76, 2.42, 3.02), (-4.62, -3.72, 2.42, 3.02), (0.30, 1.18, 1.70, 2.02), (-3.65, -2.95, 1.70, 2.02),
                               (-5.70, -4.90, 1.70, 2.02), (-1.55, -0.55, 1.70, 2.02)):
            hatch(b, xo, y0, y1, z0, z1, s)
            bolt_row(b, V(xo + s * 0.013, y0 + 0.06, z1 - 0.012), V(xo + s * 0.013, y1 - 0.06, z1 - 0.012), max(3, int((y1 - y0) / 0.16)), V(s, 0, 0), rb=0.008)
        for y in (2.0, -0.5, -3.0, -5.6):                                                 # петли крышек: кулаки борта по краям, кулак крышки посередине
            for dy in (-0.25, 0.25):
                b.cyl(V(s * 1.535, y + dy - 0.08, Z_TOP + 0.03), V(s * 1.535, y + dy + 0.08, Z_TOP + 0.03), 0.03, 0.03, M_STEEL, n=8)
                b.box((s * 1.525, y + dy, Z_TOP - 0.02), (0.03, 0.16, 0.08), M_STEEL)
        for y0, y1 in ((AXY[0] + 0.86, AXY[1] - 0.86), (AXY[2] + 0.86, AXY[3] - 0.86)):   # подкрылки над парами колёс
            pass
        for yp in (AXY[0], AXY[1], AXY[2], AXY[3]):                                       # брызговики
            b.box((s * (WX + 0.02), yp - RW - 0.06, 1.20), (WW + 0.06, 0.012, 0.65), M_RUBBER)
    b.box((0, (Y_REAR + Y_EQ) / 2, Z_FLOOR - 0.02), (1.80, Y_EQ - Y_REAR, 0.04), M_DARK)                         # пол (между колёсными нишами)
    for s in (-1, 1):
        b.box((s * 1.20, (Y_REAR + Y_EQ) / 2, Z_BOT - 0.03), (0.60, Y_EQ - Y_REAR, 0.04), M_BODY)                 # полки над колёсами
        b.box((s * 0.92, (Y_REAR + Y_EQ) / 2, (Z_FLOOR + Z_BOT) / 2 - 0.02), (0.04, Y_EQ - Y_REAR, Z_BOT - Z_FLOOR + 0.04), M_DARK)   # стенки ниш
    b.box((0, Y_EQ - 0.02, (Z_FLOOR + Z_TOP) / 2), (2 * HW - 0.08, 0.04, Z_TOP - Z_FLOOR), M_DARK)                 # передняя стенка
    for s in (-1, 1):                                                                     # задние стойки (фото 08) с лестницами
        x0, x1 = 1.17, HW
        cbox(b, (s * x1 if s < 0 else x0, Y_REAR, Z_BOT - 0.30), (-x0 if s < 0 else x1, Y_REAR + 0.22, Z_TOP), M_BODY, 0.03)
        xm = s * (x0 + x1) / 2
        ladder(b, V(xm, Y_REAR - 0.05, Z_BOT - 0.25), V(xm, Y_REAR - 0.05, Z_TOP - 0.10), w=0.26, rungs=6, r=0.018)
        for z in (Z_BOT - 0.20, Z_TOP - 0.15):
            b.bar(V(xm - 0.13, Y_REAR, z), V(xm - 0.13, Y_REAR - 0.06, z), 0.03, 0.03, M_BODY); b.bar(V(xm + 0.13, Y_REAR, z), V(xm + 0.13, Y_REAR - 0.06, z), 0.03, 0.03, M_BODY)
    b.box((0, Y_REAR + 0.03, (Z_FLOOR + 1.84) / 2 - 0.15), (2.24, 0.06, 1.84 - Z_FLOOR + 0.30), M_BODY)           # низкая задняя стенка (ракеты в боевом стоят над ней)
    cbox(b, (-HW, Y_REAR - 0.06, 0.82), (HW, Y_REAR + 0.20, 1.22), M_BODY, 0.03)                                  # задний бампер
    for s in (-1, 1):
        for k, m in enumerate((M_RED, M_LAMP, M_LENS)):
            b.box((s * (1.28 - k * 0.14), Y_REAR - 0.065, 1.07), (0.11, 0.012, 0.08), m)
        b.box((s * 1.05, Y_REAR - 0.065, 0.93), (0.20, 0.01, 0.05), M_RED)                                       # катафот
    b.box((0, Y_REAR - 0.07, 1.00), (0.32, 0.012, 0.16), M_BLACK)                                                 # место номера
    b.cyl(V(0, Y_REAR - 0.06, 0.92), V(0, Y_REAR - 0.30, 0.92), 0.05, 0.05, M_STEEL, n=8)                        # фаркоп
    lathe(b, V(0, Y_REAR - 0.33, 0.92), V(0, 1, 0), [(0, 0.06), (0.04, 0.09), (0.08, 0.06)], M_STEEL, n=10)
    for s in (-1, 1):                                                                     # опоры шарниров стрел (щёки) и опоры цилиндров
        x = s * X_M
        for dx in (-0.33, 0.33):
            b.box((x + dx, PIVY + 0.02, (Z_FLOOR + PIVZ + 0.10) / 2), (0.05, 0.22, PIVZ + 0.10 - Z_FLOOR), M_DARK)
        cy, cz = CYL_BASE
        for dx in (-0.10, 0.10):
            b.box((s * CYL_X + dx, cy, (Z_FLOOR + cz + 0.06) / 2), (0.03, 0.18, cz + 0.06 - Z_FLOOR), M_DARK)
        b.cyl(V(s * CYL_X - 0.12, cy, cz), V(s * CYL_X + 0.12, cy, cz), 0.03, 0.03, M_STEEL, n=8)
    for s in (-1, 1):                                                                     # внутри отсека (видно при открытых крышках): кабельные лотки, трубы, ящики
        xi = s * (HW - 0.06)
        b.box((xi, (Y_REAR + Y_EQ) / 2, 2.70), (0.05, Y_EQ - Y_REAR - 0.5, 0.10), M_DARK)
        for k, z in enumerate((2.30, 2.40)):
            b.cyl(V(xi - s * 0.02, Y_EQ - 0.1, z), V(xi - s * 0.02, Y_REAR + 0.4, z), 0.022, 0.022, M_STEEL, n=8)
        for y in (1.6, -0.4, -2.4, -4.4): b.box((xi - s * 0.02, y, 2.35), (0.06, 0.05, 0.20), M_DARK)    # хомуты
        cbox(b, (s * 1.10 if s > 0 else -1.42, 1.30, Z_FLOOR), (1.42 if s > 0 else -1.10, 2.25, 2.05), M_BODY, 0.02)   # ящики у передней стенки
    for y in (1.8, 0.4, -1.0, -2.4, -3.8): b.box((0, y, Z_FLOOR + 0.02), (1.78, 0.06, 0.04), M_DARK)                  # рёбра пола
    return mk(b)


def jacks():
    out = {}
    b = B('body_jackbox')
    for n, (x, y) in JACKS.items():
        b.cyl(V(x, y, 0.62), V(x, y, Z_BOT), 0.10, 0.10, M_BODY, n=14)                     # корпус опоры
        b.cyl(V(x, y, 0.60), V(x, y, 0.66), 0.12, 0.12, M_BODY, n=14)
        b.box((x - math.copysign(0.10, x), y, Z_BOT - 0.15), (0.22, 0.30, 0.25), M_BODY)  # кронштейн к раме
        for dz in (0.95, 1.30): b.cyl(V(x, y - 0.11, dz), V(x, y + 0.11, dz), 0.02, 0.02, M_STEEL, n=6)
    mk(b)
    for n, (x, y) in JACKS.items():                                                       # выдвижная часть: шток + пята; начало - верх штока
        b = B(f'jack_{n}')
        b.cyl(V(x, y, 0.46), V(x, y, 1.30), 0.065, 0.065, M_STEEL, n=12)
        lathe(b, V(x, y, 0.45), V(0, 0, 1), [(0, 0.20), (0.04, 0.20), (0.07, 0.12), (0.18, 0.07)], M_DARK, n=16)
        for k in range(4):
            a = k * math.pi / 2; b.bar(V(x, y, 0.52), V(x + 0.17 * math.cos(a), y + 0.17 * math.sin(a), 0.47), 0.03, 0.04, M_DARK)
        out[n] = mk(b, pivot=(x, y, 1.30))
    return out


def wheels():
    out = []
    for i, y in enumerate(AXY):
        for s, sn in ((1, 'r'), (-1, 'l')):
            b = B(f'wheel_{i + 1}{sn}')
            wheel(b, (s * WX, y, RW), r=RW, w=WW, side=s, n=36)
            tread(b, (s * WX, y, RW), RW, WW, side=s, n=26, h=0.045)
            xh = s * (WX + WW * 0.40 + 0.15)                                              # подкачка шин (фото 01, 02): штуцер на колпаке и трубка к ободу
            b.cyl(V(xh - s * 0.02, y, RW), V(xh + s * 0.03, y, RW), 0.028, 0.022, M_STEEL, n=8)
            tube_path(b, [V(xh + s * 0.02, y, RW), V(xh + s * 0.01, y + 0.20, RW + 0.12), V(xh - s * 0.06, y + 0.38, RW + 0.24)], 0.011, M_STEEL, n=6)
            out.append(mk(b, pivot=(s * WX, y, RW)))
    return out


# ---------------- крышки ----------------
def lid(s):
    b = B('lid_r' if s > 0 else 'lid_l'); y0, y1 = Y_REAR + 0.02, Y_EQ - 0.02; x_h = s * 1.535
    zt = lambda x: Z_TOP + 0.05 + 0.10 * (1 - abs(x) / HW)                               # гребень по оси машины
    xs = [s * 1.47, s * HW * 0.66, s * HW * 0.33, s * 0.006]
    prof_top = [(x, zt(x)) for x in xs]
    prof = prof_top + [(x, z - 0.045) for x, z in reversed(prof_top)]
    if s < 0: prof = list(reversed(prof))
    yprism(b, prof, y0, y1, M_BODY)
    b.box(((s * 0.006 + s * 0.026) / 2, (y0 + y1) / 2, zt(0.02) - 0.09), (0.02, y1 - y0, 0.10), M_BODY)     # фартук на стыке
    for y in (y0, y1): b.box((s * 0.72, y, Z_TOP + 0.085), (1.44, 0.025, 0.11), M_BODY)                           # торцы
    for k in (0.25, 0.55, 0.82):                                                          # продольные рёбра
        x = s * HW * k; b.box((x, (y0 + y1) / 2, zt(x) + 0.012), (0.05, y1 - y0 - 0.06, 0.03), M_BODY)
    y = y1 - 0.5
    while y > y0 + 0.2:                                                                   # поперечные рёбра (фото 07)
        b.beam([V(s * 0.02, y, zt(0.02) + 0.005), V(s * HW * 0.5, y, zt(HW * 0.5) + 0.005), V(s * (HW - 0.02), y, zt(HW - 0.02) + 0.005)], V(0, 1, 0), 0.05, 0.025, M_BODY)
        y -= 1.10
    for ya, yb_ in ((1.95, -0.45), (-0.75, -3.15), (-3.45, -5.95)):                         # решётчатые настилы (фото 08): рамка + решётка
        xa, xb = s * 0.42, s * 1.12
        for x0, x1 in ((xa, xa + s * 0.04), (xb - s * 0.04, xb)):
            b.loft([[V(x0, y, zt(x0) + dz) for y, dz in ((ya, 0.0), (yb_, 0.0), (yb_, 0.035), (ya, 0.035))], [V(x1, y, zt(x1) + dz) for y, dz in ((ya, 0.0), (yb_, 0.0), (yb_, 0.035), (ya, 0.035))]], M_BODY)
        b.loft([[V(xa, y, zt(xa) + 0.012) for y in (ya, yb_)] + [V(xa, y, zt(xa) + 0.03) for y in (yb_, ya)], [V(xb, y, zt(xb) + 0.012) for y in (ya, yb_)] + [V(xb, y, zt(xb) + 0.03) for y in (yb_, ya)]], M_TUBE)
    for y in (2.0, -0.5, -3.0, -5.6):                                                     # петли
        b.cyl(V(x_h, y - 0.15, Z_TOP + 0.03), V(x_h, y + 0.15, Z_TOP + 0.03), 0.032, 0.032, M_STEEL, n=8)
        b.box((s * 1.50, y, Z_TOP + 0.045), (0.06, 0.30, 0.025), M_STEEL)                 # лапка петли к крышке
    return mk(b, pivot=(x_h, 0, Z_TOP + 0.03))


# ---------------- стрелы, ракеты, цилиндры ----------------
def msl_profile():
    L, R = MS['L'], MS['R']
    pr = [(0.0, 0.0), (0.02, 0.03)]
    Ln, Rn = 1.15, 0.65 * R
    for k in range(1, 13):
        t = Ln * k / 12; pr.append((t, Rn * math.sin(math.pi / 2 * t / Ln) ** 0.62))
    pr += [(Ln + 0.004, Rn + 0.008), (Ln + 0.03, Rn + 0.008), (Ln + 0.034, Rn)]           # кольцо-стык
    cone = lambda t: Rn + (0.98 * R - Rn) * ((t - Ln) / (3.82 - Ln)) ** 0.85
    for t in (1.6, 2.16): pr.append((t, cone(t)))
    pr += [(2.165, cone(2.16) + 0.006), (2.19, cone(2.19) + 0.006), (2.195, cone(2.195))]  # стык ГЧ
    for t in (2.7, 3.3, 3.80): pr.append((t, cone(t)))
    pr += [(3.82, R + 0.01), (3.90, R + 0.01), (3.905, R)]                              # плечо - кольцо
    pr += [(5.0, R), (5.004, R + 0.005), (5.03, R + 0.005), (5.034, R), (6.10, R), (6.104, R + 0.012), (6.20, R + 0.012), (6.204, R)]
    pr += [(7.10, R), (7.16, R - 0.02), (L, R - 0.05)]
    return pr


def missile(name, x0, parent):
    b = B(name); L, R = MS['L'], MS['R']
    o = V(x0, Y_TAIL + L, AX_Z); ax = V(0, -1, 0)
    pr = msl_profile()
    lathe(b, o, ax, pr, M_MSL, n=40, cap0=False, cap1=False)
    lathe(b, o + ax * L, -ax, [(0, R - 0.05), (0.02, 0.33), (0.25, 0.25), (0.40, 0.18), (0.42, 0.001)], M_MSLD, n=32, cap0=False, cap1=False)   # сопло (внутрь)
    for k in range(4):                                                                    # газовые рули в сопле
        a = k * math.pi / 2; d = V(math.cos(a), 0, math.sin(a))
        b.beam([o + ax * (L - 0.02) + d * 0.08, o + ax * (L - 0.02) + d * 0.30], ax, 0.16, 0.025, M_MSLD)
    for k in range(4):                                                                    # хвостовые рули косым крестом: у соседних ракет «+» сцепляется рулями
        a = math.pi / 4 + k * math.pi / 2; d = V(math.cos(a), 0, math.sin(a)); tn = V(-math.sin(a), 0, math.cos(a))
        poly = [(L - 0.86, R - 0.004), (L - 0.36, R + 0.21), (L - 0.02, R + 0.21), (L - 0.02, R - 0.004)]
        e = [(t + (0.03 if i in (0,) else (-0.02 if i in (2, 3) else 0.0)), r_ - (0.0 if i in (0, 3) else 0.012)) for i, (t, r_) in enumerate(poly)]
        ring = lambda pl, tt: [o + ax * t + d * r_ + tn * tt for t, r_ in pl]
        b.loft([ring(e, -0.012), ring(poly, 0.0), ring(e, 0.012)], M_MSLD, cap0=True, cap1=True)
        b.cyl(o + ax * (L - 0.55) + d * (R - 0.01), o + ax * (L - 0.55) + d * (R + 0.03), 0.04, 0.035, M_MSLD, n=10)   # ось руля
    def rp(t):                                                                            # радиус профиля на расстоянии t от носа
        for (t0, r0), (t1, r1) in zip(pr, pr[1:]):
            if t0 <= t <= t1 and t1 > t0: return r0 + (r1 - r0) * (t - t0) / (t1 - t0)
        return R
    for t in (1.80, 4.4):                                                                 # такелажные гнёзда сверху и снизу
        rr = rp(t)
        for sz in (1, -1): b.cyl(o + ax * t + V(0, 0, sz * (rr - 0.02)), o + ax * t + V(0, 0, sz * (rr + 0.008)), 0.035, 0.035, M_MSLD, n=8)
    for t0, t1, a0, a1 in ((4.30, 4.75, 20, 48), (5.20, 5.55, 150, 175), (2.75, 3.05, 75, 105)):   # накладные лючки (рамка 3 мм)
        for ta, tb, aa, ab in ((t0, t1, a0, a0 + 1.5), (t0, t1, a1 - 1.5, a1), (t0, t0 + 0.02, a0, a1), (t1 - 0.02, t1, a0, a1)):
            rr = rp((ta + tb) / 2) + 0.002
            ring = lambda r_: [o + ax * t + V(r_ * math.cos(math.radians(aq)), 0, r_ * math.sin(math.radians(aq))) for t, aq in ((ta, aa), (tb, aa), (tb, ab), (ta, ab))]
            b.loft([ring(rr - 0.004), ring(rr + 0.003)], M_MSL)
    b.cyl(o + ax * 5.85 + V(0, 0, R - 0.01), o + ax * 5.85 + V(0, 0, R + 0.02), 0.03, 0.025, M_MSLD, n=8)   # разъём отрывной
    return mk(b, pivot=o + ax * (L / 2), parent=parent)


def boom(s):
    x0 = s * X_M; b = B('boom_r' if s > 0 else 'boom_l'); L, R = MS['L'], (MS['R'] if VAR == 'M' else TPK['R'] + 0.004)
    y_end = PIVY + 4.30
    for dx in (-RAIL_DX, RAIL_DX):
        cbox(b, (x0 + dx - 0.05, PIVY, 1.45), (x0 + dx + 0.05, y_end, 1.58), M_BODY, 0.02)
    for y in (PIVY + 0.25, PIVY + 1.40, PIVY + 2.50, y_end - 0.10):                       # поперечины
        b.box((x0, y, 1.47), (2 * RAIL_DX, 0.10, 0.08), M_BODY)
    b.cyl(V(x0 - 0.30, PIVY, PIVZ), V(x0 + 0.30, PIVY, PIVZ), 0.075, 0.075, M_STEEL, n=14)   # ось шарнира
    for dx in (-RAIL_DX, RAIL_DX):
        b.box((x0 + dx, PIVY + 0.125, PIVZ), (0.10, 0.25, 0.16), M_BODY)
    y_s = {'A': Y_TAIL + L - 3.82 - 0.09, 'B': Y_TAIL + L - 6.12 - 0.12}                 # кольца-бандажи (фото 04): у плеча и у хвоста
    for k, yc in y_s.items():
        lathe(b, V(x0, yc - 0.07, AX_Z), V(0, 1, 0), [(0, R + 0.012), (0, R + 0.075), (0.14, R + 0.075), (0.14, R + 0.012)], M_BODY, n=40, cap0=False, cap1=False)
        bolts_ring(b, V(x0, yc, AX_Z), V(0, 1, 0), R + 0.075, 16, h=0.02, rb=0.016)
        for sx in (-1, 1):
            b.cyl(V(x0 + sx * (R + 0.10) * 0.71, yc - 0.05, AX_Z + (R + 0.10) * 0.71), V(x0 + sx * (R + 0.10) * 0.71, yc + 0.05, AX_Z + (R + 0.10) * 0.71), 0.045, 0.045, M_STEEL, n=8)  # замки (сверху наискось - между ракетами тесно)
            b.bar(V(x0 + sx * RAIL_DX, yc, 1.56), V(x0 + sx * (R + 0.04) * 0.64, yc, AX_Z - (R + 0.04) * 0.77), 0.10, 0.06, M_BODY)   # стойки к рельсам
    for y in (PIVY + 1.0, PIVY + 2.9):                                                    # ложементы-подушки
        b.beam([V(x0 + sx * RAIL_DX, y, 1.58) for sx in (-1,)] + [V(x0, y, AX_Z - R - 0.005)] + [V(x0 + RAIL_DX, y, 1.58)], V(0, 1, 0), 0.12, 0.05, M_DARK)
    ye = PIVY + CYL_EYE                                                                   # проушина штока цилиндра
    b.bar(V(x0 - s * RAIL_DX, ye, 1.47), V(s * CYL_X, ye, 1.42), 0.10, 0.08, M_BODY)
    b.cyl(V(s * CYL_X - 0.10, ye, 1.40), V(s * CYL_X + 0.10, ye, 1.40), 0.035, 0.035, M_STEEL, n=8)
    return mk(b, pivot=(x0, PIVY, PIVZ))


def cylinder(s, boom_o):
    """корпус (на полу, начало - опора) и шток (на стреле, начало - проушина); в pose() наводятся друг на друга"""
    nm = 'r' if s > 0 else 'l'; x = s * CYL_X; cy, cz = CYL_BASE; ye = PIVY + CYL_EYE
    b = B(f'cyl_{nm}_body')
    d = (V(x, ye, 1.40) - V(x, cy, cz)).normalized()
    p0 = V(x, cy, cz)
    lathe(b, p0, d, [(-0.06, 0.001), (-0.06, 0.05), (0.0, 0.07), (0.0, 0.085), (1.75, 0.085), (1.78, 0.095), (1.86, 0.095), (1.86, 0.06)], [M_BODY, M_BODY, M_BODY, M_BODY, M_BODY, M_BODY, M_STEEL], n=16, cap0=False, cap1=True)
    b.cyl(p0 + V(-0.09, 0, 0), p0 + V(0.09, 0, 0), 0.045, 0.045, M_STEEL, n=10)
    body = mk(b, pivot=p0)
    b = B(f'cyl_{nm}_rod')
    pe = V(x, ye, 1.40); d2 = -d
    lathe(b, pe, d2, [(-0.05, 0.001), (-0.05, 0.05), (0.0, 0.05), (0.04, 0.055), (1.90, 0.055)], M_STEEL, n=14, cap0=False, cap1=True)
    b.cyl(pe + V(-0.07, 0, 0), pe + V(0.07, 0, 0), 0.05, 0.05, M_STEEL, n=10)
    rod = mk(b, pivot=pe, parent=boom_o)
    return body, rod


CH = chassis(); CABO = cab(); GUARD = guard(); EQO = equip(); BAYO = bay(); JK = jacks(); WHEELS = wheels()
LIDS = {s: lid(s) for s in (1, -1)}
BOOMS = {s: boom(s) for s in (1, -1)}
def container(name, x0, parent):
    """транспортно-пусковой контейнер 3М14 (Искандер-К, фото К-01): труба с бандажами, фланцы, крышки, кабельные короба, рым-болты; дульный торец - вперёд (+Y) лёжа"""
    b = B(name); L, R = TPK['L'], TPK['R']; o = V(x0, Y_TAIL, AX_Z); ax = V(0, 1, 0)
    pr = [(0.0, 0.30), (0.0, 0.395), (0.07, 0.395), (0.075, R)]
    for t in (0.95, 2.45, 3.95, 5.35, 6.55):                                              # бандажи
        pr += [(t - 0.045, R), (t - 0.04, R + 0.018), (t + 0.04, R + 0.018), (t + 0.045, R)]
    pr += [(L - 0.075, R), (L - 0.07, 0.395), (L, 0.395), (L, 0.33)]
    lathe(b, o, ax, pr, M_BODY, n=36, cap0=False, cap1=False)
    lathe(b, o + ax * L, ax, [(-0.002, 0.34), (0.03, 0.34), (0.06, 0.30), (0.09, 0.18), (0.10, 0.001)], M_BODY, n=32, cap0=False, cap1=False)   # передняя крышка (купол)
    lathe(b, o, -ax, [(-0.002, 0.31), (0.03, 0.31), (0.05, 0.24), (0.06, 0.001)], M_DARK, n=24, cap0=False, cap1=False)                         # задняя крышка
    for t in (0.035, L - 0.035): bolts_ring(b, o + ax * t, ax, 0.395, 16, h=0.015, rb=0.013)
    for t in (0.95, 2.45, 3.95, 5.35, 6.55):                                              # стяжки бандажей
        p_ = o + ax * t + V(0, 0, R + 0.018); b.box(tuple(p_ + V(0, 0, 0.02)), (0.07, 0.10, 0.05), M_BODY)
        b.cyl(p_ + V(-0.06, 0, 0.03), p_ + V(0.06, 0, 0.03), 0.014, 0.014, M_STEEL, n=6)
    for dx in (-0.12, 0.12):                                                              # кабельные короба вдоль верха
        b.box((x0 + dx, Y_TAIL + L / 2, AX_Z + R + 0.02), (0.06, L - 0.3, 0.04), M_BODY)
    for t in (1.7, 4.6):                                                                  # рым-болты
        for sx in (-1, 1):
            q = o + ax * t + V(sx * 0.25, 0, 0.25); lathe(b, q, V(sx, 0, 1), [(0, 0.03), (0.03, 0.03), (0.03, 0.001)], M_STEEL, n=8)
            b.cyl(q + V(sx, 0, 1).normalized() * 0.03, q + V(sx, 0, 1).normalized() * 0.07, 0.012, 0.012, M_STEEL, n=6)
    b.box((x0, Y_TAIL + 0.6, AX_Z - R - 0.03), (0.16, 0.30, 0.06), M_DARK)                 # разъём пусковой
    return mk(b, pivot=o + ax * (L / 2), parent=parent)


if VAR == 'M': TBM = {1: missile('tbm', X_M, BOOMS[1]), -1: missile('tbm2', -X_M, BOOMS[-1])}
else: TBM = {1: container('tpk_r', X_M, BOOMS[1]), -1: container('tpk_l', -X_M, BOOMS[-1])}
CYL = {s: cylinder(s, BOOMS[s]) for s in (1, -1)}
bpy.context.view_layer.update()
REST = {o.name: o.matrix_basis.copy() for o in COL.objects}
MOVE = {'boom_r': dict(kind='rot', axis=(1, 0, 0), lim=(0, 90)), 'boom_l': dict(kind='rot', axis=(1, 0, 0), lim=(0, 90)),
        'lid_r': dict(kind='rot', axis=(0, 1, 0), lim=(0, LID_OPEN)), 'lid_l': dict(kind='rot', axis=(0, -1, 0), lim=(0, LID_OPEN))}
for n in JK: MOVE[f'jack_{n}'] = dict(kind='move', axis=(0, 0, -1), lim=(0, JACK_TRAVEL))


def aim(o, target, up='Z'):
    bpy.context.view_layer.update()
    pw = o.matrix_world.translation.copy(); d = (Vector(target) - pw).normalized()
    m0 = o.matrix_world.to_3x3().normalized(); cur = (m0 @ Vector(REST_DIR[o.name])).normalized()
    rot = cur.rotation_difference(d).to_matrix()
    o.matrix_world = Matrix.Translation(pw) @ (rot @ m0).to_4x4()


REST_DIR = {}
for s in (1, -1):
    bo, ro = CYL[s]; pb = PIV[bo.name]; pr_ = PIV[ro.name]
    REST_DIR[bo.name] = tuple((pr_ - pb).normalized()); REST_DIR[ro.name] = tuple((pb - pr_).normalized())


def pose(el_r=0.0, el_l=0.0, lid=0.0, jack=0.0):
    """el_* - подъём стрел, ° (0 - лёжа, 90 - вертикально); lid - крышки, ° (0 - закрыты); jack - опоры вниз, м"""
    for o in COL.objects:
        if o.name in REST: o.matrix_basis = REST[o.name].copy()
    BOOMS[1].rotation_euler = (math.radians(el_r), 0, 0); BOOMS[-1].rotation_euler = (math.radians(el_l), 0, 0)
    LIDS[1].rotation_euler = (0, math.radians(lid), 0); LIDS[-1].rotation_euler = (0, -math.radians(lid), 0)
    for n, o in JK.items(): o.location = REST[o.name].translation + V(0, 0, -jack)
    bpy.context.view_layer.update()
    for s in (1, -1):
        bo, ro = CYL[s]
        aim(bo, ro.matrix_world.translation); aim(ro, bo.matrix_world.translation)
    bpy.context.view_layer.update()


def combat(): pose(90, 90, LID_OPEN, JACK_TRAVEL)


pose()
if os.environ.get('ISK_POSE') == 'combat': combat()
print('ISK build: объектов', len(COL.objects), 'треугольников', sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in COL.objects if o.type == 'MESH'))
