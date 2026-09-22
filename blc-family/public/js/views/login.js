// Connexion : choisir son profil puis saisir le code famille.
import { state, api, h, avatar } from '../core.js';
import { deviceKind } from '../main.js';

export default function login(root, { onDone }) {
  let chosen = null;
  const err = h('p', { style: { color: 'var(--danger)', minHeight: '24px' } });
  const pin = h('input.pin', { type: 'password', inputmode: 'numeric', autocomplete: 'current-password', placeholder: '••••', 'aria-label': 'Code famille' });
  const who = h('div.who-grid', state.members.map((m) => {
    const b = h('button', { type: 'button', onclick: () => { chosen = m.id; [...who.children].forEach((x) => x.classList.toggle('on', x === b)); pin.focus(); } }, avatar(m.id, 'xl'), h('b', m.name), m.job ? h('small.muted', { style: { fontSize: '12px' } }, m.job) : null);
    return b;
  }));
  const names = { phone: 'Téléphone', tablet: 'Tablette', desktop: 'Ordinateur', tv: 'Télévision' };
  const submit = async (e) => {
    e.preventDefault(); err.textContent = '';
    if (!chosen) { err.textContent = 'Choisissez votre profil.'; return; }
    try {
      await api('/api/login', { body: { memberId: chosen, pin: pin.value, kind: deviceKind, deviceName: `${names[deviceKind]} de ${state.members.find((m) => m.id === chosen).name}` } });
      onDone();
    } catch (x) { err.textContent = x.message; pin.select(); }
  };
  root.append(h('div.login', h('form.box', { onsubmit: submit },
    h('img', { src: '/img/icon.svg', alt: '', style: { width: '84px', margin: '0 auto' } }),
    h('h1', 'BLC Family'), h('p.muted', 'La maison numérique de la famille Belcram'),
    h('h3', 'Qui êtes-vous ?'), who,
    pin, err,
    h('button.btn.primary', { type: 'submit', style: { minWidth: '220px' } }, 'Entrer dans la maison'),
    h('p.muted', { style: { fontSize: '13px', marginTop: '26px' } }, 'Sur une télévision ? Ouvrez cette adresse avec ?tv=1 pour l’associer par QR code.'))));
}
