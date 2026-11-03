# AN-M65A1 — сдача: превью, крупные планы, экспорт (Sketchfab — текстуры полные, игра — облегчённые), .blend, паспорт и отчёт. Запускается ПОСЛЕ build.py и bake.py в том же Blender:
#   M65_OUT="<папка модели>" M65_PAINT=музей /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python _collide.py --python deliver.py
# Силуэт с IoU не считается: ref_03 — фотография в перспективе (IoU — только для чертежей); пропорции сверены наложением глазами.
# Уровень 2 (игра, без записи в репозиторий): deno run -A …/tools/airdef-models/preview-candidate.js w_bomb1000 "$F/bomb1000.glb" --out "$F/превью-игра" --weapon bomb1000
import os, sys, json
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk
import m65_geo as g

OUT = os.environ.get('M65_OUT')
if not OUT: raise SystemExit('Задай M65_OUT=<папка модели>: сюда пишутся превью, экспорт и паспорт')
GAME_TEX, GAME_NTEX = int(os.environ.get('M65_GAME_TEX', '512')), int(os.environ.get('M65_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('M65_TEX', '2048'))
PAINT = os.environ.get('M65_PAINT', 'олива')
sc = bpy.data.scenes['BOMB1000']
st = mk.stats()
ms = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in ms for v in o.data.vertices]
mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
LEN = round(mx.y - mn.y, 3)
print('габарит с учётом положения крыльчаток:', [round(v, 3) for v in (mx - mn)], 'Y', round(mn.y, 3), '…', round(mx.y, 3))

c = Vector((0.0, 0.0, 0.0))
prev = [os.path.basename(p) for p in mk.previews(OUT, views=[
    ('превью_1_общий.png', Vector((0, 0.05, 0)), (-0.8, 0.75, 0.45), 2.9),
    ('превью_2_сбоку.png', Vector((0, -0.02, 0)), (-1.0, 0.0, 0.10), 3.0),
    ('превью_3_хвост.png', Vector((0.0, -0.70, 0.0)), (-0.75, -1.0, 0.55), 1.30),
    ('превью_4_голова.png', Vector((0.0, 0.62, 0.0)), (-0.85, 0.9, 0.35), 1.05)])]
os.makedirs(OUT + '/снимки', exist_ok=True)
mk.previews(OUT + '/снимки', size=(1600, 900), views=[
    ('крыльчатка_хвост.png', Vector((0.0, -0.62, 0.0)), (-0.55, -1.0, 0.25), 0.55),
    ('крыльчатка_нос.png', Vector((0.0, 0.92, 0.0)), (-0.7, 1.0, 0.3), 0.30),
    ('проушины.png', Vector((0.0, 0.21, 0.22)), (-0.8, 0.1, 0.7), 0.75),
    ('трафарет_борт_X.png', Vector((0.0, 0.25, 0.0)), (1.0, 0.05, 0.12), 1.5)])

mk.export(OUT + '/bomb1000_sketchfab.glb', None)
lc = bpy.data.images.load(OUT + f'/bomb1000_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + f'/bomb1000_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith('M65_')]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'M65_normal' else lc
mk.export(OUT + '/bomb1000.glb', OUT + '/bomb1000.blend')

col = {}
try: col = json.load(open(os.path.join(OUT, '_live', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога _collide.py:', e)
R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_bomb1000', weapon='bomb1000', name='AN-M65A1', name_en='AN-M65A1 1000 lb', glb='bomb1000.glb', blend='bomb1000.blend', rev=1,
    build=['build.py', 'm65_geo.py', 'bake.py', '_collide.py', 'deliver.py'], previews_=prev,
    checks={'vanes_360': col, 'silhouette_iou': {'бок': 'не считается: ref_03 — фото в перспективе'}},
    sketchfab={'title': 'AN-M65A1 1000 lb Bomb — Low Poly, Textured',
               'lead': 'AN-M65A1 — US 1000 lb general-purpose aircraft bomb of the Second World War: a blunt ogive nose with a vane-driven nose fuze, two suspension lugs, a box-type tail fin assembly and a tail fuze with an arming vane inside the box. Hand-modelled low-poly exterior with baked paint wear, yellow identification bands, stencilled markings and a normal map. Both arming vanes are separate objects pivoting on the bomb axis.',
               'parts': ['nose fuze with arming vane (separate object)', 'blunt ogive nose with yellow band', 'cylindrical body with two suspension lugs', 'tapered tail with yellow band', 'fin sleeve', 'four fins in X with bent tip flanges', 'square tail box with front cut-outs', 'tail fuze arbor with eight-blade arming vane (separate object)'],
               'tags': ['an-m65', 'an-m65a1', '1000lb', 'bomb', 'aviation bomb', 'ww2', 'world war 2', 'usaaf', 'general purpose bomb', 'military', 'weapon', 'lowpoly', 'game-ready', 'textured', 'blender'],
               'dimensions': f'length {LEN:.2f} m, body diameter {2 * g.R_CYL:.2f} m, tail box {2 * (g.BOX_H + g.BOX_T):.2f} m square, fin span {2 * (g.FIN[1][1] + 0.0025):.2f} m (diagonal)',
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'glb': 'bomb1000_sketchfab.glb'},
    notes=f'Ревизия 1 (2026-11-03): по ref_03 (фото сбоку, главная: профиль, проушины, пояса, трафарет) и ref_02 (3/4 сзади: устройство коробчатого стабилизатора); ref_01 — прежняя модель игры, только общая форма. '
          f'Длина {LEN} м (прежняя w_bomb1000 — 1,867 м), Ø 0,48. Окраска «{PAINT}» (выбор Mark: 2 — музейная серо-оливковая), жёлтые пояса, чёрный трафарет по ref_03 на обоих бортах. '
          'Домыслено: перья крестом × проходят через углы квадратной коробки и выходят за неё с отогнутой кромкой; коробка 0,26 м уже втулки (по ref_03), U-вырезы спереди всех четырёх стенок. '
          f'Крыльчатки vane_nose (4 лопасти) и vane_tail (8 лопастей) — отдельные объекты, начало на оси, оборот 360° без касаний (_collide.py). Для игры — цвет {GAME_TEX} (JPEG) и нормали {GAME_NTEX} (PNG), для Sketchfab — {SKETCH_TEX}.')
R['model']['length_m'] = LEN
json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
yn, yt = g.Yb(g.A_VN), g.Yb(g.A_VT)
pj['parts'] = {                                         # оси glTF: нос −Z, проушины +Y; вращение крыльчаток — вокруг продольной оси (Z узла)
    'vane_nose': {'pivot_gltf': [0.0, 0.0, round(-yn, 4)], 'axis': 'z', 'range_deg': [0, 360], 'note': 'крыльчатка носового взрывателя, в файле угол 0'},
    'vane_tail': {'pivot_gltf': [0.0, 0.0, round(-yt, 4)], 'axis': 'z', 'range_deg': [0, 360], 'note': 'крыльчатка хвостового взрывателя внутри коробки, в файле угол 0'}}
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
