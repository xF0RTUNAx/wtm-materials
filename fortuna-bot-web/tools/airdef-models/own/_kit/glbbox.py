"""Габариты и число треугольников файла glb (позиции — min/max из описания, без чтения буферов).

  /usr/bin/python3 -I glbbox.py <файл.glb> …

Для прежней модели в игре (нос в −Z, длина по z): games/airdef/models/<ключ>.glb — отсюда берут длину новой модели.
"""
import sys, json, struct

if len(sys.argv) < 2: print(__doc__); sys.exit(1)
for p in sys.argv[1:]:
    b = open(p, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + n])
    mn = [1e9] * 3; mx = [-1e9] * 3
    for m in j['meshes']:
        for pr in m['primitives']:
            a = j['accessors'][pr['attributes']['POSITION']]
            for i in range(3): mn[i] = min(mn[i], a['min'][i]); mx[i] = max(mx[i], a['max'][i])
    tris = sum(j['accessors'][pr['indices']]['count'] // 3 for m in j['meshes'] for pr in m['primitives'])
    print(p.split('/')[-1], 'min', [round(v, 3) for v in mn], 'max', [round(v, 3) for v in mx], 'размер', [round(mx[i] - mn[i], 3) for i in range(3)], 'тр.', tris,
          'материалы', [m.get('name') for m in j.get('materials', [])])
