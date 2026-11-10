# vul_detail.py - детали Vulcan B.2 поверх формы vul_geo.py: штанга дозаправки, приёмники на концах крыла, круглые окна, окно прицела, кабина с двумя креслами, антенны.
import math
from mathutils import Vector
from modelkit import B
import vul_geo as g
from vul_geo import P3, Z, Yb, G_SKIN, G_METAL, G_DARK, G_GLASS, G_COCK, strut, box3, Track

G_STRAP, G_SCREEN, G_BELT, G_HANDLE = 6, 7, 8, 9


def _tube(b, pts, rs, mat, n=16):
    t0 = (pts[1] - pts[0]).normalized(); u = t0.orthogonal().normalized(); rings = []
    for i, p in enumerate(pts):
        a_ = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized(); u = (u - a_ * u.dot(a_)).normalized(); v = a_.cross(u)
        rings.append([p + (u * math.cos(2 * math.pi * q / n) + v * math.sin(2 * math.pi * q / n)) * rs[i] for q in range(n)])
    b.loft(rings, mat, cap0=mat, cap1=mat)


def probe():
    """Штанга дозаправки на носу (vulcan_05): прямая, по оси, наконечник с кольцом."""
    b = B(); z = Z(3.80)
    pts = [P3(a, 0.0, z) for a in (0.00, 0.03, 0.10, 0.22, 0.30, 0.42, 2.90)]
    _tube(b, pts, [0.020, 0.060, 0.090, 0.088, 0.060, 0.065, 0.065], G_METAL, 20)
    _tube(b, [P3(0.55, 0.0, z), P3(0.62, 0.0, z)], [0.075, 0.075], G_DARK, 20)
    return b.finish('det_probe', sharp_deg=40)


def tip_probes():
    b = B()
    for sx in (1, -1):
        x = sx * (g.XTIP - 0.12); a0 = g.LE(g.XTIP - 0.12) + 0.25; y = g.wy(g.XTIP)
        _tube(b, [P3(a0 + 0.10, x, y), P3(a0 - 0.10, x, y), P3(a0 - 0.60, x, y), P3(a0 - 1.20, x, y)], [0.050, 0.050, 0.028, 0.012], G_METAL, 12)
    return b.finish('det_tipprobe', sharp_deg=40)


def portholes():
    """Круглые окна рабочего места экипажа по бортам за кабиной (vulcan_05)."""
    bf = B(); bg = B(); a = 9.30; z = Z(4.20); r = 0.17; n = 28
    for sx in (1, -1):
        hit = g.BVH['t'].ray_cast(Vector((sx * 3.0, Yb(a), z)), Vector((-sx, 0, 0)))
        if hit[0] is None: continue
        c = hit[0]; nn = hit[1].normalized(); u = Vector((0, 1, 0)); u = (u - nn * u.dot(nn)).normalized(); v = nn.cross(u)
        ring = lambda rr, d: [c + nn * d + (u * math.cos(2 * math.pi * k / n) + v * math.sin(2 * math.pi * k / n)) * rr for k in range(n)]
        bf.loft([ring(r - 0.005, 0.004), ring(r, 0.022), ring(r + 0.045, 0.020), ring(r + 0.060, -0.01), ring(r - 0.005, -0.01)], G_SKIN)
        bg.loft([ring(r, 0.008), ring(r, -0.01)], G_GLASS, cap0=G_GLASS, cap1=G_GLASS)
    return [bf.finish('det_portframe', sharp_deg=40), bg.finish('port_glass', sharp_deg=60)]


def aimer_window():
    """Окно прицела: плоское стекло спереди блистера под носом."""
    b = B(); a0, a1 = g.BLIS['a0'] + 0.10, g.BLIS['a0'] + 0.55; n = 6
    rows = []
    for j in range(n + 1):
        a = a0 + (a1 - a0) * j / n; row = []
        for i in range(7):
            x = -0.26 + 0.52 * i / 6; h = g.BVH['t'].ray_cast(Vector((x, Yb(a), -6.0)), Vector((0, 0, 1)))
            row.append((h[0] if h[0] is not None else P3(a, x, Z(2.1))) - Vector((0, 0, 0.006)))
        rows.append(row)
    bm = b.bm; vt = [[bm.verts.new(p) for p in r] for r in rows]; vb = [[bm.verts.new(p + Vector((0, 0, 0.012))) for p in r] for r in rows]
    for j in range(n):
        for i in range(6):
            bm.faces.new((vt[j][i], vt[j][i + 1], vt[j + 1][i + 1], vt[j + 1][i])).material_index = G_GLASS
    return b.finish('aim_glass', sharp_deg=60)


def cockpit():
    """Два кресла рядом, приборная доска с козырьком, пульт посередине, пол."""
    b = B(); fl = g.FLOOR
    box3(b, P3(7.35, 0.0, fl + 0.02), 0.62, 1.25, 0.02, G_COCK)                                   # пол
    for sx in (1, -1):
        x = sx * 0.36; aS = 7.95
        box3(b, P3(aS, x, fl + 0.33), 0.22, 0.25, 0.09, G_COCK)                                   # чаша
        box3(b, P3(aS + 0.25, x, fl + 0.85), 0.23, 0.09, 0.55, G_COCK)                            # спинка
        box3(b, P3(aS + 0.28, x, fl + 1.48), 0.20, 0.10, 0.12, G_COCK)                            # заголовник
        box3(b, P3(aS + 0.16, x, fl + 0.85), 0.20, 0.03, 0.42, G_STRAP)                           # подушка
        for d in (-0.09, 0.09): box3(b, P3(aS + 0.12, x + d, fl + 0.85), 0.025, 0.01, 0.40, G_BELT)   # ремни
        box3(b, P3(aS + 0.20, x, fl + 1.66), 0.07, 0.04, 0.05, G_HANDLE)                          # ручка катапульты
        box3(b, P3(aS - 0.50, x, fl + 0.55), 0.03, 0.03, 0.20, G_DARK)                            # штурвал: колонка
        box3(b, P3(aS - 0.52, x, fl + 0.80), 0.18, 0.02, 0.025, G_DARK)
    box3(b, P3(6.55, 0.0, fl + 1.00), 0.60, 0.05, 0.30, G_COCK)                                   # доска
    for x in (-0.42, -0.14, 0.14, 0.42): box3(b, P3(6.52, x, fl + 1.02), 0.13, 0.01, 0.10, G_SCREEN)
    box3(b, P3(6.45, 0.0, fl + 1.33), 0.62, 0.15, 0.03, G_COCK)                                   # козырёк
    box3(b, P3(7.30, 0.0, fl + 0.45), 0.15, 0.55, 0.25, G_COCK)                                   # пульт
    box3(b, P3(8.45, 0.0, fl + 0.90), 0.60, 0.04, 0.90, G_COCK)                                   # переборка за креслами
    return b.finish('det_cockpit', sharp_deg=30)


def antennas():
    b = B()
    for a, side, h in ((13.2, 1, 0.30), (21.0, 1, 0.24), (12.0, -1, 0.26)):
        if side > 0: zs = g.fore_y(a, 0.0)
        else: zs = g.BVH['t'].ray_cast(Vector((0.0, Yb(a), -6.0)), Vector((0, 0, 1)))[0].z
        rg = lambda da, dz, w: [P3(a + da, -w, zs + side * dz), P3(a + da, w, zs + side * dz)]
        bm = b.bm
        pts = [P3(a + 0.18, 0.0, zs - side * 0.01), P3(a - 0.20, 0.0, zs - side * 0.01), P3(a + 0.05, 0.0, zs + side * h), P3(a + 0.12, 0.0, zs + side * h)]
        sec = lambda w: [p + Vector((w, 0, 0)) for p in pts]
        b.loft([sec(-0.012), sec(0.012)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('det_ant', sharp_deg=30)


def details():
    return [probe(), tip_probes(), aimer_window(), cockpit(), antennas()] + portholes()


def cuts(skin):
    return 0
