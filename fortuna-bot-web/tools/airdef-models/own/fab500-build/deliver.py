# ФАБ-500М-62 — проверка и сдача: силуэт в кадре чертежа, статистика, превью, экспорт, паспорт. Запускается ПОСЛЕ build.py и bake.py в том же Blender:
#   FAB_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Дальше в терминале — наложение силуэта на чертёж, число запишется в отчёт:
#   K=/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit ; F="<папка модели>"
#   /usr/bin/python3 -I $K/compare.py "$F/_измерения/4_для_силуэта.png" "$F/проверка-чертежей/m_бок.png" "$F/проверка-чертежей/наложение_бок.png" 3 --report "$F/ОТЧЁТ.json" --view бок
# Уровень 2 (игра, без записи в репозиторий): deno run -A …/tools/airdef-models/preview-candidate.js w_fab500 "$F/fab500.glb" --out "$F/превью-игра" --tex 512 --ntex 512 --weapon fab500
import os, sys, json
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk

OUT = os.environ.get('FAB_OUT')
if not OUT: raise SystemExit('Задай FAB_OUT=<папка модели>: сюда пишутся превью, экспорт и паспорт')
CHK = OUT + '/проверка-чертежей'
GAME_TEX, GAME_NTEX = int(os.environ.get('FAB_GAME_TEX', '512')), int(os.environ.get('FAB_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('FAB_TEX', '2048'))
sc = bpy.data.scenes['FAB500']
st = mk.stats()

# уровень 1: силуэт сбоку в кадре _измерения/4_для_силуэта.png (552 × 125, нос слева, ось на y = 60)
mk.silhouette_side(CHK + '/m_бок.png', (552, 125), (552 / 2, 125 / 2))

L = st['length_m']; c = Vector((0.0, 0.0, 0.0))
prev = [os.path.basename(p) for p in mk.previews(OUT, views=[
    ('превью_1_общий.png', c, (-0.75, 0.85, 0.5), 1.45 * L),
    ('превью_2_сбоку.png', c, (-1.0, 0.0, 0.04), 1.25 * L),
    ('превью_3_хвост.png', Vector((0.0, -0.95, 0.0)), (0.85, -1.0, 0.45), 1.5),
    ('превью_4_голова.png', Vector((0.0, 0.75, 0.0)), (-0.85, 0.9, 0.35), 1.3)])]
os.makedirs(OUT + '/снимки', exist_ok=True)
mk.previews(OUT + '/снимки', size=(1600, 900), views=[
    ('стабилизатор_и_кольцо.png', Vector((0.0, -1.1, 0.0)), (0.7, -1.0, 0.5), 0.9),
    ('бандажи_и_ушки.png', Vector((0.0, 0.35, 0.1)), (-0.9, 0.35, 0.55), 0.9),
    ('трафарет.png', Vector((0.0, 0.40, 0.0)), (1.0, 0.0, 0.0), 0.7)])

mk.export(OUT + '/fab500_sketchfab.glb', None)
lc = bpy.data.images.load(OUT + f'/fab500_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + f'/fab500_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith('F50_')]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'F50_normal' else lc
mk.export(OUT + '/fab500.glb', OUT + '/fab500.blend')
mk.passport(OUT + '/ПАСПОРТ.json', key='w_fab500', weapon='fab500', name='ФАБ-500М-62', name_en='FAB-500 M-62', glb='fab500.glb', blend='fab500.blend', rev=1,
    build=['build.py', 'bake.py', 'deliver.py', 'fab_bomb.py'], previews_=prev,
    sketchfab={'title': 'FAB-500 M-62 Soviet Aviation Bomb — Low Poly, Textured',
               'lead': 'FAB-500 M-62 — Soviet 500 kg high-explosive free-fall aviation bomb with an ogive nose and fuze, two steel suspension bands with lugs, a long tapered tail and a ring-type stabilizer. Hand-modelled low-poly exterior with baked paint wear, rust at the edges, a stencilled designation and a normal map.',
               'parts': ['fuze', 'ogive nose', 'steel suspension bands with two lugs', 'tail strap with a latch', 'tapered tail tube', 'four stabilizer fins', 'stabilizer ring'],
               'tags': ['fab-500', 'fab500', 'bomb', 'aviation bomb', 'soviet', 'russian', 'military', 'weapon', 'aircraft', 'lowpoly', 'game-ready', 'textured', 'blender'],
               'dimensions': f"length {st['length_m']:.2f} m, body diameter {2 * mk.RB * mk.S:.2f} m, stabilizer ring diameter 0.55 m",
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'glb': 'fab500_sketchfab.glb'},
    notes='Ревизия 1 (2026-10-22): по техническому чертежу ФАБ-500М-62Т (4_чертёж…png, главный: контур, проушины, стабилизатор), инфографике (5) и рендеру (3, только детали бандажей и кольца; меши свои). Длина 2,45 м (прежняя w_fab500 — 2,47 м, это была ФАБ-500М-54). '
          'Кольцевой стабилизатор: четыре трапециевидных крыла «+» (одно вверх, к ушкам) и стальной обруч по их концам. Трафарет «ФАБ-500М-62» — на бортах между бандажами; цифры партии с рендера не выдуманы. '
          f'Для игры — цвет {GAME_TEX} (JPEG) и нормали {GAME_NTEX} (PNG), для Sketchfab — {SKETCH_TEX}. Нос в −Z осей glTF, ушки вверх (+Z).')
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
