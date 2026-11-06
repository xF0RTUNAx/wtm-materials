# deliver.py - сдача F/A-18C: превью, файл для Sketchfab и .blend (со стойками, створки открыты), файл игры (без стоек, створки закрыты), файл шасси для ангара, паспорт и отчёт. После build.py, gbuf.py (4096) и paint.py (F18C_OUT=папка модели):
#   F18C_DIR="<папка модели>" Blender -b --factory-startup --python build.py --python deliver.py
import json, math, os, sys
HERE = os.environ['F18C_DIR']; sys.path.insert(0, HERE); os.environ['F18C_MAPS'] = HERE; os.environ['F18C_OUT'] = HERE; os.environ['F18C_ONLY'] = '__никакой__'; os.environ.setdefault('F18C_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
DOORS = (('door_n_r', -80), ('door_n_l', 80), ('door_m_r', 85), ('door_m_l', -85))
for n_, d_ in DOORS: pose(n_, d_)
vl.update(); prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 0.2, 0.3), (0.52, 0.72, 0.30), 21.0), ('превью_2_сбоку.png', (0.0, 0.0, 0.7), (-1.0, 0.0, 0.05), 21.0), ('превью_3_сверху.png', (0.0, 0.0, 0.3), (0.05, -0.05, 1.0), 21.0),
                         ('превью_4_хвост.png', (0.0, -0.8, 0.6), (0.34, -0.78, 0.46), 20.0), ('превью_5_кабина.png', (0.0, 3.5, 1.05), (0.55, 0.62, 0.50), 5.0), ('превью_6_снизу.png', (0.0, 0.2, -0.3), (0.34, 0.24, -0.90), 20.0)):
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
mk.export(os.path.join(HERE, 'f18c_sketchfab.glb'), os.path.join(HERE, 'f18c.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'f18c_sketchfab.glb')) // 1024, 'КБ')
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_f18c', weapon='', name='F/A-18C', name_en='F/A-18C Hornet', glb='f18c.glb', blend='f18c.blend', rev=1,
    build=['build.py', 'f18c_geo.py', 'f18c_detail.py', 'f18c_gear.py', 'uv_f18c.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_gaps.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'связность': gaps.get('висит'), 'стыки': {k: v.get('плохо') for k, v in (styk.get('детали') or {}).items() if v.get('плохо')}, 'silhouette_iou': {'бок': 'наложение на фото 08, снизу на выпрямленное f18c_10 (_снимки/лист_1_форма.jpg)'}, 'game': 'игра: ангар и бой, день и вечер (превью-игра); на телефоне не проверено'},
    sketchfab={'title': 'F/A-18C Hornet - Game-Ready Jet', 'lead': 'Single-seat F/A-18C in a two-tone grey low-visibility scheme. Moving parts on their own pivots: canopy, rudders, stabilators, leading edge slats, flaps, ailerons, folding wing tips, speedbrake, refuelling probe, arrestor hook and landing gear. Recessed panel lines, raised access lids, detailed cockpit, oval intakes with a turning duct and engine fan.',
               'parts': ['airframe', 'fins and rudders', 'stabilators', 'slats', 'flaps', 'ailerons', 'wing fold', 'speedbrake', 'canopy', 'cockpit', 'intakes', 'nozzles', 'gear', 'pylons', 'hook', 'probe'],
               'tags': ['fa-18', 'f-18', 'hornet', 'f-18c', 'fighter', 'jet', 'aircraft', 'military', 'usmc', 'game-ready', 'pbr', 'textured'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'f18c_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-06). Основа - своя F/A-18E, форма C перестроена по фото Mark f18c_01...10, пиксели фото не использованы. Буквы ZK, номер 114, VMFA-188 и эмблема придуманы, не совпадают с E. Схема: два серых, верх чуть темнее, обтекатель светлее, кончик песочный. Швы - V-канавки, крышки - плиты с фаской, нормали обшивки с гладкой поверхности до резки. Карты: цвет без света, нормали по высоте, R затенение, G шероховатость, B металл. В файле Sketchfab и .blend створки открыты, в файле игры закрыты.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# файл игры: без стоек, створки закрыты; файл шасси: только стойки и метки центра
for n_, d_ in DOORS: pose(n_, -d_)
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'f18c.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'f18c.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'f18c_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'f18c_gear.glb')) // 1024, 'КБ')
# паспорт: всё в осях игры (после центровки prepare.js по габаритам файла игры)
cy = (MN_M[2] + MX_M[2]) / 2; cb = (MN_M[1] + MX_M[1]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-(v.y - cb), 3)]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'f18c_gear.glb'; P['gear_key'] = 'e_f18c_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (сдвиг по высоте {round(cy, 4)} м и по длине {round(cb, 4)} м учтён); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы F18C_paint (один на всё) и F18C_glass (BLEND, clearGlass)'
P['nozzles_game'] = [GG(g.P3(g.NOZ_A, s_ * g.NOZ_X, g.NOZ_Y)) for s_ in (-1, 1)]; P['nr'] = g.NOZ_R
ST = {k: GG(v) for k, v in g.PYLON_PTS.items()}
P['stations_game'] = dict(note='низ пилонов, ровная площадка. На сторону 4: два держателя на внешнем пилоне, внутренний пилон, под воздухозаборником; порядок для mirror() - левая сторона: o1, o2, i, c. Наружных баков нет', order_left=[ST['pylon_o1_l'], ST['pylon_o2_l'], ST['pylon_i_l'], ST['pylon_c_l']], **{k: v for k, v in ST.items() if k != 'pod'})
P['pod_game'] = dict(attach=ST['pod'], note='на правом борту под устьем заборника, низ крепления (как f18c_10)')
P['tip_rail_game'] = dict(r=GG(g.P3(10.85, 5.80, g.wy(5.80))), l=GG(g.P3(10.85, -5.80, g.wy(5.80))), note='постоянный рельс на конце крыла, без ракеты; точки игре не нужны, для сведения')
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
P['parts'] = parts; P['twin'] = 'два сопла; поля TWIN в plane-zones задаёт игра'
P['gear_note'] = 'f18c_gear.glb: стойки и колёса, только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. Створки в файле самолёта закрыты, отдельных открытых нет.'
P['swap_note'] = 'После подмены обязательно: seats-gen.js e_f18c (таблица посадки подвески). Рецепт prepare.js у e_f18c сейчас старый (scale, nose +z, чужой источник): заменить на own: true, scale 1, nose -z, tex 2048, nTex 2048, как у e_f15e; нужен и рецепт e_f18c_gear, META с gearModel, clearGlass, новые станции и сопла из этого паспорта.'
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(stations=P['stations_game']['order_left'], pod=P['pod_game']['attach'], nozzles=P['nozzles_game'], nr=P['nr']), open(os.path.join(HERE, 'точки.json'), 'w', encoding='utf-8'))
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'сопла', P['nozzles_game'], 'контейнер', P['pod_game']['attach'])
