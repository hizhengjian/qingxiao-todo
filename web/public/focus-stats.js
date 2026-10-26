/* Calendar aggregation shared by the browser and packaged Android client. */
(function(root){
  const C=root.QCore;
  const midnight=t=>C.dayStart(t), next=t=>C.nextDay(t);
  function range(mode,at){
    const d=new Date(at);let start=midnight(at),end=next(start);
    if(mode==='week'){start=C.nextDay(start,-((d.getDay()+6)%7));end=C.nextDay(start,7);}
    if(mode==='month'){start=+new Date(d.getFullYear(),d.getMonth(),1);end=+new Date(d.getFullYear(),d.getMonth()+1,1);}
    if(mode==='year'){start=+new Date(d.getFullYear(),0,1);end=+new Date(d.getFullYear()+1,0,1);}
    return {start,end};
  }
  function move(mode,at,step){
    const d=new Date(at);
    if(mode==='day'||mode==='week')return C.nextDay(at,step*(mode==='week'?7:1));
    let y=d.getFullYear(),m=d.getMonth();if(mode==='year')y+=step;else m+=step;
    return +new Date(y,m,Math.min(d.getDate(),new Date(y,m+1,0).getDate()));
  }
  function liveSession(t,now){
    if(!t)return null;
    const segments=(t.segments||[]).map(p=>({...p}));
    if(t.state==='running'){const endAt=Math.min(now,t.endAt);if(endAt>t.segmentStartedAt)segments.push({startAt:t.segmentStartedAt,endAt});}
    return {...t,id:'session:'+t.id,status:'live',startAt:t.startedAt,endAt:segments.at(-1)?.endAt||t.startedAt,segments,deleted:false};
  }
  function report(sessions,mode,at){
    const {start,end}=range(mode,at),map=new Map();
    for(let day=start;day<end;day=next(day))map.set(C.dateKey(day),{day,completed:0,focus:0,recorded:0,parts:[],focusParts:[]});
    const live=sessions.filter(s=>!s.deleted);
    for(const s of live){
      if(s.mode==='focus'&&s.status==='completed'&&s.endAt>=start&&s.endAt<end)map.get(C.dateKey(s.endAt)).completed++;
      for(const p of C.slices(s,start,end))for(let day=midnight(p.startAt);day<p.endAt;day=next(day)){
        const bucket=map.get(C.dateKey(day));if(!bucket)continue;
        const piece={startAt:Math.max(day,p.startAt),endAt:Math.min(next(day),p.endAt)};
        bucket.parts.push(piece);if(s.mode==='focus')bucket.focusParts.push(piece);
      }
    }
    const daily=[...map.values()].map(d=>({day:d.day,completed:d.completed,focus:C.unionDuration(d.focusParts),recorded:C.unionDuration(d.parts)}));
    return {start,end,daily,...C.stats(live,start,end),activeDays:daily.filter(d=>d.focus>0).length};
  }
  root.FocusStats={range,move,liveSession,report};
  if(typeof module==='object'&&module.exports)module.exports=root.FocusStats;
})(typeof globalThis==='object'?globalThis:this);
