# Х-28 - своя игровая модель по картинкам Mark (Свои/Х-28/): референс_1.png - вид сбоку на белом фоне (главная: силуэт, расположение крыльев и оперения), референс_2.png - фото на подставках (окраска, серый обтекатель, швы, форма крыльев).
# Подпись на борту, подставки, соседние ракеты и фон не берём, пиксели в текстуру не берём. Геометрия - k28_geo.py. Вида сверху и сзади нет: размах и обратная сторона додуманы симметрично.
# Запуск (фоновый Blender): K28_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python _collide.py --python deliver.py
# В своём окне Blender: K28_STAGE=1…4 - этапы (1 корпус, 2 крылья, 3 узлы и мелочь, 4 рули), live.py из Свои/_инструменты/live_blender.
#
# СПИСОК ДЕТАЛЕЙ (сделано / пропущено):
#  + корпус вращением с оживальным обтекателем, подбрюшье в тех же кольцах, нахлёсты листов, сужение кормы, полое сопло (референс_1, 2)
#  + 2 низких крыла большой стреловидности с наплывами (референс_1, 2; размах додуман)
#  + 4 руля: rudder_top, rudder_bot, rudder_l, rudder_r, у каждого своя ось (поворот на картинках не виден, оси - мои)
#  + 2 подвесных узла сверху, обтекатели за крылом, воздухозаборы на бортах (референс_1)
#  + лючки, заклёпки, свои надписи, износ (bake.py)
#  - подпись на борту, подставки, соседние ракеты, фон - не часть ракеты
import sys, os, importlib
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Х-28'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
import modelkit as mk; importlib.reload(mk)
import k28_geo as g; importlib.reload(g)

STAGE = int(os.environ.get('K28_STAGE', '9'))
mk.configure('KH28', 0.01725, x0=175.0, yc=97.5, rb=g.R / 0.01725, nseg=g.NSEG, nose='right')
mk.set_materials([('K28_body', (0.60, 0.61, 0.62)), ('K28_steel', (0.45, 0.46, 0.47)), ('K28_dark', (0.05, 0.05, 0.05))])
for m, (rough, metal) in zip(mk.MATS, ((0.42, 0.15), (0.45, 0.45), (0.75, 0.3))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
OBJS = g.missile(STAGE)
mk.stats()
print('сцена KH28: этап', STAGE)
