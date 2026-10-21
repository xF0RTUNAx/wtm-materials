"""Наложение силуэта модели на чертёж и IoU (уровень 1 проверок).

  /usr/bin/python3 -I compare.py <чертёж.png> <рендер_модели.png> <выход.png> [масштаб_вывода] [сдвиг dx,dy] [--report ОТЧЁТ.json --view <имя вида>]

Нужны Pillow и numpy (путь к пользовательским пакетам скрипт добавляет сам, поэтому работает и под -I).
Силуэт чертежа — всё, что недостижимо заливкой от краёв по светлым пикселям (линии внутри контура не мешают); силуэт модели — альфа рендера
(modelkit.silhouette_side / silhouette_end). На картинке: красный контур — модель, синий — чертёж. Ориентир: бок не ниже 0,95, вид сзади и спереди не ниже 0,85.
Для фотографий (с перспективой) IoU не годится — только для ортогональных чертежей; по фото сверяют пропорции на глаз.
С --report число записывается в checks.silhouette_iou.<имя вида> отчёта (ОТЧЁТ.json в папке модели; --passport — то же самое, для старых команд).
"""
import sys, site, json
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw
import numpy as np


def ref_mask(path):
    im = Image.open(path).convert('L')
    b = im.point(lambda v: 255 if v > 190 else 0)
    W, H = b.size
    for pt in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1), (W // 2, 0), (W // 2, H - 1)]:
        if b.getpixel(pt) == 255: ImageDraw.floodfill(b, pt, 128)
    return np.array(b) != 128, np.array(im)


def edge(m):
    e = np.zeros_like(m)
    e[1:-1, 1:-1] = m[1:-1, 1:-1] & ~(m[:-2, 1:-1] & m[2:, 1:-1] & m[1:-1, :-2] & m[1:-1, 2:])
    return e


def run(ref, mod, out, zoom=1, shift=(0, 0)):
    rm, gray = ref_mask(ref)
    mm = np.array(Image.open(mod).convert('RGBA'))[:, :, 3] > 128
    if mm.shape != rm.shape: print('ВНИМАНИЕ: размеры кадров разные', rm.shape, mm.shape); return None
    dx, dy = shift
    if dx or dy: mm = np.roll(np.roll(mm, dy, 0), dx, 1)
    inter = (rm & mm).sum(); uni = (rm | mm).sum(); iou = inter / uni
    print(f'{ref.split("/")[-1]}: IoU={iou:.3f}  только чертёж={(rm & ~mm).sum()}  только модель={(mm & ~rm).sum()}')
    rgb = np.stack([gray] * 3, -1).astype(np.uint8)
    rgb[edge(mm)] = (255, 0, 0)
    rgb[edge(rm) & ~edge(mm)] = (0, 90, 255)
    im = Image.fromarray(rgb)
    if zoom > 1: im = im.resize((im.width * zoom, im.height * zoom), Image.NEAREST)
    im.save(out)
    return iou


if __name__ == '__main__':
    a, opts, pos, i = sys.argv[1:], {}, [], 0
    while i < len(a):
        if a[i] in ('--report', '--passport', '--view') and i + 1 < len(a): opts['report' if a[i] != '--view' else 'view'] = a[i + 1]; i += 2
        else: pos.append(a[i]); i += 1
    if len(pos) < 3: print(__doc__); sys.exit(1)
    iou = run(pos[0], pos[1], pos[2], int(pos[3]) if len(pos) > 3 else 1, tuple(int(v) for v in pos[4].split(',')) if len(pos) > 4 else (0, 0))
    if iou is not None and 'report' in opts and 'view' in opts:
        P = json.load(open(opts['report'], encoding='utf-8'))
        P.setdefault('checks', {}).setdefault('silhouette_iou', {})[opts['view']] = round(float(iou), 3)
        with open(opts['report'], 'w', encoding='utf-8') as f: json.dump(P, f, ensure_ascii=False, indent=1)
        print(f'  записано в отчёт: checks.silhouette_iou.{opts["view"]} = {round(float(iou), 3)}')
