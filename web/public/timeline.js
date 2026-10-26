/* Task lifecycle dates and scheduled work are separate views of the same records. */
let timelineMode='activity',timelineKind='all',timelineLimit=100,timelinePageKey='';
try{if(localStorage.getItem('qingxiao-timeline-mode')==='schedule')timelineMode='schedule';}catch{}
const timelineHasTime=value=>typeof value==='number'&&value>0&&Number.isFinite(new Date(value).getTime());
function setTimelineMode(mode){timelineMode=mode==='schedule'?'schedule':'activity';timelineLimit=100;QGestures.close();try{localStorage.setItem('qingxiao-timeline-mode',timelineMode);}catch{}render();$('main').scrollTop=0;}
function timelineMonth(value){if(!/^\d{4}-\d{2}$/.test(value))return;const next=new Date(value+'-01T00:00:00');if(!Number.isFinite(+next))return;date=+next;render();$('main').scrollTop=0;}
function timelineCurrentMonth(){date=C.dayStart(Date.now());render();$('main').scrollTop=0;}
function timelineRecords(){
 const x=C.tree(db),events=[],unknown=[];
 for(const t of db.items){
  if(x.deleted.get(t.id)||t.kind==='note')continue;
  for(const [kind,value] of [['created',t.createdAt],...(t.done?[['completed',t.completedAt]]:[])]){
   const event={t,kind,at:timelineHasTime(value)?value:0,key:kind+':'+t.id};
   (event.at?events:unknown).push(event);
  }
 }
 for(const r of db.progress||[]){const t=x.nodes.get(r.taskId);if(r.deleted||!t||x.deleted.get(t.id)||t.kind==='note'||!timelineHasTime(r.createdAt))continue;events.push({t,kind:'progress',at:r.createdAt,key:'progress:'+r.id,progress:r});}
 events.sort((a,b)=>b.at-a.at||a.key.localeCompare(b.key));
 return {events,unknown};
}
function timelineEvent(event){
 const {t,kind,at,key}=event,created=kind==='created',inherited=created&&!!t.legacyParentId;
 if(kind==='progress')return `<article class="activity-event progress" data-activity-key="${esc(key)}"><div class="activity-time"><time datetime="${new Date(at).toISOString()}" title="${esc(when(at))}">${hm(at)}</time><i aria-hidden="true">✎</i></div><div class="activity-card"><div class="activity-label"><span>进展</span><small>${t.parentId?'子任务':'主任务'}${event.progress.editedAt?' · 已编辑':''}</small></div><button class="activity-progress-open" onclick="progressReveal(${arg(t.id)},${arg(event.progress.id)})"><strong>${esc(t.title)}</strong>${treePath(t.id)?`<small>${esc(treePath(t.id))}</small>`:''}<span class="activity-progress-text">${esc(event.progress.text)}</span></button></div></article>`;
 return `<article class="activity-event ${created?'created':'completed'}" data-activity-key="${esc(key)}"><div class="activity-time">${at?`<time datetime="${new Date(at).toISOString()}" title="${esc(when(at))}">${hm(at)}</time>`:'<span>未记录</span>'}<i aria-hidden="true">${created?'＋':'✓'}</i></div><div class="activity-card"><div class="activity-label"><span>${created?'创建':'完成'}</span><small>${C.tree(db).parents.get(t.id)?'子任务':'主任务'}${inherited?' · 创建日期沿用主任务':''}</small></div>${itemRow(t)}</div></article>`;
}
function timelineHtml(){
 const mo=C.dateKey(date).slice(0,7),activity=timelineMode==='activity',pageKey=mo+':'+timelineKind;
 if(timelinePageKey!==pageKey){timelinePageKey=pageKey;timelineLimit=100;}
 const tabs=`<div class="timeline-modes" role="group" aria-label="时间轴视图"><button class="${activity?'selected':''}" aria-pressed="${activity}" onclick="setTimelineMode('activity')">动态</button><button class="${!activity?'selected':''}" aria-pressed="${!activity}" onclick="setTimelineMode('schedule')">日程</button><span>${activity?'创建、进展与完成':'按截止日期查看'}</span></div>`;
 const month=`<div class="timeline-month"><button aria-label="上个月" onclick="changeMonth(-1)">‹</button><input type="month" aria-label="月份" value="${mo}" onchange="timelineMonth(this.value)"><button aria-label="下个月" onclick="changeMonth(1)">›</button><button class="timeline-today" onclick="timelineCurrentMonth()">本月</button></div>`;
 if(!activity)return `<section class="timeline-page">${tabs}${month}${timelineSchedule(mo)}</section>`;
 const {events,unknown}=timelineRecords(),monthly=events.filter(e=>C.dateKey(e.at).slice(0,7)===mo),selected=monthly.filter(e=>timelineKind==='all'||timelineKind===e.kind),missing=unknown.filter(e=>timelineKind==='all'||timelineKind===e.kind),shown=selected.slice(0,timelineLimit),groups=new Map();
 for(const e of shown){const day=C.dateKey(e.at);if(!groups.has(day))groups.set(day,[]);groups.get(day).push(e);}
 const counts=kind=>monthly.filter(e=>e.kind===kind).length;
 const filters=`<div class="activity-filters" role="group" aria-label="动态类型">${[['all','全部'],['created','创建'],['completed','完成'],['progress','进展']].map(([v,label])=>`<button class="${timelineKind===v?'selected':''}" aria-pressed="${timelineKind===v}" onclick="timelineKind='${v}';render()">${label}</button>`).join('')}<small>创建 ${counts('created')} · 完成 ${counts('completed')} · 进展 ${counts('progress')}</small></div>`;
 const list=[...groups].map(([day,rows])=>`<section class="activity-day"><h2><time datetime="${day}">${new Date(day+'T00:00:00').toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'})}</time><small>${rows.length} 条</small></h2>${rows.map(timelineEvent).join('')}</section>`).join('');
 return `<section class="timeline-page">${tabs}${month}${filters}<div class="activity-list">${list||'<div class="empty">本月暂无'+(timelineKind==='created'?'创建':timelineKind==='completed'?'完成':timelineKind==='progress'?'进展':'动态')+'记录<small>可切换月份，查看之前的事项。</small></div>'}${selected.length>shown.length?`<button class="activity-more" onclick="timelineLimit+=100;render()">再显示 ${Math.min(100,selected.length-shown.length)} 条 · 还有 ${selected.length-shown.length} 条</button>`:''}</div>${missing.length?`<details class="activity-unknown"><summary>未记录时间 · ${missing.length} 条</summary><p>这些旧事项未保存对应时间，不归入任何月份。</p>${missing.slice(0,timelineLimit).map(timelineEvent).join('')}${missing.length>timelineLimit?'<button class="activity-more" onclick="timelineLimit+=100;render();document.querySelector(\'.activity-unknown\').open=true">显示更多旧记录</button>':''}</details>`:''}<p class="activity-note">包含主任务和子任务；进展保留原记录时间，完成显示最近一次时间。恢复未完成后，对应完成记录会撤回。</p></section>`;
}
function timelineSchedule(mo){
 const x=C.tree(db),items=db.items.filter(t=>!x.deleted.get(t.id)&&t.kind!=='note'&&(filter==='all'||(filter==='done'?t.done:!t.done))&&(!t.dueAt||C.dateKey(t.dueAt).startsWith(mo))),groups={};
 items.forEach(t=>(groups[t.dueAt?C.dateKey(t.dueAt):'未安排']??=[]).push(t));
 return `<div class="timeline-status"><label>完成状态 <select aria-label="完成状态" onchange="filter=this.value;render()">${[['unfinished','未完成'],['done','已完成'],['all','全部']].map(([v,n])=>`<option value="${v}" ${filter===v?'selected':''}>${n}</option>`).join('')}</select></label></div><div class="timeline-list">`+Object.keys(groups).sort().map(day=>`<div class="timeline-day"><span>${day==='未安排'?day:new Date(day+'T00:00:00').toLocaleDateString('zh-CN',{year:'numeric',month:'numeric',day:'numeric',weekday:'long'})}</span><button aria-label="在${esc(day)}新增事项" onclick="newOnDay(${arg(day)})">＋</button></div>${groups[day].sort((a,b)=>(a.dueAt||0)-(b.dueAt||0)).map(itemRow).join('')}`).join('')+'</div>'+(!items.length?'<div class="empty">这个月还没有安排</div>':'');
}
const timelineBaseOpen=openItem;
openItem=function(id,sid=''){
 timelineBaseOpen(id,sid);const t=treeTask(C.resolveNode(db,id,sid));if(!t)return;
 const box=document.createElement('div');box.className='task-lifecycle';
 box.innerHTML=`<div><span>创建</span><time>${timelineHasTime(t.createdAt)?esc(when(t.createdAt)):'未记录时间'}</time>${t.legacyParentId?'<small>沿用主任务日期</small>':''}</div>${t.done?`<div><span>完成</span><time>${timelineHasTime(t.completedAt)?esc(when(t.completedAt)):'未记录时间'}</time></div>`:''}`;
 $('panel').querySelector('.detail-title')?.after(box);
};
