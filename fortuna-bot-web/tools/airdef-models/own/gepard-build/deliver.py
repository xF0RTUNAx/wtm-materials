# Flakpanzer Gepard — проверка и сдача: силуэты в кадрах чертежей, статистика, превью, экспорт, анимация, паспорт (по образцу ../Х-29Т).
# Запускается ПОСЛЕ build.py и bake.py в том же фоновом Blender (не трогает открытый у Mark):
#   K29_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
#       --python <папка>/build.py --python <папка>/bake.py --python <папка>/deliver.py
# Что получается: gepard.glb — для игры (плоский, с текстурой, без анимации); gepard_sketchfab.glb — для Sketchfab (с текстурой и анимацией: башня, стволы с коробами,
# антенна); gepard.blend — сцена целиком (материалы с текстурой, стержни и ключи анимации); превью; ПАСПОРТ.json и ОТЧЁТ.json.
import os, sys, math
sys.dont_write_bytecode = True
import bpy
import modelkit as mk                                   # build.py уже подключил библиотеку и построил модель
from mathutils import Vector

OUT = os.environ.get('K29_OUT')
if not OUT: raise SystemExit('Задай K29_OUT=<папка модели>: сюда пишутся превью, экспорт и паспорт')
CHK = OUT + '/проверка-чертежей'
sc = bpy.data.scenes['GEPARD']
st = mk.stats()

# уровень 1: силуэты в кадрах чертежей (чертежи/side.png 1040×548, top.png 1040×464, front.png 460×540, rear.png 460×544)
S_, WT_ = mk.S, 231.5
mk.silhouette_side(CHK + '/m_бок.png', (1040, 548), (520, 274))
mk._ortho_shot(CHK + '/m_сверху.png', ((WT_ - 232) * S_, mk.Y(520), 8.0), (0, 0, math.radians(-90)), 1040, 464, 1040 * S_)
mk.silhouette_end(CHK + '/m_спереди.png', (460, 540), axis_px=(230.5, 528), rear=False)
mk.silhouette_end(CHK + '/m_сзади.png', (460, 544), axis_px=(228.0, 532), rear=True)

# превью для Mark и Sketchfab: общий (спереди-слева), сбоку, сзади-справа, башня и антенна крупно (материалы — с текстурой)
views = [('превью_1_общий.png', Vector((0, 0.2, 1.7)), (-0.85, 0.95, 0.42), 12.8),
         ('превью_2_сбоку.png', Vector((0, 0.1, 1.9)), (-1.0, 0.0, 0.03), 13.0),
         ('превью_3_корма.png', Vector((0, -0.6, 1.9)), (0.85, -1.0, 0.45), 12.0),
         ('превью_4_башня.png', Vector((0, 0.3, 2.7)), (-0.75, 0.9, 0.35), 7.5)]
prev = [os.path.basename(p) for p in mk.previews(OUT, views=views)]

# игровой файл: плоский, с текстурами, без анимации (движения башни, стволов с коробами и антенны игра делает поворотом частей из кода); текстуры — копии 1024
# (цвет JPEG, нормали PNG): файл лёгкий (около 1 МБ вместо 10) и годится как исходник prepare.js в репозитории. Для Sketchfab и .blend картинки возвращаются на 2048.
gm = [m for m in bpy.data.materials if m.name.startswith('GEP_')]
full = {}
lc = bpy.data.images.load(OUT + '/gepard_detail_1024.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'
ln = bpy.data.images.load(OUT + '/gepard_normal_1024.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'
for m in gm:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None:
            full[(m.name, nd.name)] = nd.image; nd.image = ln if nd.image.name == 'GEP_normal' else lc
mk.export(OUT + '/gepard.glb', None)
for m in gm:
    for nd in m.node_tree.nodes:
        if (m.name, nd.name) in full: nd.image = full[(m.name, nd.name)]
bpy.data.images.remove(lc); bpy.data.images.remove(ln)

# анимация: стержни и ключи (rig.py), затем файл для Sketchfab и итоговый .blend
exec(compile(open(OUT + '/rig.py', encoding='utf-8').read(), OUT + '/rig.py', 'exec'), {'__name__': '__main__'})
vl = bpy.context.view_layer; vl.update()
for o in vl.objects: o.select_set(False)
sel = [o for o in sc.objects if o.type in ('MESH', 'EMPTY')]
for o in sel: o.select_set(True)
vl.objects.active = sel[0]
sc.frame_set(0)
# НЕ оборачивать экспортёр в temp_override (в Blender 5.2.2 это роняет программу)
bpy.ops.export_scene.gltf(filepath=OUT + '/gepard_sketchfab.glb', export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_materials='EXPORT', export_cameras=False, export_lights=False, export_normals=True,
                          export_animations=True, export_animation_mode='ACTIVE_ACTIONS', export_force_sampling=True)
bpy.data.libraries.write(OUT + '/gepard.blend', {sc}, fake_user=True)

mk.passport(OUT + '/ПАСПОРТ.json', key='gepard', weapon='', name='Gepard', name_en='Flakpanzer Gepard', glb='gepard.glb', blend='gepard.blend',
    build=['build.py', 'bake.py', 'rig.py', 'deliver.py'], previews_=prev,
    sketchfab={'title': 'Flakpanzer Gepard — Animated Low Poly Self-Propelled Anti-Aircraft Gun',
               'lead': 'Flakpanzer Gepard — German self-propelled anti-aircraft gun on a tracked hull: twin barrels with open bores and slotted muzzle brakes, a faceted turret with a round tracking-radar housing and a rotating search-radar dish. Hand-modelled low-poly exterior with baked colour (dust, mud, paint chips, ambient occlusion) and normal-map textures. Animated: the turret turns, the guns rise together with their gun housings, the search radar spins.',
               'parts': ['hull with front fenders and sloped louvre plates', 'tracks with links and seven road wheels per side', 'turret with two faceted gun housings (they elevate with the barrels)', 'twin barrels with slotted cage muzzle brakes and open bores',
                         'tracking-radar housing', 'search-radar antenna on a drive housing (black, rotates)', 'smoke dischargers on rails', 'whip antennas'],
               'tags': ['gepard', 'flakpanzer', 'spaag', 'anti-aircraft', 'tank', 'german', 'bundeswehr', 'military', 'vehicle', 'lowpoly', 'animated', 'game-ready', 'blender'],
               'dimensions': 'length 7.66 m with guns, width 3.24 m, height 4.03 m',
               'textures': '2048 px baked colour map and tangent-space normal map',
               'animation': 'turret traverse, guns elevating together with their gun housings, search radar spinning (one looping 12 s clip)',
               'glb': 'gepard_sketchfab.glb'},
    notes='Части для игры по имени объекта: body_* (корпус и ходовая), turret_* (башня), cradle_* (стволы с орудийными коробами — качаются), radar_* (антенна обзора — крутится). Нос в −Z осей glTF, земля y=0. '
          'Материалы: GEP_body (оливковая краска), GEP_dark, GEP_steel, GEP_glass; текстуры 2048: gepard_detail.png (цвет: краска, песок и пыль сверху, грязь снизу, сколы на рёбрах, затенение щелей, зерно) и gepard_normal.png (нормали: скруглённые рёбра, зерно краски, лёгкая волна листов). '
          'gepard.glb — для игры (без анимации, текстуры 1024: цвет JPEG, нормали PNG), gepard_sketchfab.glb — для Sketchfab (текстуры 2048, анимация). Длина 7,66 м. '
          'Проверки: качание 0…80° и вращение антенны без пересечений с неподвижным (build.py, run_sweeps); висящих деталей нет (check_group); болты не утоплены в стенки (check_bolts).')
print('сдача готова:', OUT)
