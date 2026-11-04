# Ложная цель-имитатор (w_decoy_e) - своя выдуманная форма по описанию задания, картинок нет. Не копия настоящего изделия: пропорции, крылья, оперение и детали свои.
# Метры: ось корпуса Y, нос +Y (в glTF -Z), верх +Z (в glTF +Y), начало на оси посередине длины 2,80 м. a - расстояние от острия носа. Запуск:
# DCE_OUT="<папка>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python _collide.py --python bake.py --python deliver.py
#
# СОСТАВ:
#  + корпус слегка квадратного сечения (K: скруглённый брус), носовой обтекатель круглого сечения, канавки стыков отсеков, сужение к соплу
#  + сопло на оси, полое изнутри; за a = 2,716 (последние 3 %) ничего шире корпуса нет
#  + воздухозаборник сверху у хвоста: горб с открытой тёмной горловиной, ниже верха упоров
#  + два упора сверху на осевой линии, кабельный короб между ними и воздухозаборником, боковые обтекатели, две антенны снизу
#  + неподвижная подложка крыльев снизу (DCE_box): плоское дно, шарниры закрыты сверху; корень крыла прилегает к ней
#  + крылья wing1 (+X), wing2 (-X): вертикальная ось у корня по передней кромке, сложены назад под подложкой; раскрытие 80° (стреловидность 10°, как раскрывает игра)
#  + хвостовые рули rudder_0…3 крестом × к упорам: радиальная ось, ход ±20°; не выше упоров и не заходят за a = 2,716
#  - заклёпки, лючки, надписи, световая полоса - цветом и рельефом в bake.py
import sys, os, math, importlib
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
import bpy
import modelkit as mk; importlib.reload(mk)
from modelkit import B, Vector

L = 2.80; R = 0.16; NSEG = 44
mk.configure('DECOY_E', 0.001, x0=0.0, yc=0.0, rb=R / 0.001, nseg=NSEG, nose='left')
G_BODY, G_STEEL, G_DARK = 0, 1, 2
mk.set_materials([('DCE_body', (0.24, 0.27, 0.22)), ('DCE_steel', (0.16, 0.16, 0.16)), ('DCE_dark', (0.02, 0.02, 0.02))])
for m, (rough, metal) in zip(mk.MATS, ((0.54, 0.0), (0.44, 0.65), (0.75, 0.2))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
Yb = lambda a: L / 2 - a
A_NOSE, A_SQ0, A_SQ1, A_TAIL0, A_NOZ = 0.46, 0.46, 0.62, 2.28, 2.70
PHI = (45.0, 135.0, 225.0, 315.0)


def axes(phi):
    ph = math.radians(phi)
    return Vector((math.cos(ph), 0.0, math.sin(ph))), Vector((-math.sin(ph), 0.0, math.cos(ph)))


def nose_r(a):
    """Обтекатель: оживало с тупым кончиком."""
    t = min(a / A_NOSE, 1.0)
    return R * math.sqrt(1.0 - (1.0 - t) ** 2.25) * (1.0 - 0.0) ** 1


def sq(a):
    """Доля квадратности сечения: у носа и хвоста круг, посередине скруглённый брус."""
    u = max(0.0, min(1.0, (a - A_SQ0) / (A_SQ1 - A_SQ0))); v = max(0.0, min(1.0, (2.46 - a) / 0.20))
    return u * u * (3 - 2 * u) * v * v * (3 - 2 * v)


def sec_pts(a, r, n=NSEG):
    p = 2.0 + 0.9 * sq(a); pts = []
    for j in range(n):
        t = 2 * math.pi * j / n - math.pi / 2                      # шов развёртки снизу
        c, s = math.cos(t), math.sin(t); k = (abs(c) ** p + abs(s) ** p) ** (-1.0 / p)
        pts.append(Vector((r * k * c, Yb(a), r * k * s)))
    return pts


TAIL = [(2.28, R), (2.36, 0.156), (2.44, 0.145), (2.52, 0.131), (2.60, 0.116), (2.68, 0.098), (2.70, 0.094)]
def R_at(a):
    if a <= A_NOSE: return nose_r(a)
    if a >= 2.28:
        for (a0, r0), (a1, r1) in zip(TAIL, TAIL[1:]):
            if a0 <= a <= a1: return r0 + (r1 - r0) * (a - a0) / (a1 - a0)
        return 0.094
    return R


def groove(a, r=R, d=0.0032, w=0.0045):
    return [(a - w, r), (a - w * 0.3, r - d), (a + w * 0.3, r - d), (a + w, r)]


PROF = [(a, nose_r(a)) for a in (0.002, 0.012, 0.03, 0.06, 0.10, 0.15, 0.21, 0.28, 0.36, 0.43)] + [(0.455, R)] + groove(0.462) + [(0.62, R)] + groove(0.92) + groove(1.70) + [(2.24, R)] + groove(2.262) + TAIL
# сопло на оси, полое: срез корпуса, наружный конус, кромка, внутренняя стенка, горло, дно
NOZ = [(A_NOZ + 0.004, 0.092), (A_NOZ + 0.010, 0.087), (A_NOZ + 0.018, 0.084), (2.79, 0.072), (2.80, 0.069), (2.80, 0.064), (2.74, 0.044), (2.70, 0.030), (2.665, 0.030), (2.665, 0.003)]
b = B(); rings = [sec_pts(a, r) for a, r in PROF]; b.loft(rings, G_BODY, cap0=G_BODY); 
body_rings = len(rings)
last = rings[-1]
bn_r = [sec_pts(a, r) for a, r in NOZ]
b.loft([last] + bn_r, [G_BODY, G_STEEL, G_STEEL, G_STEEL, G_STEEL, G_STEEL, G_DARK, G_DARK, G_DARK, G_DARK], cap1=G_DARK)
import bmesh
bmesh.ops.remove_doubles(b.bm, verts=b.bm.verts[:], dist=1e-7)
body = b.finish('DCE_body', sharp_deg=36)
print('корпус: колец', body_rings + len(NOZ))

# ── неподвижные детали ──
bf = B()
W_BOX, Z_BOX, A_BOX0, A_BOX1 = 0.178, -0.196, 0.88, 1.74
def box_sec(a, w, zf):
    return [Vector((x, Yb(a), z)) for x, z in ((-w * 0.8, -0.075), (-w, -0.095), (-w, zf + 0.018), (-w * 0.94, zf), (0.0, zf), (w * 0.94, zf), (w, zf + 0.018), (w, -0.095), (w * 0.8, -0.075), (0.0, -0.10))]
bf.loft([box_sec(a, w, z) for a, w, z in ((A_BOX0, 0.148, -0.170), (A_BOX0 + 0.05, W_BOX - 0.006, Z_BOX + 0.004), (A_BOX0 + 0.09, W_BOX, Z_BOX), (A_BOX1 - 0.10, W_BOX, Z_BOX), (A_BOX1 - 0.03, 0.170, -0.186), (A_BOX1, 0.150, -0.170))], G_BODY, cap0=G_BODY, cap1=G_BODY)
# воздухозаборник сверху: горб, горловина утоплена и темна
A_IN0, A_IN1, W_IN, H_IN = 1.86, 2.34, 0.082, 0.054
def hump(a, w, h, zb=None):
    r0 = R_at(a) * 0.97; zt = R_at(a) + h
    return [Vector((x, Yb(a), z)) for x, z in ((-w, r0 * 0.93), (-w, zt - h * 0.28), (-w * 0.74, zt), (w * 0.74, zt), (w, zt - h * 0.28), (w, r0 * 0.93))]
ST = [(A_IN0, W_IN, H_IN), (A_IN0 + 0.06, W_IN + 0.002, H_IN + 0.003), (A_IN0 + 0.20, W_IN - 0.006, H_IN * 0.82), (A_IN0 + 0.36, W_IN - 0.022, H_IN * 0.36), (A_IN1, W_IN - 0.036, 0.002)]
bf.loft([hump(a, w, h) for a, w, h in ST], G_BODY, cap1=G_BODY)
fr = hump(A_IN0, W_IN, H_IN); inn = [Vector((p.x * 0.80, p.y, p.z)) for p in hump(A_IN0, W_IN, H_IN * 0.82)]
deep = [Vector((p.x * 0.62, Yb(A_IN0 + 0.11), p.z - 0.003)) for p in inn]
bf.loft([fr, inn], G_BODY); bf.loft([inn, deep], G_DARK, cap1=G_DARK)
def lug(ac):
    r0 = R_at(ac); hw, h, t = 0.030, 0.075, 0.014
    OUT = [(-hw * 1.06, -0.012), (hw * 1.06, -0.012), (hw * 1.06, 0.006), (hw, 0.014), (hw * 0.90, 0.056), (hw * 0.60, h), (-hw * 0.60, h), (-hw * 0.90, 0.056), (-hw, 0.014), (-hw * 1.06, 0.006)]
    hc = 0.038; hr, hz = 0.015, 0.019; n = 18; segs = list(zip(OUT, OUT[1:] + OUT[:1]))
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
    bf.loft([disc(0.048, -0.008), disc(0.048, 0.007), disc(0.040, 0.011)], G_STEEL, cap1=G_STEEL)
A_LUG1, A_LUG2 = 0.98, 1.34
LUG_TOP = R + 0.075
lug(A_LUG1); lug(A_LUG2)
# кабельный короб по верху: от носовой части к переднему упору и между задним упором и воздухозаборником
def tunnel(a0, a1, w, h):
    sec_ = lambda a, ww, hh: [Vector((x, Yb(a), z)) for x, z in ((-ww, R - 0.006), (-ww, R + hh * 0.7), (-ww * 0.7, R + hh), (ww * 0.7, R + hh), (ww, R + hh * 0.7), (ww, R - 0.006))]
    bf.loft([sec_(a0, w * 0.6, 0.001), sec_(a0 + 0.03, w, h), sec_(a1 - 0.03, w, h), sec_(a1, w * 0.6, 0.001)], G_BODY, cap0=G_BODY, cap1=G_BODY)
tunnel(0.54, 0.91, 0.020, 0.012); tunnel(1.40, 1.84, 0.020, 0.012)
# боковые обтекатели на бортах и хомуты на коробе не делаем выше упоров
for s in (1.0, -1.0):
    def pod(a, w, h):
        xb = R * 1.02
        return [Vector((s * xb * 0.97, Yb(a), z)) for z in (-h, h)] + [Vector((s * (xb + w), Yb(a), z)) for z in (h * 0.75, 0.0, -h * 0.75)]
    rr = [pod(a, w, h) for a, w, h in ((0.60, 0.002, 0.012), (0.66, 0.018, 0.032), (0.90, 0.020, 0.036), (1.05, 0.014, 0.026), (1.14, 0.002, 0.010))]
    bf.loft([r_ if s > 0 else r_[::-1] for r_ in rr], G_BODY, cap0=G_BODY, cap1=G_BODY)
    # кольца рулей и выступы приводов задаются ниже
# две антенны снизу у носа (своя форма: узкие скошенные пластины)
for ac, h in ((0.56, 0.065), (0.74, 0.050)):
    plate = [(ac + 0.040, -R - 0.002), (ac - 0.015, -R - h), (ac - 0.040, -R - h), (ac - 0.012, -R - 0.002)]
    t = 0.004
    bf.loft([[Vector((-t, Yb(a), z)) for a, z in plate], [Vector((t, Yb(a), z)) for a, z in plate]], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
fixed = bf.finish('DCE_fixed', sharp_deg=36)

# ── крылья: сложены назад под подложкой ──
A_WP = 1.00; X_WP = 0.165; Z_WP = Z_BOX - 0.0085; SPAN, CH_R, CH_T, T_R, T_T = 0.68, 0.150, 0.082, 0.014, 0.006
WING_OPEN = 80.0
WING = {}
for k, side in ((1, 1.0), (2, -1.0)):
    o = Vector((side * X_WP, Yb(A_WP), Z_WP))
    def sec_w(ax, ch, t):
        pts = []
        for f, zz in ((0.0, 0.0), (0.14, 0.5), (0.42, 0.5), (1.0, 0.0), (0.42, -0.5), (0.14, -0.5)):
            pts.append(Vector((side * (X_WP - f * ch), Yb(ax), Z_WP + zz * t)) - o)
        return pts if side > 0 else pts[::-1]
    bw = B()
    # кромки: прямая передняя, задняя скошена; конец с наклонным срезом и излом у 60 % размаха (своя форма)
    bw.loft([sec_w(A_WP, CH_R, T_R), sec_w(A_WP + SPAN * 0.60, CH_R * 0.86, (T_R + T_T) / 2), sec_w(A_WP + SPAN * 0.95, CH_T, T_T), sec_w(A_WP + SPAN, CH_T * 0.55, T_T * 0.6)], G_BODY, cap0=G_BODY, cap1=G_BODY)
    nh = 12
    hub = lambda rd, zz: [Vector((side * (-0.030 - rd * math.cos(2 * math.pi * j / nh)), -0.030 + rd * math.sin(2 * math.pi * j / nh) * side, zz - Z_WP)) for j in range(nh)]
    hb = [hub(0.024, Z_WP - 0.004), hub(0.024, Z_WP - 0.012), hub(0.016, Z_WP - 0.015)]
    bw.loft(hb if side > 0 else [r_[::-1] for r_ in hb], G_STEEL, cap1=G_STEEL)
    ob = bw.finish(f'wing{k}', sharp_deg=30); ob.location = o
    WING[k] = dict(o=o.copy(), open_deg=side * WING_OPEN)

# ── хвостовые рули ──
A_RUD = 2.44; R_RTIP = 0.312; RUD_RANGE = 20.0
def r45(a):
    """Радиус корпуса на диагонали «×» с учётом квадратности сечения."""
    p = 2.0 + 0.9 * sq(a); return R_at(a) * (2.0 * math.sqrt(0.5) ** p) ** (-1.0 / p)
RUD = {}
for k, phi in enumerate(PHI):
    er, et = axes(phi); r0 = r45(A_RUD) + 0.002; o = Vector((0, Yb(A_RUD), 0)) + er * r0
    P_ = lambda a, r, w: Vector((0, Yb(a), 0)) + er * r + et * w - o
    OUT = [(2.34, r45(2.34) + 0.005), (2.51, R_RTIP), (2.60, R_RTIP), (2.635, R_RTIP - 0.05), (2.61, r45(2.61) + 0.005)]
    INN = [(2.375, r45(2.375) + 0.005), (2.515, R_RTIP - 0.006), (2.595, R_RTIP - 0.006), (2.625, R_RTIP - 0.052), (2.595, r45(2.595) + 0.005)]
    bb = B(); t = 0.0075
    face = lambda pts, w: [P_(a, r, w) for a, r in pts]
    bb.loft([face(INN, t), face(OUT, 0.0), face(INN, -t)], G_BODY, cap0=G_BODY, cap1=G_BODY)
    ob = bb.finish(f'rudder_{k}', sharp_deg=26); ob.location = o
    RUD[k] = dict(o=o.copy(), axis=er.copy())
# кольца под осями рулей
bs = B(); n = 12
for phi in PHI:
    er, et = axes(phi); oc = Vector((0, Yb(A_RUD), 0)) + er * r45(A_RUD); X = Vector((0, 1, 0))
    ring = lambda rr, ro: [oc + er * rr + (X * math.cos(2 * math.pi * j / n) + et * math.sin(2 * math.pi * j / n)) * ro for j in range(n)]
    bs.loft([ring(-0.012, 0.034), ring(-0.001, 0.034), ring(0.0005, 0.028)], G_BODY, cap1=G_BODY)
seats = bs.finish('DCE_seats', sharp_deg=30)

bpy.context.view_layer.update()
mk.GEO = dict(L=L, R=R, NSEG=NSEG, SEAMS=(0.462, 0.92, 1.70, 2.262), A_NOSE=A_NOSE, WING_OPEN=WING_OPEN, RUD_RANGE=RUD_RANGE, LUG_TOP=LUG_TOP, RUD_TOP=R_RTIP * math.sin(math.radians(45)), BOX=(A_BOX0, A_BOX1), BODY_RINGS=body_rings + len(NOZ))
mk.WING, mk.RUD = WING, RUD
mk.Yb_ = Yb
mk.stats()
print('упоры до', round(LUG_TOP, 3), 'рули до', round(mk.GEO['RUD_TOP'], 3), 'горб', round(R + H_IN, 3))
print('сцена DECOY_E построена')
