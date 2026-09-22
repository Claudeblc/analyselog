// Appels vidéo : couche persistante (continue pendant la navigation), WebRTC en maillage,
// TV = écran de l'appel, smartphone = caméra + micro de la TV, « Regarder ensemble ».
import { state, api, h, avatar, member, bus, info, sheet, kindIcon, overlay } from './core.js';
import * as rt from './rt.js';
import { isTV, go } from './main.js';

let call = null; // { room, role, forDevice, local, peers, el, grid, mini, ice, facing }

export const inCall = () => !!call;
export const currentCall = () => call;

async function getMedia(role, facing = 'user') {
  if (role === 'screen') return null;
  const video = { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } };
  try { return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video }); } catch (_) {}
  try { return await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (_) {}
  return null;
}

export async function startCall(room = 'call:famille', opts = {}) {
  if (call && call.room === room) { expand(); return call; }
  if (call) leaveCall();
  const role = opts.role || (isTV ? 'screen' : 'member');
  const local = await getMedia(role, opts.facing || (role === 'camera' ? 'environment' : 'user'));
  if (!local && role !== 'screen') info('Caméra et micro indisponibles : vous participez en spectateur.');
  const ice = await api('/api/ice').catch(() => [{ urls: 'stun:stun.l.google.com:19302' }]);
  call = { room, role, forDevice: opts.forDevice || null, local, peers: new Map(), ice, facing: opts.facing || (role === 'camera' ? 'environment' : 'user'), micOn: true, camOn: true, offs: [] };
  if (role !== 'camera') buildUI();
  call.offs.push(
    bus.on('rt:joined', (m) => { if (m.room !== room) return; for (const p of m.peers) { const ex = call.peers.get(p.clientId); if (!ex || ['failed', 'closed', 'disconnected'].includes(ex.pc.connectionState)) { ex?.pc.close(); createPeer(p, true); } } paint(); }),
    bus.on('rt:peer-join', (m) => { if (m.room !== room) return; addPeer(m.peer); paint(); }),
    bus.on('rt:peer-leave', (m) => { if (m.room !== room) return; dropPeer(m.clientId); }),
    bus.on('rt:signal', (m) => { if (m.room === room) onSignal(m.from, m.data); }),
    bus.on('rt:room', (m) => { if (m.room === room) onRoom(m.from, m.data); }),
    bus.on('presence', paint),
  );
  rt.join(room, { role, forDevice: call.forDevice, deviceName: state.device?.name });
  if (opts.invite) rt.send({ t: 'invite', room, members: opts.members });
  // La navigation réduit l'appel en fenêtre flottante
  const onHash = () => { if (call?.el && !location.hash.startsWith('#/appel')) minimize(); };
  addEventListener('hashchange', onHash); call.offs.push(() => removeEventListener('hashchange', onHash));
  return call;
}

export function leaveCall() {
  if (!call) return;
  rt.leave(call.room);
  for (const p of call.peers.values()) p.pc.close();
  call.local?.getTracks().forEach((t) => t.stop());
  call.offs.forEach((f) => f());
  call.el?.remove(); document.querySelector('.watch-layer')?.remove(); document.body.classList.remove('watching');
  call = null;
}

// ---------------------------------------------------------------- pairs WebRTC
function addPeer(info2) {
  if (call.peers.has(info2.clientId)) return call.peers.get(info2.clientId);
  const pc = new RTCPeerConnection({ iceServers: call.ice });
  const p = { info: info2, pc, stream: new MediaStream(), pendingIce: [] };
  call.peers.set(info2.clientId, p);
  pc.onicecandidate = (e) => { if (e.candidate) rt.signal(call.room, info2.clientId, { ice: e.candidate }); };
  pc.ontrack = (e) => { if (!p.stream.getTracks().includes(e.track)) p.stream.addTrack(e.track); paint(); e.track.onunmute = paint; };
  pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') { pc.close(); call.peers.delete(info2.clientId); paint(); } };
  return p;
}
function addLocalTracks(pc) {
  if (call.local) for (const t of call.local.getTracks()) pc.addTrack(t, call.local);
}
async function createPeer(info2, initiator) {
  const p = addPeer(info2);
  if (!initiator) return p;
  addLocalTracks(p.pc);
  if (!call.local || !call.local.getVideoTracks().length) p.pc.addTransceiver('video', { direction: 'recvonly' });
  if (!call.local) p.pc.addTransceiver('audio', { direction: 'recvonly' });
  const offer = await p.pc.createOffer();
  await p.pc.setLocalDescription(offer);
  rt.signal(call.room, info2.clientId, { sdp: p.pc.localDescription });
  return p;
}
async function onSignal(from, data) {
  if (!call) return;
  let p = call.peers.get(from);
  if (data.sdp) {
    if (data.sdp.type === 'offer') {
      if (!p) p = addPeer(call.peerInfo?.[from] || { clientId: from, meta: {} });
      await p.pc.setRemoteDescription(data.sdp);
      addLocalTracks(p.pc);
      const ans = await p.pc.createAnswer();
      await p.pc.setLocalDescription(ans);
      rt.signal(call.room, from, { sdp: p.pc.localDescription });
    } else if (p) await p.pc.setRemoteDescription(data.sdp);
    for (const c of p.pendingIce.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
  } else if (data.ice && p) {
    if (p.pc.remoteDescription) await p.pc.addIceCandidate(data.ice).catch(() => {}); else p.pendingIce.push(data.ice);
  }
}
function dropPeer(id) { const p = call.peers.get(id); if (!p) return; p.pc.close(); call.peers.delete(id); paint(); }

// Informations des pairs (depuis la présence : nom, type d'appareil, rôle)
function peerMeta(id) {
  const c = state.presence.find((x) => x.clientId === id);
  const p = call.peers.get(id);
  const meta = c?.meta?.[call.room] || p?.info?.meta?.[call.room] || p?.info?.meta || {};
  return { ...(c || p?.info || {}), role: meta.role, forDevice: meta.forDevice };
}

// ---------------------------------------------------------------- interface
function buildUI() {
  call.grid = h('div.call-grid');
  call.bar = h('div.call-bar');
  call.top = h('div.call-top');
  call.el = h('div.call', { onclick: (e) => { if (call.el.classList.contains('mini') && !e.target.closest('button')) expand(); } }, call.top, call.grid, call.bar);
  document.getElementById('call-layer').append(call.el);
  paint();
}
const videos = new WeakMap(); // un seul <video> par flux : pas de scintillement au rafraîchissement
function tile({ stream, muted, mirror, memberId, label, icon }) {
  let v = stream && videos.get(stream);
  if (!v) { v = h('video', { autoplay: true, playsinline: true }); if (stream) { v.srcObject = stream; videos.set(stream, v); } }
  v.muted = !!muted; v.classList.toggle('mirror', !!mirror);
  if (v.paused && v.srcObject) v.play().catch(() => {});
  const hasVideo = stream && stream.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted && t.enabled !== false);
  return h('div.vtile', hasVideo ? v : [v, h('div.noav', avatar(memberId, 'xl'))], h('div.label', memberId ? avatar(memberId, 's') : h('span', { style: { paddingLeft: '6px' } }, icon || '📺'), label));
}
function paint() {
  if (!call?.el) return;
  const tiles = [];
  if (call.local && call.role !== 'screen') tiles.push(tile({ stream: call.local, muted: true, mirror: call.facing === 'user', memberId: state.me?.id, label: 'Vous' + (call.micOn ? '' : ' 🔇') }));
  for (const [id, p] of call.peers) {
    const m = peerMeta(id);
    if (m.role === 'screen' && !p.stream.getTracks().length) continue; // TV sans caméra : écran seulement
    const tvName = m.forDevice ? state.presence.find((c) => c.deviceId === m.forDevice)?.deviceName || 'la TV' : null;
    // Le micro du téléphone-caméra ne doit pas ressortir sur sa propre TV (écho)
    const mute = m.forDevice && m.forDevice === state.device?.id;
    tiles.push(tile({ stream: p.stream, muted: mute, memberId: tvName ? null : m.memberId, icon: kindIcon[m.kind], label: tvName ? `📺 ${tvName} (caméra : ${member(m.memberId).name})` : `${member(m.memberId).name} ${kindIcon[m.kind] || ''}` }));
  }
  if (!tiles.length || (tiles.length === 1 && call.role !== 'screen')) tiles.push(h('div.vtile', h('div', { style: { textAlign: 'center', padding: '20px' } }, h('div', { style: { fontSize: '42px' } }, '⏳'), h('p', 'En attente de la famille…'), h('p.muted', 'Une invitation a été envoyée.'))));
  call.grid.replaceChildren(...tiles);
  const btn = (label, icon, fn, cls = '') => h('button.cbtn' + cls, { title: label, 'aria-label': label, 'data-focus': '', onclick: (e) => { e.stopPropagation(); fn(); } }, icon);
  call.bar.replaceChildren(
    call.local?.getAudioTracks().length ? btn(call.micOn ? 'Couper le micro' : 'Activer le micro', call.micOn ? '🎙️' : '🔇', toggleMic, call.micOn ? '' : '.off') : null,
    call.local?.getVideoTracks().length ? btn(call.camOn ? 'Couper la caméra' : 'Activer la caméra', call.camOn ? '📷' : '🚫', toggleCam, call.camOn ? '' : '.off') : null,
    call.local?.getVideoTracks().length ? btn('Changer de caméra', '🔄', switchCam) : null,
    btn('Regarder ensemble', '🍿', watchPicker),
    btn('Utiliser un téléphone comme caméra', '📱', phoneAsCamera),
    call.el.classList.contains('mini') ? btn('Agrandir', '⤢', expand) : btn('Réduire', '🗕', minimize),
    btn('Raccrocher', '📞', leaveCall, '.hang'));
  const qr = call.role === 'screen' && ![...call.peers.keys()].some((id) => peerMeta(id).forDevice === state.device?.id) ? phoneQr() : null;
  call.top.replaceChildren(h('b', '📹 Appel familial'), h('span.muted', `${call.peers.size + 1} participant${call.peers.size ? 's' : ''}`), h('span', { style: { flex: 1 } }), qr);
}
function phoneQr() {
  const url = `${location.origin}/#/cam/${encodeURIComponent(call.room)}/${state.device.id}`;
  return h('div.qr-hint', h('img', { src: '/api/qr?text=' + encodeURIComponent(url), alt: '' }), h('div', h('b', 'Caméra et micro'), h('div', { style: { fontSize: '14px', maxWidth: '200px' } }, 'Scannez avec votre téléphone pour qu’il filme la famille pendant que la TV affiche l’appel.')));
}
function phoneAsCamera() {
  const url = `${location.origin}/#/cam/${encodeURIComponent(call.room)}/${state.device.id}`;
  sheet('📱 Téléphone = caméra + micro', () => h('div', { style: { textAlign: 'center' } }, h('p', 'Scannez ce code avec un téléphone connecté à BLC Family. Il deviendra la caméra et le micro de cet écran.'),
    h('div.qr-box', h('img', { src: '/api/qr?text=' + encodeURIComponent(url), alt: '' })), h('p.muted', 'Posez ensuite le téléphone face à la famille.')));
}
export function minimize() { if (!call?.el) return; call.el.classList.add('mini'); paint(); }
export function expand() { if (!call?.el) return; call.el.classList.remove('mini'); paint(); }
function toggleMic() { call.micOn = !call.micOn; call.local?.getAudioTracks().forEach((t) => { t.enabled = call.micOn; }); paint(); bus.emit('call:local'); }
function toggleCam() { call.camOn = !call.camOn; call.local?.getVideoTracks().forEach((t) => { t.enabled = call.camOn; }); paint(); bus.emit('call:local'); }
export async function switchCam() {
  if (!call?.local) return;
  call.facing = call.facing === 'user' ? 'environment' : 'user';
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: call.facing } } }).catch(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: call.facing } }));
    const nt = s.getVideoTracks()[0];
    const old = call.local.getVideoTracks()[0];
    for (const p of call.peers.values()) { const sender = p.pc.getSenders().find((x) => x.track?.kind === 'video'); await sender?.replaceTrack(nt); }
    if (old) { call.local.removeTrack(old); old.stop(); }
    call.local.addTrack(nt); nt.enabled = call.camOn;
    paint(); bus.emit('call:local');
  } catch (e) { info('Impossible de changer de caméra'); }
}
export function setMic(on) { if (call && call.micOn !== on) toggleMic(); }
export function setCam(on) { if (call && call.camOn !== on) toggleCam(); }

// ---------------------------------------------------------------- Regarder ensemble
async function watchPicker() {
  const [posts, ats] = await Promise.all([api('/api/posts?type=photo,video'), api('/api/aperotimes')]);
  sheet('🍿 Regarder ensemble', (close) => h('div',
    h('h3', 'Apéro Time'), h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflow: 'auto' } },
      ats.filter((a) => a.status === 'published').slice(0, 30).map((a) => h('button.btn', { style: { justifyContent: 'flex-start' }, onclick: () => { share({ type: 'aperotime', id: a.id }); close(); } }, '🍷 ', a.title.slice(0, 60)))),
    h('h3', 'Photos et vidéos'), h('div.masonry', { style: { columns: '3 120px' } },
      posts.slice(0, 60).map((p) => h('div.g-item', { onclick: () => { share({ type: p.type, url: p.mediaUrl, text: p.text, id: p.id }); close(); } }, p.type === 'photo' ? h('img', { src: p.mediaUrl, alt: '', loading: 'lazy' }) : h('video', { src: p.mediaUrl + '#t=0.5', muted: true, preload: 'metadata' }), p.type === 'video' ? h('span.vid-badge', '▶') : null)))));
}
function share(item) { rt.toRoom(call.room, { watch: item, by: state.me?.id }); openWatch(item, state.me?.id, true); }
let applying = false;
function openWatch(item, by, mine) {
  if (item.type === 'aperotime') { minimize(); go('#/at/' + item.id); return; }
  document.querySelector('.watch-layer')?.remove();
  const media = item.type === 'photo' ? h('img', { src: item.url, alt: '' }) : h('video', { src: item.url, controls: true, playsinline: true, autoplay: mine });
  const layer = h('div.watch-layer', h('div.call-top', avatar(by, 's'), h('b', `${member(by).name} partage`), h('span', { style: { flex: 1 } }),
    h('button.btn', { 'data-focus': '', onclick: () => { layer.remove(); document.body.classList.remove('watching'); if (mine) rt.toRoom(call.room, { watchEnd: true }); } }, 'Fermer')), h('div.stage', media), item.text ? h('p', { style: { textAlign: 'center', padding: '0 16px 16px' } }, item.text) : null);
  if (item.type === 'video') {
    const emit = (action) => () => { if (applying) return; rt.toRoom(call.room, { wctl: { action, t: media.currentTime } }); };
    media.addEventListener('play', emit('play')); media.addEventListener('pause', emit('pause')); media.addEventListener('seeked', emit('seek'));
  }
  document.body.append(layer); document.body.classList.add('watching'); minimize();
}
function onRoom(from, d) {
  if (d.watch) { openWatch(d.watch, d.by, false); }
  if (d.watchEnd) { document.querySelector('.watch-layer')?.remove(); document.body.classList.remove('watching'); }
  if (d.wctl) {
    const v = document.querySelector('.watch-layer video'); if (!v) return;
    applying = true;
    if (Math.abs(v.currentTime - d.wctl.t) > 0.6) v.currentTime = d.wctl.t;
    if (d.wctl.action === 'play') v.play().catch(() => {}); if (d.wctl.action === 'pause') v.pause();
    setTimeout(() => { applying = false; }, 400);
  }
}
