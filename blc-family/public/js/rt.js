// Couche temps réel (WebSocket) : présence, salles, signalisation, commandes TV.
import { state, bus } from './core.js';

let ws = null;
let retry = 0;
const rooms = new Map(); // room -> meta (pour rejoindre à nouveau après reconnexion)
const queue = [];

export function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    retry = 0;
    for (const [room, meta] of rooms) raw({ t: 'join', room, meta });
    while (queue.length) raw(queue.shift());
    bus.emit('rt:open');
  };
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch (_) { return; }
    switch (m.t) {
      case 'welcome': state.clientId = m.clientId; state.settings = m.settings || {}; bus.emit('welcome', m); break;
      case 'presence': state.presence = m.clients; bus.emit('presence', m.clients); break;
      case 'event': bus.emit('ev:' + m.type, m.payload); bus.emit('event', m); break;
      default: bus.emit('rt:' + m.t, m);
    }
  };
  ws.onclose = (e) => {
    bus.emit('rt:close');
    if (e.code === 4001) { location.reload(); return; } // appareil révoqué
    setTimeout(connect, Math.min(15000, 800 * 2 ** retry++));
  };
}
function raw(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); else queue.push(m); }
export const send = raw;
export function join(room, meta = {}) { rooms.set(room, meta); raw({ t: 'join', room, meta }); }
export function leave(room) { rooms.delete(room); raw({ t: 'leave', room }); }
export function toRoom(room, data, keepState = false) { raw({ t: 'room', room, data, state: keepState }); }
export function signal(room, to, data) { raw({ t: 'signal', room, to, data }); }
export function tv(toDevice, cmd) { raw({ t: 'tv', toDevice, cmd }); }
export const connected = () => ws && ws.readyState === 1;
