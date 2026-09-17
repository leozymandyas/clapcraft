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
    ['Azul', '#DBE8FF', '#1A4A86'], ['Verde', '#D8F2DF', '#11643D'], ['Terracota', '#FFE3D5', '#9C3F14'], ['Violeta', '#EAE0FF', '#5326AB'],
    ['Ámbar', '#FFEEC9', '#875408'], ['Rosa', '#FFE0EA', '#A51A5A'], ['Teal', '#D2F0ED', '#0A6663'], ['Oliva', '#E8F4CD', '#4C6B0F'],
    ['Índigo', '#E2E2FF', '#33359C'], ['Coral', '#FFE3DD', '#A83A26'], ['Ciruela', '#F9DCF6', '#8B2280'], ['Arena', '#F4E8CF', '#6F5722'],
    ['Cielo', '#D6EEFF', '#05618F'], ['Lima', '#E9F8C8', '#4F7205'], ['Óxido', '#FFE0C4', '#94480A'], ['Grafito', '#E6E2EE', '#3C3648']
  ];

  /* registro: clave normalizada → { name, color }. Viaja dentro del documento (ver Ed.document). */
  let registry = {};
  /* el elenco de fuera (ClapCraft: los personajes de todo el guion): se sugiere y manda en los colores,
     pero no se guarda en el documento */
  let global = {};
  C.export = () => JSON.parse(JSON.stringify(registry));
  C.import = obj => { registry = obj && typeof obj === 'object' ? JSON.parse(JSON.stringify(obj)) : {}; if (Ed.editor) C.refresh(); };

  const clean = s => String(s || '').replace(/\u200B/g, '').replace(/\s+/g, ' ').trim();
  /* **Un doble espacio suelta el personaje** (Leo, 16-09-2026): lo que va detrás es una anotación («V.O.»,
     «CONT'D», «(O.S.)») y no hace un personaje nuevo. Chrome escribe el segundo espacio como NBSP. */
  const DOBLE = /[ \u00a0\u2007\u202f\t]{2,}/;
  C.suelto = t => DOBLE.test(String(t || '').replace(/\u200B/g, ''));
  const soloNombre = s => String(s || '').replace(/\u200B/g, '').split(DOBLE)[0];
  /* "MARA (V.O.)" y "Mara" son el mismo personaje */
  const key = s => clean(soloNombre(s)).replace(/\s*\([^)]*\)\s*$/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
    if (!registry[k]) { registry[k] = global[k] ? { name: global[k].name, color: global[k].color } : { name: clean(soloNombre(name)).replace(/\s*\([^)]*\)\s*$/, ''), color: nextColor() }; save(); }
    return registry[k];
  };
  C.list = () => {
    const nombres = new Map();
    Object.values(global).concat(Object.values(registry)).forEach(r => { const k = key(r.name); if (!nombres.has(k)) nombres.set(k, r.name); });
    return Array.from(nombres.values()).sort((a, b) => a.localeCompare(b, 'es'));
  };
  /* ¿es el nombre (o una palabra del nombre) de un personaje del documento o del guion? El corrector no lo marca:
     «Ana» en «INT. CASA DE ANA» o «Lioncourt» de «Lestat de Lioncourt» no son erratas. */
  C.has = word => {
    const k = key(word); if (!k) return false;
    if (registry[k] || global[k]) return true;
    return Object.values(global).concat(Object.values(registry)).some(r => key(r.name).split(/\s+/).includes(k));
  };
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

  /* ---------- el nombre en su chip y la anotación en texto normal ----------
     Con el personaje soltado (doble espacio), «MARA» se queda en un `span.ch-nom` (el que lleva el color) y «(V.O.)»
     detrás, como texto corriente (Leo, 16-09-2026). Sin anotación, el bloque vuelve a ser texto suelto. */
  function offsetCursor(b) {                                  // dónde está el cursor dentro del texto del bloque
    const r = Ed.getRange();
    if (!r || !r.collapsed || !b.contains(r.startContainer)) return null;
    const pre = document.createRange();
    pre.selectNodeContents(b); pre.setEnd(r.startContainer, r.startOffset);
    return pre.toString().length;
  }
  function ponerCursor(b, off) {                              // y devolverlo al mismo sitio tras rehacer el bloque
    if (off == null) return;
    const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
    let visto = 0, n;
    while ((n = w.nextNode())) {
      const largo = n.nodeValue.length;
      if (visto + largo >= off) { const r = document.createRange(); r.setStart(n, off - visto); r.collapse(true); Ed.restoreSelection(r); return; }
      visto += largo;
    }
    const r = document.createRange(); r.selectNodeContents(b); r.collapse(false); Ed.restoreSelection(r);
  }
  function separar(b, editando) {
    const txt = b.textContent.replace(/​/g, '');
    const span = b.querySelector(':scope > .ch-nom');
    /* soltado pero sin anotación y ya fuera del bloque: se recoge el doble espacio y vuelve a ser solo el nombre */
    if (C.suelto(txt) && !editando && !txt.split(DOBLE).slice(1).join('').trim()) {
      const solo = soloNombre(txt);
      if (b.textContent !== solo) b.textContent = solo;
      return true;
    }
    if (!C.suelto(txt)) {                                     // sin doble espacio no hay anotación: texto suelto
      if (!span) return false;
      const off = offsetCursor(b);
      b.textContent = txt;
      ponerCursor(b, off);
      return true;
    }
    const nombre = soloNombre(txt), resto = txt.slice(nombre.length);
    if (span && span.textContent === nombre && b.childNodes.length === 2 && b.lastChild.nodeType === 3 && b.lastChild.nodeValue === resto) return false;
    const off = offsetCursor(b);
    const s = document.createElement('span');
    s.className = 'ch-nom'; s.textContent = nombre;
    b.textContent = '';
    b.appendChild(s);
    b.appendChild(document.createTextNode(resto));
    ponerCursor(b, off);
    return true;
  }

  /* ---------- colorear los bloques de personaje ---------- */
  function paint(block, allowRegister) {
    const name = clean(soloNombre(block.textContent));
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
    bloques.forEach(b => { separar(b, b === editing); paint(b, b !== editing); });
    /* los bloques que dejaron de ser personaje pierden el color */
    $$('[data-ch]:not(.sp-character)', editor()).forEach(b => { b.removeAttribute('data-ch'); b.style.removeProperty('--chl'); b.style.removeProperty('--chd'); });
    /* un bloque que dejó de ser personaje (Tab cambia de elemento) tampoco se queda con el chip del nombre dentro */
    $$('p:not(.sp-character) > .ch-nom', editor()).forEach(s => s.replaceWith(document.createTextNode(s.textContent)));
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
    menu.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) accept(+b.dataset.i); });
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
    /* El doble espacio del teclado no llega tal cual: **macOS lo cambia por un punto** («MARA. ») y el personaje
       seguía creciendo (Leo, 16-09-2026). Aquí se reconocen los dos casos —el segundo espacio y la sustitución del
       sistema— y en su lugar se suelta el personaje, que es lo que se pretendía. */
    editor().addEventListener('beforeinput', e => {
      if (e.inputType !== 'insertText' || !e.data) return;
      const b = currentCharBlock(); if (!b || C.suelto(b.textContent)) return;
      const r = Ed.getRange(); if (!r || !r.collapsed) return;
      const pre = document.createRange(); pre.selectNodeContents(b); pre.setEnd(r.startContainer, r.startOffset);
      const antes = pre.toString();
      if (!antes.trim() || !/[  ]$/.test(antes)) return;   // solo justo detrás de un espacio
      if (e.data !== ' ' && !/^\.\s?$/.test(e.data)) return;     // el segundo espacio, o el punto que pone macOS
      e.preventDefault();
      soltar(b, clean(antes));
    });
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

  /* **Soltar el personaje**: el nombre se queda fijo (en su chip) y el cursor pasa detrás, fuera del color, listo para
     la anotación («V.O.», «CONT'D»…). El doble espacio que lo marca **lo escribimos nosotros**: tecleado a mano, macOS
     lo cambia por un punto (Leo, 16-09-2026: «se pone un punto y me deja seguir escribiendo como si fuera otro
     personaje»). Si no se escribe nada detrás, al salir del bloque se recoge y queda solo el nombre. */
  function soltar(block, nombre) {
    const nom = clean(nombre || soloNombre(block.textContent));
    if (!nom) return;                                         // sin nombre no hay nada que soltar
    const r = document.createRange();
    r.selectNodeContents(block);
    Ed.restoreSelection(r);
    /* va de una vez y en HTML: con `insertText` Chrome recorta los espacios del final al sustituir el bloque entero
       (y sin doble espacio el personaje seguiría creciendo con lo que se escriba detrás). Los espacios van duros. */
    Ed.cmd('insertHTML', '<span class="ch-nom">' + Ed.escapeHtml(nom) + '</span>&nbsp;&nbsp;');
    separar(block, true);
    paint(block, true);
    const fin = document.createRange();
    fin.selectNodeContents(block); fin.collapse(false);
    Ed.restoreSelection(fin);
    if (Ed.afterChange) Ed.afterChange();
  }
  C.soltar = b => { const x = b || currentCharBlock(); if (x) soltar(x, clean(soloNombre(x.textContent))); };
  /* rellena el bloque con el nombre elegido y lo suelta: ahí mismo se escribe la anotación, y el siguiente Enter ya
     pasa al diálogo como siempre (Leo, 16-09-2026: «al seleccionar con Enter hace el Enter de inmediato») */
  function accept(i) {
    const name = items[i];
    const block = activeBlock;
    close();
    if (!name || !block) return;
    soltar(block, name);
  }

  C.onInput = function (e) {
    if (e.inputType && !/^insert(Text|CompositionText)$/.test(e.inputType) && !/^delete/.test(e.inputType)) return;
    const b = currentCharBlock();
    if (!b) { if (!menu.hidden) close(); return; }
    /* con el personaje ya soltado (doble espacio) no se sugiere: lo que se escribe es la anotación */
    if (C.suelto(b.textContent)) { separar(b, true); paint(b, true); close(); return; }   // el nombre a su chip, lo demás texto normal
    if (b.querySelector(':scope > .ch-nom')) separar(b, true);                            // se borró el doble espacio: vuelve a ser uno
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
    if (e.key === 'Tab') { e.preventDefault(); accept(index); return true; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); accept(index); return true; }   // elige y suelta: el Enter al diálogo es el siguiente
    if (e.key === 'Escape') { e.preventDefault(); close(); return true; }
    return false;
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})(window.Ed);
