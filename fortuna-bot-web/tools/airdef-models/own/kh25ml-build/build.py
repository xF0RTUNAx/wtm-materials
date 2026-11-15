# build.py — ракета Х-25МЛ, своя модель по картинкам Mark (Свои/Х-25МЛ/референсы), 2026-11-15.
# Форма - по чертежу 06 (вид сбоку, нос слева, 623 × 225; виды спереди и сзади), детали - по фото 01, 02, 04, 05. Масштаб: длина 3,70 м = 552 пикс. (x 41…593).
# Оси: метры, нос +Y (glTF −Z), верх +Z, начало - на оси посередине длины. Оперение крестом «×»: рули и крылья на 45°, 135°, 225°, 315° (от +X к +Z).
# Узлы: body (корпус, кольцо купола, выступы сопел с желобами, сопла, кабельный короб снизу, башмаки сверху, гребни у корня крыльев),
#   dome (стекло купола ГСН), seeker (сетка и оптика под куполом), wing1…wing4 (крылья, неподвижны),
#   can1…can4 (носовые рули, цельноповоротные: начало на оси у корня, ось - радиальная, ±15°),
#   ail1…ail4 (элероны на задней кромке крыльев у корня: начало на оси шарнира у корня, ось - радиальная, ±15°).
# Запуск: Blender -b --factory-startup --python build.py [--python _views.py]   (X25_POSE="0.6,-0.4" - рули/элероны отклонены, доли от 15°)
# Швы, лючки, винты, трафареты - в окраске (_paint.py) и в карте нормалей (запекание с детальной копии), см. JOINTS / HATCHES ниже.
import os, math
import bpy, bmesh
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Х-25МЛ'
exec(compile(open(os.path.join(HERE, 'x25kit.py'), encoding='utf-8').read(), os.path.join(HERE, 'x25kit.py'), 'exec'))

L = 3.70; SPX = L / 552.0; X0 = 41.0
def A(x): return (x - X0) * SPX                  # x пикселя чертежа 06 → расстояние от носа, м
def YA(a): return L / 2 - a                      # расстояние от носа → Y модели
R = 0.135; RT = 0.131                            # корпус (чертёж: Ø 40 пикс.); хвостовой обтекатель (Ø 38-39 пикс.)
ANG = [45.0, 135.0, 225.0, 315.0]                # оперение «×»: 1 - верх справа (+X+Z), 2 - верх слева, 3 - низ слева, 4 - низ справа
def D(phi): r = math.radians(phi); return V(math.cos(r), 0, math.sin(r))
def T(phi): r = math.radians(phi); return V(-math.sin(r), 0, math.cos(r))
def P(a, s, phi, t=0.0): return D(phi) * s + T(phi) * t + V(0, YA(a), 0)

# носовой руль (сетка _замеры/g_рули.png): корень LE x108 TE x128,5; законцовка на r 35,8 пикс. (проекция 45°) LE x120 TE x127,5; ось вращения x116
CAN = dict(piv=A(116), rle=A(108), rte=A(128.5), tle=A(120), tte=A(127.5), s0=R + 0.005, s1=35.8 * SPX, t0=0.010, t1=0.0045)
# крыло (g_хвост.png): корень LE x382, TE x500; законцовка r 56,6 пикс. LE x460, TE x500; элерон x474…500 от корня до r 45,7 пикс.
WNG = dict(rle=A(382), te=A(500), tle=A(460), s0=R - 0.004, s1=56.6 * SPX, t0=0.018, t1=0.008)
AIL = dict(h=A(474), te=A(500) - 0.0015, s0=0.150, s1=45.7 * SPX, rr=0.0055, gap=0.004)
SA = AIL['s1'] + AIL['gap']                      # с этого радиуса задняя кромка крыла снова полная (x500)
POD = dict(a0=2.79, ac=2.91, a1=3.44, a2=3.645, xo=0.192, h=0.095, xi=0.05, rc=0.088)   # выступ сопла на борту (вид спереди/сзади: вылет 8-10 пикс., высота 27-30 пикс.)
TRO = dict(af=2.960, ar=3.570, r=0.064, x0=0.104)  # жёлоб за соплом: передний край полукругом (x 471…500), задний - у крышки; дно на 0,104 от оси
NOZ = dict(a=2.968, x=0.147, tilt=10.0, r=0.047) # сопло в начале жёлоба, выход назад и на 10° наружу
# швы отсеков (x пикс. → a): кольцо купола, полоса у носового конуса, уступ, стыки 145/152, 283/288/293/300/303, у крыльев 377, 463, обтекатель 500, крышка 572
JOINTS = [0.103, 0.372, 0.400, 0.437, A(145), A(152), A(283), A(288), A(293.5), A(300), A(303), A(377), 2.55, 2.70, A(463), 3.075, 3.559]
# лючки: (a0, a1, φ центра, ширина по дуге м, вид) - по чертежу 06 (борт φ 180) и фото 02 (борт φ 0)
HATCHES = [(A(125), A(134), 180.0, 0.067, 'rect'), (A(114), A(118), 180.0, 0.026, 'round'), (A(160), A(172), 165.0, 0.027, 'oval'), (A(160), A(172), 214.0, 0.027, 'oval'),
           (0.60, 0.70, 20.0, 0.085, 'rect'), (0.62, 0.69, -35.0, 0.070, 'round'), (0.515, 0.540, -18.0, 0.025, 'rect'), (1.10, 1.22, 160.0, 0.07, 'rect'), (1.10, 1.22, 20.0, 0.07, 'rect'),
           (2.05, 2.17, 205.0, 0.06, 'rect'), (2.05, 2.17, -25.0, 0.06, 'rect'), (3.20, 3.27, 90.0, 0.05, 'rect')]


def scene():
    sc = bpy.data.scenes.get('X25') or bpy.data.scenes.new('X25')
    if bpy.context.window: bpy.context.window.scene = sc
    col = bpy.data.collections.get('X25') or bpy.data.collections.new('X25')
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


def rcap(a):
    """радиус корпуса хвостового обтекателя (с крышкой) на расстоянии a от носа"""
    if a <= 3.562: return RT
    return RT * math.cos(math.asin(min((a - 3.562) / 0.138, 1.0)))


def body_core():
    b = B('body')
    p = [(0.060, 0.0006, M_DARK), (0.060, 0.066, M_CHROME), (0.055, 0.0712, M_CHROME), (0.055, 0.0790, M_CHROME), (0.059, 0.0800, M_CHROME),
         (0.098, 0.0800, M_CHROME), (0.100, 0.0792, M_CHROME), (0.103, 0.0792, M_BODY)]                      # хромированное кольцо купола (фото 01, 02)
    for i in range(1, 13):                                                                                   # носовой конус, чуть выпуклый (x 54…96)
        t = i / 12; p.append((0.103 + (0.369 - 0.103) * t, 0.0805 + (0.1272 - 0.0805) * (1 - (1 - t) ** 1.35), M_BODY))
    p += [(0.371, 0.1262, M_BODY), (0.374, 0.1290, M_BODY), (0.399, 0.1290, M_BODY), (0.402, 0.1305, M_BODY), (0.433, 0.1310, M_BODY), (0.438, R, M_BODY)]   # полоса и уступ рулевого отсека
    for a in (0.70, 1.20, 1.70, 2.20, 2.60, 2.85):                                                           # промежуточные кольца (развёртка, булевы)
        p.append((a, R, M_BODY))
    p += [(3.072, R, M_BODY), (3.075, R - 0.003, M_BODY), (3.080, RT, M_BODY), (3.30, RT, M_BODY), (3.556, RT, M_BODY), (3.559, RT - 0.0015, M_BODY), (3.562, RT, M_BODY)]
    for i in range(1, 19):                                                                                   # скруглённая крышка хвоста (x 573…593)
        th = math.radians(90 * i / 18); p.append((3.562 + 0.138 * math.sin(th), max(RT * math.cos(th), 0.0006), M_BODY))
    lathe(b, NOSE, AFT, [(a, r) for a, r, _ in p], [m for _, _, m in p[:-1]], n=56, cap0=True, cap1=True)
    return mk(b, sharp=40)


def pod_ring(a, k, xo, h, side):
    XI = POD['xi']; xo_ = XI + (xo - XI) * k; h_ = max(h * k, 0.004); rc = min(POD['rc'] * max(k, 0.1), h_ * 0.95, (xo_ - XI) * 0.95)
    q = [(XI, -h_)]
    for j in range(6): th = -math.pi / 2 + (math.pi / 2) * j / 5; q.append((xo_ - rc + rc * math.cos(th), -h_ + rc + rc * math.sin(th)))
    for j in range(6): th = (math.pi / 2) * j / 5; q.append((xo_ - rc + rc * math.cos(th), h_ - rc + rc * math.sin(th)))
    q.append((XI, h_))
    return [V(side * x, YA(a), z) for x, z in q]


def pod(side):
    b = B(f'pod{side}'); rings = []
    for j in range(8):                                                                                       # скруглённый перёд (из корпуса)
        a = POD['a0'] + (POD['ac'] - POD['a0']) * j / 7; k = math.sqrt(max(1 - ((POD['ac'] - a) / (POD['ac'] - POD['a0'])) ** 2, 0.0))
        rings.append(pod_ring(a, max(k, 0.03), POD['xo'], POD['h'], side))
    rings.append(pod_ring(3.10, 1.0, POD['xo'], POD['h'], side))
    for j in range(13):                                                                                      # скруглённая корма выступа (кончается у x 575, дальше - круглая крышка)
        a = POD['a1'] + (POD['a2'] - POD['a1']) * j / 12; k = math.sqrt(max(1 - ((a - POD['a1']) / (POD['a2'] - POD['a1'])) ** 2, 0.0))
        rings.append(pod_ring(a, max(k, 0.03), POD['xo'], POD['h'], side))
    b.loft(rings, M_BODY)
    return mk(b)


def trough(side):
    b = B('cut'); cs = []
    for j in range(17): th = math.pi / 2 + math.pi * j / 16; cs.append((TRO['af'] + TRO['r'] * math.cos(th), TRO['r'] * math.sin(th)))
    for j in range(17): th = -math.pi / 2 + math.pi * j / 16; cs.append((TRO['ar'] + TRO['r'] * math.cos(th), TRO['r'] * math.sin(th)))   # задний конец тоже скруглён: жёлоб закрыт ободком крышки (фото 04)
    b.loft([[V(side * xx, YA(a), z) for a, z in cs] for xx in (TRO['x0'], 0.40)], M_HEAT)
    return mk(b)


def details(b):
    # сопла: раструб в начале жёлоба, выход назад и наружу (фото 04, 05 - тёмная чаша)
    for side in (1, -1):
        tl = math.radians(NOZ['tilt']); d = V(side * math.sin(tl), -math.cos(tl), 0); c = V(side * NOZ['x'], YA(NOZ['a']), 0)
        lathe(b, c, d, [(-0.075, 0.016), (-0.040, 0.027), (-0.004, 0.040), (0.0, 0.043), (0.004, 0.044), (0.004, NOZ['r']), (-0.010, NOZ['r']), (-0.060, 0.044)],
              [M_DARK, M_DARK, M_DARK, M_HEAT, M_HEAT, M_HEAT, M_HEAT], n=28, cap0=True, cap1=False)
    # кабельный короб снизу (вид сбоку: полоса x 110…410, вид спереди - капля внизу)
    def ring(a, hk):
        z0 = -(R - 0.012); z1 = -(R + 0.036 * hk); w = 0.023; c = 0.008 * hk + 0.001
        return [V(-w, YA(a), z0), V(w, YA(a), z0), V(w, YA(a), z1 + c), V(w - c, YA(a), z1), V(-w + c, YA(a), z1), V(-w, YA(a), z1 + c)]
    b.loft([ring(0.47, 0.05), ring(0.53, 1.0), ring(2.40, 1.0), ring(2.47, 0.05)], M_BODY)
    # башмаки подвески сверху (вид спереди - два выступа; на чертеже тёмные точки у x 105 и 287)
    for a in (0.52, 1.65):
        b.box((0, YA(a), R + 0.000), (0.042, 0.080, 0.012), M_STEEL)
        b.box((0, YA(a), R + 0.011), (0.018, 0.056, 0.012), M_STEEL)
        b.box((0, YA(a), R + 0.020), (0.040, 0.064, 0.006), M_STEEL)
    # гребни у корня крыльев (чертёж: полосы y 54/86 от x 383 до 500, спереди - острый носок)
    for phi in ANG:
        rg = []
        for a, k in ((2.25, 0.02), (2.29, 0.45), (2.33, 1.0), (3.040, 1.0), (3.074, 0.6)):
            w = 0.012 * k; hh = 0.013 * k
            rg.append([P(a, R - 0.006, phi, -w), P(a, R + hh * 0.65, phi, -w), P(a, R + hh, phi, -w * 0.55), P(a, R + hh, phi, w * 0.55), P(a, R + hh * 0.65, phi, w), P(a, R - 0.006, phi, w)])
        b.loft(rg, M_BODY)
    # опоры носовых рулей (фото 02: круглая площадка с винтами у корня руля)
    for phi in ANG:
        lathe(b, P(CAN['piv'], R - 0.006, phi), D(phi), [(0.0, 0.019), (0.0065, 0.019), (0.0080, 0.0172)], M_BODY, n=20, cap0=False, cap1=True)   # верх опоры на R + 0,002


def section(a_le, a_te, s, phi, th, lead=0.18, trail=0.12):
    c = a_te - a_le
    return [P(a_le, s, phi), P(a_le + c * lead, s, phi, th / 2), P(a_te - c * trail, s, phi, th / 2), P(a_te, s, phi, th * 0.12),
            P(a_te, s, phi, -th * 0.12), P(a_te - c * trail, s, phi, -th / 2), P(a_le + c * lead, s, phi, -th / 2)]


def wing(k, phi):
    W = WNG; b = B(f'wing{k}')
    le = lambda s: W['rle'] + (W['tle'] - W['rle']) * (s - W['s0']) / (W['s1'] - W['s0'])
    th = lambda s: W['t0'] + (W['t1'] - W['t0']) * (s - W['s0']) / (W['s1'] - W['s0'])
    tn = AIL['h'] - AIL['gap']
    b.loft([section(le(W['s0']), tn, W['s0'], phi, th(W['s0'])), section(le(SA - 1e-4), tn, SA - 1e-4, phi, th(SA)),
            section(le(SA), W['te'], SA, phi, th(SA)), section(W['tle'], W['te'], W['s1'], phi, th(W['s1']))], M_BODY)
    return mk(b, sharp=40)


def aileron(k, phi):
    A_ = AIL; b = B(f'ail{k}'); ah = A_['h'] + A_['rr']
    def sec(s):
        q = []
        for j in range(7): th_ = math.pi / 2 + math.pi * j / 6; q.append(P(ah + A_['rr'] * math.cos(th_), s, phi, A_['rr'] * math.sin(th_)))
        q += [P(A_['te'], s, phi, -0.0012), P(A_['te'], s, phi, 0.0012)]
        return q
    b.loft([sec(A_['s0']), sec(A_['s1'])], M_BODY)
    return mk(b, pivot=P(ah, A_['s0'], phi), sharp=40)


def canard(k, phi):
    C = CAN; b = B(f'can{k}')
    b.loft([section(C['rle'], C['rte'], C['s0'], phi, C['t0'], lead=0.40, trail=0.10), section(C['tle'], C['tte'], C['s1'], phi, C['t1'], lead=0.40, trail=0.10)], M_BODY)
    b.cyl(P(C['piv'], R + 0.0025, phi), P(C['piv'], C['s0'] + 0.003, phi), 0.008, 0.008, M_STEEL, n=10)       # вал руля (над опорой, зазор 0,5 мм)
    return mk(b, pivot=P(C['piv'], R, phi), sharp=40)


def dome_and_seeker():
    ac, la, ra = 0.062, 0.062, 0.0715                                                                       # купол: полуэллипсоид, вершина на носу
    b = B('dome')
    lathe(b, NOSE, AFT, [(ac - la * math.cos(math.radians(9 * i)), max(ra * math.sin(math.radians(9 * i)), 0.0004)) for i in range(11)], M_GLASS, n=48, cap0=True, cap1=False)
    dome = mk(b, sharp=80)
    s = B('seeker'); k = 0.92; rg = ra * k
    for axis in (0, 1):                                                                                      # сетка под стеклом (фото 01, 02, 04): квадратная, шаг 15 мм
        for c in [0.015 * j for j in range(-4, 5)]:
            pts = []
            for i in range(15):
                u = -1 + 2 * i / 14; o_ = u * math.sqrt(max(rg * rg - c * c, 0.0)) * 0.98; rho = math.hypot(c, o_)
                aa = ac - la * k * math.sqrt(max(1 - (rho / rg) ** 2, 0.0)); x, z = (c, o_) if axis == 0 else (o_, c)
                pts.append(V(x, YA(aa), z))
            w = V(0.0007, 0, 0) if axis == 0 else V(0, 0, 0.0007)
            bm = s.bm; vv = [(bm.verts.new(p - w), bm.verts.new(p + w)) for p in pts]
            for i in range(len(vv) - 1): bm.faces.new((vv[i][0], vv[i + 1][0], vv[i + 1][1], vv[i][1])).material_index = M_GRID
    lathe(s, NOSE, AFT, [(0.034, 0.0004), (0.034, 0.030), (0.040, 0.050), (0.060, 0.052)], [M_OPTIC, M_DARK, M_DARK], n=28, cap0=True, cap1=False)    # головка: латунная оптика, тёмный корпус
    s.box((0.030, YA(0.046), -0.018), (0.022, 0.016, 0.020), M_OPTIC)                                       # блок координатора сбоку (фото 01 - латунный)
    seeker = mk(s, sharp=60)
    return dome, seeker


BODY = body_core()
for side in (1, -1): boolean(BODY, pod(side), 'UNION')
for side in (1, -1): boolean(BODY, trough(side), 'DIFFERENCE')
_ex = B('body_ex'); details(_ex); EX = mk(_ex)
with bpy.context.temp_override(active_object=BODY, selected_editable_objects=[BODY, EX], selected_objects=[BODY, EX]):
    bpy.ops.object.join()
BODY.name = 'body'; BODY.data.name = 'body'
WINGS = [wing(i + 1, a) for i, a in enumerate(ANG)]
CANS = [canard(i + 1, a) for i, a in enumerate(ANG)]
AILS = [aileron(i + 1, a) for i, a in enumerate(ANG)]
DOME, SEEKER = dome_and_seeker()
# пределы (мин, макс), °: рули ±15; элерон в сторону выступа сопла (борт φ 0 / 180) - до 6°: дальше его задняя кромка уходит в верх выступа (_limits.py), в другую сторону 15°
MOVE = {o.name: dict(axis=D(a), lim=(-15.0, 15.0), kind='can') for o, a in zip(CANS, ANG)}
MOVE.update({o.name: dict(axis=D(a), lim=((-15.0, 6.0) if o.name in ('ail1', 'ail3') else (-6.0, 15.0)), kind='ail') for o, a in zip(AILS, ANG)})
bpy.context.view_layer.update()
BASEM = {n: bpy.data.objects[n].matrix_world.copy() for n in MOVE}


def pose(kc=0.0, ka=0.0):
    """kc, ka: доли от 15° для рулей и элеронов (элероны 1 и 3 - против 2 и 4, как при крене); угол обрезается пределами lim"""
    for n, W in MOVE.items():
        o = bpy.data.objects[n]; k = kc if W['kind'] == 'can' else ka * (1 if n in ('ail1', 'ail3') else -1)
        p = BASEM[n].translation.copy(); ang = min(max(15.0 * k, W['lim'][0]), W['lim'][1])
        o.matrix_world = Matrix.Translation(p) @ Matrix.Rotation(math.radians(ang), 4, W['axis']) @ Matrix.Translation(-p) @ BASEM[n]
    bpy.context.view_layer.update()


_ps = os.environ.get('X25_POSE')
if _ps: pose(*[float(v) for v in _ps.split(',')])
TRIS = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in COL.objects if o.type == 'MESH')
print('X25 build: объектов', len(COL.objects), 'треугольников', TRIS, {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in COL.objects if o.type == 'MESH'})
