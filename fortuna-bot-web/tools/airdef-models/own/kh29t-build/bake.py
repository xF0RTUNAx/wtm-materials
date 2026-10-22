# bake.py — запекает две текстуры Х-29Т (ревизия 2): цвет (kh29t_detail.png: светлая краска, затенение стыков и щелей, потёки вдоль корпуса, нагар у сопла, потёртости на кромках,
# трафаретный номер на корпусе по обоим бортам — как на картинке 6) и карту нормалей (kh29t_normal.png: скруглённые кромки, мелкое зерно краски, лёгкая волна обшивки).
# Нужен Cycles (есть в Blender). Запускается ПОСЛЕ build.py в той же сессии — в фоновом Blender или в живом (через exec):
#   K29_OUT="<папка модели>" [K29_TEX=1024] Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Развёртка: все детали сразу, один атлас (смарт-проекция, выравнивание масштаба, упаковка). Трафарет не зависит от развёртки: шейдер ставит его по координатам модели
# (проекция сбоку на борта корпуса), поэтому цифры не рвутся по островам. Картинки упаковываются в .blend. Размер — K29_TEX (по умолчанию 1024; в игру deliver.py отдаёт 512).
import os, sys, math, time
sys.dont_write_bytecode = True
import bpy
import modelkit as mk                                   # build.py уже подключил библиотеку и построил модель
try:
    import numpy as np
except Exception:
    np = None

OUT = os.environ.get('K29_OUT')
if not OUT: raise SystemExit('Задай K29_OUT=<папка модели>')
SIZE = int(os.environ.get('K29_TEX', '1024'))
NSIZE = int(os.environ.get('K29_NTEX', str(SIZE)))
T0 = time.time()
sc = bpy.data.scenes['KH29T']
if bpy.context.window: bpy.context.window.scene = sc
objs = [o for o in sc.objects if o.type == 'MESH']
vl = bpy.context.view_layer
vl.update()                                   # базы новых объектов появляются в слое только после обновления (в живом Blender — обязательно)


def log(*a): print(f'[{time.time() - T0:5.1f} с]', *a, flush=True)


# 1. развёртка: все детали сразу, один общий атлас; масштаб островов выравнивается — плотность пикселей одинаковая у корпуса, крыльев и мелочи
for o in vl.objects: o.select_set(False)
for o in objs:
    o.select_set(True)
    while len(o.data.uv_layers) > 0: o.data.uv_layers.remove(o.data.uv_layers[0])
    o.data.uv_layers.new(name='UVMap')
vl.objects.active = objs[0]
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(70), island_margin=0.003, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
try: bpy.ops.uv.average_islands_scale()
except Exception as e: print('average_islands_scale:', e)
try: bpy.ops.uv.pack_islands(rotate=True, margin=0.003)
except TypeError: bpy.ops.uv.pack_islands(margin=0.003)
bpy.ops.object.mode_set(mode='OBJECT')
log('развёртка готова, объектов', len(objs))

# 2. картинки: цвет, трафарет (цифры — растровым шрифтом 5×7, без внешних файлов)
old = bpy.data.images.get('K29_detail')
if old is not None: bpy.data.images.remove(old)
path = os.path.join(OUT, 'kh29t_detail.png')
REUSE = os.environ.get('K29_REUSE') == '1' and os.path.exists(path)       # подбор рельефа: цвет не запекать заново (геометрия та же — развёртка та же)
if REUSE:
    img = bpy.data.images.load(path, check_existing=False); img.name = 'K29_detail'; img.pack()
else:
    img = bpy.data.images.new('K29_detail', SIZE, SIZE, alpha=False)
    img.generated_color = (1, 1, 1, 1)
mats = [m for m in bpy.data.materials if m.name.startswith('K29_')]

GLYPH = {
    '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'], '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'], '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
}
STENCIL = '7290024500344'                              # номер на корпусе (как на картинке 6), чёрным, по обоим бортам
SW, SH_ = 0.50, 0.062                                  # размер надписи, м (ширина × высота)
SX, SZ = -1.12, 0.0                                    # центр надписи: Y (м от середины длины; нос — «+», хвост — «−»: хвостовой отсек между лючком у корня крыла и круглой крышкой), Z


def make_stencil():
    """Картинка трафарета: чёрные цифры, остальное прозрачно; клетка шрифта 5×7 с зазором 1 клетка между цифрами."""
    cw, ch, gap = 5, 7, 1
    cols = len(STENCIL) * cw + (len(STENCIL) - 1) * gap
    k = 10                                             # пикселей на клетку шрифта
    W, H = cols * k, ch * k
    a = [[0.0] * W for _ in range(H)]
    for n, chr_ in enumerate(STENCIL):
        g = GLYPH[chr_]
        for r in range(ch):
            for c in range(cw):
                if g[r][c] == '#':
                    x0, y0 = (n * (cw + gap) + c) * k, (ch - 1 - r) * k      # строка 0 шрифта — верх; в картинке Blender начало внизу
                    for yy in range(y0, y0 + k):
                        for xx in range(x0, x0 + k): a[yy][xx] = 1.0
    im = bpy.data.images.get('K29_stencil')
    if im is not None: bpy.data.images.remove(im)
    im = bpy.data.images.new('K29_stencil', W, H, alpha=True)
    px = []
    for yy in range(H):
        for xx in range(W): px.extend((0.015, 0.015, 0.017, a[yy][xx]))
    im.pixels.foreach_set(px)
    im.alpha_mode = 'STRAIGHT'
    return im, W / H


stencil_img, stencil_aspect = make_stencil()


# шейдер запекания: итоговая яркость и цвет по каналам, выводом через Emission (запекается типом EMIT)
def build_pattern(mat):
    """Шейдер запекания: краска материала, затенение щелей трёх масштабов, потёки вдоль корпуса, нагар у сопла, потёртости на кромках и крыльях, трафаретный номер на бортах корпуса.
    Вывод — через Emission (запекается типом EMIT)."""
    nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for n in list(nodes):
        if n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): nodes.remove(n)
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL'); prin = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    col = tuple(prin.inputs['Base Color'].default_value)
    for l in list(prin.inputs['Base Color'].links): links.remove(l)
    N = lambda t: nodes.new(t)
    kind = mat.name
    soil_k = {'K29_body': 1.0, 'K29_wing': 0.9, 'K29_ctrl': 0.8, 'K29_dark': 0.35}.get(kind, 1.0)
    def math_(op, a=None, b=None, clamp=False):
        n = N('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: links.new(v, n.inputs[i])
        return n.outputs['Value']
    def maprange(src, fmin, fmax, tmin, tmax, clamp=True):
        n = N('ShaderNodeMapRange'); n.clamp = clamp
        n.inputs['From Min'].default_value = fmin; n.inputs['From Max'].default_value = fmax; n.inputs['To Min'].default_value = tmin; n.inputs['To Max'].default_value = tmax
        links.new(src, n.inputs['Value']); return n.outputs['Result']
    def rgb(c):
        n = N('ShaderNodeRGB'); n.outputs[0].default_value = (*c[:3], 1.0); return n.outputs[0]
    def mixc(a, b, fac, blend='MIX'):
        n = N('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = blend
        ins = [x for x in n.inputs if x.type == 'RGBA']; res = [x for x in n.outputs if x.type == 'RGBA'][0]
        links.new(a, ins[0]); links.new(b, ins[1])
        if isinstance(fac, (int, float)): n.inputs[0].default_value = fac
        else: links.new(fac, n.inputs[0])
        return res
    def gray(v):
        n = N('ShaderNodeCombineColor')
        for i in range(3):
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: links.new(v, n.inputs[i])
        return n.outputs['Color']
    tc = N('ShaderNodeTexCoord')
    sep = N('ShaderNodeSeparateXYZ'); links.new(tc.outputs['Object'], sep.inputs['Vector'])
    geo = N('ShaderNodeNewGeometry'); gsep = N('ShaderNodeSeparateXYZ'); links.new(geo.outputs['Normal'], gsep.inputs['Vector'])
    ao1 = N('ShaderNodeAmbientOcclusion'); ao1.samples = 24; ao1.inputs['Distance'].default_value = 0.05
    ao2 = N('ShaderNodeAmbientOcclusion'); ao2.samples = 12; ao2.inputs['Distance'].default_value = 0.22
    ao3 = N('ShaderNodeAmbientOcclusion'); ao3.samples = 12; ao3.inputs['Distance'].default_value = 0.8
    a1 = maprange(ao1.outputs['AO'], 0, 1, 0.45, 1.0); a2 = maprange(ao2.outputs['AO'], 0, 1, 0.70, 1.0); a3 = maprange(ao3.outputs['AO'], 0, 1, 0.78, 1.0)
    def noise(scale, detail, rough, lo, hi, vec=None):
        n = N('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(vec if vec is not None else tc.outputs['Object'], n.inputs['Vector']); return maprange(n.outputs['Fac'], lo, hi, 0.0, 1.0)
    # потёки вдоль корпуса: шум, сильно вытянутый по оси ракеты (Y), — узкие полосы по окружности
    mp = N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (38.0, 2.2, 38.0); links.new(tc.outputs['Object'], mp.inputs['Vector'])
    streak = noise(1.0, 4.0, 0.62, 0.40, 0.70, vec=mp.outputs['Vector'])
    patchy = noise(5.0, 6.0, 0.6, 0.30, 0.72)
    gm = N('ShaderNodeMapping'); gm.inputs['Scale'].default_value = (300.0, 300.0, 300.0); links.new(tc.outputs['Object'], gm.inputs['Vector'])
    wn = N('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; links.new(gm.outputs['Vector'], wn.inputs['Vector'])
    grain = math_('ADD', 1.0, math_('MULTIPLY', math_('SUBTRACT', wn.outputs['Value'], 0.5), 0.07))
    # нагар у сопла и копоть: хвост — Y меньше −1,35 (середина длины в нуле, нос в +Y)
    soot = math_('MULTIPLY', maprange(sep.outputs['Y'], -1.30, -1.95, 0.0, 1.0), math_('ADD', 0.55, math_('MULTIPLY', patchy, 0.45)))
    # кромки: узкая полоса блика, широкая зона износа для сколов
    bev = N('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.006; bev.samples = 6
    dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; links.new(bev.outputs['Normal'], dot.inputs[0]); links.new(geo.outputs['Normal'], dot.inputs[1])
    edge = maprange(dot.outputs['Value'], 1.0, 0.93, 0.0, 1.0)
    bev2 = N('ShaderNodeBevel'); bev2.inputs['Radius'].default_value = 0.02; bev2.samples = 6
    dot2 = N('ShaderNodeVectorMath'); dot2.operation = 'DOT_PRODUCT'; links.new(bev2.outputs['Normal'], dot2.inputs[0]); links.new(geo.outputs['Normal'], dot2.inputs[1])
    zone = maprange(dot2.outputs['Value'], 1.0, 0.90, 0.0, 1.0)
    chip = math_('MULTIPLY', zone, noise(26.0, 5.0, 0.6, 0.50, 0.62))
    scuff = math_('MULTIPLY', noise(8.0, 7.0, 0.62, 0.58, 0.74), math_('ADD', 0.4, math_('MULTIPLY', streak, 0.6)))
    # цвет: краска → затёртые места светлее → грязные потёки → голый металл на кромках → копоть → затенение, зерно → трафарет
    METAL, GRIME, SOOT = (0.22, 0.22, 0.21), (0.17, 0.16, 0.14), (0.02, 0.02, 0.02)
    c = rgb(col)
    light = mixc(rgb(col), gray(1.35), 1.0, 'MULTIPLY')
    c = mixc(c, light, math_('MULTIPLY', scuff, 0.45))
    c = mixc(c, rgb(GRIME), math_('MULTIPLY', math_('MULTIPLY', streak, math_('ADD', 0.25, math_('MULTIPLY', patchy, 0.75))), 0.42 * soil_k))
    c = mixc(c, rgb(METAL), math_('MULTIPLY', math_('ADD', math_('MULTIPLY', edge, 0.7), math_('ADD', chip, 0.0), clamp=True), 0.8))
    c = mixc(c, rgb(SOOT), math_('MULTIPLY', soot, 0.85 * soil_k))
    c = mixc(c, gray(math_('MULTIPLY', math_('MULTIPLY', a1, a2), a3)), 1.0, 'MULTIPLY')
    c = mixc(c, gray(grain), 1.0, 'MULTIPLY')
    # трафаретный номер: на бортах корпуса (нормаль смотрит вбок), проекция сбоку по координатам Y и Z модели; на левом борту — зеркально, чтобы читалось слева направо
    if kind == 'K29_body':
        for side in (1, -1):
            cmb = N('ShaderNodeCombineXYZ'); links.new(math_('MULTIPLY', sep.outputs['Y'], float(side)), cmb.inputs['X']); links.new(sep.outputs['Z'], cmb.inputs['Y'])
            mpp = N('ShaderNodeMapping'); mpp.inputs['Scale'].default_value = (1.0 / SW, 1.0 / SH_, 1.0)
            mpp.inputs['Location'].default_value = (0.5 - side * SX / SW, 0.5 - SZ / SH_, 0.0)
            links.new(cmb.outputs['Vector'], mpp.inputs['Vector'])
            tx = N('ShaderNodeTexImage'); tx.image = stencil_img; tx.extension = 'CLIP'; tx.interpolation = 'Linear'; links.new(mpp.outputs['Vector'], tx.inputs['Vector'])
            side_mask = maprange(math_('MULTIPLY', gsep.outputs['X'], float(side)), 0.55, 0.8, 0.0, 1.0)
            c = mixc(c, rgb((0.015, 0.015, 0.017)), math_('MULTIPLY', tx.outputs['Alpha'], side_mask))
    emi = N('ShaderNodeEmission'); links.new(c, emi.inputs['Color'])
    links.new(emi.outputs['Emission'], out.inputs['Surface'])
    tex = N('ShaderNodeTexImage'); tex.image = img
    for n in nodes: n.select = False
    tex.select = True; nodes.active = tex
    return out, prin, tex, col


rig = {m.name: build_pattern(m) for m in mats}
log('шейдеры запекания готовы')

# 3. запекание (Cycles, процессор)
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 24
try: sc.cycles.use_denoising = False
except Exception: pass
for o in vl.objects: o.select_set(False)
for o in objs: o.select_set(True)
vl.objects.active = objs[0]
if not REUSE:
    bpy.ops.object.bake(type='EMIT', width=SIZE, height=SIZE, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
    log('запекание цвета готово')
else: log('цвет взят из прошлого запуска (K29_REUSE=1)')

# 4. сохранить картинку цвета
if not REUSE:
    img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    img.pack()
log('цвет сохранён', path)


# 5. карта нормалей: рельеф — в Normal принципиального шейдера (Bevel → Bump), запекание типа NORMAL в касательном пространстве
def build_relief(mat, entry):
    """Рельеф поверхности для запекания нормалей: Bevel скругляет кромки, Bump добавляет мелкое зерно краски (ячейка ≈ 7 мм) и лёгкую волну обшивки (≈ 20 см).
    Стекло головки и тёмные детали — глаже, тело и крылья — как есть."""
    out, prin, tex, col = entry; nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for l in list(out.inputs['Surface'].links): links.remove(l)
    links.new(prin.outputs['BSDF'], out.inputs['Surface'])
    k_fine, k_wave, bev_r = {'K29_body': (0.65, 1.0, 0.005), 'K29_wing': (0.6, 0.7, 0.004), 'K29_ctrl': (0.6, 0.7, 0.004), 'K29_dark': (0.4, 0.3, 0.004)}.get(mat.name, (1.0, 1.0, 0.005))
    tc = nodes.new('ShaderNodeTexCoord')
    bev = nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = bev_r; bev.samples = 10
    def noise(scale, detail, rough):
        n = nodes.new('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(tc.outputs['Object'], n.inputs['Vector']); return n.outputs['Fac']
    def mul(a, k):
        n = nodes.new('ShaderNodeMath'); n.operation = 'MULTIPLY'; links.new(a, n.inputs[0]); n.inputs[1].default_value = k; return n.outputs['Value']
    def add(a, b):
        n = nodes.new('ShaderNodeMath'); n.operation = 'ADD'; links.new(a, n.inputs[0]); links.new(b, n.inputs[1]); return n.outputs['Value']
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.01; bump.inputs['Strength'].default_value = 1.0
    h = add(mul(noise(150.0, 3.0, 0.55), 0.55 * k_fine), mul(noise(5.0, 2.0, 0.5), 1.6 * k_wave))
    links.new(h, bump.inputs['Height'])
    links.new(bev.outputs['Normal'], bump.inputs['Normal'])
    links.new(bump.outputs['Normal'], prin.inputs['Normal'])


nimg = bpy.data.images.get('K29_normal')
if nimg is not None: bpy.data.images.remove(nimg)
nimg = bpy.data.images.new('K29_normal', NSIZE, NSIZE, alpha=False)
nimg.generated_color = (0.5, 0.5, 1.0, 1.0); nimg.colorspace_settings.name = 'Non-Color'
ntex_of = {}
for m in mats:
    build_relief(m, rig[m.name])
    nt = m.node_tree; ntx = nt.nodes.new('ShaderNodeTexImage')
    ntx.image = nimg; ntex_of[m.name] = ntx
    for n in nt.nodes: n.select = False
    ntx.select = True; nt.nodes.active = ntx
bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', width=NSIZE, height=NSIZE, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
log('нормали запечены')
npath = os.path.join(OUT, 'kh29t_normal.png')
nimg.filepath_raw = npath; nimg.file_format = 'PNG'; nimg.save()
nimg.pack()

# 6. материалы: Base Color = текстура цвета, Normal = карта нормалей (Normal Map, касательное пространство); служебные узлы убрать
for m in mats:
    out, prin, tex, col = rig[m.name]; nt = m.node_tree; ntx = ntex_of[m.name]
    for l in list(prin.inputs['Normal'].links): nt.links.remove(l)
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.space = 'TANGENT'; nm.uv_map = 'UVMap'; nm.inputs['Strength'].default_value = 1.0
    keep = {out, prin, tex, ntx, nm}
    for n in list(nt.nodes):
        if n not in keep: nt.nodes.remove(n)
    nt.links.new(tex.outputs['Color'], prin.inputs['Base Color'])
    nt.links.new(ntx.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], prin.inputs['Normal'])
    tex.location = (-500, 100); ntx.location = (-700, -200); nm.location = (-300, -200)
si = bpy.data.images.get('K29_stencil')
if si is not None: bpy.data.images.remove(si)                    # трафарет уже в цвете — отдельная картинка в файле не нужна
log('картинки', path, npath, 'материалы подключены:', [m.name for m in mats])


# 7. облегчённые копии для игры и репозитория (512): цвет — JPEG, нормали — PNG без потерь; prepare.js берёт их как есть (SIZE остаётся для Sketchfab)
def lite(image, name, fmt, fname, px=512):
    c = image.copy(); c.name = name; c.scale(px, px); c.file_format = fmt
    p_ = os.path.join(OUT, fname)
    try: c.save(filepath=p_, quality=92)
    except TypeError:
        c.filepath_raw = p_; c.save()
    bpy.data.images.remove(c)
    return p_


lite(img, 'K29_detail_512', 'JPEG', 'kh29t_detail_512.jpg'); lite(nimg, 'K29_normal_512', 'PNG', 'kh29t_normal_512.png')
log('облегчённые копии 512 готовы')
