// Diaporama cinématique (Notre semaine, cadre familial) : transitions lentes et élégantes.
import { h, avatar, member, fdate } from '../core.js';

export function slideFor(it) {
  const s = h('div.slide');
  const media = it.mediaUrl && (it.type === 'photo' || it.mediaType === 'photo') ? 'photo' : it.mediaUrl && (it.type === 'video' || it.mediaType === 'video') ? 'video' : null;
  if (media === 'photo') s.append(h('div.bg', { style: { backgroundImage: `url("${it.mediaUrl}")` } }), h('img', { src: it.mediaUrl, alt: '' }));
  else if (media === 'video') s.append(h('video', { src: it.mediaUrl, muted: true, playsinline: true, loop: true, preload: 'metadata' }));
  else if (it.type === 'title') s.append(h('div.title-slide', it.title, h('small', it.sub || '')));
  else if (it.type === 'birthday') s.append(h('div.quote', h('span.k', '🎂 Anniversaire'), avatar(it.memberId, 'xl'), h('div', it.days === 0 ? `Joyeux anniversaire ${member(it.memberId).name} !` : `L’anniversaire de ${member(it.memberId).name} dans ${it.days} jour${it.days > 1 ? 's' : ''}`)));
  else s.append(h('div.quote', h('span.k', it.type === 'aperotime' ? `🍷 Apéro Time${it.date ? ' · ' + fdate(it.date, { day: 'numeric', month: 'long', year: 'numeric' }) : ''}` : it.type === 'capsule' ? '🎁 Capsule temporelle' : it.type === 'audio' ? '🎙️ Message vocal' : '💬 Message de la famille'), '“', (it.text || it.title || '').slice(0, 420), '”'));
  if (it.authorId && it.type !== 'title') s.append(h('div.cap', avatar(it.authorId, 'l'), h('span', member(it.authorId).name, it.at ? ` · ${fdate(it.at, { day: 'numeric', month: 'long' })}` : '')));
  return s;
}

export function slideshow(items, { title, ms = 7000, onClose, controls = [] } = {}) {
  let i = 0; let paused = false; let timer;
  const slides = items.map(slideFor);
  const clock = h('div.clock');
  const root = h('div.slideshow', ...slides, title === 'clock' ? clock : null,
    h('div.ctrl', ...controls,
      h('button.icon-btn', { 'data-focus': '', 'aria-label': 'Pause', onclick: (e) => { paused = !paused; e.currentTarget.textContent = paused ? '▶' : '❚❚'; if (!paused) next(); else clearTimeout(timer); } }, '❚❚'),
      h('button.icon-btn.close-ss', { 'data-focus': '', 'aria-label': 'Fermer', onclick: close }, '✕')));
  function show(n) {
    slides.forEach((s, k) => { s.classList.toggle('on', k === n); const v = s.querySelector('video'); if (v) { if (k === n) { v.currentTime = 0; v.play().catch(() => {}); } else v.pause(); } });
  }
  function next() {
    clearTimeout(timer); if (!slides.length) return;
    show(i); const v = slides[i].querySelector('video');
    const d = v && v.duration ? Math.min(20000, v.duration * 1000) : ms;
    i = (i + 1) % slides.length;
    if (!paused) timer = setTimeout(next, d);
  }
  const tick = () => { const d = new Date(); clock.replaceChildren(d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), h('small', d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))); };
  const clockT = setInterval(tick, 10000); tick();
  const onKey = (e) => { if (['Escape', 'Backspace', 'GoBack'].includes(e.key) || e.keyCode === 10009 || e.keyCode === 461) { e.preventDefault(); close(); } if (e.key === 'ArrowRight') { e.preventDefault(); next(); } };
  function close() { clearTimeout(timer); clearInterval(clockT); root.remove(); removeEventListener('keydown', onKey, true); onClose?.(); }
  addEventListener('keydown', onKey, true);
  document.body.append(root);
  next();
  root.querySelector('.close-ss').focus();
  return { close, root };
}
