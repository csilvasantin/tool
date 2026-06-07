# Plan de fusión → monorepo Pixeria

**Objetivo:** repo **principal = pixeria**; dentro se integran **Yokup (`tool`)** y los
repos de pixeria (`pixeria.com` Astro y `pixeria` HTML), conservando el historial.

> ⚠️ Esto NO puede ejecutarse en la sesión actual (atada a `csilvasantin/tool`, sin
> acceso de lectura/escritura a los repos pixeria). Hay que correrlo en una sesión cuyo
> **repo principal sea `csilvasantin/pixeria.com`** y con `pixeria` + `tool` también en scope.

## Decisión pendiente: ¿qué pasa con los dos repos pixeria?

- **A) `pixeria.com` (Astro) es la versión nueva** que sustituye a `pixeria` (HTML).
  → Base = Astro; el HTML entra archivado en `legacy/` o se descarta.
- **B) Son cosas distintas** (landing vs sitio de referencia) que conviven.
  → Cada uno en su carpeta dentro del monorepo.

Este plan asume **principal = `pixeria.com` (Astro)** y deja sitio a ambos.

## Estructura propuesta

```
pixeria.com/                  (raíz = www.pixeria.com, Astro)
├─ src/ astro.config.* ...    (sitio Astro existente, intacto)
├─ apps/
│  ├─ yokup/                  ← csilvasantin/tool  (web/ + api/ + db/ + docs/)
│  └─ pixeria-legacy/         ← csilvasantin/pixeria (HTML) [opción B; o legacy/ en A]
└─ docs/fusion.md             (notas de la fusión)
```

Mantener Yokup en `apps/yokup/` lo deja autocontenido: su Worker (`api/`), su web
estática y su esquema siguen funcionando igual, solo cambia la ruta.

## Comandos (preservando historial con git subtree)

```bash
# Partimos del clon del principal (pixeria.com), rama main limpia.
cd pixeria.com

# 1) Yokup (tool) como subtree
git remote add yokup   <URL_de_tool>
git fetch yokup
git subtree add --prefix=apps/yokup yokup main

# 2) pixeria (HTML) como subtree  [opción B]
git remote add pxhtml  <URL_de_pixeria>
git fetch pxhtml
git subtree add --prefix=apps/pixeria-legacy pxhtml main

git push origin main
```

`git subtree` trae todos los commits de cada repo bajo su prefijo, así que el historial
se conserva (a diferencia de copiar archivos). Para actualizar luego desde el origen:
`git subtree pull --prefix=apps/yokup yokup main`.

> Alternativa sin historial (más simple): copiar los árboles a `apps/*` y un solo commit
> "import yokup + pixeria". Se pierde la historia pero es trivial.

## Cosas a resolver tras el merge

1. **Despliegue**: hoy `tool` publica `web/` por GitHub Pages (`.github/workflows/pages.yml`)
   y pixeria.com es Astro. Al unificar, decidir el build/deploy del monorepo
   (Astro como sitio raíz; Yokup como subpath o subdominio).
2. **CNAME / dominio**: cuidado con el viejo `CNAME=pixeria.com` (estaba "en venta, sin DNS"
   según el README de tool). Fijar el dominio en el repo principal.
3. **Rutas y assets**: revisar enlaces relativos de Yokup (`web/`) si pasa a vivir bajo
   `apps/yokup/`.
4. **Secrets del Worker** (Supabase, Telegram, Grok): siguen en Cloudflare, no en el repo.

## Checklist para abrir la sesión correcta

- [ ] Sesión con **principal = `csilvasantin/pixeria.com`** (write).
- [ ] Añadir en scope: `csilvasantin/pixeria` y `csilvasantin/tool`.
- [ ] Confirmar opción A o B (arriba).
- [ ] Ejecutar los `git subtree add`.
- [ ] Ajustar build/deploy y dominio.
