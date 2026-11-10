# bake.py — запекание ATACMS (схема HIMARS/bake.py): процедурная окраска _paint.py → атласы цвета, шероховатости, нормалей.
# Атласы (ATA_TEX, по умолчанию 2048): B — корпус (головная часть, короб, сопло), F — четыре руля. Поза запекания — рули сложены (как в файле).
#   ATA_OUT="<папка>" Blender -b --factory-startup --python bake.py      (ATA_REUSE=1 — взять готовые картинки)
import os, sys, math, time
import bpy
from mathutils import Vector

H_ = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/ATACMS'
OUT = os.environ.get('ATA_OUT') or H_
SIZE = int(os.environ.get('ATA_TEX', '2048')); SAMPLES = int(os.environ.get('ATA_BAKE_SAMPLES', '24')); REUSE = os.environ.get('ATA_REUSE', '0') == '1'
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
for f in ('build.py', '_paint.py'):
    _p = os.path.join(H_, f); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
sys.path.insert(0, os.path.join(H_, '..', '_инструменты')); import gpu_setup
if bpy.context.window: bpy.context.window.scene = sc
sc.render.engine = 'CYCLES'; log('Cycles:', gpu_setup.use_gpu(sc)); sc.cycles.samples = SAMPLES
sc.render.bake.margin = 8; sc.render.bake.margin_type = 'EXTEND'
pose(0.0); bpy.context.view_layer.update(); apply_paint(1); log('окраска: песок + чёрная голова')
MESHES = {o.name: o for o in COL.objects if o.type == 'MESH'}
GROUPS = {'B': ['body'], 'F': sorted(n for n in MESHES if n.startswith('fin'))}
SIZES = {'B': SIZE, 'F': SIZE // 2}
log('группы:', GROUPS)


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
for tag in ('B', 'F'):
    objs = [MESHES[n] for n in GROUPS[tag]]; size = SIZES[tag]
    unwrap(objs, size); log('развёртка', tag, len(objs))
    mats = copies(objs, tag)
    RES[tag] = (bake(objs, mats, new_img(f'ata_{tag}_color', size), 'color'), bake(objs, mats, new_img(f'ata_{tag}_rough', size // 2, True), 'rough'),
                bake(objs, mats, new_img(f'ata_{tag}_normal', size, True), 'normal'))


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


FINAL = {tag: tex_mat(f'ATA_{tag}', *RES[tag]) for tag in RES}
for tag, names in GROUPS.items():
    for n in names:
        me = MESHES[n].data; me.materials.clear(); me.materials.append(FINAL[tag])
        for p in me.polygons: p.material_index = 0
for m in list(bpy.data.materials):
    if m.users == 0: bpy.data.materials.remove(m)
log('bake.py: готово', {k: [os.path.basename(p) for p in v] for k, v in RES.items()})
