// Smartphone = CAMÉRA + MICRO de la TV : le téléphone rejoint l'appel comme périphérique média.
import { state, h, confirmBox, info } from '../core.js';
import { startCall, leaveCall, currentCall, switchCam, setMic, setCam } from '../call.js';
import { go } from '../main.js';

export default async function cam(root, { room, device }) {
  const tv = state.presence.find((c) => c.deviceId === device);
  const name = tv?.deviceName || 'la télévision';
  if (!(await confirmBox(`Utiliser ce téléphone comme caméra et micro de « ${name} » ?`, 'Autoriser caméra + micro'))) { go('#/'); return; }
  await startCall(room, { role: 'camera', forDevice: device, facing: 'environment' });
  const c = currentCall();
  if (!c?.local) { info('Caméra refusée'); leaveCall(); go('#/'); return; }
  const video = h('video', { autoplay: true, playsinline: true, muted: true }); video.muted = true; video.srcObject = c.local;
  const bar = h('div.call-bar');
  const paint = () => {
    const cc = currentCall(); if (!cc) return;
    video.srcObject = cc.local; video.classList.toggle('mirror', cc.facing === 'user');
    bar.replaceChildren(
      h('button.cbtn' + (cc.micOn ? '' : '.off'), { onclick: () => { setMic(!cc.micOn); paint(); } }, cc.micOn ? '🎙️' : '🔇'),
      h('button.cbtn' + (cc.camOn ? '' : '.off'), { onclick: () => { setCam(!cc.camOn); paint(); } }, cc.camOn ? '📷' : '🚫'),
      h('button.cbtn', { onclick: async () => { await switchCam(); paint(); } }, '🔄'),
      h('button.cbtn.hang', { onclick: () => { leaveCall(); go('#/'); } }, '📞'));
  };
  const layer = h('div.cam-mode', h('div.cam-info', h('span.live-dot'), h('div', h('b', `Caméra de « ${name} »`), h('div.muted', { style: { fontSize: '13px' } }, 'Posez le téléphone face à la famille. L’appel s’affiche sur la TV.'))), video, bar);
  document.body.append(layer);
  paint();
  try { await navigator.wakeLock?.request('screen'); } catch (_) {}
  return () => { layer.remove(); if (currentCall()?.role === 'camera') leaveCall(); };
}
