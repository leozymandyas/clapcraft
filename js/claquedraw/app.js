/* Claquedraw · arranque
   Une el proyecto de la ventana (sus contenedores, esquemas de pasos de Tramas, bibliotecas y notas) con las vistas: el
   tablero, el texto (js/claquedraw/texto.js) y los documentos (js/claquedraw/gestor.js). **Cada ventana lleva un proyecto**
   (1.1.33) y arriba, sus pestañas: las pantallas abiertas del proyecto (esquemas, documentos, bibliotecas, segmentos, notas).
   El proyecto se autoguarda en localStorage, en su propia clave.

   Archivos (.clapcraft: JSON comprimido con gzip): cada pestaña puede estar vinculada a un archivo. «Guardar como…»
   elige el archivo y, desde entonces, cada cambio se escribe ahí solo (con 1 s de espera); «Abrir…»
   abre un archivo en una pestaña nueva (o reutiliza una pestaña vacía) y lo deja vinculado; «Guardar»
   escribe ya, o pide archivo si no lo hay. En Electron el archivo es una ruta (puente
   window.editorAPI) y las órdenes llegan del menú de la aplicación; en Chrome/Edge un
   FileSystemFileHandle (guardado en IndexedDB, que al volver puede pedir permiso con el primer
   «Guardar»); en otros navegadores solo hay descarga. El indicador de la cabecera dice dónde está el
   guion de la pestaña y si hay cambios sin escribir.
   Reutiliza js/tramas/modelo.js y js/tramas/tablero.js sin tocarlos; no carga js/tramas/app.js. */
(function (C, T) {
  const CLAVE = 'guiones.claquedraw.biblioteca', CLAVE_VISTA = 'guiones.claquedraw.vista';
  const CLAVE_TEMA = 'guiones.tramas.theme', CLAVE_TRAMAS = 'guiones.tramas.doc';
  const FORMATO_TABLERO = 1;                                   // el mismo que escribe tramas.html
  const EXT = 'clapcraft', SIN_TITULO = 'Sin título';
  const FORMATO_ARCHIVO = 2;                                   // .clapcraft: { app, formato, nombre, documentos }, con gzip
  const $ = id => document.getElementById(id);
  const api = window.editorAPI;                                // puente de Electron, si existe
  const escritorio = !!(api && api.isElectron);

  /* ---------- almacenamiento local ---------- */
  function leerJSON(clave) {
    try { const raw = localStorage.getItem(clave); return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
  }
  function escribirJSON(clave, valor) {
    try { localStorage.setItem(clave, JSON.stringify(valor)); return true; } catch (_) { return false; }
  }
  const vista = Object.assign({ modo: 'esquema', archivos: {}, ladoPlegado: false }, leerJSON(CLAVE_VISTA) || {});
  const conocidas = new Set(Object.keys(vista));               // las claves que ha tenido esta ventana: si luego falta una, la quitó
  if (!vista.archivos || typeof vista.archivos !== 'object') vista.archivos = {};
  delete vista.cabecera;                                       // la tira y la cinta del editor ya van las dos a la vista (rediseño)
  if ((vista.rev || 0) < 3) { vista.ladoPlegado = false; delete vista.ladoAncho; vista.rev = 3; }   // el menú arranca desplegado y con el ancho de partida (Leo)
  if (vista.archivo) { delete vista.archivo; }                 // forma antigua (un solo archivo)
  /* La vista la comparten todas las ventanas (1.1.33): lo general (anchos, escalas, tema del panel) lo escribe la última que
     cambia algo, pero lo que es de un proyecto (`archivos`, `pestanas` y la `pantallas` de antes, mapas por id) solo lo toca
     la ventana que lo lleva, y el resto se relee de lo guardado para no pisar lo de las otras. */
  const PROPIAS = ['archivos', 'pestanas', 'pantallas'], idsPropios = new Set();
  /* los filtros de las bibliotecas y los segmentos (1.1.54, `vista.filtros`): cada ventana escribe solo los que tocó, sobre lo que
     hayan guardado las otras (las claves son ids de biblioteca, que no cambian al volver a abrir el proyecto) */
  const filtrosTocados = new Set();
  function ponerFiltroVista(k, f) {
    vista.filtros = Object.assign({}, vista.filtros && typeof vista.filtros === 'object' ? vista.filtros : {});
    if (f) vista.filtros[k] = f; else delete vista.filtros[k];
    filtrosTocados.add(k); guardarVista();
  }
  function guardarVista() {
    if (abiertoId) idsPropios.add(abiertoId);
    const hay = leerJSON(CLAVE_VISTA) || {}, out = Object.assign({}, hay, vista);
    /* lo que esta ventana quitó (el zoom al 100 %, las escalas o el ancho del menú de partida) se va también de lo guardado: al
       mezclarlo con lo de las otras volvía, y al abrir otra vez la app salía el valor de antes (1.1.51) */
    conocidas.forEach(k => { if (!(k in vista)) delete out[k]; });
    Object.keys(vista).forEach(k => conocidas.add(k));
    PROPIAS.forEach(k => {
      const m = Object.assign({}, hay[k] && typeof hay[k] === 'object' ? hay[k] : {});
      idsPropios.forEach(id => { const v = vista[k] && vista[k][id]; if (v === undefined) delete m[id]; else m[id] = v; });
      out[k] = m;
    });
    const fh = Object.assign({}, hay.filtros && typeof hay.filtros === 'object' ? hay.filtros : {});
    filtrosTocados.forEach(k => { const v = vista.filtros && vista.filtros[k]; if (v === undefined) delete fh[k]; else fh[k] = v; });
    filtrosTocados.clear();                                    // ya escritos: desde aquí manda lo guardado (con lo de las otras ventanas)
    out.filtros = fh; vista.filtros = Object.assign({}, fh);  // también los que pusieron las otras ventanas
    conocidas.add('filtros');
    escribirJSON(CLAVE_VISTA, out);
  }

  /* ---------- una ventana, un proyecto (1.1.33) ----------
     Leo: «que los proyectos se abran en nuevas ventanas y pueda tener varios abiertos a la vez». Cada ventana lleva un
     proyecto (o ninguno: «Sin proyectos» o «Nuevo proyecto»), guardado en su propia clave (`guiones.claquedraw.p.<id>`) para
     que dos ventanas no se pisen; hasta la 1.1.32 iban todos juntos en `guiones.claquedraw.biblioteca`, que se reparte una sola
     vez: el activo se queda en esta ventana y los demás se abren en las suyas. Qué proyecto lleva la ventana lo dice su
     dirección (`?p=<id>`; Electron la pone al abrirla y la recuerda para el próximo arranque, electron/main.js); `?nuevo`,
     `?ruta`, `?h` (un archivo del navegador, por IndexedDB) y `?t` (su texto) abren ahí lo que se pidió desde otra ventana.
     `biblioteca` sigue siendo una C.Biblioteca, con un solo guion: el de la ventana. */
  const PREFIJO_PROYECTO = 'guiones.claquedraw.p.', CLAVE_ULTIMO = 'guiones.claquedraw.ultimo', PREFIJO_PENDIENTE = 'guiones.claquedraw.pendiente.';
  const params = new URLSearchParams(location.search);
  const leerProyecto = id => { const g = id && leerJSON(PREFIJO_PROYECTO + id); return g && g.id === id ? g : null; };
  let otrosDeAntes = [], activoDeAntes = null;
  (function repartir() {
    const antigua = leerJSON(CLAVE); if (!antigua) return;
    const b = new C.Biblioteca(antigua);
    if (!b.datos.guiones.every(g => escribirJSON(PREFIJO_PROYECTO + g.id, g))) return;   // sin sitio: se queda como estaba
    const a = b.activo(); activoDeAntes = a ? a.id : null;
    otrosDeAntes = b.datos.guiones.map(g => g.id).filter(id => id !== activoDeAntes);
    try { localStorage.removeItem(CLAVE); } catch (_) {}
  })();
  /* el de la ventana: el de su dirección; el que estaba activo antes del reparto; en el navegador, sin nada pedido, el último */
  const inicial = params.get('p') || activoDeAntes || (!escritorio && !Array.from(params.keys()).length ? leerJSON(CLAVE_ULTIMO) : null);
  const g0 = leerProyecto(inicial);
  const biblioteca = new C.Biblioteca(g0 ? { guiones: [g0], activo: g0.id } : null);
  if (!biblioteca.total() && !vista.iniciada) {
    /* Primer arranque: si tramas.html dejó un tablero, se hereda (sin borrarlo). Si no, «Sin proyectos» (Leo, 15-09-2026). */
    const previo = leerJSON(CLAVE_TRAMAS);
    if (C.esTablero(previo) && previo.formato === FORMATO_TABLERO) biblioteca.crear({ nombre: SIN_TITULO + ' 1', datos: previo });
  }
  vista.iniciada = true;
  /* «Sin título 1», «Sin título 2»…: el número más bajo que no esté en uso entre las pestañas. */
  function nombreSinTitulo() {
    const usados = new Set(biblioteca.datos.guiones.map(g => g.nombre));
    let n = 1; while (usados.has(SIN_TITULO + ' ' + n)) n++;
    return SIN_TITULO + ' ' + n;
  }
  /* Guiones de versiones anteriores sin archivo llevaban «Capítulo N»: pasan a «Sin título N». */
  const porRenombrar = biblioteca.datos.guiones.filter(g => /^(Capítulo|Sin título)( \d+)?$/.test(g.nombre) && !vista.archivos[g.id]);
  porRenombrar.forEach(g => { g.nombre = ''; });
  porRenombrar.forEach(g => { g.nombre = nombreSinTitulo(); });
  let localOk = true;
  function persistir() {
    const g = biblioteca.guion(abiertoId);
    if (g) {
      localOk = escribirJSON(PREFIJO_PROYECTO + g.id, g); escribirJSON(CLAVE_ULTIMO, g.id);
      /* **No cabe en este equipo** (1.1.55): la copia local se quedaría vieja, y al volver a arrancar se tomaba por lo último y
         pisaba el archivo (su firma seguía siendo la del archivo). Con archivo, la copia vieja se quita: al volver, se lee del
         archivo (`pedido`). Sin archivo se queda, que es lo único que hay. */
      if (!localOk && estado(g.id).archivo) { try { localStorage.removeItem(PREFIJO_PROYECTO + g.id); } catch (_) {} }
    }
    if (abiertoId) programarEscritura(abiertoId);
    informarVentana();
    indicador(); renderPestanas(); renderChipEsquema();       // el título del esquema sigue a renombres y enlaces
    if (esPersonajes(esquemaId) && C.gestor && enPersonajes()) C.gestor.render();   // el árbol de Personajes sigue al tablero
    recordarPantalla();                                        // y se apunta dónde estamos, para volver aquí al abrir
  }

  /* ---------- tablero: un solo modelo, se vuelca en el guion abierto ---------- */
  const datosDe = g => (g && g.datos) || T.inicial();
  let abiertoId = null;                                        // guion montado en el tablero
  let esquemaId = null;                                        // el esquema montado en el tablero (id de un esquema de contenedor); null: ninguno
  let textoAntes = null;                                       // el esquema cuyo documento estaba en el editor al irse a Documentos (verVista)
  let temporizador = null;
  const modelo = new T.Modelo(datosDe(biblioteca.activo()));
  const docs = () => C.gestor.documentos();                    // el modelo de documentos del guion abierto
  const refEsquema = eid => { const d = docs(); return d && eid ? d.esquema(eid) : null; };   // { contenedor, esquema } o null

  /* Escribe el tablero donde toca: en el guion (proyecto) o en el esquema del contenedor. */
  function volcar() {
    clearTimeout(temporizador); temporizador = null;
    if (abiertoId && biblioteca.guion(abiertoId)) {
      if (esquemaId && refEsquema(esquemaId)) {
        /* en un esquema de personaje, sus relaciones se reflejan en los demás esquemas donde los dos personajes tienen
           carril (js/claquedraw/relaciones.js); antes de guardar, porque marca las relaciones de este esquema */
        if (esPersonajes(esquemaId) && C.relaciones) {
          const borradas = C.relaciones.borrarReflejos(docs(), T, modelo, esquemaId).length;   // lo borrado aquí, fuera de los demás esquemas
          const renombradas = C.relaciones.renombrarReflejos(docs(), T, modelo, esquemaId).length;   // y el nombre que se le puso, en los reflejos
          if (borradas + renombradas + C.relaciones.reflejar(docs(), T, modelo, esquemaId).length) biblioteca.marcar(abiertoId);
        }
        const r = docs().guardarEsquema(esquemaId, modelo.toJSON()); if (r.ok && r.cambio) biblioteca.marcar(abiertoId);
      }
    }
    persistir();
  }

  /* Acceso a las notas de los nodos del esquema montado (texto.js no sabe cuál es). Sin esquema, nada. */
  const notas = {
    leer: id => esquemaId ? docs().notaEsquema(esquemaId, id) : null,
    guardar: (id, doc) => { if (!esquemaId) return { ok: false }; const r = docs().guardarNotaEsquema(esquemaId, id, doc); if (r.ok && r.cambio) biblioteca.marcar(abiertoId); return r; },
    actual: () => { const r = refEsquema(esquemaId); return r ? r.esquema.notaActual : null; },
    fijarActual: id => esquemaId ? docs().fijarNotaActualEsquema(esquemaId, id) : { ok: false }
  };

  /* Monta en el tablero un esquema de contenedor (o ninguno: null, el tablero queda vacío y avisa),
     volcando antes el que estaba y podando las notas de nodos que ya no existen. */
  const desplazamientos = new Map();                           // esquema → { left, top } del tablero (en memoria)
  function montarEsquema(eid, op) {
    const g = biblioteca.guion(abiertoId); if (!g) return;
    if (eid && !refEsquema(eid)) eid = null;
    if (temporizador) volcar();
    C.texto.cerrar();
    if (esquemaId && !esPersonajes(esquemaId)) esquemaPrevio = esquemaId;   // al volver de Personajes se remonta este
    const board = $('board');
    if (esquemaId) desplazamientos.set(esquemaId, { left: board.scrollLeft, top: board.scrollTop });
    if (esquemaId && refEsquema(esquemaId)) { const vivos = modelo.datos.puntos.map(p => p.id); docs().podarNotasEsquema(esquemaId, vivos); docs().podarGuion(esquemaId, vivos); }
    esquemaId = eid;
    /* un esquema de personaje: columna ancha con nombres, sin fuera de escena ni camino iluminado, y lo
       nuevo se llama «Momento», «Personaje», «Evento» (nodo) y «Relación» (cuadro) */
    const per = esPersonajes(eid);
    modelo.nombres = per ? { acto: 'Momento', linea: 'Personaje', punto: 'Evento', nodo: 'Evento', cuadro: 'Relación', femeninos: ['cuadro'] } : null;
    T.tablero.simple(per); T.tablero.gutter(48);               // la columna estrecha de siempre, también en personajes (Leo, 16-09-2026)
    document.body.classList.toggle('tablero-personajes', per);
    recordarPantalla();
    T.tablero.cargar(eid ? refEsquema(eid).esquema.datos : T.inicial());
    /* cada tablero vuelve a donde se dejó (uno nuevo, al principio): si se heredaba el desplazamiento del
       anterior, con otro número de carriles la vista brincaba */
    const d0 = desplazamientos.get(eid) || { left: 0, top: 0 };
    board.scrollLeft = d0.left; board.scrollTop = d0.top;
    document.body.classList.toggle('sin-esquema', !eid);
    renderChipEsquema();
    C.gestor.render();                                         // la barra señala el esquema montado
    if (vista.modo === 'texto' && !(op && op.sinEditor)) { if (eid) { docId = null; abrirEnEditor(); } else verVista('esquema'); }
  }
  /* El título de la vista Esquema: «CONTENEDOR [Esquema] Nombre» del esquema montado (no hace nada al
     pulsarlo, Leo) y «Ver documentos» si tiene documentos enlazados. */
  function renderChipEsquema() {
    const b = $('esquemaChip'); if (!b) return;
    const r = refEsquema(esquemaId), x = r && docs().enlace(esquemaId), per = r && esPersonajes(esquemaId);
    b.hidden = !r;
    if (r) {
      b.querySelector('[data-chip-cont]').textContent = r.contenedor.nombre;
      /* el chip lleva el nombre (Leo: como en la cabecera del editor) y su color, si se le puso uno */
      const chip = b.querySelector('.gd-chip');
      const col = r.esquema.color, t = col !== undefined && col !== null && C.PALETA_ETIQUETAS[col];
      chip.classList.toggle('per-chip', !!t); chip.classList.toggle('gd-chip--esquema', !t);
      if (t) { chip.style.setProperty('--chl', t[1]); chip.style.setProperty('--chd', t[2]); } else { chip.style.removeProperty('--chl'); chip.style.removeProperty('--chd'); }
      b.querySelector('[data-chip-esq]').textContent = r.esquema.nombre;
      chip.setAttribute('aria-label', 'Esquema «' + r.esquema.nombre + '»');   // cortado, sale el globo (texto.js)
    }
    $('verDocumentos').hidden = !x;
    /* sin esquema montado no hay documento que abrir, y **un esquema de personaje no lleva documento** (Leo,
       16-09-2026: «quita de personajes el botón, estos esquemas no necesitan documento») */
    $('abrirDoc').hidden = !r || esPersonajes(esquemaId);
  }
  /* La biblioteca donde el esquema montado tiene sus actos como segmentos: la enlazada (los de personaje no tienen). */
  function bibliotecaDelEsquema() {
    const d = docs(); if (!d || !esquemaId || esPersonajes(esquemaId)) return null;
    const x = d.enlace(esquemaId); return x ? x.sub.id : null;
  }
  /* ---------- el documento del esquema (Leo, 16-09-2026) ----------
     El editor vuelve a ser un editor normal: lo que se abre es **un documento**, una nota de la biblioteca de guiones
     del esquema marcada como principal, y encima queda la tira de la trama, de referencia. La primera vez se crea con
     lo que hubiera escrito en los nodos (hasta la 1.0.59 el editor era una sección por nodo), para no perder nada. */
  let docId = null;                                            // el documento abierto en la vista Texto
  function documentoDe(eid, crear) {
    const d = docs(); if (!d || !eid || !refEsquema(eid)) return null;
    const hay = d.documentoEsquema(eid);
    if (hay || !crear || esPersonajes(eid)) return hay;         // un esquema de personaje no estrena documento (Leo)
    const r = refEsquema(eid);
    const tm = eid === esquemaId ? modelo : new T.Modelo(r.esquema.datos);
    const partes = [], chars = {};
    C.guion.estado(d, eid, tm, esPersonajes(eid)).filas.forEach(f => {
      if (f.html && (f.palabras || /(<img|<table|<hr)/i.test(f.html))) { partes.push(f.html); Object.assign(chars, f.characters); }
    });
    const x = d.crearDocumentoEsquema(eid, r.esquema.nombre, { html: partes.join(''), characters: chars });
    if (!x.ok) { T.tablero.avisar(x.aviso); return null; }
    if (partes.length) d.podarNotasEsquema(eid, []);           // lo que estaba en los nodos ya vive en el documento
    biblioteca.marcar(abiertoId); persistir();
    return x.nota;
  }
  /* Abre un documento del esquema en el editor (sin id, el principal). Desde los guiones se pasa el suyo, y si es de
     otro esquema, se monta antes. */
  function abrirTexto(id) {
    const d = docs(); if (!d) return;
    const n = id && d.nota(id), r = n && d.sub(n.subId);
    const eid = r && r.sub.guionEid;                           // el esquema al que pertenece esa biblioteca de guiones
    if (eid && eid !== esquemaId && refEsquema(eid)) montarEsquema(eid);
    docId = n ? n.id : null;
    verVista('texto');
  }
  /* Pone en el editor el documento que toca (el elegido, o el principal del esquema montado). */
  function abrirEnEditor() {
    const d = docs(); if (!d || !esquemaId) return;
    let n = docId && d.nota(docId);
    const r = n && d.sub(n.subId);
    if (!n || !r || r.sub.guionEid !== esquemaId) n = documentoDe(esquemaId, true);   // el principal del esquema montado
    if (!n) return;
    docId = n.id;
    if (C.gestor.notaAbierta()) C.gestor.cerrarNota();
    C.texto.abrirDocumento({ titulo: n.titulo, html: n.html, characters: n.characters }, {
      titulo: () => { const dd = docs(), x = dd && dd.nota(n.id); return x ? x.titulo : ''; },
      guardar: doc => { const dd = docs(); if (!dd || !dd.nota(n.id)) return; const x = dd.guardarNota(n.id, doc); if (x.ok && x.cambio) { biblioteca.marcar(abiertoId); persistir(); pintarVersion(); } },
      alCambiar: () => { C.gestor.render(); pintarVersion(); }
    }, { tira: true, clave: n.id });
    pintarVersion();
  }

  /* El primer esquema que haya en el guion (por orden de contenedores), o null. */
  function primerEsquema() {
    const d = docs(); if (!d) return null;
    for (const c of d.datos.contenedores) if (!c.oculto && c.esquemas.length) return c.esquemas[0].id;
    return null;
  }

  /* ---------- Personajes ----------
     Los personajes del guion son el elenco de los documentos: los que se escriben en el editor con «/» y
     los que se crean aquí (nombre y color; renombrar o recolorear reescribe todas las notas). El menú
     enseña **su propio árbol** (`vista.arbol`, Leo 16-09-2026) con dos contenedores: «Personajes», donde
     cada personaje **es** su biblioteca (se abre como cualquier otra, con sus secciones y sus segmentos,
     y caben carpetas y grupos), y «Esquemas», con los esquemas de personaje, que son documentos sueltos:
     se crean eligiendo un personaje (su primera trama es él) y luego se editan como cualquier esquema. */
  const esPersonajes = eid => { const d = docs(); return !!d && d.esEsquemaPersonaje(eid); };
  const enPersonajes = () => vista.arbol === 'personajes';
  let esquemaPrevio = null;                                    // el último esquema de contenedor montado
  function datosPersonajes(p) {
    const t = T.inicial();
    t.actos.forEach((a, i) => { a.nombre = 'Momento ' + T.romano(i + 1); });
    t.lineas = [Object.assign({}, t.lineas[0], { nombre: p.nombre, personaje: p.id })];
    t.puntos = []; t.saltos = []; t.notas = [];
    return t;
  }
  /* El elenco y el personaje abierto. */
  function personajes() {
    const d = docs(); if (!d) return null;
    const lista = d.elenco();
    if (!lista.some(p => p.id === vista.personaje)) vista.personaje = lista[0] ? lista[0].id : null;
    return { lista, abierto: vista.personaje };
  }
  /* renombrar o recolorear un personaje: lo del editor se guarda antes y, reescritas las notas, el editor relee la suya sin
     cerrarse (1.1.38; antes se cerraba y el texto viejo seguía a la vista hasta recargar) */
  function guardarEditor() { volcarTexto(); return C.texto.clave(); }
  /* lo escrito en el editor **y en la ventana de una nota** (1.1.54), a sus datos: antes de guardar, de Claude, de cambiar de
     pestaña o de cerrar */
  function volcarTexto() { C.texto.volcar(); if (C.gestor && C.gestor.guardarPanel) C.gestor.guardarPanel(); }
  /* **Todo lo pendiente, a los documentos** (1.1.55), antes de cerrar o salir: un nombre que se escribe en sitio (un nodo, una
     nota, una pestaña: se guardan al salir del campo, y cerrando la ventana no se salía), lo escrito en el panel flotante (repinta
     y guarda 150 ms después), el tablero y el editor. */
  function volcarTodo() {
    const a = document.activeElement;
    if (a && a !== document.body && a.tagName !== 'IFRAME' && (a.matches('input, textarea') || a.isContentEditable)) { try { a.blur(); } catch (_) {} }
    volcarTodoSinSalir();
  }
  /* lo mismo sin sacar el foco de donde se escribe */
  function volcarTodoSinSalir() {
    if (repintarTablero) { clearTimeout(repintarTablero); repintarTablero = null; T.tablero.render(); alCambiar(); }
    if (temporizador) volcar();
    volcarTexto();
  }
  function releerEditor(id) {
    const n = id && C.texto.clave() === id && docs().nota(id); if (!n) return;
    C.texto.recargar({ titulo: n.titulo, html: n.html, characters: n.characters });
  }
  /* Abre un personaje: su biblioteca, como cualquier otra (Leo, 16-09-2026: «los personajes pasan a ser
     bibliotecas»). La crea la primera vez que se abre. */
  function abrirPersonaje(id) {
    const d = docs(); if (!d) return;
    const p = d.personaje(id);
    vista.personaje = p ? id : null; vista.arbol = 'personajes'; guardarVista();
    if (!p) { C.gestor.render(); verVista('documentos'); return; }
    const c = d.contenedor(C.ID_PERSONAJES), antes = !!(c && c.subs.some(s => s.lineaId === id));
    const s = d.bibliotecaPersonaje(id, p.nombre);
    if (!antes) { biblioteca.marcar(abiertoId); persistir(); }
    C.gestor.abrirSub(s.id);                                   // navega, redibuja y pasa a la vista Biblioteca
  }
  /* Va al **esquema** de un personaje (Leo, 16-09-2026: «al dar doble clic a un personaje, te debe dirigir al esquema
     del personaje»): el suyo —el esquema de personaje que nació con él, su primer carril— o, si no lo tiene, el primer
     esquema de personaje donde salga. Sin ninguno, su biblioteca, que es lo que sí existe siempre. */
  function irAEsquemaPersonaje(id) {
    const d = docs(); if (!d || !d.personaje(id)) return abrirPersonaje(id);
    const lista = d.esquemasDePersonaje(id).filter(x => x.personaje);
    const suyo = lista.find(x => x.principal) || lista[0];
    if (!suyo) return abrirPersonaje(id);
    vista.personaje = id; vista.arbol = 'personajes'; guardarVista();
    montarEsquema(suyo.eid);
    C.gestor.render(); verVista('esquema');
  }
  /* El árbol de Personajes: lo último que se vio ahí (una biblioteca de personaje o un esquema suyo). */
  function verPersonajes() {
    const d = docs(); if (!d) return;
    vista.arbol = 'personajes'; guardarVista();
    const l = personajes();
    if (l && l.abierto) abrirPersonaje(l.abierto);
    else if (esPersonajes(esquemaId)) { C.gestor.render(); verVista('esquema'); }
    else { C.gestor.render(); verVista('documentos'); }
    persistir();
  }
  function verContenedores() {
    vista.arbol = 'contenedores'; guardarVista();
    if (esPersonajes(esquemaId) || !esquemaId) montarEsquema(esquemaPrevio && refEsquema(esquemaPrevio) ? esquemaPrevio : primerEsquema());
    C.gestor.reiniciar();
    verVista(vista.modo === 'texto' ? 'esquema' : vista.modo);
  }
  /* «Nuevo esquema…» del contenedor «Esquemas»: se elige el personaje y su primera trama es él (Leo,
     16-09-2026); a partir de ahí se edita y se borra como cualquier trama. */
  function nuevoEsquemaPersonaje(trigger, carpetaId) {
    const d = docs(); if (!d) return;
    C.gestor.menuCarril(trigger, { titulo: 'Esquema de…', alElegir: pid => {
      const p = d.personaje(pid); if (!p) return;
      const r = d.crearEsquemaPersonaje(datosPersonajes(p), p.nombre);
      if (!r.ok) { T.tablero.avisar(r.aviso); return; }
      if (carpetaId) d.moverACarpeta('esquema', r.esquema.id, carpetaId);
      biblioteca.marcar(abiertoId); persistir();
      vista.arbol = 'personajes'; guardarVista();
      montarEsquema(r.esquema.id); verVista('esquema');
      T.tablero.avisar(r.aviso);
    } });
  }
  /* Crear un personaje (menú lateral): un diálogo con su nombre y su color (el primero libre de la
     paleta); se abre su tablero. Desde el tablero no se crean (Leo): solo se eligen. */
  async function nuevoPersonaje() {
    const d = docs(); if (!d) return null;
    const usados = d.elenco().map(p => p.color);
    let libre = 0; while (libre < 15 && usados.includes(libre)) libre++;
    const r0 = await C.gestor.pedirPersonaje({ color: libre });
    if (!r0) return null;
    const r = d.crearPersonaje(r0.nombre, r0.color); if (!r.ok) { T.tablero.avisar(r.aviso); return null; }
    biblioteca.marcar(abiertoId); persistir();
    abrirPersonaje(r.personaje.id);
    return r.personaje;
  }
  /* los que no se ofrecen en un selector del tablero: los que ya tienen carril (salvo el del propio selector) */
  const conCarril = (salvoLinea) => modelo.datos.lineas.filter(l => l.id !== salvoLinea && l.personaje).map(l => l.personaje);
  /* «＋ personaje» del tablero: un carril nuevo con el personaje del diálogo */
  function carrilNuevo(p) {
    if (modelo.datos.lineas.some(l => l.personaje === p.id)) { T.tablero.avisar('«' + p.nombre + '» ya tiene carril en este tablero'); return; }
    const r = modelo.nuevaLinea('secundaria'); if (!r.ok) { T.tablero.avisar(r.aviso); return; }
    modelo.editarLinea(r.linea.id, { personaje: p.id, nombre: p.nombre });
    T.tablero.render(); volcar();
  }
  /* Eliminar un carril de un esquema de personaje (Leo, 15-09-2026: no había forma; el panel de la trama no se abre ahí): con
     eventos pide confirmación; se va con ellos y con sus notas. Cualquiera se borra mientras quede otro (Leo, 16-09-2026: la
     primera trama «puede borrarse y editarse con normalidad»): si es la principal, otra ocupa su sitio (aquí «principal» no
     significa nada, el tablero va en modo simple). */
  async function eliminarCarril(lineaId) {
    const l = modelo.linea(lineaId); if (!l) return;
    if (l.tipo === 'principal' && modelo.datos.lineas.length < 2) { T.tablero.avisar('Es el único carril: el esquema se queda sin tramas'); return; }
    const n = modelo.datos.puntos.filter(p => p.lineaId === lineaId).length;
    const quien = l.personaje && docs().personaje(l.personaje), nombre = quien ? quien.nombre : 'Sin personaje';
    if (!await T.tablero.confirmar('¿Eliminar el carril de «' + nombre + '»?' + (!n ? '' : n === 1 ? ' Se borra su evento en este tablero y lo escrito en él.' : ' Se borran sus ' + n + ' eventos en este tablero y lo escrito en ellos.'), 'Eliminar')) return;   // siempre con confirmación (Leo)
    if (modelo.ultimaPrincipal(l.id)) {                        // otra pasa a ser principal: el modelo no borra la última
      const otra = modelo.datos.lineas.find(x => x !== l); if (!otra) return;
      l.tipo = 'secundaria'; otra.tipo = 'principal';
    }
    const r = modelo.borrarLinea(lineaId); if (!r.ok) { T.tablero.avisar(r.aviso); return; }
    T.tablero.render(); volcar();
    T.tablero.avisar('Carril de «' + nombre + '» eliminado');
    if (enPersonajes()) C.gestor.render();
  }
  /* los carriles del tablero montado siguen al elenco (nombre); el modelo de documentos ya cambió sus datos guardados */
  function carrilesDe(id, fn) {
    if (!esPersonajes(esquemaId)) return;
    modelo.datos.lineas.forEach(l => { if (l.personaje === id) fn(l); });
    T.tablero.render(); volcar();
  }
  /* lo restaurado de la papelera: un personaje recupera sus carriles también en el esquema montado; un esquema, sin ninguno
     montado, se monta (el gancho `restaurado` del gestor y el «Deshacer» del aviso) */
  function alRestaurar(r) {
    if (r.personaje) {
      if ((r.carriles || []).some(cr => cr.eid === esquemaId)) {
        r.carriles.filter(cr => cr.eid === esquemaId).forEach(cr => { if (modelo.linea(cr.lineaId)) modelo.editarLinea(cr.lineaId, { personaje: r.personaje.id, nombre: r.personaje.nombre }); });
        T.tablero.render(); volcar();
      }
      C.gestor.render();
    } else if (r.esquema && !esquemaId) montarEsquema(r.esquema.id);
  }
  function renombrarPersonaje(id, nombre) {
    const enEditor = guardarEditor(); volcar();
    const r = docs().renombrarPersonaje(id, nombre); if (!r.ok) { T.tablero.avisar(r.aviso); C.gestor.render(); return; }
    releerEditor(enEditor);
    carrilesDe(id, l => { l.nombre = r.personaje.nombre; });
    biblioteca.marcar(abiertoId); persistir();
    if (r.notas) T.tablero.avisar('«' + r.personaje.nombre + '»: actualizado en ' + r.notas + (r.notas === 1 ? ' nota' : ' notas'));
    C.gestor.render();
  }
  function colorPersonaje(id, color) {
    const enEditor = guardarEditor(); volcar();
    const r = docs().colorearPersonaje(id, color); if (!r.ok) { T.tablero.avisar(r.aviso); return; }
    releerEditor(enEditor);
    biblioteca.marcar(abiertoId); persistir(); C.gestor.render();
  }
  async function eliminarPersonaje(id) {
    const d = docs(), p = d.personaje(id); if (!p) return;
    const m = d.menciones(id);
    if (m.length) { T.tablero.avisar('«' + p.nombre + '» aparece en ' + m.length + (m.length === 1 ? ' nota' : ' notas') + ': no se puede eliminar mientras lo nombren'); return; }
    const c = d.contenedor(C.ID_PERSONAJES), sub = c && c.subs.find(s => s.lineaId === id), n = sub ? d.notasDe(sub.id).length : 0;
    if (!await T.tablero.confirmar('¿Mover a «' + p.nombre + '» a la papelera?' + (n ? ' Con su biblioteca (' + n + (n === 1 ? ' nota).' : ' notas).') : '') + ' En los esquemas de personaje, sus carriles quedan sin personaje; si lo restauras, vuelven a ser suyos.', 'Mover a la papelera')) return;
    volcar();
    const r = d.eliminarPersonaje(id); if (!r.ok) { T.tablero.avisar(r.aviso); return; }
    const deshacer = () => { const x = docs().restaurarPieza(id); if (!x.ok) { T.tablero.avisar(x.aviso); return; }
      alRestaurar(x); biblioteca.marcar(abiertoId); persistir(); C.gestor.render(); };
    carrilesDe(id, l => { delete l.personaje; l.nombre = 'Sin personaje'; });
    if (vista.personaje === id) vista.personaje = null;
    biblioteca.marcar(abiertoId); persistir();
    const P = personajes();
    if (P && P.abierto) abrirPersonaje(P.abierto); else { C.gestor.reiniciar(); verVista(esPersonajes(esquemaId) ? 'esquema' : 'documentos'); }
    T.tablero.avisar(r.aviso, { texto: 'Deshacer', fn: deshacer });
  }
  /* el selector de un carril: elegir personaje (el carril toma su nombre), crear uno o quitarlo */
  function asignarCarril(lineaId, personajeId) {
    const p = personajeId && docs().personaje(personajeId);
    modelo.editarLinea(lineaId, p ? { personaje: p.id, nombre: p.nombre } : { personaje: null, nombre: 'Sin personaje' });
    T.tablero.render(); volcar();
  }
  /* En un esquema de personaje, tras cada render: **la misma columna estrecha que en cualquier esquema** (Leo,
     16-09-2026: la de 250 px ocupaba demasiado), con el círculo de la trama enseñando **las dos primeras letras del
     personaje** y su color de etiqueta; al pasar el ratón sale su nombre (el rótulo de siempre) y al pulsarlo, el
     selector de personaje. */
  function marcarPersonaje() {
    if (!esPersonajes(esquemaId)) return;
    const d = docs();
    modelo.datos.lineas.forEach(l => {
      const row = document.querySelector(`#rows .row[data-linea="${CSS.escape(l.id)}"]`); if (!row) return;
      const p = l.personaje && d.personaje(l.personaje);
      row.classList.toggle('sin-personaje', !p);
      const chip = row.querySelector('.chip'); if (!chip) return;
      const nombre = p ? p.nombre : 'Sin personaje';
      chip.dataset.inicial = C.iniciales(nombre);      // «Le», «PG» (1.1.40)
      const par = p && C.PALETA_ETIQUETAS[p.color];
      chip.classList.toggle('per-tono', !!par);
      if (par) { chip.style.setProperty('--chl', par[1]); chip.style.setProperty('--chd', par[2]); }
      else { chip.style.removeProperty('--chl'); chip.style.removeProperty('--chd'); }
      chip.title = p ? p.nombre + ' · clic para cambiar de personaje' : 'Elegir el personaje de este carril';
      const tipo = row.querySelector('.ltipo'); if (tipo) tipo.textContent = 'Personaje';
      const inp = row.querySelector('.lname'); if (inp && inp.readOnly) inp.value = nombre;
    });
  }
  /* Al montar un guion: el esquema que vivía en el guion (forma antigua) pasa a sus documentos una
     sola vez, y se monta el primero que haya. */
  /* ---------- la última pantalla de cada proyecto (Leo, 16-09-2026) ----------
     «Que cuando cierre y abra el programa me deje en la última pantalla que estaba»: se recuerda qué vista estaba delante, en
     qué árbol, qué esquema montado, qué biblioteca, segmento o nota, y al abrir el proyecto se vuelve ahí. **Desde la 1.1.33
     eso es cada pestaña** (ver «pestañas» más abajo): la de delante se va apuntando al navegar y cambiar de pestaña es reponer
     la suya. Vive en la vista (`vista.pestanas[id]`), no en el archivo: es de esta máquina, no del guion. */
  let reponiendo = true;                                       // hasta reponerla, nada la pisa (el arranque persiste antes de montar)
  function pantallaActual() {
    const s = C.gestor.subActual && C.gestor.subActual(), x = C.gestor.expandidoActual && C.gestor.expandidoActual();
    const p = { modo: vista.modo, arbol: enPersonajes() ? 'personajes' : 'contenedores',
                esquema: esquemaId || null,
                sub: s && s.tipo === 'sub' ? s.id : null,
                nota: (C.gestor.notaAbierta && C.gestor.notaAbierta()) || null };
    if (p.modo === 'documentos' && s && s.tipo === 'papelera') p.papelera = true;
    if (p.modo === 'documentos' && !p.nota && x && x.subId === p.sub) p.seg = x.clave;
    const sel = p.modo === 'documentos' && !p.nota && C.gestor.notaElegida && C.gestor.notaElegida();
    if (sel) p.sel = sel;                                       // la nota elegida, con su panel (1.1.34)
    if (p.modo === 'texto' && docId) p.doc = docId;
    return p;
  }
  function recordarPantalla() {
    if (reponiendo || !abiertoId || pantalla !== 'proyecto') return;
    const t = pestanaActiva(); if (!t) return;
    const previo = t.p, antes = claveDe(previo);
    t.p = pantallaActual();
    if (claveDe(t.p) !== antes) {
      /* otra pantalla en la misma pestaña: la de antes, al historial (‹), y lo que había delante (›) se olvida */
      if (antes && previo && Object.keys(previo).length) {
        const atras = t.atras || (t.atras = []), ultimo = atras[atras.length - 1];
        if (!ultimo || claveDe(ultimo) !== antes) atras.push(previo);
        if (atras.length > MAX_HISTORIA) atras.splice(0, atras.length - MAX_HISTORIA);
        t.adelante = [];
      }
      renderPestanas();                                        // el rótulo de la pestaña sigue a lo que enseña
    }
    guardarPestanas(); pintarHistoria();
  }
  /* ---------- ‹ › : la pantalla anterior y la siguiente de la pestaña (1.1.35) ----------
     Leo: «a la izquierda del nombre del contenedor en las pantallas unos botones < > para poder regresar a la pantalla anterior en
     la que me encontraba». Cada pestaña lleva su historial (`t.atras`, `t.adelante`, hasta MAX_HISTORIA): cuando lo que enseña
     cambia de elemento (`claveDe`), lo de antes va a `atras`; ‹ repone lo último de `atras` y guarda lo de ahora en `adelante`, y ›
     al revés (lo que ya no existe se salta). Los botones (`.nav-hist`) se ponen solos delante del título de cada cabecera
     (`.esq-titulo`: esquema, documento, biblioteca, segmento y nota; las cabeceras se rehacen, así que un MutationObserver los
     vuelve a poner) y se apagan sin nada a ese lado. También Cmd/Ctrl+[ y ]. */
  const MAX_HISTORIA = 40;
  function irHistoria(salto) {
    const t = pestanaActiva(); if (!t || pantalla !== 'proyecto') return;
    recordarPantalla(); if (temporizador) volcar(); volcarTexto();
    const de = salto < 0 ? t.atras : t.adelante; if (!de || !de.length) return;
    let p = de.pop(); while (p && !existe(p) && de.length) p = de.pop();
    if (!p || !existe(p)) { guardarPestanas(); pintarHistoria(); return; }
    (salto < 0 ? (t.adelante || (t.adelante = [])) : (t.atras || (t.atras = []))).push(t.p);
    t.p = p;
    guardarPestanas();
    restaurarPantalla();
    renderPestanas(); pintarHistoria();
  }
  const HISTORIA = '<span class="nav-hist"><button type="button" class="icono" data-hist="-1" title="Atrás: la pantalla anterior (Cmd+[)" aria-label="Atrás"><svg width="15" height="15" aria-hidden="true"><use href="#ic-arr-l"></use></svg></button>'
    + '<button type="button" class="icono" data-hist="1" title="Adelante (Cmd+])" aria-label="Adelante"><svg width="15" height="15" aria-hidden="true"><use href="#ic-arr-r"></use></svg></button></span>';
  function pintarHistoria() {
    const t = pantalla === 'proyecto' && pestanaActiva();
    const a = !!(t && t.atras && t.atras.length), b = !!(t && t.adelante && t.adelante.length);
    document.querySelectorAll('.nav-hist [data-hist]').forEach(x => { x.disabled = x.dataset.hist === '-1' ? !a : !b; });
  }
  /* y detrás del título, el botón de enlace de lo que se ve (1.1.52, «Copiar enlace para Claude») */
  const ENLACE_CAB = '<button type="button" class="icono enlace-cab" data-enlace-cab title="Copiar enlace para Claude (Cmd+Shift+C)" aria-label="Copiar enlace para Claude"><svg width="15" height="15" aria-hidden="true"><use href="#ic-link"></use></svg></button>';
  const sinEnlaceCab = x => !(x.nextElementSibling && x.nextElementSibling.matches('[data-enlace-cab]'));
  function ponerHistoria() {
    document.querySelectorAll('.esq-titulo:not(.nav-hist + .esq-titulo)').forEach(x => x.insertAdjacentHTML('beforebegin', HISTORIA));
    document.querySelectorAll('.esq-titulo').forEach(x => { if (sinEnlaceCab(x)) x.insertAdjacentHTML('afterend', ENLACE_CAB); });
    pintarHistoria();
  }
  new MutationObserver(() => { if (document.querySelector('.esq-titulo:not(.nav-hist + .esq-titulo)') || [...document.querySelectorAll('.esq-titulo')].some(sinEnlaceCab)) ponerHistoria(); })
    .observe(document.querySelector('main') || document.body, { childList: true, subtree: true });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-hist]'); if (!b) return;
    e.stopPropagation(); e.preventDefault();                    // ni el gestor ni el tablero lo toman por un clic suyo
    if (!b.disabled) irHistoria(+b.dataset.hist);
  }, true);
  /* Vuelve a lo que enseña la pestaña de delante (o al primer esquema, como antes). */
  function restaurarPantalla() {
    const t = pestanaActiva();
    reponiendo = true;
    try { reponer((t && t.p) || {}); } finally { reponiendo = false; }
    recordarPantalla();
  }
  function reponer(p) {
    vista.arbol = p.arbol === 'personajes' ? 'personajes' : 'contenedores';
    textoAntes = null; if (C.gestor.sinVolver) C.gestor.sinVolver();   // lo que recordaban las otras pantallas no se reabre aquí
    const eid = p.esquema && refEsquema(p.esquema) ? p.esquema : esquemaId && refEsquema(esquemaId) ? esquemaId : primerEsquema();
    if (eid !== esquemaId || !eid) montarEsquema(eid, { sinEditor: true });
    const d = docs();
    if (p.nota && d && d.nota(p.nota) && !d.enPapelera(p.nota)) { verVista('documentos'); C.gestor.abrirNota(p.nota); return; }
    /* el gestor recuerda la biblioteca aunque delante esté el esquema: solo se abre si era lo que se veía */
    if (p.modo === 'documentos') {
      if (p.papelera && C.gestor.abrirPapelera) { verVista('documentos'); C.gestor.abrirPapelera(); return; }
      if (p.sub && d && d.sub(p.sub)) {
        verVista('documentos');
        const sel = p.sel && d.nota(p.sel) && !d.enPapelera(p.sel) ? p.sel : null;
        if (C.gestor.elegirNota) C.gestor.elegirNota(sel);    // la nota elegida de esta pestaña (y su panel), no la de la otra
        if (p.seg && segmentoVivo(p)) C.gestor.expandir(p.sub, p.seg, sel); else C.gestor.abrirSub(p.sub);
        return;
      }
    }
    if (p.modo === 'texto' && esquemaId && !esPersonajes(esquemaId)) { abrirTexto(p.doc && d && d.nota(p.doc) ? p.doc : null); return; }
    verVista(p.modo === 'documentos' ? 'documentos' : 'esquema');
  }
  const segmentoVivo = p => { const d = docs(); if (!d || !p.seg) return false; const m = /^etq:(.+)$/.exec(p.seg); return m ? !!d.etiqueta(m[1]) : true; };

  /* ---------- pestañas: lo abierto del proyecto (1.1.33) ----------
     Leo: «que en los elementos del árbol o en notas y segmentos exista en los tres puntos la opción "Abrir en pestaña" y desde
     ahí se abran nuevas pestañas; si ya tengo un elemento abierto en una pestaña, no se duplica: se me muestra esa pestaña».
     Cada pestaña es una pantalla del proyecto (`pantallaActual`): un esquema, el documento de un esquema, una biblioteca (o un
     personaje), un segmento expandido, una nota o la papelera. Lo que se hace en el árbol cambia la de delante, como siempre;
     «Abrir en pestaña» (`abrirEnPestana`, desde el ⋯ del gestor) abre otra detrás de la de delante o, si ese elemento ya tiene
     la suya (`claveDe`), va a ella. Van por proyecto en la vista (`vista.pestanas[id]` = { lista, activa }) y vuelven al abrirlo;
     se ordenan arrastrándolas, se cierran con su × (o el botón central, o Cmd+W; la última no, ahí Cmd+W cierra el proyecto) y
     Ctrl+Tab pasa de una a otra. Una cuyo elemento ya no existe se quita. */
  let pestanas = null;                                         // { lista: [{ id, p }], activa } del proyecto de la ventana
  const idPestana = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const pestanaActiva = () => (pestanas && pestanas.lista.find(t => t.id === pestanas.activa)) || null;
  const claveDe = p => !p ? '' : p.nota ? 'nota:' + p.nota : p.modo === 'texto' ? 'texto:' + (p.esquema || '')
    : p.modo === 'documentos' ? (p.papelera ? 'papelera' : p.seg ? 'seg:' + p.sub + '|' + p.seg : 'sub:' + (p.sub || '')) : 'esquema:' + (p.esquema || '');
  function cargarPestanas(id) {
    const g = vista.pestanas && vista.pestanas[id];
    const lista = g && Array.isArray(g.lista) ? g.lista.filter(t => t && t.id && t.p && typeof t.p === 'object') : [];
    if (lista.length) return { lista, activa: lista.some(t => t.id === g.activa) ? g.activa : lista[0].id };
    const t = { id: idPestana(), p: (vista.pantallas && vista.pantallas[id]) || {} };   // la última pantalla de antes de las pestañas
    return { lista: [t], activa: t.id };
  }
  function guardarPestanas() {
    if (!abiertoId || !pestanas) return;
    (vista.pestanas || (vista.pestanas = {}))[abiertoId] = pestanas;
    if (vista.pantallas) delete vista.pantallas[abiertoId];
    guardarVista();
  }
  function cambiarPestana(id) {
    if (!pestanas || id === pestanas.activa || pantalla !== 'proyecto') return;
    if (!pestanas.lista.some(t => t.id === id)) return;
    recordarPantalla(); if (temporizador) volcar(); volcarTexto();   // la que se deja, al día
    pestanas.activa = id; guardarPestanas();
    restaurarPantalla();
    renderPestanas();
  }
  /* lo que enseñaría una pestaña con ese elemento: `x` es { tipo: 'esquema' | 'documento' | 'sub' | 'personaje' | 'segmento' |
     'nota' | 'papelera', id, clave } (lo que manda el ⋯ del gestor) */
  function pantallaDe(x) {
    const d = docs(); if (!d || !x) return null;
    const arbolDe = cid => cid === C.ID_PERSONAJES || cid === C.ID_ESQUEMAS_PERSONAJE ? 'personajes' : 'contenedores';
    const aqui = esquemaId || null;
    if (x.tipo === 'esquema' || x.tipo === 'documento') {
      const r = refEsquema(x.id); if (!r || (x.tipo === 'documento' && esPersonajes(x.id))) return null;
      return { modo: x.tipo === 'documento' ? 'texto' : 'esquema', arbol: arbolDe(r.contenedor.id), esquema: x.id };
    }
    if (x.tipo === 'personaje') {
      const per = d.personaje(x.id); if (!per) return null;
      const c = d.contenedor(C.ID_PERSONAJES), antes = !!(c && c.subs.some(s => s.lineaId === x.id));
      const s = d.bibliotecaPersonaje(x.id, per.nombre);
      if (!antes) { biblioteca.marcar(abiertoId); persistir(); }
      return { modo: 'documentos', arbol: 'personajes', esquema: aqui, sub: s.id };
    }
    if (x.tipo === 'sub' || x.tipo === 'segmento') {
      const r = d.sub(x.id); if (!r) return null;
      const p = { modo: 'documentos', arbol: arbolDe(r.contenedor.id), esquema: aqui, sub: x.id };
      if (x.tipo === 'segmento' && x.clave) p.seg = x.clave;
      return p;
    }
    if (x.tipo === 'nota') {
      const n = d.nota(x.id); if (!n || d.enPapelera(x.id)) return null;
      const r = d.sub(n.subId);
      if (r && r.sub.guionEid) return { modo: 'texto', arbol: 'contenedores', esquema: r.sub.guionEid, doc: n.id };   // el documento de un esquema
      return { modo: 'documentos', arbol: r ? arbolDe(r.contenedor.id) : 'contenedores', esquema: aqui, sub: n.subId, nota: n.id };
    }
    if (x.tipo === 'papelera') return { modo: 'documentos', arbol: enPersonajes() ? 'personajes' : 'contenedores', esquema: aqui, papelera: true };
    return null;
  }
  function abrirEnPestana(x) {
    if (!pestanas || pantalla !== 'proyecto') return;
    const p = pantallaDe(x); if (!p) return;
    recordarPantalla();
    const k = claveDe(p), ya = pestanas.lista.find(t => claveDe(t.p) === k);
    if (ya) { if (ya.id === pestanas.activa) T.tablero.avisar('Ya está abierto en esta pestaña'); else cambiarPestana(ya.id); return; }
    const t = { id: idPestana(), p }, i = pestanas.lista.findIndex(t2 => t2.id === pestanas.activa);
    pestanas.lista.splice(i + 1, 0, t);
    cambiarPestana(t.id);
  }
  /* Una pestaña nueva, detrás de la última, en **el primer elemento de Contenedores** (Leo, 1.1.35): el primer esquema o la primera
     biblioteca en el orden del árbol, entrando en carpetas y grupos; sin ninguno, la vista de documentos vacía. */
  function primerElemento() {
    const d = docs(); if (!d) return null;
    const cs = d.contenedores();
    for (const c of [...cs.fijados, ...cs.sueltos]) {
      const primero = (xs, cid) => {
        for (const x of xs) {
          if (x.tipo === 'esquema' || x.tipo === 'sub') return { tipo: x.tipo, id: x.id };
          const y = x.tipo === 'carpeta' ? primero(d.nivelArbol(cid, x.id), cid) : x.tipo === 'grupo' ? primero(d.nivelGrupo(x.id), cid) : null;
          if (y) return y;
        }
        return null;
      };
      const x = primero(d.nivelArbol(c.id, null), c.id); if (x) return x;
    }
    return null;
  }
  function nuevaPestana() {
    if (!pestanas || pantalla !== 'proyecto') return;
    const x = primerElemento();
    const p = (x && pantallaDe(x)) || { modo: 'documentos', esquema: esquemaId || null };
    p.arbol = 'contenedores';
    recordarPantalla();
    const t = { id: idPestana(), p };
    pestanas.lista.push(t);
    cambiarPestana(t.id);
  }
  function cerrarPestanaElemento(id) {
    if (!pestanas || pestanas.lista.length < 2) return;
    const i = pestanas.lista.findIndex(t => t.id === id); if (i < 0) return;
    if (id === pestanas.activa) { const otra = pestanas.lista[i + 1] || pestanas.lista[i - 1]; cambiarPestana(otra.id); }
    pestanas.lista = pestanas.lista.filter(t => t.id !== id);
    guardarPestanas(); renderPestanas();
  }
  /* ¿sigue existiendo lo que enseña? (un esquema, una biblioteca o una nota que se tiraron a la papelera) */
  function existe(p) {
    const d = docs(); if (!d || !p) return false;
    if (p.nota) return !!d.nota(p.nota) && !d.enPapelera(p.nota);
    if (p.modo === 'texto') return !!refEsquema(p.esquema);
    if (p.modo === 'documentos') return !!p.papelera || !p.sub || (!!d.sub(p.sub) && (!p.seg || segmentoVivo(p)));
    return !p.esquema || !!refEsquema(p.esquema);
  }
  function podarPestanas() {
    if (!pestanas || reponiendo) return;
    const vivas = pestanas.lista.filter(t => t.id === pestanas.activa || existe(t.p));
    if (vivas.length !== pestanas.lista.length) { pestanas.lista = vivas; guardarPestanas(); }
  }
  /* el rótulo de una pestaña: la inicial de su clase (como en el árbol), su color si lo tiene y el nombre */
  function rotuloDe(p) {
    const d = docs(); if (!d) return { letra: '', nombre: '' };
    const conColor = (col, o) => { const t = col !== undefined && col !== null && C.PALETA_ETIQUETAS[col]; if (t) { o.chl = t[1]; o.chd = t[2]; } return o; };
    if (p.nota) { const n = d.nota(p.nota); return { tipo: 'nota', letra: 'N', que: 'Nota', nombre: n ? n.titulo || 'Sin título' : 'Nota' }; }
    if (p.modo === 'texto') {
      const r = refEsquema(p.esquema), doc = r && d.documentoEsquema(p.esquema);
      return conColor(r && r.esquema.color, { tipo: 'documento', letra: 'D', que: 'Documento', nombre: (doc && doc.titulo) || (r ? r.esquema.nombre : 'Documento') });
    }
    if (p.modo === 'documentos') {
      if (p.papelera) return { tipo: 'papelera', letra: '', que: 'Papelera', nombre: 'Papelera' };
      const r = p.sub && d.sub(p.sub);
      if (p.seg) {
        const m = /^etq:(.+)$/.exec(p.seg), e = m && d.etiqueta(m[1]);
        const nombre = e ? e.nombre : p.seg === 'bandeja' ? 'Sin segmento' : p.seg === 'apariciones' ? 'Apariciones' : 'Segmento';
        return { tipo: 'segmento', letra: 'S', que: 'Segmento' + (r ? ' de «' + r.sub.nombre + '»' : ''), nombre };
      }
      if (r && r.sub.lineaId) { const per = d.personaje(r.sub.lineaId); return conColor(per && per.color, { tipo: 'personaje', letra: 'P', que: 'Personaje', nombre: per ? per.nombre : r.sub.nombre }); }
      return conColor(r && r.sub.color, { tipo: 'sub', letra: 'B', que: 'Biblioteca', nombre: r ? r.sub.nombre : 'Documentos' });
    }
    const r = refEsquema(p.esquema);
    return conColor(r && r.esquema.color, { tipo: 'esquema', letra: 'E', que: 'Esquema', nombre: r ? r.esquema.nombre : 'Sin esquema' });
  }
  function montarPrimero() {
    const g = biblioteca.guion(abiertoId), d = g && docs(); if (!d) return;
    const r = d.migrarEsquema(g.datos, g.notas);
    if (r.cambio) { g.notas = {}; biblioteca.marcar(abiertoId); }
    restaurarPantalla();
  }
  function alCambiar() {
    clearTimeout(temporizador);
    temporizador = setTimeout(volcar, 300);
    if (typeof pintarEscalas === 'function') pintarEscalas();   // el botón de restablecer sigue a los tamaños propios (1.1.41)
  }

  /* Monta el proyecto de la ventana en el tablero, con sus pestañas (la de delante, como se dejó). */
  function montar(id) {
    if (temporizador) volcar();
    C.texto.cerrar();
    C.gestor.reiniciar();                                      // la nota abierta del gestor se guarda y se cierra
    const g = biblioteca.guion(id);
    abiertoId = g ? g.id : null; esquemaId = null;
    if (g) biblioteca.activar(g.id);
    pestanas = g ? cargarPestanas(g.id) : null;
    pantalla = 'proyecto';
    document.title = (g ? g.nombre + ' · ' : '') + 'ClapCraft';
    if (g && docs()) montarPrimero(); else { T.tablero.cargar(T.inicial()); document.body.classList.add('sin-esquema'); }
    persistir();
    C.gestor.mostrar();                                        // la barra de documentos está en todas las vistas
    aplicarPantalla();
    if (g && estado(g.id).archivo) recordarReciente(g.id);
    if (g) setTimeout(() => { if (abiertoId === g.id && typeof avisarCambiosDeClaude === 'function') avisarCambiosDeClaude(); }, 900);   // lo que hizo Claude con el proyecto cerrado (1.1.50)
  }

  /* Un guion recién creado que nadie ha tocado: se puede reutilizar para abrir un archivo. */
  function esVirgen(g) {
    if (!g || estado(g.id).archivo || Object.keys(g.notas).length || !g.nombre.startsWith(SIN_TITULO)) return false;
    if (JSON.stringify(g.datos || T.inicial()) !== JSON.stringify(T.inicial())) return false;
    const d = g.documentos; if (!d) return true;
    const conts = d.contenedores || [];
    if ((d.notas || []).length || (d.etiquetas || []).length || (d.papelera || []).length || conts.length > 1) return false;
    const inicial = JSON.stringify(T.inicial());
    return conts.every(c => (c.esquemas || []).every(e => JSON.stringify(e.datos) === inicial && !Object.keys(e.notas || {}).length));
  }

  /* ---------- la franja: el nombre del proyecto y sus pestañas ---------- */
  const barraPestanas = $('pestanas');
  let editandoPestana = false;                                   // con el nombre del proyecto en edición no se redibuja
  /* **Renombrar el proyecto** (Leo, 18-09-2026: «quiero poder cambiar el nombre del proyecto, sin que eso cambie el nombre del
     archivo automáticamente»): doble clic en su nombre, a la izquierda de las pestañas (o Archivo › Renombrar proyecto…), lo
     edita en sitio; Enter o salir del campo lo guarda, Esc lo deja. El nombre va dentro de su archivo, que se sigue llamando
     igual. */
  function editarNombrePestana(id) {
    const g = biblioteca.guion(id); if (!g || !barraPestanas || id !== abiertoId || pantalla === 'nuevo') return;
    const p = barraPestanas.querySelector('.franja-proyecto'), nom = p && p.querySelector('.pestana-nom');
    if (!nom || nom.querySelector('input')) return;
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'pestana-edit'; inp.value = g.nombre; inp.spellcheck = false;
    inp.setAttribute('aria-label', 'Nombre del proyecto');
    nom.textContent = ''; nom.appendChild(inp);
    p.classList.add('editando'); editandoPestana = true;
    inp.focus(); inp.select();
    let hecho = false;
    const acabar = guardarlo => {
      if (hecho) return; hecho = true;
      editandoPestana = false; p.classList.remove('editando');
      if (guardarlo) renombrarProyecto(id, inp.value); else renderPestanas();
    };
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); acabar(true); }
      else if (e.key === 'Escape') { e.preventDefault(); acabar(false); }
    });
    inp.addEventListener('blur', () => acabar(true));
    ['click', 'pointerdown', 'mousedown'].forEach(t => inp.addEventListener(t, e => e.stopPropagation()));
  }
  function renombrarProyecto(id, nombre) {
    const g = biblioteca.guion(id); if (!g) return false;
    const n = String(nombre || '').trim(), viejo = g.nombre;
    if (!n || n === viejo) { renderPestanas(); return false; }
    const r = biblioteca.renombrar(id, n);
    if (!r.ok) { T.tablero.avisar(r.aviso); renderPestanas(); return false; }
    /* **El contenedor que se llamaba como el proyecto cambia con él** (Leo, 18-09-2026, con captura: «solo se cambia en la
       pestaña, no en el header»): la cabecera «CONTENEDOR [Esquema]» enseña el contenedor y, con el nombre del proyecto, se
       leía como el nombre del proyecto. Vale el nombre de antes o el de su archivo, sin mayúsculas, acentos ni separadores
       (en el suyo: proyecto «amor toktiker», archivo «amor-tiktoker», contenedor «Amor tiktoker»). Los que se llaman de otra
       forma («Temporada 1») se quedan. */
    const d = id === abiertoId ? docs() : null, arch = estado(id).archivo;
    const iguales = d ? d.contenedoresLlamados([viejo, arch && sinExtension(arch.nombre)]) : [];
    const cambiados = iguales.filter(c => d.renombrarContenedor(c.id, n).ok);
    if (cambiados.length) { biblioteca.marcar(id); renderChipEsquema(); C.gestor.render(); if (C.texto.render) C.texto.render(); }
    persistir();                                   // el nombre nuevo va dentro de su archivo (si tiene), que no se renombra
    if (estado(id).archivo) recordarReciente(id); else comprobarEnlaces(id);   // sin archivo, sus enlaces llevan el nombre del proyecto (1.1.52)
    renderPestanas();
    const a = estado(id).archivo;
    T.tablero.avisar('Proyecto «' + g.nombre + '»' + (cambiados.length ? ' (y su contenedor)' : '') + (a ? ' · el archivo sigue siendo ' + a.nombre : ''));
    return true;
  }
  const svg = (n, t) => `<svg width="${t}" height="${t}" aria-hidden="true"><use href="#ic-${n}"></use></svg>`;
  function renderPestanas() {
    if (!barraPestanas || editandoPestana || (pestArr && pestArr.movido)) return;   // ni renombrando ni arrastrando una
    podarPestanas();
    barraPestanas.innerHTML = '';
    const g = biblioteca.guion(abiertoId), enProyecto = !!g && pantalla !== 'nuevo';
    if (g) {
      /* el proyecto de la ventana: su nombre (doble clic lo renombra) y si tiene cambios sin escribir */
      const est = estado(g.id), mod = modificado(g.id);
      const b = document.createElement('div');
      b.className = 'franja-proyecto'; b.dataset.proyecto = g.id;
      b.title = (est.archivo ? (est.archivo.ruta || est.archivo.nombre) : 'Solo en este equipo') + ' · doble clic: renombrar el proyecto';
      b.innerHTML = '<span class="pestana-nom"></span>' + (mod ? '<span class="pestana-sucio" title="Cambios sin guardar"></span>' : '');
      b.querySelector('.pestana-nom').textContent = g.nombre;
      barraPestanas.appendChild(b);
      document.title = g.nombre + (mod ? ' *' : '') + ' · ClapCraft';
    }
    if (enProyecto && pestanas) {
      const varias = pestanas.lista.length > 1;
      pestanas.lista.forEach(t => {
        const r = rotuloDe(t.p), activa = t.id === pestanas.activa;
        const b = document.createElement('div');
        b.className = 'pestana' + (activa ? ' activa' : ''); b.dataset.id = t.id; b.dataset.tipo = r.tipo || '';
        b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(activa));
        b.title = (r.que ? r.que + ' · ' : '') + r.nombre;
        b.innerHTML = (r.tipo === 'papelera' ? `<span class="pestana-tipo pestana-tipo--icono">${svg('trash', 12)}</span>` : `<span class="pestana-tipo pestana-tipo--${r.tipo}"></span>`)
          + '<span class="pestana-nom"></span>'
          + (varias ? `<button type="button" class="pestana-cerrar" data-cerrar title="Cerrar la pestaña">${svg('close', 12)}</button>` : '');
        const tipo = b.querySelector('.pestana-tipo');
        if (r.letra) tipo.textContent = r.letra;
        if (r.chl) { tipo.classList.add('con-color'); tipo.style.setProperty('--chl', r.chl); tipo.style.setProperty('--chd', r.chd); }
        b.querySelector('.pestana-nom').textContent = r.nombre;
        barraPestanas.appendChild(b);
      });
    }
    /* el «+» detrás de la última: una pestaña nueva en el primer elemento de Contenedores (1.1.35) */
    if (enProyecto && pestanas) {
      const mas = document.createElement('button');
      mas.type = 'button'; mas.className = 'pestana-nueva'; mas.dataset.nuevaPestana = '1'; mas.title = 'Pestaña nueva (Cmd+T)';
      mas.innerHTML = svg('plus', 14);
      barraPestanas.appendChild(mas);
    }
    /* la pestaña de «Nuevo proyecto», mientras se está creando uno en esta ventana */
    if (C.proyectos.hay()) {
      const b = document.createElement('div');
      b.className = 'pestana pestana-proyecto' + (pantalla === 'nuevo' ? ' activa' : ''); b.dataset.proyectoNuevo = '1';
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(pantalla === 'nuevo'));
      b.innerHTML = '<span class="pestana-nom">Nuevo proyecto</span><span class="pestana-sucio" title="Sin crear"></span>'
        + `<button type="button" class="pestana-cerrar" data-cerrar title="Cancelar el proyecto nuevo">${svg('close', 12)}</button>`;
      barraPestanas.appendChild(b);
      if (pantalla === 'nuevo') document.title = 'Nuevo proyecto · ClapCraft';
    }
    if (!g && pantalla !== 'nuevo') document.title = 'ClapCraft';
  }
  if (barraPestanas) barraPestanas.addEventListener('click', e => {
    if (e.target.closest('[data-nueva-pestana]')) { nuevaPestana(); return; }
    const f = e.target.closest('.franja-proyecto');
    if (f) { if (e.detail >= 2) editarNombrePestana(f.dataset.proyecto); else if (pantalla === 'nuevo' && abiertoId) { pantalla = 'proyecto'; aplicarPantalla(); } return; }
    const p = e.target.closest('.pestana'); if (!p) return;
    if (p.dataset.proyectoNuevo) { if (e.target.closest('[data-cerrar]')) cancelarProyecto(); else if (pantalla !== 'nuevo') { pantalla = 'nuevo'; aplicarPantalla(); C.proyectos.enfocar(); } return; }
    if (e.target.closest('[data-cerrar]')) { cerrarPestanaElemento(p.dataset.id); return; }
    if (pantalla === 'nuevo') { pantalla = 'proyecto'; aplicarPantalla(); }
    cambiarPestana(p.dataset.id);
  });
  if (barraPestanas) barraPestanas.addEventListener('auxclick', e => {     // botón central: cerrar
    const p = e.target.closest('.pestana'); if (p && e.button === 1) { e.preventDefault(); if (p.dataset.proyectoNuevo) cancelarProyecto(); else cerrarPestanaElemento(p.dataset.id); }
  });
  /* **Las pestañas se ordenan arrastrándolas** (Leo, 18-09-2026): a los 5 px la pestaña sigue al puntero y las demás se apartan
     (se recolocan de verdad con una animación FLIP); al soltar, ese orden es el de la lista. Un clic sin moverse la sigue
     abriendo. */
  let pestArr = null;
  const pestanasDe = () => Array.from(barraPestanas.querySelectorAll('.pestana[data-id]'));
  if (barraPestanas) barraPestanas.addEventListener('pointerdown', e => {
    const p = e.target.closest('.pestana[data-id]');
    if (!p || e.button !== 0 || editandoPestana || e.target.closest('[data-cerrar], input')) return;
    pestArr = { id: p.dataset.id, el: p, x0: e.clientX, movido: false };
  });
  window.addEventListener('pointermove', e => {
    if (!pestArr) return;
    const P = pestArr;
    if (!P.movido) {
      if (Math.abs(e.clientX - P.x0) < 5) return;
      P.movido = true; P.izq0 = P.el.getBoundingClientRect().left;
      P.el.classList.add('arrastrando'); document.body.classList.add('moviendo-pestana');
    }
    const r = P.el.getBoundingClientRect(), izq = P.izq0 + (e.clientX - P.x0), centro = izq + r.width / 2;
    /* delante de la primera cuyo centro quede a la derecha del de la arrastrada */
    const otras = pestanasDe().filter(x => x !== P.el);
    const ref = otras.find(x => { const b = x.getBoundingClientRect(); return b.left + b.width / 2 > centro; })
      || barraPestanas.querySelector('.pestana-proyecto');
    if (ref !== P.el.nextElementSibling) {
      const antes = new Map(otras.map(x => [x, x.getBoundingClientRect().left]));
      barraPestanas.insertBefore(P.el, ref || null);
      otras.forEach(x => {
        const dx = antes.get(x) - x.getBoundingClientRect().left;
        if (dx && x.animate) x.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 160, easing: 'cubic-bezier(.2,.8,.3,1)' });
      });
    }
    const enSuSitio = P.el.getBoundingClientRect().left - (P.tx || 0);   // dónde queda sin el desplazamiento que lleva
    P.tx = izq - enSuSitio; P.el.style.transform = `translateX(${P.tx}px)`;
  });
  const soltarPestana = () => {
    const P = pestArr; pestArr = null; if (!P) return;
    if (!P.movido) return;
    P.el.classList.remove('arrastrando'); P.el.style.transform = ''; document.body.classList.remove('moviendo-pestana');
    if (pestanas) {
      const orden = pestanasDe().map(x => x.dataset.id);
      pestanas.lista.sort((a, b) => orden.indexOf(a.id) - orden.indexOf(b.id));
      guardarPestanas();
    }
    renderPestanas();
  };
  window.addEventListener('pointerup', soltarPestana);
  window.addEventListener('pointercancel', soltarPestana);

  /* ---------- ventanas: abrir otra, cerrar esta (Electron por su puente; el navegador, con window.open) ---------- */
  /* ¿Lleva ya un proyecto de verdad esta ventana? (uno recién creado sin tocar se puede sustituir) */
  const ocupada = () => { const g = biblioteca.guion(abiertoId); return !!g && !esVirgen(g); };
  function abrirVentana(q) {
    if (api && api.abrirVentana) return api.abrirVentana(q);
    const u = new URL(location.href); u.search = new URLSearchParams(q).toString();
    window.open(u.href, '_blank');
    return Promise.resolve({ ok: true });
  }
  /* cierra esta ventana (salvo, sin `forzar`, si es la única: ahí se queda en «Sin proyectos») */
  async function cerrarVentana(forzar) {
    if (api && api.cerrarVentana) return api.cerrarVentana({ forzar: !!forzar });
    if (window.opener || forzar) { window.close(); return true; }
    return false;
  }
  /* lo que la ventana le dice a Electron: su proyecto y su archivo (para no abrir dos veces el mismo y volver a abrir las
     ventanas al arrancar); y su dirección lleva el proyecto, así una recarga vuelve a él */
  let informado = '';
  function informarVentana() {
    const g = biblioteca.guion(abiertoId), a = g && estado(g.id).archivo;
    const info = { id: g ? g.id : null, nombre: g ? g.nombre : null, ruta: (a && a.ruta) || null, nuevo: pantalla === 'nuevo', enlaces: g ? nombresEnlace(g.id) : [] };
    const k = JSON.stringify(info); if (k === informado) return; informado = k;
    if (api && api.ventanaProyecto) api.ventanaProyecto(info);
    const ahora = new URLSearchParams(location.search).get('p');
    if ((g ? g.id : null) !== ahora) { try { history.replaceState(null, '', location.pathname + (g ? '?p=' + encodeURIComponent(g.id) : '')); } catch (_) {} }
  }

  /* ---------- proyectos: la pestaña «Nuevo proyecto» y «Sin proyectos» (js/claquedraw/proyectos.js) ---------- */
  let pantalla = 'proyecto';                                   // 'nuevo': se ve la pestaña de creación
  function aplicarPantalla() {
    if (pantalla === 'nuevo' && !C.proyectos.hay()) pantalla = 'proyecto';
    const nuevoVisible = pantalla === 'nuevo', vacio = !nuevoVisible && !biblioteca.total();
    const eraNuevo = document.body.classList.contains('pantalla-nuevo');
    document.body.classList.toggle('pantalla-nuevo', nuevoVisible);
    document.body.classList.toggle('sin-proyectos', vacio);
    if (nuevoVisible && !eraNuevo) { C.gestor.salir(); C.proyectos.render(); }
    if (vacio) C.proyectos.renderVacio();
    renderPestanas();
  }
  /* «Nuevo» (Ctrl+N, Archivo › Nuevo proyecto…): la pantalla de creación, o vuelve a ella. **En una ventana con proyecto, en
     otra ventana** (1.1.33). */
  function nuevo() {
    if (ocupada()) { abrirVentana({ nuevo: '1' }); return; }
    if (temporizador) volcar();
    volcarTexto();
    C.proyectos.empezar();
    pantalla = 'nuevo'; aplicarPantalla(); C.proyectos.enfocar();
  }
  function cancelarProyecto() {
    C.proyectos.descartar(); pantalla = 'proyecto'; aplicarPantalla(); informarVentana();
    if (!biblioteca.guion(abiertoId)) cerrarVentana(false);   // una ventana abierta solo para crearlo se cierra (si no es la única)
  }
  /* Crea el proyecto de la pestaña de creación: sus documentos salen de la plantilla y nace con su archivo (y desde entonces
     se guarda ahí solo). **Primero se elige el archivo** (Leo, 18-09-2026: ya no hay «Dónde se guarda» en la pantalla):
     «Crear proyecto» abre el diálogo de guardar del sistema con el nombre propuesto (`C.nombreArchivo`: «Año nuevo» →
     «anio-nuevo.clapcraft») y, si se cancela, no se crea nada y la pantalla sigue como estaba. La pestaña lleva el nombre
     del proyecto, no el del archivo. Sin diálogo (un navegador sin File System Access) se crea sin archivo, como antes.
     Devuelve el guion o null. */
  async function crearProyecto({ nombre, plantilla }) {
    const pl = C.plantillas.plantilla(plantilla);
    const n = biblioteca.nombreLibre(String(nombre || '').trim() || nombreSinTitulo());
    const destino = await elegirArchivoNuevo(C.nombreArchivo(n) + '.' + EXT);
    if (destino === false) return null;
    const previo = biblioteca.guion(abiertoId);
    if (previo && esVirgen(previo)) quitarDeLaVentana(previo.id);   // un «Sin título» sin tocar deja su sitio al nuevo
    const r = biblioteca.crear({ nombre: n, documentos: C.plantillas.documentos(pl.id) });
    if (!r.ok) { T.tablero.avisar(r.aviso); return null; }
    const g = r.guion;
    tonos[g.id] = pl.tono;
    C.proyectos.descartar();
    montar(g.id);
    if (destino) await archivoNuevo(g.id, destino);
    else T.tablero.avisar('Proyecto «' + g.nombre + '» creado · Guardar como… le da un archivo');
    return g;
  }
  /* El diálogo de guardar del sistema para un proyecto nuevo: `{ ruta }` (Electron: en la última carpeta usada, o en
     ~/Documents/ClapCraft si existe, o en Documentos), `{ handle }` (Chrome y Edge, que recuerdan la carpeta), false si se
     canceló y null si no hay diálogo. Un archivo que ya es de otro proyecto abierto no vale: se pisarían. */
  async function elegirArchivoNuevo(sugerido) {
    if (api && api.elegirArchivo) {
      let ruta = await api.elegirArchivo({ nombre: sugerido, carpeta: vista.carpetaProyectos && vista.carpetaProyectos.ruta, filters: FILTROS });
      if (!ruta) return false;
      if (!/\.clapcraft$/i.test(ruta)) ruta += '.' + EXT;
      if (api.buscarRuta && await api.buscarRuta(ruta, false)) { T.tablero.avisar(baseDe(ruta) + ' es el archivo de un proyecto que está abierto · elige otro nombre'); return false; }
      return { ruta };
    }
    if (window.showSaveFilePicker) {
      try { return { handle: await window.showSaveFilePicker({ suggestedName: sugerido, types: TIPOS, id: 'clapcraft-proyectos', startIn: 'documents' }) }; }
      catch (err) { if (err.name !== 'AbortError') T.tablero.avisar('No se pudo elegir el archivo'); return false; }
    }
    return null;
  }
  /* Vincula el proyecto recién creado al archivo elegido y lo escribe; la carpeta queda para el próximo proyecto. */
  async function archivoNuevo(id, destino) {
    const g = biblioteca.guion(id); if (!g) return;
    if (destino.ruta) {
      const base = baseDe(destino.ruta);
      vincular(id, { nombre: base, ruta: destino.ruta });
      vista.carpetaProyectos = { ruta: destino.ruta.slice(0, Math.max(0, destino.ruta.length - base.length - 1)) }; guardarVista();
    } else vincular(id, { nombre: destino.handle.name, handle: destino.handle });
    const a = estado(id).archivo;
    if (!await escribirArchivo(id)) {
      desvincular(id);
      if (destino.handle) {           // el sistema dejó elegir el archivo pero no escribirlo (navegadores embebidos)
        descargar(serializar(g), a.nombre);
        T.tablero.avisar('Aquí no se puede escribir en ' + a.nombre + ': se descarga una copia. Prueba en Chrome, Edge o la app de escritorio');
      } else T.tablero.avisar('Proyecto creado, pero no se pudo escribir en ' + a.nombre + ' · usa Guardar como…');
      return;
    }
    recordarReciente(id); persistir();
    T.tablero.avisar('Proyecto «' + g.nombre + '» creado en ' + a.nombre + ' · se guarda ahí solo');
  }
  /* Sin proyecto en la ventana: nada montado; se ve «Sin proyectos». */
  function quedarSinProyectos() {
    C.texto.cerrar(); C.gestor.reiniciar();
    abiertoId = null; esquemaId = null; pestanas = null;
    T.tablero.cargar(T.inicial()); document.body.classList.add('sin-esquema');
    persistir(); aplicarPantalla();
  }
  /* Saca un proyecto de la ventana y de lo guardado en este equipo (su archivo, si tiene, no se toca). */
  function quitarDeLaVentana(id) {
    desvincular(id); delete estados[id];
    biblioteca.eliminar(id);
    try { localStorage.removeItem(PREFIJO_PROYECTO + id); } catch (_) {}
    if (vista.pestanas) delete vista.pestanas[id];
    if (vista.pantallas) delete vista.pantallas[id];
    idsPropios.add(id); guardarVista();
    if (id === abiertoId) { abiertoId = null; pestanas = null; }
  }

  /* ---------- recientes: los proyectos con archivo que se han abierto, para «Sin proyectos» ---------- */
  const CLAVE_RECIENTES = 'guiones.claquedraw.recientes', MAX_RECIENTES = 8;
  const tonos = {};                                            // guion → tono de su plantilla (al crearlo)
  const TONOS_RECIENTE = ['violeta', 'cielo', 'esmeralda', 'magenta', 'cobre', 'teal', 'indigo', 'rosa'];
  const recientes = () => (leerJSON(CLAVE_RECIENTES) || []).filter(r => r && r.clave && r.nombre);
  function recordarReciente(id) {
    const g = biblioteca.guion(id), a = estado(id).archivo; if (!g || !a) return;
    const clave = a.ruta || 'h:' + a.nombre;
    const lista = recientes(), previo = lista.find(r => r.clave === clave);
    const tono = tonos[id] || (previo && previo.tono) || TONOS_RECIENTE[[...g.nombre].reduce((n, c) => n + c.charCodeAt(0), 0) % TONOS_RECIENTE.length];
    const va = vista.archivos[id] || {}, ino = va.ino || (previo && previo.ino) || null;   // su identidad: si se renombra con el proyecto cerrado, se le encuentra (1.1.53)
    const dev = va.ino ? va.dev : previo && previo.dev;       // y su disco (1.1.55)
    const r = Object.assign({ clave, nombre: g.nombre, ruta: a.ruta || null, tono, estructura: C.plantillas.estructura(g.documentos), visto: Date.now() }, ino ? { ino } : {}, ino && dev ? { dev } : {});
    escribirJSON(CLAVE_RECIENTES, [r, ...lista.filter(x => x.clave !== clave)].slice(0, MAX_RECIENTES));
    if (a.handle) idb.set('reciente:' + clave, a.handle).catch(() => {});
  }
  function olvidarReciente(clave) {
    escribirJSON(CLAVE_RECIENTES, recientes().filter(r => r.clave !== clave));
    idb.del('reciente:' + clave).catch(() => {});
    if (document.body.classList.contains('sin-proyectos')) C.proyectos.renderVacio();
  }
  async function abrirReciente(clave) {
    const r = recientes().find(x => x.clave === clave); if (!r) return;
    const ya = biblioteca.datos.guiones.find(g => { const a = estado(g.id).archivo; return a && (a.ruta || 'h:' + a.nombre) === clave; });
    if (ya) { if (pantalla === 'nuevo') { pantalla = 'proyecto'; aplicarPantalla(); } return; }
    if (r.ruta && api && api.readFile) {
      /* se renombró con el proyecto cerrado (1.1.53): se le busca por su identidad; al abrirlo, sus enlaces se ponen al día */
      let ruta = r.ruta;
      if (r.ino && api.buscarArchivo) { try { const x = await api.buscarArchivo({ ruta, ino: r.ino, dev: r.dev }); if (x) ruta = x; } catch (_) {} }
      if (ruta !== r.ruta) olvidarReciente(clave);              // la entrada nueva la pone él al abrirse
      if (!await abrirRuta(ruta)) { olvidarReciente(clave); T.tablero.avisar('«' + r.nombre + '» ya no está en ' + r.ruta); }
      return;
    }
    let h = null; try { h = await idb.get('reciente:' + clave); } catch (_) {}
    if (!h) { olvidarReciente(clave); T.tablero.avisar('No se pudo recuperar «' + r.nombre + '»: ábrelo con Abrir un proyecto'); return; }
    try { if (await h.requestPermission({ mode: 'readwrite' }) !== 'granted') { T.tablero.avisar('Sin permiso para abrir ' + h.name); return; } } catch (_) {}
    await abrirHandle(h);
  }
  function pasarPestana(salto) {
    if (!pestanas || pestanas.lista.length < 2 || pantalla !== 'proyecto') return;
    const ids = pestanas.lista.map(t => t.id), i = ids.indexOf(pestanas.activa);
    cambiarPestana(ids[(i + salto + ids.length) % ids.length]);
  }
  /* Cmd+W: la pestaña de delante; si es la única, el proyecto (como un navegador con su última pestaña) */
  function cerrarLoDeDelante() {
    if (pantalla === 'nuevo') { cancelarProyecto(); return; }
    if (C.gestor.ventanaAbierta && C.gestor.ventanaAbierta()) { C.gestor.cerrarVentana(); return; }   // la ventana de una nota, lo primero (como en Notion)
    if (pestanas && pestanas.lista.length > 1) { cerrarPestanaElemento(pestanas.activa); return; }
    cerrarProyecto();
  }

  /* Cierra el proyecto de la ventana: si tiene archivo, escribe lo pendiente; si no y tiene contenido, pide confirmación (se
     perdería). Luego la ventana se cierra; si es la única, se queda en «Sin proyectos». Con `forzar` (el botón rojo de la
     ventana) se cierra aunque sea la única. */
  async function cerrarProyecto(op) {
    const forzar = !!(op && op.forzar), id = abiertoId, g = biblioteca.guion(id);
    if (!g) { if (pantalla === 'nuevo') C.proyectos.descartar(); await cerrarVentana(forzar); return; }
    const est = estado(id);
    volcarTodo();
    if (est.archivo) { if (!await escribirArchivo(id) && !await T.tablero.confirmar('No se pudo escribir en ' + est.archivo.nombre + '. ¿Cerrar «' + g.nombre + '» de todas formas? Se perderían los cambios.', 'Cerrar')) return; }
    else if (!esVirgen(g) && !await T.tablero.confirmar('¿Cerrar «' + g.nombre + '»? No está guardado en ningún archivo y se perderá.', 'Cerrar')) return;
    if (est.archivo) recordarReciente(id);
    quitarDeLaVentana(id);
    quedarSinProyectos(); informarVentana();
    await cerrarVentana(forzar);
  }

  /* ---------- archivo .clapcraft por pestaña ---------- */
  const FILTROS = [{ name: 'Guion de ClapCraft', extensions: [EXT] }];
  const TIPOS = [{ description: 'Guion de ClapCraft', accept: { 'application/octet-stream': ['.' + EXT] } }];
  const sinExtension = n => String(n || '').replace(/\.clapcraft$/i, '');
  const baseDe = ruta => String(ruta || '').split(/[\\/]/).pop();
  /* Lo que va al archivo: solo lo que hace falta para rehacer el guion, sin sangría: el nombre y los
     `documentos` (contenedores con sus esquemas y notas, bibliotecas, elenco, papelera). El tablero de la
     forma antigua (`g.datos`, `g.notas`) ya está migrado a los documentos y no viaja. Se compara como
     texto (`ultimoEscrito`) y se escribe comprimido (`empaquetar`). */
  const serializar = g => JSON.stringify({ app: 'clapcraft', formato: FORMATO_ARCHIVO, nombre: g.nombre, documentos: g.documentos });
  /* gzip con CompressionStream (Chromium/Electron, Safari 16.4+): el texto de un guion baja a ~1/5. Sin
     CompressionStream se escribe el JSON tal cual; al leer se reconoce por la firma de gzip (1f 8b). */
  async function empaquetar(texto) {
    if (!window.CompressionStream) return new TextEncoder().encode(texto);
    const flujo = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
  }
  async function desempaquetar(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b[0] === 0x1f && b[1] === 0x8b) {
      if (!window.DecompressionStream) throw new Error('este navegador no descomprime gzip');
      return new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    }
    return new TextDecoder().decode(b);
  }
  /* ¿Dos textos de archivo dicen lo mismo? Con los documentos normalizados y sin mirar el orden de las claves. El
     guion se compara como texto (`ultimoEscrito`), pero el mismo contenido puede quedar con las claves en otro orden
     (al abrir se normaliza; al montar un esquema el tablero vuelca sus datos a su manera): antes de escribir se mira
     si de verdad cambió; si no, no se toca el archivo (se reescribía al volver a arrancar sin haber cambiado nada,
     pasó el 15-09-2026). */
  /* `migrado` es una marca que la app pone sola al montar (el esquema de la forma antigua ya pasó a los documentos): no es un
     cambio, y al abrir un proyecto que no la tenía no lo reescribe (1.1.55) */
  const sinMarcas = d => { if (d && typeof d === 'object') delete d.migrado; return d; };
  const ordenado = v => Array.isArray(v) ? v.map(ordenado) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = ordenado(v[k]); return o; }, {}) : v;
  function mismoContenido(a, b) {
    if (!a || !b) return false;
    const plano = t => { const x = JSON.parse(t); if (x && x.documentos && typeof x.documentos === 'object') x.documentos = sinMarcas(C.normalizarDocumentos(x.documentos)); return JSON.stringify(ordenado(x)); };
    try { return plano(a) === plano(b); } catch (_) { return false; }
  }
  const mismosBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

  /* Estado de archivo de cada guion: { archivo: { nombre, ruta?, handle?, permiso }, ultimoEscrito,
     temporizador, escribiendo }. Se conserva mientras la pestaña esté abierta. */
  const estados = {};
  const estado = id => estados[id] || (estados[id] = { archivo: null, ultimoEscrito: null, temporizador: null, escribiendo: false });

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

  const sucio = id => { const g = biblioteca.guion(id), est = estado(id); return !!(est.archivo && g && serializar(g) !== est.ultimoEscrito); };
  /* Lo que enseña el asterisco de la pestaña: con archivo, cambios sin escribir; sin archivo, que ya
     se tocó (un «Sin título» recién abierto va limpio). */
  const modificado = id => { const g = biblioteca.guion(id); if (!g) return false; return estado(id).archivo ? sucio(id) : !esVirgen(g); };

  function indicador() {
    const e = $('estadoGuardado'); if (!e) return;
    const est = estado(abiertoId), a = est.archivo;
    let texto, pista, clase = '';
    if (!localOk && !a) { texto = 'Sin guardar'; pista = 'No se pudo guardar en este navegador'; clase = 'sucio'; }
    else if (!a) { texto = ''; pista = 'Sin archivo: Guardar como… lo crea y a partir de ahí se guarda solo'; }
    /* sin el nombre del archivo (Leo): solo el estado; el nombre y la ruta van en el globo */
    else if (a.permiso === false && a.ruta) { texto = 'Sin escribir'; pista = 'No se pudo escribir en ' + a.ruta + ' · se reintenta solo; Guardar lo intenta ya'; clase = 'sucio'; }
    else if (a.permiso === false) { texto = 'Reconectar'; pista = a.nombre + ' · pulsa Guardar para volver a escribir en el archivo'; clase = 'sucio'; }
    else if (sucio(abiertoId)) { texto = ''; pista = a.nombre + ' · cambios sin escribir (se guardan solos en un momento)'; clase = 'sucio'; }
    else { texto = ''; pista = 'Guardado en ' + (a.ruta || a.nombre); clase = 'ok'; }
    /* con archivo, que no quepa en este equipo no es no estar guardado: el archivo es la copia (1.1.55) */
    if (!localOk && a) pista += ' · no cabe en la copia de este equipo: el archivo es la única copia';
    e.innerHTML = (clase === 'sucio' ? '<span class="estado-punto"></span>' : clase === 'ok' ? '<svg width="13" height="13"><use href="#ic-check"></use></svg>' : '') + '<span></span>';
    e.lastElementChild.textContent = texto; e.title = pista; e.className = 'estado ' + clase;
  }

  function vincular(id, a) {
    const est = estado(id);
    est.archivo = Object.assign({ permiso: true }, a);
    est.ultimoEscrito = null;      // archivo nuevo: aún no tiene nada, aunque el contenido no haya cambiado
    vista.archivos[id] = { nombre: est.archivo.nombre, ruta: est.archivo.ruta || null }; guardarVista();
    if (est.archivo.handle) idb.set('archivo:' + id, est.archivo.handle).catch(() => {});
    else idb.del('archivo:' + id).catch(() => {});
    indicador(); renderPestanas(); informarVentana();
  }
  function desvincular(id) {
    const est = estado(id);
    est.archivo = null; est.ultimoEscrito = null; clearTimeout(est.temporizador);
    delete vista.archivos[id]; guardarVista();
    idb.del('archivo:' + id).catch(() => {});
    indicador(); renderPestanas(); informarVentana();
  }

  function programarEscritura(id) {
    const est = estado(id);
    if (!est.archivo || est.archivo.permiso === false || est.bloqueado) return;
    clearTimeout(est.temporizador);
    est.temporizador = setTimeout(() => escribirArchivo(id), 1000);
  }

  /* Escribe el guion en su archivo si cambió. Devuelve si quedó escrito.
     **Con otra escritura en marcha, espera a que acabe y vuelve a mirar** (1.1.55): antes devolvía false y, como ya había quitado el
     autoguardado pendiente, lo último no se escribía hasta el siguiente cambio (y cerrar en ese momento decía «No se pudo
     escribir»). Mientras se pregunta si cargar lo que cambió fuera (`est.bloqueado`), no se escribe: si no, el autoguardado
     pisaba la versión de fuera antes de elegir. Si falla, se reintenta solo (5 s, 10 s… hasta un minuto) y se avisa una vez. */
  async function escribirArchivo(id) {
    const est = estado(id), g = biblioteca.guion(id);
    clearTimeout(est.temporizador); est.temporizador = null;
    if (!est.archivo || !g || est.bloqueado) return false;
    if (est.escribiendo) return est.enCurso.then(() => escribirArchivo(id));
    let contenido = serializar(g);
    if (contenido === est.ultimoEscrito || mismoContenido(contenido, est.ultimoEscrito)) { anotarEscrito(id, contenido); indicador(); renderPestanas(); return true; }
    let sellado = false;
    if (sellarEnlaces(id)) { contenido = serializar(g); sellado = true; }   // el nombre de sus enlaces va dentro (1.1.52), solo si ya se escribe
    est.escribiendo = true;
    const a = est.archivo;
    const p = (async () => {
      try {
        const bytes = await empaquetar(contenido);
        if (a.ruta && api && api.writeFile) await api.writeFile({ path: a.ruta, content: bytes });
        else if (a.handle) await escribirHandle(a.handle, bytes);
        else return false;
        anotarEscrito(id, contenido); a.permiso = true;
        if (est.fallos) { est.fallos = 0; T.tablero.avisar('Guardado otra vez en ' + a.nombre); }
        clearTimeout(est.reintento); est.reintento = null;
        /* el sello también a la copia de este equipo: si no, al volver a arrancar el archivo se reescribía igual (1.1.55) */
        if (sellado && id === abiertoId && localOk) escribirJSON(PREFIJO_PROYECTO + id, g);
        return true;
      } catch (err) {
        /* el archivo se renombró justo ahora (electron/claude.js lo sigue y avisa): se escribe en el nuevo en cuanto llegue */
        if (/MOVIDO/.test(String(err && err.message))) { setTimeout(() => programarEscritura(id), 400); return false; }
        console.error('ClapCraft · no se pudo escribir en ' + a.nombre, err);
        a.permiso = false;
        est.fallos = (est.fallos || 0) + 1;
        if (est.fallos === 1) T.tablero.avisar('No se pudo escribir en ' + a.nombre + ' (' + motivoError(err && err.message) + ')' + (a.ruta ? ' · se reintenta solo; Guardar lo intenta ya' : ' · pulsa Guardar para reintentar'));
        if (a.ruta) {
          clearTimeout(est.reintento);
          est.reintento = setTimeout(() => { est.reintento = null; if (est.archivo !== a || a.permiso !== false) return; a.permiso = true; escribirArchivo(id); }, Math.min(60000, 5000 * 2 ** (est.fallos - 1)));
        }
        return false;
      } finally { est.escribiendo = false; indicador(); renderPestanas(); }
    })();
    est.enCurso = p.catch(() => false);
    return p;
  }
  /* un error de escritura dicho para Leo (sin la ruta del temporal ni el nombre del método de Electron) */
  function motivoError(m) {
    m = String(m || '');
    if (/EACCES|EPERM|EROFS|solo lectura/.test(m)) return 'no hay permiso para escribir en esa carpeta o en ese archivo';
    if (/ENOSPC/.test(m)) return 'no queda espacio en el disco';
    if (/ENOENT/.test(m)) return 'esa carpeta ya no existe';
    return m.replace(/^Error invoking remote method '[^']*': (Error: )?/, '').replace(/[^\s,']*\.tmp'?/g, '').trim();
  }
  /* espera a lo que se esté escribiendo y escribe lo que falte (salir de la app, electron/main.js) */
  async function escribirTodo() {
    volcarTodo();
    let ok = true;
    for (const g of biblioteca.datos.guiones) { if (estado(g.id).archivo && !await escribirArchivo(g.id)) ok = false; }
    return ok;
  }

  /* Escribe en un FileSystemFileHandle y comprueba releyendo: en algunos entornos (navegadores
     embebidos) el sistema deja elegir el archivo pero no escribirlo, y no siempre lo dice. */
  async function escribirHandle(h, bytes) {
    if (h.queryPermission && h.requestPermission) {
      try { if (await h.queryPermission({ mode: 'readwrite' }) !== 'granted') await h.requestPermission({ mode: 'readwrite' }); } catch (_) {}
    }
    const w = await h.createWritable();
    await w.write(bytes); await w.close();
    const leido = new Uint8Array(await (await h.getFile()).arrayBuffer());
    if (!mismosBytes(leido, bytes)) throw new Error('el archivo no quedó escrito (' + leido.length + ' de ' + bytes.length + ' bytes)');
  }

  const descargar = async (contenido, nombre) => {
    const blob = new Blob([await empaquetar(contenido)], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  /* «Guardar como…»: elige archivo, escribe y deja la pestaña vinculada a él. */
  async function guardarComo() {
    const id = abiertoId, g = biblioteca.guion(id); if (!g) return;
    volcar(); volcarTexto();
    const teniaArchivo = !!estado(id).archivo;                  // sus enlaces (1.1.52): el archivo de antes sigue siendo de aquel
    /* nombre propuesto: el del proyecto hecho nombre de archivo, como al crear («Año nuevo» → «anio-nuevo.clapcraft»); lo que
       se elija no cambia el nombre del proyecto (Leo, 18-09-2026) */
    const contenido = serializar(g), sugerido = C.nombreArchivo(g.nombre) + '.' + EXT;
    if (api && api.saveFile) {
      /* el archivo de otro proyecto abierto no vale (se pisarían: 1.1.55, electron/main.js lo rechaza) y un error se dice */
      let ruta;
      try { ruta = await api.saveFile({ defaultPath: sugerido, content: await empaquetar(contenido), filters: FILTROS }); }
      catch (err) {
        const m = String((err && err.message) || err);
        T.tablero.avisar(/ABIERTO/.test(m) ? 'Ese archivo es el de otro proyecto abierto · elige otro nombre' : 'No se pudo guardar ahí: ' + motivoError(m));
        return;
      }
      if (!ruta) return;
      vincular(id, { nombre: baseDe(ruta), ruta });
      anotarEscrito(id, contenido);
      if (C.enlaces && C.enlaces.renombrar(g.documentos, proyectoEnlaceDe(id), { corregir: !teniaArchivo }).cambio) { biblioteca.marcar(id); await escribirArchivo(id); informarVentana(); }
    } else if (window.showSaveFilePicker) {
      let h;
      try { h = await window.showSaveFilePicker({ suggestedName: sugerido, types: TIPOS }); }
      catch (err) { if (err.name !== 'AbortError') T.tablero.avisar('No se pudo elegir el archivo'); return; }
      vincular(id, { nombre: h.name, handle: h });
      if (C.enlaces) C.enlaces.renombrar(g.documentos, proyectoEnlaceDe(id), { corregir: !teniaArchivo });
      if (!await escribirArchivo(id)) {
        /* el sistema dejó elegir el archivo pero no escribirlo: que no quede un .clapcraft vacío sin aviso */
        desvincular(id);
        descargar(contenido, h.name);
        T.tablero.avisar('Aquí no se puede escribir en ' + h.name + ': se descarga una copia. Prueba en Chrome, Edge o la app de escritorio');
        return;
      }
    } else {
      descargar(contenido, sugerido);
      T.tablero.avisar('Descargado ' + sugerido + ' · este navegador no puede seguir guardando ahí solo');
      return;
    }
    recordarReciente(id); persistir();
    T.tablero.avisar('Guardado en ' + estado(id).archivo.nombre + ' · se seguirá guardando ahí solo');
  }

  /* «Guardar»: escribe ya en el archivo de la pestaña (reconectando si hace falta) o pide uno. */
  async function guardar() {
    const id = abiertoId, est = estado(id); if (!biblioteca.guion(id)) return;
    if (!est.archivo) return guardarComo();
    if (est.archivo.permiso === false && est.archivo.handle) {
      let p = 'denied';
      try { p = await est.archivo.handle.requestPermission({ mode: 'readwrite' }); } catch (_) {}
      if (p !== 'granted') { T.tablero.avisar('Sin permiso para escribir en ' + est.archivo.nombre + ' · usa Guardar como…'); return; }
      est.archivo.permiso = true;
    }
    /* sin haber podido leer el archivo al arrancar (el permiso del navegador, o no se leyó), antes de pisarlo se mira si cambió
       fuera mientras tanto (1.1.55) */
    if (est.ultimoEscrito === null && await releerAntesDeEscribir(id)) return;
    volcar(); volcarTexto();
    if (await escribirArchivo(id)) T.tablero.avisar('Guardado en ' + est.archivo.nombre);
  }
  async function releerAntesDeEscribir(id) {
    const est = estado(id), a = est.archivo, g = biblioteca.guion(id), v = vista.archivos[id];
    let texto = null;
    try {
      if (a.ruta && api && api.readFile) texto = await desempaquetar(await api.readFile({ path: a.ruta, binario: true }));
      else if (a.handle) texto = await desempaquetar(await (await a.handle.getFile()).arrayBuffer());
    } catch (_) { return false; }                               // no se lee (no existe, o está roto): se escribe
    if (texto === null || !g) return false;
    est.ultimoEscrito = texto;
    return !!(v && await cambiadoFuera(g, v, texto));
  }

  /* Abre el texto de un archivo en esta ventana: sustituye al proyecto si es un «Sin título» sin tocar; si ya está aquí, lo
     dice. Quien llama se ocupa de que la ventana no tenga otro proyecto (si no, lo abre en otra). Devuelve el guion o null. */
  function abrirDatos(texto, nombre, clave) {
    let datos;
    try { datos = JSON.parse(texto); } catch (_) { datos = null; }
    const valido = datos && datos.app === 'clapcraft' && datos.documentos && typeof datos.documentos === 'object' && !Array.isArray(datos.documentos);
    if (!valido) { T.tablero.avisar('Ese archivo no es un guion de ClapCraft'); return null; }
    if (clave) {
      const ya = biblioteca.datos.guiones.find(g => { const a = estado(g.id).archivo; return a && (a.ruta || a.nombre) === clave; });
      if (ya) { T.tablero.avisar('Ya estaba abierto: «' + ya.nombre + '»'); return null; }
    }
    /* el nombre del proyecto es el que lleva dentro, no el del archivo (Leo, 18-09-2026: renombrar el proyecto no cambia el
       archivo; antes el proyecto tomaba siempre el nombre del archivo al abrirlo) */
    const base = (typeof datos.nombre === 'string' && datos.nombre.trim()) || sinExtension(nombre) || SIN_TITULO;
    const actual = biblioteca.guion(abiertoId);
    if (actual && esVirgen(actual)) quitarDeLaVentana(actual.id);
    const r = biblioteca.crear({ nombre: base, documentos: datos.documentos });
    if (!r.ok) { T.tablero.avisar(r.aviso); return null; }
    montar(r.guion.id);
    return r.guion;
  }
  /* un archivo sin ruta ni handle (el input de archivos, o soltado en un navegador sin acceso a archivos): aquí o, con proyecto,
     en otra ventana, que lo lee de una clave de paso */
  function abrirTextoSuelto(texto, nombre) {
    if (ocupada()) {
      const k = idPestana(); escribirJSON(PREFIJO_PENDIENTE + k, { texto, nombre });
      abrirVentana({ t: k }); return null;
    }
    const g = abrirDatos(texto, nombre, null);
    if (g) T.tablero.avisar('Abierto ' + nombre + ' · este navegador no puede guardar ahí solo');
    return g;
  }
  async function abrirArchivo() {
    if (api && api.openFile) {
      const r = await api.openFile({ filters: FILTROS, binario: true });
      if (r) abrirRuta(r.path, r.content);
      return;
    }
    if (window.showOpenFilePicker) {
      let h;
      try { [h] = await window.showOpenFilePicker({ types: TIPOS, multiple: false }); }
      catch (err) { if (err.name !== 'AbortError') T.tablero.avisar('No se pudo abrir el archivo'); return; }
      await abrirHandle(h);
      return;
    }
    $('archivo').value = ''; $('archivo').click();            // sin acceso a archivos: solo lectura
  }
  /* Un FileSystemFileHandle (navegador: Abrir…, un reciente o un archivo soltado): se abre y queda vinculado. Con otro proyecto
     en la ventana, en una ventana nueva (el handle le llega por IndexedDB). */
  async function abrirHandle(h) {
    if (ocupada()) {
      const k = idPestana();
      try { await idb.set('pendiente:' + k, h); abrirVentana({ h: k }); } catch (_) { T.tablero.avisar('No se pudo abrir ' + h.name + ' en otra ventana'); }
      return null;
    }
    let f; try { f = await h.getFile(); } catch (_) { T.tablero.avisar('Sin permiso para leer ' + h.name + ': ábrelo con Abrir…'); return null; }
    let texto; try { texto = await desempaquetar(await f.arrayBuffer()); } catch (_) { T.tablero.avisar('No se pudo leer ' + f.name); return null; }
    const g = abrirDatos(texto, f.name, h.name); if (!g) return null;
    /* lo que tiene el archivo, no el proyecto ya montado: si al montar cambió algo (la papelera purgada, un esquema migrado), se
       escribe; si solo se normalizó, `mismoContenido` no lo reescribe (1.1.55) */
    vincular(g.id, { nombre: h.name, handle: h }); anotarEscrito(g.id, texto); programarEscritura(g.id); indicador(); renderPestanas();
    recordarReciente(g.id); comprobarEnlaces(g.id);
    T.tablero.avisar('Abierto ' + h.name + ' · se irá guardando ahí solo');
    return g;
  }
  /* Un archivo con ruta (Electron: diálogo o doble clic en el Finder). Si ya está abierto en otra ventana, se va a ella; con otro
     proyecto en esta, se abre en una nueva. */
  async function abrirRuta(ruta, contenido) {
    const donde = api && api.buscarRuta ? await api.buscarRuta(ruta, true) : null;
    if (donde === 'otra') return true;
    if (donde === 'aqui') { T.tablero.avisar('Ya está abierto en esta ventana'); return true; }
    if (ocupada()) { await abrirVentana({ ruta }); return true; }
    let texto;
    try { texto = await desempaquetar(contenido !== undefined ? contenido : await api.readFile({ path: ruta, binario: true })); }
    catch (_) { T.tablero.avisar('No se pudo leer ' + ruta); return false; }
    const nombre = baseDe(ruta);
    const g = abrirDatos(texto, nombre, ruta); if (!g) return true;
    vincular(g.id, { nombre, ruta }); anotarEscrito(g.id, texto); programarEscritura(g.id); indicador(); renderPestanas();   // lo del archivo (ver abrirHandle)
    recordarReciente(g.id); comprobarEnlaces(g.id);
    T.tablero.avisar('Abierto ' + nombre + ' · se irá guardando ahí solo');
    return true;
  }
  /* Un .clapcraft soltado en la ventana (sobre todo en «Sin proyectos», que lo anuncia): con su ruta en Electron, con su
     handle en Chrome/Edge (queda vinculado) y, si no, solo leído. */
  document.addEventListener('dragover', e => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  document.addEventListener('drop', async e => {
    const dt = e.dataTransfer; if (!dt || !dt.files || !dt.files.length) return;
    e.preventDefault();
    const f = Array.from(dt.files).find(x => /\.clapcraft$/i.test(x.name));
    if (!f) { T.tablero.avisar('Solo se abren proyectos de ClapCraft (.clapcraft)'); return; }
    const ruta = api && api.rutaDe && api.rutaDe(f);
    if (ruta && api.readFile) { abrirRuta(ruta); return; }
    const item = Array.from(dt.items || []).find(i => i.kind === 'file' && i.getAsFileSystemHandle);
    let h = null; try { h = item && await item.getAsFileSystemHandle(); } catch (_) {}
    if (h && h.kind === 'file' && /\.clapcraft$/i.test(h.name)) { await abrirHandle(h); return; }
    f.arrayBuffer().then(desempaquetar).then(t => abrirTextoSuelto(t, f.name)).catch(() => T.tablero.avisar('No se pudo leer ' + f.name));
  });
  $('archivo').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    f.arrayBuffer().then(desempaquetar).then(t => abrirTextoSuelto(t, f.name)).catch(() => T.tablero.avisar('No se pudo leer ' + f.name));
  });
  if (api && api.onAbrirRuta && api.readFile) api.onAbrirRuta(ruta => abrirRuta(ruta));

  /* ---------- lo que cambia fuera de ClapCraft (1.1.49) ----------
     Claude trabaja sobre el archivo de los proyectos que no están abiertos (claude/servidor.js), y también lo pueden cambiar
     iCloud, Dropbox u otra máquina. **La firma** de lo último que esta app escribió o leyó de cada archivo (el contenido, con
     los documentos normalizados y las claves ordenadas, resumido en un número) va en la vista (`vista.archivos[id].firma`): al
     volver a arrancar, si el archivo ya no tiene esa firma, alguien lo cambió mientras ClapCraft estaba cerrado y se carga el
     del archivo (antes, lo de aquí lo pisaba: «lo local es lo último»); si además aquí había cambios sin escribir, se pregunta.
     Con el proyecto abierto, Electron vigila el archivo (electron/claude.js, `archivo:cambiado`) y pasa lo mismo. */
  function firmaDe(texto) {
    let s;
    try { const x = JSON.parse(texto); if (x && x.documentos && typeof x.documentos === 'object') x.documentos = sinMarcas(C.normalizarDocumentos(x.documentos)); s = JSON.stringify(ordenado(x)); }
    catch (_) { s = String(texto || ''); }
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36) + '.' + s.length.toString(36);
  }
  /* lo último escrito (o leído) de su archivo, y su firma en la vista */
  function anotarEscrito(id, texto) {
    const est = estado(id), antes = est.ultimoEscrito;
    est.ultimoEscrito = texto;
    const v = vista.archivos[id]; if (!v || texto === null || texto === undefined) return;
    /* su inodo (1.1.52): si el archivo se renombra con ClapCraft cerrado, al volver se le encuentra por él */
    if (v.ruta && api && api.archivoId) api.archivoId(v.ruta).then(x => { if (x && x.ino && vista.archivos[id] === v && (v.ino !== x.ino || v.dev !== x.dev)) { v.ino = x.ino; v.dev = x.dev; guardarVista(); } }).catch(() => {});
    if (texto === antes && v.firma) return;
    const f = firmaDe(texto);
    if (v.firma !== f) { v.firma = f; guardarVista(); }
  }
  /* Pone en el proyecto lo que trae su archivo y lo vuelve a montar (el tablero, el gestor y la pestaña de delante). */
  function cargarDelArchivo(id, texto, aviso) {
    const g = biblioteca.guion(id); let datos;
    try { datos = JSON.parse(texto); } catch (_) { return false; }
    if (!g || !datos || datos.app !== 'clapcraft' || !datos.documentos || typeof datos.documentos !== 'object') return false;
    clearTimeout(temporizador); temporizador = null;
    C.texto.soltar();                                          // lo que había en el editor no vuelve a la nota vieja
    g.documentos = datos.documentos;
    if (typeof datos.nombre === 'string' && datos.nombre.trim()) g.nombre = datos.nombre.trim();
    anotarEscrito(id, texto);
    if (id === abiertoId) { recordarPantalla(); montar(id); } else persistir();
    if (aviso) T.tablero.avisar(aviso);
    return true;
  }
  /* Al arrancar: ¿cambió el archivo mientras ClapCraft estaba cerrado? Devuelve si se cargó el del archivo. */
  async function cambiadoFuera(g, v, texto) {
    const local = serializar(g);
    if (!v.firma || texto === local || mismoContenido(texto, local)) return false;   // sin firma (antes de la 1.1.49), lo de siempre
    if (firmaDe(texto) === v.firma) return false;                // el archivo es el que dejamos: lo de aquí es lo último
    if (firmaDe(local) !== v.firma && !await preguntarSinEscribir(g.id, '«' + g.nombre + '» cambió fuera de ClapCraft mientras estaba cerrado (Claude, por ejemplo) y aquí también hay cambios que no llegaron a escribirse. ¿Cargar la versión del archivo? Si no, se queda la de aquí y se escribe en el archivo.')) return false;
    return cargarDelArchivo(g.id, texto, 'Cargados los cambios de ' + v.nombre + ' hechos fuera de ClapCraft');
  }
  /* la pregunta de «cambió fuera»: mientras está abierta no se escribe en el archivo (el autoguardado pisaba lo de fuera antes de
     elegir, 1.1.55); al quedarse con lo de aquí, se escribe */
  async function preguntarSinEscribir(id, texto) {
    const est = estado(id);
    est.bloqueado = true; clearTimeout(est.temporizador); est.temporizador = null;
    let si = false;
    try { si = await T.tablero.confirmar(texto, 'Cargar la del archivo'); }
    finally { est.bloqueado = false; }
    if (!si) programarEscritura(id);
    return si;
  }
  if (api && api.onArchivoCambiado && api.readFile) api.onArchivoCambiado(async ruta => {
    const id = abiertoId, est = estado(id), a = est.archivo, g = biblioteca.guion(id);
    if (!g || !a || !a.ruta || a.ruta !== ruta || est.bloqueado) return;
    /* con una escritura en marcha, se espera y se mira después (antes se ignoraba el aviso y lo de fuera se perdía, 1.1.55) */
    if (est.escribiendo) await est.enCurso;
    if (est.archivo !== a || a.ruta !== ruta) return;
    let texto; try { texto = await desempaquetar(await api.readFile({ path: ruta, binario: true })); } catch (_) { return; }
    if (texto === est.ultimoEscrito || mismoContenido(texto, est.ultimoEscrito)) return;   // lo que escribió esta ventana
    volcarTodoSinSalir();
    if (mismoContenido(texto, serializar(g))) { anotarEscrito(id, texto); return; }        // ya lo tenía
    if (sucio(id) && !await preguntarSinEscribir(id, '«' + g.nombre + '» cambió fuera de ClapCraft y aquí hay cambios que aún no se escribieron. ¿Cargar la versión del archivo? Si no, se queda la de aquí y se escribe en el archivo.')) return;
    cargarDelArchivo(id, texto, 'Cargados los cambios de ' + a.nombre + ' hechos fuera de ClapCraft');
  });

  /* Al arrancar se retoman los archivos vinculados: en Electron por su ruta; en el navegador con el
     handle guardado, que puede exigir permiso otra vez (lo pide el primer «Guardar»). */
  async function retomarArchivos() {
    for (const g of biblioteca.datos.guiones) {
      const v = vista.archivos[g.id]; if (!v) continue;
      const est = estado(g.id);
      if (v.ruta && api && api.writeFile) {
        /* se renombró con ClapCraft cerrado (1.1.52): el archivo de la misma identidad (inodo) en su carpeta o en las de siempre */
        let renombrado = null;
        if (v.ino && api.buscarArchivo) { try { const r = await api.buscarArchivo({ ruta: v.ruta, ino: v.ino, dev: v.dev }); if (r && r !== v.ruta) renombrado = { antes: v.ruta, ahora: r }; } catch (_) {} }
        if (renombrado) { sellarConNombreDe(g.id, renombrado.antes); v.ruta = renombrado.ahora; v.nombre = baseDe(renombrado.ahora); guardarVista(); migrarVisto(renombrado.antes, renombrado.ahora); olvidarReciente(renombrado.antes); }
        est.archivo = { nombre: v.nombre, ruta: v.ruta, permiso: true };
        informarVentana();                                       // en cuanto se sabe (ver abajo)
        let texto = null;
        if (api.readFile) { try { texto = await desempaquetar(await api.readFile({ path: v.ruta, binario: true })); } catch (_) { est.archivo.permiso = false; } }
        if (renombrado) { recordarReciente(g.id); informarVentana(); }
        if (texto !== null) {
          est.ultimoEscrito = texto;
          const cargado = await cambiadoFuera(g, v, texto);
          comprobarEnlaces(g.id, { renombrado: !!renombrado });
          if (cargado) continue;
        }
      } else if (!v.ruta) {
        let h = null;
        try { h = await idb.get('archivo:' + g.id); } catch (_) {}
        if (!h) { delete vista.archivos[g.id]; guardarVista(); T.tablero.avisar('No se pudo recuperar ' + v.nombre + ': vuelve a elegirlo con Abrir… o Guardar como…'); continue; }
        est.archivo = { nombre: h.name || v.nombre, handle: h, permiso: false };
        try {
          if (await h.queryPermission({ mode: 'readwrite' }) === 'granted') {
            est.archivo.permiso = true;
            est.ultimoEscrito = await desempaquetar(await (await h.getFile()).arrayBuffer());
          }
        } catch (_) {}
        if (est.ultimoEscrito && await cambiadoFuera(g, v, est.ultimoEscrito)) continue;
      } else { delete vista.archivos[g.id]; guardarVista(); continue; }
      if (est.archivo.permiso) programarEscritura(g.id);       // lo local es lo último: si difiere, se escribe
    }
    /* y a Electron, su archivo: hasta el primer cambio le decía que la ventana no tenía ninguno (el aviso del arranque sale antes
       de retomarlo), así que no lo vigilaba, Claude lo tomaba por cerrado y escribía en él, y abrirlo desde el Finder abría otra
       ventana con el mismo archivo (1.1.55) */
    informarVentana();
    indicador(); renderPestanas();
  }

  /* ---------- arranque ---------- */
  if (escritorio) document.body.classList.add('escritorio');
  const ALTO_PARTIDA = T.tablero.alto();                        // el alto de carril de la hoja de estilos (80)
  /* **Todo lo del esquema se edita en el panel flotante** (js/claquedraw/flotante.js). En la 1.1.37 solo al crear (Leo: «el panel
     solo aparece en la creación, con un clic»), con el de abajo al lado; desde la 1.1.38 lo sustituye (Leo: «es extremadamente
     cómodo este panel flotante, sustitúyelo por el panel inferior, igual para que aparezca en las tramas, edición de nodos, edición
     de notas de manera individual o masiva si selecciono el nodo… que permanezca abajo del nodo o nota»). El tablero dice qué hay
     elegido (`panelFlotante`, en cada cambio y cada repintado) y el panel sale debajo: un nodo (o un salto: su nodo de salida) con
     sus notas; una nota, en el panel de su sitio con ella señalada; un enlace o una raya, sus notas; una trama o un acto, lo suyo.
     Cerrarlo (Esc, ×, un clic fuera) suelta lo elegido. Al crear (`alCrear`) lleva además el color. Lo escrito repinta el tablero
     un momento después y se guarda como cualquier cambio suyo. */
  let repintarTablero = null;
  const ctxTablero = {
    modelo: () => modelo,
    alCambiar: () => { clearTimeout(repintarTablero); repintarTablero = setTimeout(() => { T.tablero.render(); alCambiar(); }, 150); },
    anclaDe: q => {
      if (!q) return null;
      if (q.sel) return T.tablero.anclaDe(q.sel.tipo, q.sel.id);
      if (q.tipo === 'nodo') return T.tablero.anclaDe('punto', q.id);
      if (q.tipo === 'lugar') return q.lugar.a ? T.tablero.anclaDe('enlace', q.lugar.a) : T.tablero.anclaDe('raya', q.lugar.lineaId + '|' + q.lugar.col);
      return T.tablero.anclaDe(q.tipo, q.id);
    },
    area: () => { const b = document.getElementById('board'); return b && b.getBoundingClientRect(); },
    conNodo: false, avisar: (t, accion) => T.tablero.avisar(t, accion),
    copiarEnlace: q => copiarEnlaces(refDeFlot(q)),            // su botón de enlace y el de cada nota (1.1.52)
    /* un clic en lo propio (arrastrarlo, por ejemplo) no lo cierra */
    dentro: t => { const q = C.flotante.abierto(), a = q && ctxTablero.anclaDe(q), caja = a && a.closest ? a.closest('.pt, .nota') || a : null; return !!(caja && caja.contains(t)); },
    marcar: q => { if (!q && !T.tablero.enArrastre()) T.tablero.soltar(); }   // cerrado: se suelta lo elegido (arrastrando, no: solo se esconde)
  };
  /* lo elegido en el tablero → lo que enseña el panel */
  function queDeSel(s) {
    const m = modelo;
    if (s.tipo === 'punto') return { tipo: 'nodo', id: s.id, sel: s };
    if (s.tipo === 'salto') { const x = m.salto(s.id); return x ? { tipo: 'nodo', id: x.deId, sel: s } : null; }
    if (s.tipo === 'nota') { const n = m.nota(s.id); return n ? Object.assign(C.flotante.sitioDeNota(m, n), { marca: n.id, sel: s }) : null; }
    if (s.tipo === 'enlace') { const a = m.punto(s.id), b = a && m.siguienteEnTrama(a.id); return b ? { tipo: 'lugar', lugar: { lineaId: a.lineaId, a: a.id, b: b.id }, sel: s } : null; }
    if (s.tipo === 'raya') { const [lid, c] = s.id.split('|'); return { tipo: 'lugar', lugar: { lineaId: lid, col: +c }, sel: s }; }
    if (s.tipo === 'linea' || s.tipo === 'acto') return { tipo: s.tipo, id: s.id, sel: s };
    return null;
  }
  const alElegir = s => {
    const F = C.flotante; if (!F) return;
    const nuestro = F.abierto() && F.contexto() === ctxTablero;
    /* con el menú del clic derecho abierto, el panel no sale encima de él (1.1.52): el menú es lo que se pidió */
    const menu = document.getElementById('menu');
    if (s && menu && menu.classList.contains('show')) { if (nuestro && !F.igual(queDeSel(s) || {})) F.cerrar(); return; }
    const q = s && vista.modo === 'esquema' && queDeSel(s);
    if (!q) { if (nuestro) F.cerrar(); return; }
    if (nuestro && F.igual(q)) { F.refrescar(); return; }
    F.abrir(q, ctxTablero.anclaDe(q), ctxTablero);
  };
  const alCrear = (x, el) => {
    if (!C.flotante) return;
    if (x.tipo === 'nodo') C.flotante.abrir({ tipo: 'nodo', id: x.id, nuevo: true, foco: 'titulo' }, el, ctxTablero);
    else C.flotante.abrirNota(x.id, el, ctxTablero);
  };
  T.tablero.iniciar({ modelo, alCambiar, alCrear, zoom: vista.zoom,
    alVista: fin => { if (fin) recordarZoom(); else pintarZoom(); } });   // pellizcar mueve el zoom de la vista (1.1.51): el porcentaje al momento, y se recuerda al acabar
  T.tablero.panelFlotante(alElegir);
  if (vista.alto) T.tablero.alto(vista.alto);
  abiertoId = biblioteca.activo() ? biblioteca.activo().id : null;
  pestanas = abiertoId ? cargarPestanas(abiertoId) : null;
  document.title = (abiertoId ? biblioteca.activo().nombre + ' · ' : '') + 'ClapCraft';
  C.proyectos.iniciar({ crear: crearProyecto, cancelar: cancelarProyecto, nuevo: () => nuevo(), abrir: () => abrirArchivo(), abrirReciente, recientes,
    version: () => api && api.version ? api.version() : fetch('package.json').then(r => r.json()).then(j => j.version) });
  if (!abiertoId) document.body.classList.add('sin-esquema');
  persistir();
  aplicarPantalla();
  retomarArchivos();

  /* ---------- tema (igual que tramas.html: mismo atributo y misma clave) ---------- */
  const esOscuro = () => document.documentElement.dataset.theme === 'dark';
  function aplicarTema(oscuro) {
    document.documentElement.dataset.theme = oscuro ? 'dark' : 'light';
    const b = $('temaBtn');
    if (b) { b.title = oscuro ? 'Modo claro' : 'Modo oscuro'; b.classList.toggle('on', oscuro); }   // el icono (sol) va en el HTML
    if (api && api.informarTema) api.informarTema(oscuro);    // el menú Ver dice «Modo claro» u «oscuro»
  }
  const guardarTema = () => { try { localStorage.setItem(CLAVE_TEMA, esOscuro() ? 'dark' : 'light'); } catch (_) {} };
  function alternarTema() {
    aplicarTema(!esOscuro());
    C.texto.tema(esOscuro());                                  // el editor del marco va a la par
    guardarTema();
  }
  aplicarTema(esOscuro());
  $('temaBtn').onclick = alternarTema;

  /* ---------- vistas: esquema de pasos / texto ----------
     La vista de texto (js/claquedraw/texto.js) mete index.html en un marco y enseña, encima de su
     cinta, la tira de la trama: una nota por nodo. Al volver al esquema se selecciona en el tablero el
     nodo de la nota abierta, y se pinta de nuevo por si el título cambió desde el editor. */
  C.texto.iniciar({
    marco: $('editorMarco'), tira: $('hilo'), seccion: $('texto'), cabecera: $('textoCab'), tip: $('tip'), biblioteca,
    contenedor: () => { const r = refEsquema(esquemaId); return r ? r.contenedor.nombre : ''; },
    /* el elenco del guion para el editor: sugerencias de «/» y colores */
    elenco: () => (docs() ? docs().elenco().map(p => ({ name: p.nombre, color: p.color })) : []),
    /* «Ver biblioteca» de la cabecera del editor: la biblioteca enlazada al esquema montado */
    tieneBiblioteca: () => !!(esquemaId && docs() && docs().enlace(esquemaId)),
    verBiblioteca: () => { const x = esquemaId && docs() && docs().enlace(esquemaId); if (x) C.gestor.abrirSub(x.sub.id); },
    /* el chip del esquema en la cabecera del editor: su nombre, con su color si se le puso uno */
    esquemaChip: () => {
      const r = refEsquema(esquemaId); if (!r) return null;
      const c0 = r.esquema.color, t0 = c0 !== undefined && c0 !== null && C.PALETA_ETIQUETAS[c0];
      return t0 ? { nombre: r.esquema.nombre, chl: t0[1], chd: t0[2] } : { nombre: r.esquema.nombre };
    },
    modelo: () => modelo, guion: () => biblioteca.guion(abiertoId),
    guardar: persistir, alCambiarTablero: alCambiar, avisar: T.tablero.avisar, vista, guardarVista,
    alternar: () => verVista(vista.modo === 'texto' ? 'esquema' : 'texto'), alternarLado: () => alternarLado(), documentos: () => ordenes.documentos(),
    volver: () => { C.gestor.contraer(); verVista('esquema'); },
    exportar: rect => exportarDesdeEditor(rect),
    versiones: rect => menuVersiones(rect),
    copiarEnlace: () => copiarLoElegido(), copiarTramo: t => copiarTramo(t), copiarEnlaceFlot: q => copiarEnlaces(refDeFlot(q)),   // enlaces (1.1.52)
    alTema: oscuro => { if (oscuro !== esOscuro()) { aplicarTema(oscuro); guardarTema(); } }
  });

  const nombreProyecto = () => { const g = biblioteca.guion(abiertoId); return g ? g.nombre : ''; };
  /* El documento que exporta cada sitio: el que hay abierto en el editor (el del esquema, un guion generado o una nota
     de biblioteca). Leo, 16-09-2026: sin «Revisar guión», se exporta lo que se está escribiendo. */
  function documentoAExportar() {
    const d = docs(); if (!d) return null;
    volcarTexto();
    const nid = C.gestor.notaAbierta() || (C.texto.enDocumento() ? docId : null);
    const n = nid && d.nota(nid);
    return n ? { titulo: n.titulo, html: n.html } : null;
  }
  /* ---------- versiones del documento abierto (Leo, 16-09-2026) ----------
     Un esquema tiene un documento y dentro suyo sus versiones: el botón «Versiones» de la barra inferior del editor
     abre la lista (js/claquedraw/versiones.js), «Guardar versión…» pide el nombre en el modal de siempre y se puede
     comparar cualquiera con lo que hay ahora. */
  const disparadorEn = rect => ({ getBoundingClientRect: () => rect, classList: { add() {}, remove() {} }, focus() {} });
  function notaAbiertaEnEditor() {
    const d = docs(); if (!d) return null;
    const nid = C.gestor.notaAbierta() || (C.texto.enDocumento() || vista.modo === 'texto' ? docId : null);
    return (nid && d.nota(nid)) || null;
  }
  /* la versión que hay en el editor: la que coincide con su texto (si no, aún no se ha guardado) */
  const versionActual = n => ((n.versiones || []).find(v => v.html === n.html) || {}).id || null;
  function pintarVersion() {
    const n = notaAbiertaEnEditor();
    C.texto.versionEnBoton(n ? ((n.versiones || []).find(v => v.id === versionActual(n)) || {}).nombre : null);
  }
  function menuVersiones(rect) {
    const d = docs(); volcarTexto();
    const n = notaAbiertaEnEditor(); if (!n) { T.tablero.avisar('Aquí no hay documento'); return; }
    const trigger = disparadorEn(rect);
    const tras = r => { if (!r.ok) { T.tablero.avisar(r.aviso); return false; } biblioteca.marcar(abiertoId); persistir(); pintarVersion(); return true; };
    C.versiones.menu(trigger, { titulo: n.titulo, versiones: d.versionesDe(n.id), actual: versionActual(n), html: n.html }, {
      cargar: async vid => {
        C.gestor.cerrarPop();
        const v = d.version(n.id, vid); if (!v) return;
        if (!versionActual(n) && !await T.tablero.confirmar('¿Cargar «' + v.nombre + '»? Lo que has escrito y no has guardado como versión se pierde.', 'Cargar')) return;
        if (!tras(d.cargarVersion(n.id, vid))) return;
        C.texto.soltar();                                      // lo que quedó en el editor no debe volver a la nota
        abrirEnEditor();
        T.tablero.avisar('Versión «' + v.nombre + '» cargada');
      },
      guardar: async () => {
        C.gestor.cerrarPop();
        const lista = d.versionesDe(n.id);
        const r0 = await C.gestor.pedirNombre({ ceja: 'Versión de «' + n.titulo + '»', titulo: 'Guardar versión',
          pista: 'Por ejemplo, v1 o Primer borrador', boton: 'Guardar', valor: 'v' + (lista.length + 1) });
        if (!r0) return;
        if (!r0.nombre.trim()) { T.tablero.avisar('Escribe un nombre para la versión'); return; }
        const r = d.guardarVersion(n.id, r0.nombre);
        if (tras(r)) T.tablero.avisar(r.aviso);
      },
      comparar: vid => {
        C.gestor.cerrarPop();
        const lista = d.versionesDe(n.id); if (!lista.length) return;
        const abrir = v => C.versiones.abrirComparacion({ nombre: v.nombre, html: v.html }, { nombre: 'Ahora', html: n.html });
        if (vid) { const v = d.version(n.id, vid); if (v) abrir(v); return; }
        if (lista.length === 1) { abrir(lista[0]); return; }
        C.gestor.menuLista(trigger, 'Comparar con la actual…', lista.map(v => ({ id: v.id, nombre: v.nombre })), id => abrir(d.version(n.id, id)));
      },
      renombrar: async vid => {
        C.gestor.cerrarPop();
        const v = d.version(n.id, vid); if (!v) return;
        const r0 = await C.gestor.pedirNombre({ ceja: 'Versión de «' + n.titulo + '»', titulo: 'Renombrar la versión', boton: 'Renombrar', valor: v.nombre });
        if (!r0 || !r0.nombre.trim()) return;
        tras(d.renombrarVersion(n.id, vid, r0.nombre));
      },
      eliminar: async vid => {
        const v = d.version(n.id, vid); if (!v) return;
        C.gestor.cerrarPop();
        if (!await T.tablero.confirmar('¿Eliminar la versión «' + v.nombre + '»? El documento de ahora no se toca.', 'Eliminar')) return;
        const r = d.eliminarVersion(n.id, vid);
        if (tras(r)) T.tablero.avisar(r.aviso);
      }
    });
  }

  /* «Exportar» de la barra inferior del editor (dentro del marco): el menú se abre en la página, sobre el botón */
  function exportarDesdeEditor(rect) {
    const disparador = { getBoundingClientRect: () => rect, classList: { add() {}, remove() {} }, focus() {} };
    C.exportar.menu(disparador, documentoAExportar, T.tablero.avisar);
  }

  /* ---------- gestor de documentos (vista Documentos) ---------- */
  C.gestor.iniciar({
    seccion: $('documentos'), lado: $('gdSide'), main: $('gdMain'), migas: $('migas'),
    alNavegar: () => recordarPantalla(),                       // lo abierto en el gestor entra en la última pantalla
    abrirEnPestana: x => abrirEnPestana(x),                    // «Abrir en pestaña» de los ⋯ (1.1.33)
    copiarEnlace: ref => copiarEnlaces(ref),                   // «Copiar enlace para Claude» de los ⋯ (1.1.52)
    irAEnlace: t => irAEnlace(t),                              // Cmd+clic en un clapcraft:// de la ventana de una nota (1.1.54)
    filtro: k => ((vista.filtros || {})[k]) || {}, ponerFiltro: ponerFiltroVista,   // los filtros de bibliotecas y segmentos (1.1.54)
    guion: () => biblioteca.guion(abiertoId), texto: C.texto, vista, guardarVista,
    biblioteca, alCambiarTablero: alCambiar,
    /* el modelo de un esquema: el montado si es ese, si no uno de solo lectura sobre sus datos */
    modeloDe: eid => { if (!eid) return null; if (eid === esquemaId) return modelo; const r = refEsquema(eid); return r ? new T.Modelo(r.esquema.datos) : null; },
    notasDe: eid => ({
      leer: id => eid ? docs().notaEsquema(eid, id) : null,
      guardar: (id, doc) => { if (!eid) return { ok: false }; const r = docs().guardarNotaEsquema(eid, id, doc); if (r.ok && r.cambio) biblioteca.marcar(abiertoId); return r; }
    }),
    /* cambia el título de un nodo de cualquier esquema (y el de su documento); si no es el montado, se
       escribe en sus datos */
    editarTituloNodo: (eid, id, titulo) => {
      if (!eid || !refEsquema(eid)) return;
      const nota = docs().notaEsquema(eid, id);
      if (nota) docs().guardarNotaEsquema(eid, id, Object.assign({}, nota, { title: titulo }));
      if (eid === esquemaId) { modelo.editarPunto(id, { titulo }); T.tablero.render(); volcar(); return; }
      const m = new T.Modelo(refEsquema(eid).esquema.datos); m.editarPunto(id, { titulo });
      docs().guardarEsquema(eid, m.toJSON()); biblioteca.marcar(abiertoId);
      persistir();
    },
    /* borra un nodo de cualquier esquema con su documento (la cronología de los documentos enlazados) */
    borrarNodo: (eid, id) => {
      const r = refEsquema(eid); if (!r) return { ok: false, aviso: 'Ese esquema ya no existe' };
      const m = eid === esquemaId ? modelo : new T.Modelo(r.esquema.datos);
      const x = m.borrarPunto(id); if (!x.ok) return x;
      if (eid === esquemaId) { T.tablero.render(); volcar(); }
      else docs().guardarEsquema(eid, m.toJSON());
      docs().podarNotasEsquema(eid, m.datos.puntos.map(p => p.id));
      biblioteca.marcar(abiertoId); persistir();
      return x;
    },
    /* abre el documento de un nodo en el editor (montando antes su esquema si hace falta) */
    /* un nodo ya no tiene documento propio (Leo, 16-09-2026): lleva a su sitio en el esquema */
    abrirNodo: (eid, id) => { if (!refEsquema(eid)) return; if (eid !== esquemaId) montarEsquema(eid); verVista('esquema'); if (id) seleccionarEnTablero(id); },
    esquemaMontado: () => esquemaId, modo: () => vista.modo, abrirTexto,
    crearEsquemaDatos: () => T.inicial(),
    /* **al volver a un esquema cuyo documento se dejó abierto, vuelve su editor** (Leo, 18-09-2026: «si abro el editor del
       esquema y luego me paso a un editor de un segmento, al regresar al editor del esquema me aparece en su lugar el esquema») */
    abrirEsquema: eid => { const volver = !!eid && eid === textoAntes; montarEsquema(eid || null); verVista(volver ? 'texto' : 'esquema'); },
    personajes, abrirPersonaje, verPersonajes, verContenedores, nuevoPersonaje: () => nuevoPersonaje(), renombrarPersonaje, eliminarPersonaje, colorPersonaje,
    nuevoEsquemaPersonaje: (trigger, carpetaId) => nuevoEsquemaPersonaje(trigger, carpetaId),
    enPersonajes, verArbol: cual => { vista.arbol = cual === 'personajes' ? 'personajes' : 'contenedores'; guardarVista(); },
    /* lo elegido en la barra se enseña en la vista Documentos (la barra está en todas) */
    /* la vista Documentos también cuando ya se creía en ella (al volver a la última pantalla, `vista.modo` viene guardado
       como «documentos» pero la página aún no la ha puesto: se veía el esquema detrás) */
    mostrarTablero: () => { if (vista.modo !== 'documentos' || !document.body.classList.contains('vista-documentos')) verVista('documentos'); },
    alternarLado: () => alternarLado(),
    volcar: () => { volcar(); volcarTexto(); },             // antes de duplicar o tirar: el tablero y el editor, a sus datos
    /* lo restaurado de la papelera: un personaje recupera sus carriles también en el esquema montado; un esquema, sin ninguno
       montado, se monta */
    restaurado: alRestaurar,
    esquemaEliminado: eid => { if (esquemaId === eid) montarEsquema(primerEsquema()); },
    esquemaCreado: eid => { if (!esquemaId) montarEsquema(eid); },   // con el tablero vacío, el nuevo se monta solo
    guardar: () => { if (abiertoId) biblioteca.marcar(abiertoId); persistir(); },
    irAlNodo: (id, eid) => { verVista('esquema'); if ((eid || null) !== esquemaId) montarEsquema(eid || null); if (id) seleccionarEnTablero(id); },
    avisar: T.tablero.avisar, confirmar: T.tablero.confirmar
  });
  montarPrimero(); persistir();                                // el gestor ya existe: migra y monta el primer esquema
  C.gestor.mostrar();

  /* ---------- el menú: desplegado (ancho a gusto, arrastrando su borde) o plegado al riel de 44 px (solo el botón de panel) ----------
     Si al arrastrar se hace más estrecho que LADO_PLIEGA se pliega; tirando del riel se despliega. El
     árbol conserva su estado. Doble clic en el borde: ancho de partida. */
  const LADO = { partida: 280, min: 220, max: 480, pliega: 160 };
  function aplicarLado() {
    document.body.classList.toggle('lado-plegado', !!vista.ladoPlegado);
    document.documentElement.style.setProperty('--lado-ancho', (vista.ladoAncho || LADO.partida) + 'px');
  }
  (function () {
    const asa = $('ladoBorde'); if (!asa) return;
    let arr = null;
    asa.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      arr = { x0: e.clientX, w0: $('gdSide').getBoundingClientRect().width, plegado: !!vista.ladoPlegado };
      asa.classList.add('activa'); document.body.classList.add('redimensionando');
      try { asa.setPointerCapture(e.pointerId); } catch (_) {}
    });
    asa.addEventListener('pointermove', e => {
      if (!arr) return;
      e.stopPropagation();
      const w = arr.w0 + e.clientX - arr.x0;
      vista.ladoPlegado = w < LADO.pliega;
      if (!vista.ladoPlegado) vista.ladoAncho = Math.round(Math.max(LADO.min, Math.min(LADO.max, w)));
      aplicarLado();
    });
    const soltar = e => {
      if (!arr) return;
      e.stopPropagation();
      arr = null;
      asa.classList.remove('activa'); document.body.classList.remove('redimensionando');
      guardarVista();                                          // plegar o ensanchar el menú es solo CSS: sin redibujar (de ClapBook: parpadeaba)
    };
    asa.addEventListener('pointerup', soltar);
    asa.addEventListener('pointercancel', soltar);
    asa.addEventListener('dblclick', e => { e.stopPropagation(); vista.ladoPlegado = false; delete vista.ladoAncho; guardarVista(); aplicarLado(); });
    asa.addEventListener('click', e => e.stopPropagation());
  })();
  function alternarLado() { vista.ladoPlegado = !vista.ladoPlegado; delete vista.ladoFijo; guardarVista(); aplicarLado(); }
  aplicarLado();
  /* el pie del esquema (escala, deshacer) no es un clic en blanco del tablero: no suelta la selección */
  document.querySelector('.esq-pie').addEventListener('click', e => e.stopPropagation());
  /* «Ver documentos»: los documentos enlazados al esquema montado, en la vista Documentos */
  $('verDocumentos').addEventListener('click', e => {
    e.stopPropagation();
    const x = esquemaId && docs() && docs().enlace(esquemaId);
    if (x) C.gestor.abrirSub(x.sub.id);
  });

  document.querySelector('#esquema > .esq-cab').addEventListener('click', e => {
    if (e.target.closest('#abrirDoc')) { e.stopPropagation(); abrirTexto(null); }   // el documento del esquema
  });

  /* ---------- columna de tramas: un carril de 48 px con la inicial de cada trama (rediseño) ----------
     El nombre y el tipo se asoman al pasar el ratón (CSS); se renombra y se cambia desde el panel. */
  T.tablero.gutter(48);

  /* Selecciona un nodo en el tablero desde fuera: su panel obedece a cualquier [data-hilo] (las
     flechas ‹ ›), así que basta con un botón efímero que lleve el id. */
  function seleccionarEnTablero(id) {
    if (!modelo.punto(id)) return;
    const b = document.createElement('button'); b.dataset.hilo = id; b.hidden = true;
    document.body.appendChild(b); b.click(); b.remove();
  }

  /* Tres vistas: esquema (el tablero), texto (el editor con la tira) y documentos (el gestor, con su
     barra lateral solo ahí; una nota abierta usa el mismo editor). */
  function verVista(modo) {
    modo = ['texto', 'documentos'].includes(modo) ? modo : 'esquema';
    const anterior = vista.modo, cambia = modo !== anterior;
    if (cambia && anterior === 'texto' && modo === 'documentos') textoAntes = esquemaId;   // al pulsar ese esquema, se vuelve a su editor
    else if (modo !== 'documentos') textoAntes = null;
    vista.modo = modo; guardarVista();
    if (cambia && anterior === 'documentos') C.gestor.salir();
    if (cambia && anterior === 'texto') volcarTexto();
    if (cambia && C.flotante && C.flotante.abierto()) C.flotante.cerrar();   // el panel flotante es de la vista que se deja

    document.body.classList.toggle('vista-texto', modo === 'texto');
    document.body.classList.toggle('vista-documentos', modo === 'documentos');
    /* el editor de nodos (texto) es parte del esquema: en la cabecera se ve como Esquema */
    const cabecera = modo === 'texto' ? 'esquema' : modo;
    document.querySelectorAll('[data-vista]').forEach(b => {
      b.classList.toggle('on', b.dataset.vista === cabecera);
      b.setAttribute('aria-selected', String(b.dataset.vista === cabecera));
    });
    if (modo === 'texto') {
      if (abiertoId) abrirEnEditor();
    } else if (modo === 'documentos') {
      C.gestor.mostrar();
    } else if (cambia) {
      T.tablero.render();
    }
    if (cambia && modo !== 'documentos') C.gestor.render();   // el menú señala lo que enseña la vista
    recordarPantalla();
  }
  document.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => verVista(b.dataset.vista)));

  /* tras cada render del tablero, los selectores de personaje (solo en el tablero de Personajes) */
  new MutationObserver(() => marcarPersonaje()).observe($('rows'), { childList: true });
  /* el círculo del carril (con las dos letras del personaje): su clic abre el selector y no llega al tablero */
  ['pointerdown', 'click', 'dblclick'].forEach(t => $('rows').addEventListener(t, e => {
    if (!esPersonajes(esquemaId) || !e.target.closest('.chip')) return;
    /* doble clic en el círculo: ir a ese personaje (Leo, 15-09-2026). También el segundo clic de un doble clic
       (`detail` 2): si el primero abrió el menú, el `dblclick` no siempre llega */
    if ((t === 'dblclick' || (t === 'click' && e.detail >= 2)) && !T.tablero.acabaDeReordenar()) {
      const row = e.target.closest('.row[data-linea]'), l = row && modelo.linea(row.dataset.linea);
      const p = l && l.personaje && docs().personaje(l.personaje);
      if (p) { e.stopImmediatePropagation(); e.preventDefault(); C.gestor.cerrarPop(); irAEsquemaPersonaje(p.id); return; }
    }
    e.stopPropagation();
    if (t === 'pointerdown') { const row = e.target.closest('.row[data-linea]'); if (row) T.tablero.arrastrarFila(e, row.dataset.linea); return; }
    if (t !== 'click' || T.tablero.acabaDeReordenar()) return;
    const row = e.target.closest('.row[data-linea]'), l = row && modelo.linea(row.dataset.linea); if (!l) return;
    C.gestor.menuCarril(e.target.closest('.chip'), { actual: l.personaje || null, salvo: conCarril(l.id),
      alElegir: pid => asignarCarril(l.id, pid), alQuitar: () => asignarCarril(l.id, null),
      alEliminar: () => eliminarCarril(l.id), alIr: () => { if (l.personaje) abrirPersonaje(l.personaje); } });
  }));
  /* «＋ personaje» (el «Nueva trama» del tablero): sin elegir tipo, se elige un personaje y nace su carril */
  $('rows').addEventListener('click', e => {
    const b = esPersonajes(esquemaId) && e.target.closest('#addLinea'); if (!b) return;
    e.stopPropagation(); e.preventDefault();
    C.gestor.menuCarril(b, { titulo: 'Añadir personaje', salvo: conCarril(), alElegir: pid => { const p = docs().personaje(pid); if (p) carrilNuevo(p); } });
  }, true);

  /* la pantalla ya la repuso `restaurarPantalla()` al montar el proyecto (Leo, 16-09-2026: antes se arrancaba siempre
     en Contenedores y en el primer esquema) */
  C.gestor.render();
  /* el editor se carga escondido desde el principio: así la primera nota no parpadea en blanco */
  if (vista.modo === 'esquema') setTimeout(() => C.texto.precargar(), 600);


  /* Escalas del tablero: horizontal (ancho de celda, T.tablero.zoom) y vertical (alto de carril,
     T.tablero.alto); se recuerdan en la vista y el botón vuelve a las de partida. */
  const ESCALA = { zoom: 1.7, alto: ALTO_PARTIDA };
  const zoom = $('zoom'), altoFila = $('altoFila'), escalaReset = $('escalaReset');
  const relleno = r => r.style.setProperty('--pct', ((r.value - r.min) / (r.max - r.min) * 100) + '%');   // la parte recorrida, en acento
  function pintarEscalas() {
    zoom.value = T.tablero.zoom(); altoFila.value = T.tablero.alto();
    relleno(zoom); relleno(altoFila);
    /* también se apaga cuando no hay filas ni columnas con tamaño propio (1.1.41) */
    escalaReset.disabled = T.tablero.zoom() === ESCALA.zoom && T.tablero.alto() === ESCALA.alto && !T.tablero.tamanos().total;
  }
  zoom.oninput = () => { T.tablero.zoom(+zoom.value); vista.zoom = +zoom.value; guardarVista(); pintarEscalas(); };
  altoFila.oninput = () => { T.tablero.alto(+altoFila.value); vista.alto = T.tablero.alto(); guardarVista(); pintarEscalas(); };
  escalaReset.onclick = () => {
    T.tablero.zoom(ESCALA.zoom); T.tablero.alto(ESCALA.alto); delete vista.zoom; delete vista.alto;
    if (T.tablero.restablecerTamanos()) { volcar(); T.tablero.avisar('Filas y columnas, a su tamaño normal'); }   // 1.1.41
    guardarVista(); pintarEscalas();
  };
  pintarEscalas();

  /* **Zoom de la vista** (1.1.40, Leo: «implementa un zoom en los esquemas para verlos más cerca»): acerca o aleja el esquema entero
     (`T.tablero.vista`), del 40 % al 300 % en pasos de 10 puntos; se recuerda por equipo (`vista.zoomEsq`) y va con Cmd/Ctrl + − 0
     y, desde la 1.1.51, pellizcando (el tablero lo cambia sin pasos y avisa con `alVista`). */
  const PASOS = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2, 2.5, 3];
  function pintarZoom() {
    const z = T.tablero.vista(), b = document.querySelector('.zoom-pct');
    if (b) { b.textContent = Math.round(z * 100) + ' %'; b.classList.toggle('on', Math.abs(z - 1) > 0.001); }
  }
  function recordarZoom() {
    const z = T.tablero.vista();
    if (Math.abs(z - 1) < 0.001) delete vista.zoomEsq; else vista.zoomEsq = z;
    guardarVista(); pintarZoom();
  }
  function zoomVista(d) {
    const z = T.tablero.vista();
    let n = 1;
    if (d) { const i = PASOS.findIndex(x => x > z + 0.001), j = [...PASOS].reverse().find(x => x < z - 0.001);
      n = d > 0 ? (i >= 0 ? PASOS[i] : PASOS[PASOS.length - 1]) : (j !== undefined ? j : PASOS[0]); }
    T.tablero.vista(n);
    recordarZoom();
  }
  document.querySelectorAll('[data-zoom]').forEach(b => { b.onclick = () => zoomVista(+b.dataset.zoom); });
  if (vista.zoomEsq) T.tablero.vista(vista.zoomEsq);
  pintarZoom();

  /* Deshacer y rehacer según dónde se esté: el editor tiene su historial; un campo con el foco (la descripción de un nodo, el
     panel de una nota, un nombre), el suyo, y el tablero, el suyo. En Electron el menú se lleva Cmd+Z antes de que llegue a la
     página (1.1.32: hasta entonces, escribiendo en un campo, deshacía el tablero; y en Documentos, el esquema escondido). */
  function historia(accion, tablero) {
    const marco = $('editorMarco'), a = document.activeElement;
    const enCampo = a && a !== document.body && a !== marco && (a.matches('input, textarea') || a.isContentEditable);
    if (a === marco || (!enCampo && (vista.modo === 'texto' || document.body.classList.contains('nota-abierta')))) { const d = marco.contentDocument; if (d) d.execCommand(accion); }
    else if (enCampo) document.execCommand(accion);
    else if (vista.modo === 'esquema') tablero();
  }
  const deshacer = () => historia('undo', () => T.tablero.deshacer());
  const rehacer = () => historia('redo', () => T.tablero.rehacer());

  $('btnGuardar').onclick = guardar;
  $('btnGuardarComo').onclick = guardarComo;
  $('btnAbrir').onclick = abrirArchivo;
  $('btnNuevo').onclick = nuevo;
  $('estadoGuardado').onclick = guardar;

  /* Órdenes del menú de la aplicación (Electron): Archivo, Edición y Ver. `cerrarVentana` llega del botón rojo de la ventana. */
  const ordenes = {
    nuevo, abrir: abrirArchivo, guardar, guardarComo,
    cerrar: () => cerrarProyecto(), cerrarPestana: cerrarLoDeDelante, cerrarVentana: () => cerrarProyecto({ forzar: true }),
    tema: alternarTema, vista: () => verVista(vista.modo === 'texto' ? 'esquema' : 'texto'),
    documentos: () => verVista(vista.modo === 'documentos' ? 'esquema' : 'documentos'),
    lado: () => alternarLado(), deshacer, rehacer,
    renombrar: () => { if (abiertoId && pantalla !== 'nuevo') editarNombrePestana(abiertoId); },
    nuevaPestana: () => nuevaPestana(), atras: () => irHistoria(-1), adelante: () => irHistoria(1),
    historialClaude: () => abrirHistorialClaude(),
    copiarEnlace: () => copiarLoElegido(), irEnlace: () => irAlEnlaceCopiado(),   // Claude › Copiar enlace / Ir al enlace copiado (1.1.52)
    pestanaSig: () => pasarPestana(1), pestanaAnt: () => pasarPestana(-1)
  };
  if (api && api.onMenu) api.onMenu(accion => {
    const fn = ordenes[accion]; if (fn) fn();
  });

  /* Atajos en el navegador (en Electron los lleva el menú y no llegan aquí). */
  document.addEventListener('keydown', e => {
    const cmd = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (cmd && k === 's') { e.preventDefault(); e.shiftKey ? guardarComo() : guardar(); }
    if (cmd && k === 'o') { e.preventDefault(); abrirArchivo(); }
    if (cmd && !e.shiftKey && k === 'n') { e.preventDefault(); nuevo(); }   // donde el navegador lo deje (Electron lo lleva el menú)
    if (cmd && e.shiftKey && k === 'g') { e.preventDefault(); ordenes.vista(); }
    if (cmd && e.shiftKey && k === 'f') { e.preventDefault(); ordenes.documentos(); }
    if (cmd && !e.shiftKey && !e.altKey && k === 'f' && vista.modo === 'documentos' && C.gestor.buscarEnVista && C.gestor.buscarEnVista()) e.preventDefault();   // buscar en la biblioteca (1.1.54)
    if (cmd && e.shiftKey && k === 'b') { e.preventDefault(); ordenes.lado(); }
    if (cmd && e.shiftKey && k === 'c' && !escritorio) { e.preventDefault(); copiarLoElegido(); }   // en Electron lo lleva el menú Claude
    if (e.ctrlKey && e.key === 'Tab') { e.preventDefault(); pasarPestana(e.shiftKey ? -1 : 1); }
    if (cmd && !e.shiftKey && k === 'w' && !escritorio) { e.preventDefault(); cerrarLoDeDelante(); }
    if (cmd && !e.shiftKey && k === 't' && !escritorio) { e.preventDefault(); nuevaPestana(); }
    const campo = e.target instanceof Element && (e.target.matches('input, textarea') || e.target.isContentEditable);
    if (cmd && !e.shiftKey && !campo && (e.key === '[' || e.key === ']')) { e.preventDefault(); irHistoria(e.key === '[' ? -1 : 1); }
    /* el zoom del esquema, con el tablero delante (1.1.40) */
    if (cmd && !campo && vista.modo === 'esquema' && ['+', '=', '-', '_', '0'].includes(e.key)) {
      e.preventDefault(); zoomVista(e.key === '0' ? 0 : e.key === '-' || e.key === '_' ? -1 : 1);
    }
  });

  /* Lo que se pidió desde otra ventana (o, la primera vez, el reparto de los proyectos de antes en sus ventanas) */
  (async function pedido() {
    try {
      if (params.has('nuevo') && !biblioteca.guion(abiertoId)) nuevo();
      else if (params.get('ruta')) await abrirRuta(params.get('ruta'));
      else if (params.get('h')) {
        const k = 'pendiente:' + params.get('h'); let h = null;
        try { h = await idb.get(k); await idb.del(k); } catch (_) {}
        if (h) await abrirHandle(h);
      } else if (params.get('t')) {
        const k = PREFIJO_PENDIENTE + params.get('t'), x = leerJSON(k);
        try { localStorage.removeItem(k); } catch (_) {}
        if (x) abrirDatos(x.texto, x.nombre, null);
      } else if (!g0 && inicial && vista.archivos[inicial] && vista.archivos[inicial].ruta && api && api.readFile) {
        /* la ventana lleva un proyecto que no está en este equipo (no cupo, 1.1.55): se abre de su archivo */
        const ruta = vista.archivos[inicial].ruta;
        idsPropios.add(inicial); delete vista.archivos[inicial]; guardarVista();
        await abrirRuta(ruta);
      }
    } finally { informarVentana(); }
    otrosDeAntes.forEach(id => abrirVentana({ p: id }));
  })();
  /* ---------- Claude (1.1.49) ----------
     Leo, 25-09-2026: «Haz que como Claude (cowork principalmente y también una "extensión" dentro del programa que puede existir o
     no) puedas acceder al contenido de la aplicación, tanto texto y muy principalmente la gestión de esquemas». El servidor MCP
     (claude/servidor.js) le pasa a esta ventana, por el puente de Electron (electron/claude.js), las peticiones para su proyecto,
     y aquí se ejecutan con las mismas herramientas que usa sobre los archivos (js/claquedraw/herramientas.js), pero en vivo: antes
     se vuelca lo del tablero y del editor a los documentos; después, si cambió el esquema montado, el tablero lo recarga y lo pinta
     (entra en su Deshacer como un paso), el editor relee su documento si cambió, y se guarda como cualquier cambio. El aviso dice
     qué hizo Claude y lleva «Deshacer» (revierte ese cambio del historial, ver abajo) e «Historial». */
  function estadoEnPantalla() {
    const d = docs(), r = refEsquema(esquemaId), sel = vista.modo === 'esquema' && r && T.tablero.seleccion ? T.tablero.seleccion() : null;
    const enVentana = vista.modo === 'documentos' && !C.gestor.notaAbierta() && C.gestor.notaElegida ? C.gestor.notaElegida() : null;   // la de su ventana (1.1.54)
    const nid = C.gestor.notaAbierta() || enVentana || (vista.modo === 'texto' ? docId : null), n = nid && d && d.nota(nid);
    let s = null;
    if (sel) {
      const p = sel.tipo === 'punto' && modelo.punto(sel.id), l = sel.tipo === 'linea' && modelo.linea(sel.id), a = sel.tipo === 'acto' && modelo.acto(sel.id);
      s = p ? 'el nodo ' + p.id + ' «' + (p.titulo || 'sin título') + '»' : l ? 'la trama ' + l.id + ' «' + l.nombre + '»' : a ? 'el acto ' + a.id + ' «' + a.nombre + '»'
        : sel.tipo === 'salto' ? 'el salto ' + sel.id : sel.tipo === 'nota' ? 'la nota ' + sel.id : sel.tipo === 'enlace' ? 'el enlace que sale de ' + sel.id : null;
    }
    return { vista: enVentana ? 'Documentos (una nota en su ventana)' : { esquema: 'Esquema', texto: 'Texto (el editor)', documentos: 'Documentos' }[vista.modo] || vista.modo,
             esquema: r ? { id: esquemaId, nombre: r.esquema.nombre } : null, documento: n ? { id: n.id, titulo: n.titulo } : null, seleccion: s };
  }
  /* mostrar_en_clapcraft: lleva la ventana a un esquema (y un nodo, o su documento) o a una nota */
  function mostrarClaude(que) {
    const d = docs(); if (!d) return { ok: false, aviso: 'No hay proyecto' };
    if (que.enlace) { const x = C.enlaces.leer(que.enlace); return x ? mostrarEnlace(x) : { ok: false, aviso: 'Ese enlace no se entiende' }; }   // 1.1.52
    if (pantalla === 'nuevo') { pantalla = 'proyecto'; aplicarPantalla(); }
    if (que.nota) {
      const n = d.nota(que.nota); if (!n) return { ok: false, aviso: 'Esa nota ya no existe' };
      const r = d.sub(n.subId), eid = r && r.sub.guionEid;
      if (eid && refEsquema(eid)) { vista.arbol = esPersonajes(eid) ? 'personajes' : 'contenedores'; abrirTexto(n.id); return { ok: true, aviso: 'A la vista: el documento «' + n.titulo + '»' }; }
      verVista('documentos'); C.gestor.abrirNota(n.id);
      return { ok: true, aviso: 'A la vista: la nota «' + n.titulo + '»' };
    }
    const r = refEsquema(que.esquema); if (!r) return { ok: false, aviso: 'Ese esquema ya no existe' };
    vista.arbol = esPersonajes(que.esquema) ? 'personajes' : 'contenedores'; guardarVista();
    if (que.esquema !== esquemaId) montarEsquema(que.esquema, { sinEditor: true });
    if (que.documento && !esPersonajes(que.esquema)) { abrirTexto(null); return { ok: true, aviso: 'A la vista: el documento de «' + r.esquema.nombre + '»' }; }
    verVista('esquema'); C.gestor.render();
    if (que.nodo) seleccionarEnTablero(que.nodo);
    return { ok: true, aviso: 'A la vista: el esquema «' + r.esquema.nombre + '»' + (que.nodo ? ', con el nodo elegido' : '') };
  }
  /* tras un cambio de Claude (o al deshacerlo): el tablero montado y el editor abierto, al día; y a guardar */
  function ponerAlDia(antesTablero, notaEd, antesNota) {
    biblioteca.marcar(abiertoId);
    const d = docs();
    if (esquemaId && !refEsquema(esquemaId)) montarEsquema(primerEsquema());
    else if (esquemaId) {
      const ahora = JSON.stringify(refEsquema(esquemaId).esquema.datos);
      if (ahora !== antesTablero) { modelo.cargar(JSON.parse(ahora)); T.tablero.render(); }
    }
    const n = notaEd && d && d.nota(notaEd);
    if (n && n.html !== antesNota) C.texto.recargar({ titulo: n.titulo, html: n.html, characters: n.characters });
    persistir(); renderChipEsquema(); C.gestor.render(); pintarVersion();
  }
  function fotoClaude() {
    const d = docs(), r = refEsquema(esquemaId), notaEd = C.texto.clave(), n = notaEd && d && d.nota(notaEd);
    return { tablero: r ? JSON.stringify(r.esquema.datos) : null, notaEd, nota: n ? n.html : null };
  }
  async function atenderClaude(p) {
    if (p.nombre === '_recientes') return recientes().map(r => ({ nombre: r.nombre, ruta: r.ruta || null }));
    const g = biblioteca.guion(abiertoId), d = g && docs();
    if (!g || !d) return { ok: false, error: 'Esa ventana de ClapCraft no tiene el proyecto abierto' };
    if (!C.herramientas) return { ok: false, error: 'Esta versión de ClapCraft no trae las herramientas para Claude' };
    if (temporizador) volcar();
    volcarTexto();
    const foto = fotoClaude(), a = estado(abiertoId).archivo;
    let cambio = false;
    const ctx = { docs: d, proyecto: { nombre: g.nombre, ruta: a ? (a.ruta || a.nombre) : null, vivo: true }, origen: p.origen || 'Claude',
      cambio: () => { cambio = true; }, estado: estadoEnPantalla, mostrar: mostrarClaude, ponerNombre: ponerNombreProyecto,
      renombrarProyecto: n => (renombrarProyecto(abiertoId, n) ? { ok: true, aviso: 'Proyecto «' + n + '» (su archivo se sigue llamando igual)' } : { ok: false, aviso: 'No se pudo renombrar el proyecto' }) };
    const r = C.herramientas.ejecutar(ctx, p.nombre, p.args || {});
    if (cambio) {
      ponerAlDia(foto.tablero, foto.notaEd, foto.nota);
      const e = r.historial && C.historial.entrada(d, r.historial);
      if (e) T.tablero.avisar('Claude: ' + e.titulo.charAt(0).toLowerCase() + e.titulo.slice(1), [{ texto: 'Deshacer', fn: () => revertirClaude(e.id) }, { texto: 'Historial', fn: abrirHistorialClaude }]);
      else if (p.nombre === 'revertir_cambio') T.tablero.avisar('Claude revirtió un cambio suyo', [{ texto: 'Historial', fn: abrirHistorialClaude }]);
      if (C.historial.abierto && C.historial.abierto()) C.historial.repintarPanel();
    }
    return r;
  }

  /* ---------- el historial de Claude (1.1.50) ----------
     Leo, 25-09-2026: «¿Se pueden revertir los cambios hechos con IA? Necesito que exista una especie de historial para ver los
     cambios que ha hecho la IA». Cada cambio de Claude queda en el proyecto con su parche (js/claquedraw/historial.js) y aquí se
     ve y se revierte: el panel (menú Claude › Historial de cambios…, o «Historial» en el aviso de cada cambio) con «Ir», «Ver
     cambios» (la comparación de versiones: cómo estaba y cómo está) y «Revertir». Revertir deshace solo lo de ese cambio; si
     después se tocaron las mismas cosas, lo dice y pregunta si revertir de todos modos. El aviso de lo revertido trae «Deshacer». */
  function ponerNombreProyecto(n) {
    if (!n || !biblioteca.guion(abiertoId)) return;
    biblioteca.renombrar(abiertoId, n);
    document.title = n + ' · ClapCraft';
    renderPestanas(); informarVentana();
  }
  async function revertirClaude(id) {
    const d = docs(); if (!d) return false;
    if (temporizador) volcar();
    volcarTexto();
    const e = C.historial.entrada(d, id); if (!e) return false;
    const prueba = C.historial.probar(d, id);
    let forzar = false;
    if (!prueba.ok) {
      if (!prueba.choques || !prueba.choques.length) { T.tablero.avisar(prueba.aviso || 'No se pudo revertir'); return false; }
      const lista = prueba.choques.slice(0, 4).join('; ') + (prueba.choques.length > 4 ? ' y ' + (prueba.choques.length - 4) + ' más' : '');
      if (!await T.tablero.confirmar('Después de «' + e.titulo + '» se tocaron algunas de las mismas cosas (' + lista + '). ¿Revertirlo de todos modos? En esas partes se pierde lo que se hizo después.', 'Revertir de todos modos')) return false;
      forzar = true;
    }
    const foto = fotoClaude();
    const r = C.historial.revertirEntrada(d, id, { forzar, ahora: Date.now(), por: 'ClapCraft' });
    if (!r.ok) { T.tablero.avisar(r.aviso || 'No se pudo revertir'); return false; }
    if (r.nombreProyecto) ponerNombreProyecto(r.nombreProyecto);
    ponerAlDia(foto.tablero, foto.notaEd, foto.nota);
    if (C.historial.abierto()) C.historial.repintarPanel();
    const nombreAhora = (biblioteca.guion(abiertoId) || {}).nombre;
    T.tablero.avisar('Revertido: ' + e.titulo + (r.avisos.length ? ' · ' + r.avisos[0] : ''), { texto: 'Deshacer', fn: () => {
      const dd = docs(); if (!dd || dd !== d) return;
      if (temporizador) volcar(); volcarTexto();
      const f = fotoClaude();
      C.historial.reponer(dd, r.antes, id);
      if (e.nombreProyecto && nombreAhora !== e.nombreProyecto.b) ponerNombreProyecto(e.nombreProyecto.b);
      ponerAlDia(f.tablero, f.notaEd, f.nota);
      if (C.historial.abierto()) C.historial.repintarPanel();
      T.tablero.avisar('Vuelto a como lo dejó Claude');
    } });
    return true;
  }
  function irACambio(e) {
    const d = docs(), x = e.donde || {};
    if (x.tipo === 'esquema' && d.esquema(x.id)) mostrarClaude({ esquema: x.id });
    else if (x.tipo === 'nota' && d.nota(x.id)) mostrarClaude({ nota: x.id });
    else if (x.tipo === 'biblioteca' && d.sub(x.id)) { if (C.gestor.cerrarVentana) C.gestor.cerrarVentana(); verVista('documentos'); C.gestor.abrirSub(x.id); }
    else T.tablero.avisar('Eso ya no está en el proyecto');
  }
  function verCambio(e) {
    if (temporizador) volcar();
    volcarTexto();
    const v = C.herramientas.vistaCambio(docs(), e.id);
    if (!v) { T.tablero.avisar('De ese cambio ya no queda cómo estaba antes'); return; }
    C.versiones.abrirComparacion({ nombre: 'Antes de Claude', html: v.antes }, { nombre: e.revertido ? 'Ahora (revertido)' : 'Ahora', html: v.ahora });
  }
  function abrirHistorialClaude() {
    const g = biblioteca.guion(abiertoId); if (!g || !docs() || !C.historial) { T.tablero.avisar('Abre un proyecto para ver lo que ha hecho Claude'); return; }
    if (temporizador) volcar();
    volcarTexto();
    marcarHistorialVisto();
    C.historial.abrirPanel({ proyecto: () => (biblioteca.guion(abiertoId) || {}).nombre || '', entradas: () => (docs() ? C.historial.lista(docs()).reverse() : []),
      revertir: id => revertirClaude(id), ir: irACambio, ver: verCambio });
  }
  /* lo que Claude hizo con el proyecto cerrado, dicho al abrirlo (una vez): lo último visto de cada proyecto se apunta por su
     archivo (al reabrirlo desde recientes el proyecto estrena id) en su propia clave, que comparten todas las ventanas */
  const CLAVE_CLAUDE_VISTO = 'guiones.claquedraw.claudeVisto';
  function marcarHistorialVisto() {
    const d = docs(), g = biblioteca.guion(abiertoId); if (!d || !g || !C.historial) return [];
    const a = estado(g.id).archivo, k = a ? (a.ruta || 'h:' + a.nombre) : 'p:' + g.id;
    const vistos = leerJSON(CLAVE_CLAUDE_VISTO) || {}, visto = +vistos[k] || 0, es = C.historial.lista(d);
    const ultimo = Math.max(0, ...es.map(e => e.fecha));
    if (ultimo > visto) { vistos[k] = ultimo; escribirJSON(CLAVE_CLAUDE_VISTO, vistos); }
    return es.filter(e => e.fecha > visto && e.modo === 'archivo' && !e.revertido);
  }
  function avisarCambiosDeClaude() {
    const g = biblioteca.guion(abiertoId); if (!g) return;
    const nuevos = marcarHistorialVisto();
    if (nuevos.length) T.tablero.avisar('Claude hizo ' + (nuevos.length === 1 ? 'un cambio' : nuevos.length + ' cambios') + ' en «' + g.nombre + '» con el proyecto cerrado', [{ texto: 'Ver', fn: abrirHistorialClaude }, { texto: 'Cerrar', fn: () => {} }]);
  }
  if (api && api.onClaude) api.onClaude(p => {
    Promise.resolve().then(() => atenderClaude(p))
      .catch(e => ({ ok: false, error: 'Error de ClapCraft: ' + ((e && e.message) || e) }))
      .then(r => api.responderClaude(p.id, r));
  });

  /* ---------- enlaces (1.1.52) ----------
     Leo, 25-09-2026: «Pon unos "puntos" o "links" a bibliotecas, segmentos, notas, personajes, esquemas, etc. Para facilitar el
     decirle a Claude a qué puntos me refiero cuando le hablo de algo». Cada cosa tiene su enlace (js/claquedraw/enlaces.js) y se
     copia en Markdown, con su nombre, para pegarlo en Claude: «Copiar enlace para Claude» en los ⋯ del árbol y de las bibliotecas,
     en el clic derecho del tablero, en el panel flotante (lo suyo y cada nota), en el clic derecho del editor y en su asa de bloques
     (un párrafo o lo seleccionado) y en el botón de enlace de cada cabecera (lo que se ve). **Cmd+Shift+C** (menú Claude) copia lo
     elegido —nodos, notas, columnas, lo seleccionado en el editor, la nota marcada— o, sin nada elegido, lo que se ve. Y al revés:
     **abrir un enlace** (Claude › Ir al enlace copiado, un clic en uno si el sistema se lo pasa a ClapCraft, o mostrar_en_clapcraft)
     lleva a su sitio, en la ventana de su proyecto. */
  const cortoE = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
  /* el <proyecto> de sus enlaces: el nombre de su archivo o, sin archivo, el del proyecto */
  function proyectoEnlaceDe(id) {
    const g = biblioteca.guion(id), a = g && estado(g.id).archivo;
    return C.enlaces.proyectoDe({ ruta: a ? (a.ruta || a.nombre) : null, nombre: g ? g.nombre : '' });
  }
  const proyectoEnlace = () => proyectoEnlaceDe(abiertoId);
  /* ---------- cuando el archivo cambia de nombre (1.1.52) ----------
     Leo, 25-09-2026: «que se haga una comprobación y corrección de los enlaces si es que cambié el nombre». El proyecto guarda dentro
     con qué nombre se hacen sus enlaces (`documentos.enlace`, js/claquedraw/enlaces.js): se sella al escribir su archivo o al copiar
     un enlace. Si el archivo se renombra —con el proyecto abierto (Electron lo ve: electron/claude.js, `archivo:renombrado`), con
     ClapCraft cerrado y la ventana guardada (se busca por su inodo) o con el proyecto cerrado (al abrirlo, el sello dice otro nombre
     y ya no hay ningún archivo que se llame así)—, `comprobarEnlaces` lo pone al día: los enlaces de dentro del proyecto pasan al
     nombre nuevo y el de antes se queda en el sello, así que los enlaces que ya se pegaron en Claude siguen llevando aquí. Si el
     nombre de antes aún es de otro archivo, este es una copia (o un «Guardar como…»): toma el suyo sin tocar nada más. */
  function nombresEnlace(id) {
    const g = biblioteca.guion(id); if (!g || !C.enlaces) return [];
    const n = [proyectoEnlaceDe(id)].concat(C.enlaces.nombres(g.documentos));
    return n.filter((x, i) => x && n.indexOf(x) === i);
  }
  function sellarEnlaces(id) {
    const g = biblioteca.guion(id), d = g && g.documentos; if (!d || !C.enlaces) return false;
    const est = estado(id), ahora = proyectoEnlaceDe(id);
    if (est.copia && d.enlace && d.enlace.proyecto !== ahora) { est.copia = false; return C.enlaces.renombrar(d, ahora, { corregir: false }).cambio; }   // una copia: su nombre, sin tocar sus enlaces
    return C.enlaces.sellar(d, ahora);
  }
  async function comprobarEnlaces(id, op) {
    op = op || {};
    const g = biblioteca.guion(id), d = g && g.documentos; if (!d || !C.enlaces) return false;
    const est = estado(id), a = est.archivo, ahora = proyectoEnlaceDe(id), e = d.enlace;
    if (!e || !e.proyecto || e.proyecto === ahora) return false;
    if (!op.renombrado && a && a.ruta && api && api.hayProyecto) {
      let otro = false;
      try { otro = await api.hayProyecto({ slug: e.proyecto, salvo: a.ruta, rutas: recientes().map(r => r.ruta).filter(Boolean) }); } catch (_) {}
      if (biblioteca.guion(id) !== g) return false;
      if (otro) { est.copia = true; return false; }            // una copia: toma su nombre al escribirse (abrirla no la reescribe)
    }
    const foto = id === abiertoId && docs() ? fotoClaude() : null;
    const r = C.enlaces.renombrar(d, ahora);
    if (!r.cambio) return false;
    biblioteca.marcar(id);
    if (foto) ponerAlDia(foto.tablero, foto.notaEd, foto.nota); else persistir();
    informarVentana();
    T.tablero.avisar((a ? 'El archivo ahora se llama «' + a.nombre + '»' : 'El proyecto ahora se llama «' + g.nombre + '»') + ': sus enlaces pasan a decir «' + ahora + '»'
      + (r.corregidos ? ' (' + r.corregidos + (r.corregidos === 1 ? ' corregido' : ' corregidos') + ' dentro del proyecto)' : '') + ' y los que ya habías copiado siguen llevando aquí');
    return true;
  }
  /* el archivo del proyecto se renombró con el proyecto abierto (o se encontró renombrado al arrancar): se sigue con él */
  /* un proyecto sin sello (de antes de la 1.1.52, o sin escribir desde entonces) que se renombra: su nombre de antes era el del
     archivo que se renombró */
  function sellarConNombreDe(id, rutaVieja) {
    const g = biblioteca.guion(id); if (!g || !g.documentos || !C.enlaces || !rutaVieja) return;
    C.enlaces.sellar(g.documentos, C.enlaces.proyectoDe({ ruta: rutaVieja }));
  }
  function seguirArchivo(id, antes, ahora) {
    const est = estado(id), a = est.archivo; if (!a || a.ruta !== antes) return false;
    sellarConNombreDe(id, antes);
    a.ruta = ahora; a.nombre = baseDe(ahora);
    const v = vista.archivos[id]; if (v) { v.ruta = ahora; v.nombre = a.nombre; guardarVista(); }
    migrarVisto(antes, ahora);
    olvidarReciente(antes); recordarReciente(id);
    indicador(); renderPestanas(); informarVentana();
    comprobarEnlaces(id, { renombrado: true });
    return true;
  }
  if (api && api.onArchivoRenombrado) api.onArchivoRenombrado(x => { if (x && x.antes && x.ahora) seguirArchivo(abiertoId, x.antes, x.ahora); });
  /* se borró (o se movió a donde no se le encuentra) con el proyecto abierto: se dice y se vuelve a escribir entero en su sitio
     (antes seguía con ✓ hasta el siguiente cambio, 1.1.55) */
  if (api && api.onArchivoPerdido) api.onArchivoPerdido(ruta => {
    const est = estado(abiertoId), a = est.archivo; if (!a || a.ruta !== ruta) return;
    est.ultimoEscrito = null; indicador(); renderPestanas();
    T.tablero.avisar(a.nombre + ' ya no está en su carpeta · se vuelve a guardar ahí');
    programarEscritura(abiertoId);
  });
  /* lo último de Claude que se vio de un archivo va por su ruta (`avisarCambiosDeClaude`): con el nombre nuevo, lo mismo */
  function migrarVisto(antes, ahora) {
    const vistos = leerJSON(CLAVE_CLAUDE_VISTO) || {};
    if (vistos[antes] !== undefined) { vistos[ahora] = vistos[antes]; delete vistos[antes]; escribirJSON(CLAVE_CLAUDE_VISTO, vistos); }
  }
  const opEnlace = extra => Object.assign({ proyecto: (biblioteca.guion(abiertoId) || {}).nombre || '', modelo: eid => (eid === esquemaId ? modelo : null) }, extra || {});
  async function copiarTexto(t) {
    try { if (api && api.copiarTexto) { await api.copiarTexto(t); return true; } } catch (_) {}
    try { await navigator.clipboard.writeText(t); return true; } catch (_) {}
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove(); return ok;
  }
  /* copia los enlaces de unas referencias ({ tipo, …ids }), un renglón por enlace; `extra.extracto`: el texto de un tramo */
  function copiarEnlaces(refs, extra) {
    const d = docs(); if (!d || !C.enlaces) return false;
    if (temporizador) volcar();
    if (sellarEnlaces(abiertoId)) { biblioteca.marcar(abiertoId); persistir(); }   // desde aquí hay enlaces: el proyecto sabe con qué nombre
    const lista = (Array.isArray(refs) ? refs : [refs]).filter(Boolean), P = proyectoEnlace();
    const lineas = lista.map(r => C.enlaces.markdown(d, P, r, opEnlace(extra))).filter(Boolean);
    if (!lineas.length) { T.tablero.avisar('Aquí no hay nada con enlace'); return false; }
    const nombre = lineas.length === 1 ? C.enlaces.etiqueta(d, lista[0], opEnlace(extra)) : '';
    ultimoCopiado = lineas.join('\n');
    copiarTexto(ultimoCopiado).then(ok => T.tablero.avisar(ok ? (lineas.length === 1 ? 'Enlace copiado: ' + cortoE(nombre, 80) : lineas.length + ' enlaces copiados') + '. Pégalo en Claude.' : 'No se pudo copiar el enlace'));
    return true;
  }
  let ultimoCopiado = '';
  /* una nota: la del guion de un esquema es el documento de ese esquema */
  function refDeNota(nid) {
    const d = docs(), n = d && d.nota(nid); if (!n) return null;
    const r = d.sub(n.subId);
    return r && r.sub.guionEid ? { tipo: 'documento', esquema: r.sub.guionEid } : { tipo: 'nota', id: nid };
  }
  /* lo elegido en el tablero ({ tipo, id } de `seleccion`) */
  function refDeSel(s) {
    const eid = esquemaId; if (!s || !eid) return null;
    switch (s.tipo) {
      case 'punto': return { tipo: 'nodo', esquema: eid, id: s.id };
      case 'salto': return { tipo: 'salto', esquema: eid, id: s.id };
      case 'linea': return { tipo: 'trama', esquema: eid, id: s.id };
      case 'acto': return { tipo: 'acto', esquema: eid, id: s.id };
      case 'nota': return { tipo: 'nota', esquema: eid, id: s.id };
      case 'enlace': { const b = modelo.siguienteEnTrama(s.id); return b ? { tipo: 'enlace', esquema: eid, de: s.id, a: b.id } : null; }
      case 'raya': { const [lid, c] = String(s.id).split('|'); return { tipo: 'raya', esquema: eid, trama: lid, columna: +c + 1 }; }
    }
    return null;
  }
  /* unas columnas (desde 0), en tramos seguidos */
  const tramosColumnas = cs => cs.slice().sort((a, b) => a - b).reduce((out, c) => { const u = out[out.length - 1]; if (u && c === u[1] + 1) u[1] = c; else out.push([c, c]); return out; }, []);
  const refsColumnas = cs => tramosColumnas(cs).map(([a, b]) => ({ tipo: 'columnas', esquema: esquemaId, desde: a + 1, hasta: b + 1 }));
  /* lo que enseña el panel flotante (el del tablero y el de la tira del editor) */
  function refDeFlot(q) {
    const eid = esquemaId; if (!q || !eid) return null;
    if (q.tipo === 'nota') return { tipo: 'nota', esquema: eid, id: q.id };
    if (q.tipo === 'nodo') return { tipo: 'nodo', esquema: eid, id: q.id };
    if (q.tipo === 'linea') return { tipo: 'trama', esquema: eid, id: q.id };
    if (q.tipo === 'acto') return { tipo: 'acto', esquema: eid, id: q.id };
    if (q.tipo === 'lugar') {
      const L = q.lugar;
      if (L.a && L.b) return { tipo: 'enlace', esquema: eid, de: L.a, a: L.b };
      if (L.col !== undefined && L.col !== null) return { tipo: 'raya', esquema: eid, trama: L.lineaId, columna: L.col + 1 };
      return { tipo: 'trama', esquema: eid, id: L.lineaId };
    }
    return null;
  }
  /* lo que se ve: la nota o el documento abiertos, el segmento expandido, la biblioteca (o el personaje), el esquema */
  function refDeLoQueSeVe() {
    const d = docs(); if (!d || pantalla === 'nuevo') return null;
    const nid = C.gestor.notaAbierta() || (vista.modo === 'documentos' && C.gestor.notaElegida && C.gestor.notaElegida()); if (nid) return refDeNota(nid);   // también la de su ventana
    if (vista.modo === 'texto' && C.texto.clave()) return refDeNota(C.texto.clave()) || (esquemaId ? { tipo: 'documento', esquema: esquemaId } : null);
    if (vista.modo === 'documentos') {
      const a = C.gestor.subActual(), ex = C.gestor.expandidoActual();
      if (a && a.tipo === 'sub' && d.sub(a.id)) {
        const r = d.sub(a.id);
        if (ex && ex.subId === a.id && (ex.clave === 'bandeja' || /^etq:/.test(ex.clave))) return { tipo: 'segmento', biblioteca: a.id, id: ex.clave === 'bandeja' ? 'bandeja' : ex.clave.slice(4) };
        return r.sub.lineaId && d.personaje(r.sub.lineaId) ? { tipo: 'personaje', id: r.sub.lineaId } : { tipo: 'biblioteca', id: a.id };
      }
      if (a && a.tipo === 'cont' && d.contenedor(a.cid)) return { tipo: 'contenedor', id: a.cid };
      return null;
    }
    if (esquemaId) return { tipo: 'esquema', id: esquemaId };
    return { tipo: 'proyecto' };
  }
  /* un tramo del editor (el de lo seleccionado, o el párrafo del cursor) */
  function copiarTramo(t) {
    const r = C.texto.clave() && refDeNota(C.texto.clave()); if (!r || !t) return false;
    return copiarEnlaces(Object.assign(r, { bloques: t.bloques }, t.huella ? { huella: t.huella } : {}), { extracto: t.extracto });
  }
  /* **Cmd+Shift+C**: lo elegido o, sin nada elegido, lo que se ve */
  function copiarLoElegido() {
    if (!docs()) { T.tablero.avisar('Abre un proyecto para copiar enlaces'); return; }
    const conNota = document.body.classList.contains('nota-abierta');
    if (C.texto.enDocumento() && (vista.modo === 'texto' || conNota)) { const t = C.texto.tramo(); if (t) { copiarTramo(t); return; } }
    if (vista.modo === 'esquema' && esquemaId && !conNota) {
      const e = T.tablero.elegidos(), s = T.tablero.seleccion();
      const refs = e.columnas.length ? refsColumnas(e.columnas) : e.nodos.length ? e.nodos.map(id => ({ tipo: 'nodo', esquema: esquemaId, id }))
        : e.notas.length ? e.notas.map(id => ({ tipo: 'nota', esquema: esquemaId, id })) : [refDeSel(s)].filter(Boolean);
      if (refs.length) { copiarEnlaces(refs); return; }
    }
    if (vista.modo === 'documentos' && !C.gestor.notaAbierta()) { const n = C.gestor.notaMarcada(); if (n && docs().nota(n)) { copiarEnlaces(refDeNota(n)); return; } }
    copiarEnlaces(refDeLoQueSeVe());
  }
  /* lo que el tablero añade a sus menús y a sus barras: «Copiar enlace para Claude» */
  T.tablero.extras(que => {
    if (!C.enlaces || !esquemaId) return [];
    const refs = que.tipo === 'varios' ? que.ids.map(id => ({ tipo: 'nodo', esquema: esquemaId, id }))
      : que.tipo === 'notas' ? que.ids.map(id => ({ tipo: 'nota', esquema: esquemaId, id }))
      : que.tipo === 'columnas' ? refsColumnas(que.ids) : [refDeSel(que)].filter(Boolean);
    if (!refs.length) return [];
    const varios = refs.length > 1;
    return [{ texto: varios ? 'Copiar los ' + refs.length + ' enlaces para Claude' : 'Copiar enlace para Claude', corto: 'Enlace' + (varios ? 's' : ''),
      icono: '<svg width="13" height="13" aria-hidden="true"><use href="#ic-link"></use></svg>',
      titulo: 'Copiar ' + (varios ? 'sus enlaces' : 'su enlace') + ' para Claude (Cmd+Shift+C)', fn: () => copiarEnlaces(refs) }];
  });
  /* el botón de enlace de cada cabecera: lo que se ve */
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-enlace-cab]'); if (!b) return;
    e.stopPropagation(); e.preventDefault();
    const r = refDeLoQueSeVe();
    if (r) copiarEnlaces(r); else T.tablero.avisar('Aquí no hay nada con enlace');
  }, true);

  /* ---------- abrir un enlace: a su sitio ---------- */
  function mostrarEnlace(x) {
    const d = docs(); if (!d) return { ok: false, aviso: 'No hay proyecto' };
    if (temporizador) volcar();
    volcarTexto();
    const R = C.enlaces.resolver(d, x, opEnlace());
    if (!R.ok) return { ok: false, aviso: R.aviso };
    /* ir a una biblioteca, un segmento, una sección o una pieza del árbol: la ventana de una nota lo taparía (1.1.54) */
    if (['contenedor', 'carpeta', 'grupo', 'personaje', 'biblioteca', 'seccion', 'segmento'].includes(x.tipo) && C.gestor.ventanaAbierta && C.gestor.ventanaAbierta()) C.gestor.cerrarVentana();
    if (pantalla === 'nuevo') { pantalla = 'proyecto'; aplicarPantalla(); }
    const listo = aviso => ({ ok: true, aviso: 'A la vista: ' + (aviso || R.etiqueta) });
    const aTramo = (n, eid) => {
      if (!x.bloques || !n) return;
      const t = C.enlaces.tramo(n.html, x);
      C.texto.irATramo(n.id, t.desde, t.hasta).then(ok => { if (ok && t.perdido) T.tablero.avisar('Ese tramo cambió desde que se copió el enlace: está marcado lo que ahora ocupa su sitio'); });
    };
    switch (x.tipo) {
      case 'proyecto': return listo('«' + (biblioteca.guion(abiertoId) || {}).nombre + '»');
      case 'contenedor': case 'carpeta': case 'grupo':
        if (vista.modo === 'documentos' && !C.gestor.subActual()) verVista('esquema');
        C.gestor.revelar(x.tipo, x.id); return listo();
      case 'personaje': abrirPersonaje(x.id); return listo();
      case 'biblioteca': case 'seccion': case 'segmento': {
        if (R.personaje) { vista.arbol = 'personajes'; guardarVista(); } else if (R.contenedor && !R.contenedor.oculto) { vista.arbol = 'contenedores'; guardarVista(); }
        if (C.gestor.notaAbierta()) C.gestor.cerrarNota();
        verVista('documentos');
        if (x.tipo === 'segmento') C.gestor.expandir(x.biblioteca, x.id === 'bandeja' ? 'bandeja' : 'etq:' + x.id);
        else C.gestor.abrirSub(R.sub.id);
        if (x.tipo === 'seccion') setTimeout(() => C.gestor.verSeccion(x.id), 60);
        return listo();
      }
      case 'nota': case 'documento': {
        if (x.tipo === 'documento' || (x.tipo === 'nota' && !x.esquema)) {
          const n = R.nota;
          if (x.tipo === 'documento' && !n) { const r = mostrarClaude({ esquema: x.esquema }); return r.ok ? listo('el esquema «' + R.esquema.nombre + '» (su guion aún no existe)') : r; }
          const r = x.tipo === 'documento' ? mostrarClaude({ esquema: x.esquema, documento: true }) : mostrarClaude({ nota: n.id });
          if (!r.ok) return r;
          aTramo(n);
          return listo();
        }
      }
      /* falls through: una nota del esquema */
      default: {
        const r = mostrarClaude({ esquema: x.esquema }); if (!r.ok) return r;
        const m = modelo, q = x.tipo === 'nodo' ? (R.salto ? { tipo: 'salto', id: R.salto.id } : { tipo: 'punto', id: x.id })
          : x.tipo === 'salto' ? { tipo: 'salto', id: R.salto.id } : x.tipo === 'trama' ? { tipo: 'linea', id: x.id } : x.tipo === 'acto' ? { tipo: 'acto', id: x.id }
          : x.tipo === 'nota' ? { tipo: 'nota', id: x.id } : x.tipo === 'enlace' ? { tipo: 'enlace', id: x.de } : x.tipo === 'raya' ? { tipo: 'raya', id: x.trama + '|' + (x.columna - 1) }
          : x.tipo === 'columnas' ? { tipo: 'columnas', cols: Array.from({ length: x.hasta - x.desde + 1 }, (_, i) => x.desde - 1 + i) } : null;
        if (!q) return listo();
        /* lo de una trama oculta no se ve: se dice (se muestra desde la fila de «ocultas») */
        const lid = q.tipo === 'linea' ? q.id : q.tipo === 'raya' ? x.trama : q.tipo === 'punto' || q.tipo === 'enlace' ? (m.punto(q.id) || {}).lineaId
          : q.tipo === 'nota' ? (n => n && m.lineaDeNota(n))(m.nota(q.id)) : q.tipo === 'salto' ? (s => s && (m.punto(s.deId) || {}).lineaId)(m.salto(q.id)) : null;
        const l = lid && m.linea(lid);
        if (l && l.oculta) return { ok: true, aviso: '«' + l.nombre + '» está oculta: muéstrala desde la fila de tramas ocultas, abajo del esquema' };
        if (!T.tablero.ir(q)) return { ok: false, aviso: 'No se encontró en el esquema' };
        if (x.tipo === 'enlace' && R.seguidos === false) return { ok: true, aviso: 'Esos dos nodos ya no van seguidos: está elegido el enlace que sale del primero' };
        return listo();
      }
    }
  }
  /* un enlace de cualquier proyecto: el de esta ventana, aquí; el de otro, en la suya (Electron la busca o lo abre) */
  function irAEnlace(texto, op) {
    const u = C.enlaces && C.enlaces.extraer(texto)[0], x = u && C.enlaces.leer(u);
    if (!x) { T.tablero.avisar('Eso no es un enlace de ClapCraft (empiezan por clapcraft://)'); return false; }
    const g = biblioteca.guion(abiertoId);
    const esDeAqui = g && nombresEnlace(g.id).concat(C.enlaces.slug(g.nombre)).includes(x.proyecto);
    if (!esDeAqui) {
      if (api && api.irEnlace && !(op && op.deFuera)) { api.irEnlace(u); return true; }   // Electron lo lleva a la ventana de su proyecto
      T.tablero.avisar('Ese enlace es de otro proyecto («' + x.proyecto + '»): ábrelo y vuelve a intentarlo'); return false;
    }
    const r = mostrarEnlace(x);
    if (!r.ok || / oculta|ya no van seguidos/.test(r.aviso || '')) T.tablero.avisar(r.aviso);
    return r.ok;
  }
  /* Claude › Ir al enlace copiado: el del portapapeles o, si no hay ninguno, el que se pegue */
  async function irAlEnlaceCopiado() {
    let t = '';
    try { t = api && api.leerPortapapeles ? await api.leerPortapapeles() : await navigator.clipboard.readText(); } catch (_) {}
    if (!C.enlaces.extraer(t).length) {
      const r = await C.gestor.pedirNombre({ ceja: 'Claude', titulo: 'Ir a un enlace', boton: 'Ir', valor: '', pista: 'clapcraft://…' });
      t = r && r.nombre ? r.nombre : '';
      if (!t) return;
    }
    irAEnlace(t);
  }
  if (api && api.onEnlace) api.onEnlace(u => irAEnlace(u, { deFuera: true }));

  window.addEventListener('beforeunload', () => {
    volcarTodo();
    biblioteca.datos.guiones.forEach(g => { if (sucio(g.id)) escribirArchivo(g.id); });   // lo que dé tiempo
  });
  /* **Salir de la app espera a que se escriba todo** (1.1.55): Electron pregunta a cada ventana antes de salir (Cmd+Q, apagar el
     equipo) y sale cuando todas contestan; antes salía a mitad de la escritura y un proyecto grande quedaba cortado. */
  if (api && api.onVaciar) api.onVaciar(async () => { try { return await escribirTodo(); } catch (_) { return false; } });

  /* API para el gestor de documentos que venga después: la biblioteca, el guion abierto y la vista. */
  C.biblioteca = biblioteca;
  C.app = { abrir: montar, nuevo, crearProyecto, cancelarProyecto, cerrar: cerrarProyecto, abrirReciente, recientes, guardar, guardarComo, abrirArchivo, montarEsquema, esquemaMontado: () => esquemaId,
    abrirEnPestana, cambiarPestana, cerrarPestana: cerrarPestanaElemento, nuevaPestana, historia: irHistoria, pestanas: () => pestanas && JSON.parse(JSON.stringify(pestanas)), abrirRuta,
    renombrar: renombrarProyecto, editarNombre: editarNombrePestana,
            archivo: id => { const a = estado(id || abiertoId).archivo; return a && { nombre: a.nombre, ruta: a.ruta || null, permiso: a.permiso }; },
            sucio: id => sucio(id || abiertoId), abiertoId: () => abiertoId, vista: verVista, modo: () => vista.modo };
})(window.Claquedraw, window.Tramas);
