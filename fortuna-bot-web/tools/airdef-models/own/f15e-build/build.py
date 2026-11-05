# F-15E Strike Eagle - первый свой самолёт игры, ключ e_f15e. Свои меши по фото Mark (референсы/01-03, 10) и рендерам чужой модели 04-09 (только образец формы, ничего не копируется). Геометрия - f15_geo.py.
# Запуск: F15_STAGE=1…4 (1 обшивка, 2 оперение, рули, сопла, воздухозаборники, 3 кабина, фонарь, щиток, пилоны, 4 шасси, створки), F15_GEAR=down|up, Blender -b --factory-startup --python build.py
#
# СПИСОК ДЕТАЛЕЙ: обшивка единым замкнутым телом (нос, спина, короб, гондолы, балки, конформные баки, крылья), киль и руль, стабилизатор, закрылки, элероны, воздухозаборник поворотный полый,
# лицо двигателя, сопла со створками и тягами, кабина, два кресла, фонарь, козырёк, щиток с цилиндром, пилоны и балки, шасси, створки. Оружия, баков, контейнеров нет: их вешает игра.
import sys, os, importlib, math, time
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/F-15E'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
from mathutils import Matrix, Vector
import modelkit as mk; importlib.reload(mk)
import f15_geo as g; importlib.reload(g)
import f15_detail as d; importlib.reload(d)

STAGE = int(os.environ.get('F15_STAGE', '9'))
GEAR = os.environ.get('F15_GEAR', 'down')
T0 = time.time()
mk.configure('F15E', 0.001, x0=0.0, yc=0.0, rb=1000.0, nseg=64, nose='left')
mk.set_materials([('F15_skin', (0.42, 0.45, 0.48)), ('F15_metal', (0.40, 0.38, 0.35)), ('F15_dark', (0.03, 0.03, 0.03)), ('F15_glass', (0.10, 0.13, 0.15)), ('F15_tyre', (0.03, 0.03, 0.03)), ('F15_cock', (0.11, 0.115, 0.12)), ('F15_strap', (0.42, 0.36, 0.26)), ('F15_screen', (0.012, 0.035, 0.028)), ('F15_belt', (0.28, 0.26, 0.20)), ('F15_handle', (0.62, 0.50, 0.05)), ('F15_seam', (0.10, 0.11, 0.12))])
for m, (rough, metal) in zip(mk.MATS, ((0.5, 0.05), (0.42, 0.5), (0.8, 0.2), (0.0, 0.0), (0.85, 0.0), (0.6, 0.1), (0.75, 0.0), (0.2, 0.0), (0.8, 0.0), (0.4, 0.1), (0.8, 0.0))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
    if m.name == 'F15_glass':
        pb.inputs['Base Color'].default_value = (0.62, 0.68, 0.72, 1.0); pb.inputs['Alpha'].default_value = 0.16
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
OBJS = g.plane(STAGE, carve=os.environ.get('F15_CARVE', '1') == '1')
bpy.context.view_layer.update()
for o in OBJS: print(f'{o.name:22s} {sum(len(p.vertices) - 2 for p in o.data.polygons):7d} тр.')
tot = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJS); print('всего', tot, 'тр., за', round(time.time() - T0, 1), 'с')
pts = [o.matrix_world @ v.co for o in OBJS for v in o.data.vertices]
print('габарит: X', round(max(p.x for p in pts), 3), 'Y', round(min(p.y for p in pts), 3), round(max(p.y for p in pts), 3), 'Z', round(min(p.z for p in pts), 3), round(max(p.z for p in pts), 3), 'высота', round(max(p.z for p in pts) - min(p.z for p in pts), 3))
print('сцена F15E: этап', STAGE)
