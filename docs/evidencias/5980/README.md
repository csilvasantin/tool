# Evidencias del encargo #5980 · filtro por proyecto en el Portal del comercio

Capturas con el `retailer.html` real y la API real de Yokup (`api/src`) en memoria, datos y sesiones de prueba: la demo de `api/tools/demo-proyecto.mjs`. Navegador sin ventana. Debajo de cada imagen, la URL y las llamadas a la API que la pintaron.

| Captura | Qué se ve |
|---|---|
| [01-superusuario-sin-filtro.png](01-superusuario-sin-filtro.png) | Superusuario con «Abrir como retailer» en Alsea, sin filtro: 2 abiertas. |
| [01b-superusuario-sin-filtro-locales.png](01b-superusuario-sin-filtro-locales.png) | Sin filtro: Starbucks Paseo de Gracia (`alsea-sbux-021`) y Starbucks Tijuana (`alsea-mx-sbux-01-tijuana`), una incidencia en cada uno. |
| [02-proyecto-starbucks.png](02-proyecto-starbucks.png) | `/proyecto starbucks` en ⌘ Experto: aviso «Proyecto Starbucks», 1 abierta, `GET /dashboard?proyecto=starbucks`. |
| [02b-proyecto-starbucks-locales.png](02b-proyecto-starbucks-locales.png) | Con el filtro, solo `alsea-sbux-*`: Paseo de Gracia. Tijuana queda fuera. |
| [03-itil-proyecto-starbucks.png](03-itil-proyecto-starbucks.png) | Inventario ITIL con el filtro: solo el Xpacio `alsea-sbux-021`. |
| [04-marca-starbucks.png](04-marca-starbucks.png) | `/marca starbucks` aplicado encima del filtro: barra «STARBUCKS · powered by Yokup» y colores de la marca. El filtro sigue. |
| [05-comercio-normal-403.png](05-comercio-normal-403.png) | Comercio normal con `?proyecto=starbucks`: `403 superuser-required` en `/dashboard` y `/itil`, aviso rojo y sus propios datos. |

El superusuario de la demo usa una dirección de la lista de superusuarios de la API, con una sesión creada por la demo en memoria. No es una sesión real de nadie y no pasa por Google.

Para repetirlas: `docs/evidencias/5980/capturas.mjs` (ver su cabecera).
