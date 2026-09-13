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
   las notas viven en el guion (`biblioteca.guardarNota`), nunca en el marco. */
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

        /* Las flechas ‹ › de la barra de título del editor recorren las notas de la trama. */
        const navs = w.document.querySelectorAll('.titlebar .nav');
        if (navs[0]) { navs[0].disabled = false; navs[0].title = 'Nota anterior (Ctrl+Alt+↑)'; navs[0].onclick = () => mover(-1); }
        if (navs[1]) { navs[1].disabled = false; navs[1].title = 'Nota siguiente (Ctrl+Alt+↓)'; navs[1].onclick = () => mover(1); }
        w.document.addEventListener('keydown', onKey, true);
        montarBotonCinta(w);
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
    if (cmd && e.shiftKey && k === 'k') { e.preventDefault(); e.stopPropagation(); alternarCabecera(); return; }
    if (cmd && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); e.stopPropagation(); mover(e.key === 'ArrowUp' ? -1 : 1); }
  }

  function tema(oscuro) {
    if (!marco || !marco.contentDocument) return;
    marco.contentDocument.documentElement.dataset.theme = oscuro ? 'dark' : 'light';
  }

  /* ---------- notas ---------- */
  /* Escribe lo que hay en el editor en la nota del nodo abierto. */
  function volcar() {
    const g = guion();
    if (!E || !notaId || !g) return;
    const r = o.biblioteca.guardarNota(g.id, notaId, E.document.get());
    if (r.ok && r.cambio && o.guardar) o.guardar();
  }

  function alCambiarEditor(doc) {
    const g = guion(), m = modelo();
    if (!notaId || !g) return;
    o.biblioteca.guardarNota(g.id, notaId, doc);
    const p = m.punto(notaId), titulo = String(doc.title || '').trim();
    if (p && titulo && titulo !== p.titulo) {              // el título de la nota es el del nodo
      m.editarPunto(p.id, { titulo });
      if (o.alCambiarTablero) o.alCambiarTablero();
      render();
    }
    if (o.guardar) o.guardar();
  }

  /* Nodos con nota de una trama, de izquierda a derecha (los extremos de salto no cuentan). */
  const notasDe = lid => modelo().puntosDe(lid).filter(p => !modelo().saltoDe(p.id)).map(p => p.id);

  function elegirInicial() {
    const g = guion(), m = modelo();
    if (g && g.notaActual && m.punto(g.notaActual) && !m.saltoDe(g.notaActual)) return g.notaActual;
    const pr = m.lineaPrincipal();
    return (pr && notasDe(pr.id)[0]) || m.datos.lineas.map(l => notasDe(l.id)[0]).find(Boolean) || null;
  }

  /* Abre la nota de un nodo (o la última abierta, o la primera de la principal). Un extremo de salto
     no tiene nota: la tira pasa a la trama del otro extremo. */
  async function abrir(id) {
    await cargarEditor();
    const m = modelo();
    if (id && m.punto(id) && m.saltoDe(id)) return saltar(id);
    volcar();
    const g = guion();
    let p = id && m.punto(id) ? m.punto(id) : null;
    if (!p) { const ini = elegirInicial(); p = ini ? m.punto(ini) : null; }
    notaId = p ? p.id : null;
    posicion = notaId;
    lineaId = p ? p.lineaId : (m.lineaPrincipal() || {}).id || null;
    if (g) o.biblioteca.fijarNotaActual(g.id, notaId);
    const nota = (g && p && g.notas[p.id]) || {};
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
      if (!m.saltoDe(todos[i])) return abrir(todos[i]);
    }
    if (o.avisar) o.avisar(salto < 0 ? 'Es la primera nota de la trama' : 'Es la última nota de la trama');
  }

  /* ---------- la tira ---------- */
  function render() {
    if (!tira) return;
    const g = guion(), m = modelo();
    if (!g) { tira.innerHTML = ''; return; }
    if (!lineaId || !m.linea(lineaId)) lineaId = (m.lineaPrincipal() || m.datos.lineas[0] || {}).id || null;
    const l = lineaId && m.linea(lineaId);
    if (!l) { tira.innerHTML = '<span class="hilo-vacio">Este guion no tiene tramas.</span>'; return; }
    const pres = m.presencia();
    const tono = c => `var(--t-${c || 'azul'})`;
    const fila = lid => m.datos.lineas.findIndex(x => x.id === lid);
    const puntos = m.puntosDe(l.id).map(p => {
      const s = m.saltoDe(p.id), pareja = s && m.parejaDe(p.id), destino = pareja && m.linea(pareja.lineaId);
      const clases = ['hilo-nodo'];
      if (s) clases.push(s.tipo === 'rombo' ? 'rombo' : 'caja');
      /* el trazo del salto apunta hacia donde está la otra trama en el tablero (arriba o abajo) */
      if (s && pareja) clases.push(fila(pareja.lineaId) < fila(l.id) ? 'arriba' : 'abajo');
      if (p.id === posicion) clases.push(s ? 'pos' : 'actual');
      if (p.cortado) clases.push('cortado');
      if (pres.fuera(p)) clases.push('fuera');
      /* el globo (al pasar el ratón) enseña la descripción del esquema; los saltos, adónde llevan */
      const pista = s
        ? `${FORMA[s.tipo] || 'Salto'}${destino ? ' → ' + destino.nombre : ''} · sin nota: pulsa para ir a esa trama`
        : p.descripcion;
      return `<button type="button" class="${clases.join(' ')}" data-${s ? 'salto' : 'nota'}="${esc(p.id)}"
        style="--c:${tono(p.color || l.color)}" data-pista="${esc(pista)}">
        <span class="hilo-tit">${esc(p.titulo) || 'Sin título'}</span><i class="hilo-punto"></i></button>`;
    }).join('');
    const chip = `<div class="hilo-trama" title="Trama que enseña la tira">
        <span class="chip${l.tipo === 'principal' ? ' principal' : ''}${l.tipo === 'alterna' ? ' alterna' : ''}" style="background:${tono(l.color)};color:${tono(l.color)}"></span>
        <span class="lbox"><span class="hilo-nombre">${esc(l.nombre)}</span><span class="ltipo">${ETIQUETA[l.tipo] || l.tipo}</span></span></div>`;
    const vacio = puntos ? '' : '<span class="hilo-vacio">Esta trama aún no tiene nodos: créalos en el esquema de pasos.</span>';
    tira.innerHTML = `${chip}<div class="hilo-pista${l.tipo === 'alterna' ? ' alterna' : ''}${l.cortada ? ' cortada' : ''}" style="--c:${tono(l.color)}">${puntos}${vacio}</div>${botonPin()}`;
    /* Centrar el nodo resaltado desplazando solo la tira: scrollIntoView movería también la página
       cuando la tira está escondida (desfijada). */
    const act = tira.querySelector('.hilo-nodo.actual, .hilo-nodo.pos');
    if (act) tira.scrollLeft = act.offsetLeft + act.offsetWidth / 2 - tira.clientWidth / 2;
  }

  /* ---------- cabecera: la línea de tiempo o la cinta del editor, una de las dos ----------
     Ocupan el mismo sitio sobre la hoja. `vista.cabecera` vale 'tira' o 'cinta'; con la tira a la
     vista se esconde la cinta del editor (clase en el <html> del marco, con una regla inyectada), y
     con la cinta a la vista se esconde la tira. En cada una hay un botón para pasar a la otra. */
  const ICONO_TIRA = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M1.5 8h13"/><circle cx="4" cy="8" r="1.8" fill="currentColor"/><circle cx="12" cy="8" r="1.8" fill="currentColor"/><path d="M8 3.5v9"/></svg>';
  const ICONO_CINTA = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5"/><path d="M4 6.5h2M8 6.5h4M4 9.5h8"/></svg>';
  const conTira = () => !o.vista || o.vista.cabecera !== 'cinta';
  function botonPin() {
    return `<button type="button" class="hilo-pin" data-cabecera="cinta" title="Ver la cinta del editor en lugar de la línea de tiempo (Ctrl+Shift+K)">${ICONO_CINTA}</button>`;
  }
  function aplicarCabecera() {
    if (o.seccion) o.seccion.classList.toggle('sin-tira', !conTira());
    if (marco && marco.contentDocument) {
      marco.contentDocument.documentElement.classList.toggle('sin-cinta', conTira());
      const b = marco.contentDocument.getElementById('cdTira');
      if (b) b.classList.toggle('active', conTira());
    }
  }
  function alternarCabecera() {
    if (o.vista) { o.vista.cabecera = conTira() ? 'cinta' : 'tira'; if (o.guardarVista) o.guardarVista(); }
    aplicarCabecera();
    if (o.avisar) o.avisar(conTira() ? 'Línea de tiempo' : 'Cinta del editor');
  }
  /* En la cinta del editor, junto a su pin, un botón para volver a la línea de tiempo (se añade al
     DOM del marco desde fuera; el editor no cambia). */
  function montarBotonCinta(w) {
    const d = w.document, pin = d.getElementById('btnPin');
    if (!pin || d.getElementById('cdTira')) return;
    const estilo = d.createElement('style');
    estilo.textContent = 'html.sin-cinta .topbar .ribbon { display: none !important; }';
    d.head.appendChild(estilo);
    const b = d.createElement('button');
    b.type = 'button'; b.id = 'cdTira'; b.title = 'Línea de tiempo en lugar de la cinta (Ctrl+Shift+K)';
    b.innerHTML = ICONO_TIRA;
    b.addEventListener('click', e => { e.preventDefault(); alternarCabecera(); });
    pin.parentNode.insertBefore(b, pin);
  }

  /* ---------- arranque ---------- */
  function iniciar(opciones) {
    o = opciones || {};
    marco = o.marco; tira = o.tira;
    tira.addEventListener('click', e => {
      if (e.target.closest('[data-cabecera]')) { alternarCabecera(); return; }
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
    aplicarCabecera();
  }

  C.texto = { iniciar, abrir, saltar, volcar, render, mover, tema, alternarCabecera,
    actual: () => notaId, linea: () => lineaId, posicion: () => posicion,
    cerrar: () => { volcar(); notaId = null; posicion = null; lineaId = null; } };
})(window.Claquedraw);
