# bake.py — запекает текстуры ракеты «Кинжал»: цвет (kinzhal_detail.png: белая краска, лёгкий налёт и копоть у хвоста, разводы вдоль полёта, тёплый оттенок кончика, щели-«двойки» на нижнем боку, износ на кромках рулей,
# затенение щелей) и карту нормалей (kinzhal_normal.png: скруглённые рёбра, мелкая «корка» краски, щели и швы как рельеф): рельеф без лишних треугольников. Третья карта kinzhal_orm.png (R = 1, G = шероховатость,
# B = металличность) — только для Sketchfab и .blend: игра берёт постоянные значения. Нужен Cycles (на видеокарте — gpu_setup). Запускается ПОСЛЕ build.py в той же сессии:
#   KNZ_OUT="<папка модели>" [KNZ_TEX=4096] [KNZ_NTEX=4096] [KNZ_REUSE=1] Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Развёртка: корпус — полосами вокруг оси со швом снизу (ring_uv): цилиндр и конус режутся по стыку конуса и кладутся рядом (плотность выше, чем у одной длинной полосы); рули — смарт-проекцией; общий атлас, зазор 16 px
# при полосе растяжки 8 px (иначе сосед затирает полосу). Мелочь (короб, лючки, винты, овалы на рулях) — плоский объект без развёртки. Щели и тон кончика привязаны к координатам модели (от хвоста).
# KNZ_COLOR_TEST=<папка>: быстрый просмотр рисунка краски прямо на модели (Emission как есть, без запекания), четыре ракурса, затем выход.
import os, sys, math, time
sys.dont_write_bytecode = True
import bpy

OUT = os.environ.get('KNZ_OUT')
if not OUT: raise SystemExit('Задай KNZ_OUT=<папка модели>')
SIZE = int(os.environ.get('KNZ_TEX', '2048'))
NSIZE = int(os.environ.get('KNZ_NTEX', str(SIZE)))
GAME_TEX, GAME_NTEX = int(os.environ.get('KNZ_GAME_TEX', '512')), int(os.environ.get('KNZ_GAME_NTEX', '512'))
T0 = time.time()
sc = bpy.data.scenes['KINZHAL']
if bpy.context.window: bpy.context.window.scene = sc
all_objs = [o for o in sc.objects if o.type == 'MESH']
_ys = [v.co.y for v in next(o for o in all_objs if o.name == 'KNZ_body').data.vertices]
LEN = max(_ys) - min(_ys); HALF = LEN / 2.0
X_CONE = 0.54 * 7.194                                    # стык конуса с цилиндром (как в build.py)
R_BODY = 0.465
FLAT_OBJS = ('KNZ_hw',)
FLAT_RGB = {'KNZ_body': (0.62, 0.625, 0.61), 'KNZ_dark': (0.020, 0.020, 0.022), 'KNZ_steel': (0.24, 0.24, 0.25), 'KNZ_fin': (0.60, 0.61, 0.60)}
flat_mats = {}
for m_ in [m for m in bpy.data.materials if m.name in FLAT_RGB]:
    mf_ = m_.copy(); mf_.name = m_.name + 'F'; flat_mats[m_.name] = mf_
    next(n for n in mf_.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (*FLAT_RGB[m_.name], 1.0)
for o in all_objs:
    if o.name in FLAT_OBJS:
        for sl in o.material_slots:
            if sl.material is not None and sl.material.name in flat_mats: sl.material = flat_mats[sl.material.name]
        while len(o.data.uv_layers) > 0: o.data.uv_layers.remove(o.data.uv_layers[0])
objs = [o for o in all_objs if o.name not in FLAT_OBJS]
vl = bpy.context.view_layer
vl.update()


def log(*a): print(f'[{time.time() - T0:5.1f} с]', *a, flush=True)


# 1. развёртка: корпус — полосы вокруг оси (ring_uv), рули — смарт-проекция; общий атлас, зазор 16 px при полосе растяжки 8 px
CUT_X = (X_CONE,)


def ring_uv(o, n=40):
    """Тело вращения (кольца по n вершин подряд): u — дуга по радиусу кольца, v — длина профиля; торцы-крышки — плоско. Полосы после разрезов по CUT_X сдвинуты в стороны."""
    me = o.data; uvd = me.uv_layers.active.data; nv = len(me.vertices); nr = nv // n
    cx = [sum(me.vertices[i * n + j].co.x for j in range(n)) / n for i in range(nr)]
    cy = [sum(me.vertices[i * n + j].co.y for j in range(n)) / n for i in range(nr)]
    cz = [sum(me.vertices[i * n + j].co.z for j in range(n)) / n for i in range(nr)]
    rr = [sum(math.hypot(me.vertices[i * n + j].co.x - cx[i], me.vertices[i * n + j].co.z - cz[i]) for j in range(n)) / n for i in range(nr)]
    vv = [0.0]
    for i in range(1, nr): vv.append(vv[-1] + math.hypot(cy[i] - cy[i - 1], rr[i] - rr[i - 1]))
    cut_idx = []
    for xcut in CUT_X:
        # ближайшая к стыку конуса канавка: срез по кольцу, лежащему в её середине (шов прячется в канавке)
        k = min(range(nr), key=lambda i: abs(cy[i] + HALF - xcut))
        cut_idx.append(k)
    u_step = 2 * math.pi * max(rr) + 0.12
    for poly in me.polygons:
        li = list(poly.loop_indices); vis = [me.loops[i].vertex_index for i in li]; cos = [me.vertices[vi].co for vi in vis]; rings = [vi // n for vi in vis]
        seg = sum(1 for ci in cut_idx if min(rings) >= ci)
        du = seg * u_step; dv = vv[cut_idx[seg - 1]] if seg > 0 else 0.0
        if len(li) > 4 and (rings[0] == 0 or rings[0] == nr - 1) and len(set(rings)) == 1:
            r0 = rings[0]
            for i, c in zip(li, cos): uvd[i].uv = (c.x - cx[r0] + du, c.z - cz[r0])
            continue
        ang = [math.atan2(c.x - cx[ri], c.z - cz[ri]) for c, ri in zip(cos, rings)]
        a0 = ang[0]; ang = [a if abs(a - a0) <= math.pi else a + (2 * math.pi if a0 - a > 0 else -2 * math.pi) for a in ang]
        for i, a, ri in zip(li, ang, rings): uvd[i].uv = (a * max(rr[ri], 0.03) + du, vv[ri] - dv)


body = next(o for o in objs if o.name == 'KNZ_body')
for o in vl.objects: o.select_set(False)
for o in objs:
    while len(o.data.uv_layers) > 0: o.data.uv_layers.remove(o.data.uv_layers[0])
    o.data.uv_layers.new(name='UVMap')
ring_uv(body)
others = [o for o in objs if o is not body]
for o in others: o.select_set(True)
vl.objects.active = others[0]
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.object.mode_set(mode='OBJECT')
for o in vl.objects: o.select_set(False)
for o in objs: o.select_set(True)
vl.objects.active = objs[0]
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
try: bpy.ops.uv.average_islands_scale()
except Exception as e: print('average_islands_scale:', e)
try: bpy.ops.uv.pack_islands(rotate=False, margin=16.0 / SIZE, margin_method='ADD')
except TypeError:
    try: bpy.ops.uv.pack_islands(rotate=False, margin=16.0 / SIZE)
    except TypeError: bpy.ops.uv.pack_islands(margin=16.0 / SIZE)
bpy.ops.object.mode_set(mode='OBJECT')
K_UV = 1.0 - 2 * 12.0 / SIZE
for o in objs:
    for l_ in o.data.uv_layers.active.data: l_.uv = (0.5 + (l_.uv.x - 0.5) * K_UV, 0.5 + (l_.uv.y - 0.5) * K_UV)
log('развёртка готова, объектов', len(objs), '(плоских', len(all_objs) - len(objs), ')')

# 2. картинки и шейдер запекания в каждом материале
old = bpy.data.images.get('KNZ_detail')
if old is not None: bpy.data.images.remove(old)
path = os.path.join(OUT, 'kinzhal_detail.png')
REUSE = os.environ.get('KNZ_REUSE') == '1' and os.path.exists(path)
if REUSE:
    img = bpy.data.images.load(path, check_existing=False); img.name = 'KNZ_detail'; img.pack()
else:
    img = bpy.data.images.new('KNZ_detail', SIZE, SIZE, alpha=False)
    img.generated_color = (1, 1, 1, 1)
mats = [m for m in bpy.data.materials if m.name in ('KNZ_body', 'KNZ_fin', 'KNZ_dark', 'KNZ_steel')]
opath = os.path.join(OUT, 'kinzhal_orm.png')
oold = bpy.data.images.get('KNZ_orm')
if oold is not None: bpy.data.images.remove(oold)
REUSE_ORM = REUSE and os.path.exists(opath)
if REUSE_ORM:
    oimg = bpy.data.images.load(opath, check_existing=False); oimg.name = 'KNZ_orm'; oimg.pack()
else:
    oimg = bpy.data.images.new('KNZ_orm', SIZE, SIZE, alpha=False); oimg.generated_color = (1.0, 0.7, 0.0, 1.0)
oimg.colorspace_settings.name = 'Non-Color'
ORM_RIG = {}

# щели на нижнем боку (фото 2: у стыка конуса и на 0,25 длины; рендер: «двойки» у носа): (x от хвоста, азимут°, длина по дуге, ширина вдоль оси) — м
SLOTS = [(3.80, 255.0, 0.30, 0.045), (1.76, 258.0, 0.34, 0.040), (3.15, 262.0, 0.10, 0.014),
         (5.62, 232.0, 0.22, 0.012), (5.69, 232.0, 0.22, 0.012), (6.04, 232.0, 0.17, 0.012), (6.12, 228.0, 0.20, 0.012), (6.18, 228.0, 0.20, 0.012)]


def slot_masks(nodes, links, obj_vec):
    """Маска щелей и кромки вокруг них: сумма скруглённых прямоугольников; координаты — по оси от хвоста и по дуге вокруг оси (азимут 0° = +X, 90° = +Z). Возвращает (щель, кромка) — сокеты 0…1."""
    def m_(op, a, b=None, clamp=False):
        n = nodes.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: links.new(v, n.inputs[i])
        return n.outputs['Value']
    sep = nodes.new('ShaderNodeSeparateXYZ'); links.new(obj_vec, sep.inputs['Vector'])
    th = m_('ARCTAN2', sep.outputs['Z'], sep.outputs['X'])
    rho = m_('POWER', m_('ADD', m_('MULTIPLY', sep.outputs['X'], sep.outputs['X']), m_('MULTIPLY', sep.outputs['Z'], sep.outputs['Z'])), 0.5)
    xt = m_('ADD', sep.outputs['Y'], HALF)
    core = None; rim = None
    for xs, az, ln, w in SLOTS:
        d = m_('SUBTRACT', th, math.radians(az))
        dw = m_('ARCTAN2', m_('SINE', d), m_('COSINE', d))
        arc = m_('MULTIPLY', m_('ABSOLUTE', dw), rho)
        dx = m_('ABSOLUTE', m_('SUBTRACT', xt, xs))
        def box(hw_, hl_):
            a = m_('MULTIPLY', m_('SUBTRACT', hw_, dx), 1.0 / 0.0025, clamp=True)
            b = m_('MULTIPLY', m_('SUBTRACT', hl_, arc), 1.0 / 0.0025, clamp=True)
            return m_('MULTIPLY', a, b)
        c_ = box(w / 2, ln / 2); r_ = box(w / 2 + 0.006, ln / 2 + 0.006)
        core = c_ if core is None else m_('ADD', core, c_, clamp=True)
        rim = r_ if rim is None else m_('ADD', rim, r_, clamp=True)
    return core, rim


def build_pattern(mat):
    """Шейдер запекания: цвет материала, щели, тон кончика и копоть у хвоста, разводы вдоль полёта, потёртости, на кромках — лёгкий износ, затенение щелей, зерно. Вывод — через Emission (запекается типом EMIT)."""
    nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for n in list(nodes):
        if n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): nodes.remove(n)
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL'); prin = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    col = tuple(prin.inputs['Base Color'].default_value)
    for l in list(prin.inputs['Base Color'].links): links.remove(l)
    N = lambda t: nodes.new(t)
    kind = mat.name
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
    ao0 = N('ShaderNodeAmbientOcclusion'); ao0.samples = 16; ao0.inputs['Distance'].default_value = 0.02
    ao1 = N('ShaderNodeAmbientOcclusion'); ao1.samples = 12; ao1.inputs['Distance'].default_value = 0.25
    a0 = maprange(ao0.outputs['AO'], 0, 1, 0.55, 1.0); a1 = maprange(ao1.outputs['AO'], 0, 1, 0.80, 1.0)
    sep = N('ShaderNodeSeparateXYZ'); links.new(tc.outputs['Object'], sep.inputs['Vector'])
    geo = N('ShaderNodeNewGeometry'); gsep = N('ShaderNodeSeparateXYZ'); links.new(geo.outputs['Normal'], gsep.inputs['Vector'])
    xt = math_('ADD', sep.outputs['Y'], HALF)                                                    # расстояние от хвоста, м
    def noise(scale, detail, rough, lo, hi, vec=None):
        n = N('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(vec if vec is not None else tc.outputs['Object'], n.inputs['Vector']); return maprange(n.outputs['Fac'], lo, hi, 0.0, 1.0)
    def stretched(sx, sy, sz, scale, detail, rough, lo, hi):
        mp = N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (sx, sy, sz); links.new(tc.outputs['Object'], mp.inputs['Vector'])
        return noise(scale, detail, rough, lo, hi, mp.outputs['Vector'])
    gm = N('ShaderNodeMapping'); gm.inputs['Scale'].default_value = (260.0, 260.0, 260.0); links.new(tc.outputs['Object'], gm.inputs['Vector'])
    wn = N('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; links.new(gm.outputs['Vector'], wn.inputs['Vector'])
    grain = math_('ADD', 1.0, math_('MULTIPLY', math_('SUBTRACT', wn.outputs['Value'], 0.5), 0.06))
    bev = N('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.004; bev.samples = 6
    dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; links.new(bev.outputs['Normal'], dot.inputs[0]); links.new(geo.outputs['Normal'], dot.inputs[1])
    edge = maprange(dot.outputs['Value'], 1.0, 0.93, 0.0, 1.0)
    bev2 = N('ShaderNodeBevel'); bev2.inputs['Radius'].default_value = 0.014; bev2.samples = 6
    dot2 = N('ShaderNodeVectorMath'); dot2.operation = 'DOT_PRODUCT'; links.new(bev2.outputs['Normal'], dot2.inputs[0]); links.new(geo.outputs['Normal'], dot2.inputs[1])
    zone = maprange(dot2.outputs['Value'], 1.0, 0.90, 0.0, 1.0)
    patchy = noise(1.6, 6.0, 0.6, 0.35, 0.68)
    chip = math_('MULTIPLY', zone, noise(34.0, 5.0, 0.7, 0.50, 0.56))
    scuff = math_('MULTIPLY', noise(5.0, 6.0, 0.62, 0.60, 0.74), math_('ADD', 0.5, math_('MULTIPLY', patchy, 0.5)))
    streak = stretched(30.0, 0.7, 30.0, 1.0, 3.0, 0.7, 0.42, 0.68)                               # продольные разводы вдоль полёта
    fade = noise(0.35, 3.0, 0.5, 0.32, 0.68)
    soot = maprange(xt, 1.10, 0.0, 0.0, 1.0)                                                      # у хвоста — налёт от газов
    tip = maprange(xt, LEN - 0.60, LEN - 0.02, 0.0, 1.0)                                          # кончик — тёплый серый (нагрев)
    low = maprange(gsep.outputs['Z'], 0.1, -0.9, 0.0, 1.0)                                        # нижние поверхности грязнее
    top = maprange(gsep.outputs['Z'], 0.2, 0.95, 0.0, 1.0)
    METAL, DIRT, WARM = (0.30, 0.30, 0.31), (0.20, 0.18, 0.15), (0.40, 0.37, 0.32)
    c = rgb(col)
    slot_core = slot_rim = None
    if kind == 'KNZ_body':
        slot_core, slot_rim = slot_masks(nodes, links, tc.outputs['Object'])
        cone = maprange(xt, X_CONE - 0.03, X_CONE + 0.03, 0.0, 1.0)                               # конус на полтона серее цилиндра
        c = mixc(c, gray(0.955), cone, 'MULTIPLY')
        c = mixc(c, rgb(WARM), math_('MULTIPLY', tip, 0.30))
        c = mixc(c, rgb((0.015, 0.015, 0.017)), slot_core)                                        # щели — тёмные
        c = mixc(c, rgb((0.50, 0.50, 0.48)), math_('MULTIPLY', math_('SUBTRACT', slot_rim, slot_core, clamp=True), 0.35))     # тонкий светлый ободок
    c = mixc(c, rgb(DIRT), math_('MULTIPLY', math_('MULTIPLY', soot, math_('ADD', 0.45, math_('MULTIPLY', patchy, 0.55))), 0.34))
    c = mixc(c, rgb(DIRT), math_('MULTIPLY', math_('MULTIPLY', low, streak), 0.05))
    c = mixc(c, rgb(DIRT), math_('MULTIPLY', math_('MULTIPLY', top, streak), 0.04))
    c = mixc(c, gray(math_('SUBTRACT', 1.0, math_('MULTIPLY', streak, 0.02))), 1.0, 'MULTIPLY')
    c = mixc(c, gray(math_('SUBTRACT', 1.0, math_('MULTIPLY', noise(1.4, 4.0, 0.6, 0.55, 0.62), 0.06))), 1.0, 'MULTIPLY')
    light = mixc(rgb(col), gray(1.25), 1.0, 'MULTIPLY')
    c = mixc(c, light, math_('MULTIPLY', scuff, 0.14))
    wearmask = math_('ADD', math_('MULTIPLY', edge, 0.55), chip, clamp=True)
    wear_k = {'KNZ_fin': 0.22, 'KNZ_steel': 0.20, 'KNZ_dark': 0.10}.get(kind, 0.14)
    c = mixc(c, rgb(METAL), math_('MULTIPLY', wearmask, wear_k))
    c = mixc(c, rgb((0.05, 0.045, 0.04)), math_('MULTIPLY', math_('SUBTRACT', 1.0, a0), 0.50))      # копоть и грязь в узких щелях
    c = mixc(c, gray(math_('MULTIPLY', a0, a1)), 1.0, 'MULTIPLY')
    c = mixc(c, gray(math_('ADD', 0.96, math_('MULTIPLY', fade, 0.04))), 1.0, 'MULTIPLY')
    c = mixc(c, gray(grain), 1.0, 'MULTIPLY')
    # шероховатость и металличность (ORM)
    def lerp(a, b, t): return math_('ADD', math_('MULTIPLY', a, math_('SUBTRACT', 1.0, t)), math_('MULTIPLY', b, t))
    b_r, b_m = {'KNZ_body': (0.52, 0.0), 'KNZ_fin': (0.56, 0.0), 'KNZ_dark': (0.90, 0.0), 'KNZ_steel': (0.38, 0.85)}.get(kind, (0.6, 0.0))
    dust_a = math_('ADD', math_('MULTIPLY', soot, 0.30), math_('MULTIPLY', math_('MULTIPLY', low, streak), 0.10), clamp=True)
    wear_a = math_('MULTIPLY', wearmask, 0.7 if kind in ('KNZ_fin', 'KNZ_steel') else 0.3)
    b_rn = math_('ADD', b_r, math_('MULTIPLY', math_('SUBTRACT', noise(10.0, 3.0, 0.5, 0.35, 0.65), 0.5), 0.12))
    rg = lerp(lerp(b_rn, 0.92, dust_a), 0.82, math_('MULTIPLY', scuff, 0.25))
    rg = lerp(rg, 0.40, wear_a)
    if slot_core is not None: rg = lerp(rg, 0.92, slot_core)
    mt = lerp(lerp(b_m, 0.0, dust_a), 0.80, wear_a)
    orm = N('ShaderNodeCombineColor'); orm.inputs[0].default_value = 1.0; links.new(rg, orm.inputs[1]); links.new(mt, orm.inputs[2])
    emi = N('ShaderNodeEmission'); links.new(c, emi.inputs['Color'])
    links.new(emi.outputs['Emission'], out.inputs['Surface'])
    tex = N('ShaderNodeTexImage'); tex.image = img
    otex = N('ShaderNodeTexImage'); otex.image = oimg; ORM_RIG[kind] = (emi, orm.outputs['Color'], otex)
    for n in nodes: n.select = False
    tex.select = True; nodes.active = tex
    return out, prin, tex, col


rig = {m.name: build_pattern(m) for m in mats}
log('шейдеры запекания готовы')

# 3. запекание (Cycles)
sys.path.insert(0, '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/_инструменты')
import gpu_setup
sc.render.engine = 'CYCLES'; log('Cycles:', gpu_setup.use_gpu(sc)); sc.cycles.samples = 24
if os.environ.get('KNZ_COLOR_TEST'):
    import modelkit as mk
    from mathutils import Vector
    sc.cycles.samples = 12
    try: sc.cycles.use_denoising = False
    except Exception: pass
    sc.render.film_transparent = False; sc.render.image_settings.color_mode = 'RGB'
    try: sc.view_settings.view_transform = 'Standard'
    except Exception: pass
    cam = mk._camera(); cam.data.type = 'PERSP'; cam.data.lens = 50; cam.data.clip_start, cam.data.clip_end = 0.02, 200
    for nm_, tgt, d, dist in (('1', Vector((0, 0.0, 0)), (0.30, -0.9, -0.40), 12.5), ('2', Vector((0, -1.6, -0.1)), (0.9, -0.3, -0.55), 4.2), ('3', Vector((0, 2.0, -0.2)), (0.7, 0.2, -0.65), 5.0), ('4', Vector((0, 0.1, 0)), (1.0, 0.05, -0.30), 9.0)):
        dv = Vector(d).normalized(); cam.location = tgt + dv * dist; cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
        mk._render(os.path.join(os.environ['KNZ_COLOR_TEST'], f'color_{nm_}.png'), 1280, 720)
    raise SystemExit(0)
try: sc.cycles.use_denoising = False
except Exception: pass
for o in vl.objects: o.select_set(False)
for o in objs: o.select_set(True)
vl.objects.active = objs[0]
if not REUSE:
    bpy.ops.object.bake(type='EMIT', width=SIZE, height=SIZE, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
    log('запекание готово')
else: log('цвет взят из прошлого запуска (KNZ_REUSE=1)')

# 4. сохранить картинку цвета
if not REUSE:
    img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    img.pack()
log('цвет сохранён', path)

# 4б. шероховатость и металличность: тот же рисунок, но в Emission идёт карта ORM
if not REUSE_ORM:
    for m in mats:
        emi_, orm_col, otex_ = ORM_RIG[m.name]; nt_ = m.node_tree
        nt_.links.new(orm_col, emi_.inputs['Color'])
        for n in nt_.nodes: n.select = False
        otex_.select = True; nt_.nodes.active = otex_
    bpy.ops.object.bake(type='EMIT', width=SIZE, height=SIZE, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
    oimg.filepath_raw = opath; oimg.file_format = 'PNG'; oimg.save(); oimg.pack()
    log('ORM запечён', opath)


# 5. карта нормалей: рельеф — в Normal принципиального шейдера (Bevel → Bump), запекание NORMAL в касательном пространстве
def build_relief(mat, entry):
    """Bevel скругляет все рёбра (блик на кромках без лишних треугольников), Bump даёт мелкую «корку» краски и щели глубиной ≈ 1,6 мм; на всём — едва заметная волна."""
    out, prin, tex, col = entry; nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for l in list(out.inputs['Surface'].links): links.remove(l)
    links.new(prin.outputs['BSDF'], out.inputs['Surface'])
    kind = mat.name
    k_fine, k_wave, bev_r = {'KNZ_body': (0.6, 0.15, 0.003), 'KNZ_fin': (0.5, 0.0, 0.003), 'KNZ_dark': (0.4, 0.0, 0.003), 'KNZ_steel': (0.3, 0.0, 0.002)}.get(kind, (0.5, 0.0, 0.003))
    tc = nodes.new('ShaderNodeTexCoord')
    bev = nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = bev_r; bev.samples = 16
    def noise(scale, detail, rough):
        n = nodes.new('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(tc.outputs['Object'], n.inputs['Vector']); return n.outputs['Fac']
    def mul(a, k):
        n = nodes.new('ShaderNodeMath'); n.operation = 'MULTIPLY'; links.new(a, n.inputs[0]); n.inputs[1].default_value = k; return n.outputs['Value']
    def add(a, b):
        n = nodes.new('ShaderNodeMath'); n.operation = 'ADD'; links.new(a, n.inputs[0]); links.new(b, n.inputs[1]); return n.outputs['Value']
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.002; bump.inputs['Strength'].default_value = 1.0
    h = mul(noise(160.0, 3.0, 0.55), 0.25 * k_fine)                                               # «корка» краски
    if k_wave > 0: h = add(h, mul(noise(2.5, 2.0, 0.5), 0.9 * k_wave))
    if kind == 'KNZ_body':
        core, rim = slot_masks(nodes, links, tc.outputs['Object'])
        h = add(h, mul(core, -0.8))                                                               # щели ≈ 1,6 мм вглубь
    links.new(h, bump.inputs['Height'])
    links.new(bev.outputs['Normal'], bump.inputs['Normal'])
    links.new(bump.outputs['Normal'], prin.inputs['Normal'])


nimg = bpy.data.images.get('KNZ_normal')
if nimg is not None: bpy.data.images.remove(nimg)
nimg = bpy.data.images.new('KNZ_normal', NSIZE, NSIZE, alpha=False)
nimg.generated_color = (0.5, 0.5, 1.0, 1.0); nimg.colorspace_settings.name = 'Non-Color'
ntex_of = {}
for m in mats:
    build_relief(m, rig[m.name])
    nt = m.node_tree; nt.nodes.new('ShaderNodeTexImage')
    ntx = nt.nodes[-1]; ntx.image = nimg; ntex_of[m.name] = ntx
    for n in nt.nodes: n.select = False
    ntx.select = True; nt.nodes.active = ntx
sc.cycles.samples = 40
bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', width=NSIZE, height=NSIZE, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
log('нормали запечены')
npath = os.path.join(OUT, 'kinzhal_normal.png')
nimg.filepath_raw = npath; nimg.file_format = 'PNG'; nimg.save()
nimg.pack()

# 6. материалы: Base Color = текстура цвета, Normal = карта нормалей, Roughness/Metallic = ORM; служебные узлы убрать
for m in mats:
    out, prin, tex, col = rig[m.name]; nt = m.node_tree; ntx = ntex_of[m.name]
    for l in list(prin.inputs['Normal'].links): nt.links.remove(l)
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.space = 'TANGENT'; nm.uv_map = 'UVMap'; nm.inputs['Strength'].default_value = 1.0
    otex = ORM_RIG[m.name][2]; so = nt.nodes.new('ShaderNodeSeparateColor')
    keep = {out, prin, tex, ntx, nm, otex, so}
    for n in list(nt.nodes):
        if n not in keep: nt.nodes.remove(n)
    nt.links.new(tex.outputs['Color'], prin.inputs['Base Color'])
    nt.links.new(ntx.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], prin.inputs['Normal'])
    nt.links.new(otex.outputs['Color'], so.inputs['Color']); nt.links.new(so.outputs['Green'], prin.inputs['Roughness']); nt.links.new(so.outputs['Blue'], prin.inputs['Metallic'])
    otex.location = (-500, -450); so.location = (-250, -450)
    tex.location = (-500, 100); ntx.location = (-700, -200); nm.location = (-300, -200)
log('картинки', path, opath, npath, 'материалы подключены:', [m.name for m in mats])


# 7. облегчённые копии для игры и репозитория: цвет — JPEG, нормали — PNG без потерь (SIZE остаётся для Sketchfab и .blend)
def lite(image, name, fmt, fname, px):
    c = image.copy(); c.name = name; c.scale(px, px); c.file_format = fmt
    p_ = os.path.join(OUT, fname)
    try: c.save(filepath=p_, quality=92)
    except TypeError:
        c.filepath_raw = p_; c.save()
    bpy.data.images.remove(c)
    return p_


lite(img, f'KNZ_detail_{GAME_TEX}', 'JPEG', f'kinzhal_detail_{GAME_TEX}.jpg', GAME_TEX); lite(nimg, f'KNZ_normal_{GAME_NTEX}', 'PNG', f'kinzhal_normal_{GAME_NTEX}.png', GAME_NTEX)
log('облегчённые копии', GAME_TEX, '/', GAME_NTEX, 'готовы')
