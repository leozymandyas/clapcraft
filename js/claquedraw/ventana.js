/* Claquedraw · la ventana de una nota: «/», zoom, typewriter y citar (1.1.60)
   Leo, 27-09-2026: «Necesito que los bloques de prompt y avisos funcionen en el modal de texto, con uso del /. Además agrega las
   funcionalidades de zoom y typewriter que se tienen en ClapBook para estos modales», y «poder citar textos para mandarlos al
   asistente». La ventana es de js/claquedraw/gestor.js (`capaNota`: el campo es el documento, `vistaLado` / `htmlDeLadoEditado`);
   aquí va lo que se le añade encima, que el gestor monta al crearla (`C.ventana.montar(capa, api)`):
   · **el menú «/»**: al principio de un renglón o tras un espacio, «/» abre un menú con buscador (como js/slash.js en el editor):
     texto, títulos, listas, cita, código, tabla, imagen, separador, plantilla y los recuadros (prompt, aviso y, al buscarlos, cada
     tipo de aviso). Flechas, Enter o Tab; Esc o un clic fuera lo cierran y quitan lo escrito desde la «/». No en una fórmula (texto
     plano), ni en un bloque de código ni en una tabla. Un recuadro nuevo entra con **un solo `insertHTML`** (un paso de Deshacer,
     como `R.crear` del editor): en un renglón vacío, en blanco; en uno con texto, lo envuelve; dentro de otro, lo cambia de tipo.
     Lo que no es texto (la tabla, la imagen, la línea) pasa por `api.vista` (`vistaLado`), así vuelve al documento como lo que es;
   · **el zoom del texto y la longitud de línea, como ClapBook** (js/clapbook/lectura.js): `vista.zoomTexto` (50–200 %, 100 de
     serie) y `vista.lineaLegible` (sí de serie) para todas las ventanas de nota, en `--zoom-nota` y `--ancho-nota` sobre la capa;
     «− % +» y el ancho en el pie de la ventana, Cmd/Ctrl + − 0 con la ventana delante y el pellizco (o Ctrl + rueda) sobre la
     hoja, anclado a la línea que queda bajo el gesto. No toca el zoom del esquema ni el del lienzo;
   · **typewriter** (`vista.typewriter`, de serie sí, como en ClapBook): tras escribir o mover el cursor (teclas y ratón) la línea
     del cursor se centra en la hoja, y la cola del papel mide media hoja para que también la última llegue al centro;
   · **citar en el asistente**: con texto elegido, el clic derecho (el menú de formato del gestor) o Cmd/Ctrl+Mayús+A mandan ese
     texto al asistente con el enlace de su tramo (la nota y sus bloques, contados como los cuenta Claude, `C.conversor.bloques`). */
(function (C) {
  'use strict';
  const MIN = 50, MAX = 200, ANCHO = 648;                      // el ancho de lectura a 100 %: el de siempre (760 − 2 × 56)
  const MAC = /Mac|iP(hone|ad)/.test(navigator.platform || '');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const limitar = x => (typeof x === 'number' && Number.isFinite(x) ? Math.round(Math.max(MIN, Math.min(MAX, x)) * 10) / 10 : 100);
  const RCX = () => C.conversor && C.conversor.RECUADROS;
  const LADO_BLOQUE = /^(P|DIV|H[1-6]|UL|OL|LI|BLOCKQUOTE|PRE|SECTION|ARTICLE|HEADER|FOOTER|TABLE)$/;   // los de gestor.js

  let capa = null, campo = null, hoja = null, api = null;
  const abierta = () => !!(capa && !capa.hidden && api && api.id());
  const plano = () => !!(api && api.plano && api.plano());
  const prefs = () => (api && api.prefs && api.prefs()) || {};
  const guardarPrefs = () => { if (api && api.guardarPrefs) api.guardarPrefs(); };
  const rango = () => { const s = getSelection(); return s && s.rangeCount ? s.getRangeAt(0) : null; };
  const poner = r => { const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
  const cursor = (n, k) => { const r = document.createRange(); r.setStart(n, k); r.collapse(true); poner(r); };
  const alFinal = n => { const r = document.createRange(); r.selectNodeContents(n); r.collapse(false); poner(r); };
  const elDe = n => (n && n.nodeType === 3 ? n.parentElement : n);
  const tocado = () => campo.dispatchEvent(new Event('input', { bubbles: true }));   // el gestor lo guarda como lo escrito
  const vacio = el => !el.textContent.replace(/[\u200B\s]/g, '') && !(el.querySelector && el.querySelector('img, table, [data-f]'));
  const cmd = (c, v) => { try { return document.execCommand(c, false, v); } catch (_) { return false; } };
  /* el hijo de primer nivel del campo que contiene a un nodo */
  const topDe = n => { let x = elDe(n); while (x && x.parentNode !== campo) x = x.parentNode; return x && x.parentNode === campo ? x : null; };
  const recuadroDe = n => { const e = elDe(n), rc = e && e.closest ? e.closest('div[data-rc]') : null; return rc && rc.parentNode === campo ? rc : null; };
  /* el bloque de texto del cursor (un párrafo, un elemento de lista, un título…) */
  const bloqueDe = n => { const e = elDe(n), b = e && e.closest ? e.closest('p, li, h1, h2, h3, h4, h5, h6, pre, blockquote, td, th') : null; return b && campo.contains(b) ? b : topDe(n); };

  /* ====================================================================
     el menú «/»
     ==================================================================== */
  const T = t => () => { const b = actual(); if (!b) return; if (window.MdVivo && MdVivo.formato) MdVivo.formato(campo, 'titulo', t, { bloques: el => !Array.from(el.classList).some(c => /^sp-/.test(c)) }); };
  const ORDENES = [
    { grupo: 'Bloques', id: 'texto', nombre: 'Texto', claves: 'texto normal parrafo', pista: '', run: T(0) },
    { grupo: 'Bloques', id: 'h1', nombre: 'Título 1', claves: 'titulo encabezado h1', pista: '#', run: T(1) },
    { grupo: 'Bloques', id: 'h2', nombre: 'Título 2', claves: 'titulo encabezado h2', pista: '##', run: T(2) },
    { grupo: 'Bloques', id: 'h3', nombre: 'Título 3', claves: 'titulo encabezado h3', pista: '###', run: T(3) },
    { grupo: 'Bloques', id: 'ul', nombre: 'Lista con viñetas', claves: 'lista vinetas', pista: '- ', run: () => aLista('UL') },
    { grupo: 'Bloques', id: 'ol', nombre: 'Lista numerada', claves: 'lista numerada numeros', pista: '1. ', run: () => aLista('OL') },
    { grupo: 'Bloques', id: 'cita', nombre: 'Cita', claves: 'cita quote', pista: '> ', run: () => aCita() },
    { grupo: 'Bloques', id: 'codigo', nombre: 'Bloque de código', claves: 'codigo code', pista: '```', run: () => aCodigo() },
    { grupo: 'Bloques', id: 'tabla', nombre: 'Tabla', claves: 'tabla table', pista: '2 × 2', run: () => bloqueNuevo('<table><tbody><tr><th><br></th><th><br></th></tr><tr><td><br></td><td><br></td></tr></tbody></table>', 'tabla') },
    { grupo: 'Bloques', id: 'imagen', nombre: 'Imagen', claves: 'imagen foto image picture archivo', pista: 'archivo', run: () => elegirImagen() },
    { grupo: 'Bloques', id: 'linea', nombre: 'Separador', claves: 'separador linea horizontal hr', pista: '---', run: () => bloqueNuevo('<hr>', 'linea') },
    { grupo: 'Bloques', id: 'plantilla', nombre: 'Plantilla…', claves: 'plantilla template', pista: '', visible: () => !!(api && api.plantilla && C.plantillas), run: r0 => api.plantilla(r0) },
    { grupo: 'Recuadros', id: 'rc-prompt', nombre: 'Prompt', claves: 'prompt ia claude seedance instrucciones recuadro', pista: '✦ con «Copiar»', run: () => recuadro({ rc: 'prompt' }) },
    { grupo: 'Recuadros', id: 'rc-aviso', nombre: 'Aviso', claves: 'aviso callout recuadro nota', pista: '◆ nota', run: () => recuadro({ rc: 'aviso', tipo: 'note' }) }
  ];
  (function tiposDeAviso() {                                   // cada tipo de aviso, solo al buscarlo (como en el editor)
    const R = RCX(); if (!R) return;
    R.TIPOS.filter(t => t[0] !== 'note').forEach(([id, nombre, glifo]) => {
      const alias = Object.keys(R.ALIAS_TIPO).filter(k => R.ALIAS_TIPO[k] === id).join(' ');
      ORDENES.push({ grupo: 'Recuadros', id: 'rc-' + id, nombre: 'Aviso: ' + nombre, claves: norm(nombre) + ' ' + id + ' ' + alias, pista: glifo, soloBuscando: true, run: () => recuadro({ rc: 'aviso', tipo: id }) });
    });
  })();
  let menu = null, abierto = false, ancla = null, anclaK = -1, items = [], indice = 0;
  function menuEl() {
    if (menu) return menu;
    menu = document.createElement('div');
    menu.className = 'vt-slash'; menu.hidden = true; menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', 'Insertar');
    document.body.appendChild(menu);
    menu.addEventListener('mousedown', e => e.preventDefault());   // el foco se queda en el campo
    menu.addEventListener('click', e => { e.stopPropagation(); const b = e.target.closest('[data-i]'); if (b) elegir(+b.dataset.i); });
    return menu;
  }
  /* lo escrito tras la «/»; null si el cursor ya no está en su sitio */
  function consulta() {
    const r = rango();
    if (!ancla || !ancla.isConnected || !r || !r.collapsed || r.startContainer !== ancla || r.startOffset <= anclaK) return null;
    const t = ancla.nodeValue.slice(anclaK, r.startOffset);
    return t[0] === '/' ? t.slice(1).replace(/\u00A0/g, ' ') : null;
  }
  function pintarMenu(q) {
    const nq = norm(q);
    items = ORDENES.filter(c => (!c.visible || c.visible()) && ((!nq && !c.soloBuscando) || (nq && (norm(c.nombre).includes(nq) || c.claves.split(' ').some(k => k.startsWith(nq))))));
    if (!items.length) { cerrar(false); return; }
    indice = Math.min(indice, items.length - 1);
    let h = '', g = '';
    items.forEach((c, i) => {
      if (c.grupo !== g) { g = c.grupo; h += `<div class="vt-slash-tit">${esc(g)}</div>`; }
      h += `<button type="button" role="option" data-i="${i}" class="${i === indice ? 'on' : ''}" aria-selected="${i === indice}"><span>${esc(c.nombre)}</span>${c.pista ? `<kbd>${esc(c.pista)}</kbd>` : ''}</button>`;
    });
    const m = menuEl(); m.innerHTML = h; m.hidden = false;
    colocarMenu();
    const on = m.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function colocarMenu() {
    const r = rango(); if (!r || !menu) return;
    let rr = r.getBoundingClientRect();
    if (!rr.height) { const b = bloqueDe(r.startContainer); if (b) rr = b.getBoundingClientRect(); }
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(6, Math.min(rr.left, innerWidth - w - 6)) + 'px';
    menu.style.top = (rr.bottom + 6 + h > innerHeight - 6 ? Math.max(6, rr.top - h - 6) : rr.bottom + 6) + 'px';
  }
  function refrescar() { if (!abierto) return; const q = consulta(); if (q === null || q.length > 24) cerrar(false); else pintarMenu(q); }
  /* `quitar`: fuera también lo escrito desde la «/» (Esc o un clic fuera; Leo) */
  function cerrar(quitar) {
    if (quitar && ancla && ancla.isConnected) {
      const r = rango(), q = consulta();
      const hasta = q !== null && r ? r.startOffset : Math.min(ancla.nodeValue.length, anclaK + 1);
      if (ancla.nodeValue[anclaK] === '/') {
        const del = document.createRange(); del.setStart(ancla, anclaK); del.setEnd(ancla, hasta);
        if (campo.contains(document.activeElement) || document.activeElement === campo) { poner(del); cmd('delete'); }
        else { ancla.deleteData(anclaK, hasta - anclaK); tocado(); }
      }
    }
    abierto = false; ancla = null; anclaK = -1; if (menu) menu.hidden = true;
  }
  let recienElegido = null;                                    // el bloque donde estaba el cursor al elegir
  function actual() { return recienElegido && recienElegido.isConnected ? recienElegido : (rango() && bloqueDe(rango().startContainer)); }
  function elegir(i) {
    const c = items[i]; if (!c) return;
    const r = rango();
    if (r && r.startContainer === ancla) {                     // fuera «/consulta» (entra en Deshacer)
      const del = document.createRange(); del.setStart(ancla, anclaK); del.setEnd(ancla, r.startOffset);
      poner(del); cmd('delete');
    }
    cerrar(false);
    const r1 = rango(), b = r1 && bloqueDe(r1.startContainer);
    if (b && b !== campo && vacio(b) && !b.querySelector('br') && !/^(UL|OL|TABLE|BLOCKQUOTE)$/.test(b.tagName)) { b.appendChild(document.createElement('br')); cursor(b, 0); }
    recienElegido = b;
    try { c.run(r1 ? r1.cloneRange() : null); } finally { recienElegido = null; }
  }
  /* la «/» recién escrita: ¿abre el menú? */
  function alEscribir(e) {
    if (abierto) { refrescar(); return; }
    if (plano() || e.inputType !== 'insertText' || e.data !== '/') return;
    const r = rango(); if (!r || !r.collapsed || r.startContainer.nodeType !== 3 || !campo.contains(r.startContainer)) return;
    const b = bloqueDe(r.startContainer); if (!b) return;
    const e0 = elDe(r.startContainer);
    if (e0.closest('pre, code, table, .gd-lado-fijo')) return;  // ni en código ni en una tabla
    const antes = document.createRange(); antes.setStart(b, 0); antes.setEnd(r.startContainer, r.startOffset);
    if (!/(^|\s)\/$/.test(antes.toString().replace(/[\u200B]/g, '').replace(/\u00A0/g, ' '))) return;
    ancla = r.startContainer; anclaK = r.startOffset - 1; indice = 0; abierto = true;
    pintarMenu('');
  }

  /* ---------- lo que hace cada orden ---------- */
  function aLista(tag) {
    const b = actual(); if (!b || b === campo) return;
    if (b.tagName === 'LI') { const l = b.parentNode; if (l.tagName !== tag) { const n = document.createElement(tag); while (l.firstChild) n.appendChild(l.firstChild); l.replaceWith(n); } alFinal(b); tocado(); return; }
    if (!/^(P|DIV|H[1-6])$/.test(b.tagName) || b.matches('[data-rc]')) return;
    const li = document.createElement('li');
    while (b.firstChild) li.appendChild(b.firstChild);
    if (!li.firstChild) li.appendChild(document.createElement('br'));
    const prev = b.previousElementSibling;
    if (prev && prev.tagName === tag) { prev.appendChild(li); b.remove(); }
    else { const l = document.createElement(tag); l.appendChild(li); b.replaceWith(l); }
    alFinal(li); tocado();
  }
  function aCita() {
    const b = actual(); if (!b || b === campo || !/^(P|DIV|H[1-6])$/.test(b.tagName) || b.matches('[data-rc]') || b.closest('blockquote')) return;
    const p = document.createElement('p'); while (b.firstChild) p.appendChild(b.firstChild); if (!p.firstChild) p.appendChild(document.createElement('br'));
    const prev = b.previousElementSibling;
    if (prev && prev.tagName === 'BLOCKQUOTE') { prev.appendChild(p); b.remove(); }
    else { const q = document.createElement('blockquote'); q.appendChild(p); b.replaceWith(q); }
    alFinal(p); tocado();
  }
  function aCodigo() {
    const b = actual(); if (!b || b === campo) return;
    if (b.tagName === 'PRE') return;
    cmd('formatBlock', 'pre');
  }
  /* un bloque que no es texto (tabla, línea, imagen): por `api.vista`, como el campo pinta el documento; detrás del bloque del
     cursor o, si está vacío, en su lugar; y detrás, un renglón para seguir escribiendo */
  function bloqueNuevo(html, que) {
    if (!api.vista) return;
    const vista = api.vista(html); if (!vista) return;
    const b = actual(), top = b && topDe(b);
    const antes = new Set(campo.children);
    /* con el cursor en un renglón vacío y sin nada detrás en el HTML (el renglón de después se pone a mano): Chrome sustituye el
       párrafo vacío por lo insertado; con un bloque y un párrafo detrás, metía el párrafo dentro del vacío (<p><p>…</p></p>) */
    let donde = top;
    if (!(top && top.tagName === 'P' && vacio(top) && !recuadroDe(top))) {
      const p = document.createElement('p'); p.appendChild(document.createElement('br'));
      if (top) top.after(p); else campo.appendChild(p);
      donde = p;
    }
    campo.focus({ preventScroll: true });
    cursor(donde, 0);
    campo.classList.add('md-fusion');
    try { cmd('insertHTML', vista); } finally { campo.classList.remove('md-fusion'); }
    const nuevos = Array.from(campo.children).filter(x => !antes.has(x));
    let hecho = nuevos.find(x => x.matches('table, [data-f]') || x.querySelector('[data-f]'));
    if (!hecho) hecho = Array.from(campo.querySelectorAll(que === 'tabla' ? ':scope > table' : ':scope > [data-f], :scope > p:has(> [data-f])')).find(x => !antes.has(x)) || null;
    if (donde.isConnected && donde !== hecho && vacio(donde) && hecho && donde.nextElementSibling === hecho) donde.remove();   // el vacío que se quedara delante
    let sig = hecho && hecho.nextElementSibling;
    if (hecho && !(sig && sig.tagName === 'P' && vacio(sig))) { sig = document.createElement('p'); sig.appendChild(document.createElement('br')); hecho.after(sig); }
    if (que === 'tabla') { const c = hecho && hecho.querySelector('th, td'); if (c) cursor(c, 0); }
    else if (sig) cursor(sig, 0);
    tocado();
  }
  function elegirImagen() {
    const r0 = rango() && rango().cloneRange(), b0 = actual();
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.hidden = true;
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; inp.remove();
      if (!f || !/^image\//.test(f.type)) return;
      let src = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => ok(null); fr.readAsDataURL(f); });
      if (!src) return;
      try { if (window.Anotar && Anotar.ligera) src = (await Anotar.ligera(src)) || src; } catch (_) {}
      if (!abierta()) return;
      campo.focus({ preventScroll: true });
      if (r0 && campo.contains(r0.startContainer)) poner(r0);
      recienElegido = b0;
      try { bloqueNuevo(`<p><img src="${esc(src)}" alt="${esc(f.name || '')}"></p>`, 'imagen'); } finally { recienElegido = null; }
    });
    document.body.appendChild(inp);
    inp.click();
  }
  /* un prompt o un aviso: en un renglón vacío, en blanco; en uno con texto, lo envuelve; dentro de otro, lo cambia */
  function recuadro(o) {
    const R = RCX(); if (!R) return;
    const b = actual(); if (!b) return;
    const dentro = recuadroDe(b);
    if (dentro) {
      dentro.setAttribute('data-rc', o.rc); dentro.className = 'rc rc-' + o.rc;
      if (o.rc === 'aviso') dentro.setAttribute('data-tipo', R.tipo(o.tipo)); else dentro.removeAttribute('data-tipo');
      tocado(); return;
    }
    let top = topDe(b); if (!top) return;
    if (top.matches('table, [data-f], hr')) {                   // detrás de lo que no se envuelve: un renglón nuevo
      const p = document.createElement('p'); p.appendChild(document.createElement('br')); top.after(p); top = p;
    }
    const enBlanco = vacio(top);
    let cuerpo = '<p><br></p>';
    if (!enBlanco) {
      const c = top.cloneNode(true);
      [c, ...c.querySelectorAll('[class]')].forEach(x => { Array.from(x.classList).forEach(k => { if (/^(sp-|ch-nom$)/.test(k)) x.classList.remove(k); }); if (!x.classList.length) x.removeAttribute('class'); });
      [c, ...c.querySelectorAll('[data-ch], [data-izq]')].forEach(x => { x.removeAttribute('data-ch'); x.removeAttribute('data-izq'); if (x.style) { x.style.removeProperty('--chl'); x.style.removeProperty('--chd'); if (!x.style.length) x.removeAttribute('style'); } });
      cuerpo = /^(H[1-6]|DIV)$/.test(c.tagName) ? '<p>' + c.innerHTML + '</p>' : c.outerHTML;
    }
    const html = R.html({ rc: o.rc, tipo: o.tipo }, cuerpo);
    const antes = new Set(campo.querySelectorAll(':scope > div[data-rc]'));
    campo.focus({ preventScroll: true });
    const r = document.createRange(); r.selectNodeContents(top); poner(r);
    campo.classList.add('md-fusion');
    try { cmd('insertHTML', html); } finally { campo.classList.remove('md-fusion'); }
    let nuevo = Array.from(campo.querySelectorAll(':scope > div[data-rc]')).find(x => !antes.has(x));
    if (!nuevo) {                                              // Chrome lo dejó dentro de otra cosa: a mano (sin Deshacer)
      const suelto = Array.from(campo.querySelectorAll('div[data-rc]')).find(x => !antes.has(x));
      const t = suelto ? topDe(suelto) : null;
      if (t && suelto) { t.replaceWith(suelto); nuevo = suelto; }
      else { const tpl = document.createElement('template'); tpl.innerHTML = html; nuevo = tpl.content.firstChild; (top.isConnected ? top : campo.lastChild).after(nuevo); if (top.isConnected && vacio(top)) top.remove(); }
    }
    /* sin restos: un párrafo vacío que Chrome dejara delante (del que estaba) */
    const prev = nuevo.previousElementSibling;
    if (prev && prev === top && top.isConnected && vacio(top)) top.remove();
    if (!nuevo.nextElementSibling) { const p = document.createElement('p'); p.appendChild(document.createElement('br')); nuevo.after(p); }
    const primero = nuevo.firstElementChild || nuevo;
    if (enBlanco) cursor(primero, 0); else { const ult = nuevo.lastElementChild || nuevo; alFinal(ult); }
    tocado();
  }

  /* ====================================================================
     los huecos del prompt, realzados (como en el editor: la API CSS Highlight, sin tocar el DOM)
     ==================================================================== */
  const hayHighlight = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';
  let huecosT = null;
  function pintarHuecos() {
    if (!hayHighlight || !campo) return;
    const rangos = [];
    if (abierta()) campo.querySelectorAll(':scope > div[data-rc="prompt"]').forEach(rc => {
      rc.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, pre').forEach(bl => {
        const nodos = [], tw = document.createTreeWalker(bl, NodeFilter.SHOW_TEXT, { acceptNode: t => (t.parentNode.closest('li, p, h1, h2, h3, h4, h5, h6, pre') === bl ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
        let t, texto = '';
        while ((t = tw.nextNode())) { nodos.push({ n: t, desde: texto.length }); texto += t.nodeValue; }
        const punto = k => { for (let i = nodos.length - 1; i >= 0; i--) if (nodos[i].desde <= k) return [nodos[i].n, k - nodos[i].desde]; return null; };
        const re = /\[([^[\]\n]+)\]/g; let m;
        while ((m = re.exec(texto))) {
          if (texto[m.index - 1] === '[' && texto[m.index + m[0].length] === ']') continue;
          const a = punto(m.index), z = punto(m.index + m[0].length - 1); if (!a || !z) continue;
          const rg = document.createRange(); rg.setStart(a[0], a[1]); rg.setEnd(z[0], Math.min(z[1] + 1, z[0].nodeValue.length)); rangos.push(rg);
        }
      });
    });
    if (rangos.length || CSS.highlights.has('rc-hueco')) CSS.highlights.set('rc-hueco', new Highlight(...rangos));
  }
  const huecosLuego = () => { clearTimeout(huecosT); huecosT = setTimeout(pintarHuecos, 120); };

  /* ====================================================================
     zoom del texto y longitud de línea (como ClapBook, js/clapbook/lectura.js)
     ==================================================================== */
  let zoom = 100, legible = true, guardarT = null, rueda = null;
  const zonaZoom = el => el instanceof Element && !!el.closest('.gd-modal-capa .gd-modal-hoja');
  function aplicarZoom() {
    if (!capa) return;
    capa.style.setProperty('--zoom-nota', String(zoom / 100));
    capa.style.setProperty('--ancho-nota', (ANCHO * zoom / 100) + 'px');
    capa.classList.toggle('nota-ancha', !legible);
    pintarPie();
  }
  /* un punto del texto (el del gesto, o el centro de la hoja) y dónde está, para dejarlo ahí tras cambiar el tamaño */
  function anclaEn(x, y) {
    if (!hoja) return null;
    const hr = hoja.getBoundingClientRect();
    if (!(x >= hr.left && x <= hr.right && y >= hr.top && y <= hr.bottom)) { x = hr.left + hr.width / 2; y = hr.top + hr.height / 2; }
    let r = null; try { r = document.caretRangeFromPoint(x, y); } catch (_) {}
    const medir = () => { if (r && hoja.contains(r.startContainer)) { const q = r.getBoundingClientRect(); if (q.height) return q.top; const e = elDe(r.startContainer); return e ? e.getBoundingClientRect().top : null; } return null; };
    const y0 = medir();
    return y0 === null ? null : { medir, y0 };
  }
  function fijarZoom(v, op) {
    const nuevo = limitar(v); if (nuevo === zoom) return zoom;
    op = op || {};
    const a = abierta() ? anclaEn(op.x, op.y) : null;
    zoom = nuevo;
    if (zoom === 100) delete prefs().zoomTexto; else prefs().zoomTexto = zoom;
    aplicarZoom();
    if (a) { const y1 = a.medir(); if (y1 !== null) hoja.scrollTop += y1 - a.y0; }
    if (tw()) medioHoja();
    clearTimeout(guardarT); if (op.luego) guardarT = setTimeout(guardarPrefs, 180); else guardarPrefs();
    return zoom;
  }
  const pasoZoom = n => fijarZoom(n === 0 ? 100 : Math.round(zoom / 10) * 10 + n * 10);
  function longitud(v) {
    legible = v === undefined ? !legible : !!v;
    if (legible) delete prefs().lineaLegible; else prefs().lineaLegible = false;
    aplicarZoom(); guardarPrefs();
    if (tw()) setTimeout(centrar, 0);
    return legible;
  }
  /* el pellizco del trackpad (Chromium: rueda con Ctrl) y Ctrl + rueda, sobre la hoja; uno por fotograma */
  function alRueda(e) {
    if (!e.ctrlKey || !abierta() || !zonaZoom(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    const d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
    if (!rueda) { rueda = { d: 0, x: e.clientX, y: e.clientY }; requestAnimationFrame(() => { const w = rueda; rueda = null; fijarZoom(zoom * Math.exp(-Math.max(-200, Math.min(200, w.d)) / 400), { luego: true, x: w.x, y: w.y }); }); }
    rueda.d += d;
  }

  /* ====================================================================
     typewriter (como ClapBook): la línea del cursor, en el centro de la hoja
     ==================================================================== */
  const tw = () => prefs().typewriter !== false;
  function medioHoja() { if (capa && hoja) capa.style.setProperty('--vt-media-hoja', Math.round(hoja.clientHeight / 2) + 'px'); }
  function centrar() {
    if (!tw() || !abierta() || abierto) return;
    const r = rango(); if (!r || !campo.contains(r.startContainer)) return;
    const x = r.cloneRange(); x.collapse(false);
    let rr = x.getClientRects()[0] || x.getBoundingClientRect();
    if (!rr || !rr.height) { const b = bloqueDe(r.endContainer); if (!b) return; const q = b.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(b).lineHeight) || 24; rr = { top: q.top, bottom: q.top + Math.min(q.height, lh) }; }
    const hr = hoja.getBoundingClientRect();
    const dy = (rr.top + rr.bottom) / 2 - (hr.top + hoja.clientHeight / 2);
    if (Math.abs(dy) > 1) hoja.scrollTop += dy;
  }
  let centrarT = null;
  const centrarLuego = () => { if (!tw()) return; clearTimeout(centrarT); centrarT = setTimeout(centrar, 0); };
  function alternarTypewriter(v) {
    const on = v === undefined ? !tw() : !!v;
    if (on) delete prefs().typewriter; else prefs().typewriter = false;
    capa.classList.toggle('typewriter', on);
    guardarPrefs(); pintarPie();
    if (on) { medioHoja(); campo.focus({ preventScroll: true }); centrar(); }
    return on;
  }

  /* ====================================================================
     el pie de la ventana: typewriter, longitud de línea y zoom
     ==================================================================== */
  const tecla = k => MAC ? k.replace('Mod+', '⌘') : k.replace('Mod+', 'Ctrl+');
  function pie() {
    const p = document.createElement('footer');
    p.className = 'vt-pie';
    p.innerHTML = `<button type="button" class="vt-pill" data-vt-typewriter aria-pressed="false" title="Typewriter: la línea que escribes, siempre en el centro">Typewriter</button>`
      + `<button type="button" class="vt-pill" data-vt-legible aria-pressed="true" title="Limita el ancho del texto para que los párrafos largos se lean mejor">Línea legible</button>`
      /* las versiones de la nota (como en ClapBook y en el editor): con el nombre de la que coincide con lo de ahora (gestor.js) */
      + (api.versiones ? `<button type="button" class="vt-pill vt-versiones" data-vt-versiones title="Versiones de la nota: guardar, cargar y comparar"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.7 8a5.3 5.3 0 1 0 1.6-3.8"/><path d="M2.4 3.1v2.6h2.6"/><path d="M8 5.4V8l1.9 1.1"/></svg><span data-vt-version>Versiones</span></button>` : '')
      + `<span class="spacer"></span><span class="vt-rot">Zoom</span>`
      + `<span class="vt-zoom" role="group" aria-label="Zoom del texto"><button type="button" data-vt-zoom="-1" title="Reducir el texto (${tecla('Mod+−')})" aria-label="Reducir el texto">−</button>`
      + `<button type="button" class="vt-zoom-valor" data-vt-zoom="0" title="Tamaño real (${tecla('Mod+0')}); también se pellizca sobre la nota">100 %</button>`
      + `<button type="button" data-vt-zoom="1" title="Ampliar el texto (${tecla('Mod++')})" aria-label="Ampliar el texto">+</button></span>`;
    p.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.matches('[data-vt-zoom]')) pasoZoom(+b.dataset.vtZoom);
      else if (b.matches('[data-vt-legible]')) longitud();
      else if (b.matches('[data-vt-typewriter]')) alternarTypewriter();
      else if (b.matches('[data-vt-versiones]') && api.versiones) api.versiones(b);
    });
    p.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });   // el cursor se queda en el campo
    return p;
  }
  /* el nombre de la versión que hay en la ventana (la que coincide con su texto) o «Versiones» */
  function pintarVersion(nombre) {
    const b = capa && capa.querySelector('[data-vt-versiones]'); if (!b) return;
    b.querySelector('[data-vt-version]').textContent = nombre || 'Versiones';
    b.classList.toggle('con-version', !!nombre);
    b.title = nombre ? 'Versión «' + nombre + '» (es lo que hay ahora) · guardar, cargar y comparar' : 'Versiones de la nota: guardar, cargar y comparar';
  }
  function pintarPie() {
    if (!capa) return;
    const v = capa.querySelector('.vt-zoom-valor'); if (v) v.textContent = Math.round(zoom) + ' %';
    const m = capa.querySelector('[data-vt-zoom="-1"]'), M = capa.querySelector('[data-vt-zoom="1"]');
    if (m) m.disabled = zoom <= MIN; if (M) M.disabled = zoom >= MAX;
    const l = capa.querySelector('[data-vt-legible]'); if (l) { l.setAttribute('aria-pressed', String(legible)); l.classList.toggle('on', legible); }
    const t = capa.querySelector('[data-vt-typewriter]'); if (t) { t.setAttribute('aria-pressed', String(tw())); t.classList.toggle('on', tw()); }
  }

  /* ====================================================================
     citar en el asistente
     ==================================================================== */
  /* el tramo (bloques desde 1, huella del primero) de lo elegido en el campo: los bloques del documento son los hijos de primer
     nivel del campo (htmlDeLadoEditado los devuelve uno a uno; el texto suelto seguido, en un párrafo), así que se cuentan igual y
     se comprueba con los de la nota guardada (`C.conversor.bloques`); si no cuadran, la nota entera */
  function tramoLado(r) {
    const nt = api.nota && api.nota(); if (!nt || !r || !C.conversor) return null;
    const idx = new Map(); let i = -1, suelto = false;
    campo.childNodes.forEach(n => {
      const bloque = n.nodeType === 1 && (LADO_BLOQUE.test(n.tagName) || n.hasAttribute('data-f'));
      if (bloque) { suelto = false; idx.set(n, ++i); return; }
      if (n.nodeType === 3 && !n.nodeValue.replace(/[\s\u200B]/g, '') && !suelto) return;
      if (!suelto) { suelto = true; i++; }
      idx.set(n, i);
    });
    const bs = C.conversor.bloques(nt.html || '');
    if (bs.length !== i + 1) return null;
    const arriba = (n, off) => { if (n === campo) return campo.childNodes[Math.min(off, campo.childNodes.length - 1)]; while (n && n.parentNode !== campo) n = n.parentNode; return n; };
    const k = (n, atras) => { for (let x = n; x; x = atras ? x.previousSibling : x.nextSibling) if (idx.has(x)) return idx.get(x); return null; };
    const a = arriba(r.startContainer, r.startOffset), b = arriba(r.endContainer, r.endOffset);
    let ia = k(a); if (ia === null) ia = k(a, true);
    let ib = k(b, true); if (ib === null) ib = ia;
    if (ia === null) return null;
    if (b && ib > ia && idx.has(b)) { const x = document.createRange(); x.setStart(b, 0); x.setEnd(r.endContainer, r.endOffset); if (!x.toString().trim()) ib--; }
    if (ib < ia) ib = ia;
    const t = C.conversor.textoPlano(bs[ia].html);
    return Object.assign({ bloques: [ia + 1, ib + 1] }, t && C.enlaces ? { huella: C.enlaces.huella(t) } : {});
  }
  const hayCita = r => !!(r && !r.collapsed && campo.contains(r.commonAncestorContainer) && r.toString().replace(/[\s\u200B]/g, ''));
  function puedeCitar(r0) { return !!(api && api.citar && hayCita(r0 || rango())); }
  function citar(r0) {
    const r = r0 && campo.contains(r0.startContainer) ? r0 : rango();
    if (!abierta()) return false;
    if (!hayCita(r)) { if (api.avisar) api.avisar('Elige el texto que quieres citar'); return false; }
    const texto = r.toString().replace(/\u200B/g, '').replace(/\u00A0/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
    if (api.guardar) api.guardar();                            // lo último escrito, a la nota: el tramo se cuenta sobre ella
    const id = api.id(), t = tramoLado(r);
    return api.citar(Object.assign({ tipo: 'nota', id }, t || {}), texto);
  }

  /* ====================================================================
     montar (una vez, al crear la ventana: gestor.js, `capaNota`)
     ==================================================================== */
  function montar(c, a) {
    if (capa) return;
    capa = c; api = a; campo = a.campo; hoja = capa.querySelector('.gd-modal-hoja');
    const p = prefs();
    zoom = limitar(p.zoomTexto); legible = p.lineaLegible !== false;
    capa.querySelector('.gd-modal').appendChild(pie());
    capa.classList.toggle('typewriter', tw());
    aplicarZoom(); medioHoja();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => medioHoja()).observe(hoja);
    /* «/» */
    campo.addEventListener('input', e => { alEscribir(e); huecosLuego(); if (!abierto && (e.inputType || '').length) centrarLuego(); });
    document.addEventListener('selectionchange', () => { if (abierto) requestAnimationFrame(refrescar); });
    document.addEventListener('mousedown', e => { if (abierto && !(e.target.closest && e.target.closest('.vt-slash'))) cerrar(true); }, true);
    hoja.addEventListener('scroll', () => { if (abierto) colocarMenu(); }, { passive: true });
    /* pegar dentro de un recuadro entra como texto (como en el editor) */
    campo.addEventListener('paste', e => {
      if (plano()) return;
      const r = rango(); if (!r || !recuadroDe(r.startContainer)) return;
      const t = ((e.clipboardData && e.clipboardData.getData('text/plain')) || '').replace(/\r\n?/g, '\n');
      e.preventDefault(); e.stopImmediatePropagation();
      if (t) cmd('insertText', t);
    }, true);
    /* typewriter: el ratón (al soltar) y las teclas que mueven el cursor */
    campo.addEventListener('mouseup', () => setTimeout(() => { const r = rango(); if (r && r.collapsed) centrarLuego(); }, 0));
    campo.addEventListener('keyup', e => { if (/^(Arrow|Page|Home|End)/.test(e.key) && !abierto) centrarLuego(); });
    /* Tab fuera de una lista (las listas las anida MdVivo): se queda en el campo; si no, el foco saltaba al botón «Typewriter» del pie
       y el Enter siguiente lo apagaba */
    campo.addEventListener('keydown', e => { if (e.key === 'Tab' && !e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.altKey) e.preventDefault(); });
    /* las teclas, antes que nadie (el menú, el zoom y citar): en `window` y en captura */
    window.addEventListener('keydown', e => {
      if (!abierta()) return;
      const parar = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (abierto) {
        if (e.isComposing) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { parar(); indice = (indice + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; pintarMenu(consulta() || ''); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { parar(); elegir(indice); return; }
        if (e.key === 'Escape') { parar(); cerrar(true); return; }
      }
      const mod = MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      if (!mod || e.altKey) return;
      if (!e.shiftKey || e.key === '+') {
        if (e.key === '+' || e.key === '=') { parar(); pasoZoom(1); return; }
        if (e.key === '-' || e.key === '_') { parar(); pasoZoom(-1); return; }
        if (e.key === '0' && !e.shiftKey) { parar(); pasoZoom(0); return; }
      }
      if (e.shiftKey && (e.code === 'KeyA' || e.key.toLowerCase() === 'a')) {
        const r = rango();
        if (r && campo.contains(r.commonAncestorContainer)) { parar(); citar(r); }
      }
    }, true);
    window.addEventListener('wheel', alRueda, { capture: true, passive: false });
    window.addEventListener('resize', () => { if (abierto) colocarMenu(); });
  }
  /* la ventana se abrió con otra nota (gestor.js, `mostrarLado`): el menú, cerrado; la cola, a media hoja; los huecos */
  function alAbrir() { if (abierto) cerrar(false); medioHoja(); pintarHuecos(); }
  function alCerrar() { if (abierto) cerrar(false); if (hayHighlight && CSS.highlights.has('rc-hueco')) CSS.highlights.delete('rc-hueco'); }

  C.ventana = {
    montar, alAbrir, alCerrar, citar, puedeCitar, pintarVersion,
    zoom: () => zoom, fijarZoom, pasoZoom, legible: () => legible, longitud, typewriter: () => tw(), alternarTypewriter, centrar,
    menuAbierto: () => abierto, ORDENES
  };
})(window.Claquedraw = window.Claquedraw || {});
