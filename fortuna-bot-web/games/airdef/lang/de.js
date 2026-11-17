// Немецкий словарь «русская строка → перевод» (i18n.js); части - как у английского (lang/en.js), порядок тот же. Нет строки - английская.
import training from './de-training.js?v=20261117d';
import data from './de-data.js?v=20261117d';
import guide from './de-guide.js?v=20261117d';
import ui from './de-ui.js?v=20261117d';
import battle from './de-battle.js?v=20261117d';
export default { ...training, ...data, ...guide, ...ui, ...battle };
