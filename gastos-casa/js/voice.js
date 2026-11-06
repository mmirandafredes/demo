// Dictado con la Web Speech API del navegador (en Chrome/Android usa el reconocimiento de Google).
// Este módulo solo convierte voz en texto; la interpretación la hace parser.js.
// Si el navegador no la tiene (Firefox, algunos modos de iOS), la app usa el campo de texto
// y el micrófono del teclado del celular.

export function vozDisponible() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Empieza a escuchar. Devuelve una función para cancelar.
 * @param {{onParcial(texto), onFinal(texto), onError(mensaje), onFin()}} cb
 */
export function escuchar(cb) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR();
  rec.lang = 'es-AR';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let final = '';
  let terminado = false;
  rec.onresult = (ev) => {
    let parcial = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) final += r[0].transcript;
      else parcial += r[0].transcript;
    }
    if (cb.onParcial) cb.onParcial((final + ' ' + parcial).trim());
  };
  rec.onerror = (ev) => {
    const mensajes = {
      'not-allowed': 'No hay permiso para usar el micrófono. Habilitalo en la configuración del navegador.',
      'service-not-allowed': 'El navegador no permite el dictado acá. Usá el micrófono del teclado.',
      'no-speech': 'No se escuchó nada. Probá de nuevo.',
      'network': 'El dictado necesita conexión. Sin internet, usá el micrófono del teclado o escribí.',
      'audio-capture': 'No se encontró un micrófono.',
      'aborted': '',
    };
    const m = ev.error in mensajes ? mensajes[ev.error] : 'No se pudo usar el dictado (' + ev.error + ').';
    if (m && cb.onError) cb.onError(m);
  };
  rec.onend = () => {
    if (terminado) return;
    terminado = true;
    if (final.trim() && cb.onFinal) cb.onFinal(final.trim());
    if (cb.onFin) cb.onFin();
  };
  try {
    rec.start();
  } catch (e) {
    if (cb.onError) cb.onError('No se pudo iniciar el dictado.');
    if (cb.onFin) cb.onFin();
  }
  return () => { try { rec.stop(); } catch (e) { /* ya terminado */ } };
}
