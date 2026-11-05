# uv_f35.py - развёртка F-35A без наложений и без зеркала L/R. После build.py в той же сессии.
# Обшивка и плоскости - плановые проекции в метрах: сверху и снизу нос влево, борта отдельно, левая и правая половины раздельно, чтобы по ним легко рисовать («Инферно»).
# Складки поверхности уходят в свой остров. Мелочь - смарт-проекция группами. Швы и чёрное нутро - одна маленькая заплатка в полосе справа. Раскладка - своя (БПФ-упаковка), с шагом 0,05 м.
import math, os, json, time
import numpy as np
import bpy
from mathutils import Vector

G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_STRAP, G_SCREEN, G_BELT, G_HANDLE, G_SEAM, G_PRIMER = range(12)
PLANAR = ('F35_skin', 'fin_', 'rudder_', 'stab_', 'flaperon_', 'slat_', 'door_', 'bay_')
GROUPS = [('cock', ('cockpit_int',), 0.85), ('mech', ('nozzle', 'det_fan', 'det_burner'), 0.62), ('canopy', ('canopy',), 0.9), ('gear', ('gear',), 0.85), ('bits', ('det_', 'eots'), 0.7)]
CELL = 0.05; PAD = 1                                            # клетка раскладки, м; запас вокруг острова в клетках (0,1 м ≈ 16 пикс при 4096)
ROOT_X = 2.00                                                   # разъём консоли: крылья - отдельные острова
BASES = {'top': (Vector((0, -1, 0)), Vector((1, 0, 0)), Vector((0, 0, 1))), 'bot': (Vector((0, -1, 0)), Vector((-1, 0, 0)), Vector((0, 0, -1))),
         'r': (Vector((0, 1, 0)), Vector((0, 0, 1)), Vector((1, 0, 0))), 'l': (Vector((0, -1, 0)), Vector((0, 0, 1)), Vector((-1, 0, 0))),
         'f': (Vector((-1, 0, 0)), Vector((0, 0, 1)), Vector((0, 1, 0))), 'b': (Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((0, -1, 0)))}


def starts(name, pref): return any(name == p or name.startswith(p) for p in pref)


def classify(n):
    if n.z >= 0.62: return 'top'
    if n.z <= -0.62: return 'bot'
    if abs(n.y) > abs(n.x) * 1.25: return 'f' if n.y > 0 else 'b'
    return 'r' if n.x > 0 else 'l'


def raster(tris, cell, depth=None):
    """tris - массив (N,3,2) в клетках; depth - (N,) или None. Возвращает занятость и глубину, начало - минимум. Заполняет по барицентрике."""
    mn = np.floor(tris.reshape(-1, 2).min(0)).astype(int); mx = np.ceil(tris.reshape(-1, 2).max(0)).astype(int); w, h = (mx - mn + 2)
    occ = np.zeros((h, w), bool); dep = np.full((h, w), -1e9, np.float32)
    for k, t in enumerate(tris):
        t0 = t - mn; x0, y0 = np.floor(t0.min(0)).astype(int); x1, y1 = np.ceil(t0.max(0)).astype(int)
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.0, np.arange(y0, y1 + 1) + 0.0)
        d = (t0[1, 1] - t0[2, 1]) * (t0[0, 0] - t0[2, 0]) + (t0[2, 0] - t0[1, 0]) * (t0[0, 1] - t0[2, 1])
        if abs(d) < 1e-9:
            ix = np.clip(np.round(t0).astype(int), 0, [w - 1, h - 1]); occ[ix[:, 1], ix[:, 0]] = True; continue
        a = ((t0[1, 1] - t0[2, 1]) * (xs - t0[2, 0]) + (t0[2, 0] - t0[1, 0]) * (ys - t0[2, 1])) / d
        b = ((t0[2, 1] - t0[0, 1]) * (xs - t0[2, 0]) + (t0[0, 0] - t0[2, 0]) * (ys - t0[2, 1])) / d
        ins = (a >= -0.35) & (b >= -0.35) & (a + b <= 1.35)
        yi, xi = ys[ins].astype(int), xs[ins].astype(int); occ[yi, xi] = True
        if depth is not None: dep[yi, xi] = np.maximum(dep[yi, xi], depth[k])
    for _ in range(0): pass
    return occ, dep, mn


def dilate(m, n):
    for _ in range(n):
        m = m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)
    return m


def run(sc, log=print):
    vl = bpy.context.view_layer; objs = [o for o in sc.objects if o.type == 'MESH']
    for o in vl.objects: o.select_set(False)
    for o in objs:
        while len(o.data.uv_layers): o.data.uv_layers.remove(o.data.uv_layers[0])
        o.data.uv_layers.new(name='UVMap'); o.data.calc_loop_triangles()
    charts = {}                 # ключ -> dict(xy=(obj, poly)->...), вес
    solid = []                  # (obj, poly, mat)
    planar = [o for o in objs if starts(o.name, PLANAR) and not o.name.startswith('speedbrake_') and not o.name.startswith('door_x')]
    glassy = [o for o in objs if all(o.data.materials[p.material_index].name == 'F35_glass' for p in o.data.polygons[:1])]
    # 1. плановые острова
    for o in planar:
        me = o.data; R = o.matrix_world.to_3x3(); M = o.matrix_world
        for p in me.polygons:
            m = p.material_index
            if m in (G_SEAM, G_DARK, G_GLASS): solid.append((o, p.index, m)); continue
            n = (R @ p.normal).normalized(); dr = classify(n); c = M @ p.center
            part = o.name
            if o.name == 'F35_skin' and dr in ('top', 'bot') and abs(c.x) > ROOT_X: part = 'wing_r' if c.x > 0 else 'wing_l'
            elif o.name == 'F35_skin' and dr in ('top', 'bot'): part = 'hull_r' if c.x > 0 else 'hull_l'
            elif o.name == 'F35_skin': part = 'body'
            w = 0.4 if m in (G_COCK, G_METAL, G_PRIMER) else 1.0
            key = (part, dr, 'pr' if m == G_PRIMER else 'in' if w < 1 else 'out')   # грунт отсеков отдельно: стенки стоят под бортом и наложились бы на него
            charts.setdefault(key, dict(w=w, dr=dr, faces=[]))['faces'].append((o, p.index))
    log('плановых островов', len(charts), 'заплаток', len(solid))
    # 2. складки: нижний слой - в свой остров
    def tri_arr(ch):
        U, V, N = BASES[ch['dr']]; pts = []; dep = []; own = []
        idx = {}
        for o, pi in ch['faces']: idx.setdefault(o.name, set()).add(pi)
        for nm, s in idx.items():
            o = bpy.data.objects[nm]; me = o.data; M = o.matrix_world
            for t in me.loop_triangles:
                if t.polygon_index in s:
                    P = [M @ me.vertices[v].co for v in t.vertices]; pts.append([[q.dot(U), q.dot(V)] for q in P]); dep.append(sum(q.dot(N) for q in P) / 3); own.append((nm, t.polygon_index))
        return np.array(pts, np.float64), np.array(dep, np.float32), own
    work = list(charts.items()); charts = {}; n_split = 0
    while work:
        key, ch = work.pop(); T, D, own = tri_arr(ch)
        if len(T) == 0: continue
        occ, dep, mn = raster(T / CELL, CELL, D)
        cen = T.mean(1) / CELL - mn; ci = np.clip(np.round(cen).astype(int), 0, [occ.shape[1] - 1, occ.shape[0] - 1])
        under = D < dep[ci[:, 1], ci[:, 0]] - 0.10
        if under.any() and not under.all():
            up = {own[i] for i in np.nonzero(~under)[0]}; dn = {own[i] for i in np.nonzero(under)[0]} - up
            if dn:
                n_split += 1
                ch2 = dict(w=ch['w'], dr=ch['dr'], faces=[(bpy.data.objects[a], b) for a, b in dn])
                ch['faces'] = [(o, pi) for o, pi in ch['faces'] if (o.name, pi) not in dn]
                work.append((key + ('u',), ch2)); work.append((key + ('t',), ch)); continue
        occ2, _, mn2 = raster(T * ch['w'] / CELL, CELL); charts[key] = ch; ch['occ'] = occ2; ch['mn'] = mn2
    log('складок отделено', n_split, 'всего островов', len(charts))
    # 3. мелочь - смарт-проекция, группа укладывается в квадрат
    rects = []
    used = set(o.name for o in planar) | set(o.name for o in glassy)
    for gname, pref, wt in GROUPS:
        gr = [o for o in objs if o.name not in used and starts(o.name, pref)]
        if not gr: continue
        used |= {o.name for o in gr}
        rects.append((gname, gr, wt))
    rest = [o for o in objs if o.name not in used]
    if rest: rects.append(('rest', rest, 0.8)); log('прочие объекты:', [o.name for o in rest])
    for gname, gr, wt in rects:
        for o in vl.objects: o.select_set(False)
        for o in gr: o.select_set(True)
        vl.objects.active = gr[0]
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.0008, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
        bpy.ops.uv.average_islands_scale()
        bpy.ops.uv.pack_islands(rotate=False, margin=0.003, margin_method='ADD', shape_method='CONCAVE')
        bpy.ops.object.mode_set(mode='OBJECT')
        A3 = 0.0; AU = 0.0
        for o in gr:
            me = o.data; uv = me.uv_layers.active.data; M3 = o.matrix_world.to_3x3()
            for t in me.loop_triangles:
                a = uv[t.loops[0]].uv; b = uv[t.loops[1]].uv; c = uv[t.loops[2]].uv
                AU += abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2; A3 += t.area
        fill = max(AU, 0.01); s = math.sqrt(A3 * wt * wt / fill); ncell = int(math.ceil(s / CELL)) + 1
        charts[('grp', gname)] = dict(rect=gr, s=s, w=1.0, occ=np.ones((ncell, ncell), bool), mn=np.zeros(2, int))
        log(f'группа {gname}: объектов {len(gr)}, площадь {A3:.1f} м², заполнение {fill:.2f}, сторона {s:.2f} м')
    # 4. раскладка БПФ: без отражений, повороты на 0, 90, 180, 270
    G = 720; occ = np.zeros((G, G), bool); order = sorted(charts.items(), key=lambda kv: -int(kv[1]['occ'].sum()))
    placed = []
    for key, ch in order:
        k = ch.get('w', 1.0); base = ch['occ']
        if k < 1.0:     # у нутра клетки реже: островок меньше
            pass
        best = None; Focc = np.fft.rfft2(dilate(occ, PAD).astype(np.float32))
        rots = (0, 2) if key[0] in ('hull_r', 'hull_l', 'body') else (0, 1, 2, 3)
        for r in rots:
            mask = np.rot90(base, r)
            h, w = mask.shape; pad = np.zeros((G, G), np.float32); pad[:h, :w] = mask
            ov = np.fft.irfft2(Focc * np.conj(np.fft.rfft2(pad)), s=(G, G))
            free = ov < 0.5
            free[G - h:, :] = False; free[:, G - w:] = False
            ys, xs = np.nonzero(free)
            if not len(ys): continue
            score = np.maximum(xs + w, ys + h) + 0.004 * (xs + ys)
            i = int(np.argmin(score))
            if best is None or score[i] < best[0]: best = (score[i], r, int(xs[i]), int(ys[i]), h, w)
        if best is None: raise RuntimeError('нет места для ' + str(key))
        _, r, x0, y0, h, w = best
        occ[y0:y0 + h, x0:x0 + w] |= np.rot90(base, r); placed.append((key, ch, r, x0, y0, h, w))
    N = max(max(x0 + w for _, _, _, x0, _, _, w in placed), max(y0 + h for _, _, _, _, y0, h, _ in placed)) * CELL
    log(f'сторона атласа {N:.2f} м, занято {occ.sum() * CELL * CELL / (N * N):.2f}')
    K = 0.985 / N                                                # полоса справа и сверху - заплатки
    # 5. запись UV
    def put(o, pi, fn):
        me = o.data; uv = me.uv_layers.active.data; M = o.matrix_world
        for li in me.polygons[pi].loop_indices:
            uv[li].uv = fn(M @ me.vertices[me.loops[li].vertex_index].co)
    layout = []
    for key, ch, r, x0, y0, h, w in placed:
        H0, W0 = ch['occ'].shape
        def rot(px, py):      # (px, py) - клетки исходной маски; np.rot90(m, r) вращает против часовой при индексах (y, x)
            if r == 0: return px, py
            if r == 1: return py, W0 - 1 - px
            if r == 2: return W0 - 1 - px, H0 - 1 - py
            return H0 - 1 - py, px
        if key[0] == 'grp':
            for o in ch['rect']:
                uv = o.data.uv_layers.active.data
                for d in uv:
                    px, py = d.uv.x * ch['s'] / CELL, d.uv.y * ch['s'] / CELL; qx, qy = rot(px, py); d.uv = ((qx + x0) * CELL * K, (qy + y0) * CELL * K)
        else:
            U, V, _N = BASES[ch['dr']]; mn = ch['mn']
            def fn(p, U=U, V=V, mn=mn, wk=ch['w']):
                px, py = p.dot(U) * wk / CELL - mn[0], p.dot(V) * wk / CELL - mn[1]; qx, qy = rot(px, py); return ((qx + x0) * CELL * K, (qy + y0) * CELL * K)
            for o, pi in ch['faces']: put(o, pi, fn)
        layout.append(dict(key='/'.join(map(str, key)), rot=r * 90, x=x0 * CELL, y=y0 * CELL, w=w * CELL, h=h * CELL))
    # 6. заплатки в полосе: швы, чёрное нутро, стекло; маленькая проекция, чтобы UV не вырождались
    PATCH = {G_SEAM: (0.9925, 0.20), G_DARK: (0.9925, 0.40), G_GLASS: (0.9925, 0.60)}
    def fnp(m):
        c = PATCH[m]
        return lambda p: (c[0] + ((p.x + 0.3 * p.y) * 0.13 % 1) * 0.005 - 0.0025, c[1] + ((p.z + 0.3 * p.y) * 0.13 % 1) * 0.005 - 0.0025)
    for o, pi, m in solid: put(o, pi, fnp(m))
    for o in glassy:
        for p in o.data.polygons: put(o, p.index, fnp(G_GLASS))
    return dict(atlas_m=N, K=K, layout=layout)


def save(sc, path):
    d = {}
    for o in sc.objects:
        if o.type != 'MESH' or not o.data.uv_layers: continue
        a = np.zeros(len(o.data.loops) * 2, np.float32); o.data.uv_layers.active.data.foreach_get('uv', a); d[o.name] = a
    np.savez_compressed(path, **d)


def load(sc, path):
    d = np.load(path)
    for o in sc.objects:
        if o.type != 'MESH' or o.name not in d: continue
        while len(o.data.uv_layers): o.data.uv_layers.remove(o.data.uv_layers[0])
        o.data.uv_layers.new(name='UVMap'); o.data.uv_layers.active.data.foreach_set('uv', d[o.name])
