import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {families,filterProducts,cleanSelection,materialLine,sourceLink,safeImage} from './ecommerce-catalogue-model.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const data=JSON.parse(read('./data/ecommerce-elipsys.json')),products=data.products;
test('import contains 968 unique real references, six categories and 24 captured public pages',()=>{
 assert.equal(products.length,968);assert.equal(new Set(products.map(p=>p.id)).size,968);assert.equal(new Set(products.map(p=>p.sku.toLowerCase())).size,968);assert.equal(data.pages.length,24);assert.equal(data.importedRows,1056);
 for(const f of families)assert.ok(products.some(p=>p.categories.includes(f.id)),f.id);
 for(const p of products){assert.ok(p.sku&&p.name&&p.attributes.SKU===p.sku);assert.ok(p.categories.every(id=>families.some(f=>f.id===id)));assert.ok(!p.image||safeImage(p.image));assert.equal(p.price,undefined);assert.equal(p.stock,undefined);}
 assert.equal(data.priceStatus,'quote_required');assert.equal(data.stockStatus,'not_imported');
});
test('search combines SKU, brand, family, size and operating hours without mutating source',()=>{
 const before=products.map(p=>p.id),selected=filterProducts(products,{query:'qm55c',category:'monitores',brand:'samsung',size:'55"',operation:'24/7'});
 assert.equal(selected.length,1);assert.equal(selected[0].sku,'QM55C');assert.equal(filterProducts(products,{query:'qm55c',category:'audio'}).length,0);assert.equal(filterProducts(products,{query:'inexistente-123xyz'}).length,0);
 assert.deepEqual(products.map(p=>p.id),before);assert.ok(filterProducts(products,{query:'tactil'}).some(p=>p.name.includes('TÁCTIL')||p.name.includes('TACTIL')));
});
test('restored selection rejects stale, unknown, duplicate and invalid quantities and caps at 20',()=>{
 const p=products[0];assert.deepEqual(cleanSelection([{id:p.id,quantity:2},{id:p.id,quantity:3},{id:'invalid',quantity:1},{id:products[1].id,quantity:0},{id:products[2].id,quantity:1.5},{id:products[3].id,quantity:101}],products),[{id:p.id,quantity:2}]);
 assert.equal(cleanSelection(products.map(p=>({id:p.id,quantity:1})),products).length,20);assert.deepEqual(cleanSelection({},products),[]);
});
test('material request preserves source, SKU and specifications and never inserts a price',()=>{
 for(const [sku,category] of [['QM55C','screen'],['SCHTB100EGK','audio'],['960-001252','camera']]){const p=products.find(p=>p.sku===sku),line=materialLine(p,2);assert.equal(line.category,category);assert.equal(line.quantity,2);assert.ok(line.specification.includes('SKU: '+sku));assert.ok(line.specification.includes(sourceLink(p)));assert.ok(line.name.length<=160&&line.specification.length<=1000);assert.equal(line.unit_price_cents,undefined);assert.equal(line.supplier_sku,sku);}
 assert.throws(()=>materialLine(products[0],0));assert.throws(()=>materialLine(products[0],1.2));
});
test('external images and links remain on the public supplier and do not contain incident data',()=>{
 for(const url of ['https://evil.test/a.png','javascript:alert(1)','http://clientes.elipsys.es/wp-content/uploads/a.jpg','https://u:p@clientes.elipsys.es/wp-content/uploads/a.jpg'])assert.equal(safeImage(url),'');
 assert.equal(sourceLink({sku:'A&B/#'}),'https://clientes.elipsys.es/?s=A%26B%2F%23');
});
test('catalogue DOM, accessible controls and selection bridge are wired without remote HTML injection',()=>{
 const html=read('./ecommerce.html'),js=read('./ecommerce-catalogue.mjs'),portal=read('./ecommerce.js');
 for(const [,id] of js.matchAll(/\$\('([a-z][a-z-]+)'\)/g))assert.ok(html.includes('id="'+id+'"'),id);
 assert.doesNotMatch(js,/innerHTML|insertAdjacentHTML|eval\(|localStorage/);assert.match(js,/referrerPolicy='no-referrer'/);assert.match(html,/id="product-detail" aria-labelledby=/);assert.match(html,/id="selection-drawer" aria-labelledby=/);
 assert.match(portal,/admira:catalogue-selection/);assert.match(portal,/admira:purchase-created/);assert.match(portal,/if\(!profile\)/);assert.match(portal,/role==='retailer'&&!canApprove/);
});
