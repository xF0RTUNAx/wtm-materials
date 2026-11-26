# Съёмка взрыва для света в игре (Mark 2026-11-26: «странная палитра… не взаимодействует со светом и окружением»; ИССЛЕДОВАНИЕ.md, 6-way lightmaps):
# та же симуляция (кэш Mantaflow), но вместо цветного кадра - отклик облака на свет с шести сторон (в осях камеры) и накал огня отдельно.
#   blender -b explode_<тип>.blend -P render6.py -- <папка> [кадры через запятую | all] [клетка px = 512] [сэмплы = 64]
# Пишет <кадр>_<проход>.exr: rt, lf, up, dn, bk - свет с этой стороны (альфа - прозрачность), heat - накал пламени без света, alb - цвет из
# симуляции (сажа тёмная, пыль светлая), снятый свечением; и meta.json (как у render.py). Проходы - отдельными рендерами (Blender 5 пишет в файл
# только итоговый кадр, группы света в многослойный EXR не попадали).
# Мир чёрный, своё солнце выключено, дым - нейтральный серый (альбедо 0,6: цвет сажи и пыли задаёт игра), пламя - белое (цвет - в игре по накалу).
import bpy, sys, os, json
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
a = sys.argv[sys.argv.index('--') + 1:]
out = a[0]; fsel = a[1] if len(a) > 1 else 'all'; size = int(a[2]) if len(a) > 2 else 512; spp = int(a[3]) if len(a) > 3 else 64
sc = bpy.context.scene; cam = sc.camera
sys.path.insert(0, os.path.expanduser('~/Downloads/Воздушное превосходство/Модели/Свои/_инструменты'))
import gpu_setup; print('Cycles:', gpu_setup.use_gpu(sc), flush=True)
sc.render.resolution_x = sc.render.resolution_y = size; sc.render.resolution_percentage = 100; sc.cycles.samples = spp
sc.render.film_transparent = True; sc.cycles.sample_clamp_indirect = 0.5
try: sc.view_settings.view_transform = 'Standard'
except TypeError: pass
# мир - чёрный
w = sc.world
if w:
    bg = next((n for n in w.node_tree.nodes if n.type == 'BACKGROUND'), None)
    if bg: bg.inputs['Strength'].default_value = 0.0
for o in list(bpy.data.objects):
    if o.type == 'LIGHT': bpy.data.objects.remove(o, do_unlink=True)
# дым - нейтральный серый, пламя - белое (накал = яркость)
dom = bpy.data.objects['Область']; nt = dom.active_material.node_tree
pv = next(n for n in nt.nodes if n.type == 'PRINCIPLED_VOLUME')
for l in list(nt.links):
    if l.to_node == pv and l.to_socket.name == 'Color': nt.links.remove(l)
pv.inputs['Color'].default_value = (0.6, 0.6, 0.6, 1); CA = pv.inputs['Color Attribute'].default_value  # цвет из симуляции (сажа тёмная, пыль светлая) - отдельным проходом
pv.inputs['Color Attribute'].default_value = ''
cr = next(n for n in nt.nodes if n.label == 'Пламя: цвет').color_ramp
for e in cr.elements: e.color = (1, 1, 1, 1)
# шесть солнц в осях камеры: свет приходит С этой стороны
M = cam.matrix_world.to_3x3()
D = {'rt': M @ Vector((1, 0, 0)), 'lf': M @ Vector((-1, 0, 0)), 'up': M @ Vector((0, 1, 0)), 'dn': M @ Vector((0, -1, 0)), 'fr': M @ Vector((0, 0, 1)), 'bk': M @ Vector((0, 0, -1))}
vl = sc.view_layers[0]
for k, d in D.items():
    ld = bpy.data.lights.new('L_' + k, 'SUN'); ld.energy = 3.0; ld.angle = 0.05
    o = bpy.data.objects.new('L_' + k, ld); sc.collection.objects.link(o)
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = d.normalized().to_track_quat('Z', 'Y')
    if 'L_' + k not in vl.lightgroups: vl.lightgroups.add(name='L_' + k)
    o.lightgroup = 'L_' + k
vl.use_pass_emit = True; sc.render.use_compositing = False; sc.render.use_sequencer = False
im = sc.render.image_settings; im.file_format = 'OPEN_EXR'; im.color_depth = '16'
try: im.media_type = 'IMAGE'
except (AttributeError, TypeError): pass
fl = next(n for n in nt.nodes if n.label == 'Пламя: сила'); FL = fl.inputs[1].default_value
em_col = next(l for l in nt.links if l.to_node == pv and l.to_socket.name == 'Emission Color'); em_src = em_col.from_socket
attr = nt.nodes.new('ShaderNodeAttribute'); attr.attribute_name = CA or 'color'; attr.attribute_type = 'GEOMETRY'
LIGHTS = {o.name[2:]: o for o in bpy.data.objects if o.name.startswith('L_')}
def mode(m):  # свет одной стороны, накал или цвет
    for k, o in LIGHTS.items(): o.hide_render = (k != m)
    for l in list(nt.links):
        if l.to_node == pv and l.to_socket.name == 'Emission Color': nt.links.remove(l)
    if m == 'alb':  # цвет симуляции свечением: без света, рассеяние 0 - в кадре цвет вдоль луча с тем же ослаблением, что и у прозрачности
        nt.links.new(attr.outputs['Color'], pv.inputs['Emission Color']); fl.inputs[1].default_value = 0.0; pv.inputs['Emission Strength'].default_value = 1.0
        for l in list(nt.links):
            if l.to_node == pv and l.to_socket.name == 'Emission Strength': nt.links.remove(l)
    else:
        nt.links.new(em_src, pv.inputs['Emission Color'])
        if not any(l.to_node == pv and l.to_socket.name == 'Emission Strength' for l in nt.links): nt.links.new(fl.outputs['Value'], pv.inputs['Emission Strength'])
        fl.inputs[1].default_value = FL if m == 'heat' else 0.0
PASSES = ['rt', 'lf', 'up', 'dn', 'bk', 'heat', 'alb']
gs = float(sc.get('game_scale', 1)); p = world_to_camera_view(sc, cam, Vector((0, 0, 0)))
frames = list(range(1, 9)) + list(range(10, min(73, sc.frame_end + 1), 2)) + list(range(76, sc.frame_end + 1, 4))
if fsel != 'all': frames = [int(x) for x in fsel.split(',')]
os.makedirs(out, exist_ok=True)
json.dump({'fps': sc.render.fps / gs ** 0.5, 'ortho': cam.data.ortho_scale * gs, 'anchor': [round(p.x, 4), round(1 - p.y, 4)], 'frames': frames, 'cam': [list(r) for r in cam.matrix_world.to_3x3()]}, open(os.path.join(out, 'meta.json'), 'w'))
for f in frames:
    sc.frame_set(f)
    for m in PASSES:
        fn = os.path.join(out, f'{f:03d}_{m}.exr')
        if os.path.exists(fn): continue
        mode(m); sc.render.filepath = fn; bpy.ops.render.render(write_still=True)
    print('кадр', f, flush=True)
print('готово', len(frames), flush=True)
