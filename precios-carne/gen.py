import json, html, re, unicodedata
arr={}
for n,p,u in json.load(open('/tmp/claude-0/-home-user-demo/33ad285b-8ded-5fcd-a9a3-0b73157d0618/scratchpad/arreo.json')):
    arr.setdefault(n,(int(p)//100,u.split('?')[0]))
# cut: (arreo name, display, la variants [(desc, price, regular|None)], note)
C=[
("Vacío","Vacío",[("Vacío Envasado al Vacío FB Meats",16390,None),("Vacío E/V Best",17790,20930),("Vacío E/V Estancias LA",22640,None)],""),
("Tapa de Asado","Tapa de asado",[("Tapa de Asado Best",16760,None),("Tapa de Asado Envasado al Vacío Estancias LA",18990,None)],""),
("Asado de Costilla","Asado de costilla / con hueso",[("Asado con Hueso FB Meats",12790,None)],"Equivalencia aproximada: El Arreo vende «Asado de Costilla» y La Anónima «Asado con Hueso»; puede variar el tipo de corte."),
("Matambre","Matambre",[("Matambre Envasado al Vacío FB Meats",14590,None)],""),
("Colita de Cuadril","Colita de cuadril",[("Colita de Cuadril Envasado al Vacío FB Meats",17090,None),("Colita de Cuadril E/V Estancias LA",21790,27260)],""),
("Peceto","Peceto",[("Peceto Feteado E/V Best",22510,None),("Peceto Feteado E/V Estancias LA",26080,None)],""),
("Cuadril","Cuadril",[("Cuadril Feteado Fraccionado Best",17283,24690)],"El precio de La Anónima es una promoción 30% OFF; sin promo costaría más que El Arreo."),
("Bife de Chorizo","Bife de chorizo (bife angosto)",[("Bife Angosto con Feteado Best",26620,None)],"Se asume que «bife angosto» de La Anónima equivale al bife de chorizo."),
("Nalga","Nalga",[("Nalga s/Tapa Feteada E/V Estancias LA",19190,24050)],""),
("Tapa de Nalga","Tapa de nalga",[("Tapa de Nalga FB Meats Envasado al Vacío",15590,None)],""),
("Bola de Lomo","Bola de lomo",[("Bola de Lomo Feteada E/V Best",16790,20320),("Bola de Lomo Feteada E/V Estancias LA",23450,None)],""),
("Cuadrada","Cuadrada",[("Cuadrada Feteada FB Meats",15590,None),("Cuadrada Feteada E/V Estancias LA",23450,None)],""),
("Roast Beef","Roast beef",[("Roast Beef Feteado E/V LA (30% OFF)",14441,20630),("Roast Beef Fraccionado E/V Best",14990,17810)],""),
("Paleta","Paleta",[("Carnaza de Paleta Fraccionada E/V Estancias LA",20820,None)],"Equivalencia aproximada: La Anónima publica «Carnaza de Paleta»."),
("Picada","Carne picada",[("Carne Picada E/V Estancias LA 500 g (18.380 $/kg)",18380,23060)],"Se asume que «Picada» de El Arreo es carne picada. La Anónima la vende en pack de 500 g ($9.190); se muestra el precio por kg."),
]
def slug(s): return re.sub(r'[^a-z0-9]+','-',unicodedata.normalize('NFKD',s.lower()).encode('ascii','ignore').decode()).strip('-')
f=lambda n:"$ {:,}".format(n).replace(",",".")
rows=[]
for an,disp,vars_,note in C:
    ap,au=arr[an]
    best=min(vars_,key=lambda v:v[1]); bp=best[1]
    reg=min((v[2] or v[1]) for v in vars_)
    la_hoy=bp; la_reg=reg
    d=ap-la_hoy; dr=ap-la_reg
    rows.append(dict(an=an,disp=disp,vars=vars_,note=note,ap=ap,au=au,la=la_hoy,lareg=la_reg,d=d,dr=dr,best=best,slug=slug(disp)))
def win(d): return ("La Anónima" if d>0 else "El Arreo" if d<0 else "Empate")
CSS="""<style>
:root{--bg:#fafaf7;--fg:#1d1d1b;--mut:#6b6b66;--card:#fff;--bd:#e4e2da;--la:#0b5ea8;--ar:#b5472b;--ok:#1d7a46}
@media(prefers-color-scheme:dark){:root{--bg:#161614;--fg:#eeece6;--mut:#9a9890;--card:#201f1c;--bd:#37352f;--la:#6db3f2;--ar:#f08a6c;--ok:#5fd18b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px 48px}h1{font-size:1.6rem;margin:.2em 0}h2{font-size:1.1rem;margin:1.6em 0 .5em}
.mut{color:var(--mut);font-size:.9rem}.card{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:16px;margin:12px 0}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:560px){.grid{grid-template-columns:1fr}}
.big{font-size:1.9rem;font-weight:700}.la{color:var(--la)}.ar{color:var(--ar)}.win{border-color:var(--ok);box-shadow:0 0 0 2px var(--ok) inset}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--bd);border-radius:12px;overflow:hidden;font-size:.95rem}
th,td{padding:9px 10px;border-bottom:1px solid var(--bd);text-align:left}th{font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;color:var(--mut)}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
tr:last-child td{border-bottom:0}a{color:var(--la)}.tag{display:inline-block;padding:1px 8px;border-radius:99px;font-size:.8rem;font-weight:600}
.tla{background:color-mix(in srgb,var(--la) 18%,transparent);color:var(--la)}.tar{background:color-mix(in srgb,var(--ar) 18%,transparent);color:var(--ar)}
.wrap{overflow-x:auto}
</style>"""
def head(t): return f'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(t)}</title>{CSS}</head><body><main>'
FOOT='<p class="mut" style="margin-top:2rem">Precios por kg en ARS, Santa Rosa (La Pampa), 23/11/2026. <b>El Arreo</b>: leído del sitio elarreo.com.ar. <b>La Anónima</b> (sucursal Santa Rosa 6300): transcripto de capturas de pantalla de su tienda online; su sitio bloquea el acceso automatizado. Los precios pueden cambiar en el día.</p></main></body></html>'
def tag(w): return f'<span class="tag {"tla" if w=="La Anónima" else "tar"}">{w}</span>' if w!="Empate" else "Empate"
def diffline(d,lbl):
    w=win(d); 
    return f'<p>{lbl}: gana {tag(w)} por <b>{f(abs(d))}/kg</b> ({abs(d)/max(1,(rowap if False else 1))*0:.0f}%)</p>' if False else None
for r in rows:
    w=win(r['d']); wr=win(r['dr']); pct=abs(r['d'])/max(r['ap'],r['la'])*100
    o=head(f"{r['disp']} – comparación de precios")
    o+=f'<p class="mut"><a href="index.html">← Ranking general</a></p><h1>{html.escape(r["disp"])}</h1><p class="mut">Precio por kg · Santa Rosa, La Pampa</p>'
    o+='<div class="grid">'
    o+=f'<div class="card {"win" if w=="El Arreo" else ""}"><div class="mut">El Arreo</div><div class="big ar">{f(r["ap"])}</div><div class="mut"><a href="{r["au"]}">ver producto</a></div></div>'
    o+=f'<div class="card {"win" if w=="La Anónima" else ""}"><div class="mut">La Anónima · mejor opción</div><div class="big la">{f(r["la"])}</div><div class="mut">{html.escape(r["best"][0])}</div></div></div>'
    o+=f'<div class="card"><b>Gana {tag(w)}</b> con una diferencia de <b>{f(abs(r["d"]))}/kg</b> ({pct:.1f}%).'
    if r['lareg']!=r['la']:
        o+=f'<br><span class="mut">Sin contar promociones de La Anónima ({f(r["lareg"])}/kg): gana {tag(wr)} por {f(abs(r["dr"]))}/kg.</span>'
    o+='</div>'
    o+='<h2>Todas las variantes de La Anónima</h2><div class="wrap"><table><tr><th>Producto</th><th class="n">Precio hoy</th><th class="n">Precio regular</th><th class="n">vs El Arreo</th></tr>'
    for desc,p,rg in sorted(r['vars'],key=lambda v:v[1]):
        dd=r['ap']-p; o+=f'<tr><td>{html.escape(desc)}</td><td class="n">{f(p)}</td><td class="n">{f(rg) if rg else "—"}</td><td class="n">{"+" if dd>0 else "−" if dd<0 else ""}{f(abs(dd))} {"más barato" if dd>0 else "más caro" if dd<0 else ""}</td></tr>'
    o+='</table></div>'
    if r['note']: o+=f'<p class="mut"><b>Nota:</b> {html.escape(r["note"])}</p>'
    o+=FOOT
    open(r['slug']+'.html','w').write(o)
# index
rk=sorted(rows,key=lambda r:-r['d'])
o=head("Ranking carne vacuna Santa Rosa")
o+='<h1>Carne vacuna en Santa Rosa: La Anónima vs El Arreo</h1><p class="mut">Precio por kg, 23/11/2026. Diferencia = precio El Arreo − mejor precio La Anónima (positivo: La Anónima es más barata).</p>'
la=sum(1 for r in rows if r['d']>0); ar=sum(1 for r in rows if r['d']<0)
o+=f'<div class="grid"><div class="card"><div class="mut">Cortes donde gana La Anónima</div><div class="big la">{la}</div></div><div class="card"><div class="mut">Cortes donde gana El Arreo</div><div class="big ar">{ar}</div></div></div>'
o+='<h2>Ranking por corte</h2><div class="wrap"><table><tr><th>#</th><th>Corte</th><th class="n">El Arreo</th><th class="n">La Anónima</th><th class="n">Diferencia</th><th>Gana</th><th class="n">Dif. sin promo</th></tr>'
for i,r in enumerate(rk,1):
    ds=f'{"+" if r["d"]>0 else "−"}{f(abs(r["d"]))}'; dr=f'{"+" if r["dr"]>0 else "−"}{f(abs(r["dr"]))}'
    o+=f'<tr><td>{i}</td><td><a href="{r["slug"]}.html">{html.escape(r["disp"])}</a></td><td class="n">{f(r["ap"])}</td><td class="n">{f(r["la"])}</td><td class="n">{ds}</td><td>{tag(win(r["d"]))}</td><td class="n">{dr} ({win(r["dr"]).replace("La Anónima","LA").replace("El Arreo","Arreo")})</td></tr>'
o+='</table></div>'
tl=sum(r['d'] for r in rows)
o+=f'<p class="mut">Suma de diferencias en los {len(rows)} cortes (1 kg de cada uno): {"La Anónima" if tl>0 else "El Arreo"} ahorra {f(abs(tl))}.</p>'
o+='<p class="mut">«Dif. sin promo» usa el precio regular tachado de La Anónima en los productos en oferta. La Anónima: se toma la variante más barata de cada corte; las marcas (Best, FB Meats, Estancias LA) cambian el precio. Cortes sin equivalente publicado en ambos sitios (entraña, lomo, osobuco, falda, aguja, palomita, cima, tortuguita) quedan fuera.</p>'
o+=FOOT
open('index.html','w').write(o)
print(f"{'corte':32}{'arreo':>8}{'LA':>8}{'dif':>8}{'sinpromo':>9}")
for r in rk: print(f"{r['disp']:32}{r['ap']:>8}{r['la']:>8}{r['d']:>8}{r['dr']:>9}")
print(tl)
