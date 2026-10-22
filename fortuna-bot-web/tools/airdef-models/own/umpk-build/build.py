# УМПК (ФАБ-500М-62 с унифицированным модулем планирования и коррекции) — своя игровая модель по картинкам Mark (Свои/УМПК/): 5_инфографика.png (вид сбоку и сверху с размерами),
# 3_рендер.png (чужой рендер: форма клина модуля, крылья-доски, хомуты рулей — меши свои), 1–2 — схемы набора Quinta (какие детали входят в комплект), 4 — чертёж бомбы ФАБ-500М-62Т.
# Бомба — fab_bomb.py (та же, что в «ФАБ-500М62»), комплект — umpk_kit.py: модуль под бомбой с клином и подвесами, два крыла-доски (раскрыты; игра складывает их — META wings: 'fold'), четыре руля на кольце.
# Запуск (фоновый Blender): UMP_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# В живом Blender (чтобы Mark видел сборку): UMP_STAGE=1…6 — 1–3 бомба (корпус, бандажи, стабилизатор), 4 модуль с подвесами, 5 крылья, 6 рули; exec(compile(open(p, encoding='utf-8').read(), p, 'exec')).
#
# СПИСОК ДЕТАЛЕЙ (сделано / пропущено):
#  + вся бомба как в «ФАБ-500М62» (корпус, бандажи, ушки, стабилизатор «+» с кольцом)
#  + модуль под бомбой: четырёхгранный клин впереди, коробка 0,20 × 0,115 м, подвесы на бандажах, балка по брюху, направляющая-труба снизу (инфографика 5, рендер 3, Quinta 1–2)
#  + два крыла-доски: переднее размахом 2,5 м (хорда 0,30 м, на 0,62 м от носа) и заднее ≈ 1,05 м (хорда 0,20 м, на 1,76 м) — по виду сверху инфографики; сечение — плоская доска (полые ячейки торца — не делаем)
#  + четыре руля хвостового блока на кольце крестом ×, на хомутах (рендер 3)
#  − складывание крыльев — в игре по частям wingA / wingB (prepare.js groups); в файле крылья раскрыты
#  − приёмник спутниковой навигации, лючки модуля — рельеф карты нормалей
import sys, os, math, importlib
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/УМПК'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
import modelkit as mk; importlib.reload(mk)
import fab_bomb as fb; importlib.reload(fb)
import umpk_kit as uk; importlib.reload(uk)

STAGE = int(os.environ.get('UMP_STAGE', '9'))
S4 = fb.L / 540.0
mk.configure('UMPK', S4, x0=272.0, yc=60.0, rb=47.0, nseg=32, nose='left')
mk.set_materials([('F50_body', (0.12, 0.15, 0.11)), ('F50_steel', (0.40, 0.41, 0.42)), ('UMP_sheet', (0.42, 0.46, 0.50))])
for m, (rough, metal) in zip(mk.MATS, ((0.62, 0.10), (0.50, 0.60), (0.55, 0.45))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
fb.bomb(min(STAGE, 3))
if STAGE >= 4: uk.kit(STAGE)
mk.stats()
print('сцена UMPK: этап', STAGE)
