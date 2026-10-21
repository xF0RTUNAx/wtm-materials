// Русские строки в коде игры, ещё не обёрнутые в tr(…) (или обёрнутые, но без перевода в словаре): файл:строка — текст.
//   deno run -A tools/i18n/scan.js games/airdef/menu.js [ещё файлы…]   (--all — показывать и обёрнутые; --miss — только без перевода)
// Комментарии не считаются. Ключи словаря — строки как в коде; шаблон `…${x}…` надо переписать в tr('…{0}…', [x]).
import * as acorn from 'npm:acorn@8.12.1';
import * as walk from 'npm:acorn-walk@8.3.3';
const args = Deno.args.filter((a) => !a.startsWith('--')), ALL = Deno.args.includes('--all'), MISS = Deno.args.includes('--miss');
const EN = (await import(new URL('../../games/airdef/lang/en.js', import.meta.url).href)).default;
const cyr = /[А-Яа-яЁё]/;
let total = 0, todo = 0, miss = 0;
for (const f of args) {
  const src = Deno.readTextFileSync(f), ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const out = [];
  walk.fullAncestor(ast, (node, _st, anc) => {
    let text = null;
    if (node.type === 'Literal' && typeof node.value === 'string' && cyr.test(node.value)) text = node.value;
    else if (node.type === 'TemplateLiteral' && node.quasis.some((q) => cyr.test(q.value.cooked || ''))) text = node.quasis.map((q, i) => q.value.cooked + (i < node.expressions.length ? `{${i}}` : '')).join('');
    if (text === null) return;
    const parent = anc[anc.length - 2], wrapped = parent && parent.type === 'CallExpression' && parent.callee && /^(tr|trIf)$/.test(parent.callee.name || '') && parent.arguments[0] === node;
    const isKey = parent && parent.type === 'Property' && parent.key === node;
    total++; if (!wrapped && !isKey) todo++; const has = EN[text] !== undefined; if (wrapped && !has) miss++;
    if (MISS ? wrapped && !has : ALL || (!wrapped && !isKey)) out.push(`${f}:${node.loc.start.line}  ${wrapped ? (has ? '✓ ' : '✗ ') : isKey ? 'ключ ' : '— '}${text.replace(/\s+/g, ' ').slice(0, 160)}`);
  });
  for (const l of out) console.log(l);
}
console.log(`\nрусских строк ${total}; не обёрнуто ${todo}; обёрнуто без перевода ${miss}`);
