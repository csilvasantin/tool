import {hash,random,statement,rows,text,jsonBody,rateLimit,response,fail} from './installer-portal.js';
export const PORTAL_SCOPES={
 installer:{'installer:read':'Consultar perfil, bandeja y trabajos','installer:accept':'Aceptar intervenciones cercanas','installer:resolve':'Registrar reparación y cerrar intervención','installer:notifications':'Marcar avisos como leídos'},
 retailer:{'retailer:read':'Consultar establecimientos, equipos e incidencias','retailer:inventory':'Dar de alta establecimientos y equipos','retailer:incidents':'Comunicar incidencias','retailer:ratings':'Valorar intervenciones en nombre del comercio'}
};
export const audience=kind=>'https://data.yokup.com/mcp/'+kind;
export async function portalCredentials(request,env,kind,account,path){
 if(path==='/mcp-tokens'&&request.method==='GET'){
  const tokens=await rows(env,'SELECT id,label,scopes,created_at,expires_at,revoked_at,last_used_at FROM portal_mcp_tokens WHERE kind=? AND account_id=? ORDER BY created_at DESC LIMIT 100',kind,account.id);
  return response(request,{endpoint:audience(kind),available_scopes:PORTAL_SCOPES[kind],tokens:tokens.map(t=>({...t,scopes:JSON.parse(t.scopes)}))});
 }
 if(path==='/mcp-tokens'&&request.method==='POST'){
  await rateLimit(env,'mcp-issue:'+kind+':'+account.id,20,3600000);
  const b=await jsonBody(request),label=text(b.label,2,100),days=b.expires_in_days??30;
  if(!Number.isInteger(days)||days<1||days>90)fail(400,'La duración debe ser de 1 a 90 días.');
  const scopes=Array.isArray(b.scopes)?[...new Set(b.scopes)]:[];
  if(!scopes.length||scopes.some(s=>!Object.hasOwn(PORTAL_SCOPES[kind],s)))fail(400,'Selecciona permisos válidos para este portal.');
  const token='ykp_'+random(),id=crypto.randomUUID(),now=Date.now(),expires=now+days*86400000;
  const inserted=await statement(env,`INSERT INTO portal_mcp_tokens(id,token_hash,kind,account_id,label,scopes,audience,created_at,expires_at)
   SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM portal_mcp_tokens WHERE kind=? AND account_id=? AND revoked_at IS NULL AND expires_at>?)<20 AND EXISTS(SELECT 1 FROM ${kind==='installer'?'installer_accounts':'retailer_accounts'} WHERE id=? AND password_hash=?)`,id,await hash(token),kind,account.id,label,JSON.stringify(scopes),audience(kind),now,expires,kind,account.id,now,account.id,account.password_hash).run();
  if(!inserted.meta.changes)fail(409,'Ya tienes 20 tokens activos. Revoca uno antes de crear otro.');
  return response(request,{id,token,label,scopes,expires_at:expires,endpoint:audience(kind),show_once:true},201);
 }
 const revoke=/^\/mcp-tokens\/([a-f0-9-]{36})\/revoke$/.exec(path);
 if(revoke&&request.method==='POST'){
  const t=await statement(env,'SELECT id FROM portal_mcp_tokens WHERE id=? AND kind=? AND account_id=?',revoke[1],kind,account.id).first();
  if(!t)fail(404,'Token no encontrado.');
  await statement(env,'UPDATE portal_mcp_tokens SET revoked_at=COALESCE(revoked_at,?) WHERE id=?',Date.now(),t.id).run();
  return response(request,{ok:true});
 }
 if(path==='/mcp-audit'&&request.method==='GET')return response(request,{events:await rows(env,`SELECT a.id,a.tool,a.outcome,a.http_status,a.created_at,a.completed_at,t.label AS integration FROM portal_mcp_audit a JOIN portal_mcp_tokens t ON t.id=a.token_id WHERE a.kind=? AND a.account_id=? ORDER BY a.created_at DESC LIMIT 100`,kind,account.id)});
 return response(request,{error:'Ruta no encontrada.'},404);
}
export async function authenticatePortalToken(request,env,kind){
 const value=/^Bearer (ykp_[a-f0-9]{64})$/.exec(request.headers.get('authorization')||'')?.[1];
 if(!value)return null;
 const t=await statement(env,'SELECT * FROM portal_mcp_tokens WHERE token_hash=? AND kind=? AND audience=? AND revoked_at IS NULL AND expires_at>?',await hash(value),kind,audience(kind),Date.now()).first();
 if(!t)return null;
 // Table name comes exclusively from the fixed server route, never a caller parameter.
 const table=kind==='installer'?'installer_accounts':'retailer_accounts';
 const account=await statement(env,`SELECT * FROM ${table} WHERE id=?`,t.account_id).first();
 if(!account)return null;
 return {token:t,scopes:JSON.parse(t.scopes),account};
}
