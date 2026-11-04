# _collide.py - проверка столкновений по всему ходу подвижных частей GBU-31 и висящих деталей. Запуск после build.py в том же Blender. Итог в <папка>/_maps/collide.json.
import bpy, math, json, os
from mathutils import Matrix, Vector as V
from mathutils.bvhtree import BVHTree
HERE = os.environ.get('G31_OUT') or os.path.dirname(os.path.abspath(__file__))
PJ = json.load(open(os.path.join(HERE, '_maps', 'parts.json')))
bpy.context.view_layer.update()
objs = [o for o in bpy.data.collections['GBU31'].objects if o.type == 'MESH']
tree = lambda o, mw: BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
D = lambda ph: V((math.cos(math.radians(ph)), 0, math.sin(math.radians(ph)))); A_ = lambda ph: V((-math.sin(math.radians(ph)), 0, math.cos(math.radians(ph))))
TW = {o.name: tree(o, o.matrix_world) for o in objs}
res = {}


def sweep(name, poses, others=None):
    o = bpy.data.objects[name]; base = o.matrix_world.copy(); loc = Matrix.Translation(base.to_translation()); hits = []
    for tag, R_ in poses:
        t = tree(o, loc @ R_)
        for n, tr in TW.items():
            if n == name or (others and n not in others): continue
            if t.overlap(tr): hits.append((tag, n))
    res[name] = {'шагов': len(poses), 'пересечений': len(hits), 'с чем': sorted({n for _, n in hits}), 'первые': hits[:4]}
    print(name, res[name])


FR = 15.0
for i, ph in enumerate(PJ['phi']):
    ax = D(ph); sweep(f'fin{i + 1}', [(round(-FR + k * 0.5, 1), Matrix.Rotation(math.radians(-FR + k * 0.5), 4, ax)) for k in range(int(4 * FR) + 1)])
    # руль не должен подниматься выше проушин на всём ходу
    o = bpy.data.objects[f'fin{i + 1}']; loc = Matrix.Translation(o.matrix_world.to_translation()); zmax = max((loc @ Matrix.Rotation(math.radians(s_ * FR), 4, ax) @ v.co).z for v in o.data.vertices for s_ in (-1, 1)); res[f'fin{i + 1}']['верх_на_ходу'] = round(zmax, 4); print(o.name, 'верх на всём ходу', round(zmax, 4), 'проушины', round(PJ['lug_top'], 4)); assert zmax < PJ['lug_top'], 'руль выше проушин'
# висящие детали: связность по пересечениям (корпус с блоками, накладки, винты); подвижные части намеренно с зазором и проверяются отдельно
import bmesh
fixed = [o for o in objs if o.name.startswith('G31_')]; comps = []
for o in objs:
    bm = bmesh.new(); bm.from_mesh(o.data); bm.transform(o.matrix_world); seen = set()
    for f in bm.faces:
        if f.index in seen: continue
        st = [f]; seen.add(f.index); cf = []
        while st:
            g = st.pop(); cf.append(g)
            for e in g.edges:
                for nb in e.link_faces:
                    if nb.index not in seen: seen.add(nb.index); st.append(nb)
        vm = {}; vv = []; ff = []
        for f2 in cf:
            l_ = []
            for v in f2.verts:
                if v.index not in vm: vm[v.index] = len(vv); vv.append(v.co.copy())
                l_.append(vm[v.index])
            ff.append(l_)
        comps.append((o.name, BVHTree.FromPolygons(vv, ff), tuple(round(min(p[i] for p in vv), 3) for i in range(3))))
    bm.free()
root = max(range(len(comps)), key=lambda i: comps[i][0] == 'G31_body'); done = {root}; q = [root]
while q:
    i = q.pop()
    for j in range(len(comps)):
        if j not in done and comps[i][1].overlap(comps[j][1]): done.add(j); q.append(j)
loose = [(comps[j][0], comps[j][2]) for j in range(len(comps)) if j not in done]
fix_loose = [x for x in loose if x[0].startswith('G31_')]; mov = {}
for n, _ in loose: mov[n] = mov.get(n, 0) + 1
res['деталей'] = len(comps); res['висят среди неподвижных'] = fix_loose; res['не касаются (подвижные: так и задумано)'] = {k: v for k, v in mov.items() if not k.startswith('G31_')}
print('деталей', len(comps), 'висят среди неподвижных', fix_loose, 'подвижные без касания', res['не касаются (подвижные: так и задумано)'])
json.dump(res, open(os.path.join(HERE, '_maps', 'collide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('_collide.py: готово')
