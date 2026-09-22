"""Extrait les Apérotime de l'export WhatsApp et les écrit dans aperotimes.json (ordre chronologique)."""
import re, sys, json, unicodedata
from datetime import datetime

F = sys.argv[1]
HDR = re.compile(r'^(\d\d/\d\d/\d{4}), (\d\d:\d\d) - ([^:]+): ?(.*)$')
SYS = re.compile(r'^(\d\d/\d\d/\d{4}), (\d\d:\d\d) - (.*)$')
msgs = []
for l in open(F, encoding='utf-8').read().split('\n'):
    m = HDR.match(l)
    s = SYS.match(l)
    if m:
        msgs.append(dict(date=m[1], time=m[2], who=m[3], text=m[4]))
    elif s:  # message système WhatsApp (code de sécurité, etc.)
        msgs.append(dict(date=s[1], time=s[2], who='système', text=s[3]))
    elif msgs:
        msgs[-1]['text'] += '\n' + l

def norm(s):
    return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()

def is_header(t):
    return re.match(r'^\s*apero\s*time', norm(t)) is not None

def signed(t):
    return re.search(r't\.\s?herve', norm(t)) is not None

URL = re.compile(r'https?://\S+')
YT = re.compile(r'(?:youtu\.be/|youtube\.com/(?:watch\?v=|shorts/|live/|embed/))([\w-]{11})')

# Messages envoyés à part (le lien vidéo arrivé après le texte) : index du message -> date de l'apérotime
EXTRA_LINK_DATES = {'30/11/2025'}

items, seen = [], set()
for i, m in enumerate(msgs):
    t = m['text'].strip()
    # Apérotime avec en-tête, ou apérotime signé sans en-tête contenant des vidéos (hors séries ALLEAU ?)
    ok = is_header(t) and m['who'] != 'Claude_blc'
    ok = ok or (m['who'] == 'Papa' and signed(t) and YT.search(t) and len(t) > 800)
    if not ok:
        continue
    key = t[:400]
    if key in seen:          # doublon (message renvoyé deux fois)
        continue
    seen.add(key)
    parts = [t]
    # Suite éventuelle dans un ou plusieurs messages séparés de Papa (avant la signature)
    j = i + 1
    while not signed(parts[-1]) and j < len(msgs) and j < i + 6:
        n = msgs[j]
        if n['who'] == 'Papa' and n['text'].strip() and not is_header(n['text']) and n['text'].strip() not in ('<Médias omis>', 'Ce message a été supprimé.'):
            parts.append(n['text'].strip())
        j += 1
    full = '\n\n'.join(parts)
    lines = full.split('\n')
    label = lines[0].strip().rstrip(',.…') if is_header(full) else None
    body = '\n'.join(lines[1:] if label else lines).strip()
    extra = []
    if m['date'] in EXTRA_LINK_DATES:
        for n in msgs[i + 1:i + 6]:
            if n['who'] == 'Papa' and n['date'] == m['date'] and re.fullmatch(r'\s*https?://\S+\s*', n['text']):
                extra.append(n['text'].strip())
    urls = []
    for u in URL.findall(full) + extra:
        u = u.rstrip('.,;)»')
        if u not in urls:
            urls.append(u)
    videos, others = [], []
    for u in urls:
        y = YT.search(u)
        if y:
            if y[1] not in [v['id'] for v in videos]:
                videos.append(dict(id=y[1], url=u, separate=u in extra))
        else:
            others.append(u)
    first = next((l.strip() for l in body.split('\n') if l.strip() and not URL.match(l.strip())), '')
    dt = datetime.strptime(m['date'] + ' ' + m['time'], '%d/%m/%Y %H:%M')
    items.append(dict(
        posted=dt.isoformat(), label=label or 'Apérotime (sans titre)', lead=first,
        body=body, videos=videos, links=others, by=m['who'],
        parts=len(parts), headerless=label is None,
    ))

items.sort(key=lambda x: x['posted'])
json.dump(items, open('aperotimes.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(items), 'apérotimes,', sum(len(x['videos']) for x in items), 'vidéos')
