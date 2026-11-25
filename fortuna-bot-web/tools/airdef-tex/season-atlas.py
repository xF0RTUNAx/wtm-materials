# Земля осени и зимы «по сканам» (CC0: Poly Haven, ambientCG), проба ?scan=1 (Mark 2026-11-25): атлас 4 × 4 на карту, как у города (scan-atlas.py).
#   PY=/Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13; $PY tools/airdef-tex/season-atlas.py [a] [w]
import os, sys, glob
_d = os.path.dirname(os.path.abspath(__file__)); _s = open(f'{_d}/scan-atlas.py').read(); __file__ = f'{_d}/scan-atlas.py'
exec(_s[:_s.index('ONLY = [')])
X = lambda n, M, amp=1., sat=.95, how='mix': (f'{T2}/{n}', M, amp, sat, how)
SETS = {
  'a': [z('withered_grass', 2), z('leafy_grass', 2, 1, .8), z('grass_path_3', 2), z('grass_path_2', 1.6), z('Grass001', 1.4, 1, .6), z('dry_decay_leaves', 2), z('leaves_forest_ground', 2), X('forest_leaves_03_2k', 2.4),
        X('forest_leaves_02_1k', 2.4, 1, .8), z('Ground072', 2), z('Ground106', 2), X('brown_mud_03_1k', 2), z('farm_soil', 2), z('stony_dirt_path', 2.2), z('forrest_ground_01', 2, 1, .7), X('brown_mud_leaves_01_2k', 2.4, 1, .7)],
  'w': [X('snow_02_2k', 3), X('snow_01_2k', 3), X('snow_03_2k', 3), X('snow_floor_2k', 2), z('Ground108', 2.4), z('withered_grass', 2), z('Ground106', 2), z('stony_dirt_path', 2.2), z('forrest_ground_01', 2, 1, .6), z('leaves_forest_ground', 2, 1, .4),
        z('farm_soil', 2), z('gravel_floor_03', 2.5), X('rocky_terrain_03_1k', 3, 1, .25), X('snow_05_2k', 3, 1, .95, 'rep'), z('Grass001', 1.4, 1, .4), X('dry_mud_field_001_2k', 2)] }
_find = find
def find(d, pats):  # наборы из glTF - без карты высот
    return _find(d, pats)
def tile2(spec, S, seed):
    d, M, amp, sat, how = spec; s = S // max(1, round(TM / M)) if how == 'rep' else round(S * M / TM / 2) * 2; s = min(s, 2048)
    cp = find(d, ['_diff', '_Color', '_col_']); c = read(cp, s); hp = find(d, ['_disp', 'Displacement', '_height'])
    L = c.mean(2); h = read(hp, s, True)[..., 0] if hp else blur(L, s / 400)
    nm = read(find(d, ['nor_gl', 'NormalGL']), s)[..., :2]; ap = find(d, ['_ao_', 'AmbientOcclusion']); ao = read(ap, s, True)[..., 0] if ap else np.ones((s, s), np.float32)
    big = blur(L, s / 9); c = np.clip(c * ((L.mean() / np.maximum(big, .02)) ** .7)[..., None], 0, 1) * (ao ** .7)[..., None]
    h = h - blur(h, h.shape[0] / 7) * .8; lo, hi = np.percentile(h, [1, 99]); h = np.clip((h - lo) / max(hi - lo, 1e-4), 0, 1)
    cav = np.clip(1 + (h - blur(h, h.shape[0] / 60)) * .6, .6, 1.12); c = np.clip(c * cav[..., None], 0, 1)
    g = c.mean(2, keepdims=True); c = np.clip(g + (c - g) * sat, 0, 1); nm = np.clip((nm - .5) * amp + .5, 0, 1)
    a = np.concatenate([c, h[..., None], nm, np.full_like(h, .85)[..., None]], 2)
    if how == 'mix': return synth(a, S, seed)
    n = S // a.shape[0]; return np.tile(a, (n, n, 1))[:S, :S] if n > 1 else a
F = f'{WEB}/games/airdef/ground-tiles-season.js'; info = {}
if os.path.exists(F): q = open(F).read(); info = json.loads(q[q.index('{'):q.rindex('}') + 1])
for key in [k for k in (sys.argv[1:] or ['a', 'w'])]:
    T = []; info[key] = []
    for i, sp in enumerate(SETS[key]):
        a = tile2(sp, 2048, i + 31); m = (a[..., :3] ** 2).reshape(-1, 3).mean(0); T.append(a); info[key].append({'name': os.path.basename(sp[0]), 'mean': [round(float(v), 4) for v in m]}); print(key, i, info[key][-1], flush=True)
    for sfx, Cc, Cn in (('hi', 1024, 1024), ('lo', 512, 256)):
        A = np.zeros((4 * Cc, 4 * Cc, 4), np.float32); N = np.ones((4 * Cn, 4 * Cn, 4), np.float32)
        for i, a in enumerate(T):
            y, x = divmod(i, 4); A[y * Cc:(y + 1) * Cc, x * Cc:(x + 1) * Cc] = cell(a[..., :4], Cc); N[y * Cn:(y + 1) * Cn, x * Cn:(x + 1) * Cn] = cell(np.concatenate([a[..., 4:7], np.ones_like(a[..., :1])], 2), Cn)
        basis(write(A, f'sg{key}c{sfx}'), f'sg{key}_c_{sfx}'); basis(write(N, f'sg{key}n{sfx}'), f'sg{key}_n_{sfx}'); print(key, sfx, flush=True)
    open(F, 'w').write('// Плитки осени и зимы «по сканам» (CC0), проба: пишет tools/airdef-tex/season-atlas.py\nexport const GTILES_SEASON = ' + json.dumps(info, ensure_ascii=False) + ';\n')
