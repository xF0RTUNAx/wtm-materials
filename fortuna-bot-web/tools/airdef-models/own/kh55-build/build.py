# Х-55 — своя игровая модель по картинкам Mark (Свои/Х-55/): 1 — вид сверху (чертёж), 2 — два вида сбоку (чертёж), 6 — цветной трёхвид (окраска, вид спереди), 5 — силуэты Х-555 и Х-101 (для Х-555).
# Размеры — в пикселях чертежа 1_вид_сверху_чертёж.png (длина по силуэту 729 пикс. = 6,04 м, как у прежней модели в игре); геометрия — kh55_geo.py.
# Запуск (фоновый Blender): K55_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# В отдельном окне Blender «для показа» (чтобы Mark видел сборку): K55_STAGE=1…4 — этапы (1 корпус, 2 крылья и оперение, 3 гондола двигателя, 4 детали), live.py из Свои/_инструменты/live_blender.
#
# СПИСОК ДЕТАЛЕЙ (сделано / пропущено):
#  + корпус вращением: тупой эллиптический нос, цилиндр, лодочный хвост, хвостовой конус с торцом; стыки секций — канавки (x 124, 186, 553, 620)
#  + два крыла с закруглёнными концами (передняя кромка ≈ 10° назад, задняя — прямая), три хвостовых плоскости (два стабилизатора и киль)
#  + подфюзеляжная гондола двигателя: цилиндр с круглым воздухозаборником и колпаком сопла, длинный тонкий пилон
#  − люки, щели крыльев, антенны, мелкие накладки — этап 4 (детали по рисункам)
import sys, os, importlib
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Х-55'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
import modelkit as mk; importlib.reload(mk)
import kh55_geo as g; importlib.reload(g)

STAGE = int(os.environ.get('K55_STAGE', '9'))
VARIANT = os.environ.get('K55_VARIANT', 'kh55')           # kh55 — Х-55, kh555 — Х-555 (то же + два конформных бака по нижним бортам)
g.configure('KH555' if VARIANT == 'kh555' else 'KH55')
g.missile(STAGE, VARIANT)
mk.stats()
print('сцена KH55: этап', STAGE)
