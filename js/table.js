/* Tablas estilo Obsidian: inserción directa y controles flotantes para filas y columnas */
(function (Ed) {
  'use strict';
  const T = {};
  Ed.table = T;
  const $ = (s, r = document) => r.querySelector(s);
  const editor = () => Ed.editor;
  const changed = () => Ed.afterChange && Ed.afterChange();

  /* ---------- contexto ---------- */
  T.cellCtx = function () {
    const r = Ed.getRange();
    if (!r || !editor().contains(r.startContainer)) return null;
    const el = r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer;
    const cell = el.closest('td, th');
    if (!cell || !editor().contains(cell) || cell.closest('.db')) return null;
    const row = cell.parentElement;
    const rows = Array.from(cell.closest('table').querySelectorAll('tr'));
    return { cell, row, table: cell.closest('table'), idx: Array.from(row.children).indexOf(cell), rowIdx: rows.indexOf(row), rows };
  };
  const focusCell = cell => {
    if (!cell) return;
    const r = document.createRange();
    r.selectNodeContents(cell);
    r.collapse(true);
    Ed.restoreSelection(r);
  };
  const newCell = tag => { const c = document.createElement(tag); c.innerHTML = '<br>'; return c; };
  const rowsOf = table => Array.from(table.querySelectorAll('tr'));

  /* ---------- insertar (2 columnas × 2 filas, con encabezado) ---------- */
  T.insert = function (cols = 2, rows = 2) {
    Ed.focusEditor();
    const r = Ed.getRange();
    if (!r) return;
    const table = document.createElement('table');
    for (let i = 0; i < rows; i++) {
      const tr = document.createElement('tr');
      for (let j = 0; j < cols; j++) tr.appendChild(newCell(i === 0 ? 'th' : 'td'));
      table.appendChild(tr);
    }
    const after = document.createElement('p');
    after.innerHTML = '<br>';
    const block = Ed.closestBlock(r.startContainer, editor());
    if (block && block.parentElement === editor() && !block.closest('table')) {
      const empty = !block.textContent.trim() && !block.querySelector('img');
      block.after(table, after);
      if (empty) block.remove();
    } else {
      editor().append(table, after);
    }
    focusCell(table.querySelector('th, td'));
    changed();
    T.update();
  };

  /* ---------- filas ---------- */
  T.addRow = function (where, ctx) {
    const c = ctx || T.cellCtx(); if (!c) return;
    const nr = document.createElement('tr');
    Array.from(c.row.children).forEach(() => nr.appendChild(newCell('td')));
    where === 'above' ? c.row.before(nr) : c.row.after(nr);
    focusCell(nr.children[Math.min(c.idx, nr.children.length - 1)]);
    changed(); T.update();
  };
  T.addRowEnd = function (table) {
    const rows = rowsOf(table); const last = rows[rows.length - 1];
    const nr = document.createElement('tr');
    Array.from(last.children).forEach(() => nr.appendChild(newCell('td')));
    last.after(nr);
    focusCell(nr.firstElementChild);
    changed(); T.update();
  };
  T.deleteRow = function (ctx) {
    const c = ctx || T.cellCtx(); if (!c) return;
    if (c.rows.length <= 1) return T.deleteTable(c);
    const next = c.row.nextElementSibling || c.row.previousElementSibling;
    c.row.remove();
    focusCell(next && next.children[Math.min(c.idx, next.children.length - 1)]);
    changed(); T.update();
  };
  T.moveRowTo = function (table, from, to) {
    const rows = rowsOf(table);
    if (from === to || !rows[from] || to < 0 || to >= rows.length) return;
    const row = rows[from];
    const ref = rows[to];
    to > from ? ref.after(row) : ref.before(row);
    focusCell(row.children[0]);
    changed(); T.update();
  };
  T.moveRow = function (dir, ctx) {
    const c = ctx || T.cellCtx(); if (!c) return;
    const target = c.rowIdx + dir;
    if (target < 0 || target >= c.rows.length) return;
    T.moveRowTo(c.table, c.rowIdx, target);
    focusCell(c.cell);
  };

  /* ---------- columnas ---------- */
  T.addCol = function (where, ctx) {
    const c = ctx || T.cellCtx(); if (!c) return;
    let target = null;
    rowsOf(c.table).forEach(tr => {
      const ref = tr.children[Math.min(c.idx, tr.children.length - 1)];
      const nc = newCell(ref && ref.tagName === 'TH' ? 'th' : 'td');
      if (!ref) tr.appendChild(nc); else where === 'left' ? ref.before(nc) : ref.after(nc);
      if (tr === c.row) target = nc;
    });
    focusCell(target);
    changed(); T.update();
  };
  T.addColEnd = function (table) {
    let first = null;
    rowsOf(table).forEach(tr => { const nc = newCell(tr.firstElementChild && tr.firstElementChild.tagName === 'TH' ? 'th' : 'td'); tr.appendChild(nc); if (!first) first = nc; });
    focusCell(first);
    changed(); T.update();
  };
  T.deleteCol = function (ctx) {
    const c = ctx || T.cellCtx(); if (!c) return;
    if (c.row.children.length <= 1) return T.deleteTable(c);
    rowsOf(c.table).forEach(tr => { const cell = tr.children[c.idx]; if (cell) cell.remove(); });
    focusCell(c.row.children[Math.min(c.idx, c.row.children.length - 1)]);
    changed(); T.update();
  };
  T.moveColTo = function (table, from, to) {
    const n = table.querySelector('tr').children.length;
    if (from === to || to < 0 || to >= n) return;
    let focus = null;
    rowsOf(table).forEach(tr => {
      const cell = tr.children[from]; const ref = tr.children[to];
      if (!cell || !ref) return;
      to > from ? ref.after(cell) : ref.before(cell);
      if (!focus) focus = cell;
    });
    focusCell(focus);
    changed(); T.update();
  };
  T.moveCol = function (dir, ctx) {
    const c = ctx || T.cellCtx(); if (!c) return;
    T.moveColTo(c.table, c.idx, c.idx + dir);
    focusCell(c.cell);
  };

  T.deleteTable = function (ctx) {
    const c = ctx || T.cellCtx(); if (!c) return;
    removeTable(c.table);
  };

  /* Quita la tabla y deja el cursor en el bloque anterior (o en un párrafo nuevo) */
  function removeTable(table) {
    const prev = table.previousElementSibling;
    const next = table.nextElementSibling;
    table.remove();
    const target = prev || next;
    if (target && Ed.BLOCK_TAGS.has(target.tagName) && !target.querySelector('table')) {
      const r = document.createRange();
      r.selectNodeContents(target);
      r.collapse(!prev);
      Ed.restoreSelection(r);
    } else {
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      next ? next.before(p) : editor().appendChild(p);
      Ed.setCaret(p, 0);
    }
    changed(); T.update();
  }
  const cellEmpty = cell => !cell.textContent.replace(/\u200B/g, '').trim() && !cell.querySelector('img');
  const rowEmpty = row => Array.from(row.children).every(cellEmpty);
  const atStartOf = (el, r) => { const pre = document.createRange(); pre.setStart(el, 0); pre.setEnd(r.startContainer, r.startOffset); return !pre.toString().replace(/\u200B/g, '') && !pre.cloneContents().querySelector('img'); };
  const atEndOf = (el, r) => { const post = document.createRange(); post.setStart(r.endContainer, r.endOffset); post.setEnd(el, el.childNodes.length); return !post.toString().replace(/\u200B/g, '') && !post.cloneContents().querySelector('img'); };
  const caretEnd = el => { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); Ed.restoreSelection(r); };

  /* Retroceso / Suprimir dentro y alrededor de tablas. Devuelve true si lo gestionó. */
  T.onKeydown = function (e) {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return false;
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    const r = Ed.getRange();
    if (!r || !editor().contains(r.commonAncestorContainer)) return false;

    /* selección que abarca tablas completas: se borra el contenido y se quitan las tablas vacías */
    if (!r.collapsed) {
      const tables = Array.from(editor().querySelectorAll('table')).filter(t => !t.closest('.db')).filter(t => {
        if (!r.intersectsNode(t)) return false;
        const tr = document.createRange(); tr.selectNode(t);
        return r.compareBoundaryPoints(Range.START_TO_START, tr) <= 0 && r.compareBoundaryPoints(Range.END_TO_END, tr) >= 0;
      });
      if (!tables.length) return false;
      e.preventDefault();
      Ed.cmd('delete');
      tables.forEach(t => { if (t.isConnected && rowsOf(t).every(rowEmpty)) { t.remove(); } });
      editor().querySelectorAll('table').forEach(t => { if (!t.querySelector('td, th')) t.remove(); });
      if (!editor().querySelector('p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, table')) { editor().innerHTML = '<p><br></p>'; Ed.setCaret(editor().firstChild, 0); }
      changed(); T.update();
      return true;
    }

    const c = T.cellCtx();
    if (c) {
      if (e.key === 'Backspace') {
        if (!atStartOf(c.cell, r)) return false;
        e.preventDefault();
        if (rowEmpty(c.row)) {
          /* fila vacía: se borra; si era la única, se quita la tabla */
          if (c.rows.length <= 1) { removeTable(c.table); return true; }
          const prev = c.row.previousElementSibling;
          const next = c.row.nextElementSibling;
          c.row.remove();
          if (prev) caretEnd(prev.children[prev.children.length - 1]); else focusCell(next.children[0]);
          changed(); T.update();
          return true;
        }
        /* celda con contenido y cursor al inicio (o celda vacía): ir al final de la celda anterior */
        const cells = Array.from(c.table.querySelectorAll('td, th'));
        const i = cells.indexOf(c.cell);
        if (i > 0) caretEnd(cells[i - 1]);
        else { const prevBlock = c.table.previousElementSibling; if (prevBlock) caretEnd(prevBlock); }
        T.update();
        return true;
      }
      /* Delete */
      if (!atEndOf(c.cell, r)) return false;
      e.preventDefault();
      if (rowEmpty(c.row)) {
        if (c.rows.length <= 1) { removeTable(c.table); return true; }
        const next = c.row.nextElementSibling;
        const prev = c.row.previousElementSibling;
        c.row.remove();
        if (next) focusCell(next.children[Math.min(c.idx, next.children.length - 1)]); else caretEnd(prev.children[prev.children.length - 1]);
        changed(); T.update();
        return true;
      }
      const cells = Array.from(c.table.querySelectorAll('td, th'));
      const i = cells.indexOf(c.cell);
      if (i < cells.length - 1) focusCell(cells[i + 1]);
      return true;
    }

    /* fuera de la tabla: Retroceso al inicio del bloque que sigue a una tabla entra en la última celda */
    const block = Ed.closestBlock(r.startContainer, editor());
    if (!block || block.parentElement !== editor()) return false;
    if (e.key === 'Backspace' && atStartOf(block, r)) {
      const prev = block.previousElementSibling;
      if (!prev || prev.tagName !== 'TABLE') return false;
      e.preventDefault();
      const empty = !block.textContent.replace(/\u200B/g, '').trim() && !block.querySelector('img');
      if (empty && block.nextElementSibling) block.remove();
      const cells = prev.querySelectorAll('td, th');
      caretEnd(cells[cells.length - 1]);
      changed(); T.update();
      return true;
    }
    if (e.key === 'Delete' && atEndOf(block, r)) {
      const next = block.nextElementSibling;
      if (!next || next.tagName !== 'TABLE') return false;
      e.preventDefault();
      focusCell(next.querySelector('td, th'));
      T.update();
      return true;
    }
    return false;
  };

  /* Tab / Shift+Tab entre celdas; Tab en la última celda añade una fila */
  T.tab = function (back) {
    const c = T.cellCtx(); if (!c) return false;
    const cells = Array.from(c.table.querySelectorAll('td, th'));
    const i = cells.indexOf(c.cell);
    if (back) { if (i > 0) focusCell(cells[i - 1]); return true; }
    if (i < cells.length - 1) { focusCell(cells[i + 1]); T.update(); return true; }
    T.addRowEnd(c.table);
    return true;
  };

  /* ---------- controles flotantes ---------- */
  let ui, colHandle, rowHandle, addCol, addRow, drop, menu, resizers = [];
  let current = null; /* { table, cell, idx, rowIdx } */

  function build() {
    const wrap = $('#pageWrap');
    ui = document.createElement('div');
    ui.className = 'tbl-ui';
    ui.hidden = true;
    colHandle = mk('div', 'tbl-handle col', '⋯', 'Columna: clic para opciones, arrastra para mover');
    rowHandle = mk('div', 'tbl-handle row', '⋮', 'Fila: clic para opciones, arrastra para mover');
    addCol = mk('button', 'tbl-add', '+', 'Añadir columna');
    addRow = mk('button', 'tbl-add', '+', 'Añadir fila');
    drop = mk('div', 'tbl-drop', '', '');
    drop.hidden = true;
    ui.append(colHandle, rowHandle, addCol, addRow, drop);
    wrap.appendChild(ui);
    menu = document.createElement('div');
    menu.className = 'ctx-menu tbl-menu';
    menu.hidden = true;
    document.body.appendChild(menu);

    [colHandle, rowHandle, addCol, addRow].forEach(el => el.addEventListener('mousedown', e => e.preventDefault()));
    addCol.addEventListener('click', () => current && T.addColEnd(current.table));
    addRow.addEventListener('click', () => current && T.addRowEnd(current.table));
    setupDrag(colHandle, 'col');
    setupDrag(rowHandle, 'row');
    menu.addEventListener('mousedown', e => e.preventDefault());
    menu.addEventListener('click', e => {
      const b = e.target.closest('[data-op]');
      if (!b) return;
      closeMenu();
      const c = T.cellCtx();
      const ops = {
        'col-left': () => T.addCol('left', c), 'col-right': () => T.addCol('right', c),
        'col-move-left': () => T.moveCol(-1, c), 'col-move-right': () => T.moveCol(1, c), 'col-del': () => T.deleteCol(c),
        'row-above': () => T.addRow('above', c), 'row-below': () => T.addRow('below', c),
        'row-move-up': () => T.moveRow(-1, c), 'row-move-down': () => T.moveRow(1, c), 'row-del': () => T.deleteRow(c),
        'table-del': () => T.deleteTable(c)
      };
      if (ops[b.dataset.op]) ops[b.dataset.op]();
    });
    document.addEventListener('mousedown', e => { if (!e.target.closest || !e.target.closest('.tbl-menu, .tbl-handle')) closeMenu(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
    document.addEventListener('selectionchange', () => requestAnimationFrame(T.update));
    editor().addEventListener('input', () => requestAnimationFrame(T.update));
    $('#workspace').addEventListener('scroll', closeMenu);
    window.addEventListener('resize', T.update);
  }
  function mk(tag, cls, text, title) {
    const el = document.createElement(tag);
    el.className = cls; el.textContent = text; el.title = title;
    if (tag === 'button') el.type = 'button';
    return el;
  }

  const MENUS = {
    col: [['col-left', 'Insertar columna a la izquierda'], ['col-right', 'Insertar columna a la derecha'], null,
      ['col-move-left', 'Mover a la izquierda'], ['col-move-right', 'Mover a la derecha'], null,
      ['col-del', 'Eliminar columna'], ['table-del', 'Eliminar tabla']],
    row: [['row-above', 'Insertar fila arriba'], ['row-below', 'Insertar fila abajo'], null,
      ['row-move-up', 'Mover arriba'], ['row-move-down', 'Mover abajo'], null,
      ['row-del', 'Eliminar fila'], ['table-del', 'Eliminar tabla']]
  };
  function openMenu(kind, x, y) {
    menu.innerHTML = MENUS[kind].map(it => it ? `<button type="button" data-op="${it[0]}"><span>${it[1]}</span></button>` : '<hr>').join('');
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 4)) + 'px';
    menu.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) + 'px';
  }
  function closeMenu() { if (menu) menu.hidden = true; }

  /* posición relativa al contenedor de la hoja, descontando el zoom */
  function rel(rect) {
    const z = Ed.page.state.zoom || 1;
    const w = $('#pageWrap').getBoundingClientRect();
    return { left: (rect.left - w.left) / z, top: (rect.top - w.top) / z, width: rect.width / z, height: rect.height / z };
  }
  function place(el, r) { el.style.left = r.left + 'px'; el.style.top = r.top + 'px'; el.style.width = r.width + 'px'; el.style.height = r.height + 'px'; }

  T.update = function () {
    if (!ui) return;
    const c = T.cellCtx();
    if (!c || (menu && !menu.hidden && current && c.table === current.table && false)) { /* noop */ }
    if (!c) { ui.hidden = true; current = null; closeMenu(); return; }
    current = c;
    ui.hidden = false;
    const t = rel(c.table.getBoundingClientRect());
    const cell = rel(c.cell.getBoundingClientRect());
    const row = rel(c.row.getBoundingClientRect());
    place(colHandle, { left: cell.left + 2, top: t.top - 16, width: Math.max(16, cell.width - 4), height: 12 });
    place(rowHandle, { left: t.left - 16, top: row.top + 2, width: 12, height: Math.max(16, row.height - 4) });
    place(addCol, { left: t.left + t.width + 6, top: t.top + t.height / 2 - 10, width: 20, height: 20 });
    place(addRow, { left: t.left + t.width / 2 - 10, top: t.top + t.height + 6, width: 20, height: 20 });
    placeResizers(c.table, t);
  };

  /* asas verticales en el borde derecho de cada columna */
  function placeResizers(table, t) {
    const first = table.querySelector('tr');
    const cells = first ? Array.from(first.children) : [];
    while (resizers.length < cells.length) { const r = mk('div', 'tbl-resize', '', 'Arrastra para cambiar el ancho'); r.addEventListener('mousedown', e => e.preventDefault()); setupResize(r); ui.appendChild(r); resizers.push(r); }
    resizers.forEach((r, i) => {
      const cell = cells[i];
      if (!cell) { r.hidden = true; return; }
      const cr = rel(cell.getBoundingClientRect());
      r.hidden = false;
      r.dataset.index = i;
      place(r, { left: cr.left + cr.width - 3, top: t.top, width: 6, height: t.height });
    });
  }
  function setupResize(handle) {
    let st = null;
    handle.addEventListener('pointerdown', e => {
      if (!current) return;
      e.preventDefault(); e.stopPropagation();
      const i = +handle.dataset.index;
      const cells = rowsOf(current.table).map(tr => tr.children[i]).filter(Boolean);
      const z = Ed.page.state.zoom || 1;
      st = { i, cells, x: e.clientX, w: cells[0].getBoundingClientRect().width / z, z, table: current.table };
      document.body.classList.add('col-resizing');
      try { handle.setPointerCapture(e.pointerId); } catch (_) { /* puntero sintético */ }
    });
    handle.addEventListener('pointermove', e => {
      if (!st) return;
      const w = Math.max(40, Math.round(st.w + (e.clientX - st.x) / st.z));
      st.table.style.width = 'auto';
      st.cells.forEach(c => { c.style.width = w + 'px'; c.style.minWidth = w + 'px'; });
      T.update();
    });
    const done = () => { if (!st) return; st = null; document.body.classList.remove('col-resizing'); changed(); T.update(); };
    handle.addEventListener('pointerup', done);
    handle.addEventListener('pointercancel', done);
  }

  /* arrastre de columnas / filas */
  function setupDrag(handle, kind) {
    let start = null, dragging = false, target = -1;
    handle.addEventListener('pointerdown', e => {
      if (!current) return;
      start = { x: e.clientX, y: e.clientY };
      dragging = false; target = -1;
      try { handle.setPointerCapture(e.pointerId); } catch (_) { /* puntero sintético */ }
    });
    handle.addEventListener('pointermove', e => {
      if (!start || !current) return;
      if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) return;
      dragging = true;
      handle.classList.add('dragging');
      const t = rel(current.table.getBoundingClientRect());
      if (kind === 'col') {
        const cells = Array.from(current.row.children);
        target = cells.length - 1;
        for (let i = 0; i < cells.length; i++) { const r = cells[i].getBoundingClientRect(); if (e.clientX < r.left + r.width / 2) { target = i; break; } }
        const ref = cells[Math.min(target, cells.length - 1)].getBoundingClientRect();
        const x = target >= cells.length ? rel(ref).left + rel(ref).width : rel(ref).left;
        place(drop, { left: x - 1, top: t.top, width: 2, height: t.height });
      } else {
        const rows = current.rows;
        target = rows.length - 1;
        for (let i = 0; i < rows.length; i++) { const r = rows[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { target = i; break; } }
        const ref = rel(rows[Math.min(target, rows.length - 1)].getBoundingClientRect());
        place(drop, { left: t.left, top: ref.top - 1, width: t.width, height: 2 });
      }
      drop.hidden = false;
    });
    const finish = e => {
      if (!start) return;
      const wasDragging = dragging;
      start = null; dragging = false;
      drop.hidden = true;
      handle.classList.remove('dragging');
      if (!current) return;
      if (!wasDragging) { openMenu(kind, e.clientX, e.clientY); return; }
      /* al soltar: el índice de destino se refiere al hueco antes de la celda `target` */
      if (kind === 'col') {
        const from = current.idx; let to = target;
        if (to > from) to -= 1;
        T.moveColTo(current.table, from, to);
      } else {
        const from = current.rowIdx; let to = target;
        if (to > from) to -= 1;
        T.moveRowTo(current.table, from, to);
      }
    };
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', () => { start = null; dragging = false; drop.hidden = true; handle.classList.remove('dragging'); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})(window.Ed);
