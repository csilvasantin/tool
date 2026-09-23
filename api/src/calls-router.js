// A bounded troubleshooting demo; never performs network changes itself.
export const ROUTER_TITLE='DEMO · Router sin conexión';
export const ROUTER_VOICE='Polly.Lucia-Neural';
export const routerInitial=()=>({scenario:'router',step:'consent',turn:0,retries:0});
export function routerQuestion(s){return {
 consent:'Vamos a practicar un reinicio eléctrico del rúter, no un restablecimiento de fábrica. Puedes simular los pasos sin tocar ningún equipo. Si lo haces de verdad, perderás internet unos minutos: hazlo solo si eres responsable de ese equipo y puedes interrumpir su servicio. ¿Quieres continuar? Di sí o pulsa uno. Para dejarlo, di no o pulsa dos.',
 off:'Localiza el cable de alimentación del rúter. Desconecta solo ese cable, sin tocar la fibra ni los cables de red. No pulses el botón RESET. Cuando esté apagado, o hayas simulado este paso, di listo o pulsa uno. Si tienes dudas, pulsa nueve.',
 on:'Ya han pasado treinta segundos. Vuelve a conectar la alimentación. Cuando esté conectado, o hayas simulado este paso, di listo o pulsa uno.',
 restored:'El arranque puede tardar varios minutos. Comprueba si puedes abrir una página con un equipo conectado a ese rúter. ¿Ha vuelto internet, o quieres simular que ha vuelto? Di sí o pulsa uno. Si todavía no funciona, di no o pulsa dos.',
 confirm:s.restored?'Has indicado que la conexión ha vuelto. ¿Confirmas que registre ese resultado en el expediente de demostración? Di sí o pulsa uno. Si no es correcto, di no o pulsa dos.':'Has indicado que la conexión aún no ha vuelto. ¿Confirmas que deje el expediente de demostración pendiente de revisión técnica? Di sí o pulsa uno. Si no es correcto, di no o pulsa dos.'
}[s.step]||'';}
export function advanceRouter(previous,answer,digits,uncertain){
 const s={...previous,turn:previous.turn+1,wait:0};
 const end=notes=>({...s,done:true,outcome:'human_handoff',notes});
 if(digits==='9'||/\b(persona|operador|humano|cancelar|para|parar)\b/.test(answer))return end('Demostración de router: solicita atención humana; no se ha confirmado una solución.');
 if(s.turn>=8)return end('Demostración de router: límite de turnos; revisión humana pendiente.');
 const yes=digits==='1'||(!uncertain&&/^(si|si correcto|correcto|confirmo|si confirmo|de acuerdo|listo|ya esta|hecho)$/.test(answer));
 const no=digits==='2'||(!uncertain&&/^(no|no funciona|todavia no|no confirmo|no es correcto)$/.test(answer));
 const retry=()=>s.retries?end('Demostración de router: respuesta no confirmada; revisar con una persona.'):{...s,retries:1};
 if(!yes&&!no)return retry();
 s.retries=0;
 if(s.step==='consent')return no?end('El contacto no quiere o no puede reiniciar el router ahora. No se ha realizado ninguna acción remota.'):{...s,step:'off'};
 if(s.step==='off')return no?end('El contacto no puede apagar el router. Revisar con una persona.'):{...s,step:'on',wait:30};
 if(s.step==='on')return no?end('El contacto no puede conectar la alimentación. Revisar con una persona.'):{...s,step:'restored',wait:60};
 if(s.step==='restored')return {...s,step:'confirm',restored:yes};
 if(s.step==='confirm')return no?end('El contacto no confirma el resumen. Resultado del reinicio pendiente de revisión.'):{...s,done:true,outcome:s.restored?'agreed':'human_handoff',notes:s.restored?'DEMO de reinicio eléctrico: el contacto confirma conexión recuperada o simulada. Sin telemetría real; no cerrar automáticamente la incidencia.':'DEMO de reinicio eléctrico: el contacto confirma que sigue sin conexión. Pendiente de revisión técnica; no se ha avisado a un técnico real.'};
 return end('Demostración de router: revisar el resultado con una persona.');
}
export function routerXml(s,escape,action){
 const say=t=>`<Say voice="${ROUTER_VOICE}" language="es-ES">${escape(t)}</Say>`;
 const intro=s.turn===0?'Hola. Soy Lucía, la asistente virtual de Yokup, con voz sintética. Te llamo por una incidencia de demostración: un rúter sin conexión. Guardaremos tus respuestas en el expediente de prueba. ':'';
 const wait=s.wait?say(s.wait===30?'Perfecto. Esperamos treinta segundos antes de volver a conectarlo.':'Perfecto. Dejamos un minuto para que arranque. Sigo aquí contigo.')+`<Pause length="${s.wait}"/>`:'';
 const body=s.done?say(s.outcome==='agreed'?'Gracias. He guardado el resultado de la demostración. Una incidencia real necesitaría comprobar también la conexión antes de cerrarla. Hasta pronto.':'Gracias. Dejo el expediente de prueba pendiente de revisión. No se avisará a un técnico real. Hasta pronto.')+'<Hangup/>':wait+`<Gather input="speech dtmf" language="es-ES" timeout="10" speechTimeout="auto" numDigits="1" actionOnEmptyResult="true" method="POST" action="${escape(action)}">`+say(intro+(s.retries?'No he entendido con seguridad. ':'')+routerQuestion(s))+'</Gather><Hangup/>';
 return '<?xml version="1.0" encoding="UTF-8"?><Response>'+body+'</Response>';
}
