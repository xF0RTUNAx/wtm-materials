# Х-101 - проверка и сдача: силуэт в кадре снимка сбоку, превью, экспорт, паспорт и отчёт. Mark: «С зелёной вставкой». Запускается ПОСЛЕ build.py, _collide.py и bake.py:
#   K101_OUT="<папка>" K101_PAINT=зелёная /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python _collide.py --python bake.py --python deliver.py
# Уровень 2: deno run -A tools/airdef-models/preview-candidate.js w_kh101 "$F/kh101.glb" --out "$F/превью-игра" --tex 1024 --ntex 512
# Файл для игры: крылья сложены, гондола выпущена. Файл для Sketchfab: крылья раскрыты, как на рендере.
import os, sys, json, math
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk

OUT = os.environ.get('K101_OUT')
if not OUT: raise SystemExit('Задай K101_OUT=<папка модели>')
CHK = OUT + '/проверка-чертежей'; os.makedirs(CHK, exist_ok=True)
GAME_TEX, GAME_NTEX = int(os.environ.get('K101_GAME_TEX', '1024')), int(os.environ.get('K101_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('K101_TEX', '2048'))
sc = bpy.data.scenes['KH101']; bpy.context.view_layer.update()
st = mk.stats()
G = mk.GEO
objs = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
LEN = round(mx.y - mn.y, 3)
print('габариты сложенной в мире:', [round(v, 3) for v in mn], [round(v, 3) for v in mx], 'длина', LEN)
mk.silhouette_side(CHK + '/m_бок.png', (680, 381), (357.5 - 17.5, 202.0 - 11.5))  # кадр сдвинут так, что ось попадает в y = 202 референс_3

BG = (0.34, 0.36, 0.40)
W1, W2 = bpy.data.objects['wing1'], bpy.data.objects['wing2']
A = math.radians(G['WING_OPEN'])
W1.rotation_euler = (0, 0, A); W2.rotation_euler = (0, 0, -A); bpy.context.view_layer.update()
prev = [os.path.basename(p) for p in mk.previews(OUT, bg=BG, views=[('превью_1_общий.png', Vector((0, 0.0, -0.15)), (-0.60, 0.60, 0.52), 10.8)])]
mk.previews(OUT + '/снимки' if os.makedirs(OUT + '/снимки', exist_ok=True) is None else OUT, size=(1600, 900), bg=BG, views=[
    ('крылья_раскрыты_сверху.png', Vector((0, 0.0, 0.0)), (0.0001, 0.0001, 1.0), 10.5),
    ('корень_крыла_снизу.png', Vector((-0.30, 0.65, -0.33)), (-0.55, 0.45, -0.72), 1.9),
    ('как_в_полёте.png', Vector((0, 0.1, 0.0)), (-0.62, 0.72, -0.10), 11.0)])
mk.export(OUT + '/kh101_sketchfab.glb', None)
W1.rotation_euler = (0, 0, 0); W2.rotation_euler = (0, 0, 0); bpy.context.view_layer.update()
prev += [os.path.basename(p) for p in mk.previews(OUT, bg=BG, views=[
    ('превью_2_сбоку.png', Vector((0, 0.0, -0.1)), (-1.0, 0.0, 0.03), 11.4),
    ('превью_3_хвост.png', Vector((0, -2.8, -0.25)), (-0.70, 0.45, 0.25), 3.2),
    ('превью_4_голова.png', Vector((0, 2.3, 0.0)), (-0.72, 0.60, 0.36), 2.9)])]
mk.previews(OUT + '/снимки', size=(1600, 900), bg=BG, views=[
    ('сложены_снизу.png', Vector((0, 0.0, -0.3)), (-0.45, 0.25, -0.86), 4.6),
    ('нос_надписи.png', Vector((0, 2.3, 0.05)), (-0.80, 0.30, 0.30), 2.0),
    ('гондола_вентилятор.png', Vector((0, -2.0, -0.62)), (-0.32, 0.92, -0.05), 1.5),
    ('зелёная_вставка.png', Vector((0, 0.3, 0.0)), (-0.85, 0.20, 0.30), 2.8)])
lc = bpy.data.images.load(OUT + f'/kh101_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + f'/kh101_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith('K101_') and m.node_tree]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'K101_normal' else lc
mk.export(OUT + '/kh101.glb', OUT + '/kh101.blend')

col = {}
try: col = json.load(open(os.path.join(OUT, '_live', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога _collide.py:', e)
tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
SPAN_OPEN = 2 * (25.2 * mk.S + 180.0 * mk.S * math.sin(A))
R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_kh101', weapon='kh101', name='Х-101', name_en='Kh-101', glb='kh101.glb', blend='kh101.blend', rev=1,
    build=['build.py', '_collide.py', 'bake.py', 'deliver.py'], previews_=prev,
    checks={'collisions': col, 'silhouette_iou': {'бок': 'не считается: снимок в перспективе и с фоном, наложение глазами'}, 'color': 'зелёный вариант: серые части #9fa8b6, на рендере #a3b1c7; в игре на солнце светлее'},
    sketchfab={'title': 'Kh-101 Cruise Missile - Textured',
               'lead': 'Kh-101, Russian air-launched cruise missile. Grey paint with a green mid-section, seams, rivets, hatches and own markings. Wings, engine nacelle with its pylon, fan, fin and two stabilizers are separate parts with pivots on their real axes. In this file the wings are open; they fold back under a flat belly.',
               'parts': ['nose and body sections', 'side fairings', 'flat belly', 'two folding wings', 'engine nacelle with pylon', 'fan', 'fin', 'two stabilizers', 'two suspension lugs'],
               'tags': ['kh-101', 'kh101', 'cruise missile', 'missile', 'air-launched', 'russian', 'military', 'weapon', 'aircraft', 'game-ready', 'textured', 'blender'],
               'dimensions': f'length {LEN:.2f} m, body diameter {2 * mk.RB * mk.S:.2f} m, wing span about {SPAN_OPEN:.1f} m',
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'based': 'Built from scratch in Blender from reference photos.',
               'glb': 'kh101_sketchfab.glb'},
    notes=f'Ревизия 1 (2026-11-04): форма по снимкам и схеме, окраска по рендеру (Mark: «С зелёной вставкой»). Корень крыла после замечания Mark соединён с плоским низом. Надписи выдуманы. Ходы рулей и гондолы выбраны сборщиком, на картинках их нет; раскрытие крыльев снято со схемы. Модель {tris} тр. при ориентире 6 тыс.')
R['model']['length_m'] = LEN; R['model']['span_m'] = round(mx.x - mn.x, 3); R['model']['height_m'] = round(mx.z - mn.z, 3)
json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
pj['axes'] = 'glTF: нос -Z, верх +Y (упоры), начало на оси корпуса посередине длины; в файле крылья сложены назад, гондола выпущена, все углы 0'
parts = {}
for k, sgn in ((1, 1.0), (2, -1.0)):
    parts[f'wing{k}'] = dict(pivot_gltf=G2(mk.WING[k]['o']), axis_gltf=[0.0, 1.0, 0.0], open_deg=sgn * G['WING_OPEN'], folded_deg=0.0, note='вертикальная ось у корня по передней кромке; поворот вокруг +Y glTF, стреловидность раскрытого ≈ 32°')
parts['nacelle'] = dict(pivot_gltf=G2(mk.O_NAC), axis_gltf=[1.0, 0.0, 0.0], range_deg=[-180.0, 0.0], out_deg=0.0, stowed_deg=-180.0, note='0 - выпущена (в файле). Отрицательный угол вокруг +X glTF уводит заднюю часть вверх и вперёд; при -180 целиком внутри корпуса. Свободно только до -10: отсека и люка в модели нет, дальше проходит сквозь обшивку')
parts['fan'] = dict(pivot_gltf=G2(mk.O_FAN), axis_gltf=[0.0, 0.0, -1.0], note='вентилятор, ось гондолы, вращение без предела; при уборке движется вместе с nacelle')
for n in ('fin', 'stab1', 'stab2'):
    parts[n] = dict(pivot_gltf=G2(mk.PARTS[n]['o']), axis_gltf=G2(mk.PARTS[n]['axis']), range_deg=[-G['RUD_RANGE'], G['RUD_RANGE']], note='радиальная ось; ход выбран сборщиком')
pj['parts'] = parts
pj['fixed'] = 'K101_body, K101_fixed (наплывы, плоский низ, упоры) - неподвижны'
xn, cz, rn = G['NOZZLE']
pj['nozzle_gltf'] = [0.0, round(cz * mk.S, 4), round(-mk.Y(xn), 4)]
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT, 'сопло', pj['nozzle_gltf'], 'тр.', tris)
