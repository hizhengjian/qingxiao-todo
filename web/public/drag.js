/* Tree-aware drop targets. Hover only previews; records change once on release. */
(function(){
 'use strict';
 const NEST_MS=650;
 const stamp=t=>{const x=C.tree(db),e=C.effective(db,t);return JSON.stringify([t.id,t.parentId||'',t.order||0,e.quadrant,e.project,!!x.deleted.get(t.id),!!x.done.get(t.id),t.title]);};
 const live=(x,id)=>x.nodes.has(id)&&!x.deleted.get(id)&&!x.done.get(id)&&x.nodes.get(id).kind!=='note';
 function visibleRows(quad){return [...quad.querySelectorAll('.task-row')];}
 function siblings(parentId,q,id){const x=C.tree(db);return (parentId?(x.children.get(parentId)||[]):x.roots).filter(t=>t.id!==id&&!x.deleted.get(t.id)&&t.kind!=='note'&&(parentId||(!t.done&&C.effective(db,t).quadrant===q)));}
 function getBefore(drop,id){if(drop.position==='inside'||drop.position==='end')return null;if(drop.position==='before')return drop.targetId;const list=siblings(drop.parentId,drop.q,id),at=list.findIndex(t=>t.id===drop.targetId);if(at<0)throw Error('目标已变化，请重新拖动');return list[at+1]?.id||null;}
 function clearHover(g){g.hoverId='';g.hoverAt=0;g.nestReady=false;}
 function start(g,t){g.sourceStamp=stamp(t);g.branchIds=new Set(C.descendants(db,t.id).map(t=>t.id));g.marker=document.createElement('div');g.marker.className='task-drop-line';g.marker.hidden=true;g.marker.setAttribute('aria-hidden','true');document.body.append(g.marker);g.ghost.querySelector('small').textContent=g.branchIds.size>1?'移动整个分支 · '+g.branchIds.size+' 项':'上下拖动排序';}
 function line(g,left,top,width){Object.assign(g.marker.style,{left:left+'px',top:top+'px',width:Math.max(16,width)+'px'});g.marker.hidden=false;}
 function preview(g){
  g.drop=null;g.marker.hidden=true;
  document.querySelectorAll('.drop-target,.drop-inside,.drop-nest-wait').forEach(el=>el.classList.remove('drop-target','drop-inside','drop-nest-wait'));
  const el=document.elementFromPoint(g.x,g.y),quad=el?.closest('#main .quadrant'),x=C.tree(db),source=x.nodes.get(g.id);
  if(!source||stamp(source)!==g.sourceStamp){clearHover(g);g.hint.textContent='事项已在其他位置修改，松手取消后重试';return;}
  if(!g.moved){g.hint.textContent='上下拖动调整次序 · 右侧停留可放入子任务';return;}
  if(!quad){clearHover(g);g.hint.textContent='移回列表继续；在区域外松手取消';return;}
  const q=Number(quad.dataset.quadrant),originalParent=x.parents.get(g.id)||'',sourceQ=C.effective(db,source).quadrant;
  let row=el.closest('.task-row'),drop,markerRow=row;
  if(row&&g.branchIds.has(row.dataset.taskId)){
   clearHover(g);g.hint.textContent=row.dataset.taskId===g.id?'当前位置 · 继续上下拖动':'不能移入自己的子任务';return;
  }
  if(row){
   const target=x.nodes.get(row.dataset.taskId),rect=row.getBoundingClientRect();
   if(!target||x.deleted.get(target.id)){clearHover(g);return;}
   const nestZone=live(x,target.id)&&g.x>rect.left+rect.width*.72&&g.y>rect.top+rect.height*.22&&g.y<rect.bottom-rect.height*.22;
   if(nestZone){
    if(g.hoverId!==target.id||Math.hypot(g.x-g.hoverX,g.y-g.hoverY)>10){g.hoverId=target.id;g.hoverAt=performance.now();g.hoverX=g.x;g.hoverY=g.y;g.nestReady=false;}
    const ready=performance.now()-g.hoverAt>=NEST_MS;
    row.classList.add(ready?'drop-inside':'drop-nest-wait');
    if(ready&&!g.nestReady){try{if(native&&Native.haptic)Native.haptic('tick');else navigator.vibrate?.(12);}catch{}g.nestReady=true;}
    if(ready)drop={q,parentId:target.id,targetId:target.id,position:'inside'};
    else {g.hint.textContent='稍停：放入“'+target.title+'”的子任务；上下移动可排序';return;}
   }else clearHover(g);
   if(!drop)drop={q,parentId:x.parents.get(target.id)||'',targetId:target.id,position:g.y<rect.top+rect.height/2?'before':'after'};
  }else{
   clearHover(g);
   // Within a branch's add row, preserve that parent; rails/header always mean root level.
   const add=el.closest('[data-tree-parent]'),list=quad.querySelector('.quad-list'),rect=list?.getBoundingClientRect(),inList=rect&&g.y>=rect.top&&g.y<=rect.bottom;
   let parentId='';
   if(add)parentId=add.dataset.treeParent;
   else if(inList&&q===sourceQ){const branch=typeof treeBranch==='string'&&x.nodes.get(treeBranch);parentId=branch&&C.effective(db,branch).quadrant===q?branch.id:originalParent;}
   if(parentId&&g.branchIds.has(parentId)){g.hint.textContent='不能移入自己的子任务';return;}
   if(parentId&&!live(x,parentId)){g.hint.textContent='目标分支已不可用';return;}
   const rows=visibleRows(quad).filter(r=>!g.branchIds.has(r.dataset.taskId)&&(x.parents.get(r.dataset.taskId)||'')===parentId);
   const first=rows[0],last=rows.at(-1),atTop=!inList||first&&g.y<first.getBoundingClientRect().top;
   const target=atTop?first:last;
   drop={q,parentId,targetId:target?.dataset.taskId||'',position:target?(atTop?'before':'after'):'end'};markerRow=target;
   if(!target&&inList)line(g,rect.left+12,Math.max(rect.top+5,Math.min(rect.bottom-5,g.y)),rect.width-24);
  }
  if(drop.parentId&&(!live(x,drop.parentId)||g.branchIds.has(drop.parentId))){g.hint.textContent='不能放入已完成或自己的任务分支';return;}
  const sameParent=drop.parentId===originalParent;
  const parentTitle=drop.parentId?x.nodes.get(drop.parentId).title:'';
  const moveText=drop.position==='inside'?'松手放入“'+parentTitle+'”的子任务':sameParent&&q===sourceQ?'松手调整'+(parentTitle?'“'+parentTitle+'”内的':'')+'次序':parentTitle?'松手移到“'+parentTitle+'”下':originalParent?'松手提升为主任务 · '+Q[q].replace('-',' · '):'松手移到：'+Q[q].replace('-',' · ');
  g.hint.textContent=moveText+(g.branchIds.size>1?'（带上子任务）':'');quad.classList.add('drop-target');
  if(markerRow&&drop.position!=='inside'){
   const rect=markerRow.getBoundingClientRect(),clip=quad.querySelector('.quad-list').getBoundingClientRect();let y=rect.top;
   if(drop.position==='after'){
    const ids=new Set(C.descendants(db,drop.targetId).map(t=>t.id));y=Math.max(rect.bottom,...visibleRows(quad).filter(r=>ids.has(r.dataset.taskId)).map(r=>r.getBoundingClientRect().bottom));
   }
   line(g,rect.left+4,Math.max(clip.top+2,Math.min(clip.bottom-3,y)),rect.width-8);
  }
  g.drop=drop;
 }
 function cleanup(g){g.marker?.remove();document.querySelectorAll('.drop-inside,.drop-nest-wait').forEach(el=>el.classList.remove('drop-inside','drop-nest-wait'));}
 function commit(g){
  const drop=g.drop,source=treeTask(g.id);if(!drop||!source||stamp(source)!==g.sourceStamp)return;
  const focus=matrixFocus,branch=treeBranch,originalParent=C.tree(db).parents.get(g.id)||'',oldQ=C.effective(db,source).quadrant;
  try{
   if(drop.targetId&&!C.tree(db).nodes.has(drop.targetId))throw Error('目标已变化，请重新拖动');
   const beforeId=getBefore(drop,g.id),message=drop.position==='inside'?'已放入子任务':drop.parentId!==originalParent?'任务分支已移动':oldQ!==drop.q?'已移动到其他象限':'已调整列表次序';
   // Tree transactions validate field-level undo and roll back a failed local save.
   const success=treeTransaction(message,()=>C.placeNode(db,g.id,{parentId:drop.parentId,quadrant:drop.q,beforeId}));
   if(!success)return;
   if(drop.parentId){C.ancestors(db,g.id).forEach(n=>treeExpanded.add(n.id));treeRemember();}
   if(focus>=0)matrixFocus=drop.q;
   if(treeBranch&&(g.branchIds.has(treeBranch)||oldQ!==drop.q))treeBranch='';
   if(C.ancestors(db,g.id).length>2)treeBranch=drop.parentId;
   render();
   // Preserve the previous quadrant/branch when this drag is undone.
   const undo=window.QGestures?.peekUndo?.();if(undo){const fn=undo.fn;undo.fn=()=>{const ok=fn();if(ok!==false){matrixFocus=focus;treeBranch=branch;render();}return ok;};}
   requestAnimationFrame(()=>{const row=[...document.querySelectorAll('#main .task-row')].find(r=>r.dataset.taskId===g.id);row?.scrollIntoView({block:'nearest'});row?.classList.add('tree-highlight');});
  }catch(e){toast(e.message);}
 }
 window.QDrag={start,preview,cleanup,commit};
})();
