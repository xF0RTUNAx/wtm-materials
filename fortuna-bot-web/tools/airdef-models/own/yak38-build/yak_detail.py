# yak_detail.py - детали Як-38М: кабина (кресло К-36, доска, ручка), антенны, огни.
import math
from mathutils import Vector
from modelkit import B
import yak_geo as g
from yak_geo import P3, strut, box, G_SKIN, G_METAL, G_DARK, G_COCK
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
    b = B(); zf = g.fus_top(3.6) - 0.85
    box(b, P3(3.45, 0.0, zf), 0.36, 0.55, 0.02, G_COCK)
    seat(b, 3.62, 0.0, zf, w=0.48, back=0.68, tilt=0.20)
    zp = g.fus_top(2.75) + 0.02; panel(b, 2.78, 0.0, zp, 0.56, 0.26); box(b, P3(2.74, 0.0, zp + 0.15), 0.30, 0.10, 0.02, G_COCK)
    strut(b, P3(3.40, 0.0, zf + 0.02), P3(3.32, 0.0, zf + 0.48), 0.022, G_METAL, 8); box(b, P3(3.31, 0.0, zf + 0.50), 0.04, 0.03, 0.05, G_DARK)
    for sg in (1, -1): box(b, P3(3.55, sg * 0.34, zf + 0.30), 0.05, 0.35, 0.05, G_COCK)
    return b.finish('cockpit_int', sharp_deg=35)


def antennas():
    b = B()
    def blade(a, up, h=0.20, c=0.28):
        z0 = g.fus_top(a) - 0.01 if up else g.fus_bot(a) + 0.01; s = 1 if up else -1; rings = []
        for t in (0.0, 1.0):
            zz = z0 + s * h * t; ch = c * (1 - 0.45 * t); th = 0.016 - 0.008 * t; aa = a + 0.12 * t
            rings.append([P3(aa - ch / 2, 0.0, zz), P3(aa, th, zz), P3(aa + ch / 2, 0.0, zz), P3(aa, -th, zz)])
        b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    for a, up in ((9.6, True), (12.2, False), (7.4, False)): blade(a, up)
    return b.finish('det_ant', sharp_deg=35)


def all_details():
    return [cockpits(), antennas()]
