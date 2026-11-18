# _views.py — быстрые кадры формы 3М14 (Workbench) → _проба/
import bpy, os, math
from mathutils import Vector
HD = os.path.dirname(os.path.abspath(__file__)); _p = os.path.join(HD, 'build.py'); __file__ = _p
exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
OUT = os.path.join(HD, '_проба'); os.makedirs(OUT, exist_ok=True)
sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'MATERIAL'; sh.show_cavity = True
w = bpy.data.worlds.new('W'); sc.world = w; w.color = (0.75, 0.78, 0.82)
cam = bpy.data.objects.new('C', bpy.data.cameras.new('C')); COL.objects.link(cam); sc.camera = cam
def shot(name, pos, tgt, lens=None, ortho=None, res=(1600, 900)):
    cam.location = Vector(pos); cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    if ortho: cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else: cam.data.type = 'PERSP'; cam.data.lens = lens
    sc.render.resolution_x, sc.render.resolution_y = res; sc.render.filepath = os.path.join(OUT, name + '.png'); bpy.ops.render.render(write_still=True)
shot('k1_34', (-3.5, 4.5, 2.2), (0, 0, 0), lens=35)
shot('k2_сбоку', (-20, 0, 0), (0, 0, 0), ortho=6.8)
shot('k3_сверху', (0, 0.001, 20), (0, 0, 0), ortho=6.8)
shot('k4_хвост', (-1.2, -4.6, 0.8), (0, -2.8, 0), lens=40)
shot('k5_спереди', (0, 12, 0), (0, 0, 0), ortho=3.6)
pose(0, fold=1.0); shot('k6_сложено', (-3.5, 4.5, 2.2), (0, 0, 0), lens=35)
