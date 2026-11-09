# _данные.py - развёртка и данные для краски ОФАБ-250-270. После офаб.py в той же сессии:
#   OF_TEX=2048 blender -b --factory-startup --python офаб.py --python _данные.py
# Запекаются положение, нормаль, номер детали и материала, затенение 1,5 и 10 см, кромки; поля (margin) нет - их дорисовывает _краска.py.
import os, sys, time, math
import numpy as np
import bpy
HERE = '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/ОФАБ-250'; OUT = os.path.join(HERE, '_проба'); os.makedirs(OUT, exist_ok=True)
SIZE = int(os.environ.get('OF_TEX', '2048')); sc = bpy.context.scene; vl = bpy.context.view_layer; T0 = time.time()
objs = [o for o in sc.objects if o.type == 'MESH']
for o in objs: o.pass_index = {'body': 1, 'fuze': 2, 'lug_f': 3, 'lug_r': 3, 'tail': 4}.get(o.name, 5)
# развёртка: все детали в одно пространство
for o in sc.objects: o.select_set(False)
for o in objs: o.select_set(True)
vl.objects.active = objs[0]; bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(50), island_margin=0.006, area_weight=0.0, scale_to_bounds=False)
bpy.ops.uv.pack_islands(margin=0.004, rotate=True); bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'uv.blend'))
print(f'[{time.time() - T0:5.1f}] развёртка')
sc.render.engine = 'CYCLES'
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for d_ in pr.devices: d_.use = True
    sc.cycles.device = 'GPU'
except Exception as e: print('GPU нет', e)
sc.cycles.max_bounces = 0
img = bpy.data.images.new('OF_gb', SIZE, SIZE, alpha=True, float_buffer=True); img.colorspace_settings.name = 'Non-Color'
mats = [m for m in bpy.data.materials if m.name.startswith('ofab_') and m.users > 0]
MI = {'ofab_body': 0, 'ofab_fuze': 1, 'ofab_dark': 2}


def graph(kind, m):
    nt = m.node_tree; nodes, links = nt.nodes, nt.links
    for n in list(nodes): nodes.remove(n)
    out = nodes.new('ShaderNodeOutputMaterial'); em = nodes.new('ShaderNodeEmission'); links.new(em.outputs[0], out.inputs['Surface'])
    tx = nodes.new('ShaderNodeTexImage'); tx.image = img; nodes.active = tx; tx.select = True
    geo = nodes.new('ShaderNodeNewGeometry')
    if kind == 'pos': links.new(geo.outputs['Position'], em.inputs['Color'])
    elif kind == 'nor': links.new(geo.outputs['Normal'], em.inputs['Color'])
    elif kind == 'id':
        c = nodes.new('ShaderNodeCombineColor'); oi = nodes.new('ShaderNodeObjectInfo'); dv = nodes.new('ShaderNodeMath'); dv.operation = 'DIVIDE'; dv.inputs[1].default_value = 16.0
        links.new(oi.outputs['Object Index'], dv.inputs[0]); c.inputs[0].default_value = MI[m.name] / 8.0; links.new(dv.outputs[0], c.inputs[1]); c.inputs[2].default_value = 1.0; links.new(c.outputs[0], em.inputs['Color'])
    else:
        a1 = nodes.new('ShaderNodeAmbientOcclusion'); a1.samples = 16; a1.inputs['Distance'].default_value = 0.015
        a2 = nodes.new('ShaderNodeAmbientOcclusion'); a2.samples = 16; a2.inputs['Distance'].default_value = 0.10
        bev = nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.003; bev.samples = 8
        d = nodes.new('ShaderNodeVectorMath'); d.operation = 'DOT_PRODUCT'; links.new(bev.outputs['Normal'], d.inputs[0]); links.new(geo.outputs['Normal'], d.inputs[1])
        c = nodes.new('ShaderNodeCombineColor'); links.new(a1.outputs['AO'], c.inputs[0]); links.new(a2.outputs['AO'], c.inputs[1]); links.new(d.outputs['Value'], c.inputs[2]); links.new(c.outputs[0], em.inputs['Color'])


for kind, spp in (('pos', 1), ('nor', 1), ('id', 1), ('ao', 32)):
    for m in mats: graph(kind, m)
    sc.cycles.samples = spp
    bpy.ops.object.bake(type='EMIT', width=SIZE, height=SIZE, margin=0, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
    a = np.zeros(SIZE * SIZE * 4, np.float32); img.pixels.foreach_get(a); a = a.reshape(SIZE, SIZE, 4)
    np.save(os.path.join(OUT, f'gb_{kind}_{SIZE}.npy'), a[:, :, :3].astype(np.float32)); print(f'[{time.time() - T0:5.1f}]', kind, 'запечено', float(a[..., 0].min()), float(a[..., 0].max()))
print('ГОТОВО')
