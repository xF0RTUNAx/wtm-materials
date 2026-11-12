# F-5E Tiger II - свой самолёт игры, ключ e_f5. Свои меши по фото Mark (референсы/f5e_*). Геометрия - f5_geo.py, детали - f5_detail.py.
# Запуск: F5_STAGE=1…4 Blender -b --factory-startup --python build.py. Окно Blender не открывается.
import sys, os, importlib, math, time
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/F-5E Tiger II'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
import modelkit as mk; importlib.reload(mk)
import f5_geo as g; importlib.reload(g)
STAGE = int(os.environ.get('F5_STAGE', '9'))
T0 = time.time()
mk.configure('F5', 0.001, x0=0.0, yc=0.0, rb=1000.0, nseg=64, nose='left')
mk.set_materials([('F5_skin', (0.40, 0.42, 0.44)), ('F5_metal', (0.40, 0.38, 0.35)), ('F5_dark', (0.03, 0.03, 0.03)), ('F5_glass', (0.10, 0.13, 0.15)), ('F5_tyre', (0.03, 0.03, 0.03)),
                  ('F5_cock', (0.11, 0.115, 0.12)), ('F5_radome', (0.30, 0.31, 0.32)), ('F5_duct', (0.40, 0.40, 0.38)), ('F5_belt', (0.16, 0.16, 0.17))])
for m, (rough, metal) in zip(mk.MATS, ((0.5, 0.05), (0.42, 0.5), (0.8, 0.2), (0.0, 0.0), (0.85, 0.0), (0.6, 0.1), (0.5, 0.0), (0.6, 0.0), (0.45, 0.6))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
    if m.name == 'F5_glass':
        pb.inputs['Base Color'].default_value = (0.62, 0.68, 0.72, 1.0); pb.inputs['Alpha'].default_value = 0.16
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
OBJS = g.plane(STAGE)
bpy.context.view_layer.update()
for o in OBJS: print(f'{o.name:22s} {sum(len(p.vertices) - 2 for p in o.data.polygons):7d} тр.')
tot = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJS); print('всего', tot, 'тр., за', round(time.time() - T0, 1), 'с')
pts = [o.matrix_world @ v.co for o in OBJS for v in o.data.vertices]
print('габарит: X', round(min(p.x for p in pts), 3), round(max(p.x for p in pts), 3), 'Y', round(min(p.y for p in pts), 3), round(max(p.y for p in pts), 3), 'Z', round(min(p.z for p in pts), 3), round(max(p.z for p in pts), 3))
print('сцена F5: этап', STAGE)
