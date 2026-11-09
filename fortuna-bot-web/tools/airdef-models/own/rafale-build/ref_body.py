# ref_body.py - наружный контур корпуса по станциям с модели CloudHub «Dassault Rafale» (CC BY 4.0, https://sketchfab.com/3d-models/dassault-rafale-fce1a5076caf4710917c14624b4d7d22).
# Вход: _live/ref_cc2_raw.json (сечения, снятые в Blender). Выход: ref_body.json - кольца по 96 точек, a от острия носа, x вправо, y вверх от острия.
import json, math, os
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); N = 96
R = json.load(open(os.path.join(HERE, '_live', 'ref_cc2_raw.json')))['st']
def XL(a): return 9.0 if a < 5.1 else 1.52
out = {}
for s, D in R.items():
    a = float(s); S = np.array(D['segs'], float)
    if len(S) == 0: continue
    lim = XL(a); S = S[(np.abs(S[:, 0]) <= lim) & (np.abs(S[:, 2]) <= lim)]
    if len(S) == 0: continue
    c = S[(np.abs(S[:, 0]) < 0.15) | (np.abs(S[:, 2]) < 0.15)]
    if len(c) == 0: continue
    zc = (max(c[:, 1].max(), c[:, 3].max()) + min(c[:, 1].min(), c[:, 3].min())) / 2
    p0 = S[:, 0:2] - [0, zc]; p1 = S[:, 2:4] - [0, zc]; dv = p1 - p0
    r = np.full(N, np.nan)
    for k in range(N):
        th = -math.pi / 2 + 2 * math.pi * k / N; u = np.array([math.cos(th), math.sin(th)])
        den = u[0] * dv[:, 1] - u[1] * dv[:, 0]; ok = np.abs(den) > 1e-12
        t = np.where(ok, (p0[:, 0] * dv[:, 1] - p0[:, 1] * dv[:, 0]) / np.where(ok, den, 1), -1)
        w = np.where(ok, (p0[:, 0] * u[1] - p0[:, 1] * u[0]) / np.where(ok, den, 1), -1)
        hit = ok & (t > 0) & (w >= -1e-6) & (w <= 1 + 1e-6)
        if hit.any(): r[k] = t[hit].max()
    m = np.array([r[k] if not np.isnan(r[k]) else -1 for k in range(N)]); mi = np.array([m[(N // 2 - k) % N] for k in range(N)]); rr = np.maximum(m, mi)
    out[a] = (zc, rr)
# пустые лучи (дыры в сетке образца: ниша стойки, корень крыла) - по предыдущей станции, а не по соседним лучам
prev = None
for a in sorted(out):
    zc, rr = out[a]
    if prev is not None:
        miss = rr < 0; rr = np.where(miss, prev, rr)
    if (rr < 0).any():
        good = np.where(rr >= 0)[0]
        if len(good) < N // 3: del out[a]; continue
        idx = np.arange(N); rr = np.interp(idx, np.concatenate([good - N, good, good + N]), np.concatenate([rr[good]] * 3))
    out[a] = (zc, rr); prev = rr
A = sorted(out); Z = np.array([out[a][0] for a in A]); RR = np.array([out[a][1] for a in A])
# лёгкое сглаживание вдоль длины (3 станции), острие не трогаем
RS = RR.copy(); ZS = Z.copy()
for i in range(1, len(A) - 1):
    if A[i] > 0.4: RS[i] = (RR[i - 1] + 2 * RR[i] + RR[i + 1]) / 4; ZS[i] = (Z[i - 1] + 2 * Z[i] + Z[i + 1]) / 4
rings = {}
for i, a in enumerate(A):
    th = [-math.pi / 2 + 2 * math.pi * k / N for k in range(N)]
    rings[str(a)] = [[round(RS[i][k] * math.cos(t), 4), round(ZS[i] + RS[i][k] * math.sin(t), 4)] for k, t in enumerate(th)]
json.dump(dict(note='контур корпуса по модели CloudHub, CC BY 4.0; используется как форма корпуса, автор указан в паспорте', N=N, rings=rings), open(os.path.join(HERE, 'ref_body.json'), 'w'))
print('колец', len(rings), 'от', A[0], 'до', A[-1])
