# GBU-10 Paveway - своя модель для "Воздушного превосходства" (ключ w_gbu10, оружие gbu10, база gbu10, префикс G10). Длина 4,32 м, как у прежней модели в игре.
# Картинки Mark: референс_1.png - вид сбоку, нос слева, серая с синим пояском: главная, с неё сняты все числа (наклон оси 0,55°, у нижнего края мягкая тень);
#   референс_2.webp - устройство головки и хвоста на GBU-12 (кольцо, медная лента, шайба-ось створки на пластине, створки раскрыты); референс_3.png и референс_4.png - проушины, стыки, хвостовой блок.
# Метры, нос +Y (в glTF уйдёт в −Z), верх +Z (проушины), начало - середина длины на оси. Рули и хвост стоят крестом × (на референс_1 корни на половине высоты блока).
#   G10_OUT="<папка модели>" Blender -b --factory-startup --python build.py [--python bake_maps.py]
#
# СПИСОК ДЕТАЛЕЙ (сделано / пропущено):
#  + головка: стекло-колпак, корпус, шейка; кольцо-"птичка" на 4 стойках; всё вместе объект seeker на шарнире у вершины конуса
#  + блок управления: шарик шарнира, конус, цилиндр, медная лента, накладки под корнями рулей, шайбы осей рулей, разъём
#  + 4 передних руля "×": canard1…4, у каждого своя ось по радиусу
#  + корпус вращением по снятому профилю; синий поясок и трафареты - в текстуре; круглая крышка наверху; лючок - в текстуре и рельефе
#  + две проушины сверху с площадками
#  + хвостовой блок: конус с двумя стыками, донный срез, 4 пластины "×", шайбы осей, окошко и механизм на борту
#  + 4 створки wing1…4: сложены вдоль пластин, каждая на своём шарнире
#  − наклейки с картинок и логотип: не копируются, свои надписи только в текстуре
import sys, os, math, random, json
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/GBU-10'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit'); sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Vector as V, Matrix
import modelkit as mk

random.seed(10); pi = math.pi
S = 4.32 / 669.0; X0 = 358.5                                                     # м на пиксель референс_1 (x 24…693), середина длины
y = lambda x: (X0 - x) * S
rp = lambda p: p * S
mk.configure('GBU10', S, x0=X0, yc=61.5, rb=33.75, nseg=32, nose='left')
ZN = ['paint', 'dark', 'steel', 'glass', 'copper', 'bolt', 'blade', 'canard', 'stub', 'lug', 'ring']
Z_PAINT, Z_DARK, Z_STEEL, Z_GLASS, Z_COPPER, Z_BOLT, Z_BLADE, Z_CANARD, Z_STUB, Z_LUG, Z_RING = range(len(ZN))
MATS = []
for n in ZN:
    m_ = bpy.data.materials.get('G10_' + n) or bpy.data.materials.new('G10_' + n); m_.use_nodes = True; MATS.append(m_)
UP = V((0, 0, 1)); YA = V((0, 1, 0))


def mat(o, z, x=None):
    z = V(z).normalized(); x = V(x) if x is not None else (V((1, 0, 0)) if abs(z.x) < 0.9 else V((0, 1, 0))); x = (x - z * x.dot(z)).normalized(); w = z.cross(x); o = V(o)
    return Matrix(((x.x, w.x, z.x, o.x), (x.y, w.y, z.y, o.y), (x.z, w.z, z.z, o.z), (0, 0, 0, 1)))


AX = mat((0, 0, 0), (0, 1, 0), (0, 0, -1))                                       # ось корпуса: шов снизу


class M:
    """Части одного объекта: зона - индекс материала; швы размечаются при сборке, резкие рёбра - по углу, круглое помечается."""
    def __init__(s, name, origin=(0, 0, 0)): s.name = name; s.origin = V(origin); s.bm = bmesh.new(); s.fl = s.bm.edges.layers.int.new('round'); s.uvl = s.bm.loops.layers.uv.new('preuv'); s.stl = s.bm.faces.layers.int.new('strip')

    def loft(s, rings, zone, closed=True, cap0=True, cap1=True, round_=True, loop=False):
        bm = s.bm; vs = [[bm.verts.new(p) for p in r] for r in rings]; fs = []; pairs = list(zip(vs, vs[1:])) + ([(vs[-1], vs[0])] if loop else [])
        for a, b in pairs:
            if len(a) == 1:
                for i in range(len(b)): fs.append(bm.faces.new((a[0], b[i], b[(i + 1) % len(b)])))
            elif len(b) == 1:
                for i in range(len(a)): fs.append(bm.faces.new((a[i], a[(i + 1) % len(a)], b[0])))
            else:
                n = len(a)
                for i in range(n if closed else n - 1): fs.append(bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i])))
        if not loop:
            if cap0 and len(vs[0]) > 2: fs.append(bm.faces.new(list(reversed(vs[0]))))
            if cap1 and len(vs[-1]) > 2: fs.append(bm.faces.new(vs[-1]))
        for f in fs: f.material_index = zone; f.smooth = True
        s.last = fs
        for a, b in pairs:
            if len(a) > 1 and len(b) > 1:
                e = bm.edges.get((a[0], b[0]))
                if e: e.seam = True
                if round_:
                    for i in range(len(a)):
                        e = bm.edges.get((a[i], b[i]))
                        if e: e[s.fl] = 1
        return vs

    def lathe(s, prof, n, m_=None, zone=Z_PAINT, rot=0.0, cap0=True, cap1=True, round_=True, loop=False, strip=True):
        m_ = m_ if m_ is not None else Matrix.Identity(4); rings = []
        for r_, z in prof:
            rings.append([m_ @ V((0, 0, z))] if r_ <= 1e-7 else [m_ @ V((r_ * math.cos(rot + 2 * pi * k / n), r_ * math.sin(rot + 2 * pi * k / n), z)) for k in range(n)])
        vs = s.loft(rings, zone, True, cap0, cap1, round_, loop)
        if strip:                                                                # торцы плоско: иначе развёртка гнёт их вместе с кольцом
            im = m_.inverted(); ends = [r_ for r_ in (vs[0], vs[-1]) if len(r_) > 2]
            for f in s.last:
                if len(f.verts) == n and not loop:
                    f[s.stl] = 1
                    for l_ in f.loops:
                        q = im @ l_.vert.co; l_[s.uvl].uv = (q.x, q.y)
        if strip:                                                                # развёртка заранее: прямоугольная полоса вокруг оси, шов снизу (конус иначе раскладывается широкой дугой)
            P_ = list(prof) + ([prof[0]] if loop else []); ss = [0.0]
            for (r0, z0), (r1, z1) in zip(P_, P_[1:]): ss.append(ss[-1] + math.hypot(r1 - r0, z1 - z0))
            du = 2 * pi * (sum(r_ for r_, _ in prof) / len(prof)) / n; nr = len(vs)
            for i in range(len(ss) - 1):
                a, b = vs[i], vs[(i + 1) % nr]
                for k in range(n):
                    k1 = (k + 1) % n
                    tri = (a[0], b[k], b[k1]) if len(a) == 1 else ((a[k], a[k1], b[0]) if len(b) == 1 else (a[k], a[k1], b[k1], b[k])); f = s.bm.faces.get(tri)
                    if f is None: continue
                    f[s.stl] = 1
                    for l_ in f.loops:
                        ina = l_.vert in a; ring_ = a if ina else b
                        uu = (k + 0.5) if len(ring_) == 1 else (k if ring_[k] is l_.vert else k + 1)
                        l_[s.uvl].uv = (uu * du, ss[i] if ina else ss[i + 1])
        return vs

    def rev(s, prof_px, n, zone, **kw):
        """Тело вращения вокруг оси бомбы; профиль в пикселях референс_1: (радиус, x)."""
        return s.lathe([(rp(r_), y(x)) for r_, x in prof_px], n, AX, zone, **kw)

    def prism(s, p0, p1, w, h, side=None, zone=Z_PAINT):
        p0, p1 = V(p0), V(p1); t = (p1 - p0).normalized(); side = V(side) if side is not None else (V((1, 0, 0)) if abs(t.x) < 0.9 else V((0, 1, 0))); sd = (side - t * side.dot(t)).normalized(); u = sd.cross(t)
        ring = lambda p: [p + sd * a + u * b for a, b in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))]
        return s.loft([ring(p0), ring(p1)], zone, True, True, True, False)

    def foil(s, pts, m_, t, te, inset, zone):
        """Тонкая пластина с заострёнными кромками: pts - контур (a, b) в осях m_, t - толщина посередине, te - у кромки, inset - ширина скоса."""
        c = sum((V(p) for p in pts), V((0, 0))) / len(pts); ins = []
        for p in pts:
            d = c - V(p); ins.append(V(p) + d.normalized() * min(inset, d.length * 0.45))
        ring = lambda P_, z: [m_ @ V((a.x if hasattr(a, 'x') else a[0], a.y if hasattr(a, 'y') else a[1], z)) for a in P_]
        vs = s.loft([ring(ins, -t / 2), ring(pts, -te / 2), ring(pts, te / 2), ring(ins, t / 2)], zone, True, True, True, False)
        # развёртка заранее: обе стороны плоско в осях пластины, кромка - отдельной полосой по периметру
        n = len(pts); P2 = [V(q) for q in pts]; cum = [0.0]
        for i in range(n): cum.append(cum[-1] + (P2[(i + 1) % n] - P2[i]).length)
        where = {v: (ri, k) for ri, r_ in enumerate(vs) for k, v in enumerate(r_)}; im = m_.inverted()
        for f in s.last:
            f[s.stl] = 1; rs = {where[v][0] for v in f.verts}
            if rs == {1, 2}:
                ks = [where[v][1] for v in f.verts]; wrap = (n - 1 in ks) and (0 in ks)
                for l_ in f.loops:
                    ri, k = where[l_.vert]; l_[s.uvl].uv = (cum[n] if (wrap and k == 0) else cum[k], 0.0 if ri == 1 else te)
            else:
                for l_ in f.loops:
                    q = im @ l_.vert.co; l_[s.uvl].uv = (q.x, q.y)
        return vs

    def tube(s, pts, r_, n=6, zone=Z_STEEL):
        pts = [V(p) for p in pts]; rings = []; m = len(pts); up = None
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, m - 1)] - pts[max(i - 1, 0)]).normalized()
            if up is None: up = V((1, 0, 0)) if abs(t.z) > 0.9 else V((0, 0, 1))
            sd = t.cross(up).normalized(); u = sd.cross(t); up = u; rings.append([p + (sd * math.cos(2 * pi * k / n) + u * math.sin(2 * pi * k / n)) * r_ for k in range(n)])
        return s.loft(rings, zone, True, True, True, True)

    def finish(s, sharp=math.radians(38), seam=math.radians(62)):
        bm = s.bm; bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for e in bm.edges:
            if len(e.link_faces) != 2: e.seam = True; e.smooth = False; continue
            a = e.calc_face_angle(0.0)
            e.smooth = True if e[s.fl] == 1 else a < sharp
            if a > seam and e[s.fl] != 1: e.seam = True

    def obj(s):
        s.finish()
        for v in s.bm.verts: v.co -= s.origin
        me = bpy.data.meshes.new(s.name); s.bm.to_mesh(me); s.bm.free(); o = bpy.data.objects.new(s.name, me); mk.col.objects.link(o); o.location = s.origin
        for m_ in MATS: me.materials.append(m_)
        return o


PHI = (45.0, 135.0, 225.0, 315.0)
D = lambda ph: V((math.cos(math.radians(ph)), 0, math.sin(math.radians(ph))))     # от оси наружу по кресту ×
A_ = lambda ph: V((-math.sin(math.radians(ph)), 0, math.cos(math.radians(ph))))   # перпендикуляр к плоскости креста; он же ось створки: положительный угол раскрывает её наружу


def plane(ph, off=0.0):
    """Оси плоскости креста: x - вдоль оси бомбы к носу, y - радиус наружу, z - поперёк."""
    d = D(ph); a = A_(ph)
    return Matrix(((0, d.x, a.x, a.x * off), (1, d.y, a.y, a.y * off), (0, d.z, a.z, a.z * off), (0, 0, 0, 1)))


# ── головка на шарнире: колпак, корпус, шейка, кольцо на 4 стойках ──
PIVOT_X = 71.0; P_SEEK = V((0, y(PIVOT_X), 0))
h = M('seeker', P_SEEK)
h.rev([(0, 24), (2.4, 24.7), (3.7, 26.4), (4.6, 28.6), (5.0, 31)], 18, Z_GLASS)
h.rev([(4.4, 30.5), (5.4, 31), (5.6, 32), (5.6, 41), (4.6, 42.5), (3.8, 43.6), (3.8, 60.2), (2.3, 61.4)], 20, Z_STEEL)
h.rev([(1.9, 60.8), (1.9, 68.5)], 10, Z_DARK)
h.rev([(10.6, 48.3), (11.9, 48.6), (11.9, 50.2), (11.3, 51.4), (11.3, 63.0), (10.6, 63.0)], 28, Z_RING, loop=True)
for ph in PHI:
    h.foil([(y(50.6), rp(3.2)), (y(60.4), rp(3.2)), (y(60.4), rp(10.9)), (y(52.0), rp(10.9))], plane(ph), 0.0052, 0.0026, 0.006, Z_RING)
seeker = h.obj()

# ── блок управления: шарик шарнира, конус, цилиндр, стык, лента, накладки рулей ──
c = M('G10_ccg')
c.rev([(0, 69), (1.4, 69.6), (2.0, 71), (1.5, 72.4)], 12, Z_DARK)
c.rev([(2.2, 72), (5.2, 80), (9.6, 90), (13.6, 100), (15.0, 104), (15.3, 105.5), (15.3, 211)], 28, Z_PAINT)
c.rev([(14.2, 210.5), (14.2, 214.8)], 20, Z_DARK)
c.rev([(15.1, 143), (15.42, 143.3), (15.42, 156.7), (15.1, 157)], 28, Z_COPPER, cap0=False, cap1=False)
R0C = rp(15.3); RC_ROOT = R0C + 0.0055; CANARD_X = 150.0
for ph in PHI:
    d = D(ph); a = A_(ph)
    c.prism(d * (R0C + 0.0005) + YA * y(122), d * (R0C + 0.0005) + YA * y(189), 0.024, 0.006, side=a, zone=Z_PAINT)
    c.lathe([(0.0205, -0.003), (0.0205, 0.0015), (0.0175, 0.0032)], 10, mat(d * R0C + YA * y(CANARD_X), d, YA), Z_BOLT)
_ca = V((-math.cos(math.radians(18)), 0, -math.sin(math.radians(18))))
c.prism(_ca * R0C + YA * y(126), _ca * R0C + YA * y(135), 0.026, 0.014, side=YA.cross(_ca), zone=Z_DARK)
c = c.obj()

# ── руль: контур снят с референс_1, корень чуть над накладкой, ось по радиусу через x = 150 ──
CAN = [(123.0, None), (163.0, 62.5), (185.0, 62.5), (187.0, None)]
canards = []
for i, ph in enumerate(PHI):
    d = D(ph); pv = d * R0C + YA * y(CANARD_X); k = M(f'canard{i + 1}', pv)
    pts = [(y(x_), RC_ROOT if r_ is None else rp(r_)) for x_, r_ in CAN]
    k.foil(pts, plane(ph), 0.012, 0.0028, 0.018, Z_CANARD)
    canards.append(k.obj())

# ── корпус ──
PROF = [(14.5, 214), (15.6, 224), (17.9, 235), (20.2, 244), (24.0, 264), (26.8, 284), (28.6, 304), (30.4, 324), (32.2, 344), (33.2, 364), (33.75, 384), (33.75, 480), (33.4, 510), (32.2, 530), (31.0, 545), (29.6, 558), (27.6, 576)]
b = M('G10_body'); b.rev(PROF, 32, Z_PAINT)
RB = rp(33.75)
b.lathe([(0.036, -0.002), (0.036, 0.0028), (0.0325, 0.0042)], 16, mat(V((0, y(420), RB)), UP), Z_PAINT, cap0=False)
body = b.obj()

# ── проушины: площадка и прямоугольное ушко, ось отверстия поперёк ──
LUG_TOP = RB + 0.046; LUG_X = (362.0, 477.5)
l = M('G10_lugs')
for x_ in LUG_X:
    yy = y(x_); zb = rp(33.5)
    l.prism((0, yy + 0.047, zb + 0.004), (0, yy - 0.047, zb + 0.004), 0.058, 0.012, side=(1, 0, 0), zone=Z_LUG)
    for dy in (0.0155, -0.0155): l.prism((0, yy + dy, zb + 0.004), (0, yy + dy, LUG_TOP - 0.006), 0.026, 0.011, side=(1, 0, 0), zone=Z_LUG)
    l.prism((0, yy + 0.0215, LUG_TOP - 0.0055), (0, yy - 0.0215, LUG_TOP - 0.0055), 0.026, 0.011, side=(1, 0, 0), zone=Z_LUG)
lugs = l.obj()

# ── хвостовой блок: конус с двумя стыками и донный срез, пластины "×", шайбы, механизм и окошко на бортах ──
t = M('G10_tail')
t.rev([(27.2, 574), (27.75, 575.5), (23.5, 613.6), (23.1, 614.2), (23.3, 614.9), (14.9, 685), (14.4, 691), (13.3, 692.2), (12.4, 691.6), (12.0, 688), (0, 688)], 28, Z_PAINT)
STUB = [(558.0, 29.5), (573.0, 55.5), (691.0, 55.5), (693.0, 50.0), (686.5, 13.5), (614.0, 22.5), (575.0, 26.5)]
HINGE_X = 600.0; HINGE_R = 38.9; STUB_T = 0.008
for ph in PHI:
    t.foil([(y(x_), rp(r_)) for x_, r_ in STUB], plane(ph), STUB_T, 0.0034, 0.012, Z_STUB)
    a = A_(ph); pv = D(ph) * rp(HINGE_R) + YA * y(HINGE_X)
    t.lathe([(0.022, -0.001), (0.022, 0.0018), (0.0185, 0.003)], 12, mat(pv - a * (STUB_T / 2), -a), Z_BOLT)         # заклёпка оси с другой стороны пластины
for sg in (-1, 1):
    r_ = rp(21.6); t.prism((sg * r_, y(620), 0), (sg * r_, y(632), 0), 0.056, 0.022, side=UP, zone=Z_STEEL)
t.prism((-rp(25.4), y(590), rp(2.0)), (-rp(25.0), y(600), rp(2.0)), 0.03, 0.016, side=UP, zone=Z_DARK)
t.tube([(-rp(25.2), y(600), rp(2.0)), (-rp(24.4), y(608), rp(2.0)), (-rp(23.5), y(616), rp(2.0))], 0.0048, 6, Z_STEEL)
tail = t.obj()

# ── створки: лежат вдоль пластины с внешней стороны, начало на оси-шайбе; положительный угол вокруг A_ раскрывает створку наружу ──
FOLD = math.radians(2.5); WING_L = 0.60; WING_OPEN_DEG = 87.5; W_OFF = STUB_T / 2 + 0.0012 + 0.004; wings = []
for i, ph in enumerate(PHI):
    d = D(ph); a = A_(ph); pv = d * rp(HINGE_R) + YA * y(HINGE_X) + a * W_OFF; w = M(f'wing{i + 1}', pv)
    d0 = (-YA * math.cos(FOLD) + d * math.sin(FOLD)).normalized(); c0 = (d * math.cos(FOLD) + YA * math.sin(FOLD)).normalized()    # вдоль размаха и по хорде (наружу = передняя кромка при раскрытии)
    mw = Matrix(((d0.x, c0.x, a.x, pv.x), (d0.y, c0.y, a.y, pv.y), (d0.z, c0.z, a.z, pv.z), (0, 0, 0, 1)))
    PTS = [(-0.034, -0.026), (-0.034, 0.026), (-0.012, 0.0425), (WING_L, 0.035), (WING_L - 0.052, -0.035), (-0.012, -0.0425)]
    w.foil(PTS, mw, 0.008, 0.003, 0.012, Z_BLADE)
    w.lathe([(0.0195, 0.0035), (0.0195, 0.0062), (0.016, 0.0074)], 10, mw, Z_BOLT, cap0=False)
    wings.append(w.obj())

OBJS = [seeker, c, *canards, body, lugs, tail, *wings]
bpy.context.view_layer.update()
tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJS}; print('треугольников', sum(tris.values()), tris)
pts = [o.matrix_world @ v.co for o in OBJS for v in o.data.vertices]
print('габарит: длина', round(max(p.y for p in pts) - min(p.y for p in pts), 3), 'размах x', round(max(p.x for p in pts) - min(p.x for p in pts), 3), 'верх', round(max(p.z for p in pts), 4), 'низ', round(min(p.z for p in pts), 4))
wtop = max((o.matrix_world @ v.co).z for o in wings for v in o.data.vertices); stop = max((tail.matrix_world @ v.co).z for v in tail.data.vertices); print(f'верх проушин {LUG_TOP:.4f}, верх сложенных створок {wtop:.4f}, верх пластин хвоста {stop:.4f}, верх рулей {max((o.matrix_world @ v.co).z for o in canards for v in o.data.vertices):.4f}')
assert wtop < LUG_TOP and stop < LUG_TOP, 'хвост выше проушин'
PJ = dict(zones=ZN, S=S, X0=X0, lug_x=LUG_X, lug_top=LUG_TOP, rb=RB, phi=PHI, hinge_x=HINGE_X, hinge_r=HINGE_R, can_x=CANARD_X, pivot_x=PIVOT_X, wing_open=WING_OPEN_DEG, wing_l=WING_L, fold=FOLD, w_off=W_OFF, prof=PROF, stub=STUB, r0c=R0C)
_out = os.environ.get('G10_OUT', HERE); os.makedirs(os.path.join(_out, '_maps'), exist_ok=True); json.dump(PJ, open(os.path.join(_out, '_maps', 'parts.json'), 'w'), ensure_ascii=False)
print('build.py: готово')
