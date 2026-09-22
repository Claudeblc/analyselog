// Publications : « + Déposer un message », vue immersive, réactions, réponses, envoi vers la TV.
import { state, api, upload, h, avatar, member, ago, overlay, sheet, info, reactionBar, recorder, audioPlayer, wave, dur, kindIcon, bus } from '../core.js';
import * as rt from '../rt.js';

// ---------------------------------------------------------------- composer
export function openComposer(initialType = 'text') {
  sheet('Déposer un message', (close) => {
    let type = initialType; let file = null; let rec = null; let recorded = null; const people = new Set();
    const body = h('div');
    const text = h('textarea', { placeholder: 'Votre message pour la famille…', rows: 4 });
    const eventIn = h('input', { type: 'text', placeholder: 'Événement (ex. Noël 2026) — facultatif' });
    const prog = h('div.progress.hidden', h('i'));
    const err = h('p', { style: { color: 'var(--danger)' } });
    const types = [['text', '✍️', 'Texte'], ['photo', '📷', 'Photo'], ['video', '🎬', 'Vidéo'], ['audio', '🎙️', 'Audio']];
    const picker = h('div.type-pick', types.map(([t, e, l]) => h('button' + (t === type ? '.on' : ''), { type: 'button', onclick: () => { type = t; file = null; recorded = null; rec?.cancel(); paint(); } }, h('span', e), l)));
    const tags = h('div.chips', state.members.map((m) => h('button.chip', { type: 'button', onclick: (e) => { people.has(m.id) ? people.delete(m.id) : people.add(m.id); e.currentTarget.classList.toggle('on'); } }, avatar(m.id, 's'), m.name)));

    function mediaZone() {
      const input = h('input.hidden', { type: 'file', accept: type === 'photo' ? 'image/*' : 'video/*' });
      const zone = h('div.dropzone' + (file ? '.has' : ''), { onclick: () => input.click() },
        file ? (type === 'photo' ? h('img', { src: URL.createObjectURL(file), alt: '' }) : h('video', { src: URL.createObjectURL(file), controls: true, playsinline: true }))
          : [h('div', { style: { fontSize: '40px' } }, type === 'photo' ? '📷' : '🎬'), h('p', 'Touchez pour choisir ou prendre ', type === 'photo' ? 'une photo' : 'une vidéo'), h('p.muted', 'ou glissez un fichier ici')]);
      input.onchange = () => { file = input.files[0]; paint(); };
      zone.ondragover = (e) => { e.preventDefault(); };
      zone.ondrop = (e) => { e.preventDefault(); file = e.dataTransfer.files[0]; paint(); };
      return [zone, input];
    }
    function audioZone() {
      const btn = h('button.rec-btn' + (rec ? '.on' : ''), { type: 'button' }, rec ? '■' : '🎙️');
      const label = h('p.muted', rec ? 'Enregistrement… touchez pour arrêter' : recorded ? `Vocal prêt (${dur(recorded.duration)})` : 'Touchez pour enregistrer un vocal');
      btn.onclick = async () => {
        try {
          if (!rec) { rec = await recorder('audio', 300); rec.start(); paint(); } else { recorded = await rec.stop(); rec = null; paint(); }
        } catch (e) { err.textContent = 'Micro indisponible : ' + e.message; }
      };
      return h('div.rec', btn, rec ? wave('rec', 30, true) : null, label, recorded ? audioPlayer(URL.createObjectURL(recorded.blob), 'preview', recorded.duration) : null);
    }
    function paint() {
      [...picker.children].forEach((b, i) => b.classList.toggle('on', types[i][0] === type));
      body.replaceChildren(
        type === 'photo' || type === 'video' ? mediaZone() : null,
        type === 'audio' ? audioZone() : null,
        h('div.field', h('label', type === 'text' ? 'Message' : 'Légende (facultatif)'), text),
        type === 'photo' || type === 'video' ? [h('div.field', h('label', 'Qui est sur la photo ?'), tags), h('div.field', eventIn)] : null,
      );
    }
    paint();
    const submit = h('button.btn.primary', { type: 'button', onclick: async () => {
      err.textContent = ''; submit.disabled = true;
      try {
        let mediaUrl = ''; let duration = 0;
        if (type === 'photo' || type === 'video') { if (!file) throw new Error('Choisissez un fichier.'); prog.classList.remove('hidden'); mediaUrl = (await upload(file, (p) => { prog.firstChild.style.width = p * 100 + '%'; })).url; }
        if (type === 'audio') { if (rec) { recorded = await rec.stop(); rec = null; } if (!recorded) throw new Error('Enregistrez un vocal.'); mediaUrl = (await upload(recorded.blob)).url; duration = recorded.duration; }
        await api('/api/posts', { body: { type, text: text.value, mediaUrl, duration, people: [...people], event: eventIn.value, takenAt: file?.lastModified } });
        info('Publié ✨'); close();
      } catch (e) { err.textContent = e.message; submit.disabled = false; }
    } }, 'Publier');
    return h('div', picker, body, prog, err, h('div.row', { style: { justifyContent: 'flex-end', marginTop: '10px' } }, h('button.btn', { type: 'button', onclick: () => { rec?.cancel(); close(); } }, 'Annuler'), submit));
  }, { onClose: () => {} });
}

// ---------------------------------------------------------------- envoyer vers la TV
export function tvs() { return state.presence.filter((c) => c.kind === 'tv'); }
export function sendToTV(cmd) {
  const list = [...new Map(tvs().map((c) => [c.deviceId, c])).values()];
  if (!list.length) { info('Aucune télévision allumée pour le moment.'); return; }
  if (list.length === 1) { rt.tv(list[0].deviceId, cmd); info(`Envoyé sur « ${list[0].deviceName} » 📺`); return; }
  sheet('Sur quelle télévision ?', (close) => h('div.targets', list.map((c) => h('button.target', { onclick: () => { rt.tv(c.deviceId, cmd); info(`Envoyé sur « ${c.deviceName} » 📺`); close(); } }, h('span.ic', '📺'), h('b', c.deviceName)))));
}
export const tvButton = (cmd) => (tvs().length ? h('button.btn.small', { onclick: (e) => { e.stopPropagation(); sendToTV(cmd); }, 'data-focus': '' }, '📺 Afficher sur la TV') : null);

// ---------------------------------------------------------------- réponses (texte, audio, vidéo)
export function commentsBlock(kind, item) {
  const list = h('div.comments');
  const paint = () => list.replaceChildren(...(item.comments || []).map(commentEl));
  paint();
  const off = bus.on('ev:comment', (c) => { if (c.kind === kind && c.id === item.id) { item.comments = [...(item.comments || []).filter((x) => x.id !== c.comment.id), c.comment]; paint(); list.scrollTop = 1e6; } });
  const input = h('input', { type: 'text', placeholder: 'Écrire un commentaire…' });
  const sendText = async () => { if (!input.value.trim()) return; await api('/api/comments', { body: { kind, id: item.id, text: input.value } }); input.value = ''; };
  input.onkeydown = (e) => { if (e.key === 'Enter') sendText(); };
  const recBtn = (mediaType, icon) => {
    let r = null;
    const b = h('button.icon-btn', { title: mediaType === 'audio' ? 'Répondre par un vocal' : 'Répondre en vidéo', onclick: async () => {
      try {
        if (!r) { r = await recorder(mediaType, 120); r.start(); b.textContent = '■'; b.classList.add('rec-on'); if (mediaType === 'video') info('Enregistrement vidéo… touchez ■ pour envoyer'); return; }
        const out = await r.stop(); r = null; b.textContent = icon;
        const { url } = await upload(out.blob);
        await api('/api/comments', { body: { kind, id: item.id, mediaUrl: url, mediaType, text: '' } });
      } catch (e) { info(e.message); r = null; b.textContent = icon; }
    } }, icon);
    return b;
  };
  const box = h('div', list, state.me ? h('div.row', input, h('button.icon-btn', { onclick: sendText, title: 'Envoyer' }, '➤'), recBtn('audio', '🎙️'), recBtn('video', '🎥')) : null);
  box.cleanup = off;
  return box;
}
function commentEl(c) {
  return h('div.comment', avatar(c.authorId, 's'), h('div.bubble', h('b', member(c.authorId).name, ' '),
    c.mediaType === 'audio' ? audioPlayer(c.mediaUrl, c.id) : c.mediaType === 'video' ? h('video', { src: c.mediaUrl, controls: true, playsinline: true }) : c.text,
    h('div.muted', { style: { fontSize: '11px' } }, ago(c.createdAt))));
}

// ---------------------------------------------------------------- vue immersive
export async function openPost(id) {
  let p;
  try { p = await api('/api/posts/' + id); } catch (e) { info('Contenu introuvable'); return; }
  let comments;
  const stage = h('div.stage',
    p.type === 'photo' ? h('img', { src: p.mediaUrl, alt: p.text || 'Photo' }) :
    p.type === 'video' ? h('video', { src: p.mediaUrl, controls: true, autoplay: true, playsinline: true }) :
    p.type === 'audio' ? h('div', { style: { transform: 'scale(1.6)' } }, audioPlayer(p.mediaUrl, p.id, p.duration)) :
    h('div.bigtext', p.text));
  const albumBtn = p.type === 'photo' || p.type === 'video' ? h('button.btn.small', { onclick: () => addToAlbum(p.id) }, '📁 Album') : null;
  const o = overlay(h('div.viewer', stage, h('div.panel',
    h('div.row', avatar(p.authorId, 'l'), h('div.grow', h('b', member(p.authorId).name), h('div.muted', ago(p.createdAt), p.event ? ` · ${p.event}` : ''),
      p.people?.length ? h('div.muted', 'Avec ', p.people.map((x) => member(x).name).join(', ')) : null),
      tvButton({ show: { type: p.type, url: p.mediaUrl, text: p.text, id: p.id } }), albumBtn,
      p.authorId === state.me?.id || state.me?.admin ? h('button.btn.small.danger', { onclick: async () => { if (confirm('Supprimer cette publication ?')) { await api('/api/posts/' + p.id, { method: 'DELETE' }); o.close(); } } }, '🗑') : null),
    p.type !== 'text' && p.text ? h('p', p.text) : null,
    reactionBar('post', p.id, p.reactions),
    comments = commentsBlock('post', p))), { immersive: true, onClose: () => { comments.cleanup(); if (location.hash.startsWith('#/p/')) history.replaceState(null, '', '#/'); } });
}

export async function addToAlbum(postId) {
  const albums = await api('/api/albums');
  sheet('Ajouter à un album', (close) => {
    const title = h('input', { type: 'text', placeholder: 'Nouvel album…' });
    return h('div',
      h('div.targets', albums.map((a) => h('button.target' + (a.postIds.includes(postId) ? '.on' : ''), { onclick: async () => { await api('/api/albums/' + a.id, { method: 'PATCH', body: a.postIds.includes(postId) ? { remove: [postId] } : { add: [postId] } }); info('Album mis à jour'); close(); } }, h('span.ic', '📁'), h('b', a.title), h('span.muted', `${a.postIds.length} éléments`)))),
      h('div.row', { style: { marginTop: '16px' } }, title, h('button.btn.primary', { onclick: async () => { if (!title.value.trim()) return; await api('/api/albums', { body: { title: title.value, postIds: [postId] } }); info('Album créé'); close(); } }, 'Créer')));
  });
}

// Affichage simple d'un média (utilisé par la TV et « Regarder ensemble »)
export function openMedia(m, fromId) {
  const el = m.type === 'photo' ? h('img', { src: m.url, alt: '' }) : m.type === 'video' ? h('video', { src: m.url, controls: true, autoplay: true, playsinline: true }) : m.type === 'audio' ? h('div', { style: { transform: 'scale(1.8)' } }, audioPlayer(m.url, m.id)) : h('div.bigtext', m.text);
  document.querySelectorAll('.overlay.tvshow').forEach((x) => x.remove());
  const o = overlay(h('div.viewer', h('div.stage', el), h('div.panel', h('div.row', fromId ? avatar(fromId) : null, h('span', m.text || '')))), { immersive: true });
  o.el.classList.add('tvshow');
  return o;
}

// Carte flottante du fil familial
export function feedCard(it, i = 0) {
  const card = h('div.fcard.' + (it.type === 'aperotime' ? 'aperotime' : it.type === 'capsule' ? 'capsule' : it.type), { tabindex: 0, style: { '--i': i }, 'data-id': it.id });
  const who = h('div.who', avatar(it.authorId, 's'), h('div', h('b', member(it.authorId).name), h('div.when', ago(it.at))));
  const rx = Object.values(it.reactions || {});
  const rxMini = rx.length ? h('span.react-mini', [...new Set(rx)].join(''), ' ', rx.length) : null;
  if (it.type === 'photo') card.append(h('div.media', h('img', { src: it.mediaUrl, alt: '', loading: 'lazy' })), h('div.shade', who, it.text ? h('div', { style: { fontSize: '14px', marginTop: '6px' } }, it.text.slice(0, 90)) : null), rxMini);
  else if (it.type === 'video') {
    const v = h('video', { src: it.mediaUrl + '#t=0.5', muted: true, loop: true, playsinline: true, preload: 'metadata' });
    v.muted = true;
    const sound = h('button.play-badge', { onclick: (e) => { e.stopPropagation(); v.muted = !v.muted; sound.textContent = v.muted ? '🔇 Aperçu' : '🔊 Son'; if (v.paused) v.play(); }, style: { border: 0, cursor: 'pointer', color: 'inherit' } }, '🔇 Aperçu');
    card.append(h('div.media', v), sound, h('div.shade', who, it.text ? h('div', { style: { fontSize: '14px', marginTop: '6px' } }, it.text.slice(0, 90)) : null), rxMini);
    // Aperçu vivant : lecture muette quand la carte est visible ; son au survol (ordinateur)
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }, { threshold: 0.6 });
    io.observe(card);
    if (matchMedia('(hover: hover)').matches) { card.onmouseenter = () => { v.muted = false; v.play().catch(() => { v.muted = true; }); }; card.onmouseleave = () => { v.muted = true; }; }
  } else if (it.type === 'audio') {
    const ap = audioPlayer(it.mediaUrl, it.id);
    card.append(avatar(it.authorId, 'xl'), h('b', `Vocal de ${member(it.authorId).name}`), ap, h('div.when', ago(it.at)), it.text ? h('div.muted', { style: { padding: '0 16px', textAlign: 'center' } }, it.text.slice(0, 80)) : null, rxMini);
    if (matchMedia('(hover: hover)').matches) { card.onmouseenter = () => ap.audio.play().catch(() => {}); card.onmouseleave = () => ap.audio.pause(); }
  } else if (it.type === 'aperotime') {
    card.append(h('div.kicker', '🍷 Apéro Time'), h('h4', it.title.slice(0, 90)), h('div.txt', it.text), h('div.shade', who), rxMini);
  } else if (it.type === 'capsule') {
    card.append(h('div.kicker', '🎁 Capsule ouverte'), h('h4', { style: { margin: '6px 22px', fontFamily: 'var(--display)', fontSize: '22px' } }, it.title), it.mediaType === 'photo' ? h('img', { src: it.mediaUrl, alt: '', style: { height: '140px', width: '100%', objectFit: 'cover' } }) : h('div.txt', it.text), h('div.shade', who));
  } else card.append(h('div.txt', '“', it.text, '”'), h('div.shade', who), rxMini);
  card.onclick = () => {
    if (it.kind === 'aperotime') location.hash = '#/at/' + it.id;
    else if (it.kind === 'capsule') location.hash = '#/capsules';
    else openPost(it.id);
  };
  card.onkeydown = (e) => { if (e.key === 'Enter') card.click(); };
  return card;
}
export { kindIcon };
