// Repartos y saldos al estilo Tricount. Todo en centavos (enteros) para que las cuentas cierren exacto.

/**
 * Reparte un monto entre participantes por el método del mayor resto, así la suma da exacto.
 * @param {number} total centavos
 * @param {string[]} ids
 * @param {number[]} pesos mismo largo que ids (para iguales, todos 1)
 */
export function repartirPorPesos(total, ids, pesos) {
  const r = {};
  if (!ids.length) return r;
  const sumaPesos = pesos.reduce((a, b) => a + b, 0);
  if (sumaPesos <= 0) return repartirPorPesos(total, ids, ids.map(() => 1));
  let asignado = 0;
  const restos = ids.map((id, k) => {
    const exacto = (total * pesos[k]) / sumaPesos;
    const base = Math.floor(exacto);
    r[id] = base;
    asignado += base;
    return { id, resto: exacto - base, k };
  });
  let faltan = total - asignado;
  restos.sort((a, b) => b.resto - a.resto || a.k - b.k);
  for (let k = 0; faltan > 0; k = (k + 1) % restos.length, faltan--) r[restos[k].id] += 1;
  return r;
}

/**
 * Cuánto le corresponde a cada participante de un gasto.
 * reparto = { modo: 'iguales'|'porcentaje'|'montos', participantes: [ids], valores: {id: número} }
 * - porcentaje: valores en % (pueden no sumar 100: se normalizan)
 * - montos: valores en centavos; si no suman el total, se reparte proporcionalmente
 */
export function cuotasDeGasto(gasto) {
  const rep = gasto.reparto || {};
  const ids = rep.participantes && rep.participantes.length ? rep.participantes : [gasto.pagadorId];
  const valores = rep.valores || {};
  if (rep.modo === 'porcentaje' || rep.modo === 'montos') {
    const pesos = ids.map((id) => Math.max(0, Number(valores[id]) || 0));
    if (rep.modo === 'montos' && pesos.reduce((a, b) => a + b, 0) === gasto.monto) {
      const r = {};
      ids.forEach((id, k) => { r[id] = pesos[k]; });
      return r;
    }
    return repartirPorPesos(gasto.monto, ids, pesos);
  }
  return repartirPorPesos(gasto.monto, ids, ids.map(() => 1));
}

/** Quién pagó un gasto. Si salió de una reserva, lo pagaron quienes aportaron a esa reserva. */
export function pagosDeGasto(gasto, aportesReservas) {
  if (gasto.reservaId && aportesReservas) {
    const aportes = aportesReservas.filter((a) => a.reservaId === gasto.reservaId);
    const porPersona = {};
    aportes.forEach((a) => { porPersona[a.participanteId] = (porPersona[a.participanteId] || 0) + a.monto; });
    const ids = Object.keys(porPersona).filter((id) => porPersona[id] > 0);
    if (ids.length) return repartirPorPesos(gasto.monto, ids, ids.map((id) => porPersona[id]));
  }
  const r = {};
  r[gasto.pagadorId] = gasto.monto;
  return r;
}

/**
 * Saldos por participante.
 * @param {object} datos { participantes, gastos, pagos, aportesReservas }
 *   gastos: ya filtrados y sin borradores
 * @returns {{[id]: {pagado, correspondia, recibido, enviado, saldo}}}
 */
export function calcularSaldos(datos) {
  const r = {};
  const asegurar = (id) => {
    if (!r[id]) r[id] = { pagado: 0, correspondia: 0, enviado: 0, recibido: 0, saldo: 0 };
    return r[id];
  };
  (datos.participantes || []).forEach((p) => asegurar(p.id));
  (datos.gastos || []).forEach((g) => {
    if (g.borrador) return;
    const pagos = pagosDeGasto(g, datos.aportesReservas);
    Object.keys(pagos).forEach((id) => { asegurar(id).pagado += pagos[id]; });
    const cuotas = cuotasDeGasto(g);
    Object.keys(cuotas).forEach((id) => { asegurar(id).correspondia += cuotas[id]; });
  });
  (datos.pagos || []).forEach((p) => {
    asegurar(p.deId).enviado += p.monto;
    asegurar(p.aId).recibido += p.monto;
  });
  Object.keys(r).forEach((id) => {
    const x = r[id];
    x.saldo = x.pagado - x.correspondia + x.enviado - x.recibido;
  });
  return r;
}

/**
 * Simplifica deudas: el que más debe le paga al que más tiene a favor, hasta cancelar.
 * Como mucho genera (participantes - 1) transferencias.
 * @returns {{deId, aId, monto}[]}
 */
export function simplificarDeudas(saldos) {
  const deudores = [];
  const acreedores = [];
  Object.keys(saldos).forEach((id) => {
    const s = saldos[id].saldo;
    if (s < 0) deudores.push({ id, monto: -s });
    else if (s > 0) acreedores.push({ id, monto: s });
  });
  const ordenar = (a, b) => b.monto - a.monto || (a.id < b.id ? -1 : 1);
  const r = [];
  deudores.sort(ordenar);
  acreedores.sort(ordenar);
  let i = 0;
  let j = 0;
  while (i < deudores.length && j < acreedores.length) {
    const m = Math.min(deudores[i].monto, acreedores[j].monto);
    if (m > 0) r.push({ deId: deudores[i].id, aId: acreedores[j].id, monto: m });
    deudores[i].monto -= m;
    acreedores[j].monto -= m;
    if (deudores[i].monto === 0) i++;
    if (acreedores[j].monto === 0) j++;
  }
  return r;
}

/** Aporte mensual sugerido para llegar a una reserva: (objetivo - acumulado) / meses restantes. */
export function aporteMensualSugerido(objetivo, acumulado, fechaObjetivo, hoy) {
  const falta = Math.max(0, objetivo - acumulado);
  if (!falta) return 0;
  const h = hoy || new Date();
  const f = new Date(fechaObjetivo);
  if (isNaN(f.getTime())) return falta;
  const meses = (f.getFullYear() - h.getFullYear()) * 12 + (f.getMonth() - h.getMonth());
  return Math.ceil(falta / Math.max(1, meses));
}
