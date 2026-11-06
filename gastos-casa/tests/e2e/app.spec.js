// @ts-check
import { test, expect } from '@playwright/test';

async function onboarding(page) {
  await page.goto('/');
  await page.getByLabel('Nombre de la casa').fill('Casa Pellegrini');
  await page.locator('#ob-nombre').fill('Ana');
  await page.getByRole('button', { name: 'Agregar' }).click();
  await page.locator('#ob-nombre').fill('Juan');
  await page.locator('#ob-nombre').press('Enter');
  await page.getByLabel('Persona que usa este dispositivo').selectOption({ label: 'Ana' });
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(page.locator('#frase')).toBeVisible();
}

async function cargar(page, frase) {
  await page.locator('#frase').fill(frase);
  await page.locator('#frase').press('Enter');
  await expect(page.locator('.confirmacion')).toBeVisible();
}

test('no se puede cargar un gasto sin participantes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Empezar' })).toBeDisabled();
  await expect(page.locator('#frase')).toHaveCount(0);
  await expect(page.locator('#nav')).toBeHidden();
});

test('flujo completo: carga por frase, clasificación, aprendizaje y saldos', async ({ page }) => {
  const externas = [];
  page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4173')) externas.push(r.url()); });

  await onboarding(page);

  await cargar(page, 'Gasté 12500 en Frioteka');
  const conf = page.locator('.confirmacion');
  await expect(conf.getByLabel('Comercio')).toHaveValue('Frioteka');
  await expect(conf.getByLabel('Rubro')).toHaveValue('alimentos');
  await expect(conf.getByLabel('Monto')).toHaveValue('12500');

  await cargar(page, 'Pagó Juan 45000 de luz CPE');
  await expect(conf.getByLabel('Rubro')).toHaveValue('energia-internet');
  await expect(conf.getByLabel('Pagó')).toHaveValue(/.+/);
  await expect(conf.locator('select[name="pagadorId"] option:checked')).toHaveText('Juan');

  // Comercio desconocido: queda sin clasificar, se corrige y la app lo recuerda
  await cargar(page, 'Pagué 3500 en Don Pepe');
  await expect(conf.getByLabel('Rubro')).toHaveValue('sin-clasificar');
  await conf.getByLabel('Rubro').selectOption('alimentos');
  await expect(page.locator('#toast')).toContainText('Don Pepe');
  await cargar(page, '2000 don pepe');
  await expect(conf.getByLabel('Rubro')).toHaveValue('alimentos');

  // Lista de gastos
  await page.getByRole('link', { name: 'Gastos' }).click();
  await expect(page.locator('.lista-dia .item')).toHaveCount(4);
  await expect(page.getByText(/Total\s*\$\s*63\.000/)).toBeVisible();

  // Saldos: Ana debe 13.500 a Juan
  await page.getByRole('link', { name: 'Saldos' }).click();
  const transferencia = page.locator('section', { hasText: 'Quién le debe a quién' }).locator('.item');
  await expect(transferencia).toHaveCount(1);
  await expect(transferencia).toContainText('Ana');
  await expect(transferencia).toContainText('Juan');
  await expect(transferencia).toContainText(/13\.500/);
  page.once('dialog', (d) => d.accept());
  await transferencia.getByRole('button', { name: 'Saldar' }).click();
  await expect(page.getByText('Están todos al día')).toBeVisible();

  // Los datos persisten al recargar
  await page.reload();
  await page.getByRole('link', { name: 'Gastos' }).click();
  await expect(page.locator('.lista-dia .item')).toHaveCount(4);

  expect(externas, 'la app no debe llamar a servicios externos').toEqual([]);
});

test('editar un gasto con reparto por montos', async ({ page }) => {
  await onboarding(page);
  await cargar(page, '10000 super');
  await page.getByRole('button', { name: 'Más opciones' }).click();
  const dlg = page.locator('#dialogo');
  await dlg.getByLabel('Montos').check();
  const valores = dlg.locator('.valor-reparto');
  await valores.nth(0).fill('2500');
  await valores.nth(1).fill('7000');
  await dlg.getByRole('button', { name: 'Guardar' }).click();
  await expect(dlg.locator('#error-gasto')).toContainText('suman');
  await valores.nth(1).fill('7500');
  await dlg.getByRole('button', { name: 'Guardar' }).click();
  await expect(dlg).toBeHidden();
  await page.getByRole('link', { name: 'Saldos' }).click();
  await expect(page.locator('section', { hasText: 'Quién le debe a quién' }).locator('.item')).toContainText(/7\.500/);
});

test('ahorros y reservas no alteran los saldos', async ({ page }) => {
  await onboarding(page);
  await page.getByRole('link', { name: 'Ahorros' }).click();
  await page.getByText('+ Nuevo ahorro').click();
  await page.getByLabel('Nombre').fill('Vacaciones');
  await page.getByLabel('Objetivo (opcional)').fill('100000');
  await page.getByRole('button', { name: 'Crear' }).click();
  await page.getByRole('button', { name: 'Aportar' }).click();
  await page.locator('#dialogo').getByLabel('Monto').fill('25000');
  await page.locator('#dialogo').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('25% de')).toBeVisible();

  await page.getByRole('tab', { name: 'Reservas' }).click();
  await page.getByText('+ Nueva reserva').click();
  await page.getByLabel('Para qué').fill('Seguro del auto');
  await page.getByLabel('Monto').fill('120000');
  await page.getByLabel('Fecha').fill('2030-01-15');
  await page.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByText('Aporte mensual sugerido')).toBeVisible();

  await page.getByRole('link', { name: 'Saldos' }).click();
  await expect(page.getByText('Están todos al día')).toBeVisible();
});

test('sin dictado integrado se ofrece el campo de texto (plan B)', async ({ page }) => {
  await page.addInitScript(() => {
    // @ts-ignore
    delete window.SpeechRecognition; delete window.webkitSpeechRecognition;
  });
  await onboarding(page);
  await expect(page.locator('[data-action="dictar"]')).toHaveCount(0);
  await expect(page.getByText('micrófono del teclado')).toBeVisible();
  await cargar(page, 'quinientos pesos de pan');
  await expect(page.locator('.confirmacion').getByLabel('Monto')).toHaveValue('500');
});

test('se ve bien en 320 px sin scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await onboarding(page);
  await cargar(page, 'Gasté 12500 en Frioteka');
  for (const ruta of ['#/inicio', '#/gastos', '#/saldos', '#/ahorros', '#/mas', '#/mas/comercios', '#/mas/datos']) {
    await page.goto('/' + ruta);
    await expect(page.locator('#principal .tarjeta').first()).toBeVisible();
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(ancho, 'scroll horizontal en ' + ruta).toBeLessThanOrEqual(320);
  }
});

test('funciona sin conexión después de la primera visita', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'El modo offline con service worker se prueba en Chromium');
  await onboarding(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await cargar(page, 'Gasté 800 en el kiosco');
  await expect(page.locator('.confirmacion').getByLabel('Rubro')).toHaveValue('alimentos');
  await context.setOffline(false);
});
