# Saab J 35F Draken - свой самолёт игры, ключ e_draken. Свои меши по фото Mark (референсы/draken_*). Геометрия - dr_geo.py.
# Запуск: DR_STAGE=1…4 Blender -b --factory-startup --python build.py. Окно Blender не открывается.
# Фото: 01 - снизу (австрийская окраска, раскладка низа), 02 - сверху сбоку (форма двойной дельты, киль), 03, 04 - двухместный Sk 35C на взлёте (детали: хвостовые колёса,
# щитки, бак), 05 - строго спереди, металл (заборники, шасси, два бака), 06 - спереди, музей, 07 - строго снизу, металл (план, панели, износ), 08 - снизу сзади (сопло),
# 09 - чертёж в трёх проекциях (по длине искажён - см. dr_geo.py).
import sys, os, importlib, time
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Saab 35 Draken'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
import modelkit as mk; importlib.reload(mk)
import dr_geo as g; importlib.reload(g)

STAGE = int(os.environ.get('DR_STAGE', '9'))
T0 = time.time()
mk.configure('DR', 0.001, x0=0.0, yc=0.0, rb=1000.0, nseg=64, nose='left')
mk.set_materials([('DR_skin', (0.62, 0.63, 0.64)), ('DR_metal', (0.45, 0.44, 0.42)), ('DR_dark', (0.03, 0.03, 0.03)), ('DR_glass', (0.10, 0.13, 0.15)), ('DR_tyre', (0.03, 0.03, 0.03)),
                  ('DR_cock', (0.11, 0.115, 0.12)), ('DR_strap', (0.42, 0.36, 0.26)), ('DR_screen', (0.012, 0.035, 0.028)), ('DR_belt', (0.28, 0.26, 0.20)), ('DR_handle', (0.62, 0.50, 0.05)),
                  ('DR_seam', (0.10, 0.11, 0.12)), ('DR_duct', (0.40, 0.40, 0.40)), ('DR_lens_r', (0.55, 0.04, 0.03)), ('DR_lens_g', (0.04, 0.45, 0.14)), ('DR_lens_w', (0.85, 0.85, 0.80))])
for m, (rough, metal) in zip(mk.MATS, ((0.35, 0.6), (0.42, 0.5), (0.8, 0.2), (0.0, 0.0), (0.85, 0.0), (0.6, 0.1), (0.75, 0.0), (0.2, 0.0), (0.8, 0.0), (0.4, 0.1), (0.8, 0.0), (0.6, 0.3), (0.15, 0.0), (0.15, 0.0), (0.15, 0.0))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
    if m.name == 'DR_glass':
        pb.inputs['Base Color'].default_value = (0.62, 0.68, 0.72, 1.0); pb.inputs['Alpha'].default_value = 0.16
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
OBJS = g.plane(STAGE)
bpy.context.view_layer.update()
for o in OBJS: print(f'{o.name:22s} {sum(len(p.vertices) - 2 for p in o.data.polygons):7d} тр.')
tot = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJS); print('всего', tot, 'тр., за', round(time.time() - T0, 1), 'с')
pts = [o.matrix_world @ v.co for o in OBJS for v in o.data.vertices]
print('габарит: X', round(min(p.x for p in pts), 3), round(max(p.x for p in pts), 3), 'Y', round(min(p.y for p in pts), 3), round(max(p.y for p in pts), 3), 'Z', round(min(p.z for p in pts), 3), round(max(p.z for p in pts), 3))
print('сцена DR: этап', STAGE)
