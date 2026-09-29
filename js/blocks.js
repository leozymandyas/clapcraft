/* Bloques estilo Notion: asa lateral (insertar, arrastrar, menú), selección múltiple de bloques
   (rectángulo, Esc, Mayús+clic, flechas) y operaciones sobre el grupo.
   Revisión del 29-09-2026 (Leo: «cuando selecciono bloques para eliminarlos, a veces borra otras cosas» y «luego no puedo
   hacer Command+Z»): todas las operaciones van por `Ed.sustituir` (un solo insertHTML: entran en Deshacer como un paso);
   una selección de texto que cruza bloques ya no se convierte en selección de bloques; la selección de bloques se suelta
   al deshacer, al cargar otro documento o en cuanto vuelve a haber un cursor en el editor; y Esc en un elemento de una lista,
   una fila de una tabla o un párrafo de un recuadro elige solo eso (un segundo Esc, lo que lo contiene). */
(function (Ed) {
  'use strict';
  const B = {};
  Ed.blocks = B;
  /* Lo que añade quien use el editor al menú del asa (ClapCraft, 1.1.52: «Copiar enlace para Claude»):
     { etiqueta, ejecutar(bloques), visible() }. index.html a solas no pone nada. */
  B.extras = [];
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const editor = () => Ed.editor;
  const changed = () => { if (Ed.afterChange) Ed.afterChange(); };

  let handle, drop, menu, marquee, current = null;
  let selected = [];          /* bloques (o elementos de uno: li, tr, párrafo de un recuadro) elegidos, en orden de documento */
  let antesEsc = null;        /* dónde estaba el cursor al pulsar Esc: una tecla lo devuelve ahí */
  let dragging = false;

  /* ---------- utilidades ---------- */
  const topBlock = node => {
    let n = node && node.nodeType === 3 ? node.parentNode : node;
    while (n && n.parentNode !== editor()) n = n.parentNode;
    return n && n.parentNode === editor() ? n : null;
  };
  B.topBlock = topBlock;
  const kids = () => Array.from(editor().children);
  const interior = b => !!b && b.parentNode !== editor();
  const ordenar = l => l.slice().sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
  const conectados = () => (selected = selected.filter(b => b.isConnected && editor().contains(b)));
  const rangoEnEditor = () => { const s = window.getSelection(); return !!(s && s.rangeCount && editor().contains(s.getRangeAt(0).startContainer)); };
  /* el camino de índices de un nodo dentro de su bloque (para encontrarlo en una copia o en el bloque rehecho) */
  const camino = (n, top) => { const c = []; while (n && n !== top) { c.unshift(Array.prototype.indexOf.call(n.parentNode.children, n)); n = n.parentNode; } return c; };
  const seguir = (top, c) => { let n = top; for (const i of c) n = n && n.children[i]; return n || null; };

  function caretInto(block, atEnd) {
    if (!block || !block.isConnected) return;
    if (block.classList && block.classList.contains('db')) { const n = block.querySelector('.db-title'); if (n) n.focus(); return; }
    const target = block.matches('ul, ol') ? (atEnd ? $$('li', block).pop() : block.querySelector('li')) || block
      : block.matches('table, tr') ? (atEnd ? $$('td, th', block).pop() : block.querySelector('td, th')) || block : block;
    if (target.tagName === 'HR') return;
    editor().focus({ preventScroll: true });
    const r = document.createRange();
    r.selectNodeContents(target);
    r.collapse(!atEnd);
    Ed.restoreSelection(r);
  }
  function blockFromSelection() {
    const r = Ed.getRange();
    if (!r || !editor().contains(r.startContainer)) return null;
    return topBlock(r.startContainer);
  }
  /* lo que elige Esc: el elemento de la lista, la fila de la tabla o el párrafo del recuadro donde está el cursor; si no, el bloque */
  function itemDe(node) {
    const top = topBlock(node); if (!top) return null;
    const n = node.nodeType === 3 ? node.parentNode : node;
    if (top.matches('ul, ol')) { const li = n.closest && n.closest('li'); return li && top.contains(li) ? li : top; }
    if (top.matches('table')) { const tr = n.closest && n.closest('tr'); return tr && top.contains(tr) ? tr : top; }
    if (top.matches('div[data-rc]')) { let c = n; while (c && c.parentNode !== top) c = c.parentNode; return c && c.nodeType === 1 ? c : top; }
    return top;
  }
  /* posiciones (en caracteres del texto) del principio y el final de un rango dentro de un elemento, y al revés */
  function offsetsDe(el, r) {
    const pos = (n, o) => { const x = document.createRange(); x.selectNodeContents(el); try { x.setEnd(n, o); } catch (_) { return 0; } return x.toString().length; };
    return { a: el.contains(r.startContainer) ? pos(r.startContainer, r.startOffset) : 0, z: el.contains(r.endContainer) ? pos(r.endContainer, r.endOffset) : 0 };
  }
  function puntoEn(el, off) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n, resto = Math.max(0, off), ultimo = null;
    while ((n = w.nextNode())) { ultimo = n; if (resto <= n.length) return [n, resto]; resto -= n.length; }
    return ultimo ? [ultimo, ultimo.length] : [el, 0];
  }
  function ponerOffsets(el, o) {
    if (!el) return;
    editor().focus({ preventScroll: true });
    const r = document.createRange();
    r.setStart(...puntoEn(el, o.a)); r.setEnd(...puntoEn(el, o.z));
    Ed.restoreSelection(r);
  }
  function rel(rect) {
    const z = Ed.page.state.zoom || 1;
    const w = $('#pageWrap').getBoundingClientRect();
    return { left: (rect.left - w.left) / z, top: (rect.top - w.top) / z, width: rect.width / z, height: rect.height / z };
  }
  /* con las sugerencias de personajes o de formato abiertas, Esc es para cerrarlas (antes seleccionaba el bloque y el editor
     se quedaba sin cursor: el Enter siguiente no hacía nada) */
  const anyMenuOpen = () => ['#ctxMenu', '#colorPop', '.tbl-menu', '.db-pop', '.blk-menu', '.slash-menu', '.char-menu', '.rc-menu']
    .some(s => Array.from(document.querySelectorAll(s)).some(el => !el.hidden));

  /* ---------- selección de bloques ---------- */
  B.selected = () => conectados().slice();
  /* quitar la marca sin dejar un class="" (Deshacer devolvería el bloque así y el documento cambiaría) */
  const quitarMarca = x => { x.classList.remove('blk-selected'); if (!x.classList.length) x.removeAttribute('class'); };
  function setSelection(blocks, keepCaret) {
    $$('.blk-selected', editor()).forEach(quitarMarca);
    antesEsc = null;
    const lista = [...new Set(blocks || [])].filter(b => b && b.nodeType === 1 && b.isConnected && b !== editor() && editor().contains(b)
      && !b.classList.contains('ed-fijo'));   // los bloques fijos (fijos.js) no se seleccionan
    selected = ordenar(lista);
    selected.forEach(b => b.classList.add('blk-selected'));
    if (selected.length && !keepCaret) {
      const sel = window.getSelection();
      if (sel) sel.removeAllRanges();
      if (document.activeElement && document.activeElement !== document.body && !document.activeElement.closest('.topbar, .find-panel, .focus-bar')) document.activeElement.blur();
    }
  }
  B.select = blocks => setSelection(blocks);
  /* soltar la selección de bloques (lo llaman loadDocument, Deshacer y, en ClapCraft, `historia()` antes de deshacer) */
  B.clear = () => { setSelection([], true); if (current && !current.isConnected) hide(); };
  function selectRange(a, b) {
    if (interior(a) && interior(b) && a.parentNode === b.parentNode) {
      const hermanos = Array.from(a.parentNode.children);
      let i = hermanos.indexOf(a), j = hermanos.indexOf(b);
      if (i > j) [i, j] = [j, i];
      setSelection(hermanos.slice(i, j + 1));
      return;
    }
    a = topBlock(a); b = topBlock(b);
    const order = kids();
    let i = order.indexOf(a), j = order.indexOf(b);
    if (i < 0 || j < 0) return;
    if (i > j) [i, j] = [j, i];
    setSelection(order.slice(i, j + 1));
  }
  function selectBlock(b) { if (b) setSelection([b]); }
  /* salir de la selección de bloques devolviendo el cursor adonde estaba antes de Esc (o al bloque) */
  function soltar(first, alFinal) {
    const r = antesEsc && antesEsc.startContainer.isConnected && editor().contains(antesEsc.startContainer) ? antesEsc : null;
    setSelection([], true);
    if (r) { editor().focus({ preventScroll: true }); Ed.restoreSelection(r); return true; }
    caretInto(first, alFinal);
    return false;
  }

  /* ---------- asa ---------- */
  function build() {
    const wrap = $('#pageWrap');
    handle = document.createElement('div');
    handle.className = 'blk-handle';
    handle.hidden = true;
    handle.innerHTML = '<button type="button" class="blk-add" title="Insertar un bloque debajo">+</button><button type="button" class="blk-grip" title="Arrastrar para mover · clic para opciones">⋮⋮</button>';
    drop = document.createElement('div');
    drop.className = 'blk-drop';
    drop.hidden = true;
    marquee = document.createElement('div');
    marquee.className = 'blk-marquee';
    marquee.hidden = true;
    wrap.append(handle, drop);
    document.body.appendChild(marquee);
    menu = document.createElement('div');
    menu.className = 'ctx-menu blk-menu';
    menu.hidden = true;
    document.body.appendChild(menu);

    handle.addEventListener('mousedown', e => e.preventDefault());
    $('.blk-add', handle).addEventListener('click', () => { if (current) insertBelow(current); });
    setupGripDrag($('.blk-grip', handle));

    menu.addEventListener('mousedown', e => e.preventDefault());
    menu.addEventListener('click', e => {
      const b = e.target.closest('[data-op]'); if (!b) return;
      const op = b.dataset.op, arg = b.dataset.arg;
      let targets = conectados().length ? selected.slice() : (current ? [current] : []);
      if (targets.some(interior)) targets = [...new Set(targets.map(topBlock))];   // el asa es de bloques enteros
      closeMenu();
      if (!targets.length) return;
      /* en un recuadro (js/recuadros.js): los bloques elegidos, juntos, en uno */
      if (op === 'convert' && /^rc:/.test(arg)) { setSelection([], true); if (Ed.recuadros) Ed.recuadros.envolver(targets.filter(t => !t.matches('div[data-rc]')), arg === 'rc:prompt' ? { rc: 'prompt' } : { rc: 'aviso', tipo: 'note' }); }
      else if (op === 'convert') convertAll(targets, arg);
      else if (op === 'dup') duplicateAll(targets);
      else if (op === 'up') moveGroup(targets, -1);
      else if (op === 'down') moveGroup(targets, 1);
      else if (op === 'del') removeAll(targets);
      else if (op === 'separar' && Ed.doble) { setSelection([], true); targets.filter(t => t.matches('.sp-doble')).forEach(t => Ed.doble.separar(t)); }
      else if (op === 'sacar' && Ed.recuadros) { setSelection([], true); targets.filter(t => t.matches('div[data-rc]')).reverse().forEach(t => Ed.recuadros.quitar(t)); }
      else if (op === 'extra') { const x = B.extras[+arg]; if (x) x.ejecutar(targets); }
    });
    document.addEventListener('mousedown', e => {
      if (!menu.hidden && !(e.target.closest && e.target.closest('.blk-menu, .blk-grip'))) closeMenu(true);
    });

    const ws = $('#workspace');
    /* el asa acompaña a la línea en la que se escribe (no al ratón) y se queda a la vista; y si vuelve a haber un cursor en el
       editor (un clic, Deshacer, otro documento), la selección de bloques se suelta: si no, un Retroceso después borraba un
       bloque que ya no se veía elegido */
    document.addEventListener('selectionchange', () => {
      if (selected.length && !dragging && !marqueeActive && rangoEnEditor()) setSelection([], true);
      if (dragging || marqueeActive || anyMenuOpen()) return;
      const b = blockFromSelection();
      if (b && b.tagName !== 'HR') { current = b; place(b); }
    });
    ws.addEventListener('scroll', () => { if (current) place(current); });
    editor().addEventListener('input', () => { if (current) requestAnimationFrame(() => current && current.isConnected ? place(current) : hide()); });
    /* Deshacer / Rehacer: lo que se vuelva a ver no está elegido */
    const alHistorial = e => { if (/^history/.test(e.inputType || '') && selected.length) setSelection([], true); };
    editor().addEventListener('beforeinput', alHistorial);
    editor().addEventListener('input', alHistorial);
    window.addEventListener('resize', () => current && place(current));
    /* el asa se coloca por posición: si el documento se recoloca sin que cambie la selección (cambia el ancho de
       la hoja, se cargan las fuentes, las páginas empujan un bloque), se quedaba a una línea de distancia */
    if (window.ResizeObserver) new ResizeObserver(() => { if (current) place(current); }).observe(editor());

    setupMarquee(ws);
    setupBodyDrag();
    /* seleccionar texto a través de varios bloques es **selección de texto** (antes se convertía en selección de bloques
       enteros y Supr, escribir o Cmd+B actuaban sobre los bloques); los bloques se eligen con Esc, el asa, el rectángulo y
       Mayús+clic cuando ya hay bloques elegidos */
    editor().addEventListener('mousedown', e => {
      const b = topBlock(e.target);
      if (b && selected.includes(b) && !e.shiftKey) return; /* arrastre del grupo */
      if (e.shiftKey && conectados().length) {
        const it = itemDe(e.target), a = selected[0];
        if (it) {
          e.preventDefault();
          if (interior(a) && interior(it) && it.parentNode === a.parentNode) selectRange(a, it); else selectRange(topBlock(a), topBlock(it));
          return;
        }
      }
      if (selected.length) setSelection([], true);
    });
    /* copiar y cortar bloques elegidos: en Electron Cmd+C / Cmd+X son del menú y la tecla no llega; llega el evento */
    const hayBloques = () => {
      if (!conectados().length) return false;
      const s = window.getSelection(); if (s && s.rangeCount && !s.isCollapsed) return false;   // una selección de texto manda
      const a = document.activeElement;
      return !(a && a !== document.body && a !== editor() && (a.matches('input, textarea, select') || (a.isContentEditable && !editor().contains(a))));
    };
    const alPortapapeles = cortar => e => {
      if (!hayBloques() || !e.clipboardData) return;
      e.preventDefault();
      const items = selected.slice();
      e.clipboardData.setData('text/html', htmlDeItems(items));
      e.clipboardData.setData('text/plain', items.map(b => (b.innerText || b.textContent || '').replace(/\u200B/g, '').replace(/\n+$/, '')).join('\n'));
      if (cortar) removeAll(items); else setSelection(items);
    };
    document.addEventListener('copy', alPortapapeles(false));
    document.addEventListener('cut', alPortapapeles(true));
    document.addEventListener('beforecopy', e => { if (hayBloques()) e.preventDefault(); });   // así la orden Copiar está disponible
    document.addEventListener('beforecut', e => { if (hayBloques()) e.preventDefault(); });
  }

  function place(b) {
    if (!b || !b.isConnected) { hide(); return; }
    const r = rel(b.getBoundingClientRect());
    const ed = rel(editor().getBoundingClientRect());
    const padLeft = parseFloat(getComputedStyle(editor()).paddingLeft) || 0;
    const cs = getComputedStyle(b);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2 || 20;
    handle.hidden = false;
    /* dentro de la hoja, en el margen izquierdo, pegada al contenido */
    handle.style.left = Math.max(ed.left + 4, ed.left + padLeft - 52) + 'px';
    handle.style.top = (r.top + Math.max(0, (Math.min(lh, r.height) - 22) / 2)) + 'px';
  }
  function hide() { if (dragging) return; handle.hidden = true; current = null; }
  B.reubicar = () => { if (current && !dragging) place(current); };

  /* ---------- operaciones (todas por Ed.sustituir: un paso de Deshacer) ---------- */
  function htmlDeItems(items) {
    const limpio = x => Ed.htmlLimpio ? Ed.htmlLimpio(x) : x.outerHTML;
    if (!items.length) return '';
    const p = items[0].parentNode;
    const html = items.map(limpio).join('');
    if (interior(items[0])) {
      if (p.matches('ul, ol')) return `<${p.tagName.toLowerCase()}>${html}</${p.tagName.toLowerCase()}>`;
      if (items[0].matches('tr')) return `<table><tbody>${html}</tbody></table>`;
    }
    return html;
  }
  function insertBelow(b) {
    setSelection([], true);
    const hechos = Ed.sustituir([b], [b, '<p><br></p>']);
    const p = hechos[1]; if (!p) return;
    editor().focus();
    Ed.setCaret(p, 0);
    /* el menú «/» sin escribir la «/» en el documento (si no, un segundo paso de Deshacer) */
    if (!(Ed.slash && Ed.slash.abrirAqui && Ed.slash.abrirAqui())) Ed.cmd('insertText', '/');
    current = p; place(p);
  }
  /* rehacer el bloque que contiene a unos elementos (li, tr, párrafos de un recuadro) con un cambio hecho en una copia;
     `cambiar(copias, copiaDelBloque)` devuelve los nodos de la copia que hay que elegir o donde poner el cursor */
  function rehacerInterior(items, cambiar) {
    const top = topBlock(items[0]); if (!top) return null;
    const cl = top.cloneNode(true);
    const copias = items.map(it => seguir(cl, camino(it, top)));
    if (copias.some(x => !x)) return null;
    const marcar = cambiar(copias, cl);
    if (marcar === false) return null;
    const caminos = (marcar || []).map(n => camino(n, cl));
    const hechos = Ed.sustituir([top], [cl]);
    const nuevo = hechos[0];
    return nuevo ? caminos.map(c => seguir(nuevo, c)).filter(Boolean) : [];
  }
  function removeInner(items) {
    const top = topBlock(items[0]); if (!top) return;
    const padre = camino(items[0].parentNode, top), primero = Array.prototype.indexOf.call(items[0].parentNode.children, items[0]);
    const idxTop = kids().indexOf(top);
    const cl = top.cloneNode(true);
    items.map(it => seguir(cl, camino(it, top))).forEach(n => n && n.remove());
    /* una lista anidada que se queda sin elementos también se va */
    $$('ul, ol', cl).forEach(l => { if (!l.querySelector('li')) l.remove(); });
    $$('tbody, thead', cl).forEach(t => { if (!t.querySelector('tr')) t.remove(); });
    const vacio = top.matches('ul, ol') ? !cl.querySelector('li') : top.matches('table') ? !cl.querySelector('tr') : !cl.children.length;
    setSelection([], true);
    const hechos = Ed.sustituir([top], vacio ? [] : [cl]);
    changed();
    if (vacio) { const k = kids(); caretInto(k[idxTop] || k[idxTop - 1], false); hide(); return; }
    const p = seguir(hechos[0], padre);
    const sig = p && (p.children[primero] || p.children[primero - 1]);
    caretInto(sig || hechos[0], false);
  }
  function removeAll(blocks) {
    blocks = ordenar(blocks.filter(b => b && b.isConnected));
    if (!blocks.length) return;
    if (interior(blocks[0])) { removeInner(blocks.filter(b => b.parentNode === blocks[0].parentNode)); return; }
    const ks = kids(), idx = blocks.map(b => ks.indexOf(b));
    /* una selección no seguida (un bloque fijo en medio) se borra por tramos, del último al primero */
    const tramos = [];
    blocks.forEach((b, n) => { if (n && idx[n] === idx[n - 1] + 1) tramos[tramos.length - 1].push(b); else tramos.push([b]); });
    setSelection([], true);
    for (let t = tramos.length - 1; t >= 0; t--) Ed.sustituir(tramos[t], []);
    changed();
    const k2 = kids();
    caretInto(k2[idx[0]] || k2[idx[0] - 1] || k2[k2.length - 1], false);
    hide();
  }
  function duplicateAll(blocks) {
    blocks = ordenar(blocks.filter(b => b && b.isConnected));
    if (!blocks.length) return;
    const conSel = blocks.length > 1 || selected.length > 0;
    if (interior(blocks[0])) {
      const mismos = blocks.filter(b => b.parentNode === blocks[0].parentNode);
      setSelection([], true);
      const nuevos = rehacerInterior(mismos, copias => { let ref = copias[copias.length - 1]; return copias.map(c => { const d = c.cloneNode(true); ref.after(d); ref = d; return d; }); });
      changed();
      if (nuevos && nuevos.length) setSelection(nuevos);
      return;
    }
    const last = blocks[blocks.length - 1];
    setSelection([], true);
    const hechos = Ed.sustituir([last], [last, ...blocks]);
    const copias = hechos.slice(1);
    changed();
    if (!copias.length) return;
    if (conSel) setSelection(copias); else caretInto(copias[0], false);
    current = copias[0]; place(copias[0]);
  }
  /* mover elementos de un bloque (li, tr, párrafos de un recuadro) entre sus hermanos */
  function moveInner(items, dir, cursor) {
    const mismos = items.filter(b => b.parentNode === items[0].parentNode);
    const conSel = selected.length > 0;
    let hecho = true;
    setSelection([], true);
    const nuevos = rehacerInterior(mismos, copias => {
      const sib = dir < 0 ? copias[0].previousElementSibling : copias[copias.length - 1].nextElementSibling;
      if (!sib) { hecho = false; return false; }
      if (dir < 0) copias.forEach(c => sib.before(c)); else copias.slice().reverse().forEach(c => sib.after(c));
      return copias;
    });
    if (!hecho || !nuevos) { if (conSel) setSelection(mismos); return false; }
    changed();
    if (cursor && nuevos[0]) ponerOffsets(nuevos[0], cursor); else setSelection(nuevos);
    if (nuevos[0]) nuevos[0].scrollIntoView({ block: 'nearest' });
    return true;
  }
  function moveGroup(blocks, dir, cursor) {
    blocks = ordenar(blocks.filter(b => b && b.isConnected));
    if (!blocks.length) return false;
    if (interior(blocks[0])) return moveInner(blocks, dir, cursor);
    const ks = kids();
    const i0 = ks.indexOf(blocks[0]), i1 = ks.indexOf(blocks[blocks.length - 1]);
    const sib = dir < 0 ? ks[i0 - 1] : ks[i1 + 1];
    if (!sib || sib.classList.contains('ed-fijo')) return false;     // nada pasa por encima de la portada ni de un bloque fijo
    const rango = ks.slice(i0, i1 + 1), otros = rango.filter(b => !blocks.includes(b));
    const conSel = selected.length > 0;
    setSelection([], true);
    const hechos = dir < 0 ? Ed.sustituir([sib, ...rango], [...blocks, sib, ...otros]) : Ed.sustituir([...rango, sib], [...otros, sib, ...blocks]);
    const movidos = dir < 0 ? hechos.slice(0, blocks.length) : hechos.slice(-blocks.length);
    changed();
    if (!movidos.length) return false;
    if (cursor) ponerOffsets(movidos[0], cursor);
    else if (conSel || blocks.length > 1) setSelection(movidos);
    else caretInto(movidos[0], false);
    current = movidos[0]; place(current);
    movidos[0].scrollIntoView({ block: 'nearest' });
    return true;
  }
  B.move = (b, dir) => moveGroup([b], dir);
  /* (para las pruebas: las operaciones tal como las llaman el teclado, el menú del asa y el arrastre) */
  B.ops = { removeAll: b => removeAll(b), duplicateAll: b => duplicateAll(b), moveGroup: (b, d) => moveGroup(b, d),
    moveGroupTo: (b, r, a) => moveGroupTo(b, r, a), convertAll: (b, to) => convertAll(b, to), insertBelow: b => insertBelow(b) };
  /* llevar unos bloques delante o detrás de otro (arrastre del asa); devuelve los bloques ya colocados */
  function moveGroupTo(blocks, ref, before) {
    if (!ref || blocks.includes(ref) || !ref.isConnected) return null;
    if (before && ref.classList.contains('ed-fijo') && !ref.previousElementSibling) before = false;   // delante de la portada, no
    blocks = ordenar(blocks.filter(b => b.isConnected));
    const ks = kids();
    const idxs = [...blocks, ref].map(b => ks.indexOf(b));
    if (idxs.some(i => i < 0)) return null;
    const a = Math.min(...idxs), z = Math.max(...idxs);
    const rango = ks.slice(a, z + 1), sin = rango.filter(b => !blocks.includes(b));
    const pos = sin.indexOf(ref) + (before ? 0 : 1);
    const nuevo = [...sin.slice(0, pos), ...blocks, ...sin.slice(pos)];
    if (nuevo.every((b, i) => b === rango[i])) return blocks;
    const hechos = Ed.sustituir(rango, nuevo);
    changed();
    return hechos.slice(pos, pos + blocks.length);
  }

  const CONVERTS = [
    ['p', 'Texto'], ['h1', 'Título 1'], ['h2', 'Título 2'], ['h3', 'Título 3'], ['blockquote', 'Cita'], ['pre', 'Código'], ['ul', 'Lista con viñetas'], ['ol', 'Lista numerada'],
    /* los elementos de guion, los mismos que el menú «/» (Ed.screenplay.KINDS) */
    ...Ed.screenplay.KINDS.map(x => ['sp-' + x.id, x.label]),
    /* los recuadros (js/recuadros.js): envuelven los bloques elegidos */
    ['rc:prompt', 'Prompt'], ['rc:aviso', 'Aviso']
  ];
  const NO_CONVERTIBLE = 'table, hr, .db, .sp-doble, div[data-rc], .ed-fijo';
  /* lo que tiene un bloque, en renglones de HTML en línea (una lista, uno por elemento; una cita, uno por párrafo) */
  function lineasDe(b) {
    if (b.matches('ul, ol')) return $$('li', b).map(li => { const c = li.cloneNode(true); $$('ul, ol', c).forEach(n => n.remove()); return c.innerHTML; });
    if (b.matches('blockquote')) {
      const out = []; let suelto = '';
      b.childNodes.forEach(n => {
        if (n.nodeType === 1 && /^(P|H[1-6]|DIV|PRE)$/.test(n.tagName)) { if (suelto.trim()) out.push(suelto); suelto = ''; out.push(n.innerHTML); }
        else suelto += n.nodeType === 1 ? n.outerHTML : n.nodeType === 3 ? Ed.escapeHtml(n.nodeValue) : '';
      });
      if (suelto.trim() || !out.length) out.push(suelto);
      return out;
    }
    if (b.matches('pre')) return [Ed.escapeHtml(b.textContent).replace(/\n/g, '<br>')];
    return [b.innerHTML];
  }
  const textoDeHtml = h => { const t = document.createElement('div'); t.innerHTML = String(h).replace(/<br\s*\/?>/gi, '\n'); return t.textContent; };
  function comoBloque(b, to, html) {
    const el = document.createElement(to.startsWith('sp-') ? 'p' : to);
    if (b.matches('p, h1, h2, h3, h4, h5, h6')) {
      for (const at of Array.from(b.attributes)) if (!['class', 'data-ch', 'data-izq'].includes(at.name)) el.setAttribute(at.name, at.value);
      b.classList.forEach(k => { if (!k.startsWith('sp-') && k !== 'blk-selected') el.classList.add(k); });
      if (to === 'sp-character' && b.hasAttribute('data-ch')) el.setAttribute('data-ch', b.getAttribute('data-ch'));
    }
    if (to.startsWith('sp-')) el.classList.add(to);
    el.innerHTML = html || '<br>';
    if (!el.firstChild) el.innerHTML = '<br>';
    /* lo que deja de ser personaje pierde el chip del nombre y su color, como con S.set (screenplay.js, aplicarEn) */
    if (to !== 'sp-character') {
      el.querySelectorAll('.ch-nom').forEach(x => { while (x.firstChild) x.parentNode.insertBefore(x.firstChild, x); x.remove(); });
      el.style.removeProperty('--chl'); el.style.removeProperty('--chd'); if (!el.style.length) el.removeAttribute('style');
    }
    return el.outerHTML;
  }
  /* el HTML en que se convierte un bloque (null: ya es eso) */
  function convertido(b, to) {
    const tag = b.tagName.toLowerCase();
    if (b.matches('ul, ol') && (to === 'ul' || to === 'ol')) return tag === to ? null : `<${to}>${b.innerHTML}</${to}>`;
    if (b.matches('blockquote') && to === 'blockquote') return null;
    if (b.matches('pre') && to === 'pre') return null;
    const sp = Array.from(b.classList).find(k => k.startsWith('sp-'));
    if (b.matches('p, h1, h2, h3, h4, h5, h6') && (to.startsWith('sp-') ? sp === to && tag === 'p' : tag === to && !sp)) return null;
    /* un párrafo o un título que pasa a texto o a un elemento de guion: lo mismo que hace S.set (Tab, Ctrl+1…6, el menú «/») */
    const S = Ed.screenplay;
    if ((to === 'p' || to.startsWith('sp-')) && b.matches('p, h1, h2, h3, h4, h5, h6') && S && S.aplicarEn) {
      const c = b.cloneNode(true); c.classList.remove('blk-selected'); if (!c.classList.length) c.removeAttribute('class');
      const hecho = S.aplicarEn(c, to === 'p' ? null : to.slice(3));
      if (hecho) return hecho.outerHTML;
    }
    const lineas = lineasDe(b);
    if (to === 'ul' || to === 'ol') return `<${to}>` + lineas.map(h => `<li>${h || '<br>'}</li>`).join('') + `</${to}>`;
    if (to === 'blockquote') return '<blockquote>' + lineas.map(h => `<p>${h || '<br>'}</p>`).join('') + '</blockquote>';
    if (to === 'pre') { const t = lineas.map(textoDeHtml).join('\n'); return '<pre>' + (Ed.escapeHtml(t) || '<br>') + '</pre>'; }
    return lineas.map(h => comoBloque(b, to, h)).join('');
  }
  function convertAll(targets, to) {
    targets = ordenar(targets.filter(t => t && t.isConnected && t.parentNode === editor() && !t.matches(NO_CONVERTIBLE)));
    const cambios = new Map();
    targets.forEach(t => { const h = convertido(t, to); if (h != null) cambios.set(t, h); });
    if (!cambios.size) { if (targets.length > 1) setSelection(targets); return; }
    const ks = kids(), lista = [...cambios.keys()];
    const rango = ks.slice(ks.indexOf(lista[0]), ks.indexOf(lista[lista.length - 1]) + 1);
    setSelection([], true);
    const hechos = Ed.sustituir(rango, rango.map(b => cambios.has(b) ? cambios.get(b) : b));
    changed();
    if (targets.length > 1) setSelection(hechos); else caretInto(hechos[0], false);
    if (Ed.updateToolbar) Ed.updateToolbar();
  }

  function openMenu(anchor) {
    const targets = selected.length ? selected : (current ? [current] : []);
    if (!targets.length) return;
    const convertible = targets.some(b => !b.matches(NO_CONVERTIBLE));
    const dobles = targets.some(b => b.matches('.sp-doble'));   // un diálogo doble no se convierte: se separa (js/doble.js)
    const recuadros = targets.some(b => b.matches('div[data-rc]'));   // un recuadro tampoco: se quita (js/recuadros.js)
    const n = targets.length;
    let html = n > 1 ? `<div class="ctx-title">${n} bloques seleccionados</div>` : '';
    if (convertible) html += '<div class="ctx-title">Convertir en</div><div class="blk-convert">' + CONVERTS.map(([v, l]) => `<button type="button" data-op="convert" data-arg="${v}"><span>${l}</span></button>`).join('') + '</div><hr>';
    if (dobles) html += '<button type="button" data-op="separar"><span>Separar el diálogo doble</span></button><hr>';
    if (recuadros) html += '<button type="button" data-op="sacar"><span>Quitar el recuadro</span></button><hr>';
    html += `<button type="button" data-op="dup"><span>Duplicar</span><kbd>Ctrl+D</kbd></button>
      <button type="button" data-op="up"><span>Mover arriba</span><kbd>Ctrl+Shift+↑</kbd></button>
      <button type="button" data-op="down"><span>Mover abajo</span><kbd>Ctrl+Shift+↓</kbd></button><hr>`;
    const extras = B.extras.map((x, i) => (!x.visible || x.visible() ? `<button type="button" data-op="extra" data-arg="${i}"><span>${Ed.escapeHtml(x.etiqueta)}</span></button>` : '')).join('');
    if (extras) html += extras + '<hr>';
    html += `<button type="button" data-op="del" class="danger"><span>Eliminar</span><kbd>Supr</kbd></button>`;
    menu.innerHTML = html;
    menu.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(4, Math.min(r.right + 6, window.innerWidth - w - 4)) + 'px';
    menu.style.top = Math.max(4, Math.min(r.top, window.innerHeight - h - 4)) + 'px';
  }
  function closeMenu(clearSel) { menu.hidden = true; if (clearSel) setSelection([], true); }

  /* ---------- arrastre desde el asa (mueve el grupo si el bloque está seleccionado) ---------- */
  let dragBlocks = [], dropTarget = null, dropBefore = true;
  function dragUpdate(clientY) {
    const others = kids().filter(k => !dragBlocks.includes(k));
    dropTarget = null;
    for (const k of others) {
      const r = k.getBoundingClientRect();
      if (clientY < r.top + r.height / 2) { dropTarget = k; dropBefore = true; break; }
      dropTarget = k; dropBefore = false;
    }
    if (!dropTarget) { drop.hidden = true; return; }
    const tr = rel(dropTarget.getBoundingClientRect());
    const ed = rel(editor().getBoundingClientRect());
    const cs = getComputedStyle(editor());
    const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
    drop.hidden = false;
    drop.style.left = (ed.left + padL) + 'px';
    drop.style.width = (ed.width - padL - padR) + 'px';
    drop.style.top = ((dropBefore ? tr.top : tr.top + tr.height) - 2) + 'px';
    const ws = $('#workspace'); const wr = ws.getBoundingClientRect();
    if (clientY < wr.top + 40) ws.scrollTop -= 12; else if (clientY > wr.bottom - 40) ws.scrollTop += 12;
  }
  function dragStart(blocks) {
    dragging = true;
    dragBlocks = blocks;
    document.body.classList.add('blk-dragging');
    blocks.forEach(b => b.classList.add('blk-selected'));
  }
  function dragEnd(doMove) {
    dragging = false;
    drop.hidden = true;
    document.body.classList.remove('blk-dragging');
    const grupo = dragBlocks.length > 1 || selected.length > 0;
    let colocados = null;
    if (doMove && dropTarget) colocados = moveGroupTo(dragBlocks, dropTarget, dropBefore);
    const bloques = (colocados || dragBlocks).filter(b => b.isConnected);
    dragBlocks.forEach(quitarMarca);
    if (grupo) setSelection(bloques); else { setSelection([], true); caretInto(bloques[0], false); }
    current = bloques[0] || null; if (current) place(current);
    dragBlocks = []; dropTarget = null;
  }
  function setupGripDrag(grip) {
    let start = null, moved = false, blocks = [];
    grip.addEventListener('pointerdown', e => {
      if (!current) return;
      e.preventDefault();
      blocks = conectados().includes(current) ? selected.slice() : [current];
      start = { x: e.clientX, y: e.clientY }; moved = false;
      try { grip.setPointerCapture(e.pointerId); } catch (_) { /* puntero sintético */ }
    });
    grip.addEventListener('pointermove', e => {
      if (!start) return;
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) return;
      if (!moved) { moved = true; dragStart(blocks); }
      dragUpdate(e.clientY);
    });
    const finish = () => {
      if (!start) return;
      start = null;
      if (!moved) { if (!selected.includes(current)) selectBlock(current); openMenu(grip); return; }
      dragEnd(true);
    };
    grip.addEventListener('pointerup', finish);
    grip.addEventListener('pointercancel', () => { start = null; if (moved) dragEnd(false); });
  }
  /* arrastrar un grupo seleccionado tomándolo por el propio bloque */
  function setupBodyDrag() {
    let start = null, moved = false;
    editor().addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.shiftKey) return;
      const b = topBlock(e.target);
      if (!b || !conectados().includes(b)) return;
      if (e.target.closest && e.target.closest('.db input, .db select, .db button, .db [contenteditable="plaintext-only"]')) return;
      e.preventDefault();
      start = { x: e.clientX, y: e.clientY }; moved = false;
      try { editor().setPointerCapture(e.pointerId); } catch (_) { /* puntero sintético */ }
    });
    editor().addEventListener('pointermove', e => {
      if (!start) return;
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
      if (!moved) { moved = true; dragStart(selected.slice()); }
      dragUpdate(e.clientY);
    });
    const finish = e => {
      if (!start) return;
      start = null;
      if (!moved) {
        /* un clic en un bloque elegido: el cursor va donde se pulsó */
        setSelection([], true);
        const r = document.caretRangeFromPoint && document.caretRangeFromPoint(e.clientX, e.clientY);
        if (r && editor().contains(r.startContainer)) { editor().focus({ preventScroll: true }); Ed.restoreSelection(r); }
        else { const b = topBlock(e.target); if (b) caretInto(b, false); }
        return;
      }
      dragEnd(true);
    };
    editor().addEventListener('pointerup', finish);
    editor().addEventListener('pointercancel', () => { start = null; if (moved) dragEnd(false); });
  }

  /* ---------- clics fuera del texto y rectángulo de selección ----------
     · fuera de la hoja (el lienzo gris): arrastrar dibuja el rectángulo; un clic pone el cursor a esa altura (Ed.clicFuera);
     · en la hoja, por debajo del último bloque: arrastrar dibuja el rectángulo; un clic escribe ahí (Ed.clicEnHueco);
     · en la hoja, a la altura del texto (los márgenes a los lados de una línea estrecha, los saltos de página): lo de siempre
       del navegador (colocar el cursor, seleccionar texto arrastrando), y al soltar sin arrastrar el cursor se recoloca en el
       bloque de esa altura (Ed.cursorEnPunto). Antes ahí no se movía el cursor y lo escrito iba al sitio anterior. */
  let marqueeActive = false;
  function setupMarquee(ws) {
    let origin = null, started = false, zona = null, margen = null;
    const debajo = y => { const u = editor().lastElementChild; return !u || y > u.getBoundingClientRect().bottom + 2; };
    ws.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      const t = e.target;
      let z = null;
      if (t === ws || t === $('#pageWrap')) z = 'fuera';
      else if (t === editor()) z = debajo(e.clientY) ? 'hueco' : 'margen';
      if (!z) return;
      if (z === 'margen') { if (!e.shiftKey && e.detail <= 1) margen = { x: e.clientX, y: e.clientY }; return; }
      if (z === 'hueco' && !editor().isContentEditable) return;
      e.preventDefault();   // ni el foco ni el cursor se van: al soltar sin arrastrar se coloca a propósito
      origin = { x: e.clientX, y: e.clientY }; started = false; zona = z;
    });
    document.addEventListener('mousemove', e => {
      if (!origin) return;
      if (!started && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < 4) return;
      if (!started) { started = true; marqueeActive = true; hide(); if (window.getSelection) window.getSelection().removeAllRanges(); document.body.classList.add('blk-marquee-on'); }
      const x1 = Math.min(origin.x, e.clientX), y1 = Math.min(origin.y, e.clientY), x2 = Math.max(origin.x, e.clientX), y2 = Math.max(origin.y, e.clientY);
      marquee.hidden = false;
      Object.assign(marquee.style, { left: x1 + 'px', top: y1 + 'px', width: (x2 - x1) + 'px', height: (y2 - y1) + 'px' });
      const hit = kids().filter(k => { const r = k.getBoundingClientRect(); return r.bottom >= y1 && r.top <= y2 && r.right >= x1 && r.left <= x2; });
      setSelection(hit);
      const wr = ws.getBoundingClientRect();
      if (e.clientY < wr.top + 30) ws.scrollTop -= 10; else if (e.clientY > wr.bottom - 30) ws.scrollTop += 10;
    });
    document.addEventListener('mouseup', e => {
      if (margen) {
        const m = margen; margen = null;
        const s = window.getSelection();
        if (Math.hypot(e.clientX - m.x, e.clientY - m.y) < 4 && (!s || !s.rangeCount || s.isCollapsed) && Ed.cursorEnPunto) Ed.cursorEnPunto(m.x, m.y);
      }
      if (!origin) return;
      const was = started, z = zona;
      origin = null; started = false; zona = null;
      if (was) { marquee.hidden = true; document.body.classList.remove('blk-marquee-on'); setTimeout(() => { marqueeActive = false; }, 0); return; }
      if (selected.length) setSelection([], true);
      if (z === 'hueco' && Ed.clicEnHueco) Ed.clicEnHueco(e.clientX, e.clientY);
      else if (z === 'fuera' && Ed.clicFuera) Ed.clicFuera(e.clientX, e.clientY);
    });
  }

  /* ---------- teclado ---------- */
  B.onKeydown = function (e) {
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key;
    conectados();
    /* con un cursor en el editor, lo elegido ya no manda (quedaba de antes de un Deshacer o de un clic) */
    if (selected.length && rangoEnEditor()) setSelection([], true);

    /* Esc con el cursor en el texto: elegir el bloque (o el elemento de la lista, la fila, el párrafo del recuadro) */
    if (k === 'Escape' && !selected.length) {
      if (anyMenuOpen() || (Ed.slash && Ed.slash.open) || !$('#findPanel').hidden) return false;
      const r = Ed.getRange();
      if (!r || !editor().contains(r.startContainer)) return false;
      const it = itemDe(r.startContainer);
      if (!it) return false;
      e.preventDefault();
      const guardado = r.cloneRange();
      selectBlock(it);
      antesEsc = guardado;
      current = topBlock(it); place(current);
      return true;
    }
    if (selected.length) {
      const first = selected[0], last = selected[selected.length - 1];
      if (k === 'Escape') {
        e.preventDefault();
        /* un segundo Esc en un elemento de la lista (o fila, o párrafo de un recuadro) elige lo que lo contiene */
        if (interior(first)) { const r = antesEsc, top = topBlock(first); selectBlock(top); antesEsc = r; current = top; place(top); }
        else soltar(first, false);
        return true;
      }
      if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); removeAll(selected.slice()); return true; }
      if ((k === 'ArrowUp' || k === 'ArrowDown') && mod && e.shiftKey) { e.preventDefault(); moveGroup(selected.slice(), k === 'ArrowUp' ? -1 : 1); return true; }
      if (k === 'ArrowUp' || k === 'ArrowDown') {
        e.preventDefault();
        const next = k === 'ArrowUp' ? first.previousElementSibling : last.nextElementSibling;
        if (!next || next.classList.contains('ed-fijo')) return true;
        if (e.shiftKey) setSelection(selected.concat([next])); else setSelection([next]);
        next.scrollIntoView({ block: 'nearest' });
        current = topBlock(next); place(current);
        return true;
      }
      if (mod && !e.shiftKey && !e.altKey) {
        const kk = k.toLowerCase();
        if (kk === 'a') { e.preventDefault(); setSelection(kids()); return true; }
        if (kk === 'd') { e.preventDefault(); duplicateAll(selected.slice()); return true; }
        if (kk === 'c' || kk === 'x') { e.preventDefault(); try { document.execCommand(kk === 'c' ? 'copy' : 'cut'); } catch (_) { /* sin portapapeles */ } return true; }
      }
      /* Enter o una tecla que escribe: se suelta la selección, el cursor vuelve adonde estaba antes de Esc y la tecla actúa
         ahí (antes escribía al final del bloque). Sin un sitio de antes, Enter lleva el cursor al principio del bloque. */
      if (!mod && (k === 'Enter' || k.length === 1)) {
        const volvio = soltar(first, k !== 'Enter');
        if (!volvio && k === 'Enter') { e.preventDefault(); return true; }
        if (!editor().contains(e.target)) {
          /* la tecla llegó con el foco fuera del editor: se le pasa al editor para que sus atajos (guion, listas, «/») la vean;
             lo que no prevengan lo hace el navegador en el editor, que ya tiene el foco */
          const c = new KeyboardEvent('keydown', { key: e.key, code: e.code, keyCode: e.keyCode, which: e.which, location: e.location, repeat: e.repeat,
            shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, bubbles: true, cancelable: true, composed: true });
          editor().dispatchEvent(c);
          if (c.defaultPrevented) e.preventDefault();
          return true;
        }
        return false;
      }
      return false;
    }
    if (!mod) return false;
    const inText = !!blockFromSelection();
    if (!inText) return false;
    if (e.shiftKey && (k === 'ArrowUp' || k === 'ArrowDown')) {
      const r = Ed.getRange(); if (!r) return false;
      const n = r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer;
      const li = n.closest && n.closest('li');
      const b = li && editor().contains(li) ? li : blockFromSelection();
      if (!b) return false;
      e.preventDefault();
      const dir = k === 'ArrowUp' ? -1 : 1;
      if (b.classList.contains('ed-fijo')) return true;
      moveGroup([b], dir, offsetsDe(b, r));
      if (Ed.updateToolbar) Ed.updateToolbar();
      return true;
    }
    if (!e.shiftKey && !e.altKey && k.toLowerCase() === 'd') {
      const b = blockFromSelection(); if (!b) return false;
      e.preventDefault(); duplicateAll([b]); return true;
    }
    /* Ctrl+A: si el bloque ya está todo seleccionado, seleccionar todos los bloques */
    if (!e.shiftKey && k.toLowerCase() === 'a') {
      const b = blockFromSelection(); const sel = window.getSelection();
      if (b && sel && !sel.isCollapsed && sel.toString().trim() === b.textContent.replace(/\u200B/g, '').trim() && b.textContent.trim()) { e.preventDefault(); setSelection(kids()); return true; }
    }
    return false;
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})(window.Ed);
