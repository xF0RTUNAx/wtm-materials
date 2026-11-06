# harlequin_pat.py - узор «Арлекин» (ключ e_typhoon:harlequin) для новой модели: те же слои CSS темы профиля и та же композиция, что в Камуфляжи/e_typhoon/paint.py (вариант 2, выбран Mark 2026-10-26).
# Оси как у старой модели: x вправо, y к носу, центр по длине совпадает; z старой модели отсчитан от середины её высоты, у новой середина выше: z_old = z - ZC.
import math
import numpy as np


def hx(h): return np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)], np.float32)


def stops(t, st):
    """Цветовые точки CSS: st - [(доля, цвет)], между ними линейно, повтор доли - резкий край; вне - крайний цвет."""
    t = np.asarray(t, np.float32); out = np.zeros(t.shape + (3,), np.float32)
    ps = [p for p, _ in st]; cs = [hx(c) for _, c in st]
    out[:] = cs[0]
    for k in range(len(st) - 1):
        p0, p1 = ps[k], ps[k + 1]
        m = (t >= p0) & (t <= p1); f = np.clip((t - p0) / max(p1 - p0, 1e-6), 0, 1)[..., None]
        out[m] = (cs[k] * (1 - f) + cs[k + 1] * f)[m]
    out[t > ps[-1]] = cs[-1]
    return out


def lin(u, v, deg, st):
    a = math.radians(deg); dx, dy = math.sin(a), -math.cos(a); L = abs(math.sin(a)) + abs(math.cos(a))
    return stops(((u - 0.5) * dx + (v - 0.5) * dy) / L + 0.5, st)


def rad(u, v, rx, ry, cx, cy, st): return stops(np.sqrt(((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2), st)
def multiply(b, s): return b * s
def screen(b, s): return b + s - b * s
def hardlight(b, s): return np.where(s <= 0.5, multiply(b, 2 * s), screen(b, 2 * s - 1))
def overlay(b, s): return hardlight(s, b)


EPS = 0.0005
def harlequin(u, v):
    L6 = lin(u, v, 65, [(0, '#083836'), (0.40, '#083836'), (0.40 + EPS, '#66d37e'), (0.60, '#66d37e'), (0.60 + EPS, '#c6e872'), (1, '#c6e872')])
    L5 = rad(u, v, 1.15, 1.07, 0.40, 1.00, [(0, '#eaf5ff'), (0.40, '#eaf5ff'), (0.40 + EPS, '#a9c6de'), (0.70, '#a9c6de'), (0.70 + 2 * EPS, '#247e6c'), (0.85, '#247e6c'), (0.85 + 2 * EPS, '#e4c666'), (1, '#e4c666')])
    L4 = lin(u, v, 245, [(0, '#000000'), (1, '#ffb800')]); L3 = rad(u, v, 1.0, 2.25, 1.0, 0.0, [(0, '#4200ff'), (1, '#001169')])
    L2 = lin(u, v, 245, [(0, '#0038ff'), (1, '#000000')]); L1 = lin(u, v, 245, [(0, '#000000'), (1, '#fdff96')])
    c = L6; c = overlay(c, L5); c = hardlight(c, L4); c = overlay(c, L3); c = screen(c, L2); c = overlay(c, L1)
    return np.clip(c, 0, 1)


BOX = 10.0; RCX, RCY = -1.4, -2.2; XC, YC = RCX + 0.1 * BOX, RCY + 0.5 * BOX; KZ = 0.6; ZC = 0.995; KANT = 0.03; KCOL = hx('#07080f')


def pattern(x, y, z):
    """Цвет sRGB в точке самолёта: коробка CSS 10×10 м, центр колец у корня левого крыла, высота сдвигает полосы вбок (на киле они идут наискосок), по резким границам тонкий тёмный кант."""
    u = (x - XC + KZ * (z - ZC)) / BOX + 0.5; v = -(y - YC) / BOX + 0.5
    c = harlequin(u, v)
    a65 = math.radians(65); len65 = abs(math.sin(a65)) + abs(math.cos(a65)); t65 = ((u - 0.5) * math.sin(a65) + (v - 0.5) * -math.cos(a65)) / len65 + 0.5
    dist = np.minimum(np.abs(t65 - 0.40), np.abs(t65 - 0.60)) * len65 * BOX; tr = np.sqrt(((u - 0.40) / 1.15) ** 2 + ((v - 1.00) / 1.07) ** 2)
    for r0 in (0.40, 0.70, 0.85): dist = np.minimum(dist, np.abs(tr - r0) * 1.11 * BOX)
    k = np.clip(1 - (dist - KANT / 2) / 0.006, 0, 1)[..., None] * 0.92
    return (c * (1 - k) + KCOL * k).astype(np.float32)
