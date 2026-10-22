# bake.py — запекает две текстуры: цвет (gepard_detail.png: краска, песок и пыль, сколы, затенение щелей, зерно) и карту нормалей (gepard_normal.png: скруглённые рёбра,
# мелкая «корка» краски, лёгкая волна листов): рельеф без лишних треугольников.
# Нужен Cycles (есть в Blender). Запускается ПОСЛЕ build.py в той же сессии — в фоновом Blender или в живом (через exec):
#   K29_OUT="<папка модели>" [K29_TEX=2048] [K29_NTEX=2048] Blender -b --factory-startup --python build.py --python bake.py
# Что делает: развёртка всех деталей в один атлас (смарт-проекция + упаковка); запекание цвета (EMIT) → картинка с полноцветной краской: песок и пыль на верхних плоскостях,
# грязь снизу, сколы на рёбрах (игра кладёт камуфляж только на зелёную краску текстуры — песок и металл остаются); запекание нормалей (NORMAL, касательное пространство,
# Cycles берёт нормаль после узлов Bevel и Bump) → Base Color и Normal каждого материала. Тот же файл годится и для игры, и для Sketchfab. Картинки упаковываются в .blend.
# Размер — K29_TEX / K29_NTEX (по умолчанию 2048; в игру prepare.js сожмёт до 1024 / 512).
import os, sys, math, time
sys.dont_write_bytecode = True
import bpy

OUT = os.environ.get('K29_OUT')
if not OUT: raise SystemExit('Задай K29_OUT=<папка модели>')
SIZE = int(os.environ.get('K29_TEX', '2048'))
NSIZE = int(os.environ.get('K29_NTEX', str(SIZE)))
T0 = time.time()
sc = bpy.data.scenes['GEPARD']
if bpy.context.window: bpy.context.window.scene = sc
objs = [o for o in sc.objects if o.type == 'MESH']
vl = bpy.context.view_layer
vl.update()                                   # базы новых объектов появляются в слое только после обновления (в живом Blender — обязательно)


def log(*a): print(f'[{time.time() - T0:5.1f} с]', *a, flush=True)


# 1. развёртка: все детали сразу, один общий атлас
for o in vl.objects: o.select_set(False)
for o in objs:
    o.select_set(True)
    while len(o.data.uv_layers) > 0: o.data.uv_layers.remove(o.data.uv_layers[0])
    o.data.uv_layers.new(name='UVMap')
vl.objects.active = objs[0]
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
try: bpy.ops.uv.pack_islands(rotate=True, margin=0.002)
except TypeError: bpy.ops.uv.pack_islands(margin=0.002)
bpy.ops.object.mode_set(mode='OBJECT')
log('развёртка готова, объектов', len(objs))

# 2. картинка и шейдер запекания в каждом материале
old = bpy.data.images.get('GEP_detail')
if old is not None: bpy.data.images.remove(old)
path = os.path.join(OUT, 'gepard_detail.png')
REUSE = os.environ.get('K29_REUSE') == '1' and os.path.exists(path)       # подбор рельефа: цвет не запекать заново (геометрия та же — развёртка та же)
if REUSE:
    img = bpy.data.images.load(path, check_existing=False); img.name = 'GEP_detail'; img.pack()
else:
    img = bpy.data.images.new('GEP_detail', SIZE, SIZE, alpha=False)
    img.generated_color = (1, 1, 1, 1)
mats = [m for m in bpy.data.materials if m.name.startswith('GEP_')]


# шейдер запекания: итоговая яркость и цвет по каналам, выводом через Emission (запекается типом EMIT)
def build_pattern(mat):
    """Шейдер запекания: полноцветная текстура краски — цвет материала, поверх него песок и пыль на верхних плоскостях, песок и глина снизу, сколы до голого металла
    на рёбрах, затёртые пятна, царапины, выцветание, затенение трёх масштабов, зерно. Вывод — через Emission (запекается типом EMIT)."""
    nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for n in list(nodes):
        if n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): nodes.remove(n)
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL'); prin = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    col = tuple(prin.inputs['Base Color'].default_value)
    for l in list(prin.inputs['Base Color'].links): links.remove(l)
    N = lambda t: nodes.new(t)
    kind = mat.name
    dust_k = {'GEP_body': 1.0, 'GEP_dark': 0.8, 'GEP_steel': 0.45, 'GEP_glass': 0.2}.get(kind, 1.0)
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
    ao1 = N('ShaderNodeAmbientOcclusion'); ao1.samples = 24; ao1.inputs['Distance'].default_value = 0.30
    ao2 = N('ShaderNodeAmbientOcclusion'); ao2.samples = 12; ao2.inputs['Distance'].default_value = 1.6
    ao3 = N('ShaderNodeAmbientOcclusion'); ao3.samples = 12; ao3.inputs['Distance'].default_value = 0.75
    a1 = maprange(ao1.outputs['AO'], 0, 1, 0.28, 1.0); a2 = maprange(ao2.outputs['AO'], 0, 1, 0.62, 1.0); a3 = maprange(ao3.outputs['AO'], 0, 1, 0.55, 1.0)
    sep = N('ShaderNodeSeparateXYZ'); links.new(tc.outputs['Object'], sep.inputs['Vector'])
    geo = N('ShaderNodeNewGeometry'); gsep = N('ShaderNodeSeparateXYZ'); links.new(geo.outputs['Normal'], gsep.inputs['Vector'])
    def noise(scale, detail, rough, lo, hi):
        n = N('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(tc.outputs['Object'], n.inputs['Vector']); return maprange(n.outputs['Fac'], lo, hi, 0.0, 1.0)
    patchy = noise(4.0, 7.0, 0.6, 0.30, 0.72)
    mp = N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (9.0, 9.0, 1.1); links.new(tc.outputs['Object'], mp.inputs['Vector'])
    st = N('ShaderNodeTexNoise'); st.noise_dimensions = '3D'; st.inputs['Scale'].default_value = 1.0; st.inputs['Detail'].default_value = 3.0; st.inputs['Roughness'].default_value = 0.7
    links.new(mp.outputs['Vector'], st.inputs['Vector'])
    streak = maprange(st.outputs['Fac'], 0.42, 0.68, 0.0, 1.0)
    gm = N('ShaderNodeMapping'); gm.inputs['Scale'].default_value = (260.0, 260.0, 260.0); links.new(tc.outputs['Object'], gm.inputs['Vector'])
    wn = N('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; links.new(gm.outputs['Vector'], wn.inputs['Vector'])
    grain = math_('ADD', 1.0, math_('MULTIPLY', math_('SUBTRACT', wn.outputs['Value'], 0.5), 0.14))
    topmask = N('ShaderNodeMapRange'); topmask.interpolation_type = 'SMOOTHSTEP'; topmask.clamp = True
    topmask.inputs['From Min'].default_value = 0.35; topmask.inputs['From Max'].default_value = 0.92; topmask.inputs['To Min'].default_value = 0.0; topmask.inputs['To Max'].default_value = 1.0
    links.new(gsep.outputs['Z'], topmask.inputs['Value'])
    low = maprange(sep.outputs['Z'], 0.0, 1.45, 1.0, 0.0)
    gate = math_('ADD', 0.35, math_('MULTIPLY', a1, 0.65))                    # в щелях пыли и песка мало
    top_amt = math_('MULTIPLY', math_('MULTIPLY', topmask.outputs['Result'], math_('ADD', 0.45, math_('MULTIPLY', patchy, 0.55))), gate)
    low_amt = math_('MULTIPLY', math_('MULTIPLY', math_('MULTIPLY', low, low), math_('ADD', 0.5, math_('MULTIPLY', patchy, 0.5))), gate)
    top_amt = math_('ADD', top_amt, math_('MULTIPLY', streak, 0.06), clamp=True)
    if kind == 'GEP_dark':                                                     # антенна обзора — чёрная: пыль на неё не ложится (область z > 2,43, y < −1,2)
        rm = math_('MULTIPLY', maprange(sep.outputs['Z'], 2.40, 2.46, 0.0, 1.0), maprange(sep.outputs['Y'], -1.18, -1.24, 0.0, 1.0))
        keep = math_('SUBTRACT', 1.0, rm); top_amt = math_('MULTIPLY', top_amt, keep); low_amt = math_('MULTIPLY', low_amt, keep)
    # рёбра: узкая полоса блика и широкая зона износа для сколов
    bev = N('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.018; bev.samples = 6
    dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; links.new(bev.outputs['Normal'], dot.inputs[0]); links.new(geo.outputs['Normal'], dot.inputs[1])
    edge = maprange(dot.outputs['Value'], 1.0, 0.93, 0.0, 1.0)
    bev2 = N('ShaderNodeBevel'); bev2.inputs['Radius'].default_value = 0.045; bev2.samples = 6
    dot2 = N('ShaderNodeVectorMath'); dot2.operation = 'DOT_PRODUCT'; links.new(bev2.outputs['Normal'], dot2.inputs[0]); links.new(geo.outputs['Normal'], dot2.inputs[1])
    zone = maprange(dot2.outputs['Value'], 1.0, 0.90, 0.0, 1.0)
    chip = math_('MULTIPLY', zone, noise(17.0, 5.0, 0.6, 0.50, 0.62))
    scuff = math_('MULTIPLY', noise(6.5, 8.0, 0.62, 0.60, 0.74), math_('ADD', 0.35, math_('MULTIPLY', maprange(gsep.outputs['Z'], -0.2, 0.9, 0.0, 1.0), 0.65)))
    vor = N('ShaderNodeTexVoronoi'); vor.voronoi_dimensions = '3D'; vor.feature = 'DISTANCE_TO_EDGE'; vor.inputs['Scale'].default_value = 7.0
    links.new(tc.outputs['Object'], vor.inputs['Vector'])
    scratch = math_('MULTIPLY', maprange(vor.outputs['Distance'], 0.0, 0.05, 1.0, 0.0), noise(22.0, 3.0, 0.5, 0.50, 0.66))
    fade = noise(1.1, 3.0, 0.5, 0.32, 0.68)
    down = maprange(gsep.outputs['Z'], 0.15, -0.6, 0.0, 1.0)
    # цвет: краска → песок сверху → глина снизу → затёртая краска → голый металл на сколах и царапинах → затенение, выцветание, зерно
    SAND, MUD, METAL = (0.34, 0.25, 0.135), (0.17, 0.115, 0.065), (0.15, 0.15, 0.145)
    c = rgb(col)
    c = mixc(c, rgb(SAND), math_('MULTIPLY', top_amt, 0.85 * dust_k))
    c = mixc(c, rgb(MUD), math_('MULTIPLY', low_amt, 0.75 * dust_k))
    light = mixc(rgb(col), gray(1.7), 1.0, 'MULTIPLY')                              # затёртая краска — светлее основы
    c = mixc(c, light, math_('MULTIPLY', scuff, 0.55))
    wearmask = math_('ADD', math_('MULTIPLY', edge, 0.85), math_('ADD', chip, math_('MULTIPLY', scratch, 0.6)), clamp=True)
    c = mixc(c, rgb(METAL), math_('MULTIPLY', wearmask, 0.9))
    c = mixc(c, gray(math_('MULTIPLY', math_('MULTIPLY', a1, a2), a3)), 1.0, 'MULTIPLY')
    c = mixc(c, gray(math_('ADD', 0.92, math_('MULTIPLY', fade, 0.08))), 1.0, 'MULTIPLY')
    c = mixc(c, gray(math_('SUBTRACT', 1.0, math_('MULTIPLY', down, 0.28))), 1.0, 'MULTIPLY')
    c = mixc(c, gray(grain), 1.0, 'MULTIPLY')
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
    bpy.ops.object.bake(type='EMIT', width=SIZE, height=SIZE, margin=10, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
    log('запекание готово')
else: log('цвет взят из прошлого запуска (K29_REUSE=1)')

# 4. сохранить картинку цвета
if not REUSE:
    img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    img.pack()
log('цвет сохранён', path)


# 5. карта нормалей: рельеф — в Normal принципиального шейдера (Bevel → Bump), запекание типа NORMAL в касательном пространстве
def build_relief(mat, entry):
    """Рельеф поверхности для запекания нормалей: Bevel скругляет все рёбра (блик на кромках без лишних треугольников), Bump добавляет мелкую «корку» краски
    (ячейка ≈ 2 см) и лёгкую волну листов (≈ 20 см). Резина и тёмные детали — грубее, металл — глаже, стекло — только скругление рёбер."""
    out, prin, tex, col = entry; nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for l in list(out.inputs['Surface'].links): links.remove(l)
    links.new(prin.outputs['BSDF'], out.inputs['Surface'])
    kind = mat.name
    k_fine, k_wave, bev_r = {'GEP_body': (1.0, 1.0, 0.014), 'GEP_dark': (1.5, 0.8, 0.012), 'GEP_steel': (0.55, 0.6, 0.011), 'GEP_glass': (0.0, 0.0, 0.010)}.get(kind, (1.0, 1.0, 0.014))
    tc = nodes.new('ShaderNodeTexCoord')
    bev = nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = bev_r; bev.samples = 10
    def noise(scale, detail, rough):
        n = nodes.new('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(tc.outputs['Object'], n.inputs['Vector']); return n.outputs['Fac']
    def mul(a, k):
        n = nodes.new('ShaderNodeMath'); n.operation = 'MULTIPLY'; links.new(a, n.inputs[0]); n.inputs[1].default_value = k; return n.outputs['Value']
    def add(a, b):
        n = nodes.new('ShaderNodeMath'); n.operation = 'ADD'; links.new(a, n.inputs[0]); links.new(b, n.inputs[1]); return n.outputs['Value']
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.02; bump.inputs['Strength'].default_value = 1.0
    if k_fine > 0:
        h = add(mul(noise(48.0, 3.0, 0.55), 0.55 * k_fine), mul(noise(4.5, 2.0, 0.5), 2.2 * k_wave))
        links.new(h, bump.inputs['Height'])
    links.new(bev.outputs['Normal'], bump.inputs['Normal'])
    links.new(bump.outputs['Normal'], prin.inputs['Normal'])


nimg = bpy.data.images.get('GEP_normal')
if nimg is not None: bpy.data.images.remove(nimg)
nimg = bpy.data.images.new('GEP_normal', NSIZE, NSIZE, alpha=False)
nimg.generated_color = (0.5, 0.5, 1.0, 1.0); nimg.colorspace_settings.name = 'Non-Color'
ntex_of = {}
for m in mats:
    build_relief(m, rig[m.name])
    nt = m.node_tree; nt.nodes.new('ShaderNodeTexImage')
    ntx = nt.nodes[-1]; ntx.image = nimg; ntex_of[m.name] = ntx
    for n in nt.nodes: n.select = False
    ntx.select = True; nt.nodes.active = ntx
bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', width=NSIZE, height=NSIZE, margin=10, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
log('нормали запечены')
npath = os.path.join(OUT, 'gepard_normal.png')
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
log('картинки', path, npath, 'материалы подключены:', [m.name for m in mats])


# 7. облегчённые копии для игры и репозитория (1024): цвет — JPEG, нормали — PNG без потерь; prepare.js берёт их как есть (2048 остаются для Sketchfab и .blend)
def lite(image, name, fmt, fname):
    c = image.copy(); c.name = name; c.scale(1024, 1024); c.file_format = fmt
    p_ = os.path.join(OUT, fname)
    try: c.save(filepath=p_, quality=92)
    except TypeError:
        c.filepath_raw = p_; c.save()
    bpy.data.images.remove(c)
    return p_


lite(img, 'GEP_detail_1024', 'JPEG', 'gepard_detail_1024.jpg'); lite(nimg, 'GEP_normal_1024', 'PNG', 'gepard_normal_1024.png')
log('облегчённые копии 1024 готовы')
