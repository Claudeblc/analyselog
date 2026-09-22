// Accueil : grandes tuiles flottantes, « + Déposer un message », carrousel familial vivant.
import { state, api, h, avatar, member, bus, isOnline } from '../core.js';
import { openComposer, feedCard, openPost } from './post.js';
import { isTV } from '../main.js';

function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'Bonne nuit' : hr < 12 ? 'Bonjour' : hr < 18 ? 'Bon après-midi' : 'Bonsoir';
}

function tile({ href, external, emoji, title, sub, c1, c2, big, badge, d }) {
  const t = h('a.tile' + (big ? '.big' : ''), { href, style: { '--t1': c1, '--t2': c2, '--d': d + 's' }, ...(external && !isTV ? { target: '_blank', rel: 'noopener' } : {}) },
    badge ? h('span.badge', badge) : null, h('span.emoji', emoji), h('h3', title), h('p', sub));
  // Inclinaison 3D qui suit le pointeur
  t.addEventListener('pointermove', (e) => {
    const r = t.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width; const y = (e.clientY - r.top) / r.height;
    t.style.transform = `rotateY(${(x - 0.5) * 14}deg) rotateX(${(0.5 - y) * 12}deg) translateZ(10px)`;
    t.style.setProperty('--mx', x * 100 + '%'); t.style.setProperty('--my', y * 100 + '%');
  });
  t.addEventListener('pointerleave', () => { t.style.transform = ''; });
  return t;
}

export default async function home(root, params) {
  const name = state.me ? member(state.me.id).name : state.device?.name;
  const [feed, ats, caps] = await Promise.all([api('/api/feed'), api('/api/aperotimes'), api('/api/capsules')]);
  const lastAt = ats.find((a) => a.status === 'published');

  root.append(h('section.hero',
    h('div', h('h1', greeting(), ', ', h('em', name || 'la famille')), h('p', 'Bienvenue dans la maison numérique de la famille Belcram.')),
    state.me ? h('button.btn.primary.drop-btn', { onclick: () => openComposer() }, '+ Déposer un message') : null));

  root.append(h('section.tiles',
    tile({ href: '#/aperotime', emoji: '🍷', title: 'Apéro Time', sub: lastAt ? `Dernier : ${lastAt.title.slice(0, 48)}` : 'Les chroniques de Papa', c1: '#b8572b', c2: '#5a1d3a', big: true, badge: `${ats.filter((a) => a.status === 'published').length} éditions`, d: 0 }),
    tile({ href: state.links.music, external: true, emoji: '🎵', title: 'BLC Music', sub: 'Le lecteur musical de la famille', c1: '#7b4bb3', c2: '#2b1650', d: -1.2 }),
    tile({ href: state.links.tv, external: true, emoji: '📺', title: 'BLC TV', sub: 'Films, séries et chaînes', c1: '#2b6cb0', c2: '#152445', d: -2.1 }),
    tile({ href: '#/galerie', emoji: '🖼️', title: 'Galerie', sub: 'Photos, vidéos et albums', c1: '#2f855a', c2: '#123524', d: -3 }),
    tile({ href: '#/chat', emoji: '💬', title: 'Discussion', sub: 'Messages et vocaux', c1: '#c2416b', c2: '#4a1530', d: -0.6 }),
    tile({ href: '#/appel', emoji: '📹', title: 'Appels vidéo', sub: 'Se voir, sur tous les écrans', c1: '#0e8f95', c2: '#0f2f3a', d: -1.8 }),
    tile({ href: '#/interphone', emoji: '📢', title: 'Interphone', sub: 'Un vocal vers la TV', c1: '#c77d1e', c2: '#4a2a0c', d: -2.6 }),
  ));

  // Bande d'informations : présence, semaine, capsule, anniversaires
  const nextCap = caps.find((c) => !c.opened);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const bdays = state.members.filter((m) => m.birthday).map((m) => {
    const [, mm, dd] = m.birthday.split('-').map(Number);
    let n = new Date(today.getFullYear(), mm - 1, dd); if (n < today) n = new Date(today.getFullYear() + 1, mm - 1, dd);
    return { m, days: Math.round((n - today) / 86400000) };
  }).filter((x) => x.days <= 30).sort((a, b) => a.days - b.days);
  const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const wk = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  const presence = h('div.info', h('div.presence', state.members.map((m) => avatar(m.id, '', isOnline(m.id)))), h('span.muted', 'La famille'));
  root.append(h('div.strip', { style: { marginTop: '22px' } },
    presence,
    h('a.info', { href: '#/semaine/' + wk, style: { textDecoration: 'none', color: 'inherit' }, 'data-focus': '' }, h('span', { style: { fontSize: '26px' } }, '🗓️'), h('div', h('b', 'Notre semaine'), h('div.muted', 'Diaporama des 7 derniers jours'))),
    h('a.info', { href: '#/capsules', style: { textDecoration: 'none', color: 'inherit' }, 'data-focus': '' }, h('span', { style: { fontSize: '26px' } }, '⏳'), h('div', h('b', 'Capsules temporelles'), h('div.muted', nextCap ? `Prochaine : ${new Date(nextCap.unlockAt).toLocaleDateString('fr-FR')}` : 'Sceller un souvenir'))),
    bdays.map(({ m, days }) => h('div.info', avatar(m.id), h('div', h('b', `🎂 ${m.name}`), h('div.muted', days === 0 ? 'C’est aujourd’hui !' : `dans ${days} jour${days > 1 ? 's' : ''}`)))),
  ));
  const offPresence = bus.on('presence', () => presence.firstChild.replaceChildren(...state.members.map((m) => avatar(m.id, '', isOnline(m.id)))));

  // Carrousel familial
  const car = h('div.carousel');
  const seen = new Set();
  const add = (it, front) => { if (seen.has(it.kind + it.id)) return; seen.add(it.kind + it.id); const c = feedCard(it, front ? 0 : car.children.length); front ? car.prepend(c) : car.append(c); };
  feed.forEach((it) => add(it));
  root.append(h('h2.section-title', 'Le fil de la famille', h('span.count', 'les dernières nouvelles')), car);
  if (!feed.length) car.append(h('div.fcard.text', h('div.txt', 'Rien encore ici… Déposez le premier message ! ✨')));

  const offs = [
    offPresence,
    bus.on('ev:post:new', (p) => add({ kind: 'post', id: p.id, at: p.createdAt, authorId: p.authorId, type: p.type, text: p.text, mediaUrl: p.mediaUrl, reactions: {} }, true)),
    bus.on('ev:at:published', (a) => add({ kind: 'aperotime', id: a.id, at: a.publishedAt, authorId: a.authorId, type: 'aperotime', title: a.title, text: a.excerpt }, true)),
    bus.on('ev:capsule:open', (c) => add({ kind: 'capsule', id: c.id, at: c.unlockAt, authorId: c.authorId, type: 'capsule', title: c.title, text: c.text, mediaUrl: c.mediaUrl, mediaType: c.mediaType }, true)),
    bus.on('ev:post:delete', ({ id }) => car.querySelector(`[data-id="${id}"]`)?.remove()),
  ];

  root.append(h('a.settings-link', { href: '#/parametres' }, '⚙️ Paramètres'));
  if (params.post) openPost(params.post);
  return () => offs.forEach((f) => f());
}
