// Cuentas de demo (Carlos, 18-sep-2026): usuario = contraseña, solo para enseñar los
// portales. Se entra con el alias corto o con el correo (alias + de Gmail de Carlos).
const DEMO_LOGINS={retailer:{inditex:'csilvasantin+inditex@gmail.com'},installer:{ikaro:'csilvasantin+ikaro@gmail.com'}};
export function demoLogin(kind,body){
 const user=String(body?.email||'').trim().toLowerCase(),password=String(body?.password||'').trim().toLowerCase();
 const alias=Object.keys(DEMO_LOGINS[kind]).find(a=>user===a||user===DEMO_LOGINS[kind][a]);
 return alias&&password===alias?DEMO_LOGINS[kind][alias]:null;
}
