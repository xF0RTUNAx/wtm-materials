# _tris.py - треугольники формы в мировых осях для наложения на фото (без шасси и створок): _снимки/tris.npy. После build.py.
import os, bpy, numpy as np
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_снимки', 'tris.npy'); T = []
skip = ('gear', 'door_', 'brake', 'det_bay', 'bay_', 'port', 'aim', 'det_cock', 'canopy_glass')
for o in bpy.data.scenes['VUL'].objects:
    if o.type != 'MESH' or o.name.startswith(skip): continue
    me = o.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh(); me.calc_loop_triangles(); M = o.matrix_world
    V = np.array([tuple(M @ v.co) for v in me.vertices], dtype=np.float32)
    I = np.array([tuple(t.vertices) for t in me.loop_triangles], dtype=np.int32)
    if len(I): T.append(V[I])
np.save(OUT, np.concatenate(T)); print('треугольников', sum(len(t) for t in T))
