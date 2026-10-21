# Х-31П — проверка и сдача: силуэты в кадрах чертежей, статистика, превью, экспорт, паспорт. Запускается ПОСЛЕ build.py в том же Blender:
#   K31_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
#       --python <папка>/build.py --python <папка>/deliver.py
# Дальше — в терминале (K=…/own/_kit, F="<папка модели>"):
#   /usr/bin/python3 -I $K/compare.py "$F/чертёж-спереди.png" "$F/проверка-чертежей/m_спереди.png" "$F/проверка-чертежей/наложение_спереди.png" 3 --passport "$F/ПАСПОРТ.json" --view спереди
#   /usr/bin/python3 -I $K/compare.py "$F/чертёж-сзади.png"   "$F/проверка-чертежей/m_сзади.png"   "$F/проверка-чертежей/наложение_сзади.png"   3 --passport "$F/ПАСПОРТ.json" --view сзади
# Бок: вид-сверху-размеры.png — перспективный рендер (и заборники у него расположены иначе), IoU для него не годится — только наложение на глаз.
#   /usr/bin/python3 -I $K/compare.py "$F/вид-сверху-размеры.png" "$F/проверка-чертежей/m_бок.png" "$F/проверка-чертежей/наложение_бок.png" 2
import os, sys
sys.dont_write_bytecode = True
import modelkit as mk

OUT = os.environ.get('K31_OUT')
if not OUT: raise SystemExit('Задай K31_OUT=<папка модели>: сюда пишутся превью, экспорт и паспорт')
CHK = OUT + '/проверка-чертежей'
st = mk.stats()

# вид-сверху-размеры.png — 532 × 375, нос слева; чертёж-спереди.png — 150 × 150, ось в (75, 75), радиус корпуса 25 пикс.; чертёж-сзади.png — 124 × 150, ось (75, 75)
mk.silhouette_side(CHK + '/m_бок.png', (532, 375), (532 / 2, 375 / 2))
mk.silhouette_end(CHK + '/m_спереди.png', (150, 150), axis_px=(75, 75), rear=False, rb_px=25.0)
mk.silhouette_end(CHK + '/m_сзади.png', (124, 150), axis_px=(75, 75), rear=True, rb_px=25.0)

prev = [os.path.basename(p) for p in mk.previews(OUT)]

mk.export(OUT + '/kh31p.glb', OUT + '/kh31p.blend')
mk.passport(OUT + '/ПАСПОРТ.json', key='w_kh31p', weapon='kh31p', name='Х-31П', name_en='Kh-31P', glb='kh31p.glb', blend='kh31p.blend',
    build=['build.py', 'deliver.py'], previews_=prev,
    sketchfab={'title': 'Kh-31P Air-to-Surface Missile — Low Poly',
               'lead': 'Kh-31P — Soviet/Russian air-to-surface missile with a pointed ogive nose, four ramjet air intakes and four cruciform swept wings with control plates, modelled as a clean exterior shell.',
               'parts': ['pointed ogive nose with panel seams', 'cylindrical body with joints', 'four ramjet air intakes with connecting webs', 'four swept cruciform wings', 'four control plates', 'access hatch and sockets', 'suspension lugs', 'nozzle bowl'],
               'tags': ['kh-31', 'kh31', 'missile', 'air-to-surface', 'anti-radiation', 'soviet', 'russian', 'military', 'weapon', 'aircraft', 'lowpoly', 'game-ready', 'blender']},
    notes='Цвет светлый серо-белый (как Х-29Т). Заборники и оперение крестом × по чертежу (на рендере с размерами они расположены +, но чертёж — главный). Длинные станции взяты с рендера (чертёж обрезан), радиусы и форма крыла — с чертежа. Нос в −Z осей glTF.')
print('сдача готова:', OUT)
