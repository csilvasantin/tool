import {CATEGORY, STATUS, attentionReasons, filterInventory, inventoryCsv} from "./yk-supervisor-itil-model.js?v=1";

import {createDeviceControl} from "./yk-supervisor-control.js?v=1";

if (typeof document !== "undefined" && document.getElementById("opsGrid")) {
  const $ = id => document.getElementById(id);
  const el = (tag,cls,text) => {const n=document.createElement(tag);if(cls)n.className=cls;if(text != null)n.textContent=text;return n;};
  const clock = value => new Intl.DateTimeFormat("es-ES",{timeZone:"Europe/Madrid",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date(value));
  const codeUrl = code => "/equipo-inventario?code=" + encodeURIComponent(code);
  let data=null, latest=0, controller=null, timer=0, store="";
  const devices=createDeviceControl(()=>data,()=>{document.querySelectorAll(".ops-card").forEach(card=>{const line=card.querySelector(".ops-observed");if(line)line.textContent=devices.text(card.dataset.code);});});
  const query = new URLSearchParams(location.search).get("xpacio");
  if (query && /^[A-Za-z0-9][\w.:-]{0,159}$/.test(query)) $("opsStore").value=query;
  function anchor(label,href,cls="ops-link") {const a=el("a",cls,label);a.href=href;return a;}
  function fact(host,label,value) {const row=el("div","ops-fact");row.append(el("dt","",label),el("dd","",value || "Sin dato"));host.append(row);}
  function detail(ci) {
    const trigger=document.activeElement;
    const dialog=el("dialog","ops-dialog");dialog.setAttribute("aria-label","Equipo · " + ci.name);
    const header=el("header"), close=el("button","ops-outline","Cerrar");close.type="button";close.onclick=()=>dialog.close();
    header.append(el("p","ops-eyebrow",ci.code || "CATÁLOGO PROVISIONAL"),close);
    dialog.append(header,el("h2","",ci.name),el("p","ops-detail-context",data.xpacio.name + " · " + data.xpacio.id));
    const facts=el("dl","ops-facts");
    fact(facts,"Tipo de equipo",CATEGORY[ci.category] || ci.category);fact(facts,"Ubicación",[ci.group,ci.position].filter(Boolean).join(" · "));
    fact(facts,"Estado de ficha",STATUS[ci.status] || "Sin dato");fact(facts,"Funcionamiento físico","Sin observación vinculada a este equipo");
    fact(facts,"Garantía",({valid:"En garantía",expiring:"Próxima a vencer",expired:"Vencida",none:"Sin dato"})[ci.warranty]);
    fact(facts,"Mantenimiento",ci.maintenance_due ? "Pendiente" : "Sin aviso en el inventario");
    fact(facts,"Incidencias abiertas",String(ci.open_incidents));
    if(ci.parent) {const parent=el("div","ops-fact");parent.append(el("dt","","Depende de"));const dd=el("dd");dd.append(anchor(ci.parent,codeUrl(ci.parent)));parent.append(dd);facts.append(parent);}
    dialog.append(facts);
    devices.mount(dialog,ci);
    const reasons=attentionReasons(ci);if(reasons.length)dialog.append(el("p","ops-warning",reasons.join(" · ")));
    if(ci.network)dialog.append(el("p","ops-warning",ci.network.source === "simulated" ? "SIMULADO · los valores de red son una demostración, sin confirmación del router físico." : "Origen RMS · consulta la ficha de red para comprobar la antigüedad de la muestra."));
    const actions=el("div","ops-detail-actions");
    if(ci.code)actions.append(anchor("Abrir ficha completa ↗",codeUrl(ci.code),"ops-primary"));
    actions.append(anchor("Gestionar equipo e incidencias ↗","/retailer?xpacio="+encodeURIComponent(data.xpacio.id)+(ci.code ? "&itil="+encodeURIComponent(ci.code) : "")+"#itil","ops-outline"));
    dialog.append(actions,el("p","ops-note","Fuente: inventario maestro de Yokup. Consultado " + clock(data.generated_at) + " · Madrid. Los mandos requieren un enlace verificado con el equipo."));
    dialog.addEventListener("close",()=>{dialog.remove();if(trigger?.isConnected)trigger.focus();});document.body.append(dialog);dialog.showModal();
  }
  function card(ci) {
    const reasons=attentionReasons(ci), c=el("article","ops-card"+(reasons.length ? " needs-attention" : ""));
    c.dataset.code=ci.code || "";
    const top=el("div","ops-card-top");top.append(el("span","ops-type",CATEGORY[ci.category] || ci.category),el("span","ops-badge",ci.managed_by === "itil" ? "ITIL" : "Provisional"));
    c.append(top,el("p","ops-code",ci.code || "Sin código ITIL"),el("h3","",ci.name));
    c.append(el("p","ops-place",[ci.group,ci.position].filter(Boolean).join(" · ") || "Ubicación por completar"));
    c.append(el("p","ops-registry","Ficha: " + (STATUS[ci.status] || "Sin dato")));
    c.append(el("p","ops-observed",devices.text(ci.code)));
    if(ci.network) c.append(el("p","ops-network",ci.network.source === "simulated" ? "SIMULADO · red " + (ci.network.radio || "") : "Telemetría RMS · validar antigüedad"));
    if(reasons.length)c.append(el("p","ops-warning",reasons.join(" · ")));
    else c.append(el("p","ops-muted","Sin avisos registrados"));
    const button=el("button","ops-card-button","Ver equipo →");button.type="button";button.onclick=()=>detail(ci);c.append(button);return c;
  }
  function render() {
    const grid=$("opsGrid");grid.replaceChildren();
    const cis=data?.cis || [];
    for(const [id,count] of [["opsTotal",cis.length],["opsScreens",cis.filter(c=>c.category==="pantalla").length],["opsPos",cis.filter(c=>c.category==="tpv").length],["opsAttention",cis.filter(c=>attentionReasons(c).length).length]]) $(id).textContent=data ? String(count) : "—";
    $("opsExport").disabled=!data;
    if(!data){$("opsResults").textContent="";grid.append(el("p","ops-empty","No hay un inventario verificado disponible para esta consulta."));return;}
    const visible=filterInventory(cis,{search:$("opsSearch").value,category:$("opsCategory").value,attention:$("opsOnlyAttention").getAttribute("aria-pressed")==="true"});
    $("opsResults").textContent=`${visible.length} de ${cis.length} equipos · fuente: Yokup ITIL`;
    if(!visible.length)grid.append(el("p","ops-empty",cis.length ? "Ningún equipo coincide con estos filtros." : "Este establecimiento todavía no tiene equipos registrados."));
    for(const ci of visible)grid.append(card(ci));
  }
  async function load(nextStore) {
    const run=++latest;controller?.abort();controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);
    clearTimeout(timer);store=nextStore;$("opsStatus").textContent="Consultando el inventario maestro…";
    // Al cambiar de establecimiento se retira el inventario anterior inmediatamente.
    if(data?.xpacio.id!==store){data=null;render();devices.refresh();$("opsLocation").textContent=store;}
    try {
      const r=await fetch("https://api.yokup.com/supervisor/itil?xpacio="+encodeURIComponent(store),{cache:"no-store"});
      const result=await r.json();if(run!==latest)return;
      if(!r.ok || !result.ok)throw Object.assign(new Error(result.error),{status:r.status});
      if(result.xpacio?.id!==store || !Array.isArray(result.cis) || !Number.isFinite(Date.parse(result.generated_at)))throw new Error("invalid_inventory");
      data=result;$("opsLocation").textContent=[data.xpacio.name,data.xpacio.city,data.xpacio.id].filter(Boolean).join(" · ");
      $("opsStatus").textContent="Inventario consultado " + clock(data.generated_at) + " · Madrid";render();devices.refresh();
    } catch(error) {
      if(run!==latest)return;data=null;render();devices.refresh();
      $("opsStatus").textContent=error.status===403 ? "Acceso restringido: esta vista requiere permisos de supervisión de inventario." : error.status===401 ? "Inicia sesión para consultar el inventario." : error.status===404 ? "Establecimiento no encontrado en el inventario." : "Sin conexión con el inventario. No se puede confirmar su estado.";
    } finally {clearTimeout(timeout);if(run===latest)timer=setTimeout(()=>{if(!document.hidden)load(store);},30000);}
  }
  $("opsScope").addEventListener("submit",event=>{event.preventDefault();load($("opsStore").value.trim());});
  $("opsSearch").addEventListener("input",render);$("opsCategory").addEventListener("change",render);
  $("opsOnlyAttention").addEventListener("click",()=>{const b=$("opsOnlyAttention");b.setAttribute("aria-pressed",String(b.getAttribute("aria-pressed")!=="true"));render();});
  $("opsExport").addEventListener("click",()=>{if(!data)return;const url=URL.createObjectURL(new Blob([inventoryCsv(data.cis,data)],{type:"text/csv;charset=utf-8"}));const a=anchor("",url);a.download="inventario-"+data.xpacio.id+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)load(store || $("opsStore").value.trim());});
  Promise.resolve(window.YkAccess?.ready).then(()=>load($("opsStore").value.trim()));
}
