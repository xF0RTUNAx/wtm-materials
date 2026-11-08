# bake.py - запекает текстуры Б-8: цвет (b8_detail.png: некрашеный светлый металл по фото 01/03/04/05 - листы разного тона, окисел, шлифовка, потёки, царапины,
# красные полосы-метки и придуманные красные номера, табличка, стыки с заклёпками, лючок; тёмные торцы и трубы; ракеты в цветах нашей С-8) и нормали.
# Запуск после build.py: B8_OUT="<папка>" [B8_TEX=2048] Blender -b --factory-startup --python build.py --python bake.py [--python _trial.py | --python deliver.py]
import os, sys, math, time
sys.dont_write_bytecode = True
import bpy
import modelkit as mk
import numpy as np

OUT = os.environ.get('B8_OUT')
if not OUT: raise SystemExit('Задай B8_OUT=<папка модели>')
SIZE = int(os.environ.get('B8_TEX', '2048')); NSIZE = int(os.environ.get('B8_NTEX', str(SIZE)))
GAME_TEX, GAME_NTEX = int(os.environ.get('B8_GAME_TEX', '1024')), int(os.environ.get('B8_GAME_NTEX', '512'))
VARIANT = 'металл'
BASE = tuple(float(v) for v in os.environ.get('B8_BASE', '0.42,0.43,0.44').split(','))   # линейные; фото 01 ~175-188, 04 ~92, 05 ~122, 03 ~95 (sRGB)
T0 = time.time()
sc = bpy.data.scenes['B8']
if bpy.context.window: bpy.context.window.scene = sc
vl = bpy.context.view_layer; vl.update()
objs, _seen = [], set()                                             # ракеты и носы делят сетки: запекаем по одному узлу на сетку
for o in sorted([o for o in sc.objects if o.type == 'MESH'], key=lambda o: o.name):
    if o.data.name in _seen: continue
    _seen.add(o.data.name); objs.append(o)
print('запекаем узлов', len(objs), [o.name for o in objs])
body = next(o for o in objs if o.name == 'B8_body')
G = mk.GEO; L = G['L']; R = G['R']
Yb = lambda a: L / 2 - a


def log(*a): print(f'[{time.time() - T0:5.1f} с]', *a, flush=True)


for o in vl.objects: o.select_set(False)
for o in objs:
    while len(o.data.uv_layers) > 0: o.data.uv_layers.remove(o.data.uv_layers[0])
    o.data.uv_layers.new(name='UVMap')
for o in objs: o.select_set(True)
vl.objects.active = objs[0]
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
try: bpy.ops.uv.average_islands_scale()
except Exception as e: print('average_islands_scale:', e)
bpy.ops.object.mode_set(mode='OBJECT')
# стенки труб внутри (19 × 1,6 м) почти не видны - сжимаем их острова в 12 раз, чтобы не съели атлас
wl = []
for ob_ in (body, bpy.data.objects['cone']):
    me = ob_.data; uvd = me.uv_layers.active.data; wl_ = []
    for p in me.polygons:
        c = p.center
        if p.material_index == 2 and abs(p.normal.y) < 0.9 and math.hypot(c.x, c.z) < G['R'] - 0.002: wl_ += list(p.loop_indices)
    if wl_:
        cu = sum(uvd[i].uv.x for i in wl_) / len(wl_); cv = sum(uvd[i].uv.y for i in wl_) / len(wl_)
        for i in wl_: uvd[i].uv = (cu + (uvd[i].uv.x - cu) / 10.0, cv + (uvd[i].uv.y - cv) / 10.0)
    wl += wl_
print('стенок труб: петель', len(wl))
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
try: bpy.ops.uv.pack_islands(rotate=False, margin=16.0 / SIZE, margin_method='ADD')
except TypeError:
    try: bpy.ops.uv.pack_islands(rotate=False, margin=16.0 / SIZE)
    except TypeError: bpy.ops.uv.pack_islands(margin=16.0 / SIZE)
bpy.ops.object.mode_set(mode='OBJECT')
k_in = 1.0 - 24.0 / SIZE
for o in objs:
    for d in o.data.uv_layers.active.data: d.uv = (0.5 + (d.uv.x - 0.5) * k_in, 0.5 + (d.uv.y - 0.5) * k_in)
log('развёртка готова, объектов', len(objs))

old = bpy.data.images.get('B8_detail')
if old is not None: bpy.data.images.remove(old)
path = os.path.join(OUT, 'b8_detail.png')
img = bpy.data.images.new('B8_detail', SIZE, SIZE, alpha=False); img.generated_color = (1, 1, 1, 1)
mats = [m for m in bpy.data.materials if m.name in ('B8_body', 'B8_metal', 'B8_dark', 'B8_rocket')]
GLYPH = {
    'С': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'], 'Е': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    'Н': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], 'Г': ['#####', '#....', '#....', '#....', '#....', '#....', '#....'],
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
BLOCKS = [  # (строки, a начала, z верха, клетка 5×7 в м, борта, цвет) - придуманные надписи и номера
    (['22'], 0.82, 0.135, 0.0110, (-1.0, 1.0), 'red'),                                  # крупный номер на борту (05)
    (['ПАРТИЯ 07-91', 'МАССА 160'], 0.14, 0.060, 0.0026, (-1.0, 1.0), 'red'),
    (['ПРОВ 12-90'], 1.40, 0.090, 0.0024, (-1.0, 1.0), 'dark')]
PLATE = (1.18, 1.34, -0.040, 0.050, 0.004)                                          # табличка на борту
HATCH_B = (1.00, 1.16, -0.050, 0.050, 0.006)                                        # лючок снизу (a, x)
SEAMS_B = (0.36, 0.86, 1.30)                                                        # поперечные стыки обшивки (04)
RED_TOP = (0.10, 0.34)                                                               # красные полосы-метки сверху у переднего торца (01)


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
    im = bpy.data.images.new('B8_stencil', W, H, alpha=True)
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
    """Корпус: продольный шов снизу с заклёпками, поперечные стыки, рамки таблички и лючка, винты поясков и лючка - в метрах."""
    M = node_math(nodes, links); RR = lambda v, a, b: ramp(nodes, links, v, a, b)
    X, Yc, Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    a_ = M('SUBTRACT', L / 2, Yc)
    rho = M('SQRT', M('ADD', M('MULTIPLY', X, X), M('MULTIPLY', Z, Z))); skin = M('MULTIPLY', M('GREATER_THAN', rho, R - 0.005), M('GREATER_THAN', a_, -0.001))
    mid = M('MULTIPLY', M('GREATER_THAN', a_, 0.06), M('LESS_THAN', a_, L - 0.06))
    bot = M('LESS_THAN', Z, 0.0)
    line = M('MULTIPLY', M('MULTIPLY', RR(M('ABSOLUTE', X), 0.0018, 0.0008), M('MULTIPLY', bot, mid)), skin)
    for s_ in SEAMS_B:
        line = M('MAXIMUM', line, M('MULTIPLY', RR(M('ABSOLUTE', M('SUBTRACT', a_, s_)), 0.0020, 0.0009), skin))
    def per(v, o, sp):
        p = M('SUBTRACT', v, o); return M('ABSOLUTE', M('SUBTRACT', p, M('MULTIPLY', M('ROUND', M('DIVIDE', p, sp)), sp)))
    head = M('MULTIPLY', M('MULTIPLY', RR(M('SQRT', M('ADD', M('MULTIPLY', per(a_, 0.06, 0.045), per(a_, 0.06, 0.045)), M('MULTIPLY', M('SUBTRACT', M('ABSOLUTE', X), 0.012), M('SUBTRACT', M('ABSOLUTE', X), 0.012)))), 0.0036, 0.0017), M('MULTIPLY', bot, mid)), skin)
    ga = M('ARCTAN2', X, Z); st = 2 * math.pi / 40
    arcd = M('MULTIPLY', M('SUBTRACT', ga, M('MULTIPLY', M('ROUND', M('DIVIDE', ga, st)), st)), R)
    for s_ in SEAMS_B:                                                                       # ряды заклёпок по обе стороны стыков
        for o_ in (-0.010, 0.010):
            dy = M('SUBTRACT', a_, s_ + o_)
            head = M('MAXIMUM', head, M('MULTIPLY', RR(M('SQRT', M('ADD', M('MULTIPLY', arcd, arcd), M('MULTIPLY', dy, dy))), 0.0034, 0.0016), skin))
    def rect(u, v, a0, a1, z0, z1, rc, gate, screws):
        nonlocal line, head
        ca, cz, ha, hz = (a0 + a1) / 2, (z0 + z1) / 2, (a1 - a0) / 2, (z1 - z0) / 2
        qx = M('SUBTRACT', M('ABSOLUTE', M('SUBTRACT', u, ca)), ha - rc); qz = M('SUBTRACT', M('ABSOLUTE', M('SUBTRACT', v, cz)), hz - rc)
        ox, oz = M('MAXIMUM', qx, 0.0), M('MAXIMUM', qz, 0.0)
        sdf = M('SUBTRACT', M('ADD', M('SQRT', M('ADD', M('MULTIPLY', ox, ox), M('MULTIPLY', oz, oz))), M('MINIMUM', M('MAXIMUM', qx, qz), 0.0)), rc)
        line = M('MAXIMUM', line, M('MULTIPLY', RR(M('ABSOLUTE', sdf), 0.0028, 0.0012), gate))
        if screws:
            g = M('GREATER_THAN', qz, qx)
            dper = M('ADD', M('MULTIPLY', per(u, a0, 0.028), g), M('MULTIPLY', per(v, z0, 0.028), M('SUBTRACT', 1.0, g)))
            din = M('ADD', sdf, 0.0068)
            head = M('MAXIMUM', head, M('MULTIPLY', RR(M('SQRT', M('ADD', M('MULTIPLY', dper, dper), M('MULTIPLY', din, din))), 0.0038, 0.0018), gate))
    side = M('MULTIPLY', skin, M('GREATER_THAN', M('ABSOLUTE', X), 0.16))
    rect(a_, Z, *PLATE, side, True)
    rect(a_, X, *HATCH_B, M('MULTIPLY', skin, M('LESS_THAN', Z, -0.20)), True)
    arcd2 = M('MULTIPLY', M('SUBTRACT', ga, M('MULTIPLY', M('ROUND', M('DIVIDE', ga, st)), st)), R + 0.003)
    for s_ in (0.022, L - 0.022):                                                              # винты поясков торцов
        dy = M('SUBTRACT', a_, s_)
        head = M('MAXIMUM', head, RR(M('SQRT', M('ADD', M('MULTIPLY', arcd2, arcd2), M('MULTIPLY', dy, dy))), 0.0044, 0.0021))
    return line, head


def build_pattern(mat):
    nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for n in list(nodes):
        if n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): nodes.remove(n)
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL'); prin = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    kind = mat.name
    col = BASE if kind == 'B8_body' else ((0.24, 0.24, 0.24) if kind == 'B8_metal' else tuple(prin.inputs['Base Color'].default_value)[:3])
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
                cmb = N('ShaderNodeCombineXYZ'); links.new(u, cmb.inputs['X']); links.new(v, cmb.inputs['Y'])
                tx = N('ShaderNodeTexImage'); tx.image = imt; tx.extension = 'CLIP'; tx.interpolation = 'Linear'; links.new(cmb.outputs['Vector'], tx.inputs['Vector'])
                c = mixc(c, colr, M('MULTIPLY', M('MULTIPLY', M('MULTIPLY', tx.outputs['Alpha'], maprange(M('MULTIPLY', gsep.outputs['X'], s), 0.25, 0.45, 0.0, 1.0)), gate), M('ADD', 0.55, M('MULTIPLY', scuff, -0.4))))
        return c
    rho_ = M('SQRT', M('ADD', M('MULTIPLY', X, X), M('MULTIPLY', Z, Z)))
    if kind == 'B8_body':
        skin = M('MULTIPLY', M('GREATER_THAN', rho_, R - 0.005), M('GREATER_THAN', a_, -0.001))
        incone = M('LESS_THAN', a_, 0.0)
        tone = 1.0                                                                                       # листы обшивки чуть разного металла
        for s_, k_t in ((0.36, 0.95), (0.86, 1.05), (1.30, 0.97)):
            tone = M('MULTIPLY', tone, M('ADD', 1.0, M('MULTIPLY', M('GREATER_THAN', a_, s_), k_t - 1.0)))
        c = mixc(c, gray(tone), 1.0, 'MULTIPLY')
        c = mixc(c, mixc(c, gray(0.62), 1.0, 'MULTIPLY'), M('MULTIPLY', patch, 0.65))                   # пятна окисла и потемнения (04, 05)
        c = mixc(c, mixc(c, gray(1.22), 1.0, 'MULTIPLY'), M('MULTIPLY', scuff, 0.55))                   # затёртый до блеска металл
        c = mixc(c, mixc(c, gray(0.90), 1.0, 'MULTIPLY'), M('MULTIPLY', fine, 0.45))
        mp = N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (90.0, 1.2, 90.0); links.new(pos, mp.inputs['Vector'])  # продольная шлифовка
        nst = N('ShaderNodeTexNoise'); nst.inputs['Scale'].default_value = 1.0; nst.inputs['Detail'].default_value = 6.0; nst.inputs['Roughness'].default_value = 0.65; links.new(mp.outputs['Vector'], nst.inputs['Vector'])
        c = mixc(c, mixc(c, gray(0.84), 1.0, 'MULTIPLY'), M('MULTIPLY', maprange(nst.outputs['Fac'], 0.44, 0.70, 0.0, 1.0), 0.45))
        mz = N('ShaderNodeMapping'); mz.inputs['Scale'].default_value = (50.0, 50.0, 1.4); links.new(pos, mz.inputs['Vector'])  # потёки вниз
        nsz = N('ShaderNodeTexNoise'); nsz.inputs['Scale'].default_value = 1.0; nsz.inputs['Detail'].default_value = 5.0; links.new(mz.outputs['Vector'], nsz.inputs['Vector'])
        c = mixc(c, mixc(c, gray(0.72), 1.0, 'MULTIPLY'), M('MULTIPLY', M('MULTIPLY', maprange(nsz.outputs['Fac'], 0.50, 0.74, 0.0, 1.0), maprange(Z, 0.20, -0.05, 0.0, 1.0)), 0.5))
        c = mixc(c, mixc(c, gray(0.70), 1.0, 'MULTIPLY'), M('MULTIPLY', maprange(Z, -0.05, -0.25, 0.0, 1.0), M('ADD', 0.25, M('MULTIPLY', patch, 0.5))))
        ms = N('ShaderNodeMapping'); ms.inputs['Scale'].default_value = (420.0, 7.0, 420.0); links.new(pos, ms.inputs['Vector'])
        nsc = N('ShaderNodeTexNoise'); nsc.inputs['Scale'].default_value = 1.0; nsc.inputs['Detail'].default_value = 3.0; links.new(ms.outputs['Vector'], nsc.inputs['Vector'])
        c = mixc(c, mixc(c, gray(1.35), 1.0, 'MULTIPLY'), M('MULTIPLY', M('MULTIPLY', maprange(nsc.outputs['Fac'], 0.66, 0.74, 0.0, 1.0), noise(3.0, 3.0, 0.5, 0.5, 0.7)), 0.6))   # царапины
        # красные полосы-метки сверху у переднего торца (01): косые, по верху корпуса
        for a0 in RED_TOP:
            d = M('ABSOLUTE', M('SUBTRACT', M('ADD', a_, M('MULTIPLY', X, 0.35)), a0))
            red = M('MULTIPLY', M('MULTIPLY', M('LESS_THAN', d, 0.008), M('GREATER_THAN', Z, 0.16)), M('MULTIPLY', skin, M('LESS_THAN', M('ABSOLUTE', X), 0.20)))
            c = mixc(c, rgb((0.50, 0.05, 0.035)), M('MULTIPLY', red, M('ADD', 0.85, M('MULTIPLY', scuff, -0.5))))
        a0_, a1_, z0_, z1_, _ = PLATE                                                                   # табличка
        inpl = M('MULTIPLY', M('MULTIPLY', M('GREATER_THAN', a_, a0_), M('LESS_THAN', a_, a1_)), M('MULTIPLY', M('GREATER_THAN', Z, z0_), M('LESS_THAN', Z, z1_)))
        inpl = M('MULTIPLY', M('MULTIPLY', inpl, skin), maprange(M('ABSOLUTE', gsep.outputs['X']), 0.35, 0.55, 0.0, 1.0))
        c = mixc(c, rgb((0.22, 0.22, 0.21)), inpl)
        txt = M('MULTIPLY', M('MULTIPLY', M('GREATER_THAN', a_, a0_ + 0.010), M('LESS_THAN', a_, a1_ - 0.010)), M('MULTIPLY', M('GREATER_THAN', Z, z0_ + 0.008), M('LESS_THAN', Z, z1_ - 0.008)))
        rows = M('LESS_THAN', M('FRACT', M('DIVIDE', M('SUBTRACT', Z, z0_), 0.0065)), 0.36)
        dash = M('GREATER_THAN', noise(220.0, 1.0, 0.5, 0.0, 1.0), 0.35)
        c = mixc(c, rgb((0.55, 0.55, 0.54)), M('MULTIPLY', M('MULTIPLY', M('MULTIPLY', txt, rows), M('MULTIPLY', dash, inpl)), 0.85))
        c = stencils(c, 'red', rgb((0.50, 0.05, 0.035)), skin)
        c = stencils(c, 'dark', rgb((0.05, 0.05, 0.05)), skin)
        line, head = marks(nodes, links, sep)
        c = mixc(c, rgb((0.06, 0.06, 0.06)), M('MULTIPLY', line, 0.75))
        c = mixc(c, mixc(c, gray(0.75), 1.0, 'MULTIPLY'), M('MULTIPLY', head, 0.7))
        c = mixc(c, mixc(c, gray(1.30), 1.0, 'MULTIPLY'), M('MULTIPLY', M('ADD', M('MULTIPLY', edge, 0.6), M('MULTIPLY', chip, 0.5), clamp=True), 0.7))   # кромки затёрты до блеска
        c = mixc(c, mixc(c, gray(0.55), 1.0, 'MULTIPLY'), M('MULTIPLY', M('MULTIPLY', incone, maprange(a_, -0.86, -0.70, 1.0, 0.0)), 0.4))   # копоть к носку обтекателя
    elif kind == 'B8_metal':
        c = mixc(c, rgb((0.20, 0.20, 0.20)), M('MULTIPLY', scuff, 0.5))
        c = mixc(c, rgb((0.55, 0.55, 0.53)), M('MULTIPLY', edge, 0.6))
        c = mixc(c, rgb((0.55, 0.42, 0.20)), M('LESS_THAN', a_, -0.85))                               # латунный колпачок носка (01)
    elif kind == 'B8_rocket':
        tc = N('ShaderNodeTexCoord'); ts = N('ShaderNodeSeparateXYZ'); links.new(tc.outputs['Object'], ts.inputs['Vector'])
        yr = M('ADD', ts.outputs['Y'], G['Y_FACE_R'])                                                       # y по нашей С-8
        def zone(y0, y1): return M('MULTIPLY', M('GREATER_THAN', yr, y0), M('LESS_THAN', yr, y1))
        c = rgb((0.17, 0.19, 0.16))
        for (y0, y1), cc in (((-1.0, -0.735), (0.05, 0.05, 0.05)), ((-0.660, -0.640), (0.25, 0.26, 0.26)), ((0.093, 0.103), (0.25, 0.26, 0.26)),
                             ((0.739, 0.746), (0.25, 0.26, 0.26)), ((0.746, 1.0), (0.62, 0.62, 0.60))):
            c = mixc(c, rgb(cc), zone(y0, y1))
        c = mixc(c, mixc(c, gray(0.85), 1.0, 'MULTIPLY'), M('MULTIPLY', patch, 0.5))
    else:
        c = mixc(c, rgb((0.030, 0.030, 0.030)), 1.0)                                                       # торцы и трубы
        c = mixc(c, rgb((0.010, 0.010, 0.010)), M('MULTIPLY', noise(18.0, 4.0, 0.6, 0.35, 0.75), 0.6))
        c = mixc(c, rgb((0.16, 0.16, 0.16)), M('MULTIPLY', edge, 0.7))                                     # кромки труб светлее
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
    k_fine, bev_r = {'B8_body': (0.30, 0.0022), 'B8_rocket': (0.12, 0.0010), 'B8_metal': (0.22, 0.0012), 'B8_dark': (0.10, 0.0012)}[mat.name]
    geo, sep = coords(nodes, links)
    bev = nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = bev_r; bev.samples = 10
    def noise(scale, detail, rough):
        n = nodes.new('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(geo.outputs['Position'], n.inputs['Vector']); return n.outputs['Fac']
    M = node_math(nodes, links)
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.002; bump.inputs['Strength'].default_value = 1.0
    h = M('ADD', M('MULTIPLY', noise(150.0, 3.0, 0.55), 0.50 * k_fine), M('MULTIPLY', noise(14.0, 3.0, 0.5), 0.55 * k_fine))
    if mat.name == 'B8_body':
        line, head = marks(nodes, links, sep)
        h = M('ADD', M('ADD', h, M('MULTIPLY', head, 2.0)), M('MULTIPLY', line, -1.8))
    links.new(h, bump.inputs['Height'])
    links.new(bev.outputs['Normal'], bump.inputs['Normal'])
    links.new(bump.outputs['Normal'], prin.inputs['Normal'])


nimg = bpy.data.images.get('B8_normal')
if nimg is not None: bpy.data.images.remove(nimg)
nimg = bpy.data.images.new('B8_normal', NSIZE, NSIZE, alpha=False)
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
npath = os.path.join(OUT, 'b8_normal.png')
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
for im in [i for i in bpy.data.images if i.name.startswith('B8_stencil')]: bpy.data.images.remove(im)
log('материалы подключены')


def lite(image, name, fmt, fname, px):
    c = image.copy(); c.name = name; c.scale(px, px); c.file_format = fmt
    p_ = os.path.join(OUT, fname)
    try: c.save(filepath=p_, quality=92)
    except TypeError:
        c.filepath_raw = p_; c.save()
    bpy.data.images.remove(c)
    return p_


lite(img, f'B8_detail_{GAME_TEX}', 'JPEG', f'b8_detail_{GAME_TEX}.jpg', GAME_TEX); lite(nimg, f'B8_normal_{GAME_NTEX}', 'PNG', f'b8_normal_{GAME_NTEX}.png', GAME_NTEX)
log('облегчённые копии готовы')
