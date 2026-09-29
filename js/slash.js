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
    /* una imagen desde un archivo (js/imagenes.js, 1.1.57); también en modo guion (referencias, storyboard) */
    { group: 'Bloques', id: 'imagen', label: 'Imagen', keys: 'imagen foto image picture archivo', hint: 'archivo', siempre: true, run: () => Ed.imagenes && Ed.imagenes.elegirArchivo() },
    { group: 'Bloques', id: 'db', label: 'Base de datos', keys: 'int base datos database db tablero board kanban', hint: '/int', run: () => Ed.db.insert() },
    { group: 'Bloques', id: 'hr', label: 'Línea horizontal', keys: 'linea separador hr', hint: '---', run: () => Ed.cmd('insertHorizontalRule') },
    { group: 'Bloques', id: 'link', label: 'Enlace', keys: 'enlace link url', hint: 'Ctrl+K', run: () => Ed.actions.link() }
  ];
  Ed.screenplay.KINDS.forEach(k => COMMANDS.push({ group: 'Guion', id: 'sp-' + k.id, label: k.label, keys: k.keys, hint: k.atajo ? 'Ctrl+' + k.atajo : k.hint, run: () => Ed.screenplay.set(k.id) }));
  /* el diálogo doble (js/doble.js), detrás del diálogo: junta dos diálogos seguidos, pone uno en blanco o lo separa */
  COMMANDS.splice(COMMANDS.findIndex(c => c.id === 'sp-dialogue') + 1, 0, { group: 'Guion', id: 'doble', label: 'Diálogo doble', keys: 'dialogo-doble dialogo doble dual simultaneo columnas', hint: 'dos columnas', run: () => Ed.doble && Ed.doble.alternar() });
  COMMANDS.push({ group: 'Guion', id: 'portada', label: 'Portada', keys: 'portada titulo cubierta', hint: 'formulario', run: () => Ed.portada && Ed.portada.editar() });
  /* Los recuadros (js/recuadros.js, 1.1.57): el prompt y los avisos, también en modo guion (son material de trabajo). «/prompt» y
     «/aviso» se ven siempre; cada tipo de aviso («/info», «/consejo»…), solo al buscarlo (`soloBuscando`), para no llenar el menú. */
  const RC = () => Ed.recuadros;
  COMMANDS.push({ group: 'Recuadros', id: 'rc-prompt', label: 'Prompt', keys: 'prompt ia claude seedance instrucciones recuadro', hint: '✦ con «Copiar»', siempre: true, run: () => RC() && RC().crear({ rc: 'prompt' }) });
  COMMANDS.push({ group: 'Recuadros', id: 'rc-aviso', label: 'Aviso', keys: 'aviso callout recuadro nota', hint: '◆ nota', siempre: true, run: () => RC() && RC().crear({ rc: 'aviso', tipo: 'note' }) });
  (Ed.recuadros ? Ed.recuadros.TIPOS.filter(t => t[0] !== 'note') : []).forEach(([id, nombre, glifo]) => {
    const alias = Object.keys(Ed.recuadros.ALIAS_TIPO).filter(k => Ed.recuadros.ALIAS_TIPO[k] === id).join(' ');
    COMMANDS.push({ group: 'Recuadros', id: 'rc-' + id, label: 'Aviso: ' + nombre, keys: norm(nombre) + ' ' + id + ' ' + alias, hint: glifo, siempre: true, soloBuscando: true,
      run: () => RC() && RC().crear({ rc: 'aviso', tipo: id }) });
  });
  /* Órdenes que pone quien aloja el editor (ClapCraft, js/claquedraw/texto.js: «/plantilla», 1.1.56); index.html a solas no pone
     ninguna. `siempre`: también en modo guion; `visible()`: si hoy se ofrece. */
  S.agregar = function (c) { if (c && c.id && !COMMANDS.some(x => x.id === c.id)) COMMANDS.push(c); };

  let menu, anchorNode = null, anchorOffset = -1, items = [], index = 0;
  /* Abierto «solo» (Enter en una línea vacía de guion, `S.abrirAqui`): no hay «/» en el documento; lo que se teclea va a
     `consulta` (se ve en el título del menú) y no toca el texto, así que elegir, cerrar o deshacer no dejan restos. */
  let auto = null;                                            // { bloque, consulta, alVacio }
  let navegado = false;                                       // ¿se movió la marca con ↑/↓? (con la consulta vacía, Enter no elige solo)
  let marcarId = null;                                        // qué orden va marcada con la consulta vacía
  let ultimaConsulta = null;                                  // al cambiar lo tecleado, la marca vuelve a la primera

  function currentBlock() { const r = Ed.getRange(); return r ? Ed.closestBlock(r.startContainer, Ed.editor) : null; }
  const modoGuion = () => !!(Ed.page && Ed.page.state.script);

  function build() {
    menu = document.createElement('div');
    menu.className = 'ctx-menu slash-menu';
    menu.hidden = true;
    document.body.appendChild(menu);
    menu.addEventListener('mousedown', e => e.preventDefault());
    menu.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) choose(+b.dataset.i); });
    document.addEventListener('mousedown', e => { if (S.open && !(e.target.closest && e.target.closest('.slash-menu'))) close(true); });
    document.addEventListener('selectionchange', () => { if (S.open) requestAnimationFrame(refresh); });
    /* abierto solo: las letras van a la consulta (antes que los demás oyentes del editor: personajes, formato…) */
    document.addEventListener('beforeinput', e => {
      if (!S.open || !auto || !Ed.editor || !Ed.editor.contains(e.target)) return;
      if (e.inputType === 'insertText' && e.data != null) {
        e.preventDefault(); e.stopImmediatePropagation();
        auto.consulta += e.data; index = 0; navegado = false;
        refresh();
      } else if (e.inputType !== 'insertCompositionText') {
        /* cualquier otra edición (pegar, borrar una selección…): el menú se cierra y lo escrito se conserva */
        close(true);
      }
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();

  /* Texto escrito tras la barra (query); null si el cursor ya no está en su sitio */
  function query() {
    const r = Ed.getRange();
    if (auto) {
      if (!r || !r.collapsed || !auto.bloque.isConnected || !auto.bloque.contains(r.startContainer)) return null;
      return auto.consulta;
    }
    if (!r || !r.collapsed || r.startContainer !== anchorNode || r.startOffset <= anchorOffset) return null;
    const text = anchorNode.nodeValue.slice(anchorOffset, r.startOffset);
    if (text[0] !== '/') return null;
    return text.slice(1).replace(/\u00A0/g, ' ');
  }

  function render(q) {
    const nq = norm(q);
    /* en modo guion solo se ofrecen los elementos de guion (y lo que vale siempre); en modo guion o desde una línea de guion, el
       grupo «Guion» va primero: con «Bloques» delante, Enter en una línea vacía marcaba «Imagen» y abría el selector de archivos */
    const guionPrimero = modoGuion() || !!auto;
    let pool = (modoGuion() ? COMMANDS.filter(c => c.group === 'Guion' || c.siempre) : COMMANDS).filter(c => !c.visible || c.visible());
    if (guionPrimero) pool = pool.filter(c => c.group === 'Guion').concat(pool.filter(c => c.group !== 'Guion'));
    items = pool.filter(c => (!nq && !c.soloBuscando) || (nq && (norm(c.label).includes(nq) || c.keys.split(' ').some(k => k.startsWith(nq)))));
    if (!items.length) {
      /* nada coincide: abierto solo, lo tecleado pasa al texto (sin «/»); tecleado, la «/» se queda como la escribió */
      const escrito = auto ? auto.consulta : '';
      close();
      if (escrito) { Ed.cmd('insertText', escrito); if (Ed.afterChange) Ed.afterChange(); }
      return;
    }
    if (q !== ultimaConsulta) { if (ultimaConsulta !== null) { index = 0; navegado = false; } ultimaConsulta = q; }
    if (!nq && !navegado && marcarId) { const k = items.findIndex(c => c.id === marcarId); if (k >= 0) index = k; }
    index = Math.min(index, items.length - 1);
    /* sin `innerHTML`: quitar nodos de la página en cada tecla hacía de cada letra de «/…» un paso de Deshacer (ver
       Ed.pintarFilas) */
    const filas = auto ? [{ titulo: '/' + q }] : [];
    let group = '';
    items.forEach((c, i) => {
      if (c.group !== group) { group = c.group; filas.push({ titulo: group }); }
      filas.push({ texto: c.label, i, activa: i === index, kbd: c.hint || '' });
    });
    Ed.pintarFilas(menu, filas);
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
    if (q === null || (q.length > 24)) { close(true); return; }
    render(q);
  }
  /* cerrar sin elegir: abierto solo, lo tecleado en la consulta se escribe en el texto (sin la «/») si `conservar` */
  function close(conservar) {
    const a = auto;
    auto = null; S.open = false; if (menu) menu.hidden = true; anchorNode = null; navegado = false; marcarId = null; ultimaConsulta = null;
    if (conservar && a && a.consulta && a.bloque.isConnected) {
      const r = Ed.getRange();
      if (r && r.collapsed && a.bloque.contains(r.startContainer)) { Ed.cmd('insertText', a.consulta); if (Ed.afterChange) Ed.afterChange(); }
    }
  }
  /* Abre el menú en el cursor sin que se haya tecleado la «/» (Enter en una línea vacía de guion, screenplay.js). No escribe nada
     en el documento. op.alVacio: lo que hace Enter si no se ha tecleado ni elegido nada; op.marcar: la orden marcada. */
  S.abrirAqui = function (op) {
    op = op || {};
    if (!menu || !Ed.editor) return false;
    const b = currentBlock(); if (!b) return false;
    const r = Ed.getRange(); if (!r || !r.collapsed) return false;
    auto = { bloque: b, consulta: '', alVacio: op.alVacio || null };
    anchorNode = null; index = 0; navegado = false; marcarId = op.marcar || null;
    S.open = true;
    render('');
    return S.open;
  };

  function choose(i) {
    const cmd = items[i];
    if (!cmd) return;
    const r = Ed.getRange();
    /* un elemento de guion con la «/» tecleada: quitar «/consulta» y cambiar el tipo van en **un solo paso** de Deshacer */
    const kind = cmd.id.startsWith('sp-') ? cmd.id.slice(3) : null;
    const S2 = Ed.screenplay, b0 = r && anchorNode && Ed.closestBlock(anchorNode, Ed.editor);
    if (!auto && kind && S2 && S2.editar && S2.aplicarEn && r && r.startContainer === anchorNode && b0 && b0.tagName === 'P' && !b0.closest('li, td, th, [data-rc]')
      && !(Ed.doble && Ed.doble.col(b0) && !Ed.doble.KINDS.includes(kind))) {
      const desde = anchorOffset, hasta = r.startOffset, nodo = anchorNode;
      const pre = document.createRange(); pre.setStart(b0, 0); pre.setEnd(nodo, desde);
      const off = pre.toString().length;
      close();
      S2.editar([b0], clon => {
        const t = clon(nodo), c = clon(b0); if (!t || !c) return false;
        t.nodeValue = t.nodeValue.slice(0, desde) + t.nodeValue.slice(hasta);
        if (!t.nodeValue) t.remove();
        const p = S2.aplicarEn(c, kind);
        return { nodo: p, offset: off };
      });
      if (Ed.afterChange) Ed.afterChange();
      if (Ed.updateToolbar) Ed.updateToolbar();
      return;
    }
    if (!auto && r && r.startContainer === anchorNode) {
      const del = document.createRange();
      del.setStart(anchorNode, anchorOffset);
      del.setEnd(anchorNode, r.startOffset);
      Ed.restoreSelection(del);
      Ed.cmd('delete');
      const block = currentBlock();
      /* sin nada dentro, el párrafo necesita su <br> (si no, Chrome anida lo que venga): con execCommand, para que entre en Deshacer */
      if (block && !block.textContent.replace(/\u200B/g, '') && !block.querySelector('br, img, table')) Ed.cmd('insertHTML', '<br>');
      if (block && block.isConnected) Ed.setCaret(block, 0);
    }
    close();
    cmd.run();
    if (Ed.afterChange) Ed.afterChange();
    if (Ed.updateToolbar) Ed.updateToolbar();
  }

  /* Se llama desde el evento input del editor */
  S.onInput = function (e) {
    if (S.open) { if (auto && e.inputType !== 'insertCompositionText') { close(false); return; } refresh(); return; }
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
    index = 0; navegado = false;
    marcarId = modoGuion() ? 'sp-action' : null;
    S.open = true;
    render('');
  };

  /* Teclas mientras el menú está abierto */
  S.onKeydown = function (e) {
    if (!S.open) return false;
    if (e.key === 'ArrowDown') { e.preventDefault(); navegado = true; index = (index + 1) % items.length; render(query() || ''); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); navegado = true; index = (index - 1 + items.length) % items.length; render(query() || ''); return true; }
    if (e.key === 'Backspace' && auto && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (!auto.consulta) { close(); return false; }            // nada tecleado: se cierra y Retroceso hace lo suyo
      e.preventDefault(); auto.consulta = auto.consulta.slice(0, -1); index = 0; refresh(); return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) { close(true); return false; }
      /* **con la consulta vacía y sin haber movido la marca, Enter no elige**: « /» + Enter al final de una línea se comía la «/»
         y abría el primer comando (la imagen, el selector de archivos). Abierto solo, Enter hace lo de antes (`alVacio`); tecleado,
         el menú se cierra, la «/» se queda y Enter sigue su camino. */
      const q = query();
      if (!q && !navegado) {
        const a = auto;
        close();
        if (a && e.key === 'Enter') { e.preventDefault(); if (a.alVacio) a.alVacio(); return true; }
        return false;
      }
      e.preventDefault(); choose(index); return true;
    }
    if (e.key === 'Escape') { e.preventDefault(); close(true); return true; }
    return false;
  };
})(window.Ed);
