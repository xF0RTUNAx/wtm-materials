# Х-29Т — проверка и сдача (образец для сборщика): силуэты в кадрах чертежей, статистика, экспорт, превью, паспорт.
# Запускается ПОСЛЕ build.py в том же Blender. Надёжный способ — фоновый Blender (не трогает открытый у Mark, не падает вместе с ним):
#   K29_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
#       --python <папка>/build.py --python <папка>/deliver.py
# (в живом Blender через blender-mcp — по очереди exec(compile(open(p, encoding='utf-8').read(), p, 'exec')) для build.py и deliver.py.)
# Дальше — в терминале (системный Python с Pillow), результат сравнения сам запишется в паспорт:
#   K=/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit ; F="<папка модели>"
#   /usr/bin/python3 -I $K/compare.py "$F/4.png" "$F/проверка-чертежей/m_бок.png"   "$F/проверка-чертежей/наложение_бок.png"    --passport "$F/ПАСПОРТ.json" --view бок
#   /usr/bin/python3 -I $K/compare.py "$F/1.png" "$F/проверка-чертежей/m_сзади.png"  "$F/проверка-чертежей/наложение_сзади.png" 3 --passport "$F/ПАСПОРТ.json" --view сзади
#   /usr/bin/python3 -I $K/compare.py "$F/3.png" "$F/проверка-чертежей/m_спереди.png" "$F/проверка-чертежей/наложение_спереди.png" 3 --passport "$F/ПАСПОРТ.json" --view спереди
# Уровень 2 (игра) — ПОСЛЕ этого скрипта (нужен экспортированный glb):
#   deno run -A /Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/preview-candidate.js w_kh29t "$F/kh29t.glb" --out "$F/превью-игра"
import os, sys
sys.dont_write_bytecode = True
import modelkit as mk                                   # build.py уже подключил библиотеку и построил модель

OUT = os.environ.get('K29_OUT') or '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Х-29Т'
CHK = OUT + '/проверка-чертежей'
st = mk.stats()

# уровень 1: силуэты в кадрах чертежей (4.png — бок, нос слева, 1193 × 242; 1.png — сзади, 3.png — спереди, 242 × 242; ось на 3.png в (118, 123))
mk.silhouette_side(CHK + '/m_бок.png', (1193, 242), (596.5, 121.0))
mk.silhouette_end(CHK + '/m_сзади.png', (242, 242), axis_px=(121, 121), rear=True)
mk.silhouette_end(CHK + '/m_спереди.png', (242, 242), axis_px=(118, 123), rear=False)

# превью для Sketchfab и для Mark (общий, сбоку, хвост, голова)
prev = [os.path.basename(p) for p in mk.previews(OUT)]

# сдача: файлы модели и паспорт (числа — из сцены; IoU допишет compare.py)
mk.export(OUT + '/kh29t.glb', OUT + '/kh29t.blend')
mk.passport(OUT + '/ПАСПОРТ.json', key='w_kh29t', weapon='kh29t', name='Х-29Т', name_en='Kh-29T', glb='kh29t.glb', blend='kh29t.blend', rev=1,
    build=['build.py', 'deliver.py'], previews_=prev,
    checks={'silhouette_iou': {}, 'game': 'заполнить после preview-candidate.js: что видно в миниатюре, полёте и на подвеске'},
    sketchfab={'title': 'Kh-29T Air-to-Surface Missile — Low Poly',
               'lead': 'Kh-29T — Soviet/Russian air-to-surface missile with a seeker dome, four forward fins and four cruciform wings with control surfaces, modelled as a clean exterior shell.',
               'parts': ['seeker dome', 'body of revolution with panel seams', 'access hatches and sockets', 'four forward fins with pivot plates', 'four cruciform wings with elevons', 'suspension lugs', 'underside raceway', 'nozzle bowl'],
               'tags': ['kh-29', 'kh29', 'missile', 'air-to-surface', 'soviet', 'russian', 'military', 'weapon', 'aircraft', 'lowpoly', 'game-ready', 'blender'],
               'dimensions': 'length 3.9 m, body diameter 0.39 m, wing span 0.79 m'},
    notes='Цвет светлый серо-белый (как прежняя миниатюра и верхний образец на картинке 7); красная схема с картинок 6–7 — по слову Mark. Оперение крестом ×, проушины сверху, кожух снизу, нос в −Z осей glTF.')
print('сдача готова:', OUT)
