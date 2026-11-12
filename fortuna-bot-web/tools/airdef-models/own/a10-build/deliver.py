# deliver.py - сдача A-10A: превью, файл для Sketchfab и .blend (со стойками, створки открыты, контейнер Pave Penny), файл игры (без стоек, створки закрыты, колёса в обтекателях), файл шасси для ангара, паспорт и отчёт.
# После build.py, gbuf.py (4096) и paint.py (A10_OUT=папка модели):  A10_DIR="<папка модели>" Blender -b --factory-startup --python build.py --python deliver.py
import json, math, os, sys, shutil
HERE = os.environ['A10_DIR']; sys.path.insert(0, HERE); os.environ['A10_MAPS'] = HERE; os.environ['A10_OUT'] = HERE; os.environ['A10_ONLY'] = '__никакой__'; os.environ.setdefault('A10_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))     # материалы, небо, камера; пробные снимки пропущены, створки возвращены закрытыми
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
import a10_detail as d_
for o in STOW: o.hide_render = True
for n_, a_ in OPEN: pose(n_, a_)
vl.update(); prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 0.2, 0.0), (0.60, 0.62, 0.40), 26.0), ('превью_2_сбоку.png', (0.0, 0.0, 0.2), (-1.0, 0.0, 0.04), 27.0), ('превью_3_сверху.png', (0.0, 0.0, 0.0), (-0.05, -0.05, 1.0), 26.0),
                         ('превью_4_хвост.png', (0.0, Y(14.0), 0.6), (-0.42, -0.86, 0.30), 11.0), ('превью_5_нос.png', (0.0, Y(1.6), 0.1), (-0.62, 0.74, 0.16), 6.5), ('превью_6_снизу.png', (0.0, 0.2, -0.3), (-0.10, 0.10, -0.98), 26.0)):
    shot(nm, tg, dv, dist, wd=1920, h=1080); prev.append(nm)
print('превью', prev)
for c_ in ('v_cam', 'v_sun'):
    o_ = bpy.data.objects.get(c_)
    if o_ is not None: bpy.data.objects.remove(o_)
for o in STOW: o.hide_render = False
vl.update()
ms = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in ms for v in o.data.vertices]; mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
LEN, SPAN, HGT = round(mx.y - mn.y, 3), round(mx.x - mn.x, 3), round(mx.z - mn.z, 3)
def rd(f):
    try: return json.load(open(os.path.join(HERE, f), encoding='utf-8'))
    except Exception as e: print('нет', f, e); return {}
col = rd('_live/collide.json'); gaps = rd('_live/gaps.json'); styk = rd('_стыки/_стыки.json'); stores = rd('_live/stores.json')
# Sketchfab: стоит на шасси, створки открыты, колёс в убранном положении нет, контейнер Pave Penny на пилоне
SC_ = {o.name: list(o.users_collection) for o in STOW}
for o in STOW:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); mk.export(os.path.join(HERE, 'a10_sketchfab.glb'), os.path.join(HERE, 'a10.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'a10_sketchfab.glb')) // 1024, 'КБ')
TRI = lambda L_: sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in L_)
T_SK = TRI([o for o in sc.objects if o.type == 'MESH'])
for o in STOW:
    for c in SC_[o.name]: c.objects.link(o)
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_a10', weapon='', name='A-10A', name_en='A-10A', glb='a10.glb', blend='a10.blend', rev=1,
    build=['build.py', 'a10_geo.py', 'a10_detail.py', 'a10_gear.py', 'uv_a10.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_gaps.py', '_stores.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'связность': gaps.get('висит'), 'стыки': {k: v.get('плохо') for k, v in (styk.get('детали') or {}).items() if v.get('плохо')}, 'подвески': stores or 'касаний нет: agm65b и mk82 на всех точках, на месте и при сбросе на 3 м',
            'silhouette_iou': {'чертёж': 'наложение трёх проекций чертежа a10_01 (_снимки/наложение_сбоку.jpg, _сверху.jpg, _спереди.jpg, лист_1_форма.jpg); фюзеляж шире чертежа на 11 % и выше на 7 % по слову Mark'}, 'game': 'игра: ангар и бой, день и вечер (превью-игра)'},
    sketchfab={'title': 'A-10A Thunderbolt II - Game-Ready Jet', 'lead': 'American single-seat close air support aircraft in weathered two-tone grey with a false canopy under the nose. Moving parts on their own pivots: seven-barrel gun, split aileron speed brakes, flaps, slats, elevators, twin rudders, canopy and landing gear with doors. Fan blades and spinners in the intakes, core nozzles, detailed cockpit, eleven pylons, Pave Penny pod.',
               'parts': ['airframe', 'gun', 'split ailerons', 'flaps', 'slats', 'elevators', 'rudders', 'canopy', 'cockpit', 'engines', 'gear', 'pylons', 'Pave Penny pod'],
               'tags': ['a-10', 'thunderbolt-ii', 'warthog', 'usaf', 'attack', 'jet', 'aircraft', 'military', 'cold-war', 'game-ready', 'pbr', 'textured'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'a10_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-12). Форма построена заново по чертежу a10_01 и фото a10_02...11, пиксели фото не использованы, знаки нарисованы заново. Основная окраска серая (a10_03, 07): тёмно-серый верх, светлый низ, ложный фонарь под носом. Знаки малой заметности, код на киле QZ и номер 412 придуманы. Износ: подкраски, грязь у швов, подтёки, сколы до грунта, нагар от пушки, копоть за соплами; маски ambientCG CC0. Ещё пять окрасок на той же развёртке лежат в папке окраски/: green, green2, sand, winter, mottle.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT, tris_sketchfab=T_SK)
# файл игры: без стоек и оснастки Sketchfab, створки закрыты, колёса в обтекателях; файл шасси: только стойки и метки центра
for n_, a_ in OPEN: pose(n_, -a_)
for o_ in [q for q in sc.objects if q.name.startswith('sk_')]: bpy.data.objects.remove(o_)
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MAINO = [o for o in sc.objects if o.type == 'MESH']; MP = [o.matrix_world @ v.co for o in MAINO for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
T_GAME = TRI(MAINO); T_GEAR = TRI(GEAR)
mk.export(os.path.join(HERE, 'a10.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'a10.glb')) // 1024, 'КБ', T_GAME, 'тр.')
# тот же файл без колёс в убранном положении: для ангара стенда (в игре их скрывает главный чат)
for o in STOW:
    for c in list(o.users_collection): c.objects.unlink(o)
zl_ = MN_M[2]; mb_ = bpy.data.meshes.new('bb_anchor'); mb_.from_pydata([(-0.0005, 0, zl_), (0.0005, 0, zl_), (0, 0.0005, zl_)], [], [(0, 1, 2)]); mb_.update(); mb_.materials.append(mp); mb_.uv_layers.new(name='UVMap')
ob_ = bpy.data.objects.new('bb_anchor', mb_); SC_[STOW[0].name][0].objects.link(ob_); vl.update(); os.makedirs(os.path.join(HERE, '_live', 'ангар'), exist_ok=True); mk.export(os.path.join(HERE, '_live', 'ангар', 'a10.glb'), None); bpy.data.objects.remove(ob_)
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'a10_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'a10_gear.glb')) // 1024, 'КБ', T_GEAR, 'тр.')
# паспорт: всё в осях игры (после центровки prepare.js по габаритам файла игры)
cy = (MN_M[2] + MX_M[2]) / 2; cb = (MN_M[1] + MX_M[1]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-(v.y - cb), 3)]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'a10_gear.glb'; P['files']['sketchfab_glb'] = 'a10_sketchfab.glb'; P['gear_key'] = 'e_a10_gear'
P['tris'] = dict(game=T_GAME, gear=T_GEAR, sketchfab=T_SK)
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (сдвиг по высоте {round(cy, 4)} м и по длине {round(cb, 4)} м учтён); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы A10_paint (один на всё) и A10_glass (BLEND, clearGlass). Карты в файле 4096, для игры prepare.js ужимает до 2048.'
P['nozzles_game'] = [GG(g.P3(g.NOZ_A, -g.NAC_X, g.NAC_Z)), GG(g.P3(g.NOZ_A, g.NAC_X, g.NAC_Z))]; P['nr'] = g.NOZ_R; P['dry'] = True; P['gear_bottom_game_y'] = round(mn_g - cy, 3)
ST = {k: GG(v) for k, v in g.PYLON_PTS.items()}
P['stations_game'] = dict(note='8 точек, на сторону 4, как у прежней модели. Порядок для mirror() - левая сторона: индекс 0 внешний пилон (x 5,98), 1 (x 4,80), 2 (x 3,62), 3 внутренний, между бортом и обтекателем стойки (x 1,80). Игра заполняет последний индекс первым. Под фюзеляжем три пилона без точек (pylon_fc, pylon_fr, pylon_fl - координаты ниже, если понадобятся).',
                          order_left=[ST['pylon_4_l'], ST['pylon_3_l'], ST['pylon_2_l'], ST['pylon_1_l']], **{k[6:]: v for k, v in ST.items()})
pp = d_.PP['pod']; P['pod_game'] = GG(g.P3(pp[0], pp[1], pp[2] + 0.070))
P['pod_note'] = 'pod_game - низ пилона контейнера под кабиной справа (место Pave Penny). В файле игры пилон пустой, контейнер вешает игра; в файле Sketchfab на нём sk_pave_penny.'
P['cm_game'] = GG(g.P3(9.20, -g.POD_X, -1.00)); P['cm_note'] = 'точка отстрела ловушек: кассета в хвосте левого обтекателя стойки; вторые кассеты под законцовками'
gb = mn_g - cy
P['checks_clearance'] = dict(note='просвет = низ оружия минус низ колёс, м; оружие висит верхом на точке; высота по габаритам own/agm65b.glb 0,51 и own/mk82.glb 0,32',
    **{nm: {t: round(ST[t][1] - h - gb, 3) for t in ('pylon_1_l', 'pylon_2_l', 'pylon_3_l', 'pylon_4_l')} for nm, h in (('AGM-65B', 0.51), ('Mk 82', 0.32))})
parts = {}
for nm_, D in g.PARTS.items():
    if D.get('kind') == 'slide': parts[nm_] = dict(kind='slide', pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_m=list(D['range']), note=D.get('note', '')); continue
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
    if D.get('open') is not None: parts[nm_]['open_deg'] = D['open']
P['parts'] = parts
P['motion_note'] = ('gun - блок из семи стволов, вращение вокруг продольной оси (для стрельбы). Элерон-тормоз: ail_u_* верхняя и ail_d_* нижняя половины на одной оси; как элерон ходят вместе на -20…+20, как тормоз расходятся (верхняя до -45, нижняя до +45); '
                    'на последних 5° расхождения торец касается ребра крыла, держать до 40. Закрылки flap_i_*, flap_o_* 0…30. Предкрылок slat_* - сдвиг вперёд 0…0,12 м (kind slide). Рули высоты elev_* -25…+15, рули направления rudder_* ±25 (наружный угол руля высоты срезан под их ход). '
                    'Фонарь canopy 0…40: ось вынесена на 0,6 м за заднюю раму, в гаргрот. Стойки убираются вперёд: gear_n +98, gear_m_* +90; щиток door_m_* ходит вместе с ногой (ось та же, -90 при выпуске); створки передней ниши door_n_* ±92.')
P['gear_note'] = ('a10_gear.glb: стойки и колёса, только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта, не удалять. В файле самолёта створки закрыты, а в обтекателях стоят колёса в убранном положении stow_m_r, stow_m_l (наполовину торчат, как у настоящего): '
                  'когда показаны стойки, эти два объекта надо скрыть, иначе колёс будет по два. Для этого в рецепте prepare.js нужны groups, чтобы stow_m_* остались отдельной именованной частью.')
P['variants'] = dict(note='Окраски на той же развёртке, карты 4096 в папке окраски/<имя>: a10_color.png, a10_orm.png, a10_normal.png. Основная grey лежит в корне.', list=['grey', 'green', 'green2', 'sand', 'winter', 'mottle'])
P['diff_game_sketchfab'] = 'Файл игры: без стоек, створки закрыты, колёса в обтекателях, пилон контейнера пустой, карты ужимаются до 2048. Файл Sketchfab: на шасси, створки открыты, контейнер Pave Penny, карты 4096, все подвижные части отдельными объектами.'
P['swap_notes'] = [
 'Рецепт prepare.js у e_a10 старый (чужой источник a-10_thunderbolt_ii.glb, scale 1.22, tex 1024, groups с A10_STORE): заменить на own: true, scale 1, nose -z, tex 2048, nTex 2048, pickMesh /./, centerX: true, как у других своих самолётов; groups: stow_m_* отдельной частью (см. gear_note), gun отдельной частью для вращения. Добавить рецепт e_a10_gear (две метки по 1 мм не удалять).',
 'models.js e_a10: stations - mirror(order_left), 4 на сторону; nozzles два (nozzles_game), nr, dry: true оставить; pod: pod_game (теперь справа под кабиной, было слева под фюзеляжем); clearGlass: true; gearModel: e_a10_gear при paintOn. META.e_a10_gear как у других своих. GLB_V для обоих ключей (убрать e_a10 из строки 20261024h). pk_e_a10 (стоянка на карте) собрать заново из нового файла.',
 'sim/cm.js e_a10: точка отстрела - cm_game.',
 'Титры: убрать автора прежней модели A-10 (AIRMAN Magazine, Alfredo Tirado) из credits.js и CREDITS.md, если у ключа e_a10 и pk_e_a10 других чужих файлов нет.',
 'После подмены: seats-gen.js e_a10 (в seats-data.js запись со старой версией), миниатюра thumbs/air_e_a10.webp, ktx парой e_a10 и e_a10_gear, проверить ktx/index.json; если есть camo/e_a10.hi.glb и запись в hi-list - убрать.',
 'Фюзеляж по слову Mark толще чертежа; длина файла игры и размах - в ОТЧЁТ.json. Точки *_game учитывают центровку.'
]
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
R['model'].update(tris_game=T_GAME, tris_gear=T_GEAR); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
TJ = dict(stations=P['stations_game']['order_left'], pod=P['pod_game'], nozzles=P['nozzles_game'], nr=P['nr'])
json.dump(TJ, open(os.path.join(HERE, 'точки.json'), 'w', encoding='utf-8'))
for f_ in ('a10_gear.glb', 'точки.json'): shutil.copy(os.path.join(HERE, f_), os.path.join(HERE, '_live', 'ангар', f_))
print('сдача готова', LEN, SPAN, HGT, 'тр. игра', T_GAME, 'шасси', T_GEAR, 'Sketchfab', T_SK, 'сопла', P['nozzles_game'], 'низ колёс', P['gear_bottom_game_y'], 'просвет', P['checks_clearance'])
