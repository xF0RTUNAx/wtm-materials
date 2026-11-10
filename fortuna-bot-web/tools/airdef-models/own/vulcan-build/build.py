# Avro Vulcan B.2 - свой самолёт игры, ключ e_vulcan. Свои меши по фото Mark (референсы/vulcan_*). Геометрия - vul_geo.py, детали - vul_detail.py, шасси - vul_gear.py.
# Запуск: VUL_STAGE=1…4, Blender -b --factory-startup --python build.py. Окно Blender не открывается.
# Фото: 01 - сверху в крене (план, камуфляж), 02 - сзади снизу (сопла), 03 - снизу, старая белая окраска, отсек открыт (план, отсек, гондолы),
# 04 - взлёт справа (профиль), 05 - посадка спереди-слева (нос, кабина, заборник, тормоза, шасси), 06 - на земле сзади-сбоку (сопла, хвост, стойки), 07 - рендер снизу (устройство отсека, только подсказка).
#
# СПИСОК ДЕТАЛЕЙ: обшивка единым телом (фюзеляж с горбом-хребтом, блистер прицела, треугольное крыло с переломами передней кромки, заборники в корне с перегородкой,
# обтекатели четырёх труб снизу), киль с колпаком и рулём, элевоны 4 на сторону, срезы сопел, кабина с двумя креслами, колпак с переплётом, круглые окна,
# бомбоотсек с нутром (шпангоуты, балки, замки, цилиндры) и двумя створками, тормозные щитки (2 над и 1 под крылом на сторону), штанга дозаправки,
# приёмники на концах крыла, пилоны со сдвоенной балкой под Shrike, шасси (передняя стойка на 2 колеса, основные тележки по 8 колёс), створки ниш.
import sys, os, importlib, math, time
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Vulcan B.2'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
from mathutils import Matrix, Vector
import modelkit as mk; importlib.reload(mk)
import vul_geo as g; importlib.reload(g)

STAGE = int(os.environ.get('VUL_STAGE', '9'))
T0 = time.time()
mk.configure('VUL', 0.001, x0=0.0, yc=0.0, rb=1000.0, nseg=64, nose='left')
mk.set_materials([('VUL_skin', (0.42, 0.45, 0.48)), ('VUL_metal', (0.40, 0.38, 0.35)), ('VUL_dark', (0.03, 0.03, 0.03)), ('VUL_glass', (0.10, 0.13, 0.15)), ('VUL_tyre', (0.03, 0.03, 0.03)), ('VUL_cock', (0.11, 0.115, 0.12)), ('VUL_strap', (0.42, 0.36, 0.26)), ('VUL_screen', (0.012, 0.035, 0.028)), ('VUL_belt', (0.28, 0.26, 0.20)), ('VUL_handle', (0.62, 0.50, 0.05)), ('VUL_seam', (0.10, 0.11, 0.12)), ('VUL_duct', (0.40, 0.38, 0.32))])
for m, (rough, metal) in zip(mk.MATS, ((0.5, 0.05), (0.42, 0.5), (0.8, 0.2), (0.0, 0.0), (0.85, 0.0), (0.6, 0.1), (0.75, 0.0), (0.2, 0.0), (0.8, 0.0), (0.4, 0.1), (0.8, 0.0), (0.6, 0.0))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
    if m.name == 'VUL_glass':
        pb.inputs['Base Color'].default_value = (0.62, 0.68, 0.72, 1.0); pb.inputs['Alpha'].default_value = 0.16
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
OBJS = g.plane(STAGE, carve=os.environ.get('VUL_CARVE', '1') == '1')
bpy.context.view_layer.update()
for o in OBJS: print(f'{o.name:22s} {sum(len(p.vertices) - 2 for p in o.data.polygons):7d} тр.')
tot = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJS); print('всего', tot, 'тр., за', round(time.time() - T0, 1), 'с')
pts = [o.matrix_world @ v.co for o in OBJS for v in o.data.vertices]
print('габарит: X', round(min(p.x for p in pts), 3), round(max(p.x for p in pts), 3), 'Y', round(min(p.y for p in pts), 3), round(max(p.y for p in pts), 3), 'Z', round(min(p.z for p in pts), 3), round(max(p.z for p in pts), 3), 'высота', round(max(p.z for p in pts) - min(p.z for p in pts), 3))
print('сцена VUL: этап', STAGE)
