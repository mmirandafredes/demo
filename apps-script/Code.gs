/**
 * MiranData — Calculadora de indicadores PyME
 * Backend de captura de mails (leads).
 *
 * Qué hace: recibe los datos que manda la calculadora y los agrega como una
 * fila nueva en esta misma planilla. No hay que tocar nada acá adentro salvo,
 * si querés, el nombre de la hoja (HOJA) unas líneas más abajo.
 *
 * Este archivo va pegado en Extensiones > Apps Script, desde la planilla.
 */

// Nombre de la pestaña donde se guardan los leads.
// Si no existe, el script la crea sola la primera vez.
var HOJA = 'Leads';

// Dejalo vacío. Solo se usa si algún día querés escribir en OTRA planilla
// distinta a la que tiene este script adentro: ahí pegarías el ID de esa otra.
var ID_PLANILLA = '';

var ENCABEZADOS = [
  'Fecha y hora (servidor)',
  'Email',
  'Indicadores calculados',
  'Origen (página)',
  'Fecha y hora (navegador)'
];

/**
 * Se ejecuta cuando la calculadora manda un lead.
 */
function doPost(e) {
  try {
    var datos = leerDatos_(e);
    var email = String(datos.email || '').trim();

    if (!esEmailValido_(email)) {
      return responder_({ ok: false, error: 'email_invalido' });
    }

    guardarFila_([
      new Date(),
      email,
      String(datos.resumen || '').slice(0, 5000),
      String(datos.origen || '').slice(0, 500),
      String(datos.timestamp || '').slice(0, 100)
    ]);

    return responder_({ ok: true });
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
 * Agrega la fila. El candado evita que dos envíos simultáneos se pisen.
 */
function guardarFila_(fila) {
  var candado = LockService.getScriptLock();
  candado.waitLock(20000);
  try {
    var hoja = obtenerHoja_();
    if (hoja.getLastRow() === 0) {
      hoja.appendRow(ENCABEZADOS);
      hoja.getRange(1, 1, 1, ENCABEZADOS.length).setFontWeight('bold');
      hoja.setFrozenRows(1);
    }
    hoja.appendRow(fila);
  } finally {
    candado.releaseLock();
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
