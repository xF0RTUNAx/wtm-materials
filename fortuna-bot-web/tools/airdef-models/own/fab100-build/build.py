# ФАБ-100 (w_fab100) - своя фугасная бомба 100 кг по 4 фото Mark (выставочные ОФАБ-100-120, 2026-11-08; снимки присланы в чат, в папку не сохранены).
# Метры: ось Y, нос +Y (в glTF -Z), верх +Z (в glTF +Y, ушко), начало на оси посередине длины 1,07 м. a - расстояние от острия взрывателя. Подвижных частей нет.
# Запуск: FB_OUT="<папка>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py [--python _виды.py | --python bake.py --python deliver.py]
#
# СОСТАВ (по фото):
#  + красный конический взрыватель в металлическом гнезде на тупом скруглённом носу
#  + цилиндр Ø 0,27; две обечайки у плеча носа (фото 2, 3), одна на стыке с хвостовым конусом
#  + ушко подвески сверху посередине цилиндра, на приваренной площадке
#  + короткий крутой хвостовой конус в трубку Ø 0,09, трубка кончается куполом внутри кольца (фото 3)
#  + коробчатый стабилизатор: четыре пера × со стреловидной передней кромкой выступают за кольцо Ø 0,26 почти в корпус; сбоку хвост вровень с корпусом (Mark 2026-11-08, фото 1-4)
import sys, os, math, importlib
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
import bpy, bmesh
import modelkit as mk; importlib.reload(mk)
from modelkit import B, Vector

L = 1.07; R = 0.135; NSEG = 40
mk.configure('FAB100', 0.001, x0=0.0, yc=0.0, rb=135.0, nseg=NSEG, nose='left')
G_BODY, G_METAL, G_DARK, G_RED = 0, 1, 2, 3
mk.set_materials([('FB_body', (0.36, 0.38, 0.40)), ('FB_metal', (0.30, 0.31, 0.32)), ('FB_dark', (0.03, 0.03, 0.03)), ('FB_red', (0.45, 0.03, 0.02))])
for m, (rough, metal) in zip(mk.MATS, ((0.60, 0.05), (0.50, 0.45), (0.85, 0.0), (0.45, 0.0))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
Yb = lambda a: L / 2 - a

A_FUZE, A_SOCK = 0.046, 0.058          # основание красного конуса; торец гнезда на носу
A_NOSE, A_CYL = 0.058, 0.180           # скруглённый нос: от гнезда (r 0,045) до цилиндра
A_CONE, A_TUBE = 0.620, 0.750          # хвостовой конус: от цилиндра до трубки
R_TUBE = 0.045; A_DOME0, A_DOME1 = 0.925, 0.965   # трубка и её купол внутри кольца
SEAMS = (0.194, 0.262, 0.620)          # обечайки
A_LUG = 0.410                          # ушко: середина цилиндра
R_RING, A_RING0 = 0.129, 0.900         # кольцо стабилизатора
R_FIN, A_FIN0, A_FIN1 = 0.186, 0.650, 0.830   # перо: наружная кромка, начало передней кромки, конец стреловидности


def r_body(a):
    if a <= A_CYL:                                     # тупой нос: «скруглённый квадрат» (суперэллипс), фото 2-4
        t = (A_CYL - a) / (A_CYL - A_NOSE); return 0.040 + (R - 0.040) * max(0.0, 1 - t ** 2.2) ** (1 / 2.2)
    if a <= A_CONE: return R
    if a <= A_TUBE:                                    # крутой конус с галтелью у трубки
        u = (a - A_CONE) / (A_TUBE - A_CONE); return R_TUBE + (R - R_TUBE) * (1 - u) ** 1.35
    if a <= A_DOME0: return R_TUBE
    t = (a - A_DOME0) / (A_DOME1 - A_DOME0); return max(0.002, R_TUBE * math.sqrt(max(0.0, 1 - t * t)))


def ring(a, r, n=NSEG):
    return [Vector((r * math.cos(2 * math.pi * j / n), Yb(a), r * math.sin(2 * math.pi * j / n))) for j in range(n)]


def band(a, w=0.016, h=0.003):
    e = 0.0035; return [(a - w / 2 - e, r_body(a - w / 2 - e)), (a - w / 2, r_body(a - w / 2) + h), (a + w / 2, r_body(a + w / 2) + h), (a + w / 2 + e, r_body(a + w / 2 + e))]


nose = [A_NOSE + (A_CYL - A_NOSE) * (1 - math.cos(math.pi / 2 * k / 9)) for k in range(10)]   # гуще у торца, где скругление
PROF = [(A_NOSE, 0.0), (A_NOSE, 0.038)] + [(a, r_body(a)) for a in nose[:-1]] + [(A_CYL, R)] + band(SEAMS[0]) + band(SEAMS[1]) + [(0.36, R), (0.48, R)] + band(SEAMS[2]) + \
       [(A_CONE + (A_TUBE - A_CONE) * k / 7, r_body(A_CONE + (A_TUBE - A_CONE) * k / 7)) for k in range(1, 8)] + [(0.84, R_TUBE), (A_DOME0, R_TUBE)] + \
       [(A_DOME0 + (A_DOME1 - A_DOME0) * k / 5, r_body(A_DOME0 + (A_DOME1 - A_DOME0) * k / 5)) for k in range(1, 6)]
PROF = sorted(set(PROF), key=lambda p: (p[0], p[1] if p[0] == A_NOSE else 0))
b = B()
rr = [ring(a, max(r, 0.0008)) for a, r in PROF]
b.loft(rr, G_BODY, cap0=G_METAL, cap1=G_BODY)
body = b.finish('FB_body', sharp_deg=40)

# ── взрыватель: металлическое гнездо и красный конус ──
bz = B()
bz.loft([ring(a, r, 24) for a, r in ((A_SOCK + 0.002, 0.038), (A_SOCK, 0.040), (A_FUZE + 0.003, 0.040), (A_FUZE, 0.037), (A_FUZE, 0.030))], G_METAL, cap0=G_METAL)
bz.loft([ring(a, r, 24) for a, r in ((A_FUZE, 0.030), (0.036, 0.024), (0.020, 0.014), (0.006, 0.005), (0.0, 0.0012))], G_RED, cap1=G_RED)
fuze = bz.finish('FB_fuze', sharp_deg=40)

# ── ушко подвески на площадке ──
bf = B(); y0 = Yb(A_LUG)
pad = lambda dz: [Vector((x, y0 + yy, R - 0.006 + dz)) for x, yy in ((-0.024, -0.032), (0.024, -0.032), (0.024, 0.032), (-0.024, 0.032))]
bf.loft([pad(0.0), pad(0.010)], G_METAL, cap0=G_METAL, cap1=G_METAL)
arc = [(y0 + 0.018 * math.cos(math.pi * q / 10), R + 0.004 + 0.026 * math.sin(math.pi * q / 10)) for q in range(11)]
secs = []
for k, (ya, za) in enumerate(arc):
    yb_, zb = arc[min(k + 1, 10)]; yp, zp = arc[max(k - 1, 0)]
    dv = Vector((0, yb_ - yp, zb - zp)).normalized(); nv = Vector((0, -dv.z, dv.y)) * 0.005
    secs.append([Vector((x, ya, za)) + nn for x, nn in ((-0.006, nv), (0.006, nv), (0.006, -nv), (-0.006, -nv))])
bf.loft(secs, G_METAL, cap0=G_METAL, cap1=G_METAL)
lug = bf.finish('FB_lug', sharp_deg=36)

# ── коробчатый стабилизатор: 4 пера × и кольцо ──
bt = B(); T = 0.004


def r_in(a): return r_body(a) - 0.003 if a <= A_DOME1 else 0.0


def r_out(a):
    if a >= A_FIN1: return R_FIN
    return r_in(A_FIN0) + (R_FIN - r_in(A_FIN0)) * (a - A_FIN0) / (A_FIN1 - A_FIN0)


ST = [A_FIN0, 0.680, 0.705, 0.750, 0.790, A_FIN1, 0.86, A_DOME0, 0.945, A_DOME1, A_DOME1 + 0.0005, 1.02, L]
for phi in (45.0, 135.0, 225.0, 315.0):
    ph = math.radians(phi); er = Vector((math.sin(ph), 0.0, math.cos(ph))); et = Vector((math.cos(ph), 0.0, -math.sin(ph)))
    P = lambda a, r, w: Vector((0.0, Yb(a), 0.0)) + er * r + et * w
    secs = []
    for a in ST:
        ri = r_in(a); ro = max(r_out(a), ri + 0.002)
        secs.append([P(a, ri, -T / 2), P(a, ro, -T / 2), P(a, ro, T / 2), P(a, ri, T / 2)])
    bt.loft(secs, G_BODY, cap0=G_BODY, cap1=G_BODY)
SH = [(A_RING0, R_RING - 0.004), (A_RING0, R_RING), (L, R_RING), (L, R_RING - 0.004)]
bt.loft([ring(a, r, 48) for a, r in SH] + [ring(*SH[0], 48)], G_BODY)
bmesh.ops.remove_doubles(bt.bm, verts=bt.bm.verts[:], dist=1e-7)
tail = bt.finish('FB_tail', sharp_deg=35)

bpy.context.view_layer.update()
mk.GEO = dict(L=L, R=R, SEAMS=SEAMS, A_LUG=A_LUG, R_TUBE=R_TUBE, R_RING=R_RING, R_FIN=R_FIN, A_FUZE=A_FUZE, A_CYL=A_CYL, A_CONE=A_CONE)
mk.Yb_ = Yb
mk.stats()
print('сцена FAB100 построена')
