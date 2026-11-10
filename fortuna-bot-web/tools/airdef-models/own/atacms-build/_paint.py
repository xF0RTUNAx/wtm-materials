# _paint.py — процедурная окраска ATACMS (фото 01): песочный корпус и рули, чёрная полуглянцевая головная часть с белыми трафаретами,
# ряды заклёпок по верху и низу корпуса, восемь серых прямоугольников внизу, надпись на кормовом отсеке, стёртые кромки, копоть у сопла.
# Шейдер считает всё в осях объекта (Y вдоль ракеты, нос +Y; трафареты с обоих бортов ±X). Потом тот же шейдер запекается в атлас.
import bpy, math, os
_src = open(os.path.join(HERE, '..', 'HIMARS', '_paint.py'), encoding='utf-8').read(); exec(_src[_src.index('class G:'):_src.index('def glass_tree')])

SAND = (0.62, 0.48, 0.16)              # фото 01: среднее sRGB 175·155·103 (проба 1 с 0,45·0,35·0,15 вышла темнее: 149·134·100)
BLACK = (0.008, 0.008, 0.009)
SX = 4.23 / 1604
def PY(x): return (x - 949) * SX       # x пикселя фото 01 → Y модели
def PZ(y): return -(y - 516) * SX      # y пикселя фото 01 → Z модели
_DEC = []


def side_uv(g, P, N, yc, zc, w, h):
    """плоская проекция с бортов ±X: u вдоль Y, v по Z; маска — грань смотрит вбок"""
    u = g.math('MULTIPLY', g.math('SUBTRACT', P.outputs['Y'], yc - w / 2), 1.0 / w)
    v = g.math('MULTIPLY', g.math('SUBTRACT', P.outputs['Z'], zc - h / 2), 1.0 / h)
    inside = g.math('MULTIPLY', g.math('MULTIPLY', g.math('GREATER_THAN', u, 0.0), g.math('LESS_THAN', u, 1.0)), g.math('MULTIPLY', g.math('GREATER_THAN', v, 0.0), g.math('LESS_THAN', v, 1.0)))
    face = g.math('GREATER_THAN', g.math('ABSOLUTE', N.outputs['X']), 0.35)
    return u, v, g.math('MULTIPLY', inside, face)


def text(g, P, N, yc, zc, w, h, row, vert=False):
    if not _DEC: _DEC.append(bpy.data.images.load(os.path.join(HERE, 'ata_decals.png'), check_existing=True))
    if vert:                                                                                          # столбцом: читается сверху вниз, верх букв к носу (фото 01, кормовой отсек)
        u_, v_, m = side_uv(g, P, N, yc, zc, h, w)
        u = g.math('SUBTRACT', 1.0, v_); v = u_
    else: u, v, m = side_uv(g, P, N, yc, zc, w, h)
    rr = g.math('SQRT', g.math('ADD', g.math('MULTIPLY', P.outputs['X'], P.outputs['X']), g.math('MULTIPLY', P.outputs['Z'], P.outputs['Z'])))
    m = g.math('MULTIPLY', m, g.math('LESS_THAN', rr, 0.316))                                         # только обшивка, не рули
    ux = g.math('ADD', g.math('MULTIPLY', g.math('SUBTRACT', u, 0.5), g.math('SIGN', P.outputs['X'])), 0.5)        # на левом борту не зеркально
    cv = g.n('ShaderNodeCombineXYZ', X=ux, Y=g.math('MULTIPLY', g.math('ADD', v, 3 - row), 0.25), Z=0.0).outputs['Vector']
    ti = g.n('ShaderNodeTexImage', Vector=cv); ti.image = _DEC[0]; ti.extension = 'CLIP'
    return g.math('MULTIPLY', ti.outputs['Alpha'], m)


def dots(g, P, N, y0, y1, step, z, r):
    """ряд заклёпок вдоль Y на высоте z (оба борта)"""
    f = g.math('SUBTRACT', g.math('FRACT', g.math('DIVIDE', g.math('SUBTRACT', P.outputs['Y'], y0), step)), 0.5)
    dy = g.math('MULTIPLY', f, step); dz = g.math('SUBTRACT', P.outputs['Z'], z)
    d = g.math('SQRT', g.math('ADD', g.math('MULTIPLY', dy, dy), g.math('MULTIPLY', dz, dz)))
    inr = g.math('MULTIPLY', g.math('GREATER_THAN', P.outputs['Y'], y0 - step / 2), g.math('LESS_THAN', P.outputs['Y'], y1 + step / 2))
    return g.math('MULTIPLY', g.math('MULTIPLY', g.smooth(d, r, r * 0.6), inr), g.math('GREATER_THAN', g.math('ABSOLUTE', N.outputs['X']), 0.2))


def paint_tree(mat, kind, wear=1):
    g = G(mat); tc = g.n('ShaderNodeTexCoord', _object=bpy.data.objects.get('body')); P = g.n('ShaderNodeSeparateXYZ', Vector=tc.outputs['Object']); N = g.n('ShaderNodeSeparateXYZ', Vector=tc.outputs['Normal'])
    o = tc.outputs['Object']; geo = g.n('ShaderNodeNewGeometry')
    if kind == 'body':
        base = g.n('ShaderNodeRGB').outputs[0]; base.node.outputs[0].default_value = (*SAND, 1.0); rough = 0.62
    elif kind == 'head':
        base = g.n('ShaderNodeRGB').outputs[0]; base.node.outputs[0].default_value = (*BLACK, 1.0); rough = 0.45
    else:
        b0 = KEEP[mat.name]; base = g.n('ShaderNodeRGB').outputs[0]; base.node.outputs[0].default_value = (*b0[0], 1.0); rough = b0[1]
    col = base
    pv = g.n('ShaderNodeTexNoise', Vector=o, Scale=1.6, Detail=4.0).outputs['Fac']                      # неровность краски
    col = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor_Float=0.35, A_Color=col, B_Color=g.ramp(pv, [(0.3, (0.90, 0.90, 0.88)), (0.7, (1.07, 1.05, 1.02))])).outputs[2]
    if kind == 'body':
        holes = None
        for z in (PZ(440), PZ(610)): h_ = dots(g, P, N, PY(410), PY(905), 31 * SX, z, 0.0085); holes = h_ if holes is None else g.math('MAXIMUM', holes, h_)
        for z in (PZ(456), PZ(472)): holes = g.math('MAXIMUM', holes, dots(g, P, N, PY(400), PY(540), 31 * SX, z, 0.0085))
        col = g.mix(col, (0.02, 0.018, 0.015), g.math('MULTIPLY', holes, 0.9))
        # восемь серых прямоугольников внизу
        f = g.math('SUBTRACT', g.math('FRACT', g.math('ADD', g.math('DIVIDE', g.math('SUBTRACT', P.outputs['Y'], PY(460)), 63 * SX), 0.5)), 0.5)
        rect = g.math('LESS_THAN', g.math('ABSOLUTE', g.math('MULTIPLY', f, 63 * SX)), 0.026)
        rect = g.math('MULTIPLY', rect, g.math('MULTIPLY', g.math('GREATER_THAN', P.outputs['Z'], PZ(600)), g.math('LESS_THAN', P.outputs['Z'], PZ(562))))
        rect = g.math('MULTIPLY', rect, g.math('MULTIPLY', g.math('GREATER_THAN', P.outputs['Y'], PY(440)), g.math('LESS_THAN', P.outputs['Y'], PY(922))))
        rect = g.math('MULTIPLY', rect, g.math('GREATER_THAN', g.math('ABSOLUTE', N.outputs['X']), 0.3))
        col = g.mix(col, (0.24, 0.25, 0.26), rect)
        col = g.mix(col, (0.02, 0.018, 0.015), g.math('MULTIPLY', text(g, P, N, PY(262), PZ(505), 0.26, 0.045, 3, vert=True), 0.9))     # надпись на кормовом отсеке
    if kind == 'head':
        t = g.math('MAXIMUM', text(g, P, N, PY(1030), PZ(482), 0.30, 0.05, 0), text(g, P, N, PY(1030), PZ(499), 0.22, 0.045, 1))
        t = g.math('MAXIMUM', t, g.math('MAXIMUM', text(g, P, N, PY(1235), PZ(504), 0.22, 0.045, 2), text(g, P, N, PY(1235), PZ(518), 0.20, 0.04, 1)))
        col = g.mix(col, (0.62, 0.62, 0.60), g.math('MULTIPLY', t, 0.92))
    # стёртые кромки и пыль
    bev = g.n('ShaderNodeBevel', Radius=0.006, _samples=10)
    dp = g.n('ShaderNodeVectorMath', _operation='DOT_PRODUCT', Vector=bev.outputs['Normal'], Vector_001=geo.outputs['Normal']).outputs['Value']
    en = g.n('ShaderNodeTexNoise', Vector=o, Scale=22.0, Detail=5.0).outputs['Fac']
    edge = g.math('MULTIPLY', g.smooth(dp, 0.985, 0.90), g.smooth(en, 0.4, 0.7))
    if kind == 'body': col = g.mix(col, (0.58, 0.50, 0.33), g.math('MULTIPLY', edge, 0.8 * wear))
    if kind == 'head': col = g.mix(col, (0.12, 0.115, 0.10), g.math('MULTIPLY', edge, 0.6 * wear))
    ao = g.n('ShaderNodeAmbientOcclusion', Distance=0.08).outputs['AO']
    col = g.mix(col, (0.02, 0.018, 0.014), g.math('MULTIPLY', g.smooth(g.math('SUBTRACT', 1.0, ao, clamp=True), 0.05, 0.6), 0.55))
    # пятна от рук и строп, лёгкая грязь (ракета грузится краном и руками), продольные потёртости
    sm = g.n('ShaderNodeTexNoise', Vector=o, Scale=5.0, Detail=8.0, Roughness=0.6).outputs['Fac']
    if kind == 'body': col = g.mix(col, (0.16, 0.13, 0.08), g.math('MULTIPLY', g.smooth(sm, 0.60, 0.78), 0.45))
    if kind == 'head': col = g.mix(col, (0.06, 0.06, 0.055), g.math('MULTIPLY', g.smooth(sm, 0.58, 0.78), 0.6))
    lm = g.n('ShaderNodeMapping', Vector=o, Scale=(40.0, 0.8, 40.0))
    ls = g.smooth(g.n('ShaderNodeTexNoise', Vector=lm.outputs['Vector'], Scale=3.0, Detail=2.0).outputs['Fac'], 0.66, 0.72)
    if kind == 'body': col = g.mix(col, (0.55, 0.47, 0.30), g.math('MULTIPLY', ls, 0.25))
    if kind == 'head': col = g.mix(col, (0.10, 0.10, 0.095), g.math('MULTIPLY', ls, 0.35))
    # копоть у сопла
    soot = g.math('SUBTRACT', 1.0, g.smooth(P.outputs['Y'], -2.11, -1.85), clamp=True)
    col = g.mix(col, (0.025, 0.022, 0.02), g.math('MULTIPLY', soot, 0.35 * wear))
    pn = g.n('ShaderNodeTexNoise', Vector=o, Scale=320.0, Detail=2.0).outputs['Fac']
    bump = g.n('ShaderNodeBump', Strength=0.03, Distance=0.001, Height=pn, Normal=bev.outputs['Normal'])
    rg = g.math('ADD', rough, g.math('MULTIPLY', g.math('SUBTRACT', pv, 0.5), 0.12))
    bs = g.n('ShaderNodeBsdfPrincipled', **{'Base Color': col, 'Roughness': rg, 'Normal': bump.outputs['Normal'], 'Metallic': 0.7 if kind == 'steel' else 0.0,
                                            'Coat Weight': 0.12 if kind == 'head' else 0.0, 'Coat Roughness': 0.15})
    g.n('ShaderNodeOutputMaterial', Surface=bs.outputs['BSDF'])


KIND = {'ATA_body': 'body', 'ATA_head': 'head', 'ATA_dark': 'keep', 'ATA_steel': 'steel', 'ATA_white': 'keep', 'ATA_grey': 'keep'}
KEEP = {}


def apply_paint(wear=1):
    for m in bpy.data.materials:
        if m.name in KIND:
            if m.name not in KEEP:
                b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); KEEP[m.name] = (tuple(b.inputs['Base Color'].default_value[:3]), b.inputs['Roughness'].default_value)
            paint_tree(m, KIND[m.name], wear)
