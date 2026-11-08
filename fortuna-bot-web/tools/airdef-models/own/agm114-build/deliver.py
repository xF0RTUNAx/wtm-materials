# AGM-114 Hellfire - сдача: превью, экспорт (Sketchfab в трёх качествах + игра), паспорт и отчёт. Mark: «Собирай» (2026-11-08). Запускается ПОСЛЕ build.py, _collide.py и bake.py:
#   HF_OUT="<папка>" HF_TEX=4096 HF_NTEX=2048 /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python _collide.py --python bake.py --python deliver.py
# Уровень 2: deno run -A tools/airdef-models/preview-candidate.js w_hellfire "$F/agm114.glb" --out "$F/превью-игра" --tex 1024 --ntex 512
# Оба файла: рули в нейтрали (углы 0), башмаки сверху. Купол - материал HF_glass (прозрачный, BLENDED), не запекается.
import os, sys, json, math
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk

OUT = os.environ.get('HF_OUT')
if not OUT: raise SystemExit('Задай HF_OUT=<папка модели>')
GAME_TEX, GAME_NTEX = int(os.environ.get('HF_GAME_TEX', '1024')), int(os.environ.get('HF_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('HF_TEX', '4096'))
sc = bpy.data.scenes['HF114']; bpy.context.view_layer.update()
G = mk.GEO
objs = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
LEN = round(mx.y - mn.y, 3)
tips = []
for k in range(1, 5):
    o = bpy.data.objects[f'fin_c{k}']; e = mk.WING[k]['axis']
    tips.append(max((o.matrix_world @ v.co).dot(e) for v in o.data.vertices))
CSPAN = round(2 * max(tips), 3)
wo = bpy.data.objects['HF_wings']; WSPAN = round(2 * max(math.hypot(*(wo.matrix_world @ v.co).xz) for v in wo.data.vertices), 3)
tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
print('длина', LEN, 'размах рулей', CSPAN, 'размах крыльев', WSPAN, 'тр.', tris)
os.makedirs(OUT + '/снимки', exist_ok=True)
BG = (0.62, 0.64, 0.66)
prev = [os.path.basename(p) for p in mk.previews(OUT, bg=BG, views=[
    ('превью_1_общий.png', Vector((0, 0.0, 0.0)), (-0.62, 0.55, 0.40), 3.2),
    ('превью_2_сбоку.png', Vector((0, 0, 0)), (-1.0, 0.0, 0.06), 2.9),
    ('превью_3_головка.png', Vector((0, 0.74, 0.0)), (-0.55, 0.80, 0.22), 0.55),
    ('превью_4_хвост.png', Vector((0, -0.55, 0.0)), (-0.75, -0.55, 0.3), 1.0)])]
mk.previews(OUT + '/снимки', size=(1600, 900), bg=BG, views=[
    ('правый_борт.png', Vector((0, 0, 0)), (1.0, 0.0, 0.06), 2.9),
    ('головка_в_лоб.png', Vector((0, 0.78, 0.0)), (-0.12, 1.0, 0.10), 0.42),
    ('башмаки.png', Vector((0, 0.0, 0.08)), (-0.5, 0.25, 0.8), 1.6),
    ('сопло.png', Vector((0, -0.78, 0.0)), (-0.4, -0.85, 0.25), 0.6)])
mk.export(OUT + '/agm114_sketchfab.glb', None)
imgs = [nd for m in bpy.data.materials if m.name.startswith('HF_') and m.node_tree for nd in m.node_tree.nodes if nd.type == 'TEX_IMAGE' and nd.image is not None]
def use(cpath, npath):
    lc = bpy.data.images.load(cpath, check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
    ln = bpy.data.images.load(npath, check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
    for nd in imgs: nd.image = ln if nd.image.colorspace_settings.name == 'Non-Color' else lc
def lite(name, px, fmt):
    im = bpy.data.images['HF_normal' if 'normal' in name else 'HF_detail'].copy(); im.scale(px, px); im.file_format = fmt
    p_ = os.path.join(OUT, name)
    try: im.save(filepath=p_, quality=92)
    except TypeError:
        im.filepath_raw = p_; im.save()
    bpy.data.images.remove(im); return p_
use(lite('agm114_detail_2048.jpg', 2048, 'JPEG'), lite('agm114_normal_1024.png', 1024, 'PNG')); mk.export(OUT + '/agm114_sketchfab_2k.glb', None)
use(OUT + f'/agm114_detail_{GAME_TEX}.jpg', OUT + f'/agm114_normal_{GAME_NTEX}.png'); mk.export(OUT + '/agm114_sketchfab_1k.glb', None)
mk.export(OUT + '/agm114.glb', OUT + '/agm114.blend')
col = {}
try: col = json.load(open(os.path.join(OUT, '_live', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога _collide.py:', e)
R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_hellfire', weapon='hellfire', name='AGM-114 Hellfire', name_en='AGM-114 Hellfire', glb='agm114.glb', blend='agm114.blend', rev=1,
    build=['build.py', '_collide.py', 'bake.py', 'deliver.py'], previews_=prev,
    checks={'collisions': col, 'silhouette_iou': {'бок': 'размеры сняты с фото 05 (587 пикс. = 1,63 м): профиль обтекателя, места рулей, крыльев и полос; IoU не считали'},
            'color': 'чёрная (линейно 0,030 / 0,030 / 0,034), проба сбоку sRGB ~69-78 при фото 02 ~51-67, 03 ~36-42, 05 ~87; полосы (0,86 / 0,50 / 0,045) по фото 02'},
    sketchfab={'title': 'AGM-114 Hellfire (K/R) Missile',
               'lead': 'Air-to-ground missile AGM-114 Hellfire (K/R style) built for a game. Black paint with yellow live-round bands, fading and scuffs, a variant letter on the nose, a 2-man lift warning, a data plate, hatches and screw rows; markings are made up (no real serial numbers). Clear seeker dome over a chrome reflector with a brass tip. Four front control canards are separate parts on their real axes; rear wings are fixed. Three rail shoes on top.',
               'parts': ['clear seeker dome', 'chrome reflector seeker', 'four control canards', 'four fixed wings', 'three rail shoes', 'hollow nozzle'],
               'tags': ['agm-114', 'hellfire', 'missile', 'anti-tank', 'air-to-ground', 'helicopter', 'military', 'weapon', 'us-army', 'game-ready', 'textured', 'blender'],
               'dimensions': f'length {LEN:.2f} m, body 0.178 m, wing span {WSPAN:.2f} m',
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'based': 'Built from scratch in Blender from public photos.',
               'glb': 'agm114_sketchfab.glb'},
    notes=f'Ревизия 1 (2026-11-08). Форма по фото 05 (сбоку, масштаб), детали и окраска по 02 и 03. Рули ±15°, крылья неподвижны. Купол - стекло HF_glass. Маркировка придуманная или общая техническая. Модель {tris} тр.')
R['model']['length_m'] = LEN; R['model']['span_m'] = WSPAN; R['model']['height_m'] = round(mx.z - mn.z, 3)
json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
pj['axes'] = 'glTF: нос -Z, верх +Y (башмаки), начало на оси корпуса посередине длины; рули и крылья крестом ×, все углы 0'
parts = {}
for k in range(1, 5):
    W = mk.WING[k]
    parts[f'fin_c{k}'] = dict(pivot_gltf=G2(W['o']), axis_gltf=G2(W['axis']), range_deg=[-15.0, 15.0], neutral_deg=0.0,
                              note=f'передний руль, луч {W["phi"]:.0f}° от верха по часовой (вид с хвоста); ось у корня по радиусу, начало узла на оси; проверка ±15° через 1° - касаний нет')
pj['parts'] = parts
pj['glass'] = 'HF_glass (объект HF_dome) - прозрачный купол головки: Alpha 0,22, BLENDED, лаковый слой, лёгкий холодный отлив; под ним HF_seeker (хромированное зеркало с латунным наконечником)'
pj['fixed'] = 'HF_body (с соплом), HF_dome, HF_seeker, HF_fixed (башмаки, болты стыков), HF_pivots (диски осей рулей), HF_wings (4 крыла с накладками) - неподвижны'
pj['nozzle_gltf'] = G2(Vector((0.0, mk.Yb_(G['A_END']), 0.0)))
pj['spans_m'] = dict(canards=CSPAN, wings=WSPAN, note='по плоскости ×, от кончика до кончика')
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT, 'тр.', tris, 'длина', LEN)
