// Utilidades de texto puras (sin DOM). Se usan en el navegador y en los tests de Node.

/** Minúsculas, sin tildes ni diéresis. "Pagó" -> "pago", "Ñandú" -> "nandu". */
export function normalizar(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Quita signos al principio y al final de un token, conservando los separadores internos de números. */
export function limpiarToken(t) {
  return t.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');
}

/** Distancia de Levenshtein clásica (inserción, borrado, sustitución). */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const costo = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + costo);
    }
    const tmp = prev; prev = cur; cur = tmp;
  }
  return prev[b.length];
}

/** Capitaliza cada palabra: "verduleria don jose" -> "Verduleria Don Jose". */
export function capitalizar(s) {
  return String(s).replace(/(^|\s)(\S)/g, (m, sp, c) => sp + c.toUpperCase());
}

export function nuevoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
