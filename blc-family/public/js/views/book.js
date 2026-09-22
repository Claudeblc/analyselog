// Le livre des Apéro Time : ANNÉE → MOIS → APÉRO TIME, mise en page imprimable (PDF via « Imprimer »).
import { api, h, fdate, member, info } from '../core.js';

export default async function book(root) {
  const list = (await api('/api/aperotimes')).filter((a) => a.status === 'published').sort((a, b) => a.date.localeCompare(b.date));
  const years = [...new Set(list.map((a) => a.date.slice(0, 4)))];
  const chosenYears = new Set(years);
  let withNotes = true;

  const toc = h('div.book-toc');
  const byYear = h('div');
  root.append(h('div.no-print',
    h('h1.page-title', '📖 Le livre des Apéro Time'),
    h('p.page-sub', 'Toute l’archive, année par année, mois par mois. Préparez le livre puis imprimez-le ou enregistrez-le en PDF.'),
    byYear,
    h('div.glass.card', { style: { marginTop: '20px' } },
      h('h3', { style: { marginTop: 0 } }, 'Créer le livre des Apéro Time'),
      h('div.chips', years.map((y) => h('button.chip.on', { onclick: (e) => { chosenYears.has(y) ? chosenYears.delete(y) : chosenYears.add(y); e.currentTarget.classList.toggle('on'); } }, y))),
      h('label.switch', h('span', 'Inclure les annotations sélectionnées par Papa (📖)'), h('input', { type: 'checkbox', checked: true, onchange: (e) => { withNotes = e.target.checked; } })),
      h('button.btn.primary', { onclick: build }, '✨ Préparer le livre'))));
  const out = h('div'); root.append(out);

  // Archive navigable année → mois → édition
  for (const y of years.slice().reverse()) {
    const months = {};
    for (const a of list.filter((x) => x.date.startsWith(y))) (months[a.date.slice(5, 7)] ||= []).push(a);
    byYear.append(h('details.glass.card', { style: { marginBottom: '10px' }, open: y === years[years.length - 1] },
      h('summary', { style: { cursor: 'pointer', fontFamily: 'var(--display)', fontSize: '24px' } }, y, h('span.muted', { style: { fontSize: '14px' } }, ` · ${list.filter((x) => x.date.startsWith(y)).length} éditions`)),
      Object.keys(months).sort().reverse().map((m) => h('div', h('h4', { style: { textTransform: 'capitalize', margin: '14px 0 6px', color: 'var(--amber)' } }, fdate(`${y}-${m}-01`, { month: 'long' })),
        months[m].map((a) => h('a', { href: '#/at/' + a.id, style: { display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '6px 0', color: 'var(--ink)', textDecoration: 'none', borderBottom: '1px dotted var(--line)' } }, h('span', a.title), h('span.muted', fdate(a.date, { day: 'numeric', month: 'short' }))))))));
  }

  async function build() {
    const sel = list.filter((a) => chosenYears.has(a.date.slice(0, 4)));
    if (!sel.length) return info('Choisissez au moins une année.');
    info('Préparation du livre…');
    const full = await Promise.all(sel.map((a) => api('/api/aperotimes/' + a.id)));
    const notes = withNotes ? await Promise.all(sel.map((a) => api(`/api/aperotimes/${a.id}/annotations`))) : sel.map(() => []);
    const span = [...chosenYears].sort();
    out.replaceChildren(
      h('div.row.no-print', { style: { margin: '26px 0' } }, h('button.btn.primary', { onclick: () => print() }, '🖨 Imprimer / PDF'), h('span.muted', `${full.length} éditions`)),
      h('div.book-page.book-cover', h('p', { style: { letterSpacing: '4px', textTransform: 'uppercase', color: '#f4a261' } }, 'Famille Belcram'), h('h1', 'Apéro Time'), h('p', { style: { fontSize: '22px' } }, `par ${member('papa').name}`), h('p', span[0] === span[span.length - 1] ? span[0] : `${span[0]} — ${span[span.length - 1]}`)),
      h('div.book-page', h('h2', 'Sommaire'), h('div.book-toc', full.map((a, i) => h('a', { href: '#bk-' + i, onclick: (e) => { e.preventDefault(); document.getElementById('bk-' + i).scrollIntoView({ behavior: 'smooth' }); } }, h('span', a.title), h('span', fdate(a.date, { day: 'numeric', month: 'short', year: 'numeric' })))))),
      full.map((a, i) => h('article.book-page', { id: 'bk-' + i },
        h('div.d', fdate(a.date)), h('h2', a.title),
        a.text.split(/\n\s*\n/).map((p) => h('p', p.trim())),
        notes[i].filter((n) => n.inBook && !n.hidden).map((n) => h('div.bnote', { style: { '--c': member(n.authorId).color } }, h('b', member(n.authorId).name, ' : '), n.range ? h('i', '« ', n.range.quote.slice(0, 200), ' » ') : null, n.note || '')))));
    out.scrollIntoView({ behavior: 'smooth' });
  }
}
