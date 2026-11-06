# deliver.py - сдача Saab Viggen: превью, файл для Sketchfab и .blend (со стойками), файл игры (без стоек, створки закрыты), файл шасси для ангара, паспорт и отчёт. После build.py:
#   VG_DIR="<папка модели>" VG_STAGE=4 VG_TEX=4096 Blender -b --factory-startup --python build.py --python deliver.py
# Карты viggen_color.png, viggen_normal.png, viggen_orm.png лежат в папке модели (paint.py, VG_OUT=папка модели). Развёртка - _проба/uv.npz.
import json, math, os, sys
HERE = os.environ['VG_DIR']; sys.path.insert(0, HERE); os.environ['VG_MAPS'] = HERE; os.environ['VG_OUT'] = HERE; os.environ['VG_ONLY'] = '__никакой__'; os.environ.setdefault('VG_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
# на превью и в файле для Sketchfab передние створки и створки на стойках открыты, остальные закрыты, как на снимках 06 и 10; в файле игры закрыты все
DOORS = [n for n in g.PARTS if n.startswith(('door_f_', 'door_o_'))]; DOOR0 = {n: bpy.data.objects[n].matrix_world.copy() for n in DOORS}
for n in DOORS:
    o = bpy.data.objects[n]; D = g.PARTS[n]; o.matrix_world = Matrix.Translation(D['pivot']) @ Matrix.Rotation(math.radians(D['range'][1]), 4, D['axis']) @ Matrix.Translation(-D['pivot']) @ DOOR0[n]
vl.update()
prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 0.4, 0.3), (0.52, 0.72, 0.46), 26.0), ('превью_2_сбоку.png', (0.0, 0.4, 0.3), (-1.0, 0.0, 0.08), 23.0), ('превью_3_сверху.png', (0.0, 0.0, 0.3), (0.05, -0.05, 1.0), 24.0),
                         ('превью_4_хвост.png', (0.0, -3.0, 0.6), (-0.42, -0.86, 0.26), 16.0), ('превью_5_кабина.png', (0.2, 3.6, 0.7), (0.72, 0.55, 0.38), 6.5), ('превью_6_снизу.png', (0.0, 0.0, -0.4), (0.42, 0.28, -0.86), 23.0), ('превью_7_заборник.png', (0.95, 3.0, 0.05), (0.42, 0.88, 0.10), 5.0)):
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
SVG_NOTE = os.environ.get('VG_SVG_NOTE', '')
try: col = json.load(open(os.path.join(HERE, '_снимки', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога хода:', e)
sty = {}
try:
    D_ = json.load(open(os.path.join(HERE, '_стыки', '_стыки.json'), encoding='utf-8'))['детали']; sty = {k: v['плохо'] for k, v in D_.items() if v.get('плохо')}
except Exception as e: print('нет итога стыков:', e)
mk.export(os.path.join(HERE, 'viggen_sketchfab.glb'), os.path.join(HERE, 'viggen.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'viggen_sketchfab.glb')) // 1024, 'КБ')
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
# отчёт и основа паспорта: пока в сцене все детали
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_viggen', weapon='', name='Saab AJS 37 Viggen', name_en='Saab Viggen', glb='viggen.glb', blend='viggen.blend', rev=1,
    build=['build.py', 'viggen_geo.py', 'viggen_detail.py', 'viggen_gear.py', 'uv_viggen.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_gaps.py', '_ось.py', '_уборка.py', '_дыры.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'стыки': dict(плохо=sty, разбор=SVG_NOTE), 'silhouette_iou': {'бок': 'контур поверх снимка 11 (_снимки/нал_бок.jpg), низ поверх снимка 07 (_снимки/нал_низ.jpg, снят под углом, длина растянута примерно на 6 процентов)'}, 'дыры': 'сквозных дыр сверху и снизу 0 (_дыры.py)', 'game': 'игра: ангар и бой, день и вечер, ошибок страницы нет (_проба/стенд); на телефоне не проверено'},
    sketchfab={'title': 'Saab AJS 37 Viggen - Game-Ready Jet', 'lead': 'Single-seat double delta strike jet with large canards in bare silver metal. Moving parts on their own pivots: elevons, canard flaps, rudder, canopy, landing gear and doors. Tandem main wheels, deep nozzle under a top shroud, long wing fairings, oval intakes with dark ducts. Numbers and small markings are fictional.',
               'parts': ['airframe', 'fin and rudder', 'canards', 'canard flaps', 'elevons', 'canopy', 'cockpit', 'nozzle', 'gear', 'gear doors', 'pylons'],
               'tags': ['saab', 'viggen', 'fighter', 'jet', 'aircraft', 'military', 'delta', 'canard', 'game-ready', 'pbr', 'textured', 'blender'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'viggen_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-07). Свои меши по фото viggen_01, 02, 03, 04, 05, 06, 07, 10, 11, 12, 13 и кадрам Mark. Модель одноместная; снимки 08, 09, 11 двухместные: с них только внешний контур, стойки и подвески. Пиксели картинок не использованы. Круг с тремя коронами нарисован заново; номер 38, цифра 4 и таблички придуманные; настоящих регистраций и эмблем нет. Канал заборника глухой. Воздушных тормозов нет: на снимках 03, 07, 10 панели не читаются. Створки реверса без шарнира: не различимы. Карты: цвет без света, нормали по высоте, R затенение, G шероховатость, B металл.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# файл игры: без стоек, створки закрыты; файл шасси: только стойки и метки центра
for n in DOORS: bpy.data.objects[n].matrix_world = DOOR0[n]
vl.update()
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'viggen.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'viggen.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'viggen_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'viggen_gear.glb')) // 1024, 'КБ')
# паспорт: всё в осях игры (после центровки prepare.js, сдвиг по высоте cy)
cy = (MN_M[2] + MX_M[2]) / 2; cz_ = (MN_M[1] + MX_M[1]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-(v.y - cz_), 3)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'viggen_gear.glb'; P['gear_key'] = 'e_viggen_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (высота в файле {round(cy, 4)} м вычтена, длина сдвинута на {round(cz_, 4)} м: щуп на острие носа сдвигает середину габаритов); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы Viggen_paint (один на всё) и Viggen_glass (BLEND, clearGlass)'
P['nozzles_game'] = [GG(g.P3(g.NOZ_A, 0.0, g.NOZ_Y))]; P['nr'] = g.NOZ_R
ST = {nm_: GG(pt) for nm_, pt in g.PYLON_PTS.items() if nm_ != 'pod'}
P['stations_game'] = dict(note='низ пилона; _root - верх пилона в крыле или корпусе. На сторону 2 пилона под крылом и 2 под фюзеляжем. Для mirror() порядок [задний фюзеляжный pylon_r, внешний крыла pylon_o, средний крыла pylon_w, под заборником pylon_f]: игра вешает по массе на индексы 3, 4, 2, 5, 1, 6, 0, 7. Подвески: AGM-65B x2 + Mk 82 x4: Mk 82 на pylon_f и pylon_w, AGM-65B на pylon_o; Hydra x4 + Mk 82 x2: Hydra на pylon_f и pylon_w, Mk 82 на pylon_o; pylon_r пуст.', **ST)
P['pod_game'] = None
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
for nm_, D in g.PARTS.items():
    if D.get('slide'): parts[nm_]['slide_m'] = list(D['range']); parts[nm_]['range_deg'] = None
P['parts'] = parts; P['twin'] = 'одно сопло'
P['clearance_m'] = dict(note='низ оружия минус низ стоек, земля z -2.55 м; габариты w_mk82, w_agm65b, w_lau61 из файлов игры; минимум 0,25', Mk82_под_заборником=1.21, Mk82_средний=1.13, Mk82_внешний=1.19, AGM65B_внешний=1.00, Hydra_под_заборником=1.13, Hydra_средний=1.05)
P['gear_note'] = 'viggen_gear.glb: стойки и колёса, только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. Створки в файле самолёта закрыты. В файле для Sketchfab открыты door_f_* и door_o_*, а door_n_* и door_m_* закрыты, как на снимках 02, 12 на земле; на время уборки открываются все.'
P['swap_notes'] = ['Ключи e_viggen и e_viggen_gear. В META: clearGlass: true, gearModel: e_viggen_gear, paint для шасси, как у других своих самолётов; cls strike, lazy и pod: null оставить, matte убрать: блеск металла нужен.', 'Заменить stations на mirror([pylon_r_r, pylon_o_r, pylon_w_r, pylon_f_r]) из stations_game, без четвёртого числа py: свои пилоны в модели есть. Заменить nozzles на одно сопло nozzles_game и nr.', 'Координаты _game учитывают сдвиг длины: длинный щуп на носу сдвигает середину габаритов, смотри axes.', 'Рецепт prepare.js e_viggen сейчас со старым источником (ja37.glb, tex 1024) и правилами снятия подвесок: заменить на свой, как у e_typhoon, и добавить e_viggen_gear. На стенде файлы прогонялись через рецепт e_f15e.', 'После подмены обязательно seats-gen.js e_viggen: прежняя запись посадки рисует пилоны по старым точкам.', 'Если для e_viggen есть файл models/camo/e_viggen.hi.glb, заменить и его, иначе в ангаре останется старая модель.', 'Новых видов движения нет. Воздушных тормозов нет, створки реверса без шарнира. Закрылки уток canflap_*, элевоны elevon_i, elevon_m, elevon_o.', 'Проверка столкновений подвески со створками и стойками по всему ходу не делалась: только кадры ангара и просвет до земли. На телефоне не проверено.']
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'сопла', P['nozzles_game'], 'точки', {k: v for k, v in ST.items() if not k.endswith('_root')})
