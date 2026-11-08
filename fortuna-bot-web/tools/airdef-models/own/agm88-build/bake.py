# bake.py - запекает текстуры AGM-88 HARM: цвет (agm88_detail.png: белая краска по фото 01/04, оттенки отсеков, оранжевая полоса за головкой,
# жёлтая у боевой части, коричневая у двигателя, швы, лючки с винтами, табличка, придуманная мелкая техническая маркировка, лёгкая грязь, копоть у сопла) и нормали.
# Запуск после build.py: HRM_OUT="<папка>" [HRM_TEX=2048] Blender -b --factory-startup --python build.py --python bake.py [--python _trial.py | --python deliver.py]
import os, sys, math, time
sys.dont_write_bytecode = True
import bpy
import modelkit as mk
import numpy as np

OUT = os.environ.get('HRM_OUT')
if not OUT: raise SystemExit('Задай HRM_OUT=<папка модели>')
SIZE = int(os.environ.get('HRM_TEX', '2048')); NSIZE = int(os.environ.get('HRM_NTEX', str(SIZE)))
GAME_TEX, GAME_NTEX = int(os.environ.get('HRM_GAME_TEX', '1024')), int(os.environ.get('HRM_GAME_NTEX', '512'))
VARIANT = 'белая'
BASE = tuple(float(v) for v in os.environ.get('HRM_BASE', '0.90,0.90,0.885').split(','))   # линейные; фото 01 бок sRGB ~200/201/197, верх ~220, фото 04 ~241/238/244
T0 = time.time()
sc = bpy.data.scenes['AGM88']
if bpy.context.window: bpy.context.window.scene = sc
vl = bpy.context.view_layer; vl.update()
objs = [o for o in sc.objects if o.type == 'MESH']
body = next(o for o in objs if o.name == 'HRM_body')
G = mk.GEO; L = G['L']; R = G['R']; NSEG = 40
BREAKS = (0.814, 1.604, 2.114, 2.75, 3.40, 3.694)                                 # куски развёртки корпуса по стыкам: полоса 0,8 × 4,2 м иначе съедает атлас
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

old = bpy.data.images.get('HRM_detail')
if old is not None: bpy.data.images.remove(old)
path = os.path.join(OUT, 'agm88_detail.png')
img = bpy.data.images.new('HRM_detail', SIZE, SIZE, alpha=False); img.generated_color = (1, 1, 1, 1)
mats = [m for m in bpy.data.materials if m.name in ('HRM_body', 'HRM_metal', 'HRM_dark', 'HRM_radome')]
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
BLOCKS = [  # (строки, a начала, z верха, клетка 5×7 в м, борта) - вся маркировка придуманная, без настоящих номеров
    (['GUIDANCE SECTION', 'LOT 4-17 WR-06', 'SN 0912-34'], 0.43, 0.060, 0.0019, (-1.0, 1.0)),
    (['WARHEAD SECTION', 'LOT 11-08 HE'], 0.95, 0.078, 0.0019, (-1.0, 1.0)),
    (['CONTROL SECTION', 'SN 2207-15'], 1.63, 0.024, 0.0018, (-1.0, 1.0)),
    (['ROCKET MOTOR', 'LOT 02-19', 'DO NOT DROP'], 2.25, 0.034, 0.0019, (-1.0, 1.0)),
    (['HANDLE WITH CARE'], 3.18, -0.030, 0.0016, (-1.0, 1.0)),
    (['SN 31-07'], 3.77, 0.050, 0.0017, (-1.0, 1.0)),
    (['RADOME', 'NO PAINT'], 0.235, 0.030, 0.0015, (-1.0, 1.0))]
# лючки (a0, a1, z0, z1, радиус угла) - по фото 01: длинный у головки, два больших на отсеке боевой части, малые на отсеке рулей и хвосте
HATCH = [(0.50, 0.76, -0.078, -0.020, 0.010), (0.92, 1.16, -0.066, 0.036, 0.012), (1.20, 1.44, -0.066, 0.036, 0.012),
         (1.86, 1.96, -0.036, 0.024, 0.006), (3.84, 3.94, -0.040, 0.020, 0.006)]
PLATE = (2.62, 2.80, -0.004, 0.036, 0.003)                                          # табличка двигателя (фото 04)
ROUND = [(0.30, -0.010, 0.010), (1.50, -0.045, 0.012), (2.03, -0.060, 0.009), (3.55, 0.005, 0.010)]
SCREW_SEAMS = (0.81, 1.60, 2.11, 3.69)


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
    im = bpy.data.images.new('HRM_stencil', W, H, alpha=True)
    px = np.zeros((H, W, 4), dtype=np.float32); px[..., 3] = A
    im.pixels.foreach_set(px.ravel()); im.alpha_mode = 'STRAIGHT'
    return im, cols, rows


BLOCK_IM = [(make_block(l), a, z, c, sd) for l, a, z, c, sd in BLOCKS]


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
    hull = M('LESS_THAN', rho, 0.130)
    line = None
    for s_ in G['SEAMS']:
        l = M('MULTIPLY', RR(M('ABSOLUTE', M('SUBTRACT', a_, s_)), 0.0034, 0.0016), hull)
        line = l if line is None else M('MAXIMUM', line, l)
    def per(v, o, sp):
        p = M('SUBTRACT', v, o); return M('ABSOLUTE', M('SUBTRACT', p, M('MULTIPLY', M('ROUND', M('DIVIDE', p, sp)), sp)))
    head = None
    for (a0, a1, z0, z1, rc), screws in [(h, True) for h in HATCH] + [(PLATE, False)]:
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


def build_pattern(mat):
    nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for n in list(nodes):
        if n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): nodes.remove(n)
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL'); prin = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    kind = mat.name
    col = BASE if kind == 'HRM_body' else (tuple(v * k for v, k in zip(BASE, (0.93, 0.915, 0.905))) if kind == 'HRM_radome' else tuple(prin.inputs['Base Color'].default_value)[:3])
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
    if kind in ('HRM_body', 'HRM_radome'):
        rho_ = M('SQRT', M('ADD', M('MULTIPLY', X, X), M('MULTIPLY', Z, Z))); hullm = M('LESS_THAN', rho_, 0.130)
        tone = 1.0
        for s_, k_t in ((0.20, 1.0), (0.38, 0.99), (0.81, 1.012), (1.60, 0.99), (2.11, 1.008), (3.69, 0.985)):
            tone = M('MULTIPLY', tone, M('ADD', 1.0, M('MULTIPLY', M('GREATER_THAN', a_, s_), k_t - 1.0)))
        c = mixc(c, gray(tone), 1.0, 'MULTIPLY')
        def band(a0, a1): return M('MULTIPLY', M('MULTIPLY', M('GREATER_THAN', a_, a0), M('LESS_THAN', a_, a1)), hullm)
        c = mixc(c, rgb((0.58, 0.21, 0.006)), band(0.818, 0.874))              # оранжевая за головкой (фото 01)
        c = mixc(c, rgb((0.66, 0.42, 0.06)), band(1.556, 1.596))              # жёлтая у боевой части
        for e_ in (1.556, 1.596):
            c = mixc(c, rgb((0.22, 0.11, 0.03)), M('MULTIPLY', M('MULTIPLY', M('LESS_THAN', M('ABSOLUTE', M('SUBTRACT', a_, e_)), 0.0013), hullm), 0.7))
        c = mixc(c, rgb((0.26, 0.11, 0.035)), band(2.118, 2.152))             # коричневая у двигателя
        # табличка двигателя: светло-серая, строки текста полосками
        a0_, a1_, z0_, z1_, _ = PLATE
        inpl = M('MULTIPLY', M('MULTIPLY', M('GREATER_THAN', a_, a0_), M('LESS_THAN', a_, a1_)), M('MULTIPLY', M('GREATER_THAN', Z, z0_), M('LESS_THAN', Z, z1_)))
        inpl = M('MULTIPLY', M('MULTIPLY', inpl, hullm), maprange(M('ABSOLUTE', gsep.outputs['X']), 0.10, 0.22, 0.0, 1.0))
        c = mixc(c, rgb((0.50, 0.51, 0.52)), inpl)
        txt = M('MULTIPLY', M('MULTIPLY', M('GREATER_THAN', a_, a0_ + 0.010), M('LESS_THAN', a_, a1_ - 0.010)), M('MULTIPLY', M('GREATER_THAN', Z, z0_ + 0.006), M('LESS_THAN', Z, z1_ - 0.006)))
        rows = M('LESS_THAN', M('FRACT', M('DIVIDE', M('SUBTRACT', Z, z0_), 0.0055)), 0.38)
        dash = M('GREATER_THAN', noise(260.0, 1.0, 0.5, 0.0, 1.0), 0.35)
        c = mixc(c, rgb((0.16, 0.16, 0.17)), M('MULTIPLY', M('MULTIPLY', M('MULTIPLY', txt, rows), M('MULTIPLY', dash, inpl)), 0.8))
        # потёртости и грязь: на белом видна каждая мелочь - держим мягко
        c = mixc(c, mixc(c, gray(0.90), 1.0, 'MULTIPLY'), M('MULTIPLY', patch, 0.45))
        c = mixc(c, mixc(c, gray(0.95), 1.0, 'MULTIPLY'), M('MULTIPLY', scuff, 0.40))
        c = mixc(c, mixc(c, gray(1.03), 1.0, 'MULTIPLY'), M('MULTIPLY', fine, 0.40))
        mp = N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (70.0, 1.6, 70.0); links.new(pos, mp.inputs['Vector'])
        nst = N('ShaderNodeTexNoise'); nst.inputs['Scale'].default_value = 1.0; nst.inputs['Detail'].default_value = 5.0; nst.inputs['Roughness'].default_value = 0.62; links.new(mp.outputs['Vector'], nst.inputs['Vector'])
        streak = maprange(nst.outputs['Fac'], 0.46, 0.70, 0.0, 1.0)
        c = mixc(c, mixc(c, gray(0.93), 1.0, 'MULTIPLY'), M('MULTIPLY', streak, 0.30))
        c = mixc(c, mixc(c, gray(0.90), 1.0, 'MULTIPLY'), M('MULTIPLY', maprange(Z, -0.03, -0.125, 0.0, 1.0), M('ADD', 0.35, M('MULTIPLY', patch, 0.5))))   # низ грязнее
        soot = M('MULTIPLY', maprange(a_, 3.96, 4.105, 0.0, 1.0), M('ADD', 0.45, M('MULTIPLY', noise(9.0, 4.0, 0.6, 0.35, 0.7), 0.5)))
        c = mixc(c, rgb((0.10, 0.095, 0.09)), M('MULTIPLY', M('MULTIPLY', soot, hullm), 0.75))                                    # копоть к соплу
        ms = N('ShaderNodeMapping'); ms.inputs['Scale'].default_value = (420.0, 7.0, 420.0); links.new(pos, ms.inputs['Vector'])
        nsc = N('ShaderNodeTexNoise'); nsc.inputs['Scale'].default_value = 1.0; nsc.inputs['Detail'].default_value = 3.0; links.new(ms.outputs['Vector'], nsc.inputs['Vector'])
        scr = M('MULTIPLY', maprange(nsc.outputs['Fac'], 0.67, 0.74, 0.0, 1.0), noise(3.0, 3.0, 0.5, 0.5, 0.7))
        c = mixc(c, rgb((0.55, 0.56, 0.56)), M('MULTIPLY', scr, 0.40))
        for (imt, cl_, rw_), as_, zs_, cell_, sides_ in BLOCK_IM:
            wt, ht = cl_ * cell_, rw_ * cell_; ybs = Yb(as_)
            for s in sides_:
                u = M('DIVIDE', M('MULTIPLY', M('SUBTRACT', Yc, ybs if s < 0 else (ybs - wt)), s), wt)
                v = M('ADD', 1.0, M('DIVIDE', M('SUBTRACT', Z, zs_), ht))
                cmb = N('ShaderNodeCombineXYZ'); links.new(u, cmb.inputs['X']); links.new(v, cmb.inputs['Y'])
                tx = N('ShaderNodeTexImage'); tx.image = imt; tx.extension = 'CLIP'; tx.interpolation = 'Linear'; links.new(cmb.outputs['Vector'], tx.inputs['Vector'])
                c = mixc(c, rgb((0.018, 0.018, 0.02)), M('MULTIPLY', M('MULTIPLY', M('MULTIPLY', tx.outputs['Alpha'], maprange(M('MULTIPLY', gsep.outputs['X'], s), 0.10, 0.22, 0.0, 1.0)), hullm), 0.90))
        line, head = marks(nodes, links, sep)
        for s_ in G['SEAMS']:                                              # лёгкая грязь у швов
            bnd = M('MULTIPLY', maprange(M('ABSOLUTE', M('SUBTRACT', a_, s_)), 0.022, 0.003, 0.0, 1.0), hullm)
            c = mixc(c, mixc(c, gray(0.86), 1.0, 'MULTIPLY'), M('MULTIPLY', bnd, M('ADD', 0.30, M('MULTIPLY', patch, 0.4))))
        c = mixc(c, rgb((0.30, 0.31, 0.32)), M('MULTIPLY', head, 0.65))
        c = mixc(c, rgb((0.05, 0.05, 0.055)), M('MULTIPLY', line, 0.80))
        c = mixc(c, rgb((0.50, 0.51, 0.50)), M('MULTIPLY', M('ADD', M('MULTIPLY', edge, 0.4), M('MULTIPLY', chip, 0.7), clamp=True), 0.55))
    elif kind == 'HRM_metal':
        c = mixc(c, rgb((0.30, 0.30, 0.30)), M('MULTIPLY', scuff, 0.45))
        c = mixc(c, rgb((0.50, 0.50, 0.50)), M('MULTIPLY', edge, 0.45))
        heat = maprange(a_, 3.98, 4.10, 0.0, 1.0)                           # раструб сопла: побежалость и нагар
        c = mixc(c, mixc(rgb((0.10, 0.09, 0.08)), rgb((0.09, 0.10, 0.15)), noise(6.0, 3.0, 0.5, 0.3, 0.7)), M('MULTIPLY', heat, 0.85))
        rho_n = M('SQRT', M('ADD', M('MULTIPLY', X, X), M('MULTIPLY', Z, Z)))
        inner = M('MULTIPLY', M('GREATER_THAN', a_, 3.95), M('LESS_THAN', rho_n, 0.0995))                  # внутри раструба - нагар
        c = mixc(c, rgb((0.012, 0.011, 0.010)), M('MULTIPLY', inner, M('ADD', 0.75, M('MULTIPLY', noise(14.0, 3.0, 0.5, 0.3, 0.7), 0.2))))
    else:
        c = mixc(c, rgb((0.018, 0.018, 0.02)), 1.0)                       # тёмный анодированный металл
        c = mixc(c, rgb((0.03, 0.03, 0.032)), M('MULTIPLY', fine, 0.6))
        c = mixc(c, rgb((0.11, 0.11, 0.115)), M('MULTIPLY', edge, 0.6))
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
    k_fine, bev_r = {'HRM_body': (0.18, 0.0018), 'HRM_radome': (0.10, 0.0015), 'HRM_metal': (0.14, 0.0012), 'HRM_dark': (0.05, 0.001)}[mat.name]
    geo, sep = coords(nodes, links)
    bev = nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = bev_r; bev.samples = 10
    def noise(scale, detail, rough):
        n = nodes.new('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(geo.outputs['Position'], n.inputs['Vector']); return n.outputs['Fac']
    M = node_math(nodes, links)
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.002; bump.inputs['Strength'].default_value = 1.0
    h = M('ADD', M('MULTIPLY', noise(150.0, 3.0, 0.55), 0.50 * k_fine), M('MULTIPLY', noise(14.0, 3.0, 0.5), 0.55 * k_fine))
    if mat.name in ('HRM_body', 'HRM_radome'):
        line, head = marks(nodes, links, sep)
        h = M('ADD', M('ADD', h, M('MULTIPLY', head, 2.0)), M('MULTIPLY', line, -1.8))
    links.new(h, bump.inputs['Height'])
    links.new(bev.outputs['Normal'], bump.inputs['Normal'])
    links.new(bump.outputs['Normal'], prin.inputs['Normal'])


nimg = bpy.data.images.get('HRM_normal')
if nimg is not None: bpy.data.images.remove(nimg)
nimg = bpy.data.images.new('HRM_normal', NSIZE, NSIZE, alpha=False)
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
npath = os.path.join(OUT, 'agm88_normal.png')
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
for im in [i for i in bpy.data.images if i.name.startswith('HRM_stencil')]: bpy.data.images.remove(im)
log('материалы подключены')


def lite(image, name, fmt, fname, px):
    c = image.copy(); c.name = name; c.scale(px, px); c.file_format = fmt
    p_ = os.path.join(OUT, fname)
    try: c.save(filepath=p_, quality=92)
    except TypeError:
        c.filepath_raw = p_; c.save()
    bpy.data.images.remove(c)
    return p_


lite(img, f'HRM_detail_{GAME_TEX}', 'JPEG', f'agm88_detail_{GAME_TEX}.jpg', GAME_TEX); lite(nimg, f'HRM_normal_{GAME_NTEX}', 'PNG', f'agm88_normal_{GAME_NTEX}.png', GAME_NTEX)
log('облегчённые копии готовы')
