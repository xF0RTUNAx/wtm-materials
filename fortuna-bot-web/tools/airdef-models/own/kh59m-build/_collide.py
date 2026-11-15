# _collide.py - проверка хода: носовые рули can1…4 и элероны ail1…4 от −15° до +15° (в пределах MOVE lim) (81 шаг, рули и элероны вместе, элероны попарно против - как при крене,
#   и отдельно все в одну сторону); пересечения с корпусом, крыльями и между собой. Blender -b --factory-startup --python _collide.py  → _live/collide.json
import bpy, math, json, os
from mathutils import Matrix
from mathutils.bvhtree import BVHTree
_p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
objs = [o for o in COL.objects if o.type == 'MESH']
MOV = list(MOVE.keys())
def tree(o):                                                              # у рулей без вала: он вращается в своём гнезде ложемента
    sk = {i for i, m in enumerate(o.data.materials) if m and m.name.startswith('X59_steel')} if o.name.startswith('can') else set()
    return BVHTree.FromPolygons([o.matrix_world @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons if p.material_index not in sk])
pose(0.0, 0.0); fixed = [(q.name, tree(q)) for q in objs if q.name not in MOV]
hits = {}; N = 81
for mode in ('крен', 'вместе'):
    for i in range(N):
        k = -1 + 2 * i / (N - 1)
        pose(k, k if mode == 'крен' else 0.0)
        if mode == 'вместе':
            for n in [m for m in MOV if m.startswith('ail')]:
                o = bpy.data.objects[n]; p = BASEM[n].translation.copy(); W = MOVE[n]; ang = min(max(15.0 * k, W['lim'][0]), W['lim'][1])
                o.matrix_world = Matrix.Translation(p) @ Matrix.Rotation(math.radians(ang), 4, W['axis']) @ Matrix.Translation(-p) @ BASEM[n]
            bpy.context.view_layer.update()
        Tm = {n: tree(bpy.data.objects[n]) for n in MOV}
        for n in MOV:
            for nm, tt in fixed + [(m, Tm[m]) for m in MOV if m > n]:
                if Tm[n].overlap(tt): hits.setdefault(f'{mode}: {n} × {nm}', []).append(round(15 * k, 2))
pose(0.0, 0.0)
res = {'шагов': N, 'ход': {n: W['lim'] for n, W in MOVE.items()}, 'пересечений': {k: (v[0], v[-1], len(v)) for k, v in hits.items()}}
print('ПЕРЕСЕЧЕНИЯ', res['пересечений'], flush=True)
os.makedirs(os.path.join(HERE, '_live'), exist_ok=True)
json.dump(res, open(os.path.join(HERE, '_live', 'collide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# складывание носовых рулей (стартовая конфигурация): kf 0…1, рули против корпуса, крыльев и друг друга
hf = {}
for i in range(21):
    kf = i / 20; pose(0.0, 0.0, kf); Tm = {n: tree(bpy.data.objects[n]) for n in MOV if n.startswith('can')}
    for n in Tm:
        for nm, tt in fixed + [(m, Tm[m]) for m in Tm if m > n]:
            if nm == 'booster': continue
            if Tm[n].overlap(tt): hf.setdefault(f'складывание: {n} × {nm}', []).append(kf)
pose(0.0, 0.0)
res['складывание'] = {k: (v[0], v[-1], len(v)) for k, v in hf.items()}
print('СКЛАДЫВАНИЕ', res['складывание'], flush=True)
json.dump(res, open(os.path.join(HERE, '_live', 'collide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
