import {statement,rows,text,fail,response,jsonBody} from './installer-portal.js';
export const ADMIN='csilva@admira.com';
export const superuser=(env,email)=>statement(env,'SELECT * FROM portal_superusers WHERE email=? AND revoked_at IS NULL',email).first();
export async function bindSuperuser(env,p){
 const role=await superuser(env,p.email);if(!role)return null;
 if((p.email===ADMIN&&p.hd!=='admira.com')||(role.google_sub&&role.google_sub!==p.sub))fail(403,'La identidad de Google no coincide con la cuenta autorizada.');
 await statement(env,'UPDATE portal_superusers SET google_sub=? WHERE email=? AND revoked_at IS NULL AND (google_sub IS NULL OR google_sub=?)',p.sub,p.email,p.sub).run();
 const current=await superuser(env,p.email);if(current?.google_sub!==p.sub)fail(403,'La autorización ha cambiado. Vuelve a entrar.');return current;
}
export async function manageSuperusers(request,env,actor){
 if(request.method==='GET')return response(request,{superusers:await rows(env,'SELECT email,granted_by,created_at FROM portal_superusers WHERE revoked_at IS NULL ORDER BY email')});
 const b=await jsonBody(request),email=text(b.email,3,254).toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['grant','revoke'].includes(b.action))fail(400,'Revisa el correo y la acción.');
 if(email===ADMIN||email===actor.email)fail(400,'La cuenta principal y tu propio acceso se conservan.');
 const now=Date.now();
 // Only the original owner can delegate administrative access.
 if(actor.email!==ADMIN)fail(403,'Solo la cuenta principal puede gestionar superusuarios.');
 const op=b.action==='grant'?statement(env,`INSERT INTO portal_superusers VALUES(?,NULL,?,?,NULL) ON CONFLICT(email) DO UPDATE SET revoked_at=NULL,granted_by=excluded.granted_by,created_at=excluded.created_at`,email,actor.email,now):statement(env,'UPDATE portal_superusers SET revoked_at=? WHERE email=?',now,email);
 await env.DB.batch([op,statement(env,'DELETE FROM portal_admin_sessions WHERE email=?',email),statement(env,'INSERT INTO portal_role_audit VALUES(?,?,?,?,?)',crypto.randomUUID(),email,b.action,actor.email,now)]);
 return response(request,{ok:true});
}
