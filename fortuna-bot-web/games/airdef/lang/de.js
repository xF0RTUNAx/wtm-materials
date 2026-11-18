// Немецкий словарь «русская строка → перевод» (i18n.js); части - как у английского (lang/en.js), порядок тот же. Нет строки - английская.
import training from './de-training.js?v=20261118c';
import data from './de-data.js?v=20261118c';
import guide from './de-guide.js?v=20261118c';
import ui from './de-ui.js?v=20261118c';
import battle from './de-battle.js?v=20261118c';
export default { ...training, ...data, ...guide, ...ui, ...battle };
