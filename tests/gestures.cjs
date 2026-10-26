const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path');
const out=process.env.QINGXIAO_TEST_OUTPUT || 'test-results';fs.mkdirSync(out,{recursive:true});
const baseURL=process.env.QINGXIAO_TEST_URL || 'http://127.0.0.1:5173/client.html';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const ctx=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const p=await ctx.newPage(),cdp=await ctx.newCDPSession(p),errors=[],cases=[];
 p.on('pageerror',e=>errors.push(e.stack));
 await p.route('**/api/state',r=>r.fulfill({json:{records:[],acknowledgements:[]}}));
 await p.goto(baseURL);
 await p.waitForFunction(()=>!!window.QGestures);
 async function seed(n=4){
  await p.evaluate(n=>{closePanel(true);go('matrix');matrixScope='all';db=C.blank();for(let i=0;i<n;i++)db.items.push(C.touch({id:'qa-'+i,title:['准备周一的项目方案与资料','整理阅读笔记','回复同事的问题','散步与生活安排'][i%4]+(i>=4?' '+i:''),notes:'',summary:'',quadrant:n>4?0:i%4,kind:'task',tags:[],subtasks:[],photos:[],project:'',location:'',startAt:0,dueAt:0,remindAt:0,allDay:false,repeat:'none',weight:1,estimate:0,done:false,deleted:false,createdAt:Date.now(),order:i,_rev:0}));save();render();},n);
  await delay(480);
 }
 const state=id=>p.evaluate(id=>C.clone(db.items.find(x=>x.id===id)),id);
 const row=id=>p.locator(`[data-task-id="${id}"] .task-open`);
 async function center(loc){let b=await loc.boundingBox();assert(b);return{x:b.x+b.width/2,y:b.y+b.height/2};}
 async function touch(type,pt){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pt?[{x:pt.x,y:pt.y,id:1}]:[]});}
 async function move(a,b,steps=8){for(let i=1;i<=steps;i++){await touch('touchMove',{x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps});await delay(20);}}
 async function drag(id,q,focused=false){
  if(focused)await p.evaluate(()=>expandQuadrant(0));
  let a=await center(row(id)),b=await center(p.locator(`.quadrant[data-quadrant="${q}"]`));
  await touch('touchStart',a);await delay(490);assert.equal(await p.locator('.task-drag-preview').count(),1);
  await move(a,b);assert.equal(await p.locator(`.quadrant[data-quadrant="${q}"].drop-target`).count(),1);
  await touch('touchEnd');await delay(250);
 }
 async function swipe(id,dx,hold=0){let b=await row(id).boundingBox();let a={x:dx<0?b.x+b.width-8:b.x+8,y:b.y+b.height/2};await touch('touchStart',a);if(hold)await delay(hold);await move(a,{x:a.x+dx,y:a.y},8);await touch('touchEnd');await delay(240);}
 await seed();await p.touchscreen.tap(...Object.values(await center(row('qa-0'))));assert.equal(await p.evaluate(()=>matrixFocus),0);assert.equal(await p.locator('#overlay').isHidden(),true);await p.touchscreen.tap(...Object.values(await center(row('qa-0'))));await p.locator('#panel .detail-title').waitFor();await p.evaluate(()=>{closePanel(true);collapseQuadrants();});cases.push('first tap expands quadrant, second tap opens task details');
 await p.getByRole('button',{name:'展开很重要-不紧急',exact:true}).click();assert.equal(await p.evaluate(()=>matrixFocus),1);await p.getByRole('button',{name:'展开不重要-不紧急',exact:true}).click();assert.equal(await p.evaluate(()=>matrixFocus),3);await p.getByRole('button',{name:'返回四象限总览',exact:true}).click();assert.equal(await p.evaluate(()=>matrixFocus),-1);cases.push('colored rails switch expanded quadrant and collapse returns overview');
 await p.evaluate(()=>{db.items=[];save();render();});await p.touchscreen.tap(...Object.values(await center(p.locator('.quadrant[data-quadrant="2"] .quad-empty'))));assert.equal(await p.evaluate(()=>matrixFocus),2);await seed();cases.push('empty quadrant content also expands on tap');
 await drag('qa-0',3);assert.equal((await state('qa-0')).quadrant,3);assert.equal(await p.evaluate(()=>matrixFocus),-1);assert.equal(await p.locator('.task-drag-preview').count(),0);assert.equal(await p.locator('#overlay').isHidden(),true);
 await p.reload();await p.waitForFunction(()=>!!window.QGestures);assert.equal((await state('qa-0')).quadrant,3);cases.push('real touch long-press moves diagonally across quadrants; survives reload');
 await seed();await drag('qa-0',2,true);assert.equal((await state('qa-0')).quadrant,2);assert.equal(await p.evaluate(()=>matrixFocus),2);await p.getByRole('button',{name:'撤销',exact:true}).click();assert.equal((await state('qa-0')).quadrant,0);assert.equal(await p.evaluate(()=>matrixFocus),0);cases.push('expanded quadrant accepts drops on color rail; Undo restores priority and view');
 await seed();let a=await center(row('qa-0'));await touch('touchStart',a);await delay(480);await p.evaluate(()=>render());assert.equal(await p.locator('.task-drag-preview').count(),1);await move(a,{x:190,y:20});await touch('touchEnd');assert.equal((await state('qa-0')).quadrant,0);assert.equal(await p.locator('.task-drag-preview').count(),0);await delay(480);cases.push('drop outside matrix cancels; background redraw cannot interrupt a held task');
 a=await center(row('qa-0'));await touch('touchStart',a);await delay(480);await touch('touchCancel');assert.equal((await state('qa-0')).quadrant,0);assert.equal(await p.locator('.drop-target').count(),0);cases.push('touch cancellation clears preview and leaves task intact');
 await seed();await swipe('qa-0',-62);assert.equal((await state('qa-0')).deleted,false);assert.equal(await p.locator('.swipe-open').count(),1);await p.screenshot({path:path.join(out,'v24-swipe-mobile.png')});
 await p.locator('[data-swipe-id="qa-0"] .swipe-delete').click();assert.equal((await state('qa-0')).deleted,true);await p.getByRole('button',{name:'撤销',exact:true}).click();assert.equal((await state('qa-0')).deleted,false);cases.push('left swipe reveals Delete; click moves to trash; Undo restores it');
 await delay(480);await swipe('qa-0',60);assert.equal((await state('qa-0')).done,false);await p.locator('[data-swipe-id="qa-0"] .swipe-complete').click();assert.equal((await state('qa-0')).done,true);await p.getByRole('button',{name:'撤销',exact:true}).click();assert.equal((await state('qa-0')).done,false);cases.push('right swipe reveals Complete with working action and Undo');
 await seed();await p.evaluate(()=>expandQuadrant(0));await swipe('qa-0',225);assert.equal((await state('qa-0')).done,true);assert.equal(await p.locator('#overlay').isHidden(),true);await p.getByRole('button',{name:'撤销',exact:true}).click();await delay(480);await swipe('qa-0',-225);assert.equal((await state('qa-0')).deleted,true);await p.getByRole('button',{name:'撤销',exact:true}).click();cases.push('full swipes execute completion/deletion on release, with no accidental detail open');
 await seed();await swipe('qa-0',-60);await delay(480);await p.touchscreen.tap(...Object.values(await center(row('qa-0'))));assert.equal(await p.locator('.swipe-open').count(),0);assert.equal(await p.locator('#overlay').isHidden(),true);cases.push('tap on swiped content closes actions without opening details');
 await seed(24);let list=p.locator('.quadrant[data-quadrant="0"] .quad-list');a=await center(row('qa-3'));await touch('touchStart',a);await move(a,{x:a.x+2,y:a.y-150});await touch('touchEnd');await delay(450);assert((await list.evaluate(x=>x.scrollTop))>25);assert.equal(await p.evaluate(()=>db.items.some(t=>t.deleted||t.done||t.quadrant!==0)),false);cases.push('vertical touch scroll remains native without completion, deletion or priority changes');
 await seed();await p.evaluate(()=>{deleteItem('qa-0');toggleItem('qa-1');});await p.getByRole('button',{name:'撤销',exact:true}).click();assert.equal((await state('qa-1')).done,false);await p.getByRole('button',{name:'撤销',exact:true}).click();assert.equal((await state('qa-0')).deleted,false);cases.push('consecutive actions can be undone individually');
 await seed();await p.evaluate(()=>{const t=db.items[0];t.repeat='daily';t.dueAt=Date.now()+3600000;toggleItem(t.id);});assert.equal(await p.evaluate(()=>db.items.filter(t=>t.id.startsWith('qa-0:')&&!t.deleted).length),1);await p.getByRole('button',{name:'撤销',exact:true}).click();assert.equal((await state('qa-0')).done,false);assert.equal(await p.evaluate(()=>db.items.filter(t=>t.id.startsWith('qa-0:')&&!t.deleted).length),0);cases.push('undoing a repeating task also removes its untouched next occurrence');
 await seed();await p.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='qingxiao-v3')throw Error('QA storage full');return window.originalSet.call(this,k,v);};toggleItem('qa-0');Storage.prototype.setItem=window.originalSet;});assert.equal((await state('qa-0')).done,false);assert.match(await p.locator('#toast').innerText(),/未保存/);cases.push('failed local save rolls back action; UI does not falsely report success');
 await seed();await p.evaluate(()=>{deleteItem('qa-0');go('trash');});await delay(480);await swipe('qa-0',65);await p.locator('[data-swipe-id="qa-0"] .swipe-complete').click();assert.equal((await state('qa-0')).deleted,false);cases.push('right swipe in trash restores the item without a permanent-delete gesture');
 for(const width of [320,393]){await p.setViewportSize({width,height:852});await seed();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.getByRole('button',{name:'在很重要-很紧急添加事项',exact:true}).click();assert.equal(await p.evaluate(()=>editQ),0);await p.evaluate(()=>closePanel(true));}cases.push('320px and 393px matrix fit screen; each quadrant has direct Add');
 await p.setViewportSize({width:393,height:852});await seed();await p.screenshot({path:path.join(out,'v24-matrix-mobile.png')});
 const desktop=await browser.newContext({viewport:{width:1280,height:900}}),d=await desktop.newPage();
 await d.route('**/api/state',r=>r.fulfill({json:{records:[],acknowledgements:[]}}));await d.goto(baseURL);await d.waitForFunction(()=>!!window.QGestures);
 await d.evaluate(()=>{matrixDrafts[0]='电脑拖动测试';quickAddQuadrant(0);});
 let from=await d.locator('.task-open').boundingBox(),to=await d.locator('.quadrant[data-quadrant="3"]').boundingBox();await d.mouse.move(from.x+30,from.y+20);await d.mouse.down();await delay(480);await d.mouse.move(to.x+100,to.y+100,{steps:12});await d.mouse.up();assert.equal(await d.evaluate(()=>db.items[0].quadrant),3);await delay(480);await d.keyboard.press('Control+z');assert.equal(await d.evaluate(()=>db.items[0].quadrant),0);await d.locator('.task-open').click();assert.equal(await d.evaluate(()=>matrixFocus),0);assert.equal(await d.locator('#overlay').isHidden(),true);await d.locator('.task-open').click();assert.equal(await d.locator('#overlay').isHidden(),false);cases.push('desktop mouse drag, keyboard Undo and ordinary click all work');
 await d.evaluate(()=>closePanel(true));await d.screenshot({path:path.join(out,'v24-matrix-desktop.png')});
 assert.deepEqual(errors,[]);const result={cases,errors};fs.writeFileSync(path.join(out,'v24-browser-qa.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
