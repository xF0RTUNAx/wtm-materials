# deliver.py - сдача F-4: превью, файл для Sketchfab и .blend (со стойками, створки открыты), файл игры (без стоек, створки закрыты), файл шасси для ангара, паспорт и отчёт. После build.py, gbuf.py (4096) и paint.py (MIG21_OUT=папка модели):
#   MIG21_DIR="<папка модели>" Blender -b --factory-startup --python build.py --python deliver.py
import json, math, os, sys
HERE = os.environ['MIG21_DIR']; sys.path.insert(0, HERE); os.environ['MIG21_MAPS'] = HERE; os.environ['MIG21_OUT'] = HERE; os.environ['MIG21_ONLY'] = '__никакой__'; os.environ.setdefault('MIG21_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
DOORS = ()
for n_, d_ in DOORS: pose(n_, d_)
vl.update(); prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 0.2, 0.2), (-0.60, 0.62, 0.48), 22.0), ('превью_2_сбоку.png', (0.0, 0.2, 0.3), (-1.0, 0.0, 0.05), 23.0), ('превью_3_сверху.png', (0.0, 0.0, 0.3), (0.05, -0.05, 1.0), 21.0),
                         ('превью_4_хвост.png', (0.0, -5.2, 0.9), (-0.72, -0.60, 0.36), 7.5), ('превью_5_кабина.png', (0.0, 3.6, 0.9), (-0.60, 0.50, 0.62), 4.8), ('превью_6_снизу.png', (0.0, 0.2, -0.3), (0.10, 0.10, -0.98), 21.0)):
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
mk.export(os.path.join(HERE, 'mig21_sketchfab.glb'), os.path.join(HERE, 'mig21.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'mig21_sketchfab.glb')) // 1024, 'КБ')
# ещё два качества для Sketchfab: карты 2048 и 1024 (основной файл - 4096)
ORIG = {t: t.image for t in (tc, to, tn)}
for px, suf in ((2048, '_2k'), (1024, '_1k')):
    for t, im0 in ORIG.items():
        im = im0.copy(); im.scale(px, px); im.pack(); t.image = im
    mk.export(os.path.join(HERE, f'mig21_sketchfab{suf}.glb'), None); print('Sketchfab', suf, os.path.getsize(os.path.join(HERE, f'mig21_sketchfab{suf}.glb')) // 1024, 'КБ')
for t, im0 in ORIG.items(): t.image = im0
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_mig21n', weapon='', name='МиГ-21бис', name_en='MiG-21bis', glb='mig21.glb', blend='mig21.blend', rev=1,
    build=['build.py', 'mig21_base.py', 'mig21_geo.py', 'mig21_gk.py', 'mig21_lines.py', 'uv_mig21.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'стыки': {k: v.get('плохо') for k, v in (styk.get('детали') or {}).items() if v.get('плохо')}, 'silhouette_iou': {'бок': 'контур поверх чертежа mig21_04: сверху и сбоку (_снимки/наложение_04.jpg); IoU не считали'}, 'game': 'игра: ангар и бой, день и вечер (превью-игра); на телефоне не проверено'},
    sketchfab={'title': 'MiG-21bis Fishbed - Game-Ready Jet', 'lead': 'Delta-wing interceptor in three-tone striped camouflage with light-blue undersides, heavy weathering, made-up number and own roundels. Moving parts on real pivots; two more liveries (orange, silver) as texture sets.',
               'parts': ['airframe', 'sliding intake cone', 'side-hinged canopy', 'stabilators', 'rudder', 'ailerons', 'flaps', 'three airbrakes', 'chute container lid', 'nozzle', 'four pylons', 'gear'],
               'tags': ['mig-21', 'mig21', 'fishbed', 'mikoyan', 'soviet', 'fighter', 'jet', 'aircraft', 'military', 'cold-war', 'game-ready', 'pbr'],
               'dimensions': f'length {LEN:.2f} m with pitot, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps; 2K and 1K versions included', 'based': 'Built from scratch in Blender from reference photos and three-view drawings.', 'glb': 'mig21_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-12). Форма построена заново по картинкам Mark mig21_01...12: чертёж mig21_04 (сверху 18,04 пикс/м, сбоку 19,1 пикс/м), чертёж 12 и фото; пиксели фото не использованы, знаки нарисованы заново, номера придуманы. По слову Mark: подфюзеляжного бака нет (остался узел pylon_c), в игру идёт трёхцветный камуфляж (camo), оранжевый и серебристый лежат в папке окраски/ для магазина; износ усилен. Оснастки sk_* для Sketchfab нет. Не сделано: широкий гаргрот с плавным переходом в борта, створки перепуска у заборника, щитки основных ниш шасси.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# файл игры: без стоек, створки закрыты; файл шасси: только стойки и метки центра
for n_, d_ in DOORS: pose(n_, -d_)
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'mig21.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'mig21.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'mig21_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'mig21_gear.glb')) // 1024, 'КБ')
# паспорт: всё в осях игры (после центровки prepare.js по габаритам файла игры)
cy = (MN_M[2] + MX_M[2]) / 2; cb = (MN_M[1] + MX_M[1]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-(v.y - cb), 3)]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'mig21_gear.glb'; P['files']['sketchfab_glb'] = 'mig21_sketchfab.glb'; P['gear_key'] = 'e_mig21n_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (сдвиг по высоте {round(cy, 4)} м и по длине {round(cb, 4)} м учтён); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы MIG21_paint (один на всё) и MIG21_glass (BLEND, clearGlass)'
P['nozzles_game'] = [GG(g.P3(g.NOZ_A, 0.0, g.NOZ_Z))]; P['nr'] = g.NOZ_R; P['gear_bottom_game_y'] = round(mn_g - cy, 3)
ST = {k: GG(v) for k, v in g.PYLON_PTS.items()}
P['stations_game'] = dict(note='4 точки под крылом, на сторону 2. Порядок для mirror() - левая сторона: 0 внешний пилон, 1 внутренний пилон (последний индекс заполняется первым). Центр станции - низ пилона по его середине; верх бомбы у точки. Подфюзеляжный узел center - низ pylon_c, бака в модели нет.', order_left=[ST['pylon_o_l'], ST['pylon_i_l']], **{k: v for k, v in ST.items()})
P['pod_game'] = dict(attach=ST['center'], note='подфюзеляжный узел pylon_c по оси; бака нет (Mark: «убери бак снизу»)')
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('kind'): parts[nm_]['kind'] = D['kind']
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
P['parts'] = parts
P['skins'] = dict(note='Окраски на той же развёртке: в файлах игры - camo (трёхцветный камуфляж). Для магазина на будущее: окраски/orange и окраски/silver - по три карты 4096 (mig21_color.png, mig21_orm.png, mig21_normal.png) и превью. Слова Mark 2026-11-12: «в игру пока добавим в 3 цвета, остальные 2 (оранжевый и классический белый) будут храниться для магазина».', game='camo', shop=['orange', 'silver'])
P['motion_note'] = 'cone - конус заборника, сдвиг вдоль оси 0…0,20 м (kind slide). canopy - фонарь откидывается вправо на продольной петле по правому борту, 0…95; козырёк неподвижный. stab_r/l - половины стабилизатора -18…+8. rudder ±20 (на крайних углах задевает киль). ail_* ±20, flap_* 0…45. brake_f_r/l - передние щитки 0…25, brake_r - задний 0…40. chute_cap - крышка контейнера парашюта вверх на 95. nozzle - створки сопла одним объектом, раскрытие масштабом по радиусу. gear_w_* - колесо доворачивается на 87 при уборке, чтобы встать в нише вертикально.'
P['gear_note'] = 'mig21_gear.glb: носовая стойка (уборка вперёд), основные стойки со щитками на ногах и колёсами gear_w_*, открытые створки носовой ниши gear_door_n_*. Только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. В файле самолёта ниши закрыты (шов в текстуре).'
P['swap_notes'] = [
 'Рецепт prepare.js у e_mig21n старый (чужой источник): заменить на own: true, scale 1, nose -z, tex 2048, nTex 2048, pickMesh /./, centerX: true, как у e_f4; добавить рецепт e_mig21n_gear.',
 'models.js e_mig21n: stations теперь 2 на сторону (order_left), nozzles один, nr, pod = подфюзеляжный узел или null, clearGlass: true, gearModel: e_mig21n_gear при paintOn. META.e_mig21n_gear как у e_f4_gear. GLB_V для обоих ключей.',
 'Длина новой модели с ПВД 15,90 м против 14,70 м у прежней (+8 %): проверить камеру, zones.html и всё, что завязано на длину.',
 'Подвески: ФАБ-500 ×2 сняты на стенде на внутренних пилонах, ошибок нет; _collide: ФАБ-500, ФАБ-250, ОФАБ-250 на всех 4 пилонах не задевают шасси, закрылки 45 и щитки. Вариант ФАБ-250 ×2 + ОФАБ-250 ×2 на стенде не снимался.',
 'Убрать из титров прежнего автора e_mig21n. thumbs/air_e_mig21n.webp пересобрать.',
 'После подмены обязательно: seats-gen.js e_mig21n; ktx-models парой для e_mig21n и e_mig21n_gear.',
 'Окраски для магазина: окраски/orange и окраски/silver (карты на той же развёртке), в игру пока не подключать.'
]
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(stations=P['stations_game']['order_left'], pod=P['pod_game']['attach'], nozzles=P['nozzles_game'], nr=P['nr']), open(os.path.join(HERE, 'точки.json'), 'w', encoding='utf-8'))
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'сопло', P['nozzles_game'], 'контейнер', P['pod_game']['attach'], 'низ колёс', P['gear_bottom_game_y'])
