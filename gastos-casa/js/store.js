// Persistencia: IndexedDB; si no está disponible (algunos modos privados), localStorage;
// y si tampoco, memoria (con aviso). Todo el estado se guarda como un único documento JSON.
const DB = 'gastos-casa';
const STORE = 'kv';
const CLAVE = 'estado';

let modo = 'memoria'; // 'indexeddb' | 'localstorage' | 'memoria'
let db = null;
let pendiente = null;

function abrirIdb() {
  return new Promise((resolve, reject) => {
    let req;
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) return reject(new Error('sin indexedDB'));
      req = indexedDB.open(DB, 1);
    } catch (e) { return reject(e); }
    const t = setTimeout(() => reject(new Error('indexedDB no responde')), 3000);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => { clearTimeout(t); resolve(req.result); };
    req.onerror = () => { clearTimeout(t); reject(req.error || new Error('error indexedDB')); };
    req.onblocked = () => { clearTimeout(t); reject(new Error('indexedDB bloqueada')); };
  });
}

function idbLeer() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(CLAVE);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

function idbEscribir(valor) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(valor, CLAVE);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function lsDisponible() {
  try {
    const k = '__prueba__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch (e) { return false; }
}

/** Abre el almacenamiento y devuelve el estado guardado (o null). */
export async function cargar() {
  try {
    db = await abrirIdb();
    modo = 'indexeddb';
    const v = await idbLeer();
    // Si antes se usó localStorage como respaldo, migramos.
    if (!v && lsDisponible() && localStorage.getItem(DB)) {
      const viejo = JSON.parse(localStorage.getItem(DB));
      await idbEscribir(JSON.stringify(viejo));
      return viejo;
    }
    return v ? JSON.parse(v) : null;
  } catch (e) {
    db = null;
    if (lsDisponible()) {
      modo = 'localstorage';
      const v = localStorage.getItem(DB);
      return v ? JSON.parse(v) : null;
    }
    modo = 'memoria';
    return null;
  }
}

async function escribirAhora(estado) {
  const json = JSON.stringify(estado);
  if (modo === 'indexeddb') {
    try { await idbEscribir(json); return; } catch (e) { modo = lsDisponible() ? 'localstorage' : 'memoria'; }
  }
  if (modo === 'localstorage') {
    try { localStorage.setItem(DB, json); } catch (e) { modo = 'memoria'; }
  }
}

let escribiendo = false;

/**
 * Guarda en el momento. Si ya hay una escritura en curso, se encola solo la última versión,
 * así varios cambios seguidos no generan escrituras de más y no se pierde nada al recargar.
 */
export function guardar(estado) {
  pendiente = estado;
  if (escribiendo) return;
  escribiendo = true;
  const ciclo = () => {
    const e = pendiente;
    pendiente = null;
    escribirAhora(e).then(() => {
      if (pendiente) ciclo(); else escribiendo = false;
    });
  };
  ciclo();
}

/** Fuerza el guardado pendiente (al cerrar u ocultar la pestaña). */
export function vaciar() {
  if (pendiente && !escribiendo) guardar(pendiente);
}

export function modoAlmacenamiento() { return modo; }

/** Pide al navegador que no borre los datos si se queda sin espacio (si lo soporta). */
export function pedirPersistencia() {
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (e) { /* no soportado */ }
}
