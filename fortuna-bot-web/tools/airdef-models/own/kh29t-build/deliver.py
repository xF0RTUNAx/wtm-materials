# Х-29Т — проверка и сдача (образец для сборщика): силуэты в кадрах чертежей, статистика, превью, экспорт, паспорт.
# Запускается ПОСЛЕ build.py в том же Blender. Надёжный способ — фоновый Blender (не трогает открытый у Mark, не падает вместе с ним).
# ОБЯЗАТЕЛЬНО задать K29_OUT — папку модели (иначе скрипт остановится: чтобы не перезаписать чужую готовую модель):
#   K29_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
#       --python <папка>/build.py --python <папка>/deliver.py
# (в живом Blender через blender-mcp: os.environ['K29_OUT'] = '<папка модели>', затем по очереди exec(compile(open(p, encoding='utf-8').read(), p, 'exec')) для build.py и deliver.py.)
# Паспорт пишется двумя файлами: ПАСПОРТ.json (минимум для основного чата: ключ, название, ревизия, имена файлов) и ОТЧЁТ.json (всё остальное — только для сборщика и Mark).
# Для другой модели скопировать этот файл и поменять: имя переменной окружения (по желанию), номера картинок и кадры чертежей, ключ, оружие, названия, блок sketchfab.
# Дальше — в терминале (системный Python с Pillow), результат сравнения сам запишется в паспорт (номера картинок ниже — у Х-29Т: 4 — бок, 1 — сзади, 3 — спереди):
#   K=/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit ; F="<папка модели>"
#   /usr/bin/python3 -I $K/compare.py "$F/4.png" "$F/проверка-чертежей/m_бок.png"   "$F/проверка-чертежей/наложение_бок.png"    --report "$F/ОТЧЁТ.json" --view бок
#   /usr/bin/python3 -I $K/compare.py "$F/1.png" "$F/проверка-чертежей/m_сзади.png"  "$F/проверка-чертежей/наложение_сзади.png" 3 --report "$F/ОТЧЁТ.json" --view сзади
#   /usr/bin/python3 -I $K/compare.py "$F/3.png" "$F/проверка-чертежей/m_спереди.png" "$F/проверка-чертежей/наложение_спереди.png" 3 --report "$F/ОТЧЁТ.json" --view спереди
# Уровень 2 (игра) — ПОСЛЕ этого скрипта (нужен экспортированный glb); итог словами — в паспорт:
#   deno run -A /Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/preview-candidate.js w_kh29t "$F/kh29t.glb" --out "$F/превью-игра"
#   /usr/bin/python3 -I $K/passport_set.py "$F/ОТЧЁТ.json" checks.game "<что видно в миниатюре, полёте и на подвеске>"
# Повторный запуск файлы не затирает: rev, checks.game, sketchfab и notes остаются, IoU сбрасывается (рендеры новые — запусти compare.py заново).
# Последний шаг, после «принимаю» от Mark: deno run -A /Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/sketchfab-pack.js "$F"  — пакет для Sketchfab рядом с папкой модели.
import os, sys
sys.dont_write_bytecode = True
import modelkit as mk                                   # build.py уже подключил библиотеку и построил модель

OUT = os.environ.get('K29_OUT')
if not OUT: raise SystemExit('Задай K29_OUT=<папка модели>: сюда пишутся превью, экспорт и паспорт')
CHK = OUT + '/проверка-чертежей'
st = mk.stats()

# уровень 1: силуэты в кадрах чертежей. center_px — пиксель чертежа в центре кадра: если рендерим кадр целиком, это (ширина/2, высота/2)
# 4.png — бок, нос слева, 1193 × 242; 1.png — сзади, 3.png — спереди, по 242 × 242; ось на 3.png в (118, 123) (у самого чертежа центр сдвинут)
mk.silhouette_side(CHK + '/m_бок.png', (1193, 242), (1193 / 2, 242 / 2))
mk.silhouette_end(CHK + '/m_сзади.png', (242, 242), axis_px=(121, 121), rear=True)
mk.silhouette_end(CHK + '/m_спереди.png', (242, 242), axis_px=(118, 123), rear=False)

# превью для Sketchfab и для Mark (общий, сбоку, хвост, голова)
prev = [os.path.basename(p) for p in mk.previews(OUT)]

# сдача: файлы модели и паспорт (числа — из сцены; IoU допишет compare.py)
mk.export(OUT + '/kh29t.glb', OUT + '/kh29t.blend')
mk.passport(OUT + '/ПАСПОРТ.json', key='w_kh29t', weapon='kh29t', name='Х-29Т', name_en='Kh-29T', glb='kh29t.glb', blend='kh29t.blend',
    build=['build.py', 'deliver.py'], previews_=prev,
    sketchfab={'title': 'Kh-29T Air-to-Surface Missile — Low Poly',
               'lead': 'Kh-29T — Soviet/Russian air-to-surface missile with a seeker dome, four forward fins and four cruciform wings with control surfaces, modelled as a clean exterior shell.',
               'parts': ['seeker dome', 'body of revolution with panel seams', 'access hatches and sockets', 'four forward fins with pivot plates', 'four cruciform wings with elevons', 'suspension lugs', 'underside raceway', 'nozzle bowl'],
               'tags': ['kh-29', 'kh29', 'missile', 'air-to-surface', 'soviet', 'russian', 'military', 'weapon', 'aircraft', 'lowpoly', 'game-ready', 'blender']},
    notes='Цвет светлый серо-белый (как прежняя миниатюра и верхний образец на картинке 7); красная схема с картинок 6–7 — по слову Mark. Оперение крестом ×, проушины сверху, кожух снизу, нос в −Z осей glTF.')
print('сдача готова:', OUT)
