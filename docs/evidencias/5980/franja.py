# Pega bajo cada captura la franja con URL, llamadas a la API y nota (lee <captura>.png.json de capturas.mjs).
import json,sys,glob
from PIL import Image,ImageDraw,ImageFont
d=sys.argv[1];F=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',15)
for png in sorted(glob.glob(d+'/*.png')):
    meta=json.load(open(png+'.json'));im=Image.open(png).convert('RGB')
    lines=[('URL  '+meta['url'],'#ffffff')]+[('API  '+a,'#ff8a80' if a.startswith('4') else '#9be7a8') for a in meta['api']]+[(meta['nota'],'#ffd479'),('Demo local: node api/tools/demo-proyecto.mjs · API real de Yokup (api/src) en memoria, datos y sesiones de prueba','#9a9a9a')]
    h=16+len(lines)*22;out=Image.new('RGB',(im.width,im.height+h),'#111111');out.paste(im,(0,0))
    dr=ImageDraw.Draw(out);dr.rectangle([0,im.height,im.width,im.height+3],fill='#00704a')
    for i,(t,c) in enumerate(lines):dr.text((14,im.height+10+i*22),t,font=F,fill=c)
    out.save(png,optimize=True)
