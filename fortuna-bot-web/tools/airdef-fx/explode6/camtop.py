# Камера той же симуляции - сверху (взгляд вниз 88°), для листа «вид сверху» (Mark 2026-11-26: клубы, снятые сбоку, сверху читаются как столбы):
#   blender -b explode_<имя>.blend -P camtop.py -- <новый .blend>   (кэш симуляции тот же - путь в файле не меняется)
import bpy, sys, math
from mathutils import Vector
out = sys.argv[sys.argv.index('--') + 1]
sc = bpy.context.scene; c = sc.camera; G = 1 / float(sc.get('game_scale', 1))
dom = bpy.data.objects['Область']; z0 = dom.location.z - dom.dimensions.z / 2
tgt = Vector((0, 0, max(z0, 0.0) + 2.0 * G)); el = math.radians(88); d = 80 * G
c.location = tgt + Vector((0, -d * math.cos(el), d * math.sin(el))); c.rotation_euler = (tgt - c.location).to_track_quat('-Z', 'Y').to_euler()
c.data.ortho_scale *= 1.15  # сверху облако шире, чем выше
bpy.ops.wm.save_as_mainfile(filepath=out, copy=True); print('сверху', out, flush=True)
