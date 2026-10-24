# AN/ALQ-131(V) «глубокий» (USAF) — станция помех запада ecm_w, своя игровая модель по картинкам Mark (Свои/ALQ-131/):
# 1 — профиль-чертёж «USAF AN/ALQ-131(V)-12» на белом фоне (главный источник силуэта и положений деталей), 2 — фото под A-10 (цвет, крюки, посадка),
# 3 / 4 / 8 / 9 — схемы окраски и трафаретов (Uprise, RESKIT, Eduard), 5 — рендер до/после (только раскладка панелей и заклёпок), 6 — коммерческий рендер 3/4 (только форма, ничего не обводим),
# 7 — схема модулей (положения люков). Геометрия — alq_pod.py (метры, нос +Y, верх +Z). Длина 2,40 м — как у прежней модели (ELTA 8222, 2,402 м).
# Запуск (фоновый Blender): ALQ_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# В живом Blender (чтобы Mark видел сборку): ALQ_STAGE=1…4 — этапы (1 коробка, 2 нос, 3 хвост, 4 брюхо, крюки, разъём, панели, штырь), exec(compile(open(p, encoding='utf-8').read(), p, 'exec'), {'__file__': p})
#
# СПИСОК ДЕТАЛЕЙ (сделано / пропущено):
#  + коробка (суперэллипс-сечения: ровные бока и верх, скруглённое дно), передняя стенка, подбородок под 45° (низ по замерам чертежа), задний торец со ступенью
#  + носовой обтекатель (тёмный, оживало по замерам полувысот), кольцо, хомут (светлее), шея (радиус 84 против 78,5 у кольца), штырь под кольцом (площадка, колонка, блок)
#  + переход к хвосту и хвостовая гондола с тупым скруглённым торцом
#  + брюшной обтекатель «deep» (трапеция сбоку по замерам, ширина ≈ 0,54 коробки)
#  + верх: две крышки-«седла», две проушины под пилон на подкладках, 12 гаек у проушин и 6 на крышках, блок разъёма с двумя цилиндрами
#  + четыре боковые панели (накладки +3 пикс.) и шов между секциями; нижние накладки «DO NOT PAINT», люки, шины, заглушки — линиями в цвете и нормалях (alq_sheet.py → bake.py)
#  + трафареты «USAF AN/ALQ-131(V)-12» и «DO NOT PAINT» ×2 на обоих бортах (растровый шрифт), красные ромбы WARNING (носовое кольцо, задний люк), ряды заклёпок (бока, верх, кольца) — шейдером
#  − пропущено: мелкие надписи TORQUE PANEL FASTENERS / ACCESS PANEL (нечитаемы при 512), синий клапан у шеи, «капот» с воздухозаборником над шеей и рама окна над хвостовой гондолой (только общим объёмом),
#    серийные номера и штрихкоды, защёлки панелей (на чертеже сбоку — круглые заглушки, нарисованы в цвете)
import sys, os, math, importlib
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/ALQ-131'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
import modelkit as mk; importlib.reload(mk)
import alq_pod as ap; importlib.reload(ap)

STAGE = int(os.environ.get('ALQ_STAGE', '9'))
mk.configure('ALQ131', ap.LEN_M / ap.DRAW_LEN, x0=ap.X0, yc=ap.YC, rb=78.5, nseg=ap.NS, nose='left')
mk.set_materials([('ALQ_body', (0.52, 0.53, 0.54)), ('ALQ_cone', (0.075, 0.078, 0.085)), ('ALQ_metal', (0.30, 0.31, 0.32)), ('ALQ_dark', (0.05, 0.05, 0.055))])
for m, (rough, metal) in zip(mk.MATS, ((0.55, 0.05), (0.35, 0.0), (0.45, 0.55), (0.60, 0.20))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
ap.pod(STAGE)
mk.stats()
print('сцена ALQ131: этап', STAGE)
