// Noyau client : API, état, helpers DOM, notifications, médias.

// append / prepend / replaceChildren acceptent ici des tableaux imbriqués et ignorent null/false,
// comme h() : l'interface est composée de listes conditionnelles.
for (const k of ['append', 'prepend', 'replaceChildren']) {
  const orig = Element.prototype[k];
  Element.prototype[k] = function (...kids) { return orig.apply(this, kids.flat(Infinity).filter((x) => x != null && x !== false)); };
}
export const state = { me: null, device: null, members: [], links: {}, presence: [], clientId: null, settings: {} };

export async function api(path, opts = {}) {
  const init = { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: {}, credentials: 'same-origin' };
  if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
  const r = await fetch(path, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || `Erreur ${r.status}`); e.status = r.status; throw e; }
  return data;
}

// Téléversement brut avec progression
export function upload(blob, onProgress, filename = '') {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api/upload');
    x.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');
    if (filename || blob.name) x.setRequestHeader('X-Filename', encodeURIComponent(filename || blob.name));
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => { const d = JSON.parse(x.responseText || '{}'); x.status < 300 ? resolve(d) : reject(new Error(d.error || 'Échec du téléversement')); };
    x.onerror = () => reject(new Error('Réseau indisponible'));
    x.send(blob);
  });
}

// Création d'éléments : h('div.card#id', {onclick}, ...enfants)
export function h(sel, attrs, ...kids) {
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(sel) || [];
  const el = document.createElement(m[1] || 'div');
  (m[2] || '').replace(/([.#])([\w-]+)/g, (_, t, v) => { if (t === '.') el.classList.add(v); else el.id = v; });
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export const member = (id) => state.members.find((m) => m.id === id) || { id, name: id ? id : 'Famille', color: '#8a7a99', emoji: '🏠' };
export function avatar(id, size = '', online) {
  const m = member(id);
  const a = h('span.av' + (size ? '.' + size : ''), { title: m.name, style: { '--c': m.color } });
  if (m.avatar) a.append(h('img', { src: m.avatar, alt: '' })); else a.textContent = (m.name || '?')[0].toUpperCase();
  if (online) a.classList.add('online');
  return a;
}
export const isOnline = (memberId) => state.presence.some((c) => c.memberId === memberId);

export function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `il y a ${Math.floor(s / 86400)} j`;
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
export const fdate = (d, o = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) => new Date(typeof d === 'string' && d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('fr-FR', o);
export const dur = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// Petit bus d'événements
const handlers = {};
export const bus = {
  on(t, f) { (handlers[t] ||= new Set()).add(f); return () => handlers[t].delete(f); },
  emit(t, p) { handlers[t]?.forEach((f) => { try { f(p); } catch (e) { console.error(e); } }); },
};

// Notifications vivantes : apparaissent puis s'effacent doucement
export function toast({ actorId, text, thumb, onClick, ms = 5200 }) {
  const box = $('#toasts');
  const t = h('div.toast', { onclick: () => { onClick?.(); close(); } },
    actorId !== undefined ? avatar(actorId, 'l') : null,
    h('div.t-txt', actorId ? h('b', member(actorId).name + ' ') : null, text),
    thumb ? h('img.t-thumb', { src: thumb, alt: '' }) : null);
  box.append(t);
  while (box.children.length > 4) box.firstChild.remove();
  const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 800); };
  setTimeout(close, ms);
  return t;
}
export const info = (text) => toast({ text, ms: 3500 });

// Superpositions
export function overlay(content, { immersive = false, onClose, closable = true } = {}) {
  const o = h('div.overlay' + (immersive ? '.immersive' : ''));
  const close = () => { if (!o.isConnected) return; o.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = (e) => { if (closable && (e.key === 'Escape' || e.key === 'GoBack' || e.keyCode === 10009 || e.keyCode === 461)) { e.preventDefault(); e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey);
  if (closable) {
    o.addEventListener('click', (e) => { if (e.target === o) close(); });
    o.append(h('button.icon-btn.close-x', { onclick: close, 'aria-label': 'Fermer', 'data-focus': '' }, '✕'));
  }
  o.append(typeof content === 'function' ? content(close) : content);
  $('#overlay-root').append(o);
  setTimeout(() => o.querySelector('[autofocus], input, textarea, button:not(.close-x)')?.focus(), 60);
  return { el: o, close };
}
export function sheet(title, build, opts) {
  return overlay((close) => h('div.sheet', h('h2', title), build(close)), opts);
}
export function confirmBox(text, okLabel = 'Confirmer') {
  return new Promise((res) => {
    const s = sheet(text, (close) => h('div.row', { style: { justifyContent: 'flex-end' } },
      h('button.btn', { onclick: () => { res(false); close(); } }, 'Annuler'),
      h('button.btn.primary', { onclick: () => { res(true); close(); } }, okLabel)), { onClose: () => res(false) });
    return s;
  });
}

// Waveform décorative (déterministe à partir d'une graine)
export function wave(seed = 'x', bars = 28, live = false) {
  let x = 0; for (const c of String(seed)) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  const w = h('div.wave' + (live ? '.live' : ''));
  for (let i = 0; i < bars; i++) { x = (x * 1103515245 + 12345) >>> 0; w.append(h('i', { style: { '--h': 20 + (x % 80), '--k': i } })); }
  return w;
}
export function audioPlayer(url, seed, duration) {
  const a = new Audio(); a.preload = 'none'; a.src = url;
  const btn = h('button.play', { 'aria-label': 'Lire' }, '▶');
  const time = h('span.muted', duration ? dur(duration) : '');
  const box = h('div.audio-inline', btn, wave(seed || url), time);
  btn.onclick = (e) => { e.stopPropagation(); a.paused ? a.play() : a.pause(); };
  a.onplay = () => { box.classList.add('playing'); btn.textContent = '❚❚'; };
  a.onpause = a.onended = () => { box.classList.remove('playing'); btn.textContent = '▶'; };
  a.ontimeupdate = () => { time.textContent = dur(a.currentTime); };
  box.audio = a;
  return box;
}

// Enregistreur audio / vidéo (MediaRecorder)
export async function recorder(kind = 'audio', maxSec = 120) {
  const stream = await navigator.mediaDevices.getUserMedia(kind === 'video' ? { audio: true, video: { facingMode: 'user' } } : { audio: true });
  const types = kind === 'video' ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  const mimeType = types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = []; let started = 0; let timer;
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  return {
    stream,
    start() { chunks.length = 0; rec.start(250); started = Date.now(); timer = setTimeout(() => this.stop(), maxSec * 1000); },
    stop() {
      clearTimeout(timer);
      return new Promise((res) => {
        if (rec.state === 'inactive') return res(null);
        rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); const type = (rec.mimeType || mimeType || (kind === 'video' ? 'video/webm' : 'audio/webm')).split(';')[0]; res({ blob: new Blob(chunks, { type }), duration: (Date.now() - started) / 1000 }); };
        rec.stop();
      });
    },
    cancel() { clearTimeout(timer); try { rec.state !== 'inactive' && rec.stop(); } catch (_) {} stream.getTracks().forEach((t) => t.stop()); },
  };
}

// Réactions flottantes
export function floatReaction(emoji, memberId) {
  let layer = $('.floaters'); if (!layer) { layer = h('div.floaters'); document.body.append(layer); }
  const f = h('div.floater', { style: { left: 10 + Math.random() * 80 + '%', '--dx': (Math.random() * 120 - 60) + 'px' } }, emoji, memberId ? h('small', member(memberId).name) : null);
  layer.append(f); setTimeout(() => f.remove(), 3700);
}

export function confetti(n = 80) {
  const colors = ['#f4a261', '#c2416b', '#3fc1c9', '#ffd166', '#a78bfa', '#80ed99'];
  for (let i = 0; i < n; i++) {
    const c = h('i.confetti', { style: { left: Math.random() * 100 + 'vw', background: colors[i % colors.length], animationDelay: Math.random() * 1.2 + 's', animationDuration: 2.5 + Math.random() * 2 + 's' } });
    document.body.append(c); setTimeout(() => c.remove(), 5000);
  }
}

export const REACTIONS = [['❤️', 'J’aime'], ['😂', 'Rire'], ['👏', 'Bravo'], ['🥂', 'Tchin']];
export function reactionBar(kind, id, reactions = {}, onChange) {
  const box = h('div.reactions');
  const paint = (rx) => {
    box.replaceChildren(...REACTIONS.map(([e, label]) => {
      const n = Object.values(rx).filter((x) => x === e).length;
      return h('button' + (rx[state.me?.id] === e ? '.mine' : ''), { title: label, 'data-focus': '', onclick: async (ev) => { ev.stopPropagation(); const r = await api('/api/react', { body: { kind, id, emoji: e } }); paint(r); onChange?.(r); } }, e, n ? h('small', n) : null);
    }));
  };
  paint(reactions);
  box.update = paint;
  return box;
}

export const kindIcon = { tv: '📺', phone: '📱', tablet: '📲', desktop: '💻' };
export function youtubeId(url) { const m = /(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/.exec(url); return m && m[1]; }
