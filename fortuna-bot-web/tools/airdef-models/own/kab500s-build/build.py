# КАБ-500С - своя игровая модель по картинкам Mark (Свои/КАБ-500С/): референс_1.png - вид на белом фоне (главная: силуэт и расположение деталей), референс_2.png и референс_3.png - выставочные фото
# (швы, накладки, белая табличка, круглая крышка, колпак; надпись ИНЕРТНАЯ и индекс с буквой Э не переносим; соседние изделия, подставки и фон не собираем). Пиксели в текстуру не берём. Геометрия - k5s_geo.py.
# Запуск (фоновый Blender): K5S_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python _collide.py --python deliver.py
# В своём окне Blender: K5S_STAGE=1…3 - этапы (1 корпус, 2 проушины, крышка, короб, табличка, 3 накладки, рули, планки, крылья), live.py из Свои/_инструменты/live_blender.
#
# СПИСОК ДЕТАЛЕЙ (сделано / пропущено):
#  + корпус вращением: длинный острый конус со стыком наконечника, поясок, плечо, цилиндр Ø 0,40, пояса у проушин, сужение кормы, хвостовая труба с закруглённым торцом (референс_1, 2)
#  + 4 коротких руля «×» на накладках-клиньях: canard_0…3, ось радиальная (референс_1, 2, 3)
#  + 4 хвостовых крыла «×» на планках с болтами: wing_0…3, ось вдоль корня - концы ниже проушин по заданию
#  + две проушины-скобы сверху на осевой линии, круглая крышка с сеткой, колпак за ней, короб вдоль низа, белая табличка на бортах, круглые крышки на хвосте
#  + дуги прорезей, панели отверстий, своя надпись КАБ-500С (bake.py); без ИНЕРТНАЯ и без индекса с Э
#  - подставки, соседние изделия, фон, значок на столе - не часть бомбы
import sys, os, importlib
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/КАБ-500С'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
import modelkit as mk; importlib.reload(mk)
import k5s_geo as g; importlib.reload(g)

STAGE = int(os.environ.get('K5S_STAGE', '9'))
mk.configure('KAB500S', 0.00689, x0=294.0, yc=166.0, rb=g.R / 0.00689, nseg=g.NSEG, nose='right')
mk.set_materials([('K5S_body', (0.30, 0.33, 0.38)), ('K5S_steel', (0.33, 0.36, 0.41)), ('K5S_dark', (0.07, 0.07, 0.07)), ('K5S_white', (0.78, 0.79, 0.78)), ('K5S_cap', (0.33, 0.36, 0.41))])
for m, (rough, metal) in zip(mk.MATS, ((0.42, 0.35), (0.42, 0.45), (0.70, 0.20), (0.40, 0.0), (0.38, 0.10))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
OBJS = g.bomb(STAGE)
mk.stats()
print('сцена KAB500S: этап', STAGE)
