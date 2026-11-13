# -*- coding: utf-8 -*-
# _patch_wear2.py - варианты износа по замечанию Mark 2026-11-13: «хвосты на конце имеют неестественный шум-потёртость, зелёная потёртость выглядит неприятно».
# SU17_PRIM = green (как было) | chips (мелкие сколы до металла и подкраски заплатками, без зелёного) | none;  SU17_TAIL = old | soft (копоть только у сопла, мягким градиентом). /usr/bin/python3 _patch_wear2.py
import io
p = 'paint.py'; s = io.open(p, encoding='utf-8').read(); L = s.split('\n')
if 'SU17_PRIM' in s: raise SystemExit('уже есть')
def idx(prefix): return next(i for i, t in enumerate(L) if t.startswith(prefix))
i = idx("pn_ = fbm(2.6, 2.6, 2.6, 4, 107.0)")
L[i:i + 2] = u'''PRIM = os.environ.get('SU17_PRIM', 'chips'); TAIL = os.environ.get('SU17_TAIL', 'soft')
if PRIM == 'green':
    pn_ = fbm(2.6, 2.6, 2.6, 4, 107.0); prim = smooth(0.690, 0.715, pn_) * pnt * (1 - smooth(-0.2, -0.6, nz) * 0.5); core = smooth(0.745, 0.760, pn_) * pnt  # пятна грунта и металл в их середине
    col = mix(col, (0.60, 0.63, 0.36), prim * 0.62 * KW); rough += prim * 0.10 * KW; col = mix(col, (0.52, 0.53, 0.55), core * 0.85 * KW); metal = np.maximum(metal, core * 0.85 * KW); rough = rough * (1 - core * 0.5) + core * 0.5 * 0.38
elif PRIM == 'chips':
    # мелкие сколы до металла: гуще у кромок и люков, редкие на листах; без зелёного грунта
    cn_ = fbm(11.0, 11.0, 11.0, 3, 107.0); near = np.maximum(smooth(0.985, 0.93, bev), smooth(0.05, 0.0, seamd)) * pnt; chp = smooth(0.70 - 0.10 * near, 0.72 - 0.10 * near, cn_) * pnt * (0.25 + 0.75 * near)
    col = mix(col, (0.50, 0.51, 0.53), chp * 0.80 * KW); metal = np.maximum(metal, chp * 0.80 * KW); rough = rough * (1 - chp * 0.5) + chp * 0.5 * 0.36
    # подкраски: прямоугольные заплатки краской чуть другого тона и блеска (свежая краска поверх старой)
    RS2 = np.random.RandomState(77)
    for vm, A_, Q_, n_, qa, qb in ((nz > 0.45, a, x, 14, -4.8, 4.8), (np.abs(nx) > 0.45, a, z, 10, -0.4, 1.2)):
        ids = np.nonzero((vm & pnt).ravel())[0]; AA, QQ = A_.ravel()[ids], Q_.ravel()[ids]
        for k in range(n_):
            a0 = RS2.uniform(1.5, 16.5); w = RS2.uniform(0.18, 0.60); q0 = RS2.uniform(qa, qb); h_ = RS2.uniform(0.12, 0.40); e_ = 0.035
            d = np.minimum.reduce([AA - a0, a0 + w - AA, QQ - q0, q0 + h_ - QQ]); sel = d > -e_
            if not sel.any(): continue
            t_ = np.clip((d[sel] + e_) / (2 * e_), 0, 1) * 0.85; cc = ids[sel]; kk = RS2.uniform(1.05, 1.11) if RS2.rand() < 0.6 else RS2.uniform(0.90, 0.95)
            for ch_ in range(3): col[..., ch_].ravel()[cc] = col[..., ch_].ravel()[cc] * (1 - t_) + BASE[..., ch_].ravel()[cc] * kk * t_
            rough.ravel()[cc] += t_ * RS2.uniform(-0.10, -0.03)'''.split('\n')
i = idx("tsoot = smooth(14.2, 16.2, a)")
L[i] = u'''if TAIL == 'old': tsoot = smooth(14.2, 16.2, a) * np.isin(cls, (0, 3)) * skin_m * (0.4 + 0.6 * smooth(0.30, 0.70, fbm(0.5, 7.0, 7.0, 4, 121.0)))
else: tsoot = smooth(15.0, 16.25, a) * (cls == 0) * skin_m * (0.75 + 0.25 * fbm(0.4, 3.0, 3.0, 3, 121.0)) + smooth(15.6, 16.6, a) * smooth(1.25, 0.70, ax) * (cls == 3) * skin_m * 0.6      # копоть только у сопла и у корня стабилизатора, мягким переходом
col = mix(col, (0.075, 0.07, 0.065), tsoot * 0.40 * KW); rough += tsoot * 0.16 * KW'''
i = idx("soot = (smooth(14.9, 16.25, a) * np.isin(cls, (0, 3))")
L[i] = L[i].replace("smooth(14.9, 16.25, a) * np.isin(cls, (0, 3))", "smooth(14.9, 16.25, a) * ((cls == 0) | ((cls == 3) & (ax < 1.1) & (os.environ.get('SU17_TAIL', 'soft') == 'old') ) | ((cls == 3) & (os.environ.get('SU17_TAIL', 'soft') == 'old')))")
t = '\n'.join(L)
# на оперении шум потёков и выцветания слабее: тонкие плоскости выглядели «зашумлёнными»
t = t.replace("col = mix(col, (0.15, 0.14, 0.12), rain * 0.26 * KW); rough += rain * 0.12 * KW", "TAILK = np.where(np.isin(cls, (1, 2, 3)) & (os.environ.get('SU17_TAIL', 'soft') != 'old'), 0.35, 1.0)\ncol = mix(col, (0.15, 0.14, 0.12), rain * 0.26 * KW * TAILK); rough += rain * 0.12 * KW * TAILK", 1)
t = t.replace("dirty = flow * rearw * 0.62 * (1 - 0.75 * smooth(-0.05, -0.5, nz))", "dirty = flow * rearw * 0.62 * (1 - 0.75 * smooth(-0.05, -0.5, nz)) * np.where(np.isin(cls, (1, 2, 3)) & (os.environ.get('SU17_TAIL', 'soft') != 'old'), 0.35, 1.0)", 1)
io.open(p, 'w', encoding='utf-8').write(t); print('ок')
