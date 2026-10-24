# deliver.py — проверка и сдача Х-55 / Х-555: статистика, превью, крупные планы, экспорт, паспорт. Запускается ПОСЛЕ build.py и bake.py в том же Blender:
#   K55_OUT="<папка модели>" [K55_VARIANT=kh555] /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Уровень 1: сначала sil.py (силуэты в кадрах чертежей), затем compare.py (команды в шапке sil.py). Уровень 2 (игра, без записи в репозиторий):
#   deno run -A …/tools/airdef-models/preview-candidate.js w_kh555 "<папка>/kh55.glb" --out "<папка>/превью-игра" --tex 512 --ntex 512 --weapon kh55      (ключ в игре общий — w_kh555; для Х-555 — kh555.glb и --weapon kh555)
import os, sys, json
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk

OUT = os.environ.get('K55_OUT')
if not OUT: raise SystemExit('Задай K55_OUT=<папка модели>: сюда пишутся превью, экспорт и паспорт')
V = os.environ.get('K55_VARIANT', 'kh555')
PX = dict(kh55=dict(key='w_kh55', weapon='kh55', name='Х-55', name_en='Kh-55', scene='KH55', base='kh55'),
          kh555=dict(key='w_kh555', weapon='kh555', name='Х-555', name_en='Kh-555', scene='KH555', base='kh555'))[V]
BASE = PX['base']
GAME_TEX, GAME_NTEX = int(os.environ.get('K55_GAME_TEX', '512')), int(os.environ.get('K55_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('K55_TEX', '2048'))
sc = bpy.data.scenes[PX['scene']]
st = mk.stats()

L = st['length_m']; c = Vector((0.0, 0.0, 0.0))
prev = [os.path.basename(p) for p in mk.previews(OUT, views=[
    ('превью_1_общий.png', c, (-0.75, 0.85, 0.5), 1.45 * L),
    ('превью_2_сбоку.png', c, (-1.0, 0.0, 0.04), 1.4 * L),
    ('превью_3_хвост.png', Vector((0.0, -2.35, 0.0)), (0.8, -1.0, 0.45), 0.45 * L),
    ('превью_4_голова.png', Vector((0.0, 2.3, 0.0)), (-0.8, 0.9, 0.35), 0.40 * L)])]
os.makedirs(OUT + '/снимки', exist_ok=True)
mk.previews(OUT + '/снимки', size=(1600, 900), views=[
    ('нос_полоса.png', Vector((0.0, 2.55, -0.08)), (-0.75, 0.6, -0.35), 1.7),
    ('хвост_оперение.png', Vector((0.0, -2.45, 0.1)), (0.8, -0.9, 0.5), 2.0),
    ('гондола_снизу.png', Vector((0.0, -2.0, -0.45)), (-0.7, -0.4, -0.7), 1.9),
    ('крыло_корень.png', Vector((0.45, 0.35, 0.0)), (-0.3, 0.2, 1.0), 2.2),
    ('люки_сверху.png', Vector((0.0, 0.7, 0.25)), (0.0, -0.001, 1.0), 3.4),
    ('низ_люки.png', Vector((0.0, 0.5, -0.27)), (0.0, 0.001, -1.0), 3.0)])

mk.export(OUT + f'/{BASE}_sketchfab.glb', None)
lc = bpy.data.images.load(OUT + f'/{BASE}_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + f'/{BASE}_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith('K55_')]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'K55_normal' else lc
mk.export(OUT + f'/{BASE}.glb', OUT + f'/{BASE}.blend')
tanks = V == 'kh555'
mk.passport(OUT + '/ПАСПОРТ.json', key=PX['key'], weapon=PX['weapon'], name=PX['name'], name_en=PX['name_en'], glb=f'{BASE}.glb', blend=f'{BASE}.blend', rev=1,
    build=['build.py', 'bake.py', 'deliver.py', 'kh55_geo.py'], previews_=prev,
    sketchfab={'title': f"{PX['name_en']} Air-Launched Cruise Missile — Low Poly, Textured",
               'lead': ('Air-launched cruise missile with two conformal tanks along the lower flanks: ' if tanks else 'Air-launched cruise missile: ') +
                       'elliptical nose, cylindrical body with panel joints and hatches, swept wings with rounded tips (deployed), a tail fin and two tailplanes, and a retractable engine nacelle under the tail on a pylon. '
                       'Hand-modelled low-poly exterior with baked paint wear, soot and a normal map.',
               'parts': ['elliptical nose', 'cylindrical body with panel joints'] + (['two conformal tanks'] if tanks else []) + ['two swept wings', 'tail fin and two tailplanes', 'engine nacelle with pylon', 'hatches and brackets'],
               'tags': ['cruise missile', 'missile', 'weapon', 'military', 'russian', 'soviet', 'lowpoly', 'game-ready', 'textured', 'blender', PX['name_en'].lower()],
               'dimensions': f"length {st['length_m']:.2f} m, wingspan {st['span_m']:.2f} m",
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'glb': f'{BASE}_sketchfab.glb'},
    notes=f"Ревизия 1 (2026-10-24): по картинкам Mark (Свои/{'Х-555' if tanks else 'Х-55'}/): 1 — вид сверху (чертёж), 2 — два вида сбоку (чертёж), 6 — цветной трёхвид, 5 — силуэты Х-555 и Х-101. "
          f"Длина {st['length_m']:.2f} м — как у прежней модели в игре (6,04 м). Корпус вращением (эллиптический нос, цилиндр, лодочный хвост и хвостовой конус), два крыла и три плоскости оперения, гондола двигателя на пилоне, люки и кронштейны накладками"
          + ('; два конформных бака по нижним бортам (цветной трёхвид и силуэты Х-555).' if tanks else '.') +
          f" Для игры — цвет {GAME_TEX} (JPEG) и нормали {GAME_NTEX} (PNG), для Sketchfab — {SKETCH_TEX}. Нос в −Z осей glTF, киль вверх (+Z в Blender), гондола снизу. Цвета окраски — по картинкам, без точных RAL.")
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
