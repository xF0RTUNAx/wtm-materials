# animate.py — анимация УМПК для Sketchfab (Mark 2026-10-22: «анимацию сброса, переворота и раскрытия»). Бомба висит на балке-подвесе крыльями ВНИЗ (крылья сложены вдоль модуля),
# отделяется и падает, переворачивается на 180° вокруг оси, крылья раскрываются; петля 8 с, 24 кадра/с. Только для файла Sketchfab (umpk_sketchfab_anim.glb): игровой файл umpk.glb — без анимации,
# крылья там цельные доски (игра сама их складывает и раскрывает после сброса; переворота в игре нет). Балка-подвес с коротким пилоном есть только в анимированной версии (как «BOMB RACK» на схеме Quinta).
# Запуск: (а) последним шагом конвейера:  UMP_OUT="<папка>" Blender -b --factory-startup --python build.py --python bake.py --python deliver.py --python animate.py
#         (б) отдельно из готового .blend (без запекания; полные текстуры берутся из umpk_detail.png / umpk_normal.png):  UMP_OUT="<папка>" Blender -b "<папка>/umpk.blend" --python animate.py
#         (в) в живом Blender (Mark смотрит на шкале времени): UMP_ANIM_SCENE=<имя сцены> UMP_ANIM_EXPORT=0 — только ключи, без записи файлов.
# UMP_ANIM_VIDEO=1 — ещё и ролик анимация.mp4 (ffmpeg). Структура: пустышка UMPK_bomb (весь корпус и комплект; ключи положения и вращения), консоли крыльев UMP_wingA_R/L, UMP_wingB_R/L (оси — в корне
# по задней кромке, у борта модуля: сложены вдоль модуля наружу), UMP_rack (неподвижная балка с ушками и пилоном).
import os, sys, math, json, struct, shutil, subprocess, tempfile
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/УМПК'
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Vector, Matrix
import modelkit as mk
import fab_bomb as fb
import umpk_kit as uk
from fab_bomb import Yb

OUT = os.environ.get('UMP_OUT')
SCN = bpy.data.scenes[os.environ.get('UMP_ANIM_SCENE', 'UMPK')]
EXPORT = os.environ.get('UMP_ANIM_EXPORT', '1') == '1'
VIDEO = os.environ.get('UMP_ANIM_VIDEO', '0') == '1'
if EXPORT and not OUT: raise SystemExit('Задай UMP_OUT=<папка модели>: сюда пишутся анимированный glb и превью')
FPS, T_END = 24, 8.0
F0 = 1; F1 = F0 + int(FPS * T_END)
HX = uk.W_MOD / 2                                   # борт модуля: ось складывания крыльев
Z_W = (uk.Z_TOP + uk.Z_BOT) / 2                     # плоскость крыльев


def base(o): return o.name.split('.')[0]


# ── время ──
def clamp01(x): return max(0.0, min(1.0, x))
def seg(t, a, b): return clamp01((t - a) / (b - a))
def smooth(x): return x * x * (3 - 2 * x)
def back_out(x, c1=1.0): c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2      # чуть «щёлкает» в конце раскрытия


T_REL, T_DROP_END, T_ROLL0, T_ROLL1, T_UNF0, T_UNF1 = 1.0, 2.6, 2.0, 3.9, 3.7, 4.7          # с: сброс, конец разгона, начало и конец переворота, начало и конец раскрытия
def pitch(t): return -0.12 * smooth(seg(t, T_REL, 2.2)) + 0.18 * smooth(seg(t, 2.8, 5.0))     # нос вниз при сбросе, потом планирование с небольшим подъёмом, рад
def roll(t): return math.pi * smooth(seg(t, T_ROLL0, T_ROLL1))                                # переворот на 180° вокруг оси бомбы
def unfold(t): return back_out(seg(t, T_UNF0, T_UNF1))                                         # 0 — сложено, 1 — раскрыто


def trajectory():
    """Центр бомбы (y вперёд, z вверх) по кадрам. В системе самолёта: падение с ускорением 0,8 м/с² с T_REL до T_DROP_END, дальше планирование (спуск ≈ 0,10 м/с) и медленный снос назад; всего ≈ 2,3 м вниз — кадр умещается без отдаления."""
    dt = 1.0 / (FPS * 10); y = z = vy = vz = 0.0; out = {}
    for i in range(int(T_END * FPS * 10) + 1):
        t = i * dt
        if i % 10 == 0: out[F0 + i // 10] = (y, z)
        if T_REL <= t < T_DROP_END: vz -= 0.8 * dt; vy -= 0.10 * dt
        elif t >= T_DROP_END: vz += (-0.10 - vz) * dt / 0.6; vy += (-0.15 - vy) * dt / 1.2
        y += vy * dt; z += vz * dt
    return out


# ── полные текстуры ──
def relink_full_textures(objs):
    c = bpy.data.images.get('UMP_detail'); n = bpy.data.images.get('UMP_normal')
    if c is None or n is None or min(c.size) < 1024:           # не из конвейера (облегчённые 512): берём PNG из папки модели
        if not OUT: print('нет OUT — текстуры оставлены как есть'); return
        c = bpy.data.images.load(OUT + '/umpk_detail.png', check_existing=False); c.colorspace_settings.name = 'sRGB'
        n = bpy.data.images.load(OUT + '/umpk_normal.png', check_existing=False); n.colorspace_settings.name = 'Non-Color'
    for m in set(m for o in objs for m in o.data.materials if m):
        if not m.use_nodes: continue
        for nd in m.node_tree.nodes:
            if nd.type == 'TEX_IMAGE' and nd.image is not None:
                nd.image = n if nd.image.colorspace_settings.name == 'Non-Color' else c
    print('текстуры:', c.name, tuple(c.size), '/', n.name, tuple(n.size))


# ── консоли крыльев из досок (станции у бортов модуля ±0,10 уже есть) ──
def make_console(src, side, name, a_c, chord):
    hinge = Vector((side * HX, Yb(a_c + chord / 2), Z_W))                 # задняя кромка у борта: сложенная консоль ложится наружу от модуля, назад
    bm = bmesh.new(); bm.from_mesh(src.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if min(side * v.co.x for v in f.verts) < HX - 1e-4], context='FACES')
    edges = [e for e in bm.edges if e.is_boundary]
    new = bmesh.ops.holes_fill(bm, edges=edges, sides=len(edges) + 2)['faces']      # крышка у борта модуля (при складывании корень виден)
    uvl = bm.loops.layers.uv.active
    for f in new:
        f.smooth = False
        if uvl is None: continue
        for l in f.loops:
            for l2 in l.vert.link_loops:
                if l2.face is not f: l[uvl].uv = l2[uvl].uv.copy(); break
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for v in bm.verts: v.co -= hinge
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in src.data.materials: me.materials.append(m)
    ob = bpy.data.objects.new(name, me); ob.location = hinge; SCN.collection.objects.link(ob)
    return ob


def adopt(ob):
    """Объект — в основную коллекцию сцены анимации (B().finish кладёт его в коллекцию библиотеки)."""
    for c in list(ob.users_collection): c.objects.unlink(ob)
    SCN.collection.objects.link(ob)
    return ob


def make_rack():
    """Неподвижная балка-подвес над бомбой: клиновая балка, две скобы на ушках, короткий пилон со срезом сверху. Материал без текстуры."""
    b = mk.B()
    R = uk.rect
    b.loft([R(0.50, 0.04, 0.280, 0.330), R(0.62, 0.15, 0.275, 0.365), R(1.45, 0.15, 0.275, 0.365), R(1.58, 0.10, 0.285, 0.350)], 0, cap0=0, cap1=0)
    for a in (0.67, 0.93): b.loft([R(a - 0.035, 0.12, 0.250, 0.280), R(a + 0.035, 0.12, 0.250, 0.280)], 0, cap0=0, cap1=0)
    b.loft([R(0.40, 0.05, 0.360, 0.420), R(0.85, 0.12, 0.360, 0.640), R(1.55, 0.12, 0.360, 0.640), R(1.80, 0.06, 0.360, 0.470)], 0, cap0=0, cap1=0)
    ob = adopt(b.finish('UMP_rack'))
    m = bpy.data.materials.get('UMP_rack') or mk.mat('UMP_rack', (0.17, 0.18, 0.19), rough=0.62, metal=0.35)
    ob.data.materials.clear(); ob.data.materials.append(m)
    return ob


def build():
    if mk.col is None: mk.col = SCN.collection; mk.sc = SCN                # запуск из готового .blend: библиотека модели не настраивалась
    objs = [o for o in SCN.objects if o.type == 'MESH']
    relink_full_textures(objs)
    planks = {base(o): o for o in objs if base(o) in uk.WINGS}
    if len(planks) != 2: raise SystemExit(f'не найдены доски крыльев: {sorted(base(o) for o in objs)}')
    cons = []                                                          # (объект, угол сложенного положения, это заднее крыло)
    for n, (a_c, chord, span, th) in uk.WINGS.items():
        for side, suf in ((1, 'R'), (-1, 'L')):
            cons.append((make_console(planks[n], side, f'{n}_{suf}', a_c, chord), -side * math.pi / 2, n == 'UMP_wingB'))
    for p in planks.values():
        me = p.data; bpy.data.objects.remove(p, do_unlink=True)
        if me.users == 0: bpy.data.meshes.remove(me)
    rack = make_rack()
    bomb = bpy.data.objects.new('UMPK_bomb', None); bomb.empty_display_type = 'PLAIN_AXES'; bomb.empty_display_size = 0.3; SCN.collection.objects.link(bomb)
    kids = [o for o in SCN.objects if o.type == 'MESH' and o is not rack and o.parent is None]
    for o in kids: o.parent = bomb; o.matrix_parent_inverse = Matrix.Identity(4)
    SCN.render.fps = FPS; SCN.frame_start, SCN.frame_end = F0, F1
    bomb.rotation_mode = 'YXZ'                                          # сначала крен вокруг оси бомбы (Y), потом тангаж вокруг мировой X
    traj = trajectory()
    for f in range(F0, F1 + 1):
        t = (f - F0) / FPS; y, z = traj[f]
        bomb.location = (0.0, y, z); bomb.rotation_euler = (pitch(t), roll(t), 0.0)
        bomb.keyframe_insert('location', frame=f); bomb.keyframe_insert('rotation_euler', frame=f)
        u = unfold(t)
        for ob, fold, rear in cons:
            ob.rotation_euler = (0.0, 0.0, fold * (1.0 - u)); ob.keyframe_insert('rotation_euler', index=2, frame=f)
            if rear:                                                    # заднее крыло в сложенном виде чуть выше переднего (доски иначе пересекаются у конца модуля)
                ob.location.z = Z_W + 0.034 * (1.0 - clamp01(u)); ob.keyframe_insert('location', index=2, frame=f)
    SCN.frame_set(F0)
    print('анимация: кадры', F0, '…', F1, f'({T_END:g} с), объектов под бомбой {len(kids) + len(cons)}, ключей на пустышке {F1 - F0 + 1}')
    return bomb, rack, kids, cons


# ── экспорт и проверка ──
def export_glb(path, bomb, rack):
    vl = bpy.context.view_layer
    if bpy.context.scene is not SCN:
        try: bpy.context.window.scene = SCN
        except Exception: pass
    if bpy.context.scene is not SCN: raise RuntimeError(f'активна сцена «{bpy.context.scene.name}», а не «{SCN.name}»')
    for o in vl.objects: o.select_set(False)
    sel = [o for o in SCN.objects if o.type in ('MESH', 'EMPTY') and not o.hide_viewport]
    for o in sel: o.select_set(True)
    vl.objects.active = bomb
    SCN.frame_set(F0)
    # НЕ переопределять контекст вокруг экспортёра (temp_override роняет Blender 5.2.2)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_materials='EXPORT', export_cameras=False,
                              export_lights=False, export_normals=True, export_animations=True, export_animation_mode='ACTIVE_ACTIONS', export_frame_range=True,
                              export_force_sampling=True, export_optimize_animation_size=False, export_current_frame=False)
    return os.path.getsize(path)


def glb_summary(path):
    with open(path, 'rb') as fh:
        fh.read(12); ln, tp = struct.unpack('<II', fh.read(8)); js = json.loads(fh.read(ln))
    an = js.get('animations', [])
    info = []
    for a in an:
        dur = max(js['accessors'][s['input']].get('max', [0])[0] for s in a['samplers'])
        info.append((a.get('name'), len(a['channels']), round(dur, 3)))
    return {'узлов': len(js['nodes']), 'мешей': len(js.get('meshes', [])), 'анимаций': info, 'материалов': len(js.get('materials', [])), 'текстур': len(js.get('images', []))}


# ── картинки: кадры анимации ──
def ffmpeg(*args):
    exe = shutil.which('ffmpeg') or '/opt/homebrew/bin/ffmpeg'
    return subprocess.run([exe, '-y', '-loglevel', 'error', *args], capture_output=True, text=True)


def render_outputs():
    mk.sc = SCN; mk.NAME = 'UMPK'; mk.col = bpy.data.collections.get('UMPK') or SCN.collection
    tmp = tempfile.mkdtemp(prefix='umpk_anim_')
    CAM = (Vector((0.0, -0.45, -1.15)), (1.0, 0.55, 0.12), 6.6)       # цель, направление к камере, расстояние: видны и подвес, и самая нижняя точка падения (кадр квадратный — движение в основном по вертикали)
    size = (800, 800)
    mk.previews(tmp, size=size, views=[('_p.png', *CAM)])
    shots = [0.6, 1.9, 2.9, 3.8, 4.5, 6.6]
    for i, t in enumerate(shots, 1):
        SCN.frame_set(F0 + int(round(t * FPS))); mk._render(os.path.join(tmp, f'k{i}.png'), *size)
    sheet = OUT + '/превью_5_анимация.png'
    r = ffmpeg('-framerate', '1', '-i', os.path.join(tmp, 'k%d.png'), '-vf', 'tile=3x2', '-frames:v', '1', sheet)
    print('кадры анимации:', sheet if os.path.exists(sheet) else 'не собраны ' + r.stderr[:200])
    if VIDEO:
        for f in range(F0, F1 + 1):
            SCN.frame_set(f); mk._render(os.path.join(tmp, 'v%04d.png' % f), *size)
        r = ffmpeg('-framerate', str(FPS), '-i', os.path.join(tmp, 'v%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', OUT + '/анимация.mp4')
        print('ролик:', OUT + '/анимация.mp4' if os.path.exists(OUT + '/анимация.mp4') else 'не собран ' + r.stderr[:200])
    SCN.frame_set(F0)
    shutil.rmtree(tmp, ignore_errors=True)
    return sheet


bomb, rack, kids, cons = build()
if EXPORT:
    gl = OUT + '/umpk_sketchfab_anim.glb'
    print('glb:', gl, export_glb(gl, bomb, rack) // 1024, 'КБ', glb_summary(gl))
    render_outputs()
    rp = OUT + '/ОТЧЁТ.json'
    if os.path.exists(rp):                                              # превью с кадрами анимации — в пакет Sketchfab
        R = json.load(open(rp, encoding='utf-8'))
        if 'превью_5_анимация.png' not in R.get('previews', []): R.setdefault('previews', []).append('превью_5_анимация.png')
        json.dump(R, open(rp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('анимация готова')
