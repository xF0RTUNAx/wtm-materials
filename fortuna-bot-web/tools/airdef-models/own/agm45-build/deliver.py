# deliver.py - сборка файлов из готовых карт.  [A45_FINAL=1] Blender -b agm45_work.blend --python deliver.py
# Без A45_FINAL - только agm45.glb для уровня 2 (проба). С A45_FINAL=1 - ещё файл для Sketchfab, .blend, превью, паспорт и отчёт.
import bpy, os, sys, math, json
from mathutils import Vector as V
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(bpy.data.filepath)); OUT = HERE; TX = os.path.join(HERE, 'tex'); MP = os.path.join(HERE, '_maps')
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit'); import modelkit as mk
FINAL = os.environ.get('A45_FINAL') == '1'; GAME_TEX, GAME_NTEX = int(os.environ.get('A45_GAME_TEX', '1024')), int(os.environ.get('A45_GAME_NTEX', '512'))
PJ = json.load(open(os.path.join(MP, 'parts.json'))); sc = bpy.data.scenes['AGM45']; col = bpy.data.collections['AGM45']
mk.sc = sc; mk.col = col; mk.NAME = 'AGM45'; mk.S = PJ['S']; mk.X0 = PJ['X0']
objs = [o for o in col.objects if o.type == 'MESH']; PY = '/usr/bin/python3'


def lite(src, dst, px, q=None):
    code = f"import site,sys;sys.path.append(site.getusersitepackages());from PIL import Image;im=Image.open(r'''{src}''').convert('RGB');im=im.resize(({px},{px}),Image.LANCZOS) if im.size[0]!={px} else im;im.save(r'''{dst}'''{', quality=%d, subsampling=0, optimize=True' % q if q else ''})"
    os.system(f'{PY} -c "{code}"')


lite(f'{TX}/color.png', f'{TX}/game_color.jpg', GAME_TEX, 90); lite(f'{TX}/normal.png', f'{TX}/game_normal.png', GAME_NTEX)
if FINAL: lite(f'{TX}/color.png', f'{TX}/full_color.jpg', 2048, 92); lite(f'{TX}/normal.png', f'{TX}/full_normal.jpg', 2048, 92)


def atlas(cp, np_):
    ci = bpy.data.images.load(cp, check_existing=False); ni = bpy.data.images.load(np_, check_existing=False); ni.colorspace_settings.name = 'Non-Color'; ci.pack(); ni.pack()
    m = bpy.data.materials.get('A45_atlas') or bpy.data.materials.new('A45_atlas'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); o_ = nt.nodes.new('ShaderNodeOutputMaterial'); pr = nt.nodes.new('ShaderNodeBsdfPrincipled'); tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = ci; tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = ni; nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(tc.outputs['Color'], pr.inputs['Base Color']); nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs[0], pr.inputs['Normal']); nt.links.new(pr.outputs[0], o_.inputs[0]); pr.inputs['Metallic'].default_value = 0; pr.inputs['Roughness'].default_value = 0.6; pr.inputs['Specular IOR Level'].default_value = 0.3
    return m


for o in objs:
    for p in o.data.polygons: p.material_index = 0
PREV = []
if FINAL:
    m = atlas(f'{TX}/full_color.jpg', f'{TX}/full_normal.jpg')
    for o in objs: o.data.materials.clear(); o.data.materials.append(m)
    mk.MATS = [m]
    PREV = [os.path.basename(p) for p in mk.previews(OUT, views=[
        ('превью_1_общий.png', V((0, 0.05, 0)), (0.68, 0.62, 0.40), 4.6),
        ('превью_2_сбоку.png', V((0, 0, 0)), (1.0, 0.0, 0.05), 4.9),
        ('превью_3_хвост.png', V((0, -1.2, 0.02)), (-0.55, -0.72, 0.42), 1.5),
        ('превью_4_подвеска.png', V((0, -0.55, 0.08)), (-0.6, -0.25, 0.72), 1.7)])]
    os.makedirs(OUT + '/снимки', exist_ok=True)
    mk.previews(OUT + '/снимки', size=(1600, 900), views=[
        ('окно.png', V((0.06, 0.82, 0)), (0.9, 0.25, 0.18), 1.05),
        ('сопло.png', V((0, -1.42, 0)), (-0.42, -0.86, 0.26), 0.9),
        ('упор.png', V((0, -1.05, 0.13)), (-0.6, -0.5, 0.55), 0.6),
        ('нос.png', V((0, 1.2, 0)), (0.75, 0.6, 0.2), 1.1)])
    mk.export(OUT + '/agm45_sketchfab.glb', None)
m = atlas(f'{TX}/game_color.jpg', f'{TX}/game_normal.png')
for o in objs: o.data.materials.clear(); o.data.materials.append(m)
mk.export(OUT + '/agm45.glb', OUT + '/agm45.blend' if FINAL else None)
print('файл для игры', os.path.getsize(OUT + '/agm45.glb') // 1024, 'КБ')
if FINAL:
    mk.YC = 0.0; mk.NOSE = 1.0
    col_ = {}
    try: col_ = json.load(open(os.path.join(MP, 'collide.json'), encoding='utf-8'))
    except Exception as e: print('нет итога столкновений', e)
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]; LEN = round(max(p.y for p in pts) - min(p.y for p in pts), 3); RB = PJ['rb']; _sp = 2 * max(math.hypot((o.matrix_world @ v.co).x, (o.matrix_world @ v.co).z) for o in objs for v in o.data.vertices)
    R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_agm45', weapon='agm45', name='AGM-45 Shrike', name_en='AGM-45 Shrike', glb='agm45.glb', blend='agm45.blend', rev=1,
        build=['build.py', '_collide.py', 'bake_maps.py', 'paint.py', 'deliver.py'], previews_=PREV,
        checks={'collide': col_, 'silhouette_iou': {'бок': 'не считается: все картинки в перспективе, вида сбоку нет; пропорции сверены с тремя кадрами глазами'}},
        sketchfab={'title': 'AGM-45 Shrike Missile - Low Poly, Textured',
                   'lead': 'AGM-45 Shrike - US anti-radiation air-to-surface missile with a white body, green and yellow bands, brown motor bands, four mid-body wings and four tail fins. Hand-modelled low-poly exterior with a side window, top hanger rail with stops, a hollow nozzle, baked paint wear, own stencils and a normal map. Each wing is a separate object on its own shaft.',
                   'parts': ['ogive radome and body', 'metal side window', 'four wings on shafts', 'four tail fins', 'top fairing and hanger rail', 'hollow nozzle'],
                   'tags': ['agm-45', 'shrike', 'anti-radiation missile', 'arm', 'missile', 'air-to-surface', 'wild weasel', 'vietnam war', 'military', 'weapon', 'lowpoly', 'game-ready', 'textured', 'blender'],
                   'dimensions': f'length {LEN:.2f} m, body diameter {2 * RB:.2f} m, wing span {_sp:.2f} m, fin span {2 * 0.33:.2f} m',
                   'textures': '2048 px baked colour map and tangent-space normal map', 'glb': 'agm45_sketchfab.glb'},
        notes=f'Ревизия 1 (2026-11-04): по картинкам Mark. Форма и узел подвески - референс_1; корпус, окно и хвост - референс_2; посадка крыльев и оперения - референс_3. Вида сбоку нет, положения сняты с трёх перспективных кадров с поправкой на глубину. Надписи и номера свои. Рычаг с красным колпачком с референс_2 не собран. Для игры цвет {GAME_TEX}, нормали {GAME_NTEX}, для Sketchfab 2048.')
    R['model']['length_m'] = LEN; R['model']['span_m'] = round(_sp, 3); R['model']['height_m'] = round(_sp, 3); json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
    G = lambda v: [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]                # в оси glTF: нос -Z, упоры +Y; поворот вокруг оси сохраняет знак
    D_ = lambda ph: (math.cos(math.radians(ph)), 0.0, math.sin(math.radians(ph)))
    parts = {}
    for i, ph in enumerate(PJ['phi']):
        parts[f'rudder{i + 1}'] = {'pivot_gltf': G(bpy.data.objects[f'rudder{i + 1}'].location), 'axis_gltf': G(D_(ph)), 'range_deg': [-20, 20], 'note': 'крыло посередине корпуса, ось по радиусу, в файле 0'}
    pj['parts'] = parts; pj['fixed'] = ['A45_body', 'A45_nozzle', 'A45_hanger', 'A45_mounts', 'A45_fins']; pj['lug_top_gltf_y'] = round(PJ['lug_top'], 4)
    json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('deliver.py: готово', 'чистовой' if FINAL else 'проба')
