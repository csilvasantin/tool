(function(){
  "use strict";
  var API="https://api.yokup.com",D=window.YkAgentDetail,target=document.getElementById("agentDetail"),requestRevision=0,rows=[],nextOffset=0;
  function el(tag,cls,value){var node=document.createElement(tag);if(cls)node.className=cls;if(value!=null)node.textContent=String(value);return node;}
  function state(title,message,retry){target.replaceChildren();var box=el("section","agent-state"),h=el("h1","",title),p=el("p","",message);box.append(h,p);if(retry){var button=el("button","agent-retry","Reintentar");button.type="button";button.addEventListener("click",function(){load(retry,false);});box.append(button);}target.append(box);}
  function ago(value){var number=Number(value)||0;if(!number)return "sin hora verificable";if(number<1e11)number*=1000;var seconds=Math.max(0,Math.round((Date.now()-number)/1000));if(seconds<60)return "hace "+seconds+" s";if(seconds<3600)return "hace "+Math.round(seconds/60)+" min";if(seconds<86400)return "hace "+Math.round(seconds/3600)+" h";return D.when(number);}
  function stateLabel(value){return ({running:"en curso",in_progress:"en curso",doing:"en curso",active:"en curso",assigned_stale:"asignada · sin señal reciente",idle:"disponible",done:"finalizada",resolved:"resuelta",completed:"finalizada",pending:"pendiente",cancelled:"cancelada",unknown:"estado no disponible"})[String(value||"").toLowerCase()]||String(value||"estado no disponible").replaceAll("_"," ");}
  function kindLabel(value){return ({task:"tarea",mission:"misión",presence:"presencia"})[String(value||"").toLowerCase()]||"actividad";}
  function detailLink(value,label){if(!value)return null;var link=el("a","agent-detail-link",label+" →");link.href=value;return link;}
  function hero(data){
    var identity=data.identity,presence=data.presence,current=data.current,header=el("header","agent-hero");header.dataset.state=presence.fresh?"fresh":"quiet";
    var presenceLabel=presence.ambiguous?"varias sesiones":(presence.fresh?"verificado":(!presence.available?"presencia no disponible":(presence.matched?"sin señal fresca":"sin coincidencia")));
    var top=el("div","agent-top"),dot=el("span","agent-dot"),name=el("h1","",identity.agent||identity.family),badge=el("span","agent-runtime",identity.runtime+" · "+identity.surface.toUpperCase()+" · "+presenceLabel);dot.setAttribute("aria-hidden","true");top.append(dot,name,badge);
    var machine=el("p","agent-machine","⌂ "+identity.machine),focus=el("p","agent-focus",current&&current.title?current.title:"Sin actividad actual atribuible a esta superficie."),meta=el("p","agent-meta");
    meta.append(el("span",presence.fresh?"fresh":"quiet",presence.fresh?"● actividad actual":"○ sin actividad reciente"),el("span","",ago(presence.liveAt)));
    header.append(top,machine,focus,meta);return header;
  }
  function currentPanel(data){
    var panel=el("section","agent-panel current-work"),heading=el("div","panel-heading"),current=data.current;heading.append(el("h2","","Actividad actual"),el("span","",current?stateLabel(current.state):"sin actividad"));panel.append(heading);
    if(!current){panel.append(el("p","agent-empty","No hay una misión o tarea actual atribuible a esta superficie. El histórico permanece disponible debajo."));return panel;}
    panel.append(el("h3","",current.title||current.kind||"Actividad sin título"));var facts=el("dl","agent-facts");
    [["Proyecto",current.projectName||current.projectId||"Sin proyecto"],["Misión",current.missionRef||current.missionId||"Sin misión"],["Tarea",current.taskCode?current.taskCode.toUpperCase()+" · "+(current.taskTitle||current.title||""):"Sin tarea"],["Última actividad",ago(current.activityAt)]].forEach(function(row){facts.append(el("dt","",row[0]),el("dd","",row[1]));});panel.append(facts);
    var link=detailLink(current.detailUrl,"Abrir la misión o tarea");if(link)panel.append(link);return panel;
  }
  function historyRow(row){
    var article=el("article","history-item"),top=el("div","history-top"),kind=el("span","history-kind",kindLabel(row.kind)),status=el("span","history-status",stateLabel(row.state));top.append(kind,status);article.append(top,el("h3","",row.title||"Actividad sin título"));
    var project=row.projectName||row.projectId||"Sin proyecto",ref=row.missionRef||row.missionId||"Sin misión",time=row.endedAt||row.activityAt||row.startedAt;
    article.append(el("p","history-context",project+" · "+ref+(row.taskCode?" · tarea "+row.taskCode.toUpperCase():"")),el("time","history-time",D.when(time)));var link=detailLink(row.detailUrl,"Abrir detalle");if(link)article.append(link);return article;
  }
  function historyPanel(data,stateValue){
    var panel=el("section","agent-panel history"),heading=el("div","panel-heading"),list=el("div","history-list");heading.append(el("h2","","Histórico de actividad"),el("span","",data.history.total+" registro"+(data.history.total===1?"":"s")));panel.append(heading);rows.forEach(function(row){list.append(historyRow(row));});
    if(!rows.length)list.append(el("p","agent-empty","Todavía no hay actividad histórica atribuible a esta superficie."));panel.append(list);
    if(data.history.hasMore){var more=el("button","agent-more","Cargar más actividad");more.type="button";more.addEventListener("click",function(){load(Object.assign({},stateValue,{offset:nextOffset}),true);});panel.append(more);}return panel;
  }
  function render(data,stateValue,append){
    rows=append?rows.concat(data.history.items):data.history.items.slice();nextOffset=data.history.offset+data.history.items.length;target.replaceChildren();var back=document.querySelector(".back");if(back)back.href="/dashboard";target.append(hero(data),currentPanel(data),historyPanel(data,stateValue));
    var sampled=el("p","agent-sampled","Datos operativos del agente · hora de Madrid · actualización sin caché.");target.append(sampled);
  }
  function load(stateValue,append){
    var revision=++requestRevision;target.setAttribute("aria-busy","true");if(!append)state("Cargando ficha…","Consultando actividad actual e histórico verificable.");
    return fetch(D.endpoint(API,stateValue),{cache:"no-store"}).then(function(response){if(!response.ok)throw new Error(String(response.status));return response.json();}).then(function(payload){if(revision!==requestRevision)return;var data=D.normalize(payload);if(!data)throw new Error("contrato inválido");render(data,stateValue,append);}).catch(function(){if(revision!==requestRevision)return;state("No se pudo cargar la ficha","La actividad del agente no está disponible ahora mismo. No se sustituyen datos ausentes por ceros.",stateValue);}).finally(function(){if(revision===requestRevision)target.setAttribute("aria-busy","false");});
  }
  var query=D.queryState(location.search);if(!D.validState(query))state("Faltan datos del agente","Abre la ficha desde una tarjeta verificada del Pulso de la flota; hacen falta agente, máquina, runtime y superficie.");else load(query,false);
})();
