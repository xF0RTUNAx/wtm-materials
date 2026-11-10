# _diag.py — где именно касаются части в позе DIAG="el,turn,boom": координаты центров пересекающихся граней (мировые, после масштаба)
import bpy, os, math
from mathutils.bvhtree import BVHTree
_p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
def data(o):
    dg = bpy.context.evaluated_depsgraph_get(); me = o.evaluated_get(dg).to_mesh(); M = o.matrix_world
    vs = [M @ v.co for v in me.vertices]; fs = [list(p.vertices) for p in me.polygons]; o.evaluated_get(dg).to_mesh_clear(); return vs, fs
for ps in os.environ['DIAG'].split(';'):
    e, t, bm = [float(v) for v in ps.split(',')]; pose(e, t, bm, os.environ.get('HIM_VAR', 'atacms')); bpy.context.view_layer.update()
    objs = [o for o in COL.objects if o.type == 'MESH' and not o.hide_render]
    mov = [o for o in objs if o.name in ('turn', 'pod', 'boom') or o.name.startswith(('pod_', 'lid_', 'cyl_'))]
    sta = [o for o in objs if o not in mov] + [TURN]
    D = {o.name: data(o) for o in objs}
    for m in mov:
        for s in sta:
            if s is m or (m.name.startswith('cyl_') and s.name == 'turn'): continue
            a, b = D[m.name], D[s.name]; ta, tb = BVHTree.FromPolygons(*a), BVHTree.FromPolygons(*b)
            pr = ta.overlap(tb)
            if pr:
                cs = [sum((a[0][i] for i in a[1][p]), Vector()) / len(a[1][p]) for p, q in pr[:200]]
                cb = [sum((b[0][i] for i in b[1][q]), Vector()) / len(b[1][q]) for p, q in pr[:200]]
                print('   второй:', ['%.2f,%.2f,%.2f' % tuple(c) for c in cb[:4]], ' первый:', ['%.2f,%.2f,%.2f' % tuple(c) for c in cs[:4]])
                lo = Vector((min(c.x for c in cs), min(c.y for c in cs), min(c.z for c in cs))); hi = Vector((max(c.x for c in cs), max(c.y for c in cs), max(c.z for c in cs)))
                print('DIAG %s | %s×%s: %d, x %.2f…%.2f y %.2f…%.2f z %.2f…%.2f' % (ps, m.name, s.name, len(pr), lo.x, hi.x, lo.y, hi.y, lo.z, hi.z))
