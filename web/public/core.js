/* Shared offline data model, synchronization and time accounting. */
(function(root){'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
const blank=()=>({format:'qingxiao-todo',version:3,items:[],sessions:[],catalogs:[],preferences:[],deviceId:uid()});
function normalize(x){if(!x||x.format!=='qingxiao-todo'||![1,2,3].includes(x.version)||!Array.isArray(x.items))throw Error('不是轻效Todo备份');let legacy=x.version===1;x=clone(x);x.version=3;x.sessions??=[];x.catalogs??=[];x.preferences??=[];x.deviceId??=uid();
 for(let [old,type] of [['projects','project'],['tags','tag']])for(let name of x[old]||[])if(typeof name==='string'&&!x.catalogs.some(c=>c.type===type&&c.name===name))x.catalogs.push({id:uid(),type,name,color:'#00b7e9',_dirty:true,_op:uid(),_rev:0});
 for(let t of x.items){t.notes??='';t.subtasks??=[];t.photos??=[];t.tags??=[];t.quadrant??=1;t.weight??=1;t.estimate??=0;t.kind??='task';t.subtasks.forEach(s=>{s.id??="index:"+t.subtasks.indexOf(s);s.estimate??=0;s.reminderStyle??='notification';});if(legacy)touch(t);}
 x.items=migrateItems(x.items); invalidate();validate(x);return x;}

// Stable legacy IDs let independently upgraded devices converge on the same nodes.
function childId(parent,id){let a=2166136261,b=2246822519;for(let c of JSON.stringify([parent,id]).split('')){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b^c.charCodeAt(0),3266489917);}return 'child:'+ (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
function migrateItems(items){const result=[],known=new Set(items.map(t=>t.id));for(const original of items){let t=clone(original),subs=t.subtasks||[];t.parentId??='';if(t.deleted&&subs.length)t.deleteBatch??='migration:'+t.id;t.treeVersion=3;t.subtasks=[];result.push(t);let seen=new Set();subs.forEach((s,i)=>{let sid=s.id||'index:'+i,key=seen.has(sid)?sid+':duplicate:'+i:sid;seen.add(sid);let id=childId(t.id,key);if(known.has(id)){const existing=items.find(n=>n.id===id);if(existing?.legacyParentId!==t.id||existing?.legacySubtaskId!==sid)throw Error('子任务编号冲突，请保留备份');return;}known.add(id);result.push({...s,id,parentId:t.id,title:s.text||s.title||'未命名子任务',notes:s.notes||'',kind:'task',quadrant:t.quadrant,project:t.project||'',tags:s.tags||[],photos:s.photos||[],subtasks:[],treeVersion:3,order:i,weight:s.weight||1,estimate:s.estimate||0,done:!!s.done,deleted:!!t.deleted,deleteBatch:t.deleteBatch||'',purged:!!t.purged,createdAt:t.createdAt||0,updatedAt:t.updatedAt||0,legacyParentId:t.id,legacySubtaskId:sid,_rev:t._rev||0,_dirty:!!t._dirty,_op:childId(t.id,key+':'+(t._op||''))});});}return result;}
let generation=0;const treeCache=new WeakMap();
function invalidate(){generation++;}
function tree(db){let saved=treeCache.get(db);if(saved&&saved.generation===generation&&saved.items===db.items&&saved.count===db.items.length)return saved;
 const nodes=new Map(db.items.map(t=>[t.id,t])),parents=new Map(),children=new Map(),issues=new Set();
 for(let t of db.items){let p=t.parentId||'';if(p&&(!nodes.has(p)||p===t.id)){issues.add(t.id);p='';}parents.set(t.id,p);children.set(t.id,[]);}
 // A concurrent move can form a cycle. Cut a deterministic display edge, retaining every record.
 const visited=new Set();for(let t of db.items){let path=[],at=new Map(),id=t.id;while(id&&!visited.has(id)){if(at.has(id)){let cycle=path.slice(at.get(id)),cut=cycle.slice().sort()[0];parents.set(cut,'');cycle.forEach(x=>issues.add(x));break;}at.set(id,path.length);path.push(id);id=parents.get(id);}path.forEach(x=>visited.add(x));}
 const roots=[];for(let t of db.items){let p=parents.get(t.id);if(p)children.get(p).push(t);else roots.push(t);}
 const sort=(a,b)=>(a.order||0)-(b.order||0)||a.id.localeCompare(b.id);roots.sort(sort);children.forEach(a=>a.sort(sort));
 const rootIds=new Map(),deleted=new Map(),done=new Map(),depth=new Map(),stack=roots.slice().reverse().map(t=>[t,0,t.id,false,false]);while(stack.length){let [t,d,r,del,fin]=stack.pop();rootIds.set(t.id,r);depth.set(t.id,d);deleted.set(t.id,!!(del||t.deleted||t.purged));done.set(t.id,!!(fin||t.done));for(let c of children.get(t.id).slice().reverse())stack.push([c,d+1,r,deleted.get(t.id),done.get(t.id)]);}
 const x={nodes,parents,children,roots,rootIds,deleted,done,depth,issues,generation,items:db.items,count:db.items.length};treeCache.set(db,x);return x;}
function descendants(db,id,includeSelf=true){let x=tree(db),out=[],stack=includeSelf?[x.nodes.get(id)]:(x.children.get(id)||[]).slice().reverse();while(stack.length){let t=stack.pop();if(!t)continue;out.push(t);for(let c of (x.children.get(t.id)||[]).slice().reverse())stack.push(c);}return out;}
function ancestors(db,id){let x=tree(db),out=[],p=x.parents.get(id);while(p){out.push(x.nodes.get(p));p=x.parents.get(p);}return out.reverse();}
function effective(db,t){let x=tree(db),root=x.nodes.get(x.rootIds.get(t.id))||t;return {...t,quadrant:root.quadrant,project:root.project||''};}
function progress(db,id){let x=tree(db),branch=descendants(db,id,false).filter(t=>!x.deleted.get(t.id)),leaves=branch.filter(t=>!(x.children.get(t.id)||[]).some(c=>!x.deleted.get(c.id)));return {total:leaves.length,done:leaves.filter(t=>x.done.get(t.id)).length,overdue:branch.filter(t=>!x.done.get(t.id)&&t.dueAt&&t.dueAt<Date.now()).length};}
function resolveNode(db,id,sid=''){return sid?(db.items.find(t=>t.legacyParentId===id&&t.legacySubtaskId===sid)?.id||childId(id,sid)):id;}
function moveNode(db,id,parentId){let x=tree(db),t=x.nodes.get(id),p=x.nodes.get(parentId);if(!t||t.deleted)throw Error('事项已不可用');if(parentId&&(!p||x.deleted.get(parentId)||x.done.get(parentId)||p.kind==='note'))throw Error('请选择未完成事项');if(parentId&&descendants(db,id).some(n=>n.id===parentId))throw Error('不能移动到自己或自己的子任务中');let e=effective(db,t);Object.assign(t,{parentId:parentId||'',quadrant:e.quadrant,project:e.project,order:Date.now()});touch(t);return t;}

// Reorder one record between its neighbors; keep unrelated siblings clean for sync.
function placeNode(db,id,{parentId='',quadrant,beforeId=null}){
 const x=tree(db),t=x.nodes.get(id),parent=x.nodes.get(parentId);
 if(!t||x.deleted.get(id)||x.done.get(id)||t.kind==='note')throw Error('事项已变化，请重新拖动');
 if(parentId&&(!parent||x.deleted.get(parentId)||x.done.get(parentId)||parent.kind==='note'))throw Error('目标任务已不可用');
 if(parentId&&descendants(db,id).some(n=>n.id===parentId))throw Error('不能移入自己或自己的后代');
 const old=effective(db,t),q=parent?effective(db,parent).quadrant:quadrant;
 if(!Number.isInteger(q)||q<0||q>3)throw Error('请选择四象限区域');
 const all=(parentId?(x.children.get(parentId)||[]):x.roots).filter(n=>!x.deleted.get(n.id)&&n.kind!=='note'&&(parentId||(!n.done&&effective(db,n).quadrant===q)));
 const list=all.filter(n=>n.id!==id),index=beforeId==null?list.length:list.findIndex(n=>n.id===beforeId);
 if(index<0)throw Error('插入位置已变化，请重新拖动');
 const same=(x.parents.get(id)||'')===parentId&&old.quadrant===q;
 if(same&&all.indexOf(t)===index)return false;
 const rank=n=>Number.isFinite(n?.order)?n.order:0;
 let left=list[index-1],right=list[index],order=left&&right?rank(left)+(rank(right)-rank(left))/2:left?rank(left)+1024:right?rank(right)-1024:0;
 if(!Number.isFinite(order)||(left&&order<=rank(left))||(right&&order>=rank(right))){
  list.splice(index,0,t);list.forEach((n,i)=>{if(n!==t&&n.order!==i*1024){n.order=i*1024;touch(n);}});order=index*1024;
 }
 Object.assign(t,{parentId,quadrant:q,project:parent?effective(db,parent).project:old.project,order});touch(t);return true;
}

function validate(x){let all=new Set();for(let arr of ['items','sessions','catalogs','preferences']){if(!Array.isArray(x[arr])||x[arr].length>20000)throw Error('记录数量或格式不正确');for(let r of x[arr]){if(!r||typeof r.id!=='string'||!r.id||all.has(r.id))throw Error('记录编号重复或无效');all.add(r.id);}}
 for(let t of x.items){if(t.parentId!=null&&typeof t.parentId!=='string')throw Error('父任务编号无效');if(typeof t.title!=='string'||typeof t.notes!=='string'||!Number.isInteger(t.quadrant)||t.quadrant<0||t.quadrant>3||!Array.isArray(t.tags)||t.tags.some(s=>typeof s!=='string')||!Array.isArray(t.subtasks)||t.subtasks.some(s=>typeof s.text!=='string'||typeof s.id!=='string'))throw Error('待办字段无效');}
 for(let t of x.items){for(let r of [t,...t.subtasks]){for(let f of ['startAt','dueAt','remindAt'])if(r[f]!=null&&(!Number.isFinite(r[f])||r[f]<0))throw Error('日程时间无效');if(r.startAt&&r.dueAt&&r.dueAt<r.startAt)throw Error('日程结束不能早于开始');}if(!Array.isArray(t.photos||[])||(t.photos||[]).length>12||(t.photos||[]).some(p=>!p||!/^photo-[a-zA-Z0-9-]{10,80}$/.test(p.id)))throw Error('照片信息无效');}
 for(let s of x.sessions){if(!Array.isArray(s.segments)||s.segments.some(p=>!Number.isFinite(p.startAt)||!Number.isFinite(p.endAt)||p.endAt<p.startAt)||typeof s.title!=='string')throw Error('专注时间记录无效');}return x;}
const kinds={items:'item',sessions:'session',catalogs:'catalog',preferences:'preference'},arrays=Object.fromEntries(Object.entries(kinds).map(([a,b])=>[b,a]));
function touch(r){invalidate();r.updatedAt=Date.now();r._dirty=true;r._op=uid();r._rev??=0;return r;}
function changes(db){let result=[];for(let [array,kind]of Object.entries(kinds))for(let r of db[array])if(r._dirty){let data=clone(r);delete data._dirty;delete data._op;delete data._rev;result.push({id:r.id,kind,baseRev:r._rev||0,opId:r._op,data});}return result.slice(0,100);}
function merge(db,response){invalidate();let ack=new Map((response.acknowledgements||[]).map(a=>[a.id,a])),conflicts=0;for(let remote of response.records||[]){let array=arrays[remote.kind];if(!array)continue;let list=db[array],index=list.findIndex(r=>r.id===remote.id),local=list[index],a=ack.get(remote.id);if(local&&(local._rev||0)>remote.rev)continue;
 if(local?._dirty){
  if(a&&a.opId===local._op){if(!a.accepted){let copy=clone(local);copy.id=uid();copy._rev=0;copy.conflictOf=local.id;copy.conflictAt=Date.now();if(copy.title)copy.title+='（冲突副本）';if(copy.name)copy.name+='（冲突副本）';touch(copy);list.push(copy);conflicts++;}list[index]={...remote.data,_rev:remote.rev,_dirty:false};}
  else if(a?.accepted){local._rev=Math.max(local._rev||0,a.rev);}
  // An unacknowledged local edit is retained until it is submitted against its base revision.
 }else {let r={...remote.data,_rev:remote.rev,_dirty:false};if(index<0)list.push(r);else list[index]=r;}
 }for(let a of response.acknowledgements||[]){if((response.records||[]).some(r=>r.id===a.id))continue;for(let array of Object.keys(kinds)){let local=db[array].find(r=>r.id===a.id);if(local?._dirty&&local._op===a.opId){if(a.accepted){local._rev=a.rev;local._dirty=false;}else if(a.rev===0){local._rev=0;local._op=uid();}}}}return conflicts;}
function dayStart(value){let d=new Date(value);d.setHours(0,0,0,0);return +d;}
function nextDay(value,n=1){let d=new Date(dayStart(value));d.setDate(d.getDate()+n);return +d;}
function dateKey(value){let d=new Date(value);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function slices(session,start,end){return(session.segments||[]).map(s=>({startAt:Math.max(start,s.startAt),endAt:Math.min(end,s.endAt)})).filter(s=>s.endAt>s.startAt);}
function unionDuration(parts){let sorted=parts.slice().sort((a,b)=>a.startAt-b.startAt),sum=0,end=-Infinity;for(let x of sorted){sum+=Math.max(0,x.endAt-Math.max(end,x.startAt));end=Math.max(end,x.endAt);}return sum;}
function stats(sessions,start,end){let live=sessions.filter(s=>!s.deleted),parts=live.flatMap(s=>slices(s,start,end));return{recorded:unionDuration(parts),focus:unionDuration(live.filter(s=>s.mode==='focus').flatMap(s=>slices(s,start,end))),break:unionDuration(live.filter(s=>s.mode==='break').flatMap(s=>slices(s,start,end))),completed:live.filter(s=>s.mode==='focus'&&s.status==='completed'&&s.endAt>=start&&s.endAt<end).length,partial:live.filter(s=>s.mode==='focus'&&s.status==='partial'&&s.endAt>=start&&s.endAt<end).length};}
function taskStats(db,id,subtaskId){let ids=new Set(descendants(db,resolveNode(db,id,subtaskId)).map(t=>t.id)),sessions=db.sessions.filter(s=>!s.deleted&&ids.has(resolveNode(db,s.taskId,s.subtaskId))&&s.mode==='focus');return{completed:sessions.filter(s=>s.status==='completed').length,duration:unionDuration(sessions.flatMap(s=>s.segments))};}
function nextOccurrence(t){if(!t.repeat||t.repeat==='none'||!t.dueAt)return null;let d=new Date(t.dueAt),anchor=new Date(t.repeatAnchor||t.dueAt),original=anchor.getDate();switch(t.repeat){case'daily':d.setDate(d.getDate()+1);break;case'weekdays':do{d.setDate(d.getDate()+1);}while([0,6].includes(d.getDay()));break;case'weekly':d.setDate(d.getDate()+7);break;case'monthly':d.setDate(1);d.setMonth(d.getMonth()+1);d.setDate(Math.min(original,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));break;case'yearly':d.setDate(1);d.setFullYear(d.getFullYear()+1);d.setMonth(anchor.getMonth());d.setDate(Math.min(original,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));break;default:return null;}
 if(t.repeatUntil&&dateKey(+d)>t.repeatUntil)return null;return +d;}
// Reopening a child also reopens its completed ancestor path; siblings keep their status.
function complete(db,t){const branch=descendants(db,t.id),done=!t.done;let next=done?nextOccurrence(t):null;if(next){let id=(t.repeatRoot||t.id)+':'+next,delta=next-t.dueAt;if(!db.items.some(n=>n.id===id)){let ids=new Map(branch.map(n=>[n.id,n===t?id:childId(id,n.id)]));for(let n of branch.filter(n=>!n.deleted)){let copy=clone(n);Object.assign(copy,{id:ids.get(n.id),parentId:n===t?t.parentId:ids.get(n.parentId),repeat:n===t?n.repeat:'none',repeatRoot:n===t?(t.repeatRoot||t.id):'',repeatAnchor:n.repeatAnchor||n.dueAt,done:false,completedAt:0,createdAt:Date.now(),_rev:0});delete copy.legacyParentId;delete copy.legacySubtaskId;for(let f of ['startAt','dueAt','remindAt'])if(copy[f])copy[f]+=delta;db.items.push(touch(copy));}}}for(let n of (done?branch:[...ancestors(db,t.id).filter(n=>n.done),t]))if(!n.deleted&&(!done||!n.done)){n.done=done;n.completedAt=done?Date.now():0;touch(n);}return done;}
function startTimer(input,now=Date.now()){const plannedMs=input.minutes*60000;if(!Number.isFinite(plannedMs)||plannedMs<60000||plannedMs>180*60000)throw Error('时长须为1～180分钟');return{id:uid(),state:'running',mode:input.mode||'focus',title:input.title||'自由专注',taskId:input.taskId||'',subtaskId:input.subtaskId||'',project:input.project||'',category:input.category||'专注',deviceId:input.deviceId||'',plannedMs,remainingMs:plannedMs,startedAt:now,segmentStartedAt:now,endAt:now+plannedMs,segments:[]};}
function pauseTimer(t,now=Date.now()){if(t.state!=='running')return t;let end=Math.min(now,t.endAt);if(end>t.segmentStartedAt)t.segments.push({startAt:t.segmentStartedAt,endAt:end});t.remainingMs=Math.max(0,t.endAt-now);t.state='paused';return t;}
function resumeTimer(t,now=Date.now()){if(t.state!=='paused')return t;t.state='running';t.segmentStartedAt=now;t.endAt=now+t.remainingMs;return t;}
function finishTimer(t,now=Date.now()){const finished=(t.state==='running'&&now>=t.endAt)||(t.state==='paused'&&t.remainingMs<=0);if(t.state==='running')pauseTimer(t,now);let seg=t.segments.filter(s=>s.endAt>s.startAt),durationMs=unionDuration(seg);return touch({id:'session:'+t.id,title:t.title,taskId:t.taskId,subtaskId:t.subtaskId,project:t.project,category:t.category,deviceId:t.deviceId,mode:t.mode,status:finished?'completed':'partial',startAt:t.startedAt,endAt:seg.at(-1)?.endAt||now,plannedMs:t.plannedMs,durationMs,segments:seg,deleted:false});}
function agenda(db,start,end){let out=[],x=tree(db);for(let t of db.items.filter(t=>!x.deleted.get(t.id)&&t.kind!=='note')){let a=t.startAt||t.dueAt,b=t.dueAt||a+1800000;if(!a||a>=end||Math.max(b,a+1)<=start)continue;out.push({taskId:t.id,subtaskId:'',title:t.title,parentTitle:ancestors(db,t.id).map(t=>t.title).join(' / '),startAt:a,endAt:Math.max(b,a+1),done:!!x.done.get(t.id),quadrant:effective(db,t).quadrant,remindAt:t.remindAt||0});}return out.sort((a,b)=>a.startAt-b.startAt);}
root.QCore={placeNode,childId,migrateItems,invalidate,tree,descendants,ancestors,effective,progress,resolveNode,moveNode,agenda,clone,uid,blank,normalize,validate,touch,changes,merge,dayStart,nextDay,dateKey,slices,unionDuration,stats,taskStats,nextOccurrence,complete,startTimer,pauseTimer,resumeTimer,finishTimer};
if(typeof module!=='undefined')module.exports=root.QCore;
})(globalThis);
