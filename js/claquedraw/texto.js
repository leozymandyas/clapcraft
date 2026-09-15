/* Claquedraw · texto
   La vista de escritura: el editor (index.html) dentro de un <iframe> y, encima de su cinta, la tira
   de la trama. La tira enseña una trama a la vez, con sus nodos dibujados igual que en el esquema.
   **Un esquema es un solo documento** (Leo, 15-09-2026, docs/diseno/rediseno-8/): en el editor va una sección
   por nodo, en el orden del tiempo (celda y, en la misma celda, carril), cada una con su cabecera (`.cd-seccion`,
   un bloque fijo del editor: js/fijos.js impide borrarla desde el texto; se borra desde el esquema) y los nodos de
   la tira son anclas: al pulsarlos la hoja va a su sección. Doble clic en la cabecera renombra el nodo. Los
   extremos de un salto (cuadro o rombo) no tienen sección: al pulsarlos la tira pasa a la trama del otro extremo.
   Por dentro cada sección se sigue guardando en la nota de su nodo (`o.notas`): al componer se juntan y al
   guardar se reparten (`partir`), escribiendo solo las que cambiaron (`base`).

   Se habla con el editor por `Ed.document` (get/set/onChange) a través de la ventana del marco; lo único
   que el editor sabe de las secciones es que sus cabeceras son bloques fijos (`.ed-fijo`). Su autoguardado escribe en `guiones.editor.doc`, la misma clave que usa
   index.html abierto a solas; para no pisar ese documento, al cargar el marco se redirige esa clave
   (parche en `Storage.prototype` del marco, antes de que el editor guarde nada).

   Reglas: el título de cada sección es el título de su nodo (renombrarla renombra el nodo);
   las notas viven en el guion (proyecto: `biblioteca.notas`; esquema de un contenedor: su `esquema.notas`)
   y llegan por el acceso `o.notas` (leer/guardar/actual/fijarActual) que decide app.js; nunca en el marco. */
(function (C) {
  const CLAVE_EDITOR = 'guiones.editor.doc', CLAVE_PROPIA = 'guiones.claquedraw.editor.doc';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ETIQUETA = { principal: 'Principal', secundaria: 'Secundaria', alterna: 'Alternativa' };
  const FORMA = { cuadro: 'Cambio de escena', rombo: 'Salto alternativo' };

  let marco, tira, E = null, cargando = null;
  let o = {};                                    // opciones de iniciar()
  let notaId = null;                             // nodo de la sección donde está el cursor
  let compuesto = null;                          // claves de las secciones que tiene el editor, en orden (null: no lleva el documento del esquema)
  let base = new Map();                          // clave → firma de lo último guardado de cada sección (lo que no cambió no se reescribe)
  let activa = null;                             // clave de la sección activa
  const elegidas = new Set();                    // secciones marcadas con su casilla (en la hoja, la tira o Revisar guión)
  let lineaId = null;                            // trama que enseña la tira
  let posicion = null;                           // nodo resaltado en la tira (la nota, o el extremo al que se saltó)
  let documento = null;                          // { guardar(doc), alCambiar() } cuando el editor lleva una nota del gestor

  const modelo = () => o.modelo();
  const guion = () => o.guion();

  /* ---------- el editor dentro del marco ---------- */
  function cargarEditor() {
    if (E) return Promise.resolve(E);
    if (cargando) return cargando;
    cargando = new Promise(listo => {
      marco.addEventListener('load', () => {
        const w = marco.contentWindow;
        /* El editor guarda solo en localStorage; aquí esa copia va a una clave propia. */
        const S = w.Storage.prototype, set = S.setItem, get = S.getItem, rem = S.removeItem;
        const clave = k => k === CLAVE_EDITOR ? CLAVE_PROPIA : k;
        S.setItem = function (k, v) { return set.call(this, clave(k), v); };
        S.getItem = function (k) { return get.call(this, clave(k)); };
        S.removeItem = function (k) { return rem.call(this, clave(k)); };

        E = w.Ed;
        E.document.onChange(alCambiarEditor);
        /* Escribir en el título no pasa por onChange (el editor solo lo autoguarda): se escucha aparte. */
        let tituloT = null;
        const titulo = w.document.getElementById('docTitle');
        if (titulo) titulo.addEventListener('input', () => {
          clearTimeout(tituloT); tituloT = setTimeout(() => alCambiarEditor(E.document.get()), 300);
        });
        tema(document.documentElement.dataset.theme === 'dark');

        w.document.addEventListener('keydown', onKey, true);
        iniciarSecciones(w);
        adaptarMarco(w);
        aplicarCabecera();
        /* El editor tiene su propio botón de modo oscuro: si lo cambia desde dentro, la página (y la
           tira) le siguen. Al revés ya va por tema(). */
        new MutationObserver(() => {
          if (o.alTema) o.alTema(w.document.documentElement.dataset.theme === 'dark');
        }).observe(w.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        listo(E);
      }, { once: true });
      marco.src = 'index.html';
    });
    return cargando;
  }

  /* Atajos dentro del editor (en fase de captura, para que el editor no los vea también). Se evitan
     las combinaciones que ya usa el editor (Ctrl+Shift+E centra, Ctrl+Shift+L alinea, etc.). */
  function onKey(e) {
    const cmd = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (cmd && e.shiftKey && k === 'g') { e.preventDefault(); e.stopPropagation(); if (o.alternar) o.alternar(); return; }
    if (cmd && e.shiftKey && k === 'b') { e.preventDefault(); e.stopPropagation(); if (o.alternarLado) o.alternarLado(); return; }
    if (cmd && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); e.stopPropagation(); mover(e.key === 'ArrowUp' ? -1 : 1); }
  }

  function tema(oscuro) {
    if (!marco || !marco.contentDocument) return;
    marco.contentDocument.documentElement.dataset.theme = oscuro ? 'dark' : 'light';
  }

  /* ---------- notas ---------- */
  /* Escribe lo que hay en el editor en la nota del nodo abierto (o en el documento del gestor). */
  function volcar() {
    if (!E) return;
    if (documento) { documento.guardar(E.document.get()); return; }
    if (!compuesto || !guion()) return;
    if (volcarSecciones() && o.guardar) o.guardar();
  }

  /* ---------- una nota del gestor de documentos en el editor ----------
     Sin tira: encima van las migas (#migas, las pinta el gestor) y la cinta del editor. */
  async function abrirDocumento(doc, ganchos) {
    await cargarEditor();
    volcar();
    notaId = null; posicion = null;
    soltarSecciones();
    documento = ganchos;
    if (E.characters && E.characters.setGlobal && o.elenco) E.characters.setGlobal(o.elenco());   // los personajes de todo el guion
    E.document.set({ title: doc.titulo || '', html: doc.html || '', characters: doc.characters || {} });
    alPrincipio();
    aplicarCabecera();
    if (E.focusEditor) E.focusEditor();
  }
  /* otro documento empieza arriba (Leo): el cursor ya va al principio, pero la hoja conservaba el desplazamiento del anterior */
  function alPrincipio() {
    const ws = marco && marco.contentDocument && marco.contentDocument.getElementById('workspace');
    if (ws) { ws.scrollTop = 0; ws.scrollLeft = 0; }
  }
  function cerrarDocumento() {
    if (!documento) return;
    volcar(); documento = null;
    aplicarCabecera();
  }

  /* Dónde vive la nota de un nodo: en su id. Con `saltosConNota` (tablero de un personaje) los dos
     extremos de un salto comparten la nota, guardada con el id del extremo de salida (`deId`); borrar el
     salto borra los dos nodos y la poda del esquema se lleva la nota. */
  const conNota = () => !!(o.saltosConNota && o.saltosConNota());
  function claveNota(id) { const s = conNota() && modelo().saltoDe(id); return s ? s.deId : id; }

  function alCambiarEditor(doc) {
    if (documento) { documento.guardar(doc); if (documento.alCambiar) documento.alCambiar(doc); return; }
    if (!compuesto || !guion()) return;
    if (repararSecciones()) doc = E.document.get();
    marcarBloques();
    volcarSecciones(doc);
    if (o.guardar) o.guardar();
  }

  /* ---------- el documento del esquema: una sección por nodo ---------- */
  /* Los nodos con sección, en el orden del tiempo: por celda y, en la misma, por carril. Sin extremos de salto (en el
     tablero de un personaje, el salto tiene una: la de su extremo de salida). */
  const listaSecciones = () => C.guion.secciones(modelo(), conNota());
  /* El estado del guion del esquema montado (fuera, orden, plegadas); sin acceso, todo dentro. */
  const estadoGuion = () => (o.guionDe && o.guionDe()) || { fuera: [], orden: [], plegadas: [] };
  /* iconos dentro del marco (el sprite de la página no llega): casilla, sacar, plegar */
  const ICO = {
    check: '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.4 6.6 11.4 12.6 4.8"/></svg>',
    sacar: '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="5.4"/><path d="M4.2 11.8 11.8 4.2"/></svg>',
    devolver: '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.4 6.6 11.4 12.6 4.8"/></svg>',
    abajo: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>',
    derecha: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>'
  };
  /* La cabecera de una sección (diseño: casilla, punto del nodo, nombre y tipo de su trama, y a la derecha «Sacar del guión» o
     «Devolver al guión» y el plegado); un bloque fijo del editor. Fuera del guion: banda gris, nombre tachado. */
  function seccionHtml(p, g) {
    g = g || estadoGuion();
    const m = modelo(), l = m.linea(p.lineaId) || {}, s = m.saltoDe(p.id), k = claveNota(p.id);
    const forma = s ? (s.tipo === 'rombo' ? ' rombo' : ' caja') : '';
    const fuera = g.fuera.includes(k), plegada = g.plegadas.includes(k), marcada = elegidas.has(k);
    let tipo = fuera ? 'Fuera del guión' : (ETIQUETA[l.tipo] || '');
    if (fuera && plegada) tipo += ' · plegada · ' + C.guion.numero(C.guion.palabras((o.notas.leer(k) || {}).html)) + ' palabras';
    else if (plegada) tipo += ' · plegada';
    return `<div class="cd-seccion ed-fijo${fuera ? ' sin-guion' : ''}${plegada ? ' plegada' : ''}${marcada ? ' elegida' : ''}" contenteditable="false" data-seccion="${esc(k)}" style="--c:var(--t-${esc(p.color || l.color || 'azul')});--tl:var(--t-${esc(l.color || 'azul')});--fl:var(--f-${esc(l.color || 'azul')})">`
      + `<span class="cd-sec-casilla" data-sec-accion="elegir" role="checkbox" aria-checked="${marcada}" title="Seleccionar la sección">${marcada ? ICO.check : ''}</span>`
      + `<i class="cd-sec-punto${forma}${p.cortado ? ' cortado' : ''}"></i><span class="cd-sec-nom">${esc(p.titulo) || 'Sin título'}</span>`
      + `<span class="cd-sec-sep"></span><span class="cd-sec-tipo">${esc(tipo)}</span><span class="cd-sec-hueco"></span>`
      + (fuera ? `<span class="cd-sec-accion devolver" data-sec-accion="devolver" role="button">${ICO.devolver}Devolver al guión</span>`
               : `<span class="cd-sec-accion" data-sec-accion="sacar" role="button">${ICO.sacar}Sacar del guión</span>`)
      + `<span class="cd-sec-plegar" data-sec-accion="plegar" role="button" title="${plegada ? 'Desplegar' : 'Plegar'} la sección">${plegada ? ICO.derecha : ICO.abajo}</span></div>`;
  }
  const VACIO = '<p><br></p>';
  const selSeccion = clave => `:scope > .cd-seccion[data-seccion="${CSS.escape(clave)}"]`;
  function esVacio(html) {
    const t = document.createElement('template'); t.innerHTML = html || '';
    return !t.content.textContent.replace(/[\s\u200B]/g, '') && !t.content.querySelector('img, table, hr, .db');
  }
  /* la clave de un personaje, como en characters.js («MARA (V.O.)» y «Mara» son el mismo) */
  const clavePersonaje = s => String(s || '').replace(/\u200B/g, '').replace(/\s+/g, ' ').trim().replace(/\s*\([^)]*\)\s*$/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  /* Junta las notas de los nodos en el editor. */
  function componer(lista) {
    const chars = {};
    const html = lista.map(p => {
      const n = o.notas.leer(claveNota(p.id)) || {};
      Object.assign(chars, n.characters || {});
      return seccionHtml(p) + (esVacio(n.html) ? VACIO : n.html);
    }).join('');
    if (E.characters && E.characters.setGlobal && o.elenco) E.characters.setGlobal(o.elenco());   // los personajes de todo el guion
    const ce = o.esquemaChip ? o.esquemaChip() : null;
    E.document.set({ title: ce ? ce.nombre : '', html, characters: chars });
    E.editor.classList.toggle('con-secciones', lista.length > 0);
    E.editor.classList.toggle('sin-secciones', !lista.length);
    E.editor.contentEditable = lista.length ? 'true' : 'false';   // sin nodos no hay dónde escribir
    compuesto = lista.map(p => claveNota(p.id));
    [...elegidas].forEach(k => { if (!compuesto.includes(k)) elegidas.delete(k); });
    marcarBloques();
    base = new Map();
    partir(E.document.get()).forEach((parte, clave) => { const p = modelo().punto(clave); if (p) base.set(clave, firma(p, parte)); });
    activa = null; notaId = null;
    alPrincipio();
  }
  function soltarSecciones() {
    compuesto = null; activa = null; base = new Map();
    if (E && E.editor) { E.editor.classList.remove('con-secciones', 'sin-secciones'); E.editor.contentEditable = 'true'; }
  }
  /* Reparte el HTML del editor por secciones: clave → { html, characters } (lo que hubiera antes de la primera
     cabecera, a la primera). Los personajes de cada una son los del registro que se nombran en ella. */
  function partir(doc) {
    const t = document.createElement('template'); t.innerHTML = doc.html || '';
    const partes = new Map(); let actual = null, sueltos = [];
    Array.from(t.content.childNodes).forEach(n => {
      if (n.nodeType === 1 && n.matches('.cd-seccion[data-seccion]')) {
        actual = n.dataset.seccion;
        if (!partes.has(actual)) partes.set(actual, { nodos: sueltos || [] });
        sueltos = null;
        return;
      }
      if (actual) partes.get(actual).nodos.push(n); else if (sueltos) sueltos.push(n);
    });
    const registro = doc.characters || {}, res = new Map();
    partes.forEach((parte, clave) => {
      const caja = document.createElement('div'); parte.nodos.forEach(n => caja.appendChild(n));
      caja.querySelectorAll('.cd-sin-guion, .cd-oculto').forEach(b => { b.classList.remove('cd-sin-guion', 'cd-oculto'); if (!b.classList.length) b.removeAttribute('class'); });   // marcas de la hoja, no del texto
      const chars = {};
      caja.querySelectorAll('p.sp-character').forEach(b => { const k = clavePersonaje(b.textContent); if (k && registro[k]) chars[k] = registro[k]; });
      res.set(clave, { html: esVacio(caja.innerHTML) ? '' : caja.innerHTML, characters: chars });
    });
    return res;
  }
  const firma = (p, parte) => JSON.stringify([p.titulo || '', parte.html, parte.characters]);
  /* Escribe en la nota de su nodo cada sección que cambió. Devuelve si alguna cambió. */
  function volcarSecciones(doc) {
    if (!compuesto || !guion() || !E) return false;
    const m = modelo(); let cambio = false;
    partir(doc || E.document.get()).forEach((parte, clave) => {
      const p = m.punto(clave); if (!p) return;                  // su nodo se borró desde el esquema
      const f = firma(p, parte); if (base.get(clave) === f) return;
      base.set(clave, f);
      if (!parte.html && !o.notas.leer(clave)) return;           // una sección vacía que nunca tuvo nota no la crea
      const r = o.notas.guardar(clave, { title: p.titulo || '', html: parte.html, characters: parte.characters });
      if (r.ok && r.cambio) cambio = true;
    });
    return cambio;
  }
  /* Red de seguridad (js/fijos.js ya impide borrar cabeceras): cabeceras repetidas o de nodos que no son de este
     documento fuera, las que falten de vuelta detrás de la anterior, cada una con al menos un bloque, y nada antes de
     la primera. Devuelve si tocó algo. */
  function repararSecciones() {
    const ed = E && E.editor; if (!ed || !compuesto || !compuesto.length) return false;
    let tocado = false;
    const vistas = new Set();
    Array.from(ed.querySelectorAll('.cd-seccion')).forEach(c => {
      const k = c.dataset.seccion;
      if (c.parentNode !== ed || vistas.has(k) || !compuesto.includes(k)) { c.remove(); tocado = true; } else vistas.add(k);
    });
    const fragmento = html => { const t = document.createElement('template'); t.innerHTML = html; return ed.ownerDocument.importNode(t.content, true); };
    compuesto.forEach((k, i) => {
      if (vistas.has(k)) return;
      const p = modelo().punto(k); if (!p) return;
      const prev = compuesto.slice(0, i).reverse().map(x => ed.querySelector(selSeccion(x))).find(Boolean);
      let ref = prev ? prev.nextElementSibling : ed.firstChild;
      while (prev && ref && !(ref.classList && ref.classList.contains('cd-seccion'))) ref = ref.nextElementSibling;
      ed.insertBefore(fragmento(seccionHtml(p) + VACIO), ref || null);
      tocado = true;
    });
    ed.querySelectorAll(':scope > .cd-seccion').forEach(c => {
      const n = c.nextElementSibling;
      if (!n || n.classList.contains('cd-seccion')) { c.after(fragmento(VACIO)); tocado = true; }
    });
    const primera = ed.querySelector(':scope > .cd-seccion');
    if (primera && ed.firstChild !== primera) {
      const antes = []; for (let n = ed.firstChild; n && n !== primera; n = n.nextSibling) antes.push(n);
      let ref = primera;
      antes.forEach(n => { if (n.nodeType === 3 && !n.nodeValue.trim()) { n.remove(); return; } ref.after(n); ref = n; tocado = true; });
    }
    return tocado;
  }
  /* Las cabeceras al día con el esquema y el guion (nombres, tramas, formas, fuera, plegadas, marcas) sin recomponer. */
  function actualizarCabeceras() {
    const ed = E && E.editor; if (!ed || !compuesto) return;
    const m = modelo(), g = estadoGuion();
    ed.querySelectorAll(':scope > .cd-seccion').forEach(c => {
      const p = m.punto(c.dataset.seccion); if (!p) return;
      const t = document.createElement('template'); t.innerHTML = seccionHtml(p, g);
      const nuevo = t.content.firstElementChild;
      if (c.innerHTML !== nuevo.innerHTML) c.innerHTML = nuevo.innerHTML;
      if (c.getAttribute('style') !== nuevo.getAttribute('style')) c.setAttribute('style', nuevo.getAttribute('style'));
      const clase = nuevo.className + (c.classList.contains('activa') ? ' activa' : '');
      if (c.className !== clase) c.className = clase;
    });
    marcarBloques();
  }
  /* El texto de las secciones fuera del guion va apagado y el de las plegadas no se ve (`cd-sin-guion`, `cd-oculto`: marcas
     de la hoja que `partir` quita al guardar). */
  function marcarBloques() {
    const ed = E && E.editor; if (!ed || !compuesto) return;
    const g = estadoGuion(), fuera = new Set(g.fuera), plegadas = new Set(g.plegadas);
    let k = null;
    Array.from(ed.children).forEach(b => {
      if (b.classList.contains('cd-seccion')) { k = b.dataset.seccion; return; }
      const f = !!k && fuera.has(k), pl = !!k && plegadas.has(k);
      if (b.classList.contains('cd-sin-guion') !== f) b.classList.toggle('cd-sin-guion', f);
      if (b.classList.contains('cd-oculto') !== pl) b.classList.toggle('cd-oculto', pl);
      if (!b.classList.length && b.hasAttribute('class')) b.removeAttribute('class');
    });
  }

  /* ---------- el guion desde el editor: marcar, sacar, devolver, plegar ---------- */
  function alternarElegida(k) { if (elegidas.has(k)) elegidas.delete(k); else elegidas.add(k); refrescarGuion(); }
  /* `soltar`: tras actuar sobre la selección (la barra), se desmarca; una sección suelta no toca la selección */
  function accionGuion(accion, lista, soltar) {
    if (!o.guionAccion || !lista.length) return;
    o.guionAccion(accion, lista);
    if (soltar) elegidas.clear();
    refrescarGuion();
  }
  /* Tras un cambio del guion (aquí o en Revisar guión): cabeceras, texto, tira y barra. */
  function refrescarGuion() {
    if (compuesto) { actualizarCabeceras(); render(); }
    renderBarra();
    if (C.revisar && C.revisar.abierto && C.revisar.abierto()) C.revisar.render();
  }
  /* La barra de guión, bajo la tira: cuántas secciones hay fuera, la selección con Sacar/Devolver, lo mismo para todas y
     «Revisar guión» (el primario). Solo con el documento de un esquema. */
  function renderBarra() {
    const b = o.barraGuion; if (!b) return;
    const aplica = !!compuesto && !documento && !(o.sinTira && o.sinTira());
    /* «Armar guión» en la cabecera, siempre a la vista, la abre y la contrae (Leo, 15-09-2026: quitaba mucho espacio);
       contraída no ocupa nada; en Revisar guión siempre se ve */
    const revisando = !!(o.seccion && o.seccion.classList.contains('revisando'));
    const plegada = !(o.vista && o.vista.guionAbierto) && !revisando;   // de partida, contraída (Leo)
    b.hidden = !aplica || plegada;
    const mostrar = o.cabecera && o.cabecera.querySelector('[data-texto-guion]');
    if (mostrar) {
      mostrar.hidden = !aplica;
      mostrar.setAttribute('aria-expanded', String(!plegada));
      mostrar.classList.toggle('abierta', !plegada);                 // el chevrón apunta arriba con la barra abierta
      mostrar.title = plegada ? 'Mostrar la barra de guión' : 'Contraer la barra de guión';
    }
    /* contraída, las cabeceras de sección y la tira esconden también sus casillas y «Sacar / Devolver» */
    if (o.seccion) o.seccion.classList.toggle('guion-plegado', aplica && plegada);
    const raiz = marco && marco.contentDocument && marco.contentDocument.documentElement;
    if (raiz) raiz.classList.toggle('cd-guion-plegado', aplica && plegada);
    if (!aplica || plegada) return;
    const g = estadoGuion(), fuera = compuesto.filter(k => g.fuera.includes(k)).length;
    const marcadas = compuesto.filter(k => elegidas.has(k));
    b.querySelector('[data-guion-cuenta]').textContent = fuera + ' fuera de ' + compuesto.length;
    const sel = b.querySelector('[data-guion-sel]');
    sel.hidden = !marcadas.length;
    sel.lastChild.textContent = marcadas.length + (marcadas.length === 1 ? ' seleccionada' : ' seleccionadas');
    b.querySelector('[data-guion="sacar"]').disabled = !marcadas.some(k => !g.fuera.includes(k));
    b.querySelector('[data-guion="devolver"]').disabled = !marcadas.some(k => g.fuera.includes(k));
    b.querySelector('[data-guion="sacar-todo"]').disabled = fuera === compuesto.length || !compuesto.length;
    b.querySelector('[data-guion="devolver-todo"]').disabled = !fuera;
  }
  function plegarBarra(plegada) {
    if (o.vista) { o.vista.guionAbierto = !plegada; delete o.vista.guionPlegado; if (o.guardarVista) o.guardarVista(); }
    renderBarra();
  }
  function iniciarBarra() {
    const b = o.barraGuion; if (!b) return;
    b.addEventListener('click', e => {
      const t = e.target.closest('[data-guion]'); if (!t || t.disabled || !compuesto) return;
      const g = estadoGuion(), marcadas = compuesto.filter(k => elegidas.has(k));
      volcar();
      switch (t.dataset.guion) {
        case 'sacar': accionGuion('sacar', marcadas.filter(k => !g.fuera.includes(k)), true); break;
        case 'devolver': accionGuion('devolver', marcadas.filter(k => g.fuera.includes(k)), true); break;
        case 'sacar-todo': accionGuion('sacar', compuesto.slice()); break;
        case 'devolver-todo': accionGuion('devolver', compuesto.slice()); break;
        case 'deseleccionar': elegidas.clear(); refrescarGuion(); break;
        case 'revisar': if (o.revisar) o.revisar(); break;
      }
    });
  }

  /* la sección donde está el cursor */
  function seccionDelCursor() {
    const ed = E.editor, s = marco.contentWindow.getSelection(); if (!s || !s.rangeCount) return null;
    const r = s.getRangeAt(0); let n = r.startContainer; if (!ed.contains(n)) return null;
    if (n === ed) n = ed.childNodes[Math.min(r.startOffset, ed.childNodes.length - 1)];
    while (n && n.parentNode !== ed) n = n.parentNode;
    for (; n; n = n.previousSibling) if (n.nodeType === 1 && n.classList.contains('cd-seccion')) return n.dataset.seccion;
    return null;
  }
  /* Marca la sección activa: su cabecera, la cabecera de la vista y la tira (que pasa a su trama). */
  function marcarActiva(clave) {
    const ed = E && E.editor; if (!ed) return;
    ed.querySelectorAll(':scope > .cd-seccion.activa').forEach(c => { if (c.dataset.seccion !== clave) c.classList.remove('activa'); });
    const cab = clave && ed.querySelector(selSeccion(clave)); if (cab) cab.classList.add('activa');
    if (clave === activa) return;
    activa = clave;
    const m = modelo(), p = clave && m.punto(clave);
    notaId = p ? p.id : null; posicion = notaId;
    if (p) lineaId = p.lineaId;
    if (guion()) o.notas.fijarActual(notaId);
    render();
  }
  /* Lleva la hoja a una sección (su cabecera arriba) con el cursor al principio de su texto. */
  function irASeccion(clave, op) {
    op = op || {};
    const ed = E && E.editor; if (!ed || !clave) return;
    const cab = ed.querySelector(selSeccion(clave)); if (!cab) return;
    const d = marco.contentDocument, ws = d.getElementById('workspace');
    let b = cab.nextElementSibling;
    if (b && !b.classList.contains('cd-seccion')) {
      while (b.firstElementChild && b.matches('ul, ol, blockquote, table, tbody, thead, tr')) b = b.firstElementChild;
      if (op.enfocar !== false) ed.focus({ preventScroll: true });
      try { E.setCaret(b, 0); } catch (_) {}
    }
    if (ws && op.desplazar !== false) ws.scrollTop += cab.getBoundingClientRect().top - ws.getBoundingClientRect().top - 12;
    marcarActiva(clave);
  }

  function elegirInicial() {
    const m = modelo(), act = o.notas.actual();
    if (act && compuesto && compuesto.includes(claveNota(act)) && m.punto(act)) return claveNota(act);
    return compuesto && compuesto[0] || null;
  }

  /* Abre el documento del esquema en la sección de un nodo. Sin nodo: si el documento ya estaba, se queda donde se
     dejó; si no, en la última sección activa o en la primera. Un extremo de salto no tiene sección: la tira pasa a la
     trama del otro extremo. */
  async function abrir(id) {
    await cargarEditor();
    const m = modelo();
    if (id && m.punto(id) && m.saltoDe(id) && !conNota()) return saltar(id);
    const lista = listaSecciones(), claves = lista.map(p => claveNota(p.id));
    const nuevo = !compuesto || compuesto.join('\n') !== claves.join('\n');
    if (nuevo) { volcar(); componer(lista); }
    else { actualizarCabeceras(); if (E.characters && E.characters.setGlobal && o.elenco) E.characters.setGlobal(o.elenco()); }
    aplicarCabecera();
    const p = id && m.punto(id);
    const destino = p ? claveNota(p.id) : (nuevo || !activa ? elegirInicial() : null);
    if (destino) irASeccion(destino);
    else if (!lista.length) { activa = null; notaId = null; posicion = null; lineaId = (m.lineaPrincipal() || m.datos.lineas[0] || {}).id || null; render(); }
    else { render(); if (E.focusEditor) E.focusEditor(); }
  }

  /* Renombrar el nodo de una sección (su cabecera en la hoja o el título de la cabecera de la vista); en el tablero de
     un personaje, también el gemelo del salto. */
  function renombrarSeccion(id, titulo) {
    const m = modelo(), p = m.punto(id); if (!p || !titulo) return;
    m.editarPunto(p.id, { titulo });
    const q = conNota() && m.parejaDe(p.id); if (q) m.editarPunto(q.id, { titulo });
    actualizarCabeceras();
    if (o.alCambiarTablero) o.alCambiarTablero();
    volcarSecciones();
    render();
    if (o.guardar) o.guardar();
  }

  /* Dentro del marco: el cursor dice la sección activa; pulsar una cabecera lleva a su texto, doble clic la renombra
     y, si su nombre (o el de su trama) no cabe, al pasar el ratón sale un globo con el nombre entero. */
  function iniciarSecciones(w) {
    const d = w.document;
    d.addEventListener('selectionchange', () => {
      if (!compuesto || documento || !E) return;
      const k = seccionDelCursor(); if (k && k !== activa) marcarActiva(k);
    });
    d.addEventListener('mousedown', e => {
      const cab = e.target.closest && e.target.closest('#editor > .cd-seccion');
      if (!cab || !compuesto || e.button !== 0) return;
      e.preventDefault();
      const acc = e.target.closest('[data-sec-accion]'), k = cab.dataset.seccion;
      if (acc) {                                               // casilla, sacar/devolver y plegar: no mueven el cursor
        volcar();
        if (acc.dataset.secAccion === 'elegir') alternarElegida(k);
        else if (acc.dataset.secAccion === 'plegar') accionGuion(cab.classList.contains('plegada') ? 'desplegar' : 'plegar', [k]);
        else accionGuion(acc.dataset.secAccion, [k]);
        return;
      }
      if (e.detail === 1) irASeccion(k, { desplazar: false });
    });
    d.addEventListener('dblclick', e => {
      const cab = e.target.closest && e.target.closest('#editor > .cd-seccion');
      if (!cab || !compuesto || e.target.closest('[data-sec-accion]')) return;
      e.preventDefault(); renombrarEnHoja(cab);
    });
    const globo = d.createElement('div'); globo.className = 'cd-globo'; globo.hidden = true; d.body.appendChild(globo);
    let temporizador = null, sobre = null;
    const esconder = () => { clearTimeout(temporizador); globo.hidden = true; sobre = null; };
    d.addEventListener('mouseover', e => {
      const el = e.target.closest && e.target.closest('.cd-seccion .cd-sec-nom, .cd-seccion .cd-sec-tipo');
      if (el === sobre) return;
      esconder(); if (!el) return;
      sobre = el;
      temporizador = setTimeout(() => {
        if (!el.isConnected || el.scrollWidth <= el.clientWidth + 1) return;
        globo.textContent = el.textContent; globo.hidden = false;
        const r = el.getBoundingClientRect();
        globo.style.left = Math.max(8, Math.min(r.left, w.innerWidth - globo.offsetWidth - 8)) + 'px';
        globo.style.top = (r.bottom + 6) + 'px';
      }, 350);
    });
    ['pointerdown', 'scroll', 'keydown'].forEach(t => d.addEventListener(t, esconder, true));
    /* el ancho del relleno de la hoja, para que la cabecera de sección ocupe la hoja de borde a borde */
    const wrap = d.getElementById('pageWrap');
    if (wrap && w.ResizeObserver) new w.ResizeObserver(() => {
      const v = w.getComputedStyle(E.editor).paddingLeft;
      if (wrap.style.getPropertyValue('--cd-pad') !== v) wrap.style.setProperty('--cd-pad', v);
    }).observe(E.editor);
  }
  /* Doble clic en una cabecera: un campo encima del nombre (fuera del texto editable, así no entra en el documento
     ni en Deshacer). Enter renombra el nodo; Esc o un clic fuera lo dejan como estaba (como en las demás cabeceras). */
  function renombrarEnHoja(cab) {
    const d = marco.contentDocument, wrap = d.getElementById('pageWrap'), ed = E.editor;
    const nom = cab.querySelector('.cd-sec-nom'), clave = cab.dataset.seccion, p = modelo().punto(clave);
    if (!p || !nom || !wrap || d.querySelector('.cd-sec-renombrar')) return;
    const inp = d.createElement('input');
    inp.className = 'cd-sec-renombrar'; inp.value = p.titulo || ''; inp.setAttribute('aria-label', 'Nombre de la sección');
    const pad = parseFloat(marco.contentWindow.getComputedStyle(cab).paddingRight) || 0;
    const izq = ed.offsetLeft + nom.offsetLeft - 7;
    inp.style.left = izq + 'px';
    inp.style.top = (ed.offsetTop + cab.offsetTop + cab.offsetHeight / 2 - 13) + 'px';
    inp.style.width = Math.max(140, ed.offsetLeft + cab.offsetLeft + cab.offsetWidth - pad - izq) + 'px';
    wrap.appendChild(inp);
    inp.focus(); inp.select();
    let hecho = false;
    /* con Enter o Esc el cursor vuelve a su sección; con un clic fuera, se queda donde se pulsó */
    const terminar = (aplicar, volver) => {
      if (hecho) return; hecho = true;
      const v = inp.value.trim(); inp.remove();
      if (aplicar && v && v !== p.titulo) renombrarSeccion(p.id, v);
      if (volver) irASeccion(clave, { desplazar: false });
    };
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); terminar(true, true); }
      else if (e.key === 'Escape') { e.preventDefault(); terminar(false, true); }
    });
    inp.addEventListener('blur', () => terminar(false, false));
    d.getElementById('workspace').addEventListener('scroll', () => terminar(false, false), { once: true });
  }

  /* Pulsar un cuadro o un rombo: la tira pasa a la trama del extremo gemelo y lo deja resaltado; la
     nota abierta no cambia. Pulsar el gemelo vuelve. */
  function saltar(id) {
    const m = modelo(), pareja = m.parejaDe(id);
    if (!pareja) return;
    lineaId = pareja.lineaId; posicion = pareja.id;
    render();
    const l = m.linea(lineaId);
    if (o.avisar && l) o.avisar('En ' + l.nombre);
  }

  /* Sección anterior o siguiente del documento. */
  function mover(salto) {
    if (!compuesto || !compuesto.length) return;
    const i = activa && compuesto.includes(activa) ? compuesto.indexOf(activa) + salto : (salto > 0 ? 0 : compuesto.length - 1);
    if (i < 0 || i >= compuesto.length) { if (o.avisar) o.avisar(salto < 0 ? 'Es la primera sección del documento' : 'Es la última sección del documento'); return; }
    irASeccion(compuesto[i]);
  }

  /* ---------- la cabecera de la vista (50 px, rediseño) ----------
     «CONTENEDOR [Acto] Título del nodo», «Ver esquema» y ‹ › para recorrer las notas de la trama.
     El título se escribe aquí (la barra de título del editor no se ve): pasa al #docTitle del marco y de
     ahí renombra el nodo, como antes. */
  function renderCabecera() {
    const cab = o.cabecera; if (!cab) return;
    const m = modelo(), p = notaId && m.punto(notaId), a = p && m.acto(p.actoId);
    cab.querySelector('[data-texto-cont]').textContent = o.contenedor ? o.contenedor() : '';
    /* el acto (o momento) es un segmento de la biblioteca enlazada: al pulsarlo, su vista expandida */
    const chip = cab.querySelector('[data-texto-acto]'), puede = !!(a && o.puedeVerSegmento && o.puedeVerSegmento());
    chip.firstElementChild.textContent = a ? a.nombre : ''; chip.hidden = !a;
    const T = window.Tramas, f = a && T && T.fondoEfectivo ? T.fondoEfectivo(a, m.datos.actos.indexOf(a)) : null;   // con el fondo del acto, como su tarjeta
    chip.style.setProperty('--sbg', f && f !== 'ninguno' ? `var(--f-${f})` : 'var(--papel)'); chip.style.setProperty('--sink', 'var(--tinta)');
    /* el esquema (o el personaje) en un chip con su nombre, como la biblioteca en la cabecera de una nota */
    const esq = cab.querySelector('[data-texto-esq]'), ce = o.esquemaChip ? o.esquemaChip() : null;
    esq.hidden = !ce;
    if (ce) {
      esq.firstElementChild.textContent = ce.nombre;
      esq.classList.toggle('per-chip', !!ce.chl); esq.classList.toggle('gd-chip--esquema', !ce.chl);
      if (ce.chl) { esq.style.setProperty('--chl', ce.chl); esq.style.setProperty('--chd', ce.chd); } else { esq.style.removeProperty('--chl'); esq.style.removeProperty('--chd'); }
      esq.setAttribute('aria-label', (ce.chl ? 'Personaje' : 'Esquema') + ' «' + ce.nombre + '» · ver en el esquema');
    }
    chip.disabled = !puede; chip.classList.toggle('sin-biblioteca', !puede);
    chip.setAttribute('aria-label', a ? (puede ? '«' + a.nombre + '» · pulsa para expandir el segmento' : a.nombre) : '');   // sin title: si el nombre se corta, sale el globo
    const nom = cab.querySelector('[data-texto-nom]');
    if (nom.readOnly) nom.value = p ? p.titulo : '';               // no mientras se renombra
    nom.disabled = !p;
    cab.querySelector('[data-texto-biblioteca]').hidden = !(o.tieneBiblioteca && o.tieneBiblioteca());   // solo con biblioteca enlazada
  }

  /* ---------- la tira ---------- */
  function render() {
    renderCabecera();
    if (!tira) return;
    const g = guion(), m = modelo();
    if (!g) { tira.innerHTML = ''; return; }
    if (!lineaId || !m.linea(lineaId)) lineaId = (m.lineaPrincipal() || m.datos.lineas[0] || {}).id || null;
    const l = lineaId && m.linea(lineaId);
    if (!l) { tira.innerHTML = '<span class="hilo-vacio">Este guion no tiene tramas.</span>'; return; }
    const T = window.Tramas;                               // en Personajes no hay fuera de escena
    const pres = T && T.tablero && T.tablero.simple() ? { fuera: () => false } : m.presencia();
    const tono = c => `var(--t-${c || 'azul'})`;
    const fila = lid => m.datos.lineas.findIndex(x => x.id === lid);
    const puntos = m.puntosDe(l.id).map(p => {
      const s = m.saltoDe(p.id), pareja = s && m.parejaDe(p.id), destino = pareja && m.linea(pareja.lineaId);
      const clases = ['hilo-nodo'];
      if (s) clases.push(s.tipo === 'rombo' ? 'rombo' : 'caja');
      /* hacia dónde lleva el salto: a una trama de más arriba o de más abajo en el tablero (la flecha del trazo) */
      const sube = !!(s && pareja && fila(pareja.lineaId) < fila(l.id));
      if (p.id === posicion) clases.push(s ? 'pos' : 'actual');
      if (p.cortado) clases.push('cortado');
      if (!s && !p.cortado) clases.push('con-rotulo');       // el nombre en un rótulo de papel, como en el tablero
      if (pres.fuera(p)) clases.push('fuera');
      const kn = !s || conNota() ? claveNota(p.id) : null, gs = estadoGuion();
      if (kn && gs.fuera.includes(kn)) clases.push('sin-guion');
      if (kn && elegidas.has(kn)) clases.push('elegida');
      /* el globo (al pasar el ratón) enseña la descripción del esquema; los saltos, adónde llevan */
      const pista = s
        ? `${FORMA[s.tipo] || 'Salto'}${destino ? ' → ' + destino.nombre : ''} · sin sección: pulsa para ir a esa trama`
        : p.descripcion;
      return `<button type="button" class="${clases.join(' ')}" data-${s ? 'salto' : 'nota'}="${esc(p.id)}"
        style="--c:${tono(p.color || l.color)}" data-pista="${esc(pista)}">
        <span class="hilo-tit">${!s && compuesto ? `<span class="hilo-casilla" data-hilo-elegir="${esc(claveNota(p.id))}" title="Seleccionar la sección">${elegidas.has(claveNota(p.id)) ? ICO.check : ''}</span>` : ''}<span class="hilo-tit-txt">${esc(p.titulo) || 'Sin título'}</span></span><i class="hilo-punto"></i>${s ? `<i class="hilo-trazo ${sube ? 'sube' : 'baja'}" title="${sube ? 'Sube' : 'Baja'} a ${esc(destino ? destino.nombre : 'otra trama')}"></i>` : ''}</button>`;
    }).join('');
    /* la trama: el círculo con su inicial, como en el carril del tablero */
    const n = m.puntosDe(l.id).length;
    const chip = `<div class="hilo-trama" style="--tc:${tono(l.color)}" title="${esc(l.nombre)} · ${ETIQUETA[l.tipo] || l.tipo} · ${n} ${n === 1 ? 'nodo' : 'nodos'}">
        <span class="chip ${l.tipo}" data-inicial="${esc((l.nombre || '?').trim().charAt(0).toUpperCase())}" style="background:${tono(l.color)};color:${tono(l.color)}"></span></div>`;
    const vacio = puntos ? '' : '<span class="hilo-vacio">Esta trama aún no tiene nodos: créalos en el esquema de pasos.</span>';
    tira.innerHTML = `${chip}<div class="hilo-pista${l.tipo === 'alterna' ? ' alterna' : ''}${l.cortada ? ' cortada' : ''}" style="--c:${tono(l.color)}">${puntos}${vacio}</div>`;
    colocarRotulos();
    /* Centrar el nodo resaltado desplazando solo la tira (scrollIntoView movería también la página). */
    const act = tira.querySelector('.hilo-nodo.actual, .hilo-nodo.pos');
    if (act) tira.scrollLeft = act.offsetLeft + act.offsetWidth / 2 - tira.clientWidth / 2;
  }

  /* Como en el tablero: el rótulo va encima del punto y, si choca con el anterior, baja al otro lado del eje
     (`.rotulo-abajo`; `.abajo` ya dice hacia dónde va el trazo de un salto). Los títulos sueltos de cuadros, rombos y
     descartados se quedan arriba y cuentan como obstáculo. */
  function colocarRotulos() {
    const nodos = Array.from(tira.querySelectorAll('.hilo-nodo')); if (!nodos.length) return;
    let finArriba = -Infinity, finAbajo = -Infinity;
    nodos.forEach(n => {
      n.classList.remove('rotulo-abajo');
      const t = n.querySelector('.hilo-tit'), w = t ? t.offsetWidth : 0; if (!w) return;
      const x = n.offsetLeft + n.offsetWidth / 2, izq = x - w / 2, der = x + w / 2;
      if (!n.classList.contains('con-rotulo') || izq >= finArriba + 6) finArriba = Math.max(finArriba, der);
      else if (izq >= finAbajo + 6) { n.classList.add('rotulo-abajo'); finAbajo = der; }
      else finArriba = Math.max(finArriba, der);
    });
  }

  /* ---------- sobre la hoja van la tira y la cinta del editor, las dos ----------
     Con una nota del gestor de documentos no hay tira ni cabecera: mandan las migas. */
  function aplicarCabecera() {
    const sinTira = !!documento || !!(o.sinTira && o.sinTira());   // ni con una nota de biblioteca ni en el tablero de un personaje
    if (o.seccion) { o.seccion.classList.toggle('sin-tira', sinTira); o.seccion.classList.toggle('documento', !!documento); }
    renderBarra();
  }
  /* El editor dentro de ClapCraft: `html.clapcraft` activa su disposición del rediseño (cinta de una
     fila y barra inferior siempre a la vista, sin barra de título; css/clapcraft-editor.css). Desde fuera
     se cambian los glifos de deshacer/rehacer por iconos y se añade a la barra inferior el botón que
     pliega el menú lateral. El editor no cambia. */
  const SVG = d => `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  function adaptarMarco(w) {
    const d = w.document;
    d.documentElement.classList.add('clapcraft');
    const undo = d.querySelector('.ribbon [data-cmd="undo"]'), redo = d.querySelector('.ribbon [data-cmd="redo"]');
    if (undo) undo.innerHTML = SVG('<path d="M3.2 6.6h6.4a3.4 3.4 0 0 1 0 6.8H6.4"/><path d="M6.3 3.4 3.1 6.6l3.2 3.2"/>');
    if (redo) redo.innerHTML = SVG('<path d="M12.8 6.6H6.4a3.4 3.4 0 0 0 0 6.8h3.2"/><path d="M9.7 3.4l3.2 3.2-3.2 3.2"/>');
    /* el deslizador del ancho de la hoja, con la parte recorrida en acento */
    const ancho = d.getElementById('fbWidth');
    if (ancho) {
      const relleno = () => ancho.style.setProperty('--pct', ((ancho.value - ancho.min) / (ancho.max - ancho.min) * 100) + '%');
      ancho.addEventListener('input', relleno); relleno(); setTimeout(relleno, 300);
    }
    const barra = d.getElementById('focusBar');
    /* «Exportar» (rediseño 11), junto a los modos: el menú se abre en la página, sobre el botón */
    const modo = d.getElementById('fbScript');
    if (barra && modo && !d.getElementById('cdExportar')) {
      const x = d.createElement('div');
      x.className = 'fb-item cd-exportar';
      x.innerHTML = `<button type="button" id="cdExportar" title="Exportar a PDF, Word o texto">${SVG('<path d="M8 10.2V2.9"/><path d="M5.3 5.6 8 2.9l2.7 2.7"/><path d="M2.9 9.6v2.3c0 .7.5 1.2 1.2 1.2h7.8c.7 0 1.2-.5 1.2-1.2V9.6"/>')}Exportar</button>`;
      /* el menú vive en la página: un clic dentro del marco no le llega, así que aquí se cierra (y el mismo botón lo cierra) */
      let reabrir = true;
      d.addEventListener('mousedown', e => {
        const abierto = C.gestor.hayPop && C.gestor.hayPop();
        reabrir = !(abierto && e.target.closest && e.target.closest('#cdExportar'));
        if (abierto) C.gestor.cerrarPop();
      }, true);
      d.addEventListener('keydown', e => { if (e.key === 'Escape' && C.gestor.hayPop && C.gestor.hayPop()) { e.preventDefault(); e.stopPropagation(); C.gestor.cerrarPop(); } }, true);
      x.querySelector('button').addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        if (!reabrir) { reabrir = true; return; }
        const r = e.currentTarget.getBoundingClientRect(), m = marco.getBoundingClientRect();
        if (o.exportar) o.exportar({ left: m.left + r.left, top: m.top + r.top, right: m.left + r.right, bottom: m.top + r.bottom, width: r.width, height: r.height });
      });
      modo.parentElement.before(x);
    }
    if (barra && !d.getElementById('cdLado')) {
      const b = d.createElement('div');
      b.className = 'fb-item row cd-lado';
      b.innerHTML = `<button type="button" id="cdLado" title="Plegar o desplegar el menú (Ctrl+Shift+B)" aria-label="Plegar o desplegar el menú">${SVG('<rect x="2.2" y="3.2" width="11.6" height="9.6" rx="1.4"/><path d="M6.2 3.2v9.6"/>')}</button>`;
      b.querySelector('button').addEventListener('click', e => { e.preventDefault(); if (o.alternarLado) o.alternarLado(); });
      barra.appendChild(b);
    }
  }

  /* ---------- arranque ---------- */
  function iniciar(opciones) {
    o = opciones || {};
    marco = o.marco; tira = o.tira;
    tira.addEventListener('click', e => {
      const cas = e.target.closest('[data-hilo-elegir]');
      if (cas) { e.stopPropagation(); alternarElegida(cas.dataset.hiloElegir); return; }
      const n = e.target.closest('[data-nota]');
      if (n) { abrir(n.dataset.nota); return; }
      const s = e.target.closest('[data-salto]');
      if (s) saltar(s.dataset.salto);
    });
    /* Globo bajo el nodo, con el mismo #tip del tablero: título y descripción del esquema. */
    const tip = o.tip;
    if (tip) {
      tira.addEventListener('mouseover', e => {
        const n = e.target.closest('.hilo-nodo'); if (!n) return;
        const titulo = (n.querySelector('.hilo-tit-txt') || n.querySelector('.hilo-tit')).textContent, texto = n.dataset.pista;
        tip.innerHTML = '';
        const h = document.createElement('div'); h.className = 'tip-t'; h.textContent = titulo; tip.appendChild(h);
        const b = document.createElement('div'); b.textContent = texto || 'Sin descripción en el esquema';
        if (!texto) b.style.opacity = '.6';
        tip.appendChild(b);
        tip.style.background = ''; tip.style.color = '';
        tip.classList.add('show');
        const r = n.getBoundingClientRect(), w = tip.offsetWidth;
        tip.style.left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8)) + 'px';
        tip.style.top = (r.bottom + 6) + 'px';
      });
      tira.addEventListener('mouseout', e => {
        const n = e.target.closest('.hilo-nodo');
        if (n && !(e.relatedTarget && n.contains(e.relatedTarget))) tip.classList.remove('show');
      });
      tira.addEventListener('click', () => tip.classList.remove('show'));
    }
    /* la cabecera: título del nodo, ver en el esquema y ‹ › */
    const cab = o.cabecera;
    if (cab) {
      cab.addEventListener('click', e => {
        const mv = e.target.closest('[data-texto-mover]'); if (mv) { mover(+mv.dataset.textoMover); return; }
        if (e.target.closest('[data-texto-esquema], [data-texto-esq]') && o.volver) o.volver();
        if (e.target.closest('[data-texto-biblioteca]') && o.verBiblioteca) o.verBiblioteca();
        if (e.target.closest('[data-texto-guion]')) plegarBarra(!!(o.vista && o.vista.guionAbierto));
        const m = modelo(), p = notaId && m.punto(notaId);
        if (e.target.closest('[data-texto-acto]') && p && o.verSegmento) { volcar(); o.verSegmento(p.actoId, claveNota(p.id)); }
      });
    }
    iniciarTitulos();
    iniciarBarra();
    aplicarCabecera();
  }

  /* ---------- el título en las cabeceras (documento de un nodo y nota de biblioteca) ----------
     Leo, 15-09-2026: no se edita con un clic, solo con doble clic; Enter lo aplica, Esc o un clic fuera lo dejan como
     estaba. Mientras no se edita va de solo lectura y, si el nombre no cabe (se corta con «…»; las etiquetas de su
     izquierda no encogen), al pasar el ratón un globo lo enseña entero, igual que en las etiquetas cortadas. */
  function iniciarTitulos() {
    const esTitulo = t => t && t.matches && t.matches('input.texto-nom');
    document.querySelectorAll('input.texto-nom').forEach(i => { i.readOnly = true; });
    const terminar = (inp, aplicar) => {
      if (inp.readOnly) return;
      const antes = inp.dataset.antes || '', valor = inp.value.trim();
      inp.readOnly = true; delete inp.dataset.antes;
      if (aplicar && valor && valor !== antes) {
        if (inp.matches('[data-texto-nom]')) { if (compuesto && notaId) renombrarSeccion(notaId, valor); else fijarTitulo(valor); }   // renombra el nodo de la sección
        else document.dispatchEvent(new CustomEvent('clapcraft:titulo', { detail: { valor } }));   // la nota: la escucha el gestor
      } else inp.value = antes;
      /* sin selección al salir: con texto marcado y Esc, el azul se quedaba hasta pulsar en otro sitio (Leo) */
      try { inp.setSelectionRange(0, 0); } catch (_) {}
      const sel = window.getSelection(); if (sel) sel.removeAllRanges();
      inp.scrollLeft = 0;
      if (document.activeElement === inp) inp.blur();
      if (aplicar && E && E.focusEditor) E.focusEditor();
    };
    document.addEventListener('dblclick', e => {
      const inp = e.target; if (!esTitulo(inp) || inp.disabled || !inp.readOnly) return;
      e.preventDefault(); esconderGlobo();
      inp.dataset.antes = inp.value; inp.readOnly = false; inp.focus(); inp.select();
    }, true);
    /* en captura sobre la ventana: Esc y Enter no llegan al tablero ni al gestor */
    window.addEventListener('keydown', e => {
      const inp = e.target; if (!esTitulo(inp) || inp.readOnly) return;
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); terminar(inp, e.key === 'Enter'); }
      else e.stopPropagation();
    }, true);
    document.addEventListener('focusout', e => { if (esTitulo(e.target) && !e.target.readOnly) terminar(e.target, false); }, true);
    /* sin editar no hay cursor de texto ni selección con un clic */
    document.addEventListener('mousedown', e => { if (esTitulo(e.target) && e.target.readOnly && e.detail < 2) e.preventDefault(); }, true);
    /* el globo con el nombre entero, si está cortado */
    const globo = document.createElement('div'); globo.className = 'gd-globo'; globo.hidden = true; document.body.appendChild(globo);
    let temporizador = null, sobre = null;
    function esconderGlobo() { clearTimeout(temporizador); globo.hidden = true; sobre = null; }
    const cortado = el => el.matches('input') ? el.scrollWidth > el.clientWidth + 1 : (() => { const t = el.querySelector(':scope > span') || el; return t.scrollWidth > t.clientWidth + 1; })();
    document.addEventListener('mouseover', e => {
      const el = e.target.closest && e.target.closest('input.texto-nom, .esq-titulo .gd-chip-nom, .migas .gd-chip-nom');
      if (el === sobre) return;
      esconderGlobo(); if (!el || (el.matches('input') && !el.readOnly)) return;
      sobre = el;
      temporizador = setTimeout(() => {
        if (!el.isConnected || !cortado(el)) return;
        globo.textContent = el.matches('input') ? el.value : (el.querySelector(':scope > span') || el).textContent;
        globo.hidden = false;
        const r = el.getBoundingClientRect();
        globo.style.left = Math.max(8, Math.min(r.left, innerWidth - globo.offsetWidth - 8)) + 'px';
        globo.style.top = (r.bottom + 6) + 'px';
      }, 350);
    });
    ['pointerdown', 'scroll'].forEach(t => document.addEventListener(t, esconderGlobo, true));
  }

  /* el título del documento abierto, escrito desde fuera (la cabecera de una nota de biblioteca) */
  function fijarTitulo(valor) {
    const t = marco && marco.contentDocument && marco.contentDocument.getElementById('docTitle'); if (!t) return;
    t.value = valor; t.dispatchEvent(new Event('input', { bubbles: true }));
  }
  C.texto = { iniciar, abrir, saltar, volcar, render, mover, tema, precargar: cargarEditor, fijarTitulo, enfocar: () => { if (E && E.focusEditor) E.focusEditor(); },
    refrescarGuion, elegidas: () => [...elegidas], alternarElegida, marcarElegidas: lista => { elegidas.clear(); (lista || []).forEach(k => elegidas.add(k)); refrescarGuion(); },
    editor: () => E, secciones: () => (compuesto || []).slice(),
    abrirDocumento, cerrarDocumento, enDocumento: () => !!documento,
    actual: () => notaId, linea: () => lineaId, posicion: () => posicion,
    cerrar: () => { volcar(); notaId = null; posicion = null; lineaId = null; soltarSecciones(); elegidas.clear(); renderBarra(); } };
})(window.Claquedraw);
