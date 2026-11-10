# deliver.py — сдача ракеты MGM-140 ATACMS (после bake2.py; атласы готовые - ATA_REUSE=1): atacms.glb (игра: цвет JPEG 1024, ORM и нормали PNG 512),
#   atacms.blend (полные 4096), превью, ПАСПОРТ.json, ОТЧЁТ.json. Поза в файле: рули СЛОЖЕНЫ (как в трубе).
#   ATA_OUT="<папка с атласами>" Blender -b --factory-startup --python deliver.py
import os, json, math, shutil
import bpy
from mathutils import Vector
os.environ.setdefault('ATA_REUSE', '1')
_here = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/ATACMS'
os.environ.setdefault('ATA_OUT', os.path.join(_here, '_ультра'))
_p = os.path.join(_here, 'bake2.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
DST = _here; GAME_TEX, GAME_NTEX = 1024, 512; BASE = 'atacms'


def img_copy(path, size, fmt):
    src = bpy.data.images.load(path, check_existing=True); im = src.copy(); im.scale(size, size)
    p = os.path.join(DST, 'текстуры_игра', os.path.splitext(os.path.basename(path))[0] + f'_{size}.' + ('jpg' if fmt == 'JPEG' else 'png'))
    os.makedirs(os.path.dirname(p), exist_ok=True); im.filepath_raw = p; im.file_format = fmt; im.save(); bpy.data.images.remove(im); return p


back = []
for tag in RES:
    m = bpy.data.materials[f'ATA_{tag}']
    for n in [n for n in m.node_tree.nodes if n.type == 'TEX_IMAGE']:
        p = bpy.path.abspath(n.image.filepath); col = '_color' in p
        sz = (GAME_TEX if col else GAME_NTEX) // (1 if tag == 'B' else 2)
        back.append((n, n.image)); n.image = bpy.data.images.load(img_copy(p, sz, 'JPEG' if col else 'PNG'), check_existing=True)
        if not col: n.image.colorspace_settings.name = 'Non-Color'
pose(0.0); bpy.context.view_layer.update()
for _n in ('Cube', 'Light', 'Camera'):
    if _n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[_n], do_unlink=True)
keep = [o for o in COL.objects if o.type == 'MESH']
for o in bpy.context.view_layer.objects: o.select_set(False)
for o in keep: o.select_set(True)
bpy.context.view_layer.objects.active = keep[0]
glb = os.path.join(DST, BASE + '.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_materials='EXPORT', export_image_format='AUTO',
                          export_cameras=False, export_lights=False, export_normals=True, export_animations=False)
for n, im in back: n.image = im
tri = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in keep)
log('игра: %s.glb %.2f МБ, %d тр.' % (BASE, os.path.getsize(glb) / 1e6, tri))
PREV = []
for i, nm in enumerate(('сбоку', 'сзади', 'спереди', 'нос', 'хвост')):
    src = os.path.join(OUT, 'кадры', nm + '.png')
    if os.path.exists(src): dst = f'превью_{i + 1}_{nm}.png'; shutil.copy(src, os.path.join(DST, dst)); PREV.append(dst)
for im in bpy.data.images:
    if im.filepath: im.filepath = bpy.path.relpath(bpy.path.abspath(im.filepath), start=DST)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(DST, BASE + '.blend'), copy=True, relative_remap=True, compress=True)
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
fins = {}
for o, a in zip(FINS, FIN_ANG):
    ar = math.radians(a); d = Vector((math.cos(ar), 0, math.sin(ar)))
    fins[o.name] = dict(origin_gltf=G2(o.matrix_world.translation), fold_axis_gltf=[0, 0, -1], folded_deg=FOLD, open_deg=0,
                        radial_gltf=G2(d), steer_axis_gltf=G2(d), steer_limit_deg=[-20, 20], roll_position_deg=a)
nz = Vector((0, Y(200) - 0.012, 0))
P = dict(key='w_atacms', weapon='atacms', name='ATACMS', name_en='MGM-140 ATACMS', rev=1,
         files=dict(glb=BASE + '.glb', blend=BASE + '.blend', build=['build.py', 'atakit.py', '_paint.py', 'make_decals.py', 'bake2.py', 'deliver.py']),
         tex=GAME_TEX, nTex=GAME_NTEX, ormTex=GAME_NTEX, wings='deploy',
         parts=dict(body='корпус, головная часть, кабельный короб, сопло', fins=fins,
                    note='fin1…fin4 - узлы рулей, начало на оси складывания у корня; в файле сложены (поворот +90° вокруг оси ракеты, glTF −Z), раскрытие - в 0°; руль поворачивается вокруг своей радиальной оси (steer_axis) ±20°'),
         nozzle=dict(exit_center_gltf=G2(nz), exit_radius_m=round(R(58), 3)),
         notes='Оси: glTF Y вверх, нос −Z; начало - середина длины на оси. Длина 4,22 м, Ø 0,62 м (как прежняя w_atacms). Окраска фото 01: песочный корпус, чёрная головная часть, свои трафареты. '
               'Со сложенными рулями r 0,449 - входит в трубу pod_atacms HIMARS (внутренний r 0,46).')
json.dump(P, open(os.path.join(DST, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
R_ = dict(name_en='MGM-140 ATACMS', rev=1, previews=PREV, tris=tri, glb_mb=round(os.path.getsize(glb) / 1e6, 2),
          textures=dict(full=SIZE, game='цвет 1024 JPEG (рули 512), ORM 512, нормали 512 (рули 256)', normal='с детальной копии (фаски 4 мм)'),
          checks=dict(in_tube='сложенные рули r 0,449 < внутренний r трубы 0,46 (_fit.py)', fins='раскрытие 0…90° без касаний корпуса'),
          sketchfab='в общем пакете с пусковой (Свои/HIMARS, l_himars_sketchfab.glb) - отдельного пакета нет (Mark 2026-11-10)')
json.dump(R_, open(os.path.join(DST, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
log('deliver.py: готово', PREV)
