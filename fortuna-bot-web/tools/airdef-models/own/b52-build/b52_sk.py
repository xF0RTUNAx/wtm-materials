# b52_sk.py - оснастка B-52H только для Sketchfab (объекты sk_*, в игровой файл не идут, развёртку и краску самолёта не трогают):
# тормозной парашют раскрытый (b52_05: жёлтый ленточный купол, стропы), ленты REMOVE BEFORE FLIGHT, заглушки воздухозаборников, колодки под колёсами (b52_06: жёлтые),
# стремянка к люку экипажа с открытой крышкой. Свои материалы SK_*. Вызывать после build.py этапа 4 в той же сессии; положения - для стоянки (крыло опущено).
import math
import bpy
from mathutils import Vector
from modelkit import B
import b52_geo as g, b52_gear as gr, b52_det as dt
from b52_geo import P3, Z, Yb

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
    ob = b.finish(name, sharp_deg=40)                                   # слоты заменяются по месту: clear() обнуляет номера материалов граней
    for i, m in enumerate(mats()): ob.data.materials[i] = m
    while len(ob.data.materials) > len(SKM): ob.data.materials.pop()             # лишние слоты (материалы самолёта) мешают запеканию атласа S
    return ob


def chute(scale=1.0):
    """Ленточный купол 13,4 м: 28 полотнищ, 14 лент с просветами, стропы к узлу, фал к отсеку за килем."""
    b = B(); n = 28; seg = 4; D = 13.4 * scale; R = D / 2
    door = g.down(0.0, Yb(45.85)) + Vector((0, 0, 0.05)); conf = P3(57.0, 0.0, Z(6.9)); skirt_a = conf.y - 16.5   # y мира: назад - меньше
    ax = AFT
    def pt(t, ph):                                                      # t: 0 - кромка купола, 1 - полюсное отверстие
        th = t * math.pi / 2; r = R * math.cos(th) * (0.84 + 0.16 * math.sin(min(1.0, t / 0.30) * math.pi / 2)) + 0.45 * t
        s = 0.80 * R * math.sin(th); fr = (n * ph / (2 * math.pi)) % 1.0; r *= 1 + 0.045 * math.sin(math.pi * fr) * (1 - 0.6 * t)
        return Vector((r * math.sin(ph), skirt_a - s, conf.z + 0.35 + r * math.cos(ph)))
    NB = 14
    for k in range(NB):
        t0 = k / NB; t1 = t0 + 0.80 / NB
        rings = [[pt(t, 2 * math.pi * q / (n * seg)) for q in range(n * seg)] for t in (t0, (t0 + t1) / 2, t1)]
        b.loft(rings, Y_)
    for q in range(n):                                                  # радиальные ленты по швам полотнищ
        ph = 2 * math.pi * q / n
        for k in range(NB):
            t0 = k / NB; t1 = (k + 1) / NB; p0, p1 = pt(t0, ph), pt(t1, ph)
            dt.tube(b, [p0, p1], 0.018, Y_, 4, caps=False)
        dt.tube(b, [pt(0.0, ph), conf], 0.010, ROPE, 4)                # стропы
    dt.tube(b, [door, door.lerp(conf, 0.5) + Vector((0, 0, 0.25)), conf], 0.035, ROPE, 8)   # фал
    dt.tube(b, [conf - AFT * 0.15, conf + AFT * 0.25], 0.07, ALU, 10)
    return fin(b, 'sk_chute')


def streamer(b, p, ln=0.48, sway=0.0):
    """Лента REMOVE BEFORE FLIGHT: колечко и полоса, висит вниз с лёгким изгибом."""
    dt.tube(b, [p + Vector((0, 0, 0.012)), p - Vector((0, 0, 0.012))], 0.016, ALU, 8)
    pts = [p - UP * (0.03 + ln * t) + AFT * (0.05 * math.sin(t * 2.5 + sway)) + Vector((0.02 * math.sin(t * 4 + sway), 0, 0)) for t in (0.0, 0.25, 0.5, 0.75, 1.0)]
    rings = [[q + Vector((-0.0015, 0.025, 0)), q + Vector((0.0015, 0.025, 0)), q + Vector((0.0015, -0.025, 0)), q + Vector((-0.0015, -0.025, 0))] for q in pts]
    b.loft(rings, RED, cap0=RED, cap1=RED)
    for i in (1, 3):                                                    # белые полосы с надписью - участки ленты
        q0, q1 = pts[i], pts[i + 1] if i + 1 < len(pts) else pts[i]
        c = q0.lerp(q1, 0.5); b.loft([[c + Vector((-0.0018, 0.026, 0.05)), c + Vector((0.0018, 0.026, 0.05)), c + Vector((0.0018, -0.026, 0.05)), c + Vector((-0.0018, -0.026, 0.05))],
                                      [c + Vector((-0.0018, 0.026, -0.05)), c + Vector((0.0018, 0.026, -0.05)), c + Vector((0.0018, -0.026, -0.05)), c + Vector((-0.0018, -0.026, -0.05))]], WHITE, cap0=WHITE, cap1=WHITE)


def rbf():
    b = B()
    for sx in (1, -1):                                                  # ПВД и флюгеры
        zc = (g.FT[0](3.15) + g.FT[1](3.15)) / 2 + g.ZA - 0.18; p, n = dt.on_side(3.15, zc, sx); q1 = p + n * 0.09 - AFT * 0.10 - AFT * 0.36
        streamer(b, q1 - UP * 0.02, 0.55, 0.3 * sx)
        p2, n2 = dt.on_side(4.30, zc - 0.55, sx); streamer(b, p2 + n2 * 0.06 - UP * 0.02, 0.45, 1.0)
    for a, k in ((gr.TRUCKS['af'], 'f'), (gr.TRUCKS['ar'], 'r')):        # стопоры стоек
        for sx in (1, -1):
            x = sx * gr.TRUCKS['x']; yax = gr.GROUND + gr.TRUCKS['rw']; streamer(b, P3(a - 0.30, x + sx * 0.06, yax + 1.05), 0.50, a)
    for sx in (1, -1):
        M = gr.ground_mat(sx); p = M @ P3(g.LE(gr.OUTR['x']) + 2.10, sx * gr.OUTR['x'], g.wing_bot(gr.OUTR['x'], g.LE(gr.OUTR['x']) + 2.1) + 0.10)
        streamer(b, Vector((p.x + sx * 0.14, p.y, gr.GROUND + 0.95)), 0.45, 2.0)
    for k_, p in g.PYLON_PTS.items():                                   # замки балок пилонов (без ракет)
        sx = 1 if k_[0] == 'r' else -1; streamer(b, gr.ground_mat(sx) @ p - UP * 0.03, 0.45, 0.5)
    return fin(b, 'sk_rbf')


def covers():
    """Заглушки воздухозаборников всех восьми двигателей: красная пробка с ободом на губе, ручка, лента."""
    b = B(); prof = [(-0.17, 0.02), (-0.16, 0.36), (-0.12, 0.60), (-0.06, 0.70), (0.10, 0.705), (0.12, 0.66), (0.12, 0.02)]
    for sx in (1, -1):
        M = gr.ground_mat(sx)
        for xc in g.PODS:
            for k in (-1, 1):
                x_ = sx * xc + g.POD_DX * k; pf = g.pod_front(xc); zc = g.pod_z(xc)
                rings = [[M @ P3(pf + s, x_ + r * math.sin(2 * math.pi * q / 32), zc - r * math.cos(2 * math.pi * q / 32)) for q in range(32)] for s, r in prof]
                b.loft(rings, RED, cap0=RED, cap1=RED)
                h0 = M @ P3(pf - 0.17, x_ - 0.16, zc + 0.10); h1 = M @ P3(pf - 0.17, x_ + 0.16, zc + 0.10)
                dt.tube(b, [h0, h0 + (M.to_3x3() @ (-AFT)) * 0.06, h1 + (M.to_3x3() @ (-AFT)) * 0.06, h1], 0.012, DARK, 6)
                streamer(b, M @ P3(pf - 0.15, x_, zc - 0.55), 0.50, xc + k)
    return fin(b, 'sk_covers')


def chock(b, a, x, w, rw, flip):
    """Колодка: клин с наклонной гранью к шине, верёвочная ручка."""
    def off(z): return math.sqrt(max(0.0, rw * rw - (rw - z) ** 2))
    h = 0.30 * rw; d0 = off(0.02) + 0.04; d1 = off(h) + 0.03
    sec = [(d0, 0.0), (d1, h), (d1 + 0.18 * rw / 0.725, h), (d1 + 0.30 * rw / 0.725, 0.0)]
    rings = [[P3(a + flip * s, x + dx, gr.GROUND + zz) for s, zz in (sec if flip > 0 else sec[::-1])] for dx in (-w / 2, w / 2)]
    b.loft(rings, Y_, cap0=Y_, cap1=Y_)
    return P3(a + flip * (d1 + 0.12), x, gr.GROUND + h)


def chocks():
    b = B(); T = gr.TRUCKS
    for a in (T['af'], T['ar']):
        for sx in (1, -1):
            for s in (1, -1):
                xw = sx * T['x'] + s * T['trk']; p0 = chock(b, a, xw, T['ww'] * 0.95, T['rw'], 1); p1 = chock(b, a, xw, T['ww'] * 0.95, T['rw'], -1)
                side = Vector((s * (T['ww'] / 2 + 0.03), 0, 0))
                dt.tube(b, [p0 + side, p0 + side + Vector((0, 0, -0.05)), p0.lerp(p1, 0.5) + side + Vector((0, 0, -0.17)), p1 + side + Vector((0, 0, -0.05)), p1 + side], 0.012, ROPE, 6)
    O = gr.OUTR
    for sx in (1, -1):
        M = gr.ground_mat(sx); p = M @ P3(g.LE(O['x']) + 2.10, sx * O['x'], g.wing_bot(O['x'], g.LE(O['x']) + 2.1) + 0.10); a = g.L / 2 - p.y + 0.12
        for s in (1, -1): chock(b, a, p.x + s * O['trk'], O['ww'] * 0.95, O['rw'], 1); chock(b, a, p.x + s * O['trk'], O['ww'] * 0.95, O['rw'], -1)
    return fin(b, 'sk_chocks')


def ladder():
    """Люк экипажа снизу за носом открыт (крышка висит на переднем шарнире), стремянка от проёма до земли."""
    b = B(); a0, a1, hx = 3.55, 4.45, 0.34
    zb = lambda a, x: g.down(x, Yb(a), z0=-8.0, dirn=1).z
    rg = [P3(a0, -hx, 0) , P3(a1, -hx, 0), P3(a1, hx, 0), P3(a0, hx, 0)]
    b.loft([[Vector((p.x, p.y, zb(g.L / 2 - p.y, p.x) - 0.004)) for p in rg], [Vector((p.x, p.y, zb(g.L / 2 - p.y, p.x) + 0.30)) for p in rg]], DARK, cap0=DARK)   # проём
    hz = zb(a0, 0.0); L_ = a1 - a0; ang = math.radians(78)                  # крышка
    pts = lambda t: P3(a0 + L_ * math.cos(ang) * t, 0.0, hz - L_ * math.sin(ang) * t)
    b.loft([[pts(t) + Vector((dx, 0, 0)) + Vector((0, -0.02 * math.sin(ang), -0.02 * math.cos(ang))) * dz for dx, dz in ((-hx, 0), (hx, 0), (hx, 1), (-hx, 1))] for t in (0.0, 1.0)], OLIVE, cap0=OLIVE, cap1=OLIVE)
    top = zb(a1 - 0.05, 0.0); bot = gr.GROUND; at, ab = a1 - 0.05, a1 + 0.65
    for sx in (1, -1): dt.tube(b, [P3(at, sx * 0.24, top + 0.10), P3(ab, sx * 0.27, bot)], 0.024, ALU, 8)
    n_ = 7
    for i in range(1, n_ + 1):
        t = i / (n_ + 1); c = P3(at + (ab - at) * t, 0.0, top + 0.10 + (bot - top - 0.10) * t)
        b.loft([[c + Vector((-0.26, dy, dz)) for dy, dz in ((-0.05, -0.012), (0.05, -0.012), (0.05, 0.012), (-0.05, 0.012))], [c + Vector((0.26, dy, dz)) for dy, dz in ((-0.05, -0.012), (0.05, -0.012), (0.05, 0.012), (-0.05, 0.012))]], ALU, cap0=ALU, cap1=ALU)
    for sx in (1, -1): dt.tube(b, [P3(at, sx * 0.24, top + 0.10), P3(at - 0.12, sx * 0.24, top + 0.16)], 0.020, ALU, 8)
    return fin(b, 'sk_ladder')


def make_all(with_chute=True):
    out = [rbf(), covers(), chocks(), ladder()]
    if with_chute: out.append(chute())
    return out
