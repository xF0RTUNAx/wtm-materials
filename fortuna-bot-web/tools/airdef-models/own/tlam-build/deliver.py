# Tomahawk - сдача: превью, экспорт (Sketchfab раскрыто в трёх качествах + игра сложено), паспорт и отчёт. Mark: «Собирай» (2026-11-09).
#   TH_OUT="<папка>" TH_TEX=4096 TH_NTEX=2048 /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python _collide.py --python bake.py --python deliver.py
# Уровень 2: deno run -A tools/airdef-models/preview-candidate.js w_tomahawk "$F/tlam.glb" --out "$F/превью-игра" --tex 1024 --ntex 512
# Файл игры: крыло, рули и воздухозаборник сложены (углы 0, как в пусковом контейнере). Файлы Sketchfab: раскрыто (полёт).
import os, sys, json, math
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector, Matrix
import modelkit as mk

OUT = os.environ.get('TH_OUT')
if not OUT: raise SystemExit('Задай TH_OUT=<папка модели>')
GAME_TEX, GAME_NTEX = int(os.environ.get('TH_GAME_TEX', '1024')), int(os.environ.get('TH_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('TH_TEX', '4096'))
sc = bpy.data.scenes['TLAM']; bpy.context.view_layer.update()
G = mk.GEO
objs = [o for o in sc.objects if o.type == 'MESH']
BASE = {n: bpy.data.objects[n].matrix_world.copy() for n in mk.WING}
def state(t):
    for n, W in mk.WING.items():
        p = BASE[n].translation.copy()
        bpy.data.objects[n].matrix_world = Matrix.Translation(p) @ Matrix.Rotation(math.radians(W['open_deg'] * t), 4, W['axis']) @ Matrix.Translation(-p) @ BASE[n]
    bpy.context.view_layer.update()
def bbox():
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    return Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))), Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
state(0.0); mn, mx = bbox(); FOLD = [round(mx.x - mn.x, 3), round(mx.z - mn.z, 3), round(mx.y - mn.y, 3)]
state(1.0); mn2, mx2 = bbox(); SPAN = round(mx2.x - mn2.x, 3); HGT = round(mx2.z - mn2.z, 3)
tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
print('сложено', FOLD, 'размах раскрытого', SPAN, 'тр.', tris)
os.makedirs(OUT + '/снимки', exist_ok=True)
BG = (0.62, 0.64, 0.66)
prev = [os.path.basename(p) for p in mk.previews(OUT, bg=BG, views=[
    ('превью_1_общий.png', Vector((0, 0.0, 0.0)), (-0.62, 0.55, 0.40), 9.0),
    ('превью_2_сбоку.png', Vector((0, 0, 0)), (-1.0, 0.0, 0.06), 8.0),
    ('превью_3_нос.png', Vector((0, 1.9, 0.0)), (-0.6, 0.6, 0.35), 2.4),
    ('превью_4_хвост.png', Vector((0, -2.3, -0.1)), (-0.55, -0.6, 0.3), 2.6)])]
mk.previews(OUT + '/снимки', size=(1600, 900), bg=BG, views=[('снизу.png', Vector((0, -0.2, 0.0)), (0.5, 0.35, -0.75), 8.0), ('заборник.png', Vector((0, -1.4, -0.25)), (0.6, 0.4, -0.65), 2.2)])
mk.export(OUT + '/tlam_sketchfab.glb', None)
imgs = [nd for m in bpy.data.materials if m.name.startswith('TH_') and m.node_tree for nd in m.node_tree.nodes if nd.type == 'TEX_IMAGE' and nd.image is not None]
def use(cpath, npath):
    lc = bpy.data.images.load(cpath, check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
    ln = bpy.data.images.load(npath, check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
    for nd in imgs: nd.image = ln if nd.image.colorspace_settings.name == 'Non-Color' else lc
def lite(name, px, fmt):
    im = bpy.data.images['TH_normal' if 'normal' in name else 'TH_detail'].copy(); im.scale(px, px); im.file_format = fmt
    p_ = os.path.join(OUT, name)
    try: im.save(filepath=p_, quality=92)
    except TypeError:
        im.filepath_raw = p_; im.save()
    bpy.data.images.remove(im); return p_
use(lite('tlam_detail_2048.jpg', 2048, 'JPEG'), lite('tlam_normal_1024.png', 1024, 'PNG')); mk.export(OUT + '/tlam_sketchfab_2k.glb', None)
use(OUT + f'/tlam_detail_{GAME_TEX}.jpg', OUT + f'/tlam_normal_{GAME_NTEX}.png'); mk.export(OUT + '/tlam_sketchfab_1k.glb', None)
state(0.0)
mk.previews(OUT + '/снимки', size=(1600, 900), bg=BG, views=[('сложено.png', Vector((0, 0.0, 0.0)), (0.55, 0.45, -0.55), 9.0)])
mk.export(OUT + '/tlam.glb', OUT + '/tlam.blend')
col = {}
try: col = json.load(open(os.path.join(OUT, '_live', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога _collide.py:', e)
R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_tomahawk', weapon='tomahawk', name='BGM-109 Tomahawk', name_en='BGM-109 Tomahawk cruise missile', glb='tlam.glb', blend='tlam.blend', rev=1,
    build=['build.py', '_collide.py', 'bake.py', 'deliver.py'], previews_=prev,
    checks={'collisions': col, 'silhouette_iou': {'бок': 'по фото 02 (301 пикс/м), 04, рендерам 01, 03, 05: длина 5,56 как в игре, Ø 0,52; IoU не считали'},
            'color': 'белая (линейно 0,86 / 0,87 / 0,88), медиана борта на снимке sRGB 230/233/236 при фото 02: освещённый борт 252-255, верх в тени ~205'},
    sketchfab={'title': 'BGM-109 Tomahawk Cruise Missile',
               'lead': 'BGM-109 Tomahawk Block IV style cruise missile, built for a game from reference photos. White body with black bands at the nose, dark top panels, panel seams and made-up technical stencils. Wings, four tail fins and the belly air intake are separate parts on real hinge axes: folded as in the launch canister in the game file, shown deployed here.',
               'parts': ['body with nose dome', 'two pop-out wings', 'four tail fins', 'retractable belly air intake', 'engine nozzle'],
               'tags': ['tomahawk', 'bgm-109', 'cruise-missile', 'missile', 'navy', 'usa', 'military', 'weapon', 'turbofan', 'game-ready', 'pbr', 'textured'],
               'dimensions': f'length {FOLD[2]:.2f} m, diameter 0.52 m, wing span {SPAN:.2f} m',
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map; 2K and 1K versions included',
               'based': 'Built from scratch in Blender from public photos.',
               'glb': 'tlam_sketchfab.glb'},
    notes=f'Ревизия 1 (2026-11-09). По фото 02 и 04 (настоящие) и рендерам 01, 03, 05 (только форма). Крыло поднято чуть выше оси по слову Mark. Надписи NAVAIR, Raytheon, ROYAL NAVY, U.S. ARMY, TOMAHAWK и знаки не перенесены, маркировка придумана. Модель {tris} тр.')
R['model']['length_m'] = FOLD[2]; R['model']['span_m'] = SPAN; R['model']['height_m'] = HGT
json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
pj['axes'] = 'glTF: нос -Z, верх +Y, начало на оси посередине длины 5,56 м; крыло, рули и воздухозаборник сложены (как в контейнере), все углы 0'
pj['folded_size_m'] = dict(width=FOLD[0], height=FOLD[1], length=FOLD[2], note='сложенные рули лежат на хвостовом конусе и выходят за Ø корпуса примерно на 0,13 м (принято Mark)')
notes = {'wing1': 'левая консоль игры (в glTF x+), выходит из щели в борту чуть выше оси; поворот вокруг вертикальной оси у корня',
         'wing2': 'правая консоль (в glTF x-), на 3 см выше wing1; поворот вокруг вертикальной оси у корня',
         'fin1': 'руль сверху', 'fin2': 'руль справа (x+)', 'fin3': 'руль снизу', 'fin4': 'руль слева (x-)',
         'intake': 'воздухозаборник снизу у хвоста: шарнир у задней кромки, поворот вниз; сложенный лежит вровень с обшивкой'}
parts = {}
for n, W in mk.WING.items():
    parts[n] = dict(pivot_gltf=G2(W['o']), axis_gltf=G2(W['axis']), open_deg=round(W['open_deg'], 1), folded_deg=0.0, note=notes[n])
pj['parts'] = parts
pj['deploy'] = 'все узлы поворачиваются вокруг axis_gltf через pivot_gltf от 0 до open_deg; одновременная линейная развёртка 0..100 % (101 шаг) - касаний нет. Порядок у настоящей: после ускорителя крыло, рули, заборник, за несколько секунд'
pj['nozzle_gltf'] = G2(G['NOZ']); pj['nozzle_dir_gltf'] = [0.0, 0.0, 1.0]; pj['nr'] = G['R_NOZ']
pj['launch'] = 'игра пускает ракету в полёте (крылатая, ev); на подвеске не висит'
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT, 'тр.', tris)
