# Вторая партия звуков «Воздушного превосходства» (2026-10-21): нарезка, выравнивание, петли — как mkloops.py.
#   v/bin/python -I tools/airdef-sounds/mk2.py games/airdef/sounds/ tools/airdef-sounds/pending/
# В игру (лицензия подтверждена): heli_far (Benboncan «Military Helicopter», CC BY 4.0, 0:20–0:39), rocket_far (qubodup «Far Away
# Rocket Launch», CC0, с 0:07), intercept (Invadium «cruise missiles interception and fly by», CC0, 0:00,2–0:04).
# Из роликов YouTube (Mark, 4K Video Downloader; разрешил использовать — решение Mark 2026-10-21): boom_air, tu95_loop, patriot_launch,
# isk_launch, isk_boom (запуск: второй аргумент = games/airdef/sounds/).
import numpy as np, subprocess, sys, wave
from scipy.signal import butter, sosfiltfilt
OUT, PEND = sys.argv[1], sys.argv[2]
DL = '/Users/mark./Downloads/Воздушное превосходство/Звуки/'; MV = '/Users/mark./Movies/4K Video Downloader+/'
def load(fn, sr):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', fn, '-ac', '2', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.float32).reshape(-1, 2).mean(1).astype(np.float64)
def wav(path, y, sr):
    y = np.clip(y, -1, 1); w = wave.open(path, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((y * 32767).astype('<i2').tobytes()); w.close()
    print(path.split('/')[-1], f'{len(y)/sr:.2f} s rms {20*np.log10(np.sqrt((y**2).mean())):.1f} dB peak {20*np.log10(np.abs(y).max()):.1f} dB')
def mp3(path, y, sr, br='96k'):
    t = path + '.tmp.wav'; wav(t, y, sr); subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', t, '-b:a', br, path], check=True); subprocess.run(['rm', t])
def flat(s, sr, win):
    e = np.sqrt(sosfiltfilt(butter(2, 1 / win, 'low', fs=sr, output='sos'), s * s).clip(1e-12)); return s / e * e.mean()
def hp(y, sr, f): return sosfiltfilt(butter(2, f, 'high', fs=sr, output='sos'), y)
def lp(y, sr, f): return sosfiltfilt(butter(2, f, 'low', fs=sr, output='sos'), y)
def soft(y, c=0.89): return np.tanh(y / c) * c
def rms(y, db): return y * (10 ** (db / 20) / np.sqrt((y ** 2).mean()))
def fade(y, sr, a, b):
    y = y.copy(); na, nb = int(a * sr), int(b * sr)
    if na: y[:na] *= np.linspace(0, 1, na) ** 2
    if nb: y[-nb:] *= np.linspace(1, 0, nb) ** 2
    return y
def loop(s, sr, L, X, period=0):
    best, bi = -2, int(L * sr)
    if period:  # стык — где ритм (лопасти, винты) совпадает с началом
        env = sosfiltfilt(butter(2, 40, 'low', fs=sr, output='sos'), np.abs(sosfiltfilt(butter(2, [60, 3000], 'band', fs=sr, output='sos'), s)))
        w = int(min(0.6, 4 * period) * sr); a = env[:w]
        for n in range(int((L - 0.35) * sr), int((L + 0.35) * sr), max(1, sr // 2000)):
            b = env[n:n + w]
            if len(b) < w: break
            c = np.corrcoef(a, b)[0, 1]
            if c > best: best, bi = c, n
    n, x = bi, int(X * sr); out = s[:n].copy(); t = np.linspace(0, np.pi / 2, x)
    out[:x] = s[:x] * np.sin(t) + s[n:n + x] * np.cos(t); print(f'  петля {n/sr:.2f} с, стык {best:.2f}'); return out
# ── в игру ──
sr = 16000
h = hp(load(DL + '74242__benboncan__military-helicopter.wav', sr), sr, 30)
wav(OUT + 'heli_far.wav', soft(rms(loop(flat(h[int(22 * sr):int(34 * sr)], sr, 1.5), sr, 10.0, 0.6, 1 / 10.8), -20)), sr)  # вертолёт вдали
r = hp(load(DL + '211617__qubodup__far-away-rocket-launch.flac', sr), sr, 25)
wav(OUT + 'rocket_far.wav', soft(rms(loop(flat(r[int(7 * sr):int(17 * sr)], sr, 1.2), sr, 8.5, 0.8), -20)), sr)  # гул ракеты в небе
sr = 32000
c = hp(load(DL + '824805__invadium__cruise-missiles-interception-and-fly-by.wav', sr), sr, 30)
s = fade(c[int(0.2 * sr):int(4.0 * sr)], sr, 0.004, 1.6); mp3(OUT + 'intercept.mp3', s / np.abs(s).max() * 0.7, sr)  # подрыв ЗУР / перехват вдали
# ── pending (лицензия не подтверждена) ──
b = hp(load(MV + 'Bomb distant explosion - Sound Effect.m4a', sr), sr, 25)
s = fade(b[:int(5.25 * sr)], sr, 0.004, 1.2); mp3(PEND + 'boom_air.mp3', s / np.abs(s).max() * 0.7, sr)
p = hp(load(MV + 'Propeller engine loop - Sound Effect.m4a', 22050), 22050, 30)
wav(PEND + 'tu95_loop.wav', soft(rms(loop(flat(p[int(0.5 * 22050):int(10.5 * 22050)], 22050, 1.0), 22050, 8.0, 0.5, 1 / 21.7), -20)), 22050)
pt = hp(load(MV + 'Patriot Missile Launch Sound Effect Will Blow Your Mind.m4a', sr), sr, 30)
s = fade(pt[int(18.9 * sr):int(26.5 * sr)], sr, 0.01, 2.0); mp3(PEND + 'patriot_launch.mp3', s / np.abs(s).max() * 0.75, sr)
ik = hp(load(MV + 'Russian 9K720 ISKANDER-M Tactical Missile Load Launch Impact.m4a', sr), sr, 25)
s = fade(ik[int(44.6 * sr):int(53.2 * sr)], sr, 0.01, 2.0); mp3(PEND + 'isk_launch.mp3', s / np.abs(s).max() * 0.75, sr)
s = fade(ik[int(95.6 * sr):int(100.6 * sr)], sr, 0.004, 1.5); mp3(PEND + 'isk_boom.mp3', s / np.abs(s).max() * 0.75, sr)
print('ok')
