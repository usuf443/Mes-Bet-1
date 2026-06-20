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
// id сообщения, на которое сейчас отвечает пользователь (null если не в режиме ответа)
let replyToMessageId = null;

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
            // Найдём новые входящие сообщения, которых ещё не было
            try {
                const oldIds = new Set((messages || []).map(m => m.id));
                const incomingNew = [];
                (data.messages || []).forEach(m => {
                    if (!oldIds.has(m.id)) {
                        // новое сообщение — уведомляем если оно адресовано нам
                        if (me && me.name && m.to === me.name && m.from && m.from !== me.name && activeContact !== m.from) {
                            incomingNew.push(m);
                        }
                    }
                });
                messages = data.messages;
                saveMessagesForUser(me.name);
                renderMessages();
                renderContacts();
                // Показать уведомления (по одному за раз)
                incomingNew.forEach(m => {
                    try { showMessageNotification(m); } catch (err) { /* ignore */ }
                });
            } catch (err) {
                messages = data.messages;
                saveMessagesForUser(me.name);
                renderMessages();
                renderContacts();
            }
        } else if (data.type === 'message_delete' && data.id) {
            try {
                const idx = messages.findIndex(m => m.id === data.id);
                if (idx > -1) {
                    messages.splice(idx, 1);
                    saveMessagesForUser(me.name);
                    renderMessages();
                    renderContacts();
                }
            } catch (err) { /* ignore */ }
        } else if (data.type === 'archive_update' && Array.isArray(data.archivedChats)) {
            // Применяем апдейт архива только если он для текущего пользователя
            try {
                if (!data.username) return;
                if (data.username !== (me && me.name)) return;
                archivedChats.length = 0;
                data.archivedChats.forEach(n => archivedChats.push(n));
                renderContacts();
                renderArchivedList();
            } catch (err) { /* безопасно игнорируем */ }
        } else if (data.type === 'user_update' && Array.isArray(data.users)) {
            // Обновляем содержимое массива users (data.js содержит исходный массив)
            try {
                users.length = 0;
                data.users.forEach(u => users.push({ name: u.name, avatar: u.avatar, online: !!u.online }));
                renderContacts();
            } catch (err) { /* безопасно игнорируем */ }
        } else if (data.type === 'user_update' && data.user) {
            // Получили обновление одного пользователя — применяем локально
            try {
                const u = data.user;
                const idx = (users || []).findIndex(x => x.name === u.name);
                if (idx > -1) {
                    users[idx] = Object.assign({}, users[idx], { avatar: u.avatar, nickname: u.nickname });
                } else {
                    users.push({ name: u.name, avatar: u.avatar, online: !!u.online });
                }
                renderContacts();
            } catch (err) { /* ignore */ }
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
        ws.addEventListener('open', () => {
            console.log('WS connected');
            // Если уже залогинен — сообщаем о присутствии
            if (me && me.name) {
                try { ws.send(JSON.stringify({ type: 'presence', username: me.name })); } catch (e) { /* ignore */ }
            }
        });
        ws.addEventListener('close', () => { console.log('WS closed, reconnect in 2s'); setTimeout(initWebSocket, 2000); });
        ws.addEventListener('message', (ev) => {
            try {
                const data = JSON.parse(ev.data);
                if (!data) return;
                if (data.type === 'msg' && data.msg) {
                    handleIncomingWsMessage(data.msg);
                } else if (data.type === 'msg_delete' && data.id) {
                    // Удаляем сообщение по id и оповещаем другие вкладки
                    const removed = removeMessageById(data.id);
                    if (removed && channel) {
                        try { channel.postMessage({ type: 'message_delete', id: data.id, from: data.from, to: data.to }); } catch (e) {}
                    }
                } else if (data.type === 'users' && Array.isArray(data.users)) {
                    try {
                        users.length = 0;
                        data.users.forEach(u => users.push({ name: u.name, avatar: u.avatar, online: !!u.online }));
                        renderContacts();
                    } catch (e) { /* ignore */ }
                } else if (data.type === 'call_request' && data.from) {
                    // Входящий запрос на звонок
                    currentCall = { type: data.kind === 'video' ? 'video' : 'audio', peer: data.from, incoming: true };
                    showCallModal();
                } else if (data.type === 'call_accept' && data.from) {
                    // Собеседник принял вызов — начнём WebRTC как звонящий
                    if (!currentCall || currentCall.peer !== data.from) {
                        currentCall = { type: 'audio', peer: data.from, incoming: false };
                    }
                    (async () => {
                        const kind = currentCall.type || 'audio';
                        const local = await startLocalMedia(kind);
                        createPeerConnection(data.from);
                        if (local && pc) {
                            local.getTracks().forEach(t => pc.addTrack(t, local));
                        }
                        try {
                            const offer = await pc.createOffer();
                            await pc.setLocalDescription(offer);
                            if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'webrtc_offer', to: data.from, from: me.name, offer: offer }));
                        } catch (err) { console.warn('offer failed', err); }
                    })();
                } else if (data.type === 'call_reject' && data.from) {
                    // Отклонение или завершение вызова
                    if (currentCall && currentCall.peer === data.from) {
                        hangupCall();
                        cleanupPeer();
                    }
                } else if (data.type === 'webrtc_offer' && data.offer && data.from) {
                    // Получили SDP offer — это callee
                    (async () => {
                        currentCall = { type: currentCall && currentCall.type ? currentCall.type : 'audio', peer: data.from, incoming: false };
                        const kind = currentCall.type || 'audio';
                        const local = await startLocalMedia(kind);
                        createPeerConnection(data.from);
                        try {
                            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                            if (local) local.getTracks().forEach(t => pc.addTrack(t, local));
                            const answer = await pc.createAnswer();
                            await pc.setLocalDescription(answer);
                            if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'webrtc_answer', to: data.from, from: me.name, answer: answer }));
                            onCallConnected();
                        } catch (err) { console.warn('handle offer failed', err); }
                    })();
                } else if (data.type === 'webrtc_answer' && data.answer && data.from) {
                    (async () => {
                        try {
                            if (pc) {
                                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                                onCallConnected();
                            }
                        } catch (err) { console.warn('set answer failed', err); }
                    })();
                } else if (data.type === 'webrtc_ice' && data.candidate && data.from) {
                    if (pc) {
                        pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(err => {
                            console.warn('addIce failed', err);
                        });
                    }
                }
            } catch (err) { console.warn('WS msg parse', err); }
        });
    } catch (err) {
        console.warn('WS init failed', err);
    }
}
try { initWebSocket(); } catch (e) { /* ignore */ }

// Отправить серверу информацию о нашем присутствии
function sendPresence() {
    if (ws && ws.readyState === WebSocket.OPEN && me && me.name) {
        try { ws.send(JSON.stringify({ type: 'presence', username: me.name })); } catch (e) { /* ignore */ }
    }
}

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

// Показываем верхнее плавающее уведомление о новом сообщении
function showMessageNotification(msg) {
    if (!msg || !msg.from) return;
    // Не показываем уведомление если уведомления отключены или мы в активном чате с этим пользователем
    if (activeContact === msg.from) return;

    // Создаём контейнер если его нет
    let container = document.getElementById('floating-notification');
    if (!container) {
        container = document.createElement('div');
        container.id = 'floating-notification';
        container.style.position = 'fixed';
        container.style.left = '50%';
        container.style.top = '12px';
        container.style.transform = 'translateX(-50%) translateY(-20px)';
        container.style.zIndex = 12000;
        container.style.pointerEvents = 'none';
        document.body.appendChild(container);
    }

        const el = document.createElement('div');
        el.className = 'floating-note';
        el.style.pointerEvents = 'auto';
        const avatarSrc = getAvatarUrl(msg.from,48);
        el.innerHTML = `
        <div class="note-left"><img src="${avatarSrc}" class="note-avatar" data-user-name="${escapeHtml(msg.from)}"/></div>
        <div class="note-body">
            <div class="note-title">${escapeHtml(msg.from)}</div>
            <div class="note-text">${escapeHtml(truncate(msg.text || '', 80))}</div>
        </div>
    `;
    // По клику — открываем чат
    el.onclick = () => {
        try { setActiveChat(msg.from); } catch (e) {}
        // удалим уведомление сразу
        try { el.style.transition = 'transform 0.25s ease, opacity 0.25s ease'; el.style.transform = 'translateX(-50%) translateY(-40px)'; el.style.opacity = '0'; setTimeout(() => el.remove(), 260); } catch (e) {}
    };

    container.appendChild(el);
    // attach fallback for avatar in notification
    const notifImg = el.querySelector('img.note-avatar');
    if (notifImg) attachAvatarFallback(notifImg, msg.from, 48);
    // Анимация появления
    requestAnimationFrame(() => {
        el.style.transition = 'transform 0.35s cubic-bezier(.2,.9,.2,1), opacity 0.35s ease';
        el.style.transform = 'translateX(-50%) translateY(0)';
        el.style.opacity = '1';
    });

    // Удаляем через 4 секунды с эффектом подъёма
    setTimeout(() => {
        try {
            el.style.transform = 'translateX(-50%) translateY(-24px)';
            el.style.opacity = '0';
            setTimeout(() => { try { el.remove(); } catch (e) {} }, 300);
        } catch (e) {}
    }, 4000);
}

function escapeHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function truncate(s, n) { return (s && s.length > n) ? s.substring(0,n-1) + '…' : (s || ''); }

function removeMessageById(id) {
    if (!id) return false;
    const idx = messages.findIndex(m => m.id === id);
    if (idx > -1) {
        messages.splice(idx, 1);
        try { saveMessagesForUser(me.name); } catch (e) {}
        try { renderMessages(); } catch (e) {}
        try { renderContacts(); } catch (e) {}
        return true;
    }
    return false;
}

// Архивированные чаты — список имён контактов (загружается в initApp для конкретного пользователя)
let archivedChats = [];
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
        // Если это data: или blob: или относительный путь к локальному файлу — возвращаем как есть
        const a = saved.avatar;
        if (a.startsWith('data:') || a.startsWith('blob:') || a.startsWith('/') || a.startsWith('./') || a.startsWith('../') || a.startsWith('assets/')) {
            return a;
        }
        try {
            const url = new URL(a);
            if (url.hostname && url.hostname.includes('pravatar.cc')) {
                return `https://i.pravatar.cc/${size}?u=${encodeURIComponent(name)}`;
            }
            // любой другой абсолютный URL — возвращаем как есть
            return a;
        } catch (e) {
            // Если не удалось распарсить — возвращаем исходное значение
            return a;
        }
    }
    // Если есть users (серверные/встроенные) и у пользователя есть avatar — используем
    const uFromList = (users || []).find(x => x.name === name && x.avatar);
    if (uFromList && uFromList.avatar) {
        const a = uFromList.avatar;
        if (a.startsWith('data:') || a.startsWith('blob:') || a.startsWith('/') || a.startsWith('./') || a.startsWith('assets/')) {
            return a;
        }
        try {
            const url = new URL(a);
            if (url.hostname && url.hostname.includes('pravatar.cc')) {
                return `https://i.pravatar.cc/${size}?u=${encodeURIComponent(name)}`;
            }
            return a;
        } catch (e) {
            return a;
        }
    }
    // 2. Мой профиль (me)
    if (me && me.name === name && me.avatar) {
        return me.avatar;
    }
    // 3. Боты
    const bots = getActiveBots();
    if (bots.includes(name)) {
        return name === 'Zapret Bot' ? 'icon.jpg' : `https://i.pravatar.cc/${size}?u=bot`;
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
    // Сообщаем серверу, что мы в сети
    try { sendPresence(); } catch (e) {}

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
    // Загрузим архив для текущего пользователя
    try {
        const key = 'zapretka_archived_' + (me && me.name ? me.name : 'global');
        archivedChats = JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) { archivedChats = []; }
    
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
    
    const emptyHint = document.getElementById('archived-empty');
    if (emptyHint) emptyHint.style.display = archivedChats.length === 0 ? 'block' : 'none';

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
                attachAvatarFallback(img, name, 32);
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

// Обновим бейдж с количеством в архиве
function updateArchiveBadge() {
    try {
        const badge = document.getElementById('archive-count');
        if (!badge) return;
        const cnt = archivedChats.length || 0;
        badge.innerText = cnt > 0 ? cnt : '';
    } catch (e) {}
}

// Вызовем обновление бейджа при рендере контактов
const originalRenderContacts = renderContacts;
renderContacts = function() {
    originalRenderContacts();
    updateArchiveBadge();
};

// Archive folder navigation state
let inArchiveFolder = false;

function enterArchiveFolder() {
    inArchiveFolder = true;
    // Покажем архив как главное содержимое чатов
    document.querySelector('.sidebar').classList.add('in-archive');
    // Показать стрелку в боковом меню рядом с эмодзи
    const sbBack = document.getElementById('archive-back-sidebar');
    if (sbBack) sbBack.style.display = 'inline-block';
    // Добавим заголовок в основную область чата с кнопкой назад
    const chatMain = document.querySelector('.chat-main');
    if (chatMain) {
        const existing = document.getElementById('archive-view-header');
        if (!existing) {
            const hdr = document.createElement('div');
            hdr.id = 'archive-view-header';
            hdr.className = 'archive-header';
            hdr.innerHTML = `<button class="archive-back-btn" onclick="exitArchiveFolder()">←</button><h3 style="margin:0;">Архив</h3>`;
            chatMain.insertBefore(hdr, chatMain.firstChild);
        }
    }
    // Скрыть список чатов и показать архивное содержимое
    document.querySelector('.chats-list').style.display = 'none';
    document.querySelector('.archived-section').style.display = 'block';
}

function exitArchiveFolder() {
    inArchiveFolder = false;
    document.querySelector('.sidebar').classList.remove('in-archive');
    const sbBack = document.getElementById('archive-back-sidebar');
    if (sbBack) sbBack.style.display = 'none';
    const hdr = document.getElementById('archive-view-header');
    if (hdr) hdr.remove();
    document.querySelector('.chats-list').style.display = '';
    const archivedSection = document.querySelector('.archived-section');
    if (archivedSection) archivedSection.style.display = 'none';
}

// При архивации перемещаем чат в папку Архив
function archiveChat(name) {
    const activeBots = getActiveBots();
    if (!name || isArchived(name) || activeBots.includes(name)) return; // Боты не архивируются
    archivedChats.unshift(name);
    saveArchived();
    // Если архивируем текущий активный чат, переключаемся на первого бота
    if (activeContact === name) {
        activeContact = activeBots[0] || 'Zapret Bot';
        document.getElementById('current-chat-title').innerText = activeContact;
        document.getElementById('current-chat-avatar').src = 'icon.jpg';
        renderMessages();
    }
    renderContacts();
    // Если мы в папке Архив — обновим список
    if (inArchiveFolder) renderArchivedList();
}

function isArchived(contactName) {
    return archivedChats.includes(contactName);
}

function saveArchived() {
    try {
        const key = 'zapretka_archived_' + (me && me.name ? me.name : 'global');
        localStorage.setItem(key, JSON.stringify(archivedChats));
    } catch (e) {}
    // Уведомляем другие вкладки о изменении архива для текущего пользователя
    if (channel) {
        try { channel.postMessage({ type: 'archive_update', username: me && me.name ? me.name : null, archivedChats }); } catch (e) {}
    }
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
    // Проверяем онлайн статус из сервера (если есть)
    const userEntry = (users || []).find(u => u.name === name);
    const isOnline = !!(userEntry && userEntry.online);
    
    div.innerHTML = `
        <div style="position: relative;">
            <img src="${finalAvatar}" class="chat-avatar-small" data-user-name="${escapeHtml(name)}">
            ${(!isBot && isOnline) ? '<div class="online-dot"></div>' : ''}
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
    
    // После вставки присоединяем механизм fallback для картинок
    list.appendChild(div);
    const imgEl = div.querySelector('img.chat-avatar-small');
    if (imgEl) attachAvatarFallback(imgEl, name, 48);
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
    
    const currentAvatarEl = document.getElementById('current-chat-avatar');
    if (currentAvatarEl) {
        currentAvatarEl.src = getAvatarUrl(name, 48);
        attachAvatarFallback(currentAvatarEl, name, 48);
    }
    if (isBot) {
        document.getElementById('current-chat-subtitle').innerText = '🤖 Бот | Статус: онлайн';
    } else {
        const userEntry = (users || []).find(u => u.name === name);
        const isOnline = !!(userEntry && userEntry.online);
        // Убираем символы кружков — показываем только текст статуса
        document.getElementById('current-chat-subtitle').innerText = isOnline ? 'Онлайн' : 'Офлайн';
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
        replyTo: replyToMessageId || null,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'text'
    };

    // Сначала локально добавляем и рендерим (быстрый отклик)
    messages.push(msg);
    saveMessagesForUser(me.name);  // Сохраняем для текущего пользователя
    input.value = '';
    // Очистим режим ответа при отправке
    replyToMessageId = null;
    try { clearReplyPreview(); } catch (e) {}
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
                avatarHtml = `<div class="msg-meta"><img src="${avatarUrl}" class="msg-avatar" data-user-name="${escapeHtml(m.from)}"> <span class="msg-sender">${m.from}</span></div>`;
            }

            // Проверяем тип сообщения
            let bodyContent = m.text;
            // Голосовые уже содержат свой стиль, не нужно оборачивать

            const pinHtml = isPinnedMessage(m.id) ? '<span class="msg-pin" title="Закреплено">📌</span>' : '';
            const replyHtml = (m.replyTo) ? (function(){
                const ref = messages.find(x => x.id === m.replyTo);
                if (!ref) return '';
                const refText = (ref.text || '').replace(/<[^>]*>/g, '');
                const refSender = (ref.from === me.name) ? 'Вы' : escapeHtml(ref.from);
                return `<div class="msg-quote"><div class="msg-quote-sender">${refSender}</div><div class="msg-quote-text">${escapeHtml(truncate(refText, 100))}</div></div>`;
            })() : '';
            msgDiv.innerHTML = `${avatarHtml}<div class="msg-body">${replyHtml}${bodyContent}${pinHtml}<span class="msg-time">${m.time}</span></div>`;
            
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
        // Incremental update: учитываем добавления и удаления
        if (chatMessages.length > prevCount) {
            const newMsgs = chatMessages.slice(prevCount);
            newMsgs.forEach(m => {
                const msgDiv = document.createElement('div');
                msgDiv.className = `msg ${m.from === me.name ? 'msg-me' : 'msg-them'}`;
                msgDiv.setAttribute('data-msg-id', m.id);

                let avatarHtml = '';
                if (m.from !== me.name) {
                    const avatarUrl = getAvatarUrl(m.from, 32);
                        avatarHtml = `<div class="msg-meta"><img src="${avatarUrl}" class="msg-avatar" data-user-name="${escapeHtml(m.from)}"> <span class="msg-sender">${m.from}</span></div>`;
                }

                // Проверяем тип сообщения
                let bodyContent = m.text;
                // Голосовые уже содержат свой стиль, не нужно оборачивать

                const pinHtml = isPinnedMessage(m.id) ? '<span class="msg-pin" title="Закреплено">📌</span>' : '';
                const replyHtml = (m.replyTo) ? (function(){
                    const ref = messages.find(x => x.id === m.replyTo);
                    if (!ref) return '';
                    const refText = (ref.text || '').replace(/<[^>]*>/g, '');
                    const refSender = (ref.from === me.name) ? 'Вы' : escapeHtml(ref.from);
                    return `<div class="msg-quote"><div class="msg-quote-sender">${refSender}</div><div class="msg-quote-text">${escapeHtml(truncate(refText, 100))}</div></div>`;
                })() : '';
                msgDiv.innerHTML = `${avatarHtml}<div class="msg-body">${replyHtml}${bodyContent}${pinHtml}<span class="msg-time">${m.time}</span></div>`;

                msgDiv.oncontextmenu = (e) => {
                    e.preventDefault();
                    showMessageContextMenu(e.clientX, e.clientY, m.id);
                };

                box.appendChild(msgDiv);
            });
            // ВСЕГДА скроллим вниз при новых сообщениях (автоматический скролл)
            setTimeout(() => { box.scrollTop = box.scrollHeight; }, 10);
        } else if (chatMessages.length < prevCount) {
            // Сообщение удалено или изменено — перерисуем список целиком
            box.innerHTML = '';
            chatMessages.forEach(m => {
                const msgDiv = document.createElement('div');
                msgDiv.className = `msg ${m.from === me.name ? 'msg-me' : 'msg-them'}`;
                msgDiv.setAttribute('data-msg-id', m.id);

                let avatarHtml = '';
                if (m.from !== me.name) {
                    const avatarUrl = getAvatarUrl(m.from, 32);
                        avatarHtml = `<div class="msg-meta"><img src="${avatarUrl}" class="msg-avatar" data-user-name="${escapeHtml(m.from)}"> <span class="msg-sender">${m.from}</span></div>`;
                }

                let bodyContent = m.text;
                const pinHtml = isPinnedMessage(m.id) ? '<span class="msg-pin" title="Закреплено">📌</span>' : '';
                const replyHtml = (m.replyTo) ? (function(){
                    const ref = messages.find(x => x.id === m.replyTo);
                    if (!ref) return '';
                    const refText = (ref.text || '').replace(/<[^>]*>/g, '');
                    const refSender = (ref.from === me.name) ? 'Вы' : escapeHtml(ref.from);
                    return `<div class="msg-quote"><div class="msg-quote-sender">${refSender}</div><div class="msg-quote-text">${escapeHtml(truncate(refText, 100))}</div></div>`;
                })() : '';
                msgDiv.innerHTML = `${avatarHtml}<div class="msg-body">${replyHtml}${bodyContent}${pinHtml}<span class="msg-time">${m.time}</span></div>`;

                msgDiv.oncontextmenu = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showMessageContextMenu(e.clientX, e.clientY, m.id);
                };

                box.appendChild(msgDiv);
            });
            setTimeout(() => { box.scrollTop = box.scrollHeight; }, 10);
        }
    }

    lastRenderedCount[activeContact] = chatMessages.length;
    lastActiveChat = activeContact;

    // Обновляем состояние кнопки "вниз"
    updateScrollButton();
    // После рендера сообщений — прикрепим fallback ко всем аватарам внутри чата
    setTimeout(() => {
        try {
            const imgs = document.querySelectorAll('#chat-box img.msg-avatar');
            imgs.forEach(img => {
                const nm = img.dataset.userName || activeContact || 'anon';
                attachAvatarFallback(img, nm, 32);
            });
        } catch (e) {}
    }, 10);
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
            try { localStorage.setItem('zapretka_user_' + me.name, JSON.stringify(me)); } catch (e) {}
            // Отправим только обновлённого пользователя через BroadcastChannel и WebSocket
            const single = { name: me.name, avatar: me.avatar, nickname: me.nickname };
            if (channel) channel.postMessage({ type: 'user_update', user: single });
            if (ws && ws.readyState === WebSocket.OPEN) {
                try { ws.send(JSON.stringify({ type: 'user_update', user: single })); } catch (e) {}
            }
            renderContacts();
            renderMessages();
        };
        reader.readAsDataURL(file);
    }
}

// ПРЕДУСТАНОВЛЕННЫЕ АВАТАРЫ (встроенные SVG, чтобы не зависеть от внешних файлов)
const presetAvatars = [
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23ff6b6b"/><text x="50" y="60" font-size="38" fill="%23ffffff" text-anchor="middle" font-family="Arial,Helvetica,sans-serif">1</text></svg>',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%230089ff"/><text x="50" y="60" font-size="38" fill="%23ffffff" text-anchor="middle" font-family="Arial,Helvetica,sans-serif">2</text></svg>',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%2300c48c"/><text x="50" y="60" font-size="38" fill="%23ffffff" text-anchor="middle" font-family="Arial,Helvetica,sans-serif">3</text></svg>',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23ff9f1c"/><text x="50" y="60" font-size="38" fill="%23ffffff" text-anchor="middle" font-family="Arial,Helvetica,sans-serif">4</text></svg>',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%239b5de5"/><text x="50" y="60" font-size="38" fill="%23ffffff" text-anchor="middle" font-family="Arial,Helvetica,sans-serif">5</text></svg>',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23f15bb5"/><text x="50" y="60" font-size="38" fill="%23ffffff" text-anchor="middle" font-family="Arial,Helvetica,sans-serif">6</text></svg>',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23135c4d"/><text x="50" y="60" font-size="38" fill="%23ffffff" text-anchor="middle" font-family="Arial,Helvetica,sans-serif">7</text></svg>',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%233d348b"/><text x="50" y="60" font-size="38" fill="%23ffffff" text-anchor="middle" font-family="Arial,Helvetica,sans-serif">8</text></svg>'
];

// Универсальная функция для установки fallback аватара при ошибке загрузки
function attachAvatarFallback(imgEl, name, size) {
    if (!imgEl) return;
    imgEl.onerror = function() {
        this.onerror = null;
        this.src = 'icon.jpg';
    };
}

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
                attachAvatarFallback(img, 'avatar' + (idx + 1), 100);
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
    try { localStorage.setItem('zapretka_user_' + me.name, JSON.stringify(me)); } catch (e) {}
    const single = { name: me.name, avatar: me.avatar, nickname: me.nickname };
    if (channel) channel.postMessage({ type: 'user_update', user: single });
    if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'user_update', user: single })); } catch (e) { /* ignore */ }
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
    try { localStorage.setItem('zapretka_user_' + me.name, JSON.stringify(me)); } catch (e) {}
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
    // intro video removed
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

// Intro video logic
// intro video removed

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
        document.getElementById('current-chat-avatar').src = 'icon.jpg';
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

function unarchiveAll() {
    if (!confirm('Разархивировать все чаты?')) return;
    archivedChats.slice().forEach(n => unarchiveChat(n));
    renderContacts();
    if (inArchiveFolder) renderArchivedList();
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

// Реализация модального звонка с таймером и контролами
let currentCall = null;
let callTimerInterval = null;
let callStartTimestamp = 0;
let callConnectTimeout = null;
let isMuted = false;
let isCameraOn = true;
// WebRTC state
let pc = null; // RTCPeerConnection
let localStream = null;
let remoteStream = null;
let isCallConnected = false;

function startCall() {
    if (!activeContact) return alert('Выберите чат для звонка');
    currentCall = { type: 'audio', peer: activeContact, incoming: false };
    showCallModal();
    // Отправляем запрос на звонок через signaling (ws)
    try { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'call_request', to: currentCall.peer, from: me.name, kind: 'audio' })); } catch (e) {}
}

function startVideoCall() {
    if (!activeContact) return alert('Выберите чат для звонка');
    currentCall = { type: 'video', peer: activeContact, incoming: false };
    showCallModal();
    try { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'call_request', to: currentCall.peer, from: me.name, kind: 'video' })); } catch (e) {}
}

function showCallModal() {
    const modal = document.getElementById('call-modal');
    if (!modal) return;

    const peer = (currentCall && currentCall.peer) || activeContact || 'Контакт';
    const type = (currentCall && currentCall.type) === 'video' ? 'Видеозвонок' : 'Исходящий звонок';

    const avatar = document.getElementById('call-avatar');
    const peerEl = document.getElementById('call-peer');
    const typeEl = document.getElementById('call-type');
    const statusEl = document.getElementById('call-status');
    const timerEl = document.getElementById('call-timer');
    const incomingActions = document.getElementById('incoming-actions');
    const outgoingActions = document.getElementById('outgoing-actions');
    const connectedControls = document.getElementById('connected-controls');

    if (avatar) avatar.src = getAvatarUrl(peer, 160);
    if (peerEl) peerEl.innerText = peer;
    if (typeEl) typeEl.innerText = type;
    if (statusEl) statusEl.innerText = 'Звоню...';
    if (timerEl) { timerEl.style.display = 'none'; timerEl.innerText = '00:00'; }

    // Отображение кнопок: если входящий — показать принять/отклонить
    if (currentCall && currentCall.incoming) {
        if (incomingActions) incomingActions.style.display = 'flex';
        if (outgoingActions) outgoingActions.style.display = 'none';
    } else {
        if (incomingActions) incomingActions.style.display = 'none';
        if (outgoingActions) outgoingActions.style.display = 'flex';
    }
    if (connectedControls) connectedControls.style.display = 'none';

    modal.style.display = 'flex';
    modal.classList.remove('connected');
    modal.onclick = (e) => { if (e.target === modal) hangupCall(); };

    // Имитация установления соединения для исходящих вызовов
    if (!currentCall || !currentCall.incoming) {
        if (callConnectTimeout) clearTimeout(callConnectTimeout);
        callConnectTimeout = setTimeout(() => { onCallConnected(); }, 1400);
    }
}

function onCallConnected() {
    const status = document.getElementById('call-status');
    const modal = document.getElementById('call-modal');
    const timerEl = document.getElementById('call-timer');
    const incomingActions = document.getElementById('incoming-actions');
    const outgoingActions = document.getElementById('outgoing-actions');
    const connectedControls = document.getElementById('connected-controls');

    if (callConnectTimeout) { clearTimeout(callConnectTimeout); callConnectTimeout = null; }
    if (status) status.innerText = 'Соединено';
    if (modal) modal.classList.add('connected');
    if (timerEl) { timerEl.style.display = 'block'; }
    if (incomingActions) incomingActions.style.display = 'none';
    if (outgoingActions) outgoingActions.style.display = 'none';
    if (connectedControls) connectedControls.style.display = 'flex';
    startCallTimer();
}

function acceptCall() {
    // Принять входящий вызов
    if (currentCall) currentCall.incoming = false;
    // Сообщим серверу что мы приняли
    try { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'call_accept', to: currentCall.peer, from: me.name })); } catch (e) {}
    const acceptBtn = document.getElementById('accept-btn');
    if (acceptBtn) acceptBtn.disabled = true;
}

function hangupCall() {
    const modal = document.getElementById('call-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('connected');
        modal.onclick = null;
    }
    const peerToNotify = (currentCall && currentCall.peer) || activeContact;
    currentCall = null;
    if (callConnectTimeout) { clearTimeout(callConnectTimeout); callConnectTimeout = null; }
    stopCallTimer();
    // Сообщим собеседнику что вызов завершён/отклонён
    try { if (ws && ws.readyState === WebSocket.OPEN && peerToNotify) ws.send(JSON.stringify({ type: 'call_reject', to: peerToNotify, from: me.name })); } catch (e) {}
    // Закроем peer connection и остановим медиапотоки
    try { cleanupPeer(); } catch (e) {}
    // восстановим кнопки
    const acceptBtn = document.getElementById('accept-btn');
    if (acceptBtn) acceptBtn.disabled = false;
    // сброс состояний
    isMuted = false; isCameraOn = true;
    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) muteBtn.classList.remove('active');
    const camBtn = document.getElementById('video-toggle-btn');
    if (camBtn) camBtn.classList.remove('active');
}

// Create or reuse RTCPeerConnection and attach handlers
function createPeerConnection(peerName) {
    if (pc) return pc;
    const cfg = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    pc = new RTCPeerConnection(cfg);
    remoteStream = new MediaStream();
    pc.onicecandidate = (e) => {
        if (e.candidate && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'webrtc_ice', to: peerName, from: me.name, candidate: e.candidate }));
        }
    };
    pc.ontrack = (e) => {
        try {
            e.streams && e.streams[0] && (remoteStream = e.streams[0]);
            // Attach audio/video element dynamically
            attachRemoteStream(remoteStream);
        } catch (err) { console.warn('ontrack', err); }
    };
    return pc;
}

function attachRemoteStream(stream) {
    // Для аудио создаём элемент <audio>, для видео можно расширить
    let audio = document.getElementById('call-remote-audio');
    if (!audio) {
        audio = document.createElement('audio');
        audio.id = 'call-remote-audio';
        audio.autoplay = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
    }
    try { audio.srcObject = stream; } catch (e) { audio.src = URL.createObjectURL(stream); }
}

async function startLocalMedia(kind) {
    if (localStream) return localStream;
    const constraints = (kind === 'video') ? { audio: true, video: true } : { audio: true };
    try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        return localStream;
    } catch (err) { console.warn('getUserMedia failed', err); return null; }
}

async function cleanupPeer() {
    try { if (pc) { pc.close(); pc = null; } } catch (e) {}
    try { if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; } } catch (e) {}
    try { if (remoteStream) { remoteStream.getTracks().forEach(t=>t.stop()); remoteStream = null; } } catch (e) {}
    const audio = document.getElementById('call-remote-audio'); if (audio) { audio.remove(); }
}

function startCallTimer() {
    stopCallTimer();
    callStartTimestamp = Date.now();
    const timerEl = document.getElementById('call-timer');
    if (!timerEl) return;
    timerEl.innerText = '00:00';
    callTimerInterval = setInterval(() => {
        const diff = Date.now() - callStartTimestamp;
        timerEl.innerText = formatDuration(Math.floor(diff / 1000));
    }, 1000);
}

function stopCallTimer() {
    if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; }
    const timerEl = document.getElementById('call-timer');
    if (timerEl) timerEl.innerText = '00:00';
}

function formatDuration(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function toggleMute() {
    isMuted = !isMuted;
    const btn = document.getElementById('mute-btn');
    if (btn) {
        btn.classList.toggle('active', isMuted);
        btn.innerText = isMuted ? '🎙️' : '🔇';
    }
}

function toggleCamera() {
    isCameraOn = !isCameraOn;
    const btn = document.getElementById('video-toggle-btn');
    if (btn) {
        btn.classList.toggle('active', !isCameraOn);
        btn.innerText = isCameraOn ? '🎥' : '📷';
    }
}

function addParticipant() {
    alert('Функция добавления участника пока не реализована.');
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
            { name: 'Zapret Bot', avatar: 'icon.jpg', type: 'bot' },
            ...(users || [])
        ];
        
        const matchedContacts = allContacts.filter(c => 
            c.name.toLowerCase().includes(query) && c.name !== (me && me.name)
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
        
        // 2. Поиск по глобальным пользователям (пытаемся несколько источников)
        let serverUsers = [];
        try {
            const resp = await fetch('/api/users');
            if (resp.ok) {
                const j = await resp.json();
                if (j && j.success && Array.isArray(j.users)) serverUsers = j.users;
            }
        } catch (err) { console.warn('users fetch failed', err); }

        // Если API недоступен, сначала проверим встроенный кэш в index.html (window.__embedded_users),
        // затем попробуем загрузить users.json через fetch.
        if (!serverUsers.length) {
            if (typeof window !== 'undefined' && window.__embedded_users) {
                try {
                    const j2 = window.__embedded_users;
                    if (j2 && !Array.isArray(j2) && typeof j2 === 'object') {
                        serverUsers = Object.keys(j2).map(u => ({ name: u, avatar: j2[u] && j2[u].avatar ? j2[u].avatar : `https://i.pravatar.cc/48?u=${encodeURIComponent(u)}` }));
                    } else if (Array.isArray(j2)) {
                        serverUsers = j2;
                    }
                } catch (err) { /* ignore malformed embedded */ }
            } else {
                try {
                    const resp2 = await fetch('users.json');
                    if (resp2.ok) {
                        const j2 = await resp2.json();
                        // users.json в репозитории может быть объектом { username: { ... } }
                        if (j2 && !Array.isArray(j2) && typeof j2 === 'object') {
                            serverUsers = Object.keys(j2).map(u => ({ name: u, avatar: j2[u] && j2[u].avatar ? j2[u].avatar : `https://i.pravatar.cc/48?u=${encodeURIComponent(u)}` }));
                        } else if (Array.isArray(j2)) {
                            serverUsers = j2;
                        }
                    }
                } catch (err) { /* ignore */ }
            }
        }

        // Собираем окончательный список пользователей — объединяем серверный список и локальные зарегистрированные
        const localUsers = getAllRegisteredUsers();
        const usersMap = new Map();
        (serverUsers || []).forEach(u => { if (u && u.name) usersMap.set(u.name, { name: u.name, avatar: u.avatar }); });
        (localUsers || []).forEach(u => { if (u && u.name && !usersMap.has(u.name)) usersMap.set(u.name, u); });
        const allUsers = Array.from(usersMap.values());

        const existingNames = allContacts.map(c => c.name);
        const newUsers = allUsers.filter(u =>
            (u.name || '').toLowerCase().includes(query) &&
            u.name !== (me && me.name) &&
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
                    // Если пользователь не залогинен — предложим войти
                    if (!me || !me.name) {
                        alert('Войдите в аккаунт, чтобы добавить контакт');
                        try { document.getElementById('login-username').value = u.name; } catch (e) {}
                        try { switchToLogin(); } catch (e) {}
                        return;
                    }
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

// Также регистрируем поиск на уровне страницы, чтобы работал до логина
document.addEventListener('DOMContentLoaded', () => {
    try { setupSearch(); } catch (e) { /* ignore if not available yet */ }
});

// Перед закрытием вкладки уведомляем сервер, что уходим (позволяет быстрее снять online)
window.addEventListener('beforeunload', () => {
    if (ws && ws.readyState === WebSocket.OPEN && me && me.name) {
        try { ws.send(JSON.stringify({ type: 'presence_off', username: me.name })); } catch (e) { /* ignore */ }
    }
});

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

// Показывает превью ответа в области ввода (не копирует текст в поле ввода)
function showReplyPreviewFor(msg) {
    try {
        clearReplyPreview();
        const inputArea = document.querySelector('.message-input-area');
        if (!inputArea || !msg) return;
        const sender = (msg.from === me.name) ? 'Вы' : escapeHtml(msg.from);
        const textOnly = (msg.text || '').replace(/<[^>]*>/g, '');
        const preview = document.createElement('div');
        preview.id = 'reply-preview';
        preview.className = 'reply-preview';
        preview.innerHTML = `<div class="reply-left"></div><div class="reply-body"><div class="reply-sender">${sender}</div><div class="reply-text">${escapeHtml(truncate(textOnly, 120))}</div></div><button class="reply-cancel" title="Отменить">✕</button>`;
        inputArea.insertBefore(preview, inputArea.firstChild);
        const btn = preview.querySelector('.reply-cancel');
        if (btn) btn.onclick = (e) => { e.stopPropagation(); replyToMessageId = null; clearReplyPreview(); };
    } catch (e) { /* ignore */ }
}

function clearReplyPreview() {
    const existing = document.getElementById('reply-preview');
    if (existing) existing.remove();
}

function startReplyToMessage(msg) {
    if (!msg) return;
    replyToMessageId = msg.id;
    showReplyPreviewFor(msg);
    const inputField = document.getElementById('msg-input');
    if (inputField) inputField.focus();
}

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
            // Включаем режим ответа — показываем превью над полем ввода
            startReplyToMessage(msg);
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
                const deletedMsg = messages[index];
                const delId = deletedMsg.id;
                const delFrom = deletedMsg.from;
                const delTo = deletedMsg.to;
                messages.splice(index, 1);
                saveMessagesForUser(me.name);
                renderMessages();
                // Оповещаем другие вкладки в этом браузере
                if (channel) {
                    try { channel.postMessage({ type: 'message_delete', id: delId, from: delFrom, to: delTo }); } catch (e) {}
                }
                // Отправляем на сервер, чтобы другие браузеры узнали
                if (ws && ws.readyState === WebSocket.OPEN) {
                    try { ws.send(JSON.stringify({ type: 'msg_delete', id: delId, from: delFrom, to: delTo })); } catch (e) {}
                }
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
