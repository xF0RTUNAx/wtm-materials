# deliver.py - сдача МиГ-25БМ (из deliver.py МиГ-27К): превью, файл игры (без стоек; створки закрыты), файл шасси для ангара (стойки, открытые створки door_*_g,
# две метки по 1 мм), паспорт и отчёт; файл Sketchfab и .blend - стоянка со стойками и оснасткой sk_* (свой атлас S 2048) и клипом «Controls».
# После gbuf.py (MG_TEX=4096) и paint.py (MG_TEX=4096 MG_SCHEME=silver MG_OUT=<папка модели>):  MG_STAGE=4 Blender -b --factory-startup --python build.py --python deliver.py
import json, math, os, sys, struct
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/МиГ-25БМ'
sys.path.insert(0, HERE); os.environ['MG_MAPS'] = HERE; os.environ['MG_OUT'] = HERE; os.environ['MG_ONLY'] = '__никакой__'; os.environ.setdefault('MG_SPP', '96')
os.environ.pop('MG_NOSHOTS', None)
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# ── файлы игры ──')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
from mathutils import Vector, Matrix, Euler
import mg_sk
MESH = lambda: [o for o in sc.objects if o.type == 'MESH']
GEAR = [o for o in MESH() if o.name.startswith('gear')]
# ── превью игровой модели: на стоянке (стойки, открытые створки, гребень сложен) и в полёте ──
for o in GEAR: o.hide_render = True
prev = []
for nm, tg, dv, dist in (('превью_1_полёт.png', (0.0, 0.0, 0.0), (-0.48, 0.55, 0.42), 30.0), ('превью_2_сверху.png', (0.0, 0.0, 0.0), (0.02, -0.02, 1.0), 31.0),
                         ('превью_3_снизу.png', (0.0, 0.0, 0.0), (0.10, 0.12, -0.98), 31.0)):
    shot(nm, tg, dv, dist, wd=1920, h=1080); prev.append(nm)
for o in GEAR: o.hide_render = False
for n_, d_ in gr.POSE.items(): pose(n_, d_)
vl.update()
for nm, tg, dv, dist in (('превью_4_общий.png', (0.0, 1.5, -0.3), (-0.62, 0.65, 0.30), 29.0), ('превью_5_сбоку.png', (0.0, 0.3, 0.3), (-1.0, 0.02, 0.05), 33.0),
                         ('превью_6_нос.png', (0.0, Y(4.5), 0.1), (-0.62, 0.72, 0.25), 8.0), ('превью_7_хвост.png', (0.0, Y(19.0), 1.2), (-0.80, -0.48, 0.30), 8.5),
                         ('превью_8_сзади.png', (0.0, -1.5, 0.0), (0.62, -0.70, 0.28), 27.0), ('превью_9_шасси.png', (1.5, Y(13.0), -1.2), (0.70, 0.62, -0.12), 6.5)):
    shot(nm, tg, dv, dist, wd=1920, h=1080); prev.append(nm)
for n_, d_ in gr.POSE.items(): pose(n_, -d_)
vl.update(); print('превью', prev)
# ── файлы игры ──
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
SF = os.path.join(HERE, '_live', 'sf'); os.makedirs(SF, exist_ok=True)                    # для стенда: вариант для ангара без створок и гребня (в игре их прячет gearHide)
HID = [o for o in MESH() if o.name.startswith('door_')]
for o in HID:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); mk.export(os.path.join(SF, 'mig25_hangar.glb'), None)
for o in HID:
    for c in COLS[o.name]: c.objects.link(o)
vl.update()
mk.export(os.path.join(HERE, 'mig25.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'mig25.glb')) // 1024, 'КБ', TRIS_G, 'тр.')
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
vl.update(); mk.export(os.path.join(HERE, 'mig25_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'mig25_gear.glb')) // 1024, 'КБ', sorted(o.name for o in GEAR + COPIES))
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
LEN, SPAN = round(mx.y - mn.y, 3), round(mx.x - mn.x, 3)
for n_, d_ in gr.POSE.items(): pose(n_, d_)
vl.update(); hp = [o.matrix_world @ v.co for o in MESH() for v in o.data.vertices]; HGT = round(max(p.z for p in hp) - min(p.z for p in hp), 3)
for n_, d_ in gr.POSE.items(): pose(n_, -d_)
vl.update()
TRIS = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in MESH())
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_mig25', weapon='', name='МиГ-25БМ', name_en='MiG-25BM', glb='mig25.glb', blend='mig25.blend', rev=1,
    build=['build.py', '_mg_base.py', 'mg_geo.py', 'mg_det.py', 'mg_gear.py', 'mg_sk.py', 'mg_lines.py', 'uv_mg.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_views.py', '_sil.py', '_ov01.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'deploy': col_, 'стыки': {k: v.get('плохо') for k, v in (styk.get('детали') or {}).items() if v.get('плохо')},
            'стыки_вблизи': 'stab_*: корень по борту, над соплом зазор под ход ±25°; canopy: шов у дуги козырька ~4 мм и по порогу ~1 см; wing_*: швы закрылков и элеронов; door_m_*: открытые створки в файле шасси',
            'касания_задуманные': 'нет: _collide на всём ходу каждой части чисто (стабилизаторы, рули, элероны, закрылки, губы заборников, щиток, фонарь 0…70°)',
            'подвеска': 'Х-58У на всех четырёх точках: на месте, при сбросе, со стойками и открытыми створками, с соседней ракетой и при механизации на ходу - без касаний',
            'silhouette_iou': {'сверху и сбоку': 'наложение на чертёж 01 (_ov01.py; масштаб по размаху 14,02 м)'},
            'game': 'стенд игры ?paint=1: ангар на своих стойках, бой день и вечер; на телефоне не проверено'},
    sketchfab={'title': 'MiG-25BM Foxbat-F - Game-Ready SEAD Jet',
               'lead': 'Soviet Mach 3 defence-suppression aircraft in white-silver paint. Long reconnaissance-strike nose with dark dielectric tip and pitot boom, huge box intakes with raked lips, twin fins, all-moving stabilators, four underwing pylons for Kh-58U anti-radar missiles. Canopy, lips, flaps, ailerons, rudders, stabilators and airbrake move.',
               'parts': ['fuselage', 'box intakes', 'wing', 'twin fins', 'ventral fins', 'flight controls', 'airbrake', 'canopy', 'cockpit', 'pylons', 'nozzles', 'landing gear', 'ground equipment'],
               'tags': ['mig25', 'mig-25bm', 'foxbat', 'soviet', 'interceptor', 'sead', 'aircraft', 'military', 'cold-war', 'jet', 'game-ready', 'pbr'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps',
               'animation': '"Controls" (canopy, intake lips, flaps, ailerons, stabilators, rudders, airbrake)', 'based': 'Built from scratch in Blender from reference drawings.', 'glb': 'mig25_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-14). Своя модель по чертежу 01 Mark (масштаб по размаху 14,02 м, длина с ПВД 22,3 м: чертёж короче заявленных в задании 23,8 м) и фото 02-09. '
          'Нос РБ/БМ: длинный конус, тёмный диэлектрический наконечник, ПВД штангой. Заборники с наклонным срезом и щелью у фюзеляжа ~10 см (Mark), нижние губы отклоняются. '
          'Хвост плавно переходит в обвод двух сопел (Mark). Фонарь: стеклянный козырёк и металлический колпак с окнами, открывается вправо. '
          'Окраска в игре - бело-серебристая (Mark, по 02 и 07): противобликовая панель на носу, красный номер 52 с белой окантовкой (придуман), звёзды по центру площади килей и консолей (п. 17), мелкие надписи свои, '
          'без боковой тёмной полосы на носу и без пятен грунта (Mark: как плесень). В окраски/ на хранение: светло-серая (03, 06, 09) и камуфляж (04).')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT, tris_game=TRIS_G, tris_gear_file=TRIS_GEAR); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'mig25_gear.glb'; P['files']['sketchfab_glb'] = 'mig25_sketchfab.glb'; P['gear_key'] = 'e_mig25_gear'
P['files']['liveries'] = {'grey': 'окраски/серая/', 'camo': 'окраски/камуфляж/'}
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (сдвиг по высоте {round(cy, 4)} м и по длине {round(cb, 4)} м учтён); _gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение, G шероховатость, B металл; материалы MG_paint (один на всё) и MG_glass (BLEND, clearGlass). Текстуры собраны в 4096, в игре 2048.'
P['nozzles_game'] = [GG(g.P3(g.A_TAIL + 0.25, sx * g.NOZ_X, g.NOZ_Z)) for sx in (1, -1)]; P['nr'] = round(g.NOZ_R - 0.10, 3); P['dry'] = False; P['afterburner'] = True; P['gear_bottom_game_y'] = round(mn_g - cy, 3)
P['flares_game'] = [GG(g.P3(18.2, 0.0, -0.95))]
ST = {k: GG(v) for k, v in g.STATIONS.items()}
P['stations_game'] = dict(note='mirror(order_left): на сторону 2 подкрыльевых пилона - st_in (x 3,35 м) и st_out (x 4,58 м); все 4 ракеты Х-58У одинаковые, порядок не важен. pod: null. '
    'Точка - низ замка пилона. _collide.py: Х-58У на каждой точке без касаний на месте, при сбросе, со стойками и открытыми створками, с соседней ракетой и с механизацией на ходу.',
    order_left=[ST['st_in_l'], ST['st_out_l']], pod=None, **ST)
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('kind'): parts[nm_]['kind'] = D['kind']
    if D.get('parent'): parts[nm_]['parent'] = D['parent']
    if nm_ in gr.POSE: parts[nm_]['in_gear_file_deg'] = gr.POSE[nm_]
P['parts'] = parts
P['motion_note'] = ('Стабилизаторы stab_* ±25° (цельноповоротные), рули rudder_* ±25°, элероны aileron_* ±20°, закрылки flap_* 0…25°, губы заборников lip_* 0…20° (вниз), '
    'тормозной щиток brake 0…45°, фонарь canopy 0…70° (вправо на продольной оси), сопла nozzle_* - масштаб 0,85…1,0; створки door_* - в файле шасси открыты.')
P['gear_note'] = 'mig25_gear.glb: носовая стойка (два колеса), две основные, створки door_*_g открыты; только для ангара. В основном файле те же створки door_* закрыты: в ангаре со стойками их прячет META gearHide. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта.'
P['tris_game'] = TRIS_G
P['swap_notes'] = [
 'Рецепт prepare.js e_mig25 заменить на own: true, scale 1, nose -z, tex 2048, nTex 2048, pickMesh /./, centerX: true и groups: door_n_r, door_n_l, door_m_r, door_m_l - свои части, остальное body; добавить рецепт e_mig25_gear (метки по 1 мм не удалять).',
 'Старая модель e_mig25 (Sketchfab «Mig25», mig25-afe67617…) - убрать её запись из games/airdef/models/credits.js и CREDITS.md; старый camo/e_mig25.hi.glb (если есть) удалить и убрать из hi-list.js.',
 'models.js e_mig25: stations - mirror(order_left из stations_game) - 4 точки; nozzles - nozzles_game (два сопла), nr; pod: null; clearGlass: true, gearModel: e_mig25_gear при paintOn, gearHide: [door_n_r, door_n_l, door_m_r, door_m_l]; dry не ставить.',
 'META.e_mig25_gear как у e_mig27_gear (lazy, matte, paint, stations: []). GLB_V для обоих ключей.',
 'Ложные цели: flares_game (под хвостовой частью между гребнями).',
 'Снимок меню air_e_mig25_dive - со старой моделью, переснять после подмены. После подмены: seats-gen.js e_mig25 (Х-58У), миниатюра thumbs/air_e_mig25.webp (paint=1), пара ktx для e_mig25 и e_mig25_gear.',
 'Окраски на хранение (не в игру): окраски/серая и окраски/камуфляж - те же развёртка и файл, свои mig25_color/normal/orm.png 4096.'
]
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(stations=P['stations_game']['order_left'], pod=None, nozzles=P['nozzles_game'], nr=P['nr'], gear_bottom=P['gear_bottom_game_y']), open(os.path.join(HERE, 'точки.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('паспорт готов', LEN, SPAN, HGT, 'тр. игра', TRIS_G, 'шасси', TRIS_GEAR)

# ── Sketchfab: стоянка (створки открыты), оснастка sk_* со своим атласом, клип ──
SKO = mg_sk.make_all(); vl.update()
for o in vl.objects: o.select_set(False)
for o in SKO: o.select_set(True)
vl.objects.active = SKO[0]
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.uv.average_islands_scale(); bpy.ops.uv.pack_islands(rotate=True, margin=0.004, margin_method='ADD', shape_method='CONCAVE')
bpy.ops.object.mode_set(mode='OBJECT')
SKS = int(os.environ.get('MG_SKTEX', '2048'))
imc = bpy.data.images.new('mig25_sk_color', SKS, SKS); imo = bpy.data.images.new('mig25_sk_orm', SKS, SKS); imo.colorspace_settings.name = 'Non-Color'
SKMAT = {n_: (c, r) for n_, c, r in mg_sk.SKM}
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
    for n_, _, _ in mg_sk.SKM: sk_graph(bpy.data.materials[n_], kind, img)
    bpy.ops.object.bake(type='EMIT', width=SKS, height=SKS, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
    img.filepath_raw = os.path.join(HERE, img.name + '.png'); img.file_format = 'PNG'; img.save(); print('атлас S', kind, img.filepath_raw)
sc.cycles.samples = int(os.environ['MG_SPP']); sc.cycles.use_denoising = True
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
STB = [n for n in g.PARTS if n.startswith('stab_')]; FLP = [n for n in g.PARTS if n.startswith('flap')]; AIL = [n for n in g.PARTS if n.startswith('aileron')]
RUD = [n for n in g.PARTS if n.startswith('rudder')]; LIP = [n for n in g.PARTS if n.startswith('lip_')]
def st_controls(t):
    s = {}
    for n in AIL: s[n] = 18.0 * math.sin(2 * math.pi * t / 4.0) * (1 if n.endswith('_r') else -1) * bump(t, 0.0, 0.5, 3.5, 4.0)
    for n in STB: s[n] = 12.0 * math.sin(2 * math.pi * t / 4.0) * (1 if n.endswith('_r') else -1) * bump(t, 0.0, 0.5, 3.5, 4.0) + 15.0 * math.sin(2 * math.pi * (t - 4.0) / 3.0) * bump(t, 4.0, 4.5, 7.0, 7.5)
    for n in FLP: s[n] = 25.0 * bump(t, 2.0, 3.5, 6.5, 8.0)
    for n in LIP: s[n] = 20.0 * bump(t, 1.5, 3.0, 7.0, 8.5)
    for n in RUD: s[n] = 25.0 * math.sin(2 * math.pi * t / 5.0) * bump(t, 0.5, 1.0, 9.0, 9.5)
    s['brake'] = 45.0 * bump(t, 6.0, 7.0, 8.5, 9.5)
    s['canopy'] = 60.0 * bump(t, 1.0, 2.5, 4.5, 6.0)
    return s
CLIPS = {'Controls': (10.0, st_controls)}
ANIM = {'Controls': AIL + STB + FLP + LIP + RUD + ['brake', 'canopy']}
def apply_state(s):
    for n_ in g.PARTS:
        if n_ in REST: bpy.data.objects[n_].matrix_basis = REST[n_]
    vl.update()
    for n_ in sorted([q for q in g.PARTS if q in s], key=lambda q: depth(bpy.data.objects[q])):
        setp(n_, s[n_]); vl.update()
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
GLB = os.path.join(HERE, 'mig25_sketchfab.glb')
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_apply=False, export_yup=True, export_materials='EXPORT', export_image_format='JPEG',
                          export_jpeg_quality=90, export_cameras=False, export_lights=False, export_normals=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True)
with open(GLB, 'rb') as fh:
    fh.read(12); ln, tp = struct.unpack('<II', fh.read(8)); js = json.loads(fh.read(ln))
print('Sketchfab', round(os.path.getsize(GLB) / 1e6, 1), 'МБ, узлов', len(js['nodes']), 'картинок', len(js.get('images', [])), 'клипы', {a['name']: len(a['channels']) for a in js.get('animations', [])})
TS = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in SEL)
for o in SKO: o.data.uv_layers.active.name = 'UVMap'
imc.pack(); imo.pack()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'mig25.blend'), copy=True); print('blend сохранён')
for o in SEL:
    if o.animation_data:
        for tr in o.animation_data.nla_tracks: tr.mute = True
apply_state({})
shot('превью_10_стоянка_оснастка.png', (0.0, 2.0, -0.6), (-0.60, 0.72, 0.16), 22.0, lens=45, wd=1920, h=1080)
apply_state(st_controls(5.0)); shot('превью_11_механизация.png', (0.0, -1.5, 0.0), (-0.55, -0.70, 0.45), 26.0, lens=45, wd=1920, h=1080)
apply_state({})
R = json.load(open(os.path.join(HERE, 'ОТЧЁТ.json'), encoding='utf-8')); R['previews'] = prev + ['превью_10_стоянка_оснастка.png', 'превью_11_механизация.png']
R['model']['tris'] = TS
R['sketchfab_vs_game'] = 'Игра: mig25.glb - самолёт без стоек, карты 4096 (prepare.js сжимает до 2048) + mig25_gear.glb для ангара. Sketchfab: стоянка (стойки, открытые створки), оснастка sk_* (колодки, заглушки заборников, ленты REMOVE BEFORE FLIGHT, стремянка) со своим атласом S 2048, клип Controls, картинки JPEG 90.'
json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова')
