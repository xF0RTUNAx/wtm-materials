# build.py — M752 (самоходная пусковая установка ракеты MGM-52 Lance), ревизия 2 (2026-10-25): своя модель по картинкам Mark (Свои/M752/): 1 — пуск (ракета поднята), 2 — белая ракета и M752 сбоку-спереди, 3 — M752 сзади-слева (White Sands: высокая кабина слева, ребристые борта, трап),
# 4 — ч/б снимок прицепной пусковой (только ракета), 5 — рисунок (закрытый задний борт), 6 — NL-музей спереди-справа (лобовой лист: скошенные углы, фары в нишах, откидной щит-«trim vane», номерные планки, буксирные проушины, катки), 7 — бельгийская M752 сбоку сверху
# (отсек из шести панелей с рёбрами через 0,5 м и J-крюками, чёрная юбка с D-кольцами, пять катков с венцом из десяти гаек, ленивец со спицами, длинная передняя часть с крышей: люк, решётка, патрубок, зеркало).
# Размеры — m752_const.py (масштаб: колесо Ø 0,61 м); нос +Y, земля Z = 0, X = 0 — ось машины.
# Запуск (фоновый Blender): M752_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# В отдельном окне Blender «для показа»: M752_STAGE=1…5 — этапы (1 ходовая и нижний корпус, 2 борта, перед и кабина, 3 корма и трап, 4 стрела подъёма с сёдлами, 5 фурнитура), M752_POSE=travel|ramp|active — поза частей (трап, стрела).
# Части для игры по первому слову имени: body_* (неподвижно), ramp_in / ramp_out / ramp_hw (трап: ось петли — m752_const.RAMP_H), erect_boom / erect_hw (стрела с сёдлами: ось петли — BOOM_H). Начало каждой подвижной части — на её оси петли.
#
# СПИСОК ДЕТАЛЕЙ (сделано / пропущено):
#  + гусеницы со звеньями (плита, два гребня, концевые соединители с пальцами), пять катков (шина, плоский диск с кромкой, ступица вровень с венцом из десяти гаек), ленивец со спицами, звёздочка с зубьями
#  + нижний корпус и чёрная юбка со скруглёнными концами, верхней полкой и D-кольцами (фото 6, 7)
#  + отсек: борта с рёбрами через 0,5 м, J-крюки по верху панелей, нижняя рейка, верхняя «губа», скошенные задние «уши» (до нижнего корпуса), пол с рельсами, внутренние рёбра
#  + передняя часть (loft): скошенные углы, фары в круглых нишах с проволочным ограждением, откидной щит с катаной кромкой и ручками, нижний лобовой лист, буксирные проушины (фото 6)
#  + кабина — узкая коробка над левой половиной крыши (окна спереди и по бокам, дверь, зеркало, дворники, антенна); на правой половине — люк, патрубок с кольцом, решётка-жалюзи, зеркало на стойке (фото 3, 6, 7)
#  + корма: балка, кронштейны оси стрелы, косынки, фонари, трап из двух плит (закрыт под уклоном назад, раскрыт — лежит назад и вниз), стрела с тремя сёдлами и ремнём
#  − пропущено: внутренности отсека (пружины), мелкая арматура гусениц, надписи (номерные планки — в текстуре)
import sys, os, importlib, math
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
import bpy, bmesh
import random
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
import modelkit as mk
importlib.reload(mk)

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/M752'
sys.path.insert(0, HERE)
import m752_const as C
importlib.reload(C)
STAGE = int(os.environ.get('M752_STAGE', '9'))
POSE = os.environ.get('M752_POSE', 'travel')
RNG = random.Random(752)
S = 1.0; G = 0.0; X0 = 0.0; WT = 0.0

PFX = 'M752'
M_BODY, M_SKIRT, M_DARK, M_STEEL, M_RED = 0, 1, 2, 3, 4
M_TR1, M_TR2, M_TR3 = 5, 6, 7                      # материалы звеньев гусеницы (плоские, без развёртки)
M_WHL = 8                                          # серо-зелёная краска дисков катков (без камуфляжа)
M_BODY2, M_GLASS, M_RUST = M_BODY, M_DARK, M_STEEL
mk.configure('M752', 1.0, x0=0.0, yc=0.0, rb=1.0, nseg=24, nose='left')
_SPEC = [(f'{PFX}_body', (0.070, 0.085, 0.045), 0.90, 0.0),       # оливковая заводская краска
         (f'{PFX}_skirt', (0.020, 0.024, 0.034), 0.92, 0.0),      # чёрная юбка над гусеницами
         (f'{PFX}_dark', (0.030, 0.030, 0.032), 0.96, 0.0),       # резина, стёкла, внутренности
         (f'{PFX}_steel', (0.13, 0.125, 0.115), 0.62, 0.40),      # металл: ступицы, штоки, пальцы
         (f'{PFX}_red', (0.34, 0.025, 0.020), 0.60, 0.0),         # красные фонари
         (f'{PFX}_tread1', (0.034, 0.026, 0.020), 0.95, 0.0),     # звенья гусеницы: грязь
         (f'{PFX}_tread2', (0.100, 0.052, 0.030), 0.82, 0.25),    # звенья: ржавая сталь соединителей (фото 6: рыже-коричневые)
         (f'{PFX}_tread3', (0.017, 0.016, 0.015), 0.95, 0.0),     # звенья: тёмная грязь
         (f'{PFX}_wheel', (0.064, 0.072, 0.058), 0.88, 0.0)]      # диски катков
mk.set_materials([(n, c) for n, c, _, _ in _SPEC])
for _m, (_n, _c, _r, _mt) in zip(mk.MATS, _SPEC):
    _b = next(n for n in _m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    _b.inputs['Roughness'].default_value = _r; _b.inputs['Metallic'].default_value = _mt
    try: _b.inputs['Specular IOR Level'].default_value = 0.15
    except Exception: pass

exec(compile(open('/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/_инструменты/unit_bricks.py', encoding='utf-8').read(), 'unit_bricks.py', 'exec'), globals())


def _paint(): return M_BODY if RNG.random() < 0.8 else M_STEEL     # окраска фурнитуры (unit_bricks): в основном краска, часть деталей — голый металл


@piece
def prism_yz(b, poly, x0, x1, mat):
    """Контур вида сбоку [(Y, Z)] в метрах — призма поперёк машины от X = x0 до X = x1."""
    r0 = [V(x0, y, z) for y, z in poly]; r1 = [V(x1, y, z) for y, z in poly]
    b.loft([r0, r1], mat, cap0=mat, cap1=mat)


@piece
def revolve_m(b, c, n, prof, mats, nseg=24):
    """Тело вращения с материалом по участкам: prof — [(h вдоль оси, r)], mats — материал каждой полосы (на одну меньше, чем точек); торцы закрыты."""
    c = Vector(c); n = Vector(n).normalized(); u, w = _basis(n)
    ang = [2 * math.pi * k / nseg for k in range(nseg)]
    b.loft([[c + n * h + u * (max(r, 1e-4) * math.cos(t)) + w * (max(r, 1e-4) * math.sin(t)) for t in ang] for h, r in prof], mats, cap0=mats[0], cap1=mats[-1])


@piece
def arc_plate(b, yc, zc, r0, r1, a0, a1, x0, x1, mat, n=16):
    """Изогнутый лист (крыло гусеницы): дуга вокруг оси (Y = yc, Z = zc) от угла a0 до a1 (градусы, от +Y к +Z), радиусы r0…r1, ширина от X = x0 до X = x1."""
    rings = []
    for k in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * k / n); c_, s_ = math.cos(a), math.sin(a)
        rings.append([V(x0, yc + r0 * c_, zc + r0 * s_), V(x1, yc + r0 * c_, zc + r0 * s_), V(x1, yc + r1 * c_, zc + r1 * s_), V(x0, yc + r1 * c_, zc + r1 * s_)])
    b.loft(rings, mat, cap0=mat, cap1=mat)


HULL_X = 1.30
# ───────────── ходовая (фото 6, 7) ─────────────
def track_poly():
    cz = C.TRK_ZC; pts = []
    for a in range(-90, 91, 15): pts.append((C.TRK_Y_F + C.TRK_R * math.cos(math.radians(a)), cz + C.TRK_R * math.sin(math.radians(a))))
    for a in range(90, 271, 15): pts.append((C.TRK_Y_R + C.TRK_R * math.cos(math.radians(a)), cz + C.TRK_R * math.sin(math.radians(a))))
    return pts


# каток: тонкая светлая кромка диска, плоское блюдце, ступица вровень с кромкой, венец из десяти гаек (фото 7)
ROAD_WHEEL = [(0.000, 0.200), (0.018, 0.285), (0.048, 0.310), (0.232, 0.310), (0.262, 0.295), (0.274, 0.255),                     # шина
              (0.266, 0.240), (0.256, 0.226), (0.246, 0.205), (0.240, 0.165), (0.238, 0.130),                                    # кромка и неглубокое блюдце диска
              (0.246, 0.118), (0.264, 0.112), (0.272, 0.094), (0.272, 0.045)]                                                    # ступица
ROAD_WHEEL_M = [M_DARK] * 5 + [M_WHL] * 5 + [M_STEEL] * 4


@piece
def spoke(b, c, t, n, mat):
    """Спица ленивца: брусок вдоль радиуса n (от ступицы до обода), центр c, касательная t."""
    _braw(b, c, V(1, 0, 0), t, n, 0.050, 0.040, -0.125, 0.090, mat)


def road_wheel(b, c, d, tag='wheel'):
    revolve_m(b, c, d, ROAD_WHEEL, ROAD_WHEEL_M, nseg=28, tag=tag)


def build_run():
    b = Bld('body_run')
    tp = track_poly()
    for sx in (-1.0, 1.0):
        xa, xb = sx * C.TRK_X0, sx * C.TRK_X1
        band(b, tp, 0.03, min(xa, xb), max(xa, xb), M_DARK, tag='track')
        d = Vector((sx, 0, 0))
        for y in C.WHEEL_Y:
            road_wheel(b, V(sx * 0.95, y, C.WHEEL_Z), d, tag='wheel')
            cyl(b, V(sx * (0.95 + 0.268), y, C.WHEEL_Z), V(sx * (0.95 + 0.296), y, C.WHEEL_Z), 0.040, 0.034, M_STEEL, n=12, tag='wheel_cap')
        # ведущая звёздочка (спереди): диск с блюдцем, зубья; ленивец (сзади): обод, ступица и шесть спиц (фото 7)
        SPR = [(0.000, 0.330), (0.020, 0.385), (0.250, 0.385), (0.285, 0.350), (0.282, 0.300), (0.250, 0.245), (0.226, 0.180), (0.218, 0.125), (0.236, 0.112), (0.248, 0.090), (0.248, 0.045)]
        SPR_M = [M_DARK] * 4 + [M_WHL] * 3 + [M_STEEL] * 3
        revolve_m(b, V(sx * 0.95, C.TRK_Y_F, C.TRK_ZC), d, SPR, SPR_M, nseg=28, tag='sprocket')
        for k in range(11):
            a = 2 * math.pi * k / 11 + 0.15; dy, dz = math.cos(a), math.sin(a)
            _braw(b, V(sx * 1.08, C.TRK_Y_F + dy * 0.405, C.TRK_ZC + dz * 0.405), V(1, 0, 0), Vector((0, -dz, dy)), Vector((0, dy, dz)), 0.145, 0.034, -0.030, 0.045, M_DARK)
        tube(b, V(sx * 0.95, C.TRK_Y_R, C.TRK_ZC), V(sx * 1.17, C.TRK_Y_R, C.TRK_ZC), 0.315, 0.262, M_DARK, n=28, tag='idler_rim')
        cyl(b, V(sx * 0.95, C.TRK_Y_R, C.TRK_ZC), V(sx * 1.125, C.TRK_Y_R, C.TRK_ZC), 0.100, 0.092, M_STEEL, n=16, tag='idler_hub')
        for k in range(6):
            a = 2 * math.pi * k / 6
            spoke(b, V(sx * 1.06, C.TRK_Y_R + math.cos(a) * 0.19, C.TRK_ZC + math.sin(a) * 0.19), Vector((0, -math.sin(a), math.cos(a))), Vector((0, math.cos(a), math.sin(a))), M_DARK, tag='idler_spoke')
        for yc in (C.TRK_Y_F,): cyl(b, V(sx * (0.95 + 0.246), yc, C.TRK_ZC), V(sx * (0.95 + 0.274), yc, C.TRK_ZC), 0.046, 0.040, M_STEEL, n=12, tag='hub_cap')
    return b


def build_tread():
    """Башмаки гусеницы: видимая часть ленты (нижняя ветвь и дуги ниже юбки) — плиты с гребнями и концевыми соединителями; плоские материалы, без развёртки."""
    b = Bld('body_tread')
    ro = C.TRK_R
    path = []
    n_low = int((C.TRK_Y_F - C.TRK_Y_R) / C.TREAD_PITCH)
    for i in range(n_low + 1):
        y = C.TRK_Y_R + (C.TRK_Y_F - C.TRK_Y_R) * i / n_low; path.append((y, 0.036, 1.0, 0.0, 0.0, -1.0))            # нижняя ветвь: касательная +Y, наружу вниз
    for yc, a0, a1 in ((C.TRK_Y_F, -90.0, 28.0), (C.TRK_Y_R, 152.0, 270.0)):                                       # дуги спереди и сзади (до уровня юбки)
        n_arc = max(2, int(math.radians(a1 - a0) * ro / C.TREAD_PITCH))
        for i in range(1, n_arc):
            a = math.radians(a0 + (a1 - a0) * i / n_arc); path.append((yc + ro * math.cos(a), C.TRK_ZC + ro * math.sin(a), -math.sin(a), math.cos(a), math.cos(a), math.sin(a)))
    def treads(bb):
        for sx in (-1.0, 1.0):
            xc = sx * (C.TRK_X0 + C.TRK_X1) / 2
            for (y, z, ty, tz, ny, nz) in path:
                c = V(xc, y, z); t = V(0, ty, tz); n = V(0, ny, nz)
                r_ = RNG.random(); mp_ = M_TR3 if r_ < 0.50 else (M_TR1 if r_ < 0.90 else M_TR2); ms_ = M_TR2 if RNG.random() < 0.75 else M_TR1       # башмаки в основном чёрные (резина) и в грязи, соединители — ржавая сталь
                _braw(bb, c, V(1, 0, 0), t, n, 0.200, 0.074, -0.012, 0.020, mp_)                                          # плита звена
                for dt in (-0.040, 0.040): _braw(bb, c + t * dt, V(1, 0, 0), t, n, 0.185, 0.012, 0.016, 0.036, mp_)       # два поперечных гребня
                for ex in (-1.0, 1.0):
                    _braw(bb, c + V(ex * 0.185, 0, 0), V(1, 0, 0), t, n, 0.028, 0.070, -0.010, 0.040, ms_)                # концевые соединители
                    _cylraw(bb, c + V(ex * 0.215, 0, 0) - t * 0.060 + n * 0.014, c + V(ex * 0.215, 0, 0) - t * 0.060 + n * 0.014 + V(ex * 0.024, 0, 0), 0.016, 0.016, ms_, 6)   # головки пальцев
    hw(b, treads, tag='treads')
    return b


def build_lower():
    """Нижний корпус между гусеницами, днище и чёрная юбка со скруглёнными концами (фото 6, 7)."""
    b = Bld('body_hull')
    # между гусеницами корпус узкий (|x| < TRK_X0): катки видны под юбкой целиком (фото 7); во всю ширину он только от нижнего края юбки вверх
    prism_yz(b, [(C.Y_REAR_LOW, 0.30), (2.30, 0.30), (2.60, 0.60), (2.60, 0.70), (C.Y_REAR_LOW, 0.70)], -(C.TRK_X0 - 0.03), C.TRK_X0 - 0.03, M_BODY, tag='lower')
    prism_yz(b, [(C.Y_REAR_LOW, 0.64), (2.60, 0.64), (2.60, C.WALL_Z0), (C.Y_REAR_LOW, C.WALL_Z0)], -HULL_X, HULL_X, M_BODY, tag='lower_wide')
    box(b, -0.84, 0.84, -2.20, 2.40, 0.26, 0.40, M_BODY, tag='belly')
    for sx in (-1.0, 1.0):                                                        # крылья над звёздочкой и ленивцем: изогнутые листы цвета корпуса (фото 6: спереди скруглённое крыло под концом юбки; фото 7: сзади такое же)
        xa, xb = (0.90, 1.36) if sx > 0 else (-1.36, -0.90)
        arc_plate(b, C.TRK_Y_F, C.TRK_ZC, 0.548, 0.572, -24.0, 104.0, xa, xb, M_BODY, tag='fender_front')
        arc_plate(b, C.TRK_Y_R, C.TRK_ZC, 0.548, 0.572, 76.0, 150.0, xa, xb, M_BODY, tag='fender_rear')
    sk = Bld('body_skirt')
    SK = [(-2.52, 0.92), (-2.28, 0.65), (2.50, 0.65), (2.72, 0.85), (2.72, 1.01), (-2.52, 1.01)]
    for sx in (-1.0, 1.0):
        prism_yz(sk, SK, min(sx * 1.31, sx * 1.355), max(sx * 1.31, sx * 1.355), M_SKIRT, tag='skirt')
        box(sk, min(sx * 1.31, sx * 1.40), max(sx * 1.31, sx * 1.40), -2.44, 2.66, 1.000, 1.035, M_SKIRT, tag='skirt_top')            # верхняя полка юбки
        box(sk, min(sx * 1.31, sx * 1.372), max(sx * 1.31, sx * 1.372), -2.19, 2.46, 0.625, 0.660, M_SKIRT, tag='skirt_bottom')        # нижний загиб
        for y in (-1.80, 0.35, 2.20): box(sk, min(sx * 1.355, sx * 1.378), max(sx * 1.355, sx * 1.378), y - 0.08, y + 0.08, 0.70, 0.98, M_SKIRT, tag='skirt_plate')   # накладки у D-колец
    return b, sk


def fplan(x1, yb, yc, xf, yf):
    """План передней части: шестиугольник — прямая задняя грань, борта, скошенные углы, лоб."""
    return [(-x1, yb), (x1, yb), (x1, yc), (xf, yf), (-xf, yf), (-x1, yc)]


def rounded(x0, x1, z0, z1, rt, rb, n=7):
    """Контур (x, z) прямоугольника со скруглёнными углами: rt — верхние, rb — нижние (против часовой, если смотреть спереди)."""
    pts = []
    for cx, cz, r, a0 in ((x1 - rb, z0 + rb, rb, -90), (x1 - rt, z1 - rt, rt, 0), (x0 + rt, z1 - rt, rt, 90), (x0 + rb, z0 + rb, rb, 180)):
        for k in range(n + 1):
            a = math.radians(a0 + 90.0 * k / n); pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


@piece
def plate_xz(b, pl, y0, y1, mat):
    """Лист по контуру (x, z) от Y = y0 до Y = y1 (вперёд), торцы закрыты."""
    b.loft([[V(x, y0, z) for x, z in pl], [V(x, y1, z) for x, z in pl]], mat, cap0=mat, cap1=mat)


# верхний блок передней части (борта вертикальны, лоб плоский с узкими скосами углов — фото 5, 6) и нижний нос под уступом у верха юбки
FRONT_ST = [(0.55, fplan(0.86, C.Y_BULK, 2.40, 0.70, 2.56)), (0.66, fplan(0.88, C.Y_BULK, 2.44, 0.72, 2.60)), (0.70, fplan(1.15, C.Y_BULK, 2.54, 0.95, 2.70)), (C.WALL_Z0, fplan(1.28, C.Y_BULK, 2.62, 1.06, 2.80)),
            (C.WALL_Z0, fplan(1.345, C.Y_BULK, C.Y_FLANK_END, C.X_FRONT, C.Y_FRONT)), (C.WALL_Z1, fplan(1.345, C.Y_BULK, C.Y_FLANK_END, C.X_FRONT, C.Y_FRONT))]
WELL_X, WELL_Z, WELL_R, WELL_D = 0.84, 1.46, 0.205, 0.13        # ниши фар в лобовом листе: центр, радиус, глубина (фото 6: Ø ≈ 0,42 м)
RIBS = [-2.55 + 0.50 * k for k in range(7)]       # рёбра панелей отсека (фото 7: шесть панелей через ≈ 0,5 м)


# ───────────── отсек, передняя часть, кабина ─────────────
def build_upper(b):
    ear, low = C.Y_EAR_TOP, C.Y_REAR_LOW
    wall = [(low, C.WALL_LOW_Z), (low + 0.42, C.WALL_Z0), (C.Y_BULK, C.WALL_Z0), (C.Y_BULK, C.WALL_Z1), (ear, C.WALL_Z1)]
    for sx in (-1.0, 1.0):
        x0, x1 = (1.245, 1.345) if sx > 0 else (-1.345, -1.245)
        prism_yz(b, wall, x0, x1, M_BODY, tag='wall')
        box(b, min(sx * 1.17, sx * 1.37), max(sx * 1.17, sx * 1.37), ear, C.Y_BULK, C.WALL_Z1 - 0.04, C.WALL_Z1 + 0.03, M_BODY, tag='rail')       # фланец по верху
        for y in RIBS:                                                                                                                                # вертикальные рёбра панелей
            box(b, min(sx * 1.345, sx * 1.378), max(sx * 1.345, sx * 1.378), y - 0.040, y + 0.040, 1.10, 1.82, M_BODY, tag='rib')
            box(b, min(sx * 1.245, sx * 1.200), max(sx * 1.245, sx * 1.200), y - 0.040, y + 0.040, 1.07, C.WALL_Z1 - 0.32, M_BODY, tag='inner_rib')   # внутренние рёбра
        box(b, min(sx * 1.345, sx * 1.375), max(sx * 1.345, sx * 1.375), -2.54, C.Y_BULK, 1.00, 1.07, M_BODY, tag='wall_bottom_rail')              # нижняя рейка
        prism_yz(b, [(ear + 0.05, C.WALL_Z1 - 0.02), (C.Y_BULK, C.WALL_Z1 - 0.02), (C.Y_BULK, C.WALL_Z1 - 0.26), (ear + 0.50, C.WALL_Z1 - 0.26)],
                 min(sx * 1.345, sx * 1.382), max(sx * 1.345, sx * 1.382), M_BODY, tag='lip')                                                         # верхняя «губа»
    box(b, -1.245, 1.245, low, C.Y_BULK, C.WALL_Z0, C.WALL_Z0 + 0.06, M_BODY, tag='floor')
    for xr in (-0.20, 0.20): box(b, xr - 0.07, xr + 0.07, low + 0.15, C.Y_BULK - 0.12, C.WALL_Z0 + 0.06, C.WALL_Z0 + 0.105, M_BODY, tag='floor_rail')
    for k in range(5):
        y = -2.05 + 0.62 * k
        box(b, -1.245, 1.245, y - 0.05, y + 0.05, C.WALL_Z0 + 0.06, C.WALL_Z0 + 0.095, M_BODY, tag='floor_beam')
    # передняя часть — одно тело (loft по станциям): скошенные углы, наклонный нижний лист; крыша на высоте бортов
    # ящики с имуществом на полу отсека у передней переборки (фото 3, 7: тёмно-зелёные укладки с ручками; ракета лежит между ними)
    for sx in (-1.0, 1.0):
        xa, xb = (0.74, 1.19) if sx > 0 else (-1.19, -0.74)
        box(b, xa, xb, 0.02, 0.68, C.WALL_Z0 + 0.06, C.WALL_Z0 + 0.42, M_BODY, tag='crate')
        box(b, xa - 0.012, xb + 0.012, 0.02 - 0.012, 0.68 + 0.012, C.WALL_Z0 + 0.36, C.WALL_Z0 + 0.405, M_BODY, tag='crate_lid')            # крышка выступает над корпусом укладки
        for ya in (0.10, 0.58): box(b, xa - 0.008, xb + 0.008, ya - 0.012, ya + 0.012, C.WALL_Z0 + 0.06, C.WALL_Z0 + 0.405, M_STEEL, tag='crate_strap')   # стяжные полосы
    fb = Bld('body_front')
    loft_z(fb, FRONT_ST, M_BODY, tag='front')                              # нос под уступом и верхний блок с плоским лбом — одна замкнутая оболочка
    # откидной щит (trim vane) на лбу между фарами: лист, кант из голого металла, поле — и две катаные трубки по верху; всё в корпусе, чтобы красилось камуфляжем (фото 5, 6)
    yf = C.Y_FRONT
    for xa, xb, za, zb, rt, rb, y0, y1, mat in ((-0.60, 0.60, 1.07, 1.77, 0.20, 0.13, 0.0, 0.030, M_BODY), (-0.575, 0.575, 1.095, 1.745, 0.18, 0.11, 0.030, 0.037, M_STEEL), (-0.55, 0.55, 1.12, 1.72, 0.16, 0.09, 0.037, 0.043, M_BODY)):
        plate_xz(b, rounded(xa, xb, za, zb, rt, rb), yf - 0.002 + y0, yf + y1, mat, tag='vane')
    for x0, x1 in ((-0.54, -0.13), (0.13, 0.54)):
        cyl(b, V(x0, yf + 0.058, 1.795), V(x1, yf + 0.058, 1.795), 0.052, 0.052, M_BODY, n=16, tag='vane_roll')
        for xe, de in ((x0, 0.012), (x1, -0.012)): cyl(b, V(xe, yf + 0.058, 1.795), V(xe + de, yf + 0.058, 1.795), 0.058, 0.058, M_STEEL, n=16, tag='vane_roll_cap')
    box(b, 0.15, 1.15, 1.12, 1.88, C.WALL_Z1 - 0.02, C.WALL_Z1 + 0.045, M_BODY, tag='roof_hatch')                  # люк-крышка на крыше передней части (фото 7)
    # кабина — узкая коробка над левой половиной крыши
    x0, x1, y0, y1, z1 = C.CAB_X0, C.CAB_X1, C.CAB_Y0, C.CAB_Y1, C.CAB_Z1
    cbox(b, x0, x1, y0, y1, C.WALL_Z1 - 0.02, z1, M_BODY, c=0.045, tag='cab')
    xm = (x0 + x1) / 2
    for xa, xb in ((x0 + 0.13, x1 - 0.13),):
        box(b, xa, xb, y1 - 0.01, y1 + 0.035, 2.12, 2.50, M_GLASS, tag='windshield')
        for xs, xe, za, zb in ((xa - 0.04, xa, 2.08, 2.54), (xb, xb + 0.04, 2.08, 2.54), (xa - 0.04, xb + 0.04, 2.08, 2.12), (xa - 0.04, xb + 0.04, 2.50, 2.54)): box(b, xs, xe, y1 - 0.02, y1 + 0.04, za, zb, M_DARK, tag='win_seal')
    for sxn, xo in ((-1.0, x0), (1.0, x1)):
        box(b, min(xo, xo + sxn * 0.03), max(xo, xo + sxn * 0.03), y0 + 0.24, y1 - 0.24, 2.12, 2.50, M_GLASS, tag='side_window')
        for ya, yb, za, zb in ((y0 + 0.20, y0 + 0.24, 2.08, 2.54), (y1 - 0.24, y1 - 0.20, 2.08, 2.54), (y0 + 0.20, y1 - 0.20, 2.08, 2.12), (y0 + 0.20, y1 - 0.20, 2.50, 2.54)):
            box(b, min(xo, xo + sxn * 0.04), max(xo, xo + sxn * 0.04), ya, yb, za, zb, M_DARK, tag='win_seal')
    box(b, x0 - 0.02, x1 + 0.02, y1 - 0.10, y1 + 0.16, z1 - 0.06, z1 + 0.035, M_BODY, tag='visor')                    # козырёк над лобовым окном
    return fb


# ───────────── корма: балка, кронштейны оси стрелы, фонари ─────────────
def build_rear(b):
    ear, low = C.Y_EAR_TOP, C.Y_REAR_LOW
    box(b, -1.20, 1.20, -2.40, -2.18, 0.95, 1.30, M_BODY, tag='crossbeam')
    for sx in (-1.0, 1.0):
        xc = sx * C.BEAM_X
        box(b, xc - 0.075, xc + 0.075, -2.80, -2.20, 1.10, 1.50, M_BODY, tag='hinge_bracket')
        cyl(b, V(sx * 1.31, ear + 0.10, 1.74), V(sx * 1.40, ear + 0.10, 1.74), 0.075, 0.07, M_RED, n=12, tag='lamp_top')                 # фонари на скосе «уха»
        cyl(b, V(sx * 1.31, -2.60, 1.52), V(sx * 1.37, -2.60, 1.52), 0.045, 0.04, M_RED, n=10, tag='lamp_low')
        cyl(b, V(sx * 0.95, low + 0.02, 0.46), V(sx * 0.95, low - 0.09, 0.46), 0.07, 0.07, M_STEEL, n=10, tag='tow_eye')                  # буксирные проушины на задней плите
        prism_yz(b, [(ear + 0.15, 1.78), (-2.62, 1.78), (-2.30, 1.10), (-2.62, 1.10)], min(sx * 1.155, sx * 1.245), max(sx * 1.155, sx * 1.245), M_BODY, tag='gusset')   # косынки
        cyl(b, V(sx * 0.40, -2.18, 1.12), V(sx * 0.40, -2.12, 1.12), 0.09, 0.09, M_STEEL, n=14, tag='beam_pad')
    box(b, -0.30, 0.30, -2.19, -2.13, 1.00, 1.24, M_STEEL, tag='beam_plate')
    for x in (-0.20, 0.0, 0.20): cyl(b, V(x, -2.13, 1.12), V(x, -2.07, 1.12), 0.035, 0.035, M_DARK, n=10, tag='beam_fitting')


# ───────────── задний борт-трап (две плиты) ─────────────
def build_ramp():
    """Плита строится вертикально (вдоль +Z от оси петли), в походной позе наклонена назад на RAMP_CLOSED_DEG, наружная сложена на её переднюю сторону. Начало каждого объекта — на оси его петли."""
    Hy, Hz = C.RAMP_H; W2 = C.RAMP_W / 2; T = C.RAMP_T; L1, L2 = C.RAMP_IN_L, C.RAMP_OUT_L
    bi = Bld('ramp_in')
    box(bi, -W2, W2, Hy - T / 2, Hy + T / 2, Hz, Hz + L1, M_BODY, tag='plate')
    for xc in (-0.80, 0.0, 0.80): box(bi, xc - 0.03, xc + 0.03, Hy - T / 2 - 0.03, Hy - T / 2, Hz + 0.08, Hz + L1 - 0.08, M_BODY, tag='back_rib')
    for xc in (-0.62, 0.62):
        cyl(bi, V(xc, Hy - T / 2 + 0.01, Hz + 0.74), V(xc, Hy - T / 2 - 0.045, Hz + 0.74), 0.19, 0.19, M_BODY, n=20, tag='hatch')
        cyl(bi, V(xc, Hy - T / 2 - 0.040, Hz + 0.74), V(xc, Hy - T / 2 - 0.060, Hz + 0.74), 0.12, 0.12, M_STEEL, n=14, tag='hatch_cap')
    for x0, x1 in ((-W2, -W2 + 0.05), (W2 - 0.05, W2)): box(bi, x0, x1, Hy + T / 2, Hy + T / 2 + 0.05, Hz, Hz + L1, M_BODY, tag='rim_side')
    box(bi, -W2, W2, Hy + T / 2, Hy + T / 2 + 0.05, Hz + L1 - 0.05, Hz + L1, M_BODY, tag='rim_end')
    for x0, x1 in ((-1.05, -0.38), (-0.30, 0.30), (0.38, 1.05)): box(bi, x0, x1, Hy + T / 2, Hy + T / 2 + 0.03, Hz + 0.15, Hz + L1 - 0.15, M_BODY, tag='lid')
    for sx in (-1.0, 1.0): cyl(bi, V(sx * 1.10, Hy, Hz), V(sx * 1.26, Hy, Hz), 0.055, 0.055, M_STEEL, n=10, tag='hinge_knuckle')
    def ramp_hw(bb):
        for xc in (-1.00, 1.00): latch_(bb, Fr(V(xc, Hy - T / 2, Hz + L1 - 0.12), V(0, -1, 0), (0, 0, 1)), 0.0, 0.0)
        for xc in (-0.30, 0.30): eye_(bb, Fr(V(xc, Hy, Hz + L1), V(0, 0, 1), (0, 1, 0)), 0.0, 0.0, R=0.045, r=0.011)
        for sx in (-1.0, 1.0):
            for zc in (0.25, 0.95): hinge_(bb, Fr(V(sx * 0.92, Hy - T / 2, Hz + zc), V(0, -1, 0), (0, 0, 1)), 0.0, 0.0, L=0.13)
    rh = Bld('ramp_hw'); hw(rh, ramp_hw, tag='hw')
    ho = Bld('ramp_out')
    Oy, Oz = Hy + T / 2, Hz + L1
    box(ho, -W2 + 0.05, W2 - 0.05, Oy - T, Oy, Oz, Oz + L2, M_BODY, tag='plate')
    for x0, x1 in ((-W2 + 0.05, -W2 + 0.10), (W2 - 0.10, W2 - 0.05)): box(ho, x0, x1, Oy, Oy + 0.05, Oz, Oz + L2, M_BODY, tag='rim_side')
    box(ho, -W2 + 0.05, W2 - 0.05, Oy, Oy + 0.05, Oz + L2 - 0.05, Oz + L2, M_BODY, tag='rim_end')
    for x0, x1 in ((-0.95, -0.35), (-0.28, 0.28), (0.35, 0.95)): box(ho, x0, x1, Oy, Oy + 0.03, Oz + 0.12, Oz + L2 - 0.12, M_BODY, tag='lid')
    for sx in (-1.0, 1.0): cyl(ho, V(sx * 1.0, Oy, Oz), V(sx * 1.12, Oy, Oz), 0.05, 0.05, M_STEEL, n=10, tag='hinge_knuckle')
    return bi, ho, rh


# ───────────── стрела подъёма ─────────────
def saddle_poly(r_m, z_axis):
    """Профиль седла в плоскости XZ: блок ±0,5 с выемкой по кривизне ракеты радиуса r_m + зазор."""
    rc = r_m + 0.03; zt = z_axis - 0.10; ztop_ang = math.degrees(math.asin((zt - z_axis) / rc))
    pts = [(-0.50, z_axis - 0.50), (0.50, z_axis - 0.50), (0.50, zt), (rc * math.cos(math.radians(ztop_ang)), zt)]
    n = 9
    for i in range(1, n):
        a = ztop_ang - (ztop_ang - (-180 - ztop_ang)) * i / n
        pts.append((rc * math.cos(math.radians(a)), z_axis + rc * math.sin(math.radians(a))))
    pts += [(-rc * math.cos(math.radians(ztop_ang)), zt), (-0.50, zt)]
    return pts


@piece
def strap_band(b, y, a0, a1, rin, rout, w, zc, mat):
    """Лента вокруг ракеты в плоскости XZ на оси Y = y: дуга от угла a0 до a1 (градусы, 90° — вверх), ширина 2w, радиусы rin…rout."""
    rings = []
    n = int((a1 - a0) / 8.0) + 1
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n); c_, s_ = math.cos(a), math.sin(a)
        rings.append([V(rin * c_, y - w, zc + rin * s_), V(rin * c_, y + w, zc + rin * s_), V(rout * c_, y + w, zc + rout * s_), V(rout * c_, y - w, zc + rout * s_)])
    b.loft(rings, mat, cap0=mat, cap1=mat)


def build_boom(msl_r=C.MSL_R):
    b = Bld('erect_boom')
    hy, hz = C.BOOM_H; y_end = 0.60
    for sx in (-1.0, 1.0):
        xc = sx * C.BEAM_X
        cyl(b, V(xc, hy, hz), V(xc, y_end, hz), 0.07, 0.07, M_BODY, n=12, tag='beam')
    for y in (hy + 0.12, -1.05, y_end):
        cyl(b, V(-C.BEAM_X, y, hz), V(C.BEAM_X, y, hz), 0.045, 0.045, M_BODY, n=10, tag='cross')
    cyl(b, V(-0.78, hy, hz), V(0.78, hy, hz), 0.055, 0.055, M_STEEL, n=14, tag='hinge_pin')
    for sx in (-1.0, 1.0):
        box(b, min(sx * (C.BEAM_X - 0.09), sx * (C.BEAM_X + 0.09)), max(sx * (C.BEAM_X - 0.09), sx * (C.BEAM_X + 0.09)), hy - 0.10, hy + 0.16, hz - 0.10, hz + 0.10, M_BODY, tag='hinge_lug')
    pp = saddle_poly(msl_r, C.MSL_AXIS_Z)
    for y in C.SADDLE_Y:
        r0 = [V(x, y - 0.17, z) for x, z in pp]; r1 = [V(x, y + 0.17, z) for x, z in pp]
        b.begin(); b.loft([r0, r1], M_BODY, cap0=M_BODY, cap1=M_BODY); b.end('saddle')
        for sx in (-1.0, 1.0):
            xc = sx * C.BEAM_X
            box(b, xc - 0.055, xc + 0.055, y - 0.10, y + 0.10, hz + 0.02, C.MSL_AXIS_Z - 0.50 + 0.02, M_BODY, tag='post')
    for sx in (-1.0, 1.0):
        ys = hy + C.CYL_ATT_S
        box(b, min(sx * C.BEAM_X, sx * 0.86), max(sx * C.BEAM_X, sx * 0.86), ys - 0.05, ys + 0.05, hz - 0.04, hz + 0.04, M_BODY, tag='cyl_lug')
    ys = C.SADDLE_Y[1]; rin, rout, zc = C.MSL_R + 0.012, C.MSL_R + 0.026, C.MSL_AXIS_Z
    eh = Bld('erect_hw')
    strap_band(eh, ys, -22.0, 202.0, rin, rout, 0.055, zc, M_DARK, tag='strap')
    box(eh, -0.42, -0.30, ys - 0.07, ys + 0.07, zc - 0.20, zc - 0.08, M_STEEL, tag='buckle')
    for y in C.SADDLE_Y:
        for sx in (-1.0, 1.0): box(eh, min(sx * 0.50, sx * 0.55), max(sx * 0.50, sx * 0.55), y - 0.06, y + 0.06, C.MSL_AXIS_Z - 0.48, C.MSL_AXIS_Z - 0.32, M_STEEL, tag='tie_ear')
    return b, eh


# ───────────── фурнитура корпуса (этап 5) ─────────────
def build_hw():
    b = Bld('body_hw')
    ear = C.Y_EAR_TOP
    def hooks(bb):                                          # J-крюки у верха каждой панели борта (фото 6, 7)
        for sx in (-1.0, 1.0):
            for yc in [r + 0.25 for r in RIBS[:-1]]: hook_(bb, side_fr(sx * 1.346, yc, 1.78), 0.0, 0.0, 1.0)
    hw(b, hooks, tag='hooks')
    def shackles(bb):                                       # D-кольца на верхней полке юбки (фото 6, 7): по два на борт
        for sx in (-1.0, 1.0):
            for y in (-1.20, 1.10): shackle_(bb, side_fr(sx * 1.380, y, 0.97), 0.0, 0.0, R=0.060, r=0.016)
    hw(b, shackles, tag='shackles')
    # передняя часть (фото 5, 6): плоский лоб, ниши фар врезаны булевой операцией (cut_wells), откидной щит с закруглёнными углами и катаной кромкой, ручки, буксирные проушины
    def front_plate(bb):
        yf = C.Y_FRONT
        for sx in (-1.0, 1.0):
            grab_(bb, Fr(V(sx * 0.46, yf + 0.043, 1.44), V(0, 1, 0), (1, 0, 0)), 0.0, 0.0, L=0.26)       # ручки листа
            _braw(bb, V(sx * 0.585, yf + 0.045, 1.50), V(1, 0, 0), V(0, 0, 1), V(0, 1, 0), 0.010, 0.18, 0.0, 0.016, M_BODY)   # кромочная накладка
        _braw(bb, V(0.0, yf + 0.043, 1.36), V(1, 0, 0), V(0, 0, 1), V(0, 1, 0), 0.27, 0.055, 0.0, 0.010, M_DARK)               # табличка-«NL»
    hw(b, front_plate, tag='front_plate')
    def wells(bb):                                          # внутри ниш: лампы (фото 6: белая фара внизу, янтарный указатель вверху, тёмная колодка)
        yf = C.Y_FRONT; yd = yf - WELL_D
        for sx in (-1.0, 1.0):
            cx = sx * WELL_X
            tube(bb, V(cx, yf - 0.004, WELL_Z), V(cx, yf + 0.030, WELL_Z), WELL_R + 0.030, WELL_R - 0.002, M_BODY, n=28, tag='well_rim')                  # кольцо-обечайка вокруг ниши
            cyl(bb, V(cx + sx * 0.07, yd - 0.012, WELL_Z - 0.05), V(cx + sx * 0.07, yd + 0.060, WELL_Z - 0.05), 0.085, 0.082, M_STEEL, n=20, tag='headlamp')    # фара
            cyl(bb, V(cx + sx * 0.07, yd + 0.058, WELL_Z - 0.05), V(cx + sx * 0.07, yd + 0.066, WELL_Z - 0.05), 0.066, 0.066, M_DARK, n=18, tag='headlamp_lens')
            cyl(bb, V(cx - sx * 0.075, yd - 0.012, WELL_Z + 0.095), V(cx - sx * 0.075, yd + 0.048, WELL_Z + 0.095), 0.040, 0.040, M_RED, n=14, tag='blinker')   # указатель поворота
            cyl(bb, V(cx + sx * 0.0, yd - 0.012, WELL_Z - 0.135), V(cx + sx * 0.0, yd + 0.040, WELL_Z - 0.135), 0.046, 0.046, M_DARK, n=12, tag='lamp_box')    # колодка
            for k in range(3):                                                                    # три витка проволоки: защита ламп
                a = math.radians(210 + 60 * k); p0 = V(cx + 0.10 * math.cos(a), yd - 0.012, WELL_Z + 0.10 * math.sin(a)); p1 = V(cx + 0.185 * math.cos(a), yd + 0.075, WELL_Z + 0.185 * math.sin(a))
                cyl(bb, p0, p1, 0.0045, 0.0045, M_STEEL, n=5, tag='guard_bar')
    wells(b)
    def front_hw(bb):
        yn = 2.64
        for sx in (-1.0, 1.0):
            shackle_(bb, Fr(V(sx * 0.98, yn - 0.01, 0.80), V(0, 0.95, -0.31).normalized(), (0, 0, 1)), 0.0, 0.0, R=0.07, r=0.02)    # буксирные проушины нижнего листа
            plate_(bb, Fr(V(sx * 0.96, C.Y_FRONT + 0.001, 1.06), V(0, 1, 0), (0, 0, 1)), 0.0, 0.0, 0.18, 0.06)                          # таблички под нишами фар
            grab_(bb, side_fr(sx * 1.346, 2.40, 1.45), 0.0, 0.0, L=0.30)                                                              # поручень на борту передней части
        plate_(bb, Fr(V(0.0, 2.74, 0.88), V(0, 0.96, 0.28).normalized(), (0, 0, 1)), 0.0, 0.0, 0.30, 0.07)                           # номерной знак на нижнем листе
    hw(b, front_hw, tag='front_hw')
    # люки и вентиляция на борту передней части (фото 3, 6)
    def front_side(bb):
        for sx in (-1.0, 1.0):
            F = side_fr(sx * 1.346, 2.30, 1.30)
            for a in (-0.22, 0.12):
                _braw(bb, F.p(a, 0), F.t, F.w, F.n, 0.11, 0.085, -0.004, 0.018, M_DARK)
                for k in range(4): _braw(bb, F.p(a, -0.06 + 0.04 * k), F.t, F.w, F.n, 0.10, 0.006, 0.014, 0.030, M_BODY)
            _cylraw(bb, F.p(0.50, 0.00, -0.004), F.p(0.50, 0.00, 0.020), 0.10, 0.10, M_DARK, 18)
            _cylraw(bb, F.p(0.50, 0.00, 0.015), F.p(0.50, 0.00, 0.030), 0.075, 0.075, M_STEEL, 14)
            jbox_(bb, side_fr(sx * 1.346, 1.60, 1.55), 0.0, 0.0)
    hw(b, front_side, tag='front_side')
    # крыша передней части (фото 7): люк, патрубок с кольцом, решётка-жалюзи, зеркало на стойке, две трубы у передних углов (фото 6)
    def roof_hw(bb):
        z0 = C.WALL_Z1
        for sx_ in (-0.40, 0.40): _braw(bb, V(0.65 + sx_, 1.11, z0 + 0.04), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.04, 0.02, 0.0, 0.025, M_STEEL)   # замки
        _cylraw(bb, V(0.50, 2.02, z0 - 0.02), V(0.50, 2.02, z0 + 0.15), 0.22, 0.20, M_BODY, 24)                                   # воздухозаборный патрубок: основание
        _cylraw(bb, V(0.50, 2.02, z0 + 0.14), V(0.50, 2.02, z0 + 0.18), 0.245, 0.245, M_BODY, 24)                                 # кольцо-фланец
        _cylraw(bb, V(0.50, 2.02, z0 + 0.16), V(0.50, 2.02, z0 + 0.20), 0.16, 0.16, M_DARK, 20)                                   # проём
        _braw(bb, V(0.68, 2.52, z0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.50, 0.25, -0.02, 0.012, M_DARK)                       # решётка: проём
        for k in range(9): _braw(bb, V(0.68, 2.30 + 0.054 * k, z0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.47, 0.013, 0.0, 0.034, M_BODY)   # жалюзи
        _cylraw(bb, V(1.20, 2.74, z0), V(1.20, 2.74, z0 + 0.50), 0.018, 0.018, M_STEEL, 8)                                       # стойка зеркала
        _cylraw(bb, V(1.20, 2.74, z0 + 0.46), V(1.34, 2.78, z0 + 0.56), 0.016, 0.016, M_STEEL, 8)
        _cylraw(bb, V(1.34, 2.77, z0 + 0.58), V(1.34, 2.80, z0 + 0.58), 0.115, 0.115, M_DARK, 20)                                 # зеркало
        for sx in (-1.0, 1.0):
            _cylraw(bb, V(sx * 0.80, 2.80, z0 + 0.075), V(sx * 1.14, 2.74, z0 + 0.075), 0.062, 0.062, M_BODY, 14)                    # трубы у передних углов
    hw(b, roof_hw, tag='roof_hw')
    # кабина: дверь с петлями и ручкой, зеркало, дворники, антенна (фото 3)
    def cab_hw(bb):
        x0, x1, y0, y1 = C.CAB_X0, C.CAB_X1, C.CAB_Y0, C.CAB_Y1
        F = side_fr(x0, (y0 + y1) / 2, 2.28)
        frame_(bb, F, -0.52, 0.52, -0.30, 0.30, wd=0.028, hh=0.012)
        grab_(bb, F, 0.34, -0.02, L=0.13)
        for c_ in (-0.20, 0.20): hinge_(bb, F, -0.525, c_, L=0.12)
        _cylraw(bb, V(x0 - 0.02, y1 - 0.18, 2.52), V(x0 - 0.18, y1 - 0.22, 2.60), 0.011, 0.011, M_STEEL, 8)
        _braw(bb, V(x0 - 0.19, y1 - 0.22, 2.62), V(1, 0, 0), V(0, 0, 1), V(0, 1, 0), 0.012, 0.11, -0.018, 0.010, M_DARK)
        for xw in (-1.0, -0.65): _cylraw(bb, V(xw, y1 + 0.04, 2.14), V(xw + 0.20, y1 + 0.045, 2.43), 0.007, 0.007, M_DARK, 6)        # дворники
        _cylraw(bb, V(-0.55, 1.35, C.CAB_Z1), V(-0.55, 1.35, C.CAB_Z1 + 0.06), 0.07, 0.06, M_STEEL, 12)                         # антенна
        _cylraw(bb, V(-0.55, 1.35, C.CAB_Z1 + 0.05), V(-0.55, 1.35, C.CAB_Z1 + 1.10), 0.010, 0.004, M_DARK, 6)
    hw(b, cab_hw, tag='cab_hw')
    def lamps_rear(bb):
        pass
    def handles(bb):                                        # подъёмные проушины и поручни на «ушах»
        for sx in (-1.0, 1.0):
            grab_(bb, side_fr(sx * 1.38, ear + 0.45, 1.80), 0.0, 0.0, L=0.32)
            eye_(bb, top_fr(sx * 1.28, C.Y_BULK - 0.05, C.WALL_Z1 + 0.03), 0.0, 0.0, R=0.05, r=0.012)
            eye_(bb, top_fr(sx * 1.28, ear + 0.15, C.WALL_Z1 + 0.03), 0.0, 0.0, R=0.05, r=0.012)
    hw(b, handles, tag='handles')
    def crate_hw(bb):
        for sx in (-1.0, 1.0):
            xo = sx * (1.19 if sx > 0 else 1.19)
            for ya in (0.20, 0.50): grab_(bb, side_fr(sx * 1.202, ya, C.WALL_Z0 + 0.24), 0.0, 0.0, L=0.12)                          # ручки на наружных торцах ящиков (смотрят на борт)
            latch_(bb, top_fr(sx * 0.965, 0.35, C.WALL_Z0 + 0.405), 0.0, 0.0)
    hw(b, crate_hw, tag='crate_hw')
    def wall_plates(bb):                                    # накладки-таблички на бортах передней части и отсека
        for sx in (-1.0, 1.0):
            plate_(bb, side_fr(sx * 1.346, 1.80, 1.50), 0.0, 0.0, 0.22, 0.14)
            plate_(bb, side_fr(sx * 1.346, -1.30, 1.45), 0.0, 0.0, 0.14, 0.10)
    hw(b, wall_plates, tag='wall_plates')
    # заклёпки: рёбра панелей, верхняя «губа», юбка
    rv = []
    for sx in (-1.0, 1.0):
        for y in RIBS:
            for z in (1.22, 1.38, 1.54, 1.70): rv.append((V(sx * 1.378, y, z), V(sx, 0, 0)))
        y = ear + 0.75
        while y < C.Y_BULK - 0.10:
            for z in (1.82, 1.66): rv.append((V(sx * 1.382, y, z), V(sx, 0, 0)))
            y += 0.16
        y = -2.00
        while y < 2.50:
            for z in (0.68, 0.97): rv.append((V(sx * 1.356, y, z), V(sx, 0, 0)))
            y += 0.22
    bolt_field(b, rv, M_BODY, r=0.0095, h=0.009, n=6, mat2=M_STEEL, tag='rivets')
    def rear_lines(bb):                                     # шланги и кабели вдоль задней балки
        conduit_(bb, [V(-1.05, -2.12, 1.20), V(-0.60, -2.10, 1.28), V(-0.20, -2.09, 1.22), V(0.30, -2.10, 1.30), V(0.75, -2.11, 1.20), V(1.05, -2.12, 1.28)], r=0.016, mat=M_DARK)
        conduit_(bb, [V(-0.9, -2.10, 1.05), V(-0.5, -2.08, 1.00), V(0.0, -2.09, 1.06), V(0.6, -2.08, 1.00)], r=0.012, mat=M_DARK)
    hw(b, rear_lines, tag='rear_lines')
    def wheel_nuts(bb):                                     # венец из десяти гаек на ступице каждого катка (фото 7) и у звёздочки
        for sx in (-1.0, 1.0):
            for y in C.WHEEL_Y: bolt_circle(bb, V(sx * (0.95 + 0.272), y, C.WHEEL_Z), V(sx, 0, 0), 0.068, 10, 0.016, 0.020, M_STEEL, n=6, tag='wheel_nut')
            bolt_circle(bb, V(sx * (0.95 + 0.248), C.TRK_Y_F, C.TRK_ZC), V(sx, 0, 0), 0.072, 10, 0.016, 0.020, M_STEEL, n=6, tag='hub_nut')
    wheel_nuts(b)
    return b


def cut_wells(ob):
    """Врезает ниши фар в лобовой лист: булева разность с двумя цилиндрами (EXACT); стенки и дно ниш берут материал цилиндра — тёмный (фото 6: ниши глубокие, тёмные внутри)."""
    yf = C.Y_FRONT; depth = WELL_D + 0.08
    coll = bpy.data.collections.new('wells_cut'); mk.sc.collection.children.link(coll)
    cutters = []
    for sx in (-1.0, 1.0):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=28, radius1=WELL_R, radius2=WELL_R, depth=depth)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(-90.0), 3, 'X'))
        bmesh.ops.translate(bm, verts=bm.verts, vec=(sx * WELL_X, yf - WELL_D + depth / 2.0, WELL_Z))
        for f in bm.faces: f.material_index = M_DARK
        me = bpy.data.meshes.new('wellcut'); bm.to_mesh(me); bm.free()
        for m in mk.MATS: me.materials.append(m)
        co = bpy.data.objects.new('wellcut', me); coll.objects.link(co); cutters.append(co)
    md = ob.modifiers.new('wells', 'BOOLEAN'); md.operation = 'DIFFERENCE'; md.operand_type = 'COLLECTION'; md.collection = coll; md.solver = 'EXACT'
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    new = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    ob.modifiers.remove(md)
    old = ob.data; ob.data = new; bpy.data.meshes.remove(old); new.name = ob.name
    for co in cutters: bm_ = co.data; bpy.data.objects.remove(co, do_unlink=True); bpy.data.meshes.remove(bm_)
    mk.sc.collection.children.unlink(coll); bpy.data.collections.remove(coll)


PIVOTS = {'ramp_in': (0.0, C.RAMP_H[0], C.RAMP_H[1]), 'ramp_hw': (0.0, C.RAMP_H[0], C.RAMP_H[1]), 'erect_boom': (0.0, C.BOOM_H[0], C.BOOM_H[1]), 'erect_hw': (0.0, C.BOOM_H[0], C.BOOM_H[1]),
          'ramp_out': (0.0, C.RAMP_H[0] + C.RAMP_T / 2, C.RAMP_H[1] + C.RAMP_IN_L)}
BEVEL_OBJS = ('body_hull', 'body_front', 'body_skirt', 'ramp_in', 'ramp_out', 'erect_boom')
BEVEL_W = 0.007                                   # ширина фаски, м
BEVEL_SEG = int(os.environ.get('M752_BEVSEG', '1'))   # сегментов фаски: 1 — срез (дёшево), 2 — скругление
BEVEL_MIN_LEN = 0.14                              # мелкие рёбра (болты, ушки, торцы тонких планок) не скругляются


def finalize(builders):
    groups = {}
    for bl in builders: groups.setdefault(bl.name.split('_')[0], []).append(bl)
    res = {g: len(check_group(lst)) for g, lst in groups.items()}
    objs = {}
    for bl in builders:
        bmesh.ops.remove_doubles(bl.bm, verts=bl.bm.verts, dist=1e-6)
        sharp = 32
        if bl.name in BEVEL_OBJS and STAGE >= 5:
            es = [e for e in bl.bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(40.0) and e.calc_length() >= BEVEL_MIN_LEN]
            try: bmesh.ops.bevel(bl.bm, geom=es, offset=BEVEL_W, offset_type='OFFSET', segments=BEVEL_SEG, profile=0.5, affect='EDGES'); sharp = 52
            except Exception as ex: print('скругление не вышло:', bl.name, ex)
        ob = bl.finish(bl.name, sharp); objs[bl.name] = ob
        if bl.name == 'body_front' and not os.environ.get('M752_NOCUT'): cut_wells(ob)
        if bl.name in PIVOTS:                                    # начало подвижной части — на оси петли
            pv = Vector(PIVOTS[bl.name]); ob.data.transform(Matrix.Translation(-pv)); ob.location = pv
    return res, objs


def apply_pose(objs):
    """Поза частей: travel — трап закрыт (внутренняя плита наклонена назад на RAMP_CLOSED_DEG, наружная сложена на её переднюю сторону), стрела лежит; ramp — трап раскрыт, стрела лежит; active — трап раскрыт, стрела поднята.
    Модель строится с наружной плитой в положении «продолжение» (0°), поэтому в походной позе её надо свернуть на 180°. Наружная плита и фурнитура — дочерние внутренней плиты."""
    ri, ro, bm_ = objs.get('ramp_in'), objs.get('ramp_out'), objs.get('erect_boom')
    rh, eh = objs.get('ramp_hw'), objs.get('erect_hw')
    act = POSE == 'active'; ramp_open = POSE in ('active', 'ramp')
    if ri is not None: ri.rotation_euler = (math.radians(C.RAMP_OPEN_DEG if ramp_open else C.RAMP_CLOSED_DEG), 0, 0)
    if ro is not None and ri is not None:
        ro.parent = ri; ro.matrix_parent_inverse = Matrix.Translation(ri.location).inverted()
        ro.rotation_euler = (math.radians(C.RAMP_OUT_OPEN_DEG if ramp_open else 180.0), 0, 0)
    if rh is not None and ri is not None: rh.parent = ri; rh.matrix_parent_inverse = Matrix.Translation(ri.location).inverted()
    if bm_ is not None: bm_.rotation_euler = (math.radians(C.BOOM_UP_DEG if act else 0.0), 0, 0)
    if eh is not None and bm_ is not None: eh.parent = bm_; eh.matrix_parent_inverse = Matrix.Translation(bm_.location).inverted()


def build_all():
    bl = []
    if STAGE >= 1:
        bh, sk = build_lower(); bl += [build_run(), bh, sk, build_tread()]
    if STAGE >= 2: bl.append(build_upper(bh))
    if STAGE >= 3:
        build_rear(bh); bi, ho, rh = build_ramp(); bl += [bi, ho, rh]
    if STAGE >= 4: bm_, eh = build_boom(); bl += [bm_, eh]
    if STAGE >= 5: bl += [build_hw()]
    res, objs = finalize(bl)
    if os.environ.get('M752_PROF'):
        import collections
        for bl_ in bl:
            cnt = collections.Counter()
            for tag, v0, v1, f0, f1 in bl_.pieces: cnt[tag] += f1 - f0
            print('PROF', bl_.name, sum(cnt.values()), 'граней;', ', '.join('%s %d' % kv for kv in cnt.most_common(14)))
    apply_pose(objs)
    return res


RES = build_all()
ST = mk.stats(False)
print('build.py: готово', ST['tris'], 'тр.; висящих связок по группам:', RES, ST['per_object'])
print('длина %.3f м, ширина %.3f м, высота %.3f м' % (ST['length_m'], ST['span_m'], ST['height_m']))
