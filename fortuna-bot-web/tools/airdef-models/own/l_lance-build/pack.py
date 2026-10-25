# pack.py — пакет «M752 + MGM-52 Lance» для Sketchfab: пусковая и ракета в одной сцене, анимация «походное положение → боевое» (трап раскрывается, стрела с ракетой поднимается на гидроцилиндрах), превью, ролик, экспорт.
# Исходники: Свои/M752/l_lance.blend + полные текстуры l_lance_*.png, Свои/MGM-52/msl_lance.blend + msl_lance_*.png. Фоновый Blender:
#   PK_OUT="<папка пакета>" [PK_FAST=1] [PK_VIDEO=1] /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python pack.py
# Время (с, 30 к/с): 0–1 стоит; 1–3 трап раскрывается (внутренняя плита из походного наклона до RAMP_OPEN_DEG); 2,2–3,6 наружная плита разворачивается (180°→0°); 4,4–10,4 стрела с ракетой 0°→70° (синхронно ход цилиндров); до 12 — стоит в боевом положении.
import os, sys, math, json, time, struct
sys.dont_write_bytecode = True
import bpy, bmesh
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/M752'
sys.path.insert(0, HERE)
import m752_const as C

SOWN = '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои'
M752, MSL = SOWN + '/M752', SOWN + '/MGM-52'
OUT = os.environ.get('PK_OUT', SOWN + '/Lance_пакет')
FAST = os.environ.get('PK_FAST') == '1'
FPS, T_END = 30, 12.0
T0 = time.time()
os.makedirs(OUT, exist_ok=True)


def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)


bpy.ops.wm.read_factory_settings(use_empty=True)
for blend, scene in ((M752 + '/l_lance.blend', 'M752'), (MSL + '/msl_lance.blend', 'MGM52')):
    with bpy.data.libraries.load(blend, link=False) as (src, dst): dst.scenes = [scene]
sc = bpy.data.scenes['M752']; sc.name = 'LANCE'
ms = bpy.data.scenes['MGM52']
for o in list(ms.objects):
    if o.type == 'MESH': sc.collection.objects.link(o)
for s_ in [s_ for s_ in bpy.data.scenes if s_ is not sc]: bpy.data.scenes.remove(s_)
try: bpy.context.window.scene = sc
except Exception: pass
log('сцены загружены; объектов', len(sc.objects))

# ── полные текстуры вместо облегчённых
cache = {}
def full_image(p, srgb):
    if p not in cache:
        im = bpy.data.images.load(p, check_existing=False); im.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'; im.pack(); cache[p] = im
    return cache[p]
for m in bpy.data.materials:
    if not m.node_tree: continue
    pre = 'M752_' if m.name.startswith('M752_') else ('LNC_' if m.name.startswith('LNC_') else None)
    if pre is None: continue
    folder, base = (M752, 'l_lance') if pre == 'M752_' else (MSL, 'msl_lance')
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None:
            low = nd.image.name.lower(); kind = 'normal' if 'normal' in low else ('orm' if 'orm' in low else 'detail')
            p = f'{folder}/{base}_{kind}.png'
            if os.path.exists(p): nd.image = full_image(p, kind == 'detail')
log('текстуры:', [os.path.basename(k) for k in cache])

obj = bpy.data.objects
boom, ri, ro = obj['erect_boom'], obj['ramp_in'], obj['ramp_out']
msl_objs = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('LNC_')]
ys = [v.co.y for o in msl_objs for v in o.data.vertices]; L_MSL = max(ys) - min(ys)
piv = bpy.data.objects.new('MSL_pivot', None); sc.collection.objects.link(piv); piv.empty_display_size = 0.05
piv.location = (0.0, C.MSL_AFT_Y + L_MSL / 2.0, C.MSL_AXIS_Z)
piv.parent = boom; piv.matrix_parent_inverse = Matrix.Translation(boom.location).inverted()
for o in msl_objs: o.parent = piv; o.location = (0, 0, 0)

# ── гидроцилиндры подъёма (только здесь): корпус на полу отсека, шток к проушине на балке
def flat_mat(name, rgb, rough, metal):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1.0); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m
M_CYL, M_ROD, M_DK = flat_mat('PK_cyl', (0.050, 0.060, 0.032), 0.85, 0.0), flat_mat('PK_rod', (0.30, 0.30, 0.29), 0.28, 0.9), flat_mat('PK_dark', (0.03, 0.03, 0.03), 0.9, 0.0)


def cyl_mesh(name, segs, mats):
    """segs — [(y0, y1, r, материал)] вдоль +Y от начала; закрытое тело вращения из цилиндров, нужная ось — Y."""
    bm = bmesh.new()
    for y0, y1, r, mi in segs:
        g = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=18, radius1=r, radius2=r, depth=(y1 - y0))
        bmesh.ops.rotate(bm, verts=g['verts'], cent=(0, 0, 0), matrix=Matrix.Rotation(-math.pi / 2, 3, 'X'))
        bmesh.ops.translate(bm, verts=g['verts'], vec=(0, (y0 + y1) / 2, 0))
        for f in {f for v in g['verts'] for f in v.link_faces}: f.material_index = mi
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob); return ob


CYL = {}
for sx, tag in ((-1.0, 'L'), (1.0, 'R')):
    body = cyl_mesh(f'cyl_body{tag}', [(0.0, 1.15, 0.075, 0), (-0.06, 0.0, 0.05, 2), (1.15, 1.20, 0.085, 2)], [M_CYL, M_ROD, M_DK])
    rod = cyl_mesh(f'cyl_rod{tag}', [(-1.32, 0.0, 0.040, 1), (0.0, 0.07, 0.055, 2)], [M_CYL, M_ROD, M_DK])        # шток длиннее хода: в самом длинном положении перекрывает корпус
    CYL[tag] = (sx, body, rod)


def smooth(t): t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)
def seg(t, a, b): return smooth((t - a) / (b - a))


def poses(t):
    """Углы в градусах: (ramp_in, ramp_out, boom) в момент t (с)."""
    return (C.RAMP_CLOSED_DEG + (C.RAMP_OPEN_DEG - C.RAMP_CLOSED_DEG) * seg(t, 1.0, 3.0), 180.0 + (C.RAMP_OUT_OPEN_DEG - 180.0) * seg(t, 2.2, 3.6), C.BOOM_UP_DEG * seg(t, 4.4, 10.4))


def cyl_pose(boom_deg):
    th = math.radians(boom_deg); hy, hz = C.BOOM_H
    out = {}
    for tag, (sx, body, rod) in CYL.items():
        base = Vector((sx * C.CYL_BASE[0], C.CYL_BASE[1], C.CYL_BASE[2])); att = Vector((sx * 0.88, hy + C.CYL_ATT_S * math.cos(th), hz + C.CYL_ATT_S * math.sin(th)))
        d = att - base; phi = math.atan2(d.z, d.y)
        out[tag] = (base, att, phi)
    return out


# ── анимация: ключ на каждый кадр
sc.render.fps = FPS; sc.frame_start = 0; sc.frame_end = int(T_END * FPS)
def key(o, f, **kw):
    for path, val in kw.items():
        setattr(o, path, val); o.keyframe_insert(path, frame=f)
for o in (ri, ro, boom) + tuple(x for tag in CYL.values() for x in tag[1:]): o.rotation_mode = 'XYZ'
for f in range(0, sc.frame_end + 1):
    t = f / FPS; a_ri, a_ro, a_bm = poses(t)
    key(ri, f, rotation_euler=(math.radians(a_ri), 0, 0)); key(ro, f, rotation_euler=(math.radians(a_ro), 0, 0)); key(boom, f, rotation_euler=(math.radians(a_bm), 0, 0))
    for tag, (base, att, phi) in cyl_pose(a_bm).items():
        sx, body, rod = CYL[tag]
        key(body, f, location=base, rotation_euler=(phi, 0, 0)); key(rod, f, location=att, rotation_euler=(phi, 0, 0))
for o in sc.objects:                                      # линейная интерполяция между отсчётами (кривые уже заданы функцией smooth)
    ad = o.animation_data
    if ad and ad.action:
        try:
            for fc in ad.action.fcurves: [setattr(kp, 'interpolation', 'LINEAR') for kp in fc.keyframe_points]
        except Exception:
            try:
                for lay in ad.action.layers:
                    for st in lay.strips:
                        for cb in st.channelbags:
                            for fc in cb.fcurves: [setattr(kp, 'interpolation', 'LINEAR') for kp in fc.keyframe_points]
            except Exception as e: print('интерполяция:', e)
log('анимация записана:', sc.frame_end, 'кадров')

# ── студия для превью
def studio(samples=48):
    sys.path.insert(0, SOWN + '/_инструменты')
    import gpu_setup
    sc.render.engine = 'CYCLES'; gpu_setup.use_gpu(sc); sc.cycles.samples = samples
    try: sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception: pass
    sc.render.film_transparent = False; sc.render.image_settings.color_mode = 'RGB'
    try: sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    except Exception: pass
    w = bpy.data.worlds.new('PK_world'); sc.world = w; w.use_nodes = True; wn = w.node_tree
    for n in list(wn.nodes): wn.nodes.remove(n)
    bg = wn.nodes.new('ShaderNodeBackground'); bg.inputs['Color'].default_value = (0.78, 0.82, 0.88, 1); bg.inputs['Strength'].default_value = 0.9
    wo = wn.nodes.new('ShaderNodeOutputWorld'); wn.links.new(bg.outputs['Background'], wo.inputs['Surface'])
    fm = bpy.data.materials.new('PK_floor'); fm.use_nodes = True; fp = next(n for n in fm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    fp.inputs['Base Color'].default_value = (0.20, 0.17, 0.12, 1); fp.inputs['Roughness'].default_value = 0.95
    me = bpy.data.meshes.new('PK_floor'); me.from_pydata([(-900, -900, 0), (900, -900, 0), (900, 900, 0), (-900, 900, 0)], [], [(0, 1, 2, 3)]); me.materials.append(fm)
    fo = bpy.data.objects.new('PK_floor', me); sc.collection.objects.link(fo)
    sd = bpy.data.lights.new('PK_sun', 'SUN'); sd.energy = 3.0; sd.angle = math.radians(3.0); so = bpy.data.objects.new('PK_sun', sd); sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(52), math.radians(8), math.radians(-38))
    cd = bpy.data.cameras.new('PK_cam'); cam = bpy.data.objects.new('PK_cam', cd); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = 45; cam.data.clip_start, cam.data.clip_end = 0.05, 200
    return cam


def shot(cam, name, tgt, d, dist, t, size=(1920, 1080)):
    sc.frame_set(int(round(t * FPS))); bpy.context.view_layer.update()
    dv = Vector(d).normalized(); cam.location = Vector(tgt) + dv * dist
    cam.rotation_euler = (Vector(tgt) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = size[0], size[1], 100
    sc.render.image_settings.file_format = 'PNG'; sc.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True, scene=sc.name); return name


def model_pts():
    """Все вершины модели в мировых координатах на текущем кадре (numpy) — кадр подбирается по самой модели, а не по её коробке (антенна и ракета раздували бы коробку)."""
    import numpy as np
    pts = []
    for o in sc.objects:
        if o.type != 'MESH' or o.name.startswith('PK_'): continue
        n = len(o.data.vertices)
        if not n: continue
        a = np.empty(n * 3, dtype=np.float32); o.data.vertices.foreach_get('co', a); a = a.reshape(n, 3)
        mw = np.array(o.matrix_world, dtype=np.float32); pts.append(a @ mw[:3, :3].T + mw[:3, 3])
    return np.vstack(pts)


def fit(dv, P, fill=0.80):
    """Цель и расстояние камеры (линза 45 мм, кадр 16:9), при которых модель занимает около fill кадра и стоит по центру; dv — направление от цели к камере, P — вершины модели (N × 3)."""
    import numpy as np
    dv = np.array(Vector(dv).normalized(), dtype=np.float64); fwd = -dv
    r = np.cross(fwd, [0.0, 0.0, 1.0]); r /= np.linalg.norm(r); u = np.cross(r, fwd)
    P = P.astype(np.float64); tx = 36.0 / (2 * 45.0); ty = tx * 9.0 / 16.0
    tgt = (P.min(axis=0) + P.max(axis=0)) / 2.0; d = 10.0
    for _ in range(4):
        lo, hi = 2.0, 120.0
        for _ in range(45):
            d = (lo + hi) / 2.0; rel = P - (tgt + dv * d); dep = rel @ fwd
            ok = dep.min() > 0.05 and (np.abs(rel @ r / dep).max() <= fill * tx) and (np.abs(rel @ u / dep).max() <= fill * ty)
            if ok: hi = d
            else: lo = d
        d = hi; rel = P - (tgt + dv * d); dep = rel @ fwd; xs = rel @ r / dep; ys = rel @ u / dep
        depth = ((P.min(axis=0) + P.max(axis=0)) / 2.0 - (tgt + dv * d)) @ fwd
        tgt = tgt + r * (((xs.max() + xs.min()) / 2.0) * depth) + u * (((ys.max() + ys.min()) / 2.0) * depth)
    return Vector(tgt.tolist()), d


def shot_fit(cam, name, dv, t, fill=0.80):
    sc.frame_set(int(round(t * FPS))); bpy.context.view_layer.update()
    tgt, dist = fit(dv, model_pts(), fill)
    return shot(cam, name, tgt, dv, dist, t)


cam = studio(24 if FAST else 64)
prev = []
PREV = (('превью_1_общий.png', None, (-0.65, -0.78, 0.38), 0.0), ('превью_2_створки.png', (0, -4.0, 1.0), (-0.62, -0.78, 0.40), 3.8),
        ('превью_3_подъём.png', None, (-0.95, -0.35, 0.30), 7.4), ('превью_4_боевое.png', None, (-0.78, -0.62, 0.28), 11.5),
        ('превью_5_хвост.png', (0, -3.6, 2.1), (0.55, -0.82, 0.42), 11.5), ('превью_6_ходовая.png', (1.2, 0.2, 0.55), (0.80, 0.45, 0.20), 0.0),
        ('превью_7_кабина.png', (-0.2, 2.2, 1.8), (-0.70, 0.62, 0.30), 0.0), ('превью_8_лоб.png', (0.1, 2.6, 1.35), (0.55, 0.80, 0.14), 0.0))
DIST = {'превью_2_створки.png': 9.5, 'превью_5_хвост.png': 11.0, 'превью_6_ходовая.png': 6.0, 'превью_7_кабина.png': 8.5, 'превью_8_лоб.png': 7.2}
for name, tgt, d, t in PREV[:int(os.environ.get('PK_PREV', '99'))]:
    prev.append(shot_fit(cam, name, d, t, 0.86) if tgt is None else shot(cam, name, tgt, d, DIST[name], t)); log('превью', name)

# ── экспорт Sketchfab
sc.frame_set(0)
for n in ('PK_floor', 'PK_sun', 'PK_cam'):
    o = bpy.data.objects.get(n)
    if o is not None: bpy.data.objects.remove(o, do_unlink=True)
vl = bpy.context.view_layer
for o in vl.objects: o.select_set(False)
sel = [o for o in sc.objects if o.type in ('MESH', 'EMPTY')]
for o in sel: o.select_set(True)
vl.objects.active = sel[0]
GLB = os.path.join(OUT, 'lance_pack_sketchfab.glb')
# НЕ оборачивать экспортёр в temp_override (в Blender 5.2.2 это роняет программу)
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_apply=False, export_yup=True, export_materials='EXPORT', export_image_format='JPEG', export_jpeg_quality=92,
                          export_cameras=False, export_lights=False, export_normals=True, export_animations=True, export_animation_mode='ACTIVE_ACTIONS', export_force_sampling=True)
log('записан', GLB, round(os.path.getsize(GLB) / 1e6, 1), 'МБ')
for o in vl.objects: o.select_set(False)                    # в .blend пакета ничего не выделено (иначе в окне оранжевые контуры)
sc.sync_mode = 'FRAME_DROP'                                   # не AUDIO_SYNC: при проигрывании шкалы (пробел) Blender 5.2 на macOS падает в CoreAudio (CAAssertRtn), если сцена синхронизируется со звуком
vl.objects.active = None
bpy.data.libraries.write(os.path.join(OUT, 'lance_pack.blend'), {sc}, fake_user=True)

# ── ролик (EEVEE): кадры по порядку + mp4
if os.environ.get('PK_VIDEO'):
    cam = studio(1)
    sc.render.engine = 'BLENDER_EEVEE'
    fr = os.path.join(OUT, '_кадры'); os.makedirs(fr, exist_ok=True)
    def orbit(t):
        ang = math.radians(-125 + 70 * (t / T_END)); return Vector((math.cos(ang), math.sin(ang), 0.30)).normalized()
    samples = []                                         # подбор кадра по секундам: цель и расстояние, дальше линейно между отсчётами
    for k in range(int(T_END) + 1):
        sc.frame_set(int(round(k * FPS))); bpy.context.view_layer.update(); samples.append(fit(orbit(float(k)), model_pts(), 0.80))
    for i in range(0, int(T_END * 24) + 1):
        t = i / 24.0; k = min(int(t), int(T_END) - 1); fr_ = t - k
        tgt = samples[k][0].lerp(samples[k + 1][0], fr_); dist = samples[k][1] * (1 - fr_) + samples[k + 1][1] * fr_
        sc.frame_set(int(round(t * FPS)))
        dv = orbit(t); cam.location = tgt + dv * dist; cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1280, 720, 100
        sc.render.filepath = os.path.join(fr, f'f{i:04d}.png'); bpy.ops.render.render(write_still=True, scene=sc.name)
    log('кадры ролика готовы')
    import subprocess, shutil
    ff = shutil.which('ffmpeg') or '/opt/homebrew/bin/ffmpeg'
    try:
        subprocess.run([ff, '-y', '-framerate', '24', '-i', os.path.join(fr, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', os.path.join(OUT, 'Lance_анимация.mp4')], check=True, capture_output=True)
        log('ролик собран: Lance_анимация.mp4')
    except Exception as e: print('ffmpeg:', e)
print('пакет готов:', OUT)
