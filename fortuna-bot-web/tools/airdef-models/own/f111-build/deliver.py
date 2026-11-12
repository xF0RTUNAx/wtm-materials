# deliver.py - сдача F-4: превью, файл для Sketchfab и .blend (со стойками, створки открыты), файл игры (без стоек, створки закрыты), файл шасси для ангара, паспорт и отчёт. После build.py, gbuf.py (4096) и paint.py (F111_OUT=папка модели):
#   F111_DIR="<папка модели>" Blender -b --factory-startup --python build.py --python deliver.py
import json, math, os, sys
HERE = os.environ['F111_DIR']; sys.path.insert(0, HERE); os.environ['F111_MAPS'] = HERE; os.environ['F111_OUT'] = HERE; os.environ['F111_ONLY'] = '__никакой__'; os.environ.setdefault('F111_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
DOORS = (('brake', 35.0),)
for n_, d_ in DOORS: pose(n_, d_)
vl.update(); prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 0.2, 0.3), (-0.60, 0.62, 0.48), 31.0), ('превью_2_сбоку.png', (0.0, 0.0, 0.5), (-1.0, 0.0, 0.05), 31.0), ('превью_3_сверху.png', (0.0, 0.0, 0.3), (0.05, -0.05, 1.0), 30.0),
                         ('превью_4_хвост.png', (0.0, -8.6, 1.4), (-0.72, -0.60, 0.36), 12.0), ('превью_5_кабина.png', (0.0, 5.3, 1.2), (-0.60, 0.50, 0.62), 7.0), ('превью_6_снизу.png', (0.0, 0.2, -0.3), (0.10, 0.10, -0.98), 30.0)):
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
mk.export(os.path.join(HERE, 'f111_sketchfab.glb'), os.path.join(HERE, 'f111.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'f111_sketchfab.glb')) // 1024, 'КБ')
# ещё два качества для Sketchfab: карты 2048 и 1024 (основной файл - 4096)
ORIG = {t: t.image for t in (tc, to, tn)}
for px, suf in ((2048, '_2k'), (1024, '_1k')):
    for t, im0 in ORIG.items():
        im = im0.copy(); im.scale(px, px); im.pack(); t.image = im
    mk.export(os.path.join(HERE, f'f111_sketchfab{suf}.glb'), None); print('Sketchfab', suf, os.path.getsize(os.path.join(HERE, f'f111_sketchfab{suf}.glb')) // 1024, 'КБ')
for t, im0 in ORIG.items(): t.image = im0
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_f111', weapon='', name='F-111F', name_en='F-111F', glb='f111.glb', blend='f111.blend', rev=1,
    build=['build.py', 'f111_base.py', 'f111_geo.py', 'f111_parts.py', 'f111_gk.py', 'f111_lines.py', 'uv_f111.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'стыки': {k: v.get('плохо') for k, v in (styk.get('детали') or {}).items() if v.get('плохо')}, 'silhouette_iou': {'бок': 'контур поверх чертежа f111_06: сверху, сбоку, спереди (_снимки/наложение_06.jpg); IoU не считали'}, 'game': 'игра: ангар и бой, день и вечер (превью-игра); на телефоне не проверено'},
    sketchfab={'title': 'F-111F Aardvark - Game-Ready Swing-Wing Jet', 'lead': 'Swing-wing strike aircraft in South-East Asia camouflage with black undersides and radome, made-up tail code. Wings sweep 16-72.5 deg on real pivots inside the glove slot; pylons swivel to stay streamwise.',
               'parts': ['airframe', 'swing wings', 'slats', 'flaps', 'spoilers', 'swivel pylons with twin racks', 'fin and rudder', 'stabilators', 'two canopy hatches', 'cockpit', 'speed brake door', 'rotating pod cradle', 'nozzles', 'gear'],
               'tags': ['f-111', 'f111', 'aardvark', 'general-dynamics', 'usaf', 'bomber', 'swing-wing', 'jet', 'aircraft', 'military', 'game-ready', 'pbr'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m at 26 deg sweep, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps; 2K and 1K versions included', 'based': 'Built from scratch in Blender from reference photos and a three-view drawing.', 'glb': 'f111_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-12). Форма построена заново по картинкам Mark f111_01...09: чертёж f111_06 (три проекции, 22,4 пикс/м) и фото; пиксели фото не использованы, знаки нарисованы заново, код NK и номер 236 придуманы. По слову Mark: в верхнем прямом углу заборника вырезан сектор-четверть (конусов нет), корпус плавно переходит в сопла. Низ чёрный по f111_05. Оснастки sk_* для Sketchfab нет: пакет отличается от игры только картами 4096 и стойками. Не сделано: уплотнения щели крыла, антенны и огни; подфюзеляжные кили короче и глубже, чем на чертеже.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# файл игры: без стоек, створки закрыты; файл шасси: только стойки и метки центра
for n_, d_ in DOORS: pose(n_, -d_)
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'f111.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'f111.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'f111_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'f111_gear.glb')) // 1024, 'КБ')
# паспорт: всё в осях игры (после центровки prepare.js по габаритам файла игры)
cy = (MN_M[2] + MX_M[2]) / 2; cb = (MN_M[1] + MX_M[1]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-(v.y - cb), 3)]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'f111_gear.glb'; P['files']['sketchfab_glb'] = 'f111_sketchfab.glb'; P['gear_key'] = 'e_f111_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (сдвиг по высоте {round(cy, 4)} м и по длине {round(cb, 4)} м учтён); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы F111_paint (один на всё) и F111_glass (BLEND, clearGlass)'
P['nozzles_game'] = [GG(g.P3(g.NOZ_A, -g.NOZ_X, g.NOZ_Z)), GG(g.P3(g.NOZ_A, g.NOZ_X, g.NOZ_Z))]; P['nr'] = g.NOZ_R; P['gear_bottom_game_y'] = round(mn_g - cy, 3)
ST = {k: GG(v) for k, v in g.PYLON_PTS.items()}
P['stations_game'] = dict(note='8 точек, на сторону 4: на каждом поворотном пилоне балка с двумя замками. Порядок для mirror() - левая сторона: 0 внешний пилон, наружный замок; 1 внешний пилон, внутренний замок; 2 внутренний пилон, наружный замок; 3 внутренний пилон, внутренний замок (последний индекс ближе всех к фюзеляжу). Точки даны для стреловидности файла (26 градусов); при повороте крыла они идут с пилоном. Верх бомбы у точки.', order_left=[ST['pylon_o_l_o'], ST['pylon_o_l_i'], ST['pylon_i_l_o'], ST['pylon_i_l_i']], **{k: v for k, v in ST.items() if k != 'pod'})
P['pod_game'] = dict(attach=ST['pod'], note='под люлькой cradle в отсеке, люлька в файле контейнером вниз (выпущено); 180 градусов вокруг продольной оси - убрано, наружу гладкая створка')
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('parent'): parts[nm_]['parent'] = D['parent']
    if D.get('kind'): parts[nm_]['kind'] = D['kind']
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
P['parts'] = parts
P['wing_sweep'] = dict(file_deg=g.SWEEP, forward_deg=g.SW_MIN, folded_deg=g.SW_MAX, pivot_game={'wing_l': GG(g.pivot_v(-1)), 'wing_r': GG(g.pivot_v(1))},
    rule='Ось вертикальная (игра +Y). Увеличение стреловидности на 1 градус: wing_r поворачивается на -1 вокруг +Y, wing_l на +1. Дети консоли (slat_*, flap_*, spoil_*, pylon_*, rack_*) идут с ней.',
    pylons='Пилон pylon_* - ребёнок консоли со своей вертикальной осью (pivot в parts), rack_* - ребёнок пилона. Чтобы пилон смотрел строго вперёд, его угол относительно консоли = минус угол поворота консоли от положения файла.',
    pylon_table=[dict(sweep_deg=s_, wing_r_deg=round(-(s_ - g.SWEEP), 1), pylon_r_deg=round(s_ - g.SWEEP, 1), wing_l_deg=round(s_ - g.SWEEP, 1), pylon_l_deg=round(-(s_ - g.SWEEP), 1)) for s_ in (16.0, 26.0, 35.0, 45.0, 54.0, 63.0, 72.5)],
    checked='_collide.py: 25 положений от 16 до 72,5 градуса, пилоны по потоку - касаний с корпусом, килем, стабилизатором нет')
P['motion_note'] = 'Крыло изменяемой стреловидности - см. wing_sweep. Предкрылки slat_* 0…22, закрылки flap_* 0…35, интерцепторы spoil_* вверх до 45, руль ±22, стабилизаторы stab_* -25…+12 (каждый отдельно). Тормозной щиток brake - передняя створка основной ниши, 0…60, при выпущенном шасси 35. Люлька cradle 0…180 вокруг продольной оси. Створки фонаря canopy_l/r вверх на 62 на центральной балке. Подвижных конусов заборников нет (решение Mark: в углу вырезан сектор). Намеренные касания: вал стабилизатора в борту, оси люльки в стенках отсека, петля щитка; створки фонаря касаются неподвижной рамы на 10-62 градусах - не разобрано.'
P['gear_note'] = 'f111_gear.glb: передняя стойка с двумя колёсами, основные стойки на общей балке (gear_m, колёса gear_w_*), открытые створки передней ниши gear_door_n_*. Только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. В файле самолёта ниши закрыты: передняя швом в текстуре, основная - щитком brake (в ангаре его можно открыть на 35 градусов).'
P['swap_notes'] = [
 'Рецепт prepare.js у e_f111 старый (чужой источник): заменить на own: true, scale 1, nose -z, tex 2048, nTex 2048, pickMesh /./, centerX: true, как у e_f4; добавить рецепт e_f111_gear.',
 'models.js e_f111: новые stations (order_left в этом порядке), nozzles два, nr, pod, clearGlass: true, gearModel: e_f111_gear при paintOn. META.e_f111_gear как у e_f4_gear. GLB_V для обоих ключей.',
 'Крыло: в файле 26 градусов. Подключить META pivots / setPose по блоку wing_sweep; пилоны разворачивать по pylon_table. Точки подвески заданы для 26 градусов.',
 'Контейнер: pod под люлькой cradle; в файле люлька выпущена. Если контейнера в загрузке нет - повернуть cradle на 180.',
 'Убрать из титров прежнего автора e_f111. thumbs/air_e_f111.webp - старая модель, пересобрать. mm.js использует кадр air_e_f111_h3 - переснять.',
 'После подмены обязательно: seats-gen.js e_f111; ktx-models парой для e_f111 и e_f111_gear.',
 'Подвески GBU-12 ×4 + Mk 82 ×4 сняты на стенде на новых точках, ошибок нет; _collide: бомбы не задевают шасси, щиток 35, закрылки 35 и друг друга. При сбросе и на других углах крыла не проверялось.',
 'Размах в файле около 18,4 м (26 градусов), прежняя модель 18,87 м; длина та же 22,4 м.'
]
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(stations=P['stations_game']['order_left'], pod=P['pod_game']['attach'], nozzles=P['nozzles_game'], nr=P['nr']), open(os.path.join(HERE, 'точки.json'), 'w', encoding='utf-8'))
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'сопло', P['nozzles_game'], 'контейнер', P['pod_game']['attach'], 'низ колёс', P['gear_bottom_game_y'])
