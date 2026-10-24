# kh55_geo.py — общая геометрия Х-55 и Х-555 (внешняя форма для игры). Размеры — в пикселях чертежа 1_вид_сверху_чертёж.png (нос слева, 800 × 416):
# ось y = 215,5, середина длины x = 401,5, силуэт x 37…766 (729 пикс. = 6,04 м, длина прежней модели в игре), радиус корпуса 32,5 пикс.
# Размеры по виду сбоку (2_виды_сбоку_чертёж.png, верхний рисунок: силуэт x 32…775 = 743 пикс.) пересчитываются в масштаб вида сверху множителем SK.
# Нос — +Y, верх (киль) — +Z, левое крыло — −X.
import math
import bpy
from mathutils import Vector
import modelkit as mk
from modelkit import B, circ, profile, panel, prism, trap, rrect, ell, decal, Y, PR_WING, PR_PLATE, PR_FLAP

M_BODY, M_WING, M_CTRL, M_DARK = 0, 1, 2, 3
S = 6.04 / 729.0                       # метров на пиксель вида сверху
X0, YC, RB = 401.5, 215.5, 32.5
SK = 729.0 / 743.0                     # вид сбоку → масштаб вида сверху (длины и высоты)
xs = lambda x: 37.0 + (x - 32.0) * SK  # x вида сбоку → x вида сверху


def ellipse_tip(r0, xle, xte, r1, n=4, rmin=0.8):
    """Станции закруглённого конца пластины: хорда [xle, xte] на r0 сужается по эллипсу до r1 (полуось по r = r1 − r0)."""
    xc, hc, out = (xle + xte) / 2.0, (xte - xle) / 2.0, []
    for k in range(1, n + 1):
        d = (r1 - r0) * min(k / n, 0.985)
        h = hc * math.sqrt(max(1.0 - ((d) / (r1 - r0)) ** 2, 0.0))
        out.append((r0 + d, xc - max(h, rmin), xc + max(h, rmin)))
    return out


# ───────────────────────── корпус (вращение) ─────────────────────────
def body_profile(variant='kh55'):
    a, rb = 82.0, RB                                           # носовой эллипс: длина 82 пикс., тупой кончик R 4
    nose = [(37.0 + u, max(4.0, rb * math.sqrt(max(1.0 - ((a - u) / a) ** 2, 0.0))), M_BODY) for u in (0.0, 3.0, 8.0, 15.0, 25.0, 40.0, 55.0, 70.0, 82.0)]
    tail = [(600.0, 32.5, M_BODY), (612.0, 31.2, M_BODY), (637.0, 29.6, M_BODY), (662.0, 27.6, M_BODY), (690.0, 25.0, M_BODY),
            (715.0, 21.2, M_BODY), (740.0, 17.2, M_CTRL), (766.0, 9.0, M_CTRL)]
    base = nose + tail
    return profile(base, [(124.0, 0.9, 0.9), (186.0, 0.9, 0.9), (553.0, 0.9, 0.9), (612.0 + 8.0, 0.8, 0.8)])


def body(variant='kh55'):
    prof = body_profile(variant)
    b = B()
    rings, mats = [circ(x, R) for x, R, _ in prof], [m for _, _, m in prof[:-1]]
    b.loft(rings, mats, cap0=M_DARK, cap1=M_DARK)
    return b.finish('K55_body')


# ───────────────────────── крылья (развёрнуты) и оперение ─────────────────────────
def wings():
    """Крыло: корень x 357…417 на поверхности корпуса, передняя кромка к концу уходит назад (≈ 10°), задняя — прямая; конец закруглён (по виду сверху)."""
    k = (382.0 - 357.0) / (175.5 - 32.5)                      # сдвиг передней кромки на пиксель размаха
    st = [(24.0, 357.0 - k * 8.5, 417.0, 8.0), (32.5, 357.0, 417.0, 8.0), (100.0, 357.0 + k * 67.5, 417.0, 6.5), (150.0, 357.0 + k * 117.5, 417.0, 5.5), (175.5, 382.0, 417.0, 4.6)]
    for r, xl, xt in ellipse_tip(175.5, 382.0, 417.0, 186.0, n=4):
        st.append((r, xl, xt, 3.4))
    b = B()
    for phi in (0.0, 180.0): panel(b, phi, st, PR_WING, M_WING)
    return b.finish('K55_wings')


def tail_stations(rtop):
    """Хвостовое оперение (три одинаковых плоскости: два стабилизатора и киль): корень x 683…739, передняя кромка идёт назад, задняя вертикальна; конец закруглён."""
    k = 25.0 / 45.0
    st = [(19.0, 686.0 - k * 6.5, 739.0, 5.2), (25.5, 686.0, 739.0, 5.0), (48.0, 686.0 + k * 22.5, 739.0, 4.2), (rtop - 10.0, 686.0 + k * (rtop - 10.0 - 25.5), 739.0, 3.4)]
    for r, xl, xt in ellipse_tip(rtop - 10.0, st[-1][1], 739.0, rtop, n=3):
        st.append((r, xl, xt, 2.8))
    return st


def tail():
    b = B()
    for phi, rt in ((0.0, 80.5), (180.0, 80.5)): panel(b, phi, tail_stations(rt), PR_PLATE, M_CTRL)
    b.finish('K55_tailplane')
    b = B()
    panel(b, 90.0, tail_stations(78.5), PR_PLATE, M_CTRL)
    return b.finish('K55_fin')


# ───────────────────────── подфюзеляжная гондола двигателя ─────────────────────────
POD_CZ, POD_R = -55.9, 19.6          # ось гондолы ниже оси корпуса, радиус (пикс.)


def pod():
    """Гондола: цилиндр с круглым воздухозаборником спереди (x 592…693) и малым колпаком сопла сзади (до 703), на длинном тонком пилоне."""
    cz = POD_CZ
    P = [(592.0, 13.5, M_DARK), (594.0, 17.2, M_CTRL), (597.0, 19.4, M_CTRL), (600.0, POD_R, M_CTRL), (668.0, POD_R, M_CTRL), (684.0, 18.4, M_CTRL), (692.0, 14.0, M_CTRL),
         (693.0, 8.3, M_DARK), (703.0, 8.3, M_DARK)]
    P = profile(P, [(612.0, 0.7, 0.8), (642.0, 0.7, 0.8)])                 # стыки секций гондолы (по виду сбоку)
    b = B()
    b.loft([circ(x, R, cz=cz) for x, R, _ in P], [m for _, _, m in P[:-1]], cap0=M_DARK, cap1=M_DARK)
    b.finish('K55_pod')
    b = B()
    prism(b, 596.0, 700.0, trap(3.4, -27.0, 3.4, cz + 6.0), M_CTRL, section_b=trap(2.4, -24.0, 2.4, cz + 7.0))      # пилон: основание в корпусе, низ в гондоле
    return b.finish('K55_pylon')


# ───────────────────────── накладки (люки, щели, кронштейны) по рисункам ─────────────────────────
TOP, BOT = math.pi / 2, -math.pi / 2


def plate(b, x, z, shape, side, h, mat, theta=None):
    """Как modelkit.decal, но верх накладки — веер треугольников из центра на поверхности цилиндра: у плоского n-угольника на кривой поверхности была бы складка по диагонали
    (в запечённом цвете она читалась светлой линией — «скол» на кромке). Параметры те же: x (пикс.), z — высота центра, shape — контур [(dx, dt)], side ±1, h — высота, theta — свой угол (рад)."""
    if theta is None:
        zc = max(-RB * 0.95, min(RB * 0.95, z)); th = math.asin(zc / RB) if side > 0 else math.pi - math.asin(zc / RB)
    else: th = theta
    sg = 1.0 if side > 0 else -1.0
    ring = lambda rho: [Vector((rho * S * math.cos(th + sg * dt / RB), Y(x + dx), rho * S * math.sin(th + sg * dt / RB))) for dx, dt in shape]
    bm, n = b.bm, len(shape)
    vi = [bm.verts.new(p) for p in ring(RB - 1.0)]; vo = [bm.verts.new(p) for p in ring(RB + h)]
    for j in range(n):
        f = bm.faces.new((vi[j], vi[(j + 1) % n], vo[(j + 1) % n], vo[j])); f.material_index = mat
    f = bm.faces.new(vi[::-1]); f.material_index = mat
    cdx, cdt = sum(p[0] for p in shape) / n, sum(p[1] for p in shape) / n
    cv = bm.verts.new(Vector(((RB + h) * S * math.cos(th + sg * cdt / RB), Y(x + cdx), (RB + h) * S * math.sin(th + sg * cdt / RB))))
    for j in range(n):
        f = bm.faces.new((vo[j], vo[(j + 1) % n], cv)); f.material_index = mat


def details():
    """Люки и накладки: сверху (вид сверху, 1_…), снизу и по бортам (вид сбоку, 2_…); высота накладок 0,6…1,4 пикс. (≈ 5…12 мм)."""
    b = B()                                                                # светлые пластины (люки)
    plate(b, 170.0, 0.0, rrect(5.5, 5.5, 1.2), 1, 0.9, M_WING, theta=TOP)                   # квадратный люк за носом
    plate(b, 270.0, 0.0, rrect(7.0, 8.5, 1.5), 1, 1.0, M_WING, theta=TOP)                   # люк перед кронштейном
    plate(b, 560.0, 0.0, rrect(9.0, 14.0, 2.0), 1, 1.0, M_WING, theta=TOP)                  # двойной люк сзади
    plate(b, 535.0, 0.0, rrect(28.0, 10.0, 3.0), 1, 0.8, M_WING, theta=BOT)                 # нижний люк № 2
    for sd in (1, -1): plate(b, 616.0, 19.5, rrect(5.0, 9.0, 1.4), sd, 0.9, M_WING)        # малые люки у хвоста по бортам
    b.finish('K55_hatches')
    b = B()                                                                # кронштейн на спине и рамка нижнего люка — серые, чуть темнее
    plate(b, 293.0, 0.0, rrect(6.0, 11.0, 1.5), 1, 1.4, M_CTRL, theta=TOP)
    plate(b, 255.0, 0.0, rrect(38.0, 13.0, 3.5), 1, 0.8, M_CTRL, theta=BOT)               # рамка нижнего люка № 1
    b.finish('K55_plates')
    b = B()                                                                # тёмное: прорезь крыла, решётка нижнего люка, гнёзда
    for sd in (1, -1): plate(b, 433.0, 3.5, rrect(15.5, 3.0, 1.2), sd, 0.5, M_DARK)       # щель за крылом
    plate(b, 255.0, 0.0, rrect(34.0, 9.0, 2.5), 1, 1.1, M_DARK, theta=BOT)                # решётка нижнего люка № 1
    plate(b, 253.0, 0.0, ell(2.2, 2.2, 10), 1, 0.6, M_DARK, theta=TOP)                    # гнездо у люка
    for dt in (-7.0, 7.0): plate(b, 293.0, 0.0, [(dx + 0.0, dt + dy) for dx, dy in ell(1.8, 1.8, 10)], 1, 1.6, M_DARK, theta=TOP)   # штифты кронштейна
    plate(b, 560.0, 0.0, [(dx, -9.0 + dy) for dx, dy in ell(3.2, 3.2, 12)], 1, 1.2, M_DARK, theta=TOP)
    return b.finish('K55_slots')


# ───────────────────────── Х-555: конформные баки по нижним бортам ─────────────────────────
CFT = [(133.0, 0.05), (139.0, 0.34), (150.0, 0.60), (168.0, 0.84), (195.0, 1.0), (530.0, 1.0), (552.0, 0.84), (566.0, 0.62), (577.0, 0.36), (583.0, 0.06)]   # (x, доля сечения): носовой обвод и хвостовая сужка


def cft():
    """Два обтекателя-«щеки» по нижним бортам (цветной трёхвид 6: вид спереди и сбоку; силуэты 5): x 133…583 (от 0,8 до 4,5 м от носа), наружу от корпуса ≈ 16 пикс. (0,13 м), верх на уровне оси, низ — у низа корпуса."""
    b = B()
    for sd in (1.0, -1.0):
        rings = []
        for x, f in CFT:
            c, rx, rz, zc = 30.0 + 8.0 * f, 11.0 * f, 14.0 * f, -14.0
            rings.append([Vector((sd * (c + rx * math.cos(2 * math.pi * k / 24.0)) * S, Y(x), (zc + rz * math.sin(2 * math.pi * k / 24.0)) * S)) for k in range(24)])
        b.loft(rings, M_BODY, cap0=M_BODY, cap1=M_BODY)
    return b.finish('K55_tanks')


# ───────────────────────── сборка ─────────────────────────
def configure(name='KH55'):
    mk.configure(name, S, x0=X0, yc=YC, rb=RB, nseg=32, nose='left')
    mk.set_materials([('K55_body', (0.56, 0.58, 0.54)), ('K55_wing', (0.50, 0.52, 0.49)), ('K55_ctrl', (0.43, 0.45, 0.43)), ('K55_dark', (0.035, 0.036, 0.04))])


def missile(stage=9, variant='kh55'):
    out = [body(variant)]
    if stage >= 2: out += [wings(), tail()]
    if stage >= 3: out += [pod()]
    if stage >= 4:
        if variant == 'kh555': out.append(cft())
        out.append(details())
    return out
