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
  let FILA = medida('--fila', 120);                // el alto de carril se puede cambiar: T.tablero.alto()
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
    cerrar: svg('<path d="M4.4 4.4l7.2 7.2M11.6 4.4l-7.2 7.2"/>'), borrar: svg('<path d="M3.2 4.8h9.6M6.4 4.8V3.2h3.2v1.6"/><path d="M4.8 4.8l.6 8.4h5.2l.6-8.4"/>') };
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
  const ganchos = { alCambiar: () => {} };

  let $nombres;                          // capa con el nombre de cada salto sobre su trazo (Leo, 15-09-2026)
  let $axis, $rows, $cables, $canvas, $board, $panel, $menu, $tip, $aviso, $celda;

  /* ---------- geometría: celdas → píxeles (única capa que conoce píxeles) ---------- */
  const G = () => BASE * zoom;
  const totalW = () => m.totalCeldas() * G();
  const anchoDe = a => a.celdas * G();
  const offsetDe = actoId => m.celdasAntes(actoId) * G();
  const xDe = p => m.cg(p) * G();
  const filaDe = lineaId => m.datos.lineas.findIndex(l => l.id === lineaId);
  const yFila = lineaId => EJE + filaDe(lineaId) * FILA + FILA / 2;
  const yDe = p => yFila(p.lineaId);
  // borde izquierdo a partir del cual empieza la zona donde sí se puede soltar: el borde derecho de la
  // columna de tramas tal como se ve (si el CSS la contrae, la zona útil empieza antes)
  const zonaUtil = () => {
    const g = $axis && $axis.querySelector('.gutter');
    return g ? g.getBoundingClientRect().right : $board.getBoundingClientRect().left + GUTTER;
  };

  /* ---------- selección ---------- */
  const esSel = (tipo, id) => !!sel && sel.tipo === tipo && sel.id === id;
  function elegir(tipo, id) { sel = { tipo, id }; render(); }
  function limpiarSelDOM() {
    document.querySelectorAll('.pt.sel,.label.sel,.acto.sel,.nota.sel').forEach(x => x.classList.remove('sel'));
  }
  /* Selecciona sin reconstruir el tablero: solo cambia clases, el panel y el recorrido. */
  function seleccionSuave(tipo, id, el) {
    sel = { tipo, id }; limpiarSelDOM();
    if (el) el.classList.add('sel');
    panel(); pintarRuta();
  }
  /* Enseña el aviso de una operación y devuelve si salió bien. */
  function aplicar(r) { if (r && r.aviso) avisar(r.aviso); return !!(r && r.ok); }

  /* ====================================================================
     Render
     ==================================================================== */
  function calcularRuta() {
    ruta = (!simple && sel && sel.tipo === 'punto') ? m.recorrido(sel.id, pres) : null;
  }
  const enRuta = (lineaId, ca, cb) => !!ruta && ruta.incluye(lineaId, ca, cb);

  function render() {
    pres = simple ? SIN_PRESENCIA : m.presencia();
    calcularRuta();
    document.body.classList.toggle('con-ruta', !!ruta);
    const g = G(), W = totalW(), d = m.datos;
    $canvas.style.width = (GUTTER + W + 46) + 'px';

    $axis.innerHTML = `<div class="gutter">Tramas</div>
      <div class="acts" style="width:${W + 46}px">
        ${d.actos.map(a => `<div class="acto${esSel('acto', a.id) ? ' sel' : ''}" data-acto="${a.id}"
             style="left:${offsetDe(a.id)}px;width:${anchoDe(a)}px;background:${fondoActo(a)}">
            <input class="aname" readonly data-acto-nombre="${a.id}" title="Clic: seleccionar · doble clic: renombrar">
            ${d.actos.length > 1 ? `<button class="mini" data-acto-del="${a.id}" title="Eliminar ${esc(m.nombre('acto').toLowerCase())}">×</button>` : ''}
            <span class="handle" data-handle="${a.id}" title="Arrastra para cambiar el ancho"></span></div>`).join('')}
        <button class="add-acto" id="addActo" style="left:${W}px" title="Nuevo ${esc(m.nombre('acto').toLowerCase())}">+</button>
      </div>`;
    d.actos.forEach(a => { $axis.querySelector(`[data-acto-nombre="${a.id}"]`).value = a.nombre; });

    const rejilla = `repeating-linear-gradient(90deg,var(--cuadricula) 0 1px,transparent 1px ${g}px)`;
    const actoSel = sel && sel.tipo === 'acto' ? m.acto(sel.id) : null;

    $rows.innerHTML = '';
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

      // notas ancladas a dos nodos de esta trama
      d.notas.forEach(nt => {
        const a = m.punto(nt.deId), b = m.punto(nt.aId);
        if (!a || !b || a.lineaId !== l.id) return;
        const x1 = Math.min(xDe(a), xDe(b)), x2 = Math.max(xDe(a), xDe(b));
        const el = document.createElement('div');
        el.className = 'nota' + (esSel('nota', nt.id) ? ' sel' : '') + (nt.color ? ' con-color' : '');
        el.dataset.nota = nt.id;
        if (nt.color) { el.style.setProperty('--tc', tono(nt.color)); el.style.setProperty('--tf', `var(--f-${nt.color})`); }   // su tono: trazo y fondo pálido
        el.style.left = x1 + 'px'; el.style.width = Math.max(30, x2 - x1) + 'px';
        const s = document.createElement('span'); s.textContent = nt.texto;
        el.appendChild(s); track.appendChild(el);
      });

      // huecos: bajo la línea, entre dos nodos consecutivos sin nota (doble clic o icono crea una)
      props.forEach((p, i) => {
        const sig = props[i + 1]; if (!sig) return;
        if (m.notaDe(p.id, sig.id)) return;
        const x1 = xDe(p), x2 = xDe(sig); if (x2 - x1 < 44) return;
        const h = document.createElement('div');
        h.className = 'hueco'; h.style.left = x1 + 'px'; h.style.width = (x2 - x1) + 'px';
        h.dataset.tramo = `${p.id}|${sig.id}`;
        h.title = 'Doble clic para poner una nota';
        h.innerHTML = `<button class="add-nota" data-nota-add="${p.id}|${sig.id}" title="Nota entre estos dos puntos">
          <svg viewBox="0 0 14 14"><path d="M1.6 1.8h10.8v7.4H6.2L3.4 12V9.2H1.6z"/></svg></button>`;
        track.appendChild(h);
      });

      // cadena: el hilo de la historia de un nodo al siguiente
      for (let i = 0; i < props.length - 1; i++) {
        const a = props[i], b = props[i + 1], x1 = xDe(a), x2 = xDe(b);
        if (x2 - x1 < 3) continue;
        const ca = m.cg(a), cb = m.cg(b);
        const seg = document.createElement('div');
        seg.className = 'cadena' + (pres.tramoFuera(l.id, ca, cb) ? ' fuera' : '') + (enRuta(l.id, ca, cb) ? ' ruta' : '');
        seg.dataset.ca = ca; seg.dataset.cb = cb;
        seg.style.left = x1 + 'px'; seg.style.width = (x2 - x1) + 'px';
        seg.style.background = tono(l.color); seg.style.color = tono(l.color);
        track.appendChild(seg);
      }

      props.forEach((p, i) => track.appendChild(nodo(p, l, i)));
      $rows.appendChild(row);
      colocarRotulos(row);
    });

    const add = document.createElement('div');
    add.className = 'row add-linea';
    add.innerHTML = `<div class="label"><button id="addLinea"><span class="plus">+</span> Nueva trama</button></div>`;
    $rows.appendChild(add);

    cables();
    panel();
    podarMulti();
    if (!restaurando && !arrastrando()) registrar();
  }

  function podarMulti() { [...multi].forEach(id => { if (!m.punto(id)) multi.delete(id); }); pintarMulti(); }

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

  /* Rótulos de los nodos (rediseño «carpetas y tooltips», 15-09-2026): el nombre va encima del punto; si choca con
     el del nodo anterior, se desdobla debajo del eje (`.abajo`) y, si tampoco cabe ahí, se queda arriba. Una nota
     entre dos nodos cuyo rótulo baja, o demasiado estrecha para leerse, deja en el eje solo su marca y el papel se
     corre a la derecha, unido por una guía discontinua (`.aparte`). Se mide en el DOM: va tras montar la fila. */
  const HOLGURA_ROTULO = 6, NOTA_MINIMA = 48, HUECO_MINIMO = 26;
  function colocarRotulos(row) {
    const track = row.querySelector('.track'); if (!track) return;
    let finArriba = -Infinity, finAbajo = -Infinity;
    const bordes = new Map();                                   // id del nodo → borde derecho de su rótulo
    track.querySelectorAll(':scope > .pt').forEach(el => el.classList.remove('abajo'));
    const pts = Array.from(track.querySelectorAll(':scope > .pt')).map(el => ({ el, p: m.punto(el.dataset.punto) })).filter(x => x.p)
      .sort((a, b) => xDe(a.p) - xDe(b.p));
    pts.forEach(({ el, p }) => {
      const cap = el.querySelector('.cap'), w = cap ? cap.offsetWidth : 0, x = xDe(p), izq = x - w / 2, der = x + w / 2;
      if (!w) return;
      if (izq >= finArriba + HOLGURA_ROTULO) finArriba = der;
      else if (izq >= finAbajo + HOLGURA_ROTULO) { el.classList.add('abajo'); finAbajo = der; }
      else finArriba = Math.max(finArriba, der);
      bordes.set(p.id, der);
    });
    /* las notas: primero las que se quedan en su tramo (son obstáculo), luego las que se corren a un lado, con el
       ancho que les deja libre lo siguiente de debajo del eje (un rótulo que bajó u otra nota) */
    const abajo = [];                                           // [izq, der] de lo que ocupa debajo del eje
    pts.forEach(({ el, p }) => { if (el.classList.contains('abajo')) { const w = el.querySelector('.cap').offsetWidth; abajo.push([xDe(p) - w / 2, xDe(p) + w / 2]); } });
    const notas = Array.from(track.querySelectorAll(':scope > .nota')).map(el => {
      const nt = m.nota(el.dataset.nota), a = nt && m.punto(nt.deId), b = nt && m.punto(nt.aId); if (!a || !b) return null;
      const x1 = Math.min(xDe(a), xDe(b)), x2 = Math.max(xDe(a), xDe(b));
      const bajan = [a, b].filter(q => { const e = track.querySelector(`:scope > .pt[data-punto="${q.id}"]`); return e && e.classList.contains('abajo'); });
      el.querySelectorAll('.nota-guia').forEach(g => g.remove());
      /* un rótulo que bajó de otro nodo recorta la nota por la derecha; si no le deja sitio para leerse, se corre */
      const choca = Math.min(Infinity, ...abajo.filter(([i, d]) => d > x1 && i < x2).map(([i]) => i - 4));
      const fin = Math.min(x2, choca);
      return { el, x1, x2, fin, bajan, aparte: bajan.length > 0 || fin - x1 < NOTA_MINIMA };
    }).filter(Boolean);
    notas.forEach(n => {
      n.el.classList.toggle('aparte', n.aparte);
      n.el.style.maxWidth = '';
      if (!n.aparte) { const w = Math.max(30, n.fin - n.x1); n.el.style.left = n.x1 + 'px'; n.el.style.width = w + 'px'; abajo.push([n.x1, n.x1 + w]); }
    });
    /* dos notas corridas seguidas no se pisan: cada una acaba antes de donde empieza la siguiente y empieza tras la anterior */
    const apartes = notas.filter(n => n.aparte).sort((a, b) => a.x1 - b.x1);
    apartes.forEach(n => { n.izq = Math.max(n.x2, ...n.bajan.map(q => bordes.get(q.id) || 0)) + 14; });   // a la derecha del rótulo que bajó
    let finAnterior = -Infinity;
    apartes.forEach((n, k) => {
      const marca = (n.x1 + n.x2) / 2;
      const izq = Math.max(n.izq, finAnterior + 8);
      const siguiente = apartes[k + 1] ? apartes[k + 1].izq : Infinity;
      const sig = Math.min(siguiente, ...abajo.filter(([i, d]) => d > izq && i >= izq - 1).map(([i]) => i));
      const ancho = Math.max(44, Math.min(210, sig - izq - 8));
      n.el.style.left = izq + 'px'; n.el.style.width = ''; n.el.style.maxWidth = ancho + 'px';
      finAnterior = izq + Math.min(ancho, n.el.offsetWidth);
      abajo.push([izq, finAnterior]);
      n.el.insertAdjacentHTML('afterbegin', `<i class="nota-guia nota-marca" style="left:${marca - izq}px"></i>`
        + `<i class="nota-guia nota-guia-v" style="left:${marca - izq}px"></i><i class="nota-guia nota-guia-h" style="left:${marca - izq}px;width:${izq - marca}px"></i>`);
    });
    /* los huecos para poner nota (debajo del eje): un rótulo que bajó o una nota corrida se pintaban encima y tapaban el
       botón (Leo, 15-09-2026). Cada hueco ocupa el trozo libre más ancho de su tramo; si ninguno da para el botón, el
       primer sitio libre a su derecha, sin pisar el hueco anterior. */
    const tapan = abajo.map(([i, d]) => [i - 4, d + 4]).sort((a, b) => a[0] - b[0]);
    let finHueco = -Infinity;
    Array.from(track.querySelectorAll(':scope > .hueco')).map(h => {
      const [d, a] = (h.dataset.tramo || '').split('|'), p = m.punto(d), q = m.punto(a);
      return p && q ? { h, x1: xDe(p), x2: xDe(q) } : null;
    }).filter(Boolean).sort((a, b) => a.x1 - b.x1).forEach(({ h, x1, x2 }) => {
      let ini = Math.max(x1, finHueco), mejor = null;
      const probar = (i, f) => { if (f - i > (mejor ? mejor[1] - mejor[0] : 0)) mejor = [i, f]; };
      tapan.forEach(([i, f]) => { if (f <= ini || i >= x2) return; probar(ini, Math.min(i, x2)); ini = Math.max(ini, f); });
      if (ini < x2) probar(ini, x2);
      if (!mejor || mejor[1] - mejor[0] < HUECO_MINIMO) {
        let pos = Math.max(x1, finHueco);
        for (const [i, f] of tapan) { if (f <= pos) continue; if (i - pos >= HUECO_MINIMO) break; pos = f; }
        mejor = [pos, pos + HUECO_MINIMO];
      }
      h.style.left = mejor[0] + 'px'; h.style.width = (mejor[1] - mejor[0]) + 'px';
      finHueco = mejor[1];
    });
  }

  /* Saltos: unión estrictamente vertical entre dos extremos en la misma celda. */
  function cables() {
    const H = EJE + m.datos.lineas.length * FILA + 90;
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
      nombres += `<div class="salto-nombre${seleccionado ? ' sel' : ''}" data-salto="${s.id}" data-salto-nombre="${s.id}" style="left:${x}px;top:${(y1 + y2) / 2}px;opacity:${op};--c:${col}" title="${esc(titulo)}">${esc(titulo)}</div>`;
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
  let marq = null, bloque = null, soltarClic = false;
  /* Reordenar tramas (Leo, 15-09-2026): se arrastra su etiqueta en la columna; la fila sigue al puntero y una raya marca dónde cae.
     En el tablero de un personaje (simple) su carril principal no se mueve y nada pasa por encima de él. */
  let filaArr = null, finFila = 0;
  const arrastrando = () => !!(arr || res || mov || cel || notaArr || (marq && marq.activo) || bloque || (filaArr && filaArr.activo));
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
    /* la barra de la selección: cuántos hay, eliminarlos y soltarlos (abajo, en el centro del tablero) */
    let barra = document.getElementById('multiBarra');
    const n = [...multi].filter(id => m.punto(id)).length;
    if (!n || !$board) { if (barra) barra.remove(); return; }
    if (!barra) { barra = document.createElement('div'); barra.id = 'multiBarra'; barra.className = 'multi-barra'; document.body.appendChild(barra); }
    barra.innerHTML = `<span>${n === 1 ? '1 elegido' : n + ' elegidos'}</span><button type="button" class="peligro" data-multi-borrar>Eliminar</button><button type="button" data-multi-soltar title="Soltar la selección (Esc)">Soltar</button>`;
    const r = $board.getBoundingClientRect();
    barra.style.left = (r.left + r.width / 2) + 'px'; barra.style.top = (r.bottom - 52) + 'px';
  }
  function limpiarMulti() { if (!multi.size) return; multi.clear(); pintarMulti(); }
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

    /* la etiqueta de una trama se arrastra para reordenar (un clic seco sigue eligiéndola; en un campo que se edita, no) */
    const etiqueta = e.target.closest && e.target.closest('#board .row[data-linea] > .label');
    if (etiqueta && !e.target.closest('.mini, button, input:not([readonly]), .per-combo, .per-color, .per-etq') && empezarArrastreFila(e, etiqueta.parentElement.dataset.linea)) return;

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
      e.preventDefault();                                      // sin seleccionar texto al arrastrar (el clic seco sigue llegando)
      return;
    }
    if (multi.size && !(e.target.closest && e.target.closest('#menu, aside, .multi-barra, #dlg'))) limpiarMulti();

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
      notaArr = { id: nt0.dataset.nota, movido: false, origen: n0 ? [n0.deId, n0.aId] : null, desplazada: null };
      if (bajoNota) seleccionSuave('nota', nt0.dataset.nota, nt0);   // el clic cayó en el «+»: no llegará a la nota
      nt0.classList.add('arrastrando');
      e.preventDefault(); return;
    }
    // un nodo
    const dot = e.target.closest && e.target.closest('.dot');
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
      bloque.dc = Math.round(dx / G()); bloque.dl = Math.round(dy / FILA);
      /* vista previa: el bloque (con las parejas de sus saltos) y sus trazos se desplazan; el modelo se mueve al soltar */
      const ids = new Set(bloque.ids); bloque.ids.forEach(id => { const q = m.parejaDe(id); if (q) ids.add(q.id); });
      const tx = bloque.dc * G(), ty = bloque.dl * FILA;
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
      let par = null;
      for (let i = 0; i < props.length - 1; i++)
        if (px >= xDe(props[i]) && px <= xDe(props[i + 1])) { par = [props[i], props[i + 1]]; break; }
      if (!par) return;                                       // fuera de todo tramo: no se mueve
      if (!colocarNotaArrastrada(par)) return;                // el mismo tramo, o no cabe
      notaArr.movido = true; render();
      const vivo = document.querySelector(`[data-nota="${notaArr.id}"]`);
      if (vivo) vivo.classList.add('arrastrando');
      return;
    }
    if (cel) {
      const rc = $canvas.getBoundingClientRect();
      const x = GUTTER + (m.celdasAntes(cel.actoId) + cel.celda) * G();
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
      const pos = m.ubicarCelda((e.clientX - r.left - GUTTER) / G());
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
    const pos = m.ubicarCelda((e.clientX - r.left) / G());
    arr.destino = destino; arr.pos = pos;
    arr.el.style.left = ((m.celdasAntes(pos.actoId) + pos.celda) * G()) + 'px';
    previaIntercambio(arr.p, destino.dataset.linea, pos);
  }

  /* Una nota arrastrada sobre un tramo (Leo, 15-09-2026: como los nodos, se reordenan): si el tramo tiene otra nota, esa pasa
     al tramo de donde salió la arrastrada; al seguir arrastrando, la que se apartó vuelve a su tramo. Devuelve si cambió algo. */
  function colocarNotaArrastrada(par) {
    const n = m.nota(notaArr.id); if (!n) return false;
    const mismo = (x, a, b) => (x.deId === a && x.aId === b) || (x.deId === b && x.aId === a);
    if (mismo(n, par[0].id, par[1].id)) return false;
    const antes = JSON.stringify(m.datos.notas.map(x => [x.deId, x.aId]));
    /* primero se deshace lo apartado y la nota vuelve a su tramo de origen */
    if (notaArr.desplazada && m.nota(notaArr.desplazada)) m.intercambiarNotas(notaArr.id, notaArr.desplazada);
    notaArr.desplazada = null;
    if (notaArr.origen && !mismo(n, notaArr.origen[0], notaArr.origen[1])) m.moverNota(notaArr.id, notaArr.origen[0], notaArr.origen[1]);
    if (!mismo(n, par[0].id, par[1].id)) {
      const r = m.moverNota(notaArr.id, par[0].id, par[1].id, { intercambiar: true });
      if (r.ok && r.intercambio) notaArr.desplazada = r.intercambio.id;
    }
    return JSON.stringify(m.datos.notas.map(x => [x.deId, x.aId])) !== antes;
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
      if (hubo) { soltarClic = true; setTimeout(() => { soltarClic = false; }, 0); if (multi.size) { sel = null; limpiarSelDOM(); panel(); pintarRuta(); } pintarMulti(); }
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
     Panel lateral: solo lo que necesita espacio para escribir
     ==================================================================== */
  function panel() {
    const abre = sel && ['punto', 'linea', 'acto'].includes(sel.tipo);
    document.body.classList.toggle('con-panel', !!abre);
    if (!abre) { $panel.innerHTML = ''; return; }

    if (sel.tipo === 'punto') {
      const p = m.punto(sel.id); if (!p) { sel = null; return panel(); }
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
        <div class="panel-pista"><span>Supr elimina</span><span>Esc cierra</span></div>`;
      $panel.querySelector('#fTitulo').value = p.titulo;
      $panel.querySelector('#fNota').value = p.descripcion;
      $panel.querySelector('#fTitulo').oninput = e => { m.editarPunto(p.id, { titulo: e.target.value }); rapido(p); tocar(); };
      $panel.querySelector('#fNota').oninput = e => { m.editarPunto(p.id, { descripcion: e.target.value }); tocar(); };
      /* (Leo, 14-09-2026: el panel ya no lleva «Estado»; descartar sigue en el menú del nodo) */
      $panel.querySelector('#bBorrar').onclick = () => pedirBorrarPunto(p.id);
    }

    if (sel.tipo === 'linea') {
      const l = m.linea(sel.id); if (!l) { sel = null; return panel(); }
      $panel.innerHTML = `
        <div class="panel-cabecera"><h2>${esc(m.nombre('linea'))}</h2>
          <button class="mini" data-panel-cerrar title="Cerrar el panel (Esc)">×</button></div>
        <div class="field"><label>Nombre</label><input type="text" id="fNombre"></div>
        <div class="field"><label>Tipo</label>
          ${l.tipo === 'principal' ? '<p class="empty" style="font-size:12.5px;margin:0">Es la trama principal: el hilo del que parte la historia. No se elimina ni cambia de tipo.</p>' : `
          <div class="chips">
            ${['secundaria', 'alterna'].map(t => `<button class="btn${l.tipo === t ? ' on' : ''}" data-tipo="${l.id}|${t}">${ETIQUETA[t]}</button>`).join('')}
          </div>`}
        </div>
        <div class="field"><label>Color</label><div class="swatches">
          ${PALETA.map(c => `<button class="sw${l.color === c.id ? ' on' : ''}" data-lcolor="${l.id}|${c.id}" style="background:${tono(c.id)}" title="${c.label}"></button>`).join('')}
        </div></div>
        <button class="btn act-btn${l.cortada ? ' on' : ''}" id="bCortar">${l.cortada ? 'Descartada ✓' : 'Marcar como descartada'}</button>
        ${l.tipo === 'principal' ? '' : '<button class="btn act-btn danger" id="bBorrar">Eliminar trama</button>'}`;
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
          <button class="mini" data-panel-cerrar title="Cerrar el panel (Esc)">×</button></div>
        <div class="field"><label>Nombre</label><input type="text" id="fNombre"></div>
        <div class="field"><label id="lAncho">Ancho: ${a.celdas} celdas</label>
          <input type="range" id="fAncho" min="${MIN_CELDAS}" max="${MAX_CELDAS}" step="1" value="${a.celdas}"></div>
        <div class="field"><label>Fondo del ${esc(m.nombre('acto').toLowerCase())}</label><div class="swatches">
          ${FONDOS.map(f => `<button class="sw${T.fondoEfectivo(a, m.datos.actos.indexOf(a)) === f.id ? ' on' : ''}" data-fondo="${a.id}|${f.id}"
            title="${f.label}${!a.fondo && T.fondoEfectivo(a, m.datos.actos.indexOf(a)) === f.id ? ' (automático)' : ''}" style="background:${fondo(f.id)};${f.id === 'ninguno' ? 'border:1px dashed var(--regla-fuerte)' : ''}"></button>`).join('')}
        </div></div>
        ${m.datos.actos.length > 1 ? `<button class="btn act-btn danger" id="bBorrar">Eliminar ${esc(m.nombre('acto').toLowerCase())}</button>` : ''}`;
      $panel.querySelector('#fNombre').value = a.nombre;
      $panel.querySelector('#fNombre').oninput = e => {
        m.editarActo(a.id, { nombre: e.target.value });
        const i = $axis.querySelector(`[data-acto-nombre="${a.id}"]`); if (i) i.value = a.nombre; tocar();
      };
      $panel.querySelector('#fAncho').oninput = e => { m.fijarAncho(a.id, +e.target.value); render(); };
      const bb = $panel.querySelector('#bBorrar');
      if (bb) bb.onclick = () => pedirBorrarActo(a.id);
    }
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

    if (cl('[data-panel-cerrar]')) { sel = null; render(); return; }
    const hn = cl('[data-hilo]');
    if (hn) { if (hn.dataset.hilo) irANodo(hn.dataset.hilo); return; }
    const nc = cl('[data-ncolor]');                            // el color de una nota (Leo, 15-09-2026)
    if (nc) {
      const [id, c] = nc.dataset.ncolor.split('|');
      if (aplicar(m.colorearNota(id, c || null))) { render(); const n = m.nota(id), el = document.querySelector(`#board [data-nota="${CSS.escape(id)}"]`); if (n && el) menuNota(n, el); }
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
    if (cl('[data-multi-borrar]')) { pedirBorrarVarios([...multi]); return; }
    if (cl('[data-multi-soltar]')) { limpiarMulti(); return; }
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
    const na = cl('[data-nota-add]');
    if (na) { const [d, a] = na.dataset.notaAdd.split('|'); ponerNota(d, a); return; }
    const nt = cl('[data-nota]');
    if (nt) { seleccionSuave('nota', nt.dataset.nota, nt); return; }
    const ld = cl('[data-linea-del]');
    if (ld) { pedirBorrarLinea(ld.dataset.lineaDel); return; }
    const ad = cl('[data-acto-del]');
    if (ad) { pedirBorrarActo(ad.dataset.actoDel); return; }
    if (cl('[data-punto]')) return;                            // ya quedó seleccionado en pointerdown
    const lab = cl('.label');
    if (lab && lab.parentElement.dataset.linea && !cl('.mini') && !t.matches('.lname')) {
      elegir('linea', lab.parentElement.dataset.linea); return;
    }
    const ac = cl('[data-acto]');
    if (ac && !cl('.mini') && !t.matches('.aname')) { elegir('acto', ac.dataset.acto); return; }

    // clic en blanco: se suelta la selección y se cierra el panel
    if (cl('aside') || cl('header') || cl('#menu')) return;
    if (t.matches && t.matches('.lname,.aname,.cap-edit,.nota-edit')) return;
    if (sel) { sel = null; render(); }
  }

  function onContextMenu(e) {
    const cl = s => e.target.closest && e.target.closest(s);
    const pt = cl('[data-punto]');
    if (pt) {
      const q = m.punto(pt.dataset.punto); if (!q) return;
      e.preventDefault(); cerrarMenu();
      seleccionSuave('punto', q.id, pt);
      menuNodo(q, pt); return;
    }
    const nt = cl('[data-nota]');
    if (nt) {
      const n = m.nota(nt.dataset.nota); if (!n) return;
      e.preventDefault(); cerrarMenu();
      seleccionSuave('nota', n.id, nt);
      menuNota(n, nt); return;
    }
    const sl = cl('[data-salto]');
    if (sl) {
      const x = m.salto(sl.dataset.salto); if (!x) return;
      e.preventDefault(); cerrarMenu();
      sel = { tipo: 'salto', id: x.id }; render();
      menuSalto(x, e.clientX, e.clientY);
    }
  }

  function onDblClick(e) {
    cerrarMenu();
    const cl = s => e.target.closest && e.target.closest(s);
    const hu = cl('.hueco');
    if (hu && hu.dataset.tramo && !cl('.add-nota')) { const [d, a] = hu.dataset.tramo.split('|'); ponerNota(d, a); return; }
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
    abrirMenuCrear(e.clientX, e.clientY, track.dataset.linea, m.ubicarCelda((e.clientX - r.left) / G()));
  }

  /* Crea la nota y la deja lista para escribir encima, sin pasar por el panel. */
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
    inp.addEventListener('blur', () => fin(false));                       // un clic fuera sale sin cambiar (Leo): guarda solo Enter
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
    if (nm.dataset.antes !== undefined && nm.value !== nm.dataset.antes) { nm.value = nm.dataset.antes; onInput({ target: nm }); }   // sin Enter: como estaba
    delete nm.dataset.antes; nm.readOnly = true;
    try { nm.setSelectionRange(0, 0); } catch (_) {}                         // sin texto marcado al salir
  }
  /* Enter guarda el nombre de una trama o un acto; Esc lo deja como estaba (lo deshace al salir) */
  function onKeyNombre(e) {
    const nm = e.target.closest && e.target.closest('.lname,.aname');
    if (!nm || nm.readOnly) return;
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); if (!nm.value.trim()) { nm.blur(); return; } delete nm.dataset.antes; nm.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); nm.blur(); }
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
  function menuNodo(p, el) {
    const s = m.saltoDe(p.id);
    const html = (s ? `<div class="mt">${esc(m.forma(s.tipo))}</div>${simple ? '' : opcionesSalto(s) + '<div class="sep"></div>'}`
      : `<div class="mt">${esc(m.nombre('nodo'))}</div>
         <div class="colores">
           ${PALETA.map(c => `<button class="sw${p.color === c.id ? ' on' : ''}" data-mcolor="${p.id}|${c.id}" style="background:${tono(c.id)}" title="${c.label}"></button>`).join('')}
           <button class="sw hereda${p.color ? '' : ' on'}" data-mcolor="${p.id}|" title="Hereda el color de la trama">trama</button>
         </div><div class="sep"></div>
         <button data-mcortar="${p.id}"><span class="ic" style="border:1.5px dashed var(--tenue);background:none"></span>${p.cortado ? 'Quitar el descarte' : 'Descartar'}</button>`)
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
  function menuNota(n, el) {
    const r = el.getBoundingClientRect();
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
    const pos = m.ubicarCelda((e.clientX - r.left) / G());
    const id = tr.dataset.linea;
    if (m.datos.puntos.some(p => p.lineaId === id && p.actoId === pos.actoId && p.celda === pos.celda)) {
      $celda.classList.remove('show'); celdaObj = null; return;
    }
    celdaObj = { lineaId: id, actoId: pos.actoId, celda: pos.celda };
    $celda.style.left = (GUTTER + (m.celdasAntes(pos.actoId) + pos.celda) * G()) + 'px';
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
    if ((e.key === 'Delete' || e.key === 'Backspace') && multi.size) { e.preventDefault(); return pedirBorrarVarios([...multi]); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
      e.preventDefault();
      if (sel.tipo === 'punto') return pedirBorrarPunto(sel.id);
      if (sel.tipo === 'salto') return pedirBorrarSalto(sel.id);
      if (sel.tipo === 'linea') return pedirBorrarLinea(sel.id);
      if (sel.tipo === 'acto') return pedirBorrarActo(sel.id);
      if (sel.tipo === 'nota') return pedirBorrarNota(sel.id);
    }
    if (e.key === 'Escape') { cerrarMenu(); limpiarMulti(); if (sel) { sel = null; render(); } }
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
    zoom: v => { if (v !== undefined) { zoom = clamp(+v || 1.7, .5, 6); render(); } return zoom; },   // máximo doblado (Leo, 15-09-2026: el de antes se quedaba corto)
    /* sin fuera de escena ni camino iluminado (true) o con ellos (false, lo normal) */
    simple: v => { if (v !== undefined && !!v !== simple) { simple = !!v; render(); } return simple; },
    /* Alto de carril (escala vertical), en px: lo escribe en --fila para que el CSS de las filas vaya a la par. */
    alto: v => {
      if (v !== undefined) { FILA = Math.round(clamp(+v || 80, 48, 240)); document.documentElement.style.setProperty('--fila', FILA + 'px'); render(); }
      return FILA;
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
    }
  };
})(window.Tramas);
