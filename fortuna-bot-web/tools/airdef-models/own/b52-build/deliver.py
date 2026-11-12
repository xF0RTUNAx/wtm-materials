# deliver.py - сдача Boeing B-52H (по deliver.py Vulcan B.2): превью, файл игры (без стоек и створок шасси, крыло в полёте), файл шасси для ангара (стойки, открытые
# створки, две метки по 1 мм), паспорт и отчёт; файл Sketchfab и .blend - стоянка (крыло опущено, стойки выпущены) со всей оснасткой sk_* (свой атлас S 2048)
# и двумя клипами: «Controls» (закрылки, интерцепторы, рули высоты, стабилизатор, руль направления, створки отсека) и «Drag chute» (дверца, парашют раскрывается).
# После gbuf.py (B52_TEX=4096) и paint.py (B52_TEX=4096 B52_OUT=<папка модели>):
#   Blender -b --factory-startup --python build.py --python deliver.py        (B52_STAGE=4)
import json, math, os, sys, struct
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/B-52H'
sys.path.insert(0, HERE); os.environ['B52_MAPS'] = HERE; os.environ['B52_OUT'] = HERE; os.environ['B52_ONLY'] = '__никакой__'; os.environ.setdefault('B52_SPP', '96')
os.environ.pop('B52_SK', None); os.environ.pop('B52_NOSHOTS', None)
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: без стоек и без створок шасси')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
from mathutils import Vector, Matrix, Euler
import b52_sk
# ── превью игровой модели: стоянка ──
for n_, d_ in gr.POSE.items(): pose(n_, d_)
for n_ in ('wing_r', 'wing_l'): pose(n_, g.PARTS[n_]['ground'])
vl.update(); prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 4.0, -1.0), (-0.62, 0.66, 0.30), 72.0), ('превью_2_сбоку.png', (0.0, 0.0, 1.0), (1.0, -0.03, 0.02), 74.0),
                         ('превью_3_сверху.png', (0.0, 0.0, 0.0), (-0.03, -0.03, 1.0), 100.0), ('превью_4_хвост.png', (0.0, Y(46.0), Zg(4.6)), (-0.70, -0.62, 0.30), 12.0),
                         ('превью_5_нос.png', (0.0, Y(3.6), Zg(3.9)), (0.62, 0.72, 0.10), 11.0), ('превью_6_снизу.png', (0.0, 0.0, 0.0), (0.25, 0.35, -0.90), 88.0)):
    shot(nm, tg, dv, dist, wd=1920, h=1080); prev.append(nm)
for n_ in ('bay_l', 'bay_r'): pose(n_, 95)
vl.update(); shot('превью_7_отсек.png', (0.0, Y(22.0), Zg(2.4)), (0.42, 0.30, -0.86), 17.0, wd=1920, h=1080); prev.append('превью_7_отсек.png')
for n_ in ('bay_l', 'bay_r'): pose(n_, -95)
vl.update(); print('превью', prev)
# ── файл игры: крыло в полёте, без стоек и створок шасси ──
for n_ in ('wing_r', 'wing_l'): pose(n_, -g.PARTS[n_]['ground'])
vl.update()
MESH = lambda: [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in MESH() for v in o.data.vertices]; mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
def rd(f):
    try: return json.load(open(os.path.join(HERE, f), encoding='utf-8'))
    except Exception as e: print('нет', f, e); return {}
col_ = rd('_live/collide.json'); styk = rd('_стыки/_стыки.json')
GEAR = [o for o in MESH() if o.name.startswith(('gear', 'door_'))]
COLS = {o.name: list(o.users_collection) for o in MESH()}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in MESH() for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'b52.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'b52.glb')) // 1024, 'КБ')
OTHER = [o for o in MESH()]
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in OTHER:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'b52_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'b52_gear.glb')) // 1024, 'КБ')
bpy.data.objects.remove(oa_); bpy.data.meshes.remove(ma_)
for o in OTHER:
    for c in COLS[o.name]: c.objects.link(o)
vl.update()
# ── паспорт и отчёт (оси игры: центр по габаритам файла игры) ──
cy = (MN_M[2] + MX_M[2]) / 2; cb = (MN_M[1] + MX_M[1]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-(v.y - cb), 3)]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
LEN, SPAN = round(mx.y - mn.y, 3), round(mx.x - mn.x, 3)
for n_ in ('wing_r', 'wing_l'): pose(n_, g.PARTS[n_]['ground'])
vl.update(); hp = [o.matrix_world @ v.co for o in MESH() for v in o.data.vertices]; HGT = round(max(p.z for p in hp) - min(p.z for p in hp), 3)
TRIS = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in MESH())
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_b52', weapon='', name='B-52H', name_en='Boeing B-52H Stratofortress', glb='b52.glb', blend='b52.blend', rev=1,
    build=['build.py', 'b52_geo.py', 'b52_det.py', 'b52_gear.py', 'b52_sk.py', 'uv_b52.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_views.py', '_стенд.js', '_run_paint.sh', 'deliver.py'], previews_=prev,
    checks={'deploy': col_, 'стыки': {k: v.get('плохо') for k, v in (styk.get('детали') or {}).items() if v.get('плохо')},
            'стыки_вблизи': 'fin_c: отмечены концы прорези под руль направления, вблизи щель около 1 см и её закрывает руль - ложная тревога',
            'касания_внутри': 'stab: корень стабилизатора проходит внутрь фюзеляжа на всём ходе ±4° (так задумано, снаружи щели нет); wing_r/l: при опускании на стоянке нижняя кромка у шарнира уходит внутрь обшивки (шарнир по верхней поверхности, сверху стык сомкнут)',
            'silhouette_iou': {'бок': 'наложение на фото b52_07 (_снимки/наложение_07.jpg)', 'сверху': 'наложение на b52_15 (_снимки/наложение_15.jpg), план выпрямлен _rectify.py', 'спереди': '_снимки/наложение_14.jpg'},
            'game': 'стенд игры ?paint=1: ангар (крыло опущено, стойки), бой день и вечер - три четверти, бок, снизу, сзади; ошибок нет; на телефоне не проверено'},
    sketchfab={'title': 'Boeing B-52H Stratofortress - Game-Ready Bomber',
               'lead': 'USAF eight-engine strategic bomber in weathered grey, parked with ground equipment. Moving parts on their own pivots: Fowler flaps, spoilers, all-moving stabilizer, elevators, rudder, bomb bay doors with a detailed bay, drag chute door, gear doors. Underwing pylons, twin engine pods with exhaust cones, outrigger and four-truck gear, cockpit interior.',
               'parts': ["fuselage", "wings", "flaps", "spoilers", "stabilizer", "fin and rudder", "bomb bay", "engine pods", "pylons", "landing gear", "cockpit", "drag chute", "ground equipment"],
               'tags': ['b-52', 'stratofortress', 'boeing', 'bomber', 'usaf', 'aircraft', 'military', 'cold-war', 'game-ready', 'pbr', 'textured', 'animated'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps',
               'animation': '"Controls" (flaps, spoilers, tail, bomb bay) and "Drag chute"',
               'based': 'Built from scratch in Blender from reference images.', 'glb': 'b52_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-11). Форма построена заново по фото b52_01...16 и 61...63 (Mark), пиксели фото не использованы. Корпус расширен вдвое по словам Mark (WIDEN 1,30), хвост плавно переходит в капли обтекателей (b52_09, 10), хвостовая установка без пушки. Краска: однотонный серый ВВС США, листы разного тона, перекрашенные пятна, потёки, масло, копоть, пыль и следы ботинок; белых направляющих дозаправки и дорожек на крыле нет (Mark). Знаки и трафареты вымышленные: KM, AF 64 052, номера лючков. Дворников нет (Mark). Карты: цвет без света, нормали (швы, заклёпки по всей обшивке, фаски с шейдера Bevel 16 мм), R затенение, G шероховатость, B металл. В файле игры стоек и створок шасси нет, крыло в полёте; в файле Sketchfab и .blend - стоянка с оснасткой sk_* (свой атлас S 2048).')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT, tris_sketchfab_without_sk=TRIS); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'b52_gear.glb'; P['files']['sketchfab_glb'] = 'b52_sketchfab.glb'; P['gear_key'] = 'e_b52_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (сдвиг по высоте {round(cy, 4)} м и по длине {round(cb, 4)} м учтён); _gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы B52_paint (один на всё) и B52_glass (BLEND, clearGlass). Текстуры собраны в 4096, в игре 2048 (атлас 58 м, 35 пикс/м).'
P['nozzles_game'] = [GG(g.P3(g.pod_front(xc) + g.POD_LEN + 0.05, sx * xc + g.POD_DX * k, g.pod_z(xc))) for sx in (-1, 1) for xc in g.PODS for k in (-1, 1)]
P['nr'] = 0.36; P['dry'] = True; P['gear_bottom_game_y'] = round(mn_g - cy, 3)
P['flares_game'] = [GG(g.P3(43.5, 0.0, g.Z(3.05)))]
ST = {k: GG(v) for k, v in g.STATIONS.items()}
P['stations_game'] = dict(note='Отсек: 8 точек JDAM (GBU-31), на сторону 4: два ряда поперёк (x ±0,33 и ±0,92), по два вдоль; наружные сдвинуты назад, чтобы оперение не сходилось. Порядок для mirror() - левая сторона, индекс 3 заполняется первым: 3 внутренний задний... 0 наружный передний (stations_fill). Точка - низ замка, игра вешает бомбу осью на 0,05 м + радиус ниже. _collide.py: own gbu31 в замках и при падении с открытыми створками - касаний 0.',
    order_left=[ST['st%d_l' % i] for i in range(4)], **ST)
PY = {k: GG(v) for k, v in g.PYLON_PTS.items()}
P['stations_pylon_game'] = dict(note='Пилон под каждым крылом между фюзеляжем и внутренней гондолой, на нём балка-адаптер с двумя замками (o - наружный, i - внутренний). Точки для META.ext (как Shrike у Vulcan): AGM-86, JASSM, ARRW висят здесь; _collide.py: w_agm86, own jassm, own arrw на месте и при сбросе - касаний 0. Если ракет больше двух на крыло - вешать по две на эти точки, остальные в отсек нельзя (там JDAM).',
    order_left=[PY['lo'], PY['li']], **PY)
P['pod_game'] = None
bay = {n_: [GG(g.PARTS[n_]['pivot']), G2(g.PARTS[n_]['axis']), 95] for n_ in ('bay_l', 'bay_r')}
P['bay'] = dict(note='Для bay.js (META.bay): doors - имя: [точка на оси, ось, угол открытия]; рёбра bay_*_ribs - дочерние, поворачиваются вместе.', doors=bay, sides=dict(L=['bay_l'], R=['bay_r']))
parts = {}
for nm_, D in g.PARTS.items():
    if D.get('kind') == 'slide': parts[nm_] = dict(kind='slide', pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_m=list(D['range']), note=D.get('note', '')); continue
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if nm_ in gr.POSE: parts[nm_]['in_gear_file_deg'] = gr.POSE[nm_]
    if 'ground' in D: parts[nm_]['ground_deg'] = D['ground']
P['parts'] = parts
P['wing_ground'] = dict(note='В ангаре, когда показаны стойки (файл e_b52_gear), повернуть wing_r и wing_l на ground_deg = −8,5° вокруг их оси: крыло ровно опускается на опоры под концами. Гондолы, баки, пилоны, закрылки, интерцепторы и огни на крыле - дочерние, идут вместе. В полёте 0°. Опоры под концами крыла в файле стоек стоят под опущенным крылом.',
    wing_r=[GG(g.PARTS['wing_r']['pivot']), G2(g.PARTS['wing_r']['axis']), g.PARTS['wing_r']['ground']], wing_l=[GG(g.PARTS['wing_l']['pivot']), G2(g.PARTS['wing_l']['axis']), g.PARTS['wing_l']['ground']])
P['motion_note'] = 'Закрылки flap1/2_r/l - сдвиг (kind slide, range_m 0…0,90 вдоль axis_gltf назад-вниз, Fowler). Интерцепторы spoil1..7_r/l 0…60°, стабилизатор stab ±4° целиком (рули высоты elev_r/l - дочерние, ±13°), руль направления rudder ±22°, створки отсека bay_l/r 0…95°, дверца парашюта chute_door 0…110°. Створки ниш door_* лежат только в файле стоек.'
P['gear_note'] = 'b52_gear.glb: четыре тележки по два колеса, две опоры под концами крыла (под опущенным крылом), открытые створки ниш с рёбрами; только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. В файле самолёта стоек и створок нет: обшивка целая, контур нарисован швом.'
P['swap_notes'] = [
 'Рецепт prepare.js у e_b52 старый (чужая модель bohmerang): заменить на own: true, scale 1, nose -z, tex 2048, nTex 2048, pickMesh /./, centerX: true, как у e_f15e; добавить рецепт e_b52_gear (две метки по 1 мм не удалять).',
 'Запись старой модели B-52 (bohmerang) убрать из games/airdef/models/credits.js и CREDITS.md; автор остаётся, если у него в игре есть другие модели.',
 'models.js e_b52: stations - order_left из stations_game (JDAM в отсеке), internal: true, bay из паспорта (doors, sides); ракеты AGM-86 / JASSM / ARRW - на точки stations_pylon_game через META.ext и stationsFor, как Shrike у e_vulcan.',
 'nozzles - восемь из nozzles_game, nr 0.36, pod: null, dry: true, clearGlass: true, gearModel: e_b52_gear при paintOn.',
 'Ангар со стойками: wing_r и wing_l повернуть на −8,5° (wing_ground), иначе опоры под концами крыла висят ниже крыла.',
 'META.e_b52_gear как у e_vulcan_gear (lazy, matte, paint, stations: []). GLB_V для обоих ключей.',
 'Ложные цели: точка flares_game (под хвостом).',
 'После подмены: seats-gen.js e_b52, миниатюра thumbs/air_e_b52.webp, пара ktx для e_b52 и e_b52_gear.',
 'Старый games/airdef/models/camo/e_b52.hi.glb от чужой модели удалить и убрать e_b52 из models/hi-list.js (HI_PLANES), если есть.',
 'META e_b52: matte не нужен (свой материал paint).'
]
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(stations=P['stations_game']['order_left'], pylons=PY, nozzles=P['nozzles_game'], nr=P['nr'], bay=bay, gear_bottom=P['gear_bottom_game_y']), open(os.path.join(HERE, 'точки.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('паспорт готов', LEN, SPAN, HGT, 'тр.', TRIS)

# ── Sketchfab: стоянка (крыло уже опущено, створки ниш открыты), оснастка sk_* со своим атласом, клипы ──
SKO = b52_sk.make_all(); vl.update()
CH_ = bpy.data.objects['sk_chute']; DOORP = g.down(0.0, g.Yb(45.85)) + Vector((0, 0, 0.05)); g._rel(CH_, DOORP)
for o in vl.objects: o.select_set(False)
for o in SKO: o.select_set(True)
vl.objects.active = SKO[0]
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.uv.average_islands_scale(); bpy.ops.uv.pack_islands(rotate=True, margin=0.004, margin_method='ADD', shape_method='CONCAVE')
bpy.ops.object.mode_set(mode='OBJECT')
SKS = int(os.environ.get('B52_SKTEX', '2048'))
imc = bpy.data.images.new('b52_sk_color', SKS, SKS); imo = bpy.data.images.new('b52_sk_orm', SKS, SKS); imo.colorspace_settings.name = 'Non-Color'
SKMAT = {m.name: (c, r) for m, (n_, c, r) in zip([bpy.data.materials[n] for n, _, _ in b52_sk.SKM], b52_sk.SKM)}
def sk_graph(m, kind, img):
    nt_ = m.node_tree; N = nt_.nodes; Lk = nt_.links
    for n in list(N): N.remove(n)
    o_ = N.new('ShaderNodeOutputMaterial'); em = N.new('ShaderNodeEmission'); Lk.new(em.outputs[0], o_.inputs['Surface'])
    tx = N.new('ShaderNodeTexImage'); tx.image = img; N.active = tx; tx.select = True
    tc = N.new('ShaderNodeTexCoord'); nz1 = N.new('ShaderNodeTexNoise'); nz1.inputs['Scale'].default_value = 3.0; nz1.inputs['Detail'].default_value = 6.0; Lk.new(tc.outputs['Object'], nz1.inputs['Vector'])
    nz2 = N.new('ShaderNodeTexNoise'); nz2.inputs['Scale'].default_value = 40.0; Lk.new(tc.outputs['Object'], nz2.inputs['Vector'])
    c, r = SKMAT[m.name]; mt = 0.8 if m.name == 'SK_alu' else 0.0
    if kind == 'col':                                                           # тон пятнами, мелкая грязь
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
    for n_, _, _ in b52_sk.SKM: sk_graph(bpy.data.materials[n_], kind, img)
    bpy.ops.object.bake(type='EMIT', width=SKS, height=SKS, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
    img.filepath_raw = os.path.join(HERE, img.name + '.png'); img.file_format = 'PNG'; img.save(); print('атлас S', kind, img.filepath_raw)
sc.cycles.samples = int(os.environ['B52_SPP']); sc.cycles.use_denoising = True
skp = bpy.data.materials.new('SK_paint'); skp.use_nodes = True; skp.use_backface_culling = False; N = skp.node_tree.nodes; Lk = skp.node_tree.links
pb_ = next(n for n in N if n.type == 'BSDF_PRINCIPLED'); t1 = N.new('ShaderNodeTexImage'); t1.image = imc; t2 = N.new('ShaderNodeTexImage'); t2.image = imo; sp_ = N.new('ShaderNodeSeparateColor')
Lk.new(t1.outputs['Color'], pb_.inputs['Base Color']); Lk.new(t2.outputs['Color'], sp_.inputs[0]); Lk.new(sp_.outputs[1], pb_.inputs['Roughness']); Lk.new(sp_.outputs[2], pb_.inputs['Metallic'])
for o in SKO:
    for i in range(len(o.data.materials)): o.data.materials[i] = skp
# ── клипы ──
FPS = 24; sc.render.fps = FPS
vl.update(); REST = {o.name: o.matrix_basis.copy() for o in MESH()}
def wing_of(o):
    while o is not None:
        if o.name in ('wing_r', 'wing_l'): return o.name
        o = o.parent
FW = {}                                                                        # мировые матрицы в полётном положении (в нём заданы оси PARTS)
for o in MESH():
    w_ = wing_of(o); FW[o.name] = (gr.ground_mat(1 if w_ == 'wing_r' else -1).inverted() @ o.matrix_world) if w_ else o.matrix_world.copy()
def depth(o):
    k = 0
    while o.parent is not None: o = o.parent; k += 1
    return k
def setp(n_, v):
    """Положение подвижной части: шарнир и ось из PARTS переносятся текущим положением родителя (опущенное крыло, повёрнутый стабилизатор)."""
    o = bpy.data.objects[n_]; D = g.PARTS[n_]; M = (o.parent.matrix_world @ FW[o.parent.name].inverted()) if o.parent is not None else Matrix.Identity(4)
    T = M @ D['pivot']; ax = (M.to_3x3() @ D['axis']).normalized()
    if D.get('kind') == 'slide': o.matrix_world = Matrix.Translation(ax * v) @ o.matrix_world
    else: o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(v), 4, ax) @ Matrix.Translation(-T) @ o.matrix_world
ease = lambda t: 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, t)))
def bump(t, t0, t1, t2, t3): return ease((t - t0) / (t1 - t0)) if t < t2 else 1.0 - ease((t - t2) / (t3 - t2))
FL = [n for n in g.PARTS if n.startswith('flap')]; SPL = [n for n in g.PARTS if n.startswith('spoil')]
def st_controls(t):
    s = {}
    for n in FL: s[n] = 0.90 * bump(t, 0.0, 2.0, 8.0, 10.0)
    for n in SPL: s[n] = (45.0 if n.endswith('_r') else 0.0) * bump(t, 2.5, 3.2, 4.0, 4.7) + 45.0 * bump(t, 5.0, 5.6, 6.4, 7.0)
    s['stab'] = 3.0 * math.sin(2 * math.pi * t / 10.0); s['elev_r'] = s['elev_l'] = 13.0 * math.sin(2 * math.pi * (t - 1.0) / 5.0) * bump(t, 1.0, 1.5, 9.0, 9.5)
    s['rudder'] = 22.0 * math.sin(2 * math.pi * t / 5.0) * bump(t, 0.5, 1.0, 9.0, 9.5)
    for n in ('bay_l', 'bay_r'): s[n] = 95.0 * bump(t, 1.0, 3.0, 7.0, 9.0)
    return s
def st_chute(t):
    return {'chute_door': 100.0 * bump(t, 0.0, 0.8, 7.0, 7.8), '_chute': ease((t - 0.7) / 2.6) if t < 6.0 else 1.0 - ease((t - 6.0) / 1.0)}
CLIPS = {'Controls': (10.0, st_controls), 'Drag chute': (8.0, st_chute)}
CH_REST = CH_.matrix_basis.copy(); CH_.scale = (0.001, 0.001, 0.001); vl.update(); CH_REST = CH_.matrix_basis.copy()
def apply_state(s):
    for n_ in g.PARTS: bpy.data.objects[n_].matrix_basis = REST[n_]
    vl.update()
    for n_ in sorted([q for q in g.PARTS if q in s], key=lambda q: depth(bpy.data.objects[q])):
        setp(n_, s[n_]); vl.update()
    k = s.get('_chute', 0.0); CH_.matrix_basis = CH_REST; CH_.scale = (max(0.001, k),) * 3
    vl.update()
ANIM = {'Controls': FL + SPL + ['stab', 'elev_r', 'elev_l', 'rudder', 'bay_l', 'bay_r'], 'Drag chute': ['chute_door', 'sk_chute']}
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
apply_state({}); sc.frame_start, sc.frame_end = 0, int(10 * FPS); sc.frame_set(0); vl.update()
for o in vl.objects: o.select_set(False)
SEL = MESH()
for o in SEL: o.select_set(True)
vl.objects.active = SEL[0]
GLB = os.path.join(HERE, 'b52_sketchfab.glb')
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_apply=False, export_yup=True, export_materials='EXPORT', export_image_format='JPEG',
                          export_jpeg_quality=90, export_cameras=False, export_lights=False, export_normals=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True)
with open(GLB, 'rb') as fh:
    fh.read(12); ln, tp = struct.unpack('<II', fh.read(8)); js = json.loads(fh.read(ln))
print('Sketchfab', round(os.path.getsize(GLB) / 1e6, 1), 'МБ, узлов', len(js['nodes']), 'картинок', len(js.get('images', [])), 'клипы', {a['name']: len(a['channels']) for a in js.get('animations', [])})
TS = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in SEL)
for o in SKO: o.data.uv_layers.active.name = 'UVMap'
imc.pack(); imo.pack()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'b52.blend'), copy=True); print('blend сохранён')
# превью пакета: оснастка, парашют раскрыт
for o in SEL:
    if o.animation_data:
        for tr in o.animation_data.nla_tracks: tr.mute = True
apply_state({})
shot('превью_8_стоянка_оснастка.png', (0.0, 8.0, -1.8), (0.55, 0.82, 0.08), 58.0, lens=45, wd=1920, h=1080)
shot('превью_9_нос_люк.png', (1.0, Y(5.5), Zg(1.4)), (0.80, 0.55, 0.12), 12.0, wd=1920, h=1080)
apply_state(st_chute(4.0)); shot('превью_10_парашют.png', (0.0, Y(52.0), Zg(5.0)), (0.80, 0.42, 0.28), 80.0, lens=45, wd=1920, h=1080)
apply_state({})
R = json.load(open(os.path.join(HERE, 'ОТЧЁТ.json'), encoding='utf-8')); R['previews'] = prev + ['превью_8_стоянка_оснастка.png', 'превью_9_нос_люк.png', 'превью_10_парашют.png']
R['model']['tris'] = TS; R['model']['tris_game'] = TRIS - sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in GEAR)
R['sketchfab_vs_game'] = 'Игра: b52.glb - самолёт без стоек, крыло в полёте, карты 4096 (prepare.js сжимает до 2048) + b52_gear.glb для ангара. Sketchfab: стоянка (крыло опущено, стойки и открытые створки ниш), оснастка sk_* (колодки, заглушки двигателей, ленты REMOVE BEFORE FLIGHT, открытый люк со стремянкой, тормозной парашют) со своим атласом S 2048, клипы Controls и Drag chute, картинки JPEG 90.'
json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова')
