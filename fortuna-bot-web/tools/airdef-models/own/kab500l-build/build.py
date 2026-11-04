# КАБ-500Л - своя игровая модель по картинкам Mark (Свои/КАБ-500Л/): референс_1.png - чертёжный вид сбоку на голубом фоне (главная: силуэт и расположение деталей), референс_2.webp - учебный экземпляр на подставке
# (швы, пояса, накладки; надпись УЧЕБНАЯ, красные заглушка и крышка люка - музейные, не переносим), референс_3.webp - открытая головка в кольце, крылья, накладки, проушины. Пиксели в текстуру не берём. Геометрия - kab_geo.py.
# Запуск (фоновый Blender): KAB_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python _collide.py --python deliver.py
# В своём окне Blender: KAB_STAGE=1…4 - этапы (1 корпус, 2 проушины, люк, короб, 3 накладки, рули, планки, крылья, 4 головка), live.py из Свои/_инструменты/live_blender.
#
# СПИСОК ДЕТАЛЕЙ (сделано / пропущено):
#  + корпус вращением: носовой конус, плечо, цилиндр Ø 0,41, пояса стыков, сужение кормы, воротник, хвостовая труба с закруглённым торцом (референс_1)
#  + головка наведения с кольцом-стабилизатором на четырёх лопатках, линза, шейка; объект seeker, начало в шарнире (референс_3, открытая)
#  + 4 коротких руля «×» на болтовых накладках: canard_0…3, ось радиальная (референс_1, 3)
#  + 4 хвостовых крыла «×» на планках с рядом проушин: wing_0…3, ось вдоль корня (референс_3: шарнирная гребёнка) - концы ниже проушин по заданию
#  + две проушины-скобы сверху на осевой линии, крышка люка (серая), короб вдоль низа, стяжки у воротника, круглые крышки на хвосте, пробки на бортах
#  + тёмные пояса, заклёпки, свои надписи (bake.py); без надписи УЧЕБНАЯ, без красных музейных деталей
#  - подставки, соседние изделия, подписи фотографа - не часть бомбы
import sys, os, importlib
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/КАБ-500Л'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
import modelkit as mk; importlib.reload(mk)
import kab_geo as g; importlib.reload(g)

STAGE = int(os.environ.get('KAB_STAGE', '9'))
mk.configure('KAB500L', 0.00689, x0=294.0, yc=166.0, rb=g.R / 0.00689, nseg=g.NSEG, nose='right')
mk.set_materials([('K5L_body', (0.27, 0.30, 0.32)), ('K5L_steel', (0.34, 0.37, 0.39)), ('K5L_dark', (0.10, 0.12, 0.13))])
for m, (rough, metal) in zip(mk.MATS, ((0.50, 0.20), (0.50, 0.25), (0.60, 0.20))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
OBJS = g.bomb(STAGE)
mk.stats()
print('сцена KAB500L: этап', STAGE)
