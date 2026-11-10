# _photomatch.py — рендер модели камерой фото (PM_POS, PM_TARGET, PM_ROLL°, PM_FOV° - из _pnp.py), прозрачный фон, линии Freestyle:
#   PM_OUT=<png> PM_W PM_H [поза HIM_EL / HIM_TURN / HIM_VAR] Blender -b --factory-startup --python _photomatch.py
# затем /usr/bin/python3 _overlay.py <фото> <рендер> <выход> - красные линии модели поверх фото
import os, math, bpy
from mathutils import Vector, Matrix
_p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
pos = Vector([float(x) for x in os.environ['PM_POS'].split(',')]); tgt = Vector([float(x) for x in os.environ['PM_TARGET'].split(',')])
fov = float(os.environ.get('PM_FOV', '40')); roll = float(os.environ.get('PM_ROLL', '0'))
W, H_ = int(os.environ.get('PM_W', '1024')), int(os.environ.get('PM_H', '768'))
cd = bpy.data.cameras.new('PM_cam'); cam = bpy.data.objects.new('PM_cam', cd); sc.collection.objects.link(cam); sc.camera = cam
cd.type = 'PERSP'; cd.sensor_fit = 'HORIZONTAL'; cd.angle = math.radians(fov); cd.clip_start, cd.clip_end = 0.05, 300
q = (tgt - pos).to_track_quat('-Z', 'Y'); fwd = (tgt - pos).normalized()
q = (Matrix.Rotation(math.radians(-roll), 4, fwd) @ q.to_matrix().to_4x4()).to_quaternion()
cam.location = pos; cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = q
sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.film_transparent = True; sc.render.image_settings.color_mode = 'RGBA'
sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'SINGLE'; sc.display.shading.single_color = (1.0, 1.0, 1.0)
sc.render.use_freestyle = True; sc.render.line_thickness_mode = 'ABSOLUTE'; sc.render.line_thickness = 1.2
vl = sc.view_layers[0]; vl.use_freestyle = True; fs = vl.freestyle_settings; fs.crease_angle = math.radians(40)
ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new('PM')
ls.select_silhouette = True; ls.select_crease = True; ls.select_border = True; ls.select_by_visibility = True; ls.visibility = 'VISIBLE'
ls.linestyle.color = (0, 0, 0); ls.linestyle.thickness = 1.2
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H_, 100
sc.render.image_settings.file_format = 'PNG'
poses = os.environ.get('PM_POSES')          # "el,turn,boom;el,turn,boom" - несколько поз за один запуск: <PM_OUT>_<номер>.png
if poses:
    for i, ps in enumerate(poses.split(';')):
        e, t, bm = [float(v) for v in ps.split(',')]; pose(e, t, bm, os.environ.get('HIM_VAR', 'gmlrs'))
        sc.render.filepath = os.environ['PM_OUT'].replace('.png', f'_{i}.png'); bpy.ops.render.render(write_still=True)
else:
    sc.render.filepath = os.environ['PM_OUT']; bpy.ops.render.render(write_still=True)
