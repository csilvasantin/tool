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
      <a class="yk-brand" href="index.html">Yo<span class="k">kup</span></a>
      <div class="yk-links">
        ${LINKS.map(l=>`<a href="${l.href}" ${l.ext?'target="_blank" rel="noopener"':''} class="${active===l.id?'active':''}">${l.label}</a>`).join('')}
      </div>
      <span class="yk-tail">intervenciones técnicas</span>
    </div>`;
  const footHTML=()=>`
    <div class="yk-foot-inner">
      <span class="b">Yokup</span>
      <span>· Intervenciones técnicas para el punto de venta</span>
      <span class="links">
        <a href="alta-punto.html">Soy punto</a>
        <a href="alta-instalador.html">Soy instalador</a>
        <a href="panel.html">Panel</a>
        <a href="https://app.admira.live/" target="_blank" rel="noopener">↗ Admira</a>
      </span>
    </div>`;
  function mount(){
    const el=document.querySelector('.yk-nav');
    if(el) el.innerHTML=html(el.getAttribute('data-active')||'');
    if(!document.querySelector('.yk-foot')){
      const f=document.createElement('footer'); f.className='yk-foot'; f.innerHTML=footHTML();
      document.body.appendChild(f);
    }
  }
  if(document.readyState!=='loading') mount(); else document.addEventListener('DOMContentLoaded',mount);
})();
