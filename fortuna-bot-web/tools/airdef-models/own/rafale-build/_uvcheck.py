# _uvcheck.py - настоящая проверка развёртки: сколько пикселей занято гранями разных частей (наложения). После build.py.
import bpy, sys, os, numpy as np
sys.path.insert(0, os.getcwd()); import uv_rafale
sc = bpy.data.scenes['RF']; info = uv_rafale.run(sc, print); print('АТЛАС', info['atlas_m'])
CL = {}; S = 2048; own = np.full((S, S), -1, np.int32); cnt = np.zeros((S, S), np.int16); names = []; pairs = {}
for o in sc.objects:
    if o.type != 'MESH' or o.name in ('canopy_glass', 'screen_glass'): continue
    me = o.data; me.calc_loop_triangles(); uv = me.uv_layers.active.data; oid = len(names); names.append(o.name)
    for t in me.loop_triangles:
        P = np.array([uv[l].uv[:] for l in t.loops]) * S; x0, y0 = np.floor(P.min(0)).astype(int); x1, y1 = np.ceil(P.max(0)).astype(int); x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, S - 1), min(y1, S - 1)
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + .5, np.arange(y0, y1 + 1) + .5)
        d = (P[1, 1] - P[2, 1]) * (P[0, 0] - P[2, 0]) + (P[2, 0] - P[1, 0]) * (P[0, 1] - P[2, 1])
        if abs(d) < 1e-9: continue
        a = ((P[1, 1] - P[2, 1]) * (xs - P[2, 0]) + (P[2, 0] - P[1, 0]) * (ys - P[2, 1])) / d; b = ((P[2, 1] - P[0, 1]) * (xs - P[2, 0]) + (P[0, 0] - P[2, 0]) * (ys - P[2, 1])) / d
        ins = (a > 0) & (b > 0) & (a + b < 1)
        yi, xi = ys[ins].astype(int), xs[ins].astype(int)
        cur = own[yi, xi]; hit = (cur >= 0) & (cur != oid * 100000 + t.polygon_index // 1)
        cnt[yi[hit], xi[hit]] += 1
        if hit.any() and o.name == 'RF_skin':
            c = o.matrix_world @ me.polygons[t.polygon_index].center; n = me.polygons[t.polygon_index].normal; k = (round((7.98 - c.y) * 2) / 2, round(abs(c.x) * 2) / 2, round(c.z * 2) / 2, uv_rafale.classify(n)); CL[k] = CL.get(k, 0) + int(hit.sum())
        for c_ in set((cur[hit] // 100000).tolist()):
            k = tuple(sorted((names[c_], o.name))); pairs[k] = pairs.get(k, 0) + 1
        own[yi, xi] = oid * 100000 + t.polygon_index
print('НАЛОЖЕНИЯ пикселей', int((cnt > 0).sum()), 'из занятых', int((own >= 0).sum()))
print('ПАРЫ', sorted(pairs.items(), key=lambda kv: -kv[1])[:12])
print('МЕСТА', sorted(CL.items(), key=lambda kv: -kv[1])[:22])
