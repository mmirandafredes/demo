/**
 * MiranData — Calculadora de indicadores PyME
 * Backend de captura de mails (leads) + mail de bienvenida automático.
 *
 * Qué hace, en orden:
 *   1. Recibe los datos que manda la calculadora.
 *   2. Agrega una fila a esta misma planilla.
 *   3. Le manda a esa persona el mail con la guía de los 4 indicadores.
 *   4. Anota en la columna F si ese mail salió (SI) o no (NO).
 *
 * Si el mail falla, la fila queda guardada igual: nunca se pierde un lead.
 *
 * Este archivo va pegado en Extensiones > Apps Script, desde la planilla.
 */

// ---------------------------------------------------------------------------
// Lo único configurable
// ---------------------------------------------------------------------------

// Nombre de la pestaña donde se guardan los leads.
// Si no existe, el script la crea sola la primera vez.
var HOJA = 'Leads';

// Dejalo vacío. Solo se usa si algún día querés escribir en OTRA planilla
// distinta a la que tiene este script adentro: ahí pegarías el ID de esa otra.
var ID_PLANILLA = '';

// Isotipo que aparece en la firma del mail. Si algún día cambiás la imagen,
// se cambia acá y listo.
var ISOTIPO_URL = 'https://rainbow-crisp-37b82a.netlify.app/isotipo.png';

// Nombre que ve la persona como remitente. Dejalo vacío para que use
// el nombre de tu cuenta de Google tal cual.
var NOMBRE_REMITENTE = 'Melisa Miranda Fredes — MiranData';

var ASUNTO = 'Acá tenés tu guía de los 4 indicadores (como te prometí)';

// ---------------------------------------------------------------------------
// Estructura de la planilla
// ---------------------------------------------------------------------------

var ENCABEZADOS = [
  'Fecha y hora (servidor)',      // A
  'Email',                        // B
  'Indicadores calculados',       // C
  'Origen (página)',              // D
  'Fecha y hora (navegador)',     // E
  'Mail de bienvenida enviado'    // F
];

var COL_MAIL_ENVIADO = 6; // columna F

// ---------------------------------------------------------------------------
// Punto de entrada: lo que llama la calculadora
// ---------------------------------------------------------------------------

function doPost(e) {
  try {
    var datos = leerDatos_(e);
    var email = String(datos.email || '').trim();

    if (!esEmailValido_(email)) {
      return responder_({ ok: false, error: 'email_invalido' });
    }

    // 1. Guardar la fila. Se anota 'NO' de entrada: si el envío del mail
    //    fallara a mitad de camino, la planilla igual queda diciendo la verdad.
    var ref = guardarFila_([
      new Date(),
      email,
      String(datos.resumen || '').slice(0, 5000),
      String(datos.origen || '').slice(0, 500),
      String(datos.timestamp || '').slice(0, 100),
      'NO'
    ]);

    // 2. Mandar el mail de bienvenida. Esta función nunca lanza error:
    //    pase lo que pase, la fila de arriba ya está guardada.
    var enviado = enviarBienvenida_(email);

    // 3. Anotar el resultado en la columna F.
    if (enviado) {
      marcarEnviado_(ref, 'SI');
    }

    return responder_({ ok: true, mailEnviado: enviado });
  } catch (err) {
    return responder_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/**
 * Se ejecuta si abrís la URL del Web App en el navegador.
 * Sirve para confirmar de un vistazo que quedó bien publicado.
 */
function doGet() {
  return responder_({ ok: true, servicio: 'MiranData — captura de leads', estado: 'activo' });
}

// ---------------------------------------------------------------------------
// Envío del mail de bienvenida
// ---------------------------------------------------------------------------

/**
 * Manda el mail con la guía. Devuelve true si salió, false si no.
 * Nunca corta la ejecución: cualquier error queda anotado en el registro
 * (Apps Script > Ejecuciones) y la fila del lead se mantiene guardada.
 */
function enviarBienvenida_(email) {
  try {
    // Si ya no queda cuota diaria, no tiene sentido intentarlo.
    var restantes = MailApp.getRemainingDailyQuota();
    if (restantes <= 0) {
      Logger.log('Sin cuota diaria de envío. No se envió el mail a ' + email + '.');
      return false;
    }

    var mensaje = {
      to: email,
      subject: ASUNTO,
      body: CUERPO_TEXTO,
      htmlBody: cuerpoHtml_()
    };
    if (NOMBRE_REMITENTE) {
      mensaje.name = NOMBRE_REMITENTE;
    }

    MailApp.sendEmail(mensaje);
    Logger.log('Mail enviado a ' + email + '. Cuota restante del día: ' + (restantes - 1) + '.');
    return true;
  } catch (err) {
    Logger.log('No se pudo enviar el mail a ' + email + ': ' + err);
    return false;
  }
}

/**
 * Devuelve el HTML del mail con la URL del isotipo ya puesta.
 */
function cuerpoHtml_() {
  return PLANTILLA_HTML.replace(/__ISOTIPO_URL__/g, ISOTIPO_URL);
}

/**
 * ---- Para probar desde el editor ----
 * Elegí esta función en el menú desplegable de arriba y tocá "Ejecutar".
 * Te manda el mail a vos misma para ver cómo le llega a la otra persona.
 * No toca la planilla.
 */
function enviarmeUnaPrueba() {
  var yo = Session.getActiveUser().getEmail();
  MailApp.sendEmail({
    to: yo,
    subject: '[PRUEBA] ' + ASUNTO,
    body: CUERPO_TEXTO,
    htmlBody: cuerpoHtml_(),
    name: NOMBRE_REMITENTE || undefined
  });
  Logger.log('Mail de prueba enviado a ' + yo + '. Cuota restante hoy: ' + MailApp.getRemainingDailyQuota() + '.');
}

// ---------------------------------------------------------------------------
// Planilla
// ---------------------------------------------------------------------------

/**
 * Acepta tanto un cuerpo JSON como un POST de formulario clásico,
 * así funciona igual desde la calculadora o desde una prueba manual.
 */
function leerDatos_(e) {
  if (e && e.postData && e.postData.contents) {
    try {
      var json = JSON.parse(e.postData.contents);
      if (json && typeof json === 'object') return json;
    } catch (ignorado) {
      // No era JSON: seguimos con los parámetros de formulario.
    }
  }
  return (e && e.parameter) ? e.parameter : {};
}

function esEmailValido_(email) {
  return email.length > 0 && email.length <= 254 && /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email);
}

/**
 * Agrega la fila y devuelve dónde quedó, para poder marcar la columna F
 * después. El candado evita que dos envíos simultáneos se pisen.
 */
function guardarFila_(fila) {
  var candado = LockService.getScriptLock();
  candado.waitLock(20000);
  try {
    var hoja = obtenerHoja_();
    asegurarEncabezados_(hoja);
    hoja.appendRow(fila);
    var numeroDeFila = hoja.getLastRow();
    SpreadsheetApp.flush(); // deja la fila escrita antes de intentar el mail
    return { hoja: hoja, fila: numeroDeFila };
  } finally {
    candado.releaseLock();
  }
}

/**
 * Completa los encabezados que falten (por ejemplo, la columna F nueva)
 * SIN pisar los nombres que ya tengas puestos vos.
 */
function asegurarEncabezados_(hoja) {
  if (hoja.getMaxColumns() < ENCABEZADOS.length) {
    hoja.insertColumnsAfter(hoja.getMaxColumns(), ENCABEZADOS.length - hoja.getMaxColumns());
  }

  if (hoja.getLastRow() === 0) {
    hoja.appendRow(ENCABEZADOS);
    hoja.getRange(1, 1, 1, ENCABEZADOS.length).setFontWeight('bold');
    hoja.setFrozenRows(1);
    return;
  }

  var rango = hoja.getRange(1, 1, 1, ENCABEZADOS.length);
  var actuales = rango.getValues()[0];
  var hayCambios = false;
  for (var i = 0; i < ENCABEZADOS.length; i++) {
    if (String(actuales[i]).trim() === '') {
      actuales[i] = ENCABEZADOS[i];
      hayCambios = true;
    }
  }
  if (hayCambios) {
    rango.setValues([actuales]);
    rango.setFontWeight('bold');
  }
}

/**
 * Escribe SI/NO en la columna F de la fila recién agregada.
 * Si esto fallara, tampoco rompe nada: el lead ya está guardado.
 */
function marcarEnviado_(ref, valor) {
  try {
    ref.hoja.getRange(ref.fila, COL_MAIL_ENVIADO).setValue(valor);
  } catch (err) {
    Logger.log('No se pudo marcar la columna F de la fila ' + ref.fila + ': ' + err);
  }
}

function obtenerHoja_() {
  var planilla = ID_PLANILLA
    ? SpreadsheetApp.openById(ID_PLANILLA)
    : SpreadsheetApp.getActiveSpreadsheet();

  if (!planilla) {
    throw new Error('No encuentro la planilla. Revisá que el script esté creado desde la planilla (Extensiones > Apps Script).');
  }

  return planilla.getSheetByName(HOJA) || planilla.insertSheet(HOJA);
}

function responder_(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// Contenido del mail
// ---------------------------------------------------------------------------

// Versión de texto plano. Es la que ven los clientes de mail viejos o los que
// tienen el HTML desactivado.
var CUERPO_TEXTO = `Hola,

Gracias por dejarme tu mail después de usar la calculadora. Como te prometí, acá va la guía corta: qué significa cada indicador y qué hacer si el número te preocupó.

1) Margen de Contribución Real
Te dice cuánto le queda a tu negocio de cada venta, una vez descontados los costos que varían con esa venta. Si te dio bajo o negativo, el problema no es "vender más": es revisar precios y costos variables antes de pensar en volumen.

2) Flujo de Caja Operativo
Mide si la plata que entra por la operación del día a día alcanza para cubrir lo que sale. Si te dio negativo, conviene mirar por separado cuánto tardás en cobrar y cuánto en pagar: casi siempre el problema está en ese desfasaje.

3) Días de Cobro
Es el tiempo promedio entre que facturás y que cobrás. Si es alto, revisá las condiciones que le das a cada cliente: ordenar esos plazos suele liberar caja sin pedir financiamiento externo.

4) Punto de Equilibrio Dinámico
Es cuánto necesitás vender hoy para no perder plata. Si te quedó lejos de lo que vendés, mirá si el desvío viene de costos fijos, de margen, o de ventas — cada causa tiene una solución distinta.

Estos cuatro indicadores dan una primera foto, pero la foto completa aparece cuando se los mira en el tiempo: cómo evolucionaron en los últimos meses y hacia dónde van si no cambiás nada. Ese análisis por períodos, o una propuesta hecha a medida para tu pyme, es el paso que suelo dar con quienes quieren ir más profundo.

Si te interesa, respondé este mismo mail o escribime por Instagram a @mirandata_. Sin compromiso: charlamos y vemos si tiene sentido para tu caso.

Un saludo,
Melisa Miranda Fredes
Economista — MiranData
lic.mirandafredes@gmail.com
Cel: 2954306751`;

// Versión HTML, la que ve la mayoría (Gmail, Outlook, etc.).
// El __ISOTIPO_URL__ se reemplaza solo por la constante ISOTIPO_URL de arriba.
var PLANTILLA_HTML = `
<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background-color:#FAF6F0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF6F0;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e7ddd0;">

        <!-- Header -->
        <tr>
          <td style="background-color:#FAF6F0; padding:28px 32px; border-bottom:3px solid #8B5E3C;">
            <span style="font-family:Arial, Helvetica, sans-serif; font-size:22px; font-weight:bold; color:#2B2B2B;">Miran</span><span style="font-family:Arial, Helvetica, sans-serif; font-size:22px; font-weight:bold; color:#FF6B4A;">Data</span>
            <div style="font-family:Arial, Helvetica, sans-serif; font-size:12px; letter-spacing:1px; text-transform:uppercase; color:#8B5E3C; font-weight:bold; margin-top:4px;">Indicadores Pyme</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px; font-family:Arial, Helvetica, sans-serif; color:#2B2B2B; font-size:15px; line-height:1.6;">
            <p>Hola,</p>
            <p>Gracias por dejarme tu mail después de usar la calculadora. Como te prometí, acá va la guía corta: qué significa cada indicador y qué hacer si el número te preocupó.</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0; border-collapse:collapse;">
              <tr>
                <td style="padding:16px 0; border-top:1px solid #e7ddd0;">
                  <p style="margin:0 0 6px; font-family:Arial, Helvetica, sans-serif; font-weight:bold; color:#8B5E3C; font-size:15px;">1) Margen de Contribución Real</p>
                  <p style="margin:0;">Te dice cuánto le queda a tu negocio de cada venta, una vez descontados los costos que varían con esa venta. Si te dio bajo o negativo, el problema no es "vender más": es revisar precios y costos variables antes de pensar en volumen.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 0; border-top:1px solid #e7ddd0;">
                  <p style="margin:0 0 6px; font-family:Arial, Helvetica, sans-serif; font-weight:bold; color:#8B5E3C; font-size:15px;">2) Flujo de Caja Operativo</p>
                  <p style="margin:0;">Mide si la plata que entra por la operación del día a día alcanza para cubrir lo que sale. Si te dio negativo, conviene mirar por separado cuánto tardás en cobrar y cuánto en pagar: casi siempre el problema está en ese desfasaje.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 0; border-top:1px solid #e7ddd0;">
                  <p style="margin:0 0 6px; font-family:Arial, Helvetica, sans-serif; font-weight:bold; color:#8B5E3C; font-size:15px;">3) Días de Cobro</p>
                  <p style="margin:0;">Es el tiempo promedio entre que facturás y que cobrás. Si es alto, revisá las condiciones que le das a cada cliente: ordenar esos plazos suele liberar caja sin pedir financiamiento externo.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 0; border-top:1px solid #e7ddd0; border-bottom:1px solid #e7ddd0;">
                  <p style="margin:0 0 6px; font-family:Arial, Helvetica, sans-serif; font-weight:bold; color:#8B5E3C; font-size:15px;">4) Punto de Equilibrio Dinámico</p>
                  <p style="margin:0;">Es cuánto necesitás vender hoy para no perder plata. Si te quedó lejos de lo que vendés, mirá si el desvío viene de costos fijos, de margen, o de ventas — cada causa tiene una solución distinta.</p>
                </td>
              </tr>
            </table>

            <p>Estos cuatro indicadores dan una primera foto, pero la foto completa aparece cuando se los mira en el tiempo: cómo evolucionaron en los últimos meses y hacia dónde van si no cambiás nada. Ese análisis por períodos, o una propuesta hecha a medida para tu pyme, es el paso que suelo dar con quienes quieren ir más profundo.</p>

            <p>Si te interesa, respondé este mismo mail o escribime por Instagram a <a href="https://instagram.com/mirandata_" style="color:#FF6B4A; text-decoration:none; font-weight:bold;">@mirandata_</a>. Sin compromiso: charlamos y vemos si tiene sentido para tu caso.</p>

            <p style="margin-top:28px; margin-bottom:0;">Un saludo,</p>
          </td>
        </tr>

        <!-- Signature / Footer -->
        <tr>
          <td style="padding:24px 32px 32px; font-family:Arial, Helvetica, sans-serif; border-top:1px solid #e7ddd0;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:top; padding-right:14px;">
                  <img src="__ISOTIPO_URL__" width="44" height="44" alt="MiranData" style="display:block;">
                </td>
                <td style="vertical-align:top;">
                  <p style="margin:0; font-weight:bold; color:#2B2B2B; font-size:15px;">Melisa Miranda Fredes</p>
                  <p style="margin:2px 0 8px; color:#8a8074; font-size:13px;">Economista — Magíster en Gestión Empresarial</p>
                  <p style="margin:0; color:#5b5148; font-size:13px;">lic.mirandafredes@gmail.com</p>
                  <p style="margin:0; color:#5b5148; font-size:13px;">Cel: 2954306751</p>
                  <p style="margin:8px 0 0; color:#8a8074; font-size:13px;">Instagram: @mirandata_</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>
`;
