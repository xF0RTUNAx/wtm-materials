# bake.py - запекает текстуры LAU-61: цвет (lau61_detail.png: олива по фото 01/03, потёки и грязь, шов с заклёпками снизу, табличка, лючок, красная табличка сверху,
# придуманная маркировка, сбитая краска на обечайках, тёмные торцы и трубы с копотью, ракеты в цветах нашей Hydra 70) и нормали.
# Запуск после build.py: LAU_OUT="<папка>" [LAU_TEX=2048] Blender -b --factory-startup --python build.py --python bake.py [--python _trial.py | --python deliver.py]
import os, sys, math, time
sys.dont_write_bytecode = True
import bpy
import modelkit as mk
import numpy as np

OUT = os.environ.get('LAU_OUT')
if not OUT: raise SystemExit('Задай LAU_OUT=<папка модели>')
SIZE = int(os.environ.get('LAU_TEX', '2048')); NSIZE = int(os.environ.get('LAU_NTEX', str(SIZE)))
GAME_TEX, GAME_NTEX = int(os.environ.get('LAU_GAME_TEX', '1024')), int(os.environ.get('LAU_GAME_NTEX', '512'))
VARIANT = 'олива'
BASE = tuple(float(v) for v in os.environ.get('LAU_BASE', '0.23,0.195,0.115').split(','))   # линейные; фото 01 ~62/53/60, 03 бок ~159/136/108
T0 = time.time()
sc = bpy.data.scenes['LAU61']
if bpy.context.window: bpy.context.window.scene = sc
vl = bpy.context.view_layer; vl.update()
objs = [o for o in sc.objects if o.type == 'MESH' and not (o.name[0] == 'r' and o.name[1:].isdigit() and o.name != 'r0')]   # ракеты r1..r18 делят сетку r0
body = next(o for o in objs if o.name == 'LAU_body')
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
me = body.data; uvd = me.uv_layers.active.data; wl = []
for p in me.polygons:
    c = p.center
    if p.material_index == 2 and abs(p.normal.y) < 0.9 and math.hypot(c.x, c.z) < G['R'] - 0.002: wl += list(p.loop_indices)
if wl:
    cu = sum(uvd[i].uv.x for i in wl) / len(wl); cv = sum(uvd[i].uv.y for i in wl) / len(wl)
    for i in wl: uvd[i].uv = (cu + (uvd[i].uv.x - cu) / 12.0, cv + (uvd[i].uv.y - cv) / 12.0)
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

old = bpy.data.images.get('LAU_detail')
if old is not None: bpy.data.images.remove(old)
path = os.path.join(OUT, 'lau61_detail.png')
img = bpy.data.images.new('LAU_detail', SIZE, SIZE, alpha=False); img.generated_color = (1, 1, 1, 1)
mats = [m for m in bpy.data.materials if m.name in ('LAU_body', 'LAU_metal', 'LAU_dark', 'LAU_rocket')]
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
BLOCKS = [  # (строки, a начала, z верха, клетка 5×7 в м, борта, цвет) - придуманная маркировка, без настоящих номеров
    (['LOADED - 19 ROCKETS', 'HANDLE WITH CARE'], 0.62, 0.118, 0.0026, (-1.0, 1.0), 'light'),
    (['LOT 05-14', 'SN 2231-08'], 1.18, 0.095, 0.0022, (-1.0, 1.0), 'light'),
    (['FWD'], 0.10, 0.030, 0.0030, (-1.0, 1.0), 'light')]
PLATE = (0.30, 0.46, -0.075, 0.010, 0.004)                                          # табличка на борту у переднего торца (фото 03)
HATCH_B = (1.26, 1.42, -0.040, 0.040, 0.006)                                        # лючок снизу (a, x)


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
    im = bpy.data.images.new('LAU_stencil', W, H, alpha=True)
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
    """Блок: шов снизу с заклёпками, рамки таблички и лючка, винты обечаек и лючка - в метрах."""
    M = node_math(nodes, links); RR = lambda v, a, b: ramp(nodes, links, v, a, b)
    X, Yc, Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    a_ = M('SUBTRACT', L / 2, Yc)
    rho = M('SQRT', M('ADD', M('MULTIPLY', X, X), M('MULTIPLY', Z, Z))); skin = M('GREATER_THAN', rho, R - 0.005)
    mid = M('MULTIPLY', M('GREATER_THAN', a_, 0.07), M('LESS_THAN', a_, L - 0.07))
    bot = M('LESS_THAN', Z, 0.0)
    line = M('MULTIPLY', M('MULTIPLY', RR(M('ABSOLUTE', X), 0.0016, 0.0007), M('MULTIPLY', bot, mid)), skin)
    def per(v, o, sp):
        p = M('SUBTRACT', v, o); return M('ABSOLUTE', M('SUBTRACT', p, M('MULTIPLY', M('ROUND', M('DIVIDE', p, sp)), sp)))
    head = M('MULTIPLY', M('MULTIPLY', RR(M('SQRT', M('ADD', M('MULTIPLY', per(a_, 0.07, 0.05), per(a_, 0.07, 0.05)), M('MULTIPLY', M('SUBTRACT', M('ABSOLUTE', X), 0.012), M('SUBTRACT', M('ABSOLUTE', X), 0.012)))), 0.0034, 0.0016), M('MULTIPLY', bot, mid)), skin)
    def rect(u, v, a0, a1, z0, z1, rc, gate, screws):
        nonlocal line, head
        ca, cz, ha, hz = (a0 + a1) / 2, (z0 + z1) / 2, (a1 - a0) / 2, (z1 - z0) / 2
        qx = M('SUBTRACT', M('ABSOLUTE', M('SUBTRACT', u, ca)), ha - rc); qz = M('SUBTRACT', M('ABSOLUTE', M('SUBTRACT', v, cz)), hz - rc)
        ox, oz = M('MAXIMUM', qx, 0.0), M('MAXIMUM', qz, 0.0)
        sdf = M('SUBTRACT', M('ADD', M('SQRT', M('ADD', M('MULTIPLY', ox, ox), M('MULTIPLY', oz, oz))), M('MINIMUM', M('MAXIMUM', qx, qz), 0.0)), rc)
        line = M('MAXIMUM', line, M('MULTIPLY', RR(M('ABSOLUTE', sdf), 0.0028, 0.0012), gate))
        if screws:
            g = M('GREATER_THAN', qz, qx)
            dper = M('ADD', M('MULTIPLY', per(u, a0, 0.026), g), M('MULTIPLY', per(v, z0, 0.026), M('SUBTRACT', 1.0, g)))
            din = M('ADD', sdf, 0.0065)
            head = M('MAXIMUM', head, M('MULTIPLY', RR(M('SQRT', M('ADD', M('MULTIPLY', dper, dper), M('MULTIPLY', din, din))), 0.0036, 0.0017), gate))
    side = M('MULTIPLY', skin, M('GREATER_THAN', M('ABSOLUTE', X), 0.12))
    rect(a_, Z, *PLATE, side, True)
    rect(a_, X, *HATCH_B, M('MULTIPLY', skin, M('LESS_THAN', Z, -0.15)), True)
    ga = M('ARCTAN2', X, Z); st = 2 * math.pi / 24
    arcd = M('MULTIPLY', M('SUBTRACT', ga, M('MULTIPLY', M('ROUND', M('DIVIDE', ga, st)), st)), R + 0.006)
    for s_ in (0.030, L - 0.030):
        dy = M('SUBTRACT', a_, s_)
        head = M('MAXIMUM', head, RR(M('SQRT', M('ADD', M('MULTIPLY', arcd, arcd), M('MULTIPLY', dy, dy))), 0.0042, 0.0020))
    return line, head


def build_pattern(mat):
    nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for n in list(nodes):
        if n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): nodes.remove(n)
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL'); prin = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    kind = mat.name
    col = BASE if kind == 'LAU_body' else ((0.28, 0.21, 0.15) if kind == 'LAU_metal' else tuple(prin.inputs['Base Color'].default_value)[:3])
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
                c = mixc(c, colr, M('MULTIPLY', M('MULTIPLY', M('MULTIPLY', tx.outputs['Alpha'], maprange(M('MULTIPLY', gsep.outputs['X'], s), 0.25, 0.45, 0.0, 1.0)), gate), 0.85))
        return c
    rho_ = M('SQRT', M('ADD', M('MULTIPLY', X, X), M('MULTIPLY', Z, Z)))
    if kind == 'LAU_body':
        skin = M('GREATER_THAN', rho_, R - 0.005)
        c = mixc(c, mixc(c, gray(0.86), 1.0, 'MULTIPLY'), M('MULTIPLY', patch, 0.55))
        c = mixc(c, mixc(c, gray(1.10), 1.0, 'MULTIPLY'), M('MULTIPLY', scuff, 0.40))
        c = mixc(c, mixc(c, gray(1.05), 1.0, 'MULTIPLY'), M('MULTIPLY', fine, 0.40))
        mp = N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (60.0, 60.0, 1.6); links.new(pos, mp.inputs['Vector'])      # потёки вниз по бортам
        nst = N('ShaderNodeTexNoise'); nst.inputs['Scale'].default_value = 1.0; nst.inputs['Detail'].default_value = 5.0; nst.inputs['Roughness'].default_value = 0.62; links.new(mp.outputs['Vector'], nst.inputs['Vector'])
        streak = M('MULTIPLY', maprange(nst.outputs['Fac'], 0.48, 0.72, 0.0, 1.0), maprange(Z, 0.15, -0.05, 0.0, 1.0))
        c = mixc(c, mixc(c, gray(0.80), 1.0, 'MULTIPLY'), M('MULTIPLY', streak, 0.45))
        c = mixc(c, mixc(c, gray(0.82), 1.0, 'MULTIPLY'), M('MULTIPLY', maprange(Z, -0.05, -0.2, 0.0, 1.0), M('ADD', 0.30, M('MULTIPLY', patch, 0.5))))
        frs = M('MULTIPLY', maprange(a_, 0.16, 0.0, 0.0, 1.0), noise(7.0, 4.0, 0.6, 0.35, 0.75))                # копоть у переднего торца от пусков
        c = mixc(c, rgb((0.05, 0.045, 0.035)), M('MULTIPLY', frs, 0.55))
        a0_, a1_, z0_, z1_, _ = PLATE                                                                       # табличка: светлая, строки текста
        inpl = M('MULTIPLY', M('MULTIPLY', M('GREATER_THAN', a_, a0_), M('LESS_THAN', a_, a1_)), M('MULTIPLY', M('GREATER_THAN', Z, z0_), M('LESS_THAN', Z, z1_)))
        inpl = M('MULTIPLY', M('MULTIPLY', inpl, skin), maprange(M('ABSOLUTE', gsep.outputs['X']), 0.30, 0.45, 0.0, 1.0))
        c = mixc(c, rgb((0.58, 0.57, 0.52)), inpl)
        txt = M('MULTIPLY', M('MULTIPLY', M('GREATER_THAN', a_, a0_ + 0.010), M('LESS_THAN', a_, a1_ - 0.010)), M('MULTIPLY', M('GREATER_THAN', Z, z0_ + 0.008), M('LESS_THAN', Z, z1_ - 0.008)))
        rows = M('LESS_THAN', M('FRACT', M('DIVIDE', M('SUBTRACT', Z, z0_), 0.0065)), 0.36)
        dash = M('GREATER_THAN', noise(220.0, 1.0, 0.5, 0.0, 1.0), 0.35)
        c = mixc(c, rgb((0.08, 0.08, 0.08)), M('MULTIPLY', M('MULTIPLY', M('MULTIPLY', txt, rows), M('MULTIPLY', dash, inpl)), 0.85))
        warn = M('MULTIPLY', M('MULTIPLY', M('GREATER_THAN', a_, 0.075), M('LESS_THAN', a_, 0.135)), M('MULTIPLY', M('LESS_THAN', M('ABSOLUTE', X), 0.04), M('GREATER_THAN', Z, 0.17)))
        c = mixc(c, rgb((0.45, 0.04, 0.03)), warn)                                                          # красная предупредительная табличка сверху у переднего торца (03)
        c = mixc(c, rgb((0.70, 0.68, 0.62)), M('MULTIPLY', warn, M('LESS_THAN', M('ABSOLUTE', M('SUBTRACT', a_, 0.105)), 0.008)))
        c = stencils(c, 'light', rgb((0.52, 0.50, 0.40)), skin)
        line, head = marks(nodes, links, sep)
        c = mixc(c, rgb((0.04, 0.04, 0.03)), M('MULTIPLY', line, 0.75))
        c = mixc(c, mixc(c, gray(1.35), 1.0, 'MULTIPLY'), M('MULTIPLY', head, 0.6))
        lipz = M('MAXIMUM', M('LESS_THAN', a_, 0.058), M('GREATER_THAN', a_, L - 0.058))                       # обечайки: краска сбита сильнее
        c = mixc(c, rgb((0.30, 0.29, 0.25)), M('MULTIPLY', M('ADD', M('MULTIPLY', edge, M('ADD', 0.35, M('MULTIPLY', lipz, 0.5))), M('MULTIPLY', chip, M('ADD', 0.5, M('MULTIPLY', lipz, 0.6))), clamp=True), 0.65))
    elif kind == 'LAU_metal':
        c = mixc(c, rgb((0.18, 0.13, 0.09)), M('MULTIPLY', scuff, 0.5))
        c = mixc(c, rgb((0.45, 0.40, 0.33)), M('MULTIPLY', edge, 0.6))
        c = mixc(c, rgb((0.05, 0.05, 0.05)), M('MULTIPLY', maprange(rho_, R + 0.019, R + 0.017, 0.0, 1.0), M('LESS_THAN', Z, 0.0)) if False else 0.0)
    elif kind == 'LAU_rocket':
        tc = N('ShaderNodeTexCoord'); ts = N('ShaderNodeSeparateXYZ'); links.new(tc.outputs['Object'], ts.inputs['Vector'])
        yr = M('ADD', ts.outputs['Y'], G['Y_FACE_R'])                                                       # y по нашей Hydra
        def zone(y0, y1): return M('MULTIPLY', M('GREATER_THAN', yr, y0), M('LESS_THAN', yr, y1))
        c = rgb((0.62, 0.63, 0.62))                                                                        # двигатель - серебристый
        for (y0, y1), cc in (((-1.0, -0.690), (0.05, 0.05, 0.05)), ((-0.690, -0.594), (0.30, 0.31, 0.31)), ((0.290, 0.306), (0.30, 0.31, 0.31)),
                             ((0.306, 0.605), (0.22, 0.25, 0.14)), ((0.335, 0.356), (0.85, 0.70, 0.10)), ((0.605, 0.624), (0.30, 0.31, 0.31)), ((0.624, 1.0), (0.13, 0.13, 0.13))):
            c = mixc(c, rgb(cc), zone(y0, y1))
        c = mixc(c, mixc(c, gray(0.85), 1.0, 'MULTIPLY'), M('MULTIPLY', patch, 0.5))
        c = mixc(c, rgb((0.40, 0.40, 0.40)), M('MULTIPLY', M('MULTIPLY', edge, zone(0.6, 1.0)), 0.5))
    else:
        c = mixc(c, rgb((0.022, 0.024, 0.018)), 1.0)                                                       # торцы и стенки труб: почти чёрная олива
        soot = M('MULTIPLY', noise(18.0, 4.0, 0.6, 0.35, 0.75), M('GREATER_THAN', a_, -1.0))
        c = mixc(c, rgb((0.008, 0.008, 0.007)), M('MULTIPLY', soot, 0.6))
        c = mixc(c, rgb((0.10, 0.10, 0.075)), M('MULTIPLY', edge, 0.7))                                    # кромки труб светлее
    a_unused = None
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
    k_fine, bev_r = {'LAU_body': (0.24, 0.0022), 'LAU_rocket': (0.12, 0.0010), 'LAU_metal': (0.22, 0.0012), 'LAU_dark': (0.10, 0.0012)}[mat.name]
    geo, sep = coords(nodes, links)
    bev = nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = bev_r; bev.samples = 10
    def noise(scale, detail, rough):
        n = nodes.new('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(geo.outputs['Position'], n.inputs['Vector']); return n.outputs['Fac']
    M = node_math(nodes, links)
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.002; bump.inputs['Strength'].default_value = 1.0
    h = M('ADD', M('MULTIPLY', noise(150.0, 3.0, 0.55), 0.50 * k_fine), M('MULTIPLY', noise(14.0, 3.0, 0.5), 0.55 * k_fine))
    if mat.name == 'LAU_body':
        line, head = marks(nodes, links, sep)
        h = M('ADD', M('ADD', h, M('MULTIPLY', head, 2.0)), M('MULTIPLY', line, -1.8))
    links.new(h, bump.inputs['Height'])
    links.new(bev.outputs['Normal'], bump.inputs['Normal'])
    links.new(bump.outputs['Normal'], prin.inputs['Normal'])


nimg = bpy.data.images.get('LAU_normal')
if nimg is not None: bpy.data.images.remove(nimg)
nimg = bpy.data.images.new('LAU_normal', NSIZE, NSIZE, alpha=False)
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
npath = os.path.join(OUT, 'lau61_normal.png')
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
for im in [i for i in bpy.data.images if i.name.startswith('LAU_stencil')]: bpy.data.images.remove(im)
log('материалы подключены')


def lite(image, name, fmt, fname, px):
    c = image.copy(); c.name = name; c.scale(px, px); c.file_format = fmt
    p_ = os.path.join(OUT, fname)
    try: c.save(filepath=p_, quality=92)
    except TypeError:
        c.filepath_raw = p_; c.save()
    bpy.data.images.remove(c)
    return p_


lite(img, f'LAU_detail_{GAME_TEX}', 'JPEG', f'lau61_detail_{GAME_TEX}.jpg', GAME_TEX); lite(nimg, f'LAU_normal_{GAME_NTEX}', 'PNG', f'lau61_normal_{GAME_NTEX}.png', GAME_NTEX)
log('облегчённые копии готовы')
