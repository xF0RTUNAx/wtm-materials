# Цвет под прозрачными пикселями карточек (трава, листья): заливка цветом ближайших непрозрачных (push-pull по пирамиде), альфа - как была.
# Без неё в уменьшенных копиях текстуры (мипмапы) тонкие стебли смешиваются с серым/белым фоном атласа и вдали выглядят бледными «призраками».
#   python3 alpha-fill.py in.png out.png [размер]   (нужны numpy и ffmpeg; numpy есть у Python из Blender)
import sys, subprocess, numpy as np
src, dst = sys.argv[1], sys.argv[2]; size = int(sys.argv[3]) if len(sys.argv) > 3 else 0
probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src], capture_output=True, text=True, check=True).stdout.strip().split(',')
W, H = int(probe[0]), int(probe[1])
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], capture_output=True, check=True).stdout
im = np.frombuffer(raw, np.uint8).reshape(H, W, 4).astype(np.float32) / 255.0
a = im[..., 3:4]; w = (a > 0.5).astype(np.float32); c = im[..., :3] * w
levels = [(c, w)]
while levels[-1][0].shape[0] > 1 and levels[-1][0].shape[1] > 1:
    cc, ww = levels[-1]; h2, w2 = cc.shape[0] // 2, cc.shape[1] // 2
    cc = cc[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2, 3).sum((1, 3)); ww = ww[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2, 1).sum((1, 3))
    levels.append((cc, ww))
fill = levels[-1][0] / np.maximum(levels[-1][1], 1e-6)
for cc, ww in reversed(levels[:-1]):
    up = np.repeat(np.repeat(fill, 2, 0), 2, 1)
    up = np.pad(up, ((0, cc.shape[0] - up.shape[0]), (0, cc.shape[1] - up.shape[1]), (0, 0)), mode='edge')
    own = cc / np.maximum(ww, 1e-6); fill = np.where(ww > 0, own, up)
out = np.concatenate([np.where(w > 0, im[..., :3], fill), a], -1)
vf = ['-vf', f'scale={size}:{size}:flags=lanczos'] if size and size != W else []
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{W}x{H}', '-i', '-', *vf, '-pix_fmt', 'rgba', dst], input=(np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8).tobytes(), check=True)
