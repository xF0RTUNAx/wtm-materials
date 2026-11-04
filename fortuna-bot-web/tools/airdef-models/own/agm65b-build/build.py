# AGM-65B Maverick - своя игровая модель по картинкам Mark (Свои/AGM-65B/): референс_1.png - белая ракета с надписями SCENE MAG и U S AIR FORCE (именно 65B: окраска, надписи, поясы),
# референс_2.webp и референс_3.png - другие версии (серо-белые с жёлтым пояском): только форма упоров и рельса, заклёпки, вид сопла сзади. Пиксели в текстуру не берём, надписи свои. Геометрия - agm_geo.py.
# Запуск (фоновый Blender): AGM_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# В своём окне Blender: AGM_STAGE=1…4 - этапы (1 корпус, 2 крылья и подвес, 3 рули и сопло, 4 стекло и оптика), live.py из Свои/_инструменты/live_blender.
#
# СПИСОК ДЕТАЛЕЙ (сделано / пропущено):
#  + корпус вращением: скруглённый нос, цилиндр Ø 0,30, стальная лента, стыки секций, хвостовой срез, полость сзади (референс_3)
#  + стекло головки - отдельный объект; оптика под ним (кардан, бленда, линза) - отдельный объект, читается сквозь стекло
#  + 4 длинных неподвижных крыла «×» с прижимными планками у корня, размах 0,72 (все картинки)
#  + 4 хвостовых руля «×» - объекты rudder_0…3, начало на оси руля у корпуса, ось радиальная; кольца под осями на корпусе
#  + сопло - отдельный объект, полое насквозь (референс_3 сзади), блоки и кабель на дне полости
#  + на верхней линии: передний упор (два Т-башмака) и длинный рельс (две Т-планки с рампами) - форма с референс_2
#  + заклёпки, поясы (чёрный, коричневый), красное кольцо у стекла, надписи - в текстуре (bake.py), надписи нарисованы заново
#  - жёлтый поясок и надписи IR-версии с референс_2 и 3 - не переносим (задание)
#  - складных частей у этой ракеты нет
import sys, os, importlib
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/AGM-65B'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
import modelkit as mk; importlib.reload(mk)
import agm_geo as g; importlib.reload(g)

STAGE = int(os.environ.get('AGM_STAGE', '9'))
mk.configure('AGM65B', 0.001, x0=0.0, yc=0.0, rb=g.R / 0.001, nseg=g.NSEG, nose='left')
mk.set_materials([('M65_body', (0.78, 0.78, 0.76)), ('M65_steel', (0.42, 0.42, 0.43)), ('M65_dark', (0.030, 0.030, 0.032)), ('M65_glass', (0.020, 0.024, 0.026)), ('M65_lens', (0.10, 0.12, 0.14)), ('M65_optic', (0.10, 0.10, 0.11))])
for m, (rough, metal) in zip(mk.MATS, ((0.46, 0.05), (0.42, 0.70), (0.70, 0.20), (0.06, 0.0), (0.05, 0.85), (0.40, 0.70))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
gm = bpy.data.materials['M65_glass']; gb = next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); gb.inputs['Alpha'].default_value = 0.42
try: gm.surface_render_method = 'BLENDED'
except Exception: pass
OBJS = g.missile(STAGE)
mk.stats()
print('сцена AGM65B: этап', STAGE)
