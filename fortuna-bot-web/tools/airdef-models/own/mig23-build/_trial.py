# _trial.py - надевает пробную краску на МиГ-23БН, снимает кадры в Cycles и выгружает файлы для стенда. После build.py (MG_STAGE=4):
#   MG_MAPS=<папка карт> (по умолчанию _проба/su), MG_ONLY=начала имён кадров, MG_NOSHOTS=1 - только файлы, MG_SPP.
# Файл игры mig23.glb: всё кроме стоек; створки закрыты, гребень стоит, консоли сложены (72°, как в файле). Файл шасси mig23_gear.glb: стойки, открытые створки (копии door_*_g) и сложенный гребень (ventral_g);
# в игре при показе шасси из основного файла прячутся door_* и ventral (gearHide).
import os, sys, math, json
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import bpy
from mathutils import Vector, Matrix
import modelkit as mk, uv_mg
import mg_geo as g, mg_gear as gr
MAPS = os.environ.get('MG_MAPS', os.path.join(HERE, '_проба', 'su')); OUT = os.environ.get('MG_OUT', MAPS); os.makedirs(OUT, exist_ok=True)
sc = bpy.data.scenes['MG']; vl = bpy.context.view_layer; vl.update()
uv_mg.load(sc, os.path.join(HERE, '_проба', 'uv.npz'))
mp = bpy.data.materials.get('MG_paint') or bpy.data.materials.new('MG_paint'); mp.use_nodes = True; nt = mp.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
out = nt.nodes.new('ShaderNodeOutputMaterial'); pb = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(pb.outputs[0], out.inputs['Surface'])
def tex(name, cs):
    im = bpy.data.images.load(os.path.join(MAPS, name), check_existing=False); im.colorspace_settings.name = cs; im.pack(); t = nt.nodes.new('ShaderNodeTexImage'); t.image = im; return t
tc, to, tn = tex('mig23_color.png', 'sRGB'), tex('mig23_orm.png', 'Non-Color'), tex('mig23_normal.png', 'Non-Color')
sp = nt.nodes.new('ShaderNodeSeparateColor'); nm = nt.nodes.new('ShaderNodeNormalMap'); nm.space = 'TANGENT'; nm.uv_map = 'UVMap'
nt.links.new(tc.outputs['Color'], pb.inputs['Base Color']); nt.links.new(to.outputs['Color'], sp.inputs[0]); nt.links.new(sp.outputs[1], pb.inputs['Roughness']); nt.links.new(sp.outputs[2], pb.inputs['Metallic'])
nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], pb.inputs['Normal'])
for o in sc.objects:
    if o.type != 'MESH': continue
    for i, m in enumerate(o.data.materials):
        if m is not None and m.name != 'MG_glass': o.data.materials[i] = mp
gm = bpy.data.materials['MG_glass']; pg = next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pg.inputs['Base Color'].default_value = (0.30, 0.36, 0.40, 1); pg.inputs['Alpha'].default_value = 0.22; gm.surface_render_method = 'BLENDED'


def pose(n, deg):
    o = bpy.data.objects.get(n)
    if o is None or n not in g.PARTS: return
    D = g.PARTS[n]; T = D['pivot']; o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world
def sweep_to(deg):
    for sx, n_ in ((1, 'wing_r'), (-1, 'wing_l')):
        o = bpy.data.objects[n_]; cur = o.get('dl', g.D_FILE); g.pose_wing(o, deg - cur, sx); o['dl'] = deg
    vl.update()
Y = lambda a: g.L / 2 - a
FILE_SW = float(os.environ.get('MG_SWEEP', g.D_FILE))                          # положение консолей в собранной сцене и в файле игры (0 - 16°, разложены)
for n_ in ('wing_r', 'wing_l'): bpy.data.objects[n_]['dl'] = FILE_SW
if not os.environ.get('MG_NOSHOTS'):
    sys.path.insert(0, os.path.join(HERE, '..', '_инструменты')); import gpu_setup; print(gpu_setup.use_gpu(sc))
    if os.environ.get('MG_CPU'): sc.cycles.device = 'CPU'; print('процессор')
    sc.render.engine = 'CYCLES'; sc.cycles.samples = int(os.environ.get('MG_SPP', '64')); sc.cycles.use_denoising = True; sc.cycles.denoising_input_passes = 'RGB'; sc.cycles.max_bounces = 6
    w = bpy.data.worlds.get('v_w') or bpy.data.worlds.new('v_w'); sc.world = w; w.use_nodes = True; nw = w.node_tree
    for n in list(nw.nodes): nw.nodes.remove(n)
    ou = nw.nodes.new('ShaderNodeOutputWorld'); bg = nw.nodes.new('ShaderNodeBackground'); nw.links.new(bg.outputs[0], ou.inputs['Surface'])
    tc_ = nw.nodes.new('ShaderNodeTexCoord'); sx_ = nw.nodes.new('ShaderNodeSeparateXYZ'); nw.links.new(tc_.outputs['Generated'], sx_.inputs[0]); rp = nw.nodes.new('ShaderNodeValToRGB'); mr = nw.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = -1; mr.inputs['From Max'].default_value = 1; nw.links.new(sx_.outputs['Z'], mr.inputs['Value']); nw.links.new(mr.outputs[0], rp.inputs['Fac'])
    cr = rp.color_ramp; cr.elements[0].position = 0.47; cr.elements[1].position = 0.53
    cr.elements[0].color = (0.20, 0.19, 0.16, 1); cr.elements[1].color = (0.82, 0.86, 0.92, 1); e3 = cr.elements.new(0.95); e3.color = (0.30, 0.46, 0.78, 1); nw.links.new(rp.outputs[0], bg.inputs['Color']); bg.inputs['Strength'].default_value = 0.62
    sd = bpy.data.lights.get('v_sun') or bpy.data.lights.new('v_sun', 'SUN'); so = bpy.data.objects.get('v_sun') or bpy.data.objects.new('v_sun', sd)
    if so.name not in sc.collection.objects: sc.collection.objects.link(so)
    sd.energy = 2.3; sd.angle = math.radians(2); sd.color = (1, 0.97, 0.92); so.rotation_euler = (math.radians(50), math.radians(8), math.radians(-38))
    try: sc.view_settings.view_transform = 'Standard'
    except Exception: pass
    cd = bpy.data.cameras.get('v_cam') or bpy.data.cameras.new('v_cam'); cam = bpy.data.objects.get('v_cam') or bpy.data.objects.new('v_cam', cd)
    if cam.name not in sc.collection.objects: sc.collection.objects.link(cam)
    sc.camera = cam; cd.clip_start, cd.clip_end = 0.05, 300; sc.render.film_transparent = False; sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 90
    ONLY = [q for q in os.environ.get('MG_ONLY', '').split(',') if q]
    def shot(name, tgt, d, dist, lens=50, wd=1600, h=1000):
        if ONLY and not any(name.startswith(q) for q in ONLY): return
        dv = Vector(d).normalized(); cam.location = Vector(tgt) + dv * dist; cam.rotation_euler = (Vector(tgt) - cam.location).to_track_quat('-Z', 'Y').to_euler(); cd.type = 'PERSP'; cd.lens = lens; cd.sensor_width = 36
        sc.render.resolution_x, sc.render.resolution_y = wd, h; sc.render.filepath = os.path.join(OUT, name); bpy.ops.render.render(write_still=True)
    GR = [o for o in sc.objects if o.name.startswith(('gear', 'door_'))]
    sweep_to(0.0)
    for o in GR: o.hide_render = True                                   # в полёте: стоек нет (створки - в основном файле, закрыты)
    for o in sc.objects:
        if o.name.startswith('door_'): o.hide_render = False
    shot('т_сверху.jpg', (0.0, 0.0, 0.0), (0.02, -0.02, 1.0), 23.0, lens=50, wd=1600, h=1300)
    shot('т_снизу.jpg', (0.0, 0.0, 0.0), (0.02, 0.02, -1.0), 23.0, lens=50, wd=1600, h=1300)
    shot('т_полёт.jpg', (0.0, 0.0, 0.0), (-0.48, 0.55, 0.42), 23.0)
    shot('т_крыло.jpg', (-3.6, Y(10.3), 0.5), (-0.25, 0.30, 0.92), 6.5)
    for o in GR: o.hide_render = False
    for n_, d_ in gr.POSE.items(): pose(n_, d_)
    vl.update()
    shot('т_34.jpg', (0.0, 1.0, -0.3), (-0.62, 0.65, 0.30), 22.0)
    shot('т_сбоку.jpg', (0.0, 0.3, -0.2), (-1.0, 0.02, 0.05), 25.0, lens=60, wd=2000, h=900)
    shot('т_сзади.jpg', (0.0, -1.0, 0.0), (0.62, -0.70, 0.28), 21.0)
    shot('т_нос.jpg', (0.0, Y(4.0), 0.1), (-0.62, 0.72, 0.25), 6.5)
    shot('т_хвост.jpg', (0.0, Y(14.3), 0.9), (-0.80, -0.48, 0.30), 6.5)
    shot('т_борт.jpg', (0.0, Y(9.0), 0.1), (-0.92, 0.25, 0.18), 6.0)
    shot('т_шасси.jpg', (1.0, Y(10.0), -1.0), (0.70, 0.62, -0.12), 5.0)
    for n_, d_ in gr.POSE.items(): pose(n_, -d_)
    sweep_to(FILE_SW)
# ── файлы игры ──
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update()
MAINPTS = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]
MN_M = [min(p[i] for p in MAINPTS) for i in range(3)]; MX_M = [max(p[i] for p in MAINPTS) for i in range(3)]
HID = [o for o in sc.objects if o.type == 'MESH' and (o.name.startswith('door_') or o.name == 'ventral')]       # файл для стенда в ангаре: без того, что в игре прячет gearHide
HCOL = {o.name: list(o.users_collection) for o in HID}
for o in HID:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update(); mk.export(os.path.join(OUT, 'mig23_hangar.glb'), None)
for o in HID:
    for c in HCOL[o.name]: c.objects.link(o)
vl.update()
mk.export(os.path.join(OUT, 'mig23.glb'), None); print('файл', os.path.getsize(os.path.join(OUT, 'mig23.glb')) // 1024, 'КБ', 'треугольников', sum(len(p.vertices) - 2 for o in sc.objects if o.type == 'MESH' for p in o.data.polygons))
# файл шасси: стойки + копии створок в открытом положении + копия гребня сложенная
COPIES = []
for n_ in list(gr.POSE):
    o = bpy.data.objects.get(n_)
    if o is None: continue
    c = o.copy(); c.data = o.data; c.name = n_ + '_g'; c.parent = None; c.matrix_world = o.matrix_world.copy(); COLS[GEAR[0].name][0].objects.link(c); COPIES.append(c)
    D = g.PARTS[n_]; T = D['pivot']; c.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(gr.POSE[n_]), 4, D['axis']) @ Matrix.Translation(-T) @ c.matrix_world
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR and q not in COPIES]:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update()
GP = [o.matrix_world @ v.co for o in GEAR + COPIES for v in o.data.vertices]; mn_g = min(p.z for p in GP)
top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
print('метки шасси на высоте', round(top_, 3), 'самолёт', [round(v, 3) for v in MN_M], [round(v, 3) for v in MX_M], 'низ колёс', round(mn_g, 3))
vl.update(); mk.export(os.path.join(OUT, 'mig23_gear.glb'), None); print('файл шасси', os.path.getsize(os.path.join(OUT, 'mig23_gear.glb')) // 1024, 'КБ', 'части', sorted(o.name for o in GEAR + COPIES))
# точки для стенда: оси игры после prepare.js (центр по габаритам файла игры): x, z - cy, -(y - cb)
cy = (MN_M[2] + MX_M[2]) / 2; cb = (MN_M[1] + MX_M[1]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-(v.y - cb), 3)]
ST = {k: GG(v) for k, v in g.STATIONS.items()}
piv = {n_: [GG(g.PARTS[n_]['pivot']), [0, 1, 0]] for n_ in ('wing_r', 'wing_l')}                                # как у B-1B: ось вверх, вперёд - wing_r плюс, wing_l минус
P = dict(stations=[ST['st0_l'], ST['st1_l']], pod=ST['center'], nozzles=[GG(g.P3(g.A_TAIL + 0.30, 0.0, 0.0))], nr=round(g.NOZ_R - 0.07, 3), gear_bottom=round(mn_g - cy, 3), pivots=piv, sweep={'wing_r': FILE_SW, 'wing_l': -FILE_SW})
json.dump(P, open(os.path.join(OUT, 'точки.json'), 'w', encoding='utf-8'), ensure_ascii=False); print('точки', P)
