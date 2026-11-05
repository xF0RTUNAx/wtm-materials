# deliver.py - сдача F-15E: превью, файл для Sketchfab и .blend (со стойками), файл игры (без стоек, створки закрыты), файл шасси для ангара, паспорт и отчёт. После build.py и _collide.py:
#   F15_DIR="<папка модели>" Blender -b --factory-startup --python build.py --python deliver.py
# Карты f15e_color.png, f15e_normal.png, f15e_orm.png лежат в папке модели (paint.py, F15_OUT=папка модели). Развёртка - _проба/uv.npz.
import json, math, os, sys
HERE = os.environ['F15_DIR']; sys.path.insert(0, HERE); os.environ['F15_MAPS'] = HERE; os.environ['F15_OUT'] = HERE; os.environ['F15_ONLY'] = '__никакой__'; os.environ.setdefault('F15_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))     # материалы, небо, камера; снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, 0.0, 0.8), (0.52, 0.72, 0.46), 31.0), ('превью_2_сбоку.png', (0.0, 0.0, 0.8), (-1.0, 0.0, 0.08), 29.0), ('превью_3_сверху.png', (0.0, 0.0, 0.3), (0.05, -0.05, 1.0), 30.0),
                         ('превью_4_хвост.png', (0.0, -1.0, 0.8), (0.34, -0.78, 0.40), 27.0), ('превью_5_кабина.png', (0.0, 4.9, 1.2), (0.62, 0.62, 0.48), 7.5), ('превью_6_снизу.png', (0.0, 0.0, -0.5), (0.42, 0.28, -0.86), 30.0)):
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
try: col = json.load(open(os.path.join(HERE, '_live', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога хода:', e)
mk.export(os.path.join(HERE, 'f15e_sketchfab.glb'), os.path.join(HERE, 'f15e.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'f15e_sketchfab.glb')) // 1024, 'КБ')
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
# отчёт и основа паспорта: пока в сцене все детали
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_f15e', weapon='', name='F-15E', name_en='F-15E Strike Eagle', glb='f15e.glb', blend='f15e.blend', rev=1,
    build=['build.py', 'f15_geo.py', 'f15_detail.py', 'f15_gear.py', 'uv_f15.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'silhouette_iou': {'бок': 'наложение на фото 10; сверху на вид из фото 03, снизу на рендер 08 (_снимки/правка_лист.jpg)'}, 'game': 'игра на ?paint=1: ангар и бой, день и вечер, ошибок страницы нет (_проба/стенд); на телефоне не проверено'},
    sketchfab={'title': 'F-15E Strike Eagle - Game-Ready Jet', 'lead': 'F-15E Strike Eagle two-seat strike fighter in gunship grey. Moving parts on their own pivots: stabilisers, rudders, ailerons, flaps, speedbrake, canopy, inlet noses and landing gear. Detailed cockpit, open nozzles with petals and rods, inlet ramps, conformal tanks with stubs. PBR maps with panel tones, rivets, streaks and soot.',
               'parts': ['airframe', 'fins and rudders', 'stabilisers', 'flaps and ailerons', 'speedbrake', 'canopy', 'cockpit', 'inlets', 'nozzles', 'gear', 'pylons'],
               'tags': ['f-15e', 'strike-eagle', 'f-15', 'fighter', 'jet', 'aircraft', 'military', 'usaf', 'game-ready', 'pbr', 'textured', 'blender'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'f15e_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-05). Свои меши по фото 01-03, 10 и рендерам 04-09 (только форма). Пиксели картинок не использованы. Знак нарисован заново по картинке Mark; LN и 492 FS - по фото 10, номер AF 90 239 придуман, эмблемы части нет. Серая схема - выбор Mark; двухцветный черновик - _проба/две. Карты: цвет без света, нормали по высоте, R затенение, G шероховатость, B металл.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# файл игры: без стоек, створки закрыты; файл шасси: только стойки и метки центра
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); MP = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]; MN_M = [min(p[i] for p in MP) for i in range(3)]; MX_M = [max(p[i] for p in MP) for i in range(3)]
mk.export(os.path.join(HERE, 'f15e.glb'), None); print('игра', os.path.getsize(os.path.join(HERE, 'f15e.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP); top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
vl.update(); mk.export(os.path.join(HERE, 'f15e_gear.glb'), None); print('шасси', os.path.getsize(os.path.join(HERE, 'f15e_gear.glb')) // 1024, 'КБ')
# паспорт: всё в осях игры (после центровки prepare.js, сдвиг по высоте cy)
cy = (MN_M[2] + MX_M[2]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-v.y, 3)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'f15e_gear.glb'; P['gear_key'] = 'e_f15e_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (высота в файле {round(cy, 4)} м вычтена); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы F15_paint (один на всё) и F15_glass (BLEND, clearGlass)'
P['nozzles_game'] = [GG(g.P3(g.NOZ_A, s_ * g.NOZ_X, g.NOZ_Y)) for s_ in (-1, 1)]; P['nr'] = g.NOZ_R
ST = {}
for nm_, pt in g.PYLON_PTS.items(): ST[nm_] = GG(pt)
P['stations_game'] = dict(note='низ пилона и балок, ровная площадка; мирор по X. На сторону 1 крыло + 3 на баке', **ST)
lh = g.down(1.2, g.Yb(8.9), z0=-4.0, dirn=1); P['lantirn_game'] = dict(attach=GG(lh), center=GG(lh - Vector((0, 0, 0.19))), note='под правым воздухозаборником; attach - обшивка, center - ось контейнера 0,19 м ниже')
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
P['parts'] = parts; P['twin'] = 'два сопла; поля TWIN в plane-zones задаёт игра'
P['gear_note'] = 'f15e_gear.glb: стойки и колёса, только для ангара на ?paint=1. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. Створки в файле самолёта закрыты, отдельных открытых нет.'
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'сопла', P['nozzles_game'], 'контейнер', P['lantirn_game']['center'])
