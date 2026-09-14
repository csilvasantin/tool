(() => {
const $=s=>document.querySelector(s),dialog=$('#import-dialog');
let buffer=null,filename='',rows=null,key=null,busy=false,epoch=0;
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
function status(message){$('#import-status').textContent=message;}
async function api(path,body){
 const r=await fetch('https://data.yokup.com/api/retailer'+path,{method:body?'POST':'GET',credentials:'include',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});
 const result=await r.json();if(!r.ok)throw Error(result.error||'No se pudo completar la importación.');return result;
}
function worker(data){return new Promise((resolve,reject)=>{
 const w=new Worker('/retailer-import-worker.js?v=1'),timer=setTimeout(()=>finish(Error('La lectura tarda demasiado. Reduce el tamaño del archivo.')),15000);
 function finish(error,result){clearTimeout(timer);w.terminate();error?reject(error):resolve(result);}
 w.onmessage=e=>finish(e.data.error?Object.assign(Error(e.data.error),{sheets:e.data.sheets,sheet:e.data.sheet}):null,e.data);w.onerror=()=>finish(Error('No se pudo cargar el lector de Excel. Vuelve a intentarlo.'));w.postMessage(data);
});}
function lock(value){busy=value;$('#import-close').disabled=value;$('#import-file').disabled=value;$('#import-sheet').disabled=value;$('#import-submit').disabled=value||!rows;$('#import-recheck').disabled=value||!buffer;}
function reset(){epoch++;buffer=null;rows=null;key=null;filename='';$('#import-form').reset();$('#import-preview').replaceChildren();$('#import-sheet-label').hidden=true;status('');lock(false);}
async function history(){const current=epoch;try{
 const result=await api('/site-imports');if(current!==epoch)return;const host=$('#import-history');host.replaceChildren();if(!result.imports.length)return;
 const details=document.createElement('details');details.append(node('summary','Importaciones de ubicaciones · '+result.imports.length));
 for(const item of result.imports){const p=node('p',`${item.filename}: ${item.result.created} nuevas, ${item.result.duplicates} ya existentes. ${item.sites?`${item.synced||0} de ${item.sites} confirmadas en Admira.`:'No se añadieron nuevas ubicaciones.'}`);details.append(p);}host.append(details);
 }catch{}}
function preview(result){
 const host=$('#import-preview');host.replaceChildren();const table=document.createElement('table'),thead=document.createElement('thead'),head=document.createElement('tr');
 ['Fila','Establecimiento','Ubicación','Resultado'].forEach(t=>head.append(node('th',t)));thead.append(head);table.append(thead);const tbody=document.createElement('tbody');
 for(const r of result.rows){const tr=document.createElement('tr');tr.className='import-'+r.status;[r.row,r.site?.name||'—',r.site?[r.site.address,r.site.city,r.site.country,`${r.site.latitude}, ${r.site.longitude}`].join(' · '):'Revisa el Excel',r.message].forEach(t=>tr.append(node('td',t)));tbody.append(tr);}table.append(tbody);host.append(table);
 const s=result.summary;status(`${s.created} nuevas · ${s.duplicates} ya existentes · ${s.errors} con errores. ${s.errors?'Corrige el Excel y vuelve a seleccionarlo.':'Revisa las ubicaciones antes de confirmar.'}`);
}
async function read(sheet){
 const current=epoch;rows=null;key=null;lock(true);status('Leyendo y comprobando ubicaciones…');$('#import-preview').replaceChildren();
 try{
  const parsed=await worker({buffer,sheet});if(current!==epoch)return;
  const select=$('#import-sheet');select.replaceChildren();parsed.sheets.forEach(s=>{const o=node('option',s);o.value=s;select.append(o);});select.value=parsed.sheet;$('#import-sheet-label').hidden=parsed.sheets.length<2;
  const result=await api('/sites/import-preview',{rows:parsed.rows});if(current!==epoch)return;
  preview(result);if(!result.summary.errors){rows=parsed.rows;key=crypto.randomUUID();}
 }catch(e){if(current===epoch){if(e.sheets?.length){const select=$('#import-sheet');select.replaceChildren();e.sheets.forEach(s=>{const o=node('option',s);o.value=s;select.append(o);});select.value=e.sheet;$('#import-sheet-label').hidden=e.sheets.length<2;}status(e.message);}}finally{if(current===epoch)lock(false);}
}
$('#import-sites').onclick=()=>{reset();dialog.showModal();};
$('#import-close').onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('close',reset);
$('#import-file').onchange=async e=>{
 const file=e.target.files[0];rows=null;key=null;buffer=null;$('#import-preview').replaceChildren();lock(false);if(!file)return;
 if(!/\.(xlsx|xls)$/i.test(file.name)||file.size>5*1024*1024){status('Selecciona un archivo .xlsx o .xls de hasta 5 MB.');return;}
 const current=++epoch;filename=file.name;lock(true);try{const bytes=await file.arrayBuffer();if(current!==epoch)return;buffer=bytes;read();}catch{if(current===epoch){status('No se ha podido leer el archivo.');lock(false);}}
};
$('#import-sheet').onchange=e=>read(e.target.value);$('#import-recheck').onclick=()=>read($('#import-sheet').value||undefined);
$('#import-template').onclick=async()=>{
 const button=$('#import-template');button.disabled=true;
 try{const result=await worker({action:'template'}),url=URL.createObjectURL(new Blob([result.buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const link=document.createElement('a');link.href=url;link.download='plantilla-ubicaciones-yokup.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}catch(e){status(e.message);}finally{button.disabled=false;}
};
$('#import-form').onsubmit=async e=>{
 e.preventDefault();if(!rows||busy)return;lock(true);const current=epoch;status('Guardando ubicaciones…');
 try{const result=await api('/sites/import',{filename,rows,request_key:key});if(current!==epoch)return;rows=null;status(`${result.created} ubicaciones añadidas; ${result.duplicates} ya existentes. Guardadas en Yokup. Alta en Admira pendiente de confirmación.`);document.dispatchEvent(new Event('retailer-sites-imported'));history();}
 catch(e){if(current===epoch)status(e.name==='TimeoutError'?'No se ha confirmado el resultado. Puedes reintentar este mismo envío sin duplicar las ubicaciones.':e.message);}
 finally{if(current===epoch)lock(false);}
};
document.addEventListener('portal-auth',e=>{if(e.detail.kind!=='retailer')return;if(e.detail.authenticated)history();else{epoch++;dialog.close();reset();$('#import-history').replaceChildren();}});
})();
