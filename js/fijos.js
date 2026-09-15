/* Bloques fijos: `.ed-fijo[contenteditable=false]`, hijos directos de #editor que el texto no puede borrar ni
   mover (en ClapCraft, las cabeceras de sección de un documento de esquema; quien los pone decide qué son).
   - Retroceso al principio del bloque que sigue a uno fijo, o Supr al final del que lo precede, no hacen nada
     (Chrome se llevaba el bloque entero).
   - Borrar, escribir, pegar o cortar sobre una selección que cruza bloques fijos borra el texto de cada tramo
     (uno a uno, con execCommand: entra en Deshacer) y deja los fijos; lo escrito o pegado va al primer tramo.
   - Copiar deja fuera los fijos; el cursor nunca se queda entre dos bloques junto a uno fijo.
   El corrector, buscar/reemplazar y la selección de bloques los ignoran (spell.js, editor.js, blocks.js). */
(function (Ed) {
  'use strict';
  const F = {};
  Ed.fijos = F;
  const editor = () => Ed.editor;
  const SEL = '.ed-fijo';
  F.es = n => !!(n && n.nodeType === 1 && n.classList.contains('ed-fijo'));
  F.hay = () => !!(editor() && editor().querySelector(SEL));

  /* el bloque de primer nivel que contiene al nodo */
  function arriba(node) {
    let n = node && node.nodeType === 3 ? node.parentNode : node;
    while (n && n.parentNode !== editor()) n = n.parentNode;
    return n && n.parentNode === editor() ? n : null;
  }
  const vacio = r => !r.toString().replace(/\u200B/g, '') && !r.cloneContents().querySelector('img, table, hr, .db');

  /* los fijos que toca un rango (incluidos los que solo roza por un extremo) */
  function tocados(r) {
    return Array.from(editor().querySelectorAll(':scope > ' + SEL)).filter(f => r.intersectsNode(f));
  }

  /* Borra lo seleccionado sin tocar los fijos: un tramo por hueco entre ellos, del último al primero. Devuelve
     false si no había fijos en medio (lo hace el navegador). */
  function borrarTramos(r) {
    const fijos = tocados(r); if (!fijos.length) return false;
    const tramos = [];
    for (let i = 0; i <= fijos.length; i++) {
      const t = document.createRange();
      if (i === 0) t.setStart(r.startContainer, r.startOffset);
      else { const sig = fijos[i - 1].nextElementSibling; if (!sig || F.es(sig)) continue; t.setStart(sig, 0); }
      if (i === fijos.length) t.setEnd(r.endContainer, r.endOffset);
      else { const ant = fijos[i].previousElementSibling; if (!ant || F.es(ant)) continue; t.setEnd(ant, ant.childNodes.length); }
      /* el principio de la selección dentro del propio fijo (se empezó a arrastrar sobre él) */
      if (i === 0 && fijos[0].contains(r.startContainer)) continue;
      if (i === fijos.length && fijos[fijos.length - 1].contains(r.endContainer)) continue;
      if (t.collapsed || F.es(arriba(t.startContainer))) continue;   // setEnd antes del principio lo pliega
      tramos.push(t);
    }
    editor().focus({ preventScroll: true });
    let primero = null;
    for (let i = tramos.length - 1; i >= 0; i--) {
      Ed.restoreSelection(tramos[i]); Ed.cmd('delete');
      primero = Ed.getRange();
    }
    if (!primero) {                                             // solo había fijos: el cursor, detrás del primero
      const sig = fijos[0].nextElementSibling;
      if (sig && !F.es(sig)) Ed.setCaret(sig, 0);
    }
    if (Ed.afterChange) Ed.afterChange();
    return true;
  }

  /* un cursor colocado entre bloques, pegado a un fijo: al bloque editable más cercano */
  function recolocar() {
    const s = window.getSelection(); if (!s || !s.rangeCount || !s.isCollapsed) return;
    const r = s.getRangeAt(0), ed = editor();
    if (r.startContainer !== ed) return;
    const hijos = ed.childNodes, antes = hijos[r.startOffset - 1], despues = hijos[r.startOffset];
    if (!F.es(antes) && !F.es(despues)) return;
    if (despues && !F.es(despues) && despues.nodeType === 1) { Ed.setCaret(despues, 0); return; }
    if (antes && !F.es(antes) && antes.nodeType === 1) { Ed.setCaret(antes, antes.childNodes.length); return; }
    if (F.es(despues)) { const n = despues.nextElementSibling; if (n && !F.es(n)) Ed.setCaret(n, 0); }
    else if (F.es(antes)) { const n = antes.nextElementSibling; if (n && !F.es(n)) Ed.setCaret(n, 0); }
  }

  function iniciar() {
    const ed = editor(); if (!ed) return;
    /* en captura: antes que los atajos del editor (Markdown, guion, sangría) */
    ed.addEventListener('keydown', e => {
      if (!F.hay() || (e.key !== 'Backspace' && e.key !== 'Delete')) return;
      const r = Ed.getRange(); if (!r) return;
      if (!r.collapsed) {
        if (!tocados(r).length) return;
        e.preventDefault(); e.stopImmediatePropagation(); borrarTramos(r); return;
      }
      const b = arriba(r.startContainer); if (!b || F.es(b)) return;
      const trozo = document.createRange();
      if (e.key === 'Backspace') { if (!F.es(b.previousElementSibling)) return; trozo.setStart(b, 0); trozo.setEnd(r.startContainer, r.startOffset); }
      else { if (!F.es(b.nextElementSibling)) return; trozo.setStart(r.startContainer, r.startOffset); trozo.setEnd(b, b.childNodes.length); }
      /* dentro de una lista o una cita el Retroceso no une con el bloque de antes: se deja al editor */
      if (e.key === 'Backspace' && Ed.closestBlock(r.startContainer, ed) !== b && b.matches('ul, ol, blockquote')) return;
      if (!vacio(trozo)) return;
      e.preventDefault(); e.stopImmediatePropagation();
    }, true);
    ed.addEventListener('beforeinput', e => {
      if (!F.hay()) return;
      const r = Ed.getRange(); if (!r) return;
      const t = e.inputType || '';
      if (r.collapsed) {
        /* escribir con el cursor entre bloques junto a un fijo: dentro del bloque de al lado */
        if (r.startContainer === ed && t.startsWith('insert')) {
          const antes = ed.childNodes[r.startOffset - 1], despues = ed.childNodes[r.startOffset];
          if (F.es(antes) || F.es(despues)) {
            e.preventDefault(); recolocar();
            if (t === 'insertText' && e.data) Ed.cmd('insertText', e.data);
          }
        }
        return;
      }
      if (!tocados(r).length) return;
      if (!(t.startsWith('delete') || t.startsWith('insert'))) return;
      e.preventDefault();
      borrarTramos(r);
      if (t === 'insertText' && e.data) Ed.cmd('insertText', e.data);
      else if (t === 'insertParagraph') Ed.cmd('insertParagraph');
    }, true);
    /* pegar: primero se borra por tramos; el pegado del editor sigue con el cursor ya colocado */
    ed.addEventListener('paste', () => { const r = Ed.getRange(); if (r && !r.collapsed && F.hay() && tocados(r).length) borrarTramos(r); }, true);
    const alPortapapeles = (e, cortar) => {
      const r = Ed.getRange(); if (!r || r.collapsed || !F.hay() || !tocados(r).length || !e.clipboardData) return;
      const trozo = document.createElement('div'); trozo.appendChild(r.cloneContents());
      trozo.querySelectorAll(SEL).forEach(f => f.remove());
      e.preventDefault();
      e.clipboardData.setData('text/html', trozo.innerHTML);
      e.clipboardData.setData('text/plain', trozo.children.length ? Array.from(trozo.childNodes).map(n => n.textContent).join('\n') : trozo.textContent);   // fuera del documento innerText no da saltos de línea
      if (cortar) borrarTramos(r);
    };
    ed.addEventListener('copy', e => alPortapapeles(e, false), true);
    ed.addEventListener('cut', e => alPortapapeles(e, true), true);
    ed.addEventListener('dragstart', e => { const r = Ed.getRange(); if (r && !r.collapsed && F.hay() && tocados(r).length) e.preventDefault(); }, true);
    /* sin selección de texto dentro de un fijo al pulsarlo */
    ed.addEventListener('mousedown', e => { if (e.target.closest && e.target.closest(SEL) && !e.target.closest('input, textarea')) e.preventDefault(); }, true);
    document.addEventListener('selectionchange', () => { if (F.hay()) recolocar(); });
  }
  F.borrarTramos = borrarTramos;
  iniciar();
})(window.Ed);
