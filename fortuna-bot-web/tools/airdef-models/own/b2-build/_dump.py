# _dump.py - вершины модели (мировые координаты) в _снимки/verts.npy для наложений на фото
import bpy, numpy as np, os
sc = bpy.data.scenes['B2']; pts = []
for o in sc.objects:
    if o.type != 'MESH' or o.name.startswith(('B2_glass',)): continue
    M = o.matrix_world; pts += [tuple(M @ v.co) for v in o.data.vertices]
np.save(os.path.join(os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '.', '_снимки/verts.npy'), np.array(pts, np.float32)); print('вершин', len(pts))
