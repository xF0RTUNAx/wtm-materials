# build.py — пусковая M142 HIMARS (6×6, бронекабина, поворотная пусковая с одним контейнером): своя модель по фото Mark.
# Фото (HIMARS/референсы): 01 рендер справа-сзади, пакет поднят, контейнер ATACMS (одна большая труба), рама-стрела над пакетом;
# 02 пакет почти вертикально, спереди-слева; 03 спереди-слева, пакет повёрнут на 180° и чуть поднят (кабина, люк, фары, надписи) - ГЛАВНОЕ по кабине;
# 04 сзади-слева, походное положение: торец с 6 трубами, задняя рама, фонари; 05 спереди-слева крупно (кабина, бампер, пакет поднят);
# 06 сборная модель сверху (раскладка рамы, поворотный круг).
# Масштаб - по прежней модели игры (l_hiмars.glb): длина 7,60 м (бампер - задний торец пакета), ширина 2,79 (с зеркалами), высота 3,09 в походном.
# Оси: метры, нос +Y (в glTF -Z), вверх +Z, земля Z = 0, X = 0 - ось машины, Y = 0 - середина длины.
# Части (имена - для игры, оси - в ПАСПОРТ):
#   body_*            - неподвижное (рама, кабина, мосты, ящики, основание пусковой);
#   wheel_<ось><сторона> - колёса (вращение вокруг X через центр), передние - дети steer_l / steer_r (поворот вокруг вертикали через шкворень);
#   hatch             - крышка люка в крыше (петля вдоль X у передней кромки); ant_l / ant_r - антенны (начало у основания);
#   turn              - поворотная платформа (вертикаль через T); на ней cyl_body_l/r - корпуса цилиндров подъёма (начало - нижняя опора A, ось +Y на P);
#   pod               - качающаяся часть: клетка пусковой (дети turn, петля вдоль X через H); на ней cyl_rod_l/r (начало - верхняя проушина P, ось +Y на A),
#                       boom - рама-стрела перезарядки (выдвигается вдоль оси клетки), pod_atacms / pod_gmlrs - съёмные контейнеры (игра показывает один),
#                       lid_fA / lid_rA, lid_fG0…5 / lid_rG0…5 - крышки труб спереди и сзади, muzzle_A, muzzle_G0…5 - пустышки в центре дульного среза.
# Запуск: Blender -b --factory-startup --python build.py   (HIM_STAGE: 1 - форма, 9 - всё; HIM_EL / HIM_TURN / HIM_BOOM - поза для показа, HIM_VAR atacms|gmlrs)
# Детали по фото: рама, 3 моста, колёса с гайками, бронекабина гранями, 2 лобовых окна + боковые, двери, ручки, подножки, люк, жёлтые огни на крыше,
#   2 антенны, зеркала, бампер с фарами и буксирными проушинами, жалюзи на лбу, воздухозаборник и выхлоп справа за кабиной, топливный бак,
#   ящики, крылья задней тележки, задний бампер с фонарями и брызговиками, основание и круг пусковой, щёки петли, 2 цилиндра подъёма,
#   клетка с рёбрами и рельсами, рама-стрела, контейнеры ATACMS и на 6 труб с крышками.  Пропущено: бронешторки окон (на фото не видно, что они подвижны).
import sys, os, math
import bpy, bmesh
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/HIMARS'
exec(compile(open(os.path.join(HERE, 'himkit.py'), encoding='utf-8').read(), os.path.join(HERE, 'himkit.py'), 'exec'))
STAGE = int(os.environ.get('HIM_STAGE', '9'))
P_EL = float(os.environ.get('HIM_EL', '0')); P_TURN = float(os.environ.get('HIM_TURN', '0')); P_BOOM = float(os.environ.get('HIM_BOOM', '0'))
P_VAR = os.environ.get('HIM_VAR', 'atacms')

# ───────────── размеры ─────────────
YF = 3.80                                   # передний край бампера
R_W, W_W, TRK = 0.60, 0.42, 0.97            # колесо: радиус, ширина шины, середина колеса от оси машины
AX = [2.62, -1.02, -2.42]                   # оси: передняя (управляемая), задняя тележка
KP = 0.80                                   # шкворень передних колёс (от оси машины)
RAIL_X, RAIL_Z0, RAIL_Z1 = 0.46, 0.78, 1.08 # лонжероны
Y_REAR = -3.52                              # задний край рамы
CAB_Y0 = 1.60                               # задняя стенка кабины
# кабина - горизонтальные срезы снизу вверх: (z, перёд y, полуширина, фаска переднего угла)
# бронекабина (фото 07, 08, 11, 12, 13): коробка с фасками по низу и по верху вокруг лба и бортов, лоб наклонён назад ~6°, задняя стенка прямая.
# срезы снизу вверх: (z, перёд y, полуширина); перёд между срезами 1 и 2 - плоскость лба, окна в ней под верхней фаской
# лоб: нижняя часть почти вертикальна (жалюзи, диск, таблички), верхняя - окна - наклонена назад на ~27°, вместе с большой фаской верхних углов (фото 07, 12, 14)
# сечение почти шестигранное (фото 11, 13): нижний пояс скошен внутрь на 0,30-0,32 по лбу и бортам, средний пояс вертикален, верхний с окнами наклонён
# rev 3 (фото 13 спереди, замер по сетке): лоб плоский и вертикальный до самого низа (1,32), решётки у нижнего края; шестиугольник даёт борт:
# низ борта чуть сужен (1,08), самое широкое место на 1,96-2,08, верх с окнами сужается до 0,95; под лбом короткий скошенный «подбородок»
# rev 3b (Mark): нижний скос борта повторяет верхний - тот же угол (0,21 на 0,62 по высоте), шестиугольник симметричный
CAB = [(1.22, 3.44, 0.91), (1.32, 3.66, 0.945), (1.96, 3.66, 1.16), (2.08, 3.655, 1.16), (2.70, 3.42, 0.95)]
UP0 = 3                                                                      # с этого среза начинается верхний пояс (окна)
def yf(z): return 3.66                                                       # лоб
LOBN = Vector((0.0, 1.0, 0.0))                                               # его нормаль
SUN = lambda s: Vector((s * (CAB[4][0] - CAB[3][0]), 0.0, CAB[3][2] - CAB[4][2])).normalized()   # нормаль верхнего пояса борта
SLN = lambda s: Vector((s * (CAB[2][0] - CAB[1][0]), 0.0, CAB[1][2] - CAB[2][2])).normalized()   # нормаль нижнего пояса борта
def on_sideup(s, y, z, d=0.0): t = (z - CAB[3][0]) / (CAB[4][0] - CAB[3][0]); return V(s * lerp(CAB[3][2], CAB[4][2], t), y, z) + SUN(s) * d
def on_side(s, y, z, d=0.0):                                                 # точка на нижнем поясе / вертикальной полосе борта
    hw = lerp(CAB[1][2], CAB[2][2], min(1.0, (z - CAB[1][0]) / (CAB[2][0] - CAB[1][0]))); return V(s * hw, y, z) + (SLN(s) if z < CAB[2][0] else V(s, 0, 0)) * d
WN = Vector((0.0, CAB[4][0] - CAB[3][0], CAB[3][1] - CAB[4][1])).normalized()   # нормаль оконной плоскости
def on_win(x, z, d=0.0): t = (z - CAB[3][0]) / (CAB[4][0] - CAB[3][0]); return V(x, lerp(CAB[3][1], CAB[4][1], t), z) + WN * d
def win_hw(z): t = (z - CAB[3][0]) / (CAB[4][0] - CAB[3][0]); return lerp(CAB[3][2], CAB[4][2], t)
BASE_Z0, BASE_Z1 = RAIL_Z1, 1.34            # основание пусковой на раме
# пусковая: ось поворота посередине (фото 03 - пакет развёрнут на 180°, его ближний торец сразу за кабиной; фото 04 - задний торец выступает за раму),
# петля подъёма у задней части платформы, клетка нависает за петлёй (при подъёме задний конец опускается к заднему бамперу - фото 01, 02)
T = Vector((0.0, float(os.environ.get('HIM_TY', '-1.50')), 1.38))              # ось поворота (низ платформы)
TURN_R = 1.00                               # радиус круга платформы
PLAT_TOP = T.z + 0.12                       # верх платформы
H = Vector((0.0, -3.55, 1.62))              # петля подъёма
CG = dict(y0=-4.45, y1=1.25, x=0.88, z0=1.72, z1=2.80)   # клетка в походном положении
A_CYL = [Vector((s * 0.55, -2.25, 1.59)) for s in (-1, 1)]  # нижние опоры цилиндров (на платформе)
P_CYL = [Vector((s * 0.55, -0.95, 1.63)) for s in (-1, 1)]  # верхние проушины (под днищем клетки, в походном)
CYL_BODY, CYL_ROD = 1.30, 1.28            # телескопический цилиндр: ход 1,30…2,58 м
TUBE_Z = 2.25                               # ось контейнера
G_X, G_Z = (-0.40, 0.0, 0.40), (2.04, 2.44) # 6 труб: столбцы, ряды
G_R, A_R = 0.175, 0.494                     # наружный радиус: малые трубы, труба ATACMS (в ней ракета со сложенными рулями: r 0,50 м после масштаба)
CT = dict(y0=-4.37, y1=1.20, x=0.80, z0=1.76, z1=2.74)   # контейнер внутри клетки
L_ALL = 8.15                                # длина с пакетом (бампер - задний торец клетки, нависает за раму по фото 03, 04): колесо Ø 1,17 м и кабина как у настоящей; прежняя модель игры 7,60

PIV = {}


def scene():
    sc = bpy.data.scenes.get('HIMARS') or bpy.data.scenes.new('HIMARS')
    if bpy.context.window: bpy.context.window.scene = sc
    col = bpy.data.collections.get('HIMARS') or bpy.data.collections.new('HIMARS')
    if col.name not in sc.collection.children: sc.collection.children.link(col)
    for o in list(col.objects): bpy.data.objects.remove(o, do_unlink=True)
    return sc, col


sc, COL = scene(); make_mats()
for o in list(bpy.data.objects):
    if o.name in ('Cube', 'Light', 'Camera'): bpy.data.objects.remove(o, do_unlink=True)


def mk(b, pivot=(0, 0, 0), parent=None, sharp=32):
    """объект из построителя: начало координат - в точке pivot (мировые координаты при походной позе)"""
    pv = Vector(pivot)
    bmesh.ops.translate(b.bm, verts=b.bm.verts, vec=-pv)
    o = b.finish(COL, sharp=sharp)
    o.location = pv - (PIV[parent.name] if parent else Vector())
    if parent: o.parent = parent
    PIV[o.name] = pv.copy()
    return o


def emp(name, pos, parent=None, size=0.12):
    e = bpy.data.objects.new(name, None); COL.objects.link(e); e.empty_display_size = size; pv = Vector(pos)
    e.location = pv - (PIV[parent.name] if parent else Vector())
    if parent: e.parent = parent
    PIV[name] = pv.copy(); return e


def lerp(a, b, t): return a + (b - a) * t


NZ0, NZ1, NHW, NY = 1.35, 1.59, 0.42, 3.60   # утопленная ниша с решётками внизу по центру лба (фото 11, 13): низ, верх, полуширина, задняя плоскость


def cab_ring(z, yfr, hw, yr=CAB_Y0, cf=0.05, cr=0.03, notch=False):
    yn = NY if notch else yfr
    return [V(-hw + cr, yr, z), V(-hw, yr + cr, z), V(-hw, yfr - cf, z), V(-hw + cf, yfr, z), V(-NHW, yfr, z), V(-NHW, yn, z), V(NHW, yn, z), V(NHW, yfr, z),
            V(hw - cf, yfr, z), V(hw, yfr - cf, z), V(hw, yr + cr, z), V(hw - cr, yr, z)]


def cab_lvl(z):
    i = max(k for k in range(len(CAB) - 1) if z >= CAB[k][0] or k == 0); t = (z - CAB[i][0]) / (CAB[i + 1][0] - CAB[i][0])
    return z, lerp(CAB[i][1], CAB[i + 1][1], t), lerp(CAB[i][2], CAB[i + 1][2], t)


def bolt(b, p, n, r=0.022, h=0.018):
    """болт брони: шестигранная головка по нормали n"""
    n = Vector(n).normalized(); b.cyl(Vector(p) - n * 0.004, Vector(p) + n * h, r, r * 0.85, M_BODY, n=6)


def on_lobe(x, z, d=0.0): return V(x, yf(z), z) + LOBN * d                  # точка на лбу


# ───────────── неподвижное: рама, мосты ─────────────
def chassis():
    b = B('body_frame')
    for s in (-1, 1):
        b.box((s * RAIL_X, (3.45 + Y_REAR) / 2, (RAIL_Z0 + RAIL_Z1) / 2), (0.10, 3.45 - Y_REAR, RAIL_Z1 - RAIL_Z0), M_DARK)
    for y in (3.20, 1.90, 0.40, -0.60, -1.72, -3.30):
        b.box((0, y, RAIL_Z0 + 0.12), (2 * RAIL_X, 0.10, 0.16), M_DARK)
    # мосты: балка, картер, редукторы у колёс
    for i, y in enumerate(AX):
        b.cyl(V(-0.78, y, R_W), V(0.78, y, R_W), 0.07, 0.07, M_DARK, n=10)
        lathe(b, V(0, y - 0.20, R_W), V(0, 1, 0), [(0, 0.06), (0.06, 0.20), (0.26, 0.22), (0.40, 0.12), (0.46, 0.05)], M_DARK, n=14)
        for s in (-1, 1):
            b.cyl(V(s * 0.70, y, R_W), V(s * 0.78, y, R_W), 0.16, 0.16, M_DARK, n=14)
            if i == 0:                                                   # передняя рессора и амортизатор
                b.box((s * RAIL_X, y, R_W + 0.20), (0.09, 1.40, 0.10), M_DARK)
                b.cyl(V(s * 0.62, y + 0.25, R_W + 0.05), V(s * 0.55, y + 0.12, RAIL_Z1 - 0.05), 0.04, 0.04, M_STEEL, n=8)
    for s in (-1, 1):                                                    # балансир задней тележки
        b.box((s * 0.66, (AX[1] + AX[2]) / 2, R_W + 0.10), (0.12, AX[1] - AX[2] + 0.30, 0.16), M_DARK)
        b.box((s * 0.66, (AX[1] + AX[2]) / 2, R_W + 0.30), (0.20, 0.30, 0.30), M_DARK)
        for y in AX[1:]:
            b.cyl(V(s * 0.66, y, R_W + 0.10), V(s * 0.50, y + (0.35 if y == AX[1] else -0.35), RAIL_Z0 + 0.04), 0.035, 0.035, M_STEEL, n=8)
    # передний бампер (фото 07, 11, 12): коробка, по краям утопленные гнёзда фар (жёлтая снаружи, белая внутри), две скобы-серьги, внизу плита с прорезями
    bw = 1.18; yb0, yb1 = YF - 0.26, YF; zb0, zb1 = 0.70, 1.06
    b.loft([[V(-bw, yb0, zb0), V(bw, yb0, zb0), V(bw, yb0, zb1), V(-bw, yb0, zb1)], [V(-bw, yb1 - 0.03, zb0), V(bw, yb1 - 0.03, zb0), V(bw, yb1 - 0.03, zb1), V(-bw, yb1 - 0.03, zb1)],
            [V(-bw + 0.02, yb1, zb0 + 0.02), V(bw - 0.02, yb1, zb0 + 0.02), V(bw - 0.02, yb1, zb1 - 0.02), V(-bw + 0.02, yb1, zb1 - 0.02)]], M_BODY)
    b.box((0, yb1 - 0.12, zb1 + 0.02), (2 * bw - 0.1, 0.20, 0.04), M_BODY)                              # полка
    for s in (-1, 1):
        b.box((s * 0.93, yb1 + 0.002, 0.88), (0.44, 0.012, 0.22), M_BLACK)                               # гнездо фар
        for xx, rr, m in ((1.04, 0.058, M_LAMP), (0.84, 0.078, M_WHITE)):
            lathe(b, V(s * xx, yb1 - 0.03, 0.88), V(0, 1, 0), [(0, rr + 0.025), (0.045, rr + 0.025), (0.045, rr), (0.05, rr * 0.75), (0.056, 0.001)], [M_BLACK, M_BLACK, m, m], n=16)
        x = s * 0.44                                                                                         # скоба-серьга на проушине
        b.box((x, yb1 + 0.03, 0.92), (0.16, 0.06, 0.16), M_BODY)
        tube_path(b, [V(x - 0.06, yb1 + 0.07, 0.93), V(x - 0.065, yb1 + 0.11, 0.84), V(x, yb1 + 0.12, 0.79), V(x + 0.065, yb1 + 0.11, 0.84), V(x + 0.06, yb1 + 0.07, 0.93)], 0.022, M_STEEL, n=8)
        b.cyl(V(x - 0.09, yb1 + 0.07, 0.93), V(x + 0.09, yb1 + 0.07, 0.93), 0.025, 0.025, M_STEEL, n=8)
        for zz in (0.78, 0.98): bolt(b, V(s * 0.66, yb1, zz), V(0, 1, 0), r=0.02)
    b.loft([[V(-1.0, yb1 - 0.06, zb0), V(1.0, yb1 - 0.06, zb0)], [V(-0.92, yb1 - 0.38, 0.48), V(0.92, yb1 - 0.38, 0.48)]], M_BODY, cap0=False, cap1=False, closed=False)   # нижняя плита
    for k in range(5): b.box((0, yb1 - 0.12 - 0.05 * k, zb0 - 0.04 - 0.04 * k), (1.30, 0.025, 0.012), M_DARK)
    b.box((0, YF - 0.46, 1.10), (1.44, 0.30, 0.22), M_DARK)                                                  # ниша радиатора под «подбородком»
    # подножки под дверями, крылья передних колёс
    return mk(b)


# ───────────── кабина ─────────────
def cab():
    b = B('body_cab'); HW = CAB[2][2]; zr = CAB[-1][0]
    lv = [(CAB[0], 0), (CAB[1], 0), (cab_lvl(NZ0), 0), (cab_lvl(NZ0), 1), (cab_lvl(NZ1), 1), (cab_lvl(NZ1), 0)] + [(c, 0) for c in CAB[2:]]
    b.loft([cab_ring(z, y, hw, notch=bool(n)) for (z, y, hw), n in lv], M_BODY)
    # в нише у нижнего края лба (фото 13: 0,83 × 0,24 м): две решётки (тёмный фон, светлые планки), над ними козырёк лба
    for x0, x1 in ((-NHW + 0.03, -0.015), (0.015, NHW - 0.03)):
        b.box(((x0 + x1) / 2, NY + 0.006, (NZ0 + NZ1) / 2), (x1 - x0, 0.012, NZ1 - NZ0 - 0.04), M_DARK)
        for k in range(5):
            b.box(((x0 + x1) / 2, NY + 0.018, NZ0 + 0.04 + 0.04 * k), (x1 - x0 - 0.02, 0.014, 0.014), M_BODY)
        for xx in (x0, x1): b.box((xx, NY + 0.02, (NZ0 + NZ1) / 2), (0.025, 0.03, NZ1 - NZ0 - 0.02), M_BODY)
    # обшивка-накладки: лобовая плита с вырезом под нишу и бортовые плиты нижнего пояса, на 12 мм толще корпуса (фото 11: плиты брони на болтах)
    zl0, zl1 = CAB[1][0] + 0.03, CAB[3][0] - 0.03
    hz = lambda z: on_side(1, 0, z).x - 0.10                                 # край плиты вдоль скоса борта
    for s_ in (-1, 1):
        q = [on_lobe(s_ * (NHW + 0.04), zl0), on_lobe(s_ * hz(zl0), zl0), on_lobe(s_ * hz(CAB[2][0]), CAB[2][0]), on_lobe(s_ * hz(zl1), zl1), on_lobe(s_ * (NHW + 0.04), zl1)]
        if s_ < 0: q = q[::-1]
        b.loft([[p - LOBN * 0.01 for p in q], [p + LOBN * 0.012 for p in q]], M_BODY)
    q = [on_lobe(-NHW - 0.04, NZ1 + 0.04), on_lobe(NHW + 0.04, NZ1 + 0.04), on_lobe(NHW + 0.04, zl1), on_lobe(-NHW - 0.04, zl1)]
    b.loft([[p - LOBN * 0.01 for p in q], [p + LOBN * 0.012 for p in q]], M_BODY)
    for s_ in (-1, 1):
        q = [on_side(s_, CAB_Y0 + 0.04, zl0), on_side(s_, yf(zl0) - 0.08, zl0), on_side(s_, yf(zl1) - 0.08, zl1), on_side(s_, CAB_Y0 + 0.04, zl1)]
        nn = [SLN(s_), SLN(s_), V(s_, 0, 0), V(s_, 0, 0)]
        b.loft([[p - n * 0.01 for p, n in zip(q, nn)], [p + n * 0.012 for p, n in zip(q, nn)]], M_BODY)
    # лобовые окна: прямоугольные, в утопленных рамах (фото 13: низ окон на 2,22, верх на 2,46)
    zA, zB = 2.22, 2.47
    for s_ in (-1, 1):
        o0 = o1 = 0.70
        pl = [on_win(s_ * 0.06, zA - 0.035, 0), on_win(s_ * (o0 + 0.12), zA - 0.035, 0), on_win(s_ * (o1 + 0.12), zB + 0.035, 0), on_win(s_ * 0.06, zB + 0.035, 0)]
        b.loft([[p - WN * 0.01 for p in pl], [p + WN * 0.014 for p in pl]], M_BODY)
        cs = [on_win(s_ * 0.13, zA, 0.014), on_win(s_ * o0, zA, 0.014), on_win(s_ * o1, zB, 0.014), on_win(s_ * 0.13, zB, 0.014)]
        if s_ < 0: cs = cs[::-1]
        framed_glass(b, cs, WN, rim=0.06, depth=0.04)
        for xx, zz in ((0.09, zA - 0.018), (o0 + 0.08, zA - 0.018), (o1 + 0.08, zB + 0.018), (0.09, zB + 0.018), ((o0 + 0.13) / 2, zA - 0.018), ((o1 + 0.13) / 2, zB + 0.018)):
            bolt(b, on_win(s_ * xx, zz, 0.014), WN, r=0.018)
        p0 = on_win(s_ * 0.50, zB + 0.012, 0.03)                               # дворник: ось над окном, щётка вниз-вбок (фото 11, 13)
        b.cyl(p0 - WN * 0.02, p0 + WN * 0.02, 0.016, 0.016, M_BLACK, n=8)
        b.bar(p0, on_win(s_ * 0.30, zA + 0.06, 0.04), 0.013, 0.010, M_BLACK, up=WN)
        b.bar(on_win(s_ * 0.37, zA + 0.03, 0.045), on_win(s_ * 0.22, zA + 0.20, 0.045), 0.015, 0.012, M_BLACK, up=WN)
    for xx, zz in ((-0.80, 2.30), (0.80, 2.30), (-0.86, 2.14), (0.86, 2.14)):   # болты верхнего пояса у окон
        bolt(b, on_win(xx, zz, 0.012), WN)
    # болты лобовой плиты (фото 13: ряды на 2,00, 1,80, 1,50)
    for zz, xs in ((2.00, (-1.02, -0.62, 0.62, 1.02)), (1.80, (-0.84, -0.42, 0.0, 0.42, 0.84)), (1.50, (-0.84, 0.84)), (1.62, (-0.62, 0.62))):
        for xx in xs:
            if (V(xx, 0, zz) - V(-0.62, 0, 1.46)).length < 0.18: continue
            bolt(b, on_lobe(xx, zz, 0.012), LOBN)
    for xx in (-0.03, 0.10): b.box((xx, yf(2.10) + 0.03, 2.08), (0.05, 0.04, 0.06), M_BODY)   # две скобы под окнами (фото 13)
    # крышка-диск справа от ниши, на её высоте (фото 11, 13); таблички
    c = on_lobe(-0.62, 1.46, 0.012)
    lathe(b, c, LOBN, [(0, 0.12), (0.012, 0.12), (0.02, 0.105), (0.02, 0.001)], M_BODY, n=24)
    for k in range(6): a_ = 2 * math.pi * k / 6; bolt(b, c + LOBN * 0.02 + V(math.cos(a_) * 0.08, 0, math.sin(a_) * 0.08), LOBN, r=0.012, h=0.01)
    plate(b, on_lobe(0.62, 1.70, 0.012), LOBN, 0.30, 0.05, M_WHITE, t=0.008)      # таблички (свои надписи - в текстуре)
    plate(b, on_lobe(0.72, 1.46, 0.012), LOBN, 0.16, 0.05, M_WHITE, t=0.008)
    # «подбородок» под лбом с прорезями
    for t in (0.35, 0.70):
        z = lerp(CAB[0][0], CAB[1][0], t); y = lerp(CAB[0][1], CAB[1][1], t)
        b.box((0, y + 0.004, z), (1.10, 0.012, 0.018), M_DARK)
    # борта: дверь (стыки, петли, ручка) на нижнем поясе, окно двери в верхнем поясе, болты, поручни
    for s_ in (-1, 1):
        for yy in (2.38, 3.48): b.bar(on_side(s_, yy, 1.40, 0.004), on_side(s_, yy, 2.06, 0.004), 0.016, 0.008, M_DARK, up=SLN(s_))   # стыки двери
        b.bar(on_side(s_, 2.38, 1.40, 0.004), on_side(s_, 3.48, 1.40, 0.004), 0.016, 0.008, M_DARK, up=SLN(s_))
        cs = [on_sideup(s_, 3.30, 2.22, 0.004), on_sideup(s_, 2.98, 2.22, 0.004), on_sideup(s_, 2.98, 2.52, 0.004), on_sideup(s_, 3.30, 2.52, 0.004)]   # окно двери (фото 11)
        if s_ < 0: cs = cs[::-1]
        framed_glass(b, cs, SUN(s_), rim=0.05, depth=0.04)
        for yy in (2.38, 3.48): b.bar(on_sideup(s_, yy, 2.10, 0.004), on_sideup(s_, yy, 2.66, 0.004), 0.016, 0.008, M_DARK, up=SUN(s_))
        for zz in (1.55, 1.92): b.beam([on_side(s_, 3.43, zz, 0.0), on_side(s_, 3.51, zz, 0.0)], V(0, 0, 1), 0.14, 0.10, M_DARK)   # петли спереди
        hp = on_side(s_, 2.48, 1.80, 0.02); b.box(hp, (0.05, 0.18, 0.04), M_STEEL); b.box(hp - V(s_ * 0.01, 0, 0), (0.02, 0.06, 0.10), M_DARK)   # ручка
        for zz in (1.45, 1.70, 1.95):
            for yy in (1.72, 2.05, 2.62, 3.20):
                bolt(b, on_side(s_, yy, zz, 0.012), SLN(s_) if zz < CAB[2][0] else V(s_, 0, 0))
        tube_path(b, [on_side(s_, 2.30, 1.45, 0.05), on_side(s_, 2.30, 1.52, 0.07), on_side(s_, 2.30, 1.98, 0.07), on_side(s_, 2.30, 2.04, 0.05)], 0.017, M_BLACK, n=6)   # поручень за дверью
        # поручни на верхних передних углах (фото 07, 11: проволочная рамка)
        tube_path(b, [V(s_ * 0.25, CAB[4][1] - 0.03, zr + 0.04), V(s_ * 0.82, CAB[4][1] - 0.03, zr + 0.04), V(s_ * 1.20, CAB[3][1] - 0.04, CAB[3][0] + 0.03), on_side(s_, CAB[3][1] - 0.12, 1.75, 0.06)], 0.014, M_BLACK, n=6)
    # крыша: кольцо люка, огни по переднему краю, основания антенн, лючок
    lathe(b, V(-0.30, 2.72, zr - 0.01), V(0, 0, 1), [(0, 0.40), (0.07, 0.40), (0.08, 0.38), (0.08, 0.33), (0.0, 0.33)], M_BODY, n=32, cap0=False, cap1=False)
    lathe(b, V(-0.30, 2.72, zr + 0.002), V(0, 0, 1), [(0, 0.33), (0.002, 0.001)], M_DARK, n=32, cap0=False, cap1=False)
    for k, xx in enumerate((-0.74, -0.60, -0.06, 0.08, 0.54, 0.68)):
        b.box((xx, CAB[-1][1] + 0.02, CAB[-1][0] - 0.03), (0.10, 0.06, 0.06), M_BLACK)
        b.box((xx, CAB[-1][1] + 0.052, CAB[-1][0] - 0.03), (0.08, 0.008, 0.04), M_LAMP)
    for s_ in (-1, 1): b.box((s_ * 0.85, 1.78, zr + 0.04), (0.22, 0.18, 0.08), M_BODY)               # основания антенн (задние углы крыши, вне хода стрелы)
    b.box((0.45, 2.30, zr + 0.02), (0.50, 0.50, 0.04), M_BODY)                                       # лючок вентиляции
    for k in range(4): b.box((0.45, 2.12 + 0.12 * k, zr + 0.045), (0.42, 0.03, 0.012), M_DARK)
    # задняя стенка: накладка, окошко
    b.box((0.0, CAB_Y0 - 0.012, 1.95), (2.0, 0.024, 1.0), M_BODY)
    cs = [V(-0.25, CAB_Y0 - 0.025, 2.15), V(0.25, CAB_Y0 - 0.025, 2.15), V(0.25, CAB_Y0 - 0.025, 2.40), V(-0.25, CAB_Y0 - 0.025, 2.40)]
    framed_glass(b, cs, V(0, -1, 0), rim=0.04)
    # подножки за передним колесом
    for s_ in (-1, 1):
        for zz in (0.62, 0.96):
            b.box((s_ * 1.02, 1.82, zz), (0.24, 0.36, 0.03), M_DARK)
        for yy in (1.66, 1.98): b.box((s_ * 1.02, yy, 0.86), (0.24, 0.025, 0.56), M_DARK)
    return mk(b)


def hatch():
    """крышка люка в кольце на крыше: петля у переднего края, открывается вперёд-вверх (фото 03, 13)"""
    b = B('hatch'); zr = CAB[-1][0]; c = V(-0.30, 2.72, zr + 0.085); hy = c.y + 0.34
    lathe(b, c, V(0, 0, 1), [(0, 0.345), (0.03, 0.345), (0.045, 0.32), (0.05, 0.001)], M_BODY, n=32)
    b.box((c.x, c.y - 0.05, c.z + 0.06), (0.10, 0.36, 0.025), M_STEEL)          # ручка
    for s in (-1, 1): b.cyl(V(c.x + s * 0.18, hy, c.z + 0.02), V(c.x + s * 0.08, hy, c.z + 0.02), 0.03, 0.03, M_STEEL, n=8)
    b.box((c.x, hy - 0.03, c.z + 0.02), (0.36, 0.06, 0.03), M_BODY)
    return mk(b, pivot=V(c.x, hy, c.z + 0.02))


def antennas():
    out = []
    for s, nm in ((-1, 'ant_l'), (1, 'ant_r')):
        b = B(nm); p0 = V(s * 0.85, 1.78, CAB[-1][0] + 0.08)
        b.cyl(p0, p0 + V(0, 0, 0.14), 0.05, 0.04, M_BLACK, n=10)
        d = V(0, math.cos(math.radians(35)), math.sin(math.radians(35)))          # привязаны вперёд-вверх (фото 02)
        b.cyl(p0 + V(0, 0, 0.14), p0 + V(0, 0, 0.14) + d * 1.50, 0.012, 0.006, M_BLACK, n=6)
        out.append(mk(b, pivot=p0))
    return out


# ───────────── за кабиной, ящики, тележка, корма ─────────────
def equipment():
    b = B('body_equip')
    # справа за кабиной: воздухозаборник и выхлоп (фото 05)
    # воздухозаборник у левого заднего угла кабины (фото 08, 11): труба вверх до крыши, сверху колпак козырьком вперёд; вне круга клетки при повороте
    lathe(b, V(-1.22, 1.47, 1.20), V(0, 0, 1), [(0, 0.10), (1.22, 0.10), (1.24, 0.12), (1.28, 0.12)], M_DARK, n=16)
    b.loft([[V(-1.36, 1.38, 2.46), V(-1.08, 1.38, 2.46), V(-1.08, 1.58, 2.46), V(-1.36, 1.58, 2.46)], [V(-1.36, 1.38, 2.70), V(-1.08, 1.38, 2.70), V(-1.08, 1.56, 2.65), V(-1.36, 1.56, 2.65)]], M_BLACK)
    b.box((-1.22, 1.585, 2.54), (0.24, 0.02, 0.14), M_DARK)
    for zz in (1.45, 2.05): b.box((-1.18, 1.53, zz), (0.10, 0.10, 0.05), M_DARK)
    b.cyl(V(1.05, 1.53, 1.10), V(1.05, 1.53, 2.55), 0.055, 0.055, M_DARK, n=10)
    # справа - топливный бак D-образный со ступенькой и хомутами (фото 09), слева - аккумуляторный ящик с ручками и крышкой (фото 08)
    tk = [V(0.62, 0, 0.42), V(1.12, 0, 0.42), V(1.16, 0, 0.48), V(1.16, 0, 0.98), V(1.12, 0, 1.02), V(0.62, 0, 1.02)]
    b.loft([[p + V(0, 1.28, 0) for p in tk], [p + V(0, 0.02, 0) for p in tk]], M_BODY)
    for yy in (1.10, 0.20): b.box((0.90, yy, 0.72), (0.58, 0.04, 0.64), M_DARK)
    b.box((1.17, 0.65, 0.98), (0.03, 0.70, 0.04), M_STEEL); lathe(b, V(0.95, 0.90, 1.02), V(0, 0, 1), [(0, 0.06), (0.03, 0.06), (0.04, 0.05), (0.04, 0.001)], M_DARK, n=12)
    b.box((-0.90, 0.70, 0.72), (0.52, 1.10, 0.58), M_DARK)
    b.box((-0.90, 0.70, 1.02), (0.56, 1.14, 0.03), M_BODY)
    for yy in (0.40, 1.00): b.box((-1.17, yy, 0.82), (0.03, 0.14, 0.04), M_STEEL)
    for k in range(4): b.box((-1.162, 0.28 + 0.28 * k, 0.70), (0.006, 0.02, 0.40), M_BODY)
    for s in (-1, 1): b.cyl(V(s * 0.70, -0.05, 0.62), V(s * 0.70, -0.55, 0.62), 0.11, 0.11, M_DARK, n=12)
    # ящики между кабиной и пусковой (ниже клетки: верх ≤ 1,64 - пакет проходит над ними при повороте)
    b.box((-0.72, 1.28, 1.36), (0.80, 0.52, 0.56), M_BODY)                 # (дальше 2,5 м от оси поворота: хвост платформы проходит мимо)
    b.box((0.30, 1.30, 1.32), (0.62, 0.48, 0.48), M_BODY)
    for xx, zz in ((-0.72, 1.645), (0.30, 1.565)): b.box((xx, 1.28, zz), (0.06, 0.3, 0.03), M_STEEL)
    for k in range(3): b.box((-1.125, 1.10 + 0.17 * k, 1.36), (0.012, 0.12, 0.40), M_DARK)
    # крылья задней тележки (плоский настил над колёсами) и брызговики
    for s in (-1, 1):
        b.box((s * TRK, (AX[1] + AX[2]) / 2, R_W + 0.72), (W_W + 0.16, AX[1] - AX[2] + 1.45, 0.04), M_BODY)
        b.box((s * (TRK + W_W / 2 + 0.06), (AX[1] + AX[2]) / 2, R_W + 0.62), (0.03, AX[1] - AX[2] + 1.45, 0.22), M_BODY)
        b.box((s * TRK, AX[2] - R_W - 0.18, R_W + 0.20), (W_W + 0.06, 0.02, 0.70), M_RUBBER)
        b.box((s * TRK, AX[1] - R_W - 0.10, R_W + 0.30), (W_W + 0.06, 0.02, 0.45), M_RUBBER)
    # задний бампер, фонари, крюк
    b.box((0, Y_REAR - 0.06, 0.88), (2.30, 0.14, 0.24), M_BODY)
    for s in (-1, 1):                                                        # короба задних фонарей по углам (фото 04)
        b.box((s * 0.90, Y_REAR - 0.08, 1.05), (0.42, 0.22, 0.34), M_BODY)
        b.box((s * 0.90, Y_REAR - 0.195, 1.05), (0.36, 0.01, 0.26), M_BLACK)
        for k, (m, zz) in enumerate(((M_RED, 1.10), (M_RED, 0.99), (M_LAMP, 1.10), (M_WHITE, 0.99))):
            lathe(b, V(s * (0.80 + 0.17 * (k // 2)), Y_REAR - 0.20, zz), V(0, -1, 0), [(0, 0.045), (0.02, 0.045), (0.025, 0.001)], m, n=12)
        b.box((s * 0.55, Y_REAR - 0.10, 0.70), (0.10, 0.12, 0.20), M_DARK)
    b.cyl(V(0, Y_REAR - 0.12, 0.84), V(0, Y_REAR - 0.30, 0.84), 0.06, 0.05, M_DARK, n=10)
    return mk(b)


def wheels():
    out = {}
    for i, y in enumerate(AX):
        for s, sd in ((-1, 'l'), (1, 'r')):
            par = None
            if i == 0:
                st = emp('steer_' + sd, V(s * KP, y, R_W)); par = st
            b = B(f'wheel_{i + 1}{sd}'); wheel(b, (s * TRK, y, R_W), R_W - 0.025, W_W, s); tread(b, (s * TRK, y, R_W), R_W - 0.025, W_W, s)
            out[(i, s)] = mk(b, pivot=V(s * TRK, y, R_W), parent=par)
    return out


# ───────────── пусковая: parts_llm.py ─────────────
_pl = os.path.join(HERE, 'parts_llm.py'); exec(compile(open(_pl, encoding='utf-8').read(), _pl, 'exec'))


# ───────────── сборка ─────────────
chassis(); cab(); equipment(); base()
W = wheels(); HATCH = hatch(); ANT = antennas()
TURN = turn_part(); POD = cage(TURN); BOOM = boom(POD)
CON = {v: container(POD, v) for v in ('atacms', 'gmlrs')}
CYL = cylinders(TURN, POD)
bpy.context.view_layer.update()


def scale_all():
    """масштаб к длине игры L_ALL (бампер - задний торец клетки в походном): сетки и положения всех узлов"""
    ys = []
    for o in COL.objects:
        if o.type == 'MESH' and not o.name.startswith('ant_'): ys += [(o.matrix_world @ v.co).y for v in o.data.vertices]
    k = L_ALL / (max(ys) - min(ys))
    for me in {o.data for o in COL.objects if o.type == 'MESH'}:
        for v in me.vertices: v.co *= k
    for o in COL.objects: o.location *= k; o.empty_display_size *= k if o.type == 'EMPTY' else 1
    for n in PIV: PIV[n] *= k
    bpy.context.view_layer.update(); return k


SCALE = scale_all()
REST = {o.name: o.matrix_basis.copy() for o in COL.objects}


def aim(o, target):
    """+Y объекта - на мировую точку target (начало объекта остаётся на месте)"""
    bpy.context.view_layer.update()
    pw = o.matrix_world.translation.copy(); d = (Vector(target) - pw).normalized()
    q = d.to_track_quat('Y', 'Z'); o.matrix_world = Matrix.Translation(pw) @ q.to_matrix().to_4x4()


def pose(el=0.0, turn=0.0, boom_d=0.0, var=None, hatch_a=0.0):
    """el - подъём клетки, ° (0 - походное); turn - поворот платформы, ° (+ против часовой сверху); boom_d - выдвижение стрелы, м; var - какой контейнер видно"""
    for o in COL.objects: o.matrix_basis = REST[o.name].copy()
    TURN.rotation_euler = (0, 0, math.radians(turn)); POD.rotation_euler = (math.radians(el), 0, 0)
    BOOM.location = REST['boom'].translation + V(0, boom_d, 0)
    HATCH.rotation_euler = (math.radians(hatch_a), 0, 0)
    bpy.context.view_layer.update()
    for s in (0, 1):
        body, rod = CYL[2 * s], CYL[2 * s + 1]
        aim(body, rod.matrix_world.translation); aim(rod, body.matrix_world.translation)
    if var:
        for v, (o, lids) in CON.items():
            show = v == var
            for q in [o] + list(o.children_recursive): q.hide_render = q.hide_viewport = not show
    bpy.context.view_layer.update()


pose(0.0, 0.0, 0.0)
if STAGE < 9 or os.environ.get('HIM_EL') or os.environ.get('HIM_TURN'):
    pose(P_EL, P_TURN, P_BOOM, P_VAR, float(os.environ.get('HIM_HATCH', '0')))
print('HIM build: масштаб %.4f' % SCALE, 'объектов', len(COL.objects), 'треугольников', sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in COL.objects if o.type == 'MESH'))
