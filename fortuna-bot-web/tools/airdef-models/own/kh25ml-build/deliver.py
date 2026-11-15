# deliver.py — сдача Х-25МЛ (после bake2.py; атласы берутся готовые из _ультра, X25_REUSE=1):
#   kh25ml.glb (игра: цвет JPEG 1024, ORM и нормали PNG 512; оперение вдвое меньше), kh25ml.blend (полные атласы),
#   kh25ml_sketchfab.glb (4096), kh25ml_sketchfab_2k.glb, kh25ml_sketchfab_1k.glb, превью с запечёнными текстурами, ПАСПОРТ.json, ОТЧЁТ.json.
#   Blender -b --factory-startup --python deliver.py
# Поза в обоих файлах: рули и элероны в нейтрали (углы 0).
import os, json, math, shutil
import bpy
from mathutils import Vector
os.environ.setdefault('X25_REUSE', '1')
_here = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Х-25МЛ'
os.environ.setdefault('X25_OUT', os.path.join(_here, '_ультра'))
_p = os.path.join(_here, 'bake2.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
DST = _here; BASE = 'kh25ml'; GAME_TEX, GAME_NTEX = 1024, 512
TEXD = os.path.join(DST, 'текстуры'); os.makedirs(TEXD, exist_ok=True)
for _n in ('Cube', 'Light', 'Camera'):
    if _n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[_n], do_unlink=True)
keep = [o for o in COL.objects if o.type == 'MESH']
NODES = {tag: [n for n in bpy.data.materials[f'X25_{tag}'].node_tree.nodes if n.type == 'TEX_IMAGE'] for tag in RES}
ORIG = {tag: [(n, n.image, bpy.path.abspath(n.image.filepath)) for n in NODES[tag]] for tag in RES}
_cache = {}


def scaled(path, size, fmt):
    key = (path, size, fmt)
    if key in _cache: return _cache[key]
    src = bpy.data.images.load(path, check_existing=True); im = src.copy(); im.scale(size, size)
    p = os.path.join(TEXD, os.path.splitext(os.path.basename(path))[0] + f'_{size}.' + ('jpg' if fmt == 'JPEG' else 'png'))
    im.filepath_raw = p; im.file_format = fmt
    try: im.save(quality=92)
    except TypeError: im.save()
    bpy.data.images.remove(im); _cache[key] = p; return p


def use_set(col_px, orm_px, nrm_px):
    """подставить в материалы картинки нужного размера (оперение - вдвое меньше корпуса)"""
    for tag in RES:
        k = 1 if tag == 'B' else 2
        for n, im0, path in ORIG[tag]:
            kind = 'color' if '_color' in path else ('orm' if '_orm' in path else 'normal')
            px = {'color': col_px, 'orm': orm_px, 'normal': nrm_px}[kind] // k
            new = bpy.data.images.load(scaled(path, px, 'JPEG' if kind == 'color' else 'PNG'), check_existing=True)
            if kind != 'color': new.colorspace_settings.name = 'Non-Color'
            n.image = new


def export(path):
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for o in keep: o.select_set(True)
    bpy.context.view_layer.objects.active = keep[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_materials='EXPORT', export_image_format='AUTO',
                              export_cameras=False, export_lights=False, export_normals=True, export_animations=False)
    log('экспорт', os.path.basename(path), '%.2f МБ' % (os.path.getsize(path) / 1e6))


pose(0.0, 0.0); bpy.context.view_layer.update()
# ── превью с запечёнными текстурами (полные атласы)
sc.render.engine = 'CYCLES'; sc.cycles.samples = 96; sc.cycles.use_denoising = True
sc.view_settings.view_transform = 'AgX'; sc.view_settings.exposure = 0.25
w = bpy.data.worlds.new('V_world'); sc.world = w; w.use_nodes = True; nt = w.node_tree; bg = next(n for n in nt.nodes if n.type == 'BACKGROUND'); bg.inputs[1].default_value = 1.0
_tc = nt.nodes.new('ShaderNodeTexCoord'); _sp = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(_tc.outputs['Generated'], _sp.inputs[0])
_rp = nt.nodes.new('ShaderNodeValToRGB'); nt.links.new(_sp.outputs['Z'], _rp.inputs[0]); _r = _rp.color_ramp; _r.elements[0].position = 0.46; _r.elements[0].color = (0.46, 0.45, 0.43, 1)
_r.elements[1].position = 0.56; _r.elements[1].color = (0.85, 0.89, 0.95, 1); nt.links.new(_rp.outputs['Color'], bg.inputs[0])
ld = bpy.data.lights.new('V_sun', 'SUN'); ld.energy = 4.0; ld.angle = math.radians(3); sun = bpy.data.objects.new('V_sun', ld); sc.collection.objects.link(sun); sun.rotation_euler = (math.radians(40), math.radians(-30), math.radians(-60))
cam = bpy.data.objects.new('V_cam', bpy.data.cameras.new('V_cam')); sc.collection.objects.link(cam); sc.camera = cam
SHOTS = [('превью_1_общий', (-2.3, 3.4, 1.2), (0, 0.5, 0), 45, (1920, 1080), (0, 0)), ('превью_2_сбоку', (-10, 0, 0.0), (0, 0, 0.0), 'o3.9', (1920, 640), (0, 0)),
         ('превью_3_голова', (-0.55, 2.25, 0.25), (0, 1.55, 0), 55, (1600, 1000), (0, 0)), ('превью_4_хвост', (0.95, -2.35, 0.30), (0, -1.45, 0), 50, (1600, 1000), (0, 0)),
         ('снимки/снизу', (0.8, 0.6, -3.4), (0, 0.0, 0), 40, (1920, 1080), (0, 0)), ('снимки/рули_отклонены', (1.9, -3.4, 1.1), (0, -0.7, 0), 45, (1920, 1080), (0.8, 0.6)),
         ('снимки/трафареты', (-0.95, 0.85, 0.12), (0, 0.65, 0.0), 50, (1600, 1000), (0, 0))]
os.makedirs(os.path.join(DST, 'снимки'), exist_ok=True); PREV = []
for name, pos, tgt, f, res, ps in SHOTS:
    pose(*ps); cam.location = Vector(pos); cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.resolution_x, sc.render.resolution_y = res
    if isinstance(f, str): cam.data.type = 'ORTHO'; cam.data.ortho_scale = float(f[1:])
    else: cam.data.type = 'PERSP'; cam.data.lens = f
    sc.render.filepath = os.path.join(DST, name + '.png'); bpy.ops.render.render(write_still=True); log('снимок', name)
    if name.startswith('превью'): PREV.append(name + '.png')
pose(0.0, 0.0)
bpy.data.objects.remove(cam, do_unlink=True); bpy.data.objects.remove(sun, do_unlink=True)
# ── Sketchfab: полные атласы (корпус 4096) и облегчённые 2K / 1K
for tag in RES:
    for n, im0, path in ORIG[tag]:
        if '_color' in path:                                                    # цвет в JPEG (меньше файл), нормали и ORM - PNG
            n.image = bpy.data.images.load(scaled(path, SIZES[tag], 'JPEG'), check_existing=True)
export(os.path.join(DST, BASE + '_sketchfab.glb'))
use_set(2048, 1024, 2048); export(os.path.join(DST, BASE + '_sketchfab_2k.glb'))
use_set(1024, 512, 1024); export(os.path.join(DST, BASE + '_sketchfab_1k.glb'))
# ── игра: цвет 1024, ORM и нормали 512 (оперение - 512 / 256)
use_set(GAME_TEX, GAME_NTEX, GAME_NTEX); glb = os.path.join(DST, BASE + '.glb'); export(glb)
for tag in RES:
    for n, im0, path in ORIG[tag]: n.image = im0
for im in bpy.data.images:
    if im.filepath: im.filepath = bpy.path.relpath(bpy.path.abspath(im.filepath), start=DST)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(DST, BASE + '.blend'), copy=True, relative_remap=True, compress=True)
tri = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in keep)
pts = [o.matrix_world @ v.co for o in keep for v in o.data.vertices]
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
parts = {}
for n, W in MOVE.items():
    o = bpy.data.objects[n]; nm = {'can': 'носовой руль, цельноповоротный', 'ail': 'элерон на задней кромке крыла у корня'}[W['kind']]
    parts[n] = dict(pivot_gltf=G2(o.matrix_world.translation), axis_gltf=G2(W['axis']), lim_deg=list(W['lim']), neutral_deg=0.0, note=nm)
noz = []
for side in (1, -1):
    tl = math.radians(NOZ['tilt']); d = Vector((side * math.sin(tl), -math.cos(tl), 0)); c = Vector((side * NOZ['x'], YA(NOZ['a']), 0)) + d * 0.004
    noz.append(dict(exit_gltf=G2(c), dir_gltf=[round(v, 4) for v in G2(d)], r=NOZ['r'], side='+X' if side > 0 else '-X'))
col = {}
try: col = json.load(open(os.path.join(DST, '_live', 'collide.json'), encoding='utf-8'))
except Exception as e: log('нет итога _collide.py:', e)
P = dict(key='w_kh25ml', weapon='kh25ml', name='Х-25МЛ', name_en='Kh-25ML', rev=1, own=True,
         files=dict(glb=BASE + '.glb', blend=BASE + '.blend', sketchfab=[BASE + '_sketchfab.glb', BASE + '_sketchfab_2k.glb', BASE + '_sketchfab_1k.glb'],
                    build=['x25kit.py', 'build.py', '_paint.py', 'make_decals.py', 'bake2.py', 'deliver.py', '_collide.py', '_limits.py', '_views.py', '_trial.py']),
         tex=GAME_TEX, nTex=GAME_NTEX, ormTex=GAME_NTEX,
         axes='glTF: нос −Z, верх +Y, начало на оси посередине длины 3,70 м (НЕ +z, как у прежней чужой модели w_kh25ml); оперение крестом «×»',
         size_m=dict(length=round(mx.y - mn.y, 3), width=round(mx.x - mn.x, 3), height=round(mx.z - mn.z, 3), body_diameter=2 * R, wing_span=round(2 * WNG['s1'], 3), canard_span=round(2 * CAN['s1'], 3)),
         parts=parts,
         parts_note='can1…can4 - носовые рули, ail1…ail4 - элероны; поворот вокруг axis_gltf через pivot_gltf в пределах lim_deg (от нейтрали 0). Элероны 1 и 3 и элероны 2 и 4 при крене идут в разные стороны; '
                    'в сторону выступа сопла элерон отклоняется только до 6° (дальше задняя кромка уходит в выступ), в другую - до 15° (_limits.py, _collide.py - касаний нет)',
         nozzles=noz, nozzle_gltf=G2(Vector((0, YA(NOZ['a']) - 0.004, 0))),
         nozzle_note='двигатель с двумя боковыми соплами: выход в начале желоба на каждом борту (±X), направление - назад и на 10° наружу. nozzle_gltf - середина между ними на оси, если игре нужна одна точка',
         glass='dome - стекло купола (X25_glass: Alpha 0,22, BLENDED, лак), под ним seeker - сетка (X25_grid), латунная оптика (X25_optic), тёмный корпус (X25_dark); не запекаются',
         swap_notes=['Подмена по фразе «модель Х-25МЛ готова»: integrate-own.js с этой папкой, ключ w_kh25ml, оружие kh25ml (уже есть в игре: Су-25 «Х-29Т + Х-25МЛ», Су-17М4 «Х-58 + Х-25МЛ», пилоны крыла).',
                     'nose: -z (своя модель), а не +z прежней чужой.',
                     'Узлы can1…4 и ail1…4 - свои части (groups в prepare.js: /(^|\\/)(can\\d|ail\\d)(\\/|$)/), остальное body; integrate-own стирает groups - вернуть после подмены.',
                     'Купол - прозрачный материал X25_glass (как HF_glass у Hellfire).',
                     'Убрать кредит «Kh-29 \"Kedge\"» (Novia556) у w_kh25ml из credits.js и CREDITS.md, если та же модель больше нигде не используется; старый рецепт w_kh25ml в prepare.js заменить.',
                     'Иконки wpn:kh25ml перепечь (thumbs-bake.js), seats-gen.js для kh25ml; ktx-models.js w_kh25ml.'],
         notes='Ревизия 1 (2026-11-15). Форма по чертежу 06 (наложение - _показ/f_наложение_бок.png), детали по фото 01, 02, 04, 05. Чёрные кольца с фото 02 и надписи с фото 03 не взяты; все трафареты и номер выдуманы (make_decals.py).')
json.dump(P, open(os.path.join(DST, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
R_ = dict(name_en='Kh-25ML', rev=1, previews=PREV,
          model=dict(tris=tri, length_m=round(mx.y - mn.y, 3), span_m=round(2 * WNG['s1'], 3), height_m=round(mx.z - mn.z, 3), glb_mb=round(os.path.getsize(glb) / 1e6, 2)),
          textures=dict(full=f'корпус {SIZE}, оперение {SIZE // 2} (цвет, ORM, нормали)', game='цвет 1024 JPEG (оперение 512), ORM и нормали 512 PNG (оперение 256)', normal='с детальной копии: фаски 4 мм корпус / 1,5 мм оперение + швы, лючки, винты'),
          checks=dict(collisions=col, color='белая (линейно 0,86 / 0,87 / 0,88): медиана освещённого борта на пробе sRGB 219/220/220 при фото 04: среднее 218-222, медиана 227-230', silhouette='наложение на чертёж 06 сбоку совпадает; виды спереди и сзади - _показ/лист_формы.jpg'),
          sketchfab=dict(title='Kh-25ML Laser-Guided Air-to-Surface Missile', glb=BASE + '_sketchfab.glb',
                         lead='Soviet Kh-25ML laser-guided air-to-surface missile, built for a game from photos and a three-view drawing. White body with soft wear and grime from photo masks, chipped edges, seams, hatches and screws baked into the normal map, made-up stencils. Glass seeker dome with the mesh and optics inside, chrome dome ring, two side nozzles in sooty heat-coated troughs. Canards and ailerons are separate hinged parts.',
                         parts=['body with nozzle troughs', 'glass seeker dome', 'seeker mesh and optics', 'four all-moving canards', 'four wings', 'four ailerons'],
                         tags=['kh-25', 'kh-25ml', 'missile', 'air-to-surface', 'laser-guided', 'soviet', 'russian', 'military', 'weapon', 'aircraft-weapon', 'game-ready', 'pbr'],
                         dimensions=f'length {mx.y - mn.y:.2f} m, body diameter {2 * R:.2f} m, wing span {2 * WNG["s1"]:.2f} m',
                         textures=f'{SIZE} px baked colour, ORM and normal maps; 2K and 1K versions included',
                         based='Built from scratch in Blender from public photos and drawings.'))
json.dump(R_, open(os.path.join(DST, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
log('deliver.py: готово', BASE, 'тр.', tri, PREV)
