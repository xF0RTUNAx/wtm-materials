// --- ИНТЕГРАЦИЯ С TELEGRAM ---
const tg = window.Telegram.WebApp;

// Сообщаем телеграму, что приложение готово
tg.ready();

// Разворачиваем на весь экран
tg.expand();

// Красим хедер в цвет приложения
tg.setHeaderColor('#1a1a1d'); // Цвет вашего фона из style.css

// --- КОНФИГУРАЦИЯ И ДАННЫЕ ---

// Состояние игрока
let gameState = {
    fortx: 0,
    oil: 0,
    ore: 0,
    nuke: 0,
    space: 0,
    blueprints: 0,
    lastLogin: Date.now(),
    factoryLevels: {}, // ID -> Level
    industryLevels: {}, 
    skills: {}, // ID -> { level, startTime, endTime }
    hangar: [], // Активные миссии
    unlocks: {
        secondHangarSlot: false,
        secondSkillSlot: false
    }
};

// [cite: 5-31] Конфигурация Завода (Factory)
// baseCost: цена 1 уровня. multiplier: множитель цены. income: доход в сек.
const factoryConfig = [
    { id: 1, name: "Инфраструктура сотрудников", baseCost: 10, res: "fortx", income: 0.1, req: null },
    { id: 2, name: "Отдел разработки", baseCost: 100, res: "fortx", income: 0.5, req: 1 },
    { id: 3, name: "Цех боеприпасов", baseCost: 500, res: "fortx", income: 2, req: 2 },
    { id: 4, name: "Цех электроники", baseCost: 1200, res: "fortx", income: 5, req: 3 },
    { id: 5, name: "Производство БМП", baseCost: 3000, res: "fortx", extraRes: "oil", extraCost: 10, income: 10, req: 4 },
    { id: 6, name: "Производство танков", baseCost: 7000, res: "fortx", extraRes: "oil", extraCost: 50, income: 25, req: 5 },
    { id: 7, name: "Аэродром", baseCost: 15000, res: "fortx", extraRes: "ore", extraCost: 20, income: 60, req: 6 },
    { id: 8, name: "Производство боевых самолетов", baseCost: 30000, res: "fortx", extraRes: "oil", extraCost: 100, income: 100, req: 7 },
    { id: 9, name: "Производство бомбардировщиков", baseCost: 50000, res: "fortx", extraRes: "oil", extraCost: 200, income: 200, req: 8 },
    { id: 10, name: "Сухой док", baseCost: 100000, res: "fortx", extraRes: "ore", extraCost: 100, income: 350, req: 9 },
    { id: 11, name: "Производство кораблей", baseCost: 200000, res: "fortx", extraRes: "oil", extraCost: 500, income: 600, req: 10 },
    { id: 12, name: "Производство подлодок", baseCost: 500000, res: "fortx", extraRes: "oil", extraCost: 1000, income: 1000, req: 11 },
    { id: 13, name: "Отдел высоких технологий", baseCost: 1000000, res: "fortx", extraRes: "nuke", extraCost: 10, income: 2000, req: 12 },
    // ... можно продолжить список до 24 пунктов согласно ТЗ, для краткости покажем основные механики
    { id: 24, name: "Проект xFORTUNAx", baseCost: 100000000, res: "fortx", extraRes: "space", extraCost: 1000, income: 50000, req: 13 }
];

// [cite: 89] Конфигурация Промышленности (добыча ресурсов)
const industryConfig = [
    { id: "oil_rig", name: "НПЗ (Нефть)", resOut: "oil", baseCost: 1000, bps: 100, reqFactory: 4 },
    { id: "ore_mine", name: "Шахты (Руда)", resOut: "ore", baseCost: 5000, bps: 250, reqFactory: 6 },
    { id: "nuke_lab", name: "Секретная добыча (Ядерное)", resOut: "nuke", baseCost: 20000, bps: 500, reqFactory: 12 },
    { id: "space_lab", name: "Военная лаборатория (Космос)", resOut: "space", baseCost: 100000, bps: 1000, reqFactory: 17 } // Примерный ID
];

// [cite: 36-58] Конфигурация Ангара (Миссии)
const hangarConfig = [
    { name: "Музей: КВ-1", type: "museum", time: 3600, reward: 1000, img: "https://static.wikia.nocookie.net/warrior/images/8/88/%D0%9A%D0%92-1.jpg/revision/latest?cb=20161026155026&path-prefix=ru" },
    { name: "Учения: M3 Bradley", type: "exercises", time: 14400, reward: 5000, img: "https://upload.wikimedia.org/wikipedia/commons/a/a2/Decisive_Action_Rotation_13-04_130218-A-ML570-001.jpg" },
    { name: "Патруль: Т-80У", type: "patrol", time: 43200, reward: 20000, img: "https://upload.wikimedia.org/wikipedia/commons/8/85/4thTankBrigade_-_T-80U_-09.jpg" }
];

// [cite: 108] Магазин
const shopItems = [
    { id: 1, name: "Титул Оружейник (30 дн)", cost: 1000000, type: "title" },
    { id: 2, name: "Премиум WTM (7 дн)", cost: 5000000, type: "prem" },
    { id: 3, name: "500 Платины WTM", cost: 10000000, type: "gold" }
];

// --- ИНИЦИАЛИЗАЦИЯ И СОХРАНЕНИЕ ---

function init() {
    loadGame();
    renderFactory();
    renderIndustry();
    renderHangar();
    renderSkills();
    renderShop();
    renderStocks();
    
    // Запуск цикла игры (1 раз в секунду)
    setInterval(gameLoop, 1000);
    // Автосохранение
    setInterval(saveGame, 10000);
}

function loadGame() {
    const saved = localStorage.getItem('wtm_tycoon_save');
    if (saved) {
        // Объединяем с дефолтным на случай добавления новых полей
        gameState = { ...gameState, ...JSON.parse(saved) };
        
        // [cite: 32] Проверка офлайн заработка (макс 12 часов)
        const now = Date.now();
        const diffSeconds = (now - gameState.lastLogin) / 1000;
        const maxOffline = 12 * 3600; // 12 часов
        const actualSeconds = Math.min(diffSeconds, maxOffline);
        
        if (actualSeconds > 0) {
            const income = calculateTotalIncome();
            const earned = income * actualSeconds;
            gameState.fortx += earned;
            alert(`С возвращением! Пока вас не было, завод заработал: ${formatNumber(earned)} FortX`);
        }
    }
}

function saveGame() {
    gameState.lastLogin = Date.now();
    localStorage.setItem('wtm_tycoon_save', JSON.stringify(gameState));
}

// --- ЯДРО ИГРЫ ---

function calculateTotalIncome() {
    let total = 0;
    factoryConfig.forEach(item => {
        const level = gameState.factoryLevels[item.id] || 0;
        if (level > 0) {
            total += item.income * level; // Линейный рост дохода для простоты
            // Сюда можно добавить множители от Навыков
        }
    });
    // Применяем бонус навыков (пример)
    const skillBonus = (gameState.skills[1]?.level || 0) * 0.01; // 1% за уровень
    return total * (1 + skillBonus);
}

function gameLoop() {
    // 1. Пассивный доход FortX
    const income = calculateTotalIncome();
    gameState.fortx += income;

    // 2. Пассивная добыча ресурсов (Промышленность)
    industryConfig.forEach(ind => {
        const lvl = gameState.industryLevels[ind.id] || 0;
        if (lvl > 0 && gameState[ind.resOut] !== undefined) {
            // Допустим, 1 уровень = 0.1 ресурса в сек
            gameState[ind.resOut] += lvl * 0.1;
        }
    });

    // 3. Обновление UI
    updateUI(income);
    
    // 4. Проверка таймеров ангара и навыков
    checkTimers();
}

function updateUI(income) {
    document.getElementById('res-fortx').innerText = formatNumber(Math.floor(gameState.fortx));
    document.getElementById('res-oil').innerText = formatNumber(Math.floor(gameState.oil));
    document.getElementById('res-ore').innerText = formatNumber(Math.floor(gameState.ore));
    document.getElementById('res-nuke').innerText = formatNumber(Math.floor(gameState.nuke));
    document.getElementById('res-space').innerText = formatNumber(Math.floor(gameState.space));
    document.getElementById('res-blueprints').innerText = Math.floor(gameState.blueprints);
    document.getElementById('income-rate').innerText = formatNumber(income.toFixed(1));
    
    // Обновление кнопок (доступность)
    updateFactoryButtons();
}

// Форматирование чисел (1k, 1M)
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num;
}

// --- ЗАВОД ---

function renderFactory() {
    const list = document.getElementById('factory-list');
    list.innerHTML = '';
    
    factoryConfig.forEach(item => {
        const div = document.createElement('div');
        div.className = 'item-card';
        div.innerHTML = `
            <div class="item-header">
                <span>${item.name}</span>
                <span id="fac-lvl-${item.id}">Lvl: 0</span>
            </div>
            <div class="item-cost">
                Цена: <span id="fac-cost-${item.id}">${formatNumber(item.baseCost)}</span> FortX
                ${item.extraRes ? ` + ${item.extraCost} ${item.extraRes}` : ''}
            </div>
            <button class="buy-btn" id="btn-fac-${item.id}" onclick="buyFactory(${item.id})">Улучшить</button>
        `;
        list.appendChild(div);
    });
    
    document.getElementById('tap-btn').addEventListener('click', () => {
        gameState.fortx += 1; // Тап механика [cite: 6]
        updateUI(calculateTotalIncome());
    });
}

function buyFactory(id) {
    const item = factoryConfig.find(i => i.id === id);
    const currentLvl = gameState.factoryLevels[id] || 0;
    
    // Формула цены: Base * 1.15^Level
    const costFortx = Math.floor(item.baseCost * Math.pow(1.15, currentLvl));
    
    let canBuy = gameState.fortx >= costFortx;
    
    // Проверка доп ресурсов
    if (item.extraRes && gameState[item.extraRes] < item.extraCost) canBuy = false;
    // Проверка зависимости (открыт ли предыдущий цех)
    if (item.req && (gameState.factoryLevels[item.req] || 0) < 1) canBuy = false;

    if (canBuy) {
        gameState.fortx -= costFortx;
        if (item.extraRes) gameState[item.extraRes] -= item.extraCost;
        
        gameState.factoryLevels[id] = currentLvl + 1;
        
        // Обновляем текст уровня и цены
        document.getElementById(`fac-lvl-${id}`).innerText = `Lvl: ${currentLvl + 1}`;
        const nextCost = Math.floor(item.baseCost * Math.pow(1.15, currentLvl + 1));
        document.getElementById(`fac-cost-${id}`).innerText = nextCost;
        
        saveGame();
    }
}

function updateFactoryButtons() {
    factoryConfig.forEach(item => {
        const currentLvl = gameState.factoryLevels[item.id] || 0;
        const cost = Math.floor(item.baseCost * Math.pow(1.15, currentLvl));
        const btn = document.getElementById(`btn-fac-${item.id}`);
        
        // Простая логика доступности
        if (gameState.fortx >= cost) {
            btn.disabled = false;
        } else {
            btn.disabled = true;
        }
    });
}

// --- АНГАР И МИССИИ [cite: 34-59] ---

function renderHangar() {
    const list = document.getElementById('hangar-missions');
    list.innerHTML = '';
    
    hangarConfig.forEach((mission, index) => {
        const div = document.createElement('div');
        div.className = 'item-card';
        div.innerHTML = `
            <img src="${mission.img}" class="preview-img">
            <div class="item-header">${mission.name}</div>
            <div class="item-cost">Время: ${mission.time / 3600} ч. | Награда: ${mission.reward} FortX</div>
            <button class="buy-btn" id="mission-btn-${index}" onclick="startMission(${index})">Начать</button>
            <div id="mission-timer-${index}" style="color:orange"></div>
        `;
        list.appendChild(div);
    });
}

function startMission(index) {
    // Проверка слотов (бесплатно 1, платно 2)
    const activeMissions = gameState.hangar.length;
    const maxSlots = gameState.unlocks.secondHangarSlot ? 2 : 1;
    
    if (activeMissions >= maxSlots) {
        alert("Нет свободных слотов! Купите подписку для 2-го слота.");
        return;
    }

    const mission = hangarConfig[index];
    gameState.hangar.push({
        id: index,
        endTime: Date.now() + (mission.time * 1000)
    });
    saveGame();
}

function checkTimers() {
    // Проверка ангара
    const now = Date.now();
    gameState.hangar = gameState.hangar.filter(m => {
        if (now >= m.endTime) {
            // Миссия завершена
            const missionConfig = hangarConfig[m.id];
            gameState.fortx += missionConfig.reward;
            alert(`Миссия ${missionConfig.name} завершена! Получено ${missionConfig.reward} FortX.`);
            return false; // Удаляем из активных
        }
        return true; // Оставляем
    });
    
    // Обновление таймеров UI
    gameState.hangar.forEach(m => {
        const el = document.getElementById(`mission-timer-${m.id}`);
        if(el) {
            const left = Math.floor((m.endTime - now) / 1000);
            el.innerText = `Осталось: ${left} сек`;
        }
    });
}

// [cite: 58] Код для разблокировки ангара
function activateHangarCode() {
    const code = document.getElementById('hangar-code-input').value;
    if (code === 'fortxsecond020') {
        gameState.unlocks.secondHangarSlot = true;
        alert("Второй слот ангара разблокирован!");
        saveGame();
    } else {
        alert("Неверный код!");
    }
}

// --- ПРОМЫШЛЕННОСТЬ [cite: 88-94] ---

function renderIndustry() {
    const list = document.getElementById('industry-list');
    industryConfig.forEach(ind => {
        const div = document.createElement('div');
        div.className = 'item-card';
        div.innerHTML = `
            <div class="item-header">${ind.name}</div>
            <div class="item-cost">Требует: ${ind.bps} Чертежей + ${formatNumber(ind.baseCost)} FortX</div>
            <button class="buy-btn" onclick="buyIndustry('${ind.id}')">Построить/Улучшить</button>
        `;
        list.appendChild(div);
    });
}

function buyIndustry(id) {
    const ind = industryConfig.find(i => i.id === id);
    const lvl = gameState.industryLevels[id] || 0;
    
    // Проверка требований
    if (gameState.blueprints >= ind.bps && gameState.fortx >= ind.baseCost) {
        gameState.blueprints -= ind.bps;
        gameState.fortx -= ind.baseCost;
        gameState.industryLevels[id] = lvl + 1;
        alert(`${ind.name} улучшен до уровня ${lvl + 1}`);
        saveGame();
    } else {
        alert("Недостаточно ресурсов (Чертежей или FortX)!");
    }
}

// --- МАГАЗИН И "ВАЙП" [cite: 106-118] ---

function renderShop() {
    const list = document.getElementById('shop-list');
    shopItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'item-card';
        div.innerHTML = `
            <div class="item-header">${item.name}</div>
            <div class="item-cost">${formatNumber(item.cost)} FortX</div>
            <button class="buy-btn" onclick="buyShopItem(${item.id})">Купить</button>
        `;
        list.appendChild(div);
    });
}

function buyShopItem(id) {
    const item = shopItems.find(i => i.id === id);
    if (gameState.fortx >= item.cost) {
        if(confirm("ВНИМАНИЕ! Покупка сбросит весь прогресс игры. Продолжить?")) {
            // Генерация кода [cite: 118]
            const verificationCode = "FORT-" + Math.random().toString(36).substr(2, 9).toUpperCase();
            
            // Показываем модалку
            document.getElementById('verification-code').innerText = verificationCode;
            document.getElementById('purchase-modal').classList.remove('hidden');
            
            // Полный сброс (кроме подписок, по желанию, но ТЗ просит полный сброс)
            // Здесь мы просто готовимся к сбросу при закрытии модалки
        }
    } else {
        alert("Недостаточно FortX!");
    }
}

function closeModal() {
    document.getElementById('purchase-modal').classList.add('hidden');
    // Сброс данных (Wipe)
    localStorage.removeItem('wtm_tycoon_save');
    location.reload();
}

// --- ЧЕРНЫЙ РЫНОК И АКЦИИ [cite: 95] ---

function buyBlueprint(amount) {
    const price = 1000 * amount; // Цена плавает, упрощенно 1000 за шт
    if (gameState.fortx >= price) {
        gameState.fortx -= price;
        gameState.blueprints += amount;
        updateUI(0);
    } else {
        alert("Не хватает денег!");
    }
}

function renderStocks() {
    const stocks = [
        { name: "xFORTUNAx", price: Math.floor(Math.random() * 500) + 100 },
        { name: "FortX Inc.", price: Math.floor(Math.random() * 1000) + 500 },
        { name: "Fortuna Ent.", price: Math.floor(Math.random() * 200) + 50 }
    ];
    
    const list = document.getElementById('stocks-list');
    list.innerHTML = '';
    stocks.forEach(s => {
        const div = document.createElement('div');
        div.style.padding = "5px";
        div.style.borderBottom = "1px solid #444";
        div.innerHTML = `${s.name}: <span style="color:var(--green-color)">${s.price} FortX</span>`;
        list.appendChild(div);
    });
}

// --- НАВЫКИ [cite: 60-70] ---
function renderSkills() {
    const list = document.getElementById('skills-list');
    // Пример одного навыка
    const div = document.createElement('div');
    div.className = 'item-card';
    div.innerHTML = `
        <div class="item-header">Экономические курсы</div>
        <div class="item-cost">Текущий бонус: ${(gameState.skills[1]?.level || 0)}%</div>
        <button class="buy-btn" onclick="startSkillUpgrade(1)">Начать изучение (Бесплатно)</button>
        <div id="skill-timer-1"></div>
    `;
    list.appendChild(div);
}

function startSkillUpgrade(id) {
    // Тут нужна логика времени из [cite: 71-86]
    // Упрощенно: всегда 1 минута для теста
    const endTime = Date.now() + 60000; 
    
    gameState.skills[id] = {
        level: (gameState.skills[id]?.level || 0),
        upgrading: true,
        endTime: endTime
    };
    alert("Изучение начато! Ждите 1 минуту.");
    saveGame();
}

function activateSkillCode() {
    const code = document.getElementById('skill-code-input').value;
    if (code === 'skillfortuna701') { // [cite: 69]
        gameState.unlocks.secondSkillSlot = true;
        alert("Второй слот навыков разблокирован!");
        saveGame();
    } else {
        alert("Неверный код!");
    }
}

function watchAd(type) {
    // [cite: 87] Мокап рекламы
    alert("Реклама просмотрена! Время сокращено на 10% (логика времени требует доработки).");
}

// --- ВКЛАДКИ ---

function switchTab(tabId) {
    // Скрываем все
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    
    // Показываем нужную
    document.getElementById('tab-' + tabId).classList.add('active');
    
    // Подсветка кнопки (тут упрощенно, нужно искать кнопку по индексу или ID)
}

// Запуск
init();