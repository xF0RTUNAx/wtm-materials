# Ил-28 - свой самолёт игры, ключ e_il28. Свои меши по фото Mark (референсы/il28_01…09). Геометрия - il28_geo.py, детали - il28_detail.py, шасси - il28_gear.py.
# Запуск: IL_STAGE=1…4, Blender -b --factory-startup --python build.py. Окно Blender не открывается.
#
# СПИСОК ДЕТАЛЕЙ: обшивка единым телом (фюзеляж, обтекатель за фонарём, крыло, гондолы, киль, стабилизатор, кабина стрелка, обтекатель РЛС, обтекатели носовых пушек),
# руль направления, рули высоты, элероны, закрылки (4), шаровая турель и её стволы, купол штурмана с рамами, фонарь лётчика, козырёк, стёкла стрелка,
# створки бомбоотсека (2), люк стрелка, кок и стойки заборников, конусы сопел, носовые пушки, шасси и створки.
import sys, os, importlib, math, time
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Ил-28'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
from mathutils import Matrix, Vector
import modelkit as mk; importlib.reload(mk)
import il28_geo as g; importlib.reload(g)

STAGE = int(os.environ.get('IL_STAGE', '9'))
T0 = time.time()
mk.configure('IL', 0.001, x0=0.0, yc=0.0, rb=1000.0, nseg=64, nose='left')
mk.set_materials([('IL_skin', (0.56, 0.58, 0.60)), ('IL_metal', (0.40, 0.38, 0.35)), ('IL_dark', (0.03, 0.03, 0.03)), ('IL_glass', (0.10, 0.13, 0.15)), ('IL_tyre', (0.03, 0.03, 0.03)), ('IL_cock', (0.11, 0.115, 0.12)), ('IL_strap', (0.42, 0.36, 0.26)), ('IL_screen', (0.012, 0.035, 0.028)), ('IL_belt', (0.28, 0.26, 0.20)), ('IL_handle', (0.62, 0.50, 0.05)), ('IL_seam', (0.10, 0.11, 0.12)), ('IL_duct', (0.40, 0.38, 0.32))])
for m, (rough, metal) in zip(mk.MATS, ((0.5, 0.05), (0.42, 0.5), (0.8, 0.2), (0.0, 0.0), (0.85, 0.0), (0.6, 0.1), (0.75, 0.0), (0.2, 0.0), (0.8, 0.0), (0.4, 0.1), (0.8, 0.0), (0.6, 0.0))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
    if m.name == 'IL_glass':
        pb.inputs['Base Color'].default_value = (0.62, 0.68, 0.72, 1.0); pb.inputs['Alpha'].default_value = float(os.environ.get('IL_GLASS_A', '0.30'))
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
OBJS = g.plane(STAGE, carve=os.environ.get('IL_CARVE', '1') == '1')
bpy.context.view_layer.update()
for o in OBJS: print(f'{o.name:22s} {sum(len(p.vertices) - 2 for p in o.data.polygons):7d} тр.')
tot = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJS); print('всего', tot, 'тр., за', round(time.time() - T0, 1), 'с')
pts = [o.matrix_world @ v.co for o in OBJS for v in o.data.vertices]
print('габарит: X', round(max(p.x for p in pts), 3), 'Y', round(min(p.y for p in pts), 3), round(max(p.y for p in pts), 3), 'Z', round(min(p.z for p in pts), 3), round(max(p.z for p in pts), 3), 'высота', round(max(p.z for p in pts) - min(p.z for p in pts), 3))
print('сцена IL: этап', STAGE)
