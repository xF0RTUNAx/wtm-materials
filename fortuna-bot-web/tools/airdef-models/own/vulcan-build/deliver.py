# deliver.py - сдача Vulcan B.2: превью, файл для Sketchfab и .blend (стойки выпущены, створки шасси открыты), файл игры (без стоек и створок шасси),
# файл шасси для ангара (стойки и открытые створки, две метки по 1 мм), паспорт и отчёт. После gbuf.py (VUL_TEX=4096) и paint.py (VUL_OUT=папка модели):
#   VUL_DIR="<папка модели>" Blender -b --factory-startup --python build.py --python deliver.py
import json, math, os, sys
HERE = os.environ['VUL_DIR']; sys.path.insert(0, HERE); os.environ['VUL_MAPS'] = HERE; os.environ['VUL_OUT'] = HERE; os.environ['VUL_ONLY'] = '__никакой__'; os.environ.setdefault('VUL_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: без стоек и без створок шасси')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
for n_, d_ in gr.POSE.items(): pose(n_, d_)
vl.update(); prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 0.5, -0.5), (-0.60, 0.62, 0.48), 46.0), ('превью_2_сбоку.png', (0.0, 0.0, 0.4), (-1.0, 0.0, 0.05), 44.0),
                         ('превью_3_сверху.png', (0.0, 0.0, 0.0), (-0.03, -0.03, 1.0), 78.0), ('превью_4_хвост.png', (0.0, Y(26.5), 0.6), (-0.70, -0.62, 0.36), 17.0),
                         ('превью_5_кабина.png', (0.0, Y(6.8), Zg(4.4)), (-0.55, 0.62, 0.50), 8.5), ('превью_6_снизу.png', (0.0, 0.3, -0.8), (-0.10, 0.12, -0.98), 50.0)):
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
col = rd('_live/collide.json'); styk = rd('_стыки/_стыки.json')
mk.export(os.path.join(HERE, 'vulcan_sketchfab.glb'), os.path.join(HERE, 'vulcan.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'vulcan_sketchfab.glb')) // 1024, 'КБ')
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith(('gear', 'door_'))]
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_vulcan', weapon='', name='Vulcan B.2', name_en='Avro Vulcan B.2', glb='vulcan.glb', blend='vulcan.blend', rev=1,
    build=['build.py', 'vul_geo.py', 'vul_detail.py', 'vul_gear.py', 'uv_vul.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_стенд.js', '_run_paint.sh', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'стыки': {k: v.get('плохо') for k, v in (styk.get('детали') or {}).items() if v.get('плохо')},
            'стыки_вблизи': 'canopy_frame: концы переплёта на пороге осмотрены вблизи (_снимки/q/c_can_f.png, c_can_r.png) - щелей нет; fin_c: отмечен вырез под руль, его закрывает руль - ложная тревога',
            'silhouette_iou': {'бок': 'наложение на фото vulcan_04 (_снимки/наложение_04.jpg)', 'сверху': 'наложение на фото vulcan_01 (_снимки/наложение_01.jpg), план крыла выпрямлен по vulcan_03'},
            'game': 'игра (стенд ?paint=1): ангар на стойках, бой день и вечер - три четверти, бок, снизу; ошибок нет; на телефоне не проверено'},
    sketchfab={'title': 'Avro Vulcan B.2 - Game-Ready Bomber', 'lead': 'British Cold War delta-wing bomber in RAF dark green and grey camouflage over light grey undersides. Moving parts on their own pivots: eight elevons, rudder, airbrakes above and below the wing, bomb bay doors with a detailed bay and landing gear with eight-wheel bogies and doors. Wing-root intakes, four nozzles, tail cone, refuelling probe and a two-seat cockpit.',
               'parts': ['airframe', 'delta wing', 'fin and rudder', 'elevons', 'airbrakes', 'bomb bay doors', 'bomb bay', 'cockpit', 'canopy', 'intakes', 'nozzles', 'refuelling probe', 'landing gear', 'underwing pylons'],
               'tags': ['vulcan', 'avro', 'raf', 'bomber', 'delta', 'aircraft', 'military', 'cold-war', 'camouflage', 'game-ready', 'pbr', 'textured'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'vulcan_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-10). Форма построена заново по фото vulcan_01...07, пиксели фото не использованы, знаки нарисованы заново. Схема RAF по vulcan_01, 04, 05: сверху тёмно-зелёный и серый волнистыми полосами (свой рисунок, зеркальный - слово Mark), низ светло-серый. Знаки тип B: круги на консолях сверху и на бортах, красно-синие полосы на киле, номер XQ706 придуман (буквы Q в номерах RAF не было). Гербов и эмблем частей нет. Обтекатель носа серый, колпак киля чёрный. Карты: цвет без света, нормали по высоте, R затенение, G шероховатость, B металл. В файле Sketchfab и .blend стойки выпущены, створки шасси открыты; в файле игры стоек и створок шасси нет.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# файл игры: без стоек и створок шасси; файл шасси: стойки, открытые створки и метки центра
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'vulcan.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'vulcan.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'vulcan_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'vulcan_gear.glb')) // 1024, 'КБ')
# паспорт: всё в осях игры (после центровки prepare.js по габаритам файла игры)
cy = (MN_M[2] + MX_M[2]) / 2; cb = (MN_M[1] + MX_M[1]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-(v.y - cb), 3)]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'vulcan_gear.glb'; P['files']['sketchfab_glb'] = 'vulcan_sketchfab.glb'; P['gear_key'] = 'e_vulcan_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (сдвиг по высоте {round(cy, 4)} м и по длине {round(cb, 4)} м учтён); _gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы VUL_paint (один на всё) и VUL_glass (BLEND, clearGlass). Текстуры собраны в 4096, для игры хватает 2048 (самолёт большой, в кадре плотность как у Hunter при 2048)'
P['nozzles_game'] = [GG(g.P3(g.PIPE_A1 + 0.05, sx * xx, g.Z(g.PIPE_Z))) for sx in (-1, 1) for xx in (g.PIPES[1], g.PIPES[0])]
P['nr'] = round(g.PIPE_R * 0.93, 3); P['dry'] = True; P['gear_bottom_game_y'] = round(mn_g - cy, 3)
P['flares_game'] = [GG(g.P3(29.0, 0.0, g.Z(2.45)))]
ST = {k: GG(v) for k, v in g.STATIONS.items()}
P['stations_game'] = dict(note='Отсек: 8 точек, на сторону 4 (два ряда по длине, x ±0,40). Порядок для mirror() - левая сторона, индекс 3 заполняется первым: 3 - середина отсека, потом 2, 1, 0 (крайние). Точка - низ замка (центр бомбы на 0,05 м + радиус ниже, как вешает игра); бомба 1000 lb (own AN-M65A1) в замке не касается балок, при сбросе с открытыми створками проходит чисто (_collide.py).',
    order_left=[ST['st%d_l' % i] for i in range(4)], **ST)
SH = {k: GG(v) for k, v in g.SHRIKE.items()}
P['stations_shrike_game'] = dict(note='Пилон под каждым крылом со сдвоенной балкой: две Shrike на пилон (o - наружная, i - внутренняя балка). Это отдельный набор точек для подвески «Shrike ×4»: в игре сейчас один список stations на самолёт - для этой подвески нужен свой список (или точки отсека для бомб и пилоны для ракет по типу оружия).',
    order_left=[SH['lo'], SH['li']], **SH)
P['pod_game'] = None
bay = {}
for n_ in ('bay_l', 'bay_r'):
    D = g.PARTS[n_]; bay[n_] = [GG(D['pivot']), G2(D['axis']), 95]
P['bay'] = dict(note='Для bay.js (META.bay): doors - имя: [точка на оси, ось, угол открытия в градусах]; рёбра створок bay_*_ribs - дочерние объекты, поворачиваются вместе. Оси в осях игры (поворот без центровки).',
    doors=bay, sides=dict(L=['bay_l'], R=['bay_r']))
parts = {}
for nm_, D in g.PARTS.items():
    if D.get('kind') == 'slide': parts[nm_] = dict(kind='slide', pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_m=list(D['range']), note=D.get('note', '')); continue
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if nm_ in gr.POSE: parts[nm_]['in_gear_file_deg'] = gr.POSE[nm_]
P['parts'] = parts
P['motion_note'] = 'Элевоны elev1..4_r/l (1 - у фюзеляжа), руль rudder, створки отсека bay_l/bay_r (0 закрыто, 95 открыто) - повороты. Тормозные щитки brake_u*/brake_d* - сдвиг (kind slide, range_m 0…0,44 вдоль axis_gltf): верхние вверх из щелей над крылом, нижние вниз. Створки шасси door_* лежат только в файле стоек, повёрнуты на in_gear_file_deg.'
P['gear_note'] = 'vulcan_gear.glb: стойки (передняя на 2 колеса, основные тележки по 8) и открытые створки ниш, только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. В файле самолёта ни стоек, ни створок шасси нет: обшивка под ними целая, контур створок нарисован швом.'
P['swap_notes'] = [
 'Рецепт prepare.js у e_vulcan старый (чужой avro698.glb, scale 0.93, tex 1024): заменить на own: true, scale 1, nose -z, tex 2048, nTex 2048, pickMesh /./, centerX: true, как у e_f15e; добавить рецепт e_vulcan_gear (две метки по 1 мм не удалять).',
 'Запись старой модели «Avro698» (manilov.ap) убрать из games/airdef/models/credits.js и CREDITS.md (строка `e_vulcan.glb`); сам автор остаётся - у него в игре много других моделей.',
 'models.js e_vulcan: stations - order_left из stations_game (точки в отсеке), internal: true остаётся; nozzles - четыре из nozzles_game, nr, pod: null, dry: true, clearGlass: true, gearModel: e_vulcan_gear при paintOn; bay из паспорта (doors, sides) - створки отсека открываются при сбросе.',
 'Подвеска «Shrike ×4»: ракеты висят под крылом на пилонах (stations_shrike_game), а не в отсеке. Пилоны с балками есть в модели всегда.',
 'META.e_vulcan_gear как у e_f15e_gear (lazy, matte, paint, stations: []). GLB_V для обоих ключей.',
 'Ложные цели: точка flares_game (под хвостовым конусом) вместо старой [0,-3,11.85].',
 'После подмены обязательно: seats-gen.js e_vulcan (таблица посадки подвески), миниатюра (thumbs/air_e_vulcan.webp пересобрать), пара ktx для e_vulcan и e_vulcan_gear.',
 'Старый games/airdef/models/camo/e_vulcan.hi.glb от чужой модели удалить и убрать e_vulcan из models/hi-list.js (HI_PLANES), иначе при «Текстуры: максимум» останется старая.',
 'META e_vulcan: matte не нужен (свой материал paint), как у других своих самолётов.'
]
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(stations=P['stations_game']['order_left'], shrike=SH, nozzles=P['nozzles_game'], nr=P['nr'], bay={k: v for k, v in bay.items()}, gear_bottom=P['gear_bottom_game_y']), open(os.path.join(HERE, 'точки.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'сопла', P['nozzles_game'], 'низ колёс', P['gear_bottom_game_y'])
