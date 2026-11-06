// Interpretación de montos en texto dictado o escrito, sin IA.
// Soporta: "12500", "12.500", "12.500,50", "$12,500", "doce mil quinientos",
// "12 mil", "1,5 millones", "12 lucas", "un palo".

const UNIDADES = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24,
  veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
  cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500,
  seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700,
  ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900,
};

const MIL = { mil: 1, luca: 1, lucas: 1 };
const MILLON = { millon: 1, millones: 1, palo: 1, palos: 1 };

/** "12.500,50" -> 12500.5 ; devuelve null si el token no es numérico. */
export function parsearDigitos(tok) {
  let t = String(tok).replace(/^\$/, '').replace(/[.,]+$/, '');
  if (!/^\d[\d.,]*$/.test(t)) return null;
  const tienePunto = t.indexOf('.') >= 0;
  const tieneComa = t.indexOf(',') >= 0;
  if (tienePunto && tieneComa) {
    const dec = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ',';
    const miles = dec === '.' ? ',' : '.';
    t = t.split(miles).join('').replace(dec, '.');
    return Number(t);
  }
  const sep = tienePunto ? '.' : tieneComa ? ',' : null;
  if (!sep) return Number(t);
  const partes = t.split(sep);
  const sonMiles = partes.slice(1).every((p) => p.length === 3) && partes[0].length <= 3;
  if (sonMiles) return Number(partes.join(''));
  if (partes.length === 2) return Number(partes[0] + '.' + partes[1]);
  return Number(partes.join(''));
}

function esPalabraNumero(t) {
  return t in UNIDADES || t in MIL || t in MILLON;
}

/** Valor de una secuencia ya separada en tokens: ["doce","mil","quinientos"] -> 12500 */
function valorSecuencia(toks) {
  let total = 0;
  let actual = 0;
  let hayValor = false;
  for (const t of toks) {
    if (t === 'y') continue;
    const d = parsearDigitos(t);
    if (d !== null) { actual += d; hayValor = true; continue; }
    if (t in UNIDADES) { actual += UNIDADES[t]; hayValor = true; continue; }
    if (t in MIL) { total += (actual || 1) * 1000; actual = 0; hayValor = true; continue; }
    if (t in MILLON) { total = (total + (actual || 1)) * 1e6; actual = 0; hayValor = true; continue; }
  }
  return hayValor ? total + actual : null;
}

/**
 * Busca montos en una lista de tokens normalizados.
 * Devuelve el monto más grande encontrado (en centavos) y los índices que ocupa,
 * para que el resto del texto se pueda usar como comercio.
 * "un" o "una" sueltos (artículos) no cuentan como monto.
 */
export function extraerMonto(tokens) {
  const corridas = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (parsearDigitos(t) !== null || esPalabraNumero(t)) {
      const inicio = i;
      const toks = [];
      while (i < tokens.length) {
        const u = tokens[i];
        if (parsearDigitos(u) !== null || esPalabraNumero(u)) { toks.push(u); i++; continue; }
        // "treinta y cinco": la "y" solo une si sigue otro número
        if (u === 'y' && i + 1 < tokens.length && esPalabraNumero(tokens[i + 1]) && toks.length) {
          toks.push(u); i++; continue;
        }
        break;
      }
      const soloArticulo = toks.length === 1 && (toks[0] === 'un' || toks[0] === 'una' || toks[0] === 'uno');
      if (!soloArticulo) {
        const v = valorSecuencia(toks);
        if (v !== null && v > 0) corridas.push({ valor: v, indices: range(inicio, i) });
      }
    } else {
      i++;
    }
  }
  if (!corridas.length) return { centavos: null, indices: [] };
  corridas.sort((a, b) => b.valor - a.valor);
  return { centavos: Math.round(corridas[0].valor * 100), indices: corridas[0].indices };
}

function range(a, b) {
  const r = [];
  for (let k = a; k < b; k++) r.push(k);
  return r;
}

/** Para inputs de formulario: "12.500,50" o "12500.5" -> centavos. */
export function textoACentavos(s) {
  const v = parsearDigitos(String(s).trim().replace(/\s/g, ''));
  return v === null || isNaN(v) ? null : Math.round(v * 100);
}
