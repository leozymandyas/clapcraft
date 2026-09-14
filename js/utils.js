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

  Ed.escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
  Ed.sanitizeHtml = function (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
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
