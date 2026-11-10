# pack.py — общий пакет Sketchfab: пусковая M142 HIMARS (полные атласы 4096) + две ракеты ATACMS (Свои/ATACMS): одна в трубе контейнера, вторая на ложементах рядом,
#   рули раскрыты. Контейнер в пакете - под ATACMS (одна труба); GMLRS - только в игровом файле. Клипы (30 к/с, ключ на каждом кадре, кадр 0 = последний):
#   Raise 16 с - подъём пакета до 50° и обратно (цилиндры следят); Turn 16 с - подъём 20°, разворот ±90°, возврат; Launch 12 с - подъём 50°, крышка срывается,
#   ракета выходит из трубы, раскрывает рули и уходит; пакет опускается; Reload 10 с - подъём 45°, выдвижение стрелы и обратно; Drive 4 с - колёса и руль.
#   Blender -b --factory-startup --python pack.py      (PACK_PREV=0 - без превью)
import os, math, time, json, struct
import bpy
from mathutils import Vector, Matrix, Euler
os.environ['HIM_REUSE'] = '1'
HD = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/HIMARS'
os.environ.setdefault('HIM_OUT', os.path.join(HD, '_ультра'))
_p = os.path.join(HD, 'bake2.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
PK = os.path.join(HD, '_пакет'); os.makedirs(PK, exist_ok=True)
FPS = 30; S = SCALE_FIX

# ───────────── состав: без контейнера GMLRS ─────────────
def drop(o):
    for c in list(o.children_recursive): bpy.data.objects.remove(c, do_unlink=True)
    bpy.data.objects.remove(o, do_unlink=True)
drop(COL.objects['pod_gmlrs'])
for o in list(COL.objects):
    if o.name.startswith(('lid_fG', 'lid_rG', 'muzzle_G')): bpy.data.objects.remove(o, do_unlink=True)
for o in COL.objects: o.hide_render = o.hide_viewport = False
for o in COL.objects: o.rotation_mode = 'XYZ'


# ───────────── ракеты ─────────────
ATA = os.path.join(HD, '..', 'ATACMS'); _IMG = {}


def imp(tag):
    """ракета из ATACMS/atacms.blend (импорт glTF в Blender 5.2.2 падает на «Iridescence Factor»); атласы - из ATACMS/_ультра, уменьшены: корпус 2048, рули 1024"""
    with bpy.data.libraries.load(os.path.join(ATA, 'atacms.blend'), link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n in ('body', 'fin1', 'fin2', 'fin3', 'fin4')]
    new = [o for o in dst.objects if o]
    root = bpy.data.objects.new('ATACMS_' + tag, None); COL.objects.link(root); root.empty_display_size = 0.3
    for o in new:
        COL.objects.link(o); o.rotation_mode = 'XYZ'; o.name = f'atacms_{tag}_' + o.name.split('.')[0]
        if o.parent is None: o.parent = root
        for sl in o.material_slots:
            if not sl.material or not sl.material.node_tree: continue
            for nd in sl.material.node_tree.nodes:
                if nd.type != 'TEX_IMAGE' or not nd.image: continue
                fn = os.path.basename(nd.image.filepath)
                if fn not in _IMG:
                    im = bpy.data.images.load(os.path.join(ATA, '_ультра', fn), check_existing=False)
                    if '_color' not in fn: im.colorspace_settings.name = 'Non-Color'
                    sz = 2048 if fn.startswith('ata_B') else 1024
                    if '_normal' in fn or '_color' in fn: im.scale(sz, sz)
                    else: im.scale(sz // 2, sz // 2)
                    _IMG[fn] = im
                nd.image = _IMG[fn]
    fins = sorted([o for o in new if 'fin' in o.name], key=lambda o: o.name)
    return root, fins, {f: f.rotation_euler.copy() for f in fins}


pose(0.0, 0.0, 0.0); bpy.context.view_layer.update()
PA = COL.objects['pod_atacms']
M1, FINS1, FOLD1 = imp('tube')
tube_c = Vector((0.0, (CT['y0'] + CT['y1']) / 2 * S, TUBE_Z * S))
M1.parent = PA; M1.matrix_world = Matrix.Translation(tube_c); REST_M1 = M1.matrix_basis.copy()
M2, FINS2, FOLD2 = imp('stand')
M2.matrix_world = Matrix.Translation(Vector((3.3, -0.8, 0.64)))
for f in FINS2: f.rotation_euler = Euler((0.0, 0.0, 0.0))                                           # на ложементах - рули раскрыты
st_m = bpy.data.materials.new('STAND'); st_m.use_nodes = True; b_ = next(n for n in st_m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
b_.inputs['Base Color'].default_value = (0.08, 0.085, 0.07, 1); b_.inputs['Roughness'].default_value = 0.8
for k, yy in enumerate((-1.9, 0.6)):                                                               # ложементы
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(3.3, -0.8 + yy, 0.17)); st = bpy.context.active_object; st.scale = (0.9, 0.28, 0.34); st.name = f'stand_{k}'
    st.data.materials.append(st_m); bpy.ops.object.transform_apply(scale=True)
    for o in list(st.users_collection): o.objects.unlink(st)
    COL.objects.link(st)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.33, depth=0.30, location=(3.3, -0.8 + yy, 0.64), rotation=(math.pi / 2, 0, 0)); sd = bpy.context.active_object; sd.name = f'stand_{k}_saddle'
    sd.data.materials.append(st_m)
    for o in list(sd.users_collection): o.objects.unlink(sd)
    COL.objects.link(sd)


# ───────────── время ─────────────
def sm(x): x = min(1.0, max(0.0, x)); return x * x * x * (x * (6 * x - 15) + 10)
def ease(t, a, b): return sm((t - a) / (b - a))


def st_raise(t): return dict(el=50 * (ease(t, 1, 7) - ease(t, 10, 16)))
def st_turn(t): return dict(el=20 * (ease(t, 0.5, 3) - ease(t, 13.5, 15.8)), turn=90 * ease(t, 3, 6.5) - 180 * ease(t, 7, 11) + 90 * ease(t, 11.5, 13.5))
def st_reload(t): return dict(el=45 * (ease(t, 0.3, 3.5) - ease(t, 8.0, 9.8)), boom=1.16 * (ease(t, 3.8, 5.6) - ease(t, 6.2, 7.8)))
def st_drive(t): return dict(spin=-2 * 2 * math.pi * t / 4.0, steer=20 * math.sin(2 * math.pi * t / 4.0))


def st_launch(t):
    d = dict(el=50 * (ease(t, 0.3, 4.5) - ease(t, 9.0, 11.6)))
    tl = t - 5.6                                                                                     # крышка срывается, ракета выходит
    d['lid'] = min(1.0, max(0.0, (t - 5.2) / 0.4)) if t < 11.8 else 0.0
    d['msl'] = 0.0 if tl < 0 or t >= 11.8 else 0.5 * 40.0 * tl * tl                                  # 40 м/с², ход вдоль трубы
    d['fins'] = ease(t, 6.15, 6.45) if t < 11.8 else 0.0
    d['msl_hide'] = 1 if 8.6 < t < 11.8 else 0
    return d


CLIPS = {'Raise': (16.0, st_raise), 'Turn': (16.0, st_turn), 'Launch': (12.0, st_launch), 'Reload': (10.0, st_reload), 'Drive': (4.0, st_drive)}
LID = COL.objects['lid_fA']; REST_LID = LID.matrix_basis.copy()
WH = [o for o in COL.objects if o.name.startswith('wheel_')]; STEER = [COL.objects['steer_l'], COL.objects['steer_r']]
ANIM = [TURN, POD, BOOM] + list(CYL) + [LID, M1] + FINS1 + WH + STEER


def apply_state(s):
    pose(s.get('el', 0.0), s.get('turn', 0.0), s.get('boom', 0.0), None, 0.0)
    for w in WH: w.rotation_euler = (s.get('spin', 0.0), 0.0, 0.0)
    for e in STEER: e.rotation_euler = (0.0, 0.0, math.radians(s.get('steer', 0.0)))
    k = s.get('lid', 0.0); LID.matrix_basis = Matrix.Translation(Vector((0, 0.35 * k, 0.25 * k * k))) @ REST_LID; LID.scale = (1 - k,) * 3 if k > 0 else (1, 1, 1)
    M1.matrix_basis = Matrix.Translation(Vector((0, s.get('msl', 0.0), 0))) @ REST_M1; M1.scale = (0.0,) * 3 if s.get('msl_hide') else (1.0,) * 3
    fo = s.get('fins', 0.0)
    for f in FINS1: f.rotation_euler = Euler([v * (1 - fo) for v in FOLD1[f]])
    bpy.context.view_layer.update()


CH = {}
for clip, (dur, fn) in CLIPS.items():
    n = int(round(dur * FPS)); prev = {}
    for fr in range(n + 1):
        t = fr / FPS if fr < n else 0.0                                                             # последний кадр = первый (петля)
        apply_state(fn(t))
        for o in ANIM:
            loc, rot, scl = o.matrix_basis.decompose()
            e = rot.to_euler('XYZ', prev.get(o, Euler((0, 0, 0)))); prev[o] = e
            for path, vals in (('location', loc), ('rotation_euler', e), ('scale', scl)):
                for i in range(3): CH.setdefault(clip, {}).setdefault(o, {}).setdefault((path, i), []).append(float(vals[i]))
    log('клип', clip, n + 1, 'кадров')
apply_state({})

for clip in CLIPS:
    for ob, chans in CH[clip].items():
        if ob.animation_data is None: ob.animation_data_create()
        act = bpy.data.actions.new(f'{clip}|{ob.name}'); slot = act.slots.new('OBJECT', ob.name)
        ob.animation_data.action = act; ob.animation_data.action_slot = slot
        for (path, idx), vals in chans.items():
            fcv = act.fcurve_ensure_for_datablock(ob, path, index=idx); fcv.keyframe_points.add(len(vals))
            co = []
            for f, v in enumerate(vals): co += [float(f), v]
            fcv.keyframe_points.foreach_set('co', co)
            for kp in fcv.keyframe_points: kp.interpolation = 'LINEAR'
            fcv.update()
        tr = ob.animation_data.nla_tracks.new(); tr.name = clip; stp = tr.strips.new(clip, 0, act)
        try:
            if getattr(stp, 'action_slot', None) is None: stp.action_slot = slot
        except Exception as ex: print('слот:', ex)
        ob.animation_data.action = None
sc.frame_start, sc.frame_end = 0, int(16 * FPS); sc.frame_set(0); bpy.context.view_layer.update()

# ───────────── экспорт ─────────────
for _n in ('Cube', 'Light', 'Camera'):
    if _n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[_n], do_unlink=True)
sel = [o for o in COL.objects if o.type in ('MESH', 'EMPTY')]
for o in bpy.context.view_layer.objects: o.select_set(False)
for o in sel: o.select_set(True)
bpy.context.view_layer.objects.active = sel[0]
GLB = os.path.join(HD, 'l_himars_sketchfab.glb')
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_apply=False, export_yup=True, export_materials='EXPORT', export_image_format='JPEG',
                          export_jpeg_quality=88, export_cameras=False, export_lights=False, export_normals=True, export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_force_sampling=True)
log('пакет:', GLB, round(os.path.getsize(GLB) / 1e6, 1), 'МБ')
with open(GLB, 'rb') as fh:
    fh.read(12); ln, tp = struct.unpack('<II', fh.read(8)); js = json.loads(fh.read(ln))
rep = dict(mb=round(os.path.getsize(GLB) / 1e6, 1), nodes=len(js['nodes']), images=len(js.get('images', [])),
           animations={a['name']: len(a['channels']) for a in js.get('animations', [])})
json.dump(rep, open(os.path.join(PK, 'pack_glb_report.json'), 'w'), ensure_ascii=False, indent=1)
log('в файле:', rep)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(PK, 'himars_pack.blend'), copy=True)

# ───────────── превью пакета (Cycles) ─────────────
if os.environ.get('PACK_PREV', '1') == '1':
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 64; sc.cycles.use_denoising = True; sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.exposure = -0.9
    w = bpy.data.worlds.new('P_world'); sc.world = w; w.use_nodes = True; nt = w.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    sky = nt.nodes.new('ShaderNodeTexSky'); bg = nt.nodes.new('ShaderNodeBackground'); o_ = nt.nodes.new('ShaderNodeOutputWorld')
    try: sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(35); sky.sun_rotation = math.radians(140); sky.air_density = 1.2; sky.dust_density = 1.5
    except Exception: pass
    bg.inputs[1].default_value = 0.22; nt.links.new(sky.outputs[0], bg.inputs[0]); nt.links.new(bg.outputs[0], o_.inputs[0])
    ld = bpy.data.lights.new('P_sun', 'SUN'); ld.energy = 2.6; ld.angle = math.radians(2.0); ld.color = (1.0, 0.96, 0.90)
    sun = bpy.data.objects.new('P_sun', ld); sc.collection.objects.link(sun); sun.rotation_euler = (math.radians(50), math.radians(8), math.radians(140))
    gm = bpy.data.meshes.new('P_ground'); s_ = 600.0; gm.from_pydata([(-s_, -s_, 0), (s_, -s_, 0), (s_, s_, 0), (-s_, s_, 0)], [], [(0, 1, 2, 3)]); gr = bpy.data.objects.new('P_ground', gm); sc.collection.objects.link(gr)
    gmat = bpy.data.materials.new('P_ground'); gmat.use_nodes = True; g_ = next(n for n in gmat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); g_.inputs['Base Color'].default_value = (0.10, 0.095, 0.075, 1); g_.inputs['Roughness'].default_value = 0.95; gm.materials.append(gmat)
    cam = bpy.data.objects.new('P_cam', bpy.data.cameras.new('P_cam')); sc.collection.objects.link(cam); cam.data.lens = 40; sc.camera = cam
    for o in COL.objects:
        if o.animation_data:
            for tr in o.animation_data.nla_tracks: tr.mute = True
    shots = [('пакет_1_ракета_на_ложементах', 35, 10, 13, (1.5, -0.5, 1.3), dict()), ('пакет_2_пуск', -60, 8, 24, (0, 2.0, 4.0), st_launch(6.25)),
             ('пакет_3_стрела', -140, 16, 15, (0, -1.0, 3.0), st_reload(6.0)), ('пакет_4_разворот', -40, 12, 17, (0, -0.5, 2.5), st_turn(5.5))]
    for name, az, el, dist, at, stt in shots:
        apply_state(stt); a, e = math.radians(az), math.radians(el); d = Vector((math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)))
        cam.location = Vector(at) + d * dist; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler(); bpy.context.view_layer.update()
        sc.render.filepath = os.path.join(HD, name + '.png'); bpy.ops.render.render(write_still=True); log('превью', name)
log('pack.py: готово')
