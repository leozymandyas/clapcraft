/* Formato de guion: las conversiones automáticas y el autocompletado de la «Especificación de formato de guion» que entregó
   Leo (17-09-2026). Lo que cambia el texto va por `execCommand` (entra en Deshacer); lo que solo es aspecto va en el CSS
   (mayúsculas, sangrías, paréntesis y corchetes de adorno).
   · Encabezado de escena: «int», «ext», «int/ext» al principio pasan a «INT.», «EXT.», «INT./EXT.» al escribir el espacio.
   · Paréntesis y nota: los «( )» y «[ ]» los pone el CSS; si se teclean al principio o al final, no se escriben (no salen dobles).
   · Transición: al salir del bloque se le añade «:» si no termina en «:» o «.» («FADE OUT.»); «FADE IN:» va a la izquierda.
   · Autocompletar: lugares y momentos del encabezado, secundarios, transiciones, tomas y actos, con los ya usados en el
     documento delante de la lista de la especificación. Flechas, Tab o Enter eligen; Esc cierra.
   · Numeración de escenas: `Ed.formato.numerar(v)` (la barra inferior), con un contador del CSS. */
(function (Ed) {
  'use strict';
  const F = {};
  Ed.formato = F;
  const editor = () => Ed.editor;
  const norm = s => String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  const limpio = s => String(s || '').replace(/\u200B/g, '').replace(/\u00A0/g, ' ');
  const tipo = b => (b && Ed.screenplay) ? Ed.screenplay.kindOf(b) : null;
  function bloqueActual() {
    const r = Ed.getRange();
    if (!r || !r.collapsed || !editor() || !editor().contains(r.startContainer)) return null;
    return Ed.closestBlock(r.startContainer, editor());
  }
  function textoAntes(b) {                                   // el texto del bloque hasta el cursor
    const r = Ed.getRange(); if (!r) return '';
    const pre = document.createRange(); pre.selectNodeContents(b); pre.setEnd(r.startContainer, r.startOffset);
    return limpio(pre.toString());
  }
  /* selecciona los últimos `n` caracteres antes del cursor (para sustituirlos con insertText) */
  function elegirAtras(b, n) {
    const r = Ed.getRange(); if (!r) return false;
    const pre = document.createRange(); pre.selectNodeContents(b); pre.setEnd(r.startContainer, r.startOffset);
    let desde = pre.toString().length - n; if (desde < 0) return false;
    const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); let t;
    while ((t = w.nextNode())) {
      if (desde <= t.nodeValue.length) {
        const sel = document.createRange(); sel.setStart(t, desde); sel.setEnd(r.startContainer, r.startOffset);
        Ed.restoreSelection(sel); return true;
      }
      desde -= t.nodeValue.length;
    }
    return false;
  }

  /* ---------- listas de la especificación ---------- */
  const PREFIJOS = ['INT. ', 'EXT. ', 'INT./EXT. '];
  const MOMENTOS = ['DÍA', 'NOCHE', 'MÁS TARDE', 'CONTINUO', 'AMANECER', 'ATARDECER'];
  const LISTAS = {
    subscene: ['TALKING HEAD - INT. - DÍA', 'MÁS TARDE', 'CONTINUO', 'EN EL PASILLO'],
    transition: ['CORTE A:', 'FUNDIDO A:', 'DISOLVENCIA A:', 'FADE IN:', 'FADE OUT.', 'FUNDIDO A NEGRO.', 'SMASH CUT A:', 'MÚSICA DE CIERRE Y CRÉDITOS, DESPUÉS:'],
    shot: ['ÁNGULO SOBRE ', 'PRIMER PLANO DE ', 'PLANO GENERAL', 'PUNTO DE VISTA DE ', 'DE REGRESO A LA ESCENA', 'INSERTO'],
    act: ['COLD OPEN', 'ACTO UNO', 'ACTO DOS', 'ACTO TRES', 'TAG', 'FIN DEL ACTO UNO', 'FIN']
  };
  const RE_PREFIJO = /^(INT\.\/EXT\.|INT\.|EXT\.|I\/E\.?)\s*/i;
  /* lo ya usado en el documento: en los encabezados, sus lugares y sus momentos; en lo demás, el texto entero */
  function usados(kind, salvo) {
    const out = [];
    editor().querySelectorAll('p.sp-' + kind).forEach(b => {
      if (b === salvo) return;
      const t = limpio(b.textContent).trim().toUpperCase(); if (t) out.push(t);
    });
    return out;
  }
  const unicos = xs => { const vistos = new Set(); return xs.filter(x => { const k = norm(x); if (!k || vistos.has(k)) return false; vistos.add(k); return true; }); };

  /* Qué sugerir en el bloque `b` con `antes` escrito: { lista, quitar } (quitar: cuántos caracteres del final se sustituyen) */
  function sugerencias(b, antes) {
    const kind = tipo(b), txt = antes;
    if (!txt.trim()) return null;
    if (kind === 'scene') {
      const m = txt.match(RE_PREFIJO);
      if (!m || !/\s$/.test(m[0]) && m[0].length === txt.length) {  // aún escribiendo el INT./EXT.
        const q = norm(txt); return { lista: PREFIJOS.filter(p => norm(p).startsWith(q) && norm(p) !== q), quitar: txt.length };
      }
      const resto = txt.slice(m[0].length), guion = resto.lastIndexOf(' - ');
      const escenas = usados('scene', b).map(t => t.replace(RE_PREFIJO, ''));
      if (guion < 0) {                                          // el lugar
        const q = norm(resto); if (!q) return null;
        const lugares = unicos(escenas.map(t => t.split(' - ')[0]));
        return { lista: lugares.filter(l => norm(l).startsWith(q) && norm(l) !== q).map(l => l + ' - '), quitar: resto.length };
      }
      const q = norm(resto.slice(guion + 3));                   // el momento
      const momentos = unicos(escenas.map(t => t.split(' - ').slice(1).join(' - ')).concat(MOMENTOS));
      return { lista: momentos.filter(x => norm(x).startsWith(q) && norm(x) !== q), quitar: resto.length - guion - 3 };
    }
    if (LISTAS[kind]) {
      const q = norm(txt);
      const lista = unicos(usados(kind, b).concat(LISTAS[kind])).filter(x => norm(x).startsWith(q) && norm(x) !== q);
      return { lista, quitar: txt.length };
    }
    return null;
  }

  /* ---------- el menú de sugerencias (el mismo aspecto que el de personajes) ---------- */
  let menu, items = [], index = 0, quitar = 0, activo = null;
  function construir() {
    menu = document.createElement('div');
    menu.className = 'ctx-menu char-menu sug-menu';
    menu.hidden = true;
    document.body.appendChild(menu);
    menu.addEventListener('mousedown', e => e.preventDefault());
    menu.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) aceptar(+b.dataset.i); });
    document.addEventListener('mousedown', e => { if (!menu.hidden && !(e.target.closest && e.target.closest('.sug-menu'))) cerrar(); });
  }
  function cerrar() { if (menu) menu.hidden = true; items = []; activo = null; }
  F.abierto = () => !!menu && !menu.hidden;
  function pintar() {
    menu.innerHTML = '<div class="ctx-title">Sugerencias</div>' + items.map((x, i) =>
      `<button type="button" data-i="${i}" class="${i === index ? 'active' : ''}"><span>${Ed.escapeHtml(x.trim())}</span>${i === 0 ? '<kbd>Tab</kbd>' : ''}</button>`).join('');
    menu.hidden = false;
    const r = Ed.getRange();
    let rect = r ? r.getBoundingClientRect() : null;
    if (!rect || !rect.height) rect = activo.getBoundingClientRect();
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - w - 4)) + 'px';
    menu.style.top = (rect.bottom + 6 + h > window.innerHeight ? Math.max(4, rect.top - h - 6) : rect.bottom + 6) + 'px';
  }
  function aceptar(i) {
    const x = items[i], b = activo, n = quitar;
    cerrar();
    if (!x || !b) return;
    if (n > 0 && !elegirAtras(b, n)) return;
    Ed.cmd('insertText', x);
    if (Ed.afterChange) Ed.afterChange();
    actualizar();                                             // tras el lugar, los momentos
  }
  function actualizar() {
    const b = bloqueActual();
    if (!b || !/^(scene|subscene|transition|shot|act)$/.test(tipo(b) || '')) { cerrar(); return; }
    const antes = textoAntes(b);
    const r = Ed.getRange(), post = document.createRange();
    post.setStart(r.startContainer, r.startOffset); post.setEnd(b, b.childNodes.length);
    if (limpio(post.toString()).trim()) { cerrar(); return; }  // solo al final del bloque
    const s = sugerencias(b, antes);
    if (!s || !s.lista.length) { cerrar(); return; }
    if (activo !== b || menu.hidden) index = 0;
    activo = b; items = s.lista.slice(0, 8); quitar = s.quitar; index = Math.min(index, items.length - 1);
    pintar();
  }
  F.onInput = function (e) {
    if (!menu) return;
    if (e && e.inputType && !/^(insert(Text|CompositionText)|delete)/.test(e.inputType)) { cerrar(); return; }
    actualizar();
    marcarTransiciones();
  };
  F.onKeydown = function (e) {
    if (!menu || menu.hidden) return false;
    if (e.key === 'ArrowDown') { e.preventDefault(); index = (index + 1) % items.length; pintar(); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); index = (index - 1 + items.length) % items.length; pintar(); return true; }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); aceptar(index); return true; }
    if (e.key === 'Escape') { e.preventDefault(); cerrar(); return true; }
    return false;
  };

  /* ---------- conversiones al escribir ---------- */
  function antesDeEscribir(e) {
    if (e.inputType !== 'insertText' || !e.data) return;
    const b = bloqueActual(), kind = tipo(b); if (!kind) return;
    const antes = textoAntes(b);
    const r = Ed.getRange(), post = document.createRange();
    post.setStart(r.startContainer, r.startOffset); post.setEnd(b, b.childNodes.length);
    const despues = limpio(post.toString());
    /* los adornos del CSS no se teclean dos veces */
    if ((kind === 'paren' && ((e.data === '(' && !antes.trim()) || (e.data === ')' && !despues.trim())))
      || (kind === 'note' && ((e.data === '[' && !antes.trim()) || (e.data === ']' && !despues.trim())))) { e.preventDefault(); return; }
    /* int → INT., ext → EXT., int/ext → INT./EXT. al escribir el espacio (o el punto) del principio */
    if (kind === 'scene' && (e.data === ' ' || e.data === '.')) {
      const m = antes.match(/^(int\/ext|i\/e|int|ext)\.?$/i);
      if (m) {
        const v = { 'int/ext': 'INT./EXT.', 'i/e': 'INT./EXT.', int: 'INT.', ext: 'EXT.' }[m[1].toLowerCase()];
        e.preventDefault();
        /* con el punto, sin espacio detrás (el que se teclee después no sale doble); con el espacio, «INT. » */
        if (elegirAtras(b, antes.length)) Ed.cmd('insertText', v + (e.data === ' ' ? ' ' : ''));
      }
    }
  }
  /* **Al salir de un bloque** (con `execCommand`, así entra en Deshacer y no descoloca su historial; antes la transición se
     tocaba por fuera y deshacer dejaba un «:» suelto): la transición recibe «:» si no termina en «:» ni en «.», y el paréntesis
     y la nota pierden los «( )» / «[ ]» que se hubieran pegado (el CSS ya los pinta: salían dobles). */
  let arreglando = false;
  function alSalir(b) {
    if (!b || !b.isConnected || arreglando) return;
    const kind = tipo(b); if (!/^(transition|paren|note)$/.test(kind || '')) return;
    const t = limpio(b.textContent);
    const texto = t.trim(); if (!texto) return;
    const volver = Ed.getRange(), guardado = volver && volver.cloneRange();
    const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), nodos = []; let n; while ((n = w.nextNode())) nodos.push(n);
    const cambios = [];                                         // [nodo, desde, hasta, texto] de atrás hacia delante
    if (kind === 'transition' && !/[:.]$/.test(texto)) {
      const ult = nodos.filter(x => x.nodeValue.replace(/\u200B/g, '').trim()).pop();
      /* «FADE OUT» y «FUNDIDO A NEGRO» terminan en punto (especificación); las demás, en dos puntos */
      const cierre = /^(FADE OUT|FUNDIDO A NEGRO)$/.test(norm(texto).replace(/\s+/g, ' ')) ? '.' : ':';
      if (ult) { const fin = ult.nodeValue.replace(/[\s\u00A0\u200B]+$/, '').length; cambios.push([ult, fin, ult.nodeValue.length, cierre]); }
    }
    const [abre, cierra] = kind === 'paren' ? ['(', ')'] : kind === 'note' ? ['[', ']'] : [null, null];
    if (abre) {
      const ult = nodos.filter(x => x.nodeValue.trim()).pop(), pri = nodos.find(x => x.nodeValue.trim());
      if (ult) { const v = ult.nodeValue.replace(/[\s\u00A0]+$/, ''); if (v.endsWith(cierra)) cambios.push([ult, v.length - 1, v.length, '']); }
      if (pri) { const i0 = pri.nodeValue.search(/\S/); if (pri.nodeValue[i0] === abre) cambios.push([pri, i0, i0 + 1, '']); }
    }
    if (!cambios.length) return;
    arreglando = true;
    try {
      cambios.forEach(([nodo, desde, hasta, txt]) => {
        const r = document.createRange(); r.setStart(nodo, desde); r.setEnd(nodo, hasta); Ed.restoreSelection(r);
        if (txt) Ed.cmd('insertText', txt); else Ed.cmd('delete');
      });
      if (guardado && guardado.startContainer.isConnected) Ed.restoreSelection(guardado);
    } finally { arreglando = false; }
    if (Ed.afterChange) Ed.afterChange();
  }
  function marcarTransiciones() {
    editor().querySelectorAll('p.sp-transition').forEach(b => {
      const izq = /^FADE IN:?$/.test(norm(b.textContent));
      if (izq !== b.hasAttribute('data-izq')) b.toggleAttribute('data-izq', izq);
    });
  }
  F.refrescar = marcarTransiciones;

  /* ---------- numeración de escenas ---------- */
  F.numerar = function (v) {
    if (!editor()) return false;
    if (v !== undefined) editor().classList.toggle('numerar-escenas', !!v);
    return editor().classList.contains('numerar-escenas');
  };

  function iniciar() {
    if (!editor()) return;
    construir();
    editor().addEventListener('beforeinput', antesDeEscribir);
    let ultimo = null;
    document.addEventListener('selectionchange', () => {
      const b = bloqueActual();
      if (arreglando) return;
      if (ultimo && b !== ultimo) { alSalir(ultimo); if (activo && b !== activo) cerrar(); }
      ultimo = b;
    });
    marcarTransiciones();
    new MutationObserver(Ed.debounce(marcarTransiciones, 200)).observe(editor(), { childList: true, subtree: true, characterData: true });
    /* la vista se aplica antes de que exista este módulo (page.js carga primero): la numeración guardada se pone aquí */
    if (Ed.page && Ed.page.state) F.numerar(!!Ed.page.state.numerar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(window.Ed);
