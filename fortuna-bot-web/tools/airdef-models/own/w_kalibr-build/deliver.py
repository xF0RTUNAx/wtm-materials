# deliver.py — сдача крылатой ракеты 3М14 (после bake2.py; атласы из _ультра, K14_REUSE=1). Заменяет чужую w_kalibr тем же ключом.
#   w_kalibr.glb (игровой: крылья, рули и воздухозаборник раскрыты; цвет JPEG 1024, ORM и нормали PNG 512; крылья и рули вдвое меньше), kalibr.blend (полные атласы),
#   kalibr_sketchfab.glb (4096), _2k, _1k, ПАСПОРТ.json, ОТЧЁТ.json. Превью не рендерятся (Mark 2026-11-18).   Blender -b --factory-startup --python deliver.py
import os, json, math
import bpy
from mathutils import Vector
os.environ.setdefault('K14_REUSE', '1')
_here = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Искандер-К/3М14'
os.environ.setdefault('K14_OUT', os.path.join(_here, '_ультра'))
_p = os.path.join(_here, 'bake2.py'); __file__ = _p; exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
DST = _here; BASE = 'kalibr'; GAME_TEX, GAME_NTEX = 1024, 512
TEXD = os.path.join(DST, 'текстуры'); os.makedirs(TEXD, exist_ok=True)
for _n in ('Cube', 'Light', 'Camera'):
    if _n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[_n], do_unlink=True)
keep = [o for o in COL.objects if o.type == 'MESH']
ORIG = {tag: [(n, n.image, bpy.path.abspath(n.image.filepath)) for n in bpy.data.materials[f'K14_{tag}'].node_tree.nodes if n.type == 'TEX_IMAGE'] for tag in RES}
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


pose(0.0)
PREV = []
# ── Sketchfab: 4096, 2K, 1K
use_set(4096, 2048, 4096); export(os.path.join(DST, BASE + '_sketchfab.glb'))
use_set(2048, 1024, 2048); export(os.path.join(DST, BASE + '_sketchfab_2k.glb'))
use_set(1024, 512, 1024); export(os.path.join(DST, BASE + '_sketchfab_1k.glb'))
# ── игровой файл
use_set(GAME_TEX, GAME_NTEX, GAME_NTEX); glb = os.path.join(DST, 'w_kalibr.glb'); export(glb)
for tag in RES:
    for n, im0, path in ORIG[tag]: n.image = im0
for im in bpy.data.images:
    if im.filepath: im.filepath = bpy.path.relpath(bpy.path.abspath(im.filepath), start=DST)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(DST, BASE + '.blend'), copy=True, relative_remap=True, compress=True)
# ── паспорт и отчёт
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
tri = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in keep)
pts = [o.matrix_world @ v.co for o in keep for v in o.data.vertices]
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
fins = {}
for n, W in MOVE.items():
    fins[n] = dict(pivot_gltf=G2(bpy.data.objects[n].matrix_world.translation), axis_gltf=G2(W['axis']), lim_deg=list(W['lim']), neutral_deg=0.0,
                   note='руль: поворот вокруг радиальной оси у корня (45 % хорды); в контейнере сложен - поворот к корпусу, в файле раскрыт')
wings = {o.name: dict(pivot_gltf=G2(o.matrix_world.translation), fold_axis_gltf=[0, 1, 0], deployed_deg=0, folded_deg=(-90 if o.name == 'wing_r' else 90),
                      note='в контейнере консоль сложена назад внутрь корпуса через щель; в файле раскрыта') for o in WINGS}
P = dict(key='w_kalibr', weapon='kalibr', name='3М14 «Калибр»', name_en='3M14 Kalibr', rev=1, own=True,
         files=dict(glb='w_kalibr.glb', blend=BASE + '.blend', sketchfab=[BASE + '_sketchfab.glb', BASE + '_sketchfab_2k.glb', BASE + '_sketchfab_1k.glb'],
                    build=['k14kit.py', 'build.py', '_paint.py', 'make_decals.py', 'bake2.py', 'deliver.py', '_views.py', '_trial.py']),
         tex=GAME_TEX, nTex=GAME_NTEX, ormTex=GAME_NTEX, nose='-z',
         axes='glTF: нос −Z, верх +Y, X - вправо; начало на оси посередине длины',
         size_m=dict(length=round(mx.y - mn.y, 3), body_diameter=2 * R, wing_span=round(mx.x - mn.x, 3), nose_length=RAD_A),
         nozzle_gltf=G2(Vector((0, YA(L), 0))),
         parts=dict(body='корпус, хвостовое кольцо и сопло, щели крыльев, опоры рулей, обтекатель кабелей, такелажные гнёзда', radome='серый нос',
                    wings=wings, fins=fins, intake='воздухозаборник снизу у хвоста, выдвинут (шарнир у заднего края, начало узла на нём; в контейнере убран в корпус)'),
         swap_notes=['prepare.js: рецепт w_kalibr - на этот glb (своя модель вместо mmickel); узлы wing_*, fin_*, intake не сливать, если игра будет их складывать; иначе можно слить.',
                     'Титры: убрать mmickel (чужая модель заменена своей).', 'Ракета без стартового ускорителя (по заданию): летит сразу маршевым двигателем.'],
         sources=dict(dimensions='длина 6,20 м и Ø 0,533 м - задание главного чата', shape='фото Mark Искандер-К/фото 02-06 (3М-14Э / 3М-54Э на выставке)',
                      paint='все трафареты и номера выдуманы (make_decals.py)'),
         notes='Ревизия 1 (2026-11-18). В файле крылья, рули и воздухозаборник раскрыты (как в полёте).')
json.dump(P, open(os.path.join(DST, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
R_ = dict(name_en='3M14 Kalibr', rev=1, previews=PREV,
          model=dict(tris=tri, length_m=round(mx.y - mn.y, 3), span_m=round(mx.x - mn.x, 3), height_m=round(mx.z - mn.z, 3), glb_mb=round(os.path.getsize(glb) / 1e6, 2)),
          textures=dict(full=f'корпус, нос, воздухозаборник {SIZE}; крылья и рули {SIZE // 2}', game='цвет 1024 JPEG (крылья и рули 512), ORM и нормали 512 (256)'),
          sketchfab=dict(title='3M14 Kalibr Cruise Missile', glb=BASE + '_sketchfab.glb',
                         lead='3M14 Kalibr land-attack cruise missile, built for a game, shown in flight: folding wings, four tail fins and the belly air intake deployed. '
                              'White paint with a grey nose, paired black marking rings and a red mark, seams, rivets and access panels in the normal map, '
                              'light dust, hand marks and streaks. Stencils are made up.',
                         parts=['two folding wings', 'four tail fins', 'belly air intake (all on their hinge axes)'],
                         tags=['kalibr', '3m14', 'cruise-missile', 'missile', 'russian', 'military', 'weapon', 'iskander', 'game-ready', 'pbr', 'textured'],
                         dimensions=f'length {mx.y - mn.y:.2f} m, body diameter {2 * R:.3f} m, wing span {mx.x - mn.x:.2f} m',
                         textures=f'{SIZE} px baked colour, ORM and normal maps; 2K and 1K versions included',
                         based='Built from scratch in Blender from public photos.'))
json.dump(R_, open(os.path.join(DST, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
log('deliver.py: готово w_kalibr.glb, тр.', tri)
