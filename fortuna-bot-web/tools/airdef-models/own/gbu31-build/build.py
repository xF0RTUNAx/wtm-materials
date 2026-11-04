# GBU-31 JDAM - своя модель для "Воздушного превосходства" (ключ w_gbu31, оружие gbu31, база gbu31, префикс G31). Длина 3,88 м, как у прежней модели в игре.
# Картинки Mark: референс_1.png (3/4 на тёмном фоне) и референс_2.png (двойной рендер на чёрном) - образец формы и окраски; референс_4.png - вид сбоку, нос слева: с него сняты все числа (синий поясок и надписи учебного изделия не берутся);
#   референс_3.webp - музейное фото: швы и хвост (жёлтый нос, взрыватель, таблички и подставка не берутся); референс_5.png - только посмотреть хвост и люк, из него ничего не взято.
# Метры, нос +Y (в glTF уйдёт в -Z), верх +Z (проушины), начало - середина длины на оси. Рули стоят крестом: на референс_4 корни ближних рулей лежат на 0,707 радиуса трубы.
#   G31_OUT="<папка модели>" Blender -b --factory-startup --python build.py [--python bake_maps.py]
#
# СПИСОК ДЕТАЛЕЙ (сделано / пропущено):
#  + нос: кончик и оживало; корпус вращением по снятому профилю; жёлтый поясок и надписи - в текстуре
#  + верхняя накладка с плавной передней и задней кромкой, поперечными выемками и боковыми вырезами; две проушины на её осевой линии
#  + белые пояса, тонкие ленты снизу, защёлки; боковые рамки с овальными окнами (окна - в текстуре), рейки, горизонтальные крылья-наплывы
#  + задняя планка от накладки к хвосту с разъёмом
#  + хвостовой блок: фланец, конус, второй фланец, труба с круглым концом; заклёпки, люк, стыки - в текстуре и рельефе
#  + 4 руля "крестом": fin1...fin4, у каждого своя ось по радиусу; накладки и шайбы под корнями
#  - жёлтый нос и взрыватель (другой вариант на музейном фото), таблички, подставка, логотипы: не берутся
import sys, os, math, random, json
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/GBU-31'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit'); sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Vector as V, Matrix
import modelkit as mk

random.seed(31); pi = math.pi
S = 3.88 / 981.0; X0 = 506.5                                                     # м на пиксель референс_4 (x 16...997), середина длины
y = lambda x: (X0 - x) * S
rp = lambda p: p * S
mk.configure('GBU31', S, x0=X0, yc=110.0, rb=57.0, nseg=32, nose='left')
ZN = ['olive', 'white', 'saddle', 'lug', 'dark', 'fin', 'tipn', 'strap', 'frame']
Z_PAINT, Z_WHITE, Z_SADDLE, Z_LUG, Z_DARK, Z_FIN, Z_TIP, Z_STRAP, Z_FRAME = range(len(ZN)); Z_STEEL = Z_LUG
MATS = []
for n in ZN:
    m_ = bpy.data.materials.get('G31_' + n) or bpy.data.materials.new('G31_' + n); m_.use_nodes = True; MATS.append(m_)
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
D = lambda ph: V((math.cos(math.radians(ph)), 0, math.sin(math.radians(ph))))     # от оси наружу по кресту
A_ = lambda ph: V((-math.sin(math.radians(ph)), 0, math.cos(math.radians(ph))))


def plane(ph, off=0.0):
    """Оси плоскости креста: x - вдоль оси бомбы к носу, y - радиус наружу, z - поперёк."""
    d = D(ph); a = A_(ph)
    return Matrix(((0, d.x, a.x, a.x * off), (1, d.y, a.y, a.y * off), (0, d.z, a.z, a.z * off), (0, 0, 0, 1)))


PROF = [(0, 16.2), (4.0, 19.0), (8.5, 24.0), (13.0, 30.4), (14.0, 31.5), (23.75, 60), (30.0, 80), (35.0, 100), (41.5, 135), (45.9, 165), (50.25, 210), (53.5, 240), (55.5, 270), (57.0, 320), (57.0, 580), (56.0, 620), (54.0, 650), (52.3, 670)]
TAILP = [(50.2, 667), (51.3, 672), (51.5, 680), (50.4, 681), (46.9, 710), (43.4, 740), (38.75, 780), (33.0, 830), (29.2, 858), (30.2, 860), (30.2, 866), (28.5, 867.5), (25.0, 880), (19.8, 905), (16.8, 930), (15.0, 950), (14.2, 975), (13.5, 985), (10.0, 992), (5.5, 995.6), (0, 997)]


def interp(P_, x):
    for (r0, x0), (r1, x1) in zip(P_, P_[1:]):
        if x0 <= x <= x1: return r0 + (r1 - r0) * (x - x0) / max(x1 - x0, 1e-6)
    return P_[-1][0] if x > P_[-1][1] else P_[0][0]


Rb = lambda x: rp(interp(PROF, x))
Rt = lambda x: rp(interp(TAILP, x))
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


# ── корпус и нос ──
b = M('G31_body'); b.rev(PROF, 32, Z_PAINT)
body = b.obj()

# ── верхняя накладка: скругление спереди и сзади, поперечные выемки, боковые вырезы у поясов ──
NOTCH = ((336.0, 359.0), (468.0, 491.0))
def sad(x_):
    w = 0.74
    if x_ < 264: w = 0.10 + 0.64 * math.sqrt(max(0.0, (x_ - 251) / 13.0))
    if x_ > 577: w = 0.10 + 0.64 * math.sqrt(max(0.0, (591 - x_) / 14.0))
    t = 0.0135
    for a_, b_ in NOTCH:
        if a_ <= x_ <= b_:
            q = 1 - abs((x_ - (a_ + b_) / 2) / ((b_ - a_) / 2)); w -= 0.24 * min(1.0, q * 2.2); t = 0.0135 - 0.0095 * min(1.0, q * 2.2)
    return (-w, w, t, 0.55)
XS = sorted({251.0, 252.0, 254.0, 257.0, 260.0, 264.0, 300.0, 336.0, 341.0, 347.5, 354.0, 359.0, 400.0, 440.0, 468.0, 473.0, 479.5, 486.0, 491.0, 530.0, 577.0, 581.0, 584.0, 587.0, 590.0, 591.0})
sd = M('G31_saddle'); patch(sd, XS, sad, Z_SADDLE, n=11)
# проушины на осевой линии накладки: площадка и кольцо, отверстие вдоль оси бомбы
LUG_TOP = rp(75.0); LUG_X = (313.0, 511.0); Z0 = Rb(400) + 0.0135
for x_ in LUG_X:
    yy = y(x_)
    sd.prism((0, yy + 0.046, Z0 - 0.003), (0, yy - 0.046, Z0 - 0.003), 0.104, 0.012, side=(1, 0, 0), zone=Z_LUG)
    for sg in (-1, 1):
        sd.prism((sg * 0.040, yy, Z0), (sg * 0.028, yy, LUG_TOP - 0.006), 0.032, 0.015, side=YA, zone=Z_LUG)
    sd.prism((-0.0355, yy, LUG_TOP - 0.0072), (0.0355, yy, LUG_TOP - 0.0072), 0.030, 0.0144, side=YA, zone=Z_LUG)
# средний блок накладки между проушинами и две боковые ступени у выемок: на образце накладка объёмная
patch(sd, [364.0, 368.0, 390.0, 440.0, 458.0, 462.0], lambda x_: ((-0.10, 0.10, 0.0145, 0.0) if x_ in (364.0, 462.0) else (-0.27, 0.27, 0.0195, 0.25)), Z_SADDLE, n=7)
for a0_, a1_ in ((300.0, 332.0), (495.0, 527.0)):
    for sg in (-1, 1):
        patch(sd, [a0_, a0_ + 5.0, a1_ - 5.0, a1_], (lambda sg_: (lambda x_: ((sg_ * 0.42, sg_ * 0.70, 0.0155, 0.1) if sg_ > 0 else (-0.70, -0.42, 0.0155, 0.1)) if x_ not in (a0_, a1_) else ((0.54, 0.60, 0.0138, 0.0) if sg_ > 0 else (-0.60, -0.54, 0.0138, 0.0))))(sg), Z_SADDLE, n=4)
# задняя планка от накладки к хвосту и разъём на ней
sd.prism((0, y(562), rp(63.0) - 0.024), (0, y(716), rp(47.6) - 0.024), 0.052, 0.048, side=(1, 0, 0), zone=Z_WHITE)
_kz = rp(63.0) - (582 - 562) / (716 - 562) * rp(15.4)
sd.lathe([(0.021, -0.004), (0.021, 0.0075), (0.017, 0.0085), (0.017, 0.016), (0.012, 0.0185)], 12, mat((0, y(582), _kz), UP), Z_DARK, cap0=False)
saddle = sd.obj()

# ── пояса, рамки, рейки, горизонтальные крылья-наплывы ──
s_ = M('G31_strakes'); TH_P = math.radians(142.0); ZP = -rp(45.0); LAT0 = rp(35.0)
for x0_, x1_ in ((258.0, 276.0), (556.0, 574.0)):
    for sg in (-1, 1):
        patch(s_, [x0_, x1_], (lambda sg_: (lambda x_: (sg_ * 0.66, sg_ * (TH_P + 0.03), 0.0045, 0.0) if sg_ > 0 else (-TH_P - 0.03, -0.66, 0.0045, 0.0)))(sg), Z_STRAP, n=11)
        th_c = sg * 0.80; s_.prism(AT(Rb(x0_) + 0.0085, th_c, x0_ + 3), AT(Rb(x0_) + 0.0085, th_c, x1_ - 3), 0.040, 0.012, side=V((math.cos(th_c), 0, -math.sin(th_c))), zone=Z_LUG)   # защёлка на стыке с накладкой
    patch(s_, [x0_ + 7, x0_ + 11], lambda x_: (TH_P, 2 * pi - TH_P, 0.0025, 0.0), Z_DARK, n=9)                                                   # тонкая лента снизу
XF = [258.0, 264.0, 274.0, 400.0, 556.0, 566.0, 572.0]
for sg in (-1, 1):
    def fr(x_, sg=sg):
        k = min(1.0, (x_ - 258.0) / 16.0, (572.0 - x_) / 16.0); th1 = TH_P + 0.10 + 0.38 * max(0.0, k) ** 0.5; return (TH_P - 0.02, th1, 0.0055, 0.0) if sg > 0 else (-th1, -TH_P + 0.02, 0.0055, 0.0)
    patch(s_, XF, fr, Z_FRAME, n=5)
    # рейка над крылом и само крыло: плоское, горизонтальное, в виде сбоку видно с ребра
    th_r = sg * (TH_P - 0.045); r_ = Rb(400) + 0.008
    s_.prism((r_ * math.sin(th_r), y(256), r_ * math.cos(th_r)), (r_ * math.sin(th_r), y(574), r_ * math.cos(th_r)), 0.034, 0.016, side=V((math.cos(th_r), 0, -math.sin(th_r))), zone=Z_STRAP)
    M_p = Matrix(((0, sg, 0, 0), (1, 0, 0, 0), (0, 0, 1, ZP), (0, 0, 0, 1)))
    s_.foil([(y(262.0), LAT0 - 0.012), (y(292.0), rp(77.0)), (y(538.0), rp(77.0)), (y(568.0), LAT0 - 0.012)], M_p, 0.010, 0.0035, 0.014, Z_STRAP)
strakes = s_.obj()

# ── хвостовой блок: фланец, конус, второй фланец, труба с круглым концом; накладки и шайбы под рулями ──
t = M('G31_tail'); t.rev(TAILP, 28, Z_WHITE)
FIN_X = 930.0; rt = lambda x_: rp(interp(TAILP, x_)); ROOT = 0.0058
for ph in PHI:
    d = D(ph); a = A_(ph)
    t.prism(d * (rt(900) + 0.0005) + YA * y(900), d * (rt(953) + 0.0005) + YA * y(953), 0.024, 0.0066, side=a, zone=Z_WHITE)
    t.lathe([(0.0165, -0.003), (0.0165, 0.0018), (0.014, 0.0034)], 10, mat(d * rt(FIN_X) + YA * y(FIN_X), d, YA), Z_LUG)
tail = t.obj()

# ── рули: контур снят с референс_4, ось по радиусу через x = 930; в файле угол 0 ──
FIN = [(871.0, None), (905.0, None), (950.0, None), (982.0, None), (996.0, 84.0), (934.0, 84.0)]
fins = []
for i, ph in enumerate(PHI):
    d = D(ph); pv = d * rt(FIN_X) + YA * y(FIN_X); f_ = M(f'fin{i + 1}', pv)
    pts = [(y(x_), (rt(x_) + ROOT) if r_ is None else rp(r_)) for x_, r_ in FIN]
    f_.foil(pts, plane(ph), 0.0125, 0.003, 0.022, Z_FIN)
    fins.append(f_.obj())

OBJS = [body, saddle, strakes, tail, *fins]
bpy.context.view_layer.update()
tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJS}; print('треугольников', sum(tris.values()), tris)
pts = [o.matrix_world @ v.co for o in OBJS for v in o.data.vertices]
print('габарит: длина', round(max(p.y for p in pts) - min(p.y for p in pts), 3), 'размах x', round(max(p.x for p in pts) - min(p.x for p in pts), 3), 'верх', round(max(p.z for p in pts), 4), 'низ', round(min(p.z for p in pts), 4))
ftop = max((o.matrix_world @ v.co).z for o in fins for v in o.data.vertices); print(f'верх проушин {LUG_TOP:.4f}, верх рулей {ftop:.4f}')
assert ftop < LUG_TOP, 'рули выше проушин'
PJ = dict(zones=ZN, S=S, X0=X0, lug_x=LUG_X, lug_top=LUG_TOP, rb=rp(57.0), phi=PHI, fin_x=FIN_X, prof=PROF, tailp=TAILP, th_p=TH_P, zp=ZP, notch=NOTCH)
_out = os.environ.get('G31_OUT', HERE); os.makedirs(os.path.join(_out, '_maps'), exist_ok=True); json.dump(PJ, open(os.path.join(_out, '_maps', 'parts.json'), 'w'), ensure_ascii=False)
print('build.py: готово')
