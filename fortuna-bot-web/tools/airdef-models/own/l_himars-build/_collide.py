# _collide.py — HIMARS: касания подвижных частей по всему ходу (BVH).
#   подъём клетки 0…EL_MAX при повороте 0; поворот платформы -180…180 при подъёме 0, 10, 30, 60; стрела 0…1,2 м при подъёме 0 и 60.
# Подвижное (turn, pod, boom, pod_*, lid_*, cyl_*) против неподвижного (body_*, wheel_*, hatch, ant_*); внутри подвижного - стрела против клетки
# (рельсы) не проверяется, цилиндры - против своих опор не проверяются. Печатает касания и пределы.  Blender -b --factory-startup --python _collide.py
import bpy, os, math
from mathutils.bvhtree import BVHTree
_p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
VAR = os.environ.get('HIM_VAR', 'atacms')


def tree(objs):
    dg = bpy.context.evaluated_depsgraph_get(); vs, fs = [], []
    for o in objs:
        me = o.evaluated_get(dg).to_mesh(); M = o.matrix_world; n0 = len(vs)
        vs += [M @ v.co for v in me.vertices]; fs += [[n0 + i for i in p.vertices] for p in me.polygons]; o.evaluated_get(dg).to_mesh_clear()
    return BVHTree.FromPolygons(vs, fs)


def visible(o): return not o.hide_render
movers = lambda: [o for o in COL.objects if o.type == 'MESH' and visible(o) and (o.name in ('turn', 'pod', 'boom') or o.name.startswith(('pod_', 'lid_', 'cyl_')))]
statics = [o for o in COL.objects if o.type == 'MESH' and (o.name.startswith(('body_', 'wheel_', 'ant_', 'sk_')) or o.name == 'hatch')]
pod_only = lambda: [o for o in movers() if o.name != 'turn' and not o.name.startswith('cyl_body')]


def hits(el, turn, boom=0.0):
    pose(el, turn, boom, VAR); bpy.context.view_layer.update()
    st = {o.name: tree([o]) for o in statics}; out = {}
    for m in movers():
        tm = tree([m])
        for sn, t in st.items():
            n = len(t.overlap(tm))
            if n: out[f'{m.name}×{sn}'] = n
    # клетка и контейнер против платформы (кроме петли и цилиндров): касание при подъёме
    tt = tree([TURN])
    for m in pod_only():
        if m.name.startswith('cyl_'): continue
        n = len(tt.overlap(tree([m])))
        if n: out[f'{m.name}×turn'] = n
    return out


print('== подъём при повороте 0 ==')
ok_el = []
for e in range(0, 76, 5):
    h = hits(float(e), 0.0)
    print('  подъём %2d°:' % e, h if h else 'чисто', flush=True)
    if not h: ok_el.append(e)
print('== поворот ==')
for e in (0.0, 10.0, 30.0, 60.0):
    bad = []
    for a in range(-180, 181, 10):
        h = hits(e, float(a))
        if h: bad.append((a, h))
    print('  подъём %g°: касания при повороте' % e, [(a, list(h)[:3]) for a, h in bad] if bad else 'нет (весь круг)', flush=True)
print('== стрела ==')
for e in (0.0, 60.0):
    for d in (0.0, 0.4, 0.8, 1.2):
        h = hits(e, 0.0, d)
        print('  подъём %g°, стрела %.1f м:' % (e, d), h if h else 'чисто', flush=True)
print('ИТОГ подъём без касаний:', ok_el)
pose(0, 0, 0)
