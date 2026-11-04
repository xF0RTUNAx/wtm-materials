# bake.py - запекает текстуры AGM-65B на видеокарте: цвет (agm65b_detail.png: белая краска с лёгким износом, чёрная лента за головкой, коричневый поясок у хвоста, красное кольцо у стекла,
# свои надписи, затенение стыков, заклёпки) и нормали (agm65b_normal.png: кромки, заклёпки, шагрень). Запускается ПОСЛЕ build.py в той же сессии:
#   AGM_OUT="<папка модели>" [AGM_TEX=2048] Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Развёртка: корпус - одной полосой вокруг оси со швом снизу (ring_uv), остальное - смарт-проекцией; без поворота, зазор 16 px, острова сжаты к центру на 24 px. Стекло и оптика - плоские материалы.
import os, sys, math, time, json
sys.dont_write_bytecode = True
import bpy
import modelkit as mk
import numpy as np
import agm_geo as g

OUT = os.environ.get('AGM_OUT')
if not OUT: raise SystemExit('Задай AGM_OUT=<папка модели>')
HERE_ = os.path.dirname(os.path.abspath(g.__file__))
SIZE = int(os.environ.get('AGM_TEX', '2048')); NSIZE = int(os.environ.get('AGM_NTEX', str(SIZE)))
GAME_TEX, GAME_NTEX = int(os.environ.get('AGM_GAME_TEX', '1024')), int(os.environ.get('AGM_GAME_NTEX', '512'))
WHITE = tuple(float(v) for v in os.environ.get('AGM_WHITE', '0.80,0.80,0.78').split(','))
WEAR = float(os.environ.get('AGM_WEAR', '0.5'))        # 0 - новая, 1 - заметно потёртая
T0 = time.time()
sc = bpy.data.scenes['AGM65B']
if bpy.context.window: bpy.context.window.scene = sc
vl = bpy.context.view_layer; vl.update()
FLAT = ('M65_glass', 'M65_lens', 'M65_optic')
objs = [o for o in sc.objects if o.type == 'MESH' and o.name not in ('M65_glass', 'M65_optics')]
body = next(o for o in objs if o.name == 'M65_body')
YB = g.Yb
next(n for n in bpy.data.materials['M65_body'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (*WHITE, 1.0)


def log(*a): print(f'[{time.time() - T0:5.1f} с]', *a, flush=True)


def ring_uv(o, n=g.NSEG):
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
        for i, a, ri in zip(li, ang, rings): uvd[i].uv = (a * g.R, vv[ri])                 # u - по наружному радиусу: без растяжения на цилиндре


# ── развёртка ──
for o in vl.objects: o.select_set(False)
for o in objs:
    while len(o.data.uv_layers) > 0: o.data.uv_layers.remove(o.data.uv_layers[0])
    o.data.uv_layers.new(name='UVMap')
ring_uv(body)
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
bpy.ops.uv.pack_islands(rotate=False, margin=16.0 / SIZE, margin_method='ADD')
bpy.ops.object.mode_set(mode='OBJECT')
k_in = 1.0 - 24.0 / SIZE
for o in objs:
    for d in o.data.uv_layers.active.data: d.uv = (0.5 + (d.uv.x - 0.5) * k_in, 0.5 + (d.uv.y - 0.5) * k_in)
log('развёртка готова, объектов', len(objs))

# ── цвет ──
old = bpy.data.images.get('M65_detail')
if old is not None: bpy.data.images.remove(old)
path = os.path.join(OUT, 'agm65b_detail.png')
img = bpy.data.images.new('M65_detail', SIZE, SIZE, alpha=False); img.generated_color = (1, 1, 1, 1)
mats = [m for m in bpy.data.materials if m.name.startswith('M65_') and m.name not in FLAT and m.users > 0]
DEC = json.load(open(os.path.join(HERE_, '_decals', 'decals.json')))
DECIM = {n: bpy.data.images.load(os.path.join(HERE_, '_decals', n + '.png'), check_existing=True) for n in DEC}


def rivets(nt, N, math_, sep, gate_all=True):
    """Заклёпки по координатам модели: кольца через 0,33 м на цилиндре и пары рядов вдоль корней крыльев. Возвращает (купол 0…1, тёмный ободок 0…1)."""
    links = nt.links
    X, Yc, Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    a = math_('SUBTRACT', g.L / 2, Yc)
    phi = N('ShaderNodeMath'); phi.operation = 'ARCTAN2'; links.new(X, phi.inputs[0]); links.new(Z, phi.inputs[1]); phi = phi.outputs[0]        # 0 - верх
    # кольца
    a0, P = 0.90, 0.33
    t = math_('DIVIDE', math_('SUBTRACT', a, a0), P); fa = math_('MULTIPLY', math_('SUBTRACT', t, math_('ROUND', t)), P)
    pit = 2 * math.pi / 24
    tp = math_('DIVIDE', math_('ADD', phi, pit / 2), pit); fp = math_('MULTIPLY', math_('SUBTRACT', tp, math_('ROUND', tp)), pit * g.R)
    d1 = math_('SQRT', math_('ADD', math_('MULTIPLY', fa, fa), math_('MULTIPLY', fp, fp)))
    g1 = math_('MULTIPLY', math_('GREATER_THAN', a, 0.87), math_('LESS_THAN', a, 2.17))
    d1 = math_('ADD', d1, math_('MULTIPLY', math_('SUBTRACT', 1.0, g1), 5.0))
    # ряды вдоль корней крыльев: ±0,040 м от плоскости крыла, шаг 0,05 м
    q = math.pi / 2
    tq = math_('DIVIDE', math_('SUBTRACT', phi, math.pi / 4), q); wr = math_('ABSOLUTE', math_('MULTIPLY', math_('SUBTRACT', tq, math_('ROUND', tq)), q * g.R))
    dr = math_('SUBTRACT', wr, 0.040)
    t2 = math_('DIVIDE', a, 0.05); fa2 = math_('MULTIPLY', math_('SUBTRACT', t2, math_('ROUND', t2)), 0.05)
    d2 = math_('SQRT', math_('ADD', math_('MULTIPLY', dr, dr), math_('MULTIPLY', fa2, fa2)))
    g2 = math_('MULTIPLY', math_('GREATER_THAN', a, 0.95), math_('LESS_THAN', a, 2.15))
    d2 = math_('ADD', d2, math_('MULTIPLY', math_('SUBTRACT', 1.0, g2), 5.0))
    d = math_('MINIMUM', d1, d2)
    rad = math_('SQRT', math_('ADD', math_('MULTIPLY', X, X), math_('MULTIPLY', Z, Z)))
    d = math_('ADD', d, math_('MULTIPLY', math_('GREATER_THAN', rad, g.R + 0.002), 5.0))          # только на корпусе
    dm = N('ShaderNodeMapRange'); dm.clamp = True; dm.inputs['From Min'].default_value = 0.0048; dm.inputs['From Max'].default_value = 0.0015; dm.inputs['To Min'].default_value = 0.0; dm.inputs['To Max'].default_value = 1.0
    links.new(d, dm.inputs['Value'])
    hm = N('ShaderNodeMapRange'); hm.clamp = True; hm.inputs['From Min'].default_value = 0.0075; hm.inputs['From Max'].default_value = 0.0048; hm.inputs['To Min'].default_value = 0.0; hm.inputs['To Max'].default_value = 1.0
    links.new(d, hm.inputs['Value'])
    return dm.outputs['Result'], hm.outputs['Result']


def build_pattern(mat):
    nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for n in list(nodes):
        if n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): nodes.remove(n)
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL'); prin = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    col = tuple(prin.inputs['Base Color'].default_value)
    for l in list(prin.inputs['Base Color'].links): links.remove(l)
    N = lambda t: nodes.new(t); kind = mat.name; painted = kind == 'M65_body'
    def math_(op, a=None, b=None, clamp=False):
        n = N('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: links.new(v, n.inputs[i])
        return n.outputs['Value']
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
    tc = N('ShaderNodeTexCoord'); geo = N('ShaderNodeNewGeometry'); gsep = N('ShaderNodeSeparateXYZ'); links.new(geo.outputs['Normal'], gsep.inputs['Vector'])
    sep = N('ShaderNodeSeparateXYZ'); links.new(geo.outputs['Position'], sep.inputs['Vector'])          # маски - в мировых координатах (у рулей начало на их оси)
    ao1 = N('ShaderNodeAmbientOcclusion'); ao1.samples = 24; ao1.inputs['Distance'].default_value = 0.010
    ao2 = N('ShaderNodeAmbientOcclusion'); ao2.samples = 12; ao2.inputs['Distance'].default_value = 0.05
    a1 = maprange(ao1.outputs['AO'], 0, 1, 0.62, 1.0); a2 = maprange(ao2.outputs['AO'], 0, 1, 0.84, 1.0)
    def noise(scale, detail, rough, lo, hi, vec=None):
        n = N('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(vec if vec is not None else tc.outputs['Object'], n.inputs['Vector']); return maprange(n.outputs['Fac'], lo, hi, 0.0, 1.0)
    mp = N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (55.0, 1.3, 55.0); links.new(tc.outputs['Object'], mp.inputs['Vector'])
    streak = noise(1.0, 4.0, 0.62, 0.42, 0.72, vec=mp.outputs['Vector'])
    patchy = noise(4.0, 6.0, 0.6, 0.30, 0.72)
    bev = N('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.0018; bev.samples = 6
    dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; links.new(bev.outputs['Normal'], dot.inputs[0]); links.new(geo.outputs['Normal'], dot.inputs[1])
    edge = maprange(dot.outputs['Value'], 1.0, 0.93, 0.0, 1.0)
    chip = math_('MULTIPLY', edge, noise(26.0, 5.0, 0.6, 0.52, 0.62))
    c = rgb(col)
    if kind == 'M65_body' :
        a_ = math_('SUBTRACT', g.L / 2, sep.outputs['Y'])
        def zone(a0, a1): return math_('MULTIPLY', math_('GREATER_THAN', a_, a0), math_('LESS_THAN', a_, a1))
        c = mixc(c, rgb((0.022, 0.022, 0.024)), zone(*g.BAND_BLACK))                     # чёрный поясок за головкой (лента)
        c = mixc(c, rgb((0.075, 0.048, 0.026)), zone(*g.BAND_BROWN))                     # коричневый поясок у хвоста
        c = mixc(c, rgb((0.50, 0.035, 0.025)), zone(0.100, 0.118))                       # красное кольцо вокруг стекла
        c = mixc(c, rgb((0.50, 0.035, 0.025)), math_('MULTIPLY', zone(g.L - 0.030, g.L - 0.012), math_('LESS_THAN', math_('SQRT', math_('ADD', math_('MULTIPLY', sep.outputs['X'], sep.outputs['X']), math_('MULTIPLY', sep.outputs['Z'], sep.outputs['Z']))), g.R_CAV + 0.001)))   # красная метка на кромке полости (референс_3)
        for name, m in DEC.items():
            W_, H_ = m['w'], m['h']; yc = YB(m['a']); zc = m['z']
            for s in (1.0, -1.0):
                dy = math_('SUBTRACT', sep.outputs['Y'], yc); dz = math_('SUBTRACT', sep.outputs['Z'], zc)
                cmb = N('ShaderNodeCombineXYZ')
                if m['kind'] == 'side':       # вдоль корпуса: на борту +X читается к носу, на -X - к хвосту; верх букв +Z
                    uu = math_('ADD', math_('DIVIDE', math_('MULTIPLY', dy, s), W_), 0.5); vv = math_('ADD', math_('DIVIDE', dz, H_), 0.5)
                else:                          # поперёк (референс_1: красная надпись): верх букв к носу
                    uu = math_('ADD', math_('DIVIDE', math_('MULTIPLY', dz, -s), W_), 0.5); vv = math_('ADD', math_('DIVIDE', dy, H_), 0.5)
                links.new(uu, cmb.inputs['X']); links.new(vv, cmb.inputs['Y'])
                tx = N('ShaderNodeTexImage'); tx.image = DECIM[name]; tx.extension = 'CLIP'; tx.interpolation = 'Linear'; links.new(cmb.outputs['Vector'], tx.inputs['Vector'])
                side_mask = maprange(math_('MULTIPLY', gsep.outputs['X'], s), 0.25, 0.45, 0.0, 1.0)
                on_hull = math_('LESS_THAN', math_('SQRT', math_('ADD', math_('MULTIPLY', sep.outputs['X'], sep.outputs['X']), math_('MULTIPLY', sep.outputs['Z'], sep.outputs['Z']))), g.R + 0.006)   # только на корпусе, не на крыльях
                side_mask = math_('MULTIPLY', side_mask, on_hull)
                worn = math_('SUBTRACT', 0.97, math_('MULTIPLY', noise(14.0, 5.0, 0.6, 0.55, 0.75), 0.30 * WEAR))
                c = mixc(c, rgb(m['col']), math_('MULTIPLY', math_('MULTIPLY', tx.outputs['Alpha'], side_mask), worn))
    c = mixc(c, rgb((0.34, 0.33, 0.30)), math_('MULTIPLY', math_('MULTIPLY', streak, math_('ADD', 0.25, math_('MULTIPLY', patchy, 0.75))), 0.16 * WEAR if painted else 0.25 * WEAR))     # лёгкие потёки
    c = mixc(c, rgb((0.34, 0.34, 0.35) if painted else (0.55, 0.55, 0.56)), math_('MULTIPLY', math_('ADD', math_('MULTIPLY', edge, 0.35), chip, clamp=True), 0.55 * WEAR))                 # стёртые кромки
    if kind == 'M65_body':
        dome, halo = rivets(nt, N, math_, sep)
        c = mixc(c, gray(math_('SUBTRACT', 1.0, math_('MULTIPLY', math_('MULTIPLY', halo, math_('SUBTRACT', 1.0, dome)), 0.38))), 1.0, 'MULTIPLY')
    c = mixc(c, gray(math_('MULTIPLY', a1, a2)), 1.0, 'MULTIPLY')
    emi = N('ShaderNodeEmission'); links.new(c, emi.inputs['Color']); links.new(emi.outputs['Emission'], out.inputs['Surface'])
    tex = N('ShaderNodeTexImage'); tex.image = img
    for n in nodes: n.select = False
    tex.select = True; nodes.active = tex
    return out, prin, tex, col


rig = {m.name: build_pattern(m) for m in mats}
sys.path.insert(0, '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/_инструменты')
import gpu_setup
log('Cycles:', gpu_setup.use_gpu(sc)); sc.cycles.samples = 24
try: sc.cycles.use_denoising = False
except Exception: pass
for o in vl.objects: o.select_set(False)
for o in objs: o.select_set(True)
vl.objects.active = objs[0]
bpy.ops.object.bake(type='EMIT', width=SIZE, height=SIZE, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
log('цвет запечён')
img.filepath_raw = path; img.file_format = 'PNG'; img.save(); img.pack()


# ── нормали ──
def build_relief(mat, entry):
    out, prin, tex, col = entry; nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for l in list(out.inputs['Surface'].links): links.remove(l)
    links.new(prin.outputs['BSDF'], out.inputs['Surface'])
    k_fine, bev_r = {'M65_body': (0.14, 0.0016), 'M65_steel': (0.10, 0.0012), 'M65_dark': (0.05, 0.0012)}.get(mat.name, (0.1, 0.001))
    tc = nodes.new('ShaderNodeTexCoord'); geo = nodes.new('ShaderNodeNewGeometry'); sep = nodes.new('ShaderNodeSeparateXYZ'); links.new(geo.outputs['Position'], sep.inputs['Vector'])
    bev = nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = bev_r; bev.samples = 10
    def m_(op, a=None, b=None):
        n = nodes.new('ShaderNodeMath'); n.operation = op
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: links.new(v, n.inputs[i])
        return n.outputs['Value']
    nz = nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 110.0; nz.inputs['Detail'].default_value = 3.0; links.new(tc.outputs['Object'], nz.inputs['Vector'])
    h = m_('MULTIPLY', nz.outputs['Fac'], 0.5 * k_fine)
    if mat.name == 'M65_body':
        dome, halo = rivets(nt, lambda t: nodes.new(t), lambda op, a=None, b=None, clamp=False: m_(op, a, b), sep)
        h = m_('ADD', h, m_('MULTIPLY', dome, 1.1))
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.0016; bump.inputs['Strength'].default_value = 1.0
    links.new(h, bump.inputs['Height']); links.new(bev.outputs['Normal'], bump.inputs['Normal']); links.new(bump.outputs['Normal'], prin.inputs['Normal'])


nimg = bpy.data.images.new('M65_normal', NSIZE, NSIZE, alpha=False); nimg.generated_color = (0.5, 0.5, 1.0, 1.0); nimg.colorspace_settings.name = 'Non-Color'
ntex_of = {}
for m in mats:
    build_relief(m, rig[m.name]); nt = m.node_tree; ntx = nt.nodes.new('ShaderNodeTexImage'); ntx.image = nimg; ntex_of[m.name] = ntx
    for n in nt.nodes: n.select = False
    ntx.select = True; nt.nodes.active = ntx
bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', width=NSIZE, height=NSIZE, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
log('нормали запечены')
npath = os.path.join(OUT, 'agm65b_normal.png'); nimg.filepath_raw = npath; nimg.file_format = 'PNG'; nimg.save(); nimg.pack()

for m in mats:
    out, prin, tex, col = rig[m.name]; nt = m.node_tree; ntx = ntex_of[m.name]
    for l in list(prin.inputs['Normal'].links): nt.links.remove(l)
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.space = 'TANGENT'; nm.uv_map = 'UVMap'
    keep = {out, prin, tex, ntx, nm}
    for n in list(nt.nodes):
        if n not in keep: nt.nodes.remove(n)
    nt.links.new(tex.outputs['Color'], prin.inputs['Base Color']); nt.links.new(ntx.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], prin.inputs['Normal'])
log('материалы подключены:', [m.name for m in mats])


def lite(image, name, fmt, fname, px):
    c = image.copy(); c.name = name; c.scale(px, px); c.file_format = fmt
    p_ = os.path.join(OUT, fname)
    try: c.save(filepath=p_, quality=92)
    except TypeError:
        c.filepath_raw = p_; c.save()
    bpy.data.images.remove(c)


lite(img, f'M65_detail_{GAME_TEX}', 'JPEG', f'agm65b_detail_{GAME_TEX}.jpg', GAME_TEX); lite(nimg, f'M65_normal_{GAME_NTEX}', 'PNG', f'agm65b_normal_{GAME_NTEX}.png', GAME_NTEX)
log('облегчённые копии', GAME_TEX, '/', GAME_NTEX)
