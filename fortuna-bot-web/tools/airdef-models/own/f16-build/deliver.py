# deliver.py - сдача F-16D: превью, файл для Sketchfab и .blend (со стойками, створки открыты), файл игры (без стоек, створки закрыты), файл шасси для ангара, паспорт и отчёт. После build.py, gbuf.py (4096) и paint.py (F16_OUT=папка модели):
#   F16_DIR="<папка модели>" Blender -b --factory-startup --python build.py --python deliver.py
import json, math, os, sys
HERE = os.environ['F16_DIR']; sys.path.insert(0, HERE); os.environ['F16_MAPS'] = HERE; os.environ['F16_OUT'] = HERE; os.environ['F16_ONLY'] = '__никакой__'; os.environ.setdefault('F16_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
DOORS = (('door_n_r', -88), ('door_n_l', 88), ('door_m_r', -56), ('door_m_l', 56))
for n_, d_ in DOORS: pose(n_, d_)
vl.update(); prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 0.2, 0.3), (0.52, 0.72, 0.30), 21.0), ('превью_2_сбоку.png', (0.0, 0.0, 0.7), (-1.0, 0.0, 0.05), 21.0), ('превью_3_сверху.png', (0.0, 0.0, 0.3), (0.05, -0.05, 1.0), 21.0),
                         ('превью_4_хвост.png', (0.0, -0.8, 0.6), (0.34, -0.78, 0.46), 20.0), ('превью_5_кабина.png', (0.0, 3.4, 0.9), (0.62, 0.62, 0.42), 6.2), ('превью_6_снизу.png', (0.0, 0.2, -0.3), (0.34, 0.24, -0.90), 20.0)):
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
mk.export(os.path.join(HERE, 'f16_sketchfab.glb'), os.path.join(HERE, 'f16.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'f16_sketchfab.glb')) // 1024, 'КБ')
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='f16', weapon='', name='F-16D', name_en='F-16D Fighting Falcon', glb='f16.glb', blend='f16.blend', rev=2,
    build=['build.py', 'f16_geo.py', 'f16_detail.py', 'f16_gear.py', 'uv_f16.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_gaps.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'связность': gaps.get('висит'), 'стыки': {k: v.get('плохо') for k, v in (styk.get('детали') or {}).items() if v.get('плохо')}, 'silhouette_iou': {'бок': 'наложение на фото 06 и 07, снизу на f16_12 (_снимки/лист_1_форма.jpg)'}, 'game': 'игра: ангар и бой, день и вечер, ошибок страницы нет (превью-игра); на телефоне не проверено'},
    sketchfab={'title': 'F-16D Fighting Falcon - Game-Ready Jet', 'lead': 'Two-seat F-16D without conformal tanks, in a two-tone grey scheme. Moving parts on their own pivots: canopy, rudder, stabilators, flaperons, leading edge flaps, split speedbrakes, refuelling door and landing gear. Round-nose control surfaces, recessed panel lines, raised access lids, detailed cockpit, nozzle petals and intake with splitter.',
               'parts': ['airframe', 'fin and rudder', 'stabilators', 'flaperons', 'leading edge flaps', 'speedbrakes', 'canopy', 'cockpit', 'intake', 'nozzle', 'gear', 'pylons'],
               'tags': ['f-16', 'f-16d', 'fighting-falcon', 'fighter', 'jet', 'aircraft', 'military', 'usaf', 'game-ready', 'pbr', 'textured', 'blender'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'f16_sketchfab.glb'},
    notes='Ревизия 2 (2026-11-06): убрана прямая планка через кабину (рельс фонаря и кабины был замкнут кольцом). Форма, краска, знаки, точки подвески не менялись. Прежняя запись: Ревизия 1 (2026-11-06). Свои меши по фото Mark f16_01...12, пиксели фото не использованы. Без конформных баков (слово Mark). Буквы XF и номер AF 16 042 придуманы, эмблем нет. Схема: два серых, знаки США одним серым. Швы - V-канавки, крышки - плиты с фаской, нормали обшивки взяты с гладкой поверхности до резки (smooth_normals). Карты: цвет без света, нормали по высоте, R затенение, G шероховатость, B металл. В файле Sketchfab и .blend створки открыты, в файле игры закрыты.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# файл игры: без стоек, створки закрыты; файл шасси: только стойки и метки центра
for n_, d_ in DOORS: pose(n_, -d_)
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'f16.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'f16.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'f16_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'f16_gear.glb')) // 1024, 'КБ')
# паспорт: всё в осях игры (после центровки prepare.js по габаритам файла игры)
cy = (MN_M[2] + MX_M[2]) / 2; cb = (MN_M[1] + MX_M[1]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-(v.y - cb), 3)]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'f16_gear.glb'; P['gear_key'] = 'f16_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (сдвиг по высоте {round(cy, 4)} м и по длине {round(cb, 4)} м учтён); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы F16_paint (один на всё) и F16_glass (BLEND, clearGlass)'
P['nozzles_game'] = [GG(g.P3(g.NOZ_A1, 0.0, g.NOZ_Y))]; P['nr'] = g.NOZ_R
ST = {k: GG(v) for k, v in g.PYLON_PTS.items()}
P['stations_game'] = dict(note='низ пилонов, ровная площадка. На сторону 4: внешний, средний, внутренний пилон крыла, на борту под воздухозаборником; порядок для mirror() - левая сторона: out, mid, in, stub', order_left=[ST['pylon_out_l'], ST['pylon_mid_l'], ST['pylon_in_l'], ST['stub_l']], **ST)
px, pa, py = g.POD; P['pod_game'] = dict(attach=GG(g.P3(pa, px, py)), center=GG(g.P3(pa, px, py - 0.19)), note='справа под устьем: attach - низ крепления, center - ось контейнера 0,19 м ниже')
P['tip_rail_game'] = dict(r=GG(g.P3(10.3, 4.66, g.WING_Y)), l=GG(g.P3(10.3, -4.66, g.WING_Y)), note='постоянный рельс на конце крыла, без ракеты; точки игре не нужны, для сведения')
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
P['parts'] = parts; P['twin'] = 'один двигатель: ключ не входит в TWIN'
P['gear_note'] = 'f16_gear.glb: стойки и колёса, только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. Створки в файле самолёта закрыты, отдельных открытых нет.'
P['rev2_note'] = 'Те же имена и ключи. При подмене: новый GLB_V у f16 и f16_gear, затем seats-gen.js f16: таблица посадки привязана к версии.'
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(stations=P['stations_game']['order_left'], pod=P['pod_game']['center'], nozzle=P['nozzles_game'][0], nr=P['nr']), open(os.path.join(HERE, 'точки.json'), 'w', encoding='utf-8'))
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'сопло', P['nozzles_game'], 'контейнер', P['pod_game']['center'])
