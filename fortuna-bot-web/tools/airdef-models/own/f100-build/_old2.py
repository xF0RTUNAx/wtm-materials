# _old2.py - план прежней модели числом: кромки крыла и стабилизатора по размаху, киль. Только для сверки пропорций.
import bpy, math
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='/Users/mark./wtm-materials/fortuna-bot-web/games/airdef/models/e_f100.glb')
P = [o.matrix_world @ v.co for o in bpy.context.scene.objects if o.type == 'MESH' for v in o.data.vertices]
# симметрия: ось самолёта - прямая, относительно которой зеркальны законцовки. Ищем угол, при котором размах по x' симметричен и максимален по длине
best = None
for k in range(-200, 201):
    th = math.radians(k * 0.05); c, s = math.cos(th), math.sin(th)
    xs = [p.x * c - p.y * s for p in P]; ys = [p.x * s + p.y * c for p in P]
    L = max(ys) - min(ys)
    if best is None or L > best[0]: best = (L, th)
L, th = best; c, s = math.cos(th), math.sin(th); print('поворот', round(math.degrees(th), 2), 'длина', round(L, 3))
Q = [Vector((p.x * c - p.y * s, p.x * s + p.y * c, p.z)) for p in P]
y1 = max(q.y for q in Q); A = lambda q: y1 - q.y
print('размах', round(min(q.x for q in Q), 3), round(max(q.x for q in Q), 3), 'z', round(min(q.z for q in Q), 3), round(max(q.z for q in Q), 3))
for x0 in (0.8, 1.2, 1.6, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.4, 5.7):
    s_ = [q for q in Q if abs(abs(q.x) - x0) < 0.12 and -1.3 < q.z < 0.6 and A(q) < 11.6]
    t_ = [q for q in Q if abs(abs(q.x) - x0) < 0.12 and A(q) > 11.0]
    if s_: print('x', x0, 'крыло a', round(min(A(q) for q in s_), 2), round(max(A(q) for q in s_), 2), 'z', round(sum(q.z for q in s_) / len(s_), 2), '| хвост a', (round(min(A(q) for q in t_), 2), round(max(A(q) for q in t_), 2), round(sum(q.z for q in t_) / len(t_), 2)) if t_ else '-')
for a0 in (0.0, 0.3, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 13.3):
    s_ = [q for q in Q if abs(A(q) - a0) < 0.15 and abs(q.x) < 1.2]
    if s_: print('a', a0, 'z', round(min(q.z for q in s_), 2), round(max(q.z for q in s_), 2), 'полуширина', round(max(abs(q.x) for q in s_ if q.z > min(q_.z for q_ in s_) + 0.25) if len(s_) > 3 else 0, 2))
