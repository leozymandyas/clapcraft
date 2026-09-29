/* Utilidades compartidas: selección, bloques, helpers. Expone window.Ed */
window.Ed = window.Ed || {};
(function (Ed) {
  'use strict';

  const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'LI', 'BLOCKQUOTE', 'PRE', 'TD', 'TH']);
  Ed.BLOCK_TAGS = BLOCK_TAGS;

  Ed.getRange = function () {
    const s = window.getSelection();
    return s && s.rangeCount ? s.getRangeAt(0) : null;
  };

  Ed.restoreSelection = function (range) {
    if (!range) return;
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(range);
  };

  Ed.setCaret = function (node, offset) {
    const r = document.createRange();
    r.setStart(node, offset);
    r.collapse(true);
    Ed.restoreSelection(r);
  };

  /* Bloque (párrafo, título, li…) más cercano que contiene al nodo, sin salir de root */
  Ed.closestBlock = function (node, root) {
    let n = node && node.nodeType === 3 ? node.parentNode : node;
    while (n && n !== root) {
      if (n.nodeType === 1 && BLOCK_TAGS.has(n.tagName)) return n;
      n = n.parentNode;
    }
    return null;
  };

  /* Bloques (los más internos) tocados por la selección actual */
  Ed.selectedBlocks = function (root) {
    const r = Ed.getRange();
    if (!r || !root.contains(r.commonAncestorContainer)) return [];
    const start = Ed.closestBlock(r.startContainer, root);
    const end = Ed.closestBlock(r.endContainer, root);
    if (!start) return [];
    if (!end || start === end) return [start];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: n => BLOCK_TAGS.has(n.tagName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
    });
    const blocks = [];
    let inRange = false;
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (n === start) inRange = true;
      if (inRange && r.intersectsNode(n)) blocks.push(n);
      if (n === end) break;
    }
    return blocks.filter(b => !blocks.some(o => o !== b && b.contains(o)));
  };

  /* Texto desde el inicio del bloque hasta el cursor (solo con cursor colapsado) */
  Ed.textBeforeCaretInBlock = function (root) {
    const r = Ed.getRange();
    if (!r || !r.collapsed || !root.contains(r.startContainer)) return null;
    const block = Ed.closestBlock(r.startContainer, root);
    if (!block) return null;
    const pre = document.createRange();
    pre.setStart(block, 0);
    pre.setEnd(r.startContainer, r.startOffset);
    return { block, text: pre.toString() };
  };

  Ed.debounce = function (fn, ms) {
    let t;
    return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  };

  Ed.pxToPt = px => Math.round(px * 0.75 * 2) / 2;

  /* **Nunca quitar nodos de la página mientras se escribe.** Chrome cierra la agrupación de lo tecleado —y cada letra pasa a
     ser un paso de Deshacer— en cuanto se quita un nodo del documento fuera de un `execCommand`
     (FrameSelection::NodeWillBeRemoved → TypingCommand::CloseTyping), aunque sea de un menú que no tiene nada que ver con el
     editor: repintar el menú de sugerencias con `innerHTML` en cada tecla partía «CORTE A» en seis pasos (29-09-2026). Añadir
     nodos, cambiar atributos o el `nodeValue` de un texto no la cierra (asignar `textContent` sí: quita el texto de antes).
     `Ed.pintarFilas(menu, filas)` pinta las filas de un menú reutilizando sus nodos; las que sobran se esconden y se vacían
     (sin texto ni `data-i`). filas: `{ titulo }` o `{ texto, i, activa, kbd, punto }` (punto: el color del `.char-dot`). */
  Ed.pintarFilas = function (menu, filas) {
    const slots = menu._filas || (menu._filas = []);
    const txt = el => el.firstChild || el.appendChild(document.createTextNode(''));
    const ver = (el, v) => { const d = v ? '' : 'none'; if (el.style.display !== d) el.style.display = d; };
    const poner = (nodo, v) => { if (nodo.nodeValue !== v) nodo.nodeValue = v; };
    filas.forEach((f, k) => {
      let s = slots[k];
      if (!s) {
        const tit = document.createElement('div'); tit.className = 'ctx-title'; txt(tit);
        const btn = document.createElement('button'); btn.type = 'button';
        const span = document.createElement('span'), punto = document.createElement('i'); punto.className = 'char-dot';
        const texto = document.createTextNode(''); span.append(punto, texto);
        const kbd = document.createElement('kbd'); txt(kbd);
        btn.append(span, kbd);
        menu.append(tit, btn);
        s = slots[k] = { tit, btn, punto, texto, kbd };
      }
      const esTit = f.titulo != null;
      ver(s.tit, esTit); poner(txt(s.tit), esTit ? String(f.titulo) : '');
      ver(s.btn, !esTit);
      if (esTit || f.i == null) s.btn.removeAttribute('data-i'); else s.btn.dataset.i = String(f.i);
      const clase = !esTit && f.activa ? 'active' : '';
      if (s.btn.className !== clase) s.btn.className = clase;
      poner(s.texto, esTit ? '' : String(f.texto == null ? '' : f.texto));
      ver(s.kbd, !esTit && !!f.kbd); poner(txt(s.kbd), !esTit && f.kbd ? String(f.kbd) : '');
      ver(s.punto, !esTit && !!f.punto); s.punto.style.background = !esTit && f.punto ? f.punto : '';
    });
    for (let k = filas.length; k < slots.length; k++) {
      const s = slots[k];
      ver(s.tit, false); poner(txt(s.tit), '');
      ver(s.btn, false); s.btn.removeAttribute('data-i'); if (s.btn.className) s.btn.className = '';
      poner(s.texto, ''); poner(txt(s.kbd), ''); s.punto.style.background = '';
    }
  };

  Ed.escapeHtml = s =>String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  Ed.escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  Ed.rgbToHex = function (rgb) {
    const m = String(rgb).match(/\d+/g);
    if (!m || m.length < 3) return '#000000';
    return '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('');
  };

  /* Sanitiza HTML externo (pegado / abierto): quita scripts, eventos y etiquetas peligrosas */
  /* Lo pegado (de una web, de Word o del propio editor, que Chrome copia con estilos calculados) no trae
     tipografía propia: fuera fuente, tamaño, interlineado y márgenes, que chocaban con la hoja; y fuera los
     colores neutros (negro, gris, blanco), que en modo oscuro dejaban el texto invisible. Los colores con
     tono (un resaltado, un color elegido) y los del personaje (--chl/--chd) se quedan. */
  const QUITAR = ['font-family', 'font-size', 'line-height', 'text-transform', 'letter-spacing', 'word-spacing', 'white-space', 'text-indent',
    'font-variant', 'font-variant-ligatures', 'font-variant-caps', 'orphans', 'widows', 'text-align', 'margin', 'margin-top', 'margin-bottom',
    'margin-left', 'margin-right', 'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'width', 'height', 'display', 'float', 'position'];
  function neutro(v) {
    const m = String(v || '').match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
    if (!m) return /^(transparent|initial|inherit|black|white|windowtext|canvastext)$/i.test(String(v).trim());
    const [r, g, b] = [+m[1], +m[2], +m[3]], a = m[4] === undefined ? 1 : +m[4];
    return a === 0 || (Math.max(r, g, b) - Math.min(r, g, b) < 24);
  }
  function limpiarEstilo(el) {
    const st = el.style; if (!st || !st.length) return;
    QUITAR.forEach(p => st.removeProperty(p));
    if (neutro(st.color)) st.removeProperty('color');
    if (neutro(st.backgroundColor)) st.removeProperty('background-color');
    if (!st.length) el.removeAttribute('style');
  }
  /* Lo copiado de un personaje trae el color de su etiqueta (el fondo claro y la letra oscura de un mismo tono de la paleta, o
     al revés en modo oscuro) clavado en un style: al pegarlo quedaba el chip pintado a mano. Se quita cuando el color y el
     fondo son la pareja de un tono (en el mismo elemento o en uno de sus antepasados) y dentro de un bloque de personaje;
     un resaltado o un color de letra sueltos de la paleta se quedan. La paleta: Ed.TONOS (editor.js) o la de characters.js. */
  function paleta() {
    const t = Ed.TONOS || (Ed.characters && Ed.characters.PALETTE) || [];
    const m = new Map();
    t.forEach((x, i) => { m.set(String(x[1]).toLowerCase(), i); m.set(String(x[2]).toLowerCase(), i); });
    return m;
  }
  const hexDe = v => { const m = String(v || '').match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/); return m ? '#' + m.slice(1, 4).map(n => (+n).toString(16).padStart(2, '0')).join('') : String(v || '').trim().toLowerCase(); };
  function quitarChips(doc) {
    const pal = paleta(); if (!pal.size) return;
    const tono = v => { const h = hexDe(v); return pal.has(h) ? pal.get(h) : -1; };
    const quitar = (el, p) => { el.style.removeProperty(p); if (!el.style.length) el.removeAttribute('style'); };
    doc.querySelectorAll('[style]').forEach(el => {
      const t = tono(el.style.color);
      if (t < 0) return;
      for (let a = el; a && a.nodeType === 1; a = a.parentElement) {
        if (a.style && tono(a.style.backgroundColor) === t && hexDe(a.style.backgroundColor) !== hexDe(el.style.color)) { quitar(a, 'background-color'); quitar(el, 'color'); return; }
      }
    });
    doc.querySelectorAll('.sp-character, .sp-character [style]').forEach(el => {
      if (tono(el.style.color) >= 0) quitar(el, 'color');
      if (tono(el.style.backgroundColor) >= 0) quitar(el, 'background-color');
    });
  }
  Ed.sanitizeHtml = function (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    quitarChips(doc);
    doc.querySelectorAll('script, style, link, meta, iframe, object, embed, form, input, textarea, select, button, noscript, title').forEach(n => n.remove());
    doc.querySelectorAll('*').forEach(el => {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name === 'class') {
          const keep = attr.value.split(/\s+/).filter(c => c.startsWith('sp-') || c === 'db');
          if (keep.length) el.setAttribute('class', keep.join(' ')); else el.removeAttribute('class');
        } else if (name === 'contenteditable' && el.classList.contains('db')) { /* el bloque de base de datos no es editable */ }
        else if (name === 'data-db') { /* estado de la base de datos */ }
        else if (name.startsWith('on') || name === 'id' || name === 'contenteditable') el.removeAttribute(attr.name);
        else if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
      }
      limpiarEstilo(el);
    });
    /* comentarios (p. ej. de Word) */
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
    const comments = [];
    while (walker.nextNode()) comments.push(walker.currentNode);
    comments.forEach(c => c.remove());
    return doc.body.innerHTML;
  };

  /* Limpia marcas internas antes de guardar/exportar */
  Ed.cleanHtml = html => html.replace(/\u200B/g, '');
})(window.Ed);
