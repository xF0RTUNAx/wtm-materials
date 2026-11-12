# b1b_wing.py - консоли крыла B-1B с механизацией: предкрылки по всему размаху, закрылки, интерцепторы сверху (фото 01, 02, 04, 06, 08).
# Консоль строится в своей системе при стреловидности 15°: s - вдоль размаха от шарнира, d - назад от шарнира, z - от плоскости хорд у шарнира.
# Локально: Vector((sx * s, -d, z)). Объект консоли стоит на шарнире и повёрнут к рабочей стреловидности; механизация - дети консоли.
# Задняя кромка у корня подрезана так, чтобы при 67,5° консоль не заходила к оси ближе X_MIN (дальше - щель наплыва, фюзеляж и отсеки).
import math
import bpy
from mathutils import Vector, Matrix
from modelkit import B
import b1b_geo as g

PARTS = g.PARTS
X_MIN = 2.60                                                    # ближе к оси консоль не заходит ни при каком угле
K_SW = math.radians(g.SW_MAX - g.SW_MIN)
TC0, TC1 = 0.100, 0.075
SL_C = 0.14                                                     # доля хорды предкрылка
FL_C = 0.27                                                     # доля хорды закрылка
SLATS = [(1.10, 5.40), (5.46, 10.40), (10.46, 15.90)]
FLAPS = [(3.30, 7.00), (7.06, 10.80), (10.86, 14.40)]      # внутренний конец - за подрезкой корня (линия навески прямая)
SPOIL = [(6.90, 8.70), (8.90, 10.70), (10.90, 12.70), (12.90, 14.30)]   # снаружи щели: при 67,5° не уходят в корпус
SP_U = (0.52, 0.68)
COVE_K, COVE_R = 7, 0.010


def thk(u): return g.thk(u)
def le(s): return g.W_LE0 + max(s, 0.0) * math.tan(math.radians(g.SW_MIN))
def te_raw(s): return g.w_te(max(s, 0.0))
def te(s):
    """Задняя кромка с подрезкой у корня (гладкий минимум)."""
    lim = (g.PIV_X - X_MIN + s * math.cos(K_SW)) / math.sin(K_SW); t = te_raw(s); k = 0.35
    h = max(k - abs(t - lim), 0.0) / k; return min(t, lim) - h * h * k * 0.25
def tc(s): return TC0 + (TC1 - TC0) * max(s, 0.0) / g.W_SPAN
def zc(s): return math.tan(math.radians(g.W_DIH)) * max(s, 0.0)


def chord(s):
    l_, t_ = le(s), te(s)
    if s < 0:
        hcut = math.sqrt(max(g.W_ROOT_R ** 2 - s * s, 0.0)); l_, t_ = max(l_, -hcut), min(t_, hcut)
        if t_ - l_ < 0.06: l_, t_ = -0.03, 0.03
    return l_, t_


# ── круглые выемки под носы закрылков (как у Vulcan): щель одна при любом угле ──
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


def hinge_d(s):
    l_, t_ = chord(s); return t_ - FL_C * (t_ - l_)


def section(sx, s, grow=0.0):
    """Сечение основной части консоли: с вырезами под предкрылок и закрылок там, где они есть. grow - утолщение (резак щели)."""
    l_, t_ = chord(s); c = t_ - l_; tc_ = tc(s) + (grow * 2 / c if c > 0 else 0.0); z0 = zc(s)
    place = lambda d, h: Vector((sx * s, -d, z0 + h))
    if grow > 0:
        l_ -= grow; t_ += grow; c = t_ - l_
        return foil_ring(l_, c, tc_, 0.0006, 1.0, 40, place, cove_wall(l_, c, tc_, 1.0), cove_wall_f(l_, c, tc_, 0.0006))
    if _in(s, SLATS) is not None: u0 = SL_C; head = cove_wall_f(l_, c, tc_, u0)
    else: u0 = 0.0006; head = cove_wall_f(l_, c, tc_, u0)
    if _in(s, FLAPS) is not None: u1, tail = cove_cut(l_, c, tc_, hinge_d(s))
    else: u1 = 1.0; tail = cove_wall(l_, c, tc_, 1.0)
    return foil_ring(l_, c, tc_, u0, u1, 40, place, tail, head)


def _rings(sx, ss, fn):
    rs = [fn(s) for s in ss]
    return rs if sx > 0 else [r[::-1] for r in rs]


def _obj(name, rings, mat=g.G_SKIN, sharp=48):
    b = B(); b.loft(rings, mat, cap0=mat, cap1=mat); return b.finish(name, sharp_deg=sharp)


def span_stations():
    k = [-g.W_ROOT_R + 0.002, -1.0, -0.9, -0.75, -0.55, -0.3, 0.0, 0.3, 0.6, 0.8, 1.0, g.W_SPAN - 0.35, g.W_SPAN - 0.18, g.W_SPAN - 0.07, g.W_SPAN]
    for rng in (SLATS, FLAPS):
        for s0, s1 in rng: k += [s0 - 0.003, s0, s1, s1 + 0.003] + [s0 + (s1 - s0) * i / 8 for i in range(1, 8)]
    k += [s for s in g.stations(0.0, g.W_SPAN - 0.5, 0.4)]
    return sorted(set(round(v, 4) for v in k if -g.W_ROOT_R <= v <= g.W_SPAN))


def _child(parent, ob, lp, name, axis_l, rng, note, kind=None):
    """Ребёнок консоли: начало в точке lp (локально консоли); ось axis_l локально. В PARTS - мир при положении файла."""
    for v in ob.data.vertices: v.co -= lp
    ob.parent = parent; ob.matrix_parent_inverse = Matrix.Identity(4); ob.location = lp
    M = parent.matrix_world; R = M.to_3x3().normalized()
    D = dict(pivot=(M @ lp).copy(), axis=(R @ axis_l).normalized(), range=rng, note=note + f'; ребёнок {parent.name}, поворачивается вместе с консолью', parent=parent.name,
             pivot_local=lp.copy(), axis_local=axis_l.normalized())
    if kind: D['kind'] = kind
    PARTS[name] = D
    return ob


def wing_panel(sx, sweep=g.SW_MAX):
    side = 'r' if sx > 0 else 'l'; name = 'wing_' + side
    ob = _obj(name, _rings(sx, span_stations(), lambda s: section(sx, s)))
    pivot = g.P3(g.PIV_A, sx * g.PIV_X, g.W_ZC); ob.location = pivot; ob.rotation_euler = (0, 0, math.radians(sweep - g.SW_MIN) * (-sx))
    bpy.context.view_layer.update()
    PARTS[name] = dict(pivot=pivot.copy(), axis=Vector((0, 0, -sx)), range=(0.0, g.SW_MAX - g.SW_MIN), rest=g.SW_MAX - g.SW_MIN,
                       note=f'консоль: вертикальная ось шарнира в наплыве; 0 - стреловидность {g.SW_MIN}° (крыло вперёд), {g.SW_MAX - g.SW_MIN}° - сложено ({g.SW_MAX}°, положение в файле); плюс - конец назад; дети - предкрылки, закрылки, интерцепторы')
    out = [ob]
    # закрылки: круглый нос в круглой выемке, ось - центр носа
    for i, (s0, s1) in enumerate(FLAPS):
        a0, a1 = s0 + 0.016, s1 - 0.016; rings = []
        for j in range(9):
            s = a0 + (a1 - a0) * j / 8; l_, t_ = chord(s); c = t_ - l_; tc_ = tc(s); dh = hinge_d(s); z0 = zc(s)
            rings.append(foil_ring(l_, c, tc_, (dh - l_) / c, 1.0, 12, lambda d, h: Vector((sx * s, -d, z0 + h)), [], cove_nose(l_, c, tc_, dh)))
        fo = _obj(f'flap{i + 1}_{side}', rings if sx > 0 else [r[::-1] for r in rings])
        p0 = Vector((sx * a0, -hinge_d(a0), zc(a0))); p1 = Vector((sx * a1, -hinge_d(a1), zc(a1))); lp = (p0 + p1) / 2; ax = (p1 - p0).normalized() * sx
        out.append(_child(ob, fo, lp, f'flap{i + 1}_{side}', ax, (0.0, 40.0), 'закрылок: ось в центре круглого носа; плюс - задняя кромка вниз'))
    # предкрылки: передняя часть профиля до SL_C, сзади плоская стенка с зазором 8 мм; ось у нижнего заднего угла - носок вниз и вперёд
    for i, (s0, s1) in enumerate(SLATS):
        a0, a1 = s0 + 0.016, s1 - 0.016; rings = []
        for j in range(9):
            s = a0 + (a1 - a0) * j / 8; l_, t_ = chord(s); c = t_ - l_; tc_ = tc(s); z0 = zc(s); ue = SL_C - 0.008 / c
            rings.append(foil_ring(l_, c, tc_, 0.0006, ue, 14, lambda d, h: Vector((sx * s, -d, z0 + h)), cove_wall(l_, c, tc_, ue), cove_wall_f(l_, c, tc_, 0.0006)))
        so = _obj(f'slat{i + 1}_{side}', rings if sx > 0 else [r[::-1] for r in rings])
        def ctr(s): l_, t_ = chord(s); c = t_ - l_; return Vector((sx * s, -(l_ + 0.32 * c), zc(s) - 0.30 * c))   # центр дуги направляющих: позади и ниже - предкрылок уходит вперёд и вниз
        p0, p1 = ctr(a0), ctr(a1); lp = (p0 + p1) / 2; ax = Vector((-1.0, 0.0, 0.0))     # ось строго по размаху консоли: торцы ходят в своих плоскостях
        out.append(_child(ob, so, lp, f'slat{i + 1}_{side}', ax, (0.0, 22.0), 'предкрылок: ось у нижнего заднего угла вдоль размаха; плюс - носок вниз (выпуск)'))
    # интерцепторы: плиты по верху перед закрылками, ось по передней кромке, плюс - задняя кромка вверх
    for i, (s0, s1) in enumerate(SPOIL):
        b = B(); bm = b.bm; nu, nv = 10, 6; top, bot = [], []
        for j in range(nv + 1):
            rt, rb = [], []
            for k in range(nu + 1):
                s = s0 + (s1 - s0) * k / nu; l_, t_ = chord(s); c = t_ - l_; u = SP_U[0] + (SP_U[1] - SP_U[0]) * j / nv
                h = tc(s) * c * thk(u); p = Vector((sx * s, -(l_ + c * u), zc(s) + h))
                rt.append(bm.verts.new(p + Vector((0, 0, 0.010)))); rb.append(bm.verts.new(p + Vector((0, 0, 0.001))))
            top.append(rt); bot.append(rb)
        def q(vs, m=g.G_SKIN):
            f = bm.faces.new(vs if sx > 0 else vs[::-1]); f.material_index = m
        for j in range(nv):
            for k in range(nu):
                q((top[j][k], top[j][k + 1], top[j + 1][k + 1], top[j + 1][k])); q((bot[j][k], bot[j + 1][k], bot[j + 1][k + 1], bot[j][k + 1]))
        for k in range(nu):
            q((top[0][k], bot[0][k], bot[0][k + 1], top[0][k + 1])); q((top[nv][k + 1], bot[nv][k + 1], bot[nv][k], top[nv][k]))
        for j in range(nv):
            q((top[j + 1][0], bot[j + 1][0], bot[j][0], top[j][0])); q((top[j][nu], bot[j][nu], bot[j + 1][nu], top[j + 1][nu]))
        spo = b.finish(f'spoiler{i + 1}_{side}', sharp_deg=30)
        def f_pt(s): l_, t_ = chord(s); c = t_ - l_; u = SP_U[0]; return Vector((sx * s, -(l_ + c * u), zc(s) + tc(s) * c * thk(u) + 0.004))
        p0, p1 = f_pt(s0), f_pt(s1); lp = (p0 + p1) / 2; ax = (p1 - p0).normalized() * (-sx)
        out.append(_child(ob, spo, lp, f'spoiler{i + 1}_{side}', ax, (0.0, 60.0), 'интерцептор: ось по передней кромке; плюс - задняя кромка вверх'))
    return out


def slot_cutters(step=2.5, smax=2.6):
    """Щель наплыва: корень консоли (s до smax), утолщённый на 1,5 см, во всех положениях от 15° до 67,5° с шагом step."""
    out = []
    ss = [s for s in span_stations() if s <= smax] + [smax]
    for sx in (1, -1):
        rings = _rings(sx, sorted(set(ss)), lambda s: section(sx, s, grow=0.015))
        n = int(round((g.SW_MAX - g.SW_MIN) / step))
        for i in range(n + 1):
            sw = g.SW_MIN + (g.SW_MAX - g.SW_MIN) * i / n
            M = Matrix.Translation(g.P3(g.PIV_A, sx * g.PIV_X, g.W_ZC)) @ Matrix.Rotation(math.radians(sw - g.SW_MIN) * (-sx), 4, 'Z')
            out.append(_obj('c_slot', [[M @ v for v in r] for r in rings], g.G_DARK, sharp=40))
    return out


def slot_cutter_smooth(smax=6.9, margin=0.030, nth=96):
    """Щель наплыва одним гладким телом: веер вокруг шарнира плюс диск у шарнира. На радиусе r и угле q высота щели - по тем точкам консоли,
    которые за ход 15°…67,5° проходят через этот угол (консоль поворачивается назад: точка с углом t бывает на углах t-K…t). У тонкой передней кромки
    щель тонкая и не прорезает нос наплыва."""
    NT = 720; TB = lambda t: int((t + math.pi) / (2 * math.pi) * NT) % NT
    zl_ = {}; zh_ = {}; th0_ = {}; th1_ = {}
    ss = [q for q in span_stations() if q <= smax + 0.5]
    rings = [section(1, q, grow=1e-4) for q in ss]               # вся хорда вместе с закрылком; точки как у сетки консоли: кольца и билинейно между ними (лофт)
    for r0_, r1_ in zip(rings, rings[1:]):
        for t in (0.0, 0.2, 0.4, 0.6, 0.8):
            for p0, p1, p2 in zip(r0_, r1_, r0_[1:] + r0_[:1]):
              for w in (0.0, 0.5):
                p = (p0 * (1 - w) + p2 * w) * (1 - t) + p1 * t; s_, d_, zz = p.x, -p.y, p.z; r = math.hypot(s_, d_); th = math.atan2(-d_, s_)
                k = int(r / 0.05); j = TB(th)
                zl_[(k, j)] = min(zl_.get((k, j), 9.0), zz); zh_[(k, j)] = max(zh_.get((k, j), -9.0), zz)
                th0_[k] = min(th0_.get(k, 9.0), th); th1_[k] = max(th1_.get(k, -9.0), th)
    ks_all = sorted(th0_)
    def span(k):
        nb = [j for j in range(k - 8, k + 9) if j in th0_]; return min(th0_[j] for j in nb) - K_SW, max(th1_[j] for j in nb)
    def zz(k, q):
        """Низ и верх щели на радиусе k и угле q: точки консоли с углом q…q+K (и соседние кольца, запас по углу 1°)."""
        lo, hi = 9.0, -9.0; j0 = TB(q - math.radians(6.0)); n = int((K_SW + math.radians(12.0)) / (2 * math.pi) * NT) + 1
        for kk in range(k - 3, k + 4):
            for dj in range(n):
                key = (kk, (j0 + dj) % NT)
                if key in zl_: lo = min(lo, zl_[key]); hi = max(hi, zh_[key])
        return lo, hi
    R0 = g.W_ROOT_R + margin + 0.04                              # у шарнира консоль - диск: вырез там - круглая плита
    ks = [k for k in ks_all if (k + 0.5) * 0.05 > R0 - 0.06]; out = []
    disc_k = [k for k in ks_all if (k + 0.5) * 0.05 <= R0 + 0.05]
    zl0 = min(v for (k, j), v in zl_.items() if k in disc_k) - margin; zh0 = max(v for (k, j), v in zh_.items() if k in disc_k) + margin
    prof = []
    for k in ks:
        th0, th1 = span(k); r = (k + 0.5) * 0.05; th0 -= 0.05 / max(r, 0.2); th1 += 0.05 / max(r, 0.2)          # концы веера - с запасом 5 см по дуге
        pts = []
        for q in range(nth):
            qa = th0 + (th1 - th0) * q / (nth - 1); lo, hi = zz(k, qa)
            if lo > hi: lo, hi = -0.02, 0.02                         # угол без консоли (край размаха): тонко
            pts.append((r * math.cos(qa), r * math.sin(qa), lo - margin, hi + margin))
        prof.append(pts)
    for sx in (1, -1):
        rs = []
        for pts in prof:
            rg = [(x, y, hi) for x, y, lo, hi in pts] + [(x, y, lo) for x, y, lo, hi in reversed(pts)]
            rs.append([g.P3(g.PIV_A, sx * g.PIV_X, g.W_ZC) + Vector((sx * x, y, z)) for x, y, z in rg])
        if sx < 0: rs = [r_[::-1] for r_ in rs]
        out.append(_obj('c_slot', rs, g.G_DARK, sharp=40))
        c0 = g.P3(g.PIV_A, sx * g.PIV_X, g.W_ZC); n = 72
        disc = [[c0 + Vector((R0 * math.cos(2 * math.pi * q / n), R0 * math.sin(2 * math.pi * q / n), z_)) for q in range(n)] for z_ in (zl0, zh0)]
        out.append(_obj('c_slot', disc, g.G_DARK, sharp=40))
    return out
