# deliver.py - сдача B-2A: превью, файл для Sketchfab и .blend (стойки выпущены, створки шасси открыты), файл игры (без стоек, все створки закрыты),
# файл шасси для ангара, точки.json, паспорт и отчёт. После build.py в той же сессии:
#   B2_STAGE=4 B2_TEX=4096 Blender -b --factory-startup --python build.py --python deliver.py
# Карты b2_color.png, b2_normal.png, b2_orm.png лежат в папке модели (paint.py с B2_OUT=папка модели). Развёртка - _проба/uv.npz.
import json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/B-2A'
sys.path.insert(0, HERE)
os.environ['B2_MAPS'] = HERE; os.environ['B2_OUT'] = HERE; os.environ['B2_ONLY'] = '__никакой__'; os.environ.setdefault('B2_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))      # материалы, небо, камера; пробные снимки пропущены (B2_ONLY)
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'


def pose_all(sign):
    for n_, d_ in (('door_n', 95), ('door_mi_r', 95), ('door_mi_l', 95), ('door_mo_r', 92), ('door_mo_l', 92)):
        o = bpy.data.objects[n_]; D = g.PARTS[n_]; T = D['pivot']
        o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(sign * d_), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world
    vl.update()


# стойки выпущены - створки шасси открыты (для превью, Sketchfab и .blend)
pose_all(1)
prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', P_(8.0, 0, 0.3), (-0.45, 0.62, 0.62), 55.0), ('превью_2_спереди.png', P_(8.0, 0, -0.6), (0.0, 1.0, 0.30), 70.0),
                         ('превью_3_сверху.png', P_(10.5, 0, 0), (0.05, -0.05, 1.0), 62.0), ('превью_4_сзади.png', P_(14.0, 0, 0.5), (0.30, -0.82, 0.48), 46.0),
                         ('превью_5_кабина.png', P_(4.5, 1.8, 1.1), (0.45, 0.70, 0.55), 11.0), ('превью_6_снизу.png', P_(9.5, 0, -0.8), (0.30, 0.35, -0.88), 44.0)):
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
COLD = {k: dict(касаний=v['касаний'], глубина_мм=v.get('глубина_мм')) for k, v in col.items()}
sty = {}
try:
    D_ = json.load(open(os.path.join(HERE, '_стыки', '_стыки.json'), encoding='utf-8'))['детали']; sty = {k: v['плохо'] for k, v in D_.items() if v.get('плохо')}
except Exception as e: print('нет итога стыков:', e)
mk.export(os.path.join(HERE, 'b2_sketchfab.glb'), os.path.join(HERE, 'b2.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'b2_sketchfab.glb')) // 1024, 'КБ')
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_b2', weapon='', name='B-2A', name_en='B-2A Spirit', glb='b2.glb', blend='b2.blend', rev=1,
    build=['build.py', 'b2_geo.py', 'b2_geo_plan.py', 'b2_gear.py', 'uv_b2.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_bomb.py', '_стенд.js', 'deliver.py'], previews_=prev,
    checks={'ход': COLD, 'стыки': dict(плохо=sty, итог='21 деталь, щелей 0 (допуск 2,5 см)'),
            'ход_разбор': 'Касания со срезом обшивки внутри: нос «бобрового хвоста» и внутренних элевонов заходит в стенку выемки до 1,3-2,9 см на крайних углах (ось прямая, а центры носа по размаху на разной высоте); половины расщепляющегося руля заходят друг в друга носами внутри выемки; концы створок отсеков у пилы и створки ниш до 1,5-2,9 см в стенку проёма у петли. Снаружи не видно. Уборка стоек в ниши не проверялась как рабочая: ниши короче стоек (в игре шасси только выпущено, файл ангара).',
            'бомба': 'GBU-57 ×2: при закрытых створках помещается (касается только замков и упоров балки), при открытых на 95° падает свободно'},
    sketchfab={'title': 'B-2A Spirit - Game-Ready Stealth Bomber', 'lead': 'B-2A Spirit flying-wing stealth bomber in dark grey. Blended wing body with toothed engine intakes, exhaust troughs above the wing and a sawtooth trailing edge. Moving parts on their own pivots: split rudders, elevons, beaver tail, two weapons bays with four doors, landing gear and gear doors.',
               'parts': ['flying-wing airframe', 'toothed intakes', 'exhaust troughs', 'cockpit and windows', 'split rudders', 'elevons', 'beaver tail', 'weapons bays with bomb racks', 'bay doors', 'gear', 'gear doors'],
               'tags': ['b-2', 'spirit', 'stealth', 'bomber', 'flying-wing', 'aircraft', 'military', 'usaf', 'game-ready', 'pbr', 'textured', 'blender'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'b2_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-10). Свои меши по фото b2_01-b2_14 (форма и цвет); пиксели фото в текстуры не переносились, знаки, номер и надписи нарисованы заново (номер AF 95 0417 придуман). Mark: зубчатые губы заборников, конец двигателей не золотистый, горб заборника ×0,7.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# створки шасси закрыть обратно - дальше файл игры и файл шасси (хвост _trial.py)
pose_all(-1)
os.environ['B2_OUT'] = HERE; OUT = HERE
exec(compile(src[src.index('# файл для игры: шасси нет'):], '_trial_tail', 'exec'))
# паспорт: всё в осях игры (после центровки prepare.js, сдвиг по высоте cy)
cy = (MN_M[2] + MX_M[2]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-v.y, 3)]
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'b2_gear.glb'; P['files']['sketchfab_glb'] = 'b2_sketchfab.glb'; P['gear_key'] = 'e_b2_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (высота в файле {round(cy, 4)} м вычтена); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы B2_paint (один на всё) и B2_glass (BLEND, clearGlass). В файлах 4096, игре хватает 2048 (39 пикс/м при размахе 52 м, на экране ангара самолёт ~30 пикс/м)'
P['nozzles_game'] = [GG(q) for q in g.STATIONS.get('nozzles', [])]; P['nr'] = 0.30; P['dry'] = True
P['nozzles_note'] = 'по две точки у стенки каждого жёлоба выхлопа, глубоко внизу; настоящие сопла сверху почти не видны. На стенде игра рисовала в жёлобах красное свечение (jetflame e_b2 ghost:1): у настоящего B-2 его нет - проверить, гасит ли его dry:true, иначе nozzles: []'
st_l = [GG(q) for q in g.STATIONS['bay_l']]; st_r = [GG(q) for q in g.STATIONS['bay_r']]
P['stations_game'] = dict(note='по 4 точки в каждом отсеке на замках балки (ниже балки на подвесе). Для mirror() в models.js брать bay_l (x<0): игра заполняет с последней точки, поэтому последняя (индекс 3) - середина отсека, под одну GBU-57 на сторону', bay_l=st_l, bay_r=st_r,
                          models_js='stations: mirror([' + ', '.join('V(%s, %s, %s)' % tuple(p) for p in st_l) + '])')
P['bay_game'] = dict(doors={n_: [GG(g.PARTS[n_]['pivot']), G2(g.PARTS[n_]['axis']), 95] for n_ in ('bay_l_i', 'bay_l_o', 'bay_r_i', 'bay_r_o')}, sides=dict(L=['bay_l_i', 'bay_l_o'], R=['bay_r_i', 'bay_r_o']),
                     note='формат поля bay у e_f35: [ось в осях игры, направление, угол]; створки - отдельные объекты bay_l_i, bay_l_o, bay_r_i, bay_r_o; в prepare нужны groups')
# точки ловушек: снизу у задней кромки центроплана, по образцу прежних (±1,3; низ; 7 и 8,5 м назад от центра)
def under(a, x): return GG(g.P3(a, x, g.bot(a, x) - 0.05))
P['chaff_game'] = [under(19.0, -1.3), under(19.0, 1.3), under(17.5, -1.3), under(17.5, 1.3)]
P['chaff_note'] = 'прежние точки [[-1.3,-0.9,8.5],[1.3,-0.9,8.5],[-1.3,-1.25,7],[1.3,-1.25,7]]; новые те же по плану, высота - низ обшивки этой модели минус 5 см'
P['gear_bottom_game_y'] = round(min((o.matrix_world @ v.co).z for o in GEAR for v in o.data.vertices) - cy, 3)
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
P['parts'] = parts
P['gear_note'] = 'b2_gear.glb: стойки и колёса, только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. Створки шасси в файле самолёта закрыты (в .blend и Sketchfab открыты на 95/92°). Уборку стоек в ниши не делать: ниши короче стоек.'
P['prepare_recipe'] = "e_b2: { src: new URL('./own/b2.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 2048, nTex: () => 2048, pickMesh: /./, own: true, centerX: true, groups: (c) => { const m = /(^|\\/)(bay_[lr]_[io])(\\/|\\||$)/.exec(c.path); return m ? m[2] : 'body'; } }"
P['swap_notes'] = ['убрать прежнего автора модели e_b2 из credits.js (и CREDITS.md)', 'заменить рецепт e_b2 в prepare.js на prepare_recipe (файл own/b2.glb); то же для e_b2_gear (own/b2_gear.glb, без groups)',
                   'models.js e_b2: stations из stations_game.models_js, nozzles из nozzles_game, nr 0.30, dry: true, bay из bay_game, clearGlass: true, gearModel: \'e_b2_gear\'; META.e_b2_gear как у e_f15e_gear',
                   'после подмены: seats-gen.js e_b2; миниатюра; пара ktx (e_b2 и e_b2_gear); если есть camo/e_b2.hi.glb и строка в hi-списке - убрать или заменить (стенд видел запрос /camo/e_b2.hi.glb)',
                   'jetflame.js e_b2 ghost:1 - проверить красное свечение в жёлобах (см. nozzles_note)']
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'шасси низ', P['gear_bottom_game_y'], 'ловушки', P['chaff_game'])
