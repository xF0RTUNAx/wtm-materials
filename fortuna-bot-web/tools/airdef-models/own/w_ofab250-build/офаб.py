# ОФАБ-250-270: своя модель (форма). Оси игры: нос -Z, верх +Y (ушки), начало на оси посередине длины.
# В Blender: нос +Y, верх +Z. a - расстояние от кончика взрывателя назад (м), Y = L/2 - a. Размеры с фото ofab_03 (бок) относительно длины 1,48 м и с ofab_01, 02.
# Запуск: blender -b --factory-startup --python офаб.py -- [--out путь.glb] [--blend путь.blend]
import bpy, bmesh, math, os, sys, json
from mathutils import Vector, Matrix
from mathutils.geometry import tessellate_polygon

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/ОФАБ-250'
A_ = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opt = lambda k, d: A_[A_.index(k) + 1] if k in A_ else d

L = 1.48; RB = 0.156                         # длина с взрывателем, радиус корпуса (диаметр 0,312: 390 пикс при 1253 пикс/м на фото 03)
RH = 0.161                                   # головной пояс чуть шире корпуса (фото 03, 02)
A_HEAD, A_BODY1, A_CONE1, A_NECK1 = 0.205, 0.950, 1.245, 1.335    # шов головы, конец цилиндра, конец конуса, конец шейки
R_CONE1, R_NECK = 0.068, 0.050
LUGS = (0.345, 0.595)                        # ушки: шаг 250 мм (фото 02, 03)
RF, RR, RRI = 0.176, 0.171, 0.167            # перья и кольцо стабилизатора шире корпуса (Ø кольца 0,342 при корпусе 0,312, слово Mark)
A_RING0 = 1.355
FIN_T = 0.004
def Yb(a): return L / 2 - a

for o in list(bpy.data.objects): bpy.data.objects.remove(o)
sc = bpy.context.scene
MATS = {}
for nm, c in (('ofab_body', (0.55, 0.56, 0.56, 1)), ('ofab_fuze', (0.60, 0.08, 0.06, 1)), ('ofab_dark', (0.05, 0.05, 0.05, 1))):
    m = bpy.data.materials.new(nm); m.diffuse_color = c; m.use_nodes = True; next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = c; MATS[nm] = m
M_BODY, M_FUZE, M_DARK = 0, 1, 2


def obj(name, bm, smooth=True, sharp=35):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in MATS.values(): me.materials.append(m)
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
    for p in me.polygons: p.use_smooth = smooth
    bm2 = bmesh.new(); bm2.from_mesh(me)
    for e in bm2.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(sharp): e.smooth = False
    bm2.to_mesh(me); bm2.free()
    return ob


def lathe(bm, prof, n=64, mat=M_BODY):
    """Тело вращения вокруг оси Y Blender: prof - [(a, r)] от хвоста к носу или наоборот; r = 0 - точка на оси."""
    rings = []
    for a, r in prof:
        y = Yb(a)
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * k / n), y, r * math.sin(2 * math.pi * k / n))) for k in range(n)] if r > 1e-6 else [bm.verts.new((0, y, 0))])
    for p, q in zip(rings, rings[1:]):
        if len(p) == 1:
            for k in range(n): f = bm.faces.new((p[0], q[k], q[(k + 1) % n])); f.material_index = mat
        elif len(q) == 1:
            for k in range(n): f = bm.faces.new((p[k], p[(k + 1) % n], q[0])); f.material_index = mat
        else:
            for k in range(n): f = bm.faces.new((p[k], p[(k + 1) % n], q[(k + 1) % n], q[k])); f.material_index = mat


def bead(prof, a, r, w=0.010, h=0.0025):
    """Сварной шов: невысокий валик; по краям ровные кольца, чтобы сглаживание не тянуло свет на весь участок."""
    return prof + [(a - w / 2 - 0.006, r), (a - w / 2, r), (a - w * 0.25, r + h * 0.8), (a, r + h), (a + w * 0.25, r + h * 0.8), (a + w / 2, r), (a + w / 2 + 0.006, r)]


def groove(prof, a, r, w=0.006, d=0.002):
    return prof + [(a - w / 2 - 0.005, r), (a - w / 2, r), (a - w / 4, r - d), (a + w / 4, r - d), (a + w / 2, r), (a + w / 2 + 0.005, r)]


# ── корпус: торец головы ступенями, головной пояс, цилиндр, конус, шейка (ofab_01, 02, 03) ──
def body():
    bm = bmesh.new(); P = []
    # торец: обод, ступени к центру; в центре гнездо взрывателя (взрыватель - отдельно)
    P += [(0.019, 0.0), (0.019, 0.047), (0.021, 0.050), (0.021, 0.068), (0.016, 0.071), (0.014, 0.082), (0.016, 0.086), (0.016, 0.104), (0.021, 0.108), (0.024, 0.118), (0.026, 0.124)]
    for k in range(9):                                          # скруглённая кромка головы, радиус 4 см
        t = math.pi / 2 * (k + 1) / 9; P.append((0.026 + 0.040 * (1 - math.cos(t)) * 0.95, 0.124 + (RH - 0.124) * math.sin(t)))
    P = groove(P, 0.100, RH); P = groove(P, 0.150, RH)
    P += [(0.193, RH), (0.198, RH - 0.003), (0.200, RB + 0.001)]
    P = bead(P, A_HEAD, RB + 0.001, 0.012, 0.0028)
    P = bead(P, 0.560, RB, 0.008, 0.0012)                       # поперечный шов на середине (фото 03)
    P += [(A_BODY1 - 0.018, RB), (A_BODY1 - 0.006, RB - 0.0015), (A_BODY1, RB - 0.003)]
    P = bead(P, A_BODY1 + 0.004, RB - 0.004, 0.012, 0.0025)
    for k in range(1, 9):                                       # конус, чуть выпуклый
        t = k / 8; a = A_BODY1 + 0.012 + (A_CONE1 - A_BODY1 - 0.012) * t; r = (RB - 0.006) + (R_CONE1 - (RB - 0.006)) * t + 0.006 * math.sin(math.pi * t); P.append((a, r))
    P += [(A_CONE1 + 0.004, R_CONE1 - 0.003), (A_CONE1 + 0.006, R_NECK + 0.004), (A_CONE1 + 0.010, R_NECK), (A_NECK1 - 0.006, R_NECK), (A_NECK1, R_NECK - 0.006), (A_NECK1, 0.020), (A_NECK1 - 0.004, 0.0)]
    lathe(bm, P)
    return obj('body', bm, sharp=30)


def fuze():
    """Взрыватель: красный колпак в гнезде торца (ofab_01, 02)."""
    bm = bmesh.new(); P = [(0.024, 0.0), (0.024, 0.040), (0.016, 0.042), (0.012, 0.040), (0.008, 0.036)]
    for k in range(1, 8):
        t = math.pi / 2 * k / 8; P.append((0.008 - 0.008 * math.sin(t), 0.036 * math.cos(t)))
    P.append((0.0, 0.0)); lathe(bm, P, n=40, mat=M_FUZE)
    return obj('fuze', bm, sharp=40)


# ── ушки подвески: площадка по корпусу и петля в продольной плоскости (ofab_02, 03) ──
def lug(a0, name):
    bm = bmesh.new(); hw, hl, rr = 0.030, 0.050, 0.012          # площадка: полуширина поперёк, полудлина вдоль, скругление
    def pad_ring(k, h):
        pts = []
        for cx, cy, a_s in ((hl - rr, hw - rr, 0), (-hl + rr, hw - rr, 90), (-hl + rr, -hw + rr, 180), (hl - rr, -hw + rr, 270)):
            for i in range(5):
                t = math.radians(a_s + 90 * i / 4); pts.append((cx + rr * math.cos(t) * k, cy + rr * math.sin(t) * k))
        out = []
        for da, dx in pts:
            x = dx; z = math.sqrt(max(RB * RB - x * x, 0)) + h; out.append(bm.verts.new((x, Yb(a0 + da), z)))
        return out
    rs = [pad_ring(1.0, -0.004), pad_ring(1.0, 0.006), pad_ring(0.75, 0.010), pad_ring(0.4, 0.011)]
    n = len(rs[0])
    for p, q in zip(rs, rs[1:]):
        for k in range(n): bm.faces.new((p[k], p[(k + 1) % n], q[(k + 1) % n], q[k]))
    bm.faces.new(rs[-1]); bm.faces.new(rs[0][::-1])
    # петля: кольцо с отверстием, плоскость вдоль оси; стойки уходят в площадку
    zc = RB + 0.030; Ro, Ri, t2 = 0.020, 0.0095, 0.0070; m = 24
    def loop_ring(r, x):
        return [bm.verts.new((x, Yb(a0) + r * math.cos(math.pi * k / (m - 1)), zc + r * math.sin(math.pi * k / (m - 1)) if k not in (0, m - 1) else zc - 0.024)) for k in range(m)]
    o1, i1, i2, o2 = loop_ring(Ro, -t2), loop_ring(Ri, -t2), loop_ring(Ri, t2), loop_ring(Ro, t2)
    for p, q in ((o1, o2), (o2, i2), (i2, i1), (i1, o1)):
        for k in range(m - 1): bm.faces.new((p[k], p[k + 1], q[k + 1], q[k]))
    for k in (0, m - 1): bm.faces.new((o1[k], i1[k], i2[k], o2[k]) if k == 0 else (o2[k], i2[k], i1[k], o1[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return obj(name, bm, sharp=40)


# ── стабилизатор: 4 пера плюсом (одно над ушками) с окнами, кольцо, распорки (ofab_01, 03) ──
def rcone(a):
    if a <= A_BODY1: return RB
    if a <= A_CONE1: t = (a - A_BODY1) / (A_CONE1 - A_BODY1); return (RB - 0.006) + (R_CONE1 - (RB - 0.006)) * t + 0.006 * math.sin(math.pi * t)
    return R_NECK


def fin_outline():
    """Контур пера (a, r) и окно. Корень на 3 мм внутри конуса."""
    out = [(0.985, rcone(0.985) - 0.003), (1.150, RF), (L - 0.002, RF), (L - 0.002, R_NECK + 0.012), (A_NECK1 + 0.004, R_NECK - 0.003)]
    for k in range(1, 9):
        a = A_NECK1 - (A_NECK1 - 0.985) * k / 9; out.append((a, rcone(a) - 0.003))
    win = [(1.150, rcone(1.150) + 0.016), (1.190, RF - 0.024), (1.405, RF - 0.024), (1.405, R_NECK + 0.034), (1.300, R_NECK + 0.016)]
    win = [(a, max(r, rcone(a) + 0.014)) for a, r in win]
    return out, win


def fins():
    bm = bmesh.new(); out, win = fin_outline()
    for i in range(4):
        ang = math.pi / 2 * i + math.pi / 2                       # 90° - вверх (над ушками), дальше вправо, вниз, влево
        u = Vector((math.cos(ang), 0, math.sin(ang))); nrm = Vector((-math.sin(ang), 0, math.cos(ang)))
        P = lambda a, r, s: u * r + Vector((0, Yb(a), 0)) + nrm * (s * FIN_T / 2)
        pts2 = [Vector((a, r, 0)) for a, r in out]; hol2 = [Vector((a, r, 0)) for a, r in win]
        tris = tessellate_polygon([pts2, hol2]); allp = out + win
        top = [bm.verts.new(P(a, r, 1)) for a, r in allp]; bot = [bm.verts.new(P(a, r, -1)) for a, r in allp]
        for t in tris:
            bm.faces.new((top[t[0]], top[t[1]], top[t[2]])); bm.faces.new((bot[t[2]], bot[t[1]], bot[t[0]]))
        for lo, hi in ((0, len(out)), (len(out), len(allp))):
            for k in range(lo, hi):
                k2 = lo + (k - lo + 1) % (hi - lo); bm.faces.new((top[k], bot[k], bot[k2], top[k2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # кольцо: оболочка с толщиной, кромки закатаны
    n = 72; prof = [(A_RING0, RRI + 0.001), (A_RING0 - 0.001, RR - 0.0015), (A_RING0 + 0.003, RR), (L - 0.003, RR), (L, RR - 0.0015), (L, RRI + 0.0015), (L - 0.003, RRI), (A_RING0 + 0.003, RRI)]
    rings = [[bm.verts.new((r * math.cos(2 * math.pi * k / n), Yb(a), r * math.sin(2 * math.pi * k / n))) for k in range(n)] for a, r in prof]
    for j in range(len(rings)):
        p, q = rings[j], rings[(j + 1) % len(rings)]
        for k in range(n): bm.faces.new((p[k], p[(k + 1) % n], q[(k + 1) % n], q[k]))
    # распорки: плоские планки между соседними перьями внутри кольца
    for i in range(4):
        a0, a1 = math.pi / 2 * i + math.pi / 2, math.pi / 2 * (i + 1) + math.pi / 2; rr = 0.118
        p0 = Vector((math.cos(a0) * rr, 0, math.sin(a0) * rr)); p1 = Vector((math.cos(a1) * rr, 0, math.sin(a1) * rr)); d = (p1 - p0).normalized(); nn = Vector((0, 1, 0)).cross(d).normalized()
        for ac in (1.425,):
            c0 = p0 + Vector((0, Yb(ac), 0)); c1 = p1 + Vector((0, Yb(ac), 0)); w = 0.012; t = 0.003
            vs = [bm.verts.new(c + Vector((0, dy, 0)) + nn * dn) for c in (c0, c1) for dy, dn in ((-w, -t), (w, -t), (w, t), (-w, t))]
            for f in ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)): bm.faces.new([vs[q] for q in f])
    # сварные уголки у корня перьев на конусе (ofab_03: швы вдоль корня)
    return obj('tail', bm, smooth=False, sharp=30)


OBJS = [body(), fuze(), lug(LUGS[0], 'lug_f'), lug(LUGS[1], 'lug_r'), fins()]
for o in OBJS: o.data.update()
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJS)
pts = [o.matrix_world @ v.co for o in OBJS for v in o.data.vertices]
print('ОФАБ: треугольников', tris, 'длина', round(max(p.y for p in pts) - min(p.y for p in pts), 4), 'диаметр', round(max(p.x for p in pts) - min(p.x for p in pts), 4), 'высота с ушками', round(max(p.z for p in pts) - min(p.z for p in pts), 4))
LUG_TOP = [dict(a=a, center_gltf=[0.0, round(RB + 0.030, 4), round(-Yb(a), 4)]) for a in LUGS]
print('УШКИ', json.dumps(LUG_TOP))
out = opt('--out', ''); bl = opt('--blend', '')
if bl: bpy.ops.wm.save_as_mainfile(filepath=bl)
if out: bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True)
