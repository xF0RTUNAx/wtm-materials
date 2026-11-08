# Б-8 (w_b8) - свой блок НАР на 20 труб под нашу С-8, с отдельным обтекателем cone (Б-8М1; без него - вертолётный вид). Метры: ось Y, перёд +Y (в glTF -Z),
# верх +Z (в glTF +Y, упоры), начало на оси посередине длины КОРПУСА без обтекателя. a - расстояние от переднего торца корпуса (обтекатель - при a < 0). Запуск:
# B8_OUT="<папка>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python _collide.py [--python bake.py --python deliver.py]
#
# ФОТО: 04 - сбоку: корпус Ø ~100 пикс. = 0,52 м, корпус ~327 пикс. = 1,70 м, обтекатель ~186 пикс. ~ 0,97 м (берём 0,90: съёмка чуть спереди);
#       01, 03 - обтекатель-конус с 20 вырезами (внешний круг 13, внутренний 7, остриё целое), кромки вырезов, болты; 05 - задний торец: трубы, обечайка;
#       02 - на Су-25. Балкодержатель и пилон не делаем.
# СОСТАВ:
#  + корпус Ø 0,52 × 1,70: цилиндр с поясками у торцов, 20 сквозных труб (радиус 0,0435 под С-8 Ø 0,082), плоские торцы - без обтекателя блок законченный
#  + обтекатель cone - отдельный узел: тонкостенный конус 0,90 м с 20 вырезами (пересечение конуса с продолжениями труб), острый носок с колпачком
#  + сверху: планка с двумя упорами-серьгами (250 мм) и четырьмя площадками-упорами
#  + 20 ракет r0..r19 - упрощённая копия нашей С-8 (профиль снят с s8.blend), одна сетка на все. Узел ракеты - в центре среза трубы на переднем торце.
#    Порядок пуска - по кругу: внешний круг (r0..r12) по часовой стрелке от верха (вид спереди), затем внутренний (r13..r19).
import sys, os, math, importlib
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
import bpy, bmesh
import modelkit as mk; importlib.reload(mk)
from modelkit import B, Vector
from mathutils import Matrix

L = 1.70; R = 0.26; NSEG = 40; L_CONE = 0.90
mk.configure('B8', 0.001, x0=0.0, yc=0.0, rb=260.0, nseg=NSEG, nose='left')
G_BODY, G_METAL, G_DARK, G_RKT = 0, 1, 2, 3
mk.set_materials([('B8_body', (0.50, 0.51, 0.52)), ('B8_metal', (0.40, 0.40, 0.40)), ('B8_dark', (0.03, 0.03, 0.03)), ('B8_rocket', (0.17, 0.19, 0.16))])
for m, (rough, metal) in zip(mk.MATS, ((0.38, 0.85), (0.45, 0.7), (0.85, 0.0), (0.5, 0.0))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
Yb = lambda a: L / 2 - a
R_H = 0.0435
R1, R2 = 0.105, 0.198                          # 7 внутренних, 13 внешних
TIP_OUT = (0.20, 0.52)                         # Mark: ракеты выходят в острую часть - носы у вырезов обтекателя: внешний круг на 0,20 м, внутренний на 0,52 м вперёд торца
TUBES = []
for k in range(13): t = 2 * math.pi * k / 13; TUBES.append((-R2 * math.sin(t), R2 * math.cos(t)))
for k in range(7): t = 2 * math.pi * (k + 0.5) / 7; TUBES.append((-R1 * math.sin(t), R1 * math.cos(t)))


def ring_y(y, r, n=NSEG, cx=0.0, cz=0.0, ph=0.0):
    return [Vector((cx + r * math.cos(2 * math.pi * j / n + ph), y, cz + r * math.sin(2 * math.pi * j / n + ph))) for j in range(n)]


def fix_normals(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(ob.data); bm.free(); ob.data.update()


def boolean_diff(ob, cutter):
    fix_normals(ob); fix_normals(cutter)
    mod = ob.modifiers.new('bool', 'BOOLEAN'); mod.operation = 'DIFFERENCE'; mod.object = cutter; mod.solver = 'EXACT'
    try: mod.use_self = True; mod.use_hole_tolerant = True
    except Exception: pass
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear(); old = ob.data; ob.data = me; bpy.data.meshes.remove(old)


def tube_cutter(a0, a1, r=R_H, n=10):
    bt = B()
    for (cx, cz) in TUBES: bt.loft([ring_y(Yb(a0), r, n, cx, cz, math.pi / n), ring_y(Yb(a1), r, n, cx, cz, math.pi / n)], G_DARK, cap0=G_DARK, cap1=G_DARK)
    return bt.finish('cut_tmp', sharp_deg=30)


# ── корпус: профиль с поясками у торцов, затем 20 труб булевым вычитанием ──
PROF = [(0.000, R - 0.004), (0.004, R + 0.003), (0.040, R + 0.003), (0.046, R), (L - 0.046, R), (L - 0.040, R + 0.003), (L - 0.004, R + 0.003), (L, R - 0.004)]   # стыки панелей - на текстуре
bc = B(); bc.loft([ring_y(Yb(a), r) for a, r in PROF], G_BODY, cap0=G_DARK, cap1=G_DARK)
core = bc.finish('B8_body', sharp_deg=30)
cut = tube_cutter(-0.05, L + 0.05); boolean_diff(core, cut); bpy.data.objects.remove(cut, do_unlink=True)
for p in core.data.polygons:
    c = p.center; rr = math.hypot(c.x, c.z)
    p.material_index = G_DARK if (abs(p.normal.y) > 0.9 or rr < R - 0.006) else G_BODY
    p.use_smooth = abs(p.normal.y) < 0.9
core.data.update()

# ── обтекатель cone: тонкостенный конус с вырезами по продолжениям труб, носок с колпачком ──
def cone_r(a):                                  # a < 0: впереди корпуса; слегка выпуклая образующая
    u = (-a) / L_CONE; return R * (1 - u) * (1 + 0.18 * u)
CA = [0.0, -0.12, -0.30, -0.50, -0.70, -0.87]
outer = [ring_y(Yb(a), cone_r(a) + (0.003 if a == 0.0 else 0.0), 24) for a in CA]
inner = [ring_y(Yb(a), max(0.004, cone_r(a) - 0.004), 32) for a in CA[::-1]]
bk = B(); bk.loft(outer, G_BODY)                                 # одна оболочка: толщина кромок вырезов - на текстуре
bmesh.ops.remove_doubles(bk.bm, verts=bk.bm.verts[:], dist=1e-6)
cone = bk.finish('cone', sharp_deg=35)
cut = tube_cutter(-L_CONE - 0.1, 0.02, 0.0430, 12); boolean_diff(cone, cut); bpy.data.objects.remove(cut, do_unlink=True)   # вырезы чуть уже трубы - между ними остаются перемычки
for p in cone.data.polygons: p.use_smooth = True
bmc = bmesh.new(); bmc.from_mesh(cone.data)                     # кромки вырезов - острые, иначе сглаживание размазывает тени по длинным треугольникам
bmesh.ops.dissolve_limit(bmc, angle_limit=math.radians(1.0), verts=bmc.verts[:], edges=bmc.edges[:])
bmesh.ops.triangulate(bmc, faces=bmc.faces[:])
for e in bmc.edges:
    if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(28): e.smooth = False
bmc.to_mesh(cone.data); bmc.free(); cone.data.update()
cone.data.update()
# колпачок носка (01: латунный)
bn = B()
tipP = [(-0.865, 0.030), (-0.885, 0.022), (-0.898, 0.010), (-0.902, 0.002)]
bn.loft([ring_y(Yb(a), r, 16) for a, r in tipP], G_METAL, cap0=G_METAL)
nose_cap = bn.finish('cone_tip', sharp_deg=40)
# болты по основанию обтекателя (крепление к корпусу)
bn = B()
for j in range(24):
    t = 2 * math.pi * (j + 0.5) / 24; er = Vector((math.cos(t), 0.0, math.sin(t)))
    c = Vector((0.0, Yb(-0.025), 0.0)) + er * (cone_r(-0.025) + 0.0005); u_ = Vector((0, 1, 0)); v_ = er.cross(u_)
    bn.loft([[c + er * dz + (u_ * math.cos(2 * math.pi * q / 6) + v_ * math.sin(2 * math.pi * q / 6)) * 0.005 for q in range(6)] for dz in (0.0, 0.002)], G_METAL, cap1=G_METAL)
bolts = bn.finish('cone_bolts', sharp_deg=36)
# всё, что относится к обтекателю, - одним узлом cone
bpy.ops.object.select_all(action='DESELECT')
for o in (cone, nose_cap, bolts): o.select_set(True)
bpy.context.view_layer.objects.active = cone
bpy.ops.object.join()
cone = bpy.context.view_layer.objects.active; cone.name = 'cone'

# ── сверху: планка, две серьги на 250 мм, площадки-упоры ──
bf = B()
def box(c, hx, hy, hz, g):
    bf.loft([[c + Vector((x, y0, z)) for x, z in ((-hx, -hz), (hx, -hz), (hx, hz), (-hx, hz))] for y0 in (-hy, hy)], g, cap0=g, cap1=g)
LUGS = (0.725, 0.975)
box(Vector((0, Yb(0.85), R + 0.004)), 0.030, 0.230, 0.006, G_METAL)                          # планка
for ac in LUGS:
    y = Yb(ac); zb, zc, HW, RO, RI, NQ_ = R + 0.010, R + 0.030, 0.022, 0.022, 0.010, 14
    outer_, inner_ = [], []
    for q in range(NQ_):
        th = 2 * math.pi * q / NQ_; d = (math.cos(th), math.sin(th))
        tt = RO if d[1] >= 0 else min(HW / max(abs(d[0]), 1e-6), (zc - zb) / -d[1])
        outer_.append((y + d[0] * tt, zc + d[1] * tt)); inner_.append((y + d[0] * RI, zc + d[1] * RI))
    P3 = lambda pts, x: [Vector((x, yy, zz)) for yy, zz in pts]
    bf.loft([P3(outer_, -0.005), P3(outer_, 0.005)], G_METAL); bf.loft([P3(inner_, 0.005), P3(inner_, -0.005)], G_METAL)
    bf.loft([P3(outer_, 0.005), P3(inner_, 0.005)], G_METAL); bf.loft([P3(inner_, -0.005), P3(outer_, -0.005)], G_METAL)
for ac in (0.60, 1.10):                                                                        # площадки-упоры под упоры балкодержателя
    for sx in (-1, 1):
        t = math.radians(sx * 32); er = Vector((math.sin(t), 0, math.cos(t)))
        c = Vector((0, Yb(ac), 0)) + er * (R + 0.002); u_ = Vector((0, 1, 0)); v_ = er.cross(u_)
        bf.loft([[c + er * dz + u_ * uu + v_ * vv for uu, vv in ((-0.035, -0.022), (0.035, -0.022), (0.035, 0.022), (-0.035, 0.022))] for dz in (-0.002, 0.004)], G_METAL, cap0=G_METAL, cap1=G_METAL)
# разъём сбоку у передней серьги
t0 = math.radians(-40); ax = Vector((math.sin(t0), 0, math.cos(t0))); u_ = Vector((0, 1, 0)); v_ = ax.cross(u_)
for rr, z0, h, g in ((0.026, -0.003, 0.006, G_METAL), (0.018, 0.003, 0.012, G_METAL), (0.013, 0.013, 0.003, G_DARK)):
    c = Vector((0, Yb(0.66), 0)) + ax * R
    bf.loft([[c + ax * dz + (u_ * math.cos(2 * math.pi * q / 12) + v_ * math.sin(2 * math.pi * q / 12)) * rr for q in range(12)] for dz in (z0, z0 + h)], g, cap1=g)
fixed = bf.finish('B8_fixed', sharp_deg=36)

# ── ракеты: упрощённая копия нашей С-8 (y ракеты: остриё 0,785, сопло -0,773), ревизия 2 (главный чат, 2026-11-08) ──
# Ракета разрезана на две части по плоскости a = A_CUT (за передним торцом, внутри труб):
#   r0..r19          - задняя часть в трубе (общая для обоих видов); прячется игрой после пуска;
#   cone_r0..cone_r19 - передняя часть (нос, выходит в острую часть) - дочерние узлы cone: спрятал cone - пропали обтекатель и выступающие носы;
#   heli_r0..heli_r19 - носы, утопленные у срезов труб (вертолётный Б-8В20) - дочерние узлы heli; heli - кольца срезов труб.
Y_FACE_R = 0.785                                # начало каждого узла ракеты - остриё взрывателя (у heli_r - своё, утопленное остриё)
A_CUT = 0.30                                    # плоскость разреза: 0,30 м за передним торцом
HELI_IN = 0.012                                 # у heli остриё на 12 мм глубже среза трубы
NR = 6
PROF_R = [(0.785, 0.0028), (0.750, 0.0140), (0.660, 0.0260), (0.560, 0.0400),
          (0.455, 0.0410), (-0.735, 0.0410), (-0.735, 0.0310), (-0.773, 0.0180), (-0.760, 0.0110)]
def r_at_y(y):
    for (y0, r0_), (y1, r1_) in zip(PROF_R, PROF_R[1:]):
        if y1 <= y <= y0 and y0 != y1: return r0_ + (r1_ - r0_) * (y0 - y) / (y0 - y1)
    return 0.041
def segment(name, y_hi, y_lo):
    pts = [(y_hi, r_at_y(y_hi))] + [(y, r) for y, r in PROF_R if y_lo < y < y_hi] + ([(y_lo, r_at_y(y_lo))] if y_lo > -0.735 else [(y, r) for y, r in PROF_R if y <= -0.735])
    if y_hi >= 0.785: pts = PROF_R[:1] + [(y, r) for y, r in pts[1:] if y < 0.785]
    rb = B()
    rb.loft([[Vector((r * math.cos(2 * math.pi * j / NR), y - Y_FACE_R, r * math.sin(2 * math.pi * j / NR))) for j in range(NR)] for y, r in pts], G_RKT, cap0=G_RKT, cap1=G_RKT)
    bmesh.ops.remove_doubles(rb.bm, verts=rb.bm.verts[:], dist=1e-7)
    ob = rb.finish(name, sharp_deg=70)
    for p in ob.data.polygons: p.use_smooth = True
    return ob
tip_of = lambda i: TIP_OUT[0] if i < 13 else TIP_OUT[1]
y_cut = {k: 0.785 - (TIP_OUT[k] + A_CUT) for k in (0, 1)}                       # y ракеты на плоскости разреза: внешний и внутренний круг
tmpl = {('r', 0): segment('r0', y_cut[0], -0.80), ('r', 1): segment('r13', y_cut[1], -0.80),
        ('c', 0): segment('cone_r0', 0.785, y_cut[0]), ('c', 1): segment('cone_r13', 0.785, y_cut[1]),
        ('h', 0): segment('heli_r0', 0.785, 0.785 - (A_CUT - HELI_IN))}
# heli: кольца-срезы труб на переднем торце (видны только в вертолётном виде, под обтекателем скрыты)
bh = B()
for (cx, cz) in TUBES:
    bh.loft([ring_y(Yb(-0.002), R_H + 0.006, 10, cx, cz, math.pi / 10), ring_y(Yb(-0.002), R_H, 10, cx, cz, math.pi / 10)], G_DARK)
heli = bh.finish('heli', sharp_deg=40)
for i, (cx, cz) in enumerate(TUBES):
    k = 0 if i < 13 else 1
    tip = Vector((cx, Yb(-tip_of(i)), cz))
    for kind, par in (('r', None), ('c', cone), ('h', heli)):
        nm = {'r': f'r{i}', 'c': f'cone_r{i}', 'h': f'heli_r{i}'}[kind]
        src = tmpl[(kind, 0 if kind == 'h' else k)]
        ob = bpy.data.objects.get(nm)
        if ob is None: ob = bpy.data.objects.new(nm, src.data); mk.col.objects.link(ob)
        loc = Vector((cx, Yb(HELI_IN), cz)) if kind == 'h' else tip
        ob.location = loc
        if par is not None:
            ob.parent = par; ob.matrix_parent_inverse = par.matrix_world.inverted()

for o in [o for o in bpy.data.objects if o.name.startswith('cut_tmp')]: bpy.data.objects.remove(o, do_unlink=True)
bpy.context.view_layer.update()
mk.GEO = dict(L=L, R=R, R_H=R_H, R1=R1, R2=R2, L_CONE=L_CONE, TUBES=TUBES, LUGS=LUGS, Y_FACE_R=Y_FACE_R, TIP_OUT=TIP_OUT, A_CUT=A_CUT, HELI_IN=HELI_IN)
mk.Yb_ = Yb
mk.stats()
print('сцена B8 построена')
