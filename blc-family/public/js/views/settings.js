// Paramètres : profil, famille, cet appareil (TV, silencieux, orientation), appareils associés.
import { state, api, upload, h, avatar, member, info, kindIcon, ago, confirmBox } from '../core.js';
import { deviceKind } from '../main.js';

export default async function settings(root) {
  const devices = await api('/api/devices');
  const me = state.me;
  const saveDevice = (s) => api('/api/devices/' + state.device.id, { method: 'PATCH', body: { settings: s } }).then(() => { state.settings = { ...state.settings, ...s }; info('Enregistré'); });

  // Profil
  const profile = me ? (() => {
    const m = member(me.id);
    const name = h('input', { type: 'text', value: m.name });
    const color = h('input', { type: 'color', value: m.color });
    const bday = h('input', { type: 'date', value: m.birthday || '' });
    const av = h('div', avatar(me.id, 'xl'));
    const file = h('input.hidden', { type: 'file', accept: 'image/*' });
    file.onchange = async () => { const f = file.files[0]; if (!f) return; const { url } = await upload(f); await api('/api/members/' + me.id, { method: 'PATCH', body: { avatar: url } }); m.avatar = url; av.replaceChildren(avatar(me.id, 'xl')); };
    return h('div.glass.card', h('h2', 'Mon profil'),
      h('div.row', av, h('button.btn.small', { onclick: () => file.click() }, 'Changer la photo'), file),
      h('div.field', { style: { marginTop: '14px' } }, h('label', 'Prénom'), name),
      h('div.row', h('div.field', h('label', 'Ma couleur d’annotation'), color), h('div.field.grow', h('label', 'Anniversaire'), bday)),
      h('button.btn.primary', { onclick: async () => { const r = await api('/api/members/' + me.id, { method: 'PATCH', body: { name: name.value, color: color.value, birthday: bday.value } }); Object.assign(m, r); info('Profil mis à jour'); } }, 'Enregistrer'));
  })() : null;

  // Famille (admin)
  const family = h('div.glass.card', h('h2', 'La famille'),
    state.members.map((m) => h('div.dev-row', avatar(m.id), h('div.grow', h('b', m.name), h('div.muted', m.role === 'author' ? '✍️ Auteur des Apéro Time' : '📖 Lecteur / relecteur')),
      me?.admin && m.id !== me.id ? h('select', { style: { width: 'auto' }, onchange: async (e) => { await api('/api/members/' + m.id, { method: 'PATCH', body: { role: e.target.value } }); info('Rôle mis à jour'); } },
        h('option', { value: 'reader', selected: m.role === 'reader' }, 'Lecteur'), h('option', { value: 'author', selected: m.role === 'author' }, 'Auteur')) : null)),
    me?.admin ? (() => { const n = h('input', { type: 'text', placeholder: 'Prénom du nouveau membre' }); return h('div.row', { style: { marginTop: '12px' } }, n, h('button.btn', { onclick: async () => { if (!n.value.trim()) return; await api('/api/members', { body: { name: n.value } }); info('Membre ajouté — il se connecte avec le code famille'); location.reload(); } }, 'Ajouter')); })() : null);

  // Cet appareil
  const s = state.settings;
  const sw = (label, key, def) => h('label.switch', h('span', label), h('input', { type: 'checkbox', checked: s[key] ?? def, onchange: (e) => saveDevice({ [key]: e.target.checked }) }));
  const devName = h('input', { type: 'text', value: state.device.name });
  const thisDevice = h('div.glass.card', h('h2', `${kindIcon[deviceKind] || '💻'} Cet appareil`),
    h('div.row', devName, h('button.btn', { onclick: () => api('/api/devices/' + state.device.id, { method: 'PATCH', body: { name: devName.value } }).then(() => info('Renommé')) }, 'Renommer')),
    h('div.field', { style: { marginTop: '14px' } }, h('label', 'Type d’écran'), h('select', { onchange: (e) => { localStorage.setItem('blcf.kind', e.target.value); location.reload(); } },
      ['phone', 'tablet', 'desktop', 'tv'].map((k) => h('option', { value: k, selected: deviceKind === k }, { phone: '📱 Smartphone', tablet: '📲 Tablette', desktop: '💻 Ordinateur', tv: '📺 Télévision' }[k])))),
    deviceKind === 'tv' ? h('div.field', h('label', 'Orientation de la TV'), h('select', { onchange: (e) => { e.target.value ? localStorage.setItem('blcf.orient', e.target.value) : localStorage.removeItem('blcf.orient'); location.reload(); } },
      h('option', { value: '', selected: !localStorage.getItem('blcf.orient') }, 'Automatique'), h('option', { value: 'landscape', selected: localStorage.getItem('blcf.orient') === 'landscape' }, 'Horizontale 16:9'), h('option', { value: 'portrait', selected: localStorage.getItem('blcf.orient') === 'portrait' }, 'Verticale 9:16'))) : null,
    sw('🔕 Mode silencieux (aucun son joué automatiquement)', 'silent', false),
    sw('📢 Jouer automatiquement l’interphone', 'intercomAutoplay', true),
    deviceKind === 'tv' ? h('div.field', h('label', 'Cadre familial après (secondes d’inactivité)'), h('input', { type: 'number', min: 30, value: s.frameDelay || 120, onchange: (e) => saveDevice({ frameDelay: Math.max(30, +e.target.value) }) })) : null);

  // Appareils associés
  const devList = h('div.glass.card', h('h2', 'Appareils de la famille'),
    devices.sort((a, b) => b.lastSeen - a.lastSeen).map((d) => h('div.dev-row', h('span.ic', kindIcon[d.kind] || '💻'),
      h('div.grow', h('b', d.name), h('div.muted', d.online ? '🟢 en ligne' : 'vu ' + ago(d.lastSeen), d.memberId ? ` · ${member(d.memberId).name}` : ' · appareil familial')),
      d.id !== state.device.id && me && (me.admin || d.memberId === me.id || !d.memberId) ? h('button.btn.small.danger', { onclick: async () => { if (await confirmBox(`Retirer « ${d.name} » ?`, 'Retirer')) { await api('/api/devices/' + d.id, { method: 'DELETE' }); location.reload(); } } }, 'Retirer') : null)),
    h('p.muted', { style: { marginTop: '14px' } }, '📺 Connecter une TV : ouvrez BLC Family sur la TV en ajoutant « ?tv=1 » à l’adresse (ou « ?tv=vertical » pour une TV verticale), puis scannez le QR code avec votre téléphone.'));

  root.append(h('h1.page-title', '⚙️ Paramètres'), h('div.settings-grid', profile, thisDevice, family, devList,
    h('div.glass.card', h('h2', 'Applications'), h('p', h('a', { href: state.links.music, target: '_blank', rel: 'noopener' }, '🎵 BLC Music Player')), h('p', h('a', { href: state.links.tv, target: '_blank', rel: 'noopener' }, '📺 BLC TV Player')),
      h('button.btn', { onclick: async () => { await api('/api/logout', { body: {} }); localStorage.removeItem('blcf.kind'); location.href = '/'; } }, 'Se déconnecter de cet appareil'))));
}
