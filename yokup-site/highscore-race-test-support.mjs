import vm from 'node:vm';
export function htmlFunction(html,name) {
 const start=html.indexOf(`function ${name}(`),brace=html.indexOf('{',start);if(start<0)throw Error(name);
 let depth=0,quote='',escaped=false;
 for(let i=brace;i<html.length;i++){const c=html[i];if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}if(['"',"'",'`'].includes(c)){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&!--depth)return html.slice(start,i+1);}
 throw Error('Unclosed '+name);
}
// Rendering fixtures isolate period sorting; scope and chip rendering are real.
// calcula seeds work-only roster rows in production (covered independently).
export function installRaceView(html,context,scopedRows=null) {
 if(!context.listaCompletaCache.length)context.listaCompletaCache=(context.datos.trabajos||[]).map(w=>({agente:w.agent,total:0}));
 context.listaVisible=rows=>rows;
 context.AGENT_SCOPE_MODE=scopedRows===null?'all':'manual';
 context.AGENT_SCOPE=scopedRows===null?null:new Set(scopedRows.map(r=>String(r.agente).toLowerCase().replace(/[^a-z0-9]/g,'')));
 context.Set=Set;
 vm.runInContext(['hsAgentKey','hsEffectiveAgentScope','hsAgentScopeAllows','aplicaAgentScope','interfazCliHtml','hsWorkEvidenceStatus'].map(n=>htmlFunction(html,n)).join('\n'),context);
}
