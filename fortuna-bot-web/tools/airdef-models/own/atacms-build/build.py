# build.py — ракета MGM-140 ATACMS (своя модель по фото Mark).
# Фото (ATACMS/референсы): 01 - строго сбоку, нос справа (песочный корпус, чёрная головная часть, 4 руля, короб кабелей сверху, заклёпки, серые метки) - ГЛАВНОЕ;
# 02 - сзади-сбоку (сопло, решётки вокруг, обтекатели у корней рулей); 03 - спереди, бордовый вариант с белым носом; 04 - две ракеты у пусковой (тот же бордовый).
# Чужие рендеры - только форма. Масштаб по прежней модели игры w_atacms: длина 4,23 м (силуэт фото 01: x 147…1751 пикс.), Ø 0,61.
# Оси: метры, нос +Y (glTF -Z), верх +Z, начало - на оси посередине длины. Рули крестом «×» (45°, -45°, -135°, 135°).
# Узлы: body (корпус, головная часть, короб, сопло), fin1…fin4 - рули: начало на оси складывания (вдоль Y у корня), в файле СЛОЖЕНЫ
#   (лежат по касательной к корпусу - как в трубе пусковой); раскрытие - поворот вокруг +Y через петлю на -90° от сложенного (fin1 - верхний правый, далее по часовой с носа).
# Запуск: Blender -b --factory-startup --python build.py   (ATA_OPEN=1 - рули раскрыты, для показа; ATA_VAR=red - бордовый вариант)
# Детали по фото: оживальная головная часть со швом, кольцевые швы хвостового отсека, донный срез с соплом и кольцом решёток, короб кабелей,
#   4 руля с обтекателями у корня и петлями, проушины. Заклёпки, лючки и надписи - в текстуре (запекание ревизии 2).
import os, math
import bpy, bmesh
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/ATACMS'
exec(compile(open(os.path.join(HERE, 'atakit.py'), encoding='utf-8').read(), os.path.join(HERE, 'atakit.py'), 'exec'))
OPEN = os.environ.get('ATA_OPEN') == '1'
S = 4.23 / (1751 - 147); XM = (1751 + 147) / 2             # метры на пиксель фото 01, середина длины
def Y(x): return (x - XM) * S                               # x пикселя фото 01 → Y модели
def R(r): return r * S
RB = R(117)                                                 # радиус корпуса 0,3086
FIN_ANG = [45.0, -45.0, -135.0, 135.0]                      # fin1…fin4 (угол от +X к +Z)
SPAN = 0.30                                                 # размах руля от петли (сложенные входят в трубу контейнера r 0,46)
RH = RB + 0.014                                             # ось складывания: над обшивкой (петля на лапке)
FIN_T = 0.022
# руль в плоскости (Y, размах): корень LE/TE, конец LE/TE (фото 01, верхний левый руль)
FIN = dict(rle=Y(398), rte=Y(205), tle=Y(232), tte=Y(152))


def scene():
    sc = bpy.data.scenes.get('ATACMS') or bpy.data.scenes.new('ATACMS')
    if bpy.context.window: bpy.context.window.scene = sc
    col = bpy.data.collections.get('ATACMS') or bpy.data.collections.new('ATACMS')
    if col.name not in sc.collection.children: sc.collection.children.link(col)
    for o in list(col.objects): bpy.data.objects.remove(o, do_unlink=True)
    return sc, col


sc, COL = scene(); make_mats()
for o in list(bpy.data.objects):
    if o.name in ('Cube', 'Light', 'Camera'): bpy.data.objects.remove(o, do_unlink=True)
HEAD_M = M_HEAD


def mk(b, pivot=(0, 0, 0), sharp=32):
    pv = Vector(pivot); bmesh.ops.translate(b.bm, verts=b.bm.verts, vec=-pv)
    o = b.finish(COL, sharp=sharp); o.location = pv; return o


def body():
    b = B('body')
    # профиль (x пикс., r пикс.) от донного среза к носу; шов головной части - x 945; кольцевые швы хвостового отсека - x 240, 398
    prof = [(200, 64), (197, 92), (198, 104), (202, 112), (210, 116.4), (216, 117), (238, 117), (240, 115.8), (243, 115.8), (245, 117),
            (395, 117), (397, 115.8), (400, 115.8), (402, 117), (943, 117), (944.5, 115.6), (946.5, 115.6), (948, 117),
            (1007, 116.3), (1067, 115), (1127, 111.3), (1187, 107.4), (1247, 102.6), (1307, 97.8), (1367, 91.2), (1427, 84), (1487, 75.4),
            (1547, 66.6), (1607, 54.4), (1647, 43.4), (1687, 29.6), (1712, 19.5), (1732, 10.5), (1745, 4.0), (1751, 0.4)]
    mats = [M_BODY if x1 <= 945 else HEAD_M for (x0, _), (x1, _) in zip(prof, prof[1:])]
    lathe(b, V(0, 0, 0), V(0, 1, 0), [(Y(x), R(r)) for x, r in prof], mats, n=48, cap0=False, cap1=True)
    # донный срез: кольцо решёток (тёмное) и сопло
    lathe(b, V(0, 0, 0), V(0, 1, 0), [(Y(200) + 0.004, R(92)), (Y(200) + 0.004, R(66)), (Y(200) + 0.014, R(66)), (Y(200) + 0.014, R(92))], M_DARK, n=48, cap0=False, cap1=False)
    lathe(b, V(0, 0, 0), V(0, 1, 0), [(Y(200), R(64)), (Y(200) + 0.01, R(60)), (Y(200) + 0.16, R(50)), (Y(200) + 0.16, 0.001)], M_DARK, n=40, cap0=False, cap1=True)
    lathe(b, V(0, 0, 0), V(0, 1, 0), [(Y(200) - 0.012, R(58)), (Y(200) + 0.02, R(54)), (Y(200) + 0.10, R(36)), (Y(200) + 0.10, R(30))], M_STEEL, n=40, cap0=False, cap1=False)   # раструб сопла внутри
    for k in range(6):                                                       # перемычки решётки
        a = 2 * math.pi * (k + 0.5) / 6; d = V(math.cos(a), 0, math.sin(a))
        b.bar(V(0, Y(200) + 0.006, 0) + d * R(65), V(0, Y(200) + 0.006, 0) + d * R(93), 0.018, 0.012, M_BODY, up=(0, 1, 0))
    # короб кабелей сверху (фото 01, 02): тёмный, задний край скошен
    z0 = RB - 0.004; z1 = RB + 0.022; w = 0.055; ya, yb = Y(362), Y(905)
    ring = lambda y, z, ww: [V(-ww, y, z0), V(ww, y, z0), V(ww * 0.85, y, z), V(-ww * 0.85, y, z)]
    b.loft([ring(ya, z0 + 0.004, w * 0.5), ring(ya + 0.06, z1, w), ring(yb - 0.01, z1, w), ring(yb, z0 + 0.006, w)], M_DARK)
    # лапки петель рулей и обтекатели у корня (фото 02)
    for a in FIN_ANG:
        ar = math.radians(a); d = V(math.cos(ar), 0, math.sin(ar)); t = V(-math.sin(ar), 0, math.cos(ar))
        for yy in (FIN['rte'] + 0.06, FIN['rle'] - 0.08):
            b.loft([[d * (RB - 0.01) + t * sx * 0.022 + V(0, yy + sy * 0.035, 0) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))],
                    [d * (RH + 0.004) + t * sx * 0.018 + V(0, yy + sy * 0.03, 0) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]], M_BODY)
        c = d * (RB + 0.012) + t * 0.075; ca = math.cos(math.radians(a + 14)); sa = math.sin(math.radians(a + 14))
        c = V(ca, 0, sa) * (RB + 0.018)
        lathe(b, c + V(0, FIN['rte'] - 0.02, 0), V(0, 1, 0), [(0, 0.004), (0.05, 0.018), (0.12, 0.024), (0.48, 0.024), (0.58, 0.012), (0.62, 0.003)], M_BODY, n=10)
    # кольца болтов на швах (фото 01, 02): шов головной части - 28, хвостовой отсек - 20, кормовая юбка - 16
    for x, n in ((945, 28), (398, 20), (240, 16)):
        for k in range(n):
            a_ = 2 * math.pi * (k + 0.5) / n; d = V(math.cos(a_), 0, math.sin(a_))
            if x == 945 or abs(math.degrees(a_) % 90 - 45) > 8:
                b.cyl(d * (RB - 0.002) + V(0, Y(x) + (0.012 if x != 945 else -0.012), 0), d * (RB + 0.006) + V(0, Y(x) + (0.012 if x != 945 else -0.012), 0), 0.009, 0.007, M_GREY if x == 945 else M_BODY, n=6)
    # круглые порты на кормовой юбке (фото 01: 4 тёмных) и лючки-панели хвостового отсека
    for a_d in (90, 0, 180, 270):
        a_ = math.radians(a_d + 22); d = V(math.cos(a_), 0, math.sin(a_))
        b.cyl(d * (RB - 0.004) + V(0, Y(222), 0), d * (RB + 0.006) + V(0, Y(222), 0), 0.026, 0.024, M_DARK, n=10)
    for a_d, x0, x1 in ((160, 410, 545), (-160, 420, 530), (20, 840, 925)):
        a_ = math.radians(a_d); d = V(math.cos(a_), 0, math.sin(a_)); t = V(-math.sin(a_), 0, math.cos(a_))
        q = [d * (RB - 0.002) + t * sw * 0.10 + V(0, Y(xx), 0) for sw, xx in ((-1, x0), (1, x0), (1, x1), (-1, x1))]
        b.loft([q, [p + d * 0.006 for p in q]], M_BODY)
        for sw, xx in ((-1, x0), (1, x0), (1, x1), (-1, x1)): b.cyl(d * RB + t * sw * 0.085 + V(0, Y(xx) + (0.012 if xx == x0 else -0.012), 0), d * (RB + 0.011) + t * sw * 0.085 + V(0, Y(xx) + (0.012 if xx == x0 else -0.012), 0), 0.006, 0.006, M_DARK, n=6)
    # хомуты короба кабелей
    for x in (420, 560, 700, 840):
        b.box((0, Y(x), RB + 0.012), (0.13, 0.02, 0.028), M_DARK)
    # проушины подвеса (сверху на хвостовом отсеке и у шва головной части)
    for x in (430, 900):
        b.box((0.09, Y(x), RB + 0.008), (0.03, 0.06, 0.02), M_STEEL); b.box((-0.09, Y(x), RB + 0.008), (0.03, 0.06, 0.02), M_STEEL)
    return mk(b)


def fin(i, a):
    """руль: строится раскрытым по радиусу a°, начало - на оси складывания; затем поворачивается в сложенное (-90° вокруг +Y)"""
    ar = math.radians(a); d = V(math.cos(ar), 0, math.sin(ar)); t = V(-math.sin(ar), 0, math.cos(ar))
    b = B(f'fin{i + 1}'); hinge = d * RH
    def sec(y_le, y_te, r):                                                  # сечение-ромб: кромки острые, середина толщиной FIN_T
        c = y_le - y_te; base = d * r
        return [base + V(0, y_le, 0), base + V(0, y_le - c * 0.25, 0) + t * FIN_T / 2, base + V(0, y_te + c * 0.25, 0) + t * FIN_T / 2,
                base + V(0, y_te, 0), base + V(0, y_te + c * 0.25, 0) - t * FIN_T / 2, base + V(0, y_le - c * 0.25, 0) - t * FIN_T / 2]
    b.loft([sec(FIN['rle'], FIN['rte'], RH - 0.002), sec(FIN['tle'], FIN['tte'], RH + SPAN)], M_BODY)
    b.cyl(hinge + V(0, FIN['rte'] + 0.03, 0), hinge + V(0, FIN['rle'] - 0.05, 0), 0.014, 0.014, M_STEEL, n=8)    # ось петли
    o = mk(b, pivot=hinge)
    o.rotation_mode = 'XYZ'
    return o


BODY = body()
FINS = [fin(i, a) for i, a in enumerate(FIN_ANG)]
FOLD = 90.0                                                                  # сложено: +90° вокруг +Y через петлю (руль ложится по касательной в сторону соседа по часовой с носа)


def pose(open_k=0.0):
    """open_k: 0 - сложено (как в файле), 1 - раскрыто"""
    for o in FINS: o.rotation_euler = (0.0, math.radians(FOLD * (1 - open_k)), 0.0)
    bpy.context.view_layer.update()


pose(1.0 if OPEN else 0.0)
print('ATA build: объектов', len(COL.objects), 'треугольников', sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in COL.objects if o.type == 'MESH'))
