# ФАБ-1000 — проверка и сдача: силуэт в кадре фото, статистика, превью, экспорт, паспорт и отчёт. Запускается ПОСЛЕ build.py и bake.py в том же Blender:
#   F1K_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Наложение силуэта на фото (проверка-чертежей/наложение_*.png) — глазами: картинки — фото в перспективе, IoU по ним не считается (README: IoU — только для чертежей).
# Уровень 2 (игра, без записи в репозиторий):
#   deno run -A /Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/preview-candidate.js w_fab1000 "$F/fab1000.glb" --out "$F/превью-игра" --tex 1024 --ntex 512 --weapon fab1000
import os, sys, json
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk

OUT = os.environ.get('F1K_OUT')
if not OUT: raise SystemExit('Задай F1K_OUT=<папка модели>: сюда пишутся превью, экспорт и паспорт')
CHK = OUT + '/проверка-чертежей'
GAME_TEX, GAME_NTEX = int(os.environ.get('F1K_GAME_TEX', '1024')), int(os.environ.get('F1K_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('F1K_TEX', '2048'))
sc = bpy.data.scenes['FAB1000']
st = mk.stats()
G = mk.GEO

# уровень 1: силуэт сбоку в кадре ref_01 (2000 × 1333, нос слева)
mk.silhouette_side(CHK + '/m_бок_ref01.png', (2000, 1333), (1000, 666.5))

L = st['length_m']; c = Vector((0.0, 0.0, 0.0))
prev = [os.path.basename(p) for p in mk.previews(OUT, views=[
    ('превью_1_общий.png', Vector((0, 0.1, 0)), (-0.75, 0.80, 0.45), 1.3 * L),
    ('превью_2_сбоку.png', c, (-1.0, 0.0, 0.04), 1.2 * L),
    ('превью_3_хвост.png', Vector((0.0, -1.15, 0.02)), (-0.75, -0.75, 0.55), 1.75),
    ('превью_4_голова.png', Vector((0.0, 1.0, 0.0)), (-0.8, 0.75, 0.30), 1.6)])]
os.makedirs(OUT + '/снимки', exist_ok=True)
mk.previews(OUT + '/снимки', size=(1600, 900), views=[
    ('хвостовое_гнездо_и_вырез.png', Vector((0.0, -0.97, 0.0)), (-0.55, -0.85, 0.35), 0.8),
    ('пояс_головок.png', Vector((0.0, 0.92, 0.1)), (-0.9, 0.25, 0.5), 0.8),
    ('проушины.png', Vector((0.0, -0.30, 0.05)), (-0.85, 0.15, 0.25), 0.75),
    ('раскосы_снизу.png', Vector((0.0, -1.1, -0.05)), (-0.6, -0.5, -0.65), 1.4),
    ('нос_гнездо.png', Vector((0.0, 1.62, 0.0)), (-0.4, 0.9, 0.2), 0.45)])

mk.export(OUT + '/fab1000_sketchfab.glb', None)
lc = bpy.data.images.load(OUT + f'/fab1000_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + f'/fab1000_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith('F1K_')]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'F1K_normal' else lc
mk.export(OUT + '/fab1000.glb', OUT + '/fab1000.blend')
span = 2 * G['R_TIP'] * mk.S
mk.passport(OUT + '/ПАСПОРТ.json', key='w_fab1000', weapon='fab1000', name='ФАБ-1000', name_en='FAB-1000', glb='fab1000.glb', blend='fab1000.blend', rev=1,
    build=['build.py', 'bake.py', 'deliver.py'], previews_=prev,
    sketchfab={'title': 'FAB-1000 Soviet Aviation Bomb — Textured',
               'lead': 'FAB-1000 — Soviet 1000 kg high-explosive free-fall bomb, modelled after a museum example: blunt ogive nose with an empty fuze well, a belt of domed heads, two plate lugs and a box-type stabilizer of four braced fins. Light grey museum paint with baked wear, rust specks and a normal map.',
               'parts': ['nose with empty fuze well', 'belt of 12 domed heads', 'two plate lugs', 'tail fuze well with bolted flange', 'four fins with a cut-out at the tail cone', 'riveted root angles', 'eight braces'],
               'tags': ['fab-1000', 'fab1000', 'bomb', 'aviation bomb', 'soviet', 'russian', 'military', 'weapon', 'aircraft', 'game-ready', 'textured', 'blender'],
               'dimensions': f"length {st['length_m']:.2f} m, body diameter {2 * mk.RB * mk.S:.2f} m, stabilizer span {span:.2f} m",
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'glb': 'fab1000_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-03): по трём фото Mark одного музейного экземпляра (ref_01 сбоку — главная, ref_02 3/4 спереди, ref_03 3/4 сзади). Длина 3,35 м по прежней модели игры; '
          f'Ø корпуса по фото {2 * mk.RB * mk.S:.2f} м (у прежней 0,67). Окраска — светло-серая, как на фото (Mark: «1 — серая»), без надписей. Гнёзда взрывателей пустые, как на фото. '
          'Подвижных частей нет. Вторая проушина — на борту ≈ 25° ниже горизонтали, как на ref_01. '
          f'Для игры — цвет {GAME_TEX} (JPEG) и нормали {GAME_NTEX} (PNG), для Sketchfab — {SKETCH_TEX}. Нос в −Z осей glTF, верхняя проушина вверх (+Y glTF).')
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
