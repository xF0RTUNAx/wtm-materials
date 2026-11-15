# bake2.py - запекание Х-59МК2 (как Х-59М/bake2.py): цвет, ORM (R затенение, G шероховатость, B металл), нормали с детальной копии
# (фаски 4 мм в 3 сегмента + рельеф швов, лючков, винтов из шейдера _paint.py). Атласы: B - корпус с соплом и бугелями (MK2_TEX, 4096),
# F - крыло, рули и их обтекатели (вдвое меньше). Окно ГСН (window) не запекается: своё тёмное стекло без фотомасок.
#   MK2_OUT="<папка атласов>" Blender -b --factory-startup --python bake2.py      (MK2_REUSE=1 - взять готовые картинки)
import os, sys, math, time
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix

H_ = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Х-59МК2'
OUT = os.environ.get('MK2_OUT') or os.path.join(H_, '_ультра'); os.makedirs(OUT, exist_ok=True)
SIZE = int(os.environ.get('MK2_TEX', '4096')); SAMPLES = int(os.environ.get('MK2_BAKE_SAMPLES', '24')); REUSE = os.environ.get('MK2_REUSE', '0') == '1'
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
for f in ('build.py', '_paint.py'):
    _p = os.path.join(H_, f); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
sys.path.insert(0, os.path.join(H_, '..', '_инструменты')); import gpu_setup
if bpy.context.window: bpy.context.window.scene = sc
sc.render.engine = 'CYCLES'; log('Cycles:', gpu_setup.use_gpu(sc)); sc.cycles.samples = SAMPLES
sc.render.bake.margin = 8; sc.render.bake.margin_type = 'EXTEND'
if not sc.world: sc.world = bpy.data.worlds.new('MK2_bakeworld')
sc.world.light_settings.distance = 0.10
pose(0.0, 0.0); bpy.context.view_layer.update(); apply_paint(1); log('окраска: светло-серая краска, износ 1')
MESHES = {o.name: o for o in COL.objects if o.type == 'MESH'}
GROUPS = {'B': ['body'], 'F': ['wing', 'boots'] + sorted(n for n in MESHES if n.startswith('fin'))}
SIZES = {'B': SIZE, 'F': SIZE // 2}


def sel(objs, active=None):
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def unwrap(objs, size):
    for o in objs:
        while o.data.uv_layers: o.data.uv_layers.remove(o.data.uv_layers[0])
        o.data.uv_layers.new(name='UVMap')
    sel(objs); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, margin_method='ADD', margin=16.0 / size)
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in objs:
        for d in o.data.uv_layers.active.data: d.uv = (d.uv - Vector((0.5, 0.5))) * (1 - 20.0 / size) + Vector((0.5, 0.5))


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
        if mode in ('normal', 'ao'): nt.links.new(bs.outputs['BSDF'], out.inputs['Surface']); continue
        src = bs.inputs[{'color': 'Base Color', 'rough': 'Roughness', 'metal': 'Metallic'}[mode]]
        if src.links: nt.links.new(src.links[0].from_socket, em.inputs['Color'])
        else:
            v = src.default_value; em.inputs['Color'].default_value = (v[0], v[1], v[2], 1) if mode == 'color' else (v, v, v, 1)
        nt.links.new(em.outputs['Emission'], out.inputs['Surface'])


def make_high(o):
    """детальная копия: фаска 4 мм в 3 сегмента по кромкам острее 30°, сглаживание, взвешенные нормали"""
    me = o.data.copy(); hi = bpy.data.objects.new(o.name + '_HI', me); sc.collection.objects.link(hi); hi.matrix_world = o.matrix_world.copy()
    for p in me.polygons: p.use_smooth = True
    if 'sharp_edge' in me.attributes: me.attributes.remove(me.attributes['sharp_edge'])
    bv = hi.modifiers.new('bev', 'BEVEL'); bv.width = 0.004 if o.name == 'body' else 0.0015; bv.segments = 3; bv.limit_method = 'ANGLE'; bv.angle_limit = math.radians(30); bv.use_clamp_overlap = True
    try: bv.harden_normals = False
    except Exception: pass
    wn = hi.modifiers.new('wn', 'WEIGHTED_NORMAL'); wn.keep_sharp = False; wn.weight = 50
    return hi


def bake(objs, mats, img, mode):
    p = os.path.join(OUT, img.name + '.png')
    if REUSE and os.path.exists(p): log('взято готовое', img.name); return p
    target(mats, img, mode); t = time.time()
    if mode == 'normal':
        for k, o in enumerate(objs):
            hi = make_high(o); bpy.context.view_layer.update(); sel([hi, o], active=o)
            bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', use_selected_to_active=True, cage_extrusion=0.008, max_ray_distance=0.03, margin=8, use_clear=(k == 0))
            bpy.data.objects.remove(hi, do_unlink=True)
    else:
        sel(objs)
        if mode == 'ao': bpy.ops.object.bake(type='AO', margin=8, use_clear=True)
        else: bpy.ops.object.bake(type='EMIT', margin=8, use_clear=True)
    img.filepath_raw = p; img.file_format = 'PNG'; img.save(); log('запечено', img.name, '%.0f с' % (time.time() - t))
    return p


def orm(tag, ao_p, r_p, m_p, size):
    """R - затенение, G - шероховатость, B - металл (glTF)"""
    out = os.path.join(OUT, f'mk2_{tag}_orm.png')
    if REUSE and os.path.exists(out): return out
    ch = []
    for p in (ao_p, r_p, m_p):
        im = bpy.data.images.load(p, check_existing=False); im.colorspace_settings.name = 'Non-Color'
        a = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4)[:, :, 0]; ch.append(a); bpy.data.images.remove(im)
    o = bpy.data.images.new(f'mk2_{tag}_orm', size, size, alpha=False); o.colorspace_settings.name = 'Non-Color'
    px = np.ones((size, size, 4), dtype=np.float32); px[:, :, 0] = 0.30 + 0.70 * ch[0]; px[:, :, 1] = np.clip(ch[1], 0.04, 1.0); px[:, :, 2] = ch[2]   # затенение не глубже 0,3
    o.pixels[:] = px.ravel(); o.filepath_raw = out; o.file_format = 'PNG'; o.save(); bpy.data.images.remove(o)
    return out


RES = {}
for tag in ('B', 'F'):
    objs = [MESHES[n] for n in GROUPS[tag]]; size = SIZES[tag]
    WINGO.hide_render = (tag == 'B')                                           # корпус - без крыла: в полёте крыло раскрыто, тень сложенного не должна печататься на спине
    unwrap(objs, size); log('развёртка', tag, len(objs))
    mats = copies(objs, tag)
    c = bake(objs, mats, new_img(f'mk2_{tag}_color', size), 'color')
    r = bake(objs, mats, new_img(f'mk2_{tag}_rough', size // 2, True), 'rough')
    m = bake(objs, mats, new_img(f'mk2_{tag}_metal', size // 2, True), 'metal')
    a = bake(objs, mats, new_img(f'mk2_{tag}_ao', size // 2, True), 'ao')
    n_ = bake(objs, mats, new_img(f'mk2_{tag}_normal', size, True), 'normal')
    RES[tag] = (c, orm(tag, a, r, m, size // 2), n_)
    WINGO.hide_render = False


def gltf_out_group():
    g = bpy.data.node_groups.get('glTF Material Output')
    if g: return g
    g = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    try: g.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    except Exception: g.inputs.new('NodeSocketFloat', 'Occlusion')
    return g


def tex_mat(name, color, ormp, normal):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    bs = nt.nodes.new('ShaderNodeBsdfPrincipled'); out = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(bs.outputs['BSDF'], out.inputs['Surface'])
    tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = bpy.data.images.load(color, check_existing=True); nt.links.new(tc.outputs['Color'], bs.inputs['Base Color'])
    to = nt.nodes.new('ShaderNodeTexImage'); to.image = bpy.data.images.load(ormp, check_existing=True); to.image.colorspace_settings.name = 'Non-Color'
    sp = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(to.outputs['Color'], sp.inputs['Color'])
    nt.links.new(sp.outputs[1], bs.inputs['Roughness']); nt.links.new(sp.outputs[2], bs.inputs['Metallic'])
    go = nt.nodes.new('ShaderNodeGroup'); go.node_tree = gltf_out_group(); nt.links.new(sp.outputs[0], go.inputs['Occlusion'])
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = bpy.data.images.load(normal, check_existing=True); tn.image.colorspace_settings.name = 'Non-Color'
    nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bs.inputs['Normal'])
    try: bs.inputs['Specular IOR Level'].default_value = 0.4
    except Exception: pass
    return m


FINAL = {tag: tex_mat(f'MK2_{tag}', *RES[tag]) for tag in RES}
for tag, names in GROUPS.items():
    for n in names:
        me = MESHES[n].data; me.materials.clear(); me.materials.append(FINAL[tag])
        for p in me.polygons: p.material_index = 0
# окно ГСН: простое тёмное стекло (окрашенный шейдер тянет в файл фотомаски CC0)
_wm = bpy.data.materials.get('MK2_window') or bpy.data.materials.new('MK2_window'); _wm.use_nodes = True
_bs = next(n for n in _wm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); _bs.inputs['Base Color'].default_value = (0.012, 0.015, 0.019, 1.0)
_bs.inputs['Roughness'].default_value = 0.05; _bs.inputs['Metallic'].default_value = 0.0
for _k, _v in (('Coat Weight', 1.0), ('Coat Roughness', 0.02), ('Specular IOR Level', 0.6)):
    try: _bs.inputs[_k].default_value = _v
    except Exception: pass
WINDOWO.data.materials.clear(); WINDOWO.data.materials.append(_wm)
for p in WINDOWO.data.polygons: p.material_index = 0
for m in list(bpy.data.materials):
    if m.users == 0: bpy.data.materials.remove(m)
log('bake2.py: готово', {k: [os.path.basename(p) for p in v] for k, v in RES.items()})
