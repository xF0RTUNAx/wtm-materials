# bake.py — запекание HIMARS (схема пусковой PAC-3, Свои/PAC-3_пусковая/bake.py): процедурная окраска _paint.py → атласы цвета, шероховатости, нормалей.
# Атласы (HIM_TEX, по умолчанию 4096): A — кабина, люк, оборудование, основание, платформа, корпуса цилиндров; F — рама, бампер, антенны;
# B — клетка, стрела, контейнер GMLRS с крышками, штоки; T — контейнер ATACMS с крышками (пекутся отдельно: контейнеры стоят в одном месте и затеняли бы друг друга);
# W — одно колесо (остальные пять получают его развёртку). Стёкла — отдельный гладкий материал. Поза запекания — походная.
#   HIM_OUT="<папка>" Blender -b --factory-startup --python bake.py      (HIM_PAINT — вариант, HIM_REUSE=1 — взять готовые картинки)
import os, sys, math, time
import bpy
from mathutils import Vector

H_ = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/HIMARS'
OUT = os.environ.get('HIM_OUT') or H_
SIZE = int(os.environ.get('HIM_TEX', '4096')); SAMPLES = int(os.environ.get('HIM_BAKE_SAMPLES', '24')); REUSE = os.environ.get('HIM_REUSE', '0') == '1'
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
for f in ('build.py', '_paint.py'):
    _p = os.path.join(H_, f); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
sys.path.insert(0, os.path.join(H_, '..', '_инструменты')); import gpu_setup
if bpy.context.window: bpy.context.window.scene = sc
sc.render.engine = 'CYCLES'; log('Cycles:', gpu_setup.use_gpu(sc)); sc.cycles.samples = SAMPLES
sc.render.bake.margin = 8; sc.render.bake.margin_type = 'EXTEND'
VAR = os.environ.get('HIM_PAINT', 'олива'); pose(0.0, 0.0, 0.0); bpy.context.view_layer.update()
apply_paint(VARIANTS[VAR], 1); log('окраска:', VAR)


def apply_mods(o):
    if not o.modifiers: return
    dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = o.data; o.modifiers.clear(); o.data = me; bpy.data.meshes.remove(old)
MESHES = {o.name: o for o in COL.objects if o.type == 'MESH'}
for o in MESHES.values(): apply_mods(o)
WHEELS = sorted(n for n in MESHES if n.startswith('wheel_'))
GROUPS = {'F': ['body_frame', 'ant_l', 'ant_r'],
          'B': ['pod', 'boom', 'pod_gmlrs', 'cyl_rod_l', 'cyl_rod_r'] + [n for n in MESHES if n.startswith(('lid_fG', 'lid_rG'))],
          'T': ['pod_atacms', 'lid_fA', 'lid_rA'],
          'W': ['wheel_2l']}
GROUPS['A'] = [n for n in MESHES if n not in WHEELS and not any(n in v for v in GROUPS.values())]
SIZES = {'A': SIZE, 'F': SIZE // 2, 'B': SIZE, 'T': SIZE // 2, 'W': SIZE // 4}
HIDE = {'B': ['pod_atacms', 'lid_fA', 'lid_rA'], 'T': ['pod_gmlrs'] + [n for n in MESHES if n.startswith(('lid_fG', 'lid_rG'))]}
log('группы:', {k: len(v) for k, v in GROUPS.items()})


def sel(objs):
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def unwrap(objs, size):
    for o in objs:
        while o.data.uv_layers: o.data.uv_layers.remove(o.data.uv_layers[0])
        o.data.uv_layers.new(name='UVMap')
    sel(objs); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, margin_method='ADD', margin=16.0 / size)
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in objs:
        for d in o.data.uv_layers.active.data: d.uv = (d.uv - Vector((0.5, 0.5))) * (1 - 24.0 / size) + Vector((0.5, 0.5))


def copies(objs, tag):
    cp = {}
    for o in objs:
        for sl in o.material_slots:
            m = sl.material
            if m is None: continue
            base = m.name.split('.')[0]
            if base not in cp: cp[base] = m.copy(); cp[base].name = base + '.' + tag
            sl.material = cp[base]
    return list(cp.values())


def new_img(name, size, data=False):
    im = bpy.data.images.get(name)
    if im: bpy.data.images.remove(im)
    im = bpy.data.images.new(name, size, size, alpha=False)
    if data: im.colorspace_settings.name = 'Non-Color'
    return im


def target(mats, img, mode):
    for m in mats:
        nt = m.node_tree; bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        tn = nt.nodes.get('BAKE_IMG') or nt.nodes.new('ShaderNodeTexImage'); tn.name = 'BAKE_IMG'; tn.image = img; nt.nodes.active = tn
        em = nt.nodes.get('BAKE_EM') or nt.nodes.new('ShaderNodeEmission'); em.name = 'BAKE_EM'
        for l in list(em.inputs['Color'].links): nt.links.remove(l)
        if mode == 'normal': nt.links.new(bs.outputs['BSDF'], out.inputs['Surface']); continue
        src = bs.inputs['Base Color' if mode == 'color' else 'Roughness']
        if src.links: nt.links.new(src.links[0].from_socket, em.inputs['Color'])
        else:
            v = src.default_value; em.inputs['Color'].default_value = (v[0], v[1], v[2], 1) if mode == 'color' else (v, v, v, 1)
        nt.links.new(em.outputs['Emission'], out.inputs['Surface'])


def bake(objs, mats, img, mode):
    p = os.path.join(OUT, img.name + '.png')
    if REUSE and os.path.exists(p): log('взято готовое', img.name); return p
    target(mats, img, mode); sel(objs); t = time.time()
    if mode == 'normal': bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', margin=8, use_clear=True)
    else: bpy.ops.object.bake(type='EMIT', margin=8, use_clear=True)
    img.filepath_raw = p; img.file_format = 'PNG'; img.save(); log('запечено', img.name, '%.0f с' % (time.time() - t))
    return p


RES = {}
for tag in ('A', 'F', 'B', 'T', 'W'):
    for o in MESHES.values(): o.hide_render = False
    for n in HIDE.get(tag, []): MESHES[n].hide_render = True
    objs = [MESHES[n] for n in GROUPS[tag]]; size = SIZES[tag]
    unwrap(objs, size); log('развёртка', tag, len(objs))
    mats = copies(objs, tag)
    RES[tag] = (bake(objs, mats, new_img(f'him_{tag}_color', size), 'color'), bake(objs, mats, new_img(f'him_{tag}_rough', size // 2, True), 'rough'),
                bake(objs, mats, new_img(f'him_{tag}_normal', size, True), 'normal'))
for o in MESHES.values(): o.hide_render = False
src_uv = MESHES['wheel_2l'].data.uv_layers.active                                                  # колёса: одна развёртка на все шесть
for n in WHEELS:
    if n == 'wheel_2l': continue
    me = MESHES[n].data
    while me.uv_layers: me.uv_layers.remove(me.uv_layers[0])
    uv = me.uv_layers.new(name='UVMap')
    for a, b in zip(uv.data, src_uv.data): a.uv = b.uv
GROUPS['W'] = WHEELS


def tex_mat(name, color, rough, normal):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    bs = nt.nodes.new('ShaderNodeBsdfPrincipled'); out = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(bs.outputs['BSDF'], out.inputs['Surface'])
    tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = bpy.data.images.load(color, check_existing=True); nt.links.new(tc.outputs['Color'], bs.inputs['Base Color'])
    tr = nt.nodes.new('ShaderNodeTexImage'); tr.image = bpy.data.images.load(rough, check_existing=True); tr.image.colorspace_settings.name = 'Non-Color'
    sp = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(tr.outputs['Color'], sp.inputs['Color']); nt.links.new(sp.outputs[0], bs.inputs['Roughness'])
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = bpy.data.images.load(normal, check_existing=True); tn.image.colorspace_settings.name = 'Non-Color'
    nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bs.inputs['Normal'])
    try: bs.inputs['Specular IOR Level'].default_value = 0.35
    except Exception: pass
    return m


FINAL = {tag: tex_mat(f'HIM_{tag}', *RES[tag]) for tag in RES}
GLASS = bpy.data.materials.new('HIM_glassF'); GLASS.use_nodes = True
gb = next(n for n in GLASS.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); gb.inputs['Base Color'].default_value = (0.02, 0.024, 0.024, 1); gb.inputs['Roughness'].default_value = 0.05
gb.inputs['Metallic'].default_value = 0.3; GLASS.diffuse_color = (0.02, 0.024, 0.024, 1)
for tag, names in GROUPS.items():
    for n in names:
        me = MESHES[n].data; gi = [i for i, sl in enumerate(MESHES[n].material_slots) if sl.material and sl.material.name.split('.')[0] == 'HIM_glass']
        glass = [p.index for p in me.polygons if p.material_index in gi]
        me.materials.clear(); me.materials.append(FINAL[tag]); me.materials.append(GLASS)
        for p in me.polygons: p.material_index = 0
        for i in glass: me.polygons[i].material_index = 1
for m in list(bpy.data.materials):
    if m.users == 0: bpy.data.materials.remove(m)
log('bake.py: готово', {k: [os.path.basename(p) for p in v] for k, v in RES.items()})
