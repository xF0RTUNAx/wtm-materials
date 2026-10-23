# Рендер кадров взрыва без окна (Cycles на видеокарте): blender -b <сцена.blend> -P render.py -- <папка> [клетка px = 512] [сэмплы = 64] [R игры]
# Кадры: первые 8 — каждый (вспышка и рост шара — доли секунды), дальше — через один. Пишет <кадр>.png (прозрачный фон) и info.json для sheet.js:
# fps, ortho — ширина кадра в метрах, anchor — где на кадре земля под зарядом (0…1 от левого верхнего угла), ref — радиус поражения игры, под который снят
import bpy, sys, os, json
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
out = a[0]; size = int(a[1]) if len(a) > 1 else 512; spp = int(a[2]) if len(a) > 2 else 64; ref = float(a[3]) if len(a) > 3 else 0
sc = bpy.context.scene; cam = sc.camera
sys.path.insert(0, os.path.expanduser('~/Downloads/Воздушное превосходство/Модели/Свои/_инструменты'))
import gpu_setup; print('Cycles:', gpu_setup.use_gpu(sc), flush=True)
sc.render.resolution_x = sc.render.resolution_y = size; sc.render.resolution_percentage = 100; sc.cycles.samples = spp
sc.render.film_transparent = True; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
frames = list(range(sc.frame_start, min(sc.frame_start + 8, sc.frame_end + 1))) + list(range(sc.frame_start + 9, sc.frame_end + 1, 2))
os.makedirs(out, exist_ok=True)
p = world_to_camera_view(sc, cam, Vector((0, 0, 0)))
json.dump({'fps': sc.render.fps, 'ortho': cam.data.ortho_scale, 'anchor': [round(p.x, 4), round(1 - p.y, 4)], 'ref': ref, 'frames': frames}, open(os.path.join(out, 'info.json'), 'w'))
for f in frames:
    fn = os.path.join(out, f'{f:03d}.png')
    if os.path.exists(fn): continue  # дорендер после остановки
    sc.frame_set(f); sc.render.filepath = fn; bpy.ops.render.render(write_still=True)
    print('кадр', f, flush=True)
print('готово', len(frames), flush=True)
