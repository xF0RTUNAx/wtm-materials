# bake.py - запекает текстуры КАБ-500Кр: цвет (kab500kr_detail.png: серо-голубая краска как на крупном фото, швы, заклёпки, болты, лючки, рыжие колодки, свои надписи, лёгкий износ без грязи)
# и карту нормалей (kab500kr_normal.png: кромки, зерно краски, швы, заклёпки). Образец - Mk 82/bake.py и AGM-65B/bake.py.
# Запускается ПОСЛЕ build.py: K5K_OUT="<папка>" [K5K_TEX=2048] [K5K_RED=1|0] Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# K5K_RED=1 - красная полоса на задней кромке хвостовых крыльев и красная крышка сверху, 0 - без них (крышка белая). Надписи свои, с картинок пиксели не берём.
# Координаты шейдера - положение в мире: у рулей и крыльев начало смещено на ось. Стекло, сетка, головка и вилка - плоские материалы без текстуры.
import os, sys, math, time
sys.dont_write_bytecode = True
import bpy
import modelkit as mk
import numpy as np

OUT = os.environ.get('K5K_OUT')
if not OUT: raise SystemExit('Задай K5K_OUT=<папка модели>')
SIZE = int(os.environ.get('K5K_TEX', '2048'))
NSIZE = int(os.environ.get('K5K_NTEX', str(SIZE)))
GAME_TEX, GAME_NTEX = int(os.environ.get('K5K_GAME_TEX', '1024')), int(os.environ.get('K5K_GAME_NTEX', '512'))
RED = os.environ.get('K5K_RED', '1') == '1'
PAINT = tuple(float(v) for v in os.environ.get('K5K_PAINT', '0.15,0.17,0.195').split(','))
T0 = time.time()
sc = bpy.data.scenes['KAB500KR']
if bpy.context.window: bpy.context.window.scene = sc
vl = bpy.context.view_layer; vl.update()
FLATOBJ = ('K5K_glass', 'K5K_grid', 'K5K_head', 'K5K_gimbal')  # K5K_bay с цветом в атласе
allm = [o for o in sc.objects if o.type == 'MESH']
objs = [o for o in allm if o.name not in FLATOBJ]
body = next(o for o in objs if o.name == 'K5K_body')
S, Yx = mk.S, mk.Y
G = mk.GEO
NSEG = G['NSEG']; RB = G['RB']


def log(*a): print(f'[{time.time() - T0:5.1f} с]', *a, flush=True)


# 1. развёртка
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
for o in allm:
    while len(o.data.uv_layers) > 0: o.data.uv_layers.remove(o.data.uv_layers[0])
    o.data.uv_layers.new(name='UVMap')
ring_uv(body, NSEG)
flat = [o for o in objs if o is not body]
for o in flat: o.select_set(True)
vl.objects.active = flat[0]
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
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

# 2. картинка цвета и надписи
old = bpy.data.images.get('K5K_detail')
if old is not None: bpy.data.images.remove(old)
path = os.path.join(OUT, 'kab500kr_detail.png')
img = bpy.data.images.new('K5K_detail', SIZE, SIZE, alpha=False); img.generated_color = (1, 1, 1, 1)
mats = [m for m in bpy.data.materials if m.name in ('K5K_body', 'K5K_steel', 'K5K_block')]
GLYPH = {
    '0': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'], '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
    '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'], ' ': ['.....'] * 7,
    'К': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'], 'А': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'Б': ['#####', '#....', '#....', '####.', '#...#', '#...#', '####.'], 'р': ['.....', '.....', '####.', '#...#', '####.', '#....', '#....'],
    'Л': ['..###', '.#..#', '.#..#', '.#..#', '.#..#', '#...#', '#...#'], 'Ю': ['#..#.', '#.#.#', '#.#.#', '###.#', '#.#.#', '#.#.#', '#..#.'],
    'Н': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], 'Е': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    'С': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'], 'Т': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    'О': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], 'Р': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    'Ш': ['#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#####'], 'Я': ['.####', '#...#', '#...#', '.####', '..#.#', '.#..#', '#...#'],
    'П': ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#'], 'Ц': ['#..#.', '#..#.', '#..#.', '#..#.', '#..#.', '#..#.', '#####'],
    'Д': ['..##.', '.#.#.', '.#.#.', '.#.#.', '.#.#.', '#####', '#...#'],
    'М': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'], '№': ['#.#..', '###.#', '###.#', '#.#..', '#.#.#', '#.#..', '#.#..'],
}
LINES = ['КАБ-500Кр', '07-08-87 0920']
UW, UH, PITCH = 0.0052, 0.0052, 0.058
X_BLOCK0 = 240.0                # начало строк на борту -X, пикс. (между проушинами, как надпись на референсе_4)
Z_TOP = 0.066                   # верх первой строки над осью


def make_block(lines, line_units):
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
    im = bpy.data.images.new('K5K_stencil', W, H, alpha=True)
    px = np.zeros((H, W, 4), dtype=np.float32); px[..., 3] = A
    im.pixels.foreach_set(px.ravel()); im.alpha_mode = 'STRAIGHT'
    return im, cols, rows


im_block, cb, rb_ = make_block(LINES, max(8, round(PITCH / UH)))
W_BLOCK, H_BLOCK = cb * UW, rb_ * UH
# мелкая маркировка своя: подпись, x начала строки, z верха, клетка (м), на каких бортах
SMALL = [(['ЛЮК 1'], 172.0, 0.068, 0.0030, (-1.0, 1.0)), (['ЛЮК 2'], 430.0, 0.074, 0.0030, (-1.0, 1.0)),
         (['СТОП', 'МОМЕНТ 12'], 345.0, 0.098, 0.0026, (-1.0, 1.0)), (['Н 0920'], 66.0, 0.050, 0.0030, (-1.0, 1.0)), (['ПРЕСС 08-87'], 140.0, -0.070, 0.0026, (-1.0,)), (['ШТ 40', 'РЯД 3'], 300.0, -0.055, 0.0026, (1.0,))]
SMALL_IM = [(make_block(l, 9), x, z, c, sides) for l, x, z, c, sides in SMALL]


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
    """Швы, заклёпки накладок, болты планок, круглые лючки. Выход: (линия 0…1, головка 0…1) - линии тёмные, головки выпуклые."""
    M = node_math(nodes, links); R = lambda v, a, b: ramp(nodes, links, v, a, b)
    X, Yc, Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    rho = M('SQRT', M('ADD', M('MULTIPLY', X, X), M('MULTIPLY', Z, Z)))
    xpx = M('SUBTRACT', mk.X0, M('DIVIDE', Yc, S))
    on_hull = M('LESS_THAN', rho, (RB + 0.35) * S)
    line = None
    for xs in G['SEAMS']:
        d = M('MULTIPLY', M('ABSOLUTE', M('SUBTRACT', xpx, xs)), S)
        l = M('MULTIPLY', R(d, 0.0034, 0.0016), on_hull)
        line = l if line is None else M('MAXIMUM', line, l)
    # круглые лючки на обоих бортах: (x, z м, радиус м)
    for xc, zc, rc in ((440.0, -0.012, 0.050), (464.0, 0.022, 0.050), (182.0, -0.025, 0.056), (136.0, 0.060, 0.022), (320.0, 0.010, 0.030)):
        dy = M('SUBTRACT', Yc, Yx(xc)); dz = M('SUBTRACT', Z, zc)
        d = M('SQRT', M('ADD', M('MULTIPLY', dy, dy), M('MULTIPLY', dz, dz)))
        l = M('MULTIPLY', R(M('ABSOLUTE', M('SUBTRACT', d, rc)), 0.0032, 0.0016), on_hull)
        line = M('MAXIMUM', line, l)
    # продольный лючок у носа, борт -X
    x0, x1 = 76.0, 92.0; y0, y1 = sorted((Yx(x0), Yx(x1))); z0, z1 = -0.142, -0.066
    inner = M('MINIMUM', M('MINIMUM', M('SUBTRACT', Yc, y0), M('SUBTRACT', y1, Yc)), M('MINIMUM', M('SUBTRACT', Z, z0), M('SUBTRACT', z1, Z)))
    line = M('MAXIMUM', line, M('MULTIPLY', M('MULTIPLY', R(M('ABSOLUTE', inner), 0.0032, 0.0016), M('LESS_THAN', X, 0.0)), on_hull))
    # заклёпки и болты: свёртка четырёх «×» - вдоль пера u, поперёк w
    ax, az = M('ABSOLUTE', X), M('ABSOLUTE', Z)
    w = M('DIVIDE', M('ABSOLUTE', M('SUBTRACT', ax, az)), math.sqrt(2.0))
    def dots(x0, x1, pitch, w0, rad, rmax):
        c = M('MULTIPLY', M('SUBTRACT', xpx, x0), 1.0 / pitch); f = M('MULTIPLY', M('SUBTRACT', c, M('ROUND', c)), pitch * S)
        d = M('SQRT', M('ADD', M('MULTIPLY', f, f), M('MULTIPLY', M('SUBTRACT', w, w0 * S), M('SUBTRACT', w, w0 * S))))
        gate = M('MULTIPLY', M('MULTIPLY', M('GREATER_THAN', xpx, x0 - pitch * 0.5), M('LESS_THAN', xpx, x1 + pitch * 0.5)), M('LESS_THAN', rho, rmax * S))
        return M('MULTIPLY', R(d, rad, rad * 0.45), gate)
    head = M('MAXIMUM', dots(95.0, 120.0, 5.0, 5.9, 0.0072, 29.4), dots(396.0, 458.0, 12.4, 3.8, 0.0105, 30.6))
    head = M('MAXIMUM', head, M('MULTIPLY', dots(473.0, 484.0, 5.5, 2.1, 0.0055, 200.0), M('GREATER_THAN', rho, 44.0 * S)))             # заклёпки накладки на конце крыла
    # винты вокруг каждого стыка секций: восемь по кругу на шве пояса и на шве хвоста
    ang = M('ARCTAN2', X, Z); st = math.pi / 6
    a12 = M('SUBTRACT', ang, M('MULTIPLY', M('ROUND', M('DIVIDE', ang, st)), st)); arc = M('MULTIPLY', a12, 28.0 * S)
    for xs in (127.0, 366.0, 340.0):
        dy = M('MULTIPLY', M('SUBTRACT', xpx, xs + 1.6 if xs == 340.0 else xs), S)
        d = M('SQRT', M('ADD', M('MULTIPLY', arc, arc), M('MULTIPLY', dy, dy)))
        head = M('MAXIMUM', head, M('MULTIPLY', R(d, 0.0060, 0.0028), M('LESS_THAN', rho, 28.8 * S)))
    return line, head


def build_pattern(mat):
    nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for n in list(nodes):
        if n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): nodes.remove(n)
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL'); prin = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    kind = mat.name
    col = PAINT if kind == 'K5K_body' else tuple(prin.inputs['Base Color'].default_value)[:3]
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
    ao1 = N('ShaderNodeAmbientOcclusion'); ao1.samples = 24; ao1.inputs['Distance'].default_value = 0.010
    ao2 = N('ShaderNodeAmbientOcclusion'); ao2.samples = 12; ao2.inputs['Distance'].default_value = 0.05
    a1 = maprange(ao1.outputs['AO'], 0, 1, 0.40, 1.0); a2 = maprange(ao2.outputs['AO'], 0, 1, 0.68, 1.0)
    def noise(scale, detail, rough, lo, hi):
        n = N('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(pos, n.inputs['Vector']); return maprange(n.outputs['Fac'], lo, hi, 0.0, 1.0)
    gm = N('ShaderNodeMapping'); gm.inputs['Scale'].default_value = (330.0, 330.0, 330.0); links.new(pos, gm.inputs['Vector'])
    wn = N('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; links.new(gm.outputs['Vector'], wn.inputs['Vector'])
    grain = M('ADD', 1.0, M('MULTIPLY', M('SUBTRACT', wn.outputs['Value'], 0.5), 0.04))
    bev = N('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.0020; bev.samples = 6
    dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; links.new(bev.outputs['Normal'], dot.inputs[0]); links.new(geo.outputs['Normal'], dot.inputs[1])
    edge = maprange(dot.outputs['Value'], 1.0, 0.93, 0.0, 1.0)
    bev2 = N('ShaderNodeBevel'); bev2.inputs['Radius'].default_value = 0.008; bev2.samples = 6
    dot2 = N('ShaderNodeVectorMath'); dot2.operation = 'DOT_PRODUCT'; links.new(bev2.outputs['Normal'], dot2.inputs[0]); links.new(geo.outputs['Normal'], dot2.inputs[1])
    zone = maprange(dot2.outputs['Value'], 1.0, 0.90, 0.0, 1.0)
    chip = M('MULTIPLY', zone, noise(30.0, 5.0, 0.6, 0.54, 0.66))
    scuff = noise(5.0, 7.0, 0.62, 0.50, 0.72); patch = noise(1.6, 4.0, 0.55, 0.38, 0.66); fine = noise(46.0, 4.0, 0.6, 0.38, 0.66)
    rho = M('SQRT', M('ADD', M('MULTIPLY', X, X), M('MULTIPLY', Z, Z)))
    xpx = M('SUBTRACT', mk.X0, M('DIVIDE', Yc, S))
    c = rgb(col)
    if kind == 'K5K_body':
        # каждая секция покрашена чуть иначе (на крупном фото это видно)
        tone = 1.0
        for xs, k_t in ((58.0, 1.05), (92.0, 0.97), (127.0, 1.03), (222.5, 0.95), (338.0, 1.06), (368.0, 0.94)):
            tone = M('MULTIPLY', tone, M('ADD', 1.0, M('MULTIPLY', M('GREATER_THAN', xpx, xs), k_t - 1.0)))
        c = mixc(c, gray(tone), 1.0, 'MULTIPLY')
        c = mixc(c, mixc(c, gray(1.28), 1.0, 'MULTIPLY'), M('MULTIPLY', scuff, 0.55))
        c = mixc(c, mixc(c, gray(0.78), 1.0, 'MULTIPLY'), M('MULTIPLY', patch, 0.55))
        c = mixc(c, mixc(c, gray(1.14), 1.0, 'MULTIPLY'), M('MULTIPLY', fine, 0.45))
        # потёки и царапины вдоль корпуса: шум, вытянутый по оси
        mp = N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (70.0, 1.6, 70.0); links.new(pos, mp.inputs['Vector'])
        nst = N('ShaderNodeTexNoise'); nst.inputs['Scale'].default_value = 1.0; nst.inputs['Detail'].default_value = 5.0; nst.inputs['Roughness'].default_value = 0.62; links.new(mp.outputs['Vector'], nst.inputs['Vector'])
        streak = maprange(nst.outputs['Fac'], 0.44, 0.70, 0.0, 1.0)
        c = mixc(c, mixc(c, gray(0.84), 1.0, 'MULTIPLY'), M('MULTIPLY', streak, 0.45))
        ms = N('ShaderNodeMapping'); ms.inputs['Scale'].default_value = (420.0, 7.0, 420.0); links.new(pos, ms.inputs['Vector'])
        nsc = N('ShaderNodeTexNoise'); nsc.inputs['Scale'].default_value = 1.0; nsc.inputs['Detail'].default_value = 3.0; links.new(ms.outputs['Vector'], nsc.inputs['Vector'])
        scr = M('MULTIPLY', maprange(nsc.outputs['Fac'], 0.66, 0.74, 0.0, 1.0), noise(3.0, 3.0, 0.5, 0.5, 0.7))
        c = mixc(c, rgb((0.34, 0.36, 0.38)), M('MULTIPLY', scr, 0.55))
        # тёмная полость за стеклом
        c = mixc(c, rgb((0.012, 0.013, 0.015)), M('MULTIPLY', M('LESS_THAN', rho, (RB - 6.0) * S), M('LESS_THAN', xpx, 70.0)))
        # надписи на обоих бортах: на -X от носа к хвосту, на +X от хвоста к носу
        yb0 = Yx(X_BLOCK0)
        for s in (-1.0, 1.0):
            u = M('DIVIDE', M('MULTIPLY', M('SUBTRACT', Yc, yb0 if s < 0 else (yb0 - W_BLOCK)), s), W_BLOCK)
            v = M('ADD', 1.0, M('DIVIDE', M('SUBTRACT', Z, Z_TOP), H_BLOCK))
            cmb = N('ShaderNodeCombineXYZ'); links.new(u, cmb.inputs['X']); links.new(v, cmb.inputs['Y'])
            tx = N('ShaderNodeTexImage'); tx.image = im_block; tx.extension = 'CLIP'; tx.interpolation = 'Linear'; links.new(cmb.outputs['Vector'], tx.inputs['Vector'])
            side = maprange(M('MULTIPLY', gsep.outputs['X'], s), 0.10, 0.25, 0.0, 1.0)
            c = mixc(c, rgb((0.012, 0.012, 0.013)), M('MULTIPLY', M('MULTIPLY', tx.outputs['Alpha'], side), M('SUBTRACT', 0.93, M('MULTIPLY', scuff, 0.25))))
        line, head = marks(nodes, links, sep)
        for (imt, cl_, rw_), xs_, zs_, cell_, sides_ in SMALL_IM:
            wt, ht = cl_ * cell_, rw_ * cell_; ybs = Yx(xs_)
            for s in sides_:
                u = M('DIVIDE', M('MULTIPLY', M('SUBTRACT', Yc, ybs if s < 0 else (ybs - wt)), s), wt)
                v = M('ADD', 1.0, M('DIVIDE', M('SUBTRACT', Z, zs_), ht))
                cmb = N('ShaderNodeCombineXYZ'); links.new(u, cmb.inputs['X']); links.new(v, cmb.inputs['Y'])
                tx = N('ShaderNodeTexImage'); tx.image = imt; tx.extension = 'CLIP'; tx.interpolation = 'Linear'; links.new(cmb.outputs['Vector'], tx.inputs['Vector'])
                c = mixc(c, rgb((0.018, 0.018, 0.02)), M('MULTIPLY', M('MULTIPLY', tx.outputs['Alpha'], maprange(M('MULTIPLY', gsep.outputs['X'], s), 0.10, 0.25, 0.0, 1.0)), 0.85))
        c = mixc(c, mixc(c, gray(1.3), 1.0, 'MULTIPLY'), M('MULTIPLY', head, 0.5))
        c = mixc(c, rgb((0.018, 0.019, 0.022)), M('MULTIPLY', line, 0.92))
        # крыло: линия сгиба и накладка у конца, красная полоса на задней кромке (только за корпусом)
        (x_a, r_a), (x_b, r_b) = G['TE']
        k_te = (x_b - x_a) / (r_b - r_a)
        d_te = M('SUBTRACT', M('ADD', x_a, M('MULTIPLY', M('SUBTRACT', M('DIVIDE', rho, S), r_a), k_te)), xpx)
        on_wing = M('MULTIPLY', M('GREATER_THAN', rho, (RB + 2.1) * S), M('GREATER_THAN', xpx, 380.0))
        crease = M('MULTIPLY', ramp(nodes, links, M('ABSOLUTE', M('SUBTRACT', d_te, 16.0)), 0.5, 0.2), on_wing)
        c = mixc(c, mixc(rgb(col), gray(0.72), 1.0, 'MULTIPLY'), crease)
        if RED: c = mixc(c, rgb((0.56, 0.055, 0.035)), M('MULTIPLY', ramp(nodes, links, d_te, 3.2, 2.8), on_wing))
        c = mixc(c, rgb((0.40, 0.41, 0.42)), M('MULTIPLY', M('ADD', M('MULTIPLY', edge, 0.55), M('MULTIPLY', chip, 0.8), clamp=True), 0.75))
    elif kind == 'K5K_steel':
        bay = M('LESS_THAN', xpx, 66.0)
        cb_ = mixc(rgb((0.42, 0.04, 0.03)), rgb((0.03, 0.14, 0.42)), maprange(M('SINE', M('MULTIPLY', M('ARCTAN2', X, Z), 2.5)), -0.2, 0.2, 0.0, 1.0))
        c = mixc(c, cb_, bay)
        c = mixc(c, rgb((0.10, 0.10, 0.10)), M('MULTIPLY', scuff, 0.5))
        c = mixc(c, rgb((0.18, 0.18, 0.18)), M('MULTIPLY', edge, 0.5))
    else:                                                       # колодки и крышка
        cap_zone = M('LESS_THAN', M('ABSOLUTE', M('SUBTRACT', xpx, G['X_CAP'])), G['R_CAP'] + 1.0)
        rtop = M('SUBTRACT', M('DIVIDE', Z, S), RB)
        c = mixc(c, mixc(rgb(col), gray(0.72), 1.0, 'MULTIPLY'), M('MULTIPLY', patch, 0.5))
        c = mixc(c, rgb((0.34, 0.20, 0.07)), M('MULTIPLY', M('ADD', M('MULTIPLY', edge, 0.5), M('MULTIPLY', scuff, 0.25), clamp=True), 0.6))
        # торцы валика: светлый металл, красная точка; на передней колодке
        azx = M('ABSOLUTE', X); endz = M('MULTIPLY', M('GREATER_THAN', azx, 10.6 * S), M('LESS_THAN', xpx, 260.0))
        c = mixc(c, rgb((0.55, 0.45, 0.28)), endz)
        dotr = M('MULTIPLY', M('MULTIPLY', M('GREATER_THAN', azx, 11.5 * S), M('LESS_THAN', M('ABSOLUTE', M('SUBTRACT', Z, 32.4 * S)), 0.006)), M('LESS_THAN', xpx, 260.0))
        c = mixc(c, rgb((0.55, 0.04, 0.03)), dotr)
        band = rgb((0.60, 0.60, 0.58)); top = rgb((0.56, 0.055, 0.035)) if RED else rgb((0.60, 0.60, 0.58))
        capc = mixc(band, top, M('GREATER_THAN', rtop, 16.0 / 1000.0 / S))
        c = mixc(c, capc, cap_zone)
    c = mixc(c, gray(M('MULTIPLY', a1, a2)), 1.0, 'MULTIPLY')
    c = mixc(c, gray(grain), 1.0, 'MULTIPLY')
    emi = N('ShaderNodeEmission'); links.new(c, emi.inputs['Color'])
    links.new(emi.outputs['Emission'], out.inputs['Surface'])
    tex = N('ShaderNodeTexImage'); tex.image = img
    for n in nodes: n.select = False
    tex.select = True; nodes.active = tex
    return out, prin, tex, col


rig = {m.name: build_pattern(m) for m in mats}
log('шейдеры запекания готовы, красные метки:', RED)

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
img.filepath_raw = path; img.file_format = 'PNG'; img.save(); img.pack()
log('цвет сохранён', path)


# 4. карта нормалей
def build_relief(mat, entry):
    out, prin, tex, col = entry; nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for l in list(out.inputs['Surface'].links): links.remove(l)
    links.new(prin.outputs['BSDF'], out.inputs['Surface'])
    k_fine, bev_r = {'K5K_body': (0.30, 0.0028), 'K5K_steel': (0.22, 0.0018), 'K5K_block': (0.30, 0.0018)}[mat.name]
    geo, sep = coords(nodes, links)
    bev = nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = bev_r; bev.samples = 10
    def noise(scale, detail, rough):
        n = nodes.new('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(geo.outputs['Position'], n.inputs['Vector']); return n.outputs['Fac']
    M = node_math(nodes, links)
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.002; bump.inputs['Strength'].default_value = 1.0
    h = M('ADD', M('MULTIPLY', noise(150.0, 3.0, 0.55), 0.50 * k_fine), M('MULTIPLY', noise(14.0, 3.0, 0.5), 0.55 * k_fine))
    if mat.name == 'K5K_body':
        line, head = marks(nodes, links, sep)
        h = M('ADD', M('ADD', h, M('MULTIPLY', head, 2.2)), M('MULTIPLY', line, -1.8))
    links.new(h, bump.inputs['Height'])
    links.new(bev.outputs['Normal'], bump.inputs['Normal'])
    links.new(bump.outputs['Normal'], prin.inputs['Normal'])


nimg = bpy.data.images.get('K5K_normal')
if nimg is not None: bpy.data.images.remove(nimg)
nimg = bpy.data.images.new('K5K_normal', NSIZE, NSIZE, alpha=False)
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
npath = os.path.join(OUT, 'kab500kr_normal.png')
nimg.filepath_raw = npath; nimg.file_format = 'PNG'; nimg.save(); nimg.pack()

# 5. материалы
for m in mats:
    out, prin, tex, col = rig[m.name]; nt = m.node_tree; ntx = ntex_of[m.name]
    for l in list(prin.inputs['Normal'].links): nt.links.remove(l)
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.space = 'TANGENT'; nm.uv_map = 'UVMap'; nm.inputs['Strength'].default_value = 1.0
    keep = {out, prin, tex, ntx, nm}
    for n in list(nt.nodes):
        if n not in keep: nt.nodes.remove(n)
    nt.links.new(tex.outputs['Color'], prin.inputs['Base Color'])
    nt.links.new(ntx.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], prin.inputs['Normal'])
for im in [i for i in bpy.data.images if i.name.startswith('K5K_stencil')]: bpy.data.images.remove(im)
log('материалы подключены:', [m.name for m in mats])


def lite(image, name, fmt, fname, px):
    c = image.copy(); c.name = name; c.scale(px, px); c.file_format = fmt
    p_ = os.path.join(OUT, fname)
    try: c.save(filepath=p_, quality=92)
    except TypeError:
        c.filepath_raw = p_; c.save()
    bpy.data.images.remove(c)
    return p_


lite(img, f'K5K_detail_{GAME_TEX}', 'JPEG', f'kab500kr_detail_{GAME_TEX}.jpg', GAME_TEX); lite(nimg, f'K5K_normal_{GAME_NTEX}', 'PNG', f'kab500kr_normal_{GAME_NTEX}.png', GAME_NTEX)
log('облегчённые копии', GAME_TEX, '/', GAME_NTEX, 'готовы')
