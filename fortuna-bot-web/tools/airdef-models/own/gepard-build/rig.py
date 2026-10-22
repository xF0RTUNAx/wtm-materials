# rig.py — анимация для показа в Blender и для Sketchfab: башня поворачивается, стволы поднимаются вместе с орудийными коробами, антенна обзора вращается.
# Запускается ПОСЛЕ build.py (и bake.py) в той же сессии. Оси — из свойств сцены (build.py пишет их так, как их считают prepare.js и игра).
# Иерархия: PIV_turret (корень) → PIV_cradle → стволы с коробами; PIV_turret → PIV_radar → антенна; башня и штыри — детьми PIV_turret. Игровой файл (gepard.glb) делается ДО этого
# скрипта — плоский и без анимации: в игре те же движения идут поворотом частей из кода (дёшево и под любой угол).
import bpy, math
from mathutils import Vector

sc = bpy.data.scenes['GEPARD']; col = bpy.data.collections['GEPARD']
if bpy.context.window: bpy.context.window.scene = sc
bpy.context.view_layer.update()
FPS, END = 30, 360
for n in ('PIV_turret', 'PIV_cradle', 'PIV_radar'):
    o = bpy.data.objects.get(n)
    if o is not None: bpy.data.objects.remove(o, do_unlink=True)
for o in sc.objects:
    o.animation_data_clear() if o.animation_data else None
    o.parent = None


def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None); e.empty_display_type = 'ARROWS'; e.empty_display_size = 0.5; col.objects.link(e); e.location = Vector(loc)
    bpy.context.view_layer.update()
    if parent is not None: e.parent = parent; e.matrix_parent_inverse = parent.matrix_world.inverted()
    return e


def adopt(ob, parent):
    ob.parent = parent; ob.matrix_parent_inverse = parent.matrix_world.inverted()


tp, cp, ra = Vector(sc['gep_turret_pivot']), Vector(sc['gep_cradle_pivot']), Vector(sc['gep_radar_axis'])
P_T = empty('PIV_turret', tp)
P_C = empty('PIV_cradle', cp, P_T)
P_R = empty('PIV_radar', ra, P_T)
for n in ('turret_main', 'turret_whips'): adopt(bpy.data.objects[n], P_T)
adopt(bpy.data.objects['cradle_guns'], P_C)
adopt(bpy.data.objects['radar_antenna'], P_R)

# ключи: башня ведёт «цель» вправо и влево, стволы поднимаются и опускаются, антенна крутится без остановки
sc.render.fps = FPS; sc.frame_start = 0; sc.frame_end = END
bpy.context.view_layer.update()


def key(ob, axis, pts):
    for f, deg in pts:
        ob.rotation_euler[axis] = math.radians(deg); ob.keyframe_insert('rotation_euler', index=axis, frame=f)


def fcurves_of(ob):
    ad = ob.animation_data
    if not ad or not ad.action: return []
    try: return list(ad.action.fcurves)
    except Exception: pass
    out = []
    for layer in ad.action.layers:
        for strip in layer.strips:
            for cb in strip.channelbags: out += list(cb.fcurves)
    return out


key(P_T, 2, [(0, 0), (70, 150), (170, -120), (270, 60), (END, 0)])
key(P_C, 0, [(0, 0), (50, 65), (120, 8), (200, 78), (280, 20), (END, 0)])
key(P_R, 2, [(0, 0), (END, 360 * 12)])
for fc in fcurves_of(P_R):
    for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
sc.frame_set(0)
print('анимация готова: кадры 0…%d, %d к/с; оси башня %s, качание %s, антенна %s' % (END, FPS, tuple(round(v, 3) for v in tp), tuple(round(v, 3) for v in cp), tuple(round(v, 3) for v in ra)))
