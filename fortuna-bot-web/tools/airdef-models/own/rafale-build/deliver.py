# deliver.py - сдача Rafale: превью и .blend (со стойками; Sketchfab для этой модели не нужен - слова Mark), файл игры (без стоек, створки закрыты), файл шасси для ангара, паспорт и отчёт. После build.py:
#   RF_DIR="<папка модели>" RF_STAGE=4 RF_TEX=4096 Blender -b --factory-startup --python build.py --python deliver.py
# Карты rafale_color.png, rafale_normal.png, rafale_orm.png лежат в папке модели (paint.py, RF_OUT=папка модели). Развёртка - _проба/uv.npz.
import json, math, os, sys
HERE = os.environ['RF_DIR']; sys.path.insert(0, HERE); os.environ['RF_MAPS'] = HERE; os.environ['RF_OUT'] = HERE; os.environ['RF_ONLY'] = '__никакой__'; os.environ.setdefault('RF_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
# на превью и в файле для Sketchfab створки открыты, в файле игры закрыты
DOORS = [n for n in g.PARTS if n.startswith('door_')]; DOOR0 = {n: bpy.data.objects[n].matrix_world.copy() for n in DOORS}
for n in DOORS:
    o = bpy.data.objects[n]; D = g.PARTS[n]; o.matrix_world = Matrix.Translation(D['pivot']) @ Matrix.Rotation(math.radians(D['range'][1]), 4, D['axis']) @ Matrix.Translation(-D['pivot']) @ DOOR0[n]
vl.update()
prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 1.0, 0.3), (0.52, 0.72, 0.46), 27.0), ('превью_2_сбоку.png', (0.0, 0.0, 0.3), (-1.0, 0.0, 0.08), 24.0), ('превью_3_сверху.png', (0.0, 0.0, 0.3), (0.05, -0.05, 1.0), 25.0),
                         ('превью_4_хвост.png', (0.0, -1.5, 0.6), (0.34, -0.78, 0.40), 22.0), ('превью_5_кабина.png', (0.0, 3.8, 1.0), (0.62, 0.62, 0.48), 7.0), ('превью_6_снизу.png', (0.0, 0.0, -0.4), (0.42, 0.28, -0.86), 24.0), ('превью_7_заборник.png', (0.0, 2.6, -0.75), (0.25, 1.0, -0.14), 5.5)):
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
STY_NOTE = os.environ.get('RF_STY_NOTE', '')
try: col = json.load(open(os.path.join(HERE, '_live', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога хода:', e)
sty = {}
try:
    D_ = json.load(open(os.path.join(HERE, '_стыки', '_стыки.json'), encoding='utf-8'))['детали']; sty = {k: v['плохо'] for k, v in D_.items() if v.get('плохо')}
except Exception as e: print('нет итога стыков:', e)
os.makedirs(os.path.join(HERE, '_live'), exist_ok=True); mk.export(os.path.join(HERE, '_live', '_полная_сцена.glb'), os.path.join(HERE, 'rafale.blend')); print('blend', os.path.getsize(os.path.join(HERE, 'rafale.blend')) // 1024, 'КБ')
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
# отчёт и основа паспорта: пока в сцене все детали
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_rafale', weapon='', name='Rafale', name_en='Dassault Rafale C', glb='rafale.glb', blend='rafale.blend', rev=1,
    build=['build.py', 'rafale_geo.py', 'rafale_detail.py', 'rafale_gear.py', 'uv_rafale.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_gaps.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'стыки': dict(плохо=sty, разбор=STY_NOTE), 'silhouette_iou': {'бок': 'контур поверх снимка 07 (_снимки/нал_бок07.jpg), низ поверх снимка 13 (_снимки/нал_низ.jpg)'}, 'game': 'игра: ангар и бой, день и вечер, ошибок страницы нет (_проба/стенд); на телефоне не проверено'},
    sketchfab=None,
    notes='Ревизия 1 (2026-11-09). Перед корпуса (нос, щёки, палуба у кабины) взят из модели CloudHub «Dassault Rafale» (CC BY 4.0, автор CloudHub, https://sketchfab.com/3d-models/dassault-rafale-fce1a5076caf4710917c14624b4d7d22): переведён в наши оси, обрезан, своя краска; указывать в титрах. Остальное своё: плечи над заборниками, заборники (ниже на 15% и уже на 25%, щель 8 см над кромкой), каналы, хвост, крыло, кили, утки с обтекателями осей, кабина, фонарь, шасси. Штанги дозаправки и тормозных щитков нет. Знаки свои: серые круги, 133 и 7-RK придуманные. Канал заборника глухой. Карты: цвет без света, нормали по высоте, R затенение, G шероховатость, B металл.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# файл игры: без стоек, створки закрыты; файл шасси: только стойки и метки центра
for n in DOORS: bpy.data.objects[n].matrix_world = DOOR0[n]
vl.update()
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'rafale.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'rafale.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'rafale_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'rafale_gear.glb')) // 1024, 'КБ')
# паспорт: всё в осях игры (после центровки prepare.js, сдвиг по высоте cy)
cy = (MN_M[2] + MX_M[2]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-v.y, 3)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'rafale_gear.glb'; P['gear_key'] = 'e_rafale_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (высота в файле {round(cy, 4)} м вычтена); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы Rafale_paint (один на всё) и Rafale_glass (BLEND, clearGlass)'
P['nozzles_game'] = [GG(g.P3(g.NOZ_A, s_ * g.NOZ_X, g.NOZ_Y)) for s_ in (-1, 1)]; P['nr'] = g.NOZ_R
ST = {nm_: GG(pt) for nm_, pt in g.PYLON_PTS.items() if nm_ != 'pod'}
P['stations_game'] = dict(note='низ пилона и балки; _root - верх пилона у крыла. На сторону 3 пилона под крылом и 1 балка под бортом. Для mirror() порядок [балка pylon_c, внешний pylon_o, средний pylon_m, внутренний pylon_i]: игра вешает самое тяжёлое на индекс 3, поэтому Storm Shadow идёт на внутренний пилон', **ST)
P['pod_game'] = dict(attach=GG(g.PYLON_PTS['pod']), note='центр снизу, низ балки')
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
P['parts'] = parts; P['twin'] = 'два сопла; поля TWIN в plane-zones задаёт игра'
P['gear_note'] = 'rafale_gear.glb: стойки и колёса, только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. Створки в файле самолёта закрыты, отдельных открытых нет.'
P['swap_notes'] = ['Ключи e_rafale и e_rafale_gear. В META: clearGlass: true, gearModel: e_rafale_gear, paint для шасси, как у других своих самолётов.', 'Заменить stations на mirror([pylon_c_r, pylon_o_r, pylon_m_r, pylon_i_r]) из stations_game: у старой записи последней шла балка, и Storm Shadow ушёл бы под борт. Добавить pod из pod_game.', 'Заменить nozzles и nr: сопла выше и дальше назад, чем у старой модели.', 'После подмены обязательно seats-gen.js e_rafale: прежняя запись посадки рисует пилоны по старым точкам.', 'Ангар берёт отдельный файл camo/e_rafale.hi.glb: его тоже заменить, иначе в ангаре останется старая модель.', 'Рецепт prepare.js e_rafale сейчас со старым источником. На стенде файл прогонялся через рецепт e_f15e.', 'Модель частично из CloudHub (CC BY 4.0): в титры игры строку «Dassault Rafale - CloudHub, CC BY 4.0» со ссылкой https://sketchfab.com/3d-models/dassault-rafale-fce1a5076caf4710917c14624b4d7d22.', 'Старая окраска e_rafale:harlequin нарисована по старой развёртке и к этой модели не подходит. Перенос на новую развёртку делает сборщик после приёмки самолёта, отдельной пробой.', 'Проверка столкновений подвески Storm Shadow со створками и стойками на этой модели не делалась: только кадры ангара. На телефоне не проверено.']
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'сопла', P['nozzles_game'], 'контейнер', P['pod_game']['attach'], 'точки', ST)
