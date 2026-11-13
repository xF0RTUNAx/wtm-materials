# МиГ-23БН - свой самолёт игры, ключ e_mig23. Свои меши по чертежам и фото Mark (референсы/mig23_*). Геометрия - mg_geo.py.
# Запуск: MG_STAGE=1…4 Blender -b --factory-startup --python build.py. Окно Blender не открывается.
# Фото: 01 - цветной чертёж (сверху 16° и 45°, спереди, сбоку), 02 - профили и виды сверху/снизу (564), 03 - спереди вблизи, 04 - другая модификация (только крыло и шасси),
# 05 - хвост вблизи (износ, сопло, щитки), 06, 07 - БН на стоянке (камуфляж, баки, открытый фонарь).
import sys, os, importlib, time
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/МиГ-23БН'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
import modelkit as mk; importlib.reload(mk)
import mg_geo as g; importlib.reload(g)

STAGE = int(os.environ.get('MG_STAGE', '9'))
T0 = time.time()
mk.configure('MG', 0.001, x0=0.0, yc=0.0, rb=1000.0, nseg=64, nose='left')
mk.set_materials([('MG_skin', (0.62, 0.63, 0.64)), ('MG_metal', (0.45, 0.44, 0.42)), ('MG_dark', (0.03, 0.03, 0.03)), ('MG_glass', (0.10, 0.13, 0.15)), ('MG_tyre', (0.03, 0.03, 0.03)),
                  ('MG_cock', (0.11, 0.115, 0.12)), ('MG_strap', (0.42, 0.36, 0.26)), ('MG_screen', (0.012, 0.035, 0.028)), ('MG_belt', (0.28, 0.26, 0.20)), ('MG_handle', (0.62, 0.50, 0.05)),
                  ('MG_seam', (0.10, 0.11, 0.12)), ('MG_duct', (0.40, 0.40, 0.40)), ('MG_lens_r', (0.55, 0.04, 0.03)), ('MG_lens_g', (0.04, 0.45, 0.14)), ('MG_lens_w', (0.85, 0.85, 0.80))])
for m, (rough, metal) in zip(mk.MATS, ((0.35, 0.6), (0.42, 0.5), (0.8, 0.2), (0.0, 0.0), (0.85, 0.0), (0.6, 0.1), (0.75, 0.0), (0.2, 0.0), (0.8, 0.0), (0.4, 0.1), (0.8, 0.0), (0.6, 0.3), (0.15, 0.0), (0.15, 0.0), (0.15, 0.0))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
    if m.name == 'MG_glass':
        pb.inputs['Base Color'].default_value = (0.30, 0.36, 0.40, 1.0); pb.inputs['Alpha'].default_value = 0.22
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
SW = os.environ.get('MG_SWEEP'); OBJS = g.plane(STAGE, None if SW is None else float(SW))
bpy.context.view_layer.update()
for o in OBJS: print(f'{o.name:22s} {sum(len(p.vertices) - 2 for p in o.data.polygons):7d} тр.')
tot = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJS); print('всего', tot, 'тр., за', round(time.time() - T0, 1), 'с')
pts = [o.matrix_world @ v.co for o in OBJS for v in o.data.vertices]
print('габарит: X', round(min(p.x for p in pts), 3), round(max(p.x for p in pts), 3), 'Y', round(min(p.y for p in pts), 3), round(max(p.y for p in pts), 3), 'Z', round(min(p.z for p in pts), 3), round(max(p.z for p in pts), 3))
print('сцена MG: этап', STAGE)
