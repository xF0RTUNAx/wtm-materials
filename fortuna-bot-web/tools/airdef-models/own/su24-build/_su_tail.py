

# ── киль с гребнем, руль, два подфюзеляжных гребня, стабилизатор цельноповоротный ──
FZ0, FZ1 = 1.00, 3.92
def FLE(z): return 18.10 + (z - 1.66) * 1.571
def FTE(z): return 21.30 + (z - 1.00) * 0.452
RUD = (1.30, 3.70); RUD_C = 0.85
def FTC(z): return 0.055 - 0.015 * (z - FZ0) / (FZ1 - FZ0)
def fin():
    zs = sorted(set(stations(FZ0, FZ1 - 0.06, 0.16) + [RUD[0] - 0.003, RUD[0], RUD[1], RUD[1] + 0.003] + [RUD[0] + (RUD[1] - RUD[0]) * i / 10 for i in range(1, 10)] + [FZ1 - 0.03, FZ1]))
    rings = []
    for z in zs:
        le, te = FLE(z), FTE(z); c = te - le; tc = FTC(z)
        if RUD[0] - 1e-6 <= z <= RUD[1] + 1e-6: ue, tail = cove_cut(le, c, tc, te - RUD_C, 0.006)
        else: ue, tail = 1.0, cove_wall(le, c, tc, 1.0)
        rings.append(foil_ring(le, c, tc, 0.0006, ue, 26, lambda a, h, z=z: P3(a, h, z), tail=tail, head=cove_wall_f(le, c, tc, 0.0006)))
    return loft_obj('fin_c', rings, sharp=50)
def dorsal():
    """Гребень перед килём: от спины (a 16,3) к передней кромке киля (03)."""
    rs = []
    for z, a0 in ((0.95, 15.80), (1.10, 16.30), (1.30, 16.95), (1.50, 17.55), (1.66, 18.05)):
        a1 = FTE(1.0) - 0.4; c = a1 - a0; rs.append(foil_ring(a0, c, 0.14 / c, 0.0006, 1.0, 18, lambda a, h, z=z: P3(a, h, z), tail=cove_wall(a0, c, 0.14 / c, 1.0), head=cove_wall_f(a0, c, 0.14 / c, 0.0006)))
    return loft_obj('s_dors', rs, sharp=50)
def rudder():
    z0, z1 = RUD[0] + 0.006, RUD[1] - 0.006; pv0 = P3(FTE(z0) - RUD_C, 0.0, z0); pv1 = P3(FTE(z1) - RUD_C, 0.0, z1); pivot = (pv0 + pv1) / 2; axis = (pv1 - pv0).normalized()
    rings = []
    for j in range(11):
        z = z0 + (z1 - z0) * j / 10; le, te = FLE(z), FTE(z); c = te - le; ah = te - RUD_C
        rings.append([v - pivot for v in foil_ring(le, c, FTC(z), (ah - le) / c, 1.0, 10, lambda a, h, z=z: P3(a, h, z), head=cove_nose(le, c, FTC(z), ah))])
    ob = loft_obj('rudder', rings, sharp=48); ob.location = pivot
    PARTS['rudder'] = dict(pivot=pivot.copy(), axis=axis.copy(), range=(-25.0, 25.0), note='руль направления: ось в центре круглого носа')
    return ob
VF = dict(a0=17.30, a1=20.60, zb=-1.20, x=0.90, cant=15.0)            # подфюзеляжные гребни: передняя кромка у корня, задняя, низ, от оси, развал наружу
def vfins():
    out = []
    for sx in (1, -1):
        rs = []; ca = math.radians(VF['cant'])
        for z in (-0.40, -0.47, -0.70, -0.95, VF['zb']):
            t = (-0.47 - z) / (-0.47 - VF['zb']) if z < -0.47 else 0.0; le = VF['a0'] + 1.10 * t ** 0.8; te = VF['a1'] - 0.10 * t; c = te - le
            xo = VF['x'] + (-0.47 - z) * math.tan(ca)
            r = foil_ring(le, c, 0.05, 0.0006, 1.0, 18, lambda a, h, z=z, xo=xo: P3(a, sx * (xo + h), z), tail=cove_wall(le, c, 0.05, 1.0), head=cove_wall_f(le, c, 0.05, 0.0006))
            rs.append(r if sx > 0 else r[::-1])
        out.append(loft_obj('vfin_' + ('r' if sx > 0 else 'l'), rs, sharp=50))
    return out
STZ = 0.62; ST_PIV = 19.40
def SLE(x): return 15.95 + (x - 1.35) * 1.618
def STE(x): return 21.00 + (x - 1.35) * 0.040
ST_TIP = 4.10
def stab(sx):
    rs = []
    for x in stations(1.28, ST_TIP - 0.10, 0.20) + [ST_TIP - 0.05, ST_TIP]:
        le, te = SLE(x), STE(x); c = te - le; k = max(0.0, (x - (ST_TIP - 0.10)) / 0.10); f = math.sqrt(max(0.0, 1 - k * k)) * 0.97 + 0.03
        r = foil_ring(le, c, 0.045, 0.0006, 1.0, 22, lambda a, h, x=x: P3(a, sx * x, STZ + h * f), tail=cove_wall(le, c, 0.045, 1.0), head=cove_wall_f(le, c, 0.045, 0.0006))
        rs.append(r if sx > 0 else r[::-1])
    nm = 'stab_' + ('r' if sx > 0 else 'l'); ob = loft_obj(nm, rs, sharp=50); piv = P3(ST_PIV, sx * 1.10, STZ); _rel(ob, piv)
    PARTS[nm] = dict(pivot=piv.copy(), axis=Vector((-1, 0, 0)), range=(-15.0, 15.0), note='половина цельноповоротного стабилизатора: ось поперёк; плюс - передняя кромка вниз; половины ходят вместе (тангаж) и врозь (крен)')
    return ob


# ── два регулируемых сопла, контейнер тормозного парашюта над ними ──
NOZ_R = 0.48; NOZ_X = 0.53; NOZ_Z = 0.08; A_NOZ = 21.60
def nozzle(sx):
    b = B(); n = 56; a0 = A_NOZ
    pr = [(-0.10, NOZ_R + 0.005), (0.05, NOZ_R), (0.25, NOZ_R - 0.05), (0.28, NOZ_R - 0.07), (0.15, NOZ_R - 0.09), (-0.40, NOZ_R - 0.12)]
    rings = [[P3(a0 + da, sx * NOZ_X + (r + 0.008 * (q % 4 == 0)) * math.sin(2 * math.pi * q / n), NOZ_Z + (r + 0.008 * (q % 4 == 0)) * math.cos(2 * math.pi * q / n)) for q in range(n)] for da, r in pr]
    b.loft(rings, [G_METAL, G_METAL, G_METAL, G_DARK, G_DARK], cap1=G_DARK)
    nm = 'nozzle_' + ('r' if sx > 0 else 'l'); ob = b.finish(nm, sharp_deg=30); piv = P3(a0, sx * NOZ_X, NOZ_Z); _rel(ob, piv)
    PARTS[nm] = dict(pivot=piv.copy(), axis=Vector((0, -1, 0)), range=(0.85, 1.0), kind='scale', note='регулируемое сопло: масштаб створок поперёк оси (0,85 - бесфорсажный, 1,0 - форсаж); центр - срез сопла')
    return ob
def nozzle_cut(sx):
    n = 48; b = B(); a0 = A_NOZ
    rings = [[P3(a0 + da, sx * NOZ_X + r * math.sin(2 * math.pi * q / n), NOZ_Z + r * math.cos(2 * math.pi * q / n)) for q in range(n)] for da, r in ((0.2, NOZ_R - 0.10), (-0.6, NOZ_R - 0.10), (-0.65, 0.05))]
    b.loft(rings, G_DARK, cap0=G_DARK, cap1=G_DARK); return b.finish('c_noz', sharp_deg=30)
def chute_box():
    """Контейнер тормозного парашюта в основании руля над соплами (03): цилиндр с острым концом; крышка - отдельная часть."""
    b = B(); n = 24; zc = 0.92
    pr = [(20.60, 0.05), (20.80, 0.15), (21.10, 0.18), (21.95, 0.17), (22.02, 0.16)]
    b.loft([[P3(a, r * math.sin(2 * math.pi * q / n), zc + r * math.cos(2 * math.pi * q / n)) for q in range(n)] for a, r in pr], G_SKIN, cap0=G_SKIN, cap1=G_DARK)
    box = b.finish('det_chute', sharp_deg=40)
    c = B(); c.loft([[P3(a, r * math.sin(2 * math.pi * q / n), zc + r * math.cos(2 * math.pi * q / n)) for q in range(n)] for a, r in ((22.03, 0.16), (22.20, 0.12), (22.32, 0.03))], G_SKIN, cap0=G_SKIN, cap1=G_SKIN)
    cap = c.finish('chute_cap', sharp_deg=40); piv = P3(22.03, 0.0, zc + 0.16); _rel(cap, piv)
    PARTS['chute_cap'] = dict(pivot=piv.copy(), axis=Vector((-1, 0, 0)), range=(0.0, 100.0), note='крышка контейнера парашюта: шарнир сверху; плюс - откидывается вверх')
    return [box, cap]


# ── фонарь: козырёк неподвижен, две створки (лётчик и штурман) на задних шарнирах вверх (03, 05, 07) ──
CAN_A0, CAN_W, CAN_A1 = 5.30, 6.40, 7.95
CAN = Track([(5.30, 0.98), (5.80, 1.26), (6.40, 1.47), (7.00, 1.53), (7.60, 1.50), (7.95, 1.42)])
CAN_HW = Track([(5.30, 0.64), (6.40, 0.75), (7.00, 0.77), (7.95, 0.73)])
def can_ring(a, n=24, inset=0.0, sink=0.06, t0=0.0, t1=math.pi):
    top = CAN(a) - inset; hw = CAN_HW(a) - inset; base = fus_top(a, hw) - sink; pts = []
    for k in range(n + 1):
        th = t0 + (t1 - t0) * k / n; pts.append(P3(a, hw * math.cos(th), base + (top - base) * abs(math.sin(th)) ** 0.9))
    return pts
def canopy_shell(a0, a1, name, mat, th=0.010, sink=0.06, t0=0.0, t1=math.pi, step=0.06):
    rs = []
    for a in stations(a0, a1, step):
        o = can_ring(a, sink=sink, t0=t0, t1=t1); i_ = can_ring(a, inset=th, sink=sink, t0=t0, t1=t1); rs.append(o + i_[::-1])
    return loft_obj(name, rs, mat, sharp=60)
def hatches():
    """Две створки: правая (лётчик) и левая (штурман), каждая на своём заднем шарнире, открываются вверх. Стекло, рама - в деталях."""
    out = []
    for sx, t0, t1 in ((1, 0.0, math.pi / 2 - 0.006), (-1, math.pi / 2 + 0.006, math.pi)):
        nm = 'canopy_' + ('r' if sx > 0 else 'l'); ob = canopy_shell(CAN_W + 0.034, CAN_A1, nm, G_GLASS, sink=0.004, t0=t0, t1=t1, step=0.05)
        piv = P3(CAN_A1 + 0.02, sx * 0.40, CAN(CAN_A1) + 0.02); _rel(ob, piv)
        PARTS[nm] = dict(pivot=piv.copy(), axis=Vector((1, 0, 0)), range=(0.0, 60.0), note='створка фонаря: задний шарнир поперёк; плюс - передний край вверх; рама canopy_frame_* - дочерняя')
        out.append(ob)
    return out
def canopy_fairing():
    a0, a1 = CAN_A1 + 0.025, 11.5; rs = []
    for a in stations(a0, a1, 0.12):
        t = _sm((a - a0) / (a1 - a0)); top = CAN(CAN_A1) * (1 - t) + (fus_top(a1) + 0.002) * t; hw = CAN_HW(CAN_A1) * (1 - t) + 0.30 * t
        base = fus_top(a, hw) - 0.08; n = 24; pts = [P3(a, hw * math.cos(math.pi * k / n), base + (top - base) * abs(math.sin(math.pi * k / n)) ** 0.9) for k in range(n + 1)]
        pts.append(P3(a, 0.0, base - 0.10)); rs.append(pts)
    return loft_obj('s_cfair', rs, sharp=50)


def build_skin():
    S = [fuselage(), intake(1), intake(-1), glove(1), glove(-1), dorsal(), canopy_fairing()]
    host = S[0]
    for o in S[1:]: _apply_bool(host, o, 'UNION'); _drop(o)
    for sx in (1, -1):
        c = intake_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
        c = nozzle_cut(sx); _apply_bool(host, c, 'DIFFERENCE'); _drop(c)
    host.name = 'SU_skin'; host.data.name = 'SU_skin'
    return host


def pose_wing(ob, deg, sx):
    """Повернуть консоль (с детьми) на deg от положения 16° (плюс - конец назад)."""
    D = PARTS[ob.name]; T = D['pivot']; ob.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, D['axis']) @ Matrix.Translation(-T) @ ob.matrix_world


def plane(stage=9, sweep=None):
    """Этапы: 1 - обшивка, наплыв, киль, стабилизатор, фонарь; 2 - консоли с механизацией, рули; 3 - кабина, детали, подвеска; 4 - шасси. sweep - поворот консолей от 16° (по умолчанию как в файле, 53°)."""
    PARTS.clear(); STATIONS.clear()
    skin = build_skin(); ref_me = skin.data.copy()
    out = [skin, fin(), pitot(), splitter(1), splitter(-1), stab(1), stab(-1), nozzle(1), nozzle(-1)] + vfins() + chute_box()
    out.append(canopy_shell(CAN_A0, CAN_W, 'canopy_glass', G_GLASS))
    cans = hatches(); out += cans
    vl = bpy.context.view_layer; WG = {}
    if stage >= 2:
        out.append(rudder())
        for sx in (1, -1):
            w_ = wing_panel(sx); WG[sx] = w_; out.append(w_)
            c = slot_cutter(sx, w_); _apply_bool(skin, c, 'DIFFERENCE'); _drop(c)
            kids = [flap(sx, 0), flap(sx, 1), slat(sx)] + spoilers(sx)
            vl.update()
            for k_ in kids: mw = k_.matrix_world.copy(); k_.parent = w_; k_.matrix_world = mw
            out += kids
        dl = D_FILE if sweep is None else sweep
        vl.update()
        for sx in (1, -1): pose_wing(WG[sx], dl, sx)
        vl.update()
    if stage >= 3:
        import su_det as dt
        bvh_ready(skin); out += dt.all_details(skin, cans)
    if stage >= 4:
        import su_gear as gr; out += gr.gear_all()
    resharp(skin); print('нормали обшивки:', smooth_normals(skin, ref_me)); bpy.data.meshes.remove(ref_me)
    return out
