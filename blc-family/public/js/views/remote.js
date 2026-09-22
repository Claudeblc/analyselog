// Téléphone = télécommande de la TV (déplacer, ouvrir, lecture, retour, envoyer un contenu).
import { state, api, h, bus, info, member } from '../core.js';
import * as rt from '../rt.js';
import { deviceKind } from '../main.js';

export default async function remote(root) {
  let target = localStorage.getItem('blcf.remoteTarget');
  const box = h('div.remote');
  root.append(box);

  function tvs() { return [...new Map(state.presence.filter((c) => c.kind === 'tv').map((c) => [c.deviceId, c])).values()]; }
  function paint() {
    const list = tvs();
    if (!list.some((t) => t.deviceId === target)) target = list[0]?.deviceId || null;
    const send = (cmd) => { if (!target) return info('Aucune TV allumée'); rt.tv(target, cmd); navigator.vibrate?.(15); };
    const k = (key, label, cls = '') => h('button' + cls, { onclick: () => send({ key }), 'aria-label': key }, label);
    box.replaceChildren(
      h('h1.page-title', '🎮 Télécommande'),
      list.length ? h('div.chips', { style: { justifyContent: 'center' } }, list.map((t) => h('button.chip' + (t.deviceId === target ? '.on' : ''), { onclick: () => { target = t.deviceId; localStorage.setItem('blcf.remoteTarget', target); paint(); } }, '📺 ', t.deviceName)))
        : h('div.glass.card', h('p', 'Aucune télévision connectée n’est allumée.'), h('p.muted', 'Sur la TV, ouvrez BLC Family avec « ?tv=1 » à la fin de l’adresse puis scannez le QR code affiché avec ce téléphone.')),
      h('div.dpad', h('span'), k('up', '▲'), h('span'), k('left', '◀'), k('ok', 'OK', '.ok'), k('right', '▶'), h('span'), k('down', '▼'), h('span')),
      h('div.row', { style: { justifyContent: 'center' } }, k('back', '↩ Retour', '.btn'), k('home', '🏠 Accueil', '.btn'), k('playpause', '⏯ Lecture', '.btn')),
      h('h2.section-title', { style: { justifyContent: 'center' } }, 'Afficher sur la TV'),
      h('div.row', { style: { justifyContent: 'center' } },
        h('button.btn', { onclick: () => send({ open: { kind: 'route', hash: '#/aperotime' } }) }, '🍷 Apéro Time'),
        h('button.btn', { onclick: () => send({ open: { kind: 'route', hash: '#/galerie' } }) }, '🖼️ Galerie'),
        h('button.btn', { onclick: () => send({ frame: true }) }, '🖼 Cadre familial'),
        h('button.btn', { onclick: () => send({ call: { room: 'call:famille' } }) }, '📹 Appel sur la TV')),
      h('p.muted', { style: { marginTop: '22px' } }, 'Astuce : dans la galerie, la discussion ou un Apéro Time, le bouton « 📺 Afficher sur la TV » envoie directement le contenu.'));
  }
  paint();
  const off = bus.on('presence', paint);
  return off;
}
