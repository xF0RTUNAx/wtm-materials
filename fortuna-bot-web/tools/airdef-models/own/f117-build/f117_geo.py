# f117_geo.py - геометрия F-117A для build.py. Метры. Blender: нос +Y, правое крыло +X, верх +Z.
# a - расстояние от острия носа, x - вправо, z - высота над плоскостью передней кромки. План снят с f117_08 (сдвиг и масштаб выверены по концам крыльев), высоты с f117_07, 09, 15.
# Обшивка - многогранник: таблица вершин и граней правой половины, левая зеркальна. Рёбра жёсткие, сглаживания через рёбра нет.
import math
import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from modelkit import B

L = 20.0
G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK = 0, 1, 2, 3, 4, 5     # обшивка; металл; чёрное нутро; стекло; резина; нутро отсеков и кабины
PARTS = {}
STATIONS = {}
BVH = {}
GROUND_Y = -1.62


def Yb(a): return L / 2 - a
def P3(a, x, z): return Vector((x, Yb(a), z))


# ── вершины правой половины: (a, x, z) ──
V = dict(
    N=(0.0, 0.0, 0.0), C1=(2.75, 0.0, 0.78), C2=(3.35, 0.0, 1.12), A=(5.0, 0.0, 1.95), R=(7.0, 0.0, 1.60), S1=(9.4, 0.0, 1.38), S2=(13.0, 0.0, 1.12), S3=(16.0, 0.0, 0.36),
    SW0=(16.02, 0.0, 0.03), TC=(16.38, 0.0, 0.0),
    LN=(1.72, 0.75, 0.0), LM=(3.55, 1.55, 0.0), LP=(5.95, 2.60, 0.0), Ltip=(14.93, 6.52, 0.0), TipC=(15.80, 6.49, 0.0), TipR=(16.46, 5.86, 0.0), TEr=(12.97, 2.56, 0.0), Bc=(13.87, 2.37, 0.0),
    RI=(4.0, 0.42, 1.20), RO=(5.1, 0.88, 1.12), Rc=(7.0, 0.62, 1.30), Q1=(8.0, 1.12, 1.30), Q2=(13.0, 1.20, 1.02),
    IF1=(6.60, 1.22, 1.24), IF2=(8.50, 2.05, 1.24), IO=(13.0, 2.18, 0.66), WRm=(10.6, 2.62, 0.40), TR=(15.2, 6.20, 0.075),
    LC=(13.95, 2.00, 0.34), SW1=(13.97, 2.02, 0.03),
    # низ: плоское поле на -0,16 и скаты к кромке
    UA=(2.6, 0.0, -0.16), UF=(3.0, 0.62, -0.16), UB=(7.0, 1.82, -0.16), UB2=(9.2, 2.45, -0.16), UC=(12.9, 2.40, -0.16), UE=(13.6, 1.90, -0.16), UD=(15.2, 0.0, -0.16),
)
FACES = [
    # нос и кабина
    ('N', 'LN', 'C1'), ('C1', 'RI', 'C2'), ('C1', 'LN', 'RI'), ('LN', 'RO', 'RI'), ('LN', 'LM', 'RO'), ('LM', 'IF1', 'RO'), ('RO', 'IF1', 'Q1'),
    # проём воздухозаборника: плоская наклонная грань
    ('LM', 'LP', 'IF2', 'IF1'),
    # верх короба и наружный скат
    ('IF1', 'Q2', 'Q1'), ('IF1', 'IO', 'Q2'), ('IF1', 'IF2', 'IO'), ('LP', 'WRm', 'IF2'), ('IF2', 'WRm', 'IO'), ('IO', 'WRm', 'TEr'), ('IO', 'TEr', 'Bc'),
    # крыло
    ('LP', 'Ltip', 'TR', 'WRm'), ('WRm', 'TR', 'TipR'), ('WRm', 'TipR', 'TEr'), ('TR', 'Ltip', 'TipC'), ('TR', 'TipC', 'TipR'),
    # фонарь и спина
    ('C2', 'RI', 'A'), ('RI', 'RO', 'A'), ('RO', 'Rc', 'A'), ('A', 'Rc', 'R'), ('RO', 'Q1', 'Rc'), ('Rc', 'Q1', 'S1'), ('Rc', 'S1', 'R'), ('S1', 'Q1', 'Q2'), ('S1', 'Q2', 'S2'),
    ('S2', 'Q2', 'LC'), ('S2', 'LC', 'S3'), ('Q2', 'IO', 'LC'), ('IO', 'Bc', 'LC'),
    # задняя стенка над полкой и полка
    ('S3', 'LC', 'SW1', 'SW0'), ('LC', 'Bc', 'SW1'), ('SW0', 'SW1', 'Bc', 'TC'),
    # низ
    ('N', 'UA', 'UF', 'LN'), ('LN', 'UF', 'LM'), ('LM', 'UF', 'UB', 'LP'), ('LP', 'UB', 'UB2'), ('LP', 'UB2', 'UC', 'TEr'), ('LP', 'TEr', 'TipR', 'TipC', 'Ltip'), ('TEr', 'UC', 'UE', 'Bc'), ('Bc', 'UE', 'UD', 'TC'),
    ('UA', 'UD', 'UE', 'UC', 'UB2', 'UB', 'UF'),
]


def skin_shell():
    """Замкнутый многогранник: правая половина и зеркало, вершины на оси общие."""
    b = B(); bm = b.bm; R_ = {}; L_ = {}
    for n, (a, x, z) in V.items():
        v = bm.verts.new(P3(a, x, z)); R_[n] = v
        L_[n] = v if abs(x) < 1e-6 else bm.verts.new(P3(a, -x, z))
    for f in FACES:
        q = bm.faces.new([R_[n] for n in f]); q.material_index = G_SKIN
        if all(abs(V[n][1]) < 1e-6 for n in f): continue
        q = bm.faces.new([L_[n] for n in reversed(f)]); q.material_index = G_SKIN
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4 or not _planar(f)])
    return b.finish('F117_skin', sharp_deg=3)


def _planar(f):
    n = f.normal; c = f.verts[0].co
    return all(abs((v.co - c).dot(n)) < 0.003 for v in f.verts)


def _apply_bool(host, cutter, op, solver='MANIFOLD'):
    vl = bpy.context.view_layer
    for o in list(vl.objects):
        if o is not None: o.select_set(False)
    vl.objects.active = host; host.select_set(True)
    md = host.modifiers.new('b', 'BOOLEAN'); md.operation = op; md.object = cutter
    try: md.solver = solver
    except Exception: md.solver = 'EXACT'
    bpy.ops.object.modifier_apply(modifier=md.name)


def _drop(o):
    me = o.data; bpy.data.objects.remove(o); bpy.data.meshes.remove(me)


def cut(host, ob):
    _apply_bool(host, ob, 'DIFFERENCE'); _drop(ob)


def bvh_ready(host):
    me = host.data; BVH['t'] = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])


def top(a, x):
    h = BVH['t'].ray_cast(P3(a, x, 4.0), Vector((0, 0, -1))); return h[0].z if h[0] is not None else 0.0


def bot(a, x):
    h = BVH['t'].ray_cast(P3(a, x, -3.0), Vector((0, 0, 1))); return h[0].z if h[0] is not None else 0.0


def fore_y(a, x): return top(a, x)


def _rel(ob, T):
    M = ob.matrix_world.copy(); me = ob.data
    for v in me.vertices: v.co -= T
    ob.location = T


def stations(a0, a1, da):
    n = max(2, int(round((a1 - a0) / da))); return [a0 + (a1 - a0) * i / n for i in range(n + 1)]


def strut(b, p0, p1, r, mat=G_METAL, n=12):
    d = (p1 - p0).normalized(); u = d.orthogonal().normalized(); v = d.cross(u)
    rg = lambda c: [c + (u * math.cos(2 * math.pi * q / n) + v * math.sin(2 * math.pi * q / n)) * r for q in range(n)]
    b.loft([rg(p0), rg(p1)], mat, cap0=mat, cap1=mat)


# ── плановые многоугольники: (a, x) ──
def teeth(p0, p1, n, amp, start=1):
    """Пилообразная кромка от p0 к p1: n зубцов, высота amp; без последней точки."""
    out = []; dx, dy = p1[0] - p0[0], p1[1] - p0[1]; Ln = math.hypot(dx, dy); ux, uy = dx / Ln, dy / Ln; nx, ny = -uy * start, ux * start
    for i in range(n):
        out.append((p0[0] + dx * i / n, p0[1] + dy * i / n)); m = (i + 0.5) / n; out.append((p0[0] + dx * m + nx * amp, p0[1] + dy * m + ny * amp))
    return out


def offset(poly, d):
    """Сдвиг контура внутрь на d (против часовой в осях (a, x) наружу отрицателен): срез угла по биссектрисе, ограничен."""
    n = len(poly); area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n)); sg = 1 if area > 0 else -1; out = []
    for i in range(n):
        p, c, q = poly[i - 1], poly[i], poly[(i + 1) % n]
        e0 = (c[0] - p[0], c[1] - p[1]); e1 = (q[0] - c[0], q[1] - c[1]); l0 = math.hypot(*e0) or 1; l1 = math.hypot(*e1) or 1
        n0 = (-e0[1] / l0 * sg, e0[0] / l0 * sg); n1 = (-e1[1] / l1 * sg, e1[0] / l1 * sg); m = (n0[0] + n1[0], n0[1] + n1[1]); lm = math.hypot(*m) or 1; m = (m[0] / lm, m[1] / lm)
        k = 1.0 / max(0.45, m[0] * n0[0] + m[1] * n0[1]); out.append((c[0] + m[0] * d * k, c[1] + m[1] * d * k))
    return out


def prism(name, poly, z0, z1, mat=G_COCK, sx=1):
    pts0 = [P3(a, sx * x, z0) for a, x in poly]; pts1 = [P3(a, sx * x, z1) for a, x in poly]
    b = B(); b.loft([pts0, pts1], mat, cap0=mat, cap1=mat); return b.finish(name, sharp_deg=20)


# ── решётка воздухозаборника и зона проёма ──
INL = dict(s0=0.14, s1=2.04, t0=0.0, t1=0.0, k=0.0)       # в осях грани LM-LP-IF2-IF1: s вдоль кромки со сдвигом k на t, t вверх по скату: проём повторяет края грани


def inlet_frame():
    p0 = Vector(V['LM']); e = (Vector(V['LP']) - p0).normalized(); u = Vector(V['IF1']) - p0; tv = u - e * u.dot(e); t = tv.normalized(); n = e.cross(t).normalized()
    INL['k'] = u.dot(e) / tv.length; INL['t0'] = tv.length * 0.28; INL['t1'] = tv.length * 0.84
    # вектор в осях (a, x, z): наружу значит вверх и вперёд
    if n.z < 0: n = -n
    return p0, e, t, n


def _w3(v, sx=1): return P3(v[0], sx * v[1], v[2])


def inlet_cut(sx):
    p0, e, t, n = inlet_frame(); I = INL; RR = Vector((1, -0.42, -0.05))
    P = lambda s, tt, d: _w3(p0 + e * (s + I['k'] * tt) + t * tt + (n * d if d > 0 else RR * (-d)), sx)
    ring = lambda d: [P(I['s0'], I['t0'], d), P(I['s1'], I['t0'], d), P(I['s1'], I['t1'], d), P(I['s0'], I['t1'], d)]
    b = B(); b.loft([ring(0.25), ring(0.0), ring(-0.85)], G_DARK, cap0=G_DARK, cap1=G_DARK); return b.finish('c_inl', sharp_deg=20)


def inlet_grille(sx):
    """Решётка с ромбовидной ячейкой поверх входа, средняя перемычка, рамка: настоящая геометрия, за ней чёрная глубина."""
    p0, e, t, n = inlet_frame(); I = INL; P = lambda s, tt, d: _w3(p0 + e * (s + I['k'] * tt) + t * tt + n * d, sx); b = B(); w = 0.009; h = 0.05; D0 = -0.012
    bar = lambda s0, t0_, s1, t1_: None
    cell = 0.08; S0, S1, T0, T1 = I['s0'], I['s1'], I['t0'], I['t1']
    def seg(sa, ta, sb, tb, wd=w, dd=h, mat=G_DARK):
        ds, dt = sb - sa, tb - ta; Ln = math.hypot(ds, dt) or 1; ns, nt = -dt / Ln * wd, ds / Ln * wd
        ring = lambda s, tt: [P(s + ns, tt + nt, D0), P(s - ns, tt - nt, D0), P(s - ns, tt - nt, D0 - dd), P(s + ns, tt + nt, D0 - dd)]
        b.loft([ring(sa, ta), ring(sb, tb)], mat, cap0=mat, cap1=mat)
    def clip(sa, ta, sb, tb):
        """Отрезок по прямоугольнику проёма."""
        u0, u1 = 0.0, 1.0; ds, dt = sb - sa, tb - ta
        for p, q in ((-ds, sa - S0), (ds, S1 - sa), (-dt, ta - T0), (dt, T1 - ta)):
            if abs(p) < 1e-9:
                if q < 0: return None
            else:
                r = q / p
                if p < 0: u0 = max(u0, r)
                else: u1 = min(u1, r)
        if u0 >= u1: return None
        return sa + ds * u0, ta + dt * u0, sa + ds * u1, ta + dt * u1
    span = (S1 - S0) + (T1 - T0); c = -span
    while c < span * 2:
        for sgn in (1, -1):
            r = clip(S0 + c, T0, S0 + c + sgn * (T1 - T0), T1) if sgn > 0 else clip(S0 + c, T0, S0 + c - (T1 - T0), T1)
            if r: seg(*r, mat=G_METAL)
        c += cell
    mid = (S0 + S1) / 2
    seg(mid, T0, mid, T1, 0.03, 0.09, G_SKIN)
    for a_, b_, c_, d_ in ((S0, T0, S1, T0), (S1, T0, S1, T1), (S1, T1, S0, T1), (S0, T1, S0, T0)): seg(a_, b_, c_, d_, 0.022, 0.09, G_SKIN)
    return b.finish('det_inlet_' + ('r' if sx > 0 else 'l'), sharp_deg=30)


# ── элевоны: по задней кромке, ось у самой кромки выреза, нос круглый ──
ELEV = dict(i=(0.035, 0.470), o=(0.482, 0.905)); ELEV_H = 0.88; ELEV_GAP = 0.012


def _te(t):
    p = Vector(V['TEr']); q = Vector(V['TipR']); return p + (q - p) * t


def _elev_dirs():
    d = (Vector(V['TipR']) - Vector(V['TEr'])); d.z = 0; d = d.normalized(); pr = Vector((d.y, -d.x, 0))            # pr - от оси к задней кромке (a растёт, x падает)
    if pr.x < 0: pr = -pr
    return d, pr


def elevon_cut(tag, sx):
    t0, t1 = ELEV[tag]; d, pr = _elev_dirs(); m = lambda t, k: _te(t) + pr * k
    poly = [m(t0, -ELEV_H), m(t1, -ELEV_H), m(t1, 0.3), m(t0, 0.3)]
    return prism('c_el', [(p.x, p.y) for p in poly], -0.6, 1.2, G_DARK, sx)


def elevon(tag, sx):
    name = 'elevon_%s_%s' % (tag, 'r' if sx > 0 else 'l'); t0, t1 = ELEV[tag]; d, pr = _elev_dirs(); rings = []; C = []
    sts = [t0 + 0.004 + (t1 - t0 - 0.008) * i / 6 for i in range(7)]; N = 7
    for t in sts:
        H = _te(t) - pr * ELEV_H; zt = top(H.x, H.y); zb = bot(H.x, H.y); r = max(0.012, (zt - zb) / 2); zc = (zt + zb) / 2; c0 = H + pr * (r + ELEV_GAP); C.append((c0, zc)); ring = []
        for k in range(N + 1):
            ang = math.pi / 2 + math.pi * k / N; q = c0 + pr * (r * math.cos(ang)); ring.append(_w3((q.x, q.y, zc + r * math.sin(ang)), sx))
        for fr in (0.45, 0.8, 1.0):       # низ к задней кромке
            q = H + pr * (ELEV_H * fr); ring.append(_w3((q.x, q.y, bot(q.x, q.y) - 0.001), sx))
        for fr in (1.0, 0.8, 0.45):       # верх от кромки обратно
            q = H + pr * (ELEV_H * fr); ring.append(_w3((q.x, q.y, top(q.x, q.y) + 0.0015), sx))
        rings.append(ring)
    A0 = _w3((C[0][0].x, C[0][0].y, C[0][1]), sx); A1 = _w3((C[-1][0].x, C[-1][0].y, C[-1][1]), sx); pivot = (A0 + A1) / 2; axis = (A1 - A0).normalized()
    if axis.x < 0: axis = -axis
    b = B(); b.loft([[v - pivot for v in r] for r in rings], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); ob = b.finish(name, sharp_deg=12); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-30.0, 30.0), note='ось у передней кромки элевона; минус и плюс - вверх и вниз')
    return ob


# ── хвост V: цельноповоротные плоскости, корень в плоскости, поперечной оси вращения ──
TAIL = dict(x0=0.72, z0=1.24, a_le=13.10, a_te=15.35, a_tle=18.0, a_tte=19.75, span=1.62, th0=0.17, th1=0.03); TAIL_U = Vector((0.803, 0.0, 0.596)); TAIL_GAP = 0.014


def tail_pt(a, s, h, sx):
    """a - вдоль самолёта; s - вдоль оси от плоскости корня; h - толщина вдоль нормали плоскости."""
    U = TAIL_U; n = Vector((-U.z, 0, U.x)); p = Vector((TAIL['x0'], 0, TAIL['z0'])) + U * s + n * h
    return P3(a, sx * p.x, p.z)


def tail(sx):
    name = 'tail_' + ('r' if sx > 0 else 'l'); T = TAIL; s0 = TAIL_GAP; rings = []
    for i in range(5):
        k = i / 4; s = s0 + (T['span'] - s0) * k; a0 = T['a_le'] + (T['a_tle'] - T['a_le']) * k; a1 = T['a_te'] + (T['a_tte'] - T['a_te']) * k; c = a1 - a0; th = T['th0'] + (T['th1'] - T['th0']) * k
        rings.append([tail_pt(a0, s, 0, sx), tail_pt(a0 + c * 0.32, s, th / 2, sx), tail_pt(a0 + c * 0.62, s, th / 2 * 0.72, sx), tail_pt(a1, s, 0, sx), tail_pt(a0 + c * 0.62, s, -th / 2 * 0.72, sx), tail_pt(a0 + c * 0.32, s, -th / 2, sx)])
    aP = 13.80; pivot = tail_pt(aP, 0, 0, sx); axis = (tail_pt(aP, 1, 0, sx) - pivot).normalized(); b = B(); b.loft([[v - pivot for v in r] for r in rings], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    ob = b.finish(name, sharp_deg=6); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-20.0, 20.0), note='цельноповоротная плоскость, ось вдоль размаха у корня')
    return ob


def tail_pedestal(sx):
    """Башмак корня: верх поперечен оси, низ уходит в корпус (f117_12)."""
    T = TAIL; a0, a1 = T['a_le'] - 0.05, T['a_te'] + 0.05; c = a1 - a0; h = T['th0'] / 2 + 0.03
    ring = lambda s, k: [tail_pt(a0 - k, s, 0, sx), tail_pt(a0 + c * 0.32, s, h + k * 0.5, sx), tail_pt(a0 + c * 0.62, s, h * 0.8 + k * 0.5, sx), tail_pt(a1 + k, s, 0, sx), tail_pt(a0 + c * 0.62, s, -h * 0.8 - k * 0.5, sx), tail_pt(a0 + c * 0.32, s, -h - k * 0.5, sx)]
    b = B(); b.loft([ring(-0.95, 0.10), ring(0.0, 0.0)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); return b.finish('c_ped', sharp_deg=6)


# ── щель сопла: над полкой, вдоль задней стенки ──
SLOT = dict(u0=0.10, u1=0.905, z0=0.07, z1=0.285, depth=1.05)


def slot_cut(sx):
    p = Vector(V['S3']); q = Vector(V['LC']); d = (q - p); d.z = 0; Ln = d.length; d = d.normalized(); fw = Vector((-d.y, d.x, 0))     # fw - вперёд от стенки
    if fw.x > 0: fw = -fw
    S = SLOT; A = lambda u, k, z: P3(p.x + d.x * Ln * u + fw.x * k, sx * (p.y + d.y * Ln * u + fw.y * k), z)
    r = lambda k, z0_, z1_: [A(S['u0'], k, z0_), A(S['u1'], k, z0_), A(S['u1'], k, z1_), A(S['u0'], k, z1_)]
    b = B(); b.loft([r(-0.25, S['z0'], S['z1']), r(S['depth'], S['z0'] - 0.01, S['z1'] + 0.07)], G_DARK, cap0=G_DARK, cap1=G_DARK); return b.finish('c_slot', sharp_deg=20)


def slot_vanes(sx):
    """Лопатки в щели (f117_14): вертикальные пластины, чуть вглубь."""
    p = Vector(V['S3']); q = Vector(V['LC']); d = (q - p); d.z = 0; Ln = d.length; d = d.normalized(); fw = Vector((-d.y, d.x, 0))
    if fw.x > 0: fw = -fw
    S = SLOT; b = B(); A = lambda u, k, z: P3(p.x + d.x * Ln * u + fw.x * k, sx * (p.y + d.y * Ln * u + fw.y * k), z); N = 12
    for i in range(N):
        u = S['u0'] + (S['u1'] - S['u0']) * (i + 0.5) / N; w = 0.009 / Ln
        ring = lambda k: [A(u - w, k, S['z0'] - 0.01), A(u + w, k, S['z0'] - 0.01), A(u + w, k, S['z1'] + 0.015), A(u - w, k, S['z1'] + 0.015)]
        b.loft([ring(0.06), ring(0.55)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('det_vanes_' + ('r' if sx > 0 else 'l'), sharp_deg=30)


# ── отсек вооружения: две створки, пилообразные торцы, шарнир у наружной кромки ──
BAY = dict(a0=7.20, a1=11.60, x=0.90, z=-0.16, top=0.86, teeth=4, amp=0.10)


def _bay_half():
    B_ = BAY; f = teeth((B_['a0'], 0.0), (B_['a0'], B_['x']), B_['teeth'], B_['amp'], start=1); r = teeth((B_['a1'], B_['x']), (B_['a1'], 0.0), B_['teeth'], B_['amp'], start=1)
    return f + [(B_['a0'], B_['x'])] + r + [(B_['a1'], 0.0)]


def bay_cut():
    h = _bay_half(); full = h + [(a, -x) for a, x in reversed(h) if abs(x) > 1e-6]
    return prism('c_bay', full, BAY['z'] - 0.5, BAY['top'], G_COCK)


def bay_door(sx):
    name = 'bay_' + ('r' if sx > 0 else 'l'); h = _bay_half(); poly = offset(h, 0.006); pivot = P3((BAY['a0'] + BAY['a1']) / 2, sx * BAY['x'], BAY['z'] - 0.006)
    b = B(); r0 = [P3(a, sx * x, BAY['z']) - pivot for a, x in poly]; r1 = [P3(a, sx * x, BAY['z'] + 0.035) - pivot for a, x in poly]; b.loft([r0, r1], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    # рёбра жёсткости изнутри
    for a_ in (7.9, 8.8, 9.7, 10.6):
        rg = lambda aa: [P3(aa, sx * 0.04, BAY['z'] + 0.035) - pivot, P3(aa, sx * 0.78, BAY['z'] + 0.035) - pivot, P3(aa, sx * 0.78, BAY['z'] + 0.075) - pivot, P3(aa, sx * 0.04, BAY['z'] + 0.075) - pivot]
        b.loft([rg(a_ - 0.018), rg(a_ + 0.018)], G_COCK, cap0=G_COCK, cap1=G_COCK)
    ob = b.finish(name, sharp_deg=20); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((0, -sx, 0)), range=(0.0, 100.0), note='шарнир у наружной кромки; плюс - внутренняя кромка вниз и в сторону')
    return ob


def bay_inner():
    """Нутро: потолок с рёбрами, стенки, две балки-держателя с замками; точки подвески ровно под замками."""
    b = B(); B_ = BAY
    def box(a0, a1, x0, x1, z0, z1, mat=G_COCK):
        rg = lambda a: [P3(a, x0, z0), P3(a, x1, z0), P3(a, x1, z1), P3(a, x0, z1)]
        b.loft([rg(a0), rg(a1)], mat, cap0=mat, cap1=mat)
    for a_ in (7.5, 8.1, 8.7, 9.3, 9.9, 10.5, 11.1): box(a_ - 0.03, a_ + 0.03, -0.895, 0.895, B_['top'] - 0.09, B_['top'], G_COCK)
    for x_ in (-0.62, -0.2, 0.2, 0.62): box(7.25, 11.55, x_ - 0.02, x_ + 0.02, B_['top'] - 0.05, B_['top'], G_COCK)
    for sg in (1, -1):
        for a_ in (7.8, 8.8, 9.8, 10.8):
            rg = lambda z, k: [P3(a_ - 0.035, sg * (0.892), z), P3(a_ + 0.035, sg * 0.892, z), P3(a_ + 0.035, sg * (0.892 - k), z), P3(a_ - 0.035, sg * (0.892 - k), z)]
            b.loft([rg(0.0, 0.06), rg(B_['top'] - 0.05, 0.09)], G_COCK, cap0=G_COCK, cap1=G_COCK)
        x = sg * 0.44; z0 = 0.46
        box(7.45, 11.35, x - 0.055, x + 0.055, z0, B_['top'] - 0.05, G_METAL)          # балка
        box(7.45, 11.35, x - 0.075, x + 0.075, z0 - 0.025, z0, G_DARK)                 # полка
        for a_c in (7.75, 9.40, 11.05):
            for da in (-0.178, 0.178):                                               # замки парами
                box(a_c + da - 0.05, a_c + da + 0.05, x - 0.035, x + 0.035, z0 - 0.075, z0 - 0.025, G_METAL)
            for da in (-0.34, 0.34):                                                 # упоры
                box(a_c + da - 0.022, a_c + da + 0.022, x - 0.06, x + 0.06, z0 - 0.14, z0 - 0.025, G_DARK)
        # гидроцилиндр створки
        for a_ in (8.3, 10.3):
            p0 = P3(a_, sg * 0.86, B_['top'] - 0.1); p1 = P3(a_, sg * 0.86, 0.02); rg = lambda c, r: [c + Vector((r * math.cos(2 * math.pi * k / 10), r * math.sin(2 * math.pi * k / 10), 0)) for k in range(10)]
            b.loft([rg(p0, 0.03), rg(p1, 0.018)], G_METAL, cap0=G_METAL, cap1=G_METAL)
    return b.finish('det_bay', sharp_deg=30)


BAY_ST = ((9.40, 0.44), (7.75, 0.44), (11.05, 0.44), (9.40, 0.78))


def stations_fill():
    for i, (a, x) in enumerate(BAY_ST):
        for sg, n in ((1, 'r'), (-1, 'l')):
            STATIONS['st%d_%s' % (i, n)] = P3(a, sg * x, 0.46 - 0.075)


# ── кабина ──
CK = [(3.55, 0.0), (4.02, 0.36), (5.1, 0.80), (6.98, 0.55), (6.98, -0.55), (5.1, -0.80), (4.02, -0.36)]


def CK_HW(a):
    pts = [(3.55, 0.0), (4.02, 0.36), (5.1, 0.80), (6.98, 0.55)]
    for (a0, x0), (a1, x1) in zip(pts, pts[1:]):
        if a0 <= a <= a1: return x0 + (x1 - x0) * (a - a0) / (a1 - a0)
    return 0.3


class _CT:
    def __call__(self, a): return 1.5


CAN_T = [_CT(), CK_HW]


def cock_cut(): return prism('c_cock', CK, 0.62, 3.0, G_COCK)


def seat_well(): return prism('c_well', [(5.0, -0.42), (6.95, -0.42), (6.95, 0.42), (5.0, 0.42)], 0.30, 0.70, G_COCK)


def _incircle(p0, p1, p2):
    a = (p1 - p2).length; b_ = (p0 - p2).length; c = (p0 - p1).length; s = a + b_ + c; I = (p0 * a + p1 * b_ + p2 * c) / s; ar = (p1 - p0).cross(p2 - p0).length / 2; return I, 2 * ar / s


def _inset(tri, d):
    I, r = _incircle(*tri); k = min(0.8, d / r); return [p + (I - p) * k for p in tri]


CAN_FACETS = (('C2', 'RI', 'A', True, 0.045), ('RI', 'RO', 'A', True, 0.055), ('RO', 'Rc', 'A', True, 0.06), ('Rc', 'R', 'A', False, 0.0))


def canopy():
    """Фонарь из граней: рама одним куском, окна утоплены, петля сзади. Закрытый лежит на пороге."""
    pv = P3(7.06, 0.0, 1.50); b = B(); bg = B(); LIFT = 0.006
    for sx in (1, -1):
        for n0, n1, n2, glass, fw in CAN_FACETS:
            t = [_w3(V[n], sx) for n in (n0, n1, n2)]; nr = (t[1] - t[0]).cross(t[2] - t[0]).normalized()
            if nr.z < 0: nr = -nr
            o = [p + nr * LIFT for p in t]; low = [p + nr * 0.001 for p in t]
            if not glass:
                b.loft([[p - pv for p in o], [p - pv for p in low]], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); continue
            i_ = _inset(o, fw); i2 = [p - nr * 0.012 for p in i_]
            sec = [[p - pv for p in o], [p - pv for p in i_], [p - pv for p in i2], [p - pv for p in low]]
            b.loft(sec + [sec[0]], G_SKIN)
            g_ = [p - nr * 0.006 - pv for p in i_]; bm = bg.bm; f = bm.faces.new([bm.verts.new(p) for p in g_]); f.material_index = G_GLASS
    ob = b.finish('canopy', sharp_deg=6); ob.location = pv
    gl = bg.finish('canopy_glass', sharp_deg=40); gl.location = pv; gl.data.materials
    PARTS['canopy'] = dict(pivot=pv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 42.0), note='петля сзади; плюс - передняя часть вверх')
    PARTS['canopy_glass'] = dict(pivot=pv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 42.0), note='вместе с фонарём')
    return [ob, gl]


# ── створки шасси и люки: плиты с пилообразным контуром в плоскости низа ──
NG = dict(hinge=(3.45, -0.02), a=3.95, rw=0.31, ww=0.16, track=0.0)
MG_A = 11.05; MG_X = 2.03; MAIN_T = (10.10, 2.03, -0.02)
NOSE_DOOR = dict(a0=3.20, a1=5.10, x=0.30); MAIN_DOOR = dict(a0=9.80, a1=12.00, x0=1.45, x1=2.30)


def _nose_poly():
    D = NOSE_DOOR; return teeth((D['a0'], -D['x']), (D['a0'], D['x']), 3, 0.08) + [(D['a0'], D['x'])] + teeth((D['a1'], D['x']), (D['a1'], -D['x']), 3, 0.08) + [(D['a1'], -D['x'])]


def _main_poly():
    D = MAIN_DOOR; return teeth((D['a0'], D['x0']), (D['a0'], D['x1']), 4, 0.09) + [(D['a0'], D['x1'])] + teeth((D['a1'], D['x1']), (D['a1'], D['x0']), 4, 0.09) + [(D['a1'], D['x0'])]


def door_plate(name, poly, sx, pivot, axis, rng, z=-0.16, note=''):
    p = [P3(a, sx * x, z) - pivot for a, x in poly]; q = [P3(a, sx * x, z + 0.03) - pivot for a, x in poly]; b = B(); b.loft([p, q], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); ob = b.finish(name, sharp_deg=20); ob.location = pivot
    PARTS[name] = dict(pivot=pivot.copy(), axis=axis, range=rng, note=note); return ob


def doors():
    out = []
    pn = offset(_nose_poly(), 0.006); pv = P3((NOSE_DOOR['a0'] + NOSE_DOOR['a1']) / 2, NOSE_DOOR['x'], -0.16)
    out.append(door_plate('door_n', pn, 1, pv, Vector((0, -1, 0)), (0.0, 95.0), note='шарнир справа; плюс - вниз'))
    for sx, n in ((1, 'r'), (-1, 'l')):
        pm = offset(_main_poly(), 0.006); pv = P3((MAIN_DOOR['a0'] + MAIN_DOOR['a1']) / 2, sx * MAIN_DOOR['x1'], -0.16)
        out.append(door_plate('door_m_' + n, pm, sx, pv, Vector((0, -sx, 0)), (0.0, 92.0), note='шарнир у наружной кромки; плюс - вниз'))
    return out


def gear_bays(host):
    cut(host, prism('c_nb', _nose_poly(), -0.6, 0.56, G_DARK))
    for sx in (1, -1): cut(host, prism('c_mb', _main_poly(), -0.6, 0.42, G_DARK, sx))


# ── окна и люки ──
def hex_poly(ac, xc, ra, rx, n=3, amp=0.035):
    """Шестигранный контур с пилой (f117_01, 07)."""
    P = [(ac - ra, xc - rx * 0.55), (ac - ra, xc + rx * 0.55), (ac, xc + rx), (ac + ra, xc + rx * 0.55), (ac + ra, xc - rx * 0.55), (ac, xc - rx)]; out = []
    for i in range(6): out += teeth(P[i], P[(i + 1) % 6], n, amp)
    return out


def window_grid(name, poly_b, ac, xc, ra, rx, surf, cell=0.05, zof=-0.012):
    """Решётка окна сенсора в выемке: планки по две стороны, лежат на грани surf(a, x)."""
    b = B(); w = 0.0055
    def seg(a0, x0, a1, x1):
        n_ = 2; pts = [(a0 + (a1 - a0) * i / n_, x0 + (x1 - x0) * i / n_) for i in range(n_ + 1)]; da, dx = a1 - a0, x1 - x0; Ln = math.hypot(da, dx); na, nx = -dx / Ln * w, da / Ln * w
        rings = []
        for a_, x_ in pts:
            z = surf(a_, x_) + zof; rings.append([P3(a_ + na, x_ + nx, z), P3(a_ - na, x_ - nx, z), P3(a_ - na, x_ - nx, z - 0.02), P3(a_ + na, x_ + nx, z - 0.02)])
        b.loft(rings, G_METAL, cap0=G_METAL, cap1=G_METAL)
    k = -ra - rx
    while k < ra + rx:
        for sg in (1, -1):
            # отрезки по эллипсу вокруг центра, внутри шестигранника
            t0, t1 = -1.2, 1.2; pts = []
            for i in range(25):
                t = t0 + (t1 - t0) * i / 24; a_ = k + t * ra; x_ = sg * t * ra
                pts.append((a_, x_))
            ins = [(a_, x_) for a_, x_ in pts if abs(a_) <= ra * 0.92 and abs(x_) <= rx * (1 - 0.45 * abs(a_) / ra) * 0.92]
            if len(ins) >= 2: seg(ac + ins[0][0], xc + ins[0][1], ac + ins[-1][0], xc + ins[-1][1])
        k += cell * 1.4
    return b.finish(name, sharp_deg=30)


REFUEL = dict(ac=8.25, ra=0.38, rx=0.34)


def _refuel_poly():
    R_ = REFUEL; return hex_poly(R_['ac'], 0.0, R_['ra'], R_['rx'], 2, 0.03)


def refuel_door():
    """Люк дозаправки на спине: две половины следуют граням, шарнир сзади."""
    R_ = REFUEL; pts = offset(_refuel_poly(), 0.006); pv = P3(R_['ac'] + R_['ra'] + 0.05, 0.0, top(R_['ac'] + R_['ra'], 0.0) + 0.015); bb = B(); bm = bb.bm
    tv = [bm.verts.new(P3(a, x, top(a, x) + 0.003) - pv) for a, x in pts]; lv = [bm.verts.new(P3(a, x, top(a, x) - 0.03) - pv) for a, x in pts]
    ca = bm.verts.new(P3(R_['ac'], 0.0, top(R_['ac'], 0.0) + 0.003) - pv); cb = bm.verts.new(P3(R_['ac'], 0.0, top(R_['ac'], 0.0) - 0.03) - pv); n = len(pts)
    for i in range(n):
        j = (i + 1) % n; f = bm.faces.new((ca, tv[i], tv[j])); f.material_index = G_SKIN; f = bm.faces.new((cb, lv[j], lv[i])); f.material_index = G_SKIN; f = bm.faces.new((tv[j], tv[i], lv[i], lv[j])); f.material_index = G_SKIN
    ob = bb.finish('refuel_door', sharp_deg=6); ob.location = pv
    PARTS['refuel_door'] = dict(pivot=pv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 60.0), note='шарнир сзади; плюс - передняя кромка вверх')
    return ob


ANT = dict(a0=12.30, a1=12.95, z=-0.16)


def antenna():
    """Убираемая антенна снизу: лежит в щели заподлицо, ось спереди, опускается вниз."""
    A_ = ANT; pv = P3(A_['a0'], 0.0, A_['z'] + 0.04); b = B(); hw = 0.016; L_ = A_['a1'] - A_['a0']
    pl = lambda dx: [P3(A_['a0'], dx, A_['z'] + 0.04) - pv, P3(A_['a1'] - 0.02, dx * 0.5, A_['z'] + 0.04) - pv, P3(A_['a1'] - 0.02, dx * 0.5, A_['z'] + 0.002) - pv, P3(A_['a0'], dx, A_['z'] + 0.002) - pv]
    b.loft([pl(-hw), pl(hw)], G_SKIN, cap0=G_SKIN, cap1=G_SKIN); ob = b.finish('antenna', sharp_deg=20); ob.location = pv
    PARTS['antenna'] = dict(pivot=pv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 85.0), note='0 - убрана; плюс - задний конец вниз')
    return ob


def plane(stage=9, carve=True):
    """Этапы: 1 - обшивка; 2 - хвост и элевоны; 3 - кабина, фонарь, отсек, решётки, сопла; 4 - шасси и створки."""
    import f117_detail as d
    PARTS.clear(); STATIONS.clear()
    skin = skin_shell()
    for sx in (1, -1):
        p = tail_pedestal(sx); _apply_bool(skin, p, 'UNION'); _drop(p)
    bvh_ready(skin); out = [skin]; stations_fill()
    if stage >= 2:
        out += [tail(1), tail(-1)]
        for sx in (1, -1):
            for tag in ('i', 'o'): out.append(elevon(tag, sx))
    if stage >= 3:
        rd = refuel_door(); out += [rd, antenna(), d.probes(), d.seals(), bay_inner(), bay_door(1), bay_door(-1), d.cockpit_detail()] + canopy()
        for sx in (1, -1): out += [inlet_grille(sx), slot_vanes(sx)]
        out += d.windows()
    if stage >= 4:
        out += doors()
        import f117_gear as gr; out += gr.gear_nose() + gr.gear_main(1) + gr.gear_main(-1)
    # вырезы: после всего, что лучами ложится на обшивку
    if stage >= 2:
        for sx in (1, -1):
            for tag in ('i', 'o'): cut(skin, elevon_cut(tag, sx))
    if stage >= 3:
        cut(skin, cock_cut()); cut(skin, seat_well()); cut(skin, bay_cut())
        for sx in (1, -1): cut(skin, inlet_cut(sx)); cut(skin, slot_cut(sx))
        cut(skin, prism('c_ref', _refuel_poly(), 0.9, 2.4, G_DARK))
        cut(skin, prism('c_ant', [(ANT['a0'] - 0.06, -0.04), (ANT['a1'] + 0.03, -0.04), (ANT['a1'] + 0.03, 0.04), (ANT['a0'] - 0.06, 0.04)], ANT['z'] - 0.3, ANT['z'] + 0.06, G_DARK))
        d.window_cuts(skin)
    if stage >= 4:
        gear_bays(skin)
    d.resharp(skin, 3)
    return out
