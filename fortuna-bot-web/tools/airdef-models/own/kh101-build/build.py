# Х-101 - своя игровая модель по пяти картинкам Mark (Свои/Х-101/). Картинки только образец: свои меши, пиксели в текстуру не берём, надписи свои.
# референс_1 (1728 × 1080) - серый рендер с раскрытыми крыльями и зелёной вставкой; референс_5 (250 × 219) - схема в трёх видах: форма, крылья, оперение, двигатель.
# референс_3 (680 × 381) и референс_2 (1200 × 630) - снимки на тележке: швы, боковые наплывы, плоский низ, положение сложенных крыльев. Самолёты, тележка и ленты тележки - не модель.
# референс_4 (602 × 268) - снимок в полёте: серый металл.
# Все x, y ниже - пиксели референс_3 (нос слева, ось y = 202, остриё x = 45, конец стабилизатора x = 670). Масштаб: 7,45 м на всю длину по прежней модели игры. Ø корпуса на снимках ≈ 0,62 м.
# Запуск (фоновый Blender): K101_OUT="<папка>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python _collide.py --python bake.py --python deliver.py
#
# СПИСОК ДЕТАЛЕЙ (сделано / пропущено):
#  + корпус вращением с боковым ребром (K101_body): эллиптический нос, двойной шов у носа, швы секций, сужение хвоста, ступень и скруглённый торец
#  + наплывы (K101_fixed): передний «линзой» на борту, косая накладка у корня крыла, плоский низ под сложенными крыльями; подвесной узел - два низких упора сверху на осевой линии
#  + крылья wing1 (+X), wing2 (-X): начало на вертикальной оси у корня по передней кромке, в файле сложены вдоль корпуса назад под плоским низом
#  + гондола с пилоном nacelle: шарнир у передней кромки пилона, в файле выпущена; вентилятор fan - отдельно, начало на оси гондолы
#  + киль fin и стабилизаторы stab1 (+X), stab2 (-X): у каждого своя ось, стабилизаторы опущены на 30°
#  - короткие двойные метки, крестики, швы люков, линия на киле и стабилизаторах, надписи - цветом и рельефом в bake.py
#  - ленты тележки на снимках не переносим: на корпусе от них только метки
# В файле нос +Y (в glTF уйдёт в -Z), верх +Z (в glTF +Y), начало на оси, середина длины, крылья сложены, гондола выпущена.
import sys, os, math, importlib
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
import bpy
import modelkit as mk; importlib.reload(mk)
from modelkit import B, Vector, Y

LEN_M = 7.45
X_TIP, X_END = 45.0, 670.0
S = LEN_M / (X_END - X_TIP)               # метров на пиксель (≈ 11,9 мм)
X0, YC, RB = (X_TIP + X_END) / 2, 202.0, 26.0
NSEG = 40
mk.configure('KH101', S, x0=X0, yc=YC, rb=RB, nseg=NSEG, nose='left')
G_BODY, G_STEEL = 0, 1
mk.set_materials([('K101_body', (0.30, 0.33, 0.38)), ('K101_steel', (0.20, 0.20, 0.20))])
for m, (rough, metal) in zip(mk.MATS, ((0.48, 0.05), (0.42, 0.6))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal
M_ = lambda v: v / S                      # метры → пиксели


def axes(phi):
    ph = math.radians(phi)
    return Vector((math.cos(ph), 0.0, math.sin(ph))), Vector((-math.sin(ph), 0.0, math.cos(ph)))


def P(x, r, w, er, et):
    return Vector((0.0, Y(x), 0.0)) + (er * r + et * w) * S


# ── профиль корпуса ──
NL = 42.0
def nose_r(x):
    a = x - X_TIP; t = (NL - a) / NL
    return RB * math.sqrt(max(0.0, 1.0 - t * t))


TAIL = [(540.0, 26.0), (570.0, 24.4), (597.0, 19.6), (620.0, 16.4), (638.0, 14.2), (640.0, 13.0), (642.0, 13.4), (651.0, 12.6), (654.5, 10.8), (656.5, 7.5), (657.0, 3.0), (657.0, 0.5)]
def groove(x, r=RB):
    return [(x - 0.45, r), (x - 0.15, r - 0.32), (x + 0.15, r - 0.32), (x + 0.45, r)]


PROF = [(X_TIP + a, nose_r(X_TIP + a)) for a in (0.15, 0.6, 1.6, 3.2, 5.5, 9.0, 13.0, 18.0, 24.0, 31.0, 38.0)] + [(X_TIP + NL + 1.0, RB)] + groove(92.0) + groove(97.0) + [(120.0, RB)] + groove(145.0) + [(200.0, RB)] + groove(279.0) + [(345.0, RB)] + groove(409.0) + groove(470.0) + TAIL


def R_at(x):
    if x <= X_TIP + NL: return nose_r(x)
    if x >= 540.0:
        for (x0, r0), (x1, r1) in zip(TAIL, TAIL[1:]):
            if x0 <= x <= x1 and x1 > x0: return r0 + (r1 - r0) * (x - x0) / (x1 - x0)
        return TAIL[-1][1]
    return RB


def ridge(x):
    a = max(0.0, min(1.0, (x - 98.0) / 40.0)); b = max(0.0, min(1.0, (575.0 - x) / 40.0))
    return 0.035 * a * a * (3 - 2 * a) * b * b * (3 - 2 * b)


def ring_b(x, r):
    k = ridge(x); pts = []
    for j in range(NSEG):
        t = 2 * math.pi * j / NSEG; s = min(abs(math.atan2(math.sin(t), math.cos(t))), abs(math.atan2(math.sin(t - math.pi), math.cos(t - math.pi))))
        rr = r * (1.0 + k * math.exp(-(s / 0.15) ** 2))
        pts.append(Vector((rr * S * math.cos(t), Y(x), rr * S * math.sin(t))))
    return pts


b = B(); b.loft([ring_b(x, r) for x, r in PROF], G_BODY, cap0=G_BODY, cap1=G_BODY); body = b.finish('K101_body', sharp_deg=38)
print('корпус: колец', len(PROF))

# ── неподвижное: наплывы на борту, плоский низ, подвесной узел ──
bf = B()


def patch(st, side):
    """Накладка на борт: st - [(x, z верха пикс., z низа пикс., вылет м)] (z от оси, пикс., вверх +). Сечение по дуге корпуса, снаружи скруглено."""
    rings = []
    for x, zt, zb, d in st:
        n = 7; ring = []
        for j in range(n):
            t = j / (n - 1); z = zb + (zt - zb) * t; o = d * math.sin(t * math.pi) ** 0.55
            rr = R_at(x) * (1.0 + ridge(x) * 0.6); xx = math.sqrt(max(rr * rr - z * z, 1.0)); ring.append(Vector((side * (xx * S + o), Y(x), z * S)))
        ring += [Vector((side * (math.sqrt(max((rr - 1.2) ** 2 - z_ * z_, 1.0)) * S), Y(x), z_ * S)) for z_ in (zt, zb)]
        rings.append(ring if side > 0 else ring[::-1])
    bf.loft(rings, G_BODY, cap0=G_BODY, cap1=G_BODY)


LENS = [(105.0, -4.5, -5.5, 0.004), (108.0, 1.5, -11.0, 0.020), (115.0, 5.5, -15.0, 0.036), (128.0, 7.0, -18.0, 0.050), (180.0, 7.2, -19.5, 0.056), (232.0, 7.6, -20.0, 0.052), (258.0, 0.0, -20.0, 0.042), (282.0, -8.0, -19.5, 0.024), (288.0, -13.0, -18.0, 0.008)]
GLOVE = [(276.0, -14.5, -16.0, 0.010), (294.0, 1.0, -16.5, 0.050), (312.0, 1.5, -17.5, 0.052), (330.0, 1.8, -11.0, 0.040), (344.0, 2.0, 1.0, 0.012)]
for side in (1.0, -1.0):
    patch(LENS, side); patch(GLOVE, side)
# плоский низ под сложенными крыльями: борта уходят вниз, дно плоское (референсы 2, 3, тёмная кромка на виде сверху на референсе_5)
Z_FLAT, W_FLAT = -26.6, 28.0
def belly(x, w, zf):
    return [Vector((a * S, Y(x), z * S)) for a, z in ((-w * 0.86, -10.0), (-w, -12.0), (-w, zf + 1.7), (-w * 0.94, zf), (0.0, zf), (w * 0.94, zf), (w, zf + 1.7), (w, -12.0), (w * 0.86, -10.0), (0.0, -14.0))]
bf.loft([belly(x, w, z) for x, w, z in ((254.0, 20.0, -24.0), (268.0, 26.5, -26.2), (276.0, W_FLAT, Z_FLAT), (455.0, W_FLAT, Z_FLAT), (466.0, 26.5, -26.0), (473.0, 20.0, -24.0))], G_BODY, cap0=G_BODY, cap1=G_BODY)
# подвесной узел: два низких упора сверху на осевой линии у меток
def lug(xc):
    r0 = R_at(xc); hw, h, t = M_(0.040), M_(0.060), M_(0.022)
    OUT = [(-hw, -1.0), (hw, -1.0), (hw, h * 0.5), (hw * 0.7, h), (-hw * 0.7, h), (-hw, h * 0.5)]
    hole_c, hr = h * 0.45, M_(0.014)
    n = 12; segs = list(zip(OUT, OUT[1:] + OUT[:1]))
    def ray(a):
        d = (math.cos(a), math.sin(a)); best = None
        for (w0, h0), (w1, h1) in segs:
            ew, eh = w1 - w0, h1 - h0; den = d[0] * eh - d[1] * ew
            if abs(den) < 1e-9: continue
            tt = (w0 * eh - (h0 - hole_c) * ew) / den; u = (w0 * d[1] - (h0 - hole_c) * d[0]) / den
            if tt > 0 and -1e-6 <= u <= 1 + 1e-6 and (best is None or tt < best): best = tt
        return d[0] * best, hole_c + d[1] * best
    angs = [2 * math.pi * k / n for k in range(n)]
    o_ = [ray(a) for a in angs]; i_ = [(hr * math.cos(a), hole_c + hr * math.sin(a)) for a in angs]
    pt = lambda p, s: Vector((p[0] * S, Y(xc + s * t), (r0 + p[1]) * S))
    bf.loft([[pt(p, 1) for p in i_], [pt(p, 1) for p in o_], [pt(p, -1) for p in o_], [pt(p, -1) for p in i_], [pt(p, 1) for p in i_]], G_STEEL)
    disc = lambda rd, hh: [Vector((rd * S * math.cos(2 * math.pi * j / 8), Y(xc) + rd * S * math.sin(2 * math.pi * j / 8), (r0 + hh) * S)) for j in range(8)]
    bf.loft([disc(M_(0.062), -0.8), disc(M_(0.062), M_(0.008)), disc(M_(0.050), M_(0.012))], G_STEEL, cap1=G_STEEL)


X_LUG1, X_LUG2 = 235.0, 475.0
lug(X_LUG1); lug(X_LUG2)
fixed = bf.finish('K101_fixed', sharp_deg=38)

# ── крылья: сложены назад под плоским низом ──
X_WP = 285.0                                # корень, передняя кромка (x на картинке)
Z_WP = Z_FLAT - 0.68                         # плоскость крыла чуть ниже плоского дна
W_WP = 25.2                                 # вылет оси от диаметральной плоскости (0,30 м)
SPAN_PX, CH_R, CH_T, T_ROOT, T_TIP = 180.0, 21.6, 14.0, 1.0, 0.55
WING_OPEN = 58.0                            # раскрытие от сложенного, вокруг вертикальной оси: стреловидность по схеме ≈ 32°
WING = {}
for k, side in ((1, 1.0), (2, -1.0)):
    o = Vector((side * W_WP * S, Y(X_WP), Z_WP * S))
    def sec(xx, ch, t, off):
        """Сечение крыла поперёк размаха: передняя кромка снаружи, к оси - хорда (при раскрытии передняя кромка смотрит к носу)."""
        pts = []
        for f, zz in ((0.0, 0.0), (0.16, 0.5), (0.45, 0.5), (1.0, 0.0), (0.45, -0.5), (0.16, -0.5)):
            pts.append(Vector((side * (W_WP - off - f * ch) * S, Y(xx), (Z_WP + zz * t) * S)) - o)
        return pts if side > 0 else pts[::-1]
    bw = B()
    bw.loft([sec(X_WP, CH_R, T_ROOT, 0.0), sec(X_WP + SPAN_PX * 0.45, (CH_R + CH_T) / 2, (T_ROOT + T_TIP) / 2, 0.0), sec(X_WP + SPAN_PX * 0.96, CH_T, T_TIP, 0.0), sec(X_WP + SPAN_PX, CH_T * 0.72, T_TIP * 0.6, 0.0)], G_BODY, cap0=G_BODY, cap1=G_BODY)
    # шайба шарнира на нижней стороне крыла: корень читается как узел
    nh = 12
    hub = lambda rd, zz: [Vector((side * (-rd * S * math.cos(2 * math.pi * j / nh)) - side * 3.6 * S, rd * S * math.sin(2 * math.pi * j / nh) - 3.6 * S, zz * S - o.z)) for j in range(nh)]
    bw.loft([hub(3.4, Z_WP - 0.40), hub(3.4, Z_WP - 1.22), hub(2.6, Z_WP - 1.55)], G_STEEL, cap1=G_STEEL)
    ob = bw.finish(f'wing{k}', sharp_deg=30); ob.location = o
    WING[k] = dict(o=o.copy(), axis=Vector((0.0, 0.0, 1.0)), open_deg=side * WING_OPEN)

# ── гондола с пилоном: шарнир у передней кромки пилона на днище; вентилятор отдельно ──
C_Z = -54.0                                 # ось гондолы от оси корпуса, пикс.
X_NP = 513.0; Z_NP = -R_at(X_NP) + 0.5
O_NAC = Vector((0.0, Y(X_NP), Z_NP * S))
NF = 24
def nring(x, r): return [Vector((r * S * math.cos(2 * math.pi * j / NF), Y(x), (C_Z + r * math.sin(2 * math.pi * j / NF)) * S)) - O_NAC for j in range(NF)]
NAC = [(518.0, 0.6), (518.0, 13.8), (512.0, 14.6), (507.6, 15.2), (507.0, 16.0), (507.8, 16.9), (512.0, 17.0), (566.5, 17.0), (567.2, 16.5), (568.2, 16.5), (569.0, 17.0), (596.0, 16.6), (600.0, 15.2), (601.5, 12.5), (602.0, 9.6), (609.5, 8.8), (610.2, 8.2), (610.2, 7.0), (604.0, 5.6), (594.0, 3.5), (594.0, 0.6)]
bn = B(); bn.loft([nring(x, r) for x, r in NAC], [G_STEEL] * 2 + [G_BODY] * 12 + [G_STEEL] * 6, cap0=G_STEEL, cap1=G_STEEL)
def pyl(x, ww, wb, zb):
    zt = -R_at(x) + 1.5
    return [Vector((a * S, Y(x), z * S)) - O_NAC for a, z in ((-ww, zt), (-ww * 0.72, zt - 2.4), (-wb, zb), (wb, zb), (ww * 0.72, zt - 2.4), (ww, zt))]
bn.loft([pyl(x, ww, wb, C_Z + 13.0) for x, ww, wb in ((514.0, 2.0, 1.6), (522.0, 9.5, 5.5), (540.0, 12.0, 7.5), (572.0, 11.0, 7.0), (586.0, 8.0, 5.0), (592.0, 1.5, 1.2))], G_BODY, cap0=G_BODY, cap1=G_BODY)
nacelle = bn.finish('nacelle', sharp_deg=38); nacelle.location = O_NAC
X_FAN = 514.0; O_FAN = Vector((0.0, Y(X_FAN), C_Z * S))
bz = B()
def fring(x, r, n=16): return [Vector((r * S * math.cos(2 * math.pi * j / n), Y(x), r * S * math.sin(2 * math.pi * j / n))) + Vector((0, 0, C_Z * S)) - O_FAN for j in range(n)]
bz.loft([fring(x, r) for x, r in ((510.0, 0.5), (510.4, 2.4), (511.6, 4.4), (513.4, 5.8), (516.0, 6.4), (517.6, 6.4))], G_STEEL, cap1=G_STEEL)
NB = 16
for k in range(NB):
    a0 = 2 * math.pi * k / NB
    def bl(r, tw, ch):
        a = a0; c, s_ = math.cos(a), math.sin(a); e_r = Vector((c, 0, s_)); e_t = Vector((-s_, 0, c)); e_a = Vector((0, 1, 0))
        p = e_r * r * S + Vector((0, Y(X_FAN + 1.6), C_Z * S)) - O_FAN
        u = (e_a * math.cos(tw) + e_t * math.sin(tw)) * ch * S; v = (e_t * math.cos(tw) - e_a * math.sin(tw)) * 0.14 * S
        return [p - u - v, p + u - v, p + u + v, p - u + v]
    bz.loft([bl(5.8, 0.95, 1.7), bl(13.6, 0.55, 2.2)], G_STEEL, cap1=G_STEEL)
fan = bz.finish('fan', sharp_deg=50); fan.location = O_FAN

# ── киль и стабилизаторы ──
def rudder(name, phi, pts, ins, xp, t):
    er, et = axes(phi); r_h = R_at(xp) - 0.2; o = P(xp, r_h, 0.0, er, et)
    bb = B(); face = lambda p_, w: [P(x, r, w, er, et) - o for x, r in p_]
    bb.loft([face(ins, t), face(pts, 0.0), face(ins, -t)], G_BODY, cap0=G_BODY, cap1=G_BODY)
    ob = bb.finish(name, sharp_deg=28); ob.location = o
    return dict(o=o.copy(), axis=er.copy())


RUD_RANGE = 20.0
FIN = [(603.0, 21.0), (634.0, 69.5), (646.0, 70.5), (651.5, 67.0), (651.0, 13.5)]; FIN_I = [(608.0, 21.0), (635.5, 67.5), (645.5, 68.3), (649.2, 65.5), (648.5, 13.5)]
FIN_X = 634.0
PARTS = dict(fin=rudder('fin', 90.0, FIN, FIN_I, FIN_X, 0.95))
R_ST = 49.5
ST = [(607.0, 19.2), (652.0, R_ST), (670.0, R_ST), (652.0, 13.6)]; ST_I = [(612.0, 18.6), (654.0, R_ST - 1.2), (666.5, R_ST - 1.2), (649.5, 14.0)]
PARTS['stab1'] = rudder('stab1', -30.0, ST, ST_I, 634.0, 0.85)
PARTS['stab2'] = rudder('stab2', 210.0, ST, ST_I, 634.0, 0.85)

bpy.context.view_layer.update()
mk.GEO = dict(NSEG=NSEG, RB=RB, SEAMS=(92.0, 97.0, 145.0, 279.0, 409.0, 470.0, 639.0), BANDS=(235.0, 475.0), WING_OPEN=WING_OPEN, RUD_RANGE=RUD_RANGE, FIN_X=FIN_X, C_Z=C_Z, GREEN=(279.0, 409.0), X_NAC=(507.0, 602.0), NOZZLE=(610.2, C_Z, 8.2))
mk.WING, mk.PARTS, mk.O_NAC, mk.O_FAN = WING, PARTS, O_NAC, O_FAN
mk.stats()
print('сопло гондолы (м, Blender):', round(0.0, 3), round(Y(610.2), 3), round(C_Z * S, 3))
print('сцена KH101 построена')
