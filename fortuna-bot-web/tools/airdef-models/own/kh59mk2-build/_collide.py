# _collide.py - проверка хода Х-59МК2 → _live/collide.json
#   рули fin1…4: от −15° до +15° (81 шаг; 1 и 3 против 2 и 4, как при крене, и все в одну сторону) - пересечения с крылом и между собой;
#   с корпусом рули сидят корнем в обшивке (утоплены на 4 мм по замыслу), поэтому для корпуса меряется зазор под корнем: корень не должен отходить от обшивки;
#   крыло: поворот от сложенного (0°) до раскрытого (−90°), 91 шаг - пересечения с корпусом, бугелями, рулями.
#   Blender -b --factory-startup --python _collide.py
import bpy, math, json, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
_p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
def tree(o): return BVHTree.FromPolygons([o.matrix_world @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
FINS_ = [n for n in MOVE if n.startswith('fin')]
pose(0.0, 0.0)
def tree_many(objs):
    vs, fs = [], []
    for o in objs:
        k = len(vs); vs += [o.matrix_world @ v.co for v in o.data.vertices]; fs += [tuple(k + i for i in p.vertices) for p in o.data.polygons]
    return BVHTree.FromPolygons(vs, fs)
body_t = tree_many([bpy.data.objects['body'], bpy.data.objects['boots']])
# корневые вершины рулей: в покое ближе 8 мм к обшивке
ROOT = {}
for n in FINS_:
    o = bpy.data.objects[n]; ROOT[n] = [v.index for v in o.data.vertices if body_t.find_nearest(o.matrix_world @ v.co)[3] < 0.008]
def root_gap(n):
    """наибольший выход корневой вершины наружу из обшивки, м (минус - утоплена)"""
    o = bpy.data.objects[n]; worst = -1.0
    for i in ROOT[n]:
        p = o.matrix_world @ o.data.vertices[i].co; hit, nrm, _, d = body_t.find_nearest(p)
        s = d if (p - hit).dot(nrm) > 0 else -d; worst = max(worst, s)
    return worst
hits = {}; gaps = {}; gaps0 = {n: round(root_gap(n) * 1000, 2) for n in FINS_}; N = 81
for mode in ('крен', 'вместе'):
    for i in range(N):
        k = -1 + 2 * i / (N - 1)
        pose(k, 0.0)
        if mode == 'вместе':
            for n in FINS_:
                o = bpy.data.objects[n]; p = BASEM[n].translation.copy(); W = MOVE[n]
                o.matrix_world = Matrix.Translation(p) @ Matrix.Rotation(math.radians(15.0 * k), 4, W['axis']) @ Matrix.Translation(-p) @ BASEM[n]
            bpy.context.view_layer.update()
        Tm = {n: tree(bpy.data.objects[n]) for n in FINS_}; wt = tree(bpy.data.objects['wing'])
        for n in FINS_:
            for nm, tt in [('wing', wt)] + [(m, Tm[m]) for m in FINS_ if m > n]:
                if Tm[n].overlap(tt): hits.setdefault(f'{mode}: {n} × {nm}', []).append(round(15 * k, 2))
            g = root_gap(n); gaps[n] = max(gaps.get(n, -1.0), g)
pose(0.0, 0.0)
# крыло: сложено → раскрыто
fixed = [(q.name, tree(q)) for q in COL.objects if q.type == 'MESH' and q.name != 'wing']
for i in range(91):
    kw = i / 90; pose(0.0, kw); wt = tree(bpy.data.objects['wing'])
    for nm, tt in fixed:
        if wt.overlap(tt): hits.setdefault(f'крыло × {nm}', []).append(round(-90 * kw, 1))
pose(0.0, 0.0)
res = {'шагов_рули': N, 'шагов_крыло': 91, 'ход': {n: W['lim'] for n, W in MOVE.items()}, 'пересечений': {k: (v[0], v[-1], len(v)) for k, v in hits.items()},
       'корень_руля_наружу_мм_в_нейтрали': gaps0, 'корень_руля_наружу_мм_при_отклонении': {n: round(g * 1000, 2) for n, g in gaps.items()}}
print('ПЕРЕСЕЧЕНИЯ', res['пересечений'], flush=True); print('КОРЕНЬ НАРУЖУ мм: нейтраль', gaps0, 'отклонение', res['корень_руля_наружу_мм_при_отклонении'], flush=True)
os.makedirs(os.path.join(HERE, '_live'), exist_ok=True)
json.dump(res, open(os.path.join(HERE, '_live', 'collide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
