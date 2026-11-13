# su_geo.py - геометрия Су-25 (свои меши по чертежам su25_01, su25_02 и фото su25_03…12 Mark). Длина 15,53 м (как прежняя модель игры), a - от кончика ПВД назад.
# Оси Blender: x вправо (правый борт +), y к носу, z вверх; z = 0 - ось ПВД (чертёж 01 сбоку). Земля на -1,58 (фото 05).
import math
import bpy
from mathutils import Vector, Matrix
from modelkit import B
from su25kit import (Track, tracks, stations, _sm, smin, thk, loft_obj, _rel, ring_from_field, _apply_bool, _drop, resharp,
                     cove_cut, cove_wall, cove_nose, cove_wall_f, foil_ring, _in)

L = 15.53
G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_RADOME, G_DUCT, G_BELT = range(9)
PARTS = {}; STATIONS = {}; NOZ = []
GROUND_Z = -1.58                                                # фото 05: от низа гондолы до земли ~0,95 м


def Yb(a): return L / 2 - a
def P3(a, x, z): return Vector((x, Yb(a), z))


# ── фюзеляж: (a, верх, низ, полуширина, показатель верха, низа). Нос тупой и короче на 0,25 м: кончик на 1,25, у кончика уже 0,4 м (фото 05, Mark: «нос короче»); выше и короче (Mark, фото 255 и чертёж 01): козырёк от 2,95 на 0,63, кабина 2,95…5,07, гаргрот 1,15 до киля, хвостовая балка до 15,45 (чертёж 01) ──
FUS = [(1.25, 0.020, -0.150, 0.060, 2.0, 2.0), (1.28, 0.090, -0.240, 0.165, 2.0, 2.0), (1.33, 0.150, -0.310, 0.235, 2.1, 2.1), (1.42, 0.205, -0.360, 0.275, 2.2, 2.2), (1.64, 0.280, -0.410, 0.310, 2.3, 2.3),
       (1.95, 0.370, -0.450, 0.345, 2.3, 2.4), (2.25, 0.460, -0.485, 0.370, 2.3, 2.4), (2.60, 0.550, -0.515, 0.400, 2.3, 2.5), (2.95, 0.630, -0.530, 0.430, 2.4, 2.6), (3.30, 0.700, -0.570, 0.470, 2.9, 2.7), (3.60, 0.740, -0.590, 0.495, 3.2, 2.8), (4.20, 0.780, -0.610, 0.530, 3.3, 2.9),
       (4.80, 0.820, -0.600, 0.550, 3.3, 3.0), (5.00, 0.900, -0.590, 0.560, 3.0, 3.0), (5.12, 1.130, -0.585, 0.565, 2.6, 3.0), (5.30, 1.160, -0.580, 0.565, 2.6, 3.0), (6.00, 1.150, -0.540, 0.555, 2.6, 3.0),
       (9.00, 1.160, -0.500, 0.500, 2.6, 3.0), (11.00, 1.160, -0.400, 0.450, 2.6, 2.8), (12.00, 1.150, 0.000, 0.330, 2.5, 2.6), (13.00, 1.120, 0.420, 0.230, 2.4, 2.4),
       (14.00, 1.080, 0.680, 0.165, 2.3, 2.3), (15.00, 1.020, 0.820, 0.110, 2.2, 2.2), (15.45, 0.980, 0.920, 0.040, 2.0, 2.0)]
FT = tracks(FUS)
A_BODY0, A_BODY1 = 1.25, 15.45

# ── мотогондолы по бортам: овал (xc, zc, hx, hz, показатель), от губы 5,95 до сопла 11,95 (чертёж 01 сверху и спереди) ──
NAC = [(5.95, 0.975, 0.320, 0.340, 0.400, 2.3), (6.30, 0.955, 0.240, 0.370, 0.540, 2.4), (6.80, 0.920, 0.160, 0.390, 0.660, 2.45), (7.20, 0.897, 0.110, 0.400, 0.720, 2.5), (10.20, 0.893, 0.100, 0.400, 0.730, 2.5),
       (11.00, 0.890, 0.200, 0.350, 0.600, 2.4), (11.45, 0.890, 0.330, 0.320, 0.420, 2.2), (11.60, 0.890, 0.350, 0.305, 0.345, 2.0)]
NT = tracks(NAC)
NAC_A0, NAC_A1 = 5.95, 11.60
IN_XC, IN_ZC, IN_HX, IN_HZ = 0.975, 0.320, 0.285, 0.370                # устье 0,57×0,74 высоко, под крылом; гондола за ним растёт вниз (Mark: «заборники вытянуты вверх»; фото спереди 30, чертёж 01 спереди - 0,22 и 0,31 общей ширины)
# Гондолы слиты с корпусом (Mark: «почему отдельно корпус и заборники?»; чертёж 01 спереди): обечайка заходит в борт уже у губы,
# сопряжение сверху и снизу - плавный минимум полей корпуса и гондолы с радиусом NAC_K(a); щели у губы нет - иначе мятый переход
NAC_K = Track([(6.90, 0.0), (7.45, 0.20), (11.60, 0.18)])        # перед 6,9 заборник отдельной трубой со щелью у борта (Mark); до конца слиты: тупые торцы у сопел (фото 11)
NAC_SPLIT = 6.90
NAC_D = Track([(6.90, 0.05), (7.40, 0.05), (7.80, 0.02), (11.60, 0.02)])   # утопление «корня»: в начале сопряжения глубже - круче пересечение с бортом
NZ_R = 0.300


def sec(xc, zc, hx, hz, e, n, sx=1):
    out = []
    for k in range(n):
        t = -math.pi / 2 + 2 * math.pi * k / n; c, s = math.cos(t), math.sin(t)
        out.append((xc + hx * math.copysign(abs(c) ** (2 / e), c), zc + hz * math.copysign(abs(s) ** (2 / e), s)))
    return out


def body_field(a):
    zt, zb, hw, nt, nb = [t(a) for t in FT]; cz = (zt + zb) / 2; h = (zt - zb) / 2
    def f(x, z):
        ax = abs(x); e = nt if z > cz else nb
        return (((ax / hw) ** e + (abs(z - cz) / h) ** e) ** (1.0 / e) - 1.0) * min(hw, h)
    return f, cz


N_BODY = 128
def body():
    st = [1.25, 1.255, 1.265, 1.28, 1.31, 1.35, 1.41, 1.50] + stations(1.60, A_BODY1 - 0.08, 0.10) + [A_BODY1 - 0.03, A_BODY1]
    rings = []
    for a in st:
        f, cz = body_field(a); rings.append(ring_from_field(P3, a, f, 0.0, cz, 2.0, N_BODY, nray=420, sharp_w=2.0))
    return loft_obj('s_body', rings, sharp=50)


def _nac_field(a, plain=False):
    """Гондола + «корень» (часть корпуса правее x 0,12, утопленная на NAC_D) с плавным минимумом радиуса NAC_K: сопряжение входит в борт под углом."""
    xc, zc, hx, hz, e = [t(a) for t in NT]
    fb, _ = body_field(a); k = NAC_K(a); d = NAC_D(a)
    def fn(x, z): return (((abs(x - xc) / hx) ** e + (abs(z - zc) / hz) ** e) ** (1.0 / e) - 1.0) * min(hx, hz)
    if plain: return fn, xc - hx + 0.03, zc
    def f(x, z):
        p, q = fn(x, z), max(fb(x, z) + d, 0.12 - x)
        if k <= 1e-4: return min(p, q)
        h = max(k - abs(p - q), 0.0) / k
        return min(p, q) - h * h * k * 0.25
    return f, xc - hx + 0.03, zc


def _ring_exit(P, a, f, cx, cz, n, rmax=1.6, nray=900):
    """Лучи из точки у внутренней кромки гондолы: к ней видны и стенка корпуса, и долина сопряжения - у каждого луча один выход; потом шаг по длине дуги."""
    pts = []
    for k in range(nray):
        th = -math.pi / 2 + 2 * math.pi * k / nray; dx, dz = math.cos(th), math.sin(th); r = 0.0; st = 0.006
        while r < rmax and f(cx + dx * r, cz + dz * r) < 0: r += st
        lo, hi = max(r - st, 0.0), r
        for _ in range(20):
            mid = (lo + hi) / 2
            if f(cx + dx * mid, cz + dz * mid) < 0: lo = mid
            else: hi = mid
        r = (lo + hi) / 2; pts.append((cx + dx * r, cz + dz * r))
    w = [0.0]
    for i in range(nray): w.append(w[-1] + math.hypot(pts[(i + 1) % nray][0] - pts[i][0], pts[(i + 1) % nray][1] - pts[i][1]))
    def at(s_):
        j = 0
        while j < nray - 1 and w[j + 1] < s_: j += 1
        t = (s_ - w[j]) / max(w[j + 1] - w[j], 1e-12); p, q = pts[j], pts[(j + 1) % nray]
        return P(a, p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
    A = 20; per = n // A; out = []                                   # якоря на постоянных углах: точки не скользят вдоль впадины от станции к станции
    for g_ in range(A):
        s0, s1 = w[g_ * nray // A], w[(g_ + 1) * nray // A]
        out += [at(s0 + (s1 - s0) * k / per) for k in range(per)]
    return out


def nacelle(sx):
    """Две части: передняя - отдельная труба от губы до 7,0 (у губы 8 см от борта, к 6,5 подходит вплотную: щель, Mark); задняя - слита с корпусом от 6,9, сопряжение нарастает от нуля."""
    n = 160; Pm = lambda a, x, z: P3(a, sx * x, z); out = []
    for nm, sts, plain in (('s_nac_f', stations(NAC_A0, 7.00, 0.05), True), ('s_nac', stations(NAC_SPLIT, 7.60, 0.05) + stations(7.70, NAC_A1, 0.10), False)):
        rings = []
        for a in sts:
            f, cx, cz = _nac_field(a, plain); rg = _ring_exit(Pm, a, f, cx, cz, n)
            rings.append(rg if sx > 0 else rg[::-1])
        out.append(loft_obj(nm, rings, sharp=50))
    return out


def intake_cut(sx):
    """Устье и канал: овал губы 3 см внутрь от обечайки, к двигателю сходится; в глубине тёмный."""
    rings = []; n = 48
    for i in range(9):
        a = NAC_A0 - 0.20 + (8.4 - NAC_A0 + 0.20) * i / 8; t = _sm((a - NAC_A0) / (8.4 - NAC_A0))
        hx = IN_HX * (1 - 0.30 * t); hz = IN_HZ * (1 - 0.35 * t); zc = IN_ZC - 0.05 * t
        rg = [P3(a, sx * x, z) for x, z in sec(IN_XC, zc, hx, hz, 2.2, n)]
        rings.append(rg if sx > 0 else rg[::-1])
    b = B(); b.loft(rings, [G_DUCT] * 3 + [G_DARK] * 5, cap0=G_DUCT, cap1=G_DARK); return b.finish('c_duct', sharp_deg=38)


def slot_cut(sx):
    """Щель между заборником и бортом (Mark: «не должны упираться в корпус»): по всей высоте гондолы вместе с сопряжением, у губы 9 см, к 6,95 сходит на нет.
    Борт не режется (стенка щели - на 2 мм от самой широкой части корпуса); внутренняя стенка заборника становится плоской."""
    rings = []; n = 120; A1 = 6.95
    for a in [5.60, 5.80] + stations(5.95, A1, 0.04):
        t = min(max((a - 5.95) / (A1 - 5.95), 0.0), 1.0); w = 0.09 * (1 - t) ** 1.2 + 0.002; x0 = FT[2](a) + 0.002
        aa = min(max(a, NAC_A0), 7.2); zc = NT[1](aa); hz = NT[3](aa) + 0.16
        rg = [P3(a, sx * x, z) for x, z in sec(x0 + w / 2, zc, w / 2, hz, 6.0, n)]
        rings.append(rg if sx > 0 else rg[::-1])
    b = B(); b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN); return b.finish('c_slot', sharp_deg=38)


def nozzle_cut(sx):
    rings = []; n = 40
    for a, r in ((NAC_A1 + 0.30, NZ_R - 0.03), (NAC_A1 - 0.60, NZ_R - 0.03), (NAC_A1 - 0.70, 0.03)):
        xc, zc = NT[0](NAC_A1), NT[1](NAC_A1)
        rg = [P3(a, sx * (xc + r * math.sin(2 * math.pi * k / n)), zc - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
        rings.append(rg if sx > 0 else rg[::-1])
    b = B(); b.loft(rings, [G_METAL, G_DARK], cap0=G_METAL, cap1=G_DARK); return b.finish('c_noz', sharp_deg=30)


def nozzles():
    """Сопла: короткие металлические трубы на срезе гондол, лёгкое сужение, тонкая кромка, внутри тёмный канал (фото 10, 11)."""
    b = B(); n = 48; NOZ.clear()
    for sx in (1, -1):
        xc, zc = NT[0](NAC_A1), NT[1](NAC_A1)
        ring = lambda a, r: [P3(a, sx * (xc + r * math.sin(2 * math.pi * k / n)), zc - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
        b.loft([ring(NAC_A1 - 0.10, NZ_R + 0.002), ring(NAC_A1 + 0.02, NZ_R + 0.004), ring(NAC_A1 + 0.12, NZ_R - 0.008), ring(NAC_A1 + 0.135, NZ_R - 0.030),
                ring(NAC_A1 + 0.10, NZ_R - 0.034), ring(NAC_A1 - 0.30, NZ_R - 0.032)], G_METAL)
        b.loft([ring(NAC_A1 - 0.30, NZ_R - 0.032), ring(NAC_A1 - 0.65, NZ_R - 0.040), ring(NAC_A1 - 0.80, 0.05)], G_DARK)
        NOZ.append((P3(NAC_A1 + 0.135, sx * xc, zc), NZ_R - 0.03))
    return b.finish('nozzles', sharp_deg=35)


# ── крыло: высокоплан с отрицательным V, стреловидность ~18° по передней кромке; предкрылки, закрылки в две секции, элероны; гондолы щитков на законцовках ──
W_X0, W_XT = 0.20, 6.85                                          # корень заведён в корпус (Mark: между крылом и бортом была канавка 1-2 см)
def w_le(x): return 7.05 + (x - 1.20) * 0.335
def w_te(x): return 10.05 - (x - 1.20) * 0.020
def w_zc(x): return 0.830 - 0.0625 * (x - 1.25)
def w_tc(x): return 0.055 - 0.010 * max(0.0, x - 1.2) / 5.65
SLAT_C, FLAP_C, AIL_C = 0.13, 0.27, 0.25
SLAT = [(2.00, 6.70)]
FLAP = [(1.35, 3.00), (3.04, 4.62)]
AIL = [(4.66, 6.70)]


def wsec(sx, x):
    le, te = w_le(x), w_te(x); c = te - le; tc = w_tc(x); zc = w_zc(x); place = lambda d, h: P3(d, sx * x, zc + h)
    if _in(x, SLAT) is not None: u0 = SLAT_C; head = cove_wall_f(le, c, tc, u0)
    else: u0 = 0.0006; head = cove_wall_f(le, c, tc, u0)
    if _in(x, FLAP + AIL) is not None:
        fc = AIL_C if _in(x, AIL) is not None else FLAP_C; u1, tail = cove_cut(le, c, tc, te - fc * c)
    else: u1 = 1.0; tail = cove_wall(le, c, tc, 1.0)
    return foil_ring(le, c, tc, u0, u1, 26, place, tail, head)


def wing(sx):
    xs = [W_X0, 0.80, 1.20] + stations(1.35, W_XT - 0.02, 0.20) + [W_XT]
    for s0, s1 in SLAT + FLAP + AIL: xs += [s0 - 0.003, s0, s1, s1 + 0.003]
    xs = sorted(set(round(v, 4) for v in xs if W_X0 <= v <= W_XT))
    rs = [wsec(sx, x) for x in xs]
    return loft_obj('s_wing', rs if sx > 0 else [r[::-1] for r in rs], sharp=48)


def _surf(name, sx, x0, x1, kind):
    a0, a1 = x0 + 0.010, x1 - 0.010; rings = []
    fc = {'slat': SLAT_C, 'flap': FLAP_C, 'ail': AIL_C}[kind]
    for j in range(7):
        x = a0 + (a1 - a0) * j / 6; le, te = w_le(x), w_te(x); c = te - le; tc = w_tc(x); zc = w_zc(x); place = lambda d, h, x=x, zc=zc: P3(d, sx * x, zc + h)
        if kind == 'slat':
            ue = fc - 0.006 / c; rings.append(foil_ring(le, c, tc, 0.0006, ue, 12, place, cove_wall(le, c, tc, ue), cove_wall_f(le, c, tc, 0.0006)))
        else:
            dh = te - fc * c; rings.append(foil_ring(le, c, tc, (dh - le) / c, 1.0, 10, place, [], cove_nose(le, c, tc, dh)))
    ob = loft_obj(name, rings if sx > 0 else [r[::-1] for r in rings], sharp=48)
    if kind == 'slat':
        pt = lambda x: P3(w_le(x) + fc * (w_te(x) - w_le(x)), sx * x, w_zc(x) - w_tc(x) * (w_te(x) - w_le(x)) * thk(fc))
        rng, note = (0.0, 20.0), 'предкрылок: ось у нижней задней кромки, плюс - носок вниз и вперёд'
    else:
        pt = lambda x: P3(w_te(x) - fc * (w_te(x) - w_le(x)), sx * x, w_zc(x))
        rng, note = ((0.0, 40.0), 'закрылок: ось в центре круглого носа, плюс - задняя кромка вниз') if kind == 'flap' else ((-20.0, 20.0), 'элерон: ось в центре круглого носа, плюс - задняя кромка вниз')
    p0, p1 = pt(a0), pt(a1); piv = (p0 + p1) / 2; ax = (p1 - p0).normalized() * (-1 if kind == 'slat' else 1) * sx
    _rel(ob, piv); PARTS[name] = dict(pivot=piv.copy(), axis=ax.copy(), range=rng, note=note)
    return ob


def controls():
    out = []
    for sx in (1, -1):
        s = 'r' if sx > 0 else 'l'
        out.append(_surf('slat_' + s, sx, *SLAT[0], 'slat'))
        out.append(_surf('flap1_' + s, sx, *FLAP[0], 'flap')); out.append(_surf('flap2_' + s, sx, *FLAP[1], 'flap')); out.append(_surf('ail_' + s, sx, *AIL[0], 'ail'))
    return out


# ── законцовочные гондолы: обтекатель с расщепляющимися щитками сзади (вверх и вниз), ниши под щитками (фото 06, 07, 09) ──
POD_X = 7.00; POD_A0, POD_A1, POD_SB = 8.56, 10.75, 9.99                # щитки - за задней кромкой законцовки крыла
def pod_zc(): return w_zc(POD_X)
POD_R = Track([(POD_A0, 0.005), (POD_A0 + 0.05, 0.070), (POD_A0 + 0.18, 0.130), (POD_A0 + 0.40, 0.160), (10.15, 0.160), (10.60, 0.110), (POD_A1, 0.030)])
POD_HZ = 1.15                                                     # чуть выше, чем шире


def pod_ring(a, sx, n=40, top=None):
    r = POD_R(a); xc = sx * POD_X; zc = pod_zc()
    ks = range(n) if top is None else range(n // 2 + 1)
    out = []
    for k in ks:
        t = 2 * math.pi * k / n if top is None else (math.pi * k / (n // 2))
        if top is None: out.append(P3(a, xc + r * math.sin(t), zc - r * POD_HZ * math.cos(t)))
        else:
            s_ = 1 if top else -1; t = 0.02 + (math.pi - 0.04) * k / (n // 2)                       # зазор по разъёму щитков ~1,3 см
            out.append(P3(a, xc + r * math.cos(t) * sx, zc + s_ * (0.003 + r * POD_HZ * math.sin(t))))
    return out


def pods():
    """Неподвижная передняя часть гондолы до щитков, в ней ниша (тёмная), фара и навигационный огонь."""
    out = []
    for sx in (1, -1):
        rs = [pod_ring(a, sx) for a in stations(POD_A0, POD_SB, 0.06)]
        b = B(); b.loft(rs if sx > 0 else [r[::-1] for r in rs], G_SKIN, cap0=None, cap1=G_DARK); out.append(b.finish('pod_' + ('r' if sx > 0 else 'l'), sharp_deg=40))
    return out


def pod_brakes():
    """Щитки: задняя половина гондолы, верхняя и нижняя створки (полуоболочки с тёмной внутренней стороной), петля спереди; 0…55°."""
    out = []
    for sx in (1, -1):
        for top in (True, False):
            rs = []
            for a in stations(POD_SB + 0.004, POD_A1, 0.06):
                rg = pod_ring(a, sx, 40, top); cen = P3(a, sx * POD_X, pod_zc())
                inner = [cen + (p - cen) * 0.88 for p in reversed(rg)]
                rs.append(rg + inner)
            if (sx > 0) != top: rs = [r[::-1] for r in rs]
            b = B(); b.loft(rs, G_SKIN, cap0=G_DARK, cap1=G_SKIN); nm = f'sbrake_{"u" if top else "d"}_{"r" if sx > 0 else "l"}'
            ob = b.finish(nm, sharp_deg=40); piv = P3(POD_SB + 0.01, sx * POD_X, pod_zc() + (1 if top else -1) * POD_R(POD_SB) * POD_HZ); _rel(ob, piv)      # петля на внешней кромке: передний край уходит назад, не в гондолу
            ax = Vector((1, 0, 0)) * (-1 if top else 1)                                   # плюс - верхний вверх, нижний вниз
            PARTS[nm] = dict(pivot=piv.copy(), axis=ax, range=(0.0, 55.0), note='расщепляющийся тормозной щиток в законцовочной гондоле: петля спереди на внешней кромке, верхний вверх, нижний вниз; под щитками тёмная ниша')
            out.append(ob)
    return out


# ── хвост: киль с рулём из двух секций, стабилизатор с рулями высоты (не цельноповоротный), хвостовой конус с кассетами ──
FIN_Z0, FIN_Z1 = 1.10, 3.68
F_LE = Track([(FIN_Z0 - 0.05, 11.40), (FIN_Z1, 13.07)]); F_TE = Track([(FIN_Z0 - 0.05, 14.12), (FIN_Z1, 14.08)])
def FTC(z): return 0.050 - 0.012 * (z - FIN_Z0) / (FIN_Z1 - FIN_Z0)
RUD = [(1.42, 2.48), (2.52, 3.56)]; RUD_C = 0.30


def fin():
    zs = [FIN_Z0 - 0.25, FIN_Z0 - 0.05] + stations(FIN_Z0, FIN_Z1, 0.10)
    for z0, z1 in RUD: zs += [z0 - 0.003, z0, z1, z1 + 0.003]
    zs = sorted(set(round(z, 4) for z in zs)); rings = []
    for z in zs:
        z_ = max(z, FIN_Z0 - 0.05); le, te = F_LE(z_), F_TE(z_); c = te - le; tc = FTC(z_); place = lambda d, h, z=z: P3(d, h, z)
        if _in(z, RUD) is not None: ue, tail = cove_cut(le, c, tc, te - RUD_C * c)
        else: ue, tail = 1.0, cove_wall(le, c, tc, 1.0)
        rings.append(foil_ring(le, c, tc, 0.0006, ue, 18, place, tail, cove_wall_f(le, c, tc, 0.0006)))
    return loft_obj('fin', rings, sharp=48)


def rudders():
    out = []
    for i, (z0, z1) in enumerate(RUD):
        hp = lambda z: F_TE(z) - RUD_C * (F_TE(z) - F_LE(z)); p0 = P3(hp(z0), 0.0, z0); p1 = P3(hp(z1), 0.0, z1); piv = (p0 + p1) / 2; rings = []
        for j in range(7):
            z = z0 + 0.006 + (z1 - z0 - 0.012) * j / 6; le = F_LE(z); c = F_TE(z) - le; ah = hp(z)
            rings.append(foil_ring(le, c, FTC(z), (ah - le) / c, 1.0, 10, lambda d, h, z=z: P3(d, h, z), [], cove_nose(le, c, FTC(z), ah)))
        nm = f'rudder{i + 1}'; ob = loft_obj(nm, rings, sharp=48); _rel(ob, piv)
        PARTS[nm] = dict(pivot=piv.copy(), axis=(p1 - p0).normalized(), range=(-25.0, 25.0), note='руль направления (две секции): ось в центре круглого носа')
        out.append(ob)
    return out


ST_X0, ST_X1 = 0.10, 2.32                                       # стабилизатор неподвижный: корень утоплен в балку
def st_le(x): return 12.45 + (x - 0.10) * (13.45 - 12.45) / (ST_X1 - 0.10)
def st_te(x): return 14.42 + (x - 0.10) * (14.30 - 14.42) / (ST_X1 - 0.10)
def st_zc(x): return 1.18 + 0.040 * max(0.0, x - 0.20)
ST_TC, ELV_C = 0.045, 0.32
ELV = [(0.36, 2.28)]


def stab(sx):
    xs = [ST_X0, 0.30] + stations(0.36, ST_X1 - 0.02, 0.18) + [ST_X1]
    for s0, s1 in ELV: xs += [s0 - 0.003, s0, s1, s1 + 0.003]
    xs = sorted(set(round(v, 4) for v in xs if ST_X0 <= v <= ST_X1)); rs = []
    for x in xs:
        le, te = st_le(x), st_te(x); c = te - le; place = lambda d, h, x=x: P3(d, sx * x, st_zc(x) + h)
        if _in(x, ELV) is not None: u1, tail = cove_cut(le, c, ST_TC, te - ELV_C * c)
        else: u1, tail = 1.0, cove_wall(le, c, ST_TC, 1.0)
        rs.append(foil_ring(le, c, ST_TC, 0.0006, u1, 20, place, tail, cove_wall_f(le, c, ST_TC, 0.0006)))
    return loft_obj('stab_' + ('r' if sx > 0 else 'l'), rs if sx > 0 else [r[::-1] for r in rs], sharp=48)


def elevator(sx):
    x0, x1 = ELV[0]; a0, a1 = x0 + 0.01, x1 - 0.01; rings = []
    hp = lambda x: st_te(x) - ELV_C * (st_te(x) - st_le(x))
    for j in range(7):
        x = a0 + (a1 - a0) * j / 6; le, te = st_le(x), st_te(x); c = te - le; dh = hp(x)
        rings.append(foil_ring(le, c, ST_TC, (dh - le) / c, 1.0, 10, lambda d, h, x=x: P3(d, sx * x, st_zc(x) + h), [], cove_nose(le, c, ST_TC, dh)))
    nm = 'elev_' + ('r' if sx > 0 else 'l'); ob = loft_obj(nm, rings if sx > 0 else [r[::-1] for r in rings], sharp=48)
    p0 = P3(hp(a0), sx * a0, st_zc(a0)); p1 = P3(hp(a1), sx * a1, st_zc(a1)); piv = (p0 + p1) / 2; _rel(ob, piv)
    PARTS[nm] = dict(pivot=piv.copy(), axis=(p1 - p0).normalized() * sx, range=(-25.0, 15.0), note='руль высоты: ось в центре круглого носа, плюс - задняя кромка вниз')
    return ob


# ── ПВД (фото Mark 34, 35): две толстые штанги на верхних «плечах» носа, у основания конические обтекатели; чуть вверх и врозь;
#    к концу тонкая трубка с металлическим наконечником; на правой - узел флюгарок угла атаки и скольжения; на верху носа перед козырьком - лопатка ──
PVD = dict(a_b=1.68, x=0.165, rise=math.radians(3.5), splay=math.radians(1.5))
def _surf_top(a, x):
    f, cz = body_field(a); lo, hi = cz, 2.0
    for _ in range(30):
        m = (lo + hi) / 2
        if f(x, m) < 0: lo = m
        else: hi = m
    return lo


def pitots():
    b = B(); n = 14
    def ring(c, r, a):
        return [P3(a, c[0] + r * math.sin(2 * math.pi * k / n), c[1] - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    for sx in (1, -1):
        ab = PVD['a_b']; x0 = sx * PVD['x']; z0 = _surf_top(ab, PVD['x']) + 0.022
        at = lambda a: (x0 + sx * (ab - a) * math.tan(PVD['splay']), z0 + (ab - a) * math.tan(PVD['rise']))
        # обтекатель основания: конус от обшивки к трубе
        b.loft([ring(at(a), r, a) for a, r in ((ab + 0.30, 0.004), (ab + 0.26, 0.030), (ab + 0.12, 0.045), (ab - 0.02, 0.046), (ab - 0.10, 0.036))], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
        # штанга: толстая часть (крашеная), сужение, тонкая трубка, металлический наконечник
        b.loft([ring(at(a), r, a) for a, r in ((ab - 0.08, 0.031), (0.62, 0.030), (0.52, 0.026), (0.48, 0.014))], G_SKIN, cap0=G_SKIN)
        b.loft([ring(at(a), r, a) for a, r in ((0.49, 0.013), (0.06, 0.011), (0.025, 0.009), (0.0, 0.004))], G_METAL, cap1=G_METAL)
        hb = at(1.20)                                                   # хомут
        b.loft([ring(hb, r, a) for a, r in ((1.22, 0.031), (1.215, 0.036), (1.185, 0.036), (1.18, 0.031))], G_METAL)
        if sx > 0:                                                      # узел флюгарок на правой (фото 34): поперечная планка, две стреловидные лопатки, два крючка вперёд
            av = 0.80; c = at(av)
            b.loft([[P3(av + dy, c[0] + dx, c[1] + dz) for dx, dz in ((-0.085, -0.006), (0.085, -0.006), (0.085, 0.006), (-0.085, 0.006))] for dy in (-0.008, 0.008)], G_METAL, cap0=G_METAL, cap1=G_METAL)
            for dx in (-0.085, 0.085):
                pts = [(0.0, 0.0), (0.075, 0.035), (0.075, 0.055), (0.0, 0.03)]       # лопатка: назад и наружу
                b.loft([[P3(av + pa, c[0] + dx + math.copysign(pw, dx) * 0.6, c[1] - 0.002 + dz) for pa, pw in pts] for dz in (0.0, 0.004)], G_METAL, cap0=G_METAL, cap1=G_METAL)
            for dx in (-0.035, 0.035):                                  # крючки вперёд-вверх
                b.loft([[P3(av - t * 0.07, c[0] + dx + ex, c[1] + 0.012 + t * 0.03 + ez) for ex, ez in ((-0.004, -0.004), (0.004, -0.004), (0.004, 0.004), (-0.004, 0.004))] for t in (0.0, 0.5, 1.0)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    # лопатка-антенна на верху носа перед козырьком (фото 35)
    ab2 = 2.70; zt = _surf_top(ab2, 0.0)
    b.loft([[P3(ab2 + da, sx_ * 0.006, zt - 0.02 + h) for sx_, (da, h) in zip((-1, 1, 1, -1), ((0.10, 0.0), (0.10, 0.0), (-0.02, 0.0), (-0.02, 0.0)))] for _ in (0,)] +
           [[P3(ab2 + 0.07 + q, sx_ * 0.004, zt + 0.10) for sx_, q in zip((-1, 1, 1, -1), (0.0, 0.0, -0.05, -0.05))]], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('det_pitot', sharp_deg=30)


def build_skin():
    host = body()
    for o in nacelle(1) + nacelle(-1) + [wing(1), wing(-1)]: _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        for c in (intake_cut(sx), nozzle_cut(sx)): _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'S25_skin'; host.data.name = 'S25_skin'
    return host


def plane(stage=9):
    PARTS.clear(); STATIONS.clear()
    skin = build_skin(); out = [skin]
    out += controls() + pods() + pod_brakes() + [fin()] + rudders() + [stab(1), stab(-1), elevator(1), elevator(-1), nozzles(), pitots()]
    if stage >= 3:
        import importlib, su_detail as dt; importlib.reload(dt)
        out += dt.details(skin)
    if stage >= 4:
        import su_gear as gr; importlib.reload(gr); out += gr.gear_all()
    resharp(skin)
    return out
