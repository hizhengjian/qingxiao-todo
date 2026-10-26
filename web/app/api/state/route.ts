import {env} from "cloudflare:workers";
// Shared migration/ID algorithm is also used by the web and Android WebView.
import "../../../public/core.js";
const C=(globalThis as any).QCore;
export const dynamic="force-dynamic";
const json=(o:unknown,status=200)=>Response.json(o,{status,headers:{"Cache-Control":"no-store"}});
// Shared personal dataset, protected by the owner-private Sites dispatch gate.
// Native service calls have no visitor identity; never publish this app publicly.
async function upgrade(){
 await env.DB!.prepare("CREATE TABLE IF NOT EXISTS tree_migration_backup (id TEXT PRIMARY KEY, payload TEXT NOT NULL, rev INTEGER NOT NULL, saved_at INTEGER NOT NULL)").run();
 const rows=(await env.DB!.prepare("SELECT id,payload,rev FROM records WHERE kind='item' AND COALESCE(json_extract(payload,'$.treeVersion'),0)<3").all()).results;
 for(const row of rows){const original=JSON.parse(String(row.payload));const migrated=C.normalize({format:'qingxiao-todo',version:2,items:[{...original,_rev:row.rev}],sessions:[],catalogs:[],preferences:[]}).items;
  const statements=[env.DB!.prepare("INSERT OR IGNORE INTO tree_migration_backup(id,payload,rev,saved_at) VALUES(?,?,?,?)").bind(row.id,row.payload,row.rev,Date.now())];
  for(const node of migrated.slice(1)){delete node._rev;delete node._dirty;delete node._op;statements.push(env.DB!.prepare("INSERT OR IGNORE INTO records(id,kind,payload,rev,last_op,updated_at) SELECT ?,'item',?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND rev=? AND COALESCE(json_extract(payload,'$.treeVersion'),0)<3)").bind(node.id,JSON.stringify(node),row.rev,'migration:'+node.id,Date.now(),row.id,row.rev));}
  const root=migrated[0];delete root._rev;delete root._dirty;delete root._op;
  statements.push(env.DB!.prepare("UPDATE records SET payload=? WHERE id=? AND rev=? AND COALESCE(json_extract(payload,'$.treeVersion'),0)<3").bind(JSON.stringify(root),row.id,row.rev));
  for(let i=0;i<statements.length;i+=80)await env.DB!.batch(statements.slice(i,i+80));
 }
}
async function snapshot(){return (await env.DB!.prepare("SELECT id,kind,payload,rev FROM records ORDER BY updated_at,id").all()).results.map((r:any)=>({id:r.id,kind:r.kind,data:JSON.parse(r.payload),rev:r.rev}));}
export async function GET(){try{await upgrade();return json({schemaVersion:3,records:await snapshot(),serverTime:Date.now()});}catch{return json({error:"读取同步数据失败"},503);}}
export async function POST(req:Request){
 try{
  const origin=req.headers.get("origin");if(origin&&origin!==new URL(req.url).origin)return json({error:"来源不允许"},403);
  if(!req.headers.get("content-type")?.startsWith("application/json"))return json({error:"需要JSON"},415);
  const body=await req.text();if(body.length>2000000)return json({error:"同步批次过大"},413);const input=JSON.parse(body);
  if(input.schemaVersion!==3)return json({error:"任务结构已升级，请更新到轻效 Todo 2.5 或刷新网页后同步"},426);
  await upgrade();
  if(!Array.isArray(input.changes)||input.changes.length>100)return json({error:"同步批次格式错误"},400);
  const acknowledgements=[];
  for(const ch of input.changes){
   if(typeof ch.id!=="string"||ch.id.length>160||!ch.id||typeof ch.opId!=="string"||ch.opId.length>160||!ch.opId||!Number.isSafeInteger(ch.baseRev)||ch.baseRev<0||!["item","session","catalog","preference","progress"].includes(ch.kind)||!ch.data||typeof ch.data!=="object"||ch.data.id!==ch.id)throw Error("记录无效");
   if(ch.kind==='item'){if((ch.data.subtasks||[]).length)throw Error("请升级任务结构后同步");ch.data.treeVersion=3;ch.data.parentId??='';C.validate({items:[ch.data],sessions:[],catalogs:[],preferences:[]});if(ch.data.parentId===ch.id)throw Error("事项不能是自己的父任务");}
   if(ch.kind==='progress')C.validate({items:[],sessions:[],catalogs:[],preferences:[],progress:[ch.data]});
   const migratedCreation=ch.kind==='item'&&typeof ch.data.legacyParentId==='string'&&typeof ch.data.legacySubtaskId==='string'&&C.childId(ch.data.legacyParentId,ch.data.legacySubtaskId)===ch.id;
   const payload=JSON.stringify(ch.data);if(payload.length>200000)throw Error("单条记录太大");
   const seen=await env.DB!.prepare("SELECT accepted,rev,record_id FROM receipts WHERE op_id=?").bind(ch.opId).first();
   if(seen&&seen.record_id!==ch.id)throw Error("操作编号不匹配");
   if(seen){acknowledgements.push({id:ch.id,opId:ch.opId,...seen});continue;}
   const now=Date.now();
   await env.DB!.batch([
    env.DB!.prepare("INSERT INTO records(id,kind,payload,rev,last_op,updated_at) SELECT ?,?,?,?,?,? WHERE (?=0 OR ?=1) AND NOT EXISTS(SELECT 1 FROM receipts WHERE op_id=?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,rev=records.rev+1,last_op=excluded.last_op,updated_at=excluded.updated_at WHERE records.rev=? AND records.kind=excluded.kind")
     .bind(ch.id,ch.kind,payload,migratedCreation?ch.baseRev+1:1,ch.opId,now,ch.baseRev,migratedCreation?1:0,ch.opId,ch.baseRev),
    // Existing rows with baseRev > 0 use a conditional update in the same transaction.
    env.DB!.prepare("UPDATE records SET payload=?,rev=rev+1,last_op=?,updated_at=? WHERE id=? AND kind=? AND rev=? AND ?>0 AND last_op<>? AND NOT EXISTS(SELECT 1 FROM receipts WHERE op_id=?)")
     .bind(payload,ch.opId,now,ch.id,ch.kind,ch.baseRev,ch.baseRev,ch.opId,ch.opId),
    env.DB!.prepare("INSERT OR IGNORE INTO receipts(op_id,record_id,accepted,rev,created_at) SELECT ?,?,CASE WHEN last_op=? THEN 1 ELSE 0 END,rev,? FROM records WHERE id=?")
     .bind(ch.opId,ch.id,ch.opId,now,ch.id)
   ]);
   const receipt=await env.DB!.prepare("SELECT accepted,rev,record_id FROM receipts WHERE op_id=?").bind(ch.opId).first();
   acknowledgements.push({id:ch.id,opId:ch.opId,accepted:0,rev:0,...receipt});
  }
  return json({schemaVersion:3,acknowledgements,records:await snapshot(),serverTime:Date.now()});
 }catch(e){return json({error:e instanceof Error?e.message:"同步失败"},400);}
}
