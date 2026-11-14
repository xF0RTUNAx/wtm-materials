# yak_geo.py - геометрия Як-38М для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z. a - от носка фюзеляжа назад (без ПВД), z - от земли (стоянка).
# Размеры: чертёж 01 (сверху, снизу, спереди) по шкале 0-3 м: 34,47 пикс/м, длина 16,13 м, размах 6,8 м; вида сбоку на чертеже нет - профиль по фото 04
# (масштаб подогнан к той же длине: 45,6 пикс/м), проверка по 02, 07, 08. Вид спереди на чертеже по высоте сжат - высоты взяты с фото.
# Сетки и текстуры чужих моделей не используются.
import math
import bmesh
import bpy
from mathutils import Vector, Matrix
from modelkit import B
import yak_base as tb
from yak_base import *
from yak_base import _circ, _in, _apply_bool, _drop, _tag, _rel, _resample

L = 16.13; tb.set_len(L)
PARTS = tb.PARTS
GROUND_Z = 0.0


def outward(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    if bm.calc_volume(signed=True) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:]); bm.to_mesh(ob.data)
    bm.free(); return ob


# ── фюзеляж: (a, верх, низ, полуширина, показатель верха, низа); у воздухозаборников - узкая середина, по бокам каналы (intake_body) ──
FUS = [(0.000, 1.270, 1.230, 0.012, 2.0, 2.0), (0.100, 1.320, 1.170, 0.050, 2.0, 2.0), (0.440, 1.450, 1.070, 0.130, 2.0, 2.0), (1.100, 1.620, 0.990, 0.270, 2.0, 2.2),
       (1.750, 1.800, 0.940, 0.360, 2.1, 2.3), (2.410, 1.950, 0.920, 0.440, 2.2, 2.5), (3.290, 2.100, 0.900, 0.520, 2.3, 2.8), (4.170, 2.270, 0.850, 0.540, 2.4, 2.8),
       (5.000, 2.380, 0.830, 0.600, 2.4, 2.6), (6.200, 2.410, 0.830, 0.780, 2.4, 2.6), (7.200, 2.420, 0.830, 0.890, 3.1, 2.6), (9.800, 2.410, 0.810, 0.900, 3.1, 2.6),
       (11.00, 2.410, 0.830, 0.890, 2.8, 2.5), (12.00, 2.420, 0.900, 0.850, 2.4, 2.4), (12.94, 2.440, 1.050, 0.790, 2.3, 2.3), (14.25, 2.300, 1.400, 0.740, 2.4, 2.4),
       (14.80, 2.240, 1.550, 0.660, 2.2, 2.2), (15.40, 2.160, 1.700, 0.480, 2.1, 2.1), (15.95, 2.040, 1.850, 0.190, 2.0, 2.0), (16.13, 1.980, 1.920, 0.040, 2.0, 2.0)]
FT = tracks(FUS)
FUS_END = 16.13
TROUGH_X = 0.730; INL_WAIST = 0.400                                                   # полуширина низа фюзеляжа у сопел


def fus_top(a, x=0.0):
    top, bot, hw, nt = FT[0](a), FT[1](a), FT[2](a), FT[3](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nt); return cy + ht * q ** (1 / nt)


def fus_bot(a, x=0.0):
    top, bot, hw, nb = FT[0](a), FT[1](a), FT[2](a), FT[4](a); cy = (top + bot) / 2; ht = (top - bot) / 2
    q = max(0.0, 1 - (min(abs(x), hw) / hw) ** nb); return cy - ht * q ** (1 / nb)


def fus_hw(a, z):
    top, bot, hw, nt, nb = [t(a) for t in FT]; cy = (top + bot) / 2; ht = (top - bot) / 2; s = (z - cy) / ht; e = nt if s > 0 else nb
    return hw * max(0.0, 1 - min(1.0, abs(s)) ** e) ** (1 / e)


def hull():
    st = [0.0, 0.02, 0.06, 0.12, 0.2, 0.32, 0.46, 0.65] + stations(0.85, 15.6, 0.12)[1:] + [15.7, 15.8, 15.88, 15.95, 16.02, 16.08, FUS_END]
    def ring(a):
        r = sup(a, 0.0, *[t(a) for t in FT], 96); w = smooth_(10.45, 10.95, a) * (1 - smooth_(11.95, 12.45, a))
        w2 = smooth_(3.55, 4.00, a) * (1 - smooth_(4.45, 4.95, a))          # поджатие борта только у губы: дальше плечо заборника сливается с бортом без ложбины (Mark)
        if w <= 0 and w2 <= 0: return r
        out = []
        for p in r:
            ax_ = abs(p.x)
            m = w * smooth_(1.58, 1.40, p.z); ax_ = ax_ + (min(ax_, TROUGH_X) - ax_) * m                    # у поворотных сопел низ борта поджат (фото 08)
            zt_ = inl_dims(a)[3] + 0.22 * smooth_(4.30, 6.00, a); m2 = w2 * smooth_(INL_Z0 + 0.02, INL_Z0 + 0.16, p.z) * smooth_(zt_ + 0.02, zt_ - 0.12, p.z); ax_ = ax_ + (min(ax_, INL_WAIST) - ax_) * m2   # у заборников борт поджат: прямая стенка заборника стоит у узкого фюзеляжа
            out.append(Vector((math.copysign(ax_, p.x), p.y, p.z)))
        return out
    st += stations(13.40, 16.10, 0.04) + [10.5, 10.6, 10.7, 10.8, 10.9, 12.0, 12.1, 12.2, 12.3, 12.4, 3.6, 3.7, 3.8, 3.9, 3.95, 4.0, 4.05, 4.1, 4.9, 5.0, 5.1, 5.2, 5.3, 5.4]
    return loft_obj('s_hull', [ring(a) for a in sorted(set(round(v, 4) for v in st))], sharp=50)


# ── воздухозаборники: полукруглые по бокам, губа на 4,02 (план 01: наружу до 0,91; фото 04: по высоте 0,86…2,28) ──
INL_A0, INL_Z0, INL_Z1, INL_XO = 4.02, 0.94, 2.12, 1.100                 # Mark: заборник ниже - сверху (было 2,28) и снизу (было 0,86)                 # Mark: наружная сторона вытянута сильнее - почти полукруг (ширина 0,68 при высоте 1,42)
INL_RAKE = 0.28                                                    # губа в профиль серпом (фото 02, 07): верх и низ на 0,28 м позади середины
def dshape(a, sx, xin, xout, z0, z1, ri, ro, n, lift=0.0, w=0.0):
    """Сечение заборника как у Су-24М, F-4: сторона к фюзеляжу прямая (малые скругления ri), наружные углы скруглены сильно (ro).
    Начало - середина низа, обход: низ наружу, наружная сторона вверх, верх внутрь, прямая сторона вниз."""
    P = []
    def arc(cx, cz, r, t0, t1, k=10): return [(cx + r * math.cos(t0 + (t1 - t0) * i / k), cz + r * math.sin(t0 + (t1 - t0) * i / k)) for i in range(k + 1)]
    xc = xin + max(ri, 0.07); rx = xout - xc; rz = (z1 - z0) / 2; zc = (z0 + z1) / 2                     # Mark: наружная сторона - полукругом (полуэллипс на всю высоту), у фюзеляжа - прямая стенка
    xu = xc * (1 - w) + xin * w; zt = z1 + lift; zcu = (z0 + zt) / 2; rzu = (zt - z0) / 2; rxu = xout - xu    # за губой одна дуга от низа до поднятого верха: выпуклое плечо к борту (Mark: не впадиной, а на увеличение)
    P += [(xu + rxu * math.cos(t), zcu + rzu * math.sin(t)) for t in [-math.pi / 2 + math.pi * i / 32 for i in range(33)]]
    P += arc(xin + ri, z1 + lift - ri, ri, math.pi / 2, math.pi, 4) + arc(xin + ri, z0 + ri, ri, math.pi, 1.5 * math.pi, 4)
    Q = _resample([Vector(p) for p in P], n)
    return [P3(a, sx * q.x, q.y) for q in Q]


def inl_dims(a):
    """Прямая стенка у фюзеляжа - на 2 см от борта (щель отсоса пограничного слоя), к 5,0 уходит в фюзеляж; наружу - до 0,93, назад сходится к 0,90."""
    xin = (INL_WAIST + 0.022) * (1 - smooth_(4.75, 5.40, a)) + 0.28 * smooth_(4.75, 5.40, a)
    xout = INL_XO - (INL_XO - 0.92) * smooth_(5.9, 7.6, a); z0 = INL_Z0 + 0.02 * smooth_(6.4, 7.6, a); z1 = INL_Z1 - 0.04 * smooth_(6.4, 7.6, a)                       # Mark: обтекатель заборника на уровне кабины до самого крыла, крыло выходит из его борта
    return xin, xout, z0, z1


def inl_ring(a, sx, dr=0.0, n=64):
    xin, xout, z0, z1 = inl_dims(a); lip = 0.0
    e = -dr + lip
    w = smooth_(4.30, 5.40, a) if dr == 0 else 0.0; lift = 0.22 * smooth_(4.30, 6.00, a) if dr == 0 else 0.0   # за губой верх обтекателя поднимается выпукло и уходит в борт; канал не трогаем
    return dshape(a, sx, xin + (e if dr != 0 else lip * 0.5), xout - e, z0 + e, z1 - e, max(0.03, 0.11 - e), max(0.10, 0.42 - e), n, lift, w)      # Mark: углы скруглены сильнее


def lip_a(z):
    zc = (INL_Z0 + INL_Z1) / 2; ht = (INL_Z1 - INL_Z0) / 2; return INL_A0 + INL_RAKE * min(1.0, abs(z - zc) / ht) ** 2.2


def rake_cut(sx, back=0.0):
    """Срез губы серпом: всё, что впереди линии lip_a(z) (+ back), убирается."""
    zs = [INL_Z0 - 0.15 + (INL_Z1 - INL_Z0 + 0.30) * i / 160 for i in range(161)]
    prof = [(lip_a(min(max(z, INL_Z0), INL_Z1)) + back, z) for z in zs] + [(2.5, INL_Z1 + 0.15), (2.5, INL_Z0 - 0.15)]
    sec = lambda xx: [P3(a, sx * xx, z) for a, z in prof]
    b = B(); b.loft([sec(0.30), sec(1.40)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); return outward(b.finish('c_rake', sharp_deg=20))     # срез - обшивка губы


def intake_body(sx):
    st = stations(INL_A0 - 0.02, INL_A0 + 0.40, 0.02) + stations(INL_A0 + 0.45, 7.8, 0.2)                    # у губы часто: срез серпом идёт наискось через сечения
    ob = loft_obj('s_inl_' + ('r' if sx > 0 else 'l'), [inl_ring(a, sx, 0.0, 128) for a in st], sharp=50)
    c = rake_cut(sx); _apply_bool(ob, c, 'DIFFERENCE'); _drop(c)
    return ob


def intake_cut(sx):
    """Канал заборника: губа 4 см, внутрь до 6,0 сужается и темнеет."""
    prof = [(INL_A0 - 0.05, -0.035, G_SKIN), (INL_A0 + 0.30, -0.035, G_SKIN), (INL_A0 + 0.45, -0.045, G_DUCT), (5.2, -0.07, G_DUCT), (5.9, -0.10, G_DARK), (6.0, -0.30, G_DARK)]
    b = B(); b.loft([inl_ring(a, sx, dr, 128) for a, dr, _ in prof], [m for _, _, m in prof[1:]], cap0=G_SKIN, cap1=G_DARK)
    return b.finish('c_inl', sharp_deg=30)


# ── горб отсека подъёмных двигателей за кабиной (фото 04: 4,5…8,4, верх 2,62); сверху створка-жалюзи, снизу две створки ──
def hump_ring(a, n=64):
    top = fus_top(a) + (2.465 - fus_top(a)) * smooth_(4.35, 4.95, a) * (1 - smooth_(7.95, 8.55, a)) + 0.001        # Mark: горб заметно ниже (было 2,625); чертёж 09 - почти вровень со спиной
    hw = 0.62 * (0.55 + 0.45 * smooth_(4.35, 4.95, a)) * (1 - 0.7 * smooth_(8.1, 8.6, a))           # Mark: без ложбины - бока горба ложатся на плечо заборника
    return sup(a, 0.0, top, fus_top(a, hw) - 0.30, hw, 3.4, 1.7, n)


def hump():
    return loft_obj('s_hump', [hump_ring(a) for a in stations(4.30, 8.62, 0.08)], sharp=50)


LD = dict(a0=5.00, a1=6.62, hw=0.420)                             # верхняя створка подъёмных двигателей (план 01: 4,93…6,67)
LD_OPEN = 72.0
LB = dict(a0=5.05, a1=6.85, hw=0.460)                             # нижние створки
LB_OPEN = 50.0                                                    # 70 задевал низ заборника после того, как Mark поднял его на 0,94


def lift_top_cut():
    w = LD['hw'] + 0.006; rg = lambda a: [P3(a, -w, 2.20), P3(a, w, 2.20), P3(a, w, 3.2), P3(a, -w, 3.2)]
    return loft_obj('c_ld', [rg(LD['a0'] - 0.006), rg(LD['a1'] + 0.006)], G_COCK, sharp=25)


def lift_top_door():
    ob = patch('lift_door', lambda u, v: (LD['a0'] + (LD['a1'] - LD['a0']) * v, -LD['hw'] + 2 * LD['hw'] * u), 10, 14, dirn=-1, lift=0.0, th=0.016, z0=4.0)
    zh = down(0.0, Yb(LD['a1']), z0=4.0, dirn=-1).z; pivot = P3(LD['a1'], 0.0, zh); _rel(ob, pivot)
    PARTS['lift_door'] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(0.0, LD_OPEN), note='верхняя створка подъёмных двигателей: петля у задней кромки поперёк; плюс - передняя кромка вверх (фото 02, 06); в полёте и в ангаре закрыта')
    return ob


def louvres():
    """Жалюзи под верхней створкой: поперечные лопатки, наклон назад (фото 06)."""
    b = B()
    for i in range(12):
        a = LD['a0'] + 0.10 + i * (LD['a1'] - LD['a0'] - 0.2) / 11
        b.loft([[P3(a + da, x, 2.24 + dz) for da, dz in ((-0.05, -0.02), (0.05, 0.10), (0.06, 0.10), (-0.04, -0.02))] for x in (-LD['hw'] + 0.01, LD['hw'] - 0.01)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    for x in (-0.14, 0.14): box(b, P3((LD['a0'] + LD['a1']) / 2, x, 2.27), 0.02, (LD['a1'] - LD['a0']) / 2 - 0.05, 0.06, G_METAL)
    box(b, P3((LD['a0'] + LD['a1']) / 2, 0.0, 1.80), LD['hw'], (LD['a1'] - LD['a0']) / 2, 0.02, G_DARK)    # дно: двигатели в темноте
    return b.finish('det_louvre', sharp_deg=30)


def lift_bot_cut():
    w = LB['hw'] + 0.016; rg = lambda a: [P3(a, -w, -0.5), P3(a, w, -0.5), P3(a, w, 1.15), P3(a, -w, 1.15)]
    return loft_obj('c_lb', [rg(LB['a0'] - 0.006), rg(LB['a1'] + 0.006)], G_COCK, sharp=25)


def lift_bot_doors():
    out = []; a0, a1, hw = LB['a0'] + 0.008, LB['a1'] - 0.008, LB['hw'] - 0.004
    for sx, s_ in ((1, 'r'), (-1, 'l')):
        n_ = 'lift_bot_' + s_
        ob = patch(n_, lambda u, v: (a0 + (a1 - a0) * v, sx * (0.004 + (hw - 0.004) * u)), 6, 14, dirn=1, lift=0.0, th=0.014, z0=-2.0)
        zh = down(sx * hw, Yb((a0 + a1) / 2), z0=-2.0, dirn=1).z - 0.011; pivot = P3((a0 + a1) / 2, sx * hw, zh); _rel(ob, pivot)       # петля по наружной обшивке
        PARTS[n_] = dict(pivot=pivot.copy(), axis=Vector((0, -sx, 0)), range=(0.0, LB_OPEN), note='нижняя створка подъёмных двигателей: петля по наружной кромке; плюс - внутренняя кромка вниз-наружу')
        out.append(ob)
    return out


# ── фонарь: козырёк 2,48…2,95, откидная часть до 3,95 (фото 04), за ней обтекатель к горбу; ширина по плану 01 ──
CANOPY = [(2.42, 1.980, 0.30), (2.62, 2.160, 0.40), (2.85, 2.310, 0.44), (3.10, 2.400, 0.45), (3.45, 2.440, 0.45), (3.80, 2.430, 0.44), (4.10, 2.400, 0.42),
          (4.45, 2.420, 0.40), (4.80, 2.500, 0.36)]
CAN_T = tracks(CANOPY)
ARCH_A, CAN_A1 = 2.95, 3.95
CAN_OPEN = 95.0
def SILL(a): return fus_top(a, CAN_T[1](a) - 0.035) + 0.008                  # порог по внутренней кромке выреза: на крутом борту рельс не уходит в обшивку


def can_ring(a, inset=0.0, n=44):
    top, hw = CAN_T[0](a) - inset, CAN_T[1](a) - inset; y0 = SILL(a) - 0.003
    return [P3(a, math.copysign(abs(math.cos(math.pi * k / (n - 1))) ** 0.62, math.cos(math.pi * k / (n - 1))) * hw, y0 + (top - y0) * max(0.0, math.sin(math.pi * k / (n - 1))) ** 0.75) for k in range(n)]


def can_fair():
    """Обтекатель за фонарём: от задней рамы к горбу."""
    def rg(a, n=40):
        top, hw = CAN_T[0](a), CAN_T[1](a); z0 = fus_top(a, hw) - 0.10
        return [P3(a, hw * math.copysign(abs(math.cos(t)) ** 0.62, math.cos(t)), z0 + (top - z0) * max(0.0, math.sin(t)) ** 0.75) for t in (math.pi * k / (n - 1) for k in range(n))] + [P3(a, -hw * 0.9, z0 - 0.2), P3(a, hw * 0.9, z0 - 0.2)]
    return loft_obj('s_cfair', [rg(a) for a in [CAN_A1 + 0.004] + stations(4.0, 4.85, 0.08)], sharp=50)


def coaming():
    """Порог фонаря на обшивке: от борта до низа рам, чтобы под фонарём не было щели (порог по внутренней кромке выреза выше обшивки у края)."""
    out = []
    for sg in (1, -1):
        rings = []
        for a in stations(ARCH_A - 0.47, CAN_A1 + 0.02, 0.05):
            hw = CAN_T[1](a); zt = SILL(a) - 0.005; zl = fus_top(a, hw + 0.04) - 0.05
            rings.append([P3(a, sg * (hw - 0.03), zl), P3(a, sg * (hw + 0.035), zl), P3(a, sg * (hw + 0.035), zt), P3(a, sg * (hw - 0.03), zt)])
        out.append(outward(loft_obj('s_coam', rings, sharp=30)))
    return out


def cock_cut():
    def sec(a): hw = CAN_T[1](a) - 0.03; return [P3(a, -hw, fus_top(a) - 0.95), P3(a, hw, fus_top(a) - 0.95), P3(a, hw, 3.2), P3(a, -hw, 3.2)]
    return loft_obj('c_cock', [sec(a) for a in stations(2.55, CAN_A1 - 0.03, 0.07)], G_COCK, sharp=25)


def frame_arch(b, a, w, inset=0.008, h=0.022, n=44):
    ri0 = can_ring(a - w, inset, n); ro0 = can_ring(a - w, -h, n); ro1 = can_ring(a + w, -h, n); ri1 = can_ring(a + w, inset, n)
    strip(b, [ri0, ro0, ro1, ri1, ri0], G_SKIN)


def canopy():
    """Откидная часть фонаря: стекло, передняя и задняя рамы, рельсы; петля по правому порогу - открывается вправо-вверх."""
    a0 = ARCH_A + 0.008; a1 = CAN_A1; st = stations(a0 + 0.004, a1, 0.06); am = (a0 + a1) / 2
    pivot = P3(am, CAN_T[1](am) + 0.09, SILL(am) + 0.050)
    b = B(); strip(b, [can_ring(a) for a in st], G_GLASS); gl = b.finish('canopy_glass', sharp_deg=60)
    b = B(); frame_arch(b, a0 + 0.030, 0.030); frame_arch(b, 3.45, 0.012, h=0.016); frame_arch(b, a1 - 0.035, 0.035, h=0.026)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        b.loft([[rail(a, 0.004, 0.003), rail(a, 0.020, 0.003), rail(a, 0.020, 0.040), rail(a, -0.012, 0.050), rail(a, -0.012, 0.020)] for a in stations(a0, a1, 0.07)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    fr = b.finish('canopy', sharp_deg=45)
    for o in (fr, gl):
        for v in o.data.vertices: v.co -= pivot
    fr.location = pivot; gl.parent = fr; gl.location = (0, 0, 0)
    PARTS['canopy'] = dict(pivot=pivot.copy(), axis=Vector((0, 1, 0)), range=(0.0, CAN_OPEN), note='откидная часть фонаря: петля по правому порогу; плюс - фонарь вправо-вверх; canopy_glass - дочерний')
    return [fr, gl]


def windscreen():
    a1 = ARCH_A - 0.02; st = stations(2.46, a1, 0.05)
    b = B(); strip(b, [can_ring(a) for a in st], G_GLASS); gl = b.finish('screen_glass', sharp_deg=60)
    b2 = B(); frame_arch(b2, ARCH_A - 0.030, 0.030, h=0.026); frame_arch(b2, 2.48, 0.022, h=0.014)
    for sg in (1, -1):
        rail = lambda a, d, h: P3(a, sg * (CAN_T[1](a) + d), SILL(a) + h)
        b2.loft([[rail(a, 0.004, -0.010), rail(a, 0.018, -0.010), rail(a, 0.018, 0.030), rail(a, -0.010, 0.040), rail(a, -0.010, 0.016)] for a in stations(2.48, a1, 0.05)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
        k_ = int(43 * (0.3 if sg > 0 else 0.7)); pts = [can_ring(a, -0.010)[k_] for a in stations(2.48, a1, 0.05)]
        for p0, p1 in zip(pts, pts[1:]): strut(b2, p0, p1, 0.012, G_SKIN, 8)
    return [gl, b2.finish('screen_frame', sharp_deg=45)]


# ── ПВД: полосатая штанга из носка (фото 02, 07) ──
def pitot():
    b = B(); n = 14; z0 = FT[0](0.0)
    prof = [(0.25, 0.050), (0.0, 0.040), (-0.25, 0.026), (-0.95, 0.020), (-0.97, 0.026), (-1.06, 0.026), (-1.10, 0.010), (-1.22, 0.008), (-1.24, 0.003)]
    b.loft([_circ(a, 0.0, z0 + 0.01 - 0.02 * a, r, n) for a, r in prof], G_METAL, cap0=G_METAL, cap1=G_METAL)
    for k in range(3):                                                  # лопатки датчиков у конца
        a = -0.70 + 0.01 * k
    return b.finish('det_pitot', sharp_deg=35)


# ── крыло: высоко, стреловидность 46° по передней кромке, V -12° (спереди 01), консоль складывается вверх на 2,07 м от оси ──
WX0 = 0.45                                                          # корневое сечение глубоко внутри борта: фюзеляж круглый (В-В на 09), на высоте крыла борт на 0,75 - иначе корень висит над плечом (Mark)
WROOT_X = 0.91; WZ0 = 1.900; ANH = math.tan(math.radians(12.0))
def wz(x): return WZ0 - ANH * max(0.0, x - WROOT_X) + 0.0 * x
XTIP = 3.290; FOLD_X = 2.070
def LE_(x): return 7.69 + 1.0336 * (x - WROOT_X)
def TE_(x): return 11.02 + 0.1218 * (x - WROOT_X)
def CH_(x): return TE_(x) - LE_(x)
_TC = Lin([(0.0, 0.065), (WROOT_X, 0.062), (XTIP, 0.050)])
def TC(x): return _TC(x)
FLAP = (WROOT_X + 0.09, FOLD_X - 0.06); AIL = (FOLD_X + 0.10, XTIP - 0.22)
def _h0(x): return LE_(x) + 0.75 * CH_(x)
def HINGE(x):
    for sp in (FLAP, AIL):
        if sp[0] - 0.01 <= x <= sp[1] + 0.01:
            t_ = (x - sp[0]) / (sp[1] - sp[0]); return _h0(sp[0]) + (_h0(sp[1]) - _h0(sp[0])) * t_
    return _h0(x)


def cove_cut_k(a_le, chord, tc, a_h, clr=0.008, ka=1.0):
    K = tb.COVE_K; uh = (a_h - a_le) / chord; t = tc * chord * thk(uh); R = (t + clr) / math.cos(math.pi / (2 * (K + 1))); lo, hi = 0.0, R * ka
    for _ in range(40):
        d_ = (lo + hi) / 2
        if math.hypot(d_ / ka, tc * chord * thk((a_h - d_ - a_le) / chord)) < R: lo = d_
        else: hi = d_
    a_e = a_h - hi; te = tc * chord * thk((a_e - a_le) / chord); xe = (a_e - a_h) / ka; rc = math.hypot(xe, te); al = math.atan2(te, xe)
    return (a_e - a_le) / chord, [(a_h + ka * rc * math.cos(al + (2 * math.pi - 2 * al) * (i + 1) / (K + 1)), rc * math.sin(al + (2 * math.pi - 2 * al) * (i + 1) / (K + 1))) for i in range(K)]


def cove_nose_k(a_le, chord, tc, a_h, ka=1.0):
    K = tb.COVE_K; t = tc * chord * thk((a_h - a_le) / chord)
    return [(a_h - ka * t * math.sin(math.pi * (i + 1) / (K + 1)), -t * math.cos(math.pi * (i + 1) / (K + 1))) for i in range(K)]


def _ka(sp):
    s = (_h0(sp[1]) - _h0(sp[0])) / (sp[1] - sp[0]); return math.sqrt(1 + s * s)


def wpl(sx, x): return lambda a, h: P3(a, sx * x, wz(x) + h)


def _wsec(sx, x):
    c = CH_(x); tc = TC(x); le = LE_(x); u0 = 0.0008; head = cove_wall_f(le, c, tc, u0)
    sp = next((s for s in (FLAP, AIL) if _in(x, s)), None)
    if sp: ue, tail = cove_cut_k(le, c, tc, HINGE(x), 0.010, _ka(sp))
    else: ue = 1.0; tail = cove_wall(le, c, tc, 1.0)
    return foil_ring(le, c, tc, u0, ue, 24, wpl(sx, x), tail=tail, head=head)


FOLD_GAP = 0.006


def wing_xs(x0, x1):
    k = [x0, x1] + [x0 + (x1 - x0) * i / 14 for i in range(1, 14)]
    for sp in (FLAP, AIL):
        if x0 < sp[0] < x1: k += [sp[0] - 0.003, sp[0]]
        if x0 < sp[1] < x1: k += [sp[1], sp[1] + 0.003]
    return sorted(set(round(v, 4) for v in k if x0 <= v <= x1))


def wing_in(sx):
    """Внутренняя часть консоли: от корня внутри борта до шарнира складывания."""
    return loft_obj('s_wing_' + ('r' if sx > 0 else 'l'), [_wsec(sx, x) for x in wing_xs(WX0, FOLD_X - FOLD_GAP / 2)], sharp=48)


WF_R = (0.30, 0.15)                                                  # зализы корня крыла (фото 02, 08): снизу и сверху, радиус вогнутости, м
def wing_fillet(sx, up=False):
    """Зализ корня: вогнутая полка между обшивкой крыла и бортом (Mark: крыло лежало на круглом плече и висело).
    Сечение поперёк потока: точка на борту ниже (выше) крыла - дуга Безье через угол стыка - точка на обшивке крыла; к закрылку не заходит."""
    hh = HINGE(FLAP[0]); out = []; sg = 1.0 if up else -1.0; R0 = WF_R[1] if up else WF_R[0]
    def zs(a, x):
        c = CH_(x); u = min(max((a - LE_(x)) / c, 0.0), 1.0); return wz(x) + sg * TC(x) * c * thk(u)
    def xj(a):
        lo, hi = 0.30, 1.10
        for _ in range(40):
            m = (lo + hi) / 2
            if fus_hw(a, zs(a, m)) > m: lo = m
            else: hi = m
        return lo
    a0 = LE_(0.80) + 0.02 if not up else 8.80; a1 = hh - 0.05                       # сверху - за горбом подъёмных двигателей (кончается на 8,6)
    for a in stations(a0, a1, 0.05):
        x0 = xj(a); z0 = zs(a, x0)
        R = R0 * smooth_(a0, a0 + 0.70, a) * (1 - smooth_(a1 - 0.90, a1, a)) + 0.006
        lf = x0 + R * 1.35; w_ = smooth_(hh - 1.5, hh - 0.75, a); lim = lf * (1 - w_) + min(lf, FLAP[0] - 0.03) * w_; R = max(0.006, (lim - x0) / 1.35)   # к закрылку радиус сходит на нет плавно, а не обрезается стенкой
        zf = z0 + sg * R; xf = fus_hw(a, zf) - 0.004; xw = x0 + R * 1.35; zw = zs(a, xw) - sg * 0.004
        bez = [((1 - t) ** 2 * xf + 2 * t * (1 - t) * x0 + t * t * xw, (1 - t) ** 2 * zf + 2 * t * (1 - t) * z0 + t * t * zw) for t in [i / 12 for i in range(13)]]
        ring = [(xf - 0.12, zf + sg * 0.02)] + bez + [(xw, zw - sg * 0.02), (x0 - 0.12, z0 - sg * 0.03)]
        out.append([P3(a, sx * x, z) for x, z in ring])
    if (sx < 0) != up: out = [list(reversed(r)) for r in out]
    return outward(loft_obj('s_wfil_' + ('u' if up else 'd') + ('r' if sx > 0 else 'l'), out, sharp=60))


def wing_out(sx):
    """Внешняя складная часть: от шарнира до законцовки; ось складывания - вдоль хорды по верхней обшивке у шарнира."""
    xs = wing_xs(FOLD_X + FOLD_GAP / 2, XTIP - 0.004)
    rings = [_wsec(sx, x) for x in xs]
    tipc = sum(rings[-1], Vector()) / len(rings[-1]); rings.append([tipc + (p - tipc) * 0.05 for p in _wsec(sx, XTIP - 0.002)])
    ob = loft_obj('wing_o_' + ('r' if sx > 0 else 'l'), rings, sharp=48)
    tp = tip_rcs(sx); _apply_bool(ob, tp, 'UNION'); _drop(tp)                                   # законцовка со струйным рулём - на складной консоли
    x = FOLD_X; zt = wz(x) + TC(x) * CH_(x) * thk(0.30) + 0.010; pa = P3(LE_(x) + 0.05, sx * x, zt); pb = P3(TE_(x) - 0.15, sx * x, zt)       # ось над наибольшей толщиной: выпуклая обшивка между точками не заходит выше оси
    pivot = (pa + pb) / 2; axis = (pb - pa).normalized()
    if sx < 0: axis = -axis
    _rel(ob, pivot)
    PARTS[ob.name] = dict(pivot=pivot.copy(), axis=axis, range=(0.0, 100.0), note='складывание консоли вверх (на корабле); ось по верхней обшивке у шарнира на 2,07 м от оси; плюс - конец консоли вверх-внутрь; в игре не складывать; элерон ail_* - дочерний')
    return ob


def wing_part(name, spec, sx, HG, note, rng, e0=0.012, e1=0.012):
    x0, x1 = spec; x0 += e0; x1 -= e1
    pv0 = P3(HG(x0), sx * x0, wz(x0)); pv1 = P3(HG(x1), sx * x1, wz(x1)); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    if axis.x < 0: axis = -axis
    rings = []
    xs = [x0, x0 + 0.010, x0 + 0.025, x0 + 0.05] + [x0 + 0.05 + (x1 - x0 - 0.1) * i / 8 for i in range(1, 8)] + [x1 - 0.05, x1 - 0.025, x1 - 0.010, x1]
    for x in xs:
        c = CH_(x); ah = HG(x); le = LE_(x); tc = TC(x); hp = P3(ah, sx * x, wz(x))
        d_ = min(x - x0, x1 - x); k = 0.25 + 0.75 * min(1.0, d_ / 0.05) ** 0.6
        ring = foil_ring(le, c, tc, (ah - le) / c, 1.0, 12, wpl(sx, x), head=cove_nose_k(le, c, tc, ah, _ka(spec)))
        zc = wz(x); ring = [Vector((hp.x + (v.x - hp.x) * (k if v.y > hp.y else 1.0), hp.y + (v.y - hp.y) * (k if v.y > hp.y else 1.0), zc + (v.z - zc) * k)) for v in ring]
        rings.append([v - pivot for v in ring])
    ob = loft_obj(name, rings, sharp=48); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=rng, note=note)
    return ob


def tip_rcs(sx):
    """Законцовка со струйным рулём (выступ на конце крыла, 01, 06): обтекатель с соплом вниз."""
    x = sx * (XTIP + 0.02); a0 = LE_(XTIP) - 0.10; a1 = TE_(XTIP) + 0.18; z = wz(XTIP); b = B(); rings = []
    for a in stations(a0, a1, 0.05):
        t = (a - a0) / (a1 - a0); r = 0.075 * max(0.05, math.sin(math.pi * min(1.0, t * 1.6 if t < 0.3 else 0.48 + (t - 0.3) / 1.35))) ** 0.6
        rings.append(_circ(a, x, z, r, 20))
    b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('s_tip_' + ('r' if sx > 0 else 'l'), sharp_deg=50)


# ── стабилизатор: цельноповоротный, на боках хвоста (план 01: корень 13,9…15,9, конец 15,1…15,7 на 1,55 м; фото 04: на высоте 1,93) ──
ST_Z = 1.930; ST_X0 = 0.800; ST_XT = 1.550; ST_TC = 0.050
def st_le(x): return 13.93 + (x - 0.50) * (15.09 - 13.93) / (ST_XT - 0.50)
def st_te(x): return 15.87 + (x - 0.50) * (15.72 - 15.87) / (ST_XT - 0.50)
ST_PIV = 15.00


def stab(sx):
    name = 'stab_' + ('r' if sx > 0 else 'l'); rings = []; X_IN = 0.15                          # корень заходит в фюзеляж и обрезается по борту с зазором (Mark: стабилизатор висел в воздухе)
    for x in [X_IN, X_IN + 0.10, X_IN + 0.25, ST_X0 - 0.15, ST_X0] + [ST_X0 + (ST_XT - ST_X0) * i / 8 for i in range(1, 8)] + [ST_XT - 0.03, ST_XT - 0.008]:
        le = st_le(x) + 0.08 * (max(0.0, x - (ST_XT - 0.12)) / 0.12) ** 2; te = st_te(x); c = te - le
        rings.append(foil_ring(le, c, ST_TC, 0.0008, 1.0, 16, lambda a, h, x=x: P3(a, sx * x, ST_Z + h), tail=cove_wall(le, c, ST_TC, 1.0), head=cove_wall_f(le, c, ST_TC, 0.0008)))
    ob = loft_obj(name, rings, sharp=48)
    g_ = 0.012; cut = loft_obj('c_stgap', [sup(a, 0.0, FT[0](a) + g_, FT[1](a) - g_, FT[2](a) + g_, FT[3](a), FT[4](a), 96) for a in stations(13.0, FUS_END, 0.03)], sharp=60)
    _apply_bool(ob, cut, 'DIFFERENCE'); _drop(cut)                                            # корень повторяет обвод хвоста в 12 мм от обшивки
    pivot = P3(ST_PIV, sx * ST_X0, ST_Z); _rel(ob, pivot)
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((1, 0, 0)), range=(-20.0, 12.0), note='цельноповоротный стабилизатор: поворот вокруг поперечной оси через корень; плюс - передняя кромка вверх')
    return ob


def stab_fair(sx):
    """Обтекатель корня стабилизатора: плоская наружная грань на x = 0,68."""
    x1 = ST_X0 - 0.020; rings = []
    for a in stations(13.4, 16.05, 0.10):
        f = smooth_(13.4, 14.0, a) * (1 - smooth_(15.9, 16.05, a)); hw = 0.04 + 0.26 * f; hz = 0.05 + 0.13 * f
        xc = sx * (x1 - hw - (1 - f) * 0.20)
        rings.append(sup(a, xc, ST_Z + hz, ST_Z - hz, hw, 3.2, 3.2, 36))
    return loft_obj('s_stfair_' + ('r' if sx > 0 else 'l'), rings, sharp=40)


# ── киль со спинным гребнем (фото 04: передняя кромка 12,9 → 14,8 на высоте 3,82; задняя 15,4 → 16,1) ──
FIN_Z0, FIN_Z1 = 1.90, 3.820
def _fle(z):
    if z >= 2.45: return 12.94 + (14.80 - 12.94) * (z - 2.45) / (FIN_Z1 - 2.45)
    return 12.94 - (2.45 - z) * 3.0                                  # гребень вперёд по спине
def _fte0(z): return 15.40 + (16.10 - 15.40) * (z - 2.30) / (FIN_Z1 - 2.30)
FIN_TC = 0.055
RUD = (2.55, FIN_Z1)
def RUD_H(z): c = _fte0(z) - _fle(z); return _fle(z) + 0.70 * c
RUD_KA = math.sqrt(1 + ((RUD_H(3.7) - RUD_H(RUD[0])) / (3.7 - RUD[0])) ** 2)
def _fte(z): return _fte0(z)                                      # Mark: задняя кромка киля доведена до фюзеляжа (под рулём неподвижная часть во всю хорду)


def fin():
    zs = [FIN_Z0, 2.05, 2.2, 2.3, 2.38, 2.45, 2.5, RUD[0] - 0.004, RUD[0]] + [RUD[0] + (3.70 - RUD[0]) * i / 8 for i in range(1, 9)] + [3.74, 3.77, 3.795, 3.81, FIN_Z1 - 0.002]
    rings = []
    for z in zs:
        le = _fle(z); te = _fte(z); c = te - le; tc = min(FIN_TC * (1 + 0.5 * smooth_(2.5, 2.0, z)), 0.16 / c)
        if _in(z, RUD): ue, tail = cove_cut_k(le, c, tc, RUD_H(z), 0.010, RUD_KA)
        else: ue, tail = 1.0, cove_wall(le, c, tc, 1.0)
        if z < RUD[0]: tc = min(tc, 0.16 / (_fte0(z) - le))
        top = max(0.0, z - 3.74) / 0.08
        rings.append(foil_ring(le, c, tc * (1 - 0.6 * min(1.0, top) ** 2), 0.0008, ue, 20, lambda a, h: P3(a, h, z), tail=tail, head=cove_wall_f(le, c, tc, 0.0008)))
    return outward(loft_obj('s_fin', rings, sharp=48))


def rudder():
    z0, z1 = RUD[0] + 0.012, FIN_Z1 - 0.002; pv0 = P3(RUD_H(z0), 0.0, z0); pv1 = P3(RUD_H(3.7), 0.0, 3.7); axis = (pv1 - pv0).normalized(); pivot = pv0.lerp(pv1, 0.5); rings = []
    zs = [z0, z0 + 0.010, z0 + 0.025, z0 + 0.05] + [z0 + 0.05 + (3.70 - z0 - 0.05) * i / 8 for i in range(1, 9)] + [3.74, 3.77, 3.795, 3.81, z1]
    for z in zs:
        le = _fle(z); c = _fte(z) - le; tc = min(FIN_TC, 0.16 / c); top = max(0.0, z - 3.74) / 0.08; tc = tc * (1 - 0.6 * min(1.0, top) ** 2)
        hp = P3(RUD_H(z), 0.0, z); k = 0.25 + 0.75 * min(1.0, (z - z0) / 0.05) ** 0.6
        ring = foil_ring(le, c, tc, (RUD_H(z) - le) / c, 1.0, 12, lambda a, h: P3(a, h, z), head=cove_nose_k(le, c, tc, RUD_H(z), RUD_KA))
        ring = [Vector((hp.x + (v.x - hp.x) * k, hp.y + (v.y - hp.y) * (k if v.y > hp.y else 1.0), v.z)) for v in ring]
        rings.append([v - pivot for v in ring])
    ob = outward(loft_obj('rudder', rings, sharp=48)); ob.location = pivot
    PARTS['rudder'] = dict(pivot=pivot.copy(), axis=axis, range=(-20.0, 20.0), note='руль направления; ось по линии навески (наклонена назад); плюс - задняя кромка вправо')
    return ob


def tail_rcs():
    """Хвостовой струйный руль: короткий насадок на конце фюзеляжа, сопла вниз и вверх (01: выступ на хвосте)."""
    b = B(); z = (FT[0](16.0) + FT[1](16.0)) / 2
    b.loft([_circ(a, 0.0, z, r, 16) for a, r in ((16.00, 0.075), (16.10, 0.080), (16.32, 0.070), (16.40, 0.050), (16.42, 0.010))], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('det_tailrcs', sharp_deg=35)


# ── поворотные сопла маршевого двигателя по бокам под крылом (низ 01, фото 08): ось поворота поперёк ──
NOZ = dict(a=11.35, x=1.040, z=1.100, rh=0.290, ln=0.60, re=0.240)
NOZ_RANGE = (0.0, 90.0)


def nozzle(sx):
    """Колено: втулка по оси поворота (вдоль x) и труба назад; поворачивается целиком вокруг оси втулки."""
    N = NOZ; b = B(); c = P3(N['a'], sx * N['x'], N['z']); n = 40
    def ringx(xx, r): return [P3(N['a'] + r * math.sin(2 * math.pi * k / n), sx * xx, N['z'] - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
    b.loft([ringx(0.752, N['rh'] - 0.02), ringx(0.765, N['rh']), ringx(1.30, N['rh']), ringx(1.33, N['rh'] - 0.03)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)        # втулка
    prof = [(N['a'] - 0.05, N['rh'] - 0.01), (N['a'] + 0.15, N['rh'] - 0.01), (N['a'] + 0.40, N['rh'] - 0.04), (N['a'] + N['ln'] - 0.03, N['re'] + 0.012), (N['a'] + N['ln'], N['re'] + 0.006)]
    b.loft([_circ(a, sx * N['x'], N['z'], r, n) for a, r in prof], G_SKIN, cap0=G_SKIN)
    b.loft([_circ(a, sx * N['x'], N['z'], r, n) for a, r in ((N['a'] + N['ln'], N['re'] + 0.006), (N['a'] + N['ln'], N['re'] - 0.004), (N['a'] + 0.30, N['re'] - 0.02), (N['a'] + 0.25, 0.10))], G_DARK, cap1=G_DARK)
    ob = b.finish('nozzle_' + ('r' if sx > 0 else 'l'), sharp_deg=40)
    _rel(ob, c)
    PARTS[ob.name] = dict(pivot=c.copy(), axis=Vector((1, 0, 0)), range=NOZ_RANGE, note='поворотное сопло: ось поперёк через втулку; 0 - назад, плюс - срез вниз (90 - вертикально вниз, взлёт и посадка)')
    return ob


def noz_well(sx):
    """Ниша сопла в борту: объём, который заметает колено от 0 до 90 градусов, с зазором."""
    N = NOZ; R = N['ln'] + 0.04; b = B(); n = 24
    rh = N['rh'] + 0.035; R = math.hypot(N['ln'], N['rh']) + 0.05
    pts = [(R * math.cos(math.radians(-d)), R * math.sin(math.radians(-d))) for d in range(-52, 122, 4)] + [(rh * math.cos(math.radians(-d)), rh * math.sin(math.radians(-d))) for d in range(126, 306, 12)]
    sec = lambda xx: [P3(N['a'] + p[0], sx * xx, N['z'] + p[1]) for p in pts]
    b.loft([sec(0.62), sec(1.60)], G_COCK, cap0=G_COCK, cap1=G_COCK); ob = outward(b.finish('c_nozwell', sharp_deg=20))
    return ob


# ── пилоны под крылом: по два на консоль у шарнира и ближе к корню (01 спереди: 1,33 и 1,91 м) ──
PYL = (1.330, 1.910)
PYL_H = 0.170


def pylons():
    b = B()
    for sx in (1, -1):
        for x in PYL:
            le = LE_(x); c = CH_(x); a0 = le + 0.28 * c; a1 = le + 0.68 * c; z0 = wz(x) - TC(x) * c * thk(0.5) + 0.02
            rings = []
            for a in stations(a0, a1, 0.05):
                t = (a - a0) / (a1 - a0); w = 0.030 * max(0.15, math.sin(math.pi * t)) ** 0.5; bz = z0 - PYL_H * min(1.0, t * 6, (1 - t) * 6)
                rings.append([P3(a, sx * x - w, z0), P3(a, sx * x + w, z0), P3(a, sx * x + w, bz), P3(a, sx * x - w, bz)])
            b.loft(rings, G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    return b.finish('s_pylons', sharp_deg=40)


def station_pts():
    """Точки подвески: низ пилона по середине (игра вешает ось бомбы на vis.r + 5 см ниже)."""
    out = []
    for x in PYL:
        le = LE_(x); c = CH_(x); z0 = wz(x) - TC(x) * c * thk(0.5) + 0.02 - PYL_H
        out.append((le + 0.48 * c, -x, z0))
    return out


def gear_bay_cuts():
    """Ниши стоек под закрытыми створками (видны в ангаре, когда створки спрятаны)."""
    import yak_gear as gr
    N, M_ = gr.NBAY, gr.MBAY; out = []
    rg = lambda a: [P3(a, -N['hw'] - 0.006, -1.0), P3(a, N['hw'] + 0.006, -1.0), P3(a, N['hw'] + 0.006, 1.10), P3(a, -N['hw'] - 0.006, 1.10)]
    out.append(loft_obj('c_nbay', [rg(N['a0'] - 0.006), rg(N['a1'] + 0.006)], G_COCK, sharp=25))
    for sx in (1, -1):
        rg = lambda a: [P3(a, sx * (M_['x0'] - 0.006), -1.0), P3(a, sx * (M_['x1'] + 0.006), -1.0), P3(a, sx * (M_['x1'] + 0.006), 1.30), P3(a, sx * (M_['x0'] - 0.006), 1.30)]
        out.append(outward(loft_obj('c_mbay', [rg(M_['a0'] - 0.006), rg(M_['a1'] + 0.006)], G_COCK, sharp=25)))
    return out


# ── сборка ──
def build_skin():
    S = [_tag(hull(), 1), _tag(hump(), 2), _tag(can_fair(), 2), _tag(fin(), 4), _tag(pylons(), 6)] + [_tag(c, 2) for c in coaming()]
    for sx in (1, -1): S += [_tag(intake_body(sx), 3)]
    W = [_tag(wing_in(1), 9), _tag(wing_in(-1), 9), _tag(wing_fillet(1), 9), _tag(wing_fillet(-1), 9), _tag(wing_fillet(1, True), 9), _tag(wing_fillet(-1, True), 9)]
    host = S[0]
    for o in S[1:] + W:
        _apply_bool(host, o, 'UNION'); _drop(o)
    print('скруглено у крыла:', fillet_seam(host, pairs=((1, 9),), band=0.10, iters=8))
    print('скруглено у заборников:', fillet_seam(host, pairs=((1, 3), (3, 9)), band=0.08, iters=6))
    print('скруглено горб-заборник:', fillet_seam(host, pairs=((2, 3),), band=0.22, iters=18, wfun=lambda a: smooth_(4.70, 5.30, a) * (1 - smooth_(7.20, 7.70, a))))
    print('скруглено плечо заборника:', fillet_seam(host, pairs=((1, 3),), band=0.32, iters=36, wfun=lambda a: smooth_(4.70, 5.50, a) * (1 - smooth_(7.20, 7.70, a))))   # Mark: связь плавнее, без ступенек; губу и крыло не трогает
    print('скруглено у горба:', fillet_seam(host, pairs=((1, 2), (2, 3)), band=0.13, iters=10))
    cuts = [cock_cut()]
    for sx in (1, -1): cuts += [intake_cut(sx)]
    for c in cuts:
        _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'YK_skin'; host.data.name = 'YK_skin'
    bvh_ready(host)
    return host


def plane(stage=9, carve=True):
    """Этапы: 1 - обшивка; 2 - рули, стабилизатор, сопла, складные консоли; 3 - фонарь, створки, детали; 4 - шасси."""
    PARTS.clear()
    skin = build_skin(); out = [skin]
    if stage >= 2:
        out += [rudder(), stab(1), stab(-1), tail_rcs(), pitot()]
        for s, n in ((1, 'r'), (-1, 'l')):
            wo = wing_out(s); ail = wing_part('ail_' + n, AIL, s, HINGE, 'элерон на складной консоли; ось в центре носка; плюс - задняя кромка вниз; ребёнок wing_o', (-20.0, 20.0))
            PARTS['ail_' + n]['parent'] = wo.name; ail.parent = wo; ail.location = ail.location - wo.location
            out += [wo, ail, nozzle(s),
                    wing_part('flap_' + n, FLAP, s, HINGE, 'закрылок у фюзеляжа; ось в центре носка; плюс - вниз', (0.0, 30.0), 0.015, 0.016)]
    if stage >= 3:
        out += canopy() + windscreen() + [lift_top_door(), louvres()] + lift_bot_doors()
        import yak_gear as gr0; out += gr0.closed_doors()
        try:
            import yak_detail as dt; out += dt.all_details()
        except ImportError: pass
    if stage >= 4:
        try:
            import yak_gear as gr; out += gr.all_gear()
        except ImportError: pass
    for c in (lift_top_cut(), lift_bot_cut()) + tuple(gear_bay_cuts()): _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
    return out
