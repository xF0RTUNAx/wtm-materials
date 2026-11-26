// Немецкий словарь «русская строка → перевод» (i18n.js); части - как у английского (lang/en.js), порядок тот же. Нет строки - английская.
import training from './de-training.js?v=20261126a';
import data from './de-data.js?v=20261126a';
import guide from './de-guide.js?v=20261126a';
import ui from './de-ui.js?v=20261126a';
import battle from './de-battle.js?v=20261126a';
export default { ...training, ...data, ...guide, ...ui, ...battle };
