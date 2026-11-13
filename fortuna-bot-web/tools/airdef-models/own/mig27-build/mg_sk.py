# mg_sk.py - оснастка МиГ-27К (из МиГ-23БН; строится в размерах МиГ-23БН, в конце масштаб g.TM()) только для Sketchfab (объекты sk_*, в игровой файл не идут): колодки под колёсами, красные заглушки заборников с лентами,
# ленты REMOVE BEFORE FLIGHT на ПВД, стойках и пилонах, стремянка к кабине по левому борту (07). Свои материалы SK_*; атлас S печёт deliver.py. Вызывать после build.py этапа 4.
import math
import bpy
from mathutils import Vector
from modelkit import B
import mg_geo as g, mg_gear as gr, mg_det as dt
from mg_geo import P3

SKM = [('SK_yellow', (0.80, 0.60, 0.06), 0.62), ('SK_red', (0.62, 0.05, 0.04), 0.55), ('SK_white', (0.86, 0.86, 0.84), 0.6), ('SK_rope', (0.70, 0.56, 0.12), 0.8),
       ('SK_alu', (0.66, 0.67, 0.68), 0.35), ('SK_dark', (0.03, 0.03, 0.035), 0.9), ('SK_olive', (0.30, 0.31, 0.25), 0.7)]
Y_, RED, WHITE, ROPE, ALU, DARK, OLIVE = range(7)
AFT = Vector((0, -1, 0)); UP = Vector((0, 0, 1))


def mats():
    out = []
    for n, c, r in SKM:
        m = bpy.data.materials.get(n) or bpy.data.materials.new(n); m.use_nodes = True
        pb = next(q for q in m.node_tree.nodes if q.type == 'BSDF_PRINCIPLED'); pb.inputs['Base Color'].default_value = (*c, 1); pb.inputs['Roughness'].default_value = r
        pb.inputs['Metallic'].default_value = 0.8 if n == 'SK_alu' else 0.0; m.use_backface_culling = False; out.append(m)
    return out


def fin(b, name):
    ob = b.finish(name, sharp_deg=40); ob.data.transform(g.TM()); ob.data.update()        # как у самолёта: длина 17,08 м; слоты заменяются по месту: clear() обнуляет номера материалов граней
    for i, m in enumerate(mats()): ob.data.materials[i] = m
    while len(ob.data.materials) > len(SKM): ob.data.materials.pop()
    return ob


def streamer(b, p, ln=0.42, sway=0.0):
    dt.tube(b, [p + Vector((0, 0, 0.010)), p - Vector((0, 0, 0.010))], 0.012, ALU, 8)
    pts = [p - UP * (0.025 + ln * t) + AFT * (0.04 * math.sin(t * 2.5 + sway)) + Vector((0.015 * math.sin(t * 4 + sway), 0, 0)) for t in (0.0, 0.25, 0.5, 0.75, 1.0)]
    b.loft([[q + Vector((-0.0012, 0.022, 0)), q + Vector((0.0012, 0.022, 0)), q + Vector((0.0012, -0.022, 0)), q + Vector((-0.0012, -0.022, 0))] for q in pts], RED, cap0=RED, cap1=RED)
    for i in (1, 3):
        c = pts[i].lerp(pts[i + 1], 0.5)
        b.loft([[c + Vector((dx, dy, dz)) for dx, dy in ((-0.0015, 0.023), (0.0015, 0.023), (0.0015, -0.023), (-0.0015, -0.023))] for dz in (0.04, -0.04)], WHITE, cap0=WHITE, cap1=WHITE)


def rbf():
    b = B()
    streamer(b, P3(0.25, 0.0, -0.235), 0.45, 0.3)                                                         # ПВД
    N = gr.NOSE; streamer(b, P3(N['a'] - 0.04, 0.10, gr.GROUND + N['rw'] + 0.75), 0.40, 1.0)
    M = gr.MAIN
    for sx in (1, -1):
        streamer(b, P3(M['a'] - 0.10, sx * (M['x'] - 0.25), gr.GROUND + M['rw'] + 0.80), 0.40, 2.0 * sx)
        st = g.TM().inverted() @ g.STATIONS[f"st0_{'r' if sx > 0 else 'l'}"]; streamer(b, st + Vector((0, 0.15, 0.0)), 0.36, 0.7 * sx)        # замок пилона
    return fin(b, 'sk_rbf')


def covers():
    """Заглушки заборников: красная пробка по губе (срез наклонный, как у заборника), ручка, лента."""
    b = B(); n = 40
    for sx in (1, -1):
        cx, hw, zc, hz = (g.INT_X[0] + g.INT_X[1]) / 2, (g.INT_X[1] - g.INT_X[0]) / 2 - 0.035, (g.INT_Z[0] + g.INT_Z[1]) / 2, (g.INT_Z[1] - g.INT_Z[0]) / 2 - 0.035
        rings = []
        for da, k in ((0.10, 0.96), (0.0, 1.0), (-0.07, 1.04), (-0.10, 0.99), (-0.11, 0.80)):
            r = g.dsec(g.A_INT + da, cx, zc, hw * k, hz * k, n); r = [Vector((sx * v.x, v.y + 0.30 * (v.z - g.INT_Z[0]) / (g.INT_Z[1] - g.INT_Z[0]), v.z)) for v in r]
            rings.append(r if sx > 0 else r[::-1])
        b.loft(rings, RED, cap0=RED, cap1=RED)
        h0 = P3(g.A_INT - 0.16, sx * (cx - 0.15), zc + 0.12); h1 = P3(g.A_INT - 0.16, sx * (cx + 0.15), zc + 0.12)
        dt.tube(b, [h0, h0 - AFT * 0.05, h1 - AFT * 0.05, h1], 0.010, DARK, 6)
        streamer(b, P3(g.A_INT - 0.20, sx * cx, zc - 0.12), 0.40, sx)
    return fin(b, 'sk_covers')


def chock(b, a, x, w, rw, flip):
    def off(z): return math.sqrt(max(0.0, rw * rw - (rw - z) ** 2))
    h = 0.32 * rw; d0 = off(0.02) + 0.03; d1 = off(h) + 0.02
    sec = [(d0, 0.0), (d1, h), (d1 + 0.12, h), (d1 + 0.20, 0.0)]
    rings = [[P3(a + flip * s, x + dx, gr.GROUND + zz) for s, zz in (sec if flip > 0 else sec[::-1])] for dx in (-w / 2, w / 2)]
    b.loft(rings, Y_, cap0=Y_, cap1=Y_)
    return P3(a + flip * (d1 + 0.08), x, gr.GROUND + h)


def chocks():
    b = B(); N = gr.NOSE; M = gr.MAIN
    for a, xw, rw, ww in [(N['a'], 0.0, N['rw'], 2 * N['trk'] + N['ww'])] + [(M['a'], sx * M['x'], M['rw'], M['ww']) for sx in (1, -1)]:
        p0 = chock(b, a, xw, ww * 1.1, rw, 1); p1 = chock(b, a, xw, ww * 1.1, rw, -1); side = Vector((ww * 0.55 + 0.02, 0, 0))
        dt.tube(b, [p0 + side, p0 + side + Vector((0, 0, -0.04)), p0.lerp(p1, 0.5) + side + Vector((0, 0, -0.10)), p1 + side + Vector((0, 0, -0.04)), p1 + side], 0.009, ROPE, 6)
    return fin(b, 'sk_chocks')


def ladder():
    """Стремянка к кабине по левому борту (07: жёлтая с перилами): крюки на пороге, опора на землю."""
    b = B(); at0, at1 = 4.95, 5.40; sill = g.fus_top(5.2, 0.42) + 0.02; xt = -0.50; xb = -1.45; bot = gr.GROUND
    for a in (at0, at1):
        dt.tube(b, [P3(a, xt + 0.10, sill + 0.06), P3(a, xt, sill + 0.06), P3(a, xt - 0.05, sill - 0.10), P3(a, xb, bot)], 0.022, Y_, 8)
        dt.tube(b, [P3(a, xt - 0.05, sill - 0.10), P3(a, xt - 0.25, sill + 0.55), P3(a, xb + 0.05, bot + 1.05)], 0.016, Y_, 8)     # перила
    n_ = 10
    for i in range(1, n_ + 1):
        t = i / (n_ + 1); c0 = P3(at0, xt - 0.05 + (xb - xt + 0.05) * t, sill - 0.10 + (bot - sill + 0.10) * t); c1 = c0 + (P3(at1, 0, 0) - P3(at0, 0, 0))
        dt.tube(b, [c0, c1], 0.016, ALU, 8)
    return fin(b, 'sk_ladder')


def make_all():
    return [rbf(), covers(), chocks(), ladder()]
