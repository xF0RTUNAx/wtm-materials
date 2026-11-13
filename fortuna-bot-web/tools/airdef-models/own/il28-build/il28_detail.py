# il28_detail.py - детали Ил-28: кабины (штурман, лётчик, стрелок), нутро бомбоотсека с держателями, антенна с тросом, ПВД, огни.
import math
from mathutils import Vector
from modelkit import B
import il28_geo as g
from il28_geo import P3, strut, box, G_SKIN, G_METAL, G_DARK, G_COCK
G_STRAP, G_SCREEN, G_BELT, G_HANDLE = 6, 7, 8, 9


def seat(b, a, x, z, w=0.46, back=0.75, tilt=0.18, head=True, fa=1):
    """Кресло: чашка, спинка с наклоном назад, заголовник, ремни, ручки катапульты."""
    box(b, P3(a, x, z + 0.06), w / 2, 0.24, 0.06, G_COCK)
    for sg in (1, -1): box(b, P3(a, x + sg * (w / 2 - 0.02), z + 0.16), 0.02, 0.22, 0.10, G_COCK)
    rings = []
    for i in range(6):
        t = i / 5; h = z + 0.12 + back * t; aa = a + fa * (0.20 + tilt * t)
        rings.append([P3(aa, x - w / 2, h), P3(aa, x + w / 2, h), P3(aa + fa * 0.07, x + w / 2, h), P3(aa + fa * 0.07, x - w / 2, h)])
    b.loft(rings, G_COCK, cap0=G_COCK, cap1=G_COCK)
    if head: box(b, P3(a + fa * (0.20 + tilt + 0.02), x, z + 0.12 + back + 0.10), w * 0.32, 0.06, 0.11, G_COCK)
    for sg in (1, -1):
        strut(b, P3(a + fa * (0.17 + tilt * 0.8), x + sg * 0.10, z + 0.12 + back * 0.85), P3(a - fa * 0.05, x + sg * 0.08, z + 0.14), 0.020, G_BELT, 6)
        strut(b, P3(a - fa * 0.10, x + sg * (w / 2 + 0.01), z + 0.20), P3(a - fa * 0.02, x + sg * (w / 2 + 0.01), z + 0.32), 0.014, G_HANDLE, 6)
    box(b, P3(a - fa * 0.05, x, z + 0.135), w * 0.30, 0.10, 0.012, G_STRAP)


def panel(b, a, x, z, w, h, tilt=0.25, nd=6):
    """Приборная доска с приборами (тёмные круги - экраны)."""
    box(b, P3(a, x, z), w / 2, 0.025, h / 2, G_COCK)
    for i in range(nd):
        px = x - w / 2 + w * (i % 3 + 0.5) / 3; pz = z - h / 4 + h / 2 * (i // 3)
        b.loft([[P3(a + 0.026, px + 0.045 * math.cos(2 * math.pi * k / 10), pz + 0.045 * math.sin(2 * math.pi * k / 10)) for k in range(10)], [P3(a + 0.030, px + 0.040 * math.cos(2 * math.pi * k / 10), pz + 0.040 * math.sin(2 * math.pi * k / 10)) for k in range(10)]], G_SCREEN, cap1=G_SCREEN)


def cockpits():
    b = B()
    # штурман в носу: пол, кресло лицом вперёд, прицел посередине, столик, приборы по бортам
    box(b, P3(1.40, 0.0, -0.46), 0.42, 0.70, 0.02, G_COCK)
    seat(b, 1.55, 0.0, -0.46, w=0.44, back=0.65, tilt=0.12)
    strut(b, P3(0.95, 0.0, -0.45), P3(0.95, 0.0, -0.05), 0.06, G_METAL, 10)                 # прицел
    box(b, P3(0.92, 0.0, 0.00), 0.10, 0.13, 0.08, G_METAL); box(b, P3(0.84, 0.0, 0.02), 0.05, 0.03, 0.05, G_DARK)
    for sg in (1, -1): box(b, P3(1.30, sg * 0.42, -0.15), 0.06, 0.30, 0.16, G_COCK); panel(b, 1.05, sg * 0.36, 0.10, 0.22, 0.18, nd=3)
    # лётчик: пол, кресло, доска с козырьком, штурвал
    box(b, P3(3.30, 0.0, 0.14), 0.32, 0.60, 0.02, G_COCK)
    seat(b, 3.30, 0.0, 0.12, w=0.48, back=0.70, tilt=0.18)
    panel(b, 2.78, 0.0, 0.62, 0.56, 0.26); box(b, P3(2.74, 0.0, 0.78), 0.30, 0.10, 0.02, G_COCK)
    strut(b, P3(3.08, 0.0, 0.16), P3(3.00, 0.0, 0.55), 0.025, G_METAL, 8); box(b, P3(3.00, 0.0, 0.57), 0.14, 0.02, 0.04, G_METAL)
    for sg in (1, -1): box(b, P3(3.30, sg * 0.30, 0.42), 0.04, 0.35, 0.05, G_COCK)
    # стрелок: кресло спиной к хвосту, прицел, ручки
    box(b, P3(16.98, 0.0, 0.615), 0.26, 0.22, 0.012, G_COCK)
    seat(b, 16.98, 0.0, 0.62, w=0.38, back=0.50, tilt=0.08, head=False, fa=-1)
    box(b, P3(17.13, 0.0, 1.00), 0.07, 0.04, 0.06, G_METAL); strut(b, P3(17.13, 0.0, 0.93), P3(17.13, 0.0, 0.66), 0.02, G_METAL, 8)
    for sg in (1, -1): strut(b, P3(17.10, sg * 0.12, 0.88), P3(17.03, sg * 0.16, 0.88), 0.016, G_HANDLE, 6)
    return b.finish('cockpit_int', sharp_deg=35)


def bay_inside():
    """Нутро отсека: шпангоуты по стенкам и потолку, продольные балки, держатели с замками над каждой точкой."""
    BY = g.BAY; b = B(); hw = BY['hw'] - 0.004; r = BY['roof'] - 0.004
    for a in [BY['a0'] + 0.35 + 0.55 * i for i in range(13) if BY['a0'] + 0.35 + 0.55 * i < BY['a1'] - 0.2]:
        for sg in (1, -1): box(b, P3(a, sg * (hw - 0.025), -0.22), 0.025, 0.02, 0.26, G_COCK)
        box(b, P3(a, 0.0, r - 0.02), hw - 0.05, 0.02, 0.02, G_COCK)
    for sg in (1, -1): box(b, P3((BY['a0'] + BY['a1']) / 2, sg * g.BAY_X, r - 0.025), 0.05, (BY['a1'] - BY['a0']) / 2 - 0.10, 0.025, G_METAL)     # балки держателей
    for a in g.BAY_ROWS:
        for sg in (1, -1):
            x = sg * g.BAY_X; z0 = r - 0.05; z1 = g.BAY_TOP
            box(b, P3(a, x, (z0 + z1) / 2 + 0.01), 0.045, 0.14, (z0 - z1) / 2, G_METAL)              # замок
            for da in (-0.10, 0.10): box(b, P3(a + da, x, z1 + 0.012), 0.018, 0.012, 0.014, G_DARK)  # крюки
            for da in (-0.30, 0.30):                                                                  # упоры (распорки) сверху на бомбу
                strut(b, P3(a + da, x, z0), P3(a + da, x, z1 + 0.02), 0.012, G_METAL, 6); box(b, P3(a + da, x, z1 + 0.012), 0.05, 0.02, 0.008, G_DARK)
    return b.finish('bay_int', sharp_deg=35)


def antenna():
    """Мачта антенны за фонарём и трос к верху киля (il28_02)."""
    b = B(); base = P3(4.45, 0.0, g.FAIR_T[0](4.45) - 0.02); top = P3(4.30, 0.0, 1.62)
    rings = []
    for t in (0.0, 1.0):
        c = base.lerp(top, t); ch = 0.16 - 0.10 * t; th = 0.022 - 0.012 * t
        rings.append([c + Vector((0, -ch, 0)), c + Vector((th, 0, 0)), c + Vector((0, ch * 0.5, 0)), c + Vector((-th, 0, 0))])
    b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    ft = P3(16.95, 0.0, g.FIN_Z1 - 0.06)
    strut(b, ft, ft + Vector((0, -0.10, -0.03)), 0.010, G_METAL, 6)
    bw = B(); strut(bw, top, ft, 0.004, G_DARK, 6)                 # трос - отдельно: в развёртке одна тёмная заплатка, иначе длинный остров раздувает атлас
    return [b.finish('antenna', sharp_deg=35), bw.finish('det_wire', sharp_deg=35)]


def tips():
    """ПВД на концах крыла вперёд, огни на законцовках, огни на киле и под фюзеляжем."""
    b = B()
    for sx in (1, -1):
        x = sx * (g.XTIP - 0.20); z = g.wz(g.XTIP - 0.20)
        b.loft([[P3(a, x + r * math.cos(2 * math.pi * k / 10), z + r * math.sin(2 * math.pi * k / 10)) for k in range(10)] for a, r in ((g.LE_(g.XTIP - 0.20) + 0.05, 0.022), (7.70, 0.018), (7.30, 0.012), (7.25, 0.006))], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('det_tips', sharp_deg=35)


def lights():
    b = B()
    for sx, m in ((1, 13), (-1, 12)):
        c = P3(9.20, sx * (g.XTIP + 0.005), g.wz(g.XTIP))
        b.loft([[c + Vector((sx * d, r * math.cos(2 * math.pi * k / 12), r * math.sin(2 * math.pi * k / 12))) for k in range(12)] for d, r in ((-0.01, 0.05), (0.02, 0.05), (0.05, 0.03))], G_METAL, cap1=G_METAL)
    return b.finish('det_lights', sharp_deg=35)


def all_details():
    return [cockpits(), bay_inside()] + antenna() + [tips()]
