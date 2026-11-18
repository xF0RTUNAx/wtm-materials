# deliver.py — сдача пусковой 9П78-1 «Искандер-М» с ракетами 9М723 (после bake2.py; атласы берёт готовые - ISK_REUSE=1):
#   l_iskander.glb (игра: БОЕВОЕ положение - обе ракеты вертикально, крышки открыты, опоры на грунте; цвет JPEG 1024, ORM и нормали PNG 512; тросы облегчены),
#   w_tbmdec.glb (ложная цель - головная часть 9М723 до стыка ГЧ, нос −Z), l_iskander_sketchfab.glb (4096, полная сетка) + _2k / _1k, l_iskander.blend (полные атласы),
#   превью (Cycles), ПАСПОРТ.json и ОТЧЁТ.json.   ISK_OUT="<папка с атласами 4096>" Blender -b --factory-startup --python deliver.py
import os, json, math, shutil
import bpy, bmesh
from mathutils import Vector, Matrix
os.environ.setdefault('ISK_REUSE', '1')
_here = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Искандер-М'
os.environ.setdefault('ISK_OUT', os.path.join(_here, '_ультра'))
_p = os.path.join(_here, 'bake2.py'); __file__ = _p; exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
DST = _here
GAME_TEX, GAME_NTEX = 1024, 512
BASE = 'l_iskander'
G2 = lambda v: [round(v.x, 3), round(v.z, 3), round(-v.y, 3)]                                    # Blender → glTF (Y вверх, нос −Z)


def img_copy(path, size, fmt, sub):
    src = bpy.data.images.load(path, check_existing=True); im = src.copy(); im.scale(size, size)
    p = os.path.join(DST, sub, os.path.splitext(os.path.basename(path))[0] + f'_{size}.' + ('jpg' if fmt == 'JPEG' else 'png'))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    im.filepath_raw = p; im.file_format = fmt; im.save(); bpy.data.images.remove(im); return p


def swap_images(tex, ntex, sub='текстуры_игра', fmt_c='JPEG', otex=None, fmt_o='PNG', fmt_n='PNG'):
    back = []; otex = otex or ntex
    for tag in RES:
        m = bpy.data.materials[f'ISK_{tag}']
        for n in [n for n in m.node_tree.nodes if n.type == 'TEX_IMAGE']:
            p = bpy.path.abspath(n.image.filepath); col = '_color' in p; orm_ = '_orm' in p
            newp = img_copy(p, tex if col else (otex if orm_ else ntex), fmt_c if col else (fmt_o if orm_ else fmt_n), sub)
            back.append((n, n.image)); n.image = bpy.data.images.load(newp, check_existing=True)
            if not col: n.image.colorspace_settings.name = 'Non-Color'
    return back


def restore(back):
    for n, im in back: n.image = im


def export(path, objs, light_ropes=False):
    mods = []
    if light_ropes and 'body_ropes' in MESHES:                                                     # тросы в игре: сетка ×0,3 (витьё остаётся в карте нормалей)
        dm = MESHES['body_ropes'].modifiers.new('dec', 'DECIMATE'); dm.ratio = 0.3; mods.append((MESHES['body_ropes'], dm))
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_materials='EXPORT', export_image_format='AUTO',
                              export_cameras=False, export_lights=False, export_normals=True, export_tangents=False, export_animations=False)
    tri = 0; dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        if o.type == 'MESH': me = o.evaluated_get(dg).to_mesh(); me.calc_loop_triangles(); tri += len(me.loop_triangles); o.evaluated_get(dg).to_mesh_clear()
    for o, m in mods: o.modifiers.remove(m)
    return os.path.getsize(path), tri


for _n in ('Cube', 'Light', 'Camera'):
    if _n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[_n], do_unlink=True)
for o in COL.objects: o.hide_render = o.hide_viewport = False
GAME = [o for o in COL.objects if o.type == 'MESH' and not o.name.startswith(('sk_', 'det_sk_'))]
ALL = [o for o in COL.objects if o.type == 'MESH']

# ───────────── ложная цель w_tbmdec: головная часть 9М723 от носа до стыка ГЧ (2,16 м) ─────────────
pose(); bpy.context.view_layer.update()
t_ = MESHES['tbm']; nose_y = max((t_.matrix_world @ v.co).y for v in t_.data.vertices); cut_y = nose_y - 2.165
me = t_.data.copy(); bm = bmesh.new(); bm.from_mesh(me); bm.transform(t_.matrix_world)
geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
r_ = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, cut_y, 0), plane_no=(0, 1, 0), clear_inner=True)
cut_e = [e for e in r_['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
if cut_e: bmesh.ops.holes_fill(bm, edges=cut_e, sides=0)
for v in bm.verts: v.co.x -= X_M; v.co.z -= AX_Z; v.co.y -= (nose_y + cut_y) / 2
bm.to_mesh(me); bm.free()
DEC = bpy.data.objects.new('tbmdec', me); COL.objects.link(DEC); DEC.matrix_world = Matrix.Identity(4)
for o in bpy.context.view_layer.objects: o.select_set(False)
back = swap_images(GAME_TEX, GAME_NTEX); size_d, tri_d = export(os.path.join(DST, 'w_tbmdec.glb'), [DEC]); restore(back)
log('ложная цель: w_tbmdec.glb %.2f МБ, %d тр., длина %.2f м' % (size_d / 1e6, tri_d, nose_y - cut_y))
DEC.hide_render = DEC.hide_viewport = True

# ───────────── игра: боевое положение ─────────────
combat(); bpy.context.view_layer.update()
back = swap_images(GAME_TEX, GAME_NTEX); size_g, tri_g = export(os.path.join(DST, BASE + '.glb'), GAME, light_ropes=True); restore(back)
log('игра: %s.glb %.1f МБ, %d тр.' % (BASE, size_g / 1e6, tri_g))
centers = {}
for n in ('tbm', 'tbm2'):
    o = MESHES[n]; ws = [o.matrix_world @ v.co for v in o.data.vertices]
    c = sum(ws, Vector()) / len(ws); mn_ = Vector((min(p.x for p in ws), min(p.y for p in ws), min(p.z for p in ws))); mx2 = Vector((max(p.x for p in ws), max(p.y for p in ws), max(p.z for p in ws)))
    centers[n] = dict(center_gltf=G2((mn_ + mx2) / 2), bottom_gltf=round(mn_.z, 3), top_gltf=round(mx2.z, 3))

# ───────────── Sketchfab: полная сетка, 4096 / 2048 / 1024, боевое положение ─────────────
SK = {}                                                                                           # PNG 4096 давали 174 МБ (больше лимита Sketchfab): цвет и нормали - JPEG
for k, (t, nt, ot) in (('4k', (4096, 4096, 2048)), ('2k', (2048, 2048, 1024)), ('1k', (1024, 1024, 1024))):
    back = swap_images(t, nt, sub='текстуры_sketchfab_' + k, fmt_c='JPEG', otex=ot, fmt_o='JPEG', fmt_n='JPEG' if k == '4k' else 'PNG')
    SK[k] = export(os.path.join(DST, BASE + ('_sketchfab.glb' if k == '4k' else f'_sketchfab_{k}.glb')), ALL); restore(back)
size_s, tri_s = SK['4k']
log('Sketchfab:', {k: '%.1f МБ' % (v[0] / 1e6) for k, v in SK.items()}, tri_s, 'тр.')

# ───────────── превью: Cycles, атласы 4096 (Mark 2026-11-18: «давай без рендеров превью» - только при ISK_PREV=1) ─────────────
PREV = []
if os.environ.get('ISK_PREV', '0') == '1':
    sc.render.image_settings.quality = 92
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 96; sc.cycles.use_denoising = True
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.exposure = 0.0
    w = bpy.data.worlds.new('V_world'); sc.world = w; w.use_nodes = True; nt = w.node_tree; bg = next(n for n in nt.nodes if n.type == 'BACKGROUND'); bg.inputs[1].default_value = 1.0
    _tc = nt.nodes.new('ShaderNodeTexCoord'); _sp = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(_tc.outputs['Generated'], _sp.inputs[0])
    _rp = nt.nodes.new('ShaderNodeValToRGB'); nt.links.new(_sp.outputs['Z'], _rp.inputs[0]); _r = _rp.color_ramp; _r.elements[0].position = 0.46; _r.elements[0].color = (0.40, 0.37, 0.30, 1)
    _r.elements[1].position = 0.56; _r.elements[1].color = (0.75, 0.82, 0.95, 1); nt.links.new(_rp.outputs['Color'], bg.inputs[0])
    ld = bpy.data.lights.new('V_sun', 'SUN'); ld.energy = 3.5; ld.angle = math.radians(2); sun = bpy.data.objects.new('V_sun', ld); sc.collection.objects.link(sun); sun.rotation_euler = (math.radians(42), math.radians(-25), math.radians(-130))
    gm = bpy.data.meshes.new('V_ground'); gm.from_pydata([(-60, -60, 0), (60, -60, 0), (60, 60, 0), (-60, 60, 0)], [], [(0, 1, 2, 3)]); gr = bpy.data.objects.new('V_ground', gm); sc.collection.objects.link(gr)
    gmat = bpy.data.materials.new('V_ground'); gmat.use_nodes = True; _b = next(n for n in gmat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); _b.inputs['Base Color'].default_value = (0.20, 0.17, 0.12, 1); gm.materials.append(gmat)
    cam = bpy.data.objects.new('V_cam', bpy.data.cameras.new('V_cam')); sc.collection.objects.link(cam); sc.camera = cam
    SH = [('общий', 'c', (-13.5, 14.5, 5.5), (0, 0.5, 3.0), 35), ('сзади', 'c', (11, -17, 6.5), (0, -2.5, 3.8), 35), ('сбоку', 'c', (-30, -0.4, 3.2), (0, -0.4, 3.2), 'o15.5'),
          ('кабина', 'c', (-5.8, 10.8, 2.8), (0, 5.0, 1.9), 40), ('перед', 'c', (0.9, 8.9, 1.55), (0, 6.25, 1.25), 40), ('ракеты', 'c', (-2.6, -10.5, 3.2), (0, -7.07, 2.8), 45),
          ('походное', 'r', (-13.5, 14.5, 5.5), (0, 0.0, 2.0), 35), ('подъём', 'u', (-13, -14, 7), (0, -2, 3), 35), ('борт', 'c', (-4.5, -1.2, 2.2), (-1.5, -2.6, 2.0), 40)]
    for i, (nm, ps, pos, tgt, f) in enumerate(SH):
        {'c': combat, 'r': pose, 'u': lambda: pose(45, 70, LID_OPEN, 0.2)}[ps]()
        cam.location = Vector(pos); cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
        if isinstance(f, str): cam.data.type = 'ORTHO'; cam.data.ortho_scale = float(f[1:])
        else: cam.data.type = 'PERSP'; cam.data.lens = f
        sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
        dst = f'превью_{i + 1}_{nm}.png'; sc.render.filepath = os.path.join(DST, dst); bpy.ops.render.render(write_still=True); PREV.append(dst); log('превью', dst)
    for o in (sun, gr, cam): bpy.data.objects.remove(o, do_unlink=True)
    combat()

# ───────────── .blend с полными атласами ─────────────
for im in bpy.data.images:
    if im.filepath: im.filepath = bpy.path.relpath(bpy.path.abspath(im.filepath), start=DST)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(DST, BASE + '.blend'), copy=True, relative_remap=True, compress=True)

# ───────────── паспорт ─────────────
pose(); bpy.context.view_layer.update()
wp = lambda n: G2(COL.objects[n].matrix_world.translation)
parts = {
    'body_*': 'неподвижное: body_cab (кабина), body_guard (решётка-ограждение), body_ropes (буксирные тросы), body_equip (приборный отсек), body_bay (ракетный отсек), '
              'body_chassis (рама, мосты, бак, ресиверы), body_jackbox (корпуса опор); det_* - мелочь своего объекта (ребёнок, двигается с ним)',
    'boom_r / boom_l': dict(what='стрелы-ложементы (дети: tbm / tbm2, cyl_*_rod); X > 0 - правая', origin_gltf=[wp('boom_r'), wp('boom_l')], axis_gltf=[1, 0, 0],
                            sign='+ поднимает (нос ракеты вверх; поворот вокруг +X glTF на +угол)', limits_deg=[0, 90], rest_deg=0, combat_deg=90),
    'tbm / tbm2': dict(what='ракеты 9М723 (дети стрел), пуск из центра вдоль оси; tbm - правая (X > 0), уходит первой', combat=centers),
    'cyl_r_body / cyl_l_body': dict(what='корпуса цилиндров подъёма, начало - на опоре в полу', aim='+Y объекта (glTF −Z) - на начало cyl_*_rod того же борта'),
    'cyl_r_rod / cyl_l_rod': dict(what='штоки (дети стрел), начало - на проушине стрелы', aim='+Y объекта (glTF −Z) - на начало cyl_*_body'),
    'lid_r / lid_l': dict(what='крышки крыши отсека на продольных петлях', origin_gltf=[wp('lid_r'), wp('lid_l')], axis_gltf=[[0, 0, -1], [0, 0, 1]],
                          sign='+ открывает наружу', limits_deg=[0, LID_OPEN], rest_deg=0, combat_deg=LID_OPEN),
    'jack_fr / jack_fl / jack_rr / jack_rl': dict(what='гидроопоры (выдвижная часть)', move='вниз по −Y glTF', limits_m=[0, JACK_TRAVEL], combat_m=JACK_TRAVEL),
    'wheel_<1…4><l|r>': dict(what='колёса', spin_axis_gltf=[1, 0, 0], origin='центр колеса'),
}
swap = [
    'prepare.js: рецепт l_iskander - на этот glb (БОЕВОЕ положение уже в файле, raiseSel прежней модели не нужен); узлы tbm и tbm2 не сливать с корпусом (их берёт arsenal.js: part tbm); '
    'det_* - мелочь своих родителей; boom_*, cyl_*, lid_*, jack_*, wheel_* не сливать (оси - в parts).',
    'sim/combined.js RAIL.l_iskander.c - новые центры ракет: tbm ' + json.dumps(centers['tbm']['center_gltf']) + ', tbm2 ' + json.dumps(centers['tbm2']['center_gltf']) +
    ' (прежние [±0.58, 5.36, 5.121]); ось a [0, 1, 0] прежняя. Ракеты стоят за задним торцом (фото 07), низ на 2,0 м.',
    'prepare.js: w_tbmdec - на w_tbmdec.glb (головная часть 9М723 от носа до стыка ГЧ, нос −Z).',
    'Титры: убрать dofash_76 «ISKANDER» (чужая модель заменена своей) и автора прежней w_tbmdec.',
    'Ракета 9М723 длиннее прежней: 7,20 м вместо 6,32 (пропорции фото 07, 08); если в игре задан масштаб части tbm - снять.',
]
P = dict(key=BASE, weapon='iskander', name='Искандер-М (пусковая 9П78-1, ракеты 9М723)', name_en='9K720 Iskander-M', rev=1,
         files=dict(glb=BASE + '.glb', blend=BASE + '.blend', decoy='w_tbmdec.glb', build=['build.py', 'iskkit.py', '_paint.py', 'make_decals.py', 'bake2.py', 'deliver.py']),
         tex=GAME_TEX, nTex=GAME_NTEX, ormTex=GAME_NTEX, parts=parts, combat_pose=dict(booms_deg=90, lids_deg=LID_OPEN, jacks_m=JACK_TRAVEL, note='игровой файл уже в боевом положении'),
         rail=dict(c=[centers['tbm']['center_gltf'], centers['tbm2']['center_gltf']], a=[0, 1, 0]), swap_notes=swap,
         notes='Оси: Blender - метры, нос +Y, вверх +Z, земля 0; glTF - Y вверх, нос −Z (кабина в −Z, корма в +Z, как у прежней модели). Длина 13,0 м как у прежней l_iskander.')
json.dump(P, open(os.path.join(DST, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
combat(); bpy.context.view_layer.update()
mn = Vector((1e9,) * 3); mx_ = Vector((-1e9,) * 3)
for o in GAME:
    for v in o.data.vertices:
        p = o.matrix_world @ v.co
        for i in range(3): mn[i] = min(mn[i], p[i]); mx_[i] = max(mx_[i], p[i])
pose(); bpy.context.view_layer.update()
mn2 = Vector((1e9,) * 3); mx2_ = Vector((-1e9,) * 3)
for o in GAME:
    for v in o.data.vertices:
        p = o.matrix_world @ v.co
        for i in range(3): mn2[i] = min(mn2[i], p[i]); mx2_[i] = max(mx2_[i], p[i])
R = dict(name_en='9K720 Iskander-M', rev=1, previews=PREV,
         model=dict(combat=dict(length_m=round(mx_.y - mn.y, 3), width_m=round(mx_.x - mn.x, 3), height_m=round(mx_.z - mn.z, 3)),
                    travel=dict(length_m=round(mx2_.y - mn2.y, 3), width_m=round(mx2_.x - mn2.x, 3), height_m=round(mx2_.z - mn2.z, 3)),
                    tris_game=tri_g, glb_mb=round(size_g / 1e6, 2), tris_sketchfab=tri_s, tris=tri_s, length_m=13.0, decoy=dict(tris=tri_d, length_m=round(nose_y - cut_y, 3))),
         paint=dict(variant=VAR, how='процедурная окраска с фотомасками CC0 (ambientCG: SurfaceImperfections003/013, Scratches003/005, Leaking012A/017B), трафареты свои вымышленные; '
                    'краска тёмно-зелёная по фото 01, 06, 07 (Mark 2026-11-18: темнее, не зелень HIMARS)'),
         textures=dict(atlases={'A': 'кабина, решётка, тросы, приборный отсек, опоры, цилиндры', 'B': 'ракетный отсек', 'L': 'крышки', 'F': 'шасси', 'M': 'ракета (общая развёртка tbm/tbm2)',
                                'K': 'стрелы, штоки', 'W': 'колесо (общая развёртка на 8)', 'D': 'мелочь det_*'}, full=SIZE, game='цвет 1024 JPEG, ORM 512, нормали 512',
                       normal='с детальной копии (фаски 6 мм) + рельеф краски, сварные швы, решётки, витьё тросов, надписи на шинах'),
         checks=dict(collisions='стрелы 0…90° вместе и по одной, крышки 0…205°, опоры 0…0,45 м - без касаний (_collide.py)'),
         sketchfab=dict(title='9K720 Iskander-M TEL with 9M723 Missiles', glb=BASE + '_sketchfab.glb', sizes_mb={k: round(v[0] / 1e6, 1) for k, v in SK.items()},
                        lead='Iskander-M launcher on an 8x8 chassis with two 9M723 missiles, built for a game. Both missiles stand vertical behind the rear on their erectors, roof lids folded down, four jacks on the ground. Dark green paint with dust, rain streaks, mud, chipped edges and grime in the seams; cab guard frame, tow ropes over the radiator grille, ladders, lockers and louvres. Stencils are made up.',
                        parts=['two erectors with 9M723 missiles', 'roof lids', 'lift cylinders', 'four hydraulic jacks', 'eight wheels (all on their real hinge axes)'],
                        dimensions='length 13.0 m, missile 7.2 m, combat height 9.3 m', tags=['iskander', '9k720', 'tel', 'ballistic-missile', 'launcher', 'military', 'vehicle', 'russian', 'game-ready', 'pbr', 'blender'],
                        textures='PBR materials with 4096 px baked colour, ORM and normal maps; 2K and 1K versions included'),
         notes='Ревизия 1 (2026-11-18): проба 1 → Mark «поработай над детализацией и реализмом, лестница у дверей висит в воздухе» → проба 2: кабина по крупным фото, подножки, '
               'решётка радиатора, витые тросы, косынки, короб жалюзи, настилы крышек, бак, ресиверы, тормоза, подкачка шин, лючки ракеты; краска темнее (Mark).')
json.dump(R, open(os.path.join(DST, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
log('deliver.py: готово', BASE + '.glb', PREV)
