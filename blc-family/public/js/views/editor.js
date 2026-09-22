// Éditeur Apéro Time (Papa) : brouillon auto, versions, publication / programmation,
// annotations des enfants, aperçus SMARTPHONE | TABLETTE | TV | WHATSAPP.
import { state, api, h, avatar, member, fdate, info, sheet, confirmBox, esc, bus } from '../core.js';
import { go } from '../main.js';

export default async function editor(root, { id }) {
  if (!state.me || (state.me.role !== 'author' && !state.me.admin)) { root.append(h('div.glass.card', h('h2', 'Réservé à l’auteur'), h('p', 'Seul Papa écrit les Apéro Time. Vous pouvez les lire et les annoter.'), h('a.btn', { href: '#/aperotime' }, 'Retour'))); return; }
  let at = id ? await api('/api/aperotimes/' + id) : { title: `Apérotime du ${new Date().toLocaleDateString('fr-FR')}`, date: new Date().toISOString().slice(0, 10), text: '', status: 'draft' };
  let anns = id ? await api(`/api/aperotimes/${id}/annotations`) : [];

  const title = h('input.title-in', { type: 'text', value: at.title, placeholder: 'Titre' });
  const date = h('input', { type: 'date', value: at.date });
  const body = h('textarea.body', { placeholder: 'Il était une fois…' }); body.value = at.text;
  const saveState = h('span.save-state', id ? 'Enregistré' : 'Nouveau brouillon');
  const statusEl = h('span');
  const preview = h('div.preview-box');
  let mode = 'whatsapp'; let split = false; let maxLen = 1500; let collapsed = true;

  async function persist(extra = {}) {
    const data = { title: title.value, date: date.value, text: body.value, ...extra };
    if (!id) { const created = await api('/api/aperotimes', { body: data }); id = created.id; at = created; history.replaceState(null, '', `#/at/${id}/edit`); }
    else at = await api('/api/aperotimes/' + id, { method: 'PUT', body: data });
    saveState.textContent = 'Enregistré à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    paintStatus();
  }
  let t;
  const onInput = () => { saveState.textContent = 'Modifications…'; clearTimeout(t); t = setTimeout(() => persist().catch((e) => { saveState.textContent = '⚠️ ' + e.message; }), 1500); paintPreview(); };
  [title, date, body].forEach((el) => el.addEventListener('input', onInput));

  function paintStatus() {
    const label = { draft: 'Brouillon', scheduled: 'Programmé', published: 'Publié' }[at.status];
    statusEl.replaceChildren(h('span.status.' + at.status, label), at.publishAt ? h('span.muted', ' pour le ', new Date(at.publishAt).toLocaleString('fr-FR')) : null);
    actions.replaceChildren(
      h('button.btn', { onclick: async () => { await persist({ snapshot: true, label: 'Version manuelle' }); info('Version enregistrée'); } }, '💾 Enregistrer une version'),
      h('button.btn', { onclick: showVersions, disabled: !id }, '🕘 Versions'),
      at.status !== 'published' ? h('button.btn', { onclick: schedule }, '⏰ Programmer') : null,
      at.status !== 'published' ? h('button.btn.primary', { onclick: publish }, '🥂 Publier') : h('button.btn', { onclick: async () => { await api(`/api/aperotimes/${id}/unpublish`, { body: {} }); at.status = 'draft'; paintStatus(); } }, 'Dépublier'),
      id && at.status === 'published' ? h('a.btn', { href: '#/at/' + id }, '👁 Voir') : null,
      id && at.status !== 'published' ? h('button.btn.danger', { onclick: async () => { if (await confirmBox('Supprimer ce brouillon ?', 'Supprimer')) { await api('/api/aperotimes/' + id, { method: 'DELETE' }); go('#/aperotime'); } } }, '🗑') : null);
  }
  async function publish() {
    if (!body.value.trim()) return info('Le texte est vide.');
    await persist();
    if (!(await confirmBox('Publier cet Apéro Time pour toute la famille ?', 'Publier 🥂'))) return;
    await api(`/api/aperotimes/${id}/publish`, { body: {} });
    info('Apéro Time publié 🥂'); go('#/at/' + id);
  }
  function schedule() {
    sheet('Programmer la publication', (close) => {
      const d = new Date(Date.now() + 86400000); d.setHours(18, 0, 0, 0);
      const when = h('input', { type: 'datetime-local', value: new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) });
      return h('div', h('div.field', h('label', 'Date et heure'), when), h('div.row', { style: { justifyContent: 'flex-end' } }, h('button.btn', { onclick: close }, 'Annuler'),
        h('button.btn.primary', { onclick: async () => { await persist(); const r = await api(`/api/aperotimes/${id}/publish`, { body: { when: new Date(when.value).toISOString() } }); at.status = r.status; at.publishAt = r.publishAt; paintStatus(); info('Publication programmée'); close(); } }, 'Programmer')));
    });
  }
  async function showVersions() {
    const vs = await api(`/api/aperotimes/${id}/versions`);
    sheet('Versions', (close) => h('ul.versions', { style: { listStyle: 'none', padding: 0 } }, vs.length ? vs.map((v) => h('li',
      h('div', h('b', new Date(v.at).toLocaleString('fr-FR')), h('div.muted', v.label || 'Sauvegarde automatique', ' · ', v.text.length, ' caractères')),
      h('div.row', h('button.btn.small', { onclick: () => sheet('Version du ' + new Date(v.at).toLocaleString('fr-FR'), () => h('div', h('h3', v.title), h('p', { style: { whiteSpace: 'pre-wrap', fontFamily: 'var(--read)' } }, v.text))) }, 'Lire'),
        h('button.btn.small', { onclick: async () => { if (!(await confirmBox('Restaurer cette version ? Le texte actuel sera conservé dans l’historique.', 'Restaurer'))) return; title.value = v.title; body.value = v.text; await persist({ snapshot: true, label: 'Avant restauration' }); paintPreview(); close(); } }, 'Restaurer')))) : h('li.muted', 'Pas encore de version enregistrée.')));
  }

  // Annotations des enfants (lecture seule ici : elles ne modifient jamais le texte)
  const annBox = h('div');
  function paintAnns() {
    annBox.replaceChildren(...(anns.length ? anns.filter((a) => a.range || a.note).map((a) => h('div.ann-item', { style: { '--c': member(a.authorId).color, marginBottom: '8px' } }, avatar(a.authorId, 's'),
      h('div', h('b', member(a.authorId).name), a.range ? h('q', a.range.quote.slice(0, 140)) : null, a.note ? h('div', a.note) : null,
        a.range ? h('div.acts', h('button', { onclick: () => { body.focus(); body.setSelectionRange(a.range.start, a.range.end); } }, 'Situer dans le texte')) : null))) : [h('p.muted', 'Aucune annotation pour l’instant.')]));
  }
  paintAnns();
  const offAnn = bus.on('ev:ann:new', (a) => { if (a.atId === id) { anns.push(a); paintAnns(); info(`${member(a.authorId).name} a annoté votre texte`); } });

  // ------------------------------------------------ aperçus
  const tabs = h('div.tabs');
  function paintTabs() {
    tabs.replaceChildren(...[['phone', '📱 Smartphone'], ['tablet', '📲 Tablette'], ['tv', '📺 TV'], ['whatsapp', '🟢 WhatsApp']].map(([k, l]) => h('button' + (mode === k ? '.on' : ''), { onclick: () => { mode = k; paintTabs(); paintPreview(); } }, l)));
  }
  const paras = (txt) => txt.split('\n').map((p) => h('p', p || ' '));
  function paintPreview() {
    const tt = title.value; const txt = body.value;
    if (mode === 'phone') preview.replaceChildren(h('div.device.phone', h('div.scr', h('div.pv-read', h('small', { style: { color: '#b3541e', letterSpacing: '2px', textTransform: 'uppercase', fontFamily: 'var(--font)' } }, fdate(date.value)), h('h1', tt), paras(txt)))));
    if (mode === 'tablet') preview.replaceChildren(h('div.device.tablet', h('div.scr', h('div.pv-read', { style: { padding: '40px 46px' } }, h('small', { style: { color: '#b3541e' } }, fdate(date.value)), h('h1', { style: { fontSize: '30px' } }, tt), paras(txt)))));
    if (mode === 'tv') preview.replaceChildren(h('div', { style: { paddingBottom: '30px' } }, h('div.device.tv', h('div.scr', h('div.pv-tv', h('small', { style: { color: 'var(--amber)', letterSpacing: '3px', textTransform: 'uppercase', fontFamily: 'var(--font)', fontSize: '11px' } }, 'Apéro Time · ', fdate(date.value)), h('h1', tt), h('p', txt.split('\n').find((x) => x.trim().length > 40) || txt))))), h('p.muted', { style: { textAlign: 'center' } }, 'La TV affiche le texte page par page, lisible à distance.'));
    if (mode === 'whatsapp') preview.replaceChildren(whatsapp(tt, txt));
  }
  function waFormat(s) {
    return esc(s).replace(/```([\s\S]+?)```/g, '<code>$1</code>').replace(/(^|[\s(])\*(\S(?:[^*\n]*\S)?)\*(?=[\s).,!?:;]|$)/gm, '$1<b>$2</b>')
      .replace(/(^|[\s(])_(\S(?:[^_\n]*\S)?)_(?=[\s).,!?:;]|$)/gm, '$1<i>$2</i>').replace(/(^|[\s(])~(\S(?:[^~\n]*\S)?)~(?=[\s).,!?:;]|$)/gm, '$1<s>$2</s>')
      .replace(/(https?:\/\/[^\s<]+)/g, '<span style="color:#027eb5;text-decoration:underline">$1</span>');
  }
  function chunks(full) {
    if (!split || full.length <= maxLen) return [full];
    const out = []; let cur = '';
    for (const p of full.split(/\n(?=\s*\S)/)) {
      if ((cur + '\n' + p).length > maxLen && cur) { out.push(cur); cur = p; } else cur = cur ? cur + '\n' + p : p;
      while (cur.length > maxLen) { const cut = cur.lastIndexOf(' ', maxLen); out.push(cur.slice(0, cut > 0 ? cut : maxLen)); cur = cur.slice(cut > 0 ? cut + 1 : maxLen); }
    }
    if (cur) out.push(cur);
    return out;
  }
  function whatsapp(tt, txt) {
    const full = (txt.startsWith(tt) ? txt : tt + '\n' + txt).trim();
    const parts = chunks(full);
    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const COLLAPSE = 700; // approximation du repli « Lire la suite »
    const bubbles = parts.map((p) => {
      const long = collapsed && p.length > COLLAPSE;
      const b = h('div.bub', { html: waFormat(long ? p.slice(0, COLLAPSE).replace(/\s+\S*$/, '') + '…' : p) });
      if (long) b.append(h('span.more', { onclick: () => { collapsed = false; paintPreview(); } }, 'Lire la suite'));
      b.append(h('span.meta', time, ' ✓✓'));
      return b;
    });
    const scr = h('div.scr', h('div.wa', h('div.wa-head', avatar(state.me.id), h('div', h('b', 'belcram'), h('small', state.members.map((m) => m.name).join(', ')))), h('div.wa-body', h('div.day', h('span', 'AUJOURD’HUI')), bubbles)));
    const words = full.split(/\s+/).filter(Boolean).length;
    const stats = h('div.wa-stats', h('span', `${full.length} caractères`), h('span', `${words} mots`), h('span', `≈ ${Math.max(1, Math.round(words / 200))} min de lecture`), h('span', `${parts.length} message${parts.length > 1 ? 's' : ''}`), h('span.screens'));
    const ctrl = h('div.row', { style: { justifyContent: 'center', marginTop: '10px' } },
      h('label.chip', h('input', { type: 'checkbox', checked: split, onchange: (e) => { split = e.target.checked; paintPreview(); } }), ' Découper en plusieurs messages'),
      split ? h('label.chip', 'max ', h('input', { type: 'number', value: maxLen, min: 300, step: 100, style: { width: '90px', padding: '4px 8px' }, onchange: (e) => { maxLen = Math.max(300, +e.target.value); paintPreview(); } }), ' caractères') : null,
      h('label.chip', h('input', { type: 'checkbox', checked: collapsed, onchange: (e) => { collapsed = e.target.checked; paintPreview(); } }), ' Simuler « Lire la suite »'));
    const out = h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center' } }, h('div.device.phone', scr), stats, ctrl,
      h('p.muted', { style: { fontSize: '12px', maxWidth: '420px', textAlign: 'center' } }, 'Simulation du rendu sur un téléphone : ce n’est pas une intégration officielle de WhatsApp. Le repli « Lire la suite » est approximatif.'));
    requestAnimationFrame(() => { const body2 = scr.querySelector('.wa-body'); if (body2) out.querySelector('.screens').textContent = `≈ ${Math.max(1, Math.ceil(body2.scrollHeight / body2.clientHeight))} écran${body2.scrollHeight > body2.clientHeight ? 's' : ''} de téléphone`; });
    return out;
  }

  const actions = h('div.row');
  root.append(
    h('div.row', { style: { alignItems: 'center', marginBottom: '14px' } }, h('h1.page-title.grow', id ? 'Modifier l’Apéro Time' : 'Nouvel Apéro Time'), statusEl, saveState),
    actions,
    h('div.editor', { style: { marginTop: '16px' } },
      h('div', h('div.field', title), h('div.field', h('label', 'Date de l’Apéro Time'), date), h('div.field', body),
        h('p.muted', { style: { fontSize: '13px' } }, 'Astuce WhatsApp : *gras*, _italique_, ~barré~. Les liens YouTube deviennent des lecteurs dans BLC Family.'),
        h('div.glass.card', h('h3', { style: { marginTop: 0 } }, '✍️ Annotations de vos enfants'), annBox)),
      h('div', tabs, preview)));
  paintStatus(); paintTabs(); paintPreview();
  return () => { clearTimeout(t); if (saveState.textContent === 'Modifications…') persist().catch(() => {}); offAnn(); };
}
