# _paint.py - процедурная окраска Х-59МК2 (исполняется после build.py; тот же шейдер потом запекается в атласы).
# Светло-серая краска (фото 10-13): отсеки чуть разного тона, стыки отсеков тёмной линией, ряды винтов у стыков, лючки с винтами по контуру
# (большой лючок со срезанными задними углами за носовым стыком - фото 11, узкий за ступенькой - фото 13, круглая крышка заливки и большой лючок
# в хвостовом отсеке - фото 12, 13), панель на спине носа (фото 10). Надпись «Х-59МК2» синим и СВОЙ знак (не заводской), мелкие трафареты - выдуманные.
# Износ лёгкий: пыль, грязь снизу, потёки назад, сколы краски на кромках, захватанные места; копоть на заднем торце и у сопла.
# Трафареты и лючки на гранёном корпусе - плоской проекцией на борт (Y, Z) или на спину (Y, X), по нормали грани.
import bpy, math, os
_hp = os.path.join(HERE, '..', 'HIMARS', '_paint.py'); _src = open(_hp, encoding='utf-8').read()
exec(_src[_src.index('class G:'):_src.index('def near(')]); exec(_src[_src.index('CC0 = {'):_src.index('def ID_is')])
HD = HERE
PAINT = (0.70, 0.715, 0.73)                  # светло-серая краска (сверка медианы борта с фото - в _trial.py)
GRIME = (0.30, 0.29, 0.27); DUSTC = (0.58, 0.56, 0.52); SOOT = (0.030, 0.027, 0.025); PRIMER = (0.36, 0.38, 0.40)
DEC = []
JOINTS = [1.00, 1.75, 1.765, 2.93, 4.66]                                   # стыки отсеков (2.93 - ступенька за крылом)
SCREWJ = [(1.00, (-0.014, 0.014)), (1.765, (0.016,)), (4.66, (-0.014, 0.014))]   # колонки винтов у стыков (по бортам)
# трафареты: (строка картинки, a центра от носа м, z центра, высота строки м, цвет, борт 'L' / 'R' / 'B' - оба); строка 8:1, читается слева направо
TEXTS = [(0, 2.42, 0.025, 0.105, 'b', 'B'), (1, 2.06, 0.025, 0.105, 'b', 'B'),
         (2, 1.92, -0.112, 0.024, 'k', 'L'), (3, 1.92, -0.138, 0.020, 'k', 'L'),
         (5, 2.79, -0.070, 0.042, 'k', 'B'), (4, 2.79, -0.112, 0.020, 'k', 'B'),
         (6, 1.08, 0.118, 0.020, 'k', 'B'), (6, 4.60, 0.118, 0.020, 'k', 'B'),
         (7, 4.28, 0.118, 0.042, 'k', 'B'), (8, 4.28, -0.124, 0.042, 'k', 'B'), (15, 1.62, 0.118, 0.042, 'k', 'B'),
         (9, 3.55, -0.062, 0.022, 'k', 'B'), (10, 4.84, -0.058, 0.018, 'k', 'B'), (11, 3.62, 0.105, 0.018, 'k', 'L'),
         (12, 0.78, 0.100, 0.036, 'r', 'B'), (13, 0.50, 0.040, 0.036, 'r', 'B'), (14, 3.25, -0.080, 0.040, 'k', 'R')]
NROW = 16
TCOL = {'k': (0.020, 0.020, 0.022), 'r': (0.42, 0.025, 0.02), 'b': (0.007, 0.040, 0.28)}
# лючки: (a0, a1, c0, c1, грань, вид): грань 'L', 'R', 'B' - борт (c - z), 'T' - спина (c - x); вид 'riv' - винты по контуру, 'cham' - то же со срезанными
#   задними углами, 'rect' - винты по углам, 'round' - круглая крышка с кольцом (a0 - центр, a1 - радиус, c0 - z центра)
HATCHES = [(1.08, 1.56, -0.110, 0.110, 'L', 'cham'), (1.08, 1.42, -0.100, 0.100, 'R', 'riv'), (3.00, 3.10, -0.120, 0.120, 'B', 'riv'),
           (3.55, 0.034, 0.0, 0.0, 'B', 'round'), (4.05, 4.60, -0.100, 0.100, 'B', 'riv'), (3.20, 3.30, -0.104, -0.056, 'R', 'rect'),
           (0.40, 0.72, -0.100, 0.100, 'T', 'rect'), (4.95, 5.10, -0.050, 0.050, 'T', 'rect')]
NOZC = (0.0, YA(NOZ['a_end']), (prof(TAIL['a1'])[2] + prof(TAIL['a1'])[3]) / 2)


def paint_tree(mat, kind, wear=1):
    g = G(mat); w = [0.0, 0.6, 1.0][wear]
    own = kind in ('fin',)
    tc = g.n('ShaderNodeTexCoord') if own else g.n('ShaderNodeTexCoord', _object=bpy.data.objects.get('body'))
    pos = tc.outputs['Object']
    PS = g.n('ShaderNodeSeparateXYZ', Vector=pos)
    X, Yv, Z = PS.outputs['X'], PS.outputs['Y'], PS.outputs['Z']; geo = g.n('ShaderNodeNewGeometry')
    NS = g.n('ShaderNodeSeparateXYZ', Vector=geo.outputs['Normal']); NX, NZ = NS.outputs['X'], NS.outputs['Z']
    M = g.math
    def L2(a, b): return M('SQRT', M('ADD', M('MULTIPLY', a, a), M('MULTIPLY', b, b)))
    def near(pt, r, k=0.2):
        d = g.n('ShaderNodeVectorMath', _operation='DISTANCE', Vector=pos, Vector_001=pt).outputs['Value']; return g.smooth(d, r, r * k)
    def stepsum(edges, vals):
        out = None; prev = 0.0
        for a, v in zip(edges, vals):
            s = M('MULTIPLY', M('LESS_THAN', Yv, YA(a)), v - prev); prev = v; out = s if out is None else M('ADD', out, s)
        return out
    sideL = g.smooth(M('MULTIPLY', NX, -1.0), 0.55, 0.80); sideR = g.smooth(NX, 0.55, 0.80); topm = g.smooth(NZ, 0.55, 0.80)
    sides = M('MAXIMUM', sideL, sideR)
    FACE = {'L': sideL, 'R': sideR, 'B': sides, 'T': topm}
    if kind in ('body', 'fin'): base = PAINT; rough = 0.42
    elif kind == 'heat': base = (0.20, 0.17, 0.15); rough = 0.55
    elif kind == 'dark': base = (0.030, 0.028, 0.027); rough = 0.70
    elif kind == 'cone': base = (0.09, 0.085, 0.08); rough = 0.50
    elif kind == 'window': base = (0.012, 0.015, 0.019); rough = 0.05
    else: base = (0.34, 0.34, 0.34); rough = 0.38                                                 # steel
    col = g.n('ShaderNodeRGB').outputs[0]; col.node.outputs[0].default_value = (*base, 1.0)
    rg = rough; met = {'body': 0.0, 'fin': 0.0, 'heat': 0.8, 'dark': 0.0, 'cone': 0.6, 'window': 0.0}.get(kind, 0.85)
    height = None
    def hadd(h, k):
        nonlocal height
        v = M('MULTIPLY', h, k); height = v if height is None else M('ADD', height, v)
    if kind in ('body', 'fin'):
        # отсеки чуть разного тона (краска разных партий), оперение и крыло - по объекту
        if kind == 'body':
            tone = stepsum(JOINTS + [6.0], [0.56, 0.42, 0.5, 0.60, 0.38, 0.52])
        else:
            tone = M('ADD', 0.35, M('MULTIPLY', g.n('ShaderNodeObjectInfo').outputs['Random'], 0.3))
        col = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor_Float=1.0, A_Color=col,
                  B_Color=g.ramp(tone, [(0.25, (0.955, 0.958, 0.962)), (0.75, (1.035, 1.035, 1.03))])).outputs[2]
        rg = M('ADD', rg, M('MULTIPLY', M('SUBTRACT', tone, 0.5), -0.08))
        # мелкая неровность краски и плёнка пыли, разводы
        orange = g.n('ShaderNodeTexNoise', Vector=pos, Scale=420.0, Detail=2.0).outputs['Fac']; hadd(orange, 0.02)
        film = g.smooth(M('ADD', M('MULTIPLY', photo(g, 'si3', pos, 1.1, rot=0.4), 0.8), M('MULTIPLY', g.n('ShaderNodeTexNoise', Vector=pos, Scale=2.0, Detail=4.0).outputs['Fac'], 0.7)), 0.35, 1.30)
        col = g.mix(col, DUSTC, M('MULTIPLY', film, 0.10 + 0.08 * w)); rg = M('ADD', rg, M('MULTIPLY', film, 0.12))
        blot = g.smooth(photo(g, 'si13', pos, 0.8, rot=1.1), 0.35, 0.85)
        col = g.mix(col, (0.55, 0.555, 0.56), M('MULTIPLY', blot, 0.10 + 0.06 * w))
        # грязь снизу
        under = M('MULTIPLY', g.smooth(NZ, -0.2, -0.75), g.smooth(g.n('ShaderNodeTexNoise', Vector=pos, Scale=6.0, Detail=6.0, Roughness=0.6).outputs['Fac'], 0.35, 0.65))
        col = g.mix(col, GRIME, M('MULTIPLY', under, 0.16 + 0.12 * w)); rg = M('ADD', rg, M('MULTIPLY', under, 0.10))
        # потёки назад по потоку (на борту)
        lk = photo(g, 'lk12', g.n('ShaderNodeMapping', Vector=pos, Scale=(1.0, 0.35, 1.0)).outputs['Vector'], 1.0, blend=0.15, inv=True)
        st = g.n('ShaderNodeTexNoise', Vector=g.n('ShaderNodeMapping', Vector=pos, Scale=(45.0, 0.7, 45.0)).outputs['Vector'], Scale=3.0, Detail=3.0).outputs['Fac']
        streak = g.smooth(M('ADD', M('MULTIPLY', lk, 1.6), M('MULTIPLY', g.smooth(st, 0.60, 0.74), 0.6)), 0.40, 0.95)
        if kind == 'fin': streak = M('MULTIPLY', streak, 0.3)
        col = g.mix(col, (0.46, 0.46, 0.45), M('MULTIPLY', streak, 0.12 * (0.5 + w)))
        sc_ = None; ho = None; hin = None; htone = None; jl = None
        if kind == 'body':
            # копоть: задний торец вокруг сопла, низ хвоста у среза
            rear = g.smooth(Yv, YA(5.40), YA(5.64))                                                   # задний торец: плавный налёт гуще к соплу
            soft = g.smooth(g.n('ShaderNodeTexNoise', Vector=pos, Scale=7.0, Detail=3.0).outputs['Fac'], 0.30, 0.70)
            sootj = M('MULTIPLY', M('MULTIPLY', rear, near(NOZC, 0.34, 0.35)), M('ADD', 0.6, M('MULTIPLY', soft, 0.4)))
            sootj = M('MAXIMUM', sootj, M('MULTIPLY', near(NOZC, 0.21, 0.62), 0.95))
            sst = g.smooth(g.n('ShaderNodeTexNoise', Vector=g.n('ShaderNodeMapping', Vector=pos, Scale=(30.0, 0.6, 30.0)).outputs['Vector'], Scale=3.0, Detail=2.0).outputs['Fac'], 0.40, 0.70)
            sootj = M('MAXIMUM', sootj, M('MULTIPLY', M('MULTIPLY', g.smooth(Yv, YA(5.15), YA(5.60)), g.smooth(NZ, -0.3, -0.8)), M('MULTIPLY', sst, 0.35)))
            col = g.mix(col, SOOT, M('MULTIPLY', sootj, 0.62 + 0.25 * w)); rg = M('ADD', rg, M('MULTIPLY', sootj, 0.25))
            # стыки отсеков: тёмная щель + канавка, грязь в шве
            jw = None
            for a in JOINTS:
                l_ = g.smooth(M('ABSOLUTE', M('SUBTRACT', Yv, YA(a))), 0.0011, 0.0003); jl = l_ if jl is None else M('MAXIMUM', jl, l_)
                l2 = g.smooth(M('ABSOLUTE', M('SUBTRACT', Yv, YA(a))), 0.012, 0.002); jw = l2 if jw is None else M('MAXIMUM', jw, l2)
            jw = M('MULTIPLY', jw, g.smooth(photo(g, 'si13', pos, 2.5, rot=0.3), 0.2, 0.7))
            col = g.mix(col, GRIME, M('MULTIPLY', jw, 0.14 + 0.08 * w))
            # колонки винтов у стыков (на бортах, шаг 45 мм)
            for a, offs in SCREWJ:
                for off in offs:
                    fz = M('MULTIPLY', M('SUBTRACT', M('FRACT', M('ADD', M('MULTIPLY', Z, 1 / 0.045), 0.5)), 0.5), 0.045)
                    d_ = g.smooth(L2(M('SUBTRACT', Yv, YA(a + off)), fz), 0.0026, 0.0012)
                    d_ = M('MULTIPLY', M('MULTIPLY', d_, sides), M('LESS_THAN', M('ABSOLUTE', Z), 0.13))
                    sc_ = d_ if sc_ is None else M('MAXIMUM', sc_, d_)
            # лючки
            for i, (a0, a1, c0, c1, face, kd) in enumerate(HATCHES):
                C = X if face == 'T' else Z; fm = FACE[face]
                if kd == 'round':
                    px = M('SUBTRACT', Yv, YA(a0)); py = M('SUBTRACT', C, c0); r_ = L2(px, py)
                    d = M('SUBTRACT', r_, a1)
                    o2 = g.smooth(M('ABSOLUTE', M('SUBTRACT', r_, a1 * 0.62)), 0.0010, 0.0003)
                    ho = M('MAXIMUM', ho, M('MULTIPLY', o2, fm)) if ho is not None else M('MULTIPLY', o2, fm)
                else:
                    px = M('SUBTRACT', Yv, YA((a0 + a1) / 2)); py = M('SUBTRACT', C, (c0 + c1) / 2)
                    hl, hw = (a1 - a0) / 2, (c1 - c0) / 2; rc = min(0.010, hl * 0.4, hw * 0.4)
                    qx = M('ADD', M('SUBTRACT', M('ABSOLUTE', px), hl), rc); qy = M('ADD', M('SUBTRACT', M('ABSOLUTE', py), hw), rc)
                    d = M('SUBTRACT', M('ADD', L2(M('MAXIMUM', qx, 0.0), M('MAXIMUM', qy, 0.0)), M('MINIMUM', M('MAXIMUM', qx, qy), 0.0)), rc)
                    if kd == 'cham':                                                                   # срез задних углов (хвост - к −Y)
                        cc = 0.06
                        dch = M('MULTIPLY', M('SUBTRACT', M('SUBTRACT', M('ABSOLUTE', py), px), hl + hw - cc), 0.7071)
                        d = M('MAXIMUM', d, dch)
                o_ = M('MULTIPLY', g.smooth(M('ABSOLUTE', d), 0.0011, 0.0003), fm); ho = o_ if ho is None else M('MAXIMUM', ho, o_)
                i_ = M('MULTIPLY', g.smooth(d, 0.0, -0.002), fm); hin = i_ if hin is None else M('MAXIMUM', hin, i_)
                t_ = M('MULTIPLY', i_, 0.3 + (i * 0.37) % 0.7); htone = t_ if htone is None else M('MAXIMUM', htone, t_)
                if kd == 'rect':
                    for sx in (-1, 1):
                        for sy in (-1, 1):
                            cs = g.smooth(L2(M('SUBTRACT', px, sx * (hl - 0.010)), M('SUBTRACT', py, sy * (hw - 0.010))), 0.0026, 0.0012); sc_ = M('MAXIMUM', sc_, M('MULTIPLY', cs, fm))
                elif kd in ('riv', 'cham'):                                                            # винты по контуру: шаг около 50 мм, в 11 мм от края
                    ins = 0.011
                    def edge_dots(u, v, lu, lv):
                        n_ = max(2, round(2 * lv / 0.048)); pt = 2 * lv / n_                           # шаг около 48 мм, точки от угла до угла
                        along = M('MULTIPLY', M('SUBTRACT', M('FRACT', M('MULTIPLY', M('ADD', v, lv + pt / 2), 1 / pt)), 0.5), pt)    # точки в углах и через шаг
                        dd_ = g.smooth(L2(M('SUBTRACT', M('ABSOLUTE', u), lu), along), 0.0026, 0.0012)
                        return M('MULTIPLY', dd_, M('LESS_THAN', M('ABSOLUTE', v), lv + 0.003))
                    rv = M('MAXIMUM', edge_dots(py, px, hw - ins, hl - ins), edge_dots(px, py, hl - ins, hw - ins))
                    rv = M('MULTIPLY', rv, g.smooth(d, -0.004, -0.007))                              # срезанные углы - без винтов снаружи
                    sc_ = M('MAXIMUM', sc_, M('MULTIPLY', rv, fm))
            col = g.mix(col, (0.74, 0.75, 0.76), M('MULTIPLY', htone, 0.12))                                # крышки лючков - чуть другой тон
            col = g.mix(col, (0.22, 0.22, 0.22), M('MULTIPLY', M('MAXIMUM', jl, ho), 0.80))
            col = g.mix(col, (0.30, 0.31, 0.32), M('MULTIPLY', sc_, 0.55)); rg = M('ADD', rg, M('MULTIPLY', sc_, -0.10)); met = M('ADD', met, M('MULTIPLY', sc_, 0.5))
            hadd(jl, -1.0); hadd(ho, -0.8); hadd(sc_, -0.25); hadd(hin, 0.06)
            # захватанные места: у бугелей, у ступеньки, у лючков
            hand = M('MAXIMUM', near((0, YA(LUGS[0]), 0.18), 0.22), near((0, YA(LUGS[1]), 0.15), 0.22))
            hand = M('MAXIMUM', hand, M('MULTIPLY', near((0, YA(1.32), 0.0), 0.30), sideL))
            hand = M('MULTIPLY', hand, g.smooth(photo(g, 'si13', pos, 1.7, rot=2.0), 0.25, 0.7))
            col = g.mix(col, (0.48, 0.48, 0.48), M('MULTIPLY', hand, 0.18 + 0.12 * w)); rg = M('ADD', rg, M('MULTIPLY', hand, 0.06))
            # трафареты: плоская проекция на борт
            if not DEC: DEC.append(bpy.data.images.load(os.path.join(HD, 'mk2_decals.png'), check_existing=True))
            for row, ac, zc, hh, cc, side in TEXTS:
                for sgn in ((-1, 1) if side == 'B' else ((-1,) if side == 'L' else (1,))):
                    ww = hh * 8.0
                    u = M('ADD', M('MULTIPLY', M('SUBTRACT', Yv, YA(ac)), sgn / ww), 0.5)
                    v = M('ADD', M('MULTIPLY', M('SUBTRACT', Z, zc), 1 / hh), 0.5)
                    ins = M('MULTIPLY', M('MULTIPLY', M('GREATER_THAN', u, 0.0), M('LESS_THAN', u, 1.0)), M('MULTIPLY', M('GREATER_THAN', v, 0.0), M('LESS_THAN', v, 1.0)))
                    ins = M('MULTIPLY', ins, sideL if sgn < 0 else sideR)
                    cv = g.n('ShaderNodeCombineXYZ', X=u, Y=M('MULTIPLY', M('ADD', v, NROW - 1 - row), 1.0 / NROW), Z=0.0).outputs['Vector']
                    ti = g.n('ShaderNodeTexImage', Vector=cv); ti.image = DEC[0]; ti.extension = 'CLIP'
                    tm = M('MULTIPLY', ti.outputs['Alpha'], ins)
                    worn = g.smooth(photo(g, 'sc5', pos, 2.2, rot=0.7), 0.50, 0.85)
                    col = g.mix(col, TCOL[cc], M('MULTIPLY', tm, M('SUBTRACT', 0.97, M('MULTIPLY', worn, 0.20))))
                    rg = M('ADD', rg, M('MULTIPLY', tm, -0.05))
        # сколы краски на кромках (до грунта и металла), царапины
        bev = g.n('ShaderNodeBevel', Radius=0.004, _samples=8)
        dp = g.n('ShaderNodeVectorMath', _operation='DOT_PRODUCT', Vector=bev.outputs['Normal'], Vector_001=geo.outputs['Normal']).outputs['Value']
        edge = M('MULTIPLY', g.smooth(dp, 0.93, 0.80), g.smooth(M('ADD', photo(g, 'sc5', pos, 1.6, rot=0.3), M('MULTIPLY', g.n('ShaderNodeTexNoise', Vector=pos, Scale=30.0, Detail=6.0).outputs['Fac'], 0.5)), 0.70, 0.95))
        chip = M('MULTIPLY', edge, 0.4 + 0.5 * w)
        if kind == 'body': chip = M('MULTIPLY', chip, g.smooth(Yv, YA(5.40), YA(5.30)))                 # задний торец - копоть, не сколы
        scr = M('MULTIPLY', g.smooth(photo(g, 'sc3', g.n('ShaderNodeMapping', Vector=pos, Scale=(1.0, 0.25, 1.0)).outputs['Vector'], 1.4, rot=0.0), 0.80, 0.95), 0.25 * w + 0.1)
        col = g.mix(col, PRIMER, chip); rg = M('ADD', rg, M('MULTIPLY', chip, -0.10)); met = M('ADD', met, M('MULTIPLY', chip, 0.3))
        col = g.mix(col, (0.60, 0.61, 0.62), M('MULTIPLY', scr, 0.5)); hadd(chip, -0.3); hadd(scr, -0.10)
    elif kind == 'heat':
        bl = g.smooth(photo(g, 'si13', pos, 1.2, rot=0.5), 0.25, 0.7)
        col = g.mix(col, (0.30, 0.20, 0.12), M('MULTIPLY', bl, 0.5)); col = g.mix(col, (0.16, 0.16, 0.22), M('MULTIPLY', g.smooth(photo(g, 'si3', pos, 2.0), 0.4, 0.8), 0.4))
        near_n = g.smooth(Yv, NOZC[1] + 0.05, NOZC[1])
        ao = g.n('ShaderNodeAmbientOcclusion', Distance=0.03).outputs['AO']
        col = g.mix(col, SOOT, M('MAXIMUM', M('MULTIPLY', near_n, 0.7), M('MULTIPLY', g.smooth(M('SUBTRACT', 1.0, ao), 0.1, 0.5), 0.7)))
        rg = M('ADD', rg, M('MULTIPLY', near_n, 0.25)); hadd(bl, 0.3)
    elif kind in ('dark', 'cone'):
        tint = g.smooth(g.n('ShaderNodeTexNoise', Vector=pos, Scale=40.0, Detail=4.0).outputs['Fac'], 0.4, 0.7)
        col = g.mix(col, (0.09, 0.07, 0.05), M('MULTIPLY', tint, 0.5)); col = g.mix(col, SOOT, M('MULTIPLY', g.smooth(photo(g, 'si3', pos, 2.0), 0.2, 0.7), 0.6))
    elif kind == 'window':
        film = g.smooth(photo(g, 'si3', pos, 3.0, rot=0.4), 0.45, 0.95)
        col = g.mix(col, (0.10, 0.10, 0.09), M('MULTIPLY', film, 0.25)); rg = M('ADD', rg, M('MULTIPLY', film, 0.15))
    else:   # steel
        wr_ = g.smooth(photo(g, 'sc3', pos, 3.0), 0.5, 0.85)
        col = g.mix(col, (0.55, 0.55, 0.53), M('MULTIPLY', wr_, 0.6)); col = g.mix(col, (0.12, 0.09, 0.07), M('MULTIPLY', g.smooth(photo(g, 'si13', pos, 2.0), 0.4, 0.7), 0.4))
    ao2 = g.n('ShaderNodeAmbientOcclusion', Distance=0.04).outputs['AO']
    col = g.mix(col, (0.10, 0.10, 0.10) if kind in ('body', 'fin') else SOOT, M('MULTIPLY', g.smooth(M('SUBTRACT', 1.0, ao2), 0.05, 0.6), 0.30))
    if height is None: height = g.n('ShaderNodeTexNoise', Vector=pos, Scale=900.0, Detail=1.0).outputs['Fac']; height = M('MULTIPLY', height, 0.02)
    bev2 = g.n('ShaderNodeBevel', Radius=0.0025, _samples=8)
    bump = g.n('ShaderNodeBump', Strength=0.35, Distance=0.0007, Height=height, Normal=bev2.outputs['Normal'])
    kw = {'Base Color': col, 'Roughness': rg, 'Metallic': met, 'Normal': bump.outputs['Normal']}
    if kind == 'window': kw.update({'Coat Weight': 1.0, 'Coat Roughness': 0.02, 'Specular IOR Level': 0.6})
    bs = g.n('ShaderNodeBsdfPrincipled', **kw)
    g.n('ShaderNodeOutputMaterial', Surface=bs.outputs['BSDF'])


KIND = {'X59K_body': 'body', 'X59K_fin': 'fin', 'X59K_heat': 'heat', 'X59K_dark': 'dark', 'X59K_steel': 'steel', 'X59K_window': 'window', 'X59K_cone': 'cone'}


def split_fin_mat():
    """крыло и рули - своя копия краски (координаты по своему объекту: при повороте узор не плывёт)"""
    mb = bpy.data.materials['X59K_body']; mf = bpy.data.materials.get('X59K_fin') or mb.copy(); mf.name = 'X59K_fin'
    for o in COL.objects:
        if o.type == 'MESH' and (o.name == 'wing' or o.name.startswith('fin')):
            for i, m in enumerate(o.data.materials):
                if m == mb: o.data.materials[i] = mf


def apply_paint(wear=1):
    split_fin_mat()
    for m in bpy.data.materials:
        if m.name in KIND: paint_tree(m, KIND[m.name], wear)
