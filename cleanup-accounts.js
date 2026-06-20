// Удаление всех зарегистрированных аккаунтов из localStorage
(function() {
    if (typeof window === 'undefined') {
        console.error('Этот скрипт нужно запускать в браузере, в контексте приложения.');
        return;
    }

    const key = 'zapretka_registered_users';
    const registered = localStorage.getItem(key);
    if (!registered) {
        console.log('Аккаунты не найдены, очистка не требуется.');
        return;
    }

    localStorage.removeItem(key);
    console.log('Все зарегистрированные аккаунты удалены.');
})();
