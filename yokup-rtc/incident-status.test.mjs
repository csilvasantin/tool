import test from 'node:test';
import assert from 'node:assert/strict';
import {INCIDENT_SLA_MIN,incidentSla,incidentStage,normalizeIncidentStatusQuery,prefixUpperBound,serializeIncidentStatus} from './src/incident-status.js';

const q=(o)=>normalizeIncidentStatusQuery(new URLSearchParams(o));
const T0=1_790_000_000_000,MIN=60000;

test('sólo recursos demo: el estado público no expone misiones ni pantallas reales',()=>{
  assert.equal(q({prefix:'svc:https://www.xpaceos.com'}).ok,false);
  assert.equal(q({prefix:'demo:'}).ok,false);
  assert.equal(q({}).ok,false);
  const ok=q({prefix:'demo:starbucks-alsea-paseo-de-gracia:',ids:'inc-8geh3t, INC-8GEH3T'});
  assert.deepEqual(ok,{ok:true,prefix:'demo:starbucks-alsea-paseo-de-gracia:',ids:['INC-8GEH3T']});
});

test('ids: formato estricto y tope',()=>{
  assert.equal(q({ids:'INC-1; DROP'}).ok,false);
  assert.equal(q({ids:Array.from({length:21},(_,i)=>'INC-AAAA'+i.toString(36)).join(',')}).ok,false);
  assert.equal(q({ids:'INC-5IX5PD,SVC-ABCDE1'}).ok,true);
});

test('el rango del prefijo cubre todos los equipos de la tienda',()=>{
  const p='demo:starbucks-alsea-paseo-de-gracia:',hi=prefixUpperBound(p);
  for(const r of [p+'pantalla-1',p+'tpv:manual:0b8e']) assert.ok(r>=p&&r<hi);
  assert.ok(!('demo:starbucks-otra:tpv'>=p&&'demo:starbucks-otra:tpv'<hi));
});

test('etapas: abierta → en_curso → recuperada → cerrada',()=>{
  assert.equal(incidentStage('open',[{kind:'log'}]),'abierta');
  assert.equal(incidentStage('open',[{kind:'log'},{kind:'note'}]),'en_curso');
  assert.equal(incidentStage('in_progress',[{kind:'log'}]),'en_curso');
  assert.equal(incidentStage('open',[{kind:'log'},{kind:'recover'}]),'recuperada');
  assert.equal(incidentStage('resolved',[{kind:'recover'}]),'cerrada');
  assert.equal(incidentStage('cancelled',[]),'cancelada');
});

test('SLA por gravedad: en juego, a tiempo y fuera de plazo',()=>{
  const alta=INCIDENT_SLA_MIN.alta;
  const vivo=incidentSla('alta',T0,null,null,T0+5*MIN);
  assert.equal(vivo.response_due,T0+alta.response*MIN);
  assert.equal(vivo.response_ok,null);
  assert.equal(incidentSla('alta',T0,null,null,T0+(alta.response+1)*MIN).response_ok,false);
  assert.equal(incidentSla('urgente',T0,T0+10*MIN,T0+60*MIN,T0+61*MIN).response_ok,true);
  assert.equal(incidentSla('urgente',T0,T0+10*MIN,T0+60*MIN,T0+61*MIN).resolution_ok,true);
  assert.equal(incidentSla('rarisima',T0,null,null,T0).response_min,alta.response);
});

test('serialización: respuesta = primer gesto humano, cierre con prueba https',()=>{
  const ticket={id:'INC-ABCDE1',screen:'demo:s:pantalla-1',subject:'Pantalla 1 sin señal',status:'resolved',priority:'urgente',
    assignee:'Javier M.',created_at:T0,updated_at:T0+50*MIN,resolved_at:T0+50*MIN,proof_image:'https://api.yokup.com/media/fleet/x.png'};
  const events=[{ts:T0,kind:'log',author:'XpaceOS Matrix'},{ts:T0+20*MIN,kind:'recover',author:'XpaceOS Matrix'},
    {ts:T0+8*MIN,kind:'note',author:'Javier M.'},{ts:T0+50*MIN,kind:'status',author:'Carlos'}];
  const s=serializeIncidentStatus(ticket,events,T0+51*MIN);
  assert.equal(s.stage,'cerrada');
  assert.equal(s.sla.responded_at,T0+8*MIN);
  assert.equal(s.sla.response_ok,true);
  assert.equal(s.recovered_at,T0+20*MIN);
  assert.equal(s.closed_by,'Carlos');
  assert.equal(s.proof,ticket.proof_image);
  assert.equal(serializeIncidentStatus({...ticket,status:'open',proof_image:'javascript:x'},events.slice(0,1),T0).proof,null);
});

test('cerrar sin nota previa cuenta como respuesta',()=>{
  const s=serializeIncidentStatus({id:'INC-ABCDE2',screen:'demo:s:tpv',status:'resolved',priority:'alta',created_at:T0,updated_at:T0+20*MIN,resolved_at:T0+20*MIN},[{ts:T0,kind:'log'}],T0+21*MIN);
  assert.equal(s.sla.responded_at,T0+20*MIN);
  assert.equal(s.sla.response_ok,true);
});
