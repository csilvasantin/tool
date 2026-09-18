// Cuentas de demo (Carlos, 18-sep-2026): usuario = contraseña y sin correo, solo para
// enseñar los portales. Cada alias apunta a una cuenta real creada con /register.
const DEMO_LOGINS={retailer:{inditex:'inditex@demo.yokup.com'},installer:{ikaro:'ikaro@demo.yokup.com'}};
export function demoLogin(kind,body){
 const user=String(body?.email||'').trim().toLowerCase(),email=DEMO_LOGINS[kind][user];
 return email&&String(body?.password||'').trim().toLowerCase()===user?email:null;
}
