/* Bases de datos estilo Notion: bloque no editable (.db) cuyo estado vive en data-db (JSON).
   Vista de tabla con propiedades tipadas, filtros, orden, búsqueda, arrastre y ancho de columnas. */
(function (Ed) {
  'use strict';
  const DB = {};
  Ed.db = DB;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => Ed.escapeHtml(s == null ? '' : String(s));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const TYPES = { title: 'Título', text: 'Texto', number: 'Número', select: 'Selección', multi: 'Selección múltiple', date: 'Fecha', check: 'Casilla', url: 'URL' };
  const ICONS = { title: 'Aa', text: '≡', number: '#', select: '◉', multi: '☰', date: '▦', check: '☑', url: '⛓' };
  const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
  const COLOR_NAMES = { gray: 'Gris', brown: 'Marrón', orange: 'Naranja', yellow: 'Amarillo', green: 'Verde', blue: 'Azul', purple: 'Morado', pink: 'Rosa', red: 'Rojo' };
  const OPS = {
    text: [['contains', 'contiene'], ['ncontains', 'no contiene'], ['is', 'es'], ['isnot', 'no es'], ['empty', 'está vacío'], ['nempty', 'no está vacío']],
    number: [['eq', '='], ['ne', '≠'], ['gt', '>'], ['lt', '<'], ['empty', 'está vacío'], ['nempty', 'no está vacío']],
    select: [['is', 'es'], ['isnot', 'no es'], ['empty', 'está vacío'], ['nempty', 'no está vacío']],
    multi: [['has', 'contiene'], ['nhas', 'no contiene'], ['empty', 'está vacío'], ['nempty', 'no está vacío']],
    date: [['is', 'es'], ['before', 'es anterior a'], ['after', 'es posterior a'], ['empty', 'está vacío'], ['nempty', 'no está vacío']],
    check: [['checked', 'está marcada'], ['unchecked', 'no está marcada']]
  };
  const opsFor = t => OPS[t === 'title' || t === 'url' ? 'text' : t] || OPS.text;

  /* ---------- modelo ---------- */
  DB.create = function () {
    const status = { id: uid(), name: 'Estado', type: 'select', options: [
      { id: uid(), name: 'Por hacer', color: 'gray' }, { id: uid(), name: 'En curso', color: 'blue' }, { id: uid(), name: 'Hecho', color: 'green' }] };
    const d = {
      id: uid(), name: '', view: 'table',
      cols: [{ id: uid(), name: 'Nombre', type: 'title' }, { id: uid(), name: 'Etiquetas', type: 'multi', options: [] }, status],
      rows: [], sort: null, filters: [], groupBy: status.id, search: '', showFilters: false
    };
    for (let i = 0; i < 3; i++) d.rows.push({ id: uid(), cells: {} });
    return d;
  };
  const read = el => { try { return JSON.parse(el.dataset.db); } catch (_) { return null; } };
  const write = (el, d) => { el.dataset.db = JSON.stringify(d); if (Ed.afterChange) Ed.afterChange(); };
  const col = (d, id) => d.cols.find(c => c.id === id);
  const row = (d, id) => d.rows.find(r => r.id === id);
  const titleCol = d => d.cols.find(c => c.type === 'title') || d.cols[0];
  const optName = (c, id) => { const o = (c.options || []).find(o => o.id === id); return o ? o.name : ''; };
  const optColor = (c, id) => { const o = (c.options || []).find(o => o.id === id); return o ? o.color : 'gray'; };

  function cellText(d, r, c) {
    const v = r.cells[c.id];
    if (v == null || v === '') return '';
    switch (c.type) {
      case 'select': return optName(c, v);
      case 'multi': return (Array.isArray(v) ? v : []).map(id => optName(c, id)).join(', ');
      case 'check': return v ? 'Sí' : 'No';
      default: return String(v);
    }
  }
  function isEmptyVal(c, v) { return v == null || v === '' || (Array.isArray(v) && !v.length) || (c.type === 'check' && !v); }

  function matchFilter(d, r, f) {
    const c = col(d, f.col); if (!c) return true;
    const v = r.cells[c.id];
    const empty = isEmptyVal(c, v);
    const fv = f.value == null ? '' : f.value;
    switch (f.op) {
      case 'empty': return empty;
      case 'nempty': return !empty;
      case 'checked': return !!v;
      case 'unchecked': return !v;
      case 'contains': return norm(cellText(d, r, c)).includes(norm(fv));
      case 'ncontains': return !norm(cellText(d, r, c)).includes(norm(fv));
      case 'is': return c.type === 'select' ? v === fv : c.type === 'date' ? v === fv : norm(cellText(d, r, c)) === norm(fv);
      case 'isnot': return c.type === 'select' ? v !== fv : norm(cellText(d, r, c)) !== norm(fv);
      case 'has': return Array.isArray(v) && v.includes(fv);
      case 'nhas': return !(Array.isArray(v) && v.includes(fv));
      case 'eq': return !empty && +v === +fv;
      case 'ne': return empty || +v !== +fv;
      case 'gt': return !empty && +v > +fv;
      case 'lt': return !empty && +v < +fv;
      case 'before': return !!v && v < fv;
      case 'after': return !!v && v > fv;
      default: return true;
    }
  }
  function compareRows(d, c, a, b) {
    const va = a.cells[c.id], vb = b.cells[c.id];
    const ea = isEmptyVal(c, va), eb = isEmptyVal(c, vb);
    if (ea && eb) return 0; if (ea) return 1; if (eb) return -1;
    if (c.type === 'number') return (+va) - (+vb);
    if (c.type === 'check') return (va ? 1 : 0) - (vb ? 1 : 0);
    if (c.type === 'select') { const oa = (c.options || []).findIndex(o => o.id === va), ob = (c.options || []).findIndex(o => o.id === vb); return oa - ob; }
    return cellText(d, a, c).localeCompare(cellText(d, b, c), 'es', { sensitivity: 'base', numeric: true });
  }
  function visibleRows(d) {
    let rows = d.rows.slice();
    const q = norm(d.search);
    if (q) rows = rows.filter(r => d.cols.some(c => norm(cellText(d, r, c)).includes(q)));
    (d.filters || []).forEach(f => { rows = rows.filter(r => matchFilter(d, r, f)); });
    if (d.sort) { const c = col(d, d.sort.col); if (c) rows.sort((a, b) => compareRows(d, c, a, b) * (d.sort.dir === 'desc' ? -1 : 1)); }
    return rows;
  }

  /* cambio de tipo con conversión razonable de valores */
  function convertType(d, c, type) {
    const from = c.type;
    if (from === type) return;
    if (type === 'select' || type === 'multi') {
      c.options = c.options || [];
      d.rows.forEach(r => {
        let names = [];
        const v = r.cells[c.id];
        if (from === 'select') names = v ? [optName(c, v)] : [];
        else if (from === 'multi') names = (Array.isArray(v) ? v : []).map(id => optName(c, id));
        else if (v != null && v !== '' && from !== 'check') names = String(v).split(',').map(s => s.trim()).filter(Boolean);
        const ids = names.map(n => { let o = c.options.find(o => norm(o.name) === norm(n)); if (!o) { o = { id: uid(), name: n, color: COLORS[c.options.length % COLORS.length] }; c.options.push(o); } return o.id; });
        r.cells[c.id] = type === 'select' ? (ids[0] || '') : ids;
      });
    } else {
      d.rows.forEach(r => {
        const t = cellText(d, r, c);
        if (type === 'number') { const n = parseFloat(String(t).replace(',', '.')); r.cells[c.id] = isNaN(n) ? '' : n; }
        else if (type === 'check') r.cells[c.id] = from === 'check' ? !!r.cells[c.id] : /^(sí|si|yes|true|1|x)$/i.test(t);
        else if (type === 'date') r.cells[c.id] = /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : '';
        else r.cells[c.id] = from === 'check' ? (r.cells[c.id] ? 'Sí' : '') : t;
      });
      if (type !== 'select' && type !== 'multi') delete c.options;
    }
    c.type = type;
    if (d.groupBy === c.id && type !== 'select') d.groupBy = null;
    d.filters = (d.filters || []).filter(f => f.col !== c.id);
  }

  /* ---------- inserción y montaje ---------- */
  DB.insert = function () {
    Ed.focusEditor();
    const editor = Ed.editor;
    const r = Ed.getRange();
    const el = document.createElement('div');
    el.className = 'db';
    el.contentEditable = 'false';
    el.dataset.db = JSON.stringify(DB.create());
    const after = document.createElement('p');
    after.innerHTML = '<br>';
    const block = r ? Ed.closestBlock(r.startContainer, editor) : null;
    if (block && block.parentElement === editor) {
      const empty = !block.textContent.trim() && !block.querySelector('img, table');
      block.after(el, after);
      if (empty) block.remove();
    } else editor.append(el, after);
    render(el);
    if (Ed.afterChange) Ed.afterChange();
    const name = $('.db-name', el);
    if (name) name.focus();
  };

  DB.mountAll = function () { $$('.db', Ed.editor).forEach(el => { if (!el.dataset.db) el.remove(); else render(el); }); };

  /* HTML del editor sin la interfaz renderizada (solo el estado en data-db) */
  DB.stripped = function (editor) {
    const clone = editor.cloneNode(true);
    $$('.db', clone).forEach(el => { el.innerHTML = ''; el.classList.remove('selected'); });
    return clone.innerHTML;
  };

  DB.toMarkdown = function (el) {
    const d = read(el); if (!d) return '';
    const rows = visibleRows(d);
    const line = cells => '| ' + cells.map(c => String(c).replace(/\|/g, '\\|')).join(' | ') + ' |';
    let out = d.name ? '### ' + d.name + '\n\n' : '';
    out += line(d.cols.map(c => c.name)) + '\n|' + ' --- |'.repeat(d.cols.length) + '\n';
    out += rows.map(r => line(d.cols.map(c => cellText(d, r, c)))).join('\n') + '\n\n';
    return out;
  };

  /* ---------- render ---------- */
  const chip = (c, id) => { const n = optName(c, id); return n ? `<span class="db-chip c-${optColor(c, id)}">${esc(n)}</span>` : ''; };

  function cellHtml(d, r, c) {
    const v = r.cells[c.id];
    const a = `data-row="${r.id}" data-col="${c.id}"`;
    switch (c.type) {
      case 'title':
        return `<div class="db-cellwrap"><div class="db-txt db-title" contenteditable="plaintext-only" ${a}>${esc(v)}</div></div>`;
      case 'text':
        return `<div class="db-txt" contenteditable="plaintext-only" ${a}>${esc(v)}</div>`;
      case 'number':
        return `<input type="text" inputmode="decimal" class="db-in db-num" ${a} value="${esc(v)}">`;
      case 'select':
        return `<div class="db-sel" ${a} tabindex="0">${chip(c, v)}</div>`;
      case 'multi':
        return `<div class="db-sel" ${a} tabindex="0">${(Array.isArray(v) ? v : []).map(id => chip(c, id)).join('')}</div>`;
      case 'date':
        return `<input type="date" class="db-in db-date" ${a} value="${esc(v)}">`;
      case 'check':
        return `<label class="db-check"><input type="checkbox" ${a} ${v ? 'checked' : ''}></label>`;
      case 'url':
        return `<div class="db-urlwrap"><input type="text" class="db-in db-url" ${a} value="${esc(v)}" placeholder="https://…">${v ? `<a href="${esc(v)}" target="_blank" rel="noopener" title="Abrir">↗</a>` : ''}</div>`;
      default: return '';
    }
  }

  function filterHtml(d, f, i) {
    const c = col(d, f.col) || d.cols[0];
    const ops = opsFor(c.type);
    if (!ops.some(o => o[0] === f.op)) f.op = ops[0][0];
    const needsValue = !/^(empty|nempty|checked|unchecked)$/.test(f.op);
    let val = '';
    if (needsValue) {
      if (c.type === 'select' || c.type === 'multi') val = `<select class="db-f-val" data-i="${i}"><option value="">—</option>${(c.options || []).map(o => `<option value="${o.id}" ${f.value === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>`;
      else if (c.type === 'date') val = `<input type="date" class="db-f-val" data-i="${i}" value="${esc(f.value)}">`;
      else if (c.type === 'number') val = `<input type="text" inputmode="decimal" class="db-f-val" data-i="${i}" value="${esc(f.value)}" placeholder="Valor">`;
      else val = `<input type="text" class="db-f-val" data-i="${i}" value="${esc(f.value)}" placeholder="Valor">`;
    }
    return `<div class="db-filter" data-i="${i}">
      <select class="db-f-col" data-i="${i}">${d.cols.map(cc => `<option value="${cc.id}" ${cc.id === c.id ? 'selected' : ''}>${esc(cc.name)}</option>`).join('')}</select>
      <select class="db-f-op" data-i="${i}">${ops.map(o => `<option value="${o[0]}" ${o[0] === f.op ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>
      ${val}<button type="button" class="db-f-del" data-i="${i}" title="Quitar filtro">✕</button></div>`;
  }

  function render(el) {
    const d = read(el); if (!d) return;
    const active = document.activeElement;
    const keep = active && el.contains(active) ? { row: active.dataset.row, col: active.dataset.col, cls: active.className } : null;
    const sortCol = d.sort ? col(d, d.sort.col) : null;
    const nFilters = (d.filters || []).length;
    let html = `<div class="db-head">
      <input class="db-name" type="text" placeholder="Base de datos sin título" value="${esc(d.name)}" spellcheck="false">
      <div class="db-tools">
        <button type="button" class="db-tool ${nFilters ? 'active' : ''}" data-tool="filter">Filtro${nFilters ? ' · ' + nFilters : ''}</button>
        <button type="button" class="db-tool ${d.sort ? 'active' : ''}" data-tool="sort">Ordenar${sortCol ? ' · ' + esc(sortCol.name) : ''}</button>
        <input class="db-search" type="search" placeholder="Buscar…" value="${esc(d.search)}">
        <button type="button" class="db-new" data-tool="new">+ Nuevo</button>
      </div>
    </div>`;
    if (d.showFilters || nFilters) {
      html += `<div class="db-filters">${(d.filters || []).map((f, i) => filterHtml(d, f, i)).join('')}<button type="button" class="db-f-add">+ Añadir filtro</button></div>`;
    }
    html += tableHtml(d);
    el.innerHTML = html;
    if (keep) {
      const again = keep.row ? $(`[data-row="${keep.row}"][data-col="${keep.col}"]`, el) : $('.' + keep.cls.split(' ')[0], el);
      if (again) again.focus();
    }
  }

  function tableHtml(d) {
    const rows = visibleRows(d);
    const wstyle = c => c.width ? ` style="width:${c.width}px;min-width:${c.width}px;max-width:${c.width}px"` : '';
    const ths = d.cols.map(c => `<th data-col="${c.id}" draggable="true" title="${TYPES[c.type]}"${wstyle(c)}><span class="db-ticon">${ICONS[c.type]}</span><span class="db-cname">${esc(c.name)}</span>${d.sort && d.sort.col === c.id ? `<span class="db-sortmark">${d.sort.dir === 'desc' ? '↓' : '↑'}</span>` : ''}<span class="db-resize" data-col="${c.id}" title="Arrastra para cambiar el ancho"></span></th>`).join('');
    const trs = rows.map(r => `<tr data-row="${r.id}"><td class="db-gutter"><span class="db-rowdrag" draggable="true" title="Arrastrar para mover · clic para opciones">⋮⋮</span></td>${d.cols.map(c => `<td class="db-td t-${c.type}"${wstyle(c)}>${cellHtml(d, r, c)}</td>`).join('')}<td class="db-td-end"></td></tr>`).join('');
    return `<div class="db-scroll"><table class="db-table"><thead><tr><th class="db-gutter"></th>${ths}<th class="db-addcol" title="Añadir propiedad">+</th></tr></thead>
      <tbody>${trs || `<tr><td colspan="${d.cols.length + 2}" class="db-empty">Sin resultados</td></tr>`}</tbody>
      <tfoot><tr><td colspan="${d.cols.length + 2}"><button type="button" class="db-addrow">+ Nuevo</button><span class="db-count">${rows.length} ${rows.length === 1 ? 'fila' : 'filas'}</span></td></tr></tfoot></table></div>`;
  }

  /* ---------- popover compartido ---------- */
  let pop = null, popEl = null;
  function ensurePop() {
    if (pop) return;
    pop = document.createElement('div');
    pop.className = 'db-pop';
    pop.hidden = true;
    document.body.appendChild(pop);
    document.addEventListener('mousedown', e => { if (!pop.hidden && !(e.target.closest && e.target.closest('.db-pop'))) closePop(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) { closePop(); } });
  }
  function openPop(anchor, html, dbEl) {
    ensurePop();
    popEl = dbEl;
    pop.innerHTML = html;
    pop.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.max(4, Math.min(r.left, window.innerWidth - w - 4)) + 'px';
    pop.style.top = (r.bottom + 4 + h > window.innerHeight ? Math.max(4, r.top - h - 4) : r.bottom + 4) + 'px';
    const first = pop.querySelector('input[type=text], input:not([type])');
    if (first) { first.focus(); first.select(); }
  }
  function closePop() { if (pop) { pop.hidden = true; pop.innerHTML = ''; } popEl = null; }

  function columnMenu(el, d, c, anchor) {
    const isTitle = c.type === 'title';
    openPop(anchor, `<div class="db-pop-sec"><input type="text" class="p-rename" value="${esc(c.name)}" placeholder="Nombre"></div>
      <div class="db-pop-sec"><label>Tipo <select class="p-type" ${isTitle ? 'disabled' : ''}>${Object.keys(TYPES).filter(t => t !== 'title').map(t => `<option value="${t}" ${c.type === t ? 'selected' : ''}>${ICONS[t]} ${TYPES[t]}</option>`).join('')}${isTitle ? '<option selected>Aa Título</option>' : ''}</select></label></div>
      <button type="button" data-p="sort-asc">↑ Ordenar ascendente</button>
      <button type="button" data-p="sort-desc">↓ Ordenar descendente</button>
      <button type="button" data-p="filter">Filtrar por esta propiedad</button>
      <hr><button type="button" data-p="ins-left">← Insertar a la izquierda</button>
      <button type="button" data-p="ins-right">→ Insertar a la derecha</button>
      ${isTitle ? '' : '<hr><button type="button" data-p="delete" class="danger">Eliminar propiedad</button>'}`, el);
    const rename = $('.p-rename', pop);
    rename.addEventListener('change', () => { c.name = rename.value.trim() || c.name; write(el, d); render(el); });
    rename.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); rename.dispatchEvent(new Event('change')); closePop(); } });
    const typeSel = $('.p-type', pop);
    typeSel.addEventListener('change', () => { convertType(d, c, typeSel.value); write(el, d); render(el); closePop(); });
    pop.addEventListener('click', e => {
      const b = e.target.closest('[data-p]'); if (!b) return;
      const i = d.cols.indexOf(c);
      switch (b.dataset.p) {
        case 'sort-asc': d.sort = { col: c.id, dir: 'asc' }; break;
        case 'sort-desc': d.sort = { col: c.id, dir: 'desc' }; break;
        case 'filter': d.filters = d.filters || []; d.filters.push({ col: c.id, op: opsFor(c.type)[0][0], value: '' }); d.showFilters = true; break;
        case 'ins-left': d.cols.splice(i, 0, { id: uid(), name: 'Propiedad', type: 'text' }); break;
        case 'ins-right': d.cols.splice(i + 1, 0, { id: uid(), name: 'Propiedad', type: 'text' }); break;
        case 'delete': d.cols.splice(i, 1); d.rows.forEach(r => delete r.cells[c.id]); if (d.groupBy === c.id) d.groupBy = null; d.filters = (d.filters || []).filter(f => f.col !== c.id); if (d.sort && d.sort.col === c.id) d.sort = null; break;
        default: break;
      }
      write(el, d); render(el); closePop();
    }, { once: true });
  }

  function sortMenu(el, d, anchor) {
    openPop(anchor, `<div class="db-pop-title">Ordenar por</div>${d.cols.map(c => `<div class="db-pop-row"><span>${ICONS[c.type]} ${esc(c.name)}</span><span><button type="button" data-s="${c.id}:asc" class="${d.sort && d.sort.col === c.id && d.sort.dir === 'asc' ? 'active' : ''}">↑</button><button type="button" data-s="${c.id}:desc" class="${d.sort && d.sort.col === c.id && d.sort.dir === 'desc' ? 'active' : ''}">↓</button></span></div>`).join('')}<hr><button type="button" data-s="none">Quitar orden</button>`, el);
    pop.addEventListener('click', e => {
      const b = e.target.closest('[data-s]'); if (!b) return;
      if (b.dataset.s === 'none') d.sort = null; else { const [c, dir] = b.dataset.s.split(':'); d.sort = { col: c, dir }; }
      write(el, d); render(el); closePop();
    }, { once: true });
  }

  /* selector de opciones para selección / selección múltiple */
  function optionPicker(el, d, r, c, anchor) {
    const multi = c.type === 'multi';
    c.options = c.options || [];
    const draw = (q = '') => {
      const cur = multi ? (Array.isArray(r.cells[c.id]) ? r.cells[c.id] : []) : (r.cells[c.id] ? [r.cells[c.id]] : []);
      const list = c.options.filter(o => !q || norm(o.name).includes(norm(q)));
      const exact = c.options.some(o => norm(o.name) === norm(q));
      return `<div class="db-pop-sec"><input type="text" class="o-search" value="${esc(q)}" placeholder="Buscar o crear…"></div>
        <div class="db-opts">${list.map(o => `<div class="db-opt" data-o="${o.id}"><span class="db-chip c-${o.color}">${esc(o.name)}</span>${cur.includes(o.id) ? '<span class="db-optcheck">✓</span>' : ''}<button type="button" class="db-optmore" data-o="${o.id}" title="Opciones">⋯</button></div>`).join('')}
        ${q && !exact ? `<div class="db-opt db-opt-create" data-create="${esc(q)}">Crear <span class="db-chip c-${COLORS[c.options.length % COLORS.length]}">${esc(q)}</span></div>` : ''}
        ${!list.length && !q ? '<div class="db-pop-hint">Escribe para crear una opción</div>' : ''}</div>`;
    };
    openPop(anchor, draw(), el);
    const setVal = id => {
      if (multi) { const cur = Array.isArray(r.cells[c.id]) ? r.cells[c.id].slice() : []; const i = cur.indexOf(id); i >= 0 ? cur.splice(i, 1) : cur.push(id); r.cells[c.id] = cur; }
      else r.cells[c.id] = r.cells[c.id] === id ? '' : id;
      write(el, d); render(el);
    };
    const create = name => { const o = { id: uid(), name, color: COLORS[c.options.length % COLORS.length] }; c.options.push(o); if (multi) { const cur = Array.isArray(r.cells[c.id]) ? r.cells[c.id].slice() : []; cur.push(o.id); r.cells[c.id] = cur; } else r.cells[c.id] = o.id; write(el, d); render(el); };
    const wire = () => {
      const inp = $('.o-search', pop);
      inp.addEventListener('input', () => { const q = inp.value; pop.innerHTML = draw(q); wire(); const i2 = $('.o-search', pop); i2.focus(); i2.setSelectionRange(q.length, q.length); });
      inp.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const q = inp.value.trim();
        const match = c.options.find(o => norm(o.name) === norm(q)) || (q ? c.options.find(o => norm(o.name).includes(norm(q))) : null);
        if (match) setVal(match.id); else if (q) create(q);
        if (!multi) closePop(); else { pop.innerHTML = draw(''); wire(); $('.o-search', pop).focus(); }
      });
      pop.onclick = e => {
        const more = e.target.closest('.db-optmore');
        if (more) { e.stopPropagation(); optionEditor(el, d, c, more.dataset.o, () => { pop.innerHTML = draw(''); wire(); }); return; }
        const cr = e.target.closest('[data-create]');
        if (cr) { create(cr.dataset.create); if (!multi) closePop(); else { pop.innerHTML = draw(''); wire(); } return; }
        const o = e.target.closest('.db-opt[data-o]');
        if (o) { setVal(o.dataset.o); if (!multi) closePop(); else { pop.innerHTML = draw($('.o-search', pop) ? $('.o-search', pop).value : ''); wire(); } }
      };
    };
    wire();
  }
  /* renombrar, recolorear o eliminar una opción */
  function optionEditor(el, d, c, oid, back) {
    const o = c.options.find(x => x.id === oid); if (!o) return;
    pop.innerHTML = `<div class="db-pop-sec"><input type="text" class="oe-name" value="${esc(o.name)}"></div>
      <div class="db-pop-title">Color</div><div class="db-colors">${COLORS.map(cl => `<button type="button" data-c="${cl}" class="db-chip c-${cl} ${o.color === cl ? 'active' : ''}">${COLOR_NAMES[cl]}</button>`).join('')}</div>
      <hr><button type="button" data-oe="delete" class="danger">Eliminar opción</button><button type="button" data-oe="back">← Volver</button>`;
    const name = $('.oe-name', pop);
    name.focus(); name.select();
    name.addEventListener('change', () => { o.name = name.value.trim() || o.name; write(el, d); render(el); });
    name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); name.dispatchEvent(new Event('change')); back(); } });
    pop.onclick = e => {
      const cb = e.target.closest('[data-c]');
      if (cb) { o.color = cb.dataset.c; write(el, d); render(el); back(); return; }
      const b = e.target.closest('[data-oe]'); if (!b) return;
      if (b.dataset.oe === 'delete') {
        c.options = c.options.filter(x => x.id !== oid);
        d.rows.forEach(r => { const v = r.cells[c.id]; if (Array.isArray(v)) r.cells[c.id] = v.filter(x => x !== oid); else if (v === oid) r.cells[c.id] = ''; });
        write(el, d); render(el);
      }
      back();
    };
  }

  /* ---------- eventos (delegados en el editor) ---------- */
  function dbOf(t) { return t && t.closest ? t.closest('.db') : null; }

  function addRow(el, d, preset) {
    const r = { id: uid(), cells: Object.assign({}, preset || {}) };
    d.rows.push(r);
    write(el, d); render(el);
    const tc = titleCol(d);
    const cell = $(`[data-row="${r.id}"][data-col="${tc.id}"]`, el);
    if (cell) cell.focus();
  }

  document.addEventListener('click', e => {
    const el = dbOf(e.target); if (!el || !Ed.editor.contains(el)) return;
    const d = read(el); if (!d) return;
    const t = e.target;
    if (t.closest('.db-resize')) return;
    const btn = t.closest('button, th, .db-sel, .db-rowdrag');
    if (!btn) return;
    if (btn.matches('[data-tool="new"], .db-addrow')) {
      const preset = {};
      if (btn.dataset.opt !== undefined && d.groupBy) preset[d.groupBy] = btn.dataset.opt;
      addRow(el, d, preset); return;
    }
    if (btn.matches('[data-tool="filter"]')) { d.showFilters = !d.showFilters; if (d.showFilters && !(d.filters || []).length) { d.filters = [{ col: d.cols[0].id, op: 'contains', value: '' }]; } else if (!d.showFilters) d.filters = []; write(el, d); render(el); return; }
    if (btn.matches('.db-f-add')) { d.filters = d.filters || []; d.filters.push({ col: d.cols[0].id, op: opsFor(d.cols[0].type)[0][0], value: '' }); write(el, d); render(el); return; }
    if (btn.matches('.db-f-del')) { d.filters.splice(+btn.dataset.i, 1); if (!d.filters.length) d.showFilters = false; write(el, d); render(el); return; }
    if (btn.matches('[data-tool="sort"]')) { sortMenu(el, d, btn); return; }
    if (btn.matches('.db-addcol')) { d.cols.push({ id: uid(), name: 'Propiedad', type: 'text' }); write(el, d); render(el); const th = $$('th[data-col]', el).pop(); if (th) columnMenu(el, d, d.cols[d.cols.length - 1], th); return; }
    if (btn.matches('th[data-col]')) { columnMenu(el, d, col(d, btn.dataset.col), btn); return; }
    if (btn.matches('.db-sel')) { const r = row(d, btn.dataset.row), c = col(d, btn.dataset.col); if (r && c) optionPicker(el, d, r, c, btn); return; }
    if (btn.matches('.db-rowdrag')) { rowMenu(el, d, btn.closest('tr').dataset.row, btn); return; }
  });

  function rowMenu(el, d, rid, anchor) {
    openPop(anchor, `<button type="button" data-r="dup">Duplicar</button><button type="button" data-r="up">↑ Subir</button><button type="button" data-r="down">↓ Bajar</button><hr><button type="button" data-r="delete" class="danger">Eliminar fila</button>`, el);
    pop.addEventListener('click', e => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      const i = d.rows.findIndex(r => r.id === rid); if (i < 0) return;
      if (b.dataset.r === 'dup') { const copy = JSON.parse(JSON.stringify(d.rows[i])); copy.id = uid(); d.rows.splice(i + 1, 0, copy); }
      else if (b.dataset.r === 'delete') d.rows.splice(i, 1);
      else if (b.dataset.r === 'up' && i > 0) { const [r] = d.rows.splice(i, 1); d.rows.splice(i - 1, 0, r); }
      else if (b.dataset.r === 'down' && i < d.rows.length - 1) { const [r] = d.rows.splice(i, 1); d.rows.splice(i + 1, 0, r); }
      write(el, d); render(el); closePop();
    }, { once: true });
  }

  /* texto de celdas: se guarda sin volver a renderizar */
  const pendingWrite = new Map();
  DB.onInput = function (e) {
    const el = dbOf(e.target); if (!el) return;
    const d = read(el); if (!d) return;
    const t = e.target;
    if (t.matches('.db-txt')) {
      const r = row(d, t.dataset.row); if (!r) return;
      r.cells[t.dataset.col] = t.textContent.replace(/\u200B/g, '');
      el.dataset.db = JSON.stringify(d);
      clearTimeout(pendingWrite.get(el));
      pendingWrite.set(el, setTimeout(() => { if (Ed.afterChange) Ed.afterChange(); }, 300));
    } else if (t.matches('.db-name')) {
      d.name = t.value; el.dataset.db = JSON.stringify(d);
      clearTimeout(pendingWrite.get(el));
      pendingWrite.set(el, setTimeout(() => { if (Ed.afterChange) Ed.afterChange(); }, 300));
    } else if (t.matches('.db-search')) {
      d.search = t.value; el.dataset.db = JSON.stringify(d);
      clearTimeout(pendingWrite.get(el));
      pendingWrite.set(el, setTimeout(() => { render(el); if (Ed.afterChange) Ed.afterChange(); }, 200));
    }
  };

  document.addEventListener('change', e => {
    const el = dbOf(e.target); if (!el || !Ed.editor.contains(el)) return;
    const d = read(el); if (!d) return;
    const t = e.target;
    if (t.matches('.db-num')) { const r = row(d, t.dataset.row); const n = parseFloat(t.value.replace(',', '.')); r.cells[t.dataset.col] = t.value.trim() === '' || isNaN(n) ? '' : n; write(el, d); if (d.sort || (d.filters || []).length) render(el); else t.value = r.cells[t.dataset.col]; return; }
    if (t.matches('.db-date, .db-url')) { const r = row(d, t.dataset.row); r.cells[t.dataset.col] = t.value; write(el, d); render(el); return; }
    if (t.matches('.db-check input')) { const r = row(d, t.dataset.row); r.cells[t.dataset.col] = t.checked; write(el, d); if (d.sort || (d.filters || []).length) render(el); return; }
    if (t.matches('.db-f-col')) { const f = d.filters[+t.dataset.i]; f.col = t.value; f.op = opsFor(col(d, f.col).type)[0][0]; f.value = ''; write(el, d); render(el); return; }
    if (t.matches('.db-f-op')) { d.filters[+t.dataset.i].op = t.value; write(el, d); render(el); return; }
    if (t.matches('.db-f-val')) { d.filters[+t.dataset.i].value = t.value; write(el, d); render(el); return; }
  });
  /* búsqueda y filtros de texto: aplicar mientras se escribe */
  document.addEventListener('input', e => {
    const el = dbOf(e.target); if (!el || !Ed.editor.contains(el)) return;
    const t = e.target;
    if (t.matches('.db-f-val') && t.type === 'text') {
      const d = read(el); d.filters[+t.dataset.i].value = t.value; el.dataset.db = JSON.stringify(d);
      clearTimeout(pendingWrite.get(el));
      pendingWrite.set(el, setTimeout(() => { render(el); const again = $(`.db-f-val[data-i="${t.dataset.i}"]`, el); if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); } if (Ed.afterChange) Ed.afterChange(); }, 250));
    }
  });

  /* teclado dentro de la base de datos */
  DB.onKeydown = function (e) {
    const t = e.target;
    const el = dbOf(t); if (!el) return;
    if (t.matches('.db-txt')) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const d = read(el);
        const cells = $$(`.db-txt[data-col="${t.dataset.col}"]`, el);
        const i = cells.indexOf(t);
        if (i >= 0 && i < cells.length - 1) cells[i + 1].focus();
        else if (d.view === 'table') addRow(el, d, {});
        else t.blur();
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); t.blur(); return; }
      if (e.key === 'Tab') {
        e.preventDefault();
        const focusables = $$('.db-txt, .db-in, .db-sel, .db-check input', el);
        const i = focusables.indexOf(t);
        const n = focusables[i + (e.shiftKey ? -1 : 1)];
        if (n) n.focus();
        return;
      }
      return; /* resto de teclas: edición normal de la celda */
    }
    if (t.matches('.db-sel') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); t.click(); return; }
    if (t.matches('.db-name') && e.key === 'Enter') { e.preventDefault(); t.blur(); return; }
    if ((t.matches('.db-in') || t.matches('.db-search')) && e.key === 'Enter') { e.preventDefault(); t.blur(); }
  };

  /* Retroceso/Suprimir junto a la base de datos: primero se selecciona, después se borra */
  DB.onEditorKeydown = function (e) {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return false;
    const editor = Ed.editor;
    const sel = $('.db.selected', editor);
    if (sel) { e.preventDefault(); const p = sel.nextElementSibling; sel.remove(); if (p && Ed.BLOCK_TAGS.has(p.tagName)) Ed.setCaret(p, 0); if (Ed.afterChange) Ed.afterChange(); return true; }
    const r = Ed.getRange();
    if (!r || !r.collapsed) return false;
    const block = Ed.closestBlock(r.startContainer, editor);
    if (!block || block.parentElement !== editor) return false;
    const pre = document.createRange(); pre.setStart(block, 0); pre.setEnd(r.startContainer, r.startOffset);
    const post = document.createRange(); post.setStart(r.startContainer, r.startOffset); post.setEnd(block, block.childNodes.length);
    const target = e.key === 'Backspace' && !pre.toString() ? block.previousElementSibling : e.key === 'Delete' && !post.toString().trim() ? block.nextElementSibling : null;
    if (!target || !target.classList || !target.classList.contains('db')) return false;
    e.preventDefault();
    target.classList.add('selected');
    target.scrollIntoView({ block: 'nearest' });
    return true;
  };
  document.addEventListener('selectionchange', () => { $$('.db.selected', Ed.editor).forEach(el => { const r = Ed.getRange(); if (r) el.classList.remove('selected'); }); });

  /* ---------- arrastre: columnas, filas y tarjetas ---------- */
  let drag = null;
  document.addEventListener('dragstart', e => {
    const el = dbOf(e.target); if (!el) return;
    const t = e.target;
    if (t.matches('th[data-col]')) drag = { el, kind: 'col', id: t.dataset.col };
    else if (t.matches('.db-rowdrag')) drag = { el, kind: 'row', id: t.closest('tr').dataset.row };
    else return;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', drag.id); } catch (_) { /* ignorar */ }
  });
  document.addEventListener('dragover', e => {
    if (!drag) return;
    const el = dbOf(e.target); if (el !== drag.el) return;
    const over = drag.kind === 'col' ? e.target.closest('th[data-col]') : e.target.closest('tr[data-row]');
    if (!over) return;
    e.preventDefault();
    $$('.drop-target', el).forEach(x => x.classList.remove('drop-target'));
    over.classList.add('drop-target');
  });
  document.addEventListener('drop', e => {
    if (!drag) return;
    const el = dbOf(e.target); if (el !== drag.el) { drag = null; return; }
    e.preventDefault();
    const d = read(el);
    if (drag.kind === 'col') {
      const over = e.target.closest('th[data-col]');
      if (over && over.dataset.col !== drag.id) { const from = d.cols.findIndex(c => c.id === drag.id), to = d.cols.findIndex(c => c.id === over.dataset.col); const [c] = d.cols.splice(from, 1); d.cols.splice(to, 0, c); }
    } else if (drag.kind === 'row') {
      const over = e.target.closest('tr[data-row]');
      if (over && over.dataset.row !== drag.id) { const from = d.rows.findIndex(r => r.id === drag.id), to = d.rows.findIndex(r => r.id === over.dataset.row); const [r] = d.rows.splice(from, 1); d.rows.splice(to, 0, r); d.sort = null; }
    }
    drag = null;
    write(el, d); render(el);
  });
  document.addEventListener('dragend', () => { if (drag) { $$('.drop-target', drag.el).forEach(x => x.classList.remove('drop-target')); drag = null; } });

  /* ---------- ancho de columnas: arrastrar el borde derecho del encabezado ---------- */
  let rs = null;
  document.addEventListener('pointerdown', e => {
    const h = e.target.closest && e.target.closest('.db-resize');
    if (!h) return;
    const el = dbOf(h); if (!el || !Ed.editor.contains(el)) return;
    e.preventDefault(); e.stopPropagation();
    const th = h.closest('th');
    th.draggable = false;
    const z = (Ed.page && Ed.page.state.zoom) || 1;
    rs = { el, th, col: h.dataset.col, x: e.clientX, w: th.getBoundingClientRect().width / z, z };
    document.body.classList.add('col-resizing');
  });
  document.addEventListener('pointermove', e => {
    if (!rs) return;
    const w = Math.max(60, Math.round(rs.w + (e.clientX - rs.x) / rs.z));
    const css = `width:${w}px;min-width:${w}px;max-width:${w}px`;
    rs.th.style.cssText = css;
    $$(`td:nth-child(${Array.from(rs.th.parentElement.children).indexOf(rs.th) + 1})`, rs.el).forEach(td => { td.style.cssText = css; });
    rs.cur = w;
  });
  const endResize = () => {
    if (!rs) return;
    const { el, col: cid, cur, th } = rs;
    rs = null;
    document.body.classList.remove('col-resizing');
    th.draggable = true;
    if (!cur) return;
    const d = read(el); const c = col(d, cid);
    if (c) { c.width = cur; write(el, d); render(el); }
  };
  document.addEventListener('pointerup', endResize);
  document.addEventListener('pointercancel', endResize);

  /* el editor arranca antes de que exista este módulo: montar lo que ya haya en el documento */
  DB.mountAll();
})(window.Ed);
