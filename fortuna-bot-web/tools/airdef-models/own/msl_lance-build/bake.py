# bake.py — запекает две текстуры ракеты MGM-52 Lance: цвет (msl_lance_detail.png: оливковая заводская краска со сколами и потёками, светлая головная часть, копоть у сопла, затенение щелей, трафарет «U.S. ARMY», белые чёрточки у ремней,
# жёлто-песочные заплатки, белые метки на концах крыльев, винты по стыку головной части) и карту нормалей (msl_lance_normal.png: скруглённые кромки, зерно краски, купола винтов). Нужен Cycles (на видеокарте — gpu_setup).
# Запускается ПОСЛЕ build.py в той же сессии (фоновый Blender или живой через exec):
#   LNC_OUT="<папка модели>" [LNC_TEX=2048] Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Лист трафаретов (_текстуры/lnc_decals_L.png, _R.png) рисует lnc_sheet.py (/usr/bin/python3 -I lnc_sheet.py "<папка модели>"); здесь он проецируется с бортов шейдером по координатам модели
# (L — левый борт −X, нос слева; R — правый борт +X, нос справа). Развёртка: корпус — одной полосой вокруг оси со швом снизу (ring_uv), оперение и короб — смарт-проекцией; упаковка без поворота, зазор 16 px.
# LNC_REUSE=1 — цвет не запекать заново (геометрия та же), пересчитать только нормали. Для игры deliver.py берёт облегчённые LNC_GAME_TEX / LNC_GAME_NTEX.
import os, sys, math, time
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk                                   # build.py уже подключил библиотеку и построил модель
import numpy as np

CFG = dict(scene='MGM52', env='LNC', base='msl_lance', prefixes=('LNC_',), body='LNC_body', tag='LNC')
OUT = os.environ.get(CFG['env'] + '_OUT')
if not OUT: raise SystemExit(f"Задай {CFG['env']}_OUT=<папка модели>")
SIZE = int(os.environ.get(CFG['env'] + '_TEX', '2048'))
NSIZE = int(os.environ.get(CFG['env'] + '_NTEX', str(SIZE)))
GAME_TEX, GAME_NTEX = int(os.environ.get(CFG['env'] + '_GAME_TEX', '512')), int(os.environ.get(CFG['env'] + '_GAME_NTEX', '512'))
T0 = time.time()
sc = bpy.data.scenes[CFG['scene']]
if bpy.context.window: bpy.context.window.scene = sc
vl = bpy.context.view_layer
vl.update()
all_objs = [o for o in sc.objects if o.type == 'MESH']
FLAT_OBJS = ('LNC_hw',)                                                       # мелкая фурнитура: без развёртки и без места в атласе
FLAT_RGB = {'LNC_body': (0.060, 0.074, 0.034), 'LNC_nose': (0.140, 0.130, 0.062), 'LNC_dark': (0.036, 0.033, 0.030), 'LNC_steel': (0.140, 0.140, 0.130)}
flat_mats = {}
for m_ in [m for m in bpy.data.materials if m.name in FLAT_RGB]:
    mf_ = m_.copy(); mf_.name = m_.name + 'F'; flat_mats[m_.name] = mf_
    next(n for n in mf_.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (*FLAT_RGB[m_.name], 1.0)
for o in all_objs:
    if o.name in FLAT_OBJS:
        for sl in o.material_slots:
            if sl.material is not None and sl.material.name in flat_mats: sl.material = flat_mats[sl.material.name]
        while len(o.data.uv_layers) > 0: o.data.uv_layers.remove(o.data.uv_layers[0])
objs = [o for o in all_objs if o.name not in FLAT_OBJS]
body = next(o for o in objs if o.name == CFG['body'])
_ys = [v.co.y for v in body.data.vertices]
L = max(_ys) - min(_ys); HALF = L / 2.0                 # длина ракеты, м (те же числа, что в build.py: L = 6,17, R = 0,2745, оживало 2,03 м)
R, LO = 0.310, 2.03
NSEG = 48


def ogive_r(d):
    rho = (R * R + LO * LO) / (2 * R)
    return math.sqrt(max(rho * rho - (LO - d) ** 2, 0.0)) + R - rho


def log(*a): print(f'[{time.time() - T0:5.1f} с]', *a, flush=True)


# 1. развёртка
def ring_uv(o, n=NSEG):
    """Тело вращения (кольца по n вершин подряд): u — дуга по радиусу кольца, v — длина профиля; торцы-крышки — плоско."""
    me = o.data; uvd = me.uv_layers.active.data; nv = len(me.vertices); nr = nv // n
    assert nr * n == nv, 'ring_uv: число вершин не кратно кольцу — remove_doubles склеил вершины'
    cx = [sum(me.vertices[i * n + j].co.x for j in range(n)) / n for i in range(nr)]
    cy = [sum(me.vertices[i * n + j].co.y for j in range(n)) / n for i in range(nr)]
    cz = [sum(me.vertices[i * n + j].co.z for j in range(n)) / n for i in range(nr)]
    rr = [sum(math.hypot(me.vertices[i * n + j].co.x - cx[i], me.vertices[i * n + j].co.z - cz[i]) for j in range(n)) / n for i in range(nr)]
    vv = [0.0]
    for i in range(1, nr): vv.append(vv[-1] + math.hypot(cy[i] - cy[i - 1], rr[i] - rr[i - 1]))
    for poly in me.polygons:
        li = list(poly.loop_indices); vis = [me.loops[i].vertex_index for i in li]; cos = [me.vertices[vi].co for vi in vis]; rings = [vi // n for vi in vis]
        if len(li) > 4 and (rings[0] == 0 or rings[0] == nr - 1) and len(set(rings)) == 1:
            r0 = rings[0]
            for i, c in zip(li, cos): uvd[i].uv = (c.x - cx[r0], c.z - cz[r0])
            continue
        ang = [math.atan2(c.x - cx[ri], c.z - cz[ri]) for c, ri in zip(cos, rings)]
        a0 = ang[0]; ang = [a if abs(a - a0) <= math.pi else a + (2 * math.pi if a0 - a > 0 else -2 * math.pi) for a in ang]
        for i, a, ri in zip(li, ang, rings): uvd[i].uv = (a * rr[ri], vv[ri])


for o in vl.objects: o.select_set(False)
for o in objs:
    while len(o.data.uv_layers) > 0: o.data.uv_layers.remove(o.data.uv_layers[0])
    o.data.uv_layers.new(name='UVMap')
ring_uv(body)
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
# зазор между островами 16 px (а не 8): у каждого острова своя полоса растяжки цвета в 8 px, иначе соседний остров затирает её и на шве корпуса сэмплируется чужой цвет
try: bpy.ops.uv.pack_islands(rotate=False, margin=16.0 / SIZE, margin_method='ADD')
except TypeError:
    try: bpy.ops.uv.pack_islands(rotate=False, margin=16.0 / SIZE)
    except TypeError: bpy.ops.uv.pack_islands(margin=16.0 / SIZE)
bpy.ops.object.mode_set(mode='OBJECT')
# запас по краю атласа (≈ 12 px): остров у самой границы при повторе текстуры сэмплирует пустой край — на шве корпуса получалась тёмная линия
K_UV = 1.0 - 2 * 12.0 / SIZE
for o in objs:
    for l_ in o.data.uv_layers.active.data: l_.uv = (0.5 + (l_.uv.x - 0.5) * K_UV, 0.5 + (l_.uv.y - 0.5) * K_UV)
log('развёртка готова, объектов', len(objs), '(не корпус', len(flat), ')')

# 2. картинка цвета
old = bpy.data.images.get(CFG['tag'] + '_detail')
if old is not None: bpy.data.images.remove(old)
path = os.path.join(OUT, CFG['base'] + '_detail.png')
REUSE = os.environ.get(CFG['env'] + '_REUSE') == '1' and os.path.exists(path)
if REUSE:
    img = bpy.data.images.load(path, check_existing=False); img.name = CFG['tag'] + '_detail'; img.pack()
else:
    img = bpy.data.images.new(CFG['tag'] + '_detail', SIZE, SIZE, alpha=False)
    img.generated_color = (1, 1, 1, 1)
mats = [m for m in bpy.data.materials if m.name in FLAT_RGB and m.users > 0]

# листы трафаретов (lnc_sheet.py): маски R — чёрная краска, G — линии, B — жёлто-песочные заплатки, A — белая краска; единицы листа — сантиметры вдоль оси и по высоте
SHEET_BOX = (-330.0, 330.0, -34.0, 34.0)                # x0, x1, y0, y1 листа (см)
SMS = 0.01                                              # метров на единицу листа
SHEETS = {}
for side in 'LR':
    p_ = os.path.join(OUT, '_текстуры', f'lnc_decals_{side}.png')
    if not os.path.exists(p_): raise SystemExit(f'нет листа {p_}: запусти lnc_sheet.py')
    im_ = bpy.data.images.get(f'LNC_decals_{side}')
    if im_ is not None: bpy.data.images.remove(im_)
    im_ = bpy.data.images.load(p_, check_existing=False); im_.name = f'LNC_decals_{side}'
    im_.colorspace_settings.name = 'Non-Color'; im_.alpha_mode = 'CHANNEL_PACKED'
    SHEETS[side] = im_

SEAM_X = (2.17, 4.87)                                   # кольцевые швы-линии краски (от хвоста, м): 2,17 — по картинке 4; 4,87 — стык головной части (картинка 1)
SCREW_X, SCREW_N = 4.87, 24                             # винты по стыку головной части
FIN_BARS = (0.262, 0.291)                               # две белые метки на конце каждого крыла: расстояние от торца хвоста, м
FIN_AZ_AXES = ('X', 'Z')


def detail_nodes(nb, tc, sep):
    """Маски деталей по координатам модели: black, groove, tan, white (листы), seam (линии швов), fin (метки на крыльях), dome и halo (винты)."""
    X, Yc, Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    nsep = nb.N('ShaderNodeSeparateXYZ'); nb.links.new(tc.outputs['Normal'], nsep.inputs['Vector'])
    Nx = nsep.outputs['X']
    sideL = nb.mr(nb.math('MULTIPLY', Nx, -1.0), 0.62, 0.86); sideR = nb.mr(Nx, 0.62, 0.86)
    x0, x1, y0, y1 = SHEET_BOX; Wd, Hd = x1 - x0, y1 - y0
    ch = {k: None for k in ('black', 'groove', 'tan', 'white')}
    for side, sg, sm in (('L', -1.0, sideL), ('R', 1.0, sideR)):
        cmb = nb.N('ShaderNodeCombineXYZ'); nb.links.new(nb.math('MULTIPLY', Yc, sg), cmb.inputs['X']); nb.links.new(Z, cmb.inputs['Y'])
        mp = nb.N('ShaderNodeMapping'); mp.vector_type = 'POINT'
        mp.inputs['Scale'].default_value = (1.0 / (SMS * Wd), 1.0 / (SMS * Hd), 1.0)
        mp.inputs['Location'].default_value = ((0.0 - x0) / Wd, 1.0 - (0.0 - y0) / Hd, 0.0)
        nb.links.new(cmb.outputs['Vector'], mp.inputs['Vector'])
        tx = nb.N('ShaderNodeTexImage'); tx.image = SHEETS[side]; tx.extension = 'CLIP'; tx.interpolation = 'Linear'; nb.links.new(mp.outputs['Vector'], tx.inputs['Vector'])
        sp = nb.N('ShaderNodeSeparateColor'); nb.links.new(tx.outputs['Color'], sp.inputs['Color'])
        for k, src in (('black', sp.outputs['Red']), ('groove', sp.outputs['Green']), ('tan', sp.outputs['Blue']), ('white', tx.outputs['Alpha'])):
            v = nb.math('MULTIPLY', src, sm)
            ch[k] = v if ch[k] is None else nb.math('ADD', ch[k], v)
    a = nb.math('ADD', Yc, HALF)                                                                # расстояние от торца хвоста, м
    absf = lambda v: nb.math('ABSOLUTE', v)
    # линии швов краски: тонкие кольцевые полосы
    seam = None
    for xs in SEAM_X:
        m_ = nb.mr(absf(nb.math('SUBTRACT', a, xs)), 0.0042, 0.0016)
        seam = m_ if seam is None else nb.math('MAXIMUM', seam, m_)
    # белые метки на концах крыльев: две полоски поперёк хорды, 12 мм × 6 см, на всех четырёх крыльях (крыло — тонкая пластина в плоскости X = 0 или Z = 0)
    zfin = nb.mr(absf(X), 0.030, 0.022); xfin = nb.mr(absf(Z), 0.030, 0.022)
    rz = nb.math('MULTIPLY', zfin, absf(Z)); rx = nb.math('MULTIPLY', xfin, absf(X)); rad = nb.math('MAXIMUM', rz, rx)
    rmask = nb.math('MULTIPLY', nb.mr(rad, 0.400, 0.410), nb.mr(rad, 0.470, 0.460))
    fin = None
    for xb in FIN_BARS:
        m_ = nb.math('MULTIPLY', nb.mr(absf(nb.math('SUBTRACT', a, xb)), 0.0075, 0.0055), rmask)
        fin = m_ if fin is None else nb.math('MAXIMUM', fin, m_)
    # винты: кольцо из SCREW_N штук на стыке головной части (расстояние по дуге до ближайшего и вдоль оси)
    def hyp(u, v): return nb.math('SQRT', nb.math('ADD', nb.math('MULTIPLY', u, u), nb.math('MULTIPLY', v, v)))
    per = 2 * math.pi / SCREW_N; rsc = ogive_r(L - SCREW_X)
    phi = nb.math('ARCTAN2', Z, X)
    t = nb.math('DIVIDE', phi, per)
    fr = nb.math('SUBTRACT', t, nb.math('ROUND', t))
    arc = nb.math('MULTIPLY', absf(fr), per * rsc)
    d = hyp(nb.math('SUBTRACT', a, SCREW_X), arc)
    dome = nb.mr(d, 0.0050, 0.0024); halo = nb.mr(d, 0.0080, 0.0050)
    out = {k: nb.math('MINIMUM', v, 1.0) for k, v in ch.items()}
    out.update(seam=seam, fin=fin, dome=dome, halo=halo)
    return out


class NB:
    """Тонкая обёртка над деревом узлов материала: короткие вызовы для Math, Map Range, Mix, Noise."""
    def __init__(self, nt): self.nodes, self.links = nt.nodes, nt.links
    def N(self, t): return self.nodes.new(t)
    def math(self, op, a=None, b=None, c=None, clamp=False):
        n = self.N('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate((a, b, c)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: self.links.new(v, n.inputs[i])
        return n.outputs['Value']
    def mr(self, src, f0, f1, t0=0.0, t1=1.0, clamp=True):
        n = self.N('ShaderNodeMapRange'); n.clamp = clamp
        n.inputs['From Min'].default_value = f0; n.inputs['From Max'].default_value = f1; n.inputs['To Min'].default_value = t0; n.inputs['To Max'].default_value = t1
        self.links.new(src, n.inputs['Value']); return n.outputs['Result']
    def rgb(self, c):
        n = self.N('ShaderNodeRGB'); n.outputs[0].default_value = (*c[:3], 1.0); return n.outputs[0]
    def mix(self, a, b, fac, blend='MIX'):
        n = self.N('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = blend
        ins = [x for x in n.inputs if x.type == 'RGBA']; res = [x for x in n.outputs if x.type == 'RGBA'][0]
        self.links.new(a, ins[0]); self.links.new(b, ins[1])
        if isinstance(fac, (int, float)): n.inputs[0].default_value = fac
        else: self.links.new(fac, n.inputs[0])
        return res
    def gray(self, v):
        n = self.N('ShaderNodeCombineColor')
        for i in range(3):
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: self.links.new(v, n.inputs[i])
        return n.outputs['Color']
    def noise(self, tc, scale, detail, rough, lo=0.0, hi=1.0, vec=None):
        n = self.N('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        self.links.new(vec if vec is not None else tc.outputs['Object'], n.inputs['Vector']); return self.mr(n.outputs['Fac'], lo, hi, 0.0, 1.0)


def build_pattern(mat):
    nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for n in list(nodes):
        if n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): nodes.remove(n)
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL'); prin = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    col = tuple(prin.inputs['Base Color'].default_value)
    for l in list(prin.inputs['Base Color'].links): links.remove(l)
    nb = NB(nt); kind = mat.name
    soil_k = {'LNC_body': 1.0, 'LNC_nose': 0.85, 'LNC_steel': 0.7, 'LNC_dark': 0.5}.get(kind, 1.0)
    painted = kind in ('LNC_body', 'LNC_nose')
    tc = nb.N('ShaderNodeTexCoord')
    sep = nb.N('ShaderNodeSeparateXYZ'); links.new(tc.outputs['Object'], sep.inputs['Vector'])
    geo = nb.N('ShaderNodeNewGeometry'); gsep = nb.N('ShaderNodeSeparateXYZ'); links.new(geo.outputs['Normal'], gsep.inputs['Vector'])
    ao0 = nb.N('ShaderNodeAmbientOcclusion'); ao0.samples = 16; ao0.inputs['Distance'].default_value = 0.004
    ao1 = nb.N('ShaderNodeAmbientOcclusion'); ao1.samples = 24; ao1.inputs['Distance'].default_value = 0.014
    ao2 = nb.N('ShaderNodeAmbientOcclusion'); ao2.samples = 12; ao2.inputs['Distance'].default_value = 0.07
    ao3 = nb.N('ShaderNodeAmbientOcclusion'); ao3.samples = 12; ao3.inputs['Distance'].default_value = 0.30
    a0 = nb.mr(ao0.outputs['AO'], 0, 1, 0.45, 1.0); a1 = nb.mr(ao1.outputs['AO'], 0, 1, 0.45, 1.0); a2 = nb.mr(ao2.outputs['AO'], 0, 1, 0.70, 1.0); a3 = nb.mr(ao3.outputs['AO'], 0, 1, 0.78, 1.0)
    mp = nb.N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (7.0, 0.55, 7.0); links.new(tc.outputs['Object'], mp.inputs['Vector'])      # потёки вдоль оси (Y) — вдоль потока
    streak = nb.noise(tc, 1.0, 3.0, 0.60, 0.46, 0.62, vec=mp.outputs['Vector'])
    mp2 = nb.N('ShaderNodeMapping'); mp2.inputs['Scale'].default_value = (30.0, 1.2, 30.0); links.new(tc.outputs['Object'], mp2.inputs['Vector'])
    streak_f = nb.noise(tc, 1.0, 2.0, 0.55, 0.45, 0.62, vec=mp2.outputs['Vector'])                                  # тонкие продольные следы
    patchy = nb.noise(tc, 3.0, 4.0, 0.55, 0.35, 0.68); patchy2 = nb.noise(tc, 9.0, 5.0, 0.60, 0.38, 0.66)
    fade = nb.noise(tc, 0.9, 3.0, 0.5, 0.30, 0.70)
    gm = nb.N('ShaderNodeMapping'); gm.inputs['Scale'].default_value = (330.0, 330.0, 330.0); links.new(tc.outputs['Object'], gm.inputs['Vector'])
    wn = nb.N('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; links.new(gm.outputs['Vector'], wn.inputs['Vector'])
    grain = nb.math('ADD', 1.0, nb.math('MULTIPLY', nb.math('SUBTRACT', wn.outputs['Value'], 0.5), 0.10))
    bev = nb.N('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.0035; bev.samples = 6
    dot = nb.N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; links.new(bev.outputs['Normal'], dot.inputs[0]); links.new(geo.outputs['Normal'], dot.inputs[1])
    edge = nb.mr(dot.outputs['Value'], 1.0, 0.92, 0.0, 1.0)
    bev2 = nb.N('ShaderNodeBevel'); bev2.inputs['Radius'].default_value = 0.014; bev2.samples = 6
    dot2 = nb.N('ShaderNodeVectorMath'); dot2.operation = 'DOT_PRODUCT'; links.new(bev2.outputs['Normal'], dot2.inputs[0]); links.new(geo.outputs['Normal'], dot2.inputs[1])
    zone = nb.mr(dot2.outputs['Value'], 1.0, 0.88, 0.0, 1.0)
    chip = nb.math('MULTIPLY', zone, nb.noise(tc, 34.0, 6.0, 0.7, 0.48, 0.535))
    speck_l = nb.noise(tc, 130.0, 3.0, 0.5, 0.62, 0.655); speck_d = nb.noise(tc, 90.0, 3.0, 0.5, 0.63, 0.66)
    scuff = nb.math('MULTIPLY', nb.noise(tc, 6.0, 8.0, 0.62, 0.56, 0.72), nb.math('ADD', 0.35, nb.math('MULTIPLY', streak, 0.65)))
    vor = nb.N('ShaderNodeTexVoronoi'); vor.voronoi_dimensions = '3D'; vor.feature = 'DISTANCE_TO_EDGE'; vor.inputs['Scale'].default_value = 9.0; links.new(tc.outputs['Object'], vor.inputs['Vector'])
    scratch = nb.math('MULTIPLY', nb.mr(vor.outputs['Distance'], 0.0, 0.04, 1.0, 0.0), nb.noise(tc, 24.0, 3.0, 0.5, 0.50, 0.66))
    top = nb.mr(gsep.outputs['Z'], 0.30, 0.92); down = nb.mr(gsep.outputs['Z'], 0.10, -0.75)
    soot = nb.mr(sep.outputs['Y'], 1.1 - HALF, -HALF, 0.0, 1.0)                                       # у сопла — копоть от газов
    rustmix = nb.noise(tc, 5.0, 4.0, 0.6, 0.44, 0.58)
    gate = nb.math('ADD', 0.35, nb.math('MULTIPLY', a1, 0.65))
    METAL = {'LNC_body': (0.14, 0.135, 0.12), 'LNC_nose': (0.22, 0.20, 0.12)}.get(kind, (0.30, 0.30, 0.31))
    GRIME, SOOT, SAND, MUD, RUST, DARKLINE, TAN, WHITE = (0.045, 0.042, 0.030), (0.016, 0.014, 0.012), (0.20, 0.17, 0.10), (0.080, 0.062, 0.040), (0.16, 0.070, 0.035), (0.022, 0.025, 0.012), (0.40, 0.29, 0.085), (0.50, 0.50, 0.47)
    c = nb.rgb(col)
    c = nb.mix(c, nb.gray(nb.math('ADD', 0.70, nb.math('MULTIPLY', fade, 0.55))), 1.0, 'MULTIPLY')                       # крупные «выцветшие» зоны и тёмные разводы
    ysec = nb.math('ADD', sep.outputs['Y'], HALF)                                                                           # секции между швами чуть различаются по тону (разные партии краски)
    tone = 1.0
    sec = nb.math('MULTIPLY', nb.math('GREATER_THAN', ysec, 2.17), 0.06)
    for ys_, kk in ((3.33, -0.14), (3.64, 0.10), (4.87, -0.08)):
        sec = nb.math('ADD', sec, nb.math('MULTIPLY', nb.math('GREATER_THAN', ysec, ys_), kk))
    c = nb.mix(c, nb.gray(nb.math('ADD', 1.0, sec)), 1.0, 'MULTIPLY')
    light = nb.mix(nb.rgb(col), nb.gray(1.45), 1.0, 'MULTIPLY')
    c = nb.mix(c, light, nb.math('MULTIPLY', scuff, 0.50 if painted else 0.20))                                          # затёртая краска светлеет
    c = nb.mix(c, nb.rgb(SAND), nb.math('MULTIPLY', nb.math('MULTIPLY', top, nb.math('ADD', 0.35, nb.math('MULTIPLY', patchy, 0.65))), 0.62 * soil_k * 0.8))   # пыль на верхней стороне
    c = nb.mix(c, nb.rgb(GRIME), nb.math('MULTIPLY', nb.math('MULTIPLY', streak, nb.math('ADD', 0.30, nb.math('MULTIPLY', patchy2, 0.70))), 0.55 * soil_k))      # потёки вдоль потока
    c = nb.mix(c, nb.rgb(GRIME), nb.math('MULTIPLY', streak_f, 0.05 * soil_k))
    c = nb.mix(c, nb.rgb(MUD), nb.math('MULTIPLY', nb.math('MULTIPLY', down, nb.math('ADD', 0.4, nb.math('MULTIPLY', patchy, 0.6))), 0.42 * soil_k))            # грязь снизу
    c = nb.mix(c, nb.rgb(METAL), nb.math('MULTIPLY', speck_l, 0.52 if painted else 0.22))                                  # отслоившаяся краска — светлые крапинки
    c = nb.mix(c, nb.gray(nb.math('SUBTRACT', 1.0, nb.math('MULTIPLY', speck_d, 0.40))), 1.0, 'MULTIPLY')                  # грязь — тёмные крапинки
    wear = nb.math('ADD', nb.math('ADD', nb.math('MULTIPLY', edge, 0.9), chip), nb.math('MULTIPLY', scratch, 0.22), clamp=True)
    wear = nb.math('MULTIPLY', wear, nb.math('SUBTRACT', 1.0, nb.math('MULTIPLY', down, 0.5)))
    c = nb.mix(c, nb.mix(nb.rgb(METAL), nb.rgb(RUST), rustmix), nb.math('MULTIPLY', wear, 0.72 if painted else 0.35))       # на сколах — грунт, металл и ржавчина
    c = nb.mix(c, nb.rgb(SOOT), nb.math('MULTIPLY', nb.math('MULTIPLY', soot, soot), 0.78 if kind != 'LNC_dark' else 0.35))
    if kind in ('LNC_body', 'LNC_nose'):                    # трафареты, заплатки, линии швов, метки на крыльях и винты — только на краске
        d = detail_nodes(nb, tc, sep)
        c = nb.mix(c, nb.rgb(DARKLINE), nb.math('MULTIPLY', d['seam'], 0.70))
        c = nb.mix(c, nb.rgb(TAN), nb.math('MULTIPLY', d['tan'], 0.90))
        wscuff = nb.math('SUBTRACT', 1.0, nb.math('MULTIPLY', nb.math('MULTIPLY', scuff, speck_l), 0.5))
        c = nb.mix(c, nb.rgb(WHITE), nb.math('MULTIPLY', nb.math('MULTIPLY', d['white'], wscuff), 0.86))                      # трафарет затёрт
        c = nb.mix(c, nb.rgb(WHITE), nb.math('MULTIPLY', d['fin'], 0.88))
        c = nb.mix(c, nb.gray(nb.math('SUBTRACT', 1.0, nb.math('MULTIPLY', nb.math('MULTIPLY', d['halo'], nb.math('SUBTRACT', 1.0, d['dome'])), 0.50))), 1.0, 'MULTIPLY')
        c = nb.mix(c, nb.gray(nb.math('ADD', 1.0, nb.math('MULTIPLY', d['dome'], 0.14))), 1.0, 'MULTIPLY')
    c = nb.mix(c, nb.rgb((0.020, 0.017, 0.013)), nb.math('MULTIPLY', nb.math('SUBTRACT', 1.0, a0), 0.65), )                  # копоть и смазка в щелях
    c = nb.mix(c, nb.gray(nb.math('MULTIPLY', nb.math('MULTIPLY', a1, a2), a3)), 1.0, 'MULTIPLY')
    c = nb.mix(c, nb.gray(grain), 1.0, 'MULTIPLY')
    emi = nb.N('ShaderNodeEmission'); links.new(c, emi.inputs['Color'])
    links.new(emi.outputs['Emission'], out.inputs['Surface'])
    tex = nb.N('ShaderNodeTexImage'); tex.image = img
    for n in nodes: n.select = False
    tex.select = True; nodes.active = tex
    return out, prin, tex, col


rig = {m.name: build_pattern(m) for m in mats}
log('шейдеры запекания готовы')

# 3. запекание цвета
sys.path.insert(0, '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/_инструменты')
import gpu_setup                                    # Cycles на видеокарте (Metal), если есть; иначе процессор
log('Cycles:', gpu_setup.use_gpu(sc)); sc.cycles.samples = 24
try: sc.cycles.use_denoising = False
except Exception: pass
for o in vl.objects: o.select_set(False)
for o in objs: o.select_set(True)
vl.objects.active = objs[0]
if not REUSE:
    bpy.ops.object.bake(type='EMIT', width=SIZE, height=SIZE, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
    log('запекание цвета готово')
    img.filepath_raw = path; img.file_format = 'PNG'; img.save(); img.pack()
else: log('цвет взят из прошлого запуска')
log('цвет сохранён', path)


def seam_check(image, thr=0.12, steps=17):
    W_, H_ = image.size
    px = np.array(image.pixels[:], dtype=np.float32).reshape(H_, W_, 4)[..., :3].mean(axis=2)
    def samp(u, v):
        x, y = u * W_ - 0.5, v * H_ - 0.5; x0, y0 = int(math.floor(x)), int(math.floor(y)); fx, fy = x - x0, y - y0
        g = lambda xx, yy: px[min(max(yy, 0), H_ - 1), min(max(xx, 0), W_ - 1)]
        return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy
    worst, bad, n_edges = 0.0, [], 0
    for o in objs:
        me = o.data; uvl = me.uv_layers.active.data; by_edge = {}
        for p_ in me.polygons:
            for li in p_.loop_indices: by_edge.setdefault(me.loops[li].edge_index, []).append(p_)
        for ei, pl in by_edge.items():
            if len(pl) != 2: continue
            e = me.edges[ei]; va, vb = e.vertices
            def uv_of(p_, vi):
                for k in p_.loop_indices:
                    if me.loops[k].vertex_index == vi: return uvl[k].uv
            A0, A1, B0, B1 = uv_of(pl[0], va), uv_of(pl[0], vb), uv_of(pl[1], va), uv_of(pl[1], vb)
            if (A0 - B0).length < 1e-4 and (A1 - B1).length < 1e-4: continue
            if (A1 - A0).length * W_ < 12: continue
            n_edges += 1; dmax = 0.0
            for t in np.linspace(0, 1, steps):
                sa = samp(A0.x + (A1.x - A0.x) * t, A0.y + (A1.y - A0.y) * t); sb = samp(B0.x + (B1.x - B0.x) * t, B0.y + (B1.y - B0.y) * t)
                dmax = max(dmax, abs(float(sa) - float(sb)))
            worst = max(worst, dmax)
            if dmax > thr: bad.append((o.name, ei, round(dmax, 2)))
    return n_edges, worst, bad


nse, worst, bad = seam_check(img)
by_obj = {}
for n_, ei_, d_ in bad: by_obj.setdefault(n_, []).append(d_)
log(f'швы развёртки (длиннее 12 px): рёбер {nse}, наибольшая разница {worst:.2f}, плохих (>0.12) {len(bad)}; по деталям:', {k: (len(v), max(v)) for k, v in by_obj.items()})


# 4. карта нормалей
def build_relief(mat, entry):
    out, prin, tex, col = entry; nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for l in list(out.inputs['Surface'].links): links.remove(l)
    links.new(prin.outputs['BSDF'], out.inputs['Surface'])
    nb = NB(nt)
    k_fine, bev_r = {'LNC_body': (0.30, 0.0035), 'LNC_nose': (0.22, 0.0035), 'LNC_steel': (0.40, 0.0025), 'LNC_dark': (0.42, 0.0025)}.get(mat.name, (0.3, 0.002))
    tc = nodes.new('ShaderNodeTexCoord'); sep = nodes.new('ShaderNodeSeparateXYZ'); links.new(tc.outputs['Object'], sep.inputs['Vector'])
    bev = nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = bev_r; bev.samples = 10
    def nz(scale, detail, rough):
        n = nodes.new('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(tc.outputs['Object'], n.inputs['Vector']); return n.outputs['Fac']
    mul = lambda a, k: nb.math('MULTIPLY', a, k)
    add = lambda a, b: nb.math('ADD', a, b)
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.002; bump.inputs['Strength'].default_value = 1.0
    h = add(mul(nz(120.0, 3.0, 0.55), 0.55 * k_fine), mul(nz(8.0, 2.0, 0.5), 0.45 * k_fine))
    h = add(h, mul(nz(2.3, 2.0, 0.5), 0.30 * k_fine))                                                    # широкая «консервная» волна листа
    if mat.name in ('LNC_body', 'LNC_nose'):
        d = detail_nodes(nb, tc, sep)
        h = add(h, mul(d['dome'], 2.2)); h = add(h, mul(d['seam'], -0.6))
    links.new(h, bump.inputs['Height'])
    links.new(bev.outputs['Normal'], bump.inputs['Normal'])
    links.new(bump.outputs['Normal'], prin.inputs['Normal'])


nimg = bpy.data.images.get(CFG['tag'] + '_normal')
if nimg is not None: bpy.data.images.remove(nimg)
nimg = bpy.data.images.new(CFG['tag'] + '_normal', NSIZE, NSIZE, alpha=False)
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
npath = os.path.join(OUT, CFG['base'] + '_normal.png')
nimg.filepath_raw = npath; nimg.file_format = 'PNG'; nimg.save()
nimg.pack()

# 5. материалы: Base Color = текстура цвета, Normal = карта нормалей; служебные узлы убрать
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
for k in 'LR':
    im_ = bpy.data.images.get(f'LNC_decals_{k}')
    if im_ is not None: bpy.data.images.remove(im_)                 # листы уже в цвете и нормалях
log('картинки', path, npath, 'материалы подключены:', [m.name for m in mats])


def lite(image, name, fmt, fname, px):
    c = image.copy(); c.name = name; c.scale(px, px); c.file_format = fmt
    p_ = os.path.join(OUT, fname)
    try: c.save(filepath=p_, quality=92)
    except TypeError:
        c.filepath_raw = p_; c.save()
    bpy.data.images.remove(c)
    return p_


lite(img, f"{CFG['tag']}_detail_{GAME_TEX}", 'JPEG', f"{CFG['base']}_detail_{GAME_TEX}.jpg", GAME_TEX); lite(nimg, f"{CFG['tag']}_normal_{GAME_NTEX}", 'PNG', f"{CFG['base']}_normal_{GAME_NTEX}.png", GAME_NTEX)
log('облегчённые копии', GAME_TEX, '/', GAME_NTEX, 'готовы')
