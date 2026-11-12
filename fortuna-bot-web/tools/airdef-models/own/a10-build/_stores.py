# _stores.py - подвески игры на точках: Maverick и Mk 82 (свои модели из tools/airdef-models/own) не задевают обтекатели стоек, шасси, пушку, соседей; на месте и при сбросе вниз на 3 м. A10_STAGE=4.
import bpy, os, json
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import a10_geo as g
OWN = '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/'
sc = bpy.data.scenes["A10"]; bpy.context.view_layer.update()
base = {o.name: o for o in sc.objects if o.type == 'MESH'}
def tree(o, mw): return BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
BT = {n: tree(o, o.matrix_world) for n, o in base.items() if not n.startswith(('det_hard', 'pylon_'))}
def load(f):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=OWN + f); new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    bpy.context.view_layer.update(); P = [o.matrix_world @ v.co for o in new for v in o.data.vertices]
    mn = Vector((min(p.x for p in P), min(p.y for p in P), min(p.z for p in P))); mx = Vector((max(p.x for p in P), max(p.y for p in P), max(p.z for p in P)))
    return new, mn, mx
res = {}
for f in ('agm65b.glb', 'mk82.glb'):
    new, mn, mx = load(f); cen = (mn + mx) / 2; print(f, 'размер', [round(v, 2) for v in (mx - mn)])
    trees = {}
    for nm, pt in g.PYLON_PTS.items():
        if nm.startswith('pylon_f'): continue
        off = Vector((pt.x - cen.x, pt.y - cen.y, pt.z - 0.012 - mx.z))
        for dz in (0.0, -0.1, -0.25, -0.5, -1.0, -1.5, -2.0, -3.0):
            M = Matrix.Translation(off + Vector((0, 0, dz))); ts = [tree(o, M @ o.matrix_world) for o in new]
            if dz == 0.0: trees[nm] = ts
            for bn, bt in BT.items():
                if any(t.overlap(bt) for t in ts): res.setdefault(f'{f} {nm}', {}).setdefault(bn, []).append(dz)
        low = pt.z - 0.012 - (mx.z - mn.z)
        if nm.endswith('_r'): print(f'  {nm}: низ подвески z = {low:.3f}, до земли {low - g.GROUND_Y:.2f} м')
    names = list(trees)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            if any(a.overlap(b) for a in trees[names[i]] for b in trees[names[j]]): res.setdefault(f'{f} {names[i]}', {})[names[j]] = ['сосед']
    for o in new: bpy.data.objects.remove(o)
print('ПОДВЕСКИ касаний:', len(res))
for k, v in res.items(): print('  ', k, v)
json.dump(res, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '_live/stores.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
