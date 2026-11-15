# build.py — ракета Х-59М «Овод-М», своя модель по картинкам Mark (Свои/Х-59М/референсы), 2026-11-15.
# Форма - по чертежу 04 (вид 2 «в полётной конфигурации», нос слева: нос x 36, хвост x 530, ось y 166; вид 1 «в стартовой» - ускоритель и сложенные рули;
# виды спереди и сзади), детали - по фото 02, 05 (купол ТВ-головки, рули, двигатель, хвост), 03 (общий вид), 01 (только форма).
# Масштаб: стартовая длина на чертеже 551 пикс. (сопло ускорителя x 10 … нос x 561) = 5,69 м, как прежняя модель в игре; линейка чертежа (95 пикс./м) даёт 5,80 - расхождение 2 %.
# Полётная длина (без ускорителя) - 494 пикс. = 5,10 м. Игровой файл - полётная конфигурация (так ракета висит на фото 02, 05).
# Оси: метры, нос +Y (glTF −Z), верх +Z, начало - на оси посередине полётной длины. Оперение крестом «×»: рули и крылья на 45°, 135°, 225°, 315° (от +X к +Z).
# Узлы: body (корпус с кабельным коробом и пилоном двигателя, задний купол антенны, бугели, ложементы рулей, гребни у корня крыльев, штырь у хвоста),
#   engine (подвесной ТРД: гондола, заборник с компрессором и коком, сопло с конусом), dome (стекло купола), seeker (камера под куполом),
#   wing1…wing4 (крылья), ail1…ail4 (элероны у корня на задней кромке, ось радиальная, ±15°), can1…can4 (носовые рули: поворот ±15° вокруг радиальной оси,
#   складывание - FOLD ниже), booster (стартовый ускоритель - только стартовая конфигурация и Sketchfab, в игровой файл не идёт).
# Запуск: Blender -b --factory-startup --python build.py   (X59_POSE="0.6,-0.4,0" - рули, элероны (доли от 15°), складывание рулей 0…1; X59_START=1 - с ускорителем)
import os, math
import bpy, bmesh
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Х-59М'
exec(compile(open(os.path.join(HERE, 'x59kit.py'), encoding='utf-8').read(), os.path.join(HERE, 'x59kit.py'), 'exec'))

SPX = 5.69 / 551.0; X0 = 36.0; AXY = 166.0
L = (530.0 - X0) * SPX                           # полётная длина 5,10 м
def A(x): return (x - X0) * SPX                  # x пикселя вида 2 чертежа 04 → расстояние от носа, м
def YA(a): return L / 2 - a                      # расстояние от носа → Y модели
def S45(y): return (AXY - y) / math.sqrt(0.5) * SPX   # y кромки оперения на виде сбоку (проекция под 45°) → радиус от оси, м
R = 16.0 * SPX                                   # корпус Ø 32 пикс. (вид спереди: окружность x 69…101)
ANG = [45.0, 135.0, 225.0, 315.0]                # оперение «×»: 1 - верх справа (+X+Z), 2 - верх слева, 3 - низ слева, 4 - низ справа
def D(phi): r = math.radians(phi); return V(math.cos(r), 0, math.sin(r))
def T(phi): r = math.radians(phi); return V(-math.sin(r), 0, math.cos(r))
def P(a, s, phi, t=0.0): return D(phi) * s + T(phi) * t + V(0, YA(a), 0)

# купол ТВ-головки: стекло - сфера R 0,160 с вершиной на носу; металлический обод - продолжение сферы корпуса (R) до x 52,5
DOME = dict(rs=0.160, a_rim=0.094)
# носовой руль (сетка _замеры/g_нос.png; корень на 1,5 мм выше ложемента - зазор при повороте, _limits.py): корень x 57…88 на ложементе, законцовка x 107,5…110 на y 121 (радиус 63,6 пикс.); ось поворота x 73
CAN = dict(piv=A(73), rle=A(57), rte=A(88), tle=A(107.5), tte=A(110), s0=R + 0.0135, s1=S45(121), t0=0.012, t1=0.004, rail=(A(56), A(92)))
# крыло (g_хвост.png): передняя кромка - кривая (x, y кромки на виде сбоку), законцовка x 465…495 на y 113,5, задняя кромка x 495 прямая
WLE = [(358, AXY - 16 * math.sqrt(0.5)), (365, 152.0), (400, 138.0), (430, 126.0), (455, 117.0), (465, 114.5), (470, 113.6)]
WNG = dict(te=A(495), s0=R - 0.004, s1=S45(113.6), t0=0.020, t1=0.007, root=(A(426), A(495)))
AIL = dict(h=A(482), te=A(495) - 0.0015, s0=R + 0.030, s1=S45(124.0), rr=0.0055, gap=0.004)
# гондола двигателя (g_двигатель.png, вид спереди g_торцы.png): x 311…385, ось на 42 пикс. ниже оси корпуса; Ø по виду спереди 26 пикс.
ENG = dict(a0=A(311), a1=A(385), ast=A(364), z=-42.0 * SPX, r=13.0 * SPX, ri=10.2 * SPX, rn=11.2 * SPX, rx=9.0 * SPX)
DUCT = dict(a0=A(92), a1=A(318), w=0.052, d=7.0 * SPX)            # кабельный короб снизу: x 92 … пилон, глубина 7 пикс.
PYL = dict(f0=A(300), f1=A(318), r0=A(380), r1=A(402), w=0.046)      # пилон двигателя: передняя кромка x 300 → 318 вниз, задняя x 380 → 402 вверх
LUG = dict(a=A(273), x=0.052)                                        # бугели сверху (вид спереди - два «ушка» рядом)
TAIL = dict(a_col=A(497), a_dome=A(500), r_col=0.158, r_dome=14.5 * SPX)   # кольцо и задний купол антенны (x 500 … 530)
# швы отсеков (x пикс. вида 2 → a): у купола 52,5, отсек рулей 92/96, 113, 150/155, 225, 300, 326/330/336/340/347, 360, 380, 426, 470, 480, кольцо 497
JOINTS = [A(x) for x in (52.5, 92, 96, 113, 150, 155, 225, 300, 326, 330, 336, 340, 347, 360, 380, 426, 470, 480, 497)]
# лючки: (a0, a1, φ центра, ширина по дуге м, вид) - по виду 2 чертежа 04 (борт φ 180) и виду 3 (борт φ 0); уточняются в окраске
HATCHES = [(A(158), A(196), 180.0, 0.20, 'rect'), (A(113), A(120), 160.0, 0.05, 'rect'), (A(176), A(181), 205.0, 0.04, 'round'),
           (A(394), A(402), 180.0, 0.07, 'round'), (A(430), A(470), 180.0, 0.16, 'rect'), (A(330), A(347), 180.0, 0.20, 'rect')]
# стартовая конфигурация (вид 1, нос справа x 561: x_полёт = 597 − x_старт): ускоритель x_старт 10 … 77
BST = dict(a_ad=A(497) - 0.004, a_fl=A(520), a_cy=A(526), a_cap=A(567), a_th=A(575), a_ex=A(587), r_ad=0.168, r_cy=17.5 * SPX, r_th=5.5 * SPX, r_ex=11.0 * SPX)


def scene():
    sc = bpy.data.scenes.get('X59') or bpy.data.scenes.new('X59')
    if bpy.context.window: bpy.context.window.scene = sc
    col = bpy.data.collections.get('X59') or bpy.data.collections.new('X59')
    if col.name not in sc.collection.children: sc.collection.children.link(col)
    for o in list(col.objects): bpy.data.objects.remove(o, do_unlink=True)
    return sc, col


sc, COL = scene(); make_mats()
for o in list(bpy.data.objects):
    if o.name in ('Cube', 'Light', 'Camera'): bpy.data.objects.remove(o, do_unlink=True)
NOSE = V(0, L / 2, 0); AFT = V(0, -1, 0)


def mk(b, pivot=(0, 0, 0), sharp=32):
    pv = Vector(pivot); bmesh.ops.translate(b.bm, verts=b.bm.verts, vec=-pv)
    o = b.finish(COL, sharp=sharp); o.location = pv; return o


def boolean(o, cutter, op):
    md = o.modifiers.new('bool', 'BOOLEAN'); md.operation = op; md.object = cutter
    try: md.solver = 'EXACT'
    except Exception: pass
    try: md.material_mode = 'INDEX'
    except Exception: pass
    bpy.context.view_layer.objects.active = o
    with bpy.context.temp_override(object=o, active_object=o): bpy.ops.object.modifier_apply(modifier=md.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def body_core():
    b = B('body'); rs = DOME['rs']; ar = DOME['a_rim']
    rin = math.sqrt(rs * rs - (rs - ar) ** 2) - 0.0015                                                   # край под стеклом
    rb = lambda a: math.sqrt(max(R * R - (R - a) ** 2, 0.0))                                              # сфера обода (продолжение корпуса)
    p = [(0.150, 0.0006, M_DARK), (0.150, 0.110, M_DARK), (0.118, 0.132, M_DARK), (ar, rin, M_STEEL), (ar, rb(ar), M_BODY)]   # чаша под стеклом, обод
    for i in range(1, 9): a = ar + (R - ar) * i / 8; p.append((a, rb(a), M_BODY))                         # обод сферой до полного радиуса (фото 05: стекло в металлическом кольце)
    j0 = A(52.5)
    p += [(j0 - 0.002, R, M_BODY), (j0, R - 0.002, M_BODY), (j0 + 0.002, R, M_BODY)]                      # стык головного отсека
    for a in (0.30, CAN['rail'][1], 0.75, 1.0, 1.4, 1.8, 2.2, 2.6, 2.75, 2.95, 3.2, 3.4, 3.6, 3.85, 4.03, 4.3, 4.55):
        p.append((a, R, M_BODY))
    ac, ad = TAIL['a_col'], TAIL['a_dome']; rc, rd = TAIL['r_col'], TAIL['r_dome']
    p += [(ac - 0.003, R, M_BODY), (ac, rc, M_STEEL), (ad - 0.002, rc, M_STEEL), (ad, rd, M_RADOME)]       # стыковое кольцо, задний купол антенны
    ln = L - ad
    for i in range(1, 21):                                                                                # купол: почти цилиндр до x 511, дальше скругление (суперэллипс 2,5)
        t = i / 20; p.append((ad + ln * t, max(rd * (1 - t ** 2.5) ** (1 / 2.5), 0.0006), M_RADOME))
    lathe(b, NOSE, AFT, [(a, r) for a, r, _ in p], [m for _, _, m in p[:-1]], n=64, cap0=True, cap1=True)
    return mk(b, sharp=40)


def duct_pylon():
    """кабельный короб снизу (x 92 … 318) и пилон двигателя (x 300 … 402) одним телом; верх - внутри корпуса (объединяется)"""
    b = B('duct'); zt = -R + 0.03; zp = ENG['z'] + ENG['r'] - 0.012                                         # низ пилона уходит в гондолу на 1,2 см
    def ring(a, zb, w, c=0.012):
        c = min(c, (zt - zb) * 0.45, w * 0.9)
        return [V(-w, YA(a), zt), V(w, YA(a), zt), V(w, YA(a), zb + c), V(w - c * 0.3, YA(a), zb + c * 0.3), V(w - c, YA(a), zb),
                V(-w + c, YA(a), zb), V(-w + c * 0.3, YA(a), zb + c * 0.3), V(-w, YA(a), zb + c)]
    zd = -R - DUCT['d']; rings = []
    for i in range(7):                                                                                    # нос короба - скос назад-вниз (x 92 → 100)
        t = i / 6; rings.append(ring(DUCT['a0'] + 0.085 * t, -R + 0.004 - (DUCT['d'] + 0.004) * math.sin(t * math.pi / 2), DUCT['w'] * (0.6 + 0.4 * t)))
    for a in (0.9, 1.3, 1.7, 2.1, 2.5, PYL['f0']): rings.append(ring(a, zd, DUCT['w']))
    for i in range(1, 9):                                                                                 # передняя кромка пилона: вниз к гондоле
        t = i / 8; a = PYL['f0'] + (PYL['f1'] - PYL['f0']) * t; rings.append(ring(a, zd + (zp - zd) * (1 - (1 - t) ** 1.6), DUCT['w'] - (DUCT['w'] - PYL['w']) * t))
    for a in (3.10, 3.30, PYL['r0']): rings.append(ring(a, zp, PYL['w']))
    for i in range(1, 9):                                                                                 # задняя кромка пилона: вверх к корпусу
        t = i / 8; a = PYL['r0'] + (PYL['r1'] - PYL['r0']) * t; rings.append(ring(a, zp + (zt - 0.004 - zp) * (t ** 0.8), PYL['w'] * (1 - 0.55 * t)))
    b.loft(rings, M_BODY)
    return mk(b)


def engine():
    """подвесной ТРД (фото 02, 05): толстая губа заборника, компрессор с коком, гондола со швом x 364, сужение к соплу, сопло с конусом"""
    E = ENG; b = B('engine'); o = V(0, YA(E['a0']), E['z']); r, ri = E['r'], E['ri']
    p = [(0.110, ri - 0.004, M_DARK), (0.040, ri - 0.001, M_DARK), (0.012, ri + 0.001, M_BODY)]
    for i in range(0, 10):                                                                                # губа: полуокружность от внутренней стенки к наружной
        th = math.pi * i / 9; rr = (r - ri) / 2; p.append((rr - rr * math.sin(th), (ri + r) / 2 - rr * math.cos(th), M_BODY))
    ls = E['ast'] - E['a0']; le = E['a1'] - E['a0']
    p += [(0.10, r, M_BODY), (0.30, r, M_BODY), (ls - 0.004, r, M_BODY), (ls, r - 0.003, M_BODY), (ls + 0.004, r - 0.002, M_HEAT)]
    for i in range(1, 7): t = i / 6; p.append((ls + (le - ls) * t, r - 0.002 - (r - E['rn']) * t ** 1.4, M_HEAT))
    p += [(le, E['rx'] + 0.004, M_HEAT), (le - 0.010, E['rx'], M_DARK), (le - 0.090, E['rx'] - 0.004, M_DARK)]
    lathe(b, o, AFT, [(a, rr) for a, rr, _ in p], [m for _, _, m in p[:-1]], n=48, cap0=False, cap1=False)
    lathe(b, o, AFT, [(0.112, 0.0005), (0.112, ri - 0.003)], M_DARK, n=32, cap0=False, cap1=False)       # стенка за компрессором
    lathe(b, o, AFT, [(0.020, 0.0005), (0.030, 0.012), (0.045, 0.026), (0.062, 0.031), (0.080, 0.031)], M_FAN, n=24, cap0=False, cap1=False)   # кок
    NB = 24                                                                                               # лопатки компрессора (фото 05: ~20 узких лопаток)
    for k in range(NB):
        th0 = 2 * math.pi * k / NB; rings = []
        for rr in (0.029, ri - 0.004):
            tw = math.radians(28 + 18 * (rr - 0.029) / (ri - 0.033)); ch = 0.042; c_, s_ = math.cos(th0), math.sin(th0)
            rad = V(c_, 0, s_); tan = V(-s_, 0, c_); ctr = o + rad * rr + V(0, -0.068, 0)
            d1 = V(0, -math.cos(tw), 0) * (ch / 2) + tan * (math.sin(tw) * ch / 2); nrm = V(0, math.sin(tw), 0) + tan * math.cos(tw)
            rings.append([ctr - d1 + nrm * 0.0012, ctr + d1 + nrm * 0.0006, ctr + d1 - nrm * 0.0006, ctr - d1 - nrm * 0.0012])
        b.loft(rings, M_FAN)
    lathe(b, o, AFT, [(0.095, ri - 0.004), (0.095, ri - 0.012), (0.101, ri - 0.012)], M_FAN, n=32, cap0=False, cap1=False)   # обод направляющего аппарата
    lathe(b, o, AFT, [(le - 0.090, 0.0006), (le - 0.090, 0.046), (le - 0.040, 0.040), (le - 0.002, 0.004)], M_HEAT, n=28, cap0=False, cap1=False)   # конус сопла
    return mk(b, sharp=45)


def details(b):
    # ложементы носовых рулей (вид 2: тёмные рейки x 56…92 у корня рулей): вытянутая площадка с шарниром складывания
    a0, a1 = CAN['rail']
    for phi in ANG:
        rg = []
        for a, k in ((a0, 0.25), (a0 + 0.015, 0.8), (a0 + 0.035, 1.0), (a1 - 0.03, 1.0), (a1 - 0.012, 0.8), (a1, 0.25)):
            w = 0.017 * (0.6 + 0.4 * k); hh = 0.012 * k
            rg.append([P(a, R - 0.005, phi, -w), P(a, R + hh * 0.7, phi, -w), P(a, R + hh, phi, -w * 0.7), P(a, R + hh, phi, w * 0.7), P(a, R + hh * 0.7, phi, w), P(a, R - 0.005, phi, w)])
        b.loft(rg, M_BODY)
    # гребни у корня крыльев (вид 2: полосы y 150…153 от x 426 до 495, спереди острый носок)
    r0, r1 = WNG['root']
    for phi in ANG:
        rg = []
        for a, k in ((r0 - 0.06, 0.02), (r0 - 0.02, 0.5), (r0 + 0.02, 1.0), (r1 - 0.004, 1.0), (r1, 0.6)):
            w = 0.016 * k; hh = 0.022 * k
            rg.append([P(a, R - 0.006, phi, -w), P(a, R + hh * 0.65, phi, -w), P(a, R + hh, phi, -w * 0.55), P(a, R + hh, phi, w * 0.55), P(a, R + hh * 0.65, phi, w), P(a, R - 0.006, phi, w)])
        b.loft(rg, M_BODY)
    # бугели подвески сверху (вид спереди - два ушка рядом, вид сбоку - выступ x 270…277)
    for sx in (-1, 1):
        x = sx * LUG['x']; y = YA(LUG['a'])
        b.box((x, y, R - 0.002), (0.040, 0.080, 0.014), M_STEEL)
        b.box((x, y, R + 0.016), (0.012, 0.050, 0.026), M_STEEL)
        b.cyl((x - 0.009, y, R + 0.026), (x + 0.009, y, R + 0.026), 0.017, 0.017, M_STEEL, n=16)
    # штырь антенны под задним куполом (x 497 … 517, y 183,5) на кронштейне
    b.box((0, YA(A(500)), -R - 0.010), (0.022, 0.060, 0.034), M_STEEL)
    b.cyl((0, YA(A(502)), -R - 0.016), (0, YA(A(517)), -R - 0.016), 0.0055, 0.004, M_STEEL, n=10)
    # опоры носовых рулей: круглая площадка с винтами у оси поворота (сверху ложемента)
    for phi in ANG:
        lathe(b, P(CAN['piv'], R + 0.006, phi), D(phi), [(0.0, 0.020), (0.0055, 0.020), (0.0068, 0.018)], M_STEEL, n=20, cap0=False, cap1=True)


def section(a_le, a_te, s, phi, th, lead=0.18, trail=0.12):
    c = a_te - a_le
    return [P(a_le, s, phi), P(a_le + c * lead, s, phi, th / 2), P(a_te - c * trail, s, phi, th / 2), P(a_te, s, phi, th * 0.12),
            P(a_te, s, phi, -th * 0.12), P(a_te - c * trail, s, phi, -th / 2), P(a_le + c * lead, s, phi, -th / 2)]


def wle(s):
    """передняя кромка крыла (a) на радиусе s - по кривой WLE чертежа"""
    pts = [(S45(y), A(x)) for x, y in WLE]
    if s <= pts[0][0]: return pts[0][1]
    for (s0, a0), (s1, a1) in zip(pts, pts[1:]):
        if s <= s1: return a0 + (a1 - a0) * (s - s0) / (s1 - s0)
    return pts[-1][1]


def wing(k, phi):
    W = WNG; b = B(f'wing{k}'); th = lambda s: W['t0'] + (W['t1'] - W['t0']) * (s - W['s0']) / (W['s1'] - W['s0'])
    tn = AIL['h'] - AIL['gap']; sa0 = AIL['s0'] - AIL['gap']; sa1 = AIL['s1'] + AIL['gap']
    secs = []
    for s in [W['s0'], sa0 - 1e-4]: secs.append(section(wle(s), W['te'], s, phi, th(s), lead=0.10))
    for s in [sa0, sa0 + (sa1 - sa0) * 0.35, sa0 + (sa1 - sa0) * 0.7, sa1 - 1e-4]: secs.append(section(wle(s), tn, s, phi, th(s), lead=0.10))
    for s in [sa1, W['s1'] - 0.012, W['s1']]: secs.append(section(wle(s), W['te'], s, phi, th(s), lead=0.12))
    b.loft(secs, M_BODY)
    return mk(b, sharp=40)


def aileron(k, phi):
    A_ = AIL; b = B(f'ail{k}'); ah = A_['h'] + A_['rr']
    tw = lambda s: (WNG['t0'] + (WNG['t1'] - WNG['t0']) * (s - WNG['s0']) / (WNG['s1'] - WNG['s0'])) * 0.42
    def sec(s):
        q = []
        for j in range(7): th_ = math.pi / 2 + math.pi * j / 6; q.append(P(ah + A_['rr'] * math.cos(th_), s, phi, A_['rr'] * math.sin(th_)))
        q += [P(A_['te'], s, phi, -0.0012), P(A_['te'], s, phi, 0.0012)]
        return q
    b.loft([sec(A_['s0']), sec(A_['s1'])], M_BODY)
    return mk(b, pivot=P(ah, A_['s0'], phi), sharp=40)


def canard(k, phi):
    C = CAN; b = B(f'can{k}')
    b.loft([section(C['rle'], C['rte'], C['s0'], phi, C['t0'], lead=0.30, trail=0.15), section(C['tle'], C['tte'], C['s1'], phi, C['t1'], lead=0.30, trail=0.15)], M_BODY)
    b.cyl(P(C['piv'], R + 0.0075, phi), P(C['piv'], C['s0'] + 0.003, phi), 0.009, 0.009, M_STEEL, n=12)   # вал руля над опорой
    return mk(b, pivot=P(C['piv'], R, phi), sharp=40)


def dome_and_seeker():
    rs, ar = DOME['rs'], DOME['a_rim']
    b = B('dome'); n = 14; th1 = math.acos((rs - ar - 0.006) / rs)                                         # стекло заходит под обод на 6 мм
    lathe(b, NOSE, AFT, [(rs - rs * math.cos(th1 * i / n), max(rs * math.sin(th1 * i / n), 0.0004)) for i in range(n + 1)], M_GLASS, n=56, cap0=True, cap1=False)
    dome = mk(b, sharp=80)
    s = B('seeker'); import random; rnd = random.Random(59)                                                # ТВ-головка под стеклом (фото 11): крупный объектив внизу справа, подвес, блоки, жгуты
    yl = lambda a: YA(a)
    lens = V(0.030, 0.0, -0.040)                                                                          # объектив: бленда, линза, тубус
    lathe(s, lens + V(0, YA(0.050), 0), AFT, [(0.0, 0.0004), (0.0, 0.034), (0.004, 0.040), (0.004, 0.048), (0.010, 0.050), (0.075, 0.050), (0.075, 0.040)],
          [M_OPTIC, M_CAM, M_CAM, M_CAM, M_CAM, M_CAM], n=28, cap0=True, cap1=True)
    lathe(s, lens + V(0, YA(0.052), 0), AFT, [(0.0, 0.0004), (0.0, 0.031)], M_OPTIC, n=24, cap0=False, cap1=False)
    s.cyl(V(0.030 - 0.062, YA(0.090), -0.040), V(0.030 + 0.062, YA(0.090), -0.040), 0.020, 0.020, M_CAM, n=14)   # ось подвеса по тангажу
    for sx in (-1, 1): s.box((0.030 + sx * 0.066, YA(0.092), -0.040), (0.010, 0.050, 0.060), M_STEEL)          # щёки подвеса
    s.box((0.030, YA(0.126), -0.040), (0.150, 0.016, 0.110), M_CAM)                                        # плита основания
    s.cyl(V(-0.020, YA(0.060), 0.040), V(-0.020, YA(0.100), 0.040), 0.016, 0.016, M_STEEL, n=14)            # двигатель привода (серебристый цилиндр на фото)
    s.cyl(V(-0.020, YA(0.058), 0.040), V(-0.020, YA(0.061), 0.040), 0.012, 0.012, M_BRASS, n=14)
    for (x, a, z, sx_, sy_, sz_) in ((0.060, 0.100, 0.060, 0.040, 0.035, 0.030), (-0.065, 0.095, 0.010, 0.030, 0.045, 0.050), (0.010, 0.105, 0.090, 0.050, 0.030, 0.025),
                                     (-0.055, 0.105, -0.075, 0.040, 0.030, 0.030), (0.075, 0.110, -0.010, 0.025, 0.030, 0.040), (-0.035, 0.085, 0.085, 0.025, 0.020, 0.020)):
        s.box((x, YA(a), z), (sx_, sy_, sz_), M_CAM)                                                       # блоки электроники
        s.box((x + sx_ * 0.2, YA(a - sy_ / 2 - 0.003), z + sz_ * 0.2), (sx_ * 0.35, 0.006, sz_ * 0.3), M_BRASS)   # разъём на блоке
    def wire(pts, r, m):                                                                                  # жгут по ломаной (сглаженной)
        sm = []
        for i in range(len(pts) - 1):
            for k in range(4): t_ = k / 4; sm.append(pts[i].lerp(pts[i + 1], t_))
        sm.append(pts[-1])
        for i in range(len(sm) - 1): s.cyl(sm[i], sm[i + 1], r, r, m, n=6, caps=False)
    for i in range(14):
        ph = rnd.uniform(0, 2 * math.pi); rr = rnd.uniform(0.04, 0.10)
        p0 = V(rr * math.cos(ph), YA(rnd.uniform(0.10, 0.125)), rr * math.sin(ph)); ph2 = ph + rnd.uniform(0.6, 1.8); rr2 = rnd.uniform(0.03, 0.10)
        p2 = V(rr2 * math.cos(ph2), YA(rnd.uniform(0.07, 0.115)), rr2 * math.sin(ph2)); p1 = (p0 + p2) / 2 + V(0, rnd.uniform(0.01, 0.03), 0)
        wire([p0, p1, p2], rnd.choice((0.0035, 0.005, 0.007)), M_WIREO if i % 4 == 1 else M_WIRE)
    return dome, mk(s, sharp=50)


def booster():
    """стартовый ускоритель (вид 1, x_старт 10 … 100): переходник на хвосте, фланец, цилиндр, конус, раструб сопла"""
    S = BST; b = B('booster')
    p = [(S['a_ad'] + 0.03, 0.1505, M_DARK), (S['a_ad'], 0.1505, M_DARK), (S['a_ad'], S['r_ad'], M_BODY), (S['a_fl'] - 0.004, S['r_ad'], M_BODY),
         (S['a_fl'], S['r_ad'] + 0.006, M_STEEL), (S['a_cy'], S['r_ad'] + 0.006, M_STEEL), (S['a_cy'] + 0.004, S['r_cy'], M_BODY)]
    for a in (5.2, 5.35): p.append((a, S['r_cy'], M_BODY))
    for i in range(1, 6): t = i / 5; p.append((S['a_cap'] + 0.03 * t, S['r_cy'] - 0.012 * t ** 2, M_BODY))
    p += [(S['a_th'], S['r_th'] + 0.004, M_HEAT), (S['a_th'] + 0.01, S['r_th'], M_HEAT)]
    for i in range(1, 7): t = i / 6; p.append((S['a_th'] + 0.01 + (S['a_ex'] - S['a_th'] - 0.01) * t, S['r_th'] + (S['r_ex'] - S['r_th']) * t ** 0.8, M_HEAT))
    p += [(S['a_ex'], S['r_ex'] - 0.004, M_DARK), (S['a_th'] + 0.015, S['r_th'] - 0.006, M_DARK), (S['a_th'] + 0.02, 0.0006, M_DARK)]
    lathe(b, NOSE, AFT, [(a, r) for a, r, _ in p], [m for _, _, m in p[:-1]], n=56, cap0=True, cap1=False)
    return mk(b, sharp=40)


BODY = body_core()
boolean(BODY, duct_pylon(), 'UNION')
_ex = B('body_ex'); details(_ex); EX = mk(_ex)
with bpy.context.temp_override(active_object=BODY, selected_editable_objects=[BODY, EX], selected_objects=[BODY, EX]):
    bpy.ops.object.join()
BODY.name = 'body'; BODY.data.name = 'body'
ENGINE = engine()
WINGS = [wing(i + 1, a) for i, a in enumerate(ANG)]
CANS = [canard(i + 1, a) for i, a in enumerate(ANG)]
AILS = [aileron(i + 1, a) for i, a in enumerate(ANG)]
DOMEO, SEEKER = dome_and_seeker()
BOOSTER = booster()
BOOSTER.hide_render = BOOSTER.hide_viewport = os.environ.get('X59_START', '0') != '1'
MOVE = {o.name: dict(axis=D(a), lim=(-15.0, 15.0), kind='can', phi=a) for o, a in zip(CANS, ANG)}
MOVE.update({o.name: dict(axis=D(a), lim=(-15.0, 15.0), kind='ail', phi=a) for o, a in zip(AILS, ANG)})
# складывание носовых рулей (стартовая конфигурация, вид 1): поворот в плоскости руля вокруг оси T(φ) через заднюю точку корня - законцовка ложится назад к корпусу
FOLD = dict(deg=-65.5, a=CAN['rte'], s=CAN['s0'])
bpy.context.view_layer.update()
BASEM = {n: bpy.data.objects[n].matrix_world.copy() for n in MOVE}


def pose(kc=0.0, ka=0.0, kf=0.0):
    """kc, ka: доли от 15° для рулей и элеронов (элероны 1 и 3 - против 2 и 4, как при крене); kf: складывание рулей 0 (раскрыты) … 1 (сложены)"""
    for n, W in MOVE.items():
        o = bpy.data.objects[n]; k = kc if W['kind'] == 'can' else ka * (1 if n in ('ail1', 'ail3') else -1)
        p = BASEM[n].translation.copy(); ang = min(max(15.0 * k, W['lim'][0]), W['lim'][1])
        M = Matrix.Translation(p) @ Matrix.Rotation(math.radians(ang), 4, W['axis']) @ Matrix.Translation(-p)
        if W['kind'] == 'can' and kf:
            h = P(FOLD['a'], FOLD['s'], W['phi']); M = Matrix.Translation(h) @ Matrix.Rotation(math.radians(FOLD['deg'] * kf), 4, T(W['phi'])) @ Matrix.Translation(-h) @ M
        o.matrix_world = M @ BASEM[n]
    bpy.context.view_layer.update()


_ps = os.environ.get('X59_POSE')
if _ps: pose(*[float(v) for v in _ps.split(',')])
TRIS = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in COL.objects if o.type == 'MESH')
print('X59 build: объектов', len(COL.objects), 'треугольников', TRIS, {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in COL.objects if o.type == 'MESH'})
