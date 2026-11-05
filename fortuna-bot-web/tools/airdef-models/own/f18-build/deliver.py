# deliver.py - сдача F/A-18E: превью, файл для Sketchfab и .blend (со стойками), файл игры (без стоек, створки закрыты), файл шасси для ангара, паспорт и отчёт. После build.py:
#   F18_DIR="<папка модели>" F18_STAGE=4 F18_TEX=4096 Blender -b --factory-startup --python build.py --python deliver.py
# Карты f18_color.png, f18_normal.png, f18_orm.png лежат в папке модели (paint.py, F18_OUT=папка модели). Развёртка - _проба/uv.npz.
import json, math, os, sys
HERE = os.environ['F18_DIR']; sys.path.insert(0, HERE); os.environ['F18_MAPS'] = HERE; os.environ['F18_OUT'] = HERE; os.environ['F18_ONLY'] = '__никакой__'; os.environ.setdefault('F18_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 1.0, 0.3), (0.52, 0.72, 0.46), 29.0), ('превью_2_сбоку.png', (0.0, 0.0, 0.5), (-1.0, 0.0, 0.08), 24.0), ('превью_3_сверху.png', (0.0, 0.0, 0.3), (0.05, -0.05, 1.0), 26.0),
                         ('превью_4_хвост.png', (0.0, -1.0, 0.6), (0.34, -0.78, 0.40), 23.0), ('превью_5_кабина.png', (0.0, 4.4, 1.0), (0.62, 0.62, 0.48), 6.5), ('превью_6_снизу.png', (0.0, 0.0, -0.4), (0.42, 0.28, -0.86), 25.0)):
    shot(nm, tg, dv, dist, wd=1920, h=1080); prev.append(nm)
print('превью', prev)
ms = [o for o in sc.objects if o.type == 'MESH']; vl.update()
pts = [o.matrix_world @ v.co for o in ms for v in o.data.vertices]; mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
LEN, SPAN, HGT = round(mx.y - mn.y, 3), round(mx.x - mn.x, 3), round(mx.z - mn.z, 3)
for c_ in ('v_cam', 'v_sun'):
    o_ = bpy.data.objects.get(c_)
    if o_ is not None: bpy.data.objects.remove(o_)
vl.update()
col = {}
try: col = json.load(open(os.path.join(HERE, '_снимки', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога хода:', e)
sty = {}
try:
    D_ = json.load(open(os.path.join(HERE, '_стыки', '_стыки.json'), encoding='utf-8'))['детали']; sty = {k: v['плохо'] for k, v in D_.items() if v.get('плохо')}
except Exception as e: print('нет итога стыков:', e)
mk.export(os.path.join(HERE, 'f18_sketchfab.glb'), os.path.join(HERE, 'f18.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'f18_sketchfab.glb')) // 1024, 'КБ')
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
# отчёт и основа паспорта: пока в сцене все детали
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='f18', weapon='', name='F/A-18E', name_en='F/A-18E Super Hornet', glb='f18.glb', blend='f18.blend', rev=1,
    build=['build.py', 'f18_geo.py', 'f18_detail.py', 'f18_gear.py', 'uv_f18.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'стыки': dict(плохо=sty, разбор='стабилизатор: щель снизу в основном 1,9 см, у сопла до 7 см, нужен ход; складка крыла 1 см, отметка 17 см - уступ передней кромки; фонарь и рама козырька - край кабины, на крупном плане щели нет; гак - его конец отдельно'), 'silhouette_iou': {'бок': 'наложение на фото 07 и 14, сверху и снизу на выпрямленный вид фото 06 (_снимки)'}, 'game': 'игра: ангар и бой, день и вечер, ошибок страницы нет (_проба/стенд); на телефоне не проверено'},
    sketchfab={'title': 'F/A-18E Super Hornet - Game-Ready Jet', 'lead': 'F/A-18E Super Hornet single-seat carrier fighter in navy grey. Moving parts on their own pivots: stabilisers, rudders, flaps, ailerons, slats, wing fold, LEX spoilers, canopy, refuelling probe, arresting hook and landing gear. Detailed cockpit, nozzles with petals, intakes with a visible fan. PBR maps with panel tones, rivets and soot.',
               'parts': ['airframe', 'fins and rudders', 'stabilisers', 'flaps and ailerons', 'slats', 'wing fold', 'canopy', 'cockpit', 'intakes', 'nozzles', 'gear', 'pylons'],
               'tags': ['fa-18', 'super-hornet', 'f18', 'fighter', 'jet', 'aircraft', 'military', 'navy', 'game-ready', 'pbr', 'textured', 'blender'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'f18_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-06). Свои меши по фото fa18_01, 02, 03, 05, 06, 07, 14 (форма); fa18_08-12 только детали; fa18_04, 13 только планка качества. Пиксели картинок не использованы. Знаки нарисованы заново; номер 207, NX, VFA-199 и эмблема придуманные. Вентилятор стоит ближе и по центру проёма по просьбе Mark: на настоящем самолёте спереди его почти не видно. Карты: цвет без света, нормали по высоте, R затенение, G шероховатость, B металл.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# файл игры: без стоек, створки закрыты; файл шасси: только стойки и метки центра
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'f18.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'f18.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'f18_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'f18_gear.glb')) // 1024, 'КБ')
# паспорт: всё в осях игры (после центровки prepare.js, сдвиг по высоте cy)
cy = (MN_M[2] + MX_M[2]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-v.y, 3)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'f18_gear.glb'; P['gear_key'] = 'f18_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (высота в файле {round(cy, 4)} м вычтена); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы F18_paint (один на всё) и F18_glass (BLEND, clearGlass)'
P['nozzles_game'] = [GG(g.P3(g.NOZ_A, s_ * g.NOZ_X, g.NOZ_Y)) for s_ in (-1, 1)]; P['nr'] = g.NOZ_R
ST = {nm_: GG(pt) for nm_, pt in g.PYLON_PTS.items() if nm_ != 'pod'}
P['stations_game'] = dict(note='низ пилона и балки, ровная площадка: на сторону 3 под крылом + 1 под воздухозаборником. Наружных баков нет, рельс на конце крыла постоянный, пилоны крыла с наклоном 5° наружу', **ST)
P['pod_game'] = dict(attach=GG(g.PYLON_PTS['pod']), note='центр снизу, низ балки')
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
P['parts'] = parts; P['twin'] = 'два сопла; поля TWIN в plane-zones задаёт игра'
P['gear_note'] = 'f18_gear.glb: стойки и колёса, только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. Створки в файле самолёта закрыты, отдельных открытых нет.'
P['swap_note'] = 'После подмены обязательно: seats-gen.js f18 (таблица посадки подвески и дорисованные пилоны). Прежняя запись для старой модели ставит блоки и штыри перед воздухозаборником; на стенде она отключена. Рецепт prepare.js у f18 пока со старым источником.'
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'сопла', P['nozzles_game'], 'контейнер', P['pod_game']['attach'])
