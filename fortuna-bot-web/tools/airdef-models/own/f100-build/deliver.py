# deliver.py - сдача F-100D: превью, файл для Sketchfab и .blend (со стойками, створки открыты), файл игры (без стоек, створки закрыты), файл шасси для ангара, паспорт и отчёт. После build.py, gbuf.py (4096) и paint.py (F100_OUT=папка модели):
#   F100_DIR="<папка модели>" Blender -b --factory-startup --python build.py --python deliver.py
import json, math, os, sys
HERE = os.environ['F100_DIR']; sys.path.insert(0, HERE); os.environ['F100_MAPS'] = HERE; os.environ['F100_OUT'] = HERE; os.environ['F100_ONLY'] = '__никакой__'; os.environ.setdefault('F100_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
DOORS = (('door_n_r', -92), ('door_n_l', 92), ('door_o_r', -80), ('door_o_l', 80), ('door_m_r', 88), ('door_m_l', -88))
for n_, d_ in DOORS: pose(n_, d_)
vl.update(); prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 0.2, 0.2), (0.60, 0.62, 0.48), 22.0), ('превью_2_сбоку.png', (0.0, 0.0, 0.4), (1.0, 0.0, 0.05), 23.0), ('превью_3_сверху.png', (0.0, 0.0, 0.0), (-0.05, -0.05, 1.0), 21.0),
                         ('превью_4_хвост.png', (0.0, -4.6, 0.9), (0.72, -0.60, 0.36), 9.5), ('превью_5_кабина.png', (0.0, 3.4, 0.8), (0.55, 0.62, 0.50), 4.8), ('превью_6_снизу.png', (0.0, 0.2, -0.3), (-0.10, 0.10, -0.98), 20.0)):
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
mk.export(os.path.join(HERE, 'f100_sketchfab.glb'), os.path.join(HERE, 'f100.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'f100_sketchfab.glb')) // 1024, 'КБ')
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_f100', weapon='', name='F-100D', name_en='F-100D', glb='f100.glb', blend='f100.blend', rev=1,
    build=['build.py', 'f100_geo.py', 'f100_detail.py', 'f100_gear.py', 'uv_f100.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_gaps.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'связность': gaps.get('висит'), 'стыки': {k: v.get('плохо') for k, v in (styk.get('детали') or {}).items() if v.get('плохо')}, 'silhouette_iou': {'бок': 'наложение на фото f100_04 (_снимки/наложение_04.jpg, контур_04.jpg, лист_1_форма.jpg); вида строго сверху на фото нет, план по фото 04 и 06 и размаху прежней модели 11,55'}, 'game': 'игра: ангар и бой, день и вечер (превью-игра)'},
    sketchfab={'title': 'F-100D Super Sabre - Game-Ready Jet', 'lead': 'American single-seat fighter-bomber of the 1950s in natural metal finish with heat-stained rear fuselage. Moving parts on their own pivots: clamshell canopy, rudder, all-moving tailplane, flaps, ailerons, leading-edge slats, ventral airbrake and landing gear with doors. Oval nose intake, long pitot boom, refuelling probe, four gun ports, petal nozzle, detailed cockpit.',
               'parts': ['airframe', 'fin and rudder', 'tailplane', 'flaps', 'ailerons', 'slats', 'airbrake', 'canopy', 'cockpit', 'intake', 'guns', 'nozzle', 'gear', 'pylons'],
               'tags': ['f-100', 'super-sabre', 'usaf', 'fighter', 'jet', 'aircraft', 'military', 'cold-war', 'natural-metal', 'game-ready', 'pbr', 'textured'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'f100_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-10). Форма построена заново по фото f100_01...07, пиксели фото не использованы, знаки нарисованы заново. Неокрашенный металл по f100_04: листы разного тона, хвост тёмный от жара, противобликовая полоса перед козырьком. Знаки: звезда с полосами на бортах и консолях, U.S. AIR FORCE, USAF, номера FW-907 и 59907 придуманы, полоса на киле своя. Штанга дозаправки с изломом, как на f100_04; перегородка на крыле по f100_03.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# файл игры: без стоек, створки закрыты; файл шасси: только стойки и метки центра
for n_, d_ in DOORS: pose(n_, -d_)
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'f100.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'f100.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'f100_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'f100_gear.glb')) // 1024, 'КБ')
# паспорт: всё в осях игры (после центровки prepare.js по габаритам файла игры)
cy = (MN_M[2] + MX_M[2]) / 2; cb = (MN_M[1] + MX_M[1]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-(v.y - cb), 3)]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'f100_gear.glb'; P['files']['sketchfab_glb'] = 'f100_sketchfab.glb'; P['gear_key'] = 'e_f100_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (сдвиг по высоте {round(cy, 4)} м и по длине {round(cb, 4)} м учтён); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы F100_paint (один на всё) и F100_glass (BLEND, clearGlass)'
P['nozzles_game'] = [GG(g.P3(g.NOZ_A, 0.0, g.NOZ_Y))]; P['nr'] = g.NOZ_R; P['gear_bottom_game_y'] = round(mn_g - cy, 3)
ST = {k: GG(v) for k, v in g.PYLON_PTS.items()}
P['stations_game'] = dict(note='6 точек, на сторону 3. Порядок для mirror() - левая сторона: индекс 0 внешний пилон (o, x 3,85), 1 средний (m, x 2,70), 2 внутренний (i, x 1,40, вынесен вперёд, перед нишей основной стойки). Игра вешает самое тяжёлое на последний индекс. Под фюзеляжем точек нет: там тормозной щиток. Баков нет.', order_left=[ST['pylon_o_l'], ST['pylon_m_l'], ST['pylon_i_l']], **{k[6:]: v for k, v in ST.items()})
P['pod_game'] = None
P['cm_game'] = GG(g.P3(11.60, 0.0, g.fore_bot(11.60, 0.0) - 0.02))
gb = mn_g - cy
P['checks_clearance'] = dict(note='просвет = низ оружия минус низ колёс, м; оружие висит верхом на точке, высота по габариту own/mk82.glb 0,321 и Shrike 0,45 (с оперением, оценка)',
    **{nm: {k: round(ST[t][1] - h - gb, 3) for k, t in (('i внутренний пилон (индекс 2)', 'pylon_i_l'), ('m средний (индекс 1)', 'pylon_m_l'), ('o внешний (индекс 0)', 'pylon_o_l'))} for nm, h in (('Mk 82', 0.321), ('Shrike', 0.45))})
parts = {}
for nm_, D in g.PARTS.items():
    if D.get('kind') == 'slide': parts[nm_] = dict(kind='slide', pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_m=list(D['range']), note=D.get('note', '')); continue
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
P['parts'] = parts
P['motion_note'] = 'Фонарь откидывается вверх на задней петле (canopy, 0…42°). Стабилизатор цельноповоротный (stab_*, -20…+8°). Предкрылки slat_i_*, slat_o_* - сдвиг (kind slide, 0…0,15 м вперёд-вниз). Щиток ноги door_o_* вращается вокруг оси gear_m_*. Ограничения: закрылок flap_* свободно ходит до 12°, дальше торец задевает ребро крыла (ось стреловидная, торцы по потоку); элерон ail_* касается ребра у крайних углов. Стабилизатор и фонарь в нулевом положении прилегают к обшивке (ось в наплыве, рама на пороге).'
P['gear_note'] = 'f100_gear.glb: стойки и колёса, только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта, не удалять. Створки в файле самолёта закрыты.'
P['swap_notes'] = [
 'Рецепт prepare.js у e_f100 старый (чужой источник f100.glb manilov.ap, tex 512, groups): заменить на own: true, scale 1, nose -z, tex 2048, nTex 2048, pickMesh /./, centerX: true, как у e_mirage_f1; добавить рецепт e_f100_gear (две метки по 1 мм не удалять).',
 'models.js e_f100: stations - три на сторону, order_left в этом порядке (четвёртую точку под фюзеляжем убрать, там тормозной щиток; старые V с четвёртым аргументом убрать), nozzles один, nr, pod: null, clearGlass: true, gearModel: e_f100_gear при paintOn; форсаж есть, dry не ставить. META.e_f100_gear как у e_mirage_f1_gear. GLB_V для обоих ключей (убрать e_f100 из общей строки 20261022i).',
 'sim/cm.js e_f100: точка отстрела диполей - cm_game.',
 'Переименование: «F-100F» в «F-100D» (arsenal.js PLANES и название подвески «F-100F «Дикая ласка»…», sim/flight.js name), sync-shared при деплое.',
 'Титры: убрать manilov.ap «F100» (credits.js, CREDITS.md), если у ключа e_f100 других файлов нет.',
 'После подмены: seats-gen.js e_f100, миниатюра thumbs/air_e_f100.webp, ktx парой e_f100 и e_f100_gear, проверить ktx/index.json; если есть camo/e_f100.hi.glb и запись в hi-list - убрать.',
 'Длина файла 15,9 м вместе со штангой ПВД (2 м впереди кромки заборника): центр файла смещён вперёд, все точки *_game это учитывают.'
]
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(stations=P['stations_game']['order_left'], pod=None, nozzle=P['nozzles_game'][0], nr=P['nr']), open(os.path.join(HERE, 'точки.json'), 'w', encoding='utf-8'))
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'сопло', P['nozzles_game'], 'низ колёс', P['gear_bottom_game_y'], 'просвет', P['checks_clearance'])
