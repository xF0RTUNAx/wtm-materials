# fab_bomb.py — геометрия ФАБ-500М-62 для build.py обеих моделей («ФАБ-500М62» — одна бомба, «УМПК» — бомба с комплектом). Всё в метрах: ось бомбы — Y, нос +Y, начало — середина длины
# от торца взрывателя до торца кольца стабилизатора, «вверх» (проушины) — +Z. Файл лежит в обеих папках — менять в обеих сразу (или копировать).
# Источники: 4_чертёж_ФАБ-500М-62Т.png (технический чертёж сбоку, нос слева — главный: контур, проушины, стабилизатор), 5_инфографика.png (вид сбоку с УМПК и вид сверху с размерами),
# 3_рендер.png (чужой рендер: только детали — бандажи, кольцо, хомуты, взрыватель; меши свои). Размеры сняты с чертежа в пикселях (4,54 мм/пикс. при длине 2,45 м) и переведены в метры.
import math
import bpy
from mathutils import Vector
import modelkit as mk
from modelkit import B

L = 2.45                                  # длина: торец взрывателя … торец кольца
NSEG = 32
G_BODY, G_STEEL, G_SHEET = 0, 1, 2        # индексы материалов (build.py задаёт список в этом порядке)


def Yb(a): return L / 2 - a               # a — расстояние от торца взрывателя (м) → координата Y


def ringpts(a, R, n=NSEG, cx=0.0, cz=0.0, a0=0.0):
    """Кольцо радиуса R на расстоянии a от носа, центр (cx, cz); угол 0 — +X, 90° — +Z (вверх)."""
    return [Vector((cx + R * math.cos(a0 + 2 * math.pi * k / n), Yb(a), cz + R * math.sin(a0 + 2 * math.pi * k / n))) for k in range(n)]


def with_grooves(base, grooves, gmat):
    """base — [(a, R, материал полосы до следующей точки)] по возрастанию a; grooves — [(a, полуширина, глубина)] — канавки в прямых участках (стыки секций)."""
    out = []
    for i in range(len(base) - 1):
        xa, Ra, ma = base[i]; xb, Rb, _ = base[i + 1]
        out.append((xa, Ra, ma))
        if xb > xa:
            Rat = lambda x: Ra + (Rb - Ra) * (x - xa) / (xb - xa)
            for gx, hw, d in sorted(g for g in grooves if xa + 1e-4 <= g[0] - g[1] and g[0] + g[1] <= xb - 1e-4):
                out += [(gx - hw, Rat(gx - hw), gmat), (gx - hw, Rat(gx - hw) - d, gmat), (gx + hw, Rat(gx + hw) - d, gmat), (gx + hw, Rat(gx + hw), ma)]
    out.append(base[-1])
    return out


# ── профиль корпуса (а — от торца взрывателя, R — радиус), снят с чертежа 4: оживало 0,54 м, цилиндр до 1,17 м, длинный конус хвоста, хвостовая труба ──
R_CYL = 0.215
R_TAIL = 0.075
A_OG_END, A_CONE0, A_CONE1, A_END = 0.544, 1.171, 2.30, 2.427
OGIVE = [(0.036, 0.036), (0.091, 0.095), (0.136, 0.122), (0.181, 0.141), (0.227, 0.157), (0.272, 0.170), (0.318, 0.181), (0.363, 0.191), (0.408, 0.200),
         (0.454, 0.206), (0.499, 0.210), (0.544, R_CYL)]


def R_at(a):
    """Радиус корпуса на расстоянии a от носа (по профилю)."""
    pts = [(0.0, 0.0235)] + [(p[0], p[1]) for p in OGIVE] + [(A_CONE0, R_CYL), (A_CONE1, R_TAIL), (A_END, R_TAIL)]
    for (a0, r0), (a1, r1) in zip(pts, pts[1:]):
        if a0 <= a <= a1: return r0 + (r1 - r0) * (a - a0) / max(a1 - a0, 1e-9)
    return R_TAIL


def body(col_mats=(G_BODY, G_STEEL)):
    """Корпус одним замкнутым телом вращения: взрыватель (сталь), оживало, цилиндр, конус хвоста, хвостовая труба; стыки секций — канавки."""
    gb, gs = col_mats
    base = [(0.0, 0.006, gs), (0.0, 0.021, gs), (0.004, 0.0235, gs), (0.044, 0.0235, gs),              # взрыватель — малый цилиндр с фаской
            (0.050, 0.030, gb)] + [(a, R, gb) for a, R in OGIVE] + [(A_CONE0, R_CYL, gb), (A_CONE1, R_TAIL, gb), (A_END, R_TAIL, gb), (A_END, 0.006, gb)]
    prof = with_grooves(base, [(0.560, 0.0025, 0.0022), (A_CONE0 + 0.012, 0.0025, 0.0022)], gb)
    b = B(); b.loft([ringpts(a, R) for a, R, m in prof], [m for a, R, m in prof][:-1], cap0=gs, cap1=gb)
    return b.finish('F50_body')


def band(b, a, w, R, th, mat):
    """Бандаж (стальная лента) шириной w на расстоянии a от носа, поверх радиуса R толщиной th: короткий цилиндр-оболочка."""
    b.loft([ringpts(a - w / 2, R), ringpts(a - w / 2, R + th), ringpts(a + w / 2, R + th), ringpts(a + w / 2, R)], mat, cap0=None, cap1=None)


def lug(b, a, R, mat):
    """Подвесное ушко (скоба): дуга над бандажом, сечение — трапеция, на верхней образующей."""
    h, w, d = 0.034, 0.036, 0.016         # высота над корпусом, ширина вдоль оси, толщина поперёк
    pts = lambda x, hh, dd: [Vector((-dd, Yb(x), R + hh)), Vector((dd, Yb(x), R + hh)), Vector((dd, Yb(x), R - 0.004)), Vector((-dd, Yb(x), R - 0.004))]
    # две стойки и перемычка: упрощённо — арка из трёх призм
    for s in (-1, 1):
        b.loft([pts(a + s * w / 2 - 0.004, h, d * 0.55), pts(a + s * w / 2 + 0.004, h, d * 0.55)], mat, cap0=mat, cap1=mat)
    b.loft([[Vector((-d * 0.55, Yb(a - w / 2), R + h)), Vector((d * 0.55, Yb(a - w / 2), R + h)), Vector((d * 0.55, Yb(a - w / 2), R + h - 0.008)), Vector((-d * 0.55, Yb(a - w / 2), R + h - 0.008))],
            [Vector((-d * 0.55, Yb(a + w / 2), R + h)), Vector((d * 0.55, Yb(a + w / 2), R + h)), Vector((d * 0.55, Yb(a + w / 2), R + h - 0.008)), Vector((-d * 0.55, Yb(a + w / 2), R + h - 0.008))]], mat, cap0=mat, cap1=mat)


def fittings(mat=G_STEEL):
    """Бандажи на цилиндре и на конусе, два подвесных ушка (на бандажах, шаг 0,26 м), лючок хвостового взрывателя сверху."""
    b = B()
    for a, w in ((0.67, 0.085), (0.93, 0.085)):
        band(b, a, w, R_CYL, 0.004, mat); lug(b, a, R_CYL + 0.004, mat)
    band(b, 1.30, 0.060, R_at(1.30), 0.004, mat)                       # хвостовой бандаж с замком
    for dz in (0.0,):                                                  # замок хвостового бандажа: два болта сбоку
        for s in (-1, 1):
            c = Vector((s * (R_at(1.30) + 0.012), Yb(1.30), 0.0))
            b.loft([[c + Vector((-0.010, -0.016, -0.014)), c + Vector((0.010, -0.016, -0.014)), c + Vector((0.010, 0.016, -0.014)), c + Vector((-0.010, 0.016, -0.014))],
                    [c + Vector((-0.010, -0.016, 0.014)), c + Vector((0.010, -0.016, 0.014)), c + Vector((0.010, 0.016, 0.014)), c + Vector((-0.010, 0.016, 0.014))]], mat, cap0=mat, cap1=mat)
    # лючок: плоский диск на верхней образующей конуса
    a_h = 1.55; r_h = R_at(a_h)
    b.loft([[Vector((0.026 * math.cos(2 * math.pi * k / 16), Yb(a_h) + 0.026 * math.sin(2 * math.pi * k / 16), r_h - 0.003)) for k in range(16)],
            [Vector((0.026 * math.cos(2 * math.pi * k / 16), Yb(a_h) + 0.026 * math.sin(2 * math.pi * k / 16), r_h + 0.004)) for k in range(16)]], mat, cap0=mat, cap1=mat)
    return b.finish('F50_fittings')


# ── стабилизатор: четыре трапециевидных крыла «+» и кольцо по концам ──
A_FIN0, A_FIN1, A_RING0, A_RING1 = 1.883, 1.951, 2.382, 2.450
R_RING = 0.275


def fins(mat=G_BODY):
    """Четыре стабилизатора «+» (одно — вверх, к проушинам): пластина толщиной 10 мм; корень по конусу и трубе, внешняя кромка раскрыта до кольца."""
    b = B(); t = 0.010
    for phi in (0.0, 90.0, 180.0, 270.0):
        ph = math.radians(phi); er = Vector((math.cos(ph), 0.0, math.sin(ph))); et = Vector((-math.sin(ph), 0.0, math.cos(ph)))
        poly = [(A_FIN0, R_at(A_FIN0) - 0.006), (A_FIN1, 0.190), (A_RING0 + 0.006, R_RING - 0.004), (A_RING0 + 0.006, R_TAIL - 0.006)]     # (a, r): передний корень, передний конец, задний конец, задний корень
        face = lambda s: [Vector((0, Yb(a), 0)) + er * r + et * (s * t / 2) for a, r in poly]
        b.loft([face(+1), face(-1)], mat, cap0=mat, cap1=mat)
    return b.finish('F50_fins')


def ring_hoop(mat=G_STEEL):
    """Кольцо стабилизатора — тонкая стальная лента шириной ≈ 7 см по концам крыльев (на рендере — обруч)."""
    b = B()
    rings = [ringpts(A_RING0, R_RING), ringpts(A_RING1, R_RING), ringpts(A_RING1, R_RING - 0.010), ringpts(A_RING0, R_RING - 0.010), ringpts(A_RING0, R_RING)]
    b.loft(rings, mat, cap0=None, cap1=None)
    import bmesh
    bmesh.ops.remove_doubles(b.bm, verts=b.bm.verts[:], dist=1e-5)
    return b.finish('F50_ring')


def bomb(stage=9):
    """Строит бомбу в текущую коллекцию (после mk.configure и mk.set_materials): этапы 1 — корпус, 2 — бандажи, ушки, лючок, 3 — стабилизатор с кольцом."""
    out = [body()]
    if stage >= 2: out.append(fittings())
    if stage >= 3: out += [fins(), ring_hoop()]
    return out
