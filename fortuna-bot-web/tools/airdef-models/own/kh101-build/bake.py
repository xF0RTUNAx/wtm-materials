# bake.py - запекает текстуры Х-101: цвет (kh101_detail.png: серая краска, по варианту - зелёная вставка с неровным краем, швы, метки, люки, свои надписи, износ без грязи) и карту нормалей (kh101_normal.png).
# Запускается ПОСЛЕ build.py: K101_OUT="<папка>" [K101_TEX=2048] [K101_PAINT=зелёная|серая] Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Координаты шейдера - положение в мире (у подвижных частей начало смещено на ось). Развёртка: корпус полосой со швом снизу (сверху нет шва), остальное смарт-проекцией.
import os, sys, math, time
sys.dont_write_bytecode = True
import bpy
import modelkit as mk
import numpy as np

OUT = os.environ.get('K101_OUT')
if not OUT: raise SystemExit('Задай K101_OUT=<папка модели>')
SIZE = int(os.environ.get('K101_TEX', '2048')); NSIZE = int(os.environ.get('K101_NTEX', str(SIZE)))
GAME_TEX, GAME_NTEX = int(os.environ.get('K101_GAME_TEX', '1024')), int(os.environ.get('K101_GAME_NTEX', '512'))
VARIANT = os.environ.get('K101_PAINT', 'зелёная')
GREY = {'зелёная': (0.38, 0.435, 0.53), 'серая': (0.40, 0.415, 0.425)}[VARIANT]
GREEN = (0.12, 0.18, 0.145)
T0 = time.time()
sc = bpy.data.scenes['KH101']
if bpy.context.window: bpy.context.window.scene = sc
vl = bpy.context.view_layer; vl.update()
objs = [o for o in sc.objects if o.type == 'MESH']
body = next(o for o in objs if o.name == 'K101_body')
S, Yx = mk.S, mk.Y
G = mk.GEO
NSEG = G['NSEG']; RB = G['RB']


def log(*a): print(f'[{time.time() - T0:5.1f} с]', *a, flush=True)


def ring_uv(o, n):
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
        ang = [math.atan2(c.x, -c.z) for c in cos]
        a0 = ang[0]; ang = [a if abs(a - a0) <= math.pi else a + (2 * math.pi if a0 - a > 0 else -2 * math.pi) for a in ang]
        for i, a, ri in zip(li, ang, rings): uvd[i].uv = (a * max(rr[ri], 0.004), vv[ri])


for o in vl.objects: o.select_set(False)
for o in objs:
    while len(o.data.uv_layers) > 0: o.data.uv_layers.remove(o.data.uv_layers[0])
    o.data.uv_layers.new(name='UVMap')
ring_uv(body, NSEG)
flat = [o for o in objs if o is not body]
for o in flat: o.select_set(True)
vl.objects.active = flat[0]
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.object.mode_set(mode='OBJECT')
for o in vl.objects: o.select_set(False)
for o in objs: o.select_set(True)
vl.objects.active = objs[0]
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
try: bpy.ops.uv.average_islands_scale()
except Exception as e: print('average_islands_scale:', e)
try: bpy.ops.uv.pack_islands(rotate=False, margin=16.0 / SIZE, margin_method='ADD')
except TypeError:
    try: bpy.ops.uv.pack_islands(rotate=False, margin=16.0 / SIZE)
    except TypeError: bpy.ops.uv.pack_islands(margin=16.0 / SIZE)
bpy.ops.object.mode_set(mode='OBJECT')
k_in = 1.0 - 24.0 / SIZE
for o in objs:
    for d in o.data.uv_layers.active.data: d.uv = (0.5 + (d.uv.x - 0.5) * k_in, 0.5 + (d.uv.y - 0.5) * k_in)
log('развёртка готова, объектов', len(objs))

old = bpy.data.images.get('K101_detail')
if old is not None: bpy.data.images.remove(old)
path = os.path.join(OUT, 'kh101_detail.png')
img = bpy.data.images.new('K101_detail', SIZE, SIZE, alpha=False); img.generated_color = (1, 1, 1, 1)
mats = [m for m in bpy.data.materials if m.name in ('K101_body', 'K101_steel')]
GLYPH = {
    '0': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'], '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
    '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'], ' ': ['.....'] * 7, '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
    'Х': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'], 'К': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    'А': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], 'Б': ['#####', '#....', '#....', '####.', '#...#', '#...#', '####.'],
    'Л': ['..###', '.#..#', '.#..#', '.#..#', '.#..#', '#...#', '#...#'], 'Ю': ['#..#.', '#.#.#', '#.#.#', '###.#', '#.#.#', '#.#.#', '#..#.'],
    'Н': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], 'Е': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    'С': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'], 'Т': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    'О': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], 'Р': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    'Я': ['.####', '#...#', '#...#', '.####', '..#.#', '.#..#', '#...#'], 'П': ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#'],
    'М': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'], 'В': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    'Г': ['#####', '#....', '#....', '#....', '#....', '#....', '#....'], 'И': ['#...#', '#..##', '#.#.#', '##..#', '#...#', '#...#', '#...#'],
}
BLOCKS = [(['Х-101', 'РЯ-07-08', 'В 0920 Г'], 150.0, 0.26, 0.0072, (-1.0, 1.0)), (['ЛЮК 4'], 332.0, 0.180, 0.0052, (-1.0, 1.0)), (['ЛЮК 5'], 488.0, 0.170, 0.0052, (-1.0, 1.0)), (['ТОПЛИВО', 'ТС-1'], 415.0, 0.235, 0.0060, (-1.0, 1.0)), (['ОПЛ', '2.2-5'], 548.0, 0.150, 0.0052, (-1.0, 1.0))]


def make_block(lines, line_units=9):
    cw, ch, gap, k = 5, 7, 1, 10
    cols = max(len(s) * (cw + gap) - gap for s in lines); rows = (len(lines) - 1) * line_units + ch
    W, H = cols * k, rows * k
    A = np.zeros((H, W), dtype=np.float32)
    for li, s in enumerate(lines):
        top = H - li * line_units * k
        for n, chr_ in enumerate(s):
            gl = GLYPH[chr_]
            for r in range(ch):
                for c in range(cw):
                    if gl[r][c] == '#':
                        xx = (n * (cw + gap) + c) * k; yy = top - (r + 1) * k
                        A[yy:yy + k, xx:xx + k] = 1.0
    def blur(M, r):
        kk = np.ones(2 * r + 1, dtype=np.float32) / (2 * r + 1)
        M = np.apply_along_axis(lambda v: np.convolve(v, kk, mode='same'), 1, M)
        return np.apply_along_axis(lambda v: np.convolve(v, kk, mode='same'), 0, M)
    A = np.clip((blur(blur(A, 4), 3) - 0.5) / 0.18 + 0.5, 0.0, 1.0)
    im = bpy.data.images.new('K101_stencil', W, H, alpha=True)
    px = np.zeros((H, W, 4), dtype=np.float32); px[..., 3] = A
    im.pixels.foreach_set(px.ravel()); im.alpha_mode = 'STRAIGHT'
    return im, cols, rows


BLOCK_IM = [(make_block(l), x, z, c, sd) for l, x, z, c, sd in BLOCKS]


def node_math(nodes, links):
    def math_(op, a=None, b=None, c=None, clamp=False):
        n = nodes.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate((a, b, c)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: links.new(v, n.inputs[i])
        return n.outputs['Value']
    return math_


def ramp(nodes, links, v, f0, f1):
    n = nodes.new('ShaderNodeMapRange'); n.clamp = True
    n.inputs['From Min'].default_value = f0; n.inputs['From Max'].default_value = f1; n.inputs['To Min'].default_value = 0.0; n.inputs['To Max'].default_value = 1.0
    links.new(v, n.inputs['Value']); return n.outputs['Result']


def coords(nodes, links):
    geo = nodes.new('ShaderNodeNewGeometry'); sep = nodes.new('ShaderNodeSeparateXYZ'); links.new(geo.outputs['Position'], sep.inputs['Vector'])
    return geo, sep


def marks(nodes, links, sep):
    """Швы, короткие двойные метки, крестики, люки, ряды заклёпок. Выход: (линия 0…1, метка - сильно чёрная 0…1, головка 0…1)."""
    M = node_math(nodes, links); R = lambda v, a, b: ramp(nodes, links, v, a, b)
    X, Yc, Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    rho = M('SQRT', M('ADD', M('MULTIPLY', X, X), M('MULTIPLY', Z, Z)))
    xpx = M('SUBTRACT', mk.X0, M('DIVIDE', Yc, S))
    on_hull = M('LESS_THAN', rho, (RB + 1.3) * S)
    line = None
    for xs in G['SEAMS']:
        d = M('MULTIPLY', M('ABSOLUTE', M('SUBTRACT', xpx, xs)), S)
        rg = M('LESS_THAN', rho, 15.0 * S) if xs > 600.0 else on_hull          # у хвоста шов не заходит на киль и стабилизаторы
        l = M('MULTIPLY', R(d, 0.0060, 0.0028), rg)
        line = l if line is None else M('MAXIMUM', line, l)
    # косой стык на сужении хвоста (референс_1)
    tilt = M('ADD', 590.0, M('MULTIPLY', M('DIVIDE', Z, S), -0.28))
    d = M('MULTIPLY', M('ABSOLUTE', M('SUBTRACT', xpx, tilt)), S)
    line = M('MAXIMUM', line, M('MULTIPLY', R(d, 0.0060, 0.0028), M('LESS_THAN', rho, 22.0 * S)))
    # линия на киле и стабилизаторах (референс_1)
    d = M('MULTIPLY', M('ABSOLUTE', M('SUBTRACT', M('DIVIDE', rho, S), 36.0)), S)
    line = M('MAXIMUM', line, M('MULTIPLY', R(d, 0.0060, 0.0028), M('GREATER_THAN', xpx, 603.0)))
    # длинная панельная линия вдоль борта и верхняя (референсы 2, 3)
    for z0, x0, x1 in ((0.065, 105.0, 275.0), (0.065, 350.0, 470.0), (0.23, 225.0, 280.0)):
        d = M('ABSOLUTE', M('SUBTRACT', Z, z0))
        gate = M('MULTIPLY', M('GREATER_THAN', xpx, x0), M('LESS_THAN', xpx, x1))
        line = M('MAXIMUM', line, M('MULTIPLY', M('MULTIPLY', R(d, 0.0045, 0.0022), gate), on_hull))
    # круглые люки на обоих бортах
    for xc, zc, rc in ((500.0, 0.10, 0.065), (385.0, 0.135, 0.055), (215.0, 0.15, 0.055), (610.0, 0.02, 0.040)):
        dy = M('SUBTRACT', Yc, Yx(xc)); dz = M('SUBTRACT', Z, zc)
        dd = M('SQRT', M('ADD', M('MULTIPLY', dy, dy), M('MULTIPLY', dz, dz)))
        line = M('MAXIMUM', line, M('MULTIPLY', R(M('ABSOLUTE', M('SUBTRACT', dd, rc)), 0.0050, 0.0024), on_hull))
    # длинные люки
    for (x0, x1, z0, z1) in ((520.0, 566.0, -0.13, -0.03), (190.0, 228.0, -0.02, 0.09)):
        y0, y1 = sorted((Yx(x0), Yx(x1)))
        inner = M('MINIMUM', M('MINIMUM', M('SUBTRACT', Yc, y0), M('SUBTRACT', y1, Yc)), M('MINIMUM', M('SUBTRACT', Z, z0), M('SUBTRACT', z1, Z)))
        line = M('MAXIMUM', line, M('MULTIPLY', R(M('ABSOLUTE', inner), 0.0050, 0.0024), on_hull))
    # короткие двойные метки подвеса: на двух станциях, дугами на верхе и по бокам
    ang = M('ABSOLUTE', M('ARCTAN2', X, Z))                                    # 0 - верх, π/2 - борт, π - низ
    arc = M('MULTIPLY', M('GREATER_THAN', ang, 0.45), M('LESS_THAN', ang, 1.20))
    arc2 = M('MULTIPLY', M('GREATER_THAN', ang, 1.75), M('LESS_THAN', ang, 2.25))
    arc3 = M('LESS_THAN', ang, 0.16)
    mk_ = None
    for xc in G['BANDS']:
        for dx in (-3.0, 3.0):
            dd = M('MULTIPLY', M('ABSOLUTE', M('SUBTRACT', xpx, xc + dx)), S)
            l = M('MULTIPLY', R(dd, 0.0100, 0.0065), M('MAXIMUM', M('MAXIMUM', arc, arc2), arc3))
            mk_ = l if mk_ is None else M('MAXIMUM', mk_, l)
    mk_ = M('MULTIPLY', mk_, on_hull)
    # крестики и чёрточки сверху-сбоку (референсы 2, 3)
    az = M('ABSOLUTE', X)
    for xc in (300.0, 323.0, 362.0):
        dy = M('ABSOLUTE', M('SUBTRACT', Yc, Yx(xc))); dz = M('ABSOLUTE', M('SUBTRACT', Z, 0.155))
        cr = M('MAXIMUM', M('MULTIPLY', R(dy, 0.0060, 0.0030), R(dz, 0.020, 0.018)), M('MULTIPLY', R(dz, 0.0060, 0.0030), R(dy, 0.020, 0.018)))
        tick = M('MULTIPLY', R(dy, 0.0045, 0.0022), M('MULTIPLY', M('GREATER_THAN', Z, 0.185), M('LESS_THAN', Z, 0.255)))
        mk_ = M('MAXIMUM', mk_, M('MULTIPLY', M('MAXIMUM', cr, tick), on_hull))
    # заклёпки вдоль швов секций и у стыка на хвосте
    ga = M('ARCTAN2', X, Z); st = math.pi / 18
    a36 = M('SUBTRACT', ga, M('MULTIPLY', M('ROUND', M('DIVIDE', ga, st)), st)); arcd = M('MULTIPLY', a36, RB * S)
    head = None
    for xs in (102.0, 141.0, 275.0, 413.0, 466.0, 474.0):
        dy = M('MULTIPLY', M('SUBTRACT', xpx, xs), S)
        dd = M('SQRT', M('ADD', M('MULTIPLY', arcd, arcd), M('MULTIPLY', dy, dy)))
        l = M('MULTIPLY', R(dd, 0.0078, 0.0036), on_hull)
        head = l if head is None else M('MAXIMUM', head, l)
    return line, mk_, head


def build_pattern(mat):
    nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for n in list(nodes):
        if n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): nodes.remove(n)
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL'); prin = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    kind = mat.name
    col = GREY if kind == 'K101_body' else tuple(prin.inputs['Base Color'].default_value)[:3]
    prin.inputs['Base Color'].default_value = (*col, 1.0)
    for l in list(prin.inputs['Base Color'].links): links.remove(l)
    N = lambda t: nodes.new(t)
    M = node_math(nodes, links)
    def maprange(src, fmin, fmax, tmin, tmax):
        n = N('ShaderNodeMapRange'); n.clamp = True
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
    geo, sep = coords(nodes, links)
    X, Yc, Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    pos = geo.outputs['Position']
    gsep = N('ShaderNodeSeparateXYZ'); links.new(geo.outputs['Normal'], gsep.inputs['Vector'])
    ao1 = N('ShaderNodeAmbientOcclusion'); ao1.samples = 24; ao1.inputs['Distance'].default_value = 0.012
    ao2 = N('ShaderNodeAmbientOcclusion'); ao2.samples = 12; ao2.inputs['Distance'].default_value = 0.07
    a1 = maprange(ao1.outputs['AO'], 0, 1, 0.42, 1.0); a2 = maprange(ao2.outputs['AO'], 0, 1, 0.68, 1.0)
    def noise(scale, detail, rough, lo, hi):
        n = N('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(pos, n.inputs['Vector']); return maprange(n.outputs['Fac'], lo, hi, 0.0, 1.0)
    gm = N('ShaderNodeMapping'); gm.inputs['Scale'].default_value = (240.0, 240.0, 240.0); links.new(pos, gm.inputs['Vector'])
    wn = N('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; links.new(gm.outputs['Vector'], wn.inputs['Vector'])
    grain = M('ADD', 1.0, M('MULTIPLY', M('SUBTRACT', wn.outputs['Value'], 0.5), 0.04))
    bev = N('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.0035; bev.samples = 6
    dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; links.new(bev.outputs['Normal'], dot.inputs[0]); links.new(geo.outputs['Normal'], dot.inputs[1])
    edge = maprange(dot.outputs['Value'], 1.0, 0.93, 0.0, 1.0)
    bev2 = N('ShaderNodeBevel'); bev2.inputs['Radius'].default_value = 0.014; bev2.samples = 6
    dot2 = N('ShaderNodeVectorMath'); dot2.operation = 'DOT_PRODUCT'; links.new(bev2.outputs['Normal'], dot2.inputs[0]); links.new(geo.outputs['Normal'], dot2.inputs[1])
    zone = maprange(dot2.outputs['Value'], 1.0, 0.90, 0.0, 1.0)
    chip = M('MULTIPLY', zone, noise(18.0, 5.0, 0.6, 0.54, 0.66))
    scuff = noise(3.0, 7.0, 0.62, 0.50, 0.72); patch = noise(0.9, 4.0, 0.55, 0.38, 0.66); fine = noise(28.0, 4.0, 0.6, 0.38, 0.66)
    rho = M('SQRT', M('ADD', M('MULTIPLY', X, X), M('MULTIPLY', Z, Z)))
    xpx = M('SUBTRACT', mk.X0, M('DIVIDE', Yc, S))
    c = rgb(col)
    if kind == 'K101_body':
        tone = 1.0
        for xs, k_t in ((97.0, 1.04), (145.0, 0.97), (279.0, 1.03), (409.0, 0.96), (470.0, 1.05), (590.0, 0.95)):
            tone = M('MULTIPLY', tone, M('ADD', 1.0, M('MULTIPLY', M('GREATER_THAN', xpx, xs), k_t - 1.0)))
        c = mixc(c, gray(tone), 1.0, 'MULTIPLY')
        if VARIANT == 'зелёная':                                # зелёная вставка с неровным краем (референс_1)
            wob = N('ShaderNodeTexNoise'); wob.inputs['Scale'].default_value = 2.2; wob.inputs['Detail'].default_value = 3.0; links.new(pos, wob.inputs['Vector'])
            w_ = M('MULTIPLY', M('SUBTRACT', wob.outputs['Fac'], 0.5), 26.0)
            gx0, gx1 = G['GREEN']
            band = M('MULTIPLY', ramp(nodes, links, M('SUBTRACT', M('ADD', xpx, w_), gx0), -0.4, 0.4), ramp(nodes, links, M('SUBTRACT', M('ADD', xpx, w_), gx1), 0.4, -0.4))
            on_b = M('MULTIPLY', M('LESS_THAN', rho, 40.0 * S), M('GREATER_THAN', Z, -26.75 * S))
            c = mixc(c, rgb(GREEN), M('MULTIPLY', band, on_b))
        # гондола темнее (референс_1)
        nac = M('MULTIPLY', M('LESS_THAN', Z, (G['C_Z'] + 18.0) * S), M('GREATER_THAN', xpx, 505.0))
        c = mixc(c, mixc(c, gray(0.62), 1.0, 'MULTIPLY'), nac)
        c = mixc(c, mixc(c, gray(1.26), 1.0, 'MULTIPLY'), M('MULTIPLY', scuff, 0.50))
        c = mixc(c, mixc(c, gray(0.80), 1.0, 'MULTIPLY'), M('MULTIPLY', patch, 0.50))
        c = mixc(c, mixc(c, gray(1.12), 1.0, 'MULTIPLY'), M('MULTIPLY', fine, 0.40))
        mp = N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (45.0, 0.9, 45.0); links.new(pos, mp.inputs['Vector'])
        nst = N('ShaderNodeTexNoise'); nst.inputs['Scale'].default_value = 1.0; nst.inputs['Detail'].default_value = 5.0; nst.inputs['Roughness'].default_value = 0.62; links.new(mp.outputs['Vector'], nst.inputs['Vector'])
        streak = maprange(nst.outputs['Fac'], 0.44, 0.70, 0.0, 1.0)
        c = mixc(c, mixc(c, gray(0.86), 1.0, 'MULTIPLY'), M('MULTIPLY', streak, 0.45))
        ms = N('ShaderNodeMapping'); ms.inputs['Scale'].default_value = (260.0, 4.0, 260.0); links.new(pos, ms.inputs['Vector'])
        nsc = N('ShaderNodeTexNoise'); nsc.inputs['Scale'].default_value = 1.0; nsc.inputs['Detail'].default_value = 3.0; links.new(ms.outputs['Vector'], nsc.inputs['Vector'])
        scr = M('MULTIPLY', maprange(nsc.outputs['Fac'], 0.66, 0.74, 0.0, 1.0), noise(1.8, 3.0, 0.5, 0.5, 0.7))
        c = mixc(c, rgb((0.55, 0.57, 0.60)), M('MULTIPLY', scr, 0.5))
        # надписи
        for (imt, cl_, rw_), xs_, zs_, cell_, sides_ in BLOCK_IM:
            wt, ht = cl_ * cell_, rw_ * cell_; ybs = Yx(xs_)
            for s in sides_:
                u = M('DIVIDE', M('MULTIPLY', M('SUBTRACT', Yc, ybs if s < 0 else (ybs - wt)), s), wt)
                v = M('ADD', 1.0, M('DIVIDE', M('SUBTRACT', Z, zs_), ht))
                cmb = N('ShaderNodeCombineXYZ'); links.new(u, cmb.inputs['X']); links.new(v, cmb.inputs['Y'])
                tx = N('ShaderNodeTexImage'); tx.image = imt; tx.extension = 'CLIP'; tx.interpolation = 'Linear'; links.new(cmb.outputs['Vector'], tx.inputs['Vector'])
                c = mixc(c, rgb((0.015, 0.016, 0.018)), M('MULTIPLY', M('MULTIPLY', tx.outputs['Alpha'], maprange(M('MULTIPLY', gsep.outputs['X'], s), 0.08, 0.2, 0.0, 1.0)), 0.88))
        line, mk_, head = marks(nodes, links, sep)
        # красно-белая метка у носа на борту (референс 2, 3): маленький треугольник
        c = mixc(c, mixc(c, gray(1.3), 1.0, 'MULTIPLY'), M('MULTIPLY', head, 0.5))
        c = mixc(c, rgb((0.02, 0.021, 0.024)), M('MULTIPLY', line, 0.90))
        c = mixc(c, rgb((0.012, 0.012, 0.013)), mk_)
        # линия на киле и стабилизаторах (референс_1): нижняя часть темнее
        c = mixc(c, mixc(c, gray(0.84), 1.0, 'MULTIPLY'), M('MULTIPLY', M('GREATER_THAN', xpx, 603.0), M('MULTIPLY', M('GREATER_THAN', rho, 14.0 * S), M('LESS_THAN', rho, 35.0 * S))))
        c = mixc(c, rgb((0.50, 0.52, 0.54)), M('MULTIPLY', M('ADD', M('MULTIPLY', edge, 0.5), M('MULTIPLY', chip, 0.75), clamp=True), 0.70))
    else:                                                        # сталь: кок вентилятора светлый, лопатки и упоры - металл
        c = mixc(c, rgb((0.34, 0.32, 0.28)), M('GREATER_THAN', M('SUBTRACT', mk.X0, M('DIVIDE', Yc, S)), 505.0))
        c = mixc(c, rgb((0.52, 0.46, 0.34)), M('MULTIPLY', M('LESS_THAN', M('SQRT', M('ADD', M('MULTIPLY', X, X), M('MULTIPLY', M('SUBTRACT', Z, G['C_Z'] * S), M('SUBTRACT', Z, G['C_Z'] * S)))), 6.8 * S), M('LESS_THAN', M('SUBTRACT', mk.X0, M('DIVIDE', Yc, S)), 518.0)))
        lug = M('GREATER_THAN', Z, 0.2)
        c = mixc(c, rgb((0.10, 0.10, 0.11)), lug)
        c = mixc(c, mixc(c, gray(0.75), 1.0, 'MULTIPLY'), M('MULTIPLY', scuff, 0.5))
        c = mixc(c, rgb((0.50, 0.50, 0.50)), M('MULTIPLY', edge, 0.4))
    c = mixc(c, gray(M('MULTIPLY', a1, a2)), 1.0, 'MULTIPLY')
    c = mixc(c, gray(grain), 1.0, 'MULTIPLY')
    emi = N('ShaderNodeEmission'); links.new(c, emi.inputs['Color'])
    links.new(emi.outputs['Emission'], out.inputs['Surface'])
    tex = N('ShaderNodeTexImage'); tex.image = img
    for n in nodes: n.select = False
    tex.select = True; nodes.active = tex
    return out, prin, tex, col


rig = {m.name: build_pattern(m) for m in mats}
log('шейдеры готовы, окраска:', VARIANT)
sys.path.insert(0, '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/_инструменты')
import gpu_setup
log('Cycles:', gpu_setup.use_gpu(sc)); sc.cycles.samples = 24
try: sc.cycles.use_denoising = False
except Exception: pass
for o in vl.objects: o.select_set(False)
for o in objs: o.select_set(True)
vl.objects.active = objs[0]
bpy.ops.object.bake(type='EMIT', width=SIZE, height=SIZE, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
img.filepath_raw = path; img.file_format = 'PNG'; img.save(); img.pack()
log('цвет сохранён', path)


def build_relief(mat, entry):
    out, prin, tex, col = entry; nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for l in list(out.inputs['Surface'].links): links.remove(l)
    links.new(prin.outputs['BSDF'], out.inputs['Surface'])
    k_fine, bev_r = {'K101_body': (0.26, 0.0035), 'K101_steel': (0.14, 0.002)}[mat.name]
    geo, sep = coords(nodes, links)
    bev = nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = bev_r; bev.samples = 10
    def noise(scale, detail, rough):
        n = nodes.new('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(geo.outputs['Position'], n.inputs['Vector']); return n.outputs['Fac']
    M = node_math(nodes, links)
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.003; bump.inputs['Strength'].default_value = 1.0
    h = M('ADD', M('MULTIPLY', noise(90.0, 3.0, 0.55), 0.50 * k_fine), M('MULTIPLY', noise(8.0, 3.0, 0.5), 0.55 * k_fine))
    if mat.name == 'K101_body':
        line, mk_, head = marks(nodes, links, sep)
        h = M('ADD', M('ADD', h, M('MULTIPLY', head, 2.0)), M('MULTIPLY', line, -1.8))
    links.new(h, bump.inputs['Height'])
    links.new(bev.outputs['Normal'], bump.inputs['Normal'])
    links.new(bump.outputs['Normal'], prin.inputs['Normal'])


nimg = bpy.data.images.get('K101_normal')
if nimg is not None: bpy.data.images.remove(nimg)
nimg = bpy.data.images.new('K101_normal', NSIZE, NSIZE, alpha=False)
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
npath = os.path.join(OUT, 'kh101_normal.png')
nimg.filepath_raw = npath; nimg.file_format = 'PNG'; nimg.save(); nimg.pack()
for m in mats:
    out, prin, tex, col = rig[m.name]; nt = m.node_tree; ntx = ntex_of[m.name]
    for l in list(prin.inputs['Normal'].links): nt.links.remove(l)
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.space = 'TANGENT'; nm.uv_map = 'UVMap'; nm.inputs['Strength'].default_value = 1.0
    keep = {out, prin, tex, ntx, nm}
    for n in list(nt.nodes):
        if n not in keep: nt.nodes.remove(n)
    nt.links.new(tex.outputs['Color'], prin.inputs['Base Color'])
    nt.links.new(ntx.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], prin.inputs['Normal'])
for im in [i for i in bpy.data.images if i.name.startswith('K101_stencil')]: bpy.data.images.remove(im)
log('материалы подключены')


def lite(image, name, fmt, fname, px):
    c = image.copy(); c.name = name; c.scale(px, px); c.file_format = fmt
    p_ = os.path.join(OUT, fname)
    try: c.save(filepath=p_, quality=92)
    except TypeError:
        c.filepath_raw = p_; c.save()
    bpy.data.images.remove(c)
    return p_


lite(img, f'K101_detail_{GAME_TEX}', 'JPEG', f'kh101_detail_{GAME_TEX}.jpg', GAME_TEX); lite(nimg, f'K101_normal_{GAME_NTEX}', 'PNG', f'kh101_normal_{GAME_NTEX}.png', GAME_NTEX)
log('облегчённые копии готовы')
