# Boeing B-52H Stratofortress - свой самолёт игры, ключ e_b52. Свои меши по фото Mark (референсы/b52_*). Геометрия - b52_geo.py.
# Запуск: B52_STAGE=1…4, Blender -b --factory-startup --python build.py. Окно Blender не открывается.
# Фото: 01 - сверху (мелкое), 02 - сверху-сбоку в полёте, 03, 04 - снизу в полёте, 05 - нос крупно, парашют, пилон с подвеской, 06/12 - спереди 3/4 на земле,
# 07, 08 - сбоку на земле (длина, высоты), 09 - хвост с килем, 10 - хвостовой конус (износ), 11 - сзади в полёте (копоть), 13 - спереди сверху с вооружением,
# 14 - строго спереди на земле (вбок), 15, 16 - сверху (план: _rectify.py по 15).
import sys, os, importlib, math, time
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/B-52H'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
from mathutils import Matrix, Vector
import modelkit as mk; importlib.reload(mk)
import b52_geo as g; importlib.reload(g)

STAGE = int(os.environ.get('B52_STAGE', '9'))
T0 = time.time()
mk.configure('B52', 0.001, x0=0.0, yc=0.0, rb=1000.0, nseg=64, nose='left')
mk.set_materials([('B52_skin', (0.36, 0.38, 0.40)), ('B52_metal', (0.40, 0.38, 0.35)), ('B52_dark', (0.03, 0.03, 0.03)), ('B52_glass', (0.10, 0.13, 0.15)), ('B52_tyre', (0.03, 0.03, 0.03)), ('B52_cock', (0.11, 0.115, 0.12)), ('B52_strap', (0.42, 0.36, 0.26)), ('B52_screen', (0.012, 0.035, 0.028)), ('B52_belt', (0.28, 0.26, 0.20)), ('B52_handle', (0.62, 0.50, 0.05)), ('B52_seam', (0.10, 0.11, 0.12)), ('B52_duct', (0.40, 0.38, 0.32)), ('B52_lens_r', (0.55, 0.04, 0.03)), ('B52_lens_g', (0.04, 0.45, 0.14)), ('B52_lens_w', (0.85, 0.85, 0.80))])
for m, (rough, metal) in zip(mk.MATS, ((0.5, 0.05), (0.42, 0.5), (0.8, 0.2), (0.0, 0.0), (0.85, 0.0), (0.6, 0.1), (0.75, 0.0), (0.2, 0.0), (0.8, 0.0), (0.4, 0.1), (0.8, 0.0), (0.6, 0.0), (0.15, 0.0), (0.15, 0.0), (0.15, 0.0))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
    if m.name == 'B52_glass':
        pb.inputs['Base Color'].default_value = (0.62, 0.68, 0.72, 1.0); pb.inputs['Alpha'].default_value = 0.16
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
OBJS = g.plane(STAGE)
bpy.context.view_layer.update()
for o in OBJS: print(f'{o.name:22s} {sum(len(p.vertices) - 2 for p in o.data.polygons):7d} тр.')
tot = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJS); print('всего', tot, 'тр., за', round(time.time() - T0, 1), 'с')
pts = [o.matrix_world @ v.co for o in OBJS for v in o.data.vertices]
print('габарит: X', round(min(p.x for p in pts), 3), round(max(p.x for p in pts), 3), 'Y', round(min(p.y for p in pts), 3), round(max(p.y for p in pts), 3), 'Z', round(min(p.z for p in pts), 3), round(max(p.z for p in pts), 3), 'высота', round(max(p.z for p in pts) - min(p.z for p in pts), 3))
print('сцена B52: этап', STAGE)
