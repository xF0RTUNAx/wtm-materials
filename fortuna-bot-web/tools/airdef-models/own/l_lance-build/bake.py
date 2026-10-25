# bake.py — запекает текстуры пусковой M752 (ракетный комплекс Lance): цвет (l_lance_detail.png: трёхцветный камуфляж НАТО по рисунку 5 Mark, потёки, пыль сверху и грязь снизу, сколы на рёбрах, затёртые пятна, затенение щелей
# трёх масштабов, зерно, швы листов) и карту нормалей (l_lance_normal.png: скруглённые рёбра, мелкая «корка» краски, волна листов, сварные швы). Третья карта l_lance_orm.png (R = 1, G = шероховатость, B = металличность) — только для Sketchfab и .blend:
# игра берёт постоянные значения (matte). Нужен Cycles (на видеокарте — gpu_setup). Запускается ПОСЛЕ build.py в той же сессии (походная поза: узоры считаются по мировым координатам, чтобы подвижные части — трап, стрела — продолжали рисунок корпуса):
#   M752_OUT="<папка модели>" [M752_TEX=2048] [M752_NTEX=2048] [M752_REUSE=1] Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Развёртка: смарт-проекция всех деталей в один атлас, зазор между островами 16 px при полосе растяжки 8 px, запас по краю атласа. Мелкая фурнитура (body_hw, ramp_hw, erect_hw, body_tread) — плоские материалы без развёртки.
import os, sys, math, time
sys.dont_write_bytecode = True
import bpy

OUT = os.environ.get('M752_OUT')
if not OUT: raise SystemExit('Задай M752_OUT=<папка модели>')
SIZE = int(os.environ.get('M752_TEX', '2048'))
KEEP_MAPS = os.environ.get('M752_KEEP_MAPS') == '1'      # цвет — заново, ORM и карту нормалей — из прошлого запуска (правка только рисунка краски; геометрия и развёртка те же)
NSIZE = int(os.environ.get('M752_NTEX', str(SIZE)))
GAME_TEX, GAME_NTEX = int(os.environ.get('M752_GAME_TEX', '1024')), int(os.environ.get('M752_GAME_NTEX', '512'))
CAMO_S, CAMO_TILT, CAMO_DIST, CAMO_BK, CAMO_BR = [float(x) for x in os.environ.get('M752_CAMO', '0.42,22,0.9,0.585,0.455').split(',')]          # масштаб пятен, наклон (°), закрученность, порог чёрного (шум выше) и коричневого (шум ниже)
T0 = time.time()
sc = bpy.data.scenes['M752']
if bpy.context.window: bpy.context.window.scene = sc
all_objs = [o for o in sc.objects if o.type == 'MESH']
# мелкие детали (болты, петли, звенья гусениц, растяжки …) — отдельные объекты с плоскими материалами: без развёртки и без места в атласе (каждый остров стоил бы зазор 16 px и съедал полотно у крупных панелей)
FLAT_OBJS = ('body_hw', 'ramp_hw', 'erect_hw', 'body_tread')
FLAT_RGB = {'M752_body': (0.060, 0.072, 0.034), 'M752_skirt': (0.018, 0.021, 0.028), 'M752_dark': (0.034, 0.033, 0.030), 'M752_steel': (0.110, 0.108, 0.100), 'M752_red': (0.26, 0.022, 0.018), 'M752_wheel': (0.056, 0.064, 0.050)}      # плоские детали — тот же тон, что и основная краска, чуть темнее
flat_mats = {}
for m_ in [m for m in bpy.data.materials if m.name in ('M752_body', 'M752_skirt', 'M752_dark', 'M752_steel', 'M752_red', 'M752_wheel')]:
    mf_ = m_.copy(); mf_.name = m_.name + 'F'; flat_mats[m_.name] = mf_
    next(n for n in mf_.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (*FLAT_RGB[m_.name], 1.0)
for o in all_objs:
    if o.name in FLAT_OBJS:
        for sl in o.material_slots:
            if sl.material is not None and sl.material.name in flat_mats: sl.material = flat_mats[sl.material.name]
        while len(o.data.uv_layers) > 0: o.data.uv_layers.remove(o.data.uv_layers[0])
objs = [o for o in all_objs if o.name not in FLAT_OBJS]
vl = bpy.context.view_layer
vl.update()                                   # базы новых объектов появляются в слое только после обновления (в живом Blender — обязательно)
RO_ = bpy.data.objects.get('ramp_out')            # наружная плита трапа в походной позе сложена на внутреннюю и закрывает её (затенение в запекании сделало бы раскрытый трап чёрным): на время запекания она развёрнута (0°), в конце возвращается
RO_ROT = RO_.rotation_euler.copy() if RO_ is not None else None
if RO_ is not None: RO_.rotation_euler.x = 0.0; vl.update()


def log(*a): print(f'[{time.time() - T0:5.1f} с]', *a, flush=True)


# 1. развёртка: все детали сразу, один общий атлас
for o in vl.objects: o.select_set(False)
for o in objs:
    o.select_set(True)
    while len(o.data.uv_layers) > 0: o.data.uv_layers.remove(o.data.uv_layers[0])
    o.data.uv_layers.new(name='UVMap')
vl.objects.active = objs[0]
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
try: bpy.ops.uv.average_islands_scale()
except Exception as e: print('average_islands_scale:', e)
bpy.ops.object.mode_set(mode='OBJECT')
UV_W = {'body_run': 0.50, 'erect_boom': 0.60}                                  # плотность текстуры относительно остальных: гусеницы и катки видны меньше, чем корпус и башня
for o in objs:
    k_ = UV_W.get(o.name, 1.0)
    if k_ != 1.0:
        for l_ in o.data.uv_layers.active.data: l_.uv = (l_.uv.x * k_, l_.uv.y * k_)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
try: bpy.ops.uv.pack_islands(rotate=True, margin=16.0 / SIZE, margin_method='ADD')
except TypeError:
    try: bpy.ops.uv.pack_islands(rotate=True, margin=16.0 / SIZE)
    except TypeError: bpy.ops.uv.pack_islands(margin=16.0 / SIZE)
bpy.ops.object.mode_set(mode='OBJECT')
K_UV = 1.0 - 2 * 12.0 / SIZE                      # запас ≈ 12 px по краю атласа: остров у границы при повторе текстуры сэмплирует пустой край
for o in objs:
    for l_ in o.data.uv_layers.active.data: l_.uv = (0.5 + (l_.uv.x - 0.5) * K_UV, 0.5 + (l_.uv.y - 0.5) * K_UV)
log('развёртка готова, объектов', len(objs))

# 2. картинка и шейдер запекания в каждом материале
old = bpy.data.images.get('M752_detail')
if old is not None: bpy.data.images.remove(old)
path = os.path.join(OUT, 'l_lance_detail.png')
REUSE = os.environ.get('M752_REUSE') == '1' and os.path.exists(path)       # подбор рельефа: цвет не запекать заново (геометрия та же — развёртка та же)
if REUSE:
    img = bpy.data.images.load(path, check_existing=False); img.name = 'M752_detail'; img.pack()
else:
    img = bpy.data.images.new('M752_detail', SIZE, SIZE, alpha=False)
    img.generated_color = (1, 1, 1, 1)
mats = [m for m in bpy.data.materials if m.name in ('M752_body', 'M752_skirt', 'M752_dark', 'M752_steel', 'M752_red', 'M752_wheel') and m.users > 0]          # с текстурой — основные материалы; плоские копии — без
opath = os.path.join(OUT, 'l_lance_orm.png')
oold = bpy.data.images.get('M752_orm')
if oold is not None: bpy.data.images.remove(oold)
REUSE_ORM = (REUSE or KEEP_MAPS) and os.path.exists(opath)
if REUSE_ORM:
    oimg = bpy.data.images.load(opath, check_existing=False); oimg.name = 'M752_orm'; oimg.pack()
else:
    oimg = bpy.data.images.new('M752_orm', SIZE, SIZE, alpha=False); oimg.generated_color = (1.0, 0.7, 0.0, 1.0)
oimg.colorspace_settings.name = 'Non-Color'
ORM_RIG = {}                                          # материал → (узел Emission, выход «ORM», узел картинки ORM): второй проход запекания


DEC_R = os.path.join(OUT, '_текстуры', 'm752_decals_R.png')
dec_img = None
if os.path.exists(DEC_R):
    dec_img = bpy.data.images.get('M752_decals_R')
    if dec_img is not None: bpy.data.images.remove(dec_img)
    dec_img = bpy.data.images.load(DEC_R, check_existing=False); dec_img.name = 'M752_decals_R'; dec_img.colorspace_settings.name = 'Non-Color'; dec_img.alpha_mode = 'CHANNEL_PACKED'
DEC_BOX = (-130.0, 130.0, -210.0, -70.0)                  # x0, x1, y0, y1 листа, см


def plate_seam_mask(nt, obj_vec):
    """Швы между листами брони: (маска шва 0…1, оттенок листа 0,86…1). Листы 1,8 × 1,0 м на бортах, 1,2 × 1,0 м спереди и сзади, 1,4 × 1,6 м сверху; плоскость листа выбирается по
    доминирующей оси нормали грани (узел Brick, кладка со сдвигом — листы не в одну линию). Шов неравномерный (шум: где-то грязь забила, где-то еле виден), каждый лист чуть светлее
    или темнее соседа (разная партия краски). В цвете шов — тёмная линия, в нормалях — канавка ≈ 2 мм."""
    nodes, links = nt.nodes, nt.links
    def math_(op, a, b=None, clamp=False):
        n = nodes.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: links.new(v, n.inputs[i])
        return n.outputs['Value']
    sep = nodes.new('ShaderNodeSeparateXYZ'); links.new(obj_vec, sep.inputs['Vector'])
    geo = nodes.new('ShaderNodeNewGeometry'); gs = nodes.new('ShaderNodeSeparateXYZ'); links.new(geo.outputs['Normal'], gs.inputs['Vector'])
    def brick(a, b, w_, h_):
        cm = nodes.new('ShaderNodeCombineXYZ'); links.new(a, cm.inputs[0]); links.new(b, cm.inputs[1])
        br = nodes.new('ShaderNodeTexBrick'); br.offset = 0.37; br.offset_frequency = 2; br.squash = 1.0; br.squash_frequency = 2
        br.inputs['Scale'].default_value = 1.0; br.inputs['Mortar Size'].default_value = 0.006; br.inputs['Mortar Smooth'].default_value = 0.35
        br.inputs['Brick Width'].default_value = w_; br.inputs['Row Height'].default_value = h_
        br.inputs['Color1'].default_value = (1, 1, 1, 1); br.inputs['Color2'].default_value = (0.85, 0.85, 0.85, 1); br.inputs['Mortar'].default_value = (1, 1, 1, 1)
        links.new(cm.outputs['Vector'], br.inputs['Vector'])
        sp_ = nodes.new('ShaderNodeSeparateColor'); links.new(br.outputs['Color'], sp_.inputs['Color'])
        return br.outputs['Fac'], sp_.outputs['Red']      # Fac узла Brick — маска раствора (1 в шве); цвет — случайный оттенок листа
    (s_yz, t_yz), (s_xz, t_xz), (s_xy, t_xy) = brick(sep.outputs['Y'], sep.outputs['Z'], 1.8, 1.0), brick(sep.outputs['X'], sep.outputs['Z'], 1.2, 1.0), brick(sep.outputs['X'], sep.outputs['Y'], 1.4, 1.6)
    ax, ay, az = math_('ABSOLUTE', gs.outputs['X']), math_('ABSOLUTE', gs.outputs['Y']), math_('ABSOLUTE', gs.outputs['Z'])
    mx = math_('MULTIPLY', math_('GREATER_THAN', ax, ay), math_('GREATER_THAN', ax, az)); my = math_('MULTIPLY', math_('GREATER_THAN', ay, ax), math_('GREATER_THAN', ay, az)); mz = math_('MULTIPLY', math_('GREATER_THAN', az, ax), math_('GREATER_THAN', az, ay))
    pick = lambda a, b, c_: math_('ADD', math_('ADD', math_('MULTIPLY', mx, a), math_('MULTIPLY', my, b)), math_('MULTIPLY', mz, c_), clamp=True)
    nz = nodes.new('ShaderNodeTexNoise'); nz.noise_dimensions = '3D'; nz.inputs['Scale'].default_value = 2.3; nz.inputs['Detail'].default_value = 3.0; links.new(obj_vec, nz.inputs['Vector'])
    mr_ = nodes.new('ShaderNodeMapRange'); mr_.inputs['From Min'].default_value = 0.38; mr_.inputs['From Max'].default_value = 0.62; mr_.inputs['To Min'].default_value = 0.25; mr_.inputs['To Max'].default_value = 1.0; links.new(nz.outputs['Fac'], mr_.inputs['Value'])
    none = math_('SUBTRACT', 1.0, math_('ADD', math_('ADD', mx, my), mz), clamp=True)                            # грань точно под 45°: ни одна ось не победила
    return math_('MULTIPLY', pick(s_yz, s_xz, s_xy), mr_.outputs['Result']), math_('ADD', pick(t_yz, t_xz, t_xy), none, clamp=True)


# шейдер запекания: итоговая яркость и цвет по каналам, выводом через Emission (запекается типом EMIT)
def build_pattern(mat):
    """Шейдер запекания: полноцветная текстура краски — цвет материала, поверх него песок и пыль на верхних плоскостях, песок и глина снизу, сколы до голого металла
    на рёбрах, затёртые пятна, царапины, выцветание, затенение трёх масштабов, зерно. Вывод — через Emission (запекается типом EMIT)."""
    nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for n in list(nodes):
        if n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): nodes.remove(n)
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL'); prin = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    col = tuple(prin.inputs['Base Color'].default_value)
    for l in list(prin.inputs['Base Color'].links): links.remove(l)
    N = lambda t: nodes.new(t)
    kind = mat.name
    dust_k = {'M752_body': 0.31, 'M752_skirt': 0.6, 'M752_dark': 0.8, 'M752_steel': 0.30, 'M752_red': 0.2, 'M752_wheel': 0.9}.get(kind, 1.0)
    def math_(op, a=None, b=None, clamp=False):
        n = N('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: links.new(v, n.inputs[i])
        return n.outputs['Value']
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
    POS = N('ShaderNodeNewGeometry').outputs['Position']                       # мировые координаты: узоры не зависят от начала объекта
    ao1 = N('ShaderNodeAmbientOcclusion'); ao1.samples = 24; ao1.inputs['Distance'].default_value = 0.30
    ao2 = N('ShaderNodeAmbientOcclusion'); ao2.samples = 12; ao2.inputs['Distance'].default_value = 1.6
    ao3 = N('ShaderNodeAmbientOcclusion'); ao3.samples = 12; ao3.inputs['Distance'].default_value = 0.75
    ao0 = N('ShaderNodeAmbientOcclusion'); ao0.samples = 16; ao0.inputs['Distance'].default_value = 0.05
    a0 = maprange(ao0.outputs['AO'], 0, 1, 0.42, 1.0); a1 = maprange(ao1.outputs['AO'], 0, 1, 0.42, 1.0); a2 = maprange(ao2.outputs['AO'], 0, 1, 0.80, 1.0); a3 = maprange(ao3.outputs['AO'], 0, 1, 0.74, 1.0)
    sep = N('ShaderNodeSeparateXYZ'); links.new(POS, sep.inputs['Vector'])
    geo = N('ShaderNodeNewGeometry'); gsep = N('ShaderNodeSeparateXYZ'); links.new(geo.outputs['Normal'], gsep.inputs['Vector'])
    def noise(scale, detail, rough, lo, hi):
        n = N('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(POS, n.inputs['Vector']); return maprange(n.outputs['Fac'], lo, hi, 0.0, 1.0)
    patchy = noise(4.0, 7.0, 0.6, 0.30, 0.72)
    mp = N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (9.0, 9.0, 1.1); links.new(POS, mp.inputs['Vector'])
    st = N('ShaderNodeTexNoise'); st.noise_dimensions = '3D'; st.inputs['Scale'].default_value = 1.0; st.inputs['Detail'].default_value = 3.0; st.inputs['Roughness'].default_value = 0.7
    links.new(mp.outputs['Vector'], st.inputs['Vector'])
    streak = maprange(st.outputs['Fac'], 0.42, 0.68, 0.0, 1.0)
    gm = N('ShaderNodeMapping'); gm.inputs['Scale'].default_value = (260.0, 260.0, 260.0); links.new(POS, gm.inputs['Vector'])
    wn = N('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; links.new(gm.outputs['Vector'], wn.inputs['Vector'])
    grain = math_('ADD', 1.0, math_('MULTIPLY', math_('SUBTRACT', wn.outputs['Value'], 0.5), 0.11))
    topmask = N('ShaderNodeMapRange'); topmask.interpolation_type = 'SMOOTHSTEP'; topmask.clamp = True
    topmask.inputs['From Min'].default_value = 0.35; topmask.inputs['From Max'].default_value = 0.92; topmask.inputs['To Min'].default_value = 0.0; topmask.inputs['To Max'].default_value = 1.0
    links.new(gsep.outputs['Z'], topmask.inputs['Value'])
    low = maprange(sep.outputs['Z'], 0.0, 1.45, 1.0, 0.0)
    gate = math_('ADD', 0.35, math_('MULTIPLY', a1, 0.65))                    # в щелях пыли и песка мало
    top_amt = math_('MULTIPLY', math_('MULTIPLY', topmask.outputs['Result'], math_('ADD', 0.45, math_('MULTIPLY', patchy, 0.55))), gate)
    splash = noise(11.0, 5.0, 0.65, 0.46, 0.53)                                                                # брызги грязи: резкая кромка пятен
    low_amt = math_('MULTIPLY', math_('MULTIPLY', math_('MULTIPLY', math_('MULTIPLY', low, low), math_('ADD', 0.5, math_('MULTIPLY', patchy, 0.5))), gate), math_('ADD', 0.30, math_('MULTIPLY', splash, 0.70)))
    top_amt = math_('ADD', top_amt, math_('MULTIPLY', streak, 0.06), clamp=True)
    # рёбра: узкая полоса блика и широкая зона износа для сколов
    bev = N('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.018; bev.samples = 6
    dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; links.new(bev.outputs['Normal'], dot.inputs[0]); links.new(geo.outputs['Normal'], dot.inputs[1])
    edge = maprange(dot.outputs['Value'], 1.0, 0.93, 0.0, 1.0)
    bev2 = N('ShaderNodeBevel'); bev2.inputs['Radius'].default_value = 0.045; bev2.samples = 6
    dot2 = N('ShaderNodeVectorMath'); dot2.operation = 'DOT_PRODUCT'; links.new(bev2.outputs['Normal'], dot2.inputs[0]); links.new(geo.outputs['Normal'], dot2.inputs[1])
    zone = maprange(dot2.outputs['Value'], 1.0, 0.90, 0.0, 1.0)
    chip = math_('MULTIPLY', zone, noise(34.0, 6.0, 0.7, 0.50, 0.535))                                         # рваные сколы: порог узкий — края чёткие
    speck_l = noise(120.0, 3.0, 0.5, 0.63, 0.66); speck_d = noise(85.0, 3.0, 0.5, 0.635, 0.665)               # крапинки: отслоившаяся краска (светлая) и грязь (тёмная)
    scuff = math_('MULTIPLY', noise(6.5, 8.0, 0.62, 0.60, 0.74), math_('ADD', 0.35, math_('MULTIPLY', maprange(gsep.outputs['Z'], -0.2, 0.9, 0.0, 1.0), 0.65)))
    vor = N('ShaderNodeTexVoronoi'); vor.voronoi_dimensions = '3D'; vor.feature = 'DISTANCE_TO_EDGE'; vor.inputs['Scale'].default_value = 7.0
    links.new(POS, vor.inputs['Vector'])
    scratch = math_('MULTIPLY', maprange(vor.outputs['Distance'], 0.0, 0.05, 1.0, 0.0), noise(22.0, 3.0, 0.5, 0.50, 0.66))
    fade = noise(1.1, 3.0, 0.5, 0.32, 0.68)
    down = maprange(gsep.outputs['Z'], 0.15, -0.6, 0.0, 1.0)
    seam, ptint = plate_seam_mask(nt, POS) if kind == 'M752_body' else (None, None)
    # подтёки: узкие вертикальные полосы грязи на боковых гранях (шум растянут вдоль Z), сильнее ближе к верху — стекает с кромок и крышек
    mr = N('ShaderNodeMapping'); mr.inputs['Scale'].default_value = (30.0, 30.0, 1.5); links.new(POS, mr.inputs['Vector'])
    rn = N('ShaderNodeTexNoise'); rn.noise_dimensions = '3D'; rn.inputs['Scale'].default_value = 1.0; rn.inputs['Detail'].default_value = 4.0; rn.inputs['Roughness'].default_value = 0.6
    links.new(mr.outputs['Vector'], rn.inputs['Vector'])
    side = math_('SUBTRACT', 1.0, topmask.outputs['Result'], clamp=True)
    rain = math_('MULTIPLY', math_('MULTIPLY', maprange(rn.outputs['Fac'], 0.45, 0.70, 0.0, 1.0), noise(2.6, 3.0, 0.5, 0.42, 0.62)), math_('MULTIPLY', side, maprange(sep.outputs['Z'], 0.2, 2.6, 0.45, 1.0)))     # подтёки идут пятнами, не сплошь
    # цвет: краска → песок сверху → глина снизу → затёртая краска → голый металл на сколах и царапинах → затенение, выцветание, зерно
    SAND, MUD, METAL = (0.20, 0.17, 0.10), (0.085, 0.065, 0.040), (0.16, 0.15, 0.135)
    # камуфляж по фото 4 (Mark): три тона, крупные округлые пятна с чёткой кромкой, вытянутые по диагонали (трафарет на всю машину, а не по листам):
    # основа — оливково-хаки, тёмно-серо-зелёные «языки» и светлые песочные пятна; шум в координатах модели (растянут и повёрнут), края — узкий шаг порога (≈ 1 см)
    BASE, BROWN, BLACK = (0.058, 0.072, 0.028), (0.082, 0.056, 0.030), (0.016, 0.021, 0.012)          # НАТО: оливково-зелёный, коричневый, чёрно-зелёный (рисунок 5)
    if kind == 'M752_body':
        mrot = N('ShaderNodeMapping'); mrot.inputs['Rotation'].default_value = (math.radians(CAMO_TILT), 0.0, math.radians(14.0)); links.new(POS, mrot.inputs['Vector'])
        msc = N('ShaderNodeMapping'); msc.inputs['Scale'].default_value = (CAMO_S * 0.75, CAMO_S * 0.55, CAMO_S * 1.1); links.new(mrot.outputs['Vector'], msc.inputs['Vector'])
        def camo_noise(off, detail):
            m_ = N('ShaderNodeMapping'); m_.inputs['Location'].default_value = off; links.new(msc.outputs['Vector'], m_.inputs['Vector'])
            n_ = N('ShaderNodeTexNoise'); n_.noise_dimensions = '3D'; n_.inputs['Scale'].default_value = 1.0; n_.inputs['Detail'].default_value = detail; n_.inputs['Roughness'].default_value = 0.45; n_.inputs['Distortion'].default_value = CAMO_DIST
            links.new(m_.outputs['Vector'], n_.inputs['Vector']); return n_.outputs['Fac']
        n_bk, n_br = camo_noise((3.1, 1.7, 5.3), 2.0), camo_noise((11.3, 7.9, 2.2), 2.0)
        bk = maprange(n_bk, CAMO_BK, CAMO_BK + 0.006, 0.0, 1.0); br_ = maprange(n_br, CAMO_BR, CAMO_BR - 0.006, 0.0, 1.0)      # чёрные пятна — где шум выше порога; коричневые — где ниже
        c = mixc(mixc(rgb(BASE), rgb(BROWN), br_), rgb(BLACK), bk)
    else: c = rgb(col)
    if kind == 'M752_body' and dec_img is not None:                       # таблички с номерами на лбу (рисунок 5): проекция вдоль Y (вид спереди, X листа — вправо для зрителя, то есть −X мира), только на гранях, смотрящих вперёд
        x0_, x1_, y0_, y1_ = DEC_BOX; Wd_, Hd_ = x1_ - x0_, y1_ - y0_
        ncs = N('ShaderNodeSeparateXYZ'); links.new(geo.outputs['Normal'], ncs.inputs['Vector'])
        rear = maprange(ncs.outputs['Y'], 0.70, 0.90, 0.0, 1.0)
        rear = math_('MULTIPLY', rear, maprange(sep.outputs['Y'], 2.50, 2.70, 0.0, 1.0))                  # только на лбу: у трапа (в позе запекания он смотрит вперёд-вверх) табличек быть не должно
        cmb = N('ShaderNodeCombineXYZ'); links.new(math_('MULTIPLY', sep.outputs['X'], -1.0), cmb.inputs['X']); links.new(sep.outputs['Z'], cmb.inputs['Y'])
        mpd = N('ShaderNodeMapping'); mpd.vector_type = 'POINT'
        mpd.inputs['Scale'].default_value = (1.0 / (0.01 * Wd_), 1.0 / (0.01 * Hd_), 1.0); mpd.inputs['Location'].default_value = ((0.0 - x0_) / Wd_, 1.0 - (0.0 - y0_) / Hd_, 0.0)
        links.new(cmb.outputs['Vector'], mpd.inputs['Vector'])
        dtx = N('ShaderNodeTexImage'); dtx.image = dec_img; dtx.extension = 'CLIP'; dtx.interpolation = 'Linear'; links.new(mpd.outputs['Vector'], dtx.inputs['Vector'])
        dsp = N('ShaderNodeSeparateColor'); links.new(dtx.outputs['Color'], dsp.inputs['Color'])
        plate_m = math_('MULTIPLY', dtx.outputs['Alpha'], rear); text_m = math_('MULTIPLY', dsp.outputs['Red'], rear)
        c = mixc(c, rgb((0.42, 0.42, 0.38)), math_('MULTIPLY', plate_m, 0.92))
        c = mixc(c, rgb((0.022, 0.022, 0.020)), math_('MULTIPLY', text_m, 0.95))
    c = mixc(c, rgb(SAND), math_('MULTIPLY', top_amt, 0.85 * dust_k))
    c = mixc(c, rgb(MUD), math_('MULTIPLY', low_amt, 0.68 * dust_k))
    c = mixc(c, rgb(MUD), math_('MULTIPLY', rain, 0.17 * dust_k))
    c = mixc(c, gray(math_('SUBTRACT', 1.0, math_('MULTIPLY', noise(1.7, 4.0, 0.6, 0.55, 0.62), 0.14))), 1.0, 'MULTIPLY')                       # крупные тёмные разводы: краска пропиталась неравномерно
    c = mixc(c, rgb((1.10, 1.0, 0.86)), math_('MULTIPLY', noise(1.3, 3.0, 0.5, 0.30, 0.70), 0.14), 'MULTIPLY')                             # тёплые и холодные пятна
    c = mixc(c, gray(math_('SUBTRACT', 1.0, math_('MULTIPLY', rain, 0.08))), 1.0, 'MULTIPLY')
    light = mixc(rgb(col), gray(1.7), 1.0, 'MULTIPLY')                              # затёртая краска — светлее основы
    c = mixc(c, light, math_('MULTIPLY', scuff, 0.42))
    c = mixc(c, rgb(METAL), math_('MULTIPLY', speck_l, 0.40 if kind in ('M752_body', 'M752_dark', 'M752_skirt', 'M752_wheel') else 0.16))
    c = mixc(c, gray(math_('SUBTRACT', 1.0, math_('MULTIPLY', speck_d, 0.20))), 1.0, 'MULTIPLY')
    wearmask = math_('ADD', math_('MULTIPLY', edge, 1.0), math_('ADD', chip, math_('MULTIPLY', scratch, 0.18)), clamp=True)
    wearmask = math_('MULTIPLY', wearmask, math_('SUBTRACT', 1.0, math_('MULTIPLY', low_amt, 0.75)))        # под слоем грязи металл не блестит
    RUST = (0.17, 0.075, 0.040); rustmix = noise(5.0, 4.0, 0.6, 0.44, 0.58)                                         # на сколах — голый металл вперемешку с ржавчиной
    c = mixc(c, mixc(rgb(METAL), rgb(RUST), rustmix), math_('MULTIPLY', wearmask, 0.75 if kind in ('M752_body', 'M752_dark', 'M752_skirt', 'M752_wheel') else 0.24))        # на стали и стекле износ слабее (иначе «мрамор»)
    c = mixc(c, rgb((0.026, 0.021, 0.016)), math_('MULTIPLY', math_('SUBTRACT', 1.0, a0), 0.70))                      # копоть и смазка в тесных щелях (вокруг болтов, петель, под кромками)
    if seam is not None:
        c = mixc(c, gray(math_('SUBTRACT', 1.0, math_('MULTIPLY', seam, 0.32))), 1.0, 'MULTIPLY')                 # швы листов — тёмные линии (неравномерные)
        c = mixc(c, gray(math_('ADD', math_('MULTIPLY', ptint, 1.0), 0.0)), 1.0, 'MULTIPLY')                     # каждый лист чуть светлее или темнее соседа
    c = mixc(c, gray(math_('MULTIPLY', math_('MULTIPLY', math_('MULTIPLY', a0, a1), a2), a3)), 1.0, 'MULTIPLY')
    c = mixc(c, gray(math_('ADD', 0.94, math_('MULTIPLY', fade, 0.06))), 1.0, 'MULTIPLY')
    c = mixc(c, gray(math_('SUBTRACT', 1.0, math_('MULTIPLY', down, 0.21))), 1.0, 'MULTIPLY')
    c = mixc(c, gray(grain), 1.0, 'MULTIPLY')
    # шероховатость и металличность (второй проход запекания, карта ORM): краска полуматовая, пыль и грязь — матовые, сколы — блестящий металл, швы забиты грязью, подтёки чуть глянцевые
    def lerp(a, b, t): return math_('ADD', math_('MULTIPLY', a, math_('SUBTRACT', 1.0, t)), math_('MULTIPLY', b, t))
    b_r, b_m = {'M752_body': (0.88, 0.0), 'M752_skirt': (0.90, 0.0), 'M752_dark': (0.94, 0.0), 'M752_steel': (0.62, 0.40), 'M752_red': (0.50, 0.0), 'M752_wheel': (0.88, 0.0)}.get(kind, (0.8, 0.0))
    dust_a = math_('ADD', math_('MULTIPLY', top_amt, 0.85 * dust_k), math_('MULTIPLY', low_amt, 0.75 * dust_k), clamp=True)
    wear_a = math_('MULTIPLY', wearmask, 0.9 if kind in ('M752_body', 'M752_dark', 'M752_skirt', 'M752_wheel') else 0.28)
    b_rn = math_('ADD', b_r, math_('MULTIPLY', math_('SUBTRACT', noise(18.0, 3.0, 0.5, 0.35, 0.65), 0.5), 0.16))        # краска блестит неровно: где-то чуть глянцевее, где-то матовее
    rg = lerp(lerp(lerp(b_rn, 0.96, dust_a), 0.82, math_('MULTIPLY', scuff, 0.55)), 0.40, wear_a)
    rg = lerp(rg, 0.92, math_('MULTIPLY', rustmix, wear_a))
    if seam is not None: rg = lerp(rg, 0.93, math_('MULTIPLY', seam, 0.8))
    if kind != 'M752_red': rg = lerp(rg, 0.46, math_('MULTIPLY', rain, 0.45))
    mt = lerp(lerp(b_m, 0.0, dust_a), 0.85, wear_a)
    orm = N('ShaderNodeCombineColor'); orm.inputs[0].default_value = 1.0; links.new(rg, orm.inputs[1]); links.new(mt, orm.inputs[2])
    emi = N('ShaderNodeEmission'); links.new(c, emi.inputs['Color'])
    links.new(emi.outputs['Emission'], out.inputs['Surface'])
    tex = N('ShaderNodeTexImage'); tex.image = img
    otex = N('ShaderNodeTexImage'); otex.image = oimg; ORM_RIG[kind] = (emi, orm.outputs['Color'], otex)
    for n in nodes: n.select = False
    tex.select = True; nodes.active = tex
    return out, prin, tex, col


rig = {m.name: build_pattern(m) for m in mats}
log('шейдеры запекания готовы')

# 3. запекание (Cycles, процессор)
sys.path.insert(0, '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/_инструменты')
import gpu_setup                                    # Cycles на видеокарте (Metal), если есть; иначе процессор
sc.render.engine = 'CYCLES'; log('Cycles:', gpu_setup.use_gpu(sc)); sc.cycles.samples = 24
if os.environ.get('M752_CAMO_TEST'):
    # M752_CAMO_TEST=<папка>: быстрый просмотр рисунка краски прямо на модели (Emission как есть, без запекания), четыре ракурса, затем выход
    import modelkit as mk
    from mathutils import Vector
    sc.cycles.samples = 12
    try: sc.cycles.use_denoising = False
    except Exception: pass
    sc.render.film_transparent = False; sc.render.image_settings.color_mode = 'RGB'
    try: sc.view_settings.view_transform = 'Standard'
    except Exception: pass
    cam = mk._camera(); cam.data.type = 'PERSP'; cam.data.lens = 50; cam.data.clip_start, cam.data.clip_end = 0.05, 100
    for nm_, tgt, d, dist in (('1', Vector((0, 0.0, 1.3)), (-0.85, -0.95, 0.40), 14.0), ('2', Vector((0, 0.0, 1.3)), (-1.0, 0.0, 0.03), 14.5),
                              ('3', Vector((0, -0.4, 1.3)), (0.85, -1.0, 0.42), 13.0), ('4', Vector((0, 0.0, 1.0)), (0.15, 0.25, 1.0), 16.0),
                              ('5', Vector((0, 3.4, 1.5)), (-0.55, 0.8, 0.35), 6.0), ('6', Vector((1.3, 0.4, 1.2)), (1.0, 0.0, 0.12), 6.5)):
        dv = Vector(d).normalized(); cam.location = tgt + dv * dist; cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
        mk._render(os.path.join(os.environ['M752_CAMO_TEST'], f'camo_{nm_}.png'), 1280, 720)
    raise SystemExit(0)
try: sc.cycles.use_denoising = False
except Exception: pass
for o in vl.objects: o.select_set(False)
for o in objs: o.select_set(True)
vl.objects.active = objs[0]
if not REUSE:
    bpy.ops.object.bake(type='EMIT', width=SIZE, height=SIZE, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
    log('запекание готово')
else: log('цвет взят из прошлого запуска (M752_REUSE=1)')

# 4. сохранить картинку цвета
if not REUSE:
    img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    img.pack()
log('цвет сохранён', path)

# 4б. шероховатость и металличность: тот же рисунок краски, но в Emission идёт карта ORM (R = 1, G = шероховатость, B = металличность), картинка — Non-Color
if not REUSE_ORM:
    for m in mats:
        emi_, orm_col, otex_ = ORM_RIG[m.name]; nt_ = m.node_tree
        nt_.links.new(orm_col, emi_.inputs['Color'])
        for n in nt_.nodes: n.select = False
        otex_.select = True; nt_.nodes.active = otex_
    bpy.ops.object.bake(type='EMIT', width=SIZE, height=SIZE, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
    oimg.filepath_raw = opath; oimg.file_format = 'PNG'; oimg.save(); oimg.pack()
    log('ORM запечён', opath)


# 5. карта нормалей: рельеф — в Normal принципиального шейдера (Bevel → Bump), запекание типа NORMAL в касательном пространстве
def build_relief(mat, entry):
    """Рельеф поверхности для запекания нормалей: Bevel скругляет все рёбра (блик на кромках без лишних треугольников), Bump добавляет мелкую «корку» краски
    (ячейка ≈ 2 см) и лёгкую волну листов (≈ 20 см). Резина и тёмные детали — грубее, металл — глаже, стекло — только скругление рёбер."""
    out, prin, tex, col = entry; nt = mat.node_tree; nodes, links = nt.nodes, nt.links
    for l in list(out.inputs['Surface'].links): links.remove(l)
    links.new(prin.outputs['BSDF'], out.inputs['Surface'])
    kind = mat.name
    k_fine, k_wave, bev_r = {'M752_body': (1.6, 1.4, 0.012), 'M752_skirt': (1.6, 1.0, 0.011), 'M752_dark': (1.8, 1.0, 0.011), 'M752_steel': (0.8, 0.8, 0.010), 'M752_red': (0.0, 0.0, 0.010), 'M752_wheel': (1.4, 1.0, 0.010)}.get(kind, (1.0, 1.0, 0.014))
    tc = nodes.new('ShaderNodeTexCoord')
    POS = nodes.new('ShaderNodeNewGeometry').outputs['Position']
    bev = nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = bev_r; bev.samples = 16
    def noise(scale, detail, rough):
        n = nodes.new('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        links.new(POS, n.inputs['Vector']); return n.outputs['Fac']
    def mul(a, k):
        n = nodes.new('ShaderNodeMath'); n.operation = 'MULTIPLY'; links.new(a, n.inputs[0]); n.inputs[1].default_value = k; return n.outputs['Value']
    def add(a, b):
        n = nodes.new('ShaderNodeMath'); n.operation = 'ADD'; links.new(a, n.inputs[0]); links.new(b, n.inputs[1]); return n.outputs['Value']
    def mapr(src, lo, hi):
        n = nodes.new('ShaderNodeMapRange'); n.clamp = True; n.inputs['From Min'].default_value = lo; n.inputs['From Max'].default_value = hi; links.new(src, n.inputs['Value']); return n.outputs['Result']
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.02; bump.inputs['Strength'].default_value = 1.0
    if k_fine > 0:
        # амплитуды в долях Distance бампа (1,0 = 2 см): мелкая «корка» ≈ 0,05 мм, волна листов ≈ 1–2 мм, вмятины ≈ 6 мм, наплыв шва ≈ 1,6 мм — как у настоящей краски и листа, без «ряби» в бликах
        h = add(mul(noise(110.0, 3.0, 0.55), 0.03 * k_fine), mul(noise(4.5, 2.0, 0.5), 0.25 * k_wave))
        h = add(h, mul(noise(1.6, 2.0, 0.5), 0.5 * k_wave))                                                         # «консервная» волна листов: широкая и мягкая
        h = add(h, mul(mapr(noise(2.1, 1.0, 0.5), 0.66, 0.80), -0.3 * k_wave))                                       # редкие вмятины
        if kind == 'M752_body': h = add(h, mul(plate_seam_mask(nt, POS)[0], 0.08)); h = add(h, mul(mapr(noise(170.0, 2.0, 0.5), 0.4, 0.6), 0.015 * k_wave))   # сварные швы листов: наплыв с мелкой рябью
        links.new(h, bump.inputs['Height'])
    links.new(bev.outputs['Normal'], bump.inputs['Normal'])
    links.new(bump.outputs['Normal'], prin.inputs['Normal'])


npath = os.path.join(OUT, 'l_lance_normal.png')
nimg = bpy.data.images.get('M752_normal')
if nimg is not None: bpy.data.images.remove(nimg)
if KEEP_MAPS and os.path.exists(npath):
    nimg = bpy.data.images.load(npath, check_existing=False); nimg.name = 'M752_normal'; nimg.colorspace_settings.name = 'Non-Color'
    ntex_of = {}
    for m in mats:
        out_, prin_, tex_, col_ = rig[m.name]; nt = m.node_tree
        for l_ in list(out_.inputs['Surface'].links): nt.links.remove(l_)
        nt.links.new(prin_.outputs['BSDF'], out_.inputs['Surface'])
        ntx = nt.nodes.new('ShaderNodeTexImage'); ntx.image = nimg; ntex_of[m.name] = ntx
    nimg.pack(); log('нормали взяты из прошлого запуска (M752_KEEP_MAPS=1)')
else:
    nimg = bpy.data.images.new('M752_normal', NSIZE, NSIZE, alpha=False)
    nimg.generated_color = (0.5, 0.5, 1.0, 1.0); nimg.colorspace_settings.name = 'Non-Color'
    ntex_of = {}
    for m in mats:
        build_relief(m, rig[m.name])
        nt = m.node_tree; nt.nodes.new('ShaderNodeTexImage')
        ntx = nt.nodes[-1]; ntx.image = nimg; ntex_of[m.name] = ntx
        for n in nt.nodes: n.select = False
        ntx.select = True; nt.nodes.active = ntx
    sc.cycles.samples = 40                                         # нормали: больше проб — гладкие скруглённые рёбра без зерна
    bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', width=NSIZE, height=NSIZE, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
    log('нормали запечены')
    nimg.filepath_raw = npath; nimg.file_format = 'PNG'; nimg.save()
    nimg.pack()

# 6. материалы: Base Color = текстура цвета, Normal = карта нормалей (Normal Map, касательное пространство); служебные узлы убрать
for m in mats:
    out, prin, tex, col = rig[m.name]; nt = m.node_tree; ntx = ntex_of[m.name]
    for l in list(prin.inputs['Normal'].links): nt.links.remove(l)
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.space = 'TANGENT'; nm.uv_map = 'UVMap'; nm.inputs['Strength'].default_value = 1.0
    otex = ORM_RIG[m.name][2]; so = nt.nodes.new('ShaderNodeSeparateColor')
    keep = {out, prin, tex, ntx, nm, otex, so}
    for n in list(nt.nodes):
        if n not in keep: nt.nodes.remove(n)
    nt.links.new(tex.outputs['Color'], prin.inputs['Base Color'])
    nt.links.new(ntx.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], prin.inputs['Normal'])
    nt.links.new(otex.outputs['Color'], so.inputs['Color']); nt.links.new(so.outputs['Green'], prin.inputs['Roughness']); nt.links.new(so.outputs['Blue'], prin.inputs['Metallic'])
    otex.location = (-500, -450); so.location = (-250, -450)
    tex.location = (-500, 100); ntx.location = (-700, -200); nm.location = (-300, -200)
log('картинки', path, opath, npath, 'материалы подключены:', [m.name for m in mats])


# 7. облегчённые копии для игры и репозитория (1024): цвет — JPEG, нормали — PNG без потерь; prepare.js берёт их как есть (2048 остаются для Sketchfab и .blend)
def lite(image, name, fmt, fname, px):
    c = image.copy(); c.name = name; c.scale(px, px); c.file_format = fmt
    p_ = os.path.join(OUT, fname)
    try: c.save(filepath=p_, quality=92)
    except TypeError:
        c.filepath_raw = p_; c.save()
    bpy.data.images.remove(c)
    return p_


lite(img, f'M752_detail_{GAME_TEX}', 'JPEG', f'l_lance_detail_{GAME_TEX}.jpg', GAME_TEX); lite(nimg, f'M752_normal_{GAME_NTEX}', 'PNG', f'l_lance_normal_{GAME_NTEX}.png', GAME_NTEX)
log('облегчённые копии', GAME_TEX, '/', GAME_NTEX, 'готовы')
if RO_ is not None: RO_.rotation_euler = RO_ROT; vl.update()                  # походная поза обратно: дальше экспорт
