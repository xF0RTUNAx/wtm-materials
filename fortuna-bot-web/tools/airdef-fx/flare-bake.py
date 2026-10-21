# Запекание спрайтов ловушек «Воздушного превосходства» → games/airdef/fx/flare.png, chaff.png
#   python3 -m venv v && v/bin/pip install numpy pillow && v/bin/python -I tools/airdef-fx/flare-bake.py games/airdef/fx/
# flare — горящая магниевая ЛТЦ: раскадровка 4×4 кадра по 128×128 (16 кадров мерцания, по кругу — без скачка на стыке): ослепительно белое
#   ядро, жёлто-оранжевый ореол, мягкое широкое свечение, мелкие искры, летящие от центра. Края сходятся в ноль гауссом — без жёстких границ.
#   RGB — цвет × яркость (для сложения, как plume_flame), A — яркость.
# chaff — облако диполей: те же 4×4 кадра по 128×128 (обычная альфа): множество мелких блёсток фольги (серебристо-голубоватые), каждая
#   мигает по-своему (кадры — «поблёскивание»), едва заметная дымка между ними. Форма облака — одна на все кадры, растёт и тает хозяин (cmfx.js).
import sys
import numpy as np
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else 'games/airdef/fx/'
rng = np.random.default_rng(11)
FS, NF = 128, 16
yy, xx = np.mgrid[0:FS, 0:FS]
X = (xx + 0.5) / FS * 2 - 1; Y = (yy + 0.5) / FS * 2 - 1   # −1…1
R = np.hypot(X, Y)
sm = lambda a, b, t: np.clip((t - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((t - a) / (b - a), 0, 1))
edge = 1 - sm(0.72, 1.0, R)   # к краю кадра — в ноль (без швов раскадровки)

def ramp(i):  # цвет по яркости: красно-бурый край → оранжевый → жёлтый → белое ядро
    stops = np.array([0, 0.15, 0.4, 0.7, 1.0]); cols = np.array([[0.5, 0.14, 0.03], [0.95, 0.42, 0.1], [1.0, 0.7, 0.28], [1.0, 0.92, 0.66], [1.0, 0.99, 0.95]])
    i = np.clip(i, 0, 1); out = np.zeros(i.shape + (3,))
    for c in range(3): out[..., c] = np.interp(i, stops, cols[:, c])
    return out

# ── ЛТЦ ──
NS = 16  # искр: у каждой свой угол, фаза и длина пути; положение — по кругу фазы, яркость — sin² (появляется у ядра, гаснет вдали)
sa = rng.uniform(0, 2 * np.pi, NS); sph = rng.uniform(0, 1, NS); sl = rng.uniform(0.35, 0.8, NS); sw = rng.uniform(0.010, 0.017, NS); sb = rng.uniform(0.5, 1.0, NS)
fl_c = [(rng.uniform(0, 6.283), rng.integers(1, 4)) for _ in range(3)]
atlas = np.zeros((FS * 4, FS * 4, 4))
for f in range(NF):
    t = f / NF; ph = 2 * np.pi * t
    flick = 1 + 0.10 * np.sin(ph * 1 + fl_c[0][0]) + 0.07 * np.sin(ph * 2 + fl_c[1][0]) + 0.05 * np.sin(ph * 3 + fl_c[2][0])  # мерцание — по кругу фазы
    core = np.exp(-(R / (0.065 * flick)) ** 2) * 1.6
    glare = np.exp(-(R / (0.17 * (0.96 + 0.08 * flick))) ** 1.4) * 0.8
    halo = np.exp(-(R / (0.40 + 0.03 * np.sin(ph + 1))) ** 2) * 0.38 * flick
    wide = np.exp(-R / 0.55) * 0.07
    I = core + glare + halo + wide
    for i in range(NS):  # искры: вытянутый вдоль луча гаусс
        u = (t + sph[i]) % 1.0; rr = 0.1 + sl[i] * u; a = np.sin(np.pi * u) ** 2 * sb[i]
        ca, sa_ = np.cos(sa[i]), np.sin(sa[i]); px, py = ca * rr, sa_ * rr
        dx, dy = X - px, Y - py; along = dx * ca + dy * sa_; across = -dx * sa_ + dy * ca
        I = I + a * 0.9 * np.exp(-(along / (sw[i] * 2.6)) ** 2 - (across / sw[i]) ** 2)
    I = I * edge
    Iout = 1 - np.exp(-I * 1.5)   # мягкий предел: ядро светится белым, ореол остаётся цветным
    rgb = ramp(Iout) * Iout[..., None]
    cx, cy = (f % 4) * FS, (f // 4) * FS
    atlas[cy:cy + FS, cx:cx + FS, :3] = rgb; atlas[cy:cy + FS, cx:cx + FS, 3] = Iout
Image.fromarray((np.clip(atlas, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(OUT + 'flare.png', optimize=True)

# ── диполи ──
NP = 520
pr = np.abs(rng.normal(0, 0.37, NP)); pa = rng.uniform(0, 2 * np.pi, NP)
px, py = np.cos(pa) * pr, np.sin(pa) * pr * 0.9           # облако чуть сплюснуто
keep = np.hypot(px, py) < 0.86; px, py = px[keep], py[keep]; NP = len(px)
ps = rng.uniform(0.012, 0.024, NP); pb = rng.uniform(0.45, 1.0, NP); pk = rng.integers(1, 3, NP); pph = rng.uniform(0, 1, NP); pw = rng.uniform(1.5, 4.0, NP)
col = np.array([0.84, 0.89, 0.95])
atlas = np.zeros((FS * 4, FS * 4, 4)); atlas[..., :3] = col
for f in range(NF):
    t = f / NF
    A = np.zeros((FS, FS))
    haze = np.exp(-(R / 0.5) ** 2) * 0.07
    A += haze
    for i in range(NP):  # блёстка мигает: острый максимум раз (или два) за цикл, между вспышками — тусклая
        tw = 0.18 + 0.82 * max(0.0, np.cos(2 * np.pi * (t * pk[i] + pph[i]))) ** pw[i]
        A += pb[i] * tw * np.exp(-((X - px[i]) ** 2 + (Y - py[i]) ** 2) / (2 * ps[i] ** 2)) * 0.95
    A = np.clip(A, 0, 1) * (1 - sm(0.78, 1.0, R))
    cx, cy = (f % 4) * FS, (f // 4) * FS
    atlas[cy:cy + FS, cx:cx + FS, 3] = A
Image.fromarray((np.clip(atlas, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(OUT + 'chaff.png', optimize=True)
print('ok', OUT)
