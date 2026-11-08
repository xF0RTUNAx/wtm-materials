# GBU-39/B SDB (w_gbu39) - своя модель по фото Mark (референсы/sdb_01..05). Метры: ось корпуса Y, нос +Y (в glTF -Z), верх +Z (в glTF +Y, ушки),
# начало на оси посередине длины 1,80 м. a - расстояние от острия носа. Запуск:
# SDB_OUT="<папка>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python _collide.py [--python bake.py --python deliver.py]
#
# ФОТО: 03 - вид сверху, раскрыто: масштаб 456 пикс. = 1,80 м (нос 21 -> торец 477), корпус 48-50 пикс. = 0,19 м, жёлтая полоса a 0,53-0,56, стыки 0,78 и 1,09,
#       хвостовой отсек с 1,36, крыло: ось полосы пересекает ось корпуса на a ~0,63, стреловидность 30° от поперечной, конец на 0,775 м от оси, хорда ~0,10,
#       подкос почти поперёк, сходится с крылом около 0,66 м от оси; 01 - схема крыла с подкосом; 02 - хвостовой отсек, рули, подкосы, тёмная накладка снизу;
#       04 - полураскрытое крыло; 05 - ушки сверху, тёмная накладка (короб крыльев) снизу. Логотипы и эмблемы не переносим.
# СОСТАВ:
#  + корпус Ø 0,19: оживальный нос с тупым колпачком, низ квадратнее на участке короба крыльев, хвостовой отсек металлом: фланец, цилиндр, конус, квадратный торец
#  + короб крыльев (тёмная накладка) снизу с наклонным передним скосом
#  + крыло «ромб»: wing1 (к x+) и wing2 (к x-) на общей вертикальной оси под коробом, в сложенном лежат назад друг под другом;
#    подкосы wing1s / wing2s на своих вертикальных осях позади (рядом, x ±0,03), в сложенном лежат назад над крыльями.
#    Подкос с линейным поворотом скользит концом вдоль крыла (как ползун у настоящего) - зазор считает _collide.py.
#  + 4 руля × неподвижны (на фото только раскрытые), 4 кожуха приводов, разъём с крышкой, торцевая крышка
#  + 2 ушка сверху (14 дюймов), оси-пальцы крыльев и подкосов с шайбами
import sys, os, math, importlib
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
import bpy, bmesh
import modelkit as mk; importlib.reload(mk)
from modelkit import B, Vector
from mathutils import Matrix

L = 1.80; R = 0.095; NSEG = 40
mk.configure('GBU39', 0.001, x0=0.0, yc=0.0, rb=95.0, nseg=NSEG, nose='left')
G_BODY, G_METAL, G_DARK, G_WING = 0, 1, 2, 3
mk.set_materials([('SDB_body', (0.50, 0.53, 0.56)), ('SDB_metal', (0.34, 0.33, 0.31)), ('SDB_dark', (0.03, 0.03, 0.035)), ('SDB_wing', (0.50, 0.53, 0.56))])
for m, (rough, metal) in zip(mk.MATS, ((0.48, 0.0), (0.40, 0.75), (0.75, 0.0), (0.48, 0.0))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
Yb = lambda a: L / 2 - a
LN = 0.59; RHO = (R * R + LN * LN) / (2 * R)
A_PK0, A_PK1, A_TK = 0.56, 1.32, 1.33
A_CAP = 0.006
og = lambda q: math.sqrt(max(0.0, RHO * RHO - (LN - q) ** 2)) - (RHO - R)
A0 = next(q / 10000 for q in range(0, 3000) if og(q / 10000) >= 0.009); R_CAP = og(A0)                                         # короб крыльев, начало хвостового отсека


def r_at(a):
    if a <= LN:                                                                 # оживало, сдвинутое под тупой колпачок (фото 03: r 0,008 на a 0,012, 0,022 на 0,06)
        if a < A_CAP: return R_CAP * math.sqrt(max(0.0, 1.0 - ((A_CAP - a) / A_CAP) ** 2))
        q = A0 + (a - A_CAP) * (LN - A0) / (LN - A_CAP)
        return math.sqrt(max(0.0, RHO * RHO - (LN - q) ** 2)) - (RHO - R)
    if a < A_TK: return R
    if a < 1.345: return R + 0.003
    if a < 1.46: return R - 0.001
    if a < 1.745: return (R - 0.001) - (R - 0.001 - 0.070) * ((a - 1.46) / 0.285) ** 1.1
    return 0.070 - 0.012 * ((a - 1.745) / 0.055) ** 2


def n_low(a):                                                                   # квадратнее снизу на участке короба
    k = 0.0 if a < A_PK0 - 0.04 or a > A_PK1 + 0.01 else min(1.0, (a - (A_PK0 - 0.04)) / 0.06, ((A_PK1 + 0.01) - a) / 0.03)
    return 2.0 + 1.2 * k


def n_all(a): return 2.0 + 1.2 * max(0.0, min(1.0, (a - 1.68) / 0.08)) ** 1.5    # к торцу хвоста сечение квадратнее


def ring(a, r=None, k=1.0, n=NSEG):
    r = (r if r is not None else r_at(a)) * k; pts = []
    for j in range(n):
        t = 2 * math.pi * j / n - math.pi / 2; c, s = math.cos(t), math.sin(t)
        e = 2.0 / max(n_low(a) if s < 0 else 2.0, n_all(a))
        pts.append(Vector((r * math.copysign(abs(c) ** e, c), Yb(a), r * math.copysign(abs(s) ** e, s))))
    return pts


def groove(a, d=0.0022, w=0.0035):
    rr = r_at(a); return [(a - w, 1.0), (a - w * 0.3, 1.0 - d / rr), (a + w * 0.3, 1.0 - d / rr), (a + w, 1.0)]


SEAMS = (0.09, 0.59, 0.78, 1.09)
ST = [(a, 1.0) for a in (0.0015, 0.004, 0.008, 0.012, 0.03, 0.06)] + groove(0.09) + [(a, 1.0) for a in (0.13, 0.19, 0.26, 0.34, 0.42, 0.50, 0.55)] + groove(0.59) + \
     [(a, 1.0) for a in (0.62, 0.70)] + groove(0.78) + [(a, 1.0) for a in (0.95,)] + groove(1.09) + [(a, 1.0) for a in (1.22, 1.3295, 1.3305, 1.3445, 1.3455, 1.40, 1.46, 1.52, 1.60, 1.68, 1.735, 1.745, 1.77, 1.80)]
b = B(); rings = [ring(a, k=k) for a, k in ST]
mats = [G_DARK if a1 <= 0.09 + 1e-6 and False else (G_METAL if a0 >= A_TK - 1e-6 else G_BODY) for (a0, _), (a1, _) in zip(ST, ST[1:])]
b.loft(rings, mats, cap0=G_BODY, cap1=G_METAL)
bmesh.ops.remove_doubles(b.bm, verts=b.bm.verts[:], dist=1e-7)
body = b.finish('SDB_body', sharp_deg=34)

# ── короб крыльев (тёмная накладка): нижняя часть сечения с запасом 4 мм, наклонный передний скос ──
bp = B()
TH0, TH1 = math.radians(-172), math.radians(-8); NQ = 12
def pk(a_bot, a_side, grow):
    """Кольцо короба: внешняя дуга (с запасом grow) и обратная внутри корпуса. Передний край скошен: снизу a_bot, на бортах a_side (фото 02)."""
    outer, inner = [], []
    for q in range(NQ + 1):
        t = TH0 + (TH1 - TH0) * q / NQ; a = a_bot + (a_side - a_bot) * (1.0 - abs(math.sin(t))) ** 0.7
        base = ring(a); j = (t + math.pi / 2) / (2 * math.pi) * NSEG; j0 = int(math.floor(j)) % NSEG; f = j - math.floor(j)
        p = base[j0].lerp(base[(j0 + 1) % NSEG], f); d = Vector((p.x, 0, p.z)).normalized()
        outer.append(p + d * grow); inner.append(p - d * 0.006)
    return outer + inner[::-1]
RK = [pk(A_PK0, A_PK0 + 0.045, 0.004), pk(A_PK0 + 0.06, A_PK0 + 0.08, 0.004)] + [pk(a_, a_, 0.004) for a_ in (0.70, 0.78, 0.95, 1.09, 1.22, 1.28, 1.30, A_PK1)]
bp.loft(RK, G_DARK)
bmv = bp.bm; bmv.verts.ensure_lookup_table(); M_ = NQ + 1; N_ = 2 * M_
for ri, flip in ((0, True), (len(RK) - 1, True)):                             # торцы полосой четырёхугольников (серп вогнутый - n-угольник не годится)
    vs = bmv.verts[ri * N_:(ri + 1) * N_]
    for q in range(NQ):
        quad = [vs[q], vs[q + 1], vs[N_ - 2 - q], vs[N_ - 1 - q]]
        f = bmv.faces.new(quad[::-1] if flip else quad); f.material_index = G_DARK
pack = bp.finish('SDB_pack', sharp_deg=30)
Z_PK = -(R + 0.004)                                                             # низ короба

# ── неподвижные мелочи ──
bf = B()
def box(c, hx, hy, hz, g):
    bf.loft([[c + Vector((x, y0, z)) for x, z in ((-hx, -hz), (hx, -hz), (hx, hz), (-hx, hz))] for y0 in (-hy, hy)], g, cap0=g, cap1=g)
def cyl(c, r, z0, z1, g, n=14):
    bf.loft([[Vector((c.x + r * math.cos(2 * math.pi * q / n), c.y + r * math.sin(2 * math.pi * q / n), z)) for q in range(n)] for z in (z0, z1)], g, cap0=g, cap1=g)
# ушки (14 дюймов): площадка и петля
LUGS = (0.72, 1.076)
for ac in LUGS:
    y = Yb(ac); box(Vector((0, y, R + 0.002)), 0.016, 0.026, 0.004, G_METAL)
    arc = []
    for q in range(9):
        t = math.pi * q / 8; arc.append((y + 0.016 * math.cos(t), R + 0.006 + 0.022 * math.sin(t)))
    for (y0, z0), (y1, z1) in zip(arc, arc[1:]):
        dv = Vector((0, y1 - y0, z1 - z0)).normalized(); nv = Vector((0, -dv.z, dv.y)) * 0.0035
        bf.loft([[Vector((x, yy, zz)) + nn for x, nn in ((-0.006, nv), (0.006, nv), (0.006, -nv), (-0.006, -nv))] for yy, zz in ((y0, z0), (y1, z1))], G_METAL, cap0=G_METAL, cap1=G_METAL)
# разъём с крышкой на хвостовом отсеке (02: синяя крышка сверху-сбоку)
cu = Vector((0.0, 0.0, 1.0)).normalized()
for (rr, h, g) in ((0.016, 0.006, G_METAL), (0.012, 0.012, G_DARK)):
    t0 = math.radians(30); c = Vector((R * math.sin(t0), Yb(1.37), R * math.cos(t0))); ax = Vector((math.sin(t0), 0, math.cos(t0))); u_ = Vector((0, 1, 0)); v_ = ax.cross(u_)
    bf.loft([[c + ax * dz + (u_ * math.cos(2 * math.pi * q / 14) + v_ * math.sin(2 * math.pi * q / 14)) * rr for q in range(14)] for dz in (-0.003, h)], g, cap1=g)
# кожухи приводов рулей на хвостовом отсеке (в плоскостях ×)
PHI = (45.0, 135.0, 225.0, 315.0)
for phi in PHI:
    ph = math.radians(phi); er = Vector((math.sin(ph), 0.0, math.cos(ph))); et = Vector((math.cos(ph), 0.0, -math.sin(ph)))
    def cs(a, w, h): return [Vector((0.0, Yb(a), 0.0)) + er * (r_at(a) - 0.003 + z) + et * x for x, z in ((-w, 0.0), (-w, h * 0.8), (-w * 0.7, h), (w * 0.7, h), (w, h * 0.8), (w, 0.0))]
    bf.loft([cs(1.36, 0.012, 0.002), cs(1.38, 0.020, 0.011), cs(1.58, 0.020, 0.011), cs(1.64, 0.014, 0.006), cs(1.68, 0.010, 0.002)], G_METAL, cap0=G_METAL, cap1=G_METAL)
# головки болтов кольцом на фланце хвостового отсека
for j in range(12):
    t = 2 * math.pi * (j + 0.5) / 12; er = Vector((math.cos(t), 0.0, math.sin(t)))
    c = Vector((0.0, Yb(1.338), 0.0)) + er * (R + 0.0025); u_ = Vector((0, 1, 0)); v_ = er.cross(u_)
    bf.loft([[c + er * dz + (u_ * math.cos(2 * math.pi * q / 6) + v_ * math.sin(2 * math.pi * q / 6)) * 0.004 for q in range(6)] for dz in (0.0, 0.002)], G_METAL, cap1=G_METAL)
fixed = bf.finish('SDB_fixed', sharp_deg=36)

# ── рули ×, неподвижны ──
bt = B()
for phi in PHI:
    ph = math.radians(phi); er = Vector((math.sin(ph), 0.0, math.cos(ph))); et = Vector((math.cos(ph), 0.0, -math.sin(ph)))
    def P(a, rr, w): return Vector((0.0, Yb(a), 0.0)) + er * rr + et * w
    rings_f = []
    for k_, rr in enumerate((0.0, 0.06, 0.12, 0.175)):
        a0 = 1.605 + 0.07 * rr / 0.175; a1 = 1.785 - 0.01 * rr / 0.175; t = 0.008 - 0.003 * rr / 0.175; ch = a1 - a0
        base = r_at(a0 + ch * 0.5) - 0.004 + rr
        rings_f.append([P(a0, base, 0.0), P(a0 + ch * 0.15, base, t / 2), P(a0 + ch * 0.8, base, t / 2), P(a1, base, 0.0), P(a0 + ch * 0.8, base, -t / 2), P(a0 + ch * 0.15, base, -t / 2)])
    bt.loft(rings_f, G_METAL, cap0=G_METAL, cap1=G_METAL)
tails = bt.finish('SDB_fins', sharp_deg=28)

# ── крыло «ромб» и подкосы ──
A_P1 = 0.63                       # ось крыльев (фото 03: ось полосы крыла пересекает ось корпуса на a ~0,62-0,66)
D_S, X_S = 0.30, 0.030            # ось подкоса позади оси крыльев и сдвиг вбок к своей стороне
OPEN_W = 60.0                     # раскрытое крыло: 60° от «назад», т. е. стреловидность 30° (фото 03)
R_ATT = 0.70                      # точка крепления подкоса на крыле от оси, раскрыто
W_CH, W_T, W_L, W_K, KINK = 0.096, 0.009, 0.915, 0.80, 25.0
S_W, S_T = 0.036, 0.008
CL = 0.001
Z_S = Z_PK - CL - S_T / 2                                  # слой подкосов (верхний, рядом)
Z_W = {1: Z_PK - CL - S_T - CL - W_T / 2, 2: Z_PK - CL - S_T - CL - W_T - CL - W_T / 2}
P1 = {k: Vector((0.0, Yb(A_P1), Z_W[k])) for k in (1, 2)}
WING = {}


def hexsec(c, u, v, ch, t, bev=0.012):
    up = Vector((0, 0, 1))
    return [c + v * (ch / 2), c + v * (ch / 2 - bev) + up * t / 2, c - v * (ch / 2 - bev) + up * t / 2, c - v * (ch / 2), c - v * (ch / 2 - bev) - up * t / 2, c + v * (ch / 2 - bev) - up * t / 2]


for k, sg in ((1, 1.0), (2, -1.0)):
    u = Vector((0, -1, 0)); v = Vector((sg, 0, 0))                    # вдоль размаха (в сложенном - назад), к передней кромке раскрытого
    Rr = W_CH / 2; secs = []
    for s_ in (-0.92 * Rr, -0.75 * Rr, -0.45 * Rr, 0.0):
        secs.append(hexsec(u * s_, u, v, 2 * math.sqrt(max(Rr * Rr - s_ * s_, 1e-6)), W_T, bev=min(0.012, 0.4 * math.sqrt(max(Rr * Rr - s_ * s_, 1e-6)))))
    for s_ in (0.20, 0.45, R_ATT, W_K):
        secs.append(hexsec(u * s_, u, v, W_CH, W_T))
    kd = (u * math.cos(math.radians(KINK)) - v * math.sin(math.radians(KINK)))   # законцовка загнута к задней кромке
    for s_ in (W_K + 0.05, W_L):
        secs.append(hexsec(u * W_K + kd * (s_ - W_K), u, v, W_CH * (0.97 if s_ == W_L else 1.0), W_T * 0.85))
    bw = B(); bw.loft(secs, G_WING, cap0=G_WING, cap1=G_WING)
    ob = bw.finish(f'wing{k}', sharp_deg=30); ob.location = P1[k]
    WING[k] = dict(o=P1[k].copy(), axis=Vector((0, 0, 1)), open_deg=sg * OPEN_W)
    # подкос: ось позади, сдвиг к своей стороне; раскрыто - конец в точке R_ATT крыла
    A1 = Vector((0.0, Yb(A_P1), 0.0)) + Vector((sg * math.sin(math.radians(OPEN_W)), -math.cos(math.radians(OPEN_W)), 0.0)) * R_ATT
    P2 = Vector((sg * X_S, Yb(A_P1 + D_S), Z_S))
    dvec = Vector((A1.x - P2.x, A1.y - P2.y, 0.0)); S_L = dvec.length
    ang = math.degrees(math.atan2(dvec.x, -dvec.y))                  # от «назад» к x+
    Rs = S_W / 2; secs = []
    for s_ in (-0.9 * Rs, -0.5 * Rs, 0.0, S_L * 0.5, S_L, S_L + 0.5 * Rs, S_L + 0.9 * Rs):
        if s_ < 0: ch = 2 * math.sqrt(Rs * Rs - s_ * s_)
        elif s_ > S_L: ch = 2 * math.sqrt(Rs * Rs - (s_ - S_L) ** 2)
        else: ch = S_W
        secs.append(hexsec(u * s_, u, v, ch, S_T, bev=min(0.006, 0.3 * ch)))
    bs = B(); bs.loft(secs, G_WING, cap0=G_WING, cap1=G_WING)
    os_ = bs.finish(f'wing{k}s', sharp_deg=30); os_.location = P2
    WING[f'{k}s'] = dict(o=P2.copy(), axis=Vector((0, 0, 1)), open_deg=ang, length=S_L, tip_local=Vector((0, -S_L, -S_T / 2)))
    print(f'подкос {k}: длина {S_L:.3f}, раскрытие {ang:.1f}°')

# оси-пальцы с шайбами: крылья (сквозь оба крыла), подкосы (сквозь слой подкосов)
bpn = B()
def pin(c, z0, z1, r=0.007, head=0.013):
    n = 14
    bpn.loft([[Vector((c.x + r * math.cos(2 * math.pi * q / n), c.y + r * math.sin(2 * math.pi * q / n), z)) for q in range(n)] for z in (z0, z1)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    bpn.loft([[Vector((c.x + head * math.cos(2 * math.pi * q / n), c.y + head * math.sin(2 * math.pi * q / n), z)) for q in range(n)] for z in (z1 - 0.0005, z1 - 0.0035)], G_METAL, cap0=G_METAL, cap1=G_METAL)
pin(Vector((0, Yb(A_P1), 0)), Z_PK + 0.004, Z_W[2] - W_T / 2)
for sg in (1.0, -1.0): pin(Vector((sg * X_S, Yb(A_P1 + D_S), 0)), Z_PK + 0.004, Z_S - S_T / 2, r=0.006, head=0.010)
pins = bpn.finish('SDB_pins', sharp_deg=30)

bpy.context.view_layer.update()
mk.GEO = dict(L=L, R=R, SEAMS=SEAMS, A_P1=A_P1, D_S=D_S, X_S=X_S, LUGS=LUGS, A_TK=A_TK, A_PK0=A_PK0, A_PK1=A_PK1, Z_PK=Z_PK)
mk.WING = WING; mk.Yb_ = Yb
mk.stats()
print('сцена GBU39 построена')
