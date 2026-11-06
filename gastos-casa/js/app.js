// Gastos de la Casa: interfaz. Sin frameworks ni IA.
import * as store from './store.js';
import { parsearFrase } from './parser.js';
import { clasificarTexto } from './classifier.js';
import { calcularSaldos, simplificarDeudas, cuotasDeGasto, aporteMensualSugerido } from './balances.js';
import { pesos, centavosATexto, fecha, hora, aInputFechaHora, aInputFecha, deInputFechaHora, claveMes, nombreMes, mesAnterior } from './format.js';
import { textoACentavos } from './numbers.js';
import { normalizar, nuevoId } from './text.js';
import { CATEGORIAS_BASE, TIPOS, COLORES } from './seed.js';
import { vozDisponible, escuchar } from './voice.js';
import { dona, barras } from './charts.js';
import { aCsv, deCsv } from './csv.js';

// ---------------------------------------------------------------- estado

let E = null; // estado persistido
const ui = {
  ultimoGastoId: null,
  filtrosGastos: { mes: claveMes(new Date()), categoriaId: '', tipo: '', participanteId: '' },
  filtrosSaldos: { mes: '', categoriaId: '', tipo: '' },
  tabAhorros: 'ahorros',
  buscarComercio: '',
  soloSinClasificar: false,
  cancelarVoz: null,
  onboarding: { participantes: [] },
};

function estadoVacio(semilla) {
  return {
    version: 1,
    casa: null,
    participantes: [],
    usuarioActualId: null,
    repartoDefault: { modo: 'iguales', valores: {} },
    categorias: CATEGORIAS_BASE.map((c) => Object.assign({}, c)),
    comercios: (semilla.comercios || []).map((c) => Object.assign({ id: nuevoId(), alias: [] }, c)),
    palabrasClave: semilla.palabrasClave || {},
    gastos: [],
    pagos: [],
    fijos: [],
    ahorros: [],
    aportesAhorro: [],
    reservas: [],
    aportesReserva: [],
    tema: 'auto',
  };
}

async function leerSemilla() {
  try {
    const r = await fetch('data/comercios-santa-rosa.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch (e) {
    return { comercios: [], palabrasClave: {} };
  }
}

function guardar() { store.guardar(E); }

// ---------------------------------------------------------------- utilidades

const $ = (sel, raiz) => (raiz || document).querySelector(sel);
const $$ = (sel, raiz) => Array.prototype.slice.call((raiz || document).querySelectorAll(sel));

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const cat = (id) => E.categorias.find((c) => c.id === id) || E.categorias.find((c) => c.id === 'sin-clasificar') || { id: 'sin-clasificar', nombre: 'Sin clasificar', icono: '❓', color: '#9e9e9e' };
const part = (id) => E.participantes.find((p) => p.id === id);
const nombrePart = (id) => (part(id) ? part(id).nombre : '—');
const tipoNombre = (id) => (TIPOS.find((t) => t.id === id) || TIPOS[1]).nombre;
const gastosReales = () => E.gastos.filter((g) => !g.borrador);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('visible');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('visible'), 3500);
}

function opciones(lista, seleccionado, valor, texto) {
  return lista.map((x) => `<option value="${esc(valor(x))}"${valor(x) === seleccionado ? ' selected' : ''}>${esc(texto(x))}</option>`).join('');
}

const opcCategorias = (sel) => opciones(E.categorias, sel, (c) => c.id, (c) => c.icono + ' ' + c.nombre);
const opcParticipantes = (sel) => opciones(E.participantes, sel, (p) => p.id, (p) => p.nombre);
const opcTipos = (sel) => opciones(TIPOS, sel, (t) => t.id, (t) => t.nombre);

function chip(p) {
  return `<span class="chip" style="--c:${esc(p.color)}">${esc(p.nombre)}</span>`;
}

function descargar(nombre, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

function mesesDisponibles() {
  const set = {};
  set[claveMes(new Date())] = 1;
  gastosReales().forEach((g) => { set[claveMes(g.fecha)] = 1; });
  return Object.keys(set).sort().reverse();
}

// ---------------------------------------------------------------- reglas de negocio

function repartoPorDefecto() {
  const ids = E.participantes.map((p) => p.id);
  const d = E.repartoDefault || { modo: 'iguales' };
  return { modo: d.modo === 'porcentaje' ? 'porcentaje' : 'iguales', participantes: ids, valores: Object.assign({}, d.valores || {}) };
}

function buscarComercioPorNombre(nombre) {
  const n = normalizar(nombre);
  if (!n) return null;
  return E.comercios.find((c) => normalizar(c.nombre) === n || (c.alias || []).some((a) => normalizar(a) === n)) || null;
}

/**
 * Asegura que el comercio exista en el diccionario y recuerda su rubro.
 * Devuelve el id del comercio y si se "aprendió" un rubro nuevo.
 */
function aprenderComercio(nombre, categoriaId, tipo) {
  if (!nombre || !nombre.trim()) return { id: null, aprendio: false };
  let c = buscarComercioPorNombre(nombre);
  let aprendio = false;
  if (!c) {
    c = { id: nuevoId(), nombre: nombre.trim(), alias: [], categoriaId: categoriaId || 'sin-clasificar' };
    if (tipo === 'fijo') c.tipo = 'fijo';
    E.comercios.push(c);
    aprendio = categoriaId && categoriaId !== 'sin-clasificar';
  } else if (categoriaId && categoriaId !== 'sin-clasificar' && c.categoriaId !== categoriaId) {
    c.categoriaId = categoriaId;
    aprendio = true;
  }
  return { id: c.id, aprendio, comercio: c };
}

function crearGastoDesdeFrase(texto) {
  if (!E.participantes.length) { toast('Primero cargá los participantes de la casa.'); return; }
  const r = parsearFrase(texto, {
    participantes: E.participantes,
    usuarioActualId: E.usuarioActualId,
    comercios: E.comercios,
    palabrasClave: E.palabrasClave,
  });
  if (r.centavos == null || r.centavos <= 0) {
    abrirFormGasto(null, { comercio: r.comercioNombre, categoriaId: r.categoriaId, pagadorId: r.pagadorId, tipo: r.tipo });
    toast('No encontré el monto. Completalo en el formulario.');
    return;
  }
  const reparto = repartoPorDefecto();
  if (r.participantesIds) {
    reparto.participantes = r.participantesIds;
    reparto.modo = 'iguales';
    reparto.valores = {};
  }
  const g = {
    id: nuevoId(),
    monto: r.centavos,
    comercio: r.comercioNombre || 'Sin comercio',
    comercioId: r.comercioId,
    categoriaId: r.categoriaId,
    pagadorId: r.pagadorId,
    reparto,
    fecha: r.fecha.toISOString(),
    tipo: r.tipo,
    nota: '',
    texto: r.texto,
    creado: new Date().toISOString(),
  };
  if (!g.comercioId && r.comercioNombre) g.comercioId = aprenderComercio(r.comercioNombre, r.categoriaId, r.tipo).id;
  E.gastos.push(g);
  ui.ultimoGastoId = g.id;
  guardar();
  irA('#/inicio');
  toast('Gasto guardado: ' + pesos(g.monto) + ' en ' + g.comercio);
}

/** Genera el borrador del mes para cada gasto fijo activo. */
function generarBorradoresFijos() {
  const ahora = new Date();
  const mes = claveMes(ahora);
  let cambios = false;
  E.fijos.forEach((f) => {
    if (!f.activo || f.ultimoMes === mes) return;
    const ultimoDia = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
    const vence = new Date(ahora.getFullYear(), ahora.getMonth(), Math.min(f.dia || 1, ultimoDia), 12, 0);
    const reparto = repartoPorDefecto();
    E.gastos.push({
      id: nuevoId(), borrador: true, fijoId: f.id, monto: f.monto, comercio: f.nombre, comercioId: f.comercioId || null,
      categoriaId: f.categoriaId, pagadorId: f.pagadorId || E.usuarioActualId, reparto, fecha: vence.toISOString(),
      tipo: 'fijo', nota: '', creado: new Date().toISOString(),
    });
    f.ultimoMes = mes;
    cambios = true;
  });
  if (cambios) guardar();
}

function saldoReserva(r) {
  const aportado = E.aportesReserva.filter((a) => a.reservaId === r.id).reduce((s, a) => s + a.monto, 0);
  const usado = gastosReales().filter((g) => g.reservaId === r.id).reduce((s, g) => s + g.monto, 0);
  return { aportado, usado, disponible: aportado - usado };
}

// ---------------------------------------------------------------- navegación

function irA(hash) {
  if (location.hash !== hash) location.hash = hash;
  else render();
}

function rutaActual() {
  const h = (location.hash || '#/inicio').replace(/^#\/?/, '');
  return h.split('/');
}

function render() {
  aplicarTema();
  const necesitaOnboarding = !E.casa || !E.participantes.length;
  document.body.classList.toggle('en-onboarding', necesitaOnboarding);
  if (necesitaOnboarding) {
    $('#cabecera').innerHTML = '<h1 class="titulo-app">Gastos de la Casa</h1>';
    $('#principal').innerHTML = vistaOnboarding();
    return;
  }
  const ruta = rutaActual();
  $('#cabecera').innerHTML = vistaCabecera();
  const vistas = { inicio: vistaInicio, gastos: vistaGastos, saldos: vistaSaldos, ahorros: vistaAhorros, mas: vistaMas };
  const fn = vistas[ruta[0]] || vistaInicio;
  $('#principal').innerHTML = fn(ruta.slice(1));
  actualizarDatalist();
  $$('#nav a').forEach((a) => {
    const activo = a.getAttribute('href') === '#/' + (vistas[ruta[0]] ? ruta[0] : 'inicio');
    a.classList.toggle('activo', activo);
    if (activo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

function aplicarTema() {
  const t = E && E.tema;
  if (t === 'claro' || t === 'oscuro') document.documentElement.setAttribute('data-theme', t === 'claro' ? 'light' : 'dark');
  else document.documentElement.removeAttribute('data-theme');
}

// ---------------------------------------------------------------- vistas

function vistaOnboarding() {
  const ps = ui.onboarding.participantes;
  return `
  <section class="tarjeta">
    <h2>Bienvenidos 👋</h2>
    <p>Configurá la casa en tres pasos. Todo queda guardado solo en este dispositivo.</p>
    <form data-form="onboarding" class="formulario">
      <fieldset>
        <legend>1. La casa</legend>
        <label>Nombre de la casa <input name="casa" required maxlength="60" placeholder="Ej.: Casa de la calle Pellegrini" value="${esc(ui.onboarding.casa || '')}"></label>
      </fieldset>
      <fieldset>
        <legend>2. Participantes</legend>
        <ul class="lista-simple" id="ob-lista">
          ${ps.map((p, i) => `<li>${chip(p)} <button type="button" class="btn-texto" data-action="ob-quitar" data-i="${i}" aria-label="Quitar a ${esc(p.nombre)}">Quitar</button></li>`).join('') || '<li class="tenue">Todavía no agregaste a nadie.</li>'}
        </ul>
        <div class="fila">
          <label class="crece">Nombre <input id="ob-nombre" maxlength="30" placeholder="Ej.: Ana" autocomplete="off"></label>
          <button type="button" class="btn" data-action="ob-agregar">Agregar</button>
        </div>
      </fieldset>
      <fieldset>
        <legend>3. ¿Quién usa este dispositivo?</legend>
        <p class="tenue">Cuando digas "gasté…", el gasto queda a nombre de esta persona.</p>
        <select name="usuario" ${ps.length ? '' : 'disabled'} aria-label="Persona que usa este dispositivo">
          ${ps.map((p, i) => `<option value="${i}">${esc(p.nombre)}</option>`).join('')}
        </select>
      </fieldset>
      <p class="tenue">Por defecto los gastos se reparten en partes iguales. Después lo podés cambiar en Más › Reparto.</p>
      <button class="btn btn-primario btn-grande" ${ps.length ? '' : 'disabled'}>Empezar</button>
    </form>
  </section>`;
}

function vistaCabecera() {
  return `
    <h1 class="titulo-app">${esc(E.casa.nombre)}</h1>
    <label class="soy">Soy
      <select data-action="cambiar-usuario" aria-label="Persona que usa este dispositivo">${opcParticipantes(E.usuarioActualId)}</select>
    </label>`;
}

function vistaCaptura() {
  const voz = vozDisponible();
  return `
  <section class="tarjeta captura" aria-labelledby="t-captura">
    <h2 id="t-captura">Cargar un gasto</h2>
    <form data-form="frase" class="fila-captura">
      <label class="sr-only" for="frase">Dictá o escribí el gasto</label>
      <input id="frase" name="frase" enterkeyhint="send" autocomplete="off" inputmode="text"
        placeholder='Dictá o escribí: "Gasté 12.500 en Frioteka"'>
      ${voz ? '<button type="button" class="btn-mic" data-action="dictar" aria-label="Dictar gasto por voz">🎤</button>' : ''}
      <button class="btn btn-primario" aria-label="Cargar gasto">Cargar</button>
    </form>
    <p id="estado-voz" class="tenue pequeno" aria-live="polite">${voz
      ? 'Tocá 🎤 y decí, por ejemplo: "Pagó Juan 45.000 de luz CPE".'
      : 'Para dictar, tocá el micrófono del teclado de tu celular dentro del campo.'}</p>
    <button type="button" class="btn-texto" data-action="nuevo-gasto">+ Carga manual</button>
  </section>`;
}

function vistaConfirmacion() {
  const g = E.gastos.find((x) => x.id === ui.ultimoGastoId);
  if (!g) return '';
  const sinClasificar = g.categoriaId === 'sin-clasificar';
  const ids = g.reparto && g.reparto.participantes ? g.reparto.participantes : [];
  return `
  <section class="tarjeta confirmacion" aria-labelledby="t-conf">
    <h2 id="t-conf">✅ Guardado ${esc(fecha(g.fecha))} ${esc(hora(g.fecha))}</h2>
    <form data-form="confirmacion" data-id="${esc(g.id)}" class="formulario compacto">
      <div class="fila">
        <label>Monto <input name="monto" inputmode="decimal" value="${esc(centavosATexto(g.monto))}" required></label>
        <label class="crece">Comercio <input name="comercio" value="${esc(g.comercio)}" list="lista-comercios"></label>
      </div>
      <div class="fila">
        <label class="crece">Rubro <select name="categoriaId">${opcCategorias(g.categoriaId)}</select></label>
        <label class="crece">Pagó <select name="pagadorId">${opcParticipantes(g.pagadorId)}</select></label>
      </div>
      <p class="pequeno">Se reparte entre: ${ids.map((id) => esc(nombrePart(id))).join(', ')} · ${esc(tipoNombre(g.tipo))}</p>
      ${sinClasificar ? `<div class="aviso">¿De qué rubro es <strong>${esc(g.comercio)}</strong>? Elegilo arriba y la próxima vez se clasifica solo.</div>` : ''}
      <div class="fila acciones">
        <button type="button" class="btn" data-action="editar-gasto" data-id="${esc(g.id)}">Más opciones</button>
        <button type="button" class="btn btn-peligro" data-action="deshacer" data-id="${esc(g.id)}">Deshacer</button>
        <button type="button" class="btn btn-primario" data-action="cerrar-confirmacion">Listo</button>
      </div>
    </form>
  </section>`;
}

function vistaInicio() {
  const mes = claveMes(new Date());
  const delMes = gastosReales().filter((g) => claveMes(g.fecha) === mes);
  const total = delMes.reduce((s, g) => s + g.monto, 0);
  const anterior = gastosReales().filter((g) => claveMes(g.fecha) === mesAnterior(mes)).reduce((s, g) => s + g.monto, 0);
  let comparacion = '';
  if (anterior > 0) {
    const pct = Math.round(((total - anterior) / anterior) * 100);
    comparacion = `<p class="${pct > 0 ? 'sube' : 'baja'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs. ${esc(nombreMes(mesAnterior(mes)))} (${esc(pesos(anterior))})</p>`;
  } else {
    comparacion = '<p class="tenue">Sin gastos el mes anterior para comparar.</p>';
  }
  const porCat = {};
  delMes.forEach((g) => { porCat[g.categoriaId] = (porCat[g.categoriaId] || 0) + g.monto; });
  const ranking = Object.keys(porCat).map((id) => ({ c: cat(id), v: porCat[id] })).sort((a, b) => b.v - a.v);
  const top = ranking.slice(0, 5);
  const ultimos6 = [5, 4, 3, 2, 1, 0].map((n) => mesAnterior(mes, n));
  const porMes = ultimos6.map((k) => ({
    etiqueta: nombreMes(k).slice(0, 3),
    valor: gastosReales().filter((g) => claveMes(g.fecha) === k).reduce((s, g) => s + g.monto, 0),
    destacado: k === mes,
  }));

  const borradores = E.gastos.filter((g) => g.borrador).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const enCinco = new Date(); enCinco.setDate(enCinco.getDate() + 5);
  const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0);

  const aviso = store.modoAlmacenamiento() !== 'indexeddb'
    ? `<div class="aviso aviso-fuerte" role="alert">⚠️ ${store.modoAlmacenamiento() === 'memoria'
      ? 'Este navegador no permite guardar datos (¿modo privado?). Lo que cargues se pierde al cerrar.'
      : 'Se está usando un almacenamiento de respaldo. Los datos pueden perderse: exportá un respaldo seguido.'}</div>` : '';

  return `
  ${aviso}
  ${vistaCaptura()}
  ${vistaConfirmacion()}
  ${borradores.length ? `
  <section class="tarjeta" aria-labelledby="t-fijos">
    <h2 id="t-fijos">Gastos fijos para confirmar</h2>
    <ul class="lista">
      ${borradores.map((g) => {
        const f = new Date(g.fecha);
        const estado = f < hoy0 ? '<span class="etiqueta etiqueta-mal">Vencido</span>' : f <= enCinco ? '<span class="etiqueta etiqueta-alerta">Vence pronto</span>' : '';
        return `<li class="item">
          <span class="icono" aria-hidden="true">${esc(cat(g.categoriaId).icono)}</span>
          <span class="crece"><strong>${esc(g.comercio)}</strong><br><span class="pequeno tenue">Vence ${esc(fecha(g.fecha))} ${estado}</span></span>
          <span class="monto">${esc(pesos(g.monto))}</span>
          <span class="acciones-item">
            <button class="btn btn-primario" data-action="confirmar-borrador" data-id="${esc(g.id)}">Confirmar</button>
            <button class="btn-texto" data-action="omitir-borrador" data-id="${esc(g.id)}">Omitir</button>
          </span></li>`;
      }).join('')}
    </ul>
  </section>` : ''}
  <section class="tarjeta" aria-labelledby="t-mes">
    <h2 id="t-mes">${esc(nombreMes(mes))}</h2>
    <p class="total-grande">${esc(pesos(total))}</p>
    ${comparacion}
    ${top.length ? `
    <div class="resumen-graficos">
      ${dona(ranking.map((x) => ({ etiqueta: x.c.nombre + ': ' + pesos(x.v), valor: x.v, color: x.c.color })), 'Gastos del mes por rubro')}
      <ol class="ranking">
        ${top.map((x) => `<li><span class="punto" style="background:${esc(x.c.color)}"></span>${esc(x.c.icono)} ${esc(x.c.nombre)}<span class="monto">${esc(pesos(x.v))}</span>
          <span class="barra-pct" style="width:${Math.round((x.v / total) * 100)}%;background:${esc(x.c.color)}"></span></li>`).join('')}
      </ol>
    </div>` : '<p class="tenue">Todavía no hay gastos este mes.</p>'}
  </section>
  <section class="tarjeta" aria-labelledby="t-meses">
    <h2 id="t-meses">Últimos 6 meses</h2>
    ${barras(porMes, 'Total gastado por mes en los últimos 6 meses', pesos)}
  </section>`;
}

function filtrar(gastos, f) {
  return gastos.filter((g) =>
    (!f.mes || claveMes(g.fecha) === f.mes) &&
    (!f.categoriaId || g.categoriaId === f.categoriaId) &&
    (!f.tipo || g.tipo === f.tipo) &&
    (!f.participanteId || g.pagadorId === f.participanteId || (g.reparto && (g.reparto.participantes || []).indexOf(f.participanteId) >= 0)));
}

function controlesFiltro(f, grupo, conParticipante) {
  return `
  <div class="filtros" role="group" aria-label="Filtros">
    <label>Mes <select data-filtro="${grupo}" name="mes">
      <option value="">Todos</option>${mesesDisponibles().map((m) => `<option value="${m}"${m === f.mes ? ' selected' : ''}>${esc(nombreMes(m))}</option>`).join('')}
    </select></label>
    <label>Rubro <select data-filtro="${grupo}" name="categoriaId"><option value="">Todos</option>${opcCategorias(f.categoriaId)}</select></label>
    <label>Tipo <select data-filtro="${grupo}" name="tipo"><option value="">Todos</option>${opcTipos(f.tipo)}</select></label>
    ${conParticipante ? `<label>Persona <select data-filtro="${grupo}" name="participanteId"><option value="">Todas</option>${opcParticipantes(f.participanteId)}</select></label>` : ''}
  </div>`;
}

function vistaGastos() {
  const f = ui.filtrosGastos;
  const lista = filtrar(gastosReales(), f).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const total = lista.reduce((s, g) => s + g.monto, 0);
  const porDia = {};
  lista.forEach((g) => { const k = fecha(g.fecha); (porDia[k] = porDia[k] || []).push(g); });
  return `
  <section class="tarjeta">
    <div class="fila entre">
      <h2>Gastos</h2>
      <button class="btn btn-primario" data-action="nuevo-gasto">+ Nuevo</button>
    </div>
    ${controlesFiltro(f, 'gastos', true)}
    <p><strong>${lista.length}</strong> gasto${lista.length === 1 ? '' : 's'} · Total <strong>${esc(pesos(total))}</strong></p>
  </section>
  ${Object.keys(porDia).map((dia) => `
  <section class="tarjeta lista-dia">
    <h3 class="dia">${esc(dia)}</h3>
    <ul class="lista">${porDia[dia].map(itemGasto).join('')}</ul>
  </section>`).join('') || '<p class="vacio">No hay gastos con estos filtros.</p>'}`;
}

function itemGasto(g) {
  const c = cat(g.categoriaId);
  return `<li><button class="item item-boton" data-action="editar-gasto" data-id="${esc(g.id)}">
    <span class="icono" aria-hidden="true" style="background:${esc(c.color)}22">${esc(c.icono)}</span>
    <span class="crece"><strong>${esc(g.comercio)}</strong>
      <span class="pequeno tenue">${esc(c.nombre)} · ${esc(tipoNombre(g.tipo))} · pagó ${esc(nombrePart(g.pagadorId))} · ${esc(hora(g.fecha))}${g.reservaId ? ' · desde reserva' : ''}</span>
      ${g.categoriaId === 'sin-clasificar' ? '<span class="etiqueta etiqueta-alerta">Asignar rubro</span>' : ''}
    </span>
    <span class="monto">${esc(pesos(g.monto))}</span>
  </button></li>`;
}

function vistaSaldos() {
  const f = ui.filtrosSaldos;
  const gastos = filtrar(gastosReales(), f);
  const filtraRubroOTipo = !!(f.categoriaId || f.tipo);
  const pagos = filtraRubroOTipo ? [] : E.pagos.filter((p) => !f.mes || claveMes(p.fecha) === f.mes);
  const saldos = calcularSaldos({ participantes: E.participantes, gastos, pagos, aportesReservas: E.aportesReserva });
  const transferencias = simplificarDeudas(saldos);
  return `
  <section class="tarjeta">
    <h2>Saldos</h2>
    ${controlesFiltro(f, 'saldos', false)}
    ${filtraRubroOTipo ? '<p class="pequeno tenue">Con filtro de rubro o tipo no se cuentan los pagos entre participantes.</p>' : ''}
    <ul class="saldos">
      ${E.participantes.map((p) => {
        const s = saldos[p.id] || { pagado: 0, correspondia: 0, saldo: 0 };
        const clase = s.saldo > 0 ? 'positivo' : s.saldo < 0 ? 'negativo' : '';
        return `<li class="saldo">${chip(p)}
          <span class="pequeno">Pagó ${esc(pesos(s.pagado))} · Le correspondía ${esc(pesos(s.correspondia))}</span>
          <strong class="${clase}">${s.saldo > 0 ? 'A favor ' : s.saldo < 0 ? 'Debe ' : ''}${esc(pesos(Math.abs(s.saldo)))}</strong></li>`;
      }).join('')}
    </ul>
  </section>
  <section class="tarjeta" aria-labelledby="t-quien">
    <h2 id="t-quien">Quién le debe a quién</h2>
    ${transferencias.length ? `<ul class="lista">${transferencias.map((t) => `
      <li class="item"><span class="crece en-linea"><strong>${esc(nombrePart(t.deId))}</strong> le paga a <strong>${esc(nombrePart(t.aId))}</strong></span>
        <span class="monto">${esc(pesos(t.monto))}</span>
        ${filtraRubroOTipo ? '' : `<button class="btn btn-primario" data-action="saldar" data-de="${esc(t.deId)}" data-a="${esc(t.aId)}" data-monto="${t.monto}">Saldar</button>`}
      </li>`).join('')}</ul>` : '<p>🎉 Están todos al día.</p>'}
  </section>
  <section class="tarjeta" aria-labelledby="t-pagos">
    <h2 id="t-pagos">Pagos entre participantes</h2>
    ${E.pagos.length ? `<ul class="lista">${E.pagos.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).map((p) => `
      <li class="item"><span class="crece">${esc(nombrePart(p.deId))} → ${esc(nombrePart(p.aId))}<br><span class="pequeno tenue">${esc(fecha(p.fecha))}</span></span>
        <span class="monto">${esc(pesos(p.monto))}</span>
        <button class="btn-texto" data-action="borrar-pago" data-id="${esc(p.id)}">Eliminar</button></li>`).join('')}</ul>` : '<p class="tenue">Todavía no se registraron pagos.</p>'}
  </section>`;
}

function vistaAhorros() {
  const tab = ui.tabAhorros;
  return `
  <div class="pestanias" role="tablist">
    <button role="tab" aria-selected="${tab === 'ahorros'}" class="${tab === 'ahorros' ? 'activa' : ''}" data-action="tab-ahorros" data-tab="ahorros">Ahorros en común</button>
    <button role="tab" aria-selected="${tab === 'reservas'}" class="${tab === 'reservas' ? 'activa' : ''}" data-action="tab-ahorros" data-tab="reservas">Reservas</button>
  </div>
  ${tab === 'ahorros' ? vistaListaAhorros() : vistaListaReservas()}`;
}

function vistaListaAhorros() {
  return `
  <section class="tarjeta">
    <p class="tenue pequeno">Los aportes a los ahorros no cuentan como gasto ni cambian los saldos.</p>
    <details><summary class="btn">+ Nuevo ahorro</summary>
      <form data-form="ahorro" class="formulario">
        <label>Nombre <input name="nombre" required maxlength="50" placeholder="Ej.: Vacaciones"></label>
        <div class="fila">
          <label class="crece">Objetivo (opcional) <input name="objetivo" inputmode="decimal" placeholder="500000"></label>
          <label class="crece">Para cuándo (opcional) <input type="date" name="fecha"></label>
        </div>
        <button class="btn btn-primario">Crear</button>
      </form>
    </details>
  </section>
  ${E.ahorros.map((a) => {
    const aportes = E.aportesAhorro.filter((x) => x.ahorroId === a.id);
    const total = aportes.reduce((s, x) => s + x.monto, 0);
    const porPersona = {};
    aportes.forEach((x) => { porPersona[x.participanteId] = (porPersona[x.participanteId] || 0) + x.monto; });
    const pct = a.objetivo ? Math.min(100, Math.round((total / a.objetivo) * 100)) : null;
    return `<section class="tarjeta">
      <div class="fila entre"><h3>${esc(a.nombre)}</h3><strong class="monto">${esc(pesos(total))}</strong></div>
      ${a.objetivo ? `<div class="progreso" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Progreso de ${esc(a.nombre)}"><span style="width:${pct}%"></span></div>
        <p class="pequeno">${pct}% de ${esc(pesos(a.objetivo))}${a.fecha ? ' · para el ' + esc(fecha(a.fecha)) : ''}</p>` : ''}
      <ul class="lista-simple">${Object.keys(porPersona).map((id) => `<li>${esc(nombrePart(id))}: ${esc(pesos(porPersona[id]))}</li>`).join('') || '<li class="tenue">Sin aportes todavía.</li>'}</ul>
      <div class="fila acciones">
        <button class="btn btn-primario" data-action="aportar" data-tipo="ahorro" data-id="${esc(a.id)}">Aportar</button>
        <button class="btn" data-action="retirar" data-id="${esc(a.id)}">Retirar</button>
        <button class="btn-texto peligro" data-action="borrar-ahorro" data-id="${esc(a.id)}">Eliminar</button>
      </div></section>`;
  }).join('') || '<p class="vacio">Todavía no hay ahorros.</p>'}`;
}

function vistaListaReservas() {
  return `
  <section class="tarjeta">
    <p class="tenue pequeno">Apartá plata para un gasto futuro. Cuando llegue, pagalo desde la reserva y queda vinculado.</p>
    <details><summary class="btn">+ Nueva reserva</summary>
      <form data-form="reserva" class="formulario">
        <label>Para qué <input name="nombre" required maxlength="60" placeholder="Ej.: Seguro del auto – marzo"></label>
        <div class="fila">
          <label class="crece">Monto <input name="monto" inputmode="decimal" required placeholder="120000"></label>
          <label class="crece">Fecha <input type="date" name="fecha" required></label>
        </div>
        <label>Rubro del gasto <select name="categoriaId">${opcCategorias('otros')}</select></label>
        <button class="btn btn-primario">Crear</button>
      </form>
    </details>
  </section>
  ${E.reservas.map((r) => {
    const s = saldoReserva(r);
    const sugerido = aporteMensualSugerido(r.monto, s.aportado, r.fecha, new Date());
    const pct = r.monto ? Math.min(100, Math.round((s.aportado / r.monto) * 100)) : 0;
    return `<section class="tarjeta">
      <div class="fila entre"><h3>${esc(r.nombre)}</h3><span class="pequeno">${esc(fecha(r.fecha))}</span></div>
      <div class="progreso" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Progreso de ${esc(r.nombre)}"><span style="width:${pct}%"></span></div>
      <p class="pequeno">Juntado ${esc(pesos(s.aportado))} de ${esc(pesos(r.monto))} · Usado ${esc(pesos(s.usado))} · Disponible <strong>${esc(pesos(s.disponible))}</strong></p>
      ${sugerido ? `<p>Aporte mensual sugerido: <strong>${esc(pesos(sugerido))}</strong></p>` : '<p>✅ Objetivo cubierto.</p>'}
      <div class="fila acciones">
        <button class="btn btn-primario" data-action="aportar" data-tipo="reserva" data-id="${esc(r.id)}">Aportar</button>
        <button class="btn" data-action="pagar-reserva" data-id="${esc(r.id)}">Pagar gasto</button>
        <button class="btn-texto peligro" data-action="borrar-reserva" data-id="${esc(r.id)}">Eliminar</button>
      </div></section>`;
  }).join('') || '<p class="vacio">Todavía no hay reservas.</p>'}`;
}

function vistaMas(sub) {
  const s = sub[0];
  if (s === 'participantes') return vistaParticipantes();
  if (s === 'reparto') return vistaReparto();
  if (s === 'rubros') return vistaRubros();
  if (s === 'comercios') return vistaComercios();
  if (s === 'fijos') return vistaFijos();
  if (s === 'datos') return vistaDatos();
  const items = [
    ['participantes', '👥', 'Participantes', 'Quiénes viven en la casa'],
    ['reparto', '⚖️', 'Reparto por defecto', 'Partes iguales o porcentaje'],
    ['fijos', '📅', 'Gastos fijos', 'Vencimientos y borradores mensuales'],
    ['comercios', '🏪', 'Comercios', 'Diccionario de comercios y rubros'],
    ['rubros', '🏷️', 'Rubros', 'Categorías de gasto'],
    ['datos', '💾', 'Datos y ajustes', 'Respaldo, exportar, importar, tema'],
  ];
  return `<section class="tarjeta"><h2>Más</h2><ul class="lista">${items.map((i) => `
    <li><a class="item item-boton" href="#/mas/${i[0]}"><span class="icono" aria-hidden="true">${i[1]}</span>
    <span class="crece"><strong>${i[2]}</strong><span class="pequeno tenue">${i[3]}</span></span><span aria-hidden="true">›</span></a></li>`).join('')}</ul></section>`;
}

const volver = '<a class="btn-texto volver" href="#/mas">‹ Volver</a>';

function vistaParticipantes() {
  const usados = {};
  E.gastos.forEach((g) => { usados[g.pagadorId] = 1; ((g.reparto && g.reparto.participantes) || []).forEach((id) => { usados[id] = 1; }); });
  E.pagos.forEach((p) => { usados[p.deId] = 1; usados[p.aId] = 1; });
  return `${volver}
  <section class="tarjeta"><h2>Participantes</h2>
    <ul class="lista">${E.participantes.map((p) => `
      <li class="item"><form data-form="participante" data-id="${esc(p.id)}" class="fila crece">
        <label class="crece">Nombre <input name="nombre" value="${esc(p.nombre)}" required maxlength="30"></label>
        <label>Color <select name="color">${COLORES.map((c) => `<option value="${c}"${c === p.color ? ' selected' : ''} style="color:${c}">● ${c}</option>`).join('')}</select></label>
        <button class="btn">Guardar</button>
        <button type="button" class="btn-texto peligro" data-action="borrar-participante" data-id="${esc(p.id)}" ${usados[p.id] ? 'disabled title="Tiene gastos asociados"' : ''}>Eliminar</button>
      </form></li>`).join('')}</ul>
    <form data-form="nuevo-participante" class="fila">
      <label class="crece">Nuevo participante <input name="nombre" required maxlength="30" placeholder="Nombre"></label>
      <button class="btn btn-primario">Agregar</button>
    </form>
    <p class="pequeno tenue">Quien tiene gastos o pagos asociados no se puede eliminar, para que los saldos sigan cerrando.</p>
  </section>`;
}

function vistaReparto() {
  const d = E.repartoDefault;
  return `${volver}
  <section class="tarjeta"><h2>Reparto por defecto</h2>
    <form data-form="reparto" class="formulario">
      <fieldset><legend>¿Cómo se reparten los gastos nuevos?</legend>
        <label class="opcion"><input type="radio" name="modo" value="iguales" ${d.modo !== 'porcentaje' ? 'checked' : ''}> Partes iguales</label>
        <label class="opcion"><input type="radio" name="modo" value="porcentaje" ${d.modo === 'porcentaje' ? 'checked' : ''}> Porcentaje fijo por persona (por ejemplo, según ingresos)</label>
      </fieldset>
      <fieldset><legend>Porcentajes</legend>
        ${E.participantes.map((p) => `<label class="fila">${esc(p.nombre)} <input name="pct-${esc(p.id)}" inputmode="decimal" value="${esc((d.valores || {})[p.id] != null ? d.valores[p.id] : '')}" placeholder="${Math.round(100 / E.participantes.length)}" class="corto"> %</label>`).join('')}
        <p class="pequeno tenue">Si no suman 100, se ajustan proporcionalmente.</p>
      </fieldset>
      <button class="btn btn-primario">Guardar</button>
    </form>
  </section>`;
}

function vistaRubros() {
  return `${volver}
  <section class="tarjeta"><h2>Rubros</h2>
    <ul class="lista">${E.categorias.map((c) => `
      <li class="item"><form data-form="rubro" data-id="${esc(c.id)}" class="fila crece">
        <label>Ícono <input name="icono" value="${esc(c.icono)}" maxlength="4" class="corto"></label>
        <label class="crece">Nombre <input name="nombre" value="${esc(c.nombre)}" required maxlength="40"></label>
        <label>Color <input type="color" name="color" value="${esc(c.color)}"></label>
        <button class="btn">Guardar</button>
        ${c.id === 'otros' || c.id === 'sin-clasificar' ? '' : `<button type="button" class="btn-texto peligro" data-action="borrar-rubro" data-id="${esc(c.id)}">Eliminar</button>`}
      </form></li>`).join('')}</ul>
    <form data-form="nuevo-rubro" class="fila">
      <label>Ícono <input name="icono" maxlength="4" class="corto" placeholder="🏷️"></label>
      <label class="crece">Nuevo rubro <input name="nombre" required maxlength="40"></label>
      <button class="btn btn-primario">Agregar</button>
    </form>
  </section>`;
}

function vistaComercios() {
  const q = normalizar(ui.buscarComercio);
  const lista = E.comercios
    .filter((c) => (!ui.soloSinClasificar || c.categoriaId === 'sin-clasificar') &&
      (!q || normalizar(c.nombre).indexOf(q) >= 0 || (c.alias || []).some((a) => normalizar(a).indexOf(q) >= 0)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const sinClas = E.comercios.filter((c) => c.categoriaId === 'sin-clasificar').length;
  return `${volver}
  <section class="tarjeta"><h2>Comercios</h2>
    <p class="pequeno tenue">Cada comercio tiene un rubro. Cuando cambiás el rubro de un gasto, el comercio lo recuerda para la próxima.</p>
    <div class="fila">
      <label class="crece">Buscar <input type="search" data-action="buscar-comercio" value="${esc(ui.buscarComercio)}" placeholder="Nombre o alias"></label>
      <label class="opcion"><input type="checkbox" data-action="solo-sin-clasificar" ${ui.soloSinClasificar ? 'checked' : ''}> Sin clasificar (${sinClas})</label>
    </div>
    <details><summary class="btn">+ Agregar comercio</summary>
      <form data-form="nuevo-comercio" class="formulario">
        <label>Nombre <input name="nombre" required maxlength="60"></label>
        <label>Alias (separados por coma) <input name="alias" placeholder="otra forma de decirlo, abreviatura"></label>
        <div class="fila">
          <label class="crece">Rubro <select name="categoriaId">${opcCategorias('alimentos')}</select></label>
          <label class="crece">Tipo por defecto <select name="tipo"><option value="">—</option>${opcTipos('')}</select></label>
        </div>
        <button class="btn btn-primario">Agregar</button>
      </form>
    </details>
    <details><summary class="btn">Fusionar duplicados</summary>
      <form data-form="fusionar" class="formulario">
        <label>Este comercio… <select name="origen" required>${opciones(E.comercios, '', (c) => c.id, (c) => c.nombre)}</select></label>
        <label>…se une a <select name="destino" required>${opciones(E.comercios, '', (c) => c.id, (c) => c.nombre)}</select></label>
        <button class="btn btn-primario">Fusionar</button>
      </form>
    </details>
    <button class="btn" data-action="sumar-semilla">Sumar comercios del archivo de Santa Rosa</button>
  </section>
  <section class="tarjeta">
    <ul class="lista">${lista.map((c) => `
      <li class="item"><form data-form="comercio" data-id="${esc(c.id)}" class="formulario crece compacto">
        <div class="fila">
          <label class="crece">Nombre <input name="nombre" value="${esc(c.nombre)}" required maxlength="60"></label>
          <label class="crece">Rubro <select name="categoriaId">${opcCategorias(c.categoriaId)}</select></label>
        </div>
        <div class="fila">
          <label class="crece">Alias <input name="alias" value="${esc((c.alias || []).join(', '))}"></label>
          <label>Tipo <select name="tipo"><option value="">—</option>${opcTipos(c.tipo || '')}</select></label>
        </div>
        <div class="fila acciones"><button class="btn">Guardar</button>
        <button type="button" class="btn-texto peligro" data-action="borrar-comercio" data-id="${esc(c.id)}">Eliminar</button></div>
      </form></li>`).join('') || '<li class="vacio">No hay comercios con ese filtro.</li>'}</ul>
  </section>`;
}

function vistaFijos() {
  return `${volver}
  <section class="tarjeta"><h2>Gastos fijos</h2>
    <p class="pequeno tenue">Cada mes se crea un borrador con el monto estimado. Aparece en Inicio para confirmarlo (con el monto real) cuando se acerca el vencimiento.</p>
    <details><summary class="btn">+ Nuevo gasto fijo</summary>${formFijo(null)}</details>
  </section>
  ${E.fijos.map((f) => `<section class="tarjeta">
    <div class="fila entre"><h3>${esc(cat(f.categoriaId).icono)} ${esc(f.nombre)}</h3><strong>${esc(pesos(f.monto))}</strong></div>
    <p class="pequeno">Vence el día ${esc(f.dia)} · paga ${esc(nombrePart(f.pagadorId))} · ${f.activo ? 'Activo' : 'Pausado'}</p>
    <details><summary class="btn-texto">Editar</summary>${formFijo(f)}</details>
  </section>`).join('')}`;
}

function formFijo(f) {
  const x = f || { nombre: '', monto: 0, categoriaId: 'energia-internet', dia: 10, pagadorId: E.usuarioActualId, activo: true };
  return `<form data-form="fijo" ${f ? `data-id="${esc(f.id)}"` : ''} class="formulario">
    <label>Comercio o servicio <input name="nombre" required maxlength="60" value="${esc(x.nombre)}" list="lista-comercios" placeholder="Ej.: CPE"></label>
    <div class="fila">
      <label class="crece">Monto estimado <input name="monto" inputmode="decimal" required value="${esc(x.monto ? centavosATexto(x.monto) : '')}"></label>
      <label class="crece">Día de vencimiento <input name="dia" type="number" min="1" max="31" required value="${esc(x.dia)}"></label>
    </div>
    <div class="fila">
      <label class="crece">Rubro <select name="categoriaId">${opcCategorias(x.categoriaId)}</select></label>
      <label class="crece">Paga <select name="pagadorId">${opcParticipantes(x.pagadorId)}</select></label>
    </div>
    <label class="opcion"><input type="checkbox" name="activo" ${x.activo ? 'checked' : ''}> Activo</label>
    <div class="fila acciones"><button class="btn btn-primario">Guardar</button>
    ${f ? `<button type="button" class="btn-texto peligro" data-action="borrar-fijo" data-id="${esc(f.id)}">Eliminar</button>` : ''}</div>
  </form>`;
}

function vistaDatos() {
  const modo = { indexeddb: 'IndexedDB (recomendado)', localstorage: 'localStorage (respaldo)', memoria: 'Solo memoria: los datos no se guardan' }[store.modoAlmacenamiento()];
  return `${volver}
  <section class="tarjeta"><h2>Respaldo</h2>
    <p class="pequeno tenue">Los datos viven solo en este dispositivo. Para pasarlos a otro celular, exportá el JSON e importalo allá.</p>
    <div class="fila acciones">
      <button class="btn btn-primario" data-action="exportar-json">Exportar respaldo (JSON)</button>
      <button class="btn" data-action="exportar-csv">Exportar gastos (CSV)</button>
    </div>
    <label class="btn">Importar JSON o CSV <input type="file" accept=".json,.csv,application/json,text/csv" data-action="importar" class="sr-only"></label>
    <p class="pequeno tenue">El JSON reemplaza todos los datos. El CSV agrega gastos (columnas: fecha;hora;monto;comercio;rubro;tipo;pagó;participantes;nota).</p>
  </section>
  <section class="tarjeta"><h2>Apariencia</h2>
    <label>Tema <select data-action="tema">
      ${opciones([{ id: 'auto', n: 'Automático (según el sistema)' }, { id: 'claro', n: 'Claro' }, { id: 'oscuro', n: 'Oscuro' }], E.tema || 'auto', (t) => t.id, (t) => t.n)}
    </select></label>
  </section>
  <section class="tarjeta"><h2>Este navegador</h2>
    <ul class="lista-simple">
      <li>Dictado integrado: ${vozDisponible() ? '✅ disponible' : '➖ no disponible (usá el micrófono del teclado)'}</li>
      <li>Almacenamiento: ${esc(modo)}</li>
      <li>Funciona sin conexión: ${'serviceWorker' in navigator ? '✅ sí' : '➖ no (la app funciona igual mientras esté abierta)'}</li>
    </ul>
  </section>
  <section class="tarjeta"><h2>Zona peligrosa</h2>
    <button class="btn btn-peligro" data-action="borrar-todo">Borrar todos los datos</button>
  </section>`;
}

// ---------------------------------------------------------------- formulario de gasto (diálogo)

function abrirDialogo(html) {
  const d = $('#dialogo');
  $('#dialogo-cuerpo').innerHTML = html;
  if (typeof d.showModal === 'function') {
    if (!d.open) d.showModal();
  } else {
    d.setAttribute('open', '');
  }
  const primero = $('input, select, textarea', d);
  if (primero) primero.focus();
}

function cerrarDialogo() {
  const d = $('#dialogo');
  if (typeof d.close === 'function' && d.open) d.close();
  else { d.removeAttribute('open'); alCerrarDialogo(); }
}

// Al cerrar el diálogo (también con Escape) se vacía, para no dejar formularios ocultos en la página.
function alCerrarDialogo() { $('#dialogo-cuerpo').innerHTML = ''; }

function abrirFormGasto(id, pre) {
  const existente = id ? E.gastos.find((g) => g.id === id) : null;
  const g = existente || Object.assign({
    monto: null, comercio: '', categoriaId: 'sin-clasificar', pagadorId: E.usuarioActualId,
    reparto: repartoPorDefecto(), fecha: new Date().toISOString(), tipo: 'esporadico', nota: '', reservaId: null,
  }, pre || {});
  if (!g.reparto) g.reparto = repartoPorDefecto();
  const rep = g.reparto;
  const modo = rep.modo || 'iguales';
  const enReparto = (pid) => (rep.participantes || []).indexOf(pid) >= 0;
  const valor = (pid) => {
    const v = (rep.valores || {})[pid];
    if (v == null) return '';
    return modo === 'montos' ? centavosATexto(v) : String(v);
  };
  abrirDialogo(`
    <h2>${existente ? (existente.borrador ? 'Confirmar gasto fijo' : 'Editar gasto') : 'Nuevo gasto'}</h2>
    <form data-form="gasto" ${existente ? `data-id="${esc(existente.id)}"` : ''} class="formulario">
      <div class="fila">
        <label class="crece">Monto <input name="monto" inputmode="decimal" required value="${esc(g.monto ? centavosATexto(g.monto) : '')}" placeholder="12500,50"></label>
        <label class="crece">Fecha y hora <input type="datetime-local" name="fecha" required value="${esc(aInputFechaHora(g.fecha))}"></label>
      </div>
      <label>Comercio <input name="comercio" value="${esc(g.comercio)}" list="lista-comercios" data-action="autoclasificar" maxlength="60" placeholder="Ej.: Frioteka"></label>
      <div class="fila">
        <label class="crece">Rubro <select name="categoriaId">${opcCategorias(g.categoriaId)}</select></label>
        <label class="crece">Tipo <select name="tipo">${opcTipos(g.tipo)}</select></label>
      </div>
      <div class="fila">
        <label class="crece">Pagó <select name="pagadorId">${opcParticipantes(g.pagadorId)}</select></label>
        <label class="crece">Pagar desde reserva <select name="reservaId"><option value="">No</option>${opciones(E.reservas, g.reservaId || '', (r) => r.id, (r) => r.nombre + ' (' + pesos(saldoReserva(r).disponible) + ')')}</select></label>
      </div>
      <fieldset>
        <legend>Se reparte entre</legend>
        <div class="fila">
          ${['iguales', 'porcentaje', 'montos'].map((m) => `<label class="opcion"><input type="radio" name="modo" value="${m}" ${modo === m ? 'checked' : ''} data-action="modo-reparto"> ${{ iguales: 'Partes iguales', porcentaje: 'Porcentaje', montos: 'Montos' }[m]}</label>`).join('')}
        </div>
        ${E.participantes.map((p) => `<div class="fila reparto-fila">
          <label class="opcion crece"><input type="checkbox" name="part" value="${esc(p.id)}" ${enReparto(p.id) ? 'checked' : ''}> ${esc(p.nombre)}</label>
          <input name="valor-${esc(p.id)}" inputmode="decimal" class="corto valor-reparto" value="${esc(valor(p.id))}" aria-label="${modo === 'montos' ? 'Monto' : 'Porcentaje'} de ${esc(p.nombre)}" ${modo === 'iguales' ? 'hidden' : ''}>
        </div>`).join('')}
      </fieldset>
      <label>Nota <input name="nota" value="${esc(g.nota || '')}" maxlength="140"></label>
      <p class="error" id="error-gasto" role="alert"></p>
      <div class="fila acciones">
        <button class="btn btn-primario">${existente && existente.borrador ? 'Confirmar' : 'Guardar'}</button>
        <button type="button" class="btn" data-action="cerrar-dialogo">Cancelar</button>
        ${existente ? `<button type="button" class="btn-texto peligro" data-action="borrar-gasto" data-id="${esc(existente.id)}">Eliminar</button>` : ''}
      </div>
    </form>`);
}

function guardarFormGasto(form) {
  const fd = new FormData(form);
  const err = $('#error-gasto');
  const monto = textoACentavos(fd.get('monto'));
  if (!monto || monto <= 0) { err.textContent = 'Ingresá un monto válido.'; return; }
  const ids = fd.getAll('part');
  if (!ids.length) { err.textContent = 'Elegí al menos una persona para repartir.'; return; }
  const modo = fd.get('modo') || 'iguales';
  const valores = {};
  if (modo !== 'iguales') {
    let suma = 0;
    ids.forEach((id) => {
      const raw = String(fd.get('valor-' + id) || '').trim();
      const v = modo === 'montos' ? textoACentavos(raw) : Number(raw.replace(',', '.'));
      valores[id] = v && v > 0 ? v : 0;
      suma += valores[id];
    });
    if (suma <= 0) { err.textContent = 'Completá los valores del reparto.'; return; }
    if (modo === 'montos' && suma !== monto) { err.textContent = 'Los montos suman ' + pesos(suma) + ' y el gasto es de ' + pesos(monto) + '.'; return; }
  }
  const id = form.getAttribute('data-id');
  const existente = id ? E.gastos.find((g) => g.id === id) : null;
  const g = existente || { id: nuevoId(), creado: new Date().toISOString() };
  const categoriaAntes = existente ? existente.categoriaId : null;
  g.monto = monto;
  g.fecha = deInputFechaHora(fd.get('fecha')).toISOString();
  g.comercio = String(fd.get('comercio') || '').trim() || 'Sin comercio';
  g.categoriaId = fd.get('categoriaId');
  g.tipo = fd.get('tipo');
  g.pagadorId = fd.get('pagadorId');
  g.reservaId = fd.get('reservaId') || null;
  g.reparto = { modo, participantes: ids, valores };
  g.nota = String(fd.get('nota') || '').trim();
  if (g.borrador) {
    delete g.borrador;
    const f = E.fijos.find((x) => x.id === g.fijoId);
    if (f) f.monto = monto; // el próximo borrador usa el último monto real
  }
  const ap = aprenderComercio(g.comercio !== 'Sin comercio' ? g.comercio : '', g.categoriaId, g.tipo);
  g.comercioId = ap.id;
  if (!existente) E.gastos.push(g);
  guardar();
  cerrarDialogo();
  render();
  if (ap.aprendio && (categoriaAntes !== g.categoriaId || !existente)) toast('Listo. La próxima vez "' + g.comercio + '" va a ' + cat(g.categoriaId).nombre + '.');
  else toast('Gasto guardado.');
}

function abrirAporte(tipo, id, retiro) {
  const destino = tipo === 'ahorro' ? E.ahorros.find((a) => a.id === id) : E.reservas.find((r) => r.id === id);
  if (!destino) return;
  abrirDialogo(`
    <h2>${retiro ? 'Retirar de' : 'Aportar a'} ${esc(destino.nombre)}</h2>
    <form data-form="aporte" data-tipo="${esc(tipo)}" data-id="${esc(id)}" data-retiro="${retiro ? '1' : ''}" class="formulario">
      <label>${retiro ? 'Quién retira' : 'Quién aporta'} <select name="participanteId">${opcParticipantes(E.usuarioActualId)}</select></label>
      <label>Monto <input name="monto" inputmode="decimal" required></label>
      <label>Fecha <input type="date" name="fecha" value="${esc(aInputFecha(new Date()))}" required></label>
      <p class="error" id="error-aporte" role="alert"></p>
      <div class="fila acciones"><button class="btn btn-primario">Guardar</button>
      <button type="button" class="btn" data-action="cerrar-dialogo">Cancelar</button></div>
    </form>`);
}

// ---------------------------------------------------------------- importar / exportar

function exportarCsv() {
  const filas = [['fecha', 'hora', 'monto', 'comercio', 'rubro', 'tipo', 'pagó', 'participantes', 'nota']];
  gastosReales().slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).forEach((g) => {
    filas.push([fecha(g.fecha), hora(g.fecha), centavosATexto(g.monto), g.comercio, cat(g.categoriaId).nombre, tipoNombre(g.tipo),
      nombrePart(g.pagadorId), ((g.reparto && g.reparto.participantes) || []).map(nombrePart).join(', '), g.nota || '']);
  });
  descargar('gastos-' + claveMes(new Date()) + '.csv', '﻿' + aCsv(filas), 'text/csv;charset=utf-8');
}

function importarCsv(texto) {
  const filas = deCsv(texto);
  if (filas.length < 2) throw new Error('El CSV está vacío.');
  const cab = filas[0].map((h) => normalizar(h));
  const col = (n) => cab.indexOf(n);
  const iF = col('fecha'); const iH = col('hora'); const iM = col('monto'); const iC = col('comercio');
  const iR = col('rubro'); const iT = col('tipo'); const iP = col('pago'); const iPs = col('participantes'); const iN = col('nota');
  if (iF < 0 || iM < 0) throw new Error('El CSV necesita al menos las columnas "fecha" y "monto".');
  const porNombre = (n) => E.participantes.find((p) => normalizar(p.nombre) === normalizar(n));
  let n = 0;
  let omitidos = 0;
  filas.slice(1).forEach((f) => {
    const monto = textoACentavos(f[iM]);
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(f[iF]).trim());
    if (!monto || !m) { omitidos++; return; }
    const hm = /^(\d{1,2}):(\d{2})/.exec(iH >= 0 ? String(f[iH]) : '') || [0, 12, 0];
    const d = new Date(+m[3], +m[2] - 1, +m[1], +hm[1], +hm[2]);
    let categoria = 'sin-clasificar';
    if (iR >= 0 && f[iR]) {
      let c = E.categorias.find((x) => normalizar(x.nombre) === normalizar(f[iR]));
      if (!c) { c = { id: nuevoId(), nombre: f[iR].trim(), icono: '🏷️', color: '#757575' }; E.categorias.push(c); }
      categoria = c.id;
    }
    const tipo = (TIPOS.find((t) => iT >= 0 && normalizar(t.nombre) === normalizar(f[iT])) || TIPOS[1]).id;
    const pagador = (iP >= 0 && porNombre(f[iP])) || part(E.usuarioActualId);
    let ids = iPs >= 0 ? String(f[iPs]).split(/[,|]/).map((x) => porNombre(x.trim())).filter(Boolean).map((p) => p.id) : [];
    if (!ids.length) ids = E.participantes.map((p) => p.id);
    const comercio = (iC >= 0 && f[iC].trim()) || 'Sin comercio';
    E.gastos.push({
      id: nuevoId(), monto, fecha: d.toISOString(), comercio, comercioId: aprenderComercio(comercio === 'Sin comercio' ? '' : comercio, categoria, tipo).id,
      categoriaId: categoria, tipo, pagadorId: pagador.id, reparto: { modo: 'iguales', participantes: ids, valores: {} },
      nota: iN >= 0 ? f[iN] || '' : '', creado: new Date().toISOString(),
    });
    n++;
  });
  return { n, omitidos };
}

function validarRespaldo(o) {
  const listas = ['participantes', 'categorias', 'comercios', 'gastos', 'pagos', 'fijos', 'ahorros', 'aportesAhorro', 'reservas', 'aportesReserva'];
  if (!o || typeof o !== 'object' || o.version !== 1) return false;
  return listas.every((k) => Array.isArray(o[k]));
}

// ---------------------------------------------------------------- eventos

function manejarClick(ev) {
  const el = ev.target.closest('[data-action]');
  if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'button')) return;
  const a = el.getAttribute('data-action');
  const id = el.getAttribute('data-id');
  const acciones = {
    'ob-agregar': () => {
      const inp = $('#ob-nombre');
      const casa = $('[name="casa"]');
      ui.onboarding.casa = casa ? casa.value : '';
      const nombre = inp.value.trim();
      if (!nombre) { inp.focus(); return; }
      ui.onboarding.participantes.push({ nombre, color: COLORES[ui.onboarding.participantes.length % COLORES.length] });
      render();
      $('#ob-nombre').focus();
    },
    'ob-quitar': () => {
      ui.onboarding.casa = $('[name="casa"]').value;
      ui.onboarding.participantes.splice(+el.getAttribute('data-i'), 1);
      render();
    },
    dictar: () => iniciarDictado(el),
    'nuevo-gasto': () => abrirFormGasto(null),
    'editar-gasto': () => abrirFormGasto(id),
    'cerrar-dialogo': cerrarDialogo,
    'cerrar-confirmacion': () => { ui.ultimoGastoId = null; render(); },
    deshacer: () => {
      E.gastos = E.gastos.filter((g) => g.id !== id);
      ui.ultimoGastoId = null;
      guardar(); render(); toast('Gasto eliminado.');
    },
    'borrar-gasto': () => {
      if (!confirm('¿Eliminar este gasto?')) return;
      E.gastos = E.gastos.filter((g) => g.id !== id);
      if (ui.ultimoGastoId === id) ui.ultimoGastoId = null;
      guardar(); cerrarDialogo(); render(); toast('Gasto eliminado.');
    },
    'confirmar-borrador': () => abrirFormGasto(id),
    'omitir-borrador': () => {
      if (!confirm('¿Omitir este gasto fijo por este mes?')) return;
      E.gastos = E.gastos.filter((g) => g.id !== id);
      guardar(); render();
    },
    saldar: () => {
      const de = el.getAttribute('data-de');
      const aId = el.getAttribute('data-a');
      const monto = +el.getAttribute('data-monto');
      if (!confirm(nombrePart(de) + ' le paga ' + pesos(monto) + ' a ' + nombrePart(aId) + '. ¿Registrar el pago?')) return;
      E.pagos.push({ id: nuevoId(), deId: de, aId, monto, fecha: new Date().toISOString() });
      guardar(); render(); toast('Pago registrado.');
    },
    'borrar-pago': () => {
      if (!confirm('¿Eliminar este pago?')) return;
      E.pagos = E.pagos.filter((p) => p.id !== id);
      guardar(); render();
    },
    'tab-ahorros': () => { ui.tabAhorros = el.getAttribute('data-tab'); render(); },
    aportar: () => abrirAporte(el.getAttribute('data-tipo'), id, false),
    retirar: () => abrirAporte('ahorro', id, true),
    'borrar-ahorro': () => {
      if (!confirm('¿Eliminar este ahorro y todos sus aportes?')) return;
      E.ahorros = E.ahorros.filter((x) => x.id !== id);
      E.aportesAhorro = E.aportesAhorro.filter((x) => x.ahorroId !== id);
      guardar(); render();
    },
    'pagar-reserva': () => {
      const r = E.reservas.find((x) => x.id === id);
      abrirFormGasto(null, { reservaId: id, comercio: r.nombre, categoriaId: r.categoriaId || 'otros', monto: Math.max(0, saldoReserva(r).disponible) || null });
    },
    'borrar-reserva': () => {
      if (!confirm('¿Eliminar esta reserva y sus aportes? Los gastos pagados con ella quedan, pero como pagados por quien figura en "Pagó".')) return;
      E.reservas = E.reservas.filter((x) => x.id !== id);
      E.aportesReserva = E.aportesReserva.filter((x) => x.reservaId !== id);
      E.gastos.forEach((g) => { if (g.reservaId === id) g.reservaId = null; });
      guardar(); render();
    },
    'borrar-participante': () => {
      if (!confirm('¿Eliminar a ' + nombrePart(id) + '?')) return;
      E.participantes = E.participantes.filter((p) => p.id !== id);
      if (E.usuarioActualId === id) E.usuarioActualId = E.participantes[0] ? E.participantes[0].id : null;
      guardar(); render();
    },
    'borrar-rubro': () => {
      const usos = E.gastos.filter((g) => g.categoriaId === id).length;
      if (!confirm(usos ? 'Hay ' + usos + ' gastos en este rubro. Pasan a "Otros". ¿Seguro?' : '¿Eliminar este rubro?')) return;
      E.gastos.forEach((g) => { if (g.categoriaId === id) g.categoriaId = 'otros'; });
      E.comercios.forEach((c) => { if (c.categoriaId === id) c.categoriaId = 'otros'; });
      E.fijos.forEach((f) => { if (f.categoriaId === id) f.categoriaId = 'otros'; });
      E.categorias = E.categorias.filter((c) => c.id !== id);
      guardar(); render();
    },
    'borrar-comercio': () => {
      if (!confirm('¿Eliminar este comercio del diccionario? Los gastos ya cargados no cambian.')) return;
      E.comercios = E.comercios.filter((c) => c.id !== id);
      E.gastos.forEach((g) => { if (g.comercioId === id) g.comercioId = null; });
      guardar(); render();
    },
    'borrar-fijo': () => {
      if (!confirm('¿Eliminar este gasto fijo? Los gastos ya confirmados quedan.')) return;
      E.fijos = E.fijos.filter((f) => f.id !== id);
      E.gastos = E.gastos.filter((g) => !(g.borrador && g.fijoId === id));
      guardar(); render();
    },
    'sumar-semilla': async () => {
      const s = await leerSemilla();
      let n = 0;
      (s.comercios || []).forEach((c) => {
        if (!buscarComercioPorNombre(c.nombre)) { E.comercios.push(Object.assign({ id: nuevoId(), alias: [] }, c)); n++; }
      });
      E.palabrasClave = Object.assign({}, s.palabrasClave || {}, E.palabrasClave);
      guardar(); render(); toast(n ? 'Se sumaron ' + n + ' comercios.' : 'No había comercios nuevos.');
    },
    'exportar-json': () => descargar('gastos-casa-respaldo-' + aInputFecha(new Date()) + '.json', JSON.stringify(E, null, 2), 'application/json'),
    'exportar-csv': exportarCsv,
    'borrar-todo': async () => {
      if (!confirm('Se borran TODOS los datos de este dispositivo. ¿Exportaste un respaldo?')) return;
      if (!confirm('¿Seguro? No se puede deshacer.')) return;
      E = estadoVacio(await leerSemilla());
      ui.onboarding = { participantes: [] };
      ui.ultimoGastoId = null;
      guardar(); irA('#/inicio');
    },
  };
  if (acciones[a]) { ev.preventDefault(); acciones[a](); }
}

function manejarSubmit(ev) {
  const form = ev.target;
  const tipo = form.getAttribute('data-form');
  if (!tipo) return;
  ev.preventDefault();
  const fd = new FormData(form);
  const id = form.getAttribute('data-id');
  const txt = (k) => String(fd.get(k) || '').trim();
  const formularios = {
    onboarding: () => {
      const casa = txt('casa');
      if (!casa || !ui.onboarding.participantes.length) return;
      E.casa = { nombre: casa, creada: new Date().toISOString() };
      E.participantes = ui.onboarding.participantes.map((p) => ({ id: nuevoId(), nombre: p.nombre, color: p.color }));
      E.usuarioActualId = E.participantes[+(fd.get('usuario') || 0)].id;
      ui.onboarding = { participantes: [] };
      guardar(); irA('#/inicio');
      toast('¡Listo! Ya podés cargar gastos.');
    },
    frase: () => {
      const t = txt('frase');
      if (!t) return;
      crearGastoDesdeFrase(t);
      const inp = $('#frase');
      if (inp) inp.value = '';
    },
    confirmacion: () => {},
    gasto: () => guardarFormGasto(form),
    aporte: () => {
      const monto = textoACentavos(txt('monto'));
      if (!monto || monto <= 0) { $('#error-aporte').textContent = 'Ingresá un monto válido.'; return; }
      const f = deInputFechaHora(txt('fecha')).toISOString();
      const signo = form.getAttribute('data-retiro') ? -1 : 1;
      if (form.getAttribute('data-tipo') === 'ahorro') E.aportesAhorro.push({ id: nuevoId(), ahorroId: id, participanteId: fd.get('participanteId'), monto: signo * monto, fecha: f });
      else E.aportesReserva.push({ id: nuevoId(), reservaId: id, participanteId: fd.get('participanteId'), monto, fecha: f });
      guardar(); cerrarDialogo(); render(); toast('Guardado.');
    },
    ahorro: () => {
      E.ahorros.push({ id: nuevoId(), nombre: txt('nombre'), objetivo: textoACentavos(txt('objetivo')) || 0, fecha: txt('fecha') ? deInputFechaHora(txt('fecha')).toISOString() : null });
      guardar(); render();
    },
    reserva: () => {
      const monto = textoACentavos(txt('monto'));
      if (!monto) return toast('Ingresá un monto válido.');
      E.reservas.push({ id: nuevoId(), nombre: txt('nombre'), monto, fecha: deInputFechaHora(txt('fecha')).toISOString(), categoriaId: fd.get('categoriaId') });
      guardar(); render();
    },
    participante: () => {
      const p = part(id);
      p.nombre = txt('nombre') || p.nombre;
      p.color = fd.get('color');
      guardar(); render(); toast('Guardado.');
    },
    'nuevo-participante': () => {
      E.participantes.push({ id: nuevoId(), nombre: txt('nombre'), color: COLORES[E.participantes.length % COLORES.length] });
      guardar(); render();
    },
    reparto: () => {
      const valores = {};
      E.participantes.forEach((p) => {
        const v = Number(txt('pct-' + p.id).replace(',', '.'));
        if (v > 0) valores[p.id] = v;
      });
      E.repartoDefault = { modo: fd.get('modo') === 'porcentaje' ? 'porcentaje' : 'iguales', valores };
      guardar(); render(); toast('Reparto guardado.');
    },
    rubro: () => {
      const c = E.categorias.find((x) => x.id === id);
      c.nombre = txt('nombre') || c.nombre; c.icono = txt('icono') || c.icono; c.color = fd.get('color') || c.color;
      guardar(); render(); toast('Guardado.');
    },
    'nuevo-rubro': () => {
      E.categorias.splice(E.categorias.length - 2, 0, { id: nuevoId(), nombre: txt('nombre'), icono: txt('icono') || '🏷️', color: COLORES[E.categorias.length % COLORES.length] });
      guardar(); render();
    },
    comercio: () => {
      const c = E.comercios.find((x) => x.id === id);
      c.nombre = txt('nombre') || c.nombre;
      c.categoriaId = fd.get('categoriaId');
      c.alias = txt('alias').split(',').map((s) => s.trim()).filter(Boolean);
      if (fd.get('tipo')) c.tipo = fd.get('tipo'); else delete c.tipo;
      guardar(); render(); toast('Comercio guardado.');
    },
    'nuevo-comercio': () => {
      if (buscarComercioPorNombre(txt('nombre'))) return toast('Ese comercio ya existe.');
      const c = { id: nuevoId(), nombre: txt('nombre'), alias: txt('alias').split(',').map((s) => s.trim()).filter(Boolean), categoriaId: fd.get('categoriaId') };
      if (fd.get('tipo')) c.tipo = fd.get('tipo');
      E.comercios.push(c);
      guardar(); render(); toast('Comercio agregado.');
    },
    fusionar: () => {
      const o = E.comercios.find((c) => c.id === fd.get('origen'));
      const d = E.comercios.find((c) => c.id === fd.get('destino'));
      if (!o || !d || o === d) return toast('Elegí dos comercios distintos.');
      d.alias = (d.alias || []).concat([o.nombre], o.alias || []).filter((x, i, arr) => arr.indexOf(x) === i);
      E.gastos.forEach((g) => { if (g.comercioId === o.id) { g.comercioId = d.id; g.comercio = d.nombre; } });
      E.comercios = E.comercios.filter((c) => c.id !== o.id);
      guardar(); render(); toast('"' + o.nombre + '" ahora es un alias de "' + d.nombre + '".');
    },
    fijo: () => {
      const monto = textoACentavos(txt('monto'));
      if (!monto) return toast('Ingresá un monto válido.');
      const existente = id ? E.fijos.find((f) => f.id === id) : null;
      const f = existente || { id: nuevoId(), ultimoMes: null };
      f.nombre = txt('nombre'); f.monto = monto; f.dia = Math.min(31, Math.max(1, +fd.get('dia') || 1));
      f.categoriaId = fd.get('categoriaId'); f.pagadorId = fd.get('pagadorId'); f.activo = fd.get('activo') === 'on';
      f.comercioId = aprenderComercio(f.nombre, f.categoriaId, 'fijo').id;
      if (!existente) E.fijos.push(f);
      generarBorradoresFijos();
      guardar(); render(); toast('Gasto fijo guardado.');
    },
  };
  if (formularios[tipo]) formularios[tipo]();
}

function manejarChange(ev) {
  const el = ev.target;
  const grupo = el.getAttribute('data-filtro');
  if (grupo) {
    const f = grupo === 'gastos' ? ui.filtrosGastos : ui.filtrosSaldos;
    f[el.name] = el.value;
    render();
    return;
  }
  const a = el.getAttribute('data-action');
  if (a === 'cambiar-usuario') { E.usuarioActualId = el.value; guardar(); toast('Ahora sos ' + nombrePart(el.value) + ' en este dispositivo.'); return; }
  if (a === 'tema') { E.tema = el.value; guardar(); aplicarTema(); return; }
  if (a === 'solo-sin-clasificar') { ui.soloSinClasificar = el.checked; render(); return; }
  if (a === 'importar') { importarArchivo(el); return; }
  if (a === 'modo-reparto') {
    const form = el.form;
    $$('.valor-reparto', form).forEach((i) => { i.hidden = el.value === 'iguales'; i.setAttribute('aria-label', (el.value === 'montos' ? 'Monto' : 'Porcentaje')); });
    return;
  }
  if (a === 'autoclasificar') {
    const r = clasificarTexto(el.value, E.comercios, E.palabrasClave);
    const form = el.form;
    if (r.categoriaId) form.elements.categoriaId.value = r.categoriaId;
    if (r.tipo) form.elements.tipo.value = r.tipo;
    return;
  }
  // Tarjeta de confirmación: cada cambio se guarda en el momento
  const form = el.form;
  if (form && form.getAttribute('data-form') === 'confirmacion') {
    const g = E.gastos.find((x) => x.id === form.getAttribute('data-id'));
    if (!g) return;
    if (el.name === 'monto') {
      const m = textoACentavos(el.value);
      if (m && m > 0) g.monto = m; else { toast('Monto inválido.'); el.value = centavosATexto(g.monto); return; }
    } else if (el.name === 'comercio') {
      g.comercio = el.value.trim() || 'Sin comercio';
      const r = clasificarTexto(g.comercio, E.comercios, E.palabrasClave);
      g.categoriaId = r.categoriaId || 'sin-clasificar';
      if (r.tipo) g.tipo = r.tipo;
      g.comercioId = r.comercio ? r.comercio.id : aprenderComercio(g.comercio, g.categoriaId, g.tipo).id;
      if (r.comercio) g.comercio = r.comercio.nombre;
    } else if (el.name === 'categoriaId') {
      g.categoriaId = el.value;
      const ap = aprenderComercio(g.comercio !== 'Sin comercio' ? g.comercio : '', g.categoriaId, g.tipo);
      g.comercioId = ap.id;
      if (ap.aprendio) toast('Listo. La próxima vez "' + g.comercio + '" va a ' + cat(g.categoriaId).nombre + '.');
    } else if (el.name === 'pagadorId') {
      g.pagadorId = el.value;
    }
    guardar();
    render();
  }
}

function manejarInput(ev) {
  const el = ev.target;
  if (el.getAttribute('data-action') === 'buscar-comercio') {
    ui.buscarComercio = el.value;
    const pos = el.selectionStart;
    render();
    const nuevo = $('[data-action="buscar-comercio"]');
    if (nuevo) { nuevo.focus(); try { nuevo.setSelectionRange(pos, pos); } catch (e) { /* type=search en algunos navegadores */ } }
  }
}

async function importarArchivo(input) {
  const archivo = input.files && input.files[0];
  input.value = '';
  if (!archivo) return;
  try {
    const texto = await archivo.text();
    if (/\.json$/i.test(archivo.name) || texto.trim().charAt(0) === '{') {
      const o = JSON.parse(texto);
      if (!validarRespaldo(o)) throw new Error('El archivo no es un respaldo válido de Gastos de la Casa.');
      if (!confirm('Esto reemplaza todos los datos de este dispositivo por los del archivo. ¿Seguir?')) return;
      E = o;
      if (!part(E.usuarioActualId) && E.participantes[0]) E.usuarioActualId = E.participantes[0].id;
      guardar(); irA('#/inicio'); toast('Respaldo importado.');
    } else {
      const r = importarCsv(texto);
      guardar(); render(); toast('Se importaron ' + r.n + ' gastos' + (r.omitidos ? ' (' + r.omitidos + ' filas omitidas)' : '') + '.');
    }
  } catch (e) {
    alert('No se pudo importar: ' + e.message);
  }
}

function iniciarDictado(boton) {
  if (ui.cancelarVoz) { ui.cancelarVoz(); return; }
  const estado = $('#estado-voz');
  const campo = $('#frase');
  boton.classList.add('escuchando');
  boton.setAttribute('aria-label', 'Detener dictado');
  estado.textContent = 'Escuchando… decí el gasto.';
  ui.cancelarVoz = escuchar({
    onParcial: (t) => { campo.value = t; },
    onFinal: (t) => { campo.value = t; crearGastoDesdeFrase(t); },
    onError: (m) => { estado.textContent = m; },
    onFin: () => {
      ui.cancelarVoz = null;
      const b = $('[data-action="dictar"]');
      if (b) { b.classList.remove('escuchando'); b.setAttribute('aria-label', 'Dictar gasto por voz'); }
    },
  });
}

function actualizarDatalist() {
  $('#lista-comercios').innerHTML = E.comercios.map((c) => `<option value="${esc(c.nombre)}"></option>`).join('');
}

// ---------------------------------------------------------------- arranque

async function iniciar() {
  let guardado = await store.cargar();
  if (!guardado || guardado.version !== 1) guardado = estadoVacio(await leerSemilla());
  E = guardado;
  store.pedirPersistencia();
  generarBorradoresFijos();

  document.addEventListener('click', manejarClick);
  document.addEventListener('submit', manejarSubmit);
  document.addEventListener('change', manejarChange);
  document.addEventListener('input', manejarInput);
  document.addEventListener('keydown', (ev) => {
    // En el onboarding, Enter en el nombre agrega al participante en vez de enviar el formulario.
    if (ev.key === 'Enter' && ev.target.id === 'ob-nombre') {
      ev.preventDefault();
      const b = $('[data-action="ob-agregar"]');
      if (b) b.click();
    }
  });
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') store.vaciar(); else { generarBorradoresFijos(); } });
  window.addEventListener('pagehide', store.vaciar);
  $('#dialogo').addEventListener('click', (ev) => { if (ev.target.id === 'dialogo') cerrarDialogo(); });
  $('#dialogo').addEventListener('close', alCerrarDialogo);

  render();
  document.documentElement.classList.add('lista');

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* la app funciona igual sin SW */ });
  }
}

iniciar();
