# Сборка промо-ролика из кадров record.js: сцены (f01***, f02***, …) — растворами по 0,3 с, в начале и конце — затемнение,
# 1280×720, H.264 CRF 28 + постер (секунда — третьим аргументом).
#   python3 fortuna-bot-web/tools/airdef-promo/encode.py <папка кадров> fortuna-bot-web/media [секунда постера]
import glob, os, subprocess, sys

src, out = sys.argv[1], sys.argv[2]
poster_t = float(sys.argv[3]) if len(sys.argv) > 3 else 21.5  # секунда кадра для постера
D, FPS = 0.3, 30
scenes = []
for k in range(1, 100):
    n = len(glob.glob(os.path.join(src, f'f{k:02d}*.jpg')))
    if n: scenes.append((f'{k:02d}', n))
inputs = []
for s, _ in scenes: inputs += ['-framerate', str(FPS), '-pattern_type', 'glob', '-i', os.path.join(src, f'f{s}*.jpg')]
f = [f'[{i}:v]scale=1280:720:flags=lanczos,setsar=1,format=yuv420p,fps={FPS}[v{i}]' for i in range(len(scenes))]
cur, t = 'v0', scenes[0][1] / FPS
for i in range(1, len(scenes)):
    f.append(f'[{cur}][v{i}]xfade=transition=fade:duration={D}:offset={t - D:.3f}[x{i}]'); cur = f'x{i}'; t += scenes[i][1] / FPS - D
f.append(f'[{cur}]fade=t=in:st=0:d=0.4,fade=t=out:st={t - 0.6:.3f}:d=0.6[out]')
mp4 = os.path.join(out, 'airdef_promo.mp4')
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *inputs, '-filter_complex', ';'.join(f), '-map', '[out]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '28',
                '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4], check=True)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', str(poster_t), '-i', mp4, '-frames:v', '1', '-q:v', '3', os.path.join(out, 'airdef_promo.jpg')], check=True)
print(f'{mp4}: {t:.1f} с, {os.path.getsize(mp4) / 1e6:.1f} МБ')
