/* Control de la vista periodizada del detalle. El servidor corta los hechos;
   esta capa conserva URL/estado y presenta el contrato sin inferencias locales. */
(function () {
  "use strict";
  var API="https://api.yokup.com", D=window.YkHighscoreDetail, ID=window.ykAgentIdentity;
  var target=document.getElementById("content"), requestRevision=0;
  var LABELS={today:"Hoy",yesterday:"Ayer",week:"Semana",month:"Mes",year:"Año"};
  function el(tag,cls,value){var node=document.createElement(tag);if(cls)node.className=cls;if(value!=null)node.textContent=String(value);return node;}
  function state(title,message){target.replaceChildren();var box=el("section","state"),heading=el("h1","",title);box.append(heading,el("p","",message));target.append(box);}
  function backUrl(projectId){return "/highscore?project_id="+encodeURIComponent(projectId);}
  function current(){return D.queryState(location.search);}
  function setUrl(next,replace){var url=D.detailUrl(next);history[replace?"replaceState":"pushState"]({period:next.period},"",url);return next;}
  function periodNav(selected,onSelect){var nav=el("nav","period-nav");nav.setAttribute("aria-label","Periodo del detalle");
    D.periods.forEach(function(period){var button=el("button","",LABELS[period]);button.type="button";button.dataset.period=period;
      button.setAttribute("aria-pressed",String(period===selected));button.addEventListener("click",function(){onSelect(period);});nav.append(button);});return nav;}
  function periodFailure(stateValue){target.replaceChildren();target.append(periodNav(stateValue.period,selectPeriod));var box=el("section","state period-error"),heading=el("h1","","Periodo no disponible");
    box.append(heading,el("p","","Yokup no devolvió un histórico factual completo para "+LABELS[stateValue.period]+". No se aplicará un filtro local parcial ni se mostrarán ceros inventados."));target.append(box);}
  function hero(data,stateValue){var hero=el("header","hero"),avatar=el("div","avatar",stateValue.agent.charAt(0).toUpperCase());
    var avatarUrl=window.ykAvatar&&window.ykAvatar.img(stateValue.agent);if(avatarUrl){var image=document.createElement("img");image.src=avatarUrl;image.alt="Avatar de "+stateValue.agent;avatar.replaceChildren(image);}
    var identity=el("div"),eyebrow=el("div","eyebrow","Identidad canónica · "+stateValue.projectId),title=el("h1","",stateValue.agent);
    identity.append(eyebrow,title,el("p","source","Actividad factual de "+LABELS[data.period].toLowerCase()+" · "+data.timezone+" · "+data.from+" → "+data.to));hero.append(avatar,identity);return hero;}
  function metricGrid(metrics){var labels={points:"Puntos",objectives:"Objetivos",windows:"Ventanas",missions:"Misiones",tasks:"Tareas"};var grid=el("section","metric-grid");
    ["points","objectives","windows","missions","tasks"].forEach(function(name){var card=el("article","metric");card.append(el("b","",metrics[name]),el("span","",labels[name]));grid.append(card);});return grid;}
  function evolution(data){var panel=el("section","panel score-evolution"),head=el("div","period-heading");head.append(el("h2","","Evolución de puntos"),el("span","period-range",data.from+" — "+data.to));panel.append(head);
    if(!data.evolution.length){panel.append(el("p","empty","No hay días con actividad factual en este periodo."));return panel;}
    var list=el("div","score-days"),max=Math.max.apply(null,data.evolution.map(function(row){return row.points;}));list.setAttribute("role","list");
    data.evolution.forEach(function(row){var line=el("div","score-day"),time=el("time","",row.day.slice(8,10)+"/"+row.day.slice(5,7)),bar=el("div","score-day-bar"),fill=el("i"),points=el("b","",row.points+" pts");
      line.setAttribute("role","listitem");line.setAttribute("aria-label",row.day+": "+row.points+" puntos");time.dateTime=row.day;fill.style.width=(max?row.points/max*100:0)+"%";bar.append(fill);line.append(time,bar,points);list.append(line);});panel.append(list);return panel;}
  function chronology(data){var panel=el("section","panel timeline"),head=el("div","period-heading");head.append(el("h2","","Cronología factual completa"),el("span","period-range",data.timeline.length+" eventos · más reciente primero"));panel.append(head);
    if(!data.timeline.length){panel.append(el("p","empty","No hay eventos factuales atribuibles en este periodo y proyecto."));return panel;}
    var list=el("ol","event-list");data.timeline.forEach(function(event){var item=el("li","event"),time=el("time","",new Date(event.at).toLocaleString("es-ES",{timeZone:data.timezone,day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}));time.dateTime=new Date(event.at).toISOString();
      var body=el("div"),title=el("strong","",event.type+" · "+event.title);body.append(title);if(event.id)body.append(el("small","",event.id));item.append(time,body,el("span","event-points",event.points?"+"+event.points+" pts":""));list.append(item);});panel.append(list);return panel;}
  function render(data,stateValue){target.replaceChildren();var back=document.querySelector(".back");back.href=backUrl(stateValue.projectId);
    target.append(hero(data,stateValue),periodNav(stateValue.period,selectPeriod));var grid=el("div","grid");grid.append(metricGrid(data.metrics),evolution(data),chronology(data));target.append(grid);
    target.append(el("p","score-sampled","Datos canónicos muestreados el "+new Date(data.sampledAt).toLocaleString("es-ES",{timeZone:data.timezone})+"."));}
  function endpoint(stateValue){return API+"/highscore/history?agent="+encodeURIComponent(stateValue.agent)+"&project_id="+encodeURIComponent(stateValue.projectId)+"&period="+encodeURIComponent(stateValue.period);}
  function load(stateValue){var revision=++requestRevision;target.classList.add("loading");return fetch(endpoint(stateValue),{cache:"no-store"}).then(function(response){if(!response.ok)throw new Error(String(response.status));return response.json();})
    .then(function(payload){if(revision!==requestRevision)return;var data=D.periodHistory(payload,stateValue,ID,Date.now());if(!data)throw new Error("Contrato histórico inválido");render(data,stateValue);})
    .catch(function(){if(revision!==requestRevision)return;periodFailure(stateValue);})
    .finally(function(){if(revision===requestRevision)target.classList.remove("loading");});}
  function selectPeriod(period){var value=current();if(value.period===period)return;value.period=period;setUrl(value,false);load(value);}
  function boot(replace){var value=current();if(!value.agent){state("Falta el agente","Abre el detalle desde el Highscore.");return;}if(!D.validAgent(value.agent,ID)){state("Identidad no válida","agent debe ser una identidad principal con apellido de equipo.");return;}
    if(!value.projectId){state("Falta el proyecto","El detalle factual necesita project_id exacto; vuelve al Highscore y abre el agente desde su proyecto.");return;}if(replace)setUrl(value,true);load(value);}
  window.addEventListener("popstate",function(){boot(false);});boot(true);
})();
