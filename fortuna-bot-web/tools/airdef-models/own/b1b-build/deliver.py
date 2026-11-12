# deliver.py - сдача B-1B Lancer: превью, файл для Sketchfab и .blend (стойки выпущены, створки ниш открыты), файл игры (без стоек и створок ниш),
# файл стоек для ангара (две метки по 1 мм), паспорт и отчёт. После gbuf.py (B1_TEX=4096) и paint.py (B1_OUT=папка модели):
#   B1_DIR="<папка модели>" B1_STAGE=4 Blender -b --factory-startup --python build.py --python deliver.py
import json, math, os, sys
HERE = os.environ['B1_DIR']; sys.path.insert(0, HERE); os.environ['B1_MAPS'] = HERE; os.environ['B1_OUT'] = HERE; os.environ['B1_ONLY'] = '__никакой__'; os.environ.setdefault('B1_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: без стоек и без створок шасси')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
for n_, d_ in gr.POSE.items(): pose(n_, d_)
vl.update(); prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 0.5, -1.5), (0.60, 0.62, 0.42), 62.0), ('превью_2_сбоку.png', (0.0, 0.0, -1.2), (1.0, 0.0, 0.04), 60.0),
                         ('превью_3_сверху.png', (0.0, 0.0, 0.0), (0.03, -0.03, 1.0), 92.0), ('превью_4_хвост.png', (2.0, Y(34.0), -1.5), (0.70, -0.62, 0.30), 22.0),
                         ('превью_5_кабина.png', (0.0, Y(7.0), -0.8), (0.70, 0.60, 0.40), 10.0), ('превью_6_снизу.png', (0.0, 0.3, -2.5), (0.10, 0.12, -0.98), 66.0),
                         ('превью_7_сопла.png', (3.75, Y(32.5), -3.6), (0.62, -0.75, -0.10), 9.0)):
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
col = rd('_снимки/_collide.json'); styk = rd('_стыки/_стыки.json')
mk.export(os.path.join(HERE, 'b1b_sketchfab.glb'), os.path.join(HERE, 'b1b.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'b1b_sketchfab.glb')) // 1024, 'КБ')
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith(('gear', 'door_'))]
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_b1b', weapon='', name='B-1B', name_en='Rockwell B-1B Lancer', glb='b1b.glb', blend='b1b.blend', rev=1,
    build=['build.py', 'b1b_geo.py', 'b1b_wing.py', 'b1b_cock.py', 'b1b_bay.py', 'b1b_gear.py', 'uv_b1b.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_bomb.py', '_стенд.js', '_run_paint.sh', 'deliver.py'], previews_=prev,
    checks={'ход': {n: v.get('касаний') for n, v in col.items()},
            'ход_примечание': 'Касаний нет, кроме wing_r/l при 0…15° хода: передняя кромка корня консоли у угла наплыва касается внутренней стенки щели (тонкие грани перехода высоты щели), снаружи не видно - осмотрено вблизи (_снимки/u4_лист.jpg).',
            'стыки': {k: v.get('плохо') for k, v in (styk.get('детали') or {}).items() if v.get('плохо')},
            'стыки_вблизи': 'wing_r/l: щель у корня при сложенном крыле - устье щели наплыва, закрыто резиновым уплотнением seal_*',
            'отсеки': '_bomb.py: GBU-31 и Mk 82 на всех точках - при закрытых створках касаются только замков, при открытых на 90° падают на 4 м свободно. Tomahawk 5,56 м: в передний отсек (4,70 м) не помещается; в передний+средний без перегородки bay_bulkhead - помещается, касаний нет.',
            'game': 'игра (стенд ?paint=1): ангар на стойках, бой день и вечер - три четверти, бок, снизу, сзади; сброс GBU-31 из отсека; ошибок модели нет (в ангаре HTTP 500 сервера рейтинга - не модель); на телефоне не проверено'},
    sketchfab={'title': 'B-1B Lancer - Game-Ready Swing-Wing Bomber', 'lead': 'Swing-wing supersonic bomber in weathered gunship grey with fictional stencils. Wings sweep 15-67.5 degrees on real pivots in a sealed glove slot; slats, flaps and spoilers move with them. Three weapon bays with racks and opening doors, three-part rudder, all-moving tailplanes, four afterburner nozzles.',
               'parts': ['swing wings', 'slats and flaps', 'spoilers', 'glove slot seals', 'three-part rudder', 'tailplanes', 'weapon bays', 'bay doors', 'four-seat cockpit', 'nacelles', 'nozzles', 'landing gear'],
               'tags': ['b1b', 'lancer', 'bomber', 'swing-wing', 'aircraft', 'military', 'usaf', 'supersonic', 'game-ready', 'pbr', 'textured', 'weathered'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m (wings swept), height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and occlusion-roughness-metallic maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'b1b_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-11). Форма построена заново по фото Mark b1b_01…24 (пиксели фото не использованы), размеры по прежней модели игры (длина 44,5 м, размах при сложенном крыле около 23,7 м). Окраска gunship grey по _окраска_задание.md: листы, подкраски, затёртый блеск, эрозия кромок, потёки по потоку, масло, копоть, брызги, сколы по маскам CC0 ambientCG (грунт в глубоких), швы и заклёпки в нормалях. Все надписи вымышленные: код FW, номер AF 89-417, NO STEP, RESCUE, заправка, предупреждения у заборников и сопел, давление шин. Карты: цвет без света, нормали по высоте, R затенение, G шероховатость, B металл. В файле Sketchfab и .blend стойки выпущены, створки ниш открыты; в файле игры стоек и створок ниш нет. Пакет Sketchfab - та же модель с картами 4096 (отдельной оснастки sk_* у самолёта нет).')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
for n_, d_ in gr.POSE.items(): pose(n_, -d_)
vl.update(); MP = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'b1b.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'b1b.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for n_, d_ in gr.POSE.items(): pose(n_, d_)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'b1b_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'b1b_gear.glb')) // 1024, 'КБ')
cy = (MN_M[2] + MX_M[2]) / 2; cb = (MN_M[1] + MX_M[1]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-(v.y - cb), 3)]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'b1b_gear.glb'; P['files']['sketchfab_glb'] = 'b1b_sketchfab.glb'; P['gear_key'] = 'e_b1b_gear'
P['axes'] = f'Координаты _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (сдвиг по высоте {round(cy, 4)} м и по длине {round(cb, 4)} м учтён); _gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто), G шероховатость, B металл; материалы B1_paint (один на всё) и B1_glass (BLEND, clearGlass). Карты в файлах 4096, для игры 2048.'
P['nozzles_game'] = [GG(c) for c, r in g.NOZ]; P['nr'] = round(g.NOZ[0][1], 3); P['dry'] = False; P['gear_bottom_game_y'] = round(mn_g - cy, 3)
P['flares_game'] = [GG(g.P3(42.6, sx * 0.35, -2.4)) for sx in (-1, 1)]
ST = {k: GG(v) for k, v in g.STATIONS.items()}
P['stations_game'] = dict(note='Отсеки: 8 точек, на сторону 4. Порядок для mirror() - левая сторона, индекс 3 заполняется первым: 3 - средний отсек (a 18,27, x ±0,45), 2 - передний (13,35, ±0,45), 1 и 0 - задний отсек одним рядом (28,35; x ±0,42 и ±0,92). Точка - низ замка, верх бомбы у точки. GBU-31 ×4 ложатся в 3 и 2, Mk 82 ×4 - в 1 и 0 (_bomb.py: касаются только замков, падают свободно). Tomahawk 5,56 м помещается только в передний+средний без перегородки bay_bulkhead (точка - середина a 15,81, x 0).',
    order_left=[ST['st%d_l' % i] for i in range(4)], tomahawk_center_game=GG(g.P3(15.81, 0.0, -1.80)), **ST)
P['pod_game'] = None
bay = {n_: [GG(g.PARTS[n_]['pivot']), G2(g.PARTS[n_]['axis']), 90] for n_ in g.PARTS if n_.startswith('bay') and n_[3] in '123'}
P['bay'] = dict(note='Для bay.js (META.bay): doors - имя: [точка на оси, ось, угол открытия]; рёбра bay*_ribs - дочерние. Створки: bay1 - передний отсек, bay2 - средний, bay3 - задний; ось у нижнего наружного угла, плюс - внутренняя кромка вниз.',
    doors=bay, sides=dict(L=[n for n in bay if n.endswith('_l')], R=[n for n in bay if n.endswith('_r')]))
parts = {}
for nm_, D in g.PARTS.items():
    e = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('parent'): e.update(parent=D['parent'], pivot_local_gltf=G2(D['pivot_local']), axis_local_gltf=G2(D['axis_local']))
    if D.get('rest') is not None: e['in_file_deg'] = D['rest']
    if nm_ in gr.POSE: e['in_gear_file_deg'] = gr.POSE[nm_]
    parts[nm_] = e
P['parts'] = parts
W = g.PARTS['wing_r']
P['wing_sweep'] = dict(note='Крыло изменяемой стреловидности: wing_r/wing_l - узлы консолей, начало на вертикальной оси шарнира (pivot_gltf). В файле консоли сложены: стреловидность передней кромки 67,5° (in_file_deg 52,5 от положения 15°). Крыло вперёд: повернуть каждую консоль на −52,5° вокруг её axis_gltf (правая ось -Y, левая +Y в осях glTF: плюс - конец назад). Механизация (slat*, flap*, spoiler*) - дочерние узлы консоли, вращаются вместе с ней; выпускать при крыле вперёд (≤ 25°).',
    sweep_min_deg=g.SW_MIN, sweep_max_deg=g.SW_MAX, in_file_sweep_deg=g.SW_MAX, pivot_r_gltf=G2(W['pivot']), pivot_r_game=GG(W['pivot']),
    span_m={'15°': round(2 * (g.PIV_X + g.W_SPAN), 2), '67.5° (файл)': SPAN})
P['motion_note'] = ('Повороты: wing_r/l (стреловидность), slat1-3 (0…22°, ось по размаху консоли, центр дуги позади и ниже - выходят вперёд-вниз), flap1-3 (0…40°), spoiler1-4 (0…60°), rudder1-3 (±25°), stab_r/l (−12…+8°, дальше задевает хвостовой конус), '
                    'vane_r/l (±30°), bay1-3_r/l (0…92°). Люки катапульт hatch_* - отдельные панели (на будущее). Уплотнение щели seal_* неподвижно. Створки ниш door_* - только в файле стоек, повёрнуты на in_gear_file_deg.')
P['gear_note'] = 'b1b_gear.glb: стойки (передняя на 2 колеса, основные тележки 2×2) и открытые створки ниш, только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. В файле самолёта стоек и створок ниш нет, контур створок - шов.'
P['swap_notes'] = [
 'prepare.js e_b1b: заменить чужой b1b_manilov.glb на own: true, scale 1, nose -z, tex 2048, nTex 2048, pickMesh /./, centerX: true (как у e_vulcan); добавить рецепт e_b1b_gear (метки по 1 мм не удалять).',
 'credits.js и CREDITS.md: убрать запись «B1» (manilov.ap) для e_b1b; сам автор остаётся (другие его модели в игре).',
 'models.js e_b1b: stations - order_left из stations_game (internal: true остаётся), nozzles - четыре из nozzles_game, nr, dry: false (форсаж), pod: null, clearGlass: true, gearModel: e_b1b_gear при paintOn, bay из паспорта (doors, sides).',
 'Крыло: в файле сложено (67,5°), силуэт в бою как у прежней модели; разворот вперёд - по wing_sweep (пишет главный чат).',
 'META.e_b1b_gear как у e_vulcan_gear (lazy, matte, paint, stations: []). GLB_V для обоих ключей.',
 'cm.js e_b1b: точки ложных целей flares_game вместо прежних.',
 'После подмены: seats-gen.js e_b1b, миниатюра thumbs/air_e_b1b.webp, ktx-models для e_b1b и e_b1b_gear (оба после того, как есть оба glb).',
 'Удалить games/airdef/models/camo/e_b1b.hi.glb и убрать e_b1b из models/hi-list.js (HI_PLANES), иначе на «максимум» останется старая модель.',
 'Длина 44,52 м по хвостовому конусу (прежняя 44,50).']
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(stations=P['stations_game']['order_left'], nozzles=P['nozzles_game'], nr=P['nr'], bay=bay, gear_bottom=P['gear_bottom_game_y']), open(os.path.join(HERE, 'точки.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'сопла', P['nozzles_game'], 'низ колёс', P['gear_bottom_game_y'])
