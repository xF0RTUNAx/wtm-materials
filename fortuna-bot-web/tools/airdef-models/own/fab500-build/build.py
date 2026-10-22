# ФАБ-500М-62 — своя игровая модель по картинкам Mark (Свои/ФАБ-500М62/): 4_чертёж_ФАБ-500М-62Т.png — технический чертёж сбоку (главный), 5_инфографика.png — вид сбоку и сверху с размерами,
# 3_рендер.png — рендер чужой модели (только детали: бандажи, кольцо стабилизатора, хомуты; меши свои), 1–2 — схемы набора Quinta (для УМПК). Геометрия — fab_bomb.py (общая с папкой «УМПК»).
# Запуск (фоновый Blender): FAB_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# В живом Blender (чтобы Mark видел сборку): FAB_STAGE=1…3 — этапы (1 корпус, 2 бандажи, ушки, лючок, 3 стабилизатор с кольцом), exec(compile(open(p, encoding='utf-8').read(), p, 'exec')).
#
# СПИСОК ДЕТАЛЕЙ (сделано / пропущено):
#  + корпус вращением: взрыватель, оживало (по чертежу), цилиндр Ø 0,43 м, длинный конус хвоста, хвостовая труба; стыки секций — канавки
#  + два бандажа на цилиндре и два подвесных ушка на них (шаг 0,26 м, чертёж 4 и рендер 3), хвостовой бандаж с замком, лючок хвостового взрывателя
#  + стабилизатор: четыре трапециевидных крыла «+» (одно вверх, к ушкам) и стальное кольцо по их концам (чертёж 4, инфографика 5, рендер 3)
#  − надписи (ФАБ-500М-62, цифры партии) — по картинкам 3 и 5 видны, на чертеже нет; в bake.py — только обозначение типа
#  − взрыватель: красная точка и накатка — в текстуре
import sys, os, math, importlib
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/ФАБ-500М62'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
import modelkit as mk; importlib.reload(mk)
import fab_bomb as fb; importlib.reload(fb)

STAGE = int(os.environ.get('FAB_STAGE', '9'))
S4 = fb.L / 540.0                                   # м/пикс на чертеже 4 (торец взрывателя x = 40 … торец кольца x = 580 на оригинале; в _измерения/4_для_силуэта.png — 2 … 542)
mk.configure('FAB500', S4, x0=272.0, yc=60.0, rb=47.0, nseg=32, nose='left')
mk.set_materials([('F50_body', (0.12, 0.15, 0.11)), ('F50_steel', (0.40, 0.41, 0.42))])
for m, (rough, metal) in zip(mk.MATS, ((0.62, 0.10), (0.50, 0.60))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
fb.bomb(STAGE)
mk.stats()
print('сцена FAB500: этап', STAGE)
