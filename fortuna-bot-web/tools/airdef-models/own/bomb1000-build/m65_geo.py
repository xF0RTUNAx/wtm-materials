# m65_geo.py — геометрия AN-M65A1 1000 lb для build.py. Метры: ось бомбы — Y, нос +Y, начало — середина длины (торец лопастей носовой крыльчатки … торец коробки
# стабилизатора, 1,87 м — как у прежней модели игры); «вверх» (проушины) — +Z. a — расстояние от носа (м), Yb(a) — координата Y.
# Размеры сняты с ref_03.png (музейный экземпляр сбоку, нос слева; 1,123 мм/пикс. при длине 1665 пикс. от x = 150 до x = 1815, ось y ≈ 576), устройство хвоста — ref_02.png
# (3/4 сзади). ref_01.png (прежняя модель игры) — только общая форма, меши свои.
import math
import bmesh
from mathutils import Vector, Matrix
import modelkit as mk
from modelkit import B

L = 1.87
NSEG = 32
G_BODY, G_STEEL, G_SHEET, G_VANE = 0, 1, 2, 3          # оливковая краска корпуса; сталь (взрыватели, шток); оливковый лист стабилизатора; светлый металл крыльчаток


def Yb(a): return L / 2 - a


def ringpts(a, R, n=NSEG, a0=0.0):
    """Кольцо радиуса R на расстоянии a от носа; угол 0 — +X, 90° — +Z (вверх). Шов развёртки — внизу (−Z), там его не видно."""
    return [Vector((R * math.cos(a0 + 2 * math.pi * k / n), Yb(a), R * math.sin(a0 + 2 * math.pi * k / n))) for k in range(n)]


# ── профиль корпуса (a, r): взрыватель, тупое оживало с жёлтым кольцом у взрывателя, цилиндр Ø 0,48, оживальная корма, втулка стабилизатора, шток хвостового взрывателя ──
R_CYL = 0.240
OGIVE = [(0.046, 0.046), (0.052, 0.061), (0.062, 0.076), (0.073, 0.090), (0.090, 0.117), (0.112, 0.147), (0.140, 0.172), (0.168, 0.193), (0.197, 0.209),
         (0.225, 0.220), (0.253, 0.228), (0.281, 0.233), (0.337, 0.2378), (0.393, 0.2394), (0.450, R_CYL)]
TAIL = [(1.101, R_CYL), (1.157, 0.2333), (1.202, 0.2211), (1.247, 0.2044), (1.292, 0.1844), (1.336, 0.1644), (1.370, 0.1533), (1.383, 0.1495)]
A_SLV0, A_SLV1, R_SLV = 1.386, 1.4745, 0.1440            # втулка стабилизатора (ref_03: x 1383 … 1463, Ø 0,29)
A_FACE = 1.478                                           # задний торец втулки
A_STEM1 = 1.5365                                         # конец штока — перед ступицей крыльчатки (зазор 0,5 мм)
YELLOW_NOSE = (0.045, 0.073)                             # жёлтое кольцо у носового взрывателя (ref_03: x 190 … 215)
YELLOW_TAIL = (1.230, 1.280)                             # жёлтый пояс на корме (ref_03: x 1245 … 1290)
LUGS = (0.533, 0.915)                                    # проушины (ref_03: x 625 и 965)


def R_at(a):
    pts = [(0.044, 0.033)] + OGIVE + TAIL
    for (a0, r0), (a1, r1) in zip(pts, pts[1:]):
        if a0 <= a <= a1: return r0 + (r1 - r0) * (a - a0) / max(a1 - a0, 1e-9)
    return R_CYL if a < 1.2 else R_SLV


def body_profile():
    S_, Bd, Sh = G_STEEL, G_BODY, G_SHEET
    p = [(0.0125, 0.004, S_), (0.0125, 0.013, S_), (0.016, 0.019, S_), (0.020, 0.0205, S_), (0.0335, 0.0205, S_),          # носовой взрыватель: колпачок, корпус
         (0.0335, 0.0255, S_), (0.0360, 0.0262, S_), (0.0415, 0.0262, S_), (0.0440, 0.0255, S_), (0.044, 0.033, Bd)]           # гайка-воротник, торец корпуса
    p += [(a, r, Bd) for a, r in OGIVE]
    p += [(a, r, Bd) for a, r in TAIL]
    p += [(1.383, 0.1455, Sh), (A_SLV0, R_SLV, Sh), (A_SLV1, R_SLV, Sh), (A_FACE, 0.1405, Sh),                                # стык корпуса со втулкой, втулка
          (A_FACE, 0.024, S_), (1.4835, 0.024, S_), (1.4835, 0.0150, S_), (1.4875, 0.0150, S_), (1.4875, 0.0095, S_),           # гайка штока на торце
          (A_STEM1, 0.0095, S_), (A_STEM1, 0.003, S_)]
    return p


def body():
    prof = body_profile()
    b = B(); b.loft([ringpts(a, r, a0=-math.pi / 2) for a, r, m in prof], [m for a, r, m in prof][:-1], cap0=G_STEEL, cap1=G_STEEL)
    return b.finish('M65_body')


# ── проушины: бобышка на корпусе и кольцо-рым в плоскости оси ──
def _torus(b, c, major, minor, mat, n_maj=18, n_min=8):
    rings = []
    for i in range(n_maj):
        th = 2 * math.pi * i / n_maj
        rad = Vector((0.0, math.cos(th), math.sin(th)))
        cc = c + rad * major
        rings.append([cc + (rad * math.cos(2 * math.pi * j / n_min) + Vector((1.0, 0.0, 0.0)) * math.sin(2 * math.pi * j / n_min)) * minor for j in range(n_min)])
    rings.append(rings[0])
    b.loft(rings, mat)


def cyl(b, c, axis, rad, length, mat, n=12, e1=None):
    axis = axis.normalized(); e1 = (e1 or (Vector((1, 0, 0)) if abs(axis.x) < 0.9 else Vector((0, 0, 1)))); e1 = (e1 - axis * e1.dot(axis)).normalized(); e2 = axis.cross(e1)
    ring = lambda sh: [c + axis * sh + (e1 * math.cos(2 * math.pi * k / n) + e2 * math.sin(2 * math.pi * k / n)) * rad for k in range(n)]
    b.loft([ring(-length / 2), ring(length / 2)], mat, cap0=mat, cap1=mat)


def lugs():
    b = B()
    for a in LUGS:
        R = R_at(a)
        cyl(b, Vector((0.0, Yb(a), R + 0.001)), Vector((0, 0, 1)), 0.017, 0.014, G_BODY, n=16)                 # бобышка (нижний край в корпусе)
        cyl(b, Vector((0.0, Yb(a), R + 0.0095)), Vector((0, 0, 1)), 0.0085, 0.006, G_BODY, n=12)                # шейка рыма
        _torus(b, Vector((0.0, Yb(a), R + 0.0115 + 0.0165)), 0.0165, 0.0045, G_BODY)
    bm = b.bm; bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    return b.finish('M65_lugs')


# ── стабилизатор: четыре пера крестом × от втулки, отогнутая кромка на конце пера, квадратная коробка с U-вырезами спереди (ref_02, ref_03) ──
FIN_T = 0.004
FIN = [(A_SLV0 + 0.001, R_SLV - 0.002), (1.520, 0.320), (1.830, 0.320), (1.830, 0.155), (A_FACE, R_SLV - 0.002)]   # (a, r): корень у втулки, конец пера, задняя кромка, внутренняя кромка
BOX_H, BOX_T = 0.125, 0.003                              # половина ширины коробки (до внутренней грани), толщина листа
BOX_A0, BOX_A1 = 1.513, L                                # передний и задний край коробки (ref_03: x 1497 … 1815)
NOTCH_W, NOTCH_A = 0.083, 1.696                          # U-вырез спереди каждой стенки: половина ширины, глубина до вершины
LIP_W = 0.020                                            # отогнутая кромка пера


def _axes(phi):
    ph = math.radians(phi)
    return Vector((math.cos(ph), 0.0, math.sin(ph))), Vector((-math.sin(ph), 0.0, math.cos(ph)))


def fins():
    b = B()
    for phi in (45.0, 135.0, 225.0, 315.0):
        er, et = _axes(phi)
        face = lambda s: [Vector((0, Yb(a), 0)) + er * r + et * (s * FIN_T / 2) for a, r in FIN]
        b.loft([face(+1), face(-1)], G_SHEET, cap0=G_SHEET, cap1=G_SHEET)
    return b.finish('M65_fins')


def lips():
    """Отогнутая кромка по концу пера (ref_03: тёмная полоса по верху пера): полка шириной 2 см в одну сторону."""
    b = B(); a0, a1 = FIN[1][0], FIN[2][0]; r0 = FIN[1][1]
    for phi in (45.0, 135.0, 225.0, 315.0):
        er, et = _axes(phi)
        P = lambda a, r, t: Vector((0, Yb(a), 0)) + er * r + et * t
        sec = lambda a: [P(a, r0 - 0.001, -FIN_T / 2), P(a, r0 - 0.001, LIP_W), P(a, r0 + 0.0025, LIP_W), P(a, r0 + 0.0025, -FIN_T / 2)]
        b.loft([sec(a0 + 0.004), sec(a1)], G_SHEET, cap0=G_SHEET, cap1=G_SHEET)
    return b.finish('M65_lips')


def _wall_outline(k=10):
    H = BOX_H + BOX_T
    a_s = NOTCH_A - NOTCH_W
    out = [(BOX_A0, -H), (BOX_A1, -H), (BOX_A1, H), (BOX_A0, H), (BOX_A0, NOTCH_W)]
    for i in range(k + 1):
        th = math.radians(90.0 - 180.0 * i / k)
        out.append((a_s + NOTCH_W * math.cos(th), NOTCH_W * math.sin(th)))
    out.append((BOX_A0, -NOTCH_W))
    return out


def box():
    b = B(); ol = _wall_outline()
    for phi in (0.0, 90.0, 180.0, 270.0):
        n, u = _axes(phi)
        ring = lambda off: [Vector((0, Yb(a), 0)) + n * off + u * s for a, s in ol]
        b.loft([ring(BOX_H), ring(BOX_H + BOX_T)], G_SHEET, cap0=G_SHEET, cap1=G_SHEET)
    return b.finish('M65_box')


# ── крыльчатки взрывателей: отдельные объекты, начало координат на оси бомбы (центр ступицы), вращение вокруг оси Y ──
A_VN = 0.0065                                            # центр ступицы носовой крыльчатки
A_VT = 1.550                                             # центр ступицы хвостовой крыльчатки (ref_03: x 1530)
VN_R, VT_R = 0.058, 0.048                                # радиус лопастей


def _blade(b, phi, r0, r1, chord, pitch, t, mat, tip_round=0.55):
    er, et = _axes(phi)
    ey = Vector((0.0, 1.0, 0.0)); p = math.radians(pitch)
    c = ey * math.cos(p) + et * math.sin(p); nrm = -ey * math.sin(p) + et * math.cos(p)
    rt = r1 - chord * tip_round / 2
    out = [(r0, -chord * 0.40), (rt, -chord / 2), ]
    for i in range(1, 6):
        th = math.radians(-90 + 180 * i / 6)
        out.append((rt + (r1 - rt) * math.cos(th), chord / 2 * math.sin(th)))
    out += [(rt, chord / 2), (r0, chord * 0.40)]
    ring = lambda s: [er * r + c * x + nrm * (s * t / 2) for r, x in out]
    b.loft([ring(+1), ring(-1)], mat, cap0=mat, cap1=mat)


def _hub(b, a_front, a_back, r, mat, n=16, nose_cap=None, tail_cap=None):
    """Ступица вдоль оси в координатах объекта (центр ступицы — начало): a_front/a_back — смещения по Y (м, + к носу)."""
    rings = []
    if nose_cap: rings.append([Vector((nose_cap[1] * math.cos(2 * math.pi * k / n), a_front + nose_cap[0], nose_cap[1] * math.sin(2 * math.pi * k / n))) for k in range(n)])
    rings += [[Vector((r * math.cos(2 * math.pi * k / n), y, r * math.sin(2 * math.pi * k / n))) for k in range(n)] for y in (a_front, a_back)]
    if tail_cap: rings.append([Vector((tail_cap[1] * math.cos(2 * math.pi * k / n), a_back - tail_cap[0], tail_cap[1] * math.sin(2 * math.pi * k / n))) for k in range(n)])
    b.loft(rings, mat, cap0=mat, cap1=mat)


def vane_nose():
    b = B()
    _hub(b, 0.0055, -0.0055, 0.0105, G_STEEL, nose_cap=(0.003, 0.005))           # ступица от a 0.001 до 0.012 (зазор 0,5 мм до колпачка взрывателя)
    for phi in (0.0, 90.0, 180.0, 270.0):
        _blade(b, phi + 45.0, 0.008, VN_R, 0.013, 32.0, 0.0012, G_VANE)
    ob = b.finish('vane_nose'); ob.location = (0.0, Yb(A_VN), 0.0)
    return ob


def vane_tail():
    b = B()
    _hub(b, 0.013, -0.013, 0.019, G_VANE, tail_cap=(0.006, 0.010))                 # ступица a 1.537 … 1.563, гайка сзади
    for k in range(8):
        _blade(b, 22.5 + 45.0 * k, 0.016, VT_R, 0.020, 38.0, 0.0012, G_VANE)
    ob = b.finish('vane_tail'); ob.location = (0.0, Yb(A_VT), 0.0)
    return ob


def bomb(stage=9):
    """Этапы: 1 — корпус (тело вращения со взрывателем и втулкой); 2 — + проушины и крыльчатки; 3 — + перья и коробка стабилизатора; 4 — + кромки перьев."""
    out = [body()]
    if stage >= 2: out += [lugs(), vane_nose(), vane_tail()]
    if stage >= 3: out += [fins(), box()]
    if stage >= 4: out += [lips()]
    return out
