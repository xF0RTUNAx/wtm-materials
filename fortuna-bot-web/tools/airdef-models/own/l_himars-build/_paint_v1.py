# _paint.py — процедурная окраска HIMARS (взята у пусковой PAC-3, Свои/PAC-3_пусковая/_paint.py): машина и клетка однотонно-зелёные (фото 03, 04, 05, 08),
# вариант Б — трёхцветный камуфляж НАТО (фото 09). Крышки труб светло-песочные (фото 06), трубы внутри тёмные.
# Грязь и потёки — по высоте над землёй в мире (поднятый пакет не пачкается «снизу» по своим осям).
# Без развёртки и запекания: шейдер считает цвет прямо при рендере Cycles на видеокарте (координаты объекта). Тот же шейдер потом запекается в атлас для финала.
# Использование: после build.py — apply_paint(VARIANTS['…'], wear) ; wear: 0 — чистая, 1 — средняя, 2 — сильная.
import bpy, math, os

LID = [(0.42, 0.34, 0.20)]                                           # крышки труб (фото 06)
VARIANTS = {
    'олива': dict(title='А. Однотонная зелёная (фото 03, 04, 05, 08)', body=[(0.12, 0.15, 0.085)], cont=LID, camo=None),
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


def paint_tree(mat, kind, var, wear, seed=0.0):
    """kind: body / body2 / cont / steel / rubber / dark / keep (стекло, фонари: только пыль)."""
    keep_col = tuple(mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value[:3]) if mat.node_tree and 'Principled BSDF' in mat.node_tree.nodes else (0.1, 0.1, 0.1)
    keep_r = mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value if mat.node_tree and 'Principled BSDF' in mat.node_tree.nodes else 0.5
    g = G(mat)
    tc = g.n('ShaderNodeTexCoord').outputs['Object']
    geo = g.n('ShaderNodeNewGeometry')
    z = g.n('ShaderNodeSeparateXYZ', Vector=geo.outputs['Position']).outputs['Z']               # высота над землёй (мир)
    w = [0.0, 0.55, 1.0][wear]
    # базовый цвет
    if kind in ('body', 'body2', 'cont', 'contg'):
        cols = var[kind] if kind in ('cont', 'contg') else var['body']
        camo = var['camo'] if (kind in ('body', 'body2') or var.get(kind + '_camo')) else None
        ctype = camo.get('type', 'voronoi') if camo else None
        def stops_of(cols_, wts):
            acc, st = 0.0, []
            for c, wt in zip(cols_, wts): st.append((acc, c)); acc += wt
            return st
        if camo and len(cols) > 1 and ctype == 'bands':
            # полосы: координаты повёрнуты (наискось на бортах), волна-пила даёт повторяющуюся последовательность цветов одной ширины; искажение — неровные края / извилистость
            mp = g.n('ShaderNodeMapping', Vector=tc, Rotation=(math.radians(camo['tilt']), 0.0, math.radians(camo['tilt'] * 0.6)))
            wv = g.n('ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='Y', _wave_profile='SAW', Vector=mp.outputs['Vector'], Scale=camo['scale'],
                     Distortion=camo['distort'], Detail=2.5, **{'Detail Scale': 0.8})
            base = g.ramp(wv.outputs['Fac'], stops_of(cols, camo['weights']), const=True)
        elif camo and len(cols) > 1 and ctype == 'spots':
            # пятна: по одному на ячейку Вороного, радиус задан — размер ровный; цвет пятна (хаки или тёмный) — по ячейке; края рваные от искажения
            dn = g.n('ShaderNodeTexNoise', Vector=tc, Scale=2.2, Detail=4.0).outputs['Color']
            dv = g.n('ShaderNodeVectorMath', _operation='MULTIPLY_ADD', Vector=dn, Vector_001=(0.22, 0.22, 0.22), Vector_002=tc).outputs['Vector']
            vo = g.n('ShaderNodeTexVoronoi', Vector=dv, Scale=camo['scale'], Randomness=0.8)
            mask = g.smooth(vo.outputs['Distance'], camo['radius'] + 0.015, camo['radius'] - 0.015)
            pick = g.ramp(g.n('ShaderNodeRGBToBW', Color=vo.outputs['Color']).outputs['Val'], [(0.0, cols[1]), (camo['weights'][0], cols[2])], const=True)
            bc = g.n('ShaderNodeRGB').outputs[0]; bc.node.outputs[0].default_value = (*cols[0], 1.0)
            base = g.mix(bc, pick, mask)
        elif camo and len(cols) > 1 and ctype == 'cells':
            # ячейки почти правильные (малая случайность Вороного): ровный размер, прямые края, лёгкое искажение
            dn = g.n('ShaderNodeTexNoise', Vector=tc, Scale=1.8, Detail=2.0).outputs['Color']
            dv = g.n('ShaderNodeVectorMath', _operation='MULTIPLY_ADD', Vector=dn, Vector_001=(0.10, 0.10, 0.10), Vector_002=tc).outputs['Vector']
            vo = g.n('ShaderNodeTexVoronoi', Vector=dv, Scale=camo['scale'], Randomness=camo['rand'])
            base = g.ramp(g.n('ShaderNodeRGBToBW', Color=vo.outputs['Color']).outputs['Val'], stops_of(cols, camo['weights']), const=True)
        elif camo and len(cols) > 1:
            dn = g.n('ShaderNodeTexNoise', Vector=tc, Scale=1.4, Detail=3.0, W=seed)
            dv = g.n('ShaderNodeVectorMath', _operation='MULTIPLY_ADD', Vector=dn.outputs['Color'], Vector_001=(0.55, 0.55, 0.55), Vector_002=tc)
            vo = g.n('ShaderNodeTexVoronoi', Vector=dv.outputs['Vector'], Scale=camo['scale'], Randomness=1.0)
            bw = g.n('ShaderNodeRGBToBW', Color=vo.outputs['Color']).outputs['Val']
            acc, stops = 0.0, []
            for c, wt in zip(cols, camo['weights']): stops.append((acc, c)); acc += wt
            base = g.ramp(bw, stops, const=True)
        else:
            base = g.n('ShaderNodeRGB').outputs[0]; base.node.outputs[0].default_value = (*cols[0], 1.0)
        if kind == 'body2': base = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor_Float=1.0, A_Color=base, B_Color=(0.72, 0.74, 0.70)).outputs[2]
        rough = 0.74 if kind not in ('cont', 'contg') else 0.66
    elif kind == 'wood':                                                                            # брус: волокна вдоль X пакета, выветренные серые места
        mp = g.n('ShaderNodeMapping', Vector=tc, Scale=(1.5, 40.0, 40.0))
        gr = g.n('ShaderNodeTexNoise', Vector=mp.outputs['Vector'], Scale=3.0, Detail=8.0, Roughness=0.7).outputs['Fac']
        ring = g.n('ShaderNodeTexWave', _wave_type='RINGS', Vector=mp.outputs['Vector'], Scale=0.6, Distortion=6.0, Detail=3.0).outputs['Fac']
        base = g.ramp(g.math('ADD', g.math('MULTIPLY', gr, 0.6), g.math('MULTIPLY', ring, 0.4)), [(0.2, (0.075, 0.042, 0.02)), (0.55, (0.13, 0.075, 0.036)), (0.85, (0.18, 0.11, 0.055))])
        wn = g.n('ShaderNodeTexNoise', Vector=tc, Scale=6.0, Detail=4.0).outputs['Fac']
        base = g.mix(base, (0.15, 0.135, 0.11), g.math('MULTIPLY', g.smooth(wn, 0.45, 0.75), 0.8)); rough = 0.9
    elif kind == 'steel':
        base = g.n('ShaderNodeRGB').outputs[0]; base.node.outputs[0].default_value = (0.11, 0.11, 0.105, 1.0); rough = 0.45
    elif kind == 'rubber':
        base = g.n('ShaderNodeRGB').outputs[0]; base.node.outputs[0].default_value = (0.020, 0.020, 0.019, 1.0); rough = 0.93
    else:
        base = g.n('ShaderNodeRGB').outputs[0]; base.node.outputs[0].default_value = (*keep_col, 1.0); rough = keep_r
    col = base
    # пятнистость краски (выгорание, подкраска)
    if kind in ('body', 'body2', 'cont', 'contg'):
        pv = g.n('ShaderNodeTexNoise', Vector=tc, Scale=0.9, Detail=4.0, W=seed + 3.0).outputs['Fac']
        tint = g.ramp(pv, [(0.30, (0.86, 0.86, 0.84)), (0.70, (1.10, 1.08, 1.02))])
        col = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor_Float=0.35 + 0.35 * min(wear, 1) + (0.3 if var.get('chips') else 0), A_Color=col, B_Color=tint).outputs[2]
    # надписи-трафареты (pt_decals.png, make_decals.py): плоскость грани в осях объекта, строка картинки, чуть стёрты
    # сколы до грунта и ржавчина (вариант «старый»)
    if var.get('chips') and kind in ('body', 'body2', 'cont'):
        cn = g.n('ShaderNodeTexNoise', Vector=tc, Scale=16.0, Detail=10.0, Roughness=0.7, W=seed + 7.0).outputs['Fac']
        cz = g.n('ShaderNodeTexNoise', Vector=tc, Scale=1.2, Detail=3.0, W=seed + 8.0).outputs['Fac']          # где сколов больше: пятнами по машине
        chip = g.math('MULTIPLY', g.smooth(cn, 0.66 - 0.03 * wear, 0.68 - 0.03 * wear), g.smooth(cz, 0.45, 0.65))
        col = g.mix(col, (0.24, 0.30, 0.18), chip)
        rn = g.n('ShaderNodeTexNoise', Vector=tc, Scale=12.0, Detail=6.0, W=seed + 9.0).outputs['Fac']
        col = g.mix(col, (0.10, 0.045, 0.02), g.math('MULTIPLY', g.smooth(rn, 0.66, 0.72), chip))
    if kind == 'steel':
        rn = g.n('ShaderNodeTexNoise', Vector=tc, Scale=9.0, Detail=6.0, W=seed + 11.0).outputs['Fac']
        col = g.mix(col, (0.09, 0.04, 0.018), g.math('MULTIPLY', g.smooth(rn, 0.52, 0.62), 0.25 + 0.35 * w))
    # стёртые рёбра (Bevel): светлее и до металла
    bev = g.n('ShaderNodeBevel', Radius=0.012, _samples=12)
    dp = g.n('ShaderNodeVectorMath', _operation='DOT_PRODUCT', Vector=bev.outputs['Normal'], Vector_001=geo.outputs['Normal']).outputs['Value']
    edge = g.smooth(dp, 0.985, 0.90)
    en = g.n('ShaderNodeTexNoise', Vector=tc, Scale=18.0, Detail=5.0, W=seed + 13.0).outputs['Fac']
    edge = g.math('MULTIPLY', edge, g.smooth(en, 0.35, 0.65))
    if kind in ('body', 'body2', 'cont', 'contg') and w > 0:
        worn = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='SCREEN', Factor_Float=0.35, A_Color=col, B_Color=(0.6, 0.6, 0.55)).outputs[2]
        col = g.mix(col, worn, g.math('MULTIPLY', edge, 0.7 * w))
        col = g.mix(col, (0.13, 0.125, 0.115), g.math('MULTIPLY', edge, 0.25 * w * (2.0 if var.get('chips') else 1.0)))
    # копоть в углах (AO)
    ao = g.n('ShaderNodeAmbientOcclusion', Distance=0.30).outputs['AO']
    col = g.mix(col, GRIME, g.math('MULTIPLY', g.math('SUBTRACT', 1.0, ao, clamp=True), 0.25 + 0.35 * w))
    # потёки сверху вниз на вертикальных гранях
    if w > 0:
        mp = g.n('ShaderNodeMapping', Vector=tc, Scale=(7.0, 7.0, 0.55))
        sn = g.n('ShaderNodeTexNoise', Vector=mp.outputs['Vector'], Scale=3.0, Detail=6.0, W=seed + 17.0).outputs['Fac']
        nz = g.n('ShaderNodeSeparateXYZ', Vector=geo.outputs['Normal']).outputs['Z']
        vert = g.math('SUBTRACT', 1.0, g.math('ABSOLUTE', nz), clamp=True)
        col = g.mix(col, (0.05, 0.045, 0.035), g.math('MULTIPLY', g.math('MULTIPLY', g.smooth(sn, 0.55, 0.75), vert), 0.35 * w))
    # грязь снизу: от земли до 1,3 м, рваная граница; сверху на горизонтальных — пыль
    dn2 = g.n('ShaderNodeTexNoise', Vector=tc, Scale=2.5, Detail=8.0, Roughness=0.6, W=seed + 21.0).outputs['Fac']
    zf = g.math('ADD', z, g.math('MULTIPLY', g.math('SUBTRACT', dn2, 0.5), 0.6))
    low = g.math('SUBTRACT', 1.0, g.smooth(zf, 0.15, 1.35), clamp=True)
    col = g.mix(col, DIRT, g.math('MULTIPLY', low, (0.25 + 0.55 * w) * (0.35 if kind == 'rubber' else 1.0)))   # шины - тёмные, пыль слабее (фото 05, 08)
    up = g.smooth(g.n('ShaderNodeSeparateXYZ', Vector=geo.outputs['Normal']).outputs['Z'], 0.6, 0.95)
    col = g.mix(col, (0.20, 0.17, 0.12), g.math('MULTIPLY', g.math('MULTIPLY', up, g.smooth(dn2, 0.45, 0.8)), 0.18 * w))
    # рельеф: шагрень и царапины
    pn = g.n('ShaderNodeTexNoise', Vector=tc, Scale=260.0, Detail=2.0, W=seed).outputs['Fac']
    sm = g.n('ShaderNodeMapping', Vector=tc, Scale=(40.0, 1.5, 40.0), Rotation=(0.3, 0.0, 0.7))
    sc_ = g.n('ShaderNodeTexNoise', Vector=sm.outputs['Vector'], Scale=4.0, Detail=1.0, W=seed + 5.0).outputs['Fac']
    hgt = g.math('ADD', g.math('MULTIPLY', pn, 0.6), g.math('MULTIPLY', g.smooth(sc_, 0.72, 0.76), 0.6 * w))
    if kind == 'wood': hgt = g.math('ADD', hgt, g.math('MULTIPLY', gr, 2.0))
    bump = g.n('ShaderNodeBump', Strength=0.06 if kind not in ('rubber', 'wood') else 0.18, Distance=0.002, Height=hgt, Normal=bev.outputs['Normal'])   # поверх скруглённых кромок (Bevel) — как запечка с детальной модели
    if kind in ('body', 'body2', 'cont', 'contg'):                                                 # волна листов после сварки и вмятины по полю
        wv = g.n('ShaderNodeTexNoise', Vector=tc, Scale=1.6, Detail=1.5, W=seed + 31.0).outputs['Fac']
        dv = g.n('ShaderNodeTexVoronoi', Vector=tc, Scale=2.4, Randomness=1.0)
        dmask = g.smooth(g.n('ShaderNodeTexNoise', Vector=tc, Scale=0.7, Detail=2.0, W=seed + 35.0).outputs['Fac'], 0.55, 0.7)
        dent = g.math('MULTIPLY', g.math('SUBTRACT', 1.0, g.smooth(dv.outputs['Distance'], 0.0, 0.16)), dmask)
        hw_ = g.math('SUBTRACT', g.math('MULTIPLY', wv, 1.0), g.math('MULTIPLY', dent, 0.8))
        bump = g.n('ShaderNodeBump', Strength=0.35, Distance=0.006, Height=hw_, Normal=bump.outputs['Normal'])
    rgh = g.math('ADD', rough, g.math('MULTIPLY', low, 0.2 * w), clamp=True)
    bs = g.n('ShaderNodeBsdfPrincipled', **{'Base Color': col, 'Roughness': rgh, 'Normal': bump.outputs['Normal'], 'Metallic': 0.7 if kind == 'steel' else 0.0})
    out = g.n('ShaderNodeOutputMaterial', Surface=bs.outputs['BSDF'])
    return mat


KIND = {'HIM_body': 'body', 'HIM_lid': 'cont', 'HIM_steel': 'steel', 'HIM_rubber': 'rubber', 'HIM_dark': 'dark', 'HIM_tube': 'dark', 'HIM_canvas': 'dark',
        'HIM_glass': 'keep', 'HIM_red': 'keep', 'HIM_white': 'keep', 'HIM_lamp': 'keep', 'HIM_black': 'keep', 'HIM_yellow': 'keep', 'HIM_blue': 'keep'}
_KEEP = {}


def apply_paint(var, wear=1):
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
