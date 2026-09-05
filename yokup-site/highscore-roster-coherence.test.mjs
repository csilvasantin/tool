import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
await import('./yk-agent-identity.js');
const identity=globalThis.ykAgentIdentity;
const html=fs.readFileSync(new URL('./highscore.html',import.meta.url),'utf8');
function fn(name){const start=html.indexOf(`function ${name}(`),brace=html.indexOf('{',start);assert.ok(start>=0,name);let depth=0,quote='',escaped=false;for(let i=brace;i<html.length;i++){const c=html[i];if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}if(['"',"'",'`'].includes(c)){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&!--depth)return html.slice(start,i+1);}throw Error(name);}
function context(extra={}){return vm.createContext({window:{ykAgentIdentity:identity},normaliza:v=>String(v??'').trim(),Set,Map,...extra});}
function load(ctx,names){vm.runInContext(names.map(fn).join('\n'),ctx);return ctx;}
const plain=value=>JSON.parse(JSON.stringify(value));
test('la migración de scope sólo sustituye el automático heredado; manual y nuevo active persisten',()=>{
 const storage=new Map([['yokup.highscore.agents.mode.v2','active']]);
 const c=load(context({localStorage:{getItem:k=>storage.get(k)},AGENT_SCOPE_MODE_KEY:'yokup.highscore.agents.mode.v3'}),['hsReadAgentScopeMode','hsCoversAgentKeys','hsAgentScopeMigration']);
 assert.equal(c.hsReadAgentScopeMode(),'legacy-default');
 assert.deepEqual(plain(c.hsAgentScopeMigration(new Set(['morfeomacmini']),c.hsReadAgentScopeMode(),[],new Set())),{scope:null,mode:'all',changed:true});
 storage.set('yokup.highscore.agents.mode.v2','manual');assert.equal(c.hsReadAgentScopeMode(),'manual');
 const subset=new Set(['jobsGrokBot']);assert.equal(c.hsAgentScopeMigration(subset,'manual',[],null).scope,subset);
 storage.set('yokup.highscore.agents.mode.v3','active');assert.equal(c.hsReadAgentScopeMode(),'active');
});
test('tres formatos de identidad coinciden sólo en la misma máquina',()=>{
 const c=load(context(),['claveAgenteCarrera','hsWorkIdentity','claveAgentePeriodo']);
 const a=c.hsWorkIdentity({agent:'Morfeo',machine:'MacBookProNegro14'}),b=c.hsWorkIdentity({agent:'SubMorfeoMBP14'}),d=c.hsWorkIdentity({agent:'Morfeo',family_key:'morfeo@mbp14'});
 assert.equal(a.key,b.key);assert.equal(b.key,d.key);assert.equal(a.agent,'MorfeoMBP14');
 assert.notEqual(a.key,c.hsWorkIdentity({agent:'MorfeoMacMini'}).key);
 assert.equal(c.claveAgentePeriodo('MorfeoMini'),c.claveAgentePeriodo('Morfeo','Mac Mini'));
});
test('el roster incorpora puntuados y trabajo sin inventar puntuación ni mover el legado sin máquina',()=>{
 const now=Date.now(); const fixture={misiones:[],decisiones:[],ideas:[],proyectos:[],tareas:[],presencia:[{persona:'Morfeo',machine:'MacMini',updated:now/1000,runtime:'Claude',host:'app'}],actividad:[{agent:'Jobs',machine:'grokbot',objective_points:20},{agent:'Morfeo',machine:'',objective_points:7}],trabajosAvailable:true,trabajos:[{agent:'Niobe',family_key:'niobe@mbp14',executor:'SubNiobeMBP14',state:'running',kind:'task'}]};
 fixture.historial={periods:{week:{start:'2026-08-31',end:'2026-09-06'},month:{start:'2026-09-01',end:'2026-09-30'}},all_days:[{day:'2026-08-31',top:[{agent:'TrinityMBP16',points:40}]},{day:'2026-08-30',top:[{agent:'SmithMBP16',points:90}]}]};
 const c=context({datos:fixture,tareasDeHoy:()=>[],comoMs:Number,esReciente:()=>false,PRIORIDAD_ACTIVIDAD:{},ACTIVIDAD_FRESCA_MS:1800000,OBJETIVO_FRESCO_MS:900000,PUNTOS_TAREA:15,PUNTOS_TAREA_ACTIVA:10,FRESCO_SEG:900,NO_AGENTES:['','-','—'],tendenciaHoraria:()=>({}),observaPuntosDiarios:()=>({}),claveDia:()=>'',claveObservacionDiaria:()=>''});
 load(c,['claveAgenteCarrera','hsWorkIdentity','modeloLegible','adoptaRuntimeCandidato','adoptaRuntime','calcula']);
 const rows=c.calcula(),by=Object.fromEntries(rows.map(r=>[r.agente,r]));
 assert.equal(by.TrinityMBP16.total,0,'semana que cruza de mes añade identidad sin copiar puntos al día');assert.equal(by.SmithMBP16,undefined);
 assert.equal(by.JobsGrokBot.total,20);assert.equal(by.NiobeMBP14.total,0);assert.equal(by.NiobeMBP14.workState,'running');
 assert.equal(by.MorfeoSINMAQ.total,7);assert.equal(by.MorfeoMacMini.total,0);
 assert.deepEqual(plain(by.MorfeoMacMini.interfaces),['app']);
});
test('periodo respeta aliases físicos y no suma encima el acumulado diario',()=>{
 const c=load(context({RANKING_PERIODS:['hour','day','week','month'],datos:{historial:{periods:{week:{start:'2026-09-01',end:'2026-09-07'}},all_days:[{day:'2026-09-05',top:[{agent:'MorfeoMini',points:25},{agent:'SubMorfeoMacMini',points:5},{agent:'Morfeo',machine:'MacBookProNegro14',points:30}]}]}}}),['claveAgenteCarrera','claveAgentePeriodo','metricasRanking']);
 assert.equal(c.metricasRanking({agente:'MorfeoMacMini',total:999},'week').points,30);
 assert.equal(c.metricasRanking({agente:'MorfeoMBP14',total:999},'week').points,30);
 assert.equal(c.metricasRanking({agente:'NiobeMBP14',total:999},'week').points,0);
});
test('scope manual usa misma identidad en ranking y corredores; refresh no introduce excluidos',()=>{
 const rows=[{agente:'MorfeoMacMini'},{agente:'MorfeoMBP14'},{agente:'NiobeMBP14'}];
 const c=load(context({document:{activeElement:null},AGENT_SCOPE:new Set(['morfeombp14']),AGENT_SCOPE_MODE:'manual',listaCompletaCache:rows,RANKING_PERIOD:'day',listaVisible:x=>x,trabajosCarrera:()=>[{key:'morfeomacmini'},{key:'morfeombp14'},{key:'niobembp14'}]}),['claveAgenteCarrera','hsAgentKey','hsAgentScopeAllows','hsEffectiveAgentScope','aplicaAgentScope']);
 // Run the production selection prefix, before rendering needs DOM or motion APIs.
 const prefix=fn('actualizaCarreraPodio').split('    completas.forEach')[0].replace('var contenedor = document.getElementById("refreshLanes");','');
 vm.runInContext(`${prefix}\nreturn {completas,trabajos};\n}\nglobalThis.result=actualizaCarreraPodio();`,c);
 assert.deepEqual(plain(c.result.completas.map(r=>r.agente)),['MorfeoMBP14']);assert.deepEqual(plain(c.result.trabajos.map(r=>r.key)),['morfeombp14']);
 rows.push({agente:'LucasGrokBot'});vm.runInContext('globalThis.result=actualizaCarreraPodio()',c);assert.equal(c.result.completas.length,1);
});
test('el ordenador muestra una única ejecución vigente, nunca las interfaces del inventario',()=>{
 const c=load(context(),['interfazCliHtml']),now=Date.now()/1000;
 const row={via:'app',runtimePeso:120,runtimeAt:now,interfaces:['app','cli','app']};
 assert.equal((c.interfazCliHtml(row).match(/>APP</g)||[]).length,1);
 assert.doesNotMatch(c.interfazCliHtml(row),/>CLI</);
 const cli=c.interfazCliHtml({...row,via:'cli',runtimePeso:110});assert.match(cli,/>CLI</);assert.doesNotMatch(cli,/>APP</);
 for(const patch of [{runtimePeso:20},{runtimePeso:undefined},{runtimeAt:now-31},{runtimeAt:now+6},{via:'unknown'}])assert.equal(c.interfazCliHtml({...row,...patch}),'');
 assert.equal(c.interfazCliHtml({interfaces:['app','cli']}),'');
});
test('ranking legible conserva identidad completa accesible al abreviar el nombre visible',()=>{
 const c=load(context({esc:v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}),['nombreAgenteVisible','agentNameHtml']);
 for(const machine of ['MacMini','MBP14']){
  const a={agente:'Morfeo'+machine,proyecto:'Yokup',proyectoOrigen:'declarado',proyectoId:'yokup',maquinas:[machine]};
  const rendered=c.agentNameHtml(a);assert.match(rendered,/>Morfeo<\/button>/);assert.ok(rendered.includes(`aria-label="Morfeo${machine}"`));assert.ok(rendered.includes(`data-agente="Morfeo${machine}"`));
  const plain=c.agentNameHtml({agente:a.agente});assert.ok(plain.includes(`title="Morfeo${machine}"`));
 }
});

test('GrokBot se clasifica APP aunque su presencia sea de servicio, sin alterar actividad',()=>{
 const c=load(context(),['interfazCliHtml']);
 for(const row of [{agente:'LucasGrokBot'},{suffix:'GrokBot'},{maquinas:['GrokBot'],via:'cli',interfaces:['app','cli']},{agente:'JobsGrokBot',runtime:'Grok',runtimePeso:20,runtimeAt:1}]){
  const before=JSON.stringify(row),result=c.interfazCliHtml(row);
  assert.equal((result.match(/>APP</g)||[]).length,1);assert.doesNotMatch(result,/>CLI</);assert.equal(JSON.stringify(row),before);
 }
 assert.equal(c.interfazCliHtml({agente:'SmithMacMini',runtime:'Grok',maquinas:['MacMini']}),'','Grok en un Mac no se convierte en GrokBot');
});
