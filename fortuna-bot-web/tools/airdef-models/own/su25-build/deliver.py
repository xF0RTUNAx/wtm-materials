# deliver.py - сдача Су-25 (с образца F-5E): превью, файл для Sketchfab и .blend (стойки выпущены, створки ниш открыты, фонарь откинут вправо,
# наземная оснастка sk_*), файл игры (без стоек и sk_*), файл шасси для ангара, точки.json, паспорт и отчёт. После build.py в той же сессии:
#   S25_TEX=4096 S25_STAGE=4 Blender -b --factory-startup --python build.py --python deliver.py
# Карты su_color.png, su_normal.png, su_orm.png лежат в папке модели (paint_su.py с S25_OUT=папка модели, S25_TEX=4096, схема pixel, сколы old). Развёртка - _проба/uv.npz.
import json, math, os, sys
import bmesh
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Су-25'
sys.path.insert(0, HERE)
os.environ['S25_MAPS'] = HERE; os.environ['S25_OUT'] = HERE; os.environ['S25_ONLY'] = '__никакой__'; os.environ.setdefault('S25_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
exec(compile(src[:src.index('# файл для игры: шасси нет')], '_trial_head', 'exec'))      # материалы, небо, камера; пробные снимки пропущены
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
import su_detail as dt, su_gear as gr
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


M_LAD = pmat('S25_sk_ladder', (0.62, 0.63, 0.62), 0.38, 0.85); M_TRD = pmat('S25_sk_tread', (0.05, 0.05, 0.05), 0.85); M_CHK = pmat('S25_sk_chock', (0.78, 0.60, 0.07), 0.72)
M_FLG = pmat('S25_sk_flag', (1, 1, 1), 0.78, 0.0, 'sk_rbf.png'); M_ROP = pmat('S25_sk_rope', (0.10, 0.10, 0.10), 0.9)
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


P3 = g.P3; GZ = gr.GROUND_Z; Y = lambda a_: 7.765 - a_
# стремянка у левого борта кабины (фонарь откидывается вправо): крюки на борт кабины, ноги на земле
a_l = 4.55; zs = dt.sill(a_l) + 0.02; xs = -(dt.CN_HW(a_l) + 0.035)
top = lambda a: P3(a, xs - 0.05, zs - 0.06); bot = lambda a: P3(a, -1.45, GZ + 0.02)
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
for nm, a_, x_, rw_, w_ in (('n', gr.NG['a'], gr.NG['x'], gr.NG['rw'], 0.30), ('m_r', gr.MG_A, gr.MG_X, gr.MRW, 0.40), ('m_l', gr.MG_A, -gr.MG_X, gr.MRW, 0.40)):
    chock('sk_chock_' + nm + '_f', a_ - rw_ - 0.015, x_, w_, -1); chock('sk_chock_' + nm + '_b', a_ + rw_ + 0.015, x_, w_, 1)
    bm = bmesh.new(); tube(bm, P3(a_ - rw_ - 0.05, x_ + w_ / 2 + 0.03, GZ + 0.03), P3(a_ + rw_ + 0.05, x_ + w_ / 2 + 0.03, GZ + 0.03), 0.006, 6); obj('sk_chock_' + nm + '_rope', bm, M_ROP)
def flag(name, p0, ln=0.40, wd=0.075, lean=0.10):
    bm = bmesh.new(); d = Vector((0, -lean, -1)).normalized() * ln; s = Vector((0, 1, 0)).cross(d).normalized() * 0  # ленточка висит вниз, чуть назад
    v = [bm.verts.new(p0 + Vector((-wd / 2, 0, 0))), bm.verts.new(p0 + Vector((wd / 2, 0, 0))), bm.verts.new(p0 + d + Vector((wd / 2, 0, 0))), bm.verts.new(p0 + d + Vector((-wd / 2, 0, 0)))]
    f1 = bm.faces.new(v); f2 = bm.faces.new([bm.verts.new(q.co) for q in v[::-1]]); uv = bm.loops.layers.uv.new('UVMap')
    for f, uvs in ((f1, ((0, 1), (0, 0), (1, 0), (1, 1))), (f2, ((1, 1), (1, 0), (0, 0), (0, 1)))):
        for l, c in zip(f.loops, uvs): l[uv].uv = c
    return obj(name, bm, M_FLG)
for sx_ in (1, -1):                                                 # чехлы ПВД с вымпелами
    pa_ = 0.25; px_ = sx_ * (g.PVD['x'] + (g.PVD['a_b'] - pa_) * math.tan(g.PVD['splay'])); pz_ = g._surf_top(g.PVD['a_b'], g.PVD['x']) + 0.022 + (g.PVD['a_b'] - pa_) * math.tan(g.PVD['rise'])
    flag('sk_flag_pitot_' + ('r' if sx_ > 0 else 'l'), P3(pa_, px_, pz_ - 0.012), 0.36, 0.06, 0.05)
flag('sk_flag_gear_n', P3(gr.NG['a'] + 0.25, gr.NG['x'] + 0.10, GZ + 0.95), 0.36)
flag('sk_flag_gear_m_r', P3(gr.MG_A + 0.10, gr.MG_X + 0.25, GZ + 0.95), 0.38); flag('sk_flag_gear_m_l', P3(gr.MG_A + 0.10, -gr.MG_X - 0.25, GZ + 0.95), 0.38)
vl.update()
def T_(o): return BVHTree.FromPolygons([o.matrix_world @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
SKC = {}
for s_ in SK:
    t_ = T_(s_); hit = sorted({o.name for o in sc.objects if o.type == 'MESH' and o not in SK and t_.overlap(T_(o))}); SKC[s_.name] = hit
    print('ОСНАСТКА', s_.name, 'касается', hit or 'ничего')
# стойки выпущены (створки носовой ниши в файле стоек уже открыты), фонарь поднят к стремянке (для превью, Sketchfab и .blend)
pose('canopy_frame', 75); vl.update()
for s_ in SK:
    if s_.name == 'sk_ladder': print('ОСНАСТКА при открытом фонаре: стремянка касается', sorted({o.name for o in sc.objects if o.type == 'MESH' and o not in SK and T_(s_).overlap(T_(o))}))
prev = []
for nm, tg, dv, dist in (('превью_1_общий.png', (0.0, -0.3, 0.1), (-0.55, 0.62, 0.40), 21.0), ('превью_2_сбоку.png', (0.0, -0.2, -0.2), (-1.0, 0.0, 0.06), 20.0),
                         ('превью_3_сверху.png', (0.0, 0.0, 0.2), (0.03, -0.03, 1.0), 21.0), ('превью_4_хвост.png', (0.0, Y(13.2), 1.3), (0.65, -0.62, 0.38), 6.5),
                         ('превью_5_кабина.png', (0.0, Y(4.3), 0.9), (-0.62, 0.55, 0.55), 4.6), ('превью_6_снизу.png', (0.0, 0.0, -0.4), (0.30, 0.28, -0.90), 19.0),
                         ('превью_7_нос.png', (0.0, Y(1.6), 0.1), (-0.70, 0.60, 0.30), 4.0), ('превью_8_заборник.png', (1.0, Y(6.3), 0.2), (0.55, 0.80, 0.12), 4.2)):
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
mk.export(os.path.join(HERE, 'su25_sketchfab.glb'), os.path.join(HERE, 'su25.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'su25_sketchfab.glb')) // 1024, 'КБ')
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_su25', weapon='', name='Су-25', name_en='Su-25 Frogfoot', glb='su25.glb', blend='su25.blend', rev=1,
    build=['build.py', 'su25kit.py', 'su_geo.py', 'su_detail.py', 'su_gear.py', 'uv_su.py', 'gbuf.py', 'paint_su.py', '_trial.py', '_collide.py', '_stores.py', '_стенд.js', '_final.sh', 'deliver.py', 'sk_rbf.png'], previews_=prev,
    checks={'ход': COLD, 'стыки': dict(плохо=sty, итог='отмеченные разобраны на крупных планах: киль - ложные срабатывания по кромкам вертикального киля сверху; стабилизатор - концевые зазоры руля высоты ~1 см у корня и у законцовки, как у настоящих рулей'),
            'ход_разбор': 'Предкрылки, закрылки (две секции), элероны, рули высоты, рули направления (две секции), расщепляющиеся щитки в законцовках и фонарь проходят весь ход без касаний. Уборка стоек в игре не делается: створки ниш только в файле стоек.',
            'подвеска': '«Ракеты: Х-29Т ×2 + Х-25МЛ ×2» с контейнером и «ФАБ-500 ×6»: чисто с выпущенными стойками, открытыми створками, щитками 55°, предкрылками 20°, закрылками 15°; при посадочных 40° закрылки задевают длинные ракеты и внешние ФАБ-500 (_stores.py)',
            'оснастка_sk': SKC,
            'game': 'стенд игры (_стенд.js): ангар и бой днём и вечером (сбоку, три четверти, снизу) - кандидат загружен, ошибок модели нет; на телефоне не проверено'},
    sketchfab={'title': 'Su-25 Frogfoot - Game-Ready Attack Jet', 'lead': 'Su-25 attack aircraft in grey digital camouflage. Moving parts on own pivots: slats, two-section flaps, ailerons, elevators, two-section rudder, split wingtip speed brakes, side-hinged canopy, gear. Cockpit, laser window, nose probes with vanes. PBR wear: matte paint, touch-ups, rain streaks, fluid leaks, worn walkways, soot, fictional stencils. Extras: ladder, chocks, RBF streamers.',
               'parts': ['airframe', 'slats', 'flaps', 'ailerons', 'elevators', 'rudders', 'wingtip speed brakes', 'canopy', 'cockpit', 'laser window', 'nose probes', 'gun', 'gear and doors', 'pylons', 'ladder', 'chocks', 'RBF streamers'],
               'tags': ['su25', 'su-25', 'frogfoot', 'sukhoi', 'attack', 'jet', 'aircraft', 'military', 'digital-camo', 'game-ready', 'pbr', 'blender'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'su25_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-13). Свои меши по чертежам su25_01/02 и фото Mark (su25_03…12, mark_26…35); скачанная Mark модель pbr_sukhoi_su-25.glb - только для изучения пропорций, её меши не использованы. Масштаб по длине прежней модели игры 15,53 м (линейка чертежа 02 обрезана). Окраска - цифровой пиксель без флагов и кокард (Mark), номер 36 и трафареты придуманы. Mark: гондолы слиты с корпусом, у губы щель 8 см; фонарь вровень с гаргротом, козырёк заподлицо; нос тупой и короче, ПВД на «плечах» носа, окно дальномера; корпус шире; сколы - старая тёмная краска.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# дальше файл игры и файл шасси: без оснастки, фонарь закрыт (хвост _trial.py, имена su25*.glb)
for o in SK: bpy.data.objects.remove(o)
pose('canopy_frame', -75); vl.update()
os.environ['S25_OUT'] = HERE; OUT = HERE
tail_ = src[src.index('# файл для игры: шасси нет'):].replace("'su.glb'", "'su25.glb'").replace("'su_gear.glb'", "'su25_gear.glb'")
exec(compile(tail_, '_trial_tail', 'exec'))
# паспорт: всё в осях игры (после центровки prepare.js по длине и высоте)
GG = GG_
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
P = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
P['weapon'] = None; P['tex'] = 2048; P['nTex'] = 2048; P['files']['gear_glb'] = 'su25_gear.glb'; P['files']['sketchfab_glb'] = 'su25_sketchfab.glb'; P['gear_key'] = 'e_su25_gear'
P['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (высота {round(cy_, 4)} м и середина длины {round(ym_, 4)} м вычтены); pivot_gltf - оси файла до центровки.'
P['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы S25_paint (один на всё) и S25G_glass (BLEND, clearGlass: фонарь и окно дальномера). В файлах 4096, игре хватает 2048 (prepare tex 2048)'
st = {k: GG(v) for k, v in g.STATIONS.items()}
P['nozzles_game'] = [GG(g.P3(g.NAC_A1 + 0.135, sx * g.NT[0](g.NAC_A1), g.NT[1](g.NAC_A1))) for sx in (1, -1)]; P['nr'] = round(g.NZ_R - 0.03, 3); P['afterburner'] = False; P['dry'] = True
P['nozzle_note'] = 'два сопла на торцах гондол: центры у среза, радиус среза 0,27 м; форсажа нет (dry: true, как сейчас)'
V_ = lambda p, e=None: 'V(%s, %s, %s%s)' % (-abs(p[0]), p[1], p[2], '' if e is None else ', %s' % e)
P['stations_game'] = dict(note='низ пилона (верх груза). Порядок для mirror(): [p4, p3, p2, p1] - от внешней к внутренней, как сейчас; p5 (под Р-60) только в модели. Игра заполняет с последней точки (порядок развески [3, 4, 2, 5, 1, 6, 0, 7]). Проверено _stores.py.',
                          racks=True, racks_note='пилоны узкие (8-10 см), грузы с ушками и балочными держателями садятся на нижнюю кромку пилона - нужен racks: true (как у Су-17М4)',
                          **st, models_js='stations: mirror([' + ', '.join((V_(st['p4_r']), V_(st['p3_r']), V_(st['p2_r']), V_(st['p1_r']))) + '])')
P['pod_game'] = dict(point=st['pod'], models_js='pod: V(0, %s, %s)' % (st['pod'][1], st['pod'][2]), note='контейнер на подфюзеляжном пилоне pylon_c (a 8,2 от ПВД, 7 см ниже обшивки) - для загрузки «Ракеты: Х-29Т + Х-25МЛ» (pod: true)')
P['loads_check'] = {'Ракеты: Х-29Т ×2 + Х-25МЛ ×2 + контейнер': 'Х-29Т на p1, Х-25МЛ на p2, контейнер на pod - ничего не задевают (стойки выпущены, створки открыты, щитки 55°, предкрылки 20°, закрылки 15°); при закрылках 40° длинные ракеты касаются закрылков',
                    'Су-25: ФАБ-500 ×6': 'p1, p2, p3 с обеих сторон - чисто; при закрылках 40° внешние (p3) касаются закрылка 2'}
P['gear_bottom_game_y'] = round(min((o.matrix_world @ v.co).z for o in GEAR for v in o.data.vertices) - cy_, 3)
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), pivot_game=GG(D['pivot']), axis_gltf=G2(Vector(D['axis'])), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('retracted') is not None: parts[nm_]['retracted_deg'] = D['retracted']
    if D.get('open') is not None: parts[nm_]['open_deg'] = D['open']
P['parts'] = parts
P['canopy'] = dict(part='canopy_frame', note='в файле игры закрыт; петли по правому порогу, ось горизонтальная вдоль самолёта на высоте переднего порога, 0…95° - левый край вверх, фонарь ложится вправо; стекло canopy_glass_open - ребёнок рамы; ход без касаний')
P['gearHide'] = None
P['gear_note'] = 'su25_gear.glb: стойки, колёса и открытые створки ниш (носовая и основные в гондолах), только для ангара; две метки по 1 мм дают тот же центр prepare.js, что у самолёта. В файле самолёта стоек и створок нет, ниши не вырезаны (контуры створок - швы в краске), поэтому gearHide не нужен. Уборку стоек в игре не делать.'
P['sketchfab_extra'] = 'В su25_sketchfab.glb и su25.blend есть наземная оснастка sk_* (стремянка у левого борта, колодки, вымпелы на ПВД и стойках) и фонарь откинут на 75°; в файлах игры их нет, фонарь закрыт.'
P['prepare_recipe'] = "e_su25: { src: new URL('./own/su25.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 2048, nTex: () => 2048, pickMesh: /./, own: true, centerX: true }"
P['swap_notes'] = ['prepare.js e_su25 сейчас со старым источником (su25_mamontnikita.glb, rulesIn: game): заменить на prepare_recipe (own/su25.glb); e_su25_gear - тот же рецепт с own/su25_gear.glb; pk_e_su25 строится из CONFIG.e_su25 - пересобрать.',
                   "models.js e_su25: stations из stations_game.models_js (те же 4 точки на сторону, порядок p4..p1), pod из pod_game.models_js вместо null, nozzles из nozzles_game, nr из nr, dry: true, lazy: true, clearGlass: true, racks: true, ...(paintOn ? { gearModel: 'e_su25_gear' } : {}); META.e_su25_gear как у e_f15e_gear.",
                   'Убрать прежнего автора e_su25 (mamont nikita, CC BY 4.0) из games/airdef/models/credits.js и CREDITS.md; GLB_V e_su25 поднять.',
                   'Ангар берёт camo/e_su25.hi.glb (стенд видел запрос /camo/e_su25.hi.glb): заменить или убрать из hi-списка, иначе в ангаре останется старая модель.',
                   'После подмены: seats-gen.js e_su25 (посадка подвески по новым точкам, racks), миниатюра, ktx (e_su25 и e_su25_gear); проверить обе загрузки и контейнер.',
                   'Окраска одна - цифровой пиксель без флагов и кокард (Mark); схемы base/light/bulg из проб в игру не идут.']
json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'шасси низ', P['gear_bottom_game_y'], 'точки', P['stations_game']['models_js'], 'сопла', P['nozzles_game'], 'контейнер', P['pod_game']['models_js'])
