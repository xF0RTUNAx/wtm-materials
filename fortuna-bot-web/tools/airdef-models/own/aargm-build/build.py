# AARGM-ER - своя модель для "Воздушного превосходства" (ключ w_aargm, оружие aargm, база aargm, префикс ARG). Длина 4,1 м из задания; диаметр 0,31 м снят по пропорциям с поправкой на перспективу. Заменит AARGM, показанную сейчас моделью HARM.
# Картинки Mark (только справка по форме, ни геометрия, ни текстуры не копируются): референсы/01 (две схемы окраски, вид с хвоста), 04 (вид сбоку-сверху: с него сняты все положения по длине),
#   02 (вид спереди-сверху: площадки, ряды отверстий, ширина наплывов), 03 (фото: кончик наплыва, обтекатель). Логотипы и подписи с картинок не берутся.
# Метры, нос +Y (в glTF уйдёт в -Z), верх +Z (подвесные узлы), начало - середина длины на оси. x - доля длины от носа, 0...1000.
#   ARG_OUT="<папка модели>" Blender -b --factory-startup --python build.py [--python _collide.py] [--python bake_maps.py]
#
# СПИСОК ДЕТАЛЕЙ (сделано / пропущено):
#  + корпус одним телом с двумя боковыми наплывами: острый кончик за обтекателем, вогнутый переход в полку, острая кромка, снизу прямой скос, скруглённый конец у хвоста
#  + стыки геометрией: канавки на x = 133, 324, 745, 892; остальное - в текстуре и рельефе
#  + хвост сужается к круглому кольцу, сопло полое, внутри тёмная труба
#  + 4 руля крестом fin1...fin4: пятиугольные, у каждого своя ось по радиусу, тонкий вал, накладка-усилитель с обеих сторон; задняя кромка на 96,8 % длины, чтобы последние 3 % были свободны
#  + 2 подвесных узла на верхней линии: площадка и два низких упора
#  - крыльев посередине нет, складных частей нет
#  - логотипы, подпись DX..., надписи DO NOT HOLD и NO HOLD: не берутся; свои трафареты - в текстуре
import sys, os, math, random, json
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/AARGM-ER'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit'); sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Vector as V, Matrix
import modelkit as mk

random.seed(88); pi = math.pi
L = 4.1; S = L / 1000.0; X0 = 500.0; RB_M = 0.155
y = lambda x: (X0 - x) * S
mk.configure('AARGM', S, x0=X0, yc=0.0, rb=RB_M / S, nseg=54, nose='left')
ZN = ['paint', 'fin', 'patch', 'pad', 'metal', 'ring']
Z_PAINT, Z_FIN, Z_PATCH, Z_PAD, Z_METAL, Z_RING = range(len(ZN))
MATS = []
for n in ZN:
    m_ = bpy.data.materials.get('ARG_' + n) or bpy.data.materials.new('ARG_' + n); m_.use_nodes = True; MATS.append(m_)
UP = V((0, 0, 1)); YA = V((0, 1, 0))


def mat(o, z, x=None):
    z = V(z).normalized(); x = V(x) if x is not None else (V((1, 0, 0)) if abs(z.x) < 0.9 else V((0, 1, 0))); x = (x - z * x.dot(z)).normalized(); w = z.cross(x); o = V(o)
    return Matrix(((x.x, w.x, z.x, o.x), (x.y, w.y, z.y, o.y), (x.z, w.z, z.z, o.z), (0, 0, 0, 1)))


AX = mat((0, 0, 0), (0, 1, 0), (0, 0, -1))


class M:
    """Части одного объекта: зона - индекс материала; круглое помечается (1), нужное резким - тоже (2)."""
    def __init__(s, name, origin=(0, 0, 0)): s.name = name; s.origin = V(origin); s.bm = bmesh.new(); s.fl = s.bm.edges.layers.int.new('round'); s.uvl = s.bm.loops.layers.uv.new('preuv'); s.stl = s.bm.faces.layers.int.new('strip')

    def loft(s, rings, zone, closed=True, cap0=True, cap1=True, round_=True, loop=False):
        bm = s.bm; vs = [[bm.verts.new(p) for p in r] for r in rings]; fs = []; pairs = list(zip(vs, vs[1:]))
        for a, b in pairs:
            if len(a) == 1:
                for i in range(len(b)): fs.append(bm.faces.new((a[0], b[i], b[(i + 1) % len(b)])))
            elif len(b) == 1:
                for i in range(len(a)): fs.append(bm.faces.new((a[i], a[(i + 1) % len(a)], b[0])))
            else:
                n = len(a)
                for i in range(n if closed else n - 1): fs.append(bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i])))
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

    def lathe(s, prof, n, m_=None, zone=Z_PAINT, rot=0.0, cap0=True, cap1=True, round_=True, strip=True):
        m_ = m_ if m_ is not None else Matrix.Identity(4); rings = []
        for r_, z in prof:
            rings.append([m_ @ V((0, 0, z))] if r_ <= 1e-7 else [m_ @ V((r_ * math.cos(rot + 2 * pi * k / n), r_ * math.sin(rot + 2 * pi * k / n), z)) for k in range(n)])
        vs = s.loft(rings, zone, True, cap0, cap1, round_)
        if strip:
            im = m_.inverted()
            for f in s.last:
                if len(f.verts) == n:
                    f[s.stl] = 1
                    for l_ in f.loops:
                        q = im @ l_.vert.co; l_[s.uvl].uv = (q.x, q.y)
            ss = [0.0]
            for (r0, z0), (r1, z1) in zip(prof, prof[1:]): ss.append(ss[-1] + math.hypot(r1 - r0, z1 - z0))
            du = 2 * pi * (sum(r_ for r_, _ in prof) / len(prof)) / n
            for i in range(len(ss) - 1):
                a, b = vs[i], vs[i + 1]
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

    def prism(s, p0, p1, w, h, side=None, zone=Z_PAINT):
        p0, p1 = V(p0), V(p1); t = (p1 - p0).normalized(); side = V(side) if side is not None else (V((1, 0, 0)) if abs(t.x) < 0.9 else V((0, 1, 0))); sd = (side - t * side.dot(t)).normalized(); u = sd.cross(t)
        ring = lambda p: [p + sd * a + u * b for a, b in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))]
        return s.loft([ring(p0), ring(p1)], zone, True, True, True, False)

    def foil(s, pts, m_, t, te, inset, zone):
        """Пластина с заострёнными кромками: pts - контур (a, b) в осях m_, t - толщина посередине, te - у кромки, inset - ширина скоса."""
        c = sum((V(p) for p in pts), V((0, 0))) / len(pts); ins = []
        for p in pts:
            d = c - V(p); ins.append(V(p) + d.normalized() * min(inset, d.length * 0.45))
        ring = lambda P_, z: [m_ @ V((a.x if hasattr(a, 'x') else a[0], a.y if hasattr(a, 'y') else a[1], z)) for a in P_]
        vs = s.loft([ring(ins, -t / 2), ring(pts, -te / 2), ring(pts, te / 2), ring(ins, t / 2)], zone, True, True, True, False)
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

    def finish(s, sharp=math.radians(38), seam=math.radians(62)):
        bm = s.bm; bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for e in bm.edges:
            if len(e.link_faces) != 2: e.seam = True; e.smooth = False; continue
            a = e.calc_face_angle(0.0)
            e.smooth = False if e[s.fl] == 2 else (True if e[s.fl] == 1 else a < sharp)
            if a > seam and e[s.fl] != 1: e.seam = True

    def obj(s):
        s.finish()
        for v in s.bm.verts: v.co -= s.origin
        me = bpy.data.meshes.new(s.name); s.bm.to_mesh(me); s.bm.free(); o = bpy.data.objects.new(s.name, me); mk.col.objects.link(o); o.location = s.origin
        for m_ in MATS: me.materials.append(m_)
        return o


# ── профиль: доля радиуса по длине; снято с референса 04 с поправкой на перспективу ──
NOSE = [(0.0, 0.0), (1.2, 0.055), (3.0, 0.095), (6.0, 0.135), (11.0, 0.183), (19.0, 0.25), (28.0, 0.312), (37.0, 0.37), (50.0, 0.443), (63.0, 0.511), (76.0, 0.572), (89.0, 0.628), (102.0, 0.676), (115.0, 0.722), (128.0, 0.764), (140.0, 0.803), (153.0, 0.833), (165.0, 0.858), (182.0, 0.888), (205.0, 0.925), (230.0, 0.952), (260.0, 0.973), (290.0, 0.988), (340.0, 1.0)]
TAIL = [(900.0, 1.0), (908.0, 0.999), (918.0, 0.992), (925.0, 0.978), (932.0, 0.958), (938.0, 0.937), (944.0, 0.914), (950.0, 0.888), (958.0, 0.855), (968.0, 0.812), (980.0, 0.762), (989.0, 0.722), (995.0, 0.700), (998.5, 0.692), (1000.0, 0.668)]
PR = NOSE + [(470.0, 1.0), (600.0, 1.0), (745.0, 1.0), (850.0, 1.0), (880.0, 1.0), (892.0, 1.0)] + TAIL
def rf(x):
    for (x0, a), (x1, b) in zip(PR, PR[1:]):
        if x0 <= x <= x1: return a + (b - a) * (x - x0) / max(x1 - x0, 1e-6)
    return PR[-1][1] if x > PR[-1][0] else 0.0
Rb = lambda x: rf(x) * RB_M
SS = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(max(0.0, min(1.0, (x - a) / (b - a))))
# выход наплыва: острый кончик на x = 176, полная ширина к 340; сзади полка держится до 880 и скруглённо сходит на нет к 944
def chine(x):
    if x <= 176.0 or x >= 944.0: return 0.0
    if x < 340.0: return SS(176.0, 340.0, x) ** 0.85
    if x > 880.0: return math.sqrt(max(0.0, 1.0 - ((x - 880.0) / 64.0) ** 2))
    return 1.0


# ── сечение: в единицах радиуса. Кромка чуть ниже середины, сверху вогнутый переход и полка, снизу прямой скос по касательной к кругу ──
W_S = 0.42; TH0 = math.radians(-7.0); TH_U = math.radians(22.0); RE = 1.0 + W_S
EX, EZ = RE * math.cos(TH0), RE * math.sin(TH0); SX, SZ = EX - 0.20, EZ + 0.035; TH_L = TH0 - math.acos(1.0 / RE)
P0 = (math.cos(TH_U), math.sin(TH_U)); tu = (math.sin(TH_U), -math.cos(TH_U)); k_ = (P0[1] - (SZ + 0.02)) / (-tu[1]); CTRL = (P0[0] + tu[0] * k_, P0[1] + tu[1] * k_)
bez = lambda t: ((1 - t) ** 2 * P0[0] + 2 * t * (1 - t) * CTRL[0] + t * t * SX, (1 - t) ** 2 * P0[1] + 2 * t * (1 - t) * CTRL[1] + t * t * SZ)
UP_T = [0.0, 0.18, 0.36, 0.54, 0.72, 0.88, 1.0]
RIGHT = []                                                                        # снизу вверх: (угол на круге, точка сечения); hard - резкая продольная линия
for i in range(5):                                                                # нижний скос
    u = i / 4.0; RIGHT.append((TH_L + (TH0 - TH_L) * u, (math.cos(TH_L) + (EX - math.cos(TH_L)) * u, math.sin(TH_L) + (EZ - math.sin(TH_L)) * u), i == 4))
RIGHT.append((TH0 + 0.14 * (TH_U - TH0), (EX - 0.10, EZ + 0.0175), False))         # полка
for t in reversed(UP_T):
    a_ = TH_U - (TH_U - TH0) * 0.72 * (t)
    RIGHT.append((a_, bez(t), t == 1.0))
BOT_R = [(-pi / 2 + (TH_L + pi / 2) * k / 7.0) for k in range(1, 7)]                # между низом и началом скоса
TOP = [(TH_U + (pi - 2 * TH_U) * k / 17.0) for k in range(1, 17)]                   # верхняя дуга
RING = [(-pi / 2, (0.0, -1.0), False)]
for a_ in BOT_R: RING.append((a_, (math.cos(a_), math.sin(a_)), False))
RING += RIGHT
for a_ in TOP: RING.append((a_, (math.cos(a_), math.sin(a_)), False))
for a_, (cx, cz), h in reversed(RIGHT): RING.append((pi - a_, (-cx, cz), h))
for a_ in reversed(BOT_R): RING.append((pi - a_, (-math.cos(a_), math.sin(a_)), False))
NR = len(RING); HARD = [i for i, r_ in enumerate(RING) if r_[2]]
def ring_at(x, dr=0.0):
    R_ = Rb(x) - dr; s = chine(x); yy = y(x); out = []
    for a_, (cx, cz), h in RING:
        ox, oz = math.cos(a_), math.sin(a_); out.append(V(((ox + s * (cx - ox)) * R_, yy, (oz + s * (cz - oz)) * R_)))
    return out


# станции: канавки стыков дают по 4 кольца
GROOVES = (133.0, 324.0, 745.0, 892.0); GD = 0.0016; GW = 0.42
st = sorted(set([x_ for x_, _ in PR if x_ > 0.0] + [176.0, 190.0, 215.0, 245.0, 275.0, 305.0, 860.0, 870.0, 885.0, 898.0, 912.0, 930.0, 942.0, 943.9] + [g_ + d_ for g_ in GROOVES for d_ in (-GW, -GW * 0.45, GW * 0.45, GW)]))
st = [x_ for x_ in st if not any(abs(x_ - g_) < GW - 1e-6 and abs(abs(x_ - g_) - GW * 0.45) > 1e-6 for g_ in GROOVES)]
b = M('ARG_body'); bm = b.bm; tip = bm.verts.new(V((0, y(0.0), 0))); rings = []
for x_ in st:
    dr = GD if any(abs(abs(x_ - g_) - GW * 0.45) < 1e-6 for g_ in GROOVES) else 0.0
    rings.append([bm.verts.new(p) for p in ring_at(x_, dr)])
LIP_R = 0.625
rings.append([bm.verts.new(V((math.cos(a_) * LIP_R * RB_M, y(1000.0), math.sin(a_) * LIP_R * RB_M))) for a_, _c, _h in RING]); st.append(1000.0)
# развёртка заранее: полоса, ширина столбца - по полному сечению, шов снизу; длинный корпус разрезан на острова
full = [V((cx, 0, cz)) * RB_M for _, (cx, cz), _h in RING]; ucum = [0.0]
for i in range(NR): ucum.append(ucum[-1] + (full[(i + 1) % NR] - full[i]).length)
ss = [Rb(st[0]) if False else y(0.0) - y(st[0])]
for x0_, x1_ in zip(st, st[1:]): ss.append(ss[-1] + max((x1_ - x0_) * S, (0.668 - LIP_R) * RB_M if x1_ == x0_ else 0.0))
BREAK_X = (133.0, 324.0, 470.0, 600.0, 745.0, 892.0)
brk = lambda i: 10.0 * sum(1 for b_ in BREAK_X if st[i] > b_ + 1.0)
fs = []
for k in range(NR):
    k1 = (k + 1) % NR; f = bm.faces.new((tip, rings[0][k], rings[0][k1])); f.material_index = Z_PAINT; f.smooth = True; f[b.stl] = 1; fs.append(f)
    for l_ in f.loops:
        l_[b.uvl].uv = ((ucum[k] + ucum[k + 1]) / 2 * 1.0, 0.0) if l_.vert is tip else ((ucum[k] if l_.vert is rings[0][k] else ucum[k + 1]), ss[0])
for i in range(len(st) - 1):
    for k in range(NR):
        k1 = (k + 1) % NR; f = bm.faces.new((rings[i][k], rings[i][k1], rings[i + 1][k1], rings[i + 1][k])); f.material_index = Z_PAINT; f.smooth = True; f[b.stl] = 1
        o_ = brk(i)
        for l_ in f.loops:
            v = l_.vert; ii = i if (v is rings[i][k] or v is rings[i][k1]) else i + 1; uu = ucum[k] if (v is rings[i][k] or v is rings[i + 1][k]) else ucum[k + 1]; l_[b.uvl].uv = (uu, ss[ii] + o_)
    for k in range(NR):
        e = bm.edges.get((rings[i][k], rings[i + 1][k]))
        if e: e[b.fl] = 2 if (k in HARD and chine(st[i]) > 0.02 and chine(st[i + 1]) > 0.02) else 1
    # кончики наплывов: кольца с нулевой шириной должны оставаться гладкими
for k in range(NR):
    e = bm.edges.get((tip, rings[0][k]))
    if e: e[b.fl] = 1
for r_ in rings[:1]: pass
e = bm.edges.get((rings[0][0], rings[1][0]))
body = b.obj()

# ── сопло: тёмная внутренняя фаска и полая труба, всё уже корпуса ──
RN = rf(1000.0) * RB_M; BORE = 0.545 * RB_M
n_ = M('ARG_nozzle'); n_.lathe([(0.64 * RB_M, y(1000.0) - 0.0003), (0.612 * RB_M, y(999.3)), (BORE + 0.004, y(998.2)), (BORE, y(994.0)), (BORE, y(978.0)), (BORE, y(960.0)), (BORE * 0.93, y(925.0)), (BORE * 0.9, y(900.0)), (0.0, y(900.0))], 36, mat((0, 0, 0), (0, 1, 0), (0, 0, -1)), Z_RING, cap0=False)
nozzle = n_.obj()

# ── подвесные узлы на верхней линии: площадка-накладка, тёмная середина в текстуре, два низких упора ──
LUG_X = (506.0, 658.0); PAD_L = 17.5; PAD_TH = 0.30; PAD_T = 0.0042; LUG_TOP = RB_M + 0.034
h_ = M('ARG_lugs')
AT = lambda r_, th, x_: V((r_ * math.sin(th), y(x_), r_ * math.cos(th)))
def pad(m, xc, zone):
    xs = [xc - PAD_L, xc - PAD_L + 0.6, xc + PAD_L - 0.6, xc + PAD_L]; rings = []; n = 9
    for i_, x_ in enumerate(xs):
        t_ = 0.0 if i_ in (0, 3) else PAD_T; w_ = PAD_TH - (0.012 if i_ in (0, 3) else 0.0); ring = []
        for k in range(n):
            a_ = -w_ + 2 * w_ * k / (n - 1); ring.append(AT(RB_M + (t_ if 0 < k < n - 1 else 0.0) + 0.0003, a_, x_))
        ring.append(AT(RB_M - 0.006, w_, x_)); ring.append(AT(RB_M - 0.006, -w_, x_)); rings.append(ring)
    vs = m.loft(rings, zone, True, True, True, False)
    for i_ in range(3):
        for k in range(n - 1):
            f = m.bm.faces.get((vs[i_][k], vs[i_][k + 1], vs[i_ + 1][k + 1], vs[i_ + 1][k]))
            if f is None: continue
            f[m.stl] = 1
            for l_ in f.loops:
                ii = i_ if l_.vert in vs[i_] else i_ + 1; kk = vs[ii].index(l_.vert); l_[m.uvl].uv = (-PAD_TH * RB_M + 2 * PAD_TH * RB_M * kk / (n - 1), (xs[ii] - xs[0]) * S)
for xc in LUG_X:
    pad(h_, xc, Z_PAD)
    for dx_ in (-7.0, 7.0):
        h_.prism((0, y(xc + dx_), RB_M + 0.002), (0, y(xc + dx_), RB_M + 0.024), 0.022, 0.016, side=(1, 0, 0), zone=Z_METAL)
        h_.prism((0, y(xc + dx_ - 2.6), LUG_TOP - 0.005), (0, y(xc + dx_ + 2.6), LUG_TOP - 0.005), 0.044, 0.010, side=(1, 0, 0), zone=Z_METAL)
lugs = h_.obj()

# ── рули: пятиугольные, крестом; контур снят с дальнего верхнего руля на 04, сдвинут на 2,9 % вперёд ради свободного сопла; ось по радиусу через середину корня ──
PHI = (45.0, 135.0, 225.0, 315.0)
D = lambda ph: V((math.cos(math.radians(ph)), 0, math.sin(math.radians(ph))))
A_ = lambda ph: V((-math.sin(math.radians(ph)), 0, math.cos(math.radians(ph))))
def plane(ph, off=0.0):
    d = D(ph); a = A_(ph)
    return Matrix(((0, d.x, a.x, a.x * off), (1, d.y, a.y, a.y * off), (0, d.z, a.z, a.z * off), (0, 0, 0, 1)))


FIN_X = 932.0; R_FT = 2.5 * RB_M; R_F0 = RB_M + 0.008; R_F1 = 0.92 * RB_M; R_KN = 0.5 * (R_F1 + R_FT)
FIN = [(903.0, R_F0), (921.0, R_FT), (952.0, R_FT), (968.0, R_KN), (962.0, R_F1)]
fins = []
for i, ph in enumerate(PHI):
    d = D(ph); a = A_(ph); pv = d * Rb(FIN_X) + YA * y(FIN_X); k = M(f'fin{i + 1}', pv)
    k.foil([(y(x_), r_) for x_, r_ in FIN], plane(ph), 0.017, 0.0036, 0.020, Z_FIN)
    r0_ = R_F0 - 0.004; r1_ = r0_ + 0.074; yc_ = y(FIN_X)
    for sg in (-1, 1):
        k.prism(d * r0_ + YA * yc_ + a * sg * 0.0068, d * r1_ + YA * yc_ + a * sg * 0.0068, 0.060, 0.0056, side=YA, zone=Z_PATCH)
    fins.append(k.obj())

# ── валы рулей: шайба на корпусе и тонкий вал до корня, зазор 2 мм ──
c_ = M('ARG_mounts'); rl_ = Rb(FIN_X); r_root = R_F0 + (R_F1 - R_F0) * (FIN_X - 903.0) / (962.0 - 903.0)
for ph in PHI:
    d = D(ph)
    c_.lathe([(0.018, rl_ - 0.006), (0.018, rl_ + 0.0009), (0.009, rl_ + 0.0014), (0.009, r_root - 0.0012), (0.0, r_root - 0.0012)], 8, mat(YA * y(FIN_X), d, YA), Z_PAD, cap0=False)
mounts = c_.obj()

OBJS = [body, nozzle, lugs, mounts, *fins]
bpy.context.view_layer.update()
tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJS}; print('треугольников', sum(tris.values()), tris)
pts = [o.matrix_world @ v.co for o in OBJS for v in o.data.vertices]
print('габарит: длина', round(max(p.y for p in pts) - min(p.y for p in pts), 3), 'размах x', round(max(p.x for p in pts) - min(p.x for p in pts), 3), 'верх', round(max(p.z for p in pts), 4), 'низ', round(min(p.z for p in pts), 4))
tail_lim = min(p.y for p in pts) + 0.03 * L; wide = [p for p in pts if p.y < tail_lim]; print('последние 3 % длины: наибольший радиус', round(max(math.hypot(p.x, p.z) for p in wide), 4), 'при корпусе', RB_M, 'центр', round((max(p.x for p in wide) + min(p.x for p in wide)) / 2, 4), round((max(p.z for p in wide) + min(p.z for p in wide)) / 2, 4))
assert max(math.hypot(p.x, p.z) for p in wide) <= RB_M + 1e-4, 'в последних 3 % длины детали шире корпуса'
print(f'верх узлов {LUG_TOP:.4f}, кромка наплыва x {RB_M * RE:.4f}, верх рулей {max((o.matrix_world @ v.co).z for o in fins for v in o.data.vertices):.4f}')
PJ = dict(zones=ZN, S=S, X0=X0, rb=RB_M, lug_top=LUG_TOP, lug_x=LUG_X, pad_l=PAD_L, pad_th=PAD_TH, phi=PHI, fin_x=FIN_X, fin=FIN, r_ft=R_FT, r_f0=R_F0, r_f1=R_F1, prof=PR, re=RE, nozzle_r=RN, bore=BORE, grooves=GROOVES)
_out = os.environ.get('ARG_OUT', HERE); os.makedirs(os.path.join(_out, '_maps'), exist_ok=True); json.dump(PJ, open(os.path.join(_out, '_maps', 'parts.json'), 'w'), ensure_ascii=False)
print('build.py: готово')
