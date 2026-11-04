# bake.py - запекает текстуры КАБ-500С на видеокарте: цвет (kab500s_detail.png: серый металл, потёки, своя надпись, прорези и отверстия, затенение стыков, красные метки по K5S_RED) и нормали (kab500s_normal.png). После build.py в той же сессии:
#   K5S_OUT="<папка модели>" [K5S_TEX=2048] [K5S_BODY=r,g,b] Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Развёртка: корпус - одной полосой вокруг оси со швом снизу (ring_uv), остальное - смарт-проекцией; без поворота, зазор 16 px, острова сжаты к центру на 24 px.
import os, sys, math, time, json
sys.dont_write_bytecode = True
import bpy
import modelkit as mk
import numpy as np
import k5s_geo as g

OUT = os.environ.get('K5S_OUT')
if not OUT: raise SystemExit('Задай K5S_OUT=<папка модели>')
HERE_ = os.path.dirname(os.path.abspath(g.__file__))
SIZE = int(os.environ.get('K5S_TEX', '2048')); NSIZE = int(os.environ.get('K5S_NTEX', str(SIZE)))
GAME_TEX, GAME_NTEX = int(os.environ.get('K5S_GAME_TEX', '1024')), int(os.environ.get('K5S_GAME_NTEX', '1024'))
BODY = tuple(float(v) for v in os.environ.get('K5S_BODY', '0.355,0.39,0.447').split(','))
RED = os.environ.get('K5S_RED', '1') == '1'
WEAR = float(os.environ.get('K5S_WEAR', '0.95'))        # 0 - новая, 1 - заметно потёртая
T0 = time.time()
sc = bpy.data.scenes['KAB500S']
if bpy.context.window: bpy.context.window.scene = sc
vl = bpy.context.view_layer; vl.update()
FLAT = ()
objs = [o for o in sc.objects if o.type == 'MESH' and True]
body = next(o for o in objs if o.name == 'K5S_body')
YB = g.Yb
next(n for n in bpy.data.materials['K5S_body'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (*BODY, 1.0)
next(n for n in bpy.data.materials['K5S_steel'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (*[min(1.0, v * 1.10) for v in BODY], 1.0)
next(n for n in bpy.data.materials['K5S_cap'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (*[min(1.0, v * 1.10) for v in BODY], 1.0)


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
old = bpy.data.images.get('K5S_detail')
if old is not None: bpy.data.images.remove(old)
path = os.path.join(OUT, 'kab500s_detail.png')
img = bpy.data.images.new('K5S_detail', SIZE, SIZE, alpha=False); img.generated_color = (1, 1, 1, 1)
mats = [m for m in bpy.data.materials if m.name.startswith('K5S_') and m.name not in FLAT and m.users > 0]
DEC = json.load(open(os.path.join(HERE_, '_decals', 'decals.json')))
DECIM = {n: bpy.data.images.load(os.path.join(HERE_, '_decals', n + '.png'), check_existing=True) for n in DEC}


def holes(nt, N, math_, sep):
    """Тёмные отверстия и прорези на корпусе по координатам модели: кольцо за конусом, панели на бортах, дуги прорезей. Возвращает маску 0…1."""
    X, Yc, Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    a = math_('SUBTRACT', g.L / 2, Yc); ax = math_('ABSOLUTE', X)
    phi = N('ShaderNodeMath'); phi.operation = 'ARCTAN2'; nt.links.new(X, phi.inputs[0]); nt.links.new(Z, phi.inputs[1]); phi = phi.outputs[0]    # 0 - верх
    def gt(v, e0, e1):
        n = N('ShaderNodeMapRange'); n.clamp = True; n.inputs['From Min'].default_value = e0; n.inputs['From Max'].default_value = e1; n.inputs['To Min'].default_value = 0.0; n.inputs['To Max'].default_value = 1.0
        nt.links.new(v, n.inputs['Value']); return n.outputs['Result']
    pit = 2 * math.pi / 8                                     # кольцо из 8 отверстий на пояске (референс_2)
    tp = math_('DIVIDE', math_('ADD', phi, pit / 2), pit); fp = math_('MULTIPLY', math_('SUBTRACT', tp, math_('ROUND', tp)), pit * 0.187)
    fa = math_('SUBTRACT', a, 0.770)
    d = math_('SQRT', math_('ADD', math_('MULTIPLY', fa, fa), math_('MULTIPLY', fp, fp)))
    for a_i, z_i in g.DOTS:                                   # панели на бортах
        da = math_('SUBTRACT', a, a_i); dz = math_('SUBTRACT', Z, z_i)
        d_i = math_('SQRT', math_('ADD', math_('MULTIPLY', da, da), math_('MULTIPLY', dz, dz)))
        d_i = math_('ADD', d_i, math_('MULTIPLY', math_('LESS_THAN', ax, 0.05), 5.0))
        d = math_('MINIMUM', d, d_i)
    m = gt(d, 0.0075, 0.0052)
    for a_i, n_, ph in g.SLITS:                               # дуги прорезей
        band = gt(math_('ABSOLUTE', math_('SUBTRACT', a, a_i)), 0.0028, 0.0015)
        dash = gt(math_('COSINE', math_('ADD', math_('MULTIPLY', phi, float(n_)), ph * 2 * math.pi)), -0.45, -0.25)
        m = math_('MAXIMUM', m, math_('MULTIPLY', band, dash))
    rad = math_('SQRT', math_('ADD', math_('MULTIPLY', X, X), math_('MULTIPLY', Z, Z)))
    return math_('MULTIPLY', m, math_('LESS_THAN', rad, g.R + 0.0012))      # только на самой обшивке (не на накладках, проушинах, табличке)


def rivets(nt, N, math_, sep):
    """Мелкие заклёпки рядами у нахлёстов: (купол 0…1, тёмный ободок 0…1)."""
    X, Yc, Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    a = math_('SUBTRACT', g.L / 2, Yc)
    phi = N('ShaderNodeMath'); phi.operation = 'ARCTAN2'; nt.links.new(X, phi.inputs[0]); nt.links.new(Z, phi.inputs[1]); phi = phi.outputs[0]
    pit = 2 * math.pi / 44
    tp = math_('DIVIDE', math_('ADD', phi, pit / 2), pit); fp = math_('MULTIPLY', math_('SUBTRACT', tp, math_('ROUND', tp)), pit * g.R)
    d = None
    for a_i in g.RIV_A:
        fa = math_('SUBTRACT', a, a_i); d_i = math_('SQRT', math_('ADD', math_('MULTIPLY', fa, fa), math_('MULTIPLY', fp, fp)))
        d = d_i if d is None else math_('MINIMUM', d, d_i)
    rad = math_('SQRT', math_('ADD', math_('MULTIPLY', X, X), math_('MULTIPLY', Z, Z)))
    d = math_('ADD', d, math_('MULTIPLY', math_('GREATER_THAN', rad, g.R + 0.0030), 5.0))
    def rng(e0, e1):
        n = N('ShaderNodeMapRange'); n.clamp = True; n.inputs['From Min'].default_value = e0; n.inputs['From Max'].default_value = e1; n.inputs['To Min'].default_value = 0.0; n.inputs['To Max'].default_value = 1.0
        nt.links.new(d, n.inputs['Value']); return n.outputs['Result']
    return rng(0.0040, 0.0014), rng(0.0062, 0.0040)


def build_pattern(mat):
    nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for n in list(nodes):
        if n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): nodes.remove(n)
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL'); prin = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    col = tuple(prin.inputs['Base Color'].default_value)
    for l in list(prin.inputs['Base Color'].links): links.remove(l)
    N = lambda t: nodes.new(t); kind = mat.name; painted = kind == 'K5S_body'
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
    ao3 = N('ShaderNodeAmbientOcclusion'); ao3.samples = 8; ao3.inputs['Distance'].default_value = 0.16
    a1 = maprange(ao1.outputs['AO'], 0, 1, 0.58, 1.0); a2 = maprange(ao2.outputs['AO'], 0, 1, 0.74, 1.0); a3 = maprange(ao3.outputs['AO'], 0, 1, 0.86, 1.0)
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
    wear_k = 0.25 if kind == 'K5S_white' else 1.0
    a_w = math_('SUBTRACT', g.L / 2, sep.outputs['Y']); rr_w = math_('SQRT', math_('ADD', math_('MULTIPLY', sep.outputs['X'], sep.outputs['X']), math_('MULTIPLY', sep.outputs['Z'], sep.outputs['Z'])))
    if kind == 'K5S_body' :
        a_ = math_('SUBTRACT', g.L / 2, sep.outputs['Y'])
        def zone(a0, a1): return math_('MULTIPLY', math_('GREATER_THAN', a_, a0), math_('LESS_THAN', a_, a1))
        for (z0_, z1_), k_ in (((0.0, 0.725), 0.90), ((1.03, 1.69), 0.97), ((1.69, 1.87), 1.03), ((1.87, 2.39), 0.97), ((2.39, 3.01), 0.94)):   # тон секций: нос темнее (референс_3), остальное почти ровно
            c = mixc(c, mixc(c, gray(k_), 1.0, 'MULTIPLY'), zone(z0_, z1_))
        c = mixc(c, rgb((0.018, 0.019, 0.021)), holes(nt, N, math_, sep))             # прорези и отверстия
    if kind in ('K5S_body', 'K5S_white'):
        for name, m in DEC.items():
            if (name == 'plate') != (kind == 'K5S_white'): continue
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
                on_hull = math_('LESS_THAN', math_('SQRT', math_('ADD', math_('MULTIPLY', sep.outputs['X'], sep.outputs['X']), math_('MULTIPLY', sep.outputs['Z'], sep.outputs['Z']))), g.R + 0.0065)   # только на корпусе, не на рулях и крыльях
                side_mask = math_('MULTIPLY', side_mask, on_hull)
                worn = math_('SUBTRACT', 0.97, math_('MULTIPLY', noise(14.0, 5.0, 0.6, 0.55, 0.75), 0.30 * WEAR))
                c = mixc(c, rgb(m['col']), math_('MULTIPLY', math_('MULTIPLY', tx.outputs['Alpha'], side_mask), worn))
    if kind == 'K5S_body' and RED:                                                    # красная метка на задней кромке крыла (референс_2, 3)
        c = mixc(c, rgb((0.50, 0.035, 0.03)), math_('MULTIPLY', math_('GREATER_THAN', a_w, g.WING_TIP1 - g.RED_EDGE), math_('GREATER_THAN', rr_w, g.HINGE_R + 0.010)))
    if kind == 'K5S_cap' and RED: c = rgb((0.50, 0.035, 0.03))                        # красный колпак (референс_2, 3)
    if kind == 'K5S_dark':                                                            # сетка в крышке (референс_2, 3)
        fx = math_('SINE', math_('MULTIPLY', sep.outputs['X'], 2 * math.pi / 0.009)); fy = math_('SINE', math_('MULTIPLY', sep.outputs['Y'], 2 * math.pi / 0.009))
        c = mixc(c, rgb((0.22, 0.21, 0.19)), math_('MULTIPLY', math_('GREATER_THAN', fx, 0.0), math_('GREATER_THAN', fy, 0.0)))
    # ── настоящая окраска: мазки распылителя, пыль сверху, грязь снизу, потёки вдоль потока, царапины, сколы до металла, грязь в стыках ──
    BARE = (0.56, 0.57, 0.59)
    if kind != 'K5S_dark':
        mott = noise(2.6, 5.0, 0.55, 0.30, 0.70); fine = noise(38.0, 4.0, 0.6, 0.35, 0.65)
        c = mixc(c, gray(math_('ADD', 0.90, math_('ADD', math_('MULTIPLY', mott, 0.16), math_('MULTIPLY', fine, 0.06)))), 1.0, 'MULTIPLY')
        top = maprange(gsep.outputs['Z'], 0.1, 0.9, 0.0, 1.0); bot = maprange(gsep.outputs['Z'], -0.15, -0.9, 0.0, 1.0)
        c = mixc(c, rgb((0.47, 0.46, 0.43)), math_('MULTIPLY', math_('MULTIPLY', top, noise(5.5, 5.0, 0.6, 0.35, 0.72)), 0.16 * WEAR * wear_k))
        c = mixc(c, gray(math_('SUBTRACT', 1.0, math_('MULTIPLY', math_('MULTIPLY', bot, noise(7.0, 5.0, 0.6, 0.30, 0.70)), 0.26 * WEAR * wear_k))), 1.0, 'MULTIPLY')
        mp2 = N('ShaderNodeMapping'); mp2.inputs['Scale'].default_value = (70.0, 0.9, 70.0); links.new(tc.outputs['Object'], mp2.inputs['Vector'])
        rain = noise(1.0, 4.0, 0.6, 0.52, 0.78, vec=mp2.outputs['Vector'])
        c = mixc(c, rgb((0.10, 0.10, 0.095)), math_('MULTIPLY', math_('MULTIPLY', rain, math_('ADD', 0.2, math_('MULTIPLY', patchy, 0.8))), 0.30 * WEAR * wear_k))
    c = mixc(c, rgb((0.34, 0.33, 0.30)), math_('MULTIPLY', math_('MULTIPLY', streak, math_('ADD', 0.25, math_('MULTIPLY', patchy, 0.75))), 0.14 * WEAR * wear_k))
    if kind != 'K5S_dark':
        mp3 = N('ShaderNodeMapping'); mp3.inputs['Scale'].default_value = (230.0, 5.0, 230.0); mp3.inputs['Rotation'].default_value = (0.0, 0.0, 0.5); links.new(tc.outputs['Object'], mp3.inputs['Vector'])
        scr = noise(1.0, 2.0, 0.5, 0.735, 0.765, vec=mp3.outputs['Vector'])
        small = math_('MULTIPLY', noise(95.0, 4.0, 0.55, 0.70, 0.75), noise(3.2, 4.0, 0.6, 0.45, 0.70))
        c = mixc(c, rgb(BARE), math_('ADD', math_('MULTIPLY', math_('MULTIPLY', scr, patchy), 0.55 * WEAR * wear_k), math_('MULTIPLY', small, 0.85 * WEAR * wear_k), clamp=True))
    c = mixc(c, rgb(BARE if painted or kind == 'K5S_cap' else (0.66, 0.66, 0.67)), math_('MULTIPLY', math_('ADD', math_('MULTIPLY', edge, 0.55), chip, clamp=True), 0.75 * WEAR * wear_k))     # стёртые кромки до металла
    if kind == 'K5S_body':
        dome, halo = rivets(nt, N, math_, sep)
        c = mixc(c, gray(math_('SUBTRACT', 1.0, math_('MULTIPLY', math_('MULTIPLY', halo, math_('SUBTRACT', 1.0, dome)), 0.42))), 1.0, 'MULTIPLY')
    seam = maprange(ao1.outputs['AO'], 0.90, 0.45, 0.0, 1.0)
    c = mixc(c, rgb((0.075, 0.065, 0.055)), math_('MULTIPLY', seam, 0.55))                                         # грязь в стыках и у крепежа
    c = mixc(c, gray(math_('MULTIPLY', math_('MULTIPLY', a1, a2), a3)), 1.0, 'MULTIPLY')
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
    k_fine, bev_r = {'K5S_body': (0.16, 0.0016), 'K5S_steel': (0.18, 0.0012), 'K5S_dark': (0.05, 0.0012), 'K5S_cap': (0.18, 0.0012), 'K5S_white': (0.05, 0.0010)}.get(mat.name, (0.1, 0.001))
    tc = nodes.new('ShaderNodeTexCoord'); geo = nodes.new('ShaderNodeNewGeometry'); sep = nodes.new('ShaderNodeSeparateXYZ'); links.new(geo.outputs['Position'], sep.inputs['Vector'])
    bev = nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = bev_r; bev.samples = 10
    def m_(op, a=None, b=None):
        n = nodes.new('ShaderNodeMath'); n.operation = op
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: links.new(v, n.inputs[i])
        return n.outputs['Value']
    def nzz(scale, detail, rough=0.55, vec=None):
        n = nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(vec if vec is not None else tc.outputs['Object'], n.inputs['Vector']); return n.outputs['Fac']
    h = m_('MULTIPLY', nzz(380.0, 2.0), 0.55 * k_fine)                                 # шагрень распылённой краски
    h = m_('ADD', h, m_('MULTIPLY', nzz(95.0, 3.0), 0.5 * k_fine))
    if mat.name == 'K5S_body':
        h = m_('ADD', h, m_('MULTIPLY', nzz(6.5, 2.0), 1.6))                           # лёгкая волна листа
        dome, halo = rivets(nt, lambda t: nodes.new(t), lambda op, a=None, b=None, clamp=False: m_(op, a, b), sep)
        h = m_('ADD', h, m_('MULTIPLY', dome, 0.9))
        h = m_('SUBTRACT', h, m_('MULTIPLY', holes(nt, lambda t: nodes.new(t), lambda op, a=None, b=None, clamp=False: m_(op, a, b), sep), 1.0))
    if mat.name not in ('K5S_dark', 'K5S_white'):
        mp3 = nodes.new('ShaderNodeMapping'); mp3.inputs['Scale'].default_value = (230.0, 5.0, 230.0); mp3.inputs['Rotation'].default_value = (0.0, 0.0, 0.5); links.new(tc.outputs['Object'], mp3.inputs['Vector'])
        rs = nodes.new('ShaderNodeMapRange'); rs.clamp = True; rs.inputs['From Min'].default_value = 0.735; rs.inputs['From Max'].default_value = 0.765; links.new(nzz(1.0, 2.0, 0.5, vec=mp3.outputs['Vector']), rs.inputs['Value'])
        h = m_('SUBTRACT', h, m_('MULTIPLY', rs.outputs['Result'], 0.10))              # царапины
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.0016; bump.inputs['Strength'].default_value = 1.0
    links.new(h, bump.inputs['Height']); links.new(bev.outputs['Normal'], bump.inputs['Normal']); links.new(bump.outputs['Normal'], prin.inputs['Normal'])


nimg = bpy.data.images.new('K5S_normal', NSIZE, NSIZE, alpha=False); nimg.generated_color = (0.5, 0.5, 1.0, 1.0); nimg.colorspace_settings.name = 'Non-Color'
ntex_of = {}
for m in mats:
    build_relief(m, rig[m.name]); nt = m.node_tree; ntx = nt.nodes.new('ShaderNodeTexImage'); ntx.image = nimg; ntex_of[m.name] = ntx
    for n in nt.nodes: n.select = False
    ntx.select = True; nt.nodes.active = ntx
bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', width=NSIZE, height=NSIZE, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
log('нормали запечены')
npath = os.path.join(OUT, 'kab500s_normal.png'); nimg.filepath_raw = npath; nimg.file_format = 'PNG'; nimg.save(); nimg.pack()

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


lite(img, f'K5S_detail_{GAME_TEX}', 'JPEG', f'kab500s_detail_{GAME_TEX}.jpg', GAME_TEX); lite(nimg, f'K5S_normal_{GAME_NTEX}', 'PNG', f'kab500s_normal_{GAME_NTEX}.png', GAME_NTEX)
log('облегчённые копии', GAME_TEX, '/', GAME_NTEX)
