// Испанский словарь «русская строка → перевод» (i18n.js); части - как у английского (lang/en.js), порядок тот же. Нет строки - английская.
import training from './es-training.js?v=20261119c';
import data from './es-data.js?v=20261119c';
import guide from './es-guide.js?v=20261119c';
import ui from './es-ui.js?v=20261119c';
import battle from './es-battle.js?v=20261119c';
export default { ...training, ...data, ...guide, ...ui, ...battle };
