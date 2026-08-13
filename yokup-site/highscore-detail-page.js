/* Control de la vista periodizada del detalle. El servidor corta los hechos;
   esta capa conserva URL/estado y presenta el contrato sin inferencias locales. */
(function () {
  "use strict";
  var API="https://api.yokup.com", D=window.YkHighscoreDetail, ID=window.ykAgentIdentity;
  var target=document.getElementById("content"), requestRevision=0, activeData=null, activeScope="", nextWindowTimer=0;
  var SVG_NS="http://www.w3.org/2000/svg",chartSequence=0;
  var LABELS={today:"Hoy",yesterday:"Ayer",week:"Semana",month:"Mes",year:"Año"};
  var TYPE_LABELS={all:"Puntos",objective:"Objetivos",window:"Ventanas",mission:"Misiones",task:"Tareas"};
  function el(tag,cls,value){var node=document.createElement(tag);if(cls)node.className=cls;if(value!=null)node.textContent=String(value);return node;}
  function state(title,message){target.replaceChildren();var box=el("section","state"),heading=el("h1","",title);box.append(heading,el("p","",message));target.append(box);}
  function backUrl(projectId){return "/highscore?project_id="+encodeURIComponent(projectId);}
  function current(){return D.queryState(location.search);}
  function setUrl(next,replace){var url=D.detailUrl(next);history[replace?"replaceState":"pushState"]({period:next.period,type:next.type,order:next.order},"",url);return next;}
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
          if(payload.status==="created"||payload.status==="existing"){
            var destination=D.decisionUrl(payload,stateValue);if(!destination){status.textContent="La ventana recibida no es válida: falta su identificador.";return;}
            status.textContent="Validando la ventana exacta…";
            return fetch(API+"/decisions?all=1&since=0&limit=500&agent="+encodeURIComponent(stateValue.agent),{cache:"no-store"})
              .then(function(response){if(!response.ok)throw new Error("decision_"+response.status);return response.json();})
              .then(function(result){var decision=result&&Array.isArray(result.items)?result.items.find(function(item){return String(item&&item.id||"")===String(payload.decision_id);}):null;
                if(decision)decision.ok=true;var invalid=D.onIdleDecisionError(decision,stateValue,ID,payload.decision_id);if(invalid){status.textContent="La ventana recibida no es válida: "+invalid;return;}
                status.textContent=payload.status==="existing"?"Ya hay una ventana válida; abriéndola…":"Ventana creada por el scheduler; abriéndola…";window.location.assign(D.decisionUrl(payload,stateValue));})
              .catch(function(){status.textContent="La ventana recibida no es válida o no se pudo verificar. No se abrirá una lista vacía.";});}
          if(payload.status==="blocked"){status.textContent=onIdleMessage(payload.reason);return;}if(result.response.status===401){status.textContent="La sesión ha caducado. Inicia sesión y vuelve a solicitar.";return;}
          status.textContent="La solicitud no pudo completarse. Vuelve a intentarlo.";})
        .catch(function(){status.textContent="No se pudo contactar con el scheduler. Vuelve a intentarlo.";})
        .finally(function(){button.disabled=false;button.removeAttribute("aria-busy");});}
    button.addEventListener("click",function(){perform(requestId(),0);});return control;}
  function rankButton(symbol,className,neighbor,availableLabel,missingLabel){var visible=className==="previous-agent"?(neighbor?symbol+" #"+neighbor.position:symbol):(neighbor?"#"+neighbor.position+" "+symbol:symbol),button=el("button","rank-agent "+className,visible);button.type="button";
    if(!neighbor){button.disabled=true;button.setAttribute("aria-label",missingLabel);button.title=missingLabel;return button;}
    button.setAttribute("aria-label",availableLabel+neighbor.agent+", puesto "+neighbor.position+".");button.title="Ir a "+neighbor.agent+" · puesto "+neighbor.position;
    button.addEventListener("click",function(){selectAgent(neighbor.agent);});return button;}
  function rankNavigation(data,stateValue){var navigation=el("nav","rank-navigation"),previous=D.previousRankedAgent(data.ranking),next=D.nextRankedAgent(data.ranking);
    navigation.setAttribute("aria-label","Navegar por la clasificación factual de "+stateValue.projectId);
    navigation.append(rankButton("←","previous-agent",previous,"Subir una posición en la clasificación: ","No hay una posición superior en esta clasificación."),
      rankButton("→","next-agent",next,"Bajar una posición en la clasificación: ","No hay una posición inferior en esta clasificación."));return navigation;}
  function hero(data,stateValue){var hero=el("header","hero"),avatarStack=el("div","avatar-stack"),avatar=el("div","avatar",stateValue.agent.charAt(0).toUpperCase());
    var avatarUrl=window.ykAvatar&&window.ykAvatar.img(stateValue.agent);if(avatarUrl){var image=document.createElement("img");image.src=avatarUrl;image.alt="Avatar de "+stateValue.agent;avatar.replaceChildren(image);}
    var identity=el("div","identity"),eyebrow=el("div","eyebrow","Identidad canónica · "+stateValue.projectId),titleRow=el("div","identity-title-row"),title=el("h1","",stateValue.agent);
    avatarStack.append(avatar,rankNavigation(data,stateValue));titleRow.append(title,onIdleControl(stateValue));identity.append(eyebrow,titleRow,el("p","source","Actividad factual de "+LABELS[data.period].toLowerCase()+" · "+data.timezone+" · "+data.from+" → "+data.to));hero.append(avatarStack,identity);return hero;}
  function metricGrid(metrics,selected,onSelect){var fields={all:"points",objective:"objectives",window:"windows",mission:"missions",task:"tasks"};var grid=el("section","metric-grid");grid.setAttribute("aria-label","Filtrar cronología por tipo");
    D.types.forEach(function(type){var card=el("button","metric");card.type="button";card.dataset.type=type;card.setAttribute("aria-pressed",String(type===selected));card.setAttribute("aria-controls","factual-timeline");
      card.setAttribute("aria-label",TYPE_LABELS[type]+": "+metrics[fields[type]]+". "+(type==="all"?"Mostrar toda la cronología":"Filtrar la cronología"));card.append(el("b","",metrics[fields[type]]),el("span","",TYPE_LABELS[type]));
      card.addEventListener("click",function(){onSelect(type);});grid.append(card);});return grid;}
  function svgText(x,y,value,className){var node=document.createElementNS(SVG_NS,"text");node.setAttribute("x",String(x));node.setAttribute("y",String(y));if(className)node.setAttribute("class",className);node.textContent=String(value);return node;}
  function rankingSeriesChart(data,stateValue){var panel=el("section","panel ranking-series"),heading=el("div","period-heading"),title=el("h2","","Evolución comparada · "+LABELS[data.period]);
    heading.append(title,el("span","period-range",stateValue.projectId+" · periodo completo"));panel.append(heading);panel.setAttribute("aria-label","Evolución temporal de puntos de todos los agentes en "+LABELS[data.period]);
    var evolution=data.comparisonEvolution;if(!evolution){panel.append(el("p","empty","La evolución comparada factual no está disponible para este proyecto y periodo."));return panel;}
    if(!evolution.series.length){panel.append(el("p","empty","Ningún agente ha puntuado en este proyecto y periodo."));return panel;}
    var width=900,height=360,left=62,right=20,top=24,bottom=48,plotWidth=width-left-right,plotHeight=height-top-bottom;
    var maximum=Math.max.apply(null,evolution.series.map(function(row){return row.points;}));if(maximum<=0)maximum=1;
    var chartId="ranking-series-chart-"+(++chartSequence),titleId=chartId+"-title",descId=chartId+"-desc";
    var wrap=el("div","series-chart-wrap"),svg=document.createElementNS(SVG_NS,"svg");svg.classList.add("series-chart-svg");svg.setAttribute("viewBox","0 0 900 360");svg.setAttribute("role","img");svg.setAttribute("aria-labelledby",titleId+" "+descId);
    var svgTitle=document.createElementNS(SVG_NS,"title");svgTitle.id=titleId;svgTitle.textContent="Evolución acumulada de puntos · "+LABELS[data.period];
    var svgDesc=document.createElementNS(SVG_NS,"desc");svgDesc.id=descId;svgDesc.textContent=evolution.series.length+" agentes, desde "+evolution.labels[0].label+" hasta "+evolution.labels[evolution.labels.length-1].label+". La tabla posterior contiene todos los valores exactos.";svg.append(svgTitle,svgDesc);
    for(var tick=0;tick<=4;tick++){var y=top+plotHeight-(plotHeight*tick/4),tickValue=Math.round(maximum*tick/4),grid=document.createElementNS(SVG_NS,"line");grid.setAttribute("x1",String(left));grid.setAttribute("x2",String(width-right));grid.setAttribute("y1",String(y));grid.setAttribute("y2",String(y));grid.setAttribute("class","series-grid-line");svg.append(grid,svgText(left-10,y+4,tickValue,"series-axis-y"));}
    var xStep=evolution.labels.length>1?plotWidth/(evolution.labels.length-1):0,labelEvery=Math.max(1,Math.ceil(evolution.labels.length/6));
    evolution.labels.forEach(function(label,index){if(index%labelEvery!==0&&index!==evolution.labels.length-1)return;var x=evolution.labels.length>1?left+xStep*index:left+plotWidth/2;svg.append(svgText(x,height-18,label.label,"series-axis-x"));});
    var palette=["#78f3ff","#ffd866","#88ffaa","#ff8b6b","#bd93f9","#ff79c6","#8be9fd","#f1fa8c"];
    evolution.series.forEach(function(row,index){var color=palette[index%palette.length],points=row.values.map(function(value,valueIndex){var x=evolution.labels.length>1?left+xStep*valueIndex:left+plotWidth/2,y=top+plotHeight-(value/maximum*plotHeight);return {x:x,y:y,value:value};});
      var line=document.createElementNS(SVG_NS,"polyline");line.classList.add("series-line-"+index);line.classList.add("series-line");if(row.current)line.classList.add("current");line.setAttribute("points",points.map(function(point){return point.x+","+point.y;}).join(" "));line.setAttribute("fill","none");line.setAttribute("stroke",color);line.setAttribute("stroke-width",row.current?"5":"2.5");line.setAttribute("stroke-linejoin","round");line.setAttribute("stroke-linecap","round");svg.append(line);
      points.forEach(function(point,valueIndex){var marker=document.createElementNS(SVG_NS,"circle");marker.setAttribute("cx",String(point.x));marker.setAttribute("cy",String(point.y));marker.setAttribute("r",row.current?"5":"3.5");marker.setAttribute("fill",color);marker.setAttribute("role","img");marker.setAttribute("aria-label",row.agent+", "+evolution.labels[valueIndex].label+": "+point.value+" puntos");var tooltip=document.createElementNS(SVG_NS,"title");tooltip.textContent=row.agent+" · "+evolution.labels[valueIndex].label+" · "+point.value+" puntos";marker.append(tooltip);svg.append(marker);});
    });wrap.append(svg);panel.append(wrap);
    var legend=el("ul","series-legend");evolution.series.forEach(function(row,index){var item=el("li",row.current?"current":""),swatch=el("span","series-color-"+(index%8)),name=el("strong","",row.agent),score=el("span","","#"+row.position+" · "+row.points+" pts");swatch.setAttribute("aria-hidden","true");if(row.current)item.setAttribute("aria-current","true");item.append(swatch,name,score);legend.append(item);});panel.append(legend);
    var details=document.createElement("details"),summary=el("summary","","Ver datos exactos del gráfico"),table=el("table","series-data-table"),caption=el("caption","","Evolución acumulada por fecha y agente"),head=document.createElement("thead"),headRow=document.createElement("tr");headRow.append(el("th","","Fecha"));evolution.series.forEach(function(row){headRow.append(el("th",row.current?"current":"",row.agent));});head.append(headRow);var body=document.createElement("tbody");
    evolution.labels.forEach(function(label,labelIndex){var row=document.createElement("tr"),time=document.createElement("time");time.dateTime=new Date(label.at).toISOString();time.textContent=label.label;var dateCell=document.createElement("th");dateCell.scope="row";dateCell.append(time);row.append(dateCell);evolution.series.forEach(function(series){row.append(el("td",series.current?"current":"",series.values[labelIndex]+" pts"));});body.append(row);});table.append(caption,head,body);details.append(summary,table);panel.append(details);return panel;}
  function latestWorkPanel(data,stateValue){var work=data.latestWork;if(!work||work.projectId===stateValue.projectId)return null;
    var panel=el("aside","latest-work"),body=el("div","latest-work-body"),heading=el("h2","","Trabajo más reciente en otro proyecto");
    var project=el("strong","latest-work-project",work.projectName+" · "+work.projectId),title=el("p","latest-work-title",(work.reference?work.reference+" · ":"")+work.title);
    var when=new Date(work.at).toLocaleString("es-ES",{timeZone:data.timezone,dateStyle:"medium",timeStyle:"medium"});
    var status=work.status==="running"?"En curso":"Finalizado",meta=el("p","latest-work-meta",status+" · "+when+(work.executor?" · ejecuta "+work.executor:""));
    var link=el("a","latest-work-link","Abrir histórico de "+work.projectName+" →");link.href=work.detailUrl;
    link.setAttribute("aria-label","Abrir el histórico factual de "+stateValue.agent+" en "+work.projectName);
    body.append(heading,project,title,meta);panel.append(body,link);panel.setAttribute("aria-label","Contexto de trabajo más reciente fuera del proyecto actual");return panel;}
  function orderText(order){return order==="asc"?"más antiguo primero":"más reciente primero";}
  function orderButton(order,onSelect,label){var button=el("button","chronology-order","Fecha · "+orderText(order)+(order==="asc"?" ↑":" ↓"));button.type="button";button.dataset.order=order;
    button.setAttribute("aria-label",label+". Orden actual: "+orderText(order)+". Pulsar para invertir.");button.addEventListener("click",onSelect);return button;}
  function dateButton(label,order,onSelect){var button=el("button","group-date",label);button.type="button";button.setAttribute("aria-label",label+". Orden actual: "+orderText(order)+". Pulsar para invertir.");button.addEventListener("click",onSelect);return button;}
  function evolution(data,type,order,onOrder){var metricLabel=type==="all"?"puntos":TYPE_LABELS[type].toLowerCase(),panel=el("section","panel score-evolution"),head=el("div","period-heading"),heading=el("h2","","Evolución de "+metricLabel),controls=el("div","period-heading-controls");
    controls.append(el("span","period-range",data.from+" — "+data.to),orderButton(order,onOrder,"Ordenar evolución por fecha"));head.append(heading,controls);panel.append(head);
    var groups=D.evolutionGroups(data.evolution,data.period,order);if(!groups.length){panel.append(el("p","empty","No hay intervalos factuales devueltos por el servidor en este periodo."));return panel;}
    var list=el("div","score-days"),max=Math.max.apply(null,groups.map(function(row){return D.metricForType(row,type);}));list.setAttribute("role","list");
    groups.forEach(function(row){var value=D.metricForType(row,type),line=el("div","score-day"),date=dateButton(row.label,order,onOrder),bar=el("div","score-day-bar"),fill=el("i"),points=el("b","",value+(type==="all"?" pts":""));
      line.setAttribute("role","listitem");line.setAttribute("aria-label",row.label+": "+value+" "+metricLabel);date.dataset.start=row.start;date.dataset.end=row.end;fill.style.width=(max?value/max*100:0)+"%";bar.append(fill);line.append(date,bar,points);list.append(line);});panel.append(list);return panel;}
  function chronology(data,type,order,onOrder){var events=D.timelineForType(data.timeline,type),title=type==="all"?"Cronología factual completa":"Cronología · "+TYPE_LABELS[type],panel=el("section","panel timeline");panel.id="factual-timeline";panel.setAttribute("aria-live","polite");var head=el("div","period-heading"),controls=el("div","period-heading-controls");controls.append(el("span","period-range",events.length+" eventos · "+orderText(order)),orderButton(order,onOrder,"Ordenar cronología por fecha"));head.append(el("h2","",title),controls);panel.append(head);
    if(!events.length){panel.append(el("p","empty","No hay eventos de "+TYPE_LABELS[type].toLowerCase()+" en este periodo y proyecto."));return panel;}
    var grouped=el("div","timeline-groups");D.timelineGroups(events,data.period,order).forEach(function(group){var section=el("section","timeline-group"),groupHead=el("h3","timeline-group-heading"),list=el("ol","event-list");groupHead.append(dateButton(group.label,order,onOrder));
      group.events.forEach(function(event){var item=el("li","event"),time=el("time","",new Date(event.at).toLocaleString("es-ES",{timeZone:data.timezone,day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}));time.dateTime=new Date(event.at).toISOString();
        var body=el("div"),eventTitle=el("strong","",event.type+" · "+event.title);body.append(eventTitle);if(event.id)body.append(el("small","",event.id));item.append(time,body,el("span","event-points",event.points?"+"+event.points+" pts":""));list.append(item);});section.append(groupHead,list);grouped.append(section);});panel.append(grouped);return panel;}
  function render(data,stateValue){target.replaceChildren();var back=document.querySelector(".back");back.href=backUrl(stateValue.projectId);
    target.append(hero(data,stateValue),periodNav(stateValue.period,selectPeriod),rankingSeriesChart(data,stateValue));var recent=latestWorkPanel(data,stateValue);if(recent)target.append(recent);var grid=el("div","grid");grid.append(metricGrid(data.metrics,stateValue.type,selectType),evolution(data,stateValue.type,stateValue.order,selectOrder),chronology(data,stateValue.type,stateValue.order,selectOrder));target.append(grid);
    target.append(el("p","score-sampled","Datos canónicos muestreados el "+new Date(data.sampledAt).toLocaleString("es-ES",{timeZone:data.timezone})+"."));}
  function endpoint(stateValue){return API+"/highscore/history?agent="+encodeURIComponent(stateValue.agent)+"&project_id="+encodeURIComponent(stateValue.projectId)+"&period="+encodeURIComponent(stateValue.period);}
  function load(stateValue){var revision=++requestRevision;target.classList.add("loading");return fetch(endpoint(stateValue),{cache:"no-store"}).then(function(response){if(!response.ok)throw new Error(String(response.status));return response.json();})
    .then(function(payload){if(revision!==requestRevision)return;var data=D.periodHistory(payload,stateValue,ID,Date.now());if(!data)throw new Error("Contrato histórico inválido");activeData=data;activeScope=stateValue.agent+"|"+stateValue.projectId+"|"+stateValue.period;render(data,stateValue);})
    .catch(function(){if(revision!==requestRevision)return;periodFailure(stateValue);})
    .finally(function(){if(revision===requestRevision)target.classList.remove("loading");});}
  function selectPeriod(period){var value=current();if(value.period===period)return;value.period=period;setUrl(value,false);load(value);}
  function selectAgent(agent){var value=current();if(value.agent===agent)return;value.agent=agent;setUrl(value,false);activeData=null;activeScope="";load(value);}
  function selectType(type){var value=current();if(value.type===type)return;value.type=type;setUrl(value,false);if(activeData)render(activeData,value);}
  function selectOrder(){var value=current();value.order=value.order==="desc"?"asc":"desc";setUrl(value,false);if(activeData)render(activeData,value);}
  function boot(replace){var value=current();if(!value.agent){state("Falta el agente","Abre el detalle desde el Highscore.");return;}if(!D.validAgent(value.agent,ID)){state("Identidad no válida","agent debe ser una identidad principal con apellido de equipo.");return;}
    if(!value.projectId){state("Falta el proyecto","El detalle factual necesita project_id exacto; vuelve al Highscore y abre el agente desde su proyecto.");return;}if(replace)setUrl(value,true);var scope=value.agent+"|"+value.projectId+"|"+value.period;if(activeData&&activeScope===scope)render(activeData,value);else load(value);}
  window.addEventListener("popstate",function(){boot(false);});boot(true);
})();
