# F-16D - свой самолёт игры, ключ f16. Свои меши по фото Mark (референсы/f16_01...12; пиксели не используются). Геометрия - f16_geo.py.
# Запуск только фоном: F16_STAGE=1…4 (1 обшивка, 2 оперение, сопло, рули, 3 кабина, фонарь, пилоны, 4 шасси, створки), Blender -b --factory-startup --python build.py
#
# СПИСОК ДЕТАЛЕЙ: обшивка единым телом (нос, наплыв, гаргрот, воздухозаборник, крылья, гребни), киль и руль, стабилизаторы, флапероны, носки, щитки у сопла, сопло, кабина, два кресла, фонарь с аркой, пилоны, рельсы на концах крыла, люк дозаправки, шасси, створки. Оружия, баков и контейнеров нет: их вешает игра.
import sys, os, importlib, math, time
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/F-16D'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
from mathutils import Matrix, Vector
import modelkit as mk; importlib.reload(mk)
import f16_geo as g; importlib.reload(g)
import f16_detail as d; importlib.reload(d)

STAGE = int(os.environ.get('F16_STAGE', '9'))
T0 = time.time()
mk.configure('F16D', 0.001, x0=0.0, yc=0.0, rb=1000.0, nseg=64, nose='left')
mk.set_materials([('F16_skin', (0.40, 0.43, 0.46)), ('F16_metal', (0.40, 0.38, 0.35)), ('F16_dark', (0.03, 0.03, 0.03)), ('F16_glass', (0.10, 0.13, 0.15)), ('F16_tyre', (0.03, 0.03, 0.03)), ('F16_cock', (0.11, 0.115, 0.12)), ('F16_strap', (0.42, 0.36, 0.26)), ('F16_screen', (0.012, 0.035, 0.028)), ('F16_belt', (0.28, 0.26, 0.20)), ('F16_handle', (0.62, 0.50, 0.05)), ('F16_seam', (0.10, 0.11, 0.12)), ('F16_duct', (0.62, 0.58, 0.46)), ('F16_hud', (0.20, 0.85, 0.35))])
for m, (rough, metal) in zip(mk.MATS, ((0.5, 0.05), (0.42, 0.5), (0.8, 0.2), (0.0, 0.0), (0.85, 0.0), (0.6, 0.1), (0.75, 0.0), (0.2, 0.0), (0.8, 0.0), (0.4, 0.1), (0.8, 0.0), (0.6, 0.0), (0.2, 0.0))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
    if m.name == 'F16_glass':
        pb.inputs['Base Color'].default_value = (0.62, 0.66, 0.58, 1.0); pb.inputs['Alpha'].default_value = 0.20
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
OBJS = g.plane(STAGE, carve=os.environ.get('F16_CARVE', '1') == '1')
bpy.context.view_layer.update()
for o in OBJS: print(f'{o.name:22s} {sum(len(p.vertices) - 2 for p in o.data.polygons):7d} тр.')
tot = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJS); print('всего', tot, 'тр., за', round(time.time() - T0, 1), 'с')
pts = [o.matrix_world @ v.co for o in OBJS for v in o.data.vertices]
print('габарит: X', round(max(p.x for p in pts), 3), 'Y', round(min(p.y for p in pts), 3), round(max(p.y for p in pts), 3), 'Z', round(min(p.z for p in pts), 3), round(max(p.z for p in pts), 3), 'высота', round(max(p.z for p in pts) - min(p.z for p in pts), 3))
print('сцена F16D: этап', STAGE)
