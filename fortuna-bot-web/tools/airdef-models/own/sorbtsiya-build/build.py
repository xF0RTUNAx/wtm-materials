# «Сорбция» — крыльевой контейнер станции помех Су-27 (в игре — станция помех востока ecm_e) — своя игровая модель по картинкам Mark (Свои/Сорбция/):
# 2_компоновка_Су-27_чб_поз87.webp — поз. 87 нарисована отдельно (форма, доли длины; _измерения/поз87_повёрнутый.png — повёрнутый рисунок, ось горизонтально), 1 и 4 — трёхвиды Су-27 (законцовка, место крепления),
# 5, 6 — фото Су-27 с контейнером на конце крыла (место, светлая окраска), 3 — цветная компоновка, 7–9 — Су-35 / Су-34 с контейнерами «Хибины» и неясным подфюзеляжным (не «Сорбция»: только как похожий класс).
# Длина 4,2 м и Ø 0,3 м — со слов Mark. Геометрия — srb_pod.py (метры, ось Y, острый колпак +Y, верх +Z, люк на +X).
# Запуск (фоновый Blender): SRB_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# В живом Blender (чтобы Mark видел сборку): SRB_STAGE=1…3 — этапы (1 корпус с колпаками, 2 подвесная планка, 3 люк, заглушка, штифты), exec(compile(open(p, encoding='utf-8').read(), p, 'exec'), {'__file__': p})
#
# СПИСОК ДЕТАЛЕЙ (сделано / пропущено):
#  + корпус вращением: острое оживало носового колпака, кольцо-обечайка, цилиндр, кольцо и тупое оживало хвостового колпака; стыки — канавки (рис. поз. 87)
#  + подвесная планка вдоль верха с заострёнными концами; люк на наружном борту (выпуклая пластина), круглая заглушка у переднего кольца, два штифта у хвостового кольца
#  − овальное отверстие люка, винты люка, продольный шов с метками (шаг 0,25 м) — в цвете и карте нормалей (bake.py)
#  − переходник на пусковое устройство законцовки (рельс АПУ) — в игре контейнер вешается на обычный пилон, своего пилона не рисуем
import sys, os, math, importlib
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Сорбция'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
import modelkit as mk; importlib.reload(mk)
import srb_pod as sp; importlib.reload(sp)

STAGE = int(os.environ.get('SRB_STAGE', '9'))
S4 = sp.L / 1000.0                                  # условный м/пикс (картинки с размерами нет): длина 1000 «пикселей»
mk.configure('SORB', S4, x0=500.0, yc=40.0, rb=sp.R / S4, nseg=32, nose='left')
mk.set_materials([('SRB_body', (0.47, 0.49, 0.51)), ('SRB_cap', (0.64, 0.64, 0.60)), ('SRB_dark', (0.16, 0.17, 0.19))])
for m, (rough, metal) in zip(mk.MATS, ((0.55, 0.10), (0.45, 0.0), (0.50, 0.55))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
sp.pod(STAGE)
mk.stats()
print('сцена SORB: этап', STAGE)
