/* Claquedraw · arranque
   Une los guiones (cada uno un esquema de pasos de Tramas más las notas del editor, guardados en la
   biblioteca) con las dos vistas: el tablero y el texto (js/claquedraw/texto.js). Hay una pestaña
   por guion abierto; solo uno está montado en el tablero y cambiar de pestaña vuelca el anterior y
   carga el otro (su historial de deshacer empieza de cero). La biblioteca entera se autoguarda en
   localStorage con las notas.

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
  if (!vista.archivos || typeof vista.archivos !== 'object') vista.archivos = {};
  delete vista.cabecera;                                       // la tira y la cinta del editor ya van las dos a la vista (rediseño)
  if ((vista.rev || 0) < 3) { vista.ladoPlegado = false; delete vista.ladoAncho; vista.rev = 3; }   // el menú arranca desplegado y con el ancho de partida (Leo)
  if (vista.archivo) { delete vista.archivo; }                 // forma antigua (un solo archivo)
  const guardarVista = () => escribirJSON(CLAVE_VISTA, vista);

  /* ---------- biblioteca: una pestaña por guion, el abierto es su activo ---------- */
  const biblioteca = new C.Biblioteca(leerJSON(CLAVE));
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
    localOk = escribirJSON(CLAVE, biblioteca.toJSON());
    if (abiertoId) programarEscritura(abiertoId);
    indicador(); renderPestanas(); renderChipEsquema();       // el título del esquema sigue a renombres y enlaces
    if (esPersonajes(esquemaId) && C.gestor && vista.modo === 'personajes') C.gestor.render();   // la lista de personajes sigue al tablero
  }

  /* ---------- tablero: un solo modelo, se vuelca en el guion abierto ---------- */
  const datosDe = g => (g && g.datos) || T.inicial();
  let abiertoId = null;                                        // guion montado en el tablero
  let esquemaId = null;                                        // el esquema montado en el tablero (id de un esquema de contenedor); null: ninguno
  let temporizador = null;
  const modelo = new T.Modelo(datosDe(biblioteca.activo()));
  const docs = () => C.gestor.documentos();                    // el modelo de documentos del guion abierto
  const refEsquema = eid => { const d = docs(); return d && eid ? d.esquema(eid) : null; };   // { contenedor, esquema } o null

  /* Escribe el tablero donde toca: en el guion (proyecto) o en el esquema del contenedor. */
  function volcar() {
    clearTimeout(temporizador); temporizador = null;
    if (abiertoId && biblioteca.guion(abiertoId)) {
      if (esquemaId && refEsquema(esquemaId)) { const r = docs().guardarEsquema(esquemaId, modelo.toJSON()); if (r.ok && r.cambio) biblioteca.marcar(abiertoId); }
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
  function montarEsquema(eid) {
    const g = biblioteca.guion(abiertoId); if (!g) return;
    if (eid && !refEsquema(eid)) eid = null;
    if (temporizador) volcar();
    C.texto.cerrar();
    const board = $('board');
    if (esquemaId) desplazamientos.set(esquemaId, { left: board.scrollLeft, top: board.scrollTop });
    if (esquemaId && refEsquema(esquemaId)) { const vivos = modelo.datos.puntos.map(p => p.id); docs().podarNotasEsquema(esquemaId, vivos); docs().podarGuion(esquemaId, vivos); }
    if (C.revisar.abierto()) C.revisar.cerrar();
    esquemaId = eid;
    /* el tablero de Personajes: columna ancha con nombres, sin fuera de escena ni camino iluminado, y lo
       nuevo se llama «Momento», «Personaje», «Evento» (nodo) y «Relación» (cuadro) */
    const per = esPersonajes(eid);
    modelo.nombres = per ? { acto: 'Momento', linea: 'Personaje', punto: 'Evento', nodo: 'Evento', cuadro: 'Relación', femeninos: ['cuadro'] } : null;
    T.tablero.simple(per); T.tablero.gutter(per ? 250 : 48);   // con el color, la etiqueta «Personaje» y el nombre
    document.body.classList.toggle('tablero-personajes', per);
    T.tablero.cargar(eid ? refEsquema(eid).esquema.datos : T.inicial());
    /* cada tablero vuelve a donde se dejó (uno nuevo, al principio): si se heredaba el desplazamiento del
       anterior, con otro número de carriles la vista brincaba */
    const d0 = desplazamientos.get(eid) || { left: 0, top: 0 };
    board.scrollLeft = d0.left; board.scrollTop = d0.top;
    document.body.classList.toggle('sin-esquema', !eid);
    renderChipEsquema();
    C.gestor.render();                                         // la barra señala el esquema montado
    if (vista.modo === 'texto') { if (eid) C.texto.abrir(); else verVista('esquema'); }
  }
  /* El título de la vista Esquema: «CONTENEDOR [Esquema] Nombre» del esquema montado (no hace nada al
     pulsarlo, Leo) y «Ver documentos» si tiene documentos enlazados. */
  function renderChipEsquema() {
    const b = $('esquemaChip'); if (!b) return;
    const r = refEsquema(esquemaId), x = r && docs().enlace(esquemaId), per = r && esPersonajes(esquemaId);
    b.hidden = !r;
    if (r) {
      /* en Personajes: «PERSONAJES [Personaje] Nombre del personaje abierto» */
      const l = per && vista.personaje && docs().personaje(vista.personaje);
      b.querySelector('[data-chip-cont]').textContent = r.contenedor.nombre;
      /* el chip lleva el nombre (Leo: como en la cabecera del editor) y el color dice qué es: el esquema en violeta;
         en Personajes, el personaje con su color (el par claro/oscuro de la paleta, como en el editor) */
      const chip = b.querySelector('.gd-chip');
      const t = per && l && C.PALETA_ETIQUETAS[l.color];
      chip.classList.toggle('per-chip', !!t); chip.classList.toggle('gd-chip--esquema', !t);
      if (t) { chip.style.setProperty('--chl', t[1]); chip.style.setProperty('--chd', t[2]); } else { chip.style.removeProperty('--chl'); chip.style.removeProperty('--chd'); }
      const nombre = per ? (l ? l.nombre : '') : r.esquema.nombre;
      b.querySelector('[data-chip-esq]').textContent = nombre;
      chip.setAttribute('aria-label', (per ? 'Personaje' : 'Esquema') + ' «' + nombre + '»');   // cortado, sale el globo (texto.js)
    }
    $('verDocumentos').hidden = !x;
  }
  /* La biblioteca donde el esquema montado tiene sus actos como segmentos: la enlazada, o la del personaje. */
  function bibliotecaDelEsquema() {
    const d = docs(); if (!d || !esquemaId) return null;
    if (esPersonajes(esquemaId)) { const p = vista.personaje && d.personaje(vista.personaje); return p ? d.bibliotecaPersonaje(p.id, p.nombre).id : null; }
    const x = d.enlace(esquemaId); return x ? x.sub.id : null;
  }
  /* El primer esquema que haya en el guion (por orden de contenedores), o null. */
  function primerEsquema() {
    const d = docs(); if (!d) return null;
    for (const c of d.datos.contenedores) if (!c.oculto && c.esquemas.length) return c.esquemas[0].id;
    return null;
  }

  /* ---------- Personajes ----------
     Los personajes del guion son el elenco de los documentos: los que se escriben en el editor con «/» y
     los que se crean aquí (nombre y color; renombrar o recolorear reescribe todas las notas). La pantalla
     es la del esquema con el tablero del personaje abierto (actos = momentos) y encima el carrusel de su
     biblioteca. Cada personaje tiene su tablero: el carril principal es él (fijo, no se cambia ni se
     borra) y cada uno de los demás lleva un selector con el personaje que representa (`linea.personaje`). */
  const esPersonajes = eid => !!eid && eid.startsWith(C.ID_PERSONAJES + ':esquema:');
  let esquemaPrevio = null;                                    // el esquema montado antes de entrar en Personajes
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
  /* antes de reescribir notas desde aquí: lo que haya en el editor se guarda y se cierra (se relee al abrir) */
  function soltarEditor() { C.texto.volcar(); C.texto.cerrar(); if (C.gestor.notaAbierta()) C.gestor.cerrarNota(); }
  /* Abre un personaje: monta su tablero (lo crea la primera vez) y su biblioteca en el carrusel. Sin
     personajes no hay tablero (`body.sin-personajes`). */
  function abrirPersonaje(id) {
    const d = docs(); if (!d) return;
    const p = d.personaje(id);
    vista.personaje = p ? id : null; guardarVista();
    const antes = !!(p && d.esquemaPersonaje(p.id));
    const e = p ? d.esquemaPersonaje(p.id, datosPersonajes(p)) : null, eid = e ? e.id : null;
    if (e && !antes) biblioteca.marcar(abiertoId);
    if (!esPersonajes(esquemaId) && esquemaId) esquemaPrevio = esquemaId;
    if (esquemaId !== eid) montarEsquema(eid);
    document.body.classList.toggle('sin-personajes', !eid);
    /* al arrancar ya en Personajes (`vista.modo` recordado) la vista aún no está puesta: sin la clase no se ve el carrusel */
    if (vista.modo !== 'personajes' || !document.body.classList.contains('vista-personajes')) verVista('personajes');
    const cuerpo = $('personajesSeg').querySelector('[data-per-cuerpo]');
    if (p) C.gestor.renderPersonaje(cuerpo, docs().bibliotecaPersonaje(id, p.nombre).id, id);
    else { C.gestor.contraer(); cuerpo.innerHTML = '<div class="gd-nada per-vacio"><b>Aún no hay personajes</b><br>Escríbelos en el editor con «/» o créalos con «＋ Nuevo personaje».</div>'; }
    C.gestor.render(); renderChipEsquema(); marcarPersonaje();
  }
  function verPersonajes() {
    const d = docs(); if (!d) return;
    if (!['personajes', 'texto'].includes(vista.modo)) vista.modoPrevio = vista.modo;
    const l = personajes(); abrirPersonaje(l && l.abierto);
    persistir();
  }
  function verContenedores() {
    const destino = vista.modoPrevio === 'esquema' ? 'esquema' : 'documentos';
    document.body.classList.remove('sin-personajes');
    if (esPersonajes(esquemaId) || !esquemaId) montarEsquema(esquemaPrevio && refEsquema(esquemaPrevio) ? esquemaPrevio : primerEsquema());
    C.gestor.reiniciar();
    verVista(destino);
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
  /* los que no se ofrecen en un selector del tablero: el dueño y los que ya tienen carril (salvo el propio) */
  const conCarril = (salvoLinea) => [vista.personaje, ...modelo.datos.lineas.filter(l => l.id !== salvoLinea && l.personaje).map(l => l.personaje)];
  /* «＋ personaje» del tablero: un carril nuevo con el personaje del diálogo */
  function carrilNuevo(p) {
    if (modelo.datos.lineas.some(l => l.personaje === p.id)) { T.tablero.avisar('«' + p.nombre + '» ya tiene carril en este tablero'); return; }
    const r = modelo.nuevaLinea('secundaria'); if (!r.ok) { T.tablero.avisar(r.aviso); return; }
    modelo.editarLinea(r.linea.id, { personaje: p.id, nombre: p.nombre });
    T.tablero.render(); volcar();
  }
  /* los carriles del tablero montado siguen al elenco (nombre); el modelo de documentos ya cambió sus datos guardados */
  function carrilesDe(id, fn) {
    if (!esPersonajes(esquemaId)) return;
    modelo.datos.lineas.forEach(l => { if (l.personaje === id) fn(l); });
    T.tablero.render(); volcar();
  }
  function renombrarPersonaje(id, nombre) {
    soltarEditor(); volcar();
    const r = docs().renombrarPersonaje(id, nombre); if (!r.ok) { T.tablero.avisar(r.aviso); C.gestor.render(); return; }
    carrilesDe(id, l => { l.nombre = r.personaje.nombre; });
    biblioteca.marcar(abiertoId); persistir();
    if (r.notas) T.tablero.avisar('«' + r.personaje.nombre + '»: actualizado en ' + r.notas + (r.notas === 1 ? ' nota' : ' notas'));
    abrirPersonaje(id);
  }
  function colorPersonaje(id, color) {
    soltarEditor(); volcar();
    const r = docs().colorearPersonaje(id, color); if (!r.ok) { T.tablero.avisar(r.aviso); return; }
    biblioteca.marcar(abiertoId); persistir(); abrirPersonaje(id);
  }
  async function eliminarPersonaje(id) {
    const d = docs(), p = d.personaje(id); if (!p) return;
    const m = d.menciones(id);
    if (m.length) { T.tablero.avisar('«' + p.nombre + '» aparece en ' + m.length + (m.length === 1 ? ' nota' : ' notas') + ': no se puede eliminar mientras lo nombren'); return; }
    const sub = d.contenedor(C.ID_PERSONAJES).subs.find(s => s.lineaId === id), n = sub ? d.notasDe(sub.id).length : 0;
    if (!await T.tablero.confirmar('¿Eliminar a «' + p.nombre + '»? Su tablero se elimina' + (n ? ' y sus ' + n + (n === 1 ? ' nota va' : ' notas van') + ' a la papelera' : '') + '. En los tableros de otros personajes, sus carriles quedan sin personaje.', 'Eliminar')) return;
    volcar();
    const r = d.eliminarPersonaje(id); if (!r.ok) { T.tablero.avisar(r.aviso); return; }
    carrilesDe(id, l => { delete l.personaje; l.nombre = 'Sin personaje'; });
    if (vista.personaje === id) vista.personaje = null;
    biblioteca.marcar(abiertoId); persistir();
    const P = personajes(); abrirPersonaje(P && P.abierto);
  }
  /* el selector de un carril: elegir personaje (el carril toma su nombre), crear uno o quitarlo */
  function asignarCarril(lineaId, personajeId) {
    const p = personajeId && docs().personaje(personajeId);
    modelo.editarLinea(lineaId, p ? { personaje: p.id, nombre: p.nombre } : { personaje: null, nombre: 'Sin personaje' });
    T.tablero.render(); volcar();
  }
  /* En el tablero de un personaje, tras cada render: el carril principal con su nombre fijo y en cada
     uno de los demás el selector con su personaje (sin el círculo de la inicial, Leo). */
  function marcarPersonaje() {
    if (!esPersonajes(esquemaId)) return;
    const d = docs(), duenio = d.personaje(vista.personaje);
    let corregido = false;
    modelo.datos.lineas.forEach(l => {
      const row = document.querySelector(`#rows .row[data-linea="${CSS.escape(l.id)}"]`); if (!row) return;
      const fijo = l.tipo === 'principal';
      /* el principal es siempre el dueño del tablero (si alguien lo renombró desde el panel, vuelve) */
      if (fijo && duenio && (l.personaje !== duenio.id || l.nombre !== duenio.nombre)) { l.personaje = duenio.id; l.nombre = duenio.nombre; corregido = true; }
      const p = l.personaje && d.personaje(l.personaje);
      row.classList.toggle('abierto', fijo);
      row.classList.toggle('sin-personaje', !p);
      /* el carril lleva el color de su trama, como en cualquier esquema (Leo, 15-09-2026: ya no el de la etiqueta del personaje) */
      const label = row.querySelector('.label');
      let combo = label.querySelector('.per-combo');
      if (combo && combo.classList.contains('fijo') !== fijo) { combo.remove(); combo = null; }
      if (!combo) {
        combo = document.createElement(fijo ? 'span' : 'button'); combo.className = 'per-combo' + (fijo ? ' fijo' : '');
        if (!fijo) combo.type = 'button';
        label.insertBefore(combo, label.querySelector('.lbox'));
      }
      combo.dataset.linea = l.id;
      /* delante: el color de la trama (se cambia pulsándolo) y la etiqueta «Personaje» con el color del personaje, como en el
         menú lateral (Leo, 15-09-2026) */
      let tono = label.querySelector('.per-color');
      if (!tono) { tono = document.createElement('button'); tono.type = 'button'; tono.className = 'per-color'; label.insertBefore(tono, combo); }
      tono.dataset.linea = l.id; tono.style.setProperty('--tc', `var(--t-${l.color})`);
      tono.title = 'Color de la trama'; tono.setAttribute('aria-label', 'Color de la trama');
      let etq = label.querySelector('.per-etq');
      const par = p && C.PALETA_ETIQUETAS[p.color];
      if (par && !etq) { etq = document.createElement('span'); etq.className = 'gd-chip per-chip per-etq'; etq.textContent = 'Personaje'; label.insertBefore(etq, combo); }
      if (!par && etq) { etq.remove(); etq = null; }
      if (etq) { etq.style.setProperty('--chl', par[1]); etq.style.setProperty('--chd', par[2]); }
      combo.innerHTML = '<span class="per-combo-nom"></span>' + (fijo ? '' : '<svg width="12" height="12"><use href="#ic-chev-d"></use></svg>');
      combo.firstElementChild.textContent = p ? p.nombre : 'Sin personaje';
      combo.title = fijo ? 'El personaje de este tablero' : p ? 'Personaje del carril · clic para cambiarlo' : 'Elegir el personaje de este carril';
    });
    if (corregido) alCambiar();
  }
  /* Al montar un guion: el esquema que vivía en el guion (forma antigua) pasa a sus documentos una
     sola vez, y se monta el primero que haya. */
  function montarPrimero() {
    const g = biblioteca.guion(abiertoId), d = g && docs(); if (!d) return;
    const r = d.migrarEsquema(g.datos, g.notas);
    if (r.cambio) { g.notas = {}; biblioteca.marcar(abiertoId); }
    montarEsquema(primerEsquema());
  }
  function alCambiar() {
    clearTimeout(temporizador);
    temporizador = setTimeout(volcar, 300);
  }

  /* Monta un guion en el tablero (volcando antes el que estaba: tablero, nota y archivo). */
  function montar(id) {
    if (temporizador) volcar();
    C.texto.cerrar();
    C.gestor.reiniciar();                                      // la nota abierta del gestor se guarda y se cierra
    if (abiertoId && abiertoId !== id) escribirArchivo(abiertoId);   // lo pendiente de la pestaña que se deja
    const g = biblioteca.guion(id);
    abiertoId = g ? g.id : null; esquemaId = null;
    if (g) biblioteca.activar(g.id);
    document.title = (g ? g.nombre + ' · ' : '') + 'ClapCraft';
    if (g && docs()) montarPrimero(); else { T.tablero.cargar(T.inicial()); document.body.classList.add('sin-esquema'); }
    persistir();
    C.gestor.mostrar();                                        // la barra de documentos está en todas las vistas
    if (vista.modo === 'personajes') verPersonajes();          // la pestaña se abre en Personajes: su tablero
    pantalla = 'proyecto'; aplicarPantalla();
    if (g && estado(g.id).archivo) recordarReciente(g.id);
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

  /* ---------- pestañas ---------- */
  const barraPestanas = $('pestanas');
  function renderPestanas() {
    if (!barraPestanas) return;
    barraPestanas.innerHTML = '';
    biblioteca.datos.guiones.forEach(g => {
      const b = document.createElement('div');
      const activa = g.id === abiertoId && pantalla !== 'nuevo';
      b.className = 'pestana' + (activa ? ' activa' : ''); b.dataset.id = g.id;
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(activa));
      const est = estado(g.id);
      b.title = est.archivo ? (est.archivo.ruta || est.archivo.nombre) : 'Solo en este navegador';
      const mod = modificado(g.id);
      b.innerHTML = '<span class="pestana-nom"></span>'
        + (mod ? '<span class="pestana-sucio" title="Cambios sin guardar"></span>' : '')
        + '<button type="button" class="pestana-cerrar" data-cerrar title="Cerrar la pestaña"><svg width="12" height="12"><use href="#ic-close"></use></svg></button>';
      b.querySelector('.pestana-nom').textContent = g.nombre;
      barraPestanas.appendChild(b);
      if (activa) document.title = g.nombre + (mod ? ' *' : '') + ' · ClapCraft';
    });
    /* la pestaña de «Nuevo proyecto», mientras se está creando uno (se puede dejar a medias e ir a otra) */
    if (C.proyectos.hay()) {
      const b = document.createElement('div');
      b.className = 'pestana pestana-proyecto' + (pantalla === 'nuevo' ? ' activa' : ''); b.dataset.proyectoNuevo = '1';
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(pantalla === 'nuevo'));
      b.innerHTML = '<span class="pestana-nom">Nuevo proyecto</span><span class="pestana-sucio" title="Sin crear"></span>'
        + '<button type="button" class="pestana-cerrar" data-cerrar title="Cancelar el proyecto nuevo"><svg width="12" height="12"><use href="#ic-close"></use></svg></button>';
      barraPestanas.appendChild(b);
      if (pantalla === 'nuevo') document.title = 'Nuevo proyecto · ClapCraft';
    }
    if (!biblioteca.total() && pantalla !== 'nuevo') document.title = 'ClapCraft';
    const mas = document.createElement('button');
    mas.type = 'button'; mas.className = 'pestana-nueva'; mas.dataset.nueva = '1'; mas.title = 'Nuevo proyecto (Ctrl+N)';
    mas.innerHTML = '<svg width="14" height="14"><use href="#ic-plus"></use></svg>';
    barraPestanas.appendChild(mas);
  }
  if (barraPestanas) barraPestanas.addEventListener('click', e => {
    if (e.target.closest('[data-nueva]')) { nuevo(); return; }
    const p = e.target.closest('.pestana'); if (!p) return;
    if (p.dataset.proyectoNuevo) { if (e.target.closest('[data-cerrar]')) cancelarProyecto(); else if (pantalla !== 'nuevo') { pantalla = 'nuevo'; aplicarPantalla(); C.proyectos.enfocar(); } return; }
    if (e.target.closest('[data-cerrar]')) { cerrarPestana(p.dataset.id); return; }
    if (p.dataset.id !== abiertoId) montar(p.dataset.id);
    else if (pantalla === 'nuevo') { pantalla = 'proyecto'; aplicarPantalla(); }
  });
  if (barraPestanas) barraPestanas.addEventListener('auxclick', e => {     // botón central: cerrar
    const p = e.target.closest('.pestana'); if (p && e.button === 1) { e.preventDefault(); if (p.dataset.proyectoNuevo) cancelarProyecto(); else cerrarPestana(p.dataset.id); }
  });

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
  /* «Nuevo» (Ctrl+N, el «+» de las pestañas, Archivo › Nuevo proyecto…): la pestaña de creación, o vuelve a ella */
  function nuevo() {
    if (temporizador) volcar();
    C.texto.volcar();
    C.proyectos.empezar();
    pantalla = 'nuevo'; aplicarPantalla(); C.proyectos.enfocar();
  }
  function cancelarProyecto() {
    C.proyectos.descartar(); pantalla = 'proyecto'; aplicarPantalla();
  }
  /* Crea el proyecto de la pestaña de creación: sus documentos salen de la plantilla y, con carpeta, nace con su archivo
     (y desde entonces se guarda ahí solo). Devuelve el guion o null. */
  async function crearProyecto({ nombre, plantilla, carpeta }) {
    const pl = C.plantillas.plantilla(plantilla);
    const r = biblioteca.crear({ nombre: String(nombre || '').trim() || nombreSinTitulo(), documentos: C.plantillas.documentos(pl.id) });
    if (!r.ok) { T.tablero.avisar(r.aviso); return null; }
    const g = r.guion;
    tonos[g.id] = pl.tono;
    C.proyectos.descartar();
    montar(g.id);
    if (carpeta) await archivoEnCarpeta(g.id, carpeta);
    else T.tablero.avisar('Proyecto «' + g.nombre + '» creado · Guardar como… le da un archivo');
    return g;
  }
  async function archivoEnCarpeta(id, carpeta) {
    const g = biblioteca.guion(id); if (!g) return;
    const contenido = serializar(g);
    try {
      if (carpeta.ruta && api && api.crearProyecto) {
        const ruta = await api.crearProyecto({ carpeta: carpeta.ruta, nombre: g.nombre, content: await empaquetar(contenido) });
        vista.carpetaProyectos = { ruta: carpeta.ruta, texto: carpeta.texto }; guardarVista();
        vincular(id, { nombre: baseDe(ruta), ruta }); estado(id).ultimoEscrito = contenido;
      } else if (carpeta.handle) {
        const dir = carpeta.handle;
        if (dir.requestPermission && await dir.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('sin permiso');
        const base = g.nombre.replace(/[\\/:*?"<>|]/g, '-');
        let nombre = base + '.' + EXT;
        for (let n = 2; n < 1000; n++) { try { await dir.getFileHandle(nombre); nombre = base + ' ' + n + '.' + EXT; } catch (_) { break; } }
        const h = await dir.getFileHandle(nombre, { create: true });
        idb.set('carpetaProyectos', dir).catch(() => {});
        vincular(id, { nombre: h.name, handle: h });
        if (!await escribirArchivo(id)) { desvincular(id); throw new Error('no quedó escrito'); }
      } else return;
      await nombrarComoArchivo(id);                            // «Nombre 2» si ya había un archivo con ese nombre
      recordarReciente(id); persistir();
      T.tablero.avisar('Proyecto «' + g.nombre + '» creado en ' + estado(id).archivo.nombre + ' · se guarda ahí solo');
    } catch (err) {
      console.error('ClapCraft · no se pudo crear el archivo del proyecto', err);
      T.tablero.avisar('Proyecto creado, pero no se pudo escribir en ' + carpeta.texto + ' · usa Guardar como…');
    }
  }
  /* la carpeta de partida: la última elegida o ~/Documents/ClapCraft (Electron); en el navegador, la última elegida si
     sigue con permiso (si no, el proyecto se queda en esta ventana hasta «Guardar como…») */
  async function carpetaInicial() {
    if (api && api.carpetaProyectos) return vista.carpetaProyectos || api.carpetaProyectos();
    try { const h = await idb.get('carpetaProyectos'); if (h && await h.queryPermission({ mode: 'readwrite' }) === 'granted') return { texto: h.name, handle: h }; } catch (_) {}
    return null;
  }
  async function elegirCarpeta(actual) {
    if (api && api.elegirCarpeta) return api.elegirCarpeta({ actual: actual && actual.ruta });
    if (window.showDirectoryPicker) {
      try { const h = await window.showDirectoryPicker({ id: 'clapcraft-proyectos', mode: 'readwrite' }); return { texto: h.name, handle: h }; }
      catch (err) { if (err.name !== 'AbortError') T.tablero.avisar('No se pudo elegir la carpeta'); return null; }
    }
    T.tablero.avisar('Este navegador no deja elegir carpeta: el proyecto se queda aquí y «Guardar como…» lo descarga');
    return null;
  }
  /* Sin pestañas: nada montado; se ve «Sin proyectos». */
  function quedarSinProyectos() {
    C.texto.cerrar(); C.gestor.reiniciar();
    abiertoId = null; esquemaId = null;
    T.tablero.cargar(T.inicial()); document.body.classList.add('sin-esquema');
    persistir(); aplicarPantalla();
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
    const r = { clave, nombre: g.nombre, ruta: a.ruta || null, tono, estructura: C.plantillas.estructura(g.documentos), visto: Date.now() };
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
    if (ya) { montar(ya.id); return; }
    if (r.ruta && api && api.readFile) {
      if (!await abrirRuta(r.ruta)) { olvidarReciente(clave); T.tablero.avisar('«' + r.nombre + '» ya no está en ' + r.ruta); }
      return;
    }
    let h = null; try { h = await idb.get('reciente:' + clave); } catch (_) {}
    if (!h) { olvidarReciente(clave); T.tablero.avisar('No se pudo recuperar «' + r.nombre + '»: ábrelo con Abrir un proyecto'); return; }
    try { if (await h.requestPermission({ mode: 'readwrite' }) !== 'granted') { T.tablero.avisar('Sin permiso para abrir ' + h.name); return; } } catch (_) {}
    await abrirHandle(h);
  }
  function pasarPestana(salto) {
    const ids = biblioteca.datos.guiones.map(g => g.id), i = ids.indexOf(abiertoId);
    if (ids.length < 2) return;
    montar(ids[(i + salto + ids.length) % ids.length]);
  }

  /* Cierra una pestaña: si tiene archivo, escribe lo pendiente y la cierra; si no y tiene contenido,
     pide confirmación (se perdería). Sin pestañas queda una vacía. */
  async function cerrarPestana(id) {
    const g = biblioteca.guion(id); if (!g) return;
    const est = estado(id);
    if (id === abiertoId) { if (temporizador) volcar(); C.texto.volcar(); }
    if (est.archivo) { if (!await escribirArchivo(id) && !await T.tablero.confirmar('No se pudo escribir en ' + est.archivo.nombre + '. ¿Cerrar «' + g.nombre + '» de todas formas? Se perderían los cambios.', 'Cerrar')) return; }
    else if (!esVirgen(g) && !await T.tablero.confirmar('¿Cerrar «' + g.nombre + '»? No está guardado en ningún archivo y se perderá.', 'Cerrar')) return;
    if (est.archivo) recordarReciente(id);
    desvincular(id); delete estados[id];
    const r = biblioteca.eliminar(id);
    if (id === abiertoId) { abiertoId = null; if (r.activo) montar(r.activo); else quedarSinProyectos(); }   // sin pestañas: «Sin proyectos»
    else persistir();
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
  const ordenado = v => Array.isArray(v) ? v.map(ordenado) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = ordenado(v[k]); return o; }, {}) : v;
  function mismoContenido(a, b) {
    if (!a || !b) return false;
    const plano = t => { const x = JSON.parse(t); if (x && x.documentos && typeof x.documentos === 'object') x.documentos = C.normalizarDocumentos(x.documentos); return JSON.stringify(ordenado(x)); };
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
    if (!localOk) { texto = 'Sin guardar'; pista = 'No se pudo guardar en este navegador'; clase = 'sucio'; }
    else if (!a) { texto = ''; pista = 'Sin archivo: Guardar como… lo crea y a partir de ahí se guarda solo'; }
    /* sin el nombre del archivo (Leo): solo el estado; el nombre y la ruta van en el globo */
    else if (a.permiso === false) { texto = 'Reconectar'; pista = a.nombre + ' · pulsa Guardar para volver a escribir en el archivo'; clase = 'sucio'; }
    else if (sucio(abiertoId)) { texto = ''; pista = a.nombre + ' · cambios sin escribir (se guardan solos en un momento)'; clase = 'sucio'; }
    else { texto = ''; pista = 'Guardado en ' + (a.ruta || a.nombre); clase = 'ok'; }
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
    indicador(); renderPestanas();
  }
  function desvincular(id) {
    const est = estado(id);
    est.archivo = null; est.ultimoEscrito = null; clearTimeout(est.temporizador);
    delete vista.archivos[id]; guardarVista();
    idb.del('archivo:' + id).catch(() => {});
    indicador(); renderPestanas();
  }

  function programarEscritura(id) {
    const est = estado(id);
    if (!est.archivo || est.archivo.permiso === false) return;
    clearTimeout(est.temporizador);
    est.temporizador = setTimeout(() => escribirArchivo(id), 1000);
  }

  /* Escribe el guion en su archivo si cambió. Devuelve si quedó escrito. */
  async function escribirArchivo(id) {
    const est = estado(id), g = biblioteca.guion(id);
    clearTimeout(est.temporizador); est.temporizador = null;
    if (!est.archivo || !g || est.escribiendo) return false;
    const contenido = serializar(g);
    if (contenido === est.ultimoEscrito || mismoContenido(contenido, est.ultimoEscrito)) { est.ultimoEscrito = contenido; indicador(); renderPestanas(); return true; }
    est.escribiendo = true;
    try {
      const bytes = await empaquetar(contenido);
      if (est.archivo.ruta && api && api.writeFile) await api.writeFile({ path: est.archivo.ruta, content: bytes });
      else if (est.archivo.handle) await escribirHandle(est.archivo.handle, bytes);
      else return false;
      est.ultimoEscrito = contenido; est.archivo.permiso = true;
      return true;
    } catch (err) {
      console.error('ClapCraft · no se pudo escribir en ' + est.archivo.nombre, err);
      est.archivo.permiso = false;
      T.tablero.avisar('No se pudo escribir en ' + est.archivo.nombre + ' · pulsa Guardar para reintentar');
      return false;
    } finally { est.escribiendo = false; indicador(); renderPestanas(); }
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

  /* Renombra el guion como su archivo (sin extensión) y lo escribe si el nombre cambió. */
  async function nombrarComoArchivo(id) {
    const g = biblioteca.guion(id), est = estado(id); if (!g || !est.archivo) return;
    const base = sinExtension(est.archivo.nombre);
    if (base && base !== g.nombre) {
      biblioteca.renombrar(g.id, base);
      if (id === abiertoId) document.title = g.nombre + ' · ClapCraft';
      est.ultimoEscrito = null; await escribirArchivo(id);
    }
  }

  /* «Guardar como…»: elige archivo, escribe y deja la pestaña vinculada a él. */
  async function guardarComo() {
    const id = abiertoId, g = biblioteca.guion(id); if (!g) return;
    volcar(); C.texto.volcar();
    /* nombre propuesto: «Esquema», no el nombre automático del guion (Leo, 13-09-2026) */
    const contenido = serializar(g), sugerido = 'Esquema.' + EXT;
    if (api && api.saveFile) {
      const ruta = await api.saveFile({ defaultPath: sugerido, content: await empaquetar(contenido), filters: FILTROS });
      if (!ruta) return;
      vincular(id, { nombre: baseDe(ruta), ruta });
      estado(id).ultimoEscrito = contenido;
    } else if (window.showSaveFilePicker) {
      let h;
      try { h = await window.showSaveFilePicker({ suggestedName: sugerido, types: TIPOS }); }
      catch (err) { if (err.name !== 'AbortError') T.tablero.avisar('No se pudo elegir el archivo'); return; }
      vincular(id, { nombre: h.name, handle: h });
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
    await nombrarComoArchivo(id);
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
    volcar(); C.texto.volcar();
    if (await escribirArchivo(id)) T.tablero.avisar('Guardado en ' + est.archivo.nombre);
  }

  /* Abre el texto de un archivo en una pestaña: reutiliza la actual si está sin tocar, y si ese
     archivo ya está abierto en otra, va a ella. Devuelve el guion o null. */
  function abrirEnPestana(texto, nombre, clave) {
    let datos;
    try { datos = JSON.parse(texto); } catch (_) { datos = null; }
    const valido = datos && datos.app === 'clapcraft' && datos.documentos && typeof datos.documentos === 'object' && !Array.isArray(datos.documentos);
    if (!valido) { T.tablero.avisar('Ese archivo no es un guion de ClapCraft'); return null; }
    if (clave) {
      const ya = biblioteca.datos.guiones.find(g => { const a = estado(g.id).archivo; return a && (a.ruta || a.nombre) === clave; });
      if (ya) { montar(ya.id); T.tablero.avisar('Ya estaba abierto: «' + ya.nombre + '»'); return null; }
    }
    const base = sinExtension(nombre) || (typeof datos.nombre === 'string' && datos.nombre.trim()) || SIN_TITULO;
    const actual = biblioteca.guion(abiertoId);
    const copia = biblioteca.toJSON();
    if (esVirgen(actual)) { desvincular(actual.id); delete estados[actual.id]; biblioteca.eliminar(actual.id); }
    const r = biblioteca.crear({ nombre: base, documentos: datos.documentos });
    if (!r.ok) { biblioteca.cargar(copia); T.tablero.avisar(r.aviso); return null; }
    if (abiertoId && !biblioteca.guion(abiertoId)) abiertoId = null;
    montar(r.guion.id);
    return r.guion;
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
  /* Un FileSystemFileHandle (navegador: Abrir…, un reciente o un archivo soltado): se abre y queda vinculado. */
  async function abrirHandle(h) {
    const f = await h.getFile();
    let texto; try { texto = await desempaquetar(await f.arrayBuffer()); } catch (_) { T.tablero.avisar('No se pudo leer ' + f.name); return null; }
    const g = abrirEnPestana(texto, f.name, h.name); if (!g) return null;
    vincular(g.id, { nombre: h.name, handle: h }); estado(g.id).ultimoEscrito = serializar(g); indicador(); renderPestanas();
    recordarReciente(g.id);
    T.tablero.avisar('Abierto ' + h.name + ' · se irá guardando ahí solo');
    return g;
  }
  /* Un archivo con ruta (Electron: diálogo o doble clic en el Finder). */
  async function abrirRuta(ruta, contenido) {
    let texto;
    try { texto = await desempaquetar(contenido !== undefined ? contenido : await api.readFile({ path: ruta, binario: true })); }
    catch (_) { T.tablero.avisar('No se pudo leer ' + ruta); return false; }
    const nombre = baseDe(ruta);
    const g = abrirEnPestana(texto, nombre, ruta); if (!g) return true;
    vincular(g.id, { nombre, ruta }); estado(g.id).ultimoEscrito = serializar(g); indicador(); renderPestanas();
    recordarReciente(g.id);
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
    f.arrayBuffer().then(desempaquetar).then(t => { const g = abrirEnPestana(t, f.name, null); if (g) T.tablero.avisar('Abierto ' + f.name + ' · este navegador no puede guardar ahí solo'); })
      .catch(() => T.tablero.avisar('No se pudo leer ' + f.name));
  });
  $('archivo').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    f.arrayBuffer().then(desempaquetar).then(t => { const g = abrirEnPestana(t, f.name, null); if (g) T.tablero.avisar('Abierto ' + f.name + ' · este navegador no puede guardar ahí solo'); })
      .catch(() => T.tablero.avisar('No se pudo leer ' + f.name));
  });
  if (api && api.onAbrirRuta && api.readFile) api.onAbrirRuta(ruta => abrirRuta(ruta));

  /* Al arrancar se retoman los archivos vinculados: en Electron por su ruta; en el navegador con el
     handle guardado, que puede exigir permiso otra vez (lo pide el primer «Guardar»). */
  async function retomarArchivos() {
    for (const g of biblioteca.datos.guiones) {
      const v = vista.archivos[g.id]; if (!v) continue;
      const est = estado(g.id);
      if (v.ruta && api && api.writeFile) {
        est.archivo = { nombre: v.nombre, ruta: v.ruta, permiso: true };
        if (api.readFile) { try { est.ultimoEscrito = await desempaquetar(await api.readFile({ path: v.ruta, binario: true })); } catch (_) { est.archivo.permiso = false; } }
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
      } else { delete vista.archivos[g.id]; guardarVista(); continue; }
      if (est.archivo.permiso) programarEscritura(g.id);       // lo local es lo último: si difiere, se escribe
    }
    indicador(); renderPestanas();
  }

  /* ---------- arranque ---------- */
  if (escritorio) document.body.classList.add('escritorio');
  const ALTO_PARTIDA = T.tablero.alto();                        // el alto de carril de la hoja de estilos (80)
  T.tablero.iniciar({ modelo, alCambiar, zoom: vista.zoom });
  if (vista.alto) T.tablero.alto(vista.alto);
  abiertoId = biblioteca.activo() ? biblioteca.activo().id : null;
  document.title = (abiertoId ? biblioteca.activo().nombre + ' · ' : '') + 'ClapCraft';
  C.proyectos.iniciar({ crear: crearProyecto, cancelar: cancelarProyecto, nuevo: () => nuevo(), abrir: () => abrirArchivo(), abrirReciente, recientes,
    carpetaInicial, elegirCarpeta, sinCarpeta: api && api.crearProyecto ? 'Elige una carpeta' : 'Solo en este navegador',
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
    marco: $('editorMarco'), tira: $('hilo'), seccion: $('texto'), cabecera: $('textoCab'), tip: $('tip'), biblioteca, notas,
    contenedor: () => { const r = refEsquema(esquemaId); return r ? r.contenedor.nombre : ''; },
    /* el elenco del guion para el editor: sugerencias de «/» y colores */
    elenco: () => (docs() ? docs().elenco().map(p => ({ name: p.nombre, color: p.color })) : []),
    /* «Ver biblioteca» de la cabecera del editor: la biblioteca enlazada al esquema montado */
    tieneBiblioteca: () => !!(esquemaId && docs() && docs().enlace(esquemaId)),
    verBiblioteca: () => { const x = esquemaId && docs() && docs().enlace(esquemaId); if (x) C.gestor.abrirSub(x.sub.id); },
    /* el chip del acto: el segmento expandido de ese acto en la biblioteca enlazada (o, en Personajes, del momento
       en la biblioteca del personaje), con el documento abierto marcado */
    puedeVerSegmento: () => esPersonajes(esquemaId) && !!bibliotecaDelEsquema(),   // las bibliotecas ya no tienen cronología (Leo): solo los momentos de un personaje
    /* el chip del esquema en la cabecera del editor: su nombre, o el personaje con su color */
    esquemaChip: () => {
      const r = refEsquema(esquemaId); if (!r) return null;
      if (!esPersonajes(esquemaId)) return { nombre: r.esquema.nombre };
      const l = vista.personaje && docs().personaje(vista.personaje), t = l && C.PALETA_ETIQUETAS[l.color];
      return l ? { nombre: l.nombre, chl: t && t[1], chd: t && t[2] } : null;
    },
    verSegmento: (actoId, nodoId) => { const sub = bibliotecaDelEsquema(); if (sub) C.gestor.expandir(sub, 'acto:' + actoId, nodoId); },
    modelo: () => modelo, guion: () => biblioteca.guion(abiertoId),
    guardar: persistir, alCambiarTablero: alCambiar, avisar: T.tablero.avisar, vista, guardarVista,
    alternar: () => verVista(vista.modo === 'texto' ? 'esquema' : 'texto'), alternarLado: () => alternarLado(),
    volver: () => { C.gestor.contraer(); verVista(esPersonajes(esquemaId) ? 'personajes' : 'esquema'); },
    /* el tablero de un personaje: sin tira en el editor, y los dos cuadros de un salto comparten nota */
    saltosConNota: () => esPersonajes(esquemaId), sinTira: () => esPersonajes(esquemaId),
    /* el guion del esquema montado (Revisar guión): su estado, sacar/devolver/plegar secciones y la pantalla de revisión */
    barraGuion: $('guionBarra'),
    guionDe: () => (esquemaId && docs() && refEsquema(esquemaId) ? docs().guionEsquema(esquemaId) : null),
    guionAccion: (accion, claves) => accionGuion(accion, claves),
    revisar: () => { C.texto.volcar(); C.revisar.abrir(); C.texto.refrescarGuion(); },   // en Revisar guión la barra se ve aunque esté contraída
    exportar: rect => exportarDesdeEditor(rect),
    alTema: oscuro => { if (oscuro !== esOscuro()) { aplicarTema(oscuro); guardarTema(); } }
  });

  /* ---------- Revisar guión: sacar y devolver secciones, su orden de lectura y el documento plano ---------- */
  function accionGuion(accion, claves) {
    const d = docs(); if (!d || !esquemaId || !claves.length) return;
    const r = accion === 'sacar' ? d.sacarDelGuion(esquemaId, claves)
      : accion === 'devolver' ? d.devolverAlGuion(esquemaId, claves)
      : d.plegarSeccion(esquemaId, claves[0], accion === 'plegar');
    if (r.ok && r.cambio) { biblioteca.marcar(abiertoId); persistir(); }
  }
  /* lo que Revisar guión necesita del esquema montado */
  function datosGuion() {
    const d = docs(), r = refEsquema(esquemaId); if (!d || !r) return null;
    const subId = bibliotecaDelEsquema(), sub = subId && d.sub(subId);
    return { d, eid: esquemaId, tm: modelo, conSaltos: esPersonajes(esquemaId), esquemaNombre: r.esquema.nombre,
             bibliotecaId: esPersonajes(esquemaId) ? null : subId, bibliotecaNombre: sub ? sub.sub.nombre : '' };
  }
  const nombreProyecto = () => { const g = biblioteca.guion(abiertoId); return g ? g.nombre : ''; };
  /* genera el documento plano en «Guiones» de la biblioteca enlazada y lo abre en el editor */
  function generarGuion(titulo) {
    C.texto.volcar();
    const x = datosGuion(); if (!x || !x.bibliotecaId) { T.tablero.avisar('Este esquema no tiene biblioteca enlazada'); return; }
    const doc = C.guion.componer(x.d, x.eid, x.tm, x.conSaltos, { proyecto: nombreProyecto(), titulo });
    const r = x.d.crearGuion(x.bibliotecaId, x.eid, titulo, doc);
    if (!r.ok) { T.tablero.avisar(r.aviso); return; }
    biblioteca.marcar(abiertoId); persistir();
    C.revisar.cerrar();
    C.gestor.abrirNota(r.nota.id);
    T.tablero.avisar(r.aviso);
  }
  /* El documento que exporta cada sitio: una nota abierta (un guion generado u otra), o lo que está dentro del guion del
     esquema montado, en su orden de lectura. */
  function documentoAExportar() {
    const d = docs(); if (!d) return null;
    const nid = C.gestor.notaAbierta();
    if (nid && C.texto.enDocumento()) { C.texto.volcar(); const n = d.nota(nid); return n ? { titulo: n.titulo, html: n.html } : null; }
    const x = datosGuion(); if (!x) return null;
    C.texto.volcar();
    const titulo = x.esquemaNombre + ' · guion';
    return { titulo, html: C.guion.componer(x.d, x.eid, x.tm, x.conSaltos, { proyecto: nombreProyecto(), titulo: x.esquemaNombre }).html };
  }
  /* «Exportar» de la barra inferior del editor (dentro del marco): el menú se abre en la página, sobre el botón */
  function exportarDesdeEditor(rect) {
    const disparador = { getBoundingClientRect: () => rect, classList: { add() {}, remove() {} }, focus() {} };
    C.exportar.menu(disparador, documentoAExportar, T.tablero.avisar);
  }
  C.revisar.iniciar({
    seccion: $('texto'), cont: $('revisar'), cab: $('textoCab'), datos: datosGuion,
    accion: (accion, claves) => { accionGuion(accion, claves); C.texto.refrescarGuion(); },
    ordenar: claves => { const d = docs(); if (!d || !esquemaId) return; const r = d.ordenarGuion(esquemaId, claves); if (r.ok && r.cambio) { biblioteca.marcar(abiertoId); persistir(); } },
    generar: generarGuion,
    abrirGuion: id => { C.revisar.cerrar(); C.gestor.abrirNota(id); },
    exportar: boton => C.exportar.menu(boton, documentoAExportar, T.tablero.avisar),
    alCerrar: () => { C.texto.refrescarGuion(); C.texto.enfocar(); }
  });

  /* Doble clic en un nodo del tablero: abre su documento en el editor (en lugar de renombrarlo en
     sitio, que sigue en el panel). Va en fase de captura para que el tablero no lo vea; los extremos
     de un salto no tienen nota y conservan su doble clic, salvo en el tablero de un personaje, donde los
     dos cuadros de un salto comparten una nota (`saltosConNota`). */
  $('board').addEventListener('dblclick', e => {
    const pt = e.target.closest && e.target.closest('.pt');
    if (!pt || !modelo.punto(pt.dataset.punto) || (modelo.saltoDe(pt.dataset.punto) && !esPersonajes(esquemaId))) return;
    e.preventDefault(); e.stopPropagation();
    verVista('texto', pt.dataset.punto);
  }, true);

  /* ---------- gestor de documentos (vista Documentos) ---------- */
  C.gestor.iniciar({
    seccion: $('documentos'), lado: $('gdSide'), main: $('gdMain'), migas: $('migas'),
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
    abrirNodo: (eid, id) => { if (!refEsquema(eid)) return; if (eid !== esquemaId) montarEsquema(eid); verVista('texto', id); },
    esquemaMontado: () => esquemaId, modo: () => vista.modo,
    crearEsquemaDatos: () => T.inicial(),
    abrirEsquema: eid => { montarEsquema(eid || null); verVista('esquema'); },
    personajes, abrirPersonaje, verPersonajes, verContenedores, nuevoPersonaje: () => nuevoPersonaje(), renombrarPersonaje, eliminarPersonaje, colorPersonaje,
    carrusel: $('personajesSeg'),
    esquemaPersonaje: pid => { const e = docs() && docs().esquemaPersonaje(pid); return e ? e.id : null; },
    personajesActivo: () => vista.modo === 'personajes' || (vista.modo === 'texto' && esPersonajes(esquemaId))
      || (vista.modo === 'documentos' && !!C.gestor.notaAbierta() && (C.gestor.subActual() || {}).cid === C.ID_PERSONAJES),
    /* lo elegido en la barra se enseña en la vista Documentos (la barra está en todas) */
    mostrarTablero: () => { if (vista.modo !== 'documentos') verVista('documentos'); },
    alternarLado: () => alternarLado(),
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
      const cambio = arr.plegado !== !!vista.ladoPlegado; arr = null;
      asa.classList.remove('activa'); document.body.classList.remove('redimensionando');
      guardarVista(); if (cambio) C.gestor.render();
    };
    asa.addEventListener('pointerup', soltar);
    asa.addEventListener('pointercancel', soltar);
    asa.addEventListener('dblclick', e => { e.stopPropagation(); vista.ladoPlegado = false; delete vista.ladoAncho; guardarVista(); aplicarLado(); C.gestor.render(); });
    asa.addEventListener('click', e => e.stopPropagation());
  })();
  function alternarLado() { vista.ladoPlegado = !vista.ladoPlegado; delete vista.ladoFijo; guardarVista(); aplicarLado(); C.gestor.render(); }
  aplicarLado();
  /* el pie del esquema (escala, deshacer) no es un clic en blanco del tablero: no suelta la selección */
  document.querySelector('.esq-pie').addEventListener('click', e => e.stopPropagation());
  /* «Ver documentos»: los documentos enlazados al esquema montado, en la vista Documentos */
  $('verDocumentos').addEventListener('click', e => {
    e.stopPropagation();
    const x = esquemaId && docs() && docs().enlace(esquemaId);
    if (x) C.gestor.abrirSub(x.sub.id);
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
  function verVista(modo, puntoId) {
    modo = ['texto', 'documentos', 'personajes'].includes(modo) ? modo : 'esquema';
    if (modo === 'personajes' && !esPersonajes(esquemaId) && !document.body.classList.contains('sin-personajes')) { verPersonajes(); return; }   // primero hay que montar su tablero
    if (modo === 'esquema' && esPersonajes(esquemaId)) modo = 'personajes';   // el tablero de Personajes se ve en su pantalla
    const anterior = vista.modo, cambia = modo !== anterior;
    vista.modo = modo; guardarVista();
    if (cambia && anterior === 'documentos') C.gestor.salir();
    if (cambia && anterior === 'texto') C.texto.volcar();
    if (modo !== 'texto' && C.revisar.abierto()) C.revisar.cerrar();
    document.body.classList.toggle('vista-texto', modo === 'texto');
    document.body.classList.toggle('vista-documentos', modo === 'documentos');
    document.body.classList.toggle('vista-personajes', modo === 'personajes');
    /* el editor de nodos (texto) es parte del esquema: en la cabecera se ve como Esquema */
    const cabecera = modo === 'texto' ? 'esquema' : modo;
    document.querySelectorAll('[data-vista]').forEach(b => {
      b.classList.toggle('on', b.dataset.vista === cabecera);
      b.setAttribute('aria-selected', String(b.dataset.vista === cabecera));
    });
    if (modo === 'texto') {
      const sel = T.tablero.seleccion();
      if (abiertoId) C.texto.abrir(puntoId || (sel && sel.tipo === 'punto' ? sel.id : null));
    } else if (modo === 'documentos') {
      C.gestor.mostrar();
    } else if (cambia) {
      T.tablero.render();
      const id = C.texto.actual();
      if (id) seleccionarEnTablero(id);
    }
    if (cambia && modo !== 'documentos') C.gestor.render();   // el menú señala lo que enseña la vista
  }
  document.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => verVista(b.dataset.vista)));

  /* tras cada render del tablero, los selectores de personaje (solo en el tablero de Personajes) */
  new MutationObserver(() => marcarPersonaje()).observe($('rows'), { childList: true });
  /* el selector del carril: su clic y su puntero no llegan al tablero (lo tomaría por elegir o arrastrar la trama) */
  ['pointerdown', 'mousedown', 'dblclick'].forEach(t => $('rows').addEventListener(t, e => {
    const b = e.target.closest('.per-combo'); if (b && (t === 'dblclick' || !b.classList.contains('fijo'))) e.stopPropagation();   // el nombre fijo no se renombra con doble clic
    if (e.target.closest('.per-color, .per-etq')) e.stopPropagation();
  }));
  /* el color de la trama de un carril: los 24 tonos (en Personajes el panel de la trama no se abre) */
  $('rows').addEventListener('click', e => {
    const b = e.target.closest('.per-color'); if (!b) return;
    e.stopPropagation();
    const lid = b.dataset.linea, l = modelo.linea(lid); if (!l) return;
    C.gestor.paletaTrama(b, l.color, c => { modelo.editarLinea(lid, { color: c }); T.tablero.render(); alCambiar(); if (vista.modo === 'personajes') C.gestor.render(); });
  });
  $('rows').addEventListener('click', e => {
    const b = e.target.closest('.per-combo:not(.fijo)'); if (!b) return;
    e.stopPropagation();
    const lid = b.dataset.linea, l = modelo.linea(lid); if (!l) return;
    C.gestor.menuCarril(b, { actual: l.personaje || null, salvo: conCarril(lid), alElegir: pid => asignarCarril(lid, pid), alQuitar: () => asignarCarril(lid, null) });
  });
  /* «＋ personaje» (el «Nueva trama» del tablero): sin elegir tipo, se elige un personaje y nace su carril */
  $('rows').addEventListener('click', e => {
    const b = esPersonajes(esquemaId) && e.target.closest('#addLinea'); if (!b) return;
    e.stopPropagation(); e.preventDefault();
    C.gestor.menuCarril(b, { titulo: 'Añadir personaje', salvo: conCarril(), alElegir: pid => { const p = docs().personaje(pid); if (p) carrilNuevo(p); } });
  }, true);

  /* En el panel del tablero, un nodo con nota ofrece abrirla (los extremos de un salto no tienen).
     El panel se reconstruye con innerHTML en cada selección: se observa y se añade el botón. */
  new MutationObserver(() => {
    const panel = $('panel'), s = T.tablero.seleccion();
    /* en el tablero de un personaje, elegir un carril no abre el panel (Leo): el carril es su personaje */
    if (s && s.tipo === 'linea' && esPersonajes(esquemaId)) { if (panel.childElementCount) { panel.replaceChildren(); document.body.classList.remove('con-panel'); } return; }
    if (!s || s.tipo !== 'punto' || panel.querySelector('[data-nota-abrir]') || (modelo.saltoDe(s.id) && !esPersonajes(esquemaId))) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn act-btn'; b.dataset.notaAbrir = s.id;
    b.innerHTML = '<svg width="14" height="14"><use href="#ic-script"></use></svg>Abrir documento';
    const acciones = panel.querySelector('.panel-acciones');
    if (acciones) acciones.insertBefore(b, acciones.firstChild); else panel.appendChild(b);
  }).observe($('panel'), { childList: true });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-nota-abrir]');
    if (b) verVista('texto', b.dataset.notaAbrir);
  });
  /* la app arranca en Contenedores (Leo): si se cerró en Personajes, vuelve a la vista de la que se entró */
  if (vista.modo === 'personajes') { vista.modo = vista.modoPrevio === 'documentos' ? 'documentos' : 'esquema'; guardarVista(); C.gestor.render(); }
  if (vista.modo !== 'esquema') verVista(vista.modo);
  /* el editor se carga escondido desde el principio: así la primera nota no parpadea en blanco */
  else setTimeout(() => C.texto.precargar(), 600);


  /* Escalas del tablero: horizontal (ancho de celda, T.tablero.zoom) y vertical (alto de carril,
     T.tablero.alto); se recuerdan en la vista y el botón vuelve a las de partida. */
  const ESCALA = { zoom: 1.7, alto: ALTO_PARTIDA };
  const zoom = $('zoom'), altoFila = $('altoFila'), escalaReset = $('escalaReset');
  const relleno = r => r.style.setProperty('--pct', ((r.value - r.min) / (r.max - r.min) * 100) + '%');   // la parte recorrida, en acento
  function pintarEscalas() {
    zoom.value = T.tablero.zoom(); altoFila.value = T.tablero.alto();
    relleno(zoom); relleno(altoFila);
    escalaReset.disabled = T.tablero.zoom() === ESCALA.zoom && T.tablero.alto() === ESCALA.alto;
  }
  zoom.oninput = () => { T.tablero.zoom(+zoom.value); vista.zoom = +zoom.value; guardarVista(); pintarEscalas(); };
  altoFila.oninput = () => { T.tablero.alto(+altoFila.value); vista.alto = T.tablero.alto(); guardarVista(); pintarEscalas(); };
  escalaReset.onclick = () => { T.tablero.zoom(ESCALA.zoom); T.tablero.alto(ESCALA.alto); delete vista.zoom; delete vista.alto; guardarVista(); pintarEscalas(); };
  pintarEscalas();

  /* Deshacer y rehacer según la vista: el tablero tiene su historial; el editor, el suyo. */
  const deshacer = () => { if (vista.modo === 'texto') { const d = $('editorMarco').contentDocument; if (d) d.execCommand('undo'); } else T.tablero.deshacer(); };
  const rehacer = () => { if (vista.modo === 'texto') { const d = $('editorMarco').contentDocument; if (d) d.execCommand('redo'); } else T.tablero.rehacer(); };

  $('btnGuardar').onclick = guardar;
  $('btnGuardarComo').onclick = guardarComo;
  $('btnAbrir').onclick = abrirArchivo;
  $('btnNuevo').onclick = nuevo;
  $('estadoGuardado').onclick = guardar;

  /* Órdenes del menú de la aplicación (Electron): Archivo, Edición y Ver. */
  const ordenes = {
    nuevo, abrir: abrirArchivo, guardar, guardarComo, cerrar: () => { if (pantalla === 'nuevo') cancelarProyecto(); else if (abiertoId) cerrarPestana(abiertoId); },
    tema: alternarTema, vista: () => verVista(vista.modo === 'texto' ? 'esquema' : 'texto'),
    documentos: () => verVista(vista.modo === 'documentos' ? 'esquema' : 'documentos'),
    lado: () => alternarLado(), deshacer, rehacer,
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
    if (cmd && e.shiftKey && k === 'b') { e.preventDefault(); ordenes.lado(); }
    if (e.ctrlKey && e.key === 'Tab') { e.preventDefault(); pasarPestana(e.shiftKey ? -1 : 1); }
  });
  window.addEventListener('beforeunload', () => {
    C.texto.volcar(); if (temporizador) volcar();
    biblioteca.datos.guiones.forEach(g => { if (sucio(g.id)) escribirArchivo(g.id); });   // lo que dé tiempo
  });

  /* API para el gestor de documentos que venga después: la biblioteca, el guion abierto y la vista. */
  C.biblioteca = biblioteca;
  C.app = { abrir: montar, nuevo, crearProyecto, cancelarProyecto, cerrar: cerrarPestana, abrirReciente, recientes, guardar, guardarComo, abrirArchivo, montarEsquema, esquemaMontado: () => esquemaId,
            archivo: id => { const a = estado(id || abiertoId).archivo; return a && { nombre: a.nombre, ruta: a.ruta || null, permiso: a.permiso }; },
            sucio: id => sucio(id || abiertoId), abiertoId: () => abiertoId, vista: verVista, modo: () => vista.modo };
})(window.Claquedraw, window.Tramas);
