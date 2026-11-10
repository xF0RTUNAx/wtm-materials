# _overlay.py - форма на фото по перспективной камере: DLT по 8-10 точкам (модель в мировых осях build.py <-> пиксели фото), проекция треугольников _снимки/tris.npy,
# красная заливка с прозрачностью и контур. /usr/bin/python3 -I _overlay.py [04|01]
import site, sys, os
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw
H = os.path.dirname(os.path.abspath(__file__)); S = H + '/_снимки/'
Y = lambda a: 15.36 - a
PTS = {
 '04': [((0, Y(0.00), 0.80), (927, 213), 'острие штанги'), ((0, Y(2.30), 0.53), (891, 236), 'нос'), ((0, Y(7.45), 2.43), (758, 187), 'верх фонаря'),
        ((0, Y(25.95), 5.05), (240, 198), 'киль: верх передней кромки'), ((0, Y(28.45), 5.05), (305, 192), 'киль: верх задней кромки'), ((0, Y(19.95), 1.24), (397, 262), 'киль: корень передней кромки'),
        ((-16.83, Y(26.45), -0.08), (12, 317), 'конец левого крыла'), ((-3.08, Y(28.20), -0.02), (234, 333), 'наружное левое сопло'),
        ((-4.85, Y(13.30), 0.04), (566, 256), 'заборник: наружный конец'), ((-1.45, Y(9.90), 0.04), (640, 252), 'заборник: у фюзеляжа')],
 '01': [((0, Y(0.00), 0.80), (86, 350), 'острие штанги'), ((0, Y(2.30), 0.53), (128, 357), 'нос'), ((0, Y(7.45), 2.43), (283, 326), 'верх фонаря'),
        ((0, Y(25.95), 5.05), (880, 272), 'киль: верх передней кромки'), ((0, Y(28.45), 5.05), (964, 284), 'киль: верх задней кромки'), ((0, Y(30.72), 0.17), (934, 410), 'конец хвостового конуса'),
        ((16.834, Y(27.59), -0.077), (642, 104), 'правое крыло: задний угол конца'), ((-16.834, Y(27.59), -0.077), (1085, 744), 'левое крыло: задний угол конца'),
        ((1.42, Y(9.86), 0.0), (364, 313), 'правое крыло: корень передней кромки'), ((-1.42, Y(9.86), 0.0), (375, 405), 'левое крыло: корень передней кромки')],
}
def proj(P, X):
    Xh = np.c_[X, np.ones(len(X))] @ P.T; return Xh[:, :2] / Xh[:, 2:3], Xh[:, 2]
def _rot(r):
    th = np.linalg.norm(r)
    if th < 1e-12: return np.eye(3)
    k = r / th; Kx = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]]); return np.eye(3) + np.sin(th) * Kx + (1 - np.cos(th)) * Kx @ Kx
def _P(q, c):
    R = _rot(q[:3]); t = q[3:6]; f = q[6]; K = np.array([[f, 0, c[0]], [0, f, c[1]], [0, 0, 1]]); return K @ np.c_[R, t]
def dlt(P3_, P2_, size):
    """Камера-обскура: поворот, сдвиг, фокус; центр кадра - середина снимка. Левенберг-Марквардт из многих начальных направлений."""
    X = np.array(P3_, float); U = np.array(P2_, float); c = np.array(size, float) / 2
    def res(q):
        uv, w = proj(_P(q, c), X); return (uv - U).ravel() if (w > 0).all() else np.full(2 * len(X), 1e4)
    best = None
    for az in np.linspace(0, 2 * np.pi, 12, endpoint=False):
        for el in (-0.6, -0.2, 0.2, 0.6):
            for f in (800, 1500, 3000):
                d = np.array([np.cos(el) * np.cos(az), np.cos(el) * np.sin(az), np.sin(el)]); cam = d * 60
                z_ = -d; x_ = np.cross(z_, [0, 0, 1]); x_ /= np.linalg.norm(x_) + 1e-9; y_ = np.cross(z_, x_)
                R = np.array([x_, y_, z_]); r = R.T  # мир -> камера
                Rw = np.array([x_, y_, z_]); ang = np.arccos(np.clip((np.trace(Rw) - 1) / 2, -1, 1))
                rv = np.array([Rw[2, 1] - Rw[1, 2], Rw[0, 2] - Rw[2, 0], Rw[1, 0] - Rw[0, 1]]); rv = rv / (2 * np.sin(ang) + 1e-12) * ang
                q = np.r_[rv, -Rw @ cam, f]; lam = 1e-2
                for it in range(200):
                    e = res(q); J = np.zeros((len(e), 7))
                    for j in range(7):
                        dq = np.zeros(7); dq[j] = 1e-6 * max(1.0, abs(q[j])); J[:, j] = (res(q + dq) - e) / dq[j]
                    A = J.T @ J; g = J.T @ e; step = np.linalg.solve(A + lam * np.diag(np.diag(A) + 1e-9), -g); e2 = res(q + step)
                    if (e2 ** 2).sum() < (e ** 2).sum(): q = q + step; lam *= 0.5
                    else: lam *= 4
                    if lam > 1e8: break
                sc = (res(q) ** 2).sum()
                if best is None or sc < best[0]: best = (sc, q)
    return _P(best[1], c)
key = sys.argv[1] if len(sys.argv) > 1 else '04'
pts = PTS[key]; ph0 = Image.open(S + f'рефы/vulcan_{key}.png'); P = dlt([p[0] for p in pts], [p[1] for p in pts], ph0.size)
uv, w = proj(P, np.array([p[0] for p in pts], float)); err = np.linalg.norm(uv - np.array([p[1] for p in pts]), axis=1)
for p, e in zip(pts, err): print(f'{p[2]:32s} ошибка {e:5.1f} пикс')
T = np.load(S + 'tris.npy').reshape(-1, 3); uvT, wT = proj(P, T); uvT = uvT.reshape(-1, 3, 2)
ph = Image.open(S + f'рефы/vulcan_{key}.png').convert('RGBA'); K = 3
m = Image.new('L', (ph.width * K, ph.height * K), 0); d = ImageDraw.Draw(m)
for t in uvT: d.polygon([(float(x) * K, float(y) * K) for x, y in t], fill=255)
m = m.resize(ph.size, Image.LANCZOS); a = np.array(m, float) / 255
lay = np.zeros((ph.height, ph.width, 4), np.uint8); lay[..., 0] = 255; lay[..., 1] = 40; lay[..., 2] = 40; lay[..., 3] = (a * 0.38 * 255).astype(np.uint8)
ed = np.abs(np.gradient(a)[0]) + np.abs(np.gradient(a)[1]); lay[ed > 0.25, 3] = 230; lay[ed > 0.25, 0:3] = (255, 30, 30)
out = ph.copy(); out.alpha_composite(Image.fromarray(lay, 'RGBA')); dr = ImageDraw.Draw(out)
for (p3, p2, n), q in zip(pts, uv): dr.ellipse([p2[0] - 4, p2[1] - 4, p2[0] + 4, p2[1] + 4], outline=(40, 120, 255, 255), width=2); dr.line([tuple(p2), tuple(q)], fill=(40, 120, 255, 255), width=2)
out.convert('RGB').save(S + f'наложение_{key}.jpg', quality=90); print('наложение', key, 'готово, средняя ошибка точек', round(float(err.mean()), 1), 'пикс')
