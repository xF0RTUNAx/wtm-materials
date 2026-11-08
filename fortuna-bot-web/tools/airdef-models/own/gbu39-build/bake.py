# bake.py - запекает текстуры GBU-39 SDB: цвет (gbu39_detail.png: серо-голубая краска по фото 01/02/05, бурый колпачок носа, жёлтая полоса боевой части,
# чёрный короб крыльев с надписью, металл хвостового отсека и рулей, швы, винты, табличка, тёмные бирки, придуманная мелкая маркировка, потёртости) и нормали.
# Запуск после build.py: SDB_OUT="<папка>" [SDB_TEX=2048] Blender -b --factory-startup --python build.py --python bake.py [--python _trial.py | --python deliver.py]
import os, sys, math, time
sys.dont_write_bytecode = True
import bpy
import modelkit as mk
import numpy as np

OUT = os.environ.get('SDB_OUT')
if not OUT: raise SystemExit('Задай SDB_OUT=<папка модели>')
SIZE = int(os.environ.get('SDB_TEX', '2048')); NSIZE = int(os.environ.get('SDB_NTEX', str(SIZE)))
GAME_TEX, GAME_NTEX = int(os.environ.get('SDB_GAME_TEX', '1024')), int(os.environ.get('SDB_GAME_NTEX', '512'))
VARIANT = 'серо-голубая'
BASE = tuple(float(v) for v in os.environ.get('SDB_BASE', '0.47,0.51,0.585').split(','))   # линейные; фото 02 верх sRGB ~184/191/208, 05 ~140/158/184, 01 ~119/119/131
T0 = time.time()
sc = bpy.data.scenes['GBU39']
if bpy.context.window: bpy.context.window.scene = sc
vl = bpy.context.view_layer; vl.update()
objs = [o for o in sc.objects if o.type == 'MESH']
body = next(o for o in objs if o.name == 'SDB_body')
G = mk.GEO; L = G['L']; R = G['R']; NSEG = 40
BREAKS = (0.594, 1.094, 1.3305)                                    # куски развёртки корпуса по стыкам
Yb = lambda a: L / 2 - a


def log(*a): print(f'[{time.time() - T0:5.1f} с]', *a, flush=True)


def ring_uv(o, n):
    me = o.data; uvd = me.uv_layers.active.data
    nv = len(me.vertices); nr = nv // n
    cy = [sum(me.vertices[i * n + j].co.y for j in range(n)) / n for i in range(nr)]
    rr = [sum(math.hypot(me.vertices[i * n + j].co.x, me.vertices[i * n + j].co.z) for j in range(n)) / n for i in range(nr)]
    vv = [0.0]
    for i in range(1, nr): vv.append(vv[-1] + math.hypot(cy[i] - cy[i - 1], rr[i] - rr[i - 1]))
    amax, ch = -1.0, []
    for i in range(nr):
        amax = max(amax, L / 2 - cy[i]); ch.append(sum(1 for b_ in BREAKS if amax >= b_))
    v0 = {}
    for i in range(nr): v0.setdefault(ch[i], vv[i])
    for poly in me.polygons:
        li = list(poly.loop_indices); vis = [me.loops[i].vertex_index for i in li]; cos = [me.vertices[vi].co for vi in vis]; rings = [vi // n for vi in vis]
        if len(li) > 4 and (rings[0] == 0 or rings[0] == nr - 1) and len(set(rings)) == 1:
            for i, c in zip(li, cos): uvd[i].uv = (c.x + 3.0 * ch[rings[0]], c.z - 3.0)
            continue
        k = ch[min(rings)]
        ang = [math.atan2(c.x, -c.z) for c in cos]
        a0 = ang[0]; ang = [a if abs(a - a0) <= math.pi else a + (2 * math.pi if a0 - a > 0 else -2 * math.pi) for a in ang]
        for i, a, ri in zip(li, ang, rings): uvd[i].uv = (a * max(rr[ri], 0.004) + 3.0 * k, vv[ri] - v0[k])
    print('кусков развёртки корпуса', max(ch) + 1)


for o in vl.objects: o.select_set(False)
for o in objs:
    while len(o.data.uv_layers) > 0: o.data.uv_layers.remove(o.data.uv_layers[0])
    o.data.uv_layers.new(name='UVMap')
# у корпуса после remove_doubles порядок вершин по кольцам сохранён: ring_uv работает, если число вершин кратно NSEG
print('вершин корпуса', len(body.data.vertices), 'колец', len(body.data.vertices) / NSEG)
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

old = bpy.data.images.get('SDB_detail')
if old is not None: bpy.data.images.remove(old)
path = os.path.join(OUT, 'gbu39_detail.png')
img = bpy.data.images.new('SDB_detail', SIZE, SIZE, alpha=False); img.generated_color = (1, 1, 1, 1)
mats = [m for m in bpy.data.materials if m.name in ('SDB_body', 'SDB_metal', 'SDB_dark', 'SDB_wing')]
GLYPH = {
    '0': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'], '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
    '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'], ' ': ['.....'] * 7,
    'И': ['#...#', '#..##', '#.#.#', '##..#', '#...#', '#...#', '#...#'], 'М': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    'Т': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'], 'А': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'О': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], 'Р': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    'З': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'], 'В': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    'Д': ['..##.', '.#.#.', '.#.#.', '.#.#.', '.#.#.', '#####', '#...#'], 'П': ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#'],
    'Я': ['.####', '#...#', '#...#', '.####', '..#.#', '.#..#', '#...#'], 'Л': ['..###', '.#..#', '.#..#', '.#..#', '.#..#', '#...#', '#...#'],
    'Ю': ['#..#.', '#.#.#', '#.#.#', '###.#', '#.#.#', '#.#.#', '#..#.'], 'К': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'], 'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'], 'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], 'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    'N': ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'], 'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'], 'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], 'I': ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
    'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'], 'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
    'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'], 'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'], 'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'], 'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'], '.': ['.....'] * 6 + ['..#..'],
    '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
}
BLOCKS = [  # (строки, a начала, z верха, клетка 5×7 в м, борта, цвет) - маркировка придуманная или общая техническая, без настоящих номеров
    (['NO LIFT'], 0.13, 0.024, 0.0018, (-1.0, 1.0), 'dark'),
    (['LOT 03-21', 'SN 4418-07'], 0.63, 0.078, 0.0016, (-1.0, 1.0), 'dark'),
    (['DO NOT DROP'], 0.84, 0.072, 0.0016, (-1.0, 1.0), 'dark'),
    (['NO LIFT ON WINGS'], 0.76, -0.040, 0.0024, (-1.0, 1.0), 'light'),
    (['ARM 2'], 1.16, -0.050, 0.0018, (-1.0, 1.0), 'light')]
HATCH = [(0.98, 1.06, 0.012, 0.058, 0.006)]
PLATE = (1.17, 1.30, 0.004, 0.052, 0.003)                                          # табличка у хвостового отсека (фото 02)
LABELS = [(0.795, 0.825, 0.022, 0.088), (1.105, 1.135, 0.022, 0.088)]             # тёмные бирки у стыков (фото 02)
ROUND = [(0.70, 0.040, 0.008), (1.24, -0.006, 0.007)]
SCREW_SEAMS = (0.59, 0.78, 1.09)


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
    im = bpy.data.images.new('SDB_stencil', W, H, alpha=True)
    px = np.zeros((H, W, 4), dtype=np.float32); px[..., 3] = A
    im.pixels.foreach_set(px.ravel()); im.alpha_mode = 'STRAIGHT'
    return im, cols, rows


BLOCK_IM = [(make_block(l), a, z, c, sd, k) for l, a, z, c, sd, k in BLOCKS]


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
    """Линии швов, лючков, таблички и крышек, головки винтов - в метрах по длине a и высоте Z (на оба борта)."""
    M = node_math(nodes, links); RR = lambda v, a, b: ramp(nodes, links, v, a, b)
    X, Yc, Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    rho = M('SQRT', M('ADD', M('MULTIPLY', X, X), M('MULTIPLY', Z, Z)))
    a_ = M('SUBTRACT', L / 2, Yc)
    hull = M('LESS_THAN', rho, 0.2)                                          # материал SDB_body - только на корпусе
    line = None
    for s_ in G['SEAMS']:
        l = M('MULTIPLY', RR(M('ABSOLUTE', M('SUBTRACT', a_, s_)), 0.0034, 0.0016), hull)
        line = l if line is None else M('MAXIMUM', line, l)
    def per(v, o, sp):
        p = M('SUBTRACT', v, o); return M('ABSOLUTE', M('SUBTRACT', p, M('MULTIPLY', M('ROUND', M('DIVIDE', p, sp)), sp)))
    head = None
    for (a0, a1, z0, z1, rc), screws in [(h, True) for h in HATCH] + [(PLATE, False)] + [((b0, b1, z0b, z1b, 0.002), False) for b0, b1, z0b, z1b in LABELS]:
        ca, cz, ha, hz = (a0 + a1) / 2, (z0 + z1) / 2, (a1 - a0) / 2, (z1 - z0) / 2
        qx = M('SUBTRACT', M('ABSOLUTE', M('SUBTRACT', a_, ca)), ha - rc); qz = M('SUBTRACT', M('ABSOLUTE', M('SUBTRACT', Z, cz)), hz - rc)
        ox, oz = M('MAXIMUM', qx, 0.0), M('MAXIMUM', qz, 0.0)
        sdf = M('SUBTRACT', M('ADD', M('SQRT', M('ADD', M('MULTIPLY', ox, ox), M('MULTIPLY', oz, oz))), M('MINIMUM', M('MAXIMUM', qx, qz), 0.0)), rc)
        line = M('MAXIMUM', line, M('MULTIPLY', RR(M('ABSOLUTE', sdf), 0.0030, 0.0013), hull))
        if not screws: continue
        g = M('GREATER_THAN', qz, qx)
        dper = M('ADD', M('MULTIPLY', per(a_, a0, 0.026), g), M('MULTIPLY', per(Z, z0, 0.026), M('SUBTRACT', 1.0, g)))
        din = M('ADD', sdf, 0.0068)
        hd = M('MULTIPLY', RR(M('SQRT', M('ADD', M('MULTIPLY', dper, dper), M('MULTIPLY', din, din))), 0.0040, 0.0019), hull)
        head = hd if head is None else M('MAXIMUM', head, hd)
    for ac, zc, rc in ROUND:
        dy = M('SUBTRACT', a_, ac); dz = M('SUBTRACT', Z, zc)
        dd = M('SQRT', M('ADD', M('MULTIPLY', dy, dy), M('MULTIPLY', dz, dz)))
        line = M('MAXIMUM', line, M('MULTIPLY', RR(M('ABSOLUTE', M('SUBTRACT', dd, rc)), 0.0028, 0.0013), hull))
    # винты рядами по обе стороны стыков отсеков, 24 по окружности
    ga = M('ARCTAN2', X, Z); st = 2 * math.pi / 24
    arcd = M('MULTIPLY', M('SUBTRACT', ga, M('MULTIPLY', M('ROUND', M('DIVIDE', ga, st)), st)), R)
    for s_ in SCREW_SEAMS:
        for o_ in (-0.011, 0.011):
            dy = M('SUBTRACT', a_, s_ + o_)
            l = M('MULTIPLY', RR(M('SQRT', M('ADD', M('MULTIPLY', arcd, arcd), M('MULTIPLY', dy, dy))), 0.0040, 0.0019), hull)
            head = M('MAXIMUM', head, l)
    return line, head


def tailmarks(nodes, links, sep):
    """Хвостовой отсек (металл): кольцевые стыки, лючки по бортам с винтами, ряды винтов у стыков."""
    M = node_math(nodes, links); RR = lambda v, a, b: ramp(nodes, links, v, a, b)
    X, Yc, Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    a_ = M('SUBTRACT', L / 2, Yc)
    rho = M('SQRT', M('ADD', M('MULTIPLY', X, X), M('MULTIPLY', Z, Z))); body_ = M('LESS_THAN', rho, 0.100)
    line = None
    for s_, rl in ((1.46, 0.098), (1.745, 0.074)):                                     # отсечка по радиусу - чтобы не резать корни рулей
        l = M('MULTIPLY', RR(M('ABSOLUTE', M('SUBTRACT', a_, s_)), 0.0030, 0.0014), M('LESS_THAN', rho, rl))
        line = l if line is None else M('MAXIMUM', line, l)
    head = None
    def per(v, o, sp):
        p = M('SUBTRACT', v, o); return M('ABSOLUTE', M('SUBTRACT', p, M('MULTIPLY', M('ROUND', M('DIVIDE', p, sp)), sp)))
    for (a0, a1, z0, z1, rc) in ((1.48, 1.62, -0.024, 0.024, 0.005),):
        ca, cz, ha, hz = (a0 + a1) / 2, (z0 + z1) / 2, (a1 - a0) / 2, (z1 - z0) / 2
        qx = M('SUBTRACT', M('ABSOLUTE', M('SUBTRACT', a_, ca)), ha - rc); qz = M('SUBTRACT', M('ABSOLUTE', M('SUBTRACT', Z, cz)), hz - rc)
        ox, oz = M('MAXIMUM', qx, 0.0), M('MAXIMUM', qz, 0.0)
        sdf = M('SUBTRACT', M('ADD', M('SQRT', M('ADD', M('MULTIPLY', ox, ox), M('MULTIPLY', oz, oz))), M('MINIMUM', M('MAXIMUM', qx, qz), 0.0)), rc)
        line = M('MAXIMUM', line, M('MULTIPLY', RR(M('ABSOLUTE', sdf), 0.0028, 0.0012), body_))
        g = M('GREATER_THAN', qz, qx)
        dper = M('ADD', M('MULTIPLY', per(a_, a0, 0.024), g), M('MULTIPLY', per(Z, z0, 0.024), M('SUBTRACT', 1.0, g)))
        din = M('ADD', sdf, 0.006)
        head = M('MULTIPLY', RR(M('SQRT', M('ADD', M('MULTIPLY', dper, dper), M('MULTIPLY', din, din))), 0.0036, 0.0017), body_)
    ga = M('ARCTAN2', X, Z); st = 2 * math.pi / 16
    arcd = M('MULTIPLY', M('SUBTRACT', ga, M('MULTIPLY', M('ROUND', M('DIVIDE', M('ADD', ga, st / 2), st)), st)), 0.085)
    for s_, rl in ((1.472, 0.097), (1.733, 0.076)):
        dy = M('SUBTRACT', a_, s_)
        l = M('MULTIPLY', RR(M('SQRT', M('ADD', M('MULTIPLY', arcd, arcd), M('MULTIPLY', dy, dy))), 0.0036, 0.0017), M('LESS_THAN', rho, rl))
        head = M('MAXIMUM', head, l)
    return line, head



def build_pattern(mat):
    nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for n in list(nodes):
        if n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): nodes.remove(n)
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL'); prin = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    kind = mat.name
    col = BASE if kind in ('SDB_body', 'SDB_wing') else tuple(prin.inputs['Base Color'].default_value)[:3]
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
    a1 = maprange(ao1.outputs['AO'], 0, 1, 0.42, 1.0); a2 = maprange(ao2.outputs['AO'], 0, 1, 0.70, 1.0)
    def noise(scale, detail, rough, lo, hi):
        n = N('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(pos, n.inputs['Vector']); return maprange(n.outputs['Fac'], lo, hi, 0.0, 1.0)
    gm = N('ShaderNodeMapping'); gm.inputs['Scale'].default_value = (330.0, 330.0, 330.0); links.new(pos, gm.inputs['Vector'])
    wn = N('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; links.new(gm.outputs['Vector'], wn.inputs['Vector'])
    grain = M('ADD', 1.0, M('MULTIPLY', M('SUBTRACT', wn.outputs['Value'], 0.5), 0.04))
    bev = N('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.0022; bev.samples = 6
    dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; links.new(bev.outputs['Normal'], dot.inputs[0]); links.new(geo.outputs['Normal'], dot.inputs[1])
    edge = maprange(dot.outputs['Value'], 1.0, 0.93, 0.0, 1.0)
    bev2 = N('ShaderNodeBevel'); bev2.inputs['Radius'].default_value = 0.009; bev2.samples = 6
    dot2 = N('ShaderNodeVectorMath'); dot2.operation = 'DOT_PRODUCT'; links.new(bev2.outputs['Normal'], dot2.inputs[0]); links.new(geo.outputs['Normal'], dot2.inputs[1])
    zone = maprange(dot2.outputs['Value'], 1.0, 0.90, 0.0, 1.0)
    chip = M('MULTIPLY', zone, noise(26.0, 5.0, 0.6, 0.54, 0.66))
    scuff = noise(5.0, 7.0, 0.62, 0.50, 0.72); patch = noise(1.5, 4.0, 0.55, 0.38, 0.66); fine = noise(40.0, 4.0, 0.6, 0.38, 0.66)
    a_ = M('SUBTRACT', L / 2, Yc)
    c = rgb(col)
    def stencils(c, which, colr, gate):
        for (imt, cl_, rw_), as_, zs_, cell_, sides_, kind_ in BLOCK_IM:
            if kind_ != which: continue
            wt, ht = cl_ * cell_, rw_ * cell_; ybs = Yb(as_)
            for s in sides_:
                u = M('DIVIDE', M('MULTIPLY', M('SUBTRACT', Yc, ybs if s < 0 else (ybs - wt)), s), wt)
                v = M('ADD', 1.0, M('DIVIDE', M('SUBTRACT', Z, zs_), ht))
                u = M('SUBTRACT', 1.0, u); v = M('SUBTRACT', 1.0, v)                 # Mark: надписи читаются крыльями вверх (как УМПК, в файле подвески они вверх ногами)
                cmb = N('ShaderNodeCombineXYZ'); links.new(u, cmb.inputs['X']); links.new(v, cmb.inputs['Y'])
                tx = N('ShaderNodeTexImage'); tx.image = imt; tx.extension = 'CLIP'; tx.interpolation = 'Linear'; links.new(cmb.outputs['Vector'], tx.inputs['Vector'])
                c = mixc(c, colr, M('MULTIPLY', M('MULTIPLY', M('MULTIPLY', tx.outputs['Alpha'], maprange(M('MULTIPLY', gsep.outputs['X'], s), 0.10, 0.22, 0.0, 1.0)), gate), 0.90))
        return c
    if kind == 'SDB_body':
        rho_ = M('SQRT', M('ADD', M('MULTIPLY', X, X), M('MULTIPLY', Z, Z))); hullm = M('LESS_THAN', rho_, 0.2)
        tone = 1.0
        for s_, k_t in ((0.59, 1.012), (0.78, 0.99), (1.09, 1.01)):
            tone = M('MULTIPLY', tone, M('ADD', 1.0, M('MULTIPLY', M('GREATER_THAN', a_, s_), k_t - 1.0)))
        c = mixc(c, gray(tone), 1.0, 'MULTIPLY')
        def band(a0, a1): return M('MULTIPLY', M('MULTIPLY', M('GREATER_THAN', a_, a0), M('LESS_THAN', a_, a1)), hullm)
        c = mixc(c, mixc(rgb((0.30, 0.21, 0.13)), rgb((0.20, 0.12, 0.07)), noise(30.0, 3.0, 0.5, 0.3, 0.7)), M('LESS_THAN', a_, 0.09))   # колпачок носа: бурый (02, 03)
        c = mixc(c, rgb((0.80, 0.55, 0.035)), band(0.505, 0.553))                                         # жёлтая полоса боевой части
        a0_, a1_, z0_, z1_, _ = PLATE
        inpl = M('MULTIPLY', M('MULTIPLY', M('GREATER_THAN', a_, a0_), M('LESS_THAN', a_, a1_)), M('MULTIPLY', M('GREATER_THAN', Z, z0_), M('LESS_THAN', Z, z1_)))
        inpl = M('MULTIPLY', M('MULTIPLY', inpl, hullm), maprange(M('ABSOLUTE', gsep.outputs['X']), 0.10, 0.22, 0.0, 1.0))
        c = mixc(c, rgb((0.72, 0.73, 0.72)), inpl)
        txt = M('MULTIPLY', M('MULTIPLY', M('GREATER_THAN', a_, a0_ + 0.008), M('LESS_THAN', a_, a1_ - 0.008)), M('MULTIPLY', M('GREATER_THAN', Z, z0_ + 0.005), M('LESS_THAN', Z, z1_ - 0.005)))
        rows = M('LESS_THAN', M('FRACT', M('DIVIDE', M('SUBTRACT', Z, z0_), 0.0050)), 0.36)
        dash = M('GREATER_THAN', noise(260.0, 1.0, 0.5, 0.0, 1.0), 0.35)
        c = mixc(c, rgb((0.10, 0.10, 0.11)), M('MULTIPLY', M('MULTIPLY', M('MULTIPLY', txt, rows), M('MULTIPLY', dash, inpl)), 0.85))
        for b0, b1, z0b, z1b in LABELS:                                                                 # тёмные бирки поперёк стыков, светлые строки
            lab = M('MULTIPLY', M('MULTIPLY', M('GREATER_THAN', a_, b0), M('LESS_THAN', a_, b1)), M('MULTIPLY', M('GREATER_THAN', Z, z0b), M('LESS_THAN', Z, z1b)))
            lab = M('MULTIPLY', lab, hullm); c = mixc(c, rgb((0.03, 0.03, 0.035)), lab)
            lt = M('MULTIPLY', M('LESS_THAN', M('FRACT', M('DIVIDE', M('SUBTRACT', a_, b0), 0.0060)), 0.35), M('GREATER_THAN', noise(200.0, 1.0, 0.5, 0.0, 1.0), 0.4))
            lt = M('MULTIPLY', lt, M('MULTIPLY', M('GREATER_THAN', Z, z0b + 0.006), M('LESS_THAN', Z, z1b - 0.006)))
            c = mixc(c, rgb((0.55, 0.56, 0.56)), M('MULTIPLY', M('MULTIPLY', lab, lt), 0.8))
        c = mixc(c, mixc(c, gray(0.88), 1.0, 'MULTIPLY'), M('MULTIPLY', patch, 0.45))
        c = mixc(c, mixc(c, gray(0.94), 1.0, 'MULTIPLY'), M('MULTIPLY', scuff, 0.40))
        c = mixc(c, mixc(c, gray(1.04), 1.0, 'MULTIPLY'), M('MULTIPLY', fine, 0.40))
        mp = N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (70.0, 1.6, 70.0); links.new(pos, mp.inputs['Vector'])
        nst = N('ShaderNodeTexNoise'); nst.inputs['Scale'].default_value = 1.0; nst.inputs['Detail'].default_value = 5.0; nst.inputs['Roughness'].default_value = 0.62; links.new(mp.outputs['Vector'], nst.inputs['Vector'])
        streak = maprange(nst.outputs['Fac'], 0.46, 0.70, 0.0, 1.0)
        c = mixc(c, mixc(c, gray(0.92), 1.0, 'MULTIPLY'), M('MULTIPLY', streak, 0.30))
        ms = N('ShaderNodeMapping'); ms.inputs['Scale'].default_value = (420.0, 7.0, 420.0); links.new(pos, ms.inputs['Vector'])
        nsc = N('ShaderNodeTexNoise'); nsc.inputs['Scale'].default_value = 1.0; nsc.inputs['Detail'].default_value = 3.0; links.new(ms.outputs['Vector'], nsc.inputs['Vector'])
        scr = M('MULTIPLY', maprange(nsc.outputs['Fac'], 0.67, 0.74, 0.0, 1.0), noise(3.0, 3.0, 0.5, 0.5, 0.7))
        c = mixc(c, rgb((0.70, 0.72, 0.74)), M('MULTIPLY', scr, 0.35))
        c = stencils(c, 'dark', rgb((0.018, 0.018, 0.02)), hullm)
        line, head = marks(nodes, links, sep)
        for s_ in G['SEAMS']:
            bnd = M('MULTIPLY', maprange(M('ABSOLUTE', M('SUBTRACT', a_, s_)), 0.020, 0.003, 0.0, 1.0), hullm)
            c = mixc(c, mixc(c, gray(0.85), 1.0, 'MULTIPLY'), M('MULTIPLY', bnd, M('ADD', 0.30, M('MULTIPLY', patch, 0.4))))
        c = mixc(c, rgb((0.22, 0.23, 0.25)), M('MULTIPLY', head, 0.65))
        c = mixc(c, rgb((0.04, 0.04, 0.045)), M('MULTIPLY', line, 0.80))
        c = mixc(c, rgb((0.40, 0.41, 0.42)), M('MULTIPLY', M('ADD', M('MULTIPLY', edge, 0.4), M('MULTIPLY', chip, 0.7), clamp=True), 0.55))
    elif kind == 'SDB_wing':
        c = mixc(c, mixc(c, gray(0.88), 1.0, 'MULTIPLY'), M('MULTIPLY', patch, 0.45))
        c = mixc(c, mixc(c, gray(0.94), 1.0, 'MULTIPLY'), M('MULTIPLY', scuff, 0.45))
        c = mixc(c, mixc(c, gray(1.04), 1.0, 'MULTIPLY'), M('MULTIPLY', fine, 0.40))
        c = mixc(c, rgb((0.36, 0.37, 0.38)), M('MULTIPLY', M('ADD', M('MULTIPLY', edge, 0.6), M('MULTIPLY', chip, 0.9), clamp=True), 0.65))   # потёртые кромки (выдвижные крылья)
    elif kind == 'SDB_metal':
        c = mixc(c, mixc(c, gray(0.80), 1.0, 'MULTIPLY'), M('MULTIPLY', patch, 0.6))
        c = mixc(c, rgb((0.26, 0.25, 0.24)), M('MULTIPLY', scuff, 0.45))
        c = mixc(c, rgb((0.55, 0.55, 0.54)), M('MULTIPLY', edge, 0.55))
        c = mixc(c, rgb((0.16, 0.15, 0.14)), M('MULTIPLY', maprange(a_, 1.70, 1.80, 0.0, 1.0), 0.5))      # к торцу темнее
        c = mixc(c, mixc(c, gray(0.70), 1.0, 'MULTIPLY'), M('MULTIPLY', streak_t, 0.45)) if False else c
        tl, th = tailmarks(nodes, links, sep)
        c = mixc(c, rgb((0.05, 0.05, 0.05)), M('MULTIPLY', tl, 0.75))
        c = mixc(c, rgb((0.55, 0.55, 0.53)), M('MULTIPLY', th, 0.7))
        c = mixc(c, mixc(c, gray(0.75), 1.0, 'MULTIPLY'), M('MULTIPLY', M('MULTIPLY', maprange(Z, 0.0, -0.09, 0.0, 1.0), fine), 0.6))   # грязь снизу
    else:
        c = mixc(c, rgb((0.022, 0.022, 0.026)), 1.0)                      # чёрный короб крыльев
        c = mixc(c, rgb((0.045, 0.045, 0.05)), M('MULTIPLY', scuff, 0.6))
        c = mixc(c, rgb((0.10, 0.10, 0.11)), M('MULTIPLY', M('ADD', M('MULTIPLY', edge, 0.5), M('MULTIPLY', chip, 0.6), clamp=True), 0.6))
        c = stencils(c, 'light', rgb((0.62, 0.63, 0.64)), 1.0)
    c = mixc(c, gray(M('MULTIPLY', a1, a2)), 1.0, 'MULTIPLY')
    c = mixc(c, gray(grain), 1.0, 'MULTIPLY')
    emi = N('ShaderNodeEmission'); links.new(c, emi.inputs['Color'])
    links.new(emi.outputs['Emission'], out.inputs['Surface'])
    tex = N('ShaderNodeTexImage'); tex.image = img
    for n in nodes: n.select = False
    tex.select = True; nodes.active = tex
    return out, prin, tex, col


rig = {m.name: build_pattern(m) for m in mats}
log('шейдеры готовы, тон:', VARIANT)
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
    k_fine, bev_r = {'SDB_body': (0.18, 0.0018), 'SDB_wing': (0.16, 0.0015), 'SDB_metal': (0.22, 0.0012), 'SDB_dark': (0.08, 0.001)}[mat.name]
    geo, sep = coords(nodes, links)
    bev = nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = bev_r; bev.samples = 10
    def noise(scale, detail, rough):
        n = nodes.new('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(geo.outputs['Position'], n.inputs['Vector']); return n.outputs['Fac']
    M = node_math(nodes, links)
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.002; bump.inputs['Strength'].default_value = 1.0
    h = M('ADD', M('MULTIPLY', noise(150.0, 3.0, 0.55), 0.50 * k_fine), M('MULTIPLY', noise(14.0, 3.0, 0.5), 0.55 * k_fine))
    if mat.name == 'SDB_metal':
        line, head = tailmarks(nodes, links, sep)
        h = M('ADD', M('ADD', h, M('MULTIPLY', head, 2.0)), M('MULTIPLY', line, -1.8))
    if mat.name == 'SDB_body':
        line, head = marks(nodes, links, sep)
        h = M('ADD', M('ADD', h, M('MULTIPLY', head, 2.0)), M('MULTIPLY', line, -1.8))
    links.new(h, bump.inputs['Height'])
    links.new(bev.outputs['Normal'], bump.inputs['Normal'])
    links.new(bump.outputs['Normal'], prin.inputs['Normal'])


nimg = bpy.data.images.get('SDB_normal')
if nimg is not None: bpy.data.images.remove(nimg)
nimg = bpy.data.images.new('SDB_normal', NSIZE, NSIZE, alpha=False)
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
npath = os.path.join(OUT, 'gbu39_normal.png')
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
for im in [i for i in bpy.data.images if i.name.startswith('SDB_stencil')]: bpy.data.images.remove(im)
log('материалы подключены')


def lite(image, name, fmt, fname, px):
    c = image.copy(); c.name = name; c.scale(px, px); c.file_format = fmt
    p_ = os.path.join(OUT, fname)
    try: c.save(filepath=p_, quality=92)
    except TypeError:
        c.filepath_raw = p_; c.save()
    bpy.data.images.remove(c)
    return p_


lite(img, f'SDB_detail_{GAME_TEX}', 'JPEG', f'gbu39_detail_{GAME_TEX}.jpg', GAME_TEX); lite(nimg, f'SDB_normal_{GAME_NTEX}', 'PNG', f'gbu39_normal_{GAME_NTEX}.png', GAME_NTEX)
log('облегчённые копии готовы')
