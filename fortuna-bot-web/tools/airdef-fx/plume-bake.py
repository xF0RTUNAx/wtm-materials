# Запекание текстур шлейфа ракет «Воздушного превосходства» → games/airdef/fx/plume_flame.png, plume_smoke.png
#   python3 -m venv v && v/bin/pip install numpy pillow && v/bin/python -I tools/airdef-fx/plume-bake.py games/airdef/fx/
# plume_flame — раскадровка факела 4×4 кадра по 64×256 (по ширине — поперёк струи, по высоте — от среза сопла вниз к хвосту):
#   ядро (белое, у сопла), ударные «ромбы» (диски Маха) в первой половине, расширяющийся оранжевый факел, турбулентность.
#   Кадры зациклены (фаза по кругу — без скачка на стыке). RGB — цвет × яркость (для сложения), A — яркость.
# plume_smoke — бесшовный шум 256×256 (спектр 1/f через обратное БПФ — края сходятся сами): A — плотность клубов,
#   RGB — «самозатенение» по градиенту плотности (освещённый край светлее), чтобы лента дыма не была плоской.
import sys
import numpy as np
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else 'games/airdef/fx/'
rng = np.random.default_rng(7)

# ── факел ──
FW, FH, NF = 64, 256, 16
x = np.linspace(-1, 1, FW)[None, :]
v = np.linspace(0, 1, FH)[:, None]
comps = [(rng.uniform(2, 6), rng.integers(4, 11), int(rng.integers(1, 4)), rng.uniform(0, 6.283), rng.uniform(0.4, 1)) for _ in range(7)]
def ramp(i):  # цвет по яркости: красный край → оранжевый → жёлтый → белое ядро
    stops = np.array([0, 0.18, 0.45, 0.75, 1.0]); cols = np.array([[0.55, 0.12, 0.03], [0.95, 0.35, 0.08], [1.0, 0.68, 0.25], [1.0, 0.9, 0.62], [1.0, 0.98, 0.92]])
    i = np.clip(i, 0, 1); out = np.zeros(i.shape + (3,))
    for c in range(3): out[..., c] = np.interp(i, stops, cols[:, c])
    return out
atlas = np.zeros((FH * 4, FW * 4, 4))
for f in range(NF):
    ph = f / NF * 2 * np.pi
    n = sum(a * np.sin(kx * x * 3.1 + kv * v * 6.283 - w * ph + c) for kx, kv, w, c, a in comps) / 3.5  # −1…1, по кругу фазы
    xs = x + n * 0.16 * v ** 1.2  # к хвосту факел «гуляет»
    R = 0.3 + 0.32 * v ** 0.5   # струя расширяется от среза сопла; к краю кадра гаусс сходит в ноль сам — без «рамки»     # струя расширяется от среза сопла
    core = np.exp(-(xs / (0.34 * R)) ** 2) * np.exp(-v * 3.0)
    outer = np.exp(-1.5 * (xs / R) ** 2) * (1 - v) ** 1.15 * (0.75 + 0.25 * n)
    dm = np.clip(1 - v / 0.55, 0, 1)
    diam = (0.5 + 0.5 * np.cos(2 * np.pi * (v * 7.5 - 0.15))) ** 8 * np.exp(-(xs / (0.22 * (1 - 0.5 * v))) ** 2) * dm
    I = np.clip(0.75 * outer + 0.9 * core + 0.5 * diam, 0, None)
    I = 1 - np.exp(-I * 1.8)        # мягкий предел — ядро не «выбивает» в плоское белое
    sm = lambda a, b, t: np.clip((t - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((t - a) / (b - a), 0, 1))
    edge = (1 - sm(0.6, 1.0, np.abs(x))) * (1 - sm(0.7, 1.0, v)) * sm(0.0, 0.035, v)  # края кадра — в ноль (без швов раскадровки)
    I = I * edge
    rgb = ramp(I) * I[..., None]
    cx, cy = (f % 4) * FW, (f // 4) * FH
    atlas[cy:cy + FH, cx:cx + FW, :3] = rgb; atlas[cy:cy + FH, cx:cx + FW, 3] = I
Image.fromarray((np.clip(atlas, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(OUT + 'plume_flame.png', optimize=True)

# ── дым ──
S = 256
ky = np.fft.fftfreq(S)[:, None]; kx = np.fft.fftfreq(S)[None, :]; k = np.sqrt(kx ** 2 + ky ** 2); k[0, 0] = 1
spec = (rng.normal(size=(S, S)) + 1j * rng.normal(size=(S, S))) / k ** 2.0; spec[0, 0] = 0
spec[k > 0.12] *= 0.3  # мелочь тише — клубы, а не песок
d = np.real(np.fft.ifft2(spec)); d = (d - d.mean()) / d.std()
dens = 1 / (1 + np.exp(-(d * 1.25 + 0.45)))  # 0…1, больше светлых клубов
gy = np.roll(dens, -2, 0) - np.roll(dens, 2, 0); gx = np.roll(dens, -2, 1) - np.roll(dens, 2, 1)
shade = np.clip(0.8 + 1.6 * (-gy * 0.7 - gx * 0.3), 0.45, 1.0)  # свет сверху-слева: освещённые края клубов светлее
img = np.dstack([shade, shade, shade, dens])
Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(OUT + 'plume_smoke.png', optimize=True)
print('ok', OUT)
