/* Las imágenes del documento: elegirlas, cambiarles el tamaño, verlas en grande y marcarlas o recortarlas (1.1.57, como en
   ClapBook). Leo, 27-09-2026: «lo de las imágenes como lo manejamos en ClapBook que permite poner, redimensionar e incluso editar».

   Siguen siendo un `<img src="data:…">` dentro del documento (lo que ya había abre igual); lo nuevo va en atributos:
   · `width="N"`: el ancho en píxeles de la hoja (sin el zoom de la vista; la altura sigue a la proporción). Sin él, la de la imagen
     (y nunca más ancha que la hoja: `max-width: 100%`). El PDF lo respeta tal cual; en Word, js/claquedraw/exportar.js.
   · `alt`: la descripción (al pegar o soltar, el nombre del archivo); se cambia con «Descripción…».
   · `data-original`, `data-anotaciones`, `data-recorte`: tras marcarla o recortarla (js/anotar.js), la imagen que se ve (`src`) es
     la marcada y la de antes va en `data-original`, con las formas (JSON, en las coordenadas de la original) y el recorte
     (JSON `{ x, y, w, h }`); así se puede volver a editar o «Volver al original». Sin marcas ni recorte, no están.
   Pesa: la original se guarda además de la marcada (las dos ya pasaron por `imagenLigera`: ≤ 1600 px, WebP).

   Un clic elige la imagen (queda seleccionada como texto: Retroceso o Supr la borran, lo que se teclee va detrás, Esc o las
   flechas la sueltan) y encima sale su marco con asas en las esquinas y en los lados: arrastrar cambia el ancho (la proporción,
   fija; centrada, crece por los dos lados) y el doble clic en un asa devuelve el suyo. La barra del marco: ver en grande, editar,
   tamaño original, descripción y, si está marcada, volver a la original. El doble clic en la imagen abre el visor. Nada de eso
   toca el documento hasta que se suelta o se guarda: entonces la imagen se sustituye por otra con un solo `insertHTML` sobre su
   selección (entra en Deshacer; el marco, que no es del documento, no se guarda). Dentro del marco de ClapCraft, el visor es el
   de la app (window.parent.Anotar): tapa la ventana entera. */
(function (Ed) {
  'use strict';
  const editor = Ed.editor;
  if (!editor) return;
  const $ = (s, r = document) => r.querySelector(s);
  const anotar = () => { try { if (window.parent !== window && window.parent.Anotar && window.parent.document.body) return window.parent.Anotar; } catch (_) { /* otro origen */ } return window.Anotar; };
  const A = window.Anotar;
  const MIN = 40;

  /* ---------- el marco de la elegida (fuera del documento) ---------- */
  const I = d => `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONOS = {
    ver: I('<path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9"/>'),
    editar: I('<path d="M10.8 2.8l2.4 2.4-7.4 7.4-3 .6.6-3z"/><path d="M9.4 4.2l2.4 2.4"/>'),
    natural: I('<rect x="2.5" y="3.5" width="11" height="9" rx="1.4"/><path d="M5.5 10V6l1.5 1.5M9 10V6"/>'),
    desc: I('<path d="M3 4h10M3 8h10M3 12h6"/>'),
    original: I('<path d="M2.8 8a5.2 5.2 0 1 0 1.6-3.8"/><path d="M2.6 2.6v2.8h2.8"/>')
  };
  const ASAS = ['nw', 'ne', 'se', 'sw', 'e', 'w'];
  let caja = null, elegida = null, arr = null, bucle = 0;
  function crearCaja() {
    caja = document.createElement('div');
    caja.className = 'img-sel'; caja.hidden = true; caja.setAttribute('contenteditable', 'false');
    caja.innerHTML = '<div class="img-sel-marco"></div>'
      + ASAS.map(k => `<span class="img-asa img-asa--${k}" data-asa="${k}" title="Arrastra para cambiar el tamaño · doble clic: el de la imagen"></span>`).join('')
      + `<div class="img-barra" role="toolbar" aria-label="Imagen">
          <button type="button" data-img="ver" title="Ver en grande (doble clic en la imagen)" aria-label="Ver en grande">${ICONOS.ver}</button>
          <button type="button" data-img="editar" title="Marcar y recortar" aria-label="Editar">${ICONOS.editar}<span>Editar</span></button>
          <button type="button" data-img="natural" title="Su tamaño (doble clic en un asa)" aria-label="Tamaño original">${ICONOS.natural}</button>
          <button type="button" data-img="desc" title="Descripción de la imagen" aria-label="Descripción">${ICONOS.desc}</button>
          <button type="button" data-img="original" title="Quitar las marcas y el recorte" aria-label="Volver al original">${ICONOS.original}</button>
          <span class="img-medida"></span></div>`;
    document.body.appendChild(caja);
    /* nada del marco se lleva el foco ni la selección del editor */
    caja.addEventListener('mousedown', e => e.preventDefault());
    caja.addEventListener('click', e => {
      const b = e.target.closest('[data-img]'); if (!b || !elegida) return;
      const img = elegida, k = b.dataset.img;
      if (k === 'ver') abrir(img, false);
      else if (k === 'editar') abrir(img, true);
      else if (k === 'natural') ponerAncho(img, null);
      else if (k === 'desc') describir(img);
      else if (k === 'original') volverAlOriginal(img);
    });
    caja.addEventListener('pointerdown', e => { const a = e.target.closest('[data-asa]'); if (a) empezarArrastre(e, a.dataset.asa); });
    caja.addEventListener('dblclick', e => { if (e.target.closest('[data-asa]') && elegida) { e.preventDefault(); ponerAncho(elegida, null); } });
  }
  const atributos = img => { const at = {}; Array.from(img.attributes).forEach(a => { at[a.name] = a.value; }); return at; };
  /* el ancho que ocupa en la hoja (px sin zoom) y lo que ocupa en pantalla por cada uno */
  const anchoCss = img => parseFloat(getComputedStyle(img).width) || img.offsetWidth || 1;
  function colocar() {
    if (!caja || !elegida) return;
    if (!elegida.isConnected) { soltar(); return; }
    const r = elegida.getBoundingClientRect();
    if (!r.width) { caja.hidden = true; return; }
    caja.hidden = false;
    Object.assign(caja.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    caja.classList.toggle('arriba', r.top < 46);                      // sin sitio encima: la barra, dentro de la imagen
    const d = A.leer(atributos(elegida));
    $('[data-img="natural"]', caja).disabled = !d.ancho;
    $('[data-img="original"]', caja).hidden = !d.original;
    $('.img-medida', caja).textContent = Math.round(arr ? arr.w : anchoCss(elegida)) + ' px';
  }
  function vigilar() { cancelAnimationFrame(bucle); const paso = () => { if (!elegida) return; colocar(); bucle = requestAnimationFrame(paso); }; bucle = requestAnimationFrame(paso); }

  /* ---------- elegir y soltar ---------- */
  const esImagen = n => n && n.nodeName === 'IMG' && editor.contains(n) && !n.closest('.db, .portada, [contenteditable="false"]');
  function rodear(img) { const r = document.createRange(); r.setStartBefore(img); r.setEndAfter(img); return r; }
  function elegir(img) {
    if (!esImagen(img)) return;
    if (!caja) crearCaja();
    if (!editor.contains(document.activeElement)) editor.focus({ preventScroll: true });
    Ed.restoreSelection(rodear(img));
    elegida = img; document.documentElement.classList.add('img-elegida');
    colocar(); vigilar();
  }
  function soltar() {
    elegida = null; cancelAnimationFrame(bucle);
    document.documentElement.classList.remove('img-elegida');
    if (caja) caja.hidden = true;
  }
  /* ¿la selección sigue siendo solo la imagen elegida? */
  function sigueElegida() {
    const r = Ed.getRange(); if (!r || r.collapsed || !elegida || !elegida.isConnected || !r.intersectsNode(elegida)) return false;
    if (r.toString().replace(/[\u200B\s]/g, '')) return false;
    return r.cloneContents().querySelectorAll('img').length === 1;
  }
  /* el cursor delante o detrás de la imagen, sin ella elegida */
  function cursorJunto(img, detras) { const r = rodear(img); r.collapse(!detras); Ed.restoreSelection(r); soltar(); }

  editor.addEventListener('mousedown', e => {
    if (e.button !== 0 || !esImagen(e.target)) return;
    e.preventDefault();                                               // ni el cursor al lado ni arrastrar la imagen
    elegir(e.target);
  });
  editor.addEventListener('dblclick', e => { if (esImagen(e.target)) { e.preventDefault(); abrir(e.target, false); } });
  document.addEventListener('selectionchange', () => { if (elegida && !arr && !sigueElegida()) soltar(); });
  /* con una elegida: Esc y las flechas la sueltan; lo que se teclee (o Enter) va detrás de ella, no en su lugar. En captura:
     antes que el asa de bloques (Esc elegiría el bloque) y que los atajos del editor. */
  document.addEventListener('keydown', e => {
    if (!elegida || arr || !sigueElegida()) return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cursorJunto(elegida, true); return; }
    if (/^Arrow(Left|Up)$/.test(e.key) && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); cursorJunto(elegida, false); return; }
    if (/^Arrow(Right|Down)$/.test(e.key) && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); cursorJunto(elegida, true); return; }
    if (!mod && !e.altKey && (e.key === 'Enter' || e.key.length === 1)) cursorJunto(elegida, true);   // y la tecla sigue su camino
  }, true);
  window.addEventListener('resize', () => colocar());
  window.addEventListener('blur', () => { if (elegida && caja) caja.hidden = true; });
  window.addEventListener('focus', () => { if (elegida) colocar(); });

  /* ---------- sustituir la imagen (un paso de Deshacer) ---------- */
  /* `cambios`: atributos nuevos (null lo quita). Se hace con un insertHTML sobre la selección de la imagen: cambiar un atributo a
     mano no entra en el historial del editor. Devuelve la imagen nueva (o la misma si no cambió nada). */
  function cambiarImagen(img, cambios) {
    if (!img || !img.isConnected) return null;
    const nueva = img.cloneNode(false);
    Object.keys(cambios).forEach(k => { if (cambios[k] == null) nueva.removeAttribute(k); else nueva.setAttribute(k, String(cambios[k])); });
    if (nueva.style && !nueva.getAttribute('style')) nueva.removeAttribute('style');
    if (nueva.outerHTML === img.outerHTML) return img;
    const src = nueva.getAttribute('src'), ancho = nueva.getAttribute('width');
    const antes = img.previousSibling, padre = img.parentNode;
    editor.focus({ preventScroll: true });
    Ed.restoreSelection(rodear(img));
    Ed.cmd('insertHTML', nueva.outerHTML);
    /* la nueva: justo detrás del cursor, o la que tenga su src y su ancho donde estaba la de antes */
    const r = Ed.getRange();
    let hecha = null;
    if (r && r.collapsed) { const c = r.startContainer, n = c.nodeType === 1 ? c.childNodes[r.startOffset - 1] : (r.startOffset === 0 ? c.previousSibling : null); if (n && n.nodeName === 'IMG') hecha = n; }
    if (!hecha && antes && antes.isConnected && antes.nextSibling && antes.nextSibling.nodeName === 'IMG') hecha = antes.nextSibling;
    if (!hecha) hecha = Array.from((padre && padre.isConnected ? padre : editor).querySelectorAll('img')).find(x => x.getAttribute('src') === src && x.getAttribute('width') === ancho) || null;
    Ed.afterChange();
    if (hecha) elegir(hecha); else soltar();
    return hecha;
  }
  const ponerAncho = (img, w) => cambiarImagen(img, { width: w ? Math.round(w) : null });

  /* ---------- cambiar el tamaño arrastrando un asa ---------- */
  function empezarArrastre(e, asa) {
    if (e.button !== 0 || !elegida) return;
    e.preventDefault(); e.stopPropagation();
    const img = elegida, w0 = anchoCss(img), r0 = img.getBoundingClientRect(), k = r0.width / w0 || 1;
    const bloque = img.parentElement, cs = getComputedStyle(bloque);
    const max = Math.max(MIN, bloque.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0));
    arr = { img, asa, x0: e.clientX, w0, k, max, lado: asa.includes('w') ? -1 : 1, centrada: cs.textAlign === 'center', w: w0,
      estilo: img.getAttribute('style'), id: e.pointerId };
    try { e.target.setPointerCapture(e.pointerId); } catch (_) { /* un puntero de pruebas */ }
    caja.classList.add('midiendo'); document.documentElement.classList.add('img-midiendo');
    const mover = ev => {
      if (!arr) return;
      arr.w = A.anchoArrastre({ w0: arr.w0, dx: (ev.clientX - arr.x0) / arr.k, lado: arr.lado, centrada: arr.centrada, min: MIN, max: arr.max });
      img.style.width = arr.w + 'px'; img.style.height = 'auto';       // solo mientras se arrastra: se deshace al soltar
      colocar();
    };
    const fin = ev => {
      window.removeEventListener('pointermove', mover, true); window.removeEventListener('pointerup', fin, true); window.removeEventListener('pointercancel', fin, true);
      const a = arr; arr = null;
      caja.classList.remove('midiendo'); document.documentElement.classList.remove('img-midiendo');
      if (!a) return;
      if (a.estilo == null) img.removeAttribute('style'); else img.setAttribute('style', a.estilo);   // como estaba: lo que entra en Deshacer es el cambio
      if (ev.type === 'pointerup' && Math.abs(a.w - a.w0) >= 1) ponerAncho(img, a.w); else colocar();
    };
    window.addEventListener('pointermove', mover, true); window.addEventListener('pointerup', fin, true); window.addEventListener('pointercancel', fin, true);
  }

  /* ---------- la descripción ---------- */
  async function describir(img) {
    const v = await Ed.dialog({ title: 'Descripción de la imagen', okLabel: 'Guardar',
      fields: [{ name: 'alt', label: 'Qué se ve (se lee en el visor y al exportar a Markdown)', type: 'text', value: img.getAttribute('alt') || '', placeholder: 'Sin descripción' }] });
    if (!v || !img.isConnected) { if (img.isConnected) elegir(img); return; }
    const t = String(v.alt || '').trim();
    if (!cambiarImagen(img, { alt: t || null })) Ed.focusEditor();
  }

  /* ---------- ver en grande, marcar y recortar (js/anotar.js) ---------- */
  /* la imagen marcada, tan ligera como una pegada (la regla de `imagenLigera` de editor.js) */
  function blobDe(url) {
    const i = url.indexOf(','), cab = url.slice(0, i), tipo = (/^data:([^;,]+)/.exec(cab) || [])[1] || 'image/png', datos = url.slice(i + 1);
    const bin = /;base64/i.test(cab) ? atob(datos) : decodeURIComponent(datos), u8 = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) u8[j] = bin.charCodeAt(j);
    return new Blob([u8], { type: tipo });
  }
  async function ligera(url) {
    try { return Ed.imagenLigera ? await Ed.imagenLigera(blobDe(url)) : url; } catch (_) { return url; }
  }
  function abrir(img, editar) {
    const An = anotar(); if (!An || !esImagen(img)) return;
    const d = A.leer(atributos(img)), src = d.original || d.src;
    if (!src) return;
    An.abrir({
      nombre: img.getAttribute('alt') || 'Imagen', src, vista: d.src, tipo: A.tipoDe(src), anotaciones: d.anotaciones, recorte: d.recorte, editar,
      avisar: t => { if (window.parent !== window && window.parent.Tramas && window.parent.Tramas.tablero && window.parent.Tramas.tablero.avisar) window.parent.Tramas.tablero.avisar(t); else console.warn(t); },
      alCerrar: () => { if (img.isConnected) elegir(img); else Ed.focusEditor(); },
      alGuardar: async r => {
        const datos = r && r.datos ? await ligera(r.datos) : null;
        cambiarImagen(img, A.atributosTrasEditar(d, Object.assign({}, r, { datos })));
      },
      alOriginal: d.original ? () => cambiarImagen(img, A.atributosTrasEditar(d, null)) : null
    });
  }
  function volverAlOriginal(img) {
    const d = A.leer(atributos(img)); if (!d.original) return;
    cambiarImagen(img, A.atributosTrasEditar(d, null));
  }

  /* ---------- poner: «/imagen» elige un archivo (pegar y soltar, en editor.js) ---------- */
  function elegirArchivo() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.hidden = true;
    inp.addEventListener('change', () => { Array.from(inp.files || []).forEach(f => Ed.insertarImagen && Ed.insertarImagen(f)); inp.remove(); });
    document.body.appendChild(inp);
    inp.click();
  }

  Ed.imagenes = { elegir, soltar, elegida: () => elegida, abrir, ponerAncho, cambiarImagen, describir, volverAlOriginal, elegirArchivo };
})(window.Ed);
