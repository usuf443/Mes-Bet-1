// Глобальные переменные
let me = {
    name: "",
    avatar: "",
    nickname: "",
    birthplace: "",
    birthyear: "",
    bio: ""
};
let activeContact = null;
// `users` объявлен в `data.js` (массив пользователей). Не переобъявляем его здесь — это вызывало ошибку в браузере.
// Используем messages из localStorage как источник правды для истории.
let messages = [];  // Будет загружена для каждого пользователя в loadMessagesForUser()

// Текущее выбранное сообщение для контекстного меню
let currentContextMsgId = null;

// Управление состоянием ввода сообщения (включить/отключить в зависимости от выбранного чата)
function setMessageInputEnabled(enabled) {
    const input = document.getElementById('msg-input');
    if (input) {
        input.disabled = !enabled;
        input.placeholder = enabled ? 'Написать сообщение...' : 'Выберите чат слева';
    }
    const sendBtn = document.querySelector('.send-btn');
    if (sendBtn) sendBtn.disabled = !enabled;
    const voiceBtn = document.getElementById('voice-btn');
    if (voiceBtn) voiceBtn.disabled = !enabled;
    const attachBtn = document.querySelector('.attach-btn');
    if (attachBtn) attachBtn.disabled = !enabled;
}

function updateChatAreaVisibility(hasActive) {
    const header = document.querySelector('.chat-header');
    const inputArea = document.querySelector('.message-input-area');
    const emojiPanel = document.getElementById('emoji-shelf');
    const messagesBox = document.getElementById('chat-box');
    const scrollBtn = document.getElementById('scroll-down-btn');

    if (!hasActive) {
        if (header) header.style.display = 'none';
        if (inputArea) inputArea.style.display = 'none';
        if (emojiPanel) emojiPanel.style.display = 'none';
        if (scrollBtn) { scrollBtn.classList.remove('show'); scrollBtn.style.display = 'none'; }
        if (messagesBox) messagesBox.style.display = 'none';

        // placeholder
        let ph = document.getElementById('no-chat-placeholder');
        if (!ph) {
            ph = document.createElement('div');
            ph.id = 'no-chat-placeholder';
            ph.style.cssText = 'display:flex; align-items:center; justify-content:center; height:100%; color:#b7b7b7; font-size:28px; padding:20px;';
            ph.innerText = 'Выберите чат слева';
            const chatMain = document.querySelector('.chat-main');
            if (chatMain) chatMain.appendChild(ph);
        }
        ph.style.display = 'flex';
    } else {
        if (header) header.style.display = '';
        if (inputArea) inputArea.style.display = '';
        if (emojiPanel) emojiPanel.style.display = '';
        if (scrollBtn) scrollBtn.style.display = '';
        if (messagesBox) messagesBox.style.display = '';
        const ph = document.getElementById('no-chat-placeholder');
        if (ph) ph.style.display = 'none';
    }
    // Управление состоянием элементов ввода (включить/выключить)
    try { setMessageInputEnabled(!!hasActive); } catch (e) {}
}

// Микрофон - один раз запрашиваем и переиспользуем
let microphoneStream = null;

// BroadcastChannel для синхронизации между вкладками (реaltime обновления)
const channel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('zapretka_channel') : null;
if (channel) {
    channel.onmessage = (e) => {
        const data = e.data || {};
        if (data.type === 'messages_update' && Array.isArray(data.messages)) {
            messages = data.messages;
            saveMessagesForUser(me.name);  // Сохраняем для текущего пользователя
            renderMessages();
            renderContacts();
        } else if (data.type === 'user_update' && Array.isArray(data.users)) {
            // Обновляем содержимое массива users (data.js содержит исходный массив)
            try {
                users.length = 0;
                data.users.forEach(u => users.push(u));
                renderContacts();
            } catch (err) { /* безопасно игнорируем */ }
        } else if (data.type === 'archive_update' && Array.isArray(data.archivedChats)) {
            try {
                archivedChats.length = 0;
                data.archivedChats.forEach(n => archivedChats.push(n));
                localStorage.setItem('zapretka_archived', JSON.stringify(archivedChats));
                renderContacts();
                renderArchivedList();
            } catch (err) { /* игнорируем */ }
        } else if (data.type === 'contacts_update' && Array.isArray(data.contacts)) {
            // Обновляем контакты текущего пользователя
            try {
                saveUserContacts(me.name, data.contacts);
                renderContacts();
            } catch (err) { /* игнорируем */ }
        }
    };
}

// WebSocket клиент (для синхронизации между разными браузерами/устройствами)
const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
let ws = null;
function initWebSocket() {
    try {
        ws = new WebSocket(WS_URL);
        ws.addEventListener('open', () => console.log('WS connected'));
        ws.addEventListener('close', () => { console.log('WS closed, reconnect in 2s'); setTimeout(initWebSocket, 2000); });
        ws.addEventListener('message', (ev) => {
            try {
                const data = JSON.parse(ev.data);
                if (!data) return;
                if (data.type === 'msg' && data.msg) {
                    handleIncomingWsMessage(data.msg);
                } else if (data.type === 'users' && Array.isArray(data.users)) {
                    try {
                        users.length = 0;
                        data.users.forEach(u => users.push({ name: u.name, avatar: u.avatar }));
                        renderContacts();
                    } catch (e) { /* ignore */ }
                }
            } catch (err) { console.warn('WS msg parse', err); }
        });
    } catch (err) {
        console.warn('WS init failed', err);
    }
}
try { initWebSocket(); } catch (e) { /* ignore */ }

function handleIncomingWsMessage(msg) {
    if (!msg || !msg.id) return;
    // Если уже есть такое сообщение — пропускаем
    const exists = messages.find(m => m.id === msg.id);
    if (exists) return;
    messages.push(msg);
    saveMessagesForUser(me.name);  // Сохраняем для текущего пользователя
    // Уведомляем другие вкладки
    if (channel) channel.postMessage({ type: 'messages_update', messages });
    renderMessages();
}

// Архивированные чаты — список имён контактов
let archivedChats = JSON.parse(localStorage.getItem('zapretka_archived')) || [];
// Следим за тем, сколько сообщений уже отрисовано для каждого чата — используем для incremental rendering
let lastRenderedCount = {};
// Флаг, показывает что пользователь скроллит вручную — тогда не трогаем позицию
let userIsScrolling = false;
let userScrollTimer = null;
// Последний активный чат (чтобы при переключении делать полный ре-рендер)
let lastActiveChat = null;

// Утилита — единый источник URL аватаров по имени контакта
function getAvatarUrl(name, size = 48) {
    if (!name) return `https://i.pravatar.cc/${size}?u=anon`;
    // Специальная иконка для контакта Избранные
    if (name === '⭐Избранные') {
        return 'assets/bookmark.svg';
    }
    // 1. Проверяем localStorage (актуальный профиль)
    const saved = JSON.parse(localStorage.getItem('zapretka_user_' + name) || 'null');
    if (saved && saved.avatar) {
        try {
            const url = new URL(saved.avatar);
            if (url.hostname.includes('pravatar.cc')) {
                return `https://i.pravatar.cc/${size}?u=${encodeURIComponent(name)}`;
            }
        } catch (e) {}
        return saved.avatar;
    }
    // 2. Мой профиль (me)
    if (me && me.name === name && me.avatar) {
        return me.avatar;
    }
    // 3. Боты
    const bots = getActiveBots();
    if (bots.includes(name)) {
        return `https://i.pravatar.cc/${size}?u=bot`;
    }
    // 4. users (стартовые)
    const u = (users || []).find(x => x.name === name);
    if (u && u.avatar) {
        try {
            const url = new URL(u.avatar);
            if (url.hostname.includes('pravatar.cc')) {
                return `https://i.pravatar.cc/${size}?u=${encodeURIComponent(name)}`;
            }
        } catch (e) {}
        return u.avatar;
    }
    // 5. fallback
    return `https://i.pravatar.cc/${size}?u=${encodeURIComponent(name)}`;
}

// Инициализация после входа
function initApp() {
    // ════ MIGRAЦИЯ: убрать 'Favorites' из ботов и показать как '⭐Избранные' (не бот) ════
    try {
        const botsKey = 'zapretka_bots';
        const botsStored = localStorage.getItem(botsKey);
        if (botsStored) {
            const botsArr = JSON.parse(botsStored);
            const favIdxBot = botsArr.indexOf('Favorites');
            if (favIdxBot > -1) {
                botsArr.splice(favIdxBot, 1); // удаляем из списка ботов
                localStorage.setItem(botsKey, JSON.stringify(botsArr));
            }
        }
    } catch (e) { /* ignore */ }

    // Обновляем контакты текущего пользователя: заменяем 'Favorites' на '⭐Избранные' или добавляем его
    const contacts = getUserContacts(me.name) || [];
    const favIdx = contacts.indexOf('Favorites');
    if (favIdx > -1) {
        contacts[favIdx] = '⭐Избранные';
    } else if (!contacts.includes('⭐Избранные')) {
        // Добавляем '⭐Избранные' только если в сообщениях есть упоминания или был бот 'Favorites'
        let shouldAdd = false;
        try {
            const keyCheck = 'zapretka_messages_' + me.name;
            const storedMsgs = localStorage.getItem(keyCheck);
            if (storedMsgs) {
                const msgs = JSON.parse(storedMsgs);
                if (Array.isArray(msgs) && msgs.some(m => m.from === 'Favorites' || m.to === 'Favorites')) {
                    shouldAdd = true;
                }
            }
        } catch (e) { /* ignore */ }

        try {
            const botsKey2 = 'zapretka_bots';
            const botsStored2 = localStorage.getItem(botsKey2);
            if (!shouldAdd && botsStored2) {
                const arr = JSON.parse(botsStored2);
                if (Array.isArray(arr) && arr.includes('Favorites')) shouldAdd = true;
            }
        } catch (e) { /* ignore */ }

        if (shouldAdd) contacts.unshift('⭐Избранные');
    }
    saveUserContacts(me.name, contacts);

    // Переименовываем в текущих сообщениях (для текущего пользователя)
    const key = 'zapretka_messages_' + me.name;
    const stored = localStorage.getItem(key);
    if (stored) {
        try {
            let userMessages = JSON.parse(stored);
            const hasChanges = userMessages.some(m => m.from === 'Favorites' || m.to === 'Favorites');
            if (hasChanges) {
                userMessages = userMessages.map(m => ({
                    ...m,
                    from: m.from === 'Favorites' ? '⭐Избранные' : m.from,
                    to: m.to === 'Favorites' ? '⭐Избранные' : m.to
                }));
                localStorage.setItem(key, JSON.stringify(userMessages));
            }
        } catch (e) { /* ignore */ }
    }
    
    // Загрузить сообщения для текущего пользователя из localStorage
    const loadedMessages = loadMessagesForUser(me.name);
    if (loadedMessages && loadedMessages.length > 0) {
        messages = loadedMessages;
    }
    
    // Установить аватар
    document.getElementById('my-avatar').src = me.avatar || 'https://i.pravatar.cc/40?u=me';
    document.getElementById('my-name').innerText = me.name;

    // Рендер контактов
    renderContacts();

    // Настроить отображение области чата в зависимости от выбранного чата
    updateChatAreaVisibility(!!activeContact);
    // Обновить иконку переключателя темы
    updateThemeToggleIcon(localStorage.getItem('zapretka_theme') || (document.body.classList.contains('light-theme') ? 'light' : 'dark'));
    // Применить сохранённые расширенные настройки
    try { applyAllSettings(getAllSettings()); } catch (e) { /* ignore */ }

    // Рендер эмодзи
    const emojis = ['😊', '😂', '❤️', '👍', '🔥', '🎉', '😎', '😢', '😡', '👻', '💀', '🤡'];
    const shelf = document.getElementById('emoji-shelf');
    shelf.innerHTML = '';
    emojis.forEach(e => {
        const btn = document.createElement('span');
        btn.className = 'emoji-btn';
        btn.innerText = e;
        btn.onclick = () => addEmoji(e);
        shelf.appendChild(btn);
    });

    // Если сообщений нет — создаём пример
    if (!messages || messages.length === 0) {
        messages = [
            { from: 'Zapret Bot', to: me.name, text: 'Привет! 👋 Я Zapret Bot. Напиши мне что-нибудь!', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), type: 'text', id: 'init_' + Date.now() }
        ];
        saveMessagesForUser(me.name);
    }
    renderMessages();

    // Первичная синхронизация и периодический фолбэк (каждые 5 секунд)
    syncMessages();
    setInterval(syncMessages, 5000);

    // Эффект света за курсором
    initCursorLight();
    
    // Подключаем обработчик прокрутки для области сообщений (покажем/скроем кнопку "вниз")
    const box = document.getElementById('chat-box');
    if (box) {
        box.addEventListener('scroll', (e) => {
            updateScrollButton();
            // помечаем, что пользователь активен — не менять позицию при рендере
            userIsScrolling = true;
            if (userScrollTimer) clearTimeout(userScrollTimer);
            userScrollTimer = setTimeout(() => { userIsScrolling = false; }, 1200);
        });
        // Установим вид кнопки по текущему положению
        updateScrollButton();
    }
    
    // Инициализируем поиск
    setupSearch();
    
    // Инициализируем видимость архива
    const archivedSection = document.querySelector('.archived-section');
    if (archivedSection) {
        const isVisible = JSON.parse(localStorage.getItem('zapretka_archive_visible') || 'false');
        archivedSection.style.display = isVisible ? 'block' : 'none';
    }
    
    // Инициализируем правую панель (эмодзи/стикеры/гифы)
    initRightPanel();
    
    // Инициализируем микрофон (запрашиваем разрешение один раз)
    initMicrophone();
}

function renderContacts() {
    const list = document.getElementById('contacts-list');
    list.innerHTML = '';

    // Получаем активные боты динамически
    const activeBots = getActiveBots();
    
    // Добавляем всех активных ботов в начало списка (используем getAvatarUrl для единого аватара)
    activeBots.forEach(botName => {
        addContactToSidebar(botName, '🤖', getAvatarUrl(botName, 48));
    });

    // Получаем сохраненные контакты пользователя из localStorage
    const savedContacts = getUserContacts(me.name) || [];
    
    // Добавляем сохраненные контакты (которые не боты, не в архиве и не заблокированы)
    savedContacts.forEach(contactName => {
        if (!activeBots.includes(contactName) && !isArchived(contactName) && !isBlocked(contactName)) {
            addContactToSidebar(contactName, '', getAvatarUrl(contactName, 48));
        }
    });

    // Обновить список архивных чатов
    renderArchivedList();
}

function renderArchivedList() {
    const container = document.getElementById('archived-list');
    if (!container) return;
    container.innerHTML = '';
    
    archivedChats.forEach(name => {
        const row = document.createElement('div');
        row.className = 'archived-row';
        row.style.display = 'flex';
        row.style.gap = '10px';
        row.style.padding = '8px';
        row.style.borderBottom = '1px solid #eee';
        row.style.alignItems = 'center';
        
        const avatarUrl = getAvatarUrl(name, 32);
        
        const left = document.createElement('div');
        left.className = 'archived-left';
        const img = document.createElement('img');
        img.src = avatarUrl;
        img.className = 'chat-avatar-small';
        img.style.width = '32px';
        img.style.height = '32px';
        img.style.borderRadius = '50%';
        left.appendChild(img);
        
        const info = document.createElement('div');
        info.className = 'chat-info';
        info.style.flex = '1';
        const title = document.createElement('div');
        title.className = 'chat-name';
        title.style.fontWeight = 'bold';
        title.style.fontSize = '14px';
        title.innerText = name;
        const preview = document.createElement('div');
        preview.className = 'chat-preview';
        preview.style.fontSize = '12px';
        preview.style.color = '#999';
        preview.innerText = 'В архиве';
        info.appendChild(title);
        info.appendChild(preview);
        
        const unarchiveBtn = document.createElement('button');
        unarchiveBtn.className = 'unarchive-btn';
        unarchiveBtn.innerText = '↩️';
        unarchiveBtn.title = 'Восстановить чат';
        unarchiveBtn.style.background = 'none';
        unarchiveBtn.style.border = 'none';
        unarchiveBtn.style.cursor = 'pointer';
        unarchiveBtn.style.fontSize = '16px';
        unarchiveBtn.onclick = (e) => { e.stopPropagation(); unarchiveChat(name); };
        
        row.onclick = function () { setActiveChat(name, this); };
        row.appendChild(left);
        row.appendChild(info);
        row.appendChild(unarchiveBtn);
        
        container.appendChild(row);
    });
}

function isArchived(contactName) {
    return archivedChats.includes(contactName);
}

function saveArchived() {
    localStorage.setItem('zapretka_archived', JSON.stringify(archivedChats));
}

function addContactToSidebar(name, emoji, avatarUrl, previewText) {
    const list = document.getElementById('contacts-list');
    const div = document.createElement('div');
    div.className = `chat-row ${activeContact === name ? 'active' : ''}`;
    
    const lastMsg = getLastMessage(name);
    const fallbackPreview = lastMsg ? (lastMsg.text.length > 20 ? lastMsg.text.substring(0, 20) + '...' : lastMsg.text) : 'Нажмите, чтобы начать чат';
    const preview = previewText || fallbackPreview;
    
    // Получаем время последнего сообщения
    const lastMsgTime = lastMsg ? lastMsg.time : '';

    // Используем getAvatarUrl если avatarUrl не передан или устаревший
    const finalAvatar = getAvatarUrl(name, 48);
    const activeBots = getActiveBots();
    const isBot = activeBots.includes(name);
    const onlineIndicator = isBot ? '' : '● '; // Зеленая точка для пользователей
    
    div.innerHTML = `
        <div style="position: relative;">
            <img src="${finalAvatar}" class="chat-avatar-small" onerror="this.src='${getAvatarUrl(name, 48)}'">
            ${!isBot ? '<div class="online-dot"></div>' : ''}
        </div>
        <div class="chat-info">
            <div class="chat-name">${emoji ? emoji + ' ' : ''}${name}</div>
            <div class="chat-preview">${preview}</div>
        </div>
        ${lastMsgTime ? '<div style="font-size: 11px; color: #999; margin-left: auto; text-align: right;">' + lastMsgTime + '</div>' : ''}
    `;
    
    div.style.cursor = 'pointer';
    div.onclick = (e) => {
        e.stopPropagation();
        setActiveChat(name, div);
        // Закрыть боковую панель на мобильных
        closeSidebar();
    };
    // Открывать меню действий для чата по правой кнопке мыши
    div.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showChatActionPopup(name, div, e);
    };
    
    // Примечание: удаление контакта выполняется через popup действий (удалить)
    
    list.appendChild(div);
}

function setActiveChat(name, element) {
    activeContact = name;
    // Включаем ввод после выбора чата
    setMessageInputEnabled(true);
    // Показать шапку и панель ввода
    updateChatAreaVisibility(true);
    document.getElementById('current-chat-title').innerText = name;

    // Проверяем, это бот или пользователь
    const activeBots = getActiveBots();
    const isBot = activeBots.includes(name);
    
    if (isBot) {
        document.getElementById('current-chat-avatar').src = getAvatarUrl(name, 48);
        document.getElementById('current-chat-subtitle').innerText = '🤖 Бот | Статус: онлайн';
    } else {
        document.getElementById('current-chat-avatar').src = getAvatarUrl(name, 48);
        document.getElementById('current-chat-subtitle').innerText = '● Онлайн';
    }

    document.querySelectorAll('.chat-row').forEach(r => r.classList.remove('active'));
    if (element) element.classList.add('active');
    renderMessages();
}

function getLastMessage(contact) {
    const msgs = messages.filter(m => 
        (m.from === me.name && m.to === contact) || 
        (m.from === contact && m.to === me.name)
    );
    return msgs[msgs.length - 1];
}

function addEmoji(emoji) {
    document.getElementById('msg-input').value += emoji;
}

function checkEnter(e) {
    if (e.key === 'Enter') doSend();
}

function doSend() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text) return;
    if (!activeContact) {
        alert('Выберите чат слева, чтобы отправить сообщение');
        return;
    }

    // Автоматически добавляем контакт, если его нет
    addUserContact(me.name, activeContact);

    const msg = {
        id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        from: me.name,
        to: activeContact,
        text: text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'text'
    };

    // Сначала локально добавляем и рендерим (быстрый отклик)
    messages.push(msg);
    saveMessagesForUser(me.name);  // Сохраняем для текущего пользователя
    input.value = '';
    renderMessages();

    // Отправляем на WebSocket сервер, если он доступен — иначе используем BroadcastChannel
    if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'msg', msg })); } catch (e) { console.warn('ws send failed', e); }
    } else {
        if (channel) channel.postMessage({ type: 'messages_update', messages });
    }

    // Логика бота (локальная) — любой бот из списка активных может отвечать
    const activeBots = getActiveBots();
    if (activeBots.includes(activeContact)) {
        handleBotResponse(text);
    }
}

function sendFile(input) {
    if (input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const msg = {
                id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
                from: me.name,
                to: activeContact,
                text: `<img src="${e.target.result}" style="max-width:200px; border-radius:10px;">`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                type: 'image'
            };
            messages.push(msg);
            saveMessagesForUser(me.name);  // Сохраняем для текущего пользователя
            renderMessages();
            if (ws && ws.readyState === WebSocket.OPEN) {
                try { ws.send(JSON.stringify({ type: 'msg', msg })); } catch (e) { /* ignore */ }
            } else if (channel) {
                channel.postMessage({ type: 'messages_update', messages });
            }
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function renderMessages() {
    const box = document.getElementById('chat-box');
    if (!box) return;

    const chatMessages = messages.filter(m => 
        (m.from === me.name && m.to === activeContact) || 
        (m.from === activeContact && m.to === me.name)
    );

    const prevCount = lastRenderedCount[activeContact] || 0;

    // Если переключился чат или ещё ничего не отрисовывали — делаем полный рендер
    if (lastActiveChat !== activeContact || prevCount === 0) {
        box.innerHTML = '';
        chatMessages.forEach(m => {
            const msgDiv = document.createElement('div');
            msgDiv.className = `msg ${m.from === me.name ? 'msg-me' : 'msg-them'}`;
            msgDiv.setAttribute('data-msg-id', m.id);

            let avatarHtml = '';
            if (m.from !== me.name) {
                const avatarUrl = getAvatarUrl(m.from, 32);
                avatarHtml = `<div class="msg-meta"><img src="${avatarUrl}" class="msg-avatar"> <span class="msg-sender">${m.from}</span></div>`;
            }

            // Проверяем тип сообщения
            let bodyContent = m.text;
            // Голосовые уже содержат свой стиль, не нужно оборачивать

            const pinHtml = isPinnedMessage(m.id) ? '<span class="msg-pin" title="Закреплено">📌</span>' : '';
            msgDiv.innerHTML = `${avatarHtml}<div class="msg-body">${bodyContent}${pinHtml}<span class="msg-time">${m.time}</span></div>`;
            
            // Добавляем контекстное меню для сообщения
                // Добавляем контекстное меню для сообщения (правый клик)
                msgDiv.oncontextmenu = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showMessageContextMenu(e.clientX, e.clientY, m.id);
                };
            
            box.appendChild(msgDiv);
        });

        // ВСЕГДА скроллим вниз при переключении чата или первом рендере
        setTimeout(() => { box.scrollTop = box.scrollHeight; }, 10);
    } else {
        // Incremental update: добавляем только новые сообщения, не трогаем старые
        if (chatMessages.length > prevCount) {
            const newMsgs = chatMessages.slice(prevCount);
            newMsgs.forEach(m => {
                const msgDiv = document.createElement('div');
                msgDiv.className = `msg ${m.from === me.name ? 'msg-me' : 'msg-them'}`;
                msgDiv.setAttribute('data-msg-id', m.id);

                let avatarHtml = '';
                if (m.from !== me.name) {
                    const avatarUrl = getAvatarUrl(m.from, 32);
                    avatarHtml = `<div class="msg-meta"><img src="${avatarUrl}" class="msg-avatar"> <span class="msg-sender">${m.from}</span></div>`;
                }

                // Проверяем тип сообщения
                let bodyContent = m.text;
                // Голосовые уже содержат свой стиль, не нужно оборачивать

                const pinHtml = isPinnedMessage(m.id) ? '<span class="msg-pin" title="Закреплено">📌</span>' : '';
                msgDiv.innerHTML = `${avatarHtml}<div class="msg-body">${bodyContent}${pinHtml}<span class="msg-time">${m.time}</span></div>`;
                
                // Добавляем контекстное меню для сообщения
                msgDiv.oncontextmenu = (e) => {
                    e.preventDefault();
                    showMessageContextMenu(e.clientX, e.clientY, m.id);
                };
                
                box.appendChild(msgDiv);
            });
            // ВСЕГДА скроллим вниз при новых сообщениях (автоматический скролл)
            setTimeout(() => { box.scrollTop = box.scrollHeight; }, 10);
        }
    }

    lastRenderedCount[activeContact] = chatMessages.length;
    lastActiveChat = activeContact;

    // Обновляем состояние кнопки "вниз"
    updateScrollButton();
}

function syncMessages() {
    const username = me.name;
    if (!username) return;
    
    const key = 'zapretka_messages_' + username;
    const stored = localStorage.getItem(key);
    const remote = stored ? JSON.parse(stored) : [];
    
    // Синхронизируем с localStorage - сообщения в памяти могут быть новее
    if (messages.length > 0) {
        // Объединяем - все сообщения из памяти + новые из localStorage
        const ids = new Set(messages.map(m => m.id));
        remote.forEach(m => {
            if (!ids.has(m.id)) {
                messages.push(m);
            }
        });
        // Сохраняем синхронизированный список
        saveMessagesForUser(username);
    } else if (remote.length > 0) {
        // Если в памяти ничего нет, загружаем из localStorage
        messages = remote;
    }
    
    renderMessages();
    renderContacts();
}

function handleBotResponse(userMessage) {
    setTimeout(() => {
        let response = "Я тебя не понял. Напиши что-то другое!";
        const msg = userMessage.toLowerCase();

        // ════ КОМАНДЫ УПРАВЛЕНИЯ ════
        if (msg === '/помощь' || msg === '/help' || msg === '/h') {
            response = "📖 Доступные команды:\n" +
                      "/помощь - Показать эту справку\n" +
                      "/боты - Список активных ботов\n" +
                      "/версия - Версия приложения\n\n" +
                      "Напиши обычное сообщение, и я отвечу! 😊";
        } else if (msg === '/боты' || msg === '/bots') {
            const bots = getActiveBots();
            response = "🤖 Активные боты:\n" + bots.map((b, i) => `${i + 1}. ${b}`).join('\n');
        } else if (msg === '/версия' || msg === '/version' || msg === '/v') {
            response = "ℹ️ Zapretgram v1.0\n✨ Облегченный мессенджер\n🔐 Локальное хранилище";
        } 
        // ════ ОБЫЧНЫЕ ОТВЕТЫ ════
        else if (msg.includes('привет')) {
            response = "Привет! Как дела? 😊";
        } else if (msg.includes('как дела')) {
            response = "У меня всё отлично, я же бот! А у тебя как?";
        } else if (msg.includes('пока')) {
            response = "Пока! Заходи ещё! 👋";
        } else if (msg.includes('спасибо')) {
            response = "Пожалуйста! Рад помочь! 😊";
        } else if (msg.includes('кто ты')) {
            response = `Я ${activeContact}, твой виртуальный помощник! Напиши /помощь для команд.`;
        } else if (msg.includes('погода')) {
            response = "☀️ За окном +23°C, солнечно!";
        } else if (msg.includes('имя')) {
            response = `Меня зовут ${activeContact}, а тебя?`;
        } else if (msg.includes('люблю')) {
            response = "Я тебя тоже! ❤️";
        } else if (msg.includes('хорошо')) {
            response = "😄 Спасибо!";
        } else if (msg.includes('время')) {
            response = `🕐 Текущее время: ${new Date().toLocaleTimeString('ru-RU')}`;
        } else if (msg.includes('привет привет') || msg.includes('привет привет привет')) {
            response = "Хватит! 😂";
        }

        const botMsg = {
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            from: activeContact,
            to: me.name,
            text: response,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'text'
        };

        messages.push(botMsg);
        saveMessagesForUser(me.name);  // Сохраняем для текущего пользователя
        renderMessages();
        if (ws && ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ type: 'msg', msg: botMsg })); } catch (e) { /* ignore */ }
        } else if (channel) {
            channel.postMessage({ type: 'messages_update', messages });
        }
    }, 500 + Math.random() * 500); // 500-1000ms для более реалистичного ответа
}

function openProfileModal() {
    document.getElementById('profile-modal').style.display = 'flex';

    // Заполнить поля текущими данными
    document.getElementById('profile-name-input').value = me.name || '';
    document.getElementById('profile-nickname').value = me.nickname || '';
    document.getElementById('profile-birthplace').value = me.birthplace || '';
    document.getElementById('profile-birthyear').value = me.birthyear || '';
    document.getElementById('profile-bio').value = me.bio || '';
    document.getElementById('modal-avatar').src = me.avatar || 'https://i.pravatar.cc/100?u=me';
}

function updateAvatarFromModal(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            me.avatar = e.target.result;
            document.getElementById('modal-avatar').src = me.avatar;
            document.getElementById('my-avatar').src = me.avatar;
            updateUserData(me.name, { avatar: me.avatar });  // Обновляем профиль в регистрации
            updateUserInData(me);
            if (channel) channel.postMessage({ type: 'user_update', users });
            if (ws && ws.readyState === WebSocket.OPEN) {
                try { ws.send(JSON.stringify({ type: 'user_update', users })); } catch (e) {}
            }
            renderContacts();
            renderMessages();
        };
        reader.readAsDataURL(file);
    }
}

// ПРЕДУСТАНОВЛЕННЫЕ АВАТАРЫ (проверяются локальные JPG, при их отсутствии попробует SVG)
const presetAvatars = [
    'assets/avatars/avatar1.jpg',
    'assets/avatars/avatar2.jpg',
    'assets/avatars/avatar3.jpg',
    'assets/avatars/avatar4.jpg',
    'assets/avatars/avatar5.jpg',
    'assets/avatars/avatar6.jpg',
    'assets/avatars/avatar7.jpg',
    'assets/avatars/avatar8.jpg'
];

function openAvatarPicker() {
    const modal = document.getElementById('avatar-picker-modal');
    if (!modal) return;
    const grid = document.getElementById('avatar-picker-grid');
    if (grid) {
        grid.innerHTML = '';
        presetAvatars.forEach((url, idx) => {
            const img = document.createElement('img');
            img.className = 'avatar-option';
            img.alt = 'avatar' + (idx + 1);
            img.src = url;
            // если JPG не найден — пробуем SVG с тем же именем
            img.onerror = function() {
                if (img.src.endsWith('.jpg') || img.src.endsWith('.jpeg') || img.src.endsWith('.png')) {
                    const svgPath = url.replace(/\.(jpg|jpeg|png)$/i, '.svg');
                    img.onerror = null; // не зацикливаемся
                    img.src = svgPath;
                }
            };
            img.onclick = function() { selectPresetAvatar(img.src); };
            grid.appendChild(img);
        });
    }
    modal.style.display = 'flex';
}

function selectPresetAvatar(url) {
    if (!me) return;
    me.avatar = url;
    // Обновить профиль
    document.getElementById('modal-avatar').src = me.avatar;
    const myAvatar = document.getElementById('my-avatar');
    if (myAvatar) myAvatar.src = me.avatar;
    updateUserData(me.name, { avatar: me.avatar });
    updateUserInData(me);
    if (channel) channel.postMessage({ type: 'user_update', users });
    if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'user_update', users })); } catch (e) { /* ignore */ }
    }
    renderContacts();
    renderMessages();
    closeModal('avatar-picker-modal');
}

function saveProfile() {
    me.name = document.getElementById('profile-name-input').value || me.name;
    me.nickname = document.getElementById('profile-nickname').value;
    me.birthplace = document.getElementById('profile-birthplace').value;
    me.birthyear = document.getElementById('profile-birthyear').value;
    me.bio = document.getElementById('profile-bio').value;

    // Сохранить в базе регистрации
    updateUserData(me.name, {
        nickname: me.nickname,
        birthplace: me.birthplace,
        birthyear: me.birthyear,
        bio: me.bio
    });

    // Обновить интерфейс
    document.getElementById('my-name').innerText = me.name;
    closeModal('profile-modal');

    // Обновить список контактов (для других пользователей)
    updateUserInData(me);
    if (channel) channel.postMessage({ type: 'user_update', users });
    if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'user_update', users })); } catch (e) {}
    }
    renderContacts();
    renderMessages();
}

function updateUserInData(updatedUser) {
    const userIndex = users.findIndex(u => u.name === updatedUser.name);
    if (userIndex !== -1) {
        users[userIndex] = { ...users[userIndex], ...updatedUser };
    }
}

function logout() {
    // Очищаем сессию
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('current_user');
    }
    
    // Очищаем глобальное состояние приложения
    me = null;
    activeContact = null;
    messages = [];
    try { updateChatAreaVisibility(false); } catch (e) {}
    
    // Показываем экран входа
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
    
    // Очищаем форму входа
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('username').focus();
    
    // Закрываем модальное окно
    closeModal('profile-modal');
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// ===== НАСТРОЙКИ: Тема и уведомления =====
function openSettingsModal() {
    document.getElementById('settings-modal').style.display = 'flex';
    // Заполняем значения из настроек
    const s = getAllSettings();
    try {
        document.getElementById('theme-select').value = s.theme || (localStorage.getItem('zapretka_theme') || 'dark');
        document.getElementById('notif-toggle').checked = !!s.notifications;
        document.getElementById('notif-status').innerText = s.notifications ? 'Включены' : 'Выключены';
        document.getElementById('notif-sound-select').value = s.notifSound || 'ping1';
        document.getElementById('font-range').value = s.fontSize || 15;
        document.getElementById('font-value').innerText = (s.fontSize || 15) + 'px';
        document.getElementById('show-online-toggle').checked = !!s.showOnline;
        document.getElementById('read-receipts-toggle').checked = !!s.readReceipts;

        // Обновляем превью размера шрифта при движении ползунка
        const fr = document.getElementById('font-range');
        if (fr) fr.oninput = function() { document.getElementById('font-value').innerText = this.value + 'px'; };
    } catch (e) { /* ignore if modal elements missing */ }
}

function changeTheme(theme) {
    if (theme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }
    localStorage.setItem('zapretka_theme', theme);
}

function toggleTheme() {
    const current = localStorage.getItem('zapretka_theme') || (document.body.classList.contains('light-theme') ? 'light' : 'dark');
    const next = current === 'light' ? 'dark' : 'light';
    changeTheme(next);
    updateThemeToggleIcon(next);
}

function updateThemeToggleIcon(theme) {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    if (theme === 'light') {
        btn.innerText = '🌞';
        btn.style.color = 'var(--accent-pink)';
    } else {
        btn.innerText = '🌙';
        btn.style.color = '#ff5252';
    }
}

function toggleNotifications(enabled) {
    localStorage.setItem('zapretka_notifications', enabled ? 'on' : 'off');
    document.getElementById('notif-status').innerText = enabled ? 'Включены' : 'Выключены';
}

/* ===== Сохранение и применение расширенных настроек ===== */
function getAllSettings() {
    const key = 'zapretka_settings_' + (me && me.name ? me.name : 'global');
    const stored = localStorage.getItem(key);
    const defaults = {
        theme: localStorage.getItem('zapretka_theme') || 'dark',
        notifications: localStorage.getItem('zapretka_notifications') !== 'off',
        notifSound: 'ping1',
        fontSize: 15,
        showOnline: true,
        readReceipts: true
    };
    try {
        return stored ? Object.assign({}, defaults, JSON.parse(stored)) : defaults;
    } catch (e) { return defaults; }
}

function saveAllSettings(settings) {
    const key = 'zapretka_settings_' + (me && me.name ? me.name : 'global');
    try { localStorage.setItem(key, JSON.stringify(settings)); } catch (e) {}
}

function applyAllSettings(settings) {
    if (!settings) settings = getAllSettings();
    // Тема
    if (settings.theme) { changeTheme(settings.theme); updateThemeToggleIcon(settings.theme); }
    // Уведомления
    if (typeof settings.notifications !== 'undefined') toggleNotifications(!!settings.notifications);
    // Размер шрифта
    if (settings.fontSize) document.documentElement.style.fontSize = (parseInt(settings.fontSize, 10) || 15) + 'px';
    // Показ онлайн
    if (typeof settings.showOnline !== 'undefined') {
        if (!settings.showOnline) document.body.classList.add('hide-online'); else document.body.classList.remove('hide-online');
    }
    // Подтверждения прочтения (сохраняем глобально для использования)
    window.zapretka_readReceipts = !!settings.readReceipts;
    // Звук уведомлений
    window.zapretka_notifSound = settings.notifSound || 'ping1';
}

function saveSettingsFromModal() {
    const theme = document.getElementById('theme-select')?.value || (localStorage.getItem('zapretka_theme') || 'dark');
    const notifications = !!document.getElementById('notif-toggle')?.checked;
    const notifSound = document.getElementById('notif-sound-select')?.value || 'ping1';
    const fontSize = parseInt(document.getElementById('font-range')?.value || '15', 10) || 15;
    const showOnline = !!document.getElementById('show-online-toggle')?.checked;
    const readReceipts = !!document.getElementById('read-receipts-toggle')?.checked;
    const settings = { theme, notifications, notifSound, fontSize, showOnline, readReceipts };
    saveAllSettings(settings);
    // Поддерживаем старые ключи для совместимости
    localStorage.setItem('zapretka_theme', theme);
    localStorage.setItem('zapretka_notifications', notifications ? 'on' : 'off');
    applyAllSettings(settings);
    alert('✅ Настройки сохранены');
    closeModal('settings-modal');
}

function exportData() {
    try {
        const data = {
            exportedAt: new Date().toISOString(),
            user: me ? me.name : null,
            messages: messages || [],
            contacts: getUserContacts(me?.name) || [],
            archived: archivedChats || [],
            bots: getActiveBots() || [],
            settings: getAllSettings(),
            pinned: getPinnedMessages() || []
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'zapretka-export-' + (me && me.name ? me.name : 'data') + '.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
    } catch (e) { alert('Экспорт не удался'); }
}

function importData(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = function(evt) {
        try {
            const obj = JSON.parse(evt.target.result);
            if (obj && obj.messages) {
                // Объединяем сообщения
                const ids = new Set(messages.map(m => m.id));
                (obj.messages || []).forEach(m => { if (!ids.has(m.id)) messages.push(m); });
                saveMessagesForUser(me.name);
                alert('✅ Данные импортированы (сообщения объединены)');
                renderMessages();
                renderContacts();
            }
        } catch (err) { alert('Ошибка при импорте: неверный формат'); }
    };
    r.readAsText(f);
}

// Автоприменение настроек при загрузке
document.addEventListener('DOMContentLoaded', () => {
    // ...existing code...
    // Обработка выбора пунктов меню приложения
    function handleMenuAction(action) {
        if (action === 'settings') {
            openSettingsModal();
        } else if (action === 'theme') {
            openSettingsModal();
        } else if (action === 'notifications') {
            openSettingsModal();
        } else if (action === 'privacy') {
            alert('Раздел "Приватность" в разработке.');
        } else if (action === 'about') {
            alert('Zapretgram v1.0.0\nАвтор: Юсуф');
        } else if (action === 'export') {
            alert('Экспорт данных в разработке.');
        }
    }
    // Применить тему
    const theme = localStorage.getItem('zapretka_theme') || 'dark';
    if (theme === 'light') document.body.classList.add('light-theme');
    // Обновить иконку переключателя темы
    updateThemeToggleIcon(theme || (document.body.classList.contains('light-theme') ? 'light' : 'dark'));
    // Применить статус уведомлений
    const notif = localStorage.getItem('zapretka_notifications') !== 'off';
    if (document.getElementById('notif-toggle')) {
        document.getElementById('notif-toggle').checked = notif;
        document.getElementById('notif-status').innerText = notif ? 'Включены' : 'Выключены';
    }
});

function initCursorLight() {
    const light = document.createElement('div');
    document.body.appendChild(light);

    document.addEventListener('mousemove', (e) => {
        light.style.left = e.clientX + 'px';
        light.style.top = e.clientY + 'px';
    });
}

function archiveChat(name) {
    const activeBots = getActiveBots();
    if (!name || isArchived(name) || activeBots.includes(name)) return; // Боты не архивируются
    archivedChats.unshift(name);
    saveArchived();
    // Если архивируем текущий активный чат, переключаемся на первого бота
    if (activeContact === name) {
        activeContact = activeBots[0] || 'Zapret Bot';
        document.getElementById('current-chat-title').innerText = activeContact;
        document.getElementById('current-chat-avatar').src = 'https://i.pravatar.cc/48?u=bot';
        renderMessages();
    }
    renderContacts();
}

function unarchiveChat(name) {
    const idx = archivedChats.indexOf(name);
    if (idx === -1) return;
    archivedChats.splice(idx, 1);
    saveArchived();
    renderContacts();
}

function toggleArchiveCurrentChat() {
    const activeBots = getActiveBots();
    if (!activeContact || activeBots.includes(activeContact)) {
        alert('🤖 Боты не могут быть архивированы!');
        return;
    }
    if (isArchived(activeContact)) {
        unarchiveChat(activeContact);
    } else {
        archiveChat(activeContact);
    }
}

/* ---------- Кнопка быстрого скролла вниз и логика показа ---------- */
function scrollToBottom() {
    const box = document.getElementById('chat-box');
    if (!box) return;
    box.scrollTop = box.scrollHeight;
    const btn = document.getElementById('scroll-down-btn');
    if (btn) btn.classList.remove('show');
}

function updateScrollButton() {
    const box = document.getElementById('chat-box');
    const btn = document.getElementById('scroll-down-btn');
    if (!box || !btn) return;
    const atBottom = (box.scrollHeight - box.scrollTop - box.clientHeight) < 50;
    if (atBottom) {
        btn.classList.remove('show');
    } else {
        btn.classList.add('show');
    }
}

/* ---------- МЕНЮ И ЗВОНКИ ---------- */
function openBurgerMenu() {
    alert('Открыть меню (Настройки, Папки, Создать канал) — заглушка.');
}

function openAppMenu() {
    document.getElementById('app-menu-modal').style.display = 'flex';
}

function handleMenuAction(action) {
    switch(action) {
        case 'settings':
        case 'theme':
        case 'notifications':
        case 'privacy':
            openSettingsModal();
            break;
        case 'about':
            alert('ℹ️ О приложении\n\nZapretgram v1.0.0\n© 2026 Zapretka\n\nМессенджер для общения в реальном времени');
            break;
        case 'export':
            exportData();
            break;
        default:
            openSettingsModal();
            break;
    }
}

/* ════ ЭМОДЗИ, СТИКЕРЫ, GIF ПАНЕЛЬ ════ */
let currentRightTab = 'emoji';
let allStickers = [];

// Большой набор эмодзи (категории) - 300+ элементов
const emojiCategories = {
    emoji: [
        // Смайлики (60+)
        '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
        '🥲', '😋', '😛', '😜', '🤪', '😌', '😔', '😑', '😐', '😶', '🤐', '🤨', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪',
        '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '', '🤬', '🤡', '👿', '😈', '👹', '👺', '💀', '☠️', '👻', '👽', '👾', '🤖',
        // Коты (20+)
        '😺', '�', '�', '😻', '😼', '😽', '🙀', '😿', '😾', '�😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '�', '�', '�',
        // Животные (40+)
        '�', '�', '🦊', '�', '�', '�', '�', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦',
        '�', '�', '�', '🦆', '🦅', '🦉', '🦇', '�', '�', '�', '�', '�', '🪱', '�', '🦋', '�', '🐞', '🐜', '�', '�',
        // Еда (40+)
        '🍕', '🍔', '🍟', '🍗', '🌭', '🍖', '🌮', '🌯', '�', '�', '�', '�', '🍳', '🍞', '�', '🥖', '🥨', '🧀', '🥚', '🍳',
        '🧈', '🥞', '🥓', '🥩', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '�', '�', '🍲', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣', '🍤',
        // Напитки и фрукты (40+)
        '🍥', '🥠', '🥮', '🍱', '🍘', '🍙', '🍚', '🍗', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣', '🍤', '🍥', '�', '�', '🍦', '🍧',
        '🍨', '🍩', '🍪', '🎂', '🍰', '�', '🍫', '🍬', '🍭', '🍮', '🍯', '🍼', '�', '☕', '🍵', '🍶', '🍾', '🍷', '🍸', '🍹',
        // Дополнительно (40+)
        '🍺', '🍻', '🥂', '�', '�', '�', '�', '�', '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '�', '🎳', '🏓', '🏸',
        '🏒', '🏑', '�', '🏏', '�', '⛳', '⛸️', '🎣', '🎽', '🎿', '�', '🥌', '🎯', '🪀', '🪃', '🎪', '🎨', '🎬', '🎤', '🎧'
    ],
    stickers: [
        // Праздники и события (60+)
        '🎃', '🎄', '🎆', '🎇', '✨', '🎈', '🎉', '🎊', '🎁', '🎀', '🎗️', '🎯', '🎲', '🎮', '🎰', '🎸', '🎹', '🎺', '🎷', '🥁',
        '🎻', '🎼', '🎤', '�', '📻', '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️',
        '🛵', '🦯', '🦽', '🦼', '🛺', '🚲', '🛴', '🛹', '🛼', '🚏', '⛽', '🚨', '🚥', '🚦', '🛑', '🚧', '⚓', '⛵', '🛶', '🚤',
        // Технология (60+)
        '⛴️', '🛳️', '⛴️', '🚀', '🛸', '✈️', '🛫', '🛬', '🛰️', '💺', '🛶', '⛵', '🚤', '🛳️', '⛴️', '🚨', '�', '�', '🚘', '�',
        '�', '�', '�', '�', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '✈️', '🛫', '🛬', '🛰️', '💺',
        '�', '💻', '⌨️', '�️', '�️', '🖥️', '�️', '�️', '�', '�', '�', '�', '�', '�', '�', '�', '🎥', '🎬', '📺', '📻',
        // Природа и животные (60+)
        '🌍', '🌎', '🌏', '🌐', '�️', '�', '�', '�', '⛩️', '🏔️', '⛰️', '🌋', '⛰️', '🏕️', '⛺', '🏠', '🏡', '🏢', '🏣', '🏤',
        '🏥', '🏦', '🏧', '🏨', '🏩', '🏪', '🏫', '🏬', '🏭', '🏯', '🏰', '�', '�', '�', '⛪', '⛩️', '�', '�', '�', '⛩️',
        '�️', '�️', '🗾', '⛲', '⛺', '🏕️', '⛰️', '🏔️', '🌋', '⛰️', '🏕️', '⛺', '🏠', '🏡', '🏢', '🏣', '🏤', '🏥', '🏦', '🏧'
    ],
    gif: [
        // Медиа и развлечения (100+)
        '🎬', '📹', '📷', '📸', '🎥', '🎞️', '📽️', '🎦', '📺', '📻', '📡', '📢', '📣', '📯', '📼', '💿', '📀', '🎵', '🎶', '🎼',
        '🎤', '🎧', '🎷', '🎸', '🎹', '🥁', '🎺', '🎻', '🎲', '♟️', '🎯', '🎳', '🎮', '🎰', '🎪', '🎨', '🎭', '�️', '🎞️', '�️',
        '🎬', '🎤', '🎧', '🎼', '🎹', '🎸', '🎺', '🎷', '🥁', '🎻', '🎲', '🎯', '🎳', '🎮', '🎰', '🎪', '🎨', '🎭', '�️', '🎞️',
        '�', '�', '📀', '�', '🎶', '📻', '📡', '📢', '📣', '📯', '🔔', '🔕', '📯', '📻', '📡', '📢', '📣', '📯', '🔔', '🔕',
        '�', '�', '�', '�', '�', '�', '�', '�', '📯', '�', '📡', '📢', '📣', '�', '�', '�', '�', '�', '�', '📢',
        '📣', '�', '�', '�', '�', '�', '📡', '📢', '�', '�', '�', '🔕', '�', '�', '📡', '�', '�', '�', '�', '�',
        // Смайлики в движении (100+)
        '🕺', '�', '�️', '�', '�', '🧘', '🏃', '�', '🤸', '⛹️', '🏋️', '�', '�', '🤾', '🤺', '🏇', '⛷️', '🏂', '�🚂', '🏌️',
        '🎣', '🤼', '🤸', '⛹️', '🏋️', '�', '�', '🤾', '🤺', '🏇', '⛷️', '🏂', '🪂', '🏌️', '🎣', '🤼', '🤸', '⛹️', '🏋️', '�',
        '�', '🤾', '🤺', '🏇', '⛷️', '🏂', '🪂', '🏌️', '🎣', '🤼', '🤸', '⛹️', '🏋️', '�', '�', '🤾', '🤺', '🏇', '⛷️', '🏂',
        '🪂', '🏌️', '🎣', '🤼', '🤸', '⛹️', '🏋️', '�', '�', '🤾', '🤺', '🏇', '⛷️', '🏂', '🪂', '🏌️', '🎣', '🤼', '🤸', '⛹️'
    ]
};

// Инициализируем панель при загрузке
function initRightPanel() {
    renderStickers('emoji');
}

function switchRightTab(tab) {
    currentRightTab = tab;
    
    // Обновляем активный таб
    document.querySelectorAll('.right-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    // Очищаем поиск
    const searchInput = document.getElementById('right-search');
    if (searchInput) searchInput.value = '';
    
    // Рендерим нужный контент
    renderStickers(tab);
}

function renderStickers(type) {
    const grid = document.getElementById('sticker-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    const items = emojiCategories[type] || emojiCategories['emoji'];
    
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'sticker-item';
        div.innerText = item;
        div.onclick = () => insertSticker(item);
        div.style.cursor = 'pointer';
        grid.appendChild(div);
    });
}

function insertSticker(sticker) {
    const input = document.getElementById('msg-input');
    if (input) {
        input.value += sticker;
        input.focus();
    }
}

function filterStickers() {
    const searchInput = document.getElementById('right-search');
    if (!searchInput) return;
    
    const query = searchInput.value.toLowerCase();
    const items = document.querySelectorAll('.sticker-item');
    
    items.forEach(item => {
        if (!query || item.innerText.includes(query)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}
function renderBotsList() {
    const list = document.getElementById('bots-list');
    const bots = getActiveBots();
    
    if (bots.length === 0) {
        list.innerHTML = '<p style="color: #999; text-align: center;">Нет активных ботов</p>';
        return;
    }
    
    list.innerHTML = '';
    bots.forEach(botName => {
        const div = document.createElement('div');
        div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee; border-radius: 4px; margin-bottom: 5px; background: #f9f9f9;';
        
        const nameSpan = document.createElement('span');
        nameSpan.innerText = botName;
        nameSpan.style.fontWeight = 'bold';
        nameSpan.style.flex = '1';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.innerText = '✕ Удалить';
        deleteBtn.style.cssText = 'padding: 5px 10px; background: #ff6b6b; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;';
        deleteBtn.disabled = botName === 'Zapret Bot'; // Нельзя удалить основного бота
        if (botName === 'Zapret Bot') {
            deleteBtn.style.opacity = '0.5';
            deleteBtn.title = 'Основной бот не может быть удалён';
        }
        deleteBtn.onclick = () => {
            if (confirm(`Удалить бота "${botName}"?`)) {
                if (removeBot(botName)) {
                    renderContacts();
                    renderBotsList();
                }
            }
        };
        
        div.appendChild(nameSpan);
        div.appendChild(deleteBtn);
        list.appendChild(div);
    });
}

function addNewBot() {
    const input = document.getElementById('bot-name-input');
    const botName = input.value.trim();
    
    if (!botName) {
        alert('Введите имя бота');
        return;
    }
    
    if (botName.length > 30) {
        alert('Имя бота слишком длинное (максимум 30 символов)');
        return;
    }
    
    if (getActiveBots().includes(botName)) {
        alert('Бот с таким именем уже существует!');
        return;
    }
    
    addBot(botName);
    input.value = '';
    renderContacts();
    renderBotsList();
}

function removeDuplicates() {
    if (removeDuplicateBots()) {
        alert('✓ Дубликаты удалены!');
        renderContacts();
        renderBotsList();
    } else {
        alert('Дубликаты не найдены');
    }
}

function searchInChat() {
    // Поиск перенесён в setupSearch() — просто сфокусируем поле поиска
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.focus();
}

// Простая реализация модального звонка
let currentCall = null;
function startCall() {
    currentCall = { type: 'audio', peer: activeContact };
    showCallModal('Исходящий звонок: ' + (activeContact || 'Контакт'));
}

function startVideoCall() {
    currentCall = { type: 'video', peer: activeContact };
    showCallModal('Видеозвонок: ' + (activeContact || 'Контакт'));
}

function showCallModal(title) {
    const modal = document.getElementById('call-modal');
    if (!modal) return;
    // Определяем абонента и тип звонка
    const peer = (currentCall && currentCall.peer) || activeContact || (title || '').replace(/^.*:\s*/, '') || 'Контакт';
    const type = (currentCall && currentCall.type) === 'video' ? 'Видеозвонок' : 'Исходящий звонок';

    const avatar = document.getElementById('call-avatar');
    const peerEl = document.getElementById('call-peer');
    const typeEl = document.getElementById('call-type');
    const statusEl = document.getElementById('call-status');

    if (avatar) avatar.src = getAvatarUrl(peer, 160);
    if (peerEl) peerEl.innerText = peer;
    if (typeEl) typeEl.innerText = type;
    if (statusEl) statusEl.innerText = 'Инициализация...';

    modal.style.display = 'flex';
    // Закрыть по клику вне содержимого
    modal.onclick = (e) => { if (e.target === modal) hangupCall(); };
}

function acceptCall() {
    const status = document.getElementById('call-status');
    const modal = document.getElementById('call-modal');
    if (!status) return;
    status.innerText = 'Соединено';
    if (modal) modal.classList.add('connected');
    const acceptBtn = modal && modal.querySelector('.call-btn.accept');
    if (acceptBtn) { acceptBtn.disabled = true; }
}

function hangupCall() {
    const modal = document.getElementById('call-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('connected');
        modal.onclick = null;
    }
    currentCall = null;
    // восстановим кнопку принятия
    const acceptBtn = document.querySelector('#call-modal .call-btn.accept');
    if (acceptBtn) acceptBtn.disabled = false;
}

// Голосовая запись (используем MediaRecorder, если доступно)
let mediaRecorder = null;
let audioChunks = [];

// Инициализация микрофона один раз
async function initMicrophone() {
    if (microphoneStream) return; // Уже инициализирован
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('getUserMedia не поддерживается');
        return;
    }
    
    try {
        microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('Микрофон инициализирован');
    } catch (err) {
        console.error('Ошибка при инициализации микрофона:', err.message);
    }
}

async function toggleRecording() {
    const btn = document.getElementById('voice-btn');
    if (!btn) return;
    
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        // остановить запись
        mediaRecorder.stop();
        btn.classList.remove('recording');
        btn.innerText = '🎙️';
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        // fallback: отправить заглушку голосового сообщения
        const msg = {
            from: me.name,
            to: activeContact,
            text: '[Voice message] (не поддерживается браузером)',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'voice'
        };
        messages.push(msg);
        saveMessagesForUser(me.name);  // Сохраняем для текущего пользователя
        if (channel) channel.postMessage({ type: 'messages_update', messages });
        renderMessages();
        return;
    }

    try {
        // Инициализируем микрофон если ещё не инициализирован
        if (!microphoneStream) {
            await initMicrophone();
        }
        
        if (!microphoneStream) {
            alert('Не удалось получить доступ к микрофону');
            return;
        }
        
        mediaRecorder = new MediaRecorder(microphoneStream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);
            const fileSize = (blob.size / 1024).toFixed(1); // размер в KB
            const voiceId = 'voice_' + Date.now();
            const msg = {
                from: me.name,
                to: activeContact,
                text: `<div class="custom-voice-player" data-voice-id="${voiceId}" data-src="${url}"><div class="voice-play-btn" onclick="playVoice('${voiceId}')">▶</div><div class="voice-content"><div class="voice-progress-container"><input type="range" class="voice-progress" id="progress-${voiceId}" min="0" max="100" value="0" onchange="seekVoice('${voiceId}', this.value)"><div class="voice-waveform"></div></div><div class="voice-info"><span class="voice-time" id="time-${voiceId}">0:00</span><span class="voice-duration" id="duration-${voiceId}">0:00</span></div></div><audio id="audio-${voiceId}" src="${url}" style="display:none;"></audio></div>`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                type: 'voice'
            };
            messages.push(msg);
            saveMessagesForUser(me.name);  // Сохраняем для текущего пользователя
            if (channel) channel.postMessage({ type: 'messages_update', messages });
            renderMessages();
            // НЕ останавливаем поток! Оставляем его для следующей записи
        };
        mediaRecorder.start();
        btn.classList.add('recording');
        btn.innerText = '⏺';
    } catch (err) {
        alert('Ошибка при записи: ' + err.message);
    }
}

// Воспроизведение голосового сообщения
function playVoice(voiceId) {
    const audio = document.getElementById('audio-' + voiceId);
    const btn = document.querySelector(`[data-voice-id="${voiceId}"] .voice-play-btn`);
    const timeEl = document.getElementById('time-' + voiceId);
    const progressEl = document.getElementById('progress-' + voiceId);
    const durationEl = document.getElementById('duration-' + voiceId);
    
    if (!audio) return;
    
    if (audio.paused) {
        // Первый раз - загружаем metadata
        if (audio.duration === 0) {
            audio.onloadedmetadata = () => {
                const mins = Math.floor(audio.duration / 60);
                const secs = Math.floor(audio.duration % 60);
                durationEl.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
            };
        } else {
            const mins = Math.floor(audio.duration / 60);
            const secs = Math.floor(audio.duration % 60);
            durationEl.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
        }
        
        audio.play();
        btn.classList.add('playing');
        btn.innerText = '⏸';
        
        // Обновляем прогресс и время
        const updateProgress = () => {
            if (audio.duration) {
                const percent = (audio.currentTime / audio.duration) * 100;
                if (progressEl) {
                    progressEl.value = percent;
                    progressEl.style.setProperty('--progress-width', percent + '%');
                }
            }
            
            const mins = Math.floor(audio.currentTime / 60);
            const secs = Math.floor(audio.currentTime % 60);
            timeEl.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
            
            if (!audio.paused) requestAnimationFrame(updateProgress);
        };
        updateProgress();
        
        audio.onended = () => {
            btn.classList.remove('playing');
            btn.innerText = '▶';
            if (progressEl) progressEl.value = 0;
            timeEl.innerText = '0:00';
        };
    } else {
        audio.pause();
        btn.classList.remove('playing');
        btn.innerText = '▶';
    }
}

// Поиск в голосовом сообщении
function seekVoice(voiceId, value) {
    const audio = document.getElementById('audio-' + voiceId);
    const timeEl = document.getElementById('time-' + voiceId);
    const progressEl = document.getElementById('progress-' + voiceId);
    
    if (!audio || !audio.duration) return;
    
    audio.currentTime = (value / 100) * audio.duration;
    
    // Обновляем отображение времени
    const mins = Math.floor(audio.currentTime / 60);
    const secs = Math.floor(audio.currentTime % 60);
    timeEl.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
    
    // Обновляем визуальную часть прогресса
    if (progressEl) {
        progressEl.style.setProperty('--progress-width', value + '%');
    }
}

// Вызов игр (можно добавить позже)
function openTTT() { alert('Игра "Крестики-нолики" будет скоро!'); }
function openSlots() { alert('Игровой автомат будет скоро!'); }

/* ---------- ФУНКЦИЯ ПОИСКА ПО СООБЩЕНИЯМ И КОНТАКТАМ ---------- */
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', async (e) => {
        const query = e.target.value.toLowerCase().trim();
        
        if (!query) {
            // Если поле пусто — показываем все контакты
            renderContacts();
            return;
        }
        
        // Ищем контакты и сообщения
        const list = document.getElementById('contacts-list');
        if (!list) return;
        list.innerHTML = '';
        
        // 1. Поиск по локальным контактам
        const allContacts = [
            { name: 'Zapret Bot', avatar: 'https://i.pravatar.cc/48?u=bot', type: 'bot' },
            ...(users || [])
        ];
        
        const matchedContacts = allContacts.filter(c => 
            c.name.toLowerCase().includes(query) && c.name !== me.name
        );
        
        if (matchedContacts.length > 0) {
            const header = document.createElement('div');
            header.className = 'search-header';
            header.innerText = '👥 Мои контакты (' + matchedContacts.length + ')';
            list.appendChild(header);
            
            matchedContacts.forEach(c => {
                addContactToSidebar(c.name, '', c.avatar, '');
            });
        }
        
        // 2. Поиск по глобальным пользователям (для добавления новых контактов)
        let serverUsers = [];
        try {
            const resp = await fetch('/api/users');
            if (resp.ok) {
                const j = await resp.json();
                if (j && j.success && Array.isArray(j.users)) serverUsers = j.users;
            }
        } catch (err) { console.warn('users fetch failed', err); }

        const allUsers = serverUsers.length ? serverUsers : getAllRegisteredUsers();
        const existingNames = allContacts.map(c => c.name);
        const newUsers = allUsers.filter(u =>
            (u.name || '').toLowerCase().includes(query) &&
            u.name !== me.name &&
            !existingNames.includes(u.name)
        );
        
        if (newUsers.length > 0) {
            const header = document.createElement('div');
            header.className = 'search-header';
            header.style.marginTop = matchedContacts.length > 0 ? '15px' : '0';
            header.innerText = '🔍 Найти пользователей (' + newUsers.length + ')';
            list.appendChild(header);
            
            newUsers.forEach(u => {
                const div = document.createElement('div');
                div.className = 'chat-row';
                div.style.cursor = 'pointer';
                div.innerHTML = `
                    <img src="${u.avatar}" class="chat-avatar-small">
                    <div class="chat-info">
                        <div class="chat-name">➕ ${u.name}</div>
                        <div class="chat-preview">Нажмите, чтобы добавить</div>
                    </div>
                `;
                div.onclick = () => {
                    // Добавляем контакт и открываем чат
                    addUserContact(me.name, u.name);
                    activeContact = u.name;
                    renderContacts();
                    renderMessages();
                    searchInput.value = '';
                    searchInput.focus();
                };
                list.appendChild(div);
            });
        }
        
        // 3. Поиск по сообщениям
        const matchedMessages = (messages || []).filter(m =>
            (m.text && m.text.toLowerCase().includes(query)) ||
            (m.from && m.from.toLowerCase().includes(query))
        );
        
        if (matchedMessages.length > 0) {
            const header = document.createElement('div');
            header.className = 'search-header';
            header.style.marginTop = '20px';
            header.innerText = '💬 Сообщения (' + matchedMessages.length + ')';
            list.appendChild(header);
            
            // Группируем сообщения по чату
            const grouped = {};
            matchedMessages.forEach(m => {
                const chat = m.from === me.name ? m.to : m.from;
                if (!grouped[chat]) grouped[chat] = [];
                grouped[chat].push(m);
            });
            
            Object.keys(grouped).forEach(chat => {
                const chatDiv = document.createElement('div');
                chatDiv.className = 'search-chat-group';
                chatDiv.style.padding = '10px 12px';
                chatDiv.style.borderLeft = '3px solid #ff4d6d';
                chatDiv.style.cursor = 'pointer';
                chatDiv.style.marginBottom = '10px';
                chatDiv.style.borderRadius = '6px';
                chatDiv.style.background = 'rgba(255, 77, 109, 0.05)';
                chatDiv.onclick = () => {
                    activeContact = chat;
                    renderContacts();
                    renderMessages();
                    searchInput.value = '';
                    searchInput.focus();
                };
                
                chatDiv.innerHTML = `
                    <strong>${chat}</strong><br>
                    <small style="color: #aaa;">${grouped[chat].length} совпаден${grouped[chat].length === 1 ? 'ие' : 'ий'}</small>
                `;
                list.appendChild(chatDiv);
            });
        }
        
        if (matchedContacts.length === 0 && matchedMessages.length === 0) {
            const noResults = document.createElement('div');
            noResults.style.textAlign = 'center';
            noResults.style.padding = '30px 15px';
            noResults.style.color = '#888';
            noResults.innerText = '❌ Ничего не найдено';
            list.appendChild(noResults);
        }
    });
}

// Автоматический вход обработан в auth.js через checkAutoLogin()

/* Переключение видимости архива */
function toggleArchivedSection() {
    const archivedSection = document.querySelector('.archived-section');
    if (!archivedSection) return;
    
    const isHidden = archivedSection.style.display === 'none';
    archivedSection.style.display = isHidden ? 'block' : 'none';
    
    // Сохраняем состояние в localStorage
    localStorage.setItem('zapretka_archive_visible', JSON.stringify(!isHidden));
}

/* ════ КОНТЕКСТНОЕ МЕНЮ (ПРАВАЯ КНОПКА МЫШИ) ════ */
let currentContextChat = null;

// Обрабатываем правый клик глобально, но пропускаем клики по строкам чатов и сообщениям
document.addEventListener('contextmenu', (e) => {
    const chatRow = e.target.closest('.chat-row');
    const msgEl = e.target.closest('.msg');
    if (chatRow || msgEl) {
        // Эти элементы обрабатываются своими обработчиками (oncontextmenu на элементах)
        return;
    }
    // Для остальных элементов — оставляем стандартное поведение (не показываем глобальное меню)
});

// Закрываем контекстное меню при клике
document.addEventListener('click', () => {
    hideContextMenu();
});

function showContextMenu(x, y) {
    const menu = document.getElementById('context-menu');
    if (!menu) return;
    
    menu.classList.add('active');
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    
    // Убедимся, что меню не выходит за границы экрана
    setTimeout(() => {
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = (window.innerHeight - rect.height - 10) + 'px';
        }
    }, 0);
}

function hideContextMenu() {
    const menu = document.getElementById('context-menu');
    if (menu) {
        menu.classList.remove('active');
    }
}

function handleContextMenu(action) {
    if (!currentContextChat) return;
    
    hideContextMenu();
    
    switch(action) {
        case 'archive':
            archiveChat(currentContextChat);
            alert(`✅ Чат "${currentContextChat}" архивирован`);
            renderContacts();
            break;
            
        case 'unmute':
            alert(`📌 Чат "${currentContextChat}" откреплен`);
            break;
            
        case 'silent':
            alert(`🔇 Уведомления отключены для "${currentContextChat}"`);
            break;
            
        case 'mark-read':
            alert(`✅ Чат "${currentContextChat}" отмечен как прочитанный`);
            break;
            
        case 'add-folder':
            alert(`📁 Выберите папку для "${currentContextChat}"`);
            break;
            
        case 'clear-history':
            if (confirm(`🧹 Очистить историю чата с "${currentContextChat}"?\n\nЭто нельзя будет отменить!`)) {
                // Удаляем все сообщения с этим контактом
                messages = messages.filter(m => !(
                    (m.from === currentContextChat && m.to === me.name) ||
                    (m.from === me.name && m.to === currentContextChat)
                ));
                saveMessagesForUser(me.name);  // Сохраняем для текущего пользователя
                renderMessages();
                renderContacts();
                alert(`✅ История чата с "${currentContextChat}" очищена`);
            }
            break;
            
        case 'delete':
            if (confirm(`🗑️ Удалить чат с "${currentContextChat}"?\n\nЭто нельзя будет отменить!`)) {
                // Удаляем все сообщения и архивируем (или можем сделать удаление из бд)
                archiveChat(currentContextChat);
                messages = messages.filter(m => !(
                    (m.from === currentContextChat && m.to === me.name) ||
                    (m.from === me.name && m.to === currentContextChat)
                ));
                saveMessagesForUser(me.name);  // Сохраняем для текущего пользователя
                renderContacts();
                renderMessages();
                alert(`✅ Чат с "${currentContextChat}" удален`);
            }
            break;
    }
}

/* ════════════════════════════════════════════════════════ */
/* МОБИЛЬНАЯ ФУНКЦИОНАЛЬНОСТЬ */
/* ════════════════════════════════════════════════════════ */

// Открыть боковую панель
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    sidebar.classList.toggle('active');
}

// Закрыть боковую панель
function closeSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    sidebar.classList.remove('active');
}

// Закрыть боковую панель при клике вне её
document.addEventListener('click', (e) => {
    const sidebar = document.querySelector('.sidebar');
    const burgerBtn = document.querySelector('.burger-btn');
    if (!sidebar || !burgerBtn) return;
    
    // Если это не боковая панель и не кнопка меню
    if (!sidebar.contains(e.target) && !burgerBtn.contains(e.target)) {
        closeSidebar();
    }
});

// Закрыть боковую панель при клике на архив
const archivedSection = document.querySelector('.archived-section');
if (archivedSection) {
    const archiveItems = archivedSection.querySelectorAll('[onclick]');
    archiveItems.forEach(item => {
        item.addEventListener('click', () => {
            closeSidebar();
        });
    });
}

/* ════════════════════════════════════════════════════════ */
/* ФУНКЦИИ ДЛЯ ИЗБРАННОГО */
/* ════════════════════════════════════════════════════════ */
/* КОНТЕКСТНОЕ МЕНЮ ДЛЯ СООБЩЕНИЙ */
/* ════════════════════════════════════════════════════════ */

function showMessageContextMenu(x, y, msgId) {
    currentContextMsgId = msgId;
    const menu = document.getElementById('context-menu');
    const msgMenu = document.getElementById('context-menu-msg');
    const chatMenu = document.getElementById('context-menu-chat');
    
    if (!menu || !msgMenu) return;
    
    // Показываем меню для сообщений, скрываем меню для чатов
    msgMenu.style.display = 'block';
    chatMenu.style.display = 'none';
    
    menu.classList.add('active');
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    
    // Убедимся, что меню не выходит за границы экрана
    setTimeout(() => {
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = (window.innerHeight - rect.height - 10) + 'px';
        }
    }, 0);
}

function contextAction(action) {
    if (!currentContextMsgId) return;
    
    const menu = document.getElementById('context-menu');
    if (menu) menu.classList.remove('active');
    
    const msg = messages.find(m => m.id === currentContextMsgId);
    if (!msg) return;
    
    switch(action) {
        case 'reply':
            const inputField = document.getElementById('msg-input');
            if (inputField) {
                inputField.focus();
                inputField.placeholder = `Ответ на: "${msg.text.substring(0, 30)}..."`;
            }
            alert('💬 Режим ответа включен');
            break;
            
        case 'forward':
            // Пересылаем сообщение как новое сообщение с информацией об оригинале
            const forwardedMsg = {
                id: 'fwd_' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
                from: me.name,
                to: activeContact,
                text: `<div style="border-left: 3px solid #2196F3; padding-left: 10px; margin: 5px 0;">
                            <small style="color: #888;">Переслано из чата с <strong>${msg.from}</strong></small><br>
                            ${msg.text}
                        </div>`,
                originalFrom: msg.from,
                originalTo: msg.to,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                type: 'forwarded'
            };
            messages.push(forwardedMsg);
            saveMessagesForUser(me.name);
            renderMessages();
            alert('✅ Сообщение переслано');
            break;
            
        case 'delete':
            const index = messages.findIndex(m => m.id === currentContextMsgId);
            if (index > -1) {
                messages.splice(index, 1);
                saveMessagesForUser(me.name);
                renderMessages();
                alert('🗑️ Сообщение удалено');
            }
            break;
        case 'pin':
            togglePinMessage(currentContextMsgId);
            break;
        case 'copy':
            try {
                const textOnly = (msg.text || '').replace(/<[^>]*>/g, '');
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(textOnly).then(() => alert('✅ Текст скопирован в буфер обмена'));
                } else {
                    prompt('Скопируйте текст сообщения:', textOnly);
                }
            } catch (e) { alert('Не удалось скопировать'); }
            break;
    }
    
    currentContextMsgId = null;
}

/* ====== Всплывающее меню для действий над чатом (при клике) ====== */
let currentPopupChat = null;
function getBlockedContacts() {
    try {
        const key = 'zapretka_blocked_' + me.name;
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : [];
    } catch (e) { return []; }
}
function saveBlockedContacts(arr) {
    try {
        const key = 'zapretka_blocked_' + me.name;
        localStorage.setItem(key, JSON.stringify(arr));
    } catch (e) {}
}
function isBlocked(name) {
    const arr = getBlockedContacts();
    return arr.includes(name);
}
function blockContact(name) {
    if (!name) return;
    const arr = getBlockedContacts();
    if (!arr.includes(name)) {
        arr.push(name);
        saveBlockedContacts(arr);
        // Удаляем из контактов
        removeUserContact(me.name, name);
        // Если это активный чат — отключаем
        if (activeContact === name) {
            activeContact = null;
            updateChatAreaVisibility(false);
        }
        renderContacts();
        renderMessages();
        alert(`🔒 Контакт "${name}" заблокирован`);
    } else {
        alert(`🔒 Контакт "${name}" уже в списке заблокированных`);
    }
}
function unblockContact(name) {
    if (!name) return;
    const arr = getBlockedContacts();
    const idx = arr.indexOf(name);
    if (idx > -1) {
        arr.splice(idx,1);
        saveBlockedContacts(arr);
        alert(`🔓 Контакт "${name}" разблокирован`);
        renderContacts();
    }
}

// ====== Закреплённые сообщения ======
function getPinnedMessages() {
    try {
        const key = 'zapretka_pinned_' + me.name;
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : [];
    } catch (e) { return []; }
}
function savePinnedMessages(arr) {
    try {
        const key = 'zapretka_pinned_' + me.name;
        localStorage.setItem(key, JSON.stringify(arr));
    } catch (e) {}
}
function isPinnedMessage(id) {
    if (!id) return false;
    const arr = getPinnedMessages();
    return arr.includes(id);
}
function togglePinMessage(id) {
    if (!id) return;
    const arr = getPinnedMessages();
    const idx = arr.indexOf(id);
    if (idx === -1) {
        arr.push(id);
        savePinnedMessages(arr);
        alert('📌 Сообщение закреплено');
    } else {
        arr.splice(idx,1);
        savePinnedMessages(arr);
        alert('📌 Закрепление снято');
    }
    renderMessages();
}

function showChatActionPopup(name, anchorElem, event) {
    if (!name) return;
    currentPopupChat = name;
    let popup = document.getElementById('chat-action-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'chat-action-popup';
        popup.className = 'chat-action-popup';
        popup.innerHTML = `
            <div class="chat-action-item" data-action="archive">🗄️ Архивировать</div>
            <div class="chat-action-item" data-action="block">🔒 Заблокировать</div>
            <div class="chat-action-item delete-item" data-action="delete">🗑️ Удалить чат</div>
            <div class="chat-action-item" data-action="clear-history">🧹 Очистить историю</div>
            <div class="chat-action-item" data-action="close">✕ Закрыть</div>
        `;
        document.body.appendChild(popup);
        popup.addEventListener('click', (e) => {
            const item = e.target.closest('[data-action]');
            if (!item) return;
            const action = item.getAttribute('data-action');
            const chat = popup.dataset.chatName || currentPopupChat;
            hideChatActionPopup();
            if (!chat) return;
            switch(action) {
                case 'archive':
                    archiveChat(chat);
                    renderContacts();
                    alert(`✅ Чат "${chat}" архивирован`);
                    break;
                case 'block':
                    if (confirm(`Заблокировать "${chat}"?`)) {
                        blockContact(chat);
                    }
                    break;
                case 'delete':
                    if (confirm(`Удалить чат с "${chat}"?\nЭто действие необратимо.`)) {
                        // Удалить все сообщения и удалить контакт
                        messages = messages.filter(m => !(
                            (m.from === chat && m.to === me.name) ||
                            (m.from === me.name && m.to === chat)
                        ));
                        saveMessagesForUser(me.name);
                        removeUserContact(me.name, chat);
                        renderContacts();
                        renderMessages();
                        alert(`✅ Чат с "${chat}" удалён`);
                    }
                    break;
                case 'clear-history':
                    if (confirm(`Очистить историю чата с "${chat}"?`)) {
                        messages = messages.filter(m => !(
                            (m.from === chat && m.to === me.name) ||
                            (m.from === me.name && m.to === chat)
                        ));
                        saveMessagesForUser(me.name);
                        renderMessages();
                        alert(`✅ История чата с "${chat}" очищена`);
                    }
                    break;
                case 'close':
                default:
                    break;
            }
        });
    }

    popup.dataset.chatName = name;
    popup.style.display = 'block';
    popup.classList.add('active');

    // Позиционируем рядом с anchorElem (справа от него по умолчанию)
    const rect = anchorElem.getBoundingClientRect();
    let left = rect.right + 8;
    let top = rect.top;
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';

    // Подстраиваем по границам экрана
    setTimeout(() => {
        const rectP = popup.getBoundingClientRect();
        if (rectP.right > window.innerWidth) {
            popup.style.left = (window.innerWidth - rectP.width - 10) + 'px';
        }
        if (rectP.bottom > window.innerHeight) {
            popup.style.top = (window.innerHeight - rectP.height - 10) + 'px';
        }
    }, 0);
}

function hideChatActionPopup() {
    const popup = document.getElementById('chat-action-popup');
    if (popup) {
        popup.style.display = 'none';
        popup.classList.remove('active');
        delete popup.dataset.chatName;
    }
    currentPopupChat = null;
}

// Скрывать popup при клике вне его или на Esc
document.addEventListener('click', (e) => {
    const popup = document.getElementById('chat-action-popup');
    if (!popup) return;
    if (e.target.closest('.chat-row') || e.target.closest('.chat-action-item')) {
        // клик по строке чата или по элементу меню — оставляем
        return;
    }
    hideChatActionPopup();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideChatActionPopup();
});
