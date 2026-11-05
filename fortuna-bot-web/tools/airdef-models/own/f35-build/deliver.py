# deliver.py - сдача F-35A: превью, файл для Sketchfab и .blend, файл игры (без стоек, створки закрыты), файл шасси для ангара, паспорт и отчёт. После paint.py с F35_TEX=4096 F35_OUT=<папка модели>:
#   F35_DIR="<папка модели>" F35_STAGE=4 F35_CARVE=1 Blender -b --factory-startup --python build.py --python deliver.py
# Карты f35_color.png, f35_normal.png, f35_orm.png лежат в папке модели. Развёртка - _проба/uv.npz (из запекания 4096).
import json, math, os, sys
HERE = os.environ['F35_DIR']; sys.path.insert(0, HERE); os.environ['F35_MAPS'] = HERE; os.environ['F35_OUT'] = HERE; os.environ['F35_ONLY'] = '__никакой__'; os.environ.setdefault('F35_SPP', '96'); os.environ.pop('F35_NOSHOTS', None)
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
# для Sketchfab и превью створки отсеков и шасси открыты; в файле игры и в .blend закрыты
OPEN = [n for n in g.PARTS if n.startswith(('bay_', 'door_m', 'door_n'))]; saved = {n: bpy.data.objects[n].matrix_world.copy() for n in OPEN}
for n in OPEN:
    r0, r1 = g.PARTS[n]['range']; pose(n, (r1 if abs(r1) > abs(r0) else r0) * 0.97)
vl.update()
K = 2.8; prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, -0.2, 0.0), (0.55, 0.72, 0.32), 21.0), ('превью_2_сбоку.png', (0.0, 0.0, 0.0), (1.0, 0.06, 0.03), 20.0), ('превью_3_сверху.png', (0.0, 0.0, 0.2), (0.05, -0.05, 1.0), 33.0),
                         ('превью_4_хвост.png', (0.0, -1.0, 0.3), (0.38, -0.78, 0.42), 21.0), ('превью_5_кабина.png', (0.2, g.Yb(3.2), 0.7), (0.62, 0.62, 0.42), 6.5), ('превью_6_снизу.png', (0.0, 0.0, -0.5), (0.35, 0.2, -0.92), 21.0)):
    shot(nm, tg, dv, dist * K, 50 * K, wd=1920, h=1080); prev.append(nm)
print('превью', prev)
ms = [o for o in sc.objects if o.type == 'MESH']; vl.update()
for c_ in ('v_cam', 'v_sun'):
    o_ = bpy.data.objects.get(c_)
    if o_ is not None: bpy.data.objects.remove(o_)
vl.update()
mk.export(os.path.join(HERE, 'f35_sketchfab.glb'), None); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'f35_sketchfab.glb')) // 1024, 'КБ')
for n, M_ in saved.items(): bpy.data.objects[n].matrix_world = M_
vl.update()
pts = [o.matrix_world @ v.co for o in ms for v in o.data.vertices]; mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
LEN, SPAN, HGT = round(mx.y - mn.y, 3), round(mx.x - mn.x, 3), round(mx.z - mn.z, 3)
col = {}; joints = {}
try: col = json.load(open(os.path.join(HERE, '_столкновения.json'), encoding='utf-8'))
except Exception as e: print('нет итога хода:', e)
try: joints = json.load(open(os.path.join(HERE, '_стыки', '_стыки.json'), encoding='utf-8'))
except Exception as e: print('нет итога стыков:', e)
TMPG = os.path.join(HERE, '_проба', '_blend_tmp.glb'); mk.export(TMPG, os.path.join(HERE, 'f35.blend')); os.remove(TMPG)
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
LEFT = 'Оставлено осознанно: щель у торцов руля 1,3 см (меньше - руль упирается в киль при ходе из-за наклонной оси); корень стабилизатора 1,8 см (цельноповоротный, меньше - задевает балку); малые створки носовой стойки 3,2 см; рама фонаря касается основания на первых 5° открытия. Ложные срабатывания проверки: основание киля, сопло, наклонные кромки.'
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_f35', weapon='', name='F-35A', name_en='F-35A Lightning II', glb='f35.glb', blend='f35.blend', rev=1,
    build=['build.py', 'f35_geo.py', 'f35_detail.py', 'f35_gear.py', 'uv_f35.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'joints': joints, 'joints_note': 'Исправлено: ступенька у закрылков и рулей (круглый нос в круглом вырезе), разрыв рамы фонаря сзади, стенка порога над корпусом, запас в нишах створок, дыры у концов носков. ' + LEFT,
            'silhouette_iou': {'бок': 'наложения на фото 12, 15, 16, план на 05 и 10 (_снимки)'}, 'game': 'игра: ангар и бой, день и вечер, ошибок страницы нет (_проба/стенд); на телефоне не проверено'},
    sketchfab={'title': 'F-35A Lightning II - Game-Ready Jet', 'lead': 'F-35A Lightning II stealth fighter in dark grey with lighter seam coating and low-visibility markings. Weapon bays with ribs and sand primer, moving parts on their own pivots. Detailed cockpit, serrated nozzle, tinted canopy. PBR maps with tone patches and soft occlusion.',
               'parts': ['airframe', 'fins and rudders', 'all-moving stabilisers', 'flaperons', 'leading edge flaps', 'weapon bays', 'canopy', 'cockpit', 'nozzle', 'gear', 'refuel door'],
               'tags': ['f-35', 'f-35a', 'lightning-ii', 'stealth', 'fighter', 'jet', 'aircraft', 'military', 'game-ready', 'pbr', 'textured', 'blender'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'f35_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-05). Свои меши по фото 01-16 (только форма и цвет). Пиксели картинок не использованы. Знаки, треугольники и надписи нарисованы заново; буквы QF и номер AF 14-5072 придуманы, имён и логотипов нет. Карты: цвет без света, нормали по высоте, R затенение, G шероховатость, B металл. Сверка цвета по среднему: день борт 84 при фото 95-108, крыло 113 при 105.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# файл игры: без стоек, створки закрыты; файл шасси: только стойки и метки центра
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'f35.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'f35.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'f35_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'f35_gear.glb')) // 1024, 'КБ')
# паспорт: всё в осях игры (после центровки prepare.js, сдвиг по высоте cy)
cy = (MN_M[2] + MX_M[2]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-v.y, 3)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'f35_gear.glb'; P['gear_key'] = 'e_f35_gear'; P['side'] = 'west'; P['internal'] = True
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (высота в файле {round(cy, 4)} м вычтена); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы F35_paint (один на всё) и F35_glass (BLEND, clearGlass)'
P['nozzles_game'] = [GG(g.P3(g.NOZ_A1, 0.0, g.NOZ_Y))]; P['nr'] = g.NOZ_R1
P['stations_game'] = dict(note='4 точки на сторону внутри отсеков, спереди назад, ровно под верхом ниши; значения для x > 0, зеркало по X. Подвеска внутренняя, снаружи не видна.', right=[GG(g.P3(a_, x_, -0.45)) for a_, x_ in ((7.0, 0.90), (8.1, 0.90), (9.2, 0.75), (10.2, 1.05))])
P['pod'] = None
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
P['parts'] = parts
P['gear_note'] = 'f35_gear.glb: стойки и колёса для ангара, как у F-15E. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. Створки в файле самолёта закрыты, отдельных открытых нет.'
P['swap_notes'] = ['На игровой стороне: clearGlass, gearModel e_f35_gear, META для шасси, новые nozzles и nr, новые stations; matte у самолёта убрать.', 'Сопло одно, а в plane-zones.js e_f35 стоит в списке TWIN: проверить.', 'Камуфляж e_f35:sakura рисован по старой развёртке, к этой модели не подходит (по заданию сейчас не нужен).', 'Новый ключ шасси e_f35_gear добавить в r2-sync вместе с моделью.']
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'сопло', P['nozzles_game'], 'точки', P['stations_game']['right'])
