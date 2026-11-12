# f5kit.py - общие помощники сборки F-5E (перенесены из B-1B Lancer/b1b_geo.py и b1b_wing.py): интерполяция таблиц, сечения по неявной функции,
# лофт, булевы операции, профиль NACA, круглые выемки рулей. Точки сечения строит P3(a, x, z) модуля самолёта - передаётся аргументом.
import math
import bmesh
import bpy
from mathutils import Vector, Matrix
from modelkit import B

class Track:
    """Гладкая интерполяция таблицы (монотонный кубический Эрмит)."""
    def __init__(self, pts):
        self.x = [p[0] for p in pts]; self.y = [p[1] for p in pts]; n = len(pts)
        d = [(self.y[i + 1] - self.y[i]) / (self.x[i + 1] - self.x[i]) for i in range(n - 1)]
        m = [d[0]] + [0.0 if d[i - 1] * d[i] <= 0 else 3 * (self.x[i + 1] - self.x[i - 1]) / ((2 * self.x[i + 1] - self.x[i] - self.x[i - 1]) / d[i - 1] + (self.x[i + 1] + self.x[i] - 2 * self.x[i - 1]) / d[i]) for i in range(1, n - 1)] + [d[-1]]
        self.m = m

    def __call__(self, t):
        x, y, m = self.x, self.y, self.m
        if t <= x[0]: return y[0]
        if t >= x[-1]: return y[-1]
        i = next(k for k in range(len(x) - 1) if x[k] <= t <= x[k + 1]); h = x[i + 1] - x[i]; s = (t - x[i]) / h
        return (2 * s ** 3 - 3 * s ** 2 + 1) * y[i] + (s ** 3 - 2 * s ** 2 + s) * h * m[i] + (-2 * s ** 3 + 3 * s ** 2) * y[i + 1] + (s ** 3 - s ** 2) * h * m[i + 1]


def tracks(table):
    return [Track([(r[0], r[i + 1]) for r in table]) for i in range(len(table[0]) - 1)]


def stations(a0, a1, da):
    n = max(2, int(round((a1 - a0) / da))); return [a0 + (a1 - a0) * i / n for i in range(n + 1)]


def _sm(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)


def smin(a, b, k):
    if k <= 0: return min(a, b)
    h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25


def thk(u):
    u = max(0.0, min(1.0, u)); return 5 * (0.2969 * math.sqrt(u) - 0.1260 * u - 0.3516 * u ** 2 + 0.2843 * u ** 3 - 0.1015 * u ** 4)


def loft_obj(name, rings, mat=0, cap0=True, cap1=True, sharp=38):
    b = B(); b.loft(rings, mat, cap0=mat if cap0 else None, cap1=mat if cap1 else None)
    return b.finish(name, sharp_deg=sharp)


def _rel(ob, pivot):
    for v in ob.data.vertices: v.co -= pivot
    ob.location = pivot
    return ob


def ring_from_field(P3, a, f, cx, cz, rmax, n, nray=900, sharp_w=6.0, start=-math.pi / 2, anchors=0):
    pts = []
    for k in range(nray):
        th = start + 2 * math.pi * k / nray; dx, dz = math.cos(th), math.sin(th)
        lo, hi = 0.0, rmax
        if f(cx + dx * hi, cz + dz * hi) < 0: r = hi
        else:
            # шаг снаружи внутрь до первого «внутри», потом деление пополам
            st = rmax / 120.0; r_ = rmax
            while r_ > 0 and f(cx + dx * r_, cz + dz * r_) >= 0: r_ -= st
            lo, hi = max(r_, 0.0), r_ + st
            for _ in range(22):
                mid = (lo + hi) / 2
                if f(cx + dx * mid, cz + dz * mid) < 0: lo = mid
                else: hi = mid
            r = (lo + hi) / 2
        pts.append((cx + dx * r, cz + dz * r))
    m = len(pts); w = [0.0]
    for i in range(m):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % m]
        e0 = (p1[0] - p0[0], p1[1] - p0[1]); e1 = (p2[0] - p1[0], p2[1] - p1[1]); l1 = math.hypot(*e1)
        t0 = math.atan2(e0[1], e0[0]); t1 = math.atan2(e1[1], e1[0]); dt = abs((t1 - t0 + math.pi) % (2 * math.pi) - math.pi)
        w.append(w[-1] + l1 * (1.0 + sharp_w * min(dt, 1.0) / max(l1, 1e-4) * 0.02))
    def at(s_):
        j = 0
        while j < m - 1 and w[j + 1] < s_: j += 1
        t = (s_ - w[j]) / max(w[j + 1] - w[j], 1e-12); p, q = pts[j], pts[(j + 1) % m]
        return P3(a, p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
    if anchors:                                                     # якоря на постоянных углах: точки не съезжают по всему контуру, когда где-то появляется короб или наплыв
        per = n // anchors; out = []
        for g_ in range(anchors):
            i0 = g_ * m // anchors; i1 = (g_ + 1) * m // anchors; s0, s1 = w[i0], w[i1]
            out += [at(s0 + (s1 - s0) * k / per) for k in range(per)]
        return out
    tot = w[-1]
    return [at(tot * k / n) for k in range(n)]


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


def resharp(host, deg=38):
    bm = bmesh.new(); bm.from_mesh(host.data); lim = math.radians(deg)
    for f in bm.faces: f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2: e.smooth = e.calc_face_angle(0.0) < lim
        else: e.smooth = False
    bm.to_mesh(host.data); bm.free()


# ── круглые выемки под носы рулей (из b1b_wing.py) ──
COVE_K, COVE_R = 7, 0.008
def cove_cut(dle, c, tc_, dh, clr=COVE_R):
    uh = (dh - dle) / c; t = tc_ * c * thk(uh); rc = t + clr; de = dh - math.sqrt(max(rc * rc - t * t, 1e-9)); te_ = tc_ * c * thk((de - dle) / c); rc = math.hypot(de - dh, te_); al = math.atan2(te_, de - dh)
    return (de - dle) / c, [(dh + rc * math.cos(al + (2 * math.pi - 2 * al) * (i + 1) / (COVE_K + 1)), rc * math.sin(al + (2 * math.pi - 2 * al) * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_wall(dle, c, tc_, u1):
    d_ = dle + c * u1; t = tc_ * c * thk(u1); return [(d_, t * (1 - 2 * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_nose(dle, c, tc_, dh):
    t = tc_ * c * thk((dh - dle) / c); return [(dh - t * math.sin(math.pi * (i + 1) / (COVE_K + 1)), -t * math.cos(math.pi * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]
def cove_wall_f(dle, c, tc_, u0):
    d_ = dle + c * u0; t = tc_ * c * thk(u0); return [(d_, t * (-1 + 2 * (i + 1) / (COVE_K + 1))) for i in range(COVE_K)]


def foil_ring(dle, c, tc_, u0, u1, nu, place, tail, head):
    us = [u0 + (u1 - u0) * (1 - math.cos(math.pi * i / (nu - 1))) / 2 for i in range(nu)]
    up = [place(dle + c * u, +tc_ * c * thk(u)) for u in us]
    lo = [place(dle + c * u, -tc_ * c * thk(u)) for u in reversed(us)]
    return up + [place(d_, h_) for d_, h_ in tail] + lo + [place(d_, h_) for d_, h_ in head]


def _in(s, rng):
    for i, (s0, s1) in enumerate(rng):
        if s0 - 1e-6 <= s <= s1 + 1e-6: return i
    return None


