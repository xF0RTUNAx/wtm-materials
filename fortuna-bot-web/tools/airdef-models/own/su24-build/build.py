# Су-24М - свой самолёт игры, ключ e_su24. Свои меши по чертежам и фото Mark (референсы/su24_*). Геометрия - su_geo.py.
# Запуск: SU_STAGE=1…4 Blender -b --factory-startup --python build.py. Окно Blender не открывается.
# Фото: 01 - цветной рисунок (серый, белый нос), 02 - чертёж с подвеской, 03 - чертёж с линейкой (главная опора), 04 - пиксельный камуфляж, 05-08 - серые в полёте и на стоянке,
# 09-11 - снизу (пилоны, ниши, брюхо), 12 - спереди (колея, заборники).
import sys, os, importlib, time
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Су-24М'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
import modelkit as mk; importlib.reload(mk)
import su_geo as g; importlib.reload(g)

STAGE = int(os.environ.get('SU_STAGE', '9'))
T0 = time.time()
mk.configure('SU', 0.001, x0=0.0, yc=0.0, rb=1000.0, nseg=64, nose='left')
mk.set_materials([('SU_skin', (0.62, 0.63, 0.64)), ('SU_metal', (0.45, 0.44, 0.42)), ('SU_dark', (0.03, 0.03, 0.03)), ('SU_glass', (0.10, 0.13, 0.15)), ('SU_tyre', (0.03, 0.03, 0.03)),
                  ('SU_cock', (0.11, 0.115, 0.12)), ('SU_strap', (0.42, 0.36, 0.26)), ('SU_screen', (0.012, 0.035, 0.028)), ('SU_belt', (0.28, 0.26, 0.20)), ('SU_handle', (0.62, 0.50, 0.05)),
                  ('SU_seam', (0.10, 0.11, 0.12)), ('SU_duct', (0.40, 0.40, 0.40)), ('SU_lens_r', (0.55, 0.04, 0.03)), ('SU_lens_g', (0.04, 0.45, 0.14)), ('SU_lens_w', (0.85, 0.85, 0.80))])
for m, (rough, metal) in zip(mk.MATS, ((0.35, 0.6), (0.42, 0.5), (0.8, 0.2), (0.0, 0.0), (0.85, 0.0), (0.6, 0.1), (0.75, 0.0), (0.2, 0.0), (0.8, 0.0), (0.4, 0.1), (0.8, 0.0), (0.6, 0.3), (0.15, 0.0), (0.15, 0.0), (0.15, 0.0))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
    if m.name == 'SU_glass':
        pb.inputs['Base Color'].default_value = (0.30, 0.36, 0.40, 1.0); pb.inputs['Alpha'].default_value = 0.22
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
SW = os.environ.get('SU_SWEEP'); OBJS = g.plane(STAGE, None if SW is None else float(SW))
bpy.context.view_layer.update()
for o in OBJS: print(f'{o.name:22s} {sum(len(p.vertices) - 2 for p in o.data.polygons):7d} тр.')
tot = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJS); print('всего', tot, 'тр., за', round(time.time() - T0, 1), 'с')
pts = [o.matrix_world @ v.co for o in OBJS for v in o.data.vertices]
print('габарит: X', round(min(p.x for p in pts), 3), round(max(p.x for p in pts), 3), 'Y', round(min(p.y for p in pts), 3), round(max(p.y for p in pts), 3), 'Z', round(min(p.z for p in pts), 3), round(max(p.z for p in pts), 3))
print("сцена SU: этап", STAGE)
