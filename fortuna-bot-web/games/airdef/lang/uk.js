// Украинский словарь «русская строка → перевод» (i18n.js); части - как у английского (lang/en.js), порядок тот же. Нет строки - английская.
import training from './uk-training.js?v=20261117d';
import data from './uk-data.js?v=20261117d';
import guide from './uk-guide.js?v=20261117d';
import ui from './uk-ui.js?v=20261117d';
import battle from './uk-battle.js?v=20261117d';
export default { ...training, ...data, ...guide, ...ui, ...battle };
