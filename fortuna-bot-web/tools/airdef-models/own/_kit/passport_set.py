"""Правка поля ПАСПОРТ.json из терминала (например, записать итог проверки в игре).

  /usr/bin/python3 -I passport_set.py <ПАСПОРТ.json> <поле.через.точку> <значение>

Значение — строка; если оно похоже на JSON (начинается с { [ или цифры, либо true / false / null), разбирается как JSON. Пример:
  /usr/bin/python3 -I passport_set.py ПАСПОРТ.json checks.game "миниатюра, полёт и подвеска: кандидат взят, ошибок нет; сидит ровно"
"""
import sys, json

if len(sys.argv) < 4: print(__doc__); sys.exit(1)
p, path, val = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    if val[:1] in '{["' or val in ('true', 'false', 'null') or val.replace('.', '', 1).lstrip('-').isdigit(): val = json.loads(val)
except Exception:
    pass
P = json.load(open(p, encoding='utf-8')); d = P; ks = path.split('.')
for k in ks[:-1]: d = d.setdefault(k, {})
d[ks[-1]] = val
with open(p, 'w', encoding='utf-8') as f: json.dump(P, f, ensure_ascii=False, indent=1)
print(f'{path} = {json.dumps(val, ensure_ascii=False)}')
