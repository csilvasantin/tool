/* yk-agent-identity.js — identidad visible = persona + equipo físico.
 *
 * Los nombres planos históricos se aceptan al leer. Toda UI nueva puede llamar:
 *   ykAgentIdentity.scoped("Oraculo", "Mac Mini")          → OraculoMini
 *   ykAgentIdentity.scoped("Oraculo", "Mac Mini", "sub")   → SubOraculoMini
 *   ykAgentIdentity.base("InfraOraculoMini")               → Oraculo
 */
(function (root) {
  "use strict";
  var MACHINES = [
    ["Mini",["macmini","mac mini","mac mini carlos","admira-macmini","macmini.local"]],
    ["14",["macbookpro14","macbook pro 14","macbookpronegro14","macbook pro negro 14","admira-macbookpronegro14"]],
    ["16",["macbookpro16","macbook pro 16","admira-macbookpro16","macbook-pro-16"]],
    ["Azul",["macbookairazul","macbook air azul","mba azul","admira-macbookairazul"]],
    ["Rosa",["macbookairrosa","macbook air rosa","mba rosa","admira-macbookairrosa"]],
    ["Crema",["macbookaircrema","macbook air crema","mba crema","admira-macbookaircrema"]],
    ["Plata",["macbookairplata","macbook air plata","mba plata","admira-macbookairplata"]],
    ["Plata16",["macbookair16plata","macbookair16","macbook air 16 dg","mba 16 plata","admira-macbookair16"]],
    ["Zenbook",["asuszenbook","asus zenbook","admira-asuszenbook"]],
    ["DGX",["dgxspark","dgx spark","dgx-spark"]],
    ["PGX",["thinkstationpgx","thinkstation pgx","thinkstation"]]
  ];
  var PERSONAS = [
    ["Oraculo",["oraculo","oráculo","oracle"]],
    ["Neo",["neo"]],["Morfeo",["morfeo","morpheus"]],["Trinity",["trinity"]],
    ["Smith",["smith","cypher","agente smith"]],
    ["WhiteRabbit",["whiterabbit","white rabbit"]]
  ];
  var AIR = {Azul:1,Rosa:1,Crema:1,Plata:1,Plata16:1};
  function key(v) {
    return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "");
  }
  function suffix(machine) {
    var k = key(machine);
    for (var i=0;i<MACHINES.length;i++) {
      for (var j=0;j<MACHINES[i][1].length;j++) {
        var a=key(MACHINES[i][1][j]);
        if(k===a || k.indexOf(a)===0 || a.indexOf(k)===0) return MACHINES[i][0];
      }
    }
    return "";
  }
  function parse(value) {
    var k=key(value), role="main";
    if(k.indexOf("infra")===0){role="infra";k=k.slice(5);}
    else if(k.indexOf("sub")===0){role="sub";k=k.slice(3);}
    k=k.replace(/^agente/,"");
    for(var i=0;i<PERSONAS.length;i++){
      var names=PERSONAS[i][1].map(function(x){return key(x).replace(/^agente/,"");})
        .sort(function(a,b){return b.length-a.length;});
      for(var j=0;j<names.length;j++) if(k.indexOf(names[j])===0){
        var tail=k.slice(names[j].length), sf="";
        for(var m=0;m<MACHINES.length;m++) if(key(MACHINES[m][0])===tail){sf=MACHINES[m][0];break;}
        return {role:role,persona:PERSONAS[i][0],suffix:sf,legacy:!sf};
      }
    }
    return {role:role,persona:String(value||""),suffix:"",legacy:true};
  }
  function scoped(persona,machine,role){
    var p=parse(persona), r=role||p.role||"main", sf=suffix(machine)||p.suffix;
    var main=p.persona==="Smith"&&AIR[sf]?"Agente Smith "+sf:p.persona+sf;
    return (r==="sub"?"Sub":r==="infra"?"Infra":"")+main;
  }
  function base(value){return parse(value).persona;}
  function same(a,b){return key(base(a))===key(base(b));}
  var api={key:key,suffix:suffix,parse:parse,scoped:scoped,base:base,same:same};
  root.ykAgentIdentity=api;
  if(typeof module!=="undefined"&&module.exports) module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
