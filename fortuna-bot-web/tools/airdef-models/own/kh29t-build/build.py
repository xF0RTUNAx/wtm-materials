# Х-29Т — своя игровая модель по картинкам Mark (Свои/Х-29Т/1–7.png: два вида сбоку, спереди, сзади, окраска).
# Общие функции — ../_kit/modelkit.py, рецепт — ../_kit/README.md. Размеры ниже — в пикселях чертежа 4.png (нос слева, 1193 × 242).
# Запуск (рекомендуется — фоновый Blender, вместе с deliver.py: силуэты, превью, экспорт, паспорт):
#   K29_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python deliver.py
# или в живом Blender (blender-mcp):  p = '<путь к этому файлу>'; exec(compile(open(p, encoding='utf-8').read(), p, 'exec'))
import sys, importlib, math
sys.dont_write_bytecode = True                              # без __pycache__ в репозитории (папка набора — только для чтения)
sys.path.insert(0, '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit')
import modelkit as mk; importlib.reload(mk)
from modelkit import B, Vector, circ, profile, panel, prism, trap, rrect, ell, decal, Y, PR_WING, PR_PLATE, PR_FLAP

S = 3.896 / 1093.0          # метров на пиксель: длина как у прежней модели в игре (3,896 м)
mk.configure('KH29T', S, x0=604.0, yc=118.8, rb=54.0, nose='left')   # середина длины x=604, ось y=118,8, радиус корпуса 54 пикс., нос на чертеже слева
mk.set_materials([('K29_body', (0.50, 0.51, 0.49)), ('K29_wing', (0.40, 0.41, 0.40)),
                  ('K29_ctrl', (0.22, 0.23, 0.23)), ('K29_dark', (0.035, 0.036, 0.04))])
M_BODY, M_WING, M_CTRL, M_DARK = 0, 1, 2, 3
AZ = (45.0, 135.0, 225.0, 315.0)                           # оперение крестом ×

# ───────────────────────── корпус (вращение) ─────────────────────────
# (x, R, материал полосы до следующей точки)
BASE = [
    (76.0, 38.0, M_BODY), (77.0, 41.5, M_BODY), (79.5, 44.0, M_BODY), (83.5, 46.0, M_BODY), (90.0, 47.0, M_BODY),
    (108.0, 47.0, M_BODY), (139.0, 53.0, M_BODY), (139.0, 54.0, M_BODY),          # уступ у передней секции
    (1118.0, 54.0, M_BODY), (1146.0, 41.0, M_BODY), (1148.0, 41.0, M_DARK),        # хвостовой конус
    (1148.0, 36.0, M_DARK), (1141.0, 32.0, M_DARK), (1139.0, 24.0, M_DARK),        # торец и чаша сопла
]
GROOVES = [(90.0, 0.9, 0.9), (108.0, 0.9, 0.9), (235.0, 2.0, 1.1), (405.0, 2.4, 1.1), (500.0, 0.8, 0.7),
           (565.0, 0.8, 0.7), (680.0, 2.0, 1.1), (1112.0, 1.0, 0.8)]            # стыки отсеков
prof = profile(BASE, GROOVES)
b = B()
b.loft([circ(x, R) for x, R, _ in prof], [m for _, _, m in prof[:-1]], cap0=M_DARK, cap1=M_DARK)
b.finish('K29_body')

# ───────────────────────── крылья, рули, элевоны ─────────────────────────
tw = lambda r: 13.5 - (r - 51.0) * (7.0 / 101.7)                               # толщина крыла по радиусу

b = B()
for phi in AZ:
    panel(b, phi, [(51.0, 655.0, 1080.0, tw(51.0)), (77.8, 678.0, 1080.0, tw(77.8)), (152.7, 950.0, 1080.0, tw(152.7))], PR_WING, M_WING)
b.finish('K29_wings')

b = B()
for phi in AZ:
    panel(b, phi, [(53.0, 1055.0, 1080.0, tw(53.0) + 1.6), (112.0, 1055.0, 1080.0, tw(112.0) + 1.6)], PR_FLAP, M_CTRL)
b.finish('K29_elevons')

b = B()
for phi in AZ:
    panel(b, phi, [(51.0, 197.0, 312.0, 6.0), (106.0, 278.0, 312.0, 4.2)], PR_PLATE, M_WING)          # передние рули
    panel(b, phi, [(51.0, 129.0, 243.0, 5.0), (82.7, 145.0, 205.0, 4.0)], PR_PLATE, M_WING)            # передние гребни (наплывы)
b.finish('K29_canards')

# ───────────────────────── накладки на корпус (по цилиндру) ─────────────────────────
b = B()   # лючки — по обоим бортам
for sd in (1, -1):
    decal(b, 302.5, -5.2, rrect(27.5, 24.0, 6.0), sd, 1.4, M_WING)                  # большой лючок передней секции
    decal(b, 717.5, -2.2, rrect(17.5, 21.0, 5.0), sd, 1.2, M_WING)                  # лючок у корня крыла
    decal(b, 1100.0, -9.2, ell(18.0, 18.0, 14), sd, 1.0, M_WING)                    # круглая крышка хвостового отсека
for phi in AZ:                                                                       # шарнирные площадки передних рулей — на 45°
    decal(b, 263.0, 0.0, ell(25.0, 25.0, 16), 1, 2.4, M_CTRL, theta=math.radians(phi))
b.finish('K29_hatches')

b = B()   # тёмные овальные люки, гнёзда
for sd in (1, -1):
    for x, zz in ((248.0, 20.8), (248.0, -18.2), (396.5, 20.8), (396.5, -18.2), (677.0, 21.8), (677.0, -21.2)):
        decal(b, x, zz, ell(4.6, 7.4, 10), sd, 0.7, M_DARK)
    for x in (418.0, 660.0):
        decal(b, x, 0.8, ell(6.8, 6.8, 10), sd, 0.7, M_DARK)
b.finish('K29_slots')

# ───────────────────────── низ и верх корпуса ─────────────────────────
b = B()   # нижний кожух (трапеция) и три площадки на нём
prism(b, 315.0, 752.0, trap(14.5, -50.0, 8.5, -64.5), M_CTRL)
for x in (445.0, 548.0, 650.0):
    prism(b, x - 8.0, x + 8.0, trap(7.0, -62.0, 7.0, -65.6), M_DARK)
b.finish('K29_keel')

b = B()   # две подвесные проушины сверху (x 530–561)
for lat in (17.0, -17.0):
    pts = lambda lx: [Vector((lx * S, Y(530.0), 44.0 * S)), Vector((lx * S, Y(561.0), 44.0 * S)),
                      Vector((lx * S, Y(555.0), 62.5 * S)), Vector((lx * S, Y(536.0), 62.5 * S))]
    b.loft([pts(lat - 6.0), pts(lat + 6.0)], M_DARK, cap0=M_DARK, cap1=M_DARK)
b.finish('K29_lugs')

# ───────────────────────── носовая головка ─────────────────────────
b = B()   # купол головки: сферический сегмент, основание R=38 на x=76, вершина x=55 (пунктир на чертеже)
RS = (38.0 ** 2 + 21.0 ** 2) / (2 * 21.0)
b.loft([circ(55.0 + (RS - math.sqrt(RS * RS - z * z)), z, 28) for z in [38.0, 33.0, 27.0, 20.0, 13.0, 6.0]], M_DARK, cap0=M_DARK, cap1=M_DARK)
b.finish('K29_nose')

# ───────────────────────── задний отрезок кожуха и шаровые бобышки у корней крыльев ─────────────────────────
def ball(b, phi, x, r, n, R=6.0, mat=M_DARK):
    ph = math.radians(phi)
    d = Vector((math.cos(ph), 0.0, math.sin(ph))); nr = Vector((-math.sin(ph), 0.0, math.cos(ph)))
    c = (d * r + nr * n) * S                      # центр в плоскости XZ
    rings = []
    for k in range(1, 4):
        a = math.pi * k / 4.0
        yy, rr = R * math.cos(a), R * math.sin(a)
        rings.append([Vector((c.x + rr * S * math.cos(2 * math.pi * i / 6), Y(x) + yy * S, c.z + rr * S * math.sin(2 * math.pi * i / 6))) for i in range(6)])
    b.loft(rings, mat, cap0=mat, cap1=mat)

b = B()
prism(b, 1084.0, 1117.0, trap(12.5, -50.0, 8.0, -66.5), M_CTRL)
for phi in AZ:
    for sg in (1, -1):
        ball(b, phi, 748.0, 58.0, sg * 9.0)
b.finish('K29_keel_rear_balls')

mk.stats()
