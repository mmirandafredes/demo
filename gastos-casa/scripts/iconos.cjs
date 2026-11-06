// Genera los PNG de los íconos a partir de icons/icon.svg. Uso: node scripts/iconos.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'icons', 'icon.svg'), 'utf8');
  const browser = await chromium.launch();
  for (const [nombre, lado] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
    const page = await browser.newPage({ viewport: { width: lado, height: lado }, deviceScaleFactor: 1 });
    // iOS rellena la transparencia con negro: el ícono de Apple va con fondo lleno.
    const fondo = nombre.startsWith('apple') ? 'background:#1b5e20;' : '';
    await page.setContent(`<style>html,body{margin:0;${fondo}}svg{width:${lado}px;height:${lado}px;display:block}</style>${svg}`);
    await page.screenshot({ path: path.join(__dirname, '..', 'icons', nombre), omitBackground: !fondo });
    await page.close();
  }
  await browser.close();
})();
