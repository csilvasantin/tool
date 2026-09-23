# Entrenamiento de Yokup con cápsulas de Pixeria

Publicado desde `yokup-site/entrenamiento.html`. Enlaces desde inicio, llamadas y
demo de llamadas. Es una biblioteca de formación general; no entrena modelos ni
modifica el guion telefónico/Telegram. No hay procedimientos técnicos validados.

El navegador consulta el índice público de Pixeria con CORS:
`https://stock.admira.store/stock/index.json`. Solo presenta piezas `capsula` o
`guion`, con texto en `comment` y etiqueta exacta `yokup`. No lleva credenciales de
edición al navegador. La fuente enlaza al Stock de Pixeria por ID y el contenido
se renderiza como texto, nunca HTML. Un fallo de red se muestra explícitamente;
si ya había una consulta correcta, se conserva en pantalla indicándolo.

La selección inicial de nueve piezas y la aplicación editorial a Yokup están en
`training-selection.mjs`. Las categorías son diagnóstico, atención, calidad,
coordinación y seguridad. Cada pieza recibió por PATCH de la API oficial:
`yokup`, `yokup-<categoria>`, `yokup-formacion`, sin retirar etiquetas previas ni
cambiar su comentario. Se comprobó su persistencia en el índice público.
Se excluyó `1786551354307-i76bys`, duplicado textual de la cápsula de prueba real.

Las cápsulas nuevas con `yokup` aparecen como «Por clasificar» hasta añadir una
aplicación editorial revisada. Ninguna etiqueta acredita aprobación técnica.
«Marcar como revisada» guarda lectura personal en localStorage de ese navegador,
con SHA-256 del título y texto. Cambiar el contenido deja pendiente esa lectura;
no equivale a acreditar conocimiento de un agente ni afecta al highscore.

Para convertir conocimiento en asistencia técnica falta asociar marca/modelo,
fuente, pasos, riesgos y aprobación técnica, y después conectar la recuperación
de documentación con la conversación. La biblioteca explica esta limitación.
