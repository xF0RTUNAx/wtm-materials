# ФАБ-250 (w_fab250) - своя фугасная бомба 250 кг по фото fab250_01..03 (01 - схема формы, 02 - окраска, 03 - пропорции). Метры: ось Y, нос +Y (в glTF -Z), верх +Z (в glTF +Y, ушки),
# начало на оси посередине длины 1,5 м. a - расстояние от острия взрывателя. Подвижных частей нет. Размеры сняты с fab250_01 снизу: 1030 пикс/м при длине 1,5 м; диаметр 0,245 (длина/диаметр ~6 по 01, 02, 03).
# Запуск: FB_OUT="<папка>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py [--python _виды.py | --python bake.py --python deliver.py]
#
# СОСТАВ (по 01): взрыватель в носу (цилиндр с буртиком); оживальная головная часть; три пояса-обечайки; два ушка подвески сверху на площадках;
# корпус чуть сужается к третьему поясу; хвостовой конус в трубку; стабилизатор «+»: четыре пера (верхнее над ушками) и кольцо, перья выступают за кольцо (02).
import sys, os, math, importlib
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
import bpy, bmesh
import modelkit as mk; importlib.reload(mk)
from modelkit import B, Vector

L = 1.50; R = 0.1225; NSEG = 48
mk.configure('FAB250', 0.001, x0=0.0, yc=0.0, rb=122.5, nseg=NSEG, nose='left')
G_BODY, G_METAL, G_DARK = 0, 1, 2
mk.set_materials([('FB2_body', (0.52, 0.54, 0.56)), ('FB2_metal', (0.40, 0.41, 0.42)), ('FB2_dark', (0.03, 0.03, 0.03))])
for m, (rough, metal) in zip(mk.MATS, ((0.60, 0.05), (0.50, 0.45), (0.85, 0.0))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
Yb = lambda a: L / 2 - a
A_FUZE, A_COLL, A_NOSE, A_CYL, A_TAP, A_CONE, A_TUBE = 0.045, 0.060, 0.060, 0.252, 0.687, 0.917, 1.380
R_NOSE0, R_TAP, R_TUBE = 0.032, 0.1045, 0.042
SEAMS = (0.252, 0.687, 0.917)                                   # пояса (01, 02)
LUGS = (0.345, 0.544)                                           # ушки подвески: шаг 0,2 м (01)


def r_body(a):
    if a <= A_CYL:                                              # оживальная голова (01)
        u = (a - A_NOSE) / (A_CYL - A_NOSE); return R_NOSE0 + (R - R_NOSE0) * math.sin(max(0.0, u) * math.pi / 2) ** 0.8
    if a <= A_TAP: return R
    if a <= A_CONE: return R - (R - R_TAP) * (a - A_TAP) / (A_CONE - A_TAP)            # лёгкое сужение к третьему поясу
    if a <= A_TUBE: u = (a - A_CONE) / (A_TUBE - A_CONE); return R_TAP - (R_TAP - R_TUBE) * u ** 1.10
    return R_TUBE


def ring(a, r, n=NSEG):
    return [Vector((r * math.cos(2 * math.pi * j / n), Yb(a), r * math.sin(2 * math.pi * j / n))) for j in range(n)]


def band(a, w=0.010, h=0.004):
    e = 0.003; return [(a - w / 2 - e, r_body(a - w / 2 - e)), (a - w / 2, r_body(a - w / 2) + h), (a + w / 2, r_body(a + w / 2) + h), (a + w / 2 + e, r_body(a + w / 2 + e))]


nose = [A_NOSE + (A_CYL - A_NOSE) * (1 - math.cos(math.pi / 2 * k / 10)) for k in range(11)]
PROF = [(A_NOSE, 0.0), (A_NOSE, R_NOSE0 - 0.004)] + [(a, r_body(a)) for a in nose[:-1] if a < SEAMS[0] - 0.009] + band(SEAMS[0]) + [(0.40, R), (0.55, R)] + band(SEAMS[1]) + [(0.80, r_body(0.80))] + band(SEAMS[2]) + \
       [(A_CONE + (A_TUBE - A_CONE) * k / 8, r_body(A_CONE + (A_TUBE - A_CONE) * k / 8)) for k in range(1, 9)] + [(1.44, R_TUBE), (L - 0.012, R_TUBE), (L - 0.004, R_TUBE - 0.006), (L - 0.004, 0.020), (L, 0.016), (L, 0.0)]
PROF = sorted(set(PROF), key=lambda p: (p[0], p[1] if p[0] in (A_NOSE,) else -p[1] if p[0] == L else 0))
b = B()
b.loft([ring(a, max(r, 0.0008)) for a, r in PROF], G_BODY)
bmesh.ops.remove_doubles(b.bm, verts=b.bm.verts[:], dist=1e-6)
body = b.finish('FB2_body', sharp_deg=40)

# ── взрыватель: цилиндр с буртиком и скруглённым торцом (01) ──
bz = B()
bz.loft([ring(a, r, 24) for a, r in ((A_COLL + 0.004, R_NOSE0 - 0.006), (A_COLL, 0.021), (A_FUZE, 0.021), (A_FUZE, 0.014), (0.010, 0.014), (0.003, 0.011), (0.0, 0.004))], G_METAL, cap0=G_METAL, cap1=G_METAL)
fuze = bz.finish('FB2_fuze', sharp_deg=40)

# ── два ушка подвески на площадках (01) ──
bf = B()
for al in LUGS:
    y0 = Yb(al)
    pad = lambda dz, k: [Vector((x * k, y0 + yy * k, R - 0.006 + dz)) for x, yy in ((-0.026, -0.036), (0.026, -0.036), (0.026, 0.036), (-0.026, 0.036))]
    bf.loft([pad(0.0, 1.0), pad(0.012, 1.0), pad(0.016, 0.82)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    arc = [(y0 + 0.020 * math.cos(math.pi * q / 12), R + 0.008 + 0.034 * math.sin(math.pi * q / 12)) for q in range(13)]
    secs = []
    for k, (ya, za) in enumerate(arc):
        yb_, zb = arc[min(k + 1, 12)]; yp, zp = arc[max(k - 1, 0)]
        dv = Vector((0, yb_ - yp, zb - zp)).normalized(); nv = Vector((0, -dv.z, dv.y)) * 0.0055
        secs.append([Vector((x, ya, za)) + nn for x, nn in ((-0.007, nv), (0.007, nv), (0.007, -nv), (-0.007, -nv))])
    bf.loft(secs, G_METAL, cap0=G_METAL, cap1=G_METAL)
lug = bf.finish('FB2_lugs', sharp_deg=36)

# ── стабилизатор «+»: четыре пера со стреловидной передней кромкой и кольцо; перья выступают за кольцо (01, 02) ──
bt = B(); T = 0.0045
R_RING, A_RING0 = 0.123, 1.395
R_FIN, A_FIN0, A_FIN1 = 0.146, 1.230, 1.320
def r_in(a): return r_body(a) - 0.003
def r_out(a):
    if a >= A_FIN1: return R_FIN
    return r_in(A_FIN0) + (R_FIN - r_in(A_FIN0)) * (a - A_FIN0) / (A_FIN1 - A_FIN0)
ST = [A_FIN0, 1.26, 1.29, A_FIN1, 1.36, 1.40, 1.45, L - 0.020]
for phi in (0.0, 90.0, 180.0, 270.0):
    ph = math.radians(phi); er = Vector((math.sin(ph), 0.0, math.cos(ph))); et = Vector((math.cos(ph), 0.0, -math.sin(ph)))
    P = lambda a, r, w: Vector((0.0, Yb(a), 0.0)) + er * r + et * w
    secs = []
    for a in ST:
        ri = r_in(a); ro = max(r_out(a), ri + 0.002)
        if a >= L - 0.021: ro = R_FIN - 0.012                       # задняя кромка пера чуть срезана (01)
        secs.append([P(a, ri, -T / 2), P(a, ro, -T / 2), P(a, ro, T / 2), P(a, ri, T / 2)])
    bt.loft(secs, G_BODY, cap0=G_BODY, cap1=G_BODY)
SH = [(A_RING0, R_RING - 0.004), (A_RING0 + 0.004, R_RING + 0.0015), (L - 0.006, R_RING + 0.0015), (L - 0.002, R_RING - 0.001), (L - 0.002, R_RING - 0.004)]
bt.loft([ring(a, r, 64) for a, r in SH] + [ring(SH[0][0], SH[0][1], 64)], G_BODY)
bmesh.ops.remove_doubles(bt.bm, verts=bt.bm.verts[:], dist=1e-7)
tail = bt.finish('FB2_tail', sharp_deg=35)

bpy.context.view_layer.update()
mk.GEO = dict(L=L, R=R, SEAMS=SEAMS, LUGS=LUGS, R_TUBE=R_TUBE, R_RING=R_RING, R_FIN=R_FIN, A_FUZE=A_FUZE, A_CYL=A_CYL, A_CONE=A_CONE)
mk.Yb_ = Yb
mk.stats()
print('сцена FAB250 построена')
