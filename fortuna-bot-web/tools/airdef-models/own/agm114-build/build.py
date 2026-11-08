# AGM-114 Hellfire K/R (w_hellfire) - своя модель по фото Mark (референсы/hf_01..05). Метры: ось корпуса Y, нос +Y (в glTF -Z), верх +Z (в glTF +Y, башмаки),
# начало на оси посередине длины 1,63 м. a - расстояние от острия купола. Запуск:
# HF_OUT="<папка>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python _collide.py [--python bake.py --python deliver.py]
#
# ФОТО: 05 - сбоку (верх): масштаб 587 пикс. = 1,63 м (360 пикс./м), корпус 63 пикс. = 0,175; профиль носа снят по столбцам; рули a 0,29-0,43,
#       крылья a 1,12-1,63; жёлтые полосы ~0,44-0,50, 0,88-0,92, 1,15-1,19; торец - широкое сопло; 02, 03 - настоящие ракеты: купол с зеркалом,
#       рули и крылья крестом × (по одной оси), башмаки сверху; 01 - чужой рендер, 04 - снимок с водяным знаком: только форма. Направляющие не делаем.
# СОСТАВ:
#  + стеклянный купол головки (материал HF_glass - прозрачное стекло с лёгким холодным отливом), под ним: тёмное основание, хромированное
#    вогнутое зеркало с наклоном 8°, стойка с латунным наконечником, ободок
#  + корпус Ø 0,178: обтекатель головки (профиль по фото 05), стыки канавками, торец с широким соплом и глубиной
#  + передние рули × fin_c1..fin_c4: ось у корня по радиусу, ход ±15°; диски осей на обшивке
#  + задние крылья × неподвижные, длинная хорда (фото 05), накладки у корня
#  + башмаки сверху: передний (тёмный, Т-образный) и два металлических
import sys, os, math, importlib
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
import bpy, bmesh
import modelkit as mk; importlib.reload(mk)
from modelkit import B, Vector
from mathutils import Matrix

L = 1.63; R = 0.0889; NSEG = 40
mk.configure('HF114', 0.001, x0=0.0, yc=0.0, rb=88.9, nseg=NSEG, nose='left')
G_BODY, G_METAL, G_DARK, G_GLASS = 0, 1, 2, 3
mk.set_materials([('HF_body', (0.035, 0.035, 0.037)), ('HF_metal', (0.62, 0.62, 0.63)), ('HF_dark', (0.015, 0.015, 0.015)), ('HF_glass', (0.05, 0.05, 0.06))])
for m, (rough, metal) in zip(mk.MATS, ((0.45, 0.0), (0.18, 1.0), (0.85, 0.0), (0.03, 0.0))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
gm = mk.MATS[G_GLASS]; gpb = next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
gpb.inputs['Alpha'].default_value = 0.22; gpb.inputs['Base Color'].default_value = (0.42, 0.46, 0.50, 1.0); gpb.inputs['Roughness'].default_value = 0.0
try: gpb.inputs['Specular IOR Level'].default_value = 1.0; gpb.inputs['Coat Weight'].default_value = 1.0; gpb.inputs['Coat Roughness'].default_value = 0.0
except Exception: pass
try: gm.surface_render_method = 'BLENDED'; gm.use_backface_culling = False
except Exception: gm.blend_method = 'BLEND'
Yb = lambda a: L / 2 - a
A_DOME, R_DOME = 0.056, 0.066                       # купол: глубина и радиус основания
A_END = L
NOSE = [(0.052, 0.0665), (0.056, 0.0705), (0.075, 0.0745), (0.100, 0.0800), (0.125, 0.0830), (0.155, 0.0860), (0.19, 0.0880), (0.22, R)]   # фото 05 по столбцам


def ring(a, r, n=NSEG):
    return [Vector((r * math.cos(2 * math.pi * j / n - math.pi / 2), Yb(a), r * math.sin(2 * math.pi * j / n - math.pi / 2))) for j in range(n)]


def groove(a, d=0.0018, w=0.003):
    return [(a - w, R), (a - w * 0.3, R - d), (a + w * 0.3, R - d), (a + w, R)]


SEAMS = (0.29, 0.62, 0.80, 1.12)
ST = NOSE + groove(0.29) + [(0.45, R)] + groove(0.62) + groove(0.80) + [(0.95, R)] + groove(1.12) + [(1.30, R), (1.50, R), (1.622, R), (1.630, R - 0.002)]
# торец: плоское кольцо, широкое сопло, глубина
ST += [(1.630, 0.066), (1.622, 0.062), (1.585, 0.060), (1.560, 0.050), (1.545, 0.030), (1.545, 0.003)]
b = B(); rings = [ring(a, r) for a, r in ST]
mats = [G_BODY] * (len(ST) - 1)
k_end = len(ST) - 6
for i in range(k_end, len(ST) - 1): mats[i] = G_DARK if i > k_end else G_BODY
b.loft(rings, mats, cap0=G_DARK, cap1=G_DARK)
bmesh.ops.remove_doubles(b.bm, verts=b.bm.verts[:], dist=1e-7)
body = b.finish('HF_body', sharp_deg=34)

# ── купол: эллипсоид глубиной A_DOME ──
bd = B(); nd = 9
dome = [ring(A_DOME * (1 - math.sin(math.pi / 2 * i / nd)), max(0.0008, R_DOME * math.cos(math.pi / 2 * i / nd)), 32) for i in range(nd + 1)]
bd.loft(dome, G_GLASS)
domeob = bd.finish('HF_dome', sharp_deg=70)

# ── головка под куполом (02, 05): основание, вогнутое зеркало с наклоном, стойка с латунным наконечником ──
bv = B()
def rY(a, r, n=24, cx=0.0, cz=0.0): return [Vector((cx + r * math.cos(2 * math.pi * j / n), Yb(a), cz + r * math.sin(2 * math.pi * j / n))) for j in range(n)]
bv.loft([rY(A_DOME + 0.001, 0.066), rY(A_DOME - 0.002, 0.066), rY(A_DOME - 0.004, 0.060), rY(A_DOME - 0.004, 0.050)], G_DARK)              # основание и ободок
T8 = Matrix.Rotation(math.radians(8), 4, 'X'); cM = Vector((0, Yb(A_DOME - 0.006), 0.004))
mir = []
for k in range(7):                                                                                                         # вогнутое зеркало: чаша
    rr = 0.050 * k / 6; dy = 0.016 * (rr / 0.050) ** 2
    mir.append([cM + T8 @ Vector((max(rr, 0.0006) * math.cos(2 * math.pi * j / 24), dy, max(rr, 0.0006) * math.sin(2 * math.pi * j / 24))) for j in range(24)])
mir.append([cM + T8 @ Vector((0.0515 * math.cos(2 * math.pi * j / 24), 0.017, 0.0515 * math.sin(2 * math.pi * j / 24))) for j in range(24)])
mir.append([cM + T8 @ Vector((0.0515 * math.cos(2 * math.pi * j / 24), 0.010, 0.0515 * math.sin(2 * math.pi * j / 24))) for j in range(24)])
bv.loft(mir, G_METAL)
cP = cM + T8 @ Vector((0, 0.002, 0))
for (y0, y1, r0, r1, g) in ((0.000, 0.030, 0.006, 0.005, G_DARK), (0.030, 0.036, 0.009, 0.009, G_METAL), (0.036, 0.040, 0.009, 0.004, G_METAL)):     # стойка, латунный наконечник
    bv.loft([[cP + T8 @ Vector((r_ * math.cos(2 * math.pi * j / 12), y_, r_ * math.sin(2 * math.pi * j / 12))) for j in range(12)] for y_, r_ in ((y0, r0), (y1, r1))], g, cap1=g)
for j in range(3):                                                                                                         # растяжки стойки
    t = 2 * math.pi * j / 3 + 0.3; u_ = Vector((math.cos(t), 0, math.sin(t))); w_ = Vector((-math.sin(t), 0, math.cos(t)))
    p0 = cP + T8 @ (u_ * 0.006 + Vector((0, 0.024, 0))); p1 = cP + T8 @ (u_ * 0.044 + Vector((0, 0.013, 0)))
    bv.loft([[p + w_ * dw + Vector((0, dz, 0)) for dw, dz in ((-0.0012, -0.0008), (0.0012, -0.0008), (0.0012, 0.0008), (-0.0012, 0.0008))] for p in (p0, p1)], G_DARK, cap0=G_DARK, cap1=G_DARK)
seeker = bv.finish('HF_seeker', sharp_deg=50)

# ── башмаки сверху ──
bf = B()
def tshoe(a0, a1, g, h=0.020):
    for (hw, za, zb, s0, s1) in ((0.010, R - 0.004, R + h - 0.006, 0.0, 0.0), (0.020, R + h - 0.006, R + h, 0.004, 0.004)):
        bf.loft([[Vector((x, Yb(aa), z)) for x, z in ((-hw, za), (hw, za), (hw, zb), (-hw, zb))] for aa in (a0 + s0, a1 - s1)], g, cap0=g, cap1=g)
tshoe(0.33, 0.45, G_DARK, 0.026); tshoe(0.80, 0.86, G_METAL); tshoe(1.38, 1.44, G_METAL)
# головки болтов на стыках
for s_ in SEAMS:
    for j in range(12):
        t = 2 * math.pi * (j + 0.5) / 12; er = Vector((math.cos(t), 0.0, math.sin(t)))
        if er.z > 0.93: continue
        c = Vector((0.0, Yb(s_ + 0.012), 0.0)) + er * (R - 0.0004); u_ = Vector((0, 1, 0)); v_ = er.cross(u_)
        bf.loft([[c + er * dz + (u_ * math.cos(2 * math.pi * q / 6) + v_ * math.sin(2 * math.pi * q / 6)) * 0.0035 for q in range(6)] for dz in (0.0, 0.0016)], G_METAL, cap1=G_METAL)
fixed = bf.finish('HF_fixed', sharp_deg=36)

# ── передние рули × (рули направления/высоты): ось у корня по радиусу, ход ±15° ──
PHI = (45.0, 135.0, 225.0, 315.0)
GAP, A_PIV = 0.003, 0.365
CPLAN = dict(a_le_root=0.300, a_te_root=0.425, a_le_tip=0.345, a_te_tip=0.415, span=0.045, t_root=0.007, t_tip=0.004)
FIN = {}
bdk = B()
def plate(P, a_le, a_te, s, t):
    ch = a_te - a_le
    return [P(a_le, s, 0.0), P(a_le + ch * 0.2, s, t / 2), P(a_le + ch * 0.75, s, t / 2), P(a_te, s, 0.0), P(a_le + ch * 0.75, s, -t / 2), P(a_le + ch * 0.2, s, -t / 2)]
for k, phi in enumerate(PHI, start=1):
    ph = math.radians(phi); er = Vector((math.sin(ph), 0.0, math.cos(ph))); et = Vector((math.cos(ph), 0.0, -math.sin(ph)))
    O = Vector((0.0, Yb(A_PIV), 0.0)) + er * (R + GAP)
    def P(a, s, w): return Vector((0.0, Yb(a), 0.0)) + er * (R + GAP + s) + et * w - O
    secs = []
    for f in (0.0, 0.5, 1.0):
        s = CPLAN['span'] * f
        secs.append(plate(P, CPLAN['a_le_root'] + (CPLAN['a_le_tip'] - CPLAN['a_le_root']) * f, CPLAN['a_te_root'] + (CPLAN['a_te_tip'] - CPLAN['a_te_root']) * f, s, CPLAN['t_root'] + (CPLAN['t_tip'] - CPLAN['t_root']) * f))
    bw = B(); bw.loft(secs, G_BODY, cap0=G_BODY, cap1=G_BODY)
    ob = bw.finish(f'fin_c{k}', sharp_deg=28); ob.location = O
    FIN[k] = dict(o=O.copy(), axis=er.copy(), phi=phi)
    c = Vector((0.0, Yb(A_PIV), 0.0)) + er * (R - 0.0008); u_ = Vector((0, 1, 0)); v_ = er.cross(u_)
    bdk.loft([[c + er * dz + (u_ * math.cos(2 * math.pi * q / 14) + v_ * math.sin(2 * math.pi * q / 14)) * rr for q in range(14)] for dz, rr in ((0.0, 0.022), (GAP - 0.0006, 0.022), (GAP - 0.0006, 0.017))], G_METAL, cap1=G_METAL)
discs = bdk.finish('HF_pivots', sharp_deg=30)

# ── задние крылья ×, неподвижные: длинная хорда (фото 05: корень a 1,12-1,625, кончик 1,19-1,60) ──
bt = B()
for phi in PHI:
    ph = math.radians(phi); er = Vector((math.sin(ph), 0.0, math.cos(ph))); et = Vector((math.cos(ph), 0.0, -math.sin(ph)))
    def P(a, s, w): return Vector((0.0, Yb(a), 0.0)) + er * (R - 0.002 + s) + et * w
    secs = []
    for f in (0.0, 0.4, 1.0):
        s = 0.077 * f
        secs.append(plate(P, 1.120 + (1.190 - 1.120) * f, 1.625 + (1.600 - 1.625) * f, s, 0.009 + (0.005 - 0.009) * f))
    bt.loft(secs, G_BODY, cap0=G_BODY, cap1=G_BODY)
    rf = lambda a, w, h: [Vector((0.0, Yb(a), 0.0)) + er * (R - 0.003 + z) + et * x for x, z in ((-w, 0.0), (-w * 0.8, h), (w * 0.8, h), (w, 0.0))]
    bt.loft([rf(1.13, 0.004, 0.002), rf(1.17, 0.011, 0.007), rf(1.60, 0.011, 0.007), rf(1.622, 0.008, 0.003)], G_BODY, cap0=G_BODY, cap1=G_BODY)
tails = bt.finish('HF_wings', sharp_deg=28)

bpy.context.view_layer.update()
mk.GEO = dict(L=L, R=R, A_END=A_END, SEAMS=SEAMS, A_PIV=A_PIV, A_DOME=A_DOME, R_DOME=R_DOME, RUD_RANGE=15.0)
mk.WING = FIN; mk.FIN = FIN; mk.Yb_ = Yb
mk.stats()
print('сцена HF114 построена')
