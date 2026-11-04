# _pose.py - поставить крылья и киль раскрытыми (open=True) или сложенными для снимков. В файл всегда уходят сложенные, все углы 0.
import math, bpy
from mathutils import Matrix
import jsm_geo as g


def pose(open_):
    for n, D in g.WING_PIVOTS.items():
        o = bpy.data.objects[n]; o.rotation_mode = 'XYZ'; o.rotation_euler = (0, 0, math.radians(D['open_deg']) if open_ else 0.0)
    o = bpy.data.objects['fin']; o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Matrix.Rotation(math.radians(g.FIN_OPEN) if open_ else 0.0, 4, g.FIN_PIVOT['axis']).to_quaternion()
    bpy.context.view_layer.update()
