# Х-29Т — внешняя игровая модель по чертежам Mark (Свои/Х-29Т/1-7.png).
# Единицы: метры. Нос — +Y (в glTF уйдёт в −Z, как у w_nar_*), начало — середина длины, ось — вдоль Y.
# Все размеры ниже — в пикселях чертежа 4.png (нос слева), переводятся в метры множителем S.
import bpy, bmesh, math
from mathutils import Vector

S = 3.896 / 1093.0          # метров на пиксель (длина как у прежней модели в игре — 3,896 м)
X0, YC = 604.0, 118.8       # середина длины и ось корпуса на чертеже (пиксели)
RB = 54.0                   # радиус корпуса, пикс.
NSEG = 32
TOTAL_BUDGET = {}

def Y(x): return (X0 - x) * S

# ───────────────────────── сцена и материалы ─────────────────────────
sc = bpy.data.scenes.get('KH29T') or bpy.data.scenes.new('KH29T')
try:
    bpy.context.window.scene = sc
except Exception as e:
    print('не удалось переключить сцену:', e)
col = bpy.data.collections.get('KH29T') or bpy.data.collections.new('KH29T')
if col.name not in [c.name for c in sc.collection.children]:
    sc.collection.children.link(col)
for o in list(col.objects):
    if o.type != 'MESH': continue          # камеру для рендера оставляем
    me = o.data
    bpy.data.objects.remove(o, do_unlink=True)
    if me.users == 0: bpy.data.meshes.remove(me)

def mk(name, rgb, rough=0.55, metal=0.2):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    m.diffuse_color = (rgb[0], rgb[1], rgb[2], 1.0)
    return m

M_BODY, M_WING, M_CTRL, M_DARK = 0, 1, 2, 3
MATS = [mk('K29_body', (0.50, 0.51, 0.49)), mk('K29_wing', (0.40, 0.41, 0.40)),
        mk('K29_ctrl', (0.22, 0.23, 0.23)), mk('K29_dark', (0.035, 0.036, 0.04))]

# ───────────────────────── построитель ─────────────────────────
class B:
    def __init__(self): self.bm = bmesh.new()
    def loft(self, rings, mats, cap0=None, cap1=None):
        bm = self.bm
        vs = [[bm.verts.new(p) for p in ring] for ring in rings]
        n = len(vs[0])
        for i in range(len(vs) - 1):
            mi = mats[i] if isinstance(mats, (list, tuple)) else mats
            for j in range(n):
                f = bm.faces.new((vs[i][j], vs[i][(j + 1) % n], vs[i + 1][(j + 1) % n], vs[i + 1][j]))
                f.material_index = mi
        if cap0 is not None:
            f = bm.faces.new(vs[0][::-1]); f.material_index = cap0
        if cap1 is not None:
            f = bm.faces.new(vs[-1]); f.material_index = cap1
    def finish(self, name, sharp_deg=32):
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        lim = math.radians(sharp_deg)
        for f in bm.faces: f.smooth = True
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > lim: e.smooth = False
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        for m in MATS: me.materials.append(m)
        ob = bpy.data.objects.new(name, me); col.objects.link(ob)
        return ob

def circ(x, R, n=NSEG, cx=0.0, cz=0.0):
    return [Vector((cx * S + R * S * math.cos(2 * math.pi * k / n), Y(x), cz * S + R * S * math.sin(2 * math.pi * k / n))) for k in range(n)]

# ───────────────────────── корпус (вращение) ─────────────────────────
# (x, R, материал полосы до следующего кольца)
BASE = [
    (76.0, 38.0, M_BODY), (77.0, 41.5, M_BODY), (79.5, 44.0, M_BODY), (83.5, 46.0, M_BODY), (90.0, 47.0, M_BODY),
    (108.0, 47.0, M_BODY), (139.0, 53.0, M_BODY), (139.0, 54.0, M_BODY),          # уступ у передней секции
    (1118.0, 54.0, M_BODY), (1146.0, 41.0, M_BODY), (1148.0, 41.0, M_DARK),        # хвостовой конус
    (1148.0, 36.0, M_DARK), (1141.0, 32.0, M_DARK), (1139.0, 24.0, M_DARK),        # торец и чаша сопла
]
GROOVES = [(90.0, 0.9, 0.9), (108.0, 0.9, 0.9), (235.0, 2.0, 1.1), (405.0, 2.4, 1.1), (500.0, 0.8, 0.7),
           (565.0, 0.8, 0.7), (680.0, 2.0, 1.1), (1112.0, 1.0, 0.8)]            # стыки отсеков

def profile(base, grooves):
    out = []
    for i in range(len(base) - 1):
        xa, Ra, ma = base[i]; xb, Rb, _ = base[i + 1]
        out.append((xa, Ra, ma))
        if xb > xa:
            Rat = lambda x: Ra + (Rb - Ra) * (x - xa) / (xb - xa)
            for gx, hw, d in sorted(g for g in grooves if xa + 0.01 <= g[0] - g[1] and g[0] + g[1] <= xb - 0.01):
                out += [(gx - hw, Rat(gx - hw), M_DARK), (gx - hw, Rat(gx - hw) - d, M_DARK),
                        (gx + hw, Rat(gx + hw) - d, M_DARK), (gx + hw, Rat(gx + hw), ma)]
    out.append(base[-1])
    return out

prof = profile(BASE, GROOVES)
b = B()
b.loft([circ(x, R) for x, R, _ in prof], [m for _, _, m in prof[:-1]], cap0=M_DARK, cap1=M_DARK)
ob_body = b.finish('K29_body')

# ───────────────────────── поверхности крыльев ─────────────────────────
def foil(phi, r, xle, xte, t, pr):
    ph = math.radians(phi)
    d = Vector((math.cos(ph), 0.0, math.sin(ph))); nr = Vector((-math.sin(ph), 0.0, math.cos(ph)))
    P = lambda x, n: Vector((0.0, Y(x), 0.0)) + (d * r + nr * n) * S
    up = [P(xle + f * (xte - xle), +h * t / 2) for f, h in pr]
    lo = [P(xle + f * (xte - xle), -h * t / 2) for f, h in pr]
    return (up + lo[::-1]) if pr[0][1] > 0 else (up + lo[::-1][:-1])

def panel(b, phi, stations, pr, mat):
    b.loft([foil(phi, r, xl, xt, t, pr) for r, xl, xt, t in stations], mat, cap0=mat, cap1=mat)

PR_WING = [(0.0, 0.0), (0.14, 1.0), (0.88, 1.0), (1.0, 0.55)]                 # острая передняя кромка со скосом, тупая задняя
PR_PLATE = [(0.0, 0.0), (0.18, 1.0), (0.85, 1.0), (1.0, 0.6)]
PR_FLAP = [(0.0, 0.78), (0.06, 0.95), (0.94, 0.95), (1.0, 0.78)]
tw = lambda r: 13.5 - (r - 51.0) * (7.0 / 101.7)                               # толщина крыла по радиусу
AZ = (45.0, 135.0, 225.0, 315.0)

b = B()
for phi in AZ:
    panel(b, phi, [(51.0, 655.0, 1080.0, tw(51.0)), (77.8, 678.0, 1080.0, tw(77.8)), (152.7, 950.0, 1080.0, tw(152.7))], PR_WING, M_WING)
ob_wings = b.finish('K29_wings')

b = B()
for phi in AZ:
    panel(b, phi, [(53.0, 1055.0, 1080.0, tw(53.0) + 1.6), (112.0, 1055.0, 1080.0, tw(112.0) + 1.6)], PR_FLAP, M_CTRL)
ob_flaps = b.finish('K29_elevons')

b = B()
for phi in AZ:
    panel(b, phi, [(51.0, 197.0, 312.0, 6.0), (106.0, 278.0, 312.0, 4.2)], PR_PLATE, M_WING)          # передние рули
    panel(b, phi, [(51.0, 129.0, 243.0, 5.0), (82.7, 145.0, 205.0, 4.0)], PR_PLATE, M_WING)            # передние гребни (наплывы)
ob_canards = b.finish('K29_canards')

# ───────────────────────── накладки на корпус (по цилиндру) ─────────────────────────
def rrect(hw, hh, rad, k=3):
    pts = []
    for cx, cy, a0 in ((hw - rad, hh - rad, 0), (-hw + rad, hh - rad, 90), (-hw + rad, -hh + rad, 180), (hw - rad, -hh + rad, 270)):
        for i in range(k + 1):
            a = math.radians(a0 + 90.0 * i / k); pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    return pts

def ell(rx, rz, n=10):
    return [(rx * math.cos(2 * math.pi * i / n), rz * math.sin(2 * math.pi * i / n)) for i in range(n)]

def decal(b, x, z, shape, side, h, mat, theta=None):
    """Накладка на цилиндр R=RB: центр x (пикс.), z — высота центра (пикс.), side = +1 (борт +X) или −1 (борт −X),
    shape — контур [(dx, dt)] в пикселях (dt — вдоль дуги); theta — свой угол центра (рад), если не на бортах."""
    if theta is None:
        zc = max(-RB * 0.95, min(RB * 0.95, z)); th = math.asin(zc / RB) if side > 0 else math.pi - math.asin(zc / RB)
    else: th = theta
    sg = 1.0 if side > 0 else -1.0
    ring = lambda rho: [Vector((rho * S * math.cos(th + sg * dt / RB), Y(x + dx), rho * S * math.sin(th + sg * dt / RB))) for dx, dt in shape]
    b.loft([ring(RB - 1.0), ring(RB + h)], mat, cap0=mat, cap1=mat)

b = B()   # лючки — по обоим бортам
for sd in (1, -1):
    decal(b, 302.5, -5.2, rrect(27.5, 24.0, 6.0), sd, 1.4, M_WING)                  # большой лючок передней секции
    decal(b, 717.5, -2.2, rrect(17.5, 21.0, 5.0), sd, 1.2, M_WING)                  # лючок у корня крыла
    decal(b, 1100.0, -9.2, ell(18.0, 18.0, 14), sd, 1.0, M_WING)                    # круглая крышка хвостового отсека
for pz, px in ((1, 263.0), ):                                                          # шарнирные площадки передних рулей — на 45°
    for phi in AZ:
        decal(b, px, 0.0, ell(25.0, 25.0, 16), 1, 2.4, M_CTRL, theta=math.radians(phi))
ob_hatch = b.finish('K29_hatches')

b = B()   # тёмные овальные люки, гнёзда
for sd in (1, -1):
    for x, zz in ((248.0, 20.8), (248.0, -18.2), (396.5, 20.8), (396.5, -18.2), (677.0, 21.8), (677.0, -21.2)):
        decal(b, x, zz, ell(4.6, 7.4, 10), sd, 0.7, M_DARK)
    for x in (418.0, 660.0):
        decal(b, x, 0.8, ell(6.8, 6.8, 10), sd, 0.7, M_DARK)
ob_slots = b.finish('K29_slots')

# ───────────────────────── низ и верх корпуса ─────────────────────────
b = B()   # нижний кожух (трапеция) и три площадки на нём
def keel_ring(x, hw_top, z_top, hw_bot, z_bot):
    return [Vector((-hw_top * S, Y(x), z_top * S)), Vector((hw_top * S, Y(x), z_top * S)),
            Vector((hw_bot * S, Y(x), z_bot * S)), Vector((-hw_bot * S, Y(x), z_bot * S))]
b.loft([keel_ring(315.0, 14.5, -50.0, 8.5, -64.5), keel_ring(752.0, 14.5, -50.0, 8.5, -64.5)], M_CTRL, cap0=M_CTRL, cap1=M_CTRL)
for x in (445.0, 548.0, 650.0):
    b.loft([keel_ring(x - 8.0, 7.0, -62.0, 7.0, -65.6), keel_ring(x + 8.0, 7.0, -62.0, 7.0, -65.6)], M_DARK, cap0=M_DARK, cap1=M_DARK)
ob_keel = b.finish('K29_keel')

b = B()   # две подвесные проушины сверху (x 530–561)
def lug_ring(X0l, X1l, xa, xb, xc, xd, za, zt):
    return None
for lat in (17.0, -17.0):
    pts = lambda lx: [Vector((lx * S, Y(530.0), 44.0 * S)), Vector((lx * S, Y(561.0), 44.0 * S)),
                      Vector((lx * S, Y(555.0), 62.5 * S)), Vector((lx * S, Y(536.0), 62.5 * S))]
    b.loft([pts(lat - 6.0), pts(lat + 6.0)], M_DARK, cap0=M_DARK, cap1=M_DARK)
ob_lugs = b.finish('K29_lugs')

# ───────────────────────── носовая головка ─────────────────────────
b = B()   # прозрачный купол головки: сферический сегмент, основание R=38 на x=76, вершина x=55 (пунктир на чертеже)
RS = (38.0 ** 2 + 21.0 ** 2) / (2 * 21.0)
zs = [38.0, 33.0, 27.0, 20.0, 13.0, 6.0]
b.loft([circ(55.0 + (RS - math.sqrt(RS * RS - z * z)), z, 28) for z in zs], M_DARK, cap0=M_DARK, cap1=M_DARK)
ob_nose = b.finish('K29_nose')

# ───────────────────────── задний отрезок нижнего кожуха и шаровые бобышки у корней крыльев ─────────────────────────
b = B()
b.loft([keel_ring(1084.0, 12.5, -50.0, 8.0, -66.5), keel_ring(1117.0, 12.5, -50.0, 8.0, -66.5)], M_CTRL, cap0=M_CTRL, cap1=M_CTRL)

def ball(b, phi, x, r, n, R=6.0, mat=M_DARK):
    ph = math.radians(phi)
    d = Vector((math.cos(ph), 0.0, math.sin(ph))); nr = Vector((-math.sin(ph), 0.0, math.cos(ph)))
    c = (d * r + nr * n) * S                      # центр в плоскости XZ
    rings = []
    for k in range(1, 4):
        a = math.pi * k / 4.0
        yy, rr = R * math.cos(a), R * math.sin(a)
        rings.append([Vector((c.x + rr * S * math.cos(2 * math.pi * i / 6), Y(x) + yy * S, c.z + rr * S * math.sin(2 * math.pi * i / 6))) for i in range(6)])
    b.loft(rings, mat, cap0=mat, cap1=mat)

for phi in AZ:
    for sg in (1, -1):
        ball(b, phi, 748.0, 58.0, sg * 9.0)
ob_misc = b.finish('K29_keel_rear_balls')

# ───────────────────────── итог ─────────────────────────
objs = [o for o in col.objects]
tri = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)
tot = 0
for o in objs:
    t = tri(o); tot += t; print(f'{o.name:14s} {t:5d} тр.')
print('всего', tot, 'тр.')
import mathutils
mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9))
for o in objs:
    for v in o.data.vertices:
        for i in range(3): mn[i] = min(mn[i], v.co[i]); mx[i] = max(mx[i], v.co[i])
print('габариты X', round(mn[0], 3), round(mx[0], 3), 'Y', round(mn[1], 3), round(mx[1], 3), 'Z', round(mn[2], 3), round(mx[2], 3))
