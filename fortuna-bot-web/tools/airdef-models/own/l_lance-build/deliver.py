# M752 (пусковая комплекса Lance) — сдача: габариты, игровой файл по частям, .blend, паспорт и отчёт. Запускается ПОСЛЕ build.py и bake.py в той же сессии:
#   M752_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Превью и анимированный пакет для Sketchfab (пусковая + ракета + подъём) делает pack.py (после этого файла и сдачи ракеты Свои/MGM-52).
# Игровой файл l_lance.glb — ходовая и корпус неподвижно (body_*), трап (ramp_in, ramp_out, ramp_hw — дочерние), стрела подъёма (erect_boom, erect_hw), походная поза; текстуры облегчённые (цвет JPEG 1024, нормали PNG 512).
import os, sys, json, math
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/M752'
sys.path.insert(0, HERE)
import m752_const as C

OUT = os.environ.get('M752_OUT')
if not OUT: raise SystemExit('Задай M752_OUT=<папка модели>: сюда пишутся экспорт и паспорт')
GAME_TEX, GAME_NTEX = int(os.environ.get('M752_GAME_TEX', '1024')), int(os.environ.get('M752_GAME_NTEX', '512'))
BASE = 'l_lance'
sc = bpy.data.scenes['M752']
bpy.context.view_layer.update()
mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9)); tris = 0
for o in sc.objects:
    if o.type != 'MESH': continue
    tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
    for v in o.data.vertices:
        w = o.matrix_world @ v.co
        for i in range(3): mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
L_, W_, H_ = mx.y - mn.y, mx.x - mn.x, mx.z - mn.z
print(f'M752: {tris} тр.; длина {L_:.2f} м, ширина {W_:.2f} м, высота {H_:.2f} м (с рамой над кабиной), Y {mn.y:.2f} … {mx.y:.2f}')

# игровой файл: облегчённые текстуры
lc = bpy.data.images.load(OUT + f'/{BASE}_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + f'/{BASE}_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
RM_GAME = {'M752_body': (0.90, 0.0), 'M752_skirt': (0.92, 0.0), 'M752_dark': (0.95, 0.0), 'M752_steel': (0.55, 0.45), 'M752_red': (0.5, 0.0), 'M752_wheel': (0.88, 0.0)}
orm_links = []
for m in [m for m in bpy.data.materials if m.name.startswith('M752_') and m.node_tree]:
    pr = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None:
            nm_ = nd.image.name.lower()
            if 'normal' in nm_: nd.image = ln                    # порядок проверок важен: «normal» содержит «orm»
            elif nm_.endswith('_orm') or nm_ == 'orm': continue
            else: nd.image = lc
    if pr is not None:                                      # игра берёт постоянные значения: карту ORM не передаём (matte)
        for sock in ('Roughness', 'Metallic'):
            for l in list(pr.inputs[sock].links):
                fr, to = l.from_socket, l.to_socket; m.node_tree.links.remove(l); orm_links.append((m.node_tree, fr, to))
        base = m.name[:-1] if m.name.endswith('F') and m.name[:-1] in RM_GAME else m.name
        if base in RM_GAME: pr.inputs['Roughness'].default_value, pr.inputs['Metallic'].default_value = RM_GAME[base]
mk.export(OUT + f'/{BASE}.glb', None)
for nt_, fr, to in orm_links: nt_.links.new(fr, to)
mk.export(OUT + f'/_tmp_{BASE}.glb', OUT + f'/{BASE}.blend'); os.remove(OUT + f'/_tmp_{BASE}.glb')      # .blend — с картой ORM (для Sketchfab); игровой glb — выше, без неё

notes = ('Ревизия 2 (2026-10-25): по картинкам Mark — 3 (White Sands: кабина, борта, трап), 5 (рисунок: камуфляж, таблички на лбу), 6 (NL-музей спереди-справа) и 7 (бельгийская M752 сбоку сверху); подвеска и размеры сняты с фото 6 и 7 '
         '(масштаб — колесо Ø 0,61 м, камера фото 6 подобрана по колёсам, борту и углам). Части для игры (по первому слову имени): body_* — неподвижно (ходовая body_run, звенья body_tread, корпус body_hull, передняя часть body_front, юбка body_skirt, фурнитура body_hw); '
         f'ramp_in — задняя плита-трап, ось петли вдоль X через (Y = {C.RAMP_H[0]}, Z = {C.RAMP_H[1]}) м; в походной позе повёрнута вокруг +X на {C.RAMP_CLOSED_DEG:.1f}° (наклонена назад по скосу «ушей»), раскрывается до {C.RAMP_OPEN_DEG:.1f}° (лежит назад и вниз, наружная кромка на земле); '
         f'ramp_out — наружная плита, дочерняя ramp_in, ось петли на (Y = {C.RAMP_H[0] + C.RAMP_T / 2:.3f}, Z = {C.RAMP_H[1] + C.RAMP_IN_L}) м в системе машины, в походной позе повёрнута на 180° (сложена), в боевой — 0°; ramp_hw — фурнитура ramp_in (дочерняя); '
         f'erect_boom — стрела подъёма (две балки с тремя сёдлами), ось петли вдоль X через (Y = {C.BOOM_H[0]}, Z = {C.BOOM_H[1]}) м, подъём: поворот вокруг +X на {C.BOOM_UP_DEG:.0f}° (в походной 0°, балки лежат вдоль Y); erect_hw — ремень, пряжка, упоры (дочерняя erect_boom). '
         f'Ракета (Свои/MGM-52, ключ msl_lance) лежит на сёдлах: ось ракеты Z = {C.MSL_AXIS_Z} м, торец хвоста Y = {C.MSL_AFT_Y} м, нос +Y; в боевой позе едет вместе со стрелой. Начало подвижных частей — на их осях петель. '
         f'Габариты: длина {L_:.2f} м (с лежащей ракетой по хвосту — 6,17 м ракеты, начиная с Y = {C.MSL_AFT_Y}), ширина {W_:.2f} м, высота {H_:.2f} м (с антенной над кабиной). Гидроцилиндры подъёма — только в пакете Sketchfab (Свои/Lance_пакет). '
         'Ниши фар вырезаны булевой операцией в body_front, лампы в них — в body_hw (проверка «ничего не висит» их отмечает: лампы стоят внутри ниши, касаясь дна). Таблички «4280F-3F32» и «A-21» — в текстуре лба (трафарет по рисунку 5). '
         'Оси: метры, нос +Y (в glTF −Z), земля Z = 0, X = 0 — ось машины.')
mk.passport(OUT + '/ПАСПОРТ.json', key='l_lance', weapon='', name='M752 (пусковая Lance)', name_en='M752 Lance Launcher', glb=f'{BASE}.glb', blend=f'{BASE}.blend', rev=2,
    build=['build.py', 'bake.py', 'deliver.py', 'm752_const.py', 'pack.py'], previews_=[],
    sketchfab={'title': 'M752 Lance Launcher (Camouflage, Textured)',
               'lead': 'M752 self-propelled launcher for the MGM-52 Lance tactical missile: a tracked chassis with five road wheels, a ribbed open-top launcher bay with raked rear ears, a flat front with recessed headlamps and a hinged trim vane, a narrow cab with a visor, a two-section rear ramp, a lifting boom with three cradles and a hold-down strap. NATO three-tone camouflage, baked paint wear and normal maps.',
               'parts': ['tracked chassis with five road wheels, sprocket, idler and track shoes', 'ribbed launcher bay with raked rear ears and a dark skirt', 'flat front with recessed headlamps and a hinged trim vane', 'narrow cab with window seals and a visor', 'two-section rear ramp with hatches and latches', 'lifting boom with three cradles and a strap', 'hooks, shackles, plates and bolts'],
               'tags': ['m752', 'lance', 'mgm-52', 'launcher', 'tracked', 'us army', 'missile', 'camouflage', 'military', 'vehicle', 'lowpoly', 'game-ready', 'textured', 'blender'],
               'dimensions': f'length {L_:.2f} m, width {W_:.2f} m, height {H_:.2f} m', 'textures': '2048 px baked colour, ORM and normal maps', 'glb': f'{BASE}_sketchfab.glb'},
    notes=notes)
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX; pj['notes'] = notes
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
