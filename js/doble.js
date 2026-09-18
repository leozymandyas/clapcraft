/* Diálogo doble (especificación de guion, 2.7; Leo, 18-09-2026: «implementa lo del diálogo doble»): dos personajes que hablan a
   la vez, en dos columnas, cada una con su personaje, su paréntesis y su diálogo.
   · En el documento es `<div class="sp-doble">` con dos `<div class="sp-col">` y, dentro de cada columna, los párrafos de siempre
     (`p.sp-character`, `p.sp-paren`, `p.sp-dialogue`): el corrector, los personajes, buscar y exportar los ven como a cualquier
     otro diálogo.
   · «/dialogo-doble» (o el clic derecho, «Diálogo doble») en un diálogo lo junta con el de antes (o con el de después; si no hay,
     con una columna en blanco); en una línea vacía pone uno en blanco, y dentro de un diálogo doble lo separa en dos diálogos
     seguidos. Juntar y separar van con un solo insertHTML: entran en Deshacer.
   · Enter al final del personaje o del paréntesis pasa al diálogo de su columna; al final del diálogo de la izquierda, a la
     columna de la derecha, y al final del de la derecha, a una acción debajo del bloque. Tab y Mayús+Tab solo cambian entre
     personaje, paréntesis y diálogo (screenplay.js).
   · Retroceso y Supr no mezclan las columnas ni el bloque con lo de alrededor (Chrome unía el personaje de la derecha al diálogo
     de la izquierda): al principio de una columna el cursor pasa a la de antes; con la columna de la derecha vacía, el bloque
     vuelve a ser un diálogo normal, y vacío del todo, desaparece. Una selección que cruza columnas se borra columna a columna.
   · `normalizar` repara lo que un pegado o un borrado raro deje a medias (columnas que faltan o sobran, un diálogo doble dentro de
     otro) y deja siempre una línea detrás del último bloque para seguir escribiendo.
   · No se parte entre páginas: el maquetador (js/claquedraw/maquetar.js, `lineasDoble`) lo cuenta con los renglones de su columna
     más larga, a 28 caracteres por columna. */
(function (Ed) {
  'use strict';
  const D = {};
  Ed.doble = D;
  const editor = () => Ed.editor;
  const ZW = /\u200B/g;
  /* lo que cabe en una columna (Tab y los formatos no ponen otra cosa) */
  D.KINDS = ['character', 'paren', 'dialogue'];

  const esCol = n => !!(n && n.nodeType === 1 && n.classList.contains('sp-col'));
  const elDe = n => (n && n.nodeType === 3 ? n.parentNode : n);
  /* la columna o el diálogo doble que contiene a un nodo del editor */
  D.col = node => { const e = elDe(node), c = e && e.closest ? e.closest('.sp-col') : null; return c && editor() && editor().contains(c) ? c : null; };
  D.de = node => { const e = elDe(node), d = e && e.closest ? e.closest('.sp-doble') : null; return d && editor() && d.parentNode === editor() ? d : null; };
  const columnas = d => Array.from(d.children).filter(esCol);
  const parrafos = c => Array.from(c.children).filter(p => p.tagName === 'P');
  const vacio = el => !el.textContent.replace(ZW, '').trim() && !el.querySelector('img');
  const kind = b => (b && Ed.screenplay ? Ed.screenplay.kindOf(b) : null);
  const cambiado = () => { if (Ed.afterChange) Ed.afterChange(); if (Ed.updateToolbar) Ed.updateToolbar(); };
  /* ¿no hay nada entre el principio del bloque y el cursor (o entre el cursor y su final)? */
  function enBorde(b, r, final) {
    const t = document.createRange();
    if (final) { t.setStart(r.endContainer, r.endOffset); t.setEnd(b, b.childNodes.length); }
    else { t.setStart(b, 0); t.setEnd(r.startContainer, r.startOffset); }
    return !t.toString().replace(ZW, '') && !t.cloneContents().querySelector('img');
  }
  function cursorEn(b, final) {
    if (!b) return;
    editor().focus({ preventScroll: true });
    const r = document.createRange(); r.selectNodeContents(b); r.collapse(!final);
    Ed.restoreSelection(r);
    if (Ed.updateToolbar) Ed.updateToolbar();
  }

  /* ---------- el HTML ---------- */
  const VACIA = '<p class="sp-character"><br></p><p class="sp-dialogue"><br></p>';
  const limpio = b => { const c = b.cloneNode(true); c.classList.remove('blk-selected', 'selected'); return c.outerHTML; };
  const html = (izq, der) => `<div class="sp-doble"><div class="sp-col">${izq || VACIA}</div><div class="sp-col">${der || VACIA}</div></div>`;

  /* el diálogo de primer nivel (el personaje y lo que va pegado detrás: paréntesis y diálogos) al que pertenece un bloque */
  function grupoDe(b) {
    if (!b || b.parentNode !== editor()) return null;
    let ini = b;
    while (ini && (kind(ini) === 'paren' || kind(ini) === 'dialogue')) ini = ini.previousElementSibling;
    if (!ini || kind(ini) !== 'character') return null;
    const g = [ini];
    let n = ini.nextElementSibling;
    while (n && (kind(n) === 'paren' || kind(n) === 'dialogue')) { g.push(n); n = n.nextElementSibling; }
    return g;
  }
  const grupoAntes = g => { const p = g[0].previousElementSibling; return p && /^(character|paren|dialogue)$/.test(kind(p) || '') ? grupoDe(p) : null; };
  const grupoDespues = g => { const n = g[g.length - 1].nextElementSibling; return n && kind(n) === 'character' ? grupoDe(n) : null; };

  /* sustituye los bloques de primer nivel [a … b] por `nuevo` con un solo insertHTML (entra en Deshacer). Chrome reemplaza
     limpio si la selección va del principio de un párrafo al final de otro; empezando en el propio diálogo doble, se queda
     con su envoltorio. */
  function reemplazar(a, b, nuevo) {
    editor().focus({ preventScroll: true });
    const r = document.createRange(); r.setStart(a, 0); r.setEnd(b, b.childNodes.length);
    Ed.restoreSelection(r);
    Ed.cmd('insertHTML', nuevo);
  }
  /* el diálogo doble que quedó justo donde estaba `ref` (el que sigue a `antes`, o el primero) */
  const dobleTras = antes => { const n = antes ? antes.nextElementSibling : editor().firstElementChild; return n && n.classList.contains('sp-doble') ? n : editor().querySelector(':scope > .sp-doble'); };

  /* ---------- crear, juntar y separar ---------- */
  function juntar(g1, g2) {
    const antes = g1[0].previousElementSibling, ultimo = (g2 || g1)[(g2 || g1).length - 1];
    reemplazar(g1[0], ultimo, html(g1.map(limpio).join(''), g2 ? g2.map(limpio).join('') : ''));
    const d = dobleTras(antes); if (!d) return;
    const der = columnas(d)[1];
    /* se sigue escribiendo al final de lo que se tenía (o en el personaje de la columna nueva) */
    if (g2) cursorEn(parrafos(der).pop(), true); else cursorEn(parrafos(der)[0], false);
  }
  /* uno en blanco en lugar de una línea vacía, o detrás del bloque del cursor */
  function enBlanco(b) {
    if (!vacio(b) || b.tagName !== 'P') {
      cursorEn(b, true);
      Ed.cmd('insertParagraph');
      const r = Ed.getRange(), nb = r && Ed.closestBlock(r.startContainer, editor());
      if (!nb || nb === b || nb.parentNode !== editor()) return;
      b = nb;
    }
    const antes = b.previousElementSibling;
    reemplazar(b, b, html());
    const d = dobleTras(antes);
    if (d) cursorEn(parrafos(columnas(d)[0])[0], false);
  }
  /* en dos diálogos seguidos: el de la izquierda y luego el de la derecha */
  D.separar = function (d) {
    if (!d || !d.isConnected) return;
    /* una columna vacía del todo no deja nada; de las otras se quitan las líneas vacías (salvo la primera) */
    const piezas = columnas(d).filter(c => !parrafos(c).every(vacio)).map(c => parrafos(c).filter((p, i) => i === 0 || !vacio(p)).map(limpio).join('')).join('')
      || '<p class="sp-action"><br></p>';
    const antes = d.previousElementSibling, despues = d.nextElementSibling;
    const n = (piezas.match(/<p[\s>]/g) || []).length;
    if (antes && despues && antes.tagName === 'P' && despues.tagName === 'P') {
      const i = Array.prototype.indexOf.call(editor().children, antes);
      reemplazar(antes, despues, limpio(antes) + piezas + limpio(despues));
      cursorEn(editor().children[i + n], true);                  // al final de lo que era la columna de la derecha
    } else {
      /* sin un párrafo a cada lado no se puede con insertHTML (se quedaba el envoltorio): a mano, fuera de Deshacer */
      const t = document.createElement('template'); t.innerHTML = piezas;
      const ultimo = t.content.lastElementChild;
      d.replaceWith(t.content);
      cursorEn(ultimo, true);
    }
    cambiado();
  };
  /* «Diálogo doble»: juntar, poner uno en blanco o, dentro de uno, separarlo */
  D.alternar = function () {
    Ed.focusEditor();
    const r = Ed.getRange(); if (!r) return;
    const dentro = D.de(r.startContainer);
    if (dentro) { D.separar(dentro); return; }
    const b = Ed.closestBlock(r.startContainer, editor());
    let top = elDe(r.startContainer); while (top && top.parentNode !== editor()) top = top.parentNode;
    if (!b || !top || top.parentNode !== editor() || top.matches('.ed-fijo, .db, table, ul, ol, blockquote, pre')) return;
    const g = grupoDe(top);
    if (g) {
      const antes = grupoAntes(g), despues = grupoDespues(g);
      if (antes) juntar(antes, g); else if (despues) juntar(g, despues); else juntar(g, null);
    } else enBlanco(top);
    cambiado();
  };

  /* ---------- Enter dentro de una columna (lo llama screenplay.js) ---------- */
  /* salir de una columna: de la izquierda a la derecha; de la derecha, a una acción debajo del bloque */
  function salir(col) {
    const d = col.parentNode, cols = columnas(d);
    if (col === cols[0] && cols[1]) {
      const ps = parrafos(cols[1]);
      cursorEn(ps.find(vacio) || ps[0], !ps.some(vacio));
      return;
    }
    /* la derecha vacía del todo: el bloque vuelve a ser un diálogo normal */
    if (parrafos(col).every(vacio)) { D.separar(d); return; }
    let n = d.nextElementSibling;
    if (!(n && n.tagName === 'P' && vacio(n) && !n.classList.contains('ed-fijo'))) {
      n = document.createElement('p'); n.innerHTML = '<br>';
      d.after(n);
    }
    Array.from(n.classList).forEach(k => { if (k.startsWith('sp-')) n.classList.remove(k); });
    n.classList.add('sp-action');
    cursorEn(n, false);
    cambiado();
  }
  D.onEnter = function (e, block) {
    const col = D.col(block); if (!col || block.parentNode !== col) return false;
    const r = Ed.getRange(); if (!r || !r.collapsed) return false;
    const k = kind(block);
    if (!vacio(block) && !enBorde(block, r, true)) return false;       // a media línea: Chrome la parte y conserva el tipo
    e.preventDefault();
    if (vacio(block)) {
      /* una línea vacía (un paréntesis o un diálogo de más): se quita y se sale de la columna */
      if (parrafos(col).length > 1 && block !== parrafos(col)[0]) block.remove();
      salir(col);
      return true;
    }
    const sig = block.nextElementSibling;
    if (sig && sig.tagName === 'P' && vacio(sig)) { cursorEn(sig, false); return true; }   // el diálogo en blanco que ya estaba
    if (k === 'character' || k === 'paren') {
      Ed.cmd('insertParagraph');
      const r2 = Ed.getRange(), nb = r2 && Ed.closestBlock(r2.startContainer, editor());
      if (nb && nb !== block) { Ed.screenplay.aplicar(nb, 'dialogue'); Ed.setCaret(nb, 0); }
      cambiado();
      return true;
    }
    salir(col);
    return true;
  };

  /* ---------- Retroceso y Supr en los bordes ---------- */
  function onKeydown(e) {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    const ed = editor(), r = Ed.getRange();
    if (!ed || !r || !ed.contains(r.startContainer) || !ed.querySelector(':scope > .sp-doble')) return;
    if (!r.collapsed) return;                                       // las selecciones, en beforeinput
    const atras = e.key === 'Backspace';
    const b = Ed.closestBlock(r.startContainer, ed); if (!b) return;
    const col = D.col(b);
    const parar = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (col && b.parentNode === col) {
      const ps = parrafos(col), d = col.parentNode, cols = columnas(d);
      if (atras && b === ps[0] && enBorde(b, r, false)) {
        parar();
        if (col === cols[0]) {
          if (cols.every(c => parrafos(c).every(vacio))) {             // vacío del todo: fuera (en su lugar, una línea vacía)
            let p = d.nextElementSibling;
            if (p && p.tagName === 'P' && vacio(p)) d.remove();
            else { p = document.createElement('p'); p.innerHTML = '<br>'; d.replaceWith(p); }
            cursorEn(p, false); cambiado();
          } else { const prev = d.previousElementSibling; if (prev && !prev.classList.contains('ed-fijo')) cursorEn(prev, true); }
        } else if (ps.every(vacio)) D.separar(d);                      // la derecha vacía: un diálogo normal
        else cursorEn(parrafos(cols[0]).pop(), true);
        return;
      }
      if (!atras && b === ps[ps.length - 1] && enBorde(b, r, true)) { parar(); return; }   // no trae la columna de al lado
      return;
    }
    /* un bloque de primer nivel pegado a un diálogo doble: no se une con él */
    let top = elDe(r.startContainer); while (top && top.parentNode !== ed) top = top.parentNode;
    if (!top || top.parentNode !== ed) return;
    if (atras && top.previousElementSibling && top.previousElementSibling.classList.contains('sp-doble') && enBorde(top, r, false) && b === top) {
      parar();
      const d = top.previousElementSibling, fin = parrafos(columnas(d).pop()).pop();
      if (vacio(top) && top.nextElementSibling) { top.remove(); cambiado(); }
      cursorEn(fin, true);
      return;
    }
    if (!atras && top.nextElementSibling && top.nextElementSibling.classList.contains('sp-doble') && enBorde(top, r, true) && b === top) {
      parar();
      const d = top.nextElementSibling;
      if (vacio(top)) { top.remove(); cambiado(); cursorEn(parrafos(columnas(d)[0])[0], false); }
    }
  }

  /* ---------- selecciones que cruzan columnas ----------
     Se borra por tramos (una columna, lo de fuera) con execCommand, del último al primero, como los bloques fijos (fijos.js):
     el bloque se queda y cada columna conserva al menos su primera línea. Devuelve false si no cruza nada. */
  function tramosDe(r) {
    const dA = D.de(r.startContainer), dB = D.de(r.endContainer);
    if (!dA && !dB) return null;
    if (dA && dA === dB && D.col(r.startContainer) === D.col(r.endContainer)) return null;
    const tramos = [];
    const rango = (a, b) => { if (!a || !b) return; const t = document.createRange(); t.setStart(a[0], a[1]); t.setEnd(b[0], b[1]); if (!t.collapsed) tramos.push(t); };
    const ini = c => { const p = parrafos(c)[0]; return p ? [p, 0] : null; };
    const fin = c => { const p = parrafos(c).pop(); return p ? [p, p.childNodes.length] : null; };
    const S = [r.startContainer, r.startOffset], E = [r.endContainer, r.endOffset];
    const deColumnas = (d, desde, hasta) => {
      const cols = columnas(d);
      const i = desde ? cols.indexOf(D.col(desde[0])) : 0, j = hasta ? cols.indexOf(D.col(hasta[0])) : cols.length - 1;
      for (let k = Math.max(0, i); k <= j; k++) rango(k === i && desde ? desde : ini(cols[k]), k === j && hasta ? hasta : fin(cols[k]));
    };
    if (dA) deColumnas(dA, S, dA === dB ? E : null);
    if (dA !== dB) {
      /* lo de en medio, fuera de los dos */
      const a = dA ? dA.nextElementSibling : null, b = dB ? dB.previousElementSibling : null;
      const desde = dA ? (a && a !== dB ? [a, 0] : null) : S;
      const hasta = dB ? (b && b !== dA ? [b, b.childNodes.length] : null) : E;
      if (desde && hasta) rango(desde, hasta);
      if (dB) deColumnas(dB, null, E);
    }
    return tramos;
  }
  function borrarTramos(r) {
    const tramos = tramosDe(r); if (!tramos) return false;
    editor().focus({ preventScroll: true });
    for (let i = tramos.length - 1; i >= 0; i--) { Ed.restoreSelection(tramos[i]); Ed.cmd('delete'); }
    if (!tramos.length) { const c = r.cloneRange(); c.collapse(true); Ed.restoreSelection(c); }
    cambiado();
    return true;
  }
  D.borrarTramos = borrarTramos;

  /* ---------- reparar ---------- */
  function desenvolver(el) { while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el); el.remove(); }
  function nuevaCol(contenido) { const c = document.createElement('div'); c.className = 'sp-col'; c.innerHTML = contenido === undefined ? VACIA : contenido; return c; }
  function normalizar() {
    const ed = editor(); if (!ed || !ed.querySelector('.sp-doble, .sp-col')) return;
    let cambio = false;
    ed.querySelectorAll('.sp-doble').forEach(d => { if (d.parentNode !== ed) { desenvolver(d); cambio = true; } });   // uno dentro de otro
    ed.querySelectorAll('.sp-col').forEach(c => { if (!(c.parentNode && c.parentNode.classList && c.parentNode.classList.contains('sp-doble'))) { desenvolver(c); cambio = true; } });
    ed.querySelectorAll(':scope > .sp-doble').forEach(d => {
      /* lo suelto entre columnas va a la columna de antes (o al principio de la primera) */
      Array.from(d.childNodes).forEach(n => {
        if (esCol(n)) return;
        cambio = true;
        if (n.nodeType !== 1 && !String(n.nodeValue || '').trim()) { n.remove(); return; }
        let destino = n.previousSibling; while (destino && !esCol(destino)) destino = destino.previousSibling;
        const delante = !destino;
        if (!destino) destino = columnas(d)[0] || d.insertBefore(nuevaCol(''), n);
        let p = n;
        if (n.nodeType !== 1 || n.tagName !== 'P') { p = document.createElement('p'); p.className = 'sp-dialogue'; n.replaceWith(p); p.appendChild(n); }
        if (delante) destino.insertBefore(p, destino.firstChild); else destino.appendChild(p);
      });
      let cols = columnas(d);
      while (cols.length > 2) { const x = cols.pop(); while (x.firstChild) cols[1].appendChild(x.firstChild); x.remove(); cambio = true; }
      while (cols.length < 2) { d.appendChild(nuevaCol()); cols = columnas(d); cambio = true; }
      cols.forEach(c => {
        Array.from(c.childNodes).forEach(n => {
          if (n.nodeType === 1 && n.tagName === 'P') return;
          cambio = true;
          if (n.nodeType === 3 && !n.nodeValue.trim()) { n.remove(); return; }
          if (n.nodeType === 1 && n.tagName === 'BR') { n.remove(); return; }
          if (n.nodeType === 1 && /^(DIV|H[1-6]|BLOCKQUOTE)$/.test(n.tagName)) { const p = document.createElement('p'); p.className = 'sp-dialogue'; while (n.firstChild) p.appendChild(n.firstChild); n.replaceWith(p); return; }
          const p = document.createElement('p'); p.className = 'sp-dialogue'; n.replaceWith(p); p.appendChild(n);
        });
        if (!parrafos(c).length) { c.innerHTML = '<p class="sp-character"><br></p>'; cambio = true; }
      });
    });
    /* detrás del último diálogo doble tiene que haber dónde escribir */
    const ultimo = ed.lastElementChild;
    if (ultimo && ultimo.classList.contains('sp-doble')) { const p = document.createElement('p'); p.innerHTML = '<br>'; ed.appendChild(p); cambio = true; }
    if (cambio && Ed.afterChange) Ed.afterChange();
  }
  D.normalizar = normalizar;

  /* lo pegado: dentro de una columna no cabe otro diálogo doble (se deshace en sus párrafos), y fuera, uno a medias (el trozo
     de una columna que Chrome copia con sus envoltorios) tampoco */
  function limpiarPegado(htmlPegado) {
    if (!/sp-(doble|col)/.test(htmlPegado)) return htmlPegado;
    const r = Ed.getRange(), enCol = r && D.col(r.startContainer);
    const t = document.createElement('template'); t.innerHTML = htmlPegado;
    t.content.querySelectorAll('.sp-doble').forEach(d => {
      const cols = Array.from(d.children).filter(esCol);
      if (enCol || cols.length !== 2 || d.parentNode !== t.content) { cols.forEach(desenvolver); desenvolver(d); }
    });
    t.content.querySelectorAll('.sp-col').forEach(c => { if (!(c.parentNode && c.parentNode.classList && c.parentNode.classList.contains('sp-doble'))) desenvolver(c); });
    const caja = document.createElement('div'); caja.appendChild(t.content);
    return caja.innerHTML;
  }
  D.limpiarPegado = limpiarPegado;

  function iniciar() {
    const ed = editor(); if (!ed) return;
    ed.addEventListener('keydown', onKeydown, true);
    ed.addEventListener('beforeinput', e => {
      const t = e.inputType || '', r = Ed.getRange();
      if (!r || r.collapsed || !(t.startsWith('delete') || t.startsWith('insert')) || !ed.querySelector(':scope > .sp-doble')) return;
      if (t === 'insertFromPaste') return;                              // el pegado, en `paste`
      if (!tramosDe(r)) return;
      e.preventDefault();
      borrarTramos(r);
      if (t === 'insertText' && e.data) Ed.cmd('insertText', e.data);
      else if (t === 'insertParagraph') Ed.cmd('insertParagraph');
    }, true);
    ed.addEventListener('paste', () => { const r = Ed.getRange(); if (r && !r.collapsed && ed.querySelector(':scope > .sp-doble') && tramosDe(r)) borrarTramos(r); }, true);
    ed.addEventListener('dragstart', e => { const r = Ed.getRange(); if (r && !r.collapsed && tramosDe(r)) e.preventDefault(); }, true);
    const san = Ed.sanitizeHtml;
    Ed.sanitizeHtml = h => limpiarPegado(san(h));
    let pendiente = null;
    new MutationObserver(() => { if (pendiente) return; pendiente = setTimeout(() => { pendiente = null; normalizar(); }, 0); })
      .observe(ed, { childList: true, subtree: true });
    normalizar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(window.Ed);
