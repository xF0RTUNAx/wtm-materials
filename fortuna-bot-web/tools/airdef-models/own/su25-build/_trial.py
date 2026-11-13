# _trial.py - надевает пробную краску на Су-25, снимает крупные планы в Cycles и выгружает файлы для стенда (su.glb без шасси, su_gear.glb). После build.py: S25_MAPS=<папка карт> (по умолчанию _проба), S25_ONLY=список снимков, S25_NOSHOTS=1 - только файлы.
import os, sys, math
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import bpy
from mathutils import Vector, Matrix
import modelkit as mk, uv_su
import su_geo as g, su_detail as dt
MAPS = os.environ.get('S25_MAPS', os.path.join(HERE, '_проба')); OUT = os.environ.get('S25_OUT', MAPS); os.makedirs(OUT, exist_ok=True)
sc = bpy.data.scenes['S25']; vl = bpy.context.view_layer; vl.update()
uv_su.load(sc, os.path.join(HERE, '_проба', 'uv.npz'))
mp = bpy.data.materials.get('S25_paint') or bpy.data.materials.new('S25_paint'); mp.use_nodes = True; nt = mp.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
out = nt.nodes.new('ShaderNodeOutputMaterial'); pb = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(pb.outputs[0], out.inputs['Surface'])
def tex(name, cs):
    im = bpy.data.images.load(os.path.join(MAPS, name), check_existing=False); im.colorspace_settings.name = cs; im.pack(); t = nt.nodes.new('ShaderNodeTexImage'); t.image = im; return t
tc, to, tn = tex('su_color.png', 'sRGB'), tex('su_orm.png', 'Non-Color'), tex('su_normal.png', 'Non-Color')
sp = nt.nodes.new('ShaderNodeSeparateColor'); nm = nt.nodes.new('ShaderNodeNormalMap'); nm.space = 'TANGENT'; nm.uv_map = 'UVMap'
nt.links.new(tc.outputs['Color'], pb.inputs['Base Color']); nt.links.new(to.outputs['Color'], sp.inputs[0]); nt.links.new(sp.outputs[1], pb.inputs['Roughness']); nt.links.new(sp.outputs[2], pb.inputs['Metallic'])
nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], pb.inputs['Normal'])
for o in sc.objects:
    if o.type != 'MESH': continue
    for i, m in enumerate(o.data.materials):
        if m is not None and m.name not in ('S25_glass', 'S25G_glass'): o.data.materials[i] = mp
gm = bpy.data.materials['S25_glass']; gm.name = 'S25G_glass'; pg = next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pg.inputs['Base Color'].default_value = (0.62, 0.68, 0.72, 1); pg.inputs['Alpha'].default_value = 0.22; gm.surface_render_method = 'BLENDED'
if not os.environ.get('S25_NOSHOTS'):
    sys.path.insert(0, os.path.join(HERE, '..', '_инструменты')); import gpu_setup; print(gpu_setup.use_gpu(sc))
    sc.render.engine = 'CYCLES'; sc.cycles.samples = int(os.environ.get('S25_SPP', '64')); sc.cycles.use_denoising = True; sc.cycles.denoising_input_passes = 'RGB'; sc.cycles.max_bounces = 6
    w = bpy.data.worlds.get('v_w') or bpy.data.worlds.new('v_w'); sc.world = w; w.use_nodes = True; nw = w.node_tree
    for n in list(nw.nodes): nw.nodes.remove(n)
    ou = nw.nodes.new('ShaderNodeOutputWorld'); bg = nw.nodes.new('ShaderNodeBackground'); nw.links.new(bg.outputs[0], ou.inputs['Surface'])
    SK = os.environ.get('S25_SKY', 'day')
    # небо-градиент: светлый горизонт, голубой зенит, земля снизу; чтобы отражения было видно
    tc_ = nw.nodes.new('ShaderNodeTexCoord'); sx = nw.nodes.new('ShaderNodeSeparateXYZ'); nw.links.new(tc_.outputs['Generated'], sx.inputs[0]); rp = nw.nodes.new('ShaderNodeValToRGB'); mr = nw.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = -1; mr.inputs['From Max'].default_value = 1; nw.links.new(sx.outputs['Z'], mr.inputs['Value']); nw.links.new(mr.outputs[0], rp.inputs['Fac'])
    cr = rp.color_ramp; cr.elements[0].position = 0.47; cr.elements[1].position = 0.53
    GND, HOR, ZEN = ((0.20, 0.19, 0.16, 1), (0.82, 0.86, 0.92, 1), (0.30, 0.46, 0.78, 1)) if SK == 'day' else ((0.10, 0.08, 0.07, 1), (0.95, 0.60, 0.34, 1), (0.16, 0.20, 0.38, 1))
    cr.elements[0].color = GND; cr.elements[1].color = HOR; e3 = cr.elements.new(0.95); e3.color = ZEN; nw.links.new(rp.outputs[0], bg.inputs['Color']); bg.inputs['Strength'].default_value = 0.62 if SK == 'day' else 0.55
    sd = bpy.data.lights.get('v_sun') or bpy.data.lights.new('v_sun', 'SUN'); so = bpy.data.objects.get('v_sun') or bpy.data.objects.new('v_sun', sd)
    if so.name not in sc.collection.objects: sc.collection.objects.link(so)
    sd.energy = 2.3 if SK == 'day' else 1.8; sd.angle = math.radians(2); sd.color = (1, 0.97, 0.92) if SK == 'day' else (1, 0.66, 0.40); so.rotation_euler = (math.radians(50), math.radians(8), math.radians(-38)) if SK == 'day' else (math.radians(82), 0, math.radians(-60))
    try: sc.view_settings.view_transform = 'Standard'
    except Exception: pass
    cd = bpy.data.cameras.get('v_cam') or bpy.data.cameras.new('v_cam'); cam = bpy.data.objects.get('v_cam') or bpy.data.objects.new('v_cam', cd)
    if cam.name not in sc.collection.objects: sc.collection.objects.link(cam)
    sc.camera = cam; cd.clip_start, cd.clip_end = 0.1, 300; sc.render.film_transparent = False; sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 90
    ONLY = [q for q in os.environ.get('S25_ONLY', '').split(',') if q]
    def shot(name, tgt, d, dist, lens=50, wd=1600, h=1000):
        if ONLY and not any(name.startswith(q) for q in ONLY): return
        dv = Vector(d).normalized(); cam.location = Vector(tgt) + dv * dist; cam.rotation_euler = (Vector(tgt) - cam.location).to_track_quat('-Z', 'Y').to_euler(); cd.type = 'PERSP'; cd.lens = lens; cd.sensor_width = 36
        sc.render.resolution_x, sc.render.resolution_y = wd, h; sc.render.filepath = os.path.join(OUT, name); bpy.ops.render.render(write_still=True)
    vl.update()
    Y = lambda a_: 7.765 - a_
    shot('т_общий.jpg', (0.0, -0.3, 0.1), (-0.55, 0.62, 0.40), 21.0)
    shot('т_как_05.jpg', (0.0, -0.2, -0.2), (-1.0, 0.0, 0.03), 46.0, lens=135)
    shot('т_как_08.jpg', (0.0, -0.2, 0.0), (0.30, 0.35, -0.88), 20.0)
    shot('т_сверху.jpg', (0.0, 0.0, 0.2), (0.03, -0.03, 1.0), 21.0)
    shot('т_сзади.jpg', (0.0, -1.0, 0.4), (0.55, -0.72, 0.30), 19.0)
    shot('т_нос.jpg', (0.0, Y(2.8), 0.2), (-0.60, 0.65, 0.40), 5.0)
    shot('т_пвд.jpg', (0.0, Y(1.3), 0.05), (0.75, 0.55, 0.30), 3.6)
    shot('т_окно.jpg', (0.0, Y(1.3), -0.05), (0.15, 1.0, 0.05), 2.4)
    shot('т_кабина.jpg', (0.0, Y(4.3), 0.9), (0.70, 0.45, 0.55), 4.2)
    shot('т_заборник.jpg', (1.0, Y(6.3), 0.2), (0.55, 0.80, 0.12), 4.2)
    shot('т_хвост.jpg', (0.0, Y(13.2), 1.3), (0.65, -0.62, 0.38), 6.5)
    shot('т_крыло.jpg', (3.5, Y(8.8), 0.7), (0.25, -0.45, 0.86), 7.5)
    shot('т_низ.jpg', (1.0, Y(8.5), -0.5), (0.30, 0.25, -0.92), 8.5)
    shot('т_шасси.jpg', (1.25, Y(9.0), -1.0), (0.55, 0.83, 0.06), 3.6)
# файл для игры: шасси нет, створки закрыты
GEAR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('gear')]
print('скрыто шасси:', [o.name for o in GEAR])
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
mk.export(os.path.join(OUT, 'su.glb'), None); print('файл', os.path.getsize(os.path.join(OUT, 'su.glb')) // 1024, 'КБ')
MAINPTS = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' and o not in GEAR for v in o.data.vertices]
MN_M = [min(p[i] for p in MAINPTS) for i in range(3)]; MX_M = [max(p[i] for p in MAINPTS) for i in range(3)]
import json
cy_ = (MN_M[2] + MX_M[2]) / 2; ym_ = (MN_M[1] + MX_M[1]) / 2; GG_ = lambda v: [round(v.x, 3), round(v.z - cy_, 3), round(-(v.y - ym_), 3)]     # prepare.js центрует по длине и высоте (ПВД сдвигает середину)
ST_ = {k: GG_(v) for k, v in g.STATIONS.items()}
json.dump(dict(stations=ST_, nozzles=[GG_(g.P3(g.NAC_A1 + 0.135, sx * g.NT[0](g.NAC_A1), g.NT[1](g.NAC_A1))) for sx in (1, -1)], nr=g.NZ_R - 0.03), open(os.path.join(OUT, 'точки.json'), 'w', encoding='utf-8'), ensure_ascii=False); print('точки', ST_)
# файл шасси для ангара (e_f5_gear): стойки, колёса и открытые створки носовой ниши; оси те же; ниже колёс ничего нет
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP)
# prepare.js центрует каждый файл по габаритам. Две метки по 1 мм дают шасси те же центр по длине и высоте, что у самолёта, и оси совпадают; самая нижняя точка остаётся на колёсах
top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_); print('метки шасси на высоте', round(top_, 3), 'самолёт', [round(v, 3) for v in MN_M], [round(v, 3) for v in MX_M], 'низ колёс', round(mn_g, 3))
vl.update(); mk.export(os.path.join(OUT, 'su_gear.glb'), None); print('файл шасси', os.path.getsize(os.path.join(OUT, 'su_gear.glb')) // 1024, 'КБ')
