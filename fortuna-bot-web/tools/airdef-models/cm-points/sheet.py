import json, sys
from PIL import Image, ImageDraw
meta = json.load(open('img/meta.json'))
keys = sys.argv[2:]; out = sys.argv[1]
cells = []
for k in keys:
    m = meta[k]
    row = Image.new('RGB', (560 + 560 + 280, 280), (235, 235, 235))
    for i, (v, bx, w) in enumerate([('p', m['prof'], 560), ('t', m['top'], 560), ('r', m['rear'], 280)]):
        im = Image.open(f'img/{k}_{v}.ppm').convert('RGB'); d = ImageDraw.Draw(im)
        u0, u1, v0, v1 = bx; H = 280
        s = min((w - 20) / (u1 - u0), (H - 20) / (v1 - v0)); cx = w / 2 - (u0 + u1) / 2 * s; cy = H / 2 + (v0 + v1) / 2 * s
        # сетка по 1 м
        import math
        for u in range(math.ceil(u0), math.floor(u1) + 1):
            X = cx + u * s; d.line([(X, 0), (X, H)], fill=(120, 160, 230) if u % 5 else (60, 90, 200), width=1)
            if u % 2 == 0 and v != 'r': d.text((X + 2, 2), f'{-u if v=="p" else ""}' if v == 'p' else f'{u}', fill=(0, 0, 160))
        for vv in range(math.ceil(v0), math.floor(v1) + 1):
            Y = cy - vv * s; d.line([(0, Y), (w, Y)], fill=(120, 160, 230) if vv % 5 else (60, 90, 200), width=1)
            if vv % 2 == 0: d.text((2, Y + 1), (f'{vv}' if v != 't' else f'z{-vv}'), fill=(0, 0, 160))
        row.paste(im, (0 if v == 'p' else 560 if v == 't' else 1120, 0))
    ImageDraw.Draw(row).text((4, 266), k, fill=(160, 0, 0))
    row = row.resize((1050, 210)); cells.append(row)
sh = Image.new('RGB', (1050, 210 * len(cells)))
for i, c in enumerate(cells): sh.paste(c, (0, 210 * i))
sh.save(out)
