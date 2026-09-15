import {handleCalls,callsActor} from './calls.js';
const str={type:'string'},object=properties=>({type:'object',properties,additionalProperties:false});
export const CALL_TOOLS=[
 {name:'calls_list',description:'Cola de llamadas autorizada para esta cuenta.',inputSchema:object({}),method:'GET',path:()=>'/cases'},
 {name:'calls_case',description:'Expediente, contactos, agenda, candidatos e historial autorizados.',inputSchema:{...object({case_id:str}),required:['case_id']},method:'GET',path:a=>'/cases/'+encodeURIComponent(a.case_id)},
 {name:'calls_reserve',description:'Reserva exclusiva para una persona. Telefonía IA no activada.',inputSchema:{...object({job_id:str}),required:['job_id']},method:'POST',path:a=>'/jobs/'+encodeURIComponent(a.job_id)+'/claim',body:()=>({mode:'human'})},
 {name:'calls_release',description:'Libera tu reserva si no hay una llamada activa.',inputSchema:{...object({job_id:str}),required:['job_id']},method:'POST',path:a=>'/jobs/'+encodeURIComponent(a.job_id)+'/release',body:()=>({})},
 {name:'calls_finish',description:'Registra el resultado de tu intento activo; no confirma una cita.',inputSchema:{...object({job_id:str,outcome:{type:'string',enum:['availability','agreed','declined','no_answer','busy','voicemail','human_handoff','other']},notes:str,availability:str,retry_at:{type:'number'}}),required:['job_id','outcome','notes']},method:'POST',path:a=>'/jobs/'+encodeURIComponent(a.job_id)+'/finish',body:({job_id,...b})=>b}
];
export async function handleCallsMcp(request,env){
 const reply=(id,result)=>Response.json({jsonrpc:'2.0',id,result},{headers:{'Cache-Control':'no-store'}}),error=(id,code,message)=>Response.json({jsonrpc:'2.0',id,error:{code,message}},{headers:{'Cache-Control':'no-store'}});
 if(request.method==='GET')return Response.json({name:'Yokup Calls',endpoint:'https://data.yokup.com/mcp/calls',authentication:'Bearer ykcall token from authenticated /llamadas; seven days; current account permissions checked on every call',tools:CALL_TOOLS.map(({name,description,inputSchema})=>({name,description,inputSchema}))});
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 let b;try{const raw=await request.text();if(raw.length>16384)return error(null,-32600,'Request too large');b=JSON.parse(raw);}catch{return error(null,-32700,'Parse error');}
 if(b.method==='notifications/initialized')return new Response(null,{status:202});
 if(b.method==='initialize')return reply(b.id,{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'yokup-calls',version:'1.0.0'},instructions:'Human calls and free browser pilot. Telephone AI is not configured. Tools never imply a call took place or a date was accepted.'});
 if(b.method==='tools/list')return reply(b.id,{tools:CALL_TOOLS.map(({name,description,inputSchema,method})=>({name,description,inputSchema,annotations:{readOnlyHint:method==='GET',destructiveHint:false}}))});
 if(b.method!=='tools/call')return error(b.id,-32601,'Method not found');
 const t=CALL_TOOLS.find(t=>t.name===b.params?.name),a=b.params?.arguments||{};if(!t)return error(b.id,-32602,'Unknown tool');
 if(typeof a!=='object'||Array.isArray(a)||Object.entries(a).some(([k,v])=>!t.inputSchema.properties[k]||typeof v!==t.inputSchema.properties[k].type)||(t.inputSchema.required||[]).some(k=>a[k]===undefined))return error(b.id,-32602,'Invalid arguments');
 if(!/^Bearer ykcall_[a-f0-9]{64}$/.test(request.headers.get('authorization')||''))return error(b.id,-32001,'Bearer token required');
 try{await callsActor(request,env);}catch{return error(b.id,-32001,'Authentication required');}
 const r=await handleCalls(new Request('https://data.yokup.com/api/calls'+t.path(a),{method:t.method,headers:{Authorization:request.headers.get('authorization')||'','Content-Type':'application/json',Origin:'https://www.yokup.com'},body:t.method==='POST'?JSON.stringify(t.body(a)):undefined}),env);const d=await r.json();return reply(b.id,{content:[{type:'text',text:JSON.stringify(d)}],isError:!r.ok});
}
