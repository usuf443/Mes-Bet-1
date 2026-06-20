// ════════════════════════════════════════════════════════════════════
// СИСТЕМА АУТЕНТИФИКАЦИИ И РЕГИСТРАЦИИ
// ════════════════════════════════════════════════════════════════════

// Переключение между режимом входа и регистрации
function switchToRegister() {
    document.getElementById('login-mode').style.display = 'none';
    document.getElementById('register-mode').style.display = 'block';
    // Очистить поля
    document.getElementById('register-username').value = '';
    document.getElementById('register-password').value = '';
    document.getElementById('register-password-confirm').value = '';
}

function switchToLogin() {
    document.getElementById('register-mode').style.display = 'none';
    document.getElementById('login-mode').style.display = 'block';
    // Очистить поля
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
}

// Обработка входа
async function handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();

    if (!username) { 
        alert('Введите никнейм'); 
        return; 
    }
    if (!password) { 
        alert('Введите пароль'); 
        return; 
    }

    // Сначала пробуем серверный API
    try {
        const resp = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (resp.ok) {
            const json = await resp.json();
            if (json && json.success) {
                me = json.user;
                // Сохраняем локально для оффлайн-совместимости
                try { updateUserData(me.name || username, me); } catch (e) {}
                sessionStorage.setItem('current_user', username);
                localStorage.setItem('zapretka_last_user', username);
                document.getElementById('auth-screen').style.display = 'none';
                document.getElementById('main-app').style.display = 'grid';
                if (typeof initApp === 'function') initApp();
                return;
            } else {
                if (json && json.message) alert('❌ ' + json.message);
            }
        }
    } catch (err) {
        console.warn('Login API failed, falling back to local auth', err);
    }

    // Фолбэк на локальную проверку (offline)
    const result = verifyLogin(username, password);
    if (!result.success) {
        alert('❌ ' + result.message);
        return;
    }

    const userData = getUserData(username);
    me = { ...userData };
    sessionStorage.setItem('current_user', username);
    localStorage.setItem('zapretka_last_user', username);
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'grid';
    if (typeof initApp === 'function') initApp();
}

// Обработка регистрации
async function handleRegister() {
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value.trim();
    const passwordConfirm = document.getElementById('register-password-confirm').value.trim();

    if (!username) { 
        alert('Введите никнейм'); 
        return; 
    }
    if (!password) { 
        alert('Введите пароль'); 
        return; 
    }
    if (!passwordConfirm) { 
        alert('Подтвердите пароль'); 
        return; 
    }
    
    if (username.length < 3) { alert('Никнейм должен содержать минимум 3 символа'); return; }
    if (password.length < 4) { alert('Пароль должен содержать минимум 4 символа'); return; }
    if (password !== passwordConfirm) { alert('❌ Пароли не совпадают!'); return; }

    // Пробуем зарегать на сервере
    try {
        const resp = await fetch('/api/register', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (resp.ok) {
            const json = await resp.json();
            if (json && json.success) {
                // Сохраним локально для оффлайна
                try { registerUser(username, password); } catch (e) {}
                alert('✓ ' + (json.message || 'Регистрация успешна') + ' Перейдите на вход.');
                switchToLogin();
                return;
            } else {
                if (json && json.message) alert('❌ ' + json.message);
            }
        }
    } catch (err) {
        console.warn('Register API failed, falling back to local register', err);
    }

    // Локальная регистрация (fallback)
    const result = registerUser(username, password);
    if (!result.success) { alert('❌ ' + result.message); return; }
    alert('✓ ' + result.message + ' Вы будете перенаправлены на страницу входа.');
    switchToLogin();
}

// Загрузить сообщения для текущего пользователя
function loadMessagesForUser(username) {
    const key = 'zapretka_messages_' + username;
    const stored = localStorage.getItem(key);
    messages = stored ? JSON.parse(stored) : [];
}

// Загрузить контакты для текущего пользователя
function loadUserContacts(username) {
    const contacts = getUserContacts(username);
    // Обновляем список контактов (используется в script.js)
    users = contacts.map(contactName => ({
        name: contactName,
        avatar: `https://i.pravatar.cc/100?u=${encodeURIComponent(contactName)}`
    }));
}

// Сохранить сообщения для текущего пользователя
function saveMessagesForUser(username) {
    const key = 'zapretka_messages_' + username;
    localStorage.setItem(key, JSON.stringify(messages));
}

// Поддержка автоматического входа при обновлении страницы
function checkAutoLogin() {
    if (typeof sessionStorage !== 'undefined') {
        const currentUser = sessionStorage.getItem('current_user');
        if (currentUser) {
            const userData = getUserData(currentUser);
            if (userData) {
                me = { ...userData };
                loadMessagesForUser(currentUser);
                loadUserContacts(currentUser);
                
                // Скрыть экран входа и показать основное приложение
                document.getElementById('auth-screen').style.display = 'none';
                document.getElementById('main-app').style.display = 'grid';
                
                // Инициализация приложения (используем setTimeout для гарантии что script.js загружен)
                if (typeof initApp === 'function') {
                    initApp();
                } else {
                    // Fallback - дождаться загрузки
                    setTimeout(function() {
                        if (typeof initApp === 'function') {
                            initApp();
                        }
                    }, 100);
                }
                return true;
            }
        }
    }
    return false;
}