// Украинский словарь «русская строка → перевод» (i18n.js); части - как у английского (lang/en.js), порядок тот же. Нет строки - английская.
import training from './uk-training.js?v=20261120a';
import data from './uk-data.js?v=20261120a';
import guide from './uk-guide.js?v=20261120a';
import ui from './uk-ui.js?v=20261120a';
import battle from './uk-battle.js?v=20261120a';
export default { ...training, ...data, ...guide, ...ui, ...battle };
