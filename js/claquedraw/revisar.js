/* Claquedraw · revisar
   La pantalla «Revisar guión» (Leo, 15-09-2026, docs/diseno/rediseno-11/Pantalla_Revisar_Guion): se abre desde la barra de
   guión y ocupa el lienzo del editor (la cabecera y la barra de guión se quedan). A la izquierda, las secciones en el orden
   de lectura del documento que se va a generar: se reordenan arrastrando (el esquema y la línea del tiempo no cambian), se
   marcan y se sacan o devuelven. A la derecha, la ficha del documento: nombre, secciones, palabras y páginas, qué no se
   copia, el destino (el segmento «Guiones» de la biblioteca del esquema) y «Generar documento». Abajo, el último guion
   generado y «Exportar» (lo que está dentro del guion, en su orden).

   No guarda nada: habla con app.js por las opciones de `iniciar` (`datos`, `accion`, `ordenar`, `generar`, `abrirGuion`,
   `exportar`) y comparte con el editor las secciones marcadas (C.texto.elegidas). */
(function (C) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, t) => `<svg width="${t || 14}" height="${t || 14}" aria-hidden="true"><use href="#ic-${n}"></use></svg>`;
  let o = {}, abierto = false, titulo = '', arrastre = null;

  const cont = () => o.cont;
  const elegidas = () => new Set(C.texto.elegidas());

  function fecha(t) {
    if (!t) return '';
    const d = new Date(t), hoy = new Date(), hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
    if (d.toDateString() === hoy.toDateString()) return 'hoy ' + hh;
    if (d.toDateString() === ayer.toDateString()) return 'ayer ' + hh;
    return d.toLocaleDateString('es', { day: 'numeric', month: 'short' }) + ' ' + hh;
  }
  function glifo(f) {
    const color = `var(--t-${f.punto.color || f.linea.color || 'azul'})`;
    const forma = f.forma === 'rombo' ? ' rombo' : f.forma ? ' caja' : '';
    return `<i class="rv-glifo${forma}" style="--c:${color}"></i>`;
  }

  function render() {
    const x = o.datos && o.datos(); if (!x || !cont()) return;
    const { d, eid, tm, conSaltos } = x;
    const e = C.guion.estado(d, eid, tm, conSaltos), marcadas = elegidas();
    const guiones = x.bibliotecaId ? d.guionesDe(x.bibliotecaId).filter(n => n.guion.eid === eid) : [];
    const ultimo = guiones.slice().sort((a, b) => (b.guion.generado || 0) - (a.guion.generado || 0))[0];
    if (!titulo) titulo = 'Guion v' + (guiones.length + 1);
    const filas = e.filas.map((f, i) => {
      const chip = f.fuera ? '<span class="rv-fuera">Fuera del guión</span>'
        : `<span class="rv-trama" style="--tc:var(--t-${esc(f.linea.color || 'azul')});--tf:var(--f-${esc(f.linea.color || 'azul')})">${esc(f.linea.nombre || '')}</span>`;
      return `<div class="rv-fila${f.fuera ? ' sin-guion' : ''}${marcadas.has(f.clave) ? ' elegida' : ''}" data-clave="${esc(f.clave)}">
          <span class="rv-asa" title="Arrastra para cambiar el orden">${ic('drag', 13)}</span>
          <button type="button" class="rv-casilla" data-rv="elegir" role="checkbox" aria-checked="${marcadas.has(f.clave)}" title="Seleccionar">${marcadas.has(f.clave) ? ic('check', 10) : ''}</button>
          <span class="rv-num">${i + 1}</span>${glifo(f)}<span class="rv-tit">${esc(f.titulo)}</span>${chip}
          <span class="rv-hueco"></span><span class="rv-palabras">${C.guion.numero(f.palabras)} ${f.palabras === 1 ? 'palabra' : 'palabras'}</span>
          ${f.fuera ? `<button type="button" class="btn btn-foco rv-accion" data-rv="devolver">${ic('check', 12)}Devolver al guión</button>`
                    : `<button type="button" class="btn rv-accion" data-rv="sacar">${ic('out', 12)}Sacar del guión</button>`}
        </div>`;
    }).join('') || '<p class="rv-vacio">Este esquema aún no tiene nodos: créalos en el esquema de pasos.</p>';
    const nFuera = e.fueraFilas.map(f => f.titulo);
    const lista = e.dentro.map((f, i) => `<li><span>${i + 1}</span>${esc(f.titulo)}</li>`).join('');
    cont().innerHTML = `
      <div class="rv-cuerpo">
        <section class="rv-col">
          <div class="rv-rot"><span>Orden del guión</span><i></i><span>Arrastra para reordenar</span></div>
          <div class="rv-lista">${filas}</div>
        </section>
        <div class="rv-lado">
          <div class="rv-ficha">
            <div class="rv-rot"><span>Documento a generar</span></div>
            <input type="text" class="rv-nombre" data-rv-nombre aria-label="Nombre del documento" maxlength="120">
            <div class="rv-chips"><span>${e.dentro.length} ${e.dentro.length === 1 ? 'sección' : 'secciones'}</span><span>${C.guion.numero(e.palabras)} palabras</span><span>≈ ${e.paginas} pág.</span></div>
            ${lista ? `<ol class="rv-orden">${lista}</ol>` : '<p class="rv-nada">No hay secciones dentro del guión.</p>'}
            ${nFuera.length ? `<p class="rv-no">${esc(C.guion.enLista(nFuera))} no se ${nFuera.length === 1 ? 'copia' : 'copian'}</p>` : ''}
            <div class="rv-rot rv-rot-destino"><span>Destino</span></div>
            ${x.bibliotecaId ? `<div class="rv-destino"><span class="gd-chip gd-chip--sub">Biblioteca</span><span class="rv-destino-nom"></span></div>`
                             : '<p class="rv-nada">Este esquema no tiene biblioteca enlazada: enlázalo con una para guardar sus guiones.</p>'}
            <button type="button" class="btn primario rv-generar" data-rv="generar"${x.bibliotecaId && e.dentro.length ? '' : ' disabled'}>${ic('script', 14)}Generar documento</button>
          </div>
          <p class="rv-aviso">El orden de esta lista solo afecta al documento generado. El esquema y la línea del tiempo no se tocan.</p>
        </div>
      </div>
      <footer class="rv-pie">
        <span class="rv-pie-rot">Último guión generado</span>
        ${ultimo ? `<button type="button" class="rv-ultimo" data-rv="abrir" data-id="${esc(ultimo.id)}"><span></span> · ${esc(fecha(ultimo.guion.generado))}</button>` : '<span class="rv-ultimo-nada">Aún ninguno</span>'}
        <span class="spacer"></span>
        <button type="button" class="btn" data-rv="exportar"${e.dentro.length ? '' : ' disabled'}>${ic('export', 14)}Exportar</button>
      </footer>`;
    const inp = cont().querySelector('[data-rv-nombre]'); inp.value = titulo;
    const dn = cont().querySelector('.rv-destino-nom'); if (dn) dn.textContent = (x.bibliotecaNombre || '') + ' › Guiones';
    const ul = cont().querySelector('.rv-ultimo span'); if (ul) ul.textContent = ultimo.titulo;
  }

  /* ---------- abrir y cerrar ---------- */
  function abrir() {
    if (!o.seccion) return;
    abierto = true; titulo = '';
    o.seccion.classList.add('revisando');
    cont().hidden = false;
    render();
  }
  function cerrar() {
    if (!abierto) return;
    abierto = false;
    o.seccion.classList.remove('revisando');
    cont().hidden = true; cont().innerHTML = '';
    if (o.alCerrar) o.alCerrar();
  }

  /* ---------- arrastrar filas: manija o fila entera, marca de inserción de 2 px ---------- */
  function empezar(e, fila) {
    const lista = cont().querySelector('.rv-lista');
    arrastre = { fila, lista, x0: e.clientX, y0: e.clientY, activo: false, destino: null, marca: null, id: e.pointerId };
  }
  function mover(e) {
    const a = arrastre; if (!a) return;
    if (!a.activo) {
      if (Math.abs(e.clientY - a.y0) < 4 && Math.abs(e.clientX - a.x0) < 4) return;
      a.activo = true; a.fila.classList.add('levantada'); document.body.classList.add('rv-arrastrando');
      a.marca = document.createElement('div'); a.marca.className = 'rv-marca'; a.lista.appendChild(a.marca);
    }
    const filas = [...a.lista.querySelectorAll('.rv-fila')];
    let antes = null;
    for (const f of filas) { const r = f.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { antes = f; break; } }
    a.destino = antes;
    const ref = antes || filas[filas.length - 1], rr = ref.getBoundingClientRect(), rl = a.lista.getBoundingClientRect();
    a.marca.style.top = ((antes ? rr.top - 5 : rr.bottom + 3) - rl.top + a.lista.scrollTop) + 'px';
  }
  function soltar() {
    const a = arrastre; arrastre = null; if (!a) return;
    document.body.classList.remove('rv-arrastrando');
    if (!a.activo) return;
    a.fila.classList.remove('levantada'); if (a.marca) a.marca.remove();
    const claves = [...a.lista.querySelectorAll('.rv-fila')].map(f => f.dataset.clave), k = a.fila.dataset.clave;
    const resto = claves.filter(x => x !== k);
    if (a.destino === a.fila) { render(); return; }                       // soltada donde estaba
    const i = a.destino ? resto.indexOf(a.destino.dataset.clave) : resto.length;
    resto.splice(i < 0 ? resto.length : i, 0, k);
    if (resto.join('\n') !== claves.join('\n') && o.ordenar) o.ordenar(resto);
    render();
  }

  function iniciar(opciones) {
    o = opciones || {};
    const c = cont(); if (!c) return;
    c.addEventListener('click', e => {
      const b = e.target.closest('[data-rv]'); if (!b || b.disabled) return;
      if (b.dataset.rv === 'exportar') e.stopPropagation();          // el clic no llega al documento (cerraría el menú recién abierto)
      const fila = b.closest('.rv-fila'), k = fila && fila.dataset.clave;
      switch (b.dataset.rv) {
        case 'elegir': C.texto.alternarElegida(k); break;
        case 'sacar': case 'devolver': if (o.accion) o.accion(b.dataset.rv, [k]); break;
        case 'generar': if (o.generar) o.generar((c.querySelector('[data-rv-nombre]').value || '').trim() || titulo); break;
        case 'abrir': if (o.abrirGuion) o.abrirGuion(b.dataset.id); break;
        case 'exportar': if (o.exportar) o.exportar(b); break;
      }
    });
    c.addEventListener('input', e => { if (e.target.matches('[data-rv-nombre]')) titulo = e.target.value; });
    c.addEventListener('keydown', e => {
      if (e.target.matches('[data-rv-nombre]') && e.key === 'Enter') { e.preventDefault(); const g = c.querySelector('[data-rv="generar"]'); if (g && !g.disabled) g.click(); }
    });
    c.addEventListener('pointerdown', e => {
      const fila = e.target.closest('.rv-fila'); if (!fila || e.button !== 0 || e.target.closest('button, input')) return;
      e.preventDefault(); empezar(e, fila);
    });
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', () => { if (arrastre) { arrastre.activo = false; if (arrastre.marca) arrastre.marca.remove(); arrastre.fila.classList.remove('levantada'); arrastre = null; document.body.classList.remove('rv-arrastrando'); } });
    if (o.cab) o.cab.addEventListener('click', e => { if (e.target.closest('[data-revisar-volver]')) cerrar(); });
    document.addEventListener('keydown', e => {
      if (!abierto || e.key !== 'Escape' || e.defaultPrevented) return;
      if (e.target.closest && e.target.closest('input, textarea, dialog, .gd-pop')) return;
      cerrar();
    });
  }

  C.revisar = { iniciar, abrir, cerrar, render, abierto: () => abierto };
})(window.Claquedraw);
