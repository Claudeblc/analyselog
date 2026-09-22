// Apéro Time : archive chronologique ANNÉE → MOIS → APÉRO TIME, recherche, brouillons de Papa.
import { state, api, h, fdate, bus } from '../core.js';

export default async function library(root) {
  const all = await api('/api/aperotimes');
  const author = state.me && (state.me.role === 'author' || state.me.admin);
  const pub = all.filter((a) => a.status === 'published');
  const drafts = all.filter((a) => a.status !== 'published');
  const years = [...new Set(pub.map((a) => a.date.slice(0, 4)))].sort().reverse();
  let year = 'all'; let q = '';

  root.append(h('div.row', { style: { alignItems: 'flex-end' } },
    h('div.grow', h('h1.page-title', '🍷 Apéro Time'), h('p.page-sub', `${pub.length} éditions écrites par Papa depuis ${pub.length ? fdate(pub[pub.length - 1].date, { month: 'long', year: 'numeric' }) : '—'}.`)),
    author ? h('a.btn.primary', { href: '#/ecrire' }, '✍️ Écrire un Apéro Time') : null,
    h('a.btn', { href: '#/aperotime/livre' }, '📖 Le livre')));

  if (author && drafts.length) {
    root.append(h('h2.section-title', 'Brouillons et programmés', h('span.count', drafts.length)),
      h('div.at-grid', drafts.map((a) => h('a.at-card', { href: `#/at/${a.id}/edit` },
        h('div.meta', h('span.status.' + a.status, a.status === 'draft' ? 'Brouillon' : 'Programmé'), a.publishAt ? h('span', new Date(a.publishAt).toLocaleString('fr-FR')) : null),
        h('h3', a.title), h('p', a.excerpt)))));
  }

  const search = h('input', { type: 'text', placeholder: 'Rechercher un titre, un mot, un artiste…', oninput: (e) => { q = e.target.value.toLowerCase(); paint(); } });
  const yearChips = h('div.at-years');
  const grid = h('div.at-grid');
  root.append(h('div.search', { style: { margin: '18px 0 12px' } }, search), yearChips, grid);

  function paint() {
    yearChips.replaceChildren(...['all', ...years].map((y) => h('button.chip' + (y === year ? '.on' : ''), { onclick: () => { year = y; paint(); } }, y === 'all' ? 'Toutes' : y, h('span.muted', ' ', y === 'all' ? pub.length : pub.filter((a) => a.date.startsWith(y)).length))));
    const list = pub.filter((a) => (year === 'all' || a.date.startsWith(year)) && (!q || (a.title + ' ' + a.excerpt).toLowerCase().includes(q)));
    const nodes = []; let lastMonth = '';
    for (const a of list) {
      const month = a.date.slice(0, 7);
      if (month !== lastMonth) { nodes.push(h('h3.month-h', fdate(a.date, { month: 'long', year: 'numeric' }))); lastMonth = month; }
      const rx = Object.values(a.reactions || {});
      nodes.push(h('a.at-card', { href: '#/at/' + a.id },
        h('span.date', fdate(a.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })),
        h('h3', a.title), h('p', a.excerpt),
        h('div.meta', a.number ? h('span', 'N° ' + a.number) : null, a.links?.length ? h('span', `🎵 ${a.links.length}`) : null, a.rewriteOf ? h('span', '♻️ Réédition') : null, rx.length ? h('span', [...new Set(rx)].join('') + ' ' + rx.length) : null, h('span', `${Math.max(1, Math.round(a.length / 1200))} min de lecture`))));
    }
    grid.replaceChildren(...(nodes.length ? nodes : [h('p.muted', 'Aucun Apéro Time ne correspond à cette recherche.')]));
  }
  paint();
  const off = bus.on('ev:at:published', () => window.BLC.go(location.hash));
  return off;
}
