import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { GameRoom } from './room';

const PORT = Number(process.env.PORT ?? 4173);
const room = new GameRoom();
const clients = new Map<WebSocket, number>();

const HTML_CLIENT = `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8" />
  <title>Lab 7 — V8, Memory & Multiplayer Arena</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 16px; }
    #hud { display: flex; gap: 16px; margin-bottom: 12px; align-items: center; }
    canvas { background: #1e293b; border: 1px solid #334155; display: block; }
    #chat-box { margin-top: 12px; max-width: 600px; }
    #chat-log { height: 110px; overflow-y: auto; background: #1e293b; padding: 8px; border: 1px solid #334155; }
  </style>
</head>
<body>
  <div id="hud">
    <span id="status">Connecting...</span>
    <span id="player-info"></span>
    <span id="metrics">p50: 0.0ms | p95: 0.0ms | p99: 0.0ms</span>
  </div>
  <canvas id="arena" width="800" height="450"></canvas>
  <div id="chat-box">
    <div id="chat-log" data-testid="chat-log"></div>
    <form id="chat-form">
      <input id="chat-input" data-testid="chat-input" placeholder="Повідомлення в кімнату..." autocomplete="off" />
      <button type="submit" data-testid="chat-send">Надіслати</button>
    </form>
  </div>
  <script>
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    ws.binaryType = 'arraybuffer';
    const canvas = document.getElementById('arena');
    const ctx = canvas.getContext('2d');
    const ships = new Map();
    let myId = 0;
    let seq = 0;
    const keys = { up: false, left: false, right: false, fire: false };

    function sendInput() {
      if (ws.readyState !== WebSocket.OPEN) return;
      seq++;
      const buf = new ArrayBuffer(12);
      const view = new DataView(buf);
      view.setUint16(0, 0x4c37, false);
      view.setUint8(2, 1);
      view.setUint32(3, seq, false);
      view.setInt16(7, keys.up ? 32767 : 0, false);
      const turn = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      view.setInt16(9, turn * 32767, false);
      view.setUint8(11, keys.fire ? 1 : 0);
      ws.send(buf);
    }

    window.addEventListener('keydown', (e) => {
      if (document.activeElement === document.getElementById('chat-input')) return;
      if (e.key === 'ArrowUp' || e.key === 'w') keys.up = true;
      if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true;
      if (e.key === ' ') keys.fire = true;
      sendInput();
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'w') keys.up = false;
      if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false;
      if (e.key === ' ') keys.fire = false;
      sendInput();
    });

    document.getElementById('chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('chat-input');
      const text = input.value.trim();
      if (!text || ws.readyState !== WebSocket.OPEN) return;
      const encoded = new TextEncoder().encode(text);
      const buf = new Uint8Array(7 + encoded.length);
      const view = new DataView(buf.buffer);
      view.setUint16(0, 0x4c37, false);
      view.setUint8(2, 3);
      view.setUint16(3, myId, false);
      view.setUint16(5, encoded.length, false);
      buf.set(encoded, 7);
      ws.send(buf);
      input.value = '';
    });

    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        const meta = JSON.parse(ev.data);
        if (meta.welcomeId) {
          myId = meta.welcomeId;
          document.getElementById('status').textContent = 'Connected';
          document.getElementById('player-info').textContent = 'Player #' + myId;
        }
        return;
      }
      const buf = new Uint8Array(ev.data);
      const view = new DataView(buf.buffer);
      const type = view.getUint8(2);
      if (type === 2) {
        const id = view.getUint16(3, false);
        const x = view.getFloat32(9, false);
        const y = view.getFloat32(13, false);
        const angle = (view.getUint16(25, false) / 65535) * Math.PI * 2;
        ships.set(id, { id, x, y, angle });
        window.__SHIPS__ = Object.fromEntries(ships);
      } else if (type === 3) {
        const senderId = view.getUint16(3, false);
        const len = view.getUint16(5, false);
        const text = new TextDecoder().decode(buf.subarray(7, 7 + len));
        const line = document.createElement('div');
        line.textContent = '#' + senderId + ': ' + text;
        document.getElementById('chat-log').appendChild(line);
      }
    };

    setInterval(sendInput, 1000 / 30);

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of ships.values()) {
        ctx.save();
        ctx.translate(s.x * (800 / 1200), s.y * (450 / 800));
        ctx.rotate(s.angle);
        ctx.fillStyle = s.id === myId ? '#38bdf8' : '#f472b6';
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-10, -8);
        ctx.lineTo(-10, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML_CLIENT);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const player = room.addPlayer(false);
  clients.set(ws, player.id);
  ws.send(JSON.stringify({ welcomeId: player.id }));

  ws.on('message', (data: Buffer) => {
    const arr = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const result = room.handleBinaryPacket(player.id, arr, Date.now());
    if (result.broadcastChat) {
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(result.broadcastChat);
        }
      }
    }
  });

  ws.on('close', () => {
    const id = clients.get(ws);
    if (id !== undefined) {
      room.removePlayer(id);
      clients.delete(ws);
    }
  });
});

setInterval(() => {
  const snapshots = room.tick(1 / 60);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      for (const snap of snapshots) {
        client.send(snap);
      }
    }
  }
}, 1000 / 60);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Lab 7 server listening on http://127.0.0.1:${PORT}`);
});
