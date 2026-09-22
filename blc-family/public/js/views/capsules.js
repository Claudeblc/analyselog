// Capsules temporelles : un souvenir verrouillé jusqu'à une date (contenu caché côté serveur).
import { state, api, upload, h, avatar, member, bus, sheet, info, audioPlayer, reactionBar } from '../core.js';
import { commentsBlock } from './post.js';

export default async function capsules(root) {
  let caps = await api('/api/capsules');
  const grid = h('div.caps');
  let timer;
  root.append(h('div.row', h('div.grow', h('h1.page-title', '⏳ Capsules temporelles'), h('p.page-sub', 'Des souvenirs scellés, à ouvrir ensemble le jour venu.')),
    state.me ? h('button.btn.primary', { onclick: create }, '+ Sceller une capsule') : null), grid);

  function countdown(ts) {
    const s = Math.max(0, (ts - Date.now()) / 1000);
    const d = Math.floor(s / 86400); const hh = Math.floor((s % 86400) / 3600); const mm = Math.floor((s % 3600) / 60);
    return d > 0 ? `${d} j ${hh} h` : `${hh} h ${mm} min`;
  }
  function paint() {
    grid.replaceChildren(...(caps.length ? caps.map((c) => c.locked
      ? h('div.capsule.locked', h('div.row', avatar(c.authorId, 's'), h('span', member(c.authorId).name)), h('h3', c.title), h('div.cd', countdown(c.unlockAt)), h('div.muted', 'À ouvrir le ', new Date(c.unlockAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })), c.hasMedia ? h('div.muted', '📎 contient un média') : null)
      : h('div.capsule', { style: { cursor: 'pointer' }, onclick: () => open(c) }, h('div.row', avatar(c.authorId, 's'), h('span', member(c.authorId).name)), h('h3', '🎁 ', c.title), h('div.muted', 'Ouverte le ', new Date(c.unlockAt).toLocaleDateString('fr-FR')), h('p', (c.text || '').slice(0, 140))))
      : [h('p.muted', 'Aucune capsule pour le moment. Scellez un message pour un anniversaire, un Noël, les 18 ans d’un enfant…')]));
  }
  function open(c) {
    let cm;
    sheet('🎁 ' + c.title, () => h('div',
      c.mediaType === 'photo' ? h('img', { src: c.mediaUrl, alt: '', style: { borderRadius: '14px', marginBottom: '12px' } }) : c.mediaType === 'video' ? h('video', { src: c.mediaUrl, controls: true, playsinline: true }) : c.mediaType === 'audio' ? audioPlayer(c.mediaUrl, c.id) : null,
      h('p', { style: { whiteSpace: 'pre-wrap', fontFamily: 'var(--read)', fontSize: '18px' } }, c.text),
      h('p.muted', `Scellée par ${member(c.authorId).name} le ${new Date(c.createdAt).toLocaleDateString('fr-FR')}`),
      reactionBar('capsule', c.id, c.reactions), cm = commentsBlock('capsule', c)), { onClose: () => cm?.cleanup() });
  }
  function create() {
    sheet('Sceller une capsule', (close) => {
      const title = h('input', { type: 'text', placeholder: 'Pour les 18 ans de…' });
      const d = new Date(); d.setFullYear(d.getFullYear() + 1);
      const when = h('input', { type: 'date', value: d.toISOString().slice(0, 10), min: new Date(Date.now() + 86400000).toISOString().slice(0, 10) });
      const text = h('textarea', { placeholder: 'Votre message pour le futur…' });
      const file = h('input', { type: 'file', accept: 'image/*,video/*,audio/*' });
      const err = h('p', { style: { color: 'var(--danger)' } });
      return h('div', h('div.field', h('label', 'Titre'), title), h('div.field', h('label', 'À ouvrir le'), when), h('div.field', h('label', 'Message'), text), h('div.field', h('label', 'Photo, vidéo ou audio (facultatif)'), file), err,
        h('div.row', { style: { justifyContent: 'flex-end' } }, h('button.btn', { onclick: close }, 'Annuler'), h('button.btn.primary', { onclick: async (e) => {
          e.currentTarget.disabled = true;
          try {
            let mediaUrl = ''; let mediaType = '';
            const f = file.files[0];
            if (f) { mediaUrl = (await upload(f)).url; mediaType = f.type.split('/')[0] === 'image' ? 'photo' : f.type.split('/')[0]; }
            await api('/api/capsules', { body: { title: title.value || 'Capsule', unlockAt: new Date(when.value + 'T09:00:00').toISOString(), text: text.value, mediaUrl, mediaType } });
            info('Capsule scellée 🔒'); close();
          } catch (x) { err.textContent = x.message; e.target.disabled = false; }
        } }, '🔒 Sceller')));
    });
  }
  paint();
  timer = setInterval(paint, 60000);
  const offs = [
    bus.on('ev:capsule:new', (c) => { caps.push(c); caps.sort((a, b) => a.unlockAt - b.unlockAt); paint(); }),
    bus.on('ev:capsule:open', (c) => { caps = caps.map((x) => (x.id === c.id ? c : x)); paint(); }),
  ];
  return () => { clearInterval(timer); offs.forEach((f) => f()); };
}
