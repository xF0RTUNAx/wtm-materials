# tu22_detail.py - детали Ту-22: кабины штурмана и лётчика (видны сквозь стёкла), нутро бомбоотсека с балками и замками, антенны, ПВД, огни.
import math
from mathutils import Vector
from modelkit import B
import tu22_geo as g
from tu22_geo import P3, strut, box, G_SKIN, G_METAL, G_DARK, G_COCK
G_STRAP, G_SCREEN, G_BELT, G_HANDLE = 6, 7, 8, 9


def seat(b, a, x, z, w=0.48, back=0.78, tilt=0.18, head=True, fa=1):
    """Катапультное кресло: чашка, спинка с наклоном, заголовник, ремни, ручки."""
    box(b, P3(a, x, z + 0.06), w / 2, 0.25, 0.06, G_COCK)
    for sg in (1, -1): box(b, P3(a, x + sg * (w / 2 - 0.02), z + 0.17), 0.02, 0.23, 0.11, G_COCK)
    rings = []
    for i in range(6):
        t = i / 5; h = z + 0.12 + back * t; aa = a + fa * (0.21 + tilt * t)
        rings.append([P3(aa, x - w / 2, h), P3(aa, x + w / 2, h), P3(aa + fa * 0.08, x + w / 2, h), P3(aa + fa * 0.08, x - w / 2, h)])
    b.loft(rings, G_COCK, cap0=G_COCK, cap1=G_COCK)
    if head: box(b, P3(a + fa * (0.21 + tilt + 0.02), x, z + 0.12 + back + 0.11), w * 0.32, 0.07, 0.12, G_COCK)
    for sg in (1, -1):
        strut(b, P3(a + fa * (0.18 + tilt * 0.8), x + sg * 0.10, z + 0.12 + back * 0.85), P3(a - fa * 0.05, x + sg * 0.08, z + 0.14), 0.020, G_BELT, 6)
        strut(b, P3(a - fa * 0.10, x + sg * (w / 2 + 0.01), z + 0.20), P3(a - fa * 0.02, x + sg * (w / 2 + 0.01), z + 0.33), 0.014, G_HANDLE, 6)
    box(b, P3(a - fa * 0.05, x, z + 0.135), w * 0.30, 0.10, 0.012, G_STRAP)


def panel(b, a, x, z, w, h, nd=6):
    box(b, P3(a, x, z), w / 2, 0.025, h / 2, G_COCK)
    for i in range(nd):
        px = x - w / 2 + w * (i % 3 + 0.5) / 3; pz = z - h / 4 + h / 2 * (i // 3)
        b.loft([[P3(a + 0.026, px + 0.045 * math.cos(2 * math.pi * k / 10), pz + 0.045 * math.sin(2 * math.pi * k / 10)) for k in range(10)], [P3(a + 0.030, px + 0.040 * math.cos(2 * math.pi * k / 10), pz + 0.040 * math.sin(2 * math.pi * k / 10)) for k in range(10)]], G_SCREEN, cap1=G_SCREEN)


def cockpits():
    b = B()
    # лётчик под горбом фонаря: пол, кресло, доска под козырьком, ручка, боковые пульты
    zf = g.fus_top(8.9) - 0.74
    box(b, P3(8.70, 0.0, zf), 0.40, 0.80, 0.02, G_COCK)
    seat(b, 8.95, 0.0, zf, back=0.80)
    zp = g.fus_top(7.4) + 0.05; panel(b, 7.55, 0.0, zp, 0.62, 0.30); box(b, P3(7.50, 0.0, zp + 0.17), 0.34, 0.12, 0.02, G_COCK)
    strut(b, P3(8.70, 0.0, zf + 0.02), P3(8.62, 0.0, zf + 0.50), 0.025, G_METAL, 8); box(b, P3(8.61, 0.0, zf + 0.53), 0.05, 0.03, 0.06, G_DARK)
    for sg in (1, -1): box(b, P3(8.90, sg * 0.38, zf + 0.35), 0.06, 0.40, 0.06, G_COCK)
    # штурман в носу: пол, кресло лицом вперёд, доски по бортам у окон
    zn = g.fus_bot(5.6) + 0.37
    box(b, P3(5.55, 0.0, zn), 0.42, 0.75, 0.02, G_COCK)
    seat(b, 5.75, 0.0, zn, w=0.46, back=0.72, tilt=0.12)
    panel(b, 4.75, 0.0, zn + 0.55, 0.50, 0.24)
    for sg in (1, -1): box(b, P3(5.30, sg * 0.46, zn + 0.32), 0.05, 0.30, 0.12, G_COCK)
    return b.finish('cockpit_int', sharp_deg=35)


def bay_inside():
    """Нутро отсека: шпангоуты по стенкам и потолку, две продольные балки держателей, замки с крюками и упоры над каждой бомбой."""
    BY = g.BAY; b = B(); hw = BY['hw'] - 0.004; r = BY['roof'] - 0.004
    a = BY['a0'] + 0.30
    while a < BY['a1'] - 0.2:
        for sg in (1, -1): box(b, P3(a, sg * (hw - 0.025), -0.55), 0.025, 0.022, 0.40, G_COCK)
        box(b, P3(a, 0.0, r - 0.02), hw - 0.05, 0.022, 0.02, G_COCK)
        a += 0.60
    for sg in (1, -1):
        box(b, P3((BY['a0'] + BY['a1']) / 2, sg * g.BAY_X, r - 0.03), 0.055, (BY['a1'] - BY['a0']) / 2 - 0.10, 0.03, G_METAL)
        box(b, P3((BY['a0'] + BY['a1']) / 2, sg * (hw - 0.07), -0.215), 0.025, (BY['a1'] - BY['a0']) / 2 - 0.10, 0.025, G_METAL)      # стрингеры в верхних углах
    for a in g.BAY_ROWS:
        for sg in (1, -1):
            x = sg * g.BAY_X; z0 = r - 0.06; z1 = g.BAY_TOP
            box(b, P3(a, x, (z0 + z1) / 2 + 0.01), 0.05, 0.16, max((z0 - z1) / 2, 0.01), G_METAL)
            for da in (-0.25, 0.25): box(b, P3(a + da, x, z1 + 0.035), 0.02, 0.014, 0.016, G_DARK)
            for da in (-0.55, 0.55):
                for dx in (-0.12, 0.12):
                    zs = g.BAY_TOP - g.VIS_R['fab1000'] - 0.05 + math.sqrt(0.245 ** 2 - dx ** 2) + 0.03     # упор до поверхности бомбы с зазором
                    strut(b, P3(a + da, x + dx * 0.6, z0), P3(a + da, x + dx, zs), 0.013, G_METAL, 6)
    return b.finish('bay_int', sharp_deg=35)


def antennas():
    """Лопаточные антенны сверху и снизу фюзеляжа, ПВД на носу по бортам, огни на законцовках и киле."""
    b = B()
    def blade(a, up, h=0.30, c=0.42):
        z0 = g.fus_top(a) - 0.01 if up else g.fus_bot(a) + 0.01; s = 1 if up else -1; rings = []
        for t in (0.0, 1.0):
            zz = z0 + s * h * t; ch = c * (1 - 0.45 * t); th = 0.022 - 0.010 * t; aa = a + 0.18 * t
            rings.append([P3(aa - ch / 2, 0.0, zz), P3(aa, th, zz), P3(aa + ch / 2, 0.0, zz), P3(aa, -th, zz)])
        b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for a, up in ((13.6, True), (25.5, True), (14.6, False), (27.8, False), (33.2, False)): blade(a, up)
    for sx in (1, -1):                                               # ПВД по бортам носа
        z = (g.FT[0](2.6) + g.FT[1](2.6)) / 2 + 0.15; x0 = sx * (g.fus_hw(2.6, z) - 0.01)
        strut(b, P3(2.6, x0, z), P3(2.6, x0 + sx * 0.14, z), 0.016, G_METAL, 8)
        b.loft([[P3(a, x0 + sx * 0.14 + r * math.cos(2 * math.pi * k / 10), z + r * math.sin(2 * math.pi * k / 10)) for k in range(10)] for a, r in ((2.75, 0.014), (2.40, 0.012), (2.10, 0.008), (2.05, 0.003))], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('det_ant', sharp_deg=35)


def lights():
    b = B()
    for sx in (1, -1):
        c = P3(31.30, sx * (g.XTIP + 0.02), g.wz(g.XTIP))
        b.loft([[c + Vector((r * math.cos(2 * math.pi * k / 12), -d, r * math.sin(2 * math.pi * k / 12))) for k in range(12)] for d, r in ((0.0, 0.05), (-0.04, 0.05), (-0.09, 0.02))], G_METAL, cap1=G_METAL)
    return b.finish('det_lights', sharp_deg=35)


def all_details():
    return [cockpits(), bay_inside(), antennas(), lights()]
