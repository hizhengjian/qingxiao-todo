"""Exercise real RemoteViews at several sizes, using an isolated emulator with fake tasks.

Build/install the release app and this directory's widget-host.apk first. Add at least
one fake unfinished task in each quadrant. No production device or real data is used.
Grant binding with: adb -s "$QA_SERIAL" shell appwidget grantbind --package cn.nemo.qingxiao.widgetqa
Run with ANDROID_HOME and QA_SERIAL set. Restores the emulator's original font scale.
"""
from qa_lib import *
assert adb('shell','getprop','ro.kernel.qemu').strip()==b'1'
HOST='cn.nemo.qingxiao.widgetqa/.HostActivity'
r={'device':'Android15 API35 isolated emulator','cases':[]}
def passed(s):r['cases'].append(s);(OUT/'widget-layouts.json').write_text(json.dumps(r,ensure_ascii=False,indent=2));print(s,flush=True)
def host(w,h,legacy=False,multiple=False):
 adb('shell','am','start','-W','-n',HOST,'--ei','width',str(w),'--ei','height',str(h),'--ez','legacy',str(legacy).lower(),'--ez','multiple',str(multiple).lower());time.sleep(1)
def bounds(n):return tuple(map(int,re.findall(r'\d+',n.get('bounds'))))
def rid(root,name):return next(n for n in root.iter('node') if n.get('resource-id')==PACKAGE+':id/'+name)
original_font=adb('shell','settings','get','system','font_scale').decode().strip()
try:
 adb('shell','settings','put','system','font_scale','1.0')
 for w,h,legacy,multi in [(210,180,False,False),(210,220,False,False),(260,260,False,False),(320,280,False,False),(360,340,False,False),(390,480,False,False),(320,280,True,False),(390,480,True,False),(320,280,False,True)]:
  host(w,h,legacy,multi);root=ui()
  for q in range(4):
   head=rid(root,'head'+str(q));assert re.search(r'\d+$',head.get('text'));ls=rid(root,'list'+str(q));b=bounds(ls);assert b[3]-b[1]>=90,(w,h,q,b)
   first=next(n for n in ls.iter('node') if n.get('resource-id')==PACKAGE+':id/task_title');fb=bounds(first);assert fb[1]>=b[1] and fb[3]<=b[3]
  assert (any(n.get('resource-id')==PACKAGE+':id/widget_date' for n in root.iter('node')))==(h>=340)
  assert not any('Problem loading widget' in n.get('text','') for n in root.iter('node'))
  if w==320 and h==280:
   for q in [0,1,3]:
    ls=rid(root,'list'+str(q));b=bounds(ls);titles=[n for n in ls.iter('node') if n.get('resource-id')==PACKAGE+':id/task_title'];assert len(titles)>=3,(q,len(titles))
    assert all(bounds(n)[3]-bounds(n)[1]<60 for n in titles)
    assert all(bounds(n)[3]<=b[3] for n in titles[:3])
  shot(f'size-{w}x{h}'+('-legacy' if legacy else '-multiple' if multi else '')+'.png');passed(f'{w}x{h} dp: four readable scroll lists, '+('legacy fallback' if legacy else 'multi-size RemoteViews' if multi else 'exact dimensions'))
 for scale,w,h in [('1.5',260,260),('2.0',210,180)]:
  adb('shell','settings','put','system','font_scale',scale);time.sleep(.7);host(w,h);root=ui()
  for q in range(4):
   ls=rid(root,'list'+str(q));b=bounds(ls);assert b[3]>b[1]+85,(scale,q,b)
   title=next(n for n in ls.iter('node') if n.get('resource-id')==PACKAGE+':id/task_title');fb=bounds(title);assert fb[3]<=b[3],(scale,q,fb,b)
  shot(f'font-{scale}.png');passed(f'font scale {scale}, {w}x{h} dp: every quadrant retains visible task content')
 adb('shell','settings','put','system','font_scale','1.0');host(320,280)
finally:
 adb('shell','settings','put','system','font_scale',original_font if original_font!='null' else '1.0')
assert PACKAGE not in adb('logcat','-b','crash','-d').decode();r['crashes']=0;(OUT/'widget-layouts.json').write_text(json.dumps(r,ensure_ascii=False,indent=2))
