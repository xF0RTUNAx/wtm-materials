# f5_geo.py - геометрия F-5E Tiger II для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z (в glTF: нос -Z).
# a - расстояние от острия ПВД назад (0 … 14,45, срез сопел). z - высота от средней плоскости прежней модели игры (низ фюзеляжа −1,43, верх киля +1,49).
# Размеры - по прежней модели игры e_f5 (длина 14,45 м, размах по законцовкам 7,7 м); форма - по фото Mark f5e_01…10 (02 - скриншот War Thunder, только планка качества).
# Чужие сетки не используются: прежняя модель снята в ортопроекциях и сечениях только для сверки габаритов.
import math
import bpy
from mathutils import Vector, Matrix
from modelkit import B
from f5kit import (Track, tracks, stations, _sm, smin, thk, loft_obj, _rel, ring_from_field, _apply_bool, _drop, resharp,
                   cove_cut, cove_wall, cove_nose, cove_wall_f, foil_ring, _in)

L = 14.45
G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_RADOME, G_DUCT, G_BELT = range(9)
PARTS = {}; STATIONS = {}; NOZ = []


def Yb(a): return L / 2 - a
def P3(a, x, z): return Vector((x, Yb(a), z))


# ── фюзеляж: (a, верх, низ, полуширина, показатель верха, низа). Под фонарём верх ниже (порог), за фонарём - гаргрот к килю (фото 04, 10) ──
FUS = [(0.42, -1.100, -1.120, 0.008, 2.0, 2.0), (0.62, -1.060, -1.160, 0.055, 2.0, 2.0), (1.00, -1.000, -1.205, 0.115, 2.0, 2.0), (1.50, -0.925, -1.255, 0.180, 2.0, 2.05),
       (2.10, -0.830, -1.310, 0.260, 2.05, 2.15), (2.80, -0.715, -1.355, 0.345, 2.1, 2.3), (3.50, -0.600, -1.390, 0.415, 2.2, 2.5), (4.20, -0.495, -1.410, 0.465, 2.3, 2.7),
       (4.90, -0.430, -1.420, 0.505, 2.4, 2.9), (5.70, -0.385, -1.425, 0.535, 2.5, 3.0), (6.50, -0.320, -1.430, 0.555, 2.5, 3.0), (7.00, -0.140, -1.430, 0.565, 2.4, 3.0),
       (7.40, -0.030, -1.432, 0.575, 2.3, 3.0), (8.00, -0.085, -1.437, 0.595, 2.3, 3.0), (9.00, -0.175, -1.445, 0.625, 2.3, 3.0), (10.00, -0.255, -1.450, 0.655, 2.3, 3.0),
       (11.00, -0.300, -1.450, 0.690, 2.3, 3.0), (12.00, -0.360, -1.420, 0.705, 2.3, 2.9), (12.80, -0.430, -1.370, 0.690, 2.3, 2.7), (13.40, -0.500, -1.300, 0.655, 2.3, 2.5),
       (13.80, -0.545, -1.240, 0.625, 2.3, 2.4), (14.00, -0.560, -1.210, 0.610, 2.3, 2.3)]
# подъём верха по чертежу f5e_14 сбоку (низ совпадает): у носа +0,07…0,10, у козырька +0,13, над фонарём и за ним +0,16, к килю на нет (Mark: «подними»)
DZ = Track([(0.42, 0.0), (1.20, 0.0), (2.00, 0.07), (2.50, 0.10), (3.50, 0.10), (4.20, 0.13), (5.00, 0.13), (5.50, 0.16), (7.00, 0.16), (7.50, 0.09), (8.50, 0.07), (9.30, 0.04), (10.20, 0.0), (14.0, 0.0)])
FUS = [(a, zt + DZ(a), zb, hw, nt, nb) for a, zt, zb, hw, nt, nb in FUS]
FT = tracks(FUS)
A_BODY1 = 13.78                                                 # дальше - две металлические трубы сопел того же радиуса (Mark: без ступеньки, сопла длиннее)

# ── воздухозаборники по бортам: D-образные, плоская сторона к фюзеляжу, впереди отсекатель (фото 03, 07, 10) ──
IN_A0, IN_A1 = 6.18, 10.90                                      # кромка (по верху) и где короб сходит в фюзеляж
IN_XC, IN_ZC = 0.815, -1.035
IN_HX = Track([(IN_A0, 0.268), (7.0, 0.277), (8.6, 0.258), (9.8, 0.155), (IN_A1, 0.0)])   # между v9 и v10 (Mark: «чуть уже»)
IN_HZ = Track([(IN_A0, 0.300), (7.0, 0.310), (8.6, 0.290), (9.8, 0.200), (IN_A1, 0.0)])
IN_RAKE = 0.10                                                  # низ кромки позади верха

# ── наплыв корня крыла (LERX): тонкая пластина в плоскости крыла от заборника к передней кромке (фото 01, 05) ──
W_ZC = -1.170
W_LE_T = math.tan(math.radians(32.6))
LX = Track([(5.85, 0.520), (6.00, 0.720), (6.20, 0.880), (6.40, 0.970), (6.60, 1.040), (6.80, 1.130), (7.00, 1.220), (7.20, 1.300), (7.40, 1.360), (7.60, 1.400), (7.85, 1.415), (8.05, 1.420)])   # по чертежам f5e_14/15


def lerx_x(a):
    if a < 5.85 or a > 8.15: return 0.0
    if a <= 8.05: return LX(a)
    return 1.42 + (a - 8.05) / W_LE_T


TAIL_A0 = 12.60                                                 # отсюда корпус перетекает в два обтекателя сопел (Mark: «не обрывается резко»)


def body_field(a):
    zt, zb, hw, nt, nb = [t(a) for t in FT]
    tt = _sm((a - TAIL_A0) / (A_BODY1 - TAIL_A0)) if a > TAIL_A0 else 0.0
    if tt > 0:                                                  # низ поднимается в ложбину между соплами, ширина сводится к обтекателям; сверху палуба под рулём до конца
        zb = zb + tt * (-0.99 - zb); hw = hw * (1 - tt) + 0.46 * tt
    rp = 0.312 + 0.05 * (1 - tt)
    cz = (zt + zb) / 2; h = (zt - zb) / 2
    xc_ = IN_XC
    if IN_A0 <= a <= IN_A1: hx, hz = IN_HX(a), IN_HZ(a)
    elif IN_A0 - 0.6 <= a < IN_A0:                              # короб выезжает из борта перед губой (там его срезает intake_front): точки сечения сдвигаются плавно, без складки на борту
        k_ = _sm((a - (IN_A0 - 0.6)) / 0.6); hx, hz = IN_HX(IN_A0), IN_HZ(IN_A0) * (0.4 + 0.6 * k_); xc_ = IN_XC - 0.55 * (1 - k_)
    else: hx, hz = 0.0, 0.0
    lx = 0.0                                                    # наплыв - отдельной пластиной (lerx_plate), в поле не входит
    def f(x, z):
        ax = abs(x); e = nt if z > cz else nb
        fb = (((ax / hw) ** e + (abs(z - cz) / h) ** e) ** (1.0 / e) - 1.0) * min(hw, h)
        if hx > 0.005:                                          # короб заборника: снаружи полукруг, к фюзеляжу плоско
            dx = ax - xc_; r = min(0.78 * hx, hz, hx)          # скруглённый прямоугольник, к фюзеляжу плоско (Mark, фото 13)
            qx = dx - (hx - r); qz = abs(z - IN_ZC) - (hz - r)
            fi = math.hypot(max(qx, 0.0), max(qz, 0.0)) + min(max(qx, qz), 0.0) - r
            fi = max(fi, -dx - 0.30)
            fb = smin(fb, fi, 0.06)
        if tt > 0:                                              # два круглых обтекателя вокруг сопел, плавно слитые с корпусом
            pe = 3.2 - 1.2 * _sm((a - 13.30) / (A_BODY1 - 13.30))            # у стабилизатора бока площе (корень без щели на всём ходе), к срезу - круг вокруг сопла
            fb = smin(fb, ((abs(ax - NZ_X) / rp) ** pe + (abs(z - NZ_Z) / rp) ** pe) ** (1.0 / pe) * rp - rp, 0.07)
        if lx > 0:
            tl = 0.040 * (1 - _sm((a - 5.85) / 2.2) * 0.4)
            fl = max(abs(z - (W_ZC + 0.01)) - tl * (1 - (ax / lx) ** 4), ax - lx)
            fb = smin(fb, fl, 0.05)
        return fb
    return f, cz


N_BODY = 160
def body():
    st = [0.42, 0.44, 0.48, 0.55, 0.65, 0.80, 1.00] + stations(1.10, A_BODY1, 0.09)
    rings = []
    for a in st:
        f, cz = body_field(a); rings.append(ring_from_field(P3, a, f, 0.0, cz, 2.0, N_BODY, nray=520, sharp_w=2.0))
    return loft_obj('s_body', rings, sharp=50)


def rrect_ring(xin, xout, zc, hz, r_out, r_in, n):
    """Скруглённый прямоугольник в (x, z): снизу посередине -> наружу -> вверх -> к фюзеляжу; наружные углы r_out, внутренние r_in."""
    r_out = min(r_out, hz, (xout - xin) * 0.9); r_in = min(r_in, hz, (xout - xin) - r_out)
    pts = []
    def arc(cx, cz, r, a0, a1, m=10):
        for i in range(m + 1):
            t = a0 + (a1 - a0) * i / m; pts.append((cx + r * math.cos(t), cz + r * math.sin(t)))
    pi = math.pi
    pts.append(((xin + xout) / 2, zc - hz))
    arc(xout - r_out, zc - hz + r_out, r_out, -pi / 2, 0)
    arc(xout - r_out, zc + hz - r_out, r_out, 0, pi / 2)
    arc(xin + r_in, zc + hz - r_in, r_in, pi / 2, pi)
    arc(xin + r_in, zc - hz + r_in, r_in, pi, 1.5 * pi)
    pts.append(pts[0])
    L = [0.0]
    for i in range(1, len(pts)): L.append(L[-1] + math.dist(pts[i - 1], pts[i]))
    out = []; j = 0
    for k in range(n):
        s = L[-1] * k / n
        while L[j + 1] < s: j += 1
        u = (s - L[j]) / max(L[j + 1] - L[j], 1e-9)
        out.append((pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u))
    return out


def intake_cut(sx):
    """Устье и канал: скруглённый прямоугольник с плоской стороной у фюзеляжа, к двигателю сходится и уходит внутрь; тёмное в глубине."""
    rings = []; n = 48
    for i in range(10):
        a = IN_A0 - 0.30 + (9.4 - IN_A0 + 0.30) * i / 9; t = _sm((a - IN_A0) / (9.4 - IN_A0))
        xin = IN_XC - 0.115 - 0.21 * t; xout = IN_XC + 0.213 - 0.37 * t; hz = 0.270 * (1 - 0.40 * t); zc = IN_ZC + 0.04 * t   # верх канала ниже верха короба (иначе прорезал его у 8,5)
        rg = [P3(a, sx * x, z) for x, z in rrect_ring(xin, xout, zc, hz, 0.55 * (xout - xin), 0.035, n)]
        rings.append(rg if sx > 0 else rg[::-1])
    b = B(); b.loft(rings, [G_DUCT] * 3 + [G_DARK] * 6, cap0=G_DUCT, cap1=G_DARK); return b.finish('c_duct', sharp_deg=38)


def intake_front(sx):
    """Срез впереди губы (верх чуть впереди низа): убирает только то, что снаружи фюзеляжа (нос короба, перемычку, начало наплыва).
    Внутренняя стенка идёт по контуру фюзеляжа + 3 мм, поэтому в борту ступеньки нет (Mark: «углубления сбоку»)."""
    x1 = IN_XC + 0.45; z_top, z_bot = -0.55, -1.55; nz = 24; rings = []
    def xf(a, z):
        zt, zb, hw, nt, nb = [t(a) for t in FT]; cz = (zt + zb) / 2; h = (zt - zb) / 2; e = nt if z > cz else nb
        u = abs(z - cz) / h
        return 0.0 if u >= 1 else hw * (1 - u ** e) ** (1 / e)
    for a in stations(IN_A0 - 1.2, IN_A0, 0.10):
        aa = lambda z: a + (0.0 if z > IN_ZC else IN_RAKE)
        zs = [z_bot + (z_top - z_bot) * k / nz for k in range(nz + 1)]
        rg = [P3(aa(z_top), x1, z_top), P3(aa(z_bot), x1, z_bot)] + [P3(aa(z), xf(aa(z), z) + 0.003, z) for z in zs]
        rg = [Vector((sx * p.x, p.y, p.z)) for p in rg]
        rings.append(rg if sx > 0 else rg[::-1])
    return loft_obj('c_inl', rings, G_SKIN, sharp=20)


def splitters():
    """Отсекатели пограничного слоя: тонкая плита перед устьем у борта, на двух стойках."""
    out = []
    for sx in (1, -1):
        b = B(); x = sx * (IN_XC - 0.20)                                    # в зазоре между бортом (~0,54) и губой (0,70)
        sec = lambda a, w, z0, z1: [P3(a, x - w, z0), P3(a, x + w, z0), P3(a, x + w, z1), P3(a, x - w, z1)]
        b.loft([sec(IN_A0 - 0.62, 0.004, -0.86, -1.22), sec(IN_A0 - 0.55, 0.008, -0.78, -1.30), sec(IN_A0 + 0.25, 0.008, -0.74, -1.34), sec(IN_A0 + 0.60, 0.006, -0.74, -1.34)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
        out.append(b.finish('splitter_' + ('r' if sx > 0 else 'l'), sharp_deg=30))
    return out


# ── крыло: тонкое трапециевидное, низкое; носки по всему размаху, закрылки внутри, элероны снаружи; законцовочные рельсы (фото 01, 05, 09) ──
W_X0, W_XT = 0.55, 3.615                                        # от фюзеляжа до законцовки
def w_le(x): return 7.66 + (x - 0.85) * W_LE_T                  # 32,6° по передней кромке (чертежи f5e_14/15, 24° - по четверти хорд)
def w_te(x): return 10.50 - 0.080 * (x - 0.85)
W_TC = 0.048
LEF_C, TEF_C = 0.15, 0.24                                       # доли хорды носка и закрылка
LEF = [(1.60, 3.52)]                                           # от стыка с наплывом
TEF = [(1.00, 2.02)]                                           # корень закрылка снаружи короба (ход без касаний)
AIL = [(2.08, 3.42)]


def wsec(sx, x):
    le, te = w_le(x), w_te(x); c = te - le; place = lambda d, h: P3(d, sx * x, W_ZC + h)
    if _in(x, LEF) is not None: u0 = LEF_C; head = cove_wall_f(le, c, W_TC, u0)
    else: u0 = 0.0006; head = cove_wall_f(le, c, W_TC, u0)
    if _in(x, TEF + AIL) is not None: u1, tail = cove_cut(le, c, W_TC, te - TEF_C * c)
    else: u1 = 1.0; tail = cove_wall(le, c, W_TC, 1.0)
    return foil_ring(le, c, W_TC, u0, u1, 26, place, tail, head)


def wing(sx):
    xs = [W_X0, 0.70, 0.85] + stations(0.95, W_XT - 0.02, 0.18) + [W_XT]
    for s0, s1 in LEF + TEF + AIL: xs += [s0 - 0.003, s0, s1, s1 + 0.003]
    xs = sorted(set(round(v, 4) for v in xs if W_X0 <= v <= W_XT))
    rs = [wsec(sx, x) for x in xs]
    return loft_obj('s_wing', rs if sx > 0 else [r[::-1] for r in rs], sharp=48)


def _surf(name, sx, x0, x1, kind):
    """Носок (kind='lef'), закрылок или элерон: свой объект, ось в PARTS."""
    a0, a1 = x0 + 0.010, x1 - 0.010; rings = []
    for j in range(7):
        x = a0 + (a1 - a0) * j / 6; le, te = w_le(x), w_te(x); c = te - le; place = lambda d, h, x=x: P3(d, sx * x, W_ZC + h)
        if kind == 'lef':
            ue = LEF_C - 0.006 / c; rings.append(foil_ring(le, c, W_TC, 0.0006, ue, 12, place, cove_wall(le, c, W_TC, ue), cove_wall_f(le, c, W_TC, 0.0006)))
        else:
            dh = te - TEF_C * c; rings.append(foil_ring(le, c, W_TC, (dh - le) / c, 1.0, 10, place, [], cove_nose(le, c, W_TC, dh)))
    ob = loft_obj(name, rings if sx > 0 else [r[::-1] for r in rings], sharp=48)
    if kind == 'lef':
        pt = lambda x: P3(w_le(x) + LEF_C * (w_te(x) - w_le(x)), sx * x, W_ZC - W_TC * (w_te(x) - w_le(x)) * thk(LEF_C))
        rng, note = (0.0, 24.0), 'носок крыла: ось у нижней задней кромки носка, плюс - носок вниз'
    else:
        pt = lambda x: P3(w_te(x) - TEF_C * (w_te(x) - w_le(x)), sx * x, W_ZC)
        rng, note = ((0.0, 45.0), 'закрылок: ось в центре круглого носа, плюс - задняя кромка вниз') if kind == 'flap' else ((-20.0, 20.0), 'элерон: ось в центре круглого носа, плюс - задняя кромка вниз')
    p0, p1 = pt(a0), pt(a1); piv = (p0 + p1) / 2; ax = (p1 - p0).normalized() * (-1 if kind == 'lef' else 1) * sx
    _rel(ob, piv); PARTS[name] = dict(pivot=piv.copy(), axis=ax.copy(), range=rng, note=note)
    return ob


def controls():
    out = []
    for sx in (1, -1):
        s = 'r' if sx > 0 else 'l'
        out.append(_surf('lef_' + s, sx, *LEF[0], 'lef')); out.append(_surf('flap_' + s, sx, *TEF[0], 'flap')); out.append(_surf('ail_' + s, sx, *AIL[0], 'ail'))
    return out


def rails():
    """Законцовочные пусковые рельсы AIM-9: тонкая балка с обтекателем носа, вдоль потока по концу крыла."""
    out = []
    for sx in (1, -1):
        x = sx * (W_XT + 0.045); n = 16; rr = Track([(8.40, 0.005), (8.60, 0.040), (8.95, 0.058), (10.35, 0.058), (10.60, 0.035), (10.70, 0.010)])
        rs = [[P3(a, x + rr(a) * math.sin(2 * math.pi * k / n), W_ZC - 0.01 + rr(a) * 1.15 * math.cos(2 * math.pi * k / n)) for k in range(n)] for a in stations(8.40, 10.70, 0.08)]
        out.append(loft_obj('rail_' + ('r' if sx > 0 else 'l'), rs if sx > 0 else [r[::-1] for r in rs], G_SKIN, sharp=45))
    return out


# ── хвост: киль с форкилем и рулём, цельноповоротный стабилизатор низко (фото 04, 05, 10) ──
FIN_Z1 = 1.49
F_LE = Track([(-0.40, 9.60), (-0.25, 10.55), (-0.08, 11.05), (0.10, 11.32), (FIN_Z1, 12.62)])
F_TE = Track([(-0.40, 13.80), (FIN_Z1, 13.32)])
def FTC(z): return 0.055 - 0.012 * max(z, 0) / FIN_Z1
RUD = [(0.05, 1.30)]; RUD_W = 0.46


def _fin_h(z):
    z0, z1 = RUD[0]; return F_TE(z0) - RUD_W + (F_TE(z1) - F_TE(z0)) * (z - z0) / (z1 - z0)


def fin():
    zs = [-0.80, -0.55] + stations(-0.40, FIN_Z1, 0.08)
    for z0, z1 in RUD: zs += [z0 - 0.003, z0, z1, z1 + 0.003]
    zs = sorted(set(round(z, 4) for z in zs)); rings = []
    for z in zs:
        z_ = max(z, -0.40); le, te = F_LE(z_), F_TE(z_); c = te - le; tc = FTC(z_); place = lambda d, h, z=z: P3(d, h, z)
        if _in(z, RUD) is not None: ue, tail = cove_cut(le, c, tc, _fin_h(z_), 0.008)
        else: ue, tail = 1.0, cove_wall(le, c, tc, 1.0)
        rings.append(foil_ring(le, c, tc, 0.0006, ue, 18, place, tail, cove_wall_f(le, c, tc, 0.0006)))
    return loft_obj('fin', rings, sharp=48)


def rudder():
    z0, z1 = RUD[0]; p0 = P3(_fin_h(z0), 0.0, z0); p1 = P3(_fin_h(z1), 0.0, z1); piv = (p0 + p1) / 2; rings = []
    for j in range(7):
        z = z0 + 0.006 + (z1 - z0 - 0.012) * j / 6; le = F_LE(z); c = F_TE(z) - le; ah = _fin_h(z)
        rings.append(foil_ring(le, c, FTC(z), (ah - le) / c, 1.0, 10, lambda d, h, z=z: P3(d, h, z), [], cove_nose(le, c, FTC(z), ah)))
    ob = loft_obj('rudder', rings, sharp=48); _rel(ob, piv)
    PARTS['rudder'] = dict(pivot=piv.copy(), axis=(p1 - p0).normalized(), range=(-30.0, 30.0), note='руль направления: ось в центре круглого носа, снизу вверх')
    return ob


ST_Z, ST_PIV = -1.115, 12.78
ST_X0, ST_X1 = 0.66, 2.10                                       # корневая нервюра строится по борту (stab)
ST_LE = Track([(ST_X0, 11.78), (ST_X1, 12.66)]); ST_TE = Track([(ST_X0, 13.32), (ST_X1, 13.24)])


def stab(sx, skin=None):
    """Корневая нервюра идёт по борту: в каждой точке хорды - самая широкая точка борта на всём ходе (±20°) плюс 1,2 см (ни касаний, ни просвета снизу)."""
    from mathutils.bvhtree import BVHTree
    bt = None
    if skin is not None:
        me = skin.data; bt = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
    def side_x(a, z0, dz):
        if bt is None: return ST_X0
        best = 0.0; d_ = a - ST_PIV; up = abs(d_) * math.sin(math.radians(20.0 if d_ > 0 else 10.0)) + 0.01; dn = abs(d_) * math.sin(math.radians(10.0 if d_ > 0 else 20.0)) + 0.01
        for k in range(17):
            z = z0 - dn + (up + dn) * k / 16; h = bt.ray_cast(Vector((sx * 3.0, Yb(a), z)), Vector((-sx, 0, 0)))
            if h[0] is not None: best = max(best, abs(h[0].x))
        return best + 0.018
    rings = []; us = [(1 - math.cos(math.pi * i / 30)) / 2 for i in range(31)]; tc = 0.040
    for j, x in enumerate([ST_X0] + stations(0.84, ST_X1, 0.12)):
        le, te = ST_LE(x), ST_TE(x); c = te - le
        pts = [(le + c * u, ST_Z + tc * c * thk(u)) for u in us] + [(le + c * u, ST_Z - tc * c * thk(u)) for u in reversed(us[1:-1])]
        if j == 0: rg = [P3(a, sx * side_x(a, z, abs(a - ST_PIV) * math.sin(math.radians(20.0)) + 0.01), z) for a, z in pts]
        else: rg = [P3(a, sx * x, z) for a, z in pts]
        rings.append(rg if sx > 0 else rg[::-1])
    name = 'stab_' + ('r' if sx > 0 else 'l'); ob = loft_obj(name, rings, sharp=48); piv = P3(ST_PIV, 0.0, ST_Z); _rel(ob, piv)
    PARTS[name] = dict(pivot=piv.copy(), axis=Vector((sx, 0, 0)), range=(-20.0, 10.0), note='цельноповоротный стабилизатор: ось поперёк; плюс - носок вверх; корень повторяет борт с зазором 1,2 см на всём ходе')
    return ob


# ── сопла: две трубы рядом, лепестки и форсажная камера (фото 05, 10) ──
NZ_X, NZ_Z, NZ_R = 0.290, -0.875, 0.300
NZ_A0, NZ_A1 = 13.70, 14.50                                     # металл от конца корпуса (13,78) до среза, сужается 0,312 -> 0,276


def noz_pods():
    out = []
    for sx in (1, -1):
        x = sx * NZ_X; n = 40; rr = Track([(NZ_A0 - 0.6, NZ_R + 0.02), (NZ_A0, NZ_R + 0.012), (NZ_A0 + 0.30, NZ_R + 0.004), (NZ_A0 + 0.35, NZ_R - 0.002)])
        rs = [[P3(a, x + rr(a) * math.sin(2 * math.pi * k / n), NZ_Z - rr(a) * math.cos(2 * math.pi * k / n)) for k in range(n)] for a in stations(NZ_A0 - 0.6, NZ_A0 + 0.35, 0.05)]
        out.append(loft_obj('s_pod', rs if sx > 0 else [r[::-1] for r in rs], sharp=50))
    return out


def nozzles():
    """Сопла: металлическая труба того же радиуса, что обтекатель на конце корпуса (без ступеньки), плавно сужается к срезу;
    на последних 0,3 м - лепестки (лёгкая волна), тонкая кромка, внутри тёмный канал, кольца и конус (фото f5e_01, 05, 16, 17)."""
    b = B(); n = 56; NOZ.clear(); R0 = 0.312
    prof = Track([(NZ_A0, R0 - 0.002), (A_BODY1, R0), (13.95, R0 - 0.002), (14.15, R0 - 0.010), (14.35, R0 - 0.023), (NZ_A1, R0 - 0.036)])
    for sx in (1, -1):
        x = sx * NZ_X
        def ring(a, r, wav=0.0):
            return [P3(a, x + (r + wav * (0.5 + 0.5 * max(-1.0, min(1.0, 2.5 * math.cos(14 * 2 * math.pi * k / n))))) * math.sin(2 * math.pi * k / n),
                       NZ_Z - (r + wav * (0.5 + 0.5 * max(-1.0, min(1.0, 2.5 * math.cos(14 * 2 * math.pi * k / n))))) * math.cos(2 * math.pi * k / n)) for k in range(n)]
        wv = lambda a: 0.003 * _sm((a - (NZ_A1 - 0.32)) / 0.10)
        outer = [ring(a, prof(a), wv(a)) for a in stations(NZ_A0, NZ_A1, 0.05)]
        lip = [ring(NZ_A1 + 0.004, R0 - 0.046), ring(NZ_A1 - 0.015, R0 - 0.052)]
        inner = [ring(NZ_A1 - 0.10, R0 - 0.050), ring(NZ_A0 + 0.30, R0 - 0.042)]
        b.loft(outer + lip + inner, G_METAL)
        b.loft([ring(NZ_A0 + 0.30, R0 - 0.042), ring(NZ_A0 - 0.6, R0 - 0.045), ring(NZ_A0 - 0.9, R0 - 0.06)], G_DARK)
        for d in (NZ_A0 + 0.05, NZ_A0 - 0.25): b.loft([ring(d - 0.02, R0 - 0.044), ring(d, R0 - 0.068), ring(d + 0.02, R0 - 0.044)], G_METAL)
        b.loft([ring(NZ_A0 - 0.9, 0.12), ring(NZ_A0 - 0.7, 0.06), ring(NZ_A0 - 0.6, 0.005)], G_METAL)
        NOZ.append((P3(NZ_A1, x, NZ_Z), round(R0 - 0.05, 3)))
    return b.finish('nozzles', sharp_deg=35)


def bore_cut():
    out = []
    for sx in (1, -1):
        x = sx * NZ_X; n = 40; ring = lambda a, r: [P3(a, x + r * math.sin(2 * math.pi * k / n), NZ_Z - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
        b = B(); rs = [ring(NZ_A1 + 0.3, NZ_R - 0.040), ring(NZ_A0 - 0.9, NZ_R - 0.040), ring(NZ_A0 - 1.0, 0.04)]
        if sx < 0: rs = [r[::-1] for r in rs]
        b.loft(rs, [G_METAL, G_DARK], cap0=G_METAL, cap1=G_DARK); out.append(b.finish('c_bore', sharp_deg=30))
    return out


# ── пушки в носу: два ствола в желобах сверху по бортам (фото 01, 03, 04) ──
GUN_X, GUN_A0, GUN_A1 = 0.230, 2.60, 2.98                      # короткий желоб только у среза ствола (Mark: длинные читались чёрными полосами)
def gz(a): return -0.880 + (a - 2.58) * (0.175 / 1.0)           # ось ствола идёт вдоль поверхности носа (на 4 см под обшивкой)


def gun_cuts():
    """Желоба пушек: правый строится как есть, левый - зеркалом (x -> -x и обратный порядок точек), чтобы резак не вывернулся."""
    x = GUN_X; sec = lambda a, w, h: [P3(a, x - w, gz(a) - h), P3(a, x + w, gz(a) - h), P3(a, x + w, gz(a) + 0.45), P3(a, x - w, gz(a) + 0.45)]
    rs = [sec(GUN_A0 - 0.20, 0.045, 0.045), sec(GUN_A0, 0.045, 0.045), sec(GUN_A0 + 0.15, 0.040, 0.035), sec(GUN_A1, 0.020, 0.0), sec(GUN_A1 + 0.10, 0.004, -0.03)]
    ml = [[Vector((-p.x, p.y, p.z)) for p in r][::-1] for r in rs]
    return [loft_obj('c_gun', rs, G_SKIN, sharp=30), loft_obj('c_gun', ml, G_SKIN, sharp=30)]


def guns():
    """Два ствола M39 в желобах: срез на 3 см впереди желоба, казна уходит в нос; дульный тормоз толще."""
    b = B()
    for sx in (1, -1):
        x = sx * GUN_X; n = 14
        for r_, a0, a1, m in ((0.021, GUN_A0 - 0.03, GUN_A0 + 1.2, G_BELT), (0.030, GUN_A0 - 0.03, GUN_A0 + 0.06, G_BELT)):
            rg = lambda a: [P3(a, x + r_ * math.sin(2 * math.pi * k / n), gz(a) - r_ * math.cos(2 * math.pi * k / n)) for k in range(n)]
            b.loft([rg(a0), rg(a1)], m, cap0=G_DARK, cap1=m)
    return b.finish('det_guns', sharp_deg=30)


def lerx_plate(sx):
    """Наплыв: тонкая чечевица в плане LX, от борта до кромки; к концу утопает в носке крыла (без складки и кармана под собой)."""
    import bmesh
    rings = []; n = 16; x0 = 0.30
    for a in stations(5.85, 8.15, 0.05):
        lx = max(lerx_x(a), x0 + 0.02); tl = 0.040 * (1 - _sm((a - 5.85) / 2.2) * 0.4) * (1 - 0.7 * _sm((a - 7.85) / 0.30)); zc = W_ZC + 0.01
        xs = [x0 + (lx - x0) * math.sin(0.5 * math.pi * k / n) for k in range(n + 1)]
        t = lambda x: max(tl * (1 - (x / lx) ** 4), 0.0015)
        rg = [P3(a, sx * x, zc - t(x)) for x in xs] + [P3(a, sx * x, zc + t(x)) for x in xs[-2:0:-1]]
        rings.append(rg if sx > 0 else rg[::-1])
    b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    bmesh.ops.recalc_face_normals(b.bm, faces=list(b.bm.faces))
    return b.finish('s_lerx', sharp_deg=60)


def build_skin():
    host = body()
    for o in [lerx_plate(1), lerx_plate(-1)]: _apply_bool(host, o, 'UNION'); _drop(o)     # до среза носа короба: наплыв начинается от губы
    for sx in (1, -1):
        c = intake_front(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    for o in [wing(1), wing(-1)]: _apply_bool(host, o, 'UNION'); _drop(o)            # трубы сопел теперь сами продолжают обтекатели (noz_pods не нужны)
    for sx in (1, -1):
        c = intake_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    for c in bore_cut() + gun_cuts(): _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'F5_skin'; host.data.name = 'F5_skin'
    return host


def plane(stage=9):
    PARTS.clear(); STATIONS.clear()
    skin = build_skin(); out = [skin]
    out += controls() + rails() + splitters() + [fin(), rudder(), stab(1, skin), stab(-1, skin), nozzles(), guns()]
    if stage >= 3:
        import importlib, f5_detail as dt; importlib.reload(dt)
        out += dt.details(skin)
    if stage >= 4:
        import f5_gear as gr; importlib.reload(gr); out += gr.gear_all()
    resharp(skin)
    return out
