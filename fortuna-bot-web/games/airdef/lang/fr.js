// Французский словарь «русская строка → перевод» (i18n.js); части - как у английского (lang/en.js), порядок тот же. Нет строки - английская.
import training from './fr-training.js?v=20261119a';
import data from './fr-data.js?v=20261119a';
import guide from './fr-guide.js?v=20261119a';
import ui from './fr-ui.js?v=20261119a';
import battle from './fr-battle.js?v=20261119a';
export default { ...training, ...data, ...guide, ...ui, ...battle };
