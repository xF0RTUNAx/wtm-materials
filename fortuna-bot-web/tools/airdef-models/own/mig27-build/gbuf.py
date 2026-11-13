# gbuf.py - развёртка и данные для краски МиГ-23БН (из МиГ-21бис). После build.py: положение, нормаль, затенение, кромки и номера материалов каждой точки текстуры, сохраняются в _проба/.
# Поля (margin) в запекании нет: Blender наносит их по объектам, и поле следующего объекта затирает плотно уложенного соседа; поля дорисовывает paint.py.
# Краску считает paint.py уже без Blender, поэтому правка цвета не требует нового запекания. MG_TEX=2048|4096
import os, sys, json, time
import numpy as np
import bpy
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..', '_инструменты'))
import uv_mg, gpu_setup
SIZE = int(os.environ.get('MG_TEX', '2048')); OUT = os.path.join(HERE, '_проба'); os.makedirs(OUT, exist_ok=True)
sc = bpy.data.scenes['MG']; vl = bpy.context.view_layer; vl.update(); T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
info = uv_mg.run(sc, log); uv_mg.save(sc, os.path.join(OUT, 'uv.npz')); json.dump(info, open(os.path.join(OUT, 'uv.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
log('развёртка готова', round(info['atlas_m'], 2), 'м, плотность', round(0.985 * SIZE / info['atlas_m']), 'пикс/м')
objs = [o for o in sc.objects if o.type == 'MESH' and not o.name.endswith('_glass')]
# классы деталей для краски: 0 обшивка, 1 киль, 2 руль, 3 стабилизатор, 4 консоль, 5 закрылки/носок/интерцепторы, 6 щитки, 7 створки, 8 пилоны, 9 фонарь и рамы, 10 сопло, 11 кабина, 12 шасси, 13 гребень, 14 мелочь, 16 отбойники и контейнер парашюта (крашеные)
CLS = [('MG_skin', 0), ('fin_c', 1), ('rudder', 2), ('stab_', 3), ('wing_', 4), ('flap', 5), ('slat', 5), ('spoil', 5), ('brake', 6), ('door_', 7), ('pylon', 8), ('canopy', 9), ('det_wsframe', 9), ('nozzle', 10), ('det_cockpit', 11), ('gear', 12), ('ventral', 13), ('det_split', 16), ('det_chute', 16), ('chute_cap', 16), ('det_', 14)]
for o in objs: o.pass_index = next((c for p, c in CLS if o.name.startswith(p)), 15)
log('Cycles:', gpu_setup.use_gpu(sc))
if os.environ.get('MG_CPU'): sc.cycles.device = 'CPU'; log('считаю на процессоре: видеокарта занята')
try: sc.cycles.use_denoising = False
except Exception: pass
sc.cycles.max_bounces = 0
mats = [m for m in bpy.data.materials if m.name.startswith('MG_') and m.users > 0 and m.name != 'MG_glass']
IDX = {n: i for i, n in enumerate(['MG_skin', 'MG_metal', 'MG_dark', 'MG_glass', 'MG_tyre', 'MG_cock', 'MG_strap', 'MG_screen', 'MG_belt', 'MG_handle', 'MG_seam', 'MG_duct', 'MG_lens_r', 'MG_lens_g', 'MG_lens_w'])}
img = bpy.data.images.new('MG_gb', SIZE, SIZE, alpha=True, float_buffer=True); img.colorspace_settings.name = 'Non-Color'


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
    else:
        a1 = nodes.new('ShaderNodeAmbientOcclusion'); a1.samples = 12; a1.inputs['Distance'].default_value = 0.05
        a2 = nodes.new('ShaderNodeAmbientOcclusion'); a2.samples = 12; a2.inputs['Distance'].default_value = 0.45
        bev = nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.008; bev.samples = 6
        d = nodes.new('ShaderNodeVectorMath'); d.operation = 'DOT_PRODUCT'; links.new(bev.outputs['Normal'], d.inputs[0]); links.new(geo.outputs['Normal'], d.inputs[1])
        c = nodes.new('ShaderNodeCombineColor'); links.new(a1.outputs['AO'], c.inputs[0]); links.new(a2.outputs['AO'], c.inputs[1]); links.new(d.outputs['Value'], c.inputs[2]); links.new(c.outputs[0], em.inputs['Color'])


for o in vl.objects: o.select_set(False)
for o in objs: o.select_set(True)
vl.objects.active = objs[0]
for kind, spp in (('pos', 1), ('nor', 1), ('id', 1), ('ao', 24)):
    for m in mats: graph(kind, m)
    sc.cycles.samples = spp
    bpy.ops.object.bake(type='EMIT', width=SIZE, height=SIZE, margin=0, margin_type='EXTEND', use_selected_to_active=False, use_clear=True)
    a = np.zeros(SIZE * SIZE * 4, np.float32); img.pixels.foreach_get(a); a = a.reshape(SIZE, SIZE, 4)
    np.save(os.path.join(OUT, f'gb_{kind}_{SIZE}.npy'), a[:, :, :3].astype(np.float32)); log(kind, 'запечено', 'диапазон', float(a[:, :, 0].min()), float(a[:, :, 0].max()))
log('готово')
