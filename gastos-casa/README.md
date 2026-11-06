# Gastos de la Casa

PWA para registrar y repartir los gastos de una casa, al estilo de Tricount. Está pensada para Santa Rosa, La Pampa.

- **Sin IA.** La clasificación, la interpretación de frases y los saldos se resuelven con reglas, diccionarios y expresiones regulares. No llama a ningún LLM ni usa API keys.
- **Voz:** usa el dictado que trae el navegador (Web Speech API; en Chrome y Android lo procesa Google). Ese servicio solo convierte la voz en texto. Si el navegador no lo tiene (Firefox, algunos modos de iOS), se dicta con el micrófono del teclado del celular dentro del mismo campo, y el resultado es idéntico.
- **Sin conexión:** los datos se guardan en el dispositivo (IndexedDB, con respaldo en localStorage). Funciona en modo avión una vez que se abrió por primera vez.
- **Sin dependencias en producción.** Es HTML, CSS y JavaScript estándar, sin build. Se publica como sitio estático.

## Probarla en tu compu

Hace falta [Node.js](https://nodejs.org) 18 o más nuevo (solo para el servidor de prueba):

```bash
cd gastos-casa
```

```bash
npm start
```

Después abrí <http://localhost:8080>. Hay que abrirla con un servidor: si abrís `index.html` con doble clic, el navegador bloquea los módulos de JavaScript.

## Publicarla gratis

Cualquier hosting estático sirve. Se suben estos archivos: `index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/`, `data/` e `icons/`.

- **GitHub Pages:** el repo trae el workflow `.github/workflows/gastos-casa-pages.yml`. Activalo en *Settings → Pages → Source: GitHub Actions*. Se publica solo con cada push a `main`.
- **Netlify o Cloudflare Pages:** arrastrá la carpeta `gastos-casa` o configurá `gastos-casa` como directorio de publicación, sin comando de build.

El dictado y la instalación necesitan **HTTPS**; todos esos servicios lo dan gratis.

Cada vez que publiques cambios, subí el número en `VERSION` dentro de `sw.js`. Así los celulares que ya la tienen instalada se actualizan.

## Instalarla en el celular

- **Android (Chrome o Samsung Internet):** menú ⋮ → *Instalar app* o *Agregar a pantalla de inicio*.
- **iPhone (Safari):** botón Compartir → *Agregar a inicio*.

## Cómo se usa

1. **Configuración inicial:** nombre de la casa, participantes y quién usa este dispositivo. Mientras no haya participantes, no se pueden cargar gastos.
2. **Cargar un gasto:** tocá 🎤 o escribí una frase. El gasto se guarda en el momento, con la fecha y hora reales, y aparece una tarjeta para corregirlo o deshacerlo. Ejemplos:
   - "Gasté doce mil quinientos en Frioteka"
   - "Pagó Juan 45000 de luz CPE"
   - "8500 verdulería, entre todos"
   - "Ana 3200 farmacia solo para ella"
   - "30000 super a medias con Juan", "ayer 4500 panadería", "15 lucas carnicería", "80000 mecánico imprevisto"
3. **Rubros:** se asignan solos según el comercio. Si lo cambiás, la app recuerda la asociación para la próxima vez. Los comercios desconocidos quedan en *Sin clasificar* y la app te pide que elijas el rubro.
4. **Saldos:** cuánto pagó cada uno, cuánto le correspondía y quién le debe a quién, con la menor cantidad de transferencias. El botón *Saldar* registra el pago.
5. **Ahorros en común y reservas:** no cuentan como gasto. Un gasto pagado desde una reserva queda a cuenta de quienes aportaron a esa reserva.
6. **Gastos fijos:** cada mes se genera un borrador que aparece en Inicio, con un aviso cuando se acerca el vencimiento. Al confirmarlo cargás el monto real.
7. **Respaldo:** en *Más → Datos* se exporta e importa en JSON (respaldo completo) y CSV (gastos, compatible con Excel).

## Diccionario de comercios

`data/comercios-santa-rosa.json` es la semilla que se carga la primera vez:

```json
{ "nombre": "Frioteka", "alias": ["frioteca"], "categoriaId": "alimentos" }
```

- `categoriaId` tiene que ser un rubro de `js/seed.js`: `alimentos`, `energia-internet`, `gas`, `agua`, `alquiler`, `salud`, `transporte`, `limpieza`, `educacion`, `ocio`, `mascotas`, `impuestos`, `hogar`, `otros`.
- `tipo` (opcional): `fijo`, `esporadico` o `extraordinario`.
- `palabrasClave` cubre a los comercios genéricos ("verdulería" → alimentos, "nafta" → transporte).

Revisá la lista: la armé con fuentes públicas (directorios de comercios y la web de la CPE) y conviene confirmarla. Desde la app también se pueden agregar, editar y fusionar comercios (*Más → Comercios*), y el botón *Sumar comercios del archivo de Santa Rosa* trae los nuevos que agregues al JSON.

## Compatibilidad

Funciona en Chrome, Edge, Firefox, Safari (macOS e iOS), Samsung Internet y Opera, en sus versiones recientes. Antes de usar cada función, la app comprueba que el navegador la tenga (nunca detecta el navegador por su nombre) y, si falta, usa un plan B:

| Si falta… | La app usa… |
|---|---|
| Dictado integrado | El micrófono del teclado del celular, en el mismo campo |
| IndexedDB | localStorage, con un aviso para exportar respaldos |
| Service Worker | Funciona igual, pero sin modo offline |
| `<dialog>` modal | El mismo formulario, abierto en la página |

## Tests

```bash
npm test
```

Corre los tests de lógica: más de 25 frases del parser, números en palabras y con formato argentino, repartos y saldos que suman cero.

```bash
npm run test:e2e
```

Corre los tests de punta a punta con Playwright en Chromium, Firefox, WebKit, Android e iPhone. Incluyen la carga por frase, el aprendizaje de rubros, los saldos, el plan B sin dictado, la vista a 320 px y el modo offline. Antes hay que instalar los navegadores con `npx playwright install`. En GitHub corren solos con el workflow `gastos-casa-tests.yml`.

## Estructura

```
index.html, manifest.webmanifest, sw.js   app y modo offline
css/app.css                               estilos (claro/oscuro, desde 320 px)
js/app.js                                 pantallas y eventos
js/parser.js, numbers.js                  interpretación de frases y montos (sin IA)
js/classifier.js                          comercio → rubro (diccionario + Levenshtein)
js/balances.js                            repartos, saldos y simplificación de deudas
js/store.js                               IndexedDB / localStorage / memoria
js/voice.js                               dictado del navegador
data/comercios-santa-rosa.json            diccionario editable
```
