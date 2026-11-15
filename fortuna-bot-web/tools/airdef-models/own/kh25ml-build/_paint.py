# _paint.py — процедурная окраска Х-25МЛ (исполняется после build.py; тот же шейдер потом запекается в атласы, bake2.py).
# Белый корпус и оперение (фото 04, 05): партии краски чуть разного тона, плёнка пыли и разводы по фотомаскам CC0 (ambientCG, Свои/_текстуры_CC0),
# грязь снизу, продольные потёки назад по потоку, сколы только на выпуклых кромках (светлый грунт → металл), царапины, захватанные места у башмаков и лючков,
# копоть вокруг желобов сопел и на крышке хвоста. Швы отсеков, контуры лючков, винты - тёмной линией и рельефом (bump → карта нормалей).
# Свои трафареты (make_decals.py, x25_decals.png) - проекцией с бортов ±X, на обоих бортах. Жёлоб - рыже-бурое жаростойкое покрытие с копотью, сопло - закопчённый металл,
# кольцо купола - хром с захватами. Стекло купола, сетка и оптика не красятся (свои материалы).
import bpy, math, os
_hp = os.path.join(HERE, '..', 'HIMARS', '_paint.py'); _src = open(_hp, encoding='utf-8').read()
exec(_src[_src.index('class G:'):_src.index('def near(')]); exec(_src[_src.index('CC0 = {'):_src.index('def ID_is')])
HD = HERE
WHITE = (0.86, 0.87, 0.88)                  # фото 04: освещённый борт sRGB 230·234·237 (проба 2 с 0,80 дала 216: поднято)
GRIME = (0.40, 0.38, 0.34); DUSTC = (0.62, 0.60, 0.55); SOOT = (0.035, 0.030, 0.027)
PRIMER = (0.56, 0.58, 0.52); ALU = (0.62, 0.63, 0.64)
DEC = []
# трафареты: (строка картинки, a центра, z центра, высота строки м, цвет) - на обоих бортах
TEXTS = [(0, 1.32, 0.040, 0.075, 'k'), (1, 0.955, 0.052, 0.017, 'k'), (2, 0.955, 0.031, 0.017, 'k'),
         (3, 1.725, -0.058, 0.013, 'k'), (9, 1.725, -0.030, 0.034, 'k'), (4, 1.650, 0.086, 0.011, 'k'),
         (5, 2.330, -0.072, 0.012, 'k'), (6, 0.235, 0.004, 0.010, 'r'), (7, 0.235, -0.016, 0.009, 'r'), (8, 2.560, 0.055, 0.011, 'k')]
NROW = 10
TCOL = {'k': (0.025, 0.025, 0.027), 'r': (0.45, 0.025, 0.02)}


def paint_tree(mat, kind, wear=1):
    g = G(mat); w = [0.0, 0.6, 1.0][wear]
    tc = g.n('ShaderNodeTexCoord', _object=bpy.data.objects.get('body')); pos = tc.outputs['Object']
    PS = g.n('ShaderNodeSeparateXYZ', Vector=pos); N = g.n('ShaderNodeSeparateXYZ', Vector=tc.outputs['Normal'])
    X, Yv, Z = PS.outputs['X'], PS.outputs['Y'], PS.outputs['Z']; geo = g.n('ShaderNodeNewGeometry')
    M = g.math
    def L2(a, b): return M('SQRT', M('ADD', M('MULTIPLY', a, a), M('MULTIPLY', b, b)))
    rr = L2(X, Z); ang = M('ARCTAN2', Z, X)
    skin = g.smooth(rr, R + 0.008, R + 0.003)                                                       # обшивка корпуса (не оперение и не выступы)
    def wrap(v): return g.n('ShaderNodeMath', _operation='WRAP', Value=v, Value_001=math.pi, Value_002=-math.pi).outputs[0]
    def near(pt, r):
        d = g.n('ShaderNodeVectorMath', _operation='DISTANCE', Vector=pos, Vector_001=pt).outputs['Value']; return g.smooth(d, r, r * 0.2)
    # ── основа
    if kind == 'body': base = WHITE; rough = 0.42
    elif kind == 'heat': base = (0.13, 0.045, 0.028); rough = 0.78
    elif kind == 'dark': base = (0.035, 0.032, 0.03); rough = 0.70
    elif kind == 'chrome': base = (0.86, 0.86, 0.87); rough = 0.10
    else: base = (0.30, 0.30, 0.30); rough = 0.40                                                   # steel
    col = g.n('ShaderNodeRGB').outputs[0]; col.node.outputs[0].default_value = (*base, 1.0)
    rg = rough; met = 1.0 if kind == 'chrome' else (0.8 if kind == 'steel' else (0.3 if kind == 'dark' else 0.0))
    height = None
    def hadd(h, k):
        nonlocal height
        v = M('MULTIPLY', h, k); height = v if height is None else M('ADD', height, v)
    if kind == 'body':
        # партии краски: отсек/деталь чуть разного тона (по объекту и по отсекам вдоль корпуса)
        orand = g.n('ShaderNodeObjectInfo').outputs['Random']
        sect = g.n('ShaderNodeTexNoise', Vector=g.n('ShaderNodeMapping', Vector=pos, Scale=(0.0, 1.4, 0.0)).outputs['Vector'], Scale=1.0, Detail=0.0).outputs['Fac']
        tone = M('ADD', M('MULTIPLY', orand, 0.5), M('MULTIPLY', sect, 0.5))
        col = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor_Float=1.0, A_Color=col, B_Color=g.ramp(tone, [(0.25, (0.965, 0.97, 0.975)), (0.75, (1.02, 1.015, 1.0))])).outputs[2]
        # плёнка пыли и разводы (CC0), засохшие пятна
        film = g.smooth(M('ADD', M('MULTIPLY', photo(g, 'si3', pos, 1.1, rot=0.4), 0.8), M('MULTIPLY', g.n('ShaderNodeTexNoise', Vector=pos, Scale=2.0, Detail=4.0).outputs['Fac'], 0.7)), 0.30, 1.30)
        col = g.mix(col, DUSTC, M('MULTIPLY', film, 0.12 + 0.10 * w))
        spot = g.smooth(photo(g, 'si13', pos, 0.7, rot=1.1), 0.30, 0.85)
        col = g.mix(col, GRIME, M('MULTIPLY', spot, 0.07 + 0.06 * w)); rg = M('ADD', rg, M('MULTIPLY', M('ADD', film, spot), 0.12))
        # грязь снизу (z < 0), гуще к низу и у кабельного короба
        under = M('MULTIPLY', g.smooth(Z, -0.03, -0.14), g.smooth(g.n('ShaderNodeTexNoise', Vector=pos, Scale=6.0, Detail=6.0, Roughness=0.6).outputs['Fac'], 0.35, 0.65))
        col = g.mix(col, GRIME, M('MULTIPLY', under, 0.28 + 0.2 * w)); rg = M('ADD', rg, M('MULTIPLY', under, 0.15))
        # потёки назад по потоку (вытянутый шум + фотомаска потёков) от швов и лючков
        lk = photo(g, 'lk12', g.n('ShaderNodeMapping', Vector=pos, Scale=(1.0, 0.35, 1.0)).outputs['Vector'], 1.0, blend=0.15, inv=True)
        st = g.n('ShaderNodeTexNoise', Vector=g.n('ShaderNodeMapping', Vector=pos, Scale=(45.0, 0.7, 45.0)).outputs['Vector'], Scale=3.0, Detail=3.0).outputs['Fac']
        streak = g.smooth(M('ADD', M('MULTIPLY', lk, 1.6), M('MULTIPLY', g.smooth(st, 0.60, 0.74), 0.6)), 0.35, 0.9)
        col = g.mix(col, (0.52, 0.50, 0.46), M('MULTIPLY', streak, 0.22 * (0.5 + w)))
        # швы отсеков: тёмная щель + канавка в рельефе
        jl = None
        for a in JOINTS:
            l_ = g.smooth(M('ABSOLUTE', M('SUBTRACT', Yv, YA(a))), 0.0011, 0.0003); jl = l_ if jl is None else M('MAXIMUM', jl, l_)
        jl = M('MULTIPLY', jl, skin)
        jw = None                                                                                   # грязь, набившаяся у швов (полоса 1-2 см, рваная)
        for a in JOINTS:
            l_ = g.smooth(M('ABSOLUTE', M('SUBTRACT', Yv, YA(a))), 0.014, 0.002); jw = l_ if jw is None else M('MAXIMUM', jw, l_)
        jw = M('MULTIPLY', M('MULTIPLY', jw, skin), g.smooth(photo(g, 'si13', pos, 2.5, rot=0.3), 0.2, 0.7))
        col = g.mix(col, GRIME, M('MULTIPLY', jw, 0.22 + 0.12 * w))
        # винты по кольцам стыков (a, число, смещение назад, радиус головки)
        def ring_dots(a, n, off, r, ph=0.5):
            f = M('SUBTRACT', M('FRACT', M('ADD', M('MULTIPLY', ang, n / (2 * math.pi)), ph)), 0.5)
            du = M('MULTIPLY', f, M('MULTIPLY', rr, 2 * math.pi / n)); dy = M('SUBTRACT', Yv, YA(a + off))
            return g.smooth(L2(du, dy), r, r * 0.45)
        sc_ = None
        for a, n, off in ((0.372, 24, 0.012), (0.400, 24, -0.012), (A(145), 16, -0.010), (A(152), 16, 0.010), (A(283), 20, -0.010), (A(288), 20, 0.010),
                          (A(377), 20, 0.010), (3.075, 24, -0.012), (3.559, 16, -0.010), (0.20, 8, 0.0), (0.30, 10, 0.0), (A(463), 18, 0.010)):
            d_ = ring_dots(a, n, off, 0.0036); sc_ = d_ if sc_ is None else M('MAXIMUM', sc_, d_)
        sc_ = M('MULTIPLY', sc_, skin)
        # лючки: контур (и винты по углам у прямоугольных)
        ho = None; hin = None
        for (a0, a1, phc, wd, kd) in HATCHES:
            px = M('SUBTRACT', Yv, YA((a0 + a1) / 2)); py = M('MULTIPLY', rr, wrap(M('SUBTRACT', ang, math.radians(phc))))
            hl, hw = (a1 - a0) / 2, wd / 2
            if kd == 'round': d = M('SUBTRACT', L2(px, py), hw)
            else:
                rc = min(hl, hw) if kd == 'oval' else min(0.012, hl * 0.5, hw * 0.5)
                qx = M('ADD', M('SUBTRACT', M('ABSOLUTE', px), hl), rc); qy = M('ADD', M('SUBTRACT', M('ABSOLUTE', py), hw), rc)
                d = M('SUBTRACT', M('ADD', L2(M('MAXIMUM', qx, 0.0), M('MAXIMUM', qy, 0.0)), M('MINIMUM', M('MAXIMUM', qx, qy), 0.0)), rc)
            o_ = g.smooth(M('ABSOLUTE', d), 0.0011, 0.0003); ho = o_ if ho is None else M('MAXIMUM', ho, o_)
            i_ = g.smooth(d, 0.0, -0.002); hin = i_ if hin is None else M('MAXIMUM', hin, i_)
            if kd == 'rect':
                for sx in (-1, 1):
                    for sy in (-1, 1):
                        cs = g.smooth(L2(M('SUBTRACT', px, sx * (hl - 0.008)), M('SUBTRACT', py, sy * (hw - 0.008))), 0.0032, 0.0014); sc_ = M('MAXIMUM', sc_, M('MULTIPLY', cs, skin))
        ho = M('MULTIPLY', ho, skin); hin = M('MULTIPLY', hin, skin)
        col = g.mix(col, (0.97, 0.975, 0.98), M('MULTIPLY', hin, 0.35))                               # крышки лючков - краска свежее
        col = g.mix(col, (0.22, 0.22, 0.21), M('MULTIPLY', M('MAXIMUM', jl, ho), 0.75))
        col = g.mix(col, (0.62, 0.63, 0.62), M('MULTIPLY', sc_, 0.55))                                 # головки винтов: краска сбита до серого
        hadd(jl, -1.0); hadd(ho, -0.8); hadd(sc_, 0.45); hadd(hin, 0.12)
        # захватанные места: у башмаков, у опор рулей, у лючков (руки техников)
        hand = M('MAXIMUM', near((0, YA(0.52), R), 0.16), near((0, YA(1.65), R), 0.16))
        for phi in ANG: hand = M('MAXIMUM', hand, near(tuple(P(CAN['piv'], R, phi)), 0.07))
        hand = M('MULTIPLY', hand, g.smooth(photo(g, 'si13', pos, 1.7, rot=2.0), 0.25, 0.7))
        col = g.mix(col, (0.46, 0.45, 0.42), M('MULTIPLY', hand, 0.35 * (0.5 + w)))
        # копоть: края желобов, крышка хвоста за желобами, нижние кромки крыльев у корня
        sootm = M('MULTIPLY', M('MULTIPLY', g.smooth(M('ABSOLUTE', X), 0.07, 0.15), g.smooth(M('ABSOLUTE', Z), 0.15, 0.06)), g.smooth(Yv, YA(2.92), YA(3.05)))
        sn = g.n('ShaderNodeTexNoise', Vector=g.n('ShaderNodeMapping', Vector=pos, Scale=(10.0, 1.5, 10.0)).outputs['Vector'], Scale=4.0, Detail=6.0).outputs['Fac']
        col = g.mix(col, SOOT, M('MULTIPLY', M('MULTIPLY', sootm, g.smooth(sn, 0.32, 0.62)), 0.55 + 0.3 * w))
        # трафареты
        if not DEC: DEC.append(bpy.data.images.load(os.path.join(HERE, 'x25_decals.png'), check_existing=True))
        for row, ac, zc, hh, cc in TEXTS:
            ww = hh * 8.0
            u = M('MULTIPLY', M('SUBTRACT', Yv, YA(ac) - ww / 2), 1.0 / ww); v = M('MULTIPLY', M('SUBTRACT', Z, zc - hh / 2), 1.0 / hh)
            ins = M('MULTIPLY', M('MULTIPLY', M('GREATER_THAN', u, 0.0), M('LESS_THAN', u, 1.0)), M('MULTIPLY', M('GREATER_THAN', v, 0.0), M('LESS_THAN', v, 1.0)))
            ins = M('MULTIPLY', M('MULTIPLY', ins, M('GREATER_THAN', M('ABSOLUTE', N.outputs['X']), 0.35)), skin)
            ux = M('ADD', M('MULTIPLY', M('SUBTRACT', u, 0.5), M('SIGN', X)), 0.5)
            cv = g.n('ShaderNodeCombineXYZ', X=ux, Y=M('MULTIPLY', M('ADD', v, NROW - 1 - row), 1.0 / NROW), Z=0.0).outputs['Vector']
            ti = g.n('ShaderNodeTexImage', Vector=cv); ti.image = DEC[0]; ti.extension = 'CLIP'
            tm = M('MULTIPLY', ti.outputs['Alpha'], ins)
            worn = g.smooth(photo(g, 'sc5', pos, 2.2, rot=0.7), 0.45, 0.8)                            # трафарет местами стёрт
            col = g.mix(col, TCOL[cc], M('MULTIPLY', tm, M('SUBTRACT', 0.97, M('MULTIPLY', worn, 0.22))))
        # сколы на выпуклых кромках (рули, крылья, обтекатели): грунт, в глубоких - металл; царапины
        bev = g.n('ShaderNodeBevel', Radius=0.004, _samples=8)
        dp = g.n('ShaderNodeVectorMath', _operation='DOT_PRODUCT', Vector=bev.outputs['Normal'], Vector_001=geo.outputs['Normal']).outputs['Value']
        convex = g.smooth(g.n('ShaderNodeAmbientOcclusion', Distance=0.05, _only_local=True).outputs['AO'], 0.80, 0.97)
        en = photo(g, 'sc3', pos, 1.6, rot=0.3)
        edge = M('MULTIPLY', M('MULTIPLY', g.smooth(dp, 0.985, 0.90), convex), g.smooth(M('ADD', en, M('MULTIPLY', g.n('ShaderNodeTexNoise', Vector=pos, Scale=30.0, Detail=6.0).outputs['Fac'], 0.6)), 0.55, 0.85))
        scr = M('MULTIPLY', g.smooth(photo(g, 'sc3', g.n('ShaderNodeMapping', Vector=pos, Scale=(1.0, 0.25, 1.0)).outputs['Vector'], 1.4, rot=0.0), 0.70, 0.92), 0.35 * w)   # царапины вдоль корпуса (погрузка)
        chip = M('MAXIMUM', M('MULTIPLY', edge, 0.9 * w + 0.2), scr)
        col = g.mix(col, PRIMER, g.smooth(chip, 0.15, 0.4))
        deep = g.smooth(chip, 0.55, 0.8); col = g.mix(col, ALU, deep); met = M('MULTIPLY', deep, 0.85)
        rg = M('ADD', rg, M('MULTIPLY', g.smooth(chip, 0.15, 0.4), 0.15))
        hadd(chip, -0.25)
    elif kind == 'heat':
        # жёлоб: копоть гуще у сопла и по углам, вздутия покрытия, светлая зола полосами назад
        near_n = g.smooth(Yv, YA(3.25), YA(2.97))
        bl = g.smooth(photo(g, 'si13', pos, 1.2, rot=0.5), 0.25, 0.7)
        col = g.mix(col, (0.30, 0.12, 0.06), M('MULTIPLY', bl, 0.45))
        ao = g.n('ShaderNodeAmbientOcclusion', Distance=0.03).outputs['AO']
        col = g.mix(col, SOOT, M('MAXIMUM', M('MULTIPLY', near_n, 0.8), M('MULTIPLY', g.smooth(M('SUBTRACT', 1.0, ao), 0.1, 0.5), 0.7)))
        ash = g.smooth(g.n('ShaderNodeTexNoise', Vector=g.n('ShaderNodeMapping', Vector=pos, Scale=(30.0, 0.8, 30.0)).outputs['Vector'], Scale=3.0, Detail=4.0).outputs['Fac'], 0.62, 0.74)
        col = g.mix(col, (0.36, 0.30, 0.26), M('MULTIPLY', ash, 0.35)); hadd(bl, 0.4)
    elif kind == 'dark':
        tint = g.smooth(g.n('ShaderNodeTexNoise', Vector=pos, Scale=40.0, Detail=4.0).outputs['Fac'], 0.4, 0.7)
        col = g.mix(col, (0.10, 0.07, 0.05), M('MULTIPLY', tint, 0.6))
    elif kind == 'chrome':
        smudge = g.smooth(photo(g, 'si13', pos, 3.0, rot=0.9), 0.3, 0.7)
        rg = M('ADD', 0.08, M('MULTIPLY', smudge, 0.25)); col = g.mix(col, (0.62, 0.60, 0.56), M('MULTIPLY', smudge, 0.25))
        hadd(g.smooth(photo(g, 'sc5', pos, 4.0, rot=0.2), 0.6, 0.9), 0.3)
    else:   # steel
        wr = g.smooth(photo(g, 'sc3', pos, 3.0), 0.5, 0.85)
        col = g.mix(col, (0.55, 0.55, 0.53), M('MULTIPLY', wr, 0.6)); col = g.mix(col, (0.12, 0.09, 0.07), M('MULTIPLY', g.smooth(photo(g, 'si13', pos, 2.0), 0.4, 0.7), 0.4))
    # затенение в углах (мягкое)
    ao2 = g.n('ShaderNodeAmbientOcclusion', Distance=0.04).outputs['AO']
    col = g.mix(col, (0.10, 0.10, 0.10) if kind == 'body' else SOOT, M('MULTIPLY', g.smooth(M('SUBTRACT', 1.0, ao2), 0.05, 0.6), 0.35))
    # мелкая шагрень краски
    peel = g.n('ShaderNodeTexNoise', Vector=pos, Scale=900.0, Detail=1.0).outputs['Fac']; hadd(peel, 0.05)
    bev2 = g.n('ShaderNodeBevel', Radius=0.0025, _samples=8)
    bump = g.n('ShaderNodeBump', Strength=0.35, Distance=0.0007, Height=height, Normal=bev2.outputs['Normal'])
    bs = g.n('ShaderNodeBsdfPrincipled', **{'Base Color': col, 'Roughness': rg if not isinstance(rg, float) else rg, 'Metallic': met, 'Normal': bump.outputs['Normal'],
                                            'Coat Weight': 0.08 if kind == 'body' else 0.0, 'Coat Roughness': 0.2})
    g.n('ShaderNodeOutputMaterial', Surface=bs.outputs['BSDF'])


KIND = {'X25_body': 'body', 'X25_heat': 'heat', 'X25_dark': 'dark', 'X25_chrome': 'chrome', 'X25_steel': 'steel'}


def apply_paint(wear=1):
    for m in bpy.data.materials:
        if m.name in KIND: paint_tree(m, KIND[m.name], wear)
