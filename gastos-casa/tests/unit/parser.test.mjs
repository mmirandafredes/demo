import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsearFrase } from '../../js/parser.js';
import { ctx } from './helpers.mjs';

const TODOS = ['ana', 'juan', 'pedro'];

// [frase, esperado]. Solo se comparan las claves que figuran en "esperado".
const CASOS = [
  ['Gasté doce mil quinientos en Frioteka', { centavos: 1250000, comercioNombre: 'Frioteka', categoriaId: 'alimentos', pagadorId: 'ana' }],
  ['Gasté 12500 en Frioteka', { centavos: 1250000, comercioNombre: 'Frioteka', categoriaId: 'alimentos' }],
  ['Pagó Juan 45000 de luz CPE', { centavos: 4500000, pagadorId: 'juan', comercioNombre: 'CPE', categoriaId: 'energia-internet', tipo: 'fijo' }],
  ['8500 verdulería, entre todos', { centavos: 850000, categoriaId: 'alimentos', participantesIds: TODOS, comercioNombre: 'Verdulería' }],
  ['Ana 3200 farmacia solo para ella', { centavos: 320000, pagadorId: 'ana', participantesIds: ['ana'], categoriaId: 'salud' }],
  ['Juan 3200 farmacia solo para él', { pagadorId: 'juan', participantesIds: ['juan'] }],
  ['$12.500,50 en La Anónima', { centavos: 1250050, comercioNombre: 'La Anónima', categoriaId: 'alimentos' }],
  ['gasté 12 mil en la anonima', { centavos: 1200000, comercioNombre: 'La Anónima' }],
  ['15 lucas carnicería', { centavos: 1500000, categoriaId: 'alimentos' }],
  ['un millón doscientos mil alquiler', { centavos: 120000000, categoriaId: 'alquiler' }],
  ['dos mil trescientos cuarenta y cinco en el kiosco', { centavos: 234500, categoriaId: 'alimentos' }],
  ['Pedro pagó 20000 de nafta en YPF', { pagadorId: 'pedro', comercioNombre: 'YPF', categoriaId: 'transporte' }],
  ['Pedro Gómez 9000 veterinaria', { pagadorId: 'pedro', categoriaId: 'mascotas' }],
  ['30000 super a medias con Juan', { pagadorId: 'ana', participantesIds: ['ana', 'juan'], categoriaId: 'alimentos' }],
  ['Gasté 6000 en remedios para Juan y Pedro', { pagadorId: 'ana', participantesIds: ['juan', 'pedro'], categoriaId: 'salud' }],
  ['Juan 18000 cena entre Ana, Juan y Pedro', { pagadorId: 'juan', participantesIds: TODOS }],
  ['Ayer gasté 4500 en la panadería', { centavos: 450000, categoriaId: 'alimentos' }],
  ['80000 mecánico imprevisto', { tipo: 'extraordinario', categoriaId: 'transporte' }],
  ['Camuzzi 25000', { comercioNombre: 'Camuzzi Gas Pampeana', categoriaId: 'gas', tipo: 'fijo' }],
  ['gasté 5000 en frioteca', { comercioNombre: 'Frioteka', categoriaId: 'alimentos' }],
  ['7000 en cooperativa', { comercioNombre: 'CPE', categoriaId: 'energia-internet' }],
  ['11000 cpe gas', { comercioNombre: 'CPEgas', categoriaId: 'gas' }],
  ['Pagué 3500 en Don Pepe', { centavos: 350000, comercioNombre: 'Don Pepe', categoriaId: 'sin-clasificar' }],
  ['quinientos pesos de pan para mí', { centavos: 50000, participantesIds: ['ana'], categoriaId: 'alimentos' }],
  ['1.234.567 rentas', { centavos: 123456700, categoriaId: 'impuestos' }],
  ['Juan gastó 2500,75 en limpieza', { centavos: 250075, pagadorId: 'juan', categoriaId: 'limpieza' }],
];

for (const [frase, esperado] of CASOS) {
  test('parser: ' + frase, () => {
    const r = parsearFrase(frase, ctx);
    for (const k of Object.keys(esperado)) {
      assert.deepEqual(r[k], esperado[k], `${k} en "${frase}" -> ${JSON.stringify(r)}`);
    }
  });
}

test('parser: "ayer" corre la fecha un día', () => {
  const r = parsearFrase('ayer 1000 kiosco', ctx);
  assert.equal(r.fecha.getDate(), 5);
});

test('parser: sin monto devuelve null', () => {
  const r = parsearFrase('verdulería', ctx);
  assert.equal(r.centavos, null);
});

test('parser: "un" como artículo no es monto', () => {
  const r = parsearFrase('compré un pollo 8000', ctx);
  assert.equal(r.centavos, 800000);
});
