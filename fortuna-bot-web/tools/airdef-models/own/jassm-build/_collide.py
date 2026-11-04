# _collide.py - раскрытие JASSM: wing1, wing2 от сложенных до open_deg вокруг вертикальной оси, fin до FIN_OPEN вокруг оси шарнира, шаг 1°, BVH по треугольникам. Плюс: сложенные части не выше упоров. Контроль метода: корпус × наплывы должны касаться.
import bpy, math, json, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import jsm_geo as g
sc = bpy.data.scenes['JASSM']; objs = [o for o in sc.objects if o.type == 'MESH']
bpy.context.view_layer.update()


def tree(o, mw): return BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])


res = {}
def sweep(name, axis, deg, partner_at=None):
    o = bpy.data.objects[name]; b = o.matrix_world.copy(); T = b.translation; hits = {}
    others = [(q.name, tree(q, q.matrix_world)) for q in objs if q is not o]
    st = 1 if deg > 0 else -1
    for d in range(0, int(deg) + st, st):
        t = tree(o, Matrix.Translation(T) @ Matrix.Rotation(math.radians(d), 4, axis) @ Matrix.Translation(-T) @ b)
        for n, tt in others:
            if t.overlap(tt): hits.setdefault(n, []).append(d)
    res[name] = {'раскрытие': deg, 'касаний': sum(len(v) for v in hits.values()), 'с чем': {n: (v[0], v[-1]) for n, v in hits.items()}}
for n, D in g.WING_PIVOTS.items(): sweep(n, Vector((0, 0, 1)), D['open_deg'])
sweep('fin', g.FIN_PIVOT['axis'], g.FIN_PIVOT['open_deg'])
# оба крыла вместе: одновременно раскрываются
w1 = bpy.data.objects['wing1']; w2 = bpy.data.objects['wing2']; c = 0
for d in range(0, int(g.WING_OPEN) + 1):
    R1 = Matrix.Translation(w1.matrix_world.translation) @ Matrix.Rotation(math.radians(d), 4, 'Z') @ Matrix.Translation(-w1.matrix_world.translation) @ w1.matrix_world
    R2 = Matrix.Translation(w2.matrix_world.translation) @ Matrix.Rotation(math.radians(-d), 4, 'Z') @ Matrix.Translation(-w2.matrix_world.translation) @ w2.matrix_world
    if tree(w1, R1).overlap(tree(w2, R2)): c += 1
res['крылья друг с другом'] = c
for n, v in res.items(): print(n, v, flush=True)
zl = max((bpy.data.objects['JSM_lugs'].matrix_world @ v.co).z for v in bpy.data.objects['JSM_lugs'].data.vertices)
for n in ('wing1', 'wing2', 'fin'): print(n, 'верх в файле z', round(max((bpy.data.objects[n].matrix_world @ v.co).z for v in bpy.data.objects[n].data.vertices), 3), '| верх упоров', round(zl, 3))
print('КОНТРОЛЬ корпус×наплывы:', len(tree(bpy.data.objects['JSM_body'], Matrix()).overlap(tree(bpy.data.objects['JSM_strakes'], Matrix()))))
pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]; print('габарит Y', round(min(p.y for p in pts), 3), round(max(p.y for p in pts), 3), 'X', round(max(p.x for p in pts), 3), 'Z', round(min(p.z for p in pts), 3), round(max(p.z for p in pts), 3))
out = os.environ.get('JSM_OUT')
if out: json.dump(res, open(os.path.join(out, '_live', 'collide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
