// Lecteur Apéro Time : pages identiques sur tous les écrans, annotations collaboratives,
// synchronisation temps réel tablette ↔ TV (page, sélection + zoom, encre en direct, réactions).
import { state, api, h, avatar, member, fdate, sheet, info, bus, floatReaction, reactionBar, REACTIONS, youtubeId, overlay, kindIcon, confirmBox } from '../core.js';
import * as rt from '../rt.js';
import { commentsBlock, tvButton } from './post.js';
import { isTV } from '../main.js';

const PW = 900; const PH = 1180; const BOTTOM = 90;
const SVGNS = 'http://www.w3.org/2000/svg';

// ---------------------------------------------------------------- pagination déterministe
function paragraphs(text) {
  const out = []; let pos = 0;
  for (const line of text.split('\n')) {
    const start = pos; pos += line.length + 1;
    if (line.trim()) out.push({ start, end: start + line.length });
  }
  return out;
}
function sentenceCuts(text, start, end) {
  const cuts = []; const re = /[.!?…»]\s+/g; re.lastIndex = 0;
  const s = text.slice(start, end); let m;
  while ((m = re.exec(s))) cuts.push(start + m.index + m[0].length);
  if (!cuts.length) { for (let i = start + 300; i < end; i += 300) { const sp = text.lastIndexOf(' ', i); cuts.push(sp > start ? sp + 1 : i); } }
  return cuts.filter((c) => c > start && c < end);
}
async function paginate(at) {
  await document.fonts.ready;
  const meas = h('div.page', { style: { position: 'absolute', left: '-99999px', top: '0', visibility: 'hidden', height: 'auto' } });
  const head = headEl(at); const txt = h('div.txt');
  meas.append(head, txt); document.body.append(meas);
  const pages = []; let cur = { pieces: [], head: true };
  const fits = () => txt.offsetTop + txt.offsetHeight <= PH - BOTTOM;
  const tryAdd = (st, en) => { const p = h('p', at.text.slice(st, en)); txt.append(p); if (fits()) return true; p.remove(); return false; };
  const newPage = () => { pages.push(cur); cur = { pieces: [], head: false }; head.remove(); txt.replaceChildren(); };
  for (const para of paragraphs(at.text)) {
    let s = para.start;
    const cuts = sentenceCuts(at.text, para.start, para.end);
    while (s < para.end) {
      if (tryAdd(s, para.end)) { cur.pieces.push({ start: s, end: para.end }); break; }
      // Le reste du paragraphe ne tient pas : couper à la dernière phrase qui tient
      let best = null;
      for (const c of cuts) { if (c <= s) continue; if (tryAdd(s, c)) { txt.lastChild.remove(); best = c; } else break; }
      if (best) { tryAdd(s, best); cur.pieces.push({ start: s, end: best, cont: true }); s = best; newPage(); continue; }
      if (cur.pieces.length || cur.head) { newPage(); continue; }
      // Page vide et même une phrase ne tient pas : forcer
      const c = cuts.find((x) => x > s) || para.end;
      tryAdd(s, c); cur.pieces.push({ start: s, end: c, cont: c < para.end }); s = c;
      if (s < para.end) newPage();
    }
  }
  pages.push(cur); meas.remove();
  return pages.map((p) => ({ ...p, start: p.pieces[0]?.start ?? 0, end: p.pieces[p.pieces.length - 1]?.end ?? 0 }));
}
function headEl(at) {
  return h('div.p-head', h('div.d', fdate(at.date)), h('h1', at.title),
    at.rewriteOf ? h('div', { style: { fontFamily: 'var(--font)', fontSize: '15px', color: '#9a6b4f', marginTop: '6px' } }, '♻️ Réédition', typeof at.rewriteOf === 'string' && /^\d{4}/.test(at.rewriteOf) ? ` du ${fdate(at.rewriteOf, { day: 'numeric', month: 'long', year: 'numeric' })}` : '') : null);
}

// ---------------------------------------------------------------- formes SVG
function pathFor(a) {
  const p = a.shape.points;
  if (a.kind === 'circle' && p.length >= 2) {
    const [x1, y1] = p[0]; const [x2, y2] = p[p.length - 1];
    const cx = (x1 + x2) / 2; const cy = (y1 + y2) / 2; const rx = Math.max(8, Math.abs(x2 - x1) / 2 + 6); const ry = Math.max(8, Math.abs(y2 - y1) / 2 + 6);
    return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
  }
  if (a.kind === 'arrow' && p.length >= 2) {
    const [x1, y1] = p[0]; const [x2, y2] = p[p.length - 1];
    const ang = Math.atan2(y2 - y1, x2 - x1); const L = 22;
    return `M ${x1} ${y1} L ${x2} ${y2} M ${x2 - L * Math.cos(ang - 0.45)} ${y2 - L * Math.sin(ang - 0.45)} L ${x2} ${y2} L ${x2 - L * Math.cos(ang + 0.45)} ${y2 - L * Math.sin(ang + 0.45)}`;
  }
  if (!p.length) return '';
  let d = `M ${p[0][0]} ${p[0][1]}`;
  for (let i = 1; i < p.length - 1; i++) { const mx = (p[i][0] + p[i + 1][0]) / 2; const my = (p[i][1] + p[i + 1][1]) / 2; d += ` Q ${p[i][0]} ${p[i][1]} ${mx} ${my}`; }
  if (p.length > 1) d += ` L ${p[p.length - 1][0]} ${p[p.length - 1][1]}`;
  return d;
}
function svgPath(a, color, animate) {
  const el = document.createElementNS(SVGNS, 'path');
  el.setAttribute('d', pathFor(a)); el.setAttribute('stroke', color); el.setAttribute('stroke-width', a.shape.width || 4);
  el.style.opacity = a.kind === 'draw' ? 0.85 : 0.9;
  el.dataset.ann = a.id || '';
  if (animate) requestAnimationFrame(() => { const len = el.getTotalLength?.() || 1000; el.style.setProperty('--len', len); el.classList.add('appear'); });
  return el;
}

// ---------------------------------------------------------------- vue
export default async function reader(root, { id }) {
  const at = await api('/api/aperotimes/' + id);
  let anns = await api(`/api/aperotimes/${id}/annotations`);
  const room = 'at:' + id;
  const live = /live=1/.test(location.hash);
  const canModerate = state.me && (at.authorId === state.me.id || state.me.admin);
  let pages = await paginate(at);
  let page = 0; let tool = 'select'; let sync = true; let showHidden = false;
  const hiddenAuthors = new Set(); const fresh = new Set();
  let peers = [];

  // Structure
  const wrap = h('div.page-wrap', { tabindex: 0, 'data-focus': '', 'aria-label': 'Page' });
  const scaler = h('div.page-scaler'); wrap.append(scaler);
  const pager = h('div.pager');
  const liveBar = h('div.live-bar');
  const side = h('aside.side');
  const toolbar = h('div.toolbar');
  root.append(liveBar, h('div.reader', h('div', toolbar, wrap, pager), side));

  // ------------------------------------------------ échelle
  let scale = 1;
  function fit() {
    const w = wrap.clientWidth || root.clientWidth;
    scale = w / PW;
    if (isTV) scale = Math.min(scale, (innerHeight - wrap.getBoundingClientRect().top - 90) / PH);
    scaler.style.transform = `scale(${scale})`;
    scaler.style.left = Math.max(0, (w - PW * scale) / 2) + 'px';
    wrap.style.height = PH * scale + 'px';
  }
  const ro = new ResizeObserver(fit); ro.observe(wrap);

  // ------------------------------------------------ rendu d'une page
  const visible = (a) => (showHidden || !a.hidden) && !hiddenAuthors.has(a.authorId);
  function renderPage(flip) {
    const pg = pages[page];
    const el = h('div.page' + (flip ? '.flip' : ''));
    if (pg.head) el.append(headEl(at));
    const txt = h('div.txt');
    const textAnns = anns.filter((a) => a.range && visible(a));
    for (const piece of pg.pieces) {
      const p = h('p', piece.cont ? { style: { marginBottom: '0' } } : null);
      // Découpage en segments selon les bornes des annotations
      const bounds = new Set([piece.start, piece.end]);
      for (const a of textAnns) { if (a.range.end > piece.start && a.range.start < piece.end) { bounds.add(Math.max(piece.start, a.range.start)); bounds.add(Math.min(piece.end, a.range.end)); } }
      const b = [...bounds].sort((x, y) => x - y);
      for (let i = 0; i < b.length - 1; i++) {
        const s = b[i]; const e = b[i + 1];
        const covering = textAnns.filter((a) => a.range.start <= s && a.range.end >= e);
        const span = h('span', { 'data-off': s }, at.text.slice(s, e));
        const top = covering[covering.length - 1];
        if (top) {
          span.classList.add('ann', top.kind === 'underline' ? 'ul' : top.kind === 'comment' ? 'cm' : 'hl');
          if (covering.some((a) => fresh.has(a.id))) span.classList.add('new');
          span.style.setProperty('--c', member(top.authorId).color);
          span.dataset.ann = top.id; span.title = covering.map((a) => `${member(a.authorId).name}${a.note ? ' : ' + a.note : ''}`).join('\n');
        }
        p.append(span);
        for (const a of textAnns) if (a.kind === 'comment' && a.range.end === e) {
          const n = anns.filter((x) => x.kind === 'comment').indexOf(a) + 1;
          p.append(h('span.ann-mark', { 'data-skip': '1', contenteditable: 'false', style: { '--c': member(a.authorId).color }, title: `${member(a.authorId).name} : ${a.note}`, onclick: () => showNote(a) }, n));
        }
      }
      txt.append(p);
    }
    el.append(txt, h('div.pno', `${page + 1} / ${pages.length}`));
    // Notes positionnées
    for (const a of anns.filter((x) => x.kind === 'note' && x.shape?.page === page && visible(x))) {
      const [x, y] = a.shape.points[0] || [0, 0];
      el.append(h('div', { style: { position: 'absolute', left: x + 'px', top: y + 'px', maxWidth: '260px', background: member(a.authorId).color, color: '#1a0f16', padding: '10px 14px', borderRadius: '4px 16px 16px 16px', fontFamily: 'var(--font)', fontSize: '18px', boxShadow: '0 10px 24px rgba(0,0,0,.25)', transform: 'rotate(-1.5deg)', animation: fresh.has(a.id) ? 'rise .6s' : '' }, 'data-ann': a.id }, h('b', member(a.authorId).name, ' : '), a.note));
    }
    // Encre
    const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('class', 'ink' + (tool !== 'select' && tool !== 'note' ? ' drawing' : ''));
    svg.setAttribute('viewBox', `0 0 ${PW} ${PH}`);
    for (const a of anns.filter((x) => x.shape && x.kind !== 'note' && x.shape.page === page && visible(x))) svg.append(svgPath(a, member(a.authorId).color, fresh.has(a.id)));
    el.append(svg);
    bindDrawing(svg, el);
    scaler.replaceChildren(el);
    fresh.clear();
    pager.replaceChildren(
      h('button.btn', { onclick: () => setPage(page - 1, true), disabled: page === 0, 'data-focus': '' }, '← Précédente'),
      h('span.muted', `Page ${page + 1} sur ${pages.length}`),
      h('button.btn', { onclick: () => setPage(page + 1, true), disabled: page >= pages.length - 1, 'data-focus': '' }, 'Suivante →'));
    fit();
  }
  function setPage(n, broadcast) {
    n = Math.max(0, Math.min(pages.length - 1, n));
    if (n === page) return;
    page = n; renderPage(true);
    if (broadcast && sync) rt.toRoom(room, { page }, true);
  }
  const pageOf = (off) => Math.max(0, pages.findIndex((p) => off >= p.start && off <= p.end));

  // ------------------------------------------------ sélection de texte → annotation
  let pop = null;
  function offsetOf(node, off) {
    let el = node.nodeType === 3 ? node.parentElement : node;
    if (node.nodeType !== 3) { const child = node.childNodes[off]; el = child?.nodeType === 1 ? child : el; off = 0; }
    if (el?.dataset?.skip) return null;
    const base = el?.closest?.('[data-off]');
    return base ? Number(base.dataset.off) + (node.nodeType === 3 ? off : 0) : null;
  }
  function currentRange() {
    const sel = getSelection(); if (!sel.rangeCount || sel.isCollapsed) return null;
    const r = sel.getRangeAt(0);
    if (!scaler.contains(r.commonAncestorContainer)) return null;
    let s = offsetOf(r.startContainer, r.startOffset); let e = offsetOf(r.endContainer, r.endOffset);
    if (s == null || e == null) return null;
    if (e < s) [s, e] = [e, s];
    return { start: s, end: e, quote: at.text.slice(s, e).slice(0, 500), rect: r.getBoundingClientRect() };
  }
  function onSelect() {
    pop?.remove(); pop = null;
    if (tool !== 'select') return;
    const r = currentRange(); if (!r || r.end - r.start < 1) return;
    rt.toRoom(room, { sel: { start: r.start, end: r.end } });
    if (!state.me) return;
    const box = root.getBoundingClientRect();
    pop = h('div.sel-pop', { style: { left: Math.max(8, r.rect.left - box.left) + 'px', top: r.rect.bottom - box.top + 8 + 'px' } },
      h('button', { onmousedown: (e) => e.preventDefault(), onclick: () => save({ kind: 'highlight', range: r }) }, '🖍 Surligner'),
      h('button', { onmousedown: (e) => e.preventDefault(), onclick: () => save({ kind: 'underline', range: r }) }, '〰️ Souligner'),
      h('button', { onmousedown: (e) => e.preventDefault(), onclick: () => askNote('Votre remarque', (note) => save({ kind: 'comment', range: r, note })) }, '💬 Remarque'));
    root.style.position = 'relative'; root.append(pop);
  }
  const onSel = debounce(onSelect, 350);
  document.addEventListener('selectionchange', onSel);
  function askNote(title, cb) {
    pop?.remove();
    sheet(title, (close) => { const t = h('textarea', { rows: 4, autofocus: true }); return h('div', t, h('div.row', { style: { justifyContent: 'flex-end', marginTop: '10px' } }, h('button.btn', { onclick: close }, 'Annuler'), h('button.btn.primary', { onclick: () => { if (t.value.trim()) cb(t.value.trim()); close(); } }, 'Ajouter'))); });
  }
  function showNote(a) { sheet(`Remarque de ${member(a.authorId).name}`, () => h('div', a.range ? h('blockquote', { style: { fontFamily: 'var(--read)', color: 'var(--ink-2)' } }, '« ', a.range.quote, ' »') : null, h('p', a.note))); }
  async function save(a) {
    pop?.remove(); pop = null; getSelection().removeAllRanges();
    try { await api('/api/annotations', { body: { atId: id, ...a, range: a.range && { start: a.range.start, end: a.range.end, quote: a.range.quote } } }); } catch (e) { info(e.message); }
  }

  // ------------------------------------------------ dessin (stylet, doigt, souris)
  function bindDrawing(svg, pageEl) {
    let pts = null; let live = null; let lastSent = 0;
    const toV = (e) => { const r = pageEl.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / scale), Math.round((e.clientY - r.top) / scale)]; };
    svg.addEventListener('pointerdown', (e) => {
      if (tool === 'select' || tool === 'note' || !state.me) return;
      e.preventDefault(); svg.setPointerCapture(e.pointerId);
      pts = [toV(e)];
      live = svgPath({ kind: tool, shape: { points: pts, width: tool === 'draw' ? (e.pressure > 0 && e.pointerType === 'pen' ? 2 + e.pressure * 6 : 4) : 5 } }, member(state.me.id).color);
      svg.append(live);
    });
    svg.addEventListener('pointermove', (e) => {
      if (!pts) return;
      const p = toV(e); const last = pts[pts.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 2) return;
      if (tool === 'draw') pts.push(p); else pts[1] = p;
      live.setAttribute('d', pathFor({ kind: tool, shape: { points: pts } }));
      if (Date.now() - lastSent > 60) { lastSent = Date.now(); rt.toRoom(room, { ink: { page, kind: tool, points: pts, color: member(state.me.id).color } }); }
    });
    const end = async () => {
      if (!pts) return;
      const shape = { page, points: pts, width: Number(live.getAttribute('stroke-width')) };
      const kind = tool; pts = null;
      if (shape.points.length < 2) { live.remove(); return; }
      await save({ kind, shape });
    };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    pageEl.addEventListener('click', (e) => {
      if (tool !== 'note' || !state.me) return;
      const [x, y] = toV(e);
      askNote('Écrire une annotation', (note) => save({ kind: 'note', note, shape: { page, points: [[x, y]] } }));
    });
  }
  // Encre en direct reçue d'un autre appareil
  const liveInk = new Map();
  function showLiveInk(from, ink) {
    if (ink.page !== page) return;
    const svg = scaler.querySelector('svg.ink'); if (!svg) return;
    let p = liveInk.get(from.clientId);
    if (!p || !p.el.isConnected) { const el = svgPath({ kind: ink.kind, shape: { points: ink.points, width: 4 } }, ink.color); svg.append(el); p = { el }; liveInk.set(from.clientId, p); }
    p.el.setAttribute('d', pathFor({ kind: ink.kind, shape: { points: ink.points } }));
    clearTimeout(p.t); p.t = setTimeout(() => { p.el.remove(); liveInk.delete(from.clientId); }, 2500);
  }

  // ------------------------------------------------ zoom vers un passage (TV)
  let zoomT;
  function flashRange(start, end, zoom) {
    const pg = pageOf(start); if (pg !== page) { page = pg; renderPage(true); }
    const spans = [...scaler.querySelectorAll('[data-off]')].filter((s) => { const o = Number(s.dataset.off); return o < end && o + s.textContent.length > start; });
    if (!spans.length) return;
    // Surligner exactement le passage (découpe temporaire des segments)
    for (const s of spans) s.classList.add('selflash');
    setTimeout(() => spans.forEach((s) => s.classList.remove('selflash')), 3500);
    if (!zoom) return;
    const pr = scaler.firstChild.getBoundingClientRect();
    const rs = spans.map((s) => s.getBoundingClientRect());
    const top = Math.min(...rs.map((r) => r.top)) - pr.top; const bottom = Math.max(...rs.map((r) => r.bottom)) - pr.top;
    const cy = (top + bottom) / 2 / scale; const z = 1.35; const s2 = scale * z;
    const w = wrap.clientWidth; const base = Math.max(0, (w - PW * scale) / 2);
    const tx = (w - PW * s2) / 2 - base; const ty = cy * scale - cy * s2;
    scaler.style.transform = `translate(${tx}px, ${ty}px) scale(${s2})`;
    clearTimeout(zoomT); zoomT = setTimeout(() => { scaler.style.transform = `scale(${scale})`; }, 4000);
  }

  // ------------------------------------------------ barre d'outils
  const tools = [['select', '👆', 'Sélectionner du texte'], ['draw', '✏️', 'Dessiner (stylet)'], ['circle', '⭕', 'Entourer'], ['arrow', '➹', 'Flèche'], ['note', '📝', 'Annotation libre']];
  function paintToolbar() {
    toolbar.replaceChildren(
      state.me ? tools.map(([t, e, l]) => h('button.tool' + (tool === t ? '.on' : ''), { title: l, 'aria-label': l, onclick: () => { tool = t; paintToolbar(); renderPage(); } }, e)) : null,
      h('span.tool-sep'),
      h('button.tool.tv-ok', { title: 'Page précédente', onclick: () => setPage(page - 1, true) }, '◀'),
      h('button.tool.tv-ok', { title: 'Page suivante', onclick: () => setPage(page + 1, true) }, '▶'),
      h('span.tool-sep'),
      h('button.tool' + (sync ? '.on' : ''), { title: 'Synchroniser les pages avec les autres écrans', onclick: () => { sync = !sync; paintToolbar(); if (sync) rt.toRoom(room, { page }, true); } }, '🔗'),
      canModerate ? h('a.tool', { href: `#/at/${id}/edit`, title: 'Modifier le texte' }, '🖋') : null,
      h('span', { style: { flex: 1 } }),
      h('span.muted', { style: { fontSize: '13px', paddingRight: '8px' } }, tool === 'select' ? 'Sélectionnez un passage pour l’annoter' : tool === 'note' ? 'Touchez la page pour poser une note' : 'Dessinez sur la page'));
  }

  // ------------------------------------------------ barre « live »
  function paintLive() {
    const uniq = [...new Map(peers.map((p) => [p.clientId, p])).values()];
    liveBar.replaceChildren(
      h('span.live-dot'), h('b', 'Apéro Time Live'),
      h('span.muted', uniq.length ? 'avec' : 'Personne d’autre pour l’instant'),
      uniq.map((p) => h('span.chip', { title: p.deviceName }, p.memberId ? avatar(p.memberId, 's') : null, kindIcon[p.kind] || '💻', ' ', p.memberId ? member(p.memberId).name : p.deviceName)),
      h('span', { style: { flex: 1 } }),
      h('div.react-bar', REACTIONS.map(([e, l]) => h('button', { title: l, 'data-focus': '', onclick: () => { floatReaction(e, state.me?.id); rt.toRoom(room, { react: e, by: state.me?.id }); } }, e))),
      state.me ? h('button.btn.small', { onclick: () => { rt.send({ t: 'invite', room }); info('Invitation envoyée à la famille'); } }, '📣 Inviter') : null,
      tvButton({ open: { kind: 'aperotime', id } }));
  }

  // ------------------------------------------------ panneau latéral
  const ytBox = h('div');
  const vids = (at.links || []).map(youtubeId).filter(Boolean);
  if (vids.length) ytBox.append(h('h3', '🎵 Musiques'), ...vids.map((v) => h('button.row', { style: { background: 'none', border: 0, cursor: 'pointer', textAlign: 'left', marginBottom: '8px' }, onclick: () => overlay(h('iframe', { src: `https://www.youtube-nocookie.com/embed/${v}?autoplay=1`, allow: 'autoplay; encrypted-media; fullscreen', allowfullscreen: true, style: { width: 'min(960px, 94vw)', aspectRatio: '16/9', border: 0, borderRadius: '16px' } })) },
    h('img', { src: `https://i.ytimg.com/vi/${v}/mqdefault.jpg`, alt: '', style: { width: '120px', borderRadius: '10px' } }), h('span', '▶ Écouter'))));
  const annList = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
  const filters = h('div.chips');
  let comments;
  side.append(
    h('div.glass.card', h('div.row', avatar(at.authorId, 'l'), h('div', h('b', member(at.authorId).name), h('div.muted', fdate(at.date)))),
      h('div', { style: { marginTop: '12px' } }, reactionBar('aperotime', id, at.reactions))),
    h('div.glass.card', h('h3', { style: { marginTop: 0 } }, '✍️ Annotations'), filters,
      canModerate ? h('label.switch', h('span.muted', 'Afficher les masquées'), h('input', { type: 'checkbox', onchange: (e) => { showHidden = e.target.checked; paintAll(); } })) : null, annList),
    vids.length ? h('div.glass.card', ytBox) : null,
    h('div.glass.card', h('h3', { style: { marginTop: 0 } }, '💬 Commentaires'), comments = commentsBlock('aperotime', at)));

  function paintFilters() {
    const authors = [...new Set(anns.map((a) => a.authorId))];
    filters.replaceChildren(...authors.map((m) => h('button.chip' + (hiddenAuthors.has(m) ? '' : '.on'), { onclick: () => { hiddenAuthors.has(m) ? hiddenAuthors.delete(m) : hiddenAuthors.add(m); paintAll(); } }, avatar(m, 's'), member(m).name, h('span.muted', ' ', anns.filter((a) => a.authorId === m).length))));
  }
  const kindLabel = { highlight: '🖍 Surlignage', underline: '〰️ Soulignement', comment: '💬 Remarque', circle: '⭕ Entouré', arrow: '➹ Flèche', draw: '✏️ Dessin', note: '📝 Note' };
  function paintList() {
    const list = anns.filter((a) => (showHidden || !a.hidden || canModerate) && !hiddenAuthors.has(a.authorId))
      .sort((a, b) => ((a.range?.start ?? pages[a.shape?.page ?? 0]?.start ?? 0) - (b.range?.start ?? pages[b.shape?.page ?? 0]?.start ?? 0)));
    annList.replaceChildren(...(list.length ? list.map((a) => h('div.ann-item' + (a.hidden ? '.hid' : ''), { style: { '--c': member(a.authorId).color } },
      avatar(a.authorId, 's'),
      h('div.grow', h('b', member(a.authorId).name), h('span.muted', ' · ', kindLabel[a.kind]),
        a.range ? h('q', a.range.quote.slice(0, 160)) : h('div.muted', `page ${(a.shape?.page ?? 0) + 1}`),
        a.note ? h('div', a.note) : null,
        h('div.acts',
          h('button', { onclick: () => (a.range ? flashRange(a.range.start, a.range.end, isTV) : (page = a.shape.page, renderPage(true))) }, 'Voir'),
          canModerate || a.authorId === state.me?.id ? h('button', { onclick: () => api('/api/annotations/' + a.id, { method: 'PATCH', body: { hidden: !a.hidden } }) }, a.hidden ? 'Afficher' : 'Masquer') : null,
          canModerate ? h('button', { onclick: () => api('/api/annotations/' + a.id, { method: 'PATCH', body: { inBook: !a.inBook } }) }, a.inBook ? '📖 Dans le livre' : '📖 Livre') : null,
          canModerate || a.authorId === state.me?.id ? h('button', { onclick: async () => { if (await confirmBox('Supprimer cette annotation ?', 'Supprimer')) api('/api/annotations/' + a.id, { method: 'DELETE' }); } }, 'Supprimer') : null)))) : [h('p.muted', 'Aucune annotation. Sélectionnez un passage ou prenez le crayon ✏️')]));
  }
  function paintAll() { paintFilters(); paintList(); renderPage(); }

  // ------------------------------------------------ temps réel
  const offs = [
    bus.on('ev:ann:new', (a) => { if (a.atId !== id) return; anns.push(a); fresh.add(a.id); paintFilters(); paintList(); if (a.shape && a.shape.page !== page && sync && a.authorId !== state.me?.id) { page = a.shape.page; } renderPage(); if (isTV && a.range) flashRange(a.range.start, a.range.end, true); }),
    bus.on('ev:ann:update', (a) => { if (a.atId !== id) return; anns = anns.map((x) => (x.id === a.id ? a : x)); paintAll(); }),
    bus.on('ev:ann:delete', (a) => { if (a.atId !== id) return; anns = anns.filter((x) => x.id !== a.id); paintAll(); }),
    bus.on('ev:at:update', async (s) => { if (s.id !== id) return; const fresh2 = await api('/api/aperotimes/' + id); Object.assign(at, fresh2); pages = await paginate(at); page = Math.min(page, pages.length - 1); renderPage(); info('Le texte a été mis à jour par Papa'); }),
    bus.on('rt:joined', (m) => { if (m.room !== room) return; peers = m.peers; paintLive(); if (m.state?.page != null && sync) { page = Math.min(m.state.page, pages.length - 1); renderPage(true); } }),
    bus.on('rt:peer-join', (m) => { if (m.room !== room) return; peers.push(m.peer); paintLive(); }),
    bus.on('rt:peer-leave', (m) => { if (m.room !== room) return; peers = peers.filter((p) => p.clientId !== m.clientId); paintLive(); }),
    bus.on('rt:room', (m) => {
      if (m.room !== room) return; const d = m.data;
      if (d.page != null && sync) { page = Math.min(d.page, pages.length - 1); renderPage(true); }
      if (d.sel) flashRange(d.sel.start, d.sel.end, isTV);
      if (d.ink) showLiveInk(m.from, d.ink);
      if (d.react) floatReaction(d.react, d.by);
    }),
  ];
  rt.join(room, { view: 'reader' });

  // Touches : ← → pour tourner les pages (clavier, télécommande)
  const onKey = (e) => {
    if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName) || document.querySelector('#overlay-root .overlay')) return;
    const onPage = !isTV || document.activeElement === wrap || document.activeElement === document.body;
    if (e.key === 'ArrowRight' && onPage) { e.preventDefault(); setPage(page + 1, true); }
    if (e.key === 'ArrowLeft' && onPage) { e.preventDefault(); setPage(page - 1, true); }
  };
  addEventListener('keydown', onKey, true);
  // Balayage tactile
  let sx = null;
  wrap.addEventListener('touchstart', (e) => { if (tool === 'select') sx = e.touches[0].clientX; }, { passive: true });
  wrap.addEventListener('touchend', (e) => { if (sx == null || getSelection().toString()) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 80) setPage(page + (dx < 0 ? 1 : -1), true); sx = null; });

  paintToolbar(); paintLive(); paintAll();
  if (isTV) setTimeout(() => wrap.focus(), 200);
  if (live && state.me) rt.send({ t: 'invite', room });

  return () => { offs.forEach((f) => f()); rt.leave(room); ro.disconnect(); removeEventListener('keydown', onKey, true); document.removeEventListener('selectionchange', onSel); comments.cleanup(); pop?.remove(); };
}

function debounce(f, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; }
