// --- ИНТЕГРАЦИЯ С TELEGRAM ---
const tg = window.Telegram.WebApp;

// Сообщаем телеграму, что приложение готово
tg.ready();
tg.expand();
tg.setHeaderColor('#1a1a1d'); 

// --- НАСТРОЙКИ SUPABASE ---
const SUPABASE_URL = 'https://zlxbjikgaacicodhippy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpseGJqaWtnYWFjaWNvZGhpcHB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2NTQ4NjksImV4cCI6MjA4MTIzMDg2OX0.8aCLiaB8259uJBe86eqNG1sFR2jHkTcHJNvpPxppRGQ';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Получаем данные игрока
const tgUser = window.Telegram.WebApp.initDataUnsafe?.user;
const userId = tgUser ? tgUser.id : 1001; 
const userName = tgUser ? (tgUser.username || tgUser.first_name) : "Player";

// --- КОНФИГУРАЦИЯ И ДАННЫЕ ---

// Начальное состояние (вынесено отдельно для сброса)
const defaultState = {
    fortx: 0,
    oil: 0,
    ore: 0,
    nuke: 0,
    space: 0,
    blueprints: 0,
    lastLogin: Date.now(),
    factoryLevels: {}, 
    industryLevels: {}, 
    skills: {}, 
    hangar: [], 
    unlocks: {
        secondHangarSlot: false,
        secondSkillSlot: false
    }
};

let gameState = JSON.parse(JSON.stringify(defaultState));

// Конфигурация Завода
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
    { id: 24, name: "Проект xFORTUNAx", baseCost: 100000000, res: "fortx", extraRes: "space", extraCost: 1000, income: 50000, req: 13 }
];

// Конфигурация Промышленности
const industryConfig = [
    { id: "oil_rig", name: "НПЗ (Нефть)", resOut: "oil", baseCost: 1000, bps: 100, reqFactory: 4 },
    { id: "ore_mine", name: "Шахты (Руда)", resOut: "ore", baseCost: 5000, bps: 250, reqFactory: 6 },
    { id: "nuke_lab", name: "Секретная добыча (Ядерное)", resOut: "nuke", baseCost: 20000, bps: 500, reqFactory: 12 },
    { id: "space_lab", name: "Военная лаборатория (Космос)", resOut: "space", baseCost: 100000, bps: 1000, reqFactory: 17 }
];

// Конфигурация Ангара
const hangarConfig = [
    { name: "Музей: КВ-1", type: "museum", time: 3600, reward: 1000, img: "https://static.wikia.nocookie.net/warrior/images/8/88/%D0%9A%D0%92-1.jpg/revision/latest?cb=20161026155026&path-prefix=ru" },
    { name: "Учения: M3 Bradley", type: "exercises", time: 14400, reward: 5000, img: "https://upload.wikimedia.org/wikipedia/commons/a/a2/Decisive_Action_Rotation_13-04_130218-A-ML570-001.jpg" },
    { name: "Патруль: Т-80У", type: "patrol", time: 43200, reward: 20000, img: "https://upload.wikimedia.org/wikipedia/commons/8/85/4thTankBrigade_-_T-80U_-09.jpg" }
];

// Магазин
const shopItems = [
    { id: 1, name: "Титул Оружейник (30 дн)", cost: 1000000, type: "title" },
    { id: 2, name: "Премиум WTM (7 дн)", cost: 5000000, type: "prem" },
    { id: 3, name: "500 Платины WTM", cost: 10000000, type: "gold" }
];

// --- ИНИЦИАЛИЗАЦИЯ И СОХРАНЕНИЕ ---

async function init() {
    // Сначала загружаем игру и ждем ответа от сервера
    await loadGame();
    
    // Рендерим интерфейс
    renderFactory();
    renderIndustry();
    renderHangar();
    renderSkills();
    renderShop();
    renderStocks();
    
    // Запускаем циклы ТОЛЬКО после загрузки
    setInterval(gameLoop, 1000);
    setInterval(saveGame, 10000); // Сохранение каждые 10 сек
}

async function loadGame() {
    const { data, error } = await supabase
        .from('players')
        .select('game_data')
        .eq('id', userId)
        .single();

    if (data && data.game_data) {
        console.log('Сохранение загружено.');
        gameState = { ...gameState, ...data.game_data };
        
        // Офлайн доход
        const now = Date.now();
        const diffSeconds = (now - gameState.lastLogin) / 1000;
        if (diffSeconds > 60) {
            const income = calculateTotalIncome();
            const earned = income * diffSeconds;
            gameState.fortx += earned;
            alert(`С возвращением! Завод заработал: ${formatNumber(earned)} FortX`);
        }
    } else {
        console.log('Новый игрок.');
    }
    
    updateUI(calculateTotalIncome());
}

async function saveGame() {
    gameState.lastLogin = Date.now();

    const { error } = await supabase
        .from('players')
        .upsert({ 
            id: userId, 
            fortx: Math.floor(gameState.fortx),
            game_data: gameState
        });

    if (error) console.error('Ошибка сохранения:', error);
}

// --- ЯДРО ИГРЫ ---

function calculateTotalIncome() {
    let total = 0;
    factoryConfig.forEach(item => {
        const level = gameState.factoryLevels[item.id] || 0;
        if (level > 0) {
            total += item.income * level;
        }
    });
    // Бонус навыков (Навык ID 1)
    const skillBonus = (gameState.skills[1]?.level || 0) * 0.01;
    return total * (1 + skillBonus);
}

function gameLoop() {
    const income = calculateTotalIncome();
    gameState.fortx += income;

    // Ресурсы
    industryConfig.forEach(ind => {
        const lvl = gameState.industryLevels[ind.id] || 0;
        if (lvl > 0 && gameState[ind.resOut] !== undefined) {
            gameState[ind.resOut] += lvl * 0.1;
        }
    });

    updateUI(income);
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
    
    updateFactoryButtons();
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return Math.floor(num);
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
                <span id="fac-lvl-${item.id}">Lvl: ${gameState.factoryLevels[item.id] || 0}</span>
            </div>
            <div class="item-cost">
                Цена: <span id="fac-cost-${item.id}">${formatNumber(Math.floor(item.baseCost * Math.pow(1.15, gameState.factoryLevels[item.id] || 0)))}</span> FortX
                ${item.extraRes ? ` + ${item.extraCost} ${item.extraRes}` : ''}
            </div>
            <button class="buy-btn" id="btn-fac-${item.id}" onclick="buyFactory(${item.id})">Улучшить</button>
        `;
        list.appendChild(div);
    });
    
    // Удаляем старый листенер во избежание дублирования, если есть
    const tapBtn = document.getElementById('tap-btn');
    if(tapBtn) {
        tapBtn.onclick = () => {
             gameState.fortx += 1;
             updateUI(calculateTotalIncome());
        };
    }
}

function buyFactory(id) {
    const item = factoryConfig.find(i => i.id === id);
    const currentLvl = gameState.factoryLevels[id] || 0;
    const costFortx = Math.floor(item.baseCost * Math.pow(1.15, currentLvl));
    
    let canBuy = gameState.fortx >= costFortx;
    if (item.extraRes && gameState[item.extraRes] < item.extraCost) canBuy = false;
    if (item.req && (gameState.factoryLevels[item.req] || 0) < 1) canBuy = false;

    if (canBuy) {
        gameState.fortx -= costFortx;
        if (item.extraRes) gameState[item.extraRes] -= item.extraCost;
        
        gameState.factoryLevels[id] = currentLvl + 1;
        
        renderFactory(); // Перерисовываем для обновления цен
        saveGame();
    }
}

function updateFactoryButtons() {
    factoryConfig.forEach(item => {
        const currentLvl = gameState.factoryLevels[item.id] || 0;
        const cost = Math.floor(item.baseCost * Math.pow(1.15, currentLvl));
        const btn = document.getElementById(`btn-fac-${item.id}`);
        if(btn) {
            btn.disabled = gameState.fortx < cost;
        }
    });
}

// --- АНГАР И ТАЙМЕРЫ ---

function renderHangar() {
    const list = document.getElementById('hangar-missions');
    list.innerHTML = '';
    
    hangarConfig.forEach((mission, index) => {
        const div = document.createElement('div');
        div.className = 'item-card';
        div.innerHTML = `
            <img src="${mission.img}" class="preview-img" style="width:100%; height:100px; object-fit:cover; border-radius:5px;">
            <div class="item-header">${mission.name}</div>
            <div class="item-cost">Время: ${mission.time / 3600} ч. | Награда: ${mission.reward} FortX</div>
            <button class="buy-btn" onclick="startMission(${index})">Начать</button>
            <div id="mission-timer-${index}" style="color:orange; font-weight:bold;"></div>
        `;
        list.appendChild(div);
    });
}

function startMission(index) {
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
    alert("Миссия началась!");
}

function checkTimers() {
    const now = Date.now();
    
    // 1. Проверка Ангара
    gameState.hangar = gameState.hangar.filter(m => {
        if (now >= m.endTime) {
            const missionConfig = hangarConfig[m.id];
            gameState.fortx += missionConfig.reward;
            alert(`Миссия ${missionConfig.name} завершена! Получено ${missionConfig.reward} FortX.`);
            return false; // Удаляем
        }
        
        // Обновляем таймер UI
        const el = document.getElementById(`mission-timer-${m.id}`);
        if(el) {
             const left = Math.floor((m.endTime - now) / 1000);
             el.innerText = `Осталось: ${left} сек`;
        }
        return true;
    });

    // 2. Проверка Навыков (Добавлено исправление)
    for (const [id, skill] of Object.entries(gameState.skills)) {
        if (skill.upgrading) {
            if (now >= skill.endTime) {
                skill.upgrading = false;
                skill.level += 1;
                alert("Навык изучен!");
                renderSkills(); // Обновляем UI
            } else {
                const el = document.getElementById(`skill-timer-${id}`);
                if (el) {
                    const left = Math.floor((skill.endTime - now) / 1000);
                    el.innerText = `Изучение: ${left} сек`;
                }
            }
        }
    }
}

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

// --- ПРОМЫШЛЕННОСТЬ ---

function renderIndustry() {
    const list = document.getElementById('industry-list');
    industryConfig.forEach(ind => {
        const currentLvl = gameState.industryLevels[ind.id] || 0;
        const div = document.createElement('div');
        div.className = 'item-card';
        div.innerHTML = `
            <div class="item-header">${ind.name} (Lvl ${currentLvl})</div>
            <div class="item-cost">Требует: ${ind.bps} Чертежей + ${formatNumber(ind.baseCost)} FortX</div>
            <button class="buy-btn" onclick="buyIndustry('${ind.id}')">Построить/Улучшить</button>
        `;
        list.appendChild(div);
    });
}

function buyIndustry(id) {
    const ind = industryConfig.find(i => i.id === id);
    const lvl = gameState.industryLevels[id] || 0;
    
    if (gameState.blueprints >= ind.bps && gameState.fortx >= ind.baseCost) {
        gameState.blueprints -= ind.bps;
        gameState.fortx -= ind.baseCost;
        gameState.industryLevels[id] = lvl + 1;
        
        renderIndustry();
        saveGame();
    } else {
        alert("Недостаточно ресурсов!");
    }
}

// --- МАГАЗИН И ВАЙП ---

function renderShop() {
    const list = document.getElementById('shop-list');
    list.innerHTML = ''; // Очистка перед рендером
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
            const verificationCode = "FORT-" + Math.random().toString(36).substr(2, 9).toUpperCase();
            
            const codeEl = document.getElementById('verification-code');
            const modal = document.getElementById('purchase-modal');
            
            if (codeEl && modal) {
                codeEl.innerText = verificationCode;
                modal.classList.remove('hidden');
            } else {
                // Если модалки нет в HTML, просто делаем вайп
                closeModal();
            }
        }
    } else {
        alert("Недостаточно FortX!");
    }
}

async function closeModal() {
    const modal = document.getElementById('purchase-modal');
    if(modal) modal.classList.add('hidden');
    
    // ПОЛНЫЙ СБРОС (ИСПРАВЛЕНО)
    // 1. Сбрасываем локальный стейт
    gameState = JSON.parse(JSON.stringify(defaultState));
    gameState.lastLogin = Date.now();
    
    // 2. Отправляем пустой стейт в облако
    await supabase
        .from('players')
        .upsert({ 
            id: userId, 
            fortx: 0,
            game_data: gameState 
        });
        
    location.reload();
}

// --- ЧЕРНЫЙ РЫНОК ---

function buyBlueprint(amount) {
    const price = 1000 * amount;
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
    if(!list) return;
    list.innerHTML = '';
    stocks.forEach(s => {
        const div = document.createElement('div');
        div.style.padding = "5px";
        div.style.borderBottom = "1px solid #444";
        div.innerHTML = `${s.name}: <span style="color:#00ff00">${s.price} FortX</span>`;
        list.appendChild(div);
    });
}

// --- НАВЫКИ ---
function renderSkills() {
    const list = document.getElementById('skills-list');
    list.innerHTML = '';
    
    // Навык 1: Экономика
    const skillLvl = gameState.skills[1]?.level || 0;
    const isUpgrading = gameState.skills[1]?.upgrading;
    
    const div = document.createElement('div');
    div.className = 'item-card';
    div.innerHTML = `
        <div class="item-header">Экономические курсы (Lvl ${skillLvl})</div>
        <div class="item-cost">Бонус: +${skillLvl}% к доходу</div>
        <button class="buy-btn" onclick="startSkillUpgrade(1)" ${isUpgrading ? 'disabled' : ''}>
            ${isUpgrading ? 'Изучается...' : 'Учить (1 мин)'}
        </button>
        <div id="skill-timer-1" style="color:orange"></div>
    `;
    list.appendChild(div);
}

function startSkillUpgrade(id) {
    // 60 секунд
    const endTime = Date.now() + 60000; 
    
    gameState.skills[id] = {
        level: (gameState.skills[id]?.level || 0),
        upgrading: true,
        endTime: endTime
    };
    
    renderSkills();
    saveGame();
}

function activateSkillCode() {
    const code = document.getElementById('skill-code-input').value;
    if (code === 'skillfortuna701') {
        gameState.unlocks.secondSkillSlot = true;
        alert("Второй слот навыков разблокирован!");
        saveGame();
    } else {
        alert("Неверный код!");
    }
}

// --- НАВИГАЦИЯ ---

function switchTab(tabId) {
    // Скрываем все содержимое
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    
    // Показываем нужное
    const activeTab = document.getElementById('tab-' + tabId);
    if(activeTab) activeTab.style.display = 'block';
    
    // Подсветка кнопок (нужно добавить ID к кнопкам в HTML, например id="btn-tab-factory")
    const activeBtn = document.getElementById('btn-tab-' + tabId);
    if(activeBtn) activeBtn.classList.add('active');
    
    if (tabId === 'top') {
        // Если есть функция renderTop, вызываем её (в этом файле её не было, но она может быть в проекте)
        if (typeof renderTop === "function") renderTop();
    }
}

// Запуск инициализации
init();
