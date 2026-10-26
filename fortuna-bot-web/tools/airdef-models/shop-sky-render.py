# Витрина магазина (shop-ui.js), вариант «в небе» (Mark 2026-10-26: «чтобы не бросалась в глаза процедурная работа»): самолёт в особой окраске в крене
# на фоне настоящего неба — фото-панорамы HDRI (Poly Haven, CC0; ~/Downloads/Воздушное превосходство/Магазин/небо). Свет — от самой панорамы (солнце
# поворачивается к камере, чтобы окраска была освещена) и слабый заполняющий от камеры. Два слоя с одной точки: самолёт на прозрачном фоне (объектив
# длиннее) и небо без самолёта (объектив шире — панорама 8K остаётся чёткой); игра кладёт самолёт поверх неба.
#   Blender -b --factory-startup --python tools/airdef-models/shop-sky-render.py -- <модель.glb> <окраска.png> <небо.hdr> <выход без расширения> [ключ=значение …]
#   ключи: az (азимут камеры от носа к левому борту, °), el (подъём камеры, °), roll (крен к камере, °), pitch (тангаж, °), sun (солнце от камеры по азимуту, °),
#   sky (яркость неба — свет на самолёт), fill (заполняющий свет), exp / skyexp (экспозиция слоя самолёта / неба), skyup (насколько поднять взгляд
#   камеры неба, °: под горизонтом у «чистого» неба только размытое отражение — Mark: «много места занимает размытая часть»), lens, w, h, spp
import bpy, sys, math, mathutils
import numpy as np

a = sys.argv[sys.argv.index('--') + 1:]
GLB, SKIN, HDR, OUT = a[:4]
P = dict(az=34, el=4, roll=-38, pitch=6, sun=55, sky=1.0, fill=0.35, exp=0.0, skyexp=-1.2, skyup=29, lens=62, w=1920, h=1080, spp=128)
for kv in a[4:]:
    k, v = kv.split('='); P[k] = float(v)

sys.path.insert(0, '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/_инструменты')
import gpu_setup

sc = bpy.context.scene
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=GLB)
meshes = [o for o in sc.objects if o.type == 'MESH']
skin = bpy.data.images.load(SKIN)
for m in bpy.data.materials:
    if m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image is not None and n.image.name.endswith('_base'): n.image = skin  # кабина, компас — свои картинки

# самолёт — под общий корень: крен вокруг продольной оси (нос — +Y), тангаж
root = bpy.data.objects.new('plane', None); sc.collection.objects.link(root)
for o in sc.objects:
    if o.parent is None and o is not root: o.parent = root
mn = mathutils.Vector((1e9,) * 3); mx = mathutils.Vector((-1e9,) * 3)
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ mathutils.Vector(c); mn = mathutils.Vector(map(min, mn, w)); mx = mathutils.Vector(map(max, mx, w))
ctr = (mn + mx) / 2; size = (mx - mn).length
root.location = -ctr
pivot = bpy.data.objects.new('pivot', None); sc.collection.objects.link(pivot); root.parent = pivot
pivot.rotation_mode = 'YXZ'; pivot.rotation_euler = (math.radians(P['pitch']), math.radians(P['roll']), 0)
bpy.context.view_layer.update()

# камера: азимут от носа к левому борту, небольшой подъём — за самолётом небо, а не «зеркальный» низ панорамы
az, el = math.radians(P['az']), math.radians(P['el'])
d = mathutils.Vector((-math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.location = d * size * 1.62 * P['lens'] / 70
cam.rotation_euler = (-cam.location).to_track_quat('-Z', 'Y').to_euler()

# небо: солнце панорамы (самая яркая точка) поворачиваем к камере на P['sun']° по азимуту, чтобы окраска была освещена
sc.world = bpy.data.worlds.new('sky'); sc.world.use_nodes = True
nt = sc.world.node_tree; bg = next(n for n in nt.nodes if n.type == 'BACKGROUND')
env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(HDR)
mp = nt.nodes.new('ShaderNodeMapping'); tc = nt.nodes.new('ShaderNodeTexCoord')
nt.links.new(tc.outputs['Generated'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], env.inputs['Vector']); nt.links.new(env.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = P['sky']
small = env.image.copy(); small.scale(512, 256)
px = np.empty(512 * 256 * 4, dtype=np.float32); small.pixels.foreach_get(px); px = px.reshape(256, 512, 4)
lum = px[..., 0] * 0.2126 + px[..., 1] * 0.7152 + px[..., 2] * 0.0722
iy, ix = np.unravel_index(np.argmax(lum[128:]), lum[128:].shape); iy += 128   # верхняя половина (строки снизу вверх)
u, v = (ix + 0.5) / 512, (iy + 0.5) / 256
sun_lon = (0.5 - u) * 2 * math.pi; sun_lat = (v - 0.5) * math.pi            # Blender: долгота = atan2(y, x)
cam_lon = math.atan2(d.y, d.x)
want = cam_lon + math.radians(P['sun'])
mp.inputs['Rotation'].default_value[2] = sun_lon - want                      # поворот панорамы вокруг Z: солнце — на нужном азимуте
print(f'солнце панорамы: долгота {math.degrees(sun_lon):.0f}°, высота {math.degrees(sun_lat):.0f}°; поворот {math.degrees(sun_lon - want):.0f}°')

# заполняющий свет от камеры — чуть-чуть, чтобы тень на окраске не проваливалась в чёрное
if P['fill'] > 0:
    L = bpy.data.lights.new('fill', 'AREA'); L.energy = 2500 * P['fill'] * size * size / 300; L.size = size * 0.8; L.color = (1, 0.97, 0.94)
    lo = bpy.data.objects.new('fill', L); sc.collection.objects.link(lo); lo.location = cam.location * 1.1 + mathutils.Vector((0, 0, size * 0.3))
    lo.rotation_euler = (-lo.location).to_track_quat('-Z', 'Y').to_euler()

print('Cycles:', gpu_setup.use_gpu(sc))
sc.cycles.use_denoising = True
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Punchy'
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'

# слой 1: самолёт на прозрачном фоне
cam.data.lens = P['lens']
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = int(P['w']), int(P['h']), 100
sc.cycles.samples = int(P['spp']); sc.render.film_transparent = True; sc.view_settings.exposure = P['exp']
sc.render.filepath = OUT + '_plane.png'; bpy.ops.render.render(write_still=True)

# слой 2: небо без самолёта, шире и крупнее — фон на весь экран
for o in meshes: o.hide_render = True
cam.data.lens = 24
cam.matrix_world = cam.matrix_world @ mathutils.Matrix.Rotation(math.radians(P['skyup']), 4, 'X')  # взгляд вверх: горизонт — у нижнего края, кадр — облака
sc.render.resolution_x, sc.render.resolution_y = 2560, 1440
sc.cycles.samples = 16; sc.render.film_transparent = False; sc.view_settings.exposure = P['skyexp']  # панорама ярче, чем её превью: без поправки небо белёсое
sc.render.image_settings.color_mode = 'RGB'
sc.render.filepath = OUT + '_sky.png'; bpy.ops.render.render(write_still=True)
print('готово:', OUT)
