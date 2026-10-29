export const families = [
 {id:'monitores',name:'Monitores',short:'Pantallas para cada espacio',icon:'▣',material:'screen'},
 {id:'televisores-hotel-tv',name:'Televisores',short:'TV, hospitality y business',icon:'▤',material:'screen'},
 {id:'led',name:'LED',short:'Gran formato. Gran impacto.',icon:'▦',material:'screen'},
 {id:'audio',name:'Audio',short:'El sonido también importa',icon:'◉',material:'audio'},
 {id:'soportes',name:'Soportes',short:'Todo en su sitio',icon:'⊥',material:'cable'},
 {id:'videoconferencias',name:'Videoconferencia',short:'Cámaras y colaboración',icon:'◎',material:'camera'}
];
export const fold=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function sourceLink(product){return 'https://clientes.elipsys.es/?s='+encodeURIComponent(product.sku);}
export function safeImage(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='clientes.elipsys.es'&&!u.username&&!u.password&&u.pathname.startsWith('/wp-content/uploads/')?u.href:'';}catch{return '';}}
export function filterProducts(products,{query='',category='',brand='',size='',operation='',sort='relevant'}={}){
 const terms=fold(query).trim().split(/\s+/).filter(Boolean);
 const result=products.filter(p=>(!category||p.categories.includes(category))&&(!brand||fold(p.brand)===fold(brand))&&(!size||p.attributes['Tamaño']===size)&&(!operation||p.attributes.Funcionamiento===operation)&&terms.every(t=>fold([p.name,p.sku,p.brand,...Object.values(p.attributes)].join(' ')).includes(t)));
 if(sort==='name')result.sort((a,b)=>a.name.localeCompare(b.name,'es',{numeric:true}));
 if(sort==='brand')result.sort((a,b)=>a.brand.localeCompare(b.brand,'es')||a.sku.localeCompare(b.sku,'es',{numeric:true}));
 if(sort==='size')result.sort((a,b)=>(parseFloat(a.attributes['Tamaño'])||Infinity)-(parseFloat(b.attributes['Tamaño'])||Infinity));
 if(sort==='relevant')result.sort((a,b)=>score(b)-score(a));
 return result;
}
function score(p){return (p.attributes.Funcionamiento==='24/7'?20:0)+(p.categories.includes('monitores')?5:0)+(['QM55C','QB55C','43DM66D','960-001252'].includes(p.sku)?30:0);}
export function cleanSelection(value,products){
 if(!Array.isArray(value))return [];
 const known=new Set(products.map(p=>p.id)),seen=new Set();
 return value.filter(i=>i&&known.has(i.id)&&!seen.has(i.id)&&Number.isInteger(i.quantity)&&i.quantity>=1&&i.quantity<=100&&(seen.add(i.id),true)).slice(0,20).map(i=>({id:i.id,quantity:i.quantity}));
}
export function materialLine(product,quantity){
 if(!product||!Number.isInteger(quantity)||quantity<1||quantity>100)throw Error('Cantidad no válida.');
 const category=families.find(c=>product.categories.includes(c.id))?.material||'other';
 const facts=Object.entries(product.attributes).filter(([k])=>!['SKU','Marca'].includes(k)).map(([k,v])=>k+': '+v).join(' · ');
 return {category,name:(product.brand+' '+product.sku+' · '+product.name).slice(0,160),specification:('Proveedor: Elipsys\nSKU: '+product.sku+'\n'+facts+'\nFicha: '+sourceLink(product)+'\nPrecio y disponibilidad pendientes de confirmación.').slice(0,1000),quantity,supplier_sku:product.sku};
}
