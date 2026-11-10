# _trial_sheet.py — листы пробной окраски: /usr/bin/python3 _trial_sheet.py → _показ/9_проба_<вариант>.jpg (6 кадров с подписями)
import os, glob
from PIL import Image, ImageDraw, ImageFont
H = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(H, 'пробный_окраска'); F = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 24)
SH = ['общий', 'борт', 'перед', 'кабина', 'боевое', 'корма']; W, HH = 960, 600
for var in sorted({os.path.basename(p).split('_')[0] for p in glob.glob(os.path.join(D, '*.png'))}):
    fs = [(s, os.path.join(D, f'{var}_{s}.png')) for s in SH if os.path.exists(os.path.join(D, f'{var}_{s}.png'))]
    if not fs: continue
    r = (len(fs) + 1) // 2; im = Image.new('RGB', (2 * W, r * (HH + 36)), 'white'); d = ImageDraw.Draw(im)
    for i, (s, p) in enumerate(fs):
        x, y = (i % 2) * W, (i // 2) * (HH + 36); t = Image.open(p).convert('RGB').resize((W, HH)); im.paste(t, (x, y + 36)); d.text((x + 10, y + 6), f'{var}: {s}', fill='black', font=F)
    out = os.path.join(H, '_показ', f'9_проба_{var}.jpg'); im.save(out, quality=88); print(out)
