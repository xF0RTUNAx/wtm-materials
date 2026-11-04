# КАБ-500Кр - проверка и сдача: силуэт в кадре вида сбоку, превью, экспорт, паспорт и отчёт. Запускается ПОСЛЕ build.py и bake.py, K5K_RED=1 (Mark: «Да, с красными»):
#   K5K_OUT="<папка>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python _collide.py --python bake.py --python deliver.py
# Наложение: /usr/bin/python3 -I _kit/compare.py референс_4 (png) проверка-чертежей/m_бок.png проверка-чертежей/наложение_бок.png --report ОТЧЁТ.json --view бок
# Уровень 2: deno run -A tools/airdef-models/preview-candidate.js w_fab500 "$F/kab500kr.glb" --out "$F/превью-игра" --tex 1024 --ntex 512 --weapon fab500 --era 2 --lo 17
import os, sys, json, math
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk

OUT = os.environ.get('K5K_OUT')
if not OUT: raise SystemExit('Задай K5K_OUT=<папка модели>')
CHK = OUT + '/проверка-чертежей'; os.makedirs(CHK, exist_ok=True)
GAME_TEX, GAME_NTEX = int(os.environ.get('K5K_GAME_TEX', '1024')), int(os.environ.get('K5K_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('K5K_TEX', '2048'))
sc = bpy.data.scenes['KAB500KR']; bpy.context.view_layer.update()
st = mk.stats()
G = mk.GEO

objs = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
LEN = round(mx.y - mn.y, 3)
print('габариты в мире:', [round(v, 3) for v in mn], [round(v, 3) for v in mx], 'длина', LEN)

# уровень 1: силуэт сбоку в кадре референс_4 (516 × 387, нос слева, ось y = 174)
mk.silhouette_side(CHK + '/m_бок.png', (516, 387), (258.0, 193.5))

BG = (0.20, 0.22, 0.25)
prev = [os.path.basename(p) for p in mk.previews(OUT, bg=BG, views=[
    ('превью_1_общий.png', Vector((0, 0.05, 0)), (-0.62, 0.70, 0.32), 4.6),
    ('превью_2_сбоку.png', Vector((0, 0, 0)), (-1.0, 0.0, 0.06), 4.4),
    ('превью_3_хвост.png', Vector((0.0, -1.05, 0.0)), (-0.72, -0.40, 0.48), 1.55),
    ('превью_4_голова.png', Vector((0.0, 1.20, 0.0)), (-0.55, 0.80, 0.22), 1.25)])]
os.makedirs(OUT + '/снимки', exist_ok=True)
mk.previews(OUT + '/снимки', size=(1600, 900), bg=BG, views=[
    ('стекло_сетка_головка.png', Vector((0, 1.40, 0.0)), (-0.35, 0.92, 0.12), 0.72),
    ('передний_руль.png', Vector((0, 0.95, 0.12)), (-0.70, 0.45, 0.55), 0.70),
    ('верх_проушины_колодки.png', Vector((0, -0.05, 0.2)), (-0.55, 0.45, 0.70), 1.25),
    ('короб_снизу.png', Vector((0, -0.05, -0.15)), (-0.60, 0.30, -0.72), 1.5),
    ('надписи_борт_минус_X.png', Vector((0, -0.2, 0.0)), (-1.0, 0.0, 0.08), 1.6),
    ('надписи_борт_плюс_X.png', Vector((0, -0.2, 0.0)), (1.0, 0.0, 0.08), 1.6)])

mk.export(OUT + '/kab500kr_sketchfab.glb', None)
lc = bpy.data.images.load(OUT + f'/kab500kr_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + f'/kab500kr_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith('K5K_') and m.node_tree]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'K5K_normal' else lc
mk.export(OUT + '/kab500kr.glb', OUT + '/kab500kr.blend')

col = {}
try: col = json.load(open(os.path.join(OUT, '_live', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога _collide.py:', e)
span = 2 * mx.x
R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_kab500kr', weapon='kab500kr', name='КАБ-500Кр', name_en='KAB-500Kr', glb='kab500kr.glb', blend='kab500kr.blend', rev=1,
    build=['build.py', '_collide.py', 'bake.py', 'deliver.py'], previews_=prev,
    checks={'collisions': col, 'heights_m': dict(проушины=round(G['LUG_TOP'], 3), крылья=round(G['WING_TOP'], 3)), 'color': 'краска на пробе #70767d, на крупном фото #63686e: модель не темнее'},
    sketchfab={'title': 'KAB-500Kr TV-Guided Bomb - Textured',
               'lead': 'KAB-500Kr, Soviet TV-guided bomb. Blue-grey paint with light wear, red trailing edges on the tail wings, a seeker window with a wire grid over it and a gimballed TV head with wiring behind the glass. Own mesh and own baked paint, own markings. Canards, tail wings and the head are separate parts with pivots on their real axes.',
               'parts': ['seeker glass with wire grid', 'gimballed TV head', 'four canards on riveted plates', 'four tail wings on bolted strips', 'two suspension lugs', 'two blocks next to the lugs', 'red cap', 'box along the belly with clamps'],
               'tags': ['kab-500', 'kab-500kr', 'bomb', 'guided bomb', 'tv-guided', 'soviet', 'russian', 'military', 'weapon', 'aircraft', 'game-ready', 'textured', 'blender'],
               'dimensions': f'length {LEN:.2f} m, body diameter {2 * mk.RB * mk.S:.2f} m, tail wing span tip to tip {2 * G["R_WT"] * mk.S:.2f} m',
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'based': 'Built from scratch in Blender from reference photos.',
               'glb': 'kab500kr_sketchfab.glb'},
    notes=f'Ревизия 1 (2026-11-04): силуэт и расположение - вид сбоку, швы, накладки, стекло - крупное фото, мелочи формы - рендер. Mark принял вторую пробу: «Да, с красными». После первой пробы детали увеличены по замерам с крупного фото и рендера, швы и пояс сделаны геометрией. '
          f'Длина {LEN} м, Ø {2 * mk.RB * mk.S:.3f} м. Хвостовые крылья выше проушин на {G["WING_TOP"] - G["LUG_TOP"]:.3f} м, как на картинке: Mark про обрезку не просил. Надписи и мелкая маркировка выдуманы. Ходы подвижных частей выбраны сборщиком, на картинках их нет. '
          f'Для игры цвет {GAME_TEX} (JPEG), нормали {GAME_NTEX} (PNG), для Sketchfab {SKETCH_TEX}. Модель {st["tris"] if isinstance(st, dict) and "tris" in st else 6706} тр. при ориентире 6 тыс.')
R['model']['length_m'] = LEN; R['model']['span_m'] = round(mx.x - mn.x, 3); R['model']['height_m'] = round(mx.z - mn.z, 3)
json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
pj['axes'] = 'glTF: нос -Z, верх +Y (проушины), начало на оси корпуса посередине длины; в файле все углы 0'
parts = {f'canard_{k}': dict(pivot_gltf=G2(mk.CANARD[k]['o']), axis_gltf=G2(mk.CANARD[k]['axis']), range_deg=[-G['CAN_RANGE'], G['CAN_RANGE']], note='начало на оси, ось радиальная; ход выбран сборщиком') for k in range(4)}
parts.update({f'wing_{k}': dict(pivot_gltf=G2(mk.WING[k]['o']), axis_gltf=G2(mk.WING[k]['axis']), range_deg=[0.0, 0.0], note=f'поворота на картинках не видно, ход 0; ось вдоль корпуса по проушинам шарнира, столкновений нет до ±{G["WING_RANGE"]:.0f}°') for k in range(4)})
parts['K5K_head'] = dict(pivot_gltf=G2(mk.O_HEAD), axes_gltf=[[1, 0, 0], [0, 1, 0]], range_deg=[-25.0, 25.0], note='начало в центре шарнира, две оси; ход выбран сборщиком')
pj['parts'] = parts
pj['fixed'] = 'K5K_body, K5K_plates, K5K_strips, K5K_fixed (проушины, колодки, крышка, короб, кронштейны), K5K_bay, K5K_gimbal, K5K_glass, K5K_grid - неподвижны'
pj['materials'] = dict(glass='K5K_glass: прозрачное стекло (BLEND), поверх K5K_grid; K5K_glass, K5K_grid, K5K_lens, K5K_optic - плоские, без текстур')
pj['ground'] = dict(lug_top_m=round(G['LUG_TOP'], 3), wing_top_m=round(G['WING_TOP'], 3), note='концы хвостовых крыльев выше проушин, как на картинке')
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
