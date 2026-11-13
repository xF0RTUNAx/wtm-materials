# deliver.py - сдача Ил-28: превью, файл для Sketchfab и .blend (стойки выпущены, фонарь и люк стрелка открыты, наземная оснастка sk_*), файл игры (без стоек и sk_*,
# всё закрыто), файл шасси для ангара, точки.json, паспорт и отчёт. После build.py в той же сессии:
#   IL_STAGE=4 Blender -b --factory-startup --python build.py --python deliver.py
# Карты il28_color.png, il28_normal.png, il28_orm.png лежат в папке модели (paint.py с IL_OUT=папка модели, IL_TEX=4096, IL_SCHEME=metal). Развёртка - _проба/uv.npz.
import json, math, os, sys
import bmesh
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Ил-28'
sys.path.insert(0, HERE)
os.environ['IL_MAPS'] = HERE; os.environ['IL_OUT'] = HERE; os.environ['IL_ONLY'] = '__никакой__'; os.environ.setdefault('IL_SPP', '96')
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


M_LAD = pmat('IL_sk_ladder', (0.30, 0.36, 0.26), 0.62, 0.2); M_TRD = pmat('IL_sk_tread', (0.05, 0.05, 0.05), 0.85); M_CHK = pmat('IL_sk_chock', (0.42, 0.30, 0.18), 0.85)
M_FLG = pmat('IL_sk_flag', (1, 1, 1), 0.82, 0.0, 'sk_rbf.png'); M_ROP = pmat('IL_sk_rope', (0.10, 0.10, 0.10), 0.9); M_CVR = pmat('IL_sk_cover', (0.40, 0.08, 0.06), 0.88)
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
# стремянка у левого борта кабины лётчика (фонарь откидывается вправо): крюки на порог, ноги на земле
a_l = 3.30; zs = g.SILL(a_l) + 0.02; xs = -(g.CAN_T[1](a_l) + 0.05)
top = lambda a: P3(a, xs - 0.05, zs - 0.06); bot = lambda a: P3(a, -1.45, GZ + 0.02)
bm = bmesh.new()
for a_ in (a_l - 0.22, a_l + 0.22):
    tube(bm, top(a_), bot(a_), 0.024); tube(bm, top(a_), P3(a_, xs + 0.07, zs + 0.03), 0.018); tube(bm, P3(a_, xs + 0.07, zs + 0.03), P3(a_, xs + 0.07, zs - 0.05), 0.016)
for k in range(1, 10):
    t = k / 10; tube(bm, top(a_l - 0.22).lerp(bot(a_l - 0.22), t), top(a_l + 0.22).lerp(bot(a_l + 0.22), t), 0.016)
obj('sk_ladder', bm, M_LAD)
bm = bmesh.new()
for k in range(1, 10):
    t = k / 10; boxm(bm, top(a_l).lerp(bot(a_l), t) + Vector((0, 0, 0.018)), (0.10, 0.40, 0.012))
for a_ in (a_l - 0.22, a_l + 0.22): boxm(bm, bot(a_) + Vector((0, 0, 0.01)), (0.12, 0.08, 0.02))
obj('sk_ladder_treads', bm, M_TRD)
# колодки: деревянный клин по обе стороны каждого колеса и шнур между ними
def chock(name, a0, x0, w, dirn, h=0.14, l_=0.22):
    bm = bmesh.new(); pts = [(a0, GZ), (a0 + dirn * l_, GZ), (a0, GZ + h)]
    vs = [bm.verts.new(P3(a, x0 + s * w / 2, z)) for s in (-1, 1) for a, z in pts]
    bm.faces.new(vs[:3]); bm.faces.new(vs[3:][::-1])
    for i in range(3):
        j = (i + 1) % 3; bm.faces.new((vs[i], vs[j], vs[3 + j], vs[3 + i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); return obj(name, bm, M_CHK)
import il28_gear as gr_
for nm, a_, x_, rw_, w_ in (('n', gr_.NG['a'], 0.0, gr_.NG['rw'], 0.60), ('m_r', gr_.MG['a'], gr_.MG['x'], gr_.MG['rw'], 0.40), ('m_l', gr_.MG['a'], -gr_.MG['x'], gr_.MG['rw'], 0.40)):
    chock('sk_chock_' + nm + '_f', a_ - rw_ - 0.02, x_, w_, -1); chock('sk_chock_' + nm + '_b', a_ + rw_ + 0.02, x_, w_, 1)
    bm = bmesh.new(); tube(bm, P3(a_ - rw_ - 0.07, x_ + w_ / 2 + 0.03, GZ + 0.04), P3(a_ + rw_ + 0.07, x_ + w_ / 2 + 0.03, GZ + 0.04), 0.007, 6); obj('sk_chock_' + nm + '_rope', bm, M_ROP)
# заглушки: брезентовые пробки в заборниках и на соплах
for sx, s_ in ((1, 'r'), (-1, 'l')):
    bm = bmesh.new(); cx = sx * g.NAC_X; zc = g.nac_zc(g.NAC_A0); n = 40
    rings = [[P3(a, cx + r * math.sin(2 * math.pi * k / n), zc - r * math.cos(2 * math.pi * k / n)) for k in range(n)] for a, r in ((5.30, g.INL_R - 0.03), (5.13, g.INL_R - 0.005), (5.07, g.INL_R + 0.02), (5.04, g.INL_R - 0.05))]
    vs = [[bm.verts.new(p) for p in r] for r in rings]
    for i in range(len(vs) - 1):
        for k in range(n): bm.faces.new((vs[i][k], vs[i][(k + 1) % n], vs[i + 1][(k + 1) % n], vs[i + 1][k]))
    bm.faces.new(vs[0][::-1]); bm.faces.new(vs[-1]); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); obj('sk_cover_in_' + s_, bm, M_CVR)
    bm = bmesh.new(); zc = g.nac_zc(g.NAC_A1)
    rings = [[P3(a, cx + r * math.sin(2 * math.pi * k / n), zc - r * math.cos(2 * math.pi * k / n)) for k in range(n)] for a, r in ((12.45, g.NOZ_R - 0.02), (12.64, g.NOZ_R - 0.004), (12.70, g.NOZ_R + 0.015), (12.74, g.NOZ_R - 0.04))]
    vs = [[bm.verts.new(p) for p in r] for r in rings]
    for i in range(len(vs) - 1):
        for k in range(n): bm.faces.new((vs[i][k], vs[i][(k + 1) % n], vs[i + 1][(k + 1) % n], vs[i + 1][k]))
    bm.faces.new(vs[0][::-1]); bm.faces.new(vs[-1]); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); obj('sk_cover_out_' + s_, bm, M_CVR)
# вымпелы: ПВД на законцовках, передняя и основные стойки, заглушки
def flag(name, p0, ln=0.40, wd=0.075, lean=0.10):
    bm = bmesh.new(); d = Vector((0, -lean, -1)).normalized() * ln
    v = [bm.verts.new(p0 + Vector((-wd / 2, 0, 0))), bm.verts.new(p0 + Vector((wd / 2, 0, 0))), bm.verts.new(p0 + d + Vector((wd / 2, 0, 0))), bm.verts.new(p0 + d + Vector((-wd / 2, 0, 0)))]
    f1 = bm.faces.new(v); f2 = bm.faces.new([bm.verts.new(q.co) for q in v[::-1]]); uv = bm.loops.layers.uv.new('UVMap')
    for f, uvs in ((f1, ((0, 1), (1, 1), (1, 0), (0, 0))), (f2, ((0, 0), (1, 0), (1, 1), (0, 1)))):
        for l, c in zip(f.loops, uvs): l[uv].uv = c
    return obj(name, bm, M_FLG)
for sx, s_ in ((1, 'r'), (-1, 'l')):
    flag('sk_flag_pitot_' + s_, P3(7.45, sx * (g.XTIP - 0.20), g.wz(g.XTIP - 0.20) - 0.02), 0.36, 0.06, 0.05)
    flag('sk_flag_gear_m_' + s_, P3(gr_.MG['a'] - 0.72, sx * gr_.MG['x'], -0.95), 0.34)
    flag('sk_flag_cover_' + s_, P3(5.02, sx * g.NAC_X, g.nac_zc(5.1) - 0.45), 0.30)
flag('sk_flag_gear_n', P3(gr_.NG['a'] - 0.08, 0.08, -1.05), 0.36)
vl.update()
def T_(o): return BVHTree.FromPolygons([o.matrix_world @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
# стойки выпущены (они в файле), фонарь откинут вправо, люк стрелка опущен (06, 07) - для превью, Sketchfab и .blend
pose('canopy', 70); pose('hatch', g.HATCH_OPEN); vl.update()
SKC = {}
for s_ in SK:
    t_ = T_(s_); hit = sorted({o.name for o in sc.objects if o.type == 'MESH' and o not in SK and not o.name.startswith('v_') and t_.overlap(T_(o))}); SKC[s_.name] = hit
    print('ОСНАСТКА', s_.name, 'касается', hit or 'ничего')
prev = []
Y = lambda a: g.L / 2 - a
for nm, tg, dv, dist, ln in (('превью_1_общий.png', (0.0, 1.0, -0.4), (-0.60, 0.70, 0.30), 27.0, 50), ('превью_2_сбоку.png', (0.0, 0.0, -0.3), (-1.0, 0.02, 0.06), 29.0, 50),
                             ('превью_3_сверху.png', (0.0, 0.0, 0.0), (0.12, -0.15, 1.0), 31.0, 50), ('превью_4_хвост.png', (0.0, Y(16.6), 0.4), (-0.55, -0.78, 0.22), 7.5, 50),
                             ('превью_5_нос.png', (0.0, Y(2.0), 0.2), (-0.58, 0.74, 0.30), 7.0, 50), ('превью_6_гондола.png', (-3.4, Y(7.5), -0.2), (-0.55, 0.80, 0.12), 8.0, 50),
                             ('превью_7_сзади.png', (0.0, -4.0, 0.0), (0.40, -0.90, 0.14), 24.0, 55)):
    shot(nm, tg, dv, dist, lens=ln, wd=1920, h=1080); prev.append(nm)
go.hide_render = True; shot('превью_8_снизу.png', (0.0, Y(9.5), -0.8), (-0.35, 0.25, -0.90), 15.0, lens=45, wd=1920, h=1080); prev.append('превью_8_снизу.png'); go.hide_render = False
for n_ in ('bay_r', 'bay_l'): pose(n_, g.BAY_OPEN)
vl.update(); go.hide_render = True; shot('превью_9_отсек.png', (0.0, Y(10.6), -0.7), (-0.35, 0.30, -0.89), 10.0, wd=1920, h=1080); prev.append('превью_9_отсек.png'); go.hide_render = False
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
    D_ = json.load(open(os.path.join(HERE, '_стыки', '_стыки.json'), encoding='utf-8'))['детали']; sty = {k: v['плохо'] for k, v in D_.items() if v.get('плохо')}
except Exception as e: print('нет итога стыков:', e)
bmb = {}
try: bmb = json.load(open(os.path.join(HERE, '_снимки', 'bombs.json'), encoding='utf-8'))
except Exception as e: print('нет итога бомб:', e)
mk.export(os.path.join(HERE, 'il28_sketchfab.glb'), os.path.join(HERE, 'il28.blend')); print('Sketchfab', os.path.getsize(os.path.join(HERE, 'il28_sketchfab.glb')) // 1024, 'КБ')
R = mk.passport(os.path.join(HERE, 'ПАСПОРТ.json'), key='e_il28', weapon='', name='Ил-28', name_en='Ilyushin Il-28', glb='il28.glb', blend='il28.blend', rev=1,
    build=['build.py', 'il28_geo.py', 'il28_detail.py', 'il28_gear.py', 'uv_il.py', 'gbuf.py', 'paint.py', '_trial.py', '_collide.py', '_bomb.py', '_стенд.js', 'deliver.py', 'sk_rbf.png'], previews_=prev,
    checks={'ход': COLD, 'стыки': dict(плохо=sty, итог='20 подвижных деталей; отмечены только узкие щели 4-6 мм у дуг фонаря и козырька'),
            'ход_разбор': 'Касаний нет, кроме прилегания фонаря к порогу в закрытом положении (6 мм до 3,5°). Турель: азимут ±70°, стволы -35…+30° (выше +30° при повороте за ±44° задевают основание кабины стрелка) - проверено по всему полю. Уборка стоек в гондолы и фюзеляж не рабочая (ниш нет): в игре шасси только выпущено, файл ангара.',
            'бомбы': bmb, 'бомбы_итог': 'ФАБ-500М-62 ×4 и ФАБ-250 ×8 (свои модели): при закрытых створках не задевают створки, стенки, держатели и друг друга; при открытых створках на 95° падают на 2,5 м свободно (_bomb.py)',
            'оснастка_sk': SKC, 'game': 'стенд игры: ангар и бой днём и вечером без ошибок модели (_проба/стенд); на телефоне не проверено'},
    sketchfab={'title': 'Ilyushin Il-28 Bomber - Game-Ready', 'lead': 'Il-28 jet bomber in weathered bare metal. Moving parts on their own pivots: tail turret and twin cannons, bomb bay doors, gunner hatch, canopy, ailerons, flaps, elevators, rudder. Glazed navigator nose, three crew stations, bomb bay with racks. Layered PBR wear: oxidised panels, stains, soot, fictional stencils. Display extras: ladder, chocks, covers, RBF streamers.',
               'parts': ['airframe', 'tail turret', 'cannons', 'bomb bay', 'bay doors', 'gunner hatch', 'canopy', 'control surfaces', 'cockpits', 'gear', 'ladder', 'chocks', 'covers', 'streamers'],
               'tags': ['il28', 'ilyushin', 'bomber', 'jet', 'aircraft', 'military', 'soviet', 'coldwar', 'game-ready', 'pbr', 'blender', 'turret'],
               'dimensions': f'length {LEN:.2f} m, span {SPAN:.2f} m, height {HGT:.2f} m on gear', 'textures': '4096 px colour, normal and metallic-roughness maps', 'based': 'Built from scratch in Blender from reference images.', 'glb': 'il28_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-13). Свои меши по чертежу il28_01, профилям 02/03 и фото 04-11 Mark; пиксели фото не использованы. Звёзды нарисованы здесь, номер 41 и трафареты придуманы. Mark: гондолы уменьшены дважды (1,38 × 1,49 м), кабина стрелка - усечённая пирамида стёкол на основании, которое продолжает хвост и ложится на шар турели; окраска в игре - металл, зимняя хранится в окраски/winter.')
R['model'].update(length_m=LEN, span_m=SPAN, height_m=HGT); json.dump(R, open(os.path.join(HERE, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# дальше файл игры и файл шасси: без оснастки, всё закрыто (хвост _trial.py)
for o in SK: bpy.data.objects.remove(o)
pose('canopy', -70); pose('hatch', -g.HATCH_OPEN); vl.update()
OUT = HERE
exec(compile(src[src.index(CUT):], '_trial_tail', 'exec'))
# паспорт: всё в осях игры (после центровки prepare.js по габаритам)
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
Pp = json.load(open(os.path.join(HERE, 'ПАСПОРТ.json'), encoding='utf-8'))
Pp['weapon'] = None; Pp['tex'] = 2048; Pp['nTex'] = 2048; Pp['files']['gear_glb'] = 'il28_gear.glb'; Pp['files']['sketchfab_glb'] = 'il28_sketchfab.glb'; Pp['gear_key'] = 'e_il28_gear'
Pp['axes'] = f'Координаты с окончанием _game - оси игры после prepare.js: нос -Z, верх +Y, центр по габаритам файла игры (высота {round(cy, 4)} м и середина длины {round(cb, 4)} м вычтены: стволы турели удлиняют хвост); pivot_gltf - оси файла до центровки.'
Pp['maps'] = 'metallicRoughnessTexture: R затенение (1 открыто, 0 щель), G шероховатость, B металл; материалы IL_paint (один на всё) и IL_glass (BLEND, clearGlass, жёлтый оттенок - пожелтевшее остекление). В файлах 4096, игре хватает 2048'
V_ = lambda p: 'V(%s, %s, %s)' % (p[0], p[1], p[2])
Pp['stations_game'] = dict(note='Точки на низу замков держателей в отсеке (игра вешает ось бомбы на vis.r + 5 см ниже). Четыре ряда по два: ФАБ-250 ×8 - все ряды; ФАБ-500 ×4 - ряды 8,4 и 11,6 м от носа. Порядок для mirror(): [ряд 10,0; ряд 13,2; ряд 8,4; ряд 11,6] - игра заполняет с последних двух, поэтому ×4 встаёт на ряды ФАБ-500. Проверено _bomb.py своими моделями бомб.',
                           left=P['stations'], models_js='stations: mirror([' + ', '.join(V_(p) for p in P['stations']) + '])')
Pp['nozzles_game'] = P['nozzles']; Pp['nr'] = P['nr']; Pp['dry'] = True
DO = {}
for n_ in ('bay_l', 'bay_r'):
    D = g.PARTS[n_]; DO[n_] = [GG(D['pivot']), G2(D['axis']), g.BAY_OPEN]
Pp['bay_game'] = dict(doors=DO, sides=dict(L=['bay_l'], R=['bay_r']), note='формат поля bay у e_b2/e_f35: [ось в осях игры, направление, угол]; створки - отдельные объекты bay_l, bay_r; в prepare нужны groups (prepare_recipe)')
Pp['gear_bottom_game_y'] = P['gear_bottom']
parts = {}
for nm_, D in g.PARTS.items():
    parts[nm_] = dict(pivot_gltf=G2(D['pivot']), pivot_game=GG(D['pivot']), axis_gltf=G2(D['axis']), range_deg=list(D['range']) if D.get('range') else None, note=D.get('note', ''))
    if D.get('parent'): parts[nm_]['parent'] = D['parent']
Pp['parts'] = parts
Pp['sketchfab_extra'] = 'В il28_sketchfab.glb и il28.blend есть наземная оснастка sk_* (стремянка, колодки со шнуром, заглушки заборников и сопел, вымпелы «снять перед полётом» со своими материалами); в файлах игры её нет. Там же фонарь откинут на 70°, люк стрелка опущен; в файле игры всё закрыто.'
Pp['gear_note'] = 'il28_gear.glb: стойки, колёса и открытые створки шасси, только для ангара. Две метки по 1 мм дают тот же центр prepare.js, что у самолёта. Уборку стоек не делать: ниш нет.'
Pp['skins'] = dict(winter='окраски/winter/il28_color.png, il28_orm.png, il28_normal.png - зимняя (стёртая побелка по зелёному), та же развёртка; Mark: хранить на будущее (камуфляж магазина)')
Pp['prepare_recipe'] = "e_il28: { src: new URL('./own/il28.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 2048, nTex: () => 2048, pickMesh: /./, own: true, centerX: true, groups: (c) => { const m = /(^|\\/)(bay_[lr])(\\/|\\||$)/.exec(c.path); return m ? m[2] : 'body'; } }"
Pp['swap_notes'] = ['prepare.js e_il28 сейчас со старым источником (`${DL}/il28.glb`, scale 21.45/21.43, fwd, groups шасси): заменить на prepare_recipe (own/il28.glb, groups bay_l/bay_r для физического отсека); e_il28_gear - тот же рецепт с own/il28_gear.glb без groups.',
                    "models.js e_il28: stations из stations_game.models_js, nozzles из nozzles_game, nr, dry: true, bay из bay_game, clearGlass: true, gearModel: 'e_il28_gear'; META.e_il28_gear как у e_f15e_gear.",
                    'Убрать прежнего автора модели e_il28 из games/airdef/models/credits.js (запись со ссылкой sketchfab.com/3d-models/il28-20bb9aa2…) и из CREDITS.md, если он там есть.',
                    'Ангар берёт camo/e_il28.hi.glb (файл есть): заменить или убрать строку из hi-списка, иначе в ангаре останется старая модель.',
                    'После подмены: миниатюра (металл - с &paint=0, как у F-100D), пара ktx (e_il28 и e_il28_gear); seats-gen не нужен - подвеска внутренняя.',
                    'Длина по планеру 17,65 м, со стволами турели 18,49 м; размах 21,37 м (чертёж 21,45 - с огнями). Прежняя модель 18,76 × 21,45.',
                    'Подвижные части в игре не анимируются, кроме створок отсека (bay); турель, рули, фонарь и люк - в parts на будущее.',
                    'Зимняя окраска лежит в окраски/winter (Mark: хранить на будущее).']
json.dump(Pp, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова', LEN, SPAN, HGT, 'тр. всего', R['model']['tris'], 'шасси низ', Pp['gear_bottom_game_y'], 'точки', Pp['stations_game']['models_js'], 'сопла', Pp['nozzles_game'])
