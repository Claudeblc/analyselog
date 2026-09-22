// Téléphone : « Autoriser cette télévision à accéder à BLC Family ? »
import { api, h, info } from '../core.js';
import { go } from '../main.js';

export default async function pair(root, { token }) {
  let p;
  try { p = await api('/api/pair/info/' + token); } catch (e) {
    root.append(h('div.glass.card', h('h2', 'Code expiré'), h('p', 'Ce QR code a expiré ou a déjà été utilisé. Un nouveau code s’affiche sur la TV : scannez-le à nouveau.'), h('a.btn', { href: '#/' }, 'Accueil')));
    return;
  }
  const name = h('input', { type: 'text', value: p.deviceName });
  root.append(h('div.glass.card', { style: { maxWidth: '520px', margin: '40px auto', textAlign: 'center' } },
    h('div', { style: { fontSize: '72px' } }, '📺'),
    h('h2.page-title', 'Autoriser cette télévision ?'),
    h('p.muted', 'Elle pourra afficher les contenus de BLC Family (photos, Apéro Time, appels…). Vous pourrez la retirer à tout moment dans les paramètres.'),
    h('div.field', { style: { textAlign: 'left' } }, h('label', 'Nom de l’appareil'), name),
    h('div.row', { style: { justifyContent: 'center' } },
      h('a.btn', { href: '#/' }, 'Refuser'),
      h('button.btn.primary', { onclick: async () => {
        try { await api('/api/pair/approve', { body: { token, deviceName: name.value } }); info('Télévision connectée ✨'); go('#/remote'); } catch (e) { info(e.message); }
      } }, 'Autoriser'))));
}
