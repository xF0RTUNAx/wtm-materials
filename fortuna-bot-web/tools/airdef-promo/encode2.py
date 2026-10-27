# Сборка промо-ролика выпуска 2 из кадров record2.js: сцены (<NN-сцена>/00000.jpg …, 60 к/с) — растворами по 0,4 с; с --card в конце — карточка
# card.png (3,5 с, раствор 0,8 с); в начале и конце — затемнение. Два файла:
#   airdef_promo_1080p60.mp4 — 1920×1080, 60 к/с, CRF 17 (YouTube, соцсети);
#   airdef_promo.mp4 + airdef_promo.jpg — 1280×720, 30 к/с, CRF 27 (сайт: экран входа, «Фарм», карточка аркады).
#   python3 fortuna-bot-web/tools/airdef-promo/encode2.py <папка кадров> <куда> [секунда постера]
import glob, os, subprocess, sys

src, out = sys.argv[1], sys.argv[2]
poster_t = float(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] != '--card' else 4.0
D, CD, FPS, CARD_T = 0.4, 0.8, 60, 3.5
os.makedirs(out, exist_ok=True)
scenes = sorted(d for d in os.listdir(src) if os.path.isdir(os.path.join(src, d)) and d[:2].isdigit() and glob.glob(os.path.join(src, d, '*.jpg')))
lens = [len(glob.glob(os.path.join(src, d, '*.jpg'))) / FPS for d in scenes]
card = os.path.join(src, 'card.png') if '--card' in sys.argv else '' # финальная карточка — только с --card (Mark 2026-10-27: «убери финальную карточку»)
inputs = []
for d in scenes: inputs += ['-framerate', str(FPS), '-pattern_type', 'glob', '-i', os.path.join(src, d, '*.jpg')]
if card and os.path.exists(card): inputs += ['-loop', '1', '-framerate', str(FPS), '-t', str(CARD_T), '-i', card]; lens.append(CARD_T)


def build(w, h, fps, crf, name):
    n = len(lens)
    f = [f'[{i}:v]scale={w}:{h}:flags=lanczos,setsar=1,format=yuv420p,fps={FPS}[v{i}]' for i in range(n)]
    cur, t = 'v0', lens[0]
    for i in range(1, n):
        d = CD if (card and os.path.exists(card) and i == n - 1) else D
        f.append(f'[{cur}][v{i}]xfade=transition=fade:duration={d}:offset={t - d:.3f}[x{i}]'); cur = f'x{i}'; t += lens[i] - d
    f.append(f'[{cur}]fade=t=in:st=0:d=0.5,fade=t=out:st={t - 0.7:.3f}:d=0.7,fps={fps}[out]')
    mp4 = os.path.join(out, name)
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *inputs, '-filter_complex', ';'.join(f), '-map', '[out]', '-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf),
                    '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4], check=True)
    print(f'{mp4}: {t:.1f} с, {os.path.getsize(mp4) / 1e6:.1f} МБ')
    return mp4


build(1920, 1080, 60, 17, 'airdef_promo_1080p60.mp4')
site = build(1280, 720, 30, 27, 'airdef_promo.mp4')  # сайт: ролик сам запускается на экране входа — лёгкий (старый 46 с — 8 МБ при CRF 28)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', str(poster_t), '-i', site, '-frames:v', '1', '-q:v', '3', os.path.join(out, 'airdef_promo.jpg')], check=True)
