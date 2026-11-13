# Су-17М4 - свой самолёт игры, ключ e_su17. Свои меши по картинкам Mark (референсы/su17_01...06). Геометрия - su17_geo.py.
# Запуск: SU17_STAGE=1…, SU17_SWEEP=16…72.5 (стреловидность для проверки; в файле 26), Blender -b --factory-startup --python build.py. Окно Blender не открывается.
import sys, os, importlib, math, time
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Су-17М4'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
from mathutils import Matrix, Vector
import modelkit as mk; importlib.reload(mk)
import su17_base as fb; importlib.reload(fb)
import su17_geo as g; importlib.reload(g)

STAGE = int(os.environ.get('SU17_STAGE', '9'))
T0 = time.time()
mk.configure('SU17', 0.001, x0=0.0, yc=0.0, rb=1000.0, nseg=64, nose='left')
mk.set_materials([('SU17_skin', (0.42, 0.45, 0.48)), ('SU17_metal', (0.40, 0.38, 0.35)), ('SU17_dark', (0.03, 0.03, 0.03)), ('SU17_glass', (0.10, 0.13, 0.15)), ('SU17_tyre', (0.03, 0.03, 0.03)), ('SU17_cock', (0.11, 0.115, 0.12)), ('SU17_strap', (0.42, 0.36, 0.26)), ('SU17_screen', (0.012, 0.035, 0.028)), ('SU17_belt', (0.28, 0.26, 0.20)), ('SU17_handle', (0.62, 0.50, 0.05)), ('SU17_seam', (0.10, 0.11, 0.12)), ('SU17_duct', (0.40, 0.38, 0.32))])
for m, (rough, metal) in zip(mk.MATS, ((0.5, 0.05), (0.42, 0.5), (0.8, 0.2), (0.0, 0.0), (0.85, 0.0), (0.6, 0.1), (0.75, 0.0), (0.2, 0.0), (0.8, 0.0), (0.4, 0.1), (0.8, 0.0), (0.6, 0.0))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
    if m.name == 'SU17_glass':
        pb.inputs['Base Color'].default_value = (0.62, 0.68, 0.72, 1.0); pb.inputs['Alpha'].default_value = 0.16
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
OBJS = g.plane(STAGE)
bpy.context.view_layer.update()
for o in OBJS: print(f'{o.name:22s} {sum(len(p.vertices) - 2 for p in o.data.polygons):7d} тр.')
tot = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJS); print('всего', tot, 'тр., за', round(time.time() - T0, 1), 'с')
pts = [o.matrix_world @ v.co for o in OBJS for v in o.data.vertices]
print('габарит: X', round(max(p.x for p in pts), 3), 'Y', round(min(p.y for p in pts), 3), round(max(p.y for p in pts), 3), 'Z', round(min(p.z for p in pts), 3), round(max(p.z for p in pts), 3), 'высота', round(max(p.z for p in pts) - min(p.z for p in pts), 3))
print('сцена SU17: этап', STAGE)
