# camo_link.py - хаки одним связным рисунком (Mark, 2026-11-06): поле камуфляжа F > 0 - олива. Поверхность самолёта разбита на ячейки (8 см) с учётом стороны: верх и низ крыла, стороны киля не считаются соседями,
# поэтому пятно на верху крыла не может «соединиться» через кромку снизу. Островки оливы соединяются с главной областью извилистой перемычкой по поверхности (путь идёт там, где поле и так близко к порогу), совсем мелкие убираются. Результат кэшируется: рисунок при 2048 и 4096 один и тот же.
import heapq, os
import numpy as np
CELL = 0.08; LO = np.array((-5.0, -8.0, -1.5), np.float32)


def sm(e0, e1, v):
    t = np.clip((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)


def bins(px, pz, nx, ny, nz):
    """0..5 - обшивка корпуса по главной оси нормали (+x,-x,+y,-y,+z,-z); 6,7 - верх и низ крыла; 8,9 - киль слева и справа."""
    ab = np.stack([np.abs(nx), np.abs(ny), np.abs(nz)], -1); ax_ = ab.argmax(-1); sg = np.take_along_axis(np.stack([nx, ny, nz], -1), ax_[..., None], -1)[..., 0]; b = ax_ * 2 + (sg < 0)
    wing = np.abs(px) > 1.10; fin = (pz > 0.95) & (np.abs(px) < 0.10)
    b = np.where(wing, np.where(nz >= 0, 6, 7), b); b = np.where(fin, np.where(px < 0, 8, 9), b); return b


# какие стороны могут быть соседями
OK = {(0, 1): 0, (2, 3): 0, (4, 5): 0, (6, 7): 0, (8, 9): 0, (6, 5): 0, (7, 4): 0, (6, 2): 0, (6, 3): 0, (7, 2): 0, (7, 3): 0, (8, 0): 0, (9, 1): 0, (8, 2): 0, (8, 3): 0, (9, 2): 0, (9, 3): 0, (8, 5): 0, (9, 5): 0, (8, 6): 0, (8, 7): 0, (9, 6): 0, (9, 7): 0}
def can(a, b): return (a, b) not in OK and (b, a) not in OK


def graph(pos, nor, F):
    ix = np.floor((pos - LO) / CELL).astype(np.int32); b = bins(pos[:, 0], pos[:, 2], nor[:, 0], nor[:, 1], nor[:, 2]); key = (ix[:, 0].astype(np.int64) << 44) | (ix[:, 1].astype(np.int64) << 28) | (ix[:, 2].astype(np.int64) << 12) | b.astype(np.int64)
    uk, inv, cnt = np.unique(key, return_inverse=True, return_counts=True); mean = np.bincount(inv, weights=F, minlength=len(uk)) / cnt
    idx = {int(k): i for i, k in enumerate(uk)}; nb = [[] for _ in uk]
    dec = [(int(k >> 44), int((k >> 28) & 0xffff), int((k >> 12) & 0xffff), int(k & 0xfff)) for k in uk]; by = {}
    for i, (x_, y_, z_, b_) in enumerate(dec): by.setdefault((x_, y_, z_), []).append((i, b_))
    for i, (x_, y_, z_, b_) in enumerate(dec):
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for j, b2 in by.get((x_ + dx, y_ + dy, z_ + dz), ()):
                        if j != i and can(b_, b2): nb[i].append(j)
    return uk, inv, cnt, mean, nb, dec


def comps(oliv, nb):
    lab = np.full(len(oliv), -1, np.int32); n = 0; out = []
    for s in np.nonzero(oliv)[0]:
        if lab[s] >= 0: continue
        st = [int(s)]; lab[s] = n; c = []
        while st:
            u = st.pop(); c.append(u)
            for v in nb[u]:
                if oliv[v] and lab[v] < 0: lab[v] = n; st.append(v)
        out.append(c); n += 1
    return lab, out


def blur3(g, n=6):
    for ax_ in range(3):
        for _ in range(n): g = (np.roll(g, 1, ax_) + 2 * g + np.roll(g, -1, ax_)) * 0.25
    return g


def sample3(g, pos):
    p = (pos - LO) / CELL - 0.5; i = np.floor(p).astype(np.int32); f = p - i; i = np.clip(i, 0, np.array(g.shape) - 2); fx, fy, fz = f[..., 0], f[..., 1], f[..., 2]; x_, y_, z_ = i[..., 0], i[..., 1], i[..., 2]
    return ((g[x_, y_, z_] * (1 - fx) + g[x_ + 1, y_, z_] * fx) * (1 - fy) + (g[x_, y_ + 1, z_] * (1 - fx) + g[x_ + 1, y_ + 1, z_] * fx) * fy) * (1 - fz) + ((g[x_, y_, z_ + 1] * (1 - fx) + g[x_ + 1, y_, z_ + 1] * fx) * (1 - fy) + (g[x_, y_ + 1, z_ + 1] * (1 - fx) + g[x_ + 1, y_ + 1, z_ + 1] * fx) * fy) * fz


GSHAPE = (int(10 / CELL) + 2, int(16 / CELL) + 2, int(6 / CELL) + 2)


def apply_fields(Fv, posv, norz, wob, G):
    """G: выпуклые поля перемычек и удалений. Поле тянется к +c на перемычке и к -c там, где убран мелкий островок; граница остаётся мягкой и неровной."""
    wu = sm(-0.35, 0.10, norz); wl = sm(0.35, -0.10, norz)
    bu = sample3(G['pu'], posv); bl = sample3(G['pl'], posv); ru = sample3(G['ru'], posv); rl = sample3(G['rl'], posv)
    B = np.maximum(wu * bu, wl * bl); R = np.maximum(wu * ru, wl * rl)
    B = sm(0.22, 0.62, B * (0.62 + 0.76 * wob)); R = sm(0.05, 0.25, R)
    out = Fv * (1 - B) + 0.035 * B; return out * (1 - R) - 0.035 * R


def link(F, pos, nor, wob, mask, cache=None, log=print, min_area=0.45):
    """F, pos, nor, wob - массивы текстуры; mask - окрашиваемые точки. Возвращает новое F по всей текстуре."""
    if cache and os.path.exists(cache):
        z_ = np.load(cache); G = {k: z_[k] for k in ('pu', 'pl', 'ru', 'rl')}; log('камуфляж: перемычки из кэша')
    else:
        G = {k: np.zeros(GSHAPE, np.float32) for k in ('pu', 'pl', 'ru', 'rl')}; ids = np.nonzero(mask.ravel())[0][::3]; ps, ns = pos.reshape(-1, 3)[ids], nor.reshape(-1, 3)[ids]; Fs = F.ravel()[ids].astype(np.float64); ws = wob.ravel()[ids]
        uk, inv, cnt, mean, nb, dec = graph(ps, ns, Fs)
        for it in range(6):
            Fn = apply_fields(Fs, ps, ns[:, 2], ws, G); mean = np.bincount(inv, weights=Fn, minlength=len(uk)) / cnt; ol = mean > 0; lab, cs = comps(ol, nb); cs.sort(key=len, reverse=True)
            log(f'камуфляж: проход {it}, ячеек оливы {int(ol.sum())}, областей {len(cs)}, размеры {[len(c) for c in cs[:8]]}')
            if len(cs) <= 1: break
            main = set(cs[0]); pu, pl, ru, rl = np.zeros(GSHAPE, np.float32), np.zeros(GSHAPE, np.float32), np.zeros(GSHAPE, np.float32), np.zeros(GSHAPE, np.float32)
            for c in cs[1:]:
                area = len(c) * CELL * CELL
                if area < min_area:
                    for u in c:
                        x_, y_, z_, b_ = dec[u]
                        if b_ not in (5, 7): ru[x_, y_, z_] = 1
                        if b_ not in (4, 6): rl[x_, y_, z_] = 1
                    continue
                # кратчайший путь по поверхности до главной области: дешевле там, где поле близко к порогу
                dist = {u: 0.0 for u in c}; prev = {}; hq = [(0.0, u) for u in c]; heapq.heapify(hq); end = None
                while hq:
                    d_, u = heapq.heappop(hq)
                    if d_ > dist.get(u, 1e18): continue
                    if u in main: end = u; break
                    for v in nb[u]:
                        w = 1.0 + 40.0 * max(0.0, -mean[v]) ; nd = d_ + w
                        if nd < dist.get(v, 1e18): dist[v] = nd; prev[v] = u; heapq.heappush(hq, (nd, v))
                if end is None: log('камуфляж: нет пути для области', len(c)); continue
                u = end; n_ = 0
                while u in prev:
                    x_, y_, z_, b_ = dec[u]
                    if b_ not in (5, 7): pu[x_, y_, z_] = 1
                    if b_ not in (4, 6): pl[x_, y_, z_] = 1
                    u = prev[u]; n_ += 1
            # толщина перемычки около 0,7 м: широкая полоса, а не нитка
            for k, v in (('pu', pu), ('pl', pl)):
                bl_ = blur3(v, 10); G[k] = np.maximum(G[k], bl_ / max(float(bl_.max()), 1e-6))
            for k, v in (('ru', ru), ('rl', rl)):
                bl_ = blur3(v, 2); G[k] = np.maximum(G[k], bl_ / max(float(bl_.max()), 1e-6))
        if cache: np.savez_compressed(cache, **G)
    out = F.copy(); m = mask.ravel(); out.ravel()[m] = apply_fields(F.ravel()[m].astype(np.float32), pos.reshape(-1, 3)[m], nor.reshape(-1, 3)[m, 2], wob.ravel()[m], G)
    # вне окрашиваемых точек поле тоже меняем, иначе у границ деталей полосы
    nm = ~m; out.ravel()[nm] = apply_fields(F.ravel()[nm].astype(np.float32), pos.reshape(-1, 3)[nm], nor.reshape(-1, 3)[nm, 2], wob.ravel()[nm], G); return out
