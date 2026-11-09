# bake.py - запекает текстуры ФАБ-250: цвет (fab250_detail.png: светло-серая заводская по фото 02, не темнее снимка; трафарет «ФАБ-250» поперёк корпуса за первым поясом, как на 02;
# и мелкая придуманная маркировка; лёгкий износ: сколы по кромкам, пыль снизу) и нормали.
# Запуск после build.py: FB_OUT="<папка>" [FB_TEX=2048] Blender -b --factory-startup --python build.py --python bake.py [--python _trial.py | --python deliver.py]
import os, sys, math, time
sys.dont_write_bytecode = True
import bpy
import modelkit as mk
import numpy as np

OUT = os.environ.get('FB_OUT')
if not OUT: raise SystemExit('Задай FB_OUT=<папка модели>')
SIZE = int(os.environ.get('FB_TEX', '2048')); NSIZE = int(os.environ.get('FB_NTEX', str(SIZE)))
GAME_TEX, GAME_NTEX = int(os.environ.get('FB_GAME_TEX', '1024')), int(os.environ.get('FB_GAME_NTEX', '512'))
BASE = tuple(float(v) for v in os.environ.get('FB_BASE', '0.76,0.79,0.86').split(','))   # линейные; заводской серый с лёгкой синевой (фото 2, 4; фото 3 синее)
T0 = time.time()
sc = bpy.data.scenes['FAB250']
if bpy.context.window: bpy.context.window.scene = sc
vl = bpy.context.view_layer; vl.update()
objs = [o for o in sc.objects if o.type == 'MESH']
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
# внутренняя сторона кольца и перья внутри кольца почти не видны - сжимаем их острова вдвое
tail = bpy.data.objects['FB2_tail']; uvd = tail.data.uv_layers.active.data; wl = []
for p in tail.data.polygons:
    c = p.center
    if math.hypot(c.x, c.z) < G['R_RING'] - 0.002 and c.y < Yb(1.40): wl += list(p.loop_indices)
if wl:
    cu = sum(uvd[i].uv.x for i in wl) / len(wl); cv = sum(uvd[i].uv.y for i in wl) / len(wl)
    for i in wl: uvd[i].uv = (cu + (uvd[i].uv.x - cu) / 2.0, cv + (uvd[i].uv.y - cv) / 2.0)
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

old = bpy.data.images.get('FB2_detail')
if old is not None: bpy.data.images.remove(old)
path = os.path.join(OUT, 'fab250_detail.png')
img = bpy.data.images.new('FB2_detail', SIZE, SIZE, alpha=False); img.generated_color = (1, 1, 1, 1)
used = {o.data.materials[p.material_index].name for o in objs for p in o.data.polygons}
mats = [m for m in bpy.data.materials if m.name in used]
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
    'Ф': ['..#..', '#####', '#.#.#', '#.#.#', '#####', '..#..', '..#..'], 'Б': ['#####', '#....', '#....', '####.', '#...#', '#...#', '####.'],
    'Ш': ['#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#####'], 'Ц': ['#..#.', '#..#.', '#..#.', '#..#.', '#..#.', '#####', '....#'],
    '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
}
BLOCKS = [  # (строки, a, z, клетка 5×7 в м, борта, цвет, поперёк) - поперёк: a - передний край строки, z - низ строки (у левого борта; у правого строка идёт сверху вниз)
    (['ФАБ-250'], 0.272, -0.072, 0.0042, (-1.0, 1.0), 'dark', True),              # как на 02: сразу за первым поясом, читается снизу вверх, верх букв к носу
    (['ТГА 11-88-305'], 0.40, 0.026, 0.0024, (-1.0, 1.0), 'dark', False),
    (['ТНТ'], 0.80, 0.020, 0.0030, (-1.0, 1.0), 'dark', False),
    (['7'], 0.62, 0.105, 0.0022, (1.0,), 'dark', False)]


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
    im = bpy.data.images.new('FB2_stencil', W, H, alpha=True)
    px = np.zeros((H, W, 4), dtype=np.float32); px[..., 3] = A
    im.pixels.foreach_set(px.ravel()); im.alpha_mode = 'STRAIGHT'
    return im, cols, rows


BLOCK_IM = [(make_block(l), a, z, c, sd, k, vt) for l, a, z, c, sd, k, vt in BLOCKS]


def node_math(nodes, links):
    def math_(op, a=None, b=None, c=None, clamp=False):
        n = nodes.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate((a, b, c)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: links.new(v, n.inputs[i])
        return n.outputs['Value']
    return math_


def coords(nodes, links):
    geo = nodes.new('ShaderNodeNewGeometry'); sep = nodes.new('ShaderNodeSeparateXYZ'); links.new(geo.outputs['Position'], sep.inputs['Vector'])
    return geo, sep


def build_pattern(mat):
    nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for n in list(nodes):
        if n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): nodes.remove(n)
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL'); prin = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    kind = mat.name
    col = {'FB2_body': BASE, 'FB2_metal': tuple(v * 0.96 for v in BASE), 'FB2_red': (0.42, 0.035, 0.022)}.get(kind, (0.03, 0.03, 0.03))
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
    ao2 = N('ShaderNodeAmbientOcclusion'); ao2.samples = 12; ao2.inputs['Distance'].default_value = 0.06
    a1 = maprange(ao1.outputs['AO'], 0, 1, 0.55, 1.0); a2 = maprange(ao2.outputs['AO'], 0, 1, 0.72, 1.0)
    def noise(scale, detail, rough, lo, hi):
        n = N('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(pos, n.inputs['Vector']); return maprange(n.outputs['Fac'], lo, hi, 0.0, 1.0)
    gm = N('ShaderNodeMapping'); gm.inputs['Scale'].default_value = (330.0, 330.0, 330.0); links.new(pos, gm.inputs['Vector'])
    wn = N('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; links.new(gm.outputs['Vector'], wn.inputs['Vector'])
    grain = M('ADD', 1.0, M('MULTIPLY', M('SUBTRACT', wn.outputs['Value'], 0.5), 0.03))
    bev = N('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.0022; bev.samples = 6
    dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; links.new(bev.outputs['Normal'], dot.inputs[0]); links.new(geo.outputs['Normal'], dot.inputs[1])
    edge = maprange(dot.outputs['Value'], 1.0, 0.93, 0.0, 1.0)
    bev2 = N('ShaderNodeBevel'); bev2.inputs['Radius'].default_value = 0.009; bev2.samples = 6
    dot2 = N('ShaderNodeVectorMath'); dot2.operation = 'DOT_PRODUCT'; links.new(bev2.outputs['Normal'], dot2.inputs[0]); links.new(geo.outputs['Normal'], dot2.inputs[1])
    zone = maprange(dot2.outputs['Value'], 1.0, 0.90, 0.0, 1.0)
    chip = M('MULTIPLY', zone, noise(26.0, 5.0, 0.6, 0.58, 0.68))
    scuff = noise(5.0, 7.0, 0.62, 0.50, 0.72); patch = noise(1.5, 4.0, 0.55, 0.38, 0.66); fine = noise(40.0, 4.0, 0.6, 0.38, 0.66)
    c = rgb(col)
    def stencils(c, which, colr, gate):
        for (imt, cl_, rw_), as_, zs_, cell_, sides_, kind_, vt_ in BLOCK_IM:
            if kind_ != which: continue
            wt, ht = cl_ * cell_, rw_ * cell_; ybs = Yb(as_)
            for s in sides_:
                if vt_:                                             # поперёк: строка вдоль Z, верх букв к носу
                    u = M('DIVIDE', M('SUBTRACT', Z, zs_), wt) if s < 0 else M('DIVIDE', M('SUBTRACT', zs_ + wt, Z), wt)
                    v = M('SUBTRACT', 1.0, M('DIVIDE', M('SUBTRACT', ybs, Yc), ht))
                else:
                    u = M('DIVIDE', M('MULTIPLY', M('SUBTRACT', Yc, ybs if s < 0 else (ybs - wt)), s), wt)
                    v = M('ADD', 1.0, M('DIVIDE', M('SUBTRACT', Z, zs_), ht))
                cmb = N('ShaderNodeCombineXYZ'); links.new(u, cmb.inputs['X']); links.new(v, cmb.inputs['Y'])
                tx = N('ShaderNodeTexImage'); tx.image = imt; tx.extension = 'CLIP'; tx.interpolation = 'Linear'; links.new(cmb.outputs['Vector'], tx.inputs['Vector'])
                c = mixc(c, colr, M('MULTIPLY', M('MULTIPLY', M('MULTIPLY', tx.outputs['Alpha'], maprange(M('MULTIPLY', gsep.outputs['X'], s), 0.12, 0.30, 0.0, 1.0)), gate), 0.90))
        return c
    if kind in ('FB2_body', 'FB2_metal'):
        c = mixc(c, mixc(c, gray(0.90), 1.0, 'MULTIPLY'), M('MULTIPLY', patch, 0.5))          # неровный заводской слой - мягко
        c = mixc(c, mixc(c, gray(1.10), 1.0, 'MULTIPLY'), M('MULTIPLY', scuff, 0.40))
        c = mixc(c, mixc(c, gray(1.04), 1.0, 'MULTIPLY'), M('MULTIPLY', fine, 0.40))
        dust = M('MULTIPLY', maprange(gsep.outputs['Z'], -0.2, -0.9, 0.0, 1.0), noise(3.0, 5.0, 0.6, 0.40, 0.70))
        c = mixc(c, rgb((0.42, 0.38, 0.32)), M('MULTIPLY', dust, 0.30))                         # пыль и грязь снизу - слегка
        if kind == 'FB2_body':
            c = stencils(c, 'dark', rgb((0.018, 0.018, 0.018)), 1.0)
        c = mixc(c, rgb((0.30, 0.30, 0.31)), M('MULTIPLY', M('ADD', M('MULTIPLY', edge, 0.35), chip, clamp=True), 0.50))   # лёгкие потёртости: светлая краска стёрта до тёмного грунта   # лёгкие сколы по кромкам
    elif kind == 'FB2_red':
        c = mixc(c, mixc(c, gray(0.85), 1.0, 'MULTIPLY'), M('MULTIPLY', patch, 0.5))
        c = mixc(c, rgb((0.20, 0.17, 0.15)), M('MULTIPLY', edge, 0.35))
    c = mixc(c, gray(M('MULTIPLY', a1, a2)), 1.0, 'MULTIPLY')
    c = mixc(c, gray(grain), 1.0, 'MULTIPLY')
    emi = N('ShaderNodeEmission'); links.new(c, emi.inputs['Color'])
    links.new(emi.outputs['Emission'], out.inputs['Surface'])
    tex = N('ShaderNodeTexImage'); tex.image = img
    for n in nodes: n.select = False
    tex.select = True; nodes.active = tex
    return out, prin, tex, col


rig = {m.name: build_pattern(m) for m in mats}
log('шейдеры готовы')
sys.path.insert(0, '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/_инструменты')
import gpu_setup
log('Cycles:', gpu_setup.use_gpu(sc)); sc.cycles.samples = 24
if os.environ.get('FB_CPU'): sc.cycles.device = 'CPU'; log('считаю на процессоре')
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
    k_fine, bev_r = {'FB2_body': (0.20, 0.0016), 'FB2_metal': (0.16, 0.0010), 'FB2_red': (0.08, 0.0008)}.get(mat.name, (0.08, 0.001))
    geo, sep = coords(nodes, links)
    bev = nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = bev_r; bev.samples = 10
    def noise(scale, detail, rough):
        n = nodes.new('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(geo.outputs['Position'], n.inputs['Vector']); return n.outputs['Fac']
    M = node_math(nodes, links)
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.002; bump.inputs['Strength'].default_value = 1.0
    h = M('ADD', M('MULTIPLY', noise(150.0, 3.0, 0.55), 0.50 * k_fine), M('MULTIPLY', noise(14.0, 3.0, 0.5), 0.55 * k_fine))   # толстая заводская краска
    links.new(h, bump.inputs['Height'])
    links.new(bev.outputs['Normal'], bump.inputs['Normal'])
    links.new(bump.outputs['Normal'], prin.inputs['Normal'])


nimg = bpy.data.images.get('FB2_normal')
if nimg is not None: bpy.data.images.remove(nimg)
nimg = bpy.data.images.new('FB2_normal', NSIZE, NSIZE, alpha=False)
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
npath = os.path.join(OUT, 'fab250_normal.png')
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
for im in [i for i in bpy.data.images if i.name.startswith('FB2_stencil')]: bpy.data.images.remove(im)
log('материалы подключены')


def lite(image, name, fmt, fname, px):
    c = image.copy(); c.name = name; c.scale(px, px); c.file_format = fmt
    p_ = os.path.join(OUT, fname)
    try: c.save(filepath=p_, quality=92)
    except TypeError:
        c.filepath_raw = p_; c.save()
    bpy.data.images.remove(c)
    return p_


lite(img, f'FB2_detail_{GAME_TEX}', 'JPEG', f'fab250_detail_{GAME_TEX}.jpg', GAME_TEX); lite(nimg, f'FB2_normal_{GAME_NTEX}', 'PNG', f'fab250_normal_{GAME_NTEX}.png', GAME_NTEX)
log('облегчённые копии готовы')
