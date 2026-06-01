/* ============================================================================
 * Yokup — capa de datos (adaptador conmutable).
 *
 *  Backends (window.YOKUP_CONFIG.BACKEND — ver config.js):
 *    'local' -> mock en localStorage (demo, sin servidor). Comportamiento original.
 *    'api'   -> Cloudflare Worker yokup-api + Supabase. Cache en memoria + escritura
 *               optimista; se hidrata al cargar (await Yokup.ready).
 *
 *  Stores/equipos del catálogo Admira siempre vienen de omnipublicity-api (igual en
 *  ambos backends). Lo que cambia es dónde viven intervenciones, técnicos, altas de
 *  punto y valoraciones.
 *
 *  La API pública (getInterventions, addIntervention, …) es SÍNCRONA en lectura para
 *  no tocar las páginas: leen de localStorage ('local') o de la cache hidratada ('api').
 * ==========================================================================*/
window.Yokup = (function(){
  const CFG = window.YOKUP_CONFIG || { BACKEND:'local' };
  const BACKEND = CFG.BACKEND === 'api' ? 'api' : 'local';
  const API = (CFG.YOKUP_API || '').replace(/\/+$/,'');
  const OMNIP_API = 'https://omnipublicity-api.csilvasantin.workers.dev';

  // ---- helpers comunes ----
  const SURFACE_TYPES = ['pantalla','escaparate','mostrador','vending','pwa','audio','kiosk'];
  const inferType = (s)=> SURFACE_TYPES.includes(s) ? s : 'otro';
  const regionFromAddr = (addr='')=>{ const m=addr.split('·').pop().trim(); return m||'Sin zona'; };
  const nowISO = ()=> new Date().toISOString();
  const EQ_LABEL={pantalla:'Pantalla',escaparate:'Escaparate',mostrador:'Mostrador',
    vending:'Vending',audio:'Hilo musical',kiosk:'Kiosco interactivo'};

  // ---- catálogo de stores Admira (común a ambos backends) ----
  const FALLBACK_STORES = [
    { id:'xtanco', name:'Xtanco', kind:'Estanco · Retail físico', addr:'C/ Santa Rosa 4 · Madrid',
      coords:[-3.7283,40.4036], surfaces:[
        {name:'LED Frontal', surface:'pantalla'}, {name:'Escaparate exterior', surface:'escaparate'},
        {name:'Mostrador panel', surface:'mostrador'} ] },
    { id:'admira-loterias', name:'Admira Loterías', kind:'Loterías · Punto autorizado', addr:'Gran Vía 32 · Madrid',
      coords:[-3.7037,40.4204], surfaces:[
        {name:'LED jackpot', surface:'pantalla'}, {name:'Boletos kiosk', surface:'mostrador'} ] },
  ];
  let _stores = null;
  async function loadStores(){
    if(_stores) return _stores;
    let raw=null;
    try{
      const r = await fetch(OMNIP_API+'/api/locations',{cache:'no-store'});
      const j = await r.json(); raw = j.locations||j;
    }catch(e){ raw = (window.OMNIP_LOCATIONS_DEFAULT||FALLBACK_STORES); }
    if(!Array.isArray(raw)||!raw.length) raw = (window.OMNIP_LOCATIONS_DEFAULT||FALLBACK_STORES);
    _stores = raw.map(loc=>({
      id: loc.id, name: loc.name, kind: loc.kind||'', addr: loc.addr||'',
      region: regionFromAddr(loc.addr), coords: loc.coords||[0,0],
      surfaces: (loc.surfaces||[]).map(s=>({
        store_id: loc.id, store_name: loc.name, region: regionFromAddr(loc.addr),
        name: s.name, type: inferType(s.surface), status: s.status||'idle',
        ext_ref: loc.id+'::'+s.name
      }))
    }));
    return _stores;
  }
  async function getEquipos(){ const st=await loadStores(); return st.flatMap(s=>s.surfaces); }

  function seedInterventions(){
    return [
      { id:'iv-1001', store_id:'xtanco', store_name:'Xtanco', region:'Madrid',
        surface:'LED Frontal', surface_type:'pantalla', type:'incidencia', origin:'admira', status:'nueva',
        priority:'alta', title:'Pantalla LED Frontal sin señal',
        description:'El reproductor no recibe contenido desde Admira hace 3h.',
        created_at:'2026-05-31T08:12:00Z' },
      { id:'iv-1002', store_id:'admira-loterias', store_name:'Admira Loterías', region:'Madrid',
        surface:'Boletos kiosk', surface_type:'mostrador', type:'mantenimiento', origin:'manual', status:'publicada',
        priority:'media', title:'Mantenimiento preventivo kiosk de boletos',
        description:'Revisión táctil + limpieza trimestral.',
        created_at:'2026-05-30T16:40:00Z' },
      { id:'iv-1003', store_id:'admira-vapeo', store_name:'Admira Vapeo', region:'Madrid',
        surface:'Vending de e-líquidos', surface_type:'vending', type:'instalacion', origin:'manual', status:'en_curso',
        priority:'baja', title:'Instalación de panel digital en vending',
        description:'Montaje de 8 paneles, uno por tubo.',
        created_at:'2026-05-29T11:00:00Z' },
      { id:'iv-1004', store_id:'admira-prensa', store_name:'Admira Prensa', region:'Madrid',
        surface:'LED titulares', surface_type:'pantalla', type:'incidencia', origin:'admira', status:'publicada',
        priority:'media', title:'Parpadeo en el LED de titulares',
        description:'La pantalla parpadea de forma intermitente desde anoche.',
        created_at:'2026-05-31T07:05:00Z' },
    ];
  }

  /* ==========================================================================
   * BACKEND 'local' — localStorage (comportamiento original, sin cambios).
   * ========================================================================*/
  const Local = (function(){
    const LS_INTERV='yokup.interventions.v2', LS_TECHS='yokup.technicians.v1',
          LS_STORES='yokup.stores_pending.v1', LS_ACTIVE='yokup.active_tech.v1',
          LS_RATINGS='yokup.ratings.v1';
    const list=(k)=>{ try{const v=JSON.parse(localStorage.getItem(k));return Array.isArray(v)?v:[];}catch(e){return [];} };
    const put=(k,v)=>localStorage.setItem(k,JSON.stringify(v));

    function getInterventions(){
      try{ const v=JSON.parse(localStorage.getItem(LS_INTERV)); if(Array.isArray(v)) return v; }catch(e){}
      const seed=seedInterventions(); put(LS_INTERV,seed); return seed;
    }
    function addIntervention(iv){
      const l=getInterventions();
      iv.id=iv.id||('iv-'+Date.now()); iv.created_at=iv.created_at||nowISO(); iv.status=iv.status||'nueva';
      l.unshift(iv); put(LS_INTERV,l); return iv;
    }
    function updateIntervention(id,patch){
      const l=getInterventions(); const i=l.findIndex(x=>x.id===id);
      if(i<0) return null; l[i]={...l[i],...patch}; put(LS_INTERV,l); return l[i];
    }
    function resetInterventions(){ localStorage.removeItem(LS_INTERV); return getInterventions(); }

    function getTechnicians(){ return list(LS_TECHS); }
    function addTechnician(t){
      const l=list(LS_TECHS);
      t.id=t.id||('tech-'+Date.now()); t.status='pendiente'; t.rating_avg=0; t.rating_n=0; t.created_at=nowISO();
      l.unshift(t); put(LS_TECHS,l); localStorage.setItem(LS_ACTIVE,t.id); return t;
    }
    function getActiveTechnician(){
      const l=getTechnicians(); if(!l.length) return null;
      const id=localStorage.getItem(LS_ACTIVE); return l.find(t=>t.id===id)||l[0];
    }
    function setActiveTechnician(id){ localStorage.setItem(LS_ACTIVE,id); }
    function getTechnicianById(id){ return getTechnicians().find(t=>t.id===id)||null; }
    function updateTechnician(id,patch){
      const l=list(LS_TECHS); const i=l.findIndex(t=>t.id===id);
      if(i<0) return null; l[i]={...l[i],...patch}; put(LS_TECHS,l); return l[i];
    }

    function getRatings(){ return list(LS_RATINGS); }
    function addRating({intervention_id,technician_id,store_id,stars,comment}){
      const rs=getRatings();
      const r={id:'rt-'+Date.now(),intervention_id,technician_id,store_id,stars:Number(stars),comment:comment||'',created_at:nowISO()};
      rs.unshift(r); put(LS_RATINGS,rs);
      if(technician_id){
        const l=list(LS_TECHS); const i=l.findIndex(t=>t.id===technician_id);
        if(i>=0){ const n=(l[i].rating_n||0)+1;
          const avg=((l[i].rating_avg||0)*(l[i].rating_n||0)+r.stars)/n;
          l[i].rating_n=n; l[i].rating_avg=Math.round(avg*100)/100; put(LS_TECHS,l); }
      }
      return r;
    }
    function getRatingForIntervention(id){ return getRatings().find(r=>r.intervention_id===id)||null; }

    function getPendingStores(){ return list(LS_STORES); }
    function addStore(s){
      const l=list(LS_STORES);
      s.id=s.id||('store-'+Date.now()); s.created_at=nowISO(); s.region=s.region||regionFromAddr(s.addr);
      l.unshift(s); put(LS_STORES,l); return s;
    }
    function updateStore(id,patch){
      const l=list(LS_STORES); const i=l.findIndex(s=>s.id===id);
      if(i<0) return null; l[i]={...l[i],...patch}; put(LS_STORES,l); return l[i];
    }
    return { hydrate:()=>Promise.resolve(),
      getInterventions, addIntervention, updateIntervention, resetInterventions,
      getTechnicians, addTechnician, getActiveTechnician, setActiveTechnician, getTechnicianById, updateTechnician,
      getRatings, addRating, getRatingForIntervention, getPendingStores, addStore, updateStore };
  })();

  /* ==========================================================================
   * BACKEND 'api' — Cloudflare Worker + Supabase.
   *   Cache en memoria (mismas formas que 'local'). hydrate() la rellena desde el
   *   worker. Lecturas síncronas leen la cache; escrituras son optimistas (mutan la
   *   cache ya) y persisten en segundo plano vía fetch.
   * ========================================================================*/
  const Api = (function(){
    const cache = { interventions:[], technicians:[], ratings:[], stores:[] };
    let activeTechId = (()=>{ try{return localStorage.getItem('yokup.active_tech.v1');}catch(e){return null;} })();

    async function call(method, path, payload){
      const r = await fetch(API+'/api/'+path, {
        method,
        headers: payload!=null ? {'Content-Type':'application/json'} : undefined,
        body: payload!=null ? JSON.stringify(payload) : undefined,
      });
      const txt = await r.text();
      if(!r.ok) throw new Error('yokup-api '+r.status+': '+txt);
      return txt ? JSON.parse(txt) : null;
    }
    const fire = (m,p,b)=> call(m,p,b).catch(e=>console.error('[yokup-api] persist failed', m, p, e));

    async function hydrate(){
      try{
        const [iv,tc,rt,st] = await Promise.all([
          call('GET','interventions'), call('GET','technicians'),
          call('GET','ratings'), call('GET','stores'),
        ]);
        cache.interventions = iv||[]; cache.technicians = tc||[];
        cache.ratings = rt||[]; cache.stores = st||[];
      }catch(e){ console.error('[yokup-api] hydrate failed', e); }
    }

    const getInterventions=()=>cache.interventions;
    function addIntervention(iv){
      iv.id=iv.id||('iv-'+Date.now()); iv.created_at=iv.created_at||nowISO(); iv.status=iv.status||'nueva';
      cache.interventions.unshift(iv); fire('POST','interventions',iv); return iv;
    }
    function updateIntervention(id,patch){
      const i=cache.interventions.findIndex(x=>x.id===id);
      if(i<0) return null; cache.interventions[i]={...cache.interventions[i],...patch};
      fire('PATCH','interventions/'+encodeURIComponent(id),patch); return cache.interventions[i];
    }
    function resetInterventions(){ return cache.interventions; } // no destructivo en api

    const getTechnicians=()=>cache.technicians;
    function addTechnician(t){
      t.id=t.id||('tech-'+Date.now()); t.status='pendiente'; t.rating_avg=0; t.rating_n=0; t.created_at=nowISO();
      cache.technicians.unshift(t); activeTechId=t.id;
      try{localStorage.setItem('yokup.active_tech.v1',t.id);}catch(e){}
      fire('POST','technicians',t); return t;
    }
    function getActiveTechnician(){
      if(!cache.technicians.length) return null;
      return cache.technicians.find(t=>t.id===activeTechId)||cache.technicians[0];
    }
    function setActiveTechnician(id){ activeTechId=id; try{localStorage.setItem('yokup.active_tech.v1',id);}catch(e){} }
    const getTechnicianById=(id)=>cache.technicians.find(t=>t.id===id)||null;
    function updateTechnician(id,patch){
      const i=cache.technicians.findIndex(t=>t.id===id);
      if(i<0) return null; cache.technicians[i]={...cache.technicians[i],...patch};
      fire('PATCH','technicians/'+encodeURIComponent(id),patch); return cache.technicians[i];
    }

    const getRatings=()=>cache.ratings;
    function addRating({intervention_id,technician_id,store_id,stars,comment}){
      const r={id:'rt-'+Date.now(),intervention_id,technician_id,store_id,stars:Number(stars),comment:comment||'',created_at:nowISO()};
      cache.ratings.unshift(r);
      // recálculo optimista del rating en cache (el worker lo recalcula server-side también)
      if(technician_id){ const t=cache.technicians.find(x=>x.id===technician_id);
        if(t){ const n=(t.rating_n||0)+1; t.rating_avg=Math.round(((t.rating_avg||0)*(t.rating_n||0)+r.stars)/n*100)/100; t.rating_n=n; } }
      fire('POST','ratings',{intervention_id,technician_id,store_id,stars:Number(stars),comment:comment||''});
      return r;
    }
    const getRatingForIntervention=(id)=>cache.ratings.find(r=>r.intervention_id===id)||null;

    const getPendingStores=()=>cache.stores;
    function addStore(s){
      s.id=s.id||('store-'+Date.now()); s.created_at=nowISO(); s.region=s.region||regionFromAddr(s.addr);
      cache.stores.unshift(s); fire('POST','stores',s); return s;
    }
    function updateStore(id,patch){
      const i=cache.stores.findIndex(s=>s.id===id);
      if(i<0) return null; cache.stores[i]={...cache.stores[i],...patch};
      fire('PATCH','stores/'+encodeURIComponent(id),patch); return cache.stores[i];
    }
    return { hydrate, getInterventions, addIntervention, updateIntervention, resetInterventions,
      getTechnicians, addTechnician, getActiveTechnician, setActiveTechnician, getTechnicianById, updateTechnician,
      getRatings, addRating, getRatingForIntervention, getPendingStores, addStore, updateStore };
  })();

  const BK = BACKEND === 'api' ? Api : Local;
  // Las páginas pueden `await Yokup.ready` antes de pintar (instantáneo en 'local').
  const ready = BK.hydrate();

  // Puntos dados de alta, en el mismo formato que loadStores() (con surfaces).
  function getPendingStoresAsStores(){
    return BK.getPendingStores().map(s=>({
      id:s.id, name:s.name, kind:s.kind||'', addr:s.addr||'', region:s.region||regionFromAddr(s.addr), coords:[0,0],
      is_new:true,
      surfaces:(s.equipment||[]).map(t=>({
        store_id:s.id, store_name:s.name, region:s.region||regionFromAddr(s.addr),
        name:EQ_LABEL[t]||t, type:t, status:'nuevo', ext_ref:s.id+'::'+t
      }))
    }));
  }

  return { OMNIP_API, BACKEND, ready, loadStores, getEquipos, inferType, EQ_LABEL,
           getInterventions:(...a)=>BK.getInterventions(...a),
           addIntervention:(...a)=>BK.addIntervention(...a),
           updateIntervention:(...a)=>BK.updateIntervention(...a),
           resetInterventions:(...a)=>BK.resetInterventions(...a),
           getTechnicians:(...a)=>BK.getTechnicians(...a),
           addTechnician:(...a)=>BK.addTechnician(...a),
           getActiveTechnician:(...a)=>BK.getActiveTechnician(...a),
           setActiveTechnician:(...a)=>BK.setActiveTechnician(...a),
           getTechnicianById:(...a)=>BK.getTechnicianById(...a),
           updateTechnician:(...a)=>BK.updateTechnician(...a),
           getRatings:(...a)=>BK.getRatings(...a),
           addRating:(...a)=>BK.addRating(...a),
           getRatingForIntervention:(...a)=>BK.getRatingForIntervention(...a),
           getPendingStores:(...a)=>BK.getPendingStores(...a),
           addStore:(...a)=>BK.addStore(...a),
           updateStore:(...a)=>BK.updateStore(...a),
           getPendingStoresAsStores };
})();
