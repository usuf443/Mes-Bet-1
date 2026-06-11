// HTTP + WebSocket сервер для демо-версии Zapretgram
// Запускает статику и простое API для регистрации/логина.
// Как запустить:
// 1) Установите зависимости: npm install
// 2) Запустите: node server.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const USERS_FILE = path.join(__dirname, 'users.json');

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const raw = fs.readFileSync(USERS_FILE, 'utf8');
      return raw ? JSON.parse(raw) : {};
    }
  } catch (e) {
    console.error('Failed to load users.json', e);
  }
  return {};
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save users.json', e);
  }
}

let users = loadUsers();

// Инициализация demo-пользователей на сервере, если файл пуст
if (Object.keys(users).length === 0) {
  const demo = ['Юсуф', 'Али', 'Марат', 'Лиза', 'Катя'];
  demo.forEach(u => {
    users[u] = {
      password: '123',
      avatar: `https://i.pravatar.cc/100?u=${encodeURIComponent(u)}`,
      nickname: u,
      birthplace: '',
      birthyear: '',
      bio: 'Demo user',
      registeredAt: new Date().toISOString()
    };
  });
  saveUsers(users);
  console.log('✓ Demo users initialized on server');
}

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.json': 'application/json',
  '.ico': 'image/x-icon', '.webp': 'image/webp'
};

const server = http.createServer((req, res) => {
  const url = req.url || '/';

  // Простая реализация API
  if (url.startsWith('/api/')) {
    if (req.method === 'POST' && url === '/api/register') {
      collectBody(req, body => {
        try {
          const bodyObj = JSON.parse(body || '{}');
          const username = (bodyObj.username || '').trim();
          const password = String(bodyObj.password || '');
          if (!username || !password) return sendJSON(res, 400, { success: false, message: 'username and password required' });
          if (users[username]) return sendJSON(res, 400, { success: false, message: 'Этот никнейм уже занят' });
          users[username] = {
            password: password,
            avatar: `https://i.pravatar.cc/100?u=${encodeURIComponent(username)}`,
            nickname: username,
            birthplace: '',
            birthyear: '',
            bio: '',
            registeredAt: new Date().toISOString()
          };
          saveUsers(users);
          broadcastUsers();
          return sendJSON(res, 200, { success: true, message: 'Регистрация успешна', user: sanitizeUser(users[username], username) });
        } catch (e) {
          console.error('register error', e);
          return sendJSON(res, 500, { success: false, message: 'server error' });
        }
      });
      return;
    }

    if (req.method === 'POST' && url === '/api/login') {
      collectBody(req, body => {
        try {
          const bodyObj = JSON.parse(body || '{}');
          const username = (bodyObj.username || '').trim();
          const password = String(bodyObj.password || '');
          if (!users[username]) return sendJSON(res, 404, { success: false, message: 'Пользователь не найден' });
          if (users[username].password !== password) return sendJSON(res, 401, { success: false, message: 'Неверный пароль' });
          return sendJSON(res, 200, { success: true, message: 'Вход выполнен', user: sanitizeUser(users[username], username) });
        } catch (e) {
          console.error('login error', e);
          return sendJSON(res, 500, { success: false, message: 'server error' });
        }
      });
      return;
    }

    if (req.method === 'GET' && url === '/api/users') {
      const list = Object.keys(users).map(u => ({ name: u, avatar: users[u].avatar }));
      return sendJSON(res, 200, { success: true, users: list });
    }

    return sendJSON(res, 404, { success: false, message: 'Not found' });
  }

  // Отдача статичных файлов
  let filePath = url === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, decodeURIComponent(url.split('?')[0]));
  // Защита от directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) return send404(res);
  fs.stat(filePath, (err, stats) => {
    if (err) return send404(res);
    if (stats.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, (err, data) => {
      if (err) return send404(res);
      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    });
  });
});

function collectBody(req, cb) {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
    if (body.length > 1e6) req.connection.destroy();
  });
  req.on('end', () => cb(body));
}

function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function send404(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

function sanitizeUser(userObj, username) {
  const { password, ...rest } = userObj || {};
  return Object.assign({ name: username }, rest);
}

const wss = new WebSocket.Server({ server });

function broadcast(obj) {
  const str = JSON.stringify(obj);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(str); });
}

function broadcastUsers() {
  const list = Object.keys(users).map(u => ({ name: u, avatar: users[u].avatar }));
  broadcast({ type: 'users', users: list });
}

wss.on('connection', (ws) => {
  console.log('client connected');
  ws.isAlive = true;
  // Отправим список пользователей при подключении
  ws.send(JSON.stringify({ type: 'users', users: Object.keys(users).map(u => ({ name: u, avatar: users[u].avatar })) }));

  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data && data.type === 'msg' && data.msg) {
        broadcast({ type: 'msg', msg: data.msg });
      } else if (data && data.type === 'user_update' && data.users) {
        // Просто ретранслируем обновлённый список пользователей остальным
        broadcast({ type: 'users', users: data.users });
      }
    } catch (err) {
      console.warn('Invalid message', err);
    }
  });

  ws.on('close', () => console.log('client disconnected'));
});

// Пинг клиентов, чтобы убирать мёртвые соединения
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

server.listen(PORT, () => console.log('Server listening on http://localhost:' + PORT));
