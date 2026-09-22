// « Notre semaine » : les contenus de la semaine, diaporama, modification puis conservation dans les archives.
import { api, h, avatar, member, fdate, info } from '../core.js';
import { slideshow } from './slides.js';
import { sendToTV, tvs } from './post.js';

export default async function week(root, { key }) {
  const w = await api('/api/weeks/' + key);
  const start = new Date(key + 'T12:00:00'); const end = new Date(start); end.setDate(end.getDate() + 6);
  const defTitle = `Semaine du ${start.getDate()}${start.getMonth() !== end.getMonth() ? ' ' + fdate(start, { month: 'long' }) : ''} au ${fdate(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  const excluded = new Set(w.excluded);
  let order = w.items.map((i) => i.id);
  const title = h('input.title-in', { type: 'text', value: w.title || defTitle });
  const list = h('div', { style: { display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))' } });

  const kept = () => order.map((id) => w.items.find((i) => i.id === id)).filter((i) => i && !excluded.has(i.id));
  const play = () => slideshow([{ type: 'title', title: title.value, sub: 'Famille Belcram' }, ...kept().map((i) => ({ ...i, text: i.text || i.title }))], { ms: 6500 });

  function paint() {
    list.replaceChildren(...order.map((id, k) => {
      const it = w.items.find((i) => i.id === id); const off = excluded.has(id);
      return h('div.glass', { style: { padding: '10px', opacity: off ? 0.4 : 1, display: 'flex', gap: '10px', alignItems: 'center' } },
        it.mediaUrl && it.type === 'photo' ? h('img', { src: it.mediaUrl, alt: '', style: { width: '64px', height: '64px', objectFit: 'cover', borderRadius: '12px' } }) : h('span', { style: { fontSize: '30px', width: '64px', textAlign: 'center' } }, { video: '🎬', audio: '🎙️', text: '💬', aperotime: '🍷', capsule: '🎁' }[it.type] || '•'),
        h('div.grow', { style: { minWidth: 0 } }, h('div', avatar(it.authorId, 's'), ' ', h('b', member(it.authorId).name)), h('div.muted', { style: { fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, it.title || it.text || it.type)),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
          h('button.icon-btn', { title: 'Monter', style: { width: '32px', height: '32px' }, onclick: () => { if (k > 0) { [order[k - 1], order[k]] = [order[k], order[k - 1]]; paint(); } } }, '↑'),
          h('button.icon-btn', { title: off ? 'Inclure' : 'Retirer', style: { width: '32px', height: '32px' }, onclick: () => { off ? excluded.delete(id) : excluded.add(id); paint(); } }, off ? '＋' : '✕')));
    }));
  }
  root.append(
    h('h1.page-title', '🗓️ Notre semaine'),
    h('p.page-sub', w.saved ? '✅ Cette semaine est conservée dans les archives familiales.' : 'Revoyez la sélection, changez l’ordre, puis conservez-la dans les archives.'),
    h('div.field', title),
    h('div.row', { style: { margin: '10px 0 20px' } },
      h('button.btn.primary', { onclick: play, disabled: !w.items.length }, '▶ Lancer le diaporama'),
      tvs().length ? h('button.btn', { onclick: () => sendToTV({ open: { kind: 'week', id: key } }) }, '📺 Sur la TV') : null,
      h('button.btn', { onclick: async () => { await api('/api/weeks/' + key, { method: 'PUT', body: { title: title.value, excluded: [...excluded], order, saved: true } }); info('Semaine conservée dans les archives ✨'); } }, '💾 Conserver cette semaine')),
    w.items.length ? list : h('p.muted', 'Rien encore cette semaine. Chaque photo, vidéo, message ou Apéro Time publié apparaîtra ici.'));
  paint();
  if (document.body.classList.contains('k-tv') && w.items.length) setTimeout(play, 600);
}
