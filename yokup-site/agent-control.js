/* Contrato seguro de control individual y masivo del Pulso.
 * No contiene fetch ni efectos al cargar: toda ejecución exige un transporte
 * inyectado y `confirmed:true`. Los secretos de proceso viven sólo en `targets`,
 * nunca en los items públicos que la UI puede llevar al DOM. */
(function(root){
  "use strict";

  var FRESH_SECONDS=30,MAX_BATCH=20,MAX_CONCURRENCY=4,
    CONTROL_STATUSES=new Set(["queued","accepted","running","stopping","stopped","done","failed","rejected","already_running","already_stopped"]),
    PUBLIC_ERRORS=new Set(["invalid-action","target-not-found","target-not-eligible","invalid-target","invalid-host","invalid-pid",
      "invalid-machine","invalid-persona","invalid-runtime","invalid-session_id","desktop-session-runtime-mismatch","unsafe-cli-session",
      "agent-offline-or-stale","ambiguous-agent-target","agent-changed-before-stop","presence-unavailable","presence-invalid",
      "start-service-unavailable","stop-service-unavailable","start-command-rejected","stop-command-rejected","agent-control-failed"]);
  function text(value){return String(value==null?"":value).trim();}
  function norm(value){return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
  function seconds(value){var number=Number(value)||0;return number>4102444800?Math.floor(number/1000):Math.floor(number);}
  function surface(value){value=norm(value);return value==="cli"||value==="app"?value:"unknown";}
  function hash(value){var result=2166136261;for(var char of String(value||"")){result^=char.charCodeAt(0);result=Math.imul(result,16777619);}return(result>>>0).toString(36);}
  function canonical(row,identity,machineOverride){
    row=row&&typeof row==="object"?row:{};
    var machine=text(machineOverride||row.machine),persona=text(row.persona||row.agent),runtime=text(row.runtime),host=surface(row.host);
    var agent=identity&&typeof identity.scoped==="function"?identity.scoped(persona,machine):persona;
    var machineKey=identity&&typeof identity.suffix==="function"?identity.suffix(machine):machine;
    var family=identity&&typeof identity.base==="function"?identity.base(persona):persona;
    var familyKey=identity&&typeof identity.key==="function"?identity.key(family):norm(family);
    return {agent:agent,persona:persona,family:family,family_key:familyKey,machine:machine,machine_key:norm(machineKey||machine),runtime:runtime,surface:host,
      public_key:[norm(agent),norm(machineKey||machine),norm(runtime),host].join("\u001f")};
  }
  function configuredTargets(controlMachines,identity){
    var out=[];
    (Array.isArray(controlMachines)?controlMachines:[]).forEach(function(machine){
      (machine&&Array.isArray(machine.slots)?machine.slots:[]).forEach(function(slot){
        var base=canonical(slot,identity,machine.machine),session=text(slot&&slot.session_id);
        out.push(Object.assign(base,{session_id:session,pid:0,configured:true,
          target_key:[base.public_key,session].join("\u001f")}));
      });
    });
    return out;
  }
  function observedTargets(presence,identity,nowSeconds){
    return (Array.isArray(presence)?presence:[]).map(function(row){
      var base=canonical(row,identity),updated=seconds(row&&row.updated),pid=Number(row&&row.pid),session=text(row&&row.session_id);
      var fresh=updated>0&&updated>=nowSeconds-FRESH_SECONDS&&updated<=nowSeconds+5;
      var verified=!!(row&&(row.verified===true||row.verified===1)&&row.source==="process_snapshot"&&row.online!==false&&row.online!==0);
      return Object.assign(base,{session_id:session,pid:pid,updated:updated,fresh:fresh,verified:verified,configured:false,
        target_key:[base.public_key,session,String(Number.isSafeInteger(pid)?pid:0)].join("\u001f")});
    });
  }
  function uniqueTargets(rows){
    var map=new Map();
    (rows||[]).forEach(function(row){var previous=map.get(row.target_key);if(!previous||row.updated>previous.updated)map.set(row.target_key,row);});
    return Array.from(map.values());
  }
  function validStart(target){
    if(!target||target.surface==="unknown"||!target.machine||!target.persona||!target.runtime||!target.session_id)return false;
    if(target.surface==="app")return target.session_id==="desktop:"+target.runtime.toLowerCase();
    return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(target.session_id);
  }
  function validStop(target){
    return !!(target&&target.surface!=="unknown"&&target.machine&&target.persona&&target.runtime&&target.session_id&&
      target.fresh&&target.verified&&Number.isSafeInteger(target.pid)&&target.pid>1);
  }
  function inventory(input,options){
    input=input||{};options=options||{};
    var identity=options.identity||root.ykAgentIdentity||null,detailUrl=typeof options.detailUrl==="function"?options.detailUrl:
      root.YkAgentDetail&&typeof root.YkAgentDetail.detailUrl==="function"?root.YkAgentDetail.detailUrl:null;
    var nowSeconds=seconds(options.now||Date.now()),configs=uniqueTargets(configuredTargets(input.controlMachines,identity)),
      observed=uniqueTargets(observedTargets(input.presence,identity,nowSeconds)),keys=new Set();
    configs.forEach(function(row){keys.add(row.public_key);});observed.forEach(function(row){keys.add(row.public_key);});
    var items=[],targets=new Map();
    keys.forEach(function(key){
      var configured=configs.filter(function(row){return row.public_key===key;}),seen=observed.filter(function(row){return row.public_key===key;}),
        live=seen.filter(validStop),identityRow=live[0]||configured[0]||seen[0],ambiguous=live.length>1||configured.length>1,
        unverified=seen.some(function(row){return !validStop(row);}),state,reason,start=false,stop=false,target=null;
      if(identityRow.surface==="unknown"){state="unknown";reason="unknown-surface";}
      else if(ambiguous){state="ambiguous";reason="ambiguous-target";}
      else if(live.length===1){state="active";reason="active-verified";stop=true;target=live[0];}
      else if(unverified){state="unknown";reason="presence-unverified-or-stale";}
      else if(configured.length===1&&validStart(configured[0])){state="stopped";reason="configured-stopped";start=true;target=configured[0];}
      else {state="unknown";reason=configured.length?"invalid-configured-target":"not-configured";}
      var controlKey="control:"+hash([key,target&&target.session_id||"",target&&target.pid||0,state].join("\u001f"));
      if(target)targets.set(controlKey,{machine:target.machine,persona:target.persona,runtime:target.runtime,host:target.surface,
        session_id:target.session_id,pid:target.pid});
      var href=detailUrl&&identityRow.surface!=="unknown"?text(detailUrl({persona:identityRow.persona,machine:identityRow.machine,
        runtime:identityRow.runtime,host:identityRow.surface})):"";
      items.push({control_key:controlKey,identity_key:key,agent:identityRow.agent,persona:identityRow.persona,
        family:identityRow.family,family_key:identityRow.family_key,machine:identityRow.machine,machine_key:identityRow.machine_key,
        runtime:identityRow.runtime,surface:identityRow.surface,state:state,reason:reason,
        eligible:{start:start,stop:stop},detail_url:href||null});
    });
    var order={cli:0,app:1,unknown:2};
    items.sort(function(a,b){return order[a.surface]-order[b.surface]||a.family_key.localeCompare(b.family_key,"es")||
      a.machine_key.localeCompare(b.machine_key,"es")||norm(a.runtime).localeCompare(norm(b.runtime),"es")||
      norm(a.agent).localeCompare(norm(b.agent),"es")||norm(a.state).localeCompare(norm(b.state),"es")||
      a.control_key.localeCompare(b.control_key,"es");});
    var counts={total:items.length,active:0,stopped:0,unknown:0,ambiguous:0,startable:0,stoppable:0};
    items.forEach(function(item){counts[item.state]=(counts[item.state]||0)+1;if(item.eligible.start)counts.startable++;if(item.eligible.stop)counts.stoppable++;});
    return {items:items,targets:targets,by_key:new Map(items.map(function(item){return[item.control_key,item];})),counts:counts};
  }
  function requestFor(model,controlKey,action){
    action=norm(action);var item=model&&model.by_key&&model.by_key.get(controlKey),target=model&&model.targets&&model.targets.get(controlKey);
    if(action!=="start"&&action!=="stop")throw new Error("invalid-action");
    if(!item||!target)throw new Error("target-not-found");
    if(!item.eligible[action])throw new Error("target-not-eligible");
    return {endpoint:"/fleet/agent/control",method:"POST",body:Object.assign({action:action},target)};
  }
  function batchPlan(model,group,action){
    group=surface(group);action=norm(action);
    if(group==="unknown"||action!=="start"&&action!=="stop")return {ok:false,error:"invalid-batch-scope",group:group,action:action,targets:[]};
    var targets=(model&&model.items||[]).filter(function(item){return item.surface===group&&item.eligible[action];})
      .slice(0,MAX_BATCH).map(function(item){return item.control_key;});
    return {ok:true,group:group,action:action,targets:targets,count:targets.length,truncated:(model&&model.items||[])
      .filter(function(item){return item.surface===group&&item.eligible[action];}).length>MAX_BATCH,
      confirmation:"Confirmar "+action+" de "+targets.length+" agente"+(targets.length===1?"":"s")+" del grupo "+group.toUpperCase()};
  }
  function publicError(error,fallback){
    var code=text(error&&error.code||error&&error.message||error).toLowerCase();
    return PUBLIC_ERRORS.has(code)?code:(fallback||"control-failed");
  }
  function publicCommandId(value){value=text(value);return value&&value.length<=100&&/^[A-Za-z0-9._:-]+$/.test(value)?value:null;}
  async function executeOne(model,controlKey,action,options){
    options=options||{};var ledger=options.ledger instanceof Map?options.ledger:new Map(),ledgerKey=norm(action)+":"+controlKey;
    if(options.confirmed!==true)return {control_key:controlKey,action:norm(action),status:"cancelled",ok:false,error:"confirmation-required"};
    if(typeof options.send!=="function")return {control_key:controlKey,action:norm(action),status:"failed",ok:false,error:"transport-required"};
    if(ledger.has(ledgerKey))return Object.assign({},ledger.get(ledgerKey),{reused:true});
    var request;try{request=requestFor(model,controlKey,action);}catch(error){return {control_key:controlKey,action:norm(action),status:"rejected",ok:false,error:publicError(error,"target-not-eligible")};}
    var pending={control_key:controlKey,action:norm(action),status:"sending",ok:false};ledger.set(ledgerKey,pending);
    try{
      var response=await options.send(request),rawStatus=norm(response&&response.status),status=CONTROL_STATUSES.has(rawStatus)?rawStatus:(response&&response.ok===false?"rejected":"accepted");
      var result={control_key:controlKey,action:norm(action),status:status,ok:response&&response.ok!==false,
        command_id:publicCommandId(response&&response.command_id),error:response&&response.ok===false?publicError(response.error,"control-rejected"):null};
      ledger.set(ledgerKey,result);return result;
    }catch(error){var failed={control_key:controlKey,action:norm(action),status:"failed",ok:false,error:publicError(error,"transport-failed")};ledger.set(ledgerKey,failed);return failed;}
  }
  async function executeBatch(model,plan,options){
    options=options||{};
    if(!plan||plan.ok!==true)return {ok:false,error:"invalid-batch-plan",results:[]};
    if(options.confirmed!==true)return {ok:false,error:"confirmation-required",results:[]};
    var keys=plan.targets.slice(0,MAX_BATCH),cursor=0,results=new Array(keys.length),concurrency=Math.max(1,Math.min(MAX_CONCURRENCY,Number(options.concurrency)||2));
    async function worker(){while(cursor<keys.length){var index=cursor++;results[index]=await executeOne(model,keys[index],plan.action,options);}}
    await Promise.all(Array.from({length:Math.min(concurrency,keys.length)},worker));
    var succeeded=results.filter(function(row){return row&&row.ok;}).length,failed=results.length-succeeded;
    return {ok:failed===0,total:results.length,succeeded:succeeded,failed:failed,partial:succeeded>0&&failed>0,results:results};
  }

  var api={inventory:inventory,requestFor:requestFor,batchPlan:batchPlan,executeOne:executeOne,executeBatch:executeBatch,
    limits:{fresh_seconds:FRESH_SECONDS,max_batch:MAX_BATCH,max_concurrency:MAX_CONCURRENCY}};
  root.YkAgentControl=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
