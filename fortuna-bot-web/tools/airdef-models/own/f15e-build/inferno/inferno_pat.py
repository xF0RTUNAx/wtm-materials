# inferno_pat.py - узор «Инферно» (ключ e_f15e:inferno) для новой модели: тот же рисунок, что в Камуфляжи/e_f15e/paint.py (языки, семена, палитра), в координатах новой модели.
# Старые оси: нос +Y (9,71), x вправо, z по центру старого файла. У новой модели ось сопел z = 0, у старой z = -0,95: z_old = z - 0,95. Кили и стабилизаторы - по кромкам новой формы.
import numpy as np


def lin(s): s = np.asarray(s, float) / 255.0; return np.where(s <= 0.04045, s / 12.92, ((s + 0.055) / 1.055) ** 2.4)
def srgb(l): l = np.clip(l, 0, 1); return np.where(l <= 0.0031308, 12.92 * l, 1.055 * l ** (1 / 2.4) - 0.055)
def sstep(a, b, t): t = np.clip((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def rnd(i, seed): h = np.sin(i * 127.1 + seed * 311.7) * 43758.5453; return h - np.floor(h)


def tongues(s, t, B, Lmin, Lmax, w, seed, curl=0.05, k=1.3, p=1.5, stable=True):
    """stable: номер языка по неизогнутой координате, язык не перескакивает на соседнюю дорожку и не даёт оторванных кончиков (замечание Mark 2026-11-05)."""
    tt = t + curl * s * np.sin(k * s + seed); i = np.floor((t if stable else tt) / w); u = tt / w - i - 0.5
    L = Lmin + (Lmax - Lmin) * rnd(i, seed); smax = B + L * np.clip(np.cos(np.pi * np.clip(u, -0.5, 0.5)), 0, 1) ** p
    F_ = smax - s
    if stable:      # язык кончается там, где впервые вышел за свою дорожку: обратно не возвращается, оторванных кусков нет
        ts = np.linspace(float(t.min()), float(t.max()), 4000); ss = np.arange(0.0, 16.0, 0.03); i0 = np.floor(ts / w); seeds = np.asarray(seed, float)
        for sv in np.unique(seeds):
            bad = np.abs((ts[:, None] + curl * ss[None, :] * np.sin(k * ss[None, :] + sv)) / w - i0[:, None] - 0.5) >= 0.5
            first = bad.argmax(1); first[~bad.any(1)] = len(ss) - 1; cut = np.interp(t, ts, ss[first]) - s
            F_ = np.where(seeds == sv, np.minimum(F_, cut), F_)
    return F_, np.clip(s / (B + Lmax), 0, 1)


def sd(field, u, v, *a, **kw):
    h = 0.004; f0, hh = field(u, v, *a, **kw); fu, _ = field(u + h, v, *a, **kw); fv, _ = field(u, v + h, *a, **kw)
    g = np.hypot((fu - f0) / h, (fv - f0) / h) + 1e-3; g = np.where(g > 150.0, 12.0, g)     # скачок на границе дорожек - не край: иначе тонкие красные волоски
    return np.clip(f0 / g, -1, 1), hh


def union(*fs):
    d = np.stack([f[0] for f in fs]); hh = np.stack([f[1] for f in fs]); j = np.argmax(d, 0)
    return np.take_along_axis(d, j[None], 0)[0], np.take_along_axis(hh, j[None], 0)[0]


NOSE = 8.45
def f_nose_plan(u, v, seed): F_, h_ = tongues(NOSE - v, np.abs(u), 1.5, 1.2, 7.0, 0.42, seed); return np.minimum(F_, NOSE - v), h_
def f_fan(u, v, seed):
    sx = np.sign(u); cx, cy = 0.9 * sx, 7.0; dx, dy = (u - cx) * sx, cy - v; r = np.hypot(dx, dy); th = np.arctan2(dx, dy)
    F_, h_ = tongues(r - 2.6, th * 6.0, 0.9, 2.2, 8.6, 0.5, seed, curl=0.03, k=0.9); return np.where(th > -0.35, F_, -1.0), h_
def f_nose_side(u, v, seed): F_, h_ = tongues(NOSE - u, v, 1.5, 1.0, 6.2, 0.3, seed, curl=0.04); return np.minimum(F_, NOSE - u), h_
def f_intake_side(u, v, seed): return tongues(4.45 - u, v + 2.0, 0.5, 2.5, 6.5, 0.32, seed, curl=0.04)


def smooth_field(P, vals, h=0.25):
    lo = P.min(0) - h; idx = np.floor((P - lo) / h).astype(int); sh = idx.max(0) + 2; acc = np.zeros(tuple(sh) + (vals.shape[1],)); cnt = np.zeros(tuple(sh))
    np.add.at(acc, (idx[:, 0], idx[:, 1], idx[:, 2]), vals); np.add.at(cnt, (idx[:, 0], idx[:, 1], idx[:, 2]), 1)
    for ax_ in range(3): acc = (np.roll(acc, 1, ax_) + 2 * acc + np.roll(acc, -1, ax_)) / 4; cnt = (np.roll(cnt, 1, ax_) + 2 * cnt + np.roll(cnt, -1, ax_)) / 4
    avg = acc / np.maximum(cnt, 1e-6)[..., None]; f = (P - lo) / h - 0.5; i0 = np.clip(np.floor(f).astype(int), 0, sh - 2); t = np.clip(f - i0, 0, 1); out = 0
    for dx_ in (0, 1):
        for dy_ in (0, 1):
            for dz_ in (0, 1):
                w = (t[:, 0] if dx_ else 1 - t[:, 0]) * (t[:, 1] if dy_ else 1 - t[:, 1]) * (t[:, 2] if dz_ else 1 - t[:, 2]); out = out + w[:, None] * avg[i0[:, 0] + dx_, i0[:, 1] + dy_, i0[:, 2] + dz_]
    return out


def connected(mask, seed):
    """Заливка: клетки mask, связанные с seed (4 соседа). Без внешних библиотек: быстрые проходы слева направо и обратно."""
    m = seed & mask
    for _ in range(4000):
        prev = m.sum()
        for ax_ in (0, 1):
            for rev in (False, True):
                mm = m if not rev else np.flip(m, ax_); kk = mask if not rev else np.flip(mask, ax_)
                mm = mm.copy(); arr = np.moveaxis(mm, ax_, 0); ka = np.moveaxis(kk, ax_, 0)
                for i_ in range(1, arr.shape[0]): arr[i_] |= arr[i_ - 1] & ka[i_]
                m = mm if not rev else np.flip(mm, ax_)
        if m.sum() == prev: break
    return m


def surface(u, v, sel, u0, u1, v0, v1, st=0.02, grow=3):
    """Где на сетке есть поверхность самолёта: щели рулей закрыты запасом grow клеток, воздух перед кромкой остаётся пустым."""
    nu, nv = int(round((u1 - u0) / st)) + 1, int(round((v1 - v0) / st)) + 1; g_ = np.zeros((nu, nv), bool)
    g_[np.clip(np.round((u[sel] - u0) / st).astype(int), 0, nu - 1), np.clip(np.round((v[sel] - v0) / st).astype(int), 0, nv - 1)] = True
    for _ in range(grow): g_ = g_ | np.roll(g_, 1, 0) | np.roll(g_, -1, 0) | np.roll(g_, 1, 1) | np.roll(g_, -1, 1)
    return g_


def keep_lookup(fn, occ, u0, u1, v0, v1, seed_of, st=0.02):
    """Пламя, связанное с корнем по самой поверхности. Язык, прошедший через воздух, дальше не рисуется. seed_of(U, V) -> клетки корня."""
    nu, nv = occ.shape; us = u0 + st * np.arange(nu); vs = v0 + st * np.arange(nv); U_, V_ = np.meshgrid(us, vs, indexing='ij'); d_, _ = fn(U_.ravel(), V_.ravel()); M_ = (d_ > 0).reshape(U_.shape) & occ
    K_ = connected(M_, seed_of(U_, V_))
    for _ in range(2): K_ = K_ | np.roll(K_, 1, 0) | np.roll(K_, -1, 0) | np.roll(K_, 1, 1) | np.roll(K_, -1, 1)     # запас 2 клетки: край языка не обрезается
    print('  пламя', int(M_.sum()), 'оторвано', int((M_ & ~K_).sum()))
    return lambda u, v: K_[np.clip(np.round((u - u0) / st).astype(int), 0, nu - 1), np.clip(np.round((v - v0) / st).astype(int), 0, nv - 1)]


def pattern(a, x, z_new, nx, nz, cls, aa=0.008):
    """Массивы точек обшивки; цвет sRGB 0…1 (n,3)."""
    y = 9.715 - a; z = z_new - 0.95
    F_top = lambda u, v: union(sd(f_nose_plan, u, v, 1.0), sd(f_fan, u, v, 3.0)); F_bot = lambda u, v: union(sd(f_nose_plan, u, v, 5.0), sd(f_fan, u, v, 7.0))
    F_sR = lambda u, v: union(sd(f_nose_side, u, v, 11.0), sd(f_intake_side, u, v, 13.0)); F_sL = F_sR
    def cleaned(F_, u, v, look): d_, h_ = F_(u, v); return np.where(look(u, v), d_, np.minimum(d_, -1.0)), h_
    # только пламя, связанное с корнем у носа и воздухозаборников по самой поверхности
    body = ~np.isin(cls, (1, 2, 3))
    PL = (-7.0, 7.0, -10.0, 10.0); SD = (-10.0, 10.0, -3.5, 3.5)
    root_plan = lambda U_, V_: V_ > 3.6; root_side = lambda U_, V_: U_ > 3.0
    top = cleaned(F_top, x, y, keep_lookup(F_top, surface(x, y, body & (nz > -0.1), *PL), *PL, root_plan)); bot = cleaned(F_bot, x, y, keep_lookup(F_bot, surface(x, y, body & (nz < 0.1), *PL), *PL, root_plan))
    sideR = cleaned(F_sR, y, z, keep_lookup(F_sR, surface(y, z, body & (x > 0) & (nx > -0.1), *SD), *SD, root_side)); sideL = cleaned(F_sL, y, z, keep_lookup(F_sL, surface(y, z, body & (x < 0) & (nx < 0.1), *SD), *SD, root_side))
    side = (np.where(x > 0, sideR[0], sideL[0]), np.where(x > 0, sideR[1], sideL[1]))
    SN = smooth_field(np.stack([x, y, z], 1), np.stack([nx, nz, np.abs(nx) ** 4, np.abs(nz) ** 4], 1))
    plan = (np.where(SN[:, 1] >= 0, top[0], bot[0]), np.where(SN[:, 1] >= 0, top[1], bot[1])); az, ax = SN[:, 3], SN[:, 2]; sw = az + ax
    wz = sstep(0.62, 0.84, np.where(sw > 0.02, az / (sw + 1e-9), 0.5)); wz = np.maximum(wz, sstep(0.62, 0.80, np.abs(nz))); dist = wz * plan[0] + (1 - wz) * side[0]; heat = wz * plan[1] + (1 - wz) * side[1]
    dist = np.where(a < 1.45, 1.0, dist); heat = np.where(a < 1.45, heat * 0.5, heat)      # нос целиком в огне: чёрных пятен нет (Mark 2026-11-05)
    # кили с рулями: огненный край по передней кромке, верху и задней кромке, языки внутрь; те же параметры, кромки новой формы
    fin = np.isin(cls, (1, 2)) & (z_new > 0.45)
    az_ = 14.0 + (z_new - 0.56) * (2.30 / 3.14); te_ = 17.4 - (z_new - 0.56) * (0.25 / 3.14)
    ln = np.hypot(2.30, 3.14); d_le = (a - az_) * (3.14 / ln); d_top = 3.72 - z_new; d_te = te_ - a; t_le = (z_new - 0.56) * (3.14 / ln) + (a - 14.0) * (2.30 / ln)
    fe = np.minimum(np.minimum(d_le, d_top), np.where(z_new > 1.0, d_te, 9)); tf = np.where(fe == d_le, t_le, np.where(fe == d_top, 3.0 + (a - 16.3), 5.0 + (3.72 - z_new)))
    fF, _ = tongues(fe, tf, 0.05, 0.12, 0.42, 0.16, 23.0, curl=0.3, k=9.0, stable=False); fin_d = np.clip(fF * 0.9, -1, 1); fin_h = np.clip(fe / 0.5, 0, 1)
    # стабилизаторы: огненная передняя кромка
    stab = cls == 3; ax_ = np.abs(x); le_ = np.interp(ax_, [1.95, 2.62, 2.66, 3.95, 4.12, 4.20], [16.62, 17.30, 17.12, 18.44, 18.70, 18.95]); s_le = (a - le_) * 0.71
    sF, _ = tongues(s_le, ax_ * 1.41, 0.04, 0.1, 0.35, 0.15, 29.0, curl=0.3, k=9.0, stable=False)
    dist = np.where(fin, fin_d, dist); heat = np.where(fin, fin_h, heat); dist = np.where(stab, np.clip(sF * 0.9, -1, 1), dist); heat = np.where(stab, np.clip(s_le / 0.4, 0, 1), heat)
    under_in = (cls == 0) & (a > 7.7) & (a < 9.2) & (np.abs(x) < 0.85) & (np.abs(nx) > 0.5)     # клин у короба чёрный
    wall = (cls == 0) & (a > 6.0) & (a < 10.0) & (nx * nx + nz * nz < 0.35)                      # плоские стенки, смотрящие вперёд: рисунок на них читается оранжевым ящиком
    dist = np.where(under_in | wall, -1.0, dist)
    dist = np.where((cls == 8) | (cls == 9), -1.0, dist)   # пилоны, балки и рама фонаря чёрные
    STOPS = [(0.0, (255, 226, 110)), (0.08, (255, 196, 40)), (0.3, (255, 118, 14)), (0.62, (228, 52, 10)), (1.0, (140, 14, 8))]
    hs = np.array([s for s, _ in STOPS]); cs = lin([c for _, c in STOPS]); fill = np.stack([np.interp(heat, hs, cs[:, k]) for k in range(3)], 1); BLACK = lin([19, 19, 21])
    inside = sstep(-aa, aa, dist)[:, None]; rim = 0.7 * (sstep(-aa, 0.0, dist) * (1 - sstep(0.016, 0.032, dist)))[:, None] * (1 - sstep(0.2, 0.6, heat))[:, None]
    glow = (0.38 * np.exp(np.minimum(dist, 0) / 0.035) * (1 - sstep(-aa, aa, dist)))[:, None]
    col = BLACK * (1 - inside) + fill * inside; col = col + glow * lin([150, 28, 6]) * (1 - inside); col = col * (1 - rim) + lin([255, 214, 120]) * rim
    return srgb(col).astype(np.float32), inside[:, 0].astype(np.float32)
