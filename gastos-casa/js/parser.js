// Parser de frases de gasto basado en reglas (sin IA).
// Entrada: el texto que devuelve el dictado del navegador o el teclado.
// Salida: monto, quién pagó, entre quiénes se reparte, comercio, rubro, tipo y fecha.
import { normalizar, limpiarToken, capitalizar } from './text.js';
import { extraerMonto } from './numbers.js';
import { buscarComercio, buscarPalabraClave } from './classifier.js';

const PRIMERA_PERSONA = ['gaste', 'pague', 'compre', 'puse', 'saque', 'abone', 'cargue'];
const VERBO_PAGO = ['pago', 'gasto', 'puso', 'compro', 'abono', 'cargo'];
const RELLENO = new Set([
  'en', 'de', 'del', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'por', 'al', 'a', 'y', 'que',
  'pesos', 'peso', 'mangos', 'guita', 'plata', 'hoy', 'recien', 'ahora', 'me', 'nos', 'se', 'lo', 'le',
  'con', 'es', 'fue', 'fueron', 'son', 'total', 'monto', 'gastos', 'cuenta', 'factura', 'pagar', 'boleta',
  'ayer', 'anteayer', 'antes', 'fijo', 'fija', 'extraordinario', 'extraordinaria', 'imprevisto', 'imprevista',
  'esporadico', 'esporadica', 'urgencia', 'entre', 'todos', 'todas', 'solo', 'sola', 'para', 'mitad',
  'medias', 'partes', 'iguales', 'ella', 'el', 'mi', 'si', 'ellos', 'casa', 'yo',
].concat(PRIMERA_PERSONA, VERBO_PAGO));

/**
 * @param {string} texto
 * @param {object} ctx { participantes:[{id,nombre}], usuarioActualId, comercios:[], palabrasClave:{}, ahora: Date }
 */
export function parsearFrase(texto, ctx) {
  const participantes = ctx.participantes || [];
  const ahora = ctx.ahora ? new Date(ctx.ahora.getTime()) : new Date();
  // Tokens normalizados (para comparar) y originales (para mostrar el comercio como se dijo).
  // Los separadores de números (12.500,50) se conservan; el resto de los signos se quita.
  const tokens = [];
  const orig = [];
  String(texto || '').split(/\s+/).forEach((t) => {
    const n = normalizar(t).replace(/^\$/, '').replace(/^[^a-z0-9]+/, '').replace(/[^a-z0-9]+$/, '');
    if (n) { tokens.push(n); orig.push(limpiarToken(t) || n); }
  });

  const usado = tokens.map(() => false);
  const marcar = (idx) => idx.forEach((k) => { usado[k] = true; });

  // 1) Monto
  const monto = extraerMonto(tokens);
  marcar(monto.indices);

  // 2) Participantes mencionados
  const porNombre = [];
  for (const p of participantes) {
    const completo = normalizar(p.nombre).split(' ').filter(Boolean);
    if (!completo.length) continue;
    porNombre.push({ id: p.id, toks: completo });
    if (completo.length > 1) porNombre.push({ id: p.id, toks: [completo[0]] });
  }
  porNombre.sort((a, b) => b.toks.length - a.toks.length);

  const menciones = []; // {id, indice}
  for (let i = 0; i < tokens.length; i++) {
    if (usado[i]) continue;
    for (const n of porNombre) {
      const tramo = tokens.slice(i, i + n.toks.length).join(' ');
      if (tramo === n.toks.join(' ')) {
        menciones.push({ id: n.id, indice: i });
        for (let k = i; k < i + n.toks.length; k++) usado[k] = true;
        break;
      }
    }
  }

  const tiene = (palabra) => tokens.indexOf(palabra) >= 0;
  const hayPrimeraPersona = PRIMERA_PERSONA.some((v) => tokens.indexOf(v) >= 0);

  let pagadorId = null;
  const beneficiarios = [];
  let conPagador = false; // "a medias con Juan" incluye al que pagó
  const indicesNombre = menciones.map((m) => m.indice);
  for (const m of menciones) {
    const prep = preposicionDeLista(tokens, m.indice, indicesNombre);
    if (prep === 'para' || prep === 'entre') {
      beneficiarios.push(m.id);
    } else if (prep === 'con') {
      beneficiarios.push(m.id);
      conPagador = true;
    } else if (!pagadorId && (!hayPrimeraPersona || VERBO_PAGO.indexOf(tokens[m.indice - 1]) >= 0)) {
      pagadorId = m.id; // "Ana 3200 farmacia", "Pagó Juan 45000"
    } else {
      beneficiarios.push(m.id); // "Gasté 5000 en remedios de Ana"
    }
  }
  if (!pagadorId) pagadorId = ctx.usuarioActualId || (participantes[0] && participantes[0].id) || null;

  // Pronombres: "solo para ella", "para mí"
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i] !== 'para') continue;
    const sig = tokens[i + 1];
    if (sig === 'ella' || sig === 'el' || sig === 'si') beneficiarios.push(pagadorId);
    if (sig === 'mi') beneficiarios.push(ctx.usuarioActualId || pagadorId);
  }

  let participantesIds = null; // null = usar el reparto por defecto
  let modo = null;
  if (tiene('todos') || tiene('todas')) {
    participantesIds = participantes.map((p) => p.id);
    modo = 'iguales';
  }
  if (beneficiarios.length) {
    participantesIds = unicos(conPagador ? [pagadorId].concat(beneficiarios) : beneficiarios);
    modo = 'iguales';
  }
  if (tiene('mitad') || tiene('medias')) {
    modo = 'iguales';
    if (!beneficiarios.length && !(tiene('todos') || tiene('todas'))) {
      participantesIds = participantes.map((p) => p.id);
    }
  }

  // 3) Tipo y fecha
  let tipo = null;
  if (tiene('fijo') || tiene('fija')) tipo = 'fijo';
  if (tiene('extraordinario') || tiene('extraordinaria') || tiene('imprevisto') || tiene('imprevista') || tiene('urgencia')) tipo = 'extraordinario';
  if (tiene('esporadico') || tiene('esporadica')) tipo = 'esporadico';
  const fecha = new Date(ahora.getTime());
  if (tiene('anteayer')) fecha.setDate(fecha.getDate() - 2);
  else if (tiene('ayer')) fecha.setDate(fecha.getDate() - 1);

  // 4) Comercio y rubro con lo que quedó
  const libresIdx = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!usado[i] && !RELLENO.has(tokens[i])) libresIdx.push(i);
  }
  const libres = libresIdx.map((i) => tokens[i]);
  let comercio = null;
  let comercioNombre = '';
  let categoriaId = null;
  const hallado = buscarComercio(libres, ctx.comercios || []);
  if (hallado) {
    comercio = hallado.comercio;
    comercioNombre = comercio.nombre;
    categoriaId = comercio.categoriaId || null;
    if (!tipo && comercio.tipo) tipo = comercio.tipo;
  } else {
    const clave = buscarPalabraClave(libres, ctx.palabrasClave || {});
    if (clave) categoriaId = clave.categoriaId;
    comercioNombre = capitalizar(libresIdx.map((i) => orig[i] || tokens[i]).join(' '));
  }

  return {
    centavos: monto.centavos,
    pagadorId,
    participantesIds,
    modo,
    comercioId: comercio ? comercio.id : null,
    comercioNombre: comercioNombre || '',
    categoriaId: categoriaId || 'sin-clasificar',
    tipo: tipo || 'esporadico',
    fecha,
    texto: String(texto || ''),
  };
}

/**
 * Si el nombre en la posición i va después de "para", "entre" o "con" (aunque sea en lista:
 * "entre Ana, Juan y Pedro"), devuelve esa preposición.
 */
function preposicionDeLista(tokens, i, indicesNombre) {
  for (let k = i - 1; k >= 0; k--) {
    const t = tokens[k];
    if (t === 'para' || t === 'entre' || t === 'con') return t;
    if (t === 'y' || t === 'e' || t === 'solo' || indicesNombre.indexOf(k) >= 0) continue;
    return null;
  }
  return null;
}

function unicos(arr) {
  const r = [];
  arr.forEach((x) => { if (x && r.indexOf(x) < 0) r.push(x); });
  return r;
}
