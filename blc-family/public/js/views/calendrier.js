// Calendrier familial : anniversaires, capsules, Apéro Time programmés et publiés, mois par mois.
import { state, api, h, avatar, member, fdate } from '../core.js';

export default async function calendrier(root) {
  const [ats, caps] = await Promise.all([api('/api/aperotimes'), api('/api/capsules')]);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const events = [];
  for (const m of state.members) if (m.birthday) {
    const [, mm, dd] = m.birthday.split('-').map(Number);
    for (const y of [now.getFullYear(), now.getFullYear() + 1]) events.push({ date: new Date(y, mm - 1, dd), icon: '🎂', text: `Anniversaire de ${m.name}`, who: m.id });
  }
  for (const c of caps) events.push({ date: new Date(c.unlockAt), icon: c.opened ? '🎁' : '⏳', text: c.opened ? `Capsule ouverte : ${c.title}` : `Ouverture de la capsule « ${c.title} »`, who: c.authorId, href: '#/capsules' });
  for (const a of ats) {
    if (a.status === 'scheduled' && a.publishAt) events.push({ date: new Date(a.publishAt), icon: '⏰', text: `Apéro Time programmé : ${a.title}`, who: a.authorId, href: `#/at/${a.id}/edit` });
    if (a.status === 'published') events.push({ date: new Date(a.date + 'T18:00:00'), icon: '🍷', text: a.title, who: a.authorId, href: '#/at/' + a.id, past: true });
  }
  let month = new Date(now.getFullYear(), now.getMonth(), 1);
  const grid = h('div.cal-grid'); const list = h('div.cal-list'); const title = h('h2.section-title');
  function paint() {
    title.textContent = fdate(month, { month: 'long', year: 'numeric' });
    const first = (month.getDay() + 6) % 7; const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const inMonth = events.filter((e) => e.date.getFullYear() === month.getFullYear() && e.date.getMonth() === month.getMonth()).sort((a, b) => a.date - b.date);
    grid.replaceChildren(...['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => h('b.cal-h', d)), ...Array.from({ length: first }, () => h('span')),
      ...Array.from({ length: days }, (_, i) => { const d = i + 1; const ev = inMonth.filter((e) => e.date.getDate() === d); const today = +new Date(month.getFullYear(), month.getMonth(), d) === +now;
        return h('div.cal-d' + (today ? '.today' : '') + (ev.length ? '.has' : ''), h('span', d), h('div', ev.slice(0, 3).map((e) => e.icon))); }));
    list.replaceChildren(...(inMonth.length ? inMonth.map((e) => h(e.href ? 'a.cal-ev' : 'div.cal-ev', e.href ? { href: e.href } : null, h('span.cal-date', e.date.getDate()), h('span', { style: { fontSize: '22px' } }, e.icon), h('div.grow', e.text), e.who ? avatar(e.who, 's') : null)) : [h('p.muted', 'Rien de prévu ce mois-ci.')]));
  }
  root.append(h('h1.page-title', '📅 Calendrier de la famille'),
    h('div.row', h('button.btn', { onclick: () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); paint(); } }, '‹ Mois précédent'), title, h('button.btn', { onclick: () => { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); paint(); } }, 'Mois suivant ›')),
    h('div.cal-wrap', h('div.glass.card', grid), h('div.glass.card', list)),
    h('p.muted', 'Ajoutez vos anniversaires dans ⚙️ Paramètres pour qu’ils apparaissent ici.'));
  paint();
}
