// Premier lancement sur une TV : « Connecter cette télévision » + QR code.
// Le QR ne contient qu'un jeton d'appairage temporaire, aléatoire, à usage unique.
import { api, h } from '../core.js';

export default async function tvpair(root, { onDone }) {
  const box = h('div.login'); root.append(box);
  let stop = false;
  const name = localStorage.getItem('blcf.tvname') || 'TV du salon';
  async function cycle() {
    const p = await api('/api/pair/start', { body: { deviceName: name, kind: 'tv' } });
    const url = `${location.origin}/#/pair/${p.token}`;
    const left = h('b');
    box.replaceChildren(h('div.box',
      h('img', { src: '/img/icon.svg', alt: '', style: { width: '90px', margin: '0 auto' } }),
      h('h1', 'Connecter cette télévision'),
      h('p.muted', { style: { fontSize: '22px' } }, 'Scannez ce QR code avec le téléphone d’un membre de la famille.'),
      h('div.qr-box', { style: { margin: '26px auto' } }, h('img', { src: '/api/qr?text=' + encodeURIComponent(url), alt: 'QR code d’appairage' })),
      h('p.muted', 'Code valable ', left, ' — il se renouvelle automatiquement.')));
    const tick = setInterval(() => { const s = Math.max(0, Math.round((p.expiresAt - Date.now()) / 1000)); left.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500);
    while (!stop) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const r = await api('/api/pair/claim', { body: { token: p.token, secret: p.secret } });
        if (r.status === 'approved') { clearInterval(tick); stop = true; onDone(); return; }
      } catch (e) { if (e.status === 410) break; }
    }
    clearInterval(tick);
    if (!stop) cycle();
  }
  cycle();
  return () => { stop = true; };
}
