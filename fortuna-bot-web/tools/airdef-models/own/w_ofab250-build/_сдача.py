# _сдача.py - итоговые файлы ОФАБ-250-270: w_ofab250.glb (игра), ofab250.blend, ofab250_sketchfab.glb (High 4096) и Medium / Low, превью.
#   blender -b --factory-startup --python _сдача.py
import bpy, math, os, json
from mathutils import Vector
HERE = '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/ОФАБ-250'; PR = HERE + '/_проба'; MAPS = PR + '/4096'
bpy.ops.wm.open_mainfile(filepath=PR + '/uv.blend'); sc = bpy.context.scene
mp = bpy.data.materials.new('ofab_paint'); mp.use_nodes = True; nt = mp.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
out = nt.nodes.new('ShaderNodeOutputMaterial'); pb = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(pb.outputs[0], out.inputs['Surface'])
def tex(name, cs):
    im = bpy.data.images.load(os.path.join(MAPS, name), check_existing=False); im.colorspace_settings.name = cs; im.pack(); t = nt.nodes.new('ShaderNodeTexImage'); t.image = im; return t
tc, to, tn = tex('ofab_color.png', 'sRGB'), tex('ofab_orm.png', 'Non-Color'), tex('ofab_normal.png', 'Non-Color')
sp = nt.nodes.new('ShaderNodeSeparateColor'); nm = nt.nodes.new('ShaderNodeNormalMap'); nm.space = 'TANGENT'
nt.links.new(tc.outputs['Color'], pb.inputs['Base Color']); nt.links.new(to.outputs['Color'], sp.inputs[0]); nt.links.new(sp.outputs[1], pb.inputs['Roughness']); nt.links.new(sp.outputs[2], pb.inputs['Metallic'])
nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], pb.inputs['Normal'])
OBJS = [o for o in sc.objects if o.type == 'MESH']
for o in OBJS: o.data.materials.clear(); o.data.materials.append(mp)
for m in [m for m in bpy.data.materials if m.name.startswith('ofab_') and m is not mp]: bpy.data.materials.remove(m)
def export(path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in OBJS: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_normals=True, export_materials='EXPORT', export_yup=True, export_image_format='AUTO')
    print('файл', os.path.basename(path), os.path.getsize(path) // 1024, 'КБ')
export(HERE + '/w_ofab250.glb'); export(HERE + '/ofab250_sketchfab.glb')
bpy.ops.wm.save_as_mainfile(filepath=HERE + '/ofab250.blend')
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJS)
INFO = dict(tris=tris)
# превью
sc.render.engine = 'CYCLES'; sc.cycles.samples = 96
try:
    p = bpy.context.preferences.addons['cycles'].preferences; p.compute_device_type = 'METAL'; p.get_devices(); [setattr(d, 'use', True) for d in p.devices]; sc.cycles.device = 'GPU'
except Exception: pass
w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.6, 0.66, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9; sc.world = w
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.0; so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so); so.rotation_euler = (math.radians(50), 0, math.radians(30))
cd = bpy.data.cameras.new('c'); cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam; sc.render.resolution_x, sc.render.resolution_y = 1920, 1080; sc.view_settings.view_transform = 'Standard'
Y = lambda a: 0.74 - a; prev = []
for nm_, loc, tg, lens in (('превью_1_общий.png', (-1.5, 1.7, 1.15), (0, 0.05, 0), 45), ('превью_2_сбоку.png', (-2.6, 0.0, 0.15), (0, 0, 0), 38), ('превью_3_нос.png', (-0.40, Y(-0.55), 0.25), (0, Y(0.05), 0), 45), ('превью_4_хвост.png', (-0.55, Y(1.95), 0.45), (0, Y(1.30), 0), 45)):
    cam.data.lens = lens; cam.location = loc; cam.rotation_euler = (Vector(tg) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = HERE + '/' + nm_; bpy.ops.render.render(write_still=True); prev.append(nm_)
INFO['previews'] = prev
bpy.data.objects.remove(cam); bpy.data.objects.remove(so)
# облегчённые варианты для пакета: Medium - карты 2048; Low - карты 1024, корпус и хвост вдвое проще
for q, size, ratio in (('medium', 2048, 1.0), ('low', 1024, 0.5)):
    bpy.ops.wm.open_mainfile(filepath=HERE + '/ofab250.blend'); sc = bpy.context.scene; OBJS = [o for o in sc.objects if o.type == 'MESH']
    for im in bpy.data.images:
        if im.size[0] > size: im.scale(size, size)
    t = 0
    for o in OBJS:
        if ratio < 1 and o.name in ('body', 'tail'):
            m = o.modifiers.new('d', 'DECIMATE'); m.ratio = ratio; m.use_collapse_triangulate = True; bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='d')
        t += sum(len(p.vertices) - 2 for p in o.data.polygons)
    export(HERE + f'/ofab250_sketchfab_{q}.glb'); INFO[q + '_tris'] = t
json.dump(INFO, open(PR + '/сдача_инфо.json', 'w'), ensure_ascii=False)
print('СДАЧА', INFO)
