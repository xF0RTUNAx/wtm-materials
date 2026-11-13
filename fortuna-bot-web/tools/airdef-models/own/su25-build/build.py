# Су-25 - свой самолёт игры, ключ e_su25. Свои меши по чертежам и фото Mark (референсы/su25_*). Геометрия - su_geo.py.
# Запуск: S25_STAGE=1…4 Blender -b --factory-startup --python build.py. Окно Blender не открывается.
import sys, os, importlib, math, time
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Су-25'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
import modelkit as mk; importlib.reload(mk)
import su_geo as g; importlib.reload(g)
STAGE = int(os.environ.get('S25_STAGE', '9'))
T0 = time.time()
mk.configure('S25', 0.001, x0=0.0, yc=0.0, rb=1000.0, nseg=64, nose='left')
mk.set_materials([('S25_skin', (0.40, 0.42, 0.44)), ('S25_metal', (0.40, 0.38, 0.35)), ('S25_dark', (0.03, 0.03, 0.03)), ('S25_glass', (0.10, 0.13, 0.15)), ('S25_tyre', (0.03, 0.03, 0.03)),
                  ('S25_cock', (0.11, 0.115, 0.12)), ('S25_radome', (0.30, 0.31, 0.32)), ('S25_duct', (0.40, 0.40, 0.38)), ('S25_belt', (0.16, 0.16, 0.17))])
for m, (rough, metal) in zip(mk.MATS, ((0.5, 0.05), (0.42, 0.5), (0.8, 0.2), (0.0, 0.0), (0.85, 0.0), (0.6, 0.1), (0.5, 0.0), (0.6, 0.0), (0.45, 0.6))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
    if m.name == 'S25_glass':
        pb.inputs['Base Color'].default_value = (0.62, 0.68, 0.72, 1.0); pb.inputs['Alpha'].default_value = 0.16
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
OBJS = g.plane(STAGE)
bpy.context.view_layer.update()
for o in OBJS: print(f'{o.name:22s} {sum(len(p.vertices) - 2 for p in o.data.polygons):7d} тр.')
tot = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJS); print('всего', tot, 'тр., за', round(time.time() - T0, 1), 'с')
pts = [o.matrix_world @ v.co for o in OBJS for v in o.data.vertices]
print('габарит: X', round(min(p.x for p in pts), 3), round(max(p.x for p in pts), 3), 'Y', round(min(p.y for p in pts), 3), round(max(p.y for p in pts), 3), 'Z', round(min(p.z for p in pts), 3), round(max(p.z for p in pts), 3))
print('сцена S25: этап', STAGE)
