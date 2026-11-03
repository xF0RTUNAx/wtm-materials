# ФАБ-1000 — своя игровая модель по фото Mark (Свои/ФАБ-1000/, один музейный экземпляр у здания): ref_01 — строго сбоку, нос слева (главная: профиль, пояс головок, проушины,
# стабилизатор), ref_02 — 3/4 спереди (нос, гнездо взрывателя, пояс головок), ref_03 — 3/4 сзади (перья, уголки по корню, раскосы, хвостовое гнездо с фланцем, вырез в перьях).
# Подставки, стена и брусчатка — не модель. Взрывателей на фото нет: гнёзда пустые, как на фото.
# Координаты ниже — пиксели ref_01 (2000 × 1333): x вдоль оси (нос x = 90, задний срез перьев x = 1752), радиус — от оси (ось цилиндра y = 778,5, радиус цилиндра 115 пикс.).
# Камера на ref_01 поднята ≈ 25° (ближнее перо видно сверху полосой 0,42 × вылета) — углы деталей по кругу пересчитаны с этим наклоном.
# Масштаб — по длине прежней модели игры (3,35 м; нос … задний срез стабилизатора), Ø 0,67 м прежней — только для сверки: по фото Ø корпуса 0,46 м.
# Запуск (фоновый Blender): F1K_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# В своём окне Blender «для показа»: F1K_STAGE=1…4 (1 корпус, 2 + пояс головок и проушины, 3 + стабилизатор с уголками, 4 + раскосы и фланец), live.py из Свои/_инструменты/live_blender.
#
# СПИСОК ДЕТАЛЕЙ С ФОТО (сделано / пропущено):
#  + корпус вращением: тупой нос с плоским торцом и пустым гнездом взрывателя (ref_02), оживало, цилиндр, длинный конус к хвосту; стыки — канавки (x 414 у пояса, x 997 цилиндр — конус)
#  + пояс выпуклых головок у носа: 12 головок по кругу на стыке x 423 (ref_01 — пять в профиль и одна на верхней образующей, ref_02)
#  + две проушины-пластины с отверстием на конусе (x 1046…1094): одна на верхней образующей, вторая — на ближнем к камере борту ≈ 25° ниже горизонтали (как на ref_01)
#  + хвостовое гнездо взрывателя: шейка и фланец с центральным отверстием и восемью отверстиями под болты (ref_03)
#  + стабилизатор: четыре пера «+» (одно вверх, к проушине) — стреловидная передняя кромка, скос заднего верхнего угла, вырез у конуса (окно за фланцем), за вырезом перья сходятся на оси
#  + уголки-накладки по корню перьев на конусе (по два на перо) и уголки в четырёх углах стыка перьев на оси
#  + раскосы: по два между каждой парой соседних перьев (восемь), плоская полоса шириной вдоль оси, лапки на перьях
#  − заклёпки на уголках и болты фланца — рельефом и цветом в bake.py, не геометрией
#  − вмятины и потёки музейной краски — не модель
import sys, os, math, importlib
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
import bpy
import modelkit as mk; importlib.reload(mk)
from modelkit import B, Vector, circ, profile, Y

STAGE = int(os.environ.get('F1K_STAGE', '9'))
LEN_M = 3.35                      # длина прежней модели в игре
X_TIP, X_END = 90.0, 1752.0       # торец носа; задний срез перьев
S = LEN_M / (X_END - X_TIP)       # метров на пиксель (≈ 2,02 мм)
X0, YC, RB = (X_TIP + X_END) / 2, 778.5, 115.0
mk.configure('FAB1000', S, x0=X0, yc=YC, rb=RB, nseg=32, nose='left')
G_BODY, G_FIN, G_STEEL, G_DARK = 0, 1, 2, 3
mk.set_materials([('F1K_body', (0.46, 0.48, 0.49)), ('F1K_fin', (0.44, 0.46, 0.47)), ('F1K_steel', (0.30, 0.31, 0.32)), ('F1K_dark', (0.035, 0.035, 0.035))])
for m, (rough, metal) in zip(mk.MATS, ((0.66, 0.08), (0.66, 0.08), (0.55, 0.45), (0.85, 0.0))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal


def P(x, r, w, er, et):
    """Точка в метрах: на оси — пиксель x, радиально r (пикс.) вдоль er, w (пикс.) вдоль et."""
    return Vector((0.0, Y(x), 0.0)) + (er * r + et * w) * S


def axes(phi):
    ph = math.radians(phi)
    return Vector((math.cos(ph), 0.0, math.sin(ph))), Vector((-math.sin(ph), 0.0, math.cos(ph)))


# ── профиль корпуса (x, R), снят с верхней кромки ref_01 от оси y = 780 (по нижней кромке в тени нос не ниже — сверено наложением) ──
NOSE = [(90.0, 11.0), (91.0, 13.5), (92.5, 16.5), (95.0, 20.5), (100.0, 27.0), (110.0, 33.0), (120.0, 37.0), (135.0, 43.0), (150.0, 48.5), (170.0, 56.0), (195.0, 65.0),
        (220.0, 75.0), (250.0, 87.0), (280.0, 96.0), (310.0, 104.0), (340.0, 109.8), (370.0, 113.6), (400.0, 115.0), (430.0, 115.0)]
X_CYL1 = 997.0                    # конец цилиндра (стык с конусом)
X_CONE1, R_CONE1 = 1338.0, 31.0   # торец конуса (у фланца)
CONE_K = (115.0 - R_CONE1) / (X_CONE1 - 1003.0)


def R_at(x):
    """Радиус корпуса (пикс.) на позиции x."""
    if x <= NOSE[-1][0]:
        for (x0, r0), (x1, r1) in zip(NOSE, NOSE[1:]):
            if x0 <= x <= x1: return r0 + (r1 - r0) * (x - x0) / (x1 - x0)
        return NOSE[0][1]
    if x <= 1003.0: return 115.0
    return max(R_CONE1, 115.0 - (x - 1003.0) * CONE_K)


# ── 1. корпус одним замкнутым телом: гнездо носа, оживало, цилиндр, конус, шейка, фланец, хвостовое гнездо ──
X_NECK1, X_FL0, X_FL1 = 1346.0, 1346.0, 1358.0      # шейка 1338…1346, фланец 1346…1358
R_NECK, R_FL, R_BORE = 24.0, 34.0, 12.0
base = [(104.0, 0.8, G_DARK), (104.0, 6.0, G_DARK), (91.0, 6.0, G_STEEL), (90.0, 7.2, G_STEEL), (90.0, 10.0, G_BODY)]      # дно и стенка носового гнезда, фаска, торец носа
base += [(x, r, G_BODY) for x, r in NOSE[1:]]
base += [(X_CYL1, 115.0, G_BODY), (1003.0, 115.0, G_BODY), (X_CONE1, R_CONE1, G_BODY), (X_CONE1, R_NECK, G_STEEL), (X_FL0, R_NECK, G_STEEL), (X_FL0, R_FL, G_STEEL),
         (X_FL1 - 1.0, R_FL, G_STEEL), (X_FL1, R_FL - 1.0, G_STEEL), (X_FL1, R_BORE + 1.0, G_STEEL), (X_FL1 - 1.0, R_BORE, G_DARK), (X_CONE1 - 6.0, R_BORE, G_DARK), (X_CONE1 - 6.0, 0.8, G_DARK)]
GROOVES = [(414.0, 1.0, 0.9), (1000.0, 1.0, 0.9)]
prof = profile(base, GROOVES, groove_mat=G_BODY)
# профиль идёт от дна носового гнезда наружу и назад: у первых точек x убывает — profile() пропускает канавки только там, где x растёт, этого и надо
b = B(); b.loft([circ(x, R) for x, R, m in prof], [m for x, R, m in prof][:-1], cap0=G_DARK, cap1=G_DARK); body = b.finish('F1K_body')
print('корпус: колец', len(prof))


def dome(bb, c, n_out, rad, h, mat, nseg=10, nr=3):
    """Выпуклая головка: купол радиуса rad (м) и высоты h над поверхностью с нормалью n_out, основание утоплено на 0,25 h."""
    t1 = n_out.orthogonal().normalized(); t2 = n_out.cross(t1).normalized()
    rings = []
    for i in range(nr + 1):
        a = (math.pi / 2) * i / nr
        rr, hh = rad * math.cos(a), h * math.sin(a)
        if i == 0: hh = -0.25 * h
        rings.append([c + n_out * hh + (t1 * math.cos(2 * math.pi * k / nseg) + t2 * math.sin(2 * math.pi * k / nseg)) * max(rr, rad * 0.12) for k in range(nseg)])
    bb.loft(rings, mat, cap0=mat, cap1=mat)


def holed_plate(bb, outline, hole_c, hole_r, er, et, x_of, th, mat, n=20):
    """Пластина-проушина в плоскости (ось, er) с круглым отверстием: outline — [(x, h)] замкнутый контур (пикс., h — над поверхностью корпуса),
    звёздный относительно центра отверстия hole_c = (x, h); толщина th (пикс.) вдоль et. Кольцо контура и кольцо отверстия — одна полоса (тор)."""
    hx, hh = hole_c
    segs = list(zip(outline, outline[1:] + outline[:1]))
    def ray(a):
        d = (math.cos(a), math.sin(a)); best = None
        for (x0, h0), (x1, h1) in segs:
            ex, eh = x1 - x0, h1 - h0; den = d[0] * eh - d[1] * ex
            if abs(den) < 1e-9: continue
            t = ((x0 - hx) * eh - (h0 - hh) * ex) / den; u = ((x0 - hx) * d[1] - (h0 - hh) * d[0]) / den
            if t > 0 and -1e-6 <= u <= 1 + 1e-6 and (best is None or t < best): best = t
        return hx + d[0] * best, hh + d[1] * best
    angs = [2 * math.pi * k / n for k in range(n)]
    outer = [ray(a) for a in angs]; inner = [(hx + hole_r * math.cos(a), hh + hole_r * math.sin(a)) for a in angs]
    pt = lambda xh, w: P(xh[0], x_of(xh[0]) + xh[1], w, er, et)
    rings = [[pt(p, -th / 2) for p in inner], [pt(p, -th / 2) for p in outer], [pt(p, th / 2) for p in outer], [pt(p, th / 2) for p in inner], [pt(p, -th / 2) for p in inner]]
    bb.loft(rings, mat)


# ── 2. пояс головок и две проушины ──
if STAGE >= 2:
    bd = B()
    X_BELT, N_HEAD = 423.0, 12
    for k in range(N_HEAD):
        er, et = axes(90.0 + 360.0 * k / N_HEAD)
        dome(bd, P(X_BELT, R_at(X_BELT), 0.0, er, et), er, 9.5 * S, 5.0 * S, G_BODY)
    bd.finish('F1K_heads')
    bl = B()
    LUG = [(1046.0, -2.0), (1094.0, -2.0), (1094.0, 10.0), (1092.5, 14.5), (1089.0, 17.0), (1084.0, 18.0), (1060.0, 16.0), (1048.0, 9.0), (1046.0, 6.0)]
    for phi in (90.0, 205.0):                                  # верх; ближний борт ниже горизонтали (на ref_01 — нижняя проушина видна плашмя)
        er, et = axes(phi)
        holed_plate(bl, LUG, (1081.0, 9.0), 3.0, er, et, R_at, 4.0, G_BODY)
    bl.finish('F1K_lugs')

# ── 3. стабилизатор: четыре пера «+», уголки по корню на конусе и в углах стыка на оси ──
FIN_T = 3.0                       # толщина листа пера, пикс. (≈ 6 мм)
R_TIP, R_CUT = 153.0, 36.0        # вылет перьев от оси (верхнее перо на ref_01 152 пикс. ближе к камере, нижнее 130 — дальше; × 1/cos 25°); вырез у конуса (окно за фланцем, фланец проходит)
X_LE0, X_LE1 = 1165.0, 1215.0     # передняя кромка: корень на конусе — кончик
X_CUT1, X_JOIN = 1442.0, 1470.0   # конец выреза (скошенная задняя сторона окна) и начало стыка перьев на оси
if STAGE >= 3:
    th = FIN_T / 2
    OUT = [(X_LE0, R_at(X_LE0) - 1.5), (X_LE1, R_TIP), (1740.0, R_TIP), (X_END, 120.0), (X_END, 0.0), (X_JOIN, 0.0), (X_CUT1, R_CUT), (X_CONE1 + 0.5, R_CUT), (X_CONE1 + 0.5, R_CONE1 - 1.5)]
    bf = B()
    for phi in (0.0, 90.0, 180.0, 270.0):
        er, et = axes(phi)
        r_in = 0.0 if phi in (0.0, 180.0) else th                 # на стыке у оси: горизонтальные перья доходят до оси, вертикальные — до их граней (без щели вдоль оси)
        face = lambda s: [P(x, max(r, r_in), s * th, er, et) for x, r in OUT]
        bf.loft([face(+1), face(-1)], G_FIN, cap0=G_FIN, cap1=G_FIN)
    bf.finish('F1K_fins')
    ba = B(); LEG, A_T = 9.0, 1.5
    for phi in (0.0, 90.0, 180.0, 270.0):
        er, et = axes(phi)
        for s in (1, -1):                                       # уголки по корню: полка на пере (радиально) и полка на конусе (по касательной)
            sec = lambda x: [P(x, r, s * w, er, et) for r, w in ((R_at(x) - 1.0, th), (R_at(x) + LEG, th), (R_at(x) + LEG, th + A_T), (R_at(x) + A_T, th + A_T), (R_at(x) + A_T, th + LEG), (R_at(x) - 1.0, th + LEG))]
            ring0, ring1 = sec(X_LE0 + 12.0), sec(X_CONE1 - 4.0)
            if s < 0: ring0, ring1 = ring0[::-1], ring1[::-1]
            ba.loft([ring0, ring1], G_FIN, cap0=G_FIN, cap1=G_FIN)
        e1, _ = axes(phi); e2, _ = axes(phi + 90.0)                # уголок в углу стыка на оси: полки вдоль обоих перьев
        corner = lambda x: [Vector((0.0, Y(x), 0.0)) + (e1 * a + e2 * c) * S for a, c in ((th, th), (th + 12.0, th), (th + 12.0, th + A_T), (th + A_T, th + A_T), (th + A_T, th + 12.0), (th, th + 12.0))]
        ba.loft([corner(X_JOIN + 4.0), corner(X_END - 6.0)], G_FIN, cap0=G_FIN, cap1=G_FIN)
    ba.finish('F1K_angles')

# ── 4. раскосы между соседними перьями (по два на пару) с лапками; болты фланца — в рельефе ──
if STAGE >= 4:
    R_S, W_S, T_S = 105.0, 16.0, 3.0      # место крепления на пере (от оси), ширина полосы вдоль оси, толщина
    th = FIN_T / 2
    bs = B()
    UPY = Vector((0.0, 1.0, 0.0))
    for phi in (0.0, 90.0, 180.0, 270.0):
        e1, t1 = axes(phi); e2, t2 = axes(phi + 90.0)
        for xs in (1362.0, 1672.0):
            # торцы полосы лежат в плоскостях перьев: углы торца на пере 1 — r = R_S ± T_S/√2 вдоль e1 (сторона к перу 2 — +t1), на пере 2 — вдоль e2 (сторона к перу 1 — −t2)
            dr = T_S / math.sqrt(2.0)
            c1 = lambda r, w: Vector((0.0, Y(xs + w), 0.0)) + (e1 * r + t1 * th) * S
            c2 = lambda r, w: Vector((0.0, Y(xs + w), 0.0)) + (e2 * r - t2 * th) * S
            h = W_S / 2
            ring1 = [c1(R_S + dr, -h), c1(R_S - dr, -h), c1(R_S - dr, h), c1(R_S + dr, h)]
            ring2 = [c2(R_S + dr, -h), c2(R_S - dr, -h), c2(R_S - dr, h), c2(R_S + dr, h)]
            bs.loft([ring1, ring2], G_FIN, cap0=G_FIN, cap1=G_FIN)
            for e, t, sg in ((e1, t1, 1.0), (e2, t2, -1.0)):              # лапки: пластинки на пере под концом раскоса
                ft = lambda d: [Vector((0.0, Y(xs + dx), 0.0)) + (e * r + t * sg * d) * S for dx, r in ((-11.0, R_S - 8.0), (11.0, R_S - 8.0), (11.0, R_S + 8.0), (-11.0, R_S + 8.0))]
                ra, rb_ = ft(th - 0.3), ft(th + 1.4)
                if sg < 0: ra, rb_ = ra[::-1], rb_[::-1]
                bs.loft([ra, rb_], G_FIN, cap0=G_FIN, cap1=G_FIN)
    bs.finish('F1K_struts')

mk.GEO = dict(FIN_T=FIN_T, X_LE0=X_LE0, X_CONE1=X_CONE1, R_CONE1=R_CONE1, CONE_K=CONE_K, X_JOIN=X_JOIN, X_END=X_END, X_FL1=X_FL1, R_TIP=R_TIP, RB=RB)   # для bake.py и deliver.py
mk.stats()
print('сцена FAB1000: этап', STAGE)
