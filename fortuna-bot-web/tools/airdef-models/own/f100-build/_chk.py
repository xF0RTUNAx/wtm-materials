import bpy, sys
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=sys.argv[-1])
print('ПРОВЕРКА', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'), 'граней,', [(i.name, i.size[0]) for i in bpy.data.images])
