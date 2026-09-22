// BLC Family — démarrage, routage, couche globale (notifications, TV, interphone, appels).
import { state, api, h, $, $$, bus, toast, avatar, member, overlay, audioPlayer, confetti, kindIcon, info } from './core.js';
import * as rt from './rt.js';

// ---------------------------------------------------------------- type d'appareil
const qs = new URLSearchParams(location.search);
if (qs.get('tv') === '1' || qs.get('tv') === 'vertical') { localStorage.setItem('blcf.kind', 'tv'); if (qs.get('tv') === 'vertical') localStorage.setItem('blcf.orient', 'portrait'); }
function guessKind() {
  const saved = localStorage.getItem('blcf.kind'); if (saved) return saved;
  const ua = navigator.userAgent;
  if (/SmartTV|SMART-TV|Tizen|Web0S|webOS|NetCast|BRAVIA|AFT\w|Android TV|GoogleTV|HbbTV|CrKey/i.test(ua)) return 'tv';
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && Math.min(screen.width, screen.height) < 600) return 'phone';
  if (touch) return 'tablet';
  return 'desktop';
}
export const deviceKind = guessKind();
document.body.classList.add('k-' + deviceKind);
function applyOrientation() {
  const forced = localStorage.getItem('blcf.orient');
  const portrait = forced ? forced === 'portrait' : matchMedia('(orientation: portrait)').matches;
  document.body.classList.toggle('portrait', portrait);
}
applyOrientation(); addEventListener('resize', applyOrientation);
export const isTV = deviceKind === 'tv';

// ---------------------------------------------------------------- routage
const ROUTES = [
  [/^\/?$/, () => import('./views/home.js')],
  [/^\/aperotime\/?$/, () => import('./views/aperotime.js')],
  [/^\/aperotime\/livre$/, () => import('./views/book.js')],
  [/^\/at\/([\w-]+)$/, () => import('./views/reader.js'), ['id']],
  [/^\/at\/([\w-]+)\/edit$/, () => import('./views/editor.js'), ['id']],
  [/^\/ecrire$/, () => import('./views/editor.js')],
  [/^\/galerie\/?$/, () => import('./views/gallery.js')],
  [/^\/semaine\/([\d-]+)$/, () => import('./views/week.js'), ['key']],
  [/^\/chat$/, () => import('./views/chat.js')],
  [/^\/appel$/, () => import('./views/callhome.js')],
  [/^\/cam\/([^/]+)\/([\w-]+)$/, () => import('./views/cam.js'), ['room', 'device']],
  [/^\/interphone$/, () => import('./views/intercom.js')],
  [/^\/capsules$/, () => import('./views/capsules.js')],
  [/^\/parametres$/, () => import('./views/settings.js')],
  [/^\/pair\/([\w-]+)$/, () => import('./views/pair.js'), ['token']],
  [/^\/remote$/, () => import('./views/remote.js')],
  [/^\/famille$/, () => import('./views/famille.js')],
  [/^\/calendrier$/, () => import('./views/calendrier.js')],
  [/^\/aide$/, () => import('./views/aide.js')],
  [/^\/p\/([\w-]+)$/, () => import('./views/home.js'), ['post']],
];
let cleanup = null;
let routeSeq = 0;
async function router() {
  const path = location.hash.replace(/^#/, '') || '/';
  const seq = ++routeSeq;
  for (const [re, load, keys = []] of ROUTES) {
    const m = re.exec(path.split('?')[0]); if (!m) continue;
    const params = {}; keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    const mod = await load();
    if (seq !== routeSeq) return;
    try { cleanup?.(); } catch (_) {}
    cleanup = null;
    const root = $('#view'); root.replaceChildren(); window.scrollTo(0, 0);
    renderTopbar(path);
    try { cleanup = (await mod.default(root, params)) || null; } catch (e) { console.error(e); root.append(h('div.glass.card', h('h2', 'Oups'), h('p', e.message))); }
    if (isTV) setTimeout(() => { if (!document.activeElement || document.activeElement === document.body || !root.contains(document.activeElement)) focusables(root)[0]?.focus(); }, 120);
    return;
  }
  location.hash = '#/';
}
export const go = (hash) => { if (location.hash === hash) router(); else location.hash = hash; };

// ---------------------------------------------------------------- barre du haut
function renderTopbar(path) {
  const bar = $('#topbar');
  const home = path === '/' || path === '';
  document.body.classList.toggle('on-home', home);
  if (home) { bar.replaceChildren(); return; } // l'accueil a son propre en-tête
  const online = [...new Set(state.presence.map((c) => c.memberId).filter(Boolean))];
  bar.replaceChildren(
    home ? null : h('a.icon-btn.back', { href: '#/', 'aria-label': 'Accueil', 'data-focus': '' }, '←'),
    h('a.brand', { href: '#/' }, h('span.brand-script', 'Belcram'), h('small', 'Family ♡')),
    h('div.spacer'),
    h('div.presence', { title: 'En ligne' }, online.slice(0, 6).map((id) => avatar(id, 's', true))),
    !isTV && state.me ? h('a.icon-btn', { href: '#/remote', title: 'Télécommande TV', 'aria-label': 'Télécommande TV' }, '🎮') : null,
    state.me ? h('a.icon-btn', { href: '#/parametres', title: 'Paramètres', 'aria-label': 'Paramètres', 'data-focus': '' }, '⚙️') : h('a.icon-btn', { href: '#/parametres', 'aria-label': 'Paramètres', 'data-focus': '' }, '⚙️'),
  );
}
bus.on('presence', () => renderTopbar(location.hash.replace(/^#/, '') || '/'));

// ---------------------------------------------------------------- navigation spatiale (télécommande)
function focusables(root = document) {
  const layer = $('#overlay-root').lastElementChild || $('.slideshow') || $('.watch-layer') || null;
  const scope = layer || root;
  return $$('a[href], button:not([disabled]), [data-focus], input, textarea, select, [tabindex]:not([tabindex="-1"])', scope)
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; });
}
function moveFocus(dir) {
  const cur = document.activeElement;
  const list = focusables();
  if (!cur || cur === document.body || !list.includes(cur)) { list[0]?.focus(); return; }
  const a = cur.getBoundingClientRect(); const ac = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
  let best = null; let bestScore = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect(); const bc = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    const dx = bc.x - ac.x; const dy = bc.y - ac.y;
    const ok = { left: dx < -4, right: dx > 4, up: dy < -4, down: dy > 4 }[dir];
    if (!ok) continue;
    const main = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy);
    const cross = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = main + cross * 2.5;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) { best.focus({ preventScroll: true }); best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }
}
function pressKey(key) {
  bus.emit('key', key);
  const el = document.activeElement;
  if (key === 'ok') { el?.click(); return; }
  if (key === 'back') { const x = $('#overlay-root .close-x:last-of-type') || $('.slideshow .close-ss'); if (x) x.click(); else if (location.hash && location.hash !== '#/') history.back(); return; }
  if (key === 'home') { go('#/'); return; }
  if (key === 'playpause') { const v = $('#overlay-root video, .watch-layer video, main video'); if (v) v.paused ? v.play() : v.pause(); return; }
  const arrows = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  if (arrows[key]) (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: arrows[key], bubbles: true, cancelable: true }));
}
document.addEventListener('keydown', (e) => {
  bus.emit('activity');
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (typing) return;
  const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  if (map[e.key] && isTV && !e.defaultPrevented) { e.preventDefault(); moveFocus(map[e.key]); }
  if (isTV && (e.key === 'Backspace' || e.keyCode === 10009 || e.keyCode === 461 || e.key === 'GoBack') && !$('#overlay-root').children.length) { e.preventDefault(); pressKey('back'); }
  if (e.key === 'MediaPlayPause' || e.keyCode === 179 || e.keyCode === 415 || e.keyCode === 19) pressKey('playpause');
});
['pointerdown', 'wheel', 'touchstart'].forEach((t) => addEventListener(t, () => bus.emit('activity'), { passive: true }));

// ---------------------------------------------------------------- commandes reçues par la TV
bus.on('rt:tv', async ({ cmd, from }) => {
  bus.emit('activity');
  if (cmd.key) return pressKey(cmd.key);
  if (cmd.open) {
    const o = cmd.open;
    if (o.kind === 'aperotime') return go('#/at/' + o.id);
    if (o.kind === 'week') return go('#/semaine/' + o.id);
    if (o.kind === 'route') return go(o.hash);
  }
  if (cmd.show) {
    const { openMedia } = await import('./views/post.js');
    openMedia(cmd.show, from.memberId);
    toast({ actorId: from.memberId, text: 'affiche un contenu sur la TV', ms: 3000 });
  }
  if (cmd.frame) { const { openFrame } = await import('./views/frame.js'); openFrame(); }
  if (cmd.call) { const call = await import('./call.js'); call.startCall(cmd.call.room || 'call:famille'); }
});

// ---------------------------------------------------------------- notifications vivantes
bus.on('ev:notify', async (n) => {
  if (n.actorId === state.me?.id) return;
  const thumb = n.item?.type === 'photo' ? n.item.mediaUrl : null;
  toast({
    actorId: n.actorId, text: n.text, thumb,
    onClick: async () => {
      if (!n.item) return;
      if (n.item.kind === 'aperotime') return go('#/at/' + n.item.id);
      if (n.item.kind === 'capsule') return go('#/capsules');
      if (n.item.kind === 'post') return go('#/p/' + n.item.id);
      if (n.item.kind === 'msg') return go('#/chat');
    },
  });
});
bus.on('ev:msg:new', (m) => {
  if (m.authorId === state.me?.id || location.hash.startsWith('#/chat')) return;
  toast({ actorId: m.authorId, text: m.type === 'audio' ? 'a envoyé un vocal dans la discussion' : m.type === 'text' ? '💬 ' + m.text.slice(0, 80) : 'a partagé un média dans la discussion', onClick: () => go('#/chat') });
});
bus.on('ev:members', (list) => { state.members = list; });
bus.on('ev:device:settings', (s) => { state.settings = { ...state.settings, ...s }; });

// Interphone : notification + lecture (jamais de son si l'appareil est en mode silencieux)
bus.on('ev:intercom', (msg) => {
  const silent = !!state.settings.silent;
  const auto = !silent && state.settings.intercomAutoplay !== false && isTV;
  const player = audioPlayer(msg.mediaUrl, msg.id, msg.duration);
  const pop = h('div.intercom-pop', avatar(msg.from, 'xl'), h('h3', `📢 ${member(msg.from).name}`), msg.text ? h('p', msg.text) : null, h('div', { style: { display: 'flex', justifyContent: 'center', margin: '14px 0' } }, player),
    silent ? h('p.muted', 'Mode silencieux : appuyez sur lecture pour écouter.') : null,
    h('button.btn', { onclick: () => { player.audio.pause(); pop.remove(); }, 'data-focus': '' }, 'Fermer'));
  document.body.append(pop);
  if (auto) player.audio.play().catch(() => {});
  player.audio.addEventListener('ended', () => setTimeout(() => pop.remove(), 4000));
  setTimeout(() => pop.isConnected && player.audio.paused && pop.remove(), 60000);
});

// Capsule temporelle : animation d'ouverture
bus.on('ev:capsule:open', (c) => {
  confetti();
  overlay((close) => h('div.capsule-open', { onclick: close },
    h('div', { style: { textAlign: 'center' } }, h('div.box', '🎁'),
      h('div.inner', h('p.muted', 'Une capsule temporelle s’ouvre !'), h('h2.page-title', c.title), h('p', `Scellée par ${member(c.authorId).name} le ${new Date(c.createdAt).toLocaleDateString('fr-FR')}`),
        h('a.btn.primary', { href: '#/capsules', onclick: close }, 'Découvrir')))), { immersive: true });
});

// Invitation à un appel
bus.on('ev:call:invite', ({ room, from }) => {
  if (from.deviceId === state.device?.id) return;
  if (room.startsWith('at:')) { toast({ actorId: from.memberId, text: 'démarre un Apéro Time Live 🍷 — toucher pour rejoindre', ms: 20000, onClick: () => go('#/at/' + room.slice(3) + '?live=1') }); return; }
  const t = toast({ actorId: from.memberId || undefined, text: from.memberId ? 'vous appelle 📹 — toucher pour rejoindre' : `📺 ${from.deviceName} lance un appel — toucher pour rejoindre`, ms: 20000, onClick: async () => { const call = await import('./call.js'); call.startCall(room); } });
  t.classList.add('call-invite');
});

// ---------------------------------------------------------------- cadre familial (TV au repos)
let idleTimer;
function armIdle() {
  clearTimeout(idleTimer);
  if (!isTV || !state.device) return;
  const delay = (Number(state.settings.frameDelay) || 120) * 1000;
  idleTimer = setTimeout(async () => {
    if ($('.call:not(.mini)') || $('.watch-layer') || $('.slideshow') || location.hash.startsWith('#/at/')) return armIdle();
    const { openFrame } = await import('./views/frame.js'); openFrame();
  }, delay);
}
bus.on('activity', armIdle);

// ---------------------------------------------------------------- démarrage
function defaultRouteForHost() {
  const sub = location.hostname.split('.')[0];
  if (location.hash && location.hash !== '#/' && location.hash !== '#') return;
  if (sub === 'galerie') location.hash = '#/galerie';
  else if (sub === 'chat') location.hash = '#/chat';
  else if (sub === 'visio' || sub === 'appel') location.hash = '#/appel';
}

// Décor commun à toutes les pages : scène codée, ou photo de fond choisie par la famille
async function paintScene() {
  const { sceneUri } = await import('./art.js');
  let bg = '';
  try { bg = (await api('/api/family')).background; } catch (_) {}
  const el = $('#scene');
  el.style.backgroundImage = bg ? `url("${bg}")` : `url("${sceneUri()}")`;
  el.classList.toggle('photo', !!bg);
}
bus.on('ev:family', paintScene);

async function boot() {
  defaultRouteForHost();
  paintScene();
  let me;
  try { me = await api('/api/me'); } catch (e) {
    if (e.status !== 401) { $('#view').append(h('div.glass.card', 'Serveur injoignable. Nouvel essai…')); setTimeout(boot, 4000); return; }
    const cfg = await api('/api/config');
    state.members = cfg.members; state.links = cfg.links;
    const mod = isTV ? await import('./views/tvpair.js') : await import('./views/login.js');
    $('#topbar').replaceChildren();
    return mod.default($('#view'), { onDone: () => location.reload() });
  }
  state.me = me.member; state.device = me.device; state.members = me.members; state.links = me.links;
  if (isTV && me.device.kind !== 'tv') localStorage.setItem('blcf.kind', me.device.kind);
  rt.connect();
  bus.on('welcome', armIdle);
  addEventListener('hashchange', router);
  router();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
}
window.BLC = { go, info, rt, state };
boot();
