from pathlib import Path
root = Path(__file__).resolve().parents[1]
p = root / 'web/public'
s = (p / 'client.html').read_text().replace('<link rel="stylesheet" href="client.css">', '<style>' + (p / 'client.css').read_text() + '</style>')
for name in ['core', 'client', 'photos', 'features', 'interactions', 'tree']:
    s = s.replace('<script src="' + name + '.js"></script>', '<script>' + (p / (name + '.js')).read_text() + '</script>')
s = s.replace('</body>', '<script>' + ((root / 'android') / 'assets/native-features.js').read_text() + '</script></body>')
(root / 'android/assets/index.html').write_text(s)
