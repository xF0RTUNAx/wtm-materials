# AN-M65A1 1000 lb — своя игровая модель по картинкам Mark (Свои/AN-M65A1/): ref_03.png — музейный экземпляр сбоку, нос слева (главная: профиль, проушины, пояса, трафарет),
# ref_02.png — 3/4 сзади (коробчатый стабилизатор, хвостовой взрыватель с крыльчаткой), ref_01.png — прежняя модель игры (только общая форма). Геометрия — m65_geo.py.
# Запуск (фоновый Blender): M65_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# В своём окне Blender «для показа»: M65_STAGE=1…4 — этапы (1 корпус, 2 проушины и крыльчатки, 3 стабилизатор, 4 кромки перьев), live.py из Свои/_инструменты/live_blender.
#
# СПИСОК ДЕТАЛЕЙ (сделано / пропущено):
#  + корпус вращением: носовой взрыватель (колпачок, корпус, гайка), тупое оживало, цилиндр Ø 0,48 м, оживальная корма, стык со втулкой стабилизатора
#  + две проушины-рыма сверху (ref_03: x 625 и 965; ref_02 — кольца)
#  + носовая крыльчатка (4 лопасти, ref_03) и хвостовая (8 лопастей на штоке, ref_03) — отдельные объекты vane_nose / vane_tail, начало на оси
#  + стабилизатор: втулка, 4 пера крестом × с отогнутыми кромками, квадратная коробка из 4 стенок с U-вырезами спереди (ref_02, ref_03)
#  + жёлтое кольцо у носового взрывателя, жёлтый пояс на корме, чёрный трафарет (ref_03) — в текстуре (bake.py)
#  − шов на втулке, мелкие сварные швы коробки — не видны при игровом масштабе, только рельеф (bake.py)
#  − подставка музея (жёлтая тележка на ref_03) — не часть бомбы
import sys, os, importlib
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/AN-M65A1'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
import modelkit as mk; importlib.reload(mk)
import m65_geo as g; importlib.reload(g)

STAGE = int(os.environ.get('M65_STAGE', '9'))
S3 = g.L / 1665.0                                          # м/пикс на ref_03 (x 150 … 1815)
mk.configure('BOMB1000', S3, x0=982.5, yc=576.0, rb=g.R_CYL / S3, nseg=32, nose='left')
mk.set_materials([('M65_body', (0.083, 0.085, 0.052)), ('M65_steel', (0.36, 0.37, 0.38)), ('M65_sheet', (0.083, 0.085, 0.052)), ('M65_vane', (0.62, 0.63, 0.64))])
for m, (rough, metal) in zip(mk.MATS, ((0.66, 0.08), (0.42, 0.75), (0.64, 0.10), (0.35, 0.85))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
g.bomb(STAGE)
mk.stats()
print('сцена BOMB1000: этап', STAGE)
