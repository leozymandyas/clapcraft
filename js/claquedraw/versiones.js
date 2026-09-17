/* Claquedraw · versiones de un documento
   Leo, 16-09-2026: «que no se exporte a guiones los guiones exportados, que ya no exista esa opción; en su lugar
   implementa algo así para tener diferentes guiones para un mismo esquema desde aquí, al guardar versión que se abra
   un modal que me pida el nombre».

   Un esquema tiene **un documento** y dentro suyo sus versiones (documentos.js: `versionesDe`, `guardarVersion`,
   `cargarVersion`…). Aquí van el menú de la barra inferior del editor (la lista, «Guardar versión…» y «Comparar con la
   actual…») y la comparación, que enfrenta el texto de una versión con el de ahora, párrafo a párrafo.

   `comparar` y `bloques` no tocan el DOM: se cargan en Node para las pruebas (test/versiones.test.js). */
(function (raiz) {
  const C = raiz.Claquedraw = raiz.Claquedraw || {};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- comparación (sin DOM) ---------- */
  /* El texto de cada bloque del documento (un párrafo, un encabezado, una fila…), sin etiquetas ni vacíos. */
  function bloques(html) {
    return String(html || '')
      .replace(/<(br|hr)\s*\/?>/gi, '\n')
      .split(/<\/(?:p|h[1-6]|li|blockquote|div|pre|tr|table)>/i)
      .map(t => t.replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&#160;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }
  /* Enfrenta dos documentos por bloques (subsecuencia común más larga) y devuelve las filas a pintar:
     `igual` (está en los dos), `menos` (solo en el primero) y `mas` (solo en el segundo). */
  function comparar(htmlA, htmlB) {
    const a = bloques(htmlA), b = bloques(htmlB);
    const n = a.length, m = b.length;
    const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const filas = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { filas.push({ tipo: 'igual', texto: a[i] }); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) { filas.push({ tipo: 'menos', texto: a[i] }); i++; }
      else { filas.push({ tipo: 'mas', texto: b[j] }); j++; }
    }
    while (i < n) filas.push({ tipo: 'menos', texto: a[i++] });
    while (j < m) filas.push({ tipo: 'mas', texto: b[j++] });
    return filas;
  }
  const resumen = filas => ({
    igual: filas.filter(f => f.tipo === 'igual').length,
    mas: filas.filter(f => f.tipo === 'mas').length,
    menos: filas.filter(f => f.tipo === 'menos').length
  });

  if (typeof module !== 'undefined' && module.exports) { C.versiones = { bloques, comparar, resumen }; module.exports = C; return; }

  /* ---------- la fecha, como en el diseño: «hoy 18:40», «ayer 09:12», «12 sep 17:05» ---------- */
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const dosCifras = n => String(n).padStart(2, '0');
  function cuando(ts) {
    if (!ts) return '';
    const f = new Date(ts), hoy = new Date(), ayer = new Date(hoy.getTime() - 864e5);
    const mismo = (a, b) => a.toDateString() === b.toDateString();
    const hora = dosCifras(f.getHours()) + ':' + dosCifras(f.getMinutes());
    if (mismo(f, hoy)) return 'hoy ' + hora;
    if (mismo(f, ayer)) return 'ayer ' + hora;
    return f.getDate() + ' ' + MES[f.getMonth()] + ' ' + hora;
  }
  const palabras = html => (C.guion ? C.guion.palabras(html) : 0);
  const numero = n => (C.guion ? C.guion.numero(n) : String(n));

  const ICO = {
    reloj: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.7 8a5.3 5.3 0 1 0 1.6-3.8"/><path d="M2.4 3.1v2.6h2.6"/><path d="M8 5.4V8l1.9 1.1"/></svg>',
    mas: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 3.4v9.2M3.4 8h9.2"/></svg>',
    comparar: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2.4" y="3" width="11.2" height="10" rx="1.6"/><path d="M8 3v10"/></svg>'
  };

  /* ---------- el menú de la barra inferior ---------- */
  /* `datos`: { titulo, versiones: [{ id, nombre, guardada, html }], actual: id | null, html }.
     `ganchos`: { cargar(id), guardar(), comparar(id), renombrar(id), eliminar(id) }. */
  function menu(trigger, datos, ganchos) {
    const caja = document.createElement('div');
    caja.className = 'vs-menu';
    const rot = document.createElement('div');
    rot.className = 'vs-rotulo'; rot.textContent = 'Versiones de ' + (datos.titulo || 'este documento');
    caja.appendChild(rot);
    if (!datos.versiones.length) {
      const vacio = document.createElement('p');
      vacio.className = 'vs-vacio';
      vacio.textContent = 'Aún no has guardado ninguna versión de este documento.';
      caja.appendChild(vacio);
    }
    datos.versiones.slice().reverse().forEach(v => {
      const f = document.createElement('div');
      f.className = 'vs-fila' + (v.id === datos.actual ? ' actual' : '');
      f.innerHTML = `<span class="vs-ic">${ICO.reloj}</span>
        <span class="vs-txt"><b class="vs-nom"></b><span class="vs-meta">${esc(cuando(v.guardada))} · ${esc(numero(palabras(v.html)))} palabras</span></span>
        ${v.id === datos.actual ? '<span class="vs-actual">Actual</span>' : ''}
        <span class="vs-acc"><button type="button" class="vs-mini" data-vs-comparar="${esc(v.id)}" title="Comparar con lo de ahora">${ICO.comparar}</button>
        <button type="button" class="vs-mini peligro" data-vs-borrar="${esc(v.id)}" title="Eliminar la versión">×</button></span>`;
      f.querySelector('.vs-nom').textContent = v.nombre;
      f.tabIndex = 0; f.setAttribute('role', 'button');
      f.title = 'Cargar «' + v.nombre + '» en el editor · doble clic para renombrarla';
      f.addEventListener('click', e => { if (e.target.closest('[data-vs-comparar], [data-vs-borrar]')) return; ganchos.cargar(v.id); });
      f.addEventListener('dblclick', e => { e.preventDefault(); e.stopPropagation(); ganchos.renombrar(v.id); });
      caja.appendChild(f);
    });
    caja.insertAdjacentHTML('beforeend', '<div class="vs-sep"></div>');
    const guardar = document.createElement('button');
    guardar.type = 'button'; guardar.className = 'vs-opcion';
    guardar.innerHTML = ICO.mas + '<span>Guardar versión…</span>';
    guardar.addEventListener('click', () => ganchos.guardar());
    caja.appendChild(guardar);
    const comparar2 = document.createElement('button');
    comparar2.type = 'button'; comparar2.className = 'vs-opcion';
    comparar2.disabled = !datos.versiones.length;
    comparar2.innerHTML = ICO.comparar + '<span>Comparar con la actual…</span>';
    comparar2.addEventListener('click', () => ganchos.comparar(null));
    caja.appendChild(comparar2);
    caja.addEventListener('click', e => {
      const c = e.target.closest('[data-vs-comparar]'); if (c) { ganchos.comparar(c.dataset.vsComparar); return; }
      const b = e.target.closest('[data-vs-borrar]'); if (b) ganchos.eliminar(b.dataset.vsBorrar);
    });
    C.gestor.pop(trigger, caja);
  }

  /* ---------- la comparación ---------- */
  let capa = null;
  function cerrar() { if (capa) { capa.remove(); capa = null; } }
  /* `a`: la versión (nombre y html); `b`: lo de ahora (nombre y html). */
  function abrirComparacion(a, b) {
    cerrar();
    const filas = comparar(a.html, b.html), r = resumen(filas);
    capa = document.createElement('div');
    capa.className = 'vs-capa';
    capa.innerHTML = `<div class="vs-caja" role="dialog" aria-label="Comparar versiones">
        <header class="vs-cab">
          <span class="vs-cab-tit">Comparar</span>
          <span class="vs-chip vs-chip--a">${esc(a.nombre)}</span><span class="vs-flecha">→</span><span class="vs-chip vs-chip--b">${esc(b.nombre)}</span>
          <span class="spacer"></span>
          <span class="vs-cuenta"><i class="vs-punto mas"></i>${r.mas} ${r.mas === 1 ? 'párrafo nuevo' : 'párrafos nuevos'}</span>
          <span class="vs-cuenta"><i class="vs-punto menos"></i>${r.menos} ${r.menos === 1 ? 'quitado' : 'quitados'}</span>
          <button type="button" class="btn" data-vs-cerrar>Cerrar</button>
        </header>
        <div class="vs-cuerpo"></div></div>`;
    const cuerpo = capa.querySelector('.vs-cuerpo');
    if (!filas.length) cuerpo.innerHTML = '<p class="vs-vacio">Los dos están vacíos.</p>';
    else if (!r.mas && !r.menos) cuerpo.innerHTML = '<p class="vs-vacio">No hay diferencias: el texto es el mismo.</p>';
    filas.forEach(f => {
      const p = document.createElement('p');
      p.className = 'vs-linea vs-' + f.tipo;
      p.textContent = f.texto;
      cuerpo.appendChild(p);
    });
    capa.addEventListener('click', e => { if (e.target === capa || e.target.closest('[data-vs-cerrar]')) cerrar(); });
    document.body.appendChild(capa);
    const alTeclado = e => { if (e.key === 'Escape' && capa) { e.preventDefault(); e.stopPropagation(); cerrar(); document.removeEventListener('keydown', alTeclado, true); } };
    document.addEventListener('keydown', alTeclado, true);
  }

  C.versiones = { bloques, comparar, resumen, cuando, menu, abrirComparacion, cerrarComparacion: cerrar };
})(typeof window !== 'undefined' ? window : globalThis);
