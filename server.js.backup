// Простой WebSocket ретранслятор сообщений
// Как запустить:
// 1) Установите зависимости: npm install
// 2) Запустите: node server.js

const WebSocket = require('ws');
const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

console.log('WebSocket server listening on ws://localhost:' + PORT);

wss.on('connection', function connection(ws) {
  console.log('client connected');
  ws.on('message', function incoming(message) {
    // Приходящие сообщения ретранслируем всем подключённым клиентам
    try {
      const data = JSON.parse(message.toString());
      // Мы ожидаем объект { type: 'msg', msg: { ... } }
      if (data && data.type === 'msg' && data.msg) {
        const out = JSON.stringify({ type: 'msg', msg: data.msg });
        wss.clients.forEach(function each(client) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(out);
          }
        });
      }
    } catch (err) {
      console.warn('Invalid message', err);
    }
  });

  ws.on('close', () => console.log('client disconnected'));
});
