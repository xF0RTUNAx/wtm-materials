# bake.py — запекает две текстуры контейнера «Сорбция»: цвет (sorbtsiya_detail.png: светлая серая краска со сколами и потёками, обтекатели теплее и белее, затенение стыков и щелей, продольный шов с метками,
# овальное отверстие и винты люка) и карту нормалей (sorbtsiya_normal.png: скруглённые кромки, зерно краски, канавка шва, метки, винты, выемка отверстия).
# Нужен Cycles (на видеокарте — gpu_setup). Запускается ПОСЛЕ build.py в той же сессии (фоновый Blender или живой через exec):
#   SRB_OUT="<папка модели>" [SRB_TEX=2048] Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Развёртка: корпус — одной полосой вокруг оси со швом внизу (ring_uv: u — дуга по радиусу кольца, v — длина профиля), остальное — смарт-проекцией; упаковка без поворота, поля 8 px.
# Шов, метки, отверстие и винты — шейдером по координатам модели (угол вокруг оси и расстояние вдоль неё), независимо от развёртки (положения — по рисунку поз. 87, см. srb_pod.py).
# SRB_REUSE=1 — цвет не запекать заново (геометрия та же), пересчитать только нормали. Для игры deliver.py берёт облегчённые SRB_GAME_TEX / SRB_GAME_NTEX.
import os, sys, math, time
sys.dont_write_bytecode = True
import bpy
import modelkit as mk                                   # build.py уже подключил библиотеку и построил модель
import numpy as np

CFG = dict(scene='SORB', env='SRB', base='sorbtsiya', prefixes=('SRB_',), body='SRB_body', tag='SRB')
OUT = os.environ.get(CFG['env'] + '_OUT')
if not OUT: raise SystemExit(f"Задай {CFG['env']}_OUT=<папка модели>")
SIZE = int(os.environ.get(CFG['env'] + '_TEX', '2048'))
NSIZE = int(os.environ.get(CFG['env'] + '_NTEX', str(SIZE)))
GAME_TEX, GAME_NTEX = int(os.environ.get(CFG['env'] + '_GAME_TEX', '512')), int(os.environ.get(CFG['env'] + '_GAME_NTEX', '512'))
T0 = time.time()
sc = bpy.data.scenes[CFG['scene']]
if bpy.context.window: bpy.context.window.scene = sc
vl = bpy.context.view_layer
vl.update()
objs = [o for o in sc.objects if o.type == 'MESH']
body = next(o for o in objs if o.name == CFG['body'])
L_POD, R_POD = 4.20, 0.15
A_OF = lambda y: L_POD / 2 - y                              # координата Y → расстояние от острого колпака a (м)


def log(*a): print(f'[{time.time() - T0:5.1f} с]', *a, flush=True)


# 1. развёртка
def ring_uv(o, n=32):
    me = o.data; uvd = me.uv_layers.active.data; nv = len(me.vertices); nr = nv // n
    cy = [sum(me.vertices[i * n + j].co.y for j in range(n)) / n for i in range(nr)]
    rr = [sum(math.hypot(me.vertices[i * n + j].co.x, me.vertices[i * n + j].co.z) for j in range(n)) / n for i in range(nr)]
    vv = [0.0]
    for i in range(1, nr): vv.append(vv[-1] + math.hypot(cy[i] - cy[i - 1], rr[i] - rr[i - 1]))
    for poly in me.polygons:
        li = list(poly.loop_indices); vis = [me.loops[i].vertex_index for i in li]; cos = [me.vertices[vi].co for vi in vis]; rings = [vi // n for vi in vis]
        if len(li) > 4 and (rings[0] == 0 or rings[0] == nr - 1) and len(set(rings)) == 1:
            for i, c in zip(li, cos): uvd[i].uv = (c.x, c.z)
            continue
        ang = [math.atan2(c.x, c.z) for c in cos]
        a0 = ang[0]; ang = [a if abs(a - a0) <= math.pi else a + (2 * math.pi if a0 - a > 0 else -2 * math.pi) for a in ang]
        for i, a, ri in zip(li, ang, rings): uvd[i].uv = (a * rr[ri], vv[ri])


for o in vl.objects: o.select_set(False)
for o in objs:
    while len(o.data.uv_layers) > 0: o.data.uv_layers.remove(o.data.uv_layers[0])
    o.data.uv_layers.new(name='UVMap')
ring_uv(body)
flat = [o for o in objs if o is not body]
for o in flat: o.select_set(True)
vl.objects.active = flat[0]
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
# зазор между островами 16 px (а не 8): у каждого острова своя полоса растяжки цвета в 8 px, иначе соседний остров затирает её и на шве корпуса сэмплируется чужой цвет — тёмная линия
try: bpy.ops.uv.pack_islands(rotate=False, margin=16.0 / SIZE, margin_method='ADD')
except TypeError:
    try: bpy.ops.uv.pack_islands(rotate=False, margin=16.0 / SIZE)
    except TypeError: bpy.ops.uv.pack_islands(margin=16.0 / SIZE)
bpy.ops.object.mode_set(mode='OBJECT')
# запас по краю атласа (≈ 12 px): остров у самой границы (u = 0) при повторе текстуры сэмплирует пустой правый край — на нижнем шве корпуса получалась тёмная линия
K_UV = 1.0 - 2 * 12.0 / SIZE
for o in objs:
    for l_ in o.data.uv_layers.active.data: l_.uv = (0.5 + (l_.uv.x - 0.5) * K_UV, 0.5 + (l_.uv.y - 0.5) * K_UV)
log('развёртка готова, объектов', len(objs), '(плоских', len(flat), ')')

# 2. картинка цвета
old = bpy.data.images.get(CFG['tag'] + '_detail')
if old is not None: bpy.data.images.remove(old)
path = os.path.join(OUT, CFG['base'] + '_detail.png')
REUSE = os.environ.get(CFG['env'] + '_REUSE') == '1' and os.path.exists(path)
if REUSE:
    img = bpy.data.images.load(path, check_existing=False); img.name = CFG['tag'] + '_detail'; img.pack()
else:
    img = bpy.data.images.new(CFG['tag'] + '_detail', SIZE, SIZE, alpha=False)
    img.generated_color = (1, 1, 1, 1)
mats = [m for m in bpy.data.materials if m.name.startswith(CFG['prefixes']) and m.users > 0]

# положения деталей (по рисунку поз. 87; a — от острого колпака, м; угол — рад от +X, вверх +): шов с метками, люк, овальное отверстие, винты люка
PHI_S = math.radians(-14.0)                                 # шов вдоль наружного борта: чуть ниже экватора
SEAM_A0, SEAM_A1 = 0.62, 3.76                               # от кольца носового колпака до кольца хвостового
TICK_A0, TICK_PITCH = 0.85, 0.25                            # метки — вниз от шва, шаг 0,25 м
HATCH = (2.65, 3.09, math.radians(-60.0), math.radians(8.0))
OVAL = (2.87, math.radians(-38.0), 0.070, 0.035)            # центр a, угол, полуоси по оси (м) и по дуге (м)
SCREWS = [(a_, p_) for a_ in (2.69, 2.87, 3.05) for p_ in (math.radians(-54.0), math.radians(-4.0))]


def detail_nodes(nodes, links, sep):
    """Маски деталей по координатам модели: шов (0…1), метки, овальное отверстие, купол винтов, тёмное кольцо вокруг винтов."""
    def math_(op, a=None, b=None, c=None):
        n = nodes.new('ShaderNodeMath'); n.operation = op
        for i, v in enumerate((a, b, c)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: links.new(v, n.inputs[i])
        return n.outputs['Value']
    def mr(src, f0, f1, t0=0.0, t1=1.0):
        n = nodes.new('ShaderNodeMapRange'); n.clamp = True
        n.inputs['From Min'].default_value = f0; n.inputs['From Max'].default_value = f1; n.inputs['To Min'].default_value = t0; n.inputs['To Max'].default_value = t1
        links.new(src, n.inputs['Value']); return n.outputs['Result']
    def band(v, lo, hi): return math_('MULTIPLY', math_('GREATER_THAN', v, lo), math_('LESS_THAN', v, hi))
    X, Yc, Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    phi = math_('ARCTAN2', Z, X)                              # угол вокруг оси: 0 — +X (наружный борт), π/2 — +Z (планка)
    a = math_('SUBTRACT', L_POD / 2, Yc)                      # расстояние от острого колпака
    sq = lambda v: math_('MULTIPLY', v, v)
    # люк: зона (шов под ним не рисуем)
    hz = math_('MULTIPLY', band(a, HATCH[0] - 0.005, HATCH[1] + 0.005), band(phi, HATCH[2] - 0.03, HATCH[3] + 0.03))
    nohz = math_('SUBTRACT', 1.0, hz)
    along = band(a, SEAM_A0, SEAM_A1)
    d_arc = math_('MULTIPLY', math_('ABSOLUTE', math_('SUBTRACT', phi, PHI_S)), R_POD)
    seam = math_('MULTIPLY', math_('MULTIPLY', mr(d_arc, 0.0030, 0.0011), along), nohz)
    t = math_('DIVIDE', math_('SUBTRACT', a, TICK_A0), TICK_PITCH); fr = math_('SUBTRACT', t, math_('ROUND', t))
    ad = math_('MULTIPLY', math_('ABSOLUTE', fr), TICK_PITCH)
    below = math_('MULTIPLY', math_('SUBTRACT', PHI_S, phi), R_POD)
    tick = math_('MULTIPLY', math_('MULTIPLY', math_('MULTIPLY', mr(ad, 0.0030, 0.0016), band(below, 0.0006, 0.0140)), along), nohz)
    # овальное отверстие люка
    da = math_('DIVIDE', math_('SUBTRACT', a, OVAL[0]), OVAL[2]); dp = math_('DIVIDE', math_('MULTIPLY', math_('SUBTRACT', phi, OVAL[1]), R_POD), OVAL[3])
    q = math_('ADD', sq(da), sq(dp))
    oval = mr(q, 1.0, 0.7)
    rim = math_('SUBTRACT', mr(q, 1.9, 1.0), oval)
    # винты люка: расстояние до ближайшего из шести
    dmin = None
    for a_, p_ in SCREWS:
        da_ = math_('SUBTRACT', a, a_); dp_ = math_('MULTIPLY', math_('SUBTRACT', phi, p_), R_POD)
        d_ = math_('SQRT', math_('ADD', sq(da_), sq(dp_)))
        dmin = d_ if dmin is None else math_('MINIMUM', dmin, d_)
    dome = mr(dmin, 0.0070, 0.0028); halo = mr(dmin, 0.0115, 0.0070)
    return dict(seam=seam, tick=tick, oval=oval, rim=rim, dome=dome, halo=halo)


def build_pattern(mat):
    nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for n in list(nodes):
        if n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): nodes.remove(n)
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL'); prin = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    col = tuple(prin.inputs['Base Color'].default_value)
    for l in list(prin.inputs['Base Color'].links): links.remove(l)
    N = lambda t: nodes.new(t)
    kind = mat.name
    soil_k = {'SRB_body': 1.0, 'SRB_cap': 0.55, 'SRB_dark': 0.8}.get(kind, 1.0)
    painted = kind in ('SRB_body', 'SRB_cap')
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
    geo = N('ShaderNodeNewGeometry')
    ao1 = N('ShaderNodeAmbientOcclusion'); ao1.samples = 24; ao1.inputs['Distance'].default_value = 0.012
    ao2 = N('ShaderNodeAmbientOcclusion'); ao2.samples = 12; ao2.inputs['Distance'].default_value = 0.06
    ao3 = N('ShaderNodeAmbientOcclusion'); ao3.samples = 12; ao3.inputs['Distance'].default_value = 0.25
    a1 = maprange(ao1.outputs['AO'], 0, 1, 0.50, 1.0); a2 = maprange(ao2.outputs['AO'], 0, 1, 0.72, 1.0); a3 = maprange(ao3.outputs['AO'], 0, 1, 0.80, 1.0)
    def noise(scale, detail, rough, lo, hi, vec=None):
        n = N('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(vec if vec is not None else tc.outputs['Object'], n.inputs['Vector']); return maprange(n.outputs['Fac'], lo, hi, 0.0, 1.0)
    mp = N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (60.0, 1.4, 60.0); links.new(tc.outputs['Object'], mp.inputs['Vector'])   # потёки вдоль оси (Y) — вдоль потока
    streak = noise(1.0, 4.0, 0.62, 0.40, 0.70, vec=mp.outputs['Vector'])
    patchy = noise(4.0, 6.0, 0.6, 0.30, 0.72)
    gm = N('ShaderNodeMapping'); gm.inputs['Scale'].default_value = (330.0, 330.0, 330.0); links.new(tc.outputs['Object'], gm.inputs['Vector'])
    wn = N('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; links.new(gm.outputs['Vector'], wn.inputs['Vector'])
    grain = math_('ADD', 1.0, math_('MULTIPLY', math_('SUBTRACT', wn.outputs['Value'], 0.5), 0.05))
    bev = N('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.0025; bev.samples = 6
    dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; links.new(bev.outputs['Normal'], dot.inputs[0]); links.new(geo.outputs['Normal'], dot.inputs[1])
    edge = maprange(dot.outputs['Value'], 1.0, 0.93, 0.0, 1.0)
    bev2 = N('ShaderNodeBevel'); bev2.inputs['Radius'].default_value = 0.010; bev2.samples = 6
    dot2 = N('ShaderNodeVectorMath'); dot2.operation = 'DOT_PRODUCT'; links.new(bev2.outputs['Normal'], dot2.inputs[0]); links.new(geo.outputs['Normal'], dot2.inputs[1])
    zone = maprange(dot2.outputs['Value'], 1.0, 0.90, 0.0, 1.0)
    chip = math_('MULTIPLY', zone, noise(30.0, 5.0, 0.6, 0.50, 0.64))
    scuff = math_('MULTIPLY', noise(6.0, 7.0, 0.62, 0.56, 0.74), math_('ADD', 0.4, math_('MULTIPLY', streak, 0.6)))
    # покраска: светлая серая; на сколах — грунт/металл; обтекатели (стеклопластик) — светлее, потёки слабее; тёмные детали — рифлёная сталь
    METAL = {'SRB_body': (0.17, 0.16, 0.15), 'SRB_cap': (0.38, 0.35, 0.28)}.get(kind, (0.30, 0.30, 0.31))
    GRIME, DARKLINE, OVALC = (0.12, 0.11, 0.09), (0.10, 0.10, 0.11), (0.035, 0.038, 0.042)
    c = rgb(col)
    light = mixc(rgb(col), gray(1.30), 1.0, 'MULTIPLY')
    c = mixc(c, light, math_('MULTIPLY', scuff, 0.40))
    c = mixc(c, rgb(GRIME), math_('MULTIPLY', math_('MULTIPLY', streak, math_('ADD', 0.25, math_('MULTIPLY', patchy, 0.75))), 0.30 * soil_k))
    c = mixc(c, rgb(METAL), math_('MULTIPLY', math_('ADD', math_('MULTIPLY', edge, 0.55), chip, clamp=True), 0.65 if painted else 0.35))
    c = mixc(c, gray(math_('MULTIPLY', math_('MULTIPLY', a1, a2), a3)), 1.0, 'MULTIPLY')
    c = mixc(c, gray(grain), 1.0, 'MULTIPLY')
    if kind == 'SRB_body':                                  # шов с метками, отверстие и винты люка — только на краске корпуса и пластине люка
        d = detail_nodes(nodes, links, sep)
        c = mixc(c, rgb(DARKLINE), math_('MULTIPLY', math_('ADD', d['seam'], math_('MULTIPLY', d['tick'], 0.9), clamp=True), 0.78))
        c = mixc(c, rgb(OVALC), math_('MULTIPLY', d['oval'], 0.92))
        c = mixc(c, gray(math_('SUBTRACT', 1.0, math_('MULTIPLY', math_('MULTIPLY', d['halo'], math_('SUBTRACT', 1.0, d['dome'])), 0.35))), 1.0, 'MULTIPLY')
    emi = N('ShaderNodeEmission'); links.new(c, emi.inputs['Color'])
    links.new(emi.outputs['Emission'], out.inputs['Surface'])
    tex = N('ShaderNodeTexImage'); tex.image = img
    for n in nodes: n.select = False
    tex.select = True; nodes.active = tex
    return out, prin, tex, col


rig = {m.name: build_pattern(m) for m in mats}
log('шейдеры запекания готовы')

# 3. запекание цвета
sys.path.insert(0, '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/_инструменты')
import gpu_setup                                    # Cycles на видеокарте (Metal), если есть; иначе процессор
log('Cycles:', gpu_setup.use_gpu(sc)); sc.cycles.samples = 24
try: sc.cycles.use_denoising = False
except Exception: pass
for o in vl.objects: o.select_set(False)
for o in objs: o.select_set(True)
vl.objects.active = objs[0]
if not REUSE:
    bpy.ops.object.bake(type='EMIT', width=SIZE, height=SIZE, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
    log('запекание цвета готово')
    img.filepath_raw = path; img.file_format = 'PNG'; img.save(); img.pack()
else: log('цвет взят из прошлого запуска')
log('цвет сохранён', path)


def seam_check(image, thr=0.12, steps=17):
    W_, H_ = image.size
    px = np.array(image.pixels[:], dtype=np.float32).reshape(H_, W_, 4)[..., :3].mean(axis=2)
    def samp(u, v):
        x, y = u * W_ - 0.5, v * H_ - 0.5; x0, y0 = int(math.floor(x)), int(math.floor(y)); fx, fy = x - x0, y - y0
        g = lambda xx, yy: px[min(max(yy, 0), H_ - 1), min(max(xx, 0), W_ - 1)]
        return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy
    worst, bad, n_edges = 0.0, [], 0
    for o in objs:
        me = o.data; uvl = me.uv_layers.active.data; by_edge = {}
        for p_ in me.polygons:
            for li in p_.loop_indices: by_edge.setdefault(me.loops[li].edge_index, []).append(p_)
        for ei, pl in by_edge.items():
            if len(pl) != 2: continue
            e = me.edges[ei]; va, vb = e.vertices
            def uv_of(p_, vi):
                for k in p_.loop_indices:
                    if me.loops[k].vertex_index == vi: return uvl[k].uv
            A0, A1, B0, B1 = uv_of(pl[0], va), uv_of(pl[0], vb), uv_of(pl[1], va), uv_of(pl[1], vb)
            if (A0 - B0).length < 1e-4 and (A1 - B1).length < 1e-4: continue
            if (A1 - A0).length * W_ < 12: continue
            n_edges += 1; dmax = 0.0
            for t in np.linspace(0, 1, steps):
                sa = samp(A0.x + (A1.x - A0.x) * t, A0.y + (A1.y - A0.y) * t); sb = samp(B0.x + (B1.x - B0.x) * t, B0.y + (B1.y - B0.y) * t)
                dmax = max(dmax, abs(float(sa) - float(sb)))
            worst = max(worst, dmax)
            if dmax > thr: bad.append((o.name, ei, round(dmax, 2)))
    return n_edges, worst, bad


nse, worst, bad = seam_check(img)
by_obj = {}
for n_, ei_, d_ in bad: by_obj.setdefault(n_, []).append(d_)
log(f'швы развёртки (длиннее 12 px): рёбер {nse}, наибольшая разница {worst:.2f}, плохих (>0.12) {len(bad)}; по деталям:', {k: (len(v), max(v)) for k, v in by_obj.items()})


# 4. карта нормалей
def build_relief(mat, entry):
    out, prin, tex, col = entry; nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for l in list(out.inputs['Surface'].links): links.remove(l)
    links.new(prin.outputs['BSDF'], out.inputs['Surface'])
    k_fine, bev_r = {'SRB_body': (0.22, 0.0025), 'SRB_cap': (0.15, 0.0025), 'SRB_dark': (0.30, 0.0020)}.get(mat.name, (0.2, 0.002))
    tc = nodes.new('ShaderNodeTexCoord'); sep = nodes.new('ShaderNodeSeparateXYZ'); links.new(tc.outputs['Object'], sep.inputs['Vector'])
    bev = nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = bev_r; bev.samples = 10
    def noise(scale, detail, rough):
        n = nodes.new('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(tc.outputs['Object'], n.inputs['Vector']); return n.outputs['Fac']
    def mul(a, k):
        n = nodes.new('ShaderNodeMath'); n.operation = 'MULTIPLY'; links.new(a, n.inputs[0]); n.inputs[1].default_value = k; return n.outputs['Value']
    def add(a, b):
        n = nodes.new('ShaderNodeMath'); n.operation = 'ADD'; links.new(a, n.inputs[0]); links.new(b, n.inputs[1]); return n.outputs['Value']
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.002; bump.inputs['Strength'].default_value = 1.0
    h = add(mul(noise(120.0, 3.0, 0.55), 0.55 * k_fine), mul(noise(8.0, 2.0, 0.5), 0.35 * k_fine))
    if mat.name == 'SRB_body':
        d = detail_nodes(nodes, links, sep)
        h = add(h, mul(d['dome'], 1.8)); h = add(h, mul(d['oval'], -2.2)); h = add(h, mul(d['rim'], 0.9)); h = add(h, mul(d['seam'], -0.9)); h = add(h, mul(d['tick'], -0.7))
    links.new(h, bump.inputs['Height'])
    links.new(bev.outputs['Normal'], bump.inputs['Normal'])
    links.new(bump.outputs['Normal'], prin.inputs['Normal'])


nimg = bpy.data.images.get(CFG['tag'] + '_normal')
if nimg is not None: bpy.data.images.remove(nimg)
nimg = bpy.data.images.new(CFG['tag'] + '_normal', NSIZE, NSIZE, alpha=False)
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
npath = os.path.join(OUT, CFG['base'] + '_normal.png')
nimg.filepath_raw = npath; nimg.file_format = 'PNG'; nimg.save()
nimg.pack()

# 5. материалы: Base Color = текстура цвета, Normal = карта нормалей; служебные узлы убрать
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


def lite(image, name, fmt, fname, px):
    c = image.copy(); c.name = name; c.scale(px, px); c.file_format = fmt
    p_ = os.path.join(OUT, fname)
    try: c.save(filepath=p_, quality=92)
    except TypeError:
        c.filepath_raw = p_; c.save()
    bpy.data.images.remove(c)
    return p_


lite(img, f"{CFG['tag']}_detail_{GAME_TEX}", 'JPEG', f"{CFG['base']}_detail_{GAME_TEX}.jpg", GAME_TEX); lite(nimg, f"{CFG['tag']}_normal_{GAME_NTEX}", 'PNG', f"{CFG['base']}_normal_{GAME_NTEX}.png", GAME_NTEX)
log('облегчённые копии', GAME_TEX, '/', GAME_NTEX, 'готовы')
