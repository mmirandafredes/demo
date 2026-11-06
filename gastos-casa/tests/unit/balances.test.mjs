import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repartirPorPesos, cuotasDeGasto, calcularSaldos, simplificarDeudas, aporteMensualSugerido } from '../../js/balances.js';

const P = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const suma = (o) => Object.values(o).reduce((x, y) => x + y, 0);
const sumaSaldos = (s) => Object.values(s).reduce((x, y) => x + y.saldo, 0);

test('reparto en partes iguales cierra exacto', () => {
  const r = repartirPorPesos(1000, ['a', 'b', 'c'], [1, 1, 1]);
  assert.equal(suma(r), 1000);
  assert.deepEqual(Object.values(r).sort(), [333, 333, 334]);
});

test('reparto por porcentaje', () => {
  const r = cuotasDeGasto({ monto: 10000, pagadorId: 'a', reparto: { modo: 'porcentaje', participantes: ['a', 'b'], valores: { a: 60, b: 40 } } });
  assert.deepEqual(r, { a: 6000, b: 4000 });
});

test('reparto por montos exactos', () => {
  const r = cuotasDeGasto({ monto: 10000, pagadorId: 'a', reparto: { modo: 'montos', participantes: ['a', 'b'], valores: { a: 2500, b: 7500 } } });
  assert.deepEqual(r, { a: 2500, b: 7500 });
});

test('saldos suman cero y la simplificación los cancela', () => {
  const gastos = [
    { monto: 30000, pagadorId: 'a', reparto: { modo: 'iguales', participantes: ['a', 'b', 'c'] } },
    { monto: 10001, pagadorId: 'b', reparto: { modo: 'iguales', participantes: ['a', 'b', 'c'] } },
    { monto: 5000, pagadorId: 'c', reparto: { modo: 'iguales', participantes: ['b', 'c'] } },
    { monto: 99999, pagadorId: 'c', borrador: true, reparto: { modo: 'iguales', participantes: ['a'] } },
  ];
  const s = calcularSaldos({ participantes: P, gastos, pagos: [] });
  assert.equal(sumaSaldos(s), 0);
  const t = simplificarDeudas(s);
  assert.ok(t.length <= P.length - 1);
  // Aplicar las transferencias deja todo en cero
  const s2 = calcularSaldos({ participantes: P, gastos, pagos: t });
  Object.values(s2).forEach((x) => assert.equal(x.saldo, 0));
});

test('gasto pagado desde una reserva lo pagan quienes aportaron', () => {
  const aportes = [
    { reservaId: 'r1', participanteId: 'a', monto: 3000 },
    { reservaId: 'r1', participanteId: 'b', monto: 1000 },
  ];
  const gastos = [{ monto: 4000, pagadorId: 'c', reservaId: 'r1', reparto: { modo: 'iguales', participantes: ['a', 'b'] } }];
  const s = calcularSaldos({ participantes: P, gastos, pagos: [], aportesReservas: aportes });
  assert.equal(s.a.saldo, 1000);
  assert.equal(s.b.saldo, -1000);
  assert.equal(s.c.saldo, 0);
  assert.equal(sumaSaldos(s), 0);
});

test('aporte mensual sugerido', () => {
  const hoy = new Date(2026, 10, 6);
  assert.equal(aporteMensualSugerido(120000, 0, new Date(2027, 2, 1), hoy), 30000);
  assert.equal(aporteMensualSugerido(1000, 1000, new Date(2027, 2, 1), hoy), 0);
  assert.equal(aporteMensualSugerido(1000, 0, new Date(2026, 10, 20), hoy), 1000);
});
