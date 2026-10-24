# Выгрузка GBU-12 (после build.py и bake.py, в той же сцене): gbu12.glb (все детали G12_*, атлас 1024), gbu12.blend, ПАСПОРТ.json (для основного чата /
# integrate-own.js: ключ, оружие, название, ревизия, файлы, tex/nTex) и ОТЧЁТ.json (размеры, блок sketchfab — для пакета).
import os, json, math
import bpy
from mathutils import Vector

HERE = '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/GBU-12'
LIVE = '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Стрела-1/_live'
sc = bpy.context.scene; vl = bpy.context.view_layer; INFO = []
def log(*a): INFO.append(' '.join(str(x) for x in a))

try:
    objs = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('G12_')]
    for o in vl.objects: o.select_set(False)
    for o in objs: o.hide_set(False); o.select_set(True)
    vl.objects.active = objs[0]
    glb = os.path.join(HERE, 'gbu12.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_materials='EXPORT', export_cameras=False, export_lights=False, export_normals=True)
    for o in objs: o.select_set(False)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
    lo = Vector((1e9,) * 3); hi = -lo
    for o in objs:
        for v in o.data.vertices: w = o.matrix_world @ v.co; lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    span = max(math.hypot((o.matrix_world @ v.co).x, (o.matrix_world @ v.co).z) for o in objs for v in o.data.vertices) * 2
    log('gbu12.glb %.2f МБ, треугольников %d; длина %.3f, Ø по рулям %.3f м' % (os.path.getsize(glb) / 1e6, tris, hi.y - lo.y, span))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'gbu12.blend'), check_existing=False, copy=True)
    P = {'key': 'w_gbu12', 'weapon': 'gbu12', 'name': 'GBU-12 Paveway II', 'rev': 1, 'tex': 512, 'nTex': 512,
         'files': {'glb': 'gbu12.glb', 'blend': 'gbu12.blend', 'build': ['build.py', 'bake.py', 'deliver.py']}}
    rp = os.path.join(HERE, 'ОТЧЁТ.json')
    R = json.load(open(rp, encoding='utf-8')) if os.path.exists(rp) else {}
    R.update({'name_en': 'GBU-12 Paveway II', 'rev': 1,
              'model': {'length_m': round(hi.y - lo.y, 3), 'span_m': round(span, 3), 'height_m': round(hi.z - lo.z, 3), 'tris': tris, 'file_mb': round(os.path.getsize(glb) / 1e6, 2)}})
    R.setdefault('notes', 'Собрана основным чатом (Opus) по просьбе Mark 2026-10-24 по трём его рендерам; окраска — по рендеру 1 (серый комплект, оливковый Mk 82).')
    json.dump(P, open(os.path.join(HERE, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(R, open(rp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    log('паспорт и отчёт записаны, gbu12.blend сохранён')
finally:
    open(os.path.join(LIVE, 'info.txt'), 'w', encoding='utf-8').write('\n'.join(INFO))
