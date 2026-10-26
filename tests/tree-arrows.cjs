const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const out=process.env.QINGXIAO_TEST_OUTPUT||'test-results/tree-arrows';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const ctx=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true}),p=await ctx.newPage(),errors=[],checks=[];
  p.on('pageerror',e=>errors.push(e.message));await p.route('**/api/**',r=>r.fulfill({json:{records:[],acknowledgements:[]}}));
  await p.goto(process.env.QINGXIAO_TEST_URL||'http://127.0.0.1:5173/client.html');await p.waitForFunction(()=>!!window.QGestures);
  const row=id=>p.locator('#main [data-task-id="'+id+'"]');
  const preview=id=>p.locator('#main [data-tree-preview="'+id+'"]');
  async function tap(loc){const b=await loc.boundingBox();assert(b);await p.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);}
  async function seed(v='timeline',done=false){await p.evaluate(({v,done})=>{
   timelineMode='schedule';localStorage.setItem('qingxiao-timeline-mode','schedule');closePanel(true);QGestures.close();db=C.blank();treeExpanded.clear();treeBranch='';matrixScope='all';filter='all';date=Date.now();
   const n=(id,parentId='',dueAt=0)=>({id,parentId,title:{r:'准备方案',c:'收集资料',g:'确认数据',d:'已删步骤'}[id],notes:'',kind:'task',quadrant:0,project:'工作',tags:[],photos:[],subtasks:[],done,completedAt:done?Date.now():0,deleted:id==='d',order:0,dueAt});
   db.items=[n('r','',Date.now()),n('c','r',Date.now()+86400000),n('g','c'),n('d','r')];save();go(v);
  },{v,done});}
  await seed();const before=await p.evaluate(()=>JSON.stringify(db));await tap(row('r').locator('.tree-toggle'));
  assert.equal(await p.locator('#overlay').isHidden(),true,'arrow must expand inline instead of opening details');
  assert.equal(await preview('r').count(),1);assert.match(await preview('r').innerText(),/收集资料/);assert.doesNotMatch(await preview('r').innerText(),/已删步骤/);
  assert.equal(await row('r').locator('.tree-toggle').getAttribute('aria-expanded'),'true');
  assert.equal(await p.evaluate(()=>JSON.stringify(db)),before);checks.push('timeline touch arrow expands children inline without changing task data or opening detail');
  assert.equal(await row('c').count(),1);assert.equal(await p.locator('.timeline-day').count(),3);
  checks.push('independent child schedule remains in its original date group; preview does not duplicate swipe rows');
  await tap(preview('r').getByRole('button',{name:'展开子任务 收集资料',exact:true}));assert.match(await preview('r').innerText(),/确认数据/);
  await tap(preview('r').getByRole('button',{name:'收起子任务 收集资料',exact:true}));assert.doesNotMatch(await preview('r').innerText(),/确认数据/);
  await p.screenshot({path:out+'/timeline-expanded.png'});await tap(row('r').locator('.tree-toggle'));assert.equal(await preview('r').count(),0);checks.push('nested arrows expand and collapse independently; parent collapse hides the preview');
  await tap(row('r').locator('.tree-toggle'));await tap(preview('r').getByRole('button',{name:'查看子任务 收集资料',exact:true}));assert.equal(await p.locator('#panel .detail-title').innerText(),'收集资料');
  await p.evaluate(()=>closePanel(true));await p.reload();await p.waitForFunction(()=>!!window.QGestures);await p.evaluate(()=>{filter='all';go('timeline');});assert.equal(await preview('r').count(),1);checks.push('child title opens its detail; expansion survives reload');
  await seed('done',true);await tap(row('r').locator('.tree-toggle'));assert.equal(await preview('r').count(),1);assert.match(await preview('r').innerText(),/已完成/);assert.equal(await p.locator('#overlay').isHidden(),true);checks.push('completed task list can expand completed branches');
  await seed('search');await p.getByRole('textbox',{name:'搜索',exact:true}).fill('准备方案');await tap(row('r').locator('.tree-toggle'));assert.equal(await preview('r').count(),1);assert.equal(await p.getByRole('textbox',{name:'搜索',exact:true}).inputValue(),'准备方案');checks.push('search result expansion preserves query and shows child context');
  await seed('matrix');let b=await row('r').locator('.tree-toggle').boundingBox();assert(b.width>=32&&b.height>=44);
  await p.touchscreen.tap(b.x+3,b.y+3);assert.equal(await row('c').count(),1);assert.equal(await p.evaluate(()=>matrixFocus),-1);assert.equal(await p.locator('#overlay').isHidden(),true);
  await tap(row('r').locator('.tree-toggle'));assert.equal(await row('c').count(),0);checks.push('matrix arrow edge taps expand/collapse without opening quadrant, completing or dragging');
  await p.setViewportSize({width:320,height:740});await seed('matrix');await tap(row('r').locator('.tree-toggle'));assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await p.evaluate(()=>db.items.some(t=>t.done)),false);checks.push('larger arrow target still fits 320px matrix and does not alter completion');
  await seed();await tap(row('r').locator('.tree-toggle'));await tap(preview('r').getByRole('button',{name:'展开子任务 收集资料',exact:true}));assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checks.push('nested list preview fits narrow screens');
  const desktop=await browser.newPage({viewport:{width:1280,height:900}});await desktop.route('**/api/**',r=>r.fulfill({json:{records:[],acknowledgements:[]}}));await desktop.goto(process.env.QINGXIAO_TEST_URL||'http://127.0.0.1:5173/client.html');
  const fixture=await p.evaluate(()=>db);await desktop.evaluate(data=>{db=data;timelineMode='schedule';treeExpanded.clear();filter='all';go('timeline');},fixture);await desktop.locator('[data-task-id="r"] .tree-toggle').click();assert.equal(await desktop.locator('[data-tree-preview="r"]').count(),1);checks.push('desktop mouse arrow expands inline');
  assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
