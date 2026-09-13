/* Formatos de guion: encabezado de escena, acción, personaje, paréntico, diálogo, transición y toma.
   Son párrafos con clase sp-<tipo>; el estilo (mayúsculas, sangrías) lo pone el CSS. */
(function (Ed) {
  'use strict';
  const S = {};
  Ed.screenplay = S;

  S.KINDS = [
    { id: 'scene', label: 'Encabezado de escena', hint: 'INT./EXT. LUGAR - DÍA', keys: 'escena encabezado int ext slugline' },
    { id: 'action', label: 'Acción', hint: 'Descripción de la acción', keys: 'accion descripcion' },
    { id: 'character', label: 'Personaje', hint: 'PERSONAJE', keys: 'personaje nombre' },
    { id: 'paren', label: 'Paréntico', hint: 'en voz baja', keys: 'parentico parentesis acotacion' },
    { id: 'dialogue', label: 'Diálogo', hint: 'Diálogo', keys: 'dialogo' },
    { id: 'transition', label: 'Transición', hint: 'CORTE A:', keys: 'transicion corte fundido' },
    { id: 'shot', label: 'Toma', hint: 'PRIMER PLANO DE...', keys: 'toma plano shot' }
  ];
  /* Qué elemento sigue al pulsar Enter al final de cada uno (convención de los editores de guion) */
  const NEXT = { scene: 'action', action: 'action', character: 'dialogue', paren: 'dialogue', dialogue: 'character', transition: 'scene', shot: 'action' };

  S.kindOf = function (block) {
    if (!block || !block.classList) return null;
    const c = Array.from(block.classList).find(k => k.startsWith('sp-'));
    return c ? c.slice(3) : null;
  };

  function toParagraph(block) {
    if (block.tagName === 'P') return block;
    if (block.tagName === 'LI' || block.tagName === 'TD' || block.tagName === 'TH') return null;
    const p = document.createElement('p');
    while (block.firstChild) p.appendChild(block.firstChild);
    if (block.tagName === 'PRE') { p.innerHTML = Ed.escapeHtml(block.textContent).replace(/\n/g, '<br>'); }
    block.replaceWith(p);
    return p;
  }
  function apply(block, kind) {
    const p = toParagraph(block);
    if (!p) return null;
    Array.from(p.classList).forEach(k => { if (k.startsWith('sp-')) p.classList.remove(k); });
    if (kind) p.classList.add('sp-' + kind);
    if (!p.classList.length) p.removeAttribute('class');
    if (!p.firstChild) p.appendChild(document.createElement('br'));
    return p;
  }

  /* Aplica un formato (o null = texto normal) a los bloques seleccionados */
  S.set = function (kind) {
    Ed.focusEditor();
    const editor = Ed.editor;
    const r = Ed.getRange();
    if (!r) return;
    const blocks = Ed.selectedBlocks(editor);
    const collapsed = r.collapsed;
    let last = null;
    blocks.forEach(b => {
      if (b.closest('blockquote') && b.tagName !== 'BLOCKQUOTE') return;
      const p = apply(b, kind);
      if (p) last = p;
    });
    if (collapsed && last) {
      const rr = document.createRange();
      rr.selectNodeContents(last);
      rr.collapse(false);
      Ed.restoreSelection(rr);
    }
    if (Ed.afterChange) Ed.afterChange();
    if (Ed.updateToolbar) Ed.updateToolbar();
  };

  /* Crea el elemento siguiente después de un bloque (lo que hace Enter al final) */
  S.continueFrom = function (block) {
    const kind = S.kindOf(block);
    if (!kind) return;
    const r = document.createRange();
    r.selectNodeContents(block);
    r.collapse(false);
    Ed.restoreSelection(r);
    Ed.cmd('insertParagraph');
    const r2 = Ed.getRange();
    const nb = r2 && Ed.closestBlock(r2.startContainer, Ed.editor);
    if (nb && nb !== block) { apply(nb, NEXT[kind]); Ed.setCaret(nb, 0); }
    if (Ed.updateToolbar) Ed.updateToolbar();
  };

  /* Enter dentro de un elemento de guion */
  S.onKeydown = function (e) {
    if (e.key !== 'Enter' || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return false;
    const editor = Ed.editor;
    const r = Ed.getRange();
    if (!r || !r.collapsed || !editor.contains(r.startContainer)) return false;
    const block = Ed.closestBlock(r.startContainer, editor);
    const kind = S.kindOf(block);
    if (!kind) return false;
    const text = block.textContent.replace(/\u200B/g, '').trim();
    if (!text) {
      /* elemento vacío: pasa a acción; una acción vacía vuelve a texto normal */
      e.preventDefault();
      apply(block, kind === 'action' ? null : 'action');
      Ed.setCaret(block, 0);
      if (Ed.afterChange) Ed.afterChange();
      if (Ed.updateToolbar) Ed.updateToolbar();
      return true;
    }
    const post = document.createRange();
    post.setStart(r.startContainer, r.startOffset);
    post.setEnd(block, block.childNodes.length);
    const atEnd = !post.toString().replace(/\u200B/g, '').trim();
    if (!atEnd) return false; /* partir a media línea: Chrome conserva la clase en ambas mitades */
    e.preventDefault();
    Ed.cmd('insertParagraph');
    const r2 = Ed.getRange();
    const nb = r2 && Ed.closestBlock(r2.startContainer, editor);
    if (nb && nb !== block) { apply(nb, NEXT[kind]); Ed.setCaret(nb, 0); }
    if (Ed.updateToolbar) Ed.updateToolbar();
    return true;
  };
})(window.Ed);
