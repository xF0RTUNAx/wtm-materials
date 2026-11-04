# deliver.py - сборка файлов из готовых карт.  G10_VAR=A|B [G10_FINAL=1] Blender -b gbu10_work.blend --python deliver.py
# Без G10_FINAL - только gbu10.glb для уровня 2 (пробная окраска). С G10_FINAL=1 - ещё файл для Sketchfab, .blend, превью, паспорт и отчёт.
import bpy, os, sys, math, json
from mathutils import Vector as V
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(bpy.data.filepath)); OUT = HERE; TX = os.path.join(HERE, 'tex'); MP = os.path.join(HERE, '_maps')
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit'); import modelkit as mk
VAR = os.environ.get('G10_VAR', 'A'); FINAL = os.environ.get('G10_FINAL') == '1'; GAME_TEX, GAME_NTEX = int(os.environ.get('G10_GAME_TEX', '1024')), int(os.environ.get('G10_GAME_NTEX', '512'))
PJ = json.load(open(os.path.join(MP, 'parts.json'))); sc = bpy.data.scenes['GBU10']; col = bpy.data.collections['GBU10']; bpy.context.window_manager  # сцена уже открыта
mk.sc = sc; mk.col = col; mk.NAME = 'GBU10'; mk.S = PJ['S']; mk.X0 = PJ['X0']
objs = [o for o in col.objects if o.type == 'MESH']
PY = '/usr/bin/python3'


def lite(src, dst, px, q=None):
    code = f"import site,sys;sys.path.append(site.getusersitepackages());from PIL import Image;im=Image.open(r'''{src}''').convert('RGB');im=im.resize(({px},{px}),Image.LANCZOS) if im.size[0]!={px} else im;im.save(r'''{dst}'''{', quality=%d, subsampling=0, optimize=True' % q if q else ''})"
    os.system(f'{PY} -c "{code}"')


lite(f'{TX}/color_{VAR}.png', f'{TX}/game_color.jpg', GAME_TEX, 90); lite(f'{TX}/normal.png', f'{TX}/game_normal.png', GAME_NTEX)
if FINAL:
    lite(f'{TX}/color_{VAR}.png', f'{TX}/full_color.jpg', 2048, 92); lite(f'{TX}/normal.png', f'{TX}/full_normal.jpg', 2048, 92)


def atlas(cp, np_):
    ci = bpy.data.images.load(cp, check_existing=False); ni = bpy.data.images.load(np_, check_existing=False); ni.colorspace_settings.name = 'Non-Color'; ci.pack(); ni.pack()
    m = bpy.data.materials.get('G10_atlas') or bpy.data.materials.new('G10_atlas'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); o_ = nt.nodes.new('ShaderNodeOutputMaterial'); pr = nt.nodes.new('ShaderNodeBsdfPrincipled'); tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = ci; tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = ni; nm = nt.nodes.new('ShaderNodeNormalMap')
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
        ('превью_1_общий.png', V((0, 0.1, 0)), (-0.75, 0.70, 0.42), 6.4),
        ('превью_2_сбоку.png', V((0, 0, 0)), (-1.0, 0.0, 0.06), 6.6),
        ('превью_3_хвост.png', V((0, -1.55, 0)), (-0.72, -0.62, 0.42), 2.0),
        ('превью_4_голова.png', V((0, 1.45, 0)), (-0.72, 0.60, 0.34), 1.9)])]
    os.makedirs(OUT + '/снимки', exist_ok=True)
    mk.previews(OUT + '/снимки', size=(1600, 900), views=[
        ('головка.png', V((0, 1.96, 0)), (-0.72, 0.55, 0.30), 0.85),
        ('проушины.png', V((0, -0.36, 0.14)), (-0.55, 0.05, 0.84), 1.6),
        ('пояс_и_рули.png', V((0, 1.05, 0)), (-0.9, 0.2, 0.4), 1.5),
        ('хвост_сверху.png', V((0, -1.6, 0.05)), (-0.15, -0.35, 1.0), 1.8)])
    mk.export(OUT + '/gbu10_sketchfab.glb', None)
m = atlas(f'{TX}/game_color.jpg', f'{TX}/game_normal.png')
for o in objs: o.data.materials.clear(); o.data.materials.append(m)
mk.export(OUT + '/gbu10.glb', OUT + '/gbu10.blend' if FINAL else None)
print('файл для игры', os.path.getsize(OUT + '/gbu10.glb') // 1024, 'КБ')
if FINAL:
    mk.YC = 61.5; mk.NOSE = 1.0; os.makedirs(OUT + '/проверка-чертежей', exist_ok=True)
    mk.silhouette_side(OUT + '/проверка-чертежей/модель_бок.png', (740, 140), (370.0, 70.0))
    col_ = {}
    try: col_ = json.load(open(os.path.join(MP, 'collide.json'), encoding='utf-8'))
    except Exception as e: print('нет итога столкновений', e)
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]; LEN = round(max(p.y for p in pts) - min(p.y for p in pts), 3); S_ = PJ['S']; RB = PJ['rb']
    can_span = 2 * max(math.hypot((o.matrix_world @ v.co).x, (o.matrix_world @ v.co).z) for o in objs if o.name.startswith('canard') for v in o.data.vertices)
    tail_span = 2 * 55.5 * S_; wing_span = 2 * (PJ['hinge_r'] * S_ + PJ['wing_l'])
    R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_gbu10', weapon='gbu10', name='GBU-10 Paveway', name_en='GBU-10 Paveway', glb='gbu10.glb', blend='gbu10.blend', rev=1,
        build=['build.py', '_collide.py', 'bake_maps.py', 'paint.py', 'deliver.py'], previews_=PREV,
        checks={'collide': col_},
        sketchfab={'title': 'GBU-10 Paveway Bomb - Low Poly, Textured',
                   'lead': 'GBU-10 Paveway - US laser-guided bomb on a 2000 lb body, with a gimballed seeker and ring, four canards and a folding tail. Hand-modelled low-poly exterior with baked paint wear, a yellow band, own stencils and a normal map. Seeker, canards and tail wings are separate objects on their real pivots, shown stowed.',
                   'parts': ['seeker with ring on a gimbal', 'four canards on their own shafts', 'control unit with copper strap', 'body with two lugs', 'tail unit with four fins', 'four folding wings on hinges'],
                   'tags': ['gbu-10', 'paveway', 'laser guided bomb', 'lgb', 'mk 84', 'bomb', 'aviation bomb', 'precision guided', 'military', 'weapon', 'lowpoly', 'game-ready', 'textured', 'blender'],
                   'dimensions': f'length {LEN:.2f} m, body diameter {2 * RB:.2f} m, canard span {can_span:.2f} m, tail span {tail_span:.2f} m stowed, {wing_span:.2f} m with wings open',
                   'textures': '2048 px baked colour map and tangent-space normal map', 'glb': 'gbu10_sketchfab.glb'},
        notes=f'Ревизия 1 (2026-11-04): по картинкам Mark. референс_1 - вид сбоку, с него сняты все числа; устройство головки, шайба-ось створки и раскрытие - по референс_2; проушины и хвост - по референс_3 и референс_4. Окраска по выбору Mark: {VAR} (тёмная с жёлтым пояском). Медная лента по заданию, на главной картинке её не видно. Надписи свои. Для игры цвет {GAME_TEX}, нормали {GAME_NTEX}, для Sketchfab 2048.')
    R['model']['length_m'] = LEN; _sp = 2 * max(math.hypot((o.matrix_world @ v.co).x, (o.matrix_world @ v.co).z) for o in objs for v in o.data.vertices); R['model']['span_m'] = round(_sp, 3); R['model']['height_m'] = round(_sp, 3); json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
    G = lambda v: [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]                # в оси glTF: нос −Z, проушины +Y; поворот вокруг оси сохраняет знак
    D_ = lambda ph: (math.cos(math.radians(ph)), 0.0, math.sin(math.radians(ph))); A_ = lambda ph: (-math.sin(math.radians(ph)), 0.0, math.cos(math.radians(ph)))
    parts = {'seeker': {'pivot_gltf': G(bpy.data.objects['seeker'].location), 'axes_gltf': [[1, 0, 0], [0, 1, 0]], 'range_deg': [-30, 30], 'note': 'головка наведения с кольцом на шарнире у вершины конуса, поворот в любую сторону до 30 градусов'}}
    for i, ph in enumerate(PJ['phi']):
        parts[f'canard{i + 1}'] = {'pivot_gltf': G(bpy.data.objects[f'canard{i + 1}'].location), 'axis_gltf': G(D_(ph)), 'range_deg': [-15, 15], 'note': 'передний руль, ось по радиусу, в файле 0'}
    for i, ph in enumerate(PJ['phi']):
        parts[f'wing{i + 1}'] = {'pivot_gltf': G(bpy.data.objects[f'wing{i + 1}'].location), 'axis_gltf': G(A_(ph)), 'range_deg': [0, PJ['wing_open']], 'open_deg': PJ['wing_open'], 'note': 'хвостовая створка, в файле сложена (0); положительный угол вокруг оси раскрывает наружу'}
    pj['parts'] = parts; pj['fixed'] = ['G10_body', 'G10_ccg', 'G10_tail', 'G10_lugs']; pj['lug_top_gltf_y'] = round(PJ['lug_top'], 4)
    json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('deliver.py: готово', 'чистовой' if FINAL else 'проба', VAR)
