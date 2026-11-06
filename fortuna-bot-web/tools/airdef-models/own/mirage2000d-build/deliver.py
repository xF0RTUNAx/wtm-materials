# deliver.py - сдача Mirage 2000D: превью, файл для Sketchfab и .blend (со стойками), файл игры (без стоек, створки закрыты), файл шасси для ангара, паспорт и отчёт. После build.py:
#   M2_DIR="<папка модели>" M2_STAGE=4 M2_TEX=4096 Blender -b --factory-startup --python build.py --python deliver.py
# Карты mirage2000d_color.png, mirage2000d_normal.png, mirage2000d_orm.png лежат в папке модели (paint.py, M2_OUT=папка модели). Развёртка - _проба/uv.npz.
import json, math, os, sys
HERE = os.environ['M2_DIR']; sys.path.insert(0, HERE); os.environ['M2_MAPS'] = HERE; os.environ['M2_OUT'] = HERE; os.environ['M2_ONLY'] = '__никакой__'; os.environ.setdefault('M2_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
# на превью и в файле для Sketchfab передние створки и створки на стойках открыты, остальные закрыты, как на снимках 06 и 10; в файле игры закрыты все
DOORS = [n for n in g.PARTS if n.startswith(('door_f_', 'door_o_'))]; DOOR0 = {n: bpy.data.objects[n].matrix_world.copy() for n in DOORS}
for n in DOORS:
    o = bpy.data.objects[n]; D = g.PARTS[n]; o.matrix_world = Matrix.Translation(D['pivot']) @ Matrix.Rotation(math.radians(D['range'][1]), 4, D['axis']) @ Matrix.Translation(-D['pivot']) @ DOOR0[n]
vl.update()
prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 0.6, 0.3), (0.52, 0.72, 0.46), 24.0), ('превью_2_сбоку.png', (0.0, 0.0, 0.3), (-1.0, 0.0, 0.08), 21.0), ('превью_3_сверху.png', (0.0, 0.0, 0.3), (0.05, -0.05, 1.0), 22.0),
                         ('превью_4_хвост.png', (0.0, -1.0, 0.6), (0.34, -0.78, 0.40), 20.0), ('превью_5_кабина.png', (0.2, 2.8, 0.7), (0.72, 0.55, 0.38), 6.5), ('превью_6_снизу.png', (0.0, 0.0, -0.4), (0.42, 0.28, -0.86), 21.0), ('превью_7_заборник.png', (0.8, 2.6, 0.1), (0.85, 0.45, 0.10), 4.5)):
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
SM2_NOTE = os.environ.get('M2_SM2_NOTE', '')
try: col = json.load(open(os.path.join(HERE, '_снимки', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога хода:', e)
sty = {}
try:
    D_ = json.load(open(os.path.join(HERE, '_стыки', '_стыки.json'), encoding='utf-8'))['детали']; sty = {k: v['плохо'] for k, v in D_.items() if v.get('плохо')}
except Exception as e: print('нет итога стыков:', e)
mk.export(os.path.join(HERE, 'mirage2000d_sketchfab.glb'), os.path.join(HERE, 'mirage2000d.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'mirage2000d_sketchfab.glb')) // 1024, 'КБ')
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
# отчёт и основа паспорта: пока в сцене все детали
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_mirage', weapon='', name='Mirage 2000D', name_en='Mirage 2000D', glb='mirage2000d.glb', blend='mirage2000d.blend', rev=1,
    build=['build.py', 'm2000_geo.py', 'm2000_detail.py', 'm2000_gear.py', 'uv_m2000.py', 'gbuf.py', 'camo_link.py', 'paint.py', '_trial.py', '_collide.py', '_gaps.py', '_ось.py', '_уборка.py', '_дыры.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'стыки': dict(плохо=sty, разбор=SM2_NOTE), 'silhouette_iou': {'бок': 'контур поверх снимка 08 (_снимки/нал_бок.jpg), низ поверх снимка 04 (_снимки/нал_низ.jpg, снят под углом, сверка примерная)'}, 'дыры': 'сквозных дыр сверху и снизу 0 (_дыры.py)', 'хаки': 'одна связная область на верхе, низе и бортах (camo_link.py): было 15', 'game': 'игра: ангар и бой, день и вечер, ошибок страницы нет (_проба/стенд); на телефоне не проверено'},
    sketchfab={'title': 'Mirage 2000D - Game-Ready Jet', 'lead': 'Two-seat delta wing strike jet in olive and grey camouflage. Moving parts on their own pivots: elevons, slats, rudder, four air brakes, sliding intake cones, canopy, landing gear and doors. Two seat cockpit, nozzle with petals, dark intake ducts. Markings, numbers and the tail emblem are fictional.',
               'parts': ['airframe', 'fin and rudder', 'elevons', 'slats', 'air brakes', 'intake cones', 'canopy', 'cockpit', 'nozzle', 'gear', 'gear doors', 'pylons'],
               'tags': ['mirage', 'mirage2000', 'fighter', 'jet', 'aircraft', 'military', 'delta', 'twoseat', 'game-ready', 'pbr', 'textured', 'blender'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'mirage2000d_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-06). Свои меши по фото m2000_01, 03, 04, 05, 06, 07, 08, 10 и кадрам Mark. Пиксели картинок не использованы. Знаки нарисованы заново: серые круговые знаки, номер M-27, эмблема с птицей и таблички придуманные, чужих эмблем и настоящих номеров нет. Штанги дозаправки нет: Mark попросил убрать (2026-11-06), функция probe() осталась в m2000_geo.py. Гака нет: на снимках не читается. Канал заборника глухой. Карты: цвет без света, нормали по высоте, R затенение, G шероховатость, B металл.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# файл игры: без стоек, створки закрыты; файл шасси: только стойки и метки центра
for n in DOORS: bpy.data.objects[n].matrix_world = DOOR0[n]
vl.update()
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'mirage2000d.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'mirage2000d.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'mirage2000d_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'mirage2000d_gear.glb')) // 1024, 'КБ')
# паспорт: всё в осях игры (после центровки prepare.js, сдвиг по высоте cy)
cy = (MN_M[2] + MX_M[2]) / 2; cz_ = (MN_M[1] + MX_M[1]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-(v.y - cz_), 3)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'mirage2000d_gear.glb'; P['gear_key'] = 'e_mirage_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (высота в файле {round(cy, 4)} м вычтена, длина сдвинута на {round(cz_, 4)} м: щуп на острие носа сдвигает середину габаритов); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы M2000_paint (один на всё) и M2000_glass (BLEND, clearGlass)'
P['nozzles_game'] = [GG(g.P3(g.NOZ_A, 0.0, g.NOZ_Y))]; P['nr'] = g.NOZ_R
ST = {nm_: GG(pt) for nm_, pt in g.PYLON_PTS.items() if nm_ != 'pod'}
P['stations_game'] = dict(note='низ пилона; _root - верх пилона в крыле или корпусе. На сторону 2 пилона под крылом и 2 под фюзеляжем. Для mirror() порядок [фюзеляж передний pylon_f, фюзеляж задний pylon_r, внешний pylon_o, внутренний pylon_i]: игра вешает по массе на индексы 3, 4, 2, 5, 1, 6, 0, 7. При подвеске GBU-12 x2 + JDAM x2 + помехи: JDAM на внутренних, станция помех (тяжелее GBU-12) на внешнем, GBU-12 на другом внешнем и на заднем под фюзеляжем.', **ST)
P['pod_game'] = dict(attach=GG(g.PYLON_PTS['pod']), note='центр снизу, низ балки')
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
for nm_, D in g.PARTS.items():
    if D.get('slide'): parts[nm_]['slide_m'] = list(D['range']); parts[nm_]['range_deg'] = None
P['parts'] = parts; P['twin'] = 'одно сопло'
P['clearance_m'] = dict(note='низ оружия минус низ стоек, земля z -2.10 м; габариты w_gbu31, w_gbu12, w_ecm_w из файлов игры; минимум 0,25', JDAM_внутренний=0.71, станция_помех_внешний=0.79, GBU12_внешний=0.89, GBU12_задний=0.77, контейнер_прицела='по кадрам ангара до земли далеко, число не считалось')
P['gear_note'] = 'mirage2000d_gear.glb: стойки и колёса, только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. Створки в файле самолёта закрыты. В файле для Sketchfab открыты door_f_* и door_o_*, а door_n_* и door_m_* закрыты: при выпущенном шасси так и на снимках 06, 10; на время уборки открываются все.'
P['swap_notes'] = ['Ключи e_mirage и e_mirage_gear. В META: clearGlass: true, gearModel: e_mirage_gear, paint для шасси, как у других своих самолётов; cls strike и lazy оставить.', 'Заменить stations на mirror([pylon_f_r, pylon_r_r, pylon_o_r, pylon_i_r]) из stations_game: без четвёртого числа py, своих пилонов в модели хватает. Заменить pod на pod_game, nozzles на одно сопло nozzles_game, nr на новое значение.', 'Рецепт prepare.js e_mirage сейчас со старым источником (mirage2000.glb, tex 512): заменить на свой, как у e_typhoon, и добавить e_mirage_gear. На стенде файлы прогонялись через рецепт e_f15e.', 'После подмены обязательно seats-gen.js e_mirage: прежняя запись посадки рисует пилоны по старым точкам.', 'Ангар берёт отдельный файл models/camo/e_mirage.hi.glb: его тоже заменить, иначе в ангаре останется старая модель.', 'Конусы заборников cone_r, cone_l двигаются сдвигом вдоль оси: в parts поле slide_m в метрах вместо угла, ось вперёд. Новый вид движения коду игры не нужен: без анимации конусы просто стоят в нуле.', 'Штанги дозаправки и гака в модели нет. Воздушные тормоза четыре: brake_t_*, brake_b_*, ход 40 градусов.', 'Проверка столкновений подвески со створками и стойками по всему ходу не делалась: только кадры ангара и просвет до земли. На телефоне не проверено.']
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'сопла', P['nozzles_game'], 'контейнер', P['pod_game']['attach'], 'точки', {k: v for k, v in ST.items() if not k.endswith('_root')})
