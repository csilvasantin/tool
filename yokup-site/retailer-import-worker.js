/* XLSX stays in an isolated worker. No workbook content is executed or sent to a third party. */
importScripts('/vendor/xlsx-0.20.3.full.min.js');
self.onmessage=async({data})=>{
 let sheets=[],selected='';
 try{
  const {MAX_SITES,HEADERS,headerFields}=await import('/retailer-import-schema.mjs');
  if(data.action==='template'){
   const book=XLSX.utils.book_new();
   const sheet=XLSX.utils.aoa_to_sheet([HEADERS]);sheet['!cols']=HEADERS.map(()=>({wch:24}));
   XLSX.utils.book_append_sheet(book,sheet,'Ubicaciones');
   XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
    ['Cómo rellenar la plantilla'],['Una fila por establecimiento. Importa la hoja Ubicaciones.'],
    ['codigo','Opcional. Referencia propia y única del establecimiento.'],['nombre','Obligatorio. Entre 2 y 120 caracteres.'],
    ['tipo','estanco, kiosco, supermercado, hostelería u otro'],['pais','Dos letras: ES, PT, FR…'],['ciudad','Ciudad del establecimiento.'],['direccion','Dirección completa de intervención.'],
    ['latitud','Coordenada entre -90 y 90.'],['longitud','Coordenada entre -180 y 180.'],
    ['Límites','Hasta 500 ubicaciones y 5 MB por archivo. Puedes importar varios archivos.'],
    ['Valores','Sin fórmulas. Se admiten punto o coma decimal en coordenadas.'],
    ['Importación','Revisa todas las filas. No se sobrescriben establecimientos existentes.'],
    ['Admira','Las altas quedan pendientes hasta que el servicio central confirma su registro.']
   ]),'Instrucciones');
   const buffer=XLSX.write(book,{bookType:'xlsx',type:'array'});self.postMessage({buffer},[buffer]);return;
  }
  if(!(data.buffer instanceof ArrayBuffer)||data.buffer.byteLength>5*1024*1024)throw Error('El archivo debe ocupar como máximo 5 MB.');
  const book=XLSX.read(data.buffer,{type:'array',sheetRows:MAX_SITES+2,cellFormula:true,cellHTML:false,cellStyles:false,bookVBA:false});
  if(book.SheetNames.length>32)throw Error('Usa un archivo con un máximo de 32 hojas.');
  sheets=book.SheetNames;selected=data.sheet||sheets[0];
  const name=selected,sheet=book.Sheets[name];if(!sheet)throw Error('No se ha encontrado la hoja.');
  const range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1');
  if(range.s.r!==0||range.s.c!==0)throw Error('Las cabeceras deben comenzar en la celda A1.');
  if(range.e.r>MAX_SITES||range.e.c>63)throw Error('La hoja debe tener como máximo 500 filas de datos y 64 columnas.');
  const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true,blankrows:true}),fields=headerFields(matrix[0]||[]),rows=[];
  for(let n=1;n<matrix.length;n++){
   if(!matrix[n].some(v=>String(v??'').trim()))continue;
   const row={source_row:n+1};fields.forEach((field,c)=>{
    if(!field)return;if(sheet[XLSX.utils.encode_cell({r:n,c})]?.f)throw Error(`Fila ${n+1}: sustituye las fórmulas por valores antes de importar.`);
    row[field]=field==='external_ref'?(sheet[XLSX.utils.encode_cell({r:n,c})]?.w??matrix[n][c]??''):matrix[n][c]??'';
   });rows.push(row);
  }
  if(!rows.length)throw Error('La hoja está vacía. Añade las ubicaciones debajo de las cabeceras.');
  self.postMessage({sheets:book.SheetNames,sheet:name,rows});
 }catch(e){self.postMessage({error:e.message||'No se pudo leer el Excel.',sheets,sheet:selected});}
};
