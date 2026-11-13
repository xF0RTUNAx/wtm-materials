# deliver.py - сдача МиГ-23БН (по deliver.py Draken): превью, файл игры (без стоек; створки закрыты, гребень стоит, консоли разложены 16°), файл шасси для ангара
# (стойки, открытые створки door_*_g, сложенный гребень ventral_g, две метки по 1 мм), паспорт и отчёт; файл Sketchfab и .blend - стоянка со стойками и оснасткой sk_*
# (свой атлас S 2048) и клипами «Controls» и «Wing sweep». После gbuf.py (MG_TEX=4096 MG_SWEEP=0) и paint.py (MG_TEX=4096 MG_SCHEME=gdr MG_OUT=<папка модели>):
#   MG_STAGE=4 MG_SWEEP=0 Blender -b --factory-startup --python build.py --python deliver.py
import json, math, os, sys, struct
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/МиГ-23БН'
sys.path.insert(0, HERE); os.environ['MG_MAPS'] = HERE; os.environ['MG_OUT'] = HERE; os.environ['MG_ONLY'] = '__никакой__'; os.environ.setdefault('MG_SPP', '96'); os.environ.setdefault('MG_SWEEP', '0')
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
for nm, tg, dv, dist in (('превью_1_полёт.png', (0.0, 0.0, 0.0), (-0.48, 0.55, 0.42), 23.0), ('превью_2_сверху.png', (0.0, 0.0, 0.0), (0.02, -0.02, 1.0), 24.0),
                         ('превью_3_снизу.png', (0.0, 0.0, 0.0), (0.10, 0.12, -0.98), 24.0)):
    shot(nm, tg, dv, dist, wd=1920, h=1080); prev.append(nm)
for o in GEAR: o.hide_render = False
for n_, d_ in gr.POSE.items(): pose(n_, d_)
vl.update()
for nm, tg, dv, dist in (('превью_4_общий.png', (0.0, 1.0, -0.3), (-0.62, 0.65, 0.30), 22.0), ('превью_5_сбоку.png', (0.0, 0.3, -0.2), (-1.0, 0.02, 0.05), 25.0),
                         ('превью_6_нос.png', (0.0, Y(4.0), 0.1), (-0.62, 0.72, 0.25), 6.5), ('превью_7_хвост.png', (0.0, Y(14.3), 0.9), (-0.80, -0.48, 0.30), 6.5),
                         ('превью_8_сзади.png', (0.0, -1.0, 0.0), (0.62, -0.70, 0.28), 21.0), ('превью_9_шасси.png', (1.0, Y(10.0), -1.0), (0.70, 0.62, -0.12), 5.0)):
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
HID = [o for o in MESH() if o.name.startswith('door_') or o.name == 'ventral']
for o in HID:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); mk.export(os.path.join(SF, 'mig23_hangar.glb'), None)
for o in HID:
    for c in COLS[o.name]: c.objects.link(o)
vl.update()
mk.export(os.path.join(HERE, 'mig23.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'mig23.glb')) // 1024, 'КБ', TRIS_G, 'тр.')
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
vl.update(); mk.export(os.path.join(HERE, 'mig23_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'mig23_gear.glb')) // 1024, 'КБ', sorted(o.name for o in GEAR + COPIES))
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
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_mig23', weapon='', name='МиГ-23БН', name_en='MiG-23BN', glb='mig23.glb', blend='mig23.blend', rev=1,
    build=['build.py', '_mg_base.py', 'mg_geo.py', 'mg_det.py', 'mg_gear.py', 'mg_sk.py', 'mg_lines.py', 'uv_mg.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_views.py', '_sil.py', '_overlay.py', '_overlay08.py', '_стенд.js', '_run_paint.sh', 'deliver.py'], previews_=prev,
    checks={'deploy': col_, 'стыки': {k: v.get('плохо') for k, v in (styk.get('детали') or {}).items() if v.get('плохо')},
            'стыки_вблизи': 'wing_r/l: щель, в которой ходит консоль (так задумано, зазор 1,5 см); fin_c: концы прорези руля (ложная тревога); canopy_frame, pylon_*: мелкие отметки у рам и замков',
            'касания_задуманные': 'stab_*: вал стабилизатора в борту; slat_*: нижний угол носка внутри носка консоли; canopy: полозья рамы на пороге первые 8° хода; door_n_*: створки по линии шарнира',
            'silhouette_iou': {'сверху': 'наложение на чертёж 08 (_снимки/наложение_08.jpg) и 01 (_снимки/наложение_01.jpg): план крыла при 16° совпадает с 08', 'сбоку': 'наложение на чертёж 02 (_снимки/наложение_02.jpg)'},
            'game': 'стенд игры ?paint=1: ангар на своих стойках с консолями 16°, бой день и вечер - три четверти, бок, снизу; ошибок модели нет; на телефоне не проверено'},
    sketchfab={'title': 'MiG-23BN - Game-Ready Swing-Wing Strike Jet',
               'lead': 'Soviet swing-wing fighter-bomber in four-tone green and red-brown camouflage. Wing panels pivot 16-72 deg in sealed glove slots; spoilers, flaps, slats, stabilator, rudder, folding ventral fin, airbrakes and canopy move. Gun pod, side intakes, afterburner nozzle, pylons, cockpit, full landing gear.',
               'parts': ['fuselage', 'swing wing', 'glove', 'flight controls', 'ventral fin', 'airbrakes', 'canopy', 'cockpit', 'intakes', 'nozzle', 'gun pod', 'pylons', 'landing gear', 'ground equipment'],
               'tags': ['mig23', 'mig-23bn', 'flogger', 'soviet', 'swing-wing', 'fighter-bomber', 'aircraft', 'military', 'cold-war', 'camouflage', 'game-ready', 'pbr'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m at 16 deg (7.78 m at 72 deg), height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps',
               'animation': '"Controls" and "Wing sweep" (16-72-16 deg)', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'mig23_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-13). Форма построена заново по чертежам и фото mig23_01...08 (Mark), пиксели фото не использованы. Размах 13,97 м при 16° и 7,78 м при 72°, шарнир консоли (9,55; 1,70) выведен из обоих размахов; план крыла при 16° - по чертежу 08 (Mark: консоль уже, кромка у корня уходит вперёд). '
          'Окраска в игре: гамма 01/02 (серо-зелёный, оливковый, тёмно-оливковый, красно-коричневый, низ голубой), эмблем ГДР нет - только красные звёзды с бело-красной окантовкой; номер 571 придуман. Окраска 06/07 (песок, два зелёных, коричневый, номер 38) - в запасе: окраски/06-07. '
          'Износ: выгорание пятнами, подкраска листов, заклёпки и швы рельефом, копоть пушки и сопла, масло снизу, пыль, сколы кромок. Карты: цвет без света, нормали, R затенение, G шероховатость, B металл.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT, tris_game=TRIS_G, tris_gear_file=TRIS_GEAR); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'mig23_gear.glb'; P['files']['sketchfab_glb'] = 'mig23_sketchfab.glb'; P['gear_key'] = 'e_mig23_gear'
P['files']['camo_reserve'] = 'окраски/06-07 (mig23_color.png, mig23_normal.png, mig23_orm.png на той же развёртке)'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (сдвиг по высоте {round(cy, 4)} м и по длине {round(cb, 4)} м учтён); _gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение, G шероховатость, B металл; материалы MG_paint (один на всё) и MG_glass (BLEND, clearGlass). Текстуры собраны в 4096, в игре 2048 (атлас 19,9 м, 101 пикс/м при 2048).'
P['nozzles_game'] = [GG(g.P3(g.A_TAIL + 0.30, 0.0, 0.0))]; P['nr'] = round(g.NOZ_R - 0.07, 3); P['dry'] = False; P['afterburner'] = True; P['gear_bottom_game_y'] = round(mn_g - cy, 3)
P['flares_game'] = [GG(g.P3(13.6, 0.0, -0.50))]
ST = {k: GG(v) for k, v in g.STATIONS.items()}
P['stations_game'] = dict(note='mirror(): на сторону 2 точки - st0 под наплывом (x 1,55), st1 под фюзеляжем у гребня заборника (x 0,70); порядок от внешней к внутренней; center - центральный пилон (бак снят по слову Mark, пилон остался: pod). Точка - низ замка. '
    '_collide.py: ФАБ-500 (свои, Свои/ФАБ-500М62) на всех четырёх точках не задевают стойки, створки, гребень и друг друга (просвет между соседними 0,55 м) - racks не нужен.',
    order_left=[ST['st0_l'], ST['st1_l']], pod=ST['center'], **ST)
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('kind'): parts[nm_]['kind'] = D['kind']
    if D.get('parent'): parts[nm_]['parent'] = D['parent']
    if nm_ in gr.POSE: parts[nm_]['in_gear_file_deg'] = gr.POSE[nm_]
P['parts'] = parts
P['wing_sweep'] = dict(note='Файл игры - консоли разложены, 16° (Mark 2026-11-13: «пусть в игре он летает с разложенными крыльями»). Шарниры wing_r / wing_l вертикальные; сложить в 72° - поворот на 56° концом назад. '
    'Для META как у B-1B: pivots { wing_r: [pivot_game, [0, 1, 0]], wing_l: [pivot_game, [0, 1, 0]] }, сложено: wing_r -56, wing_l +56 (45° - ∓29). Механизация (flap*, slat, spoil*) - дети своей консоли. Сейчас sweep в игре не нужен.',
    pivot_game={n_: GG(g.PARTS[n_]['pivot']) for n_ in ('wing_r', 'wing_l')}, fold_deg={'wing_r': -56.0, 'wing_l': 56.0})
P['motion_note'] = ('Интерцепторы spoil1/2_* 0…25° (элеронов нет), закрылки flap1/2_* 0…50°, носок slat_* 0…20°, стабилизатор stab_* ±15°, руль rudder ±25°, щитки brake_u/d_* 0…50°, '
    'фонарь canopy 0…50° на заднем шарнире (рама canopy_frame - дочерняя), гребень ventral 0…90° (складывается вправо), крышка контейнера парашюта chute_cap 0…100°, сопло nozzle - масштаб 0,85…1,0.')
P['gear_note'] = 'mig23_gear.glb: носовая стойка (два колеса), две основные, створки door_*_g открыты, гребень ventral_g сложен; только для ангара. В основном файле те же створки door_* закрыты и гребень ventral стоит: в ангаре со стойками их прячет META gearHide. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта.'
P['tris_game'] = TRIS_G
P['swap_notes'] = [
 'Рецепт prepare.js e_mig23 заменить на own: true, scale 1, nose -z, tex 2048, nTex 2048, pickMesh /./, centerX: true и groups: door_n_r, door_n_l, door_m_r, door_m_l, ventral (и wing_r / wing_l, если когда-нибудь нужна стреловидность) - свои части, остальное body; добавить рецепт e_mig23_gear (метки по 1 мм не удалять).',
 'Запись старой модели e_mig23 убрать из games/airdef/models/credits.js и CREDITS.md; старый camo/e_mig23.hi.glb (если есть) удалить и убрать из hi-list.js.',
 'models.js e_mig23: stations - mirror(order_left из stations_game), nozzles - nozzles_game, nr, pod - stations_game.pod (центральный пилон), clearGlass: true, gearModel: e_mig23_gear при paintOn, gearHide: [door_n_r, door_n_l, door_m_r, door_m_l, ventral]; dry не ставить (форсаж есть).',
 'META.e_mig23_gear как у e_f15e_gear (lazy, matte, paint, stations: []). GLB_V для обоих ключей.',
 'Ложные цели: flares_game (под хвостом).',
 'После подмены: seats-gen.js e_mig23 (ФАБ-500 на 4 точках), миниатюра thumbs/air_e_mig23.webp (paint=1), пара ktx для e_mig23 и e_mig23_gear.',
 'Окраска 06/07 в запасе: окраски/06-07 - для магазина камуфляжей, на той же развёртке.'
]
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(stations=P['stations_game']['order_left'], pod=P['stations_game']['pod'], nozzles=P['nozzles_game'], nr=P['nr'], gear_bottom=P['gear_bottom_game_y'],
               pivots={n_: [GG(g.PARTS[n_]['pivot']), [0, 1, 0]] for n_ in ('wing_r', 'wing_l')}, sweep={'wing_r': 0.0, 'wing_l': 0.0}), open(os.path.join(HERE, 'точки.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('паспорт готов', LEN, SPAN, HGT, 'тр. игра', TRIS_G, 'шасси', TRIS_GEAR)

# ── Sketchfab: стоянка (створки открыты, гребень сложен), оснастка sk_* со своим атласом, клипы ──
SKO = mg_sk.make_all(); vl.update()
for o in vl.objects: o.select_set(False)
for o in SKO: o.select_set(True)
vl.objects.active = SKO[0]
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.uv.average_islands_scale(); bpy.ops.uv.pack_islands(rotate=True, margin=0.004, margin_method='ADD', shape_method='CONCAVE')
bpy.ops.object.mode_set(mode='OBJECT')
SKS = int(os.environ.get('MG_SKTEX', '2048'))
imc = bpy.data.images.new('mig23_sk_color', SKS, SKS); imo = bpy.data.images.new('mig23_sk_orm', SKS, SKS); imo.colorspace_settings.name = 'Non-Color'
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
# ── стоянка: створки открыты, гребень сложен (как в файле шасси) ──
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
BR = [n for n in g.PARTS if n.startswith('brake_')]; STB = [n for n in g.PARTS if n.startswith('stab_')]
def st_controls(t):
    s = {}
    for n in SP: s[n] = 25.0 * max(0.0, math.sin(2 * math.pi * t / 4.0) * (1 if n.endswith('_r') else -1)) * bump(t, 0.0, 0.5, 3.5, 4.0)
    for n in STB: s[n] = 12.0 * math.sin(2 * math.pi * t / 4.0) * (1 if n.endswith('_r') else -1) * bump(t, 0.0, 0.5, 3.5, 4.0) + 12.0 * math.sin(2 * math.pi * (t - 4.0) / 3.0) * bump(t, 4.0, 4.5, 7.0, 7.5)
    for n in FLP: s[n] = 50.0 * bump(t, 2.0, 3.5, 6.5, 8.0)
    for n in SL: s[n] = 20.0 * bump(t, 2.0, 3.5, 6.5, 8.0)
    s['rudder'] = 25.0 * math.sin(2 * math.pi * t / 5.0) * bump(t, 0.5, 1.0, 9.0, 9.5)
    for n in BR: s[n] = 50.0 * bump(t, 6.0, 7.0, 8.5, 9.5)
    s['canopy'] = 50.0 * bump(t, 1.0, 2.5, 4.5, 6.0)
    return s
def st_sweep(t):
    k = 56.0 * bump(t, 0.5, 3.0, 5.0, 7.5); return {'wing_r': k, 'wing_l': k}
CLIPS = {'Controls': (10.0, st_controls), 'Wing sweep': (8.0, st_sweep)}
ANIM = {'Controls': SP + STB + FLP + SL + BR + ['rudder', 'canopy'], 'Wing sweep': ['wing_r', 'wing_l']}
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
GLB = os.path.join(HERE, 'mig23_sketchfab.glb')
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_apply=False, export_yup=True, export_materials='EXPORT', export_image_format='JPEG',
                          export_jpeg_quality=90, export_cameras=False, export_lights=False, export_normals=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True)
with open(GLB, 'rb') as fh:
    fh.read(12); ln, tp = struct.unpack('<II', fh.read(8)); js = json.loads(fh.read(ln))
print('Sketchfab', round(os.path.getsize(GLB) / 1e6, 1), 'МБ, узлов', len(js['nodes']), 'картинок', len(js.get('images', [])), 'клипы', {a['name']: len(a['channels']) for a in js.get('animations', [])})
TS = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in SEL)
for o in SKO: o.data.uv_layers.active.name = 'UVMap'
imc.pack(); imo.pack()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'mig23.blend'), copy=True); print('blend сохранён')
for o in SEL:
    if o.animation_data:
        for tr in o.animation_data.nla_tracks: tr.mute = True
apply_state({})
shot('превью_10_стоянка_оснастка.png', (0.0, 1.0, -0.6), (-0.60, 0.72, 0.16), 17.0, lens=45, wd=1920, h=1080)
apply_state(st_controls(5.0)); shot('превью_11_механизация.png', (0.0, -1.0, 0.0), (-0.55, -0.70, 0.45), 19.0, lens=45, wd=1920, h=1080)
apply_state(st_sweep(4.0)); shot('превью_12_крыло_72.png', (0.0, 0.0, 0.0), (-0.40, 0.45, 0.80), 22.0, lens=45, wd=1920, h=1080)
apply_state({})
R = json.load(open(os.path.join(HERE, 'ОТЧЁТ.json'), encoding='utf-8')); R['previews'] = prev + ['превью_10_стоянка_оснастка.png', 'превью_11_механизация.png', 'превью_12_крыло_72.png']
R['model']['tris'] = TS
R['sketchfab_vs_game'] = 'Игра: mig23.glb - самолёт без стоек, консоли 16°, карты 4096 (prepare.js сжимает до 2048) + mig23_gear.glb для ангара. Sketchfab: стоянка (стойки, открытые створки, гребень сложен), оснастка sk_* (колодки, заглушки заборников, ленты REMOVE BEFORE FLIGHT, стремянка) со своим атласом S 2048, клипы Controls и Wing sweep, картинки JPEG 90.'
json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова')
