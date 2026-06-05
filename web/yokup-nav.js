/* Nav propio de Yokup. Uso: <nav class="yk-nav" data-active="dashboard"></nav> */
(function(){
  const LINKS = [
    { id:'home',        label:'Cómo funciona', href:'index.html' },
    { id:'video',       label:'▶ Vídeo',       href:'video.html' },
    { id:'punto',       label:'Soy punto',     href:'alta-punto.html' },
    { id:'instalador',  label:'Soy instalador',href:'alta-instalador.html' },
    { id:'dashboard',   label:'Panel',         href:'panel.html' },
    { id:'marketplace', label:'Tablón',        href:'marketplace.html' },
    { id:'equipos',     label:'Equipos',       href:'equipos.html' },
    { id:'backoffice',  label:'Operador',      href:'backoffice.html' },
  ];
  const html = (active)=>`
    <div class="yk-nav-inner">
      <a class="yk-brand" href="index.html">
        <img src="favicon.png" alt="Yokup">
        <span>Yokup</span>
      </a>
      <div class="yk-links">
        ${LINKS.map(l=>`<a href="${l.href}" ${l.ext?'target="_blank" rel="noopener"':''} class="${active===l.id?'active':''}">${l.label}</a>`).join('')}
      </div>
      <span class="yk-auth" id="yk-auth"></span>
    </div>`;

  function renderAuth(){
    const el=document.getElementById('yk-auth'); const A=window.YokupAuth; if(!el||!A) return;
    const u=A.user();
    if(u){
      el.innerHTML=`<span class="yk-who" title="${u.email||''}">${u.email||'sesión'}</span>
        <button class="yk-btn" id="yk-out">Salir</button>`;
      el.querySelector('#yk-out').addEventListener('click', async ()=>{ await A.signOut(); location.reload(); });
    } else {
      el.innerHTML=`<button class="yk-btn yk-btn-p" id="yk-in">Entrar</button>`;
      el.querySelector('#yk-in').addEventListener('click', openLogin);
    }
  }

  function openLogin(){
    if(document.getElementById('yk-modal')) return;
    const m=document.createElement('div'); m.id='yk-modal'; m.className='yk-modal';
    m.innerHTML=`<div class="yk-modal-box">
      <h3>Entrar en Yokup</h3>
      <p class="muted" style="font-size:13px;margin:0 0 14px">Te enviamos un enlace mágico a tu email. Sin contraseñas.</p>
      <input id="yk-email" type="email" placeholder="tu@email.com" autocomplete="email">
      <button class="yk-btn yk-btn-p" id="yk-send" style="width:100%;margin-top:10px">Enviar enlace</button>
      <div id="yk-msg" style="font-size:13px;margin-top:10px"></div>
      <button class="yk-x" id="yk-close">×</button>
    </div>`;
    document.body.appendChild(m);
    const close=()=>m.remove();
    m.querySelector('#yk-close').addEventListener('click',close);
    m.addEventListener('click',e=>{ if(e.target===m) close(); });
    m.querySelector('#yk-send').addEventListener('click', async ()=>{
      const email=m.querySelector('#yk-email').value.trim();
      const msg=m.querySelector('#yk-msg');
      if(!/.+@.+\..+/.test(email)){ msg.style.color='var(--warn)'; msg.textContent='Email no válido'; return; }
      msg.style.color='var(--mut)'; msg.textContent='Enviando…';
      try{ await window.YokupAuth.signInWithEmail(email);
        msg.style.color='var(--good)'; msg.textContent='✓ Revisa tu email y pulsa el enlace para entrar.';
      }catch(e){ msg.style.color='var(--warn)'; msg.textContent='Error: '+e.message; }
    });
  }
  window.YokupOpenLogin = openLogin;
  const footHTML=()=>`
    <div class="yk-foot-inner">
      <a class="b" href="index.html">Yokup</a>
      <span>· Intervenciones técnicas para el punto de venta</span>
      <span class="links">
        <a href="alta-punto.html">Soy punto</a>
        <a href="alta-instalador.html">Soy instalador</a>
        <a href="panel.html">Panel</a>
        <a href="https://admira.com/es/" target="_blank" rel="noopener">↗ Admira</a>
      </span>
    </div>`;
  function mount(){
    const el=document.querySelector('.yk-nav');
    if(el) el.innerHTML=html(el.getAttribute('data-active')||'');
    if(!document.querySelector('.yk-foot')){
      const f=document.createElement('footer'); f.className='yk-foot'; f.innerHTML=footHTML();
      document.body.appendChild(f);
    }
    // Estado de sesión (si auth.js está cargado).
    if(window.YokupAuth){
      window.YokupAuth.ready.then(renderAuth);
      window.YokupAuth.onChange(renderAuth);
    }
  }
  if(document.readyState!=='loading') mount(); else document.addEventListener('DOMContentLoaded',mount);
})();
