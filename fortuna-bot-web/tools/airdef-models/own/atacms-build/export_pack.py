# export_pack.py — ATACMS для общего пакета Sketchfab с HIMARS: полные атласы (корпус 2048, рули 1024), рули сложены.
#   ATA_OUT=<атласы> PACK_GLB=<куда> Blender -b --factory-startup --python export_pack.py
import os, bpy
os.environ.setdefault('ATA_REUSE', '1')
_here = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault('ATA_OUT', os.path.join(_here, '_ультра'))
_p = os.path.join(_here, 'bake2.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
for tag in RES:
    for n in [n for n in bpy.data.materials[f'ATA_{tag}'].node_tree.nodes if n.type == 'TEX_IMAGE']:
        im = n.image.copy(); s = 2048 if tag == 'B' else 1024; im.scale(s, s); n.image = im
pose(0.0); bpy.context.view_layer.update()
keep = [o for o in COL.objects if o.type == 'MESH']
for o in bpy.context.view_layer.objects: o.select_set(False)
for o in keep: o.select_set(True)
bpy.context.view_layer.objects.active = keep[0]
bpy.ops.export_scene.gltf(filepath=os.environ['PACK_GLB'], export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_materials='EXPORT',
                          export_image_format='JPEG', export_jpeg_quality=90, export_cameras=False, export_lights=False, export_animations=False)
print('PACK ATACMS готово', os.path.getsize(os.environ['PACK_GLB']))
