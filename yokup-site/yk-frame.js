/* YK_MISSION_NOVELTY_CORE_START
 * Estado puro y versionado de nuevas misiones. Vive antes del marco para poder
 * probarse sin DOM; la UI de la barra lo consume más abajo. */
(function (root) {
  "use strict";
  var KEY = "yk_nav_missions_v2";
  function number(value) { var n = Number(value); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null; }
  function clean(value) { return String(value == null ? "" : value).trim(); }
  function meta(payload) {
    var p = payload || {}, cursor = number(p.created_cursor);
    if (cursor == null) cursor = number(p.latest_cursor);
    if (cursor == null) cursor = number(p.event_cursor);
    if (cursor == null) cursor = number(p.cursor);
    var events = Array.isArray(p.events) ? p.events.map(function (event) {
      return { cursor:number(event && event.cursor), mission_id:clean(event && (event.mission_id || event.id)), created_at:number(event && event.created_at), source:clean(event && event.source), decision_id:clean(event && event.decision_id), batch_id:clean(event && event.batch_id) };
    }).filter(function (event) { return event.cursor != null || event.mission_id; }) : [];
    return { cursor:cursor, newest_id:clean(p.newest_id || (events[0] && events[0].mission_id)), latest_created_at:number(p.latest_created_at), events:events, fallback_count:Math.max(0,(number(p.curso)||0)+(number(p.pend)||0)) };
  }
  function initial() { return { version:2, seen_cursor:null, observed_cursor:null, unread:0, fallback_count:null, fallback_sig:"", newest_id:"", latest_created_at:null, events:[] }; }
  function normalize(value) {
    var out=initial(),v=value&&typeof value==="object"?value:{};
    out.seen_cursor=number(v.seen_cursor);out.observed_cursor=number(v.observed_cursor);out.unread=Math.max(0,number(v.unread)||0);
    out.fallback_count=number(v.fallback_count);out.fallback_sig=clean(v.fallback_sig);out.newest_id=clean(v.newest_id);out.latest_created_at=number(v.latest_created_at);
    out.events=Array.isArray(v.events)?v.events.slice(0,20):[];return out;
  }
  function eventKey(event){return event&&event.cursor!=null?"c:"+event.cursor:"m:"+clean(event&&event.mission_id);}
  function mergeEvents(a,b,seen){
    var found={},rows=[];(a||[]).concat(b||[]).forEach(function(event){var key=eventKey(event);if(!key||found[key])return;found[key]=true;if(event.cursor==null||seen==null||event.cursor>seen)rows.push(event);});
    rows.sort(function(x,y){return (number(y.cursor)||0)-(number(x.cursor)||0);});return rows.slice(0,20);
  }
  function countNew(events,after){
    var found={},n=0;(events||[]).forEach(function(event){var cursor=number(event&&event.cursor),key=eventKey(event);if(!key||found[key]||cursor==null||after!=null&&cursor<=after)return;found[key]=true;n++;});return n;
  }
  function create(options) {
    options=options||{};var storage=options.storage||null,publish=typeof options.publish==="function"?options.publish:function(){};
    function read(){try{return normalize(JSON.parse(storage&&storage.getItem(KEY)||"null"));}catch(_){return initial();}}
    var state=read();
    function write(broadcast){try{if(storage)storage.setItem(KEY,JSON.stringify(state));}catch(_){}if(broadcast!==false)publish(JSON.parse(JSON.stringify(state)));}
    function snapshot(){return JSON.parse(JSON.stringify(state));}
    function observe(payload) {
      var m=meta(payload),before=state.unread,first=state.observed_cursor==null&&state.fallback_count==null;
      if(m.cursor!=null){
        if(state.observed_cursor==null){state.observed_cursor=m.cursor;state.seen_cursor=Math.max(0,m.cursor-state.unread);}
        else if(m.cursor>state.observed_cursor){var previous=state.observed_cursor,added=countNew(m.events,previous);state.observed_cursor=m.cursor;state.unread+=added||1;}
        // Una respuesta de polling antigua nunca puede hacer retroceder ni el
        // cursor observado ni el ACK. Sólo aporta detalle que aún no tuviéramos.
        state.events=mergeEvents(state.events,m.events,state.seen_cursor);
      }else{
        var sig=[m.newest_id,m.latest_created_at||"",m.fallback_count].join(":");
        if(state.fallback_count!=null&&!first){var increase=Math.max(0,m.fallback_count-state.fallback_count),changed=state.fallback_sig&&sig!==state.fallback_sig&&(m.newest_id||m.latest_created_at);if(increase||changed)state.unread+=Math.max(1,increase);}
        state.fallback_count=m.fallback_count;state.fallback_sig=sig;state.events=m.events.slice(0,20);
      }
      state.fallback_count=m.fallback_count;if(m.newest_id)state.newest_id=m.newest_id;if(m.latest_created_at!=null)state.latest_created_at=m.latest_created_at;
      var changed=JSON.stringify(state)!==JSON.stringify(read());if(changed)write(true);
      return {first:first,added:Math.max(0,state.unread-before),state:snapshot(),meta:m};
    }
    function ack(payload){var before=JSON.stringify(state),m=meta(payload);if(m.cursor!=null){state.observed_cursor=m.cursor;state.seen_cursor=m.cursor;}else state.fallback_count=m.fallback_count;state.unread=0;state.events=[];if(m.newest_id)state.newest_id=m.newest_id;if(m.latest_created_at!=null)state.latest_created_at=m.latest_created_at;if(JSON.stringify(state)!==before)write(true);return snapshot();}
    function sync(value){
      var incoming;try{incoming=normalize(typeof value==="string"?JSON.parse(value||"null"):value);}catch(_){return snapshot();}
      var currentObserved=state.observed_cursor==null?-1:state.observed_cursor,nextObserved=incoming.observed_cursor==null?-1:incoming.observed_cursor;
      if(nextObserved<currentObserved)return snapshot();
      var seen=Math.max(state.seen_cursor==null?-1:state.seen_cursor,incoming.seen_cursor==null?-1:incoming.seen_cursor);
      if(nextObserved===currentObserved&&seen===(state.seen_cursor==null?-1:state.seen_cursor)&&incoming.unread<=state.unread)return snapshot();
      var combined=mergeEvents(state.events,incoming.events,seen<0?null:seen);
      state=incoming;state.observed_cursor=Math.max(currentObserved,nextObserved);state.seen_cursor=seen<0?null:Math.min(seen,state.observed_cursor);
      state.events=combined;
      // Un ACK remoto gana a mensajes viejos; si además llegó un cursor posterior,
      // sólo permanecen sin leer sus eventos realmente posteriores al ACK.
      state.unread=countNew(combined,state.seen_cursor);
      if(state.observed_cursor>state.seen_cursor&&!state.unread)state.unread=Math.max(1,incoming.unread||0);
      write(false);return snapshot();
    }
    return {observe:observe,ack:ack,sync:sync,snapshot:snapshot,key:KEY,meta:meta};
  }
  root.YkMissionNovelty={create:create,meta:meta,key:KEY,_test:{normalize:normalize}};
})(typeof window!=="undefined"?window:globalThis);
/* YK_MISSION_NOVELTY_CORE_END */

/* YK_PROJECT_NOVELTY_CORE_START
 * Altas del censo: el cursor ordena, pero sólo events[].project_id cuenta.
 * Así huecos AUTOINCREMENT, ediciones, reordenados y bajas no crean novedad. */
(function(root){
  "use strict";
  var KEY="yk_project_novelty_v1";
  function number(value){if(value==null||value==="")return null;var n=Number(value);return Number.isFinite(n)&&n>=0?Math.floor(n):null;}
  function clean(value){return String(value==null?"":value).trim();}
  function uniq(values){var seen={},out=[];(values||[]).forEach(function(value){value=clean(value);if(value&&!seen[value]){seen[value]=true;out.push(value);}});return out;}
  function union(a,b){return uniq((a||[]).concat(b||[]));}
  function meta(payload){
    var p=payload||{},projects=Array.isArray(p.projects)?p.projects:[],selectable=projects.filter(function(project){return project&&project.id&&String(project.status||"activo").toLowerCase()!=="archivado";});
    var events=(Array.isArray(p.events)?p.events:[]).map(function(event){return {cursor:number(event&&event.cursor),project_id:clean(event&&(event.project_id||event.id)),created_at:number(event&&event.created_at)};}).filter(function(event){return event.cursor!=null&&event.project_id;});
    events.sort(function(a,b){return b.cursor-a.cursor;});
    var total=number(p.total);return {cursor:number(p.created_cursor),newest_id:clean(p.newest_id||(events[0]&&events[0].project_id)),latest_created_at:number(p.latest_created_at),events:events.slice(0,20),all_ids:uniq(projects.map(function(project){return project&&project.id;})),selectable_ids:uniq(selectable.map(function(project){return project.id;})),total:total==null?selectable.length:total};
  }
  function initial(){return {version:1,initialized:false,seen_cursor:null,observed_cursor:null,known_ids:[],acked_keys:[],unread:[],newest_id:"",latest_created_at:null};}
  function record(value){var cursor=number(value&&value.cursor),id=clean(value&&value.project_id),key=clean(value&&value.key);if(!id)return null;return {key:key||(cursor==null?"i:"+id:"c:"+cursor),project_id:id,cursor:cursor};}
  function records(values){var seen={},out=[];(values||[]).forEach(function(value){var row=record(value);if(row&&!seen[row.key]){seen[row.key]=true;out.push(row);}});return out;}
  function normalize(value){var out=initial(),v=value&&typeof value==="object"?value:{};out.initialized=!!v.initialized;out.seen_cursor=number(v.seen_cursor);out.observed_cursor=number(v.observed_cursor);out.known_ids=uniq(v.known_ids);out.acked_keys=uniq(v.acked_keys);out.unread=records(v.unread);out.newest_id=clean(v.newest_id);out.latest_created_at=number(v.latest_created_at);return out;}
  function create(options){
    options=options||{};var storage=options.storage||null,publish=typeof options.publish==="function"?options.publish:function(){};
    function read(){try{return normalize(JSON.parse(storage&&storage.getItem(KEY)||"null"));}catch(_){return initial();}}
    var state=read();
    function snapshot(){return JSON.parse(JSON.stringify(state));}
    function write(broadcast){try{if(storage)storage.setItem(KEY,JSON.stringify(state));}catch(_){}if(broadcast!==false)publish(snapshot());}
    function unreadIds(){return uniq(state.unread.map(function(row){return row.project_id;}));}
    function add(row){row=record(row);if(!row||state.acked_keys.indexOf(row.key)>=0||state.unread.some(function(old){return old.key===row.key;}))return false;state.unread.push(row);return true;}
    function observe(payload){
      var m=meta(payload),before=unreadIds().length,was=JSON.stringify(state),first=!state.initialized,selectable={},stale=m.cursor!=null&&state.observed_cursor!=null&&m.cursor<state.observed_cursor;m.selectable_ids.forEach(function(id){selectable[id]=true;});
      if(first){state.initialized=true;state.observed_cursor=m.cursor;state.seen_cursor=m.cursor;}
      else if(m.cursor!=null&&state.observed_cursor==null){state.observed_cursor=m.cursor;state.seen_cursor=m.cursor;}
      else if(m.cursor!=null&&m.cursor>state.observed_cursor){
        m.events.forEach(function(event){if((state.seen_cursor==null||event.cursor>state.seen_cursor)&&selectable[event.project_id])add({key:"c:"+event.cursor,project_id:event.project_id,cursor:event.cursor});});
        // Si el salto supera la ventana de 20 eventos, los ids realmente nuevos
        // del catálogo completan la señal sin convertir el total en heurística.
        m.selectable_ids.forEach(function(id){if(state.known_ids.indexOf(id)<0&&!state.unread.some(function(row){return row.project_id===id;}))add({key:"i:"+id,project_id:id,cursor:null});});
        state.observed_cursor=m.cursor;
      }else if(m.cursor==null&&!first){
        // Rollout sin metadatos: sólo un id jamás visto es alta probable. Cambiar
        // nombre/orden/estado o reducir el total no produce ninguna señal.
        m.selectable_ids.forEach(function(id){if(state.known_ids.indexOf(id)<0)add({key:"i:"+id,project_id:id,cursor:null});});
      }
      state.known_ids=union(state.known_ids,m.all_ids);if(!stale)state.unread=state.unread.filter(function(row){return selectable[row.project_id]&&state.acked_keys.indexOf(row.key)<0;});
      if(m.newest_id)state.newest_id=m.newest_id;if(m.latest_created_at!=null&&(!state.latest_created_at||m.latest_created_at>state.latest_created_at))state.latest_created_at=m.latest_created_at;
      if(JSON.stringify(state)!==was)write(true);
      return {first:first,added:Math.max(0,unreadIds().length-before),unread_ids:unreadIds(),state:snapshot(),meta:m};
    }
    function ack(ids){var wanted={};uniq(ids).forEach(function(id){wanted[id]=true;});var was=JSON.stringify(state),kept=[];state.unread.forEach(function(row){if(wanted[row.project_id])state.acked_keys=union(state.acked_keys,[row.key]);else kept.push(row);});state.unread=kept;if(!state.unread.length&&state.observed_cursor!=null)state.seen_cursor=Math.max(state.seen_cursor==null?0:state.seen_cursor,state.observed_cursor);if(JSON.stringify(state)!==was)write(true);return snapshot();}
    function sync(value){
      var incoming;try{incoming=normalize(typeof value==="string"?JSON.parse(value||"null"):value);}catch(_){return snapshot();}
      var was=JSON.stringify(state),seen=Math.max(state.seen_cursor==null?-1:state.seen_cursor,incoming.seen_cursor==null?-1:incoming.seen_cursor),observed=Math.max(state.observed_cursor==null?-1:state.observed_cursor,incoming.observed_cursor==null?-1:incoming.observed_cursor);
      state.initialized=state.initialized||incoming.initialized;state.known_ids=union(state.known_ids,incoming.known_ids);state.acked_keys=union(state.acked_keys,incoming.acked_keys);state.unread=records(state.unread.concat(incoming.unread)).filter(function(row){return state.acked_keys.indexOf(row.key)<0&&(row.cursor==null||seen<0||row.cursor>seen);});state.seen_cursor=seen<0?null:seen;state.observed_cursor=observed<0?null:observed;
      if(incoming.latest_created_at!=null&&(!state.latest_created_at||incoming.latest_created_at>state.latest_created_at)){state.latest_created_at=incoming.latest_created_at;state.newest_id=incoming.newest_id||state.newest_id;}
      if(JSON.stringify(state)!==was)write(false);return snapshot();
    }
    return {observe:observe,ack:ack,sync:sync,snapshot:snapshot,unreadIds:unreadIds,key:KEY,meta:meta};
  }
  root.YkProjectNovelty={create:create,meta:meta,key:KEY,_test:{normalize:normalize}};
})(typeof window!=="undefined"?window:globalThis);
/* YK_PROJECT_NOVELTY_CORE_END */

/* ============================================================================
 * yk-frame.js — Marco CUADRÁTICO de AdmiraNeXT para el perímetro de Yokup.
 * Script CLÁSICO (sin módulos). Se inicializa tras DOMContentLoaded.
 *
 * yk-frame v3 (2026-07-12, canon precisado por Carlos):
 *   · Construye la BARRA SUPERIOR REAL (.yk-bar) como entidad propia del sitio,
 *     fixed y de ancho completo:
 *       [icono OPCIONES] · logotipo YO KUP (→ /) · rótulo de la página ·
 *       referencias de la home · FLOTA admira.tv + reloj ·
 *       [icono AVANZADO] [icono EXPERTO]
 *   · Los tres paneles OVERLAY nacen bajo la barra (top: alto de la barra) y NO
 *     encogen el contenido: flotan encima. La esquina inf-dcha queda para el avatar.
 *   · Los ICONOS viven DENTRO de la barra y NO se mueven: toggle + Escape, con
 *     estado encendido (aria-pressed) cuando su panel está abierto.
 *   · El reloj lo pinta la barra (intervalo propio); las páginas ya no lo llevan.
 *
 * Mecánica de slots: MUEVE (no clona, para preservar los handlers ya enlazados
 * por la página) los nodos [data-yk-slot="left|right|bottom"] al panel
 * correspondiente. Si un slot no tiene nodos, muestra «— sin opciones».
 *
 * Estado abierto/plegado por panel en localStorage. NO toca acceso.js ni
 * avatar-widget.js.
 * ==========================================================================*/
(function () {
  "use strict";

  // DOMINIO PROPIO (23-jul-2026, DEC-mrxsvdx1glyx): api.yokup.com sobre la zona
  // yokup.com (ya en Cloudflare) cura el bloqueo de *.workers.dev por ISPs
  // españoles (188.114.96.0/22), que silenciaba contadores e ideas según la red.
  // WORKER_FALLBACK es un SEGUNDO dominio propio, rtc.yokup.com (28-jul-2026): si el
  // primario falla en una red rara, se reintenta UNA vez contra él. Antes apuntaba a
  // workers.dev, que devolvía 404 (quedó workers_dev=false al migrar) y además está en
  // el rango bloqueado: el respaldo no respaldaba nada.
  var WORKER = "https://api.yokup.com";
  var WORKER_FALLBACK = "https://rtc.yokup.com";
  // Sello del deploy, capturado mientras este script sigue siendo currentScript.
  // deploy.mjs versiona cada referencia /yk-frame.js?v=<sello>; version.json es
  // la confirmación pública. Nunca debe volver a vivir aquí una fecha manual.
  var FRAME_SRC = (document.currentScript && document.currentScript.src) || "";
  var VERSION = (function () {
    try { return new URL(FRAME_SRC, location.href).searchParams.get("v") || "versión pendiente"; }
    catch (e) { return "versión pendiente"; }
  })();

  // fetch con red de seguridad: intenta api.yokup.com y, si el fetch RECHAZA
  // (fallo de red/DNS/bloqueo, no un 4xx/5xx que sí llega), reintenta una vez
  // contra el host de respaldo (rtc.yokup.com). Solo se usa en los puntos críticos
  // (contadores del menú); el resto llama a WORKER directo.
  function ykFetch(path, opts) {
    return window.fetch(WORKER + path, opts).catch(function () {
      return window.fetch(WORKER_FALLBACK + path, opts);
    });
  }
  window.ykFetch = ykFetch;   // disponible para las páginas (ideas/objetivos)
  var LS = "yk_frame_open_";  // + panel  -> "1" | "0"

  // NAV DE PLATAFORMA — fuente ÚNICA del menú tras la DMZ (zona app). Las
  // páginas de plataforma declaran <body data-yk-zone="app"> y nada más: los
  // items y el activo (deducido del pathname) salen de aquí, idénticos en
  // todas — no pueden divergir. Solo las intros/homes públicas llevan menú
  // propio (data-yk-nav o el NAV global de abajo).
  // EQUIPO y STATUS salieron del menú superior (Carlos, 2026-07-23): son
  // navegación de gestión, no del flujo de trabajo → viven ahora en el raíl
  // OPCIONES (ver buildRailFoot), encima de «Panel de control».
  var APP_NAV = [
    ["DASHBOARD",   "/dashboard"],
    ["OBJETIVOS",   "/objetivos"],
    ["DECISIONES",  "/decisiones"],
    ["MISIONES",    "/misiones"],
    ["TAREAS",      "/tareas"],
    ["INCIDENCIAS", "/incidencias"],
    ["INFORMES",    "/informes"],
    // FLT-1020: un diálogo del sistema en cualquier equipo lo deja PARADO. Va en la
    // barra para que se vea desde cualquier página, no sólo si entras a buscarlo.
    ["NOTIFICACIONES", "/notificaciones"]
  ];

  // Secciones con CONTADOR real «curso/pend» en la barra (Carlos, 2026-07-23):
  // label → clave del agregado GET /menu/contadores. DASHBOARD y DECISIONES no
  // llevan contador. curso = en ello ahora; pend = esperando.
  var COUNTER_KEY = {
    OBJETIVOS: "objetivos", MISIONES: "misiones", TAREAS: "tareas",
    INCIDENCIAS: "incidencias", INFORMES: "informes", NOTIFICACIONES: "notificaciones"
  };

  // Scope global de proyecto (FLT-1218). Sin selección válida empieza en Todos.
  // Una elección explícita viaja por query + storage versionado; ambos guardan sólo
  // el `id` canónico del censo, nunca nombres, dominios o inferencias por pathname.
  var PROJECT_SCOPE_KEY = "yokup.project.scope.v1";
  var PROJECT_SCOPE = null, PROJECT_CATALOG = [];
  function projectScopeMatch(row, projectId) {
    return projectId == null || String(row && (row.project_id || row.project) || "") === String(projectId);
  }
  function resolveProjectScope(queryId, storedId, catalog) {
    var ids = (catalog || []).filter(function (p) {
      return p && p.id && String(p.status || "activo").toLowerCase() !== "archivado";
    }).map(function (p) { return p.id; });
    var query = String(queryId || "").trim(), stored = String(storedId || "").trim();
    return ids.indexOf(query) >= 0 ? query : (ids.indexOf(stored) >= 0 ? stored : null);
  }
  window.YkProjectScope = {
    get: function () { return PROJECT_SCOPE; },
    matches: projectScopeMatch,
    catalog: function () { return PROJECT_CATALOG.slice(); },
    _test: {resolve:resolveProjectScope}
  };
  function projectHost(project) {
    var raw = String(project && project.web || "").trim();
    if (!raw) return "";
    try { return new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw).hostname.replace(/^www\./i, ""); }
    catch (e) { return ""; }
  }

  // Referencias de la home (los 4 primeros son anclas de la landing)
  var NAV = [
    ["Plataforma",   "/#plataforma"],
    ["Agentes IoT",  "/#como"],
    ["as a Service", "/#xaas"],
    ["Equipo",       "/#equipo"],
    ["Incidencias",  "/incidencias"],
    ["admira.live",  "/admira-live"],
    ["Asistencia",   "/asistencia"],
    ["App",          "/app"]
  ];

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[<>&"]/g, function (c) {
      return {"<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;"}[c];
    });
  }

  // CONTADOR «curso/pend» de una sección: span vacío con data-yk-count=<clave>
  // que rellena paintCounters tras el fetch. aria-hidden: el número es señal
  // visual y no debe leerse pegado al rótulo; el enlace ya se anuncia solo.
  function counterSpan(label, cls) {
    // DECISIONES no lleva «curso/pend» sino CUENTA ATRÁS: span data-yk-countdown que
    // sólo se rellena si hay un reloj de decisión vivo (deadline futuro). Ver paintDecisiones.
    if (label === "DECISIONES") {
      var d = el("span", cls);
      d.setAttribute("data-yk-countdown", "1");
      d.setAttribute("aria-hidden", "true");
      return d;
    }
    var key = COUNTER_KEY[label];
    if (!key) return null;
    var s = el("span", cls);
    s.setAttribute("data-yk-count", key);
    s.setAttribute("aria-hidden", "true");
    return s;
  }

  // LOS NÚMEROS SALEN DEL MENÚ (Carlos, 2026-08-05). Desde que el hover enseña el
  // detalle, la cifra permanente bajo cada rótulo era ruido: siete pares de
  // números compitiendo por la atención para decir lo que ya se lee al pasar por
  // encima. Queda la LUZ —que es lo que se busca de un vistazo— y la tarjeta.
  // paintCounters sigue existiendo porque el título accesible y la alarma de
  // NOTIFICACIONES sí dependen del dato; lo que ya no escribe es el texto.
  function paintCounters(data) {
    var spans = document.querySelectorAll("[data-yk-count]");
    Array.prototype.forEach.call(spans, function (s) {
      var k = s.getAttribute("data-yk-count");
      var d = data && data[k];
      if (!d) { s.textContent = ""; return; }
      // INFORMES no es «curso/pend»: un informe no tiene estado, o está o no está
      // (Carlos, 24-jul-2026). Aquí el par es COBERTURA — de las misiones ya
      // terminadas, cuántas tienen su parte. Iguales = al día; si no, hay deuda.
      // NOTIFICACIONES: sólo lo abierto, y en rojo. No es un ritmo de trabajo —
      // es un equipo PARADO esperando a que alguien pulse un botón (FLT-1020).
      if (k === "notificaciones") {
        var ab = d.abiertas | 0;
        // La alarma no lleva número pero SÍ conserva su rojo: un equipo parado
        // no es una novedad más, y perder esa distinción sería perder la única
        // señal de la barra que pide ir AHORA.
        s.textContent = "";
        if (!ab) { s.removeAttribute("title"); s.classList.remove("yk-count-alarma"); return; }
        s.setAttribute("title", ab === 1 ? "1 equipo parado por un diálogo del sistema" : ab + " equipos parados por un diálogo del sistema");
        s.classList.add("yk-count-alarma");
        return;
      }
      if (k === "informes") {
        var hechos = d.hechos | 0, total = d.total | 0, faltan = total - hechos;
        s.textContent = "";
        if (!total) { s.removeAttribute("title"); s.classList.remove("yk-count-debe"); return; }
        s.setAttribute("title", faltan
          ? hechos + " de " + total + " misiones terminadas tienen su informe · faltan " + faltan
          : "las " + total + " misiones terminadas tienen su informe");
        s.classList.toggle("yk-count-debe", faltan > 0);
        return;
      }
      var curso = d.curso | 0, pend = d.pend | 0;
      // 0/0 → nada (Carlos, 2026-07-23): sección vacía enseña sólo su rótulo limpio.
      s.textContent = "";
      if (curso + pend === 0) { s.removeAttribute("title"); return; }
      s.setAttribute("title", curso + " en curso · " + pend + " pendientes");
    });
  }

  // DECISIONES: cuenta atrás ⏳ m:ss hacia el deadline VIVO más próximo. El tic-tac
  // es LOCAL (setInterval 1s): un solo fetch por carga basta; al llegar a 0 se oculta
  // sola sin recargar. Sin reloj vivo (deadline nulo o pasado) → DECISIONES limpia.
  var _cdTimer = 0;
  function paintDecisiones(data) {
    var span = document.querySelector("[data-yk-countdown]");
    if (!span) return;
    if (_cdTimer) { window.clearInterval(_cdTimer); _cdTimer = 0; }
    var dl = data && data.decisiones && data.decisiones.deadline;
    if (!dl || !(dl > Date.now())) { span.textContent = ""; span.removeAttribute("title"); return; }
    function tick() {
      var ms = dl - Date.now();
      if (ms <= 0) {
        span.textContent = ""; span.removeAttribute("title");
        if (_cdTimer) { window.clearInterval(_cdTimer); _cdTimer = 0; }
        return;
      }
      var s = Math.ceil(ms / 1000), m = Math.floor(s / 60), ss = s % 60;
      var t = m + ":" + (ss < 10 ? "0" + ss : ss);
      span.textContent = "";   // sin número: la novedad se ve por la luz
      span.setAttribute("title", "Decisi\xF3n pendiente \xB7 cierra en " + t);
    }
    tick();
    _cdTimer = window.setInterval(tick, 1000);
  }

  // ==================== REFERENCIA LUMÍNICA DE LA BARRA =====================
  // Carlos, 2026-08-05: la barra es el nexo de todos los proyectos, así que
  // tiene que decir DÓNDE está pasando algo sin pulsar nada. Dos señales:
  //   1) el rótulo se ENCIENDE cuando hay novedad desde la última vez que
  //      pasaste por esa sección (una ventana de decisión nueva, una misión
  //      que se ha partido en tareas, un informe que ha cerrado el ciclo…);
  //   2) al ponerte ENCIMA sale el detalle de esos números, sin navegar.
  // Todo vive en el cliente sobre el MISMO /menu/contadores que ya se pedía: ni
  // un fetch más, ni un endpoint nuevo que desplegar.
  var SEEN_LS = "yk_nav_seen";
  var MISSION_ANNOUNCED_SS = "yk_nav_missions_announced_v2";
  var _missionChannel = null, _pendingMissionRender = null;
  try { if (typeof window.BroadcastChannel === "function") _missionChannel = new window.BroadcastChannel("yokup-nav-missions-v2"); } catch (e) {}
  var _missionNovelty = window.YkMissionNovelty.create({
    storage:window.localStorage,
    publish:function (state) { try { if (_missionChannel) _missionChannel.postMessage({ type:"mission-novelty", state:state }); } catch (e) {} }
  });

  function paintMissionNoveltyLink() {
    var a=document.querySelector('.yk-nav a[data-yk-sec="MISIONES"]');if(!a)return;
    var state=_missionNovelty.snapshot(),unread=state.unread|0;
    a.classList.toggle("yk-nuevo",unread>0);
    if(unread){a.setAttribute("data-yk-delta","+"+unread);if(state.newest_id)a.setAttribute("data-yk-newest",state.newest_id);a.setAttribute("aria-label","MISIONES, "+unread+(unread===1?" nueva":" nuevas"));}
    else{a.removeAttribute("data-yk-delta");a.removeAttribute("data-yk-newest");a.setAttribute("aria-label","MISIONES");}
    if(_popFor==="MISIONES"&&_lastCounters)paintPop(a,"MISIONES",_lastCounters);
  }
  function announceMissionNovelty(result) {
    if(!result||!result.added)return;
    var state=result.state,token=String(state.observed_cursor==null?(state.newest_id+":"+state.latest_created_at):state.observed_cursor),last="";
    try{last=window.sessionStorage.getItem(MISSION_ANNOUNCED_SS)||"";}catch(e){}
    if(token&&token===last)return;
    var live=document.getElementById("yk-nav-mission-live");
    if(!live){live=el("div","yk-nav-live");live.id="yk-nav-mission-live";live.setAttribute("role","status");live.setAttribute("aria-live","polite");live.setAttribute("aria-atomic","true");document.body.appendChild(live);}
    live.textContent=state.unread===1?("Nueva misión"+(state.newest_id?" "+state.newest_id:"")):state.unread+" misiones nuevas";
    try{window.sessionStorage.setItem(MISSION_ANNOUNCED_SS,token);}catch(e){}
  }
  function canAckMissionRender(state,ids){
    if(!state.unread)return true;
    ids=Array.isArray(ids)?ids.map(String):[];
    if(state.newest_id)return ids.indexOf(String(state.newest_id))>=0;
    var eventIds=(state.events||[]).map(function(event){return String(event.mission_id||"");}).filter(Boolean);
    return eventIds.length?eventIds.every(function(id){return ids.indexOf(id)>=0;}):ids.length>0;
  }
  function consumeRenderedMissions(data){
    if(_pendingMissionRender==null)return false;
    var state=_missionNovelty.snapshot(),ids=_pendingMissionRender;_pendingMissionRender=null;
    if(!canAckMissionRender(state,ids))return false;
    _missionNovelty.ack(data&&data.misiones||{});paintMissionNoveltyLink();return true;
  }
  function receiveMissionState(value){try{_missionNovelty.sync(value);paintMissionNoveltyLink();}catch(e){}}
  window.addEventListener("storage",function(event){if(event&&event.key===_missionNovelty.key&&event.newValue)receiveMissionState(event.newValue);});
  if(_missionChannel)_missionChannel.onmessage=function(event){var data=event&&event.data;if(data&&data.type==="mission-novelty")receiveMissionState(data.state);};
  window.addEventListener("yk:missions-rendered",function(event){_pendingMissionRender=event&&event.detail&&Array.isArray(event.detail.ids)?event.detail.ids:[];fetchCounters();});
  if(Array.isArray(window.__ykMissionsRenderedIds))_pendingMissionRender=window.__ykMissionsRenderedIds.slice();

  function seenRead() {
    try { return JSON.parse(window.localStorage.getItem(SEEN_LS) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function seenWrite(m) {
    try { window.localStorage.setItem(SEEN_LS, JSON.stringify(m)); } catch (e) {}
  }

  // Estado de una sección a partir del agregado: `n` es la magnitud que crece
  // cuando llega trabajo nuevo (es lo que dispara la luz), `sig` distingue dos
  // estados con la misma magnitud (p.ej. un reloj que cierra y otro que abre en
  // el mismo sondeo), y `rows` es lo que se lee en la tarjeta del hover.
  function sectionState(data, label) {
    if (!data) return null;
    if (label === "DECISIONES") {
      var dd = data.decisiones || {}, vivas = dd.vivas | 0, dl = dd.deadline || 0;
      var dia = dd.dia | 0, hora = dd.hora | 0;
      // «total día» y «total hora» sin repetir «ventanas» (Carlos, 2026-08-05):
      // en la tarjeta de DECISIONES se sobreentiende, y así cabe en una línea.
      var filas = [["relojes vivos", vivas, vivas ? "" : ""]];
      if (vivas) filas.push(["cierra", dl > Date.now() ? cdText(dl) : "—", ""]);
      filas.push(["total hora", hora, ""], ["total día", dia, ""]);
      return {
        n: vivas, sig: vivas + ":" + dl + ":" + dia,
        rows: filas,
        foot: vivas ? "Una ventana abierta espera tu elección."
          : (hora ? "Ninguna pendiente ahora; la flota ya preguntó esta hora."
                  : "Ninguna decisión pendiente.")
      };
    }
    if(label==="MISIONES"){
      var md=data.misiones||{},mc=md.curso|0,mp=md.pend|0,mn=md.no_concluidas|0,
          mu=md.sin_asignar|0,ms=_missionNovelty.snapshot(),mr=[];
      if(ms.unread)mr.push(["nuevas",ms.unread,"nuevo"]);
      mr.push(["en curso",mc,""],["pendientes",mp,""],["no concluidas",mn,""],["sin asignar",mu,""]);
      return {n:mc+mp+mn+mu,sig:String(md.created_cursor==null?(mc+"/"+mp+"/"+mn+"/"+mu):md.created_cursor),rows:mr,
        foot:(ms.unread?(ms.newest_id?("La misión "+ms.newest_id+" es nueva. "):"Hay misiones nuevas desde tu última visita. "):"")+"Resumen global · todo el backlog · todas las fechas y proyectos."};
    }
    var key = COUNTER_KEY[label], d = key && data[key];
    if (!d) return null;
    if (key === "notificaciones") {
      var ab = d.abiertas | 0;
      return {
        n: ab, sig: "n:" + ab,
        rows: [["equipos parados", ab, ab ? "alarma" : ""]],
        foot: ab ? "Un diálogo del sistema tiene el equipo detenido." : "Ningún equipo bloqueado."
      };
    }
    if (key === "informes") {
      var he = d.hechos | 0, to = d.total | 0, fa = to - he;
      return {
        n: he, sig: he + "/" + to,
        rows: [["con informe", he, ""], ["misiones cerradas", to, ""],
               ["faltan", fa, fa > 0 ? "debe" : ""]],
        foot: fa > 0 ? "Hay misiones terminadas sin su parte." : "Todo el ciclo cerrado con informe."
      };
    }
    var cu = d.curso | 0, pe = d.pend | 0;
    return {
      n: cu + pe, sig: cu + "/" + pe,
      rows: [["en curso", cu, ""], ["pendientes", pe, ""]],
      foot: ""
    };
  }

  function cdText(dl) {
    var s = Math.max(0, Math.ceil((dl - Date.now()) / 1000));
    return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
  }

  // Enciende/apaga los rótulos comparando contra lo último visto. La sección en
  // la que ESTÁS nunca se enciende: estás mirándola, ya no es novedad.
  function markNovelties(data) {
    var links = document.querySelectorAll(".yk-nav a[data-yk-sec]");
    if (!links.length) return;
    var missionResult=_missionNovelty.observe(data&&data.misiones||{});
    var missionConsumed=consumeRenderedMissions(data);
    if(!missionConsumed)announceMissionNovelty(missionResult);
    var seen = seenRead(), primeraVez = !Object.keys(seen).length, dirty = false;
    Array.prototype.forEach.call(links, function (a) {
      var label = a.getAttribute("data-yk-sec");
      var st = sectionState(data, label);
      if (!st) return;
      if(label==="MISIONES"){
        paintMissionNoveltyLink();
        if(_popFor===label)paintPop(a,label,data);
        return;
      }
      var prev = seen[label];
      // Primera carga del navegador: se toma nota en silencio. Si no, la barra
      // entera se encendería de golpe y la señal no valdría nada.
      var nuevo = !primeraVez && prev
        ? (st.n > (prev.n | 0)) || (label === "DECISIONES" && st.n > 0 && st.sig !== prev.sig)
        : false;
      if (a.classList.contains("on")) nuevo = false;   // la sección abierta se lee como vista
      if (nuevo) {
        a.classList.add("yk-nuevo");
        a.setAttribute("data-yk-delta", "+" + (st.n - (prev.n | 0)));
        // Con el rótulo encendido NO se reanota: el punto de partida sigue
        // siendo la última visita de verdad, así el delta de la tarjeta no se
        // va a cero solo porque hayan entrado más cosas mientras no mirabas.
      } else {
        a.classList.remove("yk-nuevo");
        a.removeAttribute("data-yk-delta");
        if (!prev || prev.n !== st.n || prev.sig !== st.sig) {
          seen[label] = { n: st.n, sig: st.sig }; dirty = true;
        }
      }
      if (_popFor === label) paintPop(a, label, data);   // tarjeta abierta: refréscala
    });
    if (dirty || primeraVez) seenWrite(seen);
  }

  // Apaga una sección: se consume la novedad al entrar en ella.
  function consumeSection(label) {
    if (!label || !_lastCounters) return;
    var st = sectionState(_lastCounters, label);
    if (!st) return;
    var seen = seenRead();
    seen[label] = { n: st.n, sig: st.sig };
    seenWrite(seen);
    var a = document.querySelector('.yk-nav a[data-yk-sec="' + label + '"]');
    if (a) { a.classList.remove("yk-nuevo"); a.removeAttribute("data-yk-delta"); }
  }

  // --------- tarjeta de detalle (hover/foco). Una sola, se reposiciona. -----
  var _pop = null, _popFor = "", _lastCounters = null;

  function popEl() {
    if (_pop) return _pop;
    _pop = el("div", "yk-navpop");
    _pop.setAttribute("role", "tooltip");
    _pop.id = "yk-navpop";
    document.body.appendChild(_pop);
    return _pop;
  }

  function paintPop(a, label, data) {
    var st = sectionState(data, label);
    var p = popEl();
    if (!st) { hidePop(); return; }
    var html = '<div class="yk-pop-h">' + label + (label==="MISIONES"?" · TODO EL BACKLOG":"") + "</div>";
    st.rows.forEach(function (r) {
      html += '<div class="yk-pop-r ' + (r[2] || "") + '"><span>' + r[0] +
              "</span><b>" + r[1] + "</b></div>";
    });
    var delta = a.getAttribute("data-yk-delta");
    if(delta&&label==="MISIONES"){
      var dn=Math.max(0,parseInt(delta,10)||0),newest=a.getAttribute("data-yk-newest")||"";
      html+='<div class="yk-pop-n">▲ '+dn+(dn===1?" misión nueva":" misiones nuevas")+' desde tu última visita'+(newest?" · "+esc(newest):"")+"</div>";
    }else if(delta)html += '<div class="yk-pop-n">▲ ' + delta + " desde tu última visita</div>";
    if (st.foot) html += '<div class="yk-pop-f">' + esc(st.foot) + "</div>";
    p.innerHTML = html;
    // Anclada bajo el rótulo y recortada al viewport: la barra hace scroll
    // horizontal, así que el último ítem se saldría por la derecha.
    var r = a.getBoundingClientRect();
    p.style.top = Math.round(r.bottom + 7) + "px";
    p.style.left = "0px";
    var w = p.offsetWidth;
    var x = Math.round(r.left + r.width / 2 - w / 2);
    p.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + "px";
    p.classList.add("on");
    _popFor = label;
  }

  function hidePop() {
    if (!_pop) return;
    _pop.classList.remove("on");
    _popFor = "";
  }

  // El hover NO consume la novedad ni navega: sólo enseña. Todo lo demás sigue
  // exactamente igual, que es lo que pidió Carlos.
  function wireNavPop(a, label) {
    a.setAttribute("data-yk-sec", label);
    a.setAttribute("aria-describedby", "yk-navpop");
    function show() { if (_lastCounters) paintPop(a, label, _lastCounters); }
    a.addEventListener("mouseenter", show);
    a.addEventListener("focus", show);
    a.addEventListener("mouseleave", hidePop);
    a.addEventListener("blur", hidePop);
    // MISIONES sólo se consume DESPUÉS de que su tablero confirme el render.
    // Las demás secciones conservan el comportamiento histórico al navegar.
    a.addEventListener("click", function () { if(label!=="MISIONES")consumeSection(label); });
  }
  window.addEventListener("scroll", hidePop, true);
  window.addEventListener("resize", hidePop);

  // UN fetch por página al agregado del worker. Si falla, el menú se queda sin
  // contadores (degradación silenciosa: nada de toasts ni reintentos).
  function fetchCounters() {
    if (!document.querySelector("[data-yk-count],[data-yk-countdown]")) return Promise.resolve(false);
    return ykFetch("/menu/contadores", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) return false;
        _lastCounters = d;
        paintCounters(d); paintDecisiones(d); markNovelties(d);
        return true;
      })
      .catch(function () { return false; });
  }

  // Los contadores reflejan cambios locales sin esperar una recarga y también
  // se reconcilian con cambios realizados por otros agentes cada 12 segundos.
  window.addEventListener("yk:decisions-changed", fetchCounters);
  window.addEventListener("yk:work-changed", fetchCounters);
  window.setInterval(fetchCounters, 12000);

  // id del recurso en la URL (?id=…) para el EXPERTO de ficha
  function urlId() {
    try { return new URLSearchParams(location.search).get("id") || ""; } catch (e) { return ""; }
  }

  // rótulo de la página actual: data-yk-title del <body>, o derivado de la ruta
  function pageTitle() {
    var t = document.body.getAttribute("data-yk-title");
    if (t) return t;
    var seg = location.pathname.replace(/\/+$/, "").split("/").pop() || "";
    seg = seg.replace(/\.html$/, "").toLowerCase();
    var map = {
      incidencias: "INCIDENCIAS", ticket: "TICKET", agentes: "AGENTES",
      "admira-live": "ADMIRA.LIVE", misiones: "MISIONES", tareas: "TAREAS",
      decisiones: "DECISIONES", objetivos: "OBJETIVOS", ideas: "OBJETIVOS",
      dashboard: "DASHBOARD", informes: "INFORMES", status: "STATUS", equipo: "EQUIPO",
      asistencia: "ASISTENCIA", intervencion: "INTERVENCIÓN"
    };
    return map[seg] || "";
  }

  // menú de la barra: zona app (body[data-yk-zone="app"]) → APP_NAV único con
  // activo por pathname; si no, por página (body[data-yk-nav], JSON o lista
  // «Label:href|…»); sin nada, el menú global de la home.
  function pageNav() {
    if (document.body.getAttribute("data-yk-zone") === "app") {
      var path = (location.pathname.replace(/\/+$/, "") || "/").toLowerCase();
      return APP_NAV.map(function (r) {
        return { label: r[0], href: r[1], active: (path === r[1] || path === r[1] + ".html") };
      });
    }
    var raw = document.body.getAttribute("data-yk-nav");
    if (raw) {
      try {
        var j = JSON.parse(raw);
        if (Array.isArray(j) && j.length) {
          return j.map(function (it) {
            return Array.isArray(it) ? { label: it[0], href: it[1] } : it;
          });
        }
      } catch (e) {
        return raw.split("|").map(function (s) {
          var p = s.split(":");
          return { label: (p[0] || "").trim(), href: (p.slice(1).join(":") || "").trim() || null };
        }).filter(function (x) { return x.label; });
      }
    }
    return NAV.map(function (r) { return { label: r[0], href: r[1] }; });
  }

  function build() {
    if (document.getElementById("yk-frame")) return;
    document.documentElement.classList.add("yk-framed"); // aplica padding-top al body

    var root = el("div", "yk-frame");
    root.id = "yk-frame";

    // ------------------------- BARRA SUPERIOR ------------------------------
    var bar = el("header", "yk-bar");
    bar.setAttribute("role", "banner");

    // [icono OPCIONES] al extremo izquierdo
    var icoL = icon("yk-ico yk-ico-left", "left", "▤", "Opciones");

    // logotipo YO KUP (→ /)
    var logo = el("a", "yk-logo",
      '<span class="yk-dot" aria-hidden="true"></span>Yo<b>kup</b>');
    logo.href = "/";
    logo.setAttribute("aria-label", "Yokup · inicio");

    // menú de la barra (se calcula ya para deducir el ítem activo)
    var navItems = pageNav();
    var activeLbl = "";
    for (var _i = 0; _i < navItems.length; _i++) { if (navItems[_i].active) { activeLbl = navItems[_i].label; break; } }

    // rótulo de la página — se OCULTA si coincide con el ítem ACTIVO del menú, para
    // no duplicarlo (p.ej. «DASHBOARD DASHBOARD» en /dashboard). En páginas fuera del
    // menú (p.ej. /ticket → «TICKET») el rótulo sigue mostrándose.
    var pt = pageTitle();
    var page = el("span", "yk-page", pt);
    if (!pt || (activeLbl && pt === activeLbl)) page.style.display = "none";

    // menú de la barra: por página (body[data-yk-nav]) o el global por defecto
    var nav = el("nav", "yk-nav");
    nav.setAttribute("aria-label", "Secciones de Yokup");
    navItems.forEach(function (it) {
      var a = el("a", it.active ? "on" : null, it.label);
      a.href = it.href || "#";
      if (it.active) a.setAttribute("aria-current", "page");
      if (it.panel) {
        // MISIONES/TAREAS: abre/enfoca el raíl izquierdo/derecho en vez de navegar
        a.setAttribute("data-yk-open", it.panel);
        a.addEventListener("click", function (e) { e.preventDefault(); setOpen(it.panel, true); });
      }
      var c = counterSpan(it.label, "yk-nav-c");
      if (c) a.appendChild(c);
      // Sólo las secciones con cifras entran en la referencia lumínica;
      // DASHBOARD no cuenta nada, así que ni se enciende ni saca tarjeta.
      if (COUNTER_KEY[it.label] || it.label === "DECISIONES") wireNavPop(a, it.label);
      nav.appendChild(a);
    });

    // [PROYECTO ACTIVO ▾] — desplegable que absorbe el antiguo rótulo de flota
    var proj = buildProjMenu();

    // (el reloj de la barra se retiró — canon 2026-07-13, Carlos)

    // [icono AVANZADO] [icono EXPERTO] al extremo derecho
    var icoR = icon("yk-ico yk-ico-adv", "right", "◨", "Avanzado");
    var icoB = icon("yk-ico yk-ico-exp", "bottom", "▦", "Experto");

    bar.appendChild(icoL);
    bar.appendChild(logo);
    bar.appendChild(page);
    bar.appendChild(nav);
    bar.appendChild(proj);
    bar.appendChild(icoR);
    bar.appendChild(icoB);

    // ------------------------- PANELES (raíles) ----------------------------
    // Rótulos por página: <body data-yk-rail-left="…" data-yk-rail-right="…">.
    // Sin atributos, se mantiene el canon OPCIONES / AVANZADO (resto de páginas
    // intactas). En incidencias son MISIONES / TAREAS (modelo misiones·tareas).
    var railLeftLabel = document.body.getAttribute("data-yk-rail-left") || "OPCIONES";
    var railRightLabel = document.body.getAttribute("data-yk-rail-right") || "AVANZADO";

    var railL = el("aside", "yk-rail yk-rail-left");
    railL.appendChild(el("div", "yk-hd", railLeftLabel));
    // MÓVIL (≤520px): la barra esconde .yk-nav y las secciones quedaban
    // inalcanzables desde el teléfono (FLT-983). El MISMO menú, sin inventar
    // patrón nuevo, se replica dentro del cajón OPCIONES que ya existía; el CSS
    // solo lo muestra por debajo de 520px, así el escritorio no cambia.
    // Orden dentro del cajón: si la página NO trae panel de trabajo propio, las
    // secciones van delante (es lo único que hay). Si lo trae —misiones e
    // incidencias, que además rotulan el cajón MISIONES—, las secciones van
    // DETRÁS: medido a 320px, el bloque empujaba los filtros 387px hacia abajo y
    // obligaba a desplazar el cajón entero para llegar a ellos.
    var hasOwnPanel = !!document.querySelector('[data-yk-slot="left"]');
    var railNav = buildRailNav(navItems);
    if (!hasOwnPanel) railL.appendChild(railNav);
    var slotL = el("div", "yk-slot"); railL.appendChild(slotL);
    if (hasOwnPanel) railL.appendChild(railNav);
    // pie del raíl OPCIONES: AJUSTES + versión, abajo del todo (Carlos, 2026-07-19).
    // Vive en el marco, no en las páginas → idéntico en toda la zona-app.
    railL.appendChild(buildRailFoot());

    var railR = el("aside", "yk-rail yk-rail-right");
    railR.appendChild(el("div", "yk-hd", railRightLabel));
    // Navegación canónica de producto. Avanzado no puede quedar vacío en las
    // vistas sin herramientas propias: Highscore sigue siendo accesible desde
    // cualquier otra página de la zona app, sin duplicarse en su propia vista.
    railR.appendChild(buildAdvancedNav());
    var slotR = el("div", "yk-slot"); railR.appendChild(slotR);

    var railB = el("aside", "yk-rail yk-rail-bottom");
    var expert = el("div", "yk-expert");
    expert.appendChild(el("div", "yk-hd", "EXPERTO"));
    var slotB = el("div", "yk-slot"); expert.appendChild(slotB);
    railB.appendChild(expert);

    root.appendChild(bar);
    root.appendChild(railL); root.appendChild(railR); root.appendChild(railB);
    document.body.appendChild(root);

    // --- MOVER los nodos marcados a su slot ---
    fillSlot(slotL, "left");
    fillSlot(slotR, "right");
    fillSlot(slotB, "bottom", expert);

    // --- estado abierto/plegado por panel ---
    wire(icoL, "left");
    wire(icoR, "right");
    wire(icoB, "bottom");
    closeRailOnNavigation(railL, "left");
    closeRailOnNavigation(railR, "right");
    refreshPublicVersion();

    // --- cerrar cualquier panel abierto con Escape ---
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        ["left", "right", "bottom"].forEach(function (p) { if (isOpen(p)) setOpen(p, false); });
      }
    });

    // --- botones del EXPERTO (fetch al worker + volcado JSON) ---
    wireExpertFetch(root);

    // --- contadores reales «curso/pend» del menú (un fetch, degradación silenciosa) ---
    fetchCounters();
  }

  // Pie fijo del raíl OPCIONES: AJUSTES (plegado por defecto, contenido REAL de
  // la sesión de acceso.js) y la versión del perímetro debajo, abajo del todo.
  function buildRailFoot() {
    var foot = el("div", "yk-rail-foot");

    var set = el("div", "yk-set");
    var btn = el("button", "yk-set-btn",
      '<span aria-hidden="true">⚙</span> AJUSTES <span class="yk-set-cx" aria-hidden="true">▾</span>');
    btn.type = "button";
    btn.setAttribute("aria-expanded", "false");

    var body = el("div", "yk-set-body");
    var email = "";
    try { email = localStorage.getItem("yk_email") || ""; } catch (e) {}
    body.appendChild(el("div", "yk-set-row",
      '<span class="yk-set-k">Sesión</span><b class="yk-set-v" title="' + (email || "sesión local") + '">' +
      (email || "sesión local") + '</b>'));
    var out = el("button", "yk-set-out", "CERRAR SESIÓN");
    out.type = "button";
    out.addEventListener("click", function () {
      try { localStorage.removeItem("yk_session"); localStorage.removeItem("yk_email"); } catch (e) {}
      location.reload();
    });
    body.appendChild(out);

    // PERSONALIZACIÓN (Carlos, 2026-07-19): preferencias de las columnas del
    // perímetro. yk_pref_avatars → avatares de agente en las listas (def. ON);
    // lo leen yk-misiones.js y quien pinte agentes. Cambiar recarga la vista.
    body.appendChild(el("div", "yk-set-sec", "Personalización"));
    var avLbl = el("label", "yk-set-chk");
    var avChk = document.createElement("input");
    avChk.type = "checkbox";
    try { avChk.checked = localStorage.getItem("yk_pref_avatars") !== "0"; } catch (e) { avChk.checked = true; }
    avLbl.appendChild(avChk);
    avLbl.appendChild(el("span", null, "Avatares de agentes"));
    avChk.addEventListener("change", function () {
      try { localStorage.setItem("yk_pref_avatars", avChk.checked ? "1" : "0"); } catch (e) {}
      location.reload();
    });
    body.appendChild(avLbl);

    // PANEL DE CONTROL (Carlos, 2026-07-19): personalización de ordenadores y
    // agentes — icono o foto por cada uno, compartida en todo el perímetro
    // (prefs 'customize' del worker, escritura con sesión).
    var pcBtn = el("button", "yk-set-btn yk-pc-open",
      '<span aria-hidden="true">▣</span> PERSONALIZACIÓN');
    pcBtn.type = "button";
    pcBtn.addEventListener("click", function () { openPanelControl(); });
    body.appendChild(pcBtn);

    btn.addEventListener("click", function () {
      var open = !set.classList.contains("open");
      set.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    set.appendChild(btn);
    set.appendChild(body);

    foot.appendChild(set);
    // Alta rápida contra el censo canónico; disponible desde cualquier vista.
    var newProject = el("button", "yk-set-btn yk-project-new",
      '<span aria-hidden="true">＋</span> NUEVO PROYECTO');
    newProject.type = "button";
    newProject.addEventListener("click", openNewProject);
    foot.appendChild(newProject);
    // EQUIPO · STATUS (Carlos, 2026-07-23): salieron del menú SUPERIOR y viven
    // ahora aquí, en el raíl OPCIONES, como navegación de gestión. Orden del pie:
    // EQUIPO · STATUS · Panel de control · sello de versión.
    var _path = (location.pathname.replace(/\/+$/, "") || "/").toLowerCase();
    [["◫", "EQUIPO", "/equipo"], ["◈", "STATUS", "/status"]].forEach(function (r) {
      var on = (_path === r[2] || _path === r[2] + ".html");
      var a = el("a", "yk-set-btn" + (on ? " on" : ""),
        '<span aria-hidden="true">' + r[0] + '</span> ' + r[1]);
      a.href = r[2];
      if (on) a.setAttribute("aria-current", "page");
      foot.appendChild(a);
    });
    // PANEL DE CONTROL → /asignaciones (Carlos, 2026-07-23): entrada del cajón
    // OPCIONES, justo ENCIMA del sello de versión. La personalización de flota
    // (antes «Panel de control») vive ahora dentro de AJUSTES como «Personalización».
    var pc = el("a", "yk-set-btn",
      '<span aria-hidden="true">▣</span> Panel de control');
    pc.href = "/asignaciones";
    foot.appendChild(pc);
    var ver = el("div", "yk-ver",
      'yokup · perímetro de seguridad · <b>' + VERSION + '</b>');
    ver.setAttribute("data-yk-version", "1");
    foot.appendChild(ver);
    return foot;
  }

  function buildAdvancedNav() {
    var nav = el("nav", "yk-adv-nav");
    nav.setAttribute("aria-label", "Herramientas avanzadas de Yokup");
    var path = (location.pathname.replace(/\/+$/, "") || "/").toLowerCase();
    var active = path === "/highscore" || path === "/highscore.html";
    // La página Highscore ya se identifica en el título del marco y en su H1:
    // repetirla dentro de Avanzado no es navegación. En el resto de vistas la
    // entrada conserva exactamente su posición canónica, antes de Normativa.
    if (!active) {
      var highscore = el("a", "yk-set-btn yk-adv-link",
        '<span aria-hidden="true">🏃</span> HIGHSCORE');
      highscore.href = "/highscore";
      nav.appendChild(highscore);
    }
    var normActive = path === "/normativa" || path === "/normativa.html";
    var normativa = el("a", "yk-set-btn yk-adv-link" + (normActive ? " on" : ""),
      '<span aria-hidden="true">§</span> NORMATIVA');
    normativa.href = "/normativa";
    if (normActive) normativa.setAttribute("aria-current", "page");
    nav.appendChild(normativa);
    return nav;
  }

  function projectField(label, name, type, placeholder) {
    var wrap = el("label", "yk-project-field");
    wrap.appendChild(el("span", null, label));
    var input = type === "textarea" ? document.createElement("textarea") : document.createElement("input");
    input.name = name;
    if (type !== "textarea") input.type = type || "text";
    if (name === "web") { input.inputMode = "url"; input.autocomplete = "url"; }
    if (placeholder) input.placeholder = placeholder;
    wrap.appendChild(input);
    return wrap;
  }

  function projectResponsibles(raw) {
    return String(raw || "").split(/\r?\n/).map(function (line) {
      var parts = line.split(/\s+\|\s+/);
      return { name:(parts.shift() || "").trim(), role:parts.join(" | ").trim() };
    }).filter(function (item) { return !!item.name; });
  }

  function normalizeProjectWeb(rawValue) {
    var raw = String(rawValue || "").trim();
    if (!raw) return "";
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw)) {
      throw new Error("la web debe empezar por http o https");
    }
    var candidate = /^https?:\/\//i.test(raw) ? raw : "https://" + raw;
    var parsed;
    try { parsed = new URL(candidate); }
    catch (e) { throw new Error("la web no es válida"); }
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error("la web debe ser una dirección http o https válida");
    }
    return candidate.replace(/\/+$/, "");
  }

  function openNewProject() {
    var modal = el("div", "yk-project-modal");
    var card = el("form", "yk-project-card");
    card.innerHTML = '<div class="yk-project-hd"><div><b>＋ NUEVO PROYECTO</b><small>Alta en el censo canónico de Yokup</small></div><button type="button" class="yk-project-x" aria-label="Cerrar">×</button></div>';
    card.appendChild(projectField("Nombre *", "name", "text", "Ej. Nueva plataforma"));
    card.appendChild(projectField("Web · opcional", "web", "text", "www.ejemplo.com"));
    card.appendChild(projectField("Descripción", "blurb", "textarea", "Qué hace y para quién"));
    card.appendChild(projectField("Responsables · uno por línea (Nombre | Rol)", "responsibles", "textarea", "Carlos | Dirección\nOráculo | Producto"));
    card.appendChild(projectField("Primera nota de seguimiento", "initial_note", "textarea", "Punto de partida, siguiente hito o decisión pendiente"));
    var foot = el("div", "yk-project-actions");
    var msg = el("span", "yk-project-msg", "El nombre es obligatorio");
    var cancel = el("button", "yk-project-cancel", "CANCELAR"); cancel.type = "button";
    var save = el("button", "yk-project-save", "DAR DE ALTA"); save.type = "submit";
    foot.appendChild(msg); foot.appendChild(cancel); foot.appendChild(save); card.appendChild(foot);
    modal.appendChild(card); document.body.appendChild(modal);
    var close = function () { modal.remove(); };
    card.querySelector(".yk-project-x").addEventListener("click", close);
    cancel.addEventListener("click", close);
    modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
    card.elements.web.addEventListener("blur", function () {
      if (!card.elements.web.value.trim()) return;
      try { card.elements.web.value = normalizeProjectWeb(card.elements.web.value); msg.textContent = "El nombre es obligatorio"; }
      catch (err) { msg.textContent = "✗ " + (err && err.message || err); }
    });
    card.addEventListener("submit", async function (e) {
      e.preventDefault();
      var name = card.elements.name.value.trim();
      if (!name) { msg.textContent = "Escribe el nombre del proyecto"; card.elements.name.focus(); return; }
      var web;
      try { web = normalizeProjectWeb(card.elements.web.value); }
      catch (err) { msg.textContent = "✗ " + (err && err.message || err); card.elements.web.focus(); return; }
      save.disabled = true; msg.textContent = "Guardando…";
      try {
        var r = await fetch("https://api.yokup.com/projects", { method:"POST", headers:{"content-type":"application/json"},
          body:JSON.stringify({ name:name, web:web, blurb:card.elements.blurb.value.trim(),
            responsibles:projectResponsibles(card.elements.responsibles.value), initial_note:card.elements.initial_note.value.trim(),
            note_author:"yokup·rail-opciones", status:"activo", by:"yokup·rail-opciones" }) });
        var d = await r.json().catch(function () { return {}; });
        if (!r.ok || !d.ok) throw new Error(d.error || ("HTTP " + r.status));
        msg.textContent = "✓ Proyecto creado";
        window.dispatchEvent(new CustomEvent("yk:projects-changed", { detail:d.project || null }));
        setTimeout(function () { close(); if (/\/equipo(?:\.html)?$/.test(location.pathname)) location.reload(); }, 650);
      } catch (err) {
        save.disabled = false; msg.textContent = "✗ " + (err && err.message || err);
      }
    });
    setTimeout(function () { card.elements.name.focus(); }, 0);
  }

  function paintPublicVersion(value) {
    var clean = String(value || "").trim();
    if (!clean) return;
    VERSION = clean;
    Array.prototype.forEach.call(document.querySelectorAll("[data-yk-version]"), function (node) {
      node.innerHTML = 'yokup · perímetro de seguridad · <b>' + VERSION + '</b>';
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-yk-deploy-version]"), function (node) {
      node.textContent = VERSION;
    });
  }

  // ── PESTAÑA CADUCA ────────────────────────────────────────────────────────
  // Una pestaña abierta desde antes de un deploy sigue REFRESCANDO SUS DATOS
  // (los sondeos al worker no paran) pero ejecuta el JavaScript de su carga: la
  // pantalla enseña cifras de hoy pintadas con código de ayer. Así reapareció el
  // «0 que late» en /highscore ya corregido en el servidor (Carlos, 2026-08-05).
  //
  // Y era peor: paintPublicVersion PISABA `VERSION` con el sello publicado, de
  // modo que la pestaña vieja presumía de estar al día mientras corría código
  // antiguo — justo lo contrario de lo que un sello sirve. Ahora el sello de la
  // COMPILACIÓN QUE CORRE (el ?v= con el que se cargó este fichero) es inmutable,
  // y cuando producción publica otro se avisa. No se recarga solo: puede haber
  // un filtro puesto o un formulario a medias; se ofrece y decide quien mira.
  var BUILD_VERSION = VERSION;
  var _stale = false;

  function marcaPestanaCaduca(publicada) {
    if (_stale) return;
    _stale = true;
    var bar = document.querySelector(".yk-bar");
    if (!bar) return;
    var b = el("button", "yk-stale",
      '<span aria-hidden="true">⟳</span> VERSIÓN NUEVA · RECARGAR');
    b.type = "button";
    b.title = "Esta pestaña ejecuta la versión " + BUILD_VERSION + " y en producción ya está la " +
              publicada + ". Los datos se refrescan, el código no: recarga para verlos bien.";
    b.setAttribute("aria-live", "polite");
    b.addEventListener("click", function () { location.reload(); });
    bar.appendChild(b);
  }

  function refreshPublicVersion() {
    // version.json se publica con max-age=0. El query evita intermediarios que
    // ignoren cache:no-store.
    window.fetch("/version.json?frame=" + Date.now(), { cache:"no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.version) return;
        paintPublicVersion(d.version);
        // «versión pendiente» = servido fuera del sellado (local, preview). Ahí
        // no hay nada que comparar y avisar sería un falso positivo.
        if (BUILD_VERSION && BUILD_VERSION !== "versión pendiente" &&
            String(d.version).trim() !== BUILD_VERSION) marcaPestanaCaduca(String(d.version).trim());
      })
      .catch(function () {});
  }
  // Cada 2 min basta: es una cortesía, no un latido. Y al volver a la pestaña,
  // que es justo cuando se mira una que llevaba horas abierta.
  window.setInterval(refreshPublicVersion, 120000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) refreshPublicVersion();
  });

  // ── PANEL DE CONTROL · personalización de ordenadores y agentes ────────────
  // Modal cuadrático: una fila por agente y por ordenador con su visual actual,
  // un emoji (icono) y una FOTO subible (POST /fleet/media → URL en R2). Todo se
  // guarda en UN doc {agents:{slug:{icon,img}}, machines:{slug:{icon,img}}} vía
  // /prefs/customize (GET abierto · POST con sesión del perímetro). Las listas
  // (yk-misiones) lo leen al cargar: la foto pisa al avatar de /avatars, el
  // icono pisa al emoji por defecto (👷 agente · 🖥 máquina).
  var PC_AGENTES = ["Neo", "Morfeo", "Trinity", "Oráculo", "Smith"];
  // espejo del canon MAQ_NOMBRE de yk-misiones.js (nombres de pantalla)
  var PC_MAQUINAS = ["MacBookPro14", "MacBookPro16", "MacBookAir16plata", "MacBookAirPlata",
    "MacBookAirAzul", "MacBookAirCrema", "MacBookAirRosa", "MacMini", "ASUS Zenbook", "DGX Spark", "ThinkStation PGX"];
  function pcSlug(n) {
    return String(n || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  function openPanelControl() {
    if (document.getElementById("yk-pc")) return;
    setOpen("left", false);   // el raíl fuera: el panel es un overlay enfocado
    var wrap = el("div", "yk-pc"); wrap.id = "yk-pc";
    var card = el("div", "yk-pc-card");
    card.appendChild(el("div", "yk-hd", "PANEL DE CONTROL · PERSONALIZACIÓN"));
    var bodyEl = el("div", "yk-pc-body", "Cargando personalización…");
    card.appendChild(bodyEl);
    var foot = el("div", "yk-pc-foot");
    var msg = el("span", "yk-pc-msg", "");
    var save = el("button", "yk-pc-save", "GUARDAR"); save.type = "button";
    var close = el("button", "yk-pc-close", "CERRAR"); close.type = "button";
    foot.appendChild(msg); foot.appendChild(save); foot.appendChild(close);
    card.appendChild(foot);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    function cerrar() {
      wrap.remove();
      document.removeEventListener("keydown", onEsc, true);
      document.removeEventListener("paste", onPaste);
    }
    function onEsc(e) { if (e.key === "Escape") { cerrar(); e.stopPropagation(); } }
    close.addEventListener("click", cerrar);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) cerrar(); });
    document.addEventListener("keydown", onEsc, true);

    var DATA = { agents: {}, machines: {} };
    function visual(kind, name) {
      var d = (DATA[kind] || {})[pcSlug(name)] || {};
      // la foto personalizada TAMBIÉN sondea: si su URL está rota (404, caída),
      // wireProbe la degrada al emoji con aviso — nunca el glifo de imagen rota.
      if (d.img) return '<img class="yk-pc-img yk-pc-probe" src="' + d.img + '" alt="">';
      if (d.icon) return '<span class="yk-pc-ico">' + d.icon + "</span>";
      // por defecto, SONDEO del avatar builtin (/avatars/<slug>.jpg): si el
      // fichero existe se ve (Trinity apareció así sin tocar listas); si 404,
      // wireProbe lo degrada al emoji canónico. Nada hardcodeado.
      if (kind === "agents") {
        return '<img class="yk-pc-img yk-pc-probe" src="/avatars/' + pcSlug(name) + '.jpg" alt="">';
      }
      return '<span class="yk-pc-ico dim">' + (kind === "agents" ? "👷" : "🖥") + "</span>";
    }
    function wireProbe(row, kind) {
      var p = row.querySelector(".yk-pc-probe");
      if (p) p.onerror = function () {
        this.outerHTML = '<span class="yk-pc-ico dim" title="foto rota o inaccesible — usa SIN FOTO para limpiarla">' +
          (kind === "agents" ? "👷" : "🖥") + "</span>";
      };
    }
    // Subida COMÚN de foto (selector, arrastre o pegado) → /fleet/media → URL.
    function subeFoto(f, kind, s, row, name) {
      if (!f || !/^image\//.test(f.type || "")) { msg.textContent = "Eso no es una imagen."; return; }
      msg.textContent = "Subiendo foto de " + name + "…";
      f.arrayBuffer().then(function (buf) {
        return window.fetch(WORKER + "/fleet/media", { method: "POST", headers: { "content-type": f.type || "image/jpeg" }, body: buf });
      }).then(function (r) { return r.json(); }).then(function (d2) {
        if (d2 && d2.url) { set(kind, s, "img", d2.url); refresh(row, kind, name); msg.textContent = "Foto de " + name + " lista — GUARDAR para fijarla."; }
        else msg.textContent = "No se pudo subir la foto.";
      }).catch(function () { msg.textContent = "No se pudo subir la foto."; });
    }
    var selRow = null;   // fila activa: destino del PEGADO (clic para elegirla)
    function fila(kind, name) {
      var s = pcSlug(name);
      var d = (DATA[kind] || {})[s] || {};
      var row = el("div", "yk-pc-row");
      row.innerHTML = '<span class="yk-pc-vis">' + visual(kind, name) + "</span>" +
        '<b class="yk-pc-nm">' + name + "</b>";
      wireProbe(row, kind);
      row.title = "clic: elegir fila (pegar con ⌘V) · también puedes ARRASTRAR una imagen aquí";
      var ico = document.createElement("input");
      ico.className = "yk-pc-icoin"; ico.maxLength = 4; ico.placeholder = "emoji";
      ico.value = d.icon || "";
      ico.addEventListener("input", function () { set(kind, s, "icon", ico.value.trim()); });
      var file = document.createElement("input");
      file.type = "file"; file.accept = "image/*"; file.style.display = "none";
      var fbtn = el("button", "yk-pc-foto", "FOTO…"); fbtn.type = "button";
      fbtn.title = "elegir fichero… o arrastra/pega una imagen sobre la fila";
      fbtn.addEventListener("click", function () { file.click(); });
      file.addEventListener("change", function () {
        subeFoto(file.files && file.files[0], kind, s, row, name);
      });
      var quitar = el("button", "yk-pc-quitar", "SIN FOTO"); quitar.type = "button";
      quitar.title = "quitar la foto personalizada";
      quitar.addEventListener("click", function () { set(kind, s, "img", ""); refresh(row, kind, name); });
      row.appendChild(ico); row.appendChild(fbtn); row.appendChild(file); row.appendChild(quitar);
      // FILA ACTIVA (destino del pegado): clic en cualquier hueco de la fila.
      row.addEventListener("click", function (e) {
        if (e.target.closest("button,input")) return;
        if (selRow) selRow.el.classList.remove("sel");
        selRow = { el: row, kind: kind, slug: s, name: name };
        row.classList.add("sel");
        msg.textContent = "Fila activa: " + name + " — pega una imagen (⌘V) o arrástrala encima.";
      });
      // ARRASTRAR Y SOLTAR: ficheros del Finder o imágenes arrastradas de una web.
      row.addEventListener("dragover", function (e) { e.preventDefault(); row.classList.add("drag"); });
      row.addEventListener("dragleave", function () { row.classList.remove("drag"); });
      row.addEventListener("drop", function (e) {
        e.preventDefault(); row.classList.remove("drag");
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) return subeFoto(f, kind, s, row, name);
        // imagen arrastrada desde otra web → llega como URL: se guarda directa
        var uri = e.dataTransfer && (e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain"));
        if (uri && /^https?:\/\//.test(uri.trim())) {
          set(kind, s, "img", uri.trim().split("\n")[0]);
          refresh(row, kind, name);
          msg.textContent = "Imagen de " + name + " enlazada — GUARDAR para fijarla.";
        }
      });
      return row;
    }
    function set(kind, slug, campo, valor) {
      DATA[kind] = DATA[kind] || {};
      DATA[kind][slug] = DATA[kind][slug] || {};
      if (valor) DATA[kind][slug][campo] = valor; else delete DATA[kind][slug][campo];
      if (!Object.keys(DATA[kind][slug]).length) delete DATA[kind][slug];
    }
    function refresh(row, kind, name) {
      var v = row.querySelector(".yk-pc-vis"); if (v) { v.innerHTML = visual(kind, name); wireProbe(row, kind); }
    }
    // PEGAR (⌘V) una imagen del portapapeles sobre la FILA ACTIVA (clic previo).
    function onPaste(e) {
      var items = (e.clipboardData && e.clipboardData.files) || [];
      if (!items.length) return;
      if (!selRow) { msg.textContent = "Haz clic en una fila primero y vuelve a pegar."; return; }
      e.preventDefault();
      subeFoto(items[0], selRow.kind, selRow.slug, selRow.el, selRow.name);
    }
    document.addEventListener("paste", onPaste);
    // TABLERO DE MISIONES (Carlos, 2026-07-20): columnas visibles + densidad,
    // guardado en el mismo doc compartido (DATA.board) — se aplica en /misiones.
    var PC_COLS = [["proyecto", "Proyecto (miniatura)"], ["fecha", "Fecha y duración"],
      ["ordenador", "Ordenador"], ["agente", "Agente / plataforma"], ["estado", "Estado + abrir"]];
    function seccionTablero() {
      var frag = document.createDocumentFragment();
      frag.appendChild(el("div", "yk-set-sec", "Tablero de misiones"));
      DATA.board = DATA.board || {};
      DATA.board.cols = DATA.board.cols || {};
      PC_COLS.forEach(function (c) {
        var lbl = el("label", "yk-set-chk");
        var chk = document.createElement("input"); chk.type = "checkbox";
        chk.checked = DATA.board.cols[c[0]] !== 0;   // por defecto, visible
        chk.addEventListener("change", function () {
          if (chk.checked) delete DATA.board.cols[c[0]]; else DATA.board.cols[c[0]] = 0;
        });
        lbl.appendChild(chk);
        lbl.appendChild(el("span", null, "Columna " + c[1]));
        frag.appendChild(lbl);
      });
      var dens = el("div", "yk-pc-dens");
      dens.appendChild(el("span", "yk-set-k", "Densidad"));
      [["comoda", "CÓMODA"], ["compacta", "COMPACTA"]].forEach(function (d) {
        var b = el("button", "yk-pc-densb" + ((DATA.board.density || "comoda") === d[0] ? " on" : ""), d[1]);
        b.type = "button";
        b.addEventListener("click", function () {
          DATA.board.density = d[0];
          dens.querySelectorAll(".yk-pc-densb").forEach(function (x) { x.classList.remove("on"); });
          b.classList.add("on");
        });
        dens.appendChild(b);
      });
      frag.appendChild(dens);
      return frag;
    }
    function pintar() {
      bodyEl.innerHTML = "";
      bodyEl.appendChild(el("div", "yk-set-sec", "Agentes"));
      PC_AGENTES.forEach(function (n) { bodyEl.appendChild(fila("agents", n)); });
      bodyEl.appendChild(el("div", "yk-set-sec", "Ordenadores"));
      PC_MAQUINAS.forEach(function (n) { bodyEl.appendChild(fila("machines", n)); });
      bodyEl.appendChild(seccionTablero());
      // refleja el emoji tecleado en el visual al vuelo
      bodyEl.addEventListener("input", function (e) {
        if (!e.target.classList.contains("yk-pc-icoin")) return;
        var r = e.target.closest(".yk-pc-row"); if (!r) return;
        var nm = r.querySelector(".yk-pc-nm").textContent;
        var kind = PC_AGENTES.indexOf(nm) >= 0 ? "agents" : "machines";
        refresh(r, kind, nm);
      });
    }
    // /informes ya pide esta personalización para sus avatares. Compartir la
    // promesa evita duplicar el mismo GET al construir el panel lateral.
    (window.__ykCustomizeRequest || window.fetch(WORKER + "/prefs/customize", { cache: "no-store" }))
      .then(function (r) { return r && typeof r.json === "function" ? r.json() : r; })
      .then(function (d) { DATA = (d && d.customize) || {}; DATA.agents = DATA.agents || {}; DATA.machines = DATA.machines || {}; pintar(); })
      .catch(function () { pintar(); });
    save.addEventListener("click", function () {
      save.disabled = true; msg.textContent = "Guardando…";
      window.fetch(WORKER + "/prefs/customize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ customize: DATA }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok) { msg.textContent = "Guardado — recargando…"; setTimeout(function () { location.reload(); }, 600); }
          else { msg.textContent = (d && d.error) || "No se pudo guardar."; save.disabled = false; }
        })
        .catch(function () { msg.textContent = "No se pudo guardar."; save.disabled = false; });
    });
  }

  // Selector de proyecto de la barra: Todos sin preferencia; una selección válida
  // explícita se restaura por query/storage. Ausente o archivada vuelve a Todos.
  function buildProjMenu() {
    var wrap = el("div", "yk-proj");
    var btn = el("button", "yk-proj-btn", "");
    btn.type = "button";
    btn.id = "yk-proj-btn";
    btn.setAttribute("aria-haspopup", "menu");
    btn.setAttribute("aria-expanded", "false");
    var menu = el("div", "yk-proj-menu");
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-labelledby", "yk-proj-btn");

    var projectTotal=0,projectLoadSeq=0,projectChannel=null;
    var PROJECT_ANNOUNCED_SS="yk_project_novelty_announced_v1";
    try{if(typeof window.BroadcastChannel==="function")projectChannel=new window.BroadcastChannel("yokup-project-novelty-v1");}catch(e){}
    var projectNovelty=window.YkProjectNovelty.create({storage:window.localStorage,publish:function(state){try{if(projectChannel)projectChannel.postMessage({type:"project-novelty",state:state});}catch(e){}}});
    var live=el("div","yk-nav-live");live.id="yk-project-live";live.setAttribute("role","status");live.setAttribute("aria-live","polite");live.setAttribute("aria-atomic","true");document.body.appendChild(live);

    wrap.appendChild(btn);
    wrap.appendChild(menu);

    function isMenuOpen() { return wrap.classList.contains("open"); }
    function setMenu(open) {
      wrap.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function unreadProjectIds(){var active={};PROJECT_CATALOG.forEach(function(project){active[String(project.id)]=true;});return projectNovelty.unreadIds().filter(function(id){return active[id];});}
    function paintProjectSignal(){
      var unread=unreadProjectIds(),base=btn.getAttribute("data-yk-base-label")||"Cambiar filtro de proyecto";
      wrap.classList.toggle("has-new",unread.length>0);
      btn.setAttribute("aria-label",base+(unread.length?". "+unread.length+" proyecto"+(unread.length===1?" nuevo":"s nuevos"):""));
    }
    function announceProjects(result){
      if(!result||!result.added)return;var state=result.state,token=String(state.observed_cursor==null?state.latest_created_at:state.observed_cursor),last="";
      try{last=sessionStorage.getItem(PROJECT_ANNOUNCED_SS)||"";}catch(e){}if(token&&token===last)return;
      var n=result.unread_ids.length;live.textContent=n+" proyecto"+(n===1?" nuevo":"s nuevos");try{sessionStorage.setItem(PROJECT_ANNOUNCED_SS,token);}catch(e){}
    }
    function ackRenderedProjects(){
      var ids=PROJECT_CATALOG.map(function(project){return String(project.id);});if(!ids.length)return;
      projectNovelty.ack(ids);paintProjectSignal();
    }
    function projectTotalLabel(prefix){return prefix+" · "+projectTotal;}

    function activeProject() {
      return PROJECT_CATALOG.filter(function (p) { return p.id === PROJECT_SCOPE; })[0] || null;
    }
    function validProjectId(value) {
      return resolveProjectScope(value, "", PROJECT_CATALOG);
    }
    function requestedProjectId() {
      var query = "", stored = "";
      try { query = new URL(location.href).searchParams.get("project_id") || ""; } catch (e) {}
      try { stored = localStorage.getItem(PROJECT_SCOPE_KEY) || ""; } catch (e) {}
      return resolveProjectScope(query, stored, PROJECT_CATALOG);
    }
    function rememberProject(projectId) {
      try {
        if (projectId) localStorage.setItem(PROJECT_SCOPE_KEY, projectId);
        else localStorage.removeItem(PROJECT_SCOPE_KEY);
      } catch (e) {}
      try {
        var url = new URL(location.href);
        if (projectId) url.searchParams.set("project_id", projectId);
        else url.searchParams.delete("project_id");
        history.replaceState(history.state, "", url.pathname + url.search + url.hash);
      } catch (e) {}
    }
    function publishProject(projectId, persist) {
      PROJECT_SCOPE = validProjectId(projectId);
      if (persist) rememberProject(PROJECT_SCOPE);
      // CustomEvent se entrega síncronamente: los consumidores limpian o repintan
      // su DOM viejo antes de que el botón pueda anunciar el nuevo proyecto.
      window.dispatchEvent(new CustomEvent("yk:project-change", {detail:{project_id:PROJECT_SCOPE,project:activeProject()}}));
      paintProject();
    }
    function paintProject() {
      var ap = activeProject(), host = projectHost(ap);
      var allButtonLabel=projectTotalLabel("TODOS"),allOptionLabel=projectTotalLabel("Todos");
      var name = ap ? (ap.name || ap.id) : allButtonLabel, full = ap && host ? name + " · " + host : name,unread=unreadProjectIds(),unreadMap={};unread.forEach(function(id){unreadMap[id]=true;});
      btn.innerHTML = '<span class="yk-proj-dot" aria-hidden="true"></span>'
        + '<span class="yk-proj-nm"><b class="yk-pj-full">' + esc(full) + '</b><b class="yk-pj-short">' + esc(name) + '</b></span>'
        + '<span class="yk-proj-cx" aria-hidden="true">▾</span>';
      btn.setAttribute("data-yk-base-label", "Proyecto: " + full + ". Cambiar filtro");
      btn.setAttribute("data-yk-project-total",String(projectTotal));
      btn.title = "Proyecto · " + full;
      menu.innerHTML = "";
      [{id:null,name:"Todos",web:"Todos los proyectos"}].concat(PROJECT_CATALOG).forEach(function (p) {
        var on = p.id === PROJECT_SCOPE;
        var option = el("button", "yk-proj-opt" + (on ? " on" : ""),
          '<span class="yk-proj-ic" aria-hidden="true">' + (p.id ? "📁" : "◉") + '</span>'
          + '<span class="yk-proj-txt"><b>' + esc(p.id ? (p.name || p.id) : allOptionLabel) + '</b><em>' + esc(p.id ? (projectHost(p) || p.id) : "Todos los proyectos") + '</em></span>'
          + (p.id&&unreadMap[String(p.id)]?'<span class="yk-proj-new-badge">NUEVO</span>':""));
        option.type = "button";
        option.setAttribute("role", "menuitemradio");
        option.setAttribute("aria-checked", on ? "true" : "false");
        if(!p.id){option.setAttribute("aria-label",allOptionLabel);option.setAttribute("data-yk-project-total",String(projectTotal));}
        option.addEventListener("click", function () {
          publishProject(p.id || null, true);
          setMenu(false); btn.focus();
        });
        menu.appendChild(option);
      });
      paintProjectSignal();
    }
    paintProject();
    function loadProjects(){
      var seq=++projectLoadSeq;
      return ykFetch("/projects", {cache:"no-store"}).then(function (r) { return r.json(); }).then(function (d) {
        if(seq!==projectLoadSeq)return false;var result=projectNovelty.observe(d||{}),metadata=projectNovelty.meta(d||{});
        PROJECT_CATALOG = (d && d.projects || []).filter(function (p) {return p && p.id && String(p.status || "activo").toLowerCase() !== "archivado";});
        projectTotal=metadata.total;
        PROJECT_SCOPE = requestedProjectId();
        rememberProject(PROJECT_SCOPE);
        window.dispatchEvent(new CustomEvent("yk:project-change", {detail:{project_id:PROJECT_SCOPE,project:activeProject(),ready:true}}));
        paintProject();announceProjects(result);if(isMenuOpen()){ackRenderedProjects();var firstOpen=menu.querySelector("button");if(firstOpen)firstOpen.focus();}return true;
      }).catch(function () {
        if(seq!==projectLoadSeq)return false;if(!PROJECT_CATALOG.length){projectTotal=0;PROJECT_SCOPE=null;paintProject();window.dispatchEvent(new CustomEvent("yk:project-change", {detail:{project_id:null,project:null,ready:true,error:true}}));}return false;
      });
    }
    loadProjects();
    window.addEventListener("yk:projects-changed",function(){loadProjects();});
    window.addEventListener("storage", function (event) {
      if(event.key===projectNovelty.key&&event.newValue){projectNovelty.sync(event.newValue);paintProject();return;}
      if (event.key !== PROJECT_SCOPE_KEY || !PROJECT_CATALOG.length) return;
      publishProject(validProjectId(event.newValue), true);
    });
    if(projectChannel)projectChannel.onmessage=function(event){var data=event&&event.data;if(data&&data.type==="project-novelty"){projectNovelty.sync(data.state);paintProject();}};

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = !isMenuOpen();
      setMenu(open);
      if (open) { ackRenderedProjects(); var f = menu.querySelector("button"); if (f) f.focus(); }
    });

    // clic fuera cierra
    document.addEventListener("click", function (e) {
      if (isMenuOpen() && !wrap.contains(e.target)) setMenu(false);
    });

    // Escape en CAPTURA: si el menú está abierto, lo cierra y frena el evento
    // para que el handler de paneles (fase burbuja) no se dispare.
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isMenuOpen()) {
        setMenu(false);
        btn.focus();
        e.stopPropagation();
      }
    }, true);

    return wrap;
  }

  // MENÚ DEL CAJÓN (solo visible ≤520px, ver yk-frame.css) — mismos ítems que la
  // barra, misma fuente única (pageNav), mismo activo. Filas de 44px, activo
  // marcado con aria-current, y al navegar el cajón se deja CERRADO para no
  // aterrizar en la página siguiente con el panel tapando el contenido.
  function buildRailNav(items) {
    var nav = el("nav", "yk-rail-nav");
    nav.setAttribute("aria-label", "Secciones de Yokup");
    nav.appendChild(el("div", "yk-rail-navhd", "SECCIONES"));
    items.forEach(function (it) {
      var a = el("a", "yk-rail-navlink" + (it.active ? " on" : ""), it.label);
      a.href = it.href || "#";
      if (it.active) a.setAttribute("aria-current", "page");
      if (it.panel) {
        a.setAttribute("data-yk-open", it.panel);
        a.addEventListener("click", function (e) {
          e.preventDefault(); setOpen("left", false); setOpen(it.panel, true);
        });
      } else {
        a.addEventListener("click", function () { setOpen("left", false); });
      }
      var c = counterSpan(it.label, "yk-rail-navc");
      if (c) a.appendChild(c);
      nav.appendChild(a);
    });
    return nav;
  }

  // botón-icono cuadrático de la barra
  function icon(cls, panel, glyph, label) {
    // canon 2026-07-12: el botón es SOLO el glifo; el rótulo vive en el tooltip
    var b = el("button", cls,
      '<span class="yk-ico-gl" aria-hidden="true">' + glyph + '</span>');
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    b.setAttribute("data-yk-panel", panel);
    return b;
  }

  function fillSlot(slot, name, expertHost) {
    var nodes = document.querySelectorAll('[data-yk-slot="' + name + '"]');
    if (!nodes.length) {
      // Avanzado siempre tiene su navegación canónica montada fuera del slot.
      // El mensaje de vacío sería falso y fue exactamente lo que vio Carlos.
      if (name !== "right") slot.appendChild(el("div", "yk-empty", "— sin opciones en esta vista"));
    } else {
      // mover (no clonar): preserva los event listeners ya enlazados
      Array.prototype.forEach.call(nodes, function (n) {
        n.removeAttribute("data-yk-slot");
        slot.appendChild(n);
      });
    }
    // el panel inferior SIEMPRE lleva pie de versión
    if (name === "bottom" && expertHost) {
      var ver = el("div", "yk-ver",
        'yokup · perímetro de seguridad · <b>' + VERSION + '</b>');
      ver.setAttribute("data-yk-version", "1");
      expertHost.appendChild(ver);
    }
  }

  function isOpen(panel) { return localStorage.getItem(LS + panel) === "1"; }
  function setOpen(panel, v) {
    try { localStorage.setItem(LS + panel, v ? "1" : "0"); } catch (e) {}
    document.documentElement.classList.toggle("yk-open-" + panel, !!v);
    // reflejar el estado en el icono (encendido/apagado)
    var ico = document.querySelector('.yk-ico[data-yk-panel="' + panel + '"]');
    if (ico) ico.setAttribute("aria-pressed", v ? "true" : "false");
  }

  function wire(ico, panel) {
    // restaurar estado guardado
    setOpen(panel, isOpen(panel));
    ico.addEventListener("click", function () {
      setOpen(panel, !isOpen(panel));
    });
  }

  function closeRailOnNavigation(rail, panel) {
    rail.addEventListener("click", function (event) {
      var link = event.target.closest("a[href]");
      if (link && rail.contains(link)) setOpen(panel, false);
    });
  }

  function wireExpertFetch(root) {
    var out = root.querySelector(".yk-expert-out");
    var btns = root.querySelectorAll("[data-yk-fetch]");
    Array.prototype.forEach.call(btns, function (b) {
      b.addEventListener("click", function () {
        var path = b.getAttribute("data-yk-fetch").replace("{id}", encodeURIComponent(urlId()));
        var pick = b.getAttribute("data-yk-pick"); // subcampo opcional
        if (out) out.textContent = "… solicitando " + path;
        // fetch normal de window: acceso.js ya inyecta el Bearer al llamar al worker
        window.fetch(WORKER + path, { cache: "no-store" })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            var data = (pick && d && d[pick] != null) ? d[pick] : d;
            if (out) out.textContent = JSON.stringify(data, null, 2);
          })
          .catch(function () {
            if (out) out.textContent = "El worker no responde ahora (o la sesión ha caducado).";
          });
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
