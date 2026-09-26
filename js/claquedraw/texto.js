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
  let claveDoc = null;                           // qué documento hay en el editor (su nota), para recordar dónde se quedó

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
        w.document.addEventListener('selectionchange', () => apuntar(false));
        const ws = w.document.getElementById('workspace');
        if (ws) ws.addEventListener('scroll', () => apuntar(true), { passive: true });
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
    if (cmd && e.shiftKey && k === 'f') { e.preventDefault(); e.stopPropagation(); if (o.documentos) o.documentos(); return; }   // la vista Documentos, también con el foco en el editor (1.1.54)
    if (cmd && e.shiftKey && k === 'c' && !(window.editorAPI && window.editorAPI.isElectron)) { e.preventDefault(); e.stopPropagation(); if (o.copiarEnlace) o.copiarEnlace(); return; }   // en Electron lo lleva el menú Claude
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
    claveDoc = (op && op.clave) || null;
    if (E.characters && E.characters.setGlobal && o.elenco) E.characters.setGlobal(o.elenco());   // los personajes de todo el guion
    reponiendo = Date.now();
    E.document.set({ title: doc.titulo || '', html: doc.html || '', characters: doc.characters || {} });
    const pos = claveDoc && posiciones.get(claveDoc);
    if (pos) reponer(pos); else alPrincipio();
    aplicarCabecera();
    render();
    if (E.focusEditor) E.focusEditor();
  }
  /* ---------- dónde se quedó cada documento (1.1.33) ----------
     Leo: «no se debe perder la línea en que estaba posicionado en el editor al hacer cambios de pestaña» (y cambiando de
     pantalla en el árbol pasaba lo mismo: al volver, el documento se cargaba otra vez desde arriba). Mientras se escribe se
     apunta, por documento, el bloque y el carácter del cursor y el desplazamiento de la hoja (`selectionchange` y `scroll` del
     marco, solo con el editor a la vista: escondido, la hoja dice 0); al volver a abrirlo, `reponer` los deja como estaban. El
     medio segundo después de abrir no se apunta el desplazamiento: el cálculo de páginas mueve la hoja y lo pisaría. */
  const posiciones = new Map();                  // clave del documento → { bloque, car, top }
  let reponiendo = 0;
  const editorDoc = () => marco && marco.contentDocument;
  function apuntar(desplazamiento) {
    const dd = editorDoc(); if (!claveDoc || !dd || !marco.offsetParent) return;
    const ws = dd.getElementById('workspace'), ed = dd.getElementById('editor'); if (!ws || !ed || !ws.clientHeight) return;
    const p = posiciones.get(claveDoc) || {};
    if (desplazamiento) { if (Date.now() - reponiendo < 600) return; p.top = ws.scrollTop; }
    else {
      const s = dd.getSelection(); if (!s || !s.rangeCount) return;
      const r = s.getRangeAt(0); if (!ed.contains(r.startContainer)) return;
      if (r.startContainer === ed) { p.bloque = r.startOffset; p.car = 0; }
      else {
        let b = r.startContainer; while (b.parentNode !== ed) b = b.parentNode;
        const x = dd.createRange(); x.setStart(b, 0); x.setEnd(r.startContainer, r.startOffset);
        p.bloque = Array.prototype.indexOf.call(ed.childNodes, b); p.car = x.toString().length;
      }
    }
    posiciones.set(claveDoc, p);
  }
  function reponer(p) {
    const dd = editorDoc(), ed = dd && dd.getElementById('editor'), ws = dd && dd.getElementById('workspace'); if (!ed) return;
    if (p.bloque !== undefined && ed.childNodes.length) {
      const b = ed.childNodes[Math.min(p.bloque, ed.childNodes.length - 1)];
      const r = dd.createRange();
      let destino = null;
      if (b.nodeType === 3) destino = [b, Math.min(p.car || 0, b.nodeValue.length)];
      else {
        const tw = dd.createTreeWalker(b, NodeFilter.SHOW_TEXT); let n, resto = p.car || 0;
        while ((n = tw.nextNode())) { if (resto <= n.nodeValue.length) { destino = [n, resto]; break; } resto -= n.nodeValue.length; }
      }
      if (destino) r.setStart(destino[0], destino[1]); else r.setStart(b, 0);
      r.collapse(true);
      const s = dd.getSelection(); s.removeAllRanges(); s.addRange(r);
    }
    if (ws && p.top !== undefined) {
      const top = p.top;
      [0, 150, 450].forEach(ms => setTimeout(() => { if (claveDoc && posiciones.get(claveDoc) === p) ws.scrollTop = top; }, ms));
      ws.scrollTop = top;
    } else alPrincipio();
  }
  /* ---------- enlaces a un tramo del texto (1.1.52) ----------
     Leo: «Pon unos "puntos" o "links"… para facilitar el decirle a Claude a qué puntos me refiero». Un tramo es un rango de bloques,
     numerados como los numera Claude (js/claquedraw/conversor.js, `bloques`: cada elemento de primer nivel del editor es uno, y el
     texto suelto que va seguido, otro), más la huella del primero para encontrarlo si se mueve (js/claquedraw/enlaces.js). */
  const EN_LINEA = () => (C.conversor && C.conversor.EN_LINEA) || new Set(['a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'span', 'mark', 'code', 'sup', 'sub', 'br', 'font', 'small', 'big', 'label']);
  /* nodo de primer nivel → su número de bloque (desde 0), como `bloques` del conversor */
  function mapaBloques(ed) {
    const inl = EN_LINEA(), mapa = new Map(); let i = -1, suelto = false;
    ed.childNodes.forEach(n => {
      const txt = n.nodeType === 3;
      if (txt || (n.nodeType === 1 && inl.has(n.nodeName.toLowerCase()))) {
        if (txt && !n.nodeValue.replace(/[\s\u200B]/g, '') && !suelto) return;
        if (!suelto) { i++; suelto = true; }
        mapa.set(n, i); return;
      }
      if (n.nodeType !== 1) return;
      suelto = false; i++; mapa.set(n, i);
    });
    return mapa;
  }
  const escHtml = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const nodosDelBloque = (mapa, k) => [...mapa].filter(([, i]) => i === k).map(([n]) => n);
  const htmlDe = nodos => nodos.map(n => (n.nodeType === 3 ? escHtml(n.nodeValue) : n.outerHTML)).join('').replace(/\u200B/g, '');
  const textoDe = nodos => nodos.map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
  /* el número de bloque (desde 0) de un nodo de primer nivel; uno que no cuenta (espacio suelto), el del siguiente o el anterior */
  function indiceDe(mapa, n, haciaAtras) {
    for (let x = n; x; x = haciaAtras ? x.previousSibling : x.nextSibling) if (mapa.has(x)) return mapa.get(x);
    return null;
  }
  /* El tramo de lo elegido en el editor: { bloques: [desde, hasta] (desde 1), huella, extracto }. Con `op.nodos`, esos nodos de
     primer nivel (el asa de bloques); sin selección, null salvo con `op.bloque` (el del cursor). */
  function tramo(op) {
    op = op || {};
    const w = marco && marco.contentWindow, d = w && w.document, ed = d && d.getElementById('editor');
    if (!ed || !documento) return null;
    const mapa = mapaBloques(ed); if (!mapa.size) return null;
    let ia, ib, extracto = '';
    if (op.nodos && op.nodos.length) {
      const is = op.nodos.map(n => indiceDe(mapa, n)).filter(i => i !== null);
      if (!is.length) return null;
      ia = Math.min(...is); ib = Math.max(...is);
    } else {
      const s = w.getSelection(); if (!s || !s.rangeCount) return null;
      const r = s.getRangeAt(0);
      if (!ed.contains(r.startContainer) && r.startContainer !== ed) return null;
      if (r.collapsed && !op.bloque) return null;
      const arriba = (n, off) => { if (n === ed) return ed.childNodes[Math.min(off, ed.childNodes.length - 1)] || ed.lastChild; while (n && n.parentNode !== ed) n = n.parentNode; return n; };
      const a = arriba(r.startContainer, r.startOffset), b = arriba(r.endContainer, r.endOffset);
      ia = indiceDe(mapa, a); ib = indiceDe(mapa, b, true);
      if (ia === null) ia = indiceDe(mapa, a, true);
      if (ib === null) ib = ia;
      /* una selección que acaba al principio de un bloque (triple clic) no se lleva ese bloque */
      if (!r.collapsed && b && ib > ia) { const x = d.createRange(); x.setStart(b, 0); x.setEnd(r.endContainer, r.endOffset); if (!x.toString().trim()) ib--; }
      if (!r.collapsed) extracto = s.toString().replace(/\s+/g, ' ').trim();
    }
    if (ia === null || ib === null) return null;
    if (ib < ia) ib = ia;
    const primero = nodosDelBloque(mapa, ia);
    if (!extracto) extracto = textoDe(primero);
    const t = C.conversor ? C.conversor.textoPlano(htmlDe(primero)) : textoDe(primero);
    const esDb = primero.some(n => n.nodeType === 1 && n.matches && n.matches('.db'));
    return Object.assign({ bloques: [ia + 1, ib + 1], extracto }, t && !esDb && C.enlaces ? { huella: C.enlaces.huella(t) } : {});
  }
  /* Elige los bloques desde…hasta (desde 1) del documento `clave` y los trae a la vista; espera a que el editor lo tenga abierto. */
  function irATramo(clave, desde, hasta) {
    return new Promise(listo => {
      const t0 = Date.now();
      const intento = () => {
        const w = marco && marco.contentWindow, d = w && w.document, ed = d && d.getElementById('editor'), ws = d && d.getElementById('workspace');
        if (!ed || !documento || claveDoc !== clave || !ws || !ws.clientHeight) { if (Date.now() - t0 < 4000) setTimeout(intento, 80); else listo(false); return; }
        const mapa = mapaBloques(ed), nodos = [...mapa].filter(([, i]) => i >= desde - 1 && i <= hasta - 1).map(([n]) => n);
        if (!nodos.length) { listo(false); return; }
        const a = nodos[0], b = nodos[nodos.length - 1], r = d.createRange();
        if (a.nodeType === 3) r.setStart(a, 0); else r.setStart(a, 0);
        if (b.nodeType === 3) r.setEnd(b, b.nodeValue.length); else r.setEnd(b, b.childNodes.length);
        if (E && E.focusEditor) E.focusEditor();
        const sel = w.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        const centrar = () => { const el = a.nodeType === 1 ? a : a.parentElement; const rr = el.getBoundingClientRect(), rw = ws.getBoundingClientRect(); ws.scrollTop += (rr.top + rr.bottom) / 2 - (rw.top + rw.bottom) / 2; };
        centrar(); setTimeout(centrar, 350);                    // el cálculo de páginas mueve la hoja un momento después
        reponiendo = Date.now();
        posiciones.set(claveDoc, { bloque: Array.prototype.indexOf.call(ed.childNodes, a), car: 0, top: ws.scrollTop });   // otro objeto: `reponer` ya no la pisa
        listo(true);
      };
      intento();
    });
  }
  /* otro documento empieza arriba (Leo): el cursor ya va al principio, pero la hoja conservaba el desplazamiento del anterior */
  function alPrincipio() {
    const ws = marco && marco.contentDocument && marco.contentDocument.getElementById('workspace');
    if (ws) { ws.scrollTop = 0; ws.scrollLeft = 0; }
  }
  /* Vuelve a cargar el documento abierto con lo que ahora tiene su nota (1.1.38, Leo: «cuando está abierto un editor y le
     cambio el nombre a un personaje desde Personajes, no se cambia al instante»): renombrar o recolorear un personaje reescribe
     las notas por debajo, así que el editor las relee sin cerrarse, con el elenco nuevo y el cursor donde estaba. */
  function recargar(doc) {
    if (!E || !documento || !doc) return;
    apuntar(false);
    if (E.characters && E.characters.setGlobal && o.elenco) E.characters.setGlobal(o.elenco());
    reponiendo = Date.now();
    E.document.set({ title: doc.titulo || '', html: doc.html || '', characters: doc.characters || {} });
    const pos = claveDoc && posiciones.get(claveDoc);
    if (pos) reponer(pos);
    aplicarCabecera();
    render();
  }
  function cerrarDocumento() {
    if (!documento) return;
    cerrarFlot();
    volcar(); documento = null; conTira = false; claveDoc = null;
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
    const otra = m.linea(pareja.lineaId);
    if (otra && otra.oculta) { if (o.avisar) o.avisar('«' + otra.nombre + '» está oculta: muéstrala en el esquema'); return; }   // 1.1.40
    lineaId = pareja.lineaId; posicion = pareja.id;
    render();
    const l = m.linea(lineaId);
    if (o.avisar && l) o.avisar('En ' + l.nombre);
  }


  /* las flechas de la tira: la trama de arriba o la de abajo, en el orden del esquema */
  function cambiarTrama(d) {
    const m = modelo(), L = m ? m.datos.lineas.filter(x => !x.oculta) : [], i = L.findIndex(x => x.id === lineaId), l = L[i + d];
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
    /* las tramas ocultas no salen en la tira, y desde aquí no se devuelven (1.1.40, Leo: «solo se puede desocultar desde el esquema») */
    const visibles = m.datos.lineas.filter(x => !x.oculta);
    if (!lineaId || !m.linea(lineaId) || m.linea(lineaId).oculta) {
      const pr = m.lineaPrincipal();
      lineaId = ((pr && !pr.oculta ? pr : visibles[0]) || {}).id || null;
    }
    const l = lineaId && m.linea(lineaId);
    if (!l) { tira.innerHTML = '<span class="hilo-vacio">Este guion no tiene tramas.</span>'; return; }
    const pres = { fuera: () => false };                    // nada se apaga, como en el tablero (Leo, 18-09-2026: «que no se apague en ningún momento»)
    const tono = c => `var(--t-${c || 'azul'})`;
    const fila = lid => visibles.findIndex(x => x.id === lid);
    const puntos = m.puntosDe(l.id).map(p => {
      const s = m.saltoDe(p.id), pareja = s && m.parejaDe(p.id), destino = pareja && m.linea(pareja.lineaId);
      const clases = ['hilo-nodo'];
      if (s) clases.push(s.tipo === 'rombo' ? 'rombo' : 'caja');
      /* hacia dónde lleva el salto: a una trama de más arriba o de más abajo en el tablero (la flecha del trazo) */
      const sube = !!(s && pareja && fila(pareja.lineaId) < fila(l.id));
      if (p.id === posicion) clases.push(s ? 'pos' : 'actual');
      if (p.cortado) clases.push('cortado');
      if (!s && !p.cortado && String(p.titulo || '').trim()) clases.push('con-rotulo');   // el nombre en un rótulo de papel; sin nombre, sin rótulo (1.1.42)
      if (pres.fuera(p)) clases.push('fuera');
      /* el globo (al pasar el ratón) enseña la descripción del esquema, sin las marcas de Markdown (1.1.32); los saltos, adónde llevan */
      const pista = s
        ? `${FORMA[s.tipo] || 'Salto'}${destino ? ' → ' + destino.nombre : ''} · pulsa para ver esa trama`
        : (window.MdVivo ? MdVivo.plano(p.descripcion) : p.descripcion);
      return `<button type="button" class="${clases.join(' ')}" data-punto="${esc(p.id)}"${s ? ` data-salto="${esc(p.id)}"` : ''}
        style="--c:${tono(p.color || l.color)}" data-pista="${esc(pista)}">
        <span class="hilo-tit"><span class="hilo-tit-txt">${esc(p.titulo)}</span></span><i class="hilo-punto"></i>${s ? `<i class="hilo-trazo ${sube ? 'sube' : 'baja'}" title="${sube ? 'Sube' : 'Baja'} a ${esc(destino ? destino.nombre : 'otra trama')}"></i>` : ''}</button>`;
    }).join('');
    /* la trama: el círculo con su inicial, como en el carril del tablero, y encima y debajo las flechas que pasan a la trama de
       arriba o de abajo del esquema (Leo, 18-09-2026: «la opción de poder moverme de tramas, quizás con unas flechas»). Salen
       siempre, con borde, para que se vean (1.1.17, Leo: «tampoco veo las flechas»: con una sola trama no salían y, con más,
       eran dos trazos grises); sin trama a ese lado, apagadas. */
    const n = m.puntosDe(l.id).length, L = visibles, i = fila(l.id);
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
    pintarLugares(m, l);
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
  /* ---------- editar la tira desde el editor (1.1.36) ----------
     Leo: «quiero poder agregar, editar, eliminar nodos y notas desde la línea del tiempo del editor… quizás un panel flotante»; y
     «en esta vista no dejes hacer relaciones (rombos o cuadros)». Sobre la raya van unos «+» (`.hilo-mas`, al pasar el ratón): uno
     por **lugar** (`lugares`, en píxeles de la pista, donde `pintarNotas` pone los puntos de sus notas): delante del primer nodo,
     entre cada dos (el enlace) y detrás del último, o uno solo si la trama no tiene nodos. El clic en un nodo, en los puntos de las
     notas o en un «+» abre el panel flotante (js/claquedraw/flotante.js, `C.flotante`, que desde la 1.1.37 comparte con el tablero);
     un cuadro o un rombo sigue pasando la tira a la otra trama con un clic y su panel sale con el clic derecho. */
  let lugares = [];
  function pintarLugares(m, l) {
    lugares = [];
    const pista = tira.querySelector('.hilo-pista'); if (!pista) return;
    const ps = m.puntosDe(l.id);
    const centro = p => { const el = pista.querySelector(`:scope > .hilo-nodo[data-punto="${CSS.escape(p.id)}"]`); return el ? el.offsetLeft + el.offsetWidth / 2 : 0; };
    if (!ps.length) lugares.push({ lineaId: l.id, lado: 'vacia', x: 60 });
    else {
      lugares.push({ lineaId: l.id, lado: 'inicio', primero: ps[0].id, x: Math.max(40, centro(ps[0]) - 70) });
      for (let i = 0; i + 1 < ps.length; i++) lugares.push({ lineaId: l.id, a: ps[i].id, b: ps[i + 1].id, x: (centro(ps[i]) + centro(ps[i + 1])) / 2 });
      lugares.push({ lineaId: l.id, lado: 'fin', ultimo: ps[ps.length - 1].id, x: centro(ps[ps.length - 1]) + 70 });
    }
    pista.insertAdjacentHTML('beforeend', lugares.map((L, k) => `<button type="button" class="hilo-mas" data-lugar="${k}" style="left:${Math.round(L.x)}px" title="${L.a ? 'Añadir un nodo o una nota entre estos dos nodos' : 'Añadir un nodo o una nota aquí'}" aria-label="Añadir aquí">`
      + '<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg></button>').join(''));
    marcarFlot(flotAbierto());
  }
  /* el panel es de la tira si lo abrió ella (el tablero tiene su propio contexto) */
  const flotAbierto = () => (C.flotante && C.flotante.contexto() === ctxTira && C.flotante.abierto()) || null;
  const cerrarFlot = () => { if (flotAbierto()) C.flotante.cerrar(); };
  /* lo que tiene el panel abierto, marcado en la tira */
  function marcarFlot(q) {
    if (!tira) return;
    tira.querySelectorAll('.editando').forEach(x => x.classList.remove('editando'));
    if (!q) return;
    if (q.tipo === 'nodo') { const n = tira.querySelector(`.hilo-nodo[data-punto="${CSS.escape(q.id)}"]`); if (n) n.classList.add('editando'); }
    else { const k = lugares.findIndex(L => C.flotante.mismoLugar(L, q.lugar)); const b = k >= 0 && tira.querySelector(`.hilo-mas[data-lugar="${k}"]`); if (b) b.classList.add('editando'); }
  }
  /* dónde va el panel: el nodo, o el «+» de su lugar (tras repintar la tira, los elementos son otros) */
  function anclaDe(q) {
    if (!q || !tira) return null;
    if (q.tipo === 'nodo') {
      const n = tira.querySelector(`.hilo-nodo[data-punto="${CSS.escape(q.id)}"]`);
      if (n) { const x = n.offsetLeft + n.offsetWidth / 2; if (x < tira.scrollLeft || x > tira.scrollLeft + tira.clientWidth) tira.scrollLeft = Math.max(0, x - tira.clientWidth / 2); }
      return n;
    }
    const k = lugares.findIndex(L => C.flotante.mismoLugar(L, q.lugar));
    return k >= 0 ? tira.querySelector(`.hilo-mas[data-lugar="${k}"]`) : null;
  }
  const ctxTira = {
    modelo: () => modelo(),
    alCambiar: () => { render(); if (o.alCambiarTablero) o.alCambiarTablero(); },
    anclaDe, marcar: q => marcarFlot(q), conNodo: true,
    avisar: (t, accion) => { if (o.avisar) o.avisar(t, accion); },
    copiarEnlace: q => { if (o.copiarEnlaceFlot) o.copiarEnlaceFlot(q); },   // «Copiar enlace para Claude» del panel (1.1.52)
    dentro: el => !!(el.closest && el.closest('#hilo .hilo-nodo, #hilo .hilo-mas, #hilo .hilo-notas-enlace'))
  };
  const abrirFlot = (q, ancla) => { if (o.tip) o.tip.classList.remove('show'); C.flotante.abrir(q, ancla, ctxTira); };

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
        cerrarFlot();                                            // el panel flotante de la tira, también con un clic en la hoja
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
    /* «Copiar enlace para Claude» en el clic derecho (el párrafo del cursor o lo seleccionado) y en el menú del asa de bloques
       (los bloques elegidos), 1.1.52 */
    const ctxMenu = d.getElementById('ctxMenu');
    if (ctxMenu && !d.getElementById('cdEnlace')) {
      ctxMenu.insertAdjacentHTML('afterbegin', '<button type="button" id="cdEnlace"><span>Copiar enlace para Claude</span><kbd>Cmd+Shift+C</kbd></button><hr id="cdEnlaceSep">');
      const b = d.getElementById('cdEnlace');
      b.addEventListener('click', () => { const t = tramo({ bloque: true }); if (t && o.copiarTramo) o.copiarTramo(t); });
      d.addEventListener('contextmenu', () => {                 // antes de que el editor enseñe el menú: solo con un documento abierto
        const hay = !!documento && !!o.copiarTramo;
        b.hidden = !hay; d.getElementById('cdEnlaceSep').hidden = !hay;
        const s = w.getSelection();
        b.title = s && !s.isCollapsed ? 'El enlace de lo seleccionado (sus párrafos), para pegarlo en Claude' : 'El enlace de este párrafo, para pegarlo en Claude';
      }, true);
    }
    if (w.Ed && w.Ed.blocks && !w.Ed.blocks.extras.some(x => x.id === 'enlace')) {
      w.Ed.blocks.extras.push({ id: 'enlace', etiqueta: 'Copiar enlace para Claude', ejecutar: nodos => { const t = tramo({ nodos }); if (t && o.copiarTramo) o.copiarTramo(t); }, visible: () => !!documento && !!o.copiarTramo });
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
      /* editar desde la tira (1.1.36): un «+», los puntos de las notas de un enlace o una raya, o un nodo */
      const mas = e.target.closest('.hilo-mas');
      if (mas) { const L = lugares[+mas.dataset.lugar]; if (L) abrirFlot({ tipo: 'lugar', lugar: L }, mas); return; }
      const g = e.target.closest('.hilo-notas-enlace');
      if (g) { const x = parseFloat(g.style.left), L = lugares.find(q => Math.abs(q.x - x) < 10); if (L) abrirFlot({ tipo: 'lugar', lugar: L }, g); return; }
      const s = e.target.closest('[data-salto]');
      if (s) { cerrarFlot(); saltar(s.dataset.salto); return; }
      const n = e.target.closest('.hilo-nodo[data-punto]');
      if (n) abrirFlot({ tipo: 'nodo', id: n.dataset.punto }, n);
    });
    /* el clic derecho abre el panel de cualquier nodo, también de un cuadro o un rombo (su clic enseña la otra trama) */
    tira.addEventListener('contextmenu', e => {
      const n = e.target.closest('.hilo-nodo[data-punto]'); if (!n) return;
      e.preventDefault(); abrirFlot({ tipo: 'nodo', id: n.dataset.punto }, n);
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
        if (flotAbierto()) return;                                   // con el panel abierto, sin globos
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
    abrirDocumento, cerrarDocumento, recargar, clave: () => (documento ? claveDoc : null), enDocumento: () => !!documento, conTira: () => conTira,
    /* enlaces (1.1.52): el tramo elegido en el editor y llevar el editor a uno */
    tramo, irATramo,
    /* suelta el documento **sin guardarlo**: lo que hay en el editor ya no debe volver a su nota (al cargar una versión) */
    soltar: () => { documento = null; if (claveDoc) posiciones.delete(claveDoc); },
    linea: () => lineaId, posicion: () => posicion,
    cerrar: () => { cerrarFlot(); volcar(); documento = null; conTira = false; posicion = null; lineaId = null; claveDoc = null; aplicarCabecera(); },
    cerrarPanel: () => cerrarFlot() };
})(window.Claquedraw);
