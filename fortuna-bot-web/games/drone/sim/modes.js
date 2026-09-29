// Режимы «Симулятора Летки» и характеристики «Изделия Фортуна-1» — общие для клиента и онлайн-сервера.
// Аркада прощает ошибки, Реализм — полная энергетика, только СПО/датчик пуска, умный противник, ×1,5 очков.
export const MODES = {
  arcade: { name: 'Аркада', desc: 'все ракеты видны на экране, меньше урона, больше ловушек, мягкий противник',
    gmax: 15, wCap: 1.15, agil: 11, vStall: 50, bleed: 0.5, dmgTaken: 0.5, aiSkill: 0.7, cm: 48, gunCone: 4, gunHome: 3, lockT: 0.25, fuelK: 1.4, drogueR: 60, allMissiles: true, scoreK: 1 },
  real: { name: 'Реализм', desc: 'только СПО и датчик пуска, полная энергетика и урон, опытный противник, очки ×1,5',
    gmax: 12, wCap: 0.9, agil: 8, vStall: 75, bleed: 1, dmgTaken: 0.9, aiSkill: 1, cm: 32, gunCone: 1.5, gunHome: 0, lockT: 0.5, fuelK: 1, drogueR: 32, allMissiles: false, scoreK: 1.5 },
};
// Обучение: по игроку пускают ракеты всех типов с подсказками и паузой-объяснением; проиграть нельзя, наград нет.
MODES.training = { name: 'Обучение', desc: 'по вам пускают разные ракеты, подсказки и объяснения с паузой, проиграть нельзя',
  gmax: 15, wCap: 1.15, agil: 11, vStall: 50, bleed: 0.5, dmgTaken: 0.3, aiSkill: 0.6, cm: 99, gunCone: 4, gunHome: 3, lockT: 0.25, fuelK: 1, fuelBurn: 0, drogueR: 60, allMissiles: true, scoreK: 0, training: true };

export const FUEL_START = 190, FUEL_MAX = 240, FUEL_PICKUP = 70; // топливо — в секундах полёта на крейсерском режиме

// «Изделие Фортуна-1»: беспилотник без лётчика — держит большую перегрузку, быстро отвечает на ручку, мощный двигатель.
// (перегрузка, угловая скорость, сваливание, потеря скорости и ловушки — из режима: см. applyMode в main.js)
export const DRONE = { milAcc: 16, abAcc: 34, cd0: 1.3e-4, rollK: 9, ir: 0.8, r: 7 };
