# b2_geo_plan.py - план B-2A без Blender (копия начала b2_geo.py для наложений); создаётся из b2_geo.py
import math

L = 21.0                       # от носа до концов задней кромки
HS = 26.111                    # полуразмах
AT = 18.28                     # a концевой точки передней кромки
K = AT / HS                    # наклон всех кромок: стреловидность 35°
C1, C2, C3, C4 = 5.42, 24.35, 14.35, 20.40     # задняя кромка: a - kx = C1 (внешняя), a + kx = C2, a - kx = C3, a + kx = C4 (к центру)
X_N1 = (C2 - C1) / (2 * K)     # выемка у внешней кромки
X_A1 = (C2 - C3) / (2 * K)     # зубец
X_N2 = (C4 - C3) / (2 * K)     # выемка у выхлопа
X_TT = (2 * AT - C1) / (2 * K)  # конец крыла, задний угол
G_SKIN, G_METAL, G_DARK, G_GLASS, G_TYRE, G_COCK, G_HOT = 0, 1, 2, 3, 4, 5, 6
PARTS = {}
STATIONS = {}
BVH = {}


def Yb(a): return L / 2 - a


def a_le(x): return K * abs(x)


def a_te(x):
    x = abs(x)
    if x <= X_N2: return C4 - K * x
    if x <= X_A1: return C3 + K * x
    if x <= X_N1: return C2 - K * x
    if x <= X_TT: return C1 + K * x
    return 2 * AT - K * x


