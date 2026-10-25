# build.py — PrSM (Precision Strike Missile, баллистическая ракета с HIMARS/M270; в игре — новое оружие запада, ключ w_prsm, оружие prsm): своя модель по картинкам Mark (Свои/PrSM/): 1 — рендер в горах (три четверти сзади, серый металл,
# жёлтое кольцо на носу, серебристое кольцо на корпусе, ряды заклёпок, четыре малых руля в «×»), 2 — макеты на выставке (белый макет в полный рост: плоский торец с большим соплом и болтами по кромке, шов в одном диаметре от торца, трапециевидные
# рули с лентикулярным ребром; мелкая модель-пусковая слева), 3 — рендер в облаках (вид сбоку: кольца, трафарет, заклёпки, конус на кончике), 4 — фото старта с HIMARS (почти ортогональный вид сбоку: пропорции и профиль носа).
# Справок не искали. Пропорции — с картинок: длина / диаметр ≈ 8,4 по фото старта (24 пикс. при длине 195; на рендерах корпус выглядит короче и толще из-за близкой камеры), профиль носа — по замерам на фото старта (касательный оживал
# длиной 3,25 диаметра, тупой кончик), положения колец и швов — по рендерам 1 и 3 с поправкой на перспективу (все продольные расстояния растянуты в 1,35 раза до масштаба фото). Масштаб: у PrSM нет прежней модели в игре; взят
# MGM-140 ATACMS (w_atacms.glb) — та же пусковая, тот же контейнер: длина 4,2336 м ≈ его 4,23 м, диаметр 0,504 м (у ATACMS 0,607 м — PrSM тоньше: фото старта).
# Метры. Нос +Y (в glTF уйдёт в −Z), начало — середина длины, ось корпуса — Y; рули — «×» (45°, 135°, 225°, 315°); верх +Z. Левая/правая сторона: смотреть с +X — нос справа (так сняты рендеры), трафарет и рельс — с этой стороны.
# Состав (по картинкам): плоский торец с большим соплом (расточка 0,62 диаметра с конусом внутри) и кольцом винтов по кромке (рендер 2); цилиндр со швами и заклёпочными рядами (рендеры 1, 3); широкое серебристое кольцо за трафаретом
# (рендеры 1, 3); оживало 3,25 диаметра с жёлтой лентой и тёмным конусом на кончике, шов с канавкой у основания конуса (рендеры 1, 3, фото 4); хвостовая «юбка» на 10 % шире корпуса с плавным конусом к шву (фото 4, макет 2);
# четыре трапециевидных руля на юбке с лентикулярным ребром (рендеры 1, 2); тонкая продольная прорезь сверху (рендеры 1, 3) и трафареты — только в текстуре.
# Запуск (фоновый Blender): PSM_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# В живом Blender Mark (blender-mcp): PSM_STAGE=1…3 — этапы (1 корпус и нос, 2 рули, 3 заклёпки, винты и рёбра рулей); сцена PRSM создаётся рядом со стандартной.
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

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/PrSM'
STAGE = int(os.environ.get('PSM_STAGE', '9'))
RNG = random.Random(2026)
D = 0.504                          # диаметр корпуса (м): длина ATACMS 4,23 / 8,4
R = D / 2.0                        # радиус корпуса
RA = 0.55 * D                      # радиус хвостовой «юбки» (фото старта: у торца корпус расширяется на 10–15 %: там сидят рули, сложенные в пусковом контейнере)
LD = 8.4                           # длина в диаметрах (фото старта: 195 / 24 ≈ 8,1…8,5)
L = LD * D                         # длина 4,2336 м
S = 1.0                            # числа в метрах
G = 0.0; X0 = 0.0; WT = 0.0
def d(v): return v * D             # диаметры → метры

PFX = 'PSM'
M_BODY, M_DARK, M_STEEL, M_FIN = 0, 1, 2, 3
M_BODY2, M_GLASS, M_RUST = M_FIN, M_STEEL, M_DARK                  # имена, которых ждут общие кирпичи (см. unit_bricks)
mk.configure('PRSM', 1.0, x0=0.0, yc=0.0, rb=R, nseg=40, nose='left')
mk.set_materials([(f'{PFX}_body', (0.21, 0.215, 0.23)),      # серый металл корпуса (по рендерам: светлая сталь с лёгким голубым отливом неба; тёмный нос и кольца — в текстуре)
                  (f'{PFX}_dark', (0.020, 0.021, 0.024)),    # сопло изнутри, расточка
                  (f'{PFX}_steel', (0.40, 0.40, 0.41)),      # серебристое кольцо, заклёпки, винты, ребро руля
                  (f'{PFX}_fin', (0.12, 0.125, 0.14))])      # рули — тёмная сталь (по рендерам рули темнее корпуса)
_RGB = [(0.21, 0.215, 0.23), (0.020, 0.021, 0.024), (0.40, 0.40, 0.41), (0.12, 0.125, 0.14)]
for _m, _c, (_r, _mt) in zip(mk.MATS, _RGB, ((0.40, 0.75), (0.85, 0.0), (0.30, 0.90), (0.42, 0.70))):
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


# ───────────── корпус: торец с соплом, цилиндр со швами и кольцом, оживало с кончиком ─────────────
X_OGV = L - d(3.25)                                     # основание оживала (от торца): 5,15 диаметра
OGV_LEN = d(3.25)
RHO = (R * R + OGV_LEN * OGV_LEN) / (2 * R)             # радиус дуги касательного оживала
X_TIP = L - d(0.80)                                     # шов кончика-конуса (фото старта: у кончика узкий тёмный конус ≈ 0,55 диаметра; рендер 3 — до 1 диаметра)
SEAMS = (d(0.95), d(4.30), X_OGV)                       # окружные швы (канавки): у рулей (рендер 2), перед серебряным кольцом на 4,3 (рендеры 1, 3), у основания оживала
RING = (d(3.55), d(3.84))                               # серебристое кольцо
YEL = L - d(2.50)                                       # центр жёлтой ленты (цветом в текстуре; на фото старта она — светлая полоса на границе тёмного носа, 2,4–2,65 диаметра от кончика)


def ogive_r(x):
    """Радиус касательного оживала на расстоянии x от торца; кончик затуплен (≥ 0,6 % диаметра)."""
    s = L - x
    return max(math.sqrt(max(RHO * RHO - (OGV_LEN - s) ** 2, 0.0)) + R - RHO, 0.0032)


def groove(add, x, r, w=0.0035, dp=0.0024, m=M_BODY):       # стенки канавки круче 32°: рёбра острые, и длинные грани не дают полосатости в нормалях
    add(x - w, r, m); add(x, r - dp, m); add(x + w, r, m)


def body_profile():
    P = []; M = []
    def add(x, r, m=M_BODY): P.append((x, r)); M.append(m)
    # сопло (рендер 2: плоский торец с большой расточкой, внутри — конус сужения): дно, конус, цилиндрическая губа, торцевое кольцо, скругление кромки
    add(d(0.52), 0.0006, M_DARK); add(d(0.52), d(0.17), M_DARK); add(d(0.24), d(0.31), M_DARK); add(0.0, d(0.31), M_DARK)
    add(0.0, d(0.315), M_BODY); add(0.0, RA - d(0.050), M_BODY)
    for deg in (22.5, 45.0, 67.5): a_ = math.radians(deg); add(d(0.050) - d(0.050) * math.cos(a_), (RA - d(0.050)) + d(0.050) * math.sin(a_))
    add(d(0.050), RA)
    add(d(0.66), RA)                                                 # хвостовая «юбка» (с рулями) и плавный конус к основному диаметру (фото старта, рендер 2: косой шов)
    add(d(0.93), R)
    # цилиндр до шва у рулей, затем швы и серебристое кольцо
    groove(add, SEAMS[0], R)
    add(RING[0] - 0.006, R); add(RING[0], R + 0.0042, M_STEEL); add(RING[1], R + 0.0042, M_STEEL); add(RING[1] + 0.006, R)
    groove(add, SEAMS[1], R)
    # оживало: станции чаще у кончика; шов основания и шов кончика-конуса
    groove(add, SEAMS[2], R)
    xs = [SEAMS[2] + 0.006 + k * ((X_TIP - 0.02) - (SEAMS[2] + 0.006)) / 17 for k in range(1, 18)]
    for x in xs: add(x, ogive_r(x))
    groove(add, X_TIP, ogive_r(X_TIP), w=0.0030, dp=0.0020)
    for x in (X_TIP + (L - X_TIP) * 0.30, X_TIP + (L - X_TIP) * 0.55, X_TIP + (L - X_TIP) * 0.78): add(x, ogive_r(x))
    add(L - 0.012, ogive_r(L - 0.012)); add(L - 0.005, 0.0045); add(L, 0.0006)
    return P, M[:-1]


def build_body():
    b = Bld('PSM_body'); P, M = body_profile()
    revolve_profile(b, P, M, nseg=40, a0=0.0, tag='body')
    return b


# ───────────── рули «×» с лентикулярным ребром ─────────────
FIN_AZ = (45.0, 135.0, 225.0, 315.0)
# трапеция по макету (рендер 2): корень 0,82 диаметра (по макету он занимает почти всю юбку, на рендерах руль мельче — взята середина), кончик 0,30, высота над юбкой 0,53 диаметра, стреловидность передней кромки ≈ 20°, задняя кромка сходится к кончику
FIN = dict(xte_r=d(0.08), xle_r=d(0.90), xte_t=d(0.40), xle_t=d(0.70), s_r=R - 0.014, s_t=R + d(0.58), t_r=d(0.045), t_t=d(0.024))


@piece
def finplate(b, az, xte_r, xle_r, xte_t, xle_t, s_r, s_t, t_r, t_t, mat):
    """Руль: трапециевидная пластина с плоскими гранями и скруглёнными кромками (макет: ровные плоскости, ребро отдельно); корень утоплен в корпус."""
    def ring(x_le, x_te, s, t):
        c = x_le - x_te
        pts = [(x_le, 0.0), (x_le - 0.12 * c, t / 2), (x_te + 0.10 * c, t / 2), (x_te, t * 0.20), (x_te, -t * 0.20), (x_te + 0.10 * c, -t / 2), (x_le - 0.12 * c, -t / 2)]
        return [et(az) * tt + er(az) * s + V(0, Yx(xx), 0) for xx, tt in pts]
    xl_m, xt_m, s_m, t_m = (xle_r + xle_t) / 2, (xte_r + xte_t) / 2, (s_r + s_t) / 2, (t_r + t_t) / 2
    b.loft([ring(xle_r, xte_r, s_r, t_r), ring(xl_m, xt_m, s_m, t_m), ring(xle_t, xte_t, s_t, t_t)], mat, cap0=mat, cap1=mat)


def fin_at(P, s):
    """Кромки и толщина руля на радиусе s: (x передней, x задней, толщина)."""
    f = (s - P['s_r']) / (P['s_t'] - P['s_r'])
    return (P['xle_r'] + f * (P['xle_t'] - P['xle_r']), P['xte_r'] + f * (P['xte_t'] - P['xte_r']), P['t_r'] + f * (P['t_t'] - P['t_r']))


def ov_pad(bb, c, major, n, a, bw, h, mat, k=10):
    """Лентикулярное ребро на грани руля: центр c, большая ось major (в плоскости грани), наружу n; полуоси a и bw, высота h; основание утоплено на 4 мм."""
    c = Vector(c); major = Vector(major).normalized(); n = Vector(n).normalized(); minor = n.cross(major).normalized()
    def ring(sc, off): return [c + major * (a * sc * math.cos(2 * math.pi * i / k)) + minor * (bw * sc * math.sin(2 * math.pi * i / k)) + n * off for i in range(k)]
    bb.loft([ring(1.0, -0.004), ring(1.0, h * 0.50), ring(0.86, h * 0.9), ring(0.35, h)], mat, cap0=mat, cap1=mat)


def build_fins():
    b = Bld('PSM_fins')
    for k, az in enumerate(FIN_AZ): finplate(b, az, mat=M_FIN, tag=f'fin{k}', **FIN)
    return b


def fin_ribs(bb):
    """Лентикулярные рёбра на обеих гранях каждого руля, наискось (по макету: от передней кромки у корня к задней у середины высоты)."""
    for az in FIN_AZ:
        e, t = er(az), et(az)
        s0 = RA + d(0.20); x_le, x_te, tt = fin_at(FIN, s0); xc = x_te + 0.46 * (x_le - x_te)
        major = V(0, math.cos(math.radians(32)), 0) * (-1) + e * math.sin(math.radians(32))      # большая ось: наружу и к хвосту
        for sd in (-1, 1):
            c = V(0, Yx(xc), 0) + e * s0 + t * (sd * tt / 2.0)
            ov_pad(bb, c, major, t * sd, d(0.20), d(0.030), d(0.020), M_STEEL)


# ───────────── мелочь: заклёпки, винты, карманы приводов ─────────────
def rivet_row(bb, x, r, n, az0=0.0, rad=0.0042, h=0.0024, skip=()):
    """Ряд заклёпок вокруг оси на сечении x: n штук, шляпка — усечённая пятигранная пирамидка, основание утоплено на 1 мм."""
    for k in range(n):
        az = az0 + 360.0 * k / n
        if any(abs(((az - a + 180.0) % 360.0) - 180.0) < w for a, w in skip): continue
        p = at(x, r, az); nr = er(az); u_, w_ = _basis(nr)
        r0 = [p - nr * 0.001 + u_ * (rad * math.cos(2 * math.pi * k_ / 5)) + w_ * (rad * math.sin(2 * math.pi * k_ / 5)) for k_ in range(5)]
        r1 = [p + nr * h + u_ * (rad * 0.6 * math.cos(2 * math.pi * k_ / 5)) + w_ * (rad * 0.6 * math.sin(2 * math.pi * k_ / 5)) for k_ in range(5)]
        bb.loft([r0, r1], M_STEEL, cap0=None, cap1=M_STEEL)                       # усечённая пятигранная пирамидка без нижней крышки (утоплена в корпус)


def build_hw():
    b = Bld('PSM_hw')
    fskip = [(a, 7.0) for a in FIN_AZ]
    def rows(bb):
        rivet_row(bb, d(3.42), R, 40)                                           # двойной ряд перед серебристым кольцом (рендеры 1, 3)
        rivet_row(bb, d(3.495), R, 40, az0=4.5)
        rivet_row(bb, d(4.255), R, 40, az0=2.0)                                  # двойной ряд за кольцом у шва на 4,3
        rivet_row(bb, d(4.345), R, 40, az0=6.5)
        rivet_row(bb, SEAMS[2] - d(0.075), R, 40, az0=1.0)                       # ряд у основания оживала
    hw(b, rows, tag='rivets')
    def screws(bb):
        rivet_row(bb, d(0.78), RA - (RA - R) * (d(0.78) - d(0.66)) / (d(0.93) - d(0.66)), 28, az0=3.0, rad=0.0036, h=0.0020, skip=fskip)      # винты на конусе юбки (рендер 2: пара винтов у шва)
        for k in range(12):                                                     # винты по кромке торца (рендер 2: 12 штук по кольцу)
            a = math.radians(30.0 * k + 15.0); p = V(math.cos(a) * d(0.41), Yx(0.0), math.sin(a) * d(0.41))
            _cylraw(bb, p + V(0, 0.001, 0), p - V(0, 0.0028, 0), 0.0035, 0.0028, M_STEEL, 5)
    hw(b, screws, tag='screws')
    hw(b, fin_ribs, tag='ribs')
    return b


def finalize(builders):
    groups = {}
    for bl in builders: groups.setdefault('PSM', []).append(bl)
    res = {g: len(check_group(lst)) for g, lst in groups.items()}
    for bl in builders:
        bmesh.ops.remove_doubles(bl.bm, verts=bl.bm.verts, dist=1e-6)
        bl.finish(bl.name)
    return res


def build_all():
    bl = []
    if STAGE >= 1: bl += [build_body()]
    if STAGE >= 2: bl += [build_fins()]
    if STAGE >= 3: bl += [build_hw()]
    return finalize(bl)


RES = build_all()
ST = mk.stats(False)
print('build.py: готово', ST['tris'], 'тр.; висящих связок по группам:', RES, ST['per_object'])
print('длина %.3f м, размах %.3f м, высота %.3f м' % (ST['length_m'], ST['span_m'], ST['height_m']))
