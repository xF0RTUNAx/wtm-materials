# Рендер кадров взрыва без окна (Cycles на видеокарте): blender -b <сцена.blend> -P render.py -- <папка> [клетка px = 512] [сэмплы = 96] [R игры]
# Кадры: первые 8 — каждый (вспышка и рост шара — доли секунды), до 3 с — через один, дальше — через три. Пишет <кадр>.png (прозрачный фон) и info.json для sheet.js:
# fps, ortho — ширина кадра в метрах, anchor — где на кадре земля под зарядом (0…1 от левого верхнего угла), ref — радиус поражения игры, под который снят
import bpy, sys, os, json
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
out = a[0]; size = int(a[1]) if len(a) > 1 else 512; spp = int(a[2]) if len(a) > 2 else 96; ref = float(a[3]) if len(a) > 3 else 0
sc = bpy.context.scene; cam = sc.camera
sys.path.insert(0, os.path.expanduser('~/Downloads/Воздушное превосходство/Модели/Свои/_инструменты'))
import gpu_setup; print('Cycles:', gpu_setup.use_gpu(sc), flush=True)
burn = 'Очаг' in bpy.data.objects  # пожар: кадр 1:2 (как в сцене), петля из установившегося участка
if burn: sc.render.resolution_x, sc.render.resolution_y = size // 2, size
else: sc.render.resolution_x = sc.render.resolution_y = size
sc.render.resolution_percentage = 100; sc.cycles.samples = spp
sc.render.film_transparent = True; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
# цвет пламени (2026-10-23, Mark: «низ взрыва слишком красный»): ядро бело-жёлтое → оранжевое → бурое у краёв; свечение ∝ пламя^1,3 —
# слабое пламя по краям шара (остывающий газ) светится слабее и не насыщенно-красным (в игре такие пиксели ещё и усиливаются как «горячие»);
# ^1,8 гасило и сам шар — он был виден 1–2 кадра
dom = bpy.data.objects.get('Область'); nt = dom.active_material.node_tree if dom and dom.active_material else None
if nt and not any(n.label == 'Пламя: кривая' for n in nt.nodes):
    cr = next(n for n in nt.nodes if n.label == 'Пламя: цвет').color_ramp
    while len(cr.elements) > 1: cr.elements.remove(cr.elements[-1])
    cr.elements[0].position = 0.0; cr.elements[0].color = (0.14, 0.05, 0.012, 1)
    # пожар — горящее топливо: верх шкалы оранжево-жёлтый (белый — накал взрыва; у пожара ядро светилось белым диском)
    top = ((0.25, (0.75, 0.28, 0.05)), (0.6, (1.0, 0.55, 0.14)), (1.0, (1.0, 0.8, 0.42))) if burn else ((0.25, (0.72, 0.26, 0.05)), (0.55, (1.0, 0.6, 0.16)), (1.0, (1.0, 0.94, 0.74)))
    for pos, col in top: e = cr.elements.new(pos); e.color = (*col, 1)
    at = next(n for n in nt.nodes if n.label == 'Пламя'); mul = next(n for n in nt.nodes if n.label == 'Пламя: сила')
    pw = nt.nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 1.3; pw.label = 'Пламя: кривая'
    for l in list(nt.links):
        if l.to_node == mul: nt.links.remove(l)
    nt.links.new(at.outputs['Fac'], pw.inputs[0]); nt.links.new(pw.outputs['Value'], mul.inputs[0]); mul.inputs[1].default_value = 9.0 if burn else 30.0  # пожар — оранжевое пламя, не раскалённая вспышка
sc.cycles.sample_clamp_indirect = 0.5  # белые точки («светлячки») в дыме
# взрыв: первые 8 кадров — каждый (вспышка), до 3 с — через один, дальше — через три (облако движется медленно; в игре кадры смешиваются); пожар — последние 5 с (установившийся столб — петля)
frames = list(range(sc.frame_end - 118, sc.frame_end + 1, 2)) if burn else list(range(1, 9)) + list(range(10, min(73, sc.frame_end + 1), 2)) + list(range(76, sc.frame_end + 1, 4))
os.makedirs(out, exist_ok=True)
p = world_to_camera_view(sc, cam, Vector((0, 0, 0)))
gs = float(sc.get('game_scale', 1))  # сцена меньше игровой (пожар, scene.py): кадр в метрах × gs, время × √gs (подобие по Фруду)
json.dump({'fps': sc.render.fps / gs ** 0.5, 'ortho': cam.data.ortho_scale * gs, 'anchor': [round(p.x, 4), round(1 - p.y, 4)], 'ref': ref, 'frames': frames, 'loop': 12 if burn else 0, 'aspect': 0.5 if burn else 1}, open(os.path.join(out, 'info.json'), 'w'))
for f in frames:
    fn = os.path.join(out, f'{f:03d}.png')
    if os.path.exists(fn): continue  # дорендер после остановки
    sc.frame_set(f); sc.render.filepath = fn; bpy.ops.render.render(write_still=True)
    print('кадр', f, flush=True)
print('готово', len(frames), flush=True)
