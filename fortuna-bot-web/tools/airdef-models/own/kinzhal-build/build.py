# build.py — Х-47М2 «Кинжал» (авиационная баллистическая ракета; в игре — оружие kinzhal, ключ w_kinzhal): своя модель по картинкам Mark (Свои/Кинжал/): 1 — фото носа и оперения (тёмно-серая окраска, швы, овальные
# лючки на рулях, чёрный клин ближнего руля), 2 — МиГ-31К с белой ракетой (весь профиль: конус, цилиндр, хвост усечённым конусом, две пары рулей, щели, круглая заглушка), 3 — серый рендер (длинный конус
# с кольцом у кончика, продольный короб сверху, щели-«двойки»). Справок не искали: размеры и доли — с картинок (перспектива: доли длины считались вдоль оси ракеты на фото 2, радиусы — по толщине корпуса).
# Метры. Длина 7,194 м — как у прежней игровой модели w_kinzhal (правило сборщика: масштаб по ней). Диаметр 0,93 м (отношение длины к диаметру ≈ 7,7 — по фото 2). Нос +Y (в glTF уйдёт в −Z), начало — середина
# длины, ось корпуса — Y; верх (+Z) — сторона подвески: продольный короб сверху (на картинке 3 он на верхней стороне), щели на нижнем боку (на фото 2 они на стороне, обращённой к камере снизу).
# Состав (по картинкам): конус 46 % длины с круглым кончиком и кольцом у кончика (рендер), двойное кольцо на стыке конуса с цилиндром (фото 1); цилиндр со швами; хвост — усечённый конус (сужение ≈ 11°, фото 2) с плоским
# торцом (фото 2); рули «+» двух размеров — крупные сразу за швом хвоста (фото 1 и 2: корень ≈ 0,9 диаметра, стреловидная передняя кромка, почти прямая задняя, овальный лючок на грани) и мелкие на хвосте (фото 2);
# продольный короб сверху от стыка конуса к рулям (рендер); щели на нижнем боку (фото 2: у стыка конуса и на 0,25 длины); круглый лючок на плече (фото 1) и маленькая заглушка (фото 2).
# Запуск (фоновый Blender): KNZ_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# В живом Blender Mark (blender-mcp): KNZ_STAGE=1…4 — этапы (1 корпус, 2 рули, 3 короб, лючки, швы, 4 мелочь); сцена KINZHAL создаётся рядом со стандартной.
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

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Кинжал'
STAGE = int(os.environ.get('KNZ_STAGE', '9'))
RNG = random.Random(47)
L = 7.194                          # длина (м): как у прежней игровой модели w_kinzhal
R = 0.465                          # радиус корпуса: Ø 0,93 м
S = 1.0                            # числа в метрах
G = 0.0; X0 = 0.0; WT = 0.0

PFX = 'KNZ'
M_BODY, M_DARK, M_STEEL, M_FIN = 0, 1, 2, 3
M_BODY2, M_GLASS, M_RUST = M_FIN, M_STEEL, M_DARK                  # имена, которых ждут общие кирпичи (см. unit_bricks)
mk.configure('KINZHAL', 1.0, x0=0.0, yc=0.0, rb=R, nseg=40, nose='left')
mk.set_materials([(f'{PFX}_body', (0.66, 0.665, 0.65)),      # белая заводская краска (по фото 2)
                  (f'{PFX}_dark', (0.022, 0.022, 0.024)),    # щели, торцевой диск, зазоры
                  (f'{PFX}_steel', (0.30, 0.30, 0.31)),      # заглушки, винты, кольцо на стыке
                  (f'{PFX}_fin', (0.62, 0.63, 0.62))])       # рули — тот же белый, чуть темнее (отдельный материал для износа)
_RGB = [(0.66, 0.665, 0.65), (0.022, 0.022, 0.024), (0.30, 0.30, 0.31), (0.62, 0.63, 0.62)]
for _m, _c, (_r, _mt) in zip(mk.MATS, _RGB, ((0.52, 0.0), (0.85, 0.0), (0.38, 0.85), (0.55, 0.0))):
    for _n in list(_m.node_tree.nodes):
        if _n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): _m.node_tree.nodes.remove(_n)
    _b = next(n for n in _m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for _l in list(_b.inputs['Base Color'].links): _m.node_tree.links.remove(_l)
    _b.inputs['Base Color'].default_value = (*_c, 1.0)
    _b.inputs['Roughness'].default_value = _r; _b.inputs['Metallic'].default_value = _mt
    try: _b.inputs['Specular IOR Level'].default_value = 0.4
    except Exception: pass

exec(compile(open('/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/_инструменты/unit_bricks.py', encoding='utf-8').read(), 'unit_bricks.py', 'exec'), globals())


def Yx(x): return x - L / 2.0                         # от хвоста (x, м) → Y, нос +Y
def at(x, r, deg):
    """Точка на радиусе r (м) на азимуте deg (0° = +X, 90° = +Z) в сечении x от хвоста."""
    a = math.radians(deg); return V(r * math.cos(a), Yx(x), r * math.sin(a))
def er(az): a = math.radians(az); return V(math.cos(a), 0, math.sin(a))                  # радиальное направление на азимуте
def et(az): a = math.radians(az); return V(-math.sin(a), 0, math.cos(a))                 # поперечное (касательное)


def revolve_profile(b, pts, mats, nseg=40, a0=0.0, tag='body'):
    """Тело вращения вокруг оси Y: pts — [(x от хвоста, радиус)], mats — материал каждого пояса между соседними точками; торцы закрыты."""
    rings = [[at(x, max(r, 1e-4), math.degrees(a0 + 2 * math.pi * k / nseg)) for k in range(nseg)] for x, r in pts]
    b.begin(); b.loft(rings, mats, cap0=mats[0], cap1=mats[-1]); b.end(tag)


# ───────────── корпус: хвост усечённым конусом, цилиндр со швами, конус ─────────────
X_STEP = 0.93                                           # конец хвостовой «лодочной» части (усечённый конус), шов с цилиндром (фото 2: закругление хвоста ≈ 11°, не ступенька)
X_CONE = 0.54 * L                                       # стык конуса с цилиндром (доля 0,54 от хвоста: фото 2 — 0,56, рендер — 0,52)
R_END = 0.285                                           # радиус хвостовой части у торца (после закругления): 0,61 радиуса корпуса
SEAMS = (2.12, 2.92)                                    # окружные швы цилиндра: перед большими рулями (фото 1) и в середине
NOSE_RING = L - 0.62                                    # кольцо у кончика (рендер)


def groove(add, x, r, w=0.0035, d=0.0025, m=M_BODY):          # стенки канавки круче 32° — рёбра острые, и длинные грани между швами не получают плавного градиента нормалей (полосатость)
    add(x - w, r, m); add(x, r - d, m); add(x + w, r, m)


def body_profile():
    P = []; M = []
    def add(x, r, m=M_BODY): P.append((x, r)); M.append(m)
    # торец (по фото 2: плоский закрытый светлый диск с закруглённой кромкой), диск чуть утоплен (2 см) и обведён тёмной канавкой; дальше — усечённый конус к корпусу
    add(0.022, 0.0006); add(0.022, 0.205); add(0.000, 0.218, M_DARK); add(0.000, 0.240)
    for deg in (22.5, 45.0, 67.5): a_ = math.radians(deg); add(0.045 - 0.045 * math.cos(a_), (R_END - 0.045) + 0.045 * math.sin(a_))
    add(0.045, R_END)
    add(X_STEP - 0.004, R - 0.001)
    # шов хвостовой части с цилиндром и швы цилиндра
    groove(add, X_STEP + 0.014, R)
    groove(add, SEAMS[0], R); groove(add, SEAMS[1], R)
    # двойное кольцо на стыке конуса с цилиндром (фото 1): две канавки через 0,12 м, между ними узкая лента стали
    groove(add, X_CONE - 0.060, R, w=0.0032, d=0.0024); add(X_CONE - 0.020, R); add(X_CONE - 0.018, R + 0.0018, M_STEEL); add(X_CONE + 0.044, R + 0.0018, M_STEEL); add(X_CONE + 0.046, R, M_BODY)
    groove(add, X_CONE + 0.060, R, w=0.0032, d=0.0024)
    # конус: прямой до кольца у кончика, дальше — кончик со скруглением
    def rc(x): return R - (R - 0.060) * (x - (X_CONE + 0.066)) / ((L - 0.11) - (X_CONE + 0.066))
    xs = [X_CONE + 0.066 + k * ((NOSE_RING - 0.02) - (X_CONE + 0.066)) / 9 for k in range(1, 10)]
    for x in xs: add(x, rc(x))
    groove(add, NOSE_RING, rc(NOSE_RING), w=0.0028, d=0.0020)
    for x in (NOSE_RING + 0.20, NOSE_RING + 0.40): add(x, rc(x))
    add(L - 0.11, 0.060); add(L - 0.075, 0.052); add(L - 0.040, 0.036); add(L - 0.015, 0.018); add(L, 0.0006)
    return P, M[:-1]


def build_body():
    b = Bld('KNZ_body'); P, M = body_profile()
    revolve_profile(b, P, M, nseg=40, a0=0.0, tag='body')
    return b


# ───────────── рули «+»: большие за швом хвоста, малые на хвосте ─────────────
FIN_AZ = (0.0, 90.0, 180.0, 270.0)                      # «+»: руль наверху стоит у продольного короба, нижний — на стороне щелей
BIG_F = dict(xte_r=1.00, xle_r=1.86, xte_t=1.055, xle_t=1.27, s_r=R - 0.03, s_t=R + 0.52, t_r=0.050, t_t=0.026)        # корень 0,86 м (по фото 2 — сразу за плечом: 0,68 м, по фото 1 — до 0,98 м), конец 0,22 м, высота 0,52 м, передняя кромка ≈ 49° от радиуса
SMALL_F = dict(xte_r=0.30, xle_r=0.84, xte_t=0.34, xle_t=0.50, s_r=0.26, s_t=0.76, t_r=0.036, t_t=0.020)                 # мелкие на хвостовой части: корень 0,54 м, высота ≈ 0,42 м над поверхностью


@piece
def finplate(b, az, xte_r, xle_r, xte_t, xle_t, s_r, s_t, t_r, t_t, mat):
    """Руль: трапеция, профиль — вытянутый ромб (хребет на 45 % хорды от передней кромки), задняя кромка тонкая; корень утоплен в корпус."""
    def ring(x_le, x_te, s, t):
        xr = x_le - 0.45 * (x_le - x_te)
        return [et(az) * tt + er(az) * s + V(0, Yx(xx), 0) for xx, tt in ((x_le, 0.0), (xr, t / 2), (x_te, t * 0.10), (x_te, -t * 0.10), (xr, -t / 2))]
    xl_m, xt_m, s_m, t_m = (xle_r + xle_t) / 2, (xte_r + xte_t) / 2, (s_r + s_t) / 2, (t_r + t_t) / 2
    b.loft([ring(xle_r, xte_r, s_r, t_r), ring(xl_m, xt_m, s_m, t_m), ring(xle_t, xte_t, s_t, t_t)], mat, cap0=mat, cap1=mat)


def build_fins():
    b = Bld('KNZ_fins')
    for k, az in enumerate(FIN_AZ):
        finplate(b, az, mat=M_FIN, tag=f'big{k}', **BIG_F)
        finplate(b, az, mat=M_FIN, tag=f'small{k}', **SMALL_F)
    return b


# ───────────── продольный короб, лючки на рулях и корпусе, щели ─────────────
@piece
def strip(b, az, stations, mat):
    """Низкая накладка вдоль корпуса на азимуте az: stations — [(x, полуширина, высота над поверхностью)], сечение — трапеция, утоплена на 12 мм."""
    e, t = er(az), et(az)
    def ring(x, hw_, h):
        c = V(0, Yx(x), 0)
        return [c + e * (R - 0.012) - t * hw_, c + e * (R - 0.012) + t * hw_, c + e * (R + h) + t * hw_ * 0.82, c + e * (R + h) - t * hw_ * 0.82]
    b.loft([ring(*s) for s in stations], mat, cap0=mat, cap1=mat)


def fin_geom(P, s):
    """Кромки и толщина руля на радиусе s: (x передней, x задней, толщина)."""
    f = (s - P['s_r']) / (P['s_t'] - P['s_r'])
    return (P['xle_r'] + f * (P['xle_t'] - P['xle_r']), P['xte_r'] + f * (P['xte_t'] - P['xte_r']), P['t_r'] + f * (P['t_t'] - P['t_r']))


def build_dorsal():
    """Продольный короб сверху (рендер): от стыка конуса к большим рулям, плавные концы; канавка по оси — в нормалях."""
    b = Bld('KNZ_hw')
    strip(b, 90.0, [(1.98, 0.030, 0.012), (2.10, 0.062, 0.036), (3.78, 0.062, 0.036), (3.90, 0.034, 0.014)], M_BODY, tag='dorsal')
    return b


def surf_disc(bb, x, az, rad, r0, off0, off1, mat, k=24):
    """Плоская накладка-диск на цилиндре радиуса r0: кольца точек по дуге и вдоль оси от off0 до off1 над поверхностью (прилегает к кривизне)."""
    def ring(sc, off):
        pts = []
        for i in range(k):
            a = 2 * math.pi * i / k
            pts.append(at(x + rad * sc * math.sin(a), r0 + off, az + math.degrees(rad * sc * math.cos(a) / r0)))
        return pts
    bb.loft([ring(1.0, off0), ring(1.0, off1), ring(0.93, off1 + 0.0012)], mat, cap0=mat, cap1=mat)


def ov_pad(bb, c, major, n, a, bw, h, mat, k=16):
    """Овальная накладка на грани руля: центр c на грани, большая ось major (в плоскости грани), наружу n; полуоси a и bw, высота h, основание утоплено на 6 мм."""
    c = Vector(c); major = Vector(major).normalized(); n = Vector(n).normalized(); minor = n.cross(major).normalized()
    def ring(sc, off): return [c + major * (a * sc * math.cos(2 * math.pi * i / k)) + minor * (bw * sc * math.sin(2 * math.pi * i / k)) + n * off for i in range(k)]
    bb.loft([ring(1.0, -0.006), ring(1.0, h * 0.55), ring(0.84, h)], mat, cap0=mat, cap1=mat)


def build_hatches(b):
    """Круглый лючок на корпусе между рулями (фото 1: Ø ≈ 0,22 м, с кольцом и шестью винтами), маленькая заглушка на хвостовой части (фото 2), овальные лючки на больших рулях (фото 1: ≈ 0,31 × 0,10 м)."""
    def round_hatch(bb):
        az = 225.0; x = 1.42
        surf_disc(bb, x, az, 0.110, R, -0.008, 0.004, M_FIN)                                            # крышка Ø 0,22 м
        surf_disc(bb, x, az, 0.084, R, 0.003, 0.0058, M_STEEL, k=20)                                    # внутренний диск
        for k in range(6):
            a_ = math.radians(60 * k + 10); p = at(x + 0.097 * math.sin(a_), R, az + math.degrees(0.097 * math.cos(a_) / R)); e = er(az + math.degrees(0.097 * math.cos(a_) / R))
            _cylraw(bb, p - e * 0.003, p + e * 0.0072, 0.0075, 0.0065, M_STEEL, 6)                       # шесть винтов по краю
        rd = R_END + (R - R_END) * (0.70 - 0.045) / (X_STEP - 0.045)
        surf_disc(bb, 0.70, 160.0, 0.030, rd, -0.006, 0.005, M_STEEL, k=12)                               # заглушка на барабане
    hw(b, round_hatch, tag='hatches')
    def fin_ovals(bb):
        for az in FIN_AZ:
            e, t = er(az), et(az)
            s0 = R + 0.15; x_le, x_te, tt = fin_geom(BIG_F, s0); xr = x_le - 0.45 * (x_le - x_te)
            major = V(0, -math.cos(math.radians(60)), 0) + e * math.sin(math.radians(60))                # большая ось уходит к хвосту по мере удаления от корня (фото 1)
            for sd in (-1, 1):
                c = V(0, Yx(xr + 0.03), 0) + e * s0 + t * (sd * tt / 2.0)
                ov_pad(bb, c, major, t * sd, 0.155, 0.050, 0.0035, M_FIN)
    hw(b, fin_ovals, tag='fin_ovals')


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
    if STAGE >= 2: bl += [build_fins()]
    if STAGE >= 3:
        hwb = build_dorsal(); build_hatches(hwb); bl += [hwb]
    return finalize(bl)


RES = build_all()
ST = mk.stats(False)
print('build.py: готово', ST['tris'], 'тр.; висящих связок по группам:', RES, ST['per_object'])
print('длина %.3f м, размах %.3f м, высота %.3f м' % (ST['length_m'], ST['span_m'], ST['height_m']))
