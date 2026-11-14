# mg_det.py - детали МиГ-25БМ: пилоны под Х-58У (4), антенны, огни, кабина (простая), щиток не здесь.
import math
from mathutils import Vector
from modelkit import B
import mg_geo as g
from _mg_base import P3, G_SKIN, G_METAL, G_DARK, G_COCK, STATIONS, loft_obj, foil_ring, cove_wall, cove_wall_f, BVH, stations
from _mg_base import _apply_bool, _drop
G_SCREEN = 7; G_LENS_R, G_LENS_G, G_LENS_W = 12, 13, 14
AFT = Vector((0, -1, 0))
PYL = [(3.35, 'in'), (4.58, 'out')]; PYL_L = 2.20; PYL_H = 0.26
def pylons():
    """Подкрыльевые пилоны под Х-58У: профиль 2,4 м, низ - точка станции посередине (низ пилона)."""
    b = B()
    for sx in (1, -1):
        for x, nm in PYL:
            mid = (g.w_le(x) + g.w_te(x)) / 2 - 0.35; a0 = mid - PYL_L / 2; zt = g.w_z(x) - g.w_tc(x) * (g.w_te(x) - g.w_le(x)) * 0.25; zb = zt - PYL_H
            rs = []
            for z in (zt + 0.06, zt - 0.02, zb + 0.02, zb):
                f = 1.0 if z > zb + 0.01 else 0.6
                rs.append(foil_ring(a0, PYL_L, 0.06 * f, 0.0006, 1.0, 16, lambda a, h, z=z: P3(a, sx * x + h, z), tail=cove_wall(a0, PYL_L, 0.06 * f, 1.0), head=cove_wall_f(a0, PYL_L, 0.06 * f, 0.0006)))
            b.loft(rs, G_SKIN, cap1=G_SKIN)
            STATIONS[f"st_{nm}_{'r' if sx > 0 else 'l'}"] = P3(mid, sx * x, zb)
    return b.finish('pylon', sharp_deg=40)
def cockpit():
    """Кабина: кресло с заголовником, приборная доска с козырьком и экранами, ручка, пульты по бортам."""
    b = B()
    def box(c, hx, hy, hz, mat=G_COCK):
        rg = lambda y: [c + Vector((-hx, y, -hz)), c + Vector((hx, y, -hz)), c + Vector((hx, y, hz)), c + Vector((-hx, y, hz))]
        b.loft([rg(-hy), rg(hy)], mat, cap0=mat, cap1=mat)
    box(P3(6.95, 0.0, 0.30), 0.24, 0.10, 0.36)                                     # спинка кресла
    box(P3(6.70, 0.0, 0.05), 0.24, 0.26, 0.06)                                     # сиденье
    box(P3(6.92, 0.0, 0.78), 0.14, 0.09, 0.11, G_DARK)                             # заголовник
    for sx in (1, -1): box(P3(6.75, sx * 0.29, 0.20), 0.04, 0.30, 0.12)          # подлокотники
    box(P3(6.10, 0.0, 0.52), 0.33, 0.05, 0.16)                                     # приборная доска
    box(P3(6.04, 0.0, 0.70), 0.30, 0.10, 0.02)                                     # козырёк доски
    for x in (-0.16, 0.0, 0.16): box(P3(6.15, x, 0.55), 0.06, 0.004, 0.05, G_SCREEN)
    box(P3(6.45, 0.0, 0.18), 0.02, 0.02, 0.22, G_DARK)                             # ручка
    for sx in (1, -1): box(P3(6.60, sx * 0.36, 0.30), 0.06, 0.45, 0.03)          # боковые пульты
    return b.finish('det_cockpit', sharp_deg=40)
def details():
    b = B()
    tip = [(0.97, 0.020), (1.30, 0.095), (1.75, 0.165)]                             # тёмный диэлектрический наконечник конуса (03, 07, 09)
    for a in (8.6, 12.5): c = P3(a, 0.0, g.fus_top(a) - 0.01); b.loft([[c + Vector((dx, dy, 0)) for dx, dy in ((-0.01, 0.12), (0.01, 0.12), (0.01, -0.12), (-0.01, -0.12))], [c + Vector((dx, dy, 0.28)) for dx, dy in ((-0.005, -0.02), (0.005, -0.02), (0.005, -0.12), (-0.005, -0.12))]], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)   # антенны на спине
    for sx in (1, -1):
        c = P3(g.w_le(6.6) + 0.15, sx * 6.6, g.w_z(6.6)); b.loft([[c + Vector((sx * 0.03 * math.cos(t), 0, 0.03 * math.sin(t))) for t in [2 * math.pi * k / 10 for k in range(10)]], [c + Vector((sx * 0.03 * math.cos(t), -0.10, 0.03 * math.sin(t))) for t in [2 * math.pi * k / 10 for k in range(10)]]], G_LENS_G if sx > 0 else G_LENS_R, cap0=G_LENS_G if sx > 0 else G_LENS_R, cap1=G_SKIN)
    return b.finish('det_ext', sharp_deg=38)
def all_details(skin):
    return [pylons(), cockpit(), details()]
