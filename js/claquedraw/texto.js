/* Claquedraw · texto
   La vista de escritura: el editor (index.html) dentro de un <iframe> y, encima de su cinta, la tira
   de la trama. La tira enseña una trama a la vez, con sus nodos dibujados igual que en el esquema:
   cada nodo es una nota del editor; los extremos de un salto (cuadro o rombo) llevan su título pero no
   tienen nota: al pulsarlos la tira pasa a la trama del otro extremo, donde el extremo gemelo permite
   volver.

   El editor no se modifica: se habla con él por `Ed.document` (get/set/onChange) a través de la
   ventana del marco. Su autoguardado escribe en `guiones.editor.doc`, la misma clave que usa
   index.html abierto a solas; para no pisar ese documento, al cargar el marco se redirige esa clave
   (parche en `Storage.prototype` del marco, antes de que el editor guarde nada).

   Reglas: el título de la nota es el título del nodo (cambiarlo en el editor renombra el nodo);
   las notas viven en el guion (proyecto: `biblioteca.notas`; esquema de un contenedor: su `esquema.notas`)
   y llegan por el acceso `o.notas` (leer/guardar/actual/fijarActual) que decide app.js; nunca en el marco. */
(function (C) {
  const CLAVE_EDITOR = 'guiones.editor.doc', CLAVE_PROPIA = 'guiones.claquedraw.editor.doc';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ETIQUETA = { principal: 'Principal', secundaria: 'Secundaria', alterna: 'Alternativa' };
  const FORMA = { cuadro: 'Cambio de escena', rombo: 'Salto alternativo' };

  let marco, tira, E = null, cargando = null;
  let o = {};                                    // opciones de iniciar()
  let notaId = null;                             // nodo cuya nota está en el editor
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
    if (!notaId || !guion()) return;
    const r = o.notas.guardar(claveNota(notaId), E.document.get());
    if (r.ok && r.cambio && o.guardar) o.guardar();
  }

  /* ---------- una nota del gestor de documentos en el editor ----------
     Sin tira: encima van las migas (#migas, las pinta el gestor) y la cinta del editor. */
  async function abrirDocumento(doc, ganchos) {
    await cargarEditor();
    volcar();
    notaId = null; posicion = null;
    documento = ganchos;
    if (E.characters && E.characters.setGlobal && o.elenco) E.characters.setGlobal(o.elenco());   // los personajes de todo el guion
    E.document.set({ title: doc.titulo || '', html: doc.html || '', characters: doc.characters || {} });
    aplicarCabecera();
    if (E.focusEditor) E.focusEditor();
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
    const g = guion(), m = modelo();
    if (!notaId || !g) return;
    o.notas.guardar(claveNota(notaId), doc);
    const p = m.punto(notaId), titulo = String(doc.title || '').trim();
    if (p && titulo && titulo !== p.titulo) {              // el título de la nota es el del nodo
      m.editarPunto(p.id, { titulo });
      const q = conNota() && m.parejaDe(p.id); if (q) m.editarPunto(q.id, { titulo });   // y el de su gemelo, si la comparten
      if (o.alCambiarTablero) o.alCambiarTablero();
      render();
    }
    if (o.guardar) o.guardar();
  }

  /* Nodos con nota de una trama, de izquierda a derecha (los extremos de salto no cuentan). */
  const notasDe = lid => modelo().puntosDe(lid).filter(p => conNota() || !modelo().saltoDe(p.id)).map(p => p.id);

  function elegirInicial() {
    const m = modelo(), act = o.notas.actual();
    if (act && m.punto(act) && (conNota() || !m.saltoDe(act))) return act;
    const pr = m.lineaPrincipal();
    return (pr && notasDe(pr.id)[0]) || m.datos.lineas.map(l => notasDe(l.id)[0]).find(Boolean) || null;
  }

  /* Abre la nota de un nodo (o la última abierta, o la primera de la principal). Un extremo de salto
     no tiene nota: la tira pasa a la trama del otro extremo. */
  async function abrir(id) {
    await cargarEditor();
    const m = modelo();
    if (id && m.punto(id) && m.saltoDe(id) && !conNota()) return saltar(id);
    volcar();
    const g = guion();
    let p = id && m.punto(id) ? m.punto(id) : null;
    if (!p) { const ini = elegirInicial(); p = ini ? m.punto(ini) : null; }
    notaId = p ? p.id : null;
    posicion = notaId;
    lineaId = p ? p.lineaId : (m.lineaPrincipal() || {}).id || null;
    if (g) o.notas.fijarActual(notaId);
    const nota = (p && o.notas.leer(claveNota(p.id))) || {};
    aplicarCabecera();
    if (E.characters && E.characters.setGlobal && o.elenco) E.characters.setGlobal(o.elenco());   // los personajes de todo el guion
    E.document.set({ title: p ? p.titulo : '', html: nota.html || '', characters: nota.characters || {} });
    render();
    if (p && E.focusEditor) E.focusEditor();
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

  /* Nota anterior o siguiente dentro de la trama de la tira, a partir de la posición resaltada. */
  function mover(salto) {
    const m = modelo(); if (!lineaId) return;
    const todos = m.puntosDe(lineaId).map(p => p.id);
    let i = todos.indexOf(posicion);
    for (i += salto; i >= 0 && i < todos.length; i += salto) {
      if (conNota() || !m.saltoDe(todos[i])) return abrir(todos[i]);
    }
    if (o.avisar) o.avisar(salto < 0 ? 'Es la primera nota de la trama' : 'Es la última nota de la trama');
  }

  /* ---------- la cabecera de la vista (50 px, rediseño) ----------
     «CONTENEDOR [Acto] Título del nodo», «Ver en el esquema» y ‹ › para recorrer las notas de la trama.
     El título se escribe aquí (la barra de título del editor no se ve): pasa al #docTitle del marco y de
     ahí renombra el nodo, como antes. */
  function renderCabecera() {
    const cab = o.cabecera; if (!cab) return;
    const m = modelo(), p = notaId && m.punto(notaId), a = p && m.acto(p.actoId);
    cab.querySelector('[data-texto-cont]').textContent = o.contenedor ? o.contenedor() : '';
    const chip = cab.querySelector('[data-texto-acto]'); chip.textContent = a ? a.nombre : ''; chip.hidden = !a;
    const nom = cab.querySelector('[data-texto-nom]');
    if (document.activeElement !== nom) nom.value = p ? p.titulo : '';
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
      if (pres.fuera(p)) clases.push('fuera');
      /* el globo (al pasar el ratón) enseña la descripción del esquema; los saltos, adónde llevan */
      const pista = s
        ? `${FORMA[s.tipo] || 'Salto'}${destino ? ' → ' + destino.nombre : ''} · sin nota: pulsa para ir a esa trama`
        : p.descripcion;
      return `<button type="button" class="${clases.join(' ')}" data-${s ? 'salto' : 'nota'}="${esc(p.id)}"
        style="--c:${tono(p.color || l.color)}" data-pista="${esc(pista)}">
        <span class="hilo-tit">${esc(p.titulo) || 'Sin título'}</span><i class="hilo-punto"></i>${s ? `<i class="hilo-trazo ${sube ? 'sube' : 'baja'}" title="${sube ? 'Sube' : 'Baja'} a ${esc(destino ? destino.nombre : 'otra trama')}"></i>` : ''}</button>`;
    }).join('');
    /* la trama: el círculo con su inicial, como en el carril del tablero */
    const n = m.puntosDe(l.id).length;
    const chip = `<div class="hilo-trama" style="--tc:${tono(l.color)}" title="${esc(l.nombre)} · ${ETIQUETA[l.tipo] || l.tipo} · ${n} ${n === 1 ? 'nodo' : 'nodos'}">
        <span class="chip ${l.tipo}" data-inicial="${esc((l.nombre || '?').trim().charAt(0).toUpperCase())}" style="background:${tono(l.color)};color:${tono(l.color)}"></span></div>`;
    const vacio = puntos ? '' : '<span class="hilo-vacio">Esta trama aún no tiene nodos: créalos en el esquema de pasos.</span>';
    tira.innerHTML = `${chip}<div class="hilo-pista${l.tipo === 'alterna' ? ' alterna' : ''}${l.cortada ? ' cortada' : ''}" style="--c:${tono(l.color)}">${puntos}${vacio}</div>`;
    /* Centrar el nodo resaltado desplazando solo la tira (scrollIntoView movería también la página). */
    const act = tira.querySelector('.hilo-nodo.actual, .hilo-nodo.pos');
    if (act) tira.scrollLeft = act.offsetLeft + act.offsetWidth / 2 - tira.clientWidth / 2;
  }

  /* ---------- sobre la hoja van la tira y la cinta del editor, las dos ----------
     Con una nota del gestor de documentos no hay tira ni cabecera: mandan las migas. */
  function aplicarCabecera() {
    const sinTira = !!documento || !!(o.sinTira && o.sinTira());   // ni con una nota de biblioteca ni en el tablero de un personaje
    if (o.seccion) { o.seccion.classList.toggle('sin-tira', sinTira); o.seccion.classList.toggle('documento', !!documento); }
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
        const titulo = n.querySelector('.hilo-tit').textContent, texto = n.dataset.pista;
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
        if (e.target.closest('[data-texto-esquema]') && o.volver) o.volver();
        if (e.target.closest('[data-texto-biblioteca]') && o.verBiblioteca) o.verBiblioteca();
      });
      const nom = cab.querySelector('[data-texto-nom]');
      nom.addEventListener('input', () => {
        const t = marco && marco.contentDocument && marco.contentDocument.getElementById('docTitle'); if (!t) return;
        t.value = nom.value; t.dispatchEvent(new Event('input', { bubbles: true }));   // el editor lo guarda y de ahí se renombra el nodo
      });
      nom.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nom.blur(); if (E && E.focusEditor) E.focusEditor(); } });
      nom.addEventListener('blur', renderCabecera);
    }
    aplicarCabecera();
  }

  C.texto = { iniciar, abrir, saltar, volcar, render, mover, tema, precargar: cargarEditor,
    abrirDocumento, cerrarDocumento, enDocumento: () => !!documento,
    actual: () => notaId, linea: () => lineaId, posicion: () => posicion,
    cerrar: () => { volcar(); notaId = null; posicion = null; lineaId = null; } };
})(window.Claquedraw);
