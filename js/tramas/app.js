/* Tramas · arranque
   Une el modelo con el tablero, autoguarda en localStorage, abre y guarda archivos .json
   (con los diálogos nativos si corre en Electron) y expone `Tramas.document`, la misma API que
   `Ed.document` en el editor, para que un gestor de documentos pueda integrar el tablero sin
   tocar el DOM. */
(function (T) {
  const CLAVE = 'guiones.tramas.doc', CLAVE_VISTA = 'guiones.tramas.vista';
  /* Versión del formato guardado. Un guardado sin esta marca (o con otra) es de antes de que
     existiera el tablero de partida y se descarta: así nadie se queda con el tablero de ejemplo. */
  const FORMATO = 1;
  const $ = id => document.getElementById(id);

  /* ---------- almacenamiento local (provisional: el gestor de documentos lo sustituirá) ---------- */
  function leerGuardado() {
    try {
      const raw = localStorage.getItem(CLAVE); if (!raw) return null;
      const d = JSON.parse(raw);
      return d && d.formato === FORMATO && Array.isArray(d.lineas) ? d : null;
    } catch (_) { return null; }
  }
  function guardarLocal(datos) {
    try { localStorage.setItem(CLAVE, JSON.stringify(Object.assign({ formato: FORMATO }, datos))); return true; } catch (_) { return false; }
  }
  function leerVista() {
    try { return JSON.parse(localStorage.getItem(CLAVE_VISTA) || '{}'); } catch (_) { return {}; }
  }

  /* ---------- documento: sucio, cambios y escuchas ---------- */
  let cargado = '', oyentes = [], temporizador = null;
  const modelo = new T.Modelo(leerGuardado() || T.inicial());
  const vista = leerVista();

  function marcarGuardado(texto) {
    const e = $('estadoGuardado'); if (e) e.textContent = texto;
  }
  function alCambiar() {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      const datos = modelo.toJSON();
      marcarGuardado(guardarLocal(datos) ? 'Guardado' : 'Sin guardar');
      oyentes.forEach(fn => { try { fn(datos); } catch (err) { console.error(err); } });
    }, 300);
  }

  T.document = {
    get: () => modelo.toJSON(),
    set: datos => { T.tablero.cargar(datos); cargado = JSON.stringify(modelo.datos); guardarLocal(modelo.datos); },
    isDirty: () => JSON.stringify(modelo.datos) !== cargado,
    onChange: fn => { oyentes.push(fn); return () => { oyentes = oyentes.filter(x => x !== fn); }; }
  };

  /* ---------- arranque ---------- */
  T.tablero.iniciar({ modelo, alCambiar, zoom: vista.zoom });
  cargado = JSON.stringify(modelo.datos);
  if (!leerGuardado()) guardarLocal(modelo.datos);
  marcarGuardado('Guardado');

  const zoom = $('zoom');
  if (zoom) {
    zoom.value = T.tablero.zoom();
    zoom.oninput = e => {
      T.tablero.zoom(+e.target.value);
      try { localStorage.setItem(CLAVE_VISTA, JSON.stringify({ zoom: +e.target.value })); } catch (_) {}
    };
  }

  /* ---------- tema ----------
     Mismo atributo que el editor (html[data-theme]). Se lee la preferencia propia, si no la del
     editor, y si no la del sistema; se guarda solo la propia. El CSS pinta todo con variables, así
     que no hace falta redibujar. */
  const CLAVE_TEMA = 'guiones.tramas.theme';
  const esOscuro = () => document.documentElement.dataset.theme === 'dark';
  function aplicarTema(oscuro) {
    document.documentElement.dataset.theme = oscuro ? 'dark' : 'light';
    const b = $('temaBtn');
    if (b) { b.textContent = oscuro ? '◐ Claro' : '◑ Oscuro'; b.classList.toggle('on', oscuro); }
  }
  aplicarTema(esOscuro());                                       // el <head> ya lo decidió; solo el botón
  $('temaBtn').onclick = () => {
    aplicarTema(!esOscuro());
    try { localStorage.setItem(CLAVE_TEMA, esOscuro() ? 'dark' : 'light'); } catch (_) {}
  };

  /* ---------- archivos ---------- */
  const api = window.editorAPI;                                  // puente de Electron, si existe
  const FILTROS = [{ name: 'Tablero de tramas', extensions: ['json'] }];

  async function guardarArchivo() {
    const contenido = JSON.stringify(Object.assign({ formato: FORMATO }, modelo.toJSON()), null, 2);
    if (api && api.saveFile) {
      const ruta = await api.saveFile({ defaultPath: 'tramas.json', content: contenido, filters: FILTROS });
      if (ruta) T.tablero.avisar('Guardado en ' + ruta.split('/').pop());
      return;
    }
    const blob = new Blob([contenido], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'tramas.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function cargarTexto(texto, nombre) {
    let datos;
    try { datos = JSON.parse(texto); } catch (_) { return T.tablero.avisar('Ese archivo no es un tablero válido'); }
    if (!datos || typeof datos !== 'object' || !Array.isArray(datos.lineas))
      return T.tablero.avisar('Ese archivo no es un tablero válido');
    T.document.set(datos);
    T.tablero.avisar('Abierto ' + (nombre || 'el tablero'));
  }

  async function abrirArchivo() {
    if (api && api.openFile) {
      const r = await api.openFile({ filters: FILTROS });
      if (r) cargarTexto(r.content, r.name);
      return;
    }
    $('archivo').value = ''; $('archivo').click();
  }
  $('archivo').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    f.text().then(t => cargarTexto(t, f.name));
  });

  $('btnGuardar').onclick = guardarArchivo;
  $('btnAbrir').onclick = abrirArchivo;
  $('btnNuevo').onclick = async () => {
    if (!await T.tablero.confirmar('¿Empezar un tablero nuevo? El actual se pierde si no lo has guardado con Guardar…', 'Empezar de nuevo')) return;
    T.document.set(T.inicial());
    T.tablero.avisar('Tablero nuevo');
  };

  document.addEventListener('keydown', e => {
    const cmd = e.metaKey || e.ctrlKey;
    if (cmd && e.key.toLowerCase() === 's') { e.preventDefault(); guardarArchivo(); }
    if (cmd && e.key.toLowerCase() === 'o') { e.preventDefault(); abrirArchivo(); }
  });
})(window.Tramas);
