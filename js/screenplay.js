/* Formatos de guion: encabezado de escena, acción, personaje, paréntico, diálogo, transición y toma.
   Son párrafos con clase sp-<tipo>; el estilo (mayúsculas, sangrías) lo pone el CSS. */
(function (Ed) {
  'use strict';
  const S = {};
  Ed.screenplay = S;

  /* Los elementos y lo que hace cada uno siguen la «Especificación de formato de guion» que entregó Leo (17-09-2026):
     formato de TV, Courier 12, sangrías fijas en caracteres, Enter y Tab que predicen el siguiente elemento. */
  S.KINDS = [
    { id: 'scene', label: 'Encabezado de escena', hint: 'INT./EXT. LUGAR - DÍA', keys: 'escena encabezado int ext slugline', atajo: '1' },
    { id: 'subscene', label: 'Encabezado secundario', hint: 'TALKING HEAD - INT. - DÍA', keys: 'subescena secundario talking' },
    { id: 'action', label: 'Acción', hint: 'Descripción de la acción', keys: 'accion descripcion', atajo: '2' },
    { id: 'character', label: 'Personaje', hint: 'PERSONAJE', keys: 'personaje nombre', atajo: '3' },
    { id: 'paren', label: 'Paréntesis', hint: 'en voz baja', keys: 'parentesis parentico acotacion', atajo: '4' },
    { id: 'dialogue', label: 'Diálogo', hint: 'Diálogo', keys: 'dialogo', atajo: '5' },
    { id: 'transition', label: 'Transición', hint: 'CORTE A:', keys: 'transicion corte fundido', atajo: '6' },
    { id: 'shot', label: 'Toma', hint: 'ÁNGULO SOBRE…', keys: 'toma plano shot angulo' },
    { id: 'act', label: 'Acto / Sección', hint: 'ACTO UNO', keys: 'acto seccion cold tag fin' },
    { id: 'note', label: 'Nota', hint: '[nota]', keys: 'nota comentario' },
    { id: 'montage', label: 'Montaje', hint: 'MONTAJE:', keys: 'montaje serie tomas' }
  ];
  /* Qué elemento sigue al pulsar Enter al final de cada uno (tabla de la especificación) */
  const NEXT = { scene: 'action', subscene: 'action', action: 'action', character: 'dialogue', paren: 'dialogue', dialogue: 'action',
                 transition: 'scene', shot: 'action', act: 'scene', note: 'action', montage: 'action' };
  /* Tab: a qué pasa (especificación); en los que no dice nada, sigue el orden de siempre (`ORDEN`) */
  const TAB = { action: 'character', character: 'paren', dialogue: 'paren' };

  /* el tipo de un párrafo de guion (no el del diálogo doble ni sus columnas, que envuelven párrafos: js/doble.js) */
  S.kindOf = function (block) {
    if (!block || !block.classList) return null;
    const c = Array.from(block.classList).find(k => k.startsWith('sp-') && k !== 'sp-doble' && k !== 'sp-col');
    return c ? c.slice(3) : null;
  };
  /* dentro de una columna de un diálogo doble solo caben personaje, paréntesis y diálogo */
  const enColumna = b => !!(Ed.doble && b && Ed.doble.col(b));
  const cabeEn = (b, kind) => !enColumna(b) || Ed.doble.KINDS.includes(kind);

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
  S.aplicar = apply;

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
      if (b.matches('.sp-doble, .sp-col') || !cabeEn(b, kind)) return;
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

  /* Tab dentro de un elemento de guion cambia de elemento (Mayús+Tab, al anterior) en lugar de sangrar:
     la sangría deformaba el formato. Orden: escena → acción → personaje → paréntico → diálogo →
     transición → toma → escena. */
  const ORDEN = ['scene', 'subscene', 'action', 'character', 'paren', 'dialogue', 'transition', 'shot', 'act', 'note', 'montage'];
  S.onTab = function (e) {
    const editor = Ed.editor, r = Ed.getRange();
    if (!r || !editor.contains(r.startContainer)) return false;
    const block = Ed.closestBlock(r.startContainer, editor), kind = S.kindOf(block);
    if (!kind || block.closest('td, th, li')) return false;
    e.preventDefault();
    /* **al final de una línea con texto, Tab abre la siguiente** del tipo de la tabla (acción → personaje, personaje o diálogo →
       paréntesis), como en los editores de guion: cambiar la propia línea convertía el nombre o lo dicho en un paréntesis */
    const vacio = !block.textContent.replace(/\u200B/g, '').trim();
    if (!e.shiftKey && TAB[kind] && !vacio && r.collapsed) {
      const post = document.createRange(); post.setStart(r.startContainer, r.startOffset); post.setEnd(block, block.childNodes.length);
      if (!post.toString().replace(/\u200B/g, '').trim()) {
        Ed.cmd('insertParagraph');
        const r2 = Ed.getRange(), nb = r2 && Ed.closestBlock(r2.startContainer, editor);
        if (nb && nb !== block) { apply(nb, TAB[kind]); Ed.setCaret(nb, 0); }
        if (Ed.afterChange) Ed.afterChange();
        if (Ed.updateToolbar) Ed.updateToolbar();
        return true;
      }
    }
    const orden = enColumna(block) ? Ed.doble.KINDS : ORDEN;       // en un diálogo doble, solo sus tres
    const i = orden.indexOf(kind), sig = (!e.shiftKey && TAB[kind]) || orden[(i + (e.shiftKey ? -1 : 1) + orden.length) % orden.length];
    const antes = r.cloneRange();
    S.set(sig);
    /* S.set deja el cursor al final: se devuelve a donde estaba (el párrafo es el mismo, solo cambia su clase) */
    if (block.isConnected && editor.contains(antes.startContainer)) Ed.restoreSelection(antes);
    return true;
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
    if (enColumna(block)) return Ed.doble.onEnter(e, block);     // en un diálogo doble, de columna en columna
    const text = block.textContent.replace(/\u200B/g, '').trim();
    if (!text) {
      /* **Enter en una línea vacía abre el menú de comandos** (especificación, 4): se elige ahí qué elemento es.
         Sin el menú («/»), como antes: pasa a acción, y una acción vacía vuelve a texto normal. */
      e.preventDefault();
      if (Ed.slash && Ed.slash.abrirAqui && Ed.slash.abrirAqui()) return true;
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
