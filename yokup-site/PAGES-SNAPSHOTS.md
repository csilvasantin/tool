# Snapshots de Yokup Pages

Autor operativo: **SubOraculoMini**.

`pages-snapshots.mjs` inventaría deployments inmutables, conserva sus bytes y
genera un `snapshot.json` atribuido a SubOraculoMini, con digest de integridad
del manifiesto y blobs content-addressed `blobs/<sha256>`. Las URLs servidas y
los paths físicos restaurables son campos separados: un clean route como
`/app` puede convivir con `app/icon.png` y nunca se restaura como fichero. La
normalización semántica es deliberadamente estrecha: orden de claves JSON y
únicamente sellos reconocibles `?v=rN`/`?v=v.dd.mm.aaaa.rN` dentro de atributos
HTML `src`/`href`. No normaliza espacios ni finales de línea en JavaScript, CSS,
HTML o texto; los cambios en template literals, `<pre>`, scripts inline o texto
funcional aparecen como `semanticChanged`.

`coverage.unavailable` registra todo candidato que el deployment no sirve. Los
controles críticos `_headers`, `_redirects`, `_routes.json` y
`functions/api/fleet-census.js` llevan `critical:true`; una respuesta idéntica
al shell SPA sin evidencia HTTP inequívoca se registra como
`ambiguous-index-response` y nunca se restaura sobre el fichero de control. Se
sondean siempre, incluso sin `--source`. Este contrato obligatorio usa schema 2;
los snapshots schema 1, que no acreditaban cobertura, deben regenerarse.

Las referencias relativas se resuelven contra la URL real de la página que las
declara. El extractor recorre etiquetas HTML y omite cuerpos inline de
`<script>`/`<style>` y valores dinámicos (`${…}`, `{{…}}`, `<%…%>`), de modo que
las plantillas no se convierten en aliases. Un recurso enlazado sólo se marca
restaurable cuando procede de una página física y la respuesta concuerda con su
tipo/magic; si devuelve el shell SPA queda en `coverage.unavailable`. Un HTML
explícito o cuyo hash coincide con el fichero local sí puede compartir bytes con
`index.html` sin ser descartado.

```sh
# Lista automática de Cloudflare (requiere sesión Wrangler ya configurada)
node pages-snapshots.mjs inventory --project yokup --out .snapshots/yokup --source .

# Ejecución reproducible desde una exportación JSON de deployments
node pages-snapshots.mjs inventory --deployments-json deployments.json --out .snapshots/yokup --source .

# Comparación
node pages-snapshots.mjs diff --left .snapshots/yokup/A --right .snapshots/yokup/B

# Restauración: primero plan; después aplicación explícita con backup
node pages-snapshots.mjs restore --snapshot .snapshots/yokup/A --target .
node pages-snapshots.mjs restore --snapshot .snapshots/yokup/A --target . --apply --backup /ruta/segura/backup
```

La restauración verifica manifiesto, blobs y sus metadatos derivados (tamaño,
tipo y hash semántico), rechaza rutas inseguras, aliases con path físico y
enlaces simbólicos, respalda cada sobrescritura y nunca elimina archivos
exclusivos del destino. No despliega Cloudflare.
