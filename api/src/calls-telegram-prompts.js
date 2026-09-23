import {routerQuestion} from './calls-router.js';
// Shared by the bot and the checked-in local audio generator.
export function telegramPrompt(s){
 if(s.done)return s.outcome==='agreed'?'Gracias. He guardado el resultado de la demostración. La conexión recuperada o simulada necesita comprobarse antes de cerrar una incidencia real.':'Gracias. El ensayo queda pendiente de revisión. No hemos avisado a un técnico real.';
 const intro=s.step==='consent'&&!s.retries?'Hola. Soy la asistente virtual de Yokup, con voz sintética en castellano. Ensayamos una incidencia ficticia de un rúter sin conexión. Tus respuestas se transcribirán y guardarán en el expediente de prueba. Responde con una nota de voz corta, texto o los botones. Puedes escribir cancelar en cualquier momento. ':'';
 const prompt=s.step==='on'?'Espera treinta segundos con el rúter apagado antes de volver a conectar la alimentación. Cuando hayas esperado y esté conectado, o hayas simulado este paso, di listo.':s.step==='restored'?'Espera al menos un minuto para que arranque. Puede tardar varios minutos. '+routerQuestion(s):routerQuestion(s);
 return intro+(s.retries?'No he entendido la respuesta con seguridad. Responde sí, no, listo o cancelar. ':'')+prompt.replace(/ o pulsa uno/g,'').replace(/ o pulsa dos/g,'').replace('pulsa nueve','di cancelar');
}
export function telegramAudio(s){return s.done?'done-'+s.outcome:s.step+(s.step==='confirm'?(s.restored?'-yes':'-no'):'')+(s.retries?'-retry':'');}
export const telegramPromptStates=[...['consent','off','on','restored'].flatMap(step=>[0,1].map(retries=>({step,turn:step==='consent'?0:1,retries}))),...[true,false].flatMap(restored=>[0,1].map(retries=>({step:'confirm',turn:4,restored,retries}))),...['agreed','human_handoff'].map(outcome=>({done:true,outcome}))];
