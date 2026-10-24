# AN/ALQ-131(V) — проверка и сдача: статистика, силуэт сбоку по чертежу 1, превью, крупные планы, экспорт, паспорт. Запускается ПОСЛЕ build.py и bake.py в том же Blender:
#   ALQ_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Силуэт: затем compare.py (команда ниже) — наложение на чертёж 1 и IoU в ОТЧЁТ.json:
#   /usr/bin/python3 -I …/own/_kit/compare.py "<папка модели>/1_профиль_ALQ-131V-12_чертёж.webp" "<папка модели>/проверка-чертежей/модель_бок.png" "<папка модели>/проверка-чертежей/наложение_бок.png" --report "<папка модели>/ОТЧЁТ.json" --view side
# Уровень 2 (игра, без записи в репозиторий): deno run -A …/tools/airdef-models/preview-candidate.js w_ecm_w "$F/alq131.glb" --out "$F/превью-игра" --tex 512 --ntex 512 --weapon ecm_w
import os, sys, json, math
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk
import alq_pod as ap

OUT = os.environ.get('ALQ_OUT')
if not OUT: raise SystemExit('Задай ALQ_OUT=<папка модели>: сюда пишутся превью, экспорт и паспорт')
GAME_TEX, GAME_NTEX = int(os.environ.get('ALQ_GAME_TEX', '512')), int(os.environ.get('ALQ_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('ALQ_TEX', '2048'))
sc = bpy.data.scenes['ALQ131']
st = mk.stats()

# силуэт сбоку в кадре чертежа 1 (2000 × 952, центр кадра — пиксель (1000, 476)): модель смотрит со стороны −X, нос слева
os.makedirs(OUT + '/проверка-чертежей', exist_ok=True)
sil = mk.silhouette_side(OUT + '/проверка-чертежей/модель_бок.png', (2000, 952), (1000, 476))

# превью: мягкое солнце (угол побольше — тень без «ступенек» от карты теней)
if bpy.data.objects.get('ALQ131_sun') is None:
    sd = bpy.data.lights.new('ALQ131_sun', 'SUN'); so = bpy.data.objects.new('ALQ131_sun', sd); mk.col.objects.link(so)
bpy.data.objects['ALQ131_sun'].data.angle = 0.12
L = st['length_m']; c = Vector((0.0, 0.0, 0.0))
prev = [os.path.basename(p) for p in mk.previews(OUT, views=[
    ('превью_1_общий.png', c, (-0.62, 0.80, 0.42), 1.62 * L),
    ('превью_2_сбоку.png', c, (-1.0, 0.0, 0.04), 1.50 * L),
    ('превью_3_хвост.png', Vector((0.0, -0.85, 0.0)), (0.85, -1.0, 0.42), 1.55),
    ('превью_4_голова.png', Vector((0.0, 0.85, 0.0)), (-0.85, 0.9, 0.35), 1.45)])]
os.makedirs(OUT + '/снимки', exist_ok=True)
mk.previews(OUT + '/снимки', size=(1600, 900), views=[
    ('трафарет_USAF.png', Vector((-0.15, -0.05, 0.02)), (-1.0, 0.0, 0.0), 0.9),
    ('нос_ромб_кольцо.png', Vector((0.0, 0.92, 0.0)), (-0.9, 0.6, 0.15), 0.85),
    ('нос_спереди_справа.png', Vector((0.0, 0.8, 0.0)), (0.85, 0.9, 0.3), 1.2),
    ('хвост_люк_ромб.png', Vector((0.0, -0.9, 0.02)), (-0.9, -0.55, 0.12), 0.9),
    ('верх_проушины.png', Vector((0.0, -0.05, 0.25)), (-0.45, 0.25, 1.0), 1.25),
    ('низ_брюхо.png', Vector((0.0, -0.05, -0.28)), (-0.5, 0.45, -0.75), 1.4),
    ('правый_борт.png', Vector((0.0, 0.0, 0.0)), (1.0, 0.0, 0.04), 1.9)])

mk.export(OUT + '/alq131_sketchfab.glb', None)
lc = bpy.data.images.load(OUT + f'/alq131_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + f'/alq131_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith('ALQ_')]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'ALQ_normal' else lc
mk.export(OUT + '/alq131.glb', OUT + '/alq131.blend')
S = mk.S
top_hull = (ap.YC - 408.0) * S; top_lug = (ap.YC - 371.0) * S; bottom = (ap.YC - 794.0) * S
dims = f"length {st['length_m']:.2f} m, width {st['span_m']:.2f} m, height {st['height_m']:.2f} m"
mk.passport(OUT + '/ПАСПОРТ.json', key='w_ecm_w', weapon='ecm_w', name='Станция помех AN/ALQ-131', name_en='AN/ALQ-131 ECM Pod', glb='alq131.glb', blend='alq131.blend', rev=1,
    build=['build.py', 'bake.py', 'deliver.py', 'alq_pod.py', 'alq_sheet.py'], previews_=prev,
    sketchfab={'title': 'AN/ALQ-131(V) ECM Pod (USAF, deep) — Low Poly, Textured',
               'lead': 'AN/ALQ-131(V) electronic countermeasures (ECM) pod of the USAF in the deep two-section configuration, as carried under an A-10: a boxy body with two removable side panels, a dark nose radome on a clamped collar, a rear antenna nacelle, a stepped lower fairing and two suspension lugs on top. Hand-modelled low-poly exterior with baked paint wear, stencils and a normal map.',
               'parts': ['dark nose radome with its collar and clamp band', 'boxy two-section body with removable side panels', 'sloped chin and front hatch', 'rear transition and blunt antenna nacelle', 'deep lower fairing', 'two suspension lugs with base plates and nuts, connector block and two lids on top', 'small mounting pin under the nose collar'],
               'tags': ['alq-131', 'ecm', 'jammer', 'electronic warfare', 'pod', 'usaf', 'a-10', 'military', 'weapon', 'aircraft', 'lowpoly', 'game-ready', 'textured', 'blender'],
               'dimensions': dims,
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'glb': 'alq131_sketchfab.glb'},
    notes='Ревизия 1 (2026-10-24): по картинкам Mark — профиль-чертёж «USAF AN/ALQ-131(V)-12» (1_…webp; силуэт, высоты, положения панелей, крышек, проушин, заклёпок, трафаретов), фото под A-10 (2_…png), '
          'схемы окраски Uprise / RESKIT / Eduard (3, 4, 8, 9), рендер до/после (5) — только раскладка, рендер 3/4 (6) — только форма, схема модулей (7). '
          f'Длина {st["length_m"]:.2f} м — как у прежней модели ELTA 8222 (2,402 м); масштаб 1720 пикс. чертежа = 2,40 м. Высота {st["height_m"]:.2f} м с проушинами; ширина (X) ≈ {st["span_m"]:.2f} м — ОЦЕНКА по видам в 3/4 (на чертеже сбоку не видна). '
          f'Для hang в META: от центра (начало координат) до верха коробки {top_hull:.3f} м, до кончиков проушин {top_lug:.3f} м, до низа брюшного обтекателя {-bottom:.3f} м; начало — середина длины и середина высоты (проушины — вверх, +Z). '
          'Нос (острый тёмный обтекатель) — в −Z осей glTF (+Y в Blender), левый борт −X, правый +X. '
          f'Для игры — цвет {GAME_TEX} (JPEG) и нормали {GAME_NTEX} (PNG), для Sketchfab — {SKETCH_TEX}. Трафареты USAF AN/ALQ-131(V)-12 и DO NOT PAINT — растровым шрифтом по листам alq_sheet.py (обе стороны), красные ромбы WARNING — свои, нарисованы кодом. '
          'Пропущено: мелкие надписи TORQUE PANEL FASTENERS / ACCESS PANEL (нечитаемы при 512), синий клапан у шеи, «капот» с воздухозаборником над шеей и рама окна над хвостовой гондолой — только общим объёмом, цифры серийного номера. '
          'Файл для игры ≈ 0,38 МБ (геометрия ≈ 0,15 + текстуры 512 ≈ 0,24): критерий «≈ 200 КБ» — для модели без текстур; у других своих моделей в игре 0,16…0,78 МБ.')
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
# по просьбе основного чата (для hang в META): только числа посадки, без описания формы
pj['notes'] = (f"нос — в −Z осей glTF (+Y в Blender), проушины под пилон — вверх; начало — середина длины и середина высоты; длина {st['length_m']:.2f} м, ширина {st['span_m']:.2f} м, высота {st['height_m']:.2f} м; "
               f"центр → верх коробки {top_hull:.3f} м, центр → кончики проушин {top_lug:.3f} м, центр → низ брюха {-bottom:.3f} м")
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
