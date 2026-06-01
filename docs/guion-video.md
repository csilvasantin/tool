# Yokup — Guión y storyboard del vídeo explicativo

> Para producir un vídeo real (~40 s, locución + grabación de pantalla o motion graphics).
> La versión animada navegable está en `web/video.html` y sigue exactamente estas escenas.
> Tono: cercano, claro, profesional. Voz en off en español de España.

---

## Ficha

- **Duración objetivo**: 38–42 s.
- **Formato**: 16:9 (1920×1080). Versión vertical 9:16 opcional para redes (recortar a centro).
- **Paleta**: fondo oscuro `#06101a`; acentos ámbar `#ffb454` (Yokup) y cian `#78f3ff` (Admira).
- **Tipografía**: la del sistema / design system Admira.
- **Música**: bed electrónico suave, sube en la escena 6 (cierre).

---

## Escaleta (escena · duración · locución · imagen)

### 0 · Intro — 4,5 s
- **VO**: «Cuando una pantalla, el hilo musical o un kiosco fallan en tu punto de venta, Yokup se encarga.»
- **Imagen**: logo Yokup. Icono 🛠️. Titular: *"Cada avería del punto de venta, resuelta y trazada"*.
- **Movimiento**: fade-in del titular; el degradado ámbar→cian recorre la palabra "trazada".

### 1 · Se detecta — 5 s · `⚙ Admira`
- **VO**: «Admira detecta el fallo del equipo y abre la incidencia automáticamente. Sin que nadie tenga que llamar.»
- **Imagen**: una pantalla de estanco con señal; de repente parpadea un ⚠️ y se apaga (🔇).
- **Movimiento**: el icono de aviso ⚠️ parpadea (rojo); aparece un "ticket" generándose solo.

### 2 · Se publica — 4,5 s · `Yokup`
- **VO**: «Yokup la publica al instante en el tablón de trabajos de esa zona.»
- **Imagen**: una tarjeta de intervención "vuela" a un tablón con chips de zona.
- **Movimiento**: la tarjeta entra deslizando; pulso suave en el tablón.

### 3 · Se acepta — 5 s · `Instalador`
- **VO**: «Un técnico cualificado y cercano —freelance o empresa— ve el trabajo entre los suyos y lo acepta.»
- **Imagen**: vista del tablón filtrada con chips "✓ zona" y "✓ especialidad"; botón *Aceptar trabajo* se pulsa.
- **Movimiento**: el botón hace click (escala); la tarjeta pasa a "Mis trabajos".

### 4 · Se resuelve — 5 s · `Instalador`
- **VO**: «Va al punto de venta, lo arregla y marca la intervención como resuelta. Todo vuelve a funcionar.»
- **Imagen**: la pantalla del estanco vuelve a emitir (▶️ 🔊); el estado de la tarjeta pasa a "resuelta".
- **Movimiento**: los iconos cambian de apagado a encendido; check verde.

### 5 · Se valora — 5 s · `Punto de venta`
- **VO**: «Y el punto de venta valora el trabajo. Esa nota construye la reputación del técnico.»
- **Imagen**: selector de estrellas; se rellenan ★★★★★; sube el rating del técnico.
- **Movimiento**: las estrellas se encienden una a una; contador de rating sube.

### 6 · Cierre / CTA — 5 s
- **VO**: «Detecta, publica, acepta, resuelve y valora. Todo registrado, medido y valorado. Eso es Yokup.»
- **Imagen**: icono 🔁 con las cinco fases; dos botones: *Soy punto de venta* / *Soy instalador*.
- **Movimiento**: las 5 fases dibujan un círculo; los CTAs entran desde abajo.

---

## Notas de producción

- **Grabación de pantalla**: las escenas 2–5 pueden grabarse de la web real
  (`marketplace.html`, `panel.html`) para un look "producto de verdad". El recorrido demo
  está conectado: aceptar → resolver → valorar funciona end-to-end.
- **Subtítulos**: incrustar la locución como subtítulo (accesibilidad + reproducción sin sonido en redes).
- **Versión corta (15 s)**: usar solo escenas 0, 1, 5 y 6.
- **Llamada final**: URL `yokup.app` + los dos botones de alta.

## Texto en pantalla (por si se rotula)

| Escena | Rótulo |
|--------|--------|
| 0 | Yokup · Cada avería, resuelta y trazada |
| 1 | Se detecta · ⚙ Admira |
| 2 | Se publica · Yokup |
| 3 | Se acepta · Instalador |
| 4 | Se resuelve · Instalador |
| 5 | Se valora · Punto de venta |
| 6 | Detecta · Publica · Acepta · Resuelve · Valora |
