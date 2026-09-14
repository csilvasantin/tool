(()=>{
const $=s=>document.querySelector(s),base='https://data.yokup.com/api/portal-access',isAdmin=document.body.dataset.access==='admin';let resetToken='',resetKind='',config;
const status=message=>$('#access-status').textContent=message;
let googleLoad;
function loadGoogle(){if(window.google?.accounts?.id)return Promise.resolve();if(!googleLoad)googleLoad=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.onload=resolve;script.onerror=()=>{googleLoad=null;script.remove();reject(Error('No se pudo cargar Google. Vuelve a intentarlo.'));};document.head.append(script);});return googleLoad;}

async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',credentials:'include',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});const data=await r.json();if(!r.ok)throw Error(data.error||'No se pudo completar la operación.');return data;}
function showReset(token,email,kind){resetToken=token;resetKind=kind;$('#recovery-kind').value=kind;$('#recovery-kind').disabled=true;$('#recovery-request').hidden=true;$('#new-password').hidden=false;$('#verified-account').textContent=email?'Cuenta verificada: '+email:'El enlace permite cambiar la contraseña una sola vez.';status('');}
if(!isAdmin){
 const kind=new URLSearchParams(location.search).get('portal')==='installer'?'installer':'retailer';$('#recovery-kind').value=kind;
 const back=()=>$('#back-portal').href=$('#recovery-kind').value==='installer'?'/instalador':'/retailer';back();$('#recovery-kind').onchange=back;
 const token=new URLSearchParams(location.hash.slice(1)).get('token');if(token){history.replaceState(null,'',location.pathname+location.search);showReset(token,'',kind);}
 $('#email-recovery').onsubmit=async e=>{e.preventDefault();const button=$('#send-recovery');button.disabled=true;status('Solicitando el enlace…');try{const d=await api('/password/request',{kind:$('#recovery-kind').value,email:$('#recovery-email').value});status(d.message);}catch(e){status(e.message);}finally{button.disabled=!config?.email_recovery;}};
 $('#new-password').onsubmit=async e=>{e.preventDefault();if($('#password').value!==$('#password-repeat').value){status('Las contraseñas no coinciden.');return;}const button=e.target.querySelector('button');button.disabled=true;status('Actualizando contraseña…');try{const d=await api('/password/complete',{kind:resetKind,token:resetToken,password:$('#password').value});resetToken='';e.target.reset();e.target.hidden=true;status(d.message);}catch(e){status(e.name==='TimeoutError'?'No se ha confirmado el resultado. Prueba a entrar con la contraseña nueva antes de solicitar otro enlace.':e.message);button.disabled=false;}};
}
api('/config').then(d=>{config=d;if(!isAdmin){$('#send-recovery').disabled=!d.email_recovery;$('#mail-status').textContent=d.email_recovery?'El enlace caduca a los 15 minutos.':'El envío por correo está pendiente de activar. Puedes verificar tu cuenta con Google si utiliza Gmail o Google Workspace.';}}).catch(e=>status(e.message));
$('#start-google').onclick=async()=>{
 const button=$('#start-google');button.disabled=true;status('Preparando Google…');
 try{
  await loadGoogle();
  const kind=isAdmin?null:$('#recovery-kind').value;
  const challenge=await api('/google/challenge',{});
  google.accounts.id.initialize({client_id:challenge.google_client_id,nonce:challenge.nonce,auto_select:false,callback:async result=>{
   status('Comprobando tu identidad…');try{
    const d=await api(isAdmin?'/google/admin':'/google/recover',{credential:result.credential,...(kind?{kind}:{})});
    $('#google-button').replaceChildren();if(isAdmin){status('');document.dispatchEvent(new Event('portal-admin-auth'));}else showReset(d.token,d.email,kind);
   }catch(e){status(e.message);}finally{button.disabled=false;}
  }});
  $('#google-button').replaceChildren();google.accounts.id.renderButton($('#google-button'),{type:'standard',theme:'outline',size:'large',text:'continue_with'});status('Elige la cuenta correcta en el botón de Google.');
 }catch(e){status(e.message);}finally{button.disabled=false;}
};
})();
