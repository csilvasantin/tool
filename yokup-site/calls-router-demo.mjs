const stages=[
 ['Detectar','Se simula una alerta de router sin conexión. Ningún dispositivo real ha emitido esta alerta.'],
 ['Abrir expediente','Yokup crea un expediente de prueba con su contacto y una tarea de asistencia.'],
 ['Preparar ayuda','Primero se intenta recuperar la conexión con un reinicio eléctrico. Si no funciona, el resultado queda pendiente de revisión técnica.'],
 ['Hablar','La asistente virtual se presenta como asistente virtual, pide permiso y guía el apagado, la espera y el encendido.'],
 ['Confirmar resultado','La respuesta llega al historial del expediente. Sin confirmación, no se da por solucionada la incidencia.']
];
export function mountRouterDemo({host,me,api,openCase,element:E}){
 if(!me.admin){host.hidden=true;return;}host.hidden=false;
 host.replaceChildren();const launch=E('button','Demo completa · reiniciar router','primary');launch.type='button';const panel=E('div',undefined,'router-demo-panel');panel.hidden=true;
 const title=E('h2','De la alerta a la asistencia, en una demo.'),notice=E('p','Verás la cadena con datos ficticios. Ensaya primero con notas de voz en castellano por Telegram. También puedes optar por una llamada telefónica con Twilio. Las voces son sintéticas; no son operadoras humanas.');
 const steps=E('ol',undefined,'router-demo-steps');const items=stages.map(([title,desc])=>{const li=E('li');li.append(E('strong',title),E('p',desc));steps.append(li);return li;});
 const form=E('form',undefined,'form-grid'),label=E('label','Móvil autorizado para la prueba'),phone=E('input');phone.type='tel';phone.placeholder='+34…';phone.value=me.telephone_demo_to||'';phone.setAttribute('aria-label','Móvil de la demo');label.append(phone);
 const consent=E('label',undefined,'inline-check wide'),check=E('input');check.type='checkbox';consent.append(check,document.createTextNode('Quiero recibir una llamada real al número indicado al terminar el recorrido. Solo funciona con el móvil verificado de la cuenta.'));
 const start=E('button','Reproducir demo','primary');start.type='submit';const cancel=E('button','Detener recorrido','text-button');cancel.type='button';cancel.hidden=true;
 const message=E('p',undefined,'router-demo-status');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 const config=E('p',me.capabilities.telephone_guided?'Telefonía configurada. Marca la casilla para terminar con una llamada de unos cinco minutos.':'Puedes ver la demo. La llamada está pendiente de configurar la credencial de Twilio en el servidor.','small');
 const view=E('button','Abrir expediente y resultado','text-button');view.type='button';view.hidden=true;let cid,running=false,cancelled=false,dialStarted=false;
 let key=sessionStorage.getItem('yokup-router-demo-case');
 const wait=()=>new Promise(resolve=>setTimeout(resolve,1600));
 const step=n=>items.forEach((li,i)=>{li.dataset.state=i<n?'done':i===n?'active':'pending';if(i===n)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});
 const reset=()=>{key=null;cid=null;sessionStorage.removeItem('yokup-router-demo-case');sessionStorage.removeItem('yokup-router-demo-call');view.hidden=true;};
 const fresh=E('button','Preparar otra demo','text-button');fresh.type='button';fresh.hidden=true;fresh.onclick=()=>{if(running)return;reset();message.textContent='Lista para una nueva demostración.';fresh.hidden=true;start.disabled=false;start.textContent='Reproducir demo';check.checked=false;};
 check.onchange=()=>start.textContent=check.checked?'Reproducir demo y llamar':'Reproducir demo';
 launch.onclick=()=>{panel.hidden=!panel.hidden;launch.setAttribute('aria-expanded',String(!panel.hidden));};launch.setAttribute('aria-expanded','false');
 cancel.onclick=()=>{cancelled=true;message.textContent='Recorrido detenido. No se ha enviado una llamada.';};
 view.onclick=()=>{if(cid)openCase(cid);};
 form.onsubmit=async e=>{e.preventDefault();if(running)return;if(check.checked&&!/^\+[1-9]\d{7,14}$/.test(phone.value.trim())){message.textContent='Indica el teléfono con prefijo internacional.';return;}
  running=true;cancelled=false;dialStarted=false;start.disabled=true;phone.disabled=true;check.disabled=true;cancel.hidden=false;fresh.hidden=true;
  const shouldCall=check.checked,number=phone.value.trim();
  try{
   step(0);message.textContent='Alerta simulada: el router ha perdido la conexión.';await wait();if(cancelled)return;
   key=key||crypto.randomUUID();sessionStorage.setItem('yokup-router-demo-case',key);
   const out=await api('/router-demo',{request_key:key,phone:number});cid=out.id;view.hidden=false;step(1);message.textContent='Expediente de prueba creado. Contacto y tarea guardados.';await wait();if(cancelled)return;
   step(2);message.textContent='Guion preparado: pedir permiso, desconectar alimentación, esperar, conectar y comprobar internet. Nunca se pulsa RESET.';await wait();if(cancelled)return;
   step(3);cancel.hidden=true;
   if(!shouldCall){message.textContent=me.capabilities.telephone_guided?'Recorrido listo. Marca la casilla y reproduce de nuevo para terminar con una llamada real.':'Recorrido listo. La llamada real necesita que Twilio esté configurado; no se ha llamado al móvil.';return;}
   if(!me.capabilities.telephone_guided){message.textContent='Demo preparada. Falta configurar Twilio para lanzar la llamada real; no se ha llamado al móvil.';return;}
   const data=await api('/cases/'+encodeURIComponent(cid)),job=data.jobs.find(j=>j.target==='retailer');
   // A replay keeps the same case; explicitly update its contact before dialing.
   await api('/cases/'+encodeURIComponent(cid)+'/contacts',{kind:'retailer',name:'Participante de la demo',phone:number,language:'es-ES',timezone:'Europe/Madrid'});
   let callKey=sessionStorage.getItem('yokup-router-demo-call')||crypto.randomUUID();sessionStorage.setItem('yokup-router-demo-call',callKey);
   dialStarted=true;message.textContent='Solicitando la llamada. No repitas el envío; puede tardar unos segundos.';
   const call=await api('/jobs/'+encodeURIComponent(job.id)+'/telephone',{request_key:callKey,authorized:true});
   message.textContent=call.status==='rejected'?'Twilio rechazó este intento. Revisa el expediente antes de preparar otro.':call.status==='unknown'?'Twilio aún no confirma el envío. Comprueba el expediente antes de repetir.':'Solicitud registrada en Twilio. Atiende el móvil y responde a Lucía. El resultado está pendiente de la conversación.';
   step(4);await openCase(cid);
  }catch(error){message.textContent=(dialStarted?'Comprueba el expediente antes de repetir: ':'')+error.message;}
  finally{if(cancelled)message.textContent='Recorrido detenido. No se ha enviado una llamada.';running=false;start.disabled=dialStarted;phone.disabled=false;check.disabled=false;cancel.hidden=true;fresh.hidden=dialStarted||!cid;}
 };
 const telegram=E('button','Ensayar por Telegram · sin Twilio','primary');telegram.type='button';
 const tgInfo=E('p','Notas de voz en castellano. Responde con voz, texto o botones en un chat privado. La transcripción necesita que el servicio de voz del Mac esté activo. Es un ensayo guiado, no una llamada en directo.','small');
 const tgLink=E('a','Abrir chat privado de Yokup');tgLink.hidden=true;tgLink.target='_blank';tgLink.rel='noopener noreferrer';
 const tgStatus=E('p');tgStatus.setAttribute('role','status');
 telegram.onclick=async()=>{
  if(running)return;telegram.disabled=true;tgLink.hidden=true;tgStatus.textContent='Preparando expediente y enlace privado…';
  try{let tgKey=sessionStorage.getItem('yokup-router-telegram-key');if(!tgKey){tgKey=crypto.randomUUID();sessionStorage.setItem('yokup-router-telegram-key',tgKey);}
   const demo=await api('/router-demo',{request_key:tgKey});cid=demo.id;view.hidden=false;
   const linked=await api('/cases/'+encodeURIComponent(cid)+'/telegram-demo',{});
   tgLink.href=linked.url;tgLink.hidden=false;tgStatus.textContent='Abre el chat privado y pulsa Iniciar. El enlace dura 30 minutos. Recibirás la primera nota de voz; tus respuestas quedarán en este expediente. No se utiliza Twilio.';
   step(3);
  }catch(error){tgStatus.textContent=error.message;}finally{telegram.disabled=false;}
 };

 if(me.capabilities.telephone_trial)panel.append(E('p','Cuenta de prueba: Twilio puede anteponer un aviso en inglés. Si pide pulsar una tecla, pulsa un número para continuar al guion de Yokup en castellano.','small'));
 form.append(label,consent,start,cancel);panel.append(title,notice,telegram,tgInfo,tgLink,tgStatus,steps,form,config,message,view,fresh);host.append(launch,panel);if(location.hash==='#router-demo'){panel.hidden=false;launch.setAttribute('aria-expanded','true');}
}
