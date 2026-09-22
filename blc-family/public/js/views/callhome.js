// Appels vidéo : appeler toute la famille ou une personne, depuis n'importe quel écran.
import { state, h, avatar, member, bus, isOnline } from '../core.js';
import { startCall, inCall, currentCall, expand } from '../call.js';
import { isTV } from '../main.js';

export default function callhome(root) {
  const box = h('div');
  root.append(h('h1.page-title', '📹 Appels vidéo'), h('p.page-sub', isTV ? 'La TV affiche l’appel ; un téléphone peut servir de caméra et de micro.' : 'Appelez la famille depuis ce téléphone, cette tablette ou cet ordinateur. L’appel continue pendant que vous naviguez.'), box);
  function paint() {
    const c = currentCall();
    const activeRooms = [...new Set(state.presence.flatMap((p) => Object.keys(p.meta || {}).filter((r) => r.startsWith('call:'))))];
    box.replaceChildren(
      c ? h('div.glass.card', { style: { marginBottom: '18px' } }, h('b', 'Vous êtes en appel.'), ' ', h('button.btn.small', { onclick: expand }, 'Revenir à l’appel')) : null,
      h('div.tiles', { style: { marginBottom: '24px' } },
        h('button.tile', { style: { '--t1': '#0e8f95', '--t2': '#0f2f3a', textAlign: 'left' }, onclick: () => startCall('call:famille', { invite: true }) }, h('span.emoji', '👨‍👩‍👧‍👦'), h('h3', 'Toute la famille'), h('p', activeRooms.includes('call:famille') ? '🟢 Un appel est en cours — rejoindre' : 'Tout le monde reçoit l’invitation'))),
      state.me ? [h('h2.section-title', 'Appeler quelqu’un'),
        h('div.targets', state.members.filter((m) => m.id !== state.me.id).map((m) => h('button.target', { onclick: () => startCall('call:' + [state.me.id, m.id].sort().join('-'), { invite: true, members: [m.id] }) },
          avatar(m.id, 'l', isOnline(m.id)), h('b', m.name), h('span.muted', isOnline(m.id) ? 'En ligne' : 'Hors ligne'))))] : null);
  }
  paint();
  const off = bus.on('presence', paint);
  return off;
}
