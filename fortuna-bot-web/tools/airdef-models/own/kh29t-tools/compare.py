import sys, site
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw, ImageChops
import numpy as np
S = sys.argv[1]
def ref_mask(path):
    im = Image.open(path).convert('L')
    b = im.point(lambda v: 255 if v > 190 else 0)
    # заливка внешнего фона от всех краёв
    W, H = b.size
    for pt in [(0,0),(W-1,0),(0,H-1),(W-1,H-1),(W//2,0),(W//2,H-1)]:
        if b.getpixel(pt) == 255: ImageDraw.floodfill(b, pt, 128)
    a = np.array(b)
    return a != 128, np.array(im)
def mod_mask(path):
    a = np.array(Image.open(path).convert('RGBA'))[:, :, 3]
    return a > 128
def edge(m):
    e = np.zeros_like(m)
    e[1:-1,1:-1] = m[1:-1,1:-1] & ~(m[:-2,1:-1] & m[2:,1:-1] & m[1:-1,:-2] & m[1:-1,2:])
    return e
def run(refn, modn, outn, zoom=1, shift=(0,0)):
    rm, gray = ref_mask(f'{S}/ref/{refn}')
    mm = mod_mask(f'{S}/out/{modn}')
    dx, dy = shift
    if dx or dy: mm = np.roll(np.roll(mm, dy, 0), dx, 1)
    inter = (rm & mm).sum(); uni = (rm | mm).sum()
    print(f'{refn}: IoU={inter/uni:.3f}  ref-only={(rm&~mm).sum()} mod-only={(mm&~rm).sum()}  (ref {rm.sum()}, mod {mm.sum()})')
    rgb = np.stack([gray]*3, -1).astype(np.uint8)
    # силуэт модели: контур красным, силуэт чертежа: контур синим
    rgb[edge(mm)] = (255, 0, 0)
    rgb[edge(rm) & ~edge(mm)] = (0, 90, 255)
    im = Image.fromarray(rgb)
    if zoom > 1: im = im.resize((im.width*zoom, im.height*zoom), Image.NEAREST)
    im.save(f'{S}/out/{outn}')
run('4.png', 'm_side.png', 'cmp_side.png', 1)
run('1.png', 'm_rear.png', 'cmp_rear.png', 3)
run('3.png', 'm_front.png', 'cmp_front.png', 3)
