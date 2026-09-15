export async function mountRoom({roomId,token,base}){
 const section=document.querySelector('#room'),status=document.querySelector('#room-status'),join=document.querySelector('#room-join'),end=document.querySelector('#room-end'),mute=document.querySelector('#room-mute'),audio=document.querySelector('#remote-audio');
 section.hidden=false;let pc,local,timer,seq=0,seen=new Set(),remoteReady=false,closed=false,started=false,polling=false;
 const api=async(body,action='')=>{const r=await fetch(base+'/rooms/'+encodeURIComponent(roomId)+action,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});const d=await r.json();if(!r.ok)throw Error(d.error||'No se pudo conectar.');return d;};
 const cleanup=()=>{closed=true;clearTimeout(timer);pc?.close();local?.getTracks().forEach(t=>t.stop());audio.srcObject=null;mute.hidden=true;};
 async function poll(){if(closed||polling)return;polling=true;try{const d=await api();if(!remoteReady){const s=d.side==='host'?d.answer:d.offer;if(s){await pc.setRemoteDescription({type:d.side==='host'?'answer':'offer',sdp:s});remoteReady=true;if(d.side==='guest'){const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await api({type:'answer',sdp:answer.sdp});}}}
 if(remoteReady)for(const s of d.signals){if(!seen.has(s.seq)){await pc.addIceCandidate(JSON.parse(s.payload));seen.add(s.seq);}}
 }catch(e){status.textContent=e.message;cleanup();}finally{polling=false;if(!closed)timer=setTimeout(poll,1800);}}
 join.onclick=async()=>{if(started)return;started=true;join.disabled=true;try{
 const d=await api();local=await navigator.mediaDevices.getUserMedia({audio:true,video:false});pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});local.getTracks().forEach(t=>pc.addTrack(t,local));
 pc.ontrack=e=>{audio.srcObject=e.streams[0];audio.play().catch(()=>{status.textContent='Pulsa reproducir para escuchar.';});};
 pc.onicecandidate=e=>{if(e.candidate)api({type:'ice',seq:seq++,candidate:e.candidate.toJSON()}).catch(()=>{status.textContent='No se pudo enviar la conexión. Vuelve a crear la sala.';cleanup();});};
 pc.onconnectionstatechange=()=>{status.textContent=({connected:'Conectados · conversación entre personas',connecting:'Conectando con la otra persona…',failed:'La red no permite conexión directa. Usa el teléfono y registra el resultado.',disconnected:'Se ha perdido la conexión.',closed:'Sala cerrada.'})[pc.connectionState]||'Esperando a la otra persona…';if(pc.connectionState==='failed')cleanup();};
 if(d.side==='host'){if(d.offer)throw Error('Esta sala ya se inició. Crea una nueva desde el expediente.');const offer=await pc.createOffer();await pc.setLocalDescription(offer);await api({type:'offer',sdp:offer.sdp});}
 status.textContent='Esperando a la otra persona…';mute.hidden=false;poll();
 }catch(e){status.textContent=e.name==='NotAllowedError'?'Activa el permiso de micrófono para participar.':e.message;cleanup();join.disabled=false;started=false;closed=false;}};
 mute.onclick=()=>{const t=local?.getAudioTracks()[0];if(t){t.enabled=!t.enabled;mute.textContent=t.enabled?'Silenciar':'Activar micrófono';}};
 end.onclick=async()=>{try{await api({},'/close');}catch{}cleanup();status.textContent='Sala cerrada. El operador puede registrar el resultado en el expediente.';};
 window.addEventListener('pagehide',cleanup,{once:true});
}
