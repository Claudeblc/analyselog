"""Assemble index.html à partir de template.html et aperotimes.json."""
import json
data = json.load(open('aperotimes.json', encoding='utf-8'))
payload = json.dumps(data, ensure_ascii=False).replace('</', '<\\/')
html = open('template.html', encoding='utf-8').read().replace('__DATA__', payload)
open('index.html', 'w', encoding='utf-8').write(html)
print('index.html', len(html) // 1024, 'Ko')
