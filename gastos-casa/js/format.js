// Formatos argentinos: $ 12.500,50 y dd/mm/aaaa.
const conDecimales = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sinDecimales = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 });

export function pesos(centavos) {
  const c = Math.round(Number(centavos) || 0);
  // Intl a veces separa "$" con espacio no separable; lo dejamos así para que no se corte la línea.
  return (c % 100 === 0 ? sinDecimales : conDecimales).format(c / 100);
}

/** Centavos -> "12500,50" para inputs editables. */
export function centavosATexto(c) {
  if (c == null) return '';
  const n = Math.round(c);
  const ent = Math.trunc(n / 100);
  const dec = Math.abs(n % 100);
  return dec ? ent + ',' + String(dec).padStart(2, '0') : String(ent);
}

const p2 = (n) => String(n).padStart(2, '0');

export function fecha(d) {
  const x = new Date(d);
  return p2(x.getDate()) + '/' + p2(x.getMonth() + 1) + '/' + x.getFullYear();
}

export function hora(d) {
  const x = new Date(d);
  return p2(x.getHours()) + ':' + p2(x.getMinutes());
}

/** Valor para <input type="datetime-local"> en hora local. */
export function aInputFechaHora(d) {
  const x = new Date(d);
  return x.getFullYear() + '-' + p2(x.getMonth() + 1) + '-' + p2(x.getDate()) + 'T' + p2(x.getHours()) + ':' + p2(x.getMinutes());
}

/** Valor para <input type="date">. */
export function aInputFecha(d) {
  const x = new Date(d);
  return x.getFullYear() + '-' + p2(x.getMonth() + 1) + '-' + p2(x.getDate());
}

/** "2026-11-06T10:30" (hora local) -> Date. Safari no siempre interpreta bien este formato con new Date(). */
export function deInputFechaHora(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(s || ''));
  if (!m) return new Date();
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0));
}

export function claveMes(d) {
  const x = new Date(d);
  return x.getFullYear() + '-' + p2(x.getMonth() + 1);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function nombreMes(clave) {
  const [a, m] = clave.split('-');
  const n = MESES[+m - 1] || clave;
  return n.charAt(0).toUpperCase() + n.slice(1) + ' ' + a;
}

export function mesAnterior(clave, n) {
  const [a, m] = clave.split('-').map(Number);
  const d = new Date(a, m - 1 - (n || 1), 1);
  return claveMes(d);
}
