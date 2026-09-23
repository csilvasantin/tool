const phases={contact:'1 · Confirmar incidencia',proposal:'2 · Preparar intervención',acceptance:'3 · Acordar con ambas partes',intervention:'4 · Intervención',validation:'5 · Validar recuperación',review:'Revisión solicitada',closed:'Cerrada',paused:'En pausa',escalated:'Requiere coordinación'};
const labels={retailer:'Comercio',installer:'Técnico',pending:'Pendiente',reserved:'Reservada',in_call:'En conversación',retry:'Reintento programado',escalated:'Escalada',done:'Finalizada'};
export function mountChain({host,data,element:E,button,act,save,selectJob}){
 const ch=data.chain,c=data.case,jobs=data.jobs;
 if(!ch)return;
 host.append(E('h3','Cadena de atención'),E('strong',phases[ch.phase]||ch.phase),E('p',ch.next_action));
 host.append(E('p','Coordinación: '+(ch.coordinator||'Pendiente de asignar')+' · Hasta '+ch.max_attempts+' intentos por ciclo, cada '+ch.retry_minutes+' min.','small'));
 const list=E('ol',undefined,'chain-contacts');
 for(const j of jobs){const li=E('li'),b=button(labels[j.target]+' · '+labels[j.status],()=>selectJob(j.id));li.append(b,E('span','Intentos del ciclo: '+j.attempt_count,'small'));if(j.retry_at)li.append(E('time','Próximo intento: '+new Date(j.retry_at).toLocaleString('es-ES')));list.append(li);}host.append(list);
 host.append(E('p','Los reintentos vuelven a la cola para un operador. La llamada se inicia manualmente.','small muted'));
 if(c.stage==='closed')return;
 const details=E('details');details.append(E('summary','Configurar o intervenir en la cadena'));
 const f=E('form',undefined,'form-grid');f.innerHTML='<label>Responsable de coordinación<input name="coordinator" minlength="2" maxlength="120" required placeholder="Nombre o equipo"></label><label>Intentos por ciclo<input name="max_attempts" type="number" min="1" max="10" required></label><label>Minutos entre intentos<input name="retry_minutes" type="number" min="1" max="1440" required></label><label class="wide">Motivo o instrucciones<textarea name="reason" minlength="5" maxlength="1000" required></textarea></label><button class="primary">Guardar política</button>';
 for(const k of ['coordinator','max_attempts','retry_minutes'])f.elements[k].value=ch[k];
 f.onsubmit=e=>{e.preventDefault();act(()=>save({...Object.fromEntries(new FormData(f)),action:'policy',revision:ch.revision}));};details.append(f);
 const intervention=E('form',undefined,'form-grid');intervention.innerHTML='<label>Acción<select name="action"></select></label><label>Contacto para nuevo ciclo<select name="job_id"></select></label><label class="wide">Motivo de la intervención<textarea name="reason" required minlength="5" maxlength="1000"></textarea></label><button class="text-button">Aplicar intervención</button>';
 const actions=ch.state==='paused'?[['resume','Reanudar cadena']]:[['pause','Pausar cadena'],['restart','Abrir nuevo ciclo de contacto']];
 for(const [value,label] of actions){const o=E('option',label);o.value=value;intervention.elements.action.append(o);}
 for(const j of jobs.filter(j=>['done','retry','escalated'].includes(j.status))){const o=E('option',labels[j.target]);o.value=j.id;intervention.elements.job_id.append(o);}
 const toggle=()=>{intervention.elements.job_id.disabled=intervention.elements.action.value!=='restart';intervention.elements.job_id.required=!intervention.elements.job_id.disabled;};intervention.elements.action.onchange=toggle;toggle();
 intervention.onsubmit=e=>{e.preventDefault();act(()=>save({...Object.fromEntries(new FormData(intervention)),revision:ch.revision}));};details.append(intervention);host.append(details);
}
