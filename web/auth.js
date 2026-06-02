/* ============================================================================
 * Yokup — autenticación con Supabase (enlace mágico / OTP por email).
 *
 * Passwordless: el usuario pide un enlace a su email y al volver queda con sesión.
 * Expone window.YokupAuth con:
 *   ready            -> Promise; resuelve tras procesar el posible token de la URL.
 *   user()           -> objeto usuario o null.
 *   token()          -> access_token (JWT) o null, para las escrituras a PostgREST.
 *   signInWithEmail(email) -> envía el enlace mágico.
 *   signOut()        -> cierra sesión.
 *   onChange(fn)     -> callback cuando cambia el estado de sesión.
 *
 * No usa el SDK: habla directo con /auth/v1 de Supabase con la anon key.
 * La sesión se guarda en localStorage y se refresca si el access_token caduca.
 * ==========================================================================*/
window.YokupAuth = (function(){
  const CFG = window.YOKUP_CONFIG || {};
  const URL = (CFG.SUPABASE_URL||'').replace(/\/+$/,'');
  const KEY = CFG.SUPABASE_ANON_KEY||'';
  const LS  = 'yokup.session.v1';
  const listeners = [];
  let session = load();

  function load(){ try{ return JSON.parse(localStorage.getItem(LS))||null; }catch(e){ return null; } }
  function save(s){ session=s; if(s) localStorage.setItem(LS, JSON.stringify(s)); else localStorage.removeItem(LS); emit(); }
  function emit(){ listeners.forEach(fn=>{ try{ fn(user()); }catch(e){} }); }

  function user(){ return session && session.user || null; }
  function token(){ return session && session.access_token || null; }
  function expiresAt(){ return session && session.expires_at ? session.expires_at*1000 : 0; }

  async function api(path, body, useToken){
    const r = await fetch(`${URL}/auth/v1/${path}`, {
      method:'POST',
      headers:{ apikey:KEY, 'Content-Type':'application/json',
                ...(useToken && token() ? {Authorization:'Bearer '+token()} : {}) },
      body: body?JSON.stringify(body):undefined,
    });
    const txt = await r.text(); let j={}; try{ j=txt?JSON.parse(txt):{}; }catch(e){}
    if(!r.ok) throw new Error(j.error_description||j.msg||j.error||('auth '+r.status));
    return j;
  }

  // Enlace mágico: redirige de vuelta a la página actual con el token en el hash.
  async function signInWithEmail(email){
    const redirect = location.origin + location.pathname;
    return api('otp', { email, create_user:true, gotrue_meta_security:{},
      options:{ email_redirect_to: redirect } });
    // Nota: el endpoint /otp acepta email_redirect_to vía query en algunos despliegues;
    // se añade abajo por compatibilidad.
  }

  async function signOut(){
    try{ if(token()) await api('logout', {}, true); }catch(e){}
    save(null);
  }

  async function refresh(){
    if(!session || !session.refresh_token) return false;
    try{
      const j = await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`, {
        method:'POST', headers:{ apikey:KEY, 'Content-Type':'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      }).then(r=>r.json());
      if(j && j.access_token){ save(j); return true; }
    }catch(e){}
    save(null); return false;
  }

  async function ensureFresh(){
    if(!session) return null;
    if(expiresAt() && Date.now() > expiresAt() - 60000) await refresh();
    return token();
  }

  // Procesa el token que Supabase devuelve en el hash tras el enlace mágico.
  async function consumeHash(){
    if(!location.hash || location.hash.indexOf('access_token=')<0) return;
    const p = new URLSearchParams(location.hash.slice(1));
    const access_token=p.get('access_token'), refresh_token=p.get('refresh_token'),
          expires_in=+(p.get('expires_in')||3600);
    if(access_token){
      let u=null;
      try{ u = await fetch(`${URL}/auth/v1/user`, { headers:{ apikey:KEY, Authorization:'Bearer '+access_token } }).then(r=>r.json()); }catch(e){}
      save({ access_token, refresh_token, expires_at: Math.floor(Date.now()/1000)+expires_in, user:u });
      // limpiar el hash de la URL
      history.replaceState(null,'',location.pathname+location.search);
    }
  }

  function onChange(fn){ listeners.push(fn); return ()=>{ const i=listeners.indexOf(fn); if(i>=0) listeners.splice(i,1); }; }

  // Guard de escritura: si no hay sesión, muestra el modal de login y devuelve false.
  function requireAuth(){
    if(user()) return true;
    if(window.YokupOpenLogin) window.YokupOpenLogin();
    return false;
  }
  // Inserta un aviso (gate) al principio de un contenedor cuando no hay sesión.
  function writeGate(containerSelector, msg){
    if(user()) return;
    const c=document.querySelector(containerSelector); if(!c || c.querySelector('.yk-gate')) return;
    const g=document.createElement('div'); g.className='yk-gate';
    g.innerHTML=`<span>🔒 ${msg||'Inicia sesión para crear o modificar datos.'} La consulta es pública; <b>escribir requiere entrar</b>.</span>
      <button class="yk-btn yk-btn-p" style="margin-left:auto">Entrar</button>`;
    g.querySelector('button').addEventListener('click', ()=>window.YokupOpenLogin&&window.YokupOpenLogin());
    c.insertBefore(g, c.firstChild);
  }

  const ready = (async function(){
    await consumeHash();
    if(session) await ensureFresh();
  })();

  return { ready, user, token, ensureFresh, signInWithEmail, signOut, onChange, requireAuth, writeGate };
})();
