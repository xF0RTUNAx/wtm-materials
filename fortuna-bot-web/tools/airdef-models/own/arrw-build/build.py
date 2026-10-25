# build.py — AGM-183A ARRW (ракета с воздушного старта, подвеска под крыло В-52; в игре — новое оружие запада, ключ w_arrw, оружие arrw): своя модель по картинкам Mark (Свои/ARRW/): 1 — рендер на белом фоне, вид спереди-слева (нос рядом
# с камерой: оживало с синим кольцом, белое кольцо и кольцо золотых винтов в основании, люк с пандусом сверху, две проушины, значок, надпись, синее кольцо, четыре руля с приводами «×»), 2 — тот же объект на тёмном фоне, вид сзади-слева
# (плоский торец с винтами и лючком, юбка шире корпуса, кольцо винтов, «щёки» под рулями, штанги проушин, подробности рулей и приводов). Картинки 2 и 3 присланы одинаковыми (файл один).
# Справок не искали. Чертежа нет — оба вида с сильной перспективой. Пропорции получены подгонкой перспективы по обоим видам (силуэтные линии цилиндра → точка схода, эллипсы торца и колец → фокусное, высоты проушин, положения колец вдоль оси):
# длина / диаметр ≈ 9,2 (оценки 8,7…9,6 по двум кадрам), оживало 2,45 диаметра (касательное, затупленное: таблица радиусов снята по кадру 1 с поправкой на перспективу), юбка шире корпуса на 7–9 % со ступенькой на 0,9 диаметра от торца.
# Масштаб: у ARRW нет прежней модели в игре; взят AGM-86 ALCM (w_agm86.glb 6,319 м — то же оружие под крыло В-52): длина 6,30 м, диаметр 0,685 м; в prepare.js масштаб правится одним числом.
# Метры. Нос +Y (в glTF уйдёт в −Z), начало — середина длины, ось корпуса — Y; верх +Z (на верхней линии — проушины, люк, ремни); рули — «×» (45°, 135°, 225°, 315°). Рендеры сняты со стороны −X (нос слева): надпись и значок — на −X.
# Состав: затупленное оживало, шейка с белым кольцом, кольцо винтов, цилиндр, три шва, «щёки» и кольцо винтов у рулей, юбка со ступенькой и торцом, четыре руля-трапеции с приводами-«торпедами», люк, две проушины с ремнями, два боковых обтекателя, кнопка.
# Запуск (фоновый Blender): ARW_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# В живом Blender Mark (blender-mcp): ARW_STAGE=1…4 — этапы (1 корпус и оживало, 2 рули, приводы и «щёки», 3 проушины, ремни, люк, обтекатели, 4 винты и торец); сцена ARRW создаётся рядом со стандартной.
import sys, os, importlib, math
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
import bpy, bmesh
import random
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import modelkit as mk
importlib.reload(mk)

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/ARRW'
STAGE = int(os.environ.get('ARW_STAGE', '9'))
RNG = random.Random(183)
LD = 9.2                           # длина в диаметрах (подгонка перспективы по двум кадрам: 8,7…9,6)
L = 6.30                           # длина (м): как у AGM-86 ALCM в игре (6,319 м)
D = L / LD                         # диаметр корпуса 0,685 м
R = D / 2.0                        # радиус корпуса
S = 1.0                            # числа в метрах
G = 0.0; X0 = 0.0; WT = 0.0
def d(v): return v * D             # диаметры → метры
def tx(t): return L - d(t)         # расстояние t диаметров от кончика → x от торца (м)

PFX = 'ARW'
M_BODY, M_DARK, M_STEEL, M_FIN, M_BRASS = 0, 1, 2, 3, 4
M_BODY2, M_GLASS, M_RUST = M_FIN, M_STEEL, M_DARK                  # имена, которых ждут общие кирпичи (см. unit_bricks)
mk.configure('ARRW', 1.0, x0=0.0, yc=0.0, rb=R, nseg=40, nose='left')
mk.set_materials([(f'{PFX}_body', (0.42, 0.44, 0.49)),        # светло-серая краска корпуса с голубоватым отливом (кадр 1; синие кольца, белые полосы и надписи — в текстуре)
                  (f'{PFX}_dark', (0.022, 0.023, 0.026)),     # ремни проушин, зазоры, лючки
                  (f'{PFX}_steel', (0.34, 0.35, 0.37)),       # проушины, пластины, кромки
                  (f'{PFX}_fin', (0.62, 0.625, 0.60)),        # рули и приводы — светлее корпуса (кадры 1, 2: почти белые)
                  (f'{PFX}_brass', (0.50, 0.32, 0.075))])     # золотистые винты (кадры 1, 2)
_RGB = [(0.42, 0.44, 0.49), (0.022, 0.023, 0.026), (0.34, 0.35, 0.37), (0.62, 0.625, 0.60), (0.50, 0.32, 0.075)]
for _m, _c, (_r, _mt) in zip(mk.MATS, _RGB, ((0.48, 0.0), (0.88, 0.0), (0.30, 0.90), (0.55, 0.0), (0.45, 0.25))):    # у золотистых винтов металличность невысокая: без карты окружения в игре металл чернеет
    for _n in list(_m.node_tree.nodes):
        if _n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): _m.node_tree.nodes.remove(_n)
    _b = next(n for n in _m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for _l in list(_b.inputs['Base Color'].links): _m.node_tree.links.remove(_l)
    _b.inputs['Base Color'].default_value = (*_c, 1.0)
    _b.inputs['Roughness'].default_value = _r; _b.inputs['Metallic'].default_value = _mt
    try: _b.inputs['Specular IOR Level'].default_value = 0.5
    except Exception: pass

exec(compile(open('/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/_инструменты/unit_bricks.py', encoding='utf-8').read(), 'unit_bricks.py', 'exec'), globals())


def Yx(x): return x - L / 2.0                         # от торца (x, м) → Y, нос +Y
def at(x, r, deg):
    """Точка на радиусе r (м) на азимуте deg (0° = +X, 90° = +Z) в сечении x от торца."""
    a = math.radians(deg); return V(r * math.cos(a), Yx(x), r * math.sin(a))
def er(az): a = math.radians(az); return V(math.cos(a), 0, math.sin(a))                  # радиальное направление на азимуте
def et(az): a = math.radians(az); return V(-math.sin(a), 0, math.cos(a))                 # поперечное (касательное)


def revolve_profile(b, pts, mats, nseg=40, a0=0.0, tag='body'):
    """Тело вращения вокруг оси Y: pts — [(x от торца, радиус)], mats — материал каждого пояса между соседними точками; торцы закрыты."""
    rings = [[at(x, max(r, 1e-4), math.degrees(a0 + 2 * math.pi * k / nseg)) for k in range(nseg)] for x, r in pts]
    b.begin(); b.loft(rings, mats, cap0=mats[0], cap1=mats[-1]); b.end(tag)


# ───────────── корпус: торец, юбка со ступенькой, кольцо винтов, цилиндр, шейка, оживало ─────────────
NOSE_T = 2.45                                           # длина оживала (диаметры от кончика)
RSK0, RSK1 = d(0.535), d(0.545)                         # юбка: у ступеньки и у торца (шире корпуса на 7–9 %)
SEAMS_T = (2.45, 2.72, 2.86)                            # швы от кончика: основание оживала, начало и конец кольца винтов на шее
STEP_X = d(0.91)                                        # ступенька юбки от торца (8,29 диаметра от кончика)
FLG_X = d(1.18)                                         # шов у кольца винтов у рулей (8,02 от кончика)
NOSE_TAB = [(0.0, 0.0), (0.004, 0.075), (0.015, 0.125), (0.04, 0.21), (0.08, 0.29), (0.12, 0.36), (0.18, 0.45), (0.24, 0.52), (0.30, 0.585), (0.365, 0.65),
            (0.43, 0.71), (0.50, 0.77), (0.57, 0.82), (0.64, 0.86), (0.715, 0.90), (0.79, 0.93), (0.87, 0.955), (0.95, 0.978), (1.0, 1.0)]    # (доля длины оживала от кончика, радиус / R)


def nose_r(t):
    """Радиус оживала на расстоянии t диаметров от кончика (таблица по кадру 1, ломаная с линейной интерполяцией)."""
    u = max(0.0, min(1.0, t / NOSE_T))
    for (u0, r0), (u1, r1) in zip(NOSE_TAB, NOSE_TAB[1:]):
        if u <= u1: return R * (r0 + (r1 - r0) * (u - u0) / (u1 - u0))
    return R


def groove(add, x, r, w=0.0035, dp=0.0024, m=M_BODY):       # стенки канавки круче 32°: рёбра острые, и длинные грани не дают полосатости в нормалях
    add(x - w, r, m); add(x, r - dp, m); add(x + w, r, m)


def body_profile():
    T = []                                                 # (x, r, материал полосы, начинающейся в этой точке)
    def add(x, r, m=M_BODY): T.append((x, r, m))
    # торец: плоский диск, скругление кромки r = 0,05 D, юбка
    add(0.0, 0.0006); add(0.0, RSK1 - d(0.05))
    for deg in (22.5, 45.0, 67.5): a_ = math.radians(deg); add(d(0.05) - d(0.05) * math.cos(a_), (RSK1 - d(0.05)) + d(0.05) * math.sin(a_))
    add(d(0.05), RSK1)
    add(d(0.30), RSK1 - (RSK1 - RSK0) * 0.35); add(STEP_X - d(0.03), RSK0)              # юбка: чуть сужается к ступеньке (кадр 2)
    # ступенька к основному диаметру (кадр 1: тёмное кольцевое плечо, на нём стоят рули)
    add(STEP_X, RSK0 - 0.0035); add(STEP_X + 0.0035, R + 0.0015); add(STEP_X + 0.008, R)
    groove(add, FLG_X, R)                                  # шов у кольца винтов у рулей
    # цилиндр до кольца винтов на шее: шов, стальная лента кольца, шов; затем шейка с белым кольцом (цвет — в текстуре) и шов основания оживала
    xs, xm = tx(SEAMS_T[2]), tx(SEAMS_T[1])
    groove(add, xs, R)
    add(xs + 0.0042, R); add(xs + 0.0046, R + 0.0016, M_STEEL); add(xm - 0.0046, R + 0.0016, M_STEEL); add(xm - 0.0042, R)
    groove(add, xm, R)
    RN = R * 0.985
    add(xm + 0.010, RN); add(tx(SEAMS_T[0]) - 0.004, RN)
    groove(add, tx(SEAMS_T[0]), RN)
    # оживало: станции чаще у кончика
    ts = [2.40, 2.32, 2.22, 2.10, 1.98, 1.85, 1.72, 1.58, 1.44, 1.30, 1.16, 1.02, 0.90, 0.78, 0.66, 0.55, 0.45, 0.36, 0.28, 0.21, 0.15, 0.10, 0.06, 0.03, 0.012]
    for t in ts: add(tx(t), nose_r(t))
    add(L - 0.0035, 0.004); add(L, 0.0006)
    T.sort(key=lambda p: p[0])                              # профиль идёт от торца к носу (сортировка устойчива: точки одного x остаются в порядке добавления)
    return [(x, r) for x, r, _ in T], [m for _, _, m in T][:-1]


def build_body():
    b = Bld('ARW_body'); P, M = body_profile()
    revolve_profile(b, P, M, nseg=40, a0=0.0, tag='body')
    return b


# ───────────── рули «×» с приводами и «щёки» ─────────────
FIN_AZ = (45.0, 135.0, 225.0, 315.0)
# трапеция по кадру 2 (рули — пластины в плоскости оси и радиуса): корень 1,03 D (x от торца 0,45…1,48 D), кончик 0,59 D (0,66…1,25 D), высота над юбкой ≈ 0,55 D
FIN = dict(xte_r=d(0.45), xle_r=d(1.48), xte_t=d(0.66), xle_t=d(1.25), s_r=d(0.47), s_t=d(1.07), t_r=d(0.017), t_t=d(0.012))


@piece
def finplate(b, az, xte_r, xle_r, xte_t, xle_t, s_r, s_t, t_r, t_t, mat):
    """Руль: тонкая трапециевидная пластина со скруглёнными кромками; корень утоплен в привод и корпус."""
    def ring(x_le, x_te, s, t):
        c = x_le - x_te
        pts = [(x_le, 0.0), (x_le - 0.06 * c, t / 2), (x_te + 0.06 * c, t / 2), (x_te, t * 0.30), (x_te, -t * 0.30), (x_te + 0.06 * c, -t / 2), (x_le - 0.06 * c, -t / 2)]
        return [et(az) * tt + er(az) * s + V(0, Yx(xx), 0) for xx, tt in pts]
    xl_m, xt_m, s_m, t_m = (xle_r + xle_t) / 2, (xte_r + xte_t) / 2, (s_r + s_t) / 2, (t_r + t_t) / 2
    b.loft([ring(xle_r, xte_r, s_r, t_r), ring(xl_m, xt_m, s_m, t_m), ring(xle_t, xte_t, s_t, t_t)], mat, cap0=mat, cap1=mat)


def build_fins():
    b = Bld('ARW_fins')
    for k, az in enumerate(FIN_AZ): finplate(b, az, mat=M_FIN, tag=f'fin{k}', **FIN)
    return b


POD = [(0.0, 0.0), (0.0, d(0.027)), (d(0.20), d(0.027)), (d(0.20), d(0.034)), (d(0.25), d(0.034)), (d(0.25), d(0.040)), (d(0.56), d(0.040)), (d(0.67), d(0.034)), (d(0.78), d(0.014)), (d(0.80), 0.0)]    # привод-«торпеда»: хвостик, кольцо, цилиндр, конус


def build_pods():
    """Приводы рулей: «торпеды» вдоль оси на корне каждого руля (рис. кадров 1–2: конусом вперёд, хвостовой цилиндрик сзади), ось на 0,06 D выше юбки; пластина руля сидит на их внешней стороне."""
    b = Bld('ARW_pods')
    for k, az in enumerate(FIN_AZ):
        c = at(d(0.37), d(0.56), az)
        revolve(b, c, V(0, 1, 0), POD, M_FIN, nseg=14, tag=f'pod{k}')
    return b


def arc_loop(az0, az1, r_in, r_out, n=6):
    """Замкнутый контур сечения дугового накладного пояса: наружная дуга az0→az1, внутренняя — обратно (x подставляется снаружи)."""
    out = [(az0 + (az1 - az0) * k / (n - 1), r_out) for k in range(n)]
    inn = [(az1 - (az1 - az0) * k / (n - 1), r_in) for k in range(n)]
    return out + inn


@piece
def arc_shell(b, stations, mat, n=6):
    """Накладка по поверхности: stations — [(x, az0, az1, r_in, r_out)]; в каждом сечении замкнутый контур из двух дуг по n точек; концы закрыты (щёки, ремни, обтекатели).
    Сечения с разным азимутным размахом перекашивают грани: длинная диагональ ныряет под корпус и он проступает белыми «зазубринами» — подушки ремней делаются с постоянным размахом (pad_flat)."""
    rings = [[at(x, r, a) for a, r in arc_loop(az0, az1, ri, ro, n)] for x, az0, az1, ri, ro in stations]
    b.loft(rings, mat, cap0=mat, cap1=mat)


def pad_flat(xa, xf, az, half_deg, h, edge=0.012):
    """Прямоугольная накладка постоянной ширины по дуге: края (на длине edge) плавно утоньшаются по высоте, а не сужаются по азимуту."""
    xs = [xa, xa + 0.4 * edge, xa + edge, xf - edge, xf - 0.4 * edge, xf]; ks = [0.30, 0.75, 1.0, 1.0, 0.75, 0.30]
    return [(x, az - half_deg, az + half_deg, R - 0.003, R + h * k) for x, k in zip(xs, ks)]


def pad_stations(x0, x1, az, half_deg, h, grow=0.07):
    """Станции «щеки»: прямоугольник со скруглёнными углами (вход и выход сужаются по дуге)."""
    xs = [x0, x0 + grow * (x1 - x0), x0 + 2 * grow * (x1 - x0), (x0 + x1) / 2, x1 - 2 * grow * (x1 - x0), x1 - grow * (x1 - x0), x1]
    ks = [0.55, 0.86, 1.0, 1.0, 1.0, 0.86, 0.55]; hs = [0.35, 0.85, 1.0, 1.0, 1.0, 0.85, 0.35]
    return [(x, az - half_deg * k, az + half_deg * k, R - 0.004, R + h * hh) for x, k, hh in zip(xs, ks, hs)]


def build_cheeks():
    b = Bld('ARW_cheeks')
    for k, az in enumerate(FIN_AZ):
        arc_shell(b, pad_stations(d(1.18), d(1.68), az, 27.0, d(0.016)), M_BODY, tag=f'cheek{k}')
    return b


# ───────────── проушины, ремни, люк, обтекатели, кнопка ─────────────
LUG_T = (4.88, 6.26)                                    # положения проушин от кончика (диаметры): подгонка по двум кадрам
HATCH_T = (2.95, 3.95)
PAD = (-0.12, 0.28)                                     # тёмная подушка ремня: от задней до передней кромки, диаметры от центра проушины (вперёд — к носу); тонкий ремень идёт по задней кромке (рисуется в текстуре)


def lug_loop(bb, xc):
    """Проушина — перевёрнутая «П»: две ножки и перекладина, плита-основание на ремне. Ось петли вдоль корпуса (петля в плоскости оси и верха)."""
    zt = R                                                # верх корпуса
    _braw(bb, V(0, Yx(xc), zt + d(0.004)), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), d(0.075), d(0.115), -d(0.01), d(0.010), M_STEEL)             # плита основания 0,15 × 0,23 D
    for sy in (-1, 1):
        _braw(bb, V(0, Yx(xc) + sy * d(0.085), zt + d(0.07)), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), d(0.022), d(0.020), -d(0.06), d(0.06), M_STEEL)    # ножки
    _braw(bb, V(0, Yx(xc), zt + d(0.138)), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), d(0.0235), d(0.107), -d(0.020), d(0.020), M_STEEL)                 # перекладина: чуть шире и длиннее ножек — грани не лежат в одной плоскости (иначе в запечённой текстуре полосы)


def build_hw3():
    """Проушины с ремнями (чёрные накладки на верхней дуге, кадры 1–2), люк и боковые обтекатели у шеи, кнопка."""
    b = Bld('ARW_hw')
    for k, t in enumerate(LUG_T):
        xa, xf = tx(t) + d(PAD[0]), tx(t) + d(PAD[1])                                    # x от торца: вперёд (к носу) — больше
        arc_shell(b, pad_flat(xa, xf, 90.0, 34.0, 0.0050), M_DARK, n=10, tag=f'strap{k}')
    for k, t in enumerate(LUG_T): hw(b, (lambda bb, xc=tx(t): lug_loop(bb, xc)), tag=f'lug{k}')
    def hatch(bb):
        x0, x1 = tx(HATCH_T[1]), tx(HATCH_T[0])
        yc = Yx((x0 + x1) / 2); hl = (x1 - x0) / 2
        _braw(bb, V(0, yc, R), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), d(0.265), hl, -d(0.11), d(0.040), M_BODY)                            # плита люка: низ уходит в корпус, верх на 0,04 D выше оси
        _braw(bb, V(0, yc + hl * 0.05, R), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), d(0.175), hl * 0.78, d(0.030), d(0.052), M_FIN)           # светлая панель (окно) поверх плиты
        for sx in (-1, 1):
            _braw(bb, V(sx * d(0.250), yc, R), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), d(0.016), hl - 0.0015, -d(0.10), d(0.052), M_BODY)    # бортики вдоль люка (короче плиты на 1,5 мм: торцы не в одной плоскости)
    hw(b, hatch, tag='hatch')
    for k, az in enumerate((200.0, 340.0)):
        xc = tx(2.70); hl = d(0.42)
        sts = []
        for i in range(9):
            u = -1 + 2 * i / 8; f = math.sqrt(max(1 - u * u, 0.0)) + 0.02
            sts.append((xc + u * hl, az - 22 * f, az + 22 * f, R - 0.008, R + d(0.055) * f))
        arc_shell(b, sts, M_BODY, tag=f'blister{k}')
    def button(bb):
        c = at(tx(2.35), R, 140.0); nr = er(140.0); u_, w_ = _basis(nr)
        ring0 = [c - nr * 0.004 + u_ * (d(0.026) * math.cos(2 * math.pi * k_ / 10)) + w_ * (d(0.026) * math.sin(2 * math.pi * k_ / 10)) for k_ in range(10)]
        ring1 = [c + nr * d(0.020) + u_ * (d(0.015) * math.cos(2 * math.pi * k_ / 10)) + w_ * (d(0.015) * math.sin(2 * math.pi * k_ / 10)) for k_ in range(10)]
        bb.loft([ring0, ring1], M_BODY, cap0=M_BODY, cap1=M_BODY)
    hw(b, button, tag='button')
    return b


# ───────────── винты, торец ─────────────
def screw_row(bb, x, r, n, az0=0.0, rad=0.0048, h=0.0034, mat=M_BRASS, skip=()):
    """Ряд винтов: усечённая пятигранная пирамидка, основание утоплено."""
    for k in range(n):
        az = az0 + 360.0 * k / n
        if any(abs(((az - a + 180.0) % 360.0) - 180.0) < w for a, w in skip): continue
        p = at(x, r, az); nr = er(az); u_, w_ = _basis(nr)
        r0 = [p - nr * 0.001 + u_ * (rad * math.cos(2 * math.pi * k_ / 5)) + w_ * (rad * math.sin(2 * math.pi * k_ / 5)) for k_ in range(5)]
        r1 = [p + nr * h + u_ * (rad * 0.6 * math.cos(2 * math.pi * k_ / 5)) + w_ * (rad * 0.6 * math.sin(2 * math.pi * k_ / 5)) for k_ in range(5)]
        bb.loft([r0, r1], mat, cap0=None, cap1=mat)


def build_hw4():
    b = Bld('ARW_screws')
    fskip = [(a, 9.0) for a in FIN_AZ]
    def rows(bb):
        screw_row(bb, tx(2.79), R + 0.0016, 44, az0=2.0)                                  # кольцо золотых винтов у основания оживала (кадр 1)
        screw_row(bb, tx(2.56), R * 0.978, 40, az0=4.0, rad=0.0036, h=0.0026, mat=M_STEEL)  # мелкие винты на белом кольце
        screw_row(bb, d(1.09), R, 46, az0=1.0, mat=M_BRASS, skip=fskip)                    # кольцо винтов у рулей (кадр 2: золотистые крестовые)
    hw(b, rows, tag='rings')
    def aft(bb):
        for k in range(10):                                                               # винты по кромке торца
            a = math.radians(36.0 * k + 18.0); p = V(math.cos(a) * d(0.455), Yx(0.0), math.sin(a) * d(0.455))
            _cylraw(bb, p + V(0, 0.001, 0), p - V(0, 0.0035, 0), 0.0045, 0.0036, M_STEEL, 6)
        _braw(bb, V(d(0.13), Yx(0.0), -d(0.15)), V(1, 0, 0), V(0, 0, 1), V(0, -1, 0), d(0.085), d(0.070), -0.004, 0.007, M_STEEL)                    # лючок на торце (кадр 2: прямоугольная пластина)
    hw(b, aft, tag='aft_face')
    return b


def finalize(builders):
    groups = {}
    for bl in builders: groups.setdefault('ARW', []).append(bl)
    res = {g: len(check_group(lst)) for g, lst in groups.items()}
    for bl in builders:
        bmesh.ops.remove_doubles(bl.bm, verts=bl.bm.verts, dist=1e-6)
        bl.finish(bl.name)
    return res


def build_all():
    bl = []
    if STAGE >= 1: bl += [build_body()]
    if STAGE >= 2: bl += [build_fins(), build_pods(), build_cheeks()]
    if STAGE >= 3: bl += [build_hw3()]
    if STAGE >= 4: bl += [build_hw4()]
    return finalize(bl)


RES = build_all()
ST = mk.stats(False)
print('build.py: готово', ST['tris'], 'тр.; висящих связок по группам:', RES, ST['per_object'])
print('длина %.3f м, размах %.3f м, высота %.3f м' % (ST['length_m'], ST['span_m'], ST['height_m']))
