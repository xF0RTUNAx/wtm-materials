# bake2.py — запекание HIMARS, «ультра» (Mark 2026-11-10): процедурная окраска _paint.py с фотомасками CC0 → атласы
#   цвет (sRGB), ORM (R - затенение AO, G - шероховатость, B - металл; как glTF), нормали - с детальной копии (фаски на всех кромках, модификатор Bevel) на рабочую сетку.
# Мелочь (отдельные куски меньше DET_MIN по диагонали: болты, планки, петли, ручки) вынесена в объекты det_<имя> (дети своих объектов, двигаются с ними)
# и печётся в свой атлас D - крупные панели получают всю плотность своих атласов.
# Атласы: A - кабина, оборудование, основание, платформа, люк, корпуса цилиндров (4096); F - рама, бампер, антенны (4096); B - клетка, стрела, контейнер GMLRS,
#   крышки, штоки (4096); T - контейнер ATACMS с крышками (2048); W - одно колесо, развёртка на все шесть (2048); D - мелочь (4096).
#   HIM_OUT="<папка>" [HIM_TEX=4096] [HIM_PAINT=олива] [HIM_HIGH=0 - без детальной копии] Blender -b --factory-startup --python bake2.py
import os, sys, math, time
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix

H_ = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/HIMARS'
OUT = os.environ.get('HIM_OUT') or H_
SIZE = int(os.environ.get('HIM_TEX', '4096')); SAMPLES = int(os.environ.get('HIM_BAKE_SAMPLES', '24')); REUSE = os.environ.get('HIM_REUSE', '0') == '1'
HIGH = os.environ.get('HIM_HIGH', '1') == '1'; DET_MIN = float(os.environ.get('HIM_DET_MIN', '0.16'))
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
for f in ('build.py', '_paint.py'):
    _p = os.path.join(H_, f); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
sys.path.insert(0, os.path.join(H_, '..', '_инструменты')); import gpu_setup
if bpy.context.window: bpy.context.window.scene = sc
sc.render.engine = 'CYCLES'; log('Cycles:', gpu_setup.use_gpu(sc)); sc.cycles.samples = SAMPLES
sc.render.bake.margin = 8; sc.render.bake.margin_type = 'EXTEND'
if not sc.world: sc.world = bpy.data.worlds.new('HIM_bakeworld')
sc.world.light_settings.distance = 0.5                                                           # AO: полметра - щели, углы, под навесами
VAR = os.environ.get('HIM_PAINT', 'олива'); pose(0.0, 0.0, 0.0); bpy.context.view_layer.update()
apply_paint(VARIANTS[VAR], 1); log('окраска:', VAR)


def apply_mods(o):
    if not o.modifiers: return
    dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = o.data; o.modifiers.clear(); o.data = me; bpy.data.meshes.remove(old)


MESHES = {o.name: o for o in COL.objects if o.type == 'MESH'}
for o in MESHES.values(): apply_mods(o)


# ───────────── мелочь в отдельные объекты det_<имя> ─────────────
def split_small(o):
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    seen, small = set(), []
    for f in bm.faces:
        if f.index in seen: continue
        stack, comp = [f], []; seen.add(f.index)
        while stack:
            x = stack.pop(); comp.append(x.index)
            for e in x.edges:
                for nf in e.link_faces:
                    if nf.index not in seen: seen.add(nf.index); stack.append(nf)
        vs = {v.index for i in comp for v in bm.faces[i].verts}; cs = [bm.verts[i].co for i in vs] if False else None
        bm.verts.ensure_lookup_table(); co = [bm.verts[i].co for i in vs]
        mn = Vector((min(c.x for c in co), min(c.y for c in co), min(c.z for c in co))); mx = Vector((max(c.x for c in co), max(c.y for c in co), max(c.z for c in co)))
        if (mx - mn).length < DET_MIN: small += comp
    if not small or len(small) == len(bm.faces): bm.free(); return None
    keep = set(small)
    bm2 = bm.copy(); bm2.faces.ensure_lookup_table()
    bmesh.ops.delete(bm2, geom=[f for f in bm2.faces if f.index not in keep], context='FACES')
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index in keep], context='FACES')
    bm.to_mesh(o.data); bm.free()
    me2 = bpy.data.meshes.new('det_' + o.name); bm2.to_mesh(me2); bm2.free()
    for m in o.data.materials: me2.materials.append(m)
    d = bpy.data.objects.new('det_' + o.name, me2)
    for c in o.users_collection: c.objects.link(d)
    d.parent = o; d.matrix_parent_inverse = Matrix.Identity(4); d.matrix_basis = Matrix.Identity(4)
    if 'him_id' in o: d['him_id'] = o['him_id']
    return d


NOSPLIT = ('wheel_', 'lid_', 'ant_', 'cyl_rod')
DETS = {}
for n, o in list(MESHES.items()):
    if n.startswith(NOSPLIT): continue
    d = split_small(o)
    if d: DETS[d.name] = d
MESHES.update(DETS); bpy.context.view_layer.update()
log('мелочь:', {k: len(v.data.polygons) for k, v in DETS.items()})

WHEELS = sorted(n for n in MESHES if n.startswith('wheel_'))
GROUPS = {'F': ['body_frame', 'ant_l', 'ant_r'],
          'B': ['pod', 'boom', 'pod_gmlrs', 'cyl_rod_l', 'cyl_rod_r'] + [n for n in MESHES if n.startswith(('lid_fG', 'lid_rG'))],
          'T': ['pod_atacms', 'lid_fA', 'lid_rA'],
          'W': ['wheel_2l'],
          'D': sorted(d for d in DETS if not d.startswith('det_sk_')),
          'S': sorted(n for n in MESHES if n.startswith(('sk_', 'det_sk_')))}                      # rev 2: оснастка только для Sketchfab - свой атлас
GROUPS['A'] = [n for n in MESHES if n not in WHEELS and not any(n in v for v in GROUPS.values())]
SIZES = {'A': SIZE, 'F': SIZE, 'B': SIZE, 'T': SIZE // 2, 'W': SIZE // 2, 'D': SIZE, 'S': SIZE // 2}
HIDE = {'B': ['pod_atacms', 'det_pod_atacms', 'lid_fA', 'lid_rA'], 'T': ['pod_gmlrs', 'det_pod_gmlrs'] + [n for n in MESHES if n.startswith(('lid_fG', 'lid_rG'))]}
log('группы:', {k: len(v) for k, v in GROUPS.items()})


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
    bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, margin_method='ADD', margin=12.0 / size)
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
    """детальная копия: фаска 6 мм в 3 сегмента по кромкам острее 30°, сглаживание, взвешенные нормали"""
    me = o.data.copy(); hi = bpy.data.objects.new(o.name + '_HI', me); sc.collection.objects.link(hi); hi.matrix_world = o.matrix_world.copy()
    for p in me.polygons: p.use_smooth = True
    if 'sharp_edge' in me.attributes: me.attributes.remove(me.attributes['sharp_edge'])
    bv = hi.modifiers.new('bev', 'BEVEL'); bv.width = 0.006; bv.segments = 3; bv.limit_method = 'ANGLE'; bv.angle_limit = math.radians(30); bv.use_clamp_overlap = True
    try: bv.harden_normals = False
    except Exception: pass
    wn = hi.modifiers.new('wn', 'WEIGHTED_NORMAL'); wn.keep_sharp = False; wn.weight = 50
    return hi


def bake(objs, mats, img, mode):
    p = os.path.join(OUT, img.name + '.png')
    if REUSE and os.path.exists(p): log('взято готовое', img.name); return p
    target(mats, img, mode); t = time.time()
    if mode == 'normal' and HIGH:
        for k, o in enumerate(objs):
            hi = make_high(o); bpy.context.view_layer.update(); sel([hi, o], active=o)
            bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', use_selected_to_active=True, cage_extrusion=0.012, max_ray_distance=0.04, margin=8, use_clear=(k == 0))
            bpy.data.objects.remove(hi, do_unlink=True)
    else:
        sel(objs)
        if mode == 'normal': bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', margin=8, use_clear=True)
        elif mode == 'ao': bpy.ops.object.bake(type='AO', margin=8, use_clear=True)
        else: bpy.ops.object.bake(type='EMIT', margin=8, use_clear=True)
    img.filepath_raw = p; img.file_format = 'PNG'; img.save(); log('запечено', img.name, '%.0f с' % (time.time() - t))
    return p


def orm(tag, ao_p, r_p, m_p, size):
    """R - затенение, G - шероховатость, B - металл (glTF)"""
    out = os.path.join(OUT, f'him_{tag}_orm.png')
    if REUSE and os.path.exists(out): return out
    ch = []
    for p in (ao_p, r_p, m_p):
        im = bpy.data.images.load(p, check_existing=False); im.colorspace_settings.name = 'Non-Color'
        a = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4)[:, :, 0]; ch.append(a); bpy.data.images.remove(im)
    o = bpy.data.images.new(f'him_{tag}_orm', size, size, alpha=False); o.colorspace_settings.name = 'Non-Color'
    px = np.ones((size, size, 4), dtype=np.float32); px[:, :, 0] = 0.25 + 0.75 * ch[0]; px[:, :, 1] = ch[1]; px[:, :, 2] = ch[2]   # затенение не глубже 0,25
    o.pixels[:] = px.ravel(); o.filepath_raw = out; o.file_format = 'PNG'; o.save(); bpy.data.images.remove(o)
    return out


RES = {}
TAGS = [t for t in os.environ.get('HIM_TAGS', '').split(',') if t]               # параллельно: каждый процесс печёт свои атласы, потом общий проход с HIM_REUSE=1
for tag in ('A', 'F', 'B', 'T', 'W', 'D', 'S'):
    if TAGS and tag not in TAGS: continue
    for o in MESHES.values(): o.hide_render = False
    for n in HIDE.get(tag, []):
        if n in MESHES: MESHES[n].hide_render = True
    objs = [MESHES[n] for n in GROUPS[tag] if n in MESHES]; size = SIZES[tag]
    unwrap(objs, size); log('развёртка', tag, len(objs))
    mats = copies(objs, tag)
    c = bake(objs, mats, new_img(f'him_{tag}_color', size), 'color')
    r = bake(objs, mats, new_img(f'him_{tag}_rough', size // 2, True), 'rough')
    m = bake(objs, mats, new_img(f'him_{tag}_metal', size // 2, True), 'metal')
    a = bake(objs, mats, new_img(f'him_{tag}_ao', size // 2, True), 'ao')
    n_ = bake(objs, mats, new_img(f'him_{tag}_normal', size, True), 'normal')
    RES[tag] = (c, orm(tag, a, r, m, size // 2), n_)
if TAGS:
    log('bake2.py: атласы готовы', TAGS); import sys as _s; _s.exit(0)
for o in MESHES.values(): o.hide_render = False
src_uv = MESHES['wheel_2l'].data.uv_layers.active                                                   # колёса: одна развёртка на все шесть
for n in WHEELS:
    if n == 'wheel_2l': continue
    me = MESHES[n].data
    while me.uv_layers: me.uv_layers.remove(me.uv_layers[0])
    uv = me.uv_layers.new(name='UVMap')
    for a_, b_ in zip(uv.data, src_uv.data): a_.uv = b_.uv
GROUPS['W'] = WHEELS


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


FINAL = {tag: tex_mat(f'HIM_{tag}', *RES[tag]) for tag in RES}
KEEP_GLASS_IN_ATLAS = True
GLASS = bpy.data.materials.new('HIM_glassF'); GLASS.use_nodes = True
gb = next(n for n in GLASS.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); gb.inputs['Base Color'].default_value = (0.02, 0.024, 0.024, 1); gb.inputs['Roughness'].default_value = 0.05
gb.inputs['Metallic'].default_value = 0.3; GLASS.diffuse_color = (0.02, 0.024, 0.024, 1)
for tag, names in GROUPS.items():
    for n in names:
        if n not in MESHES: continue
        me = MESHES[n].data; gi = [i for i, sl in enumerate(MESHES[n].material_slots) if sl.material and sl.material.name.split('.')[0] == 'HIM_glass']
        glass = [p.index for p in me.polygons if p.material_index in gi]
        me.materials.clear(); me.materials.append(FINAL[tag]); me.materials.append(GLASS)
        for p in me.polygons: p.material_index = 0
        for i in glass: me.polygons[i].material_index = 0 if KEEP_GLASS_IN_ATLAS else 1   # rev 2: стёкла из атласа - пыль и дуги дворников доходят до игры
for m in list(bpy.data.materials):
    if m.users == 0: bpy.data.materials.remove(m)
log('bake2.py: готово', {k: [os.path.basename(p) for p in v] for k, v in RES.items()})
