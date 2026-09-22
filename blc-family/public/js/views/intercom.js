// Interphone familial : un vocal court vers une ou plusieurs TV / appareils.
import { state, api, upload, h, avatar, member, bus, recorder, wave, info, kindIcon, dur } from '../core.js';

export default function intercom(root) {
  const chosen = new Set();
  const targets = h('div.targets');
  let rec = null; let started = 0; let tick;
  const text = h('input', { type: 'text', placeholder: 'Petit mot affiché avec le vocal (facultatif)', maxlength: 200 });
  const btn = h('button.rec-btn', '🎙️');
  const label = h('p.muted', 'Maintenez ou touchez pour parler (30 s max)');
  const waveBox = h('div');

  function devices() {
    const map = new Map();
    for (const c of state.presence) if (c.deviceId !== state.device?.id) map.set(c.deviceId, c);
    return [...map.values()].sort((a, b) => (a.kind === 'tv' ? -1 : 1) - (b.kind === 'tv' ? -1 : 1));
  }
  function paint() {
    const list = devices();
    for (const id of [...chosen]) if (!list.some((d) => d.deviceId === id)) chosen.delete(id);
    if (!chosen.size) list.filter((d) => d.kind === 'tv').forEach((d) => chosen.add(d.deviceId));
    targets.replaceChildren(...(list.length ? list.map((d) => h('button.target' + (chosen.has(d.deviceId) ? '.on' : ''), { onclick: () => { chosen.has(d.deviceId) ? chosen.delete(d.deviceId) : chosen.add(d.deviceId); paint(); } },
      h('span.ic', kindIcon[d.kind] || '💻'), h('b', d.deviceName), d.memberId ? h('span.muted', member(d.memberId).name) : h('span.muted', 'Appareil familial'))) : [h('p.muted', 'Aucun autre appareil allumé. Allumez la TV (BLC Family) pour lui parler.')]));
  }
  async function start() {
    if (rec) return;
    if (!chosen.size) return info('Choisissez au moins un appareil.');
    try { rec = await recorder('audio', 30); } catch (e) { return info('Micro indisponible : ' + e.message); }
    rec.start(); started = Date.now(); btn.classList.add('on'); btn.textContent = '■';
    waveBox.replaceChildren(wave('live', 30, true));
    tick = setInterval(() => { label.textContent = `Enregistrement ${dur((Date.now() - started) / 1000)} — relâchez ou touchez pour envoyer`; }, 250);
  }
  async function stop() {
    if (!rec) return;
    clearInterval(tick);
    const r = await rec.stop(); rec = null; btn.classList.remove('on'); btn.textContent = '🎙️'; waveBox.replaceChildren();
    label.textContent = 'Maintenez ou touchez pour parler (30 s max)';
    if (!r || r.duration < 0.6) return;
    const { url } = await upload(r.blob);
    const res = await api('/api/intercom', { body: { mediaUrl: url, targets: [...chosen], text: text.value, duration: r.duration } });
    info(res.delivered ? `📢 Message diffusé sur ${res.delivered} appareil${res.delivered > 1 ? 's' : ''}` : 'Aucun appareil n’a reçu le message');
    text.value = '';
  }
  let pressT = 0;
  btn.addEventListener('pointerdown', () => { pressT = Date.now(); if (!rec) start(); });
  btn.addEventListener('pointerup', () => { if (rec && Date.now() - pressT > 600) stop(); });
  btn.addEventListener('click', () => { if (rec && Date.now() - pressT <= 600 && Date.now() - started > 700) stop(); });

  root.append(h('div', { style: { maxWidth: '760px', margin: '0 auto' } },
    h('h1.page-title', '📢 Interphone'),
    h('p.page-sub', 'Envoyez un vocal qui s’affiche sur la TV ou un autre écran de la maison. Les appareils en mode silencieux affichent le message sans le jouer.'),
    h('h2.section-title', 'Vers'), targets,
    h('div.glass.card', { style: { marginTop: '22px', textAlign: 'center' } }, avatar(state.me?.id, 'l'), h('div.rec', btn, waveBox, label), text)));
  paint();
  const off = bus.on('presence', paint);
  return () => { off(); rec?.cancel(); clearInterval(tick); };
}
