# B-2A Spirit - свой самолёт игры, ключ e_b2. Свои меши по фото Mark (референсы/b2_01…14); чужие модели - только форма. Геометрия - b2_geo.py.
# Запуск: B2_STAGE=1…3, Blender -b --factory-startup --python build.py. Окно Blender не открывается.
# Фото: 01, 02 - рендеры сверху; 03 - кабина и воздухозаборник крупно; 04, 05 - сбоку на земле; 06 - заход, шасси; 07 - спереди в полёте;
# 08 - сбоку-сверху; 09 - спереди, шасси и щитки; 10, 11 - крен, щитки на концах; 12 - сверху (план); 13, 14 - снизу.
import sys, os, importlib, time
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/B-2A'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
import modelkit as mk; importlib.reload(mk)
import b2_geo as g; importlib.reload(g)

STAGE = int(os.environ.get('B2_STAGE', '9'))
T0 = time.time()
mk.configure('B2', 0.001, x0=0.0, yc=0.0, rb=1000.0, nseg=64, nose='left')
mk.set_materials([('B2_skin', (0.30, 0.32, 0.35)), ('B2_metal', (0.40, 0.38, 0.35)), ('B2_dark', (0.03, 0.03, 0.03)), ('B2_glass', (0.10, 0.13, 0.15)), ('B2_tyre', (0.03, 0.03, 0.03)),
                  ('B2_cock', (0.11, 0.115, 0.12)), ('B2_hot', (0.20, 0.195, 0.19))])
for m, (rough, metal) in zip(mk.MATS, ((0.62, 0.05), (0.42, 0.5), (0.8, 0.2), (0.0, 0.0), (0.85, 0.0), (0.6, 0.1), (0.55, 0.35))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
    if m.name == 'B2_glass':
        pb.inputs['Base Color'].default_value = (0.62, 0.68, 0.72, 1.0); pb.inputs['Alpha'].default_value = 0.16
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
OBJS = g.plane(STAGE)
bpy.context.view_layer.update()
for o in OBJS: print(f'{o.name:22s} {sum(len(p.vertices) - 2 for p in o.data.polygons):7d} тр.')
tot = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJS); print('всего', tot, 'тр., за', round(time.time() - T0, 1), 'с')
pts = [o.matrix_world @ v.co for o in OBJS for v in o.data.vertices]
print('габарит: X', round(min(p.x for p in pts), 3), round(max(p.x for p in pts), 3), 'Y', round(min(p.y for p in pts), 3), round(max(p.y for p in pts), 3), 'Z', round(min(p.z for p in pts), 3), round(max(p.z for p in pts), 3))
print('сцена B2: этап', STAGE)
