# deliver.py - сдача F-117A: превью, файл для Sketchfab и .blend (со стойками), файл игры (без стоек, створки закрыты), файл шасси для ангара, паспорт и отчёт. После build.py:
#   F117_DIR="<папка модели>" F117_STAGE=4 F117_TEX=4096 Blender -b --factory-startup --python build.py --python deliver.py
# Карты f117_color.png, f117_normal.png, f117_orm.png лежат в папке модели (paint.py, F117_OUT=папка модели). Развёртка - _проба/uv.npz.
import json, math, os, sys
HERE = os.environ['F117_DIR']; sys.path.insert(0, HERE); os.environ['F117_MAPS'] = HERE; os.environ['F117_OUT'] = HERE; os.environ['F117_ONLY'] = '__никакой__'; os.environ.setdefault('F117_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 1.0, 0.3), (0.52, 0.72, 0.46), 29.0), ('превью_2_сбоку.png', (0.0, 0.2, 0.3), (-1.0, 0.0, 0.08), 26.0), ('превью_3_сверху.png', (0.0, 0.2, 0.3), (0.05, -0.05, 1.0), 27.0),
                         ('превью_4_хвост.png', (0.0, -1.5, 0.6), (0.34, -0.78, 0.40), 25.0), ('превью_5_кабина.png', (0.0, 5.0, 1.0), (0.62, 0.62, 0.48), 7.5), ('превью_6_снизу.png', (0.0, 0.2, -0.4), (0.42, 0.28, -0.86), 26.0)):
    shot(nm, tg, dv, dist, wd=1920, h=1080); prev.append(nm)
print('превью', prev)
ms = [o for o in sc.objects if o.type == 'MESH']; vl.update()
pts = [o.matrix_world @ v.co for o in ms for v in o.data.vertices]; mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
LEN, SPAN, HGT = round(mx.y - mn.y, 3), round(mx.x - mn.x, 3), round(mx.z - mn.z, 3)
for c_ in ('v_cam', 'v_sun'):
    o_ = bpy.data.objects.get(c_)
    if o_ is not None: bpy.data.objects.remove(o_)
vl.update()
col = {}
try: col = json.load(open(os.path.join(HERE, '_снимки', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога хода:', e)
sty = {}
try:
    D_ = json.load(open(os.path.join(HERE, '_стыки', '_стыки.json'), encoding='utf-8'))['детали']; sty = {k: v['плохо'] for k, v in D_.items() if v.get('плохо')}
except Exception as e: print('нет итога стыков:', e)
mk.export(os.path.join(HERE, 'f117_sketchfab.glb'), os.path.join(HERE, 'f117.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'f117_sketchfab.glb')) // 1024, 'КБ')
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
# отчёт и основа паспорта: пока в сцене все детали
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_f117', weapon='', name='F-117A', name_en='F-117A Nighthawk', glb='f117.glb', blend='f117.blend', rev=1,
    build=['build.py', 'f117_geo.py', 'f117_detail.py', 'f117_gear.py', 'uv_f117.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'стыки': dict(плохо=sty, разбор='фонарь: инструмент считает щелью окна и край кабины, на крупном плане щели у рамы нет; щели элевонов закрыты тёмными перегородками'), 'silhouette_iou': {'спереди': 'наложение на f117_07 (_снимки/наложение_07.jpg), план снят с f117_08'}, 'game': 'игра: ангар и бой, день и вечер, ошибок страницы нет (_проба/стенд); створки отсека в игре и телефон не проверены'},
    sketchfab={'title': 'F-117A Nighthawk - Game-Ready Jet', 'lead': 'F-117A Nighthawk faceted stealth attack aircraft in black. Hard flat facets with mesh-covered intakes and a flat exhaust slot with vanes. Moving parts on their own pivots: V-tail, four elevons, canopy, weapons bay doors, refuelling door, retractable antenna and landing gear. Real weapons bay with ribs and racks, detailed cockpit, sawtooth door edges.',
               'parts': ['airframe', 'V-tail', 'elevons', 'canopy', 'cockpit', 'intake grilles', 'exhaust slots', 'weapons bay', 'bay doors', 'gear', 'gear doors'],
               'tags': ['f-117', 'nighthawk', 'stealth', 'attack', 'jet', 'aircraft', 'military', 'usaf', 'game-ready', 'pbr', 'textured', 'blender'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'f117_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-06). Свои меши по фото f117_01, 02, 06-13, 15, 16 (форма); f117_03, 04, 05 только планка качества; f117_14 только вид щели; f117_10 только форма. Пиксели картинок не использованы. Знаки нарисованы заново; AX и 870 придуманные, эмблем нет. Карты: цвет без света, нормали по высоте, R затенение, G шероховатость, B металл.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# файл игры: без стоек, створки закрыты; файл шасси: только стойки и метки центра
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'f117.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'f117.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'f117_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'f117_gear.glb')) // 1024, 'КБ')
# паспорт: всё в осях игры (после центровки prepare.js, сдвиг по высоте cy)
cy = (MN_M[2] + MX_M[2]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-v.y, 3)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'f117_gear.glb'; P['gear_key'] = 'e_f117_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (высота в файле {round(cy, 4)} м вычтена); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы F117_paint (один на всё) и F117_glass (BLEND, clearGlass)'
P['nozzles_game'] = []; P['nr'] = 0.12
p_ = g.Vector(g.V['S3']); q_ = g.Vector(g.V['LC']); S_ = g.SLOT; sl = lambda u, sx: GG(g.P3(p_.x + (q_.x - p_.x) * u, sx * (p_.y + (q_.y - p_.y) * u), (S_['z0'] + S_['z1']) / 2))
P['slot_game'] = dict(r=[sl(S_['u0'], 1), sl(S_['u1'], 1)], l=[sl(S_['u0'], -1), sl(S_['u1'], -1)], h=round(S_['z1'] - S_['z0'], 3), note='щель сопла: концы щели на правой и левой стороне, высота; настоящие сопла не видны снаружи, поэтому nozzles_game пуст')
if not g.STATIONS: g.stations_fill()
ST = {nm_: GG(pt) for nm_, pt in g.STATIONS.items()}
P['stations_game'] = dict(note='8 точек внутри отсека, по 4 на сторону, порядок st0...st3: st0 - основная, ровно под замками балки', **ST)
DG = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
P['bay_game'] = dict(doors={n_: [GG(g.PARTS[n_]['pivot']), DG(g.PARTS[n_]['axis']), 95] for n_ in ('bay_l', 'bay_r')}, sides=dict(L=['bay_l'], R=['bay_r']), note='формат поля bay у e_f35: [ось в осях игры, направление, угол]; створки в файле отдельными объектами bay_l и bay_r, в prepare нужны groups')
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
P['parts'] = parts; P['twin'] = 'две щели; пламени нет, поля TWIN в plane-zones задаёт игра'
P['gear_note'] = 'f117_gear.glb: стойки и колёса, только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. Створки в файле самолёта закрыты, отдельных открытых нет.'
P['swap_note'] = 'После подмены обязательно: seats-gen.js e_f117. У прежней записи META было bright: 1.3: на стенде оно убрано, кадры сняты без него. Ангар берёт отдельный файл camo/e_f117.hi.glb: его тоже надо заменить, иначе в ангаре останется старая модель.'
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'щель', P['slot_game']['r'], 'отсек', P['bay_game']['doors']['bay_r'])
