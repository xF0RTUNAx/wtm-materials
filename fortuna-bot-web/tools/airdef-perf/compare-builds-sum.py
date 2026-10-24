# сводка cb-all.jsonl: по пресету — выигрыш при равном разрешении и «как есть» (своё разрешение каждой сборки) для классов устройств
import json, sys
rows = [json.loads(l) for l in open(sys.argv[1] if len(sys.argv) > 1 else 'cb-all.jsonl') if l.strip().startswith('{')]
OLD = {'low': 1.25, 'medium': 1.25, 'high': 1.5, 'ultra': 1.5}            # 20261022v на телефоне и планшете (applyGfx/touchGfx)
NEW = {'iphone': {'low': 1.5, 'medium': 1.75, 'high': 1.75, 'ultra': 1.75},  # gpu.js sharpFor: 12/13/14, 14 Plus (8500–8800)
       'ipad': {'low': 1.5, 'medium': 2, 'high': 2, 'ultra': 2}}            # M1 и новее (15000), 15 Pro и новее (11000+)
def tot(r, b, pr): return sum(r['builds'][b]['cells'][f'{pr}|{v}']['ms'] for v in range(3))
def pct(a, b): return (a / b - 1) * 100
out = {}
for r in rows:
    p, m = r['preset'], r['map']
    eq = [pct(tot(r, 'now', pr), tot(r, 'base', pr)) for pr in r['prs']]
    eqs = [pct(tot(r, 'site', pr), tot(r, 'base', pr)) for pr in r['prs']]
    o = out.setdefault(p, {})
    o[m] = {'eq_now': sum(eq) / len(eq), 'eq_site': sum(eqs) / len(eqs),
            'iphone': pct(tot(r, 'now', NEW['iphone'][p]), tot(r, 'base', OLD[p])),
            'ipad': pct(tot(r, 'now', NEW['ipad'][p]), tot(r, 'base', OLD[p])),
            'calls': [r['builds'][b]['cells'][f"{r['prs'][0]}|0"]['calls'] for b in ('base', 'site', 'now')]}
for p in ('low', 'medium', 'high', 'ultra'):
    if p not in out: continue
    ms = out[p]; avg = lambda k: sum(ms[m][k] for m in ms) / len(ms)
    px_i = (NEW['iphone'][p] / OLD[p]) ** 2 * 100 - 100; px_a = (NEW['ipad'][p] / OLD[p]) ** 2 * 100 - 100
    print(f"{p:7s} равное разрешение: сайт {avg('eq_site'):+5.0f} %, сейчас {avg('eq_now'):+5.0f} %  ·  как есть iPhone 12–14 (пикселей {px_i:+.0f} %): {avg('iphone'):+5.0f} %  ·  iPad M1 (пикселей {px_a:+.0f} %): {avg('ipad'):+5.0f} %")
    for m in ms: print(f"   {m:7s} равное {ms[m]['eq_now']:+5.0f} % (сайт {ms[m]['eq_site']:+4.0f}) · iPhone {ms[m]['iphone']:+5.0f} % · iPad {ms[m]['ipad']:+5.0f} % · вызовов до/сайт/сейчас {ms[m]['calls']}")
