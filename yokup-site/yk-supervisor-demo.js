const API='https://api.yokup.com';
const root=document.getElementById('supervisorDemo');
if(root){
  const $=id=>document.getElementById(id),node=(tag,value)=>{const n=document.createElement(tag);if(value!=null)n.textContent=value;return n;};
  const en=()=>document.documentElement.lang.startsWith('en'),t=(es,eng)=>en()?eng:es;
  const state={rows:[],selected:null,busy:false,fresh:false,timer:null,sequence:0,previewSequence:0,previews:[],drafts:new Map(),configured:{}};
  const clock=value=>value?new Date(value).toLocaleString(en()?'en-GB':'es-ES'):'—';
  const messages={supervisor_forbidden:['La sesión no tiene permiso de Supervisor.','This session has no Supervisor permission.'],unauthorized:['Inicia sesión para recibir avisos.','Sign in to receive alerts.'],popup_control_unconfigured:['El control específico del popup no está conectado.','The scoped popup control is not connected.'],private_telegram_unconfigured:['El chat privado de Carlos no está configurado en el servidor.','Carlos’s private chat is not configured on the server.'],popup_execution_unconfirmed:['Todavía no hay confirmación de que el popup se haya retirado.','Popup removal has not been confirmed.'],receipt_mismatch:['El recibo no corresponde a esta acción. Se conserva abierta.','The receipt does not match this action. The incident remains open.'],telegram_delivery_unknown:['Entrega Telegram sin confirmar. Comprueba el chat; no se reenvía automáticamente.','Telegram delivery is uncertain. Check the chat; it will not be resent automatically.'],telegram_rejected:['Telegram rechazó el parte. Puedes reintentar.','Telegram rejected the report. You can retry.'],evidence_not_persisted:['No se ha confirmado el guardado de la foto. La incidencia sigue abierta.','Photo storage is unconfirmed. The incident remains open.'],fresh_capture_required:['Indica la hora real de una captura tomada en los últimos dos minutos.','Enter the actual time of a capture taken within the last two minutes.'],post_action_capture_required:['La captura de recuperación debe ser posterior a la retirada confirmada.','The recovery capture must follow confirmed removal.'],distinct_recovery_capture_required:['La foto posterior debe ser distinta de la anterior.','The recovery photo must differ from the original.'],technician_assigned:['La incidencia está asignada a un técnico; debe cerrarla en su portal.','The incident belongs to a technician and must be closed in their portal.']};
  function errorText(error){return messages[error.code]?.[en()?1:0]||t('No se pudo confirmar la operación. Conservamos el formulario; actualiza el estado antes de reintentar.','The operation could not be confirmed. Your form is retained; refresh the status before retrying.');}
  async function request(path,body){
    const response=await fetch(API+'/supervisor/demo/incidents'+path,{cache:'no-store',signal:AbortSignal.timeout(15000),...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    let data;try{data=await response.json();}catch{throw Error('invalid_response');}
    if(!response.ok||data.ok!==true)throw Object.assign(Error('request_failed'),{code:data.error});return data;
  }
  function status(message,error=false){$('demoStatus').textContent=message;$('demoStatus').dataset.error=String(error);}
  function selected(){return state.rows.find(r=>r.event_id===state.selected);}
  function draft(){if(!state.drafts.has(state.selected))state.drafts.set(state.selected,{});return state.drafts.get(state.selected);}
  function retain(){if(!state.selected)return;Object.assign(draft(),{cause:$('demoCause').value,action:$('demoAction').value,captured:$('demoCaptured').value,reviewed:$('demoReviewed').checked});}
  function actions(){const row=selected(),available=state.fresh&&!state.busy;
    const active=row&&['open','in_progress'].includes(row.status);
    $('demoClear').disabled=!available||!active||row.clear_status!=='not_requested'||!state.configured.control_configured;
    $('demoReceipt').disabled=!available||!active||row.clear_status==='not_requested'||row.clear_status==='executed';
    $('demoClose').disabled=!available||!active||row.clear_status!=='executed';
    $('demoReport').disabled=!available||!row||row.status!=='resolved'||['sending','unknown','delivered'].includes(row.report_status)||!state.configured.telegram_configured;
    $('demoRefresh').disabled=state.busy;
  }
  async function preview(img,path){
    const generation=state.previewSequence;
    const message=img.nextElementSibling;img.hidden=true;img.removeAttribute('src');message.textContent='';if(!path)return;
    message.textContent=t('Cargando captura privada…','Loading private capture…');
    try{const response=await fetch(API+path,{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error();const blob=await response.blob();if(!['image/png','image/jpeg'].includes(blob.type))throw Error();if(!img.isConnected||generation!==state.previewSequence)return;const url=URL.createObjectURL(blob);state.previews.push(url);img.src=url;await img.decode();if(generation!==state.previewSequence)return;img.hidden=false;message.textContent='';}
    catch{if(img.isConnected&&generation===state.previewSequence)message.textContent=t('Captura no disponible. Actualiza para reintentar.','Capture unavailable. Refresh to retry.');}
  }
  function render(detail=false){
    const list=$('demoList');list.replaceChildren();
    for(const row of state.rows){const labels={resolved:t('cerrada','closed'),cancelled:t('cancelada','cancelled'),in_progress:t('en curso','in progress'),open:t('abierta','open')};const b=node('button',`${row.id} · ${row.code} · ${labels[row.status]||row.status}`);b.type='button';b.setAttribute('aria-pressed',String(row.event_id===state.selected));b.onclick=()=>{retain();state.selected=row.event_id;render(true);};list.append(b);}
    const row=selected();$('demoDetail').hidden=!row;
    if(row){
      $('demoTitle').textContent=row.id+' · popup · '+row.code;
      $('demoDescription').textContent=row.description;
      $('demoFacts').textContent=`${row.xpacio} · ${row.screen} · ${t('Aviso','Alert')}: ${clock(row.observed_at)} · ${t('Retirada','Removal')}: ${row.clear_status} · ${t('Cierre','Closure')}: ${clock(row.closed_at)}`;
      $('demoDelivery').textContent=row.report_status==='delivered'?t('Telegram aceptó el parte con dos fotos. Lectura humana sin confirmar.','Telegram accepted the two-photo report. Human reading is unconfirmed.') : row.report_status==='unknown'||row.report_status==='sending'?t('Entrega pendiente de comprobar en el chat privado; no se duplicará el envío.','Check delivery in the private chat; sending will not be duplicated.') : t('Parte privado todavía no enviado.','Private report not sent yet.');
      $('demoElapsed').textContent=row.elapsed_ms!=null?`${Math.ceil(row.elapsed_ms/1000)} s · ${row.within_three_minutes?t('dentro de tres minutos','within three minutes'):t('supera tres minutos','exceeds three minutes')}`:t('El tiempo se mide desde el aviso hasta el cierre confirmado.','Time runs from the alert to confirmed closure.');
      $('demoTicket').href=row.url;
      if(detail){
        state.previewSequence++;
        for(const url of state.previews)URL.revokeObjectURL(url);state.previews=[];
        const d=draft();$('demoCause').value=d.cause||row.cause||'';$('demoAction').value=d.action||row.action||'';$('demoCaptured').value=d.captured||'';$('demoReviewed').checked=!!d.reviewed;
        $('demoPhoto').value='';$('demoLocalPreview').hidden=!d.photo;if(d.photo)$('demoLocalPreview').src=d.photo;
        preview($('demoBefore'),row.before);preview($('demoAfter'),row.after);
      }
    }
    actions();
  }
  async function refresh(manual=false){
    if(state.busy)return;clearTimeout(state.timer);const seq=++state.sequence;
    if(manual)status(t('Consultando avisos…','Checking alerts…'));
    const xpacio=$('opsStore')?.value.trim()||'alsea-sbux-021';
    try{
      const data=await request('?xpacio='+encodeURIComponent(xpacio));if(seq!==state.sequence)return;
      if(!Array.isArray(data.incidents))throw Error('invalid_response');
      retain();const previous=state.selected,previousAfter=selected()?.after;state.rows=data.incidents;state.configured=data;state.fresh=true;
      if(!state.rows.some(r=>r.event_id===state.selected))state.selected=state.rows[0]?.event_id||null;
      render(previous!==state.selected||previousAfter!==selected()?.after||manual);
      const warnings=[];if(!data.control_configured)warnings.push(t('control de popup sin conectar','popup control not connected'));if(!data.telegram_configured)warnings.push(t('chat privado sin configurar','private chat not configured'));
      status((state.rows.length?t('Bandeja actualizada','Inbox updated'):t('Esperando un aviso real de Admirito','Waiting for an actual Admirito alert'))+' · '+clock(data.generated_at)+(warnings.length?' · '+warnings.join(' · '):''));
    }catch(error){if(seq!==state.sequence)return;state.fresh=false;status(errorText(error)+' '+t('Los datos anteriores pueden estar obsoletos.','Previous data may be stale.'),true);actions();}
    finally{if(seq===state.sequence)state.timer=setTimeout(()=>{if(!document.hidden)refresh();},5000);}
  }
  async function operation(action,body){
    retain();const row=selected();if(!row||state.busy||!state.fresh)return;
    state.busy=true;state.sequence++;clearTimeout(state.timer);actions();status(t('Esperando confirmación del servidor…','Waiting for server confirmation…'));
    try{
      const result=await request('/'+row.event_id+'/'+action,body);
      if(result.incident?.event_id!==row.event_id)throw Error('incident_mismatch');
      state.rows=state.rows.map(r=>r.event_id===row.event_id?result.incident:r);render(action==='close');
      status(action==='close'?t('Cierre guardado y confirmado por el servidor. Envía ahora el parte privado.','Closure saved and confirmed by the server. Send the private report now.'):action==='report'?t('Consulta el estado de entrega del parte.','Check the report delivery status.'):t('Estado de la acción guardado.','Action status saved.'));
    }catch(error){state.fresh=false;status(errorText(error),true);}
    finally{state.busy=false;actions();}
  }
  $('demoRefresh').onclick=()=>refresh(true);
  $('demoClear').onclick=()=>{const d=draft();d.clear_id ||= crypto.randomUUID();operation('clear',{request_id:d.clear_id});};
  $('demoReceipt').onclick=()=>operation('receipt',{});
  $('demoReport').onclick=()=>operation('report',{});
  $('demoPhoto').onchange=async event=>{
    const file=event.target.files?.[0],id=state.selected;if(!file)return;
    if(!['image/jpeg','image/png'].includes(file.type)||file.size>4*1024*1024){status(t('Elige una foto JPEG o PNG de hasta 4 MB.','Choose a JPEG or PNG photo up to 4 MB.'),true);return;}
    const reader=new FileReader();reader.onload=()=>{if(id!==state.selected)return;draft().photo=String(reader.result);$('demoLocalPreview').src=draft().photo;$('demoLocalPreview').hidden=false;};reader.onerror=()=>status(t('No se pudo leer la foto. Puedes elegirla otra vez.','The photo could not be read. Select it again.'),true);reader.readAsDataURL(file);
  };
  $('demoRecovery').onsubmit=event=>{
    event.preventDefault();retain();const d=draft();if(!d.photo){status(t('Adjunta la captura posterior antes de cerrar.','Attach the recovery capture before closing.'),true);return;}
    const match=/^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(d.photo);if(!match)return;
    operation('close',{cause:d.cause,action:d.action,captured_at:new Date(d.captured).getTime(),reviewed_recovered:d.reviewed,after:{type:match[1],base64:match[2]}});
  };
  window.SupervisorDemo={open(){root.hidden=false;root.scrollIntoView({block:'start',behavior:'smooth'});refresh(true);return t('Demo incidencia · bandeja real de Supervisor.','Incident demo · actual Supervisor inbox.');}};
  $('demoOpen').onclick=()=>window.SupervisorDemo.open();
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(state.timer);else refresh();});
  $('opsScope')?.addEventListener('submit',()=>{retain();state.selected=null;state.rows=[];state.fresh=false;render();refresh(true);});
  Promise.resolve(window.YkAccess?.ready).then(()=>refresh(true));
}
