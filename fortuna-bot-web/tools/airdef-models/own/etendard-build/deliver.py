# deliver.py - сдача Super Étendard: превью, файл для Sketchfab и .blend (со стойками, створки открыты), файл игры (без стоек, створки закрыты), файл шасси для ангара, паспорт и отчёт. После build.py, gbuf.py (4096) и paint.py (SE_OUT=папка модели):
#   SE_DIR="<папка модели>" Blender -b --factory-startup --python build.py --python deliver.py
import json, math, os, sys
HERE = os.environ['SE_DIR']; sys.path.insert(0, HERE); os.environ['SE_MAPS'] = HERE; os.environ['SE_OUT'] = HERE; os.environ['SE_ONLY'] = '__никакой__'; os.environ.setdefault('SE_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
DOORS = (('door_n_r', -80), ('door_n_l', 80), ('door_o_r', -85), ('door_o_l', 85))
for n_, d_ in DOORS: pose(n_, d_)
vl.update(); prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 0.2, 0.3), (0.60, 0.62, 0.48), 21.0), ('превью_2_сбоку.png', (0.0, 0.0, 0.5), (1.0, 0.0, 0.05), 21.0), ('превью_3_сверху.png', (0.0, 0.0, 0.3), (0.05, -0.05, 1.0), 20.0),
                         ('превью_4_хвост.png', (0.0, -2.2, 0.8), (0.72, -0.60, 0.36), 12.0), ('превью_5_кабина.png', (0.0, 4.1, 1.15), (0.55, 0.62, 0.50), 4.6), ('превью_6_снизу.png', (0.0, 0.2, -0.3), (0.10, 0.10, -0.98), 19.0)):
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
mk.export(os.path.join(HERE, 'etendard_sketchfab.glb'), os.path.join(HERE, 'etendard.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'etendard_sketchfab.glb')) // 1024, 'КБ')
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_etendard', weapon='', name='Super Étendard', name_en='Super Etendard', glb='etendard.glb', blend='etendard.blend', rev=1,
    build=['build.py', 'se_geo.py', 'se_detail.py', 'se_gear.py', 'uv_se.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_gaps.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'связность': gaps.get('висит'), 'стыки': {k: v.get('плохо') for k, v in (styk.get('детали') or {}).items() if v.get('плохо')}, 'silhouette_iou': {'бок': 'наложение на фото se_12, сверху на выпрямленное rect_11 (_снимки/лист_1_форма.jpg)'}, 'game': 'игра: ангар и бой, день и вечер (превью-игра); на телефоне не проверено'},
    sketchfab={'title': 'Super Etendard - Game-Ready Jet', 'lead': 'Carrier-borne strike jet in an overall blue-grey naval scheme with a black nose and red intake lips. Moving parts on their own pivots: canopy, rudder, all-moving stabilisers, leading edge slats, flaps, ailerons, folding wing tips, perforated speedbrakes, refuelling probe, arrestor hook and landing gear. Recessed panel lines, raised access lids, detailed cockpit, dark intake ducts and engine nozzle with burner.',
               'parts': ['airframe', 'fin and rudder', 'stabilisers', 'slats', 'flaps', 'ailerons', 'wing fold', 'speedbrakes', 'canopy', 'cockpit', 'intakes', 'nozzle', 'gear', 'pylons', 'hook', 'probe'],
               'tags': ['super-etendard', 'etendard', 'attack', 'naval', 'carrier', 'jet', 'aircraft', 'military', 'cold-war', 'game-ready', 'pbr', 'textured'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'etendard_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-06). Форма построена заново по фото Mark se_01...13, пиксели фото не использованы, знаки нарисованы заново. Схема по se_13: сине-серый без пятен, киль чуть темнее, нос чёрный, красный обод заборника. Знаки: MARINE, круг без якоря (слово Mark), номер 18 на борту, киле и крыле, треугольник у кабины, служебные надписи и метки; запрет на MARINE и номера снят Mark для этой модели. Швы - V-канавки, крышки - плиты с фаской. Карты: цвет без света, нормали по высоте, R затенение, G шероховатость, B металл. В файле Sketchfab и .blend створки шасси открыты, в файле игры закрыты.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# файл игры: без стоек, створки закрыты; файл шасси: только стойки и метки центра
for n_, d_ in DOORS: pose(n_, -d_)
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'etendard.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'etendard.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'etendard_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'etendard_gear.glb')) // 1024, 'КБ')
# паспорт: всё в осях игры (после центровки prepare.js по габаритам файла игры)
cy = (MN_M[2] + MX_M[2]) / 2; cb = (MN_M[1] + MX_M[1]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-(v.y - cb), 3)]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'etendard_gear.glb'; P['files']['sketchfab_glb'] = 'etendard_sketchfab.glb'; P['gear_key'] = 'e_etendard_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (сдвиг по высоте {round(cy, 4)} м и по длине {round(cb, 4)} м учтён); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы SE_paint (один на всё) и SE_glass (BLEND, clearGlass)'
P['nozzles_game'] = [GG(g.P3(g.NOZ_A, 0.0, g.NOZ_Y))]; P['nr'] = g.NOZ_R; P['dry'] = True; P['gear_bottom_game_y'] = round(mn_g - cy, 3)
ST = {k: GG(v) for k, v in g.PYLON_PTS.items()}
P['stations_game'] = dict(note='8 точек, на сторону 4. Порядок для mirror() - левая сторона: индекс 0 передняя под фюзеляжем (f), 1 задняя под фюзеляжем (a), 2 внешний пилон (o), 3 внутренний пилон (i). Игра вешает самое тяжёлое на индекс 3, потом 2, 1, 0: у индекса 3 большой просвет. Точки под фюзеляжем заподлицо с обшивкой, плит нет (слово Mark). Наружных баков нет', order_left=[ST['pylon_f_l'], ST['pylon_a_l'], ST['pylon_o_l'], ST['pylon_i_l']], **{k: v for k, v in ST.items() if k != 'pod'})
P['pod_game'] = dict(attach=ST['pod'], note='под фюзеляжем по оси, заподлицо с обшивкой, крепления-плиты нет (слово Mark)')
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
P['parts'] = parts
P['motion_note'] = 'Новых видов движения нет, описание как у F/A-18C. Интерцепторов на модели нет, не строил. Штанга заправки подвижная (probe, 0..38 вверх), игрой пока не двигается. Уборка стоек: оси и диапазоны в parts, в ниши по форме точно не подгонялась, в файле игры стоек нет.'
P['gear_note'] = 'etendard_gear.glb: стойки и колёса, только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. Створки в файле самолёта закрыты, отдельных открытых нет.'
P['swap_notes'] = [
 'Рецепт prepare.js у e_etendard старый (чужой источник super-etendard.glb, tex 512, groups): заменить на own: true, scale 1, nose -z, tex 2048, nTex 2048, pickMesh /./, centerX: true, как у e_f18c; добавить рецепт e_etendard_gear.',
 'models.js e_etendard: новые stations (order_left в этом порядке, старые V с четвёртым аргументом убрать), nozzles один, nr, pod, dry: true, clearGlass: true, gearModel: e_etendard_gear при paintOn. META.e_etendard_gear как у e_f18c_gear. GLB_V для обоих ключей.',
 'Старые файлы: games/airdef/models/camo/e_etendard.hi.glb и thumbs/air_e_etendard.webp - это старый тигровый окрас, ангар грузит hi-файл. Убрать или пересобрать, иначе в ангаре и на карточке останется старая модель.',
 'После подмены обязательно: seats-gen.js e_etendard (таблица посадки подвески; запись в seats-data.js старая).',
 'Проверить подвеску GBU-12 и Mk 82 на стоянке: просветы в checks_clearance.',
 'Каплю на киле снизу и над соплом Mark велел убрать, их нет намеренно. Выступающих плит под фюзеляжем тоже нет по его слову.'
]
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(stations=P['stations_game']['order_left'], pod=P['pod_game']['attach'], nozzle=P['nozzles_game'][0], nr=P['nr']), open(os.path.join(HERE, 'точки.json'), 'w', encoding='utf-8'))
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'сопло', P['nozzles_game'], 'контейнер', P['pod_game']['attach'], 'низ колёс', P['gear_bottom_game_y'])
