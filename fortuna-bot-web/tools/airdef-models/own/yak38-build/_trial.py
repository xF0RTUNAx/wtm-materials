# _trial.py - надевает пробную краску на Як-38М (по _trial.py Ту-22), снимает виды как на фото и крупные планы в Cycles, выгружает файлы для стенда. После build.py (YK_STAGE=4):
#   YK_MAPS=<папка карт>, YK_OUT=<папка кадров и файлов>, YK_ONLY=начала имён снимков, YK_NOSHOTS=1 - только файлы, YK_SKY=day|evening.
# Файл игры: без стоек и без открытых створок шасси, закрытые створки ниш остаются (их прячет gearHide). Файл шасси: стойки и открытые створки, две метки по 1 мм (тот же центр prepare.js).
import os, sys, math, json
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import bpy
from mathutils import Vector, Matrix
import modelkit as mk, uv_yak
import yak_geo as g
MAPS = os.environ.get('YK_MAPS', os.path.join(HERE, '_проба', 'grey')); OUT = os.environ.get('YK_OUT', MAPS); os.makedirs(OUT, exist_ok=True)
sc = bpy.data.scenes['YK']; vl = bpy.context.view_layer; vl.update()
uv_yak.load(sc, os.path.join(HERE, '_проба', 'uv.npz'))
mp = bpy.data.materials.get('YK_paint') or bpy.data.materials.new('YK_paint'); mp.use_nodes = True; nt = mp.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
out = nt.nodes.new('ShaderNodeOutputMaterial'); pb = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(pb.outputs[0], out.inputs['Surface'])
def tex(name, cs):
    im = bpy.data.images.load(os.path.join(MAPS, name), check_existing=False); im.colorspace_settings.name = cs; im.pack(); t = nt.nodes.new('ShaderNodeTexImage'); t.image = im; return t
tc, to, tn = tex('yak38_color.png', 'sRGB'), tex('yak38_orm.png', 'Non-Color'), tex('yak38_normal.png', 'Non-Color')
sp = nt.nodes.new('ShaderNodeSeparateColor'); nm = nt.nodes.new('ShaderNodeNormalMap'); nm.space = 'TANGENT'; nm.uv_map = 'UVMap'
nt.links.new(tc.outputs['Color'], pb.inputs['Base Color']); nt.links.new(to.outputs['Color'], sp.inputs[0]); nt.links.new(sp.outputs[1], pb.inputs['Roughness']); nt.links.new(sp.outputs[2], pb.inputs['Metallic'])
nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], pb.inputs['Normal'])
for o in sc.objects:
    if o.type != 'MESH': continue
    for i, m in enumerate(o.data.materials):
        if m is not None and m.name != 'YK_glass': o.data.materials[i] = mp
gm = bpy.data.materials['YK_glass']; pg = next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); pg.inputs['Base Color'].default_value = (0.62, 0.66, 0.66, 1); pg.inputs['Alpha'].default_value = 0.24; pg.inputs['Roughness'].default_value = 0.08; gm.surface_render_method = 'BLENDED'
Y = lambda a: g.L / 2 - a
ONLY = [q for q in os.environ.get('YK_ONLY', '').split(',') if q]
if not os.environ.get('YK_NOSHOTS'):
    sys.path.insert(0, os.path.join(HERE, '..', '_инструменты')); import gpu_setup; print(gpu_setup.use_gpu(sc))
    sc.render.engine = 'CYCLES'; sc.cycles.samples = int(os.environ.get('YK_SPP', '64')); sc.cycles.use_denoising = True; sc.cycles.denoising_input_passes = 'RGB'; sc.cycles.max_bounces = 6
    w = bpy.data.worlds.get('v_w') or bpy.data.worlds.new('v_w'); sc.world = w; w.use_nodes = True; nw = w.node_tree
    for n in list(nw.nodes): nw.nodes.remove(n)
    ou = nw.nodes.new('ShaderNodeOutputWorld'); bg = nw.nodes.new('ShaderNodeBackground'); nw.links.new(bg.outputs[0], ou.inputs['Surface'])
    SK = os.environ.get('YK_SKY', 'day')
    tc_ = nw.nodes.new('ShaderNodeTexCoord'); sx = nw.nodes.new('ShaderNodeSeparateXYZ'); nw.links.new(tc_.outputs['Generated'], sx.inputs[0]); rp = nw.nodes.new('ShaderNodeValToRGB'); mr = nw.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = -1; mr.inputs['From Max'].default_value = 1; nw.links.new(sx.outputs['Z'], mr.inputs['Value']); nw.links.new(mr.outputs[0], rp.inputs['Fac'])
    cr = rp.color_ramp; cr.elements[0].position = 0.47; cr.elements[1].position = 0.53
    GND, HOR, ZEN = ((0.20, 0.19, 0.16, 1), (0.82, 0.86, 0.92, 1), (0.30, 0.46, 0.78, 1)) if SK == 'day' else ((0.10, 0.08, 0.07, 1), (0.95, 0.60, 0.34, 1), (0.16, 0.20, 0.38, 1))
    cr.elements[0].color = GND; cr.elements[1].color = HOR; e3 = cr.elements.new(0.95); e3.color = ZEN; nw.links.new(rp.outputs[0], bg.inputs['Color']); bg.inputs['Strength'].default_value = 0.62 if SK == 'day' else 0.55
    sd = bpy.data.lights.get('v_sun') or bpy.data.lights.new('v_sun', 'SUN'); so = bpy.data.objects.get('v_sun') or bpy.data.objects.new('v_sun', sd)
    if so.name not in sc.collection.objects: sc.collection.objects.link(so)
    sd.energy = 2.3 if SK == 'day' else 1.8; sd.angle = math.radians(2); sd.color = (1, 0.97, 0.92) if SK == 'day' else (1, 0.66, 0.40); so.rotation_euler = (math.radians(50), math.radians(8), math.radians(-38)) if SK == 'day' else (math.radians(82), 0, math.radians(-60))
    gp = bpy.data.meshes.new('v_ground'); S_ = 40; gp.from_pydata([(-S_, -S_, 0), (S_, -S_, 0), (S_, S_, 0), (-S_, S_, 0)], [], [(0, 1, 2, 3)]); go = bpy.data.objects.new('v_ground', gp); sc.collection.objects.link(go); go.location.z = g.GROUND_Z
    gmat = bpy.data.materials.new('v_gmat'); gmat.use_nodes = True; gq = next(n for n in gmat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); gq.inputs['Base Color'].default_value = (0.36, 0.35, 0.32, 1); gq.inputs['Roughness'].default_value = 0.9; gp.materials.append(gmat)
    try: sc.view_settings.view_transform = 'Standard'
    except Exception: pass
    cd = bpy.data.cameras.get('v_cam') or bpy.data.cameras.new('v_cam'); cam = bpy.data.objects.get('v_cam') or bpy.data.objects.new('v_cam', cd)
    if cam.name not in sc.collection.objects: sc.collection.objects.link(cam)
    sc.camera = cam; cd.clip_start, cd.clip_end = 0.02, 200; sc.render.film_transparent = False; sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 90
    def shot(name, tgt, d, dist, lens=50, wd=1600, h=1000):
        if ONLY and not any(name.startswith(q) for q in ONLY): return
        dv = Vector(d).normalized(); cam.location = Vector(tgt) + dv * dist; cam.rotation_euler = (Vector(tgt) - cam.location).to_track_quat('-Z', 'Y').to_euler(); cd.type = 'PERSP'; cd.lens = lens; cd.sensor_width = 36
        sc.render.resolution_x, sc.render.resolution_y = wd, h; sc.render.filepath = os.path.join(OUT, name); bpy.ops.render.render(write_still=True)
    shot('т_как_02.jpg', (0.0, Y(8.0), 1.5), (0.80, 0.56, 0.10), 23.0, lens=55)
    shot('т_как_04.jpg', (0.0, Y(8.0), 1.5), (-1.0, 0.04, 0.06), 25.0, lens=55)
    shot('т_как_08.jpg', (0.0, Y(10.0), 1.4), (-0.62, -0.76, 0.10), 21.0, lens=55)
    shot('т_как_06.jpg', (0.0, Y(8.5), 1.6), (0.55, -0.45, 0.70), 24.0, lens=55)
    shot('т_сверху.jpg', (0.0, Y(8.3), 1.5), (0.0, -0.10, 1.0), 26.0, lens=55, wd=1000, h=1400)
    go.hide_render = True; shot('т_низ.jpg', (0.0, Y(8.3), 1.2), (0.20, -0.15, -1.0), 26.0, lens=55, wd=1000, h=1400); go.hide_render = False
    shot('т_нос.jpg', (0.80, Y(4.6), 1.60), (0.86, 0.42, 0.18), 6.2)
    shot('т_губа.jpg', (0.70, Y(4.1), 1.55), (0.40, 0.90, 0.12), 4.2)
    shot('т_киль.jpg', (0.0, Y(14.7), 3.0), (1.0, -0.05, 0.05), 5.5)
    shot('т_крыло.jpg', (-2.2, Y(10.0), 1.9), (-0.25, -0.20, 0.95), 6.0)
    shot('т_сопло.jpg', (1.0, Y(12.2), 1.1), (0.75, -0.55, -0.12), 5.0)
    shot('т_стойка.jpg', (1.2, Y(9.6), 0.6), (0.82, 0.52, 0.10), 4.6)
    shot('т_корень.jpg', (-1.0, Y(9.6), 1.95), (-0.55, -0.80, -0.22), 4.8)
    shot('т_корень2.jpg', (-1.0, Y(9.4), 2.2), (-0.62, 0.55, 0.56), 5.0)
    shot('т_хвост.jpg', (0.0, Y(15.0), 1.95), (0.40, -0.55, 0.73), 6.5)
    shot('т_хвост2.jpg', (0.0, Y(15.0), 1.90), (0.55, -0.80, 0.05), 6.0)
    shot('т_кабина.jpg', (0.0, Y(3.4), 2.1), (0.55, 0.45, 0.70), 4.6)
# файл для игры: без стоек и открытых створок шасси
GEAR = [o for o in sc.objects if o.type == 'MESH' and (o.name.startswith('gear') or o.name.endswith('_g'))]
for o in [q for q in sc.objects if q.name.startswith('v_')]: bpy.data.objects.remove(o)
COLS = {o.name: list(o.users_collection) for o in GEAR}
for o in GEAR:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update()
MAINPTS = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]
MN_M = [min(p[i] for p in MAINPTS) for i in range(3)]; MX_M = [max(p[i] for p in MAINPTS) for i in range(3)]
mk.export(os.path.join(OUT, 'yak38.glb'), None); print('файл', os.path.getsize(os.path.join(OUT, 'yak38.glb')) // 1024, 'КБ')
for o in GEAR:
    for c in COLS[o.name]: c.objects.link(o)
for o in [q for q in sc.objects if q.type == 'MESH' and q not in GEAR]:
    for c in list(o.users_collection): c.objects.unlink(o)
vl.update()
GP = [o.matrix_world @ v.co for o in GEAR for v in o.data.vertices]; mn_g = min(p.z for p in GP)
top_ = MN_M[2] + MX_M[2] - mn_g; E_ = 0.0005; Vv = []; Ff = []
for yy in (MN_M[1], MX_M[1]):
    k_ = len(Vv); Vv += [(-E_, yy, top_), (E_, yy, top_), (0, yy, top_ - E_)]; Ff.append((k_, k_ + 1, k_ + 2))
ma_ = bpy.data.meshes.new('gear_anchor'); ma_.from_pydata(Vv, [], Ff); ma_.update(); ma_.materials.append(mp); ma_.uv_layers.new(name='UVMap'); oa_ = bpy.data.objects.new('gear_anchor', ma_); COLS[GEAR[0].name][0].objects.link(oa_)
print('метки шасси на высоте', round(top_, 3), 'самолёт', [round(v, 3) for v in MN_M], [round(v, 3) for v in MX_M], 'низ колёс', round(mn_g, 3))
vl.update(); mk.export(os.path.join(OUT, 'yak38_gear.glb'), None); print('файл шасси', os.path.getsize(os.path.join(OUT, 'yak38_gear.glb')) // 1024, 'КБ')
cy = (MN_M[2] + MX_M[2]) / 2; cb = (MN_M[1] + MX_M[1]) / 2
GG = lambda v: [round(v.x, 3), round(v.z - cy, 3), round(-(v.y - cb), 3)]
N_ = g.NOZ
P = dict(stations=[GG(g.P3(a_, x_, z_)) for a_, x_, z_ in g.station_pts()], nozzles=[GG(g.P3(N_['a'] + N_['ln'], sx * N_['x'], N_['z'])) for sx in (-1, 1)], nr=round(N_['re'], 3), gear_bottom=round(mn_g - cy, 3),
         nozzle_pivots={('nozzle_' + n_): [GG(g.PARTS['nozzle_' + n_]['pivot']), [1.0, 0.0, 0.0], list(g.NOZ_RANGE)] for n_ in ('l', 'r')}, decoy=GG(g.P3(15.2, 0.0, 1.62)))
json.dump(P, open(os.path.join(OUT, 'точки.json'), 'w', encoding='utf-8'), ensure_ascii=False); print('точки', P)
