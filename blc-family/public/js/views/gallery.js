// Galerie familiale : tri par date / personne / événement / album / année, albums manuels, semaines.
import { state, api, h, avatar, member, bus, fdate } from '../core.js';
import { openComposer, openPost } from './post.js';

export default async function gallery(root) {
  let [posts, albums, weeks] = await Promise.all([api('/api/posts?type=photo,video'), api('/api/albums'), api('/api/weeks')]);
  const f = { person: '', year: '', album: '', event: '' };

  const years = () => [...new Set(posts.map((p) => new Date(p.takenAt || p.createdAt).getFullYear()))].sort().reverse();
  const events = () => [...new Set(posts.map((p) => p.event).filter(Boolean))];
  const filtersEl = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  const albumsEl = h('div.albums');
  const grid = h('div.masonry');
  const weeksEl = h('div', { style: { display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' } });

  root.append(
    h('div.row', h('div.grow', h('h1.page-title', '🖼️ Galerie de la famille'), h('p.page-sub', 'Toutes nos photos et vidéos, rangées pour s’y retrouver.')),
      state.me ? h('button.btn.primary', { onclick: () => openComposer('photo') }, '+ Ajouter une photo / vidéo') : null),
    h('h2.section-title', '🗓️ Notre semaine', h('span.count', 'un diaporama chaque semaine, conservé dans les archives')), weeksEl,
    h('h2.section-title', '📁 Albums'), albumsEl,
    h('h2.section-title', 'Photos et vidéos'), filtersEl, h('div', { style: { height: '14px' } }), grid);

  function paintWeeks() {
    const shown = weeks.filter((w) => w.count || w.saved).slice(0, 9);
    weeksEl.replaceChildren(...shown.map((w) => {
      const start = new Date(w.key + 'T12:00:00'); const end = new Date(start); end.setDate(end.getDate() + 6);
      return h('a.week-card', { href: '#/semaine/' + w.key }, h('span.n', w.count), h('div', h('b', w.title || `Semaine du ${start.getDate()}${start.getMonth() !== end.getMonth() ? ' ' + fdate(start, { month: 'long' }) : ''} au ${fdate(end, { day: 'numeric', month: 'long', year: 'numeric' })}`), h('div.muted', w.current ? 'Semaine en cours' : w.saved ? '✅ Conservée dans les archives' : 'À revoir et conserver')));
    }));
  }
  function paintAlbums() {
    albumsEl.replaceChildren(
      h('div.album' + (!f.album ? '.on' : ''), { tabindex: 0, onclick: () => { f.album = ''; paint(); } }, h('span', 'Toutes')),
      ...albums.map((a) => {
        const cover = posts.find((p) => a.postIds.includes(p.id) && p.type === 'photo');
        return h('div.album' + (f.album === a.id ? '.on' : ''), { tabindex: 0, onclick: () => { f.album = f.album === a.id ? '' : a.id; paint(); } }, cover ? h('img', { src: cover.mediaUrl, alt: '', loading: 'lazy' }) : null, h('span', a.title, ' · ', a.postIds.length));
      }),
      state.me ? h('div.album', { tabindex: 0, onclick: newAlbum, style: { display: 'grid', placeItems: 'center', fontSize: '15px' } }, '+ Nouvel album') : null);
  }
  async function newAlbum() {
    const t = prompt('Nom du nouvel album ?'); if (!t) return;
    albums.push(await api('/api/albums', { body: { title: t } })); paintAlbums();
  }
  function chipRow(label, key, values, labelOf = (x) => x) {
    return h('div.chips', h('span.muted', { style: { alignSelf: 'center', minWidth: '90px' } }, label),
      h('button.chip' + (!f[key] ? '.on' : ''), { onclick: () => { f[key] = ''; paint(); } }, 'Tous'),
      values.map((v) => h('button.chip' + (String(f[key]) === String(v) ? '.on' : ''), { onclick: () => { f[key] = v; paint(); } }, key === 'person' ? avatar(v, 's') : null, labelOf(v))));
  }
  function paint() {
    paintAlbums();
    filtersEl.replaceChildren(chipRow('Personne', 'person', state.members.map((m) => m.id), (id) => member(id).name), chipRow('Année', 'year', years()), events().length ? chipRow('Événement', 'event', events()) : null);
    const al = albums.find((a) => a.id === f.album);
    const list = posts.filter((p) => (!f.person || p.authorId === f.person || (p.people || []).includes(f.person)) && (!f.year || new Date(p.takenAt || p.createdAt).getFullYear() === +f.year) && (!al || al.postIds.includes(p.id)) && (!f.event || p.event === f.event));
    grid.replaceChildren(...(list.length ? list.map((p) => h('div.g-item', { tabindex: 0, onclick: () => openPost(p.id), onkeydown: (e) => e.key === 'Enter' && openPost(p.id) },
      p.type === 'photo' ? h('img', { src: p.mediaUrl, alt: p.text || '', loading: 'lazy' }) : h('video', { src: p.mediaUrl + '#t=0.5', muted: true, preload: 'metadata', playsinline: true }),
      p.type === 'video' ? h('span.vid-badge', '▶ vidéo') : null,
      h('div.g-meta', avatar(p.authorId, 's'), h('span', member(p.authorId).name), (p.people || []).length ? h('span.muted', ' · avec ', p.people.map((x) => member(x).name).join(', ')) : null))) : [h('p.muted', 'Aucune photo ici pour le moment.')]));
  }
  paintWeeks(); paint();
  const offs = [
    bus.on('ev:post:new', (p) => { if (p.type === 'photo' || p.type === 'video') { posts.unshift(p); paint(); } }),
    bus.on('ev:post:delete', ({ id }) => { posts = posts.filter((p) => p.id !== id); paint(); }),
    bus.on('ev:albums', async () => { albums = await api('/api/albums'); paintAlbums(); }),
  ];
  return () => offs.forEach((x) => x());
}
