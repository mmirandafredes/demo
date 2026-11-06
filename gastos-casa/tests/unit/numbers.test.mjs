import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsearDigitos, textoACentavos } from '../../js/numbers.js';
import { pesos } from '../../js/format.js';

test('dígitos con formato argentino', () => {
  assert.equal(parsearDigitos('12.500'), 12500);
  assert.equal(parsearDigitos('12.500,50'), 12500.5);
  assert.equal(parsearDigitos('12,500.50'), 12500.5);
  assert.equal(parsearDigitos('1,5'), 1.5);
  assert.equal(parsearDigitos('$45000'), 45000);
  assert.equal(parsearDigitos('abc'), null);
  assert.equal(textoACentavos('2500,75'), 250075);
});

test('formato de pesos', () => {
  assert.equal(pesos(1250050).replace(/\s/g, ' '), '$ 12.500,50');
  assert.equal(pesos(1250000).replace(/\s/g, ' '), '$ 12.500');
});
