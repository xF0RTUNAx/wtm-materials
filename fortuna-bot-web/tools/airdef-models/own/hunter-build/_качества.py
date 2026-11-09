# _качества.py - облегчённые варианты для пакета Sketchfab: Medium (текстуры 2048, шасси и кабина вдвое проще), Low (1024, вчетверо). Обшивку не упрощает: рвётся по швам.
# Blender -b --factory-startup --python _качества.py -- <вход.glb> <папка вывода>
import bpy, sys, os
a = sys.argv[sys.argv.index('--') + 1:]; SRC, OUT = a[0], a[1]
for nm, tex, ratio in (('Medium', 2048, 0.5), ('Low', 1024, 0.25)):
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=SRC)
    tot0 = tot1 = 0
    for o in bpy.context.scene.objects:
        if o.type != 'MESH': continue
        tot0 += sum(len(p.vertices) - 2 for p in o.data.polygons)
        if o.name.startswith(('gear', 'cockpit_int', 'det_')):
            m = o.modifiers.new('d', 'DECIMATE'); m.ratio = ratio; m.use_collapse_triangulate = True
            bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='d')
        tot1 += sum(len(p.vertices) - 2 for p in o.data.polygons)
    for im in bpy.data.images:
        if im.size[0] > tex: im.scale(tex, tex)
    f = os.path.join(OUT, f'hunter_sketchfab_{nm.lower()}.glb')
    bpy.ops.export_scene.gltf(filepath=f, export_format='GLB', export_image_format='AUTO')
    print('КАЧЕСТВО', nm, tex, 'тр.', tot0, '->', tot1, os.path.getsize(f) // 1024, 'КБ')
