# build.py — MGM-52 Lance (ракета комплекса «Ланс»): своя модель по картинкам Mark (Свои/MGM-52/): 1 — пуск: ракета поднята на M752, вид снизу-сзади (оливковая окраска, оперение, сопло),
# 2 — белая ракета стоит (макет, оперение «+»), 3 — ракета лёжа на M752 (музей: нос светлее, «U.S. ARMY», два шва, ремень, хвостовая крышка), 4 — ч/б снимок на прицепной пусковой (бок: профиль, оперение, полосы),
# 5 — рисунок M752 (только пусковая). Профиль снят с картинки 4, повёрнутой до горизонтали (замеры в _измерения/): длина 426 пикс., радиус цилиндра 19 пикс. (Ø/L = 0,089), хвостовая секция 0,69 радиуса и длиной 0,15 L,
# оживало — касательное, длиной 0,33 L (проверено по радиусам станций). Длина 6,17 м и Ø 0,55 м — ПРЕДПОЛОЖЕНИЕ по общим знаниям (на картинках масштаба нет, прежней модели в игре нет): Mark может поправить одной цифрой L.
# Оси: нос +Y (в glTF уйдёт в −Z), начало — середина длины, ось ракеты — Y. Оперение — четыре крыла «+» (вверх, вниз, вправо, влево), все три картинки с хвостом (1, 2, 4) показывают именно «+».
# Запуск (фоновый Blender): LNC_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# В отдельном окне Blender «для показа»: LNC_STAGE=1…4 — этапы (1 корпус, 2 оперение и кабельный короб, 3 сопло и ушки, 4 мелочь); живой показ — live.py из Свои/_инструменты/live_blender.
#
# СПИСОК ДЕТАЛЕЙ (сделано / пропущено):
#  + корпус вращением: тупой носик (Ø 15 мм), касательное оживало, цилиндр, швы-канавки (3,33 / 3,64 м от хвоста), плечо к хвостовой секции, хвостовая секция с закруглённой кромкой, сопло — тёмная чаша
#  + четыре крыла «+» — усечённые треугольники с острой передней кромкой (корень 0,65 м, вылет 0,31 м над хвостовой секцией), корни утоплены в корпус
#  (этап 2) кабельный короб вдоль корпуса; (этап 3) ушки пусковой, ремни не нужны (ремень — часть пусковой); (этап 4) заплатки, винты, трафарет — в текстуре
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

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/MGM-52'
STAGE = int(os.environ.get('LNC_STAGE', '9'))
RNG = random.Random(52)
L = 6.17                           # длина ракеты, м (предположение, см. шапку)
R = 0.310                          # радиус цилиндра: Ø 0,62 м (Mark: «ракета толще» — было Ø 0,55 м; число одно, правится здесь)
S = 1.0; G = 0.0; X0 = 0.0; WT = 0.0

PFX = 'LNC'
M_BODY, M_NOSE, M_DARK, M_STEEL = 0, 1, 2, 3
M_BODY2, M_GLASS, M_RUST = M_BODY, M_DARK, M_STEEL
mk.configure('MGM52', 1.0, x0=0.0, yc=0.0, rb=1.0, nseg=48, nose='left')
_SPEC = [(f'{PFX}_body', (0.080, 0.095, 0.045), 0.90, 0.0),      # оливковая заводская краска корпуса (картинки 1 и 3)
         (f'{PFX}_nose', (0.170, 0.160, 0.075), 0.86, 0.0),      # светлее: головная часть жёлто-оливковая (картинка 3)
         (f'{PFX}_dark', (0.040, 0.037, 0.034), 0.95, 0.0),      # сопло, швы, чёрные накладки
         (f'{PFX}_steel', (0.26, 0.26, 0.25), 0.55, 0.45)]       # металл: кромка сопла, ушки, скобы
mk.set_materials([(n, c) for n, c, _, _ in _SPEC])
for _m, (_n, _c, _r, _mt) in zip(mk.MATS, _SPEC):
    _b = next(n for n in _m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    _b.inputs['Roughness'].default_value = _r; _b.inputs['Metallic'].default_value = _mt
    try: _b.inputs['Specular IOR Level'].default_value = 0.15
    except Exception: pass

exec(compile(open('/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/_инструменты/unit_bricks.py', encoding='utf-8').read(), 'unit_bricks.py', 'exec'), globals())


def Yx(x): return x - L / 2.0                         # от хвоста (x, м) → Y, нос +Y
def at(x, r, deg):
    """Точка на радиусе r (м) на азимуте deg (0° = +X, 90° = +Z) в сечении x от хвоста."""
    a = math.radians(deg); return V(r * math.cos(a), Yx(x), r * math.sin(a))
def er(az): a = math.radians(az); return V(math.cos(a), 0, math.sin(a))                   # радиальное направление на азимуте
def et(az): a = math.radians(az); return V(-math.sin(a), 0, math.cos(a))                  # поперечное (касательное)


def revolve_profile(b, pts, mats, nseg=48, a0=0.0, tag='body'):
    """Тело вращения вокруг оси Y: pts — [(x от хвоста, радиус)], mats — материал каждого пояса между соседними точками; торцы закрыты."""
    rings = [[at(x, max(r, 1e-4), math.degrees(a0 + 2 * math.pi * k / nseg)) for k in range(nseg)] for x, r in pts]
    b.begin(); b.loft(rings, mats, cap0=mats[0], cap1=mats[-1]); b.end(tag)


# ───────────── корпус ─────────────
LO = 2.03                                              # длина касательного оживала (0,33 L)
NOSE_LIGHT = 0.95                                      # светлая головная часть: от носика назад, м (картинка 3)
SEAMS = (3.33, 3.64)                                   # швы-канавки на цилиндре (от хвоста, м)
X_OGIVE = L - LO                                       # где цилиндр переходит в оживало
D0 = 0.03                                              # у носика ракету обрезаем плоским торцом Ø 15 мм


def ogive_r(d):
    """Радиус касательного оживала на расстоянии d от носика (м)."""
    rho = (R * R + LO * LO) / (2 * R)
    return math.sqrt(max(rho * rho - (LO - d) ** 2, 0.0)) + R - rho


def body_profile():
    P = []; M = []
    def add(x, r, m): P.append((x, r)); M.append(m)
    # хвост без сужения (Mark): цилиндр полного диаметра до торца; в торце — сопло (тёмная чаша), металлическая кромка, плоский донный срез, закруглённая кромка
    add(0.32, 0.0015, M_DARK); add(0.28, 0.075, M_DARK); add(0.15, 0.140, M_DARK); add(0.03, 0.200, M_DARK)
    add(0.000, 0.206, M_STEEL); add(0.000, 0.236, M_BODY); add(0.000, R - 0.030, M_BODY); add(0.009, R - 0.009, M_BODY); add(0.030, R, M_BODY)
    # цилиндр со швами-канавками
    for xs in SEAMS:
        hw, d = 0.006, 0.0045
        add(xs - hw, R, M_DARK); add(xs - hw, R - d, M_DARK); add(xs + hw, R - d, M_BODY); add(xs + hw, R, M_BODY)
    add(X_OGIVE, R, M_BODY)
    # оживало: станции по расстоянию от носика, светлая часть — M_NOSE
    ds = [LO, 1.80, 1.58, 1.38, 1.20, 1.04, NOSE_LIGHT, 0.80, 0.66, 0.54, 0.43, 0.33, 0.24, 0.16, 0.10, 0.06, D0]
    for d in ds[1:]:
        add(L - d, ogive_r(d), M_NOSE if d <= NOSE_LIGHT + 1e-6 else M_BODY)
    # порядок точек: материал полосы между точкой i и i+1 — это M[i]; у последней точки материала нет
    return P, M[:-1] if len(M) == len(P) else M


def build_body():
    b = Bld('LNC_body'); P, M = body_profile()
    # порядок возрастания x уже соблюдён (хвост → нос); два совпадающих по x кольца (торец) допустимы — это плоский срез
    revolve_profile(b, P, M, nseg=48, a0=0.0, tag='body')
    return b


# ───────────── оперение ─────────────
FIN_AZ = (0.0, 90.0, 180.0, 270.0)                     # крылья «+»
FIN_TIP = 0.62                                         # радиус конца крыла от оси, м (картинка 4 — 0,92 диаметра; на фото 1 оперение крупное — взято чуть больше)
FIN_R = (0.20, R, 0.40, 0.50, FIN_TIP)                 # радиусы станций крыла от оси, м (0,20 — корень внутри корпуса)


def fin_xle(r): return 1.05 if r <= R else 1.05 - 2.35 * (r - R)                     # передняя кромка: корень 1,05 м от торца, стреловидность ≈ 23° от оси
def fin_xte(r): return 0.25 if r <= R else 0.25 - 0.25 * (r - R)                     # задняя кромка: у корня 0,25 м, к концу — немного назад (конец крыла 0,17 м от торца)
def fin_t(r): return 0.036 if r <= R else 0.036 - (0.036 - 0.016) * (r - R) / (FIN_TIP - R)


@piece
def fin(b, az, mat=None):
    """Крыло: ромбовидный профиль (хребет на 30 % хорды), острая передняя кромка, тонкая задняя; корень утоплен в хвостовую секцию."""
    mat = M_BODY if mat is None else mat
    def ring(r):
        xl, xt, t = fin_xle(r), fin_xte(r), fin_t(r); xm = xl - 0.30 * (xl - xt); xn = xl - 0.78 * (xl - xt)
        return [V(0, 0, 0) + et(az) * tt + er(az) * r + V(0, Yx(xx), 0) for xx, tt in ((xl, 0.0), (xm, t / 2), (xn, t * 0.42), (xt, t * 0.12), (xt, -t * 0.12), (xn, -t * 0.42), (xm, -t / 2))]
    b.loft([ring(r) for r in FIN_R], mat, cap0=mat, cap1=mat)


def build_fins():
    b = Bld('LNC_fins')
    for k, az in enumerate(FIN_AZ): fin(b, az, tag=f'fin{k}')
    return b


# ───────────── кабельный короб вдоль корпуса ─────────────
def surf_r(x):
    """Радиус поверхности корпуса на расстоянии x от хвоста (для накладок)."""
    if x <= X_OGIVE: return R
    return ogive_r(L - x)


@piece
def raceway(b, az=45.0, x0=1.35, x1=4.05, w=0.036, h=0.020):
    """Кабельный короб: низкая коробка с коническими концами, лежит на цилиндре между крыльями (картинки 1 и 3)."""
    def ring(x, k):
        e, t = er(az), et(az)
        return [V(0, Yx(x), 0) + e * (R - 0.006) - t * w * k, V(0, Yx(x), 0) + e * (R - 0.006) + t * w * k,
                V(0, Yx(x), 0) + e * (R + h * k) + t * w * 0.85 * k, V(0, Yx(x), 0) + e * (R + h * k) - t * w * 0.85 * k]
    st = [(x0, 0.25), (x0 + 0.08, 0.85), (x0 + 0.14, 1.0), (x1 - 0.14, 1.0), (x1 - 0.08, 0.85), (x1, 0.25)]
    b.loft([ring(x, k) for x, k in st], M_BODY, cap0=M_BODY, cap1=M_BODY)


def build_raceway():
    b = Bld('LNC_race')
    raceway(b, tag='raceway')
    return b


def build_hw():
    b = Bld('LNC_hw')
    def lugs(bb):                                          # подъёмные проушины парами на верхней стороне (картинки 1, 3)
        for x in (2.55, 3.75):
            for az in (80.0, 100.0): eye_(bb, Fr(at(x, R - 0.004, az), er(az), (0, 1, 0)), 0.0, 0.0, R=0.040, r=0.010, mat=M_STEEL)
    hw(b, lugs, tag='lugs')
    PAN = ((1.75, 25.0), (1.75, 155.0), (3.00, 205.0), (4.35, 335.0), (4.35, 125.0), (2.45, 250.0), (3.95, 55.0))
    def screws(bb):                                        # винты по углам накладок (мелкие — плоский объект)
        for x, az in PAN:
            F = Fr(at(x, min(R, surf_r(x)), az), er(az), (0, 1, 0))
            for sa in (-1, 1):
                for sc_ in (-1, 1): F.cyl(bb, sa * 0.088, sc_ * 0.056, 0.005, 0.0105, 0.0045, M_STEEL, n=6)
        F = Fr(at(1.45, R, 205.0), er(205.0), (0, 1, 0)); F.cyl(bb, 0.0, 0.0, 0.010, 0.030, 0.030, M_DARK, n=10)
        for x in (1.70, 2.20, 2.70, 3.20, 3.70):
            G = Fr(at(x, R + 0.020, 45.0), er(45.0), (0, 1, 0)); G.box(bb, 0.0, 0.0, 0.048, 0.010, -0.012, 0.012, M_STEEL)
    hw(b, screws, tag='screws')
    pn = Bld('LNC_pan')                                    # крупные накладки, башмаки и разъём — текстурируемый объект (как корпус: износ, грязь, нормали)
    def panels(bb):
        for x, az in PAN:
            F = Fr(at(x, min(R, surf_r(x)), az), er(az), (0, 1, 0))
            F.box(bb, 0.0, 0.0, 0.105, 0.072, -0.030, 0.0075, M_BODY)
    hw(pn, panels, tag='panels')
    def shoes(bb):                                         # пусковые башмаки снизу (по ним ракета лежит на сёдлах стрелы)
        for x in (2.05, 4.15):
            F = Fr(at(x, R, 270.0), er(270.0), (0, 1, 0))
            F.box(bb, 0.0, 0.0, 0.070, 0.130, -0.030, 0.022, M_STEEL)
            F.box(bb, 0.0, 0.0, 0.030, 0.100, 0.020, 0.030, M_DARK)
        F = Fr(at(1.45, R, 205.0), er(205.0), (0, 1, 0)); F.box(bb, 0.0, 0.0, 0.060, 0.045, -0.030, 0.012, M_STEEL)
    hw(pn, shoes, tag='shoes')
    bolt_circle(b, V(0, Yx(0.0), 0), V(0, -1, 0), R - 0.050, 14, 0.008, 0.010, M_STEEL, n=6, tag='aft_bolts')      # болты по торцу хвоста
    bolt_circle(b, V(0, Yx(0.0), 0), V(0, -1, 0), 0.215, 10, 0.006, 0.008, M_DARK, n=6, tag='nozzle_bolts')
    return b, pn


def finalize(builders):
    groups = {}
    for bl in builders: groups.setdefault(bl.name.split('_')[0], []).append(bl)
    res = {g: len(check_group(lst)) for g, lst in groups.items()}
    for bl in builders:
        bmesh.ops.remove_doubles(bl.bm, verts=bl.bm.verts, dist=1e-6)
        bl.finish(bl.name)
    return res


def build_all():
    bl = []
    if STAGE >= 1: bl += [build_body()]
    if STAGE >= 2: bl += [build_fins(), build_raceway()]
    if STAGE >= 3: hw_, pn_ = build_hw(); bl += [hw_, pn_]
    return finalize(bl)


RES = build_all()
ST = mk.stats(False)
print('build.py: готово', ST['tris'], 'тр.; висящих связок по группам:', RES, ST['per_object'])
print('длина %.3f м, размах %.3f м, высота %.3f м' % (ST['length_m'], ST['span_m'], ST['height_m']))
