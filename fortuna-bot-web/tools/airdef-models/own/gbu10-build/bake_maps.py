# bake_maps.py - после build.py в том же Blender: развёртка и карты для покраски (положение, нормаль, зоны, кромки, AO, скруглённые кромки в нормалях). Покраска - отдельно: paint.py.
#   G10_OUT="<папка>" [G10_TEX=2048] [G10_AO=256] Blender -b --factory-startup --python build.py --python bake_maps.py   → _maps/*.npy, gbu10_work.blend
# AO считается с раскрытыми створками, иначе после раскрытия на пластинах остался бы тёмный отпечаток; контур сложенной створки рисует paint.py тонкой линией.
import bpy, os, sys, math, json, time
import numpy as np
from mathutils import Vector as V
HERE = os.environ.get('G10_OUT') or os.path.dirname(os.path.abspath(__file__)); MP = os.path.join(HERE, '_maps'); os.makedirs(MP, exist_ok=True)
TEX = int(os.environ.get('G10_TEX', '2048')); AOS = int(os.environ.get('G10_AO', '128'))
sys.path.insert(0, '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/_инструменты'); import gpu_setup
import modelkit as mk
PJ = json.load(open(os.path.join(MP, 'parts.json'))); sc = mk.sc; vl = bpy.context.view_layer
col = bpy.data.collections['GBU10']; objs = [o for o in col.objects if o.type == 'MESH']; mats = [bpy.data.materials['G10_' + n] for n in PJ['zones']]
for o in objs:
    for p in o.data.polygons: p.use_smooth = True
    uvm = o.data.uv_layers.new(name='UVMap'); o.data.uv_layers.active = uvm; uvm.active_render = True
for o in vl.objects: o.select_set(False)
for o in objs: o.select_set(True)
vl.objects.active = objs[0]
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=0.002); bpy.ops.object.mode_set(mode='OBJECT')
for o in objs:                                                                   # тела вращения: заранее заданные прямоугольные полосы
    me = o.data; st = me.attributes.get('strip'); pre = me.uv_layers['preuv']; uvm = me.uv_layers['UVMap']
    for p in me.polygons:
        if st.data[p.index].value:
            for li in p.loop_indices: uvm.data[li].uv = pre.data[li].uv
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.average_islands_scale(); bpy.ops.object.mode_set(mode='OBJECT')
# головка мелкая, а смотрят на неё вблизи: плотность текстуры выше
for o in objs:
    k = 1.5 if o.name == 'seeker' else 1.0
    if k != 1.0:
        for d in o.data.uv_layers['UVMap'].data: d.uv = d.uv * k
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.pack_islands(rotate=True, rotate_method='CARDINAL', margin_method='ADD', margin=16.0 / TEX, shape_method='CONCAVE'); bpy.ops.object.mode_set(mode='OBJECT')
k_in = 1.0 - 24.0 / TEX
for o in objs:
    for d in o.data.uv_layers.active.data: d.uv = (0.5 + (d.uv.x - 0.5) * k_in, 0.5 + (d.uv.y - 0.5) * k_in)
print('развёртка готова, объектов', len(objs))
print('Cycles:', gpu_setup.use_gpu(sc)); sc.render.engine = 'CYCLES'; sc.cycles.use_denoising = False; sc.cycles.max_bounces = 1; sc.view_settings.view_transform = 'Standard'; sc.render.bake.margin_type = 'EXTEND'
w = bpy.data.worlds.new('G10_w'); w.use_nodes = True; sc.world = w; next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND').inputs[0].default_value = (1, 1, 1, 1)
CUR = None


def setup(fn):
    for i, m_ in enumerate(mats):
        nt = m_.node_tree; nt.nodes.clear(); out_ = nt.nodes.new('ShaderNodeOutputMaterial'); fn(nt, i, out_); tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = bpy.data.images[CUR]; nt.nodes.active = tn; tn.select = True


def emit(nt, out_, c):
    e = nt.nodes.new('ShaderNodeEmission'); nt.links.new(c, e.inputs[0]); nt.links.new(e.outputs[0], out_.inputs[0])


def remap(nt, src, add, k):
    a = nt.nodes.new('ShaderNodeVectorMath'); a.operation = 'ADD'; nt.links.new(src, a.inputs[0]); a.inputs[1].default_value = (add, add, add); m_ = nt.nodes.new('ShaderNodeVectorMath'); m_.operation = 'SCALE'; nt.links.new(a.outputs[0], m_.inputs[0]); m_.inputs['Scale'].default_value = k; return m_.outputs[0]


def gray(nt, v):
    cc = nt.nodes.new('ShaderNodeCombineXYZ')
    for k in range(3): nt.links.new(v, cc.inputs[k])
    return cc.outputs[0]


def p_pos(nt, i, o): g = nt.nodes.new('ShaderNodeNewGeometry'); emit(nt, o, remap(nt, g.outputs['Position'], 3.0, 1 / 6))
def p_nrm(nt, i, o): g = nt.nodes.new('ShaderNodeNewGeometry'); emit(nt, o, remap(nt, g.outputs['Normal'], 1.0, 0.5))
def p_id(nt, i, o): cc = nt.nodes.new('ShaderNodeCombineXYZ'); [setattr(cc.inputs[k], 'default_value', (i + 1) / 32) for k in range(3)]; emit(nt, o, cc.outputs[0])


def p_ao(dist):
    def f(nt, i, o):
        a = nt.nodes.new('ShaderNodeAmbientOcclusion'); a.samples = 8; a.inputs['Distance'].default_value = dist; a.inputs['Color'].default_value = (1, 1, 1, 1); emit(nt, o, gray(nt, a.outputs[1]))
    return f


def p_edge(nt, i, o):
    g = nt.nodes.new('ShaderNodeNewGeometry'); bv = nt.nodes.new('ShaderNodeBevel'); bv.samples = 12; bv.inputs['Radius'].default_value = 0.005; d = nt.nodes.new('ShaderNodeVectorMath'); d.operation = 'DOT_PRODUCT'; nt.links.new(bv.outputs[0], d.inputs[0]); nt.links.new(g.outputs['True Normal'], d.inputs[1]); s_ = nt.nodes.new('ShaderNodeMath'); s_.operation = 'SUBTRACT'; s_.inputs[0].default_value = 1.0; nt.links.new(d.outputs['Value'], s_.inputs[1]); emit(nt, o, gray(nt, s_.outputs[0]))


def p_nt(nt, i, o):
    bv = nt.nodes.new('ShaderNodeBevel'); bv.samples = 12; bv.inputs['Radius'].default_value = 0.0030; pr = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(bv.outputs[0], pr.inputs['Normal']); nt.links.new(pr.outputs[0], o.inputs[0])


def bake(name, fn, spp, kind='EMIT', margin=0, chans=3, **kw):      # поля 0: при нескольких объектах поле следующего затирает края уже запечённых; поля считает paint.py
    global CUR
    im = bpy.data.images.new('m_' + name, TEX, TEX, alpha=True, float_buffer=True); im.colorspace_settings.name = 'Non-Color'; CUR = im.name
    im.pixels.foreach_set(np.zeros(TEX * TEX * 4, np.float32)); setup(fn); sc.cycles.samples = spp; t0 = time.time()
    bpy.ops.object.bake(type=kind, margin=margin, use_clear=False, **kw)
    a = np.empty(TEX * TEX * 4, np.float32); im.pixels.foreach_get(a); a = a.reshape(TEX, TEX, 4)[::-1]; np.save(os.path.join(MP, name + '.npy'), a[..., :chans].astype(np.float32)); print('карта', name, round(time.time() - t0, 1), 'с'); bpy.data.images.remove(im)


for o in vl.objects: o.select_set(False)
for o in objs: o.select_set(True)
vl.objects.active = objs[0]
bake('pos', p_pos, 4); bake('nrm', p_nrm, 4); bake('id0', p_id, 1, margin=0, chans=1); bake('idx', p_id, 1, chans=1)
bake('edge', p_edge, 24, chans=1); bake('nt', p_nt, 24, kind='NORMAL', normal_space='TANGENT')
# AO: створки раскрыты
A_ = lambda ph: V((-math.sin(math.radians(ph)), 0, math.cos(math.radians(ph))))
for i, ph in enumerate(PJ['phi']):
    o = bpy.data.objects[f'wing{i + 1}']; o.rotation_mode = 'AXIS_ANGLE'; ax = A_(ph); o.rotation_axis_angle = (math.radians(PJ['wing_open']), ax.x, ax.y, ax.z)
vl.update()
bake('aos', p_ao(0.028), AOS, chans=1); bake('aol', p_ao(0.45), AOS, chans=1)
for i in range(4):
    o = bpy.data.objects[f'wing{i + 1}']; o.rotation_axis_angle = (0, 0, 0, 1); o.rotation_mode = 'XYZ'
vl.update()
for o in objs:
    o.data.uv_layers.remove(o.data.uv_layers['preuv'])
    if 'strip' in o.data.attributes: o.data.attributes.remove(o.data.attributes['strip'])
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'gbu10_work.blend'), check_existing=False)
print('bake_maps.py: готово')
