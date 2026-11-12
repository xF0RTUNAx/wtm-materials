# deliver.py - сдача Saab J 35F Draken (по deliver.py B-52H): превью, файл игры (без стоек и створок шасси), файл шасси для ангара (стойки, открытые створки,
# две метки по 1 мм), паспорт и отчёт; файл Sketchfab и .blend - стоянка со стойками и оснасткой sk_* (свой атлас S 2048) и клипом «Controls»
# (элевоны, руль направления, тормозные щитки, фонарь). После gbuf.py (DR_TEX=4096) и paint.py (DR_TEX=4096 DR_OUT=<папка модели>):
#   DR_STAGE=4 Blender -b --factory-startup --python build.py --python deliver.py
import json, math, os, sys, struct
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Saab 35 Draken'
sys.path.insert(0, HERE); os.environ['DR_MAPS'] = HERE; os.environ['DR_OUT'] = HERE; os.environ['DR_ONLY'] = '__никакой__'; os.environ.setdefault('DR_SPP', '96')
os.environ.pop('DR_NOSHOTS', None)
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: без стоек и без створок шасси')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
from mathutils import Vector, Matrix, Euler
import dr_sk
# ── превью игровой модели: стоянка ──
for n_, d_ in gr.POSE.items(): pose(n_, d_)
vl.update(); prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 1.0, -0.2), (-0.62, 0.65, 0.30), 21.0), ('превью_2_сбоку.png', (0.0, 0.0, 0.4), (1.0, -0.02, 0.02), 24.0),
                         ('превью_3_сверху.png', (0.0, 0.0, 0.0), (-0.03, -0.03, 1.0), 26.0), ('превью_4_нос.png', (0.0, Y(4.2), 0.4), (0.62, 0.70, 0.30), 5.5),
                         ('превью_5_заборник.png', (1.0, Y(4.6), -0.1), (0.40, 0.88, 0.10), 3.8), ('превью_6_снизу.png', (0.0, 0.0, 0.0), (0.20, 0.25, -0.95), 24.0),
                         ('превью_7_сопло.png', (0.0, Y(14.9), 0.0), (0.40, -0.85, -0.25), 4.5), ('превью_8_сзади.png', (0.0, -1.0, 0.0), (0.62, -0.62, 0.30), 21.0)):
    shot(nm, tg, dv, dist, wd=1920, h=1080); prev.append(nm)
print('превью', prev)
# ── файл игры: без стоек и створок шасси ──
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
mk.export(os.path.join(HERE, 'dr.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'dr.glb')) // 1024, 'КБ')
OTHER = [o for o in MESH()]
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in OTHER:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'dr_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'dr_gear.glb')) // 1024, 'КБ')
bpy.data.objects.remove(oa_); bpy.data.meshes.remove(ma_)
for o in OTHER:
    for c in COLS[o.name]: c.objects.link(o)
vl.update()
# ── паспорт и отчёт (оси игры: центр по габаритам файла игры) ──
cy = (MN_M[2] + MX_M[2]) / 2; cb = (MN_M[1] + MX_M[1]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-(v.y - cb), 3)]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
LEN, SPAN = round(mx.y - mn.y, 3), round(mx.x - mn.x, 3)
vl.update(); hp = [o.matrix_world @ v.co for o in MESH() for v in o.data.vertices]; HGT = round(max(p.z for p in hp) - min(p.z for p in hp), 3)
TRIS = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in MESH())
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_draken', weapon='', name='Saab 35 Draken', name_en='Saab J 35F Draken', glb='dr.glb', blend='dr.blend', rev=1,
    build=['build.py', 'dr_geo.py', 'dr_det.py', 'dr_gear.py', 'dr_sk.py', 'uv_dr.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_views.py', '_sil.py', '_overlay.py', '_стенд.js', '_run_paint.sh', 'deliver.py'], previews_=prev,
    checks={'deploy': col_, 'стыки': {k: v.get('плохо') for k, v in (styk.get('детали') or {}).items() if v.get('плохо')},
            'стыки_вблизи': 'fin_c: концы прорези руля направления (ложная тревога, как у B-52H); tank_r/l: просвет между баком и брюхом впереди и позади пилона - так задумано; canopy: шов 3 см у козырька закрыт дугами рам; DR_skin: мелкие отметки у козырька',
            'касания_задуманные': 'canopy: полозья рамы лежат на пороге кабины первые 9° хода; door_*: створки шасси касаются обшивки по линии шарнира',
            'silhouette_iou': {'сверху': 'наложение на фото 07 (_снимки/наложение_07.jpg) - совпадает; на чертёж 09 (_снимки/наложение_09.jpg) расходится по носу: чертёж по длине искажён', 'сбоку': 'наложение на фото 03 (_снимки/наложение_03.jpg)'},
            'game': 'стенд игры ?paint=1: ангар на своих стойках, бой день и вечер - три четверти, снизу, бок; ошибок модели нет; на телефоне не проверено'},
    sketchfab={'title': 'Saab J 35F Draken - Game-Ready Fighter',
               'lead': 'Swedish Cold War double-delta interceptor in natural metal, parked with ground equipment. Moving parts on their own pivots: four elevons, rudder, four airbrakes, rear-hinged canopy, gear doors. Oval wing-root intakes, afterburner nozzle, two ventral drop tanks, underwing pylons, ejection seat cockpit, nose and main gear with tail bumper wheels.',
               'parts': ['fuselage', 'double-delta wing', 'elevons', 'fin and rudder', 'airbrakes', 'canopy', 'cockpit', 'intakes', 'nozzle', 'drop tanks', 'pylons', 'landing gear', 'ground equipment'],
               'tags': ['draken', 'saab', 'j35', 'sweden', 'fighter', 'interceptor', 'aircraft', 'military', 'cold-war', 'natural-metal', 'game-ready', 'pbr'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps',
               'animation': '"Controls" (elevons, rudder, airbrakes, canopy)', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'dr_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-12). Форма построена заново по фото draken_01...09 (Mark), пиксели фото не использованы. Чертёж 09 по длине искажён (нос короче, хвост длиннее): положения по длине и план крыла - по фото 07 (строго снизу) и 03 (сбоку), вид спереди и сечения - по 09 и 05; размеры 15,35 × 9,42 м как у нынешней модели. Окраска: натуральный металл (07): листы разного тона и блеска, подтёки и ржавые потёки снизу, побежалость и копоть на хвостовом конусе (08), чёрный обтекатель РЛС, антибликовая полоса, оливковые губы заборников с жёлтой каймой (05, 07). Шведские знаки нарисованы здесь, номер 42 придуман. Карты: цвет без света, нормали (швы, заклёпки, фаски с шейдера Bevel 10 мм), R затенение, G шероховатость, B металл.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT, tris_sketchfab_without_sk=TRIS); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'dr_gear.glb'; P['files']['sketchfab_glb'] = 'dr_sketchfab.glb'; P['gear_key'] = 'e_draken_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (сдвиг по высоте {round(cy, 4)} м и по длине {round(cb, 4)} м учтён); _gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение, G шероховатость, B металл; материалы DR_paint (один на всё, натуральный металл: металл 0,8, шероховатость 0,44, полированные листы глаже) и DR_glass (BLEND, clearGlass). Текстуры собраны в 4096, в игре 2048 (атлас 17 м, 119 пикс/м). Как у F-100D: металл с &paint=0 выглядит иначе, миниатюру снимать с paint=1.'
P['nozzles_game'] = [GG(g.P3(15.35 + 0.05, 0.0, 0.0))]; P['nr'] = 0.37; P['dry'] = False; P['afterburner'] = True; P['gear_bottom_game_y'] = round(mn_g - cy, 3)
P['flares_game'] = [GG(g.P3(13.9, 0.0, -0.55))]
ST = {k: GG(v) for k, v in g.STATIONS.items()}
P['stations_game'] = dict(note='mirror(): на сторону 4 точки - st0 наружный пилон (x 3,50), st1 средний (2,85), st2 внутренний (2,20), st3 под фюзеляжем за баками (x 0,30); последний индекс (3) заполняется первым, как у нынешней модели. Точка - низ замка. _collide.py: Mk 82 и LAU-61 на всех точках не задевают шасси, баки и соседей ни на месте, ни при сбросе.',
    order_left=[ST['st%d_l' % i] for i in range(4)], **ST)
P['tanks'] = 'Два подфюзеляжных бака tank_r / tank_l - отдельные объекты (с пилонами), в игре неподвижны.'
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if nm_ in gr.POSE: parts[nm_]['in_gear_file_deg'] = gr.POSE[nm_]
P['parts'] = parts
P['motion_note'] = 'Элевоны elev1_r/l (внутренние) и elev2_r/l (внешние) −30…+25° (плюс - задняя кромка вниз), руль rudder ±25°, тормозные щитки brake_u_*/brake_d_* 0…55° (задняя кромка наружу), фонарь canopy 0…45° на заднем шарнире (рама canopy_frame - дочерняя). Створки шасси door_* лежат только в файле стоек, повёрнуты на in_gear_file_deg.'
P['gear_note'] = 'dr_gear.glb: носовая стойка, две основные (уходят наружу в крыло, щиток на стойке), хвостовые опорные колёса, открытые створки; только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта.'
P['tris_game'] = TRIS - sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in GEAR)
P['swap_notes'] = [
 'Рецепт prepare.js у e_draken старый (чужая j35.glb, scale 1.006, tex 1024, texVf): заменить на own: true, scale 1, nose -z, tex 2048, nTex 2048, pickMesh /./, centerX: true, как у e_f15e; добавить рецепт e_draken_gear (две метки по 1 мм не удалять).',
 'Запись старой модели j35 убрать из games/airdef/models/credits.js и CREDITS.md (строка e_draken.glb).',
 'models.js e_draken: stations - mirror(order_left из stations_game), nozzles - nozzles_game, nr 0.37, pod: null, clearGlass: true, gearModel: e_draken_gear при paintOn; dry не ставить (форсаж есть).',
 'META.e_draken_gear как у e_f15e_gear (lazy, matte, paint, stations: []). GLB_V для обоих ключей.',
 'Ложные цели: точка flares_game (под хвостом).',
 'После подмены: seats-gen.js e_draken, миниатюра thumbs/air_e_draken.webp (с paint=1), пара ktx для e_draken и e_draken_gear.',
 'Старый games/airdef/models/camo/e_draken.hi.glb от чужой модели удалить и убрать e_draken из models/hi-list.js, иначе при «Текстуры: максимум» останется старая (стенд видел запрос camo/e_draken.hi.glb).',
 'META e_draken: matte не нужен (свой материал paint).',
 'Будущие камуфляжи (Mark не делал): серый (02), зелёный (06), австрийский красно-белый (01) - на этой же развёртке.'
]
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(stations=P['stations_game']['order_left'], nozzles=P['nozzles_game'], nr=P['nr'], gear_bottom=P['gear_bottom_game_y']), open(os.path.join(HERE, 'точки.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('паспорт готов', LEN, SPAN, HGT, 'тр.', TRIS)

# ── Sketchfab: стоянка (крыло уже опущено, створки ниш открыты), оснастка sk_* со своим атласом, клипы ──
SKO = dr_sk.make_all(); vl.update()
for o in vl.objects: o.select_set(False)
for o in SKO: o.select_set(True)
vl.objects.active = SKO[0]
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.uv.average_islands_scale(); bpy.ops.uv.pack_islands(rotate=True, margin=0.004, margin_method='ADD', shape_method='CONCAVE')
bpy.ops.object.mode_set(mode='OBJECT')
SKS = int(os.environ.get('DR_SKTEX', '2048'))
imc = bpy.data.images.new('dr_sk_color', SKS, SKS); imo = bpy.data.images.new('dr_sk_orm', SKS, SKS); imo.colorspace_settings.name = 'Non-Color'
SKMAT = {m.name: (c, r) for m, (n_, c, r) in zip([bpy.data.materials[n] for n, _, _ in dr_sk.SKM], dr_sk.SKM)}
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
    for n_, _, _ in dr_sk.SKM: sk_graph(bpy.data.materials[n_], kind, img)
    bpy.ops.object.bake(type='EMIT', width=SKS, height=SKS, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
    img.filepath_raw = os.path.join(HERE, img.name + '.png'); img.file_format = 'PNG'; img.save(); print('атлас S', kind, img.filepath_raw)
sc.cycles.samples = int(os.environ['DR_SPP']); sc.cycles.use_denoising = True
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
EL = [n for n in g.PARTS if n.startswith('elev')]; BR = [n for n in g.PARTS if n.startswith('brake_')]
def st_controls(t):
    s = {}
    for n in EL: s[n] = 25.0 * math.sin(2 * math.pi * t / 4.0) * (1 if n.endswith('_r') else -1) * bump(t, 0.0, 0.5, 3.5, 4.0) + 20.0 * math.sin(2 * math.pi * (t - 4.0) / 4.0) * bump(t, 4.0, 4.5, 7.5, 8.0)
    s['rudder'] = 25.0 * math.sin(2 * math.pi * t / 5.0) * bump(t, 0.5, 1.0, 9.0, 9.5)
    for n in BR: s[n] = 55.0 * bump(t, 6.0, 7.0, 8.5, 9.5)
    s['canopy'] = 45.0 * bump(t, 1.0, 2.5, 4.5, 6.0)
    return s
CLIPS = {'Controls': (10.0, st_controls)}
def apply_state(s):
    for n_ in g.PARTS: bpy.data.objects[n_].matrix_basis = REST[n_]
    vl.update()
    for n_ in sorted([q for q in g.PARTS if q in s], key=lambda q: depth(bpy.data.objects[q])):
        setp(n_, s[n_]); vl.update()
ANIM = {'Controls': EL + BR + ['rudder', 'canopy']}
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
GLB = os.path.join(HERE, 'dr_sketchfab.glb')
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_apply=False, export_yup=True, export_materials='EXPORT', export_image_format='JPEG',
                          export_jpeg_quality=90, export_cameras=False, export_lights=False, export_normals=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True)
with open(GLB, 'rb') as fh:
    fh.read(12); ln, tp = struct.unpack('<II', fh.read(8)); js = json.loads(fh.read(ln))
print('Sketchfab', round(os.path.getsize(GLB) / 1e6, 1), 'МБ, узлов', len(js['nodes']), 'картинок', len(js.get('images', [])), 'клипы', {a['name']: len(a['channels']) for a in js.get('animations', [])})
TS = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in SEL)
for o in SKO: o.data.uv_layers.active.name = 'UVMap'
imc.pack(); imo.pack()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'dr.blend'), copy=True); print('blend сохранён')
# превью пакета: оснастка, парашют раскрыт
for o in SEL:
    if o.animation_data:
        for tr in o.animation_data.nla_tracks: tr.mute = True
apply_state({})
shot('превью_9_стоянка_оснастка.png', (0.0, 1.0, -0.6), (-0.60, 0.72, 0.16), 17.0, lens=45, wd=1920, h=1080)
apply_state(st_controls(4.5)); shot('превью_10_рули_фонарь.png', (0.0, -1.0, 0.0), (-0.55, -0.70, 0.45), 18.0, lens=45, wd=1920, h=1080)
apply_state({})
R = json.load(open(os.path.join(HERE, 'ОТЧЁТ.json'), encoding='utf-8')); R['previews'] = prev + ['превью_9_стоянка_оснастка.png', 'превью_10_рули_фонарь.png']
R['model']['tris'] = TS; R['model']['tris_game'] = TRIS - sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in GEAR)
R['sketchfab_vs_game'] = 'Игра: dr.glb - самолёт без стоек, карты 4096 (prepare.js сжимает до 2048) + dr_gear.glb для ангара. Sketchfab: стоянка (стойки и открытые створки), оснастка sk_* (колодки, заглушки заборников, ленты REMOVE BEFORE FLIGHT, стремянка к кабине) со своим атласом S 2048, клип Controls, картинки JPEG 90.'
json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова')
