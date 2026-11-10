# _sheet.py <приставка> [виды через запятую] [выход] - лист кадров 2 столбца
import sys
from PIL import Image
tag = sys.argv[1]; keys = (sys.argv[2] if len(sys.argv) > 2 else 'fl34,rl34,side,front,top,cab').split(','); out = sys.argv[3] if len(sys.argv) > 3 else f'_sheet_{tag}.jpg'
ims = [Image.open(f'{tag}_{k}.png').convert('RGB') for k in keys]
w, h = ims[0].size; s = 0.5; W, H = int(w * s), int(h * s); rows = (len(ims) + 1) // 2
sheet = Image.new('RGB', (W * 2, H * rows), 'white')
for i, im in enumerate(ims): sheet.paste(im.resize((W, H)), ((i % 2) * W, (i // 2) * H))
sheet.save(out, quality=88)
