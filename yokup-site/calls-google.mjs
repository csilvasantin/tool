let sdkPromise;
function loadGoogle(){
 if(window.google?.accounts?.id)return Promise.resolve(window.google.accounts.id);
 if(!sdkPromise)sdkPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  const timeout=setTimeout(()=>failed(),15000);
  function failed(){clearTimeout(timeout);sdkPromise=null;script.remove();reject(Error('No se pudo cargar Google. Vuelve a intentarlo.'));}
  script.src='https://accounts.google.com/gsi/client';script.async=true;
  script.onerror=failed;
  script.onload=()=>{clearTimeout(timeout);if(window.google?.accounts?.id)resolve(window.google.accounts.id);else failed();};
  document.head.append(script);
 });
 return sdkPromise;
}
async function challenge(){
 const r=await fetch('https://data.yokup.com/api/portal-access/google/redirect-challenge',{
  method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)
 });
 const d=await r.json();if(!r.ok)throw Error(d.error||'No se pudo iniciar el acceso.');return d;
}
export function mountCallsGoogle({button,widget,status,load=loadGoogle,begin=challenge}){
 let busy=false;
 button.onclick=async()=>{
  if(busy)return;busy=true;button.disabled=true;widget.replaceChildren();status('Conectando con Google…');
  try{
   const google=await load(),c=await begin();
   google.initialize({client_id:c.google_client_id,nonce:c.nonce,ux_mode:'redirect',login_uri:c.login_uri,auto_select:false,use_fedcm_for_button:false});
   google.renderButton(widget,{type:'standard',theme:'outline',size:'large',text:'continue_with',state:c.state});
   status('Elige tu cuenta en el botón de Google. Volverás aquí al terminar.');
  }catch(e){status(e.message||'No se pudo iniciar el acceso con Google.');}
  finally{busy=false;button.disabled=false;}
 };
}
