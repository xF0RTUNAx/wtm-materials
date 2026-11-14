# deliver.py - сдача Як-38М (по deliver.py Ту-22): превью, файл для Sketchfab и .blend (стойки выпущены, фонарь открыт, наземная оснастка sk_*), файл игры (без стоек и sk_*,
# всё закрыто, закрытые створки ниш для gearHide), файл шасси для ангара, точки.json, паспорт и отчёт. После build.py в той же сессии:
#   YK_STAGE=4 Blender -b --factory-startup --python build.py --python deliver.py
# Карты yak38_color.png, yak38_normal.png, yak38_orm.png лежат в папке модели (paint.py YK_TEX=4096 YK_SCHEME=dark). Развёртка - _проба/uv.npz.
import json, math, os, sys
import bmesh
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Як-38М'
sys.path.insert(0, HERE)
os.environ['YK_MAPS'] = HERE; os.environ['YK_OUT'] = HERE; os.environ['YK_ONLY'] = '__никакой__'; os.environ.setdefault('YK_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
CUT = '# файл для игры: без стоек и открытых створок шасси'
exec(compile(src[:src.index(CUT)], '_trial_head', 'exec'))
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
from mathutils.bvhtree import BVHTree
def pose(n, deg):
    o = bpy.data.objects.get(n)
    if o is None or n not in g.PARTS: return
    D = g.PARTS[n]; T = D['pivot']
    o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world


def pmat(name, rgb, rough, metal=0.0, img=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True; b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if img:
        t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.join(HERE, img), check_existing=True); t.image.pack(); m.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
    return m


M_LAD = pmat('YK_sk_ladder', (0.30, 0.36, 0.26), 0.62, 0.2); M_TRD = pmat('YK_sk_tread', (0.05, 0.05, 0.05), 0.85); M_CHK = pmat('YK_sk_chock', (0.42, 0.30, 0.18), 0.85)
M_FLG = pmat('YK_sk_flag', (1, 1, 1), 0.82, 0.0, 'sk_rbf.png'); M_ROP = pmat('YK_sk_rope', (0.10, 0.10, 0.10), 0.9); M_CVR = pmat('YK_sk_cover', (0.40, 0.08, 0.06), 0.88)
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


def boxm(bm, c, s):
    res = bmesh.ops.create_cube(bm, size=1.0); M = Matrix.Translation(c) @ Matrix.Diagonal((s[0], s[1], s[2], 1)); bmesh.ops.transform(bm, matrix=M, verts=res['verts'])


P3 = g.P3; GZ = g.GROUND_Z
# стремянка к кабине у левого борта перед заборником: крюки на порог фонаря, ноги на земле
a_l = 3.50; zs = g.SILL(a_l) + 0.02; xs = -(g.CAN_T[1](a_l) + 0.06)
top = lambda a: P3(a, xs - 0.04, zs - 0.05); bot = lambda a: P3(a, -1.20, GZ + 0.02)
bm = bmesh.new()
for a_ in (a_l - 0.20, a_l + 0.20):
    tube(bm, top(a_), bot(a_), 0.022); tube(bm, top(a_), P3(a_, xs + 0.06, zs + 0.03), 0.016); tube(bm, P3(a_, xs + 0.06, zs + 0.03), P3(a_, xs + 0.06, zs - 0.04), 0.014)
NST = 9
for k in range(1, NST):
    t = k / NST; tube(bm, top(a_l - 0.20).lerp(bot(a_l - 0.20), t), top(a_l + 0.20).lerp(bot(a_l + 0.20), t), 0.014)
for a_ in (a_l - 0.20, a_l + 0.20): tube(bm, top(a_).lerp(bot(a_), 0.55), P3(a_, -0.70, GZ + 0.02), 0.016)
obj('sk_ladder', bm, M_LAD)
bm = bmesh.new()
for k in range(1, NST):
    t = k / NST; boxm(bm, top(a_l).lerp(bot(a_l), t) + Vector((0, 0, 0.016)), (0.09, 0.36, 0.010))
for a_ in (a_l - 0.20, a_l + 0.20): boxm(bm, bot(a_) + Vector((0, 0, 0.01)), (0.10, 0.07, 0.02))
obj('sk_ladder_treads', bm, M_TRD)
def chock(name, a0, x0, w, dirn, h=0.12, l_=0.20):
    bm = bmesh.new(); pts = [(a0, GZ), (a0 + dirn * l_, GZ), (a0, GZ + h)]
    vs = [bm.verts.new(P3(a, x0 + s * w / 2, z)) for s in (-1, 1) for a, z in pts]
    bm.faces.new(vs[:3]); bm.faces.new(vs[3:][::-1])
    for i in range(3):
        j = (i + 1) % 3; bm.faces.new((vs[i], vs[j], vs[3 + j], vs[3 + i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); return obj(name, bm, M_CHK)
import yak_gear as gr_
for nm, a_, x_, rw_, w_ in (('n', gr_.NG['a'], 0.0, gr_.NG['rw'], gr_.NG['ww'] + 0.12), ('m_r', gr_.MG['a'], gr_.MG['x'], gr_.MG['rw'], gr_.MG['ww'] + 0.12), ('m_l', gr_.MG['a'], -gr_.MG['x'], gr_.MG['rw'], gr_.MG['ww'] + 0.12)):
    k_ = 0.86 if nm == 'n' else 0.75; chock('sk_chock_' + nm + '_f', a_ - rw_ * k_, x_, w_, -1); chock('sk_chock_' + nm + '_b', a_ + rw_ * k_, x_, w_, 1)
    bm = bmesh.new(); tube(bm, P3(a_ - rw_ * 0.75 - 0.06, x_ + w_ / 2 + 0.03, GZ + 0.04), P3(a_ + rw_ * 0.75 + 0.06, x_ + w_ / 2 + 0.03, GZ + 0.04), 0.006, 6); obj('sk_chock_' + nm + '_rope', bm, M_ROP)
def loftobj(name, rings, mat):
    bm = bmesh.new(); vs = [[bm.verts.new(p) for p in r] for r in rings]; n = len(rings[0])
    for i in range(len(vs) - 1):
        for k in range(n): bm.faces.new((vs[i][k], vs[i][(k + 1) % n], vs[i + 1][(k + 1) % n], vs[i + 1][k]))
    bm.faces.new(vs[0][::-1]); bm.faces.new(vs[-1]); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); return obj(name, bm, mat)
A0 = g.INL_A0
for sx, s_ in ((1, 'r'), (-1, 'l')):                                                                 # заглушка в канале заборника за серпом губы, с выступающим фланцем
    loftobj('sk_cover_in_' + s_, [g.inl_ring(a, sx, dr, 64) for a, dr in ((A0 + 0.62, -0.05), (A0 + 0.34, -0.045), (A0 + 0.31, -0.020), (A0 + 0.28, -0.020))], M_CVR)
    N_ = g.NOZ; cx = sx * N_['x']; ae = N_['a'] + N_['ln']; n = 40
    loftobj('sk_cover_out_' + s_, [[P3(a, cx + r * math.sin(2 * math.pi * k / n), N_['z'] - r * math.cos(2 * math.pi * k / n)) for k in range(n)]
                                  for a, r in ((ae - 0.10, N_['re'] - 0.03), (ae + 0.02, N_['re'] - 0.004), (ae + 0.05, N_['re'] + 0.02), (ae + 0.09, N_['re'] - 0.04))], M_CVR)
zp = g.FT[0](0.0) + 0.01
loftobj('sk_cover_probe', [[P3(a, 0.0 + r * math.sin(2 * math.pi * k / 16), zp - 0.02 * a - r * math.cos(2 * math.pi * k / 16)) for k in range(16)] for a, r in ((-0.88, 0.030), (-0.95, 0.040), (-1.28, 0.036), (-1.32, 0.012))], M_CVR)
def flag(name, p0, ln=0.36, wd=0.07, lean=0.10):
    bm = bmesh.new(); d = Vector((0, -lean, -1)).normalized() * ln
    v = [bm.verts.new(p0 + Vector((-wd / 2, 0, 0))), bm.verts.new(p0 + Vector((wd / 2, 0, 0))), bm.verts.new(p0 + d + Vector((wd / 2, 0, 0))), bm.verts.new(p0 + d + Vector((-wd / 2, 0, 0)))]
    f1 = bm.faces.new(v); f2 = bm.faces.new([bm.verts.new(q.co) for q in v[::-1]]); uv = bm.loops.layers.uv.new('UVMap')
    for f, uvs in ((f1, ((0, 1), (1, 1), (1, 0), (0, 0))), (f2, ((0, 0), (1, 0), (1, 1), (0, 1)))):
        for l, c in zip(f.loops, uvs): l[uv].uv = c
    return obj(name, bm, M_FLG)
for sx, s_ in ((1, 'r'), (-1, 'l')):
    flag('sk_flag_gear_m_' + s_, P3(gr_.MG['piv'][0] + 0.15, sx * (gr_.MG['x'] + 0.14), gr_.MG['piv'][2] - 0.15), 0.34)
    flag('sk_flag_cover_' + s_, P3(A0 + 0.30, sx * 0.80, g.INL_Z0 + 0.06), 0.30)
    flag('sk_flag_noz_' + s_, P3(g.NOZ['a'] + g.NOZ['ln'] + 0.08, sx * g.NOZ['x'], g.NOZ['z'] - g.NOZ['re'] + 0.02), 0.28)
flag('sk_flag_gear_n', P3(gr_.NG['piv'][0] - 0.10, 0.10, gr_.NG['piv'][1] - 0.30), 0.34)
flag('sk_flag_probe', P3(-1.20, 0.0, zp + 0.024 - 0.04), 0.30)
vl.update()
def T_(o): return BVHTree.FromPolygons([o.matrix_world @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
pose('canopy', 80); vl.update()                                                                   # фонарь откинут вправо - для превью, Sketchfab и .blend
SKC = {}
for s_ in SK:
    t_ = T_(s_); hit = sorted({o.name for o in sc.objects if o.type == 'MESH' and o not in SK and not o.name.startswith('v_') and t_.overlap(T_(o))}); SKC[s_.name] = hit
    print('ОСНАСТКА', s_.name, 'касается', hit or 'ничего')
prev = []
for nm, tg, dv, dist, ln in (('превью_1_общий.png', (0.0, Y(8.0), 1.5), (0.80, 0.56, 0.22), 23.0, 55), ('превью_2_сбоку.png', (0.0, Y(8.0), 1.5), (-1.0, 0.03, 0.05), 25.0, 55),
                             ('превью_3_сверху.png', (0.0, Y(8.3), 1.5), (0.10, -0.12, 1.0), 26.0, 55), ('превью_4_заборник.png', (0.80, Y(4.6), 1.60), (0.86, 0.42, 0.18), 6.2, 50),
                             ('превью_5_кабина.png', (0.0, Y(3.4), 2.1), (0.55, 0.45, 0.70), 5.0, 50), ('превью_6_сопло.png', (1.0, Y(12.2), 1.1), (0.75, -0.55, -0.12), 5.0, 50),
                             ('превью_7_сзади.png', (0.0, Y(10.0), 1.4), (-0.62, -0.76, 0.12), 21.0, 55)):
    shot(nm, tg, dv, dist, lens=ln, wd=1920, h=1080); prev.append(nm)
go.hide_render = True; shot('превью_8_снизу.png', (0.0, Y(8.3), 1.2), (0.20, -0.15, -1.0), 24.0, lens=55, wd=1920, h=1080); prev.append('превью_8_снизу.png'); go.hide_render = False
print('превью', prev)
for c_ in ('v_cam', 'v_sun', 'v_ground'):
    o_ = bpy.data.objects.get(c_)
    if o_ is not None: bpy.data.objects.remove(o_)
vl.update()
ms = [o for o in sc.objects if o.type == 'MESH' and o not in SK]
pts = [o.matrix_world @ v.co for o in ms for v in o.data.vertices]; mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
LEN, SPAN, HGT = round(mx.y - mn.y, 3), round(mx.x - mn.x, 3), round(mx.z - mn.z, 3)
col = {}
try: col = json.load(open(os.path.join(HERE, '_снимки', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога хода:', e)
COLD = {k: dict(касаний=v.get('касаний'), глубина_мм=v.get('глубина_мм')) for k, v in col.items()} if isinstance(col, dict) else col
sty = {}
try:
    D_ = json.load(open(os.path.join(HERE, '_стыки2', '_стыки.json'), encoding='utf-8'))['детали']; sty = {k: v['плохо'] for k, v in D_.items() if v.get('плохо')}
except Exception as e: print('нет итога стыков:', e)
bmb = {}
try: bmb = json.load(open(os.path.join(HERE, '_снимки', 'bombs.json'), encoding='utf-8'))
except Exception as e: print('нет итога бомб:', e)
mk.export(os.path.join(HERE, 'yak38_sketchfab.glb'), os.path.join(HERE, 'yak38.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'yak38_sketchfab.glb')) // 1024, 'КБ')
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_yak38', weapon='', name='Як-38М', name_en='Yakovlev Yak-38M', glb='yak38.glb', blend='yak38.blend', rev=1,
    build=['build.py', 'yak_base.py', 'yak_geo.py', 'yak_detail.py', 'yak_gear.py', 'uv_yak.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_bomb.py', '_стенд.js', 'deliver.py', 'sk_rbf.png'], previews_=prev,
    checks={'ход': COLD, 'стыки': dict(плохо=sty, итог='20 деталей; щели только расчётные: зазор 12 мм у корня цельноповоротного стабилизатора (сверху сквозь него видна земля), зазор вращения поворотных сопел, стекло козырька'),
            'ход_разбор': 'Касаний нет: элероны ±20°, закрылки 0-30°, руль ±20°, стабилизатор -20…+12°, складывание консолей 0-100°, поворотные сопла 0-90°, фонарь 0-95°, верхняя створка подъёмных двигателей 0-72°, нижние створки 0-50° (70 задевали низ заборника).',
            'бомбы': bmb, 'бомбы_итог': 'ОФАБ-250 ×4 (своя модель) на четырёх пилонах: не задевают пилоны, крыло, стойки и сопла в положениях 0 и 90° (_bomb.py)',
            'оснастка_sk': SKC, 'game': 'стенд игры: ангар и бой днём без ошибок модели (_проба/dark/стенд); на телефоне не проверено'},
    sketchfab={'title': 'Yakovlev Yak-38M Forger - Game-Ready', 'lead': 'Yak-38M carrier VTOL attack aircraft in weathered dark grey naval paint. Moving parts on their own pivots: swivelling lift-cruise nozzles, lift-engine doors, canopy, folding outer wings, ailerons, flaps, rudder, all-moving stabilizer. D-shaped intakes, cockpit, gear. PBR wear: chips to primer and metal, touch-ups, salt, soot, fictional stencils. Extras: ladder, chocks, covers, RBF streamers.',
               'parts': ['airframe', 'swivel nozzles', 'lift-engine doors', 'canopy', 'folding wings', 'control surfaces', 'stabilizer', 'intakes', 'cockpit', 'gear', 'pylons', 'ladder', 'chocks', 'covers', 'streamers'],
               'tags': ['yak38', 'yakovlev', 'forger', 'vtol', 'navy', 'aircraft', 'military', 'soviet', 'coldwar', 'game-ready', 'pbr', 'blender'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'yak38_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-14). Свои меши по чертежам 01, 09 и фото 02-08 Mark; пиксели фото не использованы. Mark: заборники «D» (прямая стенка у фюзеляжа, наружу полукругом до 1,10 м), высота 0,94…2,12 м, за губой выпуклое плечо к борту без ложбины; крыло на 1,90 м с зализами корня; хвост прежний, корень стабилизатора по обводу хвоста с зазором 12 мм. Окраска в игре - тёмно-серая (05), сине-зелёная (04) - в окраски/blue; флагов нет. Звёзды по правилу 17: на киле в центре без руля, на консоли в центре без элерона. Номер 47 и трафареты придуманы.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for o in SK: bpy.data.objects.remove(o)
pose('canopy', -80); vl.update()
OUT = HERE
exec(compile(src[src.index(CUT):], '_trial_tail', 'exec'))
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
Pp = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
Pp['weapon'] = None; Pp['tex'] = 2048; Pp['nTex'] = 2048; Pp['files']['gear_glb'] = 'yak38_gear.glb'; Pp['files']['sketchfab_glb'] = 'yak38_sketchfab.glb'; Pp['gear_key'] = 'e_yak38_gear'
Pp['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (высота {round(cy, 4)} м и середина длины {round(cb, 4)} м вычтены); pivot_gltf - оси файла до центровки.'
Pp['maps'] = 'metallicRoughnessTexture: R затенение, G шероховатость, B металл; материалы YK_paint (один на всё) и YK_glass (BLEND, clearGlass). В файлах 4096, игре хватает 2048'
V_ = lambda p: 'V(%s, %s, %s)' % (p[0], p[1], p[2])
Pp['stations_game'] = dict(note='Точки на низу пилонов (игра вешает ось бомбы на vis.r + 5 см ниже). По два пилона на консоль (1,33 и 1,91 м от оси): mirror() даёт 4 точки - ОФАБ-250 ×4. Проверено _bomb.py своей моделью ОФАБ-250.',
                           left=P['stations'], models_js='stations: mirror([' + ', '.join(V_(p) for p in P['stations']) + '])')
Pp['nozzles_game'] = P['nozzles']; Pp['nr'] = P['nr']; Pp['nozzle_pivots_game'] = P['nozzle_pivots']
Pp['decoy_game'] = dict(point=P['decoy'], note='предложение: точка отстрела ловушек под хвостом по оси (15,2 м от носа)')
Pp['gearHide'] = ['door_n_r', 'door_n_l', 'door_m_r', 'door_m_l']
Pp['gear_bottom_game_y'] = P['gear_bottom']
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), pivot_game=GG(D['pivot']), axis_gltf=G2(D['axis']), range=list(D['range']) if D.get('range') else None, kind=D.get('kind', 'rotate'), note=D.get('note', ''))
    if D.get('parent'): parts[nm_]['parent'] = D['parent']
Pp['parts'] = parts
Pp['sketchfab_extra'] = 'В yak38_sketchfab.glb и yak38.blend есть наземная оснастка sk_* (стремянка к кабине, колодки со шнуром, заглушки заборников, сопел и ПВД, вымпелы «снять перед полётом» со своими материалами); в файлах игры её нет. Там же фонарь откинут на 80°; в файле игры всё закрыто.'
Pp['gear_note'] = 'yak38_gear.glb: стойки, колёса и открытые створки ниш (door_*_g), только для ангара. Две метки по 1 мм дают тот же центр prepare.js. В основном файле закрытые створки door_n_r/l, door_m_r/l - их прячет gearHide, когда показан файл шасси.'
Pp['skins'] = dict(blue='окраски/blue/yak38_color.png, yak38_orm.png, yak38_normal.png - тёмно-синий верх, зелёный низ (фото 04), красная губа и контур треугольника, жёлтый номер; та же развёртка; Mark: хранить на будущее')
Pp['prepare_recipe'] = "e_yak38: { src: new URL('./own/yak38.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 2048, nTex: () => 2048, pickMesh: /./, own: true, centerX: true }"
Pp['swap_notes'] = ['prepare.js e_yak38 сейчас со старым источником (`${DL}/yak-38.glb`, scale 16.37/16.6, fwd, groups): заменить на prepare_recipe (own/yak38.glb); e_yak38_gear - тот же рецепт с own/yak38_gear.glb.',
                    "models.js e_yak38: stations из stations_game.models_js (4 точки вместо прежних 8), nozzles из nozzles_game (поворотные сопла на 1,04 м от оси), nr, dry: true, racks: true (пилоны в модели), clearGlass: true, gearModel: 'e_yak38_gear', gearHide из поля gearHide; META.e_yak38_gear как у e_il28_gear.",
                    'Убрать прежнего автора e_yak38 из games/airdef/models/credits.js (sketchfab.com/3d-models/yak-38-7cf41515…) и из CREDITS.md, если он там есть.',
                    'Ангар берёт camo/e_yak38.hi.glb (файл есть): заменить или убрать строку из hi-списка, иначе в ангаре останется старая модель.',
                    'После подмены: seats-gen.js (в seats-data.js старая запись e_yak38 с версией 20261022k), миниатюра, пара ktx (e_yak38 и e_yak38_gear).',
                    'Поворотные сопла в игре можно поворачивать вниз при посадке и взлёте: оси в nozzle_pivots_game (0 - назад, 90 - вниз); сейчас точки nozzles даны для положения 0.',
                    'Складывание консолей (wing_o_*) - только для стоянки на корабле, в бою не складывать; элероны - дети консолей.',
                    'Окраска сине-зелёная лежит в окраски/blue (Mark: хранить на будущее).']
json.dump(Pp, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'шасси низ', Pp['gear_bottom_game_y'], 'точки', Pp['stations_game']['models_js'], 'сопла', Pp['nozzles_game'])
