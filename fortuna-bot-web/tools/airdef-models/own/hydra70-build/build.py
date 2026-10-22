# Hydra 70 (Mk 66 + M151) — подготовка сцены для ревизии 2 (текстуры): исходник _rev1/hydra70.blend (ревизия 1 — библиотечный файл: детали без сцены, света и камеры) →
# отдельная сцена «H70» только с деталями H70_* (сопло, кольцо оперения, маршевый двигатель, стык, боевая часть с жёлтым пояском, основание и сам взрыватель, три изогнутые лопасти с петлями). Форма не меняется.
# Запуск (фоновый Blender открывает исходник, затем скрипты по очереди):
#   H70_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b "<папка модели>/_rev1/hydra70.blend" --factory-startup --python build.py --python bake.py --python deliver.py
import sys, importlib
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
import bpy
import modelkit as mk; importlib.reload(mk)

keep = [o for o in bpy.data.objects if o.name.startswith('H70_') and o.type == 'MESH']
if not keep: raise SystemExit('в исходнике нет деталей H70_* — запускай с _rev1/hydra70.blend')
sc = bpy.data.scenes.new('H70'); col = bpy.data.collections.new('H70'); sc.collection.children.link(col)
for o in keep:
    for c in list(o.users_collection): c.objects.unlink(o)
    col.objects.link(o)
for s in list(bpy.data.scenes):
    if s is not sc: bpy.data.scenes.remove(s)
for o in list(bpy.data.objects):
    if o not in keep: bpy.data.objects.remove(o, do_unlink=True)
for me in list(bpy.data.meshes):
    if me.users == 0: bpy.data.meshes.remove(me)
for m in list(bpy.data.materials):
    if m.users == 0: bpy.data.materials.remove(m)
for c in list(bpy.data.collections):
    if c is not col and not c.objects and not c.children: bpy.data.collections.remove(c)
names = []
for o in keep:
    for m in o.data.materials:
        if m and m.name not in names: names.append(m.name)
mk.NAME, mk.sc, mk.col, mk.S, mk.X0, mk.RB = 'H70', sc, col, 1.0, 0.0, 0.035
mk.MATS = [bpy.data.materials[n] for n in names]
print('сцена H70: деталей', len(keep), '| материалы', names)
mk.stats()
