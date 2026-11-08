# GBU-39/B SDB - сдача: превью, экспорт (Sketchfab в трёх качествах + игра), паспорт и отчёт. Mark: «Собирай» (2026-11-08). Запускается ПОСЛЕ build.py, _collide.py и bake.py:
#   SDB_OUT="<папка>" SDB_TEX=4096 SDB_NTEX=2048 /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python _collide.py --python bake.py --python deliver.py
# Уровень 2: deno run -A tools/airdef-models/preview-candidate.js w_gbu39 "$F/gbu39.glb" --out "$F/превью-игра" --tex 1024 --ntex 512
# Файл игры: ушки вверх, крылья и короб снизу, всё сложено (углы 0); после сброса игра переворачивает на 180° (как УМПК, flip: true) - Mark: в полёте крыльями вверх.
# Файлы Sketchfab: полётное положение - перевёрнуто крыльями вверх, крылья и подкосы раскрыты.
import os, sys, json, math
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector, Matrix
import modelkit as mk

OUT = os.environ.get('SDB_OUT')
if not OUT: raise SystemExit('Задай SDB_OUT=<папка модели>')
GAME_TEX, GAME_NTEX = int(os.environ.get('SDB_GAME_TEX', '1024')), int(os.environ.get('SDB_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('SDB_TEX', '4096'))
sc = bpy.data.scenes['GBU39']; bpy.context.view_layer.update()
st = mk.stats()
G = mk.GEO
objs = [o for o in sc.objects if o.type == 'MESH']
MOV = {'wing1': 1, 'wing2': 2, 'wing1s': '1s', 'wing2s': '2s'}
BASE = {n: bpy.data.objects[n].matrix_world.copy() for n in MOV}
ORIG = {o.name: o.matrix_world.copy() for o in objs}
FLIP = Matrix.Rotation(math.pi, 4, 'Y')
def pose(t, flip):
    for o in objs: o.matrix_world = ORIG[o.name]
    for n, k in MOV.items():
        W = mk.WING[k]; p = BASE[n].translation.copy()
        bpy.data.objects[n].matrix_world = Matrix.Translation(p) @ Matrix.Rotation(math.radians(W['open_deg'] * t), 4, W['axis']) @ Matrix.Translation(-p) @ BASE[n]
    if flip:
        for o in objs: o.matrix_world = FLIP @ o.matrix_world
    bpy.context.view_layer.update()
def bbox():
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    return Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))), Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
pose(0.0, False); mn, mx = bbox(); LEN = round(mx.y - mn.y, 3); FOLD = [round(mx.x - mn.x, 3), round(mx.z - mn.z, 3), LEN]
pose(1.0, True); mn2, mx2 = bbox(); SPAN = round(mx2.x - mn2.x, 3)
print('длина', LEN, 'размах раскрытого', SPAN, 'сложенная (ширина, высота, длина)', FOLD)
os.makedirs(OUT + '/снимки', exist_ok=True)
BG = (0.62, 0.64, 0.66)
prev = [os.path.basename(p) for p in mk.previews(OUT, bg=BG, views=[
    ('превью_1_общий.png', Vector((0, 0.0, 0.05)), (-0.62, 0.55, 0.45), 3.6),
    ('превью_2_сверху.png', Vector((0, 0.0, 0.1)), (-0.2, 0.15, 1.0), 3.4),
    ('превью_3_сбоку.png', Vector((0, 0, 0.03)), (-1.0, 0.0, 0.08), 2.9),
    ('превью_4_хвост.png', Vector((0, -0.6, 0.0)), (-0.6, -0.7, 0.3), 1.0)])]
mk.previews(OUT + '/снимки', size=(1600, 900), bg=BG, views=[
    ('полёт_снизу.png', Vector((0, 0.0, 0.0)), (-0.45, 0.3, -0.84), 3.4),
    ('нос_полоса.png', Vector((0, 0.45, 0.0)), (-0.75, 0.55, 0.2), 0.9)])
mk.export(OUT + '/gbu39_sketchfab.glb', None)
imgs = [nd for m in bpy.data.materials if m.name.startswith('SDB_') and m.node_tree for nd in m.node_tree.nodes if nd.type == 'TEX_IMAGE' and nd.image is not None]
def use(cpath, npath):
    lc = bpy.data.images.load(cpath, check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
    ln = bpy.data.images.load(npath, check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
    for nd in imgs: nd.image = ln if nd.image.colorspace_settings.name == 'Non-Color' else lc
def lite(name, px, fmt):
    im = bpy.data.images['SDB_normal' if 'normal' in name else 'SDB_detail'].copy(); im.scale(px, px); im.file_format = fmt
    p_ = os.path.join(OUT, name)
    try: im.save(filepath=p_, quality=92)
    except TypeError:
        im.filepath_raw = p_; im.save()
    bpy.data.images.remove(im); return p_
use(lite('gbu39_detail_2048.jpg', 2048, 'JPEG'), lite('gbu39_normal_1024.png', 1024, 'PNG')); mk.export(OUT + '/gbu39_sketchfab_2k.glb', None)
use(OUT + f'/gbu39_detail_{GAME_TEX}.jpg', OUT + f'/gbu39_normal_{GAME_NTEX}.png'); mk.export(OUT + '/gbu39_sketchfab_1k.glb', None)
pose(0.0, False)
mk.previews(OUT + '/снимки', size=(1600, 900), bg=BG, views=[
    ('подвеска_как_в_игре.png', Vector((0, 0, 0)), (-0.75, 0.85, 0.5), 3.0),
    ('сложено_снизу.png', Vector((0, 0, -0.05)), (-0.55, -0.45, -0.7), 2.6)])
mk.export(OUT + '/gbu39.glb', OUT + '/gbu39.blend')
col = {}
try: col = json.load(open(os.path.join(OUT, '_live', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога _collide.py:', e)
tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_gbu39', weapon='gbu39', name='GBU-39/B SDB', name_en='GBU-39 SDB', glb='gbu39.glb', blend='gbu39.blend', rev=1,
    build=['build.py', '_collide.py', 'bake.py', 'deliver.py'], previews_=prev,
    checks={'collisions': col, 'silhouette_iou': {'сверху': 'пропорции сняты с фото 03 (456 пикс. = 1,80 м); IoU не считали - 02 и 05 чужие рендеры в перспективе'},
            'color': 'серо-голубая (линейно 0,47 / 0,51 / 0,585), проба сбоку sRGB ~183/191/205 при фото 02 ~184/191/208, 05 ~140/158/184, 01 ~119/119/131; хвост 136 при 02 136'},
    sketchfab={'title': 'GBU-39/B Small Diameter Bomb',
               'lead': 'Small glide bomb GBU-39/B SDB built for a game. Blue-grey paint with a yellow warhead band, brown nose cap, black wing pack, bare metal tail kit, seams, screw rows, hatches, a data plate and made-up small stencils (no real serial numbers). Diamond Back wing: two panels on one pivot and two struts on their own pivots, all separate parts on real axes; here they are open, in flight pose. Fixed tail fins.',
               'parts': ['nose cap', 'body sections', 'black wing pack', 'two wing panels', 'two wing struts', 'pivot pins', 'tail kit with actuator covers', 'four tail fins', 'two suspension lugs', 'connector'],
               'tags': ['gbu-39', 'sdb', 'small-diameter-bomb', 'glide-bomb', 'bomb', 'military', 'weapon', 'usaf', 'game-ready', 'textured', 'blender', 'diamond-back'],
               'dimensions': f'length {LEN:.2f} m, body 0.19 m, wing span {SPAN:.2f} m',
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'based': 'Built from scratch in Blender from public pictures.',
               'glb': 'gbu39_sketchfab.glb'},
    notes=f'Ревизия 1 (2026-11-08). Форма по фото 03 (сверху) и 02 (хвост, короб), схема крыла по 01. В файле игры ушки вверх, крылья снизу сложены; после сброса - переворот 180° (крыльями вверх, как УМПК), затем раскрытие. Надписи читаются крыльями вверх. Маркировка придуманная. Модель {tris} тр.')
R['model']['length_m'] = LEN; R['model']['span_m'] = SPAN; R['model']['height_m'] = FOLD[1]
json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
pj['axes'] = 'glTF: нос -Z, верх +Y (ушки), начало на оси корпуса посередине длины. Крылья и подкосы сложены под коробом снизу, все углы 0'
pj['flip'] = True
pj['flip_note'] = 'после сброса повернуть на 180° вокруг продольной оси (как УМПК, flip: true) - Mark: в полёте крыльями вверх, надписи читаются в этом положении; затем раскрыть крыло'
pj['folded_size_m'] = dict(width=FOLD[0], height=FOLD[1], length=FOLD[2], note='сложено, с ушками и рулями')
parts = {}
notes = {1: 'левая консоль (к x+); общая вертикальная ось с wing2 под коробом, a = 0,63 м от носа; в сложенном лежит назад, над wing2',
         2: 'правая консоль (к x-); та же ось, что у wing1; в сложенном лежит назад, под wing1',
         '1s': 'подкос wing1: своя вертикальная ось позади (a = 0,93 м, x +0,03); в сложенном лежит назад над крыльями; при линейном повороте конец скользит вдоль wing1',
         '2s': 'подкос wing2: своя вертикальная ось позади (a = 0,93 м, x -0,03); в сложенном лежит назад над крыльями; при линейном повороте конец скользит вдоль wing2'}
for n, k in MOV.items():
    W = mk.WING[k]
    parts[n] = dict(pivot_gltf=G2(W['o']), axis_gltf=G2(W['axis']), open_deg=round(W['open_deg'], 1), folded_deg=0.0, note=notes[k])
pj['parts'] = parts
pj['deploy'] = 'все четыре узла wing* поворачиваются одновременно и линейно от 0 до open_deg; ' + (
    'наибольший зазор конца подкоса до крыла: ' + ', '.join(f"{k_}: {v_['наибольший'] * 100:.1f} см (сложено {v_['сложено'] * 100:.1f}, на половине {v_['половина'] * 100:.1f}, раскрыто {v_['раскрыто'] * 100:.1f})" for k_, v_ in col.get('зазор_подкос_крыло_м', {}).items()) if col else '')
pj['fixed'] = 'SDB_body (с хвостовым отсеком), SDB_pack (чёрный короб крыльев), SDB_fixed (ушки, кожухи приводов, разъём, болты фланца), SDB_fins (4 руля ×), SDB_pins (оси-пальцы) - неподвижны'
pj['lugs_a_m'] = list(G['LUGS'])
pj['tail_gltf'] = G2(Vector((0.0, mk.Yb_(G['L']), 0.0)))
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT, 'тр.', tris, 'длина', LEN, 'размах', SPAN, 'сложенная', FOLD)
