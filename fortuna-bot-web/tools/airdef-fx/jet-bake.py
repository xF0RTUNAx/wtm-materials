# Запекание пламени реактивных двигателей «Воздушного превосходства» → games/airdef/fx/jet_flame.png, jet_glow.png
#   python3 -m venv v && v/bin/pip install numpy pillow && v/bin/python -I tools/airdef-fx/jet-bake.py games/airdef/fx/
# Три типа цвета (FLAME_KIND в jetflame.js): blue — чистое бедное горение (голубое ядро, сине-фиолетовая середина, розовато-красный конец,
# 4–5 чётких ромбов Маха), neutral — бело-жёлтое ядро, оранжевый факел, sooty — старые двигатели: жёлто-оранжевый «закопчённый» факел
# короче, два слабых ромба. Все числа длины и ширины — в диаметрах сопла D (модуль масштабирует по сопелу самолёта); таблицы ZL / ZW / LAM
# ниже повторены в jetflame.js (ZONE_L / ZONE_W / LAMBDA) — менять только вместе.
#
# jet_flame.png (2048×1024, ячейки 64×256) — вид сбоку, осевой билборд (ось — ось сопла, верх ячейки — срез сопла, внизу — хвост факела):
#   строки 0–2 (blue, neutral, sooty): колонка (зона − 1)·6 + кадр, зоны 1–5 форсажа (1 — короткое бледное ядро, 5 — полный факел),
#   строка 3: «язык» без форсажа — колонка вид·6 + кадр (слабый жёлтый язык; blue / neutral почти не видны — модуль гасит), по 6 кадров
#   мерцания на каждую зону (шум течёт вдоль струи и «кипит» по кругу — кадр 6 переходит в кадр 0). Зона поперёк — 2·ZW[зона] D,
#   вдоль — ZL[вид][зона] D (в ячейке сверху отступ PAD_T строк, чтобы мип-карты не тянули соседа). Ромбы Маха — только в текстуре.
# jet_glow.png (1024×1024, ячейки 128×128; нормаль — вдоль оси сопла, вид сзади):
#   строки 0–2 (blue, neutral, sooty), колонки 0–5 — раскал сопла по уровням нагрева (0 малый газ — вишнёвый, 1, 2 — оранжевый,
#   3 — «максимал» жёлто-оранжевый, 4 — форсаж (бело-жёлтое ядро, кольцо форсажной камеры), 5 — полный форсаж); охват ±1,5 радиуса сопла;
#   строки 3–5 — факел «в торец» (вид по оси): ядро, кольца, ореол, колонки 0–5 — кадры мерцания, охват ±3 радиуса;
#   строка 6 — вспышка розжига форсажа (6 кадров).
# Значения хранятся как sqrt(линейный цвет × яркость), RGB без альфы (для сложения) — в шейдере возводятся в квадрат.
import sys
import numpy as np
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else 'games/airdef/fx/'
KINDS = ['blue', 'neutral', 'sooty']
NFR = 6
CW, CH, PAD_T = 64, 256, 6
GS = 128
sm = lambda a, b, t: (lambda u: u * u * (3 - 2 * u))(np.clip((t - a) / (b - a), 0, 1))

# длина (в D) и полуширина ячейки по зонам 1–5; язык — зона 0
ZL = {'blue': [1.7, 3.0, 4.7, 6.4, 8.2], 'neutral': [1.5, 2.7, 4.1, 5.5, 7.0], 'sooty': [1.2, 2.1, 3.2, 4.2, 5.2]}
ZW = {'blue': [0.80, 0.95, 1.10, 1.25, 1.40], 'neutral': [0.80, 0.95, 1.10, 1.25, 1.45], 'sooty': [0.78, 0.92, 1.08, 1.22, 1.40]}
TONGUE = (1.7, 0.70)
LAM = {'blue': 1.32, 'neutral': 1.2, 'sooty': 1.08}   # шаг ромбов Маха
NDIA = {'blue': 5, 'neutral': 4, 'sooty': 2}
ZG = [0.34, 0.55, 0.74, 0.90, 1.0]     # общая яркость по зонам
ZPALE = [0.55, 0.38, 0.22, 0.10, 0.0]  # «бледность» (к белому) по зонам

# цвета (линейные): ядро, середина, конец; «горячий» (диски Маха и ядро)
COL = {
    'blue': dict(grad=[(0.0, (0.72, 0.87, 1.0)), (0.30, (0.34, 0.44, 1.0)), (0.62, (0.55, 0.30, 0.85)), (1.0, (0.90, 0.28, 0.45))], hot=(0.80, 0.92, 1.0)),
    'neutral': dict(grad=[(0.0, (1.0, 0.93, 0.74)), (0.28, (1.0, 0.56, 0.20)), (0.65, (0.92, 0.30, 0.09)), (1.0, (0.70, 0.17, 0.06))], hot=(1.0, 0.95, 0.80)),
    'sooty': dict(grad=[(0.0, (1.0, 0.84, 0.46)), (0.30, (1.0, 0.50, 0.12)), (0.65, (0.78, 0.26, 0.06)), (1.0, (0.45, 0.13, 0.04))], hot=(1.0, 0.88, 0.58)),
}
def grad(kind, t):
    st = COL[kind]['grad']; xs = [a for a, _ in st]; out = np.zeros(t.shape + (3,))
    for c in range(3): out[..., c] = np.interp(t, xs, [v[c] for _, v in st])
    return out

rng = np.random.default_rng(2110)

# ── поле шума: периодично по кадрам (6) и вдоль струи, течёт к хвосту ──
def noise_frames(H, Wd, kx_scale, ks_scale, beta, seed, m=2):
    """Возвращает NFR кадров шума (H×Wd, σ≈1). Течёт вдоль оси (axis 0) на H/m за цикл, «кипит» по кругу."""
    r = np.random.default_rng(seed)
    ky = np.fft.fftfreq(H)[:, None] * H; kx = np.fft.fftfreq(Wd)[None, :] * Wd     # целые гармоники
    ke = np.sqrt((kx * kx_scale) ** 2 + (ky * ks_scale) ** 2); ke[0, 0] = 1
    amp = ke ** (-beta / 2) * (ke > 0.4) * np.exp(-(ke / 4.2) ** 2)
    amp = amp * ((np.abs(ky) % m) == 0); amp[0, 0] = 0
    fields = []
    for _ in range(2):
        f = np.fft.fft2(r.normal(size=(H, Wd))) * amp; fields.append(f)
    out = []
    for fr in range(NFR):
        ph = 2 * np.pi * fr / NFR
        sh = np.exp(-2j * np.pi * ky * (fr * (H / (NFR * m))) / H)    # сдвиг вдоль струи
        a = np.real(np.fft.ifft2(fields[0] * sh)); b = np.real(np.fft.ifft2(fields[1] * sh))
        out.append(np.cos(ph) * a + np.sin(ph) * b)
    st = np.std(out); return [o / st for o in out]

def blur(a, s):   # гаусс по осям (разделимо), для смягчения ромбов
    if s <= 0: return a
    k = np.arange(-int(3 * s) - 1, int(3 * s) + 2); g = np.exp(-(k / s) ** 2 / 2); g /= g.sum()
    a = np.apply_along_axis(lambda v: np.convolve(np.pad(v, len(k) // 2, mode='edge'), g, 'valid'), 0, a)
    return np.apply_along_axis(lambda v: np.convolve(np.pad(v, len(k) // 2, mode='edge'), g, 'valid'), 1, a)

# ── факел сбоку ──
def side_cell(kind, z, fr, NZ, tongue=False):
    L, W = (TONGUE if tongue else (ZL[kind][z - 1], ZW[kind][z - 1]))
    lam = LAM[kind]
    rows = np.arange(CH); content = CH - PAD_T - 2
    s = np.clip((rows - PAD_T + 0.5) / content, 0, None)[:, None] * L
    x = (((np.arange(CW) + 0.5) / CW) * 2 - 1)[None, :] * W
    ax = np.abs(x)
    n1 = NZ[0][fr]; n2 = NZ[1][fr]
    sn = s / L
    live = (rows >= PAD_T - 1)[:, None] * 1.0
    if tongue:   # язык без форсажа: тонкое «дрожащее» жёлтое свечение
        b = 0.5 * (1 + 0.10 * s) * (1 + 0.04 * n1)
        body = np.exp(-(ax / (0.62 * b)) ** 2.2) * np.exp(-(s / 0.75) ** 1.3)
        core = np.exp(-(ax / (0.27 * b)) ** 2) * np.exp(-s / 0.35) * 0.8
        I = (body * (0.80 + 0.20 * n1) + core)
        I = I * (1 - sm(0.55, 1.0, sn)) * (1 - sm(0.55, 1.0, ax / W)) * live
        I = 1 - np.exp(-I * 1.5)
        col = grad('sooty', np.clip(sn * 1.4, 0, 1))
        return col * I[..., None]
    g = ZG[z - 1]; pale = ZPALE[z - 1]; zk = min(1.0, z / 3)
    # граница струи: расширение + «бочки» ударных ячеек (недорасширенная струя раздувается к середине ячейки, сжимается на скачке)
    sh = 0.5 * (1 - np.cos(2 * np.pi * (s / lam)))                      # 0 у среза, 1 — в центре ячейки
    shock = 0.20 * sh * np.exp(-s / (6.0 if kind != 'sooty' else 3.5)) * (1 if kind != 'sooty' else 0.5) * (0.4 + 0.6 * zk)
    b0 = (0.5 + 0.040 * s ** 0.95 * (0.6 + 0.4 * z / 5)) * (1 + shock)  # полуширина факела (в D)
    xs = np.abs(x - (0.02 + 0.14 * sn ** 1.3) * n2 * W * 0.30)          # к хвосту струя «гуляет» вбок
    edgeN = (0.03 + 0.20 * sn ** 1.1) * (0.6 * n1 + 0.4 * n2)
    b = b0 * (1 + edgeN)                                                # рваная кромка
    rel = xs / b
    # внешний факел: чёткая мягкая кромка, к хвосту тает; хвост рваный (языки)
    tail = np.clip(sn + 0.20 * sn * (0.7 * n2 + 0.5 * n1 * (xs / W)), 0, 2)
    fo = np.clip(1 - tail ** 1.15, 0, 1) ** 0.85
    streak = 1 + (0.05 + 0.40 * sn) * n1 + 0.12 * sn * n2
    outer = (1 - sm(0.50, 1.0, rel)) * (0.62 + 0.38 * np.clip(1 - rel ** 2, 0, 1)) * fo * np.clip(streak, 0.35, 1.7)
    halo = np.exp(-(rel / 1.5) ** 1.8) * np.exp(-(sn / 0.55) ** 1.4) * 0.09
    # внутренний светящийся конус: уже и ярче, слегка сужается; яркость — «бусины» ударных ячеек
    Li = {'blue': 0.58, 'neutral': 0.46, 'sooty': 0.38}[kind] * L
    bi = 0.5 * (0.98 - 0.015 * s) * (1 + 0.5 * shock)
    cellmod = 0.66 + 0.34 * (0.5 + 0.5 * np.cos(2 * np.pi * (s - 0.58 * lam) / lam)) ** 1.5
    inner = (1 - sm(0.50, 1.0, xs / (0.72 * bi))) * np.exp(-(s / Li) ** 1.15) * (1 + 0.14 * n2 * sn) * cellmod
    corelen = {'blue': 0.17, 'neutral': 0.20, 'sooty': 0.15}[kind] * L * (0.7 + 0.3 * z / 5) + 0.35
    core = np.exp(-(xs / (0.30 * bi)) ** 2.0) * np.exp(-(s / corelen) ** 1.2) * 1.15
    # ромбы Маха: мягкие чёткие ромбы вдоль оси, ярче у сопла, к концу затухают
    D = np.zeros_like(s * ax)
    rr = np.random.default_rng(100 + 7 * z + 31 * KINDS.index(kind))
    nd = NDIA[kind] if z >= 2 else 1
    for n in range(nd):
        c = lam * (n + 0.58)
        if c > L * 0.93: break
        u = (s - c) / (0.50 * lam)
        wmax = 0.36 * (b0 / 0.5) ** 0.7 * (1 if kind != 'sooty' else 0.8)
        hw = wmax * np.clip(1 - np.abs(u), 0, 1)
        d = np.exp(-(xs / (hw + 0.03)) ** 4.0) * (1 - sm(0.62, 1.0, np.abs(u))) * (np.abs(u) < 1.0)
        amp = {'blue': 1.0, 'neutral': 0.8, 'sooty': 0.5}[kind] * np.exp(-0.34 * n) * (0.88 + 0.24 * rr.random()) * (0.4 + 0.6 * min(1, (z - 1) / 2.5 + 0.1))
        amp *= (1 - sm(0.45, 0.95, c / L))
        D = D + d * amp
    D = blur(D, 0.55)
    base = 0.46 * outer + halo + 0.40 * inner + 0.55 * core
    # итог: интенсивность и цвет
    Itot = (base + 0.38 * D) * g
    edge = (1 - sm(0.62, 1.0, ax / W)) * (1 - sm(0.78, 1.0, sn))     # края ячейки — в ноль
    Itot = Itot * edge * live * (0.25 + 0.75 * sm(0.0, 0.35, s))     # у среза — мягкий вход (плоскость не должна давать резкую линию под углом)
    I = 1 - np.exp(-Itot * 1.15)
    hotk = np.clip(1.1 * core + 0.7 * D + 0.35 * inner, 0, 1) ** 1.0
    col = grad(kind, np.clip(sn * 1.05 + 0.10 * (1 - np.clip(base, 0, 1)) * sn, 0, 1))
    hot = np.array(COL[kind]['hot'])
    col = col * (1 - 0.65 * hotk[..., None]) + hot * (0.65 * hotk[..., None])
    col = col * (1 - pale) + np.array([0.9, 0.95, 1.0] if kind == 'blue' else [1.0, 0.95, 0.85]) * pale     # низшие зоны — бледнее
    if kind == 'sooty':   # закопчённый: провалы яркости в хвосте
        I = I * (0.78 + 0.22 * np.clip(0.5 + 0.5 * n2, 0, 1) ** 0.7)
    return col * I[..., None]

# ── раскал сопла: вид сзади в трубу ──
yy, xx = np.mgrid[0:GS, 0:GS]
GX = ((xx + 0.5) / GS * 2 - 1); GY = ((yy + 0.5) / GS * 2 - 1)
def disc(kind, lv, GEXT, nz=None):
    """Единичный круг = срез сопла. GEXT — охват ячейки в радиусах сопла (1,5 у раскала, 3 у торца)."""
    X = GX * GEXT; Y = GY * GEXT; R = np.hypot(X, Y); T = np.arctan2(Y, X)
    return X, Y, R, T

HEAT = [  # (интенсивность створок, цвет створок), (интенсивность турбины, цвет), кольцо, ореол
    dict(wall=0.040, wc=(0.72, 0.05, 0.01), core=0.008, cc=(0.8, 0.07, 0.02), ring=0.0, halo=0.00),
    dict(wall=0.15, wc=(0.95, 0.13, 0.02), core=0.05, cc=(1.0, 0.18, 0.03), ring=0.0, halo=0.02),
    dict(wall=0.48, wc=(1.0, 0.36, 0.06), core=0.30, cc=(1.0, 0.46, 0.09), ring=0.0, halo=0.07),
    dict(wall=0.72, wc=(1.0, 0.54, 0.13), core=0.72, cc=(1.0, 0.72, 0.26), ring=0.0, halo=0.14),
    dict(wall=0.85, wc=(1.0, 0.70, 0.30), core=0.95, cc=(1.0, 0.90, 0.66), ring=0.75, halo=0.26),
    dict(wall=1.00, wc=(1.0, 0.80, 0.46), core=1.10, cc=(1.0, 0.97, 0.88), ring=1.15, halo=0.42),
]
def heat_disc(kind, lv):
    X, Y, R, T = disc(kind, lv, 1.5)
    h = HEAT[lv]; rt = 0.70
    wc = np.array(h['wc']); cc = np.array(h['cc'])
    if kind == 'blue' and lv >= 4:
        k = 0.55 if lv == 4 else 0.8
        cc = cc * (1 - k) + np.array([0.78, 0.90, 1.0]) * k; wc = wc * (1 - 0.35 * k) + np.array([0.9, 0.93, 1.0]) * 0.35 * k
    if kind == 'sooty' and lv >= 4:
        cc = cc * 0.75 + np.array([1.0, 0.80, 0.40]) * 0.25
    # створки: от горла (горячее) к срезу (холоднее), 16 лепестков со швами
    wall_m = sm(rt - 0.03, rt + 0.03, R) * (1 - sm(0.985, 1.015, R))
    fall = 1 - 0.55 * np.clip((R - rt) / (1 - rt), 0, 1)
    petal = 1 + 0.22 * np.cos(16 * T) ** 3 - 0.10 + 0.1 * np.cos(32 * T + 1.0)
    seam = 1 - 0.55 * np.exp(-(np.mod(T * 16 / (2 * np.pi) + 0.5, 1) - 0.5) ** 2 / 0.003)   # швы между створками
    wall = wall_m * fall * petal * seam * h['wall']
    # турбина за горлом: ярче в центре, диск стоек у ступицы
    core_m = (1 - sm(rt - 0.03, rt + 0.03, R))
    core = core_m * (0.35 + 0.65 * np.exp(-(R / 0.55) ** 2)) * h['core']
    hub = core_m * np.exp(-(R / 0.14) ** 2) * (0.7 if lv < 4 else -0.35 + 0.0)  # ступица у малого газа темнее/ярче
    spokes = core_m * (0.9 + 0.1 * np.cos(8 * T))
    # кольцо форсажной камеры (стабилизаторы пламени) и лучи
    ring = np.exp(-((R - 0.50) / 0.075) ** 2) * (0.85 + 0.15 * np.cos(12 * T)) * h['ring'] * core_m
    rays = np.exp(-(R / 0.5) ** 2) * (0.5 + 0.5 * np.cos(6 * T) ** 6) * 0.25 * h['ring'] * core_m
    # ореол вокруг среза: тепло на внешней обшивке и в воздухе
    halo = np.exp(-np.clip(R - 1.0, 0, None) / (0.20 + 0.04 * lv)) * (R > 0.98) * h['halo'] * 0.9
    img = (wall[..., None] * wc + (core * spokes)[..., None] * cc + ring[..., None] * cc * 1.1 + rays[..., None] * cc + halo[..., None] * wc)
    # мягкая кромка ячейки
    img *= (1 - sm(0.70, 1.0, R / 1.5))[..., None]
    return np.clip(img, 0, 6)

# ── факел «в торец» ──
def rear(kind, fr, NZ):
    X, Y, R, T = disc(kind, 0, 3.0)
    n = NZ[fr]; ph = 2 * np.pi * fr / NFR
    flick = 1 + 0.07 * np.sin(ph + 0.4) + 0.05 * np.sin(2 * ph + 1.3)
    core = np.exp(-(R / 0.42) ** 2) * 1.5 * flick
    bodyR = 0.88 * (1 + 0.05 * n)
    disc_ = np.exp(-(R / bodyR) ** 3.2) * 0.62 * (1 + 0.12 * n)
    rings = (np.exp(-((R - 0.36) / 0.07) ** 2) * 0.35 + np.exp(-((R - 0.64) / 0.07) ** 2) * 0.28) * (1 + 0.18 * n)    # диски Маха в торец
    halo = np.exp(-(R / 1.25) ** 1.5) * 0.17 + np.exp(-(R / 2.6) ** 1.3) * 0.035
    shimmer = 1 + 0.10 * np.cos(3 * T + 2 * ph) * np.exp(-(R / 1.2) ** 2)
    I = (core + disc_ + rings) * shimmer + halo
    I = 1 - np.exp(-I * 1.35)
    cols = {'blue': ((0.80, 0.92, 1.0), (0.40, 0.50, 1.0), (0.62, 0.34, 0.85)), 'neutral': ((1.0, 0.96, 0.82), (1.0, 0.58, 0.20), (0.95, 0.34, 0.10)), 'sooty': ((1.0, 0.88, 0.55), (1.0, 0.52, 0.14), (0.85, 0.30, 0.07))}[kind]
    t1 = np.clip(R / 1.0, 0, 1); t2 = np.clip((R - 0.8) / 1.8, 0, 1)
    c = np.zeros(R.shape + (3,))
    for k in range(3):
        c[..., k] = cols[0][k] * (1 - t1) + cols[1][k] * t1
        c[..., k] = c[..., k] * (1 - t2) + cols[2][k] * t2
    img = c * I[..., None]
    img *= (1 - sm(0.72, 1.0, R / 3.0))[..., None]
    return img

# ── вспышка розжига ──
def flash(fr):
    X, Y, R, T = disc('neutral', 0, 3.0)
    r = np.random.default_rng(900 + fr)
    ph = 2 * np.pi * fr / NFR
    core = np.exp(-(R / (0.30 + 0.05 * np.sin(ph))) ** 2) * 1.6
    glare = np.exp(-(R / 0.85) ** 1.5) * 0.7
    # лучи: несколько вытянутых вдоль радиуса пятен
    rays = np.zeros_like(R)
    for k in range(7):
        a = r.uniform(0, 2 * np.pi); wd = r.uniform(0.06, 0.12); ln = r.uniform(0.9, 1.7)
        d = np.abs(np.sin(T - a)) * R
        rays += np.exp(-(d / wd) ** 2) * np.exp(-R / ln) * (np.cos(T - a) > 0) * r.uniform(0.35, 0.8)
    I = 1 - np.exp(-(core + glare + rays) * 1.4)
    c = np.stack([np.ones_like(R), 0.88 - 0.25 * np.clip(R / 2.5, 0, 1), 0.62 - 0.35 * np.clip(R / 2.0, 0, 1)], -1)
    img = c * I[..., None]
    return img * (1 - sm(0.70, 1.0, R / 3.0))[..., None]

def pack(img, rng):   # sqrt (точность в тёмном), 8 бит; без дизеринга — PNG заметно меньше
    v = np.sqrt(np.clip(img, 0, 1)) * 255
    return np.rint(v).clip(0, 255).astype(np.uint8)

def save(atlas, name):
    h, w = atlas.shape[:2]
    Image.fromarray(atlas, 'RGB').save(OUT + name, optimize=True)
    print(name, w, 'x', h)

# ── сборка jet_flame.png ──
A = np.zeros((CH * 4, CW * 32, 3))
for ki, kind in enumerate(KINDS):
    for z in range(1, 6):
        nz = [noise_frames(CH, CW, 1.0 / (2 * ZW[kind][z - 1]), 1.0 / ZL[kind][z - 1] * 1.7, 2.2, 31 + z + 10 * ki), noise_frames(CH, CW, 1.4 / (2 * ZW[kind][z - 1]), 2.4 / ZL[kind][z - 1] * 1.7, 2.0, 61 + z + 10 * ki)]
        # nz[0][кадр], nz[1][кадр]; функция ждёт NZ[0][fr], NZ[1][fr]
        for fr in range(NFR):
            col = (z - 1) * NFR + fr
            A[ki * CH:(ki + 1) * CH, col * CW:(col + 1) * CW] = side_cell(kind, z, fr, nz)
for ki, kind in enumerate(KINDS):
    nz = [noise_frames(CH, CW, 1.0 / (2 * TONGUE[1]), 1.0 / TONGUE[0] * 1.7, 2.2, 177 + ki), noise_frames(CH, CW, 1.4 / (2 * TONGUE[1]), 2.4 / TONGUE[0] * 1.7, 2.0, 277 + ki)]
    for fr in range(NFR):
        col = ki * NFR + fr
        A[3 * CH:4 * CH, col * CW:(col + 1) * CW] = side_cell(kind, 0, fr, nz, tongue=True)
save(pack(A, rng), 'jet_flame.png')

# ── сборка jet_glow.png ──
G = np.zeros((GS * 8, GS * 8, 3))
for ki, kind in enumerate(KINDS):
    for lv in range(6):
        G[ki * GS:(ki + 1) * GS, lv * GS:(lv + 1) * GS] = heat_disc(kind, lv)
    nzr = noise_frames(GS, GS, 0.35, 0.35, 2.0, 400 + ki)
    for fr in range(NFR):
        G[(3 + ki) * GS:(4 + ki) * GS, fr * GS:(fr + 1) * GS] = rear(kind, fr, nzr)
for fr in range(NFR):
    G[6 * GS:7 * GS, fr * GS:(fr + 1) * GS] = flash(fr)
save(pack(G, rng), 'jet_glow.png')
