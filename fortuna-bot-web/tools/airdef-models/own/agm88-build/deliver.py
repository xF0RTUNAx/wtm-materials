# AGM-88 HARM - сдача: превью, экспорт (Sketchfab в трёх качествах + игра), паспорт и отчёт. Mark: «Собирай» (2026-11-08). Запускается ПОСЛЕ build.py, _collide.py и bake.py:
#   HRM_OUT="<папка>" HRM_TEX=4096 HRM_NTEX=2048 /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python _collide.py --python bake.py --python deliver.py
# Уровень 2: deno run -A tools/airdef-models/preview-candidate.js w_agm88 "$F/agm88.glb" --out "$F/превью-игра" --tex 1024 --ntex 512
# Оба файла: рули в нейтрали (углы 0), башмаки сверху.
import os, sys, json, math
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk

OUT = os.environ.get('HRM_OUT')
if not OUT: raise SystemExit('Задай HRM_OUT=<папка модели>')
GAME_TEX, GAME_NTEX = int(os.environ.get('HRM_GAME_TEX', '1024')), int(os.environ.get('HRM_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('HRM_TEX', '4096')); SKETCH_NTEX = int(os.environ.get('HRM_NTEX', str(SKETCH_TEX)))
sc = bpy.data.scenes['AGM88']; bpy.context.view_layer.update()
st = mk.stats()
G = mk.GEO
objs = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
LEN = round(mx.y - mn.y, 3)
# размах средних крыльев по плоскости крыла (×): от кончика до кончика через ось
tips = []
for k in range(1, 5):
    o = bpy.data.objects[f'wing_c{k}']; e = mk.WING[k]['axis']
    tips.append(max((o.matrix_world @ v.co).dot(e) for v in o.data.vertices))
SPAN = round(2 * max(tips), 3)
tf = bpy.data.objects['HRM_tail']
TSPAN = round(2 * max(math.hypot(*(tf.matrix_world @ v.co).xz) for v in tf.data.vertices), 3)
print('длина', LEN, 'размах крыльев', SPAN, 'размах стабилизаторов', TSPAN)
os.makedirs(OUT + '/снимки', exist_ok=True)
BG = (0.62, 0.64, 0.66)
prev = [os.path.basename(p) for p in mk.previews(OUT, bg=BG, views=[
    ('превью_1_общий.png', Vector((0, 0.0, 0.0)), (-0.62, 0.55, 0.45), 6.0),
    ('превью_2_сбоку.png', Vector((0, 0, 0)), (-1.0, 0.0, 0.05), 6.4),
    ('превью_3_хвост.png', Vector((0, -1.75, 0.0)), (-0.6, -0.7, 0.3), 1.5),
    ('превью_4_головка.png', Vector((0, 1.3, 0.0)), (-0.75, 0.55, 0.2), 1.9)])]
mk.previews(OUT + '/снимки', size=(1600, 900), bg=BG, views=[
    ('правый_борт.png', Vector((0, 0, 0)), (1.0, 0.0, 0.05), 6.4),
    ('лючки_полосы.png', Vector((0, 0.85, 0.0)), (-1.0, 0.25, 0.12), 1.3),
    ('рули.png', Vector((0, 0.05, 0.05)), (-0.8, 0.45, 0.45), 1.5),
    ('подвеска.png', Vector((0, -0.75, 0.12)), (-0.5, -0.3, 0.8), 2.2),
    ('снизу.png', Vector((0, 0, 0)), (-0.45, 0.3, -0.84), 5.5)])
imgs = {m.name: [nd for nd in m.node_tree.nodes if nd.type == 'TEX_IMAGE' and nd.image is not None] for m in bpy.data.materials if m.name.startswith('HRM_') and m.node_tree}
def use(cpath, npath):
    lc = bpy.data.images.load(cpath, check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
    ln = bpy.data.images.load(npath, check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
    for nds in imgs.values():
        for nd in nds: nd.image = ln if nd.image.colorspace_settings.name == 'Non-Color' else lc
def lite(name, px, fmt):
    im = bpy.data.images['HRM_normal' if 'normal' in name else 'HRM_detail'].copy(); im.scale(px, px); im.file_format = fmt
    p_ = os.path.join(OUT, name)
    try: im.save(filepath=p_, quality=92)
    except TypeError:
        im.filepath_raw = p_; im.save()
    bpy.data.images.remove(im); return p_
# Sketchfab: три качества - 4K (основной), 2K, 1K
mk.export(OUT + '/agm88_sketchfab.glb', None)
use(lite('agm88_detail_2048.jpg', 2048, 'JPEG'), lite('agm88_normal_1024.png', 1024, 'PNG')); mk.export(OUT + '/agm88_sketchfab_2k.glb', None)
use(OUT + f'/agm88_detail_{GAME_TEX}.jpg', OUT + f'/agm88_normal_{GAME_NTEX}.png'); mk.export(OUT + '/agm88_sketchfab_1k.glb', None)
mk.export(OUT + '/agm88.glb', OUT + '/agm88.blend')
col = {}
try: col = json.load(open(os.path.join(OUT, '_live', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога _collide.py:', e)
tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_agm88', weapon='agm88', name='AGM-88 HARM', name_en='AGM-88 HARM', glb='agm88.glb', blend='agm88.blend', rev=1,
    build=['build.py', '_collide.py', 'bake.py', 'deliver.py'], previews_=prev,
    checks={'collisions': col, 'silhouette_iou': {'бок': 'наложение на фото 04 в масштабе (1830 пикс. = 4,17 м): длина, диаметр, стыки, крылья и хвост совпадают; IoU не считали'},
            'color': 'белая (линейно 0,90 / 0,90 / 0,885), проба сбоку sRGB ~235/237/238 при фото 01 ~200-220 и фото 04 ~241'},
    sketchfab={'title': 'AGM-88 HARM Anti-Radiation Missile',
               'lead': 'Air-launched anti-radiation missile AGM-88 HARM built for a game. White paint with orange, yellow and brown section bands, seams, screw rows, access hatches, a data plate and made-up small stencils (no real serial numbers), light grime and soot at the nozzle. Four double-delta mid-body control wings are separate parts on their real hinge axes; tail fins are fixed. Three rail hangers on the top.',
               'parts': ['ogive radome', 'four body sections', 'four movable control wings', 'four tail fins', 'three rail hangers', 'cable duct', 'umbilical connector', 'hollow nozzle'],
               'tags': ['agm-88', 'harm', 'anti-radiation', 'missile', 'air-to-ground', 'military', 'weapon', 'usaf', 'us-navy', 'game-ready', 'textured', 'blender'],
               'dimensions': f'length {LEN:.2f} m, body 0.254 m, wing span {SPAN:.2f} m',
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'based': 'Built from scratch in Blender from public photos.',
               'glb': 'agm88_sketchfab.glb'},
    notes=f'Ревизия 1 (2026-11-08). Форма и пропорции по фото 04 (сбоку, 1830 пикс. = 4,17 м), окраска по 01 и 04, подвеска по 02 и 04. Средние крылья - рули ±20°, стабилизаторы неподвижны. Маркировка придуманная. Модель {tris} тр.')
R['model']['length_m'] = LEN; R['model']['span_m'] = SPAN; R['model']['height_m'] = round(mx.z - mn.z, 3)
json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
pj['axes'] = 'glTF: нос -Z, верх +Y (башмаки подвески под направляющую), начало на оси корпуса посередине длины; средние крылья крестом ×, все углы 0'
parts = {}
for k in range(1, 5):
    W = mk.WING[k]
    parts[f'wing_c{k}'] = dict(pivot_gltf=G2(W['o']), axis_gltf=G2(W['axis']), range_deg=[-20.0, 20.0], neutral_deg=0.0,
                               note=f'средний руль двойной дельты, луч {W["phi"]:.0f}° от верха по часовой (вид с хвоста); ось вдоль размаха у корня, начало узла на оси; сквозная проверка ±20° через 1° - касаний нет')
pj['parts'] = parts
pj['fixed'] = 'HRM_body (с обтекателем и соплом), HRM_fixed (короб, 3 башмака, разъём, головки болтов), HRM_pivots (диски осей рулей), HRM_tail (4 стабилизатора с обтекателями) - неподвижны'
pj['nozzle_gltf'] = G2(Vector((0.0, mk.Yb_(G['A_END']), 0.0)))
pj['rail_top_gltf_y'] = round(G['SHOE_TOP'], 4)
pj['hangers_a_m'] = [2.26, 2.95, 3.54]
pj['spans_m'] = dict(wings=SPAN, tail=TSPAN, note='по плоскости крыла ×, от кончика до кончика')
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT, 'тр.', tris, 'длина', LEN, 'размах', SPAN)
