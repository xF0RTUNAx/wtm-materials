# BGM-109 Tomahawk Block IV (w_tomahawk) - своя модель по фото Mark (референсы/tlam_02, 04 - настоящие; 01, 03, 05 - только форма). Метры: ось Y, нос +Y (в glTF -Z),
# верх +Z (в glTF +Y), начало на оси посередине длины 5,56 м. a - расстояние от острия. В файле всё сложено, как в пусковом контейнере, углы 0. Запуск:
# TH_OUT="<папка>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python _collide.py [--python _виды.py | --python bake.py --python deliver.py]
#
# Фото 02 сбоку: 301 пикс/м (5,56 м); корпус Ø 0,52; тупой купол носа до a ~0,45 со швом; чёрная полоса a ~0,85-1,0; крыло a ~2,56-2,86; хвостовой конус от a ~5,0, сопло на конце;
# рули крестом «+» у конца (корень a ~5,22-5,52, вылет ~0,34). Фото 04, 05: воздухозаборник снизу a ~3,85-4,45.
# ПОДВИЖНЫЕ: wing1 (x+), wing2 (x-) - сложены внутри корпуса вперёд, одна над другой, выходят через щели в бортах чуть выше оси корпуса поворотом на 90° вокруг вертикальной оси у корня;
#   fin1..fin4 - рули «+», сложены поворотом на 90° вокруг шарнира вдоль корня (лежат на хвостовом конусе); intake - лежит заподлицо с обшивкой, выходит поворотом вниз вокруг заднего шарнира.
import sys, os, math, importlib
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
import bpy, bmesh
import modelkit as mk; importlib.reload(mk)
from modelkit import B, Vector
from mathutils import Matrix

L = 5.56; R = 0.26; NSEG = 40
mk.configure('TLAM', 0.001, x0=0.0, yc=0.0, rb=260.0, nseg=NSEG, nose='left')
G_BODY, G_METAL, G_DARK, G_WING = 0, 1, 2, 3
mk.set_materials([('TH_body', (0.80, 0.81, 0.82)), ('TH_metal', (0.45, 0.46, 0.47)), ('TH_dark', (0.03, 0.03, 0.03)), ('TH_wing', (0.80, 0.81, 0.82))])
for m, (rough, metal) in zip(mk.MATS, ((0.45, 0.05), (0.40, 0.8), (0.85, 0.0), (0.45, 0.05))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
Yb = lambda a: L / 2 - a
LN = 0.45                                                       # купол носа (02, 05)
A_T0, A_T1, R_T1 = 5.00, 5.50, 0.150                            # хвостовой конус и сопло
SEAMS = (0.45, 1.30, 2.40, 3.15, 4.60)
W_PIV, W_C0, W_C1, W_SPAN = 2.71, 0.30, 0.26, 1.30               # крыло: ось у корня посередине хорды, хорды у корня и конца, длина консоли
W_Z = {1: 0.045, 2: 0.075}                                      # высоты консолей: одна над другой, чуть выше оси корпуса (Mark 2026-11-09: крылья выше)
F_A0, F_A1, F_SPAN = 5.22, 5.52, 0.34                           # рули
I_A0, I_A1, I_ANG, I_OPEN = 3.85, 4.45, 40.0, -13.0             # воздухозаборник: по длине, полуугол по окружности снизу, ход


def r_body(a):
    if a <= LN: t = 1 - a / LN; return R * max(0.0, 1 - t ** 2.2) ** (1 / 2.2)
    if a <= A_T0: return R
    u = (a - A_T0) / (A_T1 - A_T0); return R - (R - R_T1) * (1 - math.cos(u * math.pi / 2)) ** 0.9


def ring(a, r, n=NSEG):
    return [Vector((r * math.cos(2 * math.pi * j / n), Yb(a), r * math.sin(2 * math.pi * j / n))) for j in range(n)]


def _apply_bool(host, cutter, op):
    vl = bpy.context.view_layer
    for o in list(vl.objects):
        if o is not None: o.select_set(False)
    vl.objects.active = host; host.select_set(True)
    md = host.modifiers.new('b', 'BOOLEAN'); md.operation = op; md.object = cutter
    try: md.solver = 'MANIFOLD'
    except Exception: md.solver = 'EXACT'
    bpy.ops.object.modifier_apply(modifier=md.name)
    me = cutter.data; bpy.data.objects.remove(cutter); bpy.data.meshes.remove(me)


# ── корпус: купол, швы-ступеньки, цилиндр, хвостовой конус; сопло - тёмная чашка ──
nose = [LN * (1 - math.cos(math.pi / 2 * k / 9)) for k in range(1, 10)]
PROF = [(0.0008, r_body(0.0008)), (0.004, r_body(0.004))] + [(a, r_body(a)) for a in nose[:-1]]
for s in SEAMS: PROF += [(s - 0.006, R), (s - 0.003, R - 0.0025), (s + 0.003, R - 0.0025), (s + 0.006, R)]
PROF += [(A_T0, R)] + [(A_T0 + (A_T1 - A_T0) * k / 6, r_body(A_T0 + (A_T1 - A_T0) * k / 6)) for k in range(1, 7)] + [(L - 0.01, R_T1 - 0.004), (L, R_T1 - 0.012), (L, 0.112), (L - 0.12, 0.108), (L - 0.12, 0.030)]
PROF = sorted(set(PROF), key=lambda p: (p[0], p[1] if p[0] < 0.01 else -p[1]))
b = B(); rr = [ring(a, max(r, 0.0006)) for a, r in PROF]
mats = [G_DARK if a0 >= L - 1e-6 and a1 >= L - 0.13 and r1 < 0.115 else G_BODY for (a0, _), (a1, r1) in zip(PROF, PROF[1:])]
b.loft(rr, mats, cap0=G_BODY, cap1=G_DARK)                      # корпус замкнут: иначе вычитание щелей не работает
bmesh.ops.remove_doubles(b.bm, verts=b.bm.verts[:], dist=1e-6)
body = b.finish('TH_body', sharp_deg=34)
# щели крыла в бортах чуть выше оси (Mark): тёмные стенки от реза; ниша воздухозаборника
for k, sx in ((1, 1.0), (2, -1.0)):
    z0 = W_Z[k]; h = 0.020; a0, a1 = W_PIV - W_SPAN - 0.04, W_PIV + W_C0 / 2 + 0.03
    bc = B(); bc.loft([[Vector((sx * x, Yb(a), z0 + dz)) for x, dz in ((-0.17, -h), (0.40, -h), (0.40, h), (-0.17, h))] for a in (a0, a1)], G_DARK, cap0=G_DARK, cap1=G_DARK)
    _apply_bool(body, bc.finish('c_slot', sharp_deg=20), 'DIFFERENCE')
xi = R * math.sin(math.radians(I_ANG)) + 0.006
bc = B(); bc.loft([[Vector((x, Yb(a), z)) for x, z in ((-xi, -R - 0.10), (xi, -R - 0.10), (xi, -R + 0.24), (-xi, -R + 0.24))] for a in (I_A0 - 0.035, I_A1 + 0.020)], G_DARK, cap0=G_DARK, cap1=G_DARK)
_apply_bool(body, bc.finish('c_intake', sharp_deg=20), 'DIFFERENCE')

WING = {}
def place(ob, pivot, axis, open_deg, name, **kw):
    """Строим раскрытым относительно оси, в файле - сложено: поворот на -open_deg."""
    M = Matrix.Rotation(math.radians(-open_deg), 4, axis)
    for v in ob.data.vertices: v.co = M @ v.co
    ob.data.update(); ob.location = pivot
    WING[name] = dict(o=pivot.copy(), axis=axis.copy(), open_deg=open_deg, **kw)


# ── крыло: две консоли, профиль - линза, конец срезан ──
def foil(a_le, c, t, x, z, n=8):
    up = [(a_le + c * (1 - math.cos(math.pi * i / n)) / 2, t * 0.5 * math.sin(math.pi * (1 - math.cos(math.pi * i / n)) / 2) ** 0.8) for i in range(n + 1)]
    return [Vector((x, Yb(a), z + h)) for a, h in up] + [Vector((x, Yb(a), z - h)) for a, h in reversed(up[1:-1])]
for k, sx in ((1, 1.0), (2, -1.0)):
    z = W_Z[k]; piv = Vector((0.0, Yb(W_PIV), z)); secs = []
    for s in (0.0, 0.25, 0.55, 0.85, 1.0):
        c = W_C0 + (W_C1 - W_C0) * s; a_le = W_PIV - W_C0 / 2 + 0.02 * s; x = sx * W_SPAN * s
        if s == 1.0: a_le += 0.03; c -= 0.05                    # срез конца (05)
        secs.append([p - piv for p in foil(a_le, c, 0.022 - 0.006 * s, x, z)])
    bw = B(); bw.loft(secs, G_WING, cap0=G_WING, cap1=G_WING); ob = bw.finish(f'wing{k}', sharp_deg=40)
    place(ob, piv, Vector((0, 0, 1)), -90.0 if sx > 0 else 90.0, f'wing{k}', kind='wing')

# ── рули «+»: шарнир вдоль корня на хвостовом конусе ──
for k, phi in enumerate((90.0, 0.0, 270.0, 180.0), start=1):    # fin1 сверху, fin2 справа (x+), fin3 снизу, fin4 слева
    ph = math.radians(phi); er = Vector((math.cos(ph), 0.0, math.sin(ph))); et = Vector((-math.sin(ph), 0.0, math.cos(ph)))
    P = lambda a, r, w: Vector((0.0, Yb(a), 0.0)) + er * r + et * w
    rl, rt = r_body(F_A0) + 0.018, r_body(F_A1) + 0.018             # шарнир над обшивкой: сложенный руль ложится на конус без врезания
    pl, pt_ = P(F_A0, rl, 0.0), P(F_A1, rt, 0.0); piv = (pl + pt_) / 2; ax = (pt_ - pl).normalized()
    secs = []
    for s in (0.0, 0.5, 1.0):
        a0 = F_A0 + 0.07 * s; a1 = F_A1 + 0.01 * s; r0 = r_body(a0) - 0.004 + F_SPAN * s if s > 0 else None
        t = 0.012 - 0.004 * s
        if s == 0.0: secs.append([P(F_A0, rl, -t / 2), P(F_A1, rt, -t / 2), P(F_A1, rt, t / 2), P(F_A0, rl, t / 2)])
        else:
            rr0 = (rl + rt) / 2 + F_SPAN * s; secs.append([P(a0, rr0 + (rl - rt) / 2 * (1 - s), -t / 2), P(a1, rr0 - (rl - rt) / 2 * (1 - s), -t / 2), P(a1, rr0 - (rl - rt) / 2 * (1 - s), t / 2), P(a0, rr0 + (rl - rt) / 2 * (1 - s), t / 2)])
    bf = B(); bf.loft([[p - piv for p in sec] for sec in secs], G_WING, cap0=G_WING, cap1=G_WING); ob = bf.finish(f'fin{k}', sharp_deg=40)
    place(ob, piv, ax, -90.0, f'fin{k}', kind='fin')

# ── воздухозаборник: днище по обшивке, боковины вверх в корпус, тёмный канал; шарнир сзади ──
piv = Vector((0.0, Yb(I_A1 + 0.004), -R - 0.004)); n_ = 10; ang = math.radians(I_ANG)     # шарнир у внешней кромки сзади
def arc(a, rad): return [Vector((rad * math.sin(-ang + 2 * ang * q / n_), Yb(a), -rad * math.cos(-ang + 2 * ang * q / n_))) for q in range(n_ + 1)]
bi = B()
outer = [arc(a, R - 0.002) for a in (I_A0, I_A0 + 0.05, I_A1 - 0.04, I_A1)]; inner = [arc(a, R - 0.018) for a in (I_A0, I_A0 + 0.05, I_A1 - 0.04, I_A1)]
bi.loft([o_ + i_[::-1] for o_, i_ in zip(outer, inner)], G_BODY, cap0=G_BODY, cap1=G_BODY)        # днище-створка
for sg in (1, -1):                                              # боковины: от кромок днища вверх в корпус на 0,16
    xs = sg * (R - 0.002) * math.sin(ang); zb = -(R - 0.002) * math.cos(ang)
    sec = lambda a, w: [Vector((xs - sg * w, Yb(a), zb)), Vector((xs, Yb(a), zb)), Vector((xs, Yb(a), zb + 0.14)), Vector((xs - sg * w, Yb(a), zb + 0.14))]
    bi.loft([sec(I_A0 + 0.004, 0.012), sec(I_A1 - 0.004, 0.012)], G_BODY, cap0=G_BODY, cap1=G_BODY)
wz = -(R - 0.002) * math.cos(ang)
bi.loft([[Vector((x, Yb(a), z)) for x, z in ((-0.15, -R + 0.02), (0.15, -R + 0.02), (0.15, wz + 0.09), (-0.15, wz + 0.09))] for a in (I_A0 + 0.10, I_A1 - 0.02)], G_DARK, cap0=G_DARK, cap1=G_DARK)   # тёмный канал внутри
ob = bi.finish('intake', sharp_deg=40)
for v in ob.data.vertices: v.co -= piv
ob.location = piv; WING['intake'] = dict(o=piv.copy(), axis=Vector((1, 0, 0)), open_deg=I_OPEN, kind='intake')

bpy.context.view_layer.update()
NOZ = Vector((0.0, Yb(L), 0.0))
mk.GEO = dict(L=L, R=R, LN=LN, SEAMS=SEAMS, W_PIV=W_PIV, W_Z=W_Z, F=(F_A0, F_A1, F_SPAN), I=(I_A0, I_A1), NOZ=NOZ, R_NOZ=0.112)
mk.WING = WING; mk.Yb_ = Yb
mk.stats()
print('сцена TLAM построена', {k: v['open_deg'] for k, v in WING.items()})
