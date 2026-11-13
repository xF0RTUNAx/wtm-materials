# deliver.py - сдача F-4: превью, файл для Sketchfab и .blend (со стойками, створки открыты), файл игры (без стоек, створки закрыты), файл шасси для ангара, паспорт и отчёт. После build.py, gbuf.py (4096) и paint.py (SU17_OUT=папка модели):
#   SU17_DIR="<папка модели>" Blender -b --factory-startup --python build.py --python deliver.py
import json, math, os, sys
HERE = os.environ['SU17_DIR']; sys.path.insert(0, HERE); os.environ['SU17_MAPS'] = HERE; os.environ['SU17_OUT'] = HERE; os.environ['SU17_ONLY'] = '__никакой__'; os.environ.setdefault('SU17_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
DOORS = ()
for n_, d_ in DOORS: pose(n_, d_)
vl.update(); prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 0.2, 0.2), (-0.60, 0.62, 0.48), 27.0), ('превью_2_сбоку.png', (0.0, 0.0, 0.4), (-1.0, 0.0, 0.05), 29.0), ('превью_3_сверху.png', (0.0, 0.0, 0.3), (0.05, -0.05, 1.0), 26.0),
                         ('превью_4_хвост.png', (0.0, -6.5, 1.1), (-0.72, -0.60, 0.36), 9.0), ('превью_5_кабина.png', (0.0, 5.6, 1.1), (-0.60, 0.50, 0.62), 5.2), ('превью_6_снизу.png', (0.0, 0.2, -0.3), (0.10, 0.10, -0.98), 26.0)):
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
mk.export(os.path.join(HERE, 'su17_sketchfab.glb'), os.path.join(HERE, 'su17.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'su17_sketchfab.glb')) // 1024, 'КБ')
# ещё два качества для Sketchfab: карты 2048 и 1024 (основной файл - 4096)
ORIG = {t: t.image for t in (tc, to, tn)}
for px, suf in ((2048, '_2k'), (1024, '_1k')):
    for t, im0 in ORIG.items():
        im = im0.copy(); im.scale(px, px); im.pack(); t.image = im
    mk.export(os.path.join(HERE, f'su17_sketchfab{suf}.glb'), None); print('Sketchfab', suf, os.path.getsize(os.path.join(HERE, f'su17_sketchfab{suf}.glb')) // 1024, 'КБ')
for t, im0 in ORIG.items(): t.image = im0
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_su17', weapon='', name='Су-17М4', name_en='Su-17M4', glb='su17.glb', blend='su17.blend', rev=1,
    build=['build.py', 'su17_base.py', 'su17_core.py', 'su17_geo.py', 'su17_gk.py', 'su17_lines.py', 'uv_su17.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'стыки': {k: v.get('плохо') for k, v in (styk.get('детали') or {}).items() if v.get('плохо')}, 'silhouette_iou': {'бок': 'контур поверх чертежа su17_01: сбоку и сверху (_снимки/наложение_01.jpg); IoU не считали'}, 'game': 'игра: ангар и бой, день и вечер (превью-игра); на телефоне не проверено'},
    sketchfab={'title': 'Su-17M4 Fitter-K - Game-Ready Swing-Wing Jet', 'lead': 'Variable-sweep strike fighter in weathered light grey with red stars and a made-up number. Outer wing panels pivot 30-63 deg; the joint is a single seam when swept. Three more liveries as texture sets.',
               'parts': ['airframe', 'pivoting outer wing panels', 'slats', 'flaps', 'ailerons', 'sliding intake cone', 'rear-hinged canopy', 'stabilators', 'rudder', 'four airbrakes', 'chute container lid', 'nozzle', 'eight pylons', 'gear'],
               'tags': ['su-17', 'su17', 'fitter', 'sukhoi', 'soviet', 'fighter-bomber', 'swing-wing', 'jet', 'aircraft', 'military', 'game-ready', 'pbr'],
               'dimensions': f'length {LEN:.2f} m with probe, span {SPAN:.2f} m swept, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps; 2K and 1K versions included', 'based': 'Built from scratch in Blender from reference photos and a three-view drawing.', 'glb': 'su17_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-13). Форма построена заново по картинкам Mark su17_01...11: чертёж su17_01 (26,65 пикс/м) и его крупная вырезка su17_08 для крыла; пиксели фото не использованы, знаки нарисованы заново, номера придуманы. По словам Mark: крыло в сложенном виде единой поверхностью, стык консоли - только шов; широкие законцовки; у консоли задняя кромка срезана на 13 см до самого конца; контейнер парашюта утоплен в основание киля; киль и стабилизаторы прилегают к корпусу. В игру идёт светло-серая окраска (grey), остальные три лежат в окраски/. Оснастки sk_* нет. Не сделано: лючки и антенны снизу, щитки основных ниш шасси, уплотнение стыка консоли.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# файл игры: без стоек, створки закрыты; файл шасси: только стойки и метки центра
for n_, d_ in DOORS: pose(n_, -d_)
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'su17.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'su17.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'su17_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'su17_gear.glb')) // 1024, 'КБ')
# паспорт: всё в осях игры (после центровки prepare.js по габаритам файла игры)
cy = (MN_M[2] + MX_M[2]) / 2; cb = (MN_M[1] + MX_M[1]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-(v.y - cb), 3)]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'su17_gear.glb'; P['files']['sketchfab_glb'] = 'su17_sketchfab.glb'; P['gear_key'] = 'e_su17_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (сдвиг по высоте {round(cy, 4)} м и по длине {round(cb, 4)} м учтён); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы SU17_paint (один на всё) и SU17_glass (BLEND, clearGlass)'
P['nozzles_game'] = [GG(g.P3(g.NOZ_A, 0.0, g.NOZ_Z))]; P['nr'] = g.NOZ_R; P['gear_bottom_game_y'] = round(mn_g - cy, 3)
ST = {k: GG(v) for k, v in g.PYLON_PTS.items()}
P['stations_game'] = dict(note='8 точек, на сторону 4. Порядок для mirror() - левая сторона, от внешней к внутренней: 0 внешний крыльевой пилон (x 2,05), 1 внутренний крыльевой (x 1,12), 2 подфюзеляжный передний (x 0,42), 3 подфюзеляжный задний (x 0,42). Все пилоны на неподвижной части крыла и под фюзеляжем, на поворотных консолях подвески нет. Центр станции - низ пилона по его середине; верх бомбы у точки. Пилоны узкие (10 см), флаг racks не нужен.', order_left=[ST['pylon_o_l'], ST['pylon_i_l'], ST['pylon_f_l'], ST['pylon_a_l']], **{k: v for k, v in ST.items()})
P['pod_game'] = dict(attach=ST['center'], note='контейнер по оси под носовой частью фюзеляжа, на обшивке')
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('parent'): parts[nm_]['parent'] = D['parent']
    if D.get('kind'): parts[nm_]['kind'] = D['kind']
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
P['parts'] = parts
P['wing_sweep'] = dict(file_deg=g.SWEEP, forward_deg=g.SW_MIN, folded_deg=g.SW_MAX, pivot_game={'wing_l': GG(g.pivot_v(-1)), 'wing_r': GG(g.pivot_v(1))}, axis_game=[0, 1, 0],
    forward_rotation_deg={'wing_r': round(g.SW_MAX - g.SW_MIN, 1), 'wing_l': -round(g.SW_MAX - g.SW_MIN, 1)},
    rule='В файле консоли сложены (63). Положение «вперёд» (30): wing_r поворачивается на +33 вокруг +Y игры, wing_l на -33. Дети консоли (slat_*, flap_o_*, ail_*) идут с ней. Подвески на консолях нет.',
    look='В сложенном виде стык - тонкий шов (зазор 4 мм). При развороте вперёд корень консоли уходит под обшивку неподвижной части; у гребня передняя кромка идёт со ступенькой. Размах при 30 около 14,2 м.',
    checked='_collide.py: 25 положений от 30 до 63; пересечение wing × обшивка на 30…61,6 - это заход корня консоли в карман под обшивкой, так задумано')
P['skins'] = dict(note='Окраски на той же развёртке: в файлах игры - grey (светло-серая; Mark 2026-11-13: «в игру пойдёт классическая серая версия, все остальные тоже сделай, будем хранить на будущее»). В папке окраски/ по три карты 4096 и превью: camo4 (четырёхцветная), gst (зелёно-серо-песочная), faded (выгоревшая).', game='grey', shop=['camo4', 'gst', 'faded'])
P['motion_note'] = 'wing_l/r - см. wing_sweep. slat_* 0…20, flap_o_* 0…30, ail_* ±18 (дети консоли); flap_i_* 0…30 на неподвижной части. cone - конус заборника, сдвиг 0…0,20 м (kind slide). canopy - вверх-назад на заднем шарнире, 0…50 (на 4-8 касается дуги козырька). stab_r/l -16…+8, rudder ±20 (на крайних углах задевает киль). brake_u_*/brake_d_* - четыре тормозных щитка на хвостовой части, 0…50. chute_cap - крышка контейнера парашюта. nozzle - створки одним объектом. gear_w_* - доворот колеса при уборке.'
P['gear_note'] = 'su17_gear.glb: носовая стойка (уборка вперёд), основные стойки под неподвижной частью крыла со щитками на ногах и колёсами gear_w_*, открытые створки носовой ниши. Только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. В файле самолёта ниши закрыты (шов в текстуре).'
P['swap_notes'] = [
 'Рецепт prepare.js у e_su17 старый (чужой источник): заменить на own: true, scale 1, nose -z, tex 2048, nTex 2048, pickMesh /./, centerX: true, как у e_mig21n; добавить рецепт e_su17_gear.',
 'models.js e_su17: stations (order_left, 4 на сторону), nozzles один, nr, pod, clearGlass: true, gearModel: e_su17_gear при paintOn. META.e_su17_gear как у e_mig21n_gear. GLB_V для обоих ключей.',
 'Консоли: META pivots + sweep по блоку wing_sweep (в ангаре вперёд, в полёте по скорости). В prepare нужны группы для wing_l / wing_r с детьми slat_*, flap_o_*, ail_*.',
 'Подвески: ФАБ-500 на всех 8 точках чисто (проверено _collide и на стенде ФАБ-500 ×4 + Х-28 ×2). Х-28 (размах оперения 1,93 м) на внутреннем крыльевом пилоне задевает основную стойку и соседей; Х-58 и Х-25МЛ на заднем подфюзеляжном узле задевают ракету на переднем (между узлами 3 м). Длинные ракеты вешать на крыльевые внешние и один из подфюзеляжных, не тандемом.',
 'Длина новой модели со штангой 19,75 м против 18,94 м у прежней (+4 %); размах сложенных 9,94 м.',
 'Убрать из титров прежнего автора e_su17. thumbs/air_e_su17.webp пересобрать.',
 'После подмены обязательно: seats-gen.js e_su17; ktx-models парой для e_su17 и e_su17_gear.',
 'Окраски для магазина: окраски/camo4, окраски/gst, окраски/faded - в игру пока не подключать.'
]
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(stations=P['stations_game']['order_left'], pod=P['pod_game']['attach'], nozzles=P['nozzles_game'], nr=P['nr']), open(os.path.join(HERE, 'точки.json'), 'w', encoding='utf-8'))
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'сопло', P['nozzles_game'], 'контейнер', P['pod_game']['attach'], 'низ колёс', P['gear_bottom_game_y'])
