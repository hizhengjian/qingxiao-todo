from pathlib import Path
root=Path(__file__).resolve().parents[1]
public=root/'web'/'public'
html=(public/'client.html').read_text().replace('<link rel="stylesheet" href="client.css">','<style>'+(public/'client.css').read_text()+'</style>')
for name in ['core','client','photos','features']:
    html=html.replace('<script src="'+name+'.js"></script>','<script>'+(public/(name+'.js')).read_text()+'</script>')
(root/'android'/'assets'/'index.html').write_text(html)
print('Bundled shared web UI into android/assets/index.html')
