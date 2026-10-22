// Английский словарь «русская строка → английская» (i18n.js). Части — по файлам игры; ключ — строка как в коде (с HTML и
// подстановками {0}, {1}…). Названия: советская техника — латиницей (FAB-500, Kh-29T, S-300), западная — оригинальные;
// карты и цели — по смыслу («Туманная топь» → Misty Mire). Нет перевода — игра покажет русский.
// Порядок: training, data, guide, ui, battle — при совпадении ключа побеждает более поздний (ui и battle).
import data from './en-data.js?v=20261022t';
import guide from './en-guide.js?v=20261022t';
import training from './en-training.js?v=20261022t';
import ui from './en-ui.js?v=20261022t';
import battle from './en-battle.js?v=20261022t';
export default { ...training, ...data, ...guide, ...ui, ...battle }; // одинаковый ключ — побеждает интерфейс и бой (этап 1)
