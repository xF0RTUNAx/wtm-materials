# AGM-158 JASSM - своя игровая модель по картинкам Mark (Свои/JASSM/): референс_1 и референс_2 - белые рендеры (форма, сопло, киль; логотипы и опознавательный знак не берём), референс_3 - серый снимок и референс_4 - бежево-серый рендер (окраска и детали; логотип и чужие надписи не берём).
# Пиксели в текстуру не берём, надписи свои. Геометрия - jsm_geo.py. В файле крылья и киль сложены, все углы 0, раскрытие - в паспорте.
# Запуск (фоновый Blender): JSM_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python _collide.py --python deliver.py
# В своём окне Blender: JSM_STAGE=1…3 - этапы (1 корпус, 2 наплывы, гребень, упоры, люк, 3 крылья и киль). JSM_OPEN=1 - показать раскрытыми (только для снимков формы).
#
# СПИСОК ДЕТАЛЕЙ (сделано / пропущено):
#  + корпус: острый нос со скулой, плоский низ, скруглённый верх, два шва-канавки, хвост с переходом в круг сопла, сопло полое ниже оси (референс_1, 2, 4)
#  + наплывы по бокам, гребень под килем, два упора с плитами и болтами, люк сверху (референс_1, 2, 3)
#  + wing1, wing2 - сложены назад под низом, вертикальная ось у корня; fin - лежит плашмя, ось вдоль корня (референс_1, 2 показывают раскрытыми)
#  + жёлтый поясок, тёмные швы, заплатки, лючки, свои надписи, износ (bake.py)
#  - логотипы Lockheed Martin и CAT UXO, опознавательный знак, чужие надписи - не берём
import sys, os, importlib, math
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/JASSM'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy
from mathutils import Matrix, Vector
import modelkit as mk; importlib.reload(mk)
import jsm_geo as g; importlib.reload(g)

STAGE = int(os.environ.get('JSM_STAGE', '9'))
mk.configure('JASSM', 0.001, x0=0.0, yc=0.0, rb=g.R / 0.001, nseg=g.NSEG, nose='left')
mk.set_materials([('JSM_body', (0.40, 0.42, 0.46)), ('JSM_wing', (0.40, 0.42, 0.46)), ('JSM_steel', (0.42, 0.43, 0.45)), ('JSM_dark', (0.03, 0.03, 0.03))])
for m, (rough, metal) in zip(mk.MATS, ((0.48, 0.05), (0.48, 0.05), (0.42, 0.55), (0.8, 0.3))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
OBJS = g.missile(STAGE)
if os.environ.get('JSM_OPEN') == '1' and STAGE >= 3:
    for n, D in g.WING_PIVOTS.items(): bpy.data.objects[n].rotation_mode = 'XYZ'; bpy.data.objects[n].rotation_euler = (0, 0, math.radians(D['open_deg']))
    o = bpy.data.objects['fin']; o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Matrix.Rotation(math.radians(g.FIN_OPEN), 4, g.FIN_PIVOT['axis']).to_quaternion()
mk.stats()
print('сцена JASSM: этап', STAGE)
