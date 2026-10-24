# bake.py — запекает две текстуры контейнера AN/ALQ-131(V): цвет (alq131_detail.png: светлая серо-белая краска со сколами и потёками, тёмный носовой обтекатель, затенение щелей, трафареты «USAF AN/ALQ-131(V)-12» и «DO NOT PAINT»,
# красные ромбы WARNING, линии панелей и люков, заклёпки) и карту нормалей (alq131_normal.png: скруглённые кромки, зерно краски, канавки панелей, купола заклёпок).
# Нужен Cycles (на видеокарте — gpu_setup). Запускается ПОСЛЕ build.py в той же сессии (фоновый Blender или живой через exec):
#   ALQ_OUT="<папка модели>" [ALQ_TEX=2048] Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Листы трафаретов и линий (_текстуры/alq_decals_L.png, _R.png) рисует alq_sheet.py (/usr/bin/python3 -I alq_sheet.py "<папка модели>"); здесь они проецируются с бортов шейдером по координатам модели
# (L — левый борт −X, нос слева; R — правый борт +X, нос справа; зеркальная раскладка, буквы не зеркальные), независимо от развёртки. Заклёпки — шейдером: ряды (периодические) и точки по расстоянию до ближайшей.
# Развёртка: корпус — одной полосой (hull_uv: u — обход сечения от шва внизу, v — длина профиля; сечение не круглое, поэтому по периметру, а не по углу), остальное — смарт-проекцией; упаковка без поворота, зазор 16 px.
# ALQ_REUSE=1 — цвет не запекать заново (геометрия та же), пересчитать только нормали. Для игры deliver.py берёт облегчённые ALQ_GAME_TEX / ALQ_GAME_NTEX.
import os, sys, math, time
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk                                   # build.py уже подключил библиотеку и построил модель
import alq_pod as ap
import numpy as np

CFG = dict(scene='ALQ131', env='ALQ', base='alq131', prefixes=('ALQ_',), body='ALQ_hull', tag='ALQ')
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
objs = [o for o in sc.objects if o.type == 'MESH']
body = next(o for o in objs if o.name == CFG['body'])
SM = mk.S                                               # метров на пиксель чертежа
Ym = lambda x: (ap.X0 - x) * SM                         # x чертежа → Y, м (нос +Y)
Zm = lambda y: (ap.YC - y) * SM                         # y чертежа → Z, м (верх +Z)


def log(*a): print(f'[{time.time() - T0:5.1f} с]', *a, flush=True)


# 1. развёртка
def hull_uv(o, n=ap.NS):
    me = o.data; uvd = me.uv_layers.active.data; nv = len(me.vertices); nr = nv // n
    co = [[me.vertices[i * n + j].co.copy() for j in range(n)] for i in range(nr)]
    cum, per, cen = [], [], []
    for r in co:
        c = [0.0]
        for j in range(1, n + 1): c.append(c[-1] + (r[j % n] - r[j - 1]).length)
        cum.append(c); per.append(c[-1]); cen.append(sum(r, Vector()) / n)
    rr = [p / (2 * math.pi) for p in per]
    vv = [0.0]
    for i in range(1, nr): vv.append(vv[-1] + math.hypot((cen[i] - cen[i - 1]).length, rr[i] - rr[i - 1]))
    pmax = max(per); off = [pmax / 2 - cum[i][n // 2] for i in range(nr)]     # кольца выровнены по верху (точка n/2), шов — по краям полосы (снизу)
    for poly in me.polygons:
        li = list(poly.loop_indices); vis = [me.loops[i].vertex_index for i in li]; rings = [vi // n for vi in vis]; js = [vi % n for vi in vis]
        if len(li) > 4 and len(set(rings)) == 1 and (rings[0] == 0 or rings[0] == nr - 1):         # крышки торцов — плоско
            for i, vi in zip(li, vis): c = me.vertices[vi].co; uvd[i].uv = (c.x, c.z)
            continue
        wrap = (n - 1) in js and 0 in js
        for i, ri, j in zip(li, rings, js):
            jj = n if (wrap and j == 0) else j
            uvd[i].uv = (cum[ri][jj] + off[ri], vv[ri])


for o in vl.objects: o.select_set(False)
for o in objs:
    while len(o.data.uv_layers) > 0: o.data.uv_layers.remove(o.data.uv_layers[0])
    o.data.uv_layers.new(name='UVMap')
hull_uv(body)
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
log('развёртка готова, объектов', len(objs), '(плоских', len(flat), ')')

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
mats = [m for m in bpy.data.materials if m.name.startswith(CFG['prefixes']) and m.users > 0]

# листы трафаретов и линий (alq_sheet.py): маски R — чёрная краска, G — канавки, B — красная, A — белая
SHEET_BOX = (140.0, 1880.0, 360.0, 800.0)               # x0, x1, y0, y1 чертежа, покрытые листом
SHEETS = {}
for side in 'LR':
    p_ = os.path.join(OUT, '_текстуры', f'alq_decals_{side}.png')
    if not os.path.exists(p_): raise SystemExit(f'нет листа {p_}: запусти alq_sheet.py')
    im_ = bpy.data.images.get(f'ALQ_decals_{side}')
    if im_ is not None: bpy.data.images.remove(im_)
    im_ = bpy.data.images.load(p_, check_existing=False); im_.name = f'ALQ_decals_{side}'
    im_.colorspace_settings.name = 'Non-Color'; im_.alpha_mode = 'CHANNEL_PACKED'
    SHEETS[side] = im_

# положения заклёпок (пиксели чертежа 1, снято по сеткам _измерения/сетка_*.png)
PITCH = 58.7
ROWS = [  # (x первой, x последней, шаг, y ряда): верхний и нижний ряды на панелях (на нижней шине заглушки вместо заклёпок на x = 1080 и 1450)
    (610.4, 1197.4, PITCH, 457.0), (1332.4, 1567.2, PITCH, 457.0),
    (610.4, 1021.3, PITCH, 625.5), (1138.7, 1197.4, PITCH, 625.5), (1332.4, 1391.1, PITCH, 625.5), (1508.0, 1567.2, PITCH, 625.5)]
POINTS = [(559, 487), (559, 542), (559, 596),                                                 # левый торец левой панели
          (1248, 488), (1263.5, 488), (1248, 542.5), (1263.5, 542.5), (1248, 596), (1263.5, 596.5),   # пары у поперечного шва
          (1636.5, 486.5), (1636.5, 541.5), (1636.5, 595.5),                                  # правый торец правой панели
          (492, 496), (454, 510), (530, 508), (457, 550), (531, 548), (531, 587), (493, 598),  # передний люк
          (1655, 490.5), (1695, 490.5), (1655, 542.5), (1721, 542.5), (1685, 600.5),          # задний люк
          (1008, 733), (1037.7, 731.7), (1094, 731.7), (1124.5, 733), (1019.5, 758.7), (1112.5, 758.7), (1008, 773.7), (1124.5, 773.7)]   # брюшной обтекатель
RINGS = [(310.0, 78.5, 514.5, 11, 0.0), (401.0, 78.5, 514.5, 11, 0.0), (1788.0, 78.0, 542.0, 11, -7.0)]   # (x кольца, радиус, y оси, винтов по кругу, фаза °): носовое кольцо ×2 ряда, гондола
TOP_X, TOP_ROW = 88.0, (530.0, 1620.0, 44.0)              # ряды на верху: боковой отступ от оси (пикс.), x от…до, шаг


def detail_nodes(nb, tc, sep):
    """Маски деталей по координатам модели: black, groove, red, white (трафареты и линии с листов) и dome, halo (заклёпки)."""
    X, Yc, Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    nsep = nb.N('ShaderNodeSeparateXYZ'); nb.links.new(tc.outputs['Normal'], nsep.inputs['Vector'])
    Nx, Nz = nsep.outputs['X'], nsep.outputs['Z']
    sideL = nb.mr(nb.math('MULTIPLY', Nx, -1.0), 0.62, 0.86); sideR = nb.mr(Nx, 0.62, 0.86)
    sideA = nb.mr(nb.math('ABSOLUTE', Nx), 0.62, 0.86); topN = nb.mr(Nz, 0.55, 0.85)
    x0, x1, y0, y1 = SHEET_BOX; Wd, Hd = x1 - x0, y1 - y0
    ch = {k: None for k in ('black', 'groove', 'red', 'white')}
    for side, sg, sm in (('L', -1.0, sideL), ('R', 1.0, sideR)):
        cmb = nb.N('ShaderNodeCombineXYZ'); nb.links.new(nb.math('MULTIPLY', Yc, sg), cmb.inputs['X']); nb.links.new(Z, cmb.inputs['Y'])
        mp = nb.N('ShaderNodeMapping'); mp.vector_type = 'POINT'
        mp.inputs['Scale'].default_value = (1.0 / (SM * Wd), 1.0 / (SM * Hd), 1.0)
        mp.inputs['Location'].default_value = ((ap.X0 - x0) / Wd, 1.0 - (ap.YC - y0) / Hd, 0.0)
        nb.links.new(cmb.outputs['Vector'], mp.inputs['Vector'])
        tx = nb.N('ShaderNodeTexImage'); tx.image = SHEETS[side]; tx.extension = 'CLIP'; tx.interpolation = 'Linear'; nb.links.new(mp.outputs['Vector'], tx.inputs['Vector'])
        sp = nb.N('ShaderNodeSeparateColor'); nb.links.new(tx.outputs['Color'], sp.inputs['Color'])
        for k, src in (('black', sp.outputs['Red']), ('groove', sp.outputs['Green']), ('red', sp.outputs['Blue']), ('white', tx.outputs['Alpha'])):
            v = nb.math('MULTIPLY', src, sm)
            ch[k] = v if ch[k] is None else nb.math('ADD', ch[k], v)
    # заклёпки: ряды (периодические), точки, кольца винтов, ряды на верху
    a = nb.math('MULTIPLY', Yc, -1.0)                                                          # вдоль оси к хвосту, м
    P2 = nb.N('ShaderNodeCombineXYZ'); P2.inputs['X'].default_value = 0.0; nb.links.new(Yc, P2.inputs['Y']); nb.links.new(Z, P2.inputs['Z'])
    ds = None
    def take(d):
        nonlocal ds
        ds = d if ds is None else nb.math('MINIMUM', ds, d)
    def hyp(u, v): return nb.math('SQRT', nb.math('ADD', nb.math('MULTIPLY', u, u), nb.math('MULTIPLY', v, v)))
    for xs, xe, pitch, yrow in ROWS:
        n = int(round((xe - xs) / pitch))
        t = nb.math('DIVIDE', nb.math('SUBTRACT', a, (xs - ap.X0) * SM), pitch * SM)
        k = nb.math('MINIMUM', nb.math('MAXIMUM', nb.math('ROUND', t), 0.0), float(n))
        take(hyp(nb.math('MULTIPLY', nb.math('SUBTRACT', t, k), pitch * SM), nb.math('SUBTRACT', Z, Zm(yrow))))
    for x, y in POINTS:
        dv = nb.N('ShaderNodeVectorMath'); dv.operation = 'DISTANCE'; nb.links.new(P2.outputs['Vector'], dv.inputs[0]); dv.inputs[1].default_value = (0.0, Ym(x), Zm(y))
        take(dv.outputs['Value'])
    dside = nb.math('ADD', ds, nb.math('MULTIPLY', nb.math('SUBTRACT', 1.0, sideA), 5.0))     # только на бортах
    # винты по кругу (носовое кольцо и гондола): расстояние по дуге до ближайшего и вдоль оси до ряда; любая ориентация нормали
    dr = None
    for xc, Rpx, cy, nn, ph in RINGS:
        per = 2 * math.pi / nn
        phi = nb.math('ARCTAN2', nb.math('SUBTRACT', Z, Zm(cy)), X)
        t = nb.math('DIVIDE', nb.math('SUBTRACT', phi, math.radians(ph)), per)
        fr = nb.math('SUBTRACT', t, nb.math('ROUND', t))
        arc = nb.math('MULTIPLY', nb.math('ABSOLUTE', fr), per * Rpx * SM)
        d_ = hyp(nb.math('SUBTRACT', Yc, Ym(xc)), arc)
        dr = d_ if dr is None else nb.math('MINIMUM', dr, d_)
    # ряды на верху: два ряда на боковом отступе TOP_X от оси
    xs, xe, pitch = TOP_ROW; n = int(round((xe - xs) / pitch))
    t = nb.math('DIVIDE', nb.math('SUBTRACT', a, (xs - ap.X0) * SM), pitch * SM)
    k = nb.math('MINIMUM', nb.math('MAXIMUM', nb.math('ROUND', t), 0.0), float(n))
    dtop = hyp(nb.math('MULTIPLY', nb.math('SUBTRACT', t, k), pitch * SM), nb.math('SUBTRACT', nb.math('ABSOLUTE', X), TOP_X * SM))
    dtop = nb.math('ADD', dtop, nb.math('MULTIPLY', nb.math('SUBTRACT', 1.0, topN), 5.0))
    d = nb.math('MINIMUM', nb.math('MINIMUM', dside, dr), dtop)
    dome = nb.mr(d, 0.0058, 0.0028); halo = nb.mr(d, 0.0090, 0.0058)
    out = {k: nb.math('MINIMUM', v, 1.0) for k, v in ch.items()}
    out.update(dome=dome, halo=halo)
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
    soil_k = {'ALQ_body': 1.0, 'ALQ_cone': 0.45, 'ALQ_metal': 0.7, 'ALQ_dark': 0.5}.get(kind, 1.0)
    painted = kind in ('ALQ_body', 'ALQ_cone')
    tc = nb.N('ShaderNodeTexCoord')
    sep = nb.N('ShaderNodeSeparateXYZ'); links.new(tc.outputs['Object'], sep.inputs['Vector'])
    geo = nb.N('ShaderNodeNewGeometry')
    ao1 = nb.N('ShaderNodeAmbientOcclusion'); ao1.samples = 24; ao1.inputs['Distance'].default_value = 0.012
    ao2 = nb.N('ShaderNodeAmbientOcclusion'); ao2.samples = 12; ao2.inputs['Distance'].default_value = 0.06
    ao3 = nb.N('ShaderNodeAmbientOcclusion'); ao3.samples = 12; ao3.inputs['Distance'].default_value = 0.25
    a1 = nb.mr(ao1.outputs['AO'], 0, 1, 0.50, 1.0); a2 = nb.mr(ao2.outputs['AO'], 0, 1, 0.72, 1.0); a3 = nb.mr(ao3.outputs['AO'], 0, 1, 0.80, 1.0)
    mp = nb.N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (24.0, 1.1, 24.0); links.new(tc.outputs['Object'], mp.inputs['Vector'])   # потёки вдоль оси (Y) — вдоль потока
    streak = nb.noise(tc, 1.0, 2.0, 0.55, 0.42, 0.66, vec=mp.outputs['Vector'])
    patchy = nb.noise(tc, 3.0, 4.0, 0.55, 0.35, 0.68)
    gm = nb.N('ShaderNodeMapping'); gm.inputs['Scale'].default_value = (330.0, 330.0, 330.0); links.new(tc.outputs['Object'], gm.inputs['Vector'])
    wn = nb.N('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; links.new(gm.outputs['Vector'], wn.inputs['Vector'])
    grain = nb.math('ADD', 1.0, nb.math('MULTIPLY', nb.math('SUBTRACT', wn.outputs['Value'], 0.5), 0.05))
    bev = nb.N('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.0025; bev.samples = 6
    dot = nb.N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; links.new(bev.outputs['Normal'], dot.inputs[0]); links.new(geo.outputs['Normal'], dot.inputs[1])
    edge = nb.mr(dot.outputs['Value'], 1.0, 0.93, 0.0, 1.0)
    bev2 = nb.N('ShaderNodeBevel'); bev2.inputs['Radius'].default_value = 0.010; bev2.samples = 6
    dot2 = nb.N('ShaderNodeVectorMath'); dot2.operation = 'DOT_PRODUCT'; links.new(bev2.outputs['Normal'], dot2.inputs[0]); links.new(geo.outputs['Normal'], dot2.inputs[1])
    zone = nb.mr(dot2.outputs['Value'], 1.0, 0.90, 0.0, 1.0)
    chip = nb.math('MULTIPLY', zone, nb.noise(tc, 30.0, 5.0, 0.6, 0.50, 0.64))
    scuff = nb.math('MULTIPLY', nb.noise(tc, 6.0, 7.0, 0.62, 0.56, 0.74), nb.math('ADD', 0.4, nb.math('MULTIPLY', streak, 0.6)))
    # покраска: светлая серо-белая (USAF); на сколах — грунт/металл; обтекатель — тёмный и ровный (потёки слабее); металл — рифлёная сталь
    METAL = {'ALQ_body': (0.20, 0.20, 0.20), 'ALQ_cone': (0.10, 0.10, 0.11)}.get(kind, (0.30, 0.30, 0.31))
    GRIME, DARKLINE, BLACK, RED, WHITE = (0.13, 0.12, 0.10), (0.10, 0.10, 0.11), (0.030, 0.031, 0.034), (0.50, 0.025, 0.020), (0.80, 0.80, 0.78)
    c = nb.rgb(col)
    light = nb.mix(nb.rgb(col), nb.gray(1.30), 1.0, 'MULTIPLY')
    c = nb.mix(c, light, nb.math('MULTIPLY', scuff, 0.22 if kind != 'ALQ_cone' else 0.12))
    c = nb.mix(c, nb.rgb(GRIME), nb.math('MULTIPLY', nb.math('MULTIPLY', streak, nb.math('ADD', 0.45, nb.math('MULTIPLY', patchy, 0.55))), 0.14 * soil_k))
    c = nb.mix(c, nb.rgb(METAL), nb.math('MULTIPLY', nb.math('ADD', nb.math('MULTIPLY', edge, 0.55), chip, clamp=True), 0.62 if painted else 0.35))
    c = nb.mix(c, nb.gray(nb.math('MULTIPLY', nb.math('MULTIPLY', a1, a2), a3)), 1.0, 'MULTIPLY')
    c = nb.mix(c, nb.gray(grain), 1.0, 'MULTIPLY')
    if kind == 'ALQ_body':                                  # трафареты, ромбы, линии панелей и заклёпки — только на краске корпуса
        d = detail_nodes(nb, tc, sep)
        c = nb.mix(c, nb.rgb(DARKLINE), nb.math('MULTIPLY', d['groove'], 0.80))
        c = nb.mix(c, nb.rgb(BLACK), nb.math('MULTIPLY', d['black'], 0.94))
        c = nb.mix(c, nb.rgb(RED), nb.math('MULTIPLY', d['red'], 0.96))
        c = nb.mix(c, nb.rgb(WHITE), nb.math('MULTIPLY', d['white'], 0.90))
        c = nb.mix(c, nb.gray(nb.math('SUBTRACT', 1.0, nb.math('MULTIPLY', nb.math('MULTIPLY', d['halo'], nb.math('SUBTRACT', 1.0, d['dome'])), 0.42))), 1.0, 'MULTIPLY')
        c = nb.mix(c, nb.gray(nb.math('ADD', 1.0, nb.math('MULTIPLY', d['dome'], 0.12))), 1.0, 'MULTIPLY')
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
    k_fine, bev_r = {'ALQ_body': (0.14, 0.0025), 'ALQ_cone': (0.08, 0.0025), 'ALQ_metal': (0.28, 0.0020), 'ALQ_dark': (0.30, 0.0020)}.get(mat.name, (0.2, 0.002))
    tc = nodes.new('ShaderNodeTexCoord'); sep = nodes.new('ShaderNodeSeparateXYZ'); links.new(tc.outputs['Object'], sep.inputs['Vector'])
    bev = nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = bev_r; bev.samples = 10
    def nz(scale, detail, rough):
        n = nodes.new('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(tc.outputs['Object'], n.inputs['Vector']); return n.outputs['Fac']
    mul = lambda a, k: nb.math('MULTIPLY', a, k)
    add = lambda a, b: nb.math('ADD', a, b)
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.002; bump.inputs['Strength'].default_value = 1.0
    h = add(mul(nz(120.0, 3.0, 0.55), 0.55 * k_fine), mul(nz(8.0, 2.0, 0.5), 0.35 * k_fine))
    if mat.name == 'ALQ_body':
        d = detail_nodes(nb, tc, sep)
        h = add(h, mul(d['dome'], 2.2)); h = add(h, mul(d['groove'], -1.0))
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
    im_ = bpy.data.images.get(f'ALQ_decals_{k}')
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
