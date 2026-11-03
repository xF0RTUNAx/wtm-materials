# bake.py — запекает две текстуры ФАБ-1000: цвет (fab1000_detail.png: краска по варианту F1K_PAINT, износ, затенение стыков и щелей, заклёпки уголков, отверстия фланца)
# и карту нормалей (fab1000_normal.png: скруглённые кромки, зерно краски, купола заклёпок, отверстия фланца). Образец — ФАБ-500М62/bake.py (ревизия 2: видеокарта, зазор островов 16 px).
# Запускается ПОСЛЕ build.py в той же сессии:
#   F1K_OUT="<папка модели>" [F1K_TEX=2048] [F1K_PAINT=серая|оливковая|тёмно-серая] Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Развёртка: корпус — одной полосой вокруг оси со швом внизу (ring_uv), остальное — смарт-проекцией; упаковка без поворота, зазор 16 px, атлас сжат к центру на 24 px.
# F1K_REUSE=1 — цвет не запекать заново (геометрия та же), только нормали. Для игры deliver.py берёт облегчённые F1K_GAME_TEX / F1K_GAME_NTEX.
import os, sys, math, time
sys.dont_write_bytecode = True
import bpy
import modelkit as mk                                   # build.py уже подключил библиотеку и построил модель
import numpy as np

CFG = dict(scene='FAB1000', env='F1K', base='fab1000', prefixes=('F1K_',), body='F1K_body', tag='F1K')
OUT = os.environ.get(CFG['env'] + '_OUT')
if not OUT: raise SystemExit(f"Задай {CFG['env']}_OUT=<папка модели>")
SIZE = int(os.environ.get(CFG['env'] + '_TEX', '2048'))
NSIZE = int(os.environ.get(CFG['env'] + '_NTEX', str(SIZE)))
GAME_TEX, GAME_NTEX = int(os.environ.get(CFG['env'] + '_GAME_TEX', '1024')), int(os.environ.get(CFG['env'] + '_GAME_NTEX', '512'))
PAINT = os.environ.get(CFG['env'] + '_PAINT', 'серая')                     # Mark 2026-11-03: «1 — серая»
SUFFIX = os.environ.get(CFG['env'] + '_SUFFIX', '')       # пробная окраска: картинки с суффиксом варианта, основные не трогаем
T0 = time.time()
sc = bpy.data.scenes[CFG['scene']]
if bpy.context.window: bpy.context.window.scene = sc
vl = bpy.context.view_layer
vl.update()
objs = [o for o in sc.objects if o.type == 'MESH']
body = next(o for o in objs if o.name == CFG['body'])
S, Yx = mk.S, mk.Y                                       # метров на пиксель ref_01; пиксель → Y

# ── варианты окраски (цвета линейные). wear — сила износа, rust — ржавые точки и потёки, chips — сколы до металла ──
PAINTS = {
    'серая':      dict(col=(0.50, 0.53, 0.56), wear=0.55, rust=1.0, chips=0.35, grime=0.55, metal=(0.30, 0.30, 0.31)),   # музейная перекраска, как на фото: светлая, ржавые точки
    'оливковая':  dict(col=(0.109, 0.133, 0.080), wear=1.0, rust=0.6, chips=1.0, grime=1.0, metal=(0.20, 0.15, 0.11)),   # как нынешняя модель игры (vis.color 0x5d6650)
    'тёмно-серая': dict(col=(0.085, 0.090, 0.096), wear=1.0, rust=0.8, chips=1.0, grime=0.8, metal=(0.24, 0.22, 0.20)),  # на мой вкус: тёмная «шаровая» с ржавыми потёками
}
PV = PAINTS[PAINT]


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
        ang = [math.atan2(c.x, -c.z) for c in cos]                 # шов — снизу (−Z)
        a0 = ang[0]; ang = [a if abs(a - a0) <= math.pi else a + (2 * math.pi if a0 - a > 0 else -2 * math.pi) for a in ang]
        for i, a, ri in zip(li, ang, rings): uvd[i].uv = (a * max(rr[ri], 0.004), vv[ri])


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
try: bpy.ops.uv.pack_islands(rotate=False, margin=16.0 / SIZE, margin_method='ADD')
except TypeError:
    try: bpy.ops.uv.pack_islands(rotate=False, margin=16.0 / SIZE)
    except TypeError: bpy.ops.uv.pack_islands(margin=16.0 / SIZE)
bpy.ops.object.mode_set(mode='OBJECT')
k_in = 1.0 - 24.0 / SIZE                                       # острова не прижимаются к краю атласа
for o in objs:
    for d in o.data.uv_layers.active.data: d.uv = (0.5 + (d.uv.x - 0.5) * k_in, 0.5 + (d.uv.y - 0.5) * k_in)
log('развёртка готова, объектов', len(objs), '(плоских', len(flat), ')')

# 2. картинка цвета
old = bpy.data.images.get(CFG['tag'] + '_detail')
if old is not None: bpy.data.images.remove(old)
path = os.path.join(OUT, CFG['base'] + '_detail' + SUFFIX + '.png')
REUSE = os.environ.get(CFG['env'] + '_REUSE') == '1' and os.path.exists(path)
if REUSE:
    img = bpy.data.images.load(path, check_existing=False); img.name = CFG['tag'] + '_detail'; img.pack()
else:
    img = bpy.data.images.new(CFG['tag'] + '_detail', SIZE, SIZE, alpha=False)
    img.generated_color = (1, 1, 1, 1)
mats = [m for m in bpy.data.materials if m.name.startswith(CFG['prefixes']) and m.users > 0]

# места заклёпок и отверстий (пиксели ref_01 → метры), из build.py
G = mk.GEO                                                     # числа геометрии — build.py кладёт их в modelkit
TH = G['FIN_T'] / 2 * S; LEG, A_T = 9.0 * S, 1.5 * S
X_LE0, X_CONE1, R_CONE1, CONE_K = G['X_LE0'], G['X_CONE1'], G['R_CONE1'], G['CONE_K']
X_JOIN, X_END, X_FL1 = G['X_JOIN'], G['X_END'], G['X_FL1']


def node_math(nodes, links):
    def math_(op, a=None, b=None, c=None, clamp=False):
        n = nodes.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate((a, b, c)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: links.new(v, n.inputs[i])
        return n.outputs['Value']
    return math_


def rivet_nodes(nodes, links, sep):
    """Заклёпки уголков стабилизатора (по корню на конусе — на полке конуса и на полке пера, в углах стыка на оси — на обеих полках) и восемь отверстий фланца.
    Четыре пера «+» — свёртка координат: r = max(|x|, |z|) — вдоль пера, w = min(|x|, |z|) — поперёк. Выход: (купол 0…1, тёмное кольцо 0…1, отверстие 0…1)."""
    M = node_math(nodes, links)
    X, Yc, Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    ax, az = M('ABSOLUTE', X), M('ABSOLUTE', Z)
    r, w = M('MAXIMUM', ax, az), M('MINIMUM', ax, az)
    def seg(y0, y1): return M('MULTIPLY', M('GREATER_THAN', Yc, min(y0, y1)), M('LESS_THAN', Yc, max(y0, y1)))
    def along(ya, pitch):
        t = M('DIVIDE', M('SUBTRACT', Yc, ya), pitch); return M('MULTIPLY', M('SUBTRACT', t, M('ROUND', t)), pitch)
    def dist(du, dv): return M('SQRT', M('ADD', M('MULTIPLY', du, du), M('MULTIPLY', dv, dv)))
    BIG = 5.0
    # уголки по корню: x 1177…1334, шаг 22 пикс.; радиус конуса по Y: R(y) = R_CONE1 + (X_CONE1 − x)·K, x = X0 − y/S
    ya, yb = Yx(X_LE0 + 18.0), Yx(X_CONE1 - 9.0); p1 = 22.0 * S
    Rcone = M('ADD', R_CONE1 * S, M('MULTIPLY', M('SUBTRACT', X_CONE1 - mk.X0, M('DIVIDE', Yc, -S)), CONE_K * S))   # x − X0 = −y/S (нос слева)
    fy = along(ya, p1); g1 = seg(ya, yb)
    d_cone = dist(M('SUBTRACT', w, TH + 5.5 * S), fy)                                       # полка на конусе: поперёк пера на th + 5,5 пикс.
    d_cone = M('ADD', d_cone, M('MULTIPLY', M('GREATER_THAN', r, M('ADD', Rcone, 3.0 * S)), BIG))
    d_fin = dist(M('SUBTRACT', r, M('ADD', Rcone, 5.5 * S)), fy)                             # полка на пере: по высоте R + 5,5 пикс., у грани пера
    d_fin = M('ADD', d_fin, M('MULTIPLY', M('GREATER_THAN', w, TH + A_T + 0.6 * S), BIG))
    d1 = M('ADD', M('MINIMUM', d_cone, d_fin), M('MULTIPLY', M('SUBTRACT', 1.0, g1), BIG))
    # уголки в углах стыка на оси: x 1474…1746, шаг 24 пикс., заклёпка на 7 пикс. от оси по каждой полке
    yc0, yc1 = Yx(X_JOIN + 14.0), Yx(X_END - 14.0); p2 = 24.0 * S
    fy2 = along(yc0, p2); g2 = seg(yc0, yc1)
    d2 = dist(M('SUBTRACT', r, TH + 7.0 * S), fy2)
    d2 = M('ADD', d2, M('MULTIPLY', M('GREATER_THAN', w, TH + A_T + 0.6 * S), BIG))
    d2 = M('ADD', d2, M('MULTIPLY', M('SUBTRACT', 1.0, g2), BIG))
    d = M('MINIMUM', d1, d2)
    rv = 2.3 * S                                                                          # радиус головки ≈ 4,6 мм
    def ramp(v, f0, f1):
        n = nodes.new('ShaderNodeMapRange'); n.clamp = True
        n.inputs['From Min'].default_value = f0; n.inputs['From Max'].default_value = f1; n.inputs['To Min'].default_value = 0.0; n.inputs['To Max'].default_value = 1.0
        links.new(v, n.inputs['Value']); return n.outputs['Result']
    dome = ramp(d, rv, rv * 0.2); halo = ramp(d, rv * 2.2, rv)
    # отверстия фланца: задний торец x = X_FL1, восемь по кругу радиуса 26 пикс., отверстие 3,6 пикс.
    rho = dist(X, Z); ang = M('ARCTAN2', Z, X); st = math.pi / 4
    a8 = M('SUBTRACT', ang, M('MULTIPLY', M('ROUND', M('DIVIDE', ang, st)), st))
    du = M('SUBTRACT', M('MULTIPLY', rho, M('COSINE', a8)), 26.0 * S); dv = M('MULTIPLY', rho, M('SINE', a8))
    dh = dist(du, dv)
    on_face = M('LESS_THAN', M('ABSOLUTE', M('SUBTRACT', Yc, Yx(X_FL1))), 0.6 * S)
    hole = M('MULTIPLY', ramp(dh, 3.8 * S, 2.9 * S), on_face)
    return dome, halo, hole


def build_pattern(mat):
    nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for n in list(nodes):
        if n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): nodes.remove(n)
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL'); prin = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    kind = mat.name
    col = PV['col'] if kind in ('F1K_body', 'F1K_fin') else (tuple(c * 0.82 for c in PV['col']) if kind == 'F1K_steel' else tuple(prin.inputs['Base Color'].default_value)[:3])
    prin.inputs['Base Color'].default_value = (*col, 1.0)
    for l in list(prin.inputs['Base Color'].links): links.remove(l)
    N = lambda t: nodes.new(t)
    M = node_math(nodes, links)
    painted = kind != 'F1K_dark'
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
    ao1 = N('ShaderNodeAmbientOcclusion'); ao1.samples = 24; ao1.inputs['Distance'].default_value = 0.012
    ao2 = N('ShaderNodeAmbientOcclusion'); ao2.samples = 12; ao2.inputs['Distance'].default_value = 0.06
    ao3 = N('ShaderNodeAmbientOcclusion'); ao3.samples = 12; ao3.inputs['Distance'].default_value = 0.25
    a1 = maprange(ao1.outputs['AO'], 0, 1, 0.50, 1.0); a2 = maprange(ao2.outputs['AO'], 0, 1, 0.70, 1.0); a3 = maprange(ao3.outputs['AO'], 0, 1, 0.80, 1.0)
    def noise(scale, detail, rough, lo, hi, vec=None):
        n = N('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(vec if vec is not None else tc.outputs['Object'], n.inputs['Vector']); return maprange(n.outputs['Fac'], lo, hi, 0.0, 1.0)
    mp = N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (60.0, 1.4, 60.0); links.new(tc.outputs['Object'], mp.inputs['Vector'])
    streak = noise(1.0, 4.0, 0.62, 0.40, 0.70, vec=mp.outputs['Vector'])
    patchy = noise(3.0, 6.0, 0.6, 0.30, 0.72)
    gm = N('ShaderNodeMapping'); gm.inputs['Scale'].default_value = (330.0, 330.0, 330.0); links.new(tc.outputs['Object'], gm.inputs['Vector'])
    wn = N('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; links.new(gm.outputs['Vector'], wn.inputs['Vector'])
    grain = M('ADD', 1.0, M('MULTIPLY', M('SUBTRACT', wn.outputs['Value'], 0.5), 0.06))
    bev = N('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.0025; bev.samples = 6
    dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; links.new(bev.outputs['Normal'], dot.inputs[0]); links.new(geo.outputs['Normal'], dot.inputs[1])
    edge = maprange(dot.outputs['Value'], 1.0, 0.93, 0.0, 1.0)
    bev2 = N('ShaderNodeBevel'); bev2.inputs['Radius'].default_value = 0.010; bev2.samples = 6
    dot2 = N('ShaderNodeVectorMath'); dot2.operation = 'DOT_PRODUCT'; links.new(bev2.outputs['Normal'], dot2.inputs[0]); links.new(geo.outputs['Normal'], dot2.inputs[1])
    zone = maprange(dot2.outputs['Value'], 1.0, 0.90, 0.0, 1.0)
    chip = M('MULTIPLY', zone, noise(30.0, 5.0, 0.6, 0.48, 0.62))
    scuff = M('MULTIPLY', noise(6.0, 7.0, 0.62, 0.56, 0.74), M('ADD', 0.4, M('MULTIPLY', streak, 0.6)))
    # ржавые точки (музейная краска на ref_01–03: мелкие рыжие крапины, у кромок и болтов — потёки)
    speck = M('MULTIPLY', noise(90.0, 3.0, 0.5, 0.70, 0.78), noise(5.0, 3.0, 0.5, 0.45, 0.70))
    GRIME, RUST = (0.10, 0.09, 0.07), (0.22, 0.09, 0.03)
    c = rgb(col)
    if painted:
        light = mixc(rgb(col), gray(1.25), 1.0, 'MULTIPLY')
        c = mixc(c, light, M('MULTIPLY', scuff, 0.40 * PV['wear']))
        c = mixc(c, rgb(GRIME), M('MULTIPLY', M('MULTIPLY', streak, M('ADD', 0.25, M('MULTIPLY', patchy, 0.75))), 0.30 * PV['grime']))
        c = mixc(c, rgb(PV['metal']), M('MULTIPLY', M('ADD', M('MULTIPLY', edge, 0.6), chip, clamp=True), 0.75 * PV['chips']))
        c = mixc(c, rgb(RUST), M('MULTIPLY', M('ADD', speck, M('MULTIPLY', M('MULTIPLY', edge, patchy), 0.5), clamp=True), 0.85 * PV['rust']))
        dome, halo, hole = rivet_nodes(nodes, links, sep)
        c = mixc(c, gray(M('SUBTRACT', 1.0, M('MULTIPLY', M('MULTIPLY', halo, M('SUBTRACT', 1.0, dome)), 0.35))), 1.0, 'MULTIPLY')
        c = mixc(c, rgb((0.02, 0.02, 0.02)), hole)
    c = mixc(c, gray(M('MULTIPLY', M('MULTIPLY', a1, a2), a3)), 1.0, 'MULTIPLY')
    c = mixc(c, gray(grain), 1.0, 'MULTIPLY')
    emi = N('ShaderNodeEmission'); links.new(c, emi.inputs['Color'])
    links.new(emi.outputs['Emission'], out.inputs['Surface'])
    tex = N('ShaderNodeTexImage'); tex.image = img
    for n in nodes: n.select = False
    tex.select = True; nodes.active = tex
    return out, prin, tex, col


rig = {m.name: build_pattern(m) for m in mats}
log('шейдеры запекания готовы, окраска', PAINT)

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
    k_fine, bev_r = {'F1K_body': (0.30, 0.0025), 'F1K_fin': (0.22, 0.0015), 'F1K_steel': (0.18, 0.0015), 'F1K_dark': (0.0, 0.001)}.get(mat.name, (0.2, 0.002))
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
    if mat.name != 'F1K_dark':
        dome, halo, hole = rivet_nodes(nodes, links, sep)
        h = add(add(h, mul(dome, 2.2)), mul(hole, -2.5))
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
npath = os.path.join(OUT, CFG['base'] + '_normal' + SUFFIX + '.png')
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


if not SUFFIX:
    lite(img, f"{CFG['tag']}_detail_{GAME_TEX}", 'JPEG', f"{CFG['base']}_detail_{GAME_TEX}.jpg", GAME_TEX); lite(nimg, f"{CFG['tag']}_normal_{GAME_NTEX}", 'PNG', f"{CFG['base']}_normal_{GAME_NTEX}.png", GAME_NTEX)
    log('облегчённые копии', GAME_TEX, '/', GAME_NTEX, 'готовы')
