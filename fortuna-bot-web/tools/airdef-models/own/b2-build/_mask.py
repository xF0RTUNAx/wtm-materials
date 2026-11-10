# _mask.py - силуэт самолёта на голубом небе: маска и контур для снятия углов плана. /usr/bin/python3 -I _mask.py <фото> <выход>
import site, sys
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image
im = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(float)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
sky = (b > r + 25) & (b > g + 5)
m = ~sky
# убрать мелкий шум: оставить самую крупную связную область
from collections import deque
H, W = m.shape; lab = np.zeros((H, W), int); best = (0, 0); k = 0
for y in range(0, H, 2):
    for x in range(0, W, 2):
        if m[y, x] and not lab[y, x]:
            k += 1; q = deque([(y, x)]); lab[y, x] = k; n = 0
            while q:
                cy, cx = q.popleft(); n += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    yy, xx = cy + dy, cx + dx
                    if 0 <= yy < H and 0 <= xx < W and m[yy, xx] and not lab[yy, xx]: lab[yy, xx] = k; q.append((yy, xx))
            if n > best[1]: best = (k, n)
mm = lab == best[0]
Image.fromarray((mm * 255).astype(np.uint8)).save(sys.argv[2])
ys, xs = np.nonzero(mm); print('bbox', xs.min(), ys.min(), xs.max(), ys.max(), 'пикс', mm.sum())
np.save(sys.argv[2] + '.npy', mm)
