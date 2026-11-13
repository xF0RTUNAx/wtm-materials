# il28_gear.py - шасси Ил-28 (выпущено): основные стойки в гондолах (одно колесо на вилке, подкос вперёд, уборка назад с поворотом колеса плашмя),
# передняя стойка - спаренные колёса, уборка назад в фюзеляж. Створки - открытые, только в файле стоек. По фото il28_04, 05, 08, 09 и чертежу 01 (колея 7,15).
import math
from mathutils import Vector, Matrix
from modelkit import B
import il28_geo as g
from il28_geo import P3, Yb, strut, box, G_SKIN, G_METAL, G_DARK, G_TYRE

MG = dict(a=9.300, x=3.575, rw=0.550, ww=0.360, piv_z=-0.700)       # основная: колесо (a, x), радиус, ширина, ось уборки на высоте piv_z
NG = dict(a=2.300, rw=0.330, ww=0.200, dx=0.170, piv=(2.300, -0.450))   # передняя: колёса ±dx, ось уборки (a, z)
GZ = g.GROUND_Z
CHROME = G_METAL


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


def gear_main(sx):
    """Основная стойка: шарнир уборки в гондоле на piv_z, нога вертикально, вилка вокруг колеса, подкос вперёд-вверх к гондоле, гидроцилиндр уборки."""
    M_ = MG; x = sx * M_['x']; a = M_['a']; zc = GZ + M_['rw']; pv = P3(a, x, M_['piv_z'])
    b = B(); w = M_['ww']
    top = P3(a, x, M_['piv_z'] + 0.05); fork = P3(a, x, zc + M_['rw'] + 0.10)
    oleo(b, top, fork, 0.085, 0.062, 0.50)
    for sg in (1, -1):                                          # вилка: траверса и две щеки до оси
        p0 = fork + Vector((sg * (w / 2 + 0.05), 0, 0)); strut(b, fork, p0, 0.040, G_METAL, 10); strut(b, p0, P3(a, x + sg * (w / 2 + 0.05), zc), 0.034, G_METAL, 10)
    strut(b, P3(a, x - w / 2 - 0.08, zc), P3(a, x + w / 2 + 0.08, zc), 0.030, G_METAL, 10)
    torque_links(b, top.lerp(fork, 0.62), fork, Vector((0, 1, 0)))
    # подкос: ломаный, от середины ноги вперёд-вверх к узлу в гондоле
    kn = top.lerp(fork, 0.45); up = P3(a - 1.10, x, M_['piv_z'] + 0.05); mid = kn.lerp(up, 0.5) + Vector((0, 0, -0.10))
    for dx in (-0.05, 0.05):
        strut(b, kn + Vector((dx, 0, 0)), mid + Vector((dx, 0, 0)), 0.028, G_METAL, 10); strut(b, mid + Vector((dx, 0, 0)), up + Vector((dx, 0, 0)), 0.030, G_METAL, 10)
    strut(b, mid + Vector((-0.07, 0, 0)), mid + Vector((0.07, 0, 0)), 0.032, G_METAL, 10)
    cyl0 = P3(a - 0.55, x - sx * 0.10, M_['piv_z'] + 0.10); strut(b, cyl0, cyl0.lerp(kn, 0.55), 0.034, G_METAL, 10); strut(b, cyl0.lerp(kn, 0.5), kn, 0.020, CHROME, 10)
    hose(b, [top + Vector((-sx * 0.09, 0, -0.05)), top.lerp(fork, 0.5) + Vector((-sx * 0.10, 0.02, 0)), fork + Vector((-sx * 0.10, 0.02, 0.0)), P3(a, x - sx * (w / 2 + 0.07), zc + 0.12)])
    box(b, P3(a, x - sx * (w / 2 + 0.035), zc), 0.020, 0.16, 0.16, G_METAL)          # тормоз
    leg = b.finish('gear_m_' + ('r' if sx > 0 else 'l'), sharp_deg=40)
    bw = B(); c = P3(a, x, zc); wheel(bw, c, M_['rw'], w); tread(bw, c, M_['rw'], w)
    wh = bw.finish('gear_w_' + ('r' if sx > 0 else 'l'), sharp_deg=40)
    for o in (leg, wh): g._rel(o, pv)
    g.PARTS['gear_m_' + ('r' if sx > 0 else 'l')] = dict(pivot=pv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 95.0), note='основная стойка: ось уборки поперёк в гондоле; плюс - стойка уходит назад-вверх (колесо назад). Колесо gear_w - на той же оси, при уборке ещё поворачивается на 90° вокруг ноги и ложится плашмя под трубу двигателя')
    return [leg, wh]


def gear_nose():
    """Передняя стойка: нога наклонена немного вперёд, спаренные колёса на общей оси, подкос назад, уборка назад в фюзеляж."""
    N = NG; a = N['a']; zc = GZ + N['rw']; pv = P3(N['piv'][0], 0.0, N['piv'][1]); b = B()
    top = P3(a + 0.02, 0.0, N['piv'][1] + 0.04); bot = P3(a, 0.0, zc + 0.12)
    oleo(b, top, bot, 0.060, 0.045, 0.52)
    strut(b, bot, P3(a, 0.0, zc), 0.042, G_METAL, 10)
    strut(b, P3(a, -N['dx'] - N['ww'] / 2 - 0.03, zc), P3(a, N['dx'] + N['ww'] / 2 + 0.03, zc), 0.028, G_METAL, 10)
    torque_links(b, top.lerp(bot, 0.6), bot, Vector((0, 1, 0)))
    kn = top.lerp(bot, 0.40); up = P3(a + 0.95, 0.0, N['piv'][1] + 0.02); mid = kn.lerp(up, 0.5) + Vector((0, 0, -0.08))
    for dx in (-0.04, 0.04):
        strut(b, kn + Vector((dx, 0, 0)), mid + Vector((dx, 0, 0)), 0.022, G_METAL, 8); strut(b, mid + Vector((dx, 0, 0)), up + Vector((dx, 0, 0)), 0.024, G_METAL, 8)
    strut(b, mid + Vector((-0.06, 0, 0)), mid + Vector((0.06, 0, 0)), 0.026, G_METAL, 8)
    box(b, P3(a - 0.02, 0.0, zc + N['rw'] + 0.06), 0.30, 0.04, 0.012, G_METAL)          # щиток над колёсами
    hose(b, [top + Vector((0.07, 0, -0.04)), bot + Vector((0.07, 0.02, 0.0))])
    leg = b.finish('gear_n', sharp_deg=40)
    bw = B()
    for sg in (1, -1): c = P3(a, sg * N['dx'], zc); wheel(bw, c, N['rw'], N['ww'], holes=6); tread(bw, c, N['rw'], N['ww'])
    wh = bw.finish('gear_n_w', sharp_deg=40)
    for o in (leg, wh): g._rel(o, pv)
    g.PARTS['gear_n'] = dict(pivot=pv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 92.0), note='передняя стойка: ось уборки поперёк; плюс - стойка уходит назад-вверх в фюзеляж; колёса gear_n_w на той же оси')
    return [leg, wh]


def gear_doors():
    """Створки шасси, открытые (только в файле стоек): по две на гондолу вдоль ниши, петли по краям; две у передней ниши."""
    out = []
    for sx in (1, -1):
        s_ = 'r' if sx > 0 else 'l'; xc = sx * MG['x']; a0, a1 = 9.05, 10.85
        for side, hw in ((1, 0.25), (-1, 0.25)):
            b = B(); xh = xc + side * hw; zh = g.NT[1](10.2) + 0.06
            rings = [[P3(a, xh, zh), P3(a, xh + side * 0.014, zh), P3(a, xh + side * 0.014, zh - 0.30), P3(a, xh, zh - 0.30)] for a in (a0, a1)]
            b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
            out.append(b.finish(f'gdoor_m_{s_}_{"o" if side * sx > 0 else "i"}', sharp_deg=30))
    for sg in (1, -1):
        b = B(); xh = sg * 0.24; zh = g.fus_bot(3.0, 0.24) + 0.02
        rings = [[P3(a, xh, zh), P3(a, xh + sg * 0.014, zh), P3(a, xh + sg * 0.014, zh - 0.30), P3(a, xh, zh - 0.30)] for a in (2.50, 3.80)]
        b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
        out.append(b.finish('gdoor_n_' + ('r' if sg > 0 else 'l'), sharp_deg=30))
    return out
