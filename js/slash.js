/* Menú de comandos con "/" (estilo Notion): se abre al escribir "/" al inicio de un bloque o tras un espacio */
(function (Ed) {
  'use strict';
  const S = { open: false };
  Ed.slash = S;
  const $ = (s, r = document) => r.querySelector(s);

  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const COMMANDS = [
    { group: 'Bloques', id: 'text', label: 'Texto', keys: 'texto normal parrafo', hint: 'Ctrl+Alt+0', run: () => { Ed.screenplay.set(null); Ed.cmd('formatBlock', 'p'); } },
    { group: 'Bloques', id: 'h1', label: 'Título 1', keys: 'titulo encabezado h1', hint: 'Ctrl+Alt+1', run: () => Ed.cmd('formatBlock', 'h1') },
    { group: 'Bloques', id: 'h2', label: 'Título 2', keys: 'titulo encabezado h2', hint: 'Ctrl+Alt+2', run: () => Ed.cmd('formatBlock', 'h2') },
    { group: 'Bloques', id: 'h3', label: 'Título 3', keys: 'titulo encabezado h3', hint: 'Ctrl+Alt+3', run: () => Ed.cmd('formatBlock', 'h3') },
    { group: 'Bloques', id: 'ul', label: 'Lista con viñetas', keys: 'lista vinetas', hint: '- ', run: () => Ed.md.toList(currentBlock(), 'UL') },
    { group: 'Bloques', id: 'ol', label: 'Lista numerada', keys: 'lista numerada numeros', hint: '1. ', run: () => Ed.md.toList(currentBlock(), 'OL') },
    { group: 'Bloques', id: 'quote', label: 'Cita', keys: 'cita quote', hint: '> ', run: () => Ed.md.toQuote(currentBlock()) },
    { group: 'Bloques', id: 'code', label: 'Bloque de código', keys: 'codigo code', hint: '```', run: () => Ed.cmd('formatBlock', 'pre') },
    { group: 'Bloques', id: 'table', label: 'Tabla', keys: 'tabla', hint: '', run: () => Ed.table.insert() },
    { group: 'Bloques', id: 'db', label: 'Base de datos', keys: 'int base datos database db tablero board kanban', hint: '/int', run: () => Ed.db.insert() },
    { group: 'Bloques', id: 'hr', label: 'Línea horizontal', keys: 'linea separador hr', hint: '---', run: () => Ed.cmd('insertHorizontalRule') },
    { group: 'Bloques', id: 'link', label: 'Enlace', keys: 'enlace link url', hint: 'Ctrl+K', run: () => Ed.actions.link() }
  ];
  Ed.screenplay.KINDS.forEach(k => COMMANDS.push({ group: 'Guion', id: 'sp-' + k.id, label: k.label, keys: k.keys, hint: k.atajo ? 'Ctrl+' + k.atajo : k.hint, run: () => Ed.screenplay.set(k.id) }));
  /* el diálogo doble (js/doble.js), detrás del diálogo: junta dos diálogos seguidos, pone uno en blanco o lo separa */
  COMMANDS.splice(COMMANDS.findIndex(c => c.id === 'sp-dialogue') + 1, 0, { group: 'Guion', id: 'doble', label: 'Diálogo doble', keys: 'dialogo-doble dialogo doble dual simultaneo columnas', hint: 'dos columnas', run: () => Ed.doble && Ed.doble.alternar() });
  COMMANDS.push({ group: 'Guion', id: 'portada', label: 'Portada', keys: 'portada titulo cubierta', hint: 'formulario', run: () => Ed.portada && Ed.portada.editar() });

  let menu, anchorNode = null, anchorOffset = -1, items = [], index = 0;

  function currentBlock() { const r = Ed.getRange(); return r ? Ed.closestBlock(r.startContainer, Ed.editor) : null; }

  function build() {
    menu = document.createElement('div');
    menu.className = 'ctx-menu slash-menu';
    menu.hidden = true;
    document.body.appendChild(menu);
    menu.addEventListener('mousedown', e => e.preventDefault());
    menu.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) choose(+b.dataset.i); });
    document.addEventListener('mousedown', e => { if (S.open && !(e.target.closest && e.target.closest('.slash-menu'))) close(true); });
    document.addEventListener('selectionchange', () => { if (S.open) requestAnimationFrame(refresh); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();

  /* Texto escrito tras la barra (query); null si el cursor ya no está en su sitio */
  function query() {
    const r = Ed.getRange();
    if (!r || !r.collapsed || r.startContainer !== anchorNode || r.startOffset <= anchorOffset) return null;
    const text = anchorNode.nodeValue.slice(anchorOffset, r.startOffset);
    if (text[0] !== '/') return null;
    return text.slice(1).replace(/\u00A0/g, ' ');
  }

  function render(q) {
    const nq = norm(q);
    /* en modo guion solo se ofrecen los elementos de guion */
    const pool = Ed.page && Ed.page.state.script ? COMMANDS.filter(c => c.group === 'Guion') : COMMANDS;
    items = pool.filter(c => !nq || norm(c.label).includes(nq) || c.keys.split(' ').some(k => k.startsWith(nq)));
    if (!items.length) { close(); return; }
    index = Math.min(index, items.length - 1);
    let html = '';
    let group = '';
    items.forEach((c, i) => {
      if (c.group !== group) { group = c.group; html += `<div class="ctx-title">${group}</div>`; }
      html += `<button type="button" data-i="${i}" class="${i === index ? 'active' : ''}"><span>${Ed.escapeHtml(c.label)}</span>${c.hint ? `<kbd>${Ed.escapeHtml(c.hint)}</kbd>` : ''}</button>`;
    });
    menu.innerHTML = html;
    menu.hidden = false;
    position();
    const act = menu.querySelector('.active');
    if (act) act.scrollIntoView({ block: 'nearest' });
  }
  function position() {
    const r = Ed.getRange();
    if (!r) return;
    let rect = r.getBoundingClientRect();
    if (!rect.height) { const b = currentBlock(); if (b) rect = b.getBoundingClientRect(); }
    const w = menu.offsetWidth, h = menu.offsetHeight;
    const left = Math.max(4, Math.min(rect.left, window.innerWidth - w - 4));
    const below = rect.bottom + 6;
    menu.style.left = left + 'px';
    menu.style.top = (below + h > window.innerHeight - 4 ? Math.max(4, rect.top - h - 6) : below) + 'px';
  }
  function refresh() {
    const q = query();
    if (q === null || (q.length > 24)) { close(); return; }
    render(q);
  }
  let auto = false;                                          // abierto con Enter en una línea vacía (no se tecleó la «/»)
  function close(quitarBarra) {
    /* abierto por Enter y cerrado sin elegir: la «/» que puso el menú no se queda en el texto */
    if (quitarBarra && auto && anchorNode) {
      const r = Ed.getRange();
      if (r && r.collapsed && r.startContainer === anchorNode && r.startOffset === anchorOffset + 1 && anchorNode.nodeValue[anchorOffset] === '/') {
        const del = document.createRange(); del.setStart(anchorNode, anchorOffset); del.setEnd(anchorNode, anchorOffset + 1);
        Ed.restoreSelection(del); Ed.cmd('delete');
      }
    }
    auto = false; S.open = false; if (menu) menu.hidden = true; anchorNode = null;
  }
  /* Abre el menú en el cursor sin que se haya tecleado la «/» (la pone él y la quita si se cierra sin elegir). */
  S.abrirAqui = function () {
    if (!menu || !Ed.editor) return false;
    Ed.cmd('insertText', '/');                                 // el `input` de esta inserción abre el menú (S.onInput)
    if (!S.open) return false;
    auto = true;
    return true;
  };

  function choose(i) {
    const cmd = items[i];
    if (!cmd) return;
    const r = Ed.getRange();
    if (r && r.startContainer === anchorNode) {
      const del = document.createRange();
      del.setStart(anchorNode, anchorOffset);
      del.setEnd(anchorNode, r.startOffset);
      Ed.restoreSelection(del);
      Ed.cmd('delete');
      const block = currentBlock();
      if (block && !block.textContent.replace(/\u200B/g, '') && !block.querySelector('br, img, table')) {
        block.appendChild(document.createElement('br'));
        Ed.setCaret(block, 0);
      }
    }
    close();
    cmd.run();
    if (Ed.afterChange) Ed.afterChange();
    if (Ed.updateToolbar) Ed.updateToolbar();
  }

  /* Se llama desde el evento input del editor */
  S.onInput = function (e) {
    if (S.open) { refresh(); return; }
    if (e.inputType !== 'insertText' || e.data !== '/') return;
    const ctx = Ed.textBeforeCaretInBlock(Ed.editor);
    if (!ctx) return;
    if (ctx.block.tagName === 'PRE' || ctx.block.closest('pre')) return;
    const before = ctx.text.replace(/\u00A0/g, ' ');
    if (!/(^|\s)\/$/.test(before)) return;
    const r = Ed.getRange();
    if (!r || r.startContainer.nodeType !== 3) return;
    anchorNode = r.startContainer;
    anchorOffset = r.startOffset - 1;
    index = 0;
    S.open = true;
    render('');
  };

  /* Teclas mientras el menú está abierto */
  S.onKeydown = function (e) {
    if (!S.open) return false;
    if (e.key === 'ArrowDown') { e.preventDefault(); index = (index + 1) % items.length; render(query() || ''); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); index = (index - 1 + items.length) % items.length; render(query() || ''); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(index); return true; }
    if (e.key === 'Escape') { e.preventDefault(); close(true); return true; }
    return false;
  };
})(window.Ed);
