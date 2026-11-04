# deliver.py - сборка файлов из готовых карт.  [G31_FINAL=1] Blender -b gbu31_work.blend --python deliver.py
# Без G31_FINAL - только gbu31.glb для уровня 2 (проба). С G31_FINAL=1 - ещё файл для Sketchfab, .blend, превью, паспорт и отчёт.
import bpy, os, sys, math, json
from mathutils import Vector as V
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(bpy.data.filepath)); OUT = HERE; TX = os.path.join(HERE, 'tex'); MP = os.path.join(HERE, '_maps')
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit'); import modelkit as mk
FINAL = os.environ.get('G31_FINAL') == '1'; GAME_TEX, GAME_NTEX = int(os.environ.get('G31_GAME_TEX', '1024')), int(os.environ.get('G31_GAME_NTEX', '512'))
PJ = json.load(open(os.path.join(MP, 'parts.json'))); sc = bpy.data.scenes['GBU31']; col = bpy.data.collections['GBU31']
mk.sc = sc; mk.col = col; mk.NAME = 'GBU31'; mk.S = PJ['S']; mk.X0 = PJ['X0']
objs = [o for o in col.objects if o.type == 'MESH']; PY = '/usr/bin/python3'


def lite(src, dst, px, q=None):
    code = f"import site,sys;sys.path.append(site.getusersitepackages());from PIL import Image;im=Image.open(r'''{src}''').convert('RGB');im=im.resize(({px},{px}),Image.LANCZOS) if im.size[0]!={px} else im;im.save(r'''{dst}'''{', quality=%d, subsampling=0, optimize=True' % q if q else ''})"
    os.system(f'{PY} -c "{code}"')


lite(f'{TX}/color.png', f'{TX}/game_color.jpg', GAME_TEX, 90); lite(f'{TX}/normal.png', f'{TX}/game_normal.png', GAME_NTEX)
if FINAL: lite(f'{TX}/color.png', f'{TX}/full_color.jpg', 2048, 92); lite(f'{TX}/normal.png', f'{TX}/full_normal.jpg', 2048, 92)


def atlas(cp, np_):
    ci = bpy.data.images.load(cp, check_existing=False); ni = bpy.data.images.load(np_, check_existing=False); ni.colorspace_settings.name = 'Non-Color'; ci.pack(); ni.pack()
    m = bpy.data.materials.get('G31_atlas') or bpy.data.materials.new('G31_atlas'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); o_ = nt.nodes.new('ShaderNodeOutputMaterial'); pr = nt.nodes.new('ShaderNodeBsdfPrincipled'); tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = ci; tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = ni; nm = nt.nodes.new('ShaderNodeNormalMap')
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
        ('превью_1_общий.png', V((0, 0.05, 0)), (-0.75, 0.68, 0.42), 5.9),
        ('превью_2_сбоку.png', V((0, 0, 0)), (-1.0, 0.0, 0.06), 6.0),
        ('превью_3_хвост.png', V((0, -1.25, 0)), (-0.72, -0.62, 0.42), 2.1),
        ('превью_4_накладка.png', V((0, 0.05, 0.08)), (-0.55, 0.45, 0.72), 2.6)])]
    os.makedirs(OUT + '/снимки', exist_ok=True)
    mk.previews(OUT + '/снимки', size=(1600, 900), views=[
        ('проушина.png', V((0, 0.76, 0.26)), (-0.6, 0.55, 0.55), 0.7),
        ('люк.png', V((-0.1, -0.88, 0)), (-1.0, -0.15, 0.15), 1.25),
        ('низ_рамки.png', V((0, 0.3, -0.1)), (-0.55, 0.25, -0.75), 2.2),
        ('нос.png', V((0, 1.5, 0)), (-0.7, 0.65, 0.3), 1.35)])
    mk.export(OUT + '/gbu31_sketchfab.glb', None)
m = atlas(f'{TX}/game_color.jpg', f'{TX}/game_normal.png')
for o in objs: o.data.materials.clear(); o.data.materials.append(m)
mk.export(OUT + '/gbu31.glb', OUT + '/gbu31.blend' if FINAL else None)
print('файл для игры', os.path.getsize(OUT + '/gbu31.glb') // 1024, 'КБ')
if FINAL:
    mk.YC = 110.0; mk.NOSE = 1.0; os.makedirs(OUT + '/проверка-чертежей', exist_ok=True)
    mk.silhouette_side(OUT + '/проверка-чертежей/модель_бок.png', (1022, 214), (511.0, 107.0))
    col_ = {}
    try: col_ = json.load(open(os.path.join(MP, 'collide.json'), encoding='utf-8'))
    except Exception as e: print('нет итога столкновений', e)
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]; LEN = round(max(p.y for p in pts) - min(p.y for p in pts), 3); S_ = PJ['S']; RB = PJ['rb']
    fin_span = 2 * 84.0 * S_; strake_span = 2 * 77.0 * S_
    R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_gbu31', weapon='gbu31', name='GBU-31 JDAM', name_en='GBU-31 JDAM', glb='gbu31.glb', blend='gbu31.blend', rev=1,
        build=['build.py', '_collide.py', 'bake_maps.py', 'paint.py', 'deliver.py'], previews_=PREV,
        checks={'collide': col_},
        sketchfab={'title': 'GBU-31 JDAM Bomb - Low Poly, Textured',
                   'lead': 'GBU-31 JDAM - US GPS-guided kit on a 2000 lb bomb body: tail unit with four steerable fins, top saddle with two suspension lugs, white straps, side frames and horizontal strakes. Hand-modelled low-poly exterior with baked paint wear, a yellow band, own stencils and a normal map. Each fin is a separate object on its own shaft.',
                   'parts': ['nose and body with yellow band', 'top saddle with two lugs', 'straps, side frames and strakes', 'rear strip with connector', 'tail unit with hatch and rivets', 'four steerable fins on shafts'],
                   'tags': ['gbu-31', 'jdam', 'gps guided bomb', 'mk 84', 'bomb', 'aviation bomb', 'precision guided', 'strakes', 'military', 'weapon', 'lowpoly', 'game-ready', 'textured', 'blender'],
                   'dimensions': f'length {LEN:.2f} m, body diameter {2 * RB:.2f} m, fin span {fin_span:.2f} m, strake span {strake_span:.2f} m',
                   'textures': '2048 px baked colour map and tangent-space normal map', 'glb': 'gbu31_sketchfab.glb'},
        notes=f'Ревизия 1 (2026-11-04): по картинкам Mark. Форма и окраска - референс_1 и референс_2; размеры - референс_4 (синий поясок и надписи учебного изделия не взяты); швы и хвост - референс_3 (жёлтый нос, взрыватель, таблички и подставка не взяты); референс_5 - только посмотреть, из него ничего не взято. Надписи свои. Для игры цвет {GAME_TEX}, нормали {GAME_NTEX}, для Sketchfab 2048.')
    R['model']['length_m'] = LEN; _sp = 2 * max(math.hypot((o.matrix_world @ v.co).x, (o.matrix_world @ v.co).z) for o in objs for v in o.data.vertices); R['model']['span_m'] = round(_sp, 3); R['model']['height_m'] = round(_sp, 3); json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
    G = lambda v: [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]                # в оси glTF: нос -Z, проушины +Y; поворот вокруг оси сохраняет знак
    D_ = lambda ph: (math.cos(math.radians(ph)), 0.0, math.sin(math.radians(ph)))
    parts = {}
    for i, ph in enumerate(PJ['phi']):
        parts[f'fin{i + 1}'] = {'pivot_gltf': G(bpy.data.objects[f'fin{i + 1}'].location), 'axis_gltf': G(D_(ph)), 'range_deg': [-15, 15], 'note': 'хвостовой руль, ось по радиусу, в файле 0'}
    pj['parts'] = parts; pj['fixed'] = ['G31_body', 'G31_saddle', 'G31_strakes', 'G31_tail']; pj['lug_top_gltf_y'] = round(PJ['lug_top'], 4)
    json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('deliver.py: готово', 'чистовой' if FINAL else 'проба')
