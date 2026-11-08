# ADM-160 MALD (w_mald) - своя модель по фото Mark (референсы/mald_01..06). Метры: ось корпуса Y, нос +Y (в glTF -Z), верх +Z (в glTF +Y),
# начало на оси посередине длины 2,84 м. a - расстояние от острия носа. Запуск:
# MLD_OUT="<папка>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python _collide.py [--python bake.py --python deliver.py]
#
# ФОТО: 01 - в полёте (крылья раскрыты, хвост); 02, 06 - музейные белые макеты (форма крыльев и хвоста, окраску не брать);
#       03 - учебный образец на подставке, вид слева, нос слева: главный снимок формы корпуса, лючков, швов (масштаб: 920 пикс. = 2,84 м);
#       04 - две MALD на подвеске: нос, низ, хвост, жёлтое кольцо у носа; 05 - масштабная модель: сложено, сверху, раскрыто.
#       Сетки на хвосте (03, 04, 05), красные ленты, ремни и подставка - транспортные, не делаем.
# СОСТАВ:
#  + корпус: оживальный нос с острием ниже оси (передняя часть растёт вверх, низ почти прямой, фото 03), сечение - скруглённый квадрат,
#    швы-канавки на стыках (нос 0,28; отсек 0,93; хвост 2,46), сужение к хвосту, сопло на оси, полое
#  + крылья wing1 (+X), wing2 (-X) на общей вертикальной оси под корпусом (a = 1,22; фото 03 - сложенные крылья вдоль низа от 0,34 до 2,10):
#    wing1 сложено назад, wing2 - вперёд, друг под другом; раскрытие поворотом в одну сторону: wing1 82°, wing2 98° - обе консоли
#    со стреловидностью 8° назад, как на фото 01; размах 1,7 м
#  + кили: верхний и два боковых с отрицательным V 10° - неподвижны (на 05 одинаковы в сложенном и раскрытом виде); ширина 0,62 м - в отсек F-35 (1,18 м) входит
#  + воздухозаборник снизу у хвоста (03: выступ под корпусом у a ~ 2,4), тёмная горловина
#  + два упора подвески сверху (03: a 1,67 и 1,95), кабельный короб по верху, ось крыльев (втулка) снизу
#  - лючки, заклёпки, надписи, жёлтое кольцо у носа - цветом и рельефом на этапе окраски
import sys, os, math, importlib
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
import bpy, bmesh
import modelkit as mk; importlib.reload(mk)
from modelkit import B, Vector

L = 2.84; NSEG = 48
mk.configure('MALD', 0.001, x0=0.0, yc=0.0, rb=145.0, nseg=NSEG, nose='left')
G_BODY, G_STEEL, G_DARK, G_YEL = 0, 1, 2, 3
mk.set_materials([('MLD_body', (0.42, 0.45, 0.48)), ('MLD_steel', (0.22, 0.22, 0.23)), ('MLD_dark', (0.02, 0.02, 0.02)), ('MLD_yellow', (0.62, 0.45, 0.06))])
for m, (rough, metal) in zip(mk.MATS, ((0.5, 0.0), (0.42, 0.6), (0.75, 0.2), (0.5, 0.0))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
Yb = lambda a: L / 2 - a
A_END = 2.70                                                                   # срез корпуса (сопло), кили до 2,84
HT = [(0.0, 0.003), (0.02, 0.022), (0.05, 0.036), (0.10, 0.052), (0.16, 0.066), (0.22, 0.077), (0.28, 0.086), (0.40, 0.097), (0.55, 0.108), (0.75, 0.119),
      (0.93, 0.128), (1.10, 0.136), (1.30, 0.143), (1.42, 0.145), (2.46, 0.145), (2.52, 0.140), (2.58, 0.128), (2.64, 0.112), (2.70, 0.096)]


def lerp_tab(tab, a):
    if a <= tab[0][0]: return tab[0][1]
    for (a0, v0), (a1, v1) in zip(tab, tab[1:]):
        if a0 <= a <= a1: return v0 + (v1 - v0) * (a - a0) / (a1 - a0)
    return tab[-1][1]


def h_at(a): return lerp_tab(HT, a)
def zc_at(a): return -0.056 * max(0.0, 1.0 - a / 1.42) ** 1.4               # острие носа ниже оси: низ почти прямой, растёт верх
def pw(a): return 2.0 + 1.1 * min(1.0, max(0.0, (a - 0.05) / 0.9)) - 0.5 * max(0.0, (a - 2.46) / 0.24)   # круг у носа -> скруглённый квадрат
def w_at(a): return h_at(a) * (1.0 - 0.07 * min(1.0, a / 0.9))                # чуть уже, чем высота


def sec(a, h=None, n=NSEG, k=1.0):
    h = (h if h is not None else h_at(a)) * k; w = w_at(a) * (h / h_at(a) if h_at(a) else 1.0) if h is not None else w_at(a)
    p = pw(a); zc = zc_at(a); pts = []
    for j in range(n):
        t = 2 * math.pi * j / n - math.pi / 2                                   # шов развёртки снизу
        c, s = math.cos(t), math.sin(t); q = (abs(c) ** p + abs(s) ** p) ** (-1.0 / p)
        pts.append(Vector((w * q * c, Yb(a), zc + h * q * s)))
    return pts


def groove(a, d=0.0032, ww=0.0045):
    return [(a - ww, 1.0), (a - ww * 0.3, 1.0 - d / h_at(a)), (a + ww * 0.3, 1.0 - d / h_at(a)), (a + ww, 1.0)]


ST = [(a, 1.0) for a in (0.002, 0.01, 0.025, 0.05, 0.08, 0.12, 0.16, 0.20, 0.24)] + groove(0.28) + [(a, 1.0) for a in (0.34, 0.42, 0.52, 0.64, 0.78)] + groove(0.93) + \
     [(a, 1.0) for a in (1.06, 1.20, 1.34, 1.42)] + groove(1.80, d=0.002) + groove(2.46) + [(a, 1.0) for a in (2.52, 2.58, 2.64, A_END)]
b = B(); rings = [sec(a, k=k) for a, k in ST]
mats = [G_BODY] * (len(rings) - 1)
b.loft(rings, mats, cap0=G_BODY)
# сопло: срез корпуса, кромка, тёмная внутренняя стенка, дно
last = rings[-1]
def ring_c(a, r, n=NSEG):
    return [Vector((r * math.cos(2 * math.pi * j / n - math.pi / 2), Yb(a), zc_at(a) + r * math.sin(2 * math.pi * j / n - math.pi / 2))) for j in range(n)]
NOZ = [ring_c(A_END + 0.004, 0.078), ring_c(A_END + 0.018, 0.072), ring_c(A_END + 0.022, 0.066), ring_c(A_END - 0.03, 0.054), ring_c(A_END - 0.03, 0.003)]
b.loft([last] + NOZ, [G_BODY, G_STEEL, G_STEEL, G_DARK, G_DARK], cap1=G_DARK)
bmesh.ops.remove_doubles(b.bm, verts=b.bm.verts[:], dist=1e-7)
body = b.finish('MLD_body', sharp_deg=36)

# жёлтое кольцо у носа (фото 04) - тонкая накладка на обтекатель
by = B(); ry = [sec(a, k=1.004) for a in (0.215, 0.222, 0.238, 0.245)]
ry[0] = sec(0.215, k=0.999); ry[-1] = sec(0.245, k=0.999)
by.loft(ry, [G_YEL] * 3); yel = by.finish('MLD_ring', sharp_deg=60)

# ── неподвижные детали ──
bf = B()
TOP = lambda a: zc_at(a) + h_at(a)
BOT = lambda a: zc_at(a) - h_at(a)
def lug(ac):
    r0 = TOP(ac); hw, h, t = 0.024, 0.058, 0.012
    OUT = [(-hw * 1.06, -0.010), (hw * 1.06, -0.010), (hw * 1.06, 0.006), (hw, 0.012), (hw * 0.90, 0.044), (hw * 0.60, h), (-hw * 0.60, h), (-hw * 0.90, 0.044), (-hw, 0.012), (-hw * 1.06, 0.006)]
    hc = 0.030; hr, hz = 0.011, 0.014; n = 18; segs = list(zip(OUT, OUT[1:] + OUT[:1]))
    def ray(an):
        d = (math.cos(an), math.sin(an)); best = None
        for (w0, h0), (w1, h1) in segs:
            ew, eh = w1 - w0, h1 - h0; den = d[0] * eh - d[1] * ew
            if abs(den) < 1e-9: continue
            tt = (w0 * eh - (h0 - hc) * ew) / den; u = (w0 * d[1] - (h0 - hc) * d[0]) / den
            if tt > 0 and -1e-6 <= u <= 1 + 1e-6 and (best is None or tt < best): best = tt
        return d[0] * best, hc + d[1] * best
    angs = [2 * math.pi * k / n for k in range(n)]
    o_ = [ray(q) for q in angs]; i_ = [(hr * math.cos(q), hc + hz * math.sin(q)) for q in angs]
    pt = lambda p, s: Vector((p[0], Yb(ac + s * t), r0 + p[1]))
    bf.loft([[pt(p, 1) for p in i_], [pt(p, 1) for p in o_], [pt(p, -1) for p in o_], [pt(p, -1) for p in i_], [pt(p, 1) for p in i_]], G_STEEL)
    disc = lambda rd, hh: [Vector((rd * math.cos(2 * math.pi * j / 8 + math.pi / 8), Yb(ac) + rd * math.sin(2 * math.pi * j / 8 + math.pi / 8), r0 + hh)) for j in range(8)]
    bf.loft([disc(0.040, -0.008), disc(0.040, 0.006), disc(0.033, 0.009)], G_STEEL, cap1=G_STEEL)
A_LUG1, A_LUG2 = 1.67, 1.95
lug(A_LUG1); lug(A_LUG2)
LUG_TOP = TOP(A_LUG1) + 0.058
# кабельный короб по верху (фото 03: светлая полоса по верху от носовой части к хвосту), в обход упоров
def tunnel(a0, a1, w, h):
    s_ = lambda a, ww, hh: [Vector((x, Yb(a), z)) for x, z in ((-ww, TOP(a) - 0.006), (-ww, TOP(a) + hh * 0.7), (-ww * 0.7, TOP(a) + hh), (ww * 0.7, TOP(a) + hh), (ww, TOP(a) + hh * 0.7), (ww, TOP(a) - 0.006))]
    bf.loft([s_(a0, w * 0.6, 0.001), s_(a0 + 0.04, w, h), s_(a1 - 0.04, w, h), s_(a1, w * 0.6, 0.001)], G_BODY, cap0=G_BODY, cap1=G_BODY)
tunnel(0.62, 1.62, 0.022, 0.011); tunnel(1.72, 1.90, 0.022, 0.011); tunnel(2.00, 2.38, 0.022, 0.011)
# воздухозаборник снизу у хвоста: горб под корпусом, горловина спереди тёмная
A_IN0, A_IN1, W_IN, H_IN = 2.24, 2.58, 0.072, 0.050
def scoop(a, w, h):
    z0 = BOT(a) + 0.012; zb = BOT(a) - h
    return [Vector((x, Yb(a), z)) for x, z in ((-w, z0), (-w, zb + h * 0.3), (-w * 0.72, zb), (w * 0.72, zb), (w, zb + h * 0.3), (w, z0))]
SC = [(A_IN0, W_IN, H_IN), (A_IN0 + 0.05, W_IN + 0.002, H_IN + 0.002), (A_IN0 + 0.18, W_IN - 0.004, H_IN * 0.85), (A_IN0 + 0.28, W_IN - 0.018, H_IN * 0.45), (A_IN1, W_IN - 0.03, 0.003)]
bf.loft([scoop(a, w, h) for a, w, h in SC], G_BODY, cap1=G_BODY)
fr = scoop(A_IN0, W_IN, H_IN); inn = [Vector((p.x * 0.80, p.y, p.z * 0.0 + (p.z if p.z > BOT(A_IN0) else p.z + 0.008))) for p in fr]
deep = [Vector((p.x * 0.62, Yb(A_IN0 + 0.10), p.z + 0.004)) for p in inn]
bf.loft([fr, inn], G_BODY); bf.loft([inn, deep], G_DARK, cap1=G_DARK)
fixed = bf.finish('MLD_fixed', sharp_deg=36)

# ── крылья: общая ось снизу, wing1 сложено назад, wing2 вперёд, друг под другом ──
A_PIV = 1.22; SPAN = 0.85; CH_R, CH_T, T_R, T_T, SWEEP = 0.150, 0.110, 0.014, 0.009, 8.0
Z1 = BOT(A_PIV) - 0.004; Z2 = Z1 - T_R - 0.004                               # верх крыла 1 и крыла 2
OPEN = {1: 90.0 - SWEEP, 2: 90.0 + SWEEP}
WING = {}
PIV = Vector((0.0, Yb(A_PIV), 0.0))
def rotz(v, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg)); return Vector((v.x * c - v.y * s, v.x * s + v.y * c, v.z))
for k, side in ((1, 1.0), (2, -1.0)):
    ztop = Z1 if k == 1 else Z2
    d = Vector((side * math.cos(math.radians(SWEEP)), -math.sin(math.radians(SWEEP)), 0.0))
    def sec_w(s_, ch, t):
        le = d * s_ + Vector((0.0, 0.045, 0.0)); pts = []
        for f, zz in ((0.0, 0.0), (0.12, 0.5), (0.45, 0.5), (1.0, 0.0), (0.45, -0.5), (0.12, -0.5)):
            p = le + Vector((0.0, -f * ch, 0.0)); pts.append(rotz(p, -OPEN[k]) + Vector((0, 0, ztop - T_R / 2 + zz * t)))
        return pts if side > 0 else pts[::-1]
    bw = B()
    bw.loft([sec_w(0.0, CH_R, T_R), sec_w(SPAN * 0.5, (CH_R + CH_T) / 2, (T_R + T_T) / 2), sec_w(SPAN * 0.97, CH_T, T_T), sec_w(SPAN, CH_T * 0.8, T_T * 0.7)], G_BODY, cap0=G_BODY, cap1=G_BODY)
    nh = 16                                                                     # втулка на оси
    hub = lambda rd, zz: [Vector((rd * math.cos(2 * math.pi * j / nh), rd * math.sin(2 * math.pi * j / nh), zz)) for j in range(nh)]
    bw.loft([hub(0.030, ztop - T_R - 0.001), hub(0.030, ztop + 0.0005)], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    ob = bw.finish(f'wing{k}', sharp_deg=30); ob.location = PIV
    WING[k] = dict(o=PIV.copy(), open_deg=OPEN[k], z=ztop)
# ось крыльев: штырь от низа корпуса до низа второго крыла
bp = B(); nh = 16
pin = lambda rd, zz: [PIV + Vector((rd * math.cos(2 * math.pi * j / nh), rd * math.sin(2 * math.pi * j / nh), zz)) for j in range(nh)]
bp.loft([pin(0.016, BOT(A_PIV) + 0.01), pin(0.016, Z2 - T_R - 0.004), pin(0.022, Z2 - T_R - 0.008)], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
pinob = bp.finish('MLD_pin', sharp_deg=30)

# ── кили: верхний и два боковых с отрицательным V 10°, неподвижны ──
def fin(phi_deg, a_le, a_te, span, tip_le, tip_te, t):
    ph = math.radians(phi_deg); er = Vector((math.sin(ph), 0.0, math.cos(ph))); et = Vector((math.cos(ph), 0.0, -math.sin(ph)))
    def r_body(a):                                                             # от оси до поверхности в направлении er (по сечению)
        p = pw(a); c, s = abs(er.x) / max(w_at(a), 1e-6), abs(er.z - 0.0) / max(h_at(a), 1e-6)
        return (c ** p + s ** p) ** (-1.0 / p)
    def P(a, r, w): return Vector((0.0, Yb(a), zc_at(a))) + er * r + et * w
    rb0, rb1 = r_body(a_le) - 0.004, r_body(a_te) - 0.004
    root = [(a_le, rb0), (a_te, rb1)]; tip = [(tip_le, rb0 + span), (tip_te, rb0 + span)]
    def face(w): return [P(root[0][0], root[0][1], w), P(tip[0][0], tip[0][1], w * 0.6), P(tip[1][0], tip[1][1], w * 0.6), P(root[1][0], root[1][1], w)]
    bb = B(); bb.loft([face(t), face(0.0), face(-t)], G_BODY, cap0=G_BODY, cap1=G_BODY)
    return bb
fins = []
for nm, phi, (a_le, a_te, span, tl, tt) in (('fin_top', 0.0, (2.42, 2.68, 0.20, 2.62, 2.78)), ('fin_xp', 100.0, (2.49, 2.72, 0.19, 2.69, 2.84)), ('fin_xn', -100.0, (2.49, 2.72, 0.19, 2.69, 2.84))):
    bb = fin(phi, a_le, a_te, span, tl, tt, 0.0065); fins.append(bb.finish('MLD_' + nm, sharp_deg=26))

bpy.context.view_layer.update()
mk.GEO = dict(L=L, A_END=A_END, A_PIV=A_PIV, SPAN=SPAN, LUG_TOP=LUG_TOP, Z1=Z1, Z2=Z2, T_R=T_R)
mk.WING = WING
mk.Yb_ = Yb
mk.stats()
print('упоры до', round(LUG_TOP, 3), 'крылья: z', round(Z1, 3), round(Z2, 3))
print('сцена MALD построена')
