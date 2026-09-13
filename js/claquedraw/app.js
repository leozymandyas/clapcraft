/* Claquedraw · arranque
   Une el guion (un esquema de pasos de Tramas más las notas del editor, guardado en la biblioteca)
   con las dos vistas: el tablero y el texto (js/claquedraw/texto.js). Solo hay un guion abierto; la
   biblioteca lo autoguarda en localStorage con sus notas.

   Archivos (.cld, JSON dentro): «Guardar como…» elige el archivo y, desde entonces, cada cambio se
   escribe ahí solo (con 1 s de espera); «Abrir…» hace lo mismo con un archivo existente; «Guardar»
   escribe ya, o pide archivo si no lo hay. En Electron el archivo es una ruta (puente window.editorAPI);
   en Chrome/Edge un FileSystemFileHandle (que se guarda en IndexedDB y al volver pide permiso con el
   primer «Guardar»); en otros navegadores solo hay descarga. El indicador de la cabecera dice dónde
   está el guion y si hay cambios sin escribir. «Nuevo» empieza otro guion y lo desvincula del archivo.
   Reutiliza js/tramas/modelo.js y js/tramas/tablero.js sin tocarlos; no carga js/tramas/app.js. */
(function (C, T) {
  const CLAVE = 'guiones.claquedraw.biblioteca', CLAVE_VISTA = 'guiones.claquedraw.vista';
  const CLAVE_TEMA = 'guiones.tramas.theme', CLAVE_TRAMAS = 'guiones.tramas.doc';
  const FORMATO_TABLERO = 1;                                   // el mismo que escribe tramas.html
  const EXT = 'cld';
  const $ = id => document.getElementById(id);

  /* ---------- almacenamiento local ---------- */
  function leerJSON(clave) {
    try { const raw = localStorage.getItem(clave); return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
  }
  function escribirJSON(clave, valor) {
    try { localStorage.setItem(clave, JSON.stringify(valor)); return true; } catch (_) { return false; }
  }
  const vista = Object.assign({ zoom: 1.7, modo: 'esquema', cabecera: 'tira', tramasPlegadas: false, gutter: 190, archivo: null }, leerJSON(CLAVE_VISTA) || {});
  const guardarVista = () => escribirJSON(CLAVE_VISTA, vista);

  /* ---------- biblioteca: el guion abierto es su activo ---------- */
  const biblioteca = new C.Biblioteca(leerJSON(CLAVE));
  if (!biblioteca.total()) {
    /* Primer arranque: si tramas.html dejó un tablero, se hereda (sin borrarlo). */
    const previo = leerJSON(CLAVE_TRAMAS);
    biblioteca.crear({ datos: C.esTablero(previo) && previo.formato === FORMATO_TABLERO ? previo : T.inicial() });
  }
  let localOk = true;
  function persistir() {
    localOk = escribirJSON(CLAVE, biblioteca.toJSON());
    programarEscritura();
    indicador();
  }

  /* ---------- tablero: un solo modelo, se vuelca en el guion abierto ---------- */
  const datosDe = g => (g && g.datos) || T.inicial();
  let abiertoId = null;                                        // guion montado en el tablero
  let temporizador = null;
  const modelo = new T.Modelo(datosDe(biblioteca.activo()));

  function volcar() {
    clearTimeout(temporizador); temporizador = null;
    if (abiertoId && biblioteca.guion(abiertoId)) biblioteca.guardarDatos(abiertoId, modelo.toJSON());
    persistir();
  }
  function alCambiar() {
    clearTimeout(temporizador);
    temporizador = setTimeout(volcar, 300);
  }

  /* Monta un guion en el tablero (volcando antes el que estaba, tablero y nota). */
  function montar(id) {
    if (temporizador) volcar();
    C.texto.cerrar();
    const g = biblioteca.guion(id);
    abiertoId = g ? g.id : null;
    if (g) biblioteca.activar(g.id);
    T.tablero.cargar(datosDe(g));
    document.title = (g ? g.nombre + ' · ' : '') + 'Claquedraw';
    persistir();
    if (g && vista.modo === 'texto') C.texto.abrir();
  }

  /* Sustituye el guion abierto por otro: el anterior sale de la biblioteca (ya no hay lista). */
  function reemplazar(opciones) {
    if (temporizador) volcar();
    C.texto.volcar();
    /* el anterior se quita antes de crear: si no, el nombre del nuevo chocaría con el suyo
       («prueba» → «prueba 2» al abrir prueba.cld dos veces) */
    const copia = biblioteca.toJSON();
    if (abiertoId) biblioteca.eliminar(abiertoId);
    const r = biblioteca.crear(opciones);
    if (!r.ok) { biblioteca.cargar(copia); return r; }
    montar(r.guion.id);
    return r;
  }

  /* ---------- archivo .cld ---------- */
  const api = window.editorAPI;                                // puente de Electron, si existe
  const FILTROS = [{ name: 'Guion de Claquedraw', extensions: [EXT, 'json'] }];
  const TIPOS = [{ description: 'Guion de Claquedraw', accept: { 'application/json': ['.' + EXT] } }];
  const nombreArchivo = n => (String(n).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'guion') + '.' + EXT;
  const sinExtension = n => String(n || '').replace(/\.(cld|json)$/i, '');
  /* Lo que va al archivo: un tablero de Tramas con `nombre` y las `notas`; tramas.html ignora esos dos. */
  const serializar = g => JSON.stringify(Object.assign({ formato: FORMATO_TABLERO, nombre: g.nombre }, datosDe(g), { notas: g.notas }), null, 2);

  let archivo = null;             // { nombre, ruta? (Electron), handle? (navegador), permiso: bool }
  let ultimoEscrito = null;       // contenido tal como quedó en el archivo
  let escritura = null;           // temporizador del autoguardado al archivo
  let escribiendo = false;

  /* Los FileSystemFileHandle sobreviven a la recarga en IndexedDB (localStorage no los admite). */
  const idb = {
    abrir: () => new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('sin IndexedDB'));
      const r = indexedDB.open('guiones.claquedraw', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }),
    get: async k => { const db = await idb.abrir(); return new Promise((res, rej) => { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); },
    set: async (k, v) => { const db = await idb.abrir(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); t.onsuccess = () => res(); t.onerror = () => rej(t.error); }); },
    del: async k => { const db = await idb.abrir(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite').objectStore('kv').delete(k); t.onsuccess = () => res(); t.onerror = () => rej(t.error); }); }
  };

  const sucio = () => { const g = biblioteca.guion(abiertoId); return !!(archivo && g && serializar(g) !== ultimoEscrito); };

  function indicador() {
    const e = $('estadoGuardado'); if (!e) return;
    let texto, pista, clase = '';
    if (!localOk) { texto = 'Sin guardar'; pista = 'No se pudo guardar en este navegador'; clase = 'sucio'; }
    else if (!archivo) { texto = 'Solo en este navegador'; pista = 'Guarda como archivo (.cld) y a partir de ahí se irá guardando solo'; }
    else if (archivo.permiso === false) { texto = '● ' + archivo.nombre + ' · reconectar'; pista = 'Pulsa Guardar para volver a escribir en el archivo'; clase = 'sucio'; }
    else if (sucio()) { texto = '● ' + archivo.nombre; pista = 'Cambios sin escribir en el archivo (se guardan solos en un momento)'; clase = 'sucio'; }
    else { texto = '✓ ' + archivo.nombre; pista = 'Guardado en ' + (archivo.ruta || archivo.nombre); }
    e.textContent = texto; e.title = pista; e.className = 'estado ' + clase;
  }

  function vincular(a) {
    archivo = Object.assign({ permiso: true }, a);
    ultimoEscrito = null;          // archivo nuevo: aún no tiene nada, aunque el contenido no haya cambiado
    vista.archivo = { nombre: archivo.nombre, ruta: archivo.ruta || null }; guardarVista();
    if (archivo.handle) idb.set('archivo', archivo.handle).catch(() => {});
    else idb.del('archivo').catch(() => {});
    indicador();
  }
  function desvincular() {
    archivo = null; ultimoEscrito = null;
    vista.archivo = null; guardarVista();
    idb.del('archivo').catch(() => {});
    indicador();
  }

  function programarEscritura() {
    if (!archivo || archivo.permiso === false) return;
    clearTimeout(escritura);
    escritura = setTimeout(() => escribirArchivo(), 1000);
  }

  /* Escribe el guion en su archivo si cambió. Devuelve si quedó escrito. */
  async function escribirArchivo() {
    clearTimeout(escritura); escritura = null;
    const g = biblioteca.guion(abiertoId);
    if (!archivo || !g || escribiendo) return false;
    const contenido = serializar(g);
    if (contenido === ultimoEscrito) { indicador(); return true; }
    escribiendo = true;
    try {
      if (archivo.ruta && api && api.writeFile) {
        await api.writeFile({ path: archivo.ruta, content: contenido });
      } else if (archivo.handle) {
        await escribirHandle(archivo.handle, contenido);
      } else return false;
      ultimoEscrito = contenido; archivo.permiso = true;
      return true;
    } catch (err) {
      console.error('Claquedraw · no se pudo escribir en ' + archivo.nombre, err);
      archivo.permiso = false;
      T.tablero.avisar('No se pudo escribir en ' + archivo.nombre + ' · pulsa Guardar para reintentar');
      return false;
    } finally { escribiendo = false; indicador(); }
  }

  /* Escribe en un FileSystemFileHandle y comprueba releyendo: en algunos entornos (navegadores
     embebidos) el sistema deja elegir el archivo pero no escribirlo, y no siempre lo dice. */
  async function escribirHandle(h, contenido) {
    if (h.queryPermission && h.requestPermission) {
      try { if (await h.queryPermission({ mode: 'readwrite' }) !== 'granted') await h.requestPermission({ mode: 'readwrite' }); } catch (_) {}
    }
    const w = await h.createWritable();
    await w.write(contenido); await w.close();
    const leido = await (await h.getFile()).text();
    if (leido !== contenido) throw new Error('el archivo no quedó escrito (' + leido.length + ' de ' + contenido.length + ' caracteres)');
  }

  const descargar = (contenido, nombre) => {
    const blob = new Blob([contenido], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  /* «Guardar como…»: elige archivo, escribe y deja el guion vinculado a él. */
  async function guardarComo() {
    const g = biblioteca.guion(abiertoId); if (!g) return;
    volcar(); C.texto.volcar();
    /* nombre propuesto: «Esquema», no el nombre automático del guion (Leo, 13-09-2026) */
    const contenido = serializar(g), sugerido = 'Esquema.' + EXT;
    if (api && api.saveFile) {
      const ruta = await api.saveFile({ defaultPath: sugerido, content: contenido, filters: FILTROS });
      if (!ruta) return;
      vincular({ nombre: ruta.split(/[\\/]/).pop(), ruta });
      ultimoEscrito = contenido;
    } else if (window.showSaveFilePicker) {
      let h;
      try { h = await window.showSaveFilePicker({ suggestedName: sugerido, types: TIPOS }); }
      catch (err) { if (err.name !== 'AbortError') T.tablero.avisar('No se pudo elegir el archivo'); return; }
      vincular({ nombre: h.name, handle: h });
      if (!await escribirArchivo()) {
        /* el sistema dejó elegir el archivo pero no escribirlo: que no quede un .cld vacío sin aviso */
        desvincular();
        descargar(contenido, h.name);
        T.tablero.avisar('Aquí no se puede escribir en ' + h.name + ': se descarga una copia. Prueba en Chrome, Edge o la app de escritorio');
        return;
      }
    } else {
      descargar(contenido, sugerido);
      T.tablero.avisar('Descargado ' + sugerido + ' · este navegador no puede seguir guardando ahí solo');
      return;
    }
    const base = sinExtension(archivo.nombre);
    if (base && base !== g.nombre) { biblioteca.renombrar(g.id, base); document.title = g.nombre + ' · Claquedraw'; ultimoEscrito = null; await escribirArchivo(); }
    persistir();
    T.tablero.avisar('Guardado en ' + archivo.nombre + ' · se seguirá guardando ahí solo');
  }

  /* «Guardar»: escribe ya en el archivo (reconectando si hace falta) o pide uno. */
  async function guardar() {
    if (!archivo) return guardarComo();
    if (archivo.permiso === false && archivo.handle) {
      let p = 'denied';
      try { p = await archivo.handle.requestPermission({ mode: 'readwrite' }); } catch (_) {}
      if (p !== 'granted') { T.tablero.avisar('Sin permiso para escribir en ' + archivo.nombre + ' · usa Guardar como…'); return; }
      archivo.permiso = true;
    }
    volcar(); C.texto.volcar();
    if (await escribirArchivo()) T.tablero.avisar('Guardado en ' + archivo.nombre);
  }

  /* Carga el texto de un archivo como guion nuevo; devuelve el guion o null. */
  function cargarTexto(texto, nombre) {
    let datos;
    try { datos = JSON.parse(texto); } catch (_) { datos = null; }
    if (!C.esTablero(datos)) { T.tablero.avisar('Ese archivo no es un guion válido'); return null; }
    const base = sinExtension(nombre) || (typeof datos.nombre === 'string' && datos.nombre.trim()) || '';
    desvincular();
    const r = reemplazar({ nombre: base, datos, notas: datos.notas });
    if (!r.ok) { T.tablero.avisar(r.aviso); return null; }
    return r.guion;
  }
  async function abrirArchivo() {
    if (api && api.openFile) {
      const r = await api.openFile({ filters: FILTROS });
      if (!r) return;
      const g = cargarTexto(r.content, r.name); if (!g) return;
      vincular({ nombre: r.name, ruta: r.path }); ultimoEscrito = serializar(g); indicador();
      T.tablero.avisar('Abierto ' + r.name + ' · se irá guardando ahí solo');
      return;
    }
    if (window.showOpenFilePicker) {
      let h;
      try { [h] = await window.showOpenFilePicker({ types: TIPOS, multiple: false }); }
      catch (err) { if (err.name !== 'AbortError') T.tablero.avisar('No se pudo abrir el archivo'); return; }
      const f = await h.getFile();
      const g = cargarTexto(await f.text(), f.name); if (!g) return;
      vincular({ nombre: h.name, handle: h }); ultimoEscrito = serializar(g); indicador();
      T.tablero.avisar('Abierto ' + h.name + ' · se irá guardando ahí solo');
      return;
    }
    $('archivo').value = ''; $('archivo').click();            // sin acceso a archivos: solo lectura
  }
  $('archivo').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    f.text().then(t => { const g = cargarTexto(t, f.name); if (g) T.tablero.avisar('Abierto ' + f.name + ' · este navegador no puede guardar ahí solo'); });
  });
  /* En la app de escritorio, un .cld abierto desde el Finder llega con su ruta y queda vinculado */
  if (api && api.onAbrirRuta && api.readFile) api.onAbrirRuta(async ruta => {
    let texto;
    try { texto = await api.readFile({ path: ruta }); } catch (_) { return T.tablero.avisar('No se pudo leer ' + ruta); }
    const nombre = ruta.split(/[\\/]/).pop();
    const g = cargarTexto(texto, nombre); if (!g) return;
    vincular({ nombre, ruta }); ultimoEscrito = serializar(g); indicador();
    T.tablero.avisar('Abierto ' + nombre + ' · se irá guardando ahí solo');
  });

  async function nuevo() {
    if (!await T.tablero.confirmar('¿Empezar un guion nuevo? El actual (esquema y notas) se pierde si no está guardado en un archivo.', 'Empezar de nuevo')) return;
    desvincular();
    reemplazar({ datos: T.inicial() });
    T.tablero.avisar('Guion nuevo');
  }

  /* Al arrancar, si había un archivo vinculado se retoma: en Electron por su ruta; en el navegador
     con el handle guardado, que puede exigir permiso otra vez (lo pide el primer «Guardar»). */
  async function retomarArchivo() {
    if (!vista.archivo) return;
    if (vista.archivo.ruta && api && api.writeFile) {
      archivo = { nombre: vista.archivo.nombre, ruta: vista.archivo.ruta, permiso: true };
      if (api.readFile) {
        try { ultimoEscrito = await api.readFile({ path: archivo.ruta }); } catch (_) { archivo.permiso = false; }
      }
    } else if (!vista.archivo.ruta) {
      let h = null;
      try { h = await idb.get('archivo'); } catch (_) {}
      if (!h) {
        const nombre = vista.archivo.nombre;
        vista.archivo = null; guardarVista(); indicador();
        T.tablero.avisar('No se pudo recuperar ' + nombre + ': vuelve a elegirlo con Abrir… o Guardar como…');
        return;
      }
      archivo = { nombre: h.name || vista.archivo.nombre, handle: h, permiso: false };
      try {
        if (await h.queryPermission({ mode: 'readwrite' }) === 'granted') {
          archivo.permiso = true;
          ultimoEscrito = await (await h.getFile()).text();
        }
      } catch (_) {}
    } else { vista.archivo = null; guardarVista(); }
    indicador();
    if (archivo && archivo.permiso) programarEscritura();     // lo local es lo último: si difiere, se escribe
  }

  /* ---------- arranque ---------- */
  T.tablero.iniciar({ modelo, alCambiar, zoom: vista.zoom });
  abiertoId = biblioteca.activo() ? biblioteca.activo().id : null;
  document.title = (abiertoId ? biblioteca.activo().nombre + ' · ' : '') + 'Claquedraw';
  persistir();
  retomarArchivo();

  /* ---------- tema (igual que tramas.html: mismo atributo y misma clave) ---------- */
  const esOscuro = () => document.documentElement.dataset.theme === 'dark';
  function aplicarTema(oscuro) {
    document.documentElement.dataset.theme = oscuro ? 'dark' : 'light';
    const b = $('temaBtn');
    if (b) { b.textContent = oscuro ? '◐ Claro' : '◑ Oscuro'; b.classList.toggle('on', oscuro); }
  }
  const guardarTema = () => { try { localStorage.setItem(CLAVE_TEMA, esOscuro() ? 'dark' : 'light'); } catch (_) {} };
  aplicarTema(esOscuro());
  $('temaBtn').onclick = () => {
    aplicarTema(!esOscuro());
    C.texto.tema(esOscuro());                                  // el editor del marco va a la par
    guardarTema();
  };

  /* ---------- vistas: esquema de pasos / texto ----------
     La vista de texto (js/claquedraw/texto.js) mete index.html en un marco y enseña, encima de su
     cinta, la tira de la trama: una nota por nodo. Al volver al esquema se selecciona en el tablero el
     nodo de la nota abierta, y se pinta de nuevo por si el título cambió desde el editor. */
  C.texto.iniciar({
    marco: $('editorMarco'), tira: $('hilo'), seccion: $('texto'), tip: $('tip'), biblioteca,
    modelo: () => modelo, guion: () => biblioteca.guion(abiertoId),
    guardar: persistir, alCambiarTablero: alCambiar, avisar: T.tablero.avisar, vista, guardarVista,
    alternar: () => verVista(vista.modo === 'texto' ? 'esquema' : 'texto'),
    alTema: oscuro => { if (oscuro !== esOscuro()) { aplicarTema(oscuro); guardarTema(); } }
  });

  /* ---------- columna de tramas: ancho a gusto y contraída ----------
     El ancho lo lleva el tablero (T.tablero.gutter → --gutter); el asa #asaTramas se arrastra sobre
     el borde derecho de la columna. Contraída es solo CSS (body.tramas-plegadas desplaza el lienzo y
     deja el chip de color); la geometría del tablero no cambia. */
  T.tablero.gutter(vista.gutter);
  function aplicarTramas() {
    document.body.classList.toggle('tramas-plegadas', !!vista.tramasPlegadas);
    const b = $('plegarTramas');
    if (b) { b.textContent = vista.tramasPlegadas ? '›' : '‹'; b.title = vista.tramasPlegadas ? 'Desplegar la columna de tramas' : 'Contraer la columna de tramas'; }
  }
  $('plegarTramas').addEventListener('click', e => {
    e.stopPropagation();                                       // que el tablero no lo tome por un clic en blanco
    vista.tramasPlegadas = !vista.tramasPlegadas; guardarVista(); aplicarTramas();
  });
  aplicarTramas();
  (function () {
    const asa = $('asaTramas'); if (!asa) return;
    let arrastre = null;
    asa.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      arrastre = { x0: e.clientX, g0: T.tablero.gutter() };
      asa.classList.add('activa');
      try { asa.setPointerCapture(e.pointerId); } catch (_) {}
    });
    asa.addEventListener('pointermove', e => {
      if (!arrastre) return;
      e.stopPropagation();
      T.tablero.gutter(arrastre.g0 + e.clientX - arrastre.x0);
    });
    const soltar = e => {
      if (!arrastre) return;
      e.stopPropagation(); arrastre = null; asa.classList.remove('activa');
      vista.gutter = T.tablero.gutter(); guardarVista();
    };
    asa.addEventListener('pointerup', soltar);
    asa.addEventListener('pointercancel', soltar);
    asa.addEventListener('dblclick', e => { e.stopPropagation(); T.tablero.gutter(190); vista.gutter = 190; guardarVista(); });
    asa.addEventListener('click', e => e.stopPropagation());
  })();

  /* Selecciona un nodo en el tablero desde fuera: su panel obedece a cualquier [data-hilo] (las
     flechas ‹ ›), así que basta con un botón efímero que lleve el id. */
  function seleccionarEnTablero(id) {
    if (!modelo.punto(id)) return;
    const b = document.createElement('button'); b.dataset.hilo = id; b.hidden = true;
    document.body.appendChild(b); b.click(); b.remove();
  }

  function verVista(modo, puntoId) {
    modo = modo === 'texto' ? 'texto' : 'esquema';
    const cambia = modo !== vista.modo;
    vista.modo = modo; guardarVista();
    document.body.classList.toggle('vista-texto', modo === 'texto');
    document.querySelectorAll('[data-vista]').forEach(b => {
      b.classList.toggle('on', b.dataset.vista === modo);
      b.setAttribute('aria-selected', String(b.dataset.vista === modo));
    });
    if (modo === 'texto') {
      const sel = T.tablero.seleccion();
      if (abiertoId) C.texto.abrir(puntoId || (sel && sel.tipo === 'punto' ? sel.id : null));
    } else if (cambia) {
      C.texto.volcar();
      T.tablero.render();
      const id = C.texto.actual();
      if (id) seleccionarEnTablero(id);
    }
  }
  document.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => verVista(b.dataset.vista)));

  /* En el panel del tablero, un nodo con nota ofrece abrirla (los extremos de un salto no tienen).
     El panel se reconstruye con innerHTML en cada selección: se observa y se añade el botón. */
  new MutationObserver(() => {
    const panel = $('panel'), s = T.tablero.seleccion();
    if (!s || s.tipo !== 'punto' || panel.querySelector('[data-nota-abrir]') || modelo.saltoDe(s.id)) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn act-btn'; b.dataset.notaAbrir = s.id; b.textContent = '✎ Escribir la nota';
    const campo = panel.querySelector('.field');
    if (campo) panel.insertBefore(b, campo); else panel.appendChild(b);
  }).observe($('panel'), { childList: true });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-nota-abrir]');
    if (b) verVista('texto', b.dataset.notaAbrir);
  });
  if (vista.modo === 'texto') verVista('texto');

  const zoom = $('zoom');
  if (zoom) {
    zoom.value = T.tablero.zoom();
    zoom.oninput = e => { T.tablero.zoom(+e.target.value); vista.zoom = +e.target.value; guardarVista(); };
  }

  $('btnGuardar').onclick = guardar;
  $('btnGuardarComo').onclick = guardarComo;
  $('btnAbrir').onclick = abrirArchivo;
  $('btnNuevo').onclick = nuevo;
  $('estadoGuardado').onclick = guardar;

  document.addEventListener('keydown', e => {
    const cmd = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (cmd && k === 's') { e.preventDefault(); e.shiftKey ? guardarComo() : guardar(); }
    if (cmd && k === 'o') { e.preventDefault(); abrirArchivo(); }
    if (cmd && e.shiftKey && k === 'g') { e.preventDefault(); verVista(vista.modo === 'texto' ? 'esquema' : 'texto'); }
    if (cmd && e.shiftKey && k === 'k' && vista.modo === 'texto') { e.preventDefault(); C.texto.alternarCabecera(); }
  });
  window.addEventListener('beforeunload', () => {
    C.texto.volcar(); if (temporizador) volcar();
    if (archivo && sucio()) escribirArchivo();                 // lo que dé tiempo; al volver se comprueba
  });

  /* API para el gestor de documentos que venga después: la biblioteca, el guion abierto y la vista. */
  C.biblioteca = biblioteca;
  C.app = { abrir: montar, nuevo, guardar, guardarComo, abrirArchivo, archivo: () => archivo && { nombre: archivo.nombre, ruta: archivo.ruta || null, permiso: archivo.permiso },
            sucio, abiertoId: () => abiertoId, vista: verVista, modo: () => vista.modo };
})(window.Claquedraw, window.Tramas);
