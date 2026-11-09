# deliver.py - сдача Mirage F1: превью, файл для Sketchfab и .blend (со стойками, створки открыты), файл игры (без стоек, створки закрыты), файл шасси для ангара, паспорт и отчёт. После build.py, gbuf.py (4096) и paint.py (F1_OUT=папка модели):
#   F1_DIR="<папка модели>" Blender -b --factory-startup --python build.py --python deliver.py
import json, math, os, sys
HERE = os.environ['F1_DIR']; sys.path.insert(0, HERE); os.environ['F1_MAPS'] = HERE; os.environ['F1_OUT'] = HERE; os.environ['F1_ONLY'] = '__никакой__'; os.environ.setdefault('F1_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
DOORS = (('door_n_r', -65), ('door_n_l', 65), ('door_o_r', g.PARTS['door_o_r']['range'][0]), ('door_o_l', g.PARTS['door_o_l']['range'][0]))
for n_, d_ in DOORS: pose(n_, d_)
vl.update(); prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 0.2, 0.3), (0.60, 0.62, 0.48), 21.0), ('превью_2_сбоку.png', (0.0, 0.0, 0.5), (1.0, 0.0, 0.05), 21.0), ('превью_3_сверху.png', (0.0, 0.0, 0.3), (0.05, -0.05, 1.0), 20.0),
                         ('превью_4_хвост.png', (0.0, -5.5, 1.2), (0.72, -0.60, 0.36), 9.0), ('превью_5_кабина.png', (0.0, 3.7, 0.9), (0.55, 0.62, 0.50), 4.8), ('превью_6_снизу.png', (0.0, 0.2, -0.3), (0.10, 0.10, -0.98), 20.0)):
    shot(nm, tg, dv, dist, wd=1920, h=1080); prev.append(nm)
print('превью', prev)
for c_ in ('v_cam', 'v_sun'):
    o_ = bpy.data.objects.get(c_)
    if o_ is not None: bpy.data.objects.remove(o_)
vl.update()
ms = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in ms for v in o.data.vertices]; mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
LEN, SPAN, HGT = round(mx.y - mn.y, 3), round(mx.x - mn.x, 3), round(mx.z - mn.z, 3)
def rd(f):
    try: return json.load(open(os.path.join(HERE, f), encoding='utf-8'))
    except Exception as e: print('нет', f, e); return {}
col = rd('_live/collide.json'); gaps = rd('_live/gaps.json'); styk = rd('_стыки/_стыки.json')
mk.export(os.path.join(HERE, 'mirage_f1_sketchfab.glb'), os.path.join(HERE, 'mirage_f1.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'mirage_f1_sketchfab.glb')) // 1024, 'КБ')
# ещё два качества для Sketchfab: карты 2048 и 1024 (основной файл - 4096)
ORIG = {t: t.image for t in (tc, to, tn)}
for px, suf in ((2048, '_2k'), (1024, '_1k')):
    for t, im0 in ORIG.items():
        im = im0.copy(); im.scale(px, px); im.pack(); t.image = im
    mk.export(os.path.join(HERE, f'mirage_f1_sketchfab{suf}.glb'), None); print('Sketchfab', suf, os.path.getsize(os.path.join(HERE, f'mirage_f1_sketchfab{suf}.glb')) // 1024, 'КБ')
for t, im0 in ORIG.items(): t.image = im0
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_mirage_f1', weapon='', name='Mirage F1', name_en='Mirage F1', glb='mirage_f1.glb', blend='mirage_f1.blend', rev=1,
    build=['build.py', 'f1_geo.py', 'f1_detail.py', 'f1_gear.py', 'uv_f1.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_gaps.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'связность': gaps.get('висит'), 'стыки': {k: v.get('плохо') for k, v in (styk.get('детали') or {}).items() if v.get('плохо')}, 'silhouette_iou': {'бок': 'контур поверх фото f1_07 (_снимки/наложение_07.jpg, лист_1_форма.jpg); IoU не считали'}, 'game': 'игра: ангар и бой, день и вечер (превью-игра); на телефоне не проверено'},
    sketchfab={'title': 'Mirage F1 - Game-Ready Jet', 'lead': 'French single-seat fighter-bomber in two-tone grey and green camouflage with a black radome, French roundels and made-up codes. Moving parts on their own pivots: canopy, rudder, all-moving stabilisers, two-section slats, flaps, ailerons, speedbrakes and landing gear with doors. Fixed intake half-cones, wingtip rails, ventral fins, panel lines, detailed cockpit and petal nozzle.',
               'parts': ['airframe', 'fin and rudder', 'stabilisers', 'slats', 'flaps', 'ailerons', 'speedbrakes', 'canopy', 'cockpit', 'intakes with half-cones', 'nozzle', 'gear', 'pylons', 'wingtip rails'],
               'tags': ['mirage-f1', 'mirage', 'dassault', 'french', 'fighter', 'jet', 'aircraft', 'military', 'cold-war', 'game-ready', 'pbr', 'textured'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps; 2K and 1K versions included', 'based': 'Built from scratch in Blender from reference photos.', 'glb': 'mirage_f1_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-08). Форма построена заново по фото Mark f1_01...10 (профиль с f1_07, 100,8 пикс/м по длине, высоты ×0,915), пиксели фото не использованы, знаки нарисованы заново. Штанги дозаправки нет: Mark попросил убрать. Схема: французский двухцветный серо-зелёный камуфляж, нос чёрный, круги на борту и посередине консолей, код 118-LX и номер 587 придуманы. Швы - V-канавки, крышки - плиты с фаской. Карты: цвет без света, нормали по высоте, R затенение, G шероховатость, B металл. В файле Sketchfab и .blend створки шасси открыты, в файле игры закрыты.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# файл игры: без стоек, створки закрыты; файл шасси: только стойки и метки центра
for n_, d_ in DOORS: pose(n_, -d_)
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'mirage_f1.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'mirage_f1.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'mirage_f1_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'mirage_f1_gear.glb')) // 1024, 'КБ')
# паспорт: всё в осях игры (после центровки prepare.js по габаритам файла игры)
cy = (MN_M[2] + MX_M[2]) / 2; cb = (MN_M[1] + MX_M[1]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-(v.y - cb), 3)]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'mirage_f1_gear.glb'; P['files']['sketchfab_glb'] = 'mirage_f1_sketchfab.glb'; P['gear_key'] = 'e_mirage_f1_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (сдвиг по высоте {round(cy, 4)} м и по длине {round(cb, 4)} м учтён); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы F1_paint (один на всё) и F1_glass (BLEND, clearGlass)'
P['nozzles_game'] = [GG(g.P3(g.NOZ_A, 0.0, g.NOZ_Y))]; P['nr'] = g.NOZ_R; P['dry'] = True; P['gear_bottom_game_y'] = round(mn_g - cy, 3)
ST = {k: GG(v) for k, v in g.PYLON_PTS.items()}
P['stations_game'] = dict(note='8 точек, на сторону 4. Порядок для mirror() - левая сторона: индекс 0 передняя под фюзеляжем (f), 1 задняя под фюзеляжем (a), 2 внешний пилон (o), 3 внутренний пилон (i). Игра вешает самое тяжёлое на индекс 3, потом 2, 1, 0: у индекса 3 большой просвет. Точки под фюзеляжем заподлицо с обшивкой, плит нет (слово Mark). Наружных баков нет', order_left=[ST['pylon_f_l'], ST['pylon_a_l'], ST['pylon_o_l'], ST['pylon_i_l']], **{k: v for k, v in ST.items() if k != 'pod'})
P['pod_game'] = dict(attach=ST['pod'], note='под фюзеляжем по оси, заподлицо с обшивкой, крепления-плиты нет (слово Mark)')
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
P['parts'] = parts
P['motion_note'] = 'Новых видов движения нет, описание как у F/A-18C. Интерцепторов нет. Полуконусы заборников неподвижны (задание). Штанги дозаправки нет (Mark). Уборка стоек: оси и диапазоны в parts, основная - вокруг одной наклонной оси вперёд и внутрь; в файле игры стоек нет. Касания при ходе: фонарь у закрытого положения (до 10°), петли створок, основная стойка в самом конце уборки рядом с открытой наружной створкой.'
P['gear_note'] = 'mirage_f1_gear.glb: стойки и колёса, только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. Створки в файле самолёта закрыты, отдельных открытых нет.'
P['swap_notes'] = [
 'Рецепт prepare.js у e_mirage_f1 старый (чужой источник, Civorsky): заменить на own: true, scale 1, nose -z, tex 2048, nTex 2048, pickMesh /./, centerX: true, как у e_etendard; добавить рецепт e_mirage_f1_gear.',
 'models.js e_mirage_f1: новые stations (order_left в этом порядке), nozzles один, nr, pod, dry: true, clearGlass: true, gearModel: e_mirage_f1_gear при paintOn; убрать camo: { scheme: fr } (камуфляж теперь в текстуре). META.e_mirage_f1_gear как у e_etendard_gear. GLB_V для обоих ключей.',
 'Старые файлы: games/airdef/models/camo/e_mirage_f1.hi.glb и его запись в models/hi-list.js, thumbs/air_e_mirage_f1.webp - старая модель; убрать или пересобрать. Убрать кредит Civorsky за Mirage F1.',
 'После подмены обязательно: seats-gen.js e_mirage_f1 (таблица посадки подвески); ktx-models для e_mirage_f1 и e_mirage_f1_gear.',
 'Подвеска: в игре сейчас Mk 82 ×6 (era 1 west) - на стенде висят на новых точках, ошибок нет. Индекс 3 (внутренний пилон) - просвет до пола около 1,8 м.',
 'Штанги дозаправки нет по слову Mark (2026-11-08), хотя в задании была.'
]
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(stations=P['stations_game']['order_left'], pod=P['pod_game']['attach'], nozzle=P['nozzles_game'][0], nr=P['nr']), open(os.path.join(HERE, 'точки.json'), 'w', encoding='utf-8'))
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'сопло', P['nozzles_game'], 'контейнер', P['pod_game']['attach'], 'низ колёс', P['gear_bottom_game_y'])
