// «Ver como»: abrir el portal de una cuenta de marca (FLT-101292). Seguridad primero:
// - Superusuario (sesión Google de /superusuario, portal_superusers): cualquier cuenta de marca.
// - Miembro (retailer_account_members): solo con un correo VERIFICADO — el de una cuenta de
//   comercio vinculada a Google, o el de una sesión delegada que ya lo verificó. Un correo dado
//   de alta con contraseña no acredita nada: cualquiera podría registrarlo.
// - La sesión delegada lleva actor (quién) y se revalida en cada petición: revocar al miembro o
//   al superusuario la corta. viewer = solo lectura. Sin tokens MCP desde una sesión delegada.
// - Cada cambio (permitido o denegado) queda auditado en retailer_access_audit.
import {statement,rows,text,fail,response,jsonBody,rateLimit,random,hash} from './installer-portal.js';
import {adminIdentity} from './portal-access.js';
async function identities(request,env,authenticated){
 let session=null,admin=null;
 try{session=await authenticated(request,env);}catch(e){if(e.status!==401)throw e;}
 try{admin=await adminIdentity(request,env);}catch(e){if(e.status!==401)throw e;}
 if(!session&&!admin)fail(401,'Entra en tu cuenta de comercio.');
 const d=session?.access?.delegated?session.access:null,origin=d?d.origin_retailer_id:session?.id||null;
 let member=d?.actor_kind==='member'?d.actor_email:null;
 if(session&&!d&&await statement(env,"SELECT 1 AS ok FROM portal_google_identities WHERE kind='retailer' AND account_id=?",session.id).first())member=String(session.email).toLowerCase();
 const superEmail=admin?.email||(d?.actor_kind==='superuser'?d.actor_email:null);
 const list=[],add=a=>{if(!list.some(x=>x.id===a.id))list.push(a);};
 if(origin){const o=await statement(env,'SELECT id,name FROM retailer_accounts WHERE id=?',origin).first();if(o)add({id:o.id,name:o.name,role:'owner',own:true,brand_key:null});}
 if(member)for(const m of await rows(env,'SELECT r.id,r.name,m.role,b.brand_key FROM retailer_account_members m JOIN retailer_accounts r ON r.id=m.retailer_id LEFT JOIN brand_accounts b ON b.retailer_id=r.id WHERE m.email=? AND m.revoked_at IS NULL ORDER BY r.name',member))add({id:m.id,name:m.name,role:m.role,own:false,brand_key:m.brand_key});
 if(superEmail)for(const b of await rows(env,'SELECT r.id,r.name,b.brand_key FROM brand_accounts b JOIN retailer_accounts r ON r.id=b.retailer_id ORDER BY r.name'))add({id:b.id,name:b.name,role:'superuser',own:false,brand_key:b.brand_key});
 return {session,d,origin,member,superEmail,list};
}
const audit=(env,who,action,from,to,outcome)=>statement(env,'INSERT INTO retailer_access_audit VALUES(?,?,?,?,?,?,?,?)',crypto.randomUUID(),who.email||'anonymous',who.kind,action,from||null,to||null,outcome,Date.now()).run();
export async function retailerAccess(request,env,path,{authenticated,createSession,cookieToken,cookieName}){
 const who=await identities(request,env,authenticated),current=who.session?{id:who.session.id,name:who.session.name,role:who.session.access.role,delegated:!!who.d,actor_email:who.d?.actor_email||null}:null;
 if(path==='/accounts'&&request.method==='GET')return response(request,{current,accounts:who.list.map(({own,...a})=>({...a,kind:own?'own':a.brand_key?'brand':'shared',current:a.id===current?.id})),superuser:!!who.superEmail});
 if(path!=='/switch'||request.method!=='POST')fail(404,'Ruta no encontrada.');
 const b=await jsonBody(request),target=text(b.retailer_id,1,80),actor={email:who.member||who.superEmail||who.session?.email,kind:who.member?'member':who.superEmail?'superuser':'retailer'};
 await rateLimit(env,'retail-switch:'+(actor.email||who.origin),30,900000);
 const found=who.list.find(a=>a.id===target);
 if(!found){await audit(env,actor,'switch',current?.id,target,'denied');fail(403,'No tienes acceso a esa cuenta.');}
 if(current?.id===target)return response(request,{ok:true,unchanged:true,account:{id:found.id,name:found.name},role:current.role});
 let cookie;const by=found.role==='superuser'?{email:who.superEmail,kind:'superuser'}:{email:who.member,kind:'member'};
 if(found.own){const o=await statement(env,'SELECT * FROM retailer_accounts WHERE id=?',target).first();cookie=await createSession(env,o.id,o.password_hash);}
 else{
  const token=random(),key=await hash(token),now=Date.now(),ttl=by.kind==='superuser'?3600:28800;
  await env.DB.batch([statement(env,'INSERT INTO retailer_sessions SELECT ?,id,? FROM retailer_accounts WHERE id=?',key,now+ttl*1000,target),statement(env,'INSERT INTO retailer_session_actors VALUES(?,?,?,?,?)',key,by.email,by.kind,who.origin,now)]);
  cookie=`${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ttl}`;
 }
 const old=cookieToken(request);if(who.session&&old)await statement(env,'DELETE FROM retailer_sessions WHERE token_hash=?',await hash(old)).run();
 await audit(env,found.own?actor:by,'switch',current?.id,target,'allowed');
 return response(request,{ok:true,account:{id:found.id,name:found.name},role:found.role},200,cookie);
}
