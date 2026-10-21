# Рендер силуэтов модели в тех же размерах кадра, что чертежи (для наложения). Вызывается: exec, затем render_all()
import bpy, math
from mathutils import Vector

S = 3.896 / 1093.0
import os
OUT = os.environ.get('K29_OUT', '/tmp/kh29t-out')   # рабочая папка: в ней ref/ (чертежи) и out/ (рендеры)

def setup():
    sc = bpy.data.scenes['KH29T']
    try: bpy.context.window.scene = sc
    except Exception: pass
    # движок — Workbench (идентификатор читаем из списка)
    sc.render.engine = 'BLENDER_WORKBENCH'   # список движков в RNA неполный; значение принимается (проверено)
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.display.shading.light = 'FLAT'
    sc.display.shading.color_type = 'SINGLE'
    sc.display.shading.single_color = (1, 1, 1)
    try: sc.view_settings.view_transform = 'Standard'
    except Exception: pass
    cam = bpy.data.objects.get('K29_cam')
    if cam is None:
        cd = bpy.data.cameras.new('K29_cam'); cam = bpy.data.objects.new('K29_cam', cd)
        bpy.data.collections['KH29T'].objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.clip_start = 0.01; cam.data.clip_end = 50
    sc.camera = cam
    return sc, cam

def shot(name, loc, rot, w, h, ortho_w_px):
    sc, cam = setup()
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
    cam.data.ortho_scale = ortho_w_px * S          # по большей стороне кадра
    cam.location = loc; cam.rotation_euler = rot
    os.makedirs(f'{OUT}/out', exist_ok=True)
    sc.render.filepath = f'{OUT}/out/{name}.png'
    # камеру в кадре не показываем
    cam.hide_render = True
    bpy.ops.render.render(write_still=True, scene=sc.name)
    return sc.render.filepath

def render_all():
    out = []
    # вид сбоку со стороны −X: нос слева, как чертёж 4.png (1193×242, центр кадра x=596.5, y=121)
    yc = (604.0 - 596.5) * S; zc = (118.8 - 121.0) * S
    out.append(shot('m_side', (-6.0, yc, zc), (math.radians(90), 0, math.radians(-90)), 1193, 242, 1193))
    # вид сзади: камера на −Y смотрит на +Y; кадр 242×242, центр — ось; рядом с чертежом 1.png
    out.append(shot('m_rear', (0.0, -6.0, 0.0), (math.radians(90), 0, 0), 242, 242, 242))
    # вид спереди: камера на +Y смотрит на −Y; кадр 242×242; чертёж 3.png
    out.append(shot('m_front', (0.0, 6.0, 0.0), (math.radians(90), 0, math.radians(180)), 242, 242, 242))
    return out
