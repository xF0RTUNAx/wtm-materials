# Запекание GBU-12 (после build.py, в той же сцене): все детали — один атлас 1024 (цвет + нормали Bevel 3 мм). Цвет — излучением: цвет материала детали
# (build.py), неравномерность ±6 %, затенение AO 0,08 и 0,4 м, лёгкая грязь в углах, потёртые кромки на сером комплекте и оливковом корпусе.
import os, sys, math
import bpy

HERE = '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/GBU-12'
LIVE = '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Стрела-1/_live'
sys.path.insert(0, '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/_инструменты')
INFO = []
def log(*a): INFO.append(' '.join(str(x) for x in a))
sc = bpy.context.scene; vl = bpy.context.view_layer
OBJ = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('G12_')]
WEAR = {'G12_grey', 'G12_olive', 'G12_steel'}; NODIRT = {'G12_glass', 'G12_orange', 'G12_yellow'}
SIZE = 1024

def N(nt, t, **kw):
    n = nt.nodes.new(t)
    for k, v in kw.items(): n.inputs[k].default_value = v
    return n

def mix(nt, a, b, fac, blend='MIX'):
    m = nt.nodes.new('ShaderNodeMix'); m.data_type = 'RGBA'; m.blend_type = blend; L = nt.links.new
    for s, v in (('A', a), ('B', b), ('Factor', fac)):
        if isinstance(v, (tuple, list)): m.inputs[s].default_value = (*v, 1) if len(v) == 3 else v
        elif isinstance(v, float): m.inputs[s].default_value = v
        else: L(v, m.inputs[s])
    return m.outputs['Result']

def select_only(objs):
    for o in vl.objects: o.select_set(False)
    for o in objs: o.hide_set(False); o.select_set(True)
    vl.objects.active = objs[0]

def shade_tree(m, rgb, img, wear, dirt):
    m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); L = nt.links.new
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); L(em.outputs[0], out.inputs[0])
    ao1 = nt.nodes.new('ShaderNodeAmbientOcclusion'); ao1.samples = 24; ao1.inputs['Distance'].default_value = 0.08
    ao2 = nt.nodes.new('ShaderNodeAmbientOcclusion'); ao2.samples = 12; ao2.inputs['Distance'].default_value = 0.4
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = N(nt, 'ShaderNodeTexNoise', Scale=6.0, Detail=4.0); L(tc.outputs['Object'], nz.inputs['Vector'])
    nz2 = N(nt, 'ShaderNodeTexNoise', Scale=60.0, Detail=6.0); L(tc.outputs['Object'], nz2.inputs['Vector'])
    var = N(nt, 'ShaderNodeMapRange', **{'To Min': 0.94, 'To Max': 1.06}); L(nz.outputs['Fac'], var.inputs['Value'])
    c = mix(nt, rgb, var.outputs[0], 1.0, 'MULTIPLY')
    sh1 = N(nt, 'ShaderNodeMapRange', **{'To Min': 0.60}); L(ao1.outputs['AO'], sh1.inputs['Value'])
    sh2 = N(nt, 'ShaderNodeMapRange', **{'To Min': 0.85}); L(ao2.outputs['AO'], sh2.inputs['Value'])
    sh = nt.nodes.new('ShaderNodeMath'); sh.operation = 'MULTIPLY'; L(sh1.outputs[0], sh.inputs[0]); L(sh2.outputs[0], sh.inputs[1])
    c = mix(nt, c, sh.outputs[0], 1.0, 'MULTIPLY')
    if dirt:
        inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0; L(ao1.outputs['AO'], inv.inputs[1])
        df = nt.nodes.new('ShaderNodeMath'); df.operation = 'MULTIPLY'; L(inv.outputs[0], df.inputs[0]); L(nz2.outputs['Fac'], df.inputs[1])
        dk = nt.nodes.new('ShaderNodeMath'); dk.operation = 'MULTIPLY'; dk.inputs[1].default_value = 0.6; L(df.outputs[0], dk.inputs[0])
        c = mix(nt, c, (0.05, 0.045, 0.03), dk.outputs[0])
    if wear:
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        pr = N(nt, 'ShaderNodeMapRange', **{'From Min': 0.53, 'From Max': 0.62}); L(geo.outputs['Pointiness'], pr.inputs['Value'])
        wm = nt.nodes.new('ShaderNodeMath'); wm.operation = 'MULTIPLY'; L(pr.outputs[0], wm.inputs[0]); L(nz2.outputs['Fac'], wm.inputs[1])
        wk = nt.nodes.new('ShaderNodeMath'); wk.operation = 'MULTIPLY'; wk.inputs[1].default_value = 0.5; L(wm.outputs[0], wk.inputs[0])
        c = mix(nt, c, (min(1, rgb[0] * 1.4 + 0.05), min(1, rgb[1] * 1.4 + 0.05), min(1, rgb[2] * 1.4 + 0.05)), wk.outputs[0])
    L(c, em.inputs['Color'])
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; t.select = True; nt.nodes.active = t

def normal_tree(m, img, r):
    m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); L = nt.links.new
    out = nt.nodes.new('ShaderNodeOutputMaterial'); bs = nt.nodes.new('ShaderNodeBsdfPrincipled'); L(bs.outputs[0], out.inputs[0])
    bev = nt.nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = r; bev.samples = 16; L(bev.outputs[0], bs.inputs['Normal'])
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; t.select = True; nt.nodes.active = t

def save(img, fn):
    p = os.path.join(HERE, fn); img.filepath_raw = p; img.file_format = 'PNG'; img.save(); log('записано:', fn)

try:
    import gpu_setup
    sc.render.engine = 'CYCLES'; log('Cycles:', gpu_setup.use_gpu(sc))
    if all(len(o.data.materials) == 1 and o.data.materials[0].name == 'G12_atlas' for o in OBJ): log('уже запечено')
    else:
        select_only(OBJ)
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.002, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
        bpy.ops.uv.select_all(action='SELECT')
        try: bpy.ops.uv.pack_islands(rotate=False, margin=16.0 / SIZE, margin_method='ADD')   # зазор 16 пикс. при полосе 8 (урок «Сорбции»)
        except TypeError: bpy.ops.uv.pack_islands(margin=16.0 / SIZE)
        bpy.ops.object.mode_set(mode='OBJECT')
        ci = bpy.data.images.new('G12_color', SIZE, SIZE, alpha=False); ni = bpy.data.images.new('G12_normal', SIZE, SIZE, alpha=False); ni.colorspace_settings.name = 'Non-Color'
        mats = {m for o in OBJ for m in o.data.materials if m}
        for m in mats:
            b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); rgb = tuple(b.inputs['Base Color'].default_value[:3])
            shade_tree(m, rgb, ci, m.name in WEAR, m.name not in NODIRT)
        select_only(OBJ); sc.cycles.samples = 32
        bpy.ops.object.bake(type='EMIT', width=SIZE, height=SIZE, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True); save(ci, 'gbu12_color.png')
        for m in mats: normal_tree(m, ni, 0.003)
        sc.cycles.samples = 48
        bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', width=SIZE, height=SIZE, margin=8, margin_type='EXTEND', use_selected_to_active=False, use_clear=True); save(ni, 'gbu12_normal.png')
        fm = bpy.data.materials.get('G12_atlas') or bpy.data.materials.new('G12_atlas'); fm.use_nodes = True; nt = fm.node_tree; nt.nodes.clear(); L = nt.links.new
        out = nt.nodes.new('ShaderNodeOutputMaterial'); bs = nt.nodes.new('ShaderNodeBsdfPrincipled'); L(bs.outputs[0], out.inputs[0])
        bs.inputs['Roughness'].default_value = 0.6; bs.inputs['Metallic'].default_value = 0.0
        tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = ci; L(tc.outputs['Color'], bs.inputs['Base Color'])
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = ni; nm = nt.nodes.new('ShaderNodeNormalMap'); L(tn.outputs['Color'], nm.inputs['Color']); L(nm.outputs[0], bs.inputs['Normal'])
        for o in OBJ:
            o.data.materials.clear(); o.data.materials.append(fm)
            for f in o.data.polygons: f.material_index = 0
finally:
    for o in sc.objects:
        if o: o.select_set(False)
    open(os.path.join(LIVE, 'info.txt'), 'w', encoding='utf-8').write('\n'.join(INFO))
