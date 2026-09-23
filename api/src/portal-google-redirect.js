import {ORIGINS,statement,hash,random,fail,jsonBody,rateLimit,response} from './installer-portal.js';

const COOKIE='__Host-yk_portal_redirect';
const DESTINATION='https://www.yokup.com/llamadas';
const cookie=(r,n)=>(r.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(n+'='))?.slice(n.length+1)||'';
const browserCookie=(value,age)=>`${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${age}`;
function redirect(url,sessionCookie){
 const headers=new Headers({Location:url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
 if(sessionCookie)headers.append('Set-Cookie',sessionCookie);
 headers.append('Set-Cookie',browserCookie('',0));
 return new Response(null,{status:303,headers});
}

// A dedicated flow for calls. It cannot select a role, register an account or
// choose a return URL. The existing portal login remains the role authority.
export async function googleRedirect(request,env,{client,verifyGoogle,login}){
 const url=new URL(request.url),path=url.pathname.split('/').pop();
 try{
  if(path==='redirect-challenge'){
   if(request.method!=='POST'||!ORIGINS.has(request.headers.get('origin')))fail(403,'Origen no permitido.');
   await jsonBody(request);
   await rateLimit(env,'portal-google-redirect:'+(request.headers.get('CF-Connecting-IP')||'local'),30,900000);
   const state='portal-calls.'+random(),browser=random(),nonce=random();
   await statement(env,'INSERT INTO portal_google_redirects(state_hash,browser_hash,nonce,expires_at) VALUES(?,?,?,?)',await hash(state),await hash(browser),nonce,Date.now()+300000).run();
   return response(request,{google_client_id:client,nonce,state,login_uri:'https://www.yokup.com/auth/callback'},200,browserCookie(browser,300));
  }
  if(path==='redirect-callback'){
   if(request.method!=='POST'||request.headers.get('origin')!=='https://www.yokup.com')fail(403,'Origen no permitido.');
   if(!/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get('content-type')||''))fail(400,'Formulario no válido.');
   const raw=await request.text();if(raw.length>20000)fail(400,'Formulario demasiado grande.');
   const form=new URLSearchParams(raw),csrf=form.get('g_csrf_token'),state=form.get('state')||'';
   if(!csrf||csrf!==cookie(request,'g_csrf_token')||!/^portal-calls\.[a-f0-9]{64}$/.test(state))fail(403,'Verificación no válida.');
   const key=await hash(state),row=await statement(env,'SELECT * FROM portal_google_redirects WHERE state_hash=? AND handoff_hash IS NULL AND used_at IS NULL AND expires_at>?',key,Date.now()).first();
   if(!row)fail(401,'La verificación ha caducado.');
   const identity=await verifyGoogle(form.get('credential'),row.nonce,env);
   if(!identity)fail(401,'No se pudo verificar la identidad de Google.');
   const code=random(),now=Date.now();
   const claimed=await statement(env,'UPDATE portal_google_redirects SET identity_json=?,handoff_hash=?,handoff_expires_at=? WHERE state_hash=? AND handoff_hash IS NULL AND used_at IS NULL AND expires_at>?',JSON.stringify({sub:identity.sub,email:identity.email,hd:identity.hd,name:identity.name}),await hash(code),now+60000,key,now).run();
   if(!claimed.meta.changes)fail(401,'Verificación ya utilizada.');
   // The callback is on www; only the data host can set its host-only session.
   // The one-use handoff also requires the original data-host browser cookie.
   return new Response(null,{status:303,headers:{Location:'https://data.yokup.com/api/portal-access/google/redirect-complete?code='+code,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  }
  if(path==='redirect-complete'){
   if(request.method!=='GET')fail(405,'Método no permitido.');
   const code=url.searchParams.get('code')||'',browser=cookie(request,COOKIE);
   if(!/^[a-f0-9]{64}$/.test(code)||!/^[a-f0-9]{64}$/.test(browser))fail(401,'Verificación no válida.');
   const key=await hash(code),binding=await hash(browser),now=Date.now();
   const row=await statement(env,'SELECT * FROM portal_google_redirects WHERE handoff_hash=? AND browser_hash=? AND used_at IS NULL AND handoff_expires_at>?',key,binding,now).first();
   if(!row)fail(401,'La verificación ha caducado.');
   const used=await statement(env,'UPDATE portal_google_redirects SET used_at=?,identity_json=NULL WHERE handoff_hash=? AND browser_hash=? AND used_at IS NULL AND handoff_expires_at>?',now,key,binding,now).run();
   if(!used.meta.changes)fail(401,'Verificación ya utilizada.');
   const result=await login(request,env,JSON.parse(row.identity_json));
   if(!result.ok)fail(result.status,'No se pudo completar el acceso.');
   return redirect(DESTINATION,result.headers.get('set-cookie'));
  }
  fail(404,'Ruta no encontrada.');
 }catch(e){
  if(path==='redirect-challenge')return response(request,{error:e.status?e.message:'No se pudo iniciar Google.'},e.status||500);
  // No tokens, Google claims or arbitrary provider messages in the return URL.
  return redirect(DESTINATION+'?google_error='+(e.status===404?'account_required':'verification_failed'));
 }
}
