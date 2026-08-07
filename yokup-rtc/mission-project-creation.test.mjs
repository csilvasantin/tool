import test from "node:test";
import assert from "node:assert/strict";
import worker from "./src/index.js";

function harness() {
  const state = { tickets:[], refs:new Map(), fleetIds:new Map(), decisions:new Map(), batches:new Map(), items:[], novelties:[], nextNoveltyCursor:1, atomicBatches:[], allowDeclaration:false, allowInherited:false, batchCalls:0, ticketBatches:0,
    projects:[{id:"xpaceos",name:"XpaceOS",status:"activo"}],
    members:[{project_id:"xpaceos",kind:"agent",ref:"OraculoMacMini"},{project_id:"xpaceos",kind:"machine",ref:"admira-macmini"}] };
  const statement = (sql, args=[]) => ({
    sql, args, bind(...next) { return statement(sql, next); },
    async first() {
      if (sql === "SELECT id FROM tickets WHERE screen=? AND status!='resolved'") return null;
      if (sql === "SELECT id,name,status FROM projects WHERE id=?")
        return state.projects.find(project=>project.id===args[0])||null;
      // La declaración de OTRO día (ORDER BY d.day DESC) es la herencia; la de hoy
      // se distingue por no llevarlo. Dos interruptores separados para poder probar
      // el caso real: sin declaración de hoy, pero con una anterior.
      if (sql.includes("FROM agent_project_declarations d JOIN projects") && sql.includes("ORDER BY d.day DESC"))
        return state.allowInherited?{project_id:"xpaceos",day:"2026-08-05"}:null;
      if (sql.includes("FROM agent_project_declarations d JOIN projects")) return state.allowDeclaration?{project_id:"xpaceos"}:null;
      if (sql === "SELECT * FROM decisions WHERE id=?") return state.decisions.get(args[0])||null;
      if (sql === "SELECT project,parent_decision FROM decisions WHERE id=?") {const d=state.decisions.get(args[0]);return d&&{project:d.project,parent_decision:d.parent_decision};}
      if (sql === "SELECT id,agent,machine,project,parent_decision FROM decisions WHERE id=?") {const d=state.decisions.get(args[0]);return d&&{id:d.id,agent:d.agent,machine:d.machine,project:d.project,parent_decision:d.parent_decision};}
      if (sql === "SELECT id,agent,machine,project FROM decisions WHERE id=?") {const d=state.decisions.get(args[0]);return d&&{id:d.id,agent:d.agent,machine:d.machine,project:d.project};}
      if (sql === "SELECT * FROM mission_batches WHERE id=?") return state.batches.get(args[0])||null;
      if (sql === "SELECT id,status,active_mission_id FROM mission_batches WHERE id=?") {const b=state.batches.get(args[0]);return b&&{id:b.id,status:b.status,active_mission_id:b.active_mission_id};}
      if (sql === "SELECT mission_id FROM mission_novelty_events WHERE decision_id=? LIMIT 1") {const n=state.novelties.find(row=>row.decision_id===args[0]);return n&&{mission_id:n.mission_id};}
      if (sql === "SELECT id,decision_id,agent,machine,project_id FROM mission_batches WHERE id=?") {const b=state.batches.get(args[0]);return b&&{id:b.id,decision_id:b.decision_id,agent:b.agent,machine:b.machine,project_id:b.project_id};}
      if (sql.includes("SELECT 1 AS x FROM mission_batch_items")) return state.items.some(row=>row.batch_id===args[0])?{x:1}:null;
      if (sql.includes("FROM mission_batch_items WHERE batch_id=? AND status='active'")) return state.items.find(row=>row.batch_id===args[0]&&row.status==="active")||null;
      if (sql.includes("FROM mission_batch_items WHERE batch_id=? AND (mission_id=? OR target_mission_id=?)"))
        return state.items.find(row=>row.batch_id===args[0]&&(row.mission_id===args[1]||row.target_mission_id===args[2]))||null;
      if (sql.includes("FROM mission_batch_items WHERE (target_mission_id=? OR mission_id=?)") && sql.includes("batch_id!=?"))
        return state.items.find(row=>row.status==="active"&&row.batch_id!==args[2]&&(row.target_mission_id===args[0]||row.mission_id===args[1]))||null;
      if (sql === "SELECT mission_id FROM fleet_ids WHERE inbox_id=?") return state.fleetIds.has(args[0])?{mission_id:state.fleetIds.get(args[0])}:null;
      if (sql.includes("FROM tickets WHERE id=?")) return state.tickets.find(row=>row.id===args.at(-1))||null;
      if (sql.includes("SELECT MAX(")) return {mx:0};
      if (sql.includes("UPDATE display_ref_counters") && sql.includes("RETURNING")) return { start_seq:0 };
      if (sql.includes("SELECT assignee,loc FROM tickets")) {
        const t=state.tickets.find(row=>row.id===args[0]); return t && {assignee:t.assignee,loc:t.loc};
      }
      return null;
    },
    async all() {
      if (sql === "SELECT * FROM projects") return {results:state.projects};
      if (sql === "SELECT project_id,kind,ref FROM project_members") return {results:state.members};
      if (sql.includes("SELECT entity_type,entity_key,display_ref FROM display_refs")) {
        const type=args[0]; return {results:args.slice(1).flatMap(key=>state.refs.has(type+":"+key)?[{entity_type:type,entity_key:key,display_ref:state.refs.get(type+":"+key)}]:[])};
      }
      if (sql.includes("FROM mission_batch_items i JOIN mission_batches") && sql.includes("i.target_mission_id=?")) return {results:state.items.filter(row=>row.target_mission_id===args[0]&&row.status==="active").map(row=>({...row,decision_id:state.batches.get(row.batch_id)?.decision_id,project_id:state.batches.get(row.batch_id)?.project_id,batch_status:state.batches.get(row.batch_id)?.status,active_mission_id:state.batches.get(row.batch_id)?.active_mission_id}))};
      if (sql.includes("SELECT DISTINCT target_mission_id FROM mission_batch_items")) return {results:[...new Set(state.items.filter(row=>row.status==="active"&&row.target_mission_id).map(row=>row.target_mission_id))].map(target_mission_id=>({target_mission_id}))};
      if (sql.includes("FROM mission_batch_items i LEFT JOIN tickets")) return {results:state.items.filter(row=>row.batch_id===args[0]&&row.status==="queued").sort((a,b)=>a.position-b.position).map(row=>({...row,ticket_status:state.tickets.find(ticket=>ticket.id===row.mission_id)?.status||null}))};
      if (sql.includes("FROM mission_batch_items WHERE batch_id=? ORDER BY position")) return {results:state.items.filter(row=>row.batch_id===args[0]).sort((a,b)=>a.position-b.position)};
      return { results:[] };
    },
    async run() { apply(sql,args); return {meta:{changes:1}}; }
  });
  function apply(sql,args) {
    if (sql.startsWith("INSERT OR IGNORE INTO tickets") || sql.startsWith("INSERT INTO tickets")) {
      const cols=sql.slice(sql.indexOf("(")+1,sql.indexOf(")")).split(",");
      const row=Object.fromEntries(cols.map((col,i)=>[col,args[i]]));
      if(!sql.startsWith("INSERT OR IGNORE")||!state.tickets.some(x=>x.id===row.id))state.tickets.push(row);
    }
    if (sql.startsWith("INSERT OR IGNORE INTO mission_novelty_events")) {
      const [event_key,decision_id,batch_id,mission_id]=args, ticket=state.tickets.find(x=>x.id===mission_id);
      if(ticket&&!state.novelties.some(x=>x.event_key===event_key))state.novelties.push({cursor:state.nextNoveltyCursor++,event_key,mission_id,created_at:ticket.created_at,source:ticket.source,decision_id,batch_id});
    }
    if (sql.startsWith("INSERT OR IGNORE INTO display_refs")) state.refs.set(args[0]+":"+args[1],args[5]);
    if (sql.startsWith("INSERT OR IGNORE INTO fleet_ids")) state.fleetIds.set(args[0],args[1]);
    if (sql.startsWith("UPDATE decisions SET status=?,")) {const d=state.decisions.get(args[4]);Object.assign(d,{status:args[0],chosen:args[1],chosen_by:args[2],decided_at:args[3]});}
    if (sql.startsWith("UPDATE decisions SET status='expired'")) {const d=state.decisions.get(args[0]);if(d&&d.status==="pending")d.status="expired";}
    if (sql.startsWith("UPDATE decisions SET batch_id=")) state.decisions.get(args[1]).batch_id=args[0];
    if (sql.startsWith("INSERT OR IGNORE INTO mission_batches")) state.batches.set(args[0],{id:args[0],decision_id:args[1],agent:args[2],machine:args[3],project_id:args[4],status:"active",active_mission_id:null});
    if (sql.startsWith("INSERT INTO mission_batch_items")) {
      const cols=sql.slice(sql.indexOf("(")+1,sql.indexOf(")")).split(",");
      const row=Object.fromEntries(cols.map((col,i)=>[col,args[i]]));
      state.items.push({...row,status:"queued",mission_id:null});
    }
    if (sql.startsWith("UPDATE mission_batch_items SET position=?")) {const row=state.items.find(x=>x.batch_id===args.at(-2)&&x.position===args.at(-1));if(row)row.position=args[0];}
    if (sql.startsWith("UPDATE mission_batch_items SET mission_id=?,target_mission_id=?,status=?")) {const row=state.items.find(x=>x.batch_id===args[4]&&x.position===args[5]);if(row)Object.assign(row,{mission_id:args[0],target_mission_id:args[1],status:args[2]});}
    else if (sql.startsWith("UPDATE mission_batch_items SET mission_id=?,target_mission_id=?,status='active'")) {const row=state.items.find(x=>x.batch_id===args[3]&&x.mission_id===args[4]);if(row)Object.assign(row,{mission_id:args[0],target_mission_id:args[1],status:"active"});}
    else if (sql.startsWith("UPDATE mission_batch_items SET mission_id=")) {const row=state.items.find(x=>x.batch_id===args[2]&&x.position===args[3]);if(row)Object.assign(row,{mission_id:args[0],status:"active"});}
    if (sql.startsWith("UPDATE mission_batch_items SET status='completed'")) {const row=state.items.find(x=>x.batch_id===args[1]&&x.target_mission_id===args[2]&&x.mission_id===args[3]&&x.status==="active");if(row)row.status="completed";}
    if (sql.startsWith("UPDATE mission_batches SET status=?,pause_reason=NULL,active_mission_id=")) {const row=state.batches.get(args[3]);if(row)Object.assign(row,{status:args[0],active_mission_id:args[1]});}
    else if (sql.startsWith("UPDATE mission_batches SET active_mission_id=NULL")) {const row=state.batches.get(args[1]);if(row&&row.active_mission_id===args[2])row.active_mission_id=null;}
    else if (sql.startsWith("UPDATE mission_batches SET active_mission_id=")) state.batches.get(args[2]).active_mission_id=args[0];
    if (sql.startsWith("UPDATE mission_batches SET status='completed'")) {const row=state.batches.get(args.at(-1));if(row)Object.assign(row,{status:"completed",active_mission_id:null});}
    if (sql.startsWith("UPDATE mission_batches SET status='awaiting_continuation'")) {const row=state.batches.get(args.at(-1));if(row)Object.assign(row,{status:"awaiting_continuation",active_mission_id:null});}
    if (sql.startsWith("UPDATE tickets SET status='cancelled',closure_reason='equivalent_mission'")) {const row=state.tickets.find(x=>x.id===args[3]);if(row)Object.assign(row,{status:"cancelled",closure_reason:"equivalent_mission",note:args[1]});}
    if (sql.startsWith("UPDATE mission_batches SET status='active'")) {const row=state.batches.get(args[1]);if(row&&row.status==="awaiting_continuation")row.status="active";}
  }
  const DB={
    async exec(){}, prepare(sql){return statement(sql);},
    async batch(items){state.batchCalls++; state.atomicBatches.push(items.map(item=>item.sql)); if(items.some(item=>item.sql.startsWith("INSERT INTO tickets")))state.ticketBatches++; for(const item of items) apply(item.sql,item.args); return items.map(()=>({meta:{changes:1}}));}
  };
  return {env:{DB},state};
}

const {env,state}=harness();
const post=(path,body)=>worker.fetch(new Request("https://api.yokup.test"+path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),env,{});

test("POST /incident nace con project_id en el INSERT", async()=>{
  const response=await post("/incident",{subject:"Web caída",resource:"svc:xpaceos",kind:"service",project_id:"xpaceos"});
  assert.equal(response.status,200);
  const ticket=state.tickets.at(-1);
  assert.equal(ticket.project_id,"xpaceos"); assert.equal(ticket.project,"xpaceos");
  assert.equal(ticket.loc,"");
});

test("POST /incident falla cerrado antes del INSERT sin proyecto", async()=>{
  const before=state.tickets.length;
  const response=await post("/incident",{subject:"Sin contexto",resource:"svc:unknown",kind:"service"});
  assert.equal(response.status,400); assert.equal((await response.json()).code,"project_required");
  assert.equal(state.tickets.length,before);
});

test("POST /incident hereda la declaración principal vigente de agente+máquina", async()=>{
  state.allowDeclaration=true;
  const response=await post("/incident",{subject:"Alerta agente",resource:"agent:oraculo",kind:"agent",agent:"OraculoMacMini",machine:"admira-macmini"});
  state.allowDeclaration=false;
  assert.equal(response.status,200);
  assert.equal(state.tickets.at(-1).project_id,"xpaceos");
});

test("POST /declare crea ticket, proyecto, plan y evento en un solo batch", async()=>{
  const beforeBatches=state.ticketBatches;
  const response=await post("/declare",{agent:"OraculoMacMini",machine:"admira-macmini",project_id:"xpaceos",subject:"Publicar XpaceOS",tasks:[{code:"a",title:"Preparar",status:"pending"}]});
  assert.equal(response.status,200,await response.text());
  const ticket=state.tickets.find(row=>row.source==="cli-declare");
  assert.equal(ticket.project_id,"xpaceos"); assert.equal(ticket.project,"xpaceos");
  assert.equal(state.ticketBatches,beforeBatches+1);
});

test("POST /declare rechaza proyecto activo no asignado al agente+máquina", async()=>{
  const before=state.tickets.length;
  const response=await post("/declare",{agent:"NeoMacMini",machine:"admira-macmini",project_id:"xpaceos",subject:"No autorizado",tasks:[{code:"a",title:"No crear",status:"pending"}]});
  assert.equal(response.status,400); assert.equal((await response.json()).code,"exact_project_required");
  assert.equal(state.tickets.length,before);
});

test("POST /declare rechaza parent_id ajeno antes de escribir", async()=>{
  state.tickets.push({id:"FLT-PARENT-FOREIGN",assignee:"Oraculo16",loc:"MacBookPro16",project:"xpaceos",project_id:"xpaceos",source:"fleet"});
  const before=state.tickets.length;
  const response=await post("/declare",{agent:"OraculoMacMini",machine:"admira-macmini",parent_id:"FLT-PARENT-FOREIGN",subject:"No heredar padre ajeno",tasks:[{code:"a",title:"No crear",status:"pending"}]});
  assert.equal(response.status,403); assert.equal((await response.json()).code,"foreign_parent_context");
  assert.equal(state.tickets.length,before);
});

test("POST /declare rechaza decision_id ajeno antes de escribir", async()=>{
  state.decisions.set("DEC-FOREIGN",{id:"DEC-FOREIGN",agent:"NeoMini",machine:"admira-macmini",project:"xpaceos",status:"pending"});
  const before=state.tickets.length;
  const response=await post("/declare",{agent:"OraculoMacMini",machine:"admira-macmini",decision_id:"DEC-FOREIGN",subject:"No heredar decisión ajena",tasks:[{code:"a",title:"No crear",status:"pending"}]});
  assert.equal(response.status,403); assert.equal((await response.json()).code,"foreign_decision_context");
  assert.equal(state.tickets.length,before);
});

test("POST /declare permite padre propio y persiste parent_id", async()=>{
  state.tickets.push({id:"FLT-PARENT-OWN",assignee:"OraculoMacMini",loc:"admira-macmini",project:"xpaceos",project_id:"xpaceos",source:"fleet"});
  const response=await post("/declare",{agent:"OraculoMacMini",machine:"admira-macmini",parent_id:"FLT-PARENT-OWN",subject:"Hija trazable",tasks:[{code:"a",title:"Preparar hija",status:"pending"}]});
  assert.equal(response.status,200,await response.text());
  const ticket=state.tickets.filter(row=>row.source==="cli-declare").at(-1);
  assert.equal(ticket.project_id,"xpaceos"); assert.equal(ticket.parent_id,"FLT-PARENT-OWN");
});

test("POST /declare permite declaración principal vigente con identidad exacta", async()=>{
  state.allowDeclaration=true;
  const response=await post("/declare",{agent:"OraculoMacMini",machine:"admira-macmini",subject:"Trabajo principal del día",tasks:[{code:"a",title:"Ejecutar",status:"pending"}]});
  state.allowDeclaration=false;
  assert.equal(response.status,200,await response.text());
  const ticket=state.tickets.filter(row=>row.source==="cli-declare").at(-1);
  assert.equal(ticket.project_id,"xpaceos"); assert.equal(ticket.parent_id,null);
});

test("POST /fleet/sync materializa project_id estructurado y rechaza el huérfano", async()=>{
  env.TELEGRAM={async fetch(){return Response.json({items:[
    {id:701,text:"Publicar nueva versión",target_persona:"Oraculo",target_machine:"admira-macmini",project_id:"xpaceos",from_name:"Carlos",status:"pending",ts:Date.now()},
    {id:702,text:"Texto Yokup: no debe adivinar",target_persona:"Oraculo",target_machine:"admira-macmini",from_name:"Carlos",status:"pending",ts:Date.now()}
  ]})}};
  const response=await post("/fleet/sync",{}), result=await response.json();
  assert.equal(response.status,200); assert.equal(result.created,1);
  assert.equal(result.rejected.length,1); assert.equal(result.rejected[0].code,"project_required");
  const ticket=state.tickets.find(row=>row.source==="fleet");
  assert.equal(ticket.project_id,"xpaceos"); assert.equal(ticket.project,"xpaceos");
  assert.equal(state.fleetIds.has(702),false,"el rechazado ni siquiera reserva mission_id");
});

const historicalProjects=[{id:"xpaceos",name:"XpaceOS",status:"activo"},{id:"admira-store",name:"Admira Store",status:"activo"}];
const historicalMembers=[
  {project_id:"xpaceos",kind:"agent",ref:"OraculoMacMini"},{project_id:"xpaceos",kind:"machine",ref:"admira-macmini"},
  {project_id:"xpaceos",kind:"agent",ref:"TrinityAzul"},{project_id:"xpaceos",kind:"machine",ref:"macbookairazul"},
  {project_id:"admira-store",kind:"agent",ref:"TrinityAzul"},{project_id:"admira-store",kind:"machine",ref:"macbookairazul"}
];
async function syncHistorical(items){
  const box=harness(); box.state.projects=historicalProjects; box.state.members=historicalMembers;
  box.env.TELEGRAM={async fetch(){return Response.json({items});}};
  const response=await worker.fetch(new Request("https://api.yokup.test/fleet/sync",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}),box.env,{});
  return {response,result:await response.json(),...box};
}

test("fleet/sync backfill: histórico inequívoco adopta el project_id explícitamente reparado",async()=>{
  const item={id:1196,text:"Histórico con backfill inequívoco",target_persona:"OraculoMacMini",target_machine:"admira-macmini",project_id:"xpaceos",from_name:"Carlos",status:"pending",ts:Date.now()};
  const {response,result,state}=await syncHistorical([item]);
  assert.equal(response.status,200); assert.equal(result.partial,false); assert.equal(result.rejected.length,0);
  const ticket=state.tickets.find(row=>row.source==="fleet");
  assert.equal(ticket?.project_id,"xpaceos"); assert.equal(ticket?.project,"xpaceos");
});

test("fleet/sync backfill: #1197 ambiguo no inventa proyecto ni deja partial",async()=>{
  const item={id:1197,text:"Primera misión: sincronizar admira.store y XpaceOS",target_persona:"Trinity",target_machine:"macbookairazul",project_id:null,materialize_mission:false,materialize_reason:"ambiguous_project",from_name:"status-web",status:"pending",ts:Date.now()};
  const {response,result,state}=await syncHistorical([item]);
  assert.equal(response.status,200); assert.equal(result.partial,false); assert.equal(result.rejected.length,0);
  assert.equal(state.tickets.length,0); assert.equal(state.fleetIds.has(1197),false);
});

test("fleet/sync backfill no altera otros inbox con proyecto explícito",async()=>{
  const inbox=[
    {id:1197,text:"Primera misión: sincronizar admira.store y XpaceOS",target_persona:"Trinity",target_machine:"macbookairazul",project_id:null,materialize_mission:false,materialize_reason:"ambiguous_project",from_name:"status-web",status:"pending",ts:Date.now()},
    {id:1198,text:"Encargo explícito independiente",target_persona:"Trinity",target_machine:"macbookairazul",project_id:"admira-store",from_name:"Carlos",status:"pending",ts:Date.now()}
  ], before=structuredClone(inbox);
  const {state}=await syncHistorical(inbox);
  const explicit=state.tickets.find(row=>row.source==="fleet");
  assert.equal(explicit?.project_id,"admira-store"); assert.deepEqual(inbox,before);
});

test("POST /fleet/sync hereda la última declaración del agente y la MARCA", async()=>{
  // Carlos, 6-ago-2026. La declaración caducaba a medianoche y no la renovaba
  // nadie: 41 encargos de la flota se quedaron sin nacer, en silencio. Ahora se
  // hereda la última declaración explícita del agente — pero marcada, porque el
  // agente pudo cambiar de proyecto y el dato «podría darnos información falsa».
  state.allowDeclaration=false; state.allowInherited=true;
  env.TELEGRAM={async fetch(){return Response.json({items:[
    {id:801,text:"Encargo sin proyecto explícito",target_persona:"Oraculo",target_machine:"admira-macmini",from_name:"Carlos",status:"pending",ts:Date.now()}
  ]})}};
  const response=await post("/fleet/sync",{}), result=await response.json();
  assert.equal(response.status,200); assert.equal(result.created,1);
  assert.equal(result.rejected.length,0,"con declaración anterior ya no se pierde el encargo");
  const ticket=state.tickets.filter(row=>row.source==="fleet").at(-1);
  assert.equal(ticket.project_id,"xpaceos");
  assert.equal(ticket.project_inherited,1,"la herencia se guarda marcada");
  assert.equal(ticket.project_inherited_from,"2026-08-05","y se guarda de qué día viene");
  state.allowInherited=false;
});

test("sin declaración de hoy NI anterior se sigue rechazando", async()=>{
  // La herencia no relaja el guard: si el agente no declaró nunca, no hay de dónde
  // heredar y la misión no nace. Se hereda lo declarado, no se adivina.
  state.allowDeclaration=false; state.allowInherited=false;
  env.TELEGRAM={async fetch(){return Response.json({items:[
    {id:802,text:"Encargo de agente que nunca declaró",target_persona:"Oraculo",target_machine:"admira-macmini",from_name:"Carlos",status:"pending",ts:Date.now()}
  ]})}};
  const result=await (await post("/fleet/sync",{})).json();
  assert.equal(result.created,0);
  assert.equal(result.rejected[0].code,"project_required");
});

test("la marca de heredado desaparece al fijar el proyecto a mano", async()=>{
  // Si alguien entra a decir cuál es el proyecto, ya no es una suposición: el
  // asterisco de aviso dejaría de decir la verdad y hay que quitarlo.
  const source=await import("node:fs/promises").then(fs=>fs.readFile(new URL("./src/index.js",import.meta.url),"utf8"));
  assert.match(source,/UPDATE tickets SET project=\?,project_id=\?,project_inherited=0,project_inherited_from=NULL/);
  assert.match(source,/UPDATE tickets SET project='',project_id=NULL,project_inherited=0,project_inherited_from=NULL/);
});

test("un encargo que YA tiene mision se actualiza sin exigirle proyecto", async()=>{
  // Carlos, 6-ago-2026, «borra los que no podamos arreglar». Al mirarlos resultó que
  // no había nada que borrar: sus misiones EXISTÍAN (FLT-1166, FLT-1171…) pero
  // llevaban días congeladas en in_progress con el encargo ya cerrado, porque el
  // guard de proyecto se aplicaba también a las ACTUALIZACIONES y las mataba antes.
  state.allowDeclaration=false; state.allowInherited=false;
  state.tickets.push({id:"FLT-701", source:"fleet", status:"in_progress", project_id:"xpaceos", subject:"Ya existe"});
  state.fleetIds.set(701,"FLT-701");
  env.TELEGRAM={async fetch(){return Response.json({items:[
    {id:701,text:"Encargo que ya tiene mision",target_persona:"Oraculo",target_machine:"admira-macmini",
     from_name:"Carlos",status:"in_progress",ts:Date.now()}
  ]})}};
  const result=await (await post("/fleet/sync",{})).json();
  assert.equal(result.rejected.length,0,"una actualizacion no puede quedarse en rejected");
});

test("un encargo cerrado hace dias no se rechaza en bucle: se ignora", async()=>{
  // Carlos, 6-ago-2026, «borra los que no podamos arreglar». No hubo que borrar
  // nada: el descarte anti-resurrección ya existía, pero se comprobaba DESPUÉS del
  // guard de proyecto, así que trabajo YA TERMINADO hacía días volvía a apuntarse
  // como rechazado en cada sync. Eran 20 de los 39 atascados de la flota.
  state.allowDeclaration=false; state.allowInherited=false;
  const hace48h=Date.now()-48*3600*1000;
  env.TELEGRAM={async fetch(){return Response.json({items:[
    {id:901,text:"Trabajo terminado hace dos dias",target_persona:"Oraculo",target_machine:"admira-macmini",
     from_name:"Carlos",status:"done",ts:hace48h,done_at:hace48h}
  ]})}};
  const result=await (await post("/fleet/sync",{})).json();
  assert.equal(result.created,0,"no nace: sigue siendo una lápida");
  assert.equal(result.rejected.length,0,"y tampoco ensucia la lista de rechazados");
  assert.equal(state.fleetIds.has(901),false,"no reserva mission_id para ignorarlo");
});

test("un encargo VIVO sin proyecto se sigue rechazando, no se ignora", async()=>{
  // El descarte anticipado no puede tragarse trabajo pendiente: solo alcanza a lo
  // cerrado hace mucho. Lo vivo debe seguir reclamando proyecto.
  state.allowDeclaration=false; state.allowInherited=false;
  env.TELEGRAM={async fetch(){return Response.json({items:[
    {id:902,text:"Trabajo pendiente de verdad",target_persona:"Oraculo",target_machine:"admira-macmini",
     from_name:"Carlos",status:"pending",ts:Date.now()}
  ]})}};
  const result=await (await post("/fleet/sync",{})).json();
  assert.equal(result.created,0);
  assert.equal(result.rejected[0].code,"project_required");
});

test("POST /decisions/:id/choose hereda el proyecto exacto al batch y al ticket", async()=>{
  const id="DEC-PROJECT";
  state.decisions.set(id,{id,agent:"OraculoMacMini",machine:"admira-macmini",project:"xpaceos",status:"pending",recommended:0,chosen:null,options:JSON.stringify(["Publicar XpaceOS","Verificar XpaceOS","Documentar XpaceOS","↩ Volver atrás","✍️ Custom · Escribe la mejora que quieras a mano"]),created_at:Date.now(),deadline:Date.now()+300000});
  const response=await post("/decisions/"+id+"/choose",{choice:0,by:"Carlos"});
  assert.equal(response.status,200,await response.text());
  const batch=[...state.batches.values()].find(row=>row.decision_id===id);
  assert.equal(batch.project_id,"xpaceos");
  const ticket=state.tickets.find(row=>row.source==="decision-batch");
  assert.equal(ticket.project_id,"xpaceos"); assert.equal(ticket.project,"xpaceos");
  const novelty=state.novelties.find(row=>row.mission_id===ticket.id);
  assert.ok(novelty,"la misión nace con novedad durable");
  assert.equal(novelty.decision_id,id);
  const atomic=state.atomicBatches.find(batch=>batch.some(sql=>sql.startsWith("INSERT OR IGNORE INTO mission_novelty_events")));
  assert.ok(atomic.some(sql=>sql.startsWith("INSERT OR IGNORE INTO tickets")),"ticket y cursor comparten DB.batch");
  assert.ok(atomic.some(sql=>sql.startsWith("UPDATE mission_batch_items")),"el estado activo comparte la transacción");
  const retry=await worker.fetch(new Request("https://api.yokup.test/decisions/"+id),env,{});
  assert.equal(retry.status,200,await retry.text());
  assert.equal(state.novelties.filter(row=>row.mission_id===ticket.id).length,1,"releer/reintentar no duplica cursor");
});

test("OnIdle adopta target_mission_id canónico sin crear contenedor MIS duplicado", async()=>{
  const id="DEC-TARGET-DIRECT", targetId="DCL-CANONICAL";
  state.tickets.push({id:targetId,status:"in_progress",project:"xpaceos",project_id:"xpaceos",source:"cli-declare",assignee:"OraculoMacMini",loc:"admira-macmini",created_at:Date.now()-1000});
  state.decisions.set(id,{id,agent:"OraculoMacMini",machine:"admira-macmini",project:"xpaceos",status:"pending",recommended:0,chosen:null,
    options:JSON.stringify(["Ejecutar misión existente","Alternativa 2","Alternativa 3","↩ Volver atrás","✍️ Custom · Escribe la mejora que quieras a mano"]),
    option_targets:JSON.stringify([{target_mission_id:targetId},null,null,null,null]),created_at:Date.now(),deadline:Date.now()+300000});
  const before=state.tickets.filter(row=>row.source==="decision-batch").length;
  const response=await post("/decisions/"+id+"/choose",{choice:0,by:"Carlos"});
  assert.equal(response.status,200,await response.text());
  const batch=[...state.batches.values()].find(row=>row.decision_id===id);
  const item=state.items.find(row=>row.batch_id===batch.id);
  assert.equal(item.mission_id,targetId); assert.equal(item.target_mission_id,targetId); assert.equal(item.status,"active");
  assert.equal(batch.active_mission_id,targetId);
  assert.equal(state.tickets.filter(row=>row.source==="decision-batch").length,before,"no nace MIS sintética");
});

test("OnIdle falla cerrado si target_mission_id cruza de proyecto", async()=>{
  const id="DEC-TARGET-CROSS", targetId="DCL-FOREIGN-PROJECT";
  state.tickets.push({id:targetId,status:"in_progress",project:"otro",project_id:"otro",source:"cli-declare",assignee:"OraculoMacMini",loc:"admira-macmini"});
  state.decisions.set(id,{id,agent:"OraculoMacMini",machine:"admira-macmini",project:"xpaceos",status:"pending",recommended:0,chosen:null,
    options:JSON.stringify(["No adoptar","Alternativa 2","Alternativa 3","↩ Volver atrás","✍️ Custom · Escribe la mejora que quieras a mano"]),
    option_targets:JSON.stringify([{target_mission_id:targetId},null,null,null,null]),created_at:Date.now(),deadline:Date.now()+300000});
  const before=state.tickets.length;
  const response=await post("/decisions/"+id+"/choose",{choice:0,by:"Carlos"}), result=await response.json();
  assert.equal(response.status,400); assert.equal(result.code,"option_target_project_mismatch");
  assert.equal(state.tickets.length,before); assert.equal([...state.batches.values()].some(row=>row.decision_id===id),false);
});

test("OnIdle rechaza referencias duplicadas o colocadas en controles", async()=>{
  const targetId="DCL-UNIQUE-TARGET";
  state.tickets.push({id:targetId,status:"in_progress",project:"xpaceos",project_id:"xpaceos",source:"cli-declare",assignee:"OraculoMacMini",loc:"admira-macmini"});
  for (const [id,targets,code] of [
    ["DEC-TARGET-DUP",[{target_mission_id:targetId},{target_mission_id:targetId},null,null,null],"ambiguous_option_target"],
    ["DEC-TARGET-CONTROL",[null,null,null,{target_mission_id:targetId},null],"ambiguous_option_target"]
  ]) {
    state.decisions.set(id,{id,agent:"OraculoMacMini",machine:"admira-macmini",project:"xpaceos",status:"pending",recommended:0,chosen:null,
      options:JSON.stringify(["Uno","Dos","Tres","↩ Volver atrás","✍️ Custom · Escribe la mejora que quieras a mano"]),option_targets:JSON.stringify(targets),created_at:Date.now(),deadline:Date.now()+300000});
    const response=await post("/decisions/"+id+"/choose",{choice:0,by:"Carlos"}), result=await response.json();
    assert.equal(response.status,400); assert.equal(result.code,code);
  }
});

test("enlace tardío cancela el contenedor, adopta target y converge idempotente al cierre", async()=>{
  const decisionId="DEC-LATE",batchId="BATCH-DEC-LATE",containerId="MIS-DEC-LATE-01",targetId="DCL-REAL";
  state.batches.set(batchId,{id:batchId,decision_id:decisionId,agent:"OraculoMacMini",machine:"admira-macmini",project_id:"xpaceos",status:"active",active_mission_id:containerId});
  state.items.push({batch_id:batchId,position:0,option_index:0,title:"Trabajo real",mission_id:containerId,target_mission_id:null,status:"active"});
  state.tickets.push(
    {id:containerId,status:"in_progress",project:"xpaceos",project_id:"xpaceos",source:"decision-batch",screen:"decision-batch:"+decisionId,assignee:"OraculoMacMini",loc:"admira-macmini"},
    {id:targetId,status:"in_progress",project:"xpaceos",project_id:"xpaceos",source:"cli-declare",screen:"declare:"+targetId,assignee:"OraculoMacMini",loc:"admira-macmini",created_at:Date.now()-1000}
  );
  const body={decision_id:decisionId,batch_id:batchId,container_mission_id:containerId,target_mission_id:targetId,owner:"OraculoMacMini"};
  let response=await post("/fleet/batch/adopt",body), result=await response.json();
  assert.equal(response.status,200,JSON.stringify(result)); assert.equal(result.adopted,true);
  assert.equal(state.tickets.find(row=>row.id===containerId).status,"cancelled");
  assert.equal(state.tickets.find(row=>row.id===containerId).closure_reason,"equivalent_mission");
  assert.equal(state.items.find(row=>row.batch_id===batchId).mission_id,targetId);
  assert.equal(state.batches.get(batchId).active_mission_id,targetId);
  response=await post("/fleet/batch/adopt",body); result=await response.json();
  assert.equal(response.status,200); assert.equal(result.idempotent,true); assert.equal(result.reconciliation.applied,false);
  response=await post("/fleet/batch/adopt",{...body,owner:"Intruso"}); result=await response.json();
  assert.equal(response.status,403); assert.equal(result.code,"owner_mismatch","el retry no omite la firma exacta");
  response=await post("/fleet/batch/adopt",{...body,container_mission_id:"MIS-WRONG"}); result=await response.json();
  assert.equal(response.status,404); assert.equal(result.code,"invalid_container_mission","el retry no acepta otro contenedor");
  state.tickets.find(row=>row.id===targetId).status="resolved";
  response=await post("/fleet/batch/adopt",body); result=await response.json();
  assert.equal(response.status,200); assert.equal(result.reconciliation.applied,true);
  assert.equal(state.items.find(row=>row.batch_id===batchId).status,"completed");
  assert.equal(state.batches.get(batchId).status,"completed"); assert.equal(state.batches.get(batchId).active_mission_id,null);
});

test("timeout recomendado materializa misión y cursor por la misma ruta",async()=>{
  const id="DEC-TIMEOUT";
  state.decisions.set(id,{id,agent:"OraculoMacMini",machine:"admira-macmini",project:"xpaceos",status:"pending",recommended:1,chosen:null,options:JSON.stringify(["Primera","Recomendada timeout","Tercera","↩ Volver atrás","✍️ Custom · Escribe la mejora que quieras a mano"]),created_at:Date.now()-400000,deadline:Date.now()-1000});
  const response=await worker.fetch(new Request("https://api.yokup.test/decisions/"+id),env,{});
  assert.equal(response.status,200,await response.text());
  const novelty=state.novelties.find(row=>row.decision_id===id);
  assert.ok(novelty); assert.equal(state.decisions.get(id).status,"expired");
});

test("continuación elegida adopta la siguiente misión sin duplicar novedades",async()=>{
  const root="DEC-ROOT-CONT", batchId="BATCH-DEC-ROOT-CONT", id="DEC-CONT";
  state.batches.set(batchId,{id:batchId,decision_id:root,agent:"OraculoMacMini",machine:"admira-macmini",project_id:"xpaceos",status:"awaiting_continuation",active_mission_id:null});
  state.items.push({batch_id:batchId,position:1,option_index:1,title:"Segunda",status:"queued",mission_id:"MIS-CONT-02"},{batch_id:batchId,position:2,option_index:2,title:"Tercera",status:"queued",mission_id:"MIS-CONT-03"});
  state.decisions.set(id,{id,agent:"OraculoMacMini",machine:"admira-macmini",project:"xpaceos",status:"pending",recommended:0,chosen:null,parent_decision:root,batch_id:batchId,options:JSON.stringify(["Tercera","Segunda","↩ Volver atrás"]),created_at:Date.now(),deadline:Date.now()+300000});
  const response=await post("/decisions/"+id+"/choose",{choice:0,by:"Carlos"});
  assert.equal(response.status,200,await response.text());
  const novelty=state.novelties.find(row=>row.decision_id===id&&row.batch_id===batchId&&row.mission_id==="MIS-CONT-03");
  assert.ok(novelty,"la continuación atribuye el evento a la decisión que reordenó la cola");
});

test("retry recupera una continuación ya activa que falló antes de emitir ticket/cursor",async()=>{
  const root="DEC-ROOT-RETRY", batchId="BATCH-DEC-ROOT-RETRY", id="DEC-CONT-RETRY";
  state.batches.set(batchId,{id:batchId,decision_id:root,agent:"OraculoMacMini",machine:"admira-macmini",project_id:"xpaceos",status:"active",active_mission_id:null});
  state.items.push({batch_id:batchId,position:1,option_index:0,title:"Misión recuperada",status:"queued",mission_id:"MIS-CONT-RETRY"});
  state.decisions.set(id,{id,agent:"OraculoMacMini",machine:"admira-macmini",project:"xpaceos",status:"decided",recommended:0,chosen:0,parent_decision:root,batch_id:batchId,options:JSON.stringify(["Misión recuperada","↩ Volver atrás"]),created_at:Date.now()-1000,deadline:Date.now()-500,decided_at:Date.now()-700});
  const response=await worker.fetch(new Request("https://api.yokup.test/decisions/"+id),env,{});
  assert.equal(response.status,200,await response.text());
  assert.ok(state.tickets.some(row=>row.id==="MIS-CONT-RETRY"));
  assert.equal(state.novelties.filter(row=>row.decision_id===id).length,1);
});

test("contrato cruzado: fleet, batch, declare e incident no adivinan texto", async()=>{
  const source=await import("node:fs/promises").then(fs=>fs.readFile(new URL("./src/index.js",import.meta.url),"utf8"));
  assert.doesNotMatch(source,/function fleetProjectHint/);
  assert.match(source,/INSERT OR IGNORE INTO tickets\(id,screen,subject,loc,project,project_id,role/);
  assert.match(source,/decision-batch[\s\S]*project,project_id/);
  assert.match(source,/INSERT INTO tickets\([^)]*project,project_id,parent_id,created_at/);
  assert.match(source,/No se puede crear una misión sin project_id explícito, heredado o declarado/);
});
