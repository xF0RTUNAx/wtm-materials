# Mk 82 - своя игровая модель по двум картинкам Mark (Свои/Mk 82/). Картинки только образец: свои меши, пиксели в текстуру не берём.
# референс_1 - музейное фото 3/4 спереди сверху: главный образец формы и цвета (передний экземпляр с табличкой MK 82; слева стоит Mk 83, подставка, таблички и пол - не модель).
# референс_2 - светлый снимок сбоку, повёрнут на 45°: образец надписей и лёгкого износа. Логотип и его файл в модель не идут.
# Измерения - пиксели _измерения/ref2_ось.png (референс_2, повёрнутый осью по горизонтали, нос слева, 1984 × 314): ось y = 171, остриё взрывателя x = 20, торец хвоста x = 1964.
# Радиус снят с нижней кромки (сверху мешает тросик). Перья на этой картинке стоят под 45°, поэтому их вылет от оси = смещение на картинке / cos 45°.
# Масштаб - по длине прежней модели игры, 2,30 м вместе с взрывателем.
# Запуск (фоновый Blender): M82_OUT="<папка>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
#
# СПИСОК ДЕТАЛЕЙ С КАРТИНОК (сделано / пропущено):
#  + корпус вращением: веретено, жёлтая носовая часть с плоским торцом и гнездом взрывателя, поясок-стык корпуса и хвоста (две канавки), стык на хвостовом конусе, короткий хвостовой торец
#  + хвостовое оперение: четыре неподвижных пера крестом × к упорам (стреловидная передняя кромка, кромки со скосом), в пилон не упираются
#  + взрыватель: цилиндр, фланец, тёмный ребристый купол, серебристый колпачок с отверстием, острие, две латунные лапки
#  + два упора-арки сверху на осевой линии, отверстие вдоль оси, тросик проходит через них; расширенная лапа у основания
#  + крышка горловины между упорами (плоский диск)
#  + тросик от заднего упора через передний к взрывателю: натянут поверх корпуса, обжимная втулка, кольцо и серьга между упорами
#  - винты у пояска, лючок на конусе, рёбра купола, шлиц крышки - цветом и рельефом в bake.py, не геометрией
#  - подставка, таблички, пол, соседняя Mk 83, логотип - не модель
# Подвижных частей нет. В файле нос +Y (в glTF уйдёт в -Z), верх +Z (в glTF +Y), начало на оси, середина длины.
import sys, os, math, importlib
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
import bpy
import modelkit as mk; importlib.reload(mk)
from modelkit import B, Vector, circ, Y

LEN_M = 2.30                      # длина прежней модели игры, вместе с взрывателем
X_TIP, X_END = 20.0, 1964.0       # остриё взрывателя; торец хвоста
S = LEN_M / (X_END - X_TIP)       # метров на пиксель (≈ 1,18 мм)
X0, YC, RB = (X_TIP + X_END) / 2, 171.0, 115.0
NSEG = 36
mk.configure('MK82', S, x0=X0, yc=YC, rb=RB, nseg=NSEG, nose='left')
G_BODY, G_NOSE, G_STEEL, G_WIRE = 0, 1, 2, 3
mk.set_materials([('M82_body', (0.072, 0.064, 0.020)), ('M82_nose', (0.54, 0.38, 0.008)), ('M82_steel', (0.42, 0.42, 0.37)), ('M82_wire', (0.30, 0.30, 0.28))])
for m, (rough, metal) in zip(mk.MATS, ((0.58, 0.0), (0.50, 0.0), (0.42, 0.65), (0.55, 0.5))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal


def axes(phi):
    ph = math.radians(phi)
    return Vector((math.cos(ph), 0.0, math.sin(ph))), Vector((-math.sin(ph), 0.0, math.cos(ph)))


def P(x, r, w, er, et):
    """Точка в метрах: на оси - пиксель x, радиально r (пикс.) вдоль er, w (пикс.) вдоль et."""
    return Vector((0.0, Y(x), 0.0)) + (er * r + et * w) * S


# ── профиль наружной оболочки корпуса (x, R) ──
X_YEL = 178.0                      # конец жёлтой части
OGIVE = [(108.0, 47.5), (116.0, 51.0), (124.0, 54.0), (140.0, 58.5), (X_YEL, 67.5), (220.0, 76.0), (260.0, 83.0), (300.0, 89.0), (340.0, 94.5), (380.0, 99.0), (420.0, 103.0), (460.0, 106.5),
         (500.0, 109.8), (540.0, 112.2), (580.0, 114.0), (620.0, 115.0), (800.0, 115.0), (1000.0, 113.5), (1060.0, 112.0), (1100.0, 110.0), (1180.0, 106.5), (1260.0, 103.0), (1340.0, 99.5), (1388.0, 97.5)]
BAND = [(1390.0, 95.5), (1392.0, 99.0), (1422.0, 98.0), (1425.0, 95.0), (1427.0, 96.2)]             # поясок: стык корпуса и хвоста, две канавки
CONE = [(1440.0, 94.5), (1480.0, 90.0), (1560.0, 80.0), (1640.0, 69.5), (1682.0, 63.5), (1685.0, 60.5), (1688.0, 62.5), (1890.0, 33.0)]   # хвостовой конус, стык на нём у начала перьев
TAIL = [(1893.0, 26.0), (1895.0, 24.5), (1950.0, 23.5), (1952.0, 22.5), (1954.0, 23.2), (1959.0, 21.5), (1962.5, 17.5), (1964.0, 11.0), (1964.0, 0.8)]
HULL = OGIVE + BAND + CONE + TAIL


def R_at(x):
    if x <= HULL[0][0]: return HULL[0][1]
    for (x0, r0), (x1, r1) in zip(HULL, HULL[1:]):
        if x0 <= x <= x1 and x1 > x0: return r0 + (r1 - r0) * (x - x0) / (x1 - x0)
    return HULL[-1][1]


# ── 1. корпус одним телом: дно гнезда, плоский жёлтый торец с закруглённой кромкой, оболочка ──
base = [(112.0, 0.8, G_STEEL), (112.0, 26.5, G_STEEL), (104.5, 26.5, G_STEEL), (103.5, 28.5, G_NOSE), (103.0, 34.0, G_NOSE), (103.0, 42.0, G_NOSE), (104.5, 45.6, G_NOSE)]
base += [(x, r, G_NOSE if x < X_YEL else G_BODY) for x, r in HULL]
b = B(); b.loft([circ(x, R) for x, R, m in base], [m for x, R, m in base][:-1], cap0=G_STEEL, cap1=G_BODY); body = b.finish('M82_body')
print('корпус: колец', len(base))

# ── 2. взрыватель ──
NF = 20
FUZE = [(106.0, 26.0), (103.0, 26.0), (102.0, 24.5), (100.0, 23.0), (67.0, 23.0), (66.0, 24.5), (65.5, 27.0), (63.5, 29.5), (55.0, 29.5), (52.5, 27.5), (51.0, 21.5), (48.0, 19.5), (38.0, 16.5), (37.0, 16.0),
        (36.5, 13.5), (32.0, 12.8), (29.5, 10.0), (28.0, 6.0), (28.0, 2.6)]
bz = B(); bz.loft([circ(x, R, n=NF) for x, R in FUZE], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
bz.loft([circ(28.2, 1.5, n=6), circ(20.0, 0.8, n=6)], G_STEEL, cap1=G_STEEL)                         # острие
for phi in (90.0, 270.0):                                                                             # латунные лапки у фланца: верхняя и нижняя
    er, et = axes(phi)
    rect = lambda x, r0, r1, w: [P(x, r0, -w, er, et), P(x, r1, -w, er, et), P(x, r1, w, er, et), P(x, r0, w, er, et)]
    bz.loft([rect(56.0, 26.0, 33.0, 8.0), rect(46.0, 26.0, 34.0, 8.0), rect(34.0, 28.0, 38.0, 7.0)], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
fuze = bz.finish('M82_fuze')


# ── 3. упоры и крышка горловины ──
X_LUG1, X_LUG2 = 708.0, 1002.0     # передний и задний упор (верхняя образующая): на референсе_2 299 пикс. ≈ 0,35 м между ними
LUG_OUT = [(-24.0, -5.0), (24.0, -5.0), (24.0, 2.5), (20.0, 6.0), (17.5, 18.0), (15.0, 30.0), (10.5, 36.0), (5.0, 38.0), (-5.0, 38.0), (-10.5, 36.0), (-15.0, 30.0), (-17.5, 18.0), (-20.0, 6.0), (-24.0, 2.5)]   # (w, h) над поверхностью, пикс.; ширина с референса_1
LUG_T = [(-5.0, 20.0), (3.0, 20.0), (6.0, 14.0), (13.0, 10.0), (38.0, 8.5)]                           # половина толщины вдоль оси на высоте h (силуэт упора на референсе_2)
HOLE = (0.0, 15.0)                                                                                     # центр отверстия (w, h)
HOLE_RW, HOLE_RH = 8.5, 9.5                                                                            # полуоси отверстия


def lug_t(h):
    if h <= LUG_T[0][0]: return LUG_T[0][1]
    for (h0, t0), (h1, t1) in zip(LUG_T, LUG_T[1:]):
        if h <= h1: return t0 + (t1 - t0) * (h - h0) / (h1 - h0)
    return LUG_T[-1][1]


def lug(bb, xc, n=20):
    """Арка поперёк оси: контур и отверстие - одна полоса (тор). Отверстие сквозное вдоль оси корпуса, через него идёт тросик."""
    segs = list(zip(LUG_OUT, LUG_OUT[1:] + LUG_OUT[:1]))
    def ray(a):
        d = (math.cos(a), math.sin(a)); best = None
        for (w0, h0), (w1, h1) in segs:
            ew, eh = w1 - w0, h1 - h0; den = d[0] * eh - d[1] * ew
            if abs(den) < 1e-9: continue
            t = ((w0 - HOLE[0]) * eh - (h0 - HOLE[1]) * ew) / den; u = ((w0 - HOLE[0]) * d[1] - (h0 - HOLE[1]) * d[0]) / den
            if t > 0 and -1e-6 <= u <= 1 + 1e-6 and (best is None or t < best): best = t
        return HOLE[0] + d[0] * best, HOLE[1] + d[1] * best
    angs = [2 * math.pi * k / n for k in range(n)]
    outer = [ray(a) for a in angs]; inner = [(HOLE[0] + HOLE_RW * math.cos(a), HOLE[1] + HOLE_RH * math.sin(a)) for a in angs]
    r0 = R_at(xc)
    pt = lambda wh, s, t: Vector((wh[0] * S, Y(xc + s * t), (r0 + wh[1]) * S))
    th = 8.5
    rings = [[pt(p, 1, th) for p in inner], [pt(p, 1, lug_t(p[1])) for p in outer], [pt(p, -1, lug_t(p[1])) for p in outer], [pt(p, -1, th) for p in inner], [pt(p, 1, th) for p in inner]]
    bb.loft(rings, G_BODY)


bl = B()
lug(bl, X_LUG1); lug(bl, X_LUG2)
X_COVER, R_COVER = 766.0, 21.0                                                                         # крышка горловины ближе к переднему упору (референс_1, референс_2)
rc0 = R_at(X_COVER)
ring = lambda r, h, n=16: [Vector((r * S * math.cos(2 * math.pi * k / n), Y(X_COVER) + r * S * math.sin(2 * math.pi * k / n), (rc0 + h) * S)) for k in range(n)]
bl.loft([ring(R_COVER + 1.0, -3.0), ring(R_COVER, 3.5), ring(R_COVER - 2.0, 5.0)], G_BODY, cap1=G_BODY)
lugs = bl.finish('M82_lugs')

# ── 4. оперение: четыре неподвижных пера крестом × к упорам (не задевают пилон) ──
FIN_T = 2.2                         # половина толщины листа, пикс. (≈ 5 мм всего)
R_FIN = 167.0                        # вылет от оси (на референсе_2 верхнее 114, нижнее 122 пикс. при 45°)
FIN = [(1697.0, 57.0), (1814.0, R_FIN), (1933.0, R_FIN), (1890.0, 29.0)]                               # корень у передней кромки, кончик спереди, кончик сзади, корень сзади (корень утоплен в конус)
FIN_IN = [(1710.0, 57.0), (1817.5, R_FIN - 4.0), (1926.0, R_FIN - 4.0), (1881.0, 29.0)]                # внутренний контур: там начинается скос кромки
bf = B()
for phi in (45.0, 135.0, 225.0, 315.0):
    er, et = axes(phi)
    face = lambda pts, w: [P(x, r, w, er, et) for x, r in pts]
    bf.loft([face(FIN_IN, FIN_T), face(FIN, 0.0), face(FIN_IN, -FIN_T)], G_BODY, cap0=G_BODY, cap1=G_BODY)   # кромка ножом: узкая полоса в атласе запекалась чёрной
fins = bf.finish('M82_fins', sharp_deg=25)

# ── 5. тросик: натянут от заднего упора через передний поверх корпуса к верхней лапке взрывателя ──
R_WIRE = float(os.environ.get('M82_WIRE', '1.7'))    # радиус, пикс. (≈ 2 мм): в игре издали должен читаться, не мерцать
H_THRU = 13.0                                        # высота прохода через отверстие упора над поверхностью
CLEAR = R_WIRE + 0.6                                 # зазор над поверхностью: не тонет в корпусе
X_WIRE_END, R_WIRE_END = 37.0, 36.0                  # конец у верхней лапки
pts = [(X_WIRE_END, R_WIRE_END)]
surf = [(x, (R_at(x) if x >= 108 else 47.0) + CLEAR) for x in [103.0, 108.0] + [float(v) for v in range(120, int(X_LUG1), 12)]]
start = (X_LUG1, R_at(X_LUG1) + H_THRU)
cand = pts + surf + [start]
hull = []                                            # верхняя выпуклая оболочка: путь натянутой нити
for p in cand:
    while len(hull) >= 2 and (hull[-1][0] - hull[-2][0]) * (p[1] - hull[-2][1]) - (hull[-1][1] - hull[-2][1]) * (p[0] - hull[-2][0]) >= 0: hull.pop()
    hull.append(p)
path = hull
rear = [(X_LUG1 + 90.0, R_at(X_LUG1) + H_THRU - 0.3), (X_LUG2 - 40.0, R_at(X_LUG2) + H_THRU + 1.0), (X_LUG2, R_at(X_LUG2) + H_THRU), (X_LUG2 + 22.0, R_at(X_LUG2 + 22.0) + 4.0)]   # за передним упором почти прямо к заднему, хвостик за задним упором
path = path + rear
print('тросик: точек', len(path), 'концы', path[0], path[-1])


def tube_ring(i, pth, r, n=6, wx=0.0):
    x, h = pth[i]
    a = pth[max(i - 1, 0)]; c = pth[min(i + 1, len(pth) - 1)]
    tx, th = c[0] - a[0], c[1] - a[1]; ln = math.hypot(tx, th) or 1.0; tx, th = tx / ln, th / ln
    nx, nh = -th, tx
    return [Vector(((wx + r * math.cos(2 * math.pi * k / n)) * S, Y(x + nx * r * math.sin(2 * math.pi * k / n)), (h + nh * r * math.sin(2 * math.pi * k / n)) * S)) for k in range(n)]


bw = B()
bw.loft([tube_ring(i, path, R_WIRE) for i in range(len(path))], G_WIRE, cap0=G_WIRE, cap1=G_WIRE)
# обжимная втулка на тросике между упорами
X_SL0, X_SL1 = 915.0, 955.0
h_wire_at = lambda x: rear[0][1] + (rear[1][1] - rear[0][1]) * (x - rear[0][0]) / (rear[1][0] - rear[0][0])
sleeve = [(X_SL0 - 1.5, 2.0), (X_SL0, 3.6), (X_SL1, 3.6), (X_SL1 + 1.5, 2.0)]
bw.loft([[Vector((r * S * math.cos(2 * math.pi * k / 8), Y(x), (h_wire_at(x) + r * math.sin(2 * math.pi * k / 8)) * S)) for k in range(8)] for x, r in sleeve], G_WIRE, cap0=G_WIRE, cap1=G_WIRE)


def torus(bb, c, rx, rz, tilt_deg, r, n=14, m=4):
    """Кольцо: центр c (x пикс., w пикс., h пикс.), полуоси rx вдоль оси корпуса и rz поперёк, наклон плоскости вокруг оси корпуса."""
    tl = math.radians(tilt_deg)
    rings = []
    for i in range(n + 1):
        a = 2 * math.pi * i / n
        px, pw = rx * math.cos(a), rz * math.sin(a)
        ring_ = []
        for k in range(m):
            b_ = 2 * math.pi * k / m
            # по радиусу сечения - в плоскости кольца, по второй оси сечения - вдоль нормали плоскости
            dr = r * math.cos(b_); dn = r * math.sin(b_)
            ca, sa = math.cos(a), math.sin(a)
            qx = px + ca * dr; qw = pw + sa * dr
            w_ = qw * math.cos(tl) - dn * math.sin(tl); h_ = qw * math.sin(tl) + dn * math.cos(tl)
            ring_.append(Vector(((c[1] + w_) * S, Y(c[0] + qx), (c[2] + h_) * S)))
        rings.append(ring_)
    bb.loft(rings, G_WIRE)


# кольцо на тросике и серьга под ним (референс_1: кольцо стоит на тросике, серьга лежит на борту к зрителю)
X_RING = 884.0
h_ring = h_wire_at(X_RING)
torus(bw, (X_RING, -11.0, h_ring - 4.0), 13.0, 13.0, 25.0, 1.4, n=18)
r_top = R_at(X_RING + 2.0)
torus(bw, (X_RING + 2.0, -33.0, r_top - 2.0), 5.5, 9.0, 18.0, 1.3, n=12, m=4)
wire = bw.finish('M82_wire', sharp_deg=60)

mk.GEO = dict(X_YEL=X_YEL, R_FIN=R_FIN, RB=RB, FIN_T=FIN_T, X_COVER=X_COVER, R_COVER=R_COVER, X_BAND=1392.0, X_HATCH=(1535.0, 1590.0), NSEG=NSEG, R_WIRE=R_WIRE)
mk.stats()
print('сцена MK82 построена')
