# _gaps.py - проверка «ничего не висит в воздухе» (Mark 2026-11-05). F4_STAGE=4, после build.py. Два отчёта:
# 1) связность: каждый кусок сетки (острова объектов) должен касаться соседа и через цепочку доходить до обшивки; кто не дошёл - висит.
# 2) стыки подвижных частей: зазор вдоль кромки примыкания до неподвижного тела, допуск 3 см (рецепт), и доля кромки, что превышает.
import bpy, bmesh, json, math, os, time
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
T0 = time.time(); sc = bpy.data.scenes['F4']; vl = bpy.context.view_layer; vl.update()
TOUCH = 0.008                                                   # ближе - считается касанием
SKIP = {'canopy_glass'}
comps = []                                                      # dict(obj, verts Nx3, tree, mn, mx)
for o in sc.objects:
    if o.type != 'MESH' or o.name in SKIP: continue
    M = o.matrix_world; bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    seen = set()
    for v0 in bm.verts:
        if v0.index in seen: continue
        st = [v0]; seen.add(v0.index); ids = []
        while st:
            v = st.pop(); ids.append(v.index)
            for e in v.link_edges:
                w = e.other_vert(v)
                if w.index not in seen: seen.add(w.index); st.append(w)
        s_ids = set(ids); fs = {f.index for i in ids for f in bm.verts[i].link_faces}
        remap = {i: k for k, i in enumerate(ids)}; P = [M @ bm.verts[i].co for i in ids]
        tr = BVHTree.FromPolygons(P, [[remap[v.index] for v in bm.faces[f].verts] for f in fs]) if fs else None
        A = np.array([p[:] for p in P]); comps.append(dict(obj=o.name, P=P, A=A, tree=tr, mn=A.min(0), mx=A.max(0)))
    bm.free()
print('кусков сетки', len(comps), 'за', round(time.time() - T0, 1), 'с', flush=True)
n = len(comps); MN = np.array([c['mn'] for c in comps]); MX = np.array([c['mx'] for c in comps]); par = list(range(n))


def find(i):
    while par[i] != i: par[i] = par[par[i]]; i = par[i]
    return i


def touching(a, b):
    """Касание: пересечение деревьев или вершина одного в TOUCH от поверхности другого."""
    if a['tree'] is None or b['tree'] is None: return False
    if a['tree'].overlap(b['tree']): return True
    for s, l in ((a, b), (b, a)):                               # в обе стороны: крупная грань маленькой детали может не иметь вершин рядом
        step = max(1, len(s['P']) // 400)
        for p in s['P'][::step]:
            h = l['tree'].find_nearest(p, TOUCH)
            if h[0] is not None: return True
    return False


order = np.argsort([-len(c['P']) for c in comps])
for ii in range(n):
    i = int(order[ii]); hit = np.nonzero(np.all(MN <= MX[i] + TOUCH, 1) & np.all(MX >= MN[i] - TOUCH, 1))[0]
    for j in hit:
        j = int(j)
        if j == i or find(i) == find(j): continue
        if touching(comps[i], comps[j]): par[find(i)] = find(j)
print('связность за', round(time.time() - T0, 1), 'с', flush=True)
root = next(i for i, c in enumerate(comps) if c['obj'] == 'F4_skin'); R0 = find(root)
free = {}
for i, c in enumerate(comps):
    if find(i) != R0: free.setdefault(find(i), []).append(i)
print('групп, не связанных с обшивкой:', len(free))
sky = []
for gr, ids in free.items():
    A = np.concatenate([comps[i]['A'] for i in ids]); objs = sorted({comps[i]['obj'] for i in ids}); g = 9.0
    # расстояние группы до основной массы
    rest = [c for i, c in enumerate(comps) if find(i) == R0 and c['tree'] is not None]
    step = max(1, len(A) // 300); best = 9.0
    bigs = sorted(rest, key=lambda c: -len(c['P']))[:40]
    for p in A[::step]:
        for c in bigs:
            h = c['tree'].find_nearest(Vector(p))
            if h[0] is not None and h[3] < best: best = h[3]
    sky.append((best, objs, len(ids), [round(float(v), 3) for v in A.mean(0)]))
for best, objs, k, cen in sorted(sky, key=lambda r: -r[0]):
    print(f'  {"щель части" if best <= 0.03 else "ВИСИТ"}: зазор {best * 100:6.1f} см, кусков {k:3d}, объекты {objs}, середина {cen}')
out = os.environ.get('F4_GAPS_J')
if out: json.dump(dict(висит=[dict(зазор_см=round(b * 100, 1), объекты=o, кусков=k, середина=c) for b, o, k, c in sky]), open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('готово')
