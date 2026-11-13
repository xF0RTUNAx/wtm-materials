# deliver.py - сдача Су-24М (из deliver.py МиГ-23БН): превью, файл игры (без стоек; створки закрыты, консоли сложены 69°, как задал главный чат), файл шасси для ангара
# (стойки, открытые створки door_*_g, две метки по 1 мм), паспорт и отчёт; файл Sketchfab и .blend - стоянка со стойками и оснасткой sk_* (свой атлас S 2048) и клипами
# «Controls» и «Wing sweep». После gbuf.py (SU_TEX=4096) и paint.py (SU_TEX=4096 SU_SCHEME=vks SU_OUT=<папка модели>). SU_SWEEP не задавать (файл - 69°):
#   SU_STAGE=4 Blender -b --factory-startup --python build.py --python deliver.py
import json, math, os, sys, struct
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Су-24М'
sys.path.insert(0, HERE); os.environ['SU_MAPS'] = HERE; os.environ['SU_OUT'] = HERE; os.environ['SU_ONLY'] = '__никакой__'; os.environ.setdefault('SU_SPP', '96')
os.environ.pop('SU_NOSHOTS', None)
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# ── файлы игры ──')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
from mathutils import Vector, Matrix, Euler
import su_sk
MESH = lambda: [o for o in sc.objects if o.type == 'MESH']
GEAR = [o for o in MESH() if o.name.startswith('gear')]
TMT = g.TM()                                                                       # точки из единиц чертежа (P3) в метры
P3T = lambda a, x, z: TMT @ g.P3(a, x, z)
# ── превью: в полёте консоли 16°, на стоянке - как в файле (69°), со стойками и открытыми створками ──
for o in GEAR: o.hide_render = True
prev = []
sweep_to(0.0)
for nm, tg, dv, dist in (('превью_1_полёт.png', (0.0, 0.0, 0.0), (-0.48, 0.55, 0.42), 30.0), ('превью_2_сверху.png', (0.0, 0.0, 0.0), (0.02, -0.02, 1.0), 31.0),
                         ('превью_3_снизу.png', (0.0, 0.0, 0.0), (0.10, 0.12, -0.98), 31.0)):
    shot(nm, tg, dv, dist, wd=1920, h=1080); prev.append(nm)
sweep_to(FILE_SW)
for o in GEAR: o.hide_render = False
for n_, d_ in gr.POSE.items(): pose(n_, d_)
vl.update()
for nm, tg, dv, dist in (('превью_4_общий.png', (0.0, 1.0, -0.3), (-0.62, 0.65, 0.30), 29.0), ('превью_5_сбоку.png', (0.0, 0.3, -0.2), (-1.0, 0.02, 0.05), 33.0),
                         ('превью_6_нос.png', (0.0, Y(5.5), 0.3), (-0.62, 0.72, 0.25), 8.5), ('превью_7_хвост.png', (0.0, Y(19.5), 1.6), (-0.80, -0.48, 0.30), 8.5),
                         ('превью_8_сзади.png', (0.0, -1.0, 0.0), (0.62, -0.70, 0.28), 28.0), ('превью_9_шасси.png', (1.2, Y(12.8), -1.2), (0.70, 0.62, -0.12), 6.0)):
    shot(nm, tg, dv, dist, wd=1920, h=1080); prev.append(nm)
for n_, d_ in gr.POSE.items(): pose(n_, -d_)
vl.update(); print('превью', prev)
pts = [o.matrix_world @ v.co for o in MESH() for v in o.data.vertices]; mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
def rd(f):
    try: return json.load(open(os.path.join(HERE, f), encoding='utf-8'))
    except Exception as e: print('нет', f, e); return {}
col_ = rd('_live/collide.json'); styk = rd('_стыки/_стыки.json')
COLS = {o.name: list(o.users_collection) for o in MESH()}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in MESH() for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
TRIS_G = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in MESH())
SF = os.path.join(HERE, '_live', 'sf'); os.makedirs(SF, exist_ok=True)                    # для стенда: вариант для ангара без створок и (в игре их прячет gearHide)
HID = [o for o in MESH() if o.name.startswith('door_')]
for o in HID:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); mk.export(os.path.join(SF, 'su24_hangar.glb'), None)
for o in HID:
    for c in COLS[o.name]: c.objects.link(o)
vl.update()
mk.export(os.path.join(HERE, 'su24.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'su24.glb')) // 1024, 'КБ', TRIS_G, 'тр.')
OTHER = [o for o in MESH()]
COPIES = []
for n_ in list(gr.POSE):
    o = bpy.data.objects.get(n_)
    if o is None: continue
    c = o.copy(); c.data = o.data; c.name = n_ + '_g'; c.parent = None; c.matrix_world = o.matrix_world.copy(); COLS[GEAR[0].name][0].objects.link(c); COPIES.append(c)
    D = g.PARTS[n_]; T = D['pivot']; c.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(gr.POSE[n_]), 4, D['axis']) @ Matrix.Translation(-T) @ c.matrix_world
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in OTHER:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update()
GP = [o.matrix_world @ v.co for o in GEAR + COPIES for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'su24_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'su24_gear.glb')) // 1024, 'КБ', sorted(o.name for o in GEAR + COPIES))
TRIS_GEAR = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in GEAR + COPIES)
bpy.data.objects.remove(oa_); bpy.data.meshes.remove(ma_)
for c in COPIES: bpy.data.objects.remove(c)
for o in OTHER:
    for c in COLS[o.name]: c.objects.link(o)
vl.update()
# ── паспорт и отчёт (оси игры: центр по габаритам файла игры) ──
cy = (MN_M[2] + MX_M[2]) / 2; cb = (MN_M[1] + MX_M[1]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-(v.y - cb), 3)]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
sweep_to(0.0); vl.update(); p16 = [o.matrix_world @ v.co for o in MESH() for v in o.data.vertices]; SPAN16 = round(max(p.x for p in p16) - min(p.x for p in p16), 3); sweep_to(FILE_SW); vl.update()
LEN, SPAN = round(mx.y - mn.y, 3), round(mx.x - mn.x, 3)
for n_, d_ in gr.POSE.items(): pose(n_, d_)
vl.update(); hp = [o.matrix_world @ v.co for o in MESH() for v in o.data.vertices]; HGT = round(max(p.z for p in hp) - min(p.z for p in hp), 3)
for n_, d_ in gr.POSE.items(): pose(n_, -d_)
vl.update()
TRIS = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in MESH())
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_su24', weapon='', name='Су-24М', name_en='Su-24M', glb='su24.glb', blend='su24.blend', rev=1,
    build=['build.py', '_su_base.py', 'su_geo.py', 'su_det.py', 'su_gear.py', 'su_sk.py', 'su_lines.py', 'uv_su.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_views.py', '_sil.py', '_overlay03.py', '_overlay79.py', '_overlay_ref.py', '_стенд.js', '_run_paint.sh', '_run_final.sh', 'deliver.py'], previews_=prev,
    checks={'deploy': col_, 'стыки': {k: v.get('плохо') for k, v in (styk.get('детали') or {}).items() if v.get('плохо')},
            'стыки_вблизи': 'wing_r/l: консоль ходит внутри наплыва (так задумано); stab_*: зазор у корня 1,3-3,6 см на ход ±15°; canopy, canopy_frame: створки и рамы по порогу кабины',
            'касания_задуманные': 'wing_* в наплыве весь ход; slat_* внутри носка консоли; pyl_w_* на консоли; brake по борту на шарнире; canopy_*: порог кабины первые 12° хода; rudder в прорези киля',
            'подвеска': 'КАБ-500Л, Х-29Т, Х-31П на всех шести точках, Х-58 на всех, кроме передней правой (касается детали под заборником; игра вешает Х-58 только под наплыв), контейнер на центральной: на месте, при сбросе и со стойками без касаний; пары st1+st2: Х-31П+Х-29Т, КАБ+КАБ - без касаний',
            'silhouette_iou': {'сверху': 'наложение на чертёж 79 Mark (_снимки/наложение_79.png) и на чертёж 02 при 69° (_снимки/наложение_02.png)', 'сбоку': 'наложение на чертёж 03 (_снимки/наложение_03_бок.jpg)'},
            'game': 'стенд игры ?paint=1: ангар на своих стойках, бой день и вечер - три четверти, бок, снизу, сзади; на телефоне не проверено'},
    sketchfab={'title': 'Su-24M Fencer - Game-Ready Swing-Wing Bomber',
               'lead': 'Soviet swing-wing frontline bomber with side-by-side crew. Wing panels pivot 16-69 deg; spoilers, flaps, slats, stabilator, rudder, airbrake, two canopy hatches and nozzles move. Twin nozzles under shroud plates, gun pod, glove, fuselage and swivelling wing pylons, cockpit, landing gear.',
               'parts': ['fuselage', 'swing wing', 'glove', 'flight controls', 'airbrake', 'canopy', 'cockpit', 'intakes', 'twin nozzles', 'gun pod', 'pylons', 'landing gear', 'ground equipment'],
               'tags': ['su24', 'su-24m', 'fencer', 'soviet', 'russian', 'swing-wing', 'bomber', 'aircraft', 'military', 'cold-war', 'game-ready', 'pbr'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN16:.2f} m at 16 deg ({SPAN:.2f} m at 69 deg), height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps',
               'animation': '"Controls" and "Wing sweep" (69-16-69 deg)', 'based': 'Built from scratch in Blender from reference drawings.', 'glb': 'su24_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-13). Форма построена заново по чертежам 03, 79 и 02 и фото su24_01...12 (Mark), пиксели фото не использованы. Длина 22,67 м с ПВД, размах 17,64 м при 16° и 10,4 м при 69°. '
          'По чертежу 79 (Mark: «ориентироваться на чертеж 79»): нос - оживало, наплыв уже (консоль выходит в 2,3 м от оси), стабилизатор со срезанной законцовкой, хвостовая часть уже; хвост сходится в плиты над и под соплами. '
          'Окраска в игре: ВКС - светло-серый, белый конус, красные звёзды с бело-красной окантовкой, белый номер 27 с синей окантовкой (придуман). В запасе: окраски/пиксель (цифровой камуфляж, жёлтый номер 47, без флага и кругов по слову Mark) и окраски/ранний (серый с зеленцой, красный номер 62). '
          'Износ сдержанный (Mark): швы и заклёпки рельефом, подкраска листов, копоть у сопел, масло снизу, пыль, сколы кромок. Карты: цвет без света, нормали, R затенение, G шероховатость, B металл.')
R['model'].update(length_m=LEN, span_m=SPAN, span16_m=SPAN16, height_m=HGT, tris_game=TRIS_G, tris_gear_file=TRIS_GEAR); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'su24_gear.glb'; P['files']['sketchfab_glb'] = 'su24_sketchfab.glb'; P['gear_key'] = 'e_su24_gear'
P['files']['camo_reserve'] = ['окраски/пиксель (su24_color.png, su24_normal.png, su24_orm.png на той же развёртке)', 'окраски/ранний (то же)']
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (сдвиг по высоте {round(cy, 4)} м и по длине {round(cb, 4)} м учтён); _gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение, G шероховатость, B металл; материалы SU_paint (один на всё) и SU_glass (BLEND, clearGlass). Текстуры собраны в 4096, в игре 2048.'
P['nozzles_game'] = [GG(P3T(g.A_TAIL + 0.30, sx * g.NOZ_X, g.NOZ_Z)) for sx in (-1, 1)]; P['nr'] = round((g.NOZ_R - 0.07) * g.SCL, 3); P['dry'] = False; P['afterburner'] = True; P['gear_bottom_game_y'] = round(mn_g - cy, 3)
P['flares_game'] = [GG(P3T(18.6, 0.0, -0.50))]
ST = {k: GG(v) for k, v in g.STATIONS.items()}
P['stations_game'] = dict(note='mirror(): на сторону 3 точки, порядок от внешней к внутренней: st0 под наплывом (x 2,0 м), st1 под заборником (x 1,0 м, впереди), st2 под фюзеляжем (x 0,5 м, сзади); '
    'center - контейнер по оси сзади между подфюзеляжными гребнями (pod). Шесть точек: игра раздаёт по stOrder(6) - сначала st2, потом st1, потом st0 (КАБ-500Л ×4 на фюзеляж, Х-58 ×2 под наплыв; Х-29Т на st2, Х-31П на st1). '
    'Точка - низ пилона по середине. Поворотные пилоны консолей (pyl_w_*) не точки. _collide.py: подвеска всех загрузок без касаний (см. ОТЧЁТ checks.подвеска), racks и ext не нужны.',
    order_left=[ST['st0_l'], ST['st1_l'], ST['st2_l']], pod=ST['center'], **ST)
WP = {n_: g.PARTS[n_]['pivot'].copy() for n_ in ('wing_r', 'wing_l')}
def fold(v, sx, vec=False):                                                         # из положения 16° (в нём заданы оси детей консоли) в положение файла
    Rm = Matrix.Rotation(math.radians(FILE_SW), 4, Vector((0, 0, -sx)))
    return (Rm.to_3x3() @ v) if vec else (Matrix.Translation(WP['wing_r' if sx > 0 else 'wing_l']) @ Rm @ Matrix.Translation(-WP['wing_r' if sx > 0 else 'wing_l']) @ v)
for nm_, D in g.PARTS.items():
    if D.get('parent', '').startswith('wing_') and not D.get('_in_file'):
        sx = 1 if D['parent'].endswith('_r') else -1; D['pivot'] = fold(D['pivot'], sx); D['axis'] = fold(D['axis'], sx, True).normalized(); D['_in_file'] = True
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('kind'): parts[nm_]['kind'] = D['kind']
    if D.get('parent'): parts[nm_]['parent'] = D['parent']
    if nm_ in gr.POSE: parts[nm_]['in_gear_file_deg'] = gr.POSE[nm_]
P['parts'] = parts
P['parts_note'] = 'Оси и шарниры детей консоли (flap*, slat*, spoil*, pyl_w_*) даны в положении файла (консоли 69°). wing_*: range 0…53 - поворот от положения 16°, в файле 53.'
P['wing_sweep'] = dict(note='Файл игры - консоли сложены, 69° (задание главного чата). Шарниры wing_r / wing_l вертикальные; разложить в 16° - поворот на 53° концом вперёд. '
    'Для META как у B-1B: pivots { wing_r: [pivot_game, [0, 1, 0]], wing_l: [pivot_game, [0, 1, 0]] }, разложено (16°): wing_r +53, wing_l -53 (45°: ±24). Механизация (flap*, slat*, spoil*) и поворотные пилоны pyl_w_* - дети своей консоли; '
    'пилон при стреловидности k разворачивается на -k (в файле развёрнут по потоку). Сейчас sweep в игре не нужен.',
    pivot_game={n_: GG(g.PARTS[n_]['pivot']) for n_ in ('wing_r', 'wing_l')}, spread_deg={'wing_r': 53.0, 'wing_l': -53.0})
P['motion_note'] = ('Интерцепторы spoil1/2_* 0…25° (элеронов нет), закрылки flap1/2_* 0…50°, носок slat_* 0…20° (выпускать при 16°), стабилизатор stab_* ±15° (вместе - тангаж, врозь - крен), руль rudder ±25°, '
    'тормозной щиток brake 0…50°, створки фонаря canopy_r / canopy_l 0…60° на задних шарнирах (рамы - дочерние), крышка контейнера парашюта chute_cap 0…100°, сопла nozzle_* - масштаб 0,85…1,0.')
P['gear_note'] = 'su24_gear.glb: носовая стойка (два колеса), две основные (по два колеса), створки door_*_g открыты; только для ангара. В основном файле те же створки door_* закрыты: в ангаре со стойками их прячет META gearHide. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта.'
P['tris_game'] = TRIS_G
P['swap_notes'] = [
 'Рецепт prepare.js e_su24 заменить на own: true, scale 1, nose -z, tex 2048, nTex 2048, pickMesh /./, centerX: true и groups: door_n_r, door_n_l, door_m_r, door_m_l (и wing_r / wing_l со своими детьми, если нужна стреловидность) - свои части, остальное body; добавить рецепт e_su24_gear (метки по 1 мм не удалять).',
 'Старая модель e_su24 (manilov.ap) - убрать её запись из games/airdef/models/credits.js и CREDITS.md; старый camo/e_su24.hi.glb (если есть) удалить и убрать из hi-list.js.',
 'models.js e_su24: stations - mirror(order_left из stations_game): 6 точек (было 8, со старыми пилонами консолей); nozzles - nozzles_game (два), nr, pod - stations_game.pod (контейнер сзади по оси; было pod: null), clearGlass: true, gearModel: e_su24_gear при paintOn, gearHide: [door_n_r, door_n_l, door_m_r, door_m_l]; dry не ставить (форсаж есть).',
 'META.e_su24_gear как у e_f15e_gear (lazy, matte, paint, stations: []). GLB_V для обоих ключей.',
 'Ложные цели: flares_game (под хвостом).',
 'Консоли в файле сложены (69°). Если в полёте нужны разложенные - META sweep как у B-1B по wing_sweep (группы wing_r / wing_l с детьми).',
 'После подмены: seats-gen.js e_su24 (обе загрузки: КАБ-500Л + Х-58 и Х-29Т + Х-31П), миниатюра thumbs/air_e_su24.webp (paint=1), пара ktx для e_su24 и e_su24_gear; стоянка pk_e_su24 - отдельно (не трогали).',
 'Окраски в запасе: окраски/пиксель и окраски/ранний - для магазина камуфляжей, на той же развёртке.'
]
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(stations=P['stations_game']['order_left'], pod=P['stations_game']['pod'], nozzles=P['nozzles_game'], nr=P['nr'], gear_bottom=P['gear_bottom_game_y'],
               pivots={n_: [GG(g.PARTS[n_]['pivot']), [0, 1, 0]] for n_ in ('wing_r', 'wing_l')}, sweep={'wing_r': 0.0, 'wing_l': 0.0}), open(os.path.join(HERE, 'точки.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('паспорт готов', LEN, SPAN16, SPAN, HGT, 'тр. игра', TRIS_G, 'шасси', TRIS_GEAR)

# ── Sketchfab: стоянка (створки открыты), оснастка sk_* со своим атласом, клипы ──
SKO = su_sk.make_all(); vl.update()
for o in vl.objects: o.select_set(False)
for o in SKO: o.select_set(True)
vl.objects.active = SKO[0]
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.uv.average_islands_scale(); bpy.ops.uv.pack_islands(rotate=True, margin=0.004, margin_method='ADD', shape_method='CONCAVE')
bpy.ops.object.mode_set(mode='OBJECT')
SKS = int(os.environ.get('SU_SKTEX', '2048'))
imc = bpy.data.images.new('su24_sk_color', SKS, SKS); imo = bpy.data.images.new('su24_sk_orm', SKS, SKS); imo.colorspace_settings.name = 'Non-Color'
SKMAT = {n_: (c, r) for n_, c, r in su_sk.SKM}
def sk_graph(m, kind, img):
    nt_ = m.node_tree; N = nt_.nodes; Lk = nt_.links
    for n in list(N): N.remove(n)
    o_ = N.new('ShaderNodeOutputMaterial'); em = N.new('ShaderNodeEmission'); Lk.new(em.outputs[0], o_.inputs['Surface'])
    tx = N.new('ShaderNodeTexImage'); tx.image = img; N.active = tx; tx.select = True
    tc = N.new('ShaderNodeTexCoord'); nz1 = N.new('ShaderNodeTexNoise'); nz1.inputs['Scale'].default_value = 3.0; nz1.inputs['Detail'].default_value = 6.0; Lk.new(tc.outputs['Object'], nz1.inputs['Vector'])
    nz2 = N.new('ShaderNodeTexNoise'); nz2.inputs['Scale'].default_value = 40.0; Lk.new(tc.outputs['Object'], nz2.inputs['Vector'])
    c, r = SKMAT[m.name]; mt = 0.8 if m.name == 'SK_alu' else 0.0
    if kind == 'col':
        mx_ = N.new('ShaderNodeMath'); mx_.operation = 'MULTIPLY_ADD'; Lk.new(nz1.outputs['Fac'], mx_.inputs[0]); mx_.inputs[1].default_value = 0.30; mx_.inputs[2].default_value = 0.82
        m2 = N.new('ShaderNodeMath'); m2.operation = 'MULTIPLY_ADD'; Lk.new(nz2.outputs['Fac'], m2.inputs[0]); m2.inputs[1].default_value = 0.12; Lk.new(mx_.outputs[0], m2.inputs[2])
        mul = N.new('ShaderNodeVectorMath'); mul.operation = 'MULTIPLY'; mul.inputs[0].default_value = c
        cc = N.new('ShaderNodeCombineXYZ'); [Lk.new(m2.outputs[0], cc.inputs[i]) for i in range(3)]; Lk.new(cc.outputs[0], mul.inputs[1]); Lk.new(mul.outputs[0], em.inputs['Color'])
    else:
        rr = N.new('ShaderNodeMath'); rr.operation = 'MULTIPLY_ADD'; Lk.new(nz1.outputs['Fac'], rr.inputs[0]); rr.inputs[1].default_value = 0.16; rr.inputs[2].default_value = r - 0.08
        cc = N.new('ShaderNodeCombineColor'); cc.inputs[0].default_value = 1.0; Lk.new(rr.outputs[0], cc.inputs[1]); cc.inputs[2].default_value = mt; Lk.new(cc.outputs[0], em.inputs['Color'])
sc.render.engine = 'CYCLES'; sc.cycles.samples = 4
try: sc.cycles.use_denoising = False
except Exception: pass
for kind, img in (('col', imc), ('orm', imo)):
    for n_, _, _ in su_sk.SKM: sk_graph(bpy.data.materials[n_], kind, img)
    bpy.ops.object.bake(type='EMIT', width=SKS, height=SKS, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
    img.filepath_raw = os.path.join(HERE, img.name + '.png'); img.file_format = 'PNG'; img.save(); print('атлас S', kind, img.filepath_raw)
sc.cycles.samples = int(os.environ['SU_SPP']); sc.cycles.use_denoising = True
skp = bpy.data.materials.new('SK_paint'); skp.use_nodes = True; skp.use_backface_culling = False; N = skp.node_tree.nodes; Lk = skp.node_tree.links
pb_ = next(n for n in N if n.type == 'BSDF_PRINCIPLED'); t1 = N.new('ShaderNodeTexImage'); t1.image = imc; t2 = N.new('ShaderNodeTexImage'); t2.image = imo; sp_ = N.new('ShaderNodeSeparateColor')
Lk.new(t1.outputs['Color'], pb_.inputs['Base Color']); Lk.new(t2.outputs['Color'], sp_.inputs[0]); Lk.new(sp_.outputs[1], pb_.inputs['Roughness']); Lk.new(sp_.outputs[2], pb_.inputs['Metallic'])
for o in SKO:
    for i in range(len(o.data.materials)): o.data.materials[i] = skp
# ── стоянка: створки открыты (как в файле шасси) ──
for n_, d_ in gr.POSE.items(): pose(n_, d_)
vl.update()
# ── клипы ──
FPS = 24; sc.render.fps = FPS
vl.update(); REST = {o.name: o.matrix_basis.copy() for o in MESH()}; FW = {o.name: o.matrix_world.copy() for o in MESH()}
def depth(o):
    k = 0
    while o.parent is not None: o = o.parent; k += 1
    return k
def setp(n_, v):
    """Положение подвижной части: шарнир и ось из PARTS переносятся текущим положением родителя (повёрнутая консоль)."""
    o = bpy.data.objects[n_]; D = g.PARTS[n_]; M = (o.parent.matrix_world @ FW[o.parent.name].inverted()) if o.parent is not None else Matrix.Identity(4)
    T = M @ D['pivot']; ax = (M.to_3x3() @ D['axis']).normalized()
    o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(v), 4, ax) @ Matrix.Translation(-T) @ o.matrix_world
ease = lambda t: 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, t)))
def bump(t, t0, t1, t2, t3): return ease((t - t0) / (t1 - t0)) if t < t2 else 1.0 - ease((t - t2) / (t3 - t2))
SP = [n for n in g.PARTS if n.startswith('spoil')]; FLP = [n for n in g.PARTS if n.startswith('flap')]; SL = [n for n in g.PARTS if n.startswith('slat')]
STB = [n for n in g.PARTS if n.startswith('stab_')]; CAN = [n for n in g.PARTS if n.startswith('canopy_')]
WSW = lambda t, t0, t1, t2, t3: -FILE_SW * bump(t, t0, t1, t2, t3)                  # консоли из 69° в 16° и обратно
def st_controls(t):
    s = {'wing_r': WSW(t, 0.3, 2.0, 10.0, 11.7)}; s['wing_l'] = s['wing_r']
    for n in SP: s[n] = 25.0 * max(0.0, math.sin(2 * math.pi * (t - 2.0) / 4.0) * (1 if n.endswith('_r') else -1)) * bump(t, 2.0, 2.5, 5.5, 6.0)
    for n in STB: s[n] = 12.0 * math.sin(2 * math.pi * (t - 2.0) / 4.0) * (1 if n.endswith('_r') else -1) * bump(t, 2.0, 2.5, 5.5, 6.0) + 12.0 * math.sin(2 * math.pi * (t - 6.0) / 3.0) * bump(t, 6.0, 6.5, 9.0, 9.5)
    for n in FLP: s[n] = 50.0 * bump(t, 4.0, 5.5, 8.0, 9.5)
    for n in SL: s[n] = 20.0 * bump(t, 4.0, 5.5, 8.0, 9.5)
    s['rudder'] = 25.0 * math.sin(2 * math.pi * (t - 2.0) / 5.0) * bump(t, 2.5, 3.0, 10.0, 10.5)
    s['brake'] = 50.0 * bump(t, 7.0, 8.0, 9.5, 10.5)
    for n in CAN: s[n] = 60.0 * bump(t, 2.5, 4.0, 6.5, 8.0)
    return s
def st_sweep(t):
    k = WSW(t, 0.5, 3.0, 5.0, 7.5); return {'wing_r': k, 'wing_l': k}
CLIPS = {'Controls': (12.0, st_controls), 'Wing sweep': (8.0, st_sweep)}
PYL = [n for n in g.PARTS if n.startswith('pyl_w_')]
ANIM = {'Controls': SP + STB + FLP + SL + CAN + ['rudder', 'brake', 'wing_r', 'wing_l'] + PYL, 'Wing sweep': ['wing_r', 'wing_l'] + PYL}
def apply_state(s):
    for n_ in g.PARTS:
        if n_ in REST: bpy.data.objects[n_].matrix_basis = REST[n_]
    vl.update()
    for n_ in sorted([q for q in g.PARTS if q in s], key=lambda q: depth(bpy.data.objects[q])):
        setp(n_, s[n_]); vl.update()
        if n_.startswith('wing_'):                                                 # поворотный пилон стоит по потоку: разворот на -k вокруг своей вертикали
            p_ = bpy.data.objects.get('pyl_w_' + n_[-1]); sx = 1 if n_.endswith('_r') else -1
            if p_ is not None: T = p_.matrix_world.translation.copy(); p_.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(-s[n_]), 4, Vector((0, 0, -sx))) @ Matrix.Translation(-T) @ p_.matrix_world; vl.update()
for clip, (dur, fn) in CLIPS.items():
    n = int(round(dur * FPS)); data = {}; prev_e = {}
    for fr in range(n + 1):
        apply_state(fn(fr / FPS if fr < n else 0.0))
        for nm in ANIM[clip]:
            o = bpy.data.objects[nm]; loc, rot, scl = o.matrix_basis.decompose(); e = rot.to_euler('XYZ', prev_e.get(nm, Euler((0, 0, 0)))); prev_e[nm] = e
            for path, vals in (('location', loc), ('rotation_euler', e), ('scale', scl)):
                for i in range(3): data.setdefault(nm, {}).setdefault((path, i), []).append(float(vals[i]))
    for nm in ANIM[clip]:
        o = bpy.data.objects[nm]
        if o.animation_data is None: o.animation_data_create()
        act = bpy.data.actions.new(f'{clip}|{nm}'); slot = act.slots.new('OBJECT', nm); o.animation_data.action = act; o.animation_data.action_slot = slot
        for (path, idx), vals in data[nm].items():
            fc = act.fcurve_ensure_for_datablock(o, path, index=idx); fc.keyframe_points.add(len(vals)); co = []
            for f_, v in enumerate(vals): co += [float(f_), v]
            fc.keyframe_points.foreach_set('co', co)
            for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
            fc.update()
        tr = o.animation_data.nla_tracks.new(); tr.name = clip; stp = tr.strips.new(clip, 0, act)
        try:
            if getattr(stp, 'action_slot', None) is None: stp.action_slot = slot
        except Exception as ex: print('слот:', ex)
        o.animation_data.action = None
    print('клип', clip, n + 1, 'кадров')
apply_state({}); sc.frame_start, sc.frame_end = 0, int(12 * FPS); sc.frame_set(0); vl.update()
for o in vl.objects: o.select_set(False)
SEL = MESH()
for o in SEL: o.select_set(True)
vl.objects.active = SEL[0]
GLB = os.path.join(HERE, 'su24_sketchfab.glb')
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_apply=False, export_yup=True, export_materials='EXPORT', export_image_format='JPEG',
                          export_jpeg_quality=90, export_cameras=False, export_lights=False, export_normals=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True)
with open(GLB, 'rb') as fh:
    fh.read(12); ln, tp = struct.unpack('<II', fh.read(8)); js = json.loads(fh.read(ln))
print('Sketchfab', round(os.path.getsize(GLB) / 1e6, 1), 'МБ, узлов', len(js['nodes']), 'картинок', len(js.get('images', [])), 'клипы', {a['name']: len(a['channels']) for a in js.get('animations', [])})
TS = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in SEL)
for o in SKO: o.data.uv_layers.active.name = 'UVMap'
imc.pack(); imo.pack()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'su24.blend'), copy=True); print('blend сохранён')
for o in SEL:
    if o.animation_data:
        for tr in o.animation_data.nla_tracks: tr.mute = True
apply_state({})
shot('превью_10_стоянка_оснастка.png', (0.0, 2.0, -0.6), (-0.60, 0.72, 0.16), 21.0, lens=45, wd=1920, h=1080)
apply_state(st_controls(8.2)); shot('превью_11_механизация.png', (0.0, -1.0, 0.0), (-0.55, -0.70, 0.45), 25.0, lens=45, wd=1920, h=1080)
apply_state(st_sweep(4.0)); shot('превью_12_крыло_16.png', (0.0, 0.0, 0.0), (-0.40, 0.45, 0.80), 29.0, lens=45, wd=1920, h=1080)
apply_state({})
R = json.load(open(os.path.join(HERE, 'ОТЧЁТ.json'), encoding='utf-8')); R['previews'] = prev + ['превью_10_стоянка_оснастка.png', 'превью_11_механизация.png', 'превью_12_крыло_16.png']
R['model']['tris'] = TS
R['sketchfab_vs_game'] = 'Игра: su24.glb - самолёт без стоек, консоли 69°, карты 4096 (prepare.js сжимает до 2048) + su24_gear.glb для ангара. Sketchfab: стоянка (стойки, открытые створки), оснастка sk_* (колодки, заглушки заборников, ленты REMOVE BEFORE FLIGHT, стремянка) со своим атласом S 2048, клипы Controls (с раскладкой консолей) и Wing sweep, картинки JPEG 90.'
json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова')
