# umpk_kit.py — комплект УМПК (унифицированный модуль планирования и коррекции) к ФАБ-500М-62; метры, оси как в fab_bomb.py (ось — Y, нос +Y, начало — середина бомбы, «вверх» +Z, модуль — снизу).
# Источники: 5_инфографика.png (вид сбоку: положение и высота модуля; вид сверху: размах крыльев 2,5 м и ≈ 1 м, их положение по длине), 3_рендер.png (форма носового клина, подвесы, плоские крылья-доски,
# хомуты рулей на кольце), 1–2 — схемы набора Quinta (модуль под бомбой, крылья, рули). Размеры сняты с инфографики (3,27 мм/пикс. по длине бомбы 2,45 м) и округлены.
import math
import bmesh
from mathutils import Vector
from modelkit import B
import fab_bomb as fb
from fab_bomb import Yb, L, G_BODY, G_STEEL, G_SHEET

Z_TOP, Z_BOT = -0.255, -0.370           # верх и низ модуля: под брюхом бомбы (радиус 0,215) остаётся зазор ≈ 4 см под подвесы
W_MOD = 0.20                            # ширина модуля
A_NOSE, A_FULL, A_BOXEND, A_END = 0.065, 0.36, 1.80, 1.90      # кончик клина, начало полного сечения, конец коробки, торец модуля (расстояния от торца взрывателя)


def rect(a, w, z0, z1, x=0.0):
    """Прямоугольное сечение (4 точки) на расстоянии a от носа: ширина w (поперёк), по высоте z0…z1."""
    return [Vector((x - w / 2, Yb(a), z1)), Vector((x + w / 2, Yb(a), z1)), Vector((x + w / 2, Yb(a), z0)), Vector((x - w / 2, Yb(a), z0))]


def module(mat_sheet=G_SHEET):
    """Модуль под бомбой: заострённый клин впереди (четырёхгранная пирамида), коробка постоянного сечения, чуть суженный торец; снизу — направляющая-труба."""
    zc = (Z_TOP + Z_BOT) / 2
    b = B()
    b.loft([rect(A_NOSE, 0.02, zc - 0.008, zc + 0.008), rect(A_FULL, W_MOD, Z_BOT, Z_TOP), rect(A_BOXEND, W_MOD, Z_BOT, Z_TOP), rect(A_END, 0.15, Z_BOT + 0.012, Z_TOP - 0.012)], mat_sheet, cap0=mat_sheet, cap1=mat_sheet)
    return b.finish('UMP_module')


def hangers(mat=G_STEEL):
    """Подвесы модуля к бомбе: три стойки на бандажах (a = 0,67; 0,93; 1,30) и продольная балка вдоль брюха между передним и задним подвесом."""
    b = B()
    for a in (0.67, 0.93, 1.30):
        R = fb.R_at(a)
        b.loft([rect(a - 0.018, 0.13, Z_TOP - 0.004, -R + 0.004), rect(a + 0.018, 0.13, Z_TOP - 0.004, -R + 0.004)], mat, cap0=mat, cap1=mat)
    b.loft([rect(0.60, 0.05, Z_TOP - 0.004, -fb.R_CYL + 0.012), rect(1.36, 0.05, Z_TOP - 0.004, -fb.R_at(1.36) + 0.012)], mat, cap0=mat, cap1=mat)
    # направляющая-труба снизу модуля (инфографика: тёмная труба вдоль нижней части)
    n = 12
    ring = lambda a: [Vector((0.022 * math.cos(2 * math.pi * k / n), Yb(a), Z_BOT + 0.004 + 0.022 * math.sin(2 * math.pi * k / n))) for k in range(n)]
    b.loft([ring(0.95), ring(1.88)], mat, cap0=mat, cap1=mat)
    return b.finish('UMP_hangers')


def plank(name, a_center, chord, span, thick, mat_sheet=G_SHEET, z=(Z_TOP + Z_BOT) / 2):
    """Крыло-доска поперёк бомбы (раскрыто): плоская пластина со скруглённой передней кромкой, толщина thick; станции по размаху (−span/2, −0,10, 0, +0,10, +span/2) — центральная нужна игре,
    чтобы поделить крыло на левую и правую консоль по треугольникам (каждая консоль складывается сама); боковые — для консолей анимации Sketchfab."""
    h = thick / 2; a0 = a_center - chord / 2
    prof = [(0.0, 0.0), (0.010, h * 0.85), (0.035, h), (chord - 0.025, h), (chord, h * 0.28), (chord, -h * 0.28), (chord - 0.025, -h), (0.035, -h), (0.010, -h * 0.85)]
    sec = lambda x: [Vector((x, Yb(a0 + da), z + dz)) for da, dz in prof]
    b = B(); b.loft([sec(-span / 2), sec(-W_MOD / 2), sec(0.0), sec(W_MOD / 2), sec(span / 2)], mat_sheet, cap0=mat_sheet, cap1=mat_sheet)   # станции у бортов модуля (±0,10): для анимации Sketchfab консоли отделяются по ним
    return b.finish(name)


WINGS = {'UMP_wingA': (0.62, 0.30, 2.50, 0.030), 'UMP_wingB': (1.76, 0.20, 1.05, 0.024)}      # имя: (a центра хорды, хорда, размах, толщина) — берёт и animate.py


def wings(mat_sheet=G_SHEET):
    return [plank(n, a, c, sp, th, mat_sheet) for n, (a, c, sp, th) in WINGS.items()]


def vanes(mat_sheet=G_SHEET, mat_steel=G_STEEL):
    """Четыре руля хвостового блока на кольце стабилизатора (крестом ×, 45°): плоские пластины от кольца наружу, на хомутах."""
    b = B(); bc = B()
    a0, a1 = 2.360, 2.470; r0, r1, t = fb.R_RING - 0.020, 0.73, 0.012
    for phi in (45.0, 135.0, 225.0, 315.0):
        ph = math.radians(phi); er = Vector((math.cos(ph), 0.0, math.sin(ph))); et = Vector((-math.sin(ph), 0.0, math.cos(ph)))
        face = lambda s: [Vector((0, Yb(a), 0)) + er * r + et * (s * t / 2) for a, r in ((a0, r0), (a0, r1), (a1, r1), (a1, r0))]
        b.loft([face(+1), face(-1)], mat_sheet, cap0=mat_sheet, cap1=mat_sheet)
        # хомут: коробка на кольце, охватывает пластину
        c = Vector((0, Yb(2.416), 0)) + er * fb.R_RING
        face_c = lambda dr: [c + er * dr + et * dt + Vector((0, da, 0)) for dt, da in ((-0.032, -0.040), (0.032, -0.040), (0.032, 0.040), (-0.032, 0.040))]
        bc.loft([face_c(-0.014), face_c(0.026)], mat_steel, cap0=mat_steel, cap1=mat_steel)
    return [b.finish('UMP_vanes'), bc.finish('UMP_clamps')]


def kit(stage=9):
    """Этапы: 4 — модуль с подвесами, 5 — крылья, 6 — рули хвостового блока."""
    out = []
    if stage >= 4: out += [module(), hangers()]
    if stage >= 5: out += wings()
    if stage >= 6: out += vanes()
    return out
