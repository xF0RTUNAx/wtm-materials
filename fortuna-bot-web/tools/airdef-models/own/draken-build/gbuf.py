# gbuf.py - развёртка и данные для краски Saab J 35F Draken (по gbuf.py B-52H). После build.py: положение, нормаль, затенение, кромки и номера материалов каждой точки текстуры, сохраняются в _проба/.
# Поля (margin) в запекании нет: Blender наносит их по объектам, и поле следующего объекта затирает плотно уложенного соседа; поля дорисовывает paint.py.
# Краску считает paint.py уже без Blender, поэтому правка цвета не требует нового запекания. DR_TEX=2048|4096
import os, sys, json, time
import numpy as np
import bpy
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..', '_инструменты'))
import uv_dr, gpu_setup
SIZE = int(os.environ.get('DR_TEX', '2048')); OUT = os.path.join(HERE, '_проба'); os.makedirs(OUT, exist_ok=True)
sc = bpy.data.scenes['DR']; vl = bpy.context.view_layer; vl.update(); T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
info = uv_dr.run(sc, log); uv_dr.save(sc, os.path.join(OUT, 'uv.npz')); json.dump(info, open(os.path.join(OUT, 'uv.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
log('развёртка готова', round(info['atlas_m'], 2), 'м, плотность', round(0.985 * SIZE / info['atlas_m']), 'пикс/м')
objs = [o for o in sc.objects if o.type == 'MESH' and o.name not in ('canopy_glass', 'canopy')]
CLS = [('DR_skin', 0), ('fin_', 1), ('rudder', 2), ('brake_', 3), ('elev', 4), ('door_', 7), ('pylon_', 8), ('canopy_frame', 9), ('det_wsframe', 9), ('det_cockpit', 11), ('gear', 12), ('tank_', 14), ('det_', 15)]
for o in objs: o.pass_index = next((c for p, c in CLS if o.name.startswith(p)), 15)
log('Cycles:', gpu_setup.use_gpu(sc))
try: sc.cycles.use_denoising = False
except Exception: pass
sc.cycles.max_bounces = 0
mats = [m for m in bpy.data.materials if m.name.startswith('DR_') and m.users > 0 and m.name != 'DR_glass']
IDX = {n: i for i, n in enumerate(['DR_skin', 'DR_metal', 'DR_dark', 'DR_glass', 'DR_tyre', 'DR_cock', 'DR_strap', 'DR_screen', 'DR_belt', 'DR_handle', 'DR_seam', 'DR_duct', 'DR_lens_r', 'DR_lens_g', 'DR_lens_w'])}
BEV_R = float(os.environ.get('DR_BEV', '0.010'))
img = bpy.data.images.new('DR_gb', SIZE, SIZE, alpha=True, float_buffer=True); img.colorspace_settings.name = 'Non-Color'


def graph(kind, m):
    nt = m.node_tree; nodes, links = nt.nodes, nt.links
    for n in list(nodes): nodes.remove(n)
    out = nodes.new('ShaderNodeOutputMaterial'); em = nodes.new('ShaderNodeEmission'); links.new(em.outputs[0], out.inputs['Surface'])
    tx = nodes.new('ShaderNodeTexImage'); tx.image = img; nodes.active = tx; tx.select = True
    geo = nodes.new('ShaderNodeNewGeometry')
    if kind == 'pos': links.new(geo.outputs['Position'], em.inputs['Color'])
    elif kind == 'nor': links.new(geo.outputs['Normal'], em.inputs['Color'])
    elif kind == 'id':
        c = nodes.new('ShaderNodeCombineColor'); oi = nodes.new('ShaderNodeObjectInfo'); dv = nodes.new('ShaderNodeMath'); dv.operation = 'DIVIDE'; dv.inputs[1].default_value = 32.0
        links.new(oi.outputs['Object Index'], dv.inputs[0]); c.inputs[0].default_value = IDX[m.name] / 16.0; links.new(dv.outputs[0], c.inputs[1]); c.inputs[2].default_value = 1.0
        links.new(c.outputs[0], em.inputs['Color'])
    elif kind == 'bev':                                       # фаски в нормалях: кромки скруглены шейдером Bevel, печётся карта нормалей в касательном пространстве (правило 3)
        pb = nodes.new('ShaderNodeBsdfPrincipled'); bv = nodes.new('ShaderNodeBevel'); bv.inputs['Radius'].default_value = BEV_R; bv.samples = 8
        links.new(bv.outputs['Normal'], pb.inputs['Normal']); links.new(pb.outputs[0], out.inputs['Surface']); return
    else:
        a1 = nodes.new('ShaderNodeAmbientOcclusion'); a1.samples = 12; a1.inputs['Distance'].default_value = 0.05
        a2 = nodes.new('ShaderNodeAmbientOcclusion'); a2.samples = 12; a2.inputs['Distance'].default_value = 0.45
        bev = nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.008; bev.samples = 6
        d = nodes.new('ShaderNodeVectorMath'); d.operation = 'DOT_PRODUCT'; links.new(bev.outputs['Normal'], d.inputs[0]); links.new(geo.outputs['Normal'], d.inputs[1])
        c = nodes.new('ShaderNodeCombineColor'); links.new(a1.outputs['AO'], c.inputs[0]); links.new(a2.outputs['AO'], c.inputs[1]); links.new(d.outputs['Value'], c.inputs[2]); links.new(c.outputs[0], em.inputs['Color'])


for o in vl.objects: o.select_set(False)
for o in objs: o.select_set(True)
vl.objects.active = objs[0]
from mathutils import Matrix
GEAR = [o for o in objs if o.name.startswith(('gear', 'door_'))]     # и створки шасси: в файле самолёта их нет, обшивка под ними не должна темнеть
for kind, spp in (('pos', 1), ('nor', 1), ('id', 1), ('bev', 8), ('ao', 24)):
    if kind == 'ao':        # стойки в файле самолёта нет: на время затенения увести их на 100 м вниз, иначе под крылом тёмные пятна от тележек
        for o in GEAR: o.matrix_world = Matrix.Translation((0, 0, -100)) @ o.matrix_world
        vl.update()
    for m in mats: graph(kind, m)
    sc.cycles.samples = spp
    if kind == 'bev': bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', width=SIZE, height=SIZE, margin=0, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
    else: bpy.ops.object.bake(type='EMIT', width=SIZE, height=SIZE, margin=0, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
    a = np.zeros(SIZE * SIZE * 4, np.float32); img.pixels.foreach_get(a); a = a.reshape(SIZE, SIZE, 4)
    np.save(os.path.join(OUT, f'gb_{kind}_{SIZE}.npy'), a[:, :, :3].astype(np.float32)); log(kind, 'запечено', 'диапазон', float(a[:, :, 0].min()), float(a[:, :, 0].max()))
log('готово')
