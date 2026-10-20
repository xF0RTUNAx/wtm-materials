# Общие функции нарезки звуков (mk2.py, mk3.py)
import numpy as np, subprocess, wave
from scipy.signal import butter, sosfiltfilt
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
