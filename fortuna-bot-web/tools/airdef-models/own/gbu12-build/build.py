# GBU-12 Paveway II для «Воздушного превосходства» (ключ w_gbu12, оружие gbu12) — своя модель вместо выреза из F-16D (Muhamad Mirza Arrafi, «сделано ИИ»).
# Собирает основной чат (Opus) по просьбе Mark 2026-10-24 в окне показа (папка обмена Стрела-1/_live), по его трём рендерам в этой папке:
#   1_рендер_серый_нос_вперёд.png — 3/4 спереди: серый комплект наведения и хвост, оливковый корпус Mk 82 (окраска — по нему);
#   2_рендер_зелёный_хвост_раскрыт.webp — хвостовой блок с раскрытыми крыльями (сзади); 3_рендер_зелёный_корпус_сбоку.webp — сбоку, жёлтый поясок, бандажи, ушки.
# Длина 3,30 м (как прежняя модель в игре: 3,304), корпус Mk 82 Ø 0,274 м. Метры, нос +Y, начало — середина длины, верх (ушки) — +Z; рули и стабилизаторы — «×».
# Части: G12_head (головка: стекло, корпус, шейка), G12_ring (кольцо-«птичка» и 4 стойки), G12_ccg (конус и блок управления, поясок), G12_canards (4 руля),
# G12_body (корпус Mk 82: поясок, бандажи), G12_lugs (ушки, лючок взрывателя), G12_tail (хвостовой блок, 4 стабилизатора, 4 сложенных крыла, срез).
#   G12_STAGE=1…3 — этапы для показа (1 тела вращения, 2 + кольцо, рули, ушки, бандажи, 3 + хвост с крыльями и метки); без — всё.
import os, math
import bpy, bmesh
from mathutils import Vector, Matrix

HERE = '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/GBU-12'
LIVE = '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Стрела-1/_live'
STAGE = int(os.environ.get('G12_STAGE', '9'))
N = 40                                           # сегментов тела вращения
INFO = []
def log(*a): INFO.append(' '.join(str(x) for x in a))

def mat(name, rgb, rough=0.6, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    m.diffuse_color = (*rgb, 1); return m

class Part:
    """Одна деталь: тела вращения вокруг оси Y, пластины в плоскости через ось, коробки; материалы — индексами общего списка."""
    def __init__(self, name): self.name = name; self.bm = bmesh.new()
    def revolve(self, prof, closed=False):
        """prof — [(y, r, материал полосы до следующей точки)] от носа к хвосту; r = 0 — полюс. closed — последнее кольцо соединить с первым (кольцо-«птичка»)."""
        rings = []
        for y, r, _ in prof:
            if r < 1e-6: rings.append([self.bm.verts.new((0, y, 0))])
            else: rings.append([self.bm.verts.new((r * math.cos(2 * math.pi * k / N), y, r * math.sin(2 * math.pi * k / N))) for k in range(N)])
        pairs = list(range(len(rings) - 1)) + ([len(rings) - 1] if closed else [])
        for i in pairs:
            a, b, mi = rings[i], rings[(i + 1) % len(rings)], prof[i][2]
            if len(a) == 1:
                for k in range(N): self.bm.faces.new((a[0], b[(k + 1) % N], b[k])).material_index = mi
            elif len(b) == 1:
                for k in range(N): self.bm.faces.new((a[k], a[(k + 1) % N], b[0])).material_index = mi
            else:
                for k in range(N): self.bm.faces.new((a[k], a[(k + 1) % N], b[(k + 1) % N], b[k])).material_index = mi
    def plate(self, phi, r0, span, yle_root, yte_root, yle_tip, yte_tip, t, mi, off=0.0):
        """Пластина в плоскости через ось под углом phi (от +X к +Z): корень на радиусе r0, конец — r0 + span; off — сдвиг по нормали (накладки)."""
        ph = math.radians(phi); d = Vector((math.cos(ph), 0, math.sin(ph))); n = Vector((-math.sin(ph), 0, math.cos(ph)))
        P = lambda r, yy, s: d * r + Vector((0, yy, 0)) + n * (off + s * t / 2)
        vs = [self.bm.verts.new(P(r, yy, s)) for s in (1, -1) for (r, yy) in ((r0, yle_root), (r0 + span, yle_tip), (r0 + span, yte_tip), (r0, yte_root))]
        for f in ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)): self.bm.faces.new([vs[i] for i in f]).material_index = mi
    def box(self, c, s, mi, rot=None):
        r = bmesh.ops.create_cube(self.bm, size=1.0)['verts']; R = rot or Matrix.Identity(3)
        for v in r: v.co = Vector(c) + R @ Vector((v.co.x * s[0], v.co.y * s[1], v.co.z * s[2]))
        for f in {f for v in r for f in v.link_faces}: f.material_index = mi
    def disc(self, c, nrm, r, h, n, mi):
        """Низкий цилиндр-накладка (лючок, крышка): центр c, ось nrm, высота h наружу."""
        c, a = Vector(c), Vector(nrm).normalized(); u = a.orthogonal().normalized(); w = a.cross(u)
        r0 = [self.bm.verts.new(c - a * 0.002 + (u * math.cos(2 * math.pi * k / n) + w * math.sin(2 * math.pi * k / n)) * r) for k in range(n)]
        r1 = [self.bm.verts.new(c + a * h + (u * math.cos(2 * math.pi * k / n) + w * math.sin(2 * math.pi * k / n)) * r) for k in range(n)]
        for k in range(n): self.bm.faces.new((r0[k], r0[(k + 1) % n], r1[(k + 1) % n], r1[k])).material_index = mi
        self.bm.faces.new(r1).material_index = mi
    def finish(self, col, mats, sharp=32):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        for f in bm.faces: f.smooth = True
        for e in bm.edges:
            if len(e.link_faces) != 2 or e.calc_face_angle(0) > math.radians(sharp): e.smooth = False
        me = bpy.data.meshes.new(self.name); bm.to_mesh(me); bm.free()
        for m in mats: me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me); col.objects.link(ob); return ob

def build():
    sc = bpy.context.scene
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections): bpy.data.collections.remove(c)
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.actions, bpy.data.cameras, bpy.data.lights):
        for d in list(blk):
            if d.users == 0: blk.remove(d)
    col = bpy.data.collections.new('GBU12'); sc.collection.children.link(col)
    MATS = [mat('G12_grey', (0.48, 0.50, 0.51), 0.55),       # 0 комплект наведения и хвост — светло-серые (рендер 1)
            mat('G12_olive', (0.11, 0.13, 0.04), 0.7),       # 1 корпус Mk 82 — оливковый
            mat('G12_dark', (0.025, 0.027, 0.024), 0.7),     # 2 швы, полость хвоста, ушки
            mat('G12_steel', (0.22, 0.22, 0.22), 0.4, 0.7),  # 3 бандажи, переходное кольцо
            mat('G12_yellow', (0.70, 0.48, 0.02), 0.5),      # 4 жёлтый поясок (боевая)
            mat('G12_glass', (0.55, 0.38, 0.04), 0.08),      # 5 стекло головки — янтарное
            mat('G12_orange', (0.80, 0.20, 0.03), 0.5),      # 6 оранжевые метки на рулях и стабилизаторах
            mat('G12_green', (0.03, 0.075, 0.04), 0.5)]      # 7 тёмно-зелёный поясок блока управления (рендер 1)
    GR, OL, DK, ST, YL, GL, OR, GN = range(8)
    RB = 0.137                                               # радиус корпуса Mk 82
    fin = lambda p: p.finish(col, MATS)

    # ───────── 1. тела вращения: головка, конус и блок управления, корпус Mk 82, хвостовой блок ─────────
    h = Part('G12_head')
    h.revolve([(1.650, 0.0, GL), (1.646, 0.022, GL), (1.636, 0.036, GL), (1.622, 0.046, GL), (1.605, 0.052, GR), (1.598, 0.056, GR),
               (1.440, 0.056, GR), (1.432, 0.060, GR), (1.410, 0.060, GR), (1.385, 0.034, GR), (1.300, 0.034, GR), (1.300, 0.0, GR)])
    fin(h)
    cc = Part('G12_ccg')
    cc.revolve([(1.310, 0.0, GR), (1.310, 0.046, GR), (1.020, 0.130, DK), (1.016, 0.128, GR), (1.012, 0.130, GR),
                (0.880, 0.130, GN), (0.760, 0.130, GR), (0.630, 0.130, ST), (0.628, 0.137, ST), (0.585, 0.137, DK), (0.580, 0.106, DK), (0.560, 0.106, DK), (0.560, 0.0, DK)])
    fin(cc)
    def rbody(y):                                            # огива от гнезда взрывателя (0,575 → 0,175), «бочка», сужение к хвосту (−0,60 → −0,96)
        if y >= 0.175: return 0.104 + (RB - 0.104) * math.sin((0.575 - y) / 0.40 * math.pi / 2)
        if y >= -0.60: return RB
        t = (-0.60 - y) / 0.36; return RB - (RB - 0.118) * t * t
    YB = (0.395, 0.335)                                      # жёлтый поясок (рендеры 2–3: у носа корпуса)
    ys = sorted({round(0.575 - 0.05 * k, 4) for k in range(9)} | set(YB) | {round(-0.60 - 0.06 * k, 4) for k in range(7)}, reverse=True)
    prof = [(0.575, 0.0, OL)] + [(y, rbody(y), YL if (i + 1 < len(ys) and y <= YB[0] + 1e-4 and ys[i + 1] >= YB[1] - 1e-4) else OL) for i, y in enumerate(ys)] + [(-0.96, 0.0, OL)]
    bd = Part('G12_body'); bd.revolve(prof); fin(bd)
    tl = Part('G12_tail')
    tl.revolve([(-0.930, 0.0, GR), (-0.930, 0.120, GR), (-1.000, 0.146, GR), (-1.012, 0.146, DK), (-1.016, 0.146, GR), (-1.615, 0.146, GR),
                (-1.640, 0.141, GR), (-1.650, 0.130, DK), (-1.650, 0.112, DK), (-1.600, 0.112, DK), (-1.600, 0.0, DK)])
    if STAGE < 3: fin(tl)
    if STAGE < 2: return

    # ───────── 2. кольцо-«птичка» на головке, 4 руля «×», ушки и лючок, бандажи ─────────
    rg = Part('G12_ring')
    rg.revolve([(1.575, 0.120, GR), (1.582, 0.128, GR), (1.575, 0.136, GR), (1.445, 0.136, GR), (1.445, 0.120, GR)], closed=True)
    for phi in (45, 135, 225, 315): rg.plate(phi, 0.054, 0.068, 1.560, 1.470, 1.560, 1.470, 0.008, GR)
    fin(rg)
    cn = Part('G12_canards')                                 # трапеции: корень 0,31 м, размах 0,21, задняя кромка поперёк
    for phi in (45, 135, 225, 315):
        cn.plate(phi, 0.126, 0.215, 0.975, 0.665, 0.885, 0.680, 0.012, GR)
        cn.plate(phi, 0.290, 0.042, 0.790, 0.700, 0.775, 0.702, 0.002, OR, off=0.0072)   # оранжевая метка (обе стороны)
        cn.plate(phi, 0.290, 0.042, 0.790, 0.700, 0.775, 0.702, 0.002, OR, off=-0.0072)
    cn.disc((0.0, 0.83, -0.130), (0, 0, -1), 0.030, 0.006, 16, GR)                        # крышка разъёма снизу блока
    fin(cn)
    lg = Part('G12_lugs')                                    # два ушка (14″ = 0,356 м) и лючок взрывателя между ними; бандажи
    for y in (0.128, -0.228):
        lg.box((0, y, RB + 0.006), (0.062, 0.050, 0.012), DK)
        for dx in (-0.024, 0.024): lg.box((dx, y, RB + 0.040), (0.012, 0.040, 0.060), DK)
        lg.box((0, y, RB + 0.066), (0.060, 0.040, 0.012), DK)
    lg.disc((0, -0.05, RB - 0.002), (0, 0, 1), 0.038, 0.006, 20, DK)
    for y in (0.20, -0.18, -0.58):                           # стальные бандажи (рендеры 1, 3)
        rr = rbody(y)
        lg.revolve([(y + 0.012, rr + 0.0005, ST), (y + 0.012, rr + 0.004, ST), (y - 0.012, rr + 0.004, ST), (y - 0.012, rr + 0.0005, ST)], closed=True)
    fin(lg)
    if STAGE < 3: return

    # ───────── 3. хвостовой блок: 4 стабилизатора «×», 4 сложенных крыла «+» вдоль корпуса, метки ─────────
    for phi in (45, 135, 225, 315):
        tl.plate(phi, 0.144, 0.112, -1.040, -1.610, -1.090, -1.600, 0.012, GR)
        for off in (0.0072, -0.0072): tl.plate(phi, 0.200, 0.040, -1.200, -1.300, -1.200, -1.300, 0.002, OR, off=off)
    for phi in (0, 90, 180, 270):                            # сложенное крыло: лопасть вдоль корпуса на ложементе
        ph = math.radians(phi); d = Vector((math.cos(ph), 0, math.sin(ph)))
        R3 = Matrix((Vector((-math.sin(ph), 0, math.cos(ph))), Vector((0, 1, 0)), d)).transposed()
        tl.box(d * 0.152 + Vector((0, -1.31, 0)), (0.080, 0.600, 0.014), GR, R3)
        tl.box(d * 0.160 + Vector((0, -1.60, 0)), (0.050, 0.030, 0.018), DK, R3)                  # шарнир у среза
    for k in range(8):                                       # винты по переднему краю блока
        a = 2 * math.pi * (k + 0.5) / 8; tl.disc((0.146 * math.cos(a), -1.035, 0.146 * math.sin(a)), (math.cos(a), 0, math.sin(a)), 0.008, 0.002, 8, DK)
    fin(tl)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in col.objects if o.type == 'MESH')
    lo = min(v.co.y for o in col.objects for v in o.data.vertices); hi = max(v.co.y for o in col.objects for v in o.data.vertices)
    sp = max(math.hypot(v.co.x, v.co.z) for o in col.objects for v in o.data.vertices) * 2
    log('GBU-12: длина %.3f м (y %.3f…%.3f), размах по рулям %.3f м, треугольников %d, деталей %d' % (hi - lo, lo, hi, sp, tris, len(col.objects)))

try:
    build()
finally:
    bpy.context.view_layer.update()
    for o in bpy.context.scene.objects:
        if o: o.select_set(False)
    open(os.path.join(LIVE, 'info.txt'), 'w', encoding='utf-8').write('\n'.join(INFO))
