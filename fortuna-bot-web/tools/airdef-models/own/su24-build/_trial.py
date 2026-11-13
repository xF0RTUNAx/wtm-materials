# _trial.py - надевает пробную краску на Су-24М (из _trial.py МиГ-23БН) и снимает кадры в Cycles. После build.py (SU_STAGE=4):
#   SU_MAPS=<папка карт> (по умолчанию _проба/su), SU_ONLY=начала имён кадров, SU_NOSHOTS=1 - только файлы, SU_SPP.
# Кадры в полёте и сверху - консоли разложены (16°, знаки в центре площади), с шасси - сложены, как в файле (69°). Файлы игры пишет финальный прогон.
import os, sys, math, json
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import bpy
from mathutils import Vector, Matrix
import modelkit as mk, uv_su
import su_geo as g, su_gear as gr
MAPS = os.environ.get('SU_MAPS', os.path.join(HERE, '_проба', 'su')); OUT = os.environ.get('SU_OUT', MAPS); os.makedirs(OUT, exist_ok=True)
sc = bpy.data.scenes['SU']; vl = bpy.context.view_layer; vl.update()
uv_su.load(sc, os.path.join(HERE, '_проба', 'uv.npz'))
mp = bpy.data.materials.get('SU_paint') or bpy.data.materials.new('SU_paint'); mp.use_nodes = True; nt = mp.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
out = nt.nodes.new('ShaderNodeOutputMaterial'); pb = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(pb.outputs[0], out.inputs['Surface'])
def tex(name, cs):
    im = bpy.data.images.load(os.path.join(MAPS, name), check_existing=False); im.colorspace_settings.name = cs; im.pack(); t = nt.nodes.new('ShaderNodeTexImage'); t.image = im; return t
tc, to, tn = tex('su24_color.png', 'sRGB'), tex('su24_orm.png', 'Non-Color'), tex('su24_normal.png', 'Non-Color')
sp = nt.nodes.new('ShaderNodeSeparateColor'); nm = nt.nodes.new('ShaderNodeNormalMap'); nm.space = 'TANGENT'; nm.uv_map = 'UVMap'
nt.links.new(tc.outputs['Color'], pb.inputs['Base Color']); nt.links.new(to.outputs['Color'], sp.inputs[0]); nt.links.new(sp.outputs[1], pb.inputs['Roughness']); nt.links.new(sp.outputs[2], pb.inputs['Metallic'])
nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], pb.inputs['Normal'])
for o in sc.objects:
    if o.type != 'MESH': continue
    for i, m in enumerate(o.data.materials):
        if m is not None and m.name != 'SU_glass': o.data.materials[i] = mp
gm = bpy.data.materials['SU_glass']; pg = next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pg.inputs['Base Color'].default_value = (0.30, 0.36, 0.40, 1); pg.inputs['Alpha'].default_value = 0.22; gm.surface_render_method = 'BLENDED'


def pose(n, deg):
    o = bpy.data.objects.get(n)
    if o is None or n not in g.PARTS: return
    D = g.PARTS[n]; T = D['pivot']; o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world
def sweep_to(deg):
    for sx, n_ in ((1, 'wing_r'), (-1, 'wing_l')):
        o = bpy.data.objects[n_]; cur = o.get('dl', g.D_FILE); g.pose_wing(o, deg - cur, sx); o['dl'] = deg
        p_ = bpy.data.objects.get('pyl_w_' + n_[-1])                          # поворотный пилон остаётся по потоку
        if p_ is not None: vl.update(); T = p_.matrix_world.translation.copy(); p_.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(-(deg - cur)), 4, Vector((0, 0, -sx))) @ Matrix.Translation(-T) @ p_.matrix_world
    vl.update()
Y = lambda a: g.L / 2 - a
FILE_SW = float(os.environ.get('SU_SWEEP', g.D_FILE))                          # положение консолей в собранной сцене и в файле игры (0 - 16°, разложены)
for n_ in ('wing_r', 'wing_l'): bpy.data.objects[n_]['dl'] = FILE_SW
if not os.environ.get('SU_NOSHOTS'):
    sys.path.insert(0, os.path.join(HERE, '..', '_инструменты')); import gpu_setup; print(gpu_setup.use_gpu(sc))
    if os.environ.get('SU_CPU'): sc.cycles.device = 'CPU'; print('процессор')
    sc.render.engine = 'CYCLES'; sc.cycles.samples = int(os.environ.get('SU_SPP', '64')); sc.cycles.use_denoising = True; sc.cycles.denoising_input_passes = 'RGB'; sc.cycles.max_bounces = 6
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
    ONLY = [q for q in os.environ.get('SU_ONLY', '').split(',') if q]
    def shot(name, tgt, d, dist, lens=50, wd=1600, h=1000):
        if ONLY and not any(name.startswith(q) for q in ONLY): return
        dv = Vector(d).normalized(); cam.location = Vector(tgt) + dv * dist; cam.rotation_euler = (Vector(tgt) - cam.location).to_track_quat('-Z', 'Y').to_euler(); cd.type = 'PERSP'; cd.lens = lens; cd.sensor_width = 36
        sc.render.resolution_x, sc.render.resolution_y = wd, h; sc.render.filepath = os.path.join(OUT, name); bpy.ops.render.render(write_still=True)
    GR = [o for o in sc.objects if o.name.startswith(('gear', 'door_'))]
    sweep_to(0.0)
    for o in GR: o.hide_render = True                                   # в полёте: стоек нет (створки - в основном файле, закрыты)
    for o in sc.objects:
        if o.name.startswith('door_'): o.hide_render = False
    shot('т_сверху.jpg', (0.0, 0.0, 0.0), (0.02, -0.02, 1.0), 31.0, lens=50, wd=1600, h=1300)
    shot('т_снизу.jpg', (0.0, 0.0, 0.0), (0.02, 0.02, -1.0), 31.0, lens=50, wd=1600, h=1300)
    shot('т_полёт.jpg', (0.0, 0.0, 0.0), (-0.48, 0.55, 0.42), 30.0)
    shot('т_крыло.jpg', (-5.4, Y(14.5), 0.6), (-0.25, 0.30, 0.92), 8.5)
    sweep_to(FILE_SW)
    for o in GR: o.hide_render = False
    for n_, d_ in gr.POSE.items(): pose(n_, d_)
    vl.update()
    shot('т_34.jpg', (0.0, 1.0, -0.3), (-0.62, 0.65, 0.30), 29.0)
    shot('т_сбоку.jpg', (0.0, 0.3, -0.2), (-1.0, 0.02, 0.05), 33.0, lens=60, wd=2000, h=900)
    shot('т_сзади.jpg', (0.0, -1.0, 0.0), (0.62, -0.70, 0.28), 28.0)
    shot('т_нос.jpg', (0.0, Y(5.5), 0.3), (-0.62, 0.72, 0.25), 8.5)
    shot('т_хвост.jpg', (0.0, Y(19.5), 1.6), (-0.80, -0.48, 0.30), 8.5)
    shot('т_борт.jpg', (0.0, Y(9.5), 0.3), (-0.92, 0.25, 0.18), 8.0)
    shot('т_шасси.jpg', (1.2, Y(12.8), -1.2), (0.70, 0.62, -0.12), 6.0)
    for n_, d_ in gr.POSE.items(): pose(n_, -d_)

# ── файлы игры ── (пишет deliver.py)
