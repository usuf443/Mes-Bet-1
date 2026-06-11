// Глобальные переменные
let me = {
    name: "",
    avatar: "",
    nickname: "",
    birthplace: "",
    birthyear: "",
    bio: ""
};
let activeContact = "Zapret Bot";
// `users` объявлен в `data.js` (массив пользователей). Не переобъявляем его здесь — это вызывало ошибку в браузере.
// Используем messages из localStorage как источник правды для истории.
let messages = JSON.parse(localStorage.getItem('zapretka_messages')) || [];

// BroadcastChannel для синхронизации между вкладками (реaltime обновления)
const channel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('zapretka_channel') : null;
if (channel) {
    channel.onmessage = (e) => {
        const data = e.data || {};
        if (data.type === 'messages_update' && Array.isArray(data.messages)) {
            messages = data.messages;
            localStorage.setItem('zapretka_messages', JSON.stringify(messages));
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
        }
    };
}

// WebSocket клиент (для синхронизации между разными браузерами/устройствами)
const WS_URL = 'ws://localhost:3000';
let ws = null;
function initWebSocket() {
    try {
        ws = new WebSocket(WS_URL);
        ws.addEventListener('open', () => console.log('WS connected'));
        ws.addEventListener('close', () => { console.log('WS closed, reconnect in 2s'); setTimeout(initWebSocket, 2000); });
        ws.addEventListener('message', (ev) => {
            try {
                const data = JSON.parse(ev.data);
                if (data && data.type === 'msg' && data.msg) {
                    handleIncomingWsMessage(data.msg);
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
    localStorage.setItem('zapretka_messages', JSON.stringify(messages));
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

// Инициализация после входа
function initApp() {
    // Установить аватар
    document.getElementById('my-avatar').src = me.avatar || 'https://i.pravatar.cc/40?u=me';
    document.getElementById('my-name').innerText = me.name;

    // Рендер контактов
    renderContacts();

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

    // Загрузить сообщения
    // Если сообщений нет — создаём пример для группового чата WW 322 Group
    if (!messages || messages.length === 0) {
        messages = [
            { from: 'ДК', to: 'WW 322 Group', text: 'Пока никак', time: '11:37', type: 'text' },
            { from: 'ДК', to: 'WW 322 Group', text: 'Потом будем делать', time: '11:37', type: 'text' },
            { from: 'Дениска шарага Казах', to: 'WW 322 Group', text: 'Когда останется 1 неделя до сдачи', time: '11:37', type: 'text' },
            { from: me.name, to: 'WW 322 Group', text: 'ну осталось + где то 3 месяца', time: '11:38', type: 'text' }
        ];
        localStorage.setItem('zapretka_messages', JSON.stringify(messages));
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
}

function renderContacts() {
    const list = document.getElementById('contacts-list');
    list.innerHTML = '';

    // Добавляем бота
    addContactToSidebar('Zapret Bot', '🤖', 'https://i.pravatar.cc/48?u=bot');

    if (typeof chats !== 'undefined' && Array.isArray(chats)) {
        // Пиннутое вверху
        chats.filter(c => c.pinned).forEach(c => {
            if (!isArchived(c.name)) addContactToSidebar(c.name, '', (c.avatar || `https://i.pravatar.cc/48?u=${c.id}`), c.preview || '');
        });

        // Папка Избранное
        chats.filter(c => c.type === 'folder').forEach(c => {
            if (!isArchived(c.name)) addContactToSidebar(c.name, '', (c.avatar || `https://i.pravatar.cc/48?u=${c.id}`), c.preview || '');
        });

        // Остальные чаты (которые не в архиве и не системные)
        chats.filter(c => !c.pinned && c.type !== 'system' && c.type !== 'folder').forEach(c => {
            if (!isArchived(c.name)) addContactToSidebar(c.name, '', (c.avatar || `https://i.pravatar.cc/48?u=${c.id}`), c.preview || '');
        });
    } else {
        // Фоллбек — используем users
        users.forEach(u => {
            if (u.name !== me.name && !isArchived(u.name)) {
                addContactToSidebar(u.name, '', u.avatar);
            }
        });
    }

    // Обновить список архивных чатов
    renderArchivedList();
}

function addContactToSidebar(name, emoji, avatarUrl, previewText) {
    const list = document.getElementById('contacts-list');
    const div = document.createElement('div');
    div.className = `chat-row ${activeContact === name ? 'active' : ''}`;
    div.setAttribute('onclick', `setActiveChat('${name}', this)`);
    const lastMsg = getLastMessage(name);
    const fallbackPreview = lastMsg ? (lastMsg.text.length > 20 ? lastMsg.text.substring(0, 20) + '...' : lastMsg.text) : 'Нажмите, чтобы начать чат';
    const preview = previewText || fallbackPreview;

    div.innerHTML = `
        <img src="${avatarUrl}" class="chat-avatar-small" onerror="this.src='https://i.pravatar.cc/48?u=${name}'">
        <div class="chat-info">
            <div class="chat-name">${emoji ? emoji + ' ' : ''}${name}</div>
            <div class="chat-preview">${preview}</div>
        </div>
    `;
    list.appendChild(div);
}

function setActiveChat(name, element) {
    activeContact = name;
    document.getElementById('current-chat-title').innerText = name;

    // Найти аватар контакта
    const contactObj = (chats || []).find(c => c.name === name);
    if (contactObj) {
        document.getElementById('current-chat-avatar').src = contactObj.avatar || `https://i.pravatar.cc/48?u=${contactObj.id}`;
        if (contactObj.type === 'group') {
            document.getElementById('current-chat-subtitle').innerText = `${contactObj.participants || 0} участников, ${contactObj.online || 0} в сети`;
        } else if (contactObj.type === 'channel') {
            document.getElementById('current-chat-subtitle').innerText = contactObj.preview || '';
        } else {
            document.getElementById('current-chat-subtitle').innerText = '';
        }
    } else if (name === 'Zapret Bot') {
        document.getElementById('current-chat-avatar').src = 'https://i.pravatar.cc/48?u=bot';
        document.getElementById('current-chat-subtitle').innerText = '';
    } else {
        document.getElementById('current-chat-avatar').src = `https://i.pravatar.cc/48?u=${name}`;
        document.getElementById('current-chat-subtitle').innerText = '';
    }

    document.querySelectorAll('.chat-row').forEach(r => r.classList.remove('active'));
    element.classList.add('active');
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
    localStorage.setItem('zapretka_messages', JSON.stringify(messages));
    input.value = '';
    renderMessages();

    // Отправляем на WebSocket сервер, если он доступен — иначе используем BroadcastChannel
    if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'msg', msg })); } catch (e) { console.warn('ws send failed', e); }
    } else {
        if (channel) channel.postMessage({ type: 'messages_update', messages });
    }

    // Логика бота (локальная)
    if (activeContact === 'Zapret Bot') {
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
            localStorage.setItem('zapretka_messages', JSON.stringify(messages));
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

            let avatarHtml = '';
            if (m.from !== me.name) {
                const u = (users || []).find(x => x.name === m.from) || null;
                const avatarUrl = u ? u.avatar : `https://i.pravatar.cc/32?u=${encodeURIComponent(m.from)}`;
                avatarHtml = `<div class="msg-meta"><img src="${avatarUrl}" class="msg-avatar"> <span class="msg-sender">${m.from}</span></div>`;
            }

            msgDiv.innerHTML = `${avatarHtml}<div class="msg-body">${m.text}<span class="msg-time">${m.time}</span></div>`;
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

                let avatarHtml = '';
                if (m.from !== me.name) {
                    const u = (users || []).find(x => x.name === m.from) || null;
                    const avatarUrl = u ? u.avatar : `https://i.pravatar.cc/32?u=${encodeURIComponent(m.from)}`;
                    avatarHtml = `<div class="msg-meta"><img src="${avatarUrl}" class="msg-avatar"> <span class="msg-sender">${m.from}</span></div>`;
                }

                msgDiv.innerHTML = `${avatarHtml}<div class="msg-body">${m.text}<span class="msg-time">${m.time}</span></div>`;
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
    const remote = JSON.parse(localStorage.getItem('zapretka_messages')) || [];
    if (remote.length !== messages.length) {
        messages = remote;
        renderMessages();
        renderContacts(); // Обновить превью в списке чатов
    }
}

function handleBotResponse(userMessage) {
    setTimeout(() => {
        let response = "Я тебя не понял. Напиши что-то другое!";
        const msg = userMessage.toLowerCase();

        if (msg.includes('привет')) {
            response = "Привет! Как дела?";
        } else if (msg.includes('как дела')) {
            response = "У меня всё отлично, я же бот! А у тебя?";
        } else if (msg.includes('пока')) {
            response = "Пока! Заходи ещё!";
        } else if (msg.includes('спасибо')) {
            response = "Пожалуйста! 😊";
        } else if (msg.includes('кто ты')) {
            response = "Я Zapret Bot, твой виртуальный друг!";
        } else if (msg.includes('погода')) {
            response = "За окном +23, солнечно!";
        } else if (msg.includes('имя')) {
            response = "Меня зовут Zapret Bot, а тебя?";
        } else if (msg.includes('люблю')) {
            response = "Я тебя тоже! ❤️";
        }

        const botMsg = {
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            from: 'Zapret Bot',
            to: me.name,
            text: response,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'text'
        };

        messages.push(botMsg);
        localStorage.setItem('zapretka_messages', JSON.stringify(messages));
        renderMessages();
        if (ws && ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ type: 'msg', msg: botMsg })); } catch (e) { /* ignore */ }
        } else if (channel) {
            channel.postMessage({ type: 'messages_update', messages });
        }
    }, 1000);
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
            localStorage.setItem('zapretka_user_' + me.name, JSON.stringify(me));
        };
        reader.readAsDataURL(file);
    }
}

function saveProfile() {
    me.name = document.getElementById('profile-name-input').value || me.name;
    me.nickname = document.getElementById('profile-nickname').value;
    me.birthplace = document.getElementById('profile-birthplace').value;
    me.birthyear = document.getElementById('profile-birthyear').value;
    me.bio = document.getElementById('profile-bio').value;

    // Сохранить в localStorage
    localStorage.setItem('zapretka_user_' + me.name, JSON.stringify(me));

    // Обновить интерфейс
    document.getElementById('my-name').innerText = me.name;
    closeModal('profile-modal');

    // Обновить список контактов (для других пользователей)
    updateUserInData(me);

    // Рассылаем обновление пользователей в другие вкладки
    if (channel) channel.postMessage({ type: 'user_update', users });
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

function initCursorLight() {
    const light = document.createElement('div');
    light.className = 'cursor-light';
    document.body.appendChild(light);

    document.addEventListener('mousemove', (e) => {
        light.style.left = e.clientX + 'px';
        light.style.top = e.clientY + 'px';
    });
}

/* ---------- Архив чатов (archive) ---------- */
function isArchived(name) {
    return archivedChats.includes(name);
}

function saveArchived() {
    localStorage.setItem('zapretka_archived', JSON.stringify(archivedChats));
    if (channel) channel.postMessage({ type: 'archive_update', archivedChats });
}

function renderArchivedList() {
    const container = document.getElementById('archived-list');
    if (!container) return;
    container.innerHTML = '';

    // Порядок: самый свежий сверху
    archivedChats.forEach(name => {
        const row = document.createElement('div');
        row.className = 'archived-item';

        const avatarUrl = (users.find(u => u.name === name) || {}).avatar || `https://i.pravatar.cc/48?u=${name}`;

        const left = document.createElement('div');
        left.className = 'archived-left';
        const img = document.createElement('img');
        img.src = avatarUrl;
        img.className = 'chat-avatar-small';
        left.appendChild(img);

        const info = document.createElement('div');
        info.className = 'chat-info';
        const title = document.createElement('div');
        title.className = 'chat-name';
        title.innerText = name;
        const preview = document.createElement('div');
        preview.className = 'chat-preview';
        preview.innerText = 'В архиве';
        info.appendChild(title);
        info.appendChild(preview);

        const unarchiveBtn = document.createElement('button');
        unarchiveBtn.className = 'unarchive-btn';
        unarchiveBtn.innerText = '↩️';
        unarchiveBtn.title = 'Восстановить чат';
        unarchiveBtn.onclick = (e) => { e.stopPropagation(); unarchiveChat(name); };

        row.onclick = function () { setActiveChat(name, this); };
        row.appendChild(img);
        row.appendChild(info);
        row.appendChild(unarchiveBtn);

        container.appendChild(row);
    });
}

function archiveChat(name) {
    if (!name || isArchived(name) || name === 'Zapret Bot') return;
    archivedChats.unshift(name);
    saveArchived();
    // Если архивируем текущий активный чат, переключаемся
    if (activeContact === name) {
        activeContact = 'Zapret Bot';
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
    if (!activeContact || activeContact === 'Zapret Bot') return;
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

/* ---------- Меню, звонки и голосовые сообщения ---------- */
function openBurgerMenu() {
    alert('Открыть меню (Настройки, Папки, Создать канал) — заглушка.');
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
    document.getElementById('call-title').innerText = title;
    document.getElementById('call-status').innerText = 'Инициализация...';
    modal.style.display = 'flex';
}

function acceptCall() {
    const status = document.getElementById('call-status');
    if (!status) return;
    status.innerText = 'Соединено';
}

function hangupCall() {
    const modal = document.getElementById('call-modal');
    if (modal) modal.style.display = 'none';
    currentCall = null;
}

// Голосовая запись (используем MediaRecorder, если доступно)
let mediaRecorder = null;
let audioChunks = [];
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
        localStorage.setItem('zapretka_messages', JSON.stringify(messages));
        if (channel) channel.postMessage({ type: 'messages_update', messages });
        renderMessages();
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);
            const msg = {
                from: me.name,
                to: activeContact,
                text: `<audio controls src="${url}"></audio>`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                type: 'voice'
            };
            messages.push(msg);
            localStorage.setItem('zapretka_messages', JSON.stringify(messages));
            if (channel) channel.postMessage({ type: 'messages_update', messages });
            renderMessages();
            // остановить треки
            stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
        btn.classList.add('recording');
        btn.innerText = '⏺';
    } catch (err) {
        alert('Ошибка доступа к микрофону: ' + err.message);
    }
}

// Вызов игр (можно добавить позже)
function openTTT() { alert('Игра "Крестики-нолики" будет скоро!'); }
function openSlots() { alert('Игровой автомат будет скоро!'); }

/* ---------- ФУНКЦИЯ ПОИСКА ПО СООБЩЕНИЯМ И КОНТАКТАМ ---------- */
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
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
        
        // 1. Поиск по контактам (имена пользователей)
        const allContacts = [
            { name: 'Zapret Bot', avatar: 'https://i.pravatar.cc/48?u=bot', type: 'bot' },
            ...(users || [])
        ];
        
        const matchedContacts = allContacts.filter(c => 
            c.name.toLowerCase().includes(query)
        );
        
        if (matchedContacts.length > 0) {
            const header = document.createElement('div');
            header.className = 'search-header';
            header.innerText = '👥 Контакты (' + matchedContacts.length + ')';
            list.appendChild(header);
            
            matchedContacts.forEach(c => {
                addContactToSidebar(c.name, '', c.avatar, '');
            });
        }
        
        // 2. Поиск по сообщениям
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

// При загрузке страницы — проверяем сохранённую сессию и восстанавливаем её автоматически
window.addEventListener('load', () => {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('current_user')) {
        const userName = sessionStorage.getItem('current_user');
        const savedUserData = JSON.parse(localStorage.getItem('zapretka_user_' + userName));
        if (savedUserData) {
            me = { name: userName, ...savedUserData };
        } else {
            const userProfile = (users || []).find(u => u.name === userName);
            if (userProfile) me = { ...userProfile };
        }
        if (me.name) {
            // Скрываем экран входа и показываем основное приложение, затем инициализируем
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('main-app').style.display = 'grid';
            initApp();
        }
    }
});