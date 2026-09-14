import {statement,random,hash,text,fail,response,installerProfile,publicInstaller,installerSession} from './installer-portal.js';
import {publicRetailer,retailerSession} from './retailer-portal.js';
const table=kind=>kind==='installer'?'installer_accounts':'retailer_accounts';
const SIGNUP='__Host-yk_portal_signup';
const cookie=(r)=>r.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(SIGNUP+'='))?.slice(SIGNUP.length+1);
const done=async(request,env,kind,account,status=200)=>response(request,{ok:true,role:kind,profile:kind==='installer'?publicInstaller(account):publicRetailer(account)},status,await(kind==='installer'?installerSession:retailerSession)(env,account.id,account.password_hash));
async function existing(request,env,kind,p){
 const linked=await statement(env,'SELECT account_id FROM portal_google_identities WHERE kind=? AND google_sub=?',kind,p.sub).first();
 const account=await statement(env,`SELECT * FROM ${table(kind)} WHERE ${linked?'id':'email'}=?`,linked?.account_id||p.email).first();
 if(!account)return null;
 // Never silently rebind an account to a different Google subject.
 try{await statement(env,'INSERT OR IGNORE INTO portal_google_identities VALUES(?,?,?)',kind,account.id,p.sub).run();}catch{fail(409,'No se pudo vincular esta identidad.');}
 const identity=await statement(env,'SELECT google_sub FROM portal_google_identities WHERE kind=? AND account_id=?',kind,account.id).first();
 if(identity?.google_sub!==p.sub)fail(403,'Esta cuenta está vinculada a otra identidad de Google.');
 return done(request,env,kind,account);
}
export async function googlePortal(request,env,b,p){
 const kind=b.kind;
 if(!['login','register'].includes(b.intent))fail(400,'Elige crear cuenta o entrar.');
 const result=await existing(request,env,kind,p);if(result)return result;
 if(b.intent==='login')fail(404,'Aún no tienes cuenta en este portal. Elige Crear cuenta y continúa con Google.');
 const token=random();await statement(env,'INSERT INTO portal_google_signup VALUES(?,?,?,?,?,?,NULL)',await hash(token),kind,p.email,p.sub,String(p.name||'').slice(0,100),Date.now()+900000).run();
 return response(request,{ok:true,needs_profile:true,ticket:token,email:p.email,name:p.name||''},200,`${SIGNUP}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=900`);
}
export async function finishGoogleSignup(request,env,b){
 const kind=b.kind,token=text(b.ticket,64,64);if(cookie(request)!==token)fail(401,'Vuelve a verificar tu cuenta con Google.');
 const key=await hash(token),signup=await statement(env,'SELECT * FROM portal_google_signup WHERE token_hash=? AND kind=? AND used_by IS NULL AND expires_at>?',key,kind,Date.now()).first();
 if(!signup)fail(401,'La verificación ha caducado o ya se ha utilizado.');
 const id=crypto.randomUUID(),claim=crypto.randomUUID(),now=Date.now(),salt=random(),digest=random();
 // Google-only accounts have an unreachable random password digest, never a shared password.
 const p=kind==='installer'?installerProfile(b):{name:text(b.name||signup.name,2,100)};
 const owned='EXISTS(SELECT 1 FROM portal_google_signup WHERE token_hash=? AND used_by=?)';
 const insert=kind==='installer'?statement(env,`INSERT INTO installer_accounts(id,email,name,password_hash,salt,country,city,latitude,longitude,skills,language,available,radius_km,notify_zone,demo,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${owned}`,id,signup.email,p.name,digest,salt,p.country,p.city,p.latitude,p.longitude,p.skills,p.language,p.available,p.radius_km,p.notify_zone,p.demo,now,key,claim):statement(env,`INSERT INTO retailer_accounts SELECT ?,?,?,?,?,? WHERE ${owned}`,id,signup.email,p.name,digest,salt,now,key,claim);
 let result;try{result=await env.DB.batch([
 statement(env,'UPDATE portal_google_signup SET used_by=? WHERE token_hash=? AND used_by IS NULL AND expires_at>?',claim,key,now),insert,
 statement(env,`INSERT INTO portal_google_identities SELECT ?,?,? WHERE ${owned}`,kind,id,signup.google_sub,key,claim)
 ]);}catch(e){if(String(e).includes('UNIQUE'))fail(409,'La cuenta ya se ha creado. Entra con Google.');throw e;}
 if(!result[0].meta.changes)fail(409,'Esta verificación ya se ha utilizado. Entra con Google.');
 return done(request,env,kind,await statement(env,`SELECT * FROM ${table(kind)} WHERE id=?`,id).first(),201);
}
