# КАБ-500Кр - своя игровая модель по четырём картинкам Mark (Свои/КАБ-500Кр/). Картинки только образец: свои меши, пиксели в текстуру не берём, надписи свои.
# референс_4 (516 × 387) - вид сбоку на белом, нос слева: главный образец силуэта и расположения деталей. Все x и радиусы ниже - его пиксели (ось y = 174, остриё стекла x = 20, конец хвостовых крыльев x = 492).
# референс_2 (2000 × 1092) - крупное фото КАБ-500 ОД: швы, накладки, планки, стекло с сеткой, колодки; референс_1 - выставочное фото; референс_3 - серый рендер: мелочи формы (короб снизу, кронштейны, отверстия).
# Надписи ИНЕРТНАЯ, КАБ-500 ОД, зоны опор и краска рендера не переносятся. Соседние ракеты и подставки не собираем.
# Масштаб: 3,05 м по прежней фигуре игры на всю длину с крыльями. Ø корпуса по картинке 0,36 м. Перья и крылья крестом × к проушинам.
# Запуск (фоновый Blender): K5K_OUT="<папка>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
#
# СПИСОК ДЕТАЛЕЙ (сделано / пропущено):
#  + корпус вращением: оживальный нос, цилиндр, плечо и шейка перед хвостом, хвостовая часть, плоский торец, полость за стеклом с тёмной переборкой
#  + стекло - прозрачный купол (K5K_glass), сетка поверх него (K5K_grid, сетка квадратами как на референсе_3)
#  + телевизионная головка за стеклом на шарнире (K5K_head, начало в центре шарнира) и неподвижная вилка (K5K_gimbal)
#  + 4 передних коротких руля (canard_0…3, ось радиальная в середине корня) на неподвижных накладках (K5K_plates)
#  + 4 хвостовых крыла (wing_0…3, начало в середине корня на планке) на неподвижных планках с проушинами шарнира (K5K_strips)
#  + две проушины-арки сверху на осевой линии, две колодки рядом с ними, крышка сверху, короб вдоль низа, кронштейны на плече (K5K_fixed)
#  - швы, заклёпки, болты, круглые лючки, красная полоса кромки, надписи - цветом и рельефом в bake.py, не геометрией
#  - пунктиры зон опор и надписи выставочных изделий - не переносим по заданию
# В файле нос +Y (в glTF уйдёт в -Z), верх +Z (в glTF +Y), начало на оси, середина длины, все углы 0.
import sys, os, math, importlib
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
import bpy
import modelkit as mk; importlib.reload(mk)
from modelkit import B, Vector, circ, Y

LEN_M = 3.05
X_TIP, X_END = 20.0, 492.0
S = LEN_M / (X_END - X_TIP)            # метров на пиксель (≈ 6,46 мм)
X0, YC, RB = (X_TIP + X_END) / 2, 174.0, 28.0
NSEG = 36
mk.configure('KAB500KR', S, x0=X0, yc=YC, rb=RB, nseg=NSEG, nose='left')
G_BODY, G_STEEL, G_BLOCK, G_GLASS, G_LENS, G_OPTIC, G_GRID = 0, 1, 2, 3, 4, 5, 6
mk.set_materials([('K5K_body', (0.15, 0.17, 0.195)), ('K5K_steel', (0.05, 0.05, 0.055)), ('K5K_block', (0.52, 0.40, 0.22)), ('K5K_glass', (0.020, 0.024, 0.028)), ('K5K_lens', (0.06, 0.08, 0.12)), ('K5K_optic', (0.10, 0.10, 0.11)), ('K5K_grid', (0.62, 0.63, 0.62))])
for m, (rough, metal) in zip(mk.MATS, ((0.52, 0.0), (0.55, 0.3), (0.55, 0.1), (0.06, 0.0), (0.05, 0.85), (0.42, 0.7), (0.45, 0.4))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
gm = bpy.data.materials['K5K_glass']; gb = next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); gb.inputs['Alpha'].default_value = 0.34
try: gm.surface_render_method = 'BLENDED'
except Exception: pass
MM = lambda v: v / 1000.0 / S          # миллиметры → пиксели картинки
PHI = (45.0, 135.0, 225.0, 315.0)


def axes(phi):
    ph = math.radians(phi)
    return Vector((math.cos(ph), 0.0, math.sin(ph))), Vector((-math.sin(ph), 0.0, math.cos(ph)))


def P(x, r, w, er, et):
    return Vector((0.0, Y(x), 0.0)) + (er * r + et * w) * S


# ── профиль корпуса ──
A_DOME, B_DOME = 25.0, 28.0            # нос - половина эллипса от x = 20 (снято по референсу_4: x 27 → 17, x 39 → 26,5)
def dome_r(x):
    t = (A_DOME - (x - X_TIP)) / A_DOME
    return B_DOME * math.sqrt(max(0.0, 1.0 - t * t))


X_RIM = 28.6; R_RIM = dome_r(X_RIM)    # край стекла; на референсе_2 стекло ≈ 3/4 диаметра
X_BODY_END = 485.0
OUTER = [(x, dome_r(x)) for x in (30.0, 32.0, 35.0, 38.0, 41.0, 45.0)] + [(50.0, 28.0), (372.0, 28.0), (376.0, 27.6), (381.0, 25.9), (395.0, 25.6), (420.0, 26.4), (470.0, 27.3), (X_BODY_END - 1.0, 27.5), (X_BODY_END, 26.4)]


def R_at(x):
    if x <= OUTER[0][0]: return dome_r(x)
    for (x0, r0), (x1, r1) in zip(OUTER, OUTER[1:]):
        if x0 <= x <= x1: return r0 + (r1 - r0) * (x - x0) / (x1 - x0)
    return OUTER[-1][1]


X_WELL = 62.0
def with_seams(pts):
    """Канавки и приподнятый пояс на цилиндре: швы секций читаются формой, а не только цветом."""
    out = []
    for x, r in pts:
        out.append((x, r))
        if x == 50.0:
            for xg in (58.0, 92.0):
                out += [(xg - 0.55, 28.0), (xg - 0.2, 27.55), (xg + 0.2, 27.55), (xg + 0.55, 28.0)]
            out += [(124.4, 28.0), (124.9, 28.42), (129.1, 28.42), (129.6, 28.0)]            # пояс за передними рулями (двойная линия на референсах 2 и 3)
            for xg in (222.5, 338.0):
                out += [(xg - 0.55, 28.0), (xg - 0.2, 27.55), (xg + 0.2, 27.55), (xg + 0.55, 28.0)]
    return out


base = [(X_WELL, 0.6), (X_WELL, R_RIM - 1.0), (X_RIM + 2.5, R_RIM - 0.9), (X_RIM + 0.1, R_RIM - 0.4), (X_RIM - 0.2, R_RIM + 0.5)] + with_seams(OUTER) + [(X_BODY_END, 0.8)]
b = B(); b.loft([circ(x, r) for x, r in base], G_BODY, cap0=G_BODY, cap1=G_BODY); body = b.finish('K5K_body', sharp_deg=40)
print('корпус: колец', len(base))

# ── стекло и сетка ──
def cap_pt(x_, z_):
    """Точка на куполе стекла по боковым координатам (пикс.), чуть выпуклее эллипса носа, чтобы блестело."""
    r = math.hypot(x_, z_); dx = A_DOME * (1.0 - math.sqrt(max(0.0, 1.0 - (min(r, B_DOME * 0.999) / B_DOME) ** 2)))
    return Vector((x_ * S, Y(X_TIP + dx - 0.15 * (1.0 - (r / R_RIM) ** 2)), z_ * S))


rg = B(); rings = []
for k in range(7):
    t = (k + 0.2) / 6.2 if k < 6 else 1.0; r = R_RIM * math.sin(t * math.pi / 2) if k < 6 else R_RIM - 0.25
    rings.append([cap_pt(r * math.cos(2 * math.pi * j / NSEG), r * math.sin(2 * math.pi * j / NSEG)) for j in range(NSEG)])
rg.loft(rings[::-1], G_GLASS, cap1=G_GLASS); glass = rg.finish('K5K_glass', sharp_deg=80)
GRID_N, GRID_W = 9, MM(1.15)            # линий в каждую сторону, полуширина ленты
gr = B(); RL = R_RIM - 0.45; OFF = Vector((0.0, 0.0009, 0.0))
for i in range(GRID_N):
    c = -RL + (i + 1) * 2 * RL / (GRID_N + 1); half = math.sqrt(RL * RL - c * c)
    for horiz in (False, True):
        lv = lambda u, d: cap_pt(u, c + d) + OFF if horiz else cap_pt(c + d, u) + OFF
        st = [-half + 2 * half * j / 12 for j in range(13)]
        rg_ = [[lv(u, -GRID_W), lv(u, GRID_W)] for u in st]
        for j in range(12):
            ids = [gr.bm.verts.new(p) for p in (rg_[j][0], rg_[j][1], rg_[j + 1][1], rg_[j + 1][0])]; f = gr.bm.faces.new(ids); f.material_index = G_GRID
import bmesh
for f in gr.bm.faces: f.normal_update()
for f in gr.bm.faces:
    if f.normal.y < 0: f.normal_flip()
gme = bpy.data.meshes.new('K5K_grid'); gr.bm.to_mesh(gme); gr.bm.free()
for m in mk.MATS: gme.materials.append(m)
for pl in gme.polygons: pl.use_smooth = True
grid = bpy.data.objects.new('K5K_grid', gme); mk.col.objects.link(grid)

# ── головка на шарнире (начало в центре шарнира) и вилка ──
X_HEAD = 41.0; O_HEAD = Vector((0.0, Y(X_HEAD), 0.0))
NF = 20
def hrings(prof): return [[v - O_HEAD for v in circ(x, r, n=NF)] for x, r in prof]
bh = B()
bh.loft(hrings([(31.2, 0.8), (31.6, 4.0), (33.0, 7.0), (34.6, 8.4)]), G_LENS, cap0=G_LENS)
bh.loft(hrings([(34.2, 8.2), (34.4, 9.8), (35.6, 10.4), (46.0, 10.4), (47.0, 8.6), (53.0, 8.6), (53.6, 6.0)]), G_OPTIC, cap1=G_OPTIC)
head = bh.finish('K5K_head', sharp_deg=45); head.location = O_HEAD
bg = B()
bg.loft([circ(x, r, n=24) for x, r in ((39.0, 12.4), (39.0, 13.8), (43.0, 13.8), (43.0, 12.4), (39.0, 12.4))], G_OPTIC)
for s in (-1, 1):                       # цапфы вилки в стенку полости
    ring = lambda w: [Vector((s * w * S, Y(X_HEAD) + 0.009 * math.cos(2 * math.pi * j / 8), 0.009 * math.sin(2 * math.pi * j / 8))) for j in range(8)]
    bg.loft([ring(13.4), ring(R_RIM - 0.5)], G_OPTIC, cap1=G_OPTIC)
gimbal = bg.finish('K5K_gimbal', sharp_deg=45)
bb = B()
import random as _r
_r.seed(82)
for k in range(9):                      # блоки электроники на переборке за вилкой (на крупном фото за стеклом видна начинка)
    a = 2 * math.pi * k / 9 + 0.2; rr = 16.2 if k % 2 else 12.6; ca, sa = math.cos(a), math.sin(a)
    hw, hh, d = _r.uniform(1.6, 3.0), _r.uniform(1.2, 2.2), _r.uniform(2.5, 4.8)
    sq = lambda x: [Vector(((rr * ca + u * hw * ca - v * hh * sa) * S, Y(x), (rr * sa + u * hw * sa + v * hh * ca) * S)) for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    bb.loft([sq(X_WELL + 0.2), sq(X_WELL - d)], G_STEEL, cap1=G_STEEL)
for k, (a0, ra, rb2, xa, xb) in enumerate(((0.3, 18.5, 12.0, 61.0, 58.0), (1.7, 18.5, 11.0, 61.0, 58.0), (3.2, 19.0, 13.0, 61.0, 58.0), (4.6, 18.5, 12.0, 61.0, 58.0))):       # провода петлями к головке
    pts = [(ra + (rb2 - ra) * t, xa + (xb - xa) * t + 1.0 * math.sin(t * math.pi) * (-1), a0 + 0.5 * t) for t in [j / 6 for j in range(7)]]
    rng = lambda i: [Vector(((pts[i][0] * math.cos(pts[i][2]) + 0.5 * math.cos(2 * math.pi * q / 5) * math.cos(pts[i][2])) * S, Y(pts[i][1] + 0.5 * math.sin(2 * math.pi * q / 5)), (pts[i][0] * math.sin(pts[i][2]) + 0.5 * math.cos(2 * math.pi * q / 5) * math.sin(pts[i][2])) * S)) for q in range(5)]
    bb.loft([rng(i) for i in range(7)], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
bay = bb.finish('K5K_bay', sharp_deg=45)

# ── накладки и передние рули ──
X_PL0, X_PL1, HW_PL, T_PL = 92.0, 123.5, 8.6, 0.8
bp = B()
for phi in PHI:
    er, et = axes(phi)
    def sec(x):
        lo = [(w, math.sqrt(28.0 ** 2 - w * w) - 0.5) for w in (-HW_PL, HW_PL)]
        hi = [(w, math.sqrt(28.0 ** 2 - w * w) + T_PL) for w in (HW_PL, HW_PL * 0.5, 0.0, -HW_PL * 0.5, -HW_PL)]
        return [P(x, r, w, er, et) for w, r in lo + hi]
    bp.loft([sec(X_PL0), sec(X_PL1)], G_BODY, cap0=G_BODY, cap1=G_BODY)
    rl = lambda x, w, h: P(x, math.sqrt(28.0 ** 2 - w * w) + h, w, er, et)
    bp.loft([[rl(X_PL0 - 0.9, w, -0.4), rl(X_PL0 - 0.9, w, T_PL + 0.55), rl(X_PL0 + 0.5, w, T_PL + 0.55), rl(X_PL0 + 0.5, w, -0.4)] for w in (-HW_PL - 0.7, -HW_PL * 0.5, 0.0, HW_PL * 0.5, HW_PL + 0.7)], G_BODY, cap0=G_BODY, cap1=G_BODY)
    bp.loft([[rl(x, -HW_PL - 0.7, -0.4), rl(x, -HW_PL - 0.7, T_PL + 0.5), rl(x, -HW_PL + 0.4, T_PL + 0.5), rl(x, -HW_PL + 0.4, -0.4)] for x in (X_PL0 - 0.9, X_PL1)], G_BODY, cap0=G_BODY, cap1=G_BODY)
plates = bp.finish('K5K_plates', sharp_deg=30)
R_C0 = 28.0 + T_PL + 0.12                # корень руля чуть над накладкой
R_CT = 52.5                              # вылет конца от оси (на референсе_4 снизу 36, сверху 32 пикс. при 45°)
CAN = [(97.0, R_C0), (128.5, R_CT), (133.5, R_CT), (121.0, R_C0)]
CAN_IN = [(101.5, R_C0), (129.0, R_CT - 1.5), (131.5, R_CT - 1.5), (118.5, R_C0)]
X_CP = 109.0; T_C = 0.72
CAN_RANGE = 15.0
CANARD = {}
for k, phi in enumerate(PHI):
    er, et = axes(phi); o = P(X_CP, R_C0, 0.0, er, et)
    bc = B()
    face = lambda pts, w: [P(x, r, w, er, et) - o for x, r in pts]
    bc.loft([face(CAN_IN, T_C), face(CAN, 0.0), face(CAN_IN, -T_C)], G_BODY, cap0=G_BODY, cap1=G_BODY)
    ob = bc.finish(f'canard_{k}', sharp_deg=25); ob.location = o
    CANARD[k] = dict(o=o.copy(), axis=er.copy())

# ── планки и хвостовые крылья ──
X_ST0, X_ST1, HW_ST, H_ST = 390.0, 464.0, 6.2, 2.1
bs = B()
for phi in PHI:
    er, et = axes(phi)
    def sec(x):
        rb_ = R_at(x)
        return [P(x, rb_ - 0.6, -HW_ST, er, et), P(x, rb_ - 0.6, HW_ST, er, et), P(x, rb_ + H_ST * 0.75, HW_ST, er, et), P(x, rb_ + H_ST, HW_ST * 0.75, er, et), P(x, rb_ + H_ST, -HW_ST * 0.75, er, et), P(x, rb_ + H_ST * 0.75, -HW_ST, er, et)]
    bs.loft([sec(x) for x in (X_ST0, 420.0, X_ST1)], G_BODY, cap0=G_BODY, cap1=G_BODY)
    for xb in (X_ST0 - 0.2, X_ST1 + 0.2):      # проушины шарнира на концах планки (референс_2)
        rb_ = R_at(xb) + H_ST
        ring = lambda x_: [P(x_, rb_ - 0.45 + 0.9 * math.sin(2 * math.pi * j / 8), 0.9 * math.cos(2 * math.pi * j / 8), er, et) for j in range(8)]
        bs.loft([ring(xb - 2.2), ring(xb + 2.2)], G_BODY, cap0=G_BODY, cap1=G_BODY)
strips = bs.finish('K5K_strips', sharp_deg=30)
R_WT = float(os.environ.get('K5K_WING_R', '68.0'))  # вылет конца крыла от оси: на референсе_4 верх и низ по 46-50 пикс. при 45° (≈ 0,44 м)
RW0 = lambda x: R_at(x) + H_ST + 0.6       # корень крыла идёт над планкой, зазор 3 мм
def wing_pts(ins):
    if not ins: return [(386.0, RW0(386.0)), (421.0, R_WT), (X_END, R_WT), (477.0, RW0(477.0))]
    return [(391.0, RW0(391.0)), (423.0, R_WT - 1.4), (X_END - 3.5, R_WT - 1.4), (473.5, RW0(473.5))]
T_W = 0.92; X_WP = 427.0
WING_RANGE = 10.0
WING = {}
for k, phi in enumerate(PHI):
    er, et = axes(phi); o = P(X_WP, RW0(X_WP), 0.0, er, et)
    bw = B()
    face = lambda pts, w: [P(x, r, w, er, et) - o for x, r in pts]
    bw.loft([face(wing_pts(True), T_W), face(wing_pts(False), 0.0), face(wing_pts(True), -T_W)], G_BODY, cap0=G_BODY, cap1=G_BODY)
    # накладка у конца крыла с заклёпками (референсы 2 и 3): тонкая пластина на обеих сторонах
    for sg in (1.0, -1.0):
        pl_ = lambda t_: [P(x_, r_, sg * t_, er, et) - o for x_, r_ in ((470.0, R_WT - 12.0), (470.0, R_WT - 1.8), (486.0, R_WT - 1.8), (482.5, R_WT - 12.0))]
        bw.loft([pl_(T_W * 0.35), pl_(T_W + 0.28)] if sg > 0 else [pl_(T_W * 0.35)[::-1], pl_(T_W + 0.28)[::-1]], G_BODY, cap1=G_BODY)
    ob = bw.finish(f'wing_{k}', sharp_deg=25); ob.location = o
    WING[k] = dict(o=o.copy(), axis=Vector((0.0, 1.0, 0.0)), radial=er.copy())

# ── неподвижное сверху и снизу ──
bf = B()
X_LUG1, X_LUG2 = 250.0, 289.0
LW, LH = MM(27.0), MM(76.0)                                   # полуширина и высота проушины
LUG_OUT = [(-LW * 1.05, -MM(8)), (LW * 1.05, -MM(8)), (LW * 1.05, MM(4)), (LW, MM(10)), (LW * 0.92, MM(60)), (LW * 0.62, LH), (-LW * 0.62, LH), (-LW * 0.92, MM(60)), (-LW, MM(10)), (-LW * 1.05, MM(4))]
HOLE = (0.0, MM(40.0)); HOLE_RW, HOLE_RH = MM(13.5), MM(19.0); T_LUG = MM(13.0)


def lug(bb, xc, n=20):
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
    rings_ = [[pt(p, 1, T_LUG) for p in inner], [pt(p, 1, T_LUG) for p in outer], [pt(p, -1, T_LUG) for p in outer], [pt(p, -1, T_LUG) for p in inner], [pt(p, 1, T_LUG) for p in inner]]
    bb.loft(rings_, G_STEEL)
    disc = lambda rd, h: [Vector((rd * S * math.cos(2 * math.pi * j / 8 + math.pi / 8), Y(xc) + rd * S * math.sin(2 * math.pi * j / 8 + math.pi / 8), (r0 + h) * S)) for j in range(8)]
    bb.loft([disc(MM(44), -1.2), disc(MM(44), MM(9)), disc(MM(38), MM(13))], G_STEEL, cap1=G_STEEL)


lug(bf, X_LUG1); lug(bf, X_LUG2)
def box(bb, x0, x1, hw, z0, z1, mat, up=True):
    """Брусок вдоль оси над осью (верх) или под ней: x0…x1 пикс., полуширина hw, высоты z0…z1 от оси."""
    s = 1.0 if up else -1.0
    sec = lambda x: [Vector((a * S, Y(x), s * z * S)) for a, z in ((-hw, z0), (hw, z0), (hw, z1), (-hw, z1))]
    r0, r1 = sec(x0), sec(x1)
    if not up: r0, r1 = r0[::-1], r1[::-1]
    bb.loft([r0, r1], mat, cap0=mat, cap1=mat)


for xc in (222.0, 313.0):              # колодки: серая подложка, рыжая плита, поперечный валик (на передней - с красным торцом) или две планки
    box(bf, xc - 7.4, xc + 7.4, 11.4, 26.2, 29.9, G_BODY)
    box(bf, xc - 6.4, xc + 6.4, 10.5, 29.8, 31.2, G_BLOCK)
    if xc < 300.0:
        ring = lambda w: [Vector((w * S, Y(xc - 4.4) + 1.9 * S * math.cos(2 * math.pi * j / 10), (32.4 + 1.9 * math.sin(2 * math.pi * j / 10)) * S)) for j in range(10)]
        bf.loft([ring(-11.8), ring(11.8)], G_BLOCK, cap0=G_BLOCK, cap1=G_BLOCK)
    else:
        for dx in (-4.6, 4.6): box(bf, xc + dx - 1.4, xc + dx + 1.4, 10.5, 31.0, 33.6, G_BLOCK)
X_CAP, R_CAP = 152.0, MM(53.0)         # крышка сверху
rc0 = R_at(X_CAP)
capr = lambda rd, h, n=20: [Vector((rd * S * math.cos(2 * math.pi * j / n), Y(X_CAP) + rd * S * math.sin(2 * math.pi * j / n), (rc0 + h) * S)) for j in range(n)]
bf.loft([capr(R_CAP + 0.3, -0.8), capr(R_CAP + 0.3, MM(14)), capr(R_CAP, MM(19)), capr(R_CAP, MM(36)), capr(R_CAP - 0.5, MM(40))], G_BLOCK, cap1=G_BLOCK)
X_BOX0, X_BOX1, HW_BOX, H_BOX = 182.0, 351.0, 8.2, 3.6    # короб вдоль низа
sec = lambda x, h: [Vector((a * S, Y(x), -z * S)) for a, z in ((-HW_BOX, 26.5), (-HW_BOX, 27.1 + h * 0.75), (-HW_BOX * 0.8, 28.0 + h), (HW_BOX * 0.8, 28.0 + h), (HW_BOX, 27.1 + h * 0.75), (HW_BOX, 26.5))]
bf.loft([sec(X_BOX0, -0.8), sec(X_BOX0 + 4.0, H_BOX), sec(X_BOX1 - 4.0, H_BOX), sec(X_BOX1, -0.8)], G_BODY, cap0=G_BODY, cap1=G_BODY)
for xc in (205.0, 236.0, 268.0, 300.0, 332.0):             # хомуты на коробе (ступени на референсе_3)
    h2 = H_BOX + 0.9
    bf.loft([sec(xc - 3.2, h2), sec(xc + 3.2, h2)], G_BODY, cap0=G_BODY, cap1=G_BODY)
for phi, x0, x1, hw in [(45.0, 366.0, 381.0, 4.2), (135.0, 366.0, 381.0, 4.2), (225.0, 366.0, 381.0, 4.2), (315.0, 366.0, 381.0, 4.2), (0.0, 358.0, 375.0, 3.6), (180.0, 358.0, 375.0, 3.6)]:   # кронштейны на плече
    er, et = axes(phi)
    brk = lambda x, h: [P(x, R_at(x) - 0.6, -hw, er, et), P(x, R_at(x) - 0.6, hw, er, et), P(x, R_at(x) + h, hw * 0.8, er, et), P(x, R_at(x) + h, -hw * 0.8, er, et)]
    bf.loft([brk(x0, 0.1), brk(x0 + 3.0, 2.4), brk(x1 - 1.2, 2.4), brk(x1, 1.2)], G_BODY, cap0=G_BODY, cap1=G_BODY)
fixed = bf.finish('K5K_fixed', sharp_deg=35)

mk.GEO = dict(NSEG=NSEG, RB=RB, R_WT=R_WT, X_PL=(X_PL0, X_PL1), X_ST=(X_ST0, X_ST1), HW_ST=HW_ST, H_ST=H_ST, X_CAP=X_CAP, R_CAP=R_CAP, LUG_TOP=(R_at(X_LUG1) + LH) * S, WING_TOP=R_WT * S * math.sin(math.radians(45)),
              SEAMS=(58.0, 92.0, 124.7, 129.3, 222.5, 338.0, 368.0), BLOCKS=(222.0, 313.0), CAN_RANGE=CAN_RANGE, WING_RANGE=WING_RANGE, TE=((477.0, RW0(477.0)), (X_END, R_WT)), X_HEAD=X_HEAD)
mk.CANARD, mk.WING, mk.O_HEAD = CANARD, WING, O_HEAD
bpy.context.view_layer.update()
mk.stats()
print('проушины до', round(mk.GEO['LUG_TOP'], 3), 'м над осью; крылья до', round(mk.GEO['WING_TOP'], 3), 'м')
print('сцена KAB500KR построена')
