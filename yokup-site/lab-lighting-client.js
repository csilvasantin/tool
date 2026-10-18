// The fixed Lab authorizes its owner server-side. No Hue key or physical proof here.
(() => {
  if (!['www.admira.app','admira.app'].includes(location.hostname)) return;
  let queue = Promise.resolve();
  function select(mascot) {
    if (!['normal','admirito','bugito','supervisor'].includes(mascot)) return;
    const body=JSON.stringify({mascot,request_id:crypto.randomUUID()});
    queue=queue.catch(()=>{}).then(async()=>{
      const response=await fetch('https://api.yokup.com/agents/lab-lighting',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body,keepalive:true});
      if(!response.ok) return;
      const state=await response.json();
      window.dispatchEvent(new CustomEvent('admira:lab-lighting-queued',{detail:{state:state.state,intensity:state.intensity,physicalVerified:false}}));
    }).catch(()=>{});
  }
  window.AdmiraLabLighting={select};
  if (/^\/conversar(?:\.html)?\/?$/.test(location.pathname)) select('admirito');
  if (/^\/supervisor(?:\.html)?\/?$/.test(location.pathname)) select('supervisor');
})();
