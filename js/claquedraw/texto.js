/* Claquedraw · texto
   La vista de escritura: el editor (index.html) dentro de un <iframe> y, encima de su cinta, la tira de la trama,
   que enseña una trama a la vez con sus nodos dibujados igual que en el esquema.
   **El editor es un editor normal** (Leo, 16-09-2026: las secciones por nodo y el armado de guión «resultaron
   extremadamente molestos»): lo que se abre es **un documento**, una nota de la biblioteca de guiones del esquema
   (`documentoEsquema` en documentos.js, más los que se creen ahí), y se guarda entera como cualquier otra nota. La
   tira se queda **solo de referencia**: sus nodos ya no llevan a ningún sitio (un cuadro o un rombo sigue pasando la
   tira a la trama del otro extremo, que es mirar, no navegar).

   Se habla con el editor por `Ed.document` (get/set/onChange) a través de la ventana del marco. Su autoguardado
   escribe en `guiones.editor.doc`, la misma clave que usa index.html abierto a solas; para no pisar ese documento, al
   cargar el marco se redirige esa clave (parche en `Storage.prototype` del marco, antes de que el editor guarde nada).

   Reglas: el título de la cabecera es el del documento (renombrarlo renombra la nota); las notas viven en el guion y
   llegan por los ganchos que pasa app.js (`abrirDocumento(doc, ganchos, { tira })`), nunca en el marco. */
(function (C) {
  const CLAVE_EDITOR = 'guiones.editor.doc', CLAVE_PROPIA = 'guiones.claquedraw.editor.doc';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ETIQUETA = { principal: 'Principal', secundaria: 'Secundaria', alterna: 'Alternativa' };
  const FORMA = { cuadro: 'Cambio de escena', rombo: 'Salto alternativo' };

  let marco, tira, E = null, cargando = null;
  let o = {};                                    // opciones de iniciar()
  let lineaId = null;                            // trama que enseña la tira
  let posicion = null;                           // nodo resaltado en la tira (el extremo al que se saltó)
  let documento = null;                          // { guardar(doc), alCambiar(), titulo } del documento abierto
  let conTira = false;                           // el documento es de un esquema: encima va su tira, de referencia

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
  }

  function tema(oscuro) {
    if (!marco || !marco.contentDocument) return;
    marco.contentDocument.documentElement.dataset.theme = oscuro ? 'dark' : 'light';
  }

  /* ---------- el documento abierto ---------- */
  /* Escribe en su nota lo que hay en el editor. */
  function volcar() {
    if (!E || !documento) return;
    documento.guardar(E.document.get());
  }

  /* Abre un documento en el editor. `op.tira`: es el de un esquema, así que encima va su tira (de referencia) y la
     cabecera de la vista Texto; sin ella (una nota de biblioteca) mandan las migas del gestor. */
  async function abrirDocumento(doc, ganchos, op) {
    await cargarEditor();
    volcar();
    posicion = null;
    documento = ganchos;
    conTira = !!(op && op.tira);
    if (E.characters && E.characters.setGlobal && o.elenco) E.characters.setGlobal(o.elenco());   // los personajes de todo el guion
    E.document.set({ title: doc.titulo || '', html: doc.html || '', characters: doc.characters || {} });
    alPrincipio();
    aplicarCabecera();
    render();
    if (E.focusEditor) E.focusEditor();
  }
  /* otro documento empieza arriba (Leo): el cursor ya va al principio, pero la hoja conservaba el desplazamiento del anterior */
  function alPrincipio() {
    const ws = marco && marco.contentDocument && marco.contentDocument.getElementById('workspace');
    if (ws) { ws.scrollTop = 0; ws.scrollLeft = 0; }
  }
  function cerrarDocumento() {
    if (!documento) return;
    volcar(); documento = null; conTira = false;
    aplicarCabecera();
  }
  function alCambiarEditor(doc) {
    if (!documento) return;
    documento.guardar(doc);
    if (documento.alCambiar) documento.alCambiar(doc);
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


  /* las flechas de la tira: la trama de arriba o la de abajo, en el orden del esquema */
  function cambiarTrama(d) {
    const m = modelo(), L = m ? m.datos.lineas : [], i = L.findIndex(x => x.id === lineaId), l = L[i + d];
    if (!l) return;
    lineaId = l.id; posicion = null;
    render();
    tira.scrollLeft = 0;
    if (o.avisar) o.avisar('En ' + l.nombre);
  }

  /* ---------- la cabecera de la vista (50 px, rediseño) ----------
     «CONTENEDOR [Esquema] Título del documento» y «Ver esquema». El título se escribe aquí (la barra de título del
     editor no se ve): pasa al #docTitle del marco y de ahí renombra la nota. */
  function renderCabecera() {
    const cab = o.cabecera; if (!cab) return;
    cab.querySelector('[data-texto-cont]').textContent = o.contenedor ? o.contenedor() : '';
    cab.querySelector('[data-texto-acto]').hidden = true;       // sin secciones no hay acto que enseñar
    /* el esquema en un chip con su nombre, como la biblioteca en la cabecera de una nota */
    const esq = cab.querySelector('[data-texto-esq]'), ce = o.esquemaChip ? o.esquemaChip() : null;
    esq.hidden = !ce;
    if (ce) {
      esq.firstElementChild.textContent = ce.nombre;
      esq.classList.toggle('per-chip', !!ce.chl); esq.classList.toggle('gd-chip--esquema', !ce.chl);
      if (ce.chl) { esq.style.setProperty('--chl', ce.chl); esq.style.setProperty('--chd', ce.chd); } else { esq.style.removeProperty('--chl'); esq.style.removeProperty('--chd'); }
      esq.setAttribute('aria-label', 'Esquema «' + ce.nombre + '» · ver en el esquema');
    }
    const nom = cab.querySelector('[data-texto-nom]');
    if (nom.readOnly) nom.value = documento ? (documento.titulo ? documento.titulo() : '') : '';
    nom.disabled = !documento;
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
      /* el globo (al pasar el ratón) enseña la descripción del esquema; los saltos, adónde llevan */
      const pista = s
        ? `${FORMA[s.tipo] || 'Salto'}${destino ? ' → ' + destino.nombre : ''} · pulsa para ver esa trama`
        : p.descripcion;
      return `<button type="button" class="${clases.join(' ')}" data-punto="${esc(p.id)}"${s ? ` data-salto="${esc(p.id)}"` : ''}
        style="--c:${tono(p.color || l.color)}" data-pista="${esc(pista)}">
        <span class="hilo-tit"><span class="hilo-tit-txt">${esc(p.titulo) || 'Sin título'}</span></span><i class="hilo-punto"></i>${s ? `<i class="hilo-trazo ${sube ? 'sube' : 'baja'}" title="${sube ? 'Sube' : 'Baja'} a ${esc(destino ? destino.nombre : 'otra trama')}"></i>` : ''}</button>`;
    }).join('');
    /* la trama: el círculo con su inicial, como en el carril del tablero, y encima y debajo las flechas que pasan a la trama de
       arriba o de abajo del esquema (Leo, 18-09-2026: «la opción de poder moverme de tramas, quizás con unas flechas»). Salen
       siempre, con borde, para que se vean (1.1.17, Leo: «tampoco veo las flechas»: con una sola trama no salían y, con más,
       eran dos trazos grises); sin trama a ese lado, apagadas. */
    const n = m.puntosDe(l.id).length, L = m.datos.lineas, i = fila(l.id);
    const flecha = (d, trazo) => {
      const otra = L[i + d];
      const nada = L.length === 1 ? 'Es la única trama del esquema' : d < 0 ? 'Es la primera trama' : 'Es la última trama';
      return `<button type="button" class="hilo-cambiar" data-trama-paso="${d}"${otra ? '' : ' disabled'} title="${otra ? (d < 0 ? 'Trama de arriba: ' : 'Trama de abajo: ') + esc(otra.nombre) : nada}" aria-label="${d < 0 ? 'Trama de arriba' : 'Trama de abajo'}">`
        + `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${trazo}"/></svg></button>`;
    };
    const chip = `<div class="hilo-trama con-flechas" style="--tc:${tono(l.color)}">
        ${flecha(-1, 'M4 10l4-4 4 4')}
        <span class="chip ${l.tipo}" data-inicial="${esc((l.nombre || '?').trim().charAt(0).toUpperCase())}" style="background:${tono(l.color)};color:${tono(l.color)}" title="${esc(l.nombre)} · ${ETIQUETA[l.tipo] || l.tipo} · ${n} ${n === 1 ? 'nodo' : 'nodos'}"></span>
        ${flecha(1, 'M4 6l4 4 4-4')}</div>`;
    const vacio = puntos ? '' : '<span class="hilo-vacio">Esta trama aún no tiene nodos: créalos en el esquema de pasos.</span>';
    tira.innerHTML = `${chip}<div class="hilo-pista${l.tipo === 'alterna' ? ' alterna' : ''}${l.cortada ? ' cortada' : ''}${puntos ? '' : ' vacia'}" style="--c:${tono(l.color)}">${puntos}${vacio}</div>`;
    colocarRotulos();
    pintarNotas(m, l);
    /* Centrar el nodo resaltado desplazando solo la tira (scrollIntoView movería también la página). */
    const act = tira.querySelector('.hilo-nodo.actual, .hilo-nodo.pos');
    if (act) tira.scrollLeft = act.offsetLeft + act.offsetWidth / 2 - tira.clientWidth / 2;
  }

  /* **Las notas del esquema, en la tira, como puntos** (Leo, 18-09-2026, 1.1.17: «márcalas solo con puntos abajo del nodo o
     abajo de la raya… para ver las notas del nodo, hover sobre el nodo y se ven en el tooltip… las de enlace, hover sobre el
     punto que aparece»; en la 1.1.16 iban como tarjetas y ocupaban mucho): bajo un nodo, un punto por cada una de sus notas,
     del color de la nota; bajo la mitad de un enlace (o en su raya, para las de una raya), los de sus notas. Al pasar el ratón
     por el nodo, el globo enseña su descripción y sus notas; por los puntos de un enlace, las notas de ese enlace. */
  const MAX_PUNTOS = 6;
  let notasNodo = new Map(), notasEnlace = [];                   // lo que enseña el globo
  const puntoNota = n => `<i class="hilo-np${n.color ? '' : ' papel'}"${n.color ? ` style="--nc:var(--t-${esc(n.color)})"` : ''}></i>`;
  const puntosDe = ns => ns.slice(0, MAX_PUNTOS).map(puntoNota).join('') + (ns.length > MAX_PUNTOS ? `<b>+${ns.length - MAX_PUNTOS}</b>` : '');
  function pintarNotas(m, l) {
    notasNodo = new Map(); notasEnlace = [];
    tira.style.height = '';                                       // la 1.1.16 la hacía crecer con las notas
    const pista = tira.querySelector('.hilo-pista'); if (!pista) return;
    const notas = m.notasDeLinea ? m.notasDeLinea(l.id) : [];
    if (!notas.length) return;
    const props = m.puntosDe(l.id);
    const nodo = p => p && pista.querySelector(`:scope > .hilo-nodo[data-punto="${CSS.escape(p.id)}"]`);
    const centro = p => { const el = nodo(p); return el ? el.offsetLeft + el.offsetWidth / 2 : null; };
    /* las de un nodo, bajo su nodo */
    notas.filter(n => !n.abierta && !n.aId).forEach(n => { if (!notasNodo.has(n.deId)) notasNodo.set(n.deId, []); notasNodo.get(n.deId).push(n); });
    notasNodo.forEach((ns, id) => {
      const el = nodo(m.punto(id)); if (!el) return;
      el.classList.add('con-notas');
      el.insertAdjacentHTML('beforeend', `<span class="hilo-notas" aria-hidden="true">${puntosDe(ns)}</span>`);
    });
    /* las de un enlace (a su mitad) y las de una raya (en su raya), agrupadas por sitio */
    const sitio = n => {
      if (n.abierta) {
        const c = m.colNota(n), a = props.filter(p => m.cg(p) <= c).pop(), b = props.find(p => m.cg(p) > c);
        if (a && b) return (centro(a) + centro(b)) / 2;
        if (a) return centro(a) + 70;
        if (b) return Math.max(40, centro(b) - 70);
        return 60;
      }
      const a = m.punto(n.deId), b = m.punto(n.aId);
      return a && b ? (centro(a) + centro(b)) / 2 : null;
    };
    notas.filter(n => n.abierta || n.aId).forEach(n => {
      const x = sitio(n); if (x == null) return;
      let g = notasEnlace.find(q => Math.abs(q.x - x) < 8);
      if (!g) notasEnlace.push(g = { x, notas: [] });
      g.notas.push(n);
    });
    notasEnlace.forEach((g, k) => {
      pista.insertAdjacentHTML('beforeend', `<span class="hilo-notas hilo-notas-enlace" data-grupo="${k}" style="left:${Math.round(g.x)}px">${puntosDe(g.notas)}</span>`);
    });
  }
  /* las notas en el globo: un renglón por nota, con su punto de color */
  function notasEnGlobo(tip, ns, titulo) {
    const caja = document.createElement('div'); caja.className = 'tip-notas';
    if (titulo) { const t = document.createElement('div'); t.className = 'tip-t'; t.textContent = titulo; caja.appendChild(t); }
    ns.forEach(n => {
      const f = document.createElement('div'); f.className = 'tip-nota';
      f.insertAdjacentHTML('beforeend', puntoNota(n));
      const t = document.createElement('span'); t.textContent = n.texto || 'Nota'; f.appendChild(t);
      caja.appendChild(f);
    });
    tip.appendChild(caja);
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
    /* la tira solo con el documento de un esquema (de referencia); con una nota de biblioteca mandan las migas */
    const sinTira = !documento || !conTira;
    if (o.seccion) { o.seccion.classList.toggle('sin-tira', sinTira); o.seccion.classList.toggle('documento', !!documento && !conTira); }
  }
  /* El editor dentro de ClapCraft: `html.clapcraft` activa su disposición del rediseño (cinta de una
     fila y barra inferior siempre a la vista, sin barra de título; css/clapcraft-editor.css). Desde fuera
     se cambian los glifos de deshacer/rehacer por iconos y se añade a la barra inferior el botón que
     pliega el menú lateral. El editor no cambia. */
  const SVG = d => `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  let reabrir = true;                            // el botón que abrió un menú de la página lo cierra al volver a pulsarlo
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
    /* los menús viven en la página: un clic dentro del marco no les llega, así que aquí se cierran (y el mismo botón
       que lo abrió lo cierra). `enPagina` pasa el rectángulo del botón a coordenadas de la página. */
    const enPagina = b => { const r = b.getBoundingClientRect(), mm = marco.getBoundingClientRect();
      return { left: mm.left + r.left, top: mm.top + r.top, right: mm.left + r.right, bottom: mm.top + r.bottom, width: r.width, height: r.height }; };
    if (!d.documentElement.dataset.cdPop) {
      d.documentElement.dataset.cdPop = '1';
      d.addEventListener('mousedown', e => {
        const abierto = C.gestor.hayPop && C.gestor.hayPop();
        reabrir = !(abierto && e.target.closest && e.target.closest('#cdExportar, #cdVersiones'));
        if (abierto) C.gestor.cerrarPop();
      }, true);
      d.addEventListener('keydown', e => { if (e.key === 'Escape' && C.gestor.hayPop && C.gestor.hayPop()) { e.preventDefault(); e.stopPropagation(); C.gestor.cerrarPop(); } }, true);
    }
    /* «Versiones» y «Exportar», junto a los modos: sus menús se abren en la página, sobre el botón */
    const modo = d.getElementById('fbScript');
    if (barra && modo && !d.getElementById('cdVersiones')) {
      const v = d.createElement('div');
      v.className = 'fb-item cd-versiones';
      v.innerHTML = `<button type="button" id="cdVersiones" title="Versiones de este documento">${SVG('<path d="M2.7 8a5.3 5.3 0 1 0 1.6-3.8"/><path d="M2.4 3.1v2.6h2.6"/><path d="M8 5.4V8l1.9 1.1"/>')}<span data-cd-version>Versiones</span>${SVG('<path d="M4 6.5 8 10.5l4-4"/>')}</button>`;
      v.querySelector('button').addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        if (!reabrir) { reabrir = true; return; }
        if (o.versiones) o.versiones(enPagina(e.currentTarget));
      });
      modo.parentElement.before(v);
    }
    if (barra && modo && !d.getElementById('cdExportar')) {
      const x = d.createElement('div');
      x.className = 'fb-item cd-exportar';
      x.innerHTML = `<button type="button" id="cdExportar" title="Exportar a PDF, Word o texto">${SVG('<path d="M8 10.2V2.9"/><path d="M5.3 5.6 8 2.9l2.7 2.7"/><path d="M2.9 9.6v2.3c0 .7.5 1.2 1.2 1.2h7.8c.7 0 1.2-.5 1.2-1.2V9.6"/>')}Exportar</button>`;
      x.querySelector('button').addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        if (!reabrir) { reabrir = true; return; }
        if (o.exportar) o.exportar(enPagina(e.currentTarget));
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
    /* la tira es de referencia (Leo, 16-09-2026): sus nodos ya no abren nada; un cuadro o un rombo enseña la trama
       del otro extremo, que es mirar, no navegar */
    tira.addEventListener('click', e => {
      const paso = e.target.closest('[data-trama-paso]');
      if (paso) { cambiarTrama(+paso.dataset.tramaPaso); return; }
      const s = e.target.closest('[data-salto]');
      if (s) saltar(s.dataset.salto);
    });
    /* Globo bajo el nodo, con el mismo #tip del tablero: título y descripción del esquema. */
    const tip = o.tip;
    if (tip) {
      const ponerGlobo = (el, bajo) => {
        tip.style.background = ''; tip.style.color = '';
        tip.classList.add('show');
        const r = (bajo || el).getBoundingClientRect(), w = tip.offsetWidth;
        tip.style.left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8)) + 'px';
        tip.style.top = (r.bottom + 6) + 'px';
      };
      tira.addEventListener('mouseover', e => {
        /* los puntos de un enlace o de una raya: sus notas */
        const g = e.target.closest('.hilo-notas-enlace');
        if (g) {
          const grupo = notasEnlace[+g.dataset.grupo]; if (!grupo) return;
          tip.innerHTML = '';
          notasEnGlobo(tip, grupo.notas, grupo.notas.length === 1 ? 'Nota' : grupo.notas.length + ' notas');   // como en el nodo (Leo: «solo ponle nota»)
          tip.firstChild.classList.add('sola');
          ponerGlobo(g);
          return;
        }
        const n = e.target.closest('.hilo-nodo'); if (!n) return;
        const titulo = (n.querySelector('.hilo-tit-txt') || n.querySelector('.hilo-tit')).textContent, texto = n.dataset.pista;
        tip.innerHTML = '';
        const h = document.createElement('div'); h.className = 'tip-t'; h.textContent = titulo; tip.appendChild(h);
        const b = document.createElement('div'); b.textContent = texto || 'Sin descripción en el esquema';
        if (!texto) b.style.opacity = '.6';
        tip.appendChild(b);
        /* y sus notas, debajo (Leo, 18-09-2026) */
        const ns = notasNodo.get(n.dataset.punto);
        if (ns && ns.length) notasEnGlobo(tip, ns, ns.length === 1 ? 'Nota' : ns.length + ' notas');
        ponerGlobo(n);
      });
      tira.addEventListener('mouseout', e => {
        const n = e.target.closest('.hilo-nodo, .hilo-notas-enlace');
        if (n && !(e.relatedTarget && n.contains(e.relatedTarget))) tip.classList.remove('show');
      });
      tira.addEventListener('click', () => tip.classList.remove('show'));
    }
    /* la cabecera: título del nodo, ver en el esquema y ‹ › */
    const cab = o.cabecera;
    if (cab) {
      cab.addEventListener('click', e => {
        if (e.target.closest('[data-texto-esquema], [data-texto-esq]') && o.volver) o.volver();
        if (e.target.closest('[data-texto-biblioteca]') && o.verBiblioteca) o.verBiblioteca();
      });
    }
    iniciarTitulos();
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
        if (inp.matches('[data-texto-nom]')) fijarTitulo(valor);                                   // renombra el documento
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
  /* El nombre de la versión que hay en el editor, en el botón de la barra inferior. */
  function versionEnBoton(nombre) {
    const d = marco && marco.contentDocument; if (!d) return;
    const e = d.querySelector('[data-cd-version]'); if (!e) return;
    e.textContent = nombre || 'Versiones';
    const b = d.getElementById('cdVersiones'); if (b) b.classList.toggle('con-version', !!nombre);
  }
  function fijarTitulo(valor) {
    const t = marco && marco.contentDocument && marco.contentDocument.getElementById('docTitle'); if (!t) return;
    t.value = valor; t.dispatchEvent(new Event('input', { bubbles: true }));
  }
  C.texto = { iniciar, saltar, volcar, render, tema, precargar: cargarEditor, fijarTitulo, versionEnBoton, enfocar: () => { if (E && E.focusEditor) E.focusEditor(); },
    editor: () => E,
    abrirDocumento, cerrarDocumento, enDocumento: () => !!documento, conTira: () => conTira,
    /* suelta el documento **sin guardarlo**: lo que hay en el editor ya no debe volver a su nota (al cargar una versión) */
    soltar: () => { documento = null; },
    linea: () => lineaId, posicion: () => posicion,
    cerrar: () => { volcar(); documento = null; conTira = false; posicion = null; lineaId = null; aplicarCabecera(); } };
})(window.Claquedraw);
