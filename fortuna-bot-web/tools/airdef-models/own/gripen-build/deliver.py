# deliver.py - сдача JAS 39 Gripen C: превью, файл для Sketchfab и .blend (стойки выпущены, створки открыты, наземная оснастка sk_*), файл игры (без стоек и sk_*,
# створки закрыты), файл шасси для ангара, точки.json, паспорт и отчёт. После build.py в той же сессии:
#   GR_STAGE=4 GR_TEX=4096 Blender -b --factory-startup --python build.py --python deliver.py
# Карты gripen_color.png, gripen_normal.png, gripen_orm.png лежат в папке модели (paint.py с GR_OUT=папка модели, GR_TEX=4096). Развёртка - _проба/uv.npz.
import json, math, os, sys
import bmesh
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/JAS 39 Gripen'
sys.path.insert(0, HERE)
os.environ['GR_MAPS'] = HERE; os.environ['GR_OUT'] = HERE; os.environ['GR_ONLY'] = '__никакой__'; os.environ.setdefault('GR_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))      # материалы, небо, камера; пробные снимки пропущены (GR_ONLY)
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
DOORS_O = (('door_n_r', 86), ('door_n_l', 86), ('door_m_r', 90), ('door_m_l', 90))


def doors(sign):
    for n_, d_ in DOORS_O: pose(n_, sign * d_)
    vl.update()


# ── наземная оснастка только для Sketchfab (правило 14): стремянка к кабине, колодки, вымпелы REMOVE BEFORE FLIGHT ──
def pmat(name, rgb, rough, metal=0.0, img=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True; b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if img:
        t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.join(HERE, img), check_existing=True); t.image.pack(); m.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
    return m


M_LAD = pmat('Gripen_sk_ladder', (0.62, 0.63, 0.62), 0.38, 0.85); M_TRD = pmat('Gripen_sk_tread', (0.05, 0.05, 0.05), 0.85); M_CHK = pmat('Gripen_sk_chock', (0.78, 0.60, 0.07), 0.72)
M_FLG = pmat('Gripen_sk_flag', (1, 1, 1), 0.78, 0.0, 'sk_rbf.png'); M_ROP = pmat('Gripen_sk_rope', (0.10, 0.10, 0.10), 0.9)
SK = []


def obj(name, bm, mat):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(mat)
    if not me.uv_layers: me.uv_layers.new(name='UVMap')
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); SK.append(o)
    for p in me.polygons: p.use_smooth = True
    return o


def tube(bm, p0, p1, r, seg=10):
    d = p1 - p0; L_ = d.length; q = d.normalized().to_track_quat('Z', 'Y')
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=L_)
    M = Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4(); bmesh.ops.transform(bm, matrix=M, verts=res['verts'])


def box(bm, c, s, rotz=0.0):
    res = bmesh.ops.create_cube(bm, size=1.0); M = Matrix.Translation(c) @ Matrix.Rotation(rotz, 4, 'Z') @ Matrix.Diagonal((s[0], s[1], s[2], 1)); bmesh.ops.transform(bm, matrix=M, verts=res['verts'])


P3 = g.P3; GZ = g.GROUND_Y
# стремянка у левого борта кабины: крюки на борт кабины, ноги на земле
a_l = 3.63; zs = g.SILL(a_l) + 0.02; xs = -(g.CAN_T[1](a_l) + 0.035)
top = lambda a: P3(a, xs - 0.05, zs - 0.06); bot = lambda a: P3(a, -1.20, GZ + 0.02)
bm = bmesh.new()
for a_ in (a_l - 0.21, a_l + 0.21):
    tube(bm, top(a_), bot(a_), 0.022); tube(bm, top(a_), P3(a_, xs + 0.06, zs + 0.03), 0.018); tube(bm, P3(a_, xs + 0.06, zs + 0.03), P3(a_, xs + 0.06, zs - 0.04), 0.016)
for k in range(1, 8):
    t = k / 8; pA = top(a_l - 0.21).lerp(bot(a_l - 0.21), t); pB = top(a_l + 0.21).lerp(bot(a_l + 0.21), t); tube(bm, pA, pB, 0.016)
obj('sk_ladder', bm, M_LAD)
bm = bmesh.new()
for k in range(1, 8):
    t = k / 8; c = top(a_l).lerp(bot(a_l), t) + Vector((0, 0, 0.018)); box(bm, c, (0.10, 0.38, 0.012))
for a_ in (a_l - 0.21, a_l + 0.21): box(bm, bot(a_) + Vector((0, 0, 0.01)), (0.12, 0.08, 0.02))
obj('sk_ladder_treads', bm, M_TRD)
# колодки: клин по обе стороны каждого колеса и шнур между ними
def chock(name, a0, x0, w, dirn):
    bm = bmesh.new(); h = 0.10; l_ = 0.16
    pts = [(a0, GZ), (a0 + dirn * l_, GZ), (a0, GZ + h)]
    vs = [bm.verts.new(P3(a, x0 + s * w / 2, z)) for s in (-1, 1) for a, z in pts]
    bm.faces.new(vs[:3]); bm.faces.new(vs[3:][::-1])
    for i in range(3):
        j = (i + 1) % 3; bm.faces.new((vs[i], vs[j], vs[3 + j], vs[3 + i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); return obj(name, bm, M_CHK)
for nm, a_, x_, rw_, w_ in (('n', 4.03, 0.0, 0.21, 0.46), ('m_r', 8.45, 1.12, 0.40, 0.30), ('m_l', 8.45, -1.12, 0.40, 0.30)):
    chock('sk_chock_' + nm + '_f', a_ - rw_ - 0.015, x_, w_, -1); chock('sk_chock_' + nm + '_b', a_ + rw_ + 0.015, x_, w_, 1)
    bm = bmesh.new(); tube(bm, P3(a_ - rw_ - 0.05, x_ + w_ / 2 + 0.03, GZ + 0.03), P3(a_ + rw_ + 0.05, x_ + w_ / 2 + 0.03, GZ + 0.03), 0.006, 6); obj('sk_chock_' + nm + '_rope', bm, M_ROP)
# вымпелы: ПВД, передняя и основные стойки
def flag(name, p0, ln=0.40, wd=0.075, lean=0.10):
    bm = bmesh.new(); d = Vector((0, -lean, -1)).normalized() * ln; s = Vector((0, 1, 0)).cross(d).normalized() * 0  # ленточка висит вниз, чуть назад
    v = [bm.verts.new(p0 + Vector((-wd / 2, 0, 0))), bm.verts.new(p0 + Vector((wd / 2, 0, 0))), bm.verts.new(p0 + d + Vector((wd / 2, 0, 0))), bm.verts.new(p0 + d + Vector((-wd / 2, 0, 0)))]
    f1 = bm.faces.new(v); f2 = bm.faces.new([bm.verts.new(q.co) for q in v[::-1]]); uv = bm.loops.layers.uv.new('UVMap')
    for f, uvs in ((f1, ((0, 1), (0, 0), (1, 0), (1, 1))), (f2, ((1, 1), (1, 0), (0, 0), (0, 1)))):
        for l, c in zip(f.loops, uvs): l[uv].uv = c
    return obj(name, bm, M_FLG)
flag('sk_flag_pitot', P3(-0.42, 0.0, -0.012), 0.36, 0.06, 0.05)
flag('sk_flag_gear_n', P3(4.15, 0.12, -0.70), 0.36)
flag('sk_flag_gear_m_r', P3(8.10, 0.93, -0.62), 0.38); flag('sk_flag_gear_m_l', P3(8.10, -0.93, -0.62), 0.38)
vl.update()
# оснастка не должна задевать самолёт (кроме своих креплений: крюки стремянки на борту кабины, вымпелы на стойках)
from mathutils.bvhtree import BVHTree
def T_(o): return BVHTree.FromPolygons([o.matrix_world @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
SKC = {}
for s_ in SK:
    t_ = T_(s_); hit = sorted({o.name for o in sc.objects if o.type == 'MESH' and o not in SK and t_.overlap(T_(o))}); SKC[s_.name] = hit
    print('ОСНАСТКА', s_.name, 'касается', hit or 'ничего')
# стойки выпущены - створки шасси открыты, фонарь поднят к стремянке (для превью, Sketchfab и .blend)
doors(1); pose('canopy', 40); vl.update()
for s_ in SK:
    if s_.name == 'sk_ladder': print('ОСНАСТКА при открытом фонаре: стремянка касается', sorted({o.name for o in sc.objects if o.type == 'MESH' and o not in SK and T_(s_).overlap(T_(o))}))
prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, -0.3, 0.3), (-0.55, 0.62, 0.40), 22.0), ('превью_2_сбоку.png', (0.0, 0.0, 0.4), (-1.0, 0.0, 0.06), 21.0),
                         ('превью_3_сверху.png', (0.0, 0.0, 0.3), (0.05, -0.05, 1.0), 22.0), ('превью_4_хвост.png', (0.0, -5.0, 1.0), (0.45, -0.80, 0.35), 9.0),
                         ('превью_5_кабина.png', (0.0, 3.4, 1.0), (-0.62, 0.62, 0.48), 6.5), ('превью_6_снизу.png', (0.0, 0.0, -0.4), (0.30, 0.28, -0.90), 20.0),
                         ('превью_7_заборник.png', (0.8, 3.1, 0.25), (0.35, 0.92, 0.10), 4.0)):
    shot(nm, tg, dv, dist, wd=1920, h=1080); prev.append(nm)
print('превью', prev)
ms = [o for o in sc.objects if o.type == 'MESH' and o not in SK]; vl.update()
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
mk.export(os.path.join(HERE, 'gripen_sketchfab.glb'), os.path.join(HERE, 'gripen.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'gripen_sketchfab.glb')) // 1024, 'КБ')
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_gripen', weapon='', name='JAS 39 Gripen', name_en='JAS 39 Gripen', glb='gripen.glb', blend='gripen.blend', rev=1,
    build=['build.py', 'gripen_geo.py', 'gripen_detail.py', 'gripen_gear.py', 'uv_gripen.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_stores.py', '_стенд.js', 'deliver.py', 'sk_rbf.png'], previews_=prev,
    checks={'ход': COLD, 'стыки': dict(плохо=sty, итог='29 деталей; отмечены уплотнения и петли (утки, носки, руль, фонарь до 1-2 см), створка передней стойки - просвет у концов ниши сбоку'),
            'ход_разбор': 'Касания 1-1,4 мм - уплотнения петель руля, элевонов и носков (так задумано). Внутренние носки при 11-20° заходят в обшивку крыла у конца выреза до 9 мм; щитки у петли до 37 мм (передняя кромка лежит на скруглённом борту); створки передней стойки у конца ниши до 6 мм; фонарь у порога в закрытом положении до 4 см (рама утоплена в борт). Снаружи не видно. Открытые створки основных стоек касаются стоек у петли. Уборка стоек в ниши не рабочая (ниши короче стоек): в игре шасси только выпущено, файл ангара.',
            'подвеска': 'GBU-12 ×4, GBU-31 ×2, контейнер под заборником: касаются только своих замков (det_hard), соседей, шасси и баков нет (_stores.py)',
            'оснастка_sk': SKC,
            'game': 'стенд игры: ангар (3 кадра) и бой днём и вечером (12 кадров), ошибок модели нет (_проба/стенд); на телефоне не проверено'},
    sketchfab={'title': 'JAS 39 Gripen C - Game-Ready Fighter', 'lead': 'JAS 39 Gripen C delta-canard fighter in two-tone grey. Moving parts on their own pivots: canards, elevons, leading-edge flaps, rudder, airbrakes, canopy, landing gear and doors. Detailed cockpit and nozzle. Layered PBR wear: primer in chips, wheel spray, soot and fictional stencils. Display extras: boarding ladder, wheel chocks, RBF streamers.',
               'parts': ["airframe", "canards", "elevons", "LE flaps", "rudder", "airbrakes", "canopy", "cockpit", "nozzle", "gear and doors", "pylons", "ladder", "chocks", "RBF streamers"],
               'tags': ['gripen', 'jas39', 'saab', 'fighter', 'jet', 'aircraft', 'military', 'delta', 'canard', 'game-ready', 'pbr', 'blender'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'gripen_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-12). Свои меши по фото gripen_01-19 Mark (форма), рендеры War Thunder и модель из загрузок Mark - только образец формы, их меши и пиксели не использованы. Знак с коронами нарисован заново, номер 281 и все трафареты придуманы. Mark: убрать бочку под низом, без наплыва у сопла, верх корпуса «крышей» от узкой полосы к крылу, плавный стык корпуса с крылом.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# дальше файл игры и файл шасси: без оснастки, створки закрыты (хвост _trial.py)
for o in SK: bpy.data.objects.remove(o)
doors(-1); pose('canopy', -40); vl.update()
os.environ['GR_OUT'] = HERE; OUT = HERE
exec(compile(src[src.index('# файл для игры: шасси нет'):], '_trial_tail', 'exec'))
# паспорт: всё в осях игры (после центровки prepare.js по длине и высоте)
GG = GG_
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'gripen_gear.glb'; P['files']['sketchfab_glb'] = 'gripen_sketchfab.glb'; P['gear_key'] = 'e_gripen_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (высота {round(cy_, 4)} м и середина длины {round(ym_, 4)} м вычтены: ПВД сдвигает середину); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы Gripen_paint (один на всё) и Gripen_glass (BLEND, clearGlass). В файлах 4096, игре хватает 2048 (prepare tex 2048)'
st = {k: GG(v) for k, v in g.PYLON_PTS.items()}
P['nozzles_game'] = [GG(g.P3(g.NOZ_A, 0.0, g.NOZ_Y))]; P['nr'] = g.NOZ_R; P['afterburner'] = True
V_ = lambda p, e=None: 'V(%s, %s, %s%s)' % (p[0], p[1], p[2], '' if e is None else ', %s' % e)
P['stations_game'] = dict(note='низ пилона (верх груза). Порядок для mirror(): [законцовка tip, внешний pylon_o, внутренний pylon_i, подфюзеляжный pylon_c]; игра заполняет с последней точки, поэтому GBU-31 идёт на подфюзеляжные и внутренние. Проверено _stores.py: GBU-12 ×4, GBU-31 ×2 и контейнер не задевают соседей, шасси и обшивку',
                          **st, models_js='stations: mirror([' + ', '.join((V_(st['tip_r'], 0.1), V_(st['pylon_o_r']), V_(st['pylon_i_r']), V_(st['pylon_c_r'], 0.1))) + '])')
P['pod_game'] = dict(attach=st['pod'], note='контейнер LITENING под правым заборником, верх контейнера у точки')
P['gear_bottom_game_y'] = round(min((o.matrix_world @ v.co).z for o in GEAR for v in o.data.vertices) - cy_, 3)
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), pivot_game=GG(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
P['parts'] = parts
P['sketchfab_extra'] = 'В gripen_sketchfab.glb и gripen.blend есть наземная оснастка sk_* (стремянка, колодки, вымпелы REMOVE BEFORE FLIGHT со своими материалами); в файлах игры её нет. Там же створки шасси открыты и фонарь поднят на 40°, в файле игры всё закрыто.'
P['gear_note'] = 'gripen_gear.glb: стойки и колёса, только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. Створки шасси в файле самолёта закрыты (в .blend и Sketchfab открыты на 86/90°). Уборку стоек в ниши не делать: ниши короче стоек.'
P['prepare_recipe'] = "e_gripen: { src: new URL('./own/gripen.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 2048, nTex: () => 2048, pickMesh: /./, own: true, centerX: true }"
P['swap_notes'] = ['Длина 14,69 м до среза сопла, ПВД добавляет 0,74 м вперёд: prepare.js центрует по габаритам, поэтому все точки в паспорте уже сдвинуты на середину с ПВД (ym_).',
                   'prepare.js e_gripen сейчас со старым источником (saab_jas-39_gripen_fighter_jet.glb): заменить на prepare_recipe (own/gripen.glb); e_gripen_gear - тот же рецепт с own/gripen_gear.glb. Строка CONFIG e_gripen_lo строится от e_gripen - пересобрать _lo вместе с ним.',
                   "models.js e_gripen: stations из stations_game.models_js, nozzles из nozzles_game, nr из nr, pod из pod_game.attach, clearGlass: true, gearModel: 'e_gripen_gear'; META.e_gripen_gear как у e_f15e_gear.",
                   'Убрать прежнего автора модели из games/airdef/models/credits.js (запись со ссылкой sketchfab.com/3d-models/saab-jas-39-gripen-fighter-jet-…) и из CREDITS.md, если он там есть.',
                   'Ангар берёт camo/e_gripen.hi.glb: заменить или убрать строку из hi-списка, иначе в ангаре останется старая модель (стенд видел запрос /camo/e_gripen.hi.glb).',
                   'После подмены: seats-gen.js e_gripen (посадка подвески по новым точкам), миниатюра, пара ktx (e_gripen и e_gripen_gear).',
                   'Возможная будущая окраска - «осколочный» камуфляж с фото gripen_01/18-20 (по просьбе Mark пока не делали).']
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'шасси низ', P['gear_bottom_game_y'], 'точки', P['stations_game']['models_js'], 'сопло', P['nozzles_game'])
