# deliver.py - сдача Х-59МК2 (после bake2.py; атласы берутся готовые из _ультра, MK2_REUSE=1):
#   kh59mk2.glb (игра: крыло СЛОЖЕНО вдоль спины, рули в нейтрали; цвет JPEG 1024, ORM и нормали PNG 512; крыло и рули вдвое меньше), kh59mk2.blend (полные атласы),
#   kh59mk2_sketchfab.glb (крыло раскрыто, 4096), _2k, _1k, kh59mk2_folded_sketchfab.glb (сложено, как на подвеске), превью, ПАСПОРТ.json, ОТЧЁТ.json.
#   Blender -b --factory-startup --python deliver.py      (MK2_SHOTS=имена - только эти кадры, без экспорта)
import os, json, math
import bpy
from mathutils import Vector
os.environ.setdefault('MK2_REUSE', '1')
_here = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Х-59МК2'
os.environ.setdefault('MK2_OUT', os.path.join(_here, '_ультра'))
_p = os.path.join(_here, 'bake2.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
DST = _here; BASE = 'kh59mk2'; GAME_TEX, GAME_NTEX = 1024, 512
TEXD = os.path.join(DST, 'текстуры'); os.makedirs(TEXD, exist_ok=True)
for _n in ('Cube', 'Light', 'Camera'):
    if _n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[_n], do_unlink=True)
keep = [o for o in COL.objects if o.type == 'MESH']
NODES = {tag: [n for n in bpy.data.materials[f'MK2_{tag}'].node_tree.nodes if n.type == 'TEX_IMAGE'] for tag in RES}
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
    """подставить в материалы картинки нужного размера (крыло и рули - вдвое меньше корпуса)"""
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
cam = bpy.data.objects.new('V_cam', bpy.data.cameras.new('V_cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.clip_start = 0.02
SHOTS = [('превью_1_общий', (-4.3, 5.0, 1.7), (0, 0.15, 0.0), 40, (1920, 1080), (0, 0)), ('превью_2_сбоку', (-10, 0, 0), (0, 0, 0), 'o6.2', (1920, 640), (0, 0)),
         ('превью_3_нос', (-0.95, 3.65, 0.18), (0, 2.35, -0.03), 45, (1600, 1000), (0, 0)), ('превью_4_хвост', (1.0, -3.9, 0.5), (0, -2.45, 0.0), 45, (1600, 1000), (0, 0)),
         ('превью_5_раскрыто', (3.0, -3.4, 1.4), (0, -0.3, 0.0), 40, (1920, 1080), (0.6, 1.0)),
         ('снимки/окно', (-0.50, 3.60, -0.32), (0, 2.78, -0.06), 55, (1600, 1000), (0, 0)), ('снимки/надпись', (-1.6, 0.62, 0.2), (0, 0.55, 0.0), 35, (1920, 1080), (0, 0)),
         ('снимки/лючок', (-1.0, 1.75, 0.12), (0, 1.55, 0.0), 45, (1600, 1000), (0, 0)), ('снимки/сверху_раскрыто', (-1.6, -1.2, 3.3), (0, 0.0, 0.0), 35, (1920, 1080), (0, 1.0)),
         ('снимки/справа', (10, 0, 0), (0, 0, 0), 'o6.2', (1920, 640), (0, 0)), ('снимки/сверху_сложено', (0, 0, 10), (0, 0, 0), 'o6.2', (1920, 640), (0, 0))]
os.makedirs(os.path.join(DST, 'снимки'), exist_ok=True); PREV = []
ONLY = [x for x in os.environ.get('MK2_SHOTS', '').split(',') if x]
for name, pos, tgt, f, res, ps in SHOTS:
    if ONLY and name not in ONLY: continue
    pose(*ps); cam.location = Vector(pos); cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.resolution_x, sc.render.resolution_y = res
    if isinstance(f, str): cam.data.type = 'ORTHO'; cam.data.ortho_scale = float(f[1:])
    else: cam.data.type = 'PERSP'; cam.data.lens = f
    sc.render.filepath = os.path.join(DST, name + '.png'); bpy.ops.render.render(write_still=True); log('снимок', name)
    if name.startswith('превью'): PREV.append(name + '.png')
pose(0.0, 0.0)
if ONLY: log('только кадры', ONLY); raise SystemExit(0)
bpy.data.objects.remove(cam, do_unlink=True); bpy.data.objects.remove(sun, do_unlink=True)
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]


def bbox():
    bpy.context.view_layer.update(); pts = [o.matrix_world @ v.co for o in keep for v in o.data.vertices]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return dict(length=round(mx.y - mn.y, 3), width=round(mx.x - mn.x, 3), height=round(mx.z - mn.z, 3)), mn, mx


SZ_F, mnF, mxF = bbox(); pose(0.0, 1.0); SZ_D, _, _ = bbox(); pose(0.0, 0.0)
# ── Sketchfab: полные атласы (корпус 4096), крыло раскрыто; сложенная - отдельным файлом; облегчённые 2K / 1K
for tag in RES:
    for n, im0, path in ORIG[tag]:
        if '_color' in path: n.image = bpy.data.images.load(scaled(path, SIZES[tag], 'JPEG'), check_existing=True)
export(os.path.join(DST, BASE + '_folded_sketchfab.glb'))
pose(0.0, 1.0); export(os.path.join(DST, BASE + '_sketchfab.glb'))
use_set(2048, 1024, 2048); export(os.path.join(DST, BASE + '_sketchfab_2k.glb'))
use_set(1024, 512, 1024); export(os.path.join(DST, BASE + '_sketchfab_1k.glb'))
pose(0.0, 0.0)
# ── игра: крыло сложено, цвет 1024, ORM и нормали 512 (крыло и рули - 512 / 256)
use_set(GAME_TEX, GAME_NTEX, GAME_NTEX); glb = os.path.join(DST, BASE + '.glb'); export(glb)
for tag in RES:
    for n, im0, path in ORIG[tag]: n.image = im0
for im in bpy.data.images:
    if im.filepath: im.filepath = bpy.path.relpath(bpy.path.abspath(im.filepath), start=DST)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(DST, BASE + '.blend'), copy=True, relative_remap=True, compress=True)
tri = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in keep)
parts = {}
for n, W in MOVE.items():
    if W['kind'] != 'fin': continue
    o = bpy.data.objects[n]; parts[n] = dict(pivot_gltf=G2(o.matrix_world.translation), axis_gltf=G2(W['axis']), lim_deg=list(W['lim']), neutral_deg=0.0,
                                         note='руль крестом «×», цельноповоротный вокруг радиальной оси посередине корня; обтекатель корня (boots) неподвижен')
wpiv = bpy.data.objects['wing'].matrix_world.translation.copy(); WAX = G2(wpiv) + [-90]
col = {}
try: col = json.load(open(os.path.join(DST, '_live', 'collide.json'), encoding='utf-8'))
except Exception as e: log('нет итога _collide.py:', e)
w_u, w_l, top, bot, zl, nn = prof(TAIL['a1']); cz = (top + bot) / 2
noz = dict(exit_gltf=G2(Vector((0.0, YA(NOZ['a_end']), cz))), dir_gltf=[0.0, 0.0, 1.0], r=NOZ['r_out'], note='срез обечайки сопла на заднем торце, ось сопла - посередине высоты хвоста (на 15 мм ниже оси корпуса); струя назад (+Z glTF)')
SRC = ['02-07 - картинки Mark (выставочная МК2 гранёного варианта, витринная модель 05 - вид сверху: ось крыла 0,49 длины, размах 0,5 длины)',
       '10-13 МАКС-2015, Виталий Кузьмин - https://commons.wikimedia.org/wiki/File:Kh-59MK2_missile_at_MAKS-2015_01.jpg … _04.jpg (CC BY-SA 4.0) - только для сверки формы, в модель не перенесено ничего',
       '14-17 МАКС-2009, Армия-2022/2023 (CC BY-SA) - ранняя круглая МК2 и Х-59МК, для формы не брались',
       '18-19 обломки Х-59 (CC BY) - для сверки рулей']
P = dict(key='w_kh59mk2', weapon='kh59mk2', name='Х-59МК2', name_en='Kh-59MK2', rev=1, own=True,
         files=dict(glb=BASE + '.glb', blend=BASE + '.blend', sketchfab=[BASE + '_sketchfab.glb', BASE + '_sketchfab_2k.glb', BASE + '_sketchfab_1k.glb', BASE + '_folded_sketchfab.glb'],
                    build=['mk2kit.py', 'build.py', '_paint.py', 'make_decals.py', 'bake2.py', 'deliver.py', '_collide.py', '_views.py', '_sheet.py', '_trial.py', '_trial_sheet.py']),
         tex=GAME_TEX, nTex=GAME_NTEX, ormTex=GAME_NTEX,
         axes='glTF: нос −Z, верх +Y, начало на оси корпуса посередине длины 5,70 м; nose -z, scale 1 (своя модель)',
         size_m=dict(folded=SZ_F, deployed=SZ_D, body_width=round(2 * BODY['w'], 3), body_height=round(BODY['top'] - BODY['bot'], 3), wing_span=WING['span'], fin_span_tip_to_tip=round(SZ_F['width'], 3)),
         size_note='Длина 5,70 м - как у прежней модели в игре (5,69): чертежа с линейкой нет, остальные размеры сняты с фото в пропорции к длине. '
                   'В игровом файле крыло сложено вдоль спины: габарит на подвеске = folded (ширина - по рулям). Раскрытое крыло - 2,84 м.',
         wingAx={'wing': WAX},
         wings='deploy',
         wing_note='Одно цельное крыло на оси сверху (узел wing). В файле СЛОЖЕНО вдоль корпуса; раскрытие - поворот на −90° вокруг вертикали (glTF Y) через ось wingAx.wing [x, y, z, градусы]. '
                   'Крыло узкое (|x| ≤ 0,15 м), поэтому models.js не делит его на половины. Ход 0…−90° проверен _collide.py: касаний с корпусом, бугелями, рулями нет. Сложенное лежит в 3 мм над спиной по всей длине.',
         parts=parts,
         parts_note='fin1…fin4 - рули крестом «×» (45°), цельноповоротные ±15° вокруг axis_gltf через pivot_gltf; в игре можно не двигать. boots - неподвижные обтекатели корней рулей (часть корпуса). '
                    'В нейтрали корень руля утоплен в обтекатель; при полном отклонении концы корня выходят над обтекателем, как у настоящего цельноповоротного руля. Складывания рулей нет (на фото раскрыты).',
         nozzle_gltf=noz['exit_gltf'], nz=noz['exit_gltf'], nozzle=noz,
         glass='window - окно ГСН под «клювом»: своё тёмное стекло MK2_window (лак, без текстур), не запекается',
         intake='Воздухозаборник ни на одном фото гранёной МК2 не виден - на модели его нет (корпус снизу гладкий).',
         swap_notes=['Подмена по фразе «модель Х-59МК2 готова»: integrate-own.js с этой папкой, НОВЫЙ ключ w_kh59mk2, оружие kh59mk2. В models.js у w_kh59m оставить weapon \'kh59m\' (сейчас [\'kh59m\', \'kh59mk2\']).',
                     "META w_kh59mk2: { weapon: 'kh59mk2', lazy: true, wings: 'deploy', wingAx: { wing: " + json.dumps(WAX) + " }, stations: [] } - крыло раскрывается после пуска, как у Tomahawk.",
                     'nose: -z, scale 1 (своя модель); prepare.js - рецепт для своей модели, groups: /(^|\\/)(wing|fin\\d)(\\/|$)/ (wing - раскрытие, fin1…4 - рули), остальное body (в т.ч. boots, window).',
                     'Окно ГСН - свой материал MK2_window (тёмное стекло с лаком), не прозрачный.',
                     'Сопло для факела: nozzle_gltf / nz ' + json.dumps(noz['exit_gltf']) + ' (на заднем торце, ось сопла на 15 мм ниже оси корпуса); arsenal kh59mk2: vis L 5.7.',
                     'Посадка: seats-gen.js для kh59mk2 (длина 5,70, габарит сложенной - size_m.folded): Су-57 «Ракеты: Х-59МК2 + Х-29Т» - на внешней подвеске; Су-35С «Х-59МК2 ×2 + КАБ-500С ×2».',
                     'Иконка wpn:kh59mk2 - перепечь (thumbs-bake.js), ktx-models.js w_kh59mk2, GLB_V w_kh59mk2 - новая версия.',
                     'Кредитов чужих авторов нет: модель, краска, трафареты и знак - свои (CC0-маски ambientCG в окраске, как у остальных своих моделей).'],
         sources=SRC,
         notes='Ревизия 1 (2026-11-15). Форма по фото МАКС-2015 (гранёный вариант), одобрена Mark после правок: спина носа ровная, скругление в плане; рули и крыло прилегают плотно; '
               'ступенька спины перенесена за конец сложенного крыла (4,60 м, у оси на фото - Mark выбрал «поднять заднюю спину»). Окраска - светло-серая краска, одобрена Mark 2026-11-15 («запекай»). '
               'Надпись «Х-59МК2» синяя, знак завода заменён своим, все номера и трафареты выдуманы (make_decals.py).')
json.dump(P, open(os.path.join(DST, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
R_ = dict(name_en='Kh-59MK2', rev=1, previews=PREV,
          model=dict(tris=tri, folded=SZ_F, deployed=SZ_D, glb_mb=round(os.path.getsize(glb) / 1e6, 2)),
          textures=dict(full=f'корпус {SIZE}, крыло и рули {SIZE // 2} (цвет, ORM, нормали)', game='корпус: цвет 1024 JPEG, ORM и нормали 512 PNG; крыло и рули вдвое меньше',
                        normal='с детальной копии: фаски 4 мм корпус / 1,5 мм остальное + швы, лючки, винты'),
          checks=dict(collisions=col, color='светло-серая краска (линейно 0,70 / 0,715 / 0,73): медиана борта на пробе sRGB 204 при фото 11 около 175-195 - не темнее'),
          sketchfab=dict(title='Kh-59MK2 Stealthy Cruise Missile', glb=BASE + '_sketchfab.glb',
                         lead='Russian Kh-59MK2 cruise missile in its faceted low-observable shape, built for a game from exhibition photos. Flat "duck-bill" nose with a dark seeker window, one-piece wing on a pivot over the spine, four all-moving tail fins and a round turbofan nozzle. Light grey paint with panel lines, screwed hatches, blue name and made-up stencils, light grime and nozzle soot. A second file shows the wing folded, as carried under the aircraft.',
                         parts=['faceted body', 'seeker window', 'pivoting wing', 'four tail fins', 'fin root fairings', 'nozzle with centre body', 'suspension lugs'],
                         tags=['kh-59', 'kh-59mk2', 'missile', 'cruise-missile', 'air-to-surface', 'stealth', 'russian', 'military', 'weapon', 'game-ready', 'pbr'],
                         dimensions=f"length {SZ_F['length']:.2f} m, body {2 * BODY['w']:.2f} x {BODY['top'] - BODY['bot']:.2f} m, wing span {WING['span']:.2f} m",
                         textures=f'{SIZE} px baked colour, ORM and normal maps; 2K and 1K versions included',
                         based='Built from scratch in Blender from public photos.'))
json.dump(R_, open(os.path.join(DST, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
log('deliver.py: готово', BASE, 'тр.', tri, PREV, 'сопло', noz['exit_gltf'], 'wingAx', WAX, 'габарит сложено', SZ_F, 'раскрыто', SZ_D)
