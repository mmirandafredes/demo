# Cómo conectar la calculadora a tu Google Sheet

Esto es todo lo que tenés que hacer a mano. Son unos 10 minutos, una sola vez.
No hace falta saber programar: vas a copiar un texto y tocar botones.

Al final, cada persona que deje su mail en la calculadora va a aparecer sola
como una fila nueva en tu planilla. La persona no tiene que confirmar nada.

---

## Paso 1 — Crear la planilla

1. Entrá a **https://sheets.new** (te crea una planilla en blanco).
2. Arriba a la izquierda, donde dice *Hoja de cálculo sin título*, ponele un
   nombre. Por ejemplo: **Leads calculadora PyME**.
3. Listo, dejala abierta. **No hace falta que crees columnas ni encabezados**:
   el programa los crea solo la primera vez que llegue un mail.

---

## Paso 2 — Abrir el editor de código y pegar el programa

1. En el menú de arriba de la planilla, entrá a **Extensiones → Apps Script**.
   Se abre una pestaña nueva con un editor de texto.
2. Vas a ver un archivo llamado `Código.gs` (o `Code.gs`) con esto adentro:

   ```
   function myFunction() {

   }
   ```

3. **Seleccioná todo eso y borralo** (clic adentro, `Ctrl+A`, `Suprimir`).
   Tiene que quedar completamente vacío.
4. Abrí el archivo **`apps-script/Code.gs`** que te dejé, copiá **todo** su
   contenido, y pegalo ahí.
5. Guardá con el ícono del disquete 💾 (o `Ctrl+S`).
6. Opcional: arriba a la izquierda dice *Proyecto sin título*. Hacé clic y
   ponele **Leads calculadora** para reconocerlo después.

---

## Paso 3 — Publicarlo (acá Google te va a pedir permisos)

Este es el paso más largo, pero es solo tocar botones en orden.

1. Arriba a la derecha, botón azul **Implementar → Nueva implementación**.
2. Se abre una ventana. A la izquierda hay un **ícono de engranaje ⚙️** al lado
   de *Seleccionar tipo*. Hacé clic ahí y elegí **Aplicación web**.
3. Completá los tres campos así:

   | Campo | Qué elegir |
   |---|---|
   | **Descripción** | `Captura de leads` (o lo que quieras, no importa) |
   | **Ejecutar como** | **Yo** (`lic.mirandafredes@gmail.com`) |
   | **Quién tiene acceso** | ⚠️ **Cualquier usuario** |

   > ⚠️ **Ojo con el último.** Tiene que decir **"Cualquier usuario"**, NO
   > *"Cualquier usuario con una cuenta de Google"*. Si elegís la opción con
   > cuenta de Google, la calculadora no va a poder guardar nada. Es el error
   > más común de todos.
   >
   > Esto **no** hace pública tu planilla: solo permite que la calculadora
   > agregue filas. Nadie puede ver ni leer lo que hay adentro.

4. Clic en **Implementar**.
5. Ahora Google te pide autorización. Aparece **Autorizar acceso** → hacé clic.
6. Se abre una ventana para elegir cuenta → elegí **tu cuenta de Gmail**.
7. Va a aparecer una pantalla que dice **"Google no ha verificado esta
   aplicación"**. Es normal y esperable: la "aplicación" es tu propio programa,
   recién creado, así que Google todavía no lo conoce.
   - Hacé clic en **Configuración avanzada** (o *Avanzado*), abajo a la izquierda.
   - Después, en el link de abajo: **Ir a Leads calculadora (no seguro)**.
8. Última pantalla: te dice que el proyecto quiere ver y administrar tus
   planillas. Clic en **Permitir**.

---

## Paso 4 — Copiar la URL y pegarla en el HTML

1. Al terminar, Google te muestra una ventana con **URL de la aplicación web**.
   Es una dirección larga que termina en **`/exec`**, del estilo:

   ```
   https://script.google.com/macros/s/AKfycbx...un-montón-de-letras.../exec
   ```

2. Hacé clic en **Copiar**.
3. **Probá que funcione ahora mismo**: pegá esa URL en una pestaña nueva del
   navegador y entrá. Tenés que ver un texto así:

   ```
   {"ok":true,"servicio":"MiranData — captura de leads","estado":"activo"}
   ```

   Si ves eso, está publicado bien. Si ves un error, revisá el Paso 3.

4. Abrí el archivo **`calculadora-pyme.html`** con el Bloc de notas (Windows) o
   TextEdit (Mac) — o con cualquier editor de texto.
5. Buscá esta línea (está cerca del renglón 482, después de un comentario que
   dice *ESTO ES LO ÚNICO QUE TENÉS QUE PEGAR A MANO*):

   ```js
   LEADS_WEBAPP_URL: '',
   ```

6. Pegá tu URL **entre las comillas simples**, sin borrarlas y sin espacios:

   ```js
   LEADS_WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbx...../exec',
   ```

7. Guardá el archivo. **Eso es todo.**

---

## Paso 5 — Probarlo de verdad

1. Abrí `calculadora-pyme.html` (o subilo a donde lo tengas publicado).
2. Calculá cualquier indicador, escribí un mail de prueba y tocá **Enviármelo**.
3. Tenés que ver: *"¡Listo! Ya me llegó tu mail…"*.
4. Andá a tu planilla: apareció una fila nueva con la fecha, el mail y qué
   indicadores calculó esa persona. Puede tardar 1 o 2 segundos.

Si en cambio ves *"No pude guardarlo automáticamente…"* y se te abre el cliente
de mail, significa que el envío falló. Repasá que:
- la URL termine en `/exec` (y no en `/dev`),
- en el Paso 3 hayas elegido **Cualquier usuario**,
- la URL esté entre comillas y con la coma final.

---

## Si algún día cambiás el código del Apps Script

No alcanza con guardar: hay que volver a implementar, **pero sin cambiar la URL**.

**Implementar → Gestionar implementaciones → ícono del lápiz ✏️ →
en "Versión" elegí *Nueva versión* → Implementar.**

Si en vez de eso hacés *Nueva implementación*, Google te da una URL distinta y
tendrías que volver a pegarla en el HTML.

---

## Cosas que conviene que sepas

- **Es gratis y sin mantenimiento.** Apps Script tiene un límite muy holgado
  (miles de ejecuciones por día); para una calculadora de captación de leads no
  lo vas a rozar.
- **La planilla sigue siendo privada.** Solo vos la ves.
- **Cualquiera que descubra la URL podría agregar filas.** Es inevitable en
  cualquier formulario sin backend propio, y lo peor que puede pasar es que te
  entre alguna fila basura, que borrás a mano. El programa ya descarta lo que no
  tenga forma de mail.
- **El mailto sigue ahí, pero solo como red de seguridad.** Si el visitante no
  tiene internet en ese momento, se le abre el cliente de mail y no perdés el
  lead. En el uso normal, nunca lo va a ver.
- **Si querés que te avise por mail cada lead nuevo**, en la planilla podés ir a
  **Herramientas → Reglas de notificación** y activar *Notificarme cuando se
  hagan cambios*.

---

## Alternativas que consideré (y por qué Apps Script gana)

| Opción | Gratis | Sin paso manual del visitante | Contra |
|---|---|---|---|
| **Apps Script + Sheet** ✅ | Sí, sin límite práctico | Sí | Configuración inicial de ~10 min (esta guía) |
| Google Form oculto | Sí | Sí | Solo guarda campos del form; te obliga a mantener el form y los `entry.ID`, que se rompen si editás el formulario |
| Formspree / Getform | Hasta ~50 envíos/mes | Sí | Se corta justo cuando la calculadora empieza a funcionar; después es pago |
| Netlify Forms | 100/mes | Sí | Te obliga a hostear el sitio en Netlify — hoy es una página suelta |
| `mailto:` (lo de antes) | Sí | **No** | Depende de que el visitante tenga cliente de mail y confirme el envío: se pierde la mayoría |

Apps Script es el único que es gratis de verdad, no te ata a un hosting, y te
deja los datos en una planilla que ya sabés usar.
