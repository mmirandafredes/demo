// Clasificación de comercios por diccionario + coincidencia aproximada. Sin IA.
import { normalizar, levenshtein } from './text.js';

function tolerancia(len) {
  if (len < 4) return 0;
  if (len <= 6) return 1;
  if (len <= 10) return 2;
  return 3;
}

/** Arma los n-gramas (1 a 4 palabras) de una lista de tokens, con sus índices. */
function ngramas(tokens, max) {
  const r = [];
  for (let n = Math.min(max, tokens.length); n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      r.push({ texto: tokens.slice(i, i + n).join(' '), indices: rango(i, i + n) });
    }
  }
  return r;
}

function rango(a, b) {
  const r = [];
  for (let k = a; k < b; k++) r.push(k);
  return r;
}

/** Todas las formas en que se puede nombrar a un comercio, normalizadas. */
export function nombresDe(comercio) {
  const lista = [comercio.nombre].concat(comercio.alias || []);
  const r = [];
  for (const n of lista) {
    const k = normalizar(n);
    if (k && r.indexOf(k) < 0) r.push(k);
  }
  return r;
}

/**
 * Busca el comercio que mejor coincide con los tokens.
 * Prioridad: coincidencia exacta más larga > coincidencia aproximada.
 * @returns {{comercio, indices, exacto}|null}
 */
export function buscarComercio(tokens, comercios) {
  if (!tokens.length || !comercios || !comercios.length) return null;
  const grams = ngramas(tokens, 4);
  let mejor = null;
  for (const c of comercios) {
    for (const nombre of nombresDe(c)) {
      for (const g of grams) {
        let puntaje = -1;
        if (g.texto === nombre) {
          puntaje = 1000 + nombre.length;
        } else {
          const tol = tolerancia(nombre.length);
          if (tol && Math.abs(g.texto.length - nombre.length) <= tol) {
            const d = levenshtein(g.texto, nombre);
            if (d <= tol) puntaje = 500 + nombre.length - d * 10;
          }
        }
        if (puntaje > 0 && (!mejor || puntaje > mejor.puntaje)) {
          mejor = { comercio: c, indices: g.indices, exacto: puntaje >= 1000, puntaje };
        }
      }
    }
  }
  return mejor;
}

/**
 * Busca una palabra clave genérica ("verduleria" -> alimentos).
 * @param palabrasClave objeto { "verduleria": "alimentos", "luz": "energia-internet", ... }
 * @returns {{palabra, categoriaId, indices}|null}
 */
export function buscarPalabraClave(tokens, palabrasClave) {
  if (!tokens.length || !palabrasClave) return null;
  const claves = Object.keys(palabrasClave).map((k) => ({ k: normalizar(k), cat: palabrasClave[k] }));
  const grams = ngramas(tokens, 3);
  let mejor = null;
  for (const g of grams) {
    for (const c of claves) {
      let puntaje = -1;
      if (g.texto === c.k) puntaje = 1000 + c.k.length;
      else if (c.k.length >= 5) {
        const tol = Math.min(1, tolerancia(c.k.length));
        if (Math.abs(g.texto.length - c.k.length) <= tol && levenshtein(g.texto, c.k) <= tol) {
          puntaje = 500 + c.k.length;
        }
      }
      if (puntaje > 0 && (!mejor || puntaje > mejor.puntaje)) {
        mejor = { palabra: c.k, categoriaId: c.cat, indices: g.indices, puntaje };
      }
    }
  }
  return mejor;
}

/**
 * Clasifica un texto libre de comercio (por ejemplo, lo que se escribe en el formulario).
 * @returns {{comercio|null, categoriaId|null, tipo|null}}
 */
export function clasificarTexto(texto, comercios, palabrasClave) {
  const tokens = normalizar(texto).split(' ').filter(Boolean);
  const c = buscarComercio(tokens, comercios);
  if (c) return { comercio: c.comercio, categoriaId: c.comercio.categoriaId || null, tipo: c.comercio.tipo || null };
  const p = buscarPalabraClave(tokens, palabrasClave);
  if (p) return { comercio: null, categoriaId: p.categoriaId, tipo: null };
  return { comercio: null, categoriaId: null, tipo: null };
}
