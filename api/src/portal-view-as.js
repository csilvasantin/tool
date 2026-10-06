// «Abrir como instalador» (Carlos, 6-oct-2026): un superusuario usa el portal del instalador
// en las demos (inventario, incidencias, aceptar y resolver) sin la contraseña del técnico.
// Seguridad primero, igual que «Ver como» del comercio (retailer-accounts.js):
// - La elección vive en una cookie __Host- HttpOnly con SOLO el id del instalador (no es un
//   secreto). Vale únicamente junto a la sesión Google de superusuario, que se revalida en CADA
//   petición: revocar al superusuario o cerrar su sesión corta la vista en el acto.
// - Sin tabla nueva ni migración: no se crea ninguna sesión del instalador.
// - En la vista no se gestionan tokens MCP ni avisos push (serían del navegador del superusuario).
// - Cada apertura queda en portal_role_audit (acción view-as:installer).
// Los instaladores y comercios normales siguen exactamente igual: sin superusuario, la cookie no hace nada.
import {statement,rows,text,fail,response,jsonBody} from './installer-portal.js';
import {adminIdentity} from './portal-access.js';
export const VIEW_AS_COOKIE='__Host-yk_installer_as';
const TTL=3600,ID=/^[\w:.@-]{1,100}$/;
const cookie=(r,name)=>r.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';
export const viewAsCookie=(id,age=TTL)=>`${VIEW_AS_COOKIE}=${encodeURIComponent(id)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
// Cuenta del instalador abierta por un superusuario vigente, o null (entonces manda la sesión propia).
export async function installerViewAs(request,env){
 const raw=cookie(request,VIEW_AS_COOKIE);if(!raw)return null;
 let id;try{id=decodeURIComponent(raw);}catch{return null;}
 if(!ID.test(id))return null;
 let admin;try{admin=await adminIdentity(request,env);}catch(e){if(e.status===401)return null;throw e;}
 const account=await statement(env,'SELECT * FROM installer_accounts WHERE id=?',id).first();if(!account)return null;
 return {account,access:{delegated:true,role:'superuser',actor_kind:'superuser',actor_email:admin.email}};
}
// GET/POST /api/portal-admin/view-as (ya autenticado como superusuario por handleAdmin).
export async function manageViewAs(request,env,actor){
 if(request.method==='GET'){
  const [retailers,installers]=await Promise.all([
   rows(env,'SELECT r.id,r.name,b.brand_key,(SELECT COUNT(*) FROM retailer_sites s WHERE s.retailer_id=r.id) AS sites FROM brand_accounts b JOIN retailer_accounts r ON r.id=b.retailer_id ORDER BY r.name LIMIT 500'),
   rows(env,'SELECT id,name,city,country,available FROM installer_accounts ORDER BY name,id LIMIT 500')
  ]);
  let current=null;try{current=decodeURIComponent(cookie(request,VIEW_AS_COOKIE))||null;}catch{}
  return response(request,{retailers,installers:installers.map(a=>({...a,available:!!a.available})),installer_as:current&&installers.some(a=>a.id===current)?current:null});
 }
 const b=await jsonBody(request);
 if(b.kind!=='installer')fail(400,'Para el comercio usa «Ver como» (/api/retailer/switch); aquí solo kind: installer.');
 if(b.installer_id===null||b.installer_id===undefined||b.installer_id===''){
  return response(request,{ok:true,installer:null},200,viewAsCookie('',0));
 }
 const id=text(b.installer_id,1,100);if(!ID.test(id))fail(400,'Instalador no válido.');
 const a=await statement(env,'SELECT id,name,email FROM installer_accounts WHERE id=?',id).first();if(!a)fail(404,'Instalador no encontrado.');
 await statement(env,'INSERT INTO portal_role_audit VALUES(?,?,?,?,?)',crypto.randomUUID(),a.email,'view-as:installer:'+a.id,actor.email,Date.now()).run();
 return response(request,{ok:true,installer:{id:a.id,name:a.name}},200,viewAsCookie(a.id));
}
