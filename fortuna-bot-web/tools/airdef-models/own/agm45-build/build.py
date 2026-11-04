# AGM-45 Shrike - своя модель для "Воздушного превосходства" (ключ w_agm45, оружие agm45, база agm45, префикс A45). Длина 3,05 м, радиус корпуса 0,1 м: опора для масштаба из игры.
# Картинки Mark: референс_1.png - рендер на сером, вид сзади сверху с борта -X: форма, узел подвески, пояски; референс_2.webp - фото на тележке, спереди с борта +X: корпус, окно, хвост (тележка и здание не берутся);
#   референс_3.webp - музейное фото снизу с борта +X: посадка крыльев и оперения (подпись и табличка не берутся). Вида сбоку нет: положения сняты с трёх перспективных кадров с поправкой на глубину (ширина корпуса у носа и у хвоста).
# Метры, нос +Y (в glTF уйдёт в -Z), верх +Z (узел подвески), начало - середина длины на оси. Крылья и оперение стоят крестом. x - доля длины от носа, 0...1000.
#   A45_OUT="<папка модели>" Blender -b --factory-startup --python build.py [--python bake_maps.py]
#
# СПИСОК ДЕТАЛЕЙ (сделано / пропущено):
#  + корпус вращением, оживальный нос; стыки, винты, пояски и надписи - в текстуре и рельефе
#  + окно на борту +X: тонкая накладка с рамкой; на борту -X только контур лючка, как на референс_1
#  + 4 крыла посередине корпуса: rudder1...rudder4, у каждого своя ось по радиусу; накладки и шайбы под корнями
#  + 4 хвостовых стабилизатора: задняя кромка кончается на 96,5 % длины, чтобы огонь встал по оси; накладки у корней
#  + на верхней осевой линии: обтекатель, рельс подвески, два упора-крюка, бобышки
#  + сопло, полое изнутри, не шире корпуса
#  - рычаг с красным колпачком с фото на тележке: на рендере (образце узла подвески) его нет, и он торчит выше упоров; можно добавить по слову Mark
#  - тележка, здание, экспозиция, таблички и номера с картинок: не берутся
import sys, os, math, random, json
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/AGM-45'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit'); sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Vector as V, Matrix
import modelkit as mk

random.seed(45); pi = math.pi
L = 3.05; S = L / 1000.0; X0 = 500.0; RB_M = 0.1                                 # x 0...1000 = нос...срез сопла
y = lambda x: (X0 - x) * S
rp = lambda p: p * S
mk.configure('AGM45', S, x0=X0, yc=0.0, rb=RB_M / S, nseg=32, nose='left')
ZN = ['white', 'dark', 'window', 'ring', 'wing', 'fin', 'metal', 'rail']
Z_WHITE, Z_DARK, Z_WINDOW, Z_RING, Z_WING, Z_FIN, Z_METAL, Z_RAIL = range(len(ZN)); Z_PAINT = Z_WHITE; Z_STEEL = Z_METAL
MATS = []
for n in ZN:
    m_ = bpy.data.materials.get('A45_' + n) or bpy.data.materials.new('A45_' + n); m_.use_nodes = True; MATS.append(m_)
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

    def lathe(s, prof, n, m_=None, zone=Z_PAINT, rot=0.0, cap0=True, cap1=True, round_=True, loop=False, strip=True, breaks=()):
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
                        l_[s.uvl].uv = (uu * du, (ss[i] if ina else ss[i + 1]) + 10.0 * sum(1 for b_ in breaks if b_ <= i))
        return vs

    def rev(s, prof_px, n, zone, breaks_x=(), **kw):
        """Тело вращения вокруг оси бомбы; профиль в пикселях референс_1: (радиус, x)."""
        kw['breaks'] = [i for i, (r_, x) in enumerate(prof_px) if x in breaks_x]; return s.lathe([(rp(r_), y(x)) for r_, x in prof_px], n, AX, zone, **kw)

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
D = lambda ph: V((math.cos(math.radians(ph)), 0, math.sin(math.radians(ph))))
A_ = lambda ph: V((-math.sin(math.radians(ph)), 0, math.cos(math.radians(ph))))


def plane(ph, off=0.0):
    """Оси плоскости креста: x - вдоль оси ракеты к носу, y - радиус наружу, z - поперёк."""
    d = D(ph); a = A_(ph)
    return Matrix(((0, d.x, a.x, a.x * off), (1, d.y, a.y, a.y * off), (0, d.z, a.z, a.z * off), (0, 0, 0, 1)))


# профиль: (радиус, м; x); interp ждёт x по возрастанию
PROF = [(0.0, 0.0), (0.012, 5.0), (0.025, 15.0), (0.042, 30.0), (0.060, 50.0), (0.076, 75.0), (0.087, 100.0), (0.095, 130.0), (0.099, 160.0), (0.1, 190.0), (0.1, 430.0), (0.1, 640.0), (0.1, 840.0), (0.1, 960.0), (0.097, 985.0), (0.0935, 1000.0)]
def interp(P_, x):
    for (r0, x0), (r1, x1) in zip(P_, P_[1:]):
        if x0 <= x <= x1: return r0 + (r1 - r0) * (x - x0) / max(x1 - x0, 1e-6)
    return P_[-1][0] if x > P_[-1][1] else P_[0][0]


Rb = lambda x: interp(PROF, x)
AT = lambda r_, th, x_: V((r_ * math.sin(th), y(x_), r_ * math.cos(th)))            # th - угол от верха к +X


def patch(m, xs, tf, zone, n=9, radius=Rb, under=0.010):
    """Накладка на корпус: xs - станции (пикс.), tf(x) -> (th0, th1, t, crown): дуга и толщина; crown - насколько середина выше края. Снизу закрыта внутри корпуса."""
    rings = []; arcs = []
    for x_ in xs:
        th0, th1, t, cr = tf(x_); r_ = radius(x_); ring = []
        for k in range(n):
            u = k / (n - 1); a = th0 + (th1 - th0) * u; ring.append(AT(r_ + t * (1 - cr + cr * (1 - (2 * u - 1) ** 2)), a, x_))
        ring.append(AT(r_ - under, th1, x_)); ring.append(AT(r_ - under, th0, x_)); rings.append(ring); arcs.append((th0, th1, r_))
    vs = m.loft(rings, zone, True, True, True, False)
    s_ = [0.0]
    for x0_, x1_ in zip(xs, xs[1:]): s_.append(s_[-1] + (x1_ - x0_) * S)
    for i in range(len(vs) - 1):
        for k in range(n - 1):
            f = m.bm.faces.get((vs[i][k], vs[i][k + 1], vs[i + 1][k + 1], vs[i + 1][k]))
            if f is None: continue
            f[m.stl] = 1
            for l_ in f.loops:
                ii = i if l_.vert in vs[i] else i + 1; kk = vs[ii].index(l_.vert); th0, th1, r_ = arcs[ii]
                l_[m.uvl].uv = ((th0 + (th1 - th0) * kk / (n - 1)) * rp(57.0), s_[ii])
    return vs


# ── корпус ──
pr_px = [(r_ / S, x_) for r_, x_ in PROF]
b = M('A45_body'); b.rev(pr_px, 40, Z_WHITE, cap1=False, breaks_x=(190.0, 430.0, 640.0, 840.0))
# окно на борту +X: тонкая накладка, по дуге ±0,60 рад
TH_W = math.radians(90.0)
b_w = lambda x_: (TH_W - 0.60, TH_W + 0.60, 0.0022, 0.0)
patch(b, [190.0, 250.0], b_w, Z_WINDOW, n=9)
body = b.obj()

# ── сопло: кольцо среза и полая камера, всё внутри радиуса корпуса ──
n_ = M('A45_nozzle')
n_.rev([(0.0935 / S, 999.0), (0.0935 / S, 1000.0), (0.0845 / S, 1000.0), (0.082 / S, 995.0), (0.058 / S, 960.0), (0.050 / S, 935.0), (0.0, 935.0)], 28, Z_RING, cap0=False)
nozzle = n_.obj()

# ── верхняя осевая линия: обтекатель, рельс, упоры, бобышки ──
h_ = M('A45_hanger'); R0 = RB_M
def fair(x_):
    if x_ <= 596: w = 0.10
    elif x_ <= 620: w = 0.10 + 0.50 * (x_ - 596) / 24.0
    elif x_ <= 660: w = 0.60 - 0.30 * (x_ - 620) / 40.0
    else: w = 0.30 - 0.06 * (x_ - 660) / 22.0
    t = 0.004 + 0.016 * min(1.0, (x_ - 594) / 40.0)
    return (-w, w, t, 0.45)
patch(h_, [594.0, 596.0, 602.0, 610.0, 620.0, 635.0, 660.0, 682.0], fair, Z_RAIL, n=11)
Z_RAILB = R0 - 0.008; Z_TOP = R0 + 0.022
h_.prism((0, y(672), (Z_RAILB + Z_TOP) / 2), (0, y(864), (Z_RAILB + Z_TOP) / 2), 0.046, Z_TOP - Z_RAILB, side=(1, 0, 0), zone=Z_RAIL)
h_.prism((0, y(676), Z_TOP + 0.003), (0, y(860), Z_TOP + 0.003), 0.070, 0.006, side=(1, 0, 0), zone=Z_RAIL)
LUG_TOP = R0 + 0.075
for x_, up_ in ((686.0, LUG_TOP - 0.006), (858.0, LUG_TOP)):                     # упоры: стойка и загнутый к носу верх
    h_.prism((0, y(x_), Z_TOP), (0, y(x_), up_ - 0.004), 0.024, 0.020, side=(1, 0, 0), zone=Z_METAL)
    h_.prism((0, y(x_ + 3), up_ - 0.004), (0, y(x_ - 11), up_ - 0.004), 0.024, 0.008, side=(1, 0, 0), zone=Z_METAL)
    for sg in (-1, 1): h_.prism((sg * 0.013, y(x_ + 5), Z_TOP + 0.004), (sg * 0.013, y(x_ - 4), up_ - 0.022), 0.004, 0.014, side=YA, zone=Z_METAL)
for x_, w_, h2 in ((505.0, 0.020, 0.024), (514.0, 0.020, 0.020), (712.0, 0.058, 0.038), (778.0, 0.058, 0.038), (838.0, 0.078, 0.040)):      # бобышки и накладки вдоль рельса
    h_.prism((0, y(x_ - 3.5), R0 + h2 / 2 - 0.004), (0, y(x_ + 3.5), R0 + h2 / 2 - 0.004), w_, h2, side=(1, 0, 0), zone=Z_METAL if x_ < 600 else Z_RAIL)
hanger = h_.obj()

# ── накладки и шайбы под крыльями и оперением ──
c_ = M('A45_mounts'); RUD_X = 535.0; RROOT = R0 + 0.0055
for ph in PHI:
    d = D(ph); a = A_(ph)
    c_.prism(d * (R0 + 0.0005) + YA * y(487), d * (R0 + 0.0005) + YA * y(593), 0.022, 0.006, side=a, zone=Z_WHITE)
    c_.lathe([(0.021, -0.003), (0.021, 0.0018), (0.018, 0.0034)], 10, mat(d * R0 + YA * y(RUD_X), d, YA), Z_METAL)
    c_.prism(d * (R0 + 0.0015) + YA * y(868), d * (R0 + 0.0015) + YA * y(960), 0.024, 0.010, side=a, zone=Z_WHITE)
mounts = c_.obj()

# ── крылья: контур снят с референс_3 и референс_1; ось по радиусу через x = 532; в файле угол 0 ──
WING = [(490.0, RROOT), (593.0, 0.443), (601.0, 0.455), (627.0, 0.455), (633.0, 0.446), (590.0, RROOT)]
rudders = []
for i, ph in enumerate(PHI):
    d = D(ph); pv = d * R0 + YA * y(RUD_X); k = M(f'rudder{i + 1}', pv)
    k.foil([(y(x_), r_) for x_, r_ in WING], plane(ph), 0.0125, 0.0028, 0.020, Z_WING)
    rudders.append(k.obj())

# ── оперение: неподвижное, задняя кромка до 96,5 % длины ──
f_ = M('A45_fins'); FIN = [(872.0, R0 - 0.004), (912.0, 0.320), (918.0, 0.33), (960.0, 0.33), (965.0, 0.321), (958.0, R0 - 0.004)]
for ph in PHI: f_.foil([(y(x_), r_) for x_, r_ in FIN], plane(ph), 0.010, 0.0028, 0.016, Z_FIN)
fins = f_.obj()

OBJS = [body, nozzle, hanger, mounts, fins, *rudders]
bpy.context.view_layer.update()
tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJS}; print('треугольников', sum(tris.values()), tris)
pts = [o.matrix_world @ v.co for o in OBJS for v in o.data.vertices]
print('габарит: длина', round(max(p.y for p in pts) - min(p.y for p in pts), 3), 'размах x', round(max(p.x for p in pts) - min(p.x for p in pts), 3), 'верх', round(max(p.z for p in pts), 4), 'низ', round(min(p.z for p in pts), 4))
tail_lim = min(p.y for p in pts) + 0.03 * L; wide = [p for p in pts if p.y < tail_lim]; print('последние 3 % длины: наибольший радиус', round(max(math.hypot(p.x, p.z) for p in wide), 4), 'при корпусе', RB_M, 'центр', round((max(p.x for p in wide) + min(p.x for p in wide)) / 2, 4), round((max(p.z for p in wide) + min(p.z for p in wide)) / 2, 4))
assert max(math.hypot(p.x, p.z) for p in wide) <= RB_M + 1e-4, 'в последних 3 % длины детали шире корпуса'
print(f'верх упоров {LUG_TOP:.4f}, верх крыльев {max((o.matrix_world @ v.co).z for o in rudders for v in o.data.vertices):.4f}, верх оперения {max((fins.matrix_world @ v.co).z for v in fins.data.vertices):.4f}')
PJ = dict(zones=ZN, S=S, X0=X0, rb=RB_M, lug_top=LUG_TOP, phi=PHI, rud_x=RUD_X, wing=WING, fin=FIN, th_w=TH_W)
_out = os.environ.get('A45_OUT', HERE); os.makedirs(os.path.join(_out, '_maps'), exist_ok=True); json.dump(PJ, open(os.path.join(_out, '_maps', 'parts.json'), 'w'), ensure_ascii=False)
print('build.py: готово')
