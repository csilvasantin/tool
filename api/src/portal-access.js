import {ORIGINS,hash,random,statement,rows,text,passwordHash,jsonBody,rateLimit,response,fail} from './installer-portal.js';
const CLIENT='861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com';
import {ADMIN,superuser,bindSuperuser} from './portal-roles.js';
import {googlePortal,finishGoogleSignup} from './portal-google.js';
import {googleRedirect} from './portal-google-redirect.js';
export {ADMIN};
const GOOGLE_COOKIE='__Host-yk_portal_google',ADMIN_COOKIE='__Host-yk_portal_admin';
const cookie=(r,name)=>r.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';
const setCookie=(name,token,age)=>`${name}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
const table=kind=>kind==='installer'?'installer_accounts':'retailer_accounts';
const fetcher=env=>env.PORTAL_FETCH||fetch;
let keyCache={expires:0,keys:[]};
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export async function verifyGoogle(jwt,nonce,env){
 try{
  if(typeof jwt!=='string'||jwt.length>16384)return null;
  const parts=jwt.split('.');if(parts.length!==3)return null;
  const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))),p=JSON.parse(new TextDecoder().decode(decode(parts[1])));
  if(header.alg!=='RS256'||!header.kid)return null;
  const now=Date.now();let keys=keyCache.keys;
  if(env.PORTAL_FETCH||keyCache.expires<now||!keys.some(k=>k.kid===header.kid)){
   const r=await fetcher(env)('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(7000)});if(!r.ok)return null;
   keys=(await r.json()).keys||[];if(!env.PORTAL_FETCH)keyCache={keys,expires:now+300000};
  }
  const jwk=keys.find(k=>k.kid===header.kid);if(!jwk)return null;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))return null;
  if(!['https://accounts.google.com','accounts.google.com'].includes(p.iss)||p.aud!==CLIENT||p.email_verified!==true||!p.sub||p.nonce!==nonce)return null;
  if(!Number.isFinite(p.exp)||p.exp*1000<=now||!Number.isFinite(p.iat)||p.iat*1000>now+60000||p.iat*1000<now-7200000)return null;
  const email=String(p.email||'').toLowerCase();if(!email.endsWith('@gmail.com')&&!p.hd)return null;
  return {...p,email};
 }catch{return null;}
}
async function googleIdentity(request,env,b){
 const raw=cookie(request,GOOGLE_COOKIE);if(!raw)fail(401,'Vuelve a iniciar la verificación con Google.');
 const key=await hash(raw),challenge=await statement(env,'SELECT * FROM portal_google_challenges WHERE token_hash=? AND used=0 AND expires_at>?',key,Date.now()).first();
 if(!challenge)fail(401,'La verificación ha caducado. Vuelve a conectar con Google.');
 const p=await verifyGoogle(b.credential,challenge.nonce,env);if(!p)fail(401,'No se pudo verificar la identidad de Google.');
 const used=await statement(env,'UPDATE portal_google_challenges SET used=1 WHERE token_hash=? AND used=0 AND expires_at>?',key,Date.now()).run();if(!used.meta.changes)fail(401,'Verificación ya utilizada.');return p;
}
async function resetToken(env,kind,account){
 const token=random(),id=crypto.randomUUID(),now=Date.now();
 await statement(env,'INSERT INTO portal_password_resets VALUES(?,?,?,?,?,NULL,?)',id,kind,account.id,await hash(token),now+900000,now).run();return {token,id};
}
export async function finishReset(env,kind,token,password){
 const key=await hash(text(token,64,64)),p=text(password,12,128),now=Date.now();
 const reset=await statement(env,'SELECT * FROM portal_password_resets WHERE token_hash=? AND kind=? AND used_by IS NULL AND expires_at>?',key,kind,now).first();if(!reset)fail(400,'El enlace ha caducado o ya se ha utilizado. Solicita uno nuevo.');
 const salt=random(),digest=await passwordHash(p,salt),claim=crypto.randomUUID(),accountTable=table(kind),sessions=kind==='installer'?'installer_sessions':'retailer_sessions',ownerCol=kind==='installer'?'installer_id':'retailer_id';
 const owned='EXISTS(SELECT 1 FROM portal_password_resets WHERE id=? AND used_by=?)';
 const result=await env.DB.batch([
  statement(env,'UPDATE portal_password_resets SET used_by=? WHERE id=? AND used_by IS NULL AND expires_at>?',claim,reset.id,now),
  statement(env,`UPDATE ${accountTable} SET password_hash=?,salt=? WHERE id=? AND ${owned}`,digest,salt,reset.account_id,reset.id,claim),
  statement(env,`DELETE FROM ${sessions} WHERE ${ownerCol}=? AND ${owned}`,reset.account_id,reset.id,claim),
  statement(env,`UPDATE portal_mcp_tokens SET revoked_at=? WHERE kind=? AND account_id=? AND ${owned}`,now,kind,reset.account_id,reset.id,claim),
  statement(env,`UPDATE portal_password_resets SET used_by=? WHERE kind=? AND account_id=? AND used_by IS NULL AND ${owned}`,claim,kind,reset.account_id,reset.id,claim)
 ]);if(!result[0].meta.changes)fail(400,'Este enlace ya se ha utilizado.');return {ok:true,message:'Contraseña actualizada. Entra de nuevo; se han cerrado las sesiones y revocado los tokens de agentes.'};
}
export async function loginGoogleIdentity(request,env,p,b={kind:'retailer',intent:'login'},adminOnly=false){
 const role=await bindSuperuser(env,p);
   if(role){
    const token=random(),created=await statement(env,'INSERT INTO portal_admin_sessions SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM portal_superusers WHERE email=? AND google_sub=? AND revoked_at IS NULL)',await hash(token),p.email,p.sub,Date.now()+3600000,p.email,p.sub).run();
    if(!created.meta.changes)fail(403,'La autorización ha cambiado.');
    return response(request,{ok:true,email:p.email,role:'superuser',redirect:'/superusuario'},200,setCookie(ADMIN_COOKIE,token,3600));
   }
   if(adminOnly)fail(403,'Esta cuenta no tiene acceso de superusuario.');
   return await googlePortal(request,env,b,p);
}
export async function handleAccess(request,env){
 const path=new URL(request.url).pathname.slice('/api/portal-access'.length);
 try{
  if(request.method==='OPTIONS')return response(request,{});
  if(['/google/redirect-challenge','/google/redirect-callback','/google/redirect-complete'].includes(path))return googleRedirect(request,env,{client:CLIENT,verifyGoogle,login:loginGoogleIdentity});
  if(request.method==='GET'&&path==='/config')return response(request,{google_client_id:CLIENT,email_recovery:!!(env.RESEND_API_KEY&&env.PORTAL_MAIL_FROM),superuser_email:ADMIN});
  if(request.method!=='POST'||!ORIGINS.has(request.headers.get('origin')))fail(403,'Origen no permitido.');
  await rateLimit(env,'portal-access-ip:'+(request.headers.get('CF-Connecting-IP')||'local'),30,900000);
  const b=await jsonBody(request);
  if(path==='/google/challenge'){
   const token=random(),nonce=random();await statement(env,'INSERT INTO portal_google_challenges VALUES(?,?,?,0)',await hash(token),nonce,Date.now()+300000).run();
   return response(request,{nonce,google_client_id:CLIENT},200,setCookie(GOOGLE_COOKIE,token,300));
  }
  if(path==='/google/admin'||path==='/google/login'){
   if(path==='/google/login'&&!['installer','retailer'].includes(b.kind))fail(400,'Selecciona tu portal.');
   return await loginGoogleIdentity(request,env,await googleIdentity(request,env,b),b,path==='/google/admin');
  }
  const kind=b.kind;if(!['installer','retailer'].includes(kind))fail(400,'Selecciona tu portal.');
  if(path==='/google/register')return await finishGoogleSignup(request,env,b);
  if(path==='/password/complete')return response(request,await finishReset(env,kind,b.token,b.password));
  if(path==='/google/recover'){
   const p=await googleIdentity(request,env,b),account=await statement(env,`SELECT id FROM ${table(kind)} WHERE email=?`,p.email).first();
   if(!account)fail(404,'No hay una cuenta en este portal para el correo verificado por Google.');
   const reset=await resetToken(env,kind,account);return response(request,{ok:true,token:reset.token,email:p.email});
  }
  if(path==='/password/request'){
   const email=text(b.email,3,254).toLowerCase();await rateLimit(env,'portal-reset-email:'+kind+':'+await hash(email),3,3600000);
   if(!env.RESEND_API_KEY||!env.PORTAL_MAIL_FROM)fail(503,'El envío de recuperación por correo aún no está disponible. Puedes verificar tu cuenta con Google.');
   const account=await statement(env,`SELECT id FROM ${table(kind)} WHERE email=?`,email).first();
   if(account){
    const reset=await resetToken(env,kind,account),url='https://www.yokup.com/recuperar?portal='+kind+'#token='+reset.token;
    try{
     const r=await fetcher(env)('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':reset.id},body:JSON.stringify({from:env.PORTAL_MAIL_FROM,to:[email],subject:'Recupera tu contraseña de Yokup',text:`Usa este enlace en los próximos 15 minutos para elegir una nueva contraseña de tu portal ${kind==='installer'?'del instalador':'del comercio'}:\n${url}\nSi no has pedido este cambio, ignora este correo. Nunca compartas el enlace.`}),signal:AbortSignal.timeout(10000)});
     if(!r.ok)throw Error('mail unavailable');
    }catch{await statement(env,'DELETE FROM portal_password_resets WHERE id=?',reset.id).run();console.error('portal_recovery_delivery_failed');}
   }
   return response(request,{ok:true,message:'Si existe una cuenta con ese correo, recibirás un enlace de recuperación. Revisa también el correo no deseado.'});
  }
  fail(404,'Ruta no encontrada.');
 }catch(e){return response(request,{error:e.status?e.message:'No se pudo completar la operación.'},e.status||500);}
}
export async function adminIdentity(request,env){
 const t=cookie(request,ADMIN_COOKIE);if(!t)fail(401,'Accede con Google como superusuario.');
 const row=await statement(env,'SELECT email,google_sub FROM portal_admin_sessions WHERE token_hash=? AND expires_at>?',await hash(t),Date.now()).first();const role=row?await superuser(env,row.email):null;if(!role||(role.google_sub&&role.google_sub!==row.google_sub))fail(401,'La sesión de superusuario ha caducado.');return row;
}
export async function adminLogout(request,env){await statement(env,'DELETE FROM portal_admin_sessions WHERE token_hash=?',await hash(cookie(request,ADMIN_COOKIE))).run();return response(request,{ok:true},200,setCookie(ADMIN_COOKIE,'',0));}
export async function sweepPortalAccess(env){
 const now=Date.now();await env.DB.batch([
  statement(env,'DELETE FROM portal_google_redirects WHERE expires_at<?',now-3600000),
  statement(env,'DELETE FROM portal_google_challenges WHERE expires_at<?',now-3600000),
  statement(env,'DELETE FROM portal_google_signup WHERE expires_at<?',now-3600000),
  statement(env,'DELETE FROM portal_admin_sessions WHERE expires_at<?',now),
  statement(env,'DELETE FROM portal_password_resets WHERE expires_at<?',now-86400000)
 ]);
}
