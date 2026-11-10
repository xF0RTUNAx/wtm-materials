# _overlay.py - наложение модели на фото: план (b2_12 сверху, b2_14 снизу) по тому же приближению, что в _plan.py; профиль сбоку на b2_05.
# Красный - контур модели. /usr/bin/python3 -I _overlay.py
import site, sys, json
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, '.')
H = '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/B-2A/'
V = np.load(H + '_снимки/verts.npy'); L = 21.0
a = L / 2 - V[:, 1]; x = V[:, 0]; z = V[:, 2]
# контур плана: по x - самая передняя и самая задняя точка, плотно
import b2_geo_plan as gp
def plan_outline():
    xs = list(np.linspace(-26.11, 26.11, 2001)) + [s_ * v for v in (gp.X_N2, gp.X_A1, gp.X_N1, gp.X_TT) for s_ in (1, -1)] + [0.0]; xs = sorted(xs)
    return [(gp.a_le(v), v) for v in xs] + [(gp.a_te(v), v) for v in reversed(xs)]
OUT = plan_outline()
def fit(img, N, pairs, C):
    P = {k: (np.array(p, float), np.array(q, float)) for k, (p, q) in pairs.items()}
    w = sum((q - p) / np.linalg.norm(q - p) for p, q in P.values()); w /= np.linalg.norm(w)
    mids = np.array([(p + q) / 2 for p, q in P.values()] + [C, N]); c0 = mids.mean(0); _, _, Vt = np.linalg.svd(mids - c0); u = Vt[0]
    if u.dot(C - N) < 0: u = -u
    M = np.column_stack([u, w]); ab = lambda p: np.linalg.solve(M, p - N)
    raw = {k: (ab(p), ab(q)) for k, (p, q) in P.items()}; raw['C'] = (ab(C), ab(C))
    sx = 26.111 / ((abs(raw['tipLE'][0][1]) + abs(raw['tipLE'][1][1])) / 2); sa = L / max(max(p[0], q[0]) for p, q in raw.values())
    sgn = 1 if raw['tipLE'][1][1] > 0 else -1           # вторая точка пары - +x
    return lambda aa, xx: N + (aa / sa) * u + (sgn * xx / sx) * w
SETS = {
 'b2_12.png': ((442.7, 171.7), {'tipLE': ((121.7, 6.7), (120, 353.3)), 'tipTE': ((80, 28.3), (68.3, 323.3)), 'N1': ((176.7, 88.3), (175, 268.3)), 'A1': ((106.7, 131.7), (101.7, 233.3)), 'N2': ((136.7, 146.7), (135, 213.3))}, (91.7, 180.0)),
 'b2_14.webp': ((1118, 238), {'tipLE': ((103, 49), (781, 773)), 'tipTE': ((56, 129), (645, 747)), 'N1': ((422, 203), (755, 567)), 'A1': ((329, 355), (512, 547)), 'N2': ((441, 373), (540, 479))}, (397, 453)),
}
for nm, (N, pairs, C) in SETS.items():
    f = fit(nm, np.array(N, float), pairs, np.array(C, float)); im = Image.open(H + 'референсы/' + nm).convert('RGB'); k = 3 if im.width < 800 else 1.5
    im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS); d = ImageDraw.Draw(im)
    pts = [tuple(f(aa, xx) * k) for aa, xx in OUT]; d.line(pts + [pts[0]], fill=(255, 30, 30), width=2)
    im.save(H + '_снимки/наложение_план_' + nm.split('.')[0] + '.jpg', quality=90)
# сбоку: b2_05, нос (987, 329), хвост на 30 пикс; 45,6 пикс/м
im = Image.open(H + 'референсы/b2_05.webp').convert('RGB'); k = 2; im = im.resize((im.width * k, im.height * k), Image.LANCZOS); d = ImageDraw.Draw(im)
S = 957 / L; up = []; lo = []
for aa in np.linspace(0, 21, 211):
    m = np.abs(a - aa) < 0.08
    if m.any(): up.append((987 - aa * S, 329 - z[m].max() * S)); lo.append((987 - aa * S, 329 - z[m].min() * S))
pts = [(p[0] * k, p[1] * k) for p in up + list(reversed(lo))]; d.line(pts + [pts[0]], fill=(255, 30, 30), width=2)
im.crop((0, 380, im.width, 900)).save(H + '_снимки/наложение_бок_b2_05.jpg', quality=90)
print('готово')
