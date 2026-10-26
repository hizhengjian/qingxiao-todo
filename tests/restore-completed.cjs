const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const out=process.env.QINGXIAO_TEST_OUTPUT||'test-results/restore-completed';
fs.mkdirSync(out,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const ctx=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(),cdp=await ctx.newCDPSession(p),checks=[],errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/api/**',r=>r.fulfill({json:{records:[],acknowledgements:[]}}));
  await p.goto(process.env.QINGXIAO_TEST_URL||'http://127.0.0.1:5173/client.html');
  await p.waitForFunction(()=>!!window.QGestures);
  const row=id=>p.locator('#main [data-task-id="'+id+'"]');
  const stored=id=>p.evaluate(id=>JSON.parse(localStorage.getItem('qingxiao-v3')).items.find(t=>t.id===id),id);
  async function seed(page='timeline',status='done'){
   await p.evaluate(({page,status})=>{
    timelineMode='schedule';localStorage.setItem('qingxiao-timeline-mode','schedule');QGestures.cancel();closePanel(true);db=C.blank();date=Date.now();filter=status;
    const node=(id,parentId='',done=true)=>({id,parentId,title:{root:'已完成的方案',child:'完成的步骤',open:'尚未完成'}[id],notes:'保留备注',kind:'task',quadrant:0,tags:[],subtasks:[],photos:[],done,deleted:false,completedAt:done?12345:0,dueAt:Date.now(),order:0});
    db.items=[node('root'),node('child','root'),node('open','',false)];
    save();go(page);window.qaSyncRequests=0;window.qaScheduleSync=scheduleSync;scheduleSync=()=>qaSyncRequests++;
   },{page,status});await pause(480);
  }
  async function touch(type,x,y){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});}
  async function swipe(id,dx){const b=await row(id).locator('.task-open').boundingBox(),x=b.x+8,y=b.y+b.height/2;await touch('touchStart',x,y);for(let i=1;i<=8;i++){await touch('touchMove',x+dx*i/8,y);await pause(18);}await touch('touchEnd');await pause(200);}
  await seed();await swipe('root',64);await p.locator('[data-swipe-id="root"] .swipe-complete').click();
  assert.equal((await stored('root')).done,false,'restore must be saved, not only changed in memory');
  assert.equal((await stored('root')).completedAt,0);assert.equal(await row('root').count(),0);assert.equal(await p.evaluate(()=>qaSyncRequests),1);
  assert.equal((await stored('child')).done,true);assert.equal((await stored('root')).notes,'保留备注');
  await p.getByRole('button',{name:'撤销',exact:true}).click();assert.equal((await stored('root')).done,true);assert.equal((await stored('root')).completedAt,12345);
  checks.push('short right swipe restores, persists, refreshes filtered timeline, queues sync and supports Undo');
  await seed();await swipe('root',230);assert.equal((await stored('root')).done,false);assert.equal(await row('root').count(),0);
  await p.reload();await p.waitForFunction(()=>!!window.QGestures);assert.equal((await stored('root')).done,false);assert.equal(await row('root').count(),1);
  checks.push('full right swipe survives reload and reappears in unfinished quadrant');
  await seed('timeline','all');await swipe('root',230);assert.equal(await row('root').evaluate(el=>el.classList.contains('done')),false);
  await p.screenshot({path:out+'/timeline-restored.png'});checks.push('all-status timeline removes completed styling immediately');
  await seed('done');await swipe('root',230);assert.equal((await stored('root')).done,false);assert.equal(await row('root').count(),0);
  checks.push('completed list uses the same working restore action');
  await seed();await p.getByRole('button',{name:'操作 已完成的方案',exact:true}).click();await p.getByRole('button',{name:'恢复未完成',exact:true}).click();
  assert.equal((await stored('root')).done,false);assert.equal(await p.locator('#overlay').isHidden(),true);
  await seed();await row('root').locator('.task-open').click();await p.getByRole('checkbox',{name:'完成事项',exact:true}).uncheck();
  assert.equal((await stored('root')).done,false);assert.equal(await p.locator('#overlay').isHidden(),true);checks.push('menu and detail checkbox both persist restored status');
  await seed();await p.evaluate(()=>{treeTask('root').done=false;save();render();});await swipe('child',230);
  assert.equal((await stored('child')).done,false);assert.equal((await stored('child')).parentId,'root');assert.equal(await p.evaluate(()=>C.progress(db,'root').done),0);
  checks.push('restoring a child preserves its parent and updates branch progress');
  await seed();await p.evaluate(()=>{window.qaSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='qingxiao-v3')throw Error('full');return qaSetItem.call(this,k,v);};});
  await swipe('root',230);assert.equal((await stored('root')).done,true);assert.equal(await p.evaluate(()=>treeTask('root').done),true);assert.match(await p.locator('#toast').innerText(),/未保存/);
  await p.evaluate(()=>Storage.prototype.setItem=qaSetItem);checks.push('failed storage rolls back restore without reporting success');
  await seed();const noChange=await p.evaluate(()=>{const before=localStorage.getItem('qingxiao-v3'),undo=QGestures.peekUndo();const result=treeTransaction('no change',()=>false);return {result,same:before===localStorage.getItem('qingxiao-v3'),sameUndo:undo===QGestures.peekUndo(),syncs:qaSyncRequests};});
  assert.deepEqual(noChange,{result:false,same:true,sameUndo:true,syncs:0});checks.push('actual no-op still skips storage, sync and Undo');
  assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
