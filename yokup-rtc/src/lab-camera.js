// Private, read-only Lab camera. The existing Mac producer owns capture/PTZ.
const owners=new Set(['csilvasantin@gmail.com','csilva@admira.com']);
const origins=new Set(['https://www.admira.app','https://admira.app']);
export async function handleLabCamera(req,env,{requireAuth,fetcher=fetch}) {
 const headers={'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
 const origin=req.headers.get('origin');
 if(origins.has(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Credentials']='true';headers.Vary='Origin';}
 const error=(code,status)=>Response.json({error:code},{status,headers});
 if(origin&&!origins.has(origin))return error('origin_not_allowed',403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS'}});
 if(req.method!=='GET')return error('method_not_allowed',405);
 const session=await requireAuth(env,req);
 if(!session?.email)return error('unauthorized',401);
 if(!owners.has(session.email.toLowerCase())&&!(session.email==='agentes@silicio.admiranext.com'&&!session.conversation_device))return error('lab_owner_required',403);
 if(session.conversation_device&&!['Admirito iOS','Admirito Android'].includes(session.conversation_device_label))return error('lab_device_scope_required',403);
 let source;try{source=new URL(env.LAB_INSTA360_FRAME_URL);}catch{return error('camera_not_configured',503);}
 if(source.origin!=='https://macmini.tail48b61c.ts.net'||!/^\/webcam\/[^/]+\/foto\.jpg$/.test(source.pathname)||source.search||source.hash)return error('camera_not_configured',503);
 try {
  const upstream=await fetcher(source.href,{redirect:'error',headers:{'User-Agent':'Mozilla/5.0 Admirito private Lab viewer'},signal:AbortSignal.timeout(15000)});
  if(!upstream.ok||!(upstream.headers.get('content-type')||'').startsWith('image/jpeg'))return error('camera_unavailable',503);
  const frame=await upstream.arrayBuffer();
  if(frame.byteLength<4||frame.byteLength>8*1024*1024||new Uint8Array(frame)[0]!==255||new Uint8Array(frame)[1]!==216)return error('camera_unavailable',503);
  return new Response(frame,{headers:{...headers,'Content-Type':'image/jpeg','X-Camera-Source':'macmini-insta360','X-Frame-Received-At':String(Date.now())}});
 }catch{return error('camera_unavailable',503);}
}
