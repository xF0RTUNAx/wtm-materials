# tu22_gear.py - шасси Ту-22 (выпущено): основные стойки в гондолах на крыле - тележка 2 × 2 колеса, уборка назад в гондолу; передняя - спаренные колёса,
# уборка вперёд в фюзеляж под кабиной. Створки - открытые, только в файле стоек. По чертежу 05 (бок: колёса 26,0 и 27,4; передняя 11,5) и фото 01, 02, 09.
import math
from mathutils import Vector, Matrix
from modelkit import B
import tu22_geo as g
from tu22_geo import P3, Yb, strut, box, G_SKIN, G_METAL, G_DARK, G_TYRE

GZ = g.GROUND_Z
CHROME = G_METAL
MG = dict(a=26.700, x=g.POD_X, rw=0.520, ww=0.300, dx=0.235, base=1.350, piv=(25.250, -1.000))   # тележка: центр (a), колёса ±dx от оси гондолы, база осей
NG = dict(a=11.500, rw=0.420, ww=0.240, dx=0.175, piv=(12.300, -0.850))
NBAY = dict(a0=9.300, a1=12.750, hw=0.330)                        # ниша передней стойки
MBAY = dict(a0=24.700, a1=29.700, hw=0.300)                        # проём створок в гондоле


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
    """Основная стойка: нога из гондолы вниз-назад к тележке, подкос вперёд к гондоле, тележка 2 × 2 с балансиром; уборка назад - нога ложится вдоль гондолы."""
    M_ = MG; x = sx * M_['x']; a = M_['a']; zc = GZ + M_['rw']; pv = P3(M_['piv'][0], x, M_['piv'][1]); b = B(); w = M_['ww']
    top = P3(M_['piv'][0], x, M_['piv'][1] + 0.05); knee = P3(a, x, zc + 0.30)
    oleo(b, top, knee, 0.120, 0.085, 0.55)
    strut(b, P3(a, x - 0.10, zc + 0.30), P3(a, x + 0.10, zc + 0.30), 0.075, G_METAL, 14)       # шарнир балансира
    for dx in (-0.06, 0.06):                                                                    # балансир тележки
        strut(b, P3(a - M_['base'] / 2 - 0.10, x + dx, zc), P3(a + M_['base'] / 2 + 0.10, x + dx, zc), 0.050, G_METAL, 12)
        strut(b, P3(a, x + dx, zc), P3(a, x + dx, zc + 0.30), 0.045, G_METAL, 12)
    for da in (-M_['base'] / 2, M_['base'] / 2):
        strut(b, P3(a + da, x - M_['dx'] - w / 2 - 0.02, zc), P3(a + da, x + M_['dx'] + w / 2 + 0.02, zc), 0.045, G_METAL, 12)
        for sg in (1, -1): box(b, P3(a + da, x + sg * (M_['dx'] - w / 2 - 0.035), zc), 0.020, 0.17, 0.17, G_METAL)    # тормоза
    torque_links(b, top.lerp(knee, 0.62), knee, Vector((0, 1, 0)))
    kn = top.lerp(knee, 0.48); up = P3(M_['piv'][0] - 1.30, x, M_['piv'][1] + 0.02); mid = kn.lerp(up, 0.5) + Vector((0, 0, -0.12))
    for dx in (-0.06, 0.06):
        strut(b, kn + Vector((dx, 0, 0)), mid + Vector((dx, 0, 0)), 0.036, G_METAL, 10); strut(b, mid + Vector((dx, 0, 0)), up + Vector((dx, 0, 0)), 0.040, G_METAL, 10)
    strut(b, mid + Vector((-0.09, 0, 0)), mid + Vector((0.09, 0, 0)), 0.040, G_METAL, 10)
    cyl0 = P3(M_['piv'][0] - 0.70, x - sx * 0.12, M_['piv'][1] + 0.12); strut(b, cyl0, cyl0.lerp(kn, 0.55), 0.045, G_METAL, 10); strut(b, cyl0.lerp(kn, 0.5), kn, 0.026, CHROME, 10)
    hose(b, [top + Vector((-sx * 0.13, 0, -0.05)), top.lerp(knee, 0.5) + Vector((-sx * 0.14, 0.02, 0)), knee + Vector((-sx * 0.14, 0.02, 0.0)), P3(a, x - sx * 0.12, zc + 0.10)])
    leg = b.finish('gear_m_' + ('r' if sx > 0 else 'l'), sharp_deg=40)
    bw = B()
    for da in (-M_['base'] / 2, M_['base'] / 2):
        for sg in (1, -1): c = P3(a + da, x + sg * M_['dx'], zc); wheel(bw, c, M_['rw'], w); tread(bw, c, M_['rw'], w)
    wh = bw.finish('gear_w_' + ('r' if sx > 0 else 'l'), sharp_deg=40)
    for o in (leg, wh): g._rel(o, pv)
    g.PARTS['gear_m_' + ('r' if sx > 0 else 'l')] = dict(pivot=pv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 100.0), note='основная стойка: ось уборки поперёк в гондоле шасси; плюс - нога уходит назад-вверх, тележка переворачивается и ложится в гондолу; колёса gear_w - на той же оси')
    return [leg, wh]


def gear_nose():
    """Передняя стойка: нога из ниши вниз-вперёд, спаренные колёса, подкос назад, щиток-грязезащита перед колёсами (фото 01); уборка вперёд."""
    N = NG; a = N['a']; zc = GZ + N['rw']; pv = P3(N['piv'][0], 0.0, N['piv'][1]); b = B()
    top = P3(N['piv'][0], 0.0, N['piv'][1] + 0.04); bot = P3(a, 0.0, zc + 0.15)
    oleo(b, top, bot, 0.075, 0.055, 0.52)
    strut(b, bot, P3(a, 0.0, zc), 0.050, G_METAL, 10)
    strut(b, P3(a, -N['dx'] - N['ww'] / 2 - 0.03, zc), P3(a, N['dx'] + N['ww'] / 2 + 0.03, zc), 0.034, G_METAL, 10)
    torque_links(b, top.lerp(bot, 0.6), bot, Vector((0, -1, 0)))
    kn = top.lerp(bot, 0.42); up = P3(N['piv'][0] + 1.20, 0.0, N['piv'][1] + 0.02); mid = kn.lerp(up, 0.5) + Vector((0, 0, -0.10))
    for dx in (-0.05, 0.05):
        strut(b, kn + Vector((dx, 0, 0)), mid + Vector((dx, 0, 0)), 0.028, G_METAL, 8); strut(b, mid + Vector((dx, 0, 0)), up + Vector((dx, 0, 0)), 0.030, G_METAL, 8)
    strut(b, mid + Vector((-0.07, 0, 0)), mid + Vector((0.07, 0, 0)), 0.032, G_METAL, 8)
    gd = b                                                         # щиток: изогнутая плита перед колёсами
    rows = []
    for k in range(7):
        t = k / 6; ang = math.radians(-60 + 110 * t); rr = N['rw'] + 0.09
        rows.append([P3(a - rr * math.cos(ang) * 0.95, sx_, zc + rr * math.sin(ang) * 0.9 + 0.05) for sx_ in (-0.40, 0.40)])
    for r0, r1 in zip(rows, rows[1:]):
        bm = gd.bm; vs = [bm.verts.new(p) for p in r0 + r1[::-1]]; f = bm.faces.new(vs); f.material_index = G_SKIN
        vs2 = [bm.verts.new(p + Vector((0, 0, 0.012))) for p in r0 + r1[::-1]]; f2 = bm.faces.new(vs2[::-1]); f2.material_index = G_SKIN   # обратная сторона щитка
    hose(b, [top + Vector((0.08, 0, -0.04)), bot + Vector((0.08, 0.02, 0.0))])
    leg = b.finish('gear_n', sharp_deg=40)
    bw = B()
    for sg in (1, -1): c = P3(a, sg * N['dx'], zc); wheel(bw, c, N['rw'], N['ww'], holes=6); tread(bw, c, N['rw'], N['ww'])
    wh = bw.finish('gear_n_w', sharp_deg=40)
    for o in (leg, wh): g._rel(o, pv)
    g.PARTS['gear_n'] = dict(pivot=pv.copy(), axis=Vector((1, 0, 0)), range=(0.0, -95.0), note='передняя стойка: ось уборки поперёк; минус - стойка уходит вперёд-вверх в нишу под кабиной; колёса gear_n_w на той же оси')
    return [leg, wh]


def _door(name, a0, a1, xh, zh, side, depth, th=0.014):
    b = B(); rings = [[P3(a, xh, zh), P3(a, xh + side * th, zh), P3(a, xh + side * th, zh - depth), P3(a, xh, zh - depth)] for a in (a0, a1)]
    b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN); return b.finish(name, sharp_deg=30)


def gear_doors():
    """Створки, открытые: по две вдоль низа гондолы шасси (петли по бокам проёма), две у ниши передней стойки."""
    out = []
    for sx in (1, -1):
        s_ = 'r' if sx > 0 else 'l'; xc = sx * g.POD_X
        for side in (1, -1):
            xh = xc + side * MBAY['hw']; zh = g.pod_zc(27.0) - 0.45
            out.append(_door(f'gdoor_m_{s_}_{"o" if side * sx > 0 else "i"}', MBAY['a0'], MBAY['a1'], xh, zh, side, 0.55))
    for sg in (1, -1):
        xh = sg * NBAY['hw']; zh = g.fus_bot(11.0, NBAY['hw']) + 0.03
        out.append(_door('gdoor_n_' + ('r' if sg > 0 else 'l'), NBAY['a0'], NBAY['a1'], xh, zh, sg, 0.50))
    return out


def all_gear():
    return gear_nose() + gear_main(1) + gear_main(-1) + gear_doors()
