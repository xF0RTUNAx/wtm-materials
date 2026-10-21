# modelkit.py — общие кирпичи для сборки внешних моделей оружия в Blender 5.x (рецепт сборщика — README.md рядом).
# Единицы — метры; нос +Y (в glTF уходит в −Z); начало — середина длины; ось корпуса — Y. Размеры вводят в пикселях чертежа
# и переводят множителем S (метров на пиксель). Пример целиком — ../kh29t-build/build.py.
#   import sys, importlib; sys.dont_write_bytecode = True      # без __pycache__ в репозитории
#   sys.path.insert(0, '<папка _kit>'); import modelkit as mk; importlib.reload(mk)
#   mk.configure('KH31P', S, x0=<пикс. середины длины по x чертежа>, yc=<пикс. оси по y чертежа>, rb=<радиус корпуса, пикс.>, nose='left'|'right')
#   mk.set_materials([('K31_body', (0.5, 0.5, 0.5)), ('K31_wing', …), …])       # индекс материала — по порядку
#   b = mk.B(); b.loft(кольца, индекс_материала, cap0=…, cap1=…); ob = b.finish('K31_body')
#   mk.stats(); mk.silhouette_side(…); mk.previews(…); mk.export(glb, blend); mk.passport(…)
import bpy, bmesh, math, os, json
from mathutils import Vector

S, X0, YC, RB, NSEG, NOSE = 1.0, 0.0, 0.0, 1.0, 32, 1.0   # м/пикс; середина длины и ось на чертеже (пикс.); радиус корпуса (пикс.); граней у тела вращения; +1 нос слева на чертеже, −1 справа
NAME, sc, col, MATS = 'MODEL', None, None, []
M_BODY, M_WING, M_CTRL, M_DARK = 0, 1, 2, 3        # привычные индексы: корпус, крылья и рули, органы управления и кожух, тёмное (швы, купол, сопло)


def configure(name, scale, x0=0.0, yc=0.0, rb=1.0, nseg=32, nose='left'):
    """Своя сцена и коллекция модели (чужие сцены и объекты не трогаем), масштаб и оси чертежа. Повторный вызов чистит меши коллекции.
    nose — с какой стороны чертежа сбоку нос: 'left' (малые x) или 'right' (большие x); модель всегда строится носом в +Y."""
    global S, X0, YC, RB, NSEG, NAME, NOSE, sc, col
    S, X0, YC, RB, NSEG, NAME, NOSE = scale, x0, yc, rb, nseg, name, (1.0 if nose == 'left' else -1.0)
    if bpy.app.background and bpy.data.scenes.get(name) is None:
        bpy.ops.wm.read_factory_settings(use_empty=True)   # фоновый Blender (blender -b): начинаем с пустого файла, без стартового куба, света и камеры (в живом — не трогаем)
    sc = bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
    try: bpy.context.window.scene = sc
    except Exception as e: print('сцену не переключить:', e)
    if bpy.app.background:
        for s in list(bpy.data.scenes):                     # пустая стартовая сцена не нужна
            if s is not sc and not s.objects: bpy.data.scenes.remove(s)
    if bpy.context.scene is not sc: print('ВНИМАНИЕ: активная сцена не', name, '— export() потребует переключить сцену в окне Blender')
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if col.name not in [c.name for c in sc.collection.children]: sc.collection.children.link(col)
    for o in list(col.objects):
        if o.type != 'MESH': continue           # камера и свет остаются
        me = o.data; bpy.data.objects.remove(o, do_unlink=True)
        if me.users == 0: bpy.data.meshes.remove(me)


def Y(x):
    """Пиксель чертежа по оси корпуса → координата Y в метрах (нос чертежа → +Y; сторону носа задаёт configure(nose=…))."""
    return (X0 - x) * S * NOSE


def mat(name, rgb, rough=0.55, metal=0.2):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)   # цвета линейные: их же читает prepare.js
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    m.diffuse_color = (rgb[0], rgb[1], rgb[2], 1.0)
    return m


def set_materials(specs):
    """[(имя, (r, g, b)), …] → общий список материалов модели; индекс — порядок в списке. Игра берёт цвет и имя, текстур не нужно."""
    global MATS
    MATS = [mat(n, c) for n, c in specs]


class B:
    """Построитель одного объекта: кольца → полосы граней, крышки; finish() — нормали, острые рёбра, объект в коллекции."""
    def __init__(self): self.bm = bmesh.new()

    def loft(self, rings, mats, cap0=None, cap1=None):
        """rings — список колец (списки точек Vector одной длины); mats — материал полосы (число или список по числу полос);
        cap0 / cap1 — материал крышки в начале / конце (None — без крышки)."""
        bm = self.bm
        vs = [[bm.verts.new(p) for p in ring] for ring in rings]
        n = len(vs[0])
        for i in range(len(vs) - 1):
            mi = mats[i] if isinstance(mats, (list, tuple)) else mats
            for j in range(n):
                f = bm.faces.new((vs[i][j], vs[i][(j + 1) % n], vs[i + 1][(j + 1) % n], vs[i + 1][j]))
                f.material_index = mi
        if cap0 is not None:
            f = bm.faces.new(vs[0][::-1]); f.material_index = cap0
        if cap1 is not None:
            f = bm.faces.new(vs[-1]); f.material_index = cap1

    def finish(self, name, sharp_deg=32):
        """Закрытые оболочки: нормали наружу; рёбра острее sharp_deg — резкие (glTF режет по ним нормали), остальное сглажено."""
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        lim = math.radians(sharp_deg)
        for f in bm.faces: f.smooth = True
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > lim: e.smooth = False
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        for m in MATS: me.materials.append(m)
        ob = bpy.data.objects.new(name, me); col.objects.link(ob)
        return ob


# ───────────── тело вращения ─────────────
def circ(x, R, n=None, cx=0.0, cz=0.0):
    """Кольцо радиуса R (пикс.) на позиции x чертежа; центр сдвигается на cx, cz (пикс.)."""
    n = n or NSEG
    return [Vector((cx * S + R * S * math.cos(2 * math.pi * k / n), Y(x), cz * S + R * S * math.sin(2 * math.pi * k / n))) for k in range(n)]


def profile(base, grooves=(), groove_mat=M_DARK):
    """Профиль вращения. base — [(x, R, материал полосы до следующей точки)], grooves — [(x, полуширина, глубина)] швы (канавки)
    в прямых участках профиля. Возвращает [(x, R, материал)] для loft([circ(x, R) …], [m …])."""
    out = []
    for i in range(len(base) - 1):
        xa, Ra, ma = base[i]; xb, Rb, _ = base[i + 1]
        out.append((xa, Ra, ma))
        if xb > xa:
            Rat = lambda x: Ra + (Rb - Ra) * (x - xa) / (xb - xa)
            for gx, hw, d in sorted(g for g in grooves if xa + 0.01 <= g[0] - g[1] and g[0] + g[1] <= xb - 0.01):
                out += [(gx - hw, Rat(gx - hw), groove_mat), (gx - hw, Rat(gx - hw) - d, groove_mat),
                        (gx + hw, Rat(gx + hw) - d, groove_mat), (gx + hw, Rat(gx + hw), ma)]
    out.append(base[-1])
    return out


# ───────────── крылья и рули в плоскостях через ось ─────────────
def foil(phi, r, xle, xte, t, pr):
    """Сечение пластины в плоскости через ось под углом phi (градусы от +X к +Z) на расстоянии r (пикс.) от оси:
    передняя кромка x=xle, задняя x=xte, толщина t (пикс.), pr — [(доля хорды, доля половины толщины)] от передней кромки."""
    ph = math.radians(phi)
    d = Vector((math.cos(ph), 0.0, math.sin(ph))); nr = Vector((-math.sin(ph), 0.0, math.cos(ph)))
    P = lambda x, n: Vector((0.0, Y(x), 0.0)) + (d * r + nr * n) * S
    up = [P(xle + f * (xte - xle), +h * t / 2) for f, h in pr]
    lo = [P(xle + f * (xte - xle), -h * t / 2) for f, h in pr]
    return (up + lo[::-1]) if pr[0][1] > 0 else (up + lo[::-1][:-1])


def panel(b, phi, stations, pr, mat):
    """Пластина по станциям [(r, xle, xte, t)] от корня (внутри корпуса) к концу; в b как закрытая оболочка."""
    b.loft([foil(phi, r, xl, xt, t, pr) for r, xl, xt, t in stations], mat, cap0=mat, cap1=mat)


PR_WING = [(0.0, 0.0), (0.14, 1.0), (0.88, 1.0), (1.0, 0.55)]     # острая передняя кромка со скосом, тупая задняя
PR_PLATE = [(0.0, 0.0), (0.18, 1.0), (0.85, 1.0), (1.0, 0.6)]
PR_FLAP = [(0.0, 0.78), (0.06, 0.95), (0.94, 0.95), (1.0, 0.78)]  # рулевая поверхность: чуть толще крыла, с фасками


# ───────────── накладки на цилиндр (лючки, гнёзда, площадки) ─────────────
def rrect(hw, hh, rad, k=3):
    """Контур прямоугольника с скруглёнными углами [(dx, dt)], пикс."""
    pts = []
    for cx, cy, a0 in ((hw - rad, hh - rad, 0), (-hw + rad, hh - rad, 90), (-hw + rad, -hh + rad, 180), (hw - rad, -hh + rad, 270)):
        for i in range(k + 1):
            a = math.radians(a0 + 90.0 * i / k); pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    return pts


def ell(rx, rz, n=10):
    return [(rx * math.cos(2 * math.pi * i / n), rz * math.sin(2 * math.pi * i / n)) for i in range(n)]


def decal(b, x, z, shape, side, h, mat, theta=None):
    """Накладка на цилиндр радиуса RB: центр x (пикс.), z — высота центра (пикс.), side = +1 (борт +X) или −1 (борт −X),
    shape — контур [(dx, dt)] в пикселях (dt — вдоль дуги), h — высота над корпусом; theta — свой угол центра (рад) вместо борта."""
    if theta is None:
        zc = max(-RB * 0.95, min(RB * 0.95, z)); th = math.asin(zc / RB) if side > 0 else math.pi - math.asin(zc / RB)
    else: th = theta
    sg = 1.0 if side > 0 else -1.0
    ring = lambda rho: [Vector((rho * S * math.cos(th + sg * dt / RB), Y(x + dx), rho * S * math.sin(th + sg * dt / RB))) for dx, dt in shape]
    b.loft([ring(RB - 1.0), ring(RB + h)], mat, cap0=mat, cap1=mat)


# ───────────── проверка и выдача ─────────────
def _meshes(): return [o for o in col.objects if o.type == 'MESH']


def _bbox(objs):
    mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for v in o.data.vertices:
            for i in range(3): mn[i] = min(mn[i], v.co[i]); mx[i] = max(mx[i], v.co[i])
    return mn, mx


def stats(verbose=True):
    """Треугольники по объектам и всего, габариты (м). Игре нужны: длина по прежней модели, не больше ~6 тыс. тр., ≤ 4 материалов."""
    objs = _meshes(); per = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs}
    mn, mx = _bbox(objs)
    d = dict(tris=sum(per.values()), length_m=round(mx.y - mn.y, 3), span_m=round(mx.x - mn.x, 3), height_m=round(mx.z - mn.z, 3),
             y_min=round(mn.y, 3), y_max=round(mx.y, 3), per_object=per)
    if verbose:
        for k, v in per.items(): print(f'{k:24s} {v:5d} тр.')
        print(f"всего {d['tris']} тр.; длина {d['length_m']} м, размах {d['span_m']} × {d['height_m']} м, Y {d['y_min']} … {d['y_max']}")
    return d


def export(glb, blend=None):
    """GLB (Y вверх, только меши модели, материалы) и .blend с самой сценой модели (откроется сразу с моделью, камерой и светом).
    Работает со сценой модели независимо от того, какая сцена активна в окне Blender."""
    ms = _meshes()
    if not ms: raise RuntimeError('в коллекции модели нет мешей — сначала build.py')
    if bpy.context.scene is not sc:
        try: bpy.context.window.scene = sc
        except Exception: pass
    # НЕ переопределять контекст (temp_override сцены / слоя) вокруг экспортёра: в Blender 5.2.2 это роняет программу на графе зависимостей
    if bpy.context.scene is not sc:
        raise RuntimeError(f'активна сцена «{bpy.context.scene.name}», а не «{NAME}»: переключи сцену в окне Blender (или вызови configure заново) и повтори')
    vl = bpy.context.view_layer
    for o in vl.objects: o.select_set(False)
    for o in ms: o.select_set(True)
    vl.objects.active = ms[0]
    os.makedirs(os.path.dirname(os.path.abspath(glb)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_materials='EXPORT', export_cameras=False, export_lights=False, export_normals=True)
    if blend: bpy.data.libraries.write(blend, {sc}, fake_user=True)
    return os.path.getsize(glb)


def _camera():
    cam = bpy.data.objects.get(NAME + '_cam')
    if cam is None:
        cd = bpy.data.cameras.new(NAME + '_cam'); cam = bpy.data.objects.new(NAME + '_cam', cd); col.objects.link(cam)
    cam.hide_render = True
    sc.camera = cam
    return cam


def _render(path, w, h):
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
    sc.render.image_settings.file_format = 'PNG'
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=sc.name)
    return path


def _ortho_shot(path, loc, rot, w, h, ortho_w_m):
    sc.render.engine = 'BLENDER_WORKBENCH'          # список движков в RNA неполный, значение принимается
    sc.render.film_transparent = True
    sc.render.image_settings.color_mode = 'RGBA'
    sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'SINGLE'; sc.display.shading.single_color = (1, 1, 1)
    try: sc.view_settings.view_transform = 'Standard'
    except Exception: pass
    cam = _camera(); cam.data.type = 'ORTHO'; cam.data.clip_start, cam.data.clip_end = 0.01, 50
    cam.data.ortho_scale = ortho_w_m                # ширина кадра в метрах — по большей стороне
    cam.location = loc; cam.rotation_euler = rot
    return _render(path, w, h)


def silhouette_side(path, size, center_px, from_side=None):
    """Силуэт сбоку в кадре чертежа: size (w, h) пикс., center_px — пиксель чертежа в центре кадра. Камера по умолчанию с той стороны, чтобы нос
    оказался там же, где на чертеже (nose из configure); from_side = −1 — со стороны −X (нос слева), +1 — со стороны +X (нос справа)."""
    w, h = size; cx, cy = center_px
    if from_side is None: from_side = -1 if NOSE > 0 else 1
    rot = (math.radians(90), 0, math.radians(-90 if from_side < 0 else 90))
    return _ortho_shot(path, (6.0 * (-1 if from_side < 0 else 1), Y(cx), (YC - cy) * S), rot, w, h, max(w, h) * S)


def silhouette_end(path, size, axis_px=None, rear=True, rb_px=None):
    """Силуэт вдоль оси: rear=True — вид сзади (камера на −Y), False — спереди. size (w, h), axis_px — где на чертеже ось (по умолчанию центр кадра).
    rb_px — радиус корпуса на ЭТОЙ картинке в пикселях, если масштаб вида спереди/сзади другой, чем у вида сбоку (по умолчанию тот же)."""
    w, h = size; ax, ay = axis_px or (w / 2, h / 2); Se = S * (RB / rb_px if rb_px else 1.0)
    if rear: loc, rot = ((-(ax - w / 2) * Se), -6.0, ((ay - h / 2) * Se)), (math.radians(90), 0, 0)
    else: loc, rot = (((ax - w / 2) * Se), 6.0, ((ay - h / 2) * Se)), (math.radians(90), 0, math.radians(180))
    return _ortho_shot(path, loc, rot, w, h, max(w, h) * Se)


def prism(b, xa, xb, section, mat, section_b=None):
    """Призма вдоль оси между x=xa и x=xb (кожухи, короба, воздухозаборники): section — [(смещение вбок, высота)] в пикселях
    (вправо при взгляде с хвоста, вверх +z), section_b — другое сечение у xb (сужение); закрытая оболочка."""
    ring = lambda x, sec: [Vector((lat * S, Y(x), z * S)) for lat, z in sec]
    b.loft([ring(xa, section), ring(xb, section_b or section)], mat, cap0=mat, cap1=mat)


def previews(outdir, size=(1920, 1080), views=None, bg=(0.62, 0.64, 0.66)):
    """Четыре картинки для Sketchfab: серый фон, мягкий свет (EEVEE). views — [(имя файла, точка взгляда, направление к камере,
    расстояние в м)]; по умолчанию — общий, сбоку, хвост, голова (нос +Y). Возвращает список путей."""
    objs = _meshes(); mn, mx = _bbox(objs); c = (mn + mx) / 2; L = mx.y - mn.y
    views = views or [
        ('превью_1_общий.png', c, (-0.75, 0.85, 0.5), 1.55 * L),
        ('превью_2_сбоку.png', c, (-1.0, 0.0, 0.04), 1.45 * L),
        ('превью_3_хвост.png', Vector((c.x, mn.y + 0.22 * L, c.z)), (0.8, -1.0, 0.45), 0.8 * L),
        ('превью_4_голова.png', Vector((c.x, mx.y - 0.18 * L, c.z)), (-0.8, 0.9, 0.35), 0.55 * L)]
    sc.render.engine = 'BLENDER_EEVEE'; sc.render.film_transparent = False
    sc.render.image_settings.color_mode = 'RGB'
    try: sc.view_settings.view_transform = 'Standard'
    except Exception: pass
    w = bpy.data.worlds.get(NAME + '_world') or bpy.data.worlds.new(NAME + '_world'); sc.world = w
    try: w.use_nodes = True
    except Exception: pass
    bgn = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bgn.inputs['Color'].default_value = (*bg, 1.0); bgn.inputs['Strength'].default_value = 1.0
    sun = bpy.data.objects.get(NAME + '_sun')
    if sun is None:
        sd = bpy.data.lights.new(NAME + '_sun', 'SUN'); sun = bpy.data.objects.new(NAME + '_sun', sd); col.objects.link(sun)
    sun.data.energy = 3.0; sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))
    cam = _camera(); cam.data.type = 'PERSP'; cam.data.lens = 50; cam.data.clip_start, cam.data.clip_end = 0.05, 100
    out = []
    for name, tgt, d, dist in views:
        dv = Vector(d).normalized(); cam.location = Vector(tgt) + dv * dist
        cam.rotation_euler = (Vector(tgt) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        out.append(_render(os.path.join(outdir, name), size[0], size[1]))
    return out


def passport(path, key, weapon, name, name_en, glb, blend, rev=1, build=(), previews_=(), checks=None, sketchfab=None, notes=''):
    """ПАСПОРТ.json для интегратора: числа берёт из сцены (stats), остальное — из аргументов. Файлы — имена внутри папки модели.
    sketchfab = {'title': …, 'lead': …, 'parts': […], 'tags': […]} — для текста карточки (только форма и сборка, без справок об изделии)."""
    st = stats(False); mats = {}
    for m in MATS:
        b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); mats[m.name] = [round(v, 4) for v in b.inputs['Base Color'].default_value[:3]]
    P = dict(key=key, weapon=weapon, name=name, name_en=name_en, rev=rev,
             files=dict(glb=glb, blend=blend, build=list(build), previews=list(previews_)),
             model=dict(length_m=st['length_m'], span_m=st['span_m'], height_m=st['height_m'], tris=st['tris'], materials=mats),
             checks=checks or {}, sketchfab=sketchfab or {}, notes=notes)
    with open(path, 'w', encoding='utf-8') as f: json.dump(P, f, ensure_ascii=False, indent=1)
    return P
