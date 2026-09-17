/* Tramas · tablero
   La capa de dibujo e interacción: convierte celdas en píxeles, reconstruye el DOM a partir del
   modelo y traduce gestos (clic, doble clic, clic secundario, arrastres) en operaciones del modelo.
   Toda regla de dominio vive en modelo.js; aquí solo se enseña el aviso que devuelve.

   Regla que cuesta descubrir: un clic seco no reconstruye el tablero. Si al hacer clic se
   reconstruyera el DOM, el segundo clic de un doble clic caería sobre otro elemento y el navegador
   no lo reconocería. Por eso seleccionar solo cambia clases (seleccionSuave). */
(function (T) {
  const { PALETA, FONDOS, ETIQUETA, FORMA, clamp, MIN_CELDAS, MAX_CELDAS } = T;

  const BASE = 20;                       // px de una celda a escala 1
  let GUTTER = 190;                      // ancho de la columna de tramas (px); ver T.tablero.gutter()
  /* Alto de carril y del eje: los fija la hoja de estilos (--fila, --eje) para que la piel de
     ClapCraft pueda cambiarlos sin desalinear los cables del SVG; si no están, 120 y 44. */
  const medida = (v, defecto) => { const n = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(v)); return n > 0 ? n : defecto; };
  let FILA_BASE = medida('--fila', 120);           // el alto de carril que pide la vista (T.tablero.alto())
  /* **Cada fila tiene su alto** (Leo, 16-09-2026: «si en una trama tengo notas, está bien que se haga más ancha la fila,
     pero si tengo más tramas se hacen igual de anchas aunque no existan notas»): crece la que no da para sus rótulos y
     sus notas, las demás se quedan en FILA_BASE. `GEO` lleva, por trama, dónde empieza, cuánto mide y dónde va su carril. */
  let GEO = new Map();                             // lineaId → { top, alto, centro } (top desde el final del eje)
  const geo = lineaId => GEO.get(lineaId) || { top: Math.max(0, filaDe(lineaId)) * FILA_BASE, alto: FILA_BASE, centro: FILA_BASE / 2 };
  const altoFilas = () => m.datos.lineas.reduce((t, l) => t + geo(l.id).alto, 0);
  const EJE = medida('--eje', 44);
  /* Los colores se pintan como variables CSS (css/tramas.css las define para el tema claro y el
     oscuro), así cambiar de tema no obliga a redibujar. Solo el globo necesita el valor real. */
  const tono = id => `var(--t-${PALETA.some(c => c.id === id) ? id : PALETA[0].id})`;
  const fondo = id => id && id !== 'ninguno' ? `var(--f-${id})` : 'transparent';
  const fondoActo = a => fondo(T.fondoEfectivo(a, m.datos.actos.indexOf(a)));   // el elegido o el automático por posición
  const colorSalto = t => t === 'rombo' ? 'var(--rombo-trazo)' : 'var(--escena-trazo)';
  const resolver = v => {                // 'var(--x)' → valor calculado (hex) en el tema actual
    const mm = /^var\((--[\w-]+)\)$/.exec(String(v).trim());
    return mm ? getComputedStyle(document.documentElement).getPropertyValue(mm[1]).trim() : v;
  };
  /* iconos de trazo del panel (rejilla de 16, como el sprite de ClapCraft, pero sin depender de él) */
  const svg = d => `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONO = { izq: svg('<path d="M9.6 4.2 5.8 8l3.8 3.8"/>'), der: svg('<path d="M6.4 4.2 10.2 8l-3.8 3.8"/>'),
    cerrar: svg('<path d="M4.4 4.4l7.2 7.2M11.6 4.4l-7.2 7.2"/>'), chev: svg('<path d="M4.2 6.4 8 10.2l3.8-3.8"/>'), borrar: svg('<path d="M3.2 4.8h9.6M6.4 4.8V3.2h3.2v1.6"/><path d="M4.8 4.8l.6 8.4h5.2l.6-8.4"/>') };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let m = null;                          // T.Modelo
  let sel = null;                        // { tipo: 'punto'|'linea'|'acto'|'salto'|'nota', id }
  let zoom = 1.7;
  let pres = null, ruta = null;          // cálculos derivados del último render
  /* Tablero «simple» (el de Personajes en ClapCraft): sin fuera de escena ni camino iluminado, sin saltos
     alternativos (rombos) y sin sentido en los saltos (ni flecha ni «Invertir el sentido») */
  let simple = false;
  const SIN_PRESENCIA = { fuera: () => false, tramoFuera: () => false, lineaEnFlujo: () => false };
  const historial = new T.Historial(80);
  let restaurando = false;
  const ganchos = { alCambiar: () => {}, alPanel: null };        // alPanel: el alto del panel de abajo, para recordarlo

  let $nombres;                          // capa con el nombre de cada salto sobre su trazo (Leo, 15-09-2026)
  let $axis, $rows, $cables, $canvas, $board, $panel, $menu, $tip, $aviso, $celda;

  /* ---------- geometría: celdas → píxeles (única capa que conoce píxeles) ---------- */
  const G = () => BASE * zoom;
  /* Delante de la primera columna queda un hueco de una celda (Leo, 16-09-2026: «deja un espacio, como punto 0, pero sin
     el 0, donde no se pone nada»): así la columna 1 se ve entera y no queda pegada a la columna de tramas. Todo lo que
     pasa de celdas a píxeles va por `px()`, y de píxeles a celdas, por `celdaEn()`. */
  const MARGEN = () => G();
  const px = cg => MARGEN() + cg * G();
  const celdaEn = x => (x - MARGEN()) / G();
  const totalW = () => px(m.totalCeldas());
  const anchoDe = a => a.celdas * G();
  const offsetDe = actoId => px(m.celdasAntes(actoId));
  const xDe = p => px(m.cg(p));
  const filaDe = lineaId => m.datos.lineas.findIndex(l => l.id === lineaId);
  const yFila = lineaId => { const g = geo(lineaId); return EJE + g.top + g.centro; };
  const yDe = p => yFila(p.lineaId);
  // borde izquierdo a partir del cual empieza la zona donde sí se puede soltar: el borde derecho de la
  // columna de tramas tal como se ve (si el CSS la contrae, la zona útil empieza antes)
  const zonaUtil = () => {
    const g = $axis && $axis.querySelector('.gutter');
    return g ? g.getBoundingClientRect().right : $board.getBoundingClientRect().left + GUTTER;
  };

  /* ---------- selección ---------- */
  const esSel = (tipo, id) => !!sel && sel.tipo === tipo && sel.id === id;
  function elegir(tipo, id) { sel = { tipo, id }; sinRuta = false; render(); }
  function limpiarSelDOM() {
    document.querySelectorAll('.pt.sel,.label.sel,.acto.sel,.nota.sel,.cadena.sel').forEach(x => x.classList.remove('sel'));
  }
  /* Selecciona sin reconstruir el tablero: solo cambia clases, el panel y el recorrido. */
  function seleccionSuave(tipo, id, el) {
    sel = { tipo, id }; sinRuta = false; limpiarSelDOM();
    if (el) el.classList.add('sel');
    panel(); pintarRuta();
  }
  /* Enseña el aviso de una operación y devuelve si salió bien. */
  function aplicar(r) { if (r && r.aviso) avisar(r.aviso); return !!(r && r.ok); }

  /* ====================================================================
     Render
     ==================================================================== */
  /* `sinRuta`: Esc apaga el camino iluminado del nodo elegido, pero lo deja elegido (Leo, 16-09-2026: «Esc solo debe ser
     para escapar de que se me muestre el recorrido, no para cerrar el panel»). Elegir otra cosa lo vuelve a encender. */
  let sinRuta = false;
  function calcularRuta() {
    ruta = (!simple && !sinRuta && sel && sel.tipo === 'punto') ? m.recorrido(sel.id, pres) : null;
  }
  const enRuta = (lineaId, ca, cb) => !!ruta && ruta.incluye(lineaId, ca, cb);

  function render() {
    pres = simple ? SIN_PRESENCIA : m.presencia();
    calcularRuta();
    document.body.classList.toggle('con-ruta', !!ruta);
    const g = G(), W = totalW(), d = m.datos;
    $canvas.style.width = (GUTTER + W + 46) + 'px';

    $axis.innerHTML = `<div class="gutter">Tramas</div>
      <div class="eje-cuerpo" style="width:${W + 46}px">
        <div class="acts">
          ${d.actos.map(a => `<div class="acto${esSel('acto', a.id) ? ' sel' : ''}" data-acto="${a.id}"
               style="left:${offsetDe(a.id)}px;width:${anchoDe(a)}px;background:${fondoActo(a)}">
              <input class="aname" readonly data-acto-nombre="${a.id}" title="Clic: seleccionar · doble clic: renombrar">
              ${d.actos.length > 1 ? `<button class="mini" data-acto-del="${a.id}" title="Eliminar ${esc(m.nombre('acto').toLowerCase())}">×</button>` : ''}
              <span class="handle" data-handle="${a.id}" title="Arrastra para cambiar el ancho"></span></div>`).join('')}
          <button class="add-acto" id="addActo" style="left:${W}px" title="Nuevo ${esc(m.nombre('acto').toLowerCase())}">+</button>
        </div>
        <div class="cols">${columnasHtml()}</div>
      </div>`;
    d.actos.forEach(a => { $axis.querySelector(`[data-acto-nombre="${a.id}"]`).value = a.nombre; });

    const rejilla = `repeating-linear-gradient(90deg,var(--cuadricula) 0 1px,transparent 1px ${g}px)`;
    const actoSel = sel && sel.tipo === 'acto' ? m.acto(sel.id) : null;

    $rows.innerHTML = '';
    const filas = [];
    d.lineas.forEach(l => {
      const row = document.createElement('div');
      row.className = 'row ' + l.tipo + (l.cortada ? ' cortada' : '');
      row.dataset.linea = l.id;
      row.innerHTML = `
        <div class="label${esSel('linea', l.id) ? ' sel' : ''}" style="--tc:${tono(l.color)}">
          <span class="chip ${l.tipo}" data-inicial="${esc((l.nombre || '?').trim().charAt(0).toUpperCase())}" style="background:${tono(l.color)};color:${tono(l.color)}"></span>
          <span class="lbox"><input class="lname" readonly data-linea-nombre="${l.id}" title="Clic: seleccionar · doble clic: renombrar">
            <span class="ltipo">${ETIQUETA[l.tipo]}</span></span>
          ${l.tipo === 'principal' ? '' : `<button class="mini" data-linea-del="${l.id}" title="Eliminar trama">×</button>`}
        </div>
        <div class="track" data-linea="${l.id}" style="width:${W}px;background-image:${rejilla}">
          ${d.actos.map(a => `<div class="banda"
             style="left:${offsetDe(a.id)}px;width:${anchoDe(a)}px;background:${fondoActo(a)}"></div>`).join('')}
          ${actoSel ? `<div class="banda sel" style="left:${offsetDe(actoSel.id)}px;width:${anchoDe(actoSel)}px"></div>` : ''}
          <div class="rail" style="background:${tono(l.color)};color:${tono(l.color)}"></div>
          ${d.actos.slice(1).map(a => `<div class="sep" style="left:${offsetDe(a.id)}px"></div>`).join('')}
        </div>`;
      row.querySelector('.lname').value = l.nombre;

      const track = row.querySelector('.track');
      const props = m.puntosDe(l.id);

      /* las notas de la trama: las de un tramo (entre dos nodos) y las de un nodo; caben varias y se apilan
         debajo del carril (Leo, 16-09-2026) */
      m.notasDeLinea(l.id).forEach(nt => {
        const a = m.punto(nt.deId), b = nt.aId && m.punto(nt.aId);
        const el = document.createElement('div');
        el.className = 'nota' + (b ? '' : ' de-nodo') + (esSel('nota', nt.id) ? ' sel' : '') + (nt.color ? ' con-color' : '');
        el.dataset.nota = nt.id;
        if (nt.color) { el.style.setProperty('--tc', tono(nt.color)); el.style.setProperty('--tf', `var(--f-${nt.color})`); }   // su tono: trazo y fondo pálido
        el.style.setProperty('--gl', tono(l.color));           // el color de su trama: la guía que la une a su nodo (Leo, 16-09-2026)
        const s = document.createElement('span'); s.textContent = nt.texto;
        el.appendChild(s); track.appendChild(el);
      });

      /* ya no hay huecos con el icono de nota bajo cada tramo (Leo, 16-09-2026): el enlace se elige y su menú contextual
         «Agregar nota» pone las que hagan falta */

      // cadena: el hilo de la historia de un nodo al siguiente
      for (let i = 0; i < props.length - 1; i++) {
        const a = props[i], b = props[i + 1], x1 = xDe(a), x2 = xDe(b);
        if (x2 - x1 < 3) continue;
        const ca = m.cg(a), cb = m.cg(b);
        const seg = document.createElement('div');
        seg.className = 'cadena' + (pres.tramoFuera(l.id, ca, cb) ? ' fuera' : '') + (enRuta(l.id, ca, cb) ? ' ruta' : '');
        seg.dataset.ca = ca; seg.dataset.cb = cb;
        seg.dataset.enlace = a.id;                             // se elige y tiene su menú (Leo, 16-09-2026)
        if (sel && sel.tipo === 'enlace' && sel.id === a.id) seg.classList.add('sel');
        seg.style.left = x1 + 'px'; seg.style.width = (x2 - x1) + 'px';
        const ce = tono(a.colorEnlace || l.color);              // su color propio, o el de la trama
        seg.style.background = ce; seg.style.color = ce;
        track.appendChild(seg);
      }

      props.forEach((p, i) => track.appendChild(nodo(p, l, i)));
      $rows.appendChild(row);
      filas.push(row);
    });
    /* el alto de carril que pide la vista, para todas las filas; la que no da para sus rótulos apilados y sus notas crece
       **solo ella y solo lo que haga falta**, y su carril deja de ir centrado (Leo, 16-09-2026) */
    document.documentElement.style.setProperty('--fila', FILA_BASE + 'px');
    document.documentElement.style.setProperty('--centro', FILA_BASE / 2 + 'px');
    GEO = new Map(); let top = 0;
    filas.forEach(row => {
      const r = colocarRotulos(row);
      const cabe = r.arriba + r.abajo + 12 <= FILA_BASE;
      const alto = cabe ? FILA_BASE : r.arriba + r.abajo + 12, centro = cabe ? FILA_BASE / 2 : r.arriba + 6;
      if (cabe) { row.style.removeProperty('--fila'); row.style.removeProperty('--centro'); }
      else { row.style.setProperty('--fila', alto + 'px'); row.style.setProperty('--centro', centro + 'px'); }
      GEO.set(row.dataset.linea, { top, alto, centro }); top += alto;
    });

    const add = document.createElement('div');
    add.className = 'row add-linea';
    add.innerHTML = `<div class="label"><button id="addLinea"><span class="plus">+</span> Nueva trama</button></div>`;
    $rows.appendChild(add);

    cables();
    panel();
    podarMulti();
    pintarColumnas();
    if (!restaurando && !arrastrando()) registrar();
  }

  function podarMulti() { [...multi].forEach(id => { if (!m.punto(id)) multi.delete(id); }); [...multiNotas].forEach(id => { if (!m.nota(id)) multiNotas.delete(id); }); pintarMulti(); }

  /* ---------- columnas: la tira de cabeceras del eje (Leo, 16-09-2026) ----------
     Una cabecera por celda global, con su número si la escala da para leerlo. Elegir columnas es cosa
     de la tira: el tablero solo las tiñe de arriba abajo (`.col-marca`, una por tramo seguido). */
  function columnasHtml() {
    const g = G(), n = m.totalCeldas(), num = g >= 22;
    let h = '';
    for (let c = 0; c < n; c++)                                 // la cabecera va centrada en la raya, no en el hueco (Leo, 16-09-2026)
      h += `<div class="col${cols.has(c) ? ' sel' : ''}" data-col="${c}" style="left:${px(c) - g / 2}px;width:${g}px" title="Columna ${c + 1}: la raya vertical donde caen los nodos · clic: elegirla · arrastra o Mayús: varias · clic derecho: insertar o eliminar">${num ? '<span>' + (c + 1) + '</span>' : ''}</div>`;
    return h;
  }
  /* Marca lo elegido: las cabeceras, la raya de cada columna sobre el tablero, los nodos que se van con ella
     y la barra flotante. */
  function pintarColumnas() {
    const g = G(), n = m.totalCeldas();
    [...cols].forEach(c => { if (c >= n) cols.delete(c); });
    if ($axis) $axis.querySelectorAll('.col[data-col]').forEach(el => el.classList.toggle('sel', cols.has(+el.dataset.col)));
    let capa = document.getElementById('colsCapa');
    if (!capa && $canvas) { capa = document.createElement('div'); capa.id = 'colsCapa'; $canvas.appendChild(capa); }
    if (capa) {
      /* una raya por columna elegida, justo donde se dibuja la cuadrícula y donde se posan los nodos (Leo, 16-09-2026:
         la banda de celda hacía creer que lo elegido era el hueco de al lado) */
      capa.innerHTML = [...cols].sort((a, b) => a - b).map(c => `<div class="col-marca" style="left:${GUTTER + px(c)}px"></div>`).join('');
      capa.style.top = EJE + 'px';
      capa.style.height = ($rows ? $rows.offsetHeight : 0) + 'px';   // hasta el último carril, no hasta el fondo del lienzo
    }
    /* y los nodos que están sobre esas rayas se marcan: así se ve qué se borra (un cuadro o un rombo son un
       solo salto aunque se enciendan sus dos extremos) */
    document.querySelectorAll('#board .pt').forEach(el => {
      const p = m.punto(el.dataset.punto);
      el.classList.toggle('en-columna', !!p && cols.has(m.cg(p)));
    });
    /* la barra de la selección: insertar a un lado o a otro, eliminar y soltar */
    let barra = document.getElementById('colBarra');
    if (!cols.size || !$board) { if (barra) barra.remove(); return; }
    if (!barra) { barra = document.createElement('div'); barra.id = 'colBarra'; barra.className = 'multi-barra col-barra'; document.body.appendChild(barra); }
    const k = cols.size, res = m.resumenColumnas([...cols]);
    const relacion = m.nombres && m.nombres.cuadro === 'Relación';
    const que = [res.nodos ? plural(res.nodos, m.nombre('nodo').toLowerCase(), m.nombre('nodo').toLowerCase() + 's') : '',
      res.saltos ? plural(res.saltos, relacion ? 'relación' : 'salto', relacion ? 'relaciones' : 'saltos') : ''].filter(Boolean).join(' · ');
    barra.innerHTML = `<span>${k === 1 ? '1 columna' : k + ' columnas'}${que ? '<i class="multi-barra-que">' + que + '</i>' : ''}</span>
      <button type="button" data-col-ins="izquierda" title="Insertar ${k === 1 ? 'una columna' : k + ' columnas'} a la izquierda">＋ Izquierda</button>
      <button type="button" data-col-ins="derecha" title="Insertar ${k === 1 ? 'una columna' : k + ' columnas'} a la derecha">＋ Derecha</button>
      <button type="button" class="peligro" data-col-borrar>Eliminar</button>
      <button type="button" data-col-soltar title="Soltar la selección (Esc)">Soltar</button>`;
    const r = $board.getBoundingClientRect();
    barra.style.left = (r.left + r.width / 2) + 'px'; barra.style.top = (r.bottom - 52) + 'px';
  }
  function limpiarColumnas() { if (!cols.size) return; cols = new Set(); colAncla = null; colPrevias = new Set(); pintarColumnas(); }
  /* Vista previa de mover las columnas elegidas: sus rayas, sus nodos y los trazos de sus saltos se corren `dc`
     columnas; el modelo no se toca hasta soltar (así se ve el intento aunque al final no se mueva). */
  function previaColumnas(dc) {
    const tx = dc * G();
    document.querySelectorAll('#colsCapa .col-marca').forEach(el => { el.style.transform = `translateX(${tx}px)`; });
    $axis.querySelectorAll('.col.sel').forEach(el => { el.style.transform = `translateX(${tx}px)`; });
    const dentro = new Set();
    document.querySelectorAll('#board .pt').forEach(el => {
      const p = m.punto(el.dataset.punto);
      if (!p || !cols.has(m.cg(p))) { el.classList.remove('arrastrando'); el.style.transform = ''; return; }
      dentro.add(p.id);
      el.style.transform = `translate(calc(-50% + ${tx}px), -50%)`;
      el.classList.toggle('arrastrando', !!dc);
    });
    m.datos.saltos.forEach(sa => {
      const g = $cables.querySelector(`[data-salto-g="${sa.id}"]`);
      const nom = $nombres && $nombres.querySelector(`[data-salto-nombre="${sa.id}"]`);
      const va = dentro.has(sa.deId) || dentro.has(sa.aId);
      if (g) g.setAttribute('transform', va ? `translate(${tx} 0)` : '');
      if (nom) nom.style.transform = va ? `translate(calc(-50% + ${tx}px), -50%)` : '';
    });
    document.body.classList.toggle('moviendo-columnas', !!dc);
  }
  /* La columna que hay bajo un punto de la pantalla (fuera del tablero, la primera o la última). */
  function columnaEn(clientX) {
    const r = $canvas.getBoundingClientRect(), n = m.totalCeldas();
    return clamp(Math.round(celdaEn(clientX - r.left - GUTTER)), 0, n - 1);   // la raya más cercana, como la cabecera
  }
  function elegirRango(c) {
    const a = Math.min(colAncla, c), b = Math.max(colAncla, c);
    cols = new Set(colPrevias);
    for (let i = a; i <= b; i++) cols.add(i);
  }
  /* Insertar tantas columnas como haya elegidas, a un lado o a otro (como Excel: lo nuevo queda elegido). */
  function insertarColumnas(lado) {
    const lista = [...cols].sort((a, b) => a - b); if (!lista.length) return;
    const ref = lado === 'derecha' ? lista[lista.length - 1] : lista[0];
    const r = m.insertarColumnas(ref, lista.length, lado);
    if (aplicar(r)) {
      cols = new Set(); colPrevias = new Set(); colAncla = r.desde;
      for (let i = 0; i < r.insertadas; i++) cols.add(r.desde + i);
    }
    render();
  }
  async function pedirBorrarColumnas() {
    const lista = [...cols]; if (!lista.length) return;
    const r = m.resumenColumnas(lista); if (!r.columnas) return;
    const partes = [];
    if (r.nodos) partes.push(plural(r.nodos, m.nombre('nodo').toLowerCase(), m.nombre('nodo').toLowerCase() + 's'));
    const relacion = m.nombres && m.nombres.cuadro === 'Relación';
    if (r.saltos) partes.push(plural(r.saltos, relacion ? 'relación' : 'salto', relacion ? 'relaciones' : 'saltos') + ' (con sus dos extremos)');
    if (r.notas) partes.push(plural(r.notas, 'nota', 'notas'));
    const solo = r.nodos + r.saltos + r.notas === 1;
    const texto = `¿Eliminar ${plural(r.columnas, 'columna', 'columnas')}?`
      + (partes.length ? ` Se ${solo ? 'borra' : 'borran'} ${partes.join(', ')}.` : r.columnas === 1 ? ' Está vacía.' : ' Están vacías.')
      + (r.actos ? ` ${r.nombresActos.map(x => '«' + x + '»').join(', ')} se ${r.actos === 1 ? 'queda' : 'quedan'} sin columnas y ${r.actos === 1 ? 'desaparece' : 'desaparecen'}.` : '');
    if (!await confirmar(texto, 'Eliminar ' + r.columnas)) return;
    if (aplicar(m.borrarColumnas(lista))) { cols = new Set(); colPrevias = new Set(); colAncla = null; sel = null; }
    render();
  }
  function menuColumnas(x, y) {
    const k = cols.size, lista = [...cols].sort((a, b) => a - b);
    const cuantas = k === 1 ? 'una columna' : k + ' columnas';
    abrirMenuEn(x, y, `<div class="mt">${k === 1 ? 'Columna ' + (lista[0] + 1) : k + ' columnas (' + (lista[0] + 1) + '–' + (lista[k - 1] + 1) + ')'}</div>
      <button data-col-ins="izquierda">Insertar ${cuantas} a la izquierda</button>
      <button data-col-ins="derecha">Insertar ${cuantas} a la derecha</button>
      <div class="sep"></div>
      <button class="peligro" data-col-borrar>Eliminar ${k === 1 ? 'la columna' : 'las ' + k + ' columnas'}</button>`);
  }

  function nodo(p, l, i) {
    const el = document.createElement('div');
    const forma = m.formaDe(p.id), c = m.cg(p);
    el.className = 'pt'
      + (!forma && !p.cortado ? ' con-rotulo' : '')                   // el nombre en un rótulo de papel (los cuadros, rombos y descartados, texto suelto)
      + (esSel('punto', p.id) ? ' sel' : '')
      + (multi.has(p.id) ? ' multi' : '')
      + (forma ? ' caja' + (forma === 'rombo' ? ' rombo' : '') : '')
      + (pres.fuera(p) ? ' fuera' : '')
      + (enRuta(p.lineaId, c, c) ? ' en-ruta' : '')
      + (p.cortado ? ' cortado' : '');
    el.style.left = xDe(p) + 'px';
    el.style.setProperty('--c', tono(p.color || l.color));          // su color: elegido o al pasar el ratón se enciende con él
    el.dataset.punto = p.id;
    el.innerHTML = `<span class="dot" style="background:${tono(p.color || l.color)};color:${tono(p.color || l.color)}" tabindex="0"></span><span class="cap"></span>`;
    el.querySelector('.cap').textContent = p.titulo;
    return el;
  }

  /* Rótulos y notas de una fila (Leo, 16-09-2026: «no importa que crezca el alto vertical de la trama donde no quepa
     la información»). Los **rótulos se apilan hacia arriba** (nivel 0 pegado al carril; si uno choca con el anterior,
     sube otro nivel) y las **notas hacia abajo**, del mismo modo: así caben varias en un tramo y las de un nodo, sin
     correrse a un lado ni taparse. El rótulo del primer nodo no se sale por la izquierda (se desplaza lo justo: si no,
     un nombre largo en la primera columna se perdía debajo de la columna de tramas). Devuelve lo que ocupa arriba y
     abajo, para que `render` suba el alto del carril si hace falta. Se mide en el DOM: va tras montar la fila. */
  const HOLGURA_ROTULO = 6, ALTO_ROTULO = 19, BASE_ROTULO = 14;
  const HOLGURA_NOTA = 8, ALTO_NOTA = 26, BASE_NOTA = 13, NOTA_MAX = 260, ANCHO_TOPE = 620;
  /* Lo ancho que puede ponerse lo que va centrado en un nodo (su rótulo, sus notas): el hueco hasta el nodo de al
     lado. **Con más escala se lee más texto** (Leo, 16-09-2026: «si ya tengo más espacio, debería ver más texto de
     títulos o notas largas»); con poca, se sigue cortando con «…» como antes. */
  function sitioDe(p, props, minimo) {
    const x = xDe(p);
    const izq = props.filter(q => xDe(q) < x).pop(), der = props.find(q => xDe(q) > x);
    const hueco = Math.min(izq ? (x - xDe(izq)) : Infinity, der ? (xDe(der) - x) : Infinity);
    const libre = hueco === Infinity ? ANCHO_TOPE : Math.round(hueco - HOLGURA_ROTULO * 2);   // sin llegar al nodo vecino
    return Math.max(minimo, Math.min(ANCHO_TOPE, libre));
  }
  function colocarRotulos(row) {
    const track = row.querySelector('.track'); if (!track) return { arriba: 0, abajo: 0 };
    /* ---- rótulos de los nodos, apilados hacia arriba ---- */
    const niveles = [];                                         // por nivel, el borde derecho de lo último colocado
    const pts = Array.from(track.querySelectorAll(':scope > .pt')).map(el => ({ el, p: m.punto(el.dataset.punto) })).filter(x => x.p)
      .sort((a, b) => xDe(a.p) - xDe(b.p));
    const enOrden = pts.map(x => x.p);
    pts.forEach(({ el, p }) => {
      const cap = el.querySelector('.cap'); if (!cap) return;
      cap.style.bottom = ''; cap.style.transform = '';
      cap.style.setProperty('--cap-max', sitioDe(p, enOrden, 0) + 'px');   // lo que caben sin pisar al vecino
      const w = cap.offsetWidth; if (!w) return;
      const x = xDe(p);
      const dx = Math.max(0, 2 - (x - w / 2));                  // no se sale por la izquierda
      const izq = x - w / 2 + dx, der = izq + w;
      let n = 0; while (niveles[n] !== undefined && izq < niveles[n] + HOLGURA_ROTULO) n++;
      niveles[n] = der;
      if (dx) cap.style.transform = `translateX(calc(-50% + ${Math.round(dx)}px))`;
      cap.style.bottom = (BASE_ROTULO + n * ALTO_ROTULO) + 'px';
      el.dataset.nivel = n;
    });
    /* ---- notas y huecos, apilados hacia abajo ---- */
    const usados = [];                                          // por nivel, el borde derecho de lo último colocado
    const piezas = [];
    Array.from(track.querySelectorAll(':scope > .nota')).forEach(el => {
      const nt = m.nota(el.dataset.nota); if (!nt) return;
      const a = m.punto(nt.deId), b = nt.aId && m.punto(nt.aId); if (!a) return;
      el.style.marginTop = ''; el.style.left = ''; el.style.width = ''; el.style.maxWidth = '';
      /* `orden`: el de la lista, que es el que se cambia arrastrando una nota sobre otra (Leo, 16-09-2026); `clave`
         ordena por sitio —el tramo o el nodo—, no por el borde de cada nota, que cambia con lo larga que sea */
      const orden = m.datos.notas.indexOf(nt);
      /* Las dos clases de nota se ponen igual: **a su medida y colgadas de su sitio** —el nodo, o la mitad del tramo
         que une dos nodos (Leo, 16-09-2026: «su ancla debe ser la mitad de la unión entre dos nodos»)—, con su guía
         hasta el carril. Antes la de tramo se estiraba de nodo a nodo y crecía con la escala. */
      const x = b ? (xDe(a) + xDe(b)) / 2 : xDe(a);
      const hueco = b ? Math.abs(xDe(b) - xDe(a)) - HOLGURA_NOTA : null;
      el.style.maxWidth = (b ? Math.max(NOTA_MAX, Math.min(ANCHO_TOPE, Math.round(hueco)))
                             : sitioDe(a, m.puntosDe(a.lineaId), NOTA_MAX)) + 'px';   // con más escala, más texto a la vista
      const w = Math.max(44, el.offsetWidth);
      piezas.push({ el, x1: x - w / 2, ancho: w, centro: x, clave: x, orden });
    });
    Array.from(track.querySelectorAll(':scope > .hueco')).forEach(h => {
      const [d, a] = (h.dataset.tramo || '').split('|'), p = m.punto(d), q = m.punto(a);
      if (!p || !q) return;
      h.style.marginTop = '';
      piezas.push({ el: h, x1: xDe(p), ancho: xDe(q) - xDe(p), hueco: true, clave: xDe(p), orden: 0 });
    });
    /* primero las notas (en su nivel más alto posible) y después los huecos del «+», que ocupan todo el tramo */
    /* manda el orden de la lista, que es el que se cambia arrastrando: así una nota de enlace puede quedar encima de
       una de nodo y al revés (Leo, 16-09-2026). Las que no se pisan siguen compartiendo nivel: el reparto es por
       huecos libres, no por el orden. */
    piezas.sort((a, b) => (a.hueco ? 1 : 0) - (b.hueco ? 1 : 0) || a.orden - b.orden || a.clave - b.clave);
    piezas.forEach(z => {
      const izq = Math.max(2, z.x1), der = izq + z.ancho;
      /* el nivel es el primero donde **no se pisa con nadie**, mirando lo que ya hay puesto en él. Antes bastaba con
         el borde derecho del último, porque las piezas venían de izquierda a derecha; con el orden de la lista por
         delante (Leo, 16-09-2026) una nota se iba muy abajo aunque tuviera todo el hueco libre a su izquierda. */
      let n = 0;
      while ((usados[n] || []).some(([i, d]) => izq < d + HOLGURA_NOTA && der + HOLGURA_NOTA > i)) n++;
      (usados[n] || (usados[n] = [])).push([izq, der]);
      z.el.style.left = Math.round(izq) + 'px';
      const arriba = BASE_NOTA + n * ALTO_NOTA;
      z.el.style.marginTop = arriba + 'px';
      /* la guía hasta el carril mide lo que la nota se haya bajado: con la altura fija se veía cortada en cuanto la
         nota caía a un segundo nivel (Leo, 16-09-2026) */
      if (!z.hueco) z.el.style.setProperty('--guia', arriba + 'px');
      z.nivel = n;
    });
    return { arriba: BASE_ROTULO + Math.max(0, niveles.length - 1) * ALTO_ROTULO + ALTO_ROTULO,
             abajo: BASE_NOTA + Math.max(0, usados.length - 1) * ALTO_NOTA + ALTO_NOTA };
  }

  function cables() {
    const H = EJE + altoFilas() + 90;
    $cables.setAttribute('width', GUTTER + totalW() + 46);
    $cables.setAttribute('height', H);
    $cables.style.height = H + 'px';
    let d = '', nombres = '';
    m.datos.saltos.forEach(s => {
      const a = m.punto(s.deId), b = m.punto(s.aId);
      if (!a || !b || a.lineaId === b.lineaId) return;
      const x = GUTTER + xDe(a), y1 = yDe(a), y2 = yDe(b), dir = y2 > y1 ? 1 : -1;
      const col = colorSalto(s.tipo);
      const seleccionado = esSel('salto', s.id);
      const enCamino = ruta && ruta.saltos.has(s.id);
      let op = (m.linea(a.lineaId).cortada || m.linea(b.lineaId).cortada || a.cortado || b.cortado) ? .3 : 1;
      if (ruta) op = enCamino ? 1 : .16;
      const grosor = seleccionado ? 3.5 : (enCamino ? 4 : 2.5);
      const ya = y1 + dir * 11, yb = y2 - dir * 11;
      /* todo lo del salto va en un grupo: al arrastrarlo se desplaza entero sin redibujar */
      d += `<g data-salto-g="${s.id}">
            <line x1="${x}" y1="${ya}" x2="${x}" y2="${yb}" style="stroke:${col}" stroke-width="${grosor}" opacity="${op}" shape-rendering="crispEdges"/>
            ${simple ? '' : `<polygon points="${x},${yb + dir * 4.5} ${x - 5},${yb - dir * 5} ${x + 5},${yb - dir * 5}" style="fill:${col}" opacity="${op}"/>`}
            <path class="golpe" d="M ${x} ${ya + dir * 16} L ${x} ${yb - dir * 16}" stroke="transparent" stroke-width="14" fill="none" data-salto="${s.id}"/>`;
      /* sin la «×» en un círculo sobre el salto elegido (Leo, 15-09-2026): «Eliminar» ya está en su menú contextual y Supr */
      d += '</g>';
      /* el nombre del salto (cuadro, rombo o relación) va en su trazo, no en sus extremos (Leo, 15-09-2026); se arrastra, abre
         su menú y se renombra como el trazo (`data-salto`) */
      const titulo = a.titulo || m.forma(s.tipo);
      /* el nombre va en el hueco entre el carril de salida y el de al lado, no a mitad del trazo: en un salto de la trama 1
         a la 3 el medio caía sobre los nodos de la 2 y tapaba su lectura (Leo, 16-09-2026) */
      const ga = geo(a.lineaId), yNombre = EJE + (y2 > y1 ? ga.top + ga.alto : ga.top);   // el borde de su fila hacia el salto
      nombres += `<div class="salto-nombre${seleccionado ? ' sel' : ''}" data-salto="${s.id}" data-salto-nombre="${s.id}" style="left:${x}px;top:${yNombre}px;opacity:${op};--c:${col}" title="${esc(titulo)}">${esc(titulo)}</div>`;
    });
    $cables.innerHTML = d;
    if ($nombres) $nombres.innerHTML = nombres;
  }

  /* Enciende el recorrido sin reconstruir el tablero: solo clases y el SVG. */
  function pintarRuta() {
    calcularRuta();
    document.body.classList.toggle('con-ruta', !!ruta);
    document.querySelectorAll('.row[data-linea]').forEach(row => {
      const id = row.dataset.linea;
      row.querySelectorAll('.cadena').forEach(seg => seg.classList.toggle('ruta', enRuta(id, +seg.dataset.ca, +seg.dataset.cb)));
    });
    document.querySelectorAll('.pt').forEach(el => {
      const q = m.punto(el.dataset.punto);
      el.classList.toggle('en-ruta', !!q && enRuta(q.lineaId, m.cg(q), m.cg(q)));
    });
    cables();
  }

  /* ====================================================================
     Arrastres
     ==================================================================== */
  let arr = null, res = null, mov = null, cel = null, notaArr = null, celArrastrado = false;
  /* Selección múltiple (Leo, 15-09-2026): arrastrando en un hueco del tablero se dibuja un rectángulo (`marq`) y los nodos,
     cuadros y rombos que quedan dentro se eligen (`multi`); arrastrando uno de ellos se mueve el bloque entero (`bloque`,
     `m.moverBloque`). */
  const multi = new Set();
  /* **Varias notas elegidas** (Leo, 16-09-2026: «seleccionar varios nodos o notas, siempre que sean del mismo tipo, para
     cambiarles el color o eliminarlas… manteniendo presionado Mayús»): nodos en `multi`, notas en `multiNotas`; nunca los dos. */
  const multiNotas = new Set();
  const hayMulti = () => !!(multi.size || multiNotas.size);
  let marq = null, bloque = null, soltarClic = false;
  /* Reordenar tramas (Leo, 15-09-2026): se arrastra su etiqueta en la columna; la fila sigue al puntero y una raya marca dónde cae.
     En el tablero de un personaje (simple) su carril principal no se mueve y nada pasa por encima de él. */
  let filaArr = null, finFila = 0;
  /* Columnas (Leo, 16-09-2026, «como en Excel web»): la tira de cabeceras bajo los actos las elige (clic, arrastre,
     Cmd/Ctrl para sumar sueltas, Mayús para el rango) y desde ahí se insertan a un lado o a otro y se eliminan. */
  let cols = new Set(), colAncla = null, colPrevias = new Set(), colArr = null;
  const arrastrando = () => !!(arr || res || mov || cel || notaArr || (marq && marq.activo) || bloque || (filaArr && filaArr.activo) || (colArr && colArr.activo));
  function empezarArrastreFila(e, lineaId) {
    const l = m.linea(lineaId), row = l && $rows.querySelector(`.row[data-linea="${CSS.escape(lineaId)}"]`);
    if (!row || e.button !== 0 || (simple && l.tipo === 'principal')) return false;
    filaArr = { id: lineaId, row, y0: e.clientY, activo: false, destino: null };
    return true;
  }
  function moverFila(e) {
    const dy = e.clientY - filaArr.y0;
    if (!filaArr.activo) {
      if (Math.abs(dy) < 6) return;
      filaArr.activo = true; filaArr.row.classList.add('arrastrando-fila'); document.body.classList.add('moviendo-fila');
      filaArr.marca = document.createElement('div'); filaArr.marca.className = 'fila-marca'; $canvas.appendChild(filaArr.marca);
      $celda.classList.remove('show'); cerrarMenu(); $tip.classList.remove('show');
      const sx = window.getSelection && window.getSelection(); if (sx) sx.removeAllRanges();
    }
    filaArr.row.style.transform = `translateY(${dy}px)`;
    const filas = Array.from($rows.querySelectorAll(':scope > .row[data-linea]')).filter(r => r !== filaArr.row);
    let k = filas.filter(r => { const b = r.getBoundingClientRect(); return b.top + b.height / 2 < e.clientY; }).length;
    const pi = m.datos.lineas.findIndex(l => l.tipo === 'principal');
    if (simple && pi === 0) k = Math.max(1, k);                        // el dueño del tablero de un personaje sigue arriba
    filaArr.destino = k;
    const rc = $canvas.getBoundingClientRect();
    const ref = filas[k] ? filas[k].getBoundingClientRect().top : (filas.length ? filas[filas.length - 1].getBoundingClientRect().bottom : rc.top);
    filaArr.marca.style.top = (ref - rc.top - 1) + 'px';
  }
  function pintarMulti() {
    document.querySelectorAll('#board .pt').forEach(el => el.classList.toggle('multi', multi.has(el.dataset.punto)));
    document.querySelectorAll('#board .nota').forEach(el => el.classList.toggle('multi', multiNotas.has(el.dataset.nota)));
    /* la barra de la selección: cuántos hay, su color, eliminarlos y soltarlos (abajo, en el centro del tablero) */
    let barra = document.getElementById('multiBarra');
    const notas = multiNotas.size > 0;
    const n = notas ? [...multiNotas].filter(id => m.nota(id)).length : [...multi].filter(id => m.punto(id)).length;
    if (!n || !$board) { if (barra) barra.remove(); return; }
    if (!barra) { barra = document.createElement('div'); barra.id = 'multiBarra'; barra.className = 'multi-barra'; document.body.appendChild(barra); }
    const que = notas ? (n === 1 ? '1 nota elegida' : n + ' notas elegidas') : (n === 1 ? '1 elegido' : n + ' elegidos');
    barra.innerHTML = `<span>${que}</span><button type="button" data-multi-color>Color</button><button type="button" class="peligro" data-multi-borrar>Eliminar</button><button type="button" data-multi-soltar title="Soltar la selección (Esc)">Soltar</button>`;
    const r = $board.getBoundingClientRect();
    barra.style.left = (r.left + r.width / 2) + 'px'; barra.style.top = (r.bottom - 52) + 'px';
  }
  function limpiarMulti() { if (!hayMulti()) return; multi.clear(); multiNotas.clear(); pintarMulti(); }
  /* Mayús + clic en un nodo o una nota: lo suma a lo elegido o lo quita; lo que estaba elegido solo entra también, y elegir
     de un tipo suelta lo del otro */
  function alternarMulti(tipo, id) {
    const set = tipo === 'nota' ? multiNotas : multi, otro = tipo === 'nota' ? multi : multiNotas;
    otro.clear();
    if (!set.size && sel && sel.tipo === (tipo === 'nota' ? 'nota' : 'punto') && sel.id !== id) set.add(sel.id);
    if (set.has(id)) set.delete(id); else set.add(id);
    sel = null; limpiarSelDOM(); panel(); pintarRuta(); pintarMulti();
  }
  /* El tramo entre dos nodos consecutivos bajo el puntero, a la altura del carril (para su menú contextual; sobre el «+» de
     la celda también), o null */
  function enlaceEn(e) {
    let tr = null;
    for (const x of document.elementsFromPoint(e.clientX, e.clientY)) { tr = x.closest && x.closest('#board .track'); if (tr) break; }
    if (!tr) return null;
    const id = tr.dataset.linea, rc = $canvas.getBoundingClientRect();
    if (Math.abs(e.clientY - rc.top - yFila(id)) > 9) return null;
    const x = e.clientX - tr.getBoundingClientRect().left, props = m.puntosDe(id);
    for (let i = 0; i < props.length - 1; i++)
      if (x > xDe(props[i]) + 7 && x < xDe(props[i + 1]) - 7) return [props[i], props[i + 1]];
    return null;
  }
  /* ¿empieza aquí un rectángulo? en un hueco de una trama (no sobre un nodo, una nota o un control) o, con Mayús, sobre el «+» */
  function empiezaMarquesina(e) {
    const cl = s => e.target.closest && e.target.closest(s);
    /* el trazo de un salto (y su insignia) se arrastra para mover el salto: ahí no empieza un rectángulo (pasó en la 1.0.37) */
    if (e.button !== 0 || !cl('#board') || cl('.label, .axis, aside, #menu, .pt, .nota, .add-nota, .handle, [data-handle], [data-salto], input, button:not(#celda)')) return false;
    if (e.clientX < zonaUtil()) return false;
    return !!cl('#canvas') && (!cl('#celda') || e.shiftKey);
  }
  const quitarHot = () => document.querySelectorAll('.track.hot').forEach(t => t.classList.remove('hot'));

  function onPointerDown(e) {
    $tip.classList.remove('show');
    soltarClic = false;                                        // un clic que no llegó no se come el siguiente

    /* el asa del panel de abajo: arrastrar hacia arriba lo agranda */
    if (e.target === $asa && e.button === 0) {
      panelArr = { y0: e.clientY, alto: panelAlto(), movido: false };
      document.body.classList.add('redimensionando');
      try { $asa.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault(); return;
    }

    /* la tira de columnas: clic elige una, arrastrar el rango, Cmd/Ctrl suma sueltas y Mayús extiende (Excel) */
    const cab = e.target.closest && e.target.closest('.col[data-col]');
    if (cab) {
      if (e.button !== 0) return;                              // el clic derecho lo lleva el menú contextual, sin tocar lo elegido
      const c = +cab.dataset.col;
      limpiarMulti(); cerrarMenu();
      /* si ya está elegida, arrastrarla mueve las columnas elegidas con lo que tengan dentro (Leo, 16-09-2026) */
      if (cols.has(c) && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        colArr = { activo: false, x0: e.clientX, ultima: c, mover: true, dc: 0, col: c };
        try { cab.setPointerCapture(e.pointerId); } catch (_) {}
        e.preventDefault(); return;
      }
      if (e.metaKey || e.ctrlKey) {
        if (cols.has(c)) cols.delete(c); else cols.add(c);
        colAncla = c; colPrevias = new Set(cols); colPrevias.delete(c);
      } else if (e.shiftKey && colAncla !== null) elegirRango(c);
      else { colPrevias = new Set(); colAncla = c; cols = new Set([c]); }
      colArr = { activo: false, x0: e.clientX, ultima: c };
      try { cab.setPointerCapture(e.pointerId); } catch (_) {}
      pintarColumnas();
      e.preventDefault(); return;
    }
    if (cols.size && !(e.target.closest && e.target.closest('#menu, aside, .multi-barra, #dlg'))) limpiarColumnas();

    /* la etiqueta de una trama se arrastra para reordenar (un clic seco sigue eligiéndola; en un campo que se edita, no) */
    const etiqueta = e.target.closest && e.target.closest('#board .row[data-linea] > .label');
    if (etiqueta && !e.target.closest('.mini, button, input:not([readonly]), .per-combo, .per-color, .per-etq') && empezarArrastreFila(e, etiqueta.parentElement.dataset.linea)) return;

    /* Mayús + clic en un nodo (su punto o su rótulo) o en una nota: se suma a lo elegido o se quita (Leo, 16-09-2026) */
    if (e.shiftKey && e.button === 0 && e.target.closest) {
      const ptS = e.target.closest('#board .pt > .dot, #board .pt > .cap'), ntS = !ptS && e.target.closest('#board .nota');
      if (ptS || ntS) {
        cerrarMenu();
        if (ptS) alternarMulti('punto', ptS.parentElement.dataset.punto); else alternarMulti('nota', ntS.dataset.nota);
        soltarClic = true;                                      // el clic de después no elige nada
        e.preventDefault(); return;
      }
    }
    /* clic derecho sobre una nota elegida: su menú ofrece colorear o borrar todas */
    const ntB = e.target.closest && e.target.closest('#board .nota');
    if (ntB && e.button === 2 && multiNotas.has(ntB.dataset.nota)) return;
    /* un nodo del bloque elegido: se arrastra el bloque entero */
    const dotB = e.target.closest && e.target.closest('#board .dot');
    if (dotB && e.button === 2 && multi.has(dotB.parentElement.dataset.punto)) return;   // clic derecho sobre lo elegido: su menú ofrece borrarlo todo
    if (dotB && e.button === 0 && multi.size > 1 && multi.has(dotB.parentElement.dataset.punto)) {
      bloque = { x0: e.clientX, y0: e.clientY, ids: [...multi], movido: false, dc: 0, dl: 0, id: dotB.parentElement.dataset.punto };
      try { dotB.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault(); return;
    }
    if (empiezaMarquesina(e) && (e.shiftKey || !(e.target.closest && e.target.closest('#celda')))) {
      marq = { x0: e.clientX, y0: e.clientY, activo: false, sumar: e.shiftKey && multi.size ? new Set(multi) : null };
      if (!e.shiftKey) multiNotas.clear();
      e.preventDefault();                                      // sin seleccionar texto al arrastrar (el clic seco sigue llegando)
      return;
    }
    if (hayMulti() && !(e.target.closest && e.target.closest('#menu, aside, .multi-barra, #dlg'))) limpiarMulti();

    // el "+" del cruce se sostiene y se arrastra hasta otra trama: crea un salto
    const marca = e.target.closest && e.target.closest('#celda');
    const bajoNota = marca && notaBajo(e);                     // debajo del «+» hay una nota: gana la nota
    if (bajoNota) { $celda.classList.remove('show'); celdaObj = null; }
    else if (marca && celdaObj) {
      cel = Object.assign({}, celdaObj, { movido: false, destino: null, x0: e.clientX, y0: e.clientY, tmp: document.createElementNS('http://www.w3.org/2000/svg', 'path') });
      cel.tmp.style.stroke = colorSalto('cuadro'); cel.tmp.setAttribute('stroke-width', '2.5');
      cel.tmp.setAttribute('stroke-dasharray', '5 4'); cel.tmp.setAttribute('fill', 'none');
      $cables.appendChild(cel.tmp);
      try { marca.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault(); return;
    }
    // el trazo de un salto se arrastra de lado: mueve sus dos extremos
    const sl = e.target.closest && e.target.closest('[data-salto]');
    if (sl) {
      const s = m.salto(sl.dataset.salto), a = s && m.punto(s.deId);
      if (a) mov = { id: s.id, movido: false, c0: m.cg(a), pos: null, x0: e.clientX };
      e.preventDefault(); return;
    }
    // divisor entre actos
    const h = e.target.closest && e.target.closest('[data-handle]');
    if (h) {
      const a = m.acto(h.dataset.handle); res = { a, x0: e.clientX, c0: a.celdas };
      h.classList.add('activo'); try { h.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault(); return;
    }
    // una nota se arrastra de tramo en tramo
    const nt0 = bajoNota || (e.target.closest && e.target.closest('#board [data-nota]'));   // solo las del tablero (en ClapCraft hay otras `data-nota` fuera)
    if (nt0 && !(e.target.classList && e.target.classList.contains('nota-edit'))) {
      const n0 = m.nota(nt0.dataset.nota);
      notaArr = { id: nt0.dataset.nota, movido: false, origen: n0 ? [n0.deId, n0.aId] : null };
      if (bajoNota) seleccionSuave('nota', nt0.dataset.nota, nt0);   // el clic cayó en el «+»: no llegará a la nota
      nt0.classList.add('arrastrando');
      e.preventDefault(); return;
    }
    /* un nodo: su punto o **su rótulo fijo**, que vale igual que el punto (Leo, 16-09-2026: «presionar el tooltip fijo
       es como si seleccionara el nodo»); desde el rótulo también se arrastra */
    const rotulo = e.target.closest && e.target.closest('#board .pt > .cap');
    const dot = (e.target.closest && e.target.closest('.dot')) || (rotulo && rotulo.parentElement.querySelector('.dot'));
    if (!dot) return;
    const el = dot.parentElement, p = m.punto(el.dataset.punto);
    if (!p) return;
    arr = { p, el, track: el.parentElement, movido: false, x0: e.clientX, y0: e.clientY, destino: null, pos: null };
    el.classList.add('arrastrando'); el.style.pointerEvents = 'none';
    try { dot.setPointerCapture(e.pointerId); } catch (_) {}
    seleccionSuave('punto', p.id, el);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (panelArr) { if (Math.abs(e.clientY - panelArr.y0) > 2) panelArr.movido = true; panelAlto(panelArr.alto + (panelArr.y0 - e.clientY)); return; }
    if (colArr) {
      if (!colArr.activo && Math.abs(e.clientX - colArr.x0) < 4) return;
      colArr.activo = true;
      if (colArr.mover) {                                    // las columnas elegidas siguen al puntero (se mueven al soltar)
        const dc = Math.round((e.clientX - colArr.x0) / G());
        if (dc !== colArr.dc) { colArr.dc = dc; previaColumnas(dc); }
        return;
      }
      const c = columnaEn(e.clientX);                        // arrastrar por la tira extiende el rango desde el ancla
      if (c === colArr.ultima) return;
      colArr.ultima = c; elegirRango(c); pintarColumnas();
      return;
    }
    if (filaArr) { moverFila(e); return; }
    if (marq) {
      if (!marq.activo) {
        if (Math.abs(e.clientX - marq.x0) < 5 && Math.abs(e.clientY - marq.y0) < 5) return;
        marq.activo = true; marq.el = document.createElement('div'); marq.el.className = 'marquesina'; $canvas.appendChild(marq.el);
        const sx = window.getSelection && window.getSelection(); if (sx) sx.removeAllRanges();
        $celda.classList.remove('show'); cerrarMenu();
      }
      const rc = $canvas.getBoundingClientRect();
      const x1 = Math.min(marq.x0, e.clientX), x2 = Math.max(marq.x0, e.clientX), y1 = Math.min(marq.y0, e.clientY), y2 = Math.max(marq.y0, e.clientY);
      Object.assign(marq.el.style, { left: (x1 - rc.left) + 'px', top: (y1 - rc.top) + 'px', width: (x2 - x1) + 'px', height: (y2 - y1) + 'px' });
      multi.clear(); if (marq.sumar) marq.sumar.forEach(id => multi.add(id));
      document.querySelectorAll('#board .pt').forEach(el => {
        const r = el.querySelector('.dot').getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) multi.add(el.dataset.punto);
      });
      pintarMulti();
      return;
    }
    if (bloque) {
      const dx = e.clientX - bloque.x0, dy = e.clientY - bloque.y0;
      if (!bloque.movido && Math.abs(dx) <= 3 && Math.abs(dy) <= 3) return;
      bloque.movido = true;
      bloque.dc = Math.round(dx / G());
      /* las filas no miden lo mismo: cuántas se baja se cuenta por la fila que hay bajo el puntero */
      const filaEn = y => { const r = $canvas.getBoundingClientRect(), yy = y - r.top - EJE; let i = 0, t = 0;
        for (const l of m.datos.lineas) { const a = geo(l.id).alto; if (yy < t + a) return i; t += a; i++; }
        return i - 1 + Math.round((yy - t) / FILA_BASE + .5); };
      const f0 = filaEn(bloque.y0), f1 = filaEn(e.clientY);
      bloque.dl = f1 - f0;
      const carrilDe = i => { const l = m.datos.lineas[i]; if (l) { const g = geo(l.id); return g.top + g.centro; }
        return altoFilas() + (i - m.datos.lineas.length) * FILA_BASE + FILA_BASE / 2; };
      /* vista previa: el bloque (con las parejas de sus saltos) y sus trazos se desplazan; el modelo se mueve al soltar */
      const ids = new Set(bloque.ids); bloque.ids.forEach(id => { const q = m.parejaDe(id); if (q) ids.add(q.id); });
      const tx = bloque.dc * G(), ty = carrilDe(Math.max(0, f1)) - carrilDe(Math.max(0, f0));
      ids.forEach(id => { const el = document.querySelector(`#board .pt[data-punto="${CSS.escape(id)}"]`); if (el) { el.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`; el.classList.add('arrastrando'); } });
      m.datos.saltos.forEach(sa => {
        if (!ids.has(sa.deId)) return;
        const g = $cables.querySelector(`[data-salto-g="${sa.id}"]`); if (g) g.setAttribute('transform', `translate(${tx} ${ty})`);
        const nom = $nombres && $nombres.querySelector(`[data-salto-nombre="${sa.id}"]`); if (nom) nom.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`;
      });
      return;
    }
    if (cel && !cel.destino && Math.abs(e.clientX - cel.x0) > G() * 0.75) {
      /* desde el «+» en horizontal no hay salto posible: es un rectángulo de selección */
      marq = { x0: cel.x0, y0: cel.y0, activo: false, sumar: null };
      cel.tmp.remove(); quitarHot(); cel = null;
      return onPointerMove(e);
    }
    if (notaArr) {
      if (e.clientX < zonaUtil()) return;
      const bajo = document.elementFromPoint(e.clientX, e.clientY);
      const tr = bajo && bajo.closest && bajo.closest('.track'); if (!tr) return;
      const id = tr.dataset.linea, r = tr.getBoundingClientRect(), px = e.clientX - r.left;
      const props = m.puntosDe(id);
      /* cerca de un nodo, la nota cuelga de él; si no, del tramo donde cae (Leo, 16-09-2026) */
      /* **Volver a colgarla de un nodo no exige atinarle** (Leo, 16-09-2026: «si muevo una nota de nodo a un enlace,
         regresarla es muy complicado»; antes solo valía un cuadro de 24 px sobre el nodo, a la altura del carril). A
         cualquier altura, acercar el puntero a un nodo la cuelga de él: el imán es el 30 % del tramo hacia ese lado
         (hasta 40 px), así que la mitad del tramo sigue siendo del enlace y ahí se ordena sin convertirse. */
      const iman = p => {
        const i = props.indexOf(p), vecino = px >= xDe(p) ? props[i + 1] : props[i - 1];
        return vecino ? Math.max(12, Math.min(40, Math.abs(xDe(vecino) - xDe(p)) * 0.3)) : 40;
      };
      const cerca = props.filter(p => Math.abs(xDe(p) - px) <= iman(p))
        .sort((p, q) => Math.abs(xDe(p) - px) - Math.abs(xDe(q) - px))[0];
      let destino = cerca ? [cerca, null] : null;
      if (!destino) for (let i = 0; i < props.length - 1; i++)
        if (px >= xDe(props[i]) && px <= xDe(props[i + 1])) { destino = [props[i], props[i + 1]]; break; }
      if (!destino) return;                                   // fuera de todo tramo: no se mueve
      const antes = rectsNotas();
      const cambio = colocarNotaArrastrada(destino);
      const orden = reordenarNotaArrastrada(destino, e.clientY);   // arriba o debajo de las que ya están ahí
      if (!cambio && !orden) return;                          // donde ya estaba
      notaArr.movido = true; render();
      animarNotas(antes);
      const vivo = document.querySelector(`[data-nota="${notaArr.id}"]`);
      if (vivo) vivo.classList.add('arrastrando');
      return;
    }
    if (cel) {
      const rc = $canvas.getBoundingClientRect();
      const x = GUTTER + px(m.celdasAntes(cel.actoId) + cel.celda);
      const y1 = yFila(cel.lineaId), yc = e.clientY - rc.top;
      const bajo = document.elementFromPoint(e.clientX, e.clientY);
      const pista = bajo && bajo.closest && bajo.closest('.track');
      quitarHot();
      cel.destino = (pista && pista.dataset.linea !== cel.lineaId) ? pista.dataset.linea : null;
      /* si en esa celda de la trama de destino ya hay un nodo, no hay salto posible (el modelo lo
         rechaza): la vista previa no la enciende */
      if (cel.destino && m.datos.puntos.some(p => p.lineaId === cel.destino && p.actoId === cel.actoId && p.celda === cel.celda)) cel.destino = null;
      if (cel.destino) { pista.classList.add('hot'); cel.movido = true; }
      const y2 = cel.destino ? yFila(cel.destino) : yc;
      const forma = cel.destino ? m.formaEntre(cel.lineaId, cel.destino) : 'cuadro';
      cel.tmp.style.stroke = colorSalto(forma);               // la vista previa dice qué forma va a salir
      cel.tmp.setAttribute('d', `M ${x} ${y1} L ${x} ${y2}`);
      return;
    }
    if (mov) {
      if (e.clientX < zonaUtil()) return;                     // sobre la columna de nombres: no se coloca
      if (!mov.movido && Math.abs(e.clientX - mov.x0) <= 3) return;   // el temblor de un clic no es un arrastre
      mov.movido = true;
      const r = $canvas.getBoundingClientRect();
      const pos = m.ubicarCelda(celdaEn(e.clientX - r.left - GUTTER));
      mov.pos = pos;
      /* solo se desplaza el dibujo (los dos extremos y el trazo); el modelo se mueve al soltar, y si
         la celda está ocupada es entonces cuando avisa y todo vuelve a su sitio */
      const dx = (m.celdasAntes(pos.actoId) + pos.celda - mov.c0) * G();
      const s = m.salto(mov.id);
      if (s) [s.deId, s.aId].forEach(id => {
        const el = document.querySelector(`[data-punto="${id}"]`);
        if (el) { el.style.transform = `translate(calc(-50% + ${dx}px), -50%)`; el.classList.add('arrastrando'); }
      });
      const g = $cables.querySelector(`[data-salto-g="${mov.id}"]`);
      if (g) g.setAttribute('transform', `translate(${dx} 0)`);
      const nom = $nombres && $nombres.querySelector(`[data-salto-nombre="${mov.id}"]`);
      if (nom) nom.style.transform = `translate(calc(-50% + ${dx}px), -50%)`;
      return;
    }
    if (res) {
      m.fijarAncho(res.a.id, Math.round((res.c0 * G() + (e.clientX - res.x0)) / G()));
      render();
      const h = document.querySelector(`[data-handle="${res.a.id}"]`); if (h) h.classList.add('activo');
      return;
    }
    if (!arr) return;
    if (Math.abs(e.clientX - arr.x0) <= 3 && Math.abs(e.clientY - arr.y0) <= 3) return;   // temblor del clic
    if (e.clientX < zonaUtil()) return;                       // sobre la columna de nombres: no se coloca
    arr.movido = true;
    const bajo = document.elementFromPoint(e.clientX, e.clientY);
    const destino = (bajo && bajo.closest && bajo.closest('.track')) || arr.track;
    quitarHot();
    if (destino !== arr.track) destino.classList.add('hot');
    const r = destino.getBoundingClientRect();
    const pos = m.ubicarCelda(celdaEn(e.clientX - r.left));
    arr.destino = destino; arr.pos = pos;
    arr.el.style.left = px(m.celdasAntes(pos.actoId) + pos.celda) + 'px';
    previaIntercambio(arr.p, destino.dataset.linea, pos);
  }

  /* Una nota arrastrada a otro sitio: un tramo (`[a, b]`) o un nodo (`[p, null]`). Donde caiga se apila con las que ya
     haya (Leo, 16-09-2026: caben varias). Devuelve si cambió algo. */
  function colocarNotaArrastrada(destino) {
    const n = m.nota(notaArr.id); if (!n) return false;
    const [a, b] = destino;
    if (!b ? (n.deId === a.id && !n.aId) : ((n.deId === a.id && n.aId === b.id) || (n.deId === b.id && n.aId === a.id))) return false;
    return m.moverNota(notaArr.id, a.id, b ? b.id : null).ok;
  }

  /* **Reordenar notas apiladas** (Leo, 16-09-2026): en el sitio donde cae, la nota se pone encima o debajo de las que
     ya hay según la altura del puntero; vale igual para las de un nodo y las de un tramo. */
  function reordenarNotaArrastrada(destino, y) {
    const [a, b] = destino, aId = b ? b.id : null;
    const n = m.nota(notaArr.id); if (!n) return false;
    const aqui = (n.deId === a.id && (n.aId || null) === aId) || (aId && n.deId === aId && n.aId === a.id);
    if (!aqui) return false;                                  // aún no ha caído en este sitio
    /* se ordena contra **las notas que comparten sitio con ella** —las que se pisan en horizontal—, sean de nodo o de
       enlace: ahora cada una es una cajita colgada de su sitio, así que las de un mismo sitio caen una sobre otra */
    const mio = document.querySelector(`#board [data-nota="${n.id}"]`); if (!mio) return false;
    const caja = mio.getBoundingClientRect();
    const izq = caja.left, der = caja.right;
    const vecinas = m.notasDeLinea(a.lineaId).filter(z => {
      if (z.id === n.id) return false;
      const el = document.querySelector(`#board [data-nota="${z.id}"]`); if (!el) return false;
      const q = el.getBoundingClientRect();
      return q.right > izq + 2 && q.left < der - 2;
    });
    if (!vecinas.length) return false;
    const conY = vecinas.map(z => ({ z, y: document.querySelector(`#board [data-nota="${z.id}"]`).getBoundingClientRect() }))
      .sort((p, q) => p.y.top - q.y.top);
    let antesDe = null;                                       // la primera cuya mitad queda por debajo del puntero
    for (const z of conY) if (y < z.y.top + z.y.height / 2) { antesDe = z.z.id; break; }
    const lista = m.datos.notas;
    const i = lista.indexOf(n);
    const j = antesDe ? lista.findIndex(z => z.id === antesDe) : lista.length;
    if (j === i || j === i + 1) return false;                 // ya está ahí
    return m.colocarNota(n.id, antesDe).movida === true;
  }
  /* Dónde estaba cada nota antes de mover, para que las de al lado se aparten con animación (FLIP). */
  function rectsNotas() {
    const mapa = new Map();
    document.querySelectorAll('#board [data-nota]').forEach(el => mapa.set(el.dataset.nota, el.getBoundingClientRect()));
    return mapa;
  }
  function animarNotas(antes) {
    if (!antes || !antes.size || !document.querySelector('#board [data-nota]')) return;
    document.querySelectorAll('#board [data-nota]').forEach(el => {
      if (notaArr && el.dataset.nota === notaArr.id) return;   // la arrastrada va al puntero, no se anima
      const a = antes.get(el.dataset.nota); if (!a) return;
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      if (el.animate) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 170, easing: 'cubic-bezier(.2,.8,.3,1)' });
    });
  }

  /* Vista previa del intercambio de nodos: mientras se arrastra un nodo sobre otro, el de debajo (con su pareja de salto) se
     desplaza al sitio del arrastrado, que es donde quedará al soltar. */
  function previaIntercambio(p, lineaId, pos) {
    (arr.previa || []).forEach(el => { el.style.transform = ''; el.classList.remove('intercambio'); });
    arr.previa = [];
    if (!pos) return;
    const pareja = m.parejaDe(p.id), salvo = [p.id].concat(pareja ? [pareja.id] : []);
    let q = m.ocupante(lineaId, pos.actoId, pos.celda, salvo), va = p;
    if (!q && pareja) { q = m.ocupante(pareja.lineaId, pos.actoId, pos.celda, salvo); va = pareja; }
    if (!q) return;
    const dx = (m.cg(va) - m.cg(q)) * G();
    const fila = id => { const t = document.querySelector(`.track[data-linea="${id}"]`); return t ? t.getBoundingClientRect().top : 0; };
    const dy = q.lineaId === lineaId && lineaId !== va.lineaId ? fila(va.lineaId) - fila(q.lineaId) : 0;   // cruzando de trama, baja o sube a la del arrastrado
    const qp = m.parejaDe(q.id);
    [[q, dy], [qp, 0]].forEach(([x, y]) => {
      const el = x && document.querySelector(`.pt[data-punto="${x.id}"]`); if (!el) return;
      el.classList.add('intercambio'); el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${y}px))`;
      arr.previa.push(el);
    });
  }

  function onPointerUp() {
    if (panelArr) {
      const movido = panelArr.movido; panelArr = null;
      document.body.classList.remove('redimensionando');
      if (movido) { soltarClic = true; setTimeout(() => { soltarClic = false; }, 0); }   // el clic que cierra el arrastre no cuenta
      if (ganchos.alPanel) ganchos.alPanel(panelAlto());
      return;
    }
    if (colArr) {
      const { activo, mover, dc, col } = colArr; colArr = null;
      if (activo) { soltarClic = true; setTimeout(() => { soltarClic = false; }, 0); }
      if (!mover) return;
      if (!activo) {                                           // clic seco sobre una elegida: se queda solo esa
        colPrevias = new Set(); colAncla = col; cols = new Set([col]); pintarColumnas(); return;
      }
      previaColumnas(0);
      if (dc) {
        const r = m.moverColumnas([...cols], dc);
        if (aplicar(r) && r.movidas) { colPrevias = new Set(); colAncla = r.desde; cols = new Set(); for (let i = 0; i < r.movidas; i++) cols.add(r.desde + i); }
      }
      render();
      return;
    }
    if (filaArr) {
      const { id, activo, destino, row, marca } = filaArr; filaArr = null;
      if (!activo) return;                                     // clic seco: lo elige el clic
      row.style.transform = ''; row.classList.remove('arrastrando-fila'); document.body.classList.remove('moviendo-fila'); if (marca) marca.remove();
      soltarClic = true; finFila = Date.now(); setTimeout(() => { soltarClic = false; }, 0);
      const r = m.moverLinea(id, destino);
      if (r.ok && r.movida) avisar(`«${r.linea.nombre}» ahora va en la posición ${destino + 1}`);
      render(); return;
    }
    if (marq) {
      const hubo = marq.activo; if (marq.el) marq.el.remove(); marq = null;
      if (hubo) { soltarClic = true; setTimeout(() => { soltarClic = false; }, 0); multiNotas.clear(); if (multi.size) { sel = null; limpiarSelDOM(); panel(); pintarRuta(); } pintarMulti(); }
      return;
    }
    if (bloque) {
      const { ids, movido, dc, dl, id } = bloque; bloque = null;
      if (!movido) { limpiarMulti(); const el = document.querySelector(`#board .pt[data-punto="${CSS.escape(id)}"]`); seleccionSuave('punto', id, el); return; }
      soltarClic = true; setTimeout(() => { soltarClic = false; }, 0);
      if (dc || dl) { const r = m.moverBloque(ids, dc, dl); if (r.aviso) avisar(r.aviso); }
      render(); return;                                       // con rechazo, el dibujo vuelve a su sitio
    }
    if (notaArr) {
      const movida = notaArr.movido; notaArr = null;
      document.querySelectorAll('.nota.arrastrando').forEach(x => x.classList.remove('arrastrando'));
      if (movida) render();                                   // clic seco: no se redibuja nada
      return;
    }
    if (cel) {
      const { lineaId, actoId, celda, destino, movido } = cel;
      cel.tmp.remove(); quitarHot();
      cel = null; celArrastrado = movido;
      const nuevo = destino ? saltoDesdeCruce({ lineaId, actoId, celda }, destino) : null;
      render(); if (nuevo) nombrarRecien(nuevo); return;
    }
    if (mov) {
      const { id, pos, movido } = mov; mov = null;
      if (!movido) return;                                    // clic seco: sin redibujar, o el clic no llega (lo elige el clic; el segundo renombra)
      if (pos) { const r = m.moverSalto(id, pos.actoId, pos.celda, { intercambiar: true }); if (!r.ok || r.intercambio) avisar(r.aviso); }
      render(); return;                                       // con rechazo, el dibujo vuelve a su celda
    }
    if (res) {
      document.querySelectorAll('.handle.activo').forEach(h => h.classList.remove('activo'));
      res = null; render(); return;
    }
    if (!arr) return;
    const { p, el, destino, pos, movido } = arr;
    el.classList.remove('arrastrando'); el.style.pointerEvents = '';
    quitarHot();
    if (!movido) { arr = null; return; }                      // clic seco: nada que recolocar
    if (pos) {
      const nueva = destino.dataset.linea;
      /* encima de otro nodo, se cambian de lugar (Leo, 15-09-2026) */
      const r = m.moverPunto(p.id, { actoId: pos.actoId, celda: pos.celda, lineaId: nueva }, { intercambiar: true });
      if (!r.ok || r.intercambio) avisar(r.aviso);
      else if (r.cambioTrama) avisar(`«${p.titulo}» pasó a ${m.linea(nueva).nombre}`);
    }
    arr = null; render();
  }

  /* Arrastre del "+" del cruce hasta otra trama: nacen los dos extremos y el salto. */
  function saltoDesdeCruce(origen, lineaDestino) {
    const forma = m.formaEntre(origen.lineaId, lineaDestino);
    const r = m.nuevoPunto(origen.lineaId, origen.actoId, origen.celda, { titulo: m.forma(forma) });
    if (!aplicar(r)) return;
    const s = m.crearSalto(r.punto.id, lineaDestino, forma);
    if (!s.ok) { m.borrarPunto(r.punto.id); avisar(s.aviso); return; }
    sel = { tipo: 'salto', id: s.salto.id };
    avisar(s.aviso);
    return r.punto.id;
  }

  /* Un nodo recién creado: su nombre propuesto («Punto nuevo», «Evento», «Cambio de escena»…) queda escrito y
     seleccionado sobre el propio nodo, para escribir encima; en blanco se queda el propuesto. En un salto, el
     otro extremo toma el mismo nombre si seguía con el propuesto. */
  /* Renombra un salto sobre su trazo: el nombre pasa a sus dos extremos. */
  function renombrarSalto(sid, propuesto) {
    const sa = m.salto(sid), el = sa && $nombres && $nombres.querySelector(`[data-salto-nombre="${sid}"]`); if (!el) return;
    const a = m.punto(sa.deId), b = m.punto(sa.aId); if (!a) return;
    const antes = a.titulo;
    editarEnSitio(el, a.titulo, 'salto-nombre-edit', v => {
      if (v && v !== antes) { m.editarPunto(a.id, { titulo: v }); if (b && (propuesto === undefined || b.titulo === antes)) m.editarPunto(b.id, { titulo: v }); }
      const f = $panel.querySelector('#fTitulo'); if (f) f.value = a.titulo;
      return a.titulo;
    });
    const inp = document.activeElement;
    if (inp && inp.classList.contains('salto-nombre-edit')) { inp.style.left = el.style.left; inp.style.top = el.style.top; }
  }

  function nombrarRecien(id) {
    const sr = m.saltoDe(id); if (sr) { renombrarSalto(sr.id, m.punto(id).titulo); return; }   // un salto: su nombre va en el trazo
    const p = m.punto(id), el = p && document.querySelector(`.pt[data-punto="${id}"] .cap`); if (!el) return;
    const s = m.saltoDe(id), gemelo = s && m.parejaDe(id), propuesto = p.titulo;
    editarEnSitio(el, p.titulo, 'cap-edit', v => {
      if (v && v !== propuesto) {
        m.editarPunto(p.id, { titulo: v });
        if (gemelo && gemelo.titulo === propuesto) {
          m.editarPunto(gemelo.id, { titulo: v });
          const cg = document.querySelector(`.pt[data-punto="${gemelo.id}"] .cap`); if (cg) cg.textContent = v;
        }
      }
      const f = $panel.querySelector('#fTitulo'); if (f) f.value = p.titulo;
      return p.titulo;
    });
  }

  /* ====================================================================
     Panel del nodo: solo lo que necesita espacio para escribir.
     En ClapCraft va abajo, de borde a borde (Leo, 16-09-2026, docs/diseno/rediseno-14): `panelAbajo(true)` pone
     `body.panel-abajo` y le añade el asa con la que se arrastra para que crezca hacia arriba (`--panel-alto`).
     En tramas.html y en el tablero de Personajes sigue a un lado.
     ==================================================================== */
  let abajo = false, $asa = null, panelArr = null;
  const PANEL_ALTO = 164, PANEL_MIN = 132;   // de partida cabe la descripción con varias líneas (Leo, 16-09-2026)
  let plegado = false;
  /* El panel de abajo es una sección fija: siempre está, aunque no haya nada elegido, y se contrae hacia abajo con el
     chevrón de su cabecera (Leo, 16-09-2026). */
  function panelPlegado(v) {
    if (v !== undefined) { plegado = !!v; document.body.classList.toggle('panel-plegado', abajo && plegado); if ($panel) panel(); }
    return plegado;
  }
  function panelAbajo(v) {
    abajo = !!v;
    document.body.classList.toggle('panel-abajo', abajo);
    document.body.classList.toggle('panel-plegado', abajo && plegado);
    if (abajo && $panel && !$asa) {                              // el asa es hermana del panel: no la borra cada render
      $asa = document.createElement('div');
      $asa.id = 'panelAsa'; $asa.title = 'Arrastra para agrandar el panel · doble clic: alto de partida';
      $panel.parentElement.insertBefore($asa, $panel);
    }
  }
  /* Añade a la cabecera el chevrón que contrae la sección y, para cuando está contraída, el nombre de lo elegido. */
  function adornarAbajo() {
    const cab = $panel.querySelector('.panel-cabecera'); if (!cab) return;
    const quien = document.createElement('span');
    quien.className = 'panel-quien';
    quien.textContent = !sel ? '' : sel.tipo === 'punto' ? ((m.punto(sel.id) || {}).titulo || '')
      : sel.tipo === 'nota' ? ((m.nota(sel.id) || {}).texto || '')
      : sel.tipo === 'enlace' ? (() => { const a = m.punto(sel.id), b = a && m.siguienteEnTrama(a.id); return a && b ? `${a.titulo} → ${b.titulo}` : ''; })()
      : sel.tipo === 'linea' ? ((m.linea(sel.id) || {}).nombre || '') : ((m.acto(sel.id) || {}).nombre || '');
    const h2 = cab.querySelector('h2');
    if (h2) h2.after(quien); else cab.prepend(quien);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mini panel-plegar'; b.dataset.panelPlegar = '';
    b.title = plegado ? 'Desplegar el panel' : 'Contraer el panel';
    b.setAttribute('aria-expanded', String(!plegado));
    b.innerHTML = ICONO.chev;
    cab.appendChild(b);
  }
  /* Alto del panel de abajo en px (lo escribe en --panel-alto para que el CSS lo lea). */
  function panelAlto(px) {
    if (px !== undefined) {
      const tope = $board ? Math.max(PANEL_MIN, $board.getBoundingClientRect().height - 120) : 520;
      const v = Math.round(clamp(+px || PANEL_ALTO, PANEL_MIN, tope));
      document.documentElement.style.setProperty('--panel-alto', v + 'px');
    }
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-alto')) || PANEL_ALTO;
  }
  function panel() {
    /* Elegir el trazo de un salto (la diagonal de una relación) abre el panel de su nodo de salida: ahí se escribe su
       descripción, como en cualquier nodo (Leo, 16-09-2026: «si selecciono la diagonal, no se abre el texto en la
       descripción; debe poderse escribir como si eligiera uno de sus nodos»). */
    const saltoSel = sel && sel.tipo === 'salto' ? m.salto(sel.id) : null;
    const abre = sel && (['punto', 'linea', 'acto', 'nota', 'enlace'].includes(sel.tipo) || !!saltoSel);
    document.body.classList.toggle('con-panel', !!abre);
    $panel.dataset.panel = abre ? (saltoSel ? 'punto' : sel.tipo) : 'vacio';          // la piel compacta el de la trama y el del acto
    if (!abre) {
      /* abajo es una sección fija: sin nada elegido enseña de qué va, en lugar de desaparecer */
      $panel.innerHTML = abajo
        ? `<div class="panel-cabecera"><h2>${esc(m.nombre('nodo'))}</h2></div>
           <p class="empty panel-vacio">Elige un nodo, una nota, una trama o un ${esc(m.nombre('acto').toLowerCase())} del tablero para ver aquí sus datos y escribir su descripción.</p>`
        : '';
      if (abajo) adornarAbajo();
      return;
    }

    if (sel.tipo === 'punto' || saltoSel) {
      const p = m.punto(saltoSel ? saltoSel.deId : sel.id); if (!p) { sel = null; return panel(); }
      const l = m.linea(p.lineaId), forma = m.formaDe(p.id), v = m.vecinos(p.id);
      /* cabecera con ‹ › y ×; título, descripción (ocupa el alto), estado, dónde está y las acciones */
      const pos = `${v.indice + 1} de ${v.total} · ${v.enHilo ? 'en el hilo' : 'solo en ' + l.nombre}`;
      $panel.innerHTML = `
        <div class="panel-cabecera"><h2>${esc(forma ? m.forma(forma) : m.nombre('nodo'))}</h2>
          <span class="panel-nav">
            <button class="btn nav" data-hilo="${v.anterior || ''}" ${v.anterior ? '' : 'disabled'} title="Nodo anterior (←) · ${esc(pos)}" aria-label="Nodo anterior">${ICONO.izq}</button>
            <button class="btn nav" data-hilo="${v.siguiente || ''}" ${v.siguiente ? '' : 'disabled'} title="Nodo siguiente (→) · ${esc(pos)}" aria-label="Nodo siguiente">${ICONO.der}</button>
            <button class="mini" data-panel-cerrar title="Cerrar el panel (Esc)" aria-label="Cerrar el panel">${ICONO.cerrar}</button>
          </span></div>
        ${pres.fuera(p) ? `<p class="empty" style="font-size:12px;margin-top:0">Está <b>fuera de escena</b>: la historia se fue a otra trama en este tramo.</p>` : ''}
        <div class="field"><label for="fTitulo">Título</label><input type="text" id="fTitulo"></div>
        <div class="field field-crece"><label for="fNota">Descripción</label>
          <textarea id="fNota" placeholder="Qué pasa aquí"></textarea></div>
        <div class="panel-meta"><span class="panel-meta-punto" style="background:${tono(l.color)}"></span>${esc(l.nombre)}<span class="panel-meta-sep">·</span>${esc((m.acto(p.actoId) || {}).nombre || '')}</div>
        <div class="panel-acciones">
          <button class="btn act-btn danger" id="bBorrar" title="${forma ? 'Eliminar salto' : 'Eliminar punto'} (Supr)" aria-label="${forma ? 'Eliminar salto' : 'Eliminar punto'}">${ICONO.borrar}</button></div>
        <div class="panel-pista"><span>Supr elimina</span><span>${abajo ? 'Esc apaga el recorrido' : 'Esc cierra'}</span></div>`;
      $panel.querySelector('#fTitulo').value = p.titulo;
      $panel.querySelector('#fNota').value = p.descripcion;
      /* en un salto, el nombre es de los dos extremos (como al renombrarlo en su trazo) */
      const pareja = (sa => sa && (sa.deId === p.id ? sa.aId : sa.deId))(m.saltoDe(p.id));
      $panel.querySelector('#fTitulo').oninput = e => {
        m.editarPunto(p.id, { titulo: e.target.value });
        if (pareja) m.editarPunto(pareja, { titulo: e.target.value });
        rapido(p); tocar();
      };
      $panel.querySelector('#fNota').oninput = e => { m.editarPunto(p.id, { descripcion: e.target.value }); tocar(); };
      /* (Leo, 14-09-2026: el panel ya no lleva «Estado»; descartar sigue en el menú del nodo) */
      $panel.querySelector('#bBorrar').onclick = () => pedirBorrarPunto(p.id);
    }

    /* el panel de una nota: su texto, dónde está y su color (Leo, 16-09-2026: «que se vea su contenido en el panel») */
    if (sel.tipo === 'nota') {
      const n = m.nota(sel.id); if (!n) { sel = null; return panel(); }
      const a = m.punto(n.deId), b = n.aId && m.punto(n.aId), l = a && m.linea(a.lineaId);
      const corto = q => { const t = (q.titulo || m.nombre('nodo')).trim(); return t.length > 22 ? t.slice(0, 21) + '…' : t; };
      const donde = !a ? '' : b ? `entre «${corto(a)}» y «${corto(b)}»` : `en «${corto(a)}»`;
      $panel.innerHTML = `
        <div class="panel-cabecera"><h2>Nota</h2>
          <span class="panel-nav"><button class="mini" data-panel-cerrar title="Cerrar el panel (Esc)" aria-label="Cerrar el panel">${ICONO.cerrar}</button></span></div>
        <div class="field"><label>Color</label>
          <div class="swatches nota-colores">
            <button class="sw papel${n.color ? '' : ' on'}" data-ncolor="${n.id}|" title="Papel de nota" aria-label="Papel de nota"></button>
            ${PALETA.map(c => `<button class="sw${n.color === c.id ? ' on' : ''}" data-ncolor="${n.id}|${c.id}" style="background:${tono(c.id)}" title="${c.label}" aria-label="${c.label}"></button>`).join('')}
          </div></div>
        <div class="panel-meta"><span class="panel-meta-punto" style="background:${tono(n.color || (l && l.color))}"></span>${esc(l ? l.nombre : '')}<span class="panel-meta-sep">·</span>${esc(donde)}</div>
        <div class="panel-acciones">
          <button class="btn act-btn danger" id="bBorrar" title="Eliminar la nota (Supr)" aria-label="Eliminar la nota">${ICONO.borrar}</button></div>
        <div class="field field-crece"><label for="fNotaTexto">Texto</label>
          <textarea id="fNotaTexto" placeholder="Qué quieres recordar aquí"></textarea></div>
        <div class="panel-pista"><span>Supr elimina</span><span>${abajo ? 'Esc apaga el recorrido' : 'Esc cierra'}</span></div>`;
      const ta = $panel.querySelector('#fNotaTexto');
      ta.value = n.texto;
      ta.oninput = e => {
        m.editarNota(n.id, e.target.value);
        const vivo = document.querySelector(`#board [data-nota="${CSS.escape(n.id)}"] span`);
        if (vivo) { vivo.textContent = e.target.value; const row = vivo.closest('.row'); if (row) colocarRotulos(row); }
        tocar();
      };
      $panel.querySelector('#bBorrar').onclick = () => pedirBorrarNota(n.id);
    }

    /* el panel de un enlace (Leo, 16-09-2026): su color, entre qué nodos va, «＋ Nota» y a la derecha sus notas */
    if (sel.tipo === 'enlace') {
      const a = m.punto(sel.id), b = a && m.siguienteEnTrama(a.id); if (!b) { sel = null; return panel(); }
      const l = m.linea(a.lineaId), notas = m.notasDe(a.id, b.id);
      const corto = q => { const t = (q.titulo || m.nombre('nodo')).trim(); return t.length > 22 ? t.slice(0, 21) + '…' : t; };
      $panel.innerHTML = `
        <div class="panel-cabecera"><h2>Enlace</h2>
          <span class="panel-nav"><button class="mini" data-panel-cerrar title="Cerrar el panel (Esc)" aria-label="Cerrar el panel">${ICONO.cerrar}</button></span></div>
        <div class="field"><label>Color</label>
          <div class="swatches nota-colores">
            <button class="sw trama${a.colorEnlace ? '' : ' on'}" data-ecolor="${a.id}|" style="--tc:${tono(l.color)}" title="El de la trama" aria-label="El color de la trama"></button>
            ${PALETA.map(c => `<button class="sw${a.colorEnlace === c.id ? ' on' : ''}" data-ecolor="${a.id}|${c.id}" style="background:${tono(c.id)}" title="${c.label}" aria-label="${c.label}"></button>`).join('')}
          </div></div>
        <div class="panel-meta"><span class="panel-meta-punto" style="background:${tono(a.colorEnlace || l.color)}"></span>${esc(l.nombre)}<span class="panel-meta-sep">·</span>entre «${esc(corto(a))}» y «${esc(corto(b))}»</div>
        <div class="panel-acciones">
          <button class="btn act-btn" data-enlace-nota="${a.id}|${b.id}" title="Agregar una nota a este enlace">＋ Nota</button></div>
        <div class="field field-crece"><label>Notas</label>
          <div class="panel-bloque enlace-notas">
            ${notas.length ? notas.map(n => `<button type="button" class="enlace-nota${n.color ? ' con-color' : ''}" data-ir-nota="${n.id}"${n.color ? ` style="--tc:${tono(n.color)}"` : ''}>${esc(n.texto || 'Nota')}</button>`).join('')
              : '<p class="empty">Sin notas. «＋ Nota» o el clic secundario sobre el enlace ponen las que hagan falta.</p>'}
          </div></div>`;
    }

    if (sel.tipo === 'linea') {
      const l = m.linea(sel.id); if (!l) { sel = null; return panel(); }
      const nodos = m.puntosDe(l.id).length;
      /* la misma forma que el panel de un nodo (Leo, 16-09-2026): a la izquierda el título y las acciones, y a la
         derecha, ocupando el alto, lo ancho (aquí el tipo y el color) */
      $panel.innerHTML = `
        <div class="panel-cabecera"><h2>${esc(m.nombre('linea'))}</h2>
          <span class="panel-nav"><button class="mini" data-panel-cerrar title="Cerrar el panel (Esc)" aria-label="Cerrar el panel">${ICONO.cerrar}</button></span></div>
        <div class="field"><label for="fNombre">Nombre</label><input type="text" id="fNombre"></div>
        <div class="panel-meta"><span class="panel-meta-punto" style="background:${tono(l.color)}"></span>${esc(ETIQUETA[l.tipo])}<span class="panel-meta-sep">·</span>${nodos} ${nodos === 1 ? esc(m.nombre('nodo').toLowerCase()) : esc(m.nombre('nodo').toLowerCase()) + 's'}</div>
        <div class="panel-acciones">
          <button class="btn act-btn${l.cortada ? ' on' : ''}" id="bCortar" title="${l.cortada ? 'Volver a ponerla en el guion' : 'Marcarla como descartada'}">${l.cortada ? 'Descartada ✓' : 'Descartar'}</button>
          ${l.tipo === 'principal' ? '' : `<button class="btn act-btn danger" id="bBorrar" title="Eliminar ${esc(m.nombre('linea').toLowerCase())}" aria-label="Eliminar ${esc(m.nombre('linea').toLowerCase())}">${ICONO.borrar}</button>`}</div>
        <div class="field field-crece"><label>Tipo y color</label>
          <div class="panel-bloque">
            ${l.tipo === 'principal' ? '<p class="empty">Es la trama principal: el hilo del que parte la historia. No se elimina ni cambia de tipo.</p>' : `
            <div class="chips">
              ${['secundaria', 'alterna'].map(t => `<button class="btn${l.tipo === t ? ' on' : ''}" data-tipo="${l.id}|${t}">${ETIQUETA[t]}</button>`).join('')}
            </div>`}
            <div class="swatches">
              ${PALETA.map(c => `<button class="sw${l.color === c.id ? ' on' : ''}" data-lcolor="${l.id}|${c.id}" style="background:${tono(c.id)}" title="${c.label}"></button>`).join('')}
            </div>
          </div></div>`;
      $panel.querySelector('#fNombre').value = l.nombre;
      $panel.querySelector('#fNombre').oninput = e => {
        m.editarLinea(l.id, { nombre: e.target.value });
        const i = $rows.querySelector(`[data-linea-nombre="${l.id}"]`); if (i) i.value = l.nombre; tocar();
      };
      $panel.querySelector('#bCortar').onclick = () => { m.descartarLinea(l.id); render(); };
      const bb = $panel.querySelector('#bBorrar');
      if (bb) bb.onclick = () => pedirBorrarLinea(l.id);
    }

    if (sel.tipo === 'acto') {
      const a = m.acto(sel.id); if (!a) { sel = null; return panel(); }
      $panel.innerHTML = `
        <div class="panel-cabecera"><h2>${esc(m.nombre('acto'))}</h2>
          <span class="panel-nav"><button class="mini" data-panel-cerrar title="Cerrar el panel (Esc)" aria-label="Cerrar el panel">${ICONO.cerrar}</button></span></div>
        <div class="field"><label for="fNombre">Nombre</label><input type="text" id="fNombre"></div>
        <div class="panel-meta">${a.celdas} ${a.celdas === 1 ? 'celda' : 'celdas'}<span class="panel-meta-sep">·</span>${m.datos.actos.indexOf(a) + 1} de ${m.datos.actos.length}</div>
        <div class="panel-acciones">
          ${m.datos.actos.length > 1 ? `<button class="btn act-btn danger" id="bBorrar" title="Eliminar ${esc(m.nombre('acto').toLowerCase())}" aria-label="Eliminar ${esc(m.nombre('acto').toLowerCase())}">${ICONO.borrar}</button>` : ''}</div>
        <div class="field field-crece"><label>Ancho y fondo</label>
          <div class="panel-bloque">
            <label id="lAncho" class="panel-sub">Ancho: ${a.celdas} celdas</label>
            <input type="range" id="fAncho" min="${MIN_CELDAS}" max="${MAX_CELDAS}" step="1" value="${a.celdas}">
            <div class="swatches">
              ${FONDOS.map(f => `<button class="sw${T.fondoEfectivo(a, m.datos.actos.indexOf(a)) === f.id ? ' on' : ''}" data-fondo="${a.id}|${f.id}"
                title="${f.label}${!a.fondo && T.fondoEfectivo(a, m.datos.actos.indexOf(a)) === f.id ? ' (automático)' : ''}" style="background:${fondo(f.id)};${f.id === 'ninguno' ? 'border:1px dashed var(--regla-fuerte)' : ''}"></button>`).join('')}
            </div>
          </div></div>`;
      $panel.querySelector('#fNombre').value = a.nombre;
      $panel.querySelector('#fNombre').oninput = e => {
        m.editarActo(a.id, { nombre: e.target.value });
        const i = $axis.querySelector(`[data-acto-nombre="${a.id}"]`); if (i) i.value = a.nombre; tocar();
      };
      $panel.querySelector('#fAncho').oninput = e => { m.fijarAncho(a.id, +e.target.value); render(); };
      const bb = $panel.querySelector('#bBorrar');
      if (bb) bb.onclick = () => pedirBorrarActo(a.id);
    }
    if (abajo) adornarAbajo();
  }

  /* Diálogo modal de confirmación. Resuelve con true (aceptar) o false (Cancelar, Escape, clic fuera).
     No se confía en el evento `close` del <dialog>: en algunos entornos embebidos no se dispara. */
  function confirmar(texto, etiqueta) {
    return new Promise(resolver => {
      const dlg = document.getElementById('dlg');
      if (!dlg || !dlg.showModal) return resolver(window.confirm(texto));
      const ok = dlg.querySelector('#dlgOk'), cancel = dlg.querySelector('#dlgCancel'), form = dlg.querySelector('form');
      dlg.querySelector('#dlgTexto').textContent = texto;
      ok.textContent = etiqueta || 'Eliminar';
      let hecho = false;
      const fin = v => {
        if (hecho) return; hecho = true;
        form.removeEventListener('submit', onSubmit); cancel.removeEventListener('click', onCancel);
        dlg.removeEventListener('cancel', onCancel); dlg.removeEventListener('keydown', onKey);
        dlg.removeEventListener('click', onFuera);
        if (dlg.open) dlg.close();
        resolver(v);
      };
      const onSubmit = e => { e.preventDefault(); fin(true); };
      const onCancel = e => { if (e) e.preventDefault(); fin(false); };
      const onKey = e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); fin(false); } };
      const onFuera = e => { if (e.target === dlg) fin(false); };   // clic en el fondo
      form.addEventListener('submit', onSubmit); cancel.addEventListener('click', onCancel);
      dlg.addEventListener('cancel', onCancel); dlg.addEventListener('keydown', onKey);
      dlg.addEventListener('click', onFuera);
      cerrarMenu(); $tip.classList.remove('show');
      dlg.showModal(); ok.focus();
    });
  }

  /* Eliminar siempre pide confirmación, venga del menú del nodo, del panel o de la tecla Supr. */
  async function pedirBorrarPunto(id) {
    const p = m.punto(id); if (!p) return;
    const forma = m.formaDe(id);
    const texto = forma
      ? `¿Seguro que deseas eliminar ${m.femenino(forma) ? 'esta' : 'este'} ${m.forma(forma).toLowerCase()}? Se eliminan sus dos extremos.`
      : '¿Seguro que deseas eliminar este punto?';
    if (!await confirmar(texto)) return;
    if (aplicar(m.borrarPunto(id))) sel = null;
    render();
  }
  async function pedirBorrarSalto(id) {
    const s = m.salto(id); if (!s) return;
    if (!await confirmar(`¿Seguro que deseas eliminar ${m.femenino(s.tipo) ? 'esta' : 'este'} ${m.forma(s.tipo).toLowerCase()}? Se eliminan sus dos extremos.`)) return;
    if (aplicar(m.borrarSalto(id))) sel = null;
    render();
  }

  /* Todos los borrados de la línea del tiempo piden confirmación (Leo, 15-09-2026). */
  const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
  async function pedirBorrarLinea(id) {
    const l = m.linea(id); if (!l) return;
    const n = m.datos.puntos.filter(p => p.lineaId === id).length;
    const nodo = m.nombre('nodo').toLowerCase();
    if (!await confirmar(`¿Eliminar «${l.nombre}»?` + (!n ? '' : n === 1 ? ` Se borra su ${nodo}, con los saltos y las notas que lo usan.` : ` Se borran sus ${n} ${nodo}s, con los saltos y las notas que los usan.`))) return;
    if (aplicar(m.borrarLinea(id))) sel = null;
    render();
  }
  async function pedirBorrarActo(id) {
    const a = m.acto(id); if (!a) return;
    const n = m.datos.puntos.filter(p => p.actoId === id).length;
    const nodo = m.nombre('nodo').toLowerCase();
    if (!await confirmar(`¿Eliminar «${a.nombre}»?` + (!n ? '' : n === 1 ? ` Su ${nodo} pasa al de al lado.` : ` Sus ${n} ${nodo}s pasan al de al lado.`))) return;
    if (aplicar(m.borrarActo(id))) sel = null;
    render();
  }
  async function pedirBorrarNota(id) {
    const n = m.nota(id); if (!n) return;
    if (!await confirmar(`¿Eliminar la nota «${String(n.texto || '').slice(0, 60)}»?`)) return;
    if (aplicar(m.borrarNota(id))) sel = null;
    render();
  }
  async function pedirBorrarNotas(ids) {
    const vivas = ids.filter(id => m.nota(id)); if (!vivas.length) return;
    if (vivas.length === 1) return pedirBorrarNota(vivas[0]);
    if (!await confirmar(`¿Eliminar ${vivas.length} notas?`, 'Eliminar ' + vivas.length)) return;
    if (aplicar(m.borrarNotas(vivas))) { multiNotas.clear(); sel = null; }
    render();
  }
  /* Borrado masivo de lo elegido con el rectángulo (Supr, la barra de la selección o el menú de uno de ellos). */
  async function pedirBorrarVarios(ids) {
    const r = m.resumenBorrado(ids); if (!r.total) return;
    const partes = [];
    if (r.nodos) partes.push(plural(r.nodos, m.nombre('nodo').toLowerCase(), m.nombre('nodo').toLowerCase() + 's'));
    const relacion = m.nombres && m.nombres.cuadro === 'Relación';   // en el tablero de un personaje los saltos son relaciones
    if (r.saltos) partes.push(plural(r.saltos, relacion ? 'relación' : 'salto', relacion ? 'relaciones' : 'saltos') + ' (con sus dos extremos)');
    const detalle = partes.join(' y ') + (r.notas ? ` y ${plural(r.notas, 'nota', 'notas')} que ${r.notas === 1 ? 'cuelga' : 'cuelgan'} de ellos` : '');
    if (!await confirmar(`¿Eliminar ${plural(r.total, 'elemento', 'elementos')}? Se borran ${detalle}.`, 'Eliminar ' + r.total)) return;
    const res = m.borrarPuntos(ids);
    if (aplicar(res)) { multi.clear(); sel = null; }
    render();
  }

  /* Ir a otro nodo del hilo: lo selecciona, ilumina su recorrido y lo trae a la vista. */
  function irANodo(id) {
    if (!m.punto(id)) return;
    elegir('punto', id);
    const dot = document.querySelector(`[data-punto="${id}"] .dot`);
    if (dot && dot.scrollIntoView) dot.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function rapido(p) {
    const el = document.querySelector(`[data-punto="${p.id}"] .cap`);
    if (el) { el.textContent = p.titulo; colocarRotulos(el.closest('.row')); }
  }

  /* ====================================================================
     Clic, doble clic y clic secundario
     ==================================================================== */
  function onClick(e) {
    const t = e.target, cl = s => t.closest && t.closest(s);
    if (soltarClic) { soltarClic = false; return; }           // el clic que cierra un rectángulo o un bloque arrastrado
    if (cl('#dlg')) return;                                   // el diálogo modal no es el tablero
    if (!t.isConnected) return;   // un botón que ya redibujó (p. ej. Descartar) no es un clic en blanco
    if (t.classList && (t.classList.contains('cap-edit') || t.classList.contains('nota-edit'))) return;

    if (cl('#celda')) {
      if (celArrastrado) { celArrastrado = false; return; }
      if (celdaObj) abrirMenuCrear(e.clientX, e.clientY, celdaObj.lineaId, celdaObj);
      return;
    }
    const cr = cl('[data-crear]');
    if (cr) {
      const v = cr.dataset.crear, q = pendiente; cerrarMenu();
      if (!q) return;
      let nuevo = null;
      if (v === 'nodo') {
        const r = m.nuevoPunto(q.lineaId, q.actoId, q.celda);
        if (aplicar(r)) { sel = { tipo: 'punto', id: r.punto.id }; nuevo = r.punto.id; }
      } else {
        const [forma, destino] = v.split('|');
        const r = m.nuevoPunto(q.lineaId, q.actoId, q.celda, { titulo: m.forma(forma) });
        if (aplicar(r)) {
          const s = m.crearSalto(r.punto.id, destino, forma);
          if (s.ok) { sel = { tipo: 'salto', id: s.salto.id }; nuevo = r.punto.id; } else m.borrarPunto(r.punto.id);
          avisar(s.aviso);
        }
      }
      render(); if (nuevo) nombrarRecien(nuevo); return;
    }
    if (!cl('#menu')) cerrarMenu();

    if (cl('#addLinea')) {
      const r = cl('#addLinea').getBoundingClientRect();
      abrirMenuEn(r.left, r.bottom + 8, `<div class="mt">Nueva trama de tipo…</div>
        <button data-nuevatrama="secundaria"><span class="ic" style="background:var(--t-violeta)"></span>Secundaria</button>
        <button data-nuevatrama="alterna"><span class="ic" style="background:var(--papel);border:1.5px dashed var(--t-ambar)"></span>Alternativa</button>`);
      return;
    }
    const nl = cl('[data-nuevatrama]');
    if (nl) { const r = m.nuevaLinea(nl.dataset.nuevatrama); cerrarMenu(); if (aplicar(r)) elegir('linea', r.linea.id); return; }
    if (cl('#addActo')) { const r = m.nuevoActo(); if (aplicar(r)) elegir('acto', r.acto.id); return; }

    if (cl('[data-panel-plegar]')) { panelPlegado(!plegado); if (ganchos.alPanel) ganchos.alPanel(panelAlto(), plegado); return; }
    if (cl('[data-panel-cerrar]')) { sel = null; render(); return; }
    const hn = cl('[data-hilo]');
    if (hn) { if (hn.dataset.hilo) irANodo(hn.dataset.hilo); return; }
    const nc = cl('[data-ncolor]');                            // el color de una nota (Leo, 15-09-2026)
    if (nc) {
      const [id, c] = nc.dataset.ncolor.split('|');
      const desdePanel = !!nc.closest('#panel') || nc.dataset.panel !== undefined;
      if (aplicar(m.colorearNota(id, c || null))) {
        render();
        if (desdePanel) { cerrarMenu(); return; }
        const n = m.nota(id), el = document.querySelector(`#board [data-nota="${CSS.escape(id)}"]`); if (n && el) menuNota(n, el);
      }
      return;
    }
    const mc = cl('[data-mcolor]');
    if (mc) {
      const [id, c] = mc.dataset.mcolor.split('|'); const q = m.punto(id);
      if (q) { m.editarPunto(id, { color: c || null }); render(); const el = document.querySelector(`[data-punto="${id}"]`); if (el) menuNodo(q, el); }
      return;
    }
    const mk = cl('[data-mcortar]');
    if (mk) { aplicar(m.descartarPunto(mk.dataset.mcortar)); cerrarMenu(); render(); return; }
    const mb = cl('[data-mborrar]');
    if (mb) { cerrarMenu(); pedirBorrarPunto(mb.dataset.mborrar); return; }
    if (cl('[data-mborrar-varios]')) { cerrarMenu(); pedirBorrarVarios([...multi]); return; }
    if (cl('[data-nborrar-varios]')) { cerrarMenu(); pedirBorrarNotas([...multiNotas]); return; }
    if (cl('[data-multi-borrar]')) { if (multiNotas.size) pedirBorrarNotas([...multiNotas]); else pedirBorrarVarios([...multi]); return; }
    if (cl('[data-multi-color]')) { const r = cl('[data-multi-color]').getBoundingClientRect(); paletaVarios(r.left, r.top); return; }
    const vc = cl('[data-varios-color]');                      // un color para todo lo elegido
    if (vc) {
      const c = vc.dataset.variosColor || null;
      if (multiNotas.size) multiNotas.forEach(id => m.colorearNota(id, c));
      else multi.forEach(id => m.editarPunto(id, { color: c }));
      cerrarMenu(); render(); return;
    }
    const ec = cl('[data-ecolor]');                            // el color de un enlace (Leo, 16-09-2026)
    if (ec) {
      const [id, c] = ec.dataset.ecolor.split('|');
      if (aplicar(m.colorearEnlace(id, c || null))) { if (cl('#menu')) cerrarMenu(); render(); }
      return;
    }
    const en2 = cl('[data-enlace-nota]');                      // «Agregar nota» a un enlace: caben varias
    if (en2) { cerrarMenu(); const [d, a] = en2.dataset.enlaceNota.split('|'); ponerNota(d, a); return; }
    const irn = cl('[data-ir-nota]');
    if (irn) { elegir('nota', irn.dataset.irNota); return; }
    if (cl('[data-multi-soltar]')) { limpiarMulti(); return; }
    const ci = cl('[data-col-ins]');                            // columnas: insertar a un lado, eliminar o soltar
    if (ci) { cerrarMenu(); insertarColumnas(ci.dataset.colIns); return; }
    if (cl('[data-col-borrar]')) { cerrarMenu(); pedirBorrarColumnas(); return; }
    if (cl('[data-col-soltar]')) { limpiarColumnas(); return; }
    const ne = cl('[data-nota-editar]');
    if (ne) {
      const id = ne.dataset.notaEditar; cerrarMenu();
      const el = document.querySelector(`[data-nota="${id}"] span`), n = m.nota(id);
      if (el && n) editarEnSitio(el, n.texto, 'nota-edit', v => { if (v) m.editarNota(id, v); return n.texto; });
      return;
    }
    const nd = cl('[data-nota-del]');
    if (nd) { cerrarMenu(); pedirBorrarNota(nd.dataset.notaDel); return; }
    const sf = cl('[data-salto-forma]');
    if (sf) { const [id, forma] = sf.dataset.saltoForma.split('|'); aplicar(m.convertirSalto(id, forma)); cerrarMenu(); render(); return; }
    const si = cl('[data-salto-inv]');
    if (si) { m.invertirSalto(si.dataset.saltoInv); cerrarMenu(); render(); return; }
    const sd = cl('[data-salto-del]');
    if (sd) { cerrarMenu(); pedirBorrarSalto(sd.dataset.saltoDel); return; }
    const sl = cl('[data-salto]');
    if (sl && sl.dataset.saltoNombre && e.detail >= 2) { renombrarSalto(sl.dataset.saltoNombre); return; }
    if (sl) { elegir('salto', sl.dataset.salto); return; }
    const fo = cl('[data-fondo]');
    if (fo) { const [id, f] = fo.dataset.fondo.split('|'); m.editarActo(id, { fondo: f || null }); render(); return; }
    const tp = cl('[data-tipo]');
    if (tp) { const [id, tipo] = tp.dataset.tipo.split('|'); aplicar(m.fijarTipo(id, tipo)); render(); return; }
    const lc = cl('[data-lcolor]');
    if (lc) { const [id, c] = lc.dataset.lcolor.split('|'); m.editarLinea(id, { color: c }); render(); return; }
    const nn = cl('[data-nota-nodo]');                         // «Nota en este nodo» (Leo, 16-09-2026)
    if (nn) { cerrarMenu(); ponerNota(nn.dataset.notaNodo, null); return; }
    const nt = cl('[data-nota]');
    if (nt) { seleccionSuave('nota', nt.dataset.nota, nt); return; }
    const ld = cl('[data-linea-del]');
    if (ld) { pedirBorrarLinea(ld.dataset.lineaDel); return; }
    const ad = cl('[data-acto-del]');
    if (ad) { pedirBorrarActo(ad.dataset.actoDel); return; }
    if (cl('[data-punto]')) return;                            // ya quedó seleccionado en pointerdown
    const enl = cl('#board [data-enlace]');                    // el enlace entre dos nodos: se elige (su panel: color y notas)
    if (enl) { elegir('enlace', enl.dataset.enlace); return; }
    const lab = cl('.label');
    if (lab && lab.parentElement.dataset.linea && !cl('.mini') && !t.matches('.lname')) {
      elegir('linea', lab.parentElement.dataset.linea); return;
    }
    const ac = cl('[data-acto]');
    if (ac && !cl('.mini') && !t.matches('.aname')) { elegir('acto', ac.dataset.acto); return; }

    // clic en blanco: se suelta la selección y se cierra el panel
    if (cl('aside') || cl('header') || cl('#menu') || cl('#panelAsa')) return;   // el asa del panel no es un clic en blanco (Leo, 16-09-2026: se cerraba al agrandarlo)
    if (t.matches && t.matches('.lname,.aname,.cap-edit,.nota-edit')) return;
    if (sel) { sel = null; render(); }
  }

  function onContextMenu(e) {
    const cl = s => e.target.closest && e.target.closest(s);
    const cab = cl('.col[data-col]');                          // la tira de columnas: insertar y eliminar
    if (cab) {
      e.preventDefault(); cerrarMenu();
      const c = +cab.dataset.col;
      if (!cols.has(c)) { cols = new Set([c]); colPrevias = new Set(); colAncla = c; limpiarMulti(); pintarColumnas(); }
      menuColumnas(e.clientX, e.clientY); return;
    }
    const pt = cl('[data-punto]');
    if (pt) {
      const q = m.punto(pt.dataset.punto); if (!q) return;
      e.preventDefault(); cerrarMenu();
      if (!multi.has(q.id)) { limpiarMulti(); seleccionSuave('punto', q.id, pt); }   // sobre lo elegido con Mayús, lo deja elegido
      menuNodo(q, pt); return;
    }
    const nt = cl('[data-nota]');
    if (nt) {
      const n = m.nota(nt.dataset.nota); if (!n) return;
      e.preventDefault(); cerrarMenu();
      if (!multiNotas.has(n.id)) { limpiarMulti(); seleccionSuave('nota', n.id, nt); }
      menuNota(n, nt); return;
    }
    const sl = cl('[data-salto]');
    if (sl) {
      const x = m.salto(sl.dataset.salto); if (!x) return;
      e.preventDefault(); cerrarMenu();
      sel = { tipo: 'salto', id: x.id }; render();
      menuSalto(x, e.clientX, e.clientY);
      return;
    }
    /* el enlace entre dos nodos (sobre su trazo, o sobre el «+» de una celda de ese tramo): agregar nota y su color */
    const en = cl('#board') && enlaceEn(e);
    if (en) {
      e.preventDefault(); cerrarMenu(); limpiarMulti();
      sel = { tipo: 'enlace', id: en[0].id }; sinRuta = false; render();
      menuEnlace(en[0], en[1], e.clientX, e.clientY);
    }
  }

  function onDblClick(e) {
    cerrarMenu();
    const cl = s => e.target.closest && e.target.closest(s);
    if (cl('#panelAsa')) { panelAlto(PANEL_ALTO); if (ganchos.alPanel) ganchos.alPanel(panelAlto()); return; }   // alto de partida
    const nm = cl('.lname,.aname');
    if (nm) { nm.dataset.antes = nm.value; nm.readOnly = false; nm.focus(); nm.select(); return; }      // renombrar trama o acto (Enter guarda; Esc o un clic fuera, no)
    const sn = cl('[data-salto-nombre]');
    if (sn) { renombrarSalto(sn.dataset.saltoNombre); return; }
    const pt = cl('.pt');
    if (pt) {                                                               // renombrar el nodo ahí mismo
      const p = m.punto(pt.dataset.punto); if (!p) return;
      const sp = m.saltoDe(p.id); if (sp) { renombrarSalto(sp.id); return; }   // el nombre de un cuadro o rombo está en su trazo
      const vivo = pt.querySelector('.cap');
      if (vivo) editarEnSitio(vivo, p.titulo, 'cap-edit', v => { if (v) m.editarPunto(p.id, { titulo: v }); const f = $panel.querySelector('#fTitulo'); if (f) f.value = p.titulo; return p.titulo; });
      return;
    }
    const nt = cl('.nota');
    if (nt) {                                                               // editar el texto de la nota
      const n = m.nota(nt.dataset.nota); if (!n) return;
      const vivo = nt.querySelector('span');
      if (vivo) editarEnSitio(vivo, n.texto, 'nota-edit', v => { if (v) m.editarNota(n.id, v); return n.texto; });
      return;
    }
    const track = cl('.track');
    if (!track) return;
    const r = track.getBoundingClientRect();
    abrirMenuCrear(e.clientX, e.clientY, track.dataset.linea, m.ubicarCelda(celdaEn(e.clientX - r.left)));
  }

  /* Crea la nota (de un tramo, o de un nodo con `aId` null) y la deja lista para escribir encima. */
  function ponerNota(deId, aId) {
    const r = m.crearNota(deId, aId, 'Nota nueva');
    if (!aplicar(r)) return;
    elegir('nota', r.nota.id);
    const el = document.querySelector(`[data-nota="${r.nota.id}"] span`);
    if (el) editarEnSitio(el, r.nota.texto, 'nota-edit', v => { if (v) m.editarNota(r.nota.id, v); return r.nota.texto; });
  }

  /* Renombrar sobre la propia trama: Enter confirma, Escape cancela.
     Al terminar NO se reconstruye el tablero: se devuelve el texto al mismo elemento. Si el cierre
     llega por un clic fuera (blur), un render aquí reemplazaría el elemento bajo el puntero antes
     del pointerup y el navegador descartaría ese clic. `alGuardar` devuelve el texto definitivo. */
  function editarEnSitio(el, viejo, clase, alGuardar) {
    const inp = document.createElement('input');
    inp.className = clase; inp.value = viejo;
    el.replaceWith(inp);
    inp.focus(); inp.select();
    let cerrado = false;
    const fin = guardar => {
      if (cerrado) return; cerrado = true;
      const nuevo = guardar ? alGuardar(inp.value.trim()) : viejo;
      if (inp.parentNode) inp.replaceWith(el);
      el.textContent = nuevo == null ? viejo : nuevo;
      registrar();
    };
    /* un clic fuera **guarda** lo escrito, como Enter; solo Esc lo deja como estaba (Leo, 16-09-2026: «cuando escribo
       el nombre de un nodo o una nota y doy un clic fuera, no se me guarda; forzosamente tengo que dar Enter») */
    inp.addEventListener('blur', () => fin(true));
    inp.addEventListener('keydown', ev => {
      ev.stopPropagation();
      if (ev.key === 'Enter' || ev.code === 'Enter' || ev.keyCode === 13) { ev.preventDefault(); fin(true); }
      if (ev.key === 'Escape' || ev.code === 'Escape' || ev.keyCode === 27) { ev.preventDefault(); fin(false); }
    });
    inp.addEventListener('pointerdown', ev => ev.stopPropagation());
    inp.addEventListener('dblclick', ev => ev.stopPropagation());
  }

  /* Nombres de trama y acto: doble clic los hace editables; al salir vuelven a solo lectura. */
  function onFocusIn(e) {
    const ln = e.target.closest && e.target.closest('[data-linea-nombre]');
    if (ln) { seleccionSuave('linea', ln.dataset.lineaNombre, ln.closest('.label')); return; }
    const an = e.target.closest && e.target.closest('[data-acto-nombre]');
    if (an) seleccionSuave('acto', an.dataset.actoNombre, an.closest('[data-acto]'));
  }
  function onFocusOut(e) {
    const nm = e.target.closest && e.target.closest('.lname,.aname');
    if (!nm) return;
    /* salir del campo **guarda** lo escrito (se va aplicando al teclear); solo Esc lo deja como estaba, y lo marca
       (Leo, 16-09-2026: antes un clic fuera lo devolvía al nombre de antes) */
    if (nm.dataset.cancelar && nm.dataset.antes !== undefined && nm.value !== nm.dataset.antes) { nm.value = nm.dataset.antes; onInput({ target: nm }); }
    delete nm.dataset.cancelar; delete nm.dataset.antes; nm.readOnly = true;
    try { nm.setSelectionRange(0, 0); } catch (_) {}                         // sin texto marcado al salir
  }
  /* Enter guarda el nombre de una trama o un acto; Esc lo deja como estaba (lo deshace al salir) */
  function onKeyNombre(e) {
    const nm = e.target.closest && e.target.closest('.lname,.aname');
    if (!nm || nm.readOnly) return;
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); if (!nm.value.trim()) { nm.dataset.cancelar = '1'; nm.blur(); return; } delete nm.dataset.antes; nm.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); nm.dataset.cancelar = '1'; nm.blur(); }
  }
  function onInput(e) {
    const ln = e.target.closest && e.target.closest('[data-linea-nombre]');
    if (ln) { m.editarLinea(ln.dataset.lineaNombre, { nombre: ln.value }); const f = $panel.querySelector('#fNombre'); if (f) f.value = ln.value; tocar(); return; }
    const an = e.target.closest && e.target.closest('[data-acto-nombre]');
    if (an) { m.editarActo(an.dataset.actoNombre, { nombre: an.value }); const f = $panel.querySelector('#fNombre'); if (f) f.value = an.value; tocar(); }
  }

  /* ====================================================================
     Menús flotantes
     ==================================================================== */
  let pendiente = null;
  function abrirMenuEn(cx, cy, html) {
    $menu.innerHTML = html;
    $menu.classList.add('show');
    $menu.style.left = '0px'; $menu.style.top = '0px';
    $menu.style.left = Math.max(8, Math.min(cx, innerWidth - $menu.offsetWidth - 10)) + 'px';
    $menu.style.top = Math.max(8, Math.min(cy, innerHeight - $menu.offsetHeight - 10)) + 'px';
  }
  function cerrarMenu() { $menu.classList.remove('show'); pendiente = null; }

  /* Menú de creación: nodo, cambio de escena a…, salto alternativo a… */
  function abrirMenuCrear(cx, cy, lineaId, pos) {
    pendiente = { lineaId, actoId: pos.actoId, celda: pos.celda };
    const l = m.linea(lineaId);
    const cuadros = m.datos.lineas.filter(x => x.id !== lineaId && x.tipo !== 'alterna');
    const rombos = m.datos.lineas.filter(x => x.id !== lineaId);
    const puedeCuadro = cuadros.length && l.tipo !== 'alterna';
    abrirMenuEn(cx, cy, `<div class="mt">Crear en ${esc(l.nombre)}</div>
      <button data-crear="nodo"><span class="ic" style="background:${tono(l.color)}"></span>${esc(m.nombre('nodo'))}</button>
      ${puedeCuadro ? `<div class="sep"></div><div class="mt">${esc(m.forma('cuadro'))} a…</div>`
        + cuadros.map(d => `<button data-crear="cuadro|${d.id}"><span class="ic caja"></span>${esc(d.nombre)}</button>`).join('') : ''}
      ${rombos.length && !simple ? `<div class="sep"></div><div class="mt">Salto alternativo a…</div>`
        + rombos.map(d => `<button data-crear="rombo|${d.id}"><span class="ic rombo"></span>${esc(d.nombre)}</button>`).join('') : ''}`);
  }

  /* Clic secundario en un nodo: color, descartar y eliminar; en un extremo: convertir, invertir, eliminar. */
  /* los colores de lo elegido con Mayús (nodos o notas), anclados a la barra o al menú de uno de ellos */
  function coloresVarios() {
    const notas = multiNotas.size > 0;
    return `<div class="colores">
        ${PALETA.map(c => `<button class="sw" data-varios-color="${c.id}" style="background:${tono(c.id)}" title="${c.label}"></button>`).join('')}
        <button class="sw hereda" data-varios-color="" title="${notas ? 'Sin color: el papel de nota' : 'Hereda el color de la trama'}">${notas ? 'nota' : 'trama'}</button>
      </div>`;
  }
  function paletaVarios(x, y) {
    const n = multiNotas.size || multi.size;
    abrirMenuEn(x, y, `<div class="mt">Color de ${multiNotas.size ? (n === 1 ? 'la nota' : 'las ' + n + ' notas') : (n === 1 ? '1 elegido' : 'los ' + n + ' elegidos')}</div>${coloresVarios()}`);
    const r = $menu.getBoundingClientRect();
    $menu.style.top = Math.max(8, y - r.height - 8) + 'px';    // encima de la barra
  }
  /* Clic secundario en un enlace: agregar nota (caben varias) y su color (Leo, 16-09-2026). */
  function menuEnlace(a, b, cx, cy) {
    abrirMenuEn(cx, cy, `<div class="mt">Enlace</div>
      <button data-enlace-nota="${a.id}|${b.id}"><span class="ic" style="border:1.5px solid var(--nota-borde);background:var(--nota)"></span>Agregar nota</button>
      <div class="sep"></div><div class="mt">Color</div>
      <div class="colores">
        ${PALETA.map(c => `<button class="sw${a.colorEnlace === c.id ? ' on' : ''}" data-ecolor="${a.id}|${c.id}" style="background:${tono(c.id)}" title="${c.label}"></button>`).join('')}
        <button class="sw hereda${a.colorEnlace ? '' : ' on'}" data-ecolor="${a.id}|" title="El color de la trama">trama</button>
      </div>`);
  }
  function menuNodo(p, el) {
    const s = m.saltoDe(p.id);
    const varios = multi.size > 1 && multi.has(p.id);
    const html = (s ? `<div class="mt">${esc(m.forma(s.tipo))}</div>${simple ? '' : opcionesSalto(s) + '<div class="sep"></div>'}`
      : `<div class="mt">${esc(m.nombre('nodo'))}</div>
         ${varios ? `<div class="mt">Color de los ${multi.size} elegidos</div>${coloresVarios()}` : `<div class="colores">
           ${PALETA.map(c => `<button class="sw${p.color === c.id ? ' on' : ''}" data-mcolor="${p.id}|${c.id}" style="background:${tono(c.id)}" title="${c.label}"></button>`).join('')}
           <button class="sw hereda${p.color ? '' : ' on'}" data-mcolor="${p.id}|" title="Hereda el color de la trama">trama</button>
         </div>`}<div class="sep"></div>
         <button data-mcortar="${p.id}"><span class="ic" style="border:1.5px dashed var(--tenue);background:none"></span>${p.cortado ? 'Quitar el descarte' : 'Descartar'}</button>`)
      + `<button data-nota-nodo="${p.id}"><span class="ic" style="border:1.5px solid var(--nota-borde);background:var(--nota)"></span>Nota en este nodo</button>`
      + (multi.size > 1 && multi.has(p.id) ? `<button class="peligro" data-mborrar-varios>Eliminar los ${multi.size} elegidos</button>` : '')
      + `<button class="peligro" data-mborrar="${p.id}">Eliminar</button>`;
    const r = el.getBoundingClientRect();
    abrirMenuEn(r.left + r.width / 2 - 105, r.bottom + 16, html);
  }
  function opcionesSalto(s) {
    const a = m.punto(s.deId), b = m.punto(s.aId);
    const alterna = a && b && m.formaEntre(a.lineaId, b.lineaId) === 'rombo';
    return (s.tipo === 'rombo'
      ? (alterna ? `<div class="no">No puede ser un salto trama: uno de sus extremos está en una trama alternativa.</div>`
                 : `<button data-salto-forma="${s.id}|cuadro"><span class="ic caja"></span>Convertir a salto trama</button>`)
      : `<button data-salto-forma="${s.id}|rombo"><span class="ic rombo"></span>Convertir a salto alternativo</button>`)
      + `<button data-salto-inv="${s.id}">Invertir el sentido</button>`;
  }
  function menuSalto(s, cx, cy) {
    abrirMenuEn(cx, cy, `<div class="mt">${esc(m.forma(s.tipo))}</div>${simple ? '' : opcionesSalto(s) + '<div class="sep"></div>'}
      <button class="peligro" data-salto-del="${s.id}">Eliminar</button>`);
  }
  /* La paleta de una nota abierta desde el panel: el mismo menú, anclado al botón. */
  function menuNota(n, el) {
    const r = el.getBoundingClientRect();
    if (multiNotas.size > 1 && multiNotas.has(n.id)) {
      abrirMenuEn(r.left + r.width / 2 - 105, r.bottom + 12, `<div class="mt">${multiNotas.size} notas elegidas</div>${coloresVarios()}
        <div class="sep"></div><button class="peligro" data-nborrar-varios>Eliminar las ${multiNotas.size} notas</button>`);
      return;
    }
    abrirMenuEn(r.left + r.width / 2 - 105, r.bottom + 12, `<div class="mt">Nota</div>
      <div class="colores">
        ${PALETA.map(c => `<button class="sw${n.color === c.id ? ' on' : ''}" data-ncolor="${n.id}|${c.id}" style="background:${tono(c.id)}" title="${c.label}"></button>`).join('')}
        <button class="sw hereda${n.color ? '' : ' on'}" data-ncolor="${n.id}|" title="Sin color: el papel de nota">nota</button>
      </div><div class="sep"></div>
      <button data-nota-editar="${n.id}">Editar el texto</button>
      <button class="peligro" data-nota-del="${n.id}">Eliminar nota</button>`);
  }

  /* ---------- marca de cruce entre trama y celda ---------- */
  let celdaObj = null;
  /* ¿Hay una nota del tablero bajo el puntero? Una nota corrida a un lado (dos nodos muy juntos) cae sobre celdas
     libres: el «+» de la celda se ponía encima y el clic creaba un nodo en lugar de elegir la nota (Leo). */
  const notaBajo = e => { for (const x of document.elementsFromPoint(e.clientX, e.clientY)) { const n = x.closest && x.closest('#board .nota'); if (n) return n; } return null; };
  function onMouseMove(e) {
    if (cel) return;                                                       // se está arrastrando
    const sobreNota = notaBajo(e);
    if (e.target.closest && e.target.closest('#celda') && !sobreNota) return;   // ya está encima de la marca
    const tr = sobreNota ? null : e.target.closest && e.target.closest('.track');
    const libre = tr && !e.target.closest('.pt') && !e.target.closest('.nota')
      && e.clientX >= zonaUtil() && !arrastrando();
    if (!libre) { $celda.classList.remove('show'); celdaObj = null; return; }
    const r = tr.getBoundingClientRect();
    if (celdaEn(e.clientX - r.left) < 0) { $celda.classList.remove('show'); celdaObj = null; return; }   // el hueco de delante no es una celda
    const pos = m.ubicarCelda(celdaEn(e.clientX - r.left));
    const id = tr.dataset.linea;
    if (m.datos.puntos.some(p => p.lineaId === id && p.actoId === pos.actoId && p.celda === pos.celda)) {
      $celda.classList.remove('show'); celdaObj = null; return;
    }
    celdaObj = { lineaId: id, actoId: pos.actoId, celda: pos.celda };
    $celda.style.left = (GUTTER + px(m.celdasAntes(pos.actoId) + pos.celda)) + 'px';
    $celda.style.top = yFila(id) + 'px';
    $celda.classList.add('show');
  }

  /* ---------- globo: nodos y notas ---------- */
  function tinta(col) {                                                    // texto legible sobre cualquier fondo
    const c = col.replace('#', '');
    const r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 155 ? '#1a1a1a' : '#ffffff';
  }
  function mostrarTip(el, titulo, texto, color) {
    color = color ? resolver(color) : '';
    $tip.innerHTML = '';
    if (titulo) { const h = document.createElement('div'); h.className = 'tip-t'; h.textContent = titulo; $tip.appendChild(h); }
    if (texto) { const b = document.createElement('div'); b.textContent = texto; $tip.appendChild(b); }
    if (!$tip.childNodes.length) return;
    $tip.style.background = color || '';       // sin color propio manda el tema
    $tip.style.color = color && /^#[0-9a-f]{6}$/i.test(color) ? tinta(color) : '';
    $tip.classList.add('show');
    const r = el.getBoundingClientRect(), w = $tip.offsetWidth, h = $tip.offsetHeight;
    $tip.style.left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8)) + 'px';
    $tip.style.top = (r.bottom + 10 + h > innerHeight ? r.top - h - 10 : r.bottom + 10) + 'px';
  }
  function onMouseOver(e) {
    if (arrastrando()) return;
    const n = e.target.closest && e.target.closest('.nota');
    if (n) { const nt = m.nota(n.dataset.nota); if (nt) mostrarTip(n, null, nt.texto, null); return; }
    /* los nodos no llevan globo (Leo, 15-09-2026): al pasar el ratón, su rótulo enseña el nombre entero (CSS, `.pt:hover .cap`) */
  }
  function onMouseOut(e) {
    const de = (e.target.closest && e.target.closest('.nota')) || (e.target.closest && e.target.closest('.pt'));
    if (!de) return;
    if (e.relatedTarget && de.contains(e.relatedTarget)) return;
    $tip.classList.remove('show');
  }

  /* ---------- teclado ---------- */
  function onKeyDown(e) {
    const cmd = e.metaKey || e.ctrlKey, enCampo = e.target instanceof Element && e.target.matches('input,textarea');
    if (cmd && e.key.toLowerCase() === 'z' && !enCampo) { e.preventDefault(); e.shiftKey ? rehacer() : deshacer(); return; }
    if (cmd && e.key.toLowerCase() === 'y' && !enCampo) { e.preventDefault(); rehacer(); return; }
    if (enCampo) return;
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && sel && sel.tipo === 'punto') {
      const v = m.vecinos(sel.id), id = v && (e.key === 'ArrowLeft' ? v.anterior : v.siguiente);
      if (id) { e.preventDefault(); irANodo(id); }
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && cols.size) { e.preventDefault(); return pedirBorrarColumnas(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && multiNotas.size) { e.preventDefault(); return pedirBorrarNotas([...multiNotas]); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && multi.size) { e.preventDefault(); return pedirBorrarVarios([...multi]); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
      e.preventDefault();
      if (sel.tipo === 'punto') return pedirBorrarPunto(sel.id);
      if (sel.tipo === 'salto') return pedirBorrarSalto(sel.id);
      if (sel.tipo === 'linea') return pedirBorrarLinea(sel.id);
      if (sel.tipo === 'acto') return pedirBorrarActo(sel.id);
      if (sel.tipo === 'nota') return pedirBorrarNota(sel.id);
    }
    if (e.key === 'Escape') {
      cerrarMenu(); limpiarMulti(); limpiarColumnas();
      if (ruta) { sinRuta = true; render(); return; }        // apaga el camino iluminado y deja el nodo (y su descripción)
      if (sel && !abajo) { sel = null; render(); }           // con el panel al lado sigue cerrándose, como siempre
    }
  }

  /* ====================================================================
     Historial y avisos
     ==================================================================== */
  function registrar() {
    if (historial.registrar(JSON.stringify(m.datos))) ganchos.alCambiar();
    botonesHistoria();
  }
  /* Cambios que no reconstruyen el tablero (escribir en el panel): se avisan igual al gancho. */
  function tocar() { ganchos.alCambiar(); }
  function aplicarInstantanea(json) {
    m.cargar(JSON.parse(json)); sel = null;
    restaurando = true; render(); restaurando = false;
    botonesHistoria(); ganchos.alCambiar();
  }
  function deshacer() {
    registrar();
    const j = historial.deshacer();
    if (!j) return avisar('No hay nada que deshacer');
    aplicarInstantanea(j); avisar('Deshecho');
  }
  function rehacer() {
    registrar();
    const j = historial.rehacer();
    if (!j) return avisar('No hay nada que rehacer');
    aplicarInstantanea(j); avisar('Rehecho');
  }
  function botonesHistoria() {
    const u = document.getElementById('undoBtn'), r = document.getElementById('redoBtn');
    if (u) u.disabled = !historial.puedeDeshacer();
    if (r) r.disabled = !historial.puedeRehacer();
  }
  let tt;
  function avisar(msg) {
    if (!msg) return;
    $aviso.textContent = msg; $aviso.classList.add('show');
    clearTimeout(tt); tt = setTimeout(() => $aviso.classList.remove('show'), 2200);
  }

  /* ====================================================================
     API del tablero
     ==================================================================== */
  function iniciar(opciones) {
    m = opciones.modelo;
    if (opciones.alCambiar) ganchos.alCambiar = opciones.alCambiar;
    if (opciones.alPanel) ganchos.alPanel = opciones.alPanel;
    if (opciones.zoom) zoom = opciones.zoom;
    $axis = document.getElementById('axis'); $rows = document.getElementById('rows');
    $cables = document.getElementById('cables'); $canvas = document.getElementById('canvas');
    $nombres = document.getElementById('saltosNombres');
    if (!$nombres) { $nombres = document.createElement('div'); $nombres.id = 'saltosNombres'; $cables.after($nombres); }
    $board = document.getElementById('board'); $panel = document.getElementById('panel');
    $menu = document.getElementById('menu'); $tip = document.getElementById('tip');
    $aviso = document.getElementById('aviso'); $celda = document.getElementById('celda');

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('click', onClick);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('dblclick', onDblClick);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('keydown', onKeyNombre, true);
    document.addEventListener('input', onInput);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mouseout', onMouseOut);
    document.addEventListener('keydown', onKeyDown);
    const u = document.getElementById('undoBtn'), r = document.getElementById('redoBtn');
    if (u) u.onclick = deshacer;
    if (r) r.onclick = rehacer;

    historial.reiniciar(JSON.stringify(m.datos));
    restaurando = true; render(); restaurando = false;
    botonesHistoria();
  }

  /* Sustituye el tablero entero (abrir un archivo, nuevo tablero): el historial empieza de cero. */
  function cargar(datos) {
    m.cargar(datos); sel = null; cerrarMenu();
    historial.reiniciar(JSON.stringify(m.datos));
    restaurando = true; render(); restaurando = false;
    botonesHistoria();
  }

  T.tablero = {
    iniciar, render, cargar, deshacer, rehacer, avisar, confirmar,
    modelo: () => m,
    seleccion: () => sel,
    /* para ClapCraft: sus controles del carril (selector, color, etiqueta) interceptan el puntero; desde ahí también se reordena */
    arrastrarFila: (e, lineaId) => empezarArrastreFila(e, lineaId),
    acabaDeReordenar: () => Date.now() - finFila < 350,
    zoom: v => { if (v !== undefined) { zoom = clamp(+v || 1.7, .5, 18); render(); } return zoom; },   // tope × 3 (Leo, 16-09-2026: «el escalamiento horizontal sigue pareciéndome muy pequeño»; antes 6, y 3 hasta el 15-09)
    /* sin fuera de escena ni camino iluminado (true) o con ellos (false, lo normal) */
    simple: v => { if (v !== undefined && !!v !== simple) { simple = !!v; render(); } return simple; },
    /* Alto de carril (escala vertical), en px: lo escribe en --fila para que el CSS de las filas vaya a la par. El
       aplicado puede ser mayor si los rótulos o las notas no caben (Leo, 16-09-2026: «no importa que crezca el alto»). */
    alto: v => {
      if (v !== undefined) { FILA_BASE = Math.round(clamp(+v || 80, 48, 240)); render(); }
      return FILA_BASE;
    },
    /* Ancho de la columna de tramas. El CSS lo lee de --gutter (css/tramas.css); aquí se usa para
       colocar la marca de cruce, los cables y el ancho del lienzo. */
    gutter: v => {
      if (v !== undefined) {
        GUTTER = Math.round(clamp(+v || 190, 40, 420));
        document.documentElement.style.setProperty('--gutter', GUTTER + 'px');
        if (m) render();
      }
      return GUTTER;
    },
    /* El panel del nodo abajo, de borde a borde, con asa para agrandarlo (ClapCraft; en Personajes va al lado).
       `panelPlegado` tiene que salir aquí: app.js lo llama al arrancar para devolverlo contraído como se dejó, y sin
       exportar reventaba el arranque entero (Leo, 16-09-2026: «ya no funciona nada»). */
    panelAbajo, panelAlto, panelPlegado,
  };
})(window.Tramas);
