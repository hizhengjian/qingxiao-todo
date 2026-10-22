import {env} from "cloudflare:workers";
export const dynamic="force-dynamic";
const json=(o:unknown,status=200)=>Response.json(o,{status,headers:{"Cache-Control":"no-store"}});
// Shared personal dataset, protected by the owner-private Sites dispatch gate.
// Native service calls have no visitor identity; never publish this app publicly.
async function snapshot(){return (await env.DB!.prepare("SELECT id,kind,payload,rev FROM records ORDER BY updated_at,id").all()).results.map((r:any)=>({id:r.id,kind:r.kind,data:JSON.parse(r.payload),rev:r.rev}));}
export async function GET(){try{return json({records:await snapshot(),serverTime:Date.now()});}catch{return json({error:"读取同步数据失败"},503);}}
export async function POST(req:Request){
 try{
  const origin=req.headers.get("origin");if(origin&&origin!==new URL(req.url).origin)return json({error:"来源不允许"},403);
  if(!req.headers.get("content-type")?.startsWith("application/json"))return json({error:"需要JSON"},415);
  const body=await req.text();if(body.length>2000000)return json({error:"同步批次过大"},413);const input=JSON.parse(body);
  if(!Array.isArray(input.changes)||input.changes.length>100)return json({error:"同步批次格式错误"},400);
  const acknowledgements=[];
  for(const ch of input.changes){
   if(typeof ch.id!=="string"||ch.id.length>160||!ch.id||typeof ch.opId!=="string"||ch.opId.length>160||!ch.opId||!Number.isSafeInteger(ch.baseRev)||ch.baseRev<0||!["item","session","catalog","preference"].includes(ch.kind)||!ch.data||typeof ch.data!=="object"||ch.data.id!==ch.id)throw Error("记录无效");
   const payload=JSON.stringify(ch.data);if(payload.length>200000)throw Error("单条记录太大");
   const seen=await env.DB!.prepare("SELECT accepted,rev,record_id FROM receipts WHERE op_id=?").bind(ch.opId).first();
   if(seen&&seen.record_id!==ch.id)throw Error("操作编号不匹配");
   if(seen){acknowledgements.push({id:ch.id,opId:ch.opId,...seen});continue;}
   const now=Date.now();
   await env.DB!.batch([
    env.DB!.prepare("INSERT INTO records(id,kind,payload,rev,last_op,updated_at) SELECT ?,?,?,1,?,? WHERE ?=0 AND NOT EXISTS(SELECT 1 FROM receipts WHERE op_id=?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,rev=records.rev+1,last_op=excluded.last_op,updated_at=excluded.updated_at WHERE records.rev=? AND records.kind=excluded.kind")
     .bind(ch.id,ch.kind,payload,ch.opId,now,ch.baseRev,ch.opId,ch.baseRev),
    // Existing rows with baseRev > 0 use a conditional update in the same transaction.
    env.DB!.prepare("UPDATE records SET payload=?,rev=rev+1,last_op=?,updated_at=? WHERE id=? AND kind=? AND rev=? AND ?>0 AND last_op<>? AND NOT EXISTS(SELECT 1 FROM receipts WHERE op_id=?)")
     .bind(payload,ch.opId,now,ch.id,ch.kind,ch.baseRev,ch.baseRev,ch.opId,ch.opId),
    env.DB!.prepare("INSERT OR IGNORE INTO receipts(op_id,record_id,accepted,rev,created_at) SELECT ?,?,CASE WHEN last_op=? THEN 1 ELSE 0 END,rev,? FROM records WHERE id=?")
     .bind(ch.opId,ch.id,ch.opId,now,ch.id)
   ]);
   const receipt=await env.DB!.prepare("SELECT accepted,rev,record_id FROM receipts WHERE op_id=?").bind(ch.opId).first();
   acknowledgements.push({id:ch.id,opId:ch.opId,accepted:0,rev:0,...receipt});
  }
  return json({acknowledgements,records:await snapshot(),serverTime:Date.now()});
 }catch(e){return json({error:e instanceof Error?e.message:"同步失败"},400);}
}
