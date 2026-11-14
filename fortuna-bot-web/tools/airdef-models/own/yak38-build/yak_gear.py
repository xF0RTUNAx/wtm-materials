# yak_gear.py - шасси Як-38М (выпущено): передняя стойка с одним колесом, основные - по колесу на стойке у борта (фото 02, 07, 08).
# Створки: в основном файле закрытые door_n_r/l, door_m_r/l (прячет META gearHide, когда в ангаре стоит файл стоек), в файле стоек - открытые door_*_g.
import math
from mathutils import Vector, Matrix
from modelkit import B
import yak_geo as g
from yak_geo import P3, Yb, strut, box, G_SKIN, G_METAL, G_DARK, G_TYRE

GZ = g.GROUND_Z
CHROME = G_METAL
NG = dict(a=3.32, rw=0.280, ww=0.170, piv=(3.65, 1.02))                    # чертёж 09: 3,1 м, фото 04: 3,6
MG = dict(a=9.60, x=1.250, rw=0.400, ww=0.230, piv=(9.25, 0.80, 1.08))          # чертёж 09: 8,7 м, фото 04: 10,6, фото 08: ~9,5
NBAY = dict(a0=2.90, a1=3.95, hw=0.200)
MBAY = dict(a0=7.40, a1=9.80, x0=0.50, x1=0.79)


def wheel(b, c, r, w, n=40, holes=8):
    """Колесо вокруг поперечной оси X: шина с плечами и протектором, диск с глубиной, ступица, болты."""
    rg = lambda dx, rr: [c + Vector((dx, rr * math.cos(2 * math.pi * k / n), rr * math.sin(2 * math.pi * k / n))) for k in range(n)]
    prof = [(-w * 0.50, r * 0.58), (-w * 0.50, r * 0.78), (-w * 0.46, r * 0.90), (-w * 0.36, r * 0.975), (-w * 0.22, r), (w * 0.22, r), (w * 0.36, r * 0.975), (w * 0.46, r * 0.90), (w * 0.50, r * 0.78), (w * 0.50, r * 0.58)]
    b.loft([rg(dx, rr) for dx, rr in prof], G_TYRE)
    for sg in (1, -1):
        hub = [(sg * w * 0.50, r * 0.58), (sg * w * 0.47, r * 0.56), (sg * w * 0.30, r * 0.50), (sg * w * 0.26, r * 0.24), (sg * w * 0.36, r * 0.20), (sg * w * 0.38, r * 0.10), (sg * w * 0.30, r * 0.06)]
        b.loft([rg(dx, rr) for dx, rr in hub], G_METAL, cap1=G_METAL)
        for k in range(holes):                                  # облегчающие отверстия диска - тёмные пятаки с кромкой
            th = 2 * math.pi * (k + 0.5) / holes; cc = c + Vector((sg * w * 0.285, r * 0.37 * math.cos(th), r * 0.37 * math.sin(th)))
            b.loft([[cc + Vector((sg * dx, rr * math.cos(2 * math.pi * q / 10), rr * math.sin(2 * math.pi * q / 10))) for q in range(10)] for dx, rr in ((0.0, r * 0.07), (0.004, r * 0.07), (0.004, r * 0.055))], G_METAL, cap1=G_DARK)
        for k in range(6):                                      # болты ступицы
            th = 2 * math.pi * k / 6; cc = c + Vector((sg * w * 0.36, r * 0.15 * math.cos(th), r * 0.15 * math.sin(th)))
            b.loft([[cc + Vector((sg * dx, 0.011 * math.cos(2 * math.pi * q / 6), 0.011 * math.sin(2 * math.pi * q / 6))) for q in range(6)] for dx in (0.0, 0.016)], G_METAL, cap1=G_METAL)


def tread(b, c, r, w, n=40):
    """Протектор: продольные канавки - тонкие тёмные кольца чуть ниже поверхности шины."""
    for dx in (-w * 0.12, w * 0.12):
        rg = lambda rr, d: [c + Vector((dx + d, rr * math.cos(2 * math.pi * k / n), rr * math.sin(2 * math.pi * k / n))) for k in range(n)]
        b.loft([rg(r + 0.002, -0.008), rg(r + 0.002, 0.008), rg(r - 0.006, 0.008), rg(r - 0.006, -0.008)], G_DARK, cap0=None, cap1=None)


def oleo(b, top, bot, r_cyl, r_rod, split=0.55):
    """Амортстойка: цилиндр сверху, хромированный шток снизу, манжета на стыке."""
    m = top.lerp(bot, split); strut(b, top, m, r_cyl, G_METAL, 16); strut(b, m + (bot - top).normalized() * -0.04, bot, r_rod, CHROME, 16)
    d = (bot - top).normalized(); strut(b, m - d * 0.03, m + d * 0.01, r_cyl * 1.12, G_METAL, 16)


def torque_links(b, top, bot, side):
    """Шлиц-шарнир: два звена спереди стойки, ломаные."""
    mid = (top + bot) / 2 + side * 0.10
    for p0, p1 in ((top, mid), (mid, bot)):
        strut(b, p0 + Vector((0.025, 0, 0)), p1 + Vector((0.025, 0, 0)), 0.014, G_METAL, 8); strut(b, p0 - Vector((0.025, 0, 0)), p1 - Vector((0.025, 0, 0)), 0.014, G_METAL, 8)
    strut(b, mid + Vector((0.04, 0, 0)), mid - Vector((0.04, 0, 0)), 0.018, G_METAL, 8)


def hose(b, pts, r=0.008):
    for p0, p1 in zip(pts, pts[1:]): strut(b, p0, p1, r, G_DARK, 6)






def gear_nose():
    N = NG; a = N['a']; zc = GZ + N['rw']; pv = P3(N['piv'][0], 0.0, N['piv'][1]); b = B()
    top = P3(N['piv'][0], 0.0, N['piv'][1] + 0.05); bot = P3(a + 0.05, 0.0, zc + 0.16)
    oleo(b, top, bot, 0.055, 0.040, 0.52)
    for sg in (1, -1):
        p0 = bot + Vector((sg * (N['ww'] / 2 + 0.04), 0, 0)); strut(b, bot, p0, 0.030, G_METAL, 10); strut(b, p0, P3(a, sg * (N['ww'] / 2 + 0.04), zc), 0.026, G_METAL, 10)
    strut(b, P3(a, -N['ww'] / 2 - 0.06, zc), P3(a, N['ww'] / 2 + 0.06, zc), 0.022, G_METAL, 10)
    torque_links(b, top.lerp(bot, 0.6), bot, Vector((0, 1, 0)))
    kn = top.lerp(bot, 0.40); up = P3(N['piv'][0] - 0.70, 0.0, N['piv'][1] + 0.02); mid = kn.lerp(up, 0.5) + Vector((0, 0, -0.06))
    for dx in (-0.035, 0.035):
        strut(b, kn + Vector((dx, 0, 0)), mid + Vector((dx, 0, 0)), 0.018, G_METAL, 8); strut(b, mid + Vector((dx, 0, 0)), up + Vector((dx, 0, 0)), 0.020, G_METAL, 8)
    hose(b, [top + Vector((0.06, 0, -0.04)), bot + Vector((0.06, 0.02, 0.0))])
    leg = b.finish('gear_n', sharp_deg=40)
    bw = B(); c = P3(a, 0.0, zc); wheel(bw, c, N['rw'], N['ww'], holes=6); tread(bw, c, N['rw'], N['ww'])
    wh = bw.finish('gear_n_w', sharp_deg=40)
    for o in (leg, wh): g._rel(o, pv)
    g.PARTS['gear_n'] = dict(pivot=pv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 0.0), note='передняя стойка (только в файле стоек, не убирается)')
    return [leg, wh]


def gear_main(sx):
    M_ = MG; x = sx * M_['x']; a = M_['a']; zc = GZ + M_['rw']; pv = P3(M_['piv'][0], sx * M_['piv'][1], M_['piv'][2]); b = B(); w = M_['ww']
    top = pv + Vector((0, 0, 0.04)); knee = P3(a, x - sx * (w / 2 + 0.07), zc + 0.10)
    oleo(b, top, knee, 0.075, 0.055, 0.55)
    strut(b, knee, P3(a, x - sx * (w / 2 + 0.07), zc), 0.045, G_METAL, 12)
    strut(b, P3(a, x - sx * (w / 2 + 0.09), zc), P3(a, x + sx * (w / 2 + 0.02), zc), 0.035, G_METAL, 12)
    torque_links(b, top.lerp(knee, 0.6), knee, Vector((0, 1, 0)))
    brace0 = P3(M_['piv'][0] - 0.85, sx * 0.78, M_['piv'][2] + 0.10); kb = top.lerp(knee, 0.45); mid = kb.lerp(brace0, 0.5) + Vector((0, 0, -0.08))
    for dz in (-0.03, 0.03):
        strut(b, kb + Vector((0, 0, dz)), mid + Vector((0, 0, dz)), 0.024, G_METAL, 10); strut(b, mid + Vector((0, 0, dz)), brace0 + Vector((0, 0, dz)), 0.026, G_METAL, 10)
    box(b, P3(a, x - sx * (w / 2 + 0.035), zc), 0.020, 0.15, 0.15, G_METAL)
    hose(b, [top + Vector((-sx * 0.07, 0, -0.05)), top.lerp(knee, 0.5) + Vector((-sx * 0.08, 0.02, 0)), knee + Vector((-sx * 0.06, 0.02, 0.0))])
    leg = b.finish('gear_m_' + ('r' if sx > 0 else 'l'), sharp_deg=40)
    bw = B(); c = P3(a, x, zc); wheel(bw, c, M_['rw'], w); tread(bw, c, M_['rw'], w)
    wh = bw.finish('gear_w_' + ('r' if sx > 0 else 'l'), sharp_deg=40)
    for o in (leg, wh): g._rel(o, pv)
    g.PARTS['gear_m_' + ('r' if sx > 0 else 'l')] = dict(pivot=pv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 0.0), note='основная стойка (только в файле стоек, не убирается)')
    return [leg, wh]


def _plate(name, a0, a1, p_in, p_out, th=0.012):
    """Створка - плита между двумя линиями вдоль a (p_in, p_out: функции a -> Vector)."""
    b = B(); n = Vector((0, 0, 1)); rings = []
    for a in (a0, a1):
        q0, q1 = p_in(a), p_out(a); d = (q1 - q0); nn = d.cross(Vector((0, 1, 0))).normalized() * th
        rings.append([q0, q1, q1 + nn, q0 + nn])
    b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN); return b.finish(name, sharp_deg=30)


def closed_doors():
    """Закрытые створки ниш - в основном файле (прячет gearHide). Плиты по обшивке."""
    out = []
    for sx, s_ in ((1, 'r'), (-1, 'l')):
        N = NBAY; ob = g.patch('door_n_' + s_, lambda u, v, sx=sx: (N['a0'] + (N['a1'] - N['a0']) * v, sx * (0.004 + (N['hw'] - 0.008) * u)), 4, 10, dirn=1, lift=0.0, th=0.012, z0=-2.0); out.append(ob)
        M_ = MBAY; ob = g.patch('door_m_' + s_, lambda u, v, sx=sx: (M_['a0'] + (M_['a1'] - M_['a0']) * v, sx * (M_['x0'] + (M_['x1'] - M_['x0']) * u)), 5, 16, dirn=1, lift=0.0, th=0.012, z0=-2.0); out.append(ob)
    return out


def open_doors():
    """Открытые створки - в файле стоек: передние вниз по бокам ниши, основные откинуты вниз-наружу по наружной кромке ниши."""
    out = []
    for sx, s_ in ((1, 'r'), (-1, 'l')):
        N = NBAY; zb = g.fus_bot(3.4, N['hw'])
        out.append(_plate('door_n_' + s_ + '_g', N['a0'] + 0.02, N['a1'] - 0.02, lambda a: P3(a, sx * N['hw'], zb), lambda a: P3(a, sx * (N['hw'] + 0.02), zb - 0.40)))
        M_ = MBAY; zb = g.fus_bot(8.6, M_['x1']) + 0.02
        out.append(_plate('door_m_' + s_ + '_g', M_['a0'] + 0.02, M_['a1'] - 0.02, lambda a: P3(a, sx * M_['x1'], zb), lambda a: P3(a, sx * (M_['x1'] + 0.08), zb - 0.33)))
    return out


def all_gear():
    return gear_nose() + gear_main(1) + gear_main(-1) + open_doors()
