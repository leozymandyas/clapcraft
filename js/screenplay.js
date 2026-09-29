/* Formatos de guion: encabezado de escena, acción, personaje, paréntico, diálogo, transición y toma.
   Son párrafos con clase sp-<tipo>; el estilo (mayúsculas, sangrías) lo pone el CSS. */
(function (Ed) {
  'use strict';
  const S = {};
  Ed.screenplay = S;

  /* Los elementos y lo que hace cada uno siguen la «Especificación de formato de guion» que entregó Leo (17-09-2026):
     formato de TV, Courier 12, sangrías fijas en caracteres, Enter y Tab que predicen el siguiente elemento. */
  S.KINDS = [
    { id: 'scene', label: 'Encabezado de escena', hint: 'INT./EXT. LUGAR - DÍA', keys: 'escena encabezado int ext slugline', atajo: '1' },
    { id: 'subscene', label: 'Encabezado secundario', hint: 'TALKING HEAD - INT. - DÍA', keys: 'subescena secundario talking' },
    { id: 'action', label: 'Acción', hint: 'Descripción de la acción', keys: 'accion descripcion', atajo: '2' },
    { id: 'character', label: 'Personaje', hint: 'PERSONAJE', keys: 'personaje nombre', atajo: '3' },
    { id: 'paren', label: 'Paréntesis', hint: 'en voz baja', keys: 'parentesis parentico acotacion', atajo: '4' },
    { id: 'dialogue', label: 'Diálogo', hint: 'Diálogo', keys: 'dialogo', atajo: '5' },
    { id: 'transition', label: 'Transición', hint: 'CORTE A:', keys: 'transicion corte fundido', atajo: '6' },
    { id: 'shot', label: 'Toma', hint: 'ÁNGULO SOBRE…', keys: 'toma plano shot angulo' },
    { id: 'act', label: 'Acto / Sección', hint: 'ACTO UNO', keys: 'acto seccion cold tag fin' },
    { id: 'note', label: 'Nota', hint: '[nota]', keys: 'nota comentario' },
    { id: 'montage', label: 'Montaje', hint: 'MONTAJE:', keys: 'montaje serie tomas' }
  ];
  /* Qué elemento sigue al pulsar Enter al final de cada uno (tabla de la especificación) */
  const NEXT = { scene: 'action', subscene: 'action', action: 'action', character: 'dialogue', paren: 'dialogue', dialogue: 'action',
                 transition: 'scene', shot: 'action', act: 'scene', note: 'action', montage: 'action' };
  /* Tab: a qué pasa (especificación); en los que no dice nada, sigue el orden de siempre (`ORDEN`) */
  const TAB = { action: 'character', character: 'paren', dialogue: 'paren' };

  /* el tipo de un párrafo de guion (no el del diálogo doble ni sus columnas, que envuelven párrafos: js/doble.js) */
  S.kindOf = function (block) {
    if (!block || !block.classList) return null;
    const c = Array.from(block.classList).find(k => k.startsWith('sp-') && k !== 'sp-doble' && k !== 'sp-col');
    return c ? c.slice(3) : null;
  };
  /* dentro de una columna de un diálogo doble solo caben personaje, paréntesis y diálogo */
  const enColumna = b => !!(Ed.doble && b && Ed.doble.col(b));
  const cabeEn = (b, kind) => !enColumna(b) || Ed.doble.KINDS.includes(kind);
  const ZW = /\u200B/g;
  const vacioEl = el => !el.textContent.replace(ZW, '').trim() && !el.querySelector('img, table, hr');

  /* ---------- Deshacer y Rehacer ----------
     Lo que repara el documento por su cuenta (los `normalizar` de recuadros.js y doble.js, el «:» de la transición de formato.js)
     no debe tocar nada mientras Chrome deshace o rehace: sus cambios quedarían fuera del historial y la pila de Rehacer se vaciaría.
     `enHistoria()` dice si acaba de haber un Deshacer o un Rehacer (el `input` llega antes que el `selectionchange` y que los
     `setTimeout` de los MutationObserver, así que se mira el reloj y no una marca que se suelte con un setTimeout). */
  let ultimaHistoria = -1e9;
  S.enHistoria = () => performance.now() - ultimaHistoria < 300;
  function oirHistoria() {
    const ed = Ed.editor; if (!ed) return;
    const marca = e => { if (/^history(Undo|Redo)$/.test(e.inputType || '')) ultimaHistoria = performance.now(); };
    ed.addEventListener('beforeinput', marca, true);
    ed.addEventListener('input', marca, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', oirHistoria); else oirHistoria();

  /* ---------- rehacer bloques en un solo paso de Deshacer ----------
     Cambiar el DOM del editor a mano (la clase de un párrafo, una línea nueva, una lista) deja fuera del historial de Chrome ese
     cambio y descoloca los que vienen: Cmd+Z deshacía otra cosa o nada. `S.editar(nodos, fn)` clona los hijos de #editor que
     contienen `nodos` (y los de en medio), deja que `fn(clon, caja)` cambie los clones —`clon(n)` da el clon de un nodo del
     documento; pídanse todos antes de mover nada— y los vuelve a poner con **un solo insertHTML** (`Ed.sustituir`, js/sustituir.js).
     `fn` puede devolver `{ nodo: <clon>, offset }` (o `{ nodo, fin: true }`) para dejar ahí el cursor; si no, la selección se
     conserva por su posición en el texto de su bloque. Devolver `false` cancela. Devuelve los hijos nuevos de #editor. */
  function topDe(n) {
    const ed = Ed.editor; let x = n && n.nodeType === 3 ? n.parentNode : n;
    while (x && x.parentNode !== ed) x = x.parentNode;
    return x && x.parentNode === ed ? x : null;
  }
  function ruta(desde, n) {                                     // índices de childNodes de `desde` a `n`
    const r = [];
    while (n && n !== desde) { const p = n.parentNode; if (!p) return null; r.unshift(Array.prototype.indexOf.call(p.childNodes, n)); n = p; }
    return n === desde ? r : null;
  }
  function rutaEl(desde, n) {                                   // índices de children (elementos), más robustos tras insertHTML
    const r = [];
    while (n && n !== desde) { const p = n.parentNode; if (!p) return null; r.unshift(Array.prototype.indexOf.call(p.children, n)); n = p; }
    return n === desde ? r : null;
  }
  const seguir = (desde, r, porEl) => { let n = desde; for (const i of r) { n = n && (porEl ? n.children : n.childNodes)[i]; } return n || null; };
  function textoHasta(el, nodo, off) { const r = document.createRange(); r.setStart(el, 0); r.setEnd(nodo, off); return r.toString().length; }
  /* el punto (nodo de texto, desplazamiento) que está a `off` caracteres del principio de `el` */
  function puntoEn(el, off) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n, resto = off === Infinity ? Infinity : Math.max(0, off | 0), ult = null;
    while ((n = w.nextNode())) { ult = n; if (resto <= n.length) return [n, resto]; resto -= n.length; }
    return ult ? [ult, ult.length] : [el, 0];
  }
  /* Pone en lugar de los hijos seguidos `orig` de #editor lo que hay en `caja` (sus clones, cambiados) con **un solo insertHTML**:
     el núcleo es el de js/sustituir.js (`Ed.reemplazar`), el mismo de las operaciones de bloques, que también sabe hacerlo en los
     bordes del documento sin salir de Deshacer. Devuelve los hijos de #editor que corresponden a los de `caja`, en orden. */
  const reemplazar = (orig, caja) => Ed.reemplazar(orig, caja);
  S.reemplazar = reemplazar;

  S.editar = function (nodos, fn) {
    const ed = Ed.editor; if (!ed) return null;
    const tops = (nodos || []).map(topDe).filter(Boolean);
    if (!tops.length) return null;
    const kids = Array.from(ed.children);
    const idx = tops.map(t => kids.indexOf(t));
    const orig = kids.slice(Math.min(...idx), Math.max(...idx) + 1);
    const caja = document.createElement('div');
    orig.forEach(t => caja.appendChild(t.cloneNode(true)));
    const originales = Array.from(caja.children);
    const clon = n => {
      const t = topDe(n), k = orig.indexOf(t); if (k < 0) return null;
      const r = ruta(t, n); return r ? seguir(originales[k], r) : null;
    };
    /* dónde está la selección: en qué hijo, en qué bloque de dentro y a cuántos caracteres de su principio */
    const sel = Ed.getRange();
    const punto = (nodo, off) => {
      const t = topDe(nodo), k = orig.indexOf(t); if (k < 0) return null;
      const b = Ed.closestBlock(nodo, ed) || t, base = t.contains(b) ? b : t;
      return { k, camino: rutaEl(t, base) || [], off: textoHasta(base, nodo, off) };
    };
    const ini = sel && ed.contains(sel.startContainer) ? punto(sel.startContainer, sel.startOffset) : null;
    const fin = sel && !sel.collapsed && ed.contains(sel.endContainer) ? punto(sel.endContainer, sel.endOffset) : null;
    const res = fn(clon, caja);
    if (res === false) return null;
    /* el cursor pedido, como ruta de elementos desde la caja (antes de sacar el HTML) */
    let destino = null;
    if (res && res.nodo && caja.contains(res.nodo)) destino = { camino: rutaEl(caja, res.nodo.nodeType === 1 ? res.nodo : res.nodo.parentNode), off: res.offset || 0, alFinal: !!res.fin };
    const hechos = reemplazar(orig, caja);
    if (!hechos.length) return hechos;
    const envolver = { children: hechos };
    const poner = (a, b) => { const r = document.createRange(); r.setStart(a[0], a[1]); if (b) r.setEnd(b[0], b[1]); else r.collapse(true); Ed.restoreSelection(r); };
    if (destino && destino.camino) {
      const el = seguir(envolver, destino.camino, true);
      if (el) { poner(destino.alFinal ? puntoEn(el, Infinity) : puntoEn(el, destino.off)); return hechos; }
    }
    if (ini && hechos.length === orig.length) {
      const donde = p => { const el = seguir(hechos[p.k], p.camino, true) || hechos[p.k]; return el ? puntoEn(el, p.off) : null; };
      const a = donde(ini), b = fin && donde(fin);
      if (a) poner(a, b);
    }
    return hechos;
  };
  const cambiado = () => { if (Ed.afterChange) Ed.afterChange(); if (Ed.updateToolbar) Ed.updateToolbar(); };

  /* Cambia el tipo de un bloque **en su clon** (S.editar): párrafo con la clase sp-<kind>, o sin ella (kind null). Un título, un
     bloque de código o un div pasan a párrafo; una viñeta o una celda no se tocan (null). El que deja de ser personaje pierde el
     chip del nombre (`.ch-nom`) y su color. */
  function aplicarEn(el, kind) {
    if (!el) return null;
    let p = el;
    if (p.tagName !== 'P') {
      if (/^(LI|TD|TH)$/.test(p.tagName)) return null;
      const np = document.createElement('p');
      if (p.tagName === 'PRE') np.innerHTML = Ed.escapeHtml(p.textContent).replace(/\n/g, '<br>');
      else while (p.firstChild) np.appendChild(p.firstChild);
      p.replaceWith(np); p = np;
    }
    Array.from(p.classList).forEach(k => { if (k.startsWith('sp-')) p.classList.remove(k); });
    if (kind) p.classList.add('sp-' + kind);
    if (kind !== 'character') {
      p.querySelectorAll('.ch-nom').forEach(s => { while (s.firstChild) s.parentNode.insertBefore(s.firstChild, s); s.remove(); });
      p.removeAttribute('data-ch'); p.style.removeProperty('--chl'); p.style.removeProperty('--chd');
      if (!p.style.length) p.removeAttribute('style');
    }
    if (kind !== 'transition') p.removeAttribute('data-izq');
    if (!p.classList.length) p.removeAttribute('class');
    if (!p.firstChild) p.appendChild(document.createElement('br'));
    return p;
  }
  S.aplicarEn = aplicarEn;
  const nuevaLinea = kind => { const p = document.createElement('p'); if (kind) p.className = 'sp-' + kind; p.innerHTML = '<br>'; return p; };
  S.nuevaLinea = nuevaLinea;
  /* un personaje soltado sin anotación («MARA» y el doble espacio) se recoge al pasar a la línea siguiente, en el mismo paso */
  const recoger = c => { if (c && Ed.characters && Ed.characters.recoger) Ed.characters.recoger(c); };

  /* Cambia el tipo de un bloque del documento (entra en Deshacer). Devuelve el bloque nuevo. */
  S.aplicar = function (block, kind) {
    const hechos = S.editar([block], clon => { aplicarEn(clon(block), kind); });
    cambiado();
    return (hechos && hechos[0]) || null;
  };

  /* Aplica un formato (o null = texto normal) a los bloques seleccionados, **en un solo paso de Deshacer** y sin mover el cursor */
  S.set = function (kind) {
    Ed.focusEditor();
    const editor = Ed.editor;
    const r = Ed.getRange();
    if (!r) return;
    const blocks = Ed.selectedBlocks(editor).filter(b => {
      if (b.closest('blockquote') && b.tagName !== 'BLOCKQUOTE') return false;
      if (b.matches('.sp-doble, .sp-col, .ed-fijo') || b.closest('[data-rc], .ed-fijo, [contenteditable="false"]') || !cabeEn(b, kind)) return false;
      if (/^(LI|TD|TH)$/.test(b.tagName)) return false;
      return !(b.tagName === 'P' && S.kindOf(b) === (kind || null) && (kind || !b.className));   // ya lo es
    });
    if (blocks.length) S.editar(blocks, clon => { const cs = blocks.map(clon); cs.forEach(c => aplicarEn(c, kind)); });
    cambiado();
  };

  /* Crea el elemento siguiente después de un bloque (lo que hace Enter al final) */
  function lineaTras(block, kind) {
    const hechos = S.editar([block], clon => {
      const c = clon(block); if (!c) return false;
      recoger(c);
      const n = nuevaLinea(kind); c.after(n);
      return { nodo: n, offset: 0 };
    });
    cambiado();
    return hechos;
  }
  S.continueFrom = function (block) {
    const kind = S.kindOf(block);
    if (!kind) return;
    lineaTras(block, NEXT[kind]);
  };

  /* Tab dentro de un elemento de guion cambia de elemento (Mayús+Tab, al anterior) en lugar de sangrar:
     la sangría deformaba el formato. Orden: escena → acción → personaje → paréntico → diálogo →
     transición → toma → escena. */
  const ORDEN = ['scene', 'subscene', 'action', 'character', 'paren', 'dialogue', 'transition', 'shot', 'act', 'note', 'montage'];
  S.onTab = function (e) {
    const editor = Ed.editor, r = Ed.getRange();
    if (!r || !editor.contains(r.startContainer)) return false;
    const block = Ed.closestBlock(r.startContainer, editor), kind = S.kindOf(block);
    if (!kind || block.closest('td, th, li')) return false;
    e.preventDefault();
    /* **al final de una línea con texto, Tab abre la siguiente** del tipo de la tabla (acción → personaje, personaje o diálogo →
       paréntesis), como en los editores de guion: cambiar la propia línea convertía el nombre o lo dicho en un paréntesis */
    const vacio = !block.textContent.replace(ZW, '').trim();
    if (!e.shiftKey && TAB[kind] && !vacio && r.collapsed) {
      const post = document.createRange(); post.setStart(r.startContainer, r.startOffset); post.setEnd(block, block.childNodes.length);
      if (!post.toString().replace(ZW, '').trim()) { lineaTras(block, TAB[kind]); return true; }
    }
    const orden = enColumna(block) ? Ed.doble.KINDS : ORDEN;       // en un diálogo doble, solo sus tres
    const i = orden.indexOf(kind), sig = (!e.shiftKey && TAB[kind]) || orden[(i + (e.shiftKey ? -1 : 1) + orden.length) % orden.length];
    S.set(sig);                                                    // conserva el cursor donde estaba
    return true;
  };

  /* Retroceso al principio de un bloque cuyo anterior es una línea vacía: Chrome metía el bloque en esa línea, que le daba su
     tipo (una escena detrás de una acción vacía pasaba a acción). Aquí se quita la línea vacía y el bloque se queda como es. */
  function retroceso(e) {
    if ((e.key !== 'Backspace' && e.key !== 'Delete') || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return false;
    const editor = Ed.editor, r = Ed.getRange();
    if (!r || !r.collapsed || !editor.contains(r.startContainer)) return false;
    const block = Ed.closestBlock(r.startContainer, editor);
    if (!block || block.parentNode !== editor || !/^(P|H[1-6])$/.test(block.tagName) || block.classList.contains('ed-fijo')) return false;
    if (e.key === 'Delete') {
      /* Supr al final de un bloque con una línea vacía detrás: se va la línea vacía (Chrome podía dejar el bloque con su tipo) */
      const sig = block.nextElementSibling;
      if (!sig || sig.tagName !== 'P' || sig.classList.contains('ed-fijo') || sig.getAttribute('contenteditable') === 'false' || !vacioEl(sig)) return false;
      if (sig.className === block.className && block.tagName === 'P') return false;
      const post = document.createRange(); post.setStart(r.startContainer, r.startOffset); post.setEnd(block, block.childNodes.length);
      if (post.toString().replace(ZW, '') || post.cloneContents().querySelector('img')) return false;
      e.preventDefault();
      S.editar([block, sig], clon => { const cb = clon(block), cs = clon(sig); cs.remove(); return { nodo: cb, fin: true }; });
      cambiado();
      return true;
    }
    const prev = block.previousElementSibling;
    if (!prev || prev.tagName !== 'P' || prev.classList.contains('ed-fijo') || prev.getAttribute('contenteditable') === 'false' || !vacioEl(prev)) return false;
    if (prev.className === block.className && block.tagName === 'P' && !block.getAttribute('style')) return false;   // dos párrafos iguales: lo de Chrome vale
    const pre = document.createRange(); pre.setStart(block, 0); pre.setEnd(r.startContainer, r.startOffset);
    if (pre.toString().replace(ZW, '') || pre.cloneContents().querySelector('img')) return false;
    e.preventDefault();
    S.editar([prev, block], clon => { const cp = clon(prev), cb = clon(block); cp.remove(); return { nodo: cb, offset: 0 }; });
    cambiado();
    return true;
  }

  /* Enter dentro de un elemento de guion */
  S.onKeydown = function (e) {
    if (retroceso(e)) return true;
    if (e.key !== 'Enter' || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return false;
    const editor = Ed.editor;
    const r = Ed.getRange();
    if (!r || !r.collapsed || !editor.contains(r.startContainer)) return false;
    const block = Ed.closestBlock(r.startContainer, editor);
    const kind = S.kindOf(block);
    if (!kind) return false;
    if (enColumna(block)) return Ed.doble.onEnter(e, block);     // en un diálogo doble, de columna en columna
    const text = block.textContent.replace(ZW, '').trim();
    if (!text) {
      /* **Enter en una línea vacía abre el menú de comandos** (especificación, 4): se elige ahí qué elemento es (Acción marcada).
         Un segundo Enter sin escribir nada lo cierra y hace lo de antes: pasa a acción, y una acción vacía vuelve a texto normal. */
      e.preventDefault();
      const alVacio = () => { if (block.isConnected) S.aplicar(block, kind === 'action' ? null : 'action'); };
      if (Ed.slash && Ed.slash.abrirAqui && Ed.slash.abrirAqui({ alVacio, marcar: 'sp-action' })) return true;
      alVacio();
      return true;
    }
    const post = document.createRange();
    post.setStart(r.startContainer, r.startOffset);
    post.setEnd(block, block.childNodes.length);
    const atEnd = !post.toString().replace(ZW, '').trim();
    /* en medio del nombre de un personaje (o delante de su anotación) Enter no lo parte —registraba medio nombre como un personaje
       nuevo—: pasa al diálogo como al final. Al principio sí (baja el personaje una línea). */
    if (!atEnd && kind === 'character') {
      const pre = document.createRange(); pre.setStart(block, 0); pre.setEnd(r.startContainer, r.startOffset);
      if (pre.toString().replace(ZW, '').trim()) { e.preventDefault(); lineaTras(block, NEXT[kind]); return true; }
    }
    if (!atEnd) return false; /* partir a media línea: Chrome conserva la clase en ambas mitades */
    e.preventDefault();
    lineaTras(block, NEXT[kind]);
    return true;
  };
})(window.Ed);
