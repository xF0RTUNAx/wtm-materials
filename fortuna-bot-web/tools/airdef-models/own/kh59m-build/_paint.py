# _paint.py - процедурная окраска Х-59М (исполняется после build.py; тот же шейдер потом запекается в атласы, bake2.py).
# Некрашеный металл (фото 02, 05): отсеки и крышки лючков чуть разного тона и блеска, продольная шлифовка, пятна окисла и захватанные места,
# плёнка пыли и разводы по фотомаскам CC0 (ambientCG, Свои/_текстуры_CC0), грязь снизу, потёки назад по потоку, копоть за соплом двигателя
# (низ хвостовой части, купол антенны снизу, гондола у сопла). Швы отсеков, контуры лючков, заклёпки по стыкам, вокруг больших лючков
# и рядами на крыльях (чертёж 04) - тёмной линией и рельефом (bump → карта нормалей). Кромки рулей и крыльев затёрты до блеска.
# Свои трафареты (make_decals.py, x59_decals.png) - цилиндрической проекцией по борту, читаются слева направо на обоих бортах.
# Сопло - побежалая сталь с копотью, задний купол антенны - серая краска по диэлектрику. Стекло, оптика, провода не красятся (свои материалы).
import bpy, math, os
_hp = os.path.join(HERE, '..', 'HIMARS', '_paint.py'); _src = open(_hp, encoding='utf-8').read()
exec(_src[_src.index('class G:'):_src.index('def near(')]); exec(_src[_src.index('CC0 = {'):_src.index('def ID_is')])
HD = HERE
METAL = (0.60, 0.61, 0.63)                  # основа: некрашеный сплав (сверка медианы борта с фото 05 - в _trial.py)
GRIME = (0.30, 0.29, 0.27); DUSTC = (0.56, 0.55, 0.52); SOOT = (0.030, 0.027, 0.025); OXID = (0.44, 0.45, 0.46)
DEC = []
# трафареты: (строка картинки, a центра от носа м, φ центра, высота строки м, цвет, борт): 'L' - левый борт (−X, φ около 180), 'R' - правый (φ около 0), 'B' - оба (φ левого → 180 − φ)
#   строка 8:1 по ширине; длинный текст занимает всю ширину строки и получается ниже высоты строки
TEXTS = [(0, 0.66, 160.0, 0.056, 'k', 'B'), (1, 0.95, 203.0, 0.034, 'k', 'B'),
         (2, 1.03, 150.0, 0.026, 'k', 'L'), (3, 1.03, 157.5, 0.022, 'k', 'L'),
         (5, 2.30, 181.0, 0.034, 'k', 'B'), (4, 2.30, 190.0, 0.024, 'k', 'B'), (6, 2.45, 117.0, 0.020, 'k', 'B'),
         (7, A(181.5), 180.0, 0.062, 'k', 'L'), (8, A(392) - 0.075, 158.0, 0.040, 'k', 'L'), (9, (A(279) + A(316)) / 2, 0.0, 0.064, 'k', 'R'),
         (10, 3.20, 203.0, 0.022, 'k', 'B'), (11, 3.86, 178.0, 0.024, 'k', 'B'),
         (12, 0.26, 200.0, 0.024, 'r', 'B'), (13, 3.02, 214.0, 0.030, 'r', 'B')]
NROW = 14
TCOL = {'k': (0.020, 0.020, 0.022), 'r': (0.42, 0.025, 0.02)}
# лючки: (a0, a1, φ центра, ширина по дуге м, вид) - левый борт по виду 2 чертежа 04 (нос слева), правый по виду с носом справа (x_полёт = 566 − x);
#   'riv' - прямоугольный с заклёпками по контуру, 'rect' - с винтами по углам, 'round', 'oval'
HATCHES = [(A(118), A(126), 146.0, 0.035, 'rect'), (A(143), A(151), 137.0, 0.035, 'rect'), (A(104), A(109), 219.0, 0.026, 'round'),
           (A(163), A(200), 180.0, 0.200, 'riv'), (A(316), A(320), 180.0, 0.014, 'round'), (A(354), A(362), 236.0, 0.045, 'rect'),
           (A(389), A(396), 158.0, 0.030, 'round'), (A(427), A(463), 180.0, 0.170, 'riv'),
           (A(279), A(316), 0.0, 0.130, 'riv'), (A(204), A(226), 30.0, 0.090, 'riv'), (A(166), A(191), -5.0, 0.120, 'oval'),
           (A(121), A(141), 45.0, 0.060, 'rect'), (A(408), A(414), -10.0, 0.026, 'round'), (A(433), A(464), 0.0, 0.160, 'riv')]
RIVJ = [A(x) for x in (92, 113, 155, 225, 300, 326, 347, 360, 380, 426, 470, 480)]          # стыки с кольцами заклёпок по обе стороны
NOZ = (0.0, YA(ENG['a1']), ENG['z'])                                                      # срез сопла двигателя (точка пламени)


def paint_tree(mat, kind, wear=1):
    g = G(mat); w = [0.0, 0.6, 1.0][wear]
    tc = g.n('ShaderNodeTexCoord', _object=bpy.data.objects.get('body')); pos = tc.outputs['Object']
    PS = g.n('ShaderNodeSeparateXYZ', Vector=pos)
    X, Yv, Z = PS.outputs['X'], PS.outputs['Y'], PS.outputs['Z']; geo = g.n('ShaderNodeNewGeometry')
    M = g.math
    def L2(a, b): return M('SQRT', M('ADD', M('MULTIPLY', a, a), M('MULTIPLY', b, b)))
    rr = L2(X, Z); ang = M('ARCTAN2', Z, X)
    skin = M('MULTIPLY', g.smooth(rr, R + 0.008, R + 0.003), g.smooth(rr, R - 0.010, R - 0.005))      # обшивка корпуса (не оперение, не выступы, не купол)
    Ze = M('SUBTRACT', Z, ENG['z']); rre = L2(X, Ze); ange = M('ARCTAN2', Ze, X)                  # гондола двигателя - своя ось
    pod = M('MULTIPLY', g.smooth(rre, ENG['r'] + 0.006, ENG['r'] + 0.002), g.smooth(rre, ENG['r'] - 0.012, ENG['r'] - 0.006))
    pod = M('MULTIPLY', pod, M('MULTIPLY', g.smooth(Yv, YA(ENG['a0']) + 0.01, YA(ENG['a0']) - 0.02), g.smooth(Yv, YA(ENG['a1']) - 0.01, YA(ENG['a1']) + 0.02)))
    def wrap(v): return g.n('ShaderNodeMath', _operation='WRAP', Value=v, Value_001=math.pi, Value_002=-math.pi).outputs[0]
    def near(pt, r, k=0.2):
        d = g.n('ShaderNodeVectorMath', _operation='DISTANCE', Vector=pos, Vector_001=pt).outputs['Value']; return g.smooth(d, r, r * k)
    def stepsum(edges, vals):
        """ступенчатая функция вдоль корпуса: vals[i] между edges[i-1] и edges[i] (от носа к хвосту)"""
        out = None; prev = 0.0
        for a, v in zip(edges, vals):
            s = M('MULTIPLY', M('LESS_THAN', Yv, YA(a)), v - prev); prev = v; out = s if out is None else M('ADD', out, s)
        return out
    # ── основа
    if kind == 'body': base = METAL; rough = 0.26
    elif kind == 'radome': base = (0.40, 0.41, 0.40); rough = 0.62
    elif kind == 'heat': base = (0.20, 0.17, 0.15); rough = 0.55
    elif kind == 'dark': base = (0.030, 0.028, 0.027); rough = 0.70
    else: base = (0.34, 0.34, 0.34); rough = 0.38                                                 # steel
    col = g.n('ShaderNodeRGB').outputs[0]; col.node.outputs[0].default_value = (*base, 1.0)
    rg = rough; met = {'body': 0.85, 'radome': 0.0, 'heat': 0.8, 'dark': 0.0}.get(kind, 0.85)
    height = None
    def hadd(h, k):
        nonlocal height
        v = M('MULTIPLY', h, k); height = v if height is None else M('ADD', height, v)
    if kind == 'body':
        orand = g.n('ShaderNodeObjectInfo').outputs['Random']
        fin = M('MULTIPLY', g.smooth(rr, R + 0.012, R + 0.025), g.smooth(rre, ENG['r'] + 0.004, ENG['r'] + 0.012))   # рули, крылья, элероны
        # отсеки разного тона и блеска (листы из разных партий, фото 05: голова светлее, середина темнее); гондола и оперение - по объекту
        edges = [A(x) for x in (52.5, 92, 113, 155, 225, 300, 347, 380, 426, 497, 600)]
        tone = stepsum(edges, [0.55, 0.35, 0.62, 0.40, 0.70, 0.30, 0.58, 0.45, 0.66, 0.38, 0.5])
        tone = M('ADD', M('MULTIPLY', tone, M('SUBTRACT', 1.0, fin)), M('MULTIPLY', orand, fin))
        col = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor_Float=1.0, A_Color=col,
                  B_Color=g.ramp(tone, [(0.25, (0.84, 0.85, 0.865)), (0.75, (1.10, 1.10, 1.095))])).outputs[2]
        rg = M('ADD', rg, M('MULTIPLY', M('SUBTRACT', tone, 0.5), -0.16))
        # продольная шлифовка (вытянутый вдоль корпуса шум): чуть разный блеск полосами
        brush = g.n('ShaderNodeTexNoise', Vector=g.n('ShaderNodeMapping', Vector=pos, Scale=(260.0, 2.0, 260.0)).outputs['Vector'], Scale=4.0, Detail=3.0).outputs['Fac']
        rg = M('ADD', rg, M('MULTIPLY', M('SUBTRACT', brush, 0.5), 0.16)); hadd(brush, 0.04)
        col = g.mix(col, (0.66, 0.67, 0.69), M('MULTIPLY', g.smooth(brush, 0.5, 0.8), 0.25))
        # пятна окисла и тусклые места (матовее, темнее), плёнка пыли и разводы
        ox = g.smooth(photo(g, 'si13', pos, 0.8, rot=1.1), 0.30, 0.85)
        col = g.mix(col, OXID, M('MULTIPLY', ox, 0.30 + 0.15 * w)); rg = M('ADD', rg, M('MULTIPLY', ox, 0.16))
        film = g.smooth(M('ADD', M('MULTIPLY', photo(g, 'si3', pos, 1.1, rot=0.4), 0.8), M('MULTIPLY', g.n('ShaderNodeTexNoise', Vector=pos, Scale=2.0, Detail=4.0).outputs['Fac'], 0.7)), 0.30, 1.30)
        col = g.mix(col, DUSTC, M('MULTIPLY', film, 0.18 + 0.12 * w)); rg = M('ADD', rg, M('MULTIPLY', film, 0.14)); met = M('SUBTRACT', 0.85, M('MULTIPLY', film, 0.25))
        # грязь снизу, гуще у кабельного короба и пилона
        under = M('MULTIPLY', g.smooth(Z, -0.03, -0.15), g.smooth(g.n('ShaderNodeTexNoise', Vector=pos, Scale=6.0, Detail=6.0, Roughness=0.6).outputs['Fac'], 0.35, 0.65))
        under = M('MULTIPLY', under, M('SUBTRACT', 1.0, M('MULTIPLY', fin, 0.6)))
        col = g.mix(col, GRIME, M('MULTIPLY', under, 0.30 + 0.2 * w)); rg = M('ADD', rg, M('MULTIPLY', under, 0.18))
        # потёки назад по потоку
        lk = photo(g, 'lk12', g.n('ShaderNodeMapping', Vector=pos, Scale=(1.0, 0.35, 1.0)).outputs['Vector'], 1.0, blend=0.15, inv=True)
        st = g.n('ShaderNodeTexNoise', Vector=g.n('ShaderNodeMapping', Vector=pos, Scale=(45.0, 0.7, 45.0)).outputs['Vector'], Scale=3.0, Detail=3.0).outputs['Fac']
        streak = g.smooth(M('ADD', M('MULTIPLY', lk, 1.6), M('MULTIPLY', g.smooth(st, 0.60, 0.74), 0.6)), 0.35, 0.9)
        streak = M('MULTIPLY', streak, M('SUBTRACT', 1.0, M('MULTIPLY', fin, 0.8)))                       # на плоском оперении маски потёков тянутся штриховкой
        col = g.mix(col, (0.40, 0.40, 0.39), M('MULTIPLY', streak, 0.20 * (0.5 + w)))
        # копоть за соплом: низ хвостовой части (струя идёт назад под корпусом), гондола у среза сопла
        aft = M('MULTIPLY', g.smooth(Yv, NOZ[1] + 0.25, NOZ[1] - 0.15), g.smooth(Yv, YA(5.25), YA(4.35)))
        sootj = M('MULTIPLY', M('MULTIPLY', aft, g.smooth(Z, -0.02, -0.14)), g.smooth(M('ADD', st, M('MULTIPLY', photo(g, 'si13', pos, 1.3, rot=0.2), 0.6)), 0.25, 0.85))
        sootj = M('MULTIPLY', sootj, M('SUBTRACT', 1.0, fin))                                             # струя идёт под корпусом - на крылья копоть не ложится
        sootj = M('MAXIMUM', sootj, M('MULTIPLY', near(NOZ, 0.20, 0.1), g.smooth(photo(g, 'si3', pos, 1.8, rot=0.9), 0.15, 0.6)))
        col = g.mix(col, SOOT, M('MULTIPLY', sootj, 0.65 + 0.3 * w)); rg = M('ADD', rg, M('MULTIPLY', sootj, 0.30)); met = M('SUBTRACT', met, M('MULTIPLY', sootj, 0.5))
        # швы отсеков: тёмная щель + канавка
        jl = None; jw = None
        for a in JOINTS[1:-1]:
            l_ = g.smooth(M('ABSOLUTE', M('SUBTRACT', Yv, YA(a))), 0.0011, 0.0003); jl = l_ if jl is None else M('MAXIMUM', jl, l_)
            l2 = g.smooth(M('ABSOLUTE', M('SUBTRACT', Yv, YA(a))), 0.014, 0.002); jw = l2 if jw is None else M('MAXIMUM', jw, l2)
        jl = M('MULTIPLY', jl, skin)
        for a in (ENG['ast'], ENG['a0'] + 0.10):                                                    # стыки гондолы
            l_ = g.smooth(M('ABSOLUTE', M('SUBTRACT', Yv, YA(a))), 0.0011, 0.0003); jl = M('MAXIMUM', jl, M('MULTIPLY', l_, pod))
        jw = M('MULTIPLY', M('MULTIPLY', jw, skin), g.smooth(photo(g, 'si13', pos, 2.5, rot=0.3), 0.2, 0.7))
        col = g.mix(col, GRIME, M('MULTIPLY', jw, 0.22 + 0.12 * w))
        # заклёпки: кольца по обе стороны стыков (корпус и гондола)
        def ring_dots(yc, n, r, aa, rad, ph=0.5):
            f = M('SUBTRACT', M('FRACT', M('ADD', M('MULTIPLY', aa, n / (2 * math.pi)), ph)), 0.5)
            du = M('MULTIPLY', f, M('MULTIPLY', rad, 2 * math.pi / n)); dy = M('SUBTRACT', Yv, yc)
            return g.smooth(L2(du, dy), r, r * 0.45)
        sc_ = None
        for a in RIVJ:
            for off in (-0.009, 0.009):
                d_ = ring_dots(YA(a + off), 64, 0.0019, ang, rr); sc_ = d_ if sc_ is None else M('MAXIMUM', sc_, d_)
        sc_ = M('MULTIPLY', sc_, skin)
        pr = None
        for a in (ENG['ast'] - 0.008, ENG['ast'] + 0.008, ENG['a0'] + 0.092, ENG['a0'] + 0.108):
            d_ = ring_dots(YA(a), 48, 0.0018, ange, rre); pr = d_ if pr is None else M('MAXIMUM', pr, d_)
        sc_ = M('MAXIMUM', sc_, M('MULTIPLY', pr, pod))
        # заклёпки рядами на крыльях (параллельно передней кромке, чертёж 04) и колонка у задней кромки
        sw = (A(470) - A(365)) / (S45(113.6) - S45(152.0)); q = M('ADD', Yv, M('MULTIPLY', rr, sw))       # q постоянно вдоль линии, параллельной кромке
        q0 = YA(A(365)) + sw * S45(152.0)
        wr = None
        for k in (0.06, 0.16, 0.28, 0.42, 0.58):
            band = M('MULTIPLY', M('SUBTRACT', q, q0 - k * math.sqrt(1 + sw * sw)), 1 / math.sqrt(1 + sw * sw))
            d_ = L2(band, M('MULTIPLY', M('SUBTRACT', M('FRACT', M('MULTIPLY', rr, 1 / 0.022)), 0.5), 0.022))
            d_ = g.smooth(d_, 0.0020, 0.0009); wr = d_ if wr is None else M('MAXIMUM', wr, d_)
        tecol = g.smooth(L2(M('SUBTRACT', Yv, YA(A(487))), M('MULTIPLY', M('SUBTRACT', M('FRACT', M('MULTIPLY', rr, 1 / 0.020)), 0.5), 0.020)), 0.0020, 0.0009)
        wr = M('MAXIMUM', wr, tecol)
        wingz = M('MULTIPLY', fin, M('MULTIPLY', M('LESS_THAN', Yv, YA(A(355))), M('LESS_THAN', q, q0 + 0.01)))
        sc_ = M('MAXIMUM', sc_, M('MULTIPLY', M('MULTIPLY', wr, wingz), g.smooth(rr, R + 0.03, R + 0.045)))
        # лючки: контур, крышка другого тона, винты по углам ('rect') или заклёпки по контуру ('riv')
        ho = None; hin = None; htone = None
        for i, (a0, a1, phc, wd, kd) in enumerate(HATCHES):
            px = M('SUBTRACT', Yv, YA((a0 + a1) / 2)); py = M('MULTIPLY', rr, wrap(M('SUBTRACT', ang, math.radians(phc))))
            hl, hw = (a1 - a0) / 2, wd / 2
            if kd == 'round': d = M('SUBTRACT', L2(px, py), hw)
            else:
                rc = min(hl, hw) if kd == 'oval' else min(0.010, hl * 0.4, hw * 0.4)
                qx = M('ADD', M('SUBTRACT', M('ABSOLUTE', px), hl), rc); qy = M('ADD', M('SUBTRACT', M('ABSOLUTE', py), hw), rc)
                d = M('SUBTRACT', M('ADD', L2(M('MAXIMUM', qx, 0.0), M('MAXIMUM', qy, 0.0)), M('MINIMUM', M('MAXIMUM', qx, qy), 0.0)), rc)
            o_ = g.smooth(M('ABSOLUTE', d), 0.0011, 0.0003); ho = o_ if ho is None else M('MAXIMUM', ho, o_)
            i_ = g.smooth(d, 0.0, -0.002); hin = i_ if hin is None else M('MAXIMUM', hin, i_)
            t_ = M('MULTIPLY', i_, (i * 0.37) % 1.0); htone = t_ if htone is None else M('MAXIMUM', htone, t_)
            if kd == 'rect':
                for sx in (-1, 1):
                    for sy in (-1, 1):
                        cs = g.smooth(L2(M('SUBTRACT', px, sx * (hl - 0.007)), M('SUBTRACT', py, sy * (hw - 0.007))), 0.0030, 0.0013); sc_ = M('MAXIMUM', sc_, M('MULTIPLY', cs, skin))
            elif kd == 'riv':                                                                        # заклёпки по контуру, шаг 18 мм, в 8 мм от края
                pitch = 0.018
                def dots(u, v, lim_u, lim_v):
                    band = M('SUBTRACT', M('ABSOLUTE', u), lim_u)
                    along = M('MULTIPLY', M('SUBTRACT', M('FRACT', M('ADD', M('MULTIPLY', v, 1 / pitch), 0.5)), 0.5), pitch)
                    inside = M('LESS_THAN', M('ABSOLUTE', v), lim_v + 0.002)
                    return M('MULTIPLY', g.smooth(L2(band, along), 0.0019, 0.0008), inside)
                rv = M('MAXIMUM', dots(px, py, hl - 0.008, hw - 0.008), dots(py, px, hw - 0.008, hl - 0.008))
                sc_ = M('MAXIMUM', sc_, M('MULTIPLY', rv, skin))
        ho = M('MULTIPLY', ho, skin); hin = M('MULTIPLY', hin, skin); htone = M('MULTIPLY', htone, skin)
        col = g.mix(col, (0.70, 0.71, 0.72), M('MULTIPLY', htone, 0.45))                              # крышки лючков - другой лист, светлее
        rg = M('ADD', rg, M('MULTIPLY', htone, -0.06))
        col = g.mix(col, (0.16, 0.16, 0.16), M('MULTIPLY', M('MAXIMUM', jl, ho), 0.80))
        col = g.mix(col, (0.74, 0.75, 0.76), M('MULTIPLY', sc_, 0.45)); rg = M('ADD', rg, M('MULTIPLY', sc_, 0.10))   # головки заклёпок - светлее, матовее
        hadd(jl, -1.0); hadd(ho, -0.8); hadd(sc_, 0.40); hadd(hin, 0.10)
        # захватанные места: у бугелей, у опор рулей, у лючков (руки техников) - темнее и матовее
        hand = M('MAXIMUM', near((0, YA(LUG['a']), R), 0.22), near((0, YA(1.50), -R), 0.18))
        for phi in ANG: hand = M('MAXIMUM', hand, near(tuple(P(CAN['piv'], R, phi)), 0.08))
        hand = M('MULTIPLY', hand, g.smooth(photo(g, 'si13', pos, 1.7, rot=2.0), 0.25, 0.7))
        col = g.mix(col, (0.36, 0.36, 0.36), M('MULTIPLY', hand, 0.30 + 0.2 * w)); rg = M('ADD', rg, M('MULTIPLY', hand, 0.12))
        # трафареты: цилиндрическая проекция по борту
        if not DEC: DEC.append(bpy.data.images.load(os.path.join(HD, 'x59_decals.png'), check_existing=True))
        for row, ac, phl, hh, cc, side in TEXTS:
            for sgn in ((-1, 1) if side == 'B' else ((-1,) if side == 'L' else (1,))):
                phc = 180.0 - phl if (side == 'B' and sgn > 0) else phl                         # 'L', 'R' - φ как есть; 'B' - зеркально на правый борт
                ww = hh * 8.0
                u = M('ADD', M('MULTIPLY', M('SUBTRACT', Yv, YA(ac)), sgn / ww), 0.5)
                v = M('ADD', M('MULTIPLY', M('MULTIPLY', rr, wrap(M('SUBTRACT', ang, math.radians(phc)))), sgn / hh), 0.5)
                ins = M('MULTIPLY', M('MULTIPLY', M('GREATER_THAN', u, 0.0), M('LESS_THAN', u, 1.0)), M('MULTIPLY', M('GREATER_THAN', v, 0.0), M('LESS_THAN', v, 1.0)))
                ins = M('MULTIPLY', ins, skin)
                cv = g.n('ShaderNodeCombineXYZ', X=u, Y=M('MULTIPLY', M('ADD', v, NROW - 1 - row), 1.0 / NROW), Z=0.0).outputs['Vector']
                ti = g.n('ShaderNodeTexImage', Vector=cv); ti.image = DEC[0]; ti.extension = 'CLIP'
                tm = M('MULTIPLY', ti.outputs['Alpha'], ins)
                worn = g.smooth(photo(g, 'sc5', pos, 2.2, rot=0.7), 0.45, 0.8)                        # трафарет местами стёрт
                col = g.mix(col, TCOL[cc], M('MULTIPLY', tm, M('SUBTRACT', 0.95, M('MULTIPLY', worn, 0.25))))
                rg = M('ADD', rg, M('MULTIPLY', tm, 0.25)); met = M('SUBTRACT', met, M('MULTIPLY', tm, 0.6))
        # кромки рулей и крыльев затёрты до блеска, царапины вдоль корпуса
        bev = g.n('ShaderNodeBevel', Radius=0.004, _samples=8)
        dp = g.n('ShaderNodeVectorMath', _operation='DOT_PRODUCT', Vector=bev.outputs['Normal'], Vector_001=geo.outputs['Normal']).outputs['Value']
        edge = M('MULTIPLY', g.smooth(dp, 0.985, 0.90), g.smooth(M('ADD', photo(g, 'sc3', pos, 1.6, rot=0.3), M('MULTIPLY', g.n('ShaderNodeTexNoise', Vector=pos, Scale=30.0, Detail=6.0).outputs['Fac'], 0.6)), 0.45, 0.85))
        scr = M('MULTIPLY', g.smooth(photo(g, 'sc3', g.n('ShaderNodeMapping', Vector=pos, Scale=(1.0, 0.25, 1.0)).outputs['Vector'], 1.4, rot=0.0), 0.70, 0.92), 0.5 * w + 0.2)
        scr = M('MULTIPLY', scr, M('SUBTRACT', 1.0, M('MULTIPLY', fin, 0.75)))                            # на оперении проекция маски тянется - слабее
        pol = M('MAXIMUM', M('MULTIPLY', edge, 0.8), scr)
        col = g.mix(col, (0.74, 0.74, 0.75), M('MULTIPLY', pol, 0.35)); rg = M('SUBTRACT', rg, M('MULTIPLY', pol, 0.12)); met = M('ADD', met, M('MULTIPLY', pol, 0.15))
        hadd(scr, -0.15)
    elif kind == 'radome':
        film = g.smooth(photo(g, 'si3', pos, 1.5, rot=0.4), 0.3, 0.9)
        col = g.mix(col, GRIME, M('MULTIPLY', film, 0.15)); rg = M('ADD', rg, M('MULTIPLY', film, 0.1))
        sl = M('MULTIPLY', g.smooth(Z, 0.0, -0.10), g.smooth(photo(g, 'si13', pos, 1.5, rot=0.7), 0.2, 0.7))
        col = g.mix(col, SOOT, M('MULTIPLY', sl, 0.5))
        chip = g.smooth(photo(g, 'sc5', pos, 2.0), 0.7, 0.9); col = g.mix(col, (0.55, 0.54, 0.50), M('MULTIPLY', chip, 0.3)); hadd(chip, -0.1)
    elif kind == 'heat':
        # сопло: побежалость (рыже-синеватые разводы), копоть гуще к срезу, светлая зола полосами назад
        bl = g.smooth(photo(g, 'si13', pos, 1.2, rot=0.5), 0.25, 0.7)
        col = g.mix(col, (0.30, 0.20, 0.12), M('MULTIPLY', bl, 0.5)); col = g.mix(col, (0.16, 0.16, 0.22), M('MULTIPLY', g.smooth(photo(g, 'si3', pos, 2.0), 0.4, 0.8), 0.4))
        near_n = g.smooth(Yv, NOZ[1] + 0.12, NOZ[1])
        ao = g.n('ShaderNodeAmbientOcclusion', Distance=0.03).outputs['AO']
        col = g.mix(col, SOOT, M('MAXIMUM', M('MULTIPLY', near_n, 0.7), M('MULTIPLY', g.smooth(M('SUBTRACT', 1.0, ao), 0.1, 0.5), 0.7)))
        ash = g.smooth(g.n('ShaderNodeTexNoise', Vector=g.n('ShaderNodeMapping', Vector=pos, Scale=(30.0, 0.8, 30.0)).outputs['Vector'], Scale=3.0, Detail=4.0).outputs['Fac'], 0.62, 0.74)
        col = g.mix(col, (0.36, 0.33, 0.30), M('MULTIPLY', ash, 0.3)); rg = M('ADD', rg, M('MULTIPLY', near_n, 0.25)); hadd(bl, 0.3)
    elif kind == 'dark':
        tint = g.smooth(g.n('ShaderNodeTexNoise', Vector=pos, Scale=40.0, Detail=4.0).outputs['Fac'], 0.4, 0.7)
        col = g.mix(col, (0.09, 0.07, 0.05), M('MULTIPLY', tint, 0.6))
    else:   # steel
        wr_ = g.smooth(photo(g, 'sc3', pos, 3.0), 0.5, 0.85)
        col = g.mix(col, (0.55, 0.55, 0.53), M('MULTIPLY', wr_, 0.6)); col = g.mix(col, (0.12, 0.09, 0.07), M('MULTIPLY', g.smooth(photo(g, 'si13', pos, 2.0), 0.4, 0.7), 0.4))
    # затенение в углах (мягкое)
    ao2 = g.n('ShaderNodeAmbientOcclusion', Distance=0.04).outputs['AO']
    col = g.mix(col, (0.10, 0.10, 0.10) if kind in ('body', 'radome') else SOOT, M('MULTIPLY', g.smooth(M('SUBTRACT', 1.0, ao2), 0.05, 0.6), 0.35))
    peel = g.n('ShaderNodeTexNoise', Vector=pos, Scale=900.0, Detail=1.0).outputs['Fac']; hadd(peel, 0.03 if kind == 'body' else 0.05)
    bev2 = g.n('ShaderNodeBevel', Radius=0.0025, _samples=8)
    bump = g.n('ShaderNodeBump', Strength=0.35, Distance=0.0007, Height=height, Normal=bev2.outputs['Normal'])
    bs = g.n('ShaderNodeBsdfPrincipled', **{'Base Color': col, 'Roughness': rg, 'Metallic': met, 'Normal': bump.outputs['Normal']})
    g.n('ShaderNodeOutputMaterial', Surface=bs.outputs['BSDF'])


KIND = {'X59_body': 'body', 'X59_radome': 'radome', 'X59_heat': 'heat', 'X59_dark': 'dark', 'X59_steel': 'steel'}


def apply_paint(wear=1):
    for m in bpy.data.materials:
        if m.name in KIND: paint_tree(m, KIND[m.name], wear)
