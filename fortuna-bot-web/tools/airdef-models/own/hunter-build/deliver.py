# deliver.py - сдача Hunter FGA.9: превью, файл для Sketchfab и .blend (со стойками, створки открыты), файл игры (без стоек, створки закрыты), файл шасси для ангара, паспорт и отчёт. После build.py, gbuf.py (4096) и paint.py (HN_OUT=папка модели):
#   HN_DIR="<папка модели>" Blender -b --factory-startup --python build.py --python deliver.py
import json, math, os, sys
HERE = os.environ['HN_DIR']; sys.path.insert(0, HERE); os.environ['HN_MAPS'] = HERE; os.environ['HN_OUT'] = HERE; os.environ['HN_ONLY'] = '__никакой__'; os.environ.setdefault('HN_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
DOORS = (('door_n', 95), ('door_o_r', -88), ('door_o_l', 88))
for n_, d_ in DOORS: pose(n_, d_)
vl.update(); prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 0.2, 0.0), (-0.60, 0.62, 0.48), 21.0), ('превью_2_сбоку.png', (0.0, 0.0, 0.2), (-1.0, 0.0, 0.05), 21.0), ('превью_3_сверху.png', (0.0, 0.0, 0.0), (-0.05, -0.05, 1.0), 20.0),
                         ('превью_4_хвост.png', (0.0, -5.2, 0.7), (-0.72, -0.60, 0.36), 9.0), ('превью_5_кабина.png', (0.0, 4.2, 0.6), (-0.55, 0.62, 0.50), 4.2), ('превью_6_снизу.png', (0.0, 0.2, -0.3), (-0.10, 0.10, -0.98), 19.0)):
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
mk.export(os.path.join(HERE, 'hunter_sketchfab.glb'), os.path.join(HERE, 'hunter.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'hunter_sketchfab.glb')) // 1024, 'КБ')
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_hunter', weapon='', name='Hunter FGA.9', name_en='Hunter FGA.9', glb='hunter.glb', blend='hunter.blend', rev=1,
    build=['build.py', 'hn_geo.py', 'hn_detail.py', 'hn_gear.py', 'uv_hn.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_gaps.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'связность': gaps.get('висит'), 'стыки': {k: v.get('плохо') for k, v in (styk.get('детали') or {}).items() if v.get('плохо')}, 'silhouette_iou': {'бок': 'наложение на фото hunter_01 (_снимки/наложение_01.jpg, лист_1_форма.jpg); вида сверху на фото нет, план по длине 14,0 и размаху 10,3'}, 'game': 'игра: ангар и бой, день и вечер (превью-игра); на телефоне не проверено'},
    sketchfab={'title': 'Hawker Hunter FGA.9 - Game-Ready Jet', 'lead': 'British single-seat ground-attack jet of the 1960s in classic RAF dark green and dark sea grey camouflage over silver undersides. Moving parts on their own pivots: sliding canopy, rudder, trimming tailplane with elevators, flaps, ailerons, ventral airbrake and landing gear with doors. Wing-root intakes, dog-tooth wing leading edge, four cannon troughs and link fairings, brake-chute housing, detailed cockpit with round dials.',
               'parts': ['airframe', 'fin and rudder', 'tailplane', 'elevators', 'flaps', 'ailerons', 'airbrake', 'sliding canopy', 'cockpit', 'intakes', 'guns', 'nozzle', 'gear', 'pylons and rails'],
               'tags': ['hunter', 'hawker', 'raf', 'attack', 'jet', 'aircraft', 'military', 'cold-war', 'camouflage', 'game-ready', 'pbr', 'textured'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'hunter_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-08). Форма построена заново по фото hunter_01...08, пиксели фото не использованы, знаки нарисованы заново. Схема RAF по hunter_06: сверху тёмно-зелёный и тёмно-серый пятнами (свой рисунок), низ серебристый. Знаки: обычные круги RAF на борту и обеих консолях сверху и снизу, полосы на киле, код J и номер XQ518 придуманы (буквы Q в номерах RAF не было), треугольник катапульты, RESCUE, NO STEP. Швы - V-канавки, крышки - плиты с фаской. Карты: цвет без света, нормали по высоте, R затенение, G шероховатость, B металл. В файле Sketchfab и .blend створки шасси открыты, в файле игры закрыты.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# файл игры: без стоек, створки закрыты; файл шасси: только стойки и метки центра
for n_, d_ in DOORS: pose(n_, -d_)
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'hunter.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'hunter.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'hunter_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'hunter_gear.glb')) // 1024, 'КБ')
# паспорт: всё в осях игры (после центровки prepare.js по габаритам файла игры)
cy = (MN_M[2] + MX_M[2]) / 2; cb = (MN_M[1] + MX_M[1]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-(v.y - cb), 3)]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'hunter_gear.glb'; P['files']['sketchfab_glb'] = 'hunter_sketchfab.glb'; P['gear_key'] = 'e_hunter_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (сдвиг по высоте {round(cy, 4)} м и по длине {round(cb, 4)} м учтён); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы HN_paint (один на всё) и HN_glass (BLEND, clearGlass)'
P['nozzles_game'] = [GG(g.P3(g.NOZ_A, 0.0, g.NOZ_Y))]; P['nr'] = g.NOZ_R; P['dry'] = True; P['gear_bottom_game_y'] = round(mn_g - cy, 3)
ST = {k: GG(v) for k, v in g.PYLON_PTS.items()}
P['stations_game'] = dict(note='8 точек, на сторону 4. Порядок для mirror() - левая сторона: индекс 0 внешний рельс НУРС (r2, x 4,5), 1 внутренний рельс (r1, x 4,0), 2 внешний пилон (o, x 3,45), 3 внутренний пилон (i, x 2,75). Игра вешает самое тяжёлое на индекс 3, потом 2, 1, 0. Под фюзеляжем точек нет, баков не рисуем.', order_left=[ST['pylon_r2_l'], ST['pylon_r1_l'], ST['pylon_o_l'], ST['pylon_i_l']], **ST)
P['pod_game'] = None
gb = mn_g - cy
P['checks_clearance'] = dict(note='просвет = низ оружия минус низ колёс, м; оружие висит верхом на точке, высота по габариту own/gbu12.glb 0,491 и own/mk82.glb 0,321; требование для индекса 3 - не меньше 0,25',
    **{nm: {k: round(ST[t][1] - h - gb, 3) for k, t in (('i внутренний пилон (индекс 3)', 'pylon_i_l'), ('o внешний пилон (индекс 2)', 'pylon_o_l'), ('r1 рельс (индекс 1)', 'pylon_r1_l'), ('r2 рельс (индекс 0)', 'pylon_r2_l'))} for nm, h in (('Mk 82', 0.321), ('GBU-12', 0.491))})
parts = {}
for nm_, D in g.PARTS.items():
    if D.get('kind') == 'slide': parts[nm_] = dict(kind='slide', pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_m=list(D['range']), note=D.get('note', '')); continue
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
P['parts'] = parts
P['motion_note'] = 'Новое: фонарь не откидывается, а сдвигается (canopy, kind slide, range_m 0…0,70 вдоль axis_gltf - назад и чуть вверх по рельсам порога). Стабилизатор переставной целиком (stab_*), рули высоты elev_* ходят вместе с ним, у них свои оси. Щиток ноги door_o_* вращается вокруг той же оси, что gear_m_*: 0 - закрыт (стойка убрана), при выпуске уходит с ногой. Остальное - повороты, как у других своих самолётов. Уборка стоек в ниши по форме точно не подгонялась, в файле игры стоек нет.'
P['gear_note'] = 'hunter_gear.glb: стойки и колёса, только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. Створки в файле самолёта закрыты; щиток ноги (door_o_*) в файле самолёта, при показе выпущенных стоек его надо повернуть на -88/+88 (как в parts), иначе нога проходит сквозь закрытый щиток.'
P['swap_notes'] = [
 'Рецепт prepare.js у e_hunter старый (чужой источник hunter.glb manilov.ap, tex 512, groups): заменить на own: true, scale 1, nose -z, tex 2048, nTex 2048, pickMesh /./, centerX: true, как у e_etendard; добавить рецепт e_hunter_gear (две метки по 1 мм не удалять).',
 'models.js e_hunter: новые stations (order_left в этом порядке, старые V с четвёртым аргументом убрать), nozzles один, nr, pod: null, dry: true, clearGlass: true, gearModel: e_hunter_gear при paintOn. META.e_hunter_gear как у e_etendard_gear. GLB_V для обоих ключей.',
 'Фонарь сдвижной (parts.canopy kind slide): если игра умеет только поворот фонаря, оставить закрытым.',
 'Старые файлы: games/airdef/models/camo/e_hunter.hi.glb и thumbs/air_e_hunter.webp от чужой модели - убрать или пересобрать, иначе в ангаре и на карточке останется старая. Автора manilov.ap (Hunter) убрать из credits.js и CREDITS.md, если других его моделей нет.',
 'После подмены обязательно: seats-gen.js e_hunter (таблица посадки подвески).',
 'META e_hunter: matte не нужен (свой материал paint), как у других своих самолётов.'
]
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(stations=P['stations_game']['order_left'], pod=None, nozzle=P['nozzles_game'][0], nr=P['nr']), open(os.path.join(HERE, 'точки.json'), 'w', encoding='utf-8'))
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'сопло', P['nozzles_game'], 'низ колёс', P['gear_bottom_game_y'], 'просвет', P['checks_clearance'])
