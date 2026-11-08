# LAU-61 (w_lau61) - свой блок НАР на 19 труб под нашу Hydra 70. Метры: ось блока Y, передний торец +Y (в glTF -Z), верх +Z (в glTF +Y, проушины),
# начало на оси посередине длины. a - расстояние от переднего среза (кромки обечайки). Запуск:
# LAU_OUT="<папка>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python _collide.py [--python bake.py --python deliver.py]
#
# ФОТО: 01 - блок на 19 труб, тёмная олива: проушины-пластины сверху (около 40 и 60 % длины от заднего торца), круглый разъём рядом с передней проушиной сверху-сбоку;
#       03 - два блока на вертолёте: раскладка 1 + 6 + 12 по кругам, толстая обечайка переднего торца, трубы почти у самой обечайки, носы чуть выступают;
#       02 - чужой рендер LAU-68: только вид обечайки и проушин. Размер - как сейчас в игре: 1,70 × 0,40 м (Mark/главный чат).
# СОСТАВ:
#  + корпус-цилиндр Ø 0,40 с 19 сквозными трубами (радиус отверстия 0,038 под ракету Ø 0,073), торцы утоплены на 30 мм за обечайками
#  + обечайки переднего и заднего торца со скруглённой кромкой
#  + 2 проушины-пластины сверху на 14 дюймов (0,356 м), круглый разъём с крышкой сверху-справа у передней проушины
#  + 19 ракет r0..r18 - упрощённая копия нашей Hydra 70 (профиль снят с hydra70.blend: взрыватель, боевая часть, хвостовое кольцо, сопло;
#    середина двигателя внутри трубы - тонкий цилиндр). Узел ракеты - в центре среза трубы. Порядок пуска - по кругу: внешний круг по часовой
#    (вид спереди) от верха, затем средний, последней - центральная.
import sys, os, math, importlib
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
import bpy, bmesh
import modelkit as mk; importlib.reload(mk)
from modelkit import B, Vector
from mathutils import Matrix

L = 1.70; R = 0.200; NSEG = 48
mk.configure('LAU61', 0.001, x0=0.0, yc=0.0, rb=200.0, nseg=NSEG, nose='left')
G_BODY, G_METAL, G_DARK, G_RKT = 0, 1, 2, 3
mk.set_materials([('LAU_body', (0.20, 0.22, 0.12)), ('LAU_metal', (0.35, 0.33, 0.28)), ('LAU_dark', (0.03, 0.035, 0.025)), ('LAU_rocket', (0.30, 0.32, 0.22))])
for m, (rough, metal) in zip(mk.MATS, ((0.6, 0.0), (0.45, 0.5), (0.8, 0.0), (0.5, 0.0))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
Yb = lambda a: L / 2 - a
A_F = 0.040                                    # торцы утоплены за обечайками
R_H = 0.038                                    # радиус трубы
R1, R2 = 0.0785, 0.157                         # круги труб: 6 и 12
P_OUT = 0.14                                   # насколько остриё взрывателя выступает за передний торец (фото 03 - чуть, 01 - сильно)

# ── трубы: центры и порядок пуска (по кругу, вид спереди - по часовой от верха: x = -r sin θ, z = r cos θ) ──
TUBES = []
for k in range(12): t = math.radians(15 + 30 * k); TUBES.append((-R2 * math.sin(t), R2 * math.cos(t)))
for k in range(6): t = math.radians(60 * k); TUBES.append((-R1 * math.sin(t), R1 * math.cos(t)))
TUBES.append((0.0, 0.0))


def ring_y(y, r, n=NSEG, cx=0.0, cz=0.0, ph=0.0):
    return [Vector((cx + r * math.cos(2 * math.pi * j / n + ph), y, cz + r * math.sin(2 * math.pi * j / n + ph))) for j in range(n)]


# ── корпус с трубами: цилиндр минус 19 труб (булево) ──
bc = B(); bc.loft([ring_y(Yb(A_F), R), ring_y(Yb(L / 2), R), ring_y(Yb(L - A_F), R)], G_BODY, cap0=G_DARK, cap1=G_DARK)
core = bc.finish('LAU_core', sharp_deg=30)
bt = B()
for (cx, cz) in TUBES: bt.loft([ring_y(Yb(-0.05), R_H, 12, cx, cz, math.pi / 12), ring_y(Yb(L + 0.05), R_H, 12, cx, cz, math.pi / 12)], G_DARK, cap0=G_DARK, cap1=G_DARK)
cut = bt.finish('LAU_cut', sharp_deg=30)
mod = core.modifiers.new('bool', 'BOOLEAN'); mod.operation = 'DIFFERENCE'; mod.object = cut; mod.solver = 'EXACT'
dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(core.evaluated_get(dg))
core.modifiers.clear(); old = core.data; core.data = me; bpy.data.meshes.remove(old)
bpy.data.objects.remove(cut, do_unlink=True)
for p in core.data.polygons:                                  # стенки труб и торцы - тёмные
    c = p.center; n = p.normal
    rr = math.hypot(c.x, c.z)
    if abs(n.y) > 0.9: p.material_index = G_DARK
    elif rr < R - 0.002: p.material_index = G_DARK
    else: p.material_index = G_BODY
for p in core.data.polygons: p.use_smooth = abs(p.normal.y) < 0.9          # торцы плоские (булевы n-угольники со сглаживанием дают разводы)
core.data.update()
core.name = 'LAU_body'

# ── обечайки торцов: профиль вращения со скруглённой кромкой ──
bl = B()
def lip(front):
    s = 1 if front else -1; a0 = 0.0 if front else L
    prof = [(0.056, R), (0.050, R + 0.0055), (0.008, R + 0.0060), (0.0, R + 0.0015), (0.004, R - 0.0035), (0.050, R - 0.0035)]
    rings = [ring_y(Yb(a0 + s * da), rr, 40) for da, rr in prof] + [ring_y(Yb(a0 + s * prof[0][0]), prof[0][1], 40)]
    bl.loft(rings, G_BODY)
lip(True); lip(False)
bmesh.ops.remove_doubles(bl.bm, verts=bl.bm.verts[:], dist=1e-6)
lips = bl.finish('LAU_lips', sharp_deg=40)

# ── проушины, разъём, мелочи ──
bf = B()
def box(c, hx, hy, hz, g):
    bf.loft([[c + Vector((x, y0, z)) for x, z in ((-hx, -hz), (hx, -hz), (hx, hz), (-hx, hz))] for y0 in (-hy, hy)], g, cap0=g, cap1=g)
LUGS = (0.672, 1.028)                          # 14 дюймов, середина на a 0,85 (01: ~40 и 60 % длины от заднего торца)
for ac in LUGS:
    y = Yb(ac); box(Vector((0, y, R + 0.003)), 0.018, 0.034, 0.005, G_METAL)            # площадка
    # проушина-пластина (01): «D»-образная пластина 6 мм с отверстием Ø 18 мм, вдоль оси блока
    zb, zc, HW, RO, RI, NQ_ = R + 0.008, R + 0.024, 0.022, 0.022, 0.009, 20
    outer, inner = [], []
    for q in range(NQ_):
        th = 2 * math.pi * q / NQ_; d = (math.cos(th), math.sin(th))
        if d[1] >= 0: t = RO
        else: t = min(HW / max(abs(d[0]), 1e-6), (zc - zb) / -d[1])
        outer.append((y + d[0] * t, zc + d[1] * t)); inner.append((y + d[0] * RI, zc + d[1] * RI))
    P3 = lambda pts, x: [Vector((x, yy, zz)) for yy, zz in pts]
    bf.loft([P3(outer, -0.003), P3(outer, 0.003)], G_METAL); bf.loft([P3(inner, 0.003), P3(inner, -0.003)], G_METAL)
    bf.loft([P3(outer, 0.003), P3(inner, 0.003)], G_METAL); bf.loft([P3(inner, -0.003), P3(outer, -0.003)], G_METAL)
# разъём: круглое основание и крышка, сверху справа у передней проушины (01)
t0 = math.radians(-35); ax = Vector((math.sin(t0), 0, math.cos(t0))); u_ = Vector((0, 1, 0)); v_ = ax.cross(u_)
for rr, z0, h, g in ((0.030, -0.004, 0.006, G_METAL), (0.022, 0.002, 0.012, G_METAL), (0.016, 0.012, 0.004, G_DARK)):
    c = Vector((0, Yb(0.56), 0)) + ax * R
    bf.loft([[c + ax * dz + (u_ * math.cos(2 * math.pi * q / 12) + v_ * math.sin(2 * math.pi * q / 12)) * rr for q in range(12)] for dz in (z0, z0 + h)], g, cap1=g)
# кронштейн чеки (между проушинами, сверху слева)
t1 = math.radians(25); ax1 = Vector((math.sin(t1), 0, math.cos(t1)))
c = Vector((0, Yb(0.86), 0)) + ax1 * (R + 0.004)
bf.loft([[c + ax1 * dz + Vector((math.cos(t1) * x, y_, -math.sin(t1) * x)) for x, y_ in ((-0.010, -0.016), (0.010, -0.016), (0.010, 0.016), (-0.010, 0.016))] for dz in (-0.006, 0.006)], G_METAL, cap0=G_METAL, cap1=G_METAL)
fixed = bf.finish('LAU_fixed', sharp_deg=36)

# ── ракета: упрощённая копия нашей Hydra 70 (профиль из hydra70.blend, y ракеты: остриё 0,725, сопло -0,728) ──
Y_FACE_R = 0.725 - P_OUT                         # y ракеты в плоскости переднего торца
NR = 8
PROF = [(0.725, 0.0015), (0.660, 0.0145), (0.624, 0.0185),                                      # взрыватель
        (0.624, 0.0205), (0.605, 0.0205),                                                                           # основание взрывателя
        (0.560, 0.0260), (0.480, 0.0325),                                                                           # боевая часть (видна в трубе); дальше двигатель внутри
        (-0.598, 0.0365), (-0.684, 0.0365), (-0.690, 0.0300), (-0.706, 0.0160)]                                     # хвостовое кольцо, раструб сопла внутрь, дно
rb = B()
rk_rings = [[Vector((r * math.cos(2 * math.pi * j / NR), y - Y_FACE_R, r * math.sin(2 * math.pi * j / NR))) for j in range(NR)] for y, r in PROF]
rb.loft(rk_rings, G_RKT, cap0=G_RKT, cap1=G_RKT)
bmesh.ops.remove_doubles(rb.bm, verts=rb.bm.verts[:], dist=1e-7)
r0 = rb.finish('r0', sharp_deg=70)
for p in r0.data.polygons: p.use_smooth = True
ROCKETS = []
for i, (cx, cz) in enumerate(TUBES):
    if i == 0: ob = r0
    else:
        ob = bpy.data.objects.new(f'r{i}', r0.data); mk.col.objects.link(ob)            # общая сетка - в glTF один меш на 19 узлов
    ob.location = Vector((cx, Yb(A_F), cz)); ROCKETS.append(ob)

bpy.context.view_layer.update()
mk.GEO = dict(L=L, R=R, A_F=A_F, R_H=R_H, R1=R1, R2=R2, P_OUT=P_OUT, TUBES=TUBES, LUGS=LUGS, Y_FACE_R=Y_FACE_R)
mk.Yb_ = Yb
mk.stats()
print('сцена LAU61 построена')
