import test from "node:test";
import assert from "node:assert/strict";
import worker from "./src/index.js";

function harness() {
  const state = { tickets:[], refs:new Map(), fleetIds:new Map(), decisions:new Map(), batches:new Map(), items:[], allowDeclaration:false, allowInherited:false, batchCalls:0, ticketBatches:0 };
  const statement = (sql, args=[]) => ({
    sql, args, bind(...next) { return statement(sql, next); },
    async first() {
      if (sql === "SELECT id FROM tickets WHERE screen=? AND status!='resolved'") return null;
      if (sql === "SELECT id,name,status FROM projects WHERE id=?")
        return args[0] === "xpaceos" ? { id:"xpaceos", name:"XpaceOS", status:"activo" } : null;
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
      if (sql === "SELECT id,decision_id,agent,machine,project_id FROM mission_batches WHERE id=?") {const b=state.batches.get(args[0]);return b&&{id:b.id,decision_id:b.decision_id,agent:b.agent,machine:b.machine,project_id:b.project_id};}
      if (sql.includes("SELECT 1 AS x FROM mission_batch_items")) return state.items.some(row=>row.batch_id===args[0])?{x:1}:null;
      if (sql.includes("FROM mission_batch_items WHERE batch_id=? AND status='active'")) return state.items.find(row=>row.batch_id===args[0]&&row.status==="active")||null;
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
      if (sql === "SELECT * FROM projects") return {results:[{id:"xpaceos",name:"XpaceOS",status:"activo"}]};
      if (sql === "SELECT project_id,kind,ref FROM project_members") return {results:[
        {project_id:"xpaceos",kind:"agent",ref:"OraculoMacMini"},
        {project_id:"xpaceos",kind:"machine",ref:"admira-macmini"}
      ]};
      if (sql.includes("SELECT entity_type,entity_key,display_ref FROM display_refs")) {
        const type=args[0]; return {results:args.slice(1).flatMap(key=>state.refs.has(type+":"+key)?[{entity_type:type,entity_key:key,display_ref:state.refs.get(type+":"+key)}]:[])};
      }
      if (sql.includes("FROM mission_batch_items i LEFT JOIN tickets")) return {results:state.items.filter(row=>row.batch_id===args[0]&&row.status==="queued").map(row=>({...row,ticket_status:null}))};
      if (sql.includes("FROM mission_batch_items WHERE batch_id=? ORDER BY position")) return {results:state.items.filter(row=>row.batch_id===args[0]).sort((a,b)=>a.position-b.position)};
      return { results:[] };
    },
    async run() { apply(sql,args); return {meta:{changes:1}}; }
  });
  function apply(sql,args) {
    if (sql.startsWith("INSERT OR IGNORE INTO tickets") || sql.startsWith("INSERT INTO tickets")) {
      const cols=sql.slice(sql.indexOf("(")+1,sql.indexOf(")")).split(",");
      state.tickets.push(Object.fromEntries(cols.map((col,i)=>[col,args[i]])));
    }
    if (sql.startsWith("INSERT OR IGNORE INTO display_refs")) state.refs.set(args[0]+":"+args[1],args[5]);
    if (sql.startsWith("INSERT OR IGNORE INTO fleet_ids")) state.fleetIds.set(args[0],args[1]);
    if (sql.startsWith("UPDATE decisions SET status=")) {const d=state.decisions.get(args[4]);Object.assign(d,{status:args[0],chosen:args[1],chosen_by:args[2],decided_at:args[3]});}
    if (sql.startsWith("UPDATE decisions SET batch_id=")) state.decisions.get(args[1]).batch_id=args[0];
    if (sql.startsWith("INSERT OR IGNORE INTO mission_batches")) state.batches.set(args[0],{id:args[0],decision_id:args[1],agent:args[2],machine:args[3],project_id:args[4],status:"active",active_mission_id:null});
    if (sql.startsWith("INSERT INTO mission_batch_items")) state.items.push({batch_id:args[0],position:args[1],option_index:args[2],title:args[3],status:"queued",mission_id:null});
    if (sql.startsWith("UPDATE mission_batch_items SET mission_id=")) {const row=state.items.find(x=>x.batch_id===args[2]&&x.position===args[3]);Object.assign(row,{mission_id:args[0],status:"active"});}
    if (sql.startsWith("UPDATE mission_batches SET active_mission_id=")) state.batches.get(args[2]).active_mission_id=args[0];
  }
  const DB={
    async exec(){}, prepare(sql){return statement(sql);},
    async batch(items){state.batchCalls++; if(items.some(item=>item.sql.startsWith("INSERT INTO tickets")))state.ticketBatches++; for(const item of items) apply(item.sql,item.args); return items.map(()=>({meta:{changes:1}}));}
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

test("POST /decisions/:id/choose hereda el proyecto exacto al batch y al ticket", async()=>{
  const id="DEC-PROJECT";
  state.decisions.set(id,{id,agent:"OraculoMacMini",machine:"admira-macmini",project:"xpaceos",status:"pending",recommended:0,chosen:null,options:JSON.stringify(["Publicar XpaceOS","Verificar XpaceOS","Documentar XpaceOS","↩ Volver atrás"]),created_at:Date.now(),deadline:Date.now()+300000});
  const response=await post("/decisions/"+id+"/choose",{choice:0,by:"Carlos"});
  assert.equal(response.status,200,await response.text());
  const batch=[...state.batches.values()].find(row=>row.decision_id===id);
  assert.equal(batch.project_id,"xpaceos");
  const ticket=state.tickets.find(row=>row.source==="decision-batch");
  assert.equal(ticket.project_id,"xpaceos"); assert.equal(ticket.project,"xpaceos");
});

test("contrato cruzado: fleet, batch, declare e incident no adivinan texto", async()=>{
  const source=await import("node:fs/promises").then(fs=>fs.readFile(new URL("./src/index.js",import.meta.url),"utf8"));
  assert.doesNotMatch(source,/function fleetProjectHint/);
  assert.match(source,/INSERT OR IGNORE INTO tickets\(id,screen,subject,loc,project,project_id,role/);
  assert.match(source,/decision-batch[\s\S]*project,project_id/);
  assert.match(source,/INSERT INTO tickets\([^)]*project,project_id,parent_id,created_at/);
  assert.match(source,/No se puede crear una misión sin project_id explícito, heredado o declarado/);
});
