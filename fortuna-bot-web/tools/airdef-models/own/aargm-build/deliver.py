# deliver.py - сборка файлов из готовых карт.  [ARG_FINAL=1] Blender -b aargm_work.blend --python deliver.py
# Без ARG_FINAL - только aargm.glb для уровня 2 (проба). С ARG_FINAL=1 - ещё файл для Sketchfab, .blend, превью, паспорт и отчёт.
import bpy, os, sys, math, json
from mathutils import Vector as V
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(bpy.data.filepath)); OUT = HERE; TX = os.path.join(HERE, 'tex'); MP = os.path.join(HERE, '_maps')
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit'); import modelkit as mk
FINAL = os.environ.get('ARG_FINAL') == '1'; GAME_TEX, GAME_NTEX = int(os.environ.get('ARG_GAME_TEX', '1024')), int(os.environ.get('ARG_GAME_NTEX', '512'))
PJ = json.load(open(os.path.join(MP, 'parts.json'))); sc = bpy.data.scenes['AARGM']; col = bpy.data.collections['AARGM']
mk.sc = sc; mk.col = col; mk.NAME = 'AARGM'; mk.S = PJ['S']; mk.X0 = PJ['X0']
objs = [o for o in col.objects if o.type == 'MESH']; PY = '/usr/bin/python3'


def lite(src, dst, px, q=None):
    code = f"import site,sys;sys.path.append(site.getusersitepackages());from PIL import Image;im=Image.open(r'''{src}''').convert('RGB');im=im.resize(({px},{px}),Image.LANCZOS) if im.size[0]!={px} else im;im.save(r'''{dst}'''{', quality=%d, subsampling=0, optimize=True' % q if q else ''})"
    os.system(f'{PY} -c "{code}"')


lite(f'{TX}/color.png', f'{TX}/game_color.jpg', GAME_TEX, 90); lite(f'{TX}/normal.png', f'{TX}/game_normal.png', GAME_NTEX)
if FINAL: lite(f'{TX}/color.png', f'{TX}/full_color.jpg', 2048, 92); lite(f'{TX}/normal.png', f'{TX}/full_normal.jpg', 2048, 92)


def atlas(cp, np_):
    ci = bpy.data.images.load(cp, check_existing=False); ni = bpy.data.images.load(np_, check_existing=False); ni.colorspace_settings.name = 'Non-Color'; ci.pack(); ni.pack()
    m = bpy.data.materials.get('ARG_atlas') or bpy.data.materials.new('ARG_atlas'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); o_ = nt.nodes.new('ShaderNodeOutputMaterial'); pr = nt.nodes.new('ShaderNodeBsdfPrincipled'); tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = ci; tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = ni; nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(tc.outputs['Color'], pr.inputs['Base Color']); nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs[0], pr.inputs['Normal']); nt.links.new(pr.outputs[0], o_.inputs[0]); pr.inputs['Metallic'].default_value = 0; pr.inputs['Roughness'].default_value = 0.6; pr.inputs['Specular IOR Level'].default_value = 0.3
    return m


for o in objs:
    for p in o.data.polygons: p.material_index = 0
PREV = []
if FINAL:
    m = atlas(f'{TX}/full_color.jpg', f'{TX}/full_normal.jpg')
    for o in objs: o.data.materials.clear(); o.data.materials.append(m)
    mk.MATS = [m]
    BG = (0.40, 0.43, 0.47)
    PREV = [os.path.basename(p) for p in mk.previews(OUT, bg=BG, views=[
        ('превью_1_общий.png', V((0, 0.05, 0)), (0.68, -0.62, 0.30), 6.2),
        ('превью_2_сбоку.png', V((0, 0, 0)), (1.0, 0.0, 0.05), 6.4),
        ('превью_3_хвост.png', V((0, -1.6, 0.02)), (0.62, -0.72, 0.28), 2.0),
        ('превью_4_голова.png', V((0.02, 1.2, 0.0)), (0.72, 0.62, 0.34), 2.2)])]
    os.makedirs(OUT + '/снимки', exist_ok=True)
    mk.previews(OUT + '/снимки', size=(1600, 900), bg=BG, views=[
        ('наплыв.png', V((0.1, -0.2, 0.0)), (0.76, -0.25, 0.45), 1.7),
        ('сопло.png', V((0, -1.95, 0)), (0.42, -0.86, 0.26), 1.1),
        ('узел.png', V((0, 0.0, 0.2)), (0.6, -0.5, 0.55), 0.7),
        ('обтекатель.png', V((0, 1.65, 0)), (0.75, 0.6, 0.2), 1.3)])
    mk.export(OUT + '/aargm_sketchfab.glb', None)
m = atlas(f'{TX}/game_color.jpg', f'{TX}/game_normal.png')
for o in objs: o.data.materials.clear(); o.data.materials.append(m)
mk.export(OUT + '/aargm.glb', OUT + '/aargm.blend' if FINAL else None)
print('файл для игры', os.path.getsize(OUT + '/aargm.glb') // 1024, 'КБ')
if FINAL:
    mk.YC = 0.0; mk.NOSE = 1.0
    col_ = {}
    try: col_ = json.load(open(os.path.join(MP, 'collide.json'), encoding='utf-8'))
    except Exception as e: print('нет итога столкновений', e)
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]; LEN = round(max(p.y for p in pts) - min(p.y for p in pts), 3); RB = PJ['rb']; _sp = 2 * max(math.hypot((o.matrix_world @ v.co).x, (o.matrix_world @ v.co).z) for o in objs for v in o.data.vertices)
    R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_aargm', weapon='aargm', name='AARGM-ER', name_en='AARGM-ER', glb='aargm.glb', blend='aargm.blend', rev=1,
        build=['build.py', '_collide.py', 'bake_maps.py', 'paint.py', 'deliver.py'], previews_=PREV,
        checks={'collide': col_, 'silhouette_iou': {'бок': 'вида сбоку нет, все картинки в перспективе; сверено наложением при близкой камере на референсе 04: диаметр, положения поясов, узлов и рулей совпадают глазом'}},
        sketchfab={'title': 'AARGM-ER Missile - Low Poly, Textured',
                   'lead': 'AARGM-ER anti-radiation missile with a long cylindrical body, two long side strakes, four tail fins by the nozzle, a sand-coloured radome and grey paint with dark and tan bands. Hand-modelled low-poly exterior with two top hanger points, drain holes, cut panel seams, a hollow nozzle, baked paint wear, own stencils and a normal map. Each tail fin is a separate object on its own shaft.',
                   'parts': ['radome and body with strakes', 'four tail fins on shafts', 'two top hanger points', 'hollow nozzle'],
                   'tags': ['aargm-er', 'agm-88g', 'harm', 'anti-radiation missile', 'arm', 'missile', 'air-to-surface', 'military', 'weapon', 'lowpoly', 'game-ready', 'textured', 'blender'],
                   'dimensions': f'length {LEN:.2f} m, body diameter {2 * RB:.2f} m, fin span {_sp:.2f} m',
                   'textures': '2048 px baked colour map and tangent-space normal map', 'glb': 'aargm_sketchfab.glb'},
        notes=f'Ревизия 1 (2026-11-05): свой меш по картинкам Mark, картинки только справка. Длина 4,1 м из задания, диаметр снят по пропорциям с поправкой на перспективу. Задняя кромка рулей сдвинута вперёд с 99,7 до 96,8 % длины ради огня. Логотипов нет, надписи свои; Mark выбрал серую схему с названием AARGM-ER на бортах. Для игры цвет {GAME_TEX}, нормали {GAME_NTEX}, для Sketchfab 2048.')
    R['model']['length_m'] = LEN; R['model']['span_m'] = round(_sp, 3); R['model']['height_m'] = round(_sp, 3); json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
    G = lambda v: [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]                # в оси glTF: нос -Z, упоры +Y; поворот вокруг оси сохраняет знак
    D_ = lambda ph: (math.cos(math.radians(ph)), 0.0, math.sin(math.radians(ph)))
    parts = {}
    for i, ph in enumerate(PJ['phi']):
        parts[f'fin{i + 1}'] = {'pivot_gltf': G(bpy.data.objects[f'fin{i + 1}'].location), 'axis_gltf': G(D_(ph)), 'range_deg': [-20, 20], 'note': 'руль у сопла, ось по радиусу, в файле нейтраль 0'}
    pj['parts'] = parts; pj['fixed'] = ['ARG_body', 'ARG_nozzle', 'ARG_lugs', 'ARG_mounts']; pj['lug_top_gltf_y'] = round(PJ['lug_top'], 4)
    pj['nozzle_gltf'] = G((0.0, -PJ['S'] * 500.0, 0.0)); pj['nozzle_r'] = round(PJ['bore'], 4); pj['nozzle_outer_r'] = round(PJ['nozzle_r'], 4); pj['lugs_gltf'] = [G((0.0, (PJ['X0'] - x_) * PJ['S'], PJ['lug_top'])) for x_ in PJ['lug_x']]
    json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('deliver.py: готово', 'чистовой' if FINAL else 'проба')
