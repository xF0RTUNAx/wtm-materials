# build.py — Flakpanzer Gepard («Гепард»): своя модель по картинкам Mark, версия 2 (подробная).
# Картинки (в этой папке): 1-чертёж-4-вида.webp — бок, сверху, спереди, сзади (нос слева); 2-инфографика-размеры.webp — длина с пушками 7,68 м и вид
# в трёх четвертях (формы короба орудий, кожуха антенны, дульного тормоза); 3-схема-компоновки.png — названия узлов.
# Для замеров — кадры чертежей: чертежи/side.png (бок, кадр (16,0)–(1056,548) исходной картинки), top.png ((16,586)–(1056,1050)),
# front.png ((1100,0)–(1560,540), стёрты соседние гусеницы), rear.png ((1100,486)–(1560,1030)).
# Все числа ниже — пиксели этих кадров (u — вдоль машины на виде сбоку, v — вниз; w — вниз на виде сверху), метры — одним множителем S.
#
# Оси: метры, нос +Y (в glTF уйдёт в −Z), вверх +Z, начало — на земле, посередине общей длины (с пушками); земля z = 0.
# Части для игры — по ПЕРВОМУ слову имени объекта: body_* (корпус и ходовая, неподвижны), turret_* (башня — поворот вокруг вертикали),
# cradle_* (стволы вместе с орудийными коробами — качаются по углу места вокруг оси ZGUN на YH), radar_* (антенна обзора — крутится).
# Каждая деталь — отдельный замкнутый кусок; check_pieces() после сборки проверяет, что ни один кусок не висит в воздухе (не касается остальных своей группы).
# Антенна обзора (radar_*) — вся чёрная (Mark). Сделано: корпус (носовые крылья-щитки с рёбрами, лобовой лист с фарами и крюками, люк механика, борта с рейками и рёбрами, наклонные листы с жалюзи и
# решётками, кормовой отсек с решёткой, кормовой лист с овальными лючками), гусеницы (звенья со штифтами), 7 катков с дисками, болтами и рычагами,
# направляющее и ведущее колёса, башня (центральный корпус со скосами, кожух антенны сопровождения — шар с кольцами и кронштейнами, кормовой короб,
# неподвижные части коробов, люки, перископы, дужки, дымовые гранатомёты 2×4 на рейках), орудийные короба с гранями (качаются со стволами),
# стволы с рубашкой, хомутами и дульными тормозами-клетками, антенна обзора (двояко изогнутый рефлектор, вилка, мачта, привод, «флажок» на кронштейне),
# штыревые антенны, зеркало. Пропущено: номера и таблички, надписи, внутренности.
import sys, importlib, math
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
import bpy, bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import modelkit as mk
importlib.reload(mk)

S = 7.68 / 998.0       # м на пиксель: 998 пикс. (срез стволов … корма на виде сбоку) = 7,68 м с пушками
G = 530.0              # земля на виде сбоку (строка v)
X0 = 519.0             # середина общей длины на виде сбоку (столбец u)
WT = 231.5             # ось машины на виде сверху (строка w); вверх на картинке — правый борт (+X)

PFX = 'GEP'
M_BODY, M_DARK, M_STEEL, M_GLASS = 0, 1, 2, 3
mk.configure('GEPARD', S, x0=X0, yc=G, rb=1.0, nseg=24, nose='left')
mk.set_materials([(f'{PFX}_body', (0.086, 0.114, 0.050)),      # оливковый Бундесвера (зелёнее: игра кладёт камуфляж на зелёную краску текстуры)
                  (f'{PFX}_dark', (0.034, 0.035, 0.032)),      # гусеницы, резина, жалюзи, тёмные проёмы
                  (f'{PFX}_steel', (0.11, 0.115, 0.11)),       # стволы, диски катков, металл
                  (f'{PFX}_glass', (0.16, 0.2, 0.22))])        # стёкла, линзы
_RGB = [(0.086, 0.114, 0.050), (0.034, 0.035, 0.032), (0.11, 0.115, 0.11), (0.16, 0.2, 0.22)]
for _m, _c, (_r, _mt) in zip(mk.MATS, _RGB, ((0.93, 0.0), (0.95, 0.0), (0.62, 0.3), (0.3, 0.0))):      # матовая краска без блеска (для Blender и Sketchfab; игра берёт только цвет)
    for _n in list(_m.node_tree.nodes):                          # повторная сборка: убрать узлы текстуры прошлого запекания
        if _n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): _m.node_tree.nodes.remove(_n)
    _b = next(n for n in _m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for _l in list(_b.inputs['Base Color'].links): _m.node_tree.links.remove(_l)
    _b.inputs['Base Color'].default_value = (*_c, 1.0)
    _b.inputs['Roughness'].default_value = _r; _b.inputs['Metallic'].default_value = _mt
    try: _b.inputs['Specular IOR Level'].default_value = 0.15
    except Exception: pass


def V(x, y, z): return Vector((x, y, z))
def Yp(u): return mk.Y(u)                     # столбец вида сбоку → Y, м (нос слева → +Y)
def Zp(v): return (G - v) * S                 # строка вида сбоку → высота, м
def Xt(w): return (WT - w) * S                # строка вида сверху → X, м


# ───────────── контроль «ничего не висит» ─────────────
class Bld(mk.B):
    """Построитель объекта с учётом кусков: каждый кусок — диапазон вершин и граней; check_pieces() ищет куски, не касающиеся остальных."""
    def __init__(self, name):
        super().__init__(); self.name = name; self.pieces = []; self._m = (0, 0)
    def begin(self): self._m = (len(self.bm.verts), len(self.bm.faces))
    def end(self, tag): self.pieces.append((tag, self._m[0], len(self.bm.verts), self._m[1], len(self.bm.faces)))


def piece(fn):
    def w(b, *a, tag=None, **k):
        b.begin(); r = fn(b, *a, **k); b.end(tag or fn.__name__); return r
    w.__name__ = fn.__name__
    return w


def check_group(bls, tol=0.006, verbose=True):
    """Союз-поиск по кускам всех объектов группы (body_*, turret_*, …): куски соединены, если их поверхности пересекаются или ближе tol, м.
    Возвращает список «висящих» связок (не вошедших в главную)."""
    items = []
    for b in bls:
        bm = b.bm; bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table(); bm.verts.index_update()
        for tag, v0, v1, f0, f1 in b.pieces:
            co = [bm.verts[i].co.copy() for i in range(v0, v1)]
            polys = [[v.index - v0 for v in bm.faces[j].verts] for j in range(f0, f1)]
            items.append((f'{b.name}:{tag}', co, polys))
    n = len(items)
    if n < 2: return []
    trees, boxes = [], []
    for name, co, polys in items:
        trees.append(BVHTree.FromPolygons(co, polys, epsilon=0.0))
        boxes.append((Vector((min(c.x for c in co), min(c.y for c in co), min(c.z for c in co))), Vector((max(c.x for c in co), max(c.y for c in co), max(c.z for c in co)))))
    par = list(range(n))
    def find(i):
        while par[i] != i: par[i] = par[par[i]]; i = par[i]
        return i
    for i in range(n):
        for j in range(i + 1, n):
            if find(i) == find(j): continue
            a, c = boxes[i], boxes[j]
            if any(a[0][k] > c[1][k] + tol or c[0][k] > a[1][k] + tol for k in range(3)): continue
            hit = bool(trees[i].overlap(trees[j]))
            if not hit:
                small = i if len(items[i][1]) <= len(items[j][1]) else j; other = j if small == i else i
                for p in items[small][1]:
                    r = trees[other].find_nearest(p)
                    if r[0] is not None and r[3] <= tol: hit = True; break
            if hit: par[find(i)] = find(j)
    groups = {}
    for i in range(n): groups.setdefault(find(i), []).append(i)
    main = max(groups.values(), key=lambda g: sum(len(items[i][1]) for i in g))
    lone = [g for g in groups.values() if g is not main]
    if verbose:
        for g in lone:
            tags = ', '.join(sorted({items[i][0] for i in g}))
            mn = Vector([min(boxes[i][0][k] for i in g) for k in range(3)]); mx = Vector([max(boxes[i][1][k] for i in g) for k in range(3)])
            print(f'  ВИСИТ: {tags}  y {mn.y:.2f}…{mx.y:.2f} z {mn.z:.2f}…{mx.z:.2f} x {mn.x:.2f}…{mx.x:.2f}')
    return lone


# ───────────── кирпичи ─────────────
def rect(h, z0, z1): return [(-h, z0), (h, z0), (h, z1), (-h, z1)]


def crect(x0, x1, z0, z1, c=(0.02, 0.02, 0.02, 0.02)):
    """Прямоугольник со срезанными углами (8 точек): c — срезы (низ-лево, низ-право, верх-право, верх-лево)."""
    bl, br, tr, tl = c
    return [(x0 + bl, z0), (x1 - br, z0), (x1, z0 + br), (x1, z1 - tr), (x1 - tr, z1), (x0 + tl, z1), (x0, z1 - tl), (x0, z0 + bl)]


def ring_xz(y, pts): return [V(x, y, z) for x, z in pts]


@piece
def sweep(b, stations, mat, caps=True):
    """Станции [(Y, [(x, z), …])] — кольца одинаковой длины; призма вдоль оси Y между ними, с торцами."""
    c0 = mat if not isinstance(mat, (list, tuple)) else mat[0]; c1 = mat if not isinstance(mat, (list, tuple)) else mat[-1]
    b.loft([ring_xz(y, p) for y, p in stations], mat, cap0=c0 if caps else None, cap1=c1 if caps else None)


@piece
def loft_z(b, stations, mat):
    """Станции [(z, [(x, y), …])] — кольца в горизонтальных плоскостях (вид сверху), призма вверх."""
    b.loft([[V(x, y, z) for x, y in pts] for z, pts in stations], mat, cap0=mat, cap1=mat)


@piece
def box(b, x0, x1, y0, y1, z0, z1, mat):
    r = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
    b.loft([ring_xz(y0, r), ring_xz(y1, r)], mat, cap0=mat, cap1=mat)


@piece
def cbox(b, x0, x1, y0, y1, z0, z1, mat, c=0.02):
    """Брусок со срезанными рёбрами (фаска c) — кольца-восьмиугольники."""
    c = min(c, (x1 - x0) / 2.4, (z1 - z0) / 2.4, abs(y1 - y0) / 2.4)
    full = crect(x0, x1, z0, z1, (c,) * 4); sh = crect(x0 + c, x1 - c, z0 + c, z1 - c, (c * 0.4,) * 4)
    ya, yb = (y0, y1) if y0 < y1 else (y1, y0)
    b.loft([ring_xz(ya, sh), ring_xz(ya + c, full), ring_xz(yb - c, full), ring_xz(yb, sh)], mat, cap0=mat, cap1=mat)


@piece
def prism_x(b, poly_uv, x0, x1, mat):
    """Контур вида сбоку (u, v) — призма поперёк машины от X=x0 до X=x1."""
    r0 = [V(x0, Yp(u), Zp(v)) for u, v in poly_uv]; r1 = [V(x1, Yp(u), Zp(v)) for u, v in poly_uv]
    b.loft([r0, r1], mat, cap0=mat, cap1=mat)


def _basis(d):
    h = V(0, 0, 1) if abs(d.z) < 0.9 else V(1, 0, 0)
    u = d.cross(h).normalized(); w = d.cross(u)
    return u, w


@piece
def cyl(b, p0, p1, r0, r1, mat, n=12, caps=(True, True), sq=1.0, a0=0.0):
    """Цилиндр / усечённый конус по любой оси от p0 до p1; sq — сплющивание по второй оси сечения."""
    a, c = Vector(p0), Vector(p1); d = (c - a).normalized(); u, w = _basis(d)
    ang = [a0 + 2 * math.pi * k / n for k in range(n)]
    b.loft([[a + u * (r0 * math.cos(t)) + w * (r0 * sq * math.sin(t)) for t in ang], [c + u * (r1 * math.cos(t)) + w * (r1 * sq * math.sin(t)) for t in ang]],
           mat, cap0=mat if caps[0] else None, cap1=mat if caps[1] else None)


@piece
def tube(b, p0, p1, ro, ri, mat, n=10, sq=1.0, sqi=None):
    """Полое кольцо (труба с торцами-кольцами); sq — сплющивание внешнего контура, sqi — внутреннего (по умолчанию то же)."""
    a, c = Vector(p0), Vector(p1); d = (c - a).normalized(); u, w = _basis(d); bm = b.bm
    ang = [2 * math.pi * k / n for k in range(n)]
    P = lambda o, r, t: o + u * (r * math.cos(t)) + w * (r * sq * math.sin(t))
    Pi = lambda o, r, t: o + u * (r * math.cos(t)) + w * (r * (sq if sqi is None else sqi) * math.sin(t))
    O0 = [bm.verts.new(P(a, ro, t)) for t in ang]; O1 = [bm.verts.new(P(c, ro, t)) for t in ang]
    I0 = [bm.verts.new(Pi(a, ri, t)) for t in ang]; I1 = [bm.verts.new(Pi(c, ri, t)) for t in ang]
    for i in range(n):
        j = (i + 1) % n
        for quad in ((O0[i], O0[j], O1[j], O1[i]), (I0[i], I1[i], I1[j], I0[j]), (O0[i], I0[i], I0[j], O0[j]), (O1[i], O1[j], I1[j], I1[i])):
            bm.faces.new(quad).material_index = mat


@piece
def obox(b, c, t, n, hx, ht, lo, hi, mat):
    """Брусок: центр c, вдоль пути t, наружу n (единичные, в плоскости YZ), поперёк X на ±hx, по t на ±ht, по n от lo до hi."""
    X = V(1, 0, 0)
    ring = lambda s: [c + t * (s * ht) + X * (sx * hx) + n * h for sx, h in ((-1, lo), (1, lo), (1, hi), (-1, hi))]
    b.loft([ring(-1), ring(1)], mat, cap0=mat, cap1=mat)


@piece
def band(b, poly, thick, x0, x1, mat):
    """Полое кольцо (гусеница): контур poly — [(Y, Z)] в метрах по кругу, толщина thick внутрь, ширина от X=x0 до X=x1."""
    n = len(poly); cx = sum(p[0] for p in poly) / n; cz = sum(p[1] for p in poly) / n
    inner = []
    for i in range(n):
        p, q, r = Vector(poly[i - 1]), Vector(poly[i]), Vector(poly[(i + 1) % n])
        def nin(a, c):
            e = (c - a).normalized(); m = Vector((-e.y, e.x))
            return m if (Vector((cx, cz)) - a).dot(m) > 0 else -m
        n1, n2 = nin(p, q), nin(q, r)
        k = 1.0 + n1.dot(n2); off = (n1 + n2) * (thick / max(k, 0.3))
        inner.append(q + off)
    bm = b.bm
    O0 = [bm.verts.new(V(x0, p[0], p[1])) for p in poly]; O1 = [bm.verts.new(V(x1, p[0], p[1])) for p in poly]
    I0 = [bm.verts.new(V(x0, p.x, p.y)) for p in inner]; I1 = [bm.verts.new(V(x1, p.x, p.y)) for p in inner]
    for i in range(n):
        j = (i + 1) % n
        for quad in ((O0[i], O0[j], O1[j], O1[i]), (I0[i], I1[i], I1[j], I0[j]), (O0[i], I0[i], I0[j], O0[j]), (O1[i], O1[j], I1[j], I1[i])):
            bm.faces.new(quad).material_index = mat


@piece
def dish2(b, cx, hw, zc, hh, ub, ut, psag, mat, nx=13, nz=11):
    """Чаша по профилю вида сбоку: ub(sz) — столбец тыла (пикс.), ut — толщина (пикс.); psag(sz) — загиб краёв вперёд в плане (пикс.), sz от −1 (верх) до +1 (низ)."""
    bm = b.bm; Fr, Bk = [], []
    for i in range(nx):
        sx = -1 + 2 * i / (nx - 1); rf, rk = [], []
        for j in range(nz):
            sz = -1 + 2 * j / (nz - 1); u0 = ub(sz) - psag(sz) * sx * sx
            rk.append(bm.verts.new(V(cx + hw * sx, Yp(u0), zc - hh * sz))); rf.append(bm.verts.new(V(cx + hw * sx, Yp(u0 - ut), zc - hh * sz)))
        Fr.append(rf); Bk.append(rk)
    for i in range(nx - 1):
        for j in range(nz - 1):
            bm.faces.new((Fr[i][j], Fr[i + 1][j], Fr[i + 1][j + 1], Fr[i][j + 1])).material_index = mat
            bm.faces.new((Bk[i][j], Bk[i][j + 1], Bk[i + 1][j + 1], Bk[i + 1][j])).material_index = mat
    for i in range(nx - 1):
        bm.faces.new((Fr[i][0], Bk[i][0], Bk[i + 1][0], Fr[i + 1][0])).material_index = mat
        bm.faces.new((Fr[i][nz - 1], Fr[i + 1][nz - 1], Bk[i + 1][nz - 1], Bk[i][nz - 1])).material_index = mat
    for j in range(nz - 1):
        bm.faces.new((Fr[0][j], Fr[0][j + 1], Bk[0][j + 1], Bk[0][j])).material_index = mat
        bm.faces.new((Fr[nx - 1][j], Bk[nx - 1][j], Bk[nx - 1][j + 1], Fr[nx - 1][j + 1])).material_index = mat


BOLTS = []            # (объект, метка, центр шляпки, наружу) — для проверки «болты не утонули в стенке» (check_bolts)


def bolt_circle(b, c, nrm, rad, count, r, h, mat, n=5, a0=0.0, tag='bolt'):
    """Болты по окружности радиуса rad вокруг центра c в плоскости, перпендикулярной nrm (единичный); высота головки h."""
    nrm = Vector(nrm).normalized(); u, w = _basis(nrm)
    for k in range(count):
        t = a0 + 2 * math.pi * k / count; p = Vector(c) + u * (rad * math.cos(t)) + w * (rad * math.sin(t))
        cyl(b, p - nrm * 0.004, p + nrm * h, r, r * 0.85, mat, n=n, tag=tag)
        BOLTS.append((b.name, tag, p + nrm * h, nrm.copy(), r))


def glacis_z(u): return float(np.interp(u, [112, 126, 150, 178, 205, 222], [1.00, 1.10, 1.26, 1.42, 1.545, 1.585]))


# ───────────── корпус (body_hull, body_slopes, body_misc) ─────────────
ZB, ZS0, ZK, ZT, ZR = 0.46, 0.73, 1.33, 1.585, 1.765     # днище, низ скулы, верх скулы (начало наклона), палуба впереди, палуба над двигателем
WB, WS, WD = 1.00, 1.60, 1.38                              # днище между гусеницами, скула (борт над гусеницей), палуба
TRK_C, TRK_W = 1.30, 0.585                                 # ось и ширина гусеницы


def octa(wb, ws, wd, zb, zs0, zk, zt):
    return [(-wb, zb), (wb, zb), (wb, zs0), (ws, zs0), (ws, zk), (wd, zt), (-wd, zt), (-ws, zk), (-ws, zs0), (-wb, zs0)]


def build_hull():
    b = Bld('body_hull')
    # лобовая часть: передний лист (низ) и наклонный лист вверх до палубы (u 112 → 222)
    sweep(b, [(Yp(112), rect(1.0, 0.97, 1.00)), (Yp(122), rect(1.01, 0.80, 1.07)), (Yp(138), rect(1.04, ZB, 1.16)), (Yp(150), rect(1.08, ZB, 1.26)), (Yp(178), rect(1.15, ZB, 1.42)), (Yp(205), rect(1.28, ZB, 1.545)), (Yp(222), rect(WD, ZB, ZT))], M_BODY, tag='glacis')
    oc = octa(WB, WS, WD, ZB, ZS0, ZK, ZT)
    sweep(b, [(Yp(222), oc), (Yp(773), oc)], M_BODY, tag='mid')
    # кормовой отсек двигателя: выше палубы, наклонные листы с жалюзи уже (u 773 → 902)
    oc2 = octa(WB, WS, 1.15, ZB, ZS0, 1.31, ZR)
    sweep(b, [(Yp(773), oc2), (Yp(902), oc2)], M_BODY, tag='engine')
    # хвост между гусеницами: верх, наклонный задний лист и нижний лист вперёд-вниз до днища (бок: (902,302)(1017,306)(1010,350)(1000,372)(902,470))
    prism_x(b, [(902, 302), (1017, 306), (1010, 350), (1000, 372), (902, 470)], -WB, WB, M_BODY, tag='tail')
    # борта хвоста: наклонные листы жалюзи до u 940, дальше — крылья хвоста с наклонным верхом
    for s_ in (1, -1):
        w5 = [(WB * s_, ZS0), (WS * s_, ZS0), (WS * s_, 1.31), (1.15 * s_, ZR), (WB * s_, ZR)]
        sweep(b, [(Yp(902), w5), (Yp(940), w5)], M_BODY, tag='tailside')
        w6 = [(WB * s_, 1.23), (WS * s_, 1.23), (WS * s_, 1.31), (1.15 * s_, ZR - 0.02), (WB * s_, ZR - 0.02)]
        sweep(b, [(Yp(940), w6), (Yp(1012), w6)], M_BODY, tag='tailwing')
    # носовые крылья-щитки над гусеницами (бок: клювом вперёд и вниз) и борт перед наклонными листами (u 178 → 222)
    wing = [(100, 391), (103, 380), (110, 373), (120, 367), (130, 363), (140, 360), (150, 358), (165, 357), (178, 358), (178, 428), (160, 419), (140, 410), (120, 400)]
    for xa, xb in ((WB, WS), (-WS, -WB)):
        prism_x(b, wing, xa, xb, M_BODY, tag='wing')
        box(b, xa, xb, Yp(222), Yp(178), ZS0, ZK, M_BODY, tag='sidefront')
    # палуба позади люков башни чуть выше (зазор под кормой башни)
    box(b, -0.95, 0.95, Yp(773), Yp(660), ZT - 0.02, 1.70, M_BODY, tag='deckrise')

    # ── детали лобовой части ──
    for s_ in (1, -1):
        # фары на лобовом листе: корпус-коробка и линза; буксирные крюки на переднем листе
        u = 165; zg = glacis_z(u)
        cbox(b, s_ * 0.72 - 0.11, s_ * 0.72 + 0.11, Yp(u + 4), Yp(u - 10), zg - 0.03, zg + 0.11, M_STEEL, c=0.025, tag='lamp')
        cyl(b, V(s_ * 0.72, Yp(u - 9), zg + 0.04), V(s_ * 0.72, Yp(u - 12), zg + 0.04), 0.06, 0.056, M_GLASS, n=14, tag='lens')
        box(b, s_ * 0.55 - 0.035, s_ * 0.55 + 0.035, Yp(112) - 0.08, Yp(112) + 0.05, 0.70, 0.84, M_STEEL, tag='hook')
        # отверстия в носовых щитках (четыре тёмных диска на верхней кромке)
        for xx in (1.50, 1.35, 1.20, 1.05):
            cyl(b, V(s_ * xx, Yp(137), Zp(362) - 0.004), V(s_ * xx, Yp(137), Zp(362) + 0.012), 0.032, 0.032, M_DARK, n=10, tag='flaphole')
        # рёбра жёсткости на носовых щитках (поперечные накладки вдоль кромки)
        for uu in (118, 150, 164):
            zz = Zp(float(np.interp(uu, [100, 103, 110, 120, 130, 140, 150, 165, 178], [391, 380, 373, 367, 363, 360, 358, 357, 358])))
            box(b, min(s_ * 1.05, s_ * 1.58), max(s_ * 1.05, s_ * 1.58), Yp(uu) - 0.012, Yp(uu) + 0.012, zz - 0.006, zz + 0.012, M_BODY, tag='flaprib')
    # блоки наблюдения на лобовом листе (две по две), продольные рёбра на носовых щитках, ребро поперёк переднего листа
    for (xx, uu) in ((-0.30, 192), (-0.10, 192), (0.10, 192), (0.30, 192), (-0.30, 178), (-0.10, 178), (0.10, 178), (0.30, 178)):
        zg_ = glacis_z(uu)
        cbox(b, xx - 0.06, xx + 0.06, Yp(uu + 5), Yp(uu - 5), zg_ - 0.02, zg_ + 0.05, M_DARK, c=0.012, tag='visionblock')
    for s_ in (1, -1):
        for xx in (1.12, 1.30, 1.48):
            top = [(100, 391), (103, 380), (110, 373), (120, 367), (130, 363), (140, 360), (150, 358), (165, 357), (176, 358)]
            poly = [(u, v - 1.5) for u, v in top] + [(u, v + 3.0) for u, v in reversed(top)]
            prism_x(b, poly, min(s_ * xx, s_ * xx + s_ * 0.025), max(s_ * xx, s_ * xx + s_ * 0.025), M_BODY, tag='flaplong')
    box(b, -0.95, 0.95, Yp(112) - 0.02, Yp(112) + 0.05, 0.70, 0.76, M_STEEL, tag='frontbar')
    # ряд перископов на передней кромке палубы (справа) и люк механика-водителя (слева)
    for k in range(4):
        cbox(b, 0.30 + 0.14 * k, 0.40 + 0.14 * k, Yp(228) - 0.02, Yp(228) + 0.03, ZT - 0.03, ZT + 0.06, M_DARK, c=0.012, tag='periscope')
    cyl(b, V(-0.76, Yp(226), ZT - 0.01), V(-0.76, Yp(226), ZT + 0.07), 0.22, 0.2, M_BODY, n=16, tag='hatchring')
    cyl(b, V(-0.76, Yp(226), ZT + 0.07), V(-0.76, Yp(226), ZT + 0.095), 0.17, 0.16, M_STEEL, n=14, tag='hatchlid')
    for k in range(3):
        xk = -0.76 - 0.09 + 0.09 * k
        cbox(b, xk - 0.03, xk + 0.03, Yp(226) + 0.155, Yp(226) + 0.215, ZT + 0.03, ZT + 0.09, M_DARK, c=0.008, tag='drvperi')
    # ── борта: рейки и рёбра на скуловых листах ──
    for s_ in (1, -1):
        xo = s_ * (WS - 0.004)
        for zr in (1.22, 0.96):
            box(b, min(xo, xo + s_ * 0.012), max(xo, xo + s_ * 0.012), Yp(940), Yp(190), zr, zr + 0.03, M_STEEL, tag='siderail')
        for uu in (190, 340, 490, 640, 790, 935):
            box(b, min(xo, xo + s_ * 0.012), max(xo, xo + s_ * 0.012), Yp(uu) - 0.02, Yp(uu) + 0.02, 0.80, 1.29, M_BODY, tag='siderib')
    # ящики на правой кромке (укладка): три длинных
    for u0, u1 in ((332, 480), (562, 712), (738, 790)):
        cbox(b, 1.46, 1.60, Yp(u1), Yp(u0), 1.33, 1.47, M_BODY, c=0.02, tag='bin')
    # ── корма: решётка над двигателем с рамой и люком, овальные ниши на заднем листе, фонари, буксирная проушина ──
    box(b, -0.52, 0.55, Yp(930), Yp(815), ZR - 0.002, ZR + 0.014, M_DARK, tag='grille')
    for (x0_, x1_, y0_, y1_) in ((-0.55, 0.58, Yp(933), Yp(931)), (-0.55, 0.58, Yp(814), Yp(812)), (-0.55, -0.53, Yp(933), Yp(812)), (0.56, 0.58, Yp(933), Yp(812))):
        box(b, x0_, x1_, y0_, y1_, ZR - 0.002, ZR + 0.03, M_STEEL, tag='gframe')
    cyl(b, V(0.0, Yp(862), ZR + 0.01), V(0.0, Yp(862), ZR + 0.05), 0.15, 0.14, M_STEEL, n=16, tag='gcap')
    for xx in (-0.83, -0.33, 0.30, 0.75):               # четыре овальные ниши на нижнем заднем листе (плоскость 45°: нормаль назад-вниз)
        pc = V(xx, Yp(993), Zp(378)); nrm = V(0, -0.7071, -0.7071)
        cyl(b, pc - nrm * 0.004, pc + nrm * 0.012, 0.1, 0.1, M_DARK, n=12, sq=0.7, tag='ovalrear')
    for s_ in (1, -1):
        cyl(b, V(s_ * 0.9, Yp(1002), Zp(366)), V(s_ * 0.9, Yp(1002) - 0.035, Zp(366)), 0.045, 0.045, M_DARK, n=10, tag='rearlamp')
    box(b, -0.07, 0.07, Yp(965) - 0.03, Yp(965) + 0.04, Zp(423), Zp(398), M_STEEL, tag='towshackle')
    for xl in (0.82, -0.82): box(b, xl - 0.05, xl + 0.05, Yp(1006), Yp(996), Zp(412), Zp(366), M_DARK, tag='towlug')
    return b


# ───────────── наклонные листы: жалюзи и решётки (body_slopes) ─────────────
def slope_strip(b, s_, p0, p1, t0, t1, y0, y1, lift, mat, tag):
    """Тонкая накладка на наклонном листе: от точки p0 к p1 (X, Z; для правого борта), доли t0…t1 вдоль листа, по длине Y от y0 до y1; s_ = ±1 — борт."""
    d = V(p1[0] - p0[0], 0, p1[1] - p0[1]); L = d.length; d /= L
    n = V(abs(d.z), 0, abs(d.x))                                      # наружу и вверх (для правого борта)
    a = V(p0[0], 0, p0[1]) + d * (t0 * L) - n * 0.004; c = V(p0[0], 0, p0[1]) + d * (t1 * L) - n * 0.004
    ring = [(s_ * q.x, q.z) for q in (a, c, c + n * (lift + 0.004), a + n * (lift + 0.004))]
    sweep(b, [(y0, ring), (y1, ring)], mat, tag=tag)


def build_slopes():
    b = Bld('body_slopes')
    for s_ in (1, -1):        # жалюзи над двигателем: 8 полос на каждом наклонном листе кормового отсека (u 806 → 938) и рама вокруг
        for k in range(8):
            t = 0.08 + 0.105 * k
            slope_strip(b, s_, (1.15, ZR), (WS, 1.31), t, t + 0.05, Yp(806), Yp(938), 0.010, M_DARK, 'louvre')
        slope_strip(b, s_, (1.15, ZR), (WS, 1.31), 0.03, 1.0, Yp(940), Yp(936), 0.014, M_BODY, 'louvframe')
        slope_strip(b, s_, (1.15, ZR), (WS, 1.31), 0.03, 1.0, Yp(808), Yp(804), 0.014, M_BODY, 'louvframe')
    for u0, u1 in ((292, 372), (384, 520), (532, 665), (677, 770)):     # сетчатые решётки на левом наклонном листе перед башней
        slope_strip(b, -1, (WD, ZT), (WS, ZK), 0.10, 0.90, Yp(u0), Yp(u1), 0.012, M_DARK, 'mesh')
        slope_strip(b, -1, (WD, ZT), (WS, ZK), 0.06, 0.94, Yp(u0) + 0.008, Yp(u0) - 0.008, 0.018, M_STEEL, 'meshframe')
        slope_strip(b, -1, (WD, ZT), (WS, ZK), 0.06, 0.94, Yp(u1) + 0.008, Yp(u1) - 0.008, 0.018, M_STEEL, 'meshframe')
    return b


# ───────────── ходовая (body_run): гусеницы, катки, колёса ─────────────
TRACK = [(256, 530), (790, 530), (820, 523), (860, 504), (900, 482), (924, 465), (938, 452), (946, 438), (940, 418), (922, 403), (900, 399),
         (180, 399), (140, 400), (125, 407), (118, 421), (118, 437), (125, 449), (128, 462), (144, 477), (176, 495), (208, 509), (240, 526)]
WHEEL_U = [265 + 87.17 * k for k in range(7)]
WHEEL_V, WHEEL_R = 478.8, 44.0


def road_wheel(b, s, xc, y, z):
    R = WHEEL_R * S
    cyl(b, V(xc - 0.215, y, z), V(xc + 0.215, y, z), R, R, M_DARK, n=18, tag='tire')
    cyl(b, V(xc + s * 0.19, y, z), V(xc + s * 0.226, y, z), 0.255, 0.255, M_STEEL, n=18, tag='disc')
    cyl(b, V(xc + s * 0.226, y, z), V(xc + s * 0.240, y, z), 0.255, 0.19, M_STEEL, n=18, tag='dish')
    cyl(b, V(xc + s * 0.240, y, z), V(xc + s * 0.268, y, z), 0.09, 0.07, M_STEEL, n=10, tag='hub')
    bolt_circle(b, V(xc + s * 0.240, y, z), V(s, 0, 0), 0.14, 6, 0.014, 0.014, M_DARK, n=5, a0=0.3, tag='wbolt')


def build_run():
    b = Bld('body_run')
    poly = [(Yp(u), Zp(v) + 0.02) for u, v in TRACK]            # поднят на высоту трака: низ траков — на земле
    for s in (1, -1):
        xc = s * TRK_C; x0, x1 = xc - TRK_W / 2, xc + TRK_W / 2
        band(b, poly, 0.035, x0, x1, M_DARK, tag='band')
        # центральная направляющая траков (видна между катками и перед первым): тёмная плита по оси гусеницы
        prism_x(b, [(250, 484), (820, 484), (836, 520), (262, 522)], xc - 0.045, xc + 0.045, M_DARK, tag='guide')
        prism_x(b, [(165, 468), (228, 468), (262, 500), (262, 516), (200, 498), (165, 480)], xc - 0.045, xc + 0.045, M_DARK, tag='guide')
        prism_x(b, [(826, 470), (895, 470), (895, 484), (852, 506), (826, 514)], xc - 0.045, xc + 0.045, M_DARK, tag='guide')
        # звенья: поперечная пластина и штифт на внешней кромке — по нижней ветви и наклонным участкам
        pts = [Vector(p) for p in poly]; n = len(pts); carry = 0.0; step = 0.135
        cen = Vector((sum(q.x for q in pts) / n, sum(q.y for q in pts) / n))
        for i in range(n):
            a, c = pts[i], pts[(i + 1) % n]
            if TRACK[i][1] < 410 and TRACK[(i + 1) % n][1] < 410: carry = 0.0; continue   # верхняя ветвь закрыта бортом
            L = (c - a).length; e = (c - a).normalized(); nr = Vector((e.y, -e.x))
            if (cen - a).dot(nr) > 0: nr = -nr
            t = (step - carry) if carry > 0 else step * 0.5
            while t < L:
                cc = a + e * t
                obox(b, V(xc, cc.x, cc.y), V(0, e.x, e.y), V(0, nr.x, nr.y), TRK_W / 2, 0.026, -0.004, 0.02, M_DARK, tag='link')
                obox(b, V(xc + s * (TRK_W / 2 + 0.006), cc.x, cc.y), V(0, e.x, e.y), V(0, nr.x, nr.y), 0.007, 0.022, -0.012, 0.03, M_STEEL, tag='pin')
                t += step
            carry = L - (t - step)
        # катки: резина, диск, дно с болтами, ступица; рычаги подвески между ними (круглые кожухи торсионов)
        for u in WHEEL_U: road_wheel(b, s, xc, Yp(u), Zp(WHEEL_V))
        for k in range(6):
            um = (WHEEL_U[k] + WHEEL_U[k + 1]) / 2
            cyl(b, V(xc + s * 0.19, Yp(um), Zp(452)), V(xc + s * 0.27, Yp(um), Zp(452)), 0.07, 0.062, M_STEEL, n=10, tag='armhub')
            box(b, xc + s * 0.19 - 0.03, xc + s * 0.19 + 0.03, Yp(um) - 0.05, Yp(um) + 0.05, Zp(452), 0.76, M_STEEL, tag='arm')
        # направляющее колесо (спереди): резина, диск, ступица, круг облегчающих отверстий
        yi, zi = Yp(172), Zp(447)
        cyl(b, V(xc - 0.2, yi, zi), V(xc + 0.2, yi, zi), 0.285, 0.285, M_DARK, n=18, tag='idler')
        cyl(b, V(xc + s * 0.19, yi, zi), V(xc + s * 0.225, yi, zi), 0.2, 0.2, M_STEEL, n=16, tag='idlerdisc')
        cyl(b, V(xc + s * 0.225, yi, zi), V(xc + s * 0.25, yi, zi), 0.07, 0.06, M_STEEL, n=10, tag='idlerhub')
        bolt_circle(b, V(xc + s * 0.225, yi, zi), V(s, 0, 0), 0.12, 8, 0.022, 0.012, M_DARK, n=6, tag='idlerhole')
        # ведущее колесо (сзади): диск, венец с зубьями, ступица
        ys, zs = Yp(903), Zp(438)
        cyl(b, V(xc - 0.2, ys, zs), V(xc + 0.2, ys, zs), 0.245, 0.245, M_DARK, n=18, tag='sprocket')
        cyl(b, V(xc + s * 0.19, ys, zs), V(xc + s * 0.235, ys, zs), 0.20, 0.20, M_STEEL, n=14, tag='sprdisc')
        for k in range(14):
            ta = 2 * math.pi * k / 14; rv = V(0, math.cos(ta), math.sin(ta)); tv = V(0, -rv.z, rv.y)
            obox(b, V(xc, ys + 0.26 * rv.y, zs + 0.26 * rv.z), tv, rv, 0.18, 0.03, -0.03, 0.05, M_STEEL, tag='tooth')
        cyl(b, V(xc + s * 0.235, ys, zs), V(xc + s * 0.26, ys, zs), 0.075, 0.06, M_STEEL, n=10, tag='sprhub')
    return b


# ───────────── башня (turret_*) ─────────────
ZD = ZT                      # палуба под башней
ZROOF = 2.73                 # крыша центрального корпуса башни (v ≈ 175)
ZGUN = 2.316                 # ось стволов над землёй (v ≈ 229)
XGUN = 0.858                 # стволы справа и слева от оси
YH = Yp(520)                 # ось качания стволов вместе с орудийными коробами — посередине общей длины


def hring(xi, xo, zl, zh, bo=0.07, bt=0.10, bi=0.03):
    """Сечение орудийного короба (правый борт): грани сверху, снаружи и снизу срезаны (8 точек)."""
    return [(xi, zl + bi), (xi + bi, zl), (xo - bo, zl), (xo, zl + bo), (xo, zh - bt), (xo - bt, zh), (xi + bi, zh), (xi, zh - bi)]


# станции короба: (u, внутр. X, внешн. X, низ Z, верх Z, срез снизу-снаружи, срез сверху-снаружи) — передняя часть до оси качания (u 520); сзади короб
# закруглён по дуге радиуса R_B вокруг оси (ARC_DY — смещения назад от оси, м): при подъёме он не задевает неподвижное, где вырез радиуса R_C
HOUS = [(345, 0.72, 1.00, 2.20, 2.47, 0.04, 0.06), (380, 0.72, 1.01, 2.08, 2.51, 0.05, 0.08), (415, 0.72, 1.02, 1.99, 2.54, 0.06, 0.10),
        (470, 0.72, 1.17, 1.88, 2.56, 0.07, 0.12), (520, 0.72, 1.30, 1.82, 2.58, 0.08, 0.14)]
R_B, R_C = 0.50, 0.515
ARC_DY = [-0.10, -0.20, -0.29, -0.36, -0.42, -0.46, -0.485, -0.498]


def hous_x(u):
    return float(np.interp(u, [h[0] for h in HOUS], [h[2] for h in HOUS]))


def build_turret():
    b = Bld('turret_main')
    # центральный корпус башни: вертикальные борта ±0,70, передняя стенка наклонена (верх дальше назад), срезанные передние углы и верхние кромки
    def ring_c(xh, yf, yr, cf=0.10, cr=0.04):
        return [(-xh + cf, yf), (xh - cf, yf), (xh, yf - cf), (xh, yr + cr), (xh - cr, yr), (-xh + cr, yr), (-xh, yr + cr), (-xh, yf - cf)]
    yr = Yp(720)
    loft_z(b, [(1.578, ring_c(0.70, Yp(300), yr)), (1.847, ring_c(0.70, Yp(300), yr)), (2.27, ring_c(0.70, Yp(312), yr)), (2.64, ring_c(0.70, Yp(323), yr)),
               (2.732, ring_c(0.61, Yp(328), yr + 0.07, 0.08, 0.05))], M_BODY, tag='centre')
    # кормовой короб под приводом антенны (u 720 → 770): наклонная задняя стенка, решётка и рейки на ней
    prism_x(b, [(720, 303), (770, 303), (770, 284), (764, 236), (751, 232), (751, 212), (720, 212)], -0.80, 0.80, M_BODY, tag='rearbox')
    cbox(b, -0.20, 0.20, Yp(770) - 0.004, Yp(770) + 0.02, Zp(290), Zp(262), M_DARK, c=0.01, tag='rearvent')
    for zz in (Zp(282), Zp(270)): box(b, -0.5, 0.5, Yp(770) - 0.004, Yp(770) + 0.012, zz, zz + 0.02, M_STEEL, tag='rearrail')

    # ── кожух антенны сопровождения — шар с кольцами, линзой и кронштейнами ──
    zp = Zp(236)
    prof = [(229, 14), (232, 25), (237, 35), (242, 41), (246, 44), (283, 44), (293, 40), (302, 33), (309, 24), (314, 12)]
    for (ua, ra), (ub_, rb_) in zip(prof[:-1], prof[1:]): cyl(b, V(0, Yp(ua), zp), V(0, Yp(ub_), zp), ra * S, rb_ * S, M_BODY, n=18, caps=(False, False), tag='pod')
    cyl(b, V(0, Yp(229), zp), V(0, Yp(227.0), zp), 14 * S, 14 * S, M_GLASS, n=18, tag='lens')
    tube(b, V(0, Yp(247), zp), V(0, Yp(251), zp), 44 * S + 0.012, 44 * S - 0.01, M_STEEL, n=18, tag='podring')             # кольцо-фланец между полусферой и цилиндром
    tube(b, V(0, Yp(235), zp), V(0, Yp(238), zp), 33 * S, 25 * S, M_DARK, n=16, tag='podring2')
    for s_ in (1, -1):
        cbox(b, min(s_ * 0.30, s_ * 0.43), max(s_ * 0.30, s_ * 0.43), Yp(318), Yp(262), zp - 0.28, zp + 0.18, M_BODY, c=0.03, tag='podarm')   # кронштейны кожуха к лицу башни
        # круглая крышка с болтами — на наружной грани кронштейна (x = 0,43), по центру грани (раньше сидела внутри бруска и не была видна)
        cyl(b, V(s_ * 0.42, Yp(290), zp - 0.05), V(s_ * 0.446, Yp(290), zp - 0.05), 0.13, 0.13, M_STEEL, n=14, tag='podplate')
        bolt_circle(b, V(s_ * 0.446, Yp(290), zp - 0.05), V(s_, 0, 0), 0.09, 6, 0.013, 0.012, M_DARK, n=5, tag='podbolt')
    cbox(b, -0.12, 0.12, Yp(283), Yp(256), zp + 0.30, zp + 0.40, M_BODY, c=0.02, tag='podperi')                                        # перископ на кожухе сверху
    # «подбородок» под кожухом: наклонный лист к палубе (бок)
    prism_x(b, [(236, 280), (335, 280), (335, 328), (290, 328), (255, 318), (234, 303)], -0.48, 0.48, M_BODY, tag='chin')

    # ── крыша: колпак командира, перископы, люки, дужки, задний перископ ──
    cbox(b, -0.42, 0.50, Yp(500), Yp(418), ZROOF - 0.02, 2.83, M_BODY, c=0.025, tag='cupola')
    cyl(b, V(0.04, Yp(459), 2.82), V(0.04, Yp(459), 2.86), 0.2, 0.19, M_STEEL, n=16, tag='cupolalid')
    tube(b, V(0.04, Yp(459), 2.85), V(0.04, Yp(459), 2.89), 0.2, 0.16, M_DARK, n=16, tag='cupolaring')
    for k in range(6):
        t = 2 * math.pi * k / 6 + 0.3
        cx_, cy_ = 0.04 + 0.245 * math.cos(t), Yp(459) + 0.245 * math.sin(t)
        cbox(b, cx_ - 0.03, cx_ + 0.03, cy_ - 0.03, cy_ + 0.03, 2.82, 2.89, M_DARK, c=0.01, tag='cupolaperi')
    for x0_, x1_ in ((0.28, 0.42), (-0.42, -0.18)):
        cbox(b, x0_, x1_, Yp(404), Yp(378), ZROOF - 0.02, 2.93, M_BODY, c=0.02, tag='periscope')
        box(b, x0_ + 0.02, x1_ - 0.02, Yp(404) + 0.004, Yp(404) - 0.006, 2.80, 2.90, M_GLASS, tag='perilens')
    cbox(b, -0.18, 0.18, Yp(418), Yp(394), ZROOF - 0.02, 2.95, M_BODY, c=0.02, tag='hump')
    cyl(b, V(0.04, Yp(592), ZROOF - 0.01), V(0.04, Yp(592), ZROOF + 0.05), 0.18, 0.18, M_DARK, n=16, tag='hatch')
    tube(b, V(0.04, Yp(592), ZROOF + 0.05), V(0.04, Yp(592), ZROOF + 0.07), 0.19, 0.15, M_STEEL, n=16, tag='hatchrim')
    cbox(b, -0.12, 0.12, Yp(690), Yp(666), ZROOF - 0.02, 2.84, M_BODY, c=0.02, tag='rearperi')
    for xl in (-0.34, 0.34):            # две дужки на крыше: стойки и перемычка
        for dx in (-0.09, 0.09): cyl(b, V(xl + dx, Yp(560), ZROOF - 0.02), V(xl + dx, Yp(560), 2.90), 0.013, 0.013, M_STEEL, n=6, tag='hoopleg')
        cyl(b, V(xl - 0.09, Yp(560), 2.90), V(xl + 0.09, Yp(560), 2.90), 0.014, 0.014, M_STEEL, n=6, tag='hooptop')

    # ── неподвижные части орудийных коробов: основание под подвижной частью и задний короб; дымовые гранатомёты на рейке основания ──
    for s_ in (1, -1):
        sk = []
        for u, xi, xo, zl, zh, bo, bt in HOUS:        # передняя часть: верх основания ниже низа короба на запас под снижение −3°
            top = zl - 0.012 - 0.052 * (520 - u) * S if u < 520 else ZGUN - R_C
            sk.append((Yp(u), [(s_ * x, z) for x, z in crect(0.69, xo, ZD, top, (0.012, bo, 0.012, 0.012))]))
        for dy in ARC_DY + [-0.5149]:                 # за осью — вырез-дуга радиуса R_C: короб вращается внутри него
            top = ZGUN - math.sqrt(max(R_C ** 2 - dy ** 2, 0.0))
            sk.append((YH + dy, [(s_ * x, z) for x, z in crect(0.69, 1.30, ZD, top, (0.012, 0.08, 0.012, 0.012))]))
        sweep(b, sk, M_BODY, tag='skirt')
        rs = []
        for u, xo, zl, zh, bo, bt in ((587, 1.30, ZD, 2.56, 0.08, 0.14), (600, 1.30, ZD, 2.58, 0.08, 0.14), (690, 1.32, ZD, 2.58, 0.08, 0.14), (702, 1.26, ZD, 2.52, 0.06, 0.10), (708, 1.14, ZD, 2.40, 0.05, 0.08)):
            rs.append((Yp(u), [(s_ * x, z) for x, z in crect(0.69, xo, zl, zh, (0.012, bo, bt, 0.012))]))
        sweep(b, rs, M_BODY, tag='rearhous')
        # вентиляционная решётка на внешней стенке неподвижного короба
        xo = 1.32 * s_ - s_ * 0.004
        cbox(b, min(xo, xo + s_ * 0.014), max(xo, xo + s_ * 0.014), Yp(690), Yp(612), 1.95, 2.40, M_DARK, c=0.01, tag='vent')
        for k in range(5): box(b, min(xo, xo + s_ * 0.024), max(xo, xo + s_ * 0.024), Yp(686 - 14 * k) - 0.012, Yp(686 - 14 * k) + 0.012, 1.98, 2.38, M_STEEL, tag='ventbar')
        # рейка основания и четыре гранатомёта: основания на стенке, стволики вперёд-вверх-наружу
        xw0 = hous_x(372) - 0.03
        cbox(b, min(s_ * xw0, s_ * (xw0 + 0.1)), max(s_ * xw0, s_ * (xw0 + 0.1)), Yp(446), Yp(364), 1.76, 1.82, M_STEEL, c=0.01, tag='sdrail')
        for k, u in enumerate((372, 392, 414, 436)):
            xw = hous_x(u); ys = Yp(u); zb = 1.80
            cbox(b, min(s_ * (xw - 0.02), s_ * (xw + 0.08)), max(s_ * (xw - 0.02), s_ * (xw + 0.08)), ys - 0.045, ys + 0.045, zb - 0.07, zb + 0.07, M_STEEL, c=0.012, tag='sdbase')
            cyl(b, V(s_ * (xw + 0.05), ys, zb + 0.02), V(s_ * (xw + 0.14), ys - 0.05, zb + 0.24), 0.042, 0.044, M_BODY, n=10, tag='sdtube')
            cyl(b, V(s_ * (xw + 0.14), ys - 0.05, zb + 0.24), V(s_ * (xw + 0.15), ys - 0.054, zb + 0.255), 0.044, 0.044, M_DARK, n=10, tag='sdmouth')
    return b


def build_whips():
    b = Bld('turret_whips')
    for s in (1, -1):
        cyl(b, V(s * 1.18, Yp(690), 2.54), V(s * 1.18, Yp(690), 2.62), 0.045, 0.04, M_STEEL, n=8, tag='whipbase')
        cyl(b, V(s * 1.18, Yp(690), 2.62), V(s * 1.28, Yp(715), 3.47), 0.013, 0.010, M_DARK, n=5, tag='whip')
    return b


# ───────────── стволы и орудийные короба (cradle_*) — качаются вокруг оси на (YH, ZGUN) ─────────────
def muzzle_cage(b, x, u0, u1):
    """Дульный тормоз-клетка (как у Oerlikon KDA): пять светлых колец и восемь широких планок — между планками открытые прорези, за ними тёмная сердцевина с кольцевыми
    перегородками; ствол — труба с настоящим отверстием: на дульном срезе торцевое кольцо с круглым отверстием, внутри тёмный канал с глубиной около 0,2 м."""
    z = ZGUN; y0, y1 = Yp(u0), Yp(u1)
    ys = [y0 + (y1 - y0) * k / 4 for k in range(5)]
    for k, yy in enumerate(ys):
        w = 0.014 if k in (0, 4) else 0.012
        tube(b, V(x, yy - w, z), V(x, yy + w, z), 0.108, 0.080, M_STEEL, n=8, sq=0.78, tag='mbring')
    for k in range(8):                                                       # планки шириной 3,4 см с прорезями 4 см между ними
        t = 2 * math.pi * k / 8 + math.pi / 8
        px = x + 0.098 * math.cos(t); pz = z + 0.098 * 0.78 * math.sin(t)
        cyl(b, V(px, y0 - 0.014, pz), V(px, y1 + 0.014, pz), 0.024, 0.024, M_STEEL, n=4, a0=math.pi / 4, tag='mbbar')
    tube(b, V(x, y0 - 0.01, z), V(x, y1, z), 0.066, 0.049, M_DARK, n=12, sq=0.78, sqi=1.0, tag='mbcore')           # тёмная сердцевина — то, что видно в прорезях
    for yy in ys[1:4]:                                                       # кольцевые перегородки вокруг ствола (видны в прорезях)
        tube(b, V(x, yy - 0.006, z), V(x, yy + 0.006, z), 0.080, 0.049, M_STEEL, n=12, sq=0.78, sqi=1.0, tag='mbbaffle')
    tube(b, V(x, y0 - 0.01, z), V(x, y1 + 0.022, z), 0.05, 0.034, M_DARK, n=12, tag='mbbore')                       # ствол — труба, канал открыт на срезе
    cyl(b, V(x, y1 - 0.20, z), V(x, y1 - 0.19, z), 0.0345, 0.0345, M_DARK, n=12, tag='mbplug')                       # дно видимой глубины канала
    tube(b, V(x, y1 - 0.004, z), V(x, y1 + 0.022, z), 0.104, 0.036, M_STEEL, n=16, sq=0.78, sqi=1.0, tag='mbface')   # торцевое кольцо с круглым отверстием


def build_guns():
    b = Bld('cradle_guns')
    cyl(b, V(-0.76, YH, ZGUN), V(0.76, YH, ZGUN), 0.05, 0.05, M_STEEL, n=8, tag='trunnionshaft')      # вал цапф: скрыт в центральном корпусе башни, связывает левый и правый короба
    for s in (1, -1):
        x = s * XGUN
        P = lambda u: V(x, Yp(u), ZGUN)
        # подвижный короб орудия: граненая оболочка, закругление сзади вокруг оси качания
        st = []
        for u, xi, xo, zl, zh, bo, bt in HOUS:
            st.append((Yp(u), [(s * px, pz) for px, pz in hring(xi, xo, zl, zh, bo, bt)]))
        for dy in ARC_DY:                             # закругление сзади по дуге R_B вокруг оси качания
            q = math.sqrt(R_B ** 2 - dy ** 2); zl = max(1.82, ZGUN - q); zh = min(2.58, ZGUN + q); hgt = zh - zl
            xo = 1.30 - 0.10 * (dy / 0.5) ** 2
            st.append((YH + dy, [(s * px, pz) for px, pz in hring(0.72, xo, zl, zh, min(0.08, hgt / 4.5), min(0.14, hgt / 3.0), min(0.03, hgt / 6.0))]))
        sweep(b, st, M_BODY, tag='block')
        # порт вокруг ствола на лице короба, кольцо, цапфа и окно на внешней стенке
        cbox(b, x - 0.11, x + 0.11, Yp(345) - 0.004, Yp(345) + 0.016, ZGUN - 0.12, ZGUN + 0.12, M_DARK, c=0.012, tag='port')
        tube(b, V(x, Yp(345) + 0.006, ZGUN), V(x, Yp(345) + 0.03, ZGUN), 0.095, 0.052, M_STEEL, n=14, tag='portring')
        # круглая крышка цапфы с болтами лежит в плоскости наружной стенки короба: стенка расширяется назад, поэтому ось крышки наклонена (иначе задние болты тонут в стенке)
        xo_ = s * hous_x(500)
        nw = V(s, -(hous_x(494) - hous_x(506)) / (Yp(494) - Yp(506)), 0).normalized()
        c0 = V(xo_, Yp(500), 2.20)
        cyl(b, c0 - nw * 0.012, c0 + nw * 0.014, 0.11, 0.11, M_STEEL, n=14, tag='trunplate')
        bolt_circle(b, c0 + nw * 0.014, nw, 0.08, 6, 0.012, 0.012, M_DARK, n=5, tag='trunbolt')
        wst = []
        for uu in (448, 400):
            xw_ = hous_x(uu); wst.append((Yp(uu), [(s * xw_ - s * 0.006, 2.10), (s * xw_ + s * 0.010, 2.10), (s * xw_ + s * 0.010, 2.40), (s * xw_ - s * 0.006, 2.40)]))
        sweep(b, wst, M_DARK, tag='window')
        # ствол: продолжение внутри короба, хомут у короба, рубашка, проточки, манжета, дульный тормоз
        cyl(b, P(563), P(345), 0.048, 0.048, M_STEEL, n=12, tag='bore')
        cyl(b, P(345), P(236), 0.058, 0.058, M_DARK, n=12, tag='sleeve')
        cyl(b, P(240), P(130), 0.052, 0.052, M_STEEL, n=12, tag='jacket')
        for uu in (300, 262, 222, 185, 150):
            cyl(b, P(uu + 3), P(uu - 3), 0.066, 0.066, M_STEEL, n=12, tag='clamp')
        cyl(b, P(130), P(88), 0.047, 0.047, M_STEEL, n=12, tag='barrel')
        cyl(b, P(130), P(112), 0.058, 0.052, M_DARK, n=12, tag='cuff')
        cyl(b, P(95), P(86), 0.062, 0.062, M_DARK, n=10, tag='mbmount')
        muzzle_cage(b, x, 86, 24)
    return b


# ───────────── антенна обзора (radar_*) ─────────────
def dish_ub(sz): return 780 - 22.5 * sz * sz + 8.5 * sz            # столбец тыла рефлектора на сечении sz (−1 верх … +1 низ), пикс.
def dish_psag(sz): return 21 + 10 * sz


def build_radar():
    b = Bld('radar_antenna')
    ZC, HH, HW = 3.575, 0.33, 0.735
    # корпус привода на кормовом коробе: грани с фасками; круглые фланцы с болтами по бокам
    yd = Yp(745)                                                   # ось поворота — центр привода (игра берёт центр низа группы)
    cyl(b, V(0, yd, 2.44), V(0, yd, 2.90), 0.17, 0.17, M_DARK, n=20, tag='drive')
    tube(b, V(0, yd, 2.50), V(0, yd, 2.58), 0.185, 0.16, M_STEEL, n=20, tag='driveledge')
    cyl(b, V(0, yd, 2.90), V(0, yd, 2.915), 0.15, 0.15, M_STEEL, n=20, tag='drivetop')
    bolt_circle(b, V(0, yd, 2.915), V(0, 0, 1), 0.11, 8, 0.013, 0.012, M_DARK, n=5, tag='flbolt')
    # опора: мачта от привода до нижней кромки рефлектора, седло под рефлектором (оно же — крепление)
    ym = Yp(767)
    cyl(b, V(0, ym, 2.88), V(0, ym, 3.32), 0.095, 0.085, M_DARK, n=14, tag='post')
    cbox(b, -0.20, 0.20, Yp(784), Yp(756), 3.20, 3.31, M_DARK, c=0.02, tag='saddle')
    # рефлектор: тонкая двояко изогнутая чаша 1,47 × 0,66 м, вогнутая вперёд (профиль — полумесяц вида сбоку)
    dish2(b, 0.0, HW, ZC, HH, dish_ub, 7.0, dish_psag, M_DARK, tag='dish')
    # две стойки-«вилка» от седла к тылу рефлектора и рёбра жёсткости по тылу
    def back_pt(sx, sz): return V(HW * sx, Yp(dish_ub(sz) - dish_psag(sz) * sx * sx) - 0.01, ZC - HH * sz)
    for sx in (-0.42, 0.42):
        cyl(b, V(HW * sx * 0.45, ym, 3.27), back_pt(sx, 0.2), 0.034, 0.03, M_DARK, n=8, tag='fork')
    for sxs, nk in ((0.0, 6), (-0.5, 5), (0.5, 5)):
        prev = None
        for k in range(nk):
            sz = (0.9 - 0.36 * k) if nk == 6 else (0.8 - 0.4 * k); p = back_pt(sxs, sz)
            if prev is not None: cyl(b, prev, p, 0.03 if nk == 6 else 0.022, 0.03 if nk == 6 else 0.022, M_DARK, n=8, tag='backrib')
            prev = p
    # штырь на середине верхней кромки рефлектора
    ptop = back_pt(0.0, -1.0); cyl(b, V(0, ptop.y + 0.03, ZC + HH - 0.02), V(0, ptop.y + 0.03, 4.02), 0.02, 0.016, M_DARK, n=6, tag='pin')
    # кронштейн от опоры вперёд и «флажок» на его конце (контуры вида сбоку); диск с болтами на боках флажка
    prism_x(b, [(774, 132), (752, 133), (740, 134), (716, 136), (700, 142), (694, 152), (700, 160), (718, 156), (742, 153), (774, 153)], -0.06, 0.06, M_DARK, tag='arm')
    # «флажок» — наклонная плита 0,35 м (узкая по Y), с четырьмя болтами спереди, и коробка на конце кронштейна под ней
    prism_x(b, [(708, 60), (717, 60), (730, 114), (721, 116)], -0.175, 0.175, M_DARK, tag='flag')
    prism_x(b, [(681, 80), (712, 78), (714, 114), (683, 116)], -0.12, 0.12, M_DARK, tag='flagbox')        # коробка (рупор) перед плитой
    prism_x(b, [(701, 112), (720, 110), (722, 142), (703, 146)], -0.09, 0.09, M_DARK, tag='flagneck')    # шейка коробки к кронштейну
    prism_x(b, [(696, 150), (720, 150), (722, 174), (694, 174)], -0.1, 0.1, M_DARK, tag='armcolumn')      # передняя опора кронштейна (над крышей: вращается)
    nf = V(0, 0.974, -0.226)                              # лицевая сторона плиты смотрит вперёд и чуть вниз (плита наклонена вперёд сверху)
    for dx in (-0.15, 0.15):            # по бокам коробки перед плитой (на x = ±0,12 нижние болты уходили в её бок)
        for vv in (76, 100):
            pc = V(dx, Yp(708 + 13.0 * (vv - 60) / 56.0), Zp(vv))
            cyl(b, pc - nf * 0.004, pc + nf * 0.016, 0.016, 0.014, M_DARK, n=6, tag='flagbolt')
            BOLTS.append((b.name, 'flagbolt', pc + nf * 0.016, nf.copy(), 0.016))
    return b


# ───────────── мелочь: лампы, фонари, зеркало (body_misc) ─────────────
def build_misc():
    b = Bld('body_misc')
    for s in (1, -1):
        box(b, min(s * 1.33, s * 1.60), max(s * 1.33, s * 1.60), Yp(250), Yp(222), ZK, 1.55, M_DARK, tag='frontlamp')           # передние лампы на крыльях
        box(b, min(s * 1.42, s * 1.62), max(s * 1.42, s * 1.62), Yp(1017), Yp(990), 1.40, 1.58, M_DARK, tag='rearlamp')          # задние фонари
    # зеркало заднего вида на стойке (левое переднее крыло)
    cyl(b, V(-1.50, Yp(205), ZK - 0.02), V(-1.50, Yp(205), 1.76), 0.013, 0.012, M_STEEL, n=6, tag='mirrorpost')
    cbox(b, -1.60, -1.40, Yp(207), Yp(201), 1.74, 1.88, M_STEEL, c=0.01, tag='mirror')
    return b


def _trees(bl, skip=()):
    bm = bl.bm; bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table(); bm.verts.index_update()
    out = []
    for tag, v0, v1, f0, f1 in bl.pieces:
        if tag in skip: continue
        co = [bm.verts[i].co.copy() for i in range(v0, v1)]
        out.append((f'{bl.name}:{tag}', co, [[v.index - v0 for v in bm.faces[j].verts] for j in range(f0, f1)]))
    return out


def sweep_test(moving, fixed_builders, pivot, axis, angles, skip=()):
    """Прокручивает подвижную часть вокруг оси axis через точку pivot по углам angles (градусы; первый — 0, покой) и ищет куски, которые начинают
    пересекать неподвижные (те пары, что пересекались уже в покое, — намеренный контакт, их не считаем). Возвращает {(подвижный, неподвижный): [углы]}."""
    from mathutils import Matrix
    mv = _trees(moving, skip); fx = []
    for fb in fixed_builders: fx += _trees(fb)
    bbox = lambda co: (Vector([min(c[k] for c in co) for k in range(3)]), Vector([max(c[k] for c in co) for k in range(3)]))
    fxt = [(n, BVHTree.FromPolygons(co, pl, epsilon=0.0), bbox(co)) for n, co, pl in fx]
    base, hits = set(), {}
    for ang in angles:
        M = Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(ang), 4, axis) @ Matrix.Translation(-Vector(pivot))
        for name, co, pl in mv:
            co2 = [M @ c for c in co]; bb = bbox(co2); t = BVHTree.FromPolygons(co2, pl, epsilon=0.0)
            for n2, t2, bb2 in fxt:
                if any(bb[0][k] > bb2[1][k] or bb2[0][k] > bb[1][k] for k in range(3)): continue
                if t.overlap(t2):
                    if ang == angles[0]: base.add((name, n2))
                    elif (name, n2) not in base: hits.setdefault((name, n2), []).append(ang)
    return hits


def run_sweeps(bls):
    """Качание орудий (−3…80°) и вращение антенны обзора (0…360°): печатает пересечения с неподвижным."""
    by = {bl.name: bl for bl in bls}
    fixed_cr = [by[n] for n in ('body_hull', 'body_slopes', 'body_run', 'body_misc', 'turret_main', 'turret_whips')]
    h1 = sweep_test(by['cradle_guns'], fixed_cr, Vector((0, YH, ZGUN)), 'X', [0, -3] + list(range(5, 85, 5)), skip=('trunnionshaft',))
    for (a, b_), ang in sorted(h1.items()): print(f'  ПЕРЕСЕЧЕНИЕ при качании: {a} × {b_} на углах {ang[0]}…{ang[-1]}°')
    # ось антенны — как её берёт игра: центр (x, z) вершин нижних 15 % по высоте
    rd = by['radar_antenna']; bm = rd.bm; ys = [v.co for v in bm.verts]; z0 = min(c.z for c in ys); z1 = max(c.z for c in ys)
    low = [c for c in ys if c.z <= z0 + (z1 - z0) * 0.15]; ax = (min(c.x for c in low) + max(c.x for c in low)) / 2; ay = (min(c.y for c in low) + max(c.y for c in low)) / 2
    fixed_rd = [by[n] for n in ('body_hull', 'body_slopes', 'body_run', 'body_misc', 'turret_main', 'turret_whips', 'cradle_guns')]
    h2 = sweep_test(rd, fixed_rd, Vector((ax, ay, 0)), 'Z', [0] + list(range(20, 360, 20)))
    for (a, b_), ang in sorted(h2.items()): print(f'  ПЕРЕСЕЧЕНИЕ при вращении антенны: {a} × {b_} на углах {ang[0]}…{ang[-1]}°')
    print(f'  проверка качания и вращения: пересечений {len(h1)} + {len(h2)}; ось антенны Y {ay:.3f}')
    return len(h1) + len(h2)


def check_bolts(bls, probe=0.05, prot_min=0.005):
    """Болты не должны тонуть в стенках: луч снаружи к центру шляпки первым попадает в саму шляпку (на расстоянии probe), а вокруг шляпки поверхность
    лежит глубже шляпки хотя бы на prot_min, м (иначе болт вровень со стенкой или утоплен — его не видно)."""
    co, polys = [], []
    for bl in bls:
        bm = bl.bm; bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table(); bm.verts.index_update()
        base = len(co); co.extend(v.co.copy() for v in bm.verts)
        polys.extend([base + v.index for v in f.verts] for f in bm.faces)
    tree = BVHTree.FromPolygons(co, polys, epsilon=0.0)
    bad = []
    for name, tag, c, nrm, r in BOLTS:
        hit = tree.ray_cast(c + nrm * probe, -nrm, probe + 0.02)
        u, w = _basis(nrm); prot = []
        for d in (u, -u, w, -w):
            h2 = tree.ray_cast(c + d * (r + 0.012) + nrm * probe, -nrm, probe + 0.03)
            prot.append(h2[3] - probe if h2[0] is not None else 0.03)
        pm = min(prot)
        if hit[0] is None or hit[3] < probe - 0.002 or pm < prot_min: bad.append((name, tag, c, pm))
    for name, tag, c, pm in bad: print(f'  БОЛТ УТОПЛЕН: {name}:{tag} в ({c.x:.2f}, {c.y:.2f}, {c.z:.2f}), выступает над стенкой на {pm * 1000:.0f} мм')
    print(f'  проверка болтов: {len(BOLTS)} шт., утопленных {len(bad)}')
    return len(bad)


def store_pivots(builders):
    """Пишет в свойства сцены: ось башни (центр основания башни — как её считает prepare.js), ось качания стволов, ось антенны (центр низа группы — как берёт игра)."""
    by = {bl.name: bl for bl in builders}
    tv = [v.co.copy() for n in ('turret_main', 'turret_whips') for v in by[n].bm.verts]
    z0 = min(c.z for c in tv); low = [c for c in tv if c.z < z0 + 0.5]
    tp = ((min(c.x for c in low) + max(c.x for c in low)) / 2, (min(c.y for c in low) + max(c.y for c in low)) / 2, z0)
    rv = [v.co.copy() for v in by['radar_antenna'].bm.verts]; r0 = min(c.z for c in rv); r1 = max(c.z for c in rv)
    rl = [c for c in rv if c.z <= r0 + (r1 - r0) * 0.15]
    ra = ((min(c.x for c in rl) + max(c.x for c in rl)) / 2, (min(c.y for c in rl) + max(c.y for c in rl)) / 2, r0)
    sc_ = bpy.data.scenes['GEPARD']
    sc_['gep_turret_pivot'] = tp; sc_['gep_cradle_pivot'] = (0.0, YH, ZGUN); sc_['gep_radar_axis'] = ra
    print('  оси: башня', tuple(round(v, 3) for v in tp), '| качание', (0.0, round(YH, 3), ZGUN), '| антенна', tuple(round(v, 3) for v in ra))


def finalize(builders):
    """Проверяет куски по группам (имя до «_»), затем закрывает построители в объекты. Возвращает {группа: число висящих связок}."""
    groups = {}
    for bl in builders: groups.setdefault(bl.name.split('_')[0], []).append(bl)
    res = {g: len(check_group(lst)) for g, lst in groups.items()}
    res['sweep'] = run_sweeps(builders)
    res['bolts'] = check_bolts(builders)
    store_pivots(builders)
    for bl in builders: bl.finish(bl.name)
    return res


def build_all():
    return finalize([build_hull(), build_slopes(), build_run(), build_turret(), build_whips(), build_guns(), build_radar(), build_misc()])


RES = build_all()
ST = mk.stats(False)
print('build.py: готово', ST['tris'], 'тр.; висящих связок по группам:', RES, ST['per_object'])
