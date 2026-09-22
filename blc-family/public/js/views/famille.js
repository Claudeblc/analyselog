// La famille & l'entraide : métiers et pastilles de compétences. « On se tourne vers qui sait. »
import { state, h, avatar, member, bus, isOnline, skillPills, whoCanHelp, DOMAINS } from '../core.js';
import { go } from '../main.js';

export default function famille(root) {
  const input = h('input.need', { type: 'text', placeholder: 'J’ai besoin d’aide pour… (ex. une ordonnance, mon CV, un contrat, mon wifi)' });
  const hint = h('p.muted', { style: { minHeight: '24px' } });
  const grid = h('div.family-grid');
  const domainChips = h('div.chips', { style: { margin: '12px 0 22px' } }, Object.entries(DOMAINS).filter(([k]) => k !== 'autre').map(([k, d]) =>
    h('button.chip', { onclick: () => { input.value = d.label; paint(); } }, d.icon, ' ', d.label)));

  const contact = (m, q) => {
    try { sessionStorage.setItem('blcf.chatDraft', `@${m.name} ${q ? `j’aurais besoin de ton aide pour ${q} 🙏` : ''}`.trim()); } catch (_) {}
    go('#/chat');
  };
  const call = async (m) => { const c = await import('../call.js'); c.startCall('call:' + [state.me.id, m.id].sort().join('-'), { invite: true, members: [m.id] }); };

  function paint() {
    const q = input.value.trim();
    const helpers = q ? whoCanHelp(q) : [];
    hint.textContent = !q ? '' : helpers.length ? `👉 Tournez-vous vers ${helpers.map((m) => m.name).join(', ')}.` : 'Personne n’a encore cette pastille… demandez quand même à la famille dans la Discussion !';
    grid.replaceChildren(...state.members.map((m) => {
      const match = helpers.includes(m);
      return h('div.mcard' + (match ? '.match' : q && helpers.length ? '.dim' : ''), { style: { '--c': m.color } },
        h('div.row', avatar(m.id, 'l', isOnline(m.id)), h('div.grow', h('h3', m.name), m.job ? h('div.job', m.job) : h('div.job.muted', 'Métier à renseigner'))),
        skillPills(m.id),
        m.id !== state.me?.id && state.me ? h('div.row', h('button.btn.small' + (match ? '.primary' : ''), { onclick: () => contact(m, q) }, '💬 Demander'), h('button.btn.small', { onclick: () => call(m) }, '📹 Appeler')) : null,
        m.id === state.me?.id ? h('a.btn.small', { href: '#/parametres' }, '✏️ Mes pastilles') : null);
    }));
  }
  input.addEventListener('input', paint);
  root.append(
    h('h1.page-title', '🤝 La famille & l’entraide'),
    h('div.philo', h('b', 'La philosophie de Papa'), 'Nous sommes une famille : chacun doit aider les autres. Quand on a besoin de quelque chose, on se tourne vers celui qui sait. Ce qu’on sait, on ne le garde pas pour soi.'),
    h('div.search', input), hint, domainChips, grid);
  paint();
  const off = bus.on('presence', paint);
  return off;
}
