// ════════════════════════════════════════════════════════════════════
// УПРАВЛЕНИЕ ДАННЫМИ ПОЛЬЗОВАТЕЛЕЙ И БОТОВ
// ════════════════════════════════════════════════════════════════════

// ════ СИСТЕМА РЕГИСТРАЦИИ И АУТЕНТИФИКАЦИИ ════

// Получить всех зарегистрированных пользователей из localStorage
function getRegisteredUsers() {
    const stored = localStorage.getItem('zapretka_registered_users');
    return stored ? JSON.parse(stored) : {};
}

// Сохранить зарегистрированных пользователей
function saveRegisteredUsers(users) {
    localStorage.setItem('zapretka_registered_users', JSON.stringify(users));
}

// Проверить, существует ли пользователь с таким никнеймом
function userExists(username) {
    const users = getRegisteredUsers();
    return users.hasOwnProperty(username);
}

// Зарегистрировать нового пользователя
function registerUser(username, password) {
    if (userExists(username)) {
        return { success: false, message: 'Этот никнейм уже занят' };
    }
    
    const users = getRegisteredUsers();
    users[username] = {
        password: password, // в реальном приложении нужно хеширование!
        avatar: `https://i.pravatar.cc/100?u=${encodeURIComponent(username)}`,
        nickname: '',
        birthplace: '',
        birthyear: '',
        bio: '',
        registeredAt: new Date().toISOString()
    };
    
    saveRegisteredUsers(users);
    return { success: true, message: 'Регистрация успешна!' };
}

// Проверить учетные данные при входе
function verifyLogin(username, password) {
    const users = getRegisteredUsers();
    if (!users[username]) {
        return { success: false, message: 'Пользователь не найден' };
    }
    
    if (users[username].password !== password) {
        return { success: false, message: 'Неверный пароль' };
    }
    
    return { success: true, message: 'Вход выполнен!' };
}

// Получить данные пользователя
function getUserData(username) {
    const users = getRegisteredUsers();
    if (users[username]) {
        return { name: username, ...users[username] };
    }
    return null;
}

// Обновить данные пользователя
function updateUserData(username, userData) {
    const users = getRegisteredUsers();
    if (users[username]) {
        users[username] = { ...users[username], ...userData };
        saveRegisteredUsers(users);
        return true;
    }
    return false;
}

// ════ ИНИЦИАЛИЗАЦИЯ ДЕМО-ПОЛЬЗОВАТЕЛЕЙ ════
// Создать 5 тестовых пользователей с одним паролем
function initializeDemoUsers() {
    const registeredUsers = getRegisteredUsers();
    const demoPassword = '123'; // Один пароль для всех тестовых пользователей
    const demoUsers = [
        { username: 'Юсуф', nickname: 'Юсуф' },
        { username: 'Али', nickname: 'Али' },
        { username: 'Марат', nickname: 'Марат' },
        { username: 'Лиза', nickname: 'Лиза' },
        { username: 'Катя', nickname: 'Катя' }
    ];
    
    let created = false;
    
    demoUsers.forEach(user => {
        if (!registeredUsers.hasOwnProperty(user.username)) {
            registeredUsers[user.username] = {
                password: demoPassword,
                avatar: `https://i.pravatar.cc/100?u=${encodeURIComponent(user.username)}`,
                nickname: user.nickname,
                birthplace: '',
                birthyear: '',
                bio: 'Demo user',
                registeredAt: new Date().toISOString()
            };
            created = true;
        }
    });
    
    if (created) {
        saveRegisteredUsers(registeredUsers);
        console.log('✓ Demo users initialized');
    }
}

// Удалить все зарегистрированные аккаунты из localStorage
function clearRegisteredAccounts() {
    try {
        localStorage.removeItem('zapretka_registered_users');
        console.log('✅ Все зарегистрированные аккаунты удалены');
    } catch (e) {
        console.error('Не удалось очистить аккаунты', e);
    }
}

// Одноразовая очистка зарегистрированных аккаунтов при следующем запуске приложения.
// После удаления помечаем, чтобы не стирать новые аккаунты при следующих перезагрузках.
if (typeof window !== 'undefined' && !localStorage.getItem('zapretka_accounts_cleared_once')) {
    clearRegisteredAccounts();
    localStorage.setItem('zapretka_accounts_cleared_once', '1');
}

// Если нужно запускать очистку вручную, вызовите clearRegisteredAccounts() из консоли.
// Инициализация демо-пользователей отключена, чтобы хранилище оставалось чистым.

// Динамический массив контактов (загружаются при инициализации приложения)
let users = [];

// ════ СИСТЕМА УПРАВЛЕНИЯ БОТАМИ ════
// Используем localStorage для хранения списка активных ботов
function getActiveBots() {
    const stored = localStorage.getItem('zapretka_bots');
    const bots = stored ? JSON.parse(stored) : ['Zapret Bot'];
    return bots;
}

function saveBots(botList) {
    localStorage.setItem('zapretka_bots', JSON.stringify(botList));
}

function addBot(botName, botAvatar = 'assets/bot-avatar.jpg', botPreview = 'Привет! Я новый бот.') {
    const bots = getActiveBots();
    if (!bots.includes(botName)) {
        bots.push(botName);
        saveBots(bots);
        return true;
    }
    return false; // Уже существует
}

function removeBot(botName) {
    if (botName === 'Zapret Bot') return false; // Нельзя удалить основного бота
    const bots = getActiveBots();
    const idx = bots.indexOf(botName);
    if (idx > -1) {
        bots.splice(idx, 1);
        saveBots(bots);
        return true;
    }
    return false;
}

function removeDuplicateBots() {
    const bots = getActiveBots();
    const unique = [...new Set(bots)];
    if (unique.length < bots.length) {
        saveBots(unique);
        return true;
    }
    return false;
}

// Список чатов — динамически строим из активных ботов
function getChats() {
    const activeBots = getActiveBots();
    return activeBots.map(botName => ({
        id: botName.toLowerCase().replace(/\s+/g, '_'),
        name: botName,
        type: 'channel',
        pinned: botName === 'Zapret Bot', // Основной бот всегда пиннут
        avatar: 'assets/bot-avatar.jpg',
        preview: botName === 'Zapret Bot' 
            ? 'Привет! Я Zapret Bot — напиши что-нибудь.' 
            : `Это ${botName}`
    }));
}

// Для совместимости — используем как константу, но динамически обновляем
const chats = getChats();

// ════ СИСТЕМА УПРАВЛЕНИЯ КОНТАКТАМИ ПОЛЬЗОВАТЕЛЯ ════
// Получить контакты конкретного пользователя
function getUserContacts(username) {
    const key = 'zapretka_contacts_' + username;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
}

// Сохранить контакты пользователя
function saveUserContacts(username, contacts) {
    const key = 'zapretka_contacts_' + username;
    localStorage.setItem(key, JSON.stringify(contacts));
}

// Добавить контакт пользователю
function addUserContact(username, contactName) {
    const contacts = getUserContacts(username);
    if (!contacts.includes(contactName)) {
        contacts.push(contactName);
        saveUserContacts(username, contacts);
        // Синхронизируем с другими вкладками
        if (typeof BroadcastChannel !== 'undefined' && window.channel) {
            try {
                window.channel.postMessage({ type: 'contacts_update', contacts });
            } catch (e) { /* игнорируем */ }
        }
        return true;
    }
    return false; // Уже есть
}

// Удалить контакт
function removeUserContact(username, contactName) {
    let contacts = getUserContacts(username);
    const idx = contacts.indexOf(contactName);
    if (idx > -1) {
        contacts.splice(idx, 1);
        saveUserContacts(username, contacts);
        return true;
    }
    return false;
}

// ════ ГЛОБАЛЬНЫЙ ПОИСК ПОЛЬЗОВАТЕЛЕЙ ════
// Получить всех зарегистрированных пользователей (для синхронизации между браузерами)
function getAllRegisteredUsers() {
    const users = getRegisteredUsers();
    return Object.keys(users).map(username => ({
        name: username,
        avatar: users[username].avatar,
        online: true // В реальном приложении проверяется через timestamp
    }));
}

// Поиск пользователя по имени
function searchUser(query) {
    const allUsers = getAllRegisteredUsers();
    const lowerQuery = query.toLowerCase();
    return allUsers.filter(u => u.name.toLowerCase().includes(lowerQuery));
}

// ════ УПРАВЛЕНИЕ СООБЩЕНИЯМИ ════
// Сохранить сообщения текущего пользователя в localStorage
function saveMessagesForUser(username) {
    if (!username || typeof window === 'undefined') return;
    const key = 'zapretka_messages_' + username;
    if (typeof messages !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(messages));
    }
}

// Загрузить сообщения для пользователя из localStorage
function loadMessagesForUser(username) {
    if (!username || typeof window === 'undefined') return [];
    const key = 'zapretka_messages_' + username;
    const stored = localStorage.getItem(key);
    // Возвращаем загруженные сообщения, не пытаясь изменить глобальную переменную
    // (это будет сделано в script.js после загрузки)
    return stored ? JSON.parse(stored) : [];
}

// ════ ИНИЦИАЛИЗАЦИЯ СТАНДАРТНЫХ ПОЛЬЗОВАТЕЛЕЙ ════
// Добавить стандартных пользователей при первом запуске
function initializeDefaultUsers() {
    const defaultUsers = [
        { username: 'masha', password: '1234' },
        { username: 'sasha', password: '1234' },
        { username: 'sergey', password: '1234' },
        { username: 'anton', password: '1234' },
        { username: 'eugeny', password: '1234' }
    ];
    
    defaultUsers.forEach(user => {
        if (!userExists(user.username)) {
            registerUser(user.username, user.password);
        }
    });
}

// Вызвать инициализацию при загрузке приложения
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        setTimeout(initializeDefaultUsers, 100);
    });
}