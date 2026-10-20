# Третья партия (2026-10-21, ролики YouTube — Mark, «4K Video Downloader+»): двигатель F-16 (малый газ), форсаж, тоны ГСН AIM-9, отстрел ЛТЦ.
# Источники (история 4K Video Downloader): форсаж — bi2AB18biz4, канал «SOUND Effects Public Domain (No Copyrights)»; ГСН AIM-9 —
# zJvVsHkSs_g, канал Booyadee (YouTube — решение Mark 2026-10-21). Двигатель F-16 (kAVnPGU8CYw) и ЛТЦ (8VIxcncNPVA) — канал Sound Effect
# Database — куплены Single License $1,99 × 2 (Mark, 2026-10-21, квитанции Stripe у Mark): eng_idle.wav и flare.mp3.
#   v/bin/python -I tools/airdef-sounds/mk3.py games/airdef/sounds/
import sys, numpy as np, subprocess
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from mk2lib import load, wav, mp3, flat, hp, lp, soft, rms, fade, loop
OUT = sys.argv[1]; MV = '/Users/mark./Movies/4K Video Downloader+/'
sr = 32000
e = hp(load(MV + 'F16 Fighter Jet Engine Idle And Shut Down Sound Effect.m4a', sr), sr, 25)
wav(OUT + 'eng_idle.wav', soft(rms(loop(flat(e[int(5 * sr):int(12.6 * sr)], sr, 1.5), sr, 7.0, 0.5), -20)), sr)   # малый газ: вой турбины и гул
a = hp(load(MV + 'Afterburner Sound SOUND Effect.m4a', sr), sr, 25)
wav(OUT + 'eng_ab.wav', soft(rms(loop(flat(a[int(7.5 * sr):int(10.6 * sr)], sr, 1.0), sr, 2.6, 0.4), -18)), sr)      # форсаж: рёв (0:07,5–0:10)
s = fade(a[int(6.4 * sr):int(8.0 * sr)], sr, 0.05, 0.6); mp3(OUT + 'ab_on.mp3', s / np.abs(s).max() * 0.8, sr)      # включение форсажа
g = hp(load(MV + 'AIM-9 Sidewinder missile sound effect.m4a', sr), sr, 200)
for nm, t0, t1, L in [('seek_search.wav', 0.4, 2.8, 2.1), ('seek_tone.wav', 7.4, 11.6, 3.5), ('seek_lock.wav', 12.6, 15.8, 2.5)]:
    wav(OUT + nm, soft(rms(loop(g[int(t0 * sr):int(t1 * sr)], sr, L, 0.12), -20)), sr)                               # тоны ГСН: поиск, цель видна, захват
f = hp(load(MV + 'Flares Sound Effect.m4a', sr), sr, 40)
s = fade(f[int(0.02 * sr):int(1.5 * sr)], sr, 0.002, 0.5); mp3(OUT + 'flare.mp3', s / np.abs(s).max() * 0.75, sr)   # отстрел ЛТЦ / диполей
print('ok')
