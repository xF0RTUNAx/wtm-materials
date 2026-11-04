// Аватарки игрока (Mark 2026-11-04): путь к картинке и своя надетая. Каталог и цена - arsenal.js, покупка - магазин (shop-ui.js), чужие - из ответов рейтинга, профиля и комнаты онлайна.
import { AVA_DEFAULT, AVA_SHOP } from './arsenal.js?v=20261104a';

// неизвестный номер и «нет аватарки» - та, что у всех по умолчанию; big - большая для магазина (у аватарки по умолчанию её нет)
export function avaSrc(id, big) {
  const shop = AVA_SHOP.includes(id);
  return `airdef/ui/avatars/${shop ? id : AVA_DEFAULT}${big && shop ? '_l' : ''}.webp`;
}
// своя надетая по кошельку магазина; кошелёк ещё не пришёл - fb (из ответа сервера)
export function ownAva(C, fb) {
  const w = C.shop && C.shop.wallet && C.shop.wallet();
  return w ? (w.worn || {}).ava || null : fb || null;
}
