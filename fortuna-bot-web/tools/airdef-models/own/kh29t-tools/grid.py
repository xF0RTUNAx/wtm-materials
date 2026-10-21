import sys, site, os
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw
S = sys.argv[1]
def grid(name, box, zoom, step, out):
    im = Image.open(f"{S}/ref/{name}").convert("RGB").crop(box)
    im = im.resize((im.width*zoom, im.height*zoom), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    x0, y0 = box[0], box[1]
    for gx in range((x0//step+1)*step, box[2], step):
        X = (gx-x0)*zoom
        d.line([(X,0),(X,im.height)], fill=(255,0,0) if gx%100==0 else (255,170,170), width=1)
        d.text((X+2,2), str(gx), fill=(200,0,0))
    for gy in range((y0//step+1)*step, box[3], step):
        Y = (gy-y0)*zoom
        d.line([(0,Y),(im.width,Y)], fill=(0,0,255) if gy%100==0 else (170,170,255), width=1)
        d.text((2,Y+2), str(gy), fill=(0,0,200))
    im.save(f"{S}/out/{out}")
# изображение 4 (нос слева) тремя кусками
grid("4.png", (40,0,440,242), 3, 20, "g4_a.png")
grid("4.png", (400,0,800,242), 3, 20, "g4_b.png")
grid("4.png", (760,0,1193,242), 3, 20, "g4_c.png")
grid("1.png", (0,0,242,242), 4, 20, "g1.png")
grid("3.png", (0,0,242,242), 4, 20, "g3.png")
print("ok")
