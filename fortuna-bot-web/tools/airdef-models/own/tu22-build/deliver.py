# deliver.py - сдача Ту-22: превью, файл для Sketchfab и .blend (стойки выпущены, фонарь и люк стрелка открыты, наземная оснастка sk_*), файл игры (без стоек и sk_*,
# всё закрыто), файл шасси для ангара, точки.json, паспорт и отчёт. После build.py в той же сессии:
#   TU_STAGE=4 Blender -b --factory-startup --python build.py --python deliver.py
# Карты tu22_color.png, tu22_normal.png, tu22_orm.png лежат в папке модели (paint.py с TU_OUT=папка модели, TU_TEX=4096, TU_SCHEME=aged). Развёртка - _проба/uv.npz.
import json, math, os, sys
import bmesh
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Ту-22'
sys.path.insert(0, HERE)
os.environ['TU_MAPS'] = HERE; os.environ['TU_OUT'] = HERE; os.environ['TU_ONLY'] = '__никакой__'; os.environ.setdefault('TU_SPP', '96')
src = open(os.path.join(HERE, '_trial.py'), encoding='utf-8').read()
CUT = '# файл для игры: без стоек и створок шасси'
exec(compile(src[:src.index(CUT)], '_trial_head', 'exec'))      # материалы, небо, земля, камера; пробные снимки пропущены (IL_ONLY)
ONLY.clear(); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
from mathutils.bvhtree import BVHTree


# ── наземная оснастка только для Sketchfab (правило 14): стремянка к кабине лётчика, колодки со шнуром, заглушки заборников и сопел, вымпелы «снять перед полётом» ──
def pmat(name, rgb, rough, metal=0.0, img=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True; b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if img:
        t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.join(HERE, img), check_existing=True); t.image.pack(); m.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
    return m


M_LAD = pmat('TU_sk_ladder', (0.30, 0.36, 0.26), 0.62, 0.2); M_TRD = pmat('TU_sk_tread', (0.05, 0.05, 0.05), 0.85); M_CHK = pmat('TU_sk_chock', (0.42, 0.30, 0.18), 0.85)
M_FLG = pmat('TU_sk_flag', (1, 1, 1), 0.82, 0.0, 'sk_rbf.png'); M_ROP = pmat('TU_sk_rope', (0.10, 0.10, 0.10), 0.9); M_CVR = pmat('TU_sk_cover', (0.40, 0.08, 0.06), 0.88)
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
# стремянка к крышке лётчика у левого борта кабины: крюки на порог горба фонаря, ноги на земле
a_l = 8.75; zs = g.fus_top(a_l, 0.50) + 0.02; xs = -(g.CAN_T[1](a_l) + 0.08)
top = lambda a: P3(a, xs - 0.05, zs - 0.06); bot = lambda a: P3(a, -2.10, GZ + 0.02)
bm = bmesh.new()
for a_ in (a_l - 0.24, a_l + 0.24):
    tube(bm, top(a_), bot(a_), 0.026); tube(bm, top(a_), P3(a_, xs + 0.07, zs + 0.03), 0.018); tube(bm, P3(a_, xs + 0.07, zs + 0.03), P3(a_, xs + 0.07, zs - 0.05), 0.016)
NST = 16
for k in range(1, NST):
    t = k / NST; tube(bm, top(a_l - 0.24).lerp(bot(a_l - 0.24), t), top(a_l + 0.24).lerp(bot(a_l + 0.24), t), 0.016)
tube(bm, top(a_l - 0.24).lerp(bot(a_l - 0.24), 0.55) + Vector((0, 0, 0)), P3(a_l - 0.24, -1.15, GZ + 0.02), 0.020); tube(bm, top(a_l + 0.24).lerp(bot(a_l + 0.24), 0.55), P3(a_l + 0.24, -1.15, GZ + 0.02), 0.020)   # подкосы
obj('sk_ladder', bm, M_LAD)
bm = bmesh.new()
for k in range(1, NST):
    t = k / NST; boxm(bm, top(a_l).lerp(bot(a_l), t) + Vector((0, 0, 0.018)), (0.10, 0.44, 0.012))
for a_ in (a_l - 0.24, a_l + 0.24): boxm(bm, bot(a_) + Vector((0, 0, 0.01)), (0.12, 0.08, 0.02))
obj('sk_ladder_treads', bm, M_TRD)
def chock(name, a0, x0, w, dirn, h=0.15, l_=0.24):
    bm = bmesh.new(); pts = [(a0, GZ), (a0 + dirn * l_, GZ), (a0, GZ + h)]
    vs = [bm.verts.new(P3(a, x0 + s * w / 2, z)) for s in (-1, 1) for a, z in pts]
    bm.faces.new(vs[:3]); bm.faces.new(vs[3:][::-1])
    for i in range(3):
        j = (i + 1) % 3; bm.faces.new((vs[i], vs[j], vs[3 + j], vs[3 + i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); return obj(name, bm, M_CHK)
import tu22_gear as gr_
MGa0 = gr_.MG['a'] - gr_.MG['base'] / 2; MGa1 = gr_.MG['a'] + gr_.MG['base'] / 2
for nm, a0_, a1_, x_, rw_, w_ in (('n', gr_.NG['a'], gr_.NG['a'], 0.0, gr_.NG['rw'], 0.66), ('m_r', MGa0, MGa1, gr_.MG['x'], gr_.MG['rw'], 0.86), ('m_l', MGa0, MGa1, -gr_.MG['x'], gr_.MG['rw'], 0.86)):
    chock('sk_chock_' + nm + '_f', a0_ - rw_ - 0.02, x_, w_, -1); chock('sk_chock_' + nm + '_b', a1_ + rw_ + 0.02, x_, w_, 1)
    bm = bmesh.new(); tube(bm, P3(a0_ - rw_ - 0.08, x_ + w_ / 2 + 0.03, GZ + 0.04), P3(a1_ + rw_ + 0.08, x_ + w_ / 2 + 0.03, GZ + 0.04), 0.007, 6); obj('sk_chock_' + nm + '_rope', bm, M_ROP)
def plug(name, prof, cx, zc, n=48):
    bm = bmesh.new()
    rings = [[P3(a, cx + r * math.sin(2 * math.pi * k / n), zc - r * math.cos(2 * math.pi * k / n)) for k in range(n)] for a, r in prof]
    vs = [[bm.verts.new(p) for p in r] for r in rings]
    for i in range(len(vs) - 1):
        for k in range(n): bm.faces.new((vs[i][k], vs[i][(k + 1) % n], vs[i + 1][(k + 1) % n], vs[i + 1][k]))
    bm.faces.new(vs[0][::-1]); bm.faces.new(vs[-1]); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); return obj(name, bm, M_CVR)
SL = g.LIP_SLIDE
for sx, s_ in ((1, 'r'), (-1, 'l')):
    cx = sx * g.NAC_X
    plug('sk_cover_in_' + s_, ((29.80 - SL, g.INL_R - 0.03), (29.62 - SL, g.INL_R - 0.004), (29.56 - SL, g.INL_R + 0.03), (29.52 - SL, g.INL_R - 0.05)), cx, g.NAC_Z)   # губа выдвинута: пробка в ней
    plug('sk_cover_out_' + s_, ((40.20, g.NOZ_R - 0.03), (40.40, g.NOZ_R - 0.006), (40.46, g.NOZ_R + 0.02), (40.50, g.NOZ_R - 0.05)), cx, g.NAC_Z)
plug('sk_cover_probe', ((g.PRB['tip'] + 0.20, 0.060), (g.PRB['tip'] + 0.05, 0.080), (g.PRB['tip'] - 0.04, 0.074), (g.PRB['tip'] - 0.08, 0.030)), 0.0, g.probe_z(), 24)
def flag(name, p0, ln=0.40, wd=0.075, lean=0.10):
    bm = bmesh.new(); d = Vector((0, -lean, -1)).normalized() * ln
    v = [bm.verts.new(p0 + Vector((-wd / 2, 0, 0))), bm.verts.new(p0 + Vector((wd / 2, 0, 0))), bm.verts.new(p0 + d + Vector((wd / 2, 0, 0))), bm.verts.new(p0 + d + Vector((-wd / 2, 0, 0)))]
    f1 = bm.faces.new(v); f2 = bm.faces.new([bm.verts.new(q.co) for q in v[::-1]]); uv = bm.loops.layers.uv.new('UVMap')
    for f, uvs in ((f1, ((0, 1), (1, 1), (1, 0), (0, 0))), (f2, ((0, 0), (1, 0), (1, 1), (0, 1)))):
        for l, c in zip(f.loops, uvs): l[uv].uv = c
    return obj(name, bm, M_FLG)
for sx, s_ in ((1, 'r'), (-1, 'l')):
    flag('sk_flag_gear_m_' + s_, P3(gr_.MG['piv'][0] + 0.55, sx * (gr_.MG['x'] + 0.16), gr_.MG['piv'][1] - 1.10), 0.40)
    flag('sk_flag_cover_' + s_, P3(29.55 - SL, sx * g.NAC_X, g.NAC_Z - g.INL_R + 0.02), 0.34)
    flag('sk_flag_noz_' + s_, P3(40.44, sx * g.NAC_X, g.NAC_Z - g.NOZ_R + 0.02), 0.34)
flag('sk_flag_gear_n', P3(gr_.NG['piv'][0] - 0.30, 0.10, -1.55), 0.40)
flag('sk_flag_probe', P3(g.PRB['tip'] + 0.02, 0.0, g.probe_z() - 0.07), 0.34)
vl.update()
def T_(o): return BVHTree.FromPolygons([o.matrix_world @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
# стойки выпущены (они в файле), фонарь откинут вправо, люк стрелка опущен (06, 07) - для превью, Sketchfab и .blend
pose('hatch_pilot', 50); pose('intake_r', g.LIP_SLIDE); pose('intake_l', g.LIP_SLIDE); vl.update()
SKC = {}
for s_ in SK:
    t_ = T_(s_); hit = sorted({o.name for o in sc.objects if o.type == 'MESH' and o not in SK and not o.name.startswith('v_') and t_.overlap(T_(o))}); SKC[s_.name] = hit
    print('ОСНАСТКА', s_.name, 'касается', hit or 'ничего')
prev = []
Y = lambda a: g.L / 2 - a
for nm, tg, dv, dist, ln in (('превью_1_общий.png', (0.0, 2.0, -0.8), (-0.60, 0.70, 0.30), 58.0, 50), ('превью_2_сбоку.png', (0.0, 0.0, -0.6), (-1.0, 0.02, 0.06), 60.0, 50),
                             ('превью_3_сверху.png', (0.0, 0.0, 0.0), (0.12, -0.15, 1.0), 66.0, 50), ('превью_4_корма.png', (0.0, Y(38.5), 1.0), (-0.55, -0.78, 0.22), 10.0, 50),
                             ('превью_5_нос.png', (0.0, Y(6.0), 0.2), (-0.60, 0.72, 0.25), 12.0, 50), ('превью_6_гондолы.png', (0.0, Y(31.0), 1.6), (-0.60, 0.75, 0.25), 11.0, 50),
                             ('превью_7_сзади.png', (0.0, -3.0, 0.0), (0.45, -0.88, 0.14), 52.0, 55)):
    shot(nm, tg, dv, dist, lens=ln, wd=1920, h=1080); prev.append(nm)
go.hide_render = True; shot('превью_8_снизу.png', (0.0, Y(21.0), -1.4), (-0.35, 0.25, -0.90), 30.0, lens=45, wd=1920, h=1080); prev.append('превью_8_снизу.png'); go.hide_render = False
for n_ in ('bay_r', 'bay_l'): pose(n_, g.BAY_OPEN)
vl.update(); go.hide_render = True; shot('превью_9_отсек.png', (0.0, Y(20.5), -1.3), (-0.35, 0.30, -0.89), 14.0, wd=1920, h=1080); prev.append('превью_9_отсек.png'); go.hide_render = False
for n_ in ('bay_r', 'bay_l'): pose(n_, -g.BAY_OPEN)
vl.update()
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
COLD = {k: dict(касаний=v['касаний'], глубина_мм=v.get('глубина_мм')) for k, v in col.items()}
sty = {}
try:
    D_ = json.load(open(os.path.join(HERE, '_стыки2', '_стыки.json'), encoding='utf-8'))['детали']; sty = {k: v['плохо'] for k, v in D_.items() if v.get('плохо')}
except Exception as e: print('нет итога стыков:', e)
bmb = {}
try: bmb = json.load(open(os.path.join(HERE, '_снимки', 'bombs.json'), encoding='utf-8'))
except Exception as e: print('нет итога бомб:', e)
mk.export(os.path.join(HERE, 'tu22_sketchfab.glb'), os.path.join(HERE, 'tu22.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'tu22_sketchfab.glb')) // 1024, 'КБ')
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_tu22', weapon='', name='Ту-22', name_en='Tupolev Tu-22', glb='tu22.glb', blend='tu22.blend', rev=1,
    build=['build.py', 'tu22_base.py', 'tu22_geo.py', 'tu22_detail.py', 'tu22_gear.py', 'uv_tu.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_bomb.py', '_стенд.js', 'deliver.py', 'sk_rbf.png'], previews_=prev,
    checks={'ход': COLD, 'стыки': dict(плохо=sty, итог='32 детали; щель только у поворотной кормовой установки (зазор гнезда для вращения)'),
            'ход_разбор': 'Касаний нет: элероны ±20°, закрылки 0-28°, руль ±20°, стабилизатор -22…+12°, губы заборников +0,35 м, турель ±40° со стволом -20…+30°, створки отсека 95°, люки, крышка парашютов. Оси закрылков и руля скошены - выемки и носки вытянуты по потоку на 1/cos(скоса). Уборка стоек не рабочая (ниш нет): в игре шасси только выпущено, файл ангара.',
            'бомбы': bmb, 'бомбы_итог': 'ФАБ-1000 ×4 (своя модель): при закрытых створках не задевают створки, стенки, держатели и друг друга; при открытых створках на 95° падают на 2,5 м свободно (_bomb.py)',
            'оснастка_sk': SKC, 'game': 'стенд игры: ангар и бой днём и вечером без ошибок модели (_проба/aged/стенд); на телефоне не проверено'},
    sketchfab={'title': 'Tupolev Tu-22 Blinder - Game-Ready', 'lead': 'Tu-22 supersonic bomber in old weathered bare aluminium. Moving parts on their own pivots: tail turret and cannon, bomb bay doors, crew hatches, sliding intake lips, all-moving stabilizer, ailerons, flaps, rudder, chute lid. Bomb bay with racks, cockpits, gear in wing pods. PBR wear: oxide, corrosion at rivets, soot, oil, fictional stencils. Extras: ladder, chocks, covers, RBF streamers.',
               'parts': ['airframe', 'tail turret', 'cannon', 'bomb bay', 'bay doors', 'crew hatches', 'intake lips', 'stabilizer', 'control surfaces', 'cockpits', 'gear', 'ladder', 'chocks', 'covers', 'streamers'],
               'tags': ['tu22', 'tupolev', 'blinder', 'bomber', 'supersonic', 'aircraft', 'military', 'soviet', 'coldwar', 'game-ready', 'pbr', 'blender'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'tu22_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-13). Свои меши по чертежам tu22_05, tu22_11 и фото 01-10 Mark; пиксели фото не использованы. Чертёж 05 по длине короче на 5 % - растянут до 41,6 м. Звёзды нарисованы здесь, номер 37 и трафареты придуманы. Mark: корма плавно сходится к пушечной установке; штанга дозаправки выходит из обтекателя на носу; звёзды по центру киля и консолей; окраска в игре - старый алюминий, песок хранится в окраски/desert, «Сгущёнка» магазина - в окраски/milk; звезда на киле - в центре площади киля.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# дальше файл игры и файл шасси: без оснастки, всё закрыто (хвост _trial.py)
for o in SK: bpy.data.objects.remove(o)
pose('hatch_pilot', -50); pose('intake_r', -g.LIP_SLIDE); pose('intake_l', -g.LIP_SLIDE); vl.update()
OUT = HERE
exec(compile(src[src.index(CUT):], '_trial_tail', 'exec'))
# паспорт: всё в осях игры (после центровки prepare.js по габаритам)
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
Pp = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
Pp['weapon'] = None; Pp['tex'] = 2048; Pp['nTex'] = 2048; Pp['files']['gear_glb'] = 'tu22_gear.glb'; Pp['files']['sketchfab_glb'] = 'tu22_sketchfab.glb'; Pp['gear_key'] = 'e_tu22_gear'
Pp['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (высота {round(cy, 4)} м и середина длины {round(cb, 4)} м вычтены); pivot_gltf - оси файла до центровки.'
Pp['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы TU_paint (один на всё) и TU_glass (BLEND, clearGlass). В файлах 4096, игре хватает 2048'
V_ = lambda p: 'V(%s, %s, %s)' % (p[0], p[1], p[2])
Pp['stations_game'] = dict(note='Точки на низу замков держателей в отсеке (игра вешает ось бомбы на vis.r + 5 см ниже). Два ряда по две бомбы (18,55 и 22,35 м от носа, ±0,40 м): mirror() даёт 4 точки - ровно ФАБ-1000 ×4. Проверено _bomb.py своей моделью ФАБ-1000.',
                           left=P['stations'], models_js='stations: mirror([' + ', '.join(V_(p) for p in P['stations']) + '])')
Pp['nozzles_game'] = P['nozzles']; Pp['nr'] = P['nr']
DO = {}
for n_ in ('bay_l', 'bay_r'):
    D = g.PARTS[n_]; DO[n_] = [GG(D['pivot']), G2(D['axis']), g.BAY_OPEN]
Pp['bay_game'] = dict(doors=DO, sides=dict(L=['bay_l'], R=['bay_r']), note='формат поля bay у e_b2/e_f35/e_il28: [ось в осях игры, направление, угол]; створки - отдельные объекты bay_l, bay_r; в prepare нужны groups (prepare_recipe)')
Pp['gear_bottom_game_y'] = P['gear_bottom']
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), pivot_game=GG(D['pivot']), axis_gltf=G2(D['axis']), range=list(D['range']) if D.get('range') else None, kind=D.get('kind', 'rotate'), note=D.get('note', ''))
    if D.get('parent'): parts[nm_]['parent'] = D['parent']
Pp['parts'] = parts
Pp['sketchfab_extra'] = 'В tu22_sketchfab.glb и tu22.blend есть наземная оснастка sk_* (стремянка к крышке лётчика, колодки со шнуром, заглушки заборников, сопел и штанги, вымпелы «снять перед полётом» со своими материалами); в файлах игры её нет. Там же крышка лётчика открыта на 50°, губы заборников выдвинуты (стоянка); в файле игры всё закрыто.'
Pp['gear_note'] = 'tu22_gear.glb: стойки, колёса и открытые створки шасси, только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. Уборку стоек не делать: ниш нет.'
Pp['skins'] = dict(desert='окраски/desert/tu22_color.png, tu22_orm.png, tu22_normal.png - песок, бурый и зелёный пятнами, голубой низ, та же развёртка; Mark: хранить на будущее', milk='окраски/milk/tu22_color.png, tu22_orm.png, tu22_normal.png - камуфляж магазина «Сгущёнка» (e_tu22:milk) перенесён на новую развёртку (Mark 2026-11-13): тот же рисунок этикетки, что в Камуфляжи/e_tu22, без текста; прежний e_tu22_milk.png от старой модели к новой не подходит')
Pp['prepare_recipe'] = "e_tu22: { src: new URL('./own/tu22.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 2048, nTex: () => 2048, pickMesh: /./, own: true, centerX: true, groups: (c) => { const m = /(^|\\/)(bay_[lr])(\\/|\\||$)/.exec(c.path); return m ? m[2] : 'body'; } }"
Pp['swap_notes'] = ['prepare.js e_tu22 сейчас со старым источником (`${DL}/tu22.glb`, scale 23.17/24.06, fwd, groups шасси): заменить на prepare_recipe (own/tu22.glb, groups bay_l/bay_r для физического отсека); e_tu22_gear - тот же рецепт с own/tu22_gear.glb без groups.',
                    "models.js e_tu22: stations из stations_game.models_js (4 точки вместо прежних 8), nozzles из nozzles_game, nr, bay из bay_game, clearGlass: true, gearModel: 'e_tu22_gear'; META.e_tu22_gear как у e_il28_gear.",
                    'Убрать прежнего автора модели e_tu22 из games/airdef/models/credits.js (запись sketchfab.com/3d-models/tu22-189799dc…) и из CREDITS.md, если он там есть.',
                    'Ангар берёт camo/e_tu22.hi.glb (файл есть): заменить или убрать строку из hi-списка, иначе в ангаре останется старая модель.',
                    'Камуфляж магазина e_tu22:milk («Сгущёнка»): брать окраски/milk/tu22_color.png (+ orm, normal) - он уже на новой развёртке; старый Камуфляжи/e_tu22/e_tu22_milk.png и camo-модель от старой развёртки больше не нужны.',
                    'После подмены: миниатюра (металл - с &paint=0, как у F-100D), пара ktx (e_tu22 и e_tu22_gear); seats-gen не нужен - подвеска внутренняя.',
                    'Длина 41,6 м до конца ствола кормовой пушки, размах 23,2 м; прежняя модель 41,22 × 23,17.',
                    'Подвижные части в игре не анимируются, кроме створок отсека (bay); губы заборников (kind slide, ход 0,35 м вперёд), стабилизатор, рули, турель, люки - в parts на будущее.',
                    'Окраска песок лежит в окраски/desert (Mark: хранить на будущее).']
json.dump(Pp, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'шасси низ', Pp['gear_bottom_game_y'], 'точки', Pp['stations_game']['models_js'], 'сопла', Pp['nozzles_game'])
