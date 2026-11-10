# deliver.py — сдача пусковой M142 HIMARS (после bake2.py; атласы берёт готовые - HIM_REUSE=1):
#   l_himars.glb (игра: цвет JPEG 1024, ORM и нормали PNG 512 - решение Mark), l_himars.blend (полные 4096), превью, ПАСПОРТ.json и ОТЧЁТ.json.
#   HIM_OUT="<папка с атласами 4096>" Blender -b --factory-startup --python deliver.py
# Поза в файле - походная: платформа 0°, пакет лежит (0°), стрела задвинута, люк закрыт, руль прямо; видны оба контейнера (игра показывает нужный).
import os, json, math, shutil
import bpy
from mathutils import Vector
os.environ.setdefault('HIM_REUSE', '1')
_here = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/HIMARS'
os.environ.setdefault('HIM_OUT', os.path.join(_here, '_ультра'))
_p = os.path.join(_here, 'bake2.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
DST = _here                                                                                          # сдача - в папку модели
GAME_TEX, GAME_NTEX = 1024, 512
BASE = 'l_himars'


def img_copy(path, size, fmt):
    src = bpy.data.images.load(path, check_existing=True); im = src.copy(); im.scale(size, size)
    p = os.path.join(DST, 'текстуры_игра', os.path.splitext(os.path.basename(path))[0] + f'_{size}.' + ('jpg' if fmt == 'JPEG' else 'png'))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    im.filepath_raw = p; im.file_format = fmt; im.save(); bpy.data.images.remove(im); return p


def swap_images(tex, ntex):
    back = []
    for tag in RES:
        m = bpy.data.materials[f'HIM_{tag}']
        for n in [n for n in m.node_tree.nodes if n.type == 'TEX_IMAGE']:
            p = bpy.path.abspath(n.image.filepath); col = '_color' in p
            newp = img_copy(p, tex if col else ntex, 'JPEG' if col else 'PNG')
            back.append((n, n.image)); n.image = bpy.data.images.load(newp, check_existing=True)
            if not col: n.image.colorspace_settings.name = 'Non-Color'
    return back


def restore(back):
    for n, im in back: n.image = im


def export(path):
    keep = [o for o in COL.objects if o.type == 'MESH' or (o.type == 'EMPTY' and o.name.startswith(('muzzle_', 'steer_')))]
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for o in keep: o.select_set(True)
    bpy.context.view_layer.objects.active = keep[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_materials='EXPORT', export_image_format='AUTO',
                              export_cameras=False, export_lights=False, export_normals=True, export_tangents=False, export_animations=False)
    tri = 0; dg = bpy.context.evaluated_depsgraph_get()
    for o in keep:
        if o.type == 'MESH': me = o.evaluated_get(dg).to_mesh(); me.calc_loop_triangles(); tri += len(me.loop_triangles); o.evaluated_get(dg).to_mesh_clear()
    return os.path.getsize(path), tri


for _n in ('Cube', 'Light', 'Camera'):
    if _n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[_n], do_unlink=True)
pose(0.0, 0.0, 0.0); bpy.context.view_layer.update()
for o in COL.objects: o.hide_render = o.hide_viewport = False
back = swap_images(GAME_TEX, GAME_NTEX); size_g, tri_g = export(os.path.join(DST, BASE + '.glb')); restore(back)
log('игра: %s.glb %.1f МБ, %d тр.' % (BASE, size_g / 1e6, tri_g))

# превью - кадры чистового запекания (_baked_shots.py, Cycles)
PREV = []
for i, nm in enumerate(('общий', 'перед', 'кабина', 'справа', 'боевое', 'корма', 'бампер', 'борт_пакета', 'зеркало', 'колесо')):
    src = os.path.join(OUT, 'кадры', nm + '.png')
    if os.path.exists(src): dst = f'превью_{i + 1}_{nm}.png'; shutil.copy(src, os.path.join(DST, dst)); PREV.append(dst)

# .blend с полными атласами (относительные пути на _ультра/)
for im in bpy.data.images:
    if im.filepath: im.filepath = bpy.path.relpath(bpy.path.abspath(im.filepath), start=DST)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(DST, BASE + '.blend'), copy=True, relative_remap=True, compress=True)

# ───────────── паспорт ─────────────
S = SCALE_FIX
G2 = lambda v: [round(v.x, 3), round(v.z, 3), round(-v.y, 3)]                                    # Blender → glTF (Y вверх, нос −Z)
wp = lambda n: COL.objects[n].matrix_world.translation.copy()
lid_map, muz = {}, {}
for o in COL.objects:
    if o.name.startswith('muzzle_'):
        tag = o.name[len('muzzle_'):]; muz[tag] = G2(o.matrix_world.translation)
        lid_map[tag] = dict(front=f'lid_f{tag}', rear=f'lid_r{tag}', container='pod_atacms' if tag == 'A' else 'pod_gmlrs', muzzle=f'muzzle_{tag}',
                            tube_radius_m=round((A_R if tag == 'A' else G_R) * S, 3))
hingeW, turnW = wp('pod'), wp('turn')
muzA = COL.objects['muzzle_A'].matrix_world.translation
EL_MAX = 60
TURN_LIM = {'el_0': 'весь круг (360°)', 'el_5_и_выше': [-130, 130]}
parts = {
    'body_*': 'неподвижное: body_cab (кабина), body_frame (рама, бампер, щитки крыльев), body_equip (ящики, баки, выхлоп, фонари, жгут), body_base (основание пусковой); det_* - мелочь каждого объекта (дети, двигаются с ним)',
    'turn': dict(what='поворотная платформа (дети: pod, cyl_body_l/r)', origin_gltf=G2(turnW), axis_gltf=[0, 1, 0], sign='+ против часовой сверху',
                 limits_deg=TURN_LIM, rest_deg=0),
    'pod': dict(what='качающаяся клетка (дети: boom, pod_atacms, pod_gmlrs, cyl_rod_l/r)', origin_gltf=G2(hingeW), axis_gltf=[1, 0, 0], sign='+ поднимает дульный торец',
                limits_deg=[0, EL_MAX], rest_deg=0, combat_deg=50, note='ход цилиндров даёт около 60°; столкновений нет до 75°'),
    'boom': dict(what='рама-стрела перезарядки (ребёнок pod)', move='сдвиг вдоль своей +Y (glTF −Z) по клетке', limits_m=[0, round(1.2 * S, 2)], rest_m=0,
                 note='выдвигать только при подъёме пакета от 30°: при 0° упирается в кабину и антенны'),
    'cyl_body_l / cyl_body_r': dict(what='корпуса цилиндров подъёма (дети turn), начало - на нижней опоре', aim='+Y объекта (glTF −Z) - на начало cyl_rod того же борта'),
    'cyl_rod_l / cyl_rod_r': dict(what='штоки (дети pod), начало - на верхней проушине', aim='+Y объекта (glTF −Z) - на начало cyl_body того же борта'),
    'pod_atacms / pod_gmlrs': 'контейнеры (дети pod, начало на оси петли); игра показывает один: ATACMS - одна труба, GMLRS - шесть',
    'lid_f<труба> / lid_r<труба>': 'крышки передние (песочные) и задние, начало - в центре торца трубы; при пуске прятать',
    'muzzle_<труба>': 'пустышки: центр дульного среза трубы (A - ATACMS; G0…G5 - GMLRS)',
    'wheel_<1|2|3><l|r>': dict(what='колёса; 1 - передние (дети steer_l/r)', spin_axis_gltf=[1, 0, 0], origin='центр колеса'),
    'steer_l / steer_r': dict(what='пустышки поворота передних колёс (шкворень)', axis_gltf=[0, 1, 0], limits_deg=[-30, 30], note='по расчёту зазоров (щиток крыла и бампер не задевает)'),
    'hatch': dict(what='люк на крыше кабины, начало на петле у переднего края', axis_gltf=[1, 0, 0], limits_deg=[-100, 0], sign='минус открывает вперёд-вверх'),
    'ant_l / ant_r': 'антенны (неподвижные)',
}
anim = dict(turn=dict(node='turn', axis='y', min=None, max=None, raised_limit_deg=130),
            elevate=dict(node='pod', axis='x', min=0, max=EL_MAX, rate_deg_s=4, cylinders=dict(body=['cyl_body_l', 'cyl_body_r'], rod=['cyl_rod_l', 'cyl_rod_r'])),
            boom=dict(node='boom', axis='-z', max_m=round(1.2 * S, 2), only_above_el_deg=30), lids=lid_map,
            wheels=dict(spin=[n for n in WHEELS], steer=['steer_l', 'steer_r']), hatch=dict(node='hatch', axis='x', open_deg=-100))
POD_NEW = dict(hinge=G2(hingeW), muzzle=G2(muzA), rest=0.0, el=round(math.radians(EL_MAX), 3), rate=round(1 / 15, 4))
swap = [
    'prepare.js: заменить рецепт l_himars на этот glb (l_himars.glb, текстуры внутри: цвет 1024, ORM 512, нормали 512); группы: pod - узел pod со всеми детьми, турель - turn, остальное корпус; '
    'det_* не объединять с чужими узлами (это мелочь своих родителей); узлы turn, pod, boom, cyl_*, lid_*, muzzle_*, steer_*, wheel_*, hatch не сливать.',
    'prepare.js: рецепт w_atacms - на Свои/ATACMS (atacms.glb), рули fin1…fin4 - отдельные узлы (wings deploy).',
    'sim/combined.js: новый POD.l_himars = ' + json.dumps(POD_NEW, ensure_ascii=False) + ' (glTF-координаты; прежний hinge [0.12,1.3,3.75] относился к чужой модели).',
    'Титры: убрать Denis.Cherkasov1 «M142 HIMARS» (чужая модель заменена своей).',
    'Дописать в игре: поворот turn вокруг Y (пределы в parts.turn: при подъёме ≥ 5° только ±130°), подъём pod с наведением цилиндров (как у Patriot: +Y корпуса на шток и обратно), '
    'стрелу boom (только при подъёме ≥ 30°), выбор контейнера (показать pod_atacms или pod_gmlrs), крышки труб (прятать lid_f/lid_r при пуске своей трубы), '
    'вращение колёс и поворот steer_*; шестиствольный контейнер - под будущие ракеты GMLRS/PrSM (дульные срезы muzzle_G0…G5).',
    'ORM (R затенение, G шероховатость, B металл) - одна картинка 512 на атлас; можно включать только в ангаре, если в бою дорого.',
]
P = dict(key=BASE, weapon='', name='M142 HIMARS', name_en='M142 HIMARS', rev=1,
         files=dict(glb=BASE + '.glb', blend=BASE + '.blend', build=['build.py', 'parts_llm.py', 'himkit.py', '_paint.py', 'make_decals.py', 'bake2.py', 'deliver.py', 'pack.py']),
         tex=GAME_TEX, nTex=GAME_NTEX, ormTex=GAME_NTEX, missile=dict(key='w_atacms', folder='Свои/ATACMS'),
         parts=parts, anim=anim, lids=lid_map, muzzles=muz, combat_pose=dict(turn_deg=0, pod_deg=50, boom_m=0, container='pod_atacms или pod_gmlrs', hatch_deg=0),
         swap_notes=swap,
         notes='Оси: Blender - метры, нос +Y, вверх +Z, земля 0; glTF - Y вверх, нос −Z. Масштаб постоянный 0,97 от сборки (колесо Ø 1,17 м). '
               'Контейнеры: pod_atacms - одна труба (ракета ATACMS 4,23 м со сложенными рулями входит), pod_gmlrs - шесть труб.')
json.dump(P, open(os.path.join(DST, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
mn = Vector((1e9,) * 3); mx_ = Vector((-1e9,) * 3)
for o in COL.objects:
    if o.type != 'MESH' or o.name.startswith('ant_'): continue
    for v in o.data.vertices:
        p = o.matrix_world @ v.co
        for i in range(3): mn[i] = min(mn[i], p[i]); mx_[i] = max(mx_[i], p[i])
R = dict(name_en='M142 HIMARS', rev=1, previews=PREV,
         model=dict(length_m=round(mx_.y - mn.y, 3), width_m=round(mx_.x - mn.x, 3), height_m=round(mx_.z - mn.z, 3), tris=tri_g, glb_mb=round(size_g / 1e6, 2)),
         paint=dict(variant=VAR, how='процедурная окраска с фотомасками CC0 (ambientCG: SurfaceImperfections003/013, Scratches003/005, Leaking012A/017B), трафареты свои вымышленные'),
         textures=dict(atlases={'A': 'кабина, оборудование, основание, платформа, люк, корпуса цилиндров', 'F': 'рама, бампер, щитки, антенны', 'B': 'клетка, стрела, контейнер GMLRS, штоки',
                                'T': 'контейнер ATACMS', 'W': 'колесо (одна развёртка на шесть)', 'D': 'мелочь det_*'}, full=SIZE, game='цвет 1024 JPEG, ORM 512, нормали 512',
                       normal='с детальной копии (фаски 6 мм) + рельеф краски'),
         checks=dict(collisions='подъём 0…75° без касаний; поворот при 0° - весь круг; при подъёме от 5° - ±130° (дальше задний торец клетки задевает ящики за кабиной); стрела при 0° задевает кабину и антенны, при 60° - чисто (_collide.py, _показ/_collide_6.txt)',
                     atacms_in_tube='ракета 4,23 м со сложенными рулями (r 0,449) входит в трубу (внутренний r 0,46), зазор ≈ 1 см (ATACMS/_fit.py)'),
         sketchfab=dict(title='M142 HIMARS with ATACMS and GMLRS pods', glb=BASE + '_sketchfab.glb',
                        tags=['himars', 'm142', 'atacms', 'gmlrs', 'mlrs', 'launcher', 'military', 'vehicle', 'animated', 'game-ready', 'pbr', 'blender']),
         notes='Ревизия 1 (2026-11-10): форма по фото Mark 01–17 (виды сбоку 16 и 17 - главные по длине), правки Mark: кабина шестиугольником, ниша решёток, прямоугольные окна, подбородок 45° и щитки крыльев, пусковая в габарите рамы. Окраска олива.')
json.dump(R, open(os.path.join(DST, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
log('deliver.py: готово', BASE + '.glb', PREV)
