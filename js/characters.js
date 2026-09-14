/* Personajes: base interna por documento (a partir de los bloques "Personaje"), color fijo por
   personaje según la paleta, subrayado de color y sugerencias al escribir el nombre. */
(function (Ed) {
  'use strict';
  const C = {};
  Ed.characters = C;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const editor = () => Ed.editor;

  /* paleta: [nombre, claro, oscuro] */
  C.PALETTE = [
    ['Azul', '#DFE8FF', '#26417F'], ['Verde', '#E2F0E0', '#2C5730'], ['Terracota', '#FBE6DA', '#8A4320'], ['Violeta', '#EDE0F7', '#563180'],
    ['Ámbar', '#FBF0D2', '#7A5410'], ['Rosa', '#FBDFE6', '#8A2B47'], ['Teal', '#D8EFEE', '#1F5B58'], ['Oliva', '#E8EED3', '#4E5C1E'],
    ['Índigo', '#DEE0F8', '#333B85'], ['Coral', '#FDE2DC', '#8F3A2C'], ['Ciruela', '#F3DCEF', '#71306A'], ['Arena', '#EFE7DA', '#6B5638'],
    ['Cielo', '#D9ECFA', '#1F5476'], ['Lima', '#E6F2CF', '#4A6013'], ['Óxido', '#F8E3CD', '#835012'], ['Grafito', '#E4E4E2', '#3B3B39']
  ];

  /* registro: clave normalizada → { name, color }. Viaja dentro del documento (ver Ed.document). */
  let registry = {};
  /* el elenco de fuera (ClapCraft: los personajes de todo el guion): se sugiere y manda en los colores,
     pero no se guarda en el documento */
  let global = {};
  C.export = () => JSON.parse(JSON.stringify(registry));
  C.import = obj => { registry = obj && typeof obj === 'object' ? JSON.parse(JSON.stringify(obj)) : {}; if (Ed.editor) C.refresh(); };

  const clean = s => String(s || '').replace(/\u200B/g, '').replace(/\s+/g, ' ').trim();
  /* "MARA (V.O.)" y "Mara" son el mismo personaje */
  const key = s => clean(s).replace(/\s*\([^)]*\)\s*$/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const save = () => { if (Ed.afterChange) Ed.afterChange(); };

  C.setGlobal = function (lista) {
    global = {};
    (lista || []).forEach(p => { const k = key(p && p.name); if (k) global[k] = { name: clean(p.name), color: C.PALETTE[p.color] ? p.color : 0 }; });
    Object.keys(registry).forEach(k => { if (global[k]) { registry[k].color = global[k].color; registry[k].name = global[k].name; } });   // manda el elenco
    if (Ed.editor) C.refresh();
  };
  function nextColor() {
    const used = Object.values(registry).map(r => r.color).concat(Object.values(global).map(r => r.color));
    for (let i = 0; i < C.PALETTE.length; i++) if (!used.includes(i)) return i;
    return Object.keys(registry).length % C.PALETTE.length;
  }
  C.register = function (name) {
    const k = key(name);
    if (!k) return null;
    if (!registry[k]) { registry[k] = global[k] ? { name: global[k].name, color: global[k].color } : { name: clean(name).replace(/\s*\([^)]*\)\s*$/, ''), color: nextColor() }; save(); }
    return registry[k];
  };
  C.list = () => {
    const nombres = new Map();
    Object.values(global).concat(Object.values(registry)).forEach(r => { const k = key(r.name); if (!nombres.has(k)) nombres.set(k, r.name); });
    return Array.from(nombres.values()).sort((a, b) => a.localeCompare(b, 'es'));
  };
  C.has = word => !!registry[key(word)];
  C.colorOf = name => { const r = registry[key(name)] || global[key(name)]; return r ? C.PALETTE[r.color] : null; };
  /* El personaje de un bloque (null si el bloque no es un personaje registrado). */
  C.entryOf = block => (block && block.classList && block.classList.contains('sp-character')) ? registry[key(block.textContent)] || null : null;

  /* ---------- color elegido a mano: se aplica a todas las menciones del personaje ---------- */
  C.setColor = function (name, i) {
    const r = registry[key(name)];
    if (!r || !C.PALETTE[i]) return false;
    r.color = i;
    $$('p.sp-character', editor()).forEach(b => { if (key(b.textContent) === key(name)) b.removeAttribute('data-ch'); });
    C.refresh(); save();
    return true;
  };
  /* Sección del menú contextual: la paleta para el personaje del bloque. */
  C.ctxHtml = function (block) {
    const r = C.entryOf(block);
    if (!r) return '';
    /* las muestras van como las del marcatextos de la cinta: el tono con el que se pinta el
       personaje en el tema actual (claro en modo claro, oscuro en modo oscuro) */
    const dark = document.documentElement.dataset.theme === 'dark';
    return '<div class="ctx-title">Personaje · ' + Ed.escapeHtml(r.name.toUpperCase()) + ' · color</div>'
      + '<div class="ctx-swatches cp-grid">' + C.PALETTE.map((t, i) =>
        `<button type="button" class="ctx-swatch${i === r.color ? ' current' : ''}" data-chcolor="${i}" data-chname="${Ed.escapeHtml(r.name)}" title="${Ed.escapeHtml(t[0])}" style="background:${dark ? t[2] : t[1]}"></button>`).join('')
      + '</div><hr>';
  };

  /* ---------- colorear los bloques de personaje ---------- */
  function paint(block, allowRegister) {
    const name = clean(block.textContent);
    const k = key(name);
    if (!k) { block.style.removeProperty('--chl'); block.style.removeProperty('--chd'); block.removeAttribute('data-ch'); return; }
    /* el bloque que se está escribiendo solo se colorea si ya coincide con un personaje conocido */
    const r = registry[k] || (allowRegister && k.length >= 2 ? C.register(name) : null);
    if (!r) { block.removeAttribute('data-ch'); block.style.removeProperty('--chl'); block.style.removeProperty('--chd'); return; }
    const [, light, dark] = C.PALETTE[r.color];
    if (block.dataset.ch !== String(r.color)) {
      block.dataset.ch = r.color;
      block.style.setProperty('--chl', light);
      block.style.setProperty('--chd', dark);
    }
  }
  C.refresh = function () {
    const editing = document.activeElement === editor() ? currentCharBlock() : null;
    const bloques = $$('p.sp-character', editor());
    /* un nombre que ya no está en ningún bloque de personaje sale del registro: así una errata que llegó a
       registrarse (al salir del bloque antes de corregirla) no se queda como personaje */
    const vivos = new Set(bloques.map(b => key(b.textContent)).filter(Boolean));
    Object.keys(registry).forEach(k => { if (!vivos.has(k)) delete registry[k]; });
    bloques.forEach(b => paint(b, b !== editing));
    /* los bloques que dejaron de ser personaje pierden el color */
    $$('[data-ch]:not(.sp-character)', editor()).forEach(b => { b.removeAttribute('data-ch'); b.style.removeProperty('--chl'); b.style.removeProperty('--chd'); });
  };
  C.schedule = Ed.debounce(C.refresh, 250);

  /* ---------- sugerencias ---------- */
  let menu, items = [], index = 0, activeBlock = null;
  function build() {
    menu = document.createElement('div');
    menu.className = 'ctx-menu char-menu';
    menu.hidden = true;
    document.body.appendChild(menu);
    menu.addEventListener('mousedown', e => e.preventDefault());
    menu.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) accept(+b.dataset.i, false); });
    document.addEventListener('mousedown', e => { if (!menu.hidden && !(e.target.closest && e.target.closest('.char-menu'))) close(); });
    let lastBlock = null;
    document.addEventListener('selectionchange', () => {
      if (!menu.hidden) { const b = currentCharBlock(); if (b !== activeBlock) close(); }
      /* al salir de un bloque de personaje se registra su nombre */
      const b = currentCharBlock();
      if (lastBlock && b !== lastBlock) C.refresh();              // registra el que se deja y poda los que ya no están
      lastBlock = b;
    });
    editor().addEventListener('input', () => { if (Ed.page) C.schedule(); });
    C.refresh();
  }
  function currentCharBlock() {
    const r = Ed.getRange();
    if (!r || !r.collapsed || !editor().contains(r.startContainer)) return null;
    const b = Ed.closestBlock(r.startContainer, editor());
    return b && b.classList.contains('sp-character') ? b : null;
  }
  function close() { if (menu) menu.hidden = true; items = []; activeBlock = null; }
  C.isOpen = () => !!menu && !menu.hidden;

  function render(q) {
    const nq = key(q);
    items = nq ? C.list().filter(n => key(n).startsWith(nq) && key(n) !== nq) : [];
    if (!items.length) { close(); return; }
    index = Math.min(index, items.length - 1);
    menu.innerHTML = '<div class="ctx-title">Personajes</div>' + items.map((n, i) => {
      const col = C.colorOf(n);
      return `<button type="button" data-i="${i}" class="${i === index ? 'active' : ''}"><span><i class="char-dot" style="background:${col ? col[2] : '#888'}"></i>${Ed.escapeHtml(n.toUpperCase())}</span>${i === 0 ? '<kbd>Tab</kbd>' : ''}</button>`;
    }).join('');
    menu.hidden = false;
    const r = Ed.getRange();
    let rect = r ? r.getBoundingClientRect() : null;
    if (!rect || !rect.height) rect = activeBlock.getBoundingClientRect();
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - w - 4)) + 'px';
    menu.style.top = (rect.bottom + 6 + h > window.innerHeight ? Math.max(4, rect.top - h - 6) : rect.bottom + 6) + 'px';
  }

  /* rellena el bloque con el nombre elegido; con Enter además pasa al diálogo */
  function accept(i, andContinue) {
    const name = items[i];
    const block = activeBlock;
    close();
    if (!name || !block) return;
    const r = document.createRange();
    r.selectNodeContents(block);
    Ed.restoreSelection(r);
    Ed.cmd('insertText', name);
    paint(block, true);
    if (Ed.afterChange) Ed.afterChange();
    if (andContinue && Ed.screenplay && Ed.screenplay.continueFrom) Ed.screenplay.continueFrom(block);
  }

  C.onInput = function (e) {
    if (e.inputType && !/^insert(Text|CompositionText)$/.test(e.inputType) && !/^delete/.test(e.inputType)) return;
    const b = currentCharBlock();
    if (!b) { if (!menu.hidden) close(); return; }
    const q = clean(b.textContent);
    if (!q) { close(); return; }
    activeBlock = b;
    if (menu.hidden) index = 0;
    render(q);
  };
  C.onKeydown = function (e) {
    if (!menu || menu.hidden) return false;
    if (e.key === 'ArrowDown') { e.preventDefault(); index = (index + 1) % items.length; render(clean(activeBlock.textContent)); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); index = (index - 1 + items.length) % items.length; render(clean(activeBlock.textContent)); return true; }
    if (e.key === 'Tab') { e.preventDefault(); accept(index, false); return true; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); accept(index, true); return true; }
    if (e.key === 'Escape') { e.preventDefault(); close(); return true; }
    return false;
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})(window.Ed);
