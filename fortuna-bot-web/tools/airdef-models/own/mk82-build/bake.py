# bake.py - запекает две текстуры Mk 82: цвет (mk82_detail.png: оливковая краска как на музейном фото, жёлтая носовая часть, металл и латунь взрывателя, жёлтые надписи, лёгкий износ без грязи)
# и карту нормалей (mk82_normal.png: скруглённые кромки, зерно краски, рёбра купола взрывателя, винты, лючок). Образец - AN-M65A1/bake.py и ФАБ-1000/bake.py (видеокарта, зазор островов 16 px).
# Запускается ПОСЛЕ build.py в той же сессии: M82_OUT="<папка>" [M82_TEX=2048] Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Надписи свои: растровый шрифт 5×7, сглажены размытием и порогом, шейдером по координатам модели. С картинок пиксели не берём.
# Развёртка: корпус - одной полосой вокруг оси со швом внизу (ring_uv), остальное - смарт-проекцией; упаковка без поворота, зазор 16 px, атлас сжат к центру на 24 px. Тросик - плоский материал без текстуры.
import os, sys, math, time
sys.dont_write_bytecode = True
import bpy
import modelkit as mk
import numpy as np

CFG = dict(scene='MK82', env='M82', base='mk82', body='M82_body', tag='M82')
OUT = os.environ.get('M82_OUT')
if not OUT: raise SystemExit('Задай M82_OUT=<папка модели>')
SIZE = int(os.environ.get('M82_TEX', '2048'))
NSIZE = int(os.environ.get('M82_NTEX', str(SIZE)))
GAME_TEX, GAME_NTEX = int(os.environ.get('M82_GAME_TEX', '1024')), int(os.environ.get('M82_GAME_NTEX', '512'))
OLIVE = tuple(float(v) for v in os.environ.get('M82_OLIVE', '0.072,0.064,0.020').split(','))
T0 = time.time()
sc = bpy.data.scenes[CFG['scene']]
if bpy.context.window: bpy.context.window.scene = sc
vl = bpy.context.view_layer
vl.update()
objs = [o for o in sc.objects if o.type == 'MESH']
wire = [o for o in objs if o.name == 'M82_wire']           # тросик: без текстуры
objs = [o for o in objs if o.name != 'M82_wire']
body = next(o for o in objs if o.name == CFG['body'])
S, Yx = mk.S, mk.Y
G = mk.GEO
NSEG = G['NSEG']


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
        ang = [math.atan2(c.x, -c.z) for c in cos]                 # шов снизу (-Z)
        a0 = ang[0]; ang = [a if abs(a - a0) <= math.pi else a + (2 * math.pi if a0 - a > 0 else -2 * math.pi) for a in ang]
        for i, a, ri in zip(li, ang, rings): uvd[i].uv = (a * max(R_UV * rr[ri] + (1 - R_UV) * R_MAX, 0.004), vv[ri])


R_MAX, R_UV = G['RB'] * S, 1.0
for o in vl.objects: o.select_set(False)
for o in objs + wire:
    while len(o.data.uv_layers) > 0: o.data.uv_layers.remove(o.data.uv_layers[0])
    o.data.uv_layers.new(name='UVMap')
ring_uv(body, NSEG)
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
k_in = 1.0 - 24.0 / SIZE
for o in objs:
    for d in o.data.uv_layers.active.data: d.uv = (0.5 + (d.uv.x - 0.5) * k_in, 0.5 + (d.uv.y - 0.5) * k_in)
log('развёртка готова, объектов', len(objs))

# 2. картинка цвета и надписи
old = bpy.data.images.get('M82_detail')
if old is not None: bpy.data.images.remove(old)
path = os.path.join(OUT, 'mk82_detail.png')
img = bpy.data.images.new('M82_detail', SIZE, SIZE, alpha=False)
img.generated_color = (1, 1, 1, 1)
mats = [m for m in bpy.data.materials if m.name in ('M82_body', 'M82_nose', 'M82_steel')]

GLYPH = {
    '0': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'], '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
    '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'], '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
    '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'], ' ': ['.....'] * 7,
    'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], 'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'], 'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'], 'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'], 'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'I': ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'], 'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'], 'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    'N': ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'], 'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'], 'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'], 'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], 'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'], 'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
}
# блок на борту: строки как на референсе_2, по левому краю, клетка 1,95 × 2,15 мм (буква ≈ 15 мм)
LINES = ['FSN 1325-154-2139', 'BOMB LD MK 82 MOD 4 GP 500 LBS', 'DWG 30003-816299', 'EXPLOSIVE H-6 WT 174 LBS', 'LOADED NAD CRANE 2-73', 'TOTAL WT 485 LBS CU FT 3.5', 'W/ CABLE ASSY', 'LOT C-30-2']
UW, UH, PITCH = 0.00195, 0.00215, 0.0255
X_BLOCK0 = 745.0                 # начало строк, пикс. (референс_2)
Z_TOP = 79.0 * S                 # верх первой строки над осью
LOT = 'LOT MCA 041117 002'       # полоса поперёк борта у носа от переднего упора, как на референсе_1 (номер свой)
X_LOT, A_LOT0 = 612.0, 12.0      # где стоит и с какого угла от верхней образующей начинается


def make_block(lines, line_units, center=False):
    cw, ch, gap, k = 5, 7, 1, 10
    cols = max(len(s) * (cw + gap) - gap for s in lines); rows = (len(lines) - 1) * line_units + ch
    W, H = cols * k, rows * k
    A = np.zeros((H, W), dtype=np.float32)
    for li, s in enumerate(lines):
        x0 = (cols - (len(s) * (cw + gap) - gap)) // 2 if center else 0
        top = H - li * line_units * k
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
    im = bpy.data.images.new('M82_stencil', W, H, alpha=True)
    px = np.zeros((H, W, 4), dtype=np.float32); px[..., 3] = A
    im.pixels.foreach_set(px.ravel()); im.alpha_mode = 'STRAIGHT'
    return im, cols, rows


im_block, cb, rb = make_block(LINES, max(8, round(PITCH / UH)))
W_BLOCK, H_BLOCK = cb * UW, rb * UH
im_lot, cl, rl = make_block([LOT], 8)
W_LOT, H_LOT = cl * UW, rl * UH
YEL_TEXT = (0.42, 0.29, 0.02)


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


def marks(nodes, links, sep):
    """Винты у пояска (восемь по кругу), прямоугольный лючок на конусе (борт -X), шлиц крышки горловины. Выход: (винт 0…1, шлиц винта 0…1, линия лючка 0…1, шлиц крышки 0…1)."""
    M = node_math(nodes, links); R = lambda v, a, b: ramp(nodes, links, v, a, b)
    X, Yc, Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    rho = M('SQRT', M('ADD', M('MULTIPLY', X, X), M('MULTIPLY', Z, Z)))
    ang = M('ARCTAN2', X, Z); st = math.pi / 4; off = math.pi / 8
    a8 = M('SUBTRACT', M('SUBTRACT', ang, off), M('MULTIPLY', M('ROUND', M('DIVIDE', M('SUBTRACT', ang, off), st)), st))
    arc = M('MULTIPLY', a8, rho); dy = M('SUBTRACT', Yc, Yx(1408.0))
    d = M('SQRT', M('ADD', M('MULTIPLY', arc, arc), M('MULTIPLY', dy, dy)))
    screw = R(d, 0.0075, 0.0055)
    slot = M('MULTIPLY', screw, R(M('ABSOLUTE', arc), 0.0016, 0.0009))
    x0, x1 = G['X_HATCH']; y0, y1 = sorted((Yx(x0), Yx(x1))); z0, z1 = -0.058, 0.012; t = 0.0020
    inner = M('MINIMUM', M('MINIMUM', M('SUBTRACT', Yc, y0), M('SUBTRACT', y1, Yc)), M('MINIMUM', M('SUBTRACT', Z, z0), M('SUBTRACT', z1, Z)))
    hatch = M('MULTIPLY', M('MULTIPLY', R(M('ABSOLUTE', inner), t, t * 0.4), M('LESS_THAN', X, 0.0)), 1.0)
    dcy = M('SUBTRACT', Yc, Yx(G['X_COVER']))
    cov = M('MULTIPLY', M('MULTIPLY', R(M('ABSOLUTE', dcy), 0.0022, 0.0012), R(M('ABSOLUTE', X), (G['R_COVER'] - 6.0) * S, (G['R_COVER'] - 7.0) * S)), M('GREATER_THAN', Z, 0.0))
    return screw, slot, hatch, cov


def build_pattern(mat):
    nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for n in list(nodes):
        if n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): nodes.remove(n)
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL'); prin = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    col = {'M82_body': OLIVE}.get(mat.name) or tuple(prin.inputs['Base Color'].default_value)[:3]
    prin.inputs['Base Color'].default_value = (*col, 1.0)
    for l in list(prin.inputs['Base Color'].links): links.remove(l)
    N = lambda t: nodes.new(t)
    kind = mat.name
    M = node_math(nodes, links)
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
    X, Yc, Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    geo = N('ShaderNodeNewGeometry'); gsep = N('ShaderNodeSeparateXYZ'); links.new(geo.outputs['Normal'], gsep.inputs['Vector'])
    ao1 = N('ShaderNodeAmbientOcclusion'); ao1.samples = 24; ao1.inputs['Distance'].default_value = 0.010
    ao2 = N('ShaderNodeAmbientOcclusion'); ao2.samples = 12; ao2.inputs['Distance'].default_value = 0.05
    a1 = maprange(ao1.outputs['AO'], 0, 1, 0.55, 1.0); a2 = maprange(ao2.outputs['AO'], 0, 1, 0.78, 1.0)
    def noise(scale, detail, rough, lo, hi, vec=None):
        n = N('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(vec if vec is not None else tc.outputs['Object'], n.inputs['Vector']); return maprange(n.outputs['Fac'], lo, hi, 0.0, 1.0)
    gm = N('ShaderNodeMapping'); gm.inputs['Scale'].default_value = (330.0, 330.0, 330.0); links.new(tc.outputs['Object'], gm.inputs['Vector'])
    wn = N('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; links.new(gm.outputs['Vector'], wn.inputs['Vector'])
    grain = M('ADD', 1.0, M('MULTIPLY', M('SUBTRACT', wn.outputs['Value'], 0.5), 0.05))
    bev = N('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.0020; bev.samples = 6
    dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; links.new(bev.outputs['Normal'], dot.inputs[0]); links.new(geo.outputs['Normal'], dot.inputs[1])
    edge = maprange(dot.outputs['Value'], 1.0, 0.93, 0.0, 1.0)
    bev2 = N('ShaderNodeBevel'); bev2.inputs['Radius'].default_value = 0.008; bev2.samples = 6
    dot2 = N('ShaderNodeVectorMath'); dot2.operation = 'DOT_PRODUCT'; links.new(bev2.outputs['Normal'], dot2.inputs[0]); links.new(geo.outputs['Normal'], dot2.inputs[1])
    zone = maprange(dot2.outputs['Value'], 1.0, 0.90, 0.0, 1.0)
    chip = M('MULTIPLY', zone, noise(30.0, 5.0, 0.6, 0.52, 0.64))
    scuff = noise(5.0, 7.0, 0.62, 0.50, 0.72)                 # пятна потёртости краски (без грязи)
    patch = noise(1.6, 4.0, 0.55, 0.38, 0.66)                  # широкие неровности тона, как на музейной краске
    if kind in ('M82_body', 'M82_nose'):
        c = rgb(col)
        c = mixc(c, mixc(rgb(col), gray(1.32 if kind == 'M82_body' else 1.10), 1.0, 'MULTIPLY'), M('MULTIPLY', scuff, 0.55))
        c = mixc(c, mixc(rgb(col), gray(0.80), 1.0, 'MULTIPLY'), M('MULTIPLY', patch, 0.50))
        fine = noise(46.0, 4.0, 0.6, 0.38, 0.66)                 # мелкая пятнистость краски
        c = mixc(c, mixc(rgb(col), gray(1.18 if kind == 'M82_body' else 1.05), 1.0, 'MULTIPLY'), M('MULTIPLY', fine, 0.40))
        if kind == 'M82_body':
            # надписи: блок на обоих бортах (на -X читается от носа к хвосту, на +X от хвоста к носу), полоса LOT поперёк борта -X
            yb0 = Yx(X_BLOCK0)
            for s, sgn in ((-1.0, -1.0), (1.0, 1.0)):
                # u вдоль строки: на -X от носа к хвосту (Y убывает), на +X от хвоста к носу (Y растёт); начало строк - край блока
                u = M('DIVIDE', M('MULTIPLY', M('SUBTRACT', Yc, yb0 if sgn < 0 else (yb0 - W_BLOCK)), sgn), W_BLOCK)
                v = M('ADD', 1.0, M('DIVIDE', M('SUBTRACT', Z, Z_TOP), H_BLOCK))
                cmb = N('ShaderNodeCombineXYZ'); links.new(u, cmb.inputs['X']); links.new(v, cmb.inputs['Y'])
                tx = N('ShaderNodeTexImage'); tx.image = im_block; tx.extension = 'CLIP'; tx.interpolation = 'Linear'; links.new(cmb.outputs['Vector'], tx.inputs['Vector'])
                side = maprange(M('MULTIPLY', gsep.outputs['X'], s), 0.10, 0.25, 0.0, 1.0)
                wear = M('SUBTRACT', 0.95, M('MULTIPLY', scuff, 0.30))
                c = mixc(c, rgb(YEL_TEXT), M('MULTIPLY', M('MULTIPLY', tx.outputs['Alpha'], side), wear))
            ang = M('ARCTAN2', M('MULTIPLY', X, -1.0), Z); R_lot = (mk.RB - 2.0) * S
            ul = M('DIVIDE', M('SUBTRACT', M('MULTIPLY', ang, R_lot), math.radians(A_LOT0) * R_lot), W_LOT)
            vl_ = M('ADD', 0.5, M('DIVIDE', M('SUBTRACT', Yx(X_LOT), Yc), H_LOT))
            cmb = N('ShaderNodeCombineXYZ'); links.new(ul, cmb.inputs['X']); links.new(vl_, cmb.inputs['Y'])
            tx = N('ShaderNodeTexImage'); tx.image = im_lot; tx.extension = 'CLIP'; tx.interpolation = 'Linear'; links.new(cmb.outputs['Vector'], tx.inputs['Vector'])
            c = mixc(c, rgb(YEL_TEXT), M('MULTIPLY', M('MULTIPLY', tx.outputs['Alpha'], M('LESS_THAN', X, 0.0)), 0.9))
            screw, slot, hatch, cov = marks(nodes, links, sep)
            c = mixc(c, rgb((0.20, 0.19, 0.15)), M('MULTIPLY', screw, 0.65))
            c = mixc(c, rgb((0.015, 0.015, 0.012)), M('MAXIMUM', M('MULTIPLY', slot, 0.9), M('MAXIMUM', M('MULTIPLY', hatch, 0.85), M('MULTIPLY', cov, 0.8))))
        # сколы только по кромкам, редко
        c = mixc(c, rgb((0.20, 0.18, 0.14)), M('MULTIPLY', M('ADD', M('MULTIPLY', edge, 0.45), M('MULTIPLY', chip, 0.8), clamp=True), 0.55))
        speck = M('MULTIPLY', noise(70.0, 3.0, 0.5, 0.72, 0.80), noise(4.0, 3.0, 0.5, 0.52, 0.72))
        c = mixc(c, rgb((0.17, 0.085, 0.03)), M('MULTIPLY', speck, 0.55))
    else:                                                       # взрыватель: зоны по длине и радиусу
        rho = M('SQRT', M('ADD', M('MULTIPLY', X, X), M('MULTIPLY', Z, Z)))
        xpx = M('SUBTRACT', mk.X0, M('DIVIDE', Yc, S))           # обратно в пиксели
        c = rgb((0.40, 0.40, 0.33))                              # цилиндр: бледный зеленоватый металл
        patch2 = noise(25.0, 4.0, 0.55, 0.35, 0.70)
        c = mixc(c, rgb((0.27, 0.27, 0.21)), M('MULTIPLY', patch2, 0.5))
        c = mixc(c, rgb((0.55, 0.55, 0.52)), M('GREATER_THAN', 67.0, xpx))     # фланец
        c = mixc(c, rgb((0.045, 0.045, 0.05)), M('MULTIPLY', M('GREATER_THAN', 51.0, xpx), M('GREATER_THAN', xpx, 37.2)))   # тёмный купол
        c = mixc(c, rgb((0.68, 0.69, 0.70)), M('GREATER_THAN', 37.2, xpx))     # колпачок
        c = mixc(c, rgb((0.05, 0.05, 0.05)), M('MULTIPLY', M('LESS_THAN', rho, 3.0 * S), M('GREATER_THAN', 29.0, xpx)))    # отверстие колпачка
        brass = M('MAXIMUM', M('MULTIPLY', M('GREATER_THAN', 50.0, xpx), M('GREATER_THAN', rho, 21.0 * S)), M('GREATER_THAN', rho, 30.2 * S))
        brass = M('MULTIPLY', brass, M('LESS_THAN', xpx, 67.0))
        c = mixc(c, rgb((0.60, 0.42, 0.11)), brass)
        # отверстие и винтики на цилиндре, борт -X
        dy = M('SUBTRACT', Yc, Yx(84.0)); dz = Z; dd = M('SQRT', M('ADD', M('MULTIPLY', dy, dy), M('MULTIPLY', dz, dz)))
        hole = M('MULTIPLY', ramp(nodes, links, dd, 0.0042, 0.0030), M('LESS_THAN', X, 0.0))
        c = mixc(c, rgb((0.012, 0.012, 0.012)), M('MULTIPLY', hole, M('LESS_THAN', xpx, 100.0)))
        c = mixc(c, rgb((0.10, 0.10, 0.09)), M('MULTIPLY', edge, 0.35))
    c = mixc(c, gray(M('MULTIPLY', a1, a2)), 1.0, 'MULTIPLY')
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
img.filepath_raw = path; img.file_format = 'PNG'; img.save(); img.pack()
log('цвет сохранён', path)


# 4. карта нормалей
def build_relief(mat, entry):
    out, prin, tex, col = entry; nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for l in list(out.inputs['Surface'].links): links.remove(l)
    links.new(prin.outputs['BSDF'], out.inputs['Surface'])
    k_fine, bev_r = {'M82_body': (0.34, 0.0022), 'M82_nose': (0.22, 0.0022), 'M82_steel': (0.08, 0.0012)}[mat.name]
    tc = nodes.new('ShaderNodeTexCoord'); sep = nodes.new('ShaderNodeSeparateXYZ'); links.new(tc.outputs['Object'], sep.inputs['Vector'])
    bev = nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = bev_r; bev.samples = 10
    def noise(scale, detail, rough):
        n = nodes.new('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(tc.outputs['Object'], n.inputs['Vector']); return n.outputs['Fac']
    M = node_math(nodes, links)
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.002; bump.inputs['Strength'].default_value = 1.0
    h = M('ADD', M('MULTIPLY', noise(120.0, 3.0, 0.55), 0.55 * k_fine), M('MULTIPLY', noise(8.0, 2.0, 0.5), 0.35 * k_fine))
    if mat.name == 'M82_body':
        screw, slot, hatch, cov = marks(nodes, links, sep)
        h = M('ADD', M('ADD', h, M('MULTIPLY', screw, 0.5)), M('MULTIPLY', M('MAXIMUM', slot, M('MAXIMUM', hatch, cov)), -1.3))
    elif mat.name == 'M82_steel':                               # радиальные рёбра тёмного купола
        X, Yc, Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
        xpx = M('SUBTRACT', mk.X0, M('DIVIDE', Yc, S)); ang = M('ARCTAN2', X, Z)
        ribs = M('MULTIPLY', M('SINE', M('MULTIPLY', ang, 36.0)), M('MULTIPLY', M('GREATER_THAN', 50.5, xpx), M('GREATER_THAN', xpx, 38.0)))
        h = M('ADD', h, M('MULTIPLY', ribs, 0.14))
    links.new(h, bump.inputs['Height'])
    links.new(bev.outputs['Normal'], bump.inputs['Normal'])
    links.new(bump.outputs['Normal'], prin.inputs['Normal'])


nimg = bpy.data.images.get('M82_normal')
if nimg is not None: bpy.data.images.remove(nimg)
nimg = bpy.data.images.new('M82_normal', NSIZE, NSIZE, alpha=False)
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
npath = os.path.join(OUT, 'mk82_normal.png')
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
    tex.location = (-500, 100); ntx.location = (-700, -200); nm.location = (-300, -200)
for im in [i for i in bpy.data.images if i.name.startswith('M82_stencil')]: bpy.data.images.remove(im)
log('материалы подключены:', [m.name for m in mats])


def lite(image, name, fmt, fname, px):
    c = image.copy(); c.name = name; c.scale(px, px); c.file_format = fmt
    p_ = os.path.join(OUT, fname)
    try: c.save(filepath=p_, quality=92)
    except TypeError:
        c.filepath_raw = p_; c.save()
    bpy.data.images.remove(c)
    return p_


lite(img, f'M82_detail_{GAME_TEX}', 'JPEG', f'mk82_detail_{GAME_TEX}.jpg', GAME_TEX); lite(nimg, f'M82_normal_{GAME_NTEX}', 'PNG', f'mk82_normal_{GAME_NTEX}.png', GAME_NTEX)
log('облегчённые копии', GAME_TEX, '/', GAME_NTEX, 'готовы')
