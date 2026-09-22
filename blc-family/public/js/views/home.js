// Accueil « Belcram Family » : logo manuscrit, collage de polaroïds, horloge / météo / profil,
// grandes cartes illustrées vers chaque application, raccourcis et « Moment du jour », puis le fil familial.
import { state, api, h, avatar, member, bus, sheet, info, overlay, skillPills } from '../core.js';
import { openComposer, feedCard, openPost } from './post.js';
import { isTV } from '../main.js';
import { ICONS, landscape, familySunset, weatherIcon } from '../art.js';
import { weather } from '../weather.js';

const svg = (markup, cls = 'ic') => { const s = h('span.' + cls.split('.').join('.')); s.innerHTML = markup; return s; };
const QUOTES = ['Le plus beau des voyages, c’est celui qu’on partage.', 'Ce qu’on sait, on ne le garde pas pour soi.', 'La famille, c’est là où la vie commence et où l’amour ne finit jamais.', 'Ensemble, c’est tout.'];

// BLC TV Player : choix du serveur puis connexion automatique (les liens restent côté serveur)
export function openTvPlayer(servers) {
  const go = (i) => { location.href = '/api/tv/go/' + i; };
  if (!servers || servers.length <= 1) return go(0);
  sheet('📺 BLC TV Player — choisir le serveur', () => h('div.targets', servers.map((s) => h('button.target', { onclick: () => go(s.id), 'data-focus': '' }, h('span.ic', '📡'), h('b', s.name), h('span.muted', 'Connexion automatique')))));
}

export default async function home(root, params) {
  const [feed, ats, family, photos] = await Promise.all([api('/api/feed'), api('/api/aperotimes'), api('/api/family').catch(() => ({ heroPhotos: [], tvServers: [] })), api('/api/posts?type=photo').catch(() => [])]);
  const me = state.me ? member(state.me.id) : null;
  const pub = ats.filter((a) => a.status === 'published');
  const photoUrls = photos.map((p) => p.mediaUrl);
  const pics = [...family.heroPhotos, ...photoUrls.filter((u) => !family.heroPhotos.includes(u))];
  const pic = (i, kind) => pics[i] || landscape(kind);

  // ------------------------------------------------ haut : logo, collage, horloge / météo / profil
  const clock = h('div.clock-big'); const dateEl = h('div.date-small');
  const wx = h('div.wx');
  const tick = () => { const d = new Date(); clock.textContent = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); dateEl.textContent = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); };
  tick(); const clockT = setInterval(tick, 15000);
  weather().then((w) => { wx.replaceChildren(h('span.wx-ic', weatherIcon(w.current.weather_code)), h('div', h('b', Math.round(w.current.temperature_2m) + '°C'), h('small', 'Guadeloupe'))); }).catch(() => wx.remove());

  const polaroid = (src, cls, caption) => h('figure.polaroid.' + cls, h('img', { src, alt: '', loading: 'lazy' }), caption ? h('figcaption', caption, ' ♡') : null);
  const collage = h('div.collage',
    polaroid(pic(1, 'soir'), 'p1'), polaroid(pic(2, 'ile'), 'p2'), polaroid(pic(3, 'plage'), 'p4'), polaroid(pic(4, 'soir'), 'p5'),
    polaroid(pic(0, 'plage'), 'p3', 'Notre famille'));

  const greet = me ? h('a.hello', { href: '#/parametres' }, avatar(me.id, 'l'), h('div', h('small', 'Bonjour'), h('span.script', me.name, ' ♡'))) : h('div.hello', h('div', h('small', 'Bienvenue'), h('span.script', state.device?.name || 'la famille')));

  root.append(h('section.home-top',
    h('div.logo-block', h('div.logo-script', 'Belcram'), h('div.logo-script.second', 'Family ', svg(ICONS.heart, 'heart')), h('p.hand', 'Des souvenirs aujourd’hui,', h('br'), 'pour toujours ♡'), h('i.hand-line')),
    collage,
    h('div.top-right',
      h('div.info-row', h('div.clock-box', clock, dateEl), wx, greet),
      h('p.hand.right', 'Une famille, des moments,', h('br'), 'pour la vie ♡'),
      me?.skills?.length ? skillPills(me.id, { small: true }) : null,
      state.me ? h('button.btn.primary.drop-btn', { onclick: () => openComposer() }, '+ Déposer un message') : null)));

  // ------------------------------------------------ cartes des applications
  const tvScreens = h('div.tv-wall', Array.from({ length: 12 }, (_, i) => h('i', { style: pics.length ? { backgroundImage: `url("${pics[i % pics.length]}")` } : { '--h': (i * 37) % 360 } })));
  const eq = h('div.eq', Array.from({ length: 11 }, (_, i) => h('i', { style: { '--k': i } })));
  const others = state.members.filter((m) => m.id !== me?.id);
  const gp = (n, kind) => (photoUrls[n] ? photoUrls[n] : landscape(kind));
  const cards = [
    { key: 'apero', title: 'ApéroTime', foot: 'Nos histoires', href: '#/aperotime', badge: `${pub.length} éditions`,
      art: h('div.art.art-apero', h('div.drink', h('i.liquid'), h('i.ice'), h('i.ice.b'), h('i.lime'), h('i.straw'))) },
    { key: 'tv', title: 'BLC TV', sub: 'PLAYER', foot: 'TV en famille', onclick: () => openTvPlayer(family.tvServers), art: h('div.art.art-tv', tvScreens, h('div.sofa')) },
    { key: 'music', title: 'BLC Music', sub: 'PLAYER', foot: 'Écouter · Découvrir', href: state.links.music, external: true, art: h('div.art.art-music', svg(ICONS.music, 'big-note'), eq) },
    { key: 'camera', title: 'Galerie', foot: 'Nos photos & vidéos', href: '#/galerie', art: h('div.art.art-gallery', h('img.gp.a', { src: gp(1, 'soir'), alt: '' }), h('img.gp.b', { src: gp(2, 'plage'), alt: '' }), h('img.gp.c', { src: gp(0, 'ile'), alt: '' })) },
    { key: 'video', title: 'Appels Vidéo', foot: 'Rester proches', href: '#/appel', art: h('div.art.art-call', h('div.call-prev', h('img', { src: pic(0, 'soir'), alt: '' }), others[0] ? h('div.pip', avatar(others[0].id, 'l')) : null), h('div.call-btns', svg(ICONS.mic, 'cb'), svg(ICONS.hang, 'cb.red'), svg(ICONS.cam, 'cb'))) },
    { key: 'family', title: 'Notre Famille', foot: 'Les membres', href: '#/famille', art: h('div.art.art-family', h('img', { src: familySunset(state.members.length || 4), alt: '' })) },
    { key: 'gear', title: 'Paramètres', foot: 'Personnaliser', href: '#/parametres', art: h('div.art.art-gear', svg(ICONS.gear, 'gear-bg')) },
  ];
  const icoKey = { apero: 'apero', tv: 'tv', music: 'music', camera: 'camera', video: 'video', family: 'family', gear: 'gear' };
  const cardsEl = h('section.hcards', cards.map((c, i) => {
    const attrs = { class: 'hcard hc-' + c.key, style: { '--i': i } };
    const el = c.onclick ? h('button', { ...attrs, onclick: c.onclick, type: 'button' }) : h('a', { ...attrs, href: c.href, ...(c.external && !isTV ? { target: '_blank', rel: 'noopener' } : {}) });
    el.append(h('div.hc-head', svg(ICONS[icoKey[c.key]], 'hc-ic'), h('div.hc-title', c.title), c.sub ? h('div.hc-sub', c.sub) : null), c.art,
      c.badge ? h('span.hc-badge', c.badge) : null,
      h('div.hc-foot', h('span', c.foot), svg(ICONS.chevron, 'chev')));
    return el;
  }));
  root.append(cardsEl);

  // ------------------------------------------------ bas : citation, raccourcis, moment du jour
  let qi = new Date().getDate() % QUOTES.length;
  const quoteText = h('span', `« ${QUOTES[qi]} »`);
  const quote = h('div.quote-bubble', quoteText, svg(ICONS.heart, 'heart'));
  const qT = setInterval(() => { qi = (qi + 1) % QUOTES.length; quoteText.textContent = `« ${QUOTES[qi]} »`; quote.classList.remove('fadein'); void quote.offsetWidth; quote.classList.add('fadein'); }, 12000);
  const mini = (icon, label, action) => (typeof action === 'string' ? h('a.mini', { href: action }, svg(ICONS[icon]), h('span', label)) : h('button.mini', { type: 'button', onclick: action }, svg(ICONS[icon]), h('span', label)));

  const moments = [
    ...photos.slice(0, 8).map((p) => ({ img: p.mediaUrl, title: 'Moment du jour', caption: p.text || `Photo de ${member(p.authorId).name}`, open: () => openPost(p.id) })),
    ...pub.slice(0, 5).map((a, i) => ({ img: landscape(['plage', 'ile', 'soir'][i % 3]), title: 'Apéro Time', caption: a.title.slice(0, 60), open: () => { location.hash = '#/at/' + a.id; } })),
  ];
  if (!moments.length) moments.push({ img: landscape('ile'), title: 'Moment du jour', caption: 'Toujours plus loin ensemble ♡', open: () => { location.hash = '#/galerie'; } });
  let mi = 0;
  const mImg = h('img', { alt: '' }); const mTitle = h('b'); const mCap = h('span.script-s');
  const paintMoment = () => { const m = moments[mi]; mImg.src = m.img; mTitle.textContent = m.title; mCap.textContent = m.caption; };
  const moment = h('div.moment',
    h('button.m-arrow', { type: 'button', 'aria-label': 'Précédent', onclick: () => { mi = (mi - 1 + moments.length) % moments.length; paintMoment(); } }, '‹'),
    h('button.m-body', { type: 'button', onclick: () => moments[mi].open() }, mImg, h('div', mTitle, mCap)),
    h('button.m-arrow', { type: 'button', 'aria-label': 'Suivant', onclick: () => { mi = (mi + 1) % moments.length; paintMoment(); } }, '›'));
  paintMoment();
  const mT = setInterval(() => { mi = (mi + 1) % moments.length; paintMoment(); }, 9000);

  root.append(h('section.home-bottom', quote,
    h('div.minis', mini('calendar', 'Calendrier', '#/calendrier'), mini('weather', 'Météo', () => openWeather()), mini('intercom', 'Interphone', '#/interphone'), mini('chat', 'Discussion', '#/chat'), mini('help', 'Aide', '#/aide')),
    moment));

  // ------------------------------------------------ fil familial (sous la ligne de flottaison)
  const car = h('div.carousel');
  const seen = new Set();
  const add = (it, front) => { if (seen.has(it.kind + it.id)) return; seen.add(it.kind + it.id); const c = feedCard(it, front ? 0 : car.children.length); front ? car.prepend(c) : car.append(c); };
  feed.forEach((it) => add(it));
  if (!feed.length) car.append(h('div.fcard.text', h('div.txt', 'Rien encore ici… Déposez le premier message ! ✨')));
  root.append(h('h2.section-title.feed-title', 'Le fil de la famille', h('span.count', 'les dernières nouvelles')), car);

  const offs = [
    bus.on('ev:post:new', (p) => add({ kind: 'post', id: p.id, at: p.createdAt, authorId: p.authorId, type: p.type, text: p.text, mediaUrl: p.mediaUrl, reactions: {} }, true)),
    bus.on('ev:at:published', (a) => add({ kind: 'aperotime', id: a.id, at: a.publishedAt, authorId: a.authorId, type: 'aperotime', title: a.title, text: a.excerpt }, true)),
    bus.on('ev:capsule:open', (c) => add({ kind: 'capsule', id: c.id, at: c.unlockAt, authorId: c.authorId, type: 'capsule', title: c.title, text: c.text, mediaUrl: c.mediaUrl, mediaType: c.mediaType }, true)),
    bus.on('ev:post:delete', ({ id }) => car.querySelector(`[data-id="${id}"]`)?.remove()),
  ];
  if (params.post) openPost(params.post);
  if (isTV) setTimeout(() => cardsEl.firstChild?.focus(), 150);
  return () => { offs.forEach((f) => f()); clearInterval(clockT); clearInterval(qT); clearInterval(mT); };
}

// Météo détaillée (Guadeloupe)
export async function openWeather() {
  let w;
  try { w = await weather(); } catch (_) { info('Météo indisponible pour le moment'); return; }
  const days = w.daily.time.map((t, i) => ({ t, code: w.daily.weather_code[i], max: w.daily.temperature_2m_max[i], min: w.daily.temperature_2m_min[i], rain: w.daily.precipitation_probability_max?.[i] }));
  overlay(h('div.sheet', h('h2', `${weatherIcon(w.current.weather_code)} ${Math.round(w.current.temperature_2m)}°C en Guadeloupe`),
    h('p.muted', `Vent ${Math.round(w.current.wind_speed_10m)} km/h · Humidité ${w.current.relative_humidity_2m} %`),
    h('div.wx-days', days.map((d) => h('div.wx-day', h('b', new Date(d.t + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short' })), h('span.wx-ic', weatherIcon(d.code)), h('span', `${Math.round(d.max)}° / ${Math.round(d.min)}°`), d.rain != null ? h('small.muted', `💧 ${d.rain} %`) : null)))));
}
