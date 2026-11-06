// Gráficos en SVG puro, sin librerías.
const NS = 'http://www.w3.org/2000/svg';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Torta (dona). datos: [{etiqueta, valor, color}] */
export function dona(datos, titulo) {
  const total = datos.reduce((a, d) => a + d.valor, 0);
  if (!total) return '';
  const r = 60;
  const c = 2 * Math.PI * r;
  let acumulado = 0;
  const arcos = datos.map((d) => {
    const largo = (d.valor / total) * c;
    const s = `<circle r="${r}" cx="80" cy="80" fill="none" stroke="${esc(d.color)}" stroke-width="28"
      stroke-dasharray="${largo.toFixed(2)} ${(c - largo).toFixed(2)}" stroke-dashoffset="${(-acumulado).toFixed(2)}"
      transform="rotate(-90 80 80)"><title>${esc(d.etiqueta)}</title></circle>`;
    acumulado += largo;
    return s;
  }).join('');
  return `<svg xmlns="${NS}" viewBox="0 0 160 160" class="grafico-dona" role="img" aria-label="${esc(titulo)}">${arcos}</svg>`;
}

/** Barras verticales. datos: [{etiqueta, valor, destacado}] */
export function barras(datos, titulo, formato) {
  const max = Math.max.apply(null, datos.map((d) => d.valor).concat([1]));
  const ancho = 300;
  const alto = 140;
  const paso = ancho / datos.length;
  const bw = Math.min(36, paso * 0.6);
  const cuerpo = datos.map((d, i) => {
    const h = Math.round((d.valor / max) * (alto - 30));
    const x = i * paso + (paso - bw) / 2;
    const y = alto - 18 - h;
    return `<g><rect x="${x.toFixed(1)}" y="${y}" width="${bw.toFixed(1)}" height="${h}" rx="4"
      class="${d.destacado ? 'barra barra-actual' : 'barra'}"><title>${esc(d.etiqueta)}: ${esc(formato(d.valor))}</title></rect>
      <text x="${(x + bw / 2).toFixed(1)}" y="${alto - 4}" text-anchor="middle" class="barra-etiqueta">${esc(d.etiqueta)}</text></g>`;
  }).join('');
  return `<svg xmlns="${NS}" viewBox="0 0 ${ancho} ${alto}" class="grafico-barras" role="img" aria-label="${esc(titulo)}">${cuerpo}</svg>`;
}
