# _shots.py - снимки при дневном свете (Cycles на видеокарте): небо сверху, земля снизу, солнце с мягкой тенью; фон ровный серый только в кадре. Металл и краска читаются честно, без плоского света EEVEE.
import os, math, sys, bpy
from mathutils import Vector
import modelkit as mk
sys.path.insert(0, '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/_инструменты')
import gpu_setup


def shots(outdir, views, size=(1440, 900), scene='KH28'):
    sc = bpy.data.scenes[scene]; sc.render.engine = 'CYCLES'; gpu_setup.use_gpu(sc); sc.cycles.samples = 96
    try: sc.cycles.use_denoising = True
    except Exception: pass
    sc.render.film_transparent = False; sc.render.image_settings.color_mode = 'RGB'
    try: sc.view_settings.view_transform = 'Standard'
    except Exception: pass
    w = bpy.data.worlds.get('K28_world') or bpy.data.worlds.new('K28_world'); sc.world = w
    try: w.use_nodes = True
    except Exception: pass
    nt = w.node_tree; nt.nodes.clear(); N = nt.nodes.new; L = nt.links.new
    out = N('ShaderNodeOutputWorld'); bg = N('ShaderNodeBackground'); frame = N('ShaderNodeBackground'); mix = N('ShaderNodeMixShader'); lp = N('ShaderNodeLightPath'); tc = N('ShaderNodeTexCoord'); sp = N('ShaderNodeSeparateXYZ'); ramp = N('ShaderNodeValToRGB')
    L(tc.outputs['Generated'], sp.inputs[0]); mr = N('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = -1.0; mr.inputs['From Max'].default_value = 1.0; L(sp.outputs['Z'], mr.inputs['Value']); L(mr.outputs[0], ramp.inputs['Fac'])
    cr = ramp.color_ramp; cr.elements[0].position = 0.30; cr.elements[0].color = (0.17, 0.17, 0.14, 1); cr.elements[1].position = 0.86; cr.elements[1].color = (0.55, 0.70, 0.95, 1)
    e = cr.elements.new(0.52); e.color = (0.95, 0.96, 0.98, 1)
    L(ramp.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = 1.05
    frame.inputs['Color'].default_value = (0.46, 0.49, 0.53, 1); frame.inputs['Strength'].default_value = 1.0
    L(lp.outputs['Is Camera Ray'], mix.inputs[0]); L(bg.outputs[0], mix.inputs[1]); L(frame.outputs[0], mix.inputs[2]); L(mix.outputs[0], out.inputs['Surface'])
    sun = bpy.data.objects.get('K28_sun')
    if sun is None:
        sd = bpy.data.lights.new('K28_sun', 'SUN'); sun = bpy.data.objects.new('K28_sun', sd); sc.collection.objects.link(sun)
    sun.data.energy = 2.6; sun.data.angle = math.radians(4); sun.rotation_euler = (math.radians(48), math.radians(12), math.radians(-40))
    cam = mk._camera(); cam.data.type = 'PERSP'; cam.data.lens = 50; cam.data.clip_start, cam.data.clip_end = 0.05, 100
    res = []
    for name, tgt, d, dist in views:
        dv = Vector(d).normalized(); cam.location = Vector(tgt) + dv * dist
        cam.rotation_euler = (Vector(tgt) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        res.append(mk._render(os.path.join(outdir, name), size[0], size[1]))
    for o in (sun,):
        o.hide_render = True
    sun.hide_render = False
    return res
