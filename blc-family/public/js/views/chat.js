// Discussion familiale : texte, vocaux, photos, vidéos, réactions — en temps réel.
import { state, api, upload, h, avatar, member, ago, bus, recorder, audioPlayer, info, REACTIONS } from '../core.js';
import { tvButton } from './post.js';

export default async function chat(root) {
  let msgs = await api('/api/messages');
  const list = h('div.chat-list');
  const text = h('textarea', { placeholder: 'Écrire à la famille…', rows: 1 });
  const file = h('input.hidden', { type: 'file', accept: 'image/*,video/*' });
  let rec = null;
  const mic = h('button.icon-btn', { title: 'Message vocal', 'aria-label': 'Message vocal' }, '🎙️');

  function msgEl(m) {
    const me = m.authorId === state.me?.id;
    const rx = Object.entries(m.reactions || {});
    const body = m.type === 'audio' ? audioPlayer(m.mediaUrl, m.id, m.duration) : m.type === 'photo' ? h('img', { src: m.mediaUrl, alt: '', loading: 'lazy' }) : m.type === 'video' ? h('video', { src: m.mediaUrl, controls: true, playsinline: true, preload: 'metadata' }) : m.text;
    const el = h('div.msg' + (me ? '.me' : ''), { 'data-id': m.id }, avatar(m.authorId, 's'),
      h('div', h('div.n', me ? '' : member(m.authorId).name + ' · ', ago(m.createdAt)),
        h('div.b', body, m.type !== 'text' && m.text ? h('div', m.text) : null, m.type === 'photo' || m.type === 'video' ? tvButton({ show: { type: m.type, url: m.mediaUrl, text: m.text } }) : null),
        h('div.rx', { title: 'Réagir', onclick: () => pick(m) }, rx.length ? rx.map(([, e]) => e).join('') : '＋')));
    return el;
  }
  function pick(m) {
    const bar = h('div.react-bar', { style: { position: 'fixed', left: '50%', bottom: '120px', transform: 'translateX(-50%)', zIndex: 60, background: '#2a1c33', padding: '8px', borderRadius: '999px', boxShadow: 'var(--shadow)' } },
      REACTIONS.map(([e]) => h('button', { onclick: async () => { await api('/api/react', { body: { kind: 'msg', id: m.id, emoji: e } }); bar.remove(); } }, e)));
    document.body.append(bar); setTimeout(() => addEventListener('pointerdown', function x(ev) { if (!bar.contains(ev.target)) { bar.remove(); removeEventListener('pointerdown', x); } }), 50);
  }
  const paint = () => { list.replaceChildren(...msgs.map(msgEl)); list.scrollTop = list.scrollHeight; };
  const sendText = async () => {
    const v = text.value.trim(); if (!v) return;
    text.value = ''; text.style.height = '44px';
    try { await api('/api/messages', { body: { type: 'text', text: v } }); } catch (e) { info(e.message); text.value = v; }
  };
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } });
  text.addEventListener('input', () => { text.style.height = '44px'; text.style.height = Math.min(160, text.scrollHeight) + 'px'; });
  file.onchange = async () => {
    const f = file.files[0]; if (!f) return;
    info('Envoi…');
    try { const { url } = await upload(f); await api('/api/messages', { body: { type: f.type.startsWith('video') ? 'video' : 'photo', mediaUrl: url } }); } catch (e) { info(e.message); }
    file.value = '';
  };
  mic.onclick = async () => {
    try {
      if (!rec) { rec = await recorder('audio', 300); rec.start(); mic.textContent = '■'; mic.style.background = '#e5484d'; info('Enregistrement… touchez ■ pour envoyer'); return; }
      const r = await rec.stop(); rec = null; mic.textContent = '🎙️'; mic.style.background = '';
      if (r.duration < 0.8) return;
      const { url } = await upload(r.blob);
      await api('/api/messages', { body: { type: 'audio', mediaUrl: url, duration: r.duration } });
    } catch (e) { info('Micro indisponible : ' + e.message); rec = null; mic.textContent = '🎙️'; mic.style.background = ''; }
  };

  root.append(h('div.chat',
    h('h1.page-title', '💬 Discussion'),
    list,
    state.me ? h('div.composer', h('button.icon-btn', { title: 'Photo ou vidéo', onclick: () => file.click() }, '📎'), file, text, mic, h('button.icon-btn', { title: 'Envoyer', onclick: sendText, style: { background: 'linear-gradient(135deg, var(--amber), var(--wine))' } }, '➤')) : h('p.muted', 'Lecture seule sur cet appareil.')));
  paint();
  const offs = [
    bus.on('ev:msg:new', (m) => { msgs.push(m); const near = list.scrollHeight - list.scrollTop - list.clientHeight < 200; list.append(msgEl(m)); if (near || m.authorId === state.me?.id) list.scrollTop = list.scrollHeight; }),
    bus.on('ev:react', (r) => { if (r.kind !== 'msg') return; const m = msgs.find((x) => x.id === r.id); if (!m) return; m.reactions = r.reactions; list.querySelector(`[data-id="${r.id}"]`)?.replaceWith(msgEl(m)); }),
  ];
  return () => { offs.forEach((f) => f()); rec?.cancel(); };
}
