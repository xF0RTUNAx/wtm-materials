# Витрина магазина (shop-ui.js): самолёт в особой окраске на прозрачном фоне (Cycles, GPU), 3/4 спереди-сверху, тёплый верхний свет «ночной стоянки».
#   Blender -b --factory-startup --python tools/airdef-models/shop-render.py -- <модель.glb> <окраска.png> <выход.png> [ширина высота сэмплы азимут подъём]
# Модель и окраска — из Свои/Камуфляжи/<ключ>/ (glb с новой развёрткой). Для витрины: 1920 1080 128 38 28, затем
#   ffmpeg -i out.png -vf scale=1600:900 a.png && cwebp -q 82 -alpha_q 90 a.png -o games/airdef/shop/<самолёт>_<окраска>.webp (и 384×216 → _s.webp)
import bpy, sys, math, mathutils

a = sys.argv[sys.argv.index('--') + 1:]
GLB, SKIN, OUT = a[0], a[1], a[2]
W, H, SPP = int(a[3]) if len(a) > 3 else 1920, int(a[4]) if len(a) > 4 else 1080, int(a[5]) if len(a) > 5 else 96
AZ, EL = float(a[6]) if len(a) > 6 else 38, float(a[7]) if len(a) > 7 else 24

sys.path.insert(0, '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/_инструменты')
import gpu_setup

sc = bpy.context.scene
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=GLB)
meshes = [o for o in sc.objects if o.type == 'MESH']

# окраска: картинку обычной окраски в текстурном материале меняем на особую
skin = bpy.data.images.load(SKIN)
swapped = 0
for m in bpy.data.materials:
    if not m.use_nodes: continue
    for n in m.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image is not None and n.image.name.endswith('_base'):  # кабина, компас — свои картинки, не трогаем
            n.image = skin; swapped += 1
print('окраска заменена в узлах:', swapped)

# рамка самолёта
mn = mathutils.Vector((1e9,) * 3); mx = mathutils.Vector((-1e9,) * 3)
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ mathutils.Vector(c)
        mn = mathutils.Vector(map(min, mn, w)); mx = mathutils.Vector(map(max, mx, w))
ctr = (mn + mx) / 2; size = (mx - mn).length

# камера: нос самолёта — +Y Блендера (−Z игры), азимут от носа к левому борту, подъём над горизонтом
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 70
az, el = math.radians(AZ), math.radians(EL)
d = mathutils.Vector((-math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))
cam.location = ctr + d * size * 1.62
cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()

# свет: тёплый сверху-спереди (фонарь стоянки), холодный контровой сзади, слабый заполняющий; мир — почти чёрный
def light(name, kind, energy, color, loc, size_=1.0):
    L = bpy.data.lights.new(name, kind); L.energy = energy; L.color = color
    if kind == 'AREA': L.size = size_
    o = bpy.data.objects.new(name, L); sc.collection.objects.link(o)
    o.location = ctr + mathutils.Vector(loc) * size
    o.rotation_euler = (ctr - o.location).to_track_quat('-Z', 'Y').to_euler()
light('key', 'AREA', 9000 * size * size / 300, (1.0, 0.86, 0.68), (-0.35, 0.45, 1.2), size * 0.6)
light('rim', 'AREA', 3600 * size * size / 300, (0.62, 0.74, 1.0), (0.9, -1.0, 0.45), size * 0.5)
light('fill', 'AREA', 1800 * size * size / 300, (0.9, 0.95, 1.0), (-1.2, 0.3, 0.1), size * 0.8)
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
bg = next(n for n in sc.world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (0.05, 0.055, 0.05, 1); bg.inputs[1].default_value = 0.6

print('Cycles:', gpu_setup.use_gpu(sc))
sc.cycles.samples = SPP; sc.cycles.use_denoising = True
sc.render.film_transparent = True
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('готово:', OUT)
