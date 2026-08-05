#!/usr/bin/env python3
"""Regenera el espejo yokup-site/normativa.html desde la normativa CANÓNICA de
AdmiraNeXT. Manda la canónica (la que más reglas tiene); el espejo conserva su
propio envoltorio (hero, pie, yk-frame) y sólo se le reescriben las reglas."""
import re, sys, pathlib

# Las rutas se RESUELVEN, no se escriben a fuego. Estaban fijadas al layout de
# una maquina concreta (Documents/Codex/...) y en las demas el script no podia
# ni arrancar: por eso el espejo y la canonica se separaron sin que nadie lo
# viera. El espejo se resuelve desde este mismo repo; la canonica se busca en
# los sitios donde suele estar clonada, y si no aparece se dice cual falta.
AQUI = pathlib.Path(__file__).resolve().parent.parent          # …/tool
MIRROR = AQUI / "yokup-site" / "normativa.html"
CANDIDATAS = [
    AQUI.parent / "admira-next-web" / "normativa.html",        # junto a tool
    pathlib.Path.home() / "Documents/Admirito/admira-next-web/normativa.html",
    pathlib.Path.home() / "Documents/Codex/admira-next-web/normativa.html",
]
CANON = next((c for c in CANDIDATAS if c.is_file()), None)
if CANON is None:
    sys.exit("no encuentro normativa.html de admira-next-web. Buscado en:\n  " +
             "\n  ".join(str(c) for c in CANDIDATAS))

canon = CANON.read_text(encoding="utf-8")
mirror = MIRROR.read_text(encoding="utf-8")

# ── 1. extraer las reglas de la canónica ────────────────────────────────────
arts = re.findall(
    r'<article class="art" id="n(\d+)">\s*<div class="num">(\d+)</div>\s*<div>(.*?)</div>\s*</article>',
    canon, re.S)
if not arts:
    sys.exit("no se han encontrado artículos en la canónica")

secciones = []
for idn, num, cuerpo in arts:
    if idn.lstrip("0") != num.lstrip("0"):
        sys.exit(f"regla {num}: el id n{idn} no concuerda con su número")
    c = cuerpo
    # el espejo no usa el envoltorio .tbl: sus tablas van desnudas
    c = re.sub(r'<div class="tbl">\s*(<table.*?</table>)\s*</div>', r'\1', c, flags=re.S)
    # los enlaces relativos de admiranext.com deben ser absolutos fuera de su dominio
    c = re.sub(r'href="(/(?!/)[^"]*)"', r'href="https://www.admiranext.com\1"', c)
    # reindentar de 8 a 6 espacios (el espejo anida un nivel menos)
    c = "\n".join(l[2:] if l.startswith("        ") else l for l in c.split("\n"))
    secciones.append(
        '  <section class="rule">\n'
        f'    <div class="num">{num.zfill(2)}</div>\n'
        '    <div>' + c.rstrip() + '\n    </div>\n'
        '  </section>')

bloque = "\n\n".join(secciones)

# ── 2. sustituir el bloque de reglas del espejo ─────────────────────────────
ini = mirror.index('  <section class="rule">')
fin = mirror.index('<footer class="foot">')
fin = mirror.rindex('</section>', ini, fin) + len('</section>')
nuevo = mirror[:ini] + bloque + mirror[fin:]

# ── 3. el pie declara que es espejo y de qué versión ────────────────────────
sello = re.search(r'admiranext-version" content="(?:AdmiraNeXT )?(v\.[\d.:r]+)"', canon)
if sello:
    nuevo = re.sub(
        r'(Espejo de <a href="https://www\.admiranext\.com/normativa">admiranext\.com/normativa</a>)',
        r'\1 · ' + sello.group(1), nuevo, count=1)
    nuevo = re.sub(r'(Espejo de <a[^>]*>admiranext\.com/normativa</a> · v\.[\d.:r]+)( · v\.[\d.:r]+)+',
                   r'\1', nuevo)

MIRROR.write_text(nuevo, encoding="utf-8")
print(f"espejo regenerado: {len(arts)} reglas · sello {sello.group(1) if sello else '?'}")
for _, num, cuerpo in arts:
    h = re.search(r"<h2>(.*?)</h2>", cuerpo, re.S)
    print(f"  {num.zfill(2)} · {re.sub(r'<[^>]+>', '', h.group(1)).strip()}")
