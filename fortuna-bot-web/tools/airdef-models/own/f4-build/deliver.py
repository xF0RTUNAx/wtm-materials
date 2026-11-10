# deliver.py - сдача F-4: превью, файл для Sketchfab и .blend (со стойками, створки открыты), файл игры (без стоек, створки закрыты), файл шасси для ангара, паспорт и отчёт. После build.py, gbuf.py (4096) и paint.py (F4_OUT=папка модели):
#   F4_DIR="<папка модели>" Blender -b --factory-startup --python build.py --python deliver.py
import json, math, os, sys
HERE = os.environ['F4_DIR']; sys.path.insert(0, HERE); os.environ['F4_MAPS'] = HERE; os.environ['F4_OUT'] = HERE; os.environ['F4_ONLY'] = '__никакой__'; os.environ.setdefault('F4_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
DOORS = tuple((n_, (r_[0] if abs(r_[0]) > abs(r_[1]) else r_[1])) for n_, r_ in ((k_, g.PARTS[k_]['range']) for k_ in ('door_n_r', 'door_n_l', 'door_m_r', 'door_m_l', 'door_o_r', 'door_o_l')))
for n_, d_ in DOORS: pose(n_, d_)
vl.update(); prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 0.2, 0.3), (-0.60, 0.62, 0.48), 25.0), ('превью_2_сбоку.png', (0.0, 0.0, 0.5), (-1.0, 0.0, 0.05), 25.0), ('превью_3_сверху.png', (0.0, 0.0, 0.3), (0.05, -0.05, 1.0), 24.0),
                         ('превью_4_хвост.png', (0.0, -7.2, 1.2), (-0.72, -0.60, 0.36), 10.5), ('превью_5_кабина.png', (0.0, 3.9, 1.2), (-0.60, 0.50, 0.62), 6.4), ('превью_6_снизу.png', (0.0, 0.2, -0.3), (0.10, 0.10, -0.98), 24.0)):
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
mk.export(os.path.join(HERE, 'f4_sketchfab.glb'), os.path.join(HERE, 'f4.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'f4_sketchfab.glb')) // 1024, 'КБ')
# ещё два качества для Sketchfab: карты 2048 и 1024 (основной файл - 4096)
ORIG = {t: t.image for t in (tc, to, tn)}
for px, suf in ((2048, '_2k'), (1024, '_1k')):
    for t, im0 in ORIG.items():
        im = im0.copy(); im.scale(px, px); im.pack(); t.image = im
    mk.export(os.path.join(HERE, f'f4_sketchfab{suf}.glb'), None); print('Sketchfab', suf, os.path.getsize(os.path.join(HERE, f'f4_sketchfab{suf}.glb')) // 1024, 'КБ')
for t, im0 in ORIG.items(): t.image = im0
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_f4', weapon='', name='F-4 Phantom II', name_en='F-4 Phantom II', glb='f4.glb', blend='f4.blend', rev=1,
    build=['build.py', 'f4_base.py', 'f4_geo.py', 'f4_detail.py', 'f4_gear.py', 'uv_f4.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_gaps.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'связность': gaps.get('висит'), 'стыки': {k: v.get('плохо') for k, v in (styk.get('детали') or {}).items() if v.get('плохо')}, 'silhouette_iou': {'бок': 'контур поверх боковой проекции f4_10 и фото f4_03 (_снимки/наложение_10.jpg, наложение_03.jpg); IoU не считали'}, 'game': 'игра: ангар и бой, день и вечер (превью-игра); на телефоне не проверено'},
    sketchfab={'title': 'F-4 Phantom II - Game-Ready Jet', 'lead': 'Two-seat twin-engine fighter-bomber in South-East Asia camouflage with a black radome, star-and-bar insignia and made-up tail code. Moving parts on their own pivots: two canopies, rudder, all-moving stabilator, leading-edge flaps, flaps, ailerons, spoilers, speedbrakes, arresting hook and landing gear with doors. D-shaped intakes with splitter plates, petal nozzles, gun fairing.',
               'parts': ['airframe', 'fin and rudder', 'stabilator', 'leading-edge flaps', 'flaps', 'ailerons', 'spoilers', 'speedbrakes', 'canopies', 'cockpits', 'intakes', 'nozzles', 'gear', 'pylons', 'hook'],
               'tags': ['f-4', 'phantom', 'f4-phantom', 'mcdonnell', 'usaf', 'fighter', 'jet', 'aircraft', 'military', 'vietnam', 'game-ready', 'pbr'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps; 2K and 1K versions included', 'based': 'Built from scratch in Blender from reference photos.', 'glb': 'f4_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-10). Форма построена заново по фото Mark f4_01...12: профиль по боковой проекции f4_10 и фото f4_03, план по f4_04, заборники по f4_11, 12; пиксели фото не использованы, знаки нарисованы заново. По слову Mark: короткий нос как на f4_10 (F-4C/D), но с обтекателем пушки; длина 17,87 м - на 8 % короче прежней модели игры (19,39 м). Камуфляж Юго-Восточной Азии, рисунок свой; код MK и номер 514 придуманы. Швы - V-канавки, крышки - плиты с фаской. Не проверено: телефон; подвески GBU-10 и HARM на стенде; касания у корня стабилизатора по координатам.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# файл игры: без стоек, створки закрыты; файл шасси: только стойки и метки центра
for n_, d_ in DOORS: pose(n_, -d_)
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'f4.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'f4.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'f4_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'f4_gear.glb')) // 1024, 'КБ')
# паспорт: всё в осях игры (после центровки prepare.js по габаритам файла игры)
cy = (MN_M[2] + MX_M[2]) / 2; cb = (MN_M[1] + MX_M[1]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-(v.y - cb), 3)]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'f4_gear.glb'; P['files']['sketchfab_glb'] = 'f4_sketchfab.glb'; P['gear_key'] = 'e_f4_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (сдвиг по высоте {round(cy, 4)} м и по длине {round(cb, 4)} м учтён); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы F4_paint (один на всё) и F4_glass (BLEND, clearGlass)'
P['nozzles_game'] = [GG(g.P3(g.NOZ_A, -g.NOZ_X, g.NOZ_Z)), GG(g.P3(g.NOZ_A, g.NOZ_X, g.NOZ_Z))]; P['nr'] = g.NOZ_R; P['gear_bottom_game_y'] = round(mn_g - cy, 3)
ST = {k: GG(v) for k, v in g.PYLON_PTS.items()}
P['stations_game'] = dict(note='8 точек, на сторону 4. Порядок для mirror() - левая сторона: индекс 0 передняя ниша под фюзеляжем (f), 1 задняя ниша (a), 2 внешний пилон крыла (o), 3 внутренний пилон крыла (i). Игра вешает самое тяжёлое на индекс 3, потом 2, 1, 0. Ниши - жёлобы в обшивке, плит нет. Наружных баков нет', order_left=[ST['pylon_f_l'], ST['pylon_a_l'], ST['pylon_o_l'], ST['pylon_i_l']], **{k: v for k, v in ST.items() if k != 'pod'})
P['pod_game'] = dict(attach=ST['pod'], note='под фюзеляжем по оси, на обшивке, плиты нет')
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
P['parts'] = parts
P['motion_note'] = 'Новое для игры: интерцепторы spoil_* (вверх до 45°), гак hook, два фонаря canopy_f и canopy_r. Элероны идут в основном вниз (-1...+30°). Стабилизатор цельноповоротный, обе половины вместе. Уборка стоек: оси и диапазоны в parts, основная - к оси самолёта, колесо плашмя под выпуклостью крыла; в файле игры стоек нет. Касания при ходе: фонари у закрытого положения, ось гака и корень стабилизатора в бобышке (по координатам не разобрано), интерцептор у петли, створка ноги проходит рядом с колесом на -72° (открывается раньше стойки).'
P['gear_note'] = 'f4_gear.glb: стойки и колёса, только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. Створки в файле самолёта закрыты, отдельных открытых нет.'
P['swap_notes'] = [
 'Рецепт prepare.js у e_f4 старый (чужой источник andertan): заменить на own: true, scale 1, nose -z, tex 2048, nTex 2048, pickMesh /./, centerX: true, как у e_mirage_f1; добавить рецепт e_f4_gear.',
 'models.js e_f4: новые stations (order_left в этом порядке), nozzles два, nr, pod, clearGlass: true, gearModel: e_f4_gear при paintOn; dry не ставить (форсаж есть). META.e_f4_gear как у e_mirage_f1_gear. GLB_V для обоих ключей.',
 'Убрать из титров andertan «McDonnell Douglas F-4 Phantom II». thumbs/air_e_f4.webp - старая модель, пересобрать.',
 'После подмены обязательно: seats-gen.js e_f4 (таблица посадки подвески); ktx-models парой для e_f4 и e_f4_gear.',
 'Длина новой модели 17,87 м против 19,39 м у прежней (короткий нос по слову Mark): проверить камеру, zones.html и всё, что завязано на длину.',
 'Подвески в игре: Shrike ×4 + Mk 82 ×2 сняты на стенде на новых точках, ошибок нет. GBU-10 ×4 и HARM ×4 на стенде не вешались: проверить просвет и стойки. По расчёту низ внутреннего пилона в 1,28 м над полом.',
 'Вариант: нос F-4C/D с обтекателем пушки от F-4E - так решил Mark; в описании игры «F-4G» оставить или поправить на его усмотрение.'
]
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(stations=P['stations_game']['order_left'], pod=P['pod_game']['attach'], nozzles=P['nozzles_game'], nr=P['nr']), open(os.path.join(HERE, 'точки.json'), 'w', encoding='utf-8'))
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'сопло', P['nozzles_game'], 'контейнер', P['pod_game']['attach'], 'низ колёс', P['gear_bottom_game_y'])
