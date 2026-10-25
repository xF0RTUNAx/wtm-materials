# bake.py — запекает текстуры ракеты PrSM: цвет (prsm_detail.png: серый металл корпуса с продольной «шлифовкой», тёмный нос с жёлтой лентой, тёмный конус на кончике, два трафарета, тонкая прорезь сверху,
# лёгкий налёт у торца, износ кромок рулей, затенение щелей) и карту нормалей (prsm_normal.png: скруглённые рёбра, мелкая «корка» краски, прорезь сверху и канавки лент): рельеф без лишних треугольников. Третья карта
# prsm_orm.png (R = 1, G = шероховатость, B = металличность) — только для Sketchfab и .blend: игра берёт постоянные значения. Нужен Cycles (на видеокарте — gpu_setup). Запускается ПОСЛЕ build.py в той же сессии:
#   PSM_OUT="<папка модели>" [PSM_TEX=4096] [PSM_NTEX=4096] [PSM_REUSE=1] Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Развёртка: корпус — три полосы вокруг оси (ring_uv) с разрезами по швам на 0,95 и 4,30 диаметра (шов прячется в канавке), рули — смарт-проекция; общий атлас, зазор 16 px при полосе растяжки 8 px. Мелочь (заклёпки, винты, рёбра рулей)
# — плоский объект без развёртки. Ленты, трафареты и прорезь привязаны к координатам модели (от торца), поэтому ложатся одинаково при любом размере атласа.
# PSM_COLOR_TEST=<папка>: быстрый просмотр рисунка краски прямо на модели (Emission как есть, без запекания), четыре ракурса, затем выход.
import os, sys, math, time
sys.dont_write_bytecode = True
import bpy

OUT = os.environ.get('PSM_OUT')
if not OUT: raise SystemExit('Задай PSM_OUT=<папка модели>')
SIZE = int(os.environ.get('PSM_TEX', '2048'))
NSIZE = int(os.environ.get('PSM_NTEX', str(SIZE)))
GAME_TEX, GAME_NTEX = int(os.environ.get('PSM_GAME_TEX', '512')), int(os.environ.get('PSM_GAME_NTEX', '512'))
T0 = time.time()
sc = bpy.data.scenes['PRSM']
if bpy.context.window: bpy.context.window.scene = sc
all_objs = [o for o in sc.objects if o.type == 'MESH']
_ys = [v.co.y for v in next(o for o in all_objs if o.name == 'PSM_body').data.vertices]
LEN = max(_ys) - min(_ys); HALF = LEN / 2.0
# те же числа, что в build.py (D — диаметр; всё от торца, м)
Dm = 0.504; Rm = Dm / 2.0; Lm = 8.4 * Dm
dd = lambda v: v * Dm
X_OGV = Lm - dd(3.25); X_TIP = Lm - dd(0.80); YEL = Lm - dd(2.50); SEAMS = (dd(0.95), dd(4.30), X_OGV); RING = (dd(3.55), dd(3.84))
FLAT_OBJS = ('PSM_hw',)
FLAT_RGB = {'PSM_steel': (0.30, 0.30, 0.31)}
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
CUT_X = (SEAMS[0], SEAMS[1])


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
        k = min(range(nr), key=lambda i: abs(cy[i] + HALF - xcut))                       # кольцо в середине канавки шва
        if abs(cy[k] + HALF - xcut) > 0.002: print('ring_uv: нет кольца у шва', xcut)
        cut_idx.append(k)
    cut_idx.sort()
    u_step = 2 * math.pi * max(rr) + 0.10
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


body = next(o for o in objs if o.name == 'PSM_body')
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
old = bpy.data.images.get('PSM_detail')
if old is not None: bpy.data.images.remove(old)
path = os.path.join(OUT, 'prsm_detail.png')
REUSE = os.environ.get('PSM_REUSE') == '1' and os.path.exists(path)
if REUSE:
    img = bpy.data.images.load(path, check_existing=False); img.name = 'PSM_detail'; img.pack()
else:
    img = bpy.data.images.new('PSM_detail', SIZE, SIZE, alpha=False)
    img.generated_color = (1, 1, 1, 1)
mats = [m for m in bpy.data.materials if m.name in ('PSM_body', 'PSM_fin', 'PSM_dark', 'PSM_steel')]
opath = os.path.join(OUT, 'prsm_orm.png')
oold = bpy.data.images.get('PSM_orm')
if oold is not None: bpy.data.images.remove(oold)
REUSE_ORM = REUSE and os.path.exists(opath)
if REUSE_ORM:
    oimg = bpy.data.images.load(opath, check_existing=False); oimg.name = 'PSM_orm'; oimg.pack()
else:
    oimg = bpy.data.images.new('PSM_orm', SIZE, SIZE, alpha=False); oimg.generated_color = (1.0, 0.7, 0.0, 1.0)
oimg.colorspace_settings.name = 'Non-Color'
ORM_RIG = {}

# трафареты: (файл, центр по оси от торца, м; азимут центра на стороне +X, °; ширина по оси и высота по дуге, м)
STENCILS = (('трафарет_A.png', dd(3.00), 10.0, 0.27, 0.148), ('трафарет_B.png', Lm - dd(2.95), 5.0, 0.24, 0.103))
timgs = []
for fn, xs_, az_, w_, h_ in STENCILS:
    tp_ = os.path.join(OUT, '_текст', fn)
    if os.path.exists(tp_):
        ti_ = bpy.data.images.load(tp_, check_existing=False); ti_.name = 'PSM_' + fn[:-4]; ti_.colorspace_settings.name = 'sRGB'; ti_.alpha_mode = 'STRAIGHT'
        timgs.append((ti_, xs_, az_, w_, h_))
    else: print('НЕТ трафарета', tp_, '— запустить _текст/make_text.py')

TOP_SLOT = (dd(1.10), dd(5.00), 0.0065)               # прорезь сверху: от какого до какого x, ширина (м)


def top_slot_mask(nodes, links, obj_vec):
    """Тонкая продольная прорезь сверху (азимут 90°): маска 0…1 — |X| < ширина / 2, Z > 0, x между концами с мягкими краями."""
    def m_(op, a, b=None, clamp=False):
        n = nodes.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: links.new(v, n.inputs[i])
        return n.outputs['Value']
    def mr(src, f0, f1, t0, t1):
        n = nodes.new('ShaderNodeMapRange'); n.clamp = True
        n.inputs['From Min'].default_value = f0; n.inputs['From Max'].default_value = f1; n.inputs['To Min'].default_value = t0; n.inputs['To Max'].default_value = t1
        links.new(src, n.inputs['Value']); return n.outputs['Result']
    sep = nodes.new('ShaderNodeSeparateXYZ'); links.new(obj_vec, sep.inputs['Vector'])
    xt = m_('ADD', sep.outputs['Y'], HALF)
    wd = mr(m_('ABSOLUTE', sep.outputs['X']), TOP_SLOT[2] / 2 + 0.0007, TOP_SLOT[2] / 2 - 0.0007, 0.0, 1.0)
    up = mr(sep.outputs['Z'], 0.05, 0.12, 0.0, 1.0)
    a = mr(xt, TOP_SLOT[0] - 0.006, TOP_SLOT[0] + 0.006, 0.0, 1.0); b = mr(xt, TOP_SLOT[1] + 0.006, TOP_SLOT[1] - 0.006, 0.0, 1.0)
    return m_('MULTIPLY', m_('MULTIPLY', wd, up), m_('MULTIPLY', a, b))


def build_pattern(mat):
    """Шейдер запекания: цвет материала, тёмный нос с жёлтой лентой и конусом, трафареты, прорезь, налёт у торца, продольные «шлифовочные» разводы, износ кромок, затенение щелей, зерно. Вывод — Emission (запекается типом EMIT)."""
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
    ao0 = N('ShaderNodeAmbientOcclusion'); ao0.samples = 16; ao0.inputs['Distance'].default_value = 0.015
    ao1 = N('ShaderNodeAmbientOcclusion'); ao1.samples = 12; ao1.inputs['Distance'].default_value = 0.12
    a0 = maprange(ao0.outputs['AO'], 0, 1, 0.55, 1.0); a1 = maprange(ao1.outputs['AO'], 0, 1, 0.82, 1.0)
    sep = N('ShaderNodeSeparateXYZ'); links.new(tc.outputs['Object'], sep.inputs['Vector'])
    geo = N('ShaderNodeNewGeometry'); gsep = N('ShaderNodeSeparateXYZ'); links.new(geo.outputs['Normal'], gsep.inputs['Vector'])
    xt = math_('ADD', sep.outputs['Y'], HALF)                                                    # расстояние от торца, м
    def noise(scale, detail, rough, lo, hi, vec=None):
        n = N('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(vec if vec is not None else tc.outputs['Object'], n.inputs['Vector']); return maprange(n.outputs['Fac'], lo, hi, 0.0, 1.0)
    def stretched(sx, sy, sz, scale, detail, rough, lo, hi):
        mp = N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (sx, sy, sz); links.new(tc.outputs['Object'], mp.inputs['Vector'])
        return noise(scale, detail, rough, lo, hi, mp.outputs['Vector'])
    gm = N('ShaderNodeMapping'); gm.inputs['Scale'].default_value = (300.0, 300.0, 300.0); links.new(tc.outputs['Object'], gm.inputs['Vector'])
    wn = N('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; links.new(gm.outputs['Vector'], wn.inputs['Vector'])
    grain = math_('ADD', 1.0, math_('MULTIPLY', math_('SUBTRACT', wn.outputs['Value'], 0.5), 0.05))
    bev = N('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.003; bev.samples = 6
    dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; links.new(bev.outputs['Normal'], dot.inputs[0]); links.new(geo.outputs['Normal'], dot.inputs[1])
    edge = maprange(dot.outputs['Value'], 1.0, 0.93, 0.0, 1.0)
    bev2 = N('ShaderNodeBevel'); bev2.inputs['Radius'].default_value = 0.012; bev2.samples = 6
    dot2 = N('ShaderNodeVectorMath'); dot2.operation = 'DOT_PRODUCT'; links.new(bev2.outputs['Normal'], dot2.inputs[0]); links.new(geo.outputs['Normal'], dot2.inputs[1])
    zone = maprange(dot2.outputs['Value'], 1.0, 0.90, 0.0, 1.0)
    patchy = noise(2.0, 6.0, 0.6, 0.35, 0.68)
    chip = math_('MULTIPLY', zone, noise(40.0, 5.0, 0.7, 0.50, 0.56))
    scuff = math_('MULTIPLY', noise(6.0, 6.0, 0.62, 0.60, 0.74), math_('ADD', 0.5, math_('MULTIPLY', patchy, 0.5)))
    brush = stretched(60.0, 0.5, 60.0, 1.0, 4.0, 0.7, 0.30, 0.70)                                # продольная «шлифовка» металла (вытянуто вдоль оси)
    fade = noise(0.5, 3.0, 0.5, 0.32, 0.68)
    soot = maprange(xt, 1.2, 0.0, 0.0, 1.0)                                                       # у торца — налёт от газов
    METAL, DIRT = (0.42, 0.42, 0.43), (0.05, 0.045, 0.04)
    YELLOW, NOSE_DK, TIP_COL = (0.38, 0.32, 0.06), (0.030, 0.031, 0.035), (0.075, 0.078, 0.085)
    c = rgb(col)
    slot = None
    if kind == 'PSM_body':
        # оттенки секций между швами (листы чуть разного тона): аккуратно, ±3 %
        sec = math_('ADD', math_('ADD', maprange(xt, SEAMS[0] - 0.003, SEAMS[0] + 0.003, 0.0, 1.0), math_('MULTIPLY', maprange(xt, SEAMS[1] - 0.003, SEAMS[1] + 0.003, 0.0, 1.0), -0.5)),
                    math_('MULTIPLY', maprange(xt, SEAMS[2] - 0.003, SEAMS[2] + 0.003, 0.0, 1.0), -0.4))
        c = mixc(c, gray(math_('ADD', 0.98, math_('MULTIPLY', sec, 0.045))), 1.0, 'MULTIPLY')
        nose = maprange(xt, YEL + 0.052, YEL + 0.056, 0.0, 1.0)                                    # тёмный нос — от жёлтой ленты к кончику (фото старта)
        c = mixc(c, rgb(NOSE_DK), nose)
        tip = maprange(xt, X_TIP + 0.004, X_TIP + 0.008, 0.0, 1.0)                                 # конус на кончике — чуть светлее и более металлический
        c = mixc(c, rgb(TIP_COL), tip)
        band = maprange(math_('ABSOLUTE', math_('SUBTRACT', xt, YEL)), 0.054, 0.050, 0.0, 1.0)     # жёлтая лента 0,1 м
        c = mixc(c, rgb(YELLOW), band)
        # трафареты: плоская проекция вдоль X на сторону +X
        side = maprange(gsep.outputs['X'], 0.45, 0.80, 0.0, 1.0)
        for ti_, xs_, az_, w_, h_ in timgs:
            zc = Rm * math.sin(math.radians(az_))
            u = math_('ADD', math_('DIVIDE', math_('SUBTRACT', xt, xs_), w_), 0.5)
            v = math_('ADD', math_('DIVIDE', math_('SUBTRACT', sep.outputs['Z'], zc), h_), 0.5)
            cv = N('ShaderNodeCombineXYZ'); links.new(u, cv.inputs[0]); links.new(v, cv.inputs[1])
            tx = N('ShaderNodeTexImage'); tx.image = ti_; tx.extension = 'CLIP'; tx.interpolation = 'Linear'; links.new(cv.outputs['Vector'], tx.inputs['Vector'])
            c = mixc(c, rgb((0.010, 0.010, 0.012)), math_('MULTIPLY', tx.outputs['Alpha'], math_('MULTIPLY', side, math_('SUBTRACT', 1.0, nose))))
        slot = top_slot_mask(nodes, links, tc.outputs['Object'])
        c = mixc(c, rgb((0.012, 0.012, 0.014)), math_('MULTIPLY', slot, 0.85))
    # лёгкий налёт и износ: сажа у торца, продольные разводы, потёртости, на кромках — светлый металл
    c = mixc(c, rgb(DIRT), math_('MULTIPLY', math_('MULTIPLY', soot, math_('ADD', 0.4, math_('MULTIPLY', patchy, 0.6))), 0.26))
    c = mixc(c, gray(math_('SUBTRACT', 1.0, math_('MULTIPLY', brush, 0.10))), 1.0, 'MULTIPLY')
    c = mixc(c, gray(math_('SUBTRACT', 1.0, math_('MULTIPLY', noise(1.6, 4.0, 0.6, 0.55, 0.62), 0.05))), 1.0, 'MULTIPLY')
    light = mixc(rgb(col), gray(1.25), 1.0, 'MULTIPLY')
    c = mixc(c, light, math_('MULTIPLY', scuff, 0.12))
    wearmask = math_('ADD', math_('MULTIPLY', edge, 0.55), chip, clamp=True)
    wear_k = {'PSM_fin': 0.30, 'PSM_steel': 0.14, 'PSM_dark': 0.08}.get(kind, 0.12)
    c = mixc(c, rgb(METAL), math_('MULTIPLY', wearmask, wear_k))
    c = mixc(c, rgb((0.015, 0.014, 0.013)), math_('MULTIPLY', math_('SUBTRACT', 1.0, a0), 0.50))      # копоть в узких щелях
    c = mixc(c, gray(math_('MULTIPLY', a0, a1)), 1.0, 'MULTIPLY')
    c = mixc(c, gray(math_('ADD', 0.97, math_('MULTIPLY', fade, 0.03))), 1.0, 'MULTIPLY')
    c = mixc(c, gray(grain), 1.0, 'MULTIPLY')
    # шероховатость и металличность (ORM): металл с шлифовкой, нос и лента — другая, кромки — светлее
    def lerp(a, b, t): return math_('ADD', math_('MULTIPLY', a, math_('SUBTRACT', 1.0, t)), math_('MULTIPLY', b, t))
    b_r, b_m = {'PSM_body': (0.38, 0.78), 'PSM_fin': (0.42, 0.72), 'PSM_dark': (0.90, 0.0), 'PSM_steel': (0.28, 0.92)}.get(kind, (0.5, 0.5))
    dust_a = math_('MULTIPLY', soot, 0.30)
    wear_a = math_('MULTIPLY', wearmask, 0.7 if kind in ('PSM_fin', 'PSM_steel') else 0.3)
    b_rn = math_('ADD', b_r, math_('MULTIPLY', math_('SUBTRACT', brush, 0.5), 0.14))
    rg = lerp(lerp(b_rn, 0.88, dust_a), 0.80, math_('MULTIPLY', scuff, 0.18))
    mt = lerp(b_m, 0.1, dust_a)
    if kind == 'PSM_body':
        rg = lerp(rg, 0.55, nose); rg = lerp(rg, 0.30, tip)                                    # нос — полуматовый, конус — гладкий
        rg = lerp(rg, 0.60, band); rg = lerp(rg, 0.85, slot)
        mt = lerp(mt, 0.25, nose); mt = lerp(mt, 0.80, tip); mt = lerp(mt, 0.0, band); mt = lerp(mt, 0.0, slot)
    rg = lerp(rg, 0.38, wear_a); mt = lerp(mt, 0.88, wear_a)
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
if os.environ.get('PSM_COLOR_TEST'):
    import modelkit as mk
    from mathutils import Vector
    sc.cycles.samples = 12
    try: sc.cycles.use_denoising = False
    except Exception: pass
    sc.render.film_transparent = False; sc.render.image_settings.color_mode = 'RGB'
    try: sc.view_settings.view_transform = 'Standard'
    except Exception: pass
    cam = mk._camera(); cam.data.type = 'PERSP'; cam.data.lens = 50; cam.data.clip_start, cam.data.clip_end = 0.02, 200
    Yq = lambda x: x - Lm / 2
    for nm_, tgt, d_, dist in (('1', Vector((0, 0.0, 0)), (1.0, -0.15, 0.12), 6.5), ('2', Vector((0, Yq(dd(3.1)), 0.02)), (1.0, 0.05, 0.25), 1.7), ('3', Vector((0, Yq(dd(6.4)), 0.0)), (0.75, 0.55, 0.30), 1.8), ('4', Vector((0, Yq(dd(0.6)), 0)), (0.7, -0.7, 0.35), 1.6)):
        dv = Vector(d_).normalized(); cam.location = tgt + dv * dist; cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
        mk._render(os.path.join(os.environ['PSM_COLOR_TEST'], f'color_{nm_}.png'), 1280, 720)
    raise SystemExit(0)
try: sc.cycles.use_denoising = False
except Exception: pass
for o in vl.objects: o.select_set(False)
for o in objs: o.select_set(True)
vl.objects.active = objs[0]
if not REUSE:
    bpy.ops.object.bake(type='EMIT', width=SIZE, height=SIZE, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
    log('запекание готово')
else: log('цвет взят из прошлого запуска (PSM_REUSE=1)')

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
    """Bevel скругляет все рёбра (блик на кромках без лишних треугольников), Bump даёт мелкую «корку» краски и продольную «шлифовку»; прорезь сверху — канавка ≈ 1,2 мм, лента — тонкий уступ."""
    out, prin, tex, col = entry; nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for l in list(out.inputs['Surface'].links): links.remove(l)
    links.new(prin.outputs['BSDF'], out.inputs['Surface'])
    kind = mat.name
    k_fine, k_brush, bev_r = {'PSM_body': (0.22, 0.30, 0.0022), 'PSM_fin': (0.20, 0.22, 0.0025), 'PSM_dark': (0.2, 0.0, 0.003), 'PSM_steel': (0.12, 0.25, 0.0018)}.get(kind, (0.2, 0.0, 0.002))
    tc = nodes.new('ShaderNodeTexCoord')
    bev = nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = bev_r; bev.samples = 16
    def noise(scale, detail, rough, vec=None):
        n = nodes.new('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(vec if vec is not None else tc.outputs['Object'], n.inputs['Vector']); return n.outputs['Fac']
    def mul(a, k):
        n = nodes.new('ShaderNodeMath'); n.operation = 'MULTIPLY'; links.new(a, n.inputs[0]); n.inputs[1].default_value = k; return n.outputs['Value']
    def add(a, b):
        n = nodes.new('ShaderNodeMath'); n.operation = 'ADD'; links.new(a, n.inputs[0]); links.new(b, n.inputs[1]); return n.outputs['Value']
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.002; bump.inputs['Strength'].default_value = 1.0
    h = mul(noise(220.0, 3.0, 0.55), 0.25 * k_fine)                                                  # «корка» краски
    if k_brush > 0:
        mp = nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (60.0, 0.5, 60.0); links.new(tc.outputs['Object'], mp.inputs['Vector'])
        h = add(h, mul(noise(1.0, 4.0, 0.7, mp.outputs['Vector']), 0.5 * k_brush))                   # продольная «шлифовка»
    if kind == 'PSM_body':
        slot_ = top_slot_mask(nodes, links, tc.outputs['Object'])
        h = add(h, mul(slot_, -0.6))                                                                  # прорезь ≈ 1,2 мм вглубь
    links.new(h, bump.inputs['Height'])
    links.new(bev.outputs['Normal'], bump.inputs['Normal'])
    links.new(bump.outputs['Normal'], prin.inputs['Normal'])


nimg = bpy.data.images.get('PSM_normal')
if nimg is not None: bpy.data.images.remove(nimg)
nimg = bpy.data.images.new('PSM_normal', NSIZE, NSIZE, alpha=False)
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
npath = os.path.join(OUT, 'prsm_normal.png')
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
for ti_, *_r in timgs: bpy.data.images.remove(ti_)
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


lite(img, f'PSM_detail_{GAME_TEX}', 'JPEG', f'prsm_detail_{GAME_TEX}.jpg', GAME_TEX); lite(nimg, f'PSM_normal_{GAME_NTEX}', 'PNG', f'prsm_normal_{GAME_NTEX}.png', GAME_NTEX)
log('облегчённые копии', GAME_TEX, '/', GAME_NTEX, 'готовы')
