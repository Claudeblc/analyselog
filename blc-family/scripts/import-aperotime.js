'use strict';
// Importe le recueil Excel des Apéro Time (onglet « ApéroTime ») dans data/aperotimes.json.
// Usage : npm run import -- /chemin/ApéroTime_recueil.xlsx
// - Idempotent : une édition déjà présente (même date + même texte) n'est pas réimportée.
// - Les rééditions annoncées dans le titre sont reliées à l'édition d'origine.
// À lancer serveur arrêté (ou redémarrer le serveur ensuite).
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const db = require('../server/store');

const file = process.argv[2];
if (!file) { console.error('Usage : npm run import -- fichier.xlsx'); process.exit(1); }

const cell = (v) => {
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') return v.richText ? v.richText.map((r) => r.text).join('') : v.text || v.result || '';
  return v;
};
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const hash = (s) => crypto.createHash('sha1').update(s.replace(/\s+/g, ' ').trim()).digest('hex');
const frDate = (s) => { // « réédition du 30/07/2023 », « 04 Décembre 2022 », « 15/01/23 »
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  let m = /(\d{1,2})[/ .-](\d{1,2})[/ .-](\d{2,4})/.exec(s);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  m = new RegExp(`(\\d{1,2})\\s+(${mois.join('|')})\\s+(\\d{4})`, 'i').exec(s);
  if (m) return `${m[3]}-${String(mois.indexOf(m[2].toLowerCase()) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
};

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(file));
  const ws = wb.worksheets.find((w) => /ap[ée]ro/i.test(w.name)) || wb.worksheets[0];
  const header = ws.getRow(1).values.map((v) => String(cell(v)).toLowerCase());
  const col = (re) => header.findIndex((h) => re.test(h));
  const C = { n: col(/^n°|^n$/), date: col(/date de l/), title: col(/titre/), by: col(/post/), links: col(/liens youtube/), text: col(/texte/) };

  const existing = db.list('aperotimes');
  const seen = new Set(existing.map((a) => a.date + ':' + hash(a.text)));
  const seenText = new Set(existing.map((a) => hash(a.text)));
  let added = 0, skipped = 0;
  const imported = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const v = row.values.map(cell);
    const text = String(v[C.text] || '').trim();
    if (!text) return;
    const date = iso(v[C.date]);
    const key = date + ':' + hash(text);
    if (seen.has(key) || seenText.has(hash(text))) { skipped++; return; }
    seen.add(key); seenText.add(hash(text));
    const title = String(v[C.title] || '').trim().split('\n')[0].slice(0, 300) || `Apéro Time du ${date}`;
    const links = String(v[C.links] || '').split(/[\s,;]+/).filter((x) => /^https?:\/\//.test(x));
    const by = String(v[C.by] || 'Papa');
    const at = {
      id: db.id('at_'), number: Number(v[C.n]) || null, date, title, text, links: [...new Set([...links, ...(text.match(/https?:\/\/[^\s)»"]+/g) || [])])],
      status: 'published', publishAt: null, authorId: 'papa', postedBy: by, rewriteOf: null,
      createdAt: Date.parse(date + 'T18:00:00') || Date.now(), updatedAt: Date.now(), publishedAt: Date.parse(date + 'T18:00:00') || Date.now(),
      versions: [], reactions: {}, comments: [], source: 'whatsapp-import',
    };
    db.insert('aperotimes', at); imported.push(at); added++;
  });
  // Liens réédition → original
  for (const at of imported) {
    const m = /r[ée][ée]dition du ([^)]+)/i.exec(at.title);
    if (!m) continue;
    const d = frDate(m[1]);
    const orig = d && db.list('aperotimes').find((x) => x.date === d && x.id !== at.id);
    at.rewriteOf = orig ? orig.id : d || true;
  }
  db.save('aperotimes');
  db.flushAll();
  console.log(`Import terminé : ${added} ajouté(s), ${skipped} doublon(s) ignoré(s), total ${db.list('aperotimes').length}.`);
})().catch((e) => { console.error(e); process.exit(1); });
