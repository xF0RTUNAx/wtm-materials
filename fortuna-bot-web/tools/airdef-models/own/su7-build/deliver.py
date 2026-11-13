# deliver.py - сдача F-4: превью, файл для Sketchfab и .blend (со стойками, створки открыты), файл игры (без стоек, створки закрыты), файл шасси для ангара, паспорт и отчёт. После build.py, gbuf.py (4096) и paint.py (SU7_OUT=папка модели):
#   SU7_DIR="<папка модели>" Blender -b --factory-startup --python build.py --python deliver.py
import json, math, os, sys
HERE = os.environ['SU7_DIR']; sys.path.insert(0, HERE); os.environ['SU7_MAPS'] = HERE; os.environ['SU7_OUT'] = HERE; os.environ['SU7_ONLY'] = '__никакой__'; os.environ.setdefault('SU7_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
DOORS = ()
for n_, d_ in DOORS: pose(n_, d_)
vl.update(); prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 0.2, 0.2), (-0.60, 0.62, 0.48), 27.0), ('превью_2_сбоку.png', (0.0, 0.0, 0.4), (-1.0, 0.0, 0.05), 29.0), ('превью_3_сверху.png', (0.0, 0.0, 0.3), (0.05, -0.05, 1.0), 26.0),
                         ('превью_4_хвост.png', (0.0, -5.7, 1.0), (-0.72, -0.60, 0.36), 9.0), ('превью_5_кабина.png', (0.0, 5.1, 0.8), (-0.60, 0.50, 0.62), 5.2), ('превью_6_снизу.png', (0.0, 0.2, -0.3), (0.10, 0.10, -0.98), 26.0)):
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
mk.export(os.path.join(HERE, 'su7_sketchfab.glb'), os.path.join(HERE, 'su7.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'su7_sketchfab.glb')) // 1024, 'КБ')
# ещё два качества для Sketchfab: карты 2048 и 1024 (основной файл - 4096)
ORIG = {t: t.image for t in (tc, to, tn)}
for px, suf in ((2048, '_2k'), (1024, '_1k')):
    for t, im0 in ORIG.items():
        im = im0.copy(); im.scale(px, px); im.pack(); t.image = im
    mk.export(os.path.join(HERE, f'su7_sketchfab{suf}.glb'), None); print('Sketchfab', suf, os.path.getsize(os.path.join(HERE, f'su7_sketchfab{suf}.glb')) // 1024, 'КБ')
for t, im0 in ORIG.items(): t.image = im0
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_su7b', weapon='', name='Су-7БМК', name_en='Su-7BMK', glb='su7.glb', blend='su7.blend', rev=1,
    build=['build.py', 'su7_base.py', 'su7_core.py', 'su7_geo.py', 'su7_gk.py', 'su7_lines.py', 'uv_su7.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'стыки': {k: v.get('плохо') for k, v in (styk.get('детали') or {}).items() if v.get('плохо')}, 'silhouette_iou': {'бок': 'контур поверх чертежа su7_01: сбоку и сверху (_снимки/наложение_01.jpg); IoU не считали'}, 'game': 'игра: ангар и бой, день и вечер (превью-игра); на телефоне не проверено'},
    sketchfab={'title': 'Su-7BMK Fitter-A - Game-Ready Strike Fighter', 'lead': 'Swept-wing strike fighter in weathered olive green with red stars and a made-up number. Sliding canopy, moving intake cone, flaps, ailerons, stabilators, rudder, four airbrakes, chute lid and full gear.',
               'parts': ['airframe', 'flaps', 'ailerons', 'sliding intake cone', 'sliding canopy', 'stabilators', 'rudder', 'four airbrakes', 'chute container lid', 'nozzle', 'six pylons', 'gear'],
               'tags': ['su-7', 'su7', 'fitter', 'sukhoi', 'soviet', 'fighter-bomber', 'swept-wing', 'jet', 'aircraft', 'military', 'game-ready', 'pbr'],
               'dimensions': f'length {LEN:.2f} m with probe, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps; 2K and 1K versions included', 'based': 'Built from scratch in Blender from reference photos and three-view drawings.', 'glb': 'su7_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-13). Форма построена заново по картинкам Mark su7_01...10: вид сбоку по фото 01 (0,0214 м/пикс), крыло в плане по чертежу 10; пиксели фото не использованы, знаки нарисованы заново, номера придуманы. По словам Mark: баков нет; задняя кромка крыла у фюзеляжа идёт поперёк потока, дальше стреловидная; корень крыла утоплен в фюзеляж; фонарь вплотную к козырьку; у козырька цельная окантовка, стойки лобового стекла входят в дугу и в окантовку; приборная доска отодвинута от стекла; звёзды на крыле между бортом и гребнем. В игру идёт оливковая окраска (olive), металлическая (silver) лежит в окраски/. Оснастки sk_* нет. Не сделано: ниши тормозных щитков (при открытии больше 21 градуса передняя кромка щитка заходит в обшивку), щитки основных ниш шасси, лючки и антенны снизу.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# файл игры: без стоек, створки закрыты; файл шасси: только стойки и метки центра
for n_, d_ in DOORS: pose(n_, -d_)
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'su7.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'su7.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'su7_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'su7_gear.glb')) // 1024, 'КБ')
# паспорт: всё в осях игры (после центровки prepare.js по габаритам файла игры)
cy = (MN_M[2] + MX_M[2]) / 2; cb = (MN_M[1] + MX_M[1]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-(v.y - cb), 3)]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'su7_gear.glb'; P['files']['sketchfab_glb'] = 'su7_sketchfab.glb'; P['gear_key'] = 'e_su7b_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (сдвиг по высоте {round(cy, 4)} м и по длине {round(cb, 4)} м учтён); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы SU7_paint (один на всё) и SU7_glass (BLEND, clearGlass)'
P['nozzles_game'] = [GG(g.P3(g.NOZ_A, 0.0, g.NOZ_Z))]; P['nr'] = g.NOZ_R; P['gear_bottom_game_y'] = round(mn_g - cy, 3)
ST = {k: GG(v) for k, v in g.PYLON_PTS.items()}
P['stations_game'] = dict(note='6 точек, на сторону 3. Порядок для mirror() - левая сторона: 0 внешний крыльевой пилон (x 3,40), 1 внутренний крыльевой (x 2,60), 2 подфюзеляжный (x 0,40). Игра кладёт тяжёлое на последние точки: ФАБ-500 попадают под фюзеляж, ФАБ-250 на внутренние крыльевые. Центр станции - низ пилона по его середине; верх бомбы у точки. Пилоны узкие (10 см).', order_left=[ST['pylon_o_l'], ST['pylon_i_l'], ST['pylon_f_l']], **{k: v for k, v in ST.items()})
P['pod_game'] = dict(attach=ST['center'], note='контейнер по оси позади подфюзеляжных пилонов, между основными стойками (a 8,8); ближе к носу мешают носовая стойка и ФАБ-500 на подфюзеляжных точках')
P['loads_check'] = dict(tool='_collide.py: сетка модели со стойками и створками, закрылки 24, щитки 50; бомбы из tools/airdef-models/own; обе стороны сразу; верх бомбы в точке',
    ok=['ФАБ-500 ×2 под фюзеляжем + ФАБ-250 ×2 на внутренних крыльевых', 'ФАБ-250 ×4 на крыльевых + ФАБ-100 ×2 под фюзеляжем', 'ФАБ-500 на всех шести точках', 'ФАБ-250 ×4 на крыльевых + ФАБ-100 ×4 на сдвоенных держателях под фюзеляжем: тандемом (сдвиг по длине ±0,60 м, ниже на 0,12 м) и бок о бок (сдвиг по x ±0,16 м, ниже на 0,12 м)'],
    mbd='Сдвоенные держатели (МБД) под ФАБ-100 на подфюзеляжных точках влезают в обоих вариантах; сами держатели не смоделированы. Загрузку «ФАБ-250 ×4 + ФАБ-100 ×4» можно оставить, если игра умеет вешать две бомбы на точку; иначе ФАБ-250 ×4 + ФАБ-100 ×2.', ground_clearance_m='от 0,49 (все ФАБ-500) до 0,73')
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('parent'): parts[nm_]['parent'] = D['parent']
    if D.get('kind'): parts[nm_]['kind'] = D['kind']
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
P['parts'] = parts
P['skins'] = dict(note='Окраски на той же развёртке: в файлах игры - olive (оливковый верх, светло-серый низ; Mark 2026-11-13: «берём только зелёный и металлический, зелёный будет уже в игре, металлический будем хранить для будущих обновлений»). В папке окраски/silver три карты 4096 и превью: металл под лаком, красный номер 64.', game='olive', shop=['silver'])
P['motion_note'] = 'flap_* 0…24 (больше - задевает обшивку), ail_* ±18. cone - конус заборника, сдвиг 0…0,20 м (kind slide). canopy - сдвиг назад и чуть вверх 0…0,75 м (kind slide), canopy_glass - дочерний. stab_r/l -16…+8, rudder ±20. brake_u_*/brake_d_* - четыре тормозных щитка на хвостовой части, 0…50; ниш под них нет, с 21 градуса передняя кромка щитка заходит в обшивку. chute_cap - крышка контейнера парашюта, 0…-95. nozzle - створки одним объектом. gear_w_* - доворот колеса при уборке. Баков нет.'
P['gear_note'] = 'su7_gear.glb: носовая стойка (уборка вперёд), основные стойки под крылом со щитками на ногах и колёсами gear_w_*, открытые створки носовой ниши. Только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. В файле самолёта ниши закрыты (шов в текстуре).'
P['swap_notes'] = [
 'Рецепт prepare.js у e_su7b старый (чужой источник): заменить на own: true, scale 1, nose -z, tex 2048, nTex 2048, pickMesh /./, centerX: true, как у e_su17; добавить рецепт e_su7b_gear.',
 'models.js e_su7b: stations = mirror(order_left) - теперь 3 на сторону (было 4), nozzles один, nr, pod (раньше null), clearGlass: true, gearModel: e_su7b_gear при paintOn. META.e_su7b_gear как у e_su17_gear. GLB_V для обоих ключей.',
 'Подвижных консолей нет, блок sweep не нужен. Именованные части - см. parts; у canopy и cone kind slide.',
 'Загрузки: «ФАБ-500 ×2 + ФАБ-250 ×2» ложится как есть. «ФАБ-250 ×4 + ФАБ-100 ×4» - 8 бомб на 6 точек: см. loads_check.mbd.',
 'Баков в файлах нет (слово Mark).',
 'Убрать из титров прежнего автора e_su7b. thumbs/air_e_su7b.webp пересобрать.',
 'После подмены обязательно: seats-gen.js e_su7b; ktx-models парой для e_su7b и e_su7b_gear.',
 'Окраска для магазина: окраски/silver - в игру пока не подключать.'
]
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(stations=P['stations_game']['order_left'], pod=P['pod_game']['attach'], nozzles=P['nozzles_game'], nr=P['nr']), open(os.path.join(HERE, 'точки.json'), 'w', encoding='utf-8'))
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'сопло', P['nozzles_game'], 'контейнер', P['pod_game']['attach'], 'низ колёс', P['gear_bottom_game_y'])
