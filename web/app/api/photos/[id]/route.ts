import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
const valid=(id:string)=>/^photo-[a-zA-Z0-9-]{10,80}$/.test(id);
// All photo routes inherit the same owner-private gate as the personal dataset.
export async function GET(req:Request,{params}: {params:Promise<{id:string}>}){
 const {id}=await params;if(!valid(id))return new Response('Invalid photo',{status:400});
 const file=await env.BUCKET!.get('photos/'+id);if(!file)return new Response('照片尚未上传',{status:404});
 return new Response(file.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
}
export async function PUT(req:Request,{params}: {params:Promise<{id:string}>}){
 const {id}=await params;const origin=req.headers.get('origin');
 if(origin&&origin!==new URL(req.url).origin)return new Response('Forbidden',{status:403});
 if(!valid(id)||req.headers.get('content-type')!=='image/jpeg')return new Response('需要JPEG照片',{status:400});
 const reader=req.body?.getReader();if(!reader)return new Response('照片为空',{status:400});
 let total=0;const chunks:Uint8Array[]=[];for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>1500000){await reader.cancel();return new Response('照片超过1.5MB',{status:413});}chunks.push(value);}
 const bytes=new Uint8Array(total);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
 if(total<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)return new Response('照片格式无效',{status:400});
 if(!await env.BUCKET!.head('photos/'+id))await env.BUCKET!.put('photos/'+id,bytes,{httpMetadata:{contentType:'image/jpeg'}});
 return Response.json({id,saved:true},{headers:{'Cache-Control':'no-store'}});
}
