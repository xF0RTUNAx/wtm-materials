# _lite.py - облегчённые файлы для Sketchfab: та же сетка, карты уменьшены (2048 и 1024), цвет и блеск в JPEG, нормали в PNG. /usr/bin/python3 -I _lite.py
import site, sys, os, json, struct, io
sys.path.append(site.getusersitepackages())
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
H = os.path.dirname(os.path.abspath(__file__)); SRC = H + '/f100_sketchfab.glb'
d = open(SRC, 'rb').read(); n = struct.unpack_from('<I', d, 12)[0]; J = json.loads(d[20:20 + n]); o = 20 + n; bl = struct.unpack_from('<I', d, o)[0]; BIN = d[o + 8:o + 8 + bl]
nrm = {m['normalTexture']['index'] for m in J['materials'] if 'normalTexture' in m}; nimg = {J['textures'][t]['source'] for t in nrm}
for size, name in ((2048, 'medium'), (1024, 'low')):
    j = json.loads(json.dumps(J)); out = bytearray(); views = []
    imgv = {im['bufferView']: i for i, im in enumerate(j['images'])}
    for vi, bv in enumerate(j['bufferViews']):
        chunk = BIN[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        if vi in imgv:
            i = imgv[vi]; im = Image.open(io.BytesIO(chunk)); im = im.resize((size, size), Image.LANCZOS); b = io.BytesIO()
            if i in nimg: im.convert('RGB').save(b, 'PNG', optimize=True); j['images'][i]['mimeType'] = 'image/png'
            else: im.convert('RGB').save(b, 'JPEG', quality=90); j['images'][i]['mimeType'] = 'image/jpeg'
            chunk = b.getvalue()
        while len(out) % 4: out.append(0)
        bv['byteOffset'] = len(out); bv['byteLength'] = len(chunk); out += chunk
    while len(out) % 4: out.append(0)
    j['buffers'][0]['byteLength'] = len(out); js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    f = H + f'/f100_sketchfab_{name}.glb'
    with open(f, 'wb') as w:
        w.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out))); w.write(struct.pack('<II', len(js), 0x4E4F534A)); w.write(js); w.write(struct.pack('<II', len(out), 0x004E4942)); w.write(out)
    print(name, size, os.path.getsize(f) // 1024, 'КБ')
