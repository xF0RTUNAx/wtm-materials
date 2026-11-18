# _paint.py — процедурная окраска «Искандера» (взята у HIMARS/_paint.py: те же слои - оттенок по деталям, пятна, пыль в щелях, плёнка, потёки, брызги от колёс,
# масло, копоть, сколы до грунта и металла, царапины, грязь снизу, пыль сверху, трафареты; фотомаски ambientCG CC0 из Свои/_текстуры_CC0).
# Машина тёмно-зелёная (фото 01, 06; медиана борта sRGB ≈ 49…64 · 51…64 · 45…54), ракета 9М723 - оливково-серая (фото 07, 08), сопло и рули тёмные.
# Грязь и потёки - по высоте над землёй в мире при походной позе (в ней же запекается атлас).
# Использование: после build.py - apply_paint(VARIANTS['олива'], wear); wear: 0 - чистая, 1 - средняя, 2 - сильная.
import bpy, math, os

MSL = [(0.070, 0.080, 0.050)]                                        # ракета: оливково-серая (фото 07, 08)
VARIANTS = {
    'олива': dict(title='Тёмно-зелёная (фото 01, 06, 07; Mark 2026-11-18: темнее, не зелень HIMARS)', body=[(0.046, 0.055, 0.040)], cont=MSL, camo=None),
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


def near(g, pos, pts, mirror=True, ani=(1.0, 1.0, 1.0)):
    """0…1: близость к точкам (x, y, z, r) в метрах сборки; mirror - и с другой стороны по x; ani - растяжение по осям"""
    acc = None
    for (x, y, z, r) in pts:
        for sx in ((1, -1) if (mirror and x != 0) else (1,)):
            d = g.n('ShaderNodeVectorMath', _operation='DISTANCE', Vector=g.n('ShaderNodeVectorMath', _operation='MULTIPLY', Vector=pos, Vector_001=ani).outputs['Vector'],
                    Vector_001=(sx * x * S_ * ani[0], y * S_ * ani[1], z * S_ * ani[2])).outputs['Value']
            m = g.smooth(d, r * S_, r * S_ * 0.25); acc = m if acc is None else g.math('MAXIMUM', acc, m)
    return acc


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
    gp = g.n('ShaderNodeNewGeometry'); GP = g.n('ShaderNodeSeparateXYZ', Vector=gp.outputs['Position']); GN = g.n('ShaderNodeSeparateXYZ', Vector=gp.outputs['Normal'])
    front = g.math('GREATER_THAN', GN.outputs['Y'], 0.4); clean = None                  # rev 2 (пункт 4): лобовые окна - дуги, вытертые дворниками
    for wx, wz in WIPER:
        d = g.n('ShaderNodeVectorMath', _operation='DISTANCE', Vector=g.n('ShaderNodeCombineXYZ', X=GP.outputs['X'], Y=0.0, Z=GP.outputs['Z']).outputs['Vector'],
                Vector_001=(wx * S_, 0.0, wz * S_)).outputs['Value']
        c_ = g.math('MULTIPLY', g.smooth(d, 0.30 * S_, 0.26 * S_), g.smooth(d, 0.04 * S_, 0.07 * S_)); clean = c_ if clean is None else g.math('MAXIMUM', clean, c_)
    dust = g.math('ADD', g.math('MULTIPLY', dust, g.math('SUBTRACT', 1.0, g.math('MULTIPLY', g.math('MULTIPLY', clean, front), 0.85))), g.math('MULTIPLY', front, g.math('MULTIPLY', g.math('SUBTRACT', 1.0, clean), 0.25 * w)))
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


IDS = {'body_cab': 1, 'body_bay': 2, 'body_chassis': 3, 'body_equip': 4, 'body_guard': 5, 'body_jackbox': 6, 'boom_r': 10, 'boom_l': 10, 'tbm': 14, 'tbm2': 14, 'dec_nose': 14}
DUST = (0.30, 0.26, 0.19)             # светлая пыль (сухой суглинок)
MUD = (0.085, 0.066, 0.045)           # грязь снизу
PRIMER = (0.27, 0.26, 0.19)           # rev 2 (пункт 1): эпоксидный грунт под оливой - светлый серо-песочный, металл только в самых глубоких сколах
BARE = (0.16, 0.16, 0.155)            # голый металл в сколах
RUST = (0.19, 0.085, 0.032)           # ржавчина
OIL = (0.018, 0.014, 0.010)           # масло (глянцевое)
SOOT = (0.012, 0.011, 0.010)          # копоть
# места, где краску трут руки и ноги (центр в метрах, радиус); x зеркалится
WEAR_SPOTS = [(1.48, 5.92, 1.95, 0.18), (1.48, 4.88, 1.95, 0.18), (1.50, 5.55, 0.62, 0.35), (1.50, 4.50, 0.62, 0.35), (1.33, -6.56, 2.30, 0.40),
              (1.48, 2.20, 2.35, 0.15), (1.50, 0.10, 2.35, 0.15), (1.42, 6.58, 1.0, 0.25), (1.52, -0.5, 3.18, 0.30), (1.52, -3.0, 3.18, 0.30)]
WEAR_TOP = [(0.0, 5.00, 3.02, 0.55), (0.0, -6.50, 1.10, 0.60), (-0.93, 6.59, 2.0, 0.45)]           # люк кабины, задний бампер, лестница решётки
OIL_SRC = [(0.15, -5.32, 1.40, 0.15), (-0.15, -5.32, 1.40, 0.15), (1.34, 2.44, 0.64, 0.35), (-1.34, 2.44, 0.64, 0.35), (1.34, -3.80, 0.64, 0.35), (-1.34, -3.80, 0.64, 0.35),
           (0.0, 3.40, 0.72, 0.40), (0.0, 0.60, 0.70, 0.35), (0.0, 3.33, 0.62, 0.3), (0.0, 0.99, 0.62, 0.3), (0.0, -2.95, 0.62, 0.3), (0.0, -5.19, 0.62, 0.3)]
EXH = (-1.30, 3.05, 3.25)                                                      # выпуск за кабиной слева сверху (кожух воздухозаборника)
WIPER = [(-0.86, 2.05), (0.0, 2.05), (0.86, 2.05)]                              # оси дворников (x, z) у низа лобовых окон
AX, R_W, S_ = AXY, RW, 1.0
_DJ = []


def dec_rows():
    if not _DJ:
        import json
        hd = HD if 'HD' in globals() else (H_ if 'H_' in globals() else HERE)
        _DJ.append(json.load(open(os.path.join(hd, 'isk_decals.json'))))
        _DJ.append(bpy.data.images.load(os.path.join(hd, 'isk_decals.png'), check_existing=True))
    return _DJ


# трафареты и наклейки (вымышленные): (номера объектов, грань, координата плоскости, центр u, центр v, высота букв, строка, цвет)
WH, BK = (0.55, 0.55, 0.50), (0.02, 0.02, 0.018)
DECALS = []
for sd in (1, -1):
    ax_ = 'x+' if sd > 0 else 'x-'; xb = sd * HW; xc = sd * (HW - 0.02)
    DECALS += [((2,), ax_, xb, -1.23, 2.70, 0.050, 2, WH), ((2,), ax_, xb, -4.17, 2.58, 0.045, 0, WH), ((2,), ax_, xb, 0.74, 1.86, 0.045, 3, WH),
               ((2,), ax_, xb, -3.30, 1.86, 0.045, 7, WH), ((2,), ax_, xb, -4.28, 1.80, 0.038, 5, WH), ((2,), ax_, xb, 0.58, 2.70, 0.040, 10, WH),
               ((1,), ax_, xc, 4.45, 1.40, 0.035, 4, WH), ((3,), ax_, sd * 1.48, -1.53, 1.30, 0.045, 7, WH),
               ((4,), ax_, xb, 2.75, 2.50, 0.040, 6, WH), ((3,), ax_, sd * 1.43, -0.38, 1.26, 0.075, 1, WH), ((3,), ax_, sd * 1.43, -0.38, 1.10, 0.035, 8, WH)]
LABELS = []
for sd in (1, -1):
    ax_ = 'x+' if sd > 0 else 'x-'; xb = sd * HW
    LABELS += [((2,), ax_, xb, -0.13, 1.86, 0.12, 0.07, (0.55, 0.55, 0.50)), ((2,), ax_, xb, -6.20, 1.75, 0.07, 0.05, (0.55, 0.08, 0.03)),
               ((1,), ax_, sd * (HW - 0.02), 3.45, 2.85, 0.14, 0.08, (0.55, 0.55, 0.50))]


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
        tw = js['w'][row]; w = ht * tw * 2048 / 100; h = ht * 1.28
        u, v, m = plane_uv(g, P, N, ids, ax, pc, uc, vc, w, h, ID)
        cv = g.n('ShaderNodeCombineXYZ', X=g.math('MULTIPLY', u, tw), Y=g.math('MULTIPLY', g.math('ADD', v, nr - 1 - row), 1.0 / nr), Z=0.0).outputs['Vector']
        ti = g.n('ShaderNodeTexImage', Vector=cv); ti.image = img; ti.extension = 'CLIP'; ti.interpolation = 'Cubic'
        a = g.math('MULTIPLY', g.math('MULTIPLY', ti.outputs['Alpha'], m), g.math('SUBTRACT', 1.0, g.math('MULTIPLY', wearn, 0.6)))
        col = g.mix(col, c, g.math('MULTIPLY', a, 0.92))
    # светоотражающая полоса на заднем бампере: красно-белая наискось (Y_REAR - 0,13)
    X, Y, Z = P.outputs['X'], P.outputs['Y'], P.outputs['Z']
    band = g.math('MULTIPLY', g.math('MULTIPLY', g.math('GREATER_THAN', Z, 0.84), g.math('LESS_THAN', Z, 0.91)), g.math('LESS_THAN', g.math('ABSOLUTE', g.math('SUBTRACT', Y, Y_REAR - 0.06)), 0.03))
    band = g.math('MULTIPLY', band, g.math('MULTIPLY', g.math('LESS_THAN', N.outputs['Y'], -0.7), g.n('ShaderNodeMath', _operation='COMPARE', Value=ID, Value_001=2.0, Value_002=0.1).outputs[0]))
    band = g.math('MULTIPLY', band, g.math('GREATER_THAN', g.math('ABSOLUTE', X), 0.30))
    strp = g.math('GREATER_THAN', g.math('FRACT', g.math('MULTIPLY', g.math('ADD', X, Z), 6.0)), 0.5)
    col = g.mix(col, g.mix((0.40, 0.03, 0.02), (0.62, 0.62, 0.60), strp), g.math('MULTIPLY', band, 0.95))
    return col


CC0 = {'si3': 'SurfaceImperfections003/SurfaceImperfections003_2K-JPG_Opacity.jpg', 'si13': 'SurfaceImperfections013/SurfaceImperfections013_2K-JPG_Opacity.jpg',
       'sc3': 'Scratches003/Scratches003_2K-JPG_Opacity.jpg', 'sc5': 'Scratches005/Scratches005_2K-JPG_Opacity.jpg', 'lk12': 'Leaking012A/Leaking012A_2K-JPG_Color.jpg',
       'lk17': 'Leaking017B/Leaking017B_2K-JPG_Color.jpg'}     # ambientCG, CC0 1.0 (Свои/_текстуры_CC0/README.txt)


def photo(g, key, pos, scale, blend=0.3, inv=False, rot=0.0):
    """фотомаска CC0 кубической проекцией по мировым координатам (сколы, разводы, царапины, потёки), 0…1"""
    hd = HD if 'HD' in globals() else (H_ if 'H_' in globals() else HERE)
    mp = g.n('ShaderNodeMapping', Vector=pos, Scale=(scale, scale, scale), Rotation=(0.0, 0.0, rot), Location=(0.37 * scale, 0.21 * scale, 0.0))
    ti = g.n('ShaderNodeTexImage', Vector=mp.outputs['Vector']); ti.image = bpy.data.images.load(os.path.join(hd, '..', '_текстуры_CC0', CC0[key]), check_existing=True)
    ti.image.colorspace_settings.name = 'Non-Color'; ti.projection = 'BOX'; ti.projection_blend = blend
    v = g.n('ShaderNodeRGBToBW', Color=ti.outputs['Color']).outputs['Val']
    return g.math('SUBTRACT', 1.0, v) if inv else v


def ID_is(g, ID, k): return g.n('ShaderNodeMath', _operation='COMPARE', Value=ID, Value_001=float(k), Value_002=0.1).outputs[0]


def paint_tree(mat, kind, var, wear, seed=0.0):
    """kind: body / cont / steel / rubber / dark / keep. Слои: оттенок по деталям, пятна и выгорание, пыль в щелях, потёки, сколы и царапины, грязь и брызги, пыль сверху; трафареты."""
    keep_col = tuple(mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value[:3]) if mat.node_tree and 'Principled BSDF' in mat.node_tree.nodes else (0.1, 0.1, 0.1)
    keep_r = mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value if mat.node_tree and 'Principled BSDF' in mat.node_tree.nodes else 0.5
    g = G(mat)
    tc = g.n('ShaderNodeTexCoord').outputs['Object']; geo = g.n('ShaderNodeNewGeometry')
    P = g.n('ShaderNodeSeparateXYZ', Vector=geo.outputs['Position']); N = g.n('ShaderNodeSeparateXYZ', Vector=geo.outputs['Normal'])
    pos = geo.outputs['Position']; z = P.outputs['Z']; nz = N.outputs['Z']
    ID = g.n('ShaderNodeAttribute', _attribute_type='OBJECT', _attribute_name='isk_id').outputs['Fac']
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
    elif kind == 'rope': col = g.n('ShaderNodeRGB').outputs[0]; col.node.outputs[0].default_value = (0.46, 0.45, 0.41, 1.0); rough = 0.95   # тросы: светлые (фото 01, 02), волокно, в грязи
    elif kind == 'rubber': col = g.n('ShaderNodeRGB').outputs[0]; col.node.outputs[0].default_value = (0.022, 0.022, 0.021, 1.0); rough = 0.92
    else: col = g.n('ShaderNodeRGB').outputs[0]; col.node.outputs[0].default_value = (*keep_col, 1.0); rough = keep_r
    if paint:
        # 1. оттенок по деталям (партии краски, подкраска отдельных панелей)
        col = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor_Float=1.0, A_Color=col, B_Color=g.ramp(isl, [(0.0, (0.84, 0.88, 0.86)), (0.5, (1.0, 1.0, 1.0)), (1.0, (1.12, 1.08, 0.98))])).outputs[2]
        # 2. крупные пятна (выгорание, подкраска) и мелкая неровность
        m1 = g.n('ShaderNodeTexNoise', Vector=pos, Scale=0.45, Detail=3.0, W=seed + 3.0).outputs['Fac']
        m2 = g.n('ShaderNodeTexNoise', Vector=pos, Scale=4.0, Detail=6.0, Roughness=0.6, W=seed + 4.0).outputs['Fac']
        ph3 = photo(g, 'si3', pos, 0.55)
        col = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor_Float=1.0, A_Color=col, B_Color=g.ramp(g.math('ADD', g.math('MULTIPLY', m1, 0.55), g.math('ADD', g.math('MULTIPLY', m2, 0.2), g.math('MULTIPLY', ph3, 0.55))), [(0.22, (0.86, 0.89, 0.88)), (0.80, (1.08, 1.06, 1.02))])).outputs[2]
        # 3. выгорание сверху: светлее и серее
        up = g.smooth(nz, 0.35, 0.9)
        faded = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='SCREEN', Factor_Float=0.12, A_Color=col, B_Color=(0.45, 0.47, 0.44)).outputs[2]
        col = g.mix(col, faded, g.math('MULTIPLY', up, 0.30))
    # ── пыль в щелях и углах (светлая), тёмная грязь в самых глубоких местах
    ao_w = g.n('ShaderNodeAmbientOcclusion', Distance=0.22).outputs['AO']; ao_n = g.n('ShaderNodeAmbientOcclusion', Distance=0.05).outputs['AO']
    dn = g.n('ShaderNodeTexNoise', Vector=pos, Scale=7.0, Detail=8.0, Roughness=0.65, W=seed + 21.0).outputs['Fac']
    p13 = photo(g, 'si13', pos, 0.9)
    crev = g.math('MULTIPLY', g.smooth(g.math('SUBTRACT', 1.0, ao_w), 0.10, 0.55), g.smooth(g.math('ADD', g.math('MULTIPLY', dn, 0.6), g.math('MULTIPLY', p13, 1.2)), 0.30, 0.65))
    col = g.mix(col, DUST, g.math('MULTIPLY', crev, 0.55 + 0.35 * w))
    col = g.mix(col, (0.02, 0.018, 0.014), g.math('MULTIPLY', g.smooth(g.math('SUBTRACT', 1.0, ao_n), 0.15, 0.7), 0.60))
    # ── плёнка пыли и разводы по всей окраске (фото CC0): светлый налёт пятнами, тёмные засохшие капли
    if paint:
        film = g.smooth(g.math('ADD', g.math('MULTIPLY', photo(g, 'si3', pos, 1.3, rot=0.6), 1.6), g.math('MULTIPLY', m1, 0.3)), 0.25, 0.85)
        col = g.mix(col, DUST, g.math('MULTIPLY', film, 0.14 + 0.08 * w))
        spot = g.smooth(photo(g, 'si13', pos, 0.6, rot=1.3), 0.25, 0.6)
        col = g.mix(col, (0.05, 0.05, 0.04), g.math('MULTIPLY', spot, 0.35))
    # ── потёки сверху вниз на вертикальных гранях (тёмные от болтов и кромок, светлые пыльные)
    vert = g.math('SUBTRACT', 1.0, g.math('ABSOLUTE', nz), clamp=True)
    mp = g.n('ShaderNodeMapping', Vector=pos, Scale=(9.0, 9.0, 0.6))
    st1 = g.n('ShaderNodeTexNoise', Vector=mp.outputs['Vector'], Scale=3.5, Detail=6.0, W=seed + 17.0).outputs['Fac']
    st2 = g.n('ShaderNodeTexNoise', Vector=mp.outputs['Vector'], Scale=6.0, Detail=4.0, W=seed + 18.0).outputs['Fac']
    lk = photo(g, 'lk12', pos, 0.7, blend=0.15, inv=True); lk2 = photo(g, 'lk17', pos, 0.45, blend=0.15, inv=True)
    gst = g.math('MULTIPLY', g.smooth(g.math('ADD', g.math('MULTIPLY', lk, 3.0), g.math('MULTIPLY', g.smooth(st1, 0.55, 0.75), 0.4)), 0.15, 0.7), vert)
    col = g.mix(col, (0.035, 0.032, 0.025), g.math('MULTIPLY', gst, 0.95 * w))
    dst = g.math('MULTIPLY', g.smooth(g.math('ADD', g.math('MULTIPLY', lk2, 3.0), g.math('MULTIPLY', g.smooth(st2, 0.58, 0.78), 0.4)), 0.15, 0.7), vert)
    col = g.mix(col, DUST, g.math('MULTIPLY', dst, 0.75 * w))
    # rev 2 (пункт 2): дождевые потёки от верхних кромок каждой детали вниз (тонкие, вытянутые)
    gz = g.n('ShaderNodeSeparateXYZ', Vector=g.n('ShaderNodeTexCoord').outputs['Generated']).outputs['Z']
    rs = g.n('ShaderNodeTexNoise', Vector=g.n('ShaderNodeMapping', Vector=pos, Scale=(70.0, 70.0, 0.35)).outputs['Vector'], Scale=2.0, Detail=3.0, W=seed + 41.0).outputs['Fac']
    rain = g.math('MULTIPLY', g.math('MULTIPLY', vert, g.smooth(gz, 0.15, 0.95)), g.smooth(rs, 0.60, 0.74))
    col = g.mix(col, (0.045, 0.040, 0.030), g.math('MULTIPLY', rain, 0.45 * w * (0.4 if kind == 'cont' else 1.0)))
    # брызги из-под колёс: веером назад и вверх от каждого колеса, на раме, ящиках и низе кабины
    X_, Y_ = P.outputs['X'], P.outputs['Y']; spray = None
    for yw in AX:
        dy = g.math('SUBTRACT', Y_, yw * S_); dz = g.math('SUBTRACT', z, R_W * S_)
        r_ = g.n('ShaderNodeVectorMath', _operation='LENGTH', Vector=g.n('ShaderNodeCombineXYZ', X=dy, Y=dz, Z=0.0).outputs['Vector']).outputs['Value']
        ang = g.n('ShaderNodeMath', _operation='ARCTAN2', Value=dz, Value_001=dy).outputs[0]
        rad = g.n('ShaderNodeTexNoise', Vector=g.n('ShaderNodeCombineXYZ', X=g.math('MULTIPLY', ang, 9.0), Y=g.math('MULTIPLY', r_, 1.2), Z=float(yw)).outputs['Vector'], Scale=3.0, Detail=4.0).outputs['Fac']
        back = g.math('ADD', 0.45, g.math('MULTIPLY', g.smooth(g.math('MULTIPLY', dy, -1.0), -0.2, 0.4), 0.55))     # назад сильнее
        m_ = g.math('MULTIPLY', g.math('MULTIPLY', g.smooth(r_, (R_W + 1.0) * S_, (R_W + 0.05) * S_), g.smooth(rad, 0.45, 0.62)), back)
        spray = m_ if spray is None else g.math('MAXIMUM', spray, m_)
    spray = g.math('MULTIPLY', spray, g.smooth(g.math('ABSOLUTE', X_), 0.35 * S_, 0.75 * S_))
    col = g.mix(col, MUD, g.math('MULTIPLY', spray, (0.55 + 0.35 * w) * (0.5 if kind == 'rubber' else 0.0 if kind == 'cont' else 1.0)))   # ракета - в закрытом отсеке, брызг нет
    # масло: тёмные глянцевые подтёки вниз от опор цилиндров, двигателя, коробки, гидравлики платформы; плёнка на корпусах цилиндров
    oil = None
    for (ox, oy, oz, orr) in OIL_SRC:
        dxy = g.n('ShaderNodeVectorMath', _operation='DISTANCE', Vector=g.n('ShaderNodeCombineXYZ', X=X_, Y=Y_, Z=0.0).outputs['Vector'], Vector_001=(ox * S_, oy * S_, 0.0)).outputs['Value']
        below = g.math('MULTIPLY', g.smooth(z, oz * S_ + 0.05, oz * S_ - 0.05), g.smooth(z, (oz - orr) * S_, oz * S_))
        m_ = g.math('MULTIPLY', g.smooth(dxy, 0.16 * S_, 0.03 * S_), below); oil = m_ if oil is None else g.math('MAXIMUM', oil, m_)
    ol = g.n('ShaderNodeTexNoise', Vector=g.n('ShaderNodeMapping', Vector=pos, Scale=(30.0, 30.0, 1.5)).outputs['Vector'], Scale=2.5, Detail=4.0, W=seed + 43.0).outputs['Fac']
    isc = g.n('ShaderNodeMath', _operation='COMPARE', Value=ID, Value_001=12.0, Value_002=0.1).outputs[0]
    oil = g.math('MAXIMUM', g.math('MULTIPLY', oil, g.smooth(ol, 0.35, 0.6)), g.math('MULTIPLY', isc, g.math('MULTIPLY', g.smooth(ol, 0.5, 0.7), 0.6)))
    col = g.mix(col, OIL, g.math('MULTIPLY', oil, 0.85))
    # копоть у выхлопа (выше и позади выхода сильнее), на кожухе и углу кабины
    soot = near(g, pos, [(EXH[0], EXH[1], EXH[2] + 0.10, 0.75)], mirror=False)
    sn = g.n('ShaderNodeTexNoise', Vector=pos, Scale=6.0, Detail=6.0, W=seed + 47.0).outputs['Fac']
    soot = g.math('MULTIPLY', soot, g.smooth(sn, 0.30, 0.62))
    col = g.mix(col, SOOT, g.math('MULTIPLY', soot, 0.75))
    # ── сколы и затёртые кромки (Bevel): светлая затёртая краска → грунт → металл; царапины
    bev = g.n('ShaderNodeBevel', Radius=0.016, _samples=12)
    dp = g.n('ShaderNodeVectorMath', _operation='DOT_PRODUCT', Vector=bev.outputs['Normal'], Vector_001=geo.outputs['Normal']).outputs['Value']
    edge = g.smooth(dp, 0.99, 0.88)
    aoi = g.n('ShaderNodeAmbientOcclusion', Distance=0.012, _inside=True, _only_local=True, _samples=5).outputs['AO']   # правило 18: маска выпуклых кромок (Inside + Only Local)
    edge = g.math('MAXIMUM', edge, g.smooth(g.math('SUBTRACT', 1.0, aoi), 0.30, 0.65))
    cn = g.n('ShaderNodeTexNoise', Vector=pos, Scale=28.0, Detail=10.0, Roughness=0.7, W=seed + 13.0).outputs['Fac']
    cz = g.n('ShaderNodeTexNoise', Vector=pos, Scale=1.3, Detail=3.0, W=seed + 14.0).outputs['Fac']
    convex = g.smooth(ao_n, 0.72, 0.95)                                           # rev 2 (пункт 1): сколы только на выпуклых кромках, не во внутренних углах
    spots = g.math('MAXIMUM', near(g, pos, WEAR_SPOTS), near(g, pos, WEAR_TOP, mirror=False))
    em = g.math('ADD', g.math('ADD', g.math('MULTIPLY', g.math('MULTIPLY', edge, convex), 0.75), g.math('MULTIPLY', g.smooth(cz, 0.55, 0.75), 0.25)), g.math('MULTIPLY', spots, 0.55))
    chipv = g.math('MULTIPLY', em, g.math('ADD', g.math('MULTIPLY', cn, 0.55), g.math('MULTIPLY', photo(g, 'si13', pos, 1.7), 0.9)))
    worn = g.smooth(chipv, 0.22 - 0.05 * w, 0.34 - 0.05 * w); prim = g.smooth(chipv, 0.36, 0.43); metal = g.smooth(chipv, 0.46, 0.52)
    sm = g.n('ShaderNodeMapping', Vector=pos, Scale=(60.0, 1.2, 60.0), Rotation=(0.4, 0.0, 0.9))
    scr = g.math('MULTIPLY', g.math('MAXIMUM', g.smooth(photo(g, 'sc3', pos, 0.8), 0.18, 0.45), g.math('MULTIPLY', g.smooth(photo(g, 'sc5', pos, 1.1), 0.25, 0.6), 0.6)), g.smooth(cz, 0.35, 0.65))
    if paint or kind in ('dark', 'steel'):
        lit = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='SCREEN', Factor_Float=0.28, A_Color=col, B_Color=(0.6, 0.6, 0.55)).outputs[2]
        col = g.mix(col, lit, g.math('MULTIPLY', g.math('MAXIMUM', worn, g.math('MULTIPLY', scr, 0.8)), 0.8 * max(w, 0.4)))
        if paint:
            col = g.mix(col, PRIMER, g.math('MULTIPLY', prim, 0.85 * max(w, 0.4)))
            col = g.mix(col, BARE, g.math('MULTIPLY', metal, 0.9 * max(w, 0.4)))
            halo = g.math('MULTIPLY', g.math('SUBTRACT', g.smooth(chipv, 0.42, 0.47), metal, clamp=True), g.smooth(cn, 0.45, 0.6))   # ржавый ободок у глубоких сколов
            col = g.mix(col, RUST, g.math('MULTIPLY', halo, 0.7))
    if kind == 'steel':                                                          # rev 2 (пункт 2): ржавчина на серьгах, петлях, болтах - в углах и пятнами
        rn = g.n('ShaderNodeTexNoise', Vector=pos, Scale=22.0, Detail=8.0, Roughness=0.7, W=seed + 51.0).outputs['Fac']
        rust = g.math('MAXIMUM', g.math('MULTIPLY', g.smooth(g.math('SUBTRACT', 1.0, ao_n), 0.1, 0.5), 0.9), g.smooth(rn, 0.52, 0.66))
        col = g.mix(col, g.mix(RUST, (0.11, 0.05, 0.02), g.smooth(rn, 0.6, 0.8)), g.math('MULTIPLY', rust, 0.75))
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
    topd = g.math('MULTIPLY', g.smooth(nz, 0.55, 0.95), g.math('MAXIMUM', g.smooth(d2, 0.40, 0.75), g.smooth(g.math('SUBTRACT', 1.0, ao_w), 0.05, 0.35)))   # rev 2: пыль гуще у стенок
    col = g.mix(col, DUST, g.math('MULTIPLY', topd, 0.40 * w * kmud))
    if paint:                                                                    # rev 2 (пункт 4): разные партии краски у узлов (кабина, пакет, рама…)
        col = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor_Float=1.0, A_Color=col,
                  B_Color=g.ramp(g.math('FRACT', g.math('MULTIPLY', ID, 0.37)), [(0.0, (0.95, 0.97, 0.96)), (0.5, (1.03, 1.01, 0.97)), (1.0, (0.98, 1.0, 1.03))])).outputs[2]
        pol = g.math('MULTIPLY', spots, g.smooth(cn, 0.35, 0.55))                  # затёртая до блеска краска у ручек и на мостике
        col = g.mix(col, g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='SCREEN', Factor_Float=0.18, A_Color=col, B_Color=(0.5, 0.5, 0.45)).outputs[2], g.math('MULTIPLY', pol, 0.6))
    if kind == 'cont':                                                           # разметка ракеты (фото 08): короткие чёрные чёрточки по образующей, по 3 в ряд
        tp = g.n('ShaderNodeSeparateXYZ', Vector=tc); ang = g.n('ShaderNodeMath', _operation='ARCTAN2', Value=tp.outputs['Z'], Value_001=tp.outputs['X']).outputs[0]
        mk_ = None
        for yc in (-0.55, -1.35, 1.10):
            for da in (-0.16, 0.0, 0.16):
                m_ = g.math('MULTIPLY', g.math('LESS_THAN', g.math('ABSOLUTE', g.math('SUBTRACT', tp.outputs['Y'], yc)), 0.012), g.math('LESS_THAN', g.math('ABSOLUTE', g.math('SUBTRACT', ang, 0.35 + da)), 0.05))
                mk_ = m_ if mk_ is None else g.math('MAXIMUM', mk_, m_)
        col = g.mix(col, (0.015, 0.015, 0.013), g.math('MULTIPLY', mk_, 0.9))
    # ── трафареты и наклейки
    if kind == 'body':
        col = add_decals(g, col, P, N, ID, g.smooth(cn, 0.55, 0.75))
    if mat.name == 'ISK_white':                                                   # «текст» на белых табличках: строки мелких знаков
        ln = g.math('GREATER_THAN', g.math('FRACT', g.math('MULTIPLY', z, 70.0)), 0.55)
        ch = g.smooth(g.n('ShaderNodeTexNoise', Vector=g.n('ShaderNodeMapping', Vector=pos, Scale=(160.0, 160.0, 4.0)).outputs['Vector'], Scale=1.0, Detail=1.0).outputs['Fac'], 0.48, 0.52)
        col = g.mix(col, (0.04, 0.04, 0.04), g.math('MULTIPLY', g.math('MULTIPLY', ln, ch), 0.85))
    # ── блеск: затёртое глаже, металл блестит, пыль и грязь матовые
    rg = g.math('ADD', rough, g.math('MULTIPLY', g.math('SUBTRACT', m2 if paint else dn, 0.5), 0.12))
    rg = g.math('SUBTRACT', rg, g.math('MULTIPLY', g.math('MAXIMUM', worn, scr), 0.25))
    rg = g.math('SUBTRACT', rg, g.math('MULTIPLY', metal, 0.30))
    rg = g.math('ADD', rg, g.math('MULTIPLY', g.math('MAXIMUM', g.math('MAXIMUM', g.math('MAXIMUM', mud, topd), crev), g.math('MAXIMUM', spray, soot)), 0.28), clamp=True)
    rg = g.math('SUBTRACT', rg, g.math('MULTIPLY', oil, 0.55), clamp=True)
    if paint: rg = g.math('SUBTRACT', rg, g.math('MULTIPLY', pol, 0.22), clamp=True)
    # ── рельеф: шагрень, сколы углублены, вмятины и волна листов
    pn = g.n('ShaderNodeTexNoise', Vector=tc, Scale=300.0, Detail=2.0, W=seed).outputs['Fac']
    hgt = g.math('SUBTRACT', g.math('MULTIPLY', pn, 0.35), g.math('MULTIPLY', g.math('MAXIMUM', prim, metal), 1.0))
    hgt = g.math('ADD', hgt, g.math('MULTIPLY', g.math('MAXIMUM', mud, spl), 0.6))
    # rev 2 (пункт 3): сварной шов во внутренних углах стыков - мелкая чешуя
    concave = g.math('MULTIPLY', g.smooth(dp, 0.995, 0.93), g.smooth(ao_n, 0.80, 0.55))
    wv_ = g.n('ShaderNodeTexVoronoi', Vector=pos, Scale=260.0, Randomness=0.6).outputs['Distance']
    hgt = g.math('ADD', hgt, g.math('MULTIPLY', concave, g.math('ADD', 0.5, g.math('MULTIPLY', wv_, 1.2))))
    if paint:                                                                    # рифлёный настил: мостик, верх основания и платформы
        X_, Y_ = P.outputs['X'], P.outputs['Y']
        deck = g.math('MULTIPLY', g.smooth(nz, 0.85, 0.97), g.math('MAXIMUM', g.math('MAXIMUM',
                      g.n('ShaderNodeMath', _operation='COMPARE', Value=ID, Value_001=3.0, Value_002=0.1).outputs[0],
                      g.n('ShaderNodeMath', _operation='COMPARE', Value=ID, Value_001=5.0, Value_002=0.1).outputs[0]),
                      g.n('ShaderNodeMath', _operation='COMPARE', Value=ID, Value_001=6.0, Value_002=0.1).outputs[0]))
        a1 = g.math('SINE', g.math('MULTIPLY', g.math('ADD', X_, Y_), 75.0)); a2 = g.math('SINE', g.math('MULTIPLY', g.math('SUBTRACT', X_, Y_), 75.0))
        dia = g.math('MULTIPLY', g.smooth(a1, 0.55, 0.9), g.smooth(a2, 0.55, 0.9))
        hgt = g.math('ADD', hgt, g.math('MULTIPLY', g.math('MULTIPLY', deck, dia), 1.6))
    if kind == 'grate':                                                          # решётчатый настил крышек (фото 08): ромбическая сетка, сквозь ячейки - тёмная глубина
        X_, Y_ = P.outputs['X'], P.outputs['Y']
        YZ = g.math('ADD', Y_, z)                                                # настил крышки (по Y) и сердцевина радиатора (по Z)
        u1 = g.math('FRACT', g.math('MULTIPLY', g.math('ADD', X_, g.math('MULTIPLY', YZ, 0.6)), 18.0)); u2 = g.math('FRACT', g.math('MULTIPLY', g.math('SUBTRACT', X_, g.math('MULTIPLY', YZ, 0.6)), 18.0))
        bars = g.math('MAXIMUM', g.math('LESS_THAN', u1, 0.24), g.math('LESS_THAN', u2, 0.24))
        col = g.mix((0.008, 0.008, 0.007), g.mix((0.038, 0.046, 0.033), DUST, g.math('MULTIPLY', topd, 0.5)), bars)
        hgt = g.math('ADD', hgt, g.math('MULTIPLY', bars, 3.0))
    if kind == 'rope':                                                           # витые пряди троса: косые полосы по длине (координаты объекта)
        tp = g.n('ShaderNodeSeparateXYZ', Vector=tc)
        fib = g.n('ShaderNodeTexNoise', Vector=g.n('ShaderNodeMapping', Vector=tc, Scale=(400.0, 400.0, 400.0)).outputs['Vector'], Scale=1.0, Detail=6.0, Roughness=0.7).outputs['Fac']   # ворс волокон
        hgt = g.math('ADD', hgt, g.math('MULTIPLY', fib, 1.5))
        col = g.mix(col, (0.20, 0.19, 0.16), g.math('MULTIPLY', g.smooth(ao_n, 0.85, 0.45), 0.7))   # тень между прядями
        col = g.mix(col, MUD, g.math('MULTIPLY', g.smooth(fib, 0.55, 0.75), 0.25))
    if kind == 'rubber':                                                         # надписи на боковинах шин: дуги «букв» по кругу
        T_ = g.n('ShaderNodeSeparateXYZ', Vector=tc)
        rr = g.n('ShaderNodeVectorMath', _operation='LENGTH', Vector=g.n('ShaderNodeCombineXYZ', X=T_.outputs['Y'], Y=T_.outputs['Z'], Z=0.0).outputs['Vector']).outputs['Value']
        th = g.n('ShaderNodeMath', _operation='ARCTAN2', Value=T_.outputs['Z'], Value_001=T_.outputs['Y']).outputs[0]
        band = g.math('MULTIPLY', g.math('MULTIPLY', g.smooth(rr, 0.57, 0.585), g.smooth(rr, 0.665, 0.65)), g.smooth(g.math('ABSOLUTE', N.outputs['X']), 0.6, 0.8))
        words = g.math('LESS_THAN', g.math('FRACT', g.math('MULTIPLY', th, 3.0 / 6.2832)), 0.30)
        cell = g.math('GREATER_THAN', g.math('FRACT', g.math('MULTIPLY', th, 70.0 / 6.2832)), 0.18)
        gl = g.n('ShaderNodeTexNoise', Vector=g.n('ShaderNodeCombineXYZ', X=g.math('MULTIPLY', th, 40.0), Y=g.math('MULTIPLY', rr, 180.0), Z=0.0).outputs['Vector'], Scale=1.0, Detail=0.0).outputs['Fac']
        lett = g.math('MULTIPLY', g.math('MULTIPLY', band, words), g.math('MULTIPLY', cell, g.math('GREATER_THAN', gl, 0.47)))
        hgt = g.math('ADD', hgt, g.math('MULTIPLY', lett, 3.5))
        col = g.mix(col, (0.075, 0.072, 0.066), g.math('MULTIPLY', lett, 0.8))                 # буквы светлее: затёрты и в пыли
    if ID_is(g, ID, 9) is not None and kind in ('body', 'dark', 'steel'):       # литая фактура ступиц
        cast = g.n('ShaderNodeTexNoise', Vector=tc, Scale=140.0, Detail=3.0, W=seed + 55.0).outputs['Fac']
        hgt = g.math('ADD', hgt, g.math('MULTIPLY', g.math('MULTIPLY', ID_is(g, ID, 9), cast), 0.35))
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


KIND = {'ISK_body': 'body', 'ISK_msl': 'cont', 'ISK_msl_dark': 'dark', 'ISK_steel': 'steel', 'ISK_rubber': 'rubber', 'ISK_dark': 'dark', 'ISK_tube': 'grate', 'ISK_canvas': 'rope',
        'ISK_glass': 'keep', 'ISK_red': 'keep', 'ISK_white': 'keep', 'ISK_white_lens': 'keep', 'ISK_lamp': 'keep', 'ISK_black': 'keep', 'ISK_yellow': 'keep', 'ISK_blue': 'keep', 'ISK_lid': 'keep'}
_KEEP = {}


def apply_paint(var, wear=1):
    for o in bpy.data.objects:
        if o.type == 'MESH':
            o['isk_id'] = float(IDS.get(o.name, 8 if o.name.startswith('lid_') else 9 if o.name.startswith('wheel_') else 12 if o.name.startswith('cyl_') else 13 if o.name.startswith('jack_') else 0))
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
            if m.name == 'ISK_glass': glass_tree(m, wear)
            elif m.name in ('ISK_white_lens', 'ISK_lens'): lens_tree(m, wear)
            else: paint_tree(m, KIND[m.name], var, wear, seed=hash(m.name) % 17)
