# srb_pod.py — геометрия контейнера «Сорбция» (крыльевой контейнер станции помех Су-27) для build.py. Всё в метрах: ось контейнера — Y, острый (передний) колпак — +Y, начало — середина длины,
# верх (подвесная планка) — +Z, наружный борт с люком — +X. a — расстояние от острого колпака вдоль оси (м).
# Источники: 2_компоновка_Су-27_чб_поз87.webp — поз. 87 «Крыльевой контейнер станции помех «Сорбция»» нарисован отдельно (косая проекция: толщина на ней завышена, поэтому диаметр — не с рисунка);
# по повёрнутому рисунку (_измерения/поз87_повёрнутый.png, ось горизонтально) сняты доли длины: колпаки, кольца-стыки, планка, люк, отверстие, шов с метками. Длина 4,2 м и Ø 0,3 м — со слов Mark.
# Фото Су-27 (5, 6) — место на законцовке и светлая окраска; Су-34 / Су-35 (Хибины, 7–9) — не «Сорбция», используются только как похожий класс для деталей поверхности.
import math
import bpy
from mathutils import Vector
import modelkit as mk
from modelkit import B

L = 4.20                                  # длина, м (со слов Mark)
R = 0.15                                  # радиус корпуса (Ø 0,3 м, со слов Mark)
NSEG = 32
G_BODY, G_CAP, G_DARK = 0, 1, 2           # индексы материалов (build.py задаёт список в этом порядке): краска корпуса, обтекатели, тёмный металл
A_NOSE_OG, A_NOSE_COL = 0.42, 0.60        # конец оживала носового колпака и конец его кольца-обечайки (по рисунку: колпак 0,42 м + кольцо 0,18 м)
A_TAIL_COL, A_TAIL_OG = 3.78, 3.92        # начало кольца хвостового колпака (0,14 м) и начало его оживала (0,28 м до торца)
A_RAIL0, A_RAIL1 = 0.40, 3.46             # планка вдоль верха (по рисунку: от носового кольца почти до хвостового)
A_HATCH0, A_HATCH1 = 2.65, 3.09           # люк на наружном борту: 0,44 м
PHI_HATCH = (-60.0, 8.0)                  # люк по окружности, ° от +X (вверх +), нижняя половина борта
A_PLUG, PHI_PLUG = 1.154, -32.0           # круглая заглушка у переднего кольца


def Yb(a): return L / 2 - a


def ringpts(a, r, n=NSEG, a0=0.0, cx=0.0, cz=0.0):
    """Кольцо радиуса r на расстоянии a от носа, центр (cx, cz); угол 0 — +X, 90° — +Z (вверх, к планке)."""
    return [Vector((cx + r * math.cos(a0 + 2 * math.pi * k / n), Yb(a), cz + r * math.sin(a0 + 2 * math.pi * k / n))) for k in range(n)]


def ogive(Lc, Rr):
    """Касательное оживало длиной Lc и радиусом основания Rr: r(u), u — расстояние от острия."""
    rho = (Rr * Rr + Lc * Lc) / (2 * Rr)
    return lambda u: max(math.sqrt(max(rho * rho - (Lc - u) ** 2, 0.0)) - (rho - Rr), 0.0)


def with_grooves(base, grooves, gmat):
    """base — [(a, r, материал полосы до следующей точки)] по возрастанию a; grooves — [(a, полуширина, глубина)] — канавки (стыки) в прямых участках."""
    out = []
    for i in range(len(base) - 1):
        xa, Ra, ma = base[i]; xb, Rb, _ = base[i + 1]
        out.append((xa, Ra, ma))
        if xb > xa:
            Rat = lambda x: Ra + (Rb - Ra) * (x - xa) / (xb - xa)
            for gx, hw, d in sorted(g for g in grooves if xa + 1e-4 <= g[0] - g[1] and g[0] + g[1] <= xb - 1e-4):
                out += [(gx - hw, Rat(gx - hw), gmat), (gx - hw, Rat(gx - hw) - d, gmat), (gx + hw, Rat(gx + hw) - d, gmat), (gx + hw, Rat(gx + hw), ma)]
    out.append(base[-1])
    return out


def body():
    """Корпус одним замкнутым телом вращения: носовое оживало, кольцо, цилиндр, кольцо, хвостовое оживало; стыки — канавки."""
    og_n, og_t = ogive(A_NOSE_OG, R), ogive(L - A_TAIL_OG, R)
    us_n = [0.0, 0.012, 0.03, 0.06, 0.10, 0.15, 0.21, 0.27, 0.33, 0.38, A_NOSE_OG]
    nose = [(u, max(og_n(u), 0.0045), G_CAP) for u in us_n]
    ut = [L - A_TAIL_OG, 0.24, 0.20, 0.16, 0.12, 0.085, 0.055, 0.030, 0.012, 0.0]       # расстояние от торца до кольца
    tail = [(L - u, max(og_t(u), 0.0045), G_CAP) for u in ut]
    base = nose + [(A_NOSE_COL, R, G_BODY), (A_TAIL_COL, R, G_CAP), (A_TAIL_OG, R, G_CAP)] + tail[1:]
    # материал полосы за кольцом носового колпака (до A_NOSE_COL) — обтекатель, дальше цилиндр — краска корпуса; перед хвостовым кольцом — тоже краска
    prof = with_grooves(base, [(A_NOSE_OG + 0.003, 0.0025, 0.0022), (A_NOSE_COL + 0.003, 0.0025, 0.0022), (A_TAIL_COL + 0.003, 0.0025, 0.0022), (A_TAIL_OG - 0.003, 0.0025, 0.0022)], G_DARK)
    prof[0] = (prof[0][0], prof[0][1], G_CAP)
    b = B()
    b.loft([ringpts(a, r) for a, r, m in prof], [m for a, r, m in prof][:-1], cap0=G_CAP, cap1=G_CAP)
    return b.finish('SRB_body')


def rect(a, w, z0, z1, x=0.0):
    """Прямоугольное сечение (4 точки) на расстоянии a от носа: ширина w (поперёк), по высоте z0…z1."""
    return [Vector((x - w / 2, Yb(a), z1)), Vector((x + w / 2, Yb(a), z1)), Vector((x + w / 2, Yb(a), z0)), Vector((x - w / 2, Yb(a), z0))]


def rail():
    """Подвесная планка вдоль верха: узкая полоса с заострёнными концами (на рисунке — двойная линия вдоль всей верхней образующей)."""
    b = B(); z0 = R - 0.004
    b.loft([rect(A_RAIL0, 0.020, z0, R + 0.006), rect(A_RAIL0 + 0.14, 0.052, z0, R + 0.026), rect(A_RAIL1 - 0.14, 0.052, z0, R + 0.026), rect(A_RAIL1, 0.020, z0, R + 0.006)], G_DARK, cap0=G_DARK, cap1=G_DARK)
    return b.finish('SRB_rail')


def arcring(a, phi0, phi1, r_out, r_in, n=9):
    """Замкнутое сечение пластины в плоскости a: дуга снаружи (r_out) от phi0 до phi1 (°) и дуга внутри (r_in) обратно."""
    p0, p1 = math.radians(phi0), math.radians(phi1)
    out = [Vector((r_out * math.cos(p0 + (p1 - p0) * k / (n - 1)), Yb(a), r_out * math.sin(p0 + (p1 - p0) * k / (n - 1)))) for k in range(n)]
    inn = [Vector((r_in * math.cos(p1 - (p1 - p0) * k / (n - 1)), Yb(a), r_in * math.sin(p1 - (p1 - p0) * k / (n - 1)))) for k in range(n)]
    return out + inn


def hatch():
    """Люк на наружном борту: выпуклая пластина по дуге (чуть выше корпуса, фаски по краям); овальное отверстие и винты — в карте нормалей."""
    p0, p1 = PHI_HATCH; b = B()
    b.loft([arcring(A_HATCH0, p0 + 5, p1 - 5, R + 0.0025, R - 0.004), arcring(A_HATCH0 + 0.012, p0, p1, R + 0.0075, R - 0.004), arcring(A_HATCH1 - 0.012, p0, p1, R + 0.0075, R - 0.004),
            arcring(A_HATCH1, p0 + 5, p1 - 5, R + 0.0025, R - 0.004)], G_BODY, cap0=G_BODY, cap1=G_BODY)
    return b.finish('SRB_hatch')


def radial_cyl(b, a, phi, r, h, n=14, mat=G_DARK, sink=0.004):
    """Короткий цилиндр радиуса r, торчащий на h из корпуса по направлению phi (°) в сечении a (заглушки, штифты)."""
    ph = math.radians(phi); er = Vector((math.cos(ph), 0.0, math.sin(ph))); t1 = Vector((0.0, 1.0, 0.0)); t2 = er.cross(t1)
    c = Vector((0.0, Yb(a), 0.0))
    ring = lambda rho: [c + er * rho + t1 * (r * math.cos(2 * math.pi * k / n)) + t2 * (r * math.sin(2 * math.pi * k / n)) for k in range(n)]
    b.loft([ring(R - sink), ring(R + h)], mat, cap0=mat, cap1=mat)


def fittings():
    """Круглая заглушка у переднего кольца и два штифта у хвостового (по рисунку)."""
    b = B()
    radial_cyl(b, A_PLUG, PHI_PLUG, 0.022, 0.010, n=16)
    radial_cyl(b, A_TAIL_COL + 0.02, -35.0, 0.011, 0.008, n=10)
    radial_cyl(b, A_TAIL_COL + 0.11, -45.0, 0.011, 0.008, n=10)
    return b.finish('SRB_fit')


def pod(stage=9):
    """Строит контейнер в текущую коллекцию (после mk.configure и mk.set_materials): этапы 1 — корпус, 2 — подвесная планка, 3 — люк, заглушка и штифты."""
    out = [body()]
    if stage >= 2: out.append(rail())
    if stage >= 3: out += [hatch(), fittings()]
    return out
