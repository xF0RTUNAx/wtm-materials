# _проба.py - надевает краску на развёрнутую модель, снимает кадры Cycles и выгружает файл для стенда игры.
#   blender -b --factory-startup --python _проба.py -- [папка карт] [файл.glb] [--noshots]
import bpy, math, os, sys
from mathutils import Vector
HERE = '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/ОФАБ-250'; PR = HERE + '/_проба'
A_ = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
MAPS = A_[0] if len(A_) > 0 and not A_[0].startswith('--') else PR; GLB = A_[1] if len(A_) > 1 and not A_[1].startswith('--') else PR + '/ofab.glb'
bpy.ops.wm.open_mainfile(filepath=PR + '/uv.blend'); sc = bpy.context.scene
mp = bpy.data.materials.new('ofab_paint'); mp.use_nodes = True; nt = mp.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
out = nt.nodes.new('ShaderNodeOutputMaterial'); pb = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(pb.outputs[0], out.inputs['Surface'])
def tex(name, cs):
    im = bpy.data.images.load(os.path.join(MAPS, name), check_existing=False); im.colorspace_settings.name = cs; t = nt.nodes.new('ShaderNodeTexImage'); t.image = im; return t
tc, to, tn = tex('ofab_color.png', 'sRGB'), tex('ofab_orm.png', 'Non-Color'), tex('ofab_normal.png', 'Non-Color')
sp = nt.nodes.new('ShaderNodeSeparateColor'); nm = nt.nodes.new('ShaderNodeNormalMap'); nm.space = 'TANGENT'
nt.links.new(tc.outputs['Color'], pb.inputs['Base Color']); nt.links.new(to.outputs['Color'], sp.inputs[0]); nt.links.new(sp.outputs[1], pb.inputs['Roughness']); nt.links.new(sp.outputs[2], pb.inputs['Metallic'])
nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], pb.inputs['Normal'])
OBJS = [o for o in sc.objects if o.type == 'MESH']
for o in OBJS:
    o.data.materials.clear(); o.data.materials.append(mp)
bpy.ops.object.select_all(action='DESELECT')
for o in OBJS: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_normals=True, export_materials='EXPORT', export_yup=True, export_image_format='AUTO')
print('файл', GLB, os.path.getsize(GLB) // 1024, 'КБ')
if '--noshots' not in A_:
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 64
    try:
        p = bpy.context.preferences.addons['cycles'].preferences; p.compute_device_type = 'METAL'; p.get_devices(); [setattr(d, 'use', True) for d in p.devices]; sc.cycles.device = 'GPU'
    except Exception: pass
    w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.6, 0.66, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9; sc.world = w
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.0; so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so); so.rotation_euler = (math.radians(50), 0, math.radians(30))
    gm = bpy.data.meshes.new('g'); gm.from_pydata([(-4, -4, -0.2), (4, -4, -0.2), (4, 4, -0.2), (-4, 4, -0.2)], [], [(0, 1, 2, 3)]); g = bpy.data.objects.new('ground', gm); sc.collection.objects.link(g)
    gmt = bpy.data.materials.new('gm'); gmt.use_nodes = True; next(n for n in gmt.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (0.30, 0.34, 0.24, 1); gm.materials.append(gmt)
    cd = bpy.data.cameras.new('c'); cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam; sc.render.resolution_x, sc.render.resolution_y = 1400, 800
    sc.view_settings.view_transform = 'Standard'
    Y = lambda a: 0.74 - a
    for nm_, loc, tg, lens in (('как_01', (-1.5, 1.7, 1.35), (0, 0.05, 0), 45), ('бок_лево', (-2.4, 0.0, 0.25), (0, 0, 0), 38), ('бок_право', (2.4, 0.0, 0.25), (0, 0, 0), 38), ('нос', (-0.35, Y(-0.55), 0.25), (0, Y(0.05), 0), 45),
                               ('хвост', (-0.55, Y(1.95), 0.45), (0, Y(1.30), 0), 45), ('ушки', (-0.35, Y(0.25), 0.45), (0, Y(0.47), 0.15), 45), ('трафарет', (-0.9, Y(0.50), 0.10), (0, Y(0.50), 0), 45)):
        cam.data.lens = lens; cam.location = loc; cam.rotation_euler = (Vector(tg) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = f'{PR}/проба_{nm_}.png'; bpy.ops.render.render(write_still=True)
print('ПРОБА готова')
