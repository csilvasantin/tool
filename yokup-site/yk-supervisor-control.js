const API="https://api.yokup.com";
const LABELS={play:"Reproducir",pause:"Pausar",next:"Siguiente",prev:"Anterior",mute:"Silenciar",unmute:"Activar sonido",standby:"Reposo",resume:"Salir de reposo","info-show":"Mostrar información","info-hide":"Ocultar información"};
const STATES={sending:"Enviando · todavía sin confirmación",queued:"En cola · esperando al equipo",executed:"Ejecutada · confirmada por el reproductor",failed:"Fallida · el equipo no la ha ejecutado",ignored:"Ignorada por el equipo",unknown:"Sin confirmación · comprueba el equipo antes de repetir"};
const ERRORS={device_without_recent_signal:"El equipo no tiene señal reciente. Actualiza su conexión.",physical_device_not_registered:"El equipo físico aún no aparece en el registro.",control_unconfigured:"El servicio de mando está pendiente de configurar.",device_already_bound:"Este equipo ya está vinculado a otra ficha.",command_in_progress:"Hay otra orden pendiente para este equipo. Espera a su resultado.",control_forbidden:"Tu sesión no tiene permiso para gestionar estos equipos."};
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
const clock=value=>value?new Intl.DateTimeFormat("es-ES",{timeZone:"Europe/Madrid",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date(value))+" · Madrid":"Sin lectura";
export const freshTelemetry=(t,now=Date.now())=>Boolean(t?.recent&&t.last_seen>0&&t.last_seen<=now+10000&&now-t.last_seen<=90000);
export function connectionText(c,now=Date.now()) {
  if(!c)return "Sin telemetría vinculada";
  const t=c.telemetry;return `${c.label} · demo física · ${freshTelemetry(t,now)?"señal reciente":"sin señal reciente"}${t?.last_seen?" · "+clock(t.last_seen):""}`;
}
async function request(path,body) {
  const r=await fetch(API+path,{method:body?"POST":"GET",cache:"no-store",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  const d=await r.json();if(!r.ok||!d.ok)throw new Error(ERRORS[d.error]||"No se ha podido confirmar la operación. Actualiza antes de repetir.");return d;
}
export function createDeviceControl(readData,changed) {
  let scope="",connections=new Map(),generation=0;
  const pending=new Set(),listeners=new Set();
  function notify(){changed();for(const fn of listeners)fn();}
  async function refresh() {
    const xpacio=readData()?.xpacio?.id,run=++generation;
    if(xpacio!==scope){scope=xpacio;connections=new Map();notify();}
    if(!xpacio)return;
    try{const d=await request("/supervisor/connections?xpacio="+encodeURIComponent(xpacio));if(run!==generation||readData()?.xpacio?.id!==xpacio)return;connections=new Map(d.connections.map(c=>[c.code,c]));}
    catch{if(run!==generation)return;connections=new Map();}
    notify();
  }
  function mount(host,ci) {
    if(!ci.code||!["pantalla","tpv"].includes(ci.category))return;
    const xpacio=readData().xpacio.id;
    const section=el("section","ops-control"),title=el("h3","","Conexión y mando"),status=el("p","ops-control-signal"),details=el("p","ops-note"),buttons=el("div","ops-command-buttons"),result=el("p","ops-command-result");
    status.setAttribute("role","status");result.setAttribute("role","status");result.setAttribute("aria-live","polite");
    const bind=el("button","ops-outline","Conectar equipo de demo"),unbind=el("button","ops-outline","Desvincular demo"),binding=el("div","ops-binding"),check=el("button","ops-outline","Comprobar última orden");
    bind.type=unbind.type=check.type="button";
    section.append(title,status,details,buttons,result,check,bind,unbind,binding);host.append(section);
    const controls=[];
    for(const [command,label] of Object.entries(LABELS)) {const b=el("button","ops-outline",label);b.type="button";b.onclick=()=>send(command);buttons.append(b);controls.push(b);}
    function update(){const c=connections.get(ci.code),t=c?.telemetry;status.textContent=connectionText(c);details.textContent=c?`Fuente: reproductor ${c.screen}. ${t?.playing?.title?"Contenido: "+t.playing.title+". ":""}${typeof t?.standby==="boolean"?(t.standby?"En reposo. ":"Fuera de reposo. "):""}La señal del reproductor no acredita el encendido físico del panel.`:"Vincula el equipo físico de la demostración. El inventario conserva la identidad y ubicación del TPV de Alsea.";
      const enabled=Boolean(c?.control_configured&&freshTelemetry(t)&&t.capabilities?.remote_commands&&!pending.has(ci.code)&&!["sending","queued"].includes(c?.last_order?.status)&&scope===xpacio);for(const b of controls)b.disabled=!enabled;
      check.hidden=!c?.last_order;check.disabled=pending.has(ci.code);if(c?.last_order&&!result.textContent)result.textContent=(LABELS[c.last_order.command]||"Orden")+" · "+(STATES[c.last_order.status]||STATES.unknown);
      bind.disabled=unbind.disabled=pending.has(ci.code);unbind.hidden=!c;bind.textContent=c?"Cambiar equipo de demo":"Conectar equipo de demo";
      if(c&&!c.control_configured&&!result.textContent)result.textContent=ERRORS.control_unconfigured;
    }
    async function send(command) {
      if(pending.has(ci.code)||readData()?.xpacio.id!==xpacio)return;
      pending.add(ci.code);update();result.textContent=STATES.sending;
      try {
        const d=await request("/supervisor/command",{xpacio,code:ci.code,command,request_id:crypto.randomUUID()});let order=d.order;result.textContent=LABELS[command]+" · "+(STATES[order.status]||STATES.unknown);
        const until=Date.now()+30000;
        while(order.status==="queued"&&Date.now()<until&&section.isConnected){await new Promise(r=>setTimeout(r,1500));if(!section.isConnected)break;const next=await request("/supervisor/command?id="+encodeURIComponent(order.id));order=next.order;result.textContent=LABELS[command]+" · "+(STATES[order.status]||STATES.unknown);}
        if(order.status==="queued"||order.status==="sending")result.textContent=LABELS[command]+" · "+STATES.unknown;
      }catch(e){result.textContent=e.message+" La orden no se reenvía automáticamente.";}
      finally{pending.delete(ci.code);await refresh();update();}
    }
    check.onclick=async()=>{const order=connections.get(ci.code)?.last_order;if(!order)return;check.disabled=true;try{const d=await request("/supervisor/command?id="+encodeURIComponent(order.id));result.textContent=(LABELS[d.order.command]||"Orden")+" · "+(STATES[d.order.status]||STATES.unknown);await refresh();}catch(e){result.textContent=e.message;}finally{update();}};
    bind.onclick=async()=>{
      binding.replaceChildren(el("p","ops-note","Buscando equipos físicos registrados…"));
      try {
        const d=await request("/supervisor/devices");binding.replaceChildren();
        if(!d.devices.length){binding.append(el("p","ops-warning","Todavía no hay equipos físicos registrados. Abre el reproductor del Fold y comprueba su conexión."));return;}
        const label=el("label","","Equipo físico para la demostración"),select=el("select"),name=el("input"),save=el("button","ops-primary","Vincular a esta ficha"),cancel=el("button","ops-outline","Cancelar");
        name.setAttribute("aria-label","Nombre del equipo de demo");name.placeholder="Ejemplo: Samsung Fold · TPV demo";name.maxLength=80;
        for(const device of d.devices){const option=el("option","",device.name+" · "+device.screen);option.value=device.screen;select.append(option);}
        label.append(select);save.type=cancel.type="button";cancel.onclick=()=>binding.replaceChildren();
        save.onclick=async()=>{save.disabled=true;try{await request("/supervisor/connections",{xpacio,code:ci.code,screen:select.value,label:name.value||select.selectedOptions[0].textContent,scope:"demo"});binding.replaceChildren();result.textContent="Equipo de demo vinculado. Comprueba su señal antes de usar el mando.";await refresh();}catch(e){result.textContent=e.message;}finally{save.disabled=false;}};
        binding.append(label,name,el("p","ops-note","Esta asociación identifica el hardware de la demo; no cambia el inventario instalado de Alsea."),save,cancel);
      }catch(e){binding.replaceChildren(el("p","ops-warning",e.message));}
    };
    unbind.onclick=async()=>{unbind.disabled=true;try{await request("/supervisor/connections",{xpacio,code:ci.code,screen:null});result.textContent="Demo desvinculada. No se ha enviado ninguna orden al equipo.";await refresh();}catch(e){result.textContent=e.message;}finally{update();}};
    listeners.add(update);host.addEventListener("close",()=>listeners.delete(update),{once:true});update();
  }
  return {refresh,mount,text:code=>connectionText(connections.get(code))};
}
