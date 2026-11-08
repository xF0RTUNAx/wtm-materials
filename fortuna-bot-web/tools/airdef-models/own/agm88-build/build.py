# AGM-88 HARM (w_agm88) - своя модель по фото Mark (референсы/harm_01..05). Метры: ось корпуса Y, нос +Y (в glTF -Z), верх +Z (в glTF +Y, башмаки подвески),
# начало на оси посередине длины 4,17 м. a - расстояние от острия носа. Запуск:
# HRM_OUT="<папка>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python _collide.py [--python bake.py --python deliver.py]
#
# ФОТО: 01 - белая боевая на пилоне F/A-18, главный снимок (нос, лючки, крылья, хвост, полосы); 02 - серая ранняя: крепление к направляющей, крылья крестом ×;
#       03 - белая AGM-88E сбоку (короб по верху, хвост); 04 - сбоку на направляющей: масштаб 1830 пикс. = 4,17 м (острие 95 -> задняя кромка хвоста 1925);
#       05 - чужой рендер, только общая форма. Направляющую, тележку, подставки и ленты не делаем.
# СОСТАВ:
#  + обтекатель: оживало, острый кончик (отдельный тон до a = 0,20), стыки отсеков канавками: 0,20; 0,38; 0,81; 1,60; 2,11; 3,69
#  + корпус Ø 0,254, хвостовой отсек с сужением, сопло: кромка, металлический раструб, тёмная глубина
#  + средние крылья двойной дельты крестом ×: wing_c1..c4, поворот вокруг оси вдоль размаха у корня, ход ±20°; диски осей на обшивке
#  + хвостовые стабилизаторы ×, неподвижны, с обтекателями у корня
#  + сверху между верхними крыльями: кабельный короб, три башмака подвески (Т-образные) под направляющую, разъём с крышкой у переднего
#  + кольца болтов на стыках - рельефом; лючки, полосы (жёлтая у боевой части, коричневая у двигателя), мелкая маркировка - на окраске
import sys, os, math, importlib
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
import bpy, bmesh
import modelkit as mk; importlib.reload(mk)
from modelkit import B, Vector
from mathutils import Matrix

L = 4.17; R = 0.127; NSEG = 40
mk.configure('AGM88', 0.001, x0=0.0, yc=0.0, rb=127.0, nseg=NSEG, nose='left')
G_BODY, G_METAL, G_DARK, G_RAD = 0, 1, 2, 3
mk.set_materials([('HRM_body', (0.80, 0.80, 0.79)), ('HRM_metal', (0.42, 0.42, 0.43)), ('HRM_dark', (0.02, 0.02, 0.02)), ('HRM_radome', (0.70, 0.70, 0.68))])
for m, (rough, metal) in zip(mk.MATS, ((0.42, 0.0), (0.35, 0.85), (0.95, 0.0), (0.45, 0.0))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
Yb = lambda a: L / 2 - a
LN = 0.55; RHO = (R * R + LN * LN) / (2 * R)
A_END = 4.105                                                                  # срез хвостового отсека (сопло), кромки стабилизаторов до 4,17


def r_at(a):
    if a <= LN: return max(0.0025, math.sqrt(max(0.0, RHO * RHO - (LN - a) ** 2)) - (RHO - R))
    if a >= 3.95: return R - (R - 0.112) * ((a - 3.95) / (A_END - 3.95)) ** 1.4
    return R


def ring(a, r=None, n=NSEG, k=1.0):
    r = (r if r is not None else r_at(a)) * k
    return [Vector((r * math.cos(2 * math.pi * j / n - math.pi / 2), Yb(a), r * math.sin(2 * math.pi * j / n - math.pi / 2))) for j in range(n)]


def groove(a, d=0.0028, w=0.004):
    rr = r_at(a); return [(a - w, 1.0), (a - w * 0.3, 1.0 - d / rr), (a + w * 0.3, 1.0 - d / rr), (a + w, 1.0)]


SEAMS = (0.20, 0.38, 0.81, 1.60, 2.11, 3.69)
ST = [(a, 1.0) for a in (0.002, 0.012, 0.03, 0.06, 0.10, 0.15)] + groove(0.20) + [(a, 1.0) for a in (0.26, 0.32)] + groove(0.38) + [(a, 1.0) for a in (0.45, 0.52, 0.55, 0.65)] + groove(0.81) + \
     [(a, 1.0) for a in (1.0, 1.3)] + groove(1.60) + [(a, 1.0) for a in (1.80,)] + groove(2.11) + [(a, 1.0) for a in (2.5, 3.0, 3.4)] + groove(3.69) + [(a, 1.0) for a in (3.85, 3.95, 4.02, 4.07, A_END)]
b = B(); rings = [ring(a, k=k) for a, k in ST]
mats = [G_RAD if a1 <= 0.2 + 1e-6 else G_BODY for (a0, _), (a1, _) in zip(ST, ST[1:])]
b.loft(rings, mats, cap0=G_RAD)
# сопло: кромка, металлический раструб внутрь, тёмная глубина
NZ = [ring(A_END + 0.003, 0.108), ring(A_END + 0.003, 0.100), ring(A_END - 0.03, 0.092), ring(A_END - 0.08, 0.072), ring(A_END - 0.12, 0.055), ring(A_END - 0.12, 0.003)]
b.loft([rings[-1]] + NZ, [G_METAL, G_METAL, G_METAL, G_DARK, G_DARK, G_DARK], cap1=G_DARK)
bmesh.ops.remove_doubles(b.bm, verts=b.bm.verts[:], dist=1e-7)
body = b.finish('HRM_body', sharp_deg=34)

# ── неподвижные детали ──
bf = B()
def rY(a, r, n=12, cx=0.0, cz=0.0): return [Vector((cx + r * math.cos(2 * math.pi * j / n), Yb(a), cz + r * math.sin(2 * math.pi * j / n))) for j in range(n)]
# кабельный короб по верху (03), между верхними крыльями, от отсека рулей до хвостового отсека
A_RW0, A_RW1, W_RW, H_RW = 2.15, 3.64, 0.026, 0.016
def rw(a, w, h): return [Vector((x, Yb(a), z)) for x, z in ((-w, R - 0.006), (-w, R + h * 0.75), (-w * 0.75, R + h), (w * 0.75, R + h), (w, R + h * 0.75), (w, R - 0.006))]
bf.loft([rw(A_RW0, W_RW * 0.6, 0.001), rw(A_RW0 + 0.05, W_RW, H_RW), rw(A_RW1 - 0.05, W_RW, H_RW), rw(A_RW1, W_RW * 0.6, 0.001)], G_BODY, cap0=G_BODY, cap1=G_BODY)
# башмаки подвески: Т-образные, на коробе (02, 04 - направляющая сверху)
SHOES = (2.26, 2.95, 3.54)
def tshoe(ac):
    z0 = R + H_RW
    for (hl, hw, za, zb) in ((0.050, 0.014, z0 - 0.004, z0 + 0.024), (0.055, 0.036, z0 + 0.024, z0 + 0.032)):
        bf.loft([[Vector((x, Yb(aa), z)) for x, z in ((-hw, za), (hw, za), (hw, zb), (-hw, zb))] for aa in (ac - hl, ac + hl)], G_METAL, cap0=G_METAL, cap1=G_METAL)
for ac in SHOES: tshoe(ac)
SHOE_TOP = R + H_RW + 0.032
# разъём с крышкой у переднего башмака
for k_, (w_, h_) in enumerate(((0.020, 0.008), (0.016, 0.020))):
    z0 = R + H_RW - 0.003; bf.loft([[Vector((x, Yb(aa), z)) for x, z in ((-w_, z0), (w_, z0), (w_, z0 + h_), (-w_, z0 + h_))] for aa in (2.175 - 0.016 + k_ * 0.003, 2.175 + 0.016 - k_ * 0.003)], G_DARK if k_ else G_METAL, cap0=G_DARK, cap1=G_DARK)
# кольца болтов на стыках отсеков (головки), кроме носового
for s_ in (0.81, 1.60, 2.11, 3.69):
    for j in range(16):
        t = 2 * math.pi * (j + 0.5) / 16; er = Vector((math.cos(t), 0.0, math.sin(t)))
        if abs(er.x) > 0.55 and abs(er.z) > 0.55: continue                     # не под корнями крыльев ×
        c = Vector((0.0, Yb(s_ + 0.018), 0.0)) + er * (R - 0.0005); u_ = Vector((0, 1, 0)); v_ = er.cross(u_)
        bf.loft([[c + er * dz + (u_ * math.cos(2 * math.pi * q / 6) + v_ * math.sin(2 * math.pi * q / 6)) * 0.0045 for q in range(6)] for dz in (0.0, 0.0022)], G_METAL, cap1=G_METAL)
fixed = bf.finish('HRM_fixed', sharp_deg=36)

# ── средние крылья двойной дельты ×: рули, ось вдоль размаха у корня ──
PHI = (45.0, 135.0, 225.0, 315.0)
A_PIV = 1.98; GAP = 0.004; WT_R, WT_T = 0.016, 0.006
WPLAN = [(1.72, 0.0), (1.90, 0.065), (2.005, 0.44), (2.11, 0.44), (2.11, 0.0)]       # (a, вылет от обшивки): LE корня, излом, LE конца, TE конца, TE корня
WING = {}
bd = B()
for k, phi in enumerate(PHI, start=1):
    ph = math.radians(phi); er = Vector((math.sin(ph), 0.0, math.cos(ph))); et = Vector((math.cos(ph), 0.0, -math.sin(ph)))
    O = Vector((0.0, Yb(A_PIV), 0.0)) + er * (R + GAP)
    def P(a, s, w): return Vector((0.0, Yb(a), 0.0)) + er * (R + GAP + s) + et * w - O
    span = WPLAN[2][1]
    def t_at(s): return WT_R + (WT_T - WT_R) * s / span
    le = lambda s: WPLAN[0][0] + (WPLAN[1][0] - WPLAN[0][0]) * s / WPLAN[1][1] if s <= WPLAN[1][1] else WPLAN[1][0] + (WPLAN[2][0] - WPLAN[1][0]) * (s - WPLAN[1][1]) / (WPLAN[2][1] - WPLAN[1][1])
    ss = [0.0, 0.03, 0.065, 0.16, 0.28, span]
    rings_w = []
    for s_ in ss:
        a0, a1 = le(s_), 2.11; t = t_at(s_); ch = a1 - a0
        rings_w.append([P(a0, s_, 0.0), P(a0 + ch * 0.18, s_, t / 2), P(a0 + ch * 0.75, s_, t / 2), P(a1, s_, 0.0), P(a0 + ch * 0.75, s_, -t / 2), P(a0 + ch * 0.18, s_, -t / 2)])
    bw = B(); bw.loft(rings_w, G_BODY, cap0=G_BODY, cap1=G_BODY)
    ob = bw.finish(f'wing_c{k}', sharp_deg=28); ob.location = O
    WING[k] = dict(o=O.copy(), axis=er.copy(), phi=phi)
    # диск оси на обшивке (неподвижный)
    c = Vector((0.0, Yb(A_PIV), 0.0)) + er * (R - 0.001); u_ = Vector((0, 1, 0)); v_ = er.cross(u_)
    bd.loft([[c + er * dz + (u_ * math.cos(2 * math.pi * q / 14) + v_ * math.sin(2 * math.pi * q / 14)) * rr for q in range(14)] for dz, rr in ((0.0, 0.034), (GAP - 0.0008, 0.034), (GAP - 0.0008, 0.028))], G_METAL, cap1=G_METAL)
discs = bd.finish('HRM_pivots', sharp_deg=30)

# ── хвостовые стабилизаторы ×, неподвижны ──
bt = B()
FPLAN_SPAN = 0.190                                                             # по фото 04: кончики стабилизаторов ~97 пикс. от оси под 45°
for phi in PHI:
    ph = math.radians(phi); er = Vector((math.sin(ph), 0.0, math.cos(ph))); et = Vector((math.cos(ph), 0.0, -math.sin(ph)))
    def P(a, s, w): return Vector((0.0, Yb(a), 0.0)) + er * (r_at(min(a, A_END)) - 0.003 + s) + et * w
    ss = [0.0, 0.06, 0.12, FPLAN_SPAN]
    rings_f = []
    for s_ in ss:
        a0 = 3.67 + (4.07 - 3.67) * s_ / FPLAN_SPAN; a1 = 4.17; t = 0.013 + (0.006 - 0.013) * s_ / FPLAN_SPAN; ch = a1 - a0
        rings_f.append([P(a0, s_, 0.0), P(a0 + ch * 0.2, s_, t / 2), P(a0 + ch * 0.7, s_, t / 2), P(a1, s_, 0.0), P(a0 + ch * 0.7, s_, -t / 2), P(a0 + ch * 0.2, s_, -t / 2)])
    bt.loft(rings_f, G_BODY, cap0=G_BODY, cap1=G_BODY)
    # обтекатель у корня стабилизатора
    rf = lambda a, w, h: [Vector((0.0, Yb(a), 0.0)) + er * (r_at(a) - 0.004 + z) + et * x for x, z in ((-w, 0.0), (-w * 0.8, h), (w * 0.8, h), (w, 0.0))]
    bt.loft([rf(3.70, 0.003, 0.0015), rf(3.80, 0.011, 0.0065), rf(4.00, 0.011, 0.0065), rf(4.09, 0.006, 0.0015)], G_BODY, cap0=G_BODY, cap1=G_BODY)
tails = bt.finish('HRM_tail', sharp_deg=28)

bpy.context.view_layer.update()
mk.GEO = dict(L=L, R=R, A_END=A_END, SEAMS=SEAMS, A_PIV=A_PIV, SHOE_TOP=SHOE_TOP, RUD_RANGE=20.0)
mk.WING = WING; mk.Yb_ = Yb
mk.stats()
print('башмаки до', round(SHOE_TOP, 3), 'размах крыльев', round(2 * (R + GAP + WPLAN[2][1]) * math.cos(math.radians(45)) * 2 / 2, 3))
print('сцена AGM88 построена')
