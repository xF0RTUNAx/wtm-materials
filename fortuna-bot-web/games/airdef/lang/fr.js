// Французский словарь «русская строка → перевод» (i18n.js); части - как у английского (lang/en.js), порядок тот же. Нет строки - английская.
import training from './fr-training.js?v=20261119c';
import data from './fr-data.js?v=20261119c';
import guide from './fr-guide.js?v=20261119c';
import ui from './fr-ui.js?v=20261119c';
import battle from './fr-battle.js?v=20261119c';
export default { ...training, ...data, ...guide, ...ui, ...battle };
