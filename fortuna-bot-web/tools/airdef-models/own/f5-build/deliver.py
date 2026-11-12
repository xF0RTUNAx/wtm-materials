# deliver.py - сдача F-5E Tiger II (с образца Gripen): превью, файл для Sketchfab и .blend (стойки выпущены, створки носовой ниши открыты, фонарь поднят,
# наземная оснастка sk_*), файл игры (без стоек и sk_*), файл шасси для ангара, точки.json, паспорт и отчёт. После build.py в той же сессии:
#   F5_TEX=4096 Blender -b --factory-startup --python build.py --python deliver.py
# Карты f5_color.png, f5_normal.png, f5_orm.png лежат в папке модели (paint.py с F5_OUT=папка модели, F5_TEX=4096). Развёртка - _проба/uv.npz.
import json, math, os, sys
import bmesh
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/F-5E Tiger II'
sys.path.insert(0, HERE)
os.environ['F5_MAPS'] = HERE; os.environ['F5_OUT'] = HERE; os.environ['F5_ONLY'] = '__никакой__'; os.environ.setdefault('F5_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))      # материалы, небо, камера; пробные снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
import f5_detail as dt, f5_gear as gr
from mathutils.bvhtree import BVHTree


def pose(n, deg):
    o = bpy.data.objects[n]; D = g.PARTS[n]; T = D['pivot']; o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world


# ── наземная оснастка только для Sketchfab: стремянка к кабине, колодки, вымпелы REMOVE BEFORE FLIGHT ──
def pmat(name, rgb, rough, metal=0.0, img=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True; b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if img:
        t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.join(HERE, img), check_existing=True); t.image.pack(); m.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
    return m


M_LAD = pmat('F5_sk_ladder', (0.62, 0.63, 0.62), 0.38, 0.85); M_TRD = pmat('F5_sk_tread', (0.05, 0.05, 0.05), 0.85); M_CHK = pmat('F5_sk_chock', (0.78, 0.60, 0.07), 0.72)
M_FLG = pmat('F5_sk_flag', (1, 1, 1), 0.78, 0.0, 'sk_rbf.png'); M_ROP = pmat('F5_sk_rope', (0.10, 0.10, 0.10), 0.9)
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


P3 = g.P3; GZ = gr.GROUND_Z; Y = lambda a_: 7.225 - a_
# стремянка у левого борта кабины: крюки на борт кабины, ноги на земле
a_l = 5.36; zs = dt.sill(a_l) + 0.02; xs = -(dt.CN_HW(a_l) + 0.035)
top = lambda a: P3(a, xs - 0.05, zs - 0.06); bot = lambda a: P3(a, -1.30, GZ + 0.02)
bm = bmesh.new()
for a_ in (a_l - 0.17, a_l + 0.17):
    tube(bm, top(a_), bot(a_), 0.022); tube(bm, top(a_), P3(a_, xs + 0.06, zs + 0.03), 0.018); tube(bm, P3(a_, xs + 0.06, zs + 0.03), P3(a_, xs + 0.06, zs - 0.04), 0.016)
for k in range(1, 9):
    t = k / 9; pA = top(a_l - 0.17).lerp(bot(a_l - 0.17), t); pB = top(a_l + 0.17).lerp(bot(a_l + 0.17), t); tube(bm, pA, pB, 0.016)
obj('sk_ladder', bm, M_LAD)
bm = bmesh.new()
for k in range(1, 9):
    t = k / 9; c = top(a_l).lerp(bot(a_l), t) + Vector((0, 0, 0.018)); box(bm, c, (0.10, 0.38, 0.012))
for a_ in (a_l - 0.17, a_l + 0.17): box(bm, bot(a_) + Vector((0, 0, 0.01)), (0.12, 0.08, 0.02))
obj('sk_ladder_treads', bm, M_TRD)
def chock(name, a0, x0, w, dirn):
    bm = bmesh.new(); h = 0.10; l_ = 0.16
    pts = [(a0, GZ), (a0 + dirn * l_, GZ), (a0, GZ + h)]
    vs = [bm.verts.new(P3(a, x0 + s * w / 2, z)) for s in (-1, 1) for a, z in pts]
    bm.faces.new(vs[:3]); bm.faces.new(vs[3:][::-1])
    for i in range(3):
        j = (i + 1) % 3; bm.faces.new((vs[i], vs[j], vs[3 + j], vs[3 + i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); return obj(name, bm, M_CHK)
for nm, a_, x_, rw_, w_ in (('n', gr.NG['a'], 0.0, gr.NG['rw'], 0.40), ('m_r', gr.MG_A, gr.MG_X, gr.MRW, 0.30), ('m_l', gr.MG_A, -gr.MG_X, gr.MRW, 0.30)):
    chock('sk_chock_' + nm + '_f', a_ - rw_ - 0.015, x_, w_, -1); chock('sk_chock_' + nm + '_b', a_ + rw_ + 0.015, x_, w_, 1)
    bm = bmesh.new(); tube(bm, P3(a_ - rw_ - 0.05, x_ + w_ / 2 + 0.03, GZ + 0.03), P3(a_ + rw_ + 0.05, x_ + w_ / 2 + 0.03, GZ + 0.03), 0.006, 6); obj('sk_chock_' + nm + '_rope', bm, M_ROP)
def flag(name, p0, ln=0.40, wd=0.075, lean=0.10):
    bm = bmesh.new(); d = Vector((0, -lean, -1)).normalized() * ln; s = Vector((0, 1, 0)).cross(d).normalized() * 0  # ленточка висит вниз, чуть назад
    v = [bm.verts.new(p0 + Vector((-wd / 2, 0, 0))), bm.verts.new(p0 + Vector((wd / 2, 0, 0))), bm.verts.new(p0 + d + Vector((wd / 2, 0, 0))), bm.verts.new(p0 + d + Vector((-wd / 2, 0, 0)))]
    f1 = bm.faces.new(v); f2 = bm.faces.new([bm.verts.new(q.co) for q in v[::-1]]); uv = bm.loops.layers.uv.new('UVMap')
    for f, uvs in ((f1, ((0, 1), (0, 0), (1, 0), (1, 1))), (f2, ((1, 1), (1, 0), (0, 0), (0, 1)))):
        for l, c in zip(f.loops, uvs): l[uv].uv = c
    return obj(name, bm, M_FLG)
flag('sk_flag_pitot', P3(0.22, 0.0, -1.118), 0.36, 0.06, 0.05)
flag('sk_flag_gear_n', P3(4.36, 0.075, -1.42), 0.36)
flag('sk_flag_gear_m_r', P3(9.18, 1.72, -1.38), 0.38); flag('sk_flag_gear_m_l', P3(9.18, -1.72, -1.38), 0.38)
vl.update()
def T_(o): return BVHTree.FromPolygons([o.matrix_world @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
SKC = {}
for s_ in SK:
    t_ = T_(s_); hit = sorted({o.name for o in sc.objects if o.type == 'MESH' and o not in SK and t_.overlap(T_(o))}); SKC[s_.name] = hit
    print('ОСНАСТКА', s_.name, 'касается', hit or 'ничего')
# стойки выпущены (створки носовой ниши в файле стоек уже открыты), фонарь поднят к стремянке (для превью, Sketchfab и .blend)
pose('canopy_frame', 40); vl.update()
for s_ in SK:
    if s_.name == 'sk_ladder': print('ОСНАСТКА при открытом фонаре: стремянка касается', sorted({o.name for o in sc.objects if o.type == 'MESH' and o not in SK and T_(s_).overlap(T_(o))}))
prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, -0.3, -0.9), (-0.55, 0.62, 0.40), 21.0), ('превью_2_сбоку.png', (0.0, -0.4, -1.2), (-1.0, 0.0, 0.06), 19.0),
                         ('превью_3_сверху.png', (0.0, 0.0, -0.9), (0.03, -0.03, 1.0), 21.0), ('превью_4_хвост.png', (0.0, Y(13.2), -0.4), (0.62, -0.68, 0.32), 6.5),
                         ('превью_5_кабина.png', (0.0, Y(5.6), -0.4), (-0.62, 0.55, 0.55), 5.0), ('превью_6_снизу.png', (0.0, 0.0, -1.2), (0.30, 0.28, -0.90), 19.0),
                         ('превью_7_заборник.png', (0.8, Y(6.4), -1.0), (0.45, 0.88, 0.12), 3.6)):
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
mk.export(os.path.join(HERE, 'f5_sketchfab.glb'), os.path.join(HERE, 'f5.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'f5_sketchfab.glb')) // 1024, 'КБ')
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_f5', weapon='', name='F-5E Tiger II', name_en='F-5E Tiger II', glb='f5.glb', blend='f5.blend', rev=1,
    build=['build.py', 'f5kit.py', 'f5_geo.py', 'f5_detail.py', 'f5_gear.py', 'uv_f5.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_stores.py', '_стенд.js', '_run_paint.sh', 'deliver.py', 'sk_rbf.png'], previews_=prev,
    checks={'ход': COLD, 'стыки': dict(плохо=sty, итог='27 деталей; отмеченные разобраны на крупных планах: носок - небо между концом носка и пусковым рельсом; отсекатели - зазор пограничного слоя по замыслу; киль - щель 1 см над рулём; стабилизатор - просвет у корня ~3 см снизу (зазор 1,8 см нужен на ходе -20…+10°); рама фонаря - взгляд сквозь стекло'),
            'ход_разбор': 'Все рули, носки, закрылки, элероны, щитки и стабилизатор проходят весь ход без захода в обшивку. Фонарь: петля в 0,12 м за задней дугой у её верха (фонарь поднимается от задней дуги, как у F-5); в первые 7° хода передняя дуга задевает раму козырька до 16 мм и стекло козырька до 9 мм, дальше чисто; в игре фонарь не двигается. Стабилизатор: касание 0 мм у оси (крышка корня, внутрь не заходит). Уборка стоек в игре не делается: ниши в обшивке не вырезаны, створки шасси только в файле стоек.',
            'подвеска': 'Mk 82 ×4 на внутренних (x 2,28) и наружных (x 2,96) пилонах: ничего не задевают, до шасси 0,25 м, соседей не задевают (_stores.py)',
            'оснастка_sk': SKC,
            'game': 'стенд игры (_стенд.js): ангар и бой днём и вечером (сбоку, сзади, три четверти, снизу) - кандидат загружен, ошибок модели нет; на телефоне не проверено'},
    sketchfab={'title': 'F-5E Tiger II - Game-Ready Fighter', 'lead': 'F-5E Tiger II light fighter in light grey with low-visibility US markings. Moving parts on own pivots: LE flaps, flaps, ailerons, stabilator, rudder, speed brakes, canopy, gear. Detailed cockpit, twin tapered nozzles. PBR wear: chipped primer, gun soot, heat-tinted metal, wheel spray, fictional stencils. Extras: ladder, chocks, RBF streamers.',
               'parts': ['airframe', 'LE flaps', 'flaps', 'ailerons', 'stabilator', 'rudder', 'speed brakes', 'canopy', 'cockpit', 'twin nozzles', 'gear and doors', 'pylons', 'wingtip rails', 'ladder', 'chocks', 'RBF streamers'],
               'tags': ['f5', 'f-5e', 'tigerii', 'northrop', 'fighter', 'jet', 'aircraft', 'military', 'usaf', 'game-ready', 'pbr', 'blender'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'f5_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-12). Свои меши по фото f5e_01-17 и чертежам f5e_14/15 Mark; f5e_02 и f5e_18 - снимки игр, только планка качества, их меши и пиксели не использованы. Знак США малой заметности нарисован заново, номера AF 99-0712 и 712 и все трафареты придуманы; швейцарских крестов и настоящих номеров нет. Mark: заборники - скруглённый прямоугольник, к фюзеляжу плоско, чуть уже; крыло и фонарь по чертежам; без подфюзеляжного бака; без ступеньки у сопел, сопла длиннее и сужаются.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# дальше файл игры и файл шасси: без оснастки, фонарь закрыт (хвост _trial.py)
for o in SK: bpy.data.objects.remove(o)
pose('canopy_frame', -40); vl.update()
os.environ['F5_OUT'] = HERE; OUT = HERE
exec(compile(src[src.index('# файл для игры: шасси нет'):], '_trial_tail', 'exec'))
# паспорт: всё в осях игры (после центровки prepare.js по длине и высоте)
GG = GG_
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'f5_gear.glb'; P['files']['sketchfab_glb'] = 'f5_sketchfab.glb'; P['gear_key'] = 'e_f5_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (высота {round(cy_, 4)} м и середина длины {round(ym_, 4)} м вычтены); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы F5_paint (один на всё) и F5E_glass (BLEND, clearGlass). В файлах 4096, игре хватает 2048 (prepare tex 2048)'
st = {k: GG(v) for k, v in g.STATIONS.items()}
tips = {('tip_' + ('r' if sx > 0 else 'l')): GG(g.P3(9.55, sx * (g.W_XT + 0.045), g.W_ZC - 0.07)) for sx in (1, -1)}
P['nozzles_game'] = [GG(g.P3(g.NZ_A1, sx * g.NZ_X, g.NZ_Z)) for sx in (1, -1)]; P['nr'] = 0.27; P['afterburner'] = True
P['nozzle_note'] = 'два сопла: центры у среза (14,50 м от ПВД), радиус среза 0,276 м; металл от 13,78 м сужается от 0,312'
V_ = lambda p, e=None: 'V(%s, %s, %s%s)' % (-abs(p[0]), p[1], p[2], '' if e is None else ', %s' % e)
P['stations_game'] = dict(note='низ пилона (верх груза). Порядок для mirror(): [законцовка tip (AIM-9, py 0.1), наружный o, внутренний i]; игра заполняет с последней точки: Mk 82 ×4 идут на внутренние и наружные. Подфюзеляжной точки нет (бак убран по просьбе Mark). Проверено _stores.py.',
                          **st, **tips, models_js='stations: mirror([' + ', '.join((V_(tips['tip_r'], 0.1), V_(st['o_r']), V_(st['i_r']))) + '])')
P['pod_game'] = None
P['gear_bottom_game_y'] = round(min((o.matrix_world @ v.co).z for o in GEAR for v in o.data.vertices) - cy_, 3)
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), pivot_game=GG(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
    if D.get('open') is not None: parts[nm_]['open_deg'] = D['open']
P['parts'] = parts
P['canopy'] = dict(part='canopy_frame', note='в файле игры закрыт; ось поперёк (+X в Blender), петля в 0,12 м за задней дугой у её верха, 0…55° передняя кромка вверх (первые 7° передняя дуга задевает раму козырька до 16 мм); стекло canopy_glass_open - ребёнок рамы')
P['sketchfab_extra'] = 'В f5_sketchfab.glb и f5.blend есть наземная оснастка sk_* (стремянка, колодки, вымпелы REMOVE BEFORE FLIGHT со своими материалами) и фонарь поднят на 40°; в файлах игры их нет, фонарь закрыт.'
P['gear_note'] = 'f5_gear.glb: стойки, колёса и открытые створки носовой ниши, только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. В файле самолёта ниш нет, контуры створок - швы в краске. Уборку стоек в игре не делать.'
P['prepare_recipe'] = "e_f5: { src: new URL('./own/f5.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 2048, nTex: () => 2048, pickMesh: /./, own: true, centerX: true }"
P['swap_notes'] = ['prepare.js e_f5 сейчас со старым источником (8089d66a….glb с полосой strip под подфюзеляжный бак): заменить на prepare_recipe (own/f5.glb); e_f5_gear - тот же рецепт с own/f5_gear.glb.',
                   "models.js e_f5: stations из stations_game.models_js (три точки на сторону вместо прежних четырёх, подфюзеляжных нет), nozzles из nozzles_game, nr из nr, pod: null, lazy: true, clearGlass: true, ...(paintOn ? { gearModel: 'e_f5_gear' } : {}); META.e_f5_gear как у e_f15e_gear.",
                   'Убрать прежнего автора модели e_f5 из games/airdef/models/credits.js и CREDITS.md (sketchfab 8089d66a…), если он там есть.',
                   'Ангар берёт camo/e_f5.hi.glb (стенд видел запрос /camo/e_f5.hi.glb): заменить или убрать строку из hi-списка, иначе в ангаре останется старая модель.',
                   'После подмены: seats-gen.js e_f5 (посадка подвески по новым точкам), миниатюра, пара ktx (e_f5 и e_f5_gear); проверить подвеску «F-5E: Mk 82 ×4».',
                   'Длина 14,50 м от ПВД до среза сопел (было 14,45 - сопла удлинены по просьбе Mark).']
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'шасси низ', P['gear_bottom_game_y'], 'точки', P['stations_game']['models_js'], 'сопла', P['nozzles_game'])
