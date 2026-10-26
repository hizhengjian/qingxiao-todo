// Run with node tests/widget-bridge.cjs; PLAYWRIGHT_PATH can select an existing installation.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:393,height:830}}),errors=[],checks=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.stored=JSON.stringify({format:'qingxiao-todo',version:2,items:[],sessions:[],catalogs:[],preferences:[]});
  window.Native={load:()=>stored,save:s=>(stored=s,'ok'),loadEncryptedConfig(){},syncStatus:()=> '未连接云空间',timerState:()=>'{"timer":null}',lockStatus:()=> '应用密码未开启',reminderStatus:()=> '提醒已开启',appVersion:()=> '2.4.0',widgetSettings:()=>window.pinRequested=true};
 });

 await page.goto('file://'+path.resolve(process.env.QINGXIAO_APK_HTML||path.resolve(__dirname,'../android/assets/index.html')));
 await page.evaluate(()=>settings());
 assert.match(await page.locator('.panel-body').innerText(),/2\.4\.0/);
 await page.getByRole('button',{name:'▦ 四象限桌面小组件',exact:true}).click();
 assert.equal(await page.evaluate(()=>pinRequested),true);checks.push('native settings version and launcher control');
 for(let q=0;q<4;q++){
  await page.evaluate(q=>openWidgetTarget(q,true,''),q);
  assert.equal(await page.evaluate(()=>editQ),q);
  await page.locator('#edit-title').fill('Widget task '+q);
  await page.evaluate(()=>commitItem());
 }
 checks.push('all four add routes persist selected quadrant');

 const ids=await page.evaluate(()=>db.items.map(t=>t.id));
 await page.evaluate(id=>openWidgetTarget(2,false,id),ids[2]);
 assert.equal(await page.evaluate(()=>treeExpanded.has(db.items[2].id)),true);checks.push('widget opens and expands matching task branch');
 await page.evaluate(()=>openWidgetTarget(0,true,''));await page.locator('#edit-title').fill('Keep my draft');
 const rejected=page.waitForEvent('dialog').then(d=>d.dismiss());
 await Promise.all([rejected,page.evaluate(()=>openWidgetTarget(3,false,''))]);
 assert.equal(await page.locator('#edit-title').inputValue(),'Keep my draft');checks.push('cancel keeps unsaved draft');
 const accepted=page.waitForEvent('dialog').then(d=>d.accept());
 await Promise.all([accepted,page.evaluate(()=>openWidgetTarget(3,false,''))]);
 assert.equal(await page.evaluate(()=>matrixFocus),3);assert.equal(await page.evaluate(()=>dirty),false);assert.equal(await page.locator('#overlay').isHidden(),true);checks.push('confirm navigates to requested quadrant');
 await page.evaluate(()=>{let fresh=JSON.parse(stored);fresh.items[0].title='Background sync change';stored=JSON.stringify(fresh);});
 await page.evaluate(id=>openWidgetTarget(0,false,id),ids[0]);
 assert.match(await page.locator('#main').innerText(),/Background sync change/);checks.push('route reloads latest native records');
 await page.evaluate(()=>openWidgetTarget(0,false,'deleted-task-id'));assert.match(await page.locator('#toast').innerText(),/已删除/);checks.push('stale item route is safe');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({checks,errors},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
