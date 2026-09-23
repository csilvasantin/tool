import {statement as q,text,fail} from './installer-portal.js';

export async function ensureChain(env,caseId){
 await q(env,'INSERT OR IGNORE INTO call_chains(case_id,updated_at) VALUES(?,?)',caseId,Date.now()).run();
 return q(env,'SELECT * FROM call_chains WHERE case_id=?',caseId).first();
}

// Stage changes open exactly one contact cycle; repeated reads/cron runs do not reset it.
export async function syncChainJobs(env){
 await q(env,'INSERT OR IGNORE INTO call_chains(case_id,updated_at) SELECT id,created_at FROM call_cases').run();
 await q(env,`UPDATE call_chains SET observed_stage=(SELECT stage FROM call_cases WHERE id=case_id),stage_cycle=stage_cycle+1,revision=revision+1,updated_at=? WHERE observed_stage!=(SELECT stage FROM call_cases WHERE id=case_id)`,Date.now()).run();
 await q(env,`UPDATE call_jobs SET status='done',owner=NULL,lease_until=NULL,retry_at=NULL
 WHERE attempt_id IS NULL AND case_id IN (SELECT id FROM call_cases WHERE stage='closed') AND status!='done'`).run();
 await q(env,`INSERT OR IGNORE INTO call_jobs(id,case_id,target,purpose,created_at) SELECT 'installer:'||id,id,'installer','Coordinar revisión de la incidencia',? FROM call_cases WHERE stage='reopened'`,Date.now()).run();
 await q(env,`INSERT OR IGNORE INTO call_contacts(case_id,kind,name) SELECT c.id,'installer',a.name FROM call_cases c JOIN installer_incidents i ON i.id=c.incident_id JOIN installer_accounts a ON a.id=i.installer_id WHERE c.stage='reopened'`).run();
 await q(env,`UPDATE call_jobs SET status='pending',owner=NULL,lease_until=NULL,retry_at=NULL,attempt_count=0,
 cycle=(SELECT 'stage:'||stage_cycle FROM call_chains WHERE case_id=call_jobs.case_id),
 purpose=CASE target WHEN 'retailer' THEN 'Solicitar valoración del comercio y confirmar recuperación' ELSE 'Coordinar revisión: el comercio indica que sigue fallando' END
 WHERE attempt_id IS NULL AND ((target='retailer' AND case_id IN (SELECT id FROM call_cases WHERE stage='awaiting_rating') AND cycle!=(SELECT 'stage:'||stage_cycle FROM call_chains WHERE case_id=call_jobs.case_id))
 OR (target='installer' AND case_id IN (SELECT id FROM call_cases WHERE stage='reopened') AND cycle!=(SELECT 'stage:'||stage_cycle FROM call_chains WHERE case_id=call_jobs.case_id)))`).run();
}

export async function chainView(env,c,jobs,proposals){
 const policy=await ensureChain(env,c.id),p=proposals.find(p=>['proposed','confirmed'].includes(p.status));
 let phase='contact',next='Contactar con el comercio para confirmar la incidencia y su disponibilidad.',target='retailer';
 const retailer=jobs.find(j=>j.target==='retailer');
 if(retailer?.status==='done'){phase='proposal';next='Seleccionar un técnico compatible y preparar fecha, alcance e importe.';target=null;}
 if(p?.status==='proposed'){
  phase='acceptance';target=!p.retailer_accepted?'retailer':!p.installer_accepted?'installer':null;
  next=target?`Recoger la aceptación expresa de ${target==='retailer'?'comercio':'técnico'} para la propuesta ${p.version}.`:'Resolver el conflicto de agenda o asignación; la cita aún no está confirmada.';
 }
 if(['assigned','scheduled','repairing'].includes(c.stage)){phase='intervention';target=null;next='Esperar la intervención y su resolución en el portal del técnico.';}
 if(c.stage==='awaiting_rating'){phase='validation';target='retailer';next='Contactar con el comercio y solicitar su valoración en Mi comercio.';}
 if(c.stage==='reopened'){phase='review';target='installer';next='Coordinar la revisión con el técnico: el comercio indica que sigue fallando.';}
 const live=jobs.find(j=>j.attempt_id),escalated=jobs.find(j=>j.status==='escalated');
 if(escalated){phase='escalated';target=escalated.target;next='El responsable debe revisar el contacto, elegir una alternativa o abrir otro ciclo con motivo.';}
 if(live){target=live.target;next='Finalizar y documentar la conversación en curso.';}
 if(policy.state==='paused'){phase='paused';next='Cadena pausada: '+policy.reason;}
 if(c.stage==='closed'){phase='closed';target=null;next='Incidencia cerrada con valoración satisfactoria.';}
 const nextJob=jobs.find(j=>j.target===target);
 return {...policy,phase,next_action:next,target,job_id:nextJob?.id||null,due_at:nextJob?.retry_at||null,proposal_version:p?.version||null};
}

export async function changeChain(env,a,c,b,audit){
 if(c.stage==='closed')fail(409,'El expediente ya está cerrado.');
 const old=await ensureChain(env,c.id),revision=Number(b.revision);
 if(!Number.isInteger(revision)||old.revision!==revision)fail(409,'La cadena ha cambiado. Actualiza antes de guardar.');
 const reason=text(b.reason,5,1000),action=b.action;
 if(!['policy','pause','resume','restart'].includes(action))fail(400,'Acción de cadena no válida.');
 let max=old.max_attempts,minutes=old.retry_minutes,coordinator=old.coordinator;
 if(action==='policy'){
  max=Number(b.max_attempts);minutes=Number(b.retry_minutes);coordinator=text(b.coordinator,2,120);
  if(!Number.isInteger(max)||max<1||max>10||!Number.isInteger(minutes)||minutes<1||minutes>1440)fail(400,'Usa 1–10 intentos y 1–1440 minutos entre intentos.');
 }
 if(action==='pause'&&await q(env,'SELECT id FROM call_jobs WHERE case_id=? AND attempt_id IS NOT NULL',c.id).first())fail(409,'Finaliza la conversación antes de pausar.');
 let job;
 if(action==='restart'){
  job=await q(env,'SELECT * FROM call_jobs WHERE id=? AND case_id=?',String(b.job_id||''),c.id).first();
  if(!job||!['done','retry','escalated'].includes(job.status)||job.attempt_id)fail(409,'Este contacto no puede reiniciarse ahora.');
  if(old.state==='paused')fail(409,'Reanuda la cadena antes de abrir otro ciclo.');
 }
 const state=action==='pause'?'paused':action==='resume'?'active':old.state;
 const st=[q(env,'UPDATE call_chains SET state=?,max_attempts=?,retry_minutes=?,coordinator=?,reason=?,revision=?,updated_at=? WHERE case_id=?',state,max,minutes,coordinator,reason,revision+1,Date.now(),c.id)];
 if(action==='pause')st.push(q(env,"UPDATE call_jobs SET status='pending',owner=NULL,lease_until=NULL WHERE case_id=? AND status='reserved' AND attempt_id IS NULL",c.id));
 if(job)st.push(q(env,"UPDATE call_jobs SET status='pending',attempt_count=0,cycle=?,owner=NULL,lease_until=NULL,retry_at=NULL WHERE id=? AND attempt_id IS NULL AND status IN ('done','retry','escalated')",'manual:'+crypto.randomUUID(),job.id));
 st.push(audit(env,c.id,a.email,'chain_changed',{action,reason,coordinator,max_attempts:max,retry_minutes:minutes,job_id:job?.id||null}));
 try{await env.DB.batch(st);}catch{fail(409,'La cadena ha cambiado. Actualiza antes de guardar.');}
 return {ok:true,revision:revision+1};
}
