# _nose_dump.py - кольца сечений носа и обтекателя пушки в json для наложения на фото 01 (после build.py)
import json, os, f4_geo as g
R = {'fore': [], 'gun': []}
for a in g.stations(g.TIP, 4.6, 0.12): R['fore'].append([list(p) for p in g.sup(a, 0.0, *[t(a) for t in g.FT], 48)])
for a in g.stations(g.NA(g.GUN_A0), 4.03, 0.12): R['gun'].append([list(p) for p in g.sup(a, 0.0, g.GUN[0](a), g.GUN[1](a), g.GUN[2](a), 2.2, 2.4, 32)])
R['rad'] = [list(p) for p in g.sup(g.RAD_A, 0.0, *[t(g.RAD_A) for t in g.FT], 64)]
json.dump(R, open(os.path.join(os.path.dirname(os.path.abspath(g.__file__)), '_live', 'nose_%s.json' % os.environ.get('F4_TAG', 'x')), 'w'))
