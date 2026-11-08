# Б-8 - сдача: превью, экспорт (Sketchfab в трёх качествах + игра), паспорт и отчёт. Ревизия 2 (главный чат, 2026-11-08): выступающие носы - в cone, утопленные носы - в heli. Запускается ПОСЛЕ build.py, _collide.py и bake.py:
#   B8_OUT="<папка>" B8_TEX=4096 B8_NTEX=2048 /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python _collide.py --python bake.py --python deliver.py
# Уровень 2: deno run -A tools/airdef-models/preview-candidate.js w_b8 "$F/b8.glb" --out "$F/превью-игра" --tex 1024 --ntex 512
# Оба файла - с обтекателем cone (отдельный узел: спрятать - вертолётный вид). Ракеты выдвинуты в острую часть (Mark), без обтекателя торчат из торца - так и оставлено.
import os, sys, json, math
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk

OUT = os.environ.get('B8_OUT')
if not OUT: raise SystemExit('Задай B8_OUT=<папка модели>')
GAME_TEX, GAME_NTEX = int(os.environ.get('B8_GAME_TEX', '1024')), int(os.environ.get('B8_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('B8_TEX', '4096'))
sc = bpy.data.scenes['B8']; bpy.context.view_layer.update()
G = mk.GEO
objs = [o for o in sc.objects if o.type == 'MESH']
cone = bpy.data.objects['cone']
def variant(v):                                     # рендер: 'cone' - Б-8М1, 'heli' - Б-8В20
    for o in sc.objects:
        if o.name == 'cone' or o.name.startswith('cone_r'): o.hide_render = (v != 'cone')
        if o.name == 'heli' or o.name.startswith('heli_r'): o.hide_render = (v != 'heli')
def only(v):                                        # экспорт для Sketchfab: убрать из коллекции узлы другого вида
    out_ = []
    for o in list(mk.col.objects):
        drop = (o.name == 'heli' or o.name.startswith('heli_r')) if v == 'cone' else (o.name == 'cone' or o.name.startswith('cone_r'))
        if drop: mk.col.objects.unlink(o); out_.append(o)
    return out_
def back(lst):
    for o in lst: mk.col.objects.link(o)
variant('cone')
pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
LEN_ALL = round(mx.y - mn.y, 3); DIA = round(2 * G['R'], 3)
tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
print('длина с обтекателем', LEN_ALL, 'корпус', G['L'], 'обтекатель', G['L_CONE'], 'тр.', tris)
os.makedirs(OUT + '/снимки', exist_ok=True)
BG = (0.62, 0.64, 0.66)
prev = [os.path.basename(p) for p in mk.previews(OUT, bg=BG, views=[
    ('превью_1_общий.png', Vector((0, 0.3, 0.0)), (-0.62, 0.55, 0.40), 4.6),
    ('превью_2_обтекатель.png', Vector((0, 1.15, 0.0)), (-0.45, 0.85, 0.25), 2.0),
    ('превью_3_сбоку.png', Vector((0, 0.45, 0)), (-1.0, 0.0, 0.06), 4.6),
    ('превью_4_сзади.png', Vector((0, -0.85, 0.0)), (-0.45, -0.85, 0.25), 1.8)])]
mk.previews(OUT + '/снимки', size=(1600, 900), bg=BG, views=[
    ('правый_борт.png', Vector((0, 0.45, 0)), (1.0, 0.0, 0.06), 4.6),
    ('упоры_метки.png', Vector((0, 0.3, 0.2)), (-0.45, 0.35, 0.8), 1.6),
    ('снизу.png', Vector((0, 0.3, -0.1)), (-0.4, -0.3, -0.85), 4.0)])
variant('heli')
mk.previews(OUT + '/снимки', size=(1600, 900), bg=BG, views=[
    ('без_обтекателя.png', Vector((0, 0, 0.0)), (-0.62, 0.55, 0.40), 3.8),
    ('без_обтекателя_торец.png', Vector((0, 0.85, 0.0)), (-0.45, 0.85, 0.25), 1.8)])
variant('cone')
tmp = only('cone'); mk.export(OUT + '/b8_sketchfab.glb', None); back(tmp)
tmp = only('heli'); mk.export(OUT + '/b8_sketchfab_heli.glb', None); back(tmp)
imgs = [nd for m in bpy.data.materials if m.name.startswith('B8_') and m.node_tree for nd in m.node_tree.nodes if nd.type == 'TEX_IMAGE' and nd.image is not None]
def use(cpath, npath):
    lc = bpy.data.images.load(cpath, check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
    ln = bpy.data.images.load(npath, check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
    for nd in imgs: nd.image = ln if nd.image.colorspace_settings.name == 'Non-Color' else lc
def lite(name, px, fmt):
    im = bpy.data.images['B8_normal' if 'normal' in name else 'B8_detail'].copy(); im.scale(px, px); im.file_format = fmt
    p_ = os.path.join(OUT, name)
    try: im.save(filepath=p_, quality=92)
    except TypeError:
        im.filepath_raw = p_; im.save()
    bpy.data.images.remove(im); return p_
use(lite('b8_detail_2048.jpg', 2048, 'JPEG'), lite('b8_normal_1024.png', 1024, 'PNG')); tmp = only('cone'); mk.export(OUT + '/b8_sketchfab_2k.glb', None); back(tmp)
use(OUT + f'/b8_detail_{GAME_TEX}.jpg', OUT + f'/b8_normal_{GAME_NTEX}.png'); tmp = only('cone'); mk.export(OUT + '/b8_sketchfab_1k.glb', None); back(tmp)
mk.export(OUT + '/b8.glb', OUT + '/b8.blend')
col = {}
try: col = json.load(open(os.path.join(OUT, '_live', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога _collide.py:', e)
R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_b8', weapon='s8', name='Б-8', name_en='B-8 rocket pod with S-8', glb='b8.glb', blend='b8.blend', rev=2,
    build=['build.py', '_collide.py', 'bake.py', 'deliver.py'], previews_=prev,
    checks={'collisions': col, 'silhouette_iou': {'бок': 'пропорции по фото 04 относительно Ø 0,52 м: корпус 1,70 м, обтекатель ~0,90 м; вырезы и остриё по 01 и 03'},
            'color': 'металл (линейно 0,42 / 0,43 / 0,44), проба сбоку sRGB ~129-135 при фото 01 ~175-188, 04 ~92, 05 ~122, 03 ~95'},
    sketchfab={'title': 'B-8M1 Rocket Pod with S-8 Rockets',
               'lead': 'Soviet B-8M1 rocket pod for 20 S-8 rockets, built for a game. Bare worn metal with oxide stains, scratches, red marker stripes, red numbers and made-up stencils (no real serial numbers), riveted seams, a data plate and a belly hatch. The pointed nose fairing with 20 cutouts is a separate node; without it the pod looks like the helicopter version. Twenty rockets are separate nodes and reach the fairing cutouts; rear tubes are open.',
               'parts': ['pod body with 20 tubes', 'pointed nose fairing with cutouts', 'suspension lugs and sway brace pads', 'connector', '20 S-8 rockets as separate nodes'],
               'tags': ['b-8', 'b-8m1', 'rocket-pod', 's-8', 'rocket', 'soviet', 'russian', 'military', 'weapon', 'game-ready', 'textured', 'blender'],
               'dimensions': f'body {G["L"]:.2f} m, with fairing {LEN_ALL:.2f} m, diameter {DIA:.2f} m',
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'based': 'Built from scratch in Blender from public photos.',
               'glb': 'b8_sketchfab.glb'},
    notes=f'Ревизия 1 (2026-11-08). Корпус 1,70 × 0,52 м и обтекатель 0,90 м по фото 04; 20 труб 13 + 7 (остриё целое, фото 01/03). Обтекатель - узел cone. Ракеты - упрощённая копия нашей С-8, выдвинуты в острую часть (Mark), без обтекателя торчат - так оставлено (Mark). Маркировка придуманная. Модель {tris} тр.')
R['model']['length_m'] = LEN_ALL; R['model']['span_m'] = DIA; R['model']['height_m'] = round(mx.z - mn.z, 3)
json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
Yb = mk.Yb_
pj['axes'] = 'glTF: перёд (обтекатель, носы ракет) -Z, верх +Y (серьги), начало на оси посередине длины КОРПУСА 1,70 м без обтекателя - без cone блок не смещается'
pj['cone'] = dict(node='cone', length_m=G['L_CONE'], note='обтекатель Б-8М1 с 20 вырезами и латунным носком - отдельный узел; спрятать (visible = false) - вертолётный Б-8В20 с плоским передним торцом')
pj['tube_axis_gltf'] = [0.0, 0.0, -1.0]
pj['muzzle_gltf'] = [G2(Vector((cx, Yb(0.0), cz))) for cx, cz in G['TUBES']]
pj['rockets'] = dict(nodes=[f'r{i}' for i in range(20)], order='r0..r19 - порядок пуска: внешний круг (r0..r12) по часовой стрелке от верха, если смотреть спереди; затем внутренний (r13..r19) так же',
                     node_origin='узел ракеты - остриё взрывателя на оси своей трубы; ракета вдоль tube_axis_gltf назад',
                     nose_out_m=dict(outer_r0_r12=G['TIP_OUT'][0], inner_r13_r19=G['TIP_OUT'][1], note='насколько остриё выходит вперёд переднего торца корпуса (muzzle_gltf): носы у вырезов обтекателя (Mark); без обтекателя торчат - так оставлено (Mark)'),
                     tube_inner_r_m=G['R_H'], shared_mesh='все 20 узлов делят одну сетку r0 - прятать узлом (visible = false)', note='ракета - упрощённая копия нашей С-8 (w_nar_s8), длина 1,56 м')
pj['heli'] = dict(node='heli', note='вертолётный Б-8В20: кольца срезов труб и 20 утопленных носов heli_r0..heli_r19 (остриё на 12 мм глубже среза). Игра показывает либо cone (самолёты), либо heli (вертолёты)')
pj['rocket_parts'] = dict(cut_a_m=G['A_CUT'], r='r0..r19 - задняя часть ракеты в трубе (за плоскостью разреза), общая для обоих видов',
                         cone_r='cone_r0..cone_r19 - передняя часть (нос до разреза) - дочерние узлы cone', heli_r='heli_r0..heli_r19 - утопленные носы - дочерние узлы heli',
                         launch='при пуске ракеты i прятать r{i} и cone_r{i} / heli_r{i} того же номера')
tv = lambda drop: sum(len(p.vertices) - 2 for o in objs if not drop(o.name) for p in o.data.polygons)
pj['tris_visible'] = dict(cone_view=tv(lambda n: n == 'heli' or n.startswith('heli_r')), heli_view=tv(lambda n: n == 'cone' or n.startswith('cone_r')), file=tris)
pj['lugs_gltf'] = [G2(Vector((0, Yb(a), G['R'] + 0.030))) for a in G['LUGS']]
pj['fixed'] = 'B8_body (корпус с трубами), B8_fixed (планка, серьги 250 мм, площадки упоров, разъём) - неподвижны; cone - снимаемый обтекатель'
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT, 'тр.', tris, 'длина', LEN_ALL)
