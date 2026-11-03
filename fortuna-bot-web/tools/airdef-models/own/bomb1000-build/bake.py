# bake.py — запекает две текстуры AN-M65A1 (по образцу ФАБ-500М62/bake.py): цвет (bomb1000_detail.png: оливковая краска со сколами и потёками, жёлтое кольцо у носового
# взрывателя и жёлтый пояс на корме, чёрный трафарет по ref_03, затенение стыков) и карту нормалей (bomb1000_normal.png: скруглённые кромки, зерно краски).
# Нужен Cycles (на видеокарте — gpu_setup). Запускается ПОСЛЕ build.py в той же сессии:
#   M65_OUT="<папка модели>" [M65_TEX=2048] [M65_PAINT=олива|музей] Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Развёртка: корпус — одной полосой вокруг оси со швом внизу (ring_uv), остальное — смарт-проекцией; упаковка без поворота, зазор 16 px, острова сжаты к центру на 24 px.
# Трафарет — шейдером по координатам модели (проекция с бортов, текст вдоль вертикали «снизу вверх», растровый шрифт 5×7), на обоих бортах читается правильно.
import os, sys, math, time
sys.dont_write_bytecode = True
import bpy
import modelkit as mk
import numpy as np
import m65_geo as g

CFG = dict(scene='BOMB1000', env='M65', base='bomb1000', prefixes=('M65_', 'vane_'), body='M65_body', tag='M65')
OUT = os.environ.get(CFG['env'] + '_OUT')
if not OUT: raise SystemExit(f"Задай {CFG['env']}_OUT=<папка модели>")
SIZE = int(os.environ.get(CFG['env'] + '_TEX', '2048'))
NSIZE = int(os.environ.get(CFG['env'] + '_NTEX', str(SIZE)))
GAME_TEX, GAME_NTEX = int(os.environ.get(CFG['env'] + '_GAME_TEX', '512')), int(os.environ.get(CFG['env'] + '_GAME_NTEX', '512'))
PAINT = os.environ.get(CFG['env'] + '_PAINT', 'олива')
PAINTS = {'олива': (0.083, 0.085, 0.052), 'музей': (0.150, 0.145, 0.100)}       # олива — армейская (ref_02), музей — серо-оливковая музейного экземпляра (ref_03)
YELLOW = (0.80, 0.50, 0.010)
T0 = time.time()
sc = bpy.data.scenes[CFG['scene']]
if bpy.context.window: bpy.context.window.scene = sc
vl = bpy.context.view_layer
vl.update()
objs = [o for o in sc.objects if o.type == 'MESH']
body = next(o for o in objs if o.name == CFG['body'])
YB = g.Yb
for m in (bpy.data.materials['M65_body'], bpy.data.materials['M65_sheet']):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Base Color'].default_value = (*PAINTS[PAINT], 1.0)


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
try: bpy.ops.uv.pack_islands(rotate=False, margin=16.0 / SIZE, margin_method='ADD')
except TypeError:
    try: bpy.ops.uv.pack_islands(rotate=False, margin=16.0 / SIZE)
    except TypeError: bpy.ops.uv.pack_islands(margin=16.0 / SIZE)
bpy.ops.object.mode_set(mode='OBJECT')
k_in = 1.0 - 24.0 / SIZE                                 # острова не прижаты к краю атласа
for o in objs:
    for d in o.data.uv_layers.active.data: d.uv = (0.5 + (d.uv.x - 0.5) * k_in, 0.5 + (d.uv.y - 0.5) * k_in)
log('развёртка готова, объектов', len(objs), '(плоских', len(flat), '), окраска', PAINT)

# 2. картинка цвета и трафарет
old = bpy.data.images.get(CFG['tag'] + '_detail')
if old is not None: bpy.data.images.remove(old)
path = os.path.join(OUT, CFG['base'] + '_detail.png')
img = bpy.data.images.new(CFG['tag'] + '_detail', SIZE, SIZE, alpha=False)
img.generated_color = (1, 1, 1, 1)
mats = [m for m in bpy.data.materials if m.name.startswith('M65_') and m.users > 0]

GLYPH = {
    '0': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'], '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
    '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'], '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
    ' ': ['.....'] * 7,
    'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], 'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'], 'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'], 'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
    'I': ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'], 'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'], 'N': ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
    'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], 'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'], 'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], 'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
}
# блоки трафарета по ref_03: строки, центр (a от носа, м), шаг строк (м), клетка шрифта вдоль текста / поперёк (м), цвет
BLOCKS = [(['G.P.', '1000 LB.', 'AN-M65', '50-50'], 0.256, 0.056, 0.0055, 0.0056),
          (['LOT 0913', 'EXPLOSIVE', 'U.S. BOMB'], 0.491, 0.056, 0.0055, 0.0056),
          (['P.A. 7-45'], 0.744, 0.056, 0.0055, 0.0056),
          (['999 LBS.'], 1.255, 0.040, 0.0048, 0.0046),            # на жёлтом поясе
          (['17.6 CU. FT.'], 1.314, 0.040, 0.0036, 0.0040)]


def make_block(lines, line_units):
    """Растр блока: клетка 10 px, строки по центру; сглаживание размытием и мягким порогом (как у ФАБ-500). Возвращает картинку, ширину и высоту в клетках."""
    cw, ch, gap, k = 5, 7, 1, 10
    cols = max(len(s) * (cw + gap) - gap for s in lines); rows = (len(lines) - 1) * line_units + ch
    W, H = cols * k, rows * k
    A = np.zeros((H, W), dtype=np.float32)
    for li, s in enumerate(lines):
        x0 = (cols - (len(s) * (cw + gap) - gap)) // 2
        top = H - li * line_units * k                                 # первая строка — вверху картинки
        for n, chr_ in enumerate(s):
            gl = GLYPH[chr_]
            for r in range(ch):
                for c in range(cw):
                    if gl[r][c] == '#':
                        xx = (x0 + n * (cw + gap) + c) * k; yy = top - (r + 1) * k
                        A[yy:yy + k, xx:xx + k] = 1.0
    def blur(M, r):
        kk = np.ones(2 * r + 1, dtype=np.float32) / (2 * r + 1)
        M = np.apply_along_axis(lambda v: np.convolve(v, kk, mode='same'), 1, M)
        return np.apply_along_axis(lambda v: np.convolve(v, kk, mode='same'), 0, M)
    A = np.clip((blur(blur(A, 4), 3) - 0.5) / 0.18 + 0.5, 0.0, 1.0)
    im = bpy.data.images.new(CFG['tag'] + '_stencil', W, H, alpha=True)
    px = np.zeros((H, W, 4), dtype=np.float32); px[..., 3] = A
    im.pixels.foreach_set(px.ravel()); im.alpha_mode = 'STRAIGHT'
    return im, cols, rows


stencils = []
for lines, a_c, pitch, uw, uh in BLOCKS:
    im, cols, rows = make_block(lines, max(7, round(pitch / uh)))
    stencils.append((im, a_c, cols * uw, rows * uh))


def build_pattern(mat):
    nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for n in list(nodes):
        if n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): nodes.remove(n)
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL'); prin = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    col = tuple(prin.inputs['Base Color'].default_value)
    for l in list(prin.inputs['Base Color'].links): links.remove(l)
    N = lambda t: nodes.new(t)
    kind = mat.name
    soil_k = {'M65_body': 1.0, 'M65_sheet': 1.1, 'M65_steel': 0.7, 'M65_vane': 0.35}.get(kind, 1.0)
    painted = kind in ('M65_body', 'M65_sheet')
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
    ao1 = N('ShaderNodeAmbientOcclusion'); ao1.samples = 24; ao1.inputs['Distance'].default_value = 0.012
    ao2 = N('ShaderNodeAmbientOcclusion'); ao2.samples = 12; ao2.inputs['Distance'].default_value = 0.05
    ao3 = N('ShaderNodeAmbientOcclusion'); ao3.samples = 12; ao3.inputs['Distance'].default_value = 0.20
    a1 = maprange(ao1.outputs['AO'], 0, 1, 0.50, 1.0); a2 = maprange(ao2.outputs['AO'], 0, 1, 0.72, 1.0); a3 = maprange(ao3.outputs['AO'], 0, 1, 0.80, 1.0)
    def noise(scale, detail, rough, lo, hi, vec=None):
        n = N('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(vec if vec is not None else tc.outputs['Object'], n.inputs['Vector']); return maprange(n.outputs['Fac'], lo, hi, 0.0, 1.0)
    mp = N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (60.0, 1.4, 60.0); links.new(tc.outputs['Object'], mp.inputs['Vector'])
    streak = noise(1.0, 4.0, 0.62, 0.40, 0.70, vec=mp.outputs['Vector'])
    patchy = noise(4.0, 6.0, 0.6, 0.30, 0.72)
    gm = N('ShaderNodeMapping'); gm.inputs['Scale'].default_value = (330.0, 330.0, 330.0); links.new(tc.outputs['Object'], gm.inputs['Vector'])
    wn = N('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; links.new(gm.outputs['Vector'], wn.inputs['Vector'])
    grain = math_('ADD', 1.0, math_('MULTIPLY', math_('SUBTRACT', wn.outputs['Value'], 0.5), 0.06))
    bev = N('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.0020; bev.samples = 6
    dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; links.new(bev.outputs['Normal'], dot.inputs[0]); links.new(geo.outputs['Normal'], dot.inputs[1])
    edge = maprange(dot.outputs['Value'], 1.0, 0.93, 0.0, 1.0)
    bev2 = N('ShaderNodeBevel'); bev2.inputs['Radius'].default_value = 0.008; bev2.samples = 6
    dot2 = N('ShaderNodeVectorMath'); dot2.operation = 'DOT_PRODUCT'; links.new(bev2.outputs['Normal'], dot2.inputs[0]); links.new(geo.outputs['Normal'], dot2.inputs[1])
    zone = maprange(dot2.outputs['Value'], 1.0, 0.90, 0.0, 1.0)
    chip = math_('MULTIPLY', zone, noise(30.0, 5.0, 0.6, 0.50, 0.62))
    scuff = math_('MULTIPLY', noise(6.0, 7.0, 0.62, 0.56, 0.74), math_('ADD', 0.4, math_('MULTIPLY', streak, 0.6)))
    METAL = (0.16, 0.13, 0.10) if painted else ((0.55, 0.56, 0.57) if kind == 'M65_vane' else (0.26, 0.26, 0.26))
    GRIME, RUST = (0.09, 0.08, 0.06), (0.20, 0.10, 0.05)
    c = rgb(col)
    if kind == 'M65_body':                                 # жёлтое кольцо у носового взрывателя и жёлтый пояс на корме (по координате Y)
        for a0, a1 in (g.YELLOW_NOSE, g.YELLOW_TAIL):
            band = math_('MULTIPLY', math_('GREATER_THAN', sep.outputs['Y'], YB(a1)), math_('LESS_THAN', sep.outputs['Y'], YB(a0)))
            c = mixc(c, rgb(YELLOW), band)
    light = mixc(c, gray(1.30), 1.0, 'MULTIPLY')
    c = mixc(c, light, math_('MULTIPLY', scuff, 0.40))
    if painted:                                            # чёрный трафарет на обоих бортах: текст снизу вверх, верх букв — к носу на борту −X (как на ref_03)
        for im, a_c, Wt, Ht in (stencils if kind == 'M65_body' else []):
            for s in (-1.0, 1.0):
                vy = math_('MULTIPLY', sep.outputs['Y'], -s)
                cmb = N('ShaderNodeCombineXYZ'); links.new(sep.outputs['Z'], cmb.inputs['X']); links.new(vy, cmb.inputs['Y'])
                mpp = N('ShaderNodeMapping'); mpp.inputs['Scale'].default_value = (1.0 / Wt, 1.0 / Ht, 1.0)
                mpp.inputs['Location'].default_value = (0.5, 0.5 + s * YB(a_c) / Ht, 0.0)
                links.new(cmb.outputs['Vector'], mpp.inputs['Vector'])
                tx = N('ShaderNodeTexImage'); tx.image = im; tx.extension = 'CLIP'; tx.interpolation = 'Linear'; links.new(mpp.outputs['Vector'], tx.inputs['Vector'])
                side_mask = maprange(math_('MULTIPLY', gsep.outputs['X'], s), 0.30, 0.55, 0.0, 1.0)
                wear = math_('SUBTRACT', 0.93, math_('MULTIPLY', scuff, 0.25))
                c = mixc(c, rgb((0.018, 0.018, 0.016)), math_('MULTIPLY', math_('MULTIPLY', tx.outputs['Alpha'], side_mask), wear))
    c = mixc(c, rgb(GRIME), math_('MULTIPLY', math_('MULTIPLY', streak, math_('ADD', 0.25, math_('MULTIPLY', patchy, 0.75))), 0.30 * soil_k))
    c = mixc(c, rgb(METAL), math_('MULTIPLY', math_('ADD', math_('MULTIPLY', edge, 0.6), chip, clamp=True), 0.70 if painted else 0.35))
    if kind == 'M65_steel': c = mixc(c, rgb(RUST), math_('MULTIPLY', math_('MULTIPLY', streak, patchy), 0.30))
    c = mixc(c, gray(math_('MULTIPLY', math_('MULTIPLY', a1, a2), a3)), 1.0, 'MULTIPLY')
    c = mixc(c, gray(grain), 1.0, 'MULTIPLY')
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
import gpu_setup
log('Cycles:', gpu_setup.use_gpu(sc)); sc.cycles.samples = 24
try: sc.cycles.use_denoising = False
except Exception: pass
for o in vl.objects: o.select_set(False)
for o in objs: o.select_set(True)
vl.objects.active = objs[0]
bpy.ops.object.bake(type='EMIT', width=SIZE, height=SIZE, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
log('запекание цвета готово')
img.filepath_raw = path; img.file_format = 'PNG'; img.save(); img.pack()


def seam_check(image, thr=0.12, steps=17):
    W_, H_ = image.size
    px = np.array(image.pixels[:], dtype=np.float32).reshape(H_, W_, 4)[..., :3].mean(axis=2)
    def samp(u, v):
        x, y = u * W_ - 0.5, v * H_ - 0.5; x0, y0 = int(math.floor(x)), int(math.floor(y)); fx, fy = x - x0, y - y0
        gg = lambda xx, yy: px[min(max(yy, 0), H_ - 1), min(max(xx, 0), W_ - 1)]
        return (gg(x0, y0) * (1 - fx) + gg(x0 + 1, y0) * fx) * (1 - fy) + (gg(x0, y0 + 1) * (1 - fx) + gg(x0 + 1, y0 + 1) * fx) * fy
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
    k_fine, bev_r = {'M65_body': (0.28, 0.0025), 'M65_sheet': (0.22, 0.0012), 'M65_steel': (0.12, 0.0010), 'M65_vane': (0.05, 0.0004)}.get(mat.name, (0.2, 0.002))
    tc = nodes.new('ShaderNodeTexCoord')
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
for im in [i for i in bpy.data.images if i.name.startswith(CFG['tag'] + '_stencil')]: bpy.data.images.remove(im)
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
