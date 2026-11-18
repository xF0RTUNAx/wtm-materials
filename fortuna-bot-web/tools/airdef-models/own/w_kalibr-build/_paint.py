# _paint.py — процедурная окраска 3М14 (из AIM-260/_paint.py; тот же шейдер запекается в атласы). apply_paint(wear)
# Фото 02-06: корпус белый/светло-серый полуматовый, нос серый, пары чёрных колец разметки, у кольца - красная метка; швы отсеков, лючки, заклёпки - тёмной линией
# и рельефом. Свои трафареты (make_decals.py, все надписи выдуманы). Износ лёгкий: плёнка пыли, следы рук и строп, потёки назад по потоку, копоть у сопла.
import bpy, math, os
_hp = os.path.join(HERE, '..', '..', 'HIMARS', '_paint.py'); _src = open(_hp, encoding='utf-8').read()
exec(_src[_src.index('class G:'):_src.index('def near(')]); exec(_src[_src.index('CC0 = {'):_src.index('def ID_is')])
HD = os.path.join(HERE, '..')   # photo() берёт маски из HD/../_текстуры_CC0
GREY = (0.66, 0.67, 0.66); IVORY = (0.14, 0.145, 0.15); FINC = (0.62, 0.63, 0.62)   # фото 03, 05, 06: корпус sRGB ~210, нос ~122; рули как корпус
RED = (0.45, 0.03, 0.02); BLACK = (0.018, 0.018, 0.018)
GRIME = (0.30, 0.28, 0.25); SOOT = (0.03, 0.027, 0.025)
DEC = []; NROW = 12
# трафареты: ('side', строка, a центра, z центра, высота строки, цвет) с бортов ±X; ('fin', строка, a центра, s центра, высота) - на гранях перьев
TEXTS = [('side', 2, 2.20, 0.060, 0.040, 'k'), ('side', 6, 2.20, 0.015, 0.022, 'k'), ('side', 1, 4.10, 0.040, 0.030, 'k'), ('side', 3, 1.70, -0.090, 0.026, 'k'),
         ('side', 5, 3.05, -0.120, 0.016, 'k'), ('side', 4, 5.45, 0.080, 0.022, 'k'), ('side', 7, 4.90, -0.150, 0.016, 'k'), ('side', 9, 1.40, 0.140, 0.018, 'k'),
         ('side', 0, 3.20, 0.200, 0.026, 'k'), ('fin', 10, 5.97, R + 0.17, 0.035, 'k')]
HATCH = [(2.05, 2.30, 55.0, 0.13, 'rr'), (2.98, 3.20, -60.0, 0.11, 'rr'), (4.55, 4.85, 125.0, 0.15, 'rr'), (1.38, 1.52, 90.0, 0.09, 'rr'), (5.40, 5.56, -30.0, 0.10, 'rr'), (3.62, 3.80, 180.0, 0.10, 'rr')]


def paint_tree(mat, kind, wear=1):
    g = G(mat); w = [0.0, 0.6, 1.0][wear]
    tc = g.n('ShaderNodeTexCoord', _object=bpy.data.objects.get('body')); pos = tc.outputs['Object']
    PS = g.n('ShaderNodeSeparateXYZ', Vector=pos); N = g.n('ShaderNodeSeparateXYZ', Vector=tc.outputs['Normal'])
    X, Yv, Z = PS.outputs['X'], PS.outputs['Y'], PS.outputs['Z']; geo = g.n('ShaderNodeNewGeometry')
    M = g.math
    def L2(a, b): return M('SQRT', M('ADD', M('MULTIPLY', a, a), M('MULTIPLY', b, b)))
    rr = L2(X, Z); ang = M('ARCTAN2', Z, X)
    skin = g.smooth(rr, R + 0.006, R + 0.002)
    def wrap(v): return g.n('ShaderNodeMath', _operation='WRAP', Value=v, Value_001=math.pi, Value_002=-math.pi).outputs[0]
    def near(pt, r):
        d = g.n('ShaderNodeVectorMath', _operation='DISTANCE', Vector=pos, Vector_001=pt).outputs['Value']; return g.smooth(d, r, r * 0.2)
    def band(a0, a1): return M('MULTIPLY', g.smooth(Yv, YA(a0) + 0.0008, YA(a0) - 0.0008), g.smooth(Yv, YA(a1) - 0.0008, YA(a1) + 0.0008))
    height = [None]
    def hadd(h, k):
        v = M('MULTIPLY', h, k); height[0] = v if height[0] is None else M('ADD', height[0], v)
    met = 0.0
    if kind in ('body', 'radome', 'fin'):
        base = {'body': GREY, 'radome': IVORY, 'fin': FINC}[kind]; rg = {'body': 0.52, 'radome': 0.55, 'fin': 0.55}[kind]   # Mark: не глянцевая - матовая армейская краска
        col = g.n('ShaderNodeRGB').outputs[0]; col.node.outputs[0].default_value = (*base, 1.0)
        if kind == 'body':                                                                       # отсеки чуть разного тона (разные партии и подкраска)
            sect = g.n('ShaderNodeTexNoise', Vector=g.n('ShaderNodeMapping', Vector=pos, Scale=(0.0, 2.2, 0.0)).outputs['Vector'], Scale=1.0, Detail=0.0).outputs['Fac']
            col = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor_Float=1.0, A_Color=col, B_Color=g.ramp(sect, [(0.2, (0.90, 0.915, 0.93)), (0.8, (1.06, 1.05, 1.04))])).outputs[2]
            blot = g.n('ShaderNodeTexNoise', Vector=pos, Scale=7.0, Detail=8.0, Roughness=0.65).outputs['Fac']      # выцветание и неровный слой краски
            col = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor_Float=1.0, A_Color=col, B_Color=g.ramp(M('ADD', M('MULTIPLY', blot, 0.7), M('MULTIPLY', photo(g, 'si3', pos, 2.6, rot=1.7), 0.5)), [(0.25, (0.84, 0.845, 0.85)), (0.85, (1.07, 1.065, 1.06))])).outputs[2]
            # подкраска: прямоугольные заплатки свежей краски у лючков и стыков (чуть другой тон и глянец)
            tu = None
            for a0, a1, ph0, ph1 in ((A(1300), A(1235), -40.0, 25.0), (A(830), A(700), 120.0, 200.0), (A(560), A(505), -30.0, 30.0)):
                pa = M('MULTIPLY', g.smooth(Yv, YA(a1) - 0.002, YA(a1) + 0.002), g.smooth(Yv, YA(a0) + 0.002, YA(a0) - 0.002))
                pb = M('MULTIPLY', g.smooth(ang, math.radians(ph0) - 0.02, math.radians(ph0) + 0.02), g.smooth(ang, math.radians(ph1) + 0.02, math.radians(ph1) - 0.02))
                t_ = M('MULTIPLY', pa, pb); tu = t_ if tu is None else M('MAXIMUM', tu, t_)
            col = g.mix(col, (0.53, 0.56, 0.60), M('MULTIPLY', tu, 0.55)); rg = M('SUBTRACT', rg, M('MULTIPLY', tu, 0.10))
            for a0, a1 in BANDS:                                                                 # пары чёрных колец (фото 03, 05, 06)
                col = g.mix(col, BLACK, M('MULTIPLY', band(a0, a1), skin))
            red = M('MULTIPLY', M('MULTIPLY', band(2.60, 2.64), g.smooth(M('ABSOLUTE', wrap(M('SUBTRACT', ang, math.radians(70.0)))), 0.10, 0.07)), skin)   # красная метка у кольца (фото 03)
            col = g.mix(col, RED, red)
        film = g.smooth(M('ADD', M('MULTIPLY', photo(g, 'si3', pos, 1.4, rot=0.4), 0.8), M('MULTIPLY', g.n('ShaderNodeTexNoise', Vector=pos, Scale=3.0, Detail=4.0).outputs['Fac'], 0.7)), 0.35, 1.30)
        col = g.mix(col, (0.40, 0.385, 0.35) if kind != 'fin' else (0.20, 0.19, 0.18), M('MULTIPLY', film, 0.50 + 0.15 * w))
        spot = g.smooth(photo(g, 'si13', pos, 1.0, rot=1.1), 0.30, 0.85)
        col = g.mix(col, GRIME, M('MULTIPLY', spot, 0.32 + 0.12 * w));
        smudge = g.smooth(photo(g, 'si13', pos, 0.33, rot=0.9), 0.35, 0.75); col = g.mix(col, (0.30, 0.30, 0.29), M('MULTIPLY', smudge, 0.25))   # крупные затёртые пятна (руки, тряпка)
        rg = M('ADD', rg, M('MULTIPLY', M('ADD', film, spot), 0.18))
        gloss = g.smooth(photo(g, 'si13', pos, 0.5, rot=2.6), 0.3, 0.8); rg = M('SUBTRACT', rg, M('MULTIPLY', gloss, 0.22))   # пятна разного блеска (затёрто, протёрто тряпкой)
        under = M('MULTIPLY', g.smooth(Z, -0.02, -0.09), g.smooth(g.n('ShaderNodeTexNoise', Vector=pos, Scale=12.0, Detail=6.0).outputs['Fac'], 0.4, 0.7))
        col = g.mix(col, GRIME, M('MULTIPLY', under, 0.50 + 0.15 * w))
        streak = g.smooth(g.n('ShaderNodeTexNoise', Vector=g.n('ShaderNodeMapping', Vector=pos, Scale=(60.0, 0.6, 60.0)).outputs['Vector'], Scale=3.0, Detail=3.0).outputs['Fac'], 0.62, 0.74)
        col = g.mix(col, (0.36, 0.35, 0.33), M('MULTIPLY', streak, 0.10 * (0.5 + w)))
        lk = photo(g, 'lk12', g.n('ShaderNodeMapping', Vector=pos, Scale=(1.0, 0.3, 1.0)).outputs['Vector'], 1.6, blend=0.15, inv=True)   # потёки назад по потоку (фото CC0)
        col = g.mix(col, (0.26, 0.25, 0.23), M('MULTIPLY', g.smooth(lk, 0.30, 0.85), 0.45 + 0.15 * w))
        scr = g.smooth(photo(g, 'sc5', g.n('ShaderNodeMapping', Vector=pos, Scale=(1.0, 0.5, 1.0)).outputs['Vector'], 2.4, rot=0.8), 0.55, 0.85)   # мелкие царапины: светлее и глаже
        col = g.mix(col, (0.66, 0.67, 0.68) if kind != 'fin' else (0.32, 0.32, 0.33), M('MULTIPLY', scr, 0.55 * (0.5 + w))); rg = M('SUBTRACT', rg, M('MULTIPLY', scr, 0.18))
        rub = M('MULTIPLY', g.smooth(photo(g, 'sc3', g.n('ShaderNodeMapping', Vector=pos, Scale=(1.0, 0.2, 1.0)).outputs['Vector'], 1.3, rot=0.2), 0.72, 0.92), g.smooth(g.n('ShaderNodeTexNoise', Vector=pos, Scale=2.0).outputs['Fac'], 0.5, 0.65))
        col = g.mix(col, (0.12, 0.12, 0.12), M('MULTIPLY', rub, 0.35))   # тёмные следы резины и строп (погрузка, тележка)
        hadd(scr, -0.15)
        grain = g.n('ShaderNodeTexNoise', Vector=pos, Scale=260.0, Detail=3.0).outputs['Fac']; hadd(grain, 0.45)
        dent = g.n('ShaderNodeTexNoise', Vector=pos, Scale=18.0, Detail=2.0).outputs['Fac']; hadd(dent, 0.6)   # лёгкая волнистость обшивки   # шагрень краски (видна в блике)
        rg = M('ADD', rg, M('MULTIPLY', M('SUBTRACT', grain, 0.5), 0.10))
        if kind == 'body':
            # швы отсеков, кольца винтов, двойные ряды заклёпок вдоль бортов (рендер 03), лючки
            jl = None
            for a in JOINTS:
                l_ = g.smooth(M('ABSOLUTE', M('SUBTRACT', Yv, YA(a))), 0.0008, 0.0002); jl = l_ if jl is None else M('MAXIMUM', jl, l_)
            jl = M('MULTIPLY', jl, skin)
            def ring_dots(a, n, off, r):
                f = M('SUBTRACT', M('FRACT', M('ADD', M('MULTIPLY', ang, n / (2 * math.pi)), 0.5)), 0.5)
                du = M('MULTIPLY', f, M('MULTIPLY', rr, 2 * math.pi / n)); dy = M('SUBTRACT', Yv, YA(a + off))
                return g.smooth(L2(du, dy), r, r * 0.45)
            sc_ = None
            for a in JOINTS[1:]:
                for off in (-0.008, 0.008):
                    d_ = ring_dots(a, 12, off, 0.0022); sc_ = d_ if sc_ is None else M('MAXIMUM', sc_, d_)
            for phc in (-35.0, -145.0):                                                          # продольные ряды заклёпок снизу-сбоку (шаг ~0,26 м)
                f = M('SUBTRACT', M('FRACT', M('DIVIDE', Yv, 0.258)), 0.5)
                du = M('MULTIPLY', rr, wrap(M('SUBTRACT', ang, math.radians(phc)))); dy = M('MULTIPLY', f, 0.258)
                d_ = M('MULTIPLY', g.smooth(L2(du, dy), 0.0022, 0.001), M('MULTIPLY', g.smooth(Yv, YA(RAD_A + 0.10), YA(RAD_A + 0.14)), g.smooth(Yv, YA(BODY_END - 0.35), YA(BODY_END - 0.38))))
                sc_ = M('MAXIMUM', sc_, d_)
            sc_ = M('MULTIPLY', sc_, skin)
            ho = None
            for (a0, a1, phc, wd, kd) in HATCH:
                px = M('SUBTRACT', Yv, YA((a0 + a1) / 2)); py = M('MULTIPLY', rr, wrap(M('SUBTRACT', ang, math.radians(phc)))); hl, hw = abs(a1 - a0) / 2, wd / 2; rc = min(0.010, hl * 0.5, hw * 0.5)
                qx = M('ADD', M('SUBTRACT', M('ABSOLUTE', px), hl), rc); qy = M('ADD', M('SUBTRACT', M('ABSOLUTE', py), hw), rc)
                d = M('SUBTRACT', M('ADD', L2(M('MAXIMUM', qx, 0.0), M('MAXIMUM', qy, 0.0)), M('MINIMUM', M('MAXIMUM', qx, qy), 0.0)), rc)
                o_ = g.smooth(M('ABSOLUTE', d), 0.0009, 0.0003); ho = o_ if ho is None else M('MAXIMUM', ho, o_)
            ho = M('MULTIPLY', ho, skin)
            jw = None                                                                            # грязь, набившаяся у швов (полоса 1 см, рваная)
            for a in JOINTS:
                l_ = g.smooth(M('ABSOLUTE', M('SUBTRACT', Yv, YA(a))), 0.010, 0.001); jw = l_ if jw is None else M('MAXIMUM', jw, l_)
            jw = M('MULTIPLY', M('MULTIPLY', jw, skin), g.smooth(photo(g, 'si13', pos, 3.0, rot=0.3), 0.15, 0.7))
            col = g.mix(col, GRIME, M('MULTIPLY', jw, 0.30 + 0.15 * w))
            halo = g.smooth(M('MULTIPLY', sc_, 1.0), 0.0, 0.6)
            col = g.mix(col, (0.20, 0.20, 0.21), M('MULTIPLY', M('MAXIMUM', jl, ho), 0.70)); col = g.mix(col, (0.30, 0.30, 0.31), M('MULTIPLY', sc_, 0.70))
            hadd(jl, -1.0); hadd(ho, -0.8); hadd(sc_, 0.35)
            # захватанные места у крюков, потёртый короб, копоть на торце у сопла
            hand = M('MAXIMUM', near((0, YA(LUGS[0]), R), 0.12), near((0, YA(LUGS[1]), R), 0.12))
            hm = M('MULTIPLY', hand, g.smooth(photo(g, 'si13', pos, 2.2, rot=2.0), 0.3, 0.7))
            col = g.mix(col, (0.36, 0.36, 0.35), M('MULTIPLY', hm, 0.45)); rg = M('SUBTRACT', rg, M('MULTIPLY', hand, 0.18))   # затёрто руками до блеска
            race = M('MULTIPLY', g.smooth(Z, -(R + 0.004), -(R + 0.012)), g.smooth(photo(g, 'sc3', g.n('ShaderNodeMapping', Vector=pos, Scale=(1.0, 0.3, 1.0)).outputs['Vector'], 2.0), 0.6, 0.9))
            col = g.mix(col, (0.62, 0.63, 0.64), M('MULTIPLY', race, 0.5))
            col = g.mix(col, SOOT, M('MULTIPLY', M('MULTIPLY', g.smooth(Yv, YA(BODY_END - 0.012), YA(BODY_END + 0.004)), g.smooth(g.n('ShaderNodeTexNoise', Vector=pos, Scale=25.0, Detail=2.0).outputs['Fac'], 0.15, 0.85)), 0.40))   # лёгкая копоть только на торце
        if kind == 'radome':                                                                     # обтекатель: лёгкая эрозия к носу, лак
            tip = g.smooth(Yv, YA(0.30), YA(0.02)); col = g.mix(col, (0.62, 0.60, 0.54), M('MULTIPLY', M('MULTIPLY', tip, g.smooth(photo(g, 'si3', pos, 3.0), 0.4, 0.9)), 0.4))
            rg = M('ADD', rg, M('MULTIPLY', tip, 0.15))
        # сколы на кромках (перья - до металла)
        bev = g.n('ShaderNodeBevel', Radius=0.003, _samples=8)
        dp = g.n('ShaderNodeVectorMath', _operation='DOT_PRODUCT', Vector=bev.outputs['Normal'], Vector_001=geo.outputs['Normal']).outputs['Value']
        edge = M('MULTIPLY', g.smooth(dp, 0.985, 0.90), g.smooth(M('ADD', photo(g, 'sc3', pos, 2.5, rot=0.3), M('MULTIPLY', g.n('ShaderNodeTexNoise', Vector=pos, Scale=40.0, Detail=6.0).outputs['Fac'], 0.6)), 0.6, 0.9))
        chip = M('MULTIPLY', edge, 0.7 * w + 0.15)
        if kind == 'body': chip = M('MULTIPLY', chip, g.smooth(Yv, YA(BODY_END - 0.012), YA(BODY_END - 0.03)))   # скос у сопла - не кромка (проба 2: белёсое облако)
        col = g.mix(col, (0.55, 0.56, 0.57) if kind == 'fin' else (0.62, 0.62, 0.60), g.smooth(chip, 0.2, 0.5)); met = M('MULTIPLY', g.smooth(chip, 0.4, 0.7), 0.8 if kind == 'fin' else 0.0)
        hadd(chip, -0.2)
        # трафареты
        if not DEC: DEC.append(bpy.data.images.load(os.path.join(HERE, 'k14_decals.png'), check_existing=True))
        for proj, row, c1, c2, hh, cc in TEXTS:
            if (proj == 'fin') != (kind == 'fin') or (kind == 'radome'): continue
            ww = hh * 8.0
            if proj == 'side':
                u = M('MULTIPLY', M('SUBTRACT', Yv, YA(c1) - ww / 2), 1.0 / ww); v = M('MULTIPLY', M('SUBTRACT', Z, c2 - hh / 2), 1.0 / hh)
                face = M('MULTIPLY', M('GREATER_THAN', M('ABSOLUTE', N.outputs['X']), 0.45), skin); ux = M('ADD', M('MULTIPLY', M('SUBTRACT', u, 0.5), M('SIGN', X)), 0.5)
            else:                                                                                # на перьях: u вдоль хорды, v по радиусу пера (для каждого из 4 направлений)
                v = None; face = None; sg = None
                for phi in ANG:
                    c, s_ = math.cos(math.radians(phi)), math.sin(math.radians(phi))
                    sd = M('ADD', M('MULTIPLY', X, c), M('MULTIPLY', Z, s_)); tdist = M('ADD', M('MULTIPLY', X, -s_), M('MULTIPLY', Z, c))
                    m_ = M('MULTIPLY', M('LESS_THAN', M('ABSOLUTE', tdist), 0.01), M('GREATER_THAN', sd, 0.05))
                    v_ = M('MULTIPLY', M('SUBTRACT', sd, c2 - hh / 2), 1.0 / hh)
                    nt = M('ADD', M('MULTIPLY', N.outputs['X'], -s_), M('MULTIPLY', N.outputs['Z'], c))
                    v = M('MULTIPLY', m_, v_) if v is None else M('ADD', v, M('MULTIPLY', m_, v_)); face = m_ if face is None else M('MAXIMUM', face, m_)
                    sg = M('MULTIPLY', m_, M('SIGN', nt)) if sg is None else M('ADD', sg, M('MULTIPLY', m_, M('SIGN', nt)))
                u = M('MULTIPLY', M('SUBTRACT', Yv, YA(c1) - ww / 2), 1.0 / ww); ux = M('ADD', M('MULTIPLY', M('SUBTRACT', u, 0.5), M('MULTIPLY', sg, -1.0)), 0.5)   # на обеих гранях читается (проба 1 была зеркальной)
            ins = M('MULTIPLY', M('MULTIPLY', M('GREATER_THAN', u, 0.0), M('LESS_THAN', u, 1.0)), M('MULTIPLY', M('GREATER_THAN', v, 0.0), M('LESS_THAN', v, 1.0)))
            cv = g.n('ShaderNodeCombineXYZ', X=ux, Y=M('MULTIPLY', M('ADD', v, NROW - 1 - row), 1.0 / NROW), Z=0.0).outputs['Vector']
            ti = g.n('ShaderNodeTexImage', Vector=cv); ti.image = DEC[0]; ti.extension = 'CLIP'
            tcol = (0.03, 0.03, 0.035) if cc == 'k' else (0.55, 0.56, 0.57)
            col = g.mix(col, tcol, M('MULTIPLY', M('MULTIPLY', ti.outputs['Alpha'], M('MULTIPLY', ins, face)), 0.92))
    elif kind == 'steel':
        col = g.mix((0.38, 0.38, 0.39), (0.16, 0.15, 0.14), g.smooth(photo(g, 'si13', pos, 4.0), 0.3, 0.7)); rg = 0.40; met = 0.85
        hadd(g.smooth(photo(g, 'sc3', pos, 5.0), 0.6, 0.9), 0.2)
    elif kind == 'nozzle':
        col = g.mix((0.05, 0.045, 0.04), (0.015, 0.013, 0.012), g.smooth(Yv, YA(L - 0.02), YA(L - 0.06))); rg = 0.75; met = 0.4
    else:
        col = (0.03, 0.03, 0.03); rg = 0.6
    if isinstance(col, tuple): c_ = g.n('ShaderNodeRGB').outputs[0]; c_.node.outputs[0].default_value = (*col, 1.0); col = c_
    ao2 = g.n('ShaderNodeAmbientOcclusion', Distance=0.03, _samples=64, _only_local=True).outputs['AO']   # 64 луча и только своя деталь: иначе у торца пятна шума (проба 2)
    col = g.mix(col, (0.06, 0.06, 0.06), M('MULTIPLY', g.smooth(M('SUBTRACT', 1.0, ao2), 0.08, 0.6), 0.30))
    hadd(g.n('ShaderNodeTexNoise', Vector=pos, Scale=900.0, Detail=1.0).outputs['Fac'], 0.04)
    bump = g.n('ShaderNodeBump', Strength=0.35, Distance=0.0005, Height=height[0], Normal=g.n('ShaderNodeBevel', Radius=0.0015, _samples=8).outputs['Normal'])
    bs = g.n('ShaderNodeBsdfPrincipled', **{'Base Color': col, 'Roughness': rg, 'Metallic': met, 'Normal': bump.outputs['Normal'],
                                            'Coat Weight': 0.08 if kind == 'radome' else 0.0, 'Coat Roughness': 0.15, 'Specular IOR Level': 0.35 if kind in ('body', 'fin') else 0.5})
    g.n('ShaderNodeOutputMaterial', Surface=bs.outputs['BSDF'])


KIND = {'K14_body': 'body', 'K14_radome': 'radome', 'K14_fin': 'fin', 'K14_steel': 'steel', 'K14_nozzle': 'nozzle', 'K14_dark': 'dark'}


def apply_paint(wear=1):
    for m in bpy.data.materials:
        if m.name in KIND: paint_tree(m, KIND[m.name], wear)
