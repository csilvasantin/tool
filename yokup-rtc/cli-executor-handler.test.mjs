import test from "node:test";
import assert from "node:assert/strict";
import worker from "./src/index.js";

function harness(cli="smith-grok") {
  const state = {
    dbTouched:0,
    commands:[
      { id:"CLI-old-start", machine:"MacMini", cli, action:"start",
        status:"queued", detail:null, result_detail:null, created_at:900, updated_at:900 },
      { id:"CLI-test-start", machine:"MacMini", cli, action:"start",
        status:"queued", detail:null, result_detail:null, created_at:1000, updated_at:1000 }
    ],
    cli:new Map()
  };

  const statement = (sql) => {
    const stmt = {
      args:[],
      bind(...args) { this.args=args; return this; },
      async run() {
        state.dbTouched += 1;
        if (sql.includes("SET status='expired'")) return { meta:{ changes:0 } };
        if (sql.includes("SET status='superseded'")) {
          const id=this.args[1],row=state.commands.find((item)=>item.id===id && item.status==="queued");
          if (row) row.status="superseded";
          return { meta:{ changes:row ? 1 : 0 } };
        }
        if (sql.includes("SET status='rejected'")) {
          const row=state.commands.find(item=>item.id===this.args[1] && item.status==='queued');
          if(row)row.status='rejected'; return {meta:{changes:row?1:0}};
        }
        if (sql.includes("INSERT INTO cli_state") && sql.includes("desired")) {
          const [machine,cli,desired,desiredCommandId,desiredAt]=this.args;
          const current=state.cli.get(machine+"|"+cli)||{machine,cli,alive:null,pid:null,seen_at:0};
          Object.assign(current,{desired,desired_command_id:desiredCommandId,desired_at:desiredAt});
          state.cli.set(machine+"|"+cli,current);
          return { meta:{ changes:1 } };
        }
        if (sql.includes("INSERT INTO cli_state(machine,cli,alive,pid,seen_at)")) {
          const [machine,cli,alive,pid,seenAt]=this.args;
          const current=state.cli.get(machine+"|"+cli)||{machine,cli,desired:"unknown",desired_command_id:null,desired_at:null};
          Object.assign(current,{alive,pid,seen_at:seenAt});
          state.cli.set(machine+"|"+cli,current);
          return { meta:{ changes:1 } };
        }
        if (sql.includes("UPDATE cli_commands SET status=?,result_detail=?")) {
          const [status,detail,updatedAt,id]=this.args,row=state.commands.find((item)=>item.id===id);
          if (row && ["queued","running"].includes(row.status)) Object.assign(row,{status,result_detail:detail,updated_at:updatedAt});
          return { meta:{ changes:row ? 1 : 0 } };
        }
        return { meta:{ changes:0 } };
      },
      async all() {
        state.dbTouched += 1;
        if (sql.includes("FROM cli_commands") && sql.includes("status='running'")) {
          return { results:state.commands.filter((item)=>item.machine==="MacMini" && item.status==="queued").map((item)=>({...item})) };
        }
        if (sql.includes("SELECT cli,desired,desired_command_id,desired_at FROM cli_state")) {
          return { results:[...state.cli.values()].map(({cli,desired,desired_command_id,desired_at})=>({cli,desired,desired_command_id,desired_at})) };
        }
        return { results:[] };
      },
      async first() {
        state.dbTouched += 1;
        if (sql.includes("SELECT id,machine,cli,action,status FROM cli_commands")) {
          return state.commands.find((item)=>item.id===this.args[0])||null;
        }
        if (sql.includes("FROM cli_state WHERE lower(machine)")) {
          return state.cli.get(this.args[0]+"|"+this.args[1])||null;
        }
        return null;
      }
    };
    return stmt;
  };
  const DB = {
    async exec() { state.dbTouched += 1; },
    prepare:statement,
    async batch(statements) { return Promise.all(statements.map((item)=>item.run())); }
  };
  return { state, env:{ DB, YOKUP_CLI_EXECUTOR_TOKEN:"test-executor-token" } };
}

function pending(machine="MacMini", token="test-executor-token") {
  return new Request("https://api.yokup.test/fleet/cli/pending?machine="+encodeURIComponent(machine), {
    headers:token ? { authorization:"Bearer "+token } : {}
  });
}

function ack(body, token="test-executor-token") {
  return new Request("https://api.yokup.test/fleet/cli/ack", {
    method:"POST", headers:{ "content-type":"application/json", authorization:"Bearer "+token },
    body:JSON.stringify(body)
  });
}

test("las rutas pending/ack autentican, atan el target y conservan ACK idempotente", async () => {
  const box=harness();
  const unauthorized=await worker.fetch(pending("MacMini", "wrong"),box.env,{});
  assert.equal(unauthorized.status,401);
  assert.equal(box.state.dbTouched,0,"la petición no autenticada no toca D1");

  const missingBinding=await worker.fetch(pending(),{ DB:box.env.DB },{});
  assert.equal(missingBinding.status,503);
  assert.equal(box.state.dbTouched,0,"un deploy sin secret falla cerrado antes de D1");

  const invalidMachine=await worker.fetch(pending("MacMini;touch /tmp/x"),box.env,{});
  assert.equal(invalidMachine.status,400);

  const response=await worker.fetch(pending(),box.env,{}),body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.machine,"MacMini");
  assert.deepEqual(body.items.map(({id,cli,action,desired})=>({id,cli,action,desired})),[{
    id:"CLI-test-start",cli:"smith-grok",action:"start",desired:"running"
  }]);
  assert.equal(box.state.commands[0].status,"superseded","dos start históricos convergen en una sola intención");

  const wrongTarget=await worker.fetch(ack({
    id:"CLI-test-start",machine:"MacBookPro14",cli:"smith-grok",status:"running",alive:false,pid:null
  }),box.env,{});
  assert.equal(wrongTarget.status,404);

  const running=await worker.fetch(ack({
    id:"CLI-test-start",machine:"MacMini",cli:"smith-grok",status:"running",alive:false,pid:null,detail:"starting"
  }),box.env,{});
  assert.equal(running.status,200);
  assert.equal(box.state.commands[1].status,"running");
  const runningLease=await worker.fetch(ack({
    id:"CLI-test-start",machine:"MacMini",cli:"smith-grok",status:"running",alive:false,pid:null,detail:"still starting"
  }),box.env,{}),runningLeaseBody=await runningLease.json();
  assert.equal(runningLeaseBody.command.duplicate,true);
  assert.equal(box.state.commands[1].result_detail,"still starting","running repetido renueva el lease");

  const contradictory=await worker.fetch(ack({
    id:"CLI-test-start",machine:"MacMini",cli:"smith-grok",status:"done",alive:false,pid:null
  }),box.env,{});
  assert.equal(contradictory.status,409);

  const done=await worker.fetch(ack({
    id:"CLI-test-start",machine:"MacMini",cli:"smith-grok",status:"done",alive:true,pid:4321,detail:"ready"
  }),box.env,{});
  assert.equal(done.status,200);
  assert.equal(box.state.commands[1].status,"done");
  assert.equal(box.state.commands[1].detail,null,"el ACK no destruye el texto original de la orden");
  assert.equal(box.state.commands[1].result_detail,"ready");

  const duplicate=await worker.fetch(ack({
    id:"CLI-test-start",machine:"MacMini",cli:"smith-grok",status:"done",alive:true,pid:4321,detail:"ready"
  }),box.env,{}),duplicateBody=await duplicate.json();
  assert.equal(duplicate.status,200);
  assert.equal(duplicateBody.command.duplicate,true);

  box.state.commands.push({
    id:"CLI-test-mission",machine:"MacMini",cli:"smith-grok",action:"mission",status:"queued",
    detail:"MISIÓN: comprueba literalmente este encargo",result_detail:null,created_at:2000,updated_at:2000
  });
  const missionPending=await worker.fetch(pending(),box.env,{}),missionBody=await missionPending.json();
  const mission=missionBody.items.find((item)=>item.id==="CLI-test-mission");
  assert.equal(mission.detail,"MISIÓN: comprueba literalmente este encargo");
  const missionDone=await worker.fetch(ack({
    id:"CLI-test-mission",machine:"MacMini",cli:"smith-grok",status:"done",alive:true,pid:4321,detail:"delivered"
  }),box.env,{});
  assert.equal(missionDone.status,200);
  assert.equal(box.state.commands[2].detail,"MISIÓN: comprueba literalmente este encargo");
  assert.equal(box.state.commands[2].result_detail,"delivered");
});

 test("CLI start y mission anteriores no se entregan ni pueden ACKrunning saltando pending",async()=>{
 const box=harness('grok');
 // Direct claim before polling must not resurrect the cached launch.
 const claim=await worker.fetch(ack({id:'CLI-test-start',machine:'MacMini',cli:'grok',status:'running',alive:false,pid:null}),box.env,{});
 assert.equal(claim.status,409);assert.equal((await claim.json()).code,'cli_paused_by_carlos');
 box.state.commands.push({id:'CLI-old-mission',machine:'MacMini',cli:'grok',action:'mission',status:'queued',detail:'Misión humana preservada',created_at:Date.now(),updated_at:Date.now()});
 const wrong=await worker.fetch(ack({id:'CLI-test-start',machine:'MacBookPro14',cli:'grok',status:'running',alive:false,pid:null}),box.env,{});assert.equal(wrong.status,404);
 const missionClaim=await worker.fetch(ack({id:'CLI-old-mission',machine:'MacMini',cli:'grok',status:'running',alive:true,pid:42}),box.env,{});assert.equal(missionClaim.status,409);assert.equal((await missionClaim.json()).code,'cli_paused_by_carlos');
 const response=await worker.fetch(pending(),box.env,{}),body=await response.json();
 assert.deepEqual(body.items,[]);assert.equal(body.runtime_policy.cli_paused,true);
 assert.equal(box.state.commands.find(x=>x.id==='CLI-old-mission').detail,'Misión humana preservada');
 assert.ok(box.state.commands.every(x=>['rejected','superseded'].includes(x.status)));
 });

 test("ACKrunning de STOP CLI y replay siguen permitidos; no implica afirmar proceso parado",async()=>{
 const box=harness('grok');box.state.commands=[{id:'CLI-stop',machine:'MacMini',cli:'grok',action:'stop',status:'queued',detail:null,created_at:Date.now(),updated_at:Date.now()}];
 for(let i=0;i<2;i++){
 const response=await worker.fetch(ack({id:'CLI-stop',machine:'MacMini',cli:'grok',status:'running',alive:true,pid:42,detail:'stop requested'}),box.env,{});
 assert.equal(response.status,200);assert.equal(box.state.commands[0].status,'running');
 }
 assert.equal(box.state.cli.get('MacMini|grok').alive,1);
 });
