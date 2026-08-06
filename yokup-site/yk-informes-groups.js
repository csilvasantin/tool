(function(root){
  "use strict";
  function clean(value){return String(value==null?"":value).trim();}
  function identityFor(row,identity){
    var executor=clean(row.executor||row.agent_identity||row.owner),role=clean(row.executor_role||row.role);
    var parsed=identity&&identity.parse?identity.parse(executor):{persona:executor,role:"main",suffix:""};
    if(!/^(main|sub|infra)$/.test(role))role=parsed.role||"main";
    var familyKey=clean(row.family_key),familyName=clean(row.family_name);
    if(familyKey)return {key:familyKey,name:familyName||executor,executor:executor,role:role,canonical:true};
    var machine=clean(row.machine||row.target_machine||row.loc||row.mission_machine),suffix=identity&&identity.suffix?identity.suffix(machine):"";
    suffix=suffix||parsed.suffix||"";
    if(parsed.persona&&suffix){
      var personaKey=identity&&identity.key?identity.key(parsed.persona):clean(parsed.persona).toLowerCase();
      var name=identity&&identity.display?identity.display(parsed.persona,machine||suffix,"main"):parsed.persona+suffix;
      return {key:"legacy:"+personaKey+":"+suffix,name:name,executor:executor,role:role,canonical:false};
    }
    // Sin máquina/sufijo no se juntan capas por parecido: cada identidad exacta
    // queda aislada para no mezclar equipos durante el rollout legacy.
    var exact=identity&&identity.key?identity.key(executor):executor.toLowerCase();
    return {key:"legacy-exact:"+exact,name:executor||"Agente sin identificar",executor:executor,role:role,canonical:false};
  }
  function group(rows,identity){
    var map=new Map(),groups=[];
    rows.forEach(function(row){
      var meta=identityFor(row,identity),entry=map.get(meta.key);
      if(!entry){entry={key:meta.key,name:meta.name,canonical:meta.canonical,rows:[]};map.set(meta.key,entry);groups.push(entry);}
      entry.rows.push(Object.assign({},row,{_executor:meta.executor,_agent_role:meta.role}));
    });
    return groups;
  }
  root.YkInformesGroups={group:group,identityFor:identityFor};
})(typeof window!=="undefined"?window:globalThis);
