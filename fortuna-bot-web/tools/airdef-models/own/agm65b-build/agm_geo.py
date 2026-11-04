# agm_geo.py - геометрия AGM-65B Maverick для build.py. Метры: ось корпуса - Y, нос +Y (в glTF -Z), верх (упоры и рельс) +Z (в glTF +Y), начало - на оси посередине длины 2,495 м.
# a - расстояние от вершины стекла, Yb(a) - координата Y. Размеры - соотношения картинок: референс_1 (белая 65B: окраска, надписи, поясы), референс_2 и референс_3 (другие версии: только
# форма упоров и рельса, заклёпки, сопло сзади). Масштаб - длина прежней модели игры; Ø 0,30 и размах 0,72 совпали с картинками.
import math
from mathutils import Vector, Matrix
import modelkit as mk
from modelkit import B

L = 2.495
R = 0.150
NSEG = 40
G_BODY, G_STEEL, G_DARK, G_GLASS, G_LENS, G_OPT = 0, 1, 2, 3, 4, 5      # белая краска; сталь; тёмное нутро; стекло; линза; металл оптики (последние три - плоские, не запекаются)
A_RIM, R_GLASS = 0.082, 0.108                                  # край стекла: от вершины, радиус
BAND_BLACK = (0.745, 0.805)                                    # чёрный поясок за головкой (референс_1) - стальная лента поверх корпуса
BAND_BROWN = (2.185, 2.245)                                    # коричневый поясок у хвоста (референс_1)
A_END, A_CAV, R_CAV = L, 2.285, 0.139                          # хвостовой срез, дно полости, радиус полости
WING_ROOT0, WING_TIP0, WING_TE, WING_R = 0.905, 2.115, 2.175, 0.360   # крыло: начало корня, передняя кромка конца, задняя кромка, вылет от оси (размах 0,72)
RUD_A, RUD_R0, RUD_R1 = 2.315, R + 0.004, 0.350                # ось руля: на расстоянии a от носа, радиальная; корень и конец руля от оси
RUD_RANGE = 25.0                                               # ход руля ±, градусы
HANG0, HANG1, RAIL0, RAIL1 = 0.860, 1.070, 1.360, 2.030        # передний упор и длинный рельс (вдоль оси)
PHI = (45.0, 135.0, 225.0, 315.0)                              # крылья и рули - крестом «×», верх +Z между ними


def Yb(a): return L / 2 - a


def ringpts(a, r, n=NSEG):
    a0 = -math.pi / 2                                          # шов развёртки - снизу
    return [Vector((r * math.cos(a0 + 2 * math.pi * k / n), Yb(a), r * math.sin(a0 + 2 * math.pi * k / n))) for k in range(n)]


def _axes(phi):
    ph = math.radians(phi); return Vector((math.cos(ph), 0.0, math.sin(ph))), Vector((-math.sin(ph), 0.0, math.cos(ph)))


# ── корпус: тёмная переборка под стеклом, обод стекла, скруглённый нос, цилиндр, стальная лента, стыки секций, хвостовой срез и стакан полости ──
NOSE = [(A_RIM + 0.002, R_GLASS + 0.008), (0.100, 0.1215), (0.125, 0.1285), (0.165, 0.1350), (0.215, 0.1405), (0.275, 0.1450), (0.345, 0.1480), (0.430, 0.1497), (0.520, R)]


def body_profile():
    Bd, Dk = G_BODY, G_DARK
    p = [(A_RIM + 0.030, 0.006, Dk), (A_RIM + 0.030, R_GLASS - 0.006, Dk), (A_RIM + 0.004, R_GLASS - 0.001, Dk), (A_RIM - 0.002, R_GLASS + 0.001, Bd)]      # переборка и посадочный обод
    p += [(a, r, Bd) for a, r in NOSE]
    s = 0.0028                                                 # лента и стыки секций
    p += [(BAND_BLACK[0] - 0.002, R, Bd), (BAND_BLACK[0], R + s, Bd), (BAND_BLACK[1], R + s, Bd), (BAND_BLACK[1] + 0.002, R, Bd)]
    for g in (1.085, 1.610):
        p += [(g - 0.0025, R, Bd), (g - 0.0025, R - 0.0018, Bd), (g + 0.0025, R - 0.0018, Bd), (g + 0.0025, R, Bd)]
    p += [(BAND_BROWN[0] - 0.003, R, Bd), (BAND_BROWN[0] - 0.003, R - 0.0018, Bd), (BAND_BROWN[0], R - 0.0018, Bd), (BAND_BROWN[0], R, Bd), (BAND_BROWN[1], R, Bd)]
    p += [(A_END - 0.006, R, Bd), (A_END, R - 0.004, Bd), (A_END, R_CAV + 0.002, Dk), (A_END - 0.012, R_CAV, Dk), (A_CAV, R_CAV, Dk), (A_CAV, 0.092, Dk)]     # срез, стенка полости, дно
    return p


def body():
    prof = body_profile()
    b = B(); b.loft([ringpts(a, r) for a, r, m in prof], [m for a, r, m in prof][:-1], cap0=G_DARK, cap1=G_DARK)
    return b.finish('M65_body')


# ── стекло головки: купол-оболочка, открытый сзади; оптика под ним: кольцо-кардан, объектив, зеркальный конус, тёмная бленда ──
def glass():
    n = NSEG; rings = []
    for k in range(9):
        t = (k + 0.15) / 8.15 if k < 8 else 1.0; ph = t * math.pi / 2                  # t = 0 - у вершины, t = 1 - у края
        rings.append(ringpts(A_RIM * (1 - math.cos(ph)), R_GLASS * math.sin(ph)))
    b = B(); b.loft(rings[::-1], G_GLASS, cap1=G_GLASS)                                 # снаружи - нормалью вперёд
    return b.finish('M65_glass')


def _rev(b, a0, prof, mat, n=28, cap0=None, cap1=None):
    b.loft([ringpts(a0 + a, r, n) for a, r in prof], mat, cap0=cap0, cap1=cap1)


def optics():
    a0 = A_RIM + 0.028
    b = B()
    _rev(b, a0 - 0.002, [(0.0, 0.080), (-0.010, 0.085), (-0.022, 0.085), (-0.030, 0.076)], G_OPT, cap1=G_OPT)                 # кольцо кардана
    _rev(b, a0 - 0.028, [(0.0, 0.066), (-0.034, 0.066), (-0.040, 0.058)], G_OPT, cap1=G_OPT)                                     # бленда
    _rev(b, a0 - 0.068, [(0.0, 0.054), (-0.004, 0.050), (-0.012, 0.030), (-0.014, 0.006)], G_LENS, cap1=G_LENS)                   # объектив - выпуклая линза
    for k in range(2):                                                                                                            # цапфы кардана по бокам
        s = 1 if k else -1
        ring = lambda x: [Vector((s * x + 0.007 * math.cos(2 * math.pi * j / 10), Yb(a0 - 0.02), 0.007 * math.sin(2 * math.pi * j / 10))) for j in range(10)]
        b.loft([ring(0.080), ring(R_GLASS - 0.004)], G_OPT, cap0=G_OPT, cap1=G_OPT)
    return b.finish('M65_optics')


# ── сопло: полое сверху донизу - фланец на дне полости, расходящийся раструб с толщиной стенки, горло, тёмное нутро; мелкие блоки и кабель в полости ──
def nozzle():
    a = A_CAV
    prof = [(a - 0.012, 0.100), (a + 0.006, 0.100), (a + 0.012, 0.058), (a + 0.030, 0.040), (a + 0.150, 0.086), (a + 0.165, 0.092), (a + 0.171, 0.088),      # наружная сторона
            (a + 0.155, 0.080), (a + 0.040, 0.030), (a + 0.018, 0.022), (a - 0.010, 0.016)]                                                                 # внутренняя сторона, горло
    b = B()
    rings = [ringpts(x, r, 36) for x, r in prof]; rings.append(rings[0])
    b.loft(rings, [G_STEEL] * 4 + [G_STEEL] * 2 + [G_DARK] * 5, cap0=None, cap1=None)
    import bmesh
    bmesh.ops.remove_doubles(b.bm, verts=b.bm.verts[:], dist=1e-6)
    return b.finish('M65_nozzle')


def _box(b, c, u, v, n, hu, hv, lo, hi, mat):
    b.loft([[c + u * (su * hu) + v * (sv * hv) + n * h for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))] for h in (lo, hi)], mat, cap0=mat, cap1=mat)


def tail_bits():
    """Блоки на дне полости и кольцевой кабель (референс_3: мелкие детали вокруг сопла)."""
    b = B(); X, Yy, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
    for phi, hu, hv, h in ((20.0, 0.018, 0.012, 0.030), (160.0, 0.022, 0.014, 0.022), (250.0, 0.016, 0.016, 0.036), (305.0, 0.012, 0.018, 0.026)):
        er, et = _axes(phi); c = Vector((0, Yb(A_CAV), 0)) + er * 0.118
        _box(b, c, et, er, -Yy, hu, hv, -0.002, h, G_DARK)
    n = 24
    for k in range(n):                                                               # кабель по окружности - отрезками
        t0, t1 = 2 * math.pi * k / n, 2 * math.pi * (k + 1) / n; r_ = 0.128
        p0 = Vector((r_ * math.cos(t0), Yb(A_CAV + 0.012), r_ * math.sin(t0))); p1 = Vector((r_ * math.cos(t1), Yb(A_CAV + 0.012), r_ * math.sin(t1)))
        d = (p1 - p0).normalized(); u = d.cross(Yy).normalized(); v = d.cross(u)
        ring = lambda p: [p + (u * math.cos(2 * math.pi * j / 5) + v * math.sin(2 * math.pi * j / 5)) * 0.005 for j in range(5)]
        b.loft([ring(p0), ring(p1)], G_STEEL)
    return b.finish('M65_tailbits')


# ── крылья: четыре длинных неподвижных пера «×» - тонкая пластина со скосами кромок, корень в корпусе, у корня - прижимная планка ──
def _foil(er, et, r, a0, a1, t):
    a0, a1 = min(a0, a1), max(a0, a1); c = a1 - a0; bev = min(0.05, c * 0.25)
    P = lambda a, s: Vector((0, Yb(a), 0)) + er * r + et * s
    return [P(a0, 0.0), P(a0 + bev, t / 2), P(a1 - bev * 0.5, t / 2), P(a1, 0.0), P(a1 - bev * 0.5, -t / 2), P(a0 + bev, -t / 2)]


def wings():
    b = B()
    for phi in PHI:
        er, et = _axes(phi)
        r0 = R - 0.006; k = (WING_TIP0 - WING_ROOT0) / (WING_R - R)
        st = [(r0, WING_ROOT0 - 0.006 * k, 0.014), (R + 0.004, WING_ROOT0 + 0.004 * k, 0.014), (R + (WING_R - R) * 0.5, WING_ROOT0 + (WING_R - R) * 0.5 * k, 0.009), (WING_R, WING_TIP0, 0.004)]
        rings = [_foil(er, et, r, a0, WING_TE, t) for r, a0, t in st]
        b.loft(rings, G_BODY, cap0=G_BODY, cap1=G_BODY)
        # прижимная планка вдоль корня
        P = lambda a, r, s: Vector((0, Yb(a), 0)) + er * r + et * s
        ring = lambda a: [P(a, R - 0.004, -0.024), P(a, R - 0.004, 0.024), P(a, R + 0.006, 0.019), P(a, R + 0.006, -0.019)]
        b.loft([ring(WING_ROOT0 + 0.03), ring(WING_TE - 0.005)], G_BODY, cap0=G_BODY, cap1=G_BODY)
    return b.finish('M65_wings')


# ── рули: четыре отдельных объекта, начало на оси руля у корпуса; ось - радиальная. Концы рулей не заходят в последние 3 % длины (a ≤ 2,42): игра ищет там ось сопла (nozzleOf), иначе огонь уходит вверх ──
RUD_PIVOTS = {}


def rudder(k):
    phi = PHI[k]; er, et = _axes(phi); o = Vector((0, Yb(RUD_A), 0)) + er * R
    a0r, a1r, a0t, a1t = RUD_A - 0.045, RUD_A + 0.060, RUD_A + 0.008, RUD_A + 0.098        # корень и конец вдоль оси: задняя кромка скошена назад
    b = B()
    t = 0.0052
    rings = []
    for r, a0, a1 in ((RUD_R0, a0r, a1r), (RUD_R1, a0t, a1t)):
        P = lambda a, s: Vector((0, Yb(a), 0)) + er * r + et * s - o
        c = a1 - a0; bev = c * 0.18
        rings.append([P(a0, 0.0), P(a0 + bev, t / 2), P(a1 - bev, t / 2), P(a1, 0.0), P(a1 - bev, -t / 2), P(a0 + bev, -t / 2)])
    b.loft(rings, G_BODY, cap0=G_BODY, cap1=G_BODY)
    # ступица оси и бобышка: цилиндр вдоль радиуса у корня
    n = 12; X = Vector((0, 1, 0))
    ring = lambda rr, ro: [er * rr + (X * math.cos(2 * math.pi * j / n) + et * math.sin(2 * math.pi * j / n)) * ro for j in range(n)]
    b.loft([ring(0.0008, 0.019), ring(0.006, 0.019), ring(0.012, 0.012), ring(0.052, 0.007)], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    ob = b.finish(f'rudder_{k}')
    ob.location = o
    RUD_PIVOTS[k] = dict(o=o.copy(), axis=er.copy())
    return ob


def rudder_seats():
    """Неподвижные кольца на корпусе под осями рулей (референс_2, 3)."""
    b = B(); n = 12; X = Vector((0, 1, 0))
    for phi in PHI:
        er, et = _axes(phi); o = Vector((0, Yb(RUD_A), 0)) + er * R
        ring = lambda rr, ro: [o + er * rr + (X * math.cos(2 * math.pi * j / n) + et * math.sin(2 * math.pi * j / n)) * ro for j in range(n)]
        b.loft([ring(-0.004, 0.026), ring(0.0005, 0.026), ring(0.0005, 0.021)], G_STEEL, cap0=G_STEEL)
    return b.finish('M65_seats')


# ── подвес на верхней линии: передний упор - два трапециевидных башмака с Т-полками; длинный рельс - две параллельные Т-планки с рампами на концах (референс_2, референс_1) ──
def _t_rail(b, x, a0, a1, ramp, h, stem=0.010, top=0.021, thick=0.008, mat=G_BODY):
    z0 = R - 0.006; zt = R + h; zs = zt - thick
    def sec(a, frac):                                                               # frac - доля высоты на рампе
        zh = z0 + (zt - z0) * frac; zf = z0 + (zs - z0) * frac
        return [Vector((x - stem, Yb(a), z0)), Vector((x + stem, Yb(a), z0)), Vector((x + stem, Yb(a), zf)), Vector((x + top, Yb(a), zf)), Vector((x + top, Yb(a), zh)),
                Vector((x - top, Yb(a), zh)), Vector((x - top, Yb(a), zf)), Vector((x - stem, Yb(a), zf))]
    st = [(a0, 0.12), (a0 + ramp, 1.0), (a1 - ramp, 1.0), (a1, 0.12)]
    b.loft([sec(a, f) for a, f in st], mat, cap0=mat, cap1=mat)


def lugs():
    b = B()
    # плита основания под упорами и рельсом
    for a0, a1, hw in ((HANG0 - 0.012, HANG1 + 0.012, 0.086), (RAIL0 - 0.012, RAIL1 + 0.012, 0.078)):
        z = R * math.cos(math.asin(min(hw / R, 0.9))) - 0.004
        ring = lambda a: [Vector((-hw, Yb(a), z)), Vector((hw, Yb(a), z)), Vector((hw * 0.95, Yb(a), z + 0.010)), Vector((0, Yb(a), R + 0.005)), Vector((-hw * 0.95, Yb(a), z + 0.010))]
        b.loft([ring(a0), ring(a1)], G_BODY, cap0=G_BODY, cap1=G_BODY)
    for s in (-1, 1):
        x = s * 0.055
        _t_rail(b, x, HANG0, HANG1, 0.065, 0.062, stem=0.014, top=0.026, thick=0.011, mat=G_STEEL)      # передний упор: башмак справа и слева
        _t_rail(b, x, RAIL0, RAIL1, 0.050, 0.048, stem=0.009, top=0.019, thick=0.007, mat=G_BODY)       # длинный рельс
    return b.finish('M65_lugs')


def missile(stage=9):
    """Этапы: 1 - корпус; 2 - крылья и подвес; 3 - рули и сопло; 4 - стекло и оптика."""
    out = [body()]
    if stage >= 2: out += [wings(), lugs()]
    if stage >= 3: out += [nozzle(), tail_bits(), rudder_seats()] + [rudder(k) for k in range(4)]
    if stage >= 4: out += [optics(), glass()]
    return out
