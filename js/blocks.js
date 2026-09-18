/* Bloques estilo Notion: asa lateral (insertar, arrastrar, menú), selección múltiple de bloques
   (rectángulo, arrastre de texto entre bloques, Esc, Shift+flechas) y operaciones sobre el grupo. */
(function (Ed) {
  'use strict';
  const B = {};
  Ed.blocks = B;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const editor = () => Ed.editor;
  const changed = () => { if (Ed.afterChange) Ed.afterChange(); };

  let handle, drop, menu, marquee, current = null;
  let selected = [];          /* bloques seleccionados en orden de documento */
  let dragging = false;

  /* ---------- utilidades ---------- */
  const topBlock = node => {
    let n = node && node.nodeType === 3 ? node.parentNode : node;
    while (n && n.parentNode !== editor()) n = n.parentNode;
    return n && n.parentNode === editor() ? n : null;
  };
  B.topBlock = topBlock;
  const kids = () => Array.from(editor().children);
  function caretInto(block, atEnd) {
    if (!block) return;
    if (block.classList && block.classList.contains('db')) { const n = block.querySelector('.db-title'); if (n) n.focus(); return; }
    const target = block.matches('ul, ol') ? (atEnd ? $$('li', block).pop() : block.querySelector('li')) || block : block.matches('table') ? block.querySelector('td, th') || block : block;
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
  function rel(rect) {
    const z = Ed.page.state.zoom || 1;
    const w = $('#pageWrap').getBoundingClientRect();
    return { left: (rect.left - w.left) / z, top: (rect.top - w.top) / z, width: rect.width / z, height: rect.height / z };
  }
  /* con las sugerencias de personajes o de formato abiertas, Esc es para cerrarlas (antes seleccionaba el bloque y el editor
     se quedaba sin cursor: el Enter siguiente no hacía nada) */
  const anyMenuOpen = () => ['#ctxMenu', '#colorPop', '.tbl-menu', '.db-pop', '.blk-menu', '.slash-menu', '.char-menu']
    .some(s => Array.from(document.querySelectorAll(s)).some(el => !el.hidden));

  /* ---------- selección de bloques ---------- */
  B.selected = () => selected.slice();
  function setSelection(blocks, keepCaret) {
    $$('.blk-selected', editor()).forEach(x => x.classList.remove('blk-selected'));
    const order = kids();
    selected = order.filter(b => blocks.includes(b) && !b.classList.contains('ed-fijo'));   // los bloques fijos (fijos.js) no se seleccionan
    selected.forEach(b => b.classList.add('blk-selected'));
    if (selected.length && !keepCaret) {
      const sel = window.getSelection();
      if (sel) sel.removeAllRanges();
      if (document.activeElement && document.activeElement !== document.body && !document.activeElement.closest('.topbar, .find-panel, .focus-bar')) document.activeElement.blur();
    }
  }
  B.select = blocks => setSelection(blocks);
  B.clear = () => setSelection([]);
  function selectRange(a, b) {
    const order = kids();
    let i = order.indexOf(a), j = order.indexOf(b);
    if (i < 0 || j < 0) return;
    if (i > j) [i, j] = [j, i];
    setSelection(order.slice(i, j + 1));
  }
  function selectBlock(b) { if (b) setSelection([b]); }

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
      const targets = selected.length ? selected.slice() : (current ? [current] : []);
      closeMenu();
      if (!targets.length) return;
      if (op === 'convert') { targets.forEach(t => convert(t, arg)); if (targets.length > 1) setSelection(targets.filter(t => t.isConnected)); }
      else if (op === 'dup') duplicateAll(targets);
      else if (op === 'up') moveGroup(targets, -1);
      else if (op === 'down') moveGroup(targets, 1);
      else if (op === 'del') removeAll(targets);
      else if (op === 'separar' && Ed.doble) targets.filter(t => t.matches('.sp-doble')).forEach(t => Ed.doble.separar(t));
    });
    document.addEventListener('mousedown', e => {
      if (!menu.hidden && !(e.target.closest && e.target.closest('.blk-menu, .blk-grip'))) closeMenu(true);
    });

    const ws = $('#workspace');
    /* el asa acompaña a la línea en la que se escribe (no al ratón) y se queda a la vista */
    document.addEventListener('selectionchange', () => {
      if (dragging || marqueeActive || anyMenuOpen()) return;
      const b = blockFromSelection();
      if (b && b.tagName !== 'HR') { current = b; place(b); }
    });
    ws.addEventListener('scroll', () => { if (current) place(current); });
    editor().addEventListener('input', () => { if (current) requestAnimationFrame(() => current && current.isConnected ? place(current) : hide()); });
    window.addEventListener('resize', () => current && place(current));
    /* el asa se coloca por posición: si el documento se recoloca sin que cambie la selección (cambia el ancho de
       la hoja, se cargan las fuentes, las páginas empujan un bloque), se quedaba a una línea de distancia */
    if (window.ResizeObserver) new ResizeObserver(() => { if (current) place(current); }).observe(editor());

    setupMarquee(ws);
    setupBodyDrag();
    /* seleccionar texto a través de varios bloques = seleccionar esos bloques */
    document.addEventListener('mouseup', e => {
      if (dragging || marqueeActive) return;
      if (!(e.target.closest && e.target.closest('#editor'))) return;
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return;
        const r = sel.getRangeAt(0);
        if (!editor().contains(r.startContainer) || !editor().contains(r.endContainer)) return;
        const a = topBlock(r.startContainer), b = topBlock(r.endContainer);
        if (a && b && a !== b) selectRange(a, b);
      }, 0);
    });
    /* al hacer clic en el texto se limpia la selección de bloques; con Shift se extiende */
    editor().addEventListener('mousedown', e => {
      if (e.target.closest && e.target.closest('.blk-selected') && !e.shiftKey) return; /* arrastre del grupo */
      if (e.shiftKey && selected.length) {
        const b = topBlock(e.target);
        if (b) { e.preventDefault(); selectRange(selected[0], b); return; }
      }
      if (selected.length) setSelection([], true);
    });
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

  /* ---------- operaciones ---------- */
  function insertBelow(b) {
    setSelection([], true);
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    b.after(p);
    editor().focus();
    Ed.setCaret(p, 0);
    changed();
    Ed.cmd('insertText', '/');
    current = p; place(p);
  }
  function duplicateAll(blocks) {
    const last = blocks[blocks.length - 1];
    const copies = blocks.map(b => { const c = b.cloneNode(true); c.classList.remove('selected', 'blk-selected'); if (!c.classList.length) c.removeAttribute('class'); return c; });
    let ref = last;
    copies.forEach(c => { ref.after(c); ref = c; });
    if (copies.some(c => c.classList.contains('db')) && Ed.db) Ed.db.mountAll();
    changed();
    if (blocks.length > 1 || selected.length) setSelection(copies); else caretInto(copies[0], false);
    current = copies[0]; place(copies[0]);
  }
  function removeAll(blocks) {
    const last = blocks[blocks.length - 1];
    const next = last.nextElementSibling || blocks[0].previousElementSibling;
    blocks.forEach(b => b.remove());
    selected = [];
    changed();
    if (next && next.isConnected) caretInto(next, false); else caretInto(editor().firstElementChild, false);
    hide();
  }
  function moveGroup(blocks, dir) {
    const first = blocks[0], last = blocks[blocks.length - 1];
    const sib = dir < 0 ? first.previousElementSibling : last.nextElementSibling;
    if (!sib) return false;
    if (dir < 0) blocks.forEach(b => sib.before(b)); else blocks.slice().reverse().forEach(b => sib.after(b));
    changed();
    if (selected.length) setSelection(blocks); else caretInto(first, false);
    if (current && blocks.includes(current)) place(current);
    first.scrollIntoView({ block: 'nearest' });
    return true;
  }
  B.move = (b, dir) => moveGroup([b], dir);
  function moveGroupTo(blocks, ref, before) {
    if (!ref || blocks.includes(ref)) return;
    if (before) blocks.forEach(b => ref.before(b)); else blocks.slice().reverse().forEach(b => ref.after(b));
    changed();
  }

  const CONVERTS = [
    ['p', 'Texto'], ['h1', 'Título 1'], ['h2', 'Título 2'], ['h3', 'Título 3'], ['blockquote', 'Cita'], ['pre', 'Código'], ['ul', 'Lista con viñetas'], ['ol', 'Lista numerada'],
    /* los elementos de guion, los mismos que el menú «/» (Ed.screenplay.KINDS) */
    ...Ed.screenplay.KINDS.map(x => ['sp-' + x.id, x.label])
  ];
  function convert(b, to) {
    if (!b.isConnected || b.matches('table, hr, .db, .sp-doble')) return;
    editor().focus({ preventScroll: true });
    if (b.matches('ul, ol')) {
      if ((to === 'ul' || to === 'ol') && b.tagName.toLowerCase() !== to) {
        const list = document.createElement(to);
        while (b.firstChild) list.appendChild(b.firstChild);
        b.replaceWith(list);
        changed();
        return;
      }
      const items = $$(':scope > li', b);
      let last = null;
      items.forEach(li => { const p = document.createElement('p'); while (li.firstChild) p.appendChild(li.firstChild); $$('ul, ol', p).forEach(n => n.remove()); if (!p.firstChild) p.innerHTML = '<br>'; b.before(p); last = p; });
      b.remove();
      if (!last || to === 'ul' || to === 'ol' || to === 'p') { changed(); return; }
      b = last;
    }
    if (b.matches('blockquote')) {
      const p = document.createElement('p');
      while (b.firstChild) { const n = b.firstChild; if (n.nodeType === 1 && /^(P|H[1-6]|DIV)$/.test(n.tagName)) { while (n.firstChild) p.appendChild(n.firstChild); n.remove(); if (b.firstChild) p.appendChild(document.createElement('br')); } else p.appendChild(n); }
      if (!p.firstChild) p.innerHTML = '<br>';
      b.replaceWith(p); b = p;
    }
    if (b.matches('pre')) { const p = document.createElement('p'); p.innerHTML = Ed.escapeHtml(b.textContent).replace(/\n/g, '<br>') || '<br>'; b.replaceWith(p); b = p; }
    const r = document.createRange(); r.selectNodeContents(b); r.collapse(true); Ed.restoreSelection(r);
    if (to.startsWith('sp-')) { Ed.screenplay.set(to.slice(3)); return; }
    Array.from(b.classList).forEach(k => { if (k.startsWith('sp-')) b.classList.remove(k); });
    if (!b.classList.length) b.removeAttribute('class');
    if (to === 'ul' || to === 'ol') { Ed.md.toList(b, to.toUpperCase()); changed(); return; }
    if (to === 'blockquote') { Ed.md.toQuote(b); changed(); return; }
    Ed.cmd('formatBlock', to);
    changed();
    if (Ed.updateToolbar) Ed.updateToolbar();
  }

  function openMenu(anchor) {
    const targets = selected.length ? selected : (current ? [current] : []);
    if (!targets.length) return;
    const convertible = targets.some(b => !b.matches('table, hr, .db, .sp-doble'));
    const dobles = targets.some(b => b.matches('.sp-doble'));   // un diálogo doble no se convierte: se separa (js/doble.js)
    const n = targets.length;
    let html = n > 1 ? `<div class="ctx-title">${n} bloques seleccionados</div>` : '';
    if (convertible) html += '<div class="ctx-title">Convertir en</div><div class="blk-convert">' + CONVERTS.map(([v, l]) => `<button type="button" data-op="convert" data-arg="${v}"><span>${l}</span></button>`).join('') + '</div><hr>';
    if (dobles) html += '<button type="button" data-op="separar"><span>Separar el diálogo doble</span></button><hr>';
    html += `<button type="button" data-op="dup"><span>Duplicar</span><kbd>Ctrl+D</kbd></button>
      <button type="button" data-op="up"><span>Mover arriba</span><kbd>Ctrl+Shift+↑</kbd></button>
      <button type="button" data-op="down"><span>Mover abajo</span><kbd>Ctrl+Shift+↓</kbd></button><hr>
      <button type="button" data-op="del" class="danger"><span>Eliminar</span><kbd>Supr</kbd></button>`;
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
    if (doMove && dropTarget) { moveGroupTo(dragBlocks, dropTarget, dropBefore); }
    if (dragBlocks.length > 1 || selected.length) setSelection(dragBlocks); else { dragBlocks.forEach(b => b.classList.remove('blk-selected')); caretInto(dragBlocks[0], false); }
    current = dragBlocks[0]; if (current) place(current);
    dragBlocks = []; dropTarget = null;
  }
  function setupGripDrag(grip) {
    let start = null, moved = false, blocks = [];
    grip.addEventListener('pointerdown', e => {
      if (!current) return;
      e.preventDefault();
      blocks = selected.includes(current) ? selected.slice() : [current];
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
      if (!b || !selected.includes(b)) return;
      if (e.target.closest && e.target.closest('.db input, .db select, .db button, .db [contenteditable="plaintext-only"]')) return;
      e.preventDefault();
      start = { x: e.clientX, y: e.clientY }; moved = false;
      editor().setPointerCapture(e.pointerId);
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
      if (!moved) { const b = topBlock(e.target); setSelection([], true); if (b) caretInto(b, false); return; }
      dragEnd(true);
    };
    editor().addEventListener('pointerup', finish);
    editor().addEventListener('pointercancel', () => { start = null; if (moved) dragEnd(false); });
  }

  /* ---------- rectángulo de selección (desde el fondo o los márgenes de la hoja) ---------- */
  let marqueeActive = false;
  function setupMarquee(ws) {
    let origin = null, started = false;
    ws.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      const t = e.target;
      const onBackground = t === ws || t === $('#pageWrap') || t === editor();
      if (!onBackground) return;
      if (t === editor()) e.preventDefault(); /* margen de la hoja: no colocar el cursor */
      origin = { x: e.clientX, y: e.clientY }; started = false;
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
    document.addEventListener('mouseup', () => {
      if (!origin) return;
      const was = started;
      origin = null; started = false;
      if (was) { marquee.hidden = true; document.body.classList.remove('blk-marquee-on'); setTimeout(() => { marqueeActive = false; }, 0); }
      else if (selected.length) setSelection([], true);
    });
  }

  /* ---------- portapapeles ---------- */
  function copyBlocks(blocks, cut) {
    const r = document.createRange();
    r.setStartBefore(blocks[0]);
    r.setEndAfter(blocks[blocks.length - 1]);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(r);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    sel.removeAllRanges();
    if (ok && cut) removeAll(blocks); else if (!cut) setSelection(blocks);
    return ok;
  }

  /* ---------- teclado ---------- */
  B.onKeydown = function (e) {
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key;

    /* Esc con el cursor en el texto: seleccionar el bloque (si no hay menús abiertos) */
    if (k === 'Escape' && !selected.length) {
      if (anyMenuOpen() || (Ed.slash && Ed.slash.open) || !$('#findPanel').hidden) return false;
      const b = blockFromSelection();
      if (!b) return false;
      e.preventDefault();
      selectBlock(b);
      current = b; place(b);
      return true;
    }
    if (selected.length) {
      const order = kids();
      const first = selected[0], last = selected[selected.length - 1];
      if (k === 'Escape') { e.preventDefault(); setSelection([], true); caretInto(first, false); return true; }
      if (k === 'Enter') { e.preventDefault(); const b = first; setSelection([], true); caretInto(b, false); return true; }
      if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); removeAll(selected.slice()); return true; }
      if ((k === 'ArrowUp' || k === 'ArrowDown') && mod && e.shiftKey) { e.preventDefault(); moveGroup(selected.slice(), k === 'ArrowUp' ? -1 : 1); return true; }
      if (k === 'ArrowUp' || k === 'ArrowDown') {
        e.preventDefault();
        const i = order.indexOf(k === 'ArrowUp' ? first : last);
        const next = order[i + (k === 'ArrowUp' ? -1 : 1)];
        if (!next) return true;
        if (e.shiftKey) setSelection(selected.concat([next])); else setSelection([next]);
        next.scrollIntoView({ block: 'nearest' });
        current = next; place(next);
        return true;
      }
      if (mod && k.toLowerCase() === 'a') { e.preventDefault(); setSelection(order); return true; }
      if (mod && k.toLowerCase() === 'd') { e.preventDefault(); duplicateAll(selected.slice()); return true; }
      if (mod && k.toLowerCase() === 'c') { e.preventDefault(); copyBlocks(selected.slice(), false); return true; }
      if (mod && k.toLowerCase() === 'x') { e.preventDefault(); copyBlocks(selected.slice(), true); return true; }
      if (mod || k.length > 1) return false;
      /* cualquier otra tecla: sale de la selección y escribe al final del primer bloque */
      setSelection([], true); caretInto(first, true);
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
      const sib = dir < 0 ? b.previousElementSibling : b.nextElementSibling;
      if (!sib) return true;
      const sc = r.startContainer, so = r.startOffset, ec = r.endContainer, eo = r.endOffset;
      dir < 0 ? sib.before(b) : sib.after(b);
      try { const nr = document.createRange(); nr.setStart(sc, so); nr.setEnd(ec, eo); Ed.restoreSelection(nr); } catch (_) { caretInto(b, false); }
      changed();
      b.scrollIntoView({ block: 'nearest' });
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
