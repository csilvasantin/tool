import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const detail=fs.readFileSync(new URL("./highscore-detail.js",import.meta.url),"utf8");
const page=fs.readFileSync(new URL("./highscore-detail-page.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("./highscoreDetail.html",import.meta.url),"utf8");
const identity=fs.readFileSync(new URL("./yk-agent-identity.js",import.meta.url),"utf8");
const context=vm.createContext({Intl,Date,URL,URLSearchParams,sessionStorage:{getItem:()=>null}});vm.runInContext(identity,context);vm.runInContext(detail,context);
const D=context.YkHighscoreDetail,ID=context.ykAgentIdentity,now=Date.UTC(2026,7,13,18);
const request={agent:"TrinityMBP14",projectId:"pixeria",period:"today"};
const work={agent:"TrinityMBP14",executor:"SubTrinityMBP14",reference:"DCL-msrt8i1zu0ky",title:"Status integral del player remoto",
  project_id:"admira-tv",project_name:"Admira TV",status:"finalized",at:now-60_000,started_at:now-677_601,finished_at:now-60_000,
  duration_ms:617_601,detail_url:"/highscoreDetail?agent=TrinityMBP14&project_id=admira-tv&period=today&type=all"};

test("normaliza el último trabajo cross-project sin contaminar el scope Pixeria",()=>{
  const value=JSON.parse(JSON.stringify(D.latestWorkFromHistory(work,request,ID,now)));
  assert.deepEqual(value,{agent:"TrinityMBP14",executor:"SubTrinityMBP14",reference:"DCL-msrt8i1zu0ky",title:"Status integral del player remoto",
    projectId:"admira-tv",projectName:"Admira TV",status:"finalized",at:now-60_000,startedAt:now-677_601,finishedAt:now-60_000,
    durationMs:617_601,detailUrl:"/highscoreDetail?agent=TrinityMBP14&project_id=admira-tv&period=today&type=all"});
  assert.equal(D.latestWorkFromHistory({...work,project_id:"pixeria"},request,ID,now),null,"link y project_id deben coincidir");
  assert.equal(D.latestWorkFromHistory({...work,executor:"SubNeoMBP14"},request,ID,now),null,"ejecutor de otra familia falla cerrado");
});

test("el panel es independiente del filtro type y enlaza el proyecto factual",()=>{
  assert.match(page,/function latestWorkPanel\(data,stateValue\)/);
  assert.match(page,/var recent=latestWorkPanel\(data,stateValue\);if\(recent\)target\.append\(recent\);var grid=/);
  assert.doesNotMatch(page,/latestWorkPanel\(data,stateValue\.type/);
  assert.match(page,/link\.href=work\.detailUrl/);
  assert.match(page,/Trabajo más reciente en otro proyecto/);
  assert.match(html,/\.latest-work\{/);assert.match(html,/highscore-detail\.js\?v=latest-work-r1/);
});
