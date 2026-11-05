# F-35A - свой самолёт игры, ключ e_f35. Свои меши по фото Mark (референсы f35_01..10): только образец формы. Запуск фоном: F35_STAGE=1..4 Blender -b --factory-startup --python build.py
import sys, os, importlib, math, time
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/F-35A'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
import modelkit as mk; importlib.reload(mk)
import f35_geo as g; importlib.reload(g)
STAGE = int(os.environ.get('F35_STAGE', '9')); T0 = time.time()
mk.configure('F35A', 0.001, x0=0.0, yc=0.0, rb=1000.0, nseg=64, nose='left')
mk.set_materials([('F35_skin', (0.28, 0.30, 0.32)), ('F35_metal', (0.30, 0.29, 0.28)), ('F35_dark', (0.03, 0.03, 0.03)), ('F35_glass', (0.10, 0.13, 0.15)), ('F35_tyre', (0.03, 0.03, 0.03)), ('F35_cock', (0.11, 0.115, 0.12)), ('F35_strap', (0.42, 0.36, 0.26)), ('F35_screen', (0.05, 0.25, 0.20)), ('F35_belt', (0.35, 0.33, 0.20)), ('F35_handle', (0.75, 0.62, 0.10)), ('F35_seam', (0.10, 0.10, 0.11)), ('F35_primer', (0.72, 0.62, 0.42))])
for m, (rough, metal) in zip(mk.MATS, ((0.45, 0.05), (0.42, 0.5), (0.8, 0.2), (0.0, 0.0), (0.85, 0.0), (0.6, 0.1), (0.75, 0.0), (0.2, 0.0), (0.8, 0.0), (0.4, 0.1), (0.8, 0.0), (0.7, 0.0))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
    if m.name == 'F35_glass':
        pb.inputs['Base Color'].default_value = (0.20, 0.15, 0.08, 1.0); pb.inputs['Alpha'].default_value = 0.52
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
OBJS = g.plane(STAGE, carve=os.environ.get('F35_CARVE', '1') == '1')
bpy.context.view_layer.update()
tot = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJS); print('всего', tot, 'тр., за', round(time.time() - T0, 1), 'с')
pts = [o.matrix_world @ v.co for o in OBJS for v in o.data.vertices]
print('габарит: X', round(max(p.x for p in pts), 3), 'Y', round(min(p.y for p in pts), 3), round(max(p.y for p in pts), 3), 'Z', round(min(p.z for p in pts), 3), round(max(p.z for p in pts), 3))
print('сцена F35A: этап', STAGE)
if os.environ.get('F35_AFTER'):
    p = os.environ['F35_AFTER']; exec(compile(open(p, encoding='utf-8').read(), p, 'exec'), {'__file__': p, '__name__': '__main__'})
