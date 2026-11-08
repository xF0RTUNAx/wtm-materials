# LAU-61 - сдача: превью, экспорт (Sketchfab в трёх качествах + игра), паспорт и отчёт. Mark: «Собирай» (2026-11-08). Запускается ПОСЛЕ build.py, _collide.py и bake.py:
#   LAU_OUT="<папка>" LAU_TEX=4096 LAU_NTEX=2048 /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python _collide.py --python bake.py --python deliver.py
# Уровень 2: deno run -A tools/airdef-models/preview-candidate.js w_lau61 "$F/lau61.glb" --out "$F/превью-игра" --tex 1024 --ntex 512
import os, sys, json, math
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk

OUT = os.environ.get('LAU_OUT')
if not OUT: raise SystemExit('Задай LAU_OUT=<папка модели>')
GAME_TEX, GAME_NTEX = int(os.environ.get('LAU_GAME_TEX', '1024')), int(os.environ.get('LAU_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('LAU_TEX', '4096'))
sc = bpy.data.scenes['LAU61']; bpy.context.view_layer.update()
G = mk.GEO
objs = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
LEN_ALL = round(mx.y - mn.y, 3); DIA = round(2 * G['R'], 3)
tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
print('длина с носами', LEN_ALL, 'корпус', G['L'], 'диаметр', DIA, 'тр.', tris)
os.makedirs(OUT + '/снимки', exist_ok=True)
BG = (0.62, 0.64, 0.66)
prev = [os.path.basename(p) for p in mk.previews(OUT, bg=BG, views=[
    ('превью_1_общий.png', Vector((0, 0.0, 0.0)), (-0.62, 0.55, 0.40), 3.4),
    ('превью_2_торец.png', Vector((0, 0.85, 0.0)), (-0.45, 0.85, 0.25), 1.35),
    ('превью_3_сбоку.png', Vector((0, 0, 0)), (-1.0, 0.0, 0.06), 3.2),
    ('превью_4_сзади.png', Vector((0, -0.85, 0.0)), (-0.45, -0.85, 0.25), 1.35)])]
mk.previews(OUT + '/снимки', size=(1600, 900), bg=BG, views=[
    ('торец_в_лоб.png', Vector((0, 0.85, 0.0)), (-0.05, 1.0, 0.04), 1.15),
    ('проушины_разъём.png', Vector((0, 0.0, 0.18)), (-0.45, 0.35, 0.8), 1.2),
    ('снизу.png', Vector((0, 0, -0.1)), (-0.4, -0.3, -0.85), 2.6)])
mk.export(OUT + '/lau61_sketchfab.glb', None)
imgs = [nd for m in bpy.data.materials if m.name.startswith('LAU_') and m.node_tree for nd in m.node_tree.nodes if nd.type == 'TEX_IMAGE' and nd.image is not None]
def use(cpath, npath):
    lc = bpy.data.images.load(cpath, check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
    ln = bpy.data.images.load(npath, check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
    for nd in imgs: nd.image = ln if nd.image.colorspace_settings.name == 'Non-Color' else lc
def lite(name, px, fmt):
    im = bpy.data.images['LAU_normal' if 'normal' in name else 'LAU_detail'].copy(); im.scale(px, px); im.file_format = fmt
    p_ = os.path.join(OUT, name)
    try: im.save(filepath=p_, quality=92)
    except TypeError:
        im.filepath_raw = p_; im.save()
    bpy.data.images.remove(im); return p_
use(lite('lau61_detail_2048.jpg', 2048, 'JPEG'), lite('lau61_normal_1024.png', 1024, 'PNG')); mk.export(OUT + '/lau61_sketchfab_2k.glb', None)
use(OUT + f'/lau61_detail_{GAME_TEX}.jpg', OUT + f'/lau61_normal_{GAME_NTEX}.png'); mk.export(OUT + '/lau61_sketchfab_1k.glb', None)
mk.export(OUT + '/lau61.glb', OUT + '/lau61.blend')
col = {}
try: col = json.load(open(os.path.join(OUT, '_live', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога _collide.py:', e)
R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_lau61', weapon='hydra', name='LAU-61', name_en='LAU-61 rocket pod with Hydra 70', glb='lau61.glb', blend='lau61.blend', rev=1,
    build=['build.py', '_collide.py', 'bake.py', 'deliver.py'], previews_=prev,
    checks={'collisions': col, 'silhouette_iou': {'размер': '1,70 × 0,40 м - как прежняя модель в игре (подвеска на вертолётах); раскладка труб по фото 03'},
            'color': 'олива (линейно 0,23 / 0,195 / 0,115), проба сбоку sRGB ~131/124/102 при фото 01 ~62/53/60 и 03 ~159/136/108'},
    sketchfab={'title': 'LAU-61 Rocket Pod with Hydra 70',
               'lead': 'LAU-61 rocket pod for 19 Hydra 70 rockets, built for a game. Olive paint with grime, worn edges, muzzle soot, a data plate, rivets and made-up stencils (no real serial numbers). Nineteen rockets sit in open tubes (1 + 6 + 12 layout) with their fuzes out at the front and nozzles visible at the rear; each rocket is a separate node so it can be hidden after launch.',
               'parts': ['pod body with 19 tubes', 'front and rear rims', 'two suspension lugs', 'umbilical connector', 'arming bracket', '19 Hydra 70 rockets as separate nodes'],
               'tags': ['lau-61', 'rocket-pod', 'hydra-70', 'rocket', 'launcher', 'helicopter', 'military', 'weapon', 'us-army', 'game-ready', 'textured', 'blender'],
               'dimensions': f'pod length {G["L"]:.2f} m, diameter {DIA:.2f} m',
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'based': 'Built from scratch in Blender from public photos.',
               'glb': 'lau61_sketchfab.glb'},
    notes=f'Ревизия 1 (2026-11-08). Блок 1,70 × 0,40 м (как прежний w_lau61), 19 труб 1 + 6 + 12 по фото 03, проушины 14 дюймов по фото 01. Ракеты - упрощённая копия нашей Hydra 70 (профиль снят с hydra70.blend), одна сетка на 19 узлов. Маркировка придуманная. Модель {tris} тр.')
R['model']['length_m'] = G['L']; R['model']['span_m'] = DIA; R['model']['height_m'] = round(mx.z - mn.z, 3)
json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
Yb = mk.Yb_
pj['axes'] = 'glTF: передний торец (носы ракет) -Z, верх +Y (проушины), начало на оси блока посередине длины корпуса 1,70 м'
pj['tube_axis_gltf'] = [0.0, 0.0, -1.0]
pj['muzzle_gltf'] = [G2(Vector((cx, Yb(G['A_F']), cz))) for cx, cz in G['TUBES']]
pj['rockets'] = dict(nodes=[f'r{i}' for i in range(19)], order='r0..r18 - порядок пуска: внешний круг (r0..r11) по часовой стрелке от верха, если смотреть спереди; затем средний (r12..r17) так же; r18 - центр',
                     node_origin='узел ракеты стоит в центре среза своей трубы (= muzzle_gltf того же номера); ракета вдоль tube_axis_gltf',
                     nose_out_m=G['P_OUT'], tube_inner_r_m=G['R_H'], shared_mesh='все 19 узлов делят одну сетку r0 - прятать узлом (visible = false)',
                     note='ракета - упрощённая копия нашей Hydra 70 (w_nar_hydra): взрыватель, боевая часть, хвостовое кольцо, сопло; длина 1,43 м')
pj['lugs_gltf'] = [G2(Vector((0, Yb(a), G['R'] + 0.024))) for a in G['LUGS']]
pj['fixed'] = 'LAU_body (корпус с трубами), LAU_lips (обечайки), LAU_fixed (проушины, разъём, кронштейн чеки) - неподвижны'
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT, 'тр.', tris)
