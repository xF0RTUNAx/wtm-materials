# GBU-57 — своя игровая модель по картинкам Mark (Свои/GBU-57/): 1.png — чертёж сбоку (хвост сверху; рули на вставке), 2.png — инфографика (нос сверху, только пропорции),
# 3.webp — 3D-рендер другой модели (только для деталей хвоста: решётчатые рули, стакан с «звездой», ряды заклёпок; чужая геометрия не снимается — меши свои).
# Рабочие картинки: 1_бок_нос_слева.png (1.png, повёрнут носом влево), _измерения/1_только_бомба.png (то же без шкалы, человечка и вставки — для силуэта и IoU).
# Координаты ниже — пиксели 1_только_бомба.png (630 × 176, нос слева, ось на y = 85): x вдоль оси, радиус от оси. Длина по игре — 6,31 м (прежняя модель w_gbu57.glb).
# Запуск (фоновый Blender, вместе с bake.py и deliver.py):
#   G57_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# В живом Blender (чтобы Mark видел сборку): G57_STAGE=1…4 — этапы (1 корпус, 2 + крылья, 3 + решётчатые рули, 4 всё), exec(compile(open(p, encoding='utf-8').read(), p, 'exec')).
#
# СПИСОК ДЕТАЛЕЙ С КАРТИНОК (сделано / пропущено):
#  + корпус: оживальный нос, цилиндр Ø 0,79 м, радиус 37,5 пикс.; нос и швы — профилем вращения
#  + носовой взрыватель (малый цилиндр с фаской) — на картинке 1, х = 11…27
#  + стык оживала с цилиндром (канавка, х = 109) и стык хвостового стакана (х = 566) — картинка 1 (линия) и 2 (серые пояса)
#  + синий пояс (х = 136,5…147,5) — картинки 1 и 3; светлая полоска под ним на картинке 1 — отражение, пропущена
#  + четыре больших крыла-«стрейка» крестом ×, ±45° от плоскости картинки (кромка и внутренняя линия на картинке 1 дают φ ≈ 47°): стреловидная передняя кромка, плоский задний срез
#  + хвостовой стакан — открытый, дно и втулка со «звездой» из четырёх лап (картинка 3), втулка выступает на 4 пикс. за срез (картинка 1)
#  + четыре решётчатых руля в «плюс» (±X, ±Z), в развёрнутом виде плоскостью ⟂ оси (на картинке 1 — тонкие планки х = 585…592), решётка — ромбы под 45° (картинка 3), петли под планками
#  − ряды заклёпок (картинка 3) — не геометрия: рельеф карты нормалей (bake.py)
#  − надписи «BOEING» и серийный номер с картинки 3 — на чертеже 1 их нет, не выдумываем
#  − подвесные проушины — на картинках не видны (бомба в отсеке B-2)
import sys, os, math, importlib
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
import bpy
import modelkit as mk; importlib.reload(mk)
from modelkit import B, Vector, circ, profile, panel, PR_WING, Y

STAGE = int(os.environ.get('G57_STAGE', '9'))
LEN_M = 6.31                      # длина прежней модели в игре (нос — торец взрывателя, хвост — торец втулки)
X_TIP, X_HUB = 11.0, 608.0        # торец взрывателя; торец втулки (выступает на 4 пикс. за срез стакана х = 604)
S = LEN_M / (X_HUB - X_TIP)       # метров на пиксель
X0, YC, RB = (X_TIP + X_HUB) / 2, 85.0, 37.5
X_RIM = 604.0                     # срез хвостового стакана
mk.configure('GBU57', S, x0=X0, yc=YC, rb=RB, nseg=32, nose='left')
G_BODY, G_FIN, G_BAND, G_STEEL, G_LAT = 0, 1, 2, 3, 4
mk.set_materials([('G57_body', (0.60, 0.62, 0.60)), ('G57_fin', (0.57, 0.59, 0.57)), ('G57_band', (0.06, 0.26, 0.58)), ('G57_steel', (0.22, 0.23, 0.25)), ('G57_lattice', (0.50, 0.51, 0.53))])
# шероховатость и металличность (Mark 2026-10-22: при 0,40 / 0,50 корпус в Blender «слишком глянцевый» — сделано матовее; игра эти числа не берёт, prepare.js ставит свои, они видны в Blender и на Sketchfab)
for m, (rough, metal) in zip(mk.MATS, ((0.62, 0.12), (0.62, 0.12), (0.60, 0.0), (0.55, 0.55), (0.50, 0.65))):
    pb = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pb.inputs['Roughness'].default_value = rough; pb.inputs['Metallic'].default_value = metal


def P(er_s, et_w, x, er, et):
    """Точка в метрах: радиально s (пикс.) вдоль er, w (пикс.) вдоль et, на оси — пиксель x чертежа."""
    return Vector((0.0, Y(x), 0.0)) + (er * er_s + et * et_w) * S


# ── 1. корпус: профиль вращения от носа к хвосту (х растёт), один замкнутый объект: взрыватель, оживало, цилиндр, стакан, дно, втулка ──
base = [
    (X_TIP, 0.6, G_STEEL), (X_TIP, 6.0, G_STEEL), (X_TIP + 1.0, 6.5, G_STEEL), (27.0, 6.5, G_STEEL),          # взрыватель
    (29.0, 10.0, G_BODY), (30.0, 11.5, G_BODY), (36, 16.0, G_BODY), (42, 19.8, G_BODY), (48, 23.0, G_BODY), (54, 25.9, G_BODY), (60, 28.2, G_BODY),
    (66, 30.4, G_BODY), (72, 32.2, G_BODY), (78, 33.8, G_BODY), (84, 35.0, G_BODY), (90, 36.0, G_BODY), (96, 36.8, G_BODY), (102, 37.3, G_BODY),   # оживало (измерено по картинке 1)
    (108.0, 37.5, G_BODY),
    (136.5, 37.5, G_BAND), (147.5, 37.5, G_BODY),                                                         # синий пояс
    (X_RIM, 37.5, G_BODY),                                                                                 # хвостовой срез, наружная кромка
    (X_RIM, 34.6, G_STEEL), (X_RIM - 24.5, 34.6, G_STEEL), (X_RIM - 24.5, 13.5, G_STEEL),                  # торец стенки, стенка стакана, дно
    (X_HUB, 13.5, G_STEEL), (X_HUB, 0.6, G_STEEL)]                                                         # втулка и её торец
GROOVES = [(109.5, 0.8, 0.7), (566.0, 0.8, 0.7), (561.0, 0.5, 0.45)]                                       # стыки: оживало — цилиндр, хвостовой стакан (две линии)
prof = profile(base, GROOVES, groove_mat=G_BODY)
b = B(); b.loft([circ(x, R) for x, R, m in prof], [m for x, R, m in prof][:-1], cap0=G_STEEL, cap1=G_STEEL); b.finish('G57_body')
print('корпус: колец', len(prof))

# ── 2. большие крылья (стрейки): четыре пластины крестом ×, плоскость через ось; хорда от стреловидной передней кромки к плоскому заднему срезу ──
if STAGE >= 2:
    R_TIP = 88.0
    k_le = (351.0 - 254.0) / (R_TIP - RB)                               # наклон передней кромки: в корне х = 254 (кончик крыла у корпуса), у внешней кромки х = 351
    def le(r): return 254.0 + (r - RB) * k_le
    def te(r): return 477.0 + (r - RB) * (4.5 / (R_TIP - RB))           # задний срез чуть скошен (на картинке 1 — 4 пикс. на крыло)
    b = B()
    for phi in (45.0, 135.0, 225.0, 315.0):
        st = [(30.0, le(30.0), te(30.0), 6.0), (RB, le(RB), te(RB), 6.0), (R_TIP, le(R_TIP), te(R_TIP), 4.5)]
        panel(b, phi, st, PR_WING, G_FIN)
    b.finish('G57_fins')

# ── 3. решётчатые рули (развёрнуты, плоскость ⟂ оси): рамка + ромбическая решётка из стенок под 45°, петли ──
def bar(bb, p0, p1, up, hu, hv, mat, caps=True):
    """Брус между точками: сечение 2hu × 2hv, u ⟂ оси бруса и up, v — вдоль up (толщина вдоль оси корпуса)."""
    d = (p1 - p0).normalized(); u = d.cross(up).normalized(); v = u.cross(d).normalized()
    ring = lambda p: [p + u * hu + v * hv, p - u * hu + v * hv, p - u * hu - v * hv, p + u * hu - v * hv]
    bb.loft([ring(p0), ring(p1)], mat, cap0=mat if caps else None, cap1=mat if caps else None)


def cyl(bb, c, axis, e1, rad, length, mat, n=12):
    """Цилиндр с осью вдоль axis (единичный вектор), центр c, радиус rad, длина length (метры)."""
    e2 = axis.cross(e1).normalized()
    ring = lambda sh: [c + axis * sh + (e1 * math.cos(2 * math.pi * k / n) + e2 * math.sin(2 * math.pi * k / n)) * rad for k in range(n)]
    bb.loft([ring(-length / 2), ring(length / 2)], mat, cap0=mat, cap1=mat)


if STAGE >= 3:
    UP = Vector((0.0, 1.0, 0.0))
    X_GF = 588.5                       # ось планки руля по х (картинка 1: планки на х = 585…592)
    T_GF = 5.0                         # толщина вдоль оси (пикс.; планки на картинке 1 — 7–8 пикс. с контуром, на рендере 3 — тоньше)
    R0, R1, W = 36.5, 83.0, 30.0       # радиально от оси (начало — в толще стенки стакана: стенка 34,6…37,5) до кончика 83 пикс., как на картинке 1; ширина рамки
    FW, BW, PITCH = 2.0, 0.95, 5.0     # ширина рамки, толщина стенки решётки, шаг линий (пикс.; ромб ≈ 2 × шаг)
    bg = B()
    for psi in (0.0, 90.0, 180.0, 270.0):
        er = Vector((math.cos(math.radians(psi)), 0.0, math.sin(math.radians(psi)))); et = Vector((-math.sin(math.radians(psi)), 0.0, math.cos(math.radians(psi))))
        Pt = lambda s, w, x=X_GF: P(s, w, x, er, et)
        # рамка: две радиальные и две поперечные планки
        for w in (-W / 2 + FW / 2, W / 2 - FW / 2): bar(bg, Pt(R0, w), Pt(R1, w), UP, FW / 2 * S, T_GF / 2 * S, G_LAT)
        for s in (R0 + FW / 2, R1 - FW / 2): bar(bg, Pt(s, -W / 2), Pt(s, W / 2), UP, FW / 2 * S, T_GF / 2 * S, G_LAT)
        # решётка: стенки под ±45° к радиусу, концы заходят в рамку (без торцов — они в толще рамки)
        s0, s1, w0, w1 = R0 + FW, R1 - FW, -W / 2 + FW, W / 2 - FW; sm = (s0 + s1) / 2
        n_bars = 0
        for sign in (1.0, -1.0):
            k = -(w1 - w0 + s1 - s0) / 2
            while k < (w1 - w0 + s1 - s0) / 2 + 1e-6:
                # прямая w = sign·(s − sm) + k, обрезанная прямоугольником
                lo = max(s0, sm + (w0 - k) / sign if sign > 0 else sm - (w1 - k)); hi = min(s1, sm + (w1 - k) if sign > 0 else sm - (w0 - k))
                if hi - lo > 1.5:
                    ea, eb = lo - 1.0, hi + 1.0                                   # концы заходят в рамку (ширина 2 пикс.)
                    bar(bg, Pt(ea, sign * (ea - sm) + k), Pt(eb, sign * (eb - sm) + k), UP, BW / 2 * S, T_GF / 2 * S, G_LAT, caps=False); n_bars += 1
                k += PITCH
        print(f'руль ψ={psi:.0f}°: стенок решётки {n_bars}')
    bg.finish('G57_grid')
    # петли: цилиндр-штифт поперёк (вдоль et) у нижнего края планки и две щёки; сталь
    bh = B()
    for psi in (0.0, 90.0, 180.0, 270.0):
        er = Vector((math.cos(math.radians(psi)), 0.0, math.sin(math.radians(psi)))); et = Vector((-math.sin(math.radians(psi)), 0.0, math.cos(math.radians(psi))))
        cyl(bh, P(40.0, 0.0, X_GF - 7.5, er, et), et, UP, 4.2 * S, (W - 2.0) * S, G_STEEL)
        for w in (-W / 2 + 3.0, W / 2 - 3.0):
            bar(bh, P(33.0, w, X_GF - 7.5, er, et), P(47.0, w, X_GF - 7.5, er, et), UP, 1.6 * S, 5.0 * S, G_STEEL)
            bar(bh, P(36.0, w, X_GF - 3.0, er, et), P(44.0, w, X_GF - 3.0, er, et), UP, 1.6 * S, 4.2 * S, G_STEEL)
    bh.finish('G57_hinges')

# ── 4. «звезда» на втулке стакана: четыре лапы к петлям рулей (картинка 3) ──
if STAGE >= 4:
    UP = Vector((0.0, 1.0, 0.0)); bs = B()
    for psi in (0.0, 90.0, 180.0, 270.0):
        er = Vector((math.cos(math.radians(psi)), 0.0, math.sin(math.radians(psi)))); et = Vector((-math.sin(math.radians(psi)), 0.0, math.cos(math.radians(psi))))
        x_arm = X_RIM - 1.6
        r0, r1, w0, w1, h = 11.0, 31.0, 3.4, 1.9, 1.5
        ring = lambda s, w: [P(s, w, x_arm + h, er, et), P(s, -w, x_arm + h, er, et), P(s, -w, x_arm - h, er, et), P(s, w, x_arm - h, er, et)]
        bs.loft([ring(r0, w0), ring(r1, w1)], G_STEEL, cap0=G_STEEL, cap1=G_STEEL)
    bs.finish('G57_star')

mk.stats()
print('сцена GBU57: этап', STAGE)
