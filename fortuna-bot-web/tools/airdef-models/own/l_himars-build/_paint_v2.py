# _paint.py — процедурная окраска HIMARS (взята у пусковой PAC-3, Свои/PAC-3_пусковая/_paint.py): машина и клетка однотонно-зелёные (фото 03, 04, 05, 08),
# вариант Б — трёхцветный камуфляж НАТО (фото 09). Крышки труб светло-песочные (фото 06), трубы внутри тёмные.
# Грязь и потёки — по высоте над землёй в мире (поднятый пакет не пачкается «снизу» по своим осям).
# Без развёртки и запекания: шейдер считает цвет прямо при рендере Cycles на видеокарте (координаты объекта). Тот же шейдер потом запекается в атлас для финала.
# Использование: после build.py — apply_paint(VARIANTS['…'], wear) ; wear: 0 — чистая, 1 — средняя, 2 — сильная.
import bpy, math, os

LID = [(0.42, 0.34, 0.20)]                                           # крышки труб (фото 06)
VARIANTS = {
    'олива': dict(title='А. Однотонная зелёная (фото 03, 04, 05, 08)', body=[(0.105, 0.135, 0.074)], cont=LID, camo=None),
    'камуфляж': dict(title='Б. Трёхцветный камуфляж НАТО (фото 09): зелёный, коричневый, чёрный', body=[(0.10, 0.125, 0.065), (0.13, 0.085, 0.045), (0.022, 0.022, 0.018)],
                     cont=LID, camo=dict(scale=1.6, weights=(0.46, 0.30, 0.24))),
}
DIRT = (0.115, 0.085, 0.055)          # пыль и грязь (суглинок)
GRIME = (0.018, 0.016, 0.012)         # копоть в углах


class G:
    """Мини-построитель узлов: n(тип, **входы) — узел, входы-числа/цвета ставятся значениями, входы-сокеты — связями."""
    def __init__(s, mat):
        s.m = mat; mat.use_nodes = True; s.t = mat.node_tree
        for x in list(s.t.nodes): s.t.nodes.remove(x)
        s.x = 0
    def n(s, typ, **kw):
        nd = s.t.nodes.new(typ); nd.location = (s.x, 0); s.x += 180
        for k, v in kw.items():
            if k.startswith('_'): setattr(nd, k[1:], v); continue
            sock = next((i for i in nd.inputs if i.identifier == k), None) or nd.inputs[k]
            if isinstance(v, bpy.types.NodeSocket): s.t.links.new(v, sock)
            elif isinstance(v, (tuple, list)) and len(v) == 3 and sock.type == 'RGBA': sock.default_value = (*v, 1.0)
            else: sock.default_value = v
        return nd
    def mix(s, a, b, f):
        return s.n('ShaderNodeMix', _data_type='RGBA', Factor_Float=f, A_Color=a, B_Color=b).outputs[2]
    def math(s, op, a, b=0.0, clamp=False):
        return s.n('ShaderNodeMath', _operation=op, _use_clamp=clamp, **{'Value': a, 'Value_001': b}).outputs[0]
    def ramp(s, f, stops, const=False):
        nd = s.n('ShaderNodeValToRGB', Fac=f); r = nd.color_ramp; r.interpolation = 'CONSTANT' if const else 'LINEAR'
        while len(r.elements) < len(stops): r.elements.new(0.5)
        for e, (p, c) in zip(r.elements, stops): e.position = p; e.color = (*c, 1.0) if len(c) == 3 else c
        return nd.outputs['Color']
    def smooth(s, f, a, b):
        return s.n('ShaderNodeMapRange', _interpolation_type='SMOOTHSTEP', **{'Value': f, 'From Min': a, 'From Max': b}).outputs['Result']


def glass_tree(mat, wear):
    """Стекло (Mark 2026-10-28: «стёкла реалистичнее, не пластиковые»): почти чёрное, глянцевое (отражает небо и окружение), за ним угадывается тёмный салон
    (ниже — чуть светлее: спинки сидений, приборная доска); пыль — у нижней кромки и пятнами, потёки от дождя, в пыли выше шероховатость; лёгкий зелёный оттенок."""
    g = G(mat)
    tc = g.n('ShaderNodeTexCoord').outputs['Object']; z = g.n('ShaderNodeSeparateXYZ', Vector=tc).outputs['Z']
    w = [0.0, 0.55, 1.0][wear]
    n1 = g.n('ShaderNodeTexNoise', Vector=tc, Scale=6.0, Detail=4.0).outputs['Fac']
    inside = g.ramp(g.math('ADD', g.math('MULTIPLY', g.smooth(z, 2.35, 1.85), 0.6), g.math('MULTIPLY', n1, 0.4)),
                    [(0.0, (0.006, 0.007, 0.007)), (0.55, (0.012, 0.014, 0.013)), (1.0, (0.035, 0.034, 0.03))])
    tint = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor_Float=1.0, A_Color=inside, B_Color=(0.85, 1.0, 0.92)).outputs[2]
    dn = g.n('ShaderNodeTexNoise', Vector=tc, Scale=3.5, Detail=8.0, Roughness=0.65).outputs['Fac']
    mp = g.n('ShaderNodeMapping', Vector=tc, Scale=(18.0, 18.0, 0.8))
    st = g.n('ShaderNodeTexNoise', Vector=mp.outputs['Vector'], Scale=2.0, Detail=5.0).outputs['Fac']
    edge_low = g.smooth(g.math('ADD', g.math('MULTIPLY', g.math('SUBTRACT', 2.0, z), 0.5), g.math('MULTIPLY', dn, 0.5)), 0.55, 0.95)   # пыль снизу стекла и пятнами
    dust = g.math('MULTIPLY', g.math('ADD', g.math('MULTIPLY', edge_low, 0.8), g.math('MULTIPLY', g.smooth(st, 0.6, 0.75), 0.4), clamp=True), 0.15 + 0.6 * w)
    col = g.mix(tint, (0.16, 0.14, 0.11), g.math('MULTIPLY', dust, 0.55))
    rough = g.math('ADD', 0.03, g.math('MULTIPLY', dust, 0.55), clamp=True)
    pn = g.n('ShaderNodeTexNoise', Vector=tc, Scale=40.0, Detail=2.0).outputs['Fac']                              # лёгкая волна стекла
    bump = g.n('ShaderNodeBump', Strength=0.02, Distance=0.001, Height=pn)
    bs = g.n('ShaderNodeBsdfPrincipled', **{'Base Color': col, 'Roughness': rough, 'Normal': bump.outputs['Normal'], 'IOR': 1.52, 'Specular IOR Level': 0.6,
                                            'Coat Weight': 0.35, 'Coat Roughness': 0.02})
    g.n('ShaderNodeOutputMaterial', Surface=bs.outputs['BSDF'])
    return mat


def lens_tree(mat, wear):
    """Фара и зеркало: прозрачное стекло перед серебристым отражателем — светлое, почти зеркальное, с лёгкой пылью."""
    g = G(mat); tc = g.n('ShaderNodeTexCoord').outputs['Object']
    dn = g.n('ShaderNodeTexNoise', Vector=tc, Scale=30.0, Detail=6.0).outputs['Fac']
    dust = g.math('MULTIPLY', g.smooth(dn, 0.5, 0.8), 0.15 + 0.4 * [0, 0.55, 1.0][wear])
    col = g.mix((0.70, 0.72, 0.72), (0.25, 0.22, 0.17), dust)
    bs = g.n('ShaderNodeBsdfPrincipled', **{'Base Color': col, 'Metallic': 0.85, 'Roughness': g.math('ADD', 0.05, g.math('MULTIPLY', dust, 0.6)), 'Coat Weight': 1.0, 'Coat Roughness': 0.02})
    g.n('ShaderNodeOutputMaterial', Surface=bs.outputs['BSDF'])


IDS = {'body_cab': 1, 'pod': 2, 'body_frame': 3, 'body_equip': 4, 'body_base': 5, 'turn': 6, 'boom': 10, 'hatch': 11}
DUST = (0.30, 0.26, 0.19)             # светлая пыль (сухой суглинок)
MUD = (0.085, 0.066, 0.045)           # грязь снизу
PRIMER = (0.10, 0.10, 0.075)          # грунт под краской
_DJ = []


def dec_rows():
    if not _DJ:
        import json
        hd = HD if 'HD' in globals() else (H_ if 'H_' in globals() else HERE)
        _DJ.append(json.load(open(os.path.join(hd, 'him_decals.json'))))
        _DJ.append(bpy.data.images.load(os.path.join(hd, 'him_decals.png'), check_existing=True))
    return _DJ


S_ = SCALE_FIX
# трафареты и наклейки (вымышленные): (номера объектов, грань, координата плоскости, центр u, центр v, высота букв, строка, цвет); всё в метрах сборки (до масштаба)
DECALS = [((1,), 'y+', 3.672, 0.62, 1.90, 0.075, 0, (0.025, 0.025, 0.022)), ((1,), 'y+', 3.672, -0.74, 1.90, 0.075, 1, (0.025, 0.025, 0.022)),
          ((3,), 'y+', YF, 0.0, 0.84, 0.045, 6, (0.60, 0.60, 0.56))]
for sd in (1, -1):
    DECALS += [((2,), 'x+' if sd > 0 else 'x-', sd * 0.888, -2.40, 2.30, 0.050, 2, (0.03, 0.03, 0.025)), ((2,), 'x+' if sd > 0 else 'x-', sd * 0.888, -2.40, 2.22, 0.040, 3, (0.03, 0.03, 0.025)),
               ((2,), 'x+' if sd > 0 else 'x-', sd * 0.888, -0.65, 2.36, 0.040, 7, (0.03, 0.03, 0.025))]
DECALS += [((4,), 'x-', -1.142, 0.40, 0.93, 0.065, 4, (0.03, 0.03, 0.025)), ((4,), 'x+', 1.128, 1.36, 1.80, 0.032, 5, (0.02, 0.02, 0.015))]
LABELS = [((4,), 'x+', 1.128, 1.36, 1.80, 0.16, 0.06, (0.62, 0.46, 0.04)), ((2,), 'x+', 0.888, 0.55, 1.75, 0.10, 0.07, (0.62, 0.46, 0.04)), ((2,), 'x-', -0.888, 0.55, 1.75, 0.10, 0.07, (0.62, 0.46, 0.04)),
          ((1,), 'x-', -1.172, 3.05, 2.01, 0.12, 0.06, (0.62, 0.62, 0.58)), ((1,), 'x+', 1.172, 3.05, 2.01, 0.12, 0.06, (0.62, 0.62, 0.58))]


def plane_uv(g, P, N, ids, ax, pc, uc, vc, w, h, ID):
    """плоская проекция на грань ax (x+/x-/y+/y-) у координаты pc: u - вправо для смотрящего на грань, v - вверх; маска - номер объекта, близость плоскости и нормаль"""
    X, Y, Z = P.outputs['X'], P.outputs['Y'], P.outputs['Z']; s = S_
    if ax[0] == 'x': a, uu, nn = X, (Y if ax[1] == '+' else g.math('MULTIPLY', Y, -1.0)), N.outputs['X']; u0 = (uc if ax[1] == '+' else -uc) * s
    else: a, uu, nn = Y, (g.math('MULTIPLY', X, -1.0) if ax[1] == '+' else X), N.outputs['Y']; u0 = (-uc if ax[1] == '+' else uc) * s
    u = g.math('MULTIPLY', g.math('SUBTRACT', uu, u0 - w * s / 2), 1.0 / (w * s)); v = g.math('MULTIPLY', g.math('SUBTRACT', Z, (vc - h / 2) * s), 1.0 / (h * s))
    inside = g.math('MULTIPLY', g.math('MULTIPLY', g.math('GREATER_THAN', u, 0.0), g.math('LESS_THAN', u, 1.0)), g.math('MULTIPLY', g.math('GREATER_THAN', v, 0.0), g.math('LESS_THAN', v, 1.0)))
    near = g.math('LESS_THAN', g.math('ABSOLUTE', g.math('SUBTRACT', a, pc * s)), 0.05)
    face = g.math('GREATER_THAN', g.math('MULTIPLY', nn, 1.0 if ax[1] == '+' else -1.0), 0.7)
    idm = None
    for k in ids:
        e = g.n('ShaderNodeMath', _operation='COMPARE', Value=ID, Value_001=float(k), Value_002=0.1).outputs[0]; idm = e if idm is None else g.math('MAXIMUM', idm, e)
    return u, v, g.math('MULTIPLY', g.math('MULTIPLY', inside, near), g.math('MULTIPLY', face, idm))


def add_decals(g, col, P, N, ID, wearn):
    js, img = dec_rows(); nr = len(js['rows'])
    for ids, ax, pc, uc, vc, w, h, c in LABELS:                                  # наклейки-прямоугольники с тёмной рамкой
        u, v, m = plane_uv(g, P, N, ids, ax, pc, uc, vc, w, h, ID)
        col = g.mix(col, (0.03, 0.03, 0.025), g.math('MULTIPLY', m, 0.9))
        u2, v2, m2 = plane_uv(g, P, N, ids, ax, pc, uc, vc, w - 0.01, h - 0.01, ID)
        col = g.mix(col, c, g.math('MULTIPLY', m2, 0.95))
    for ids, ax, pc, uc, vc, ht, row, c in DECALS:
        tw = js['w'][row]; w = ht * tw * 1024 / 100; h = ht * 1.28
        u, v, m = plane_uv(g, P, N, ids, ax, pc, uc, vc, w, h, ID)
        cv = g.n('ShaderNodeCombineXYZ', X=g.math('MULTIPLY', u, tw), Y=g.math('MULTIPLY', g.math('ADD', v, nr - 1 - row), 1.0 / nr), Z=0.0).outputs['Vector']
        ti = g.n('ShaderNodeTexImage', Vector=cv); ti.image = img; ti.extension = 'CLIP'; ti.interpolation = 'Cubic'
        a = g.math('MULTIPLY', g.math('MULTIPLY', ti.outputs['Alpha'], m), g.math('SUBTRACT', 1.0, g.math('MULTIPLY', wearn, 0.6)))
        col = g.mix(col, c, g.math('MULTIPLY', a, 0.92))
    # светоотражающая полоса на заднем бампере: красно-белая наискось (Y_REAR - 0,13)
    X, Y, Z = P.outputs['X'], P.outputs['Y'], P.outputs['Z']
    band = g.math('MULTIPLY', g.math('MULTIPLY', g.math('GREATER_THAN', Z, 0.80 * S_), g.math('LESS_THAN', Z, 0.88 * S_)), g.math('LESS_THAN', g.math('ABSOLUTE', g.math('SUBTRACT', Y, (Y_REAR - 0.13) * S_)), 0.03))
    band = g.math('MULTIPLY', band, g.math('MULTIPLY', g.math('LESS_THAN', N.outputs['Y'], -0.7), g.n('ShaderNodeMath', _operation='COMPARE', Value=ID, Value_001=4.0, Value_002=0.1).outputs[0]))
    band = g.math('MULTIPLY', band, g.math('LESS_THAN', g.math('ABSOLUTE', X), 0.62 * S_))
    strp = g.math('GREATER_THAN', g.math('FRACT', g.math('MULTIPLY', g.math('ADD', X, Z), 6.0)), 0.5)
    col = g.mix(col, g.mix((0.40, 0.03, 0.02), (0.62, 0.62, 0.60), strp), g.math('MULTIPLY', band, 0.95))
    return col


def paint_tree(mat, kind, var, wear, seed=0.0):
    """kind: body / cont / steel / rubber / dark / keep. Слои: оттенок по деталям, пятна и выгорание, пыль в щелях, потёки, сколы и царапины, грязь и брызги, пыль сверху; трафареты."""
    keep_col = tuple(mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value[:3]) if mat.node_tree and 'Principled BSDF' in mat.node_tree.nodes else (0.1, 0.1, 0.1)
    keep_r = mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value if mat.node_tree and 'Principled BSDF' in mat.node_tree.nodes else 0.5
    g = G(mat)
    tc = g.n('ShaderNodeTexCoord').outputs['Object']; geo = g.n('ShaderNodeNewGeometry')
    P = g.n('ShaderNodeSeparateXYZ', Vector=geo.outputs['Position']); N = g.n('ShaderNodeSeparateXYZ', Vector=geo.outputs['Normal'])
    pos = geo.outputs['Position']; z = P.outputs['Z']; nz = N.outputs['Z']
    ID = g.n('ShaderNodeAttribute', _attribute_type='OBJECT', _attribute_name='him_id').outputs['Fac']
    isl = geo.outputs['Random Per Island']
    w = [0.0, 0.55, 1.0][wear]; paint = kind in ('body', 'cont')
    # ── базовый цвет
    if paint:
        cols = var['cont'] if kind == 'cont' else var['body']
        if kind == 'body' and var.get('camo') and len(cols) > 1:
            dn = g.n('ShaderNodeTexNoise', Vector=pos, Scale=1.4, Detail=3.0, W=seed)
            dv = g.n('ShaderNodeVectorMath', _operation='MULTIPLY_ADD', Vector=dn.outputs['Color'], Vector_001=(0.55, 0.55, 0.55), Vector_002=pos)
            vo = g.n('ShaderNodeTexVoronoi', Vector=dv.outputs['Vector'], Scale=var['camo']['scale'], Randomness=1.0)
            acc, stops = 0.0, []
            for c, wt in zip(cols, var['camo']['weights']): stops.append((acc, c)); acc += wt
            col = g.ramp(g.n('ShaderNodeRGBToBW', Color=vo.outputs['Color']).outputs['Val'], stops, const=True)
        else:
            col = g.n('ShaderNodeRGB').outputs[0]; col.node.outputs[0].default_value = (*cols[0], 1.0)
        rough = 0.66 if kind == 'body' else 0.62
    elif kind == 'steel': col = g.n('ShaderNodeRGB').outputs[0]; col.node.outputs[0].default_value = (0.12, 0.12, 0.115, 1.0); rough = 0.42
    elif kind == 'rubber': col = g.n('ShaderNodeRGB').outputs[0]; col.node.outputs[0].default_value = (0.022, 0.022, 0.021, 1.0); rough = 0.92
    else: col = g.n('ShaderNodeRGB').outputs[0]; col.node.outputs[0].default_value = (*keep_col, 1.0); rough = keep_r
    if paint:
        # 1. оттенок по деталям (партии краски, подкраска отдельных панелей)
        col = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor_Float=1.0, A_Color=col, B_Color=g.ramp(isl, [(0.0, (0.84, 0.88, 0.86)), (0.5, (1.0, 1.0, 1.0)), (1.0, (1.12, 1.08, 0.98))])).outputs[2]
        # 2. крупные пятна (выгорание, подкраска) и мелкая неровность
        m1 = g.n('ShaderNodeTexNoise', Vector=pos, Scale=0.45, Detail=3.0, W=seed + 3.0).outputs['Fac']
        m2 = g.n('ShaderNodeTexNoise', Vector=pos, Scale=4.0, Detail=6.0, Roughness=0.6, W=seed + 4.0).outputs['Fac']
        col = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor_Float=1.0, A_Color=col, B_Color=g.ramp(g.math('ADD', g.math('MULTIPLY', m1, 0.7), g.math('MULTIPLY', m2, 0.3)), [(0.22, (0.76, 0.80, 0.78)), (0.78, (1.18, 1.14, 1.04))])).outputs[2]
        # 3. выгорание сверху: светлее и серее
        up = g.smooth(nz, 0.35, 0.9)
        faded = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='SCREEN', Factor_Float=0.22, A_Color=col, B_Color=(0.55, 0.55, 0.50)).outputs[2]
        col = g.mix(col, faded, g.math('MULTIPLY', up, 0.55))
    # ── пыль в щелях и углах (светлая), тёмная грязь в самых глубоких местах
    ao_w = g.n('ShaderNodeAmbientOcclusion', Distance=0.22).outputs['AO']; ao_n = g.n('ShaderNodeAmbientOcclusion', Distance=0.05).outputs['AO']
    dn = g.n('ShaderNodeTexNoise', Vector=pos, Scale=7.0, Detail=8.0, Roughness=0.65, W=seed + 21.0).outputs['Fac']
    crev = g.math('MULTIPLY', g.smooth(g.math('SUBTRACT', 1.0, ao_w), 0.10, 0.55), g.smooth(dn, 0.35, 0.65))
    col = g.mix(col, DUST, g.math('MULTIPLY', crev, 0.55 + 0.35 * w))
    col = g.mix(col, (0.02, 0.018, 0.014), g.math('MULTIPLY', g.smooth(g.math('SUBTRACT', 1.0, ao_n), 0.15, 0.7), 0.60))
    # ── потёки сверху вниз на вертикальных гранях (тёмные от болтов и кромок, светлые пыльные)
    vert = g.math('SUBTRACT', 1.0, g.math('ABSOLUTE', nz), clamp=True)
    mp = g.n('ShaderNodeMapping', Vector=pos, Scale=(9.0, 9.0, 0.6))
    st1 = g.n('ShaderNodeTexNoise', Vector=mp.outputs['Vector'], Scale=3.5, Detail=6.0, W=seed + 17.0).outputs['Fac']
    st2 = g.n('ShaderNodeTexNoise', Vector=mp.outputs['Vector'], Scale=6.0, Detail=4.0, W=seed + 18.0).outputs['Fac']
    col = g.mix(col, (0.035, 0.032, 0.025), g.math('MULTIPLY', g.math('MULTIPLY', g.smooth(st1, 0.55, 0.75), vert), 0.70 * w))
    col = g.mix(col, DUST, g.math('MULTIPLY', g.math('MULTIPLY', g.smooth(st2, 0.58, 0.78), vert), 0.45 * w))
    # ── сколы и затёртые кромки (Bevel): светлая затёртая краска → грунт → металл; царапины
    bev = g.n('ShaderNodeBevel', Radius=0.016, _samples=12)
    dp = g.n('ShaderNodeVectorMath', _operation='DOT_PRODUCT', Vector=bev.outputs['Normal'], Vector_001=geo.outputs['Normal']).outputs['Value']
    edge = g.smooth(dp, 0.99, 0.88)
    cn = g.n('ShaderNodeTexNoise', Vector=pos, Scale=28.0, Detail=10.0, Roughness=0.7, W=seed + 13.0).outputs['Fac']
    cz = g.n('ShaderNodeTexNoise', Vector=pos, Scale=1.3, Detail=3.0, W=seed + 14.0).outputs['Fac']
    em = g.math('ADD', g.math('MULTIPLY', edge, 0.75), g.math('MULTIPLY', g.smooth(cz, 0.55, 0.75), 0.25))
    chipv = g.math('MULTIPLY', em, cn)
    worn = g.smooth(chipv, 0.22 - 0.05 * w, 0.34 - 0.05 * w); prim = g.smooth(chipv, 0.36, 0.43); metal = g.smooth(chipv, 0.46, 0.52)
    sm = g.n('ShaderNodeMapping', Vector=pos, Scale=(60.0, 1.2, 60.0), Rotation=(0.4, 0.0, 0.9))
    scr = g.math('MULTIPLY', g.smooth(g.n('ShaderNodeTexNoise', Vector=sm.outputs['Vector'], Scale=3.0, Detail=1.0, W=seed + 5.0).outputs['Fac'], 0.74, 0.77), g.smooth(cz, 0.45, 0.7))
    if paint or kind in ('dark', 'steel'):
        lit = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='SCREEN', Factor_Float=0.28, A_Color=col, B_Color=(0.6, 0.6, 0.55)).outputs[2]
        col = g.mix(col, lit, g.math('MULTIPLY', g.math('MAXIMUM', worn, g.math('MULTIPLY', scr, 0.8)), 0.8 * max(w, 0.4)))
        if paint:
            col = g.mix(col, PRIMER, g.math('MULTIPLY', prim, 0.85 * max(w, 0.4)))
            col = g.mix(col, (0.20, 0.20, 0.19), g.math('MULTIPLY', metal, 0.9 * max(w, 0.4)))
    # ── грязь снизу (рваная граница, пятна), брызги от колёс, пыль на горизонтальных гранях
    d2 = g.n('ShaderNodeTexNoise', Vector=pos, Scale=2.2, Detail=8.0, Roughness=0.6, W=seed + 22.0).outputs['Fac']
    zf = g.math('ADD', z, g.math('MULTIPLY', g.math('SUBTRACT', d2, 0.5), 0.7))
    low = g.math('SUBTRACT', 1.0, g.smooth(zf, 0.30, 1.55), clamp=True)
    mudn = g.n('ShaderNodeTexNoise', Vector=pos, Scale=9.0, Detail=6.0, W=seed + 23.0).outputs['Fac']
    mud = g.math('MULTIPLY', low, g.smooth(mudn, 0.30, 0.55))
    spv = g.n('ShaderNodeTexVoronoi', Vector=pos, Scale=38.0, Randomness=1.0)
    spl = g.math('MULTIPLY', g.smooth(spv.outputs['Distance'], 0.16, 0.08), g.math('SUBTRACT', 1.0, g.smooth(z, 0.6, 1.9), clamp=True))
    spl = g.math('MULTIPLY', spl, g.smooth(g.n('ShaderNodeTexNoise', Vector=pos, Scale=1.8, Detail=2.0, W=seed + 24.0).outputs['Fac'], 0.45, 0.65))
    kmud = (0.35 if kind == 'rubber' else 1.0)
    col = g.mix(col, g.mix(MUD, DUST, g.smooth(z, 0.3, 1.2)), g.math('MULTIPLY', g.math('MAXIMUM', mud, g.math('MULTIPLY', spl, 0.8)), (0.45 + 0.5 * w) * kmud))
    topd = g.math('MULTIPLY', g.smooth(nz, 0.55, 0.95), g.smooth(d2, 0.40, 0.75))
    col = g.mix(col, DUST, g.math('MULTIPLY', topd, 0.45 * w * kmud))
    # ── трафареты и наклейки
    if kind == 'body':
        col = add_decals(g, col, P, N, ID, g.smooth(cn, 0.55, 0.75))
    if mat.name == 'HIM_white':                                                   # «текст» на белых табличках: строки мелких знаков
        ln = g.math('GREATER_THAN', g.math('FRACT', g.math('MULTIPLY', z, 70.0)), 0.55)
        ch = g.smooth(g.n('ShaderNodeTexNoise', Vector=g.n('ShaderNodeMapping', Vector=pos, Scale=(160.0, 160.0, 4.0)).outputs['Vector'], Scale=1.0, Detail=1.0).outputs['Fac'], 0.48, 0.52)
        col = g.mix(col, (0.04, 0.04, 0.04), g.math('MULTIPLY', g.math('MULTIPLY', ln, ch), 0.85))
    # ── блеск: затёртое глаже, металл блестит, пыль и грязь матовые
    rg = g.math('ADD', rough, g.math('MULTIPLY', g.math('SUBTRACT', m2 if paint else dn, 0.5), 0.12))
    rg = g.math('SUBTRACT', rg, g.math('MULTIPLY', g.math('MAXIMUM', worn, scr), 0.25))
    rg = g.math('SUBTRACT', rg, g.math('MULTIPLY', metal, 0.30))
    rg = g.math('ADD', rg, g.math('MULTIPLY', g.math('MAXIMUM', g.math('MAXIMUM', mud, topd), crev), 0.28), clamp=True)
    # ── рельеф: шагрень, сколы углублены, вмятины и волна листов
    pn = g.n('ShaderNodeTexNoise', Vector=tc, Scale=300.0, Detail=2.0, W=seed).outputs['Fac']
    hgt = g.math('SUBTRACT', g.math('MULTIPLY', pn, 0.35), g.math('MULTIPLY', g.math('MAXIMUM', prim, metal), 1.0))
    hgt = g.math('ADD', hgt, g.math('MULTIPLY', g.math('MAXIMUM', mud, spl), 0.6))
    bump = g.n('ShaderNodeBump', Strength=0.08 if kind not in ('rubber',) else 0.18, Distance=0.0015, Height=hgt, Normal=bev.outputs['Normal'])
    if paint:
        wv = g.n('ShaderNodeTexNoise', Vector=tc, Scale=1.6, Detail=1.5, W=seed + 31.0).outputs['Fac']
        dv = g.n('ShaderNodeTexVoronoi', Vector=tc, Scale=2.4, Randomness=1.0)
        dmask = g.smooth(g.n('ShaderNodeTexNoise', Vector=tc, Scale=0.7, Detail=2.0, W=seed + 35.0).outputs['Fac'], 0.55, 0.7)
        dent = g.math('MULTIPLY', g.math('SUBTRACT', 1.0, g.smooth(dv.outputs['Distance'], 0.0, 0.16)), dmask)
        bump = g.n('ShaderNodeBump', Strength=0.35, Distance=0.006, Height=g.math('SUBTRACT', wv, g.math('MULTIPLY', dent, 0.8)), Normal=bump.outputs['Normal'])
    bs = g.n('ShaderNodeBsdfPrincipled', **{'Base Color': col, 'Roughness': rg, 'Normal': bump.outputs['Normal'], 'Metallic': g.math('MAXIMUM', metal if paint else 0.0, 0.7 if kind == 'steel' else 0.0)})
    g.n('ShaderNodeOutputMaterial', Surface=bs.outputs['BSDF'])
    return mat


KIND = {'HIM_body': 'body', 'HIM_lid': 'cont', 'HIM_steel': 'steel', 'HIM_rubber': 'rubber', 'HIM_dark': 'dark', 'HIM_tube': 'dark', 'HIM_canvas': 'dark',
        'HIM_glass': 'keep', 'HIM_red': 'keep', 'HIM_white': 'keep', 'HIM_lamp': 'keep', 'HIM_black': 'keep', 'HIM_yellow': 'keep', 'HIM_blue': 'keep'}
_KEEP = {}


def apply_paint(var, wear=1):
    for o in bpy.data.objects:
        if o.type == 'MESH':
            o['him_id'] = float(IDS.get(o.name, 7 if o.name.startswith('pod_') else 8 if o.name.startswith('lid_') else 9 if o.name.startswith('wheel_') else 12 if o.name.startswith('cyl_') else 0))
    if var.get('base'):
        var = dict(var); bv = VARIANTS[var['base']]; var['body'] = bv['body']; var['cont'] = bv['cont']
    for m in bpy.data.materials:
        if m.name in KIND:
            if m.name not in _KEEP:
                b = m.node_tree.nodes.get('Principled BSDF') or next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                _KEEP[m.name] = (tuple(b.inputs['Base Color'].default_value[:3]), b.inputs['Roughness'].default_value)
            # восстановить исходный цвет для «keep»
            m.use_nodes = True
            for x in list(m.node_tree.nodes): m.node_tree.nodes.remove(x)
            p = m.node_tree.nodes.new('ShaderNodeBsdfPrincipled'); p.name = 'Principled BSDF'
            p.inputs['Base Color'].default_value = (*_KEEP[m.name][0], 1.0); p.inputs['Roughness'].default_value = _KEEP[m.name][1]
            if m.name == 'HIM_glass': glass_tree(m, wear)
            elif m.name == 'HIM_white_lens': lens_tree(m, wear)
            else: paint_tree(m, KIND[m.name], var, wear, seed=hash(m.name) % 17)
