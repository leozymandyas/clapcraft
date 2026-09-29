/* Sustituir hijos de #editor en un solo paso de Deshacer (29-09-2026, revisión del editor).
   Tocar el DOM del editor fuera de execCommand deja el historial de Chrome huérfano: Cmd+Z deshace otra cosa o nada. Aquí vive
   **la única** manera de rehacer bloques de primer nivel con un `insertHTML`, que usan blocks.js, el tamaño de letra de editor.js,
   la recarga en sitio de texto.js (`Ed.sustituir`) y todo lo del guion (`Ed.screenplay.editar`: screenplay, characters, markdown,
   formato, slash, doble, recuadros, table).

   `Ed.reemplazar(orig, caja)`: pone en lugar de los hijos seguidos `orig` de #editor lo que hay en `caja` (un elemento cuyos hijos
   son lo nuevo), con **un solo insertHTML**. Lo que Chrome hace bien y lo que no (probado en Electron con cada vecino posible,
   29-09-2026: 768 combinaciones del guion y las operaciones de bloques):
   · Primero se recorta lo que no cambió (por delante y por detrás): cuanto más justo el rango, mejor.
   · El rango **empieza al principio de un párrafo** y **acaba al final de uno** (o dentro del último bloque): así Chrome sustituye
     limpio (la clase, la etiqueta, líneas de más o de menos). Si el primero no es un párrafo, se amplía hacia atrás hasta uno (que se
     vuelve a escribir tal cual); si el último no lo es, hasta el párrafo **con texto** de detrás.
   · Lo que falla: empezar en un título, un diálogo doble, un recuadro o una lista sin nada delante (Chrome se queda con su envoltorio
     y mete lo nuevo dentro: el rango desde (editor, 0) cae dentro del primer bloque) y acabar el HTML en un párrafo vacío justo detrás
     de un `div` (anidaba un <p> en otro) sin un párrafo detrás. Al principio se usa un **párrafo de sacrificio** (`p[data-sac]`):
     se pone a mano delante del tramo, el rango empieza en él y el insertHTML se lo lleva (igual detrás, si el rango acabaría dentro
     de la línea vacía de un doble o un recuadro). Deshacer lo devuelve (Chrome repone lo que había justo antes del paso): se quita
     en el momento (`trasHistoria`) y se apunta; y como Rehacer lo necesita para colocar lo nuevo, se vuelve a poner justo antes
     (`antesDeRehacer`, desde `execCommand('redo')` —el menú de la app, la cinta— y desde el `beforeinput` de Cmd+Mayús+Z). Quitar
     a mano un bloque que el paso tocó rompe su Deshacer (probado): por eso el párrafo vacío del final detrás de un `div` no se
     arregla con otro de sacrificio, sino escribiéndolo con un espacio de ancho cero (`zwFin`), que después vuelve a ser su <br>
     (lo de dentro de un bloque insertado sí se puede cambiar). Así **todo entra en Deshacer**, también en
     los bordes del documento.
   · Un bloque que no se edita (la portada y los fijos, una base de datos) no entra en el tramo por ampliarlo: el rango se para en él
     (Chrome no lo borra con insertHTML) y, si hace falta un párrafo, se usa el de sacrificio.
   Devuelve los hijos de #editor que corresponden a los de `caja`, en orden (los que no cambiaron son los mismos nodos).

   `Ed.sustituir(tocados, nuevos, op)` cambia los hijos de #editor desde el primero de `tocados` hasta el último por `nuevos`
   (elementos —se copia su HTML limpio— o cadenas de HTML) y devuelve los hijos nuevos que corresponden a `nuevos` (en orden).
   op.cursor: 'inicio' | 'fin' (del primero / último nuevo) o nada (donde lo deje Chrome). Con el documento acabando en un
   recuadro, un diálogo doble, una tabla o una base de datos, los dos ponen detrás la línea que recuadros.js y doble.js pondrían
   fuera del Deshacer (op.lineaFinal: false para no ponerla: la recarga en sitio de texto.js quiere el documento tal cual). */
(function (Ed) {
  'use strict';
  const ZW = /\u200B/g;
  const edDe = () => Ed.editor || document.getElementById('editor');
  const esP = n => !!n && n.nodeType === 1 && n.tagName === 'P' && n.getAttribute('contenteditable') !== 'false'
    && !n.classList.contains('ed-fijo') && !n.hasAttribute('data-sac');
  /* un bloque que no se edita (la portada y los fijos, una base de datos): el tramo no se amplía a través de él */
  const tope = n => !!n && n.nodeType === 1 && (n.getAttribute('contenteditable') === 'false' || n.classList.contains('ed-fijo') || n.classList.contains('db'));
  const conTexto = n => !!n && !!(n.textContent.replace(ZW, '').trim() || n.querySelector('img'));
  const vacioP = n => esP(n) && !conTexto(n);
  function ultimoBloque(el) {                                 // el bloque de más adentro y más al final (donde acaba el rango)
    let n = el;
    for (;;) { const k = n.lastElementChild; if (!k || !/^(DIV|P|H[1-6]|PRE|UL|OL|LI|BLOCKQUOTE|TABLE|TBODY|TR|TD|TH)$/.test(k.tagName) || k.getAttribute('contenteditable') === 'false') return n; n = k; }
  }

  /* el HTML que se guarda de un elemento: sin la marca de bloque elegido y, una base de datos, sin su interfaz */
  const limpiarEl = c => {
    const quitar = n => { n.classList.remove('blk-selected'); if (!n.classList.length) n.removeAttribute('class'); };
    if (c.classList) quitar(c);
    c.querySelectorAll('.blk-selected').forEach(quitar);
    if (c.classList && c.classList.contains('db')) { c.innerHTML = ''; c.classList.remove('selected'); if (!c.classList.length) c.removeAttribute('class'); }
    c.querySelectorAll('.db').forEach(d => { d.innerHTML = ''; d.classList.remove('selected'); });
    return c;
  };
  function htmlDe(x) {
    if (typeof x === 'string') return x;
    return limpiarEl(x.cloneNode(true)).outerHTML;
  }
  Ed.htmlLimpio = htmlDe;   // lo usa blocks.js para copiar bloques

  /* ---------- el párrafo de sacrificio y el historial ---------- */
  const SAC = 'data-sac';
  const nuevoSac = () => { const s = document.createElement('p'); s.setAttribute(SAC, ''); s.textContent = 'x'; return s; };
  /* espejo de la pila de Rehacer de Chrome: por cada Deshacer, los sacrificios que devolvió (o null). Rehacer saca el último. */
  const pila = [];
  function quitarSacs(apuntar) {
    const ed = edDe(); if (!ed) return null;
    const sacs = Array.from(ed.querySelectorAll('[' + SAC + ']'));
    if (!sacs.length) return null;
    const sel = window.getSelection();
    const r = sel.rangeCount ? sel.getRangeAt(0) : null;
    const tocaSel = r && sacs.some(s => s.contains(r.startContainer) || s.contains(r.endContainer));
    const lista = sacs.map(s => ({ nodo: s, padre: s.parentNode, sig: s.nextSibling, prev: s.previousSibling }));
    /* la selección que Chrome repone es la del paso (del principio del de delante al final del de detrás): se deja en lo de verdad */
    let ini = null, fin = null;
    if (tocaSel) {
      const primero = lista[0], ultimo = lista[lista.length - 1];
      const a = s => s && s.nodeType === 1 && !s.hasAttribute(SAC) ? s : null;
      ini = a(primero.sig) || a(primero.prev); fin = a(ultimo.prev) || a(ultimo.sig);
    }
    sacs.forEach(s => s.remove());
    if (tocaSel && ini) {
      const rr = document.createRange();
      try { rr.setStart(ini, 0); if (fin && fin !== ini && (ini.compareDocumentPosition(fin) & Node.DOCUMENT_POSITION_FOLLOWING)) rr.setEnd(fin, fin.childNodes.length); else rr.collapse(true); sel.removeAllRanges(); sel.addRange(rr); } catch (_) {}
    }
    return apuntar ? lista : null;
  }
  function trasHistoria(tipo) {
    if (tipo === 'undo') pila.push(quitarSacs(true));
    else quitarSacs(false);
  }
  function antesDeRehacer() {
    const e = pila.pop();
    if (!e) return;
    /* se ponen en el orden en que estaban: el de delante antes de su siguiente; el de detrás, tras su anterior */
    e.forEach(x => {
      if (x.nodo.isConnected) return;
      if (!x.padre || !x.padre.isConnected) return;
      if (x.sig && x.sig.parentNode === x.padre) x.padre.insertBefore(x.nodo, x.sig);
      else if (x.prev && x.prev.parentNode === x.padre) x.prev.after(x.nodo);
      else if (!x.prev) x.padre.prepend(x.nodo);
      else if (!x.sig) x.padre.appendChild(x.nodo);
    });
  }
  let rehaciendo = false;
  const exec = document.execCommand;
  document.execCommand = function (c) {
    const n = String(c || '').toLowerCase();
    if (n === 'redo') {
      if (!document.queryCommandEnabled('redo')) return exec.apply(document, arguments);
      rehaciendo = true;
      try { antesDeRehacer(); return exec.apply(document, arguments); } finally { rehaciendo = false; quitarSacs(false); }
    }
    return exec.apply(document, arguments);
  };
  window.addEventListener('beforeinput', e => {
    if (e.inputType === 'historyRedo' && !rehaciendo && document.queryCommandEnabled('redo')) antesDeRehacer();
  }, true);
  window.addEventListener('input', e => {
    const t = e.inputType;
    if (t === 'historyUndo') trasHistoria('undo');
    else if (t === 'historyRedo') trasHistoria('redo');
    else if (t) { pila.length = 0; quitarSacs(false); }       // un paso nuevo vacía la pila de Rehacer (y se lleva el sacrificio de detrás)
  }, true);

  /* ---------- el núcleo ---------- */
  const FINAL = 'div[data-rc], .rc, .sp-doble, table, .db';
  function reemplazar(orig, caja, op) {
    op = op || {};
    const ed = edDe();
    const nuevos = Array.from(caja.children);
    let a = 0, z = 0;
    const h = htmlDe;
    while (a < orig.length && a < nuevos.length && h(orig[a]) === h(nuevos[a])) a++;
    while (z < orig.length - a && z < nuevos.length - a && h(orig[orig.length - 1 - z]) === h(nuevos[nuevos.length - 1 - z])) z++;
    if (a === orig.length && a === nuevos.length) return orig.slice();                 // nada cambió
    const pre = orig.slice(0, a), post = orig.slice(orig.length - z);
    const A = orig.slice(a, orig.length - z), N = nuevos.slice(a, nuevos.length - z);
    const kids = Array.from(ed.children);
    let pos = kids.indexOf(orig[0]) + a;                         // dónde empieza lo que se cambia
    const fuera = [0, 0];                                        // vecinos de fuera de `orig` metidos en el rango (delante, detrás)
    const izq = () => (pre.length ? pre[pre.length - 1] : kids[pos - 1]) || null;
    const der = () => (post.length ? post[0] : kids[pos + A.length]) || null;
    const masIzq = () => {
      const k = izq(); if (!k || tope(k)) return false;
      if (pre.length) { A.unshift(pre.pop()); N.unshift(nuevos[--a]); }
      else { A.unshift(k); N.unshift(k.cloneNode(true)); fuera[0]++; }
      pos--; return true;
    };
    const masDer = () => {
      const k = der(); if (!k || tope(k)) return false;
      if (post.length) { A.push(post.shift()); N.push(nuevos[nuevos.length - z]); z--; }
      else { A.push(k); N.push(k.cloneNode(true)); fuera[1]++; }
      return true;
    };
    /* sin nada que quitar o nada que poner (una línea nueva, una línea que se va), se toma un párrafo de al lado */
    if (!A.length || !N.length) {
      if (esP(der())) masDer(); else if (esP(izq())) masIzq(); else if (!masDer()) masIzq();
    }
    while (A.length && !esP(A[0]) && masIzq());
    /* si lo nuevo acaba el documento en un recuadro, un diálogo doble, una tabla o una base de datos, detrás va ya la línea en
       blanco que pondrían los `normalizar` de recuadros.js y doble.js: puesta a mano después, fuera del paso, rompía su Deshacer */
    const ultN = N[N.length - 1];
    if (op.lineaFinal !== false && !der() && ultN && ultN.nodeType === 1 && ultN.matches(FINAL)) {
      const p = document.createElement('p'); p.innerHTML = '<br>'; N.push(p); fuera[1]++;
    }
    const sacIni = !A.length || !esP(A[0]);
    let sacFin = false, zwFin = false;
    for (;;) {
      const u = A[A.length - 1], nu = N[N.length - 1], np = N[N.length - 2];
      const finVacio = !!u && !esP(u) && !conTexto(ultimoBloque(u));     // acabaría dentro de una línea vacía de un doble o un recuadro
      if (u && !esP(u) && esP(der()) && (conTexto(der()) || finVacio)) { if (masDer()) continue; }
      /* un párrafo vacío al final justo detrás de un diálogo doble o un recuadro: Chrome lo anidaba; con otro detrás, no. Sin
         otro, esa línea va con un espacio de ancho cero en lugar del <br> (así no lo anida) y en cuanto entra se le devuelve */
      zwFin = false;
      if (nu && vacioP(nu) && np && np.tagName === 'DIV') { if (masDer()) continue; zwFin = true; }
      /* acabar dentro de la línea vacía de un doble o un recuadro sin un párrafo detrás: el rango acaba en uno de sacrificio */
      if (finVacio) { if (masDer()) continue; sacFin = true; }
      break;
    }
    /* sin nada que poner y sin nada al lado (el documento entero se va): una línea en blanco */
    if (!N.length) { const p = document.createElement('p'); p.innerHTML = '<br>'; N.push(p); }
    const ultimo = A[A.length - 1];
    const t = document.createElement('div');
    t.innerHTML = N.map(n => typeof n === 'string' ? n : n.outerHTML).join('');
    Array.from(t.children).forEach(limpiarEl);
    if (zwFin) t.lastElementChild.innerHTML = '\u200B';
    const html = t.innerHTML;
    const cuantos = t.children.length;

    ed.focus({ preventScroll: true });
    const r = document.createRange();
    if (sacIni) {
      const s = nuevoSac();
      if (A.length) A[0].before(s); else if (kids[pos]) kids[pos].before(s); else ed.appendChild(s);
      r.setStart(s, 0);
      if (!A.length && !sacFin) r.setEnd(s, s.childNodes.length);
    } else r.setStart(A[0], 0);
    if (sacFin) {
      const s = nuevoSac();
      const tras = A.length ? A[A.length - 1] : ed.querySelector('[' + SAC + ']');
      tras.after(s);
      r.setEnd(s, s.childNodes.length);
    } else if (A.length) {
      if (esP(ultimo)) r.setEnd(ultimo, ultimo.childNodes.length);
      else { const u = ultimoBloque(ultimo); r.setEnd(u, u.childNodes.length); }
    }
    Ed.restoreSelection(r);
    Ed.cmd('insertHTML', html);
    quitarSacs(false);
    if (Ed.db && /class="[^"]*\bdb\b/.test(html)) Ed.db.mountAll();
    const hechos = Array.from(ed.children).slice(pos, pos + cuantos);
    /* y el espacio de ancho cero vuelve a ser un <br>: cambiar lo de dentro de un bloque que el paso insertó no le estorba a
       Deshacer (lo quita entero) ni a Rehacer (pone el mismo nodo, ya con su <br>); quitar o poner bloques a mano, sí */
    const zp = zwFin && hechos[hechos.length - 1];
    if (zp && zp.tagName === 'P' && zp.textContent === '\u200B') {
      const sel = window.getSelection(), dentro = sel.rangeCount && zp.contains(sel.getRangeAt(0).startContainer);
      zp.replaceChildren(document.createElement('br'));
      if (dentro) { const rr = document.createRange(); rr.setStart(zp, 0); rr.collapse(true); sel.removeAllRanges(); sel.addRange(rr); }
    }
    Ed.sustituir.ultimo = { sacIni, sacFin, zwFin, rango: A.length };      // (para las pruebas)
    if (hechos.length !== cuantos || hechos.some((n, i) => n.tagName !== t.children[i].tagName))
      console.warn('Ed.reemplazar: lo que dejó Chrome no es lo que se pidió', html);
    return pre.concat(hechos.slice(fuera[0], hechos.length - fuera[1]), post);
  }
  Ed.reemplazar = reemplazar;

  Ed.sustituir = function (tocados, nuevos, op) {
    op = op || {};
    const ed = edDe();
    tocados = (tocados || []).filter(n => n && n.parentNode === ed);
    nuevos = nuevos || [];
    if (!ed || !tocados.length) return [];
    const kids = Array.from(ed.children);
    tocados.sort((a, b) => kids.indexOf(a) - kids.indexOf(b));
    const i = kids.indexOf(tocados[0]), j = kids.indexOf(tocados[tocados.length - 1]);
    const orig = kids.slice(i, j + 1);
    const caja = document.createElement('div');
    caja.innerHTML = nuevos.map(htmlDe).join('');
    const cuantos = caja.children.length;
    const todos = reemplazar(orig, caja, { lineaFinal: op.lineaFinal });
    const hechos = todos.slice(0, cuantos);
    const poner = (n, fin) => {
      if (!n) return;
      const rr = document.createRange();
      rr.selectNodeContents(n); rr.collapse(!fin);
      Ed.restoreSelection(rr);
    };
    const antes = i > 0 ? kids[i - 1] : null, despues = todos.length ? todos[todos.length - 1].nextElementSibling : kids[j + 1];
    if (op.cursor === 'inicio') poner(hechos[0] || despues || antes, false);
    else if (op.cursor === 'fin') poner(hechos[hechos.length - 1] || antes || despues, true);
    return hechos;
  };
  Ed.sustituir.ultimo = null;

  /* Cambiar un bloque por HTML nuevo conservando el cursor por su posición en el texto (tipo de guion, lista…) */
  Ed.sustituirBloque = function (bloque, html, offset) {
    const hechos = Ed.sustituir([bloque], [html]);
    const n = hechos[0];
    if (n && offset != null && Ed.setCaretText) Ed.setCaretText(n, offset);
    else if (n) { const r = document.createRange(); r.selectNodeContents(n); r.collapse(false); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
    return n;
  };

  /* poner el cursor en la posición `offset` del texto de un elemento (cuenta caracteres, no hijos) */
  Ed.setCaretText = function (el, offset) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n, resto = Math.max(0, offset | 0), ultimo = null;
    while ((n = w.nextNode())) {
      ultimo = n;
      if (resto <= n.length) { const r = document.createRange(); r.setStart(n, resto); r.collapse(true); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); return; }
      resto -= n.length;
    }
    const r = document.createRange();
    if (ultimo) r.setStart(ultimo, ultimo.length); else r.setStart(el, 0);
    r.collapse(true); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  };

  /* la posición del cursor dentro de un elemento, contada en caracteres de su texto */
  Ed.caretTextOffset = function (el) {
    const s = window.getSelection();
    if (!s.rangeCount || !el.contains(s.anchorNode)) return null;
    const r = document.createRange(); r.selectNodeContents(el); r.setEnd(s.anchorNode, s.anchorOffset);
    return r.toString().length;
  };
})(window.Ed);
