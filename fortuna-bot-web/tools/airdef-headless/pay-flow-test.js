// Проверка _shared/airdef-pay.ts без Telegram и без базы: заглушки fetch (Bot API) и db.rpc. Счёт (цена с сервера, payload - номер заказа),
// ответ на pre_checkout_query (да / нет), начисление по successful_payment (валюта и сумма - дальше в SQL), ошибки начисления - Mark'у,
// возврат по refunded_payment, /paysupport и /terms - всем, /refund - только SUPPORT_ADMIN_ID.
//   deno run -A tools/airdef-headless/pay-flow-test.js
Deno.env.set('TG_SUPPORT_TOKEN', 'TEST:token'); Deno.env.set('SUPPORT_ADMIN_ID', '42');
const { makeInvoice, payUpdate, orderState } = await import('../../supabase/functions/_shared/airdef-pay.ts');
const { PAY } = await import('../../games/airdef/arsenal.js');
let bad = 0; const ok = (c, t) => { console.log((c ? 'OK   ' : 'ОШИБКА ') + t); if (!c) bad++; };
const calls = []; let tgOk = true;
globalThis.fetch = async (url, init) => { const m = String(url).split('/').pop(), b = JSON.parse(init.body); calls.push([m, b]); return new Response(JSON.stringify(tgOk ? { ok: true, result: m === 'createInvoiceLink' ? 'https://t.me/$abc' : m === 'sendMessage' ? { message_id: 1 } : true } : { ok: false, description: 'x' })); };
const OID = '11111111-2222-3333-4444-555555555555';
const rpcs = []; let next = {};
const db = {
  // как в supabase-js: rpc отдаёт «thenable» без .catch / .finally (настоящий Promise в заглушке прятал ошибку 2026-11-19)
  rpc: (fn, a) => { rpcs.push([fn, a]); const r = { data: next[fn] !== undefined ? next[fn] : null, error: null }; return { then: (ok, bad) => Promise.resolve(r).then(ok, bad) }; },
  from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: next.row ?? null, error: null }) }; return q; },
};
const last = (m) => [...calls].reverse().find((c) => c[0] === m)?.[1];

// счёт
next.airdef_order_new = { id: OID };
let r = await makeInvoice(db, 'p1', 'prem_7d', 'de', true);
const inv = last('createInvoiceLink'), on = rpcs.at(-1);
ok(r.link === 'https://t.me/$abc' && r.order === OID, 'счёт: ссылка и номер заказа');
ok(on[0] === 'airdef_order_new' && on[1].p_consent === true && on[1].p_stars === PAY.prem_7d.stars && on[1].p_days === 7 && on[1].p_gems === 0, 'заказ: цена и дни - из каталога сервера');
ok(inv.currency === 'XTR' && inv.payload === OID && inv.prices[0].amount === PAY.prem_7d.stars && /Premium für 7 Tage/.test(inv.title), `счёт Telegram: XTR, payload - заказ, название по-немецки («${inv.title}»)`);
ok(!('provider_token' in inv) || inv.provider_token === '', 'Stars: без платёжного провайдера');
ok((await makeInvoice(db, 'p1', 'free_stuff', 'ru')).code === 'bad_sku', 'неизвестный товар - отказ, без заказа');
ok((await makeInvoice(db, 'p1', '__proto__', 'ru')).code === 'bad_sku', '__proto__ - не товар');
next.airdef_order_new = { error: 'too_many' };
ok((await makeInvoice(db, 'p1', 'gems_100', 'ru')).code === 'too_many', 'слишком много счетов - код too_many');

// перед списанием
next.airdef_pay_check = 'ok';
ok(await payUpdate(db, { pre_checkout_query: { id: 'q1', currency: 'XTR', invoice_payload: OID, total_amount: 125, from: { language_code: 'ru' } } }), 'pre_checkout_query обработан');
ok(last('answerPreCheckoutQuery').ok === true && rpcs.at(-1)[1].p_stars === 125, 'проверка прошла - ok: true, сумма передана в SQL');
next.airdef_pay_check = 'not_new';
await payUpdate(db, { pre_checkout_query: { id: 'q2', currency: 'XTR', invoice_payload: OID, total_amount: 125, from: { language_code: 'fr' } } });
let a = last('answerPreCheckoutQuery');
ok(a.ok === false && /facture/.test(a.error_message), 'заказ не новый - ok: false с текстом на языке плательщика');
const n0 = rpcs.length;
await payUpdate(db, { pre_checkout_query: { id: 'q3', currency: 'USD', invoice_payload: OID, total_amount: 125 } });
ok(last('answerPreCheckoutQuery').ok === false && rpcs.length === n0, 'не XTR - отказ без обращения к базе');
await payUpdate(db, { pre_checkout_query: { id: 'q4', currency: 'XTR', invoice_payload: "x'; drop", total_amount: 125 } });
ok(last('answerPreCheckoutQuery').ok === false && rpcs.length === n0, 'payload не номер заказа - отказ без обращения к базе');

// оплата
const pay = (o = {}) => ({ message: { chat: { id: 900, type: 'private' }, from: { id: 900, language_code: 'uk' }, successful_payment: { currency: 'XTR', total_amount: 125, invoice_payload: OID, telegram_payment_charge_id: 'stxABC', ...o } } });
next.airdef_pay_credit = { ok: true, player: 'p1', sku: 'prem_7d' };
calls.length = 0;
ok(await payUpdate(db, pay()), 'successful_payment обработан');
const cr = rpcs.at(-1);
ok(cr[0] === 'airdef_pay_credit' && cr[1].p_charge === 'stxABC' && cr[1].p_stars === 125 && cr[1].p_tg === 900, 'начисление: charge id, сумма, плательщик');
const msgs = calls.filter((c) => c[0] === 'sendMessage');
ok(msgs.some((c) => c[1].chat_id === 900 && /Дякуємо/.test(c[1].text) && /7 днів/.test(c[1].text) && /відмовитися/.test(c[1].text)), 'плательщику - спасибо по-украински и подтверждение немедленного старта премиума');
ok(msgs.some((c) => c[1].chat_id === 42 && /Покупка/.test(c[1].text)), 'Mark - уведомление о покупке');
next.airdef_pay_credit = { error: 'no_player' }; calls.length = 0;
await payUpdate(db, pay());
ok(calls.some((c) => c[0] === 'sendMessage' && c[1].chat_id === 42 && /\/refund stxABC/.test(c[1].text)), 'не зачислено - Mark получает команду возврата');
next.airdef_pay_credit = { dup: true }; calls.length = 0;
await payUpdate(db, pay());
ok(!calls.some((c) => c[0] === 'sendMessage'), 'повтор того же платежа - ничего не пишет');

// возврат
next.airdef_pay_refund = { ok: true, gems: 0 };
ok(await payUpdate(db, { message: { chat: { id: 900 }, from: { id: 900 }, refunded_payment: { currency: 'XTR', total_amount: 125, telegram_payment_charge_id: 'stxABC' } } }) && rpcs.at(-1)[0] === 'airdef_pay_refund', 'refunded_payment - возврат в базе');
next.row = { tg_user: 900, stars: 125, sku: 'prem_7d', status: 'paid' }; calls.length = 0;
const nR = rpcs.length;
ok(await payUpdate(db, { message: { chat: { id: 900 }, from: { id: 900 }, text: '/refund stxABC' } }) === false && !calls.length && rpcs.length === nR, '/refund от игрока - не команда');
await payUpdate(db, { message: { chat: { id: 42 }, from: { id: 42 }, text: '/refund stxABC' } });
ok(!last('refundStarPayment') && /Подтвердить: \/refund stxABC ok/.test(last('sendMessage').text), '/refund без ok - только сводка и команда подтверждения');
await payUpdate(db, { message: { chat: { id: 42 }, from: { id: 42 }, text: '/refund stxABC ok' } });
const rs = last('refundStarPayment');
ok(rs && rs.user_id === 900 && rs.telegram_payment_charge_id === 'stxABC' && rpcs.at(-1)[0] === 'airdef_pay_refund', '/refund от Mark: звёзды назад плательщику, покупка снята');
next.row = { tg_user: 900, stars: 125, sku: 'prem_7d', status: 'refunded' }; calls.length = 0;
await payUpdate(db, { message: { chat: { id: 42 }, from: { id: 42 }, text: '/refund stxABC ok' } });
ok(!last('refundStarPayment') && /уже возвращён/.test(last('sendMessage').text), 'второй /refund - «уже возвращён», без запроса к Telegram');

// команды
calls.length = 0;
ok(await payUpdate(db, { message: { chat: { id: 7 }, from: { id: 7, language_code: 'es' }, text: '/paysupport' } }) && /support@airsuperiorityonline\.com/.test(last('sendMessage').text) && /terms\.html\?lang=es/.test(last('sendMessage').text), '/paysupport - почта и условия на языке');
ok(await payUpdate(db, { message: { chat: { id: 7 }, from: { id: 7 }, text: '/terms' } }) && /terms\.html\?lang=en/.test(last('sendMessage').text), '/terms - условия (неизвестный язык - английский)');
ok(await payUpdate(db, { message: { chat: { id: 7 }, from: { id: 7 }, text: 'привет' } }) === false, 'обычное сообщение - не про оплату (дальше - бот поддержки)');
ok(await payUpdate(db, { callback_query: { id: 'c' } }) === false, 'кнопка - не про оплату');

// состояние заказа
next.row = { status: 'paid' };
ok(await orderState(db, 'p1', OID) === 'paid' && await orderState(db, 'p1', 'nope') === null, 'состояние заказа: по номеру, мусор - null');
console.log(bad ? `ОШИБОК: ${bad}` : 'итог: ошибок нет');
Deno.exit(bad ? 1 : 0);
