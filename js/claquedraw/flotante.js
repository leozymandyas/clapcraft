/* Claquedraw · el panel flotante de nodos y notas
   Nació en la tira del editor (1.1.36, Leo: «quiero poder agregar, editar, eliminar nodos y notas desde la línea del tiempo del
   editor… quizás un panel flotante que me deje agregar y editar los textos y descripción… incluso si hay varias notas en un mismo
   nodo o raya») y desde la 1.1.37 lo usa también el tablero del esquema **al crear** un nodo o una nota (Leo: «te quedó excelente
   ese panel flotante; impleméntalo en el esquema, pero que no desaparezca el inferior, sino que convivan»; «el panel solo aparece
   en la creación, con un clic; si el nodo o la nota ya existen, se abre el panel inferior»).
   Enseña un **nodo** (título —en un salto, el de sus dos extremos—, descripción con formato, js/mdvivo.js, sus notas y la
   papelera) o un **lugar** de una trama (sus notas y, donde se pida, «＋ Nodo aquí»). Un lugar es un enlace `{ lineaId, a, b }`
   (entre dos nodos seguidos), una raya `{ lineaId, col }` (la de esa columna, como en el tablero) o un lado de la tira `{ lineaId,
   lado: 'inicio' | 'fin' | 'vacia' }` (todas las rayas de delante del primer nodo o de detrás del último). Quien lo abre le da un
   contexto: `modelo()`, `alCambiar()` (repintar y guardar), `anclaDe(que)` (el elemento junto al que va), `marcar(que)` (señalar
   lo abierto), `dentro(el)` (clics que no lo cierran), `avisar` y `conNodo` (si un lugar ofrece crear un nodo). Aquí no se crean
   cuadros ni rombos. Un solo panel para toda la página: abrir otro cambia su contenido.
   **El color, solo al crear** (1.1.37, Leo: «solo se necesita en ese panel un selector de color al momento de crear, tanto en el
   esquema como en el editor»): un nodo recién creado (`que.nuevo`) lleva bajo su título los tonos de la paleta y «trama»; una nota
   recién creada (`nuevas`, las creadas mientras el panel sigue abierto), los suyos y «papel». Lo que ya existía no los enseña. */
(function (C) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICONO_BORRAR = '<svg width="14" height="14" aria-hidden="true"><use href="#ic-trash"></use></svg>';
  const ICONO_CERRAR = '<svg width="13" height="13" aria-hidden="true"><use href="#ic-close"></use></svg>';
  const ICONO_ENLACE = '<svg width="14" height="14" aria-hidden="true"><use href="#ic-link"></use></svg>';
  /* «Copiar enlace para Claude» (1.1.52): lo que tiene el panel —y cada nota— lleva su botón si quien lo abre sabe hacer enlaces */
  const botonEnlace = () => (ctx && ctx.copiarEnlace ? `<button type="button" class="icono" data-flot-enlace title="Copiar enlace para Claude (Cmd+Shift+C)" aria-label="Copiar enlace para Claude">${ICONO_ENLACE}</button>` : '');
  let que = null, ctx = null, el = null;
  let nuevas = new Set();                                         // notas creadas con este panel abierto: llevan su color
  const paleta = () => (window.Tramas && Tramas.PALETA) || [];
  const colores = (dato, actual, heredar, tono) => `<div class="hilo-flot-colores">`
    + `<button type="button" class="sw ${heredar === 'papel' ? 'papel' : 'trama'}${actual ? '' : ' on'}"${tono ? ` style="--tc:${tono}"` : ''} ${dato}="" title="${heredar === 'papel' ? 'Papel de nota' : 'El de su trama'}" aria-label="${heredar === 'papel' ? 'Papel de nota' : 'El de su trama'}"></button>`
    + paleta().map(c => `<button type="button" class="sw${actual === c.id ? ' on' : ''}" ${dato}="${c.id}" style="background:var(--t-${c.id})" title="${esc(c.label)}" aria-label="${esc(c.label)}"></button>`).join('') + '</div>';

  const confirmar = (texto, boton) => (window.Tramas && Tramas.tablero && Tramas.tablero.confirmar) ? Tramas.tablero.confirmar(texto, boton) : Promise.resolve(window.confirm(texto));
  const avisar = (t, accion) => { if (ctx && ctx.avisar && t) ctx.avisar(t, accion); };
  /* Lo que se borra desde aquí se puede devolver desde su aviso (1.1.42, Leo: «lo del deshacer aplica para los elementos de los
     esquemas»): se guarda cómo estaba el esquema y el botón lo repone. */
  const instantanea = () => (window.Tramas && Tramas.tablero && Tramas.tablero.instantanea ? Tramas.tablero.instantanea() : '');
  const deshacer = antes => (antes ? { texto: 'Deshacer', fn: () => { Tramas.tablero.restaurar(antes); cambio(); } } : null);
  const mismoLugar = (a, b) => !!a && !!b && a.lineaId === b.lineaId && (a.a || null) === (b.a || null) && (a.b || null) === (b.b || null)
    && (a.lado || null) === (b.lado || null) && (a.col ?? null) === (b.col ?? null);

  /* ---------- lugares ---------- */
  /* las notas de un lugar: las de su enlace y las de las rayas de entre sus dos nodos; las de su raya; o las de las rayas de ese lado */
  function notasDelLugar(m, L) {
    const todas = m.notasDeLinea(L.lineaId), pa = L.a && m.punto(L.a), pb = L.b && m.punto(L.b);
    if (pa && pb) { const ca = m.cg(pa), cb = m.cg(pb); return todas.filter(n => n.abierta ? m.colNota(n) >= ca && m.colNota(n) < cb : n.deId === pa.id && n.aId === pb.id); }
    if (L.col !== undefined && L.col !== null) return todas.filter(n => n.abierta && m.colNota(n) === L.col);
    const ps = m.puntosDe(L.lineaId);
    if (L.lado === 'fin' && ps.length) { const c = m.cg(ps[ps.length - 1]); return todas.filter(n => n.abierta && m.colNota(n) >= c); }
    if (L.lado === 'inicio' && ps.length) { const c = m.cg(ps[0]); return todas.filter(n => n.abierta && m.colNota(n) < c); }
    return todas.filter(n => n.abierta);
  }
  /* ¿sigue existiendo? (sus nodos, y siguen seguidos) */
  function lugarVivo(m, L) {
    if (!m || !m.linea(L.lineaId)) return false;
    if (L.a || L.b) { const pa = m.punto(L.a), pb = m.punto(L.b), sig = pa && m.siguienteEnTrama(pa.id); return !!pb && !!sig && sig.id === pb.id; }
    return true;
  }
  function nuevaNotaEn(m, L) {
    const pa = L.a && m.punto(L.a), pb = L.b && m.punto(L.b);
    if (pa && pb) return m.crearNota(pa.id, pb.id, '');
    if (L.col !== undefined && L.col !== null) return m.crearNotaAbierta(L.lineaId, L.col, '');
    const ps = m.puntosDe(L.lineaId);
    const col = L.lado === 'fin' && ps.length ? m.cg(ps[ps.length - 1]) : L.lado === 'inicio' && ps.length ? Math.max(0, m.cg(ps[0]) - 1) : 0;
    return m.crearNotaAbierta(L.lineaId, col, '');
  }
  /* un nodo (normal: aquí no se crean relaciones) en el lugar; si no cabe entre sus dos nodos, se abre una columna */
  function nodoEn(m, L) {
    const pa = L.a && m.punto(L.a), pb = L.b && m.punto(L.b), ps = m.puntosDe(L.lineaId);
    let col;
    if (pa && pb) {
      const a = m.cg(pa), b = m.cg(pb);
      if (b - a > 1) col = Math.floor((a + b) / 2); else { m.insertarColumnas(a, 1, 'derecha'); col = a + 1; }
    } else if (L.col !== undefined && L.col !== null) col = L.col + 1;
    else if (L.lado === 'fin' && ps.length) col = m.cg(ps[ps.length - 1]) + 1;
    else if (L.lado === 'inicio' && ps.length) { const f = m.cg(ps[0]); if (f > 0) col = f - 1; else { m.insertarColumnas(0, 1, 'izquierda'); col = 0; } }
    else col = 0;
    m.asegurarCeldas(col);
    const r = m.nuevoPunto(L.lineaId, col, {});
    if (!r.ok) { avisar(r.aviso); return null; }
    return r.punto;
  }
  /* el lugar de una nota: el de su nodo es el nodo; el de un enlace, el enlace; el de una raya, la raya */
  function sitioDeNota(m, n) {
    if (n.abierta) return { tipo: 'lugar', lugar: { lineaId: m.lineaDeNota(n), col: m.colNota(n) } };
    if (!n.aId) return { tipo: 'nodo', id: n.deId };
    return { tipo: 'lugar', lugar: { lineaId: m.punto(n.deId).lineaId, a: n.deId, b: n.aId } };
  }

  /* ---------- el panel ---------- */
  /* ¿es lo mismo que está abierto? (lo mismo, no la misma nota señalada) */
  const mismoQue = (a, b) => !!a && !!b && a.tipo === b.tipo && (a.tipo === 'lugar' ? mismoLugar(a.lugar, b.lugar) : a.id === b.id);
  function abrir(q, ancla, c) {
    const mismo = mismoQue(que, q);
    if (!mismo && que) limpiar();
    if (!mismo) nuevas = new Set();
    else if (que.nuevo && !q.nuevo) q.nuevo = true;              // elegirlo otra vez no le quita el color de recién creado
    if (q.notaNueva) nuevas.add(q.notaNueva);
    if (mismo && que.tituloAntes !== undefined) q.tituloAntes = que.tituloAntes;
    que = q; ctx = c || ctx || {};
    if (que.tipo === 'nodo' && que.tituloAntes === undefined) { const mm = ctx.modelo && ctx.modelo(), p = mm && mm.punto(que.id); que.tituloAntes = p ? p.titulo || '' : ''; }
    if (!el) {
      el = document.createElement('div'); el.className = 'hilo-flot'; el.setAttribute('role', 'dialog');
      document.body.appendChild(el);
      el.addEventListener('click', clic);
      el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (menuColor()) cerrarMenu(); else cerrarYVolver(); } });
      el.addEventListener('keydown', teclas, true);             // antes que el Markdown del campo (Enter, Tab)
    }
    oirMarco(); seguirScroll();
    pintar();
    colocar(ancla);
    if (ctx.marcar) ctx.marcar(que);
    enfocar(q.foco);
  }
  /* una nota recién creada: el panel de su nodo o de su lugar, con ella lista para escribir */
  function abrirNota(nid, ancla, c) {
    ctx = c || ctx || {};
    const m = ctx.modelo && ctx.modelo(), n = m && m.nota(nid); if (!n) return;
    abrir(Object.assign(sitioDeNota(m, n), { foco: nid, notaNueva: nid }), ancla, ctx);
  }
  function enfocar(foco) {
    if (!el || !foco) return;
    const t = foco === 'titulo' ? el.querySelector('[data-flot-tit]') : el.querySelector(`[data-flot-nota="${CSS.escape(foco)}"] textarea`);
    if (t) { t.focus({ preventScroll: true }); t.select(); }
  }
  /* Debajo de lo suyo y pegado a ello (1.1.38, Leo: «que no se mueva el panel con el scroll, quiero que permanezca abajo del nodo
     o nota que estoy creando o editando»): se recoloca al desplazar cualquier cosa (`seguirScroll`) y tras cada repintado. Si abajo
     no cabe va encima; si lo suyo sale de la vista (`ctx.area()`, la caja donde se ve), se esconde hasta que vuelva. */
  let anclaActual = null;
  function colocar(ancla) {
    if (ancla) anclaActual = ancla;
    ancla = anclaActual;
    if (!el || !que || !ancla || !ancla.getBoundingClientRect) return;
    if (ancla.isConnected === false) { const a = ctx && ctx.anclaDe && ctx.anclaDe(que); if (!a) return; anclaActual = ancla = a; }
    const r = ancla.getBoundingClientRect(), area = ctx && ctx.area && ctx.area();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const fuera = !r.width && !r.height || (area && (cx < area.left || cx > area.right || cy < area.top || cy > area.bottom));
    el.style.visibility = fuera ? 'hidden' : '';
    if (fuera) return;
    el.style.maxHeight = '';
    const w = el.offsetWidth, h = el.offsetHeight;
    const min = area ? Math.max(8, area.left + 8) : 8;         // sin taparle el menú lateral (la etiqueta de una trama va al borde)
    el.style.left = Math.max(min, Math.min(cx - w / 2, innerWidth - w - 8)) + 'px';
    const abajo = innerHeight - r.bottom - 14, arriba = r.top - 14;
    if (h > abajo && arriba > abajo) {
      const alto = Math.min(h, arriba);
      el.style.top = (r.top - 6 - alto) + 'px'; el.style.maxHeight = alto + 'px';
    } else {
      el.style.top = (r.bottom + 6) + 'px'; el.style.maxHeight = Math.max(120, abajo) + 'px';
    }
  }
  let siguiendo = false, pendiente = 0;
  function seguirScroll() {
    if (siguiendo) return; siguiendo = true;
    const otraVez = () => { if (!que || pendiente) return; pendiente = requestAnimationFrame(() => { pendiente = 0; colocar(); }); };
    document.addEventListener('scroll', otraVez, true);
    addEventListener('resize', otraVez);
  }
  /* lo de fuera cambió (un repintado del tablero, un nombre cambiado en sitio): se vuelve a pintar, salvo mientras se escribe en él */
  function refrescar(ancla) {
    if (!que || !el) return;
    if (!el.contains(document.activeElement)) pintar();
    colocar(ancla || (ctx && ctx.anclaDe && ctx.anclaDe(que)));
  }
  /* cerrado a propósito (Enter, Esc, ×, eliminar): el contexto puede devolver el foco a donde se escribía (la tira, al editor;
     29-09-2026: si no, lo que se tecleaba después se perdía). Con un clic fuera no: ese clic ya se lleva el foco a su sitio. */
  function cerrarYVolver() {
    const c = ctx, abierto = !!que;
    cerrar();
    if (abierto && c && c.volverFoco) c.volverFoco();
  }
  function cerrar() {
    if (!que) return;
    limpiar();
    que = null; nuevas = new Set(); anclaActual = null;
    if (el) { el.hidden = true; el.innerHTML = ''; el.style.visibility = ''; }
    cambio();
    if (ctx && ctx.marcar) ctx.marcar(null);
  }
  /* **Nada vacío** (1.1.39, Leo: «si borro el nombre sugerido y no escribo nada y doy clic fuera del panel, no se debe crear ninguna
     nota o nodo; no se permiten nodos ni notas vacíos»): al cerrar (o al pasar a otra cosa), un nodo recién creado sin título se
     quita, uno que ya existía vuelve a su título de antes, y las notas del panel que se quedaron sin texto se quitan. */
  function limpiar() {
    const m = ctx && ctx.modelo && ctx.modelo(); if (!m || !que || !el) return;
    let quito = false;
    el.querySelectorAll('[data-flot-nota]').forEach(x => {
      const n = m.nota(x.dataset.flotNota);
      if (n && !String(n.texto || '').trim()) { m.borrarNota(n.id); quito = true; }
    });
    if (que.tipo === 'nodo') {
      const p = m.punto(que.id), s = p && m.saltoDe(p.id);
      if (p && !String(p.titulo || '').trim()) {
        if (que.nuevo && !s) { m.borrarPunto(p.id); quito = true; }
        else {
          /* un extremo de salto puede quedarse sin texto (1.1.41: las relaciones nacen sin nombre); un nodo normal recupera el suyo */
          const antes = String(que.tituloAntes || '').trim();
          if (antes || !s) {
            const t = antes || m.nombre('nodo'), pareja = s && (s.deId === p.id ? s.aId : s.deId);
            m.editarPunto(p.id, { titulo: t }); if (pareja) m.editarPunto(pareja, { titulo: t }); quito = true;
          }
        }
      }
    }
    if (quito) cambio();
  }
  /* **El teclado mientras se escribe** (1.1.39, Leo): Enter cierra el panel —y lo que quede vacío no se crea— y Mayús+Enter es
     el salto de renglón; Tab, desde el nodo (con nombre) o desde una nota con texto, abre otra nota lista para escribir; sin
     nombre o sin texto, Tab no hace nada. */
  function teclas(e) {
    if (!que || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target, m = ctx && ctx.modelo && ctx.modelo(); if (!m) return;
    const enTit = t.matches && t.matches('[data-flot-tit]'), enDesc = t.closest && t.closest('[data-flot-desc]'), enNota = t.closest && t.closest('[data-flot-nota]');
    if (!enTit && !enDesc && !enNota) return;
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        if (enTit) { e.preventDefault(); return; }
        if (enDesc) {
          e.preventDefault(); e.stopPropagation(); document.execCommand('defaultParagraphSeparator', false, 'p');
          /* en una viñeta vacía, fuera de la lista (MdVivo.lista, 1.1.60: aunque le queden los \u200B de un atajo) */
          if (!(window.MdVivo && MdVivo.lista && MdVivo.lista(enDesc, { key: 'Enter' }))) document.execCommand('insertParagraph');
        }
        return;                                                   // en una nota, el salto de renglón del campo
      }
      e.preventDefault(); e.stopPropagation(); cerrarYVolver(); return;
    }
    if (e.key === 'Tab' && !e.shiftKey && (que.tipo === 'nodo' || que.tipo === 'lugar')) {
      e.preventDefault(); e.stopPropagation();
      const lleno = enNota ? String(t.value || '').trim() : que.tipo === 'nodo' ? String((m.punto(que.id) || {}).titulo || '').trim() : '1';
      if (!lleno) { const c = enNota ? t : el.querySelector('[data-flot-tit]'); if (c) { c.classList.remove('tiembla'); void c.offsetWidth; c.classList.add('tiembla'); } return; }
      nuevaNota();
    }
  }
  function nuevaNota() {
    const m = ctx && ctx.modelo && ctx.modelo(); if (!m || !que) return;
    const r = que.tipo === 'nodo' ? m.crearNota(que.id, null, '') : nuevaNotaEn(m, que.lugar);
    if (!r || !r.ok) { avisar(r && r.aviso); return; }
    nuevas.add(r.nota.id);
    rehacer(r.nota.id);
  }
  /* ---------- el color de lo que ya existe: el punto abre un menú (1.1.39, Leo: «es difícil cambiar el color de las notas y nodos una
     vez creados; cuando le dé clic al punto de color, que se abra un menú para seleccionar el color») ---------- */
  const menuColor = () => el && el.querySelector('.hilo-flot-menu');
  function cerrarMenu() { const x = menuColor(); if (x) x.remove(); }
  function abrirMenu(boton) {
    const m = ctx && ctx.modelo && ctx.modelo(); if (!m || !que) return;
    cerrarMenu();
    const para = boton.dataset.flotMenuColor;                   // '' = el nodo; si no, la id de la nota
    const esNodo = !para, cosa = esNodo ? m.punto(que.id) : m.nota(para); if (!cosa) return;
    const l = esNodo ? m.linea(cosa.lineaId) : null;
    const menu = document.createElement('div');
    menu.className = 'hilo-flot-menu'; menu.dataset.para = para; menu.setAttribute('role', 'menu');
    menu.innerHTML = `<div class="hilo-flot-sub">Color ${esNodo ? 'del ' + esc(m.nombre('nodo').toLowerCase()) : 'de la nota'}</div>`
      + colores('data-flot-pick', cosa.color, esNodo ? 'trama' : 'papel', l ? 'var(--t-' + esc(l.color) + ')' : '');
    el.appendChild(menu);
    const r = boton.getBoundingClientRect(), f = el.getBoundingClientRect();
    menu.style.left = Math.max(6, Math.min(r.left - f.left - 6, el.clientWidth - menu.offsetWidth - 6)) + 'px';
    menu.style.top = (r.bottom - f.top + el.scrollTop + 6) + 'px';
  }
  /* los puntos y las filas de color, del color que tienen ahora */
  function pintarColores(m) {
    if (!el || !que) return;
    const b = el.querySelector('[data-flot-menu-color=""]'), p = que.tipo === 'nodo' && m.punto(que.id), l = p && m.linea(p.lineaId);
    if (b && p) b.style.setProperty('--nc', 'var(--t-' + (p.color || (l ? l.color : 'azul')) + ')');
    el.querySelectorAll('[data-flot-nota]').forEach(x => {
      const n = m.nota(x.dataset.flotNota), np = x.querySelector('.hilo-np'); if (!n || !np) return;
      np.classList.toggle('papel', !n.color); np.style.setProperty('--nc', n.color ? 'var(--t-' + n.color + ')' : '');
    });
  }
  const cambio = () => { if (ctx && ctx.alCambiar) ctx.alCambiar(); };
  const crecer = t => { t.style.height = 'auto'; t.style.height = Math.min(160, t.scrollHeight + 2) + 'px'; };
  function pintar() {
    const m = ctx && ctx.modelo && ctx.modelo(); if (!que || !m || !el) return;
    el.hidden = false;
    const corto = q => { const t = (q && q.titulo || 'Sin título').trim(); return t.length > 22 ? t.slice(0, 21) + '…' : t; };
    let notas, cab, cuerpo = '';
    if (que.tipo === 'linea' || que.tipo === 'acto') { pintarPieza(m); return; }
    if (que.tipo === 'nodo') {
      const p = m.punto(que.id); if (!p) { cerrar(); return; }
      const s = m.saltoDe(p.id), l = m.linea(p.lineaId);
      cab = (s ? m.forma(s.tipo) : m.nombre('nodo')) + (l ? ' · ' + l.nombre : '');
      cuerpo = `<div class="hilo-flot-fila"><button type="button" class="hilo-flot-punto" data-flot-menu-color="" style="--nc:var(--t-${esc(p.color || (l ? l.color : 'azul'))})" title="Color" aria-label="Color"></button>
        <input type="text" class="hilo-flot-tit" data-flot-tit placeholder="Título" aria-label="Título"></div>
        ${que.nuevo ? colores('data-flot-color', p.color, 'trama', 'var(--t-' + esc(l ? l.color : 'azul') + ')') : ''}
        <div class="hilo-flot-desc md-campo md-texto" data-flot-desc contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="Descripción" data-vacio="Descripción: qué pasa aquí"></div>`;
      notas = m.notasDe(p.id, null).filter(n => !n.abierta && !n.aId);
    } else {
      const L = que.lugar; if (!lugarVivo(m, L)) { cerrar(); return; }
      const l = m.linea(L.lineaId);
      cab = L.a ? 'Entre «' + corto(m.punto(L.a)) + '» y «' + corto(m.punto(L.b)) + '»'
        : L.col !== undefined && L.col !== null ? (l ? l.nombre + ' · ' : '') + 'entre las columnas ' + (L.col + 1) + ' y ' + (L.col + 2)
        : L.lado === 'fin' ? 'Después de «' + corto(m.punto(L.ultimo)) + '»' : L.lado === 'inicio' ? 'Antes de «' + corto(m.punto(L.primero)) + '»' : (l ? l.nombre : 'Trama');
      if (ctx.conNodo) cuerpo = `<button type="button" class="btn hilo-flot-nodo" data-flot-nuevo-nodo>＋ ${esc(m.nombre('nodo'))} aquí</button>`;
      notas = notasDelLugar(m, L);
    }
    el.innerHTML = `<header class="hilo-flot-cab"><span class="hilo-flot-rot"></span><span class="spacer"></span>${botonEnlace()}
        ${que.tipo === 'nodo' ? `<button type="button" class="icono peligro" data-flot-borrar title="Eliminar">${ICONO_BORRAR}</button>` : ''}
        <button type="button" class="icono" data-flot-cerrar title="Cerrar (Esc)" aria-label="Cerrar">${ICONO_CERRAR}</button></header>
      ${cuerpo}
      <div class="hilo-flot-notas"><div class="hilo-flot-sub">${notas.length === 1 ? '1 nota' : notas.length ? notas.length + ' notas' : 'Notas'}</div>
        ${notas.map(n => `<div class="hilo-flot-nota${que.marca === n.id ? ' on' : ''}" data-flot-nota="${esc(n.id)}"><button type="button" class="hilo-np${n.color ? '' : ' papel'}" data-flot-menu-color="${esc(n.id)}"${n.color ? ` style="--nc:var(--t-${esc(n.color)})"` : ''} title="Color" aria-label="Color de la nota"></button><textarea rows="1" spellcheck="true" aria-label="Texto de la nota" placeholder="Escribe la nota"></textarea>
          ${ctx.copiarEnlace ? `<button type="button" class="icono hilo-flot-nota-enlace" data-flot-enlace-nota title="Copiar enlace de la nota para Claude" aria-label="Copiar enlace de la nota">${ICONO_ENLACE}</button>` : ''}<button type="button" class="icono" data-flot-borrar-nota title="Eliminar la nota" aria-label="Eliminar la nota">${ICONO_CERRAR}</button></div>`
          + (nuevas.has(n.id) ? colores(`data-flot-color-nota="${esc(n.id)}" data-c`, n.color, 'papel') : '')).join('')}
        <button type="button" class="hilo-flot-mas" data-flot-nueva-nota>＋ Nota</button></div>`;
    el.querySelector('.hilo-flot-rot').textContent = cab;
    notas.forEach(n => {
      const t = el.querySelector(`[data-flot-nota="${CSS.escape(n.id)}"] textarea`);
      t.value = n.texto || ''; crecer(t);
      t.addEventListener('input', () => { crecer(t); m.editarNota(n.id, t.value); cambio(); });
    });
    if (que.tipo === 'nodo') {
      const p = m.punto(que.id), pareja = (sa => sa && (sa.deId === p.id ? sa.aId : sa.deId))(m.saltoDe(p.id));
      const tit = el.querySelector('[data-flot-tit]'), desc = el.querySelector('[data-flot-desc]');
      tit.value = p.titulo || '';
      tit.addEventListener('input', () => { m.editarPunto(p.id, { titulo: tit.value }); if (pareja) m.editarPunto(pareja, { titulo: tit.value }); cambio(); });
      if (window.MdVivo) { desc.innerHTML = MdVivo.html(p.descripcion); MdVivo.vivo(desc); } else desc.textContent = p.descripcion || '';
      desc.addEventListener('input', () => { m.editarPunto(p.id, { descripcion: window.MdVivo ? MdVivo.md(desc) : desc.innerText }); cambio(); });
    }
  }
  /* **Una trama o un acto** (1.1.38, con el panel de abajo fuera): su nombre y, debajo, lo suyo —el tipo y el color de la trama; lo
     que dura y el fondo del acto—, más descartar la trama y la papelera. Como en el panel de abajo, pero en pequeño. */
  function pintarPieza(m) {
    const T = window.Tramas, esLinea = que.tipo === 'linea';
    const x = esLinea ? m.linea(que.id) : m.acto(que.id); if (!x) { cerrar(); return; }
    let cuerpo = '', borrar = true;
    if (esLinea) {
      const nodos = m.puntosDe(x.id).length, ultima = m.ultimaPrincipal(x.id);
      borrar = !ultima;
      cuerpo = `<div class="hilo-flot-sub">Tipo</div><div class="hilo-flot-chips">${['principal', 'secundaria', 'alterna'].map(t =>
          `<button type="button" class="btn${x.tipo === t ? ' on' : ''}" data-flot-tipo="${t}"${t !== 'principal' && ultima ? ' disabled title="Tiene que quedar al menos una trama principal"' : ''}>${esc(T.ETIQUETA[t])}</button>`).join('')}</div>
        <div class="hilo-flot-sub">Color</div>
        <div class="hilo-flot-colores">${paleta().map(c => `<button type="button" class="sw${x.color === c.id ? ' on' : ''}" data-flot-lcolor="${c.id}" style="background:var(--t-${c.id})" title="${esc(c.label)}" aria-label="${esc(c.label)}"></button>`).join('')}</div>
        <div class="hilo-flot-pie"><span>${nodos} ${esc(m.nombre('nodo').toLowerCase())}${nodos === 1 ? '' : 's'}</span><span class="spacer"></span>
          <button type="button" class="btn" data-flot-ocultar title="Se esconde con sus nodos y sus notas; se devuelve desde «ocultas», en el esquema">Ocultar</button>
          <button type="button" class="btn${x.cortada ? ' on' : ''}" data-flot-cortar>${x.cortada ? 'Descartada ✓' : 'Descartar'}</button></div>`;
    } else {
      const i = m.datos.actos.indexOf(x), ef = T.fondoEfectivo(x, i);
      cuerpo = `<div class="hilo-flot-sub" data-flot-ancho-rot>Ancho: ${x.celdas} ${x.celdas === 1 ? 'columna' : 'columnas'}</div>
        <input type="range" class="hilo-flot-rango" data-flot-ancho min="${T.MIN_CELDAS || 1}" max="${m.anchoMaximo(x.id)}" step="1" value="${x.celdas}">
        <div class="hilo-flot-sub">Fondo</div>
        <div class="hilo-flot-fondos">${T.FONDOS.map(f => `<button type="button" class="sw${ef === f.id ? ' on' : ''}${f.id === 'ninguno' ? ' ninguno' : ''}" data-flot-fondo="${f.id}"
          style="${f.id === 'ninguno' ? '' : `background:var(--f-${f.id})`}" title="${esc(f.label)}${!x.fondo && ef === f.id ? ' (automático)' : ''}" aria-label="${esc(f.label)}"></button>`).join('')}</div>
        <div class="hilo-flot-pie"><span>${x.celdas === 1 ? 'Columna ' + (x.desde + 1) : 'Columnas ' + (x.desde + 1) + '–' + (x.desde + x.celdas)} · ${i + 1} de ${m.datos.actos.length}</span></div>`;
    }
    const nom = m.nombre(esLinea ? 'linea' : 'acto');
    el.innerHTML = `<header class="hilo-flot-cab"><span class="hilo-flot-rot"></span><span class="spacer"></span>${botonEnlace()}
        ${borrar ? `<button type="button" class="icono peligro" data-flot-borrar title="Eliminar ${esc(nom.toLowerCase())}">${ICONO_BORRAR}</button>` : ''}
        <button type="button" class="icono" data-flot-cerrar title="Cerrar (Esc)" aria-label="Cerrar">${ICONO_CERRAR}</button></header>
      <input type="text" class="hilo-flot-tit" data-flot-tit placeholder="Nombre" aria-label="Nombre">
      ${cuerpo}`;
    el.querySelector('.hilo-flot-rot').textContent = nom;
    const tit = el.querySelector('[data-flot-tit]');
    tit.value = x.nombre || '';
    tit.addEventListener('input', () => { if (esLinea) m.editarLinea(x.id, { nombre: tit.value }); else m.editarActo(x.id, { nombre: tit.value }); cambio(); });
    tit.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); cerrarYVolver(); } });
    const rango = el.querySelector('[data-flot-ancho]');
    if (rango) rango.addEventListener('input', () => {
      m.fijarAncho(x.id, +rango.value);
      el.querySelector('[data-flot-ancho-rot]').textContent = 'Ancho: ' + x.celdas + (x.celdas === 1 ? ' columna' : ' columnas');
      cambio();
    });
  }
  /* tras un cambio de estructura (una nota o un nodo nuevos o borrados): repintar lo de fuera y el panel, junto a lo suyo */
  function rehacer(foco) {
    cambio();
    const a = ctx.anclaDe && ctx.anclaDe(que);
    pintar(); if (a) colocar(a);
    if (ctx.marcar) ctx.marcar(que);
    enfocar(foco);
  }
  async function clic(e) {
    const m = ctx && ctx.modelo && ctx.modelo(); if (!m || !que) return;
    if (e.target.closest('[data-flot-cerrar]')) { cerrarYVolver(); return; }
    if (e.target.closest('[data-flot-enlace]')) { if (ctx.copiarEnlace) ctx.copiarEnlace(que); return; }
    const en = e.target.closest('[data-flot-enlace-nota]');
    if (en) { if (ctx.copiarEnlace) ctx.copiarEnlace({ tipo: 'nota', id: en.closest('[data-flot-nota]').dataset.flotNota }); return; }
    const pick = e.target.closest('[data-flot-pick]'), menu = menuColor();
    if (pick && menu) {
      const para = menu.dataset.para, c = pick.dataset.flotPick || null;
      if (!para) { if (que.tipo === 'nodo') m.editarPunto(que.id, { color: c }); } else m.colorearNota(para, c);
      cerrarMenu(); pintarColores(m);
      el.querySelectorAll('.hilo-flot-colores').forEach(fila => fila.querySelectorAll('.sw').forEach(b => {   // la fila de lo recién creado, a la par
        const d = b.dataset.flotColor ?? b.dataset.c; const suyo = !para ? b.hasAttribute('data-flot-color') : b.dataset.flotColorNota === para;
        if (suyo) b.classList.toggle('on', (d || null) === c);
      }));
      cambio(); return;
    }
    const mc = e.target.closest('[data-flot-menu-color]');
    if (mc) { if (menu && menu.dataset.para === mc.dataset.flotMenuColor) cerrarMenu(); else abrirMenu(mc); return; }
    if (menu && !menu.contains(e.target)) cerrarMenu();
    if (que.tipo === 'linea' || que.tipo === 'acto') {
      const T = window.Tramas, id = que.id, b = s => e.target.closest(s);
      if (b('[data-flot-borrar]')) { if (que.tipo === 'linea') T.tablero.borrarLinea(id); else T.tablero.borrarActo(id); return; }
      const tp = b('[data-flot-tipo]');
      if (tp) { const r = m.fijarTipo(id, tp.dataset.flotTipo); avisar(r.aviso); cambio(); pintar(); return; }
      const lc = b('[data-flot-lcolor]');
      if (lc) { m.editarLinea(id, { color: lc.dataset.flotLcolor }); lc.parentElement.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', x === lc)); cambio(); return; }
      if (b('[data-flot-cortar]')) { m.descartarLinea(id); cambio(); pintar(); return; }
      if (b('[data-flot-ocultar]')) { cerrar(); if (T.tablero.ocultarLinea(id)) cambio(); return; }   // se esconde con todo lo suyo (1.1.40)
      const fo = b('[data-flot-fondo]');
      if (fo) { m.editarActo(id, { fondo: fo.dataset.flotFondo || null }); fo.parentElement.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', x === fo)); cambio(); return; }
      return;
    }
    const cp = e.target.closest('[data-flot-color]');
    if (cp && que.tipo === 'nodo') {
      m.editarPunto(que.id, { color: cp.dataset.flotColor || null });
      cp.parentElement.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', b === cp));
      pintarColores(m); cambio(); return;
    }
    const cn = e.target.closest('[data-flot-color-nota]');
    if (cn) {
      m.colorearNota(cn.dataset.flotColorNota, cn.dataset.c || null);
      cn.parentElement.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', b === cn));
      pintarColores(m); cambio(); return;
    }
    if (e.target.closest('[data-flot-nueva-nota]')) { nuevaNota(); return; }
    const bn = e.target.closest('[data-flot-borrar-nota]');
    if (bn) {
      const id = bn.closest('[data-flot-nota]').dataset.flotNota, n = m.nota(id); if (!n) return;
      if (!await confirmar('¿Eliminar la nota «' + ((n.texto || 'Nota').trim().slice(0, 40)) + '»?', 'Eliminar')) return;
      const antes = instantanea();
      m.borrarNota(id); rehacer();
      avisar('Nota eliminada', deshacer(antes));
      return;
    }
    if (e.target.closest('[data-flot-borrar]') && que.tipo === 'nodo') {
      const p = m.punto(que.id); if (!p) return;
      /* las notas que se van con él: las suyas y las de los enlaces que llegan o salen de él (como en el tablero) */
      const s = m.saltoDe(p.id), nn = m.datos.notas.filter(x => !x.abierta && (x.deId === p.id || x.aId === p.id)).length;
      const conNotas = nn ? (nn === 1 ? ' Se va también 1 nota.' : ' Se van también ' + nn + ' notas.') : '';
      const texto = (s ? '¿Eliminar «' + (p.titulo || m.forma(s.tipo)) + '»? Es ' + m.forma(s.tipo).toLowerCase() + ': se van sus dos extremos.' : '¿Eliminar «' + (p.titulo || 'el nodo') + '»?') + conNotas;
      if (!await confirmar(texto, 'Eliminar')) return;
      const antes = instantanea();
      const r = m.borrarPunto(p.id); if (!r.ok) { avisar(r.aviso); return; }
      cerrarYVolver(); cambio();
      avisar(r.aviso || ((s ? m.forma(s.tipo) : m.nombre('nodo')) + ' eliminado'), deshacer(antes));
      return;
    }
    if (e.target.closest('[data-flot-nuevo-nodo]') && que.tipo === 'lugar') {
      const p = nodoEn(m, que.lugar); if (!p) return;
      que = { tipo: 'nodo', id: p.id, nuevo: true }; nuevas = new Set();
      rehacer('titulo');
    }
  }
  /* se cierra con Esc, con un clic fuera (lo que el contexto diga que es «dentro» no cuenta) o al cambiar de sitio */
  /* con `pointerdown` y no `mousedown` (1.1.38, Leo: «cuando termino de escribir en el panel flotante y le doy clic fuera, se debe
     cerrar el panel y guardar el contenido»): el tablero cancela el `pointerdown` y entonces el navegador no manda el `mousedown`, así
     que un clic en el tablero no lo cerraba. Lo escrito ya está en el modelo (cada tecla); al cerrar se avisa una vez más para que se
     repinte y se guarde ya. Un clic en la hoja del editor llega al documento del marco: también se oye ahí. */
  function fuera(e) {
    const t = e.target;
    if (!que || (el && el.contains(t)) || (t && t.closest && t.closest('#dlg')) || (ctx && ctx.dentro && ctx.dentro(t))) return;
    cerrar();
  }
  document.addEventListener('pointerdown', fuera, true);
  const oidos = new WeakSet();
  function oirMarco() {
    const f = document.getElementById('editorMarco'), d = f && f.contentDocument;
    if (!d || oidos.has(d)) return;
    oidos.add(d); d.addEventListener('pointerdown', fuera, true);
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && que && !document.querySelector('#dlg[open]')) cerrarYVolver(); });

  C.flotante = { abrir, abrirNota, cerrar, refrescar, abierto: () => que, igual: q => mismoQue(que, q) && (que.marca || null) === (q.marca || null),
    mismoLugar, sitioDeNota, contexto: () => ctx, colocar: a => colocar(a) };
})(window.Claquedraw = window.Claquedraw || {});
