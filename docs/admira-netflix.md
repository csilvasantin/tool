# Netflix en admira.app

Implementación optativa sobre la versión publicada `ffd9440e63bf797e3c4aaba604ae6d6399e3d1a8`, en el repositorio `csilvasantin/tool`.

## Uso

1. En una página con ⌘ Modo experto (por ejemplo `/ecommerce`), escribir `/brand Netflix`.
2. La marca se conserva al navegar y recargar dentro de la misma pestaña/origen mediante `sessionStorage`. No cambia la configuración de otros usuarios.
3. Para volver inmediatamente: `/brand off`, `/brand admira`, o ☰ Opciones → **Volver a Admira**.

La portada mantiene su navegación actual; puede recibir la marca al navegar desde una página con modo experto. También se admite `?marca=netflix` para una vista previa y `?marca=off` para restablecerla. Netflix utiliza siempre su paleta oscura.

## Alcance

Logotipo y favicon de Netflix, fondos negros, superficies oscuras, acciones rojas, títulos de mayor peso y tipografía Arial/Helvetica. El marco compartido, los paneles, la portada y ecommerce reciben los tokens de marca. El contenido, enlaces, formularios, permisos, pagos y datos mantienen su comportamiento. Los medios y mapas no reciben filtros.

Sin marca activa no se descargan los nuevos estilos ni recursos. Netflix se incluye en el despliegue y no requiere consultar el catálogo externo. Las demás marcas mantienen su integración con el catálogo. El estado y las mutaciones de marca se serializan: una orden de desactivación invalida cualquier activación pendiente.

El rojo `#E50914` se utiliza en rellenos con texto blanco. El texto rojo pequeño usa `#FF5962` para alcanzar contraste AA en las superficies oscuras. No se incluye una fuente propietaria.

## Vuelta atrás

**Por pestaña:** usar las órdenes o el botón anteriores. Se eliminan la marca recordada, `?marca` y `?modo`, el logo añadido y las hojas de marca; se recuperan los estilos nativos, favicon, título y theme-color. El resto de la URL, incluidos identificadores y fragmento, se conserva.

**Por despliegue:** revertir el commit de esta funcionalidad mediante `git revert` y publicar con el procedimiento habitual de `yokup-site/deploy.mjs`. La versión de referencia anterior es `ffd9440e63bf797e3c4aaba604ae6d6399e3d1a8`. No se han modificado datos ni esquemas. Las pestañas abiertas pueden usar `/brand off` antes de recargar. El despliegue debe renovar el sello habitual para evitar servir recursos antiguos de caché.

## Validación

Desde la raíz del repositorio, después de `npm ci --prefix yokup-site`:

```sh
node --test yokup-site/yk-marca-netflix.test.mjs yokup-site/marca-blanca.test.mjs yokup-site/yk-marca-alsea.test.mjs yokup-site/expert-desktop-dispatch.test.mjs
node --test scripts/admira-netflix.browser.test.cjs
```

La segunda orden requiere el Chromium de Playwright (`cd yokup-site && npx playwright install chromium`), o Chrome instalado y `NETFLIX_BROWSER_CHANNEL=chrome`. `NETFLIX_SCREENSHOTS=/tmp/admira-netflix-preview` guarda capturas durante la prueba. Todas las peticiones se interceptan con archivos locales; la prueba no realiza operaciones en producción.

Las pruebas DOM cubren ausencia de efectos por defecto, activación local, repetición sin duplicados, persistencia, vuelta atrás exacta, fallo de recursos, cancelación durante la carga y contraste de textos. Las de navegador cubren además modo experto, tamaños de 1440/390 px, navegación real y desbordamiento.

**Pendiente:** ejecución de las pruebas visuales en un navegador habilitado y revisión antes de publicar. El entorno de trabajo bloqueó el lanzamiento del navegador; la conexión de la extensión no estuvo disponible en esta sesión.

## Recursos de marca

- Logotipo: trazado de la cabecera pública de [Netflix Brand](https://brand.netflix.com/en/assets/logos/), servido localmente como `brand-assets/netflix-wordmark.svg`. Fuente CSS consultada el 7 de noviembre de 2026: `https://brand.netflix.com/assets/index-Nzh_sFZK.css`.
- Favicon: `https://brand.netflix.com/favicon.ico`, guardado como `brand-assets/netflix.ico`.
