# F-4E Phantom II - свой самолёт игры, ключ e_f4. Свои меши по фото Mark (референсы/f4_01...08). Геометрия - f4_geo.py.
# Запуск: F4_STAGE=1…4, Blender -b --factory-startup --python build.py. Окно Blender не открывается.
#
# Что на каком фото: 01 - F-4E сверху-спереди (главное по облику и камуфляжу); 02 - F-4C на земле спереди-сбоку (камуфляж, шасси; нос другой); 03 - F-4D строго сбоку, фонари открыты (профиль, кроме носа);
# 04 - британский снизу (раскладка низа); 05 - F-4F снизу-сзади на форсаже (сопла, щитки, гак); 06 - греческий F-4E сзади-сбоку (сопло, конус, стабилизатор, нос с пушкой); 07 - флотский сбоку (силуэт); 08 - рендер (только форма).
#
# СПИСОК ДЕТАЛЕЙ: обшивка единым телом (нос, обтекатель пушки, кабины, гондолы с заборниками и пластинами, хвостовая балка, крыло с уступом и V внешних консолей) - сделано;
# киль, руль, цельноповоротный стабилизатор, два сопла с лепестками, отклоняемые носки в две секции, закрылки, элероны, интерцепторы, тормозные щитки, козырёк, два фонаря - сделано (этап 3);
# кресла и приборы, рампы в заборниках, гак, пилоны (2 на крыло), ниши ракет под фюзеляжем, шасси и створки, антенны, швы и лючки - следующие шаги.
# Оружия, баков, контейнеров нет: их вешает игра.
import sys, os, importlib, math, time
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/F-4 Phantom II'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
from mathutils import Matrix, Vector
import modelkit as mk; importlib.reload(mk)
import f4_base as fb; importlib.reload(fb)
import f4_geo as g; importlib.reload(g)
import f4_detail as d; importlib.reload(d)

STAGE = int(os.environ.get('F4_STAGE', '9'))
T0 = time.time()
mk.configure('F4', 0.001, x0=0.0, yc=0.0, rb=1000.0, nseg=64, nose='left')
mk.set_materials([('F4_skin', (0.42, 0.45, 0.48)), ('F4_metal', (0.40, 0.38, 0.35)), ('F4_dark', (0.03, 0.03, 0.03)), ('F4_glass', (0.10, 0.13, 0.15)), ('F4_tyre', (0.03, 0.03, 0.03)), ('F4_cock', (0.11, 0.115, 0.12)), ('F4_strap', (0.42, 0.36, 0.26)), ('F4_screen', (0.012, 0.035, 0.028)), ('F4_belt', (0.28, 0.26, 0.20)), ('F4_handle', (0.62, 0.50, 0.05)), ('F4_seam', (0.10, 0.11, 0.12)), ('F4_duct', (0.40, 0.38, 0.32))])
for m, (rough, metal) in zip(mk.MATS, ((0.5, 0.05), (0.42, 0.5), (0.8, 0.2), (0.0, 0.0), (0.85, 0.0), (0.6, 0.1), (0.75, 0.0), (0.2, 0.0), (0.8, 0.0), (0.4, 0.1), (0.8, 0.0), (0.6, 0.0))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
    if m.name == 'F4_glass':
        pb.inputs['Base Color'].default_value = (0.62, 0.68, 0.72, 1.0); pb.inputs['Alpha'].default_value = 0.16
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
OBJS = g.plane(STAGE, carve=os.environ.get('F4_CARVE', '1') == '1')
bpy.context.view_layer.update()
for o in OBJS: print(f'{o.name:22s} {sum(len(p.vertices) - 2 for p in o.data.polygons):7d} тр.')
tot = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJS); print('всего', tot, 'тр., за', round(time.time() - T0, 1), 'с')
pts = [o.matrix_world @ v.co for o in OBJS for v in o.data.vertices]
print('габарит: X', round(max(p.x for p in pts), 3), 'Y', round(min(p.y for p in pts), 3), round(max(p.y for p in pts), 3), 'Z', round(min(p.z for p in pts), 3), round(max(p.z for p in pts), 3), 'высота', round(max(p.z for p in pts) - min(p.z for p in pts), 3))
print('сцена F4: этап', STAGE)
