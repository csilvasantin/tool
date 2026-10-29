export const isShop=host=>['admira.shop','www.admira.shop'].includes(host);
const PUBLIC=new Set(['/ecommerce','/ecommerce/','/ecommerce.html','/ecommerce-elipsys.json','/favicon.ico','/version.json']);
export function shopRoute(request){
 const u=new URL(request.url);if(!isShop(u.hostname))return null;
 if(u.hostname==='www.admira.shop')return Response.redirect('https://admira.shop'+u.pathname+u.search,308);
 if(u.pathname==='/')return Response.redirect(u.origin+'/ecommerce'+u.search,302);
 if(PUBLIC.has(u.pathname)||/^\/ecommerce[^/]*\.(?:js|mjs|css)$/.test(u.pathname)||u.pathname.startsWith('/ecommerce-api/'))return null;
 if(request.method==='GET'||request.method==='HEAD')return Response.redirect('https://admira.app'+u.pathname+u.search,302);
 return new Response('Not Found',{status:404});
}
export async function shopApi(request,fetcher=fetch){
 const u=new URL(request.url),match=/^\/ecommerce-api\/(retailer|installer)(\/.*)$/.exec(u.pathname);
 const error=(message,status)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
 if(!isShop(u.hostname)||!match)return error('Ruta no encontrada.',404);
 const [,kind,path]=match,method=request.method;
 const read=path==='/me'||path===(kind==='retailer'?'/dashboard':'/inbox')||/^\/ecommerce\/(catalog|context|requests(?:\/BUY-[a-f0-9-]{36})?)$/.test(path);
 const write=path==='/login'||path==='/logout'||/^\/ecommerce\/requests(?:\/BUY-[a-f0-9-]{36}(?:\/checkout)?)?$/.test(path);
 if(!((method==='GET'&&read)||(method==='POST'&&write)))return error('Ruta no encontrada.',404);
 if(method==='POST'&&(request.headers.get('origin')!==u.origin||!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||'')))return error('Origen o contenido no permitido.',403);
 const headers=new Headers({'Origin':u.origin,'Accept':'application/json'});
 const cookieName='__Host-yk_'+kind;
 const cookie=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>new RegExp('^'+cookieName+'=[a-f0-9]{64}$').test(x));
 if(cookie)headers.set('Cookie',cookie);
 if(method==='POST')headers.set('Content-Type','application/json');
 const target='https://data.admira.app/api/'+kind+path+u.search;
 try{
  const r=await fetcher(new Request(target,{method,headers,body:method==='POST'?request.body:undefined,redirect:'manual',...(method==='POST'?{duplex:'half'}:{})}));
  if(r.status>=300&&r.status<400)return error('Respuesta inesperada del servicio.',502);
  const out=new Headers({'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  const set=r.headers.get('set-cookie');if(set?.startsWith(cookieName+'=')&&!/;\s*Domain=/i.test(set))out.set('Set-Cookie',set);
  return new Response(r.body,{status:r.status,headers:out});
 }catch{return error('El servicio no está disponible. Reintenta en unos instantes.',503);}
}
