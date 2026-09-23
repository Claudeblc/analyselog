'use strict';
// Belcram Family — serveur HTTP + WebSocket (temps réel, signalisation WebRTC).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const db = require('./store');

const PORT = Number(process.env.PORT || 3100);
const FAMILY_PIN = process.env.FAMILY_PIN || '';
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || '';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const COOKIE = 'blcf';
const PAIR_TTL = 3 * 60 * 1000; // jeton d'appairage TV : 3 minutes, usage unique
const MAX_UPLOAD = 1024 * 1024 * 1024;
const LINKS = {
  music: process.env.MUSIC_URL || 'https://blc-music-player.duckdns.org/app',
  tv: process.env.TV_URL || 'https://blctv-player.com',
};

// Serveurs BLC TV proposés à l'ouverture (noms visibles, liens gardés côté serveur, jamais dans le dépôt).
// TV_SERVERS="Fox|https://lien-1;BOD TV 4K|https://lien-2"
const TV_SERVERS = (process.env.TV_SERVERS || '').split(';').map((x) => x.split('|')).filter((x) => x[0] && /^https?:\/\//.test(x[1] || '')).map(([name, url]) => ({ name: name.trim(), url: url.trim() }));
if (!TV_SERVERS.length) TV_SERVERS.push({ name: 'BLC TV Player', url: LINKS.tv });

if (!FAMILY_PIN) console.warn('[blc-family] FAMILY_PIN non défini : utilisez FAMILY_PIN=xxxx en production. PIN de dev = 0000');
const PIN = FAMILY_PIN || '0000';

// ---------------------------------------------------------------- membres
// Pastilles de compétences : « on se tourne vers qui sait » (domaines : sante, info, emploi, rh, autre)
const DEFAULT_MEMBERS = [
  { id: 'papa', name: 'Papa', role: 'author', admin: true, color: '#f4a261', emoji: '🍷', job: 'Conseiller principal France Travail',
    skills: [{ label: 'Emploi & reconversion', domain: 'emploi' }, { label: 'CV & entretiens', domain: 'emploi' }, { label: 'Formation', domain: 'emploi' }] },
  { id: 'claude', name: 'Claude', role: 'reader', admin: true, color: '#4cc9f0', emoji: '🎧', job: 'Développeur & technicien informatique',
    skills: [{ label: 'Développement', domain: 'info' }, { label: 'Dépannage informatique', domain: 'info' }, { label: 'Sites & applis', domain: 'info' }] },
  { id: 'christophe', name: 'Christophe', role: 'reader', admin: false, color: '#80ed99', emoji: '🎸', job: 'Préparateur en pharmacie',
    skills: [{ label: 'Pharmacie', domain: 'sante' }, { label: 'Compétences médicales', domain: 'sante' }, { label: 'Médicaments', domain: 'sante' }] },
  { id: 'celia', name: 'Célia', role: 'reader', admin: false, color: '#f472b6', emoji: '🌺', job: 'Ressources humaines (RH)',
    skills: [{ label: 'RH', domain: 'rh' }, { label: 'Contrats & fiches de paie', domain: 'rh' }, { label: 'Recrutement', domain: 'rh' }] },
];
const members = db.list('members');
if (!members.length) { DEFAULT_MEMBERS.forEach((m) => db.insert('members', { ...m, birthday: '', avatar: '', jobHistory: [] })); }
// Données existantes : ajouter métier et pastilles aux membres qui n'en ont pas encore
for (const d of DEFAULT_MEMBERS) { const m = db.get('members', d.id); if (m && m.job === undefined) db.update('members', d.id, { job: d.job, skills: d.skills, jobHistory: [] }); }
const SKILL_DOMAINS = ['sante', 'info', 'emploi', 'rh', 'autre'];
const member = (mid) => db.get('members', mid);
const publicMember = (m) => m && { id: m.id, name: m.name, role: m.role, admin: !!m.admin, color: m.color, emoji: m.emoji, avatar: m.avatar, birthday: m.birthday, job: m.job || '', skills: m.skills || [], jobHistory: m.jobHistory || [] };

// ---------------------------------------------------------------- sessions
const sessions = db.obj('sessions'); // token -> session
function createSession(data) {
  const t = db.token();
  sessions[t] = { memberId: null, deviceId: db.id('dev_'), deviceName: 'Appareil', kind: 'desktop', createdAt: Date.now(), lastSeen: Date.now(), ...data };
  db.save('sessions');
  return t;
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function sessionOf(req) {
  const t = parseCookies(req)[COOKIE];
  const s = t && sessions[t];
  if (!s) return null;
  if (Date.now() - s.lastSeen > 60000) { s.lastSeen = Date.now(); db.save('sessions'); }
  return { token: t, ...s, member: s.memberId ? member(s.memberId) : null };
}
function setCookie(req, res, value, maxAge = 365 * 86400) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
  const parts = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secure) parts.push('Secure');
  // Cookie partagé entre sous-domaines (family., galerie., chat., visio.) si l'hôte appartient au domaine configuré
  const host = String(req.headers.host || '').split(':')[0];
  if (COOKIE_DOMAIN && ('.' + host).endsWith(COOKIE_DOMAIN.replace(/^\.?/, '.'))) parts.push(`Domain=${COOKIE_DOMAIN}`);
  res.setHeader('Set-Cookie', parts.join('; '));
}

// Anti force brute sur le PIN
const attempts = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const a = (attempts.get(ip) || []).filter((t) => now - t < 10 * 60000);
  attempts.set(ip, a);
  return a.length >= 10;
}

// ---------------------------------------------------------------- helpers HTTP
function send(res, code, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': typeof body === 'object' && !Buffer.isBuffer(body) ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(data);
}
const ok = (res, body = { ok: true }) => send(res, 200, body);
const fail = (res, code, msg) => send(res, code, { error: msg });
function readJson(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const EXT_BY_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/heic': '.heic', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'audio/webm': '.webm', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a', 'audio/mpeg': '.mp3', 'audio/wav': '.wav' };

function serveFile(req, res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return fail(res, 404, 'Introuvable');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': cache };
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range) {
      const start = range[1] ? Number(range[1]) : st.size - Number(range[2]);
      const end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      if (start >= st.size || start < 0) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}

// ---------------------------------------------------------------- domaine
const now = () => Date.now();
const isAuthor = (s) => s.member && (s.member.role === 'author');
const canEditAt = (s, at) => s.member && (at.authorId === s.memberId || s.member.admin);

function atSummary(at) {
  const { text, versions, ...rest } = at;
  return { ...rest, excerpt: text.replace(/\s+/g, ' ').slice(0, 240), length: text.length, versionCount: (versions || []).length };
}
function visibleAt(s, at) { return at.status === 'published' || (s.member && (at.authorId === s.memberId || s.member.admin)); }

function capsuleView(c) {
  if (c.opened) return c;
  const { text, mediaUrl, mediaType, ...rest } = c; // contenu caché avant la date
  return { ...rest, locked: true, hasMedia: !!mediaUrl };
}

function feedItems() {
  const items = [];
  for (const p of db.list('posts')) items.push({ kind: 'post', id: p.id, at: p.createdAt, authorId: p.authorId, type: p.type, text: p.text, mediaUrl: p.mediaUrl, reactions: p.reactions, comments: (p.comments || []).length });
  for (const a of db.list('aperotimes')) if (a.status === 'published') items.push({ kind: 'aperotime', id: a.id, at: a.publishedAt || Date.parse(a.date), authorId: a.authorId, type: 'aperotime', title: a.title, text: a.text.slice(0, 400), reactions: a.reactions });
  for (const c of db.list('capsules')) if (c.opened) items.push({ kind: 'capsule', id: c.id, at: c.unlockAt, authorId: c.authorId, type: 'capsule', title: c.title, text: (c.text || '').slice(0, 300), mediaUrl: c.mediaUrl, mediaType: c.mediaType });
  return items.sort((a, b) => b.at - a.at);
}

// Semaines (lundi → dimanche)
function weekKey(ts) {
  const d = new Date(ts); d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function weekItems(key) {
  return feedItems().filter((i) => weekKey(i.at) === key).reverse();
}

// ---------------------------------------------------------------- temps réel
const clients = new Map(); // clientId -> { ws, session token, info, rooms }
const roomState = new Map(); // room -> last state
function clientInfo(c) { return { clientId: c.id, memberId: c.memberId, deviceId: c.deviceId, deviceName: c.deviceName, kind: c.kind, meta: c.meta || {} }; }
function sendWs(c, msg) { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg)); }
function broadcast(msg, filter = () => true) { for (const c of clients.values()) if (filter(c)) sendWs(c, msg); }
function event(type, payload) { broadcast({ t: 'event', type, payload }); }
function presence() {
  const list = [...clients.values()].map(clientInfo);
  broadcast({ t: 'presence', clients: list });
}
function roomPeers(room, except) { return [...clients.values()].filter((c) => c.rooms.has(room) && c.id !== except); }
function notify(actorId, text, item) { event('notify', { actorId, text, item, at: now() }); }

// ---------------------------------------------------------------- routes API
const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, opts });
}

route('GET', '/api/config', async (req, res) => ok(res, { appName: 'Belcram Family', members: db.list('members').map(publicMember), links: LINKS }), { public: true });

route('POST', '/api/login', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  if (tooManyAttempts(ip)) return fail(res, 429, 'Trop de tentatives. Réessayez dans quelques minutes.');
  const b = await readJson(req);
  const m = member(b.memberId);
  const a = String(b.pin || ''); const p = String(PIN);
  const same = a.length === p.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(p));
  if (!m || !same) { attempts.get(ip).push(now()); return fail(res, 401, 'Code famille incorrect'); }
  attempts.delete(ip);
  const t = createSession({ memberId: m.id, deviceName: clip(b.deviceName || 'Appareil', 60), kind: ['phone', 'tablet', 'desktop', 'tv'].includes(b.kind) ? b.kind : 'desktop' });
  setCookie(req, res, t);
  ok(res, { ok: true });
}, { public: true });

route('POST', '/api/logout', async (req, res, s) => { delete sessions[s.token]; db.save('sessions'); setCookie(req, res, '', 0); ok(res); });

route('GET', '/api/me', async (req, res, s) => ok(res, {
  member: publicMember(s.member), device: { id: s.deviceId, name: s.deviceName, kind: s.kind },
  members: db.list('members').map(publicMember), links: LINKS,
}));

route('PATCH', '/api/members/:id', async (req, res, s, p) => {
  if (!s.member || (s.memberId !== p.id && !s.member.admin)) return fail(res, 403, 'Interdit');
  const b = await readJson(req); const patch = {};
  for (const k of ['name', 'color', 'emoji', 'avatar', 'birthday']) if (k in b) patch[k] = clip(b[k], 200);
  if (s.member.admin && b.role && ['author', 'reader'].includes(b.role)) patch.role = b.role;
  const cur = member(p.id);
  if ('job' in b && clip(b.job, 80) !== (cur?.job || '')) {
    // Historique des métiers : on garde la trace des changements
    patch.job = clip(b.job, 80);
    if (cur?.job) patch.jobHistory = [...(cur.jobHistory || []), { job: cur.job, until: new Date().toISOString().slice(0, 10) }].slice(-20);
  }
  if (Array.isArray(b.skills)) patch.skills = b.skills.slice(0, 12).map((x) => ({ label: clip(x.label, 40).trim(), domain: SKILL_DOMAINS.includes(x.domain) ? x.domain : 'autre' })).filter((x) => x.label);
  const m = db.update('members', p.id, patch);
  event('members', db.list('members').map(publicMember));
  ok(res, publicMember(m));
});
route('POST', '/api/members', async (req, res, s) => {
  if (!s.member?.admin) return fail(res, 403, 'Réservé aux administrateurs');
  const b = await readJson(req);
  const name = clip(b.name, 40).trim(); if (!name) return fail(res, 400, 'Prénom requis');
  const mid = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '') || db.id();
  if (member(mid)) return fail(res, 409, 'Ce membre existe déjà');
  const m = db.insert('members', { id: mid, name, role: 'reader', admin: false, color: clip(b.color || '#a78bfa', 20), emoji: clip(b.emoji || '🙂', 8), avatar: '', birthday: '', job: '', skills: [], jobHistory: [] });
  event('members', db.list('members').map(publicMember));
  ok(res, publicMember(m));
});

// Réglages familiaux (photos de l'accueil, fond) et serveurs BLC TV
route('GET', '/api/family', async (req, res) => { const f = db.obj('family'); ok(res, { heroPhotos: f.heroPhotos || [], background: f.background || '', tvServers: TV_SERVERS.map((x, i) => ({ id: i, name: x.name })) }); });
route('PUT', '/api/family', async (req, res, s) => {
  if (!s.member?.admin) return fail(res, 403, 'Réservé aux administrateurs');
  const b = await readJson(req); const f = db.obj('family');
  const okUrl = (u) => /^\/media\/[\w-]+\.\w+$/.test(u);
  if (Array.isArray(b.heroPhotos)) f.heroPhotos = b.heroPhotos.filter(okUrl).slice(0, 5);
  if ('background' in b) f.background = okUrl(b.background || '') ? b.background : '';
  db.save('family'); event('family', null); ok(res, f);
});
route('GET', '/api/tv/go/:i', async (req, res, s, p) => {
  const srv = TV_SERVERS[Number(p.i)]; if (!srv) return fail(res, 404, 'Serveur inconnu');
  res.writeHead(302, { Location: srv.url, 'Cache-Control': 'no-store' }); res.end();
});

// Appareils
route('GET', '/api/devices', async (req, res, s) => {
  const online = new Set([...clients.values()].map((c) => c.deviceId));
  const out = Object.values(sessions).map((x) => ({ id: x.deviceId, name: x.deviceName, kind: x.kind, memberId: x.memberId, lastSeen: x.lastSeen, online: online.has(x.deviceId), settings: x.settings || {} }));
  ok(res, out);
});
route('PATCH', '/api/devices/:id', async (req, res, s, p) => {
  const b = await readJson(req);
  for (const x of Object.values(sessions)) if (x.deviceId === p.id) {
    if (x.memberId && x.memberId !== s.memberId && !s.member?.admin && s.deviceId !== p.id) return fail(res, 403, 'Interdit');
    if (b.name) x.deviceName = clip(b.name, 60);
    x.settings = { ...(x.settings || {}), ...(b.settings || {}) };
  }
  db.save('sessions');
  for (const c of clients.values()) if (c.deviceId === p.id) { c.deviceName = b.name || c.deviceName; sendWs(c, { t: 'event', type: 'device:settings', payload: b.settings || {} }); }
  presence();
  ok(res);
});
route('DELETE', '/api/devices/:id', async (req, res, s, p) => {
  if (!s.member) return fail(res, 403, 'Interdit');
  for (const [t, x] of Object.entries(sessions)) if (x.deviceId === p.id && (x.memberId === s.memberId || !x.memberId || s.member.admin)) delete sessions[t];
  db.save('sessions');
  for (const c of clients.values()) if (c.deviceId === p.id) c.ws.close(4001, 'revoked');
  ok(res);
});

// ---------------- Appairage TV par QR (jeton temporaire, aléatoire, usage unique)
const pairings = new Map(); // token -> { secret, deviceName, kind, expiresAt, approvedBy }
setInterval(() => { for (const [t, p] of pairings) if (p.expiresAt < now()) pairings.delete(t); }, 30000).unref();
route('POST', '/api/pair/start', async (req, res) => {
  if (pairings.size > 200) return fail(res, 429, 'Trop de demandes');
  const b = await readJson(req);
  const token = db.token(18); const secret = db.token(24);
  pairings.set(token, { secret, deviceName: clip(b.deviceName || 'Télévision', 60), kind: b.kind === 'desktop' ? 'desktop' : 'tv', expiresAt: now() + PAIR_TTL, approvedBy: null });
  ok(res, { token, secret, expiresAt: now() + PAIR_TTL });
}, { public: true });
route('GET', '/api/pair/info/:token', async (req, res, s, p) => {
  const pr = pairings.get(p.token);
  if (!pr || pr.expiresAt < now()) return fail(res, 410, 'Code expiré ou déjà utilisé');
  ok(res, { deviceName: pr.deviceName, kind: pr.kind, expiresAt: pr.expiresAt });
});
route('POST', '/api/pair/approve', async (req, res, s) => {
  if (!s.member) return fail(res, 403, 'Seul un membre peut autoriser un appareil');
  const b = await readJson(req);
  const pr = pairings.get(b.token);
  if (!pr || pr.expiresAt < now()) return fail(res, 410, 'Code expiré ou déjà utilisé');
  pr.approvedBy = s.memberId; if (b.deviceName) pr.deviceName = clip(b.deviceName, 60);
  ok(res);
});
route('POST', '/api/pair/claim', async (req, res) => {
  const b = await readJson(req);
  const pr = pairings.get(b.token);
  if (!pr || pr.expiresAt < now()) return fail(res, 410, 'expired');
  const a = Buffer.from(String(b.secret || '')); const e = Buffer.from(pr.secret);
  if (a.length !== e.length || !crypto.timingSafeEqual(a, e)) return fail(res, 403, 'forbidden');
  if (!pr.approvedBy) return ok(res, { status: 'pending' });
  pairings.delete(b.token); // usage unique
  const t = createSession({ memberId: null, pairedBy: pr.approvedBy, deviceName: pr.deviceName, kind: pr.kind });
  setCookie(req, res, t);
  notify(pr.approvedBy, `a connecté « ${pr.deviceName} » à Belcram Family`, null);
  ok(res, { status: 'approved' });
}, { public: true });

route('GET', '/api/qr', async (req, res) => {
  const text = clip(new URL(req.url, 'http://x').searchParams.get('text'), 600);
  const svg = await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1b1024', light: '#ffffff' } });
  send(res, 200, svg, { 'Content-Type': 'image/svg+xml' });
}, { public: true });

route('GET', '/api/ice', async (req, res) => {
  const ice = [{ urls: (process.env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302').split(',') }];
  if (process.env.TURN_URL) ice.push({ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USER, credential: process.env.TURN_PASS });
  ok(res, ice);
});

// ---------------- Téléversement
route('POST', '/api/upload', async (req, res, s) => {
  if (!s.member) return fail(res, 403, 'Interdit');
  const mime = String(req.headers['content-type'] || '').split(';')[0].trim();
  const ext = EXT_BY_MIME[mime] || path.extname(String(req.headers['x-filename'] || '')).toLowerCase();
  if (!ext || !MIME[ext] || /html|svg|javascript/.test(MIME[ext])) return fail(res, 415, 'Type de fichier non pris en charge');
  const name = db.id() + ext;
  const dest = path.join(db.UPLOAD_DIR, name);
  let size = 0; const out = fs.createWriteStream(dest);
  req.on('data', (c) => { size += c.length; if (size > MAX_UPLOAD) { req.destroy(); out.destroy(); fs.unlink(dest, () => {}); } });
  req.pipe(out);
  out.on('finish', () => ok(res, { url: '/media/' + name, mime: MIME[ext], size }));
  out.on('error', () => fail(res, 500, 'Erreur d\'écriture'));
});

// ---------------- Fil familial / publications
route('GET', '/api/feed', async (req, res) => ok(res, feedItems().slice(0, 80)));

route('GET', '/api/posts', async (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams;
  let posts = db.list('posts').slice().sort((a, b) => b.createdAt - a.createdAt);
  if (q.get('type')) posts = posts.filter((p) => q.get('type').split(',').includes(p.type));
  if (q.get('person')) posts = posts.filter((p) => p.authorId === q.get('person') || (p.people || []).includes(q.get('person')));
  if (q.get('album')) { const al = db.get('albums', q.get('album')); posts = posts.filter((p) => al?.postIds.includes(p.id)); }
  if (q.get('year')) posts = posts.filter((p) => new Date(p.takenAt || p.createdAt).getFullYear() === Number(q.get('year')));
  if (q.get('event')) posts = posts.filter((p) => (p.event || '').toLowerCase() === q.get('event').toLowerCase());
  ok(res, posts);
});
route('POST', '/api/posts', async (req, res, s) => {
  if (!s.member) return fail(res, 403, 'Interdit');
  const b = await readJson(req);
  const type = ['text', 'photo', 'video', 'audio'].includes(b.type) ? b.type : 'text';
  if (type !== 'text' && !/^\/media\/[\w-]+\.\w+$/.test(b.mediaUrl || '')) return fail(res, 400, 'Média manquant');
  if (type === 'text' && !String(b.text || '').trim()) return fail(res, 400, 'Message vide');
  const p = db.insert('posts', {
    id: db.id('p_'), type, authorId: s.memberId, text: clip(b.text, 5000), mediaUrl: b.mediaUrl || '', duration: Number(b.duration) || 0,
    people: Array.isArray(b.people) ? b.people.slice(0, 20).map((x) => clip(x, 40)) : [], event: clip(b.event, 80),
    takenAt: Number(b.takenAt) || now(), createdAt: now(), reactions: {}, comments: [],
  });
  if (Array.isArray(b.albumIds)) for (const aid of b.albumIds) { const al = db.get('albums', aid); if (al) { al.postIds.push(p.id); db.save('albums'); } }
  const verbs = { text: 'a publié un message', photo: 'a ajouté une photo', video: 'a envoyé une vidéo', audio: 'a envoyé un vocal' };
  event('post:new', p);
  notify(s.memberId, verbs[type], { kind: 'post', id: p.id, type, mediaUrl: p.mediaUrl });
  ok(res, p);
});
route('GET', '/api/posts/:id', async (req, res, s, p) => { const post = db.get('posts', p.id); post ? ok(res, post) : fail(res, 404, 'Introuvable'); });
route('PATCH', '/api/posts/:id', async (req, res, s, p) => {
  const post = db.get('posts', p.id); if (!post) return fail(res, 404, 'Introuvable');
  if (!s.member) return fail(res, 403, 'Interdit');
  const b = await readJson(req); const patch = {};
  if (Array.isArray(b.people)) patch.people = b.people.slice(0, 20).map((x) => clip(x, 40));
  if ('event' in b) patch.event = clip(b.event, 80);
  if ('text' in b && (post.authorId === s.memberId || s.member.admin)) patch.text = clip(b.text, 5000);
  ok(res, db.update('posts', p.id, patch));
  event('post:update', post);
});
route('DELETE', '/api/posts/:id', async (req, res, s, p) => {
  const post = db.get('posts', p.id); if (!post) return fail(res, 404, 'Introuvable');
  if (post.authorId !== s.memberId && !s.member?.admin) return fail(res, 403, 'Interdit');
  db.remove('posts', p.id); event('post:delete', { id: p.id }); ok(res);
});

// Réactions et commentaires (publications, messages, Apéro Time, capsules)
const REACTABLE = { post: 'posts', msg: 'messages', aperotime: 'aperotimes', capsule: 'capsules' };
const EMOJIS = ['❤️', '😂', '👏', '🥂'];
route('POST', '/api/react', async (req, res, s) => {
  if (!s.member) return fail(res, 403, 'Interdit');
  const b = await readJson(req);
  const coll = REACTABLE[b.kind]; const item = coll && db.get(coll, b.id);
  if (!item || !EMOJIS.includes(b.emoji)) return fail(res, 400, 'Réaction invalide');
  item.reactions = item.reactions || {};
  if (item.reactions[s.memberId] === b.emoji) delete item.reactions[s.memberId]; else item.reactions[s.memberId] = b.emoji;
  db.save(coll);
  event('react', { kind: b.kind, id: b.id, reactions: item.reactions, by: s.memberId, emoji: item.reactions[s.memberId] || null });
  ok(res, item.reactions);
});
route('POST', '/api/comments', async (req, res, s) => {
  if (!s.member) return fail(res, 403, 'Interdit');
  const b = await readJson(req);
  const coll = REACTABLE[b.kind]; const item = coll && db.get(coll, b.id);
  if (!item) return fail(res, 404, 'Introuvable');
  const mediaType = ['audio', 'video', 'photo'].includes(b.mediaType) ? b.mediaType : '';
  if (mediaType && !/^\/media\/[\w-]+\.\w+$/.test(b.mediaUrl || '')) return fail(res, 400, 'Média invalide');
  if (!mediaType && !String(b.text || '').trim()) return fail(res, 400, 'Commentaire vide');
  const c = { id: db.id('c_'), authorId: s.memberId, text: clip(b.text, 3000), mediaUrl: mediaType ? b.mediaUrl : '', mediaType, createdAt: now() };
  item.comments = item.comments || []; item.comments.push(c); db.save(coll);
  event('comment', { kind: b.kind, id: b.id, comment: c });
  if (item.authorId && item.authorId !== s.memberId) notify(s.memberId, mediaType === 'audio' ? 'a répondu par un vocal' : mediaType === 'video' ? 'a répondu en vidéo' : 'a commenté', { kind: b.kind, id: b.id });
  ok(res, c);
});

// ---------------- Albums et semaines
route('GET', '/api/albums', async (req, res) => ok(res, db.list('albums')));
route('POST', '/api/albums', async (req, res, s) => {
  if (!s.member) return fail(res, 403, 'Interdit');
  const b = await readJson(req);
  const title = clip(b.title, 80).trim(); if (!title) return fail(res, 400, 'Titre requis');
  const al = db.insert('albums', { id: db.id('a_'), title, createdBy: s.memberId, createdAt: now(), postIds: Array.isArray(b.postIds) ? b.postIds.slice(0, 2000) : [] });
  event('albums', null); ok(res, al);
});
route('PATCH', '/api/albums/:id', async (req, res, s, p) => {
  const al = db.get('albums', p.id); if (!al || !s.member) return fail(res, 404, 'Introuvable');
  const b = await readJson(req);
  if (b.title) al.title = clip(b.title, 80);
  if (Array.isArray(b.add)) for (const x of b.add) if (!al.postIds.includes(x)) al.postIds.push(x);
  if (Array.isArray(b.remove)) al.postIds = al.postIds.filter((x) => !b.remove.includes(x));
  db.save('albums'); event('albums', null); ok(res, al);
});
route('DELETE', '/api/albums/:id', async (req, res, s, p) => {
  const al = db.get('albums', p.id); if (!al) return fail(res, 404, 'Introuvable');
  if (al.createdBy !== s.memberId && !s.member?.admin) return fail(res, 403, 'Interdit');
  db.remove('albums', p.id); event('albums', null); ok(res);
});

route('GET', '/api/weeks', async (req, res) => {
  const saved = db.obj('weeks'); const counts = {};
  for (const i of feedItems()) { const k = weekKey(i.at); counts[k] = (counts[k] || 0) + 1; }
  const current = weekKey(now());
  const keys = new Set([current, ...Object.keys(counts), ...Object.keys(saved)]);
  ok(res, [...keys].sort().reverse().map((k) => ({ key: k, count: counts[k] || 0, saved: !!saved[k]?.saved, title: saved[k]?.title || '', current: k === current })));
});
route('GET', '/api/weeks/:key', async (req, res, s, p) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.key)) return fail(res, 400, 'Semaine invalide');
  const saved = db.obj('weeks')[p.key] || {};
  const items = weekItems(p.key);
  const order = saved.order || [];
  items.sort((a, b) => { const ia = order.indexOf(a.id), ib = order.indexOf(b.id); return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib) || a.at - b.at; });
  ok(res, { key: p.key, title: saved.title || '', saved: !!saved.saved, excluded: saved.excluded || [], items });
});
route('PUT', '/api/weeks/:key', async (req, res, s, p) => {
  if (!s.member || !/^\d{4}-\d{2}-\d{2}$/.test(p.key)) return fail(res, 400, 'Semaine invalide');
  const b = await readJson(req); const weeks = db.obj('weeks');
  weeks[p.key] = { title: clip(b.title, 120), excluded: Array.isArray(b.excluded) ? b.excluded : [], order: Array.isArray(b.order) ? b.order : [], saved: !!b.saved, savedBy: s.memberId, savedAt: now() };
  db.save('weeks'); ok(res, weeks[p.key]);
});

// ---------------- Discussion
route('GET', '/api/messages', async (req, res) => {
  const before = Number(new URL(req.url, 'http://x').searchParams.get('before')) || Infinity;
  const msgs = db.list('messages').filter((m) => m.createdAt < before);
  ok(res, msgs.slice(-80));
});
route('POST', '/api/messages', async (req, res, s) => {
  if (!s.member) return fail(res, 403, 'Interdit');
  const b = await readJson(req);
  const type = ['text', 'audio', 'photo', 'video'].includes(b.type) ? b.type : 'text';
  if (type !== 'text' && !/^\/media\/[\w-]+\.\w+$/.test(b.mediaUrl || '')) return fail(res, 400, 'Média manquant');
  if (type === 'text' && !String(b.text || '').trim()) return fail(res, 400, 'Message vide');
  const m = db.insert('messages', { id: db.id('m_'), type, authorId: s.memberId, text: clip(b.text, 4000), mediaUrl: b.mediaUrl || '', duration: Number(b.duration) || 0, createdAt: now(), reactions: {} });
  event('msg:new', m); ok(res, m);
});

// ---------------- Apéro Time
route('GET', '/api/aperotimes', async (req, res, s) => {
  ok(res, db.list('aperotimes').filter((a) => visibleAt(s, a)).map(atSummary).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt));
});
route('GET', '/api/aperotimes/:id', async (req, res, s, p) => {
  const at = db.get('aperotimes', p.id);
  if (!at || !visibleAt(s, at)) return fail(res, 404, 'Introuvable');
  const { versions, ...rest } = at;
  ok(res, { ...rest, versionCount: (versions || []).length });
});
route('POST', '/api/aperotimes', async (req, res, s) => {
  if (!isAuthor(s) && !s.member?.admin) return fail(res, 403, 'Seul l\'auteur des Apéro Time peut écrire');
  const b = await readJson(req);
  const at = db.insert('aperotimes', {
    id: db.id('at_'), number: null, date: clip(b.date || new Date().toISOString().slice(0, 10), 10), title: clip(b.title || 'Apéro Time', 300), text: clip(b.text, 60000),
    links: [], status: 'draft', publishAt: null, authorId: s.memberId, postedBy: s.member.name, rewriteOf: null,
    createdAt: now(), updatedAt: now(), publishedAt: null, versions: [], reactions: {}, comments: [],
  });
  ok(res, at);
});
function extractLinks(text) { return [...new Set(String(text).match(/https?:\/\/[^\s)»"]+/g) || [])]; }
route('PUT', '/api/aperotimes/:id', async (req, res, s, p) => {
  const at = db.get('aperotimes', p.id); if (!at) return fail(res, 404, 'Introuvable');
  if (!canEditAt(s, at)) return fail(res, 403, 'Interdit');
  const b = await readJson(req);
  const last = at.versions[at.versions.length - 1];
  const changed = (b.text != null && b.text !== at.text) || (b.title != null && b.title !== at.title);
  // Version : sur demande explicite, ou automatiquement toutes les 10 minutes d'édition
  if (changed && (b.snapshot || !last || now() - last.at > 10 * 60000)) at.versions.push({ at: now(), by: s.memberId, title: at.title, text: at.text, label: clip(b.label || '', 80) });
  if (b.text != null) { at.text = clip(b.text, 60000); at.links = extractLinks(at.text); }
  if (b.title != null) at.title = clip(b.title, 300);
  if (b.date && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) at.date = b.date;
  at.updatedAt = now(); db.save('aperotimes');
  if (at.status === 'published') event('at:update', atSummary(at));
  ok(res, { ...at, versions: undefined, versionCount: at.versions.length });
});
route('GET', '/api/aperotimes/:id/versions', async (req, res, s, p) => {
  const at = db.get('aperotimes', p.id); if (!at || !canEditAt(s, at)) return fail(res, 404, 'Introuvable');
  ok(res, at.versions.map((v, i) => ({ index: i, ...v })).reverse());
});
function publishAt(at) {
  at.status = 'published'; at.publishedAt = now(); at.publishAt = null;
  if (!at.number) at.number = Math.max(0, ...db.list('aperotimes').map((x) => x.number || 0)) + 1;
  db.save('aperotimes');
  event('at:published', atSummary(at));
  notify(at.authorId, `a publié l'Apéro Time « ${at.title.slice(0, 60)} »`, { kind: 'aperotime', id: at.id });
}
route('POST', '/api/aperotimes/:id/publish', async (req, res, s, p) => {
  const at = db.get('aperotimes', p.id); if (!at) return fail(res, 404, 'Introuvable');
  if (!canEditAt(s, at)) return fail(res, 403, 'Interdit');
  const b = await readJson(req);
  at.versions.push({ at: now(), by: s.memberId, title: at.title, text: at.text, label: b.when ? 'Programmation' : 'Publication' });
  if (b.when) {
    const when = Date.parse(b.when); if (!when || when < now()) return fail(res, 400, 'Date de programmation invalide');
    at.status = 'scheduled'; at.publishAt = when; db.save('aperotimes');
  } else publishAt(at);
  ok(res, { status: at.status, publishAt: at.publishAt });
});
route('POST', '/api/aperotimes/:id/unpublish', async (req, res, s, p) => {
  const at = db.get('aperotimes', p.id); if (!at || !canEditAt(s, at)) return fail(res, 404, 'Introuvable');
  at.status = 'draft'; at.publishAt = null; db.save('aperotimes'); event('at:update', atSummary(at)); ok(res);
});
route('DELETE', '/api/aperotimes/:id', async (req, res, s, p) => {
  const at = db.get('aperotimes', p.id); if (!at || !canEditAt(s, at)) return fail(res, 404, 'Introuvable');
  if (at.status === 'published') return fail(res, 400, 'Dépubliez avant de supprimer');
  db.remove('aperotimes', p.id); ok(res);
});

// Annotations (ne modifient jamais le texte original)
const ANN_KINDS = ['highlight', 'underline', 'comment', 'circle', 'arrow', 'draw', 'note'];
route('GET', '/api/aperotimes/:id/annotations', async (req, res, s, p) => ok(res, db.list('annotations').filter((a) => a.atId === p.id)));
route('POST', '/api/annotations', async (req, res, s) => {
  if (!s.member) return fail(res, 403, 'Interdit');
  const b = await readJson(req, 512 * 1024);
  const at = db.get('aperotimes', b.atId); if (!at || !visibleAt(s, at)) return fail(res, 404, 'Apéro Time introuvable');
  if (!ANN_KINDS.includes(b.kind)) return fail(res, 400, 'Type invalide');
  const a = { id: db.id('an_'), atId: b.atId, authorId: s.memberId, kind: b.kind, createdAt: now(), hidden: false, inBook: false, note: clip(b.note, 2000) };
  if (b.range) a.range = { start: Math.max(0, b.range.start | 0), end: Math.max(0, b.range.end | 0), quote: clip(b.range.quote, 500) };
  if (b.shape) {
    const pts = Array.isArray(b.shape.points) ? b.shape.points.slice(0, 4000).map((q) => [Math.round(+q[0] * 10) / 10, Math.round(+q[1] * 10) / 10]) : [];
    a.shape = { page: b.shape.page | 0, points: pts, width: Math.min(20, Math.max(1, +b.shape.width || 4)) };
  }
  db.insert('annotations', a);
  event('ann:new', a);
  if (at.authorId !== s.memberId) notify(s.memberId, `a annoté « ${at.title.slice(0, 50)} »`, { kind: 'aperotime', id: at.id });
  ok(res, a);
});
route('PATCH', '/api/annotations/:id', async (req, res, s, p) => {
  const a = db.get('annotations', p.id); if (!a) return fail(res, 404, 'Introuvable');
  const at = db.get('aperotimes', a.atId);
  if (a.authorId !== s.memberId && !(at && canEditAt(s, at))) return fail(res, 403, 'Interdit');
  const b = await readJson(req);
  for (const k of ['hidden', 'inBook']) if (k in b) a[k] = !!b[k];
  if ('note' in b && a.authorId === s.memberId) a.note = clip(b.note, 2000);
  db.save('annotations'); event('ann:update', a); ok(res, a);
});
route('DELETE', '/api/annotations/:id', async (req, res, s, p) => {
  const a = db.get('annotations', p.id); if (!a) return fail(res, 404, 'Introuvable');
  const at = db.get('aperotimes', a.atId);
  if (a.authorId !== s.memberId && !(at && canEditAt(s, at))) return fail(res, 403, 'Interdit');
  db.remove('annotations', p.id); event('ann:delete', { id: a.id, atId: a.atId }); ok(res);
});

// ---------------- Capsules temporelles
route('GET', '/api/capsules', async (req, res) => ok(res, db.list('capsules').slice().sort((a, b) => a.unlockAt - b.unlockAt).map(capsuleView)));
route('POST', '/api/capsules', async (req, res, s) => {
  if (!s.member) return fail(res, 403, 'Interdit');
  const b = await readJson(req);
  const unlockAt = Date.parse(b.unlockAt); if (!unlockAt || unlockAt <= now()) return fail(res, 400, 'La date d\'ouverture doit être dans le futur');
  const mediaType = ['photo', 'video', 'audio'].includes(b.mediaType) ? b.mediaType : '';
  if (mediaType && !/^\/media\/[\w-]+\.\w+$/.test(b.mediaUrl || '')) return fail(res, 400, 'Média invalide');
  const c = db.insert('capsules', { id: db.id('cap_'), title: clip(b.title || 'Capsule', 120), authorId: s.memberId, unlockAt, text: clip(b.text, 20000), mediaUrl: mediaType ? b.mediaUrl : '', mediaType, createdAt: now(), opened: false, reactions: {}, comments: [] });
  event('capsule:new', capsuleView(c));
  notify(s.memberId, `a scellé une capsule temporelle jusqu'au ${new Date(unlockAt).toLocaleDateString('fr-FR')}`, { kind: 'capsule', id: c.id });
  ok(res, capsuleView(c));
});

// ---------------- Interphone
route('POST', '/api/intercom', async (req, res, s) => {
  if (!s.member) return fail(res, 403, 'Interdit');
  const b = await readJson(req);
  if (!/^\/media\/[\w-]+\.\w+$/.test(b.mediaUrl || '')) return fail(res, 400, 'Message vocal manquant');
  const targets = new Set(Array.isArray(b.targets) ? b.targets : []);
  const msg = { id: db.id('ic_'), from: s.memberId, fromDevice: s.deviceName, mediaUrl: b.mediaUrl, text: clip(b.text, 200), duration: Number(b.duration) || 0, at: now() };
  let delivered = 0;
  for (const c of clients.values()) if (targets.has(c.deviceId)) { sendWs(c, { t: 'event', type: 'intercom', payload: msg }); delivered++; }
  ok(res, { delivered });
});

// ---------------- Cadre familial (TV au repos)
route('GET', '/api/frame', async (req, res) => {
  const items = [];
  const posts = db.list('posts').slice().sort((a, b) => b.createdAt - a.createdAt);
  for (const p of posts.slice(0, 120)) if (p.type === 'photo' || p.type === 'video') items.push({ type: p.type, mediaUrl: p.mediaUrl, text: p.text, authorId: p.authorId, at: p.createdAt, id: p.id });
  for (const p of posts.filter((x) => x.type === 'text').slice(0, 10)) items.push({ type: 'message', text: p.text, authorId: p.authorId, at: p.createdAt, id: p.id });
  const ats = db.list('aperotimes').filter((a) => a.status === 'published');
  for (let i = 0; i < Math.min(8, ats.length); i++) {
    const a = ats[Math.floor(Math.random() * ats.length)];
    const paras = a.text.split(/\n\s*\n|\n/).map((x) => x.trim()).filter((x) => x.length > 80 && x.length < 420);
    if (paras.length) items.push({ type: 'aperotime', id: a.id, title: a.title, date: a.date, text: paras[Math.floor(Math.random() * paras.length)], authorId: a.authorId });
  }
  for (const c of db.list('capsules').filter((x) => x.opened).slice(-5)) items.push({ type: 'capsule', title: c.title, text: c.text, mediaUrl: c.mediaUrl, mediaType: c.mediaType, authorId: c.authorId, id: c.id });
  const today = new Date();
  for (const m of db.list('members')) if (m.birthday) {
    const [, mm, dd] = m.birthday.split('-').map(Number);
    let next = new Date(today.getFullYear(), mm - 1, dd); if (next < new Date(today.getFullYear(), today.getMonth(), today.getDate())) next = new Date(today.getFullYear() + 1, mm - 1, dd);
    const days = Math.round((next - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
    if (days <= 14) items.push({ type: 'birthday', memberId: m.id, days });
  }
  ok(res, items.sort(() => Math.random() - 0.5));
});

// ---------------------------------------------------------------- planificateur
function tick() {
  for (const at of db.list('aperotimes')) if (at.status === 'scheduled' && at.publishAt && at.publishAt <= now()) publishAt(at);
  for (const c of db.list('capsules')) if (!c.opened && c.unlockAt <= now()) {
    c.opened = true; db.save('capsules');
    event('capsule:open', c);
  }
}
setInterval(tick, 15000).unref();

// ---------------------------------------------------------------- serveur HTTP
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), fullscreen=(self)');
  try {
    if (pathname.startsWith('/api/')) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(pathname); if (!m) continue;
        const params = {}; r.keys.forEach((k, i) => { params[k] = m[i + 1]; });
        const s = sessionOf(req);
        if (!r.opts.public && !s) return fail(res, 401, 'Non connecté');
        return await r.handler(req, res, s, params);
      }
      return fail(res, 404, 'Route inconnue');
    }
    if (pathname.startsWith('/media/')) {
      if (!sessionOf(req)) return fail(res, 401, 'Non connecté');
      const name = path.basename(pathname);
      return serveFile(req, res, path.join(db.UPLOAD_DIR, name), 'private, max-age=31536000, immutable');
    }
    let file = path.normalize(path.join(PUBLIC_DIR, pathname));
    if (!file.startsWith(PUBLIC_DIR)) return fail(res, 403, 'Interdit');
    if (pathname === '/' || !path.extname(pathname)) file = path.join(PUBLIC_DIR, 'index.html');
    return serveFile(req, res, file, pathname.endsWith('.html') || pathname === '/' || !path.extname(pathname) ? 'no-cache' : 'public, max-age=300');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) fail(res, 500, 'Erreur serveur');
  }
});

// ---------------------------------------------------------------- WebSocket
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://x').pathname !== '/ws') return socket.destroy();
  const s = sessionOf(req);
  if (!s) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return socket.destroy(); }
  wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, s));
});

function onConnection(ws, s) {
  const c = { id: db.id('c'), ws, memberId: s.memberId, deviceId: s.deviceId, deviceName: s.deviceName, kind: s.kind, rooms: new Set(), meta: {}, alive: true };
  clients.set(c.id, c);
  sendWs(c, { t: 'welcome', clientId: c.id, settings: sessions[s.token]?.settings || {} });
  presence();
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch (_) { return; }
    if (!sessions[s.token]) return ws.close(4001, 'revoked');
    switch (m.t) {
      case 'join': {
        const room = clip(m.room, 80); if (!room) return;
        c.rooms.add(room); c.meta = { ...c.meta, [room]: m.meta || {} };
        sendWs(c, { t: 'joined', room, peers: roomPeers(room, c.id).map(clientInfo), state: roomState.get(room) || null });
        for (const o of roomPeers(room, c.id)) sendWs(o, { t: 'peer-join', room, peer: clientInfo(c) });
        if (room.startsWith('call:')) presence();
        break;
      }
      case 'leave': leaveRoom(c, m.room); break;
      case 'room': // relais vers les autres membres de la salle
        if (!c.rooms.has(m.room)) return;
        if (m.state) roomState.set(m.room, { ...(roomState.get(m.room) || {}), ...m.data });
        for (const o of roomPeers(m.room, c.id)) sendWs(o, { t: 'room', room: m.room, from: clientInfo(c), data: m.data });
        break;
      case 'signal': { // signalisation WebRTC point à point
        const o = clients.get(m.to); if (!o || !c.rooms.has(m.room) || !o.rooms.has(m.room)) return;
        sendWs(o, { t: 'signal', room: m.room, from: c.id, data: m.data });
        break;
      }
      case 'tv': // télécommande / « afficher sur la TV »
        for (const o of clients.values()) if (o.deviceId === m.toDevice) sendWs(o, { t: 'tv', from: clientInfo(c), cmd: m.cmd });
        break;
      case 'invite': // invitation à un appel
        for (const o of clients.values()) if (o.id !== c.id && (!m.members || m.members.includes(o.memberId))) sendWs(o, { t: 'event', type: 'call:invite', payload: { room: clip(m.room, 80), from: clientInfo(c) } });
        break;
      default: break;
    }
  });
  ws.on('close', () => {
    for (const room of [...c.rooms]) leaveRoom(c, room);
    clients.delete(c.id);
    presence();
  });
}
function leaveRoom(c, room) {
  if (!c.rooms.delete(room)) return;
  for (const o of roomPeers(room, c.id)) sendWs(o, { t: 'peer-leave', room, clientId: c.id });
  if (!roomPeers(room).length && !room.startsWith('at:')) roomState.delete(room);
  if (room.startsWith('call:')) presence();
}
setInterval(() => { for (const c of clients.values()) { if (!c.alive) { c.ws.terminate(); continue; } c.alive = false; c.ws.ping(); } }, 30000).unref();

process.on('SIGINT', () => { db.flushAll(); process.exit(0); });
process.on('SIGTERM', () => { db.flushAll(); process.exit(0); });

server.listen(PORT, () => console.log(`[blc-family] http://localhost:${PORT}`));
