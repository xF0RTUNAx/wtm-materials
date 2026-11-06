# deliver.py - сдача F-22A: превью, файл для Sketchfab и .blend, файл игры (без стоек, створки закрыты), файл шасси для ангара, паспорт и отчёт. После paint.py с F22_TEX=4096 F22_OUT=<папка модели>:
#   F22_DIR="<папка модели>" F22_STAGE=4 F22_CARVE=1 Blender -b --factory-startup --python build.py --python deliver.py
# Карты f22_color.png, f22_normal.png, f22_orm.png лежат в папке модели. Развёртка - _проба/uv.npz (из запекания 4096).
import json, math, os, sys
HERE = os.environ['F22_DIR']; sys.path.insert(0, HERE); os.environ['F22_MAPS'] = HERE; os.environ['F22_OUT'] = HERE; os.environ['F22_ONLY'] = '__никакой__'; os.environ.setdefault('F22_SPP', '96'); os.environ.pop('F22_NOSHOTS', None)
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
# для Sketchfab и превью створки отсеков и шасси открыты, рычаги боковых отсеков выдвинуты; в файле игры и в .blend закрыты
OPEN = [n for n in g.PARTS if n.startswith(('bay_', 'door_m', 'door_n', 'arm_s'))]; saved = {n: bpy.data.objects[n].matrix_world.copy() for n in OPEN}
for n in OPEN:
    r0, r1 = g.PARTS[n]['range']; pose(n, (r1 if abs(r1) > abs(r0) else r0) * 0.97)
vl.update()
K = 2.8; prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, -0.2, 0.5), (0.55, 0.72, 0.32), 27.0), ('превью_2_сбоку.png', (0.0, 0.0, 0.6), (1.0, 0.06, 0.03), 28.0), ('превью_3_сверху.png', (0.0, 0.0, 0.2), (0.0, -0.02, 1.0), 50.0),
                         ('превью_4_хвост.png', (0.0, -1.0, 0.7), (0.38, -0.78, 0.42), 27.0), ('превью_5_кабина.png', (0.2, g.Yb(4.3), 0.9), (0.62, 0.62, 0.42), 8.0), ('превью_6_снизу.png', (0.0, 0.0, -0.5), (0.35, 0.2, -0.92), 28.0)):
    shot(nm, tg, dv, dist * K, 50 * K, wd=1920, h=1080); prev.append(nm)
print('превью', prev)
ms = [o for o in sc.objects if o.type == 'MESH']; vl.update()
for c_ in ('v_cam', 'v_sun'):
    o_ = bpy.data.objects.get(c_)
    if o_ is not None: bpy.data.objects.remove(o_)
vl.update()
mk.export(os.path.join(HERE, 'f22_sketchfab.glb'), None); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'f22_sketchfab.glb')) // 1024, 'КБ')
for n, M_ in saved.items(): bpy.data.objects[n].matrix_world = M_
vl.update()
pts = [o.matrix_world @ v.co for o in ms for v in o.data.vertices]; mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
LEN, SPAN, HGT = round(mx.y - mn.y, 3), round(mx.x - mn.x, 3), round(mx.z - mn.z, 3)
col = {}; joints = {}
try: col = json.load(open(os.path.join(HERE, '_столкновения.json'), encoding='utf-8'))
except Exception as e: print('нет итога хода:', e)
try: joints = json.load(open(os.path.join(HERE, '_стыки', '_стыки.json'), encoding='utf-8'))
except Exception as e: print('нет итога стыков:', e)
TMPG = os.path.join(HERE, '_проба', '_blend_tmp.glb'); mk.export(TMPG, os.path.join(HERE, 'f22.blend')); os.remove(TMPG)
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
LEFT = 'Оставлено осознанно: щель у торцов руля 2 см и ход руля ±11° (ось сильно наклонена, больше - упирается в киль, касание только в самом конце хода); корень стабилизатора 1,8 см (цельноповоротный, меньше - задевает балку); шов створок отсеков 5 мм; рама фонаря касается основания на первых 2° открытия. Ложные срабатывания проверки, просмотрены крупно: основание и верх киля, стабилизатор снизу, сопла и створки сопел (кромки и клин), торец носовой створки справа. На самом крупном плане остались мелкая складка в носу рамы фонаря и тонкая складка по оси хвоста между гондолами.'
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_f22', weapon='', name='F-22A', name_en='F-22A Raptor', glb='f22.glb', blend='f22.blend', rev=1,
    build=['build.py', 'f22_geo.py', 'f22_detail.py', 'f22_gear.py', 'uv_f22.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'joints': joints, 'joints_note': 'Исправлено: ступеньки у закрылков и рулей (круглый нос в круглом вырезе), зазоры сопел под верхним листом, щель у закрытой боковой створки (дно выреза прорезало скос борта), канавка на брюхе между гондолой и средней частью, дыра ниши основной стойки в крыле. ' + LEFT,
            'silhouette_iou': {'бок': 'наложения на фото и план на 04 (_снимки/этап1_лист_*); числового сравнения нет'}, 'game': 'игра: ангар и бой, день и вечер (_проба/стенд_итог); на телефоне не проверено'},
    sketchfab={'title': 'F-22A Raptor - Game-Ready Jet', 'lead': 'F-22A Raptor stealth fighter in grey two-tone with lighter coated edges and low-visibility markings. Three weapon bays with primer interiors and racks, opening doors and side bay rails. Moving parts on their own pivots: rudders, stabilisers, flaperons, flat nozzle flaps, canopy. Detailed cockpit and landing gear. PBR maps with tone patches and soft occlusion.',
               'parts': ['airframe', 'canted fins and rudders', 'all-moving stabilisers', 'flaperons', 'ailerons', 'leading edge flaps', 'weapon bays', 'side bay rails', 'canopy', 'cockpit', 'twin flat nozzles', 'gear', 'refuel door'],
               'tags': ['f-22', 'f-22a', 'raptor', 'stealth', 'fighter', 'jet', 'aircraft', 'military', 'game-ready', 'pbr', 'textured', 'blender'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'f22_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-06). Свои меши по фото 01-25 (только форма и цвет). Пиксели картинок не использованы. Рендеры чужой модели 06, 07, 08, 09, 15, 18 - только как устроены отсеки и шасси. Наружных баков и пилонов нет. Знаки, треугольники и надписи нарисованы заново; буквы XR и номер 09-4172 придуманы, настоящих эмблем и номеров нет. Карты: цвет без света, нормали по высоте, R затенение, G шероховатость, B металл. Сверка цвета на пробе: верх близок к фото 01, тёмные поля немного темнее фото; стекло светлее, чем на фото.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# файл игры: без стоек, створки закрыты; файл шасси: только стойки и метки центра
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'f22.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'f22.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'f22_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'f22_gear.glb')) // 1024, 'КБ')
# паспорт: всё в осях игры (после центровки prepare.js, сдвиг по высоте cy)
cy = (MN_M[2] + MX_M[2]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-v.y, 3)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'f22_gear.glb'; P['gear_key'] = 'e_f22_gear'; P['side'] = 'west'; P['internal'] = True
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (высота в файле {round(cy, 4)} м вычтена); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы F22_paint (один на всё) и F22_glass (BLEND, clearGlass)'
P['nozzles_game'] = [GG(g.P3(g.NOZ_A1, sx_ * g.NOZ_X, -0.01)) for sx_ in (-1, 1)]; P['nr'] = 0.20
import f22_detail as dd
P['stations_game'] = dict(note='4 точки на сторону, значения для x > 0, зеркало по X. Первые три - держатели центрального отсека спереди назад, ровно под низом держателя. Четвёртая - под направляющей рычага бокового отсека в убранном положении (ось arm_s_, ход 58°). Подвеска внутренняя, снаружи не видна. Держатели стоят через 1,2 м в один ряд: длинная JDAM целиком входит в отсек только на среднем, у соседних длинные грузы перекроются, если висят одновременно.',
    right=[GG(g.P3(a_, x_, dd.HOLD_Y - 0.005)) for a_, x_ in dd.HOLD_C] + [GG(g.P3(dd.ARM_A, dd.ARM_P[0], dd.ARM_P[1] - dd.ARM_L - 0.09))])
P['pod'] = None
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
P['parts'] = parts
P['gear_note'] = 'f22_gear.glb: стойки и колёса для ангара, как у F-15E. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. Створки в файле самолёта закрыты, отдельных открытых нет.'
P['swap_notes'] = ['На игровой стороне: clearGlass, gearModel e_f22_gear, META для шасси, новые stations; matte у самолёта убрать. Два сопла: nozzles и nr из этого паспорта, e_f22 уже в списке TWIN в plane-zones.js.',
    'Огонь в jetflame.js (e_f22: flat 1.55, 0.50) рисует жёлтые овалы шире новых плоских сопел: подогнать под nozzles и nr по снимку.',
    'Старые камуфляжи e_f22 рисованы по старой развёртке, к этой модели не подходят.', 'Новый ключ шасси e_f22_gear добавить в r2-sync вместе с моделью.',
    'Створки отсеков: bay_cf_ и bay_ca_ открываются вместе (две половины одной большой створки), bay_s_ - боковой отсек, ось сверху. В файле игры всё закрыто, оси и ходы в parts. Сброс с рычага: сначала bay_s_, потом arm_s_.']
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'сопло', P['nozzles_game'], 'точки', P['stations_game']['right'])
