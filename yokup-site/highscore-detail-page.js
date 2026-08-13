/* Control de la vista periodizada del detalle. El servidor corta los hechos;
   esta capa conserva URL/estado y presenta el contrato sin inferencias locales. */
(function () {
  "use strict";
  var API="https://api.yokup.com", D=window.YkHighscoreDetail, ID=window.ykAgentIdentity;
  var target=document.getElementById("content"), requestRevision=0, activeData=null, activeScope="", nextWindowTimer=0;
  var LABELS={today:"Hoy",yesterday:"Ayer",week:"Semana",month:"Mes",year:"Año"};
  var TYPE_LABELS={all:"Puntos",objective:"Objetivos",window:"Ventanas",mission:"Misiones",task:"Tareas"};
  function el(tag,cls,value){var node=document.createElement(tag);if(cls)node.className=cls;if(value!=null)node.textContent=String(value);return node;}
  function state(title,message){target.replaceChildren();var box=el("section","state"),heading=el("h1","",title);box.append(heading,el("p","",message));target.append(box);}
  function backUrl(projectId){return "/highscore?project_id="+encodeURIComponent(projectId);}
  function current(){return D.queryState(location.search);}
  function setUrl(next,replace){var url=D.detailUrl(next);history[replace?"replaceState":"pushState"]({period:next.period,type:next.type},"",url);return next;}
  function periodNav(selected,onSelect){var nav=el("nav","period-nav");nav.setAttribute("aria-label","Periodo del detalle");
    D.periods.forEach(function(period){var button=el("button","",LABELS[period]);button.type="button";button.dataset.period=period;
      button.setAttribute("aria-pressed",String(period===selected));button.addEventListener("click",function(){onSelect(period);});nav.append(button);});return nav;}
  function periodFailure(stateValue){target.replaceChildren();target.append(periodNav(stateValue.period,selectPeriod));var box=el("section","state period-error"),heading=el("h1","","Periodo no disponible");
    box.append(heading,el("p","","Yokup no devolvió un histórico factual completo para "+LABELS[stateValue.period]+". No se aplicará un filtro local parcial ni se mostrarán ceros inventados."));target.append(box);}
  function onIdleMessage(code){return {active_mission:"Hay una misión activa; el servidor no abrirá OnIDLE.",active_task:"Hay una tarea activa; el servidor no abrirá OnIDLE.",
    daily_limit:"El cupo diario de ventanas está agotado.",proposals_unavailable:"No hay tres propuestas canónicas disponibles.",exact_assignment_required:"No existe una asignación única de agente, equipo y proyecto.",
    lease_busy:"El scheduler está atendiendo otra solicitud."}[code]||"El servidor no puede abrir la ventana ahora.";}
  function requestId(){if(window.crypto&&typeof window.crypto.randomUUID==="function")return window.crypto.randomUUID();return "onidle-"+Date.now()+"-"+Math.random().toString(36).slice(2);}
  function onIdleControl(stateValue){var control=el("section","onidle-control"),time=el("span","onidle-time","Próxima ventana: comprobando…"),button=el("button","onidle-request","Solicitar ahora"),status=el("span","onidle-status","");
    control.setAttribute("aria-label","Próxima ventana OnIDLE de "+stateValue.agent);time.setAttribute("aria-live","polite");status.setAttribute("role","status");status.setAttribute("aria-live","polite");button.type="button";
    control.append(time,button,status);
    function showTurn(payload){var next=D.nextWindow(payload,stateValue.agent,ID);if(!next){time.textContent="Próxima ventana: no disponible";return;}function tick(){time.textContent="Próxima ventana: "+D.windowCountdown(next.at,Date.now());}
      tick();if(nextWindowTimer)window.clearInterval(nextWindowTimer);nextWindowTimer=window.setInterval(tick,1000);}
    fetch(API+"/fleet/turnos?agent="+encodeURIComponent(stateValue.agent),{cache:"no-store"}).then(function(response){if(!response.ok)throw new Error(String(response.status));return response.json();}).then(showTurn).catch(function(){time.textContent="Próxima ventana: no disponible";});
    function perform(id,attempt){button.disabled=true;button.setAttribute("aria-busy","true");status.textContent=attempt?"El scheduler sigue procesando…":"Solicitando al scheduler…";
      return fetch(API+"/fleet/onidle-request",{method:"POST",credentials:"include",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify({request_id:id,agent:stateValue.agent,project_id:stateValue.projectId})})
        .then(function(response){return response.json().catch(function(){return {};}).then(function(payload){return {response:response,payload:payload};});})
        .then(function(result){var payload=result.payload;if(result.response.status===202&&attempt<5){return new Promise(function(resolve){window.setTimeout(function(){resolve(perform(id,attempt+1));},1200);});}
          if((payload.status==="created"||payload.status==="existing")&&payload.url){status.textContent=payload.status==="existing"?"Ya hay una ventana viva; abriéndola…":"Ventana creada por el scheduler; abriéndola…";window.location.assign(payload.url);return;}
          if(payload.status==="blocked"){status.textContent=onIdleMessage(payload.reason);return;}if(result.response.status===401){status.textContent="La sesión ha caducado. Inicia sesión y vuelve a solicitar.";return;}
          status.textContent="La solicitud no pudo completarse. Vuelve a intentarlo.";})
        .catch(function(){status.textContent="No se pudo contactar con el scheduler. Vuelve a intentarlo.";})
        .finally(function(){button.disabled=false;button.removeAttribute("aria-busy");});}
    button.addEventListener("click",function(){perform(requestId(),0);});return control;}
  function hero(data,stateValue){var hero=el("header","hero"),avatar=el("div","avatar",stateValue.agent.charAt(0).toUpperCase());
    var avatarUrl=window.ykAvatar&&window.ykAvatar.img(stateValue.agent);if(avatarUrl){var image=document.createElement("img");image.src=avatarUrl;image.alt="Avatar de "+stateValue.agent;avatar.replaceChildren(image);}
    var identity=el("div","identity"),eyebrow=el("div","eyebrow","Identidad canónica · "+stateValue.projectId),titleRow=el("div","identity-title-row"),title=el("h1","",stateValue.agent);
    titleRow.append(title,onIdleControl(stateValue));identity.append(eyebrow,titleRow,el("p","source","Actividad factual de "+LABELS[data.period].toLowerCase()+" · "+data.timezone+" · "+data.from+" → "+data.to));hero.append(avatar,identity);return hero;}
  function metricGrid(metrics,selected,onSelect){var fields={all:"points",objective:"objectives",window:"windows",mission:"missions",task:"tasks"};var grid=el("section","metric-grid");grid.setAttribute("aria-label","Filtrar cronología por tipo");
    D.types.forEach(function(type){var card=el("button","metric");card.type="button";card.dataset.type=type;card.setAttribute("aria-pressed",String(type===selected));card.setAttribute("aria-controls","factual-timeline");
      card.setAttribute("aria-label",TYPE_LABELS[type]+": "+metrics[fields[type]]+". "+(type==="all"?"Mostrar toda la cronología":"Filtrar la cronología"));card.append(el("b","",metrics[fields[type]]),el("span","",TYPE_LABELS[type]));
      card.addEventListener("click",function(){onSelect(type);});grid.append(card);});return grid;}
  function evolution(data,type){var metricLabel=type==="all"?"puntos":TYPE_LABELS[type].toLowerCase(),panel=el("section","panel score-evolution"),head=el("div","period-heading");head.append(el("h2","","Evolución de "+metricLabel),el("span","period-range",data.from+" — "+data.to));panel.append(head);
    if(!data.evolution.length){panel.append(el("p","empty","No hay días con actividad factual en este periodo."));return panel;}
    var list=el("div","score-days"),max=Math.max.apply(null,data.evolution.map(function(row){return D.metricForType(row,type);}));list.setAttribute("role","list");
    data.evolution.forEach(function(row){var value=D.metricForType(row,type),line=el("div","score-day"),time=el("time","",row.day.slice(8,10)+"/"+row.day.slice(5,7)),bar=el("div","score-day-bar"),fill=el("i"),points=el("b","",value+(type==="all"?" pts":""));
      line.setAttribute("role","listitem");line.setAttribute("aria-label",row.day+": "+value+" "+metricLabel);time.dateTime=row.day;fill.style.width=(max?value/max*100:0)+"%";bar.append(fill);line.append(time,bar,points);list.append(line);});panel.append(list);return panel;}
  function chronology(data,type){var events=D.timelineForType(data.timeline,type),title=type==="all"?"Cronología factual completa":"Cronología · "+TYPE_LABELS[type],panel=el("section","panel timeline");panel.id="factual-timeline";panel.setAttribute("aria-live","polite");var head=el("div","period-heading");head.append(el("h2","",title),el("span","period-range",events.length+" eventos · más reciente primero"));panel.append(head);
    if(!events.length){panel.append(el("p","empty","No hay eventos de "+TYPE_LABELS[type].toLowerCase()+" en este periodo y proyecto."));return panel;}
    var list=el("ol","event-list");events.forEach(function(event){var item=el("li","event"),time=el("time","",new Date(event.at).toLocaleString("es-ES",{timeZone:data.timezone,day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}));time.dateTime=new Date(event.at).toISOString();
      var body=el("div"),title=el("strong","",event.type+" · "+event.title);body.append(title);if(event.id)body.append(el("small","",event.id));item.append(time,body,el("span","event-points",event.points?"+"+event.points+" pts":""));list.append(item);});panel.append(list);return panel;}
  function render(data,stateValue){target.replaceChildren();var back=document.querySelector(".back");back.href=backUrl(stateValue.projectId);
    target.append(hero(data,stateValue),periodNav(stateValue.period,selectPeriod));var grid=el("div","grid");grid.append(metricGrid(data.metrics,stateValue.type,selectType),evolution(data,stateValue.type),chronology(data,stateValue.type));target.append(grid);
    target.append(el("p","score-sampled","Datos canónicos muestreados el "+new Date(data.sampledAt).toLocaleString("es-ES",{timeZone:data.timezone})+"."));}
  function endpoint(stateValue){return API+"/highscore/history?agent="+encodeURIComponent(stateValue.agent)+"&project_id="+encodeURIComponent(stateValue.projectId)+"&period="+encodeURIComponent(stateValue.period);}
  function load(stateValue){var revision=++requestRevision;target.classList.add("loading");return fetch(endpoint(stateValue),{cache:"no-store"}).then(function(response){if(!response.ok)throw new Error(String(response.status));return response.json();})
    .then(function(payload){if(revision!==requestRevision)return;var data=D.periodHistory(payload,stateValue,ID,Date.now());if(!data)throw new Error("Contrato histórico inválido");activeData=data;activeScope=stateValue.agent+"|"+stateValue.projectId+"|"+stateValue.period;render(data,stateValue);})
    .catch(function(){if(revision!==requestRevision)return;periodFailure(stateValue);})
    .finally(function(){if(revision===requestRevision)target.classList.remove("loading");});}
  function selectPeriod(period){var value=current();if(value.period===period)return;value.period=period;setUrl(value,false);load(value);}
  function selectType(type){var value=current();if(value.type===type)return;value.type=type;setUrl(value,false);if(activeData)render(activeData,value);}
  function boot(replace){var value=current();if(!value.agent){state("Falta el agente","Abre el detalle desde el Highscore.");return;}if(!D.validAgent(value.agent,ID)){state("Identidad no válida","agent debe ser una identidad principal con apellido de equipo.");return;}
    if(!value.projectId){state("Falta el proyecto","El detalle factual necesita project_id exacto; vuelve al Highscore y abre el agente desde su proyecto.");return;}if(replace)setUrl(value,true);var scope=value.agent+"|"+value.projectId+"|"+value.period;if(activeData&&activeScope===scope)render(activeData,value);else load(value);}
  window.addEventListener("popstate",function(){boot(false);});boot(true);
})();
