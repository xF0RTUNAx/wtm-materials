# Нарезка и петли для «Воздушного превосходства»: моно, выравнивание огибающей (пролёт → ровный гул), бесшовная петля
# (длина кратна периоду хлопков/выстрелов, конец перетекает в начало), нормировка громкости
import numpy as np, subprocess, sys, wave
from scipy.signal import butter, sosfiltfilt
DL = '/Users/mark./Downloads/Воздушное превосходство/Звуки/'; OUT = sys.argv[1]
def load(fn, sr):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', DL + fn, '-ac', '2', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True, check=True)
    x = np.frombuffer(r.stdout, np.float32).reshape(-1, 2); return x.mean(1).astype(np.float64)
def wav(name, y, sr):
    y = np.clip(y, -1, 1); w = wave.open(OUT + name, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes((y * 32767).astype('<i2').tobytes()); w.close(); print(name, f'{len(y)/sr:.2f} s', f'rms {20*np.log10(np.sqrt((y**2).mean())):.1f} dB', f'peak {20*np.log10(np.abs(y).max()):.1f} dB')
def flatten(s, sr, win):  # убрать медленное нарастание/спад (приближение пролёта), оставить хлопки
    e = np.sqrt(sosfiltfilt(butter(2, 1 / win, 'low', fs=sr, output='sos'), s * s, padtype='even', padlen=min(len(s) - 1, int(2 * win * sr))).clip((s * s).mean() * 0.01)); return s / e * e.mean()  # края — зеркалом, снизу — 0,1 RMS (см. mk2lib.py)
def soft(y, ceil=0.89): return np.tanh(y / ceil) * ceil
def loop(s, sr, L, X, period):
    # длина петли: около L, кратна периоду; из окрестности — где конец лучше всего похож на начало
    n0 = int(L * sr); best, bi = -2, n0
    if period:  # огибающая хлопков/выстрелов (полоса 300–3000 Гц, сглажено до 40 Гц): стык — где ритм совпадает с началом
        env = np.abs(sosfiltfilt(butter(2, [300, 3000], 'band', fs=sr, output='sos'), s))
        env = sosfiltfilt(butter(2, 40, 'low', fs=sr, output='sos'), env); w = int(min(0.6, 4 * period) * sr); a = env[:w]
        for n in range(int((L - 0.35) * sr), int((L + 0.35) * sr), max(1, sr // 2000)):
            b = env[n:n + w]
            if len(b) < w: break
            c = np.corrcoef(a, b)[0, 1]
            if c > best: best, bi = c, n
    n, x = bi, int(X * sr); out = s[:n].copy(); t = np.linspace(0, np.pi / 2, x)
    out[:x] = s[:x] * np.sin(t) + s[n:n + x] * np.cos(t)  # равномощная перекрёстная склейка
    print(f'  петля {n/sr:.3f} с, сходство стыка {best:.2f}'); return out
def norm_rms(y, db): return y * (10 ** (db / 20) / np.sqrt((y ** 2).mean()))
def fade(y, sr, a, b):
    y = y.copy(); na, nb = int(a * sr), int(b * sr)
    if na: y[:na] *= np.linspace(0, 1, na) ** 2
    if nb: y[-nb:] *= np.linspace(1, 0, nb) ** 2
    return y
def hp(y, sr, f, o=2): return sosfiltfilt(butter(o, f, 'high', fs=sr, output='sos'), y)
def lp(y, sr, f, o=2): return sosfiltfilt(butter(o, f, 'low', fs=sr, output='sos'), y)
SR = 32000
# ── UH-1 (Rmutt, CC0): малые обороты/лёгкая нагрузка — 0:54,3…; большие — 1:03…1:07 (хлопки лопастей 10,9 Гц)
u = hp(load('156906__rmutt__uh-1-helicopter.wav', SR), SR, 28)
for nm, a, L in [('heli_lo.wav', 54.3, 3.0), ('heli_hi.wav', 63.0, 3.6)]:
    s = flatten(u[int(a * SR):int((a + L + 1) * SR)], SR, 0.6)
    wav(nm, soft(norm_rms(loop(s, SR, L, 0.3, 1 / 10.9), -19)), SR)
# ── Пролёт реактивного (qubodup, CC0): спереди — свист компрессора (подлёт), сзади — рёв струи (уход); пролёт — разовый
j = hp(load('189446__qubodup__jet-plane-flyby.flac', SR), SR, 30)
s = flatten(j[int(2.6 * SR):int(5.0 * SR)], SR, 0.5); wav('jet_front.wav', soft(norm_rms(loop(s, SR, 1.9, 0.35, 0), -20)), SR)
s = flatten(j[int(8.2 * SR):int(13.0 * SR)], SR, 0.8); wav('jet_rear.wav', soft(norm_rms(loop(s, SR, 4.2, 0.45, 0), -20)), SR)
s = j[int(0.4 * SR):int(12.5 * SR)]; s = fade(s, SR, 0.8, 3.0); wav('jet_pass.wav', soft(s / np.abs(s).max() * 0.6), SR)
# ── Phalanx Mk 15 (qubodup, CC0): очередь 4500 выстр./мин (75 Гц) — петля; эхо после очереди — разовый «хвост».
# Запись перегружена (срезанные пики): верх смягчён фильтром, громкость ниже — не «режет» уши
c = hp(load('163119__qubodup__navy-mk-15-phalanx-ciws-anti-air-fast-burst.flac', SR), SR, 40)
c = lp(c, SR, 7000, 4)
s = c[int(0.3 * SR):int(1.5 * SR)]; wav('ciws_loop.wav', soft(norm_rms(loop(flatten(s, SR, 0.3), SR, 1.0, 0.06, 1 / 75), -18), 0.8), SR)
s = c[int(1.62 * SR):int(5.9 * SR)]; s = fade(s, SR, 0.03, 1.2); wav('ciws_tail.wav', s / np.abs(c[int(0.3*SR):int(1.3*SR)]).max() * 0.6, SR)
# вороны («Flock of Crows», Fenodyrie, CC0) — с 0:24, кусками в бою (sound.js mapAmb), петля не нужна:
#   ffmpeg -ss 24.0 -to 47.2 -i 565911__fenodyrie__flock-of-crows.wav -ac 1 -ar 32000 \
#     -af "highpass=f=120,afade=t=in:d=0.3,afade=t=out:st=22.5:d=0.7,loudnorm=I=-24:TP=-3" -b:a 72k crows.mp3
# одиночные (jet_pass, ciws_tail) после — в mp3: ffmpeg -i X.wav -b:a 96k X.mp3 (зазор mp3 им не мешает, петлям — мешал бы)
# запуск: python3 -m venv v && v/bin/pip install numpy scipy && v/bin/python -I mkloops.py games/airdef/sounds/
